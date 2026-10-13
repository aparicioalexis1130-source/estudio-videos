// Auto postproducción: catálogo de tipos y enfoques, datos de cada trabajo,
// estimación de créditos y tokens, prompts por fragmento y exportación (CSV y EDL).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESPACIOS, rutaProyecto, slugify } from './store.js';

const RAIZ_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GENERADORES = JSON.parse(await fs.readFile(path.join(RAIZ_APP, 'data', 'generadores.json'), 'utf8'));

// ruta: hyperframes (gratis, con código) · generador (IA de video, gasta créditos) · material (clips propios, gratis).
// capa: se exporta con fondo transparente para ponerlo encima del video original.
// persona: suele mostrar a una persona (usa el rostro o el personaje del trabajo).
export const TIPOS_BASE = [
  { id: 'motion-graphic', titulo: 'Motion graphic', ruta: 'hyperframes', descripcion: 'Gráfico animado que ilustra la idea' },
  { id: 'texto-cinetico', titulo: 'Texto cinético', ruta: 'hyperframes', capa: true, descripcion: 'Las palabras clave animadas sobre el video' },
  { id: 'rotulo', titulo: 'Rótulo / lower third', ruta: 'hyperframes', capa: true, descripcion: 'Nombre, cargo o dato en el tercio inferior' },
  { id: 'dato', titulo: 'Dato o cifra animada', ruta: 'hyperframes', descripcion: 'Número grande que cuenta o crece' },
  { id: 'infografia', titulo: 'Infografía / gráfico', ruta: 'hyperframes', descripcion: 'Barras, tortas, comparaciones con datos' },
  { id: 'lista', titulo: 'Lista o pasos', ruta: 'hyperframes', descripcion: 'Puntos que aparecen uno por uno' },
  { id: 'cita', titulo: 'Cita destacada', ruta: 'hyperframes', descripcion: 'Frase textual con tipografía de marca' },
  { id: 'iconos', titulo: 'Íconos animados', ruta: 'hyperframes', descripcion: 'Íconos que representan cada concepto' },
  { id: 'mapa', titulo: 'Mapa / ubicación', ruta: 'hyperframes', descripcion: 'Mapa con ruta o punto marcado' },
  { id: 'mockup', titulo: 'Mockup de app o web', ruta: 'hyperframes', descripcion: 'Pantalla de celular o computador animada' },
  { id: 'logo', titulo: 'Logo animado', ruta: 'hyperframes', descripcion: 'Aparición del logo de la marca' },
  { id: 'linea-tiempo', titulo: 'Línea de tiempo', ruta: 'hyperframes', descripcion: 'Fechas o etapas en secuencia' },
  { id: 'comparacion', titulo: 'Antes / después', ruta: 'hyperframes', descripcion: 'Comparación lado a lado' },
  { id: 'anotaciones', titulo: 'Flechas y anotaciones', ruta: 'hyperframes', capa: true, descripcion: 'Subrayados, círculos y flechas sobre el video' },
  { id: 'stickers', titulo: 'Stickers y emojis', ruta: 'hyperframes', capa: true, descripcion: 'Elementos divertidos que entran y salen' },
  { id: 'cta', titulo: 'Llamado a la acción', ruta: 'hyperframes', descripcion: 'Botón, web o "síguenos" animado' },
  { id: 'transicion', titulo: 'Transición gráfica', ruta: 'hyperframes', descripcion: 'Cortinilla con colores de marca' },
  { id: 'b-roll', titulo: 'B-roll', ruta: 'generador', descripcion: 'Tomas de recurso que acompañan lo que se dice' },
  { id: 'toma-apoyo', titulo: 'Toma de apoyo', ruta: 'generador', descripcion: 'Plano que refuerza la idea sin ser literal' },
  { id: 'escena-literal', titulo: 'Escena literal', ruta: 'generador', persona: true, descripcion: 'Se ve exactamente lo que dice el texto' },
  { id: 'metafora', titulo: 'Metáfora visual', ruta: 'generador', descripcion: 'Imagen simbólica de la idea' },
  { id: 'personaje', titulo: 'Personaje en acción', ruta: 'generador', persona: true, descripcion: 'Una persona haciendo lo que se describe' },
  { id: 'reaccion', titulo: 'Reacción o emoción', ruta: 'generador', persona: true, descripcion: 'Cara o gesto que transmite la emoción' },
  { id: 'dramatizacion', titulo: 'Dramatización', ruta: 'generador', persona: true, descripcion: 'Mini escena actuada' },
  { id: 'producto', titulo: 'Producto en uso', ruta: 'generador', descripcion: 'El producto o servicio en contexto real' },
  { id: 'ambiente', titulo: 'Ambiente / locación', ruta: 'generador', descripcion: 'Lugar que sitúa la historia' },
  { id: 'detalle', titulo: 'Plano detalle / macro', ruta: 'generador', descripcion: 'Texturas y detalles muy de cerca' },
  { id: 'aereo', titulo: 'Toma aérea / drone', ruta: 'generador', descripcion: 'Vista desde arriba' },
  { id: 'estilizado', titulo: 'Animación 3D / estilizada', ruta: 'generador', descripcion: 'Estilo ilustrado, 3D o animado' },
  { id: 'material', titulo: 'Clip de mi material', ruta: 'material', descripcion: 'El mejor clip de tu carpeta Material propio' },
];

