// Ejecuta Claude Code en modo no interactivo dentro de la carpeta del proyecto
// y registra tokens, costo y créditos de cada ejecución.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rutaProyecto, leerProyecto, guardarProyecto } from './store.js';

const RAIZ_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BASE_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'Skill', 'TodoWrite',
  'Bash(npx hyperframes:*)', 'Bash(npx skills:*)', 'Bash(ffmpeg:*)', 'Bash(ffprobe:*)', 'Bash(node:*)',
  'Bash(mkdir:*)', 'Bash(ls:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(cat:*)', 'Bash(curl:*)', 'Bash(whisper:*)',
];

// Los MCP pueden estar agregados a mano en Claude Code ("Higgsfield", "epidemic-sound") o
// sincronizados desde los conectores de claude.ai ("claude_ai_Higgsfield", ...). Se detectan con
// `claude mcp list` y se combinan con estos nombres conocidos.
const CONOCIDOS = {
  higgsfield: ['mcp__Higgsfield', 'mcp__claude_ai_Higgsfield'],
  epidemic: ['mcp__epidemic-sound', 'mcp__claude_ai_Epidemic_Sound'],
};

// En storyboard Higgsfield solo puede consultar y cotizar: generar está bloqueado por diseño.
const HIGGSFIELD_LECTURA = [
  'balance', 'models_explore', 'get_workflow_instructions', 'get_workflow_bundle_file', 'get_preset_instructions',
  'get_presets', 'ads_studio_quote', 'ai_influencer_prepare', 'list_voices', 'show_medias', 'video_analysis_create',
  'video_analysis_status', 'media_upload', 'media_confirm', 'media_import_url',
];
// Epidemic Sound: buscar es gratis y se permite en storyboard; descargar y editar solo al producir.
const EPIDEMIC_LECTURA = ['SearchRecordings', 'SearchSimilarToRecording', 'SearchExternalReferences', 'SearchSoundEffects', 'SearchSimilarToSoundEffect', 'ListVoices'];

// Convierte un nombre de `claude mcp list` en el prefijo de sus herramientas: "claude.ai Higgsfield" -> "mcp__claude_ai_Higgsfield".
export const prefijoMcp = (nombre) => `mcp__${nombre.trim().replace(/[^A-Za-z0-9_-]/g, '_')}`;

export function servidoresDesdeLista(salida) {
  const encontrados = { higgsfield: new Set(CONOCIDOS.higgsfield), epidemic: new Set(CONOCIDOS.epidemic) };
  for (const linea of String(salida).split('\n')) {
    const nombre = linea.match(/^([^:]+):\s/)?.[1];
    if (!nombre) continue;
    if (/higgsfield/i.test(nombre)) encontrados.higgsfield.add(prefijoMcp(nombre));
    if (/epidemic/i.test(nombre)) encontrados.epidemic.add(prefijoMcp(nombre));
  }
  return { higgsfield: [...encontrados.higgsfield], epidemic: [...encontrados.epidemic] };
}

let cacheServidores = null;
async function servidoresMcp(claude) {
  if (cacheServidores && Date.now() - cacheServidores.t < 10 * 60 * 1000) return cacheServidores.v;
  const salida = await new Promise((resolve) => {
    execFile(claude, ['mcp', 'list'], { timeout: 45000 }, (_e, stdout) => resolve(stdout || ''));
  });
  cacheServidores = { t: Date.now(), v: servidoresDesdeLista(salida) };
  return cacheServidores.v;
}

const DEFECTO = {
  claude: 'claude',
  permissionMode: 'acceptEdits',
  modelos: { digerir: 'haiku' },
  herramientasExtra: [],
};

export async function config() {
  try {
    const local = JSON.parse(await fs.readFile(path.join(RAIZ_APP, 'config.local.json'), 'utf8'));
    return { ...DEFECTO, ...local, modelos: { ...DEFECTO.modelos, ...local.modelos } };
  } catch {
    return DEFECTO;
  }
}

const trabajos = new Map(); // clave `${slug}:${id}` -> { proceso, inicio }

export const enCurso = (slug, id) => trabajos.has(`${slug}:${id}`);

export function herramientasPara(fase, extra = [], motor = 'auto', servidores = CONOCIDOS) {
  if (fase === 'digerir') return [...BASE_TOOLS, ...extra];
  const lectura = (srvs, tools) => srvs.flatMap((srv) => tools.map((t) => `${srv}__${t}`));
  const musica = fase === 'storyboard' ? lectura(servidores.epidemic, EPIDEMIC_LECTURA) : servidores.epidemic;
  // Con "Solo HyperFrames" Higgsfield queda fuera en todas las fases: el pedido no puede gastar créditos.
  if (motor === 'hyperframes') return [...BASE_TOOLS, ...musica, ...extra];
  const higgs = fase === 'storyboard' ? lectura(servidores.higgsfield, HIGGSFIELD_LECTURA) : servidores.higgsfield;
  return [...BASE_TOOLS, ...higgs, ...musica, ...extra];
}

