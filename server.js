import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import * as store from './lib/store.js';
import { CATEGORIAS, FORMATOS, PLATAFORMAS, MODOS, categoria } from './lib/rutas.js';
import { analizarWeb } from './lib/webs.js';
import { generarFicha, archivosSinResumen, promptDigerir, promptStoryboard, promptProduccion, promptAjuste } from './lib/contexto.js';
import { ejecutar, detener, enCurso, registrarCreditos, config } from './lib/runner.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT || 4173);
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(RAIZ, 'public')));
app.use('/archivos', express.static(store.ESPACIOS, { dotfiles: 'deny' }));

const plantillaClaude = () => fs.readFile(path.join(RAIZ, 'templates', 'CLAUDE.md'), 'utf8');
const estilos = JSON.parse(await fs.readFile(path.join(RAIZ, 'data', 'estilos.json'), 'utf8'));

// Envuelve rutas async para devolver errores como JSON.
const r = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(e.status || 400).json({ error: e.message });
  });

app.get('/api/meta', r(async (_req, res) => {
  const cfg = await config();
  res.json({ categorias: CATEGORIAS, formatos: FORMATOS, plataformas: PLATAFORMAS, modos: MODOS, secciones: store.SECCIONES, espacios: store.ESPACIOS, claude: cfg.claude });
}));

app.get('/api/proyectos', r(async (_req, res) => res.json(await store.listarProyectos())));

app.post('/api/proyectos', r(async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) throw new Error('El proyecto necesita un nombre');
  const slug = await store.crearProyecto(nombre, await plantillaClaude());
  if (req.body.descripcion) {
    const p = await store.leerProyecto(slug);
    p.descripcion = String(req.body.descripcion);
    await store.guardarProyecto(slug, p);
  }
  await generarFicha(slug);
  res.json({ slug });
}));

app.get('/api/proyectos/:slug', r(async (req, res) => {
  const { slug } = req.params;
  const proyecto = await store.leerProyecto(slug);
  const archivos = {};
  for (const s of [...Object.keys(store.SECCIONES), 'salidas']) archivos[s] = await store.listarArchivos(slug, s);
  const pedidos = await store.listarPedidos(slug);
  for (const p of pedidos) p.enCurso = enCurso(slug, p.id);
  const consumo = { costoUsd: 0, tokens: 0, creditos: 0 };
  for (const p of pedidos) for (const e of p.ejecuciones || []) {
    consumo.costoUsd += e.costoUsd || 0;
    consumo.tokens += (e.tokens?.entrada || 0) + (e.tokens?.salida || 0);
  }
  for (const e of proyecto.ejecucionesContexto || []) {
    consumo.costoUsd += e.costoUsd || 0;
    consumo.tokens += (e.tokens?.entrada || 0) + (e.tokens?.salida || 0);
  }
  consumo.creditos = (proyecto.gastos || []).reduce((s, g) => s + (Number(g.creditos) || 0), 0);
  res.json({ slug, proyecto, archivos, pedidos, consumo, digiriendo: enCurso(slug, 'digerir') });
}));

const EDITABLES = ['nombre', 'descripcion', 'color', 'identidad', 'requerimientos', 'presupuesto', 'referentes'];
app.patch('/api/proyectos/:slug', r(async (req, res) => {
  const p = await store.leerProyecto(req.params.slug);
  for (const k of EDITABLES) if (k in req.body) p[k] = req.body[k];
  await store.guardarProyecto(req.params.slug, p);
  await generarFicha(req.params.slug);
  res.json(p);
}));

const subida = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      try {
        if (!store.SECCIONES[req.params.seccion]) throw new Error('Sección desconocida');
        cb(null, store.rutaProyecto(req.params.slug, req.params.seccion));
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, f, cb) => {
      // multer entrega el nombre en latin1; se reconvierte para conservar tildes antes de limpiarlo.
      const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const limpio = store.nombreSeguro(original);
      const ext = path.extname(limpio);
      cb(null, `${path.basename(limpio, ext)}-${Date.now().toString(36)}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 ** 3 },
});

app.post('/api/proyectos/:slug/archivos/:seccion', subida.array('archivos', 50), r(async (req, res) => {
  await generarFicha(req.params.slug);
  res.json({ subidos: req.files.length });
}));

app.post('/api/proyectos/:slug/textos/:seccion', r(async (req, res) => {
  const { slug, seccion } = req.params;
  if (!store.SECCIONES[seccion]) throw new Error('Sección desconocida');
  const titulo = String(req.body?.titulo || 'texto').trim();
  const texto = String(req.body?.texto || '').trim();
  if (!texto) throw new Error('El texto está vacío');
  const nombre = `${store.slugify(titulo)}-${Date.now().toString(36)}.md`;
  await fs.writeFile(store.rutaProyecto(slug, seccion, nombre), `# ${titulo}\n\n${texto}\n`);
  await generarFicha(slug);
  res.json({ ruta: `${seccion}/${nombre}` });
}));