// Guía de encuadre por tipo: fija la estructura del prompt para que los clips salgan parecidos entre sí.
export const PLANTILLAS = {
  'b-roll': 'Plano medio o general, cámara con movimiento lento (dolly o paneo), acción cotidiana relacionada, nadie mira a cámara.',
  'toma-apoyo': 'Plano que sugiere la idea sin mostrarla literal; composición limpia con espacio negativo; movimiento sutil.',
  'escena-literal': 'Mostrar exactamente la acción del texto, de principio a fin dentro de la toma; plano medio; acción clara y legible.',
  metafora: 'Una sola imagen simbólica fuerte, centrada; movimiento lento que revela la idea; sin elementos de relleno.',
  personaje: 'La persona haciendo la acción descrita; plano medio a medio corto; cámara a la altura de los ojos; gesto natural.',
  reaccion: 'Primer plano del rostro; la emoción cambia de forma visible durante la toma; fondo desenfocado.',
  dramatizacion: 'Mini escena con inicio, acción y remate; máximo dos personas; plano medio; cámara al hombro suave.',
  producto: 'El producto como protagonista en uso real; plano medio-corto; manos en cuadro; luz que resalta texturas.',
  ambiente: 'Plano general que sitúa el lugar; movimiento de cámara amplio y lento; hora del día coherente con la biblia visual.',
  detalle: 'Macro, lente 100 mm, poca profundidad de campo, movimiento milimétrico, texturas nítidas.',
  aereo: 'Toma de drone, desplazamiento continuo hacia adelante o descendente, horizonte estable.',
  estilizado: 'Estilo 3D o ilustrado coherente con la marca; formas simples; movimiento fluido y continuo.',
};

export const ENFOQUES_BASE = [
  { id: 'anuncio', titulo: 'Publicidad / ads', descripcion: 'Persuasivo, producto protagonista, ritmo rápido y limpio' },
  { id: 'tutorial', titulo: 'Tutorial', descripcion: 'Claro y didáctico, muestra pasos y detalles' },
  { id: 'cinematografico', titulo: 'Cinematográfico', descripcion: 'Luz dramática, profundidad de campo, movimientos de cámara suaves' },
  { id: 'documental', titulo: 'Documental', descripcion: 'Natural, cámara en mano, luz real' },
  { id: 'ugc', titulo: 'UGC / testimonial', descripcion: 'Grabado con celular, cercano y auténtico' },
  { id: 'corporativo', titulo: 'Corporativo', descripcion: 'Profesional, sobrio, oficinas y equipos' },
  { id: 'educativo', titulo: 'Educativo', descripcion: 'Explicativo, diagramas y ejemplos visuales' },
  { id: 'lifestyle', titulo: 'Lifestyle', descripcion: 'Aspiracional, luz cálida, momentos cotidianos' },
  { id: 'tecnologico', titulo: 'Tecnológico', descripcion: 'Futurista, interfaces, luces frías' },
  { id: 'minimalista', titulo: 'Minimalista', descripcion: 'Pocos elementos, mucho espacio, colores planos' },
  { id: 'energetico', titulo: 'Energético', descripcion: 'Cortes rápidos, movimiento, deporte' },
  { id: 'emocional', titulo: 'Emocional', descripcion: 'Íntimo, cámara lenta, primeros planos' },
  { id: 'humor', titulo: 'Humor', descripcion: 'Exagerado, expresivo, situaciones cómicas' },
  { id: 'lujo', titulo: 'Lujo / premium', descripcion: 'Elegante, texturas ricas, luz suave' },
  { id: 'retro', titulo: 'Retro / vintage', descripcion: 'Grano de película, colores de época' },
  { id: 'noticias', titulo: 'Noticias / editorial', descripcion: 'Informativo, titulares, datos en pantalla' },
];

// Los tipos y enfoques que agrega el usuario valen para todos los proyectos.
const RUTA_CATALOGO = path.join(ESPACIOS, '.catalogo-postpro.json');

export async function leerCatalogo() {
  let extra = { tipos: [], enfoques: [] };
  try {
    extra = { ...extra, ...JSON.parse(await fs.readFile(RUTA_CATALOGO, 'utf8')) };
  } catch {
    // Sin agregados todavía.
  }
  return {
    tipos: [...TIPOS_BASE, ...extra.tipos.map((t) => ({ ...t, propio: true }))],
    enfoques: [...ENFOQUES_BASE, ...extra.enfoques.map((e) => ({ ...e, propio: true }))],
  };
}