/**
 * Lanza una ejecución. `alTerminar(resultado)` recibe { ok, costoUsd, tokens, texto }.
 */
export async function ejecutar({ slug, id, fase, prompt, modelo, motor, carpetaRegistro, alTerminar }) {
  const clave = `${slug}:${id}`;
  if (trabajos.has(clave)) throw new Error('Ya hay una ejecución en curso para este pedido');
  const cfg = await config();
  const cwd = rutaProyecto(slug);
  await fs.mkdir(carpetaRegistro, { recursive: true });
  const registro = createWriteStream(path.join(carpetaRegistro, 'registro.txt'), { flags: 'a' });
  const sello = () => new Date().toLocaleTimeString('es');
  registro.write(`\n===== ${new Date().toISOString()} · fase ${fase} · modelo ${modelo}${motor ? ` · motor ${motor}` : ''} =====\n`);

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--model', modelo,
    '--permission-mode', cfg.permissionMode,
    '--allowedTools', herramientasPara(fase, cfg.herramientasExtra, motor, fase === 'digerir' ? CONOCIDOS : await servidoresMcp(cfg.claude)).join(','),
  ];
  let proceso;
  try {
    proceso = spawn(cfg.claude, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    registro.end(`No se pudo iniciar Claude Code: ${e.message}\n`);
    throw e;
  }
  trabajos.set(clave, { proceso, inicio: Date.now(), fase });

  const resultado = { ok: false, costoUsd: 0, tokens: { entrada: 0, salida: 0, cache: 0 }, texto: '' };
  let resto = '';
  proceso.stdout.on('data', (buf) => {
    resto += buf.toString();
    const lineas = resto.split('\n');
    resto = lineas.pop();
    for (const linea of lineas) {
      if (!linea.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(linea);
      } catch {
        registro.write(linea + '\n');
        continue;
      }
      if (ev.type === 'assistant') {
        for (const c of ev.message?.content || []) {
          if (c.type === 'text' && c.text.trim()) registro.write(`[${sello()}] ${c.text.trim()}\n`);
          if (c.type === 'tool_use') registro.write(`[${sello()}] → ${c.name} ${resumenEntrada(c.input)}\n`);
        }
      } else if (ev.type === 'result') {
        resultado.ok = !ev.is_error;
        resultado.texto = ev.result || '';
        resultado.costoUsd = ev.total_cost_usd || 0;
        const u = ev.usage || {};
        resultado.tokens = {
          entrada: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0),
          salida: u.output_tokens || 0,
          cache: u.cache_read_input_tokens || 0,
        };
        registro.write(`[${sello()}] ✔ Terminado. ${resultado.texto}\n`);
      }
    }
  });
  proceso.stderr.on('data', (b) => registro.write(`[stderr] ${b}`));
  proceso.on('error', (e) => registro.write(`No se pudo ejecutar "${cfg.claude}": ${e.message}. ¿Está instalado Claude Code?\n`));
  proceso.on('close', async (code) => {
    trabajos.delete(clave);
    if (code !== 0) resultado.ok = false;
    registro.end(`===== fin (código ${code}) =====\n`);
    try {
      await alTerminar?.(resultado);
    } catch (e) {
      console.error('Error al cerrar ejecución', e);
    }
  });
}

export function detener(slug, id) {
  const t = trabajos.get(`${slug}:${id}`);
  if (!t) return false;
  t.proceso.kill('SIGTERM');
  return true;
}

function resumenEntrada(input = {}) {
  const v = input.file_path || input.command || input.prompt || input.pattern || input.url || '';
  return String(v).replace(/\s+/g, ' ').slice(0, 140);
}

// Suma los créditos registrados por Claude en creditos.json al historial del proyecto.
export async function registrarCreditos(slug, pedidoId) {
  let lista = [];
  try {
    lista = JSON.parse(await fs.readFile(rutaProyecto(slug, 'pedidos', pedidoId, 'creditos.json'), 'utf8'));
  } catch {
    return 0;
  }
  if (!Array.isArray(lista)) return 0;
  const total = lista.reduce((s, g) => s + (Number(g.creditos) || 0), 0);
  const p = await leerProyecto(slug);
  p.gastos = (p.gastos || []).filter((g) => g.pedido !== pedidoId);
  if (total) p.gastos.push({ fecha: new Date().toISOString(), pedido: pedidoId, creditos: total, detalle: lista });
  await guardarProyecto(slug, p);
  return total;
}
