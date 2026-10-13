// Auto postproducción, parte que ejecuta: medir el video, transcribir en local,
// generar los clips con Claude Code (en cola) y dejarlos listos para el editor.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { rutaProyecto, leerProyecto, guardarProyecto } from './store.js';
import { ejecutar, detener, enCurso, config } from './runner.js';
import { generarFicha } from './contexto.js';
import {
  leerTrabajo, actualizarTrabajo, rutaTrabajo, leerCatalogo, ordenar, rutaDe, estimar, calibracion, listarTrabajos,
  promptFragmento, promptPreparacion, promptSonido, sonidoDe, necesitaPersonaje, nombreClip, csvExport, edlExport, AJUSTES_DEFECTO, modeloClaude,
} from './postpro.js';

const correr = (cmd, args, opciones = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opciones }, (e, stdout, stderr) => {
      if (e) {
        e.message = `${e.message}\n${String(stderr).slice(-1500)}`;
        reject(e);
      } else resolve({ stdout, stderr });
    });
  });

// ---------- Medir el video ----------

export async function medirVideo(archivo) {
  const { stdout } = await correr('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', archivo]);
  const datos = JSON.parse(stdout);
  const v = datos.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('El archivo no tiene video');
  const fraccion = (x) => {
    const [a, b] = String(x || '0/1').split('/').map(Number);
    return b ? a / b : a;
  };
  let fps = fraccion(v.avg_frame_rate) || fraccion(v.r_frame_rate) || 30;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) fps = 30;
  // Los videos de celular guardan la rotación aparte: se corrige para tener las medidas reales.
  const rot = Number(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0);
  const girado = Math.abs(rot) % 180 === 90;
  let ancho = girado ? v.height : v.width;
  let alto = girado ? v.width : v.height;
  ancho -= ancho % 2;
  alto -= alto % 2;
  return {
    duracion: Number(datos.format.duration || v.duration || 0),
    ancho,
    alto,
    fps: Math.round(fps * 1000) / 1000,
    audio: datos.streams.some((s) => s.codec_type === 'audio'),
  };
}

// ---------- Transcripción local (gratis) ----------

// Convierte la salida de `hyperframes transcribe` (o subtítulos importados) en palabras con tiempos.
// Si una entrada trae varias palabras (SRT por frases), reparte su tiempo según el largo de cada una.
export function palabrasDesde(lista) {
  const salida = [];
  for (const e of Array.isArray(lista) ? lista : lista?.words || []) {
    const texto = String(e.text ?? e.word ?? '').trim();
    const inicio = Number(e.start);
    const fin = Number(e.end);
    if (!texto || !Number.isFinite(inicio) || !Number.isFinite(fin)) continue;
    const partes = texto.split(/\s+/);
    if (partes.length === 1) {
      salida.push({ t: texto, i: r3(inicio), f: r3(Math.max(fin, inicio + 0.01)) });
      continue;
    }
    const total = partes.reduce((s, p) => s + p.length, 0) || 1;
    let cursor = inicio;
    for (const p of partes) {
      const d = ((fin - inicio) * p.length) / total;
      salida.push({ t: p, i: r3(cursor), f: r3(cursor + d) });
      cursor += d;
    }
  }
  return salida.sort((a, b) => a.i - b.i);
}
const r3 = (n) => Math.round(n * 1000) / 1000;

const transcribiendo = new Map();
export const estaTranscribiendo = (slug, id) => transcribiendo.has(`${slug}:${id}`);