export async function agregarAlCatalogo(clase, datos) {
  if (!['tipos', 'enfoques'].includes(clase)) throw new Error('Catálogo desconocido');
  const titulo = String(datos?.titulo || '').trim().slice(0, 60);
  if (!titulo) throw new Error('Ponle un nombre');
  const catalogo = await leerCatalogo();
  let id = slugify(titulo);
  if (catalogo[clase].some((x) => x.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  const item = { id, titulo, descripcion: String(datos.descripcion || '').trim().slice(0, 300) };
  if (clase === 'tipos') {
    item.ruta = ['hyperframes', 'generador', 'material'].includes(datos.ruta) ? datos.ruta : 'generador';
    if (datos.persona) item.persona = true;
    if (datos.capa && item.ruta === 'hyperframes') item.capa = true;
  }
  let extra = { tipos: [], enfoques: [] };
  try {
    extra = { ...extra, ...JSON.parse(await fs.readFile(RUTA_CATALOGO, 'utf8')) };
  } catch {
    // Primer agregado.
  }
  extra[clase].push(item);
  await fs.mkdir(ESPACIOS, { recursive: true });
  await fs.writeFile(RUTA_CATALOGO, JSON.stringify(extra, null, 2));
  return item;
}

export async function quitarDelCatalogo(clase, id) {
  if (!['tipos', 'enfoques'].includes(clase)) throw new Error('Catálogo desconocido');
  let extra = { tipos: [], enfoques: [] };
  try {
    extra = { ...extra, ...JSON.parse(await fs.readFile(RUTA_CATALOGO, 'utf8')) };
  } catch {
    return;
  }
  extra[clase] = extra[clase].filter((x) => x.id !== id);
  await fs.writeFile(RUTA_CATALOGO, JSON.stringify(extra, null, 2));
}

export const generador = (id) => GENERADORES.video.find((g) => g.id === id);
export const modeloImagen = (id) => GENERADORES.imagen.find((g) => g.id === id) || GENERADORES.imagen[0];
export const modeloClaude = (id) => GENERADORES.claude.find((g) => g.id === id) || GENERADORES.claude[1];

export const AJUSTES_DEFECTO = { claude: 'sonnet', video: 'kling3_0', imagen: 'nano_banana_pro', enfoque: 'anuncio', idioma: 'es', sonido: false, musica: false };

// Sonido de cada clip: "no", "efectos" (interfaz o ambiente) o "efectos-musica". null en el clip = lo que diga el ajuste general.
export const SONIDOS = { no: 'Sin sonido', efectos: 'Efectos de sonido', 'efectos-musica': 'Efectos y música' };
export function sonidoDe(f, ajustes = {}) {
  if (f.sonido && SONIDOS[f.sonido]) return f.sonido;
  const a = { ...AJUSTES_DEFECTO, ...ajustes };
  return !a.sonido ? 'no' : a.musica ? 'efectos-musica' : 'efectos';
}

// ---------- Datos del trabajo ----------

const ID_VALIDO = /^[a-z0-9-]+$/;
export function rutaTrabajo(slug, id, ...partes) {
  if (!ID_VALIDO.test(id)) throw new Error('Trabajo inválido');
  return rutaProyecto(slug, 'postpro', id, ...partes);
}

export async function leerTrabajo(slug, id) {
  return JSON.parse(await fs.readFile(rutaTrabajo(slug, id, 'postpro.json'), 'utf8'));
}

// Las escrituras de un mismo trabajo se encadenan: varios clips pueden terminar a la vez.
const colas = new Map();
export function actualizarTrabajo(slug, id, cambio) {
  const clave = `${slug}:${id}`;
  const previa = colas.get(clave) || Promise.resolve();
  const siguiente = previa.catch(() => {}).then(async () => {
    const t = await leerTrabajo(slug, id);
    const r = await cambio(t);
    t.actualizado = new Date().toISOString();
    await fs.writeFile(rutaTrabajo(slug, id, 'postpro.json'), JSON.stringify(t, null, 2));
    return r === undefined ? t : r;
  });
  colas.set(clave, siguiente);
  return siguiente;
}

export async function guardarTrabajoNuevo(slug, t) {
  await fs.mkdir(rutaTrabajo(slug, t.id), { recursive: true });
  t.actualizado = new Date().toISOString();
  await fs.writeFile(rutaTrabajo(slug, t.id, 'postpro.json'), JSON.stringify(t, null, 2));
}

export async function listarTrabajos(slug) {
  const dir = rutaProyecto(slug, 'postpro');
  let nombres = [];
  try {
    nombres = await fs.readdir(dir);
  } catch {
    return [];
  }
  const lista = [];
  for (const n of nombres) {
    if (!ID_VALIDO.test(n)) continue;
    try {
      lista.push(await leerTrabajo(slug, n));
    } catch {
      // Carpeta incompleta.
    }
  }
  return lista.sort((a, b) => b.creado.localeCompare(a.creado));
}

export function nuevoIdTrabajo() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `pp-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// ---------- Fragmentos ----------

export function textoEntre(palabras, desde, hasta) {
  return palabras
    .slice(desde, hasta + 1)
    .map((p) => p.t)
    .join(' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim();
}

// Crea o corrige un fragmento a partir de índices de palabras, validando que no se cruce con otro.
export function armarFragmento(t, datos, existente = null) {
  const palabras = t.transcripcion?.palabras || [];
  if (!palabras.length) throw new Error('El video aún no tiene transcripción');
  let desde = Number.isInteger(datos.desde) ? datos.desde : existente?.desde;
  let hasta = Number.isInteger(datos.hasta) ? datos.hasta : existente?.hasta;
  if (!Number.isInteger(desde) || !Number.isInteger(hasta)) throw new Error('Selecciona palabras de la transcripción');
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  desde = Math.max(0, desde);
  hasta = Math.min(palabras.length - 1, hasta);
  const f = existente ? { ...existente } : { id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, estado: 'pendiente', refs: [], nota: '' };
  const cambioRango = !existente || existente.desde !== desde || existente.hasta !== hasta;
  f.desde = desde;
  f.hasta = hasta;
  f.texto = textoEntre(palabras, desde, hasta);
  if (cambioRango) {
    f.inicio = palabras[desde].i;
    f.fin = palabras[hasta].f;
  }
  // Ajuste fino de entrada y salida (en segundos), dentro de la duración del video.
  const dur = t.video?.duracion || palabras.at(-1).f;
  if (datos.inicio !== undefined && Number.isFinite(Number(datos.inicio))) f.inicio = Number(datos.inicio);
  if (datos.fin !== undefined && Number.isFinite(Number(datos.fin))) f.fin = Number(datos.fin);
  f.inicio = Math.max(0, Math.round(f.inicio * 1000) / 1000);
  f.fin = Math.min(dur, Math.round(f.fin * 1000) / 1000);
  if (f.fin - f.inicio < 0.3) throw new Error('El fragmento es demasiado corto (mínimo 0,3 s)');
  for (const k of ['tipo', 'enfoque', 'nota']) if (datos[k] !== undefined) f[k] = String(datos[k] || '');
  if (datos.generador !== undefined) f.generador = datos.generador && generador(datos.generador) ? datos.generador : null;
  if (datos.persona !== undefined) f.persona = datos.persona === null ? null : !!datos.persona;
  if (datos.sonido !== undefined) f.sonido = SONIDOS[datos.sonido] ? datos.sonido : null;
  if (Array.isArray(datos.refs)) f.refs = datos.refs.filter((r) => typeof r === 'string' && /^[a-z0-9._-]+$/i.test(r)).slice(0, 6);
  const otro = (t.fragmentos || []).find((o) => o.id !== f.id && !(f.hasta < o.desde || f.desde > o.hasta));
  if (otro) throw new Error(`Se cruza con otro fragmento: "${otro.texto.slice(0, 40)}…"`);
  return f;
}

export const ordenar = (fragmentos) => [...fragmentos].sort((a, b) => a.inicio - b.inicio);

// ---------- Estimación ----------

// Divide la duración en tomas que el modelo acepta y devuelve los segundos cobrados.
export function planTomas(gen, segundos) {
  if (!gen || gen.gratis) return { tomas: 0, cobrados: 0, porToma: 0 };
  if (gen.opciones?.length) {
    const max = Math.max(...gen.opciones);
    const tomas = Math.max(1, Math.ceil(segundos / max - 1e-9));
    const cadaUna = segundos / tomas;
    const porToma = gen.opciones.find((o) => o >= cadaUna - 1e-9) || max;
    return { tomas, cobrados: tomas * porToma, porToma };
  }
  const { min = 1, max = 10 } = gen.duracion || {};
  const tomas = Math.max(1, Math.ceil(segundos / max - 1e-9));
  const porToma = Math.min(max, Math.max(min, Math.ceil(segundos / tomas - 1e-9)));
  return { tomas, cobrados: tomas * porToma, porToma };
}

// Valores iniciales de tokens por clip; se reemplazan por el promedio real cuando hay historial.
// Buscar, bajar y mezclar el sonido de un clip.
const TOKENS_SONIDO = { entrada: 8000, salida: 2000, cache: 80000 };
const TOKENS_BASE = {
  hyperframes: { entrada: 30000, salida: 9000, cache: 350000 },
  generador: { entrada: 20000, salida: 4000, cache: 200000 },
  material: { entrada: 15000, salida: 3000, cache: 150000 },
  preparar: { entrada: 12000, salida: 2000, cache: 90000 },
};

export function rutaDe(f, tipos) {
  const tipo = tipos.find((x) => x.id === f.tipo);
  if (f.generador === 'hyperframes') return 'hyperframes';
  if (f.generador && generador(f.generador)) return 'generador';
  return tipo?.ruta || 'generador';
}

export function generadorDe(f, tipos, ajustes) {
  const ruta = rutaDe(f, tipos);
  if (ruta !== 'generador') return null;
  return generador(f.generador) || generador(ajustes.video) || generador(AJUSTES_DEFECTO.video);
}

export const llevaPersona = (f, tipos) => (f.persona === null || f.persona === undefined ? !!tipos.find((x) => x.id === f.tipo)?.persona : !!f.persona);

const redondear = (n) => Math.round(n * 100) / 100;

// Promedio de tokens reales por ruta y modelo de Claude, de clips ya generados en este proyecto.
export function calibracion(trabajos) {
  const grupos = {};
  for (const t of trabajos) {
    for (const e of [...(t.fragmentos || []).map((f) => f.ejecucion), t.preparacion?.ejecucion]) {
      if (!e?.ok || !e.tokens || !e.ruta) continue;
      const k = `${e.ruta}:${e.modelo}`;
      (grupos[k] ||= []).push(e.tokens);
    }
  }
  const salida = {};
  for (const [k, lista] of Object.entries(grupos)) {
    if (lista.length < 2) continue;
    const prom = (c) => Math.round(lista.reduce((s, x) => s + (x[c] || 0), 0) / lista.length);
    salida[k] = { entrada: prom('entrada'), salida: prom('salida'), cache: prom('cache'), muestras: lista.length };
  }
  return salida;
}

export function estimar(t, catalogo, calib = {}) {
  const ajustes = { ...AJUSTES_DEFECTO, ...t.ajustes };
  const claude = modeloClaude(ajustes.claude);
  const imagen = modeloImagen(ajustes.imagen);
  const tokensDe = (ruta) => calib[`${ruta}:${claude.id}`] || TOKENS_BASE[ruta];
  const usd = (tk) => (tk.entrada * claude.entradaUsd + tk.salida * claude.salidaUsd + (tk.cache || 0) * claude.entradaUsd * 0.1) / 1e6;
  const tieneRostro = !!t.rostro;
  const filas = [];
  const avisos = [];
  let necesitaPersonaje = false;

  for (const f of ordenar(t.fragmentos || [])) {
    const ruta = rutaDe(f, catalogo.tipos);
    const gen = generadorDe(f, catalogo.tipos, ajustes);
    const segundos = Math.round((f.fin - f.inicio) * 1000) / 1000;
    const plan = planTomas(gen, segundos);
    const persona = ruta === 'generador' && llevaPersona(f, catalogo.tipos);
    let creditosImagen = 0;
    let rostroNota = '';
    if (persona) {
      necesitaPersonaje = true;
      if (gen.rostro === 'referencia') rostroNota = tieneRostro ? 'Usa tu rostro como referencia directa.' : 'Usa el personaje creado por la IA como referencia.';
      else {
        creditosImagen = imagen.creditos * plan.tomas;
        rostroNota = `${gen.nombre} no acepta una foto de referencia de rostro: primero se crea un fotograma inicial con ${tieneRostro ? 'tu rostro' : 'el personaje'} (${imagen.nombre}, +${redondear(creditosImagen)} créditos) y luego se anima.`;
      }
    }
    const creditosVideo = gen ? redondear(plan.cobrados * gen.creditosPorSegundo) : 0;
    const sonido = sonidoDe(f, ajustes);
    const base = tokensDe(ruta);
    const tk = sonido === 'no' ? base : { entrada: base.entrada + TOKENS_SONIDO.entrada, salida: base.salida + TOKENS_SONIDO.salida, cache: (base.cache || 0) + TOKENS_SONIDO.cache };
    filas.push({
      id: f.id,
      ruta,
      generador: gen?.id || (ruta === 'hyperframes' ? 'hyperframes' : null),
      generadorNombre: gen?.nombre || (ruta === 'hyperframes' ? 'HyperFrames (gratis)' : 'Mi material (gratis)'),
      segundos,
      tomas: plan.tomas,
      cobrados: plan.cobrados,
      creditosVideo,
      creditosImagen: redondear(creditosImagen),
      creditos: redondear(creditosVideo + creditosImagen),
      persona,
      rostroNota,
      sonido,
      tokens: tk.entrada + tk.salida,
      usd: usd(tk),
    });
  }

  // Preparación: biblia visual (si hay clips con IA) y tu rostro o un personaje diseñado por la IA.
  let preparacion = null;
  const hayGenerados = filas.some((x) => x.ruta === 'generador');
  const prep = t.preparacion;
  const prepHecha = prep?.estado === 'listo' && (!necesitaPersonaje || (prep.conPersona && prep.conRostro === tieneRostro));
  if (hayGenerados && !prepHecha) {
    const tk = TOKENS_BASE.preparar;
    const creaPersonaje = necesitaPersonaje && !tieneRostro;
    preparacion = {
      motivo: necesitaPersonaje
        ? tieneRostro
          ? 'Biblia visual para que todos los clips combinen, y subir tu rostro a Higgsfield'
          : 'Biblia visual para que todos los clips combinen, y diseñar un personaje (una imagen)'
        : 'Biblia visual para que todos los clips combinen',
      creditos: creaPersonaje ? imagen.creditos : 0,
      persona: necesitaPersonaje,
      tokens: tk.entrada + tk.salida,
      usd: usd(tk),
    };
  }
  if (necesitaPersonaje && !tieneRostro) avisos.push('No subiste un rostro: la IA creará un personaje y lo usará en todos los clips con persona para que sea el mismo.');

  const totales = {
    creditos: redondear(filas.reduce((s, x) => s + x.creditos, 0) + (preparacion?.creditos || 0)),
    tokens: filas.reduce((s, x) => s + x.tokens, 0) + (preparacion?.tokens || 0),
    usd: filas.reduce((s, x) => s + x.usd, 0) + (preparacion?.usd || 0),
    gratis: filas.filter((x) => x.ruta !== 'generador').length,
    pagos: filas.filter((x) => x.ruta === 'generador').length,
    segundosGenerados: redondear(filas.reduce((s, x) => s + x.cobrados, 0)),
  };
  const calibrado = Object.keys(calib).some((k) => k.endsWith(`:${claude.id}`));
  return { filas, preparacion, totales, avisos, claude: claude.nombre, calibrado, consultado: GENERADORES.consultado };
}

// ---------- Exportación ----------

export function fpsEntero(fps) {
  return Math.max(1, Math.round(fps || 30));
}

export function timecode(segundos, fps, separador = ':') {
  const f = fpsEntero(fps);
  const total = Math.round(segundos * f);
  const z = (n) => String(n).padStart(2, '0');
  const cuadros = total % f;
  const s = Math.floor(total / f);
  return [z(Math.floor(s / 3600)), z(Math.floor(s / 60) % 60), z(s % 60), z(cuadros)].join(separador);
}

export function nombreClip(f, n, fps, ext = 'mp4') {
  const base = slugify(f.texto.split(' ').slice(0, 6).join(' ')).slice(0, 40) || 'clip';
  return `${String(n).padStart(2, '0')}_${timecode(f.inicio, fps, '-')}_${base}.${ext}`;
}

export function csvExport(t, tipos, enfoques = []) {
  const general = t.ajustes?.enfoque || AJUSTES_DEFECTO.enfoque;
  const fps = t.video?.fps || 30;
  const filas = [['n', 'archivo', 'entrada', 'salida', 'duracion_s', 'tipo', 'enfoque', 'sonido', 'texto']];
  ordenar(t.fragmentos || []).forEach((f, i) => {
    if (!f.salida) return;
    filas.push([i + 1, f.salida, timecode(f.inicio, fps), timecode(f.fin, fps), (f.fin - f.inicio).toFixed(3), tipos.find((x) => x.id === f.tipo)?.titulo || f.tipo, enfoques.find((x) => x.id === (f.enfoque || general))?.titulo || f.enfoque || '', f.conSonido ? 'si' : 'no', f.texto]);
  });
  return filas.map((r) => r.map((c) => (/[",\n;]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}

// EDL CMX3600: cada clip va a la pista V2 en el mismo tiempo que su fragmento del video original.
export function edlExport(t) {
  const fps = t.video?.fps || 30;
  const l = [`TITLE: ${String(t.titulo || t.id).toUpperCase().slice(0, 60)}`, 'FCM: NON-DROP FRAME', ''];
  let n = 0;
  for (const f of ordenar(t.fragmentos || [])) {
    if (!f.salida) continue;
    n++;
    const dur = f.fin - f.inicio;
    const reel = `CLIP${String(n).padStart(3, '0')}`;
    l.push(`${String(n).padStart(3, '0')}  ${reel.padEnd(8)} V     C        ${timecode(0, fps)} ${timecode(dur, fps)} ${timecode(f.inicio, fps)} ${timecode(f.inicio + dur, fps)}`);
    l.push(`* FROM CLIP NAME: ${f.salida}`);
    l.push('');
  }
  return l.join('\n');
}

// ---------- Prompts ----------

function bloqueContexto(t, f, catalogo) {
  const palabras = t.transcripcion.palabras;
  const antes = textoEntre(palabras, Math.max(0, f.desde - 40), f.desde - 1);
  const despues = textoEntre(palabras, f.hasta + 1, Math.min(palabras.length - 1, f.hasta + 40));
  const tipo = catalogo.tipos.find((x) => x.id === f.tipo) || { titulo: f.tipo || 'B-roll', descripcion: '' };
  const enfoque = catalogo.enfoques.find((x) => x.id === (f.enfoque || t.ajustes?.enfoque)) || null;
  const v = t.video;
  const l = [];
  l.push(`Auto postproducción · trabajo ${t.id} · clip ${f.id}`);
  l.push('');
  l.push('Contexto: lee `contexto.md` (ficha de la marca) y `CLAUDE.md` (reglas). No leas otros archivos que no se mencionen aquí.');
  l.push('');
  l.push('## Qué se dice en este momento del video');
  if (antes) l.push(`…${antes.slice(-300)}`);
  l.push(`**«${f.texto}»**  ← este fragmento`);
  if (despues) l.push(`${despues.slice(0, 300)}…`);
  l.push('');
  l.push('## El clip');
  l.push(`- Tipo de contenido: **${tipo.titulo}**${tipo.descripcion ? ` (${tipo.descripcion})` : ''}.`);
  if (enfoque) l.push(`- Enfoque visual: **${enfoque.titulo}**: ${enfoque.descripcion}.`);
  if (f.nota) l.push(`- Indicaciones del usuario: ${f.nota}`);
  if (f.cambios) l.push(`- Cambios pedidos sobre la versión anterior: ${f.cambios}`);
  if (f.refs?.length) l.push(`- Referencias visuales (míralas con Read antes de empezar): ${f.refs.map((r) => `\`postpro/${t.id}/refs/${r}\``).join(', ')}`);
  l.push(`- Medidas exactas del video original: ${v.ancho}×${v.alto} px, ${v.fps} fps. Duración del clip: **${(f.fin - f.inicio).toFixed(2)} s**.`);
  if (sonidoDe(f, t.ajustes) === 'no') l.push('- El clip va en el editor encima del video original, que ya tiene la voz: entrégalo SIN audio y sin subtítulos de la voz.');
  else l.push('- El clip va en el editor encima del video original, que ya tiene la voz: el video va sin voz ni subtítulos de la voz; el sonido del clip se arma aparte en el último paso.');
  return l.join('\n');
}

export function promptFragmento(t, f, catalogo) {
  const ajustes = { ...AJUSTES_DEFECTO, ...t.ajustes };
  const ruta = rutaDe(f, catalogo.tipos);
  const tipo = catalogo.tipos.find((x) => x.id === f.tipo);
  const carpeta = `postpro/${t.id}/frag/${f.id}`;
  const dur = (f.fin - f.inicio).toFixed(2);
  const l = [bloqueContexto(t, f, catalogo), ''];
  l.push(`## Cómo hacerlo`);
  l.push(`Trabaja solo dentro de \`${carpeta}/\`.`);
  if (ruta === 'hyperframes') {
    const capa = !!tipo?.capa;
    l.push(`1. Crea una composición de HyperFrames en \`${carpeta}/composicion/\` de ${t.video.ancho}×${t.video.alto} y exactamente ${dur} s (usa \`/hyperframes\` y el flujo de motion graphics; no explores otros flujos).`);
    l.push(`   Antes de animar, escribe en \`${carpeta}/brief.json\` el plan: {"idea": una línea, "jerarquia": qué se lee primero y qué después, "elementos": textos e íconos exactos, "tiempos": [{"s": segundo dentro del clip, "evento": qué aparece}], "paleta", "tipografia", "transicion_entrada", "transicion_salida"}.`);
    l.push('2. Usa los colores y tipografías de la marca de `contexto.md` y la biblia visual si existe (`postpro/' + t.id + '/biblia.json`). Que cada elemento aparezca cuando la voz lo dice, según estos tiempos (segundos dentro del clip):');
    l.push('   ' + palabrasConTiempo(t, f));
    if (capa) l.push(`3. Es una capa para poner encima del video: fondo TRANSPARENTE. Renderiza con \`npx hyperframes render --format mov\` a \`${carpeta}/salida.mov\`.`);
    else l.push(`3. Renderiza con \`npx hyperframes lint\` y \`npx hyperframes render\` a \`${carpeta}/salida.mp4\`.`);
    l.push('No uses Higgsfield: este clip es gratuito.');
  } else if (ruta === 'material') {
    l.push('1. Revisa los clips de `material/` (usa ffprobe y saca 1 fotograma por clip con ffmpeg para mirarlos; no los analices completos).');
    l.push(`2. Elige el que mejor acompañe el fragmento y recórtalo con ffmpeg a exactamente ${dur} s (elige el mejor tramo) en \`${carpeta}/salida.mp4\`, sin audio.`);
    l.push(`3. Si ningún clip sirve, haz en su lugar un motion graphic con HyperFrames de ${dur} s y guárdalo igual en \`${carpeta}/salida.mp4\`.`);
    l.push('No uses Higgsfield: este clip es gratuito.');
  } else {
    const gen = generadorDe(f, catalogo.tipos, ajustes);
    const plan = planTomas(gen, f.fin - f.inicio);
    const persona = llevaPersona(f, catalogo.tipos);
    const imagen = modeloImagen(ajustes.imagen);
    const tope = Math.ceil(f.topeCreditos ?? 0);
    const aspecto = aspectoCercano(t.video.ancho, t.video.alto, gen.aspectos);
    let n = 1;
    const guia = PLANTILLAS[f.tipo] || tipo?.descripcion || '';
    l.push(`${n++}. Lee \`postpro/${t.id}/biblia.json\` (biblia visual del trabajo) y respétala: es lo que hace que todos los clips parezcan del mismo video.`);
    l.push(`${n++}. Arma el prompt en inglés con esta estructura fija y guárdala en \`${carpeta}/prompt.json\` antes de generar:`);
    l.push('   {"subject": quién o qué aparece (si hay persona, su descripción exacta de la biblia), "action": qué pasa de principio a fin de la toma, "setting": lugar y hora, "camera": plano + movimiento + lente, "lighting": luz, "color": paleta de la biblia, "style": enfoque y textura de imagen, "mood": emoción, "continuity": qué debe coincidir con los otros clips, "negative": "no text, no subtitles, no logos, no watermark, no distorted hands or faces"}');
    if (guia) l.push(`   Guía de encuadre para este tipo: ${guia}`);
    l.push('   El prompt final es la unión de esos campos en ese orden, en frases cortas y concretas. Una sola acción principal por toma.');
    l.push(`${n++}. Genera con Higgsfield \`generate_video\` usando el modelo \`${gen.modelo}\`${gen.parametros ? ` con ${Object.entries(gen.parametros).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}` : ''}, aspect_ratio "${aspecto}", ${plan.tomas > 1 ? `${plan.tomas} tomas de ${plan.porToma} s (planos distintos que continúan la idea)` : `una toma de ${plan.porToma} s`}.`);
    if (persona) {
      if (gen.rostro === 'referencia') l.push(`${n++}. Debe aparecer la persona de \`postpro/${t.id}/personaje.json\`: pásala como \`image_references\` (usa su media_id) y descríbela en el prompt.`);
      else l.push(`${n++}. Debe aparecer la persona de \`postpro/${t.id}/personaje.json\`. Este modelo solo acepta imagen inicial: primero genera con \`generate_image\` (modelo \`${imagen.id}\`, misma relación de aspecto) un fotograma inicial con esa persona como referencia, y úsalo como \`start_image\` del video.`);
    } else l.push(`${n++}. No hace falta una persona concreta; si aparece gente, que no sea protagonista.`);
    if (f.refs?.length) l.push(`${n++}. Si el modelo acepta \`image_references\`, sube las referencias visuales (media_upload + curl PUT + media_confirm) y pásalas; si no, úsalas solo para escribir el prompt.`);
    l.push(`${n++}. ANTES de cada generación llama la herramienta con \`get_cost: true\`. Tope para este clip: **${tope} créditos** en total. Si se pasaría del tope, no generes: escribe el motivo en \`${carpeta}/error.txt\` y termina.`);
    l.push(`${n++}. Espera el resultado (jobs_wait), descárgalo con curl a \`${carpeta}/\`${plan.tomas > 1 ? ' y une las tomas en orden con ffmpeg' : ''} y deja el resultado final en \`${carpeta}/salida.mp4\`. No hace falta ajustar medidas ni duración: el estudio lo hace después.`);
    l.push(`${n++}. Registra cada gasto en \`${carpeta}/creditos.json\` como lista de {"herramienta","creditos","descripcion"}.`);
  }
  pasosSonido(t, f, catalogo, l);
  l.push('');
  l.push('Termina con una sola línea: qué hiciste y cuántos créditos gastaste.');
  return l.join('\n');
}

// ---------- Sonido ----------

// ¿Hay que rehacer el sonido de un clip ya entregado? Solo si cambia lo que de verdad se oye.
export function sonidoCambia(f, antes, despues) {
  if (!f.salida || antes === despues) return false;
  return !(despues === 'no' && !f.conSonido);
}

// Pasos para armar el sonido del clip (efectos de interfaz o ambiente y, si se pide, música). No gasta créditos.
function pasosSonido(t, f, catalogo, l, { soloSonido = false } = {}) {
  const modo = sonidoDe(f, t.ajustes);
  if (modo === 'no') return;
  const ruta = rutaDe(f, catalogo.tipos);
  const carpeta = `postpro/${t.id}/frag/${f.id}`;
  const dur = (f.fin - f.inicio).toFixed(2);
  const enfoque = catalogo.enfoques.find((x) => x.id === (f.enfoque || t.ajustes?.enfoque));
  l.push('');
  l.push(`## Sonido del clip${soloSonido ? '' : ' (después de tener el video)'}`);
  if (ruta === 'hyperframes') {
    l.push(`- Efectos de INTERFAZ sincronizados con la animación: whoosh o swoosh en las entradas y salidas, pop o click cuando aparece cada elemento, un tic o ding suave en cifras y llamados a la acción. Usa los tiempos de \`${carpeta}/brief.json\` (si no existe, mira la composición) para ubicar cada efecto.`);
  } else {
    l.push(`- Sonido AMBIENTE y foley de lo que se ve: el lugar (${ruta === 'generador' ? `según \`${carpeta}/prompt.json\`` : 'según el clip elegido'}) y las acciones (pasos, objetos, máquinas, naturaleza…). Un ambiente de fondo continuo más 1 a 3 efectos puntuales donde pasa algo.`);
  }
  if (modo === 'efectos-musica') l.push(`- Además, una base musical instrumental corta${enfoque ? ` con el tono del enfoque "${enfoque.titulo}"` : ''}, sin letra, que entre y salga con fundido.`);
  l.push('- De dónde sacar el sonido, en este orden: 1) archivos de `musica/` del proyecto; 2) Epidemic Sound (busca con SearchSoundEffects y SearchRecordings, descarga con DownloadSoundEffect/DownloadRecording y curl). No generes audio con Higgsfield.');
  l.push(`- Mezcla con ffmpeg un solo archivo \`${carpeta}/sonido.wav\` (48 kHz, estéreo) de exactamente ${dur} s, con fundidos de 0,05 s al inicio y al final. Va DEBAJO de la voz del video original: efectos con picos cerca de -12 dBFS, ambiente bajo (≈ -28 LUFS)${modo === 'efectos-musica' ? ', música muy baja (≈ -30 LUFS)' : ''}. Nada de voces.`);
  l.push(`- Anota en \`${carpeta}/sonido.json\` la lista de sonidos usados: [{"fuente","id","titulo","uso"}].`);
  l.push(`- Si no hay de dónde sacar sonido, no inventes: escribe el motivo en \`${carpeta}/sin-sonido.txt\` y entrega el clip sin audio.`);
  l.push(`- No metas el sonido dentro del video: el estudio une \`sonido.wav\` con el clip al final.`);
}

