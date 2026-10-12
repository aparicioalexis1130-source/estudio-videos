// Almacenamiento en disco: cada proyecto es una carpeta legible dentro de ESPACIOS.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ESPACIOS = path.resolve(process.env.ESTUDIO_DIR || path.join(RAIZ_APP, 'espacios'));

// Secciones de contexto con carpeta propia. El orden es el de la interfaz.
export const SECCIONES = {
  identidad: { titulo: 'Identidad visual', acepta: 'image/*,.pdf,.svg,.ttf,.otf,.woff,.woff2,.zip' },
  guiones: { titulo: 'Guiones', acepta: '.txt,.md,.pdf,.docx,.doc,.srt' },
  voces: { titulo: 'Voces en off', acepta: 'audio/*,video/*' },
  referentes: { titulo: 'Referentes', acepta: 'video/*,image/*,.gif' },
  material: { titulo: 'Material propio', acepta: 'image/*,video/*' },
  musica: { titulo: 'Música y efectos', acepta: 'audio/*' },
};
const CARPETAS = [...Object.keys(SECCIONES), 'webs', 'pedidos', 'salidas', 'resumenes'];

export function slugify(texto) {
  return (
    String(texto)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'proyecto'
  );
}

export function nombreSeguro(nombre) {
  const ext = path.extname(nombre).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = slugify(path.basename(nombre, path.extname(nombre)));
  return `${base}${ext}`;
}

// Resuelve una ruta dentro de un proyecto sin permitir salir de él.
export function rutaProyecto(slug, ...partes) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Proyecto inválido');
  const base = path.join(ESPACIOS, slug);
  const destino = path.resolve(base, ...partes);
  if (destino !== base && !destino.startsWith(base + path.sep)) throw new Error('Ruta inválida');
  return destino;
}

const existe = (p) =>
  fs.access(p).then(
    () => true,
    () => false,
  );

export function proyectoVacio(nombre) {
  return {
    nombre,
    descripcion: '',
    color: '#6d5efc',
    creado: new Date().toISOString(),
    identidad: { colores: [], tipografias: [], estilo: '', notas: '' },
    requerimientos: { publico: '', plataformas: [], tono: '', evitar: '', notas: '' },
    presupuesto: { modo: 'equilibrado', topeCreditosMes: 200 },
    webs: [],
    referentes: [],
    gastos: [],
  };
}

export async function listarProyectos() {
  await fs.mkdir(ESPACIOS, { recursive: true });
  const entradas = await fs.readdir(ESPACIOS, { withFileTypes: true });
  const lista = [];
  for (const e of entradas) {
    if (!e.isDirectory()) continue;
    try {
      const p = await leerProyecto(e.name);
      const pedidos = await listarPedidos(e.name);
      lista.push({ ...resumenProyecto(e.name, p), pedidos: pedidos.length });
    } catch {
      // Carpeta sin proyecto.json: se ignora.
    }
  }
  return lista.sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
}

function resumenProyecto(slug, p) {
  return {
    slug,
    nombre: p.nombre,
    descripcion: p.descripcion,
    color: p.color,
    colores: p.identidad?.colores || [],
    actualizado: p.actualizado || p.creado,
    creditosGastados: (p.gastos || []).reduce((s, g) => s + (Number(g.creditos) || 0), 0),
  };
}

export async function crearProyecto(nombre, plantillaClaude) {
  await fs.mkdir(ESPACIOS, { recursive: true });
  let slug = slugify(nombre);
  let n = 2;
  while (await existe(path.join(ESPACIOS, slug))) slug = `${slugify(nombre)}-${n++}`;
  for (const c of CARPETAS) await fs.mkdir(rutaProyecto(slug, c), { recursive: true });
  await guardarProyecto(slug, proyectoVacio(nombre));
  await fs.writeFile(rutaProyecto(slug, 'CLAUDE.md'), plantillaClaude);
  return slug;
}

export async function leerProyecto(slug) {
  return JSON.parse(await fs.readFile(rutaProyecto(slug, 'proyecto.json'), 'utf8'));
}

export async function guardarProyecto(slug, datos) {
  datos.actualizado = new Date().toISOString();
  await fs.writeFile(rutaProyecto(slug, 'proyecto.json'), JSON.stringify(datos, null, 2));
  return datos;
}

export async function listarArchivos(slug, seccion) {
  const dir = rutaProyecto(slug, seccion);
  await fs.mkdir(dir, { recursive: true });
  const salida = [];
  async function recorrer(d, rel) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await recorrer(path.join(d, e.name), r);
      else {
        const st = await fs.stat(path.join(d, e.name));
        salida.push({ nombre: r, ruta: `${seccion}/${r}`, bytes: st.size, fecha: st.mtime.toISOString(), tipo: tipoDe(e.name) });
      }
    }
  }
  await recorrer(dir, '');
  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function tipoDe(nombre) {
  const ext = path.extname(nombre).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'].includes(ext)) return 'imagen';
  if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (['.txt', '.md', '.srt', '.json', '.html'].includes(ext)) return 'texto';
  return 'otro';
}

export async function borrarArchivo(slug, rutaRel) {
  const [seccion] = rutaRel.split('/');
  if (!CARPETAS.includes(seccion) || seccion === 'pedidos') throw new Error('No se puede borrar aquí');
  await fs.rm(rutaProyecto(slug, rutaRel));
}

export async function listarPedidos(slug) {
  const dir = rutaProyecto(slug, 'pedidos');
  if (!(await existe(dir))) return [];
  const lista = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try {
      lista.push(JSON.parse(await fs.readFile(path.join(dir, e.name, 'pedido.json'), 'utf8')));
    } catch {
      // Pedido incompleto.
    }
  }
  return lista.sort((a, b) => b.creado.localeCompare(a.creado));
}

export async function leerPedido(slug, id) {
  return JSON.parse(await fs.readFile(rutaProyecto(slug, 'pedidos', id, 'pedido.json'), 'utf8'));
}

export async function guardarPedido(slug, pedido) {
  pedido.actualizado = new Date().toISOString();
  await fs.mkdir(rutaProyecto(slug, 'pedidos', pedido.id), { recursive: true });
  await fs.writeFile(rutaProyecto(slug, 'pedidos', pedido.id, 'pedido.json'), JSON.stringify(pedido, null, 2));
  return pedido;
}

export async function leerTexto(slug, ...partes) {
  try {
    return await fs.readFile(rutaProyecto(slug, ...partes), 'utf8');
  } catch {
    return null;
  }
}