export async function transcribir(slug, id, { importar } = {}) {
  const clave = `${slug}:${id}`;
  if (transcribiendo.has(clave)) throw new Error('Ya se está transcribiendo');
  const t = await leerTrabajo(slug, id);
  const idioma = t.ajustes?.idioma || AJUSTES_DEFECTO.idioma;
  const dir = rutaTrabajo(slug, id, 'transcripcion');
  await fs.mkdir(dir, { recursive: true });
  await fs.rm(path.join(dir, 'transcript.json'), { force: true });
  const entrada = importar ? rutaTrabajo(slug, id, importar) : rutaTrabajo(slug, id, t.video.archivo);
  // whisper "small" es multilingüe (los modelos .en solo entienden inglés). Con Parakeet instalado, HyperFrames lo usa solo.
  const args = ['--yes', 'hyperframes', 'transcribe', entrada, '--dir', dir, '--json'];
  if (!importar) {
    args.push('--model', (await config()).transcripcion?.modelo || 'small');
    if (idioma !== 'auto') args.push('--language', idioma);
  }
  await actualizarTrabajo(slug, id, (x) => {
    x.estado = 'transcribiendo';
    x.error = null;
  });
  const registro = await fs.open(path.join(dir, 'registro.txt'), 'w');
  const proceso = spawn('npx', args, { cwd: rutaProyecto(slug), env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1' } });
  transcribiendo.set(clave, proceso);
  let stdout = '';
  proceso.stdout.on('data', (b) => {
    stdout += b;
    registro.write(b);
  });
  proceso.stderr.on('data', (b) => registro.write(b));
  const terminar = async (codigo, falla) => {
    transcribiendo.delete(clave);
    await registro.close().catch(() => {});
    let palabras = [];
    let error = falla || null;
    try {
      palabras = palabrasDesde(JSON.parse(await fs.readFile(path.join(dir, 'transcript.json'), 'utf8')));
    } catch {
      if (!error) {
        const ultima = stdout.trim().split('\n').reverse().find((l) => l.startsWith('{'));
        try {
          error = JSON.parse(ultima).error;
        } catch {
          // Sin JSON: se usa el código de salida.
        }
        error ||= `La transcripción terminó sin resultado (código ${codigo}). Revisa postpro/${id}/transcripcion/registro.txt`;
      }
    }
    if (!palabras.length && !error) error = 'No se detectó voz en el video.';
    await actualizarTrabajo(slug, id, (x) => {
      if (palabras.length) {
        x.transcripcion = { palabras, idioma, fecha: new Date().toISOString(), origen: importar ? 'subtitulos' : 'local' };
        // Los fragmentos viejos apuntan a palabras que ya no existen.
        if (x.fragmentos?.length) x.fragmentosAnteriores = x.fragmentos;
        x.fragmentos = [];
        x.estado = 'listo';
        x.error = null;
      } else if (x.transcripcion?.palabras?.length) {
        // Si ya había una transcripción, se conserva junto con los clips marcados.
        x.estado = 'listo';
        x.error = `No se pudo transcribir de nuevo: ${error}`;
      } else {
        x.estado = 'error';
        x.error = error;
      }
    });
  };
  proceso.on('error', (e) => terminar(-1, `No se pudo ejecutar npx: ${e.message}`));
  proceso.on('close', (c) => terminar(c));
}

// ---------- Normalizar cada clip a las medidas del video original ----------

export async function normalizar(entrada, salida, { ancho, alto, fps, duracion, alfa = false, audio = null }) {
  const medida = await medirVideo(entrada);
  const filtros = [`scale=${ancho}:${alto}:force_original_aspect_ratio=increase`, `crop=${ancho}:${alto}`];
  // Si el clip quedó un poco corto se ralentiza hasta 35 %; lo que falte se completa con el último cuadro.
  const razon = medida.duracion > 0 ? duracion / medida.duracion : 1;
  if (razon > 1 && razon <= 1.35) filtros.push(`setpts=${razon.toFixed(5)}*PTS`);
  filtros.push(`fps=${fps}`, `tpad=stop_mode=clone:stop_duration=${Math.ceil(duracion + 1)}`, 'setsar=1');
  filtros.push(alfa ? 'format=yuva444p10le' : 'format=yuv420p');
  const codec = alfa
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  // Con sonido: se ajusta a la duración exacta (silencio si falta, corte si sobra) con fundidos cortos.
  const d = duracion.toFixed(3);
  const sonido = audio
    ? ['-map', '0:v:0', '-map', '1:a:0', '-af', `aresample=48000,apad,atrim=0:${d},afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, duracion - 0.05).toFixed(3)}:d=0.05`, ...(alfa ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k']), '-ac', '2']
    : ['-an'];
  await correr('ffmpeg', ['-y', '-v', 'error', '-i', entrada, ...(audio ? ['-i', audio] : []), '-vf', filtros.join(','), '-t', d, ...sonido, ...codec, salida]);
}

export async function tieneAudio(archivo) {
  try {
    const { stdout } = await correr('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', archivo]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// ---------- Generación en cola ----------

const colas = new Map(); // `${slug}:${id}` -> { pendientes: [fid], activos: Set, detenido }
export const generando = (slug, id) => colas.has(`${slug}:${id}`);
const claveClip = (id, fid) => `${id}--${fid}`;

// Un clip que no llegó a generarse vuelve a pendiente; si tenía una versión anterior, queda marcado para regenerar.
const sinTerminar = (f) => (f.salida ? 'cambiado' : 'pendiente');

// Al arrancar el estudio no hay colas: lo que quedó "generando" de una sesión anterior vuelve a pendiente.
export async function repararTrabajo(slug, t) {
  if (generando(slug, t.id) || estaTranscribiendo(slug, t.id)) return t;
  const colgado = t.estado === 'transcribiendo' || t.generacion?.estado === 'en-curso' || (t.fragmentos || []).some((f) => ['en-cola', 'generando'].includes(f.estado)) || t.preparacion?.estado === 'generando';
  if (!colgado) return t;
  return actualizarTrabajo(slug, t.id, (x) => {
    if (x.estado === 'transcribiendo') {
      x.estado = 'error';
      x.error = 'La transcripción se interrumpió. Vuelve a intentarlo.';
    }
    if (x.generacion?.estado === 'en-curso') x.generacion.estado = 'detenido';
    if (x.preparacion?.estado === 'generando') x.preparacion.estado = 'pendiente';
    for (const f of x.fragmentos || []) if (['en-cola', 'generando'].includes(f.estado)) f.estado = sinTerminar(f);
  });
}

export async function iniciarGeneracion(slug, id, { fragmentos, topeTotal, cambios, soloSonido = false } = {}) {
  const clave = `${slug}:${id}`;
  if (colas.has(clave)) throw new Error('Ya se está generando este trabajo');
  const catalogo = await leerCatalogo();
  const t = await leerTrabajo(slug, id);
  if (!t.transcripcion?.palabras?.length) throw new Error('Primero transcribe el video');
  const elegidos = ordenar(t.fragmentos || []).filter((f) => (fragmentos ? fragmentos.includes(f.id) : f.estado !== 'listo'));
  if (soloSonido) return iniciarSoloSonido(slug, id, t, elegidos);
  if (!elegidos.length) throw new Error('No hay fragmentos por generar');
  const sinTipo = elegidos.find((f) => !f.tipo);
  if (sinTipo) throw new Error(`Falta elegir el tipo de contenido de «${sinTipo.texto.slice(0, 40)}…»`);

  // La estimación se rehace en el servidor; el tope que aprobó el usuario no puede quedar por debajo.
  const sub = { ...t, fragmentos: elegidos };
  const est = estimar(sub, catalogo, calibracion(await listarTrabajos(slug)));
  if (est.totales.creditos > 0 && !(Number(topeTotal) >= est.totales.creditos)) {
    throw new Error(`La estimación cambió a ${est.totales.creditos} créditos. Revísala y vuelve a confirmar.`);
  }
  const porFila = Object.fromEntries(est.filas.map((x) => [x.id, x]));
  const cola = { pendientes: elegidos.map((f) => f.id), activos: new Set(), detenido: false, prep: !!est.preparacion };
  colas.set(clave, cola);
  try {
    await actualizarTrabajo(slug, id, (x) => {
      x.generacion = { estado: 'en-curso', inicio: new Date().toISOString(), tope: Number(topeTotal) || 0, estimado: est.totales.creditos, clips: cola.pendientes.length };
      for (const f of x.fragmentos) {
        if (!cola.pendientes.includes(f.id)) continue;
        f.estado = 'en-cola';
        f.error = null;
        // Margen del 15 % sobre la cotización para redondeos de Higgsfield; nunca más que eso.
        f.topeCreditos = Math.ceil((porFila[f.id]?.creditos || 0) * 1.15);
        if (cambios && cambios[f.id] !== undefined) f.cambios = String(cambios[f.id] || '');
      }
      if (est.preparacion) x.preparacion = { ...(x.preparacion || {}), estado: 'en-cola', topeCreditos: Math.ceil(est.preparacion.creditos * 1.15) };
    });
  } catch (e) {
    colas.delete(clave);
    throw e;
  }
  await generarFicha(slug);
  if (cola.prep) prepararPersonaje(slug, id).catch((e) => console.error(e));
  else avanzar(slug, id);
  return est;
}

// Rehacer solo el sonido de clips ya generados: no toca la imagen ni gasta créditos.
async function iniciarSoloSonido(slug, id, t, elegidos) {
  const clave = `${slug}:${id}`;
  const sinVideo = elegidos.find((f) => !f.salida);
  if (sinVideo) throw new Error(`«${sinVideo.texto.slice(0, 40)}…» aún no tiene video: genéralo primero`);
  const directos = [];
  const conClaude = [];
  for (const f of elegidos) (sonidoDe(f, t.ajustes) === 'no' ? directos : conClaude).push(f);
  // Quitar el sonido no necesita a Claude: se vuelve a exportar el clip sin audio.
  const catalogo = await leerCatalogo();
  for (const f of directos) {
    const r = await entregarClip(slug, t, f, catalogo);
    await actualizarTrabajo(slug, id, (x) => {
      const g = x.fragmentos.find((y) => y.id === f.id);
      Object.assign(g, { salida: r.salida, conSonido: r.conSonido, sonidoAviso: r.aviso, sonidoPendiente: false, version: (g.version || 0) + 1 });
    });
  }
  if (!conClaude.length) {
    await escribirIndices(slug, await leerTrabajo(slug, id), catalogo);
    return { soloSonido: true, clips: directos.length };
  }
  const cola = { pendientes: conClaude.map((f) => f.id), activos: new Set(), detenido: false, soloSonido: true };
  colas.set(clave, cola);
  await actualizarTrabajo(slug, id, (x) => {
    x.generacion = { estado: 'en-curso', inicio: new Date().toISOString(), tope: 0, estimado: 0, clips: cola.pendientes.length, soloSonido: true };
    for (const f of x.fragmentos) if (cola.pendientes.includes(f.id)) Object.assign(f, { estado: 'en-cola', error: null, topeCreditos: 0 });
  });
  avanzar(slug, id);
  return { soloSonido: true, clips: elegidos.length };
}

async function prepararPersonaje(slug, id) {
  const clave = `${slug}:${id}`;
  const cola = colas.get(clave);
  const catalogo = await leerCatalogo();
  const t = await actualizarTrabajo(slug, id, (x) => {
    x.preparacion.estado = 'generando';
  });
  const modelo = modeloClaude(t.ajustes?.claude).id;
  const inicio = new Date().toISOString();
  const conPersona = necesitaPersonaje(t, catalogo);
  await fs.mkdir(rutaTrabajo(slug, id, 'prep'), { recursive: true });
  for (const n of ['personaje.json', 'biblia.json']) await fs.rm(rutaTrabajo(slug, id, n), { force: true });
  cola.activos.add('prep');
  try {
    await ejecutar({
      slug, id: claveClip(id, 'prep'), fase: 'produccion', modelo,
      // Solo la persona necesita Higgsfield; la biblia visual sola no gasta créditos.
      motor: conPersona ? 'higgsfield' : 'hyperframes',
      prompt: promptPreparacion(t, catalogo),
      carpetaRegistro: rutaTrabajo(slug, id, 'prep'),
      alTerminar: async (rs) => {
        try {
          const existe = async (n) => fs.access(rutaTrabajo(slug, id, n)).then(() => true, () => false);
          const okBiblia = await existe('biblia.json');
          const okPersona = !conPersona || (await existe('personaje.json'));
          const ok = rs.ok && okBiblia && okPersona;
          const creditos = await sumarCreditos(rutaTrabajo(slug, id, 'prep', 'creditos.json'));
          await actualizarTrabajo(slug, id, (x) => {
            x.preparacion = {
              ...x.preparacion,
              estado: ok ? 'listo' : 'error',
              conRostro: !!x.rostro,
              conPersona: conPersona && okPersona,
              creditos,
              error: ok ? null : !okBiblia ? 'No se creó la biblia visual.' : 'No se pudo preparar la persona.',
              ejecucion: { ruta: 'preparar', modelo, inicio, fin: new Date().toISOString(), ok: rs.ok, costoUsd: rs.costoUsd, tokens: rs.tokens, resumen: rs.texto.slice(0, 300) },
            };
            if (!ok) {
              // Sin persona ni biblia los clips con IA no serían consistentes: se frenan y se avisa.
              for (const f of x.fragmentos) if (f.estado === 'en-cola' && rutaDe(f, catalogo.tipos) === 'generador') {
                f.estado = 'error';
                f.error = 'No se pudo preparar la biblia visual o la persona. Revisa el registro y vuelve a intentarlo.';
              }
            }
          });
          if (!ok) {
            const t2 = await leerTrabajo(slug, id);
            cola.pendientes = cola.pendientes.filter((fid) => t2.fragmentos.find((f) => f.id === fid)?.estado === 'en-cola');
          }
          await registrarGasto(slug, id);
        } finally {
          cola.activos.delete('prep');
          avanzar(slug, id);
        }
      },
    });
  } catch (e) {
    cola.activos.delete('prep');
    await actualizarTrabajo(slug, id, (x) => {
      x.preparacion = { ...x.preparacion, estado: 'error', error: e.message };
    });
    avanzar(slug, id);
  }
}

async function avanzar(slug, id) {
  const clave = `${slug}:${id}`;
  const cola = colas.get(clave);
  if (!cola) return;
  const paralelo = Math.max(1, Number((await config()).postpro?.paralelo) || 2);
  while (!cola.detenido && cola.pendientes.length && cola.activos.size < paralelo) {
    const fid = cola.pendientes.shift();
    cola.activos.add(fid);
    generarClip(slug, id, fid).catch(async (e) => {
      console.error(e);
      cola.activos.delete(fid);
      await actualizarTrabajo(slug, id, (x) => {
        const f = x.fragmentos.find((y) => y.id === fid);
        if (f) Object.assign(f, { estado: 'error', error: e.message });
      });
      avanzar(slug, id);
    });
  }
  if (!cola.activos.size && (cola.detenido || !cola.pendientes.length)) {
    colas.delete(clave);
    await finalizar(slug, id, cola.detenido);
  }
}

async function generarClip(slug, id, fid) {
  const cola = colas.get(`${slug}:${id}`);
  const catalogo = await leerCatalogo();
  const t = await actualizarTrabajo(slug, id, (x) => {
    const f = x.fragmentos.find((y) => y.id === fid);
    f.estado = 'generando';
    f.inicioGeneracion = new Date().toISOString();
  });
  const f = t.fragmentos.find((y) => y.id === fid);
  if (!f) throw new Error('El fragmento ya no existe');
  const ruta = rutaDe(f, catalogo.tipos);
  const carpeta = rutaTrabajo(slug, id, 'frag', fid);
  const soloSonido = !!cola?.soloSonido;
  if (soloSonido) {
    // Se conserva el video; solo se borra el sonido anterior.
    for (const n of ['sonido.wav', 'sonido.m4a', 'sonido.mp3', 'sonido.json', 'sin-sonido.txt']) await fs.rm(path.join(carpeta, n), { force: true });
  } else {
    // Cada intento empieza limpio para no confundir una salida vieja con la nueva.
    await fs.rm(carpeta, { recursive: true, force: true });
  }
  await fs.mkdir(carpeta, { recursive: true });
  const modelo = modeloClaude(t.ajustes?.claude).id;
  const inicio = new Date().toISOString();
  await ejecutar({
    slug, id: claveClip(id, fid), fase: 'produccion', modelo,
    // Los clips gratuitos corren sin acceso a Higgsfield: es imposible que gasten créditos.
    motor: ruta === 'generador' && !soloSonido ? 'higgsfield' : 'hyperframes',
    prompt: soloSonido ? promptSonido(t, f, catalogo) : promptFragmento(t, f, catalogo),
    carpetaRegistro: carpeta,
    alTerminar: async (rs) => {
      try {
        const creditos = soloSonido ? f.creditos || 0 : await sumarCreditos(path.join(carpeta, 'creditos.json'));
        let salida = null;
        let entrega = null;
        let error = null;
        try {
          entrega = await entregarClip(slug, t, f, catalogo);
          salida = entrega.salida;
        } catch (e) {
          const motivo = (await fs.readFile(path.join(carpeta, 'error.txt'), 'utf8').catch(() => '')).trim();
          error = motivo || (!rs.ok ? `Claude no pudo terminar el clip${rs.texto ? `: ${rs.texto.slice(0, 200)}` : ''}. Revisa el registro.` : e.message);
        }
        await actualizarTrabajo(slug, id, (x) => {
          const g = x.fragmentos.find((y) => y.id === fid);
          if (!g) return;
          // Si falla rehacer el sonido, el clip anterior sigue sirviendo.
          g.estado = salida ? 'listo' : soloSonido ? 'listo' : cola?.detenido ? sinTerminar(g) : 'error';
          g.error = salida ? null : cola?.detenido ? null : error;
          g.creditos = creditos;
          if (salida) {
            g.salida = salida;
            g.version = (g.version || 0) + 1;
            g.cambios = '';
            g.conSonido = entrega.conSonido;
            g.sonidoAviso = entrega.aviso;
            g.sonidoPendiente = false;
          }
          g.ejecucion = { ruta, modelo, inicio, fin: new Date().toISOString(), ok: rs.ok && !!salida, costoUsd: rs.costoUsd, tokens: rs.tokens, resumen: rs.texto.slice(0, 300) };
        });
        await registrarGasto(slug, id);
      } finally {
        // Se libera el lugar recién al guardar el resultado: así el cierre del trabajo ve todos los clips.
        cola?.activos.delete(fid);
        avanzar(slug, id);
      }
    },
  });
}

// Busca lo que dejó Claude, lo ajusta a medidas, fps y duración exactas, y lo copia a salidas/.
async function entregarClip(slug, t, f, catalogo) {
  const carpeta = rutaTrabajo(slug, t.id, 'frag', f.id);
  const nombres = await fs.readdir(carpeta);
  const videos = nombres.filter((n) => /\.(mp4|mov|webm|m4v)$/i.test(n));
  const elegido = ['salida.mov', 'salida.mp4', 'salida.webm'].find((n) => videos.includes(n)) || null;
  if (!elegido) throw new Error('No quedó ningún video del clip (se esperaba salida.mp4).');
  const tipo = catalogo.tipos.find((x) => x.id === f.tipo);
  const alfa = !!tipo?.capa && /\.(mov|webm)$/i.test(elegido);
  const n = ordenar(t.fragmentos).findIndex((x) => x.id === f.id) + 1;
  const final = nombreClip(f, n, t.video.fps, alfa ? 'mov' : 'mp4');
  const dirSalidas = rutaProyecto(slug, 'salidas', t.id);
  await fs.mkdir(dirSalidas, { recursive: true });
  // Si el clip ya tenía una versión con otro nombre (cambió el orden o el texto), se reemplaza.
  if (f.salida && f.salida !== final) await fs.rm(path.join(dirSalidas, f.salida), { force: true });
  // Sonido: el archivo que armó Claude, o el audio que traiga el video; si se pidió sin sonido, nada.
  let audio = null;
  let aviso = null;
  if (sonidoDe(f, t.ajustes) !== 'no') {
    const archivo = ['sonido.wav', 'sonido.m4a', 'sonido.mp3'].find((n) => nombres.includes(n));
    if (archivo) audio = path.join(carpeta, archivo);
    // Si Claude dejó constancia de que no encontró sonido, no se usa el audio que pueda traer el video.
    if (!audio && !nombres.includes('sin-sonido.txt') && (await tieneAudio(path.join(carpeta, elegido)))) audio = path.join(carpeta, elegido);
    if (!audio) aviso = (await fs.readFile(path.join(carpeta, 'sin-sonido.txt'), 'utf8').catch(() => '')).trim().slice(0, 300) || 'No se encontró sonido para este clip.';
  }
  await normalizar(path.join(carpeta, elegido), path.join(dirSalidas, final), {
    ancho: t.video.ancho, alto: t.video.alto, fps: t.video.fps, duracion: f.fin - f.inicio, alfa, audio,
  });
  return { salida: final, conSonido: !!audio, aviso };
}

async function sumarCreditos(archivo) {
  try {
    const lista = JSON.parse(await fs.readFile(archivo, 'utf8'));
    return Array.isArray(lista) ? Math.round(lista.reduce((s, g) => s + (Number(g.creditos) || 0), 0) * 100) / 100 : 0;
  } catch {
    return 0;
  }
}

// Suma lo gastado en el trabajo al historial de créditos del proyecto (una sola entrada por trabajo).
async function registrarGasto(slug, id) {
  const t = await leerTrabajo(slug, id);
  const detalle = [
    ...(t.preparacion?.creditos ? [{ herramienta: 'preparación', creditos: t.preparacion.creditos, descripcion: 'Biblia visual y persona' }] : []),
    ...(t.fragmentos || []).filter((f) => f.creditos).map((f) => ({ herramienta: f.generador || t.ajustes?.video, creditos: f.creditos, descripcion: f.texto.slice(0, 80) })),
  ];
  const total = detalle.reduce((s, g) => s + g.creditos, 0);
  const p = await leerProyecto(slug);
  p.gastos = (p.gastos || []).filter((g) => g.pedido !== id);
  if (total) p.gastos.push({ fecha: new Date().toISOString(), pedido: id, creditos: total, detalle });
  await guardarProyecto(slug, p);
}

async function finalizar(slug, id, detenido) {
  const catalogo = await leerCatalogo();
  const t = await actualizarTrabajo(slug, id, (x) => {
    x.generacion = { ...(x.generacion || {}), estado: detenido ? 'detenido' : 'listo', fin: new Date().toISOString() };
    for (const f of x.fragmentos) if (f.estado === 'en-cola') f.estado = sinTerminar(f);
    if (x.preparacion?.estado === 'en-cola') x.preparacion.estado = 'pendiente';
  });
  await escribirIndices(slug, t, catalogo);
}

export async function escribirIndices(slug, t, catalogo) {
  const dir = rutaProyecto(slug, 'salidas', t.id);
  if (!(t.fragmentos || []).some((f) => f.salida)) return;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'indice.csv'), csvExport(t, catalogo.tipos, catalogo.enfoques));
  await fs.writeFile(path.join(dir, 'linea-de-tiempo.edl'), edlExport(t));
}

export async function detenerGeneracion(slug, id) {
  const cola = colas.get(`${slug}:${id}`);
  if (!cola) return false;
  cola.detenido = true;
  cola.pendientes = [];
  for (const fid of cola.activos) detener(slug, claveClip(id, fid));
  return true;
}

export const clipEnCurso = (slug, id, fid) => enCurso(slug, claveClip(id, fid));

// ---------- Vista previa: los clips encima del video original, con su voz ----------

const previas = new Set();
export const armandoPrevia = (slug, id) => previas.has(`${slug}:${id}`);

export async function armarVistaPrevia(slug, id) {
  const clave = `${slug}:${id}`;
  if (previas.has(clave)) throw new Error('Ya se está armando la vista previa');
  const t = await leerTrabajo(slug, id);
  const listos = ordenar(t.fragmentos || []).filter((f) => f.salida);
  if (!listos.length) throw new Error('Aún no hay clips listos');
  const dir = rutaProyecto(slug, 'salidas', t.id);
  // Liviana a propósito: 720 px en el lado corto, para revisar tiempos rápido.
  const escala = Math.min(1, 720 / Math.min(t.video.ancho, t.video.alto));
  const w = Math.round((t.video.ancho * escala) / 2) * 2;
  const h = Math.round((t.video.alto * escala) / 2) * 2;
  const entradas = ['-i', rutaTrabajo(slug, id, t.video.archivo)];
  const filtros = [`[0:v]scale=${w}:${h},setsar=1[b0]`];
  listos.forEach((f, k) => {
    entradas.push('-i', path.join(dir, f.salida));
    filtros.push(`[${k + 1}:v]scale=${w}:${h},setpts=PTS-STARTPTS+${f.inicio.toFixed(3)}/TB[c${k}]`);
    filtros.push(`[b${k}][c${k}]overlay=eof_action=pass:enable='between(t,${f.inicio.toFixed(3)},${f.fin.toFixed(3)})'[b${k + 1}]`);
  });
  // El sonido de los clips se suma a la voz original en su momento exacto.
  const conSonido = listos.map((f, k) => ({ f, k })).filter(({ f }) => f.conSonido);
  conSonido.forEach(({ f, k }) => {
    const ms = Math.round(f.inicio * 1000);
    filtros.push(`[${k + 1}:a]adelay=${ms}|${ms}[a${k}]`);
  });
  if (conSonido.length) filtros.push(`[0:a]${conSonido.map(({ k }) => `[a${k}]`).join('')}amix=inputs=${conSonido.length + 1}:normalize=0:duration=first[aout]`);
  previas.add(clave);
  await actualizarTrabajo(slug, id, (x) => {
    x.vistaPrevia = { estado: 'armando', inicio: new Date().toISOString() };
  });
  const salida = path.join(dir, 'vista-previa.mp4');
  correr('ffmpeg', ['-y', '-v', 'error', ...entradas, '-filter_complex', filtros.join(';'), '-map', `[b${listos.length}]`, '-map', conSonido.length ? '[aout]' : '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', salida])
    .then(() => actualizarTrabajo(slug, id, (x) => {
      x.vistaPrevia = { estado: 'listo', archivo: 'vista-previa.mp4', fecha: new Date().toISOString() };
    }))
    .catch((e) => actualizarTrabajo(slug, id, (x) => {
      x.vistaPrevia = { estado: 'error', error: e.message.slice(0, 400) };
    }))
    .finally(() => previas.delete(clave));
}