// Solo rehace el sonido de un clip que ya tiene video: no vuelve a generar la imagen.
export function promptSonido(t, f, catalogo) {
  const l = [bloqueContexto(t, f, catalogo), ''];
  const carpeta = `postpro/${t.id}/frag/${f.id}`;
  l.push('## Qué hacer');
  l.push(`El video de este clip ya está hecho: \`${carpeta}/salida.mov\` o \`${carpeta}/salida.mp4\` (míralo con ffprobe y saca 2 fotogramas con ffmpeg para ver qué pasa). NO lo cambies ni generes video. Solo arma su sonido.`);
  pasosSonido(t, f, catalogo, l, { soloSonido: true });
  l.push('');
  l.push('Termina con una sola línea: qué sonidos usaste.');
  return l.join('\n');
}

// Palabras del fragmento con su segundo relativo al inicio del clip: "0.00 Hoy · 0.42 vamos · …".
export function palabrasConTiempo(t, f) {
  return t.transcripcion.palabras
    .slice(f.desde, f.hasta + 1)
    .map((p) => `${Math.max(0, p.i - f.inicio).toFixed(2)} ${p.t}`)
    .join(' · ');
}

// Clips pagados que necesitan una persona concreta (tu rostro o un personaje de la IA).
export function necesitaPersonaje(t, catalogo) {
  return (t.fragmentos || []).some((f) => rutaDe(f, catalogo.tipos) === 'generador' && llevaPersona(f, catalogo.tipos));
}

