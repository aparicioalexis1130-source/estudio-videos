// Rutas de la API de Auto postproducción.
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { rutaProyecto, nombreSeguro, leerProyecto } from './store.js';
import {
  GENERADORES, AJUSTES_DEFECTO, leerCatalogo, agregarAlCatalogo, quitarDelCatalogo, leerTrabajo, actualizarTrabajo, guardarTrabajoNuevo,
  listarTrabajos, nuevoIdTrabajo, rutaTrabajo, armarFragmento, estimar, calibracion, generador, modeloImagen, modeloClaude, sonidoDe, sonidoCambia,
} from './postpro.js';
import {
  medirVideo, transcribir, estaTranscribiendo, iniciarGeneracion, detenerGeneracion, generando, repararTrabajo,
  armarVistaPrevia, armandoPrevia, clipEnCurso, escribirIndices,
} from './postpro-run.js';

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;
const IMAGEN = /\.(png|jpe?g|webp)$/i;
const SUBTITULOS = /\.(srt|vtt|json)$/i;

function subidaA(destino, filtro, nombre) {
  return multer({
    storage: multer.diskStorage({
      destination: async (req, _f, cb) => {
        try {
          const dir = destino(req);
          await fs.mkdir(dir, { recursive: true });
          cb(null, dir);
        } catch (e) {
          cb(e);
        }
      },
      filename: (req, f, cb) => {
        const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
        const limpio = nombreSeguro(original);
        cb(null, nombre ? nombre(req, limpio) : `${path.basename(limpio, path.extname(limpio))}-${Date.now().toString(36)}${path.extname(limpio)}`);
      },
    }),
    fileFilter: (_req, f, cb) => (filtro.test(f.originalname) ? cb(null, true) : cb(new Error('Formato de archivo no admitido'))),
    limits: { fileSize: 20 * 1024 ** 3 },
  });
}

// Los fragmentos que ya se están generando no se pueden editar.
function editable(f) {
  if (['en-cola', 'generando'].includes(f.estado)) throw new Error('Este clip se está generando; espera a que termine o detén la generación.');
}