app.delete('/api/proyectos/:slug/archivos', r(async (req, res) => {
  await store.borrarArchivo(req.params.slug, String(req.query.ruta || ''));
  await generarFicha(req.params.slug);
  res.json({ ok: true });
}));

app.post('/api/proyectos/:slug/webs', r(async (req, res) => {
  const { slug } = req.params;
  let url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const p = await store.leerProyecto(slug);
  let datos;
  try {
    datos = await analizarWeb(url);
  } catch (e) {
    datos = { url, titulo: '', descripcion: '', colores: [], fuentes: [], error: `No se pudo leer la web (${e.message})`, analizado: new Date().toISOString() };
  }
  datos.nota = String(req.body?.nota || '');
  p.webs = (p.webs || []).filter((w) => w.url !== datos.url).concat(datos);
  await store.guardarProyecto(slug, p);
  await fs.writeFile(store.rutaProyecto(slug, 'webs', `${store.slugify(new URL(datos.url).hostname + new URL(datos.url).pathname)}.json`), JSON.stringify(datos, null, 2));
  await generarFicha(slug);
  res.json(datos);
}));

app.delete('/api/proyectos/:slug/webs', r(async (req, res) => {
  const p = await store.leerProyecto(req.params.slug);
  p.webs = (p.webs || []).filter((w) => w.url !== req.query.url);
  await store.guardarProyecto(req.params.slug, p);
  await generarFicha(req.params.slug);
  res.json({ ok: true });
}));

app.get('/api/proyectos/:slug/ficha', r(async (req, res) => {
  res.type('text/plain').send(await generarFicha(req.params.slug));
}));

// Digerir material: resume una vez cada archivo nuevo con el modelo más barato.
app.get('/api/proyectos/:slug/digerir', r(async (req, res) => {
  res.json({ pendientes: await archivosSinResumen(req.params.slug), enCurso: enCurso(req.params.slug, 'digerir') });
}));

app.post('/api/proyectos/:slug/digerir', r(async (req, res) => {
  const { slug } = req.params;
  const pendientes = await archivosSinResumen(slug);
  if (!pendientes.length) return res.json({ pendientes: 0 });
  const cfg = await config();
  const inicio = new Date().toISOString();
  await ejecutar({
    slug, id: 'digerir', fase: 'digerir', modelo: cfg.modelos.digerir, prompt: promptDigerir(pendientes),
    carpetaRegistro: store.rutaProyecto(slug, 'resumenes'),
    alTerminar: async (rs) => {
      const p = await store.leerProyecto(slug);
      p.ejecucionesContexto = [...(p.ejecucionesContexto || []), { fase: 'digerir', inicio, fin: new Date().toISOString(), ok: rs.ok, costoUsd: rs.costoUsd, tokens: rs.tokens }];
      await store.guardarProyecto(slug, p);
      await generarFicha(slug);
    },
  });
  res.json({ pendientes: pendientes.length });
}));

// ---- Pedidos ----