// La preparación arma la biblia visual (una vez por trabajo) y, si hace falta, la persona.
export function promptPreparacion(t, catalogo) {
  const ajustes = { ...AJUSTES_DEFECTO, ...t.ajustes };
  const imagen = modeloImagen(ajustes.imagen);
  const enfoque = catalogo.enfoques.find((x) => x.id === ajustes.enfoque);
  const carpeta = `postpro/${t.id}`;
  const generados = (t.fragmentos || []).filter((f) => rutaDe(f, catalogo.tipos) === 'generador');
  const conPersona = generados.filter((f) => llevaPersona(f, catalogo.tipos));
  const l = [`Auto postproducción · trabajo ${t.id} · preparar la biblia visual${conPersona.length ? ' y la persona' : ''}`, ''];
  l.push('Lee `contexto.md` (ficha de la marca). No leas otros archivos que no se mencionen aquí.');
  l.push('');
  l.push(`Resumen de lo que dice el video: «${textoEntre(t.transcripcion.palabras, 0, Math.min(t.transcripcion.palabras.length - 1, 220)).slice(0, 1400)}»`);
  if (enfoque) l.push(`Enfoque general: ${enfoque.titulo} (${enfoque.descripcion}).`);
  l.push('');
  l.push('Clips que se van a generar con IA:');
  for (const f of generados.slice(0, 20)) {
    const tipo = catalogo.tipos.find((x) => x.id === f.tipo);
    const enf = catalogo.enfoques.find((x) => x.id === (f.enfoque || ajustes.enfoque));
    l.push(`- [${tipo?.titulo || f.tipo}${enf ? ` · ${enf.titulo}` : ''}] «${f.texto.slice(0, 140)}»`);
  }
  l.push('');
  l.push(`1. Escribe \`${carpeta}/biblia.json\`, la biblia visual que van a seguir TODOS los clips para que parezcan del mismo video:`);
  l.push('   {"look": textura y tipo de imagen (p. ej. "35mm film, soft grain"), "paleta": 4-6 colores con hex (de la marca cuando aplique), "luz": esquema de luz, "lente": lentes y profundidad de campo, "camara": estilo de movimiento, "lugar": ambientación común, "epoca_y_hora": cuándo ocurre, "vestuario": estilo de ropa, "persona": descripción física exacta en inglés o null, "evitar": lista corta}');
  let paso = 2;
  if (conPersona.length) {
    if (t.rostro) {
      l.push(`${paso++}. Mira la foto \`${carpeta}/${t.rostro}\` con Read y escribe en "persona" su descripción física exacta en inglés (edad aparente, rasgos, pelo, ropa).`);
      l.push(`${paso++}. Súbela a Higgsfield: \`media_upload\`, PUT del archivo con curl a la URL que te den, y \`media_confirm\`. No gasta créditos.`);
    } else {
      l.push(`${paso++}. Diseña un personaje que encaje con la marca y lo que se dice; pon su descripción física exacta en inglés en "persona".`);
      l.push(`${paso++}. Genera UN retrato de esa persona con \`generate_image\` (modelo \`${imagen.id}\`, de frente, plano medio, fondo neutro, con la luz y el vestuario de la biblia). Antes llama con \`get_cost: true\`; tope: ${Math.ceil(imagen.creditos * 1.15)} créditos. Descárgalo con curl a \`${carpeta}/personaje.png\`.`);
      l.push(`${paso++}. Registra el gasto en \`${carpeta}/prep/creditos.json\` como lista de {"herramienta","creditos","descripcion"}.`);
    }
    l.push(`${paso++}. Escribe \`${carpeta}/personaje.json\` con {"media_id": "...", "url": "...", "imagen": "${t.rostro ? `${carpeta}/${t.rostro}` : `${carpeta}/personaje.png`}", "descripcion": la misma descripción de la biblia}.`);
  } else l.push(`${paso++}. En estos clips no hace falta una persona concreta: deja "persona" en null.`);
  l.push('No generes videos. Termina con una sola línea.');
  return l.join('\n');
}

// Relación de aspecto aceptada por el modelo más parecida a la del video.
export function aspectoCercano(ancho, alto, aspectos = ['16:9', '9:16', '1:1']) {
  const objetivo = ancho / alto;
  let mejor = aspectos.find((a) => a !== 'auto') || '16:9';
  let dif = Infinity;
  for (const a of aspectos) {
    if (a === 'auto') continue;
    const [w, h] = a.split(':').map(Number);
    const d = Math.abs(Math.log(w / h / objetivo));
    if (d < dif) {
      dif = d;
      mejor = a;
    }
  }
  return mejor;
}