export function rutasPostpro(app, r) {
  app.get('/api/postpro/catalogo', r(async (_req, res) => {
    res.json({ ...(await leerCatalogo()), generadores: GENERADORES, ajustesDefecto: AJUSTES_DEFECTO });
  }));
  app.post('/api/postpro/catalogo/:clase', r(async (req, res) => res.json(await agregarAlCatalogo(req.params.clase, req.body))));
  app.delete('/api/postpro/catalogo/:clase/:id', r(async (req, res) => {
    await quitarDelCatalogo(req.params.clase, req.params.id);
    res.json({ ok: true });
  }));

  const base = '/api/proyectos/:slug/postpro';

  app.get(base, r(async (req, res) => {
    const lista = [];
    for (const t of await listarTrabajos(req.params.slug)) {
      const x = await repararTrabajo(req.params.slug, t);
      lista.push({
        id: x.id, titulo: x.titulo, creado: x.creado, estado: x.estado, video: x.video,
        fragmentos: (x.fragmentos || []).length, listos: (x.fragmentos || []).filter((f) => f.estado === 'listo').length,
        generando: generando(req.params.slug, x.id),
      });
    }
    res.json(lista);
  }));

  // Crear: se sube el video ya cortado y arranca la transcripción local.
  const subirVideo = subidaA(
    (req) => {
      req.trabajoId ||= nuevoIdTrabajo();
      return rutaProyecto(req.params.slug, 'postpro', req.trabajoId);
    },
    VIDEO,
    (_req, limpio) => `original${path.extname(limpio)}`,
  );
  app.post(base, (req, res, next) => {
    try {
      leerProyecto(req.params.slug).then(() => next(), () => res.status(404).json({ error: 'Proyecto no encontrado' }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }, subirVideo.single('video'), r(async (req, res) => {
    if (!req.file) throw new Error('Sube un video');
    const id = req.trabajoId;
    let video;
    try {
      video = await medirVideo(req.file.path);
    } catch (e) {
      await fs.rm(rutaProyecto(req.params.slug, 'postpro', id), { recursive: true, force: true });
      throw new Error(`No se pudo leer el video: ${e.message.split('\n')[0]}`);
    }
    if (!video.audio) {
      await fs.rm(rutaProyecto(req.params.slug, 'postpro', id), { recursive: true, force: true });
      throw new Error('El video no tiene audio: hace falta la voz en off para transcribirla.');
    }
    const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const idioma = ['es', 'en', 'pt', 'fr', 'it', 'de', 'auto'].includes(req.body?.idioma) ? req.body.idioma : AJUSTES_DEFECTO.idioma;
    const t = {
      id,
      titulo: String(req.body?.titulo || '').trim() || path.basename(original, path.extname(original)),
      creado: new Date().toISOString(),
      estado: 'transcribiendo',
      video: { archivo: req.file.filename, nombre: original, bytes: req.file.size, ...video },
      ajustes: { ...AJUSTES_DEFECTO, idioma },
      fragmentos: [],
      rostro: null,
    };
    await guardarTrabajoNuevo(req.params.slug, t);
    await transcribir(req.params.slug, id);
    res.json({ id });
  }));

  app.get(`${base}/:id`, r(async (req, res) => {
    const { slug, id } = req.params;
    const t = await repararTrabajo(slug, await leerTrabajo(slug, id));
    const catalogo = await leerCatalogo();
    const est = estimar(t, catalogo, calibracion(await listarTrabajos(slug)));
    let personaje = null;
    try {
      personaje = JSON.parse(await fs.readFile(rutaTrabajo(slug, id, 'personaje.json'), 'utf8'));
    } catch {
      // Sin personaje todavía.
    }
    let biblia = null;
    try {
      biblia = JSON.parse(await fs.readFile(rutaTrabajo(slug, id, 'biblia.json'), 'utf8'));
    } catch {
      // Sin biblia todavía.
    }
    for (const f of t.fragmentos || []) f.enCurso = clipEnCurso(slug, id, f.id);
    res.json({
      trabajo: t,
      estimacion: est,
      transcribiendo: estaTranscribiendo(slug, id),
      generando: generando(slug, id),
      armandoPrevia: armandoPrevia(slug, id),
      personaje,
      biblia,
      personajeImagen: (await fs.access(rutaTrabajo(slug, id, 'personaje.png')).then(() => true, () => false)) ? `postpro/${id}/personaje.png` : null,
    });
  }));

  app.patch(`${base}/:id`, r(async (req, res) => {
    const b = req.body || {};
    const t = await actualizarTrabajo(req.params.slug, req.params.id, (x) => {
      if (b.titulo !== undefined) x.titulo = String(b.titulo).trim().slice(0, 120) || x.titulo;
      if (b.ajustes) {
        const a = { ...AJUSTES_DEFECTO, ...x.ajustes };
        if (b.ajustes.claude && modeloClaude(b.ajustes.claude).id === b.ajustes.claude) a.claude = b.ajustes.claude;
        if (b.ajustes.video && generador(b.ajustes.video) && !generador(b.ajustes.video).gratis) a.video = b.ajustes.video;
        if (b.ajustes.imagen && modeloImagen(b.ajustes.imagen).id === b.ajustes.imagen) a.imagen = b.ajustes.imagen;
        if (typeof b.ajustes.enfoque === 'string') a.enfoque = b.ajustes.enfoque;
        if (['es', 'en', 'pt', 'fr', 'it', 'de', 'auto'].includes(b.ajustes.idioma)) a.idioma = b.ajustes.idioma;
        if (typeof b.ajustes.sonido === 'boolean') a.sonido = b.ajustes.sonido;
        if (typeof b.ajustes.musica === 'boolean') a.musica = b.ajustes.musica;
        // Los clips ya hechos cuyo sonido cambia quedan marcados para actualizar solo el sonido (gratis).
        for (const f of x.fragmentos || []) if (sonidoCambia(f, sonidoDe(f, x.ajustes), sonidoDe(f, a))) f.sonidoPendiente = true;
        x.ajustes = a;
      }
    });
    res.json(t);
  }));

  app.delete(`${base}/:id`, r(async (req, res) => {
    const { slug, id } = req.params;
    if (generando(slug, id) || estaTranscribiendo(slug, id)) throw new Error('Detén el trabajo antes de borrarlo');
    rutaTrabajo(slug, id); // valida el id
    await fs.rm(rutaProyecto(slug, 'postpro', id), { recursive: true, force: true });
    if (req.query.salidas === '1') await fs.rm(rutaProyecto(slug, 'salidas', id), { recursive: true, force: true });
    res.json({ ok: true });
  }));

  app.post(`${base}/:id/transcribir`, r(async (req, res) => {
    const { slug, id } = req.params;
    if (generando(slug, id)) throw new Error('Espera a que termine la generación');
    await transcribir(slug, id);
    res.json({ ok: true });
  }));

  // Importar subtítulos (SRT/VTT) del editor en vez de transcribir.
  const subirSubtitulos = subidaA((req) => rutaTrabajo(req.params.slug, req.params.id, 'transcripcion'), SUBTITULOS, (_req, limpio) => `importado${path.extname(limpio)}`);
  app.post(`${base}/:id/subtitulos`, subirSubtitulos.single('archivo'), r(async (req, res) => {
    if (!req.file) throw new Error('Sube un archivo .srt o .vtt');
    const { slug, id } = req.params;
    if (generando(slug, id)) throw new Error('Espera a que termine la generación');
    await transcribir(slug, id, { importar: `transcripcion/${req.file.filename}` });
    res.json({ ok: true });
  }));

  // Corregir una palabra mal transcrita (no cambia los tiempos).
  app.patch(`${base}/:id/palabras/:n`, r(async (req, res) => {
    const n = Number(req.params.n);
    const texto = String(req.body?.texto || '').trim();
    if (!texto || /\s/.test(texto)) throw new Error('Escribe una sola palabra');
    await actualizarTrabajo(req.params.slug, req.params.id, (x) => {
      const p = x.transcripcion?.palabras?.[n];
      if (!p) throw new Error('Palabra no encontrada');
      p.t = texto.slice(0, 60);
      for (const f of x.fragmentos) if (n >= f.desde && n <= f.hasta) Object.assign(f, armarFragmento(x, {}, { ...f, desde: f.desde, hasta: f.hasta }));
    });
    res.json({ ok: true });
  }));

  const subirRostro = subidaA((req) => rutaTrabajo(req.params.slug, req.params.id), IMAGEN, (_req, limpio) => `rostro-${Date.now().toString(36)}${path.extname(limpio)}`);
  app.post(`${base}/:id/rostro`, subirRostro.single('imagen'), r(async (req, res) => {
    if (!req.file) throw new Error('Sube una imagen JPG, PNG o WebP');
    const { slug, id } = req.params;
    if (generando(slug, id)) throw new Error('Espera a que termine la generación');
    await actualizarTrabajo(slug, id, async (x) => {
      if (x.rostro) await fs.rm(rutaTrabajo(slug, id, x.rostro), { force: true });
      x.rostro = req.file.filename;
      // Con otro rostro hay que volver a preparar la persona.
      if (x.preparacion) x.preparacion.estado = 'pendiente';
    });
    res.json({ ok: true });
  }));
  app.delete(`${base}/:id/rostro`, r(async (req, res) => {
    const { slug, id } = req.params;
    if (generando(slug, id)) throw new Error('Espera a que termine la generación');
    await actualizarTrabajo(slug, id, async (x) => {
      if (x.rostro) await fs.rm(rutaTrabajo(slug, id, x.rostro), { force: true });
      x.rostro = null;
      if (x.preparacion) x.preparacion.estado = 'pendiente';
    });
    res.json({ ok: true });
  }));
  // Rehacer la biblia visual y el personaje en la próxima generación.
  app.post(`${base}/:id/rehacer-personaje`, r(async (req, res) => {
    await actualizarTrabajo(req.params.slug, req.params.id, (x) => {
      if (x.preparacion) x.preparacion.estado = 'pendiente';
    });
    res.json({ ok: true });
  }));

  const subirRefs = subidaA((req) => rutaTrabajo(req.params.slug, req.params.id, 'refs'), IMAGEN);
  app.post(`${base}/:id/refs`, subirRefs.array('imagenes', 6), r(async (req, res) => {
    res.json({ nombres: (req.files || []).map((f) => f.filename) });
  }));

  app.post(`${base}/:id/fragmentos`, r(async (req, res) => {
    const b = req.body || {};
    const f = await actualizarTrabajo(req.params.slug, req.params.id, (x) => {
      const nuevo = armarFragmento(x, { ...b, desde: Number(b.desde), hasta: Number(b.hasta) });
      x.fragmentos.push(nuevo);
      return nuevo;
    });
    res.json(f);
  }));

  app.patch(`${base}/:id/fragmentos/:fid`, r(async (req, res) => {
    const b = { ...req.body };
    if (b.desde !== undefined) b.desde = Number(b.desde);
    if (b.hasta !== undefined) b.hasta = Number(b.hasta);
    const f = await actualizarTrabajo(req.params.slug, req.params.id, (x) => {
      const i = x.fragmentos.findIndex((y) => y.id === req.params.fid);
      if (i < 0) throw new Error('Fragmento no encontrado');
      editable(x.fragmentos[i]);
      const antes = x.fragmentos[i];
      const nuevo = armarFragmento(x, b, antes);
      // Si cambia lo que define el clip, el resultado anterior queda desactualizado.
      const clave = (y) => JSON.stringify([y.inicio, y.fin, y.tipo, y.enfoque, y.generador, y.persona, y.nota, y.refs]);
      if (antes.estado === 'listo' && clave(antes) !== clave(nuevo)) nuevo.estado = 'cambiado';
      if (sonidoCambia(nuevo, sonidoDe(antes, x.ajustes), sonidoDe(nuevo, x.ajustes))) nuevo.sonidoPendiente = true;
      x.fragmentos[i] = nuevo;
      return nuevo;
    });
    res.json(f);
  }));

  app.delete(`${base}/:id/fragmentos/:fid`, r(async (req, res) => {
    const { slug, id, fid } = req.params;
    const t = await actualizarTrabajo(slug, id, async (x) => {
      const f = x.fragmentos.find((y) => y.id === fid);
      if (!f) return;
      editable(f);
      if (f.salida) await fs.rm(rutaProyecto(slug, 'salidas', id, f.salida), { force: true });
      await fs.rm(rutaTrabajo(slug, id, 'frag', fid), { recursive: true, force: true });
      x.fragmentos = x.fragmentos.filter((y) => y.id !== fid);
    });
    await escribirIndices(slug, t, await leerCatalogo());
    res.json({ ok: true });
  }));

  app.get(`${base}/:id/fragmentos/:fid/registro`, r(async (req, res) => {
    const { slug, id, fid } = req.params;
    const carpeta = fid === 'prep' ? rutaTrabajo(slug, id, 'prep') : rutaTrabajo(slug, id, 'frag', fid);
    const texto = await fs.readFile(path.join(carpeta, 'registro.txt'), 'utf8').catch(() => '');
    res.type('text/plain').send(texto.slice(-30000) || 'Sin actividad todavía.');
  }));

  app.get(`${base}/:id/estimacion`, r(async (req, res) => {
    const { slug, id } = req.params;
    const t = await leerTrabajo(slug, id);
    const ids = String(req.query.fragmentos || '').split(',').filter(Boolean);
    const elegidos = ids.length ? t.fragmentos.filter((f) => ids.includes(f.id)) : t.fragmentos.filter((f) => f.estado !== 'listo');
    res.json(estimar({ ...t, fragmentos: elegidos }, await leerCatalogo(), calibracion(await listarTrabajos(slug))));
  }));

  app.post(`${base}/:id/generar`, r(async (req, res) => {
    const b = req.body || {};
    const est = await iniciarGeneracion(req.params.slug, req.params.id, {
      fragmentos: Array.isArray(b.fragmentos) && b.fragmentos.length ? b.fragmentos : null,
      topeTotal: b.topeTotal,
      cambios: b.cambios,
    });
    res.json({ ok: true, estimacion: est });
  }));

  // Rehacer solo el sonido de clips ya generados (no gasta créditos).
  app.post(`${base}/:id/sonido`, r(async (req, res) => {
    const ids = Array.isArray(req.body?.fragmentos) ? req.body.fragmentos : [];
    if (!ids.length) throw new Error('Elige los clips');
    res.json(await iniciarGeneracion(req.params.slug, req.params.id, { fragmentos: ids, soloSonido: true }));
  }));

  app.post(`${base}/:id/detener`, r(async (req, res) => res.json({ ok: await detenerGeneracion(req.params.slug, req.params.id) })));

  app.post(`${base}/:id/vista-previa`, r(async (req, res) => {
    await armarVistaPrevia(req.params.slug, req.params.id);
    res.json({ ok: true });
  }));

  // Abre la carpeta de clips en el Finder (solo en el Mac donde corre el estudio).
  app.post(`${base}/:id/abrir-carpeta`, r(async (req, res) => {
    const dir = rutaProyecto(req.params.slug, 'salidas', req.params.id);
    await fs.mkdir(dir, { recursive: true });
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    exec(`${cmd} "${dir.replace(/"/g, '\\"')}"`, () => {});
    res.json({ ok: true, carpeta: dir });
  }));
}

