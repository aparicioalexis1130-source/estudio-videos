// Ficha de contexto del proyecto y prompts de cada fase.
// La ficha es compacta a propósito: es lo único que Claude lee siempre.
import fs from 'node:fs/promises';
import { SECCIONES, listarArchivos, leerProyecto, rutaProyecto, leerTexto } from './store.js';
import { categoria, MODOS } from './rutas.js';

const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export async function generarFicha(slug) {
  const p = await leerProyecto(slug);
  const l = [];
  l.push(`# Ficha de contexto: ${p.nombre}`, '');
  l.push('> Generada automáticamente desde la interfaz. Léela antes de cualquier pedido; abre los archivos originales solo si el pedido los usa.', '');
  if (p.descripcion) l.push(p.descripcion, '');

  // Solo se escriben las secciones con contenido, para que la ficha sea lo más corta posible.
  const seccion = (titulo, items) => {
    const llenos = items.filter(Boolean);
    if (llenos.length) l.push(titulo, ...llenos, '');
  };
  const id = p.identidad || {};
  const lineasId = [];
  if (id.colores?.length) lineasId.push(`- Colores: ${id.colores.map((c) => `${c.hex}${c.nombre ? ` (${c.nombre})` : ''}`).join(', ')}`);
  if (id.tipografias?.length) lineasId.push(`- Tipografías: ${id.tipografias.join(', ')}`);
  if (id.estilo) lineasId.push(`- Estilo visual: ${id.estilo}`);
  if (id.notas) lineasId.push(`- Notas: ${id.notas}`);
  seccion('## Identidad visual', lineasId);

  const r = p.requerimientos || {};
  seccion('## Requerimientos', [
    r.publico && `- Público: ${r.publico}`,
    r.plataformas?.length && `- Plataformas: ${r.plataformas.join(', ')}`,
    r.tono && `- Tono: ${r.tono}`,
    r.evitar && `- Evitar: ${r.evitar}`,
    r.notas && `- Notas: ${r.notas}`,
  ]);

  if (p.webs?.length) {
    l.push('## Webs analizadas');
    for (const w of p.webs) {
      l.push(`- ${w.url}${w.titulo ? ` — ${w.titulo}` : ''}`);
      if (w.descripcion) l.push(`  - Descripción: ${w.descripcion}`);
      if (w.colores?.length) l.push(`  - Colores detectados: ${w.colores.slice(0, 8).join(', ')}`);
      if (w.fuentes?.length) l.push(`  - Fuentes detectadas: ${w.fuentes.slice(0, 5).join(', ')}`);
      if (w.nota) l.push(`  - Nota: ${w.nota}`);
    }
    l.push('');
  }

  if (p.referentes?.length) {
    l.push('## Referentes (links)');
    for (const ref of p.referentes) l.push(`- ${ref.url}${ref.nota ? ` — ${ref.nota}` : ''}`);
    l.push('');
  }

  l.push('## Archivos disponibles');
  for (const [sec, info] of Object.entries(SECCIONES)) {
    const archivos = await listarArchivos(slug, sec);
    if (!archivos.length) continue;
    l.push(`### ${info.titulo}`);
    for (const a of archivos) {
      const resumen = await leerTexto(slug, 'resumenes', `${a.ruta.replace(/\//g, '__')}.md`);
      l.push(`- \`${a.ruta}\` (${kb(a.bytes)})${resumen ? `: ${resumen.trim().split('\n').join(' ').slice(0, 300)}` : ''}`);
    }
  }
  l.push('');
  const texto = l.join('\n');
  await fs.writeFile(rutaProyecto(slug, 'contexto.md'), texto);
  return texto;
}

// Archivos que todavía no tienen resumen (para digerirlos una sola vez).
export async function archivosSinResumen(slug) {
  const pendientes = [];
  for (const sec of ['identidad', 'guiones', 'voces', 'referentes']) {
    for (const a of await listarArchivos(slug, sec)) {
      const r = await leerTexto(slug, 'resumenes', `${a.ruta.replace(/\//g, '__')}.md`);
      if (!r) pendientes.push(a.ruta);
    }
  }
  return pendientes;
}

export function promptDigerir(pendientes) {
  return `Tarea: digerir material nuevo del proyecto (una sola vez, para ahorrar tokens en pedidos futuros).

Para cada archivo de esta lista, escribe un resumen de máximo 3 líneas en \`resumenes/<ruta con / reemplazado por __>.md\`:
${pendientes.map((p) => `- ${p}`).join('\n')}

Qué anotar según el tipo:
- Manual de marca / logo / imagen de identidad: colores (hex), tipografías, estilo, reglas de uso.
- Guion: tema, duración estimada, estructura y gancho inicial.
- Voz en off (audio/video): transcribe con la herramienta disponible más barata (whisper local si existe o \`npx hyperframes\` media-use); resume duración, tono y transcripción breve. Si no puedes transcribir, anota duración con ffprobe.
- Referente (video/imagen): estilo visual, ritmo, recursos gráficos destacables. Para videos, extrae 3 fotogramas con ffmpeg y míralos; no analices el video completo.

No generes nada con Higgsfield. No modifiques otros archivos. Responde al final con una línea por archivo.`;
}