function nuevoId(cat) {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}-${cat}`;
}

app.post('/api/proyectos/:slug/pedidos', r(async (req, res) => {
  const { slug } = req.params;
  const b = req.body || {};
  const cat = categoria(b.categoria);
  const modo = MODOS[b.modo] ? b.modo : 'equilibrado';
  const pedido = {
    id: nuevoId(cat.id),
    categoria: cat.id,
    titulo: String(b.titulo || '').trim() || cat.titulo,
    objetivo: String(b.objetivo || ''),
    mensaje: String(b.mensaje || ''),
    formato: FORMATOS.includes(b.formato) ? b.formato : cat.formato,
    duracion: Number(b.duracion) || cat.duracion,
    plataformas: Array.isArray(b.plataformas) ? b.plataformas : [],
    archivos: Array.isArray(b.archivos) ? b.archivos : [],
    estilo: b.estilo || null,
    notas: String(b.notas || ''),
    modo,
    topeCreditos: Number.isFinite(Number(b.topeCreditos)) && b.topeCreditos !== '' ? Number(b.topeCreditos) : MODOS[modo].topeCreditos,
    estado: 'borrador',
    creado: new Date().toISOString(),
    ejecuciones: [],
  };
  await store.guardarPedido(slug, pedido);
  if (b.iniciar) await lanzar(slug, pedido, 'storyboard');
  res.json(pedido);
}));

async function lanzar(slug, pedido, fase, extra = '') {
  await generarFicha(slug);
  const prompt =
    fase === 'storyboard' ? promptStoryboard(slug, pedido) : fase === 'produccion' ? promptProduccion(slug, pedido, extra) : promptAjuste(slug, pedido, extra);
  const modelo = MODOS[pedido.modo]?.modelo || 'opus';
  const inicio = new Date().toISOString();
  pedido.estado = fase === 'storyboard' ? 'creando-storyboard' : 'produciendo';
  await store.guardarPedido(slug, pedido);
  await ejecutar({
    slug, id: pedido.id, fase, prompt, modelo,
    carpetaRegistro: store.rutaProyecto(slug, 'pedidos', pedido.id),
    alTerminar: async (rs) => {
      const p = await store.leerPedido(slug, pedido.id);
      p.ejecuciones.push({ fase, modelo, inicio, fin: new Date().toISOString(), ok: rs.ok, costoUsd: rs.costoUsd, tokens: rs.tokens, resumen: rs.texto.slice(0, 600) });
      if (!rs.ok) p.estado = 'error';
      else if (fase === 'storyboard') p.estado = 'por-aprobar';
      else p.estado = 'listo';
      if (fase !== 'storyboard') p.creditosGastados = await registrarCreditos(slug, p.id);
      await store.guardarPedido(slug, p);
    },
  });
}

app.get('/api/proyectos/:slug/pedidos/:id', r(async (req, res) => {
  const { slug, id } = req.params;
  const pedido = await store.leerPedido(slug, id);
  const registro = (await store.leerTexto(slug, 'pedidos', id, 'registro.txt')) || '';
  let estimacion = null;
  try {
    estimacion = JSON.parse(await store.leerTexto(slug, 'pedidos', id, 'estimacion.json'));
  } catch {
    // Aún sin estimación.
  }
  const listar = async (...partes) => {
    try {
      const dir = store.rutaProyecto(slug, ...partes);
      return (await fs.readdir(dir)).filter((n) => !n.startsWith('.')).map((n) => ({ nombre: n, ruta: [...partes, n].join('/'), tipo: store.tipoDe(n) }));
    } catch {
      return [];
    }
  };
  res.json({
    pedido,
    enCurso: enCurso(slug, id),
    storyboard: await store.leerTexto(slug, 'pedidos', id, 'storyboard.md'),
    estimacion,
    registro: registro.slice(-20000),
    previas: await listar('pedidos', id, 'previas'),
    salidas: await listar('salidas', id),
    prompt: promptStoryboard(slug, pedido),
  });
}));

app.post('/api/proyectos/:slug/pedidos/:id/storyboard', r(async (req, res) => {
  const pedido = await store.leerPedido(req.params.slug, req.params.id);
  await lanzar(req.params.slug, pedido, 'storyboard');
  res.json({ ok: true });
}));

app.post('/api/proyectos/:slug/pedidos/:id/aprobar', r(async (req, res) => {
  const pedido = await store.leerPedido(req.params.slug, req.params.id);
  if (req.body?.topeCreditos !== undefined) pedido.topeCreditos = Number(req.body.topeCreditos) || 0;
  pedido.aprobado = new Date().toISOString();
  await lanzar(req.params.slug, pedido, 'produccion', String(req.body?.comentarios || ''));
  res.json({ ok: true });
}));

app.post('/api/proyectos/:slug/pedidos/:id/ajustar', r(async (req, res) => {
  const cambios = String(req.body?.cambios || '').trim();
  if (!cambios) throw new Error('Describe los cambios');
  const pedido = await store.leerPedido(req.params.slug, req.params.id);
  await lanzar(req.params.slug, pedido, 'ajuste', cambios);
  res.json({ ok: true });
}));

app.post('/api/proyectos/:slug/pedidos/:id/detener', r(async (req, res) => {
  res.json({ ok: detener(req.params.slug, req.params.id) });
}));

// ---- Galería de estilos (awesome-opus5-5-videos) ----
app.get('/api/estilos', r(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const cat = String(req.query.cat || '');
  const pagina = Math.max(0, Number(req.query.pagina) || 0);
  let lista = estilos.filter((e) => e.prompt && !e.prompt_partial);
  if (cat) lista = lista.filter((e) => e.category === cat);
  if (q) lista = lista.filter((e) => `${e.prompt} ${e.tech_tags.join(' ')} ${e.author}`.toLowerCase().includes(q));
  const POR_PAGINA = 24;
  res.json({
    total: lista.length,
    pagina,
    items: lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map((e) => ({
      slug: e.slug, autor: e.author, categoria: e.category, tecnica: e.tech_tags.join(', '), prompt: e.prompt, poster: e.poster_url, url: e.skillry_url, post: e.post_url,
    })),
  });
}));

app.listen(PUERTO, process.env.HOST || '127.0.0.1', () => {
  console.log(`\n  Estudio de videos listo en http://localhost:${PUERTO}`);
  console.log(`  Proyectos guardados en ${store.ESPACIOS}\n`);
  // Abre el navegador al iniciar, salvo que se pida lo contrario.
  if (!process.env.NO_ABRIR) {
    const url = `http://localhost:${PUERTO}`;
    const cmd = process.platform === 'darwin' ? `open ${url}` : process.platform === 'win32' ? `start "" ${url}` : `xdg-open ${url}`;
    exec(cmd, () => {});
  }
});