function bloqueBase(slug, pedido) {
  const cat = categoria(pedido.categoria);
  const modo = MODOS[pedido.modo] || MODOS.equilibrado;
  const l = [];
  l.push(`Pedido ${pedido.id} — ${cat.titulo}`);
  l.push('');
  l.push('Contexto: lee primero `contexto.md` (ficha del proyecto) y `CLAUDE.md` (reglas de trabajo). No leas archivos que el pedido no menciona.');
  l.push('');
  l.push('## El pedido');
  l.push(`- Objetivo: ${pedido.objetivo || '(sin especificar)'}`);
  if (pedido.mensaje) l.push(`- Mensaje / texto clave: ${pedido.mensaje}`);
  l.push(`- Formato: ${pedido.formato}${pedido.duracion ? ` · Duración: ${pedido.duracion} s` : ''}`);
  if (pedido.plataformas?.length) l.push(`- Plataformas: ${pedido.plataformas.join(', ')}`);
  if (pedido.archivos?.length) l.push(`- Archivos a usar: ${pedido.archivos.map((a) => `\`${a}\``).join(', ')}`);
  if (pedido.estilo) {
    l.push(`- Estilo de referencia elegido de la galería (@${pedido.estilo.autor}, ${pedido.estilo.categoria}, técnica: ${pedido.estilo.tecnica}):`);
    l.push('```text', pedido.estilo.prompt.slice(0, 1500), '```');
  }
  if (pedido.notas) l.push(`- Notas: ${pedido.notas}`);
  l.push('');
  l.push('## Ruta de trabajo');
  l.push(`- Flujo de HyperFrames: \`/${cat.hyperframes.split(' ')[0]}\` (entra por \`/hyperframes\` si hace falta, pero no explores otros flujos).`);
  l.push(`- Higgsfield: ${cat.higgsfield}`);
  l.push(`- Modo de presupuesto: ${modo.titulo}. Tope de créditos de Higgsfield para este pedido: ${pedido.topeCreditos}.`);
  l.push(`- Carpeta de trabajo: \`pedidos/${pedido.id}/\`. Entregables finales en \`salidas/${pedido.id}/\`.`);
  return l.join('\n');
}

export function promptStoryboard(slug, pedido) {
  return `${bloqueBase(slug, pedido)}

## Fase actual: STORYBOARD (sin gastar créditos)
1. Escribe \`pedidos/${pedido.id}/storyboard.md\` con:
   - Idea central y gancho de los primeros 2 segundos.
   - Tabla de escenas: n.º, duración, qué se ve, texto en pantalla, audio, técnica (HyperFrames / material propio / Higgsfield + modelo).
   - Estimación de créditos de Higgsfield por escena y total. Usa las herramientas de cotización (quote/prepare/models_explore) cuando existan; si no, estima y dilo.
   - Riesgos o datos que faltan.
2. Si aporta, crea la composición base de HyperFrames en \`pedidos/${pedido.id}/composicion/\` y saca 2-3 fotogramas con \`npx hyperframes snapshot\` en \`pedidos/${pedido.id}/previas/\` (es gratis).
3. Escribe \`pedidos/${pedido.id}/estimacion.json\` con {"creditos": número, "escenas": número, "resumen": "una línea"}.
NO generes imágenes, videos ni audio con Higgsfield en esta fase. Termina con un resumen de 3 líneas.`;
}

export function promptProduccion(slug, pedido, comentarios) {
  return `${bloqueBase(slug, pedido)}

## Fase actual: PRODUCCIÓN (storyboard aprobado)
Sigue \`pedidos/${pedido.id}/storyboard.md\`, que el usuario aprobó.${comentarios ? `\nComentarios del usuario al aprobar: ${comentarios}` : ''}
1. Genera solo lo que el storyboard marca como Higgsfield, respetando el tope de ${pedido.topeCreditos} créditos. Si algo se pasaría del tope, no lo generes: usa una alternativa con código o material propio y anótalo.
2. Orden barato primero: imagen → revisar → imagen a video. Borradores en resolución baja; upscale solo del final si el modo es Premium.
3. Guarda cada asset generado en \`pedidos/${pedido.id}/assets/\` y registra cada gasto en \`pedidos/${pedido.id}/creditos.json\` como lista de {"herramienta","creditos","descripcion"}.
4. Arma y renderiza con HyperFrames (\`npx hyperframes lint\` y \`render\`). Deja el MP4 final (y miniatura si aplica) en \`salidas/${pedido.id}/\`.
5. Termina con un resumen de 3 líneas: qué se entregó, créditos gastados y qué se podría mejorar.`;
}

export function promptAjuste(slug, pedido, cambios) {
  return `${bloqueBase(slug, pedido)}

## Fase actual: AJUSTE
El usuario pidió estos cambios sobre lo ya entregado en \`salidas/${pedido.id}/\`:
${cambios}

Reutiliza la composición y los assets existentes en \`pedidos/${pedido.id}/\`. Cambia solo lo pedido. Solo usa Higgsfield si el cambio lo exige y sin pasar el tope de ${pedido.topeCreditos} créditos (suma lo ya gastado en creditos.json). Vuelve a renderizar y termina con un resumen de 2 líneas.`;
}
