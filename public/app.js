// Interfaz del Estudio de videos. Sin dependencias: rutas por hash y render con plantillas.
import { montarPostpro } from './postpro.js';

const $app = document.getElementById('app');
const $migas = document.getElementById('migas');
const $modal = document.getElementById('modal');
let META = null;
let sondeo = null;

// Un solo sondeo activo a la vez. Antes, al recargar la vista sin limpiar el anterior,
// el intervalo viejo seguía llamando a recargar() cada pocos segundos y la página parpadeaba.
function vigilar(fn, ms) {
  clearInterval(sondeo);
  sondeo = setInterval(fn, ms);
}
function dejarDeVigilar() {
  clearInterval(sondeo);
  sondeo = null;
}

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const num = (n) => new Intl.NumberFormat('es').format(Math.round(n || 0));

async function api(ruta, opciones = {}) {
  const init = { ...opciones };
  if (opciones.json !== undefined) {
    init.body = JSON.stringify(opciones.json);
    init.headers = { 'content-type': 'application/json' };
    init.method = opciones.method || 'POST';
  }
  const r = await fetch(`/api${ruta}`, init);
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(datos.error || 'Error inesperado');
  return datos;
}

function aviso(texto) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.hidden = true), 2600);
}

function abrirModal(html, angosta = false) {
  $modal.innerHTML = `<div class="caja ${angosta ? 'angosta' : ''}">${html}</div>`;
  $modal.hidden = false;
  return $modal.querySelector('.caja');
}
function cerrarModal() {
  $modal.hidden = true;
  $modal.innerHTML = '';
}
$modal.addEventListener('click', (e) => e.target === $modal && cerrarModal());
document.addEventListener('keydown', (e) => e.key === 'Escape' && cerrarModal());

// Tema claro/oscuro recordado en el navegador.
try {
  const t = localStorage.getItem('tema');
  if (t) document.documentElement.dataset.theme = t;
} catch {}
document.getElementById('tema').onclick = () => {
  const oscuro = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = oscuro ? 'light' : 'dark';
  try {
    localStorage.setItem('tema', document.documentElement.dataset.theme);
  } catch {}
};

// Markdown mínimo para mostrar storyboards.
function md(texto) {
  if (!texto) return '';
  const lineas = texto.replace(/\r/g, '').split('\n');
  let html = '';
  let i = 0;
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>');
  while (i < lineas.length) {
    const l = lineas[i];
    if (l.startsWith('```')) {
      const bloque = [];
      i++;
      while (i < lineas.length && !lineas[i].startsWith('```')) bloque.push(lineas[i++]);
      html += `<pre>${esc(bloque.join('\n'))}</pre>`;
      i++;
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const filas = [];
      while (i < lineas.length && /^\|.*\|\s*$/.test(lineas[i])) filas.push(lineas[i++]);
      const celdas = (f) => f.trim().slice(1, -1).split('|').map((c) => c.trim());
      const cuerpo = filas.filter((f) => !/^\|[\s:|-]+\|\s*$/.test(f));
      html += '<table>' + cuerpo.map((f, n) => `<tr>${celdas(f).map((c) => (n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('') + '</table>';
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const n = Math.min(3, h[1].length + 1);
      html += `<h${n}>${inline(h[2])}</h${n}>`;
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      html += '<ul>';
      while (i < lineas.length && /^\s*([-*]|\d+\.)\s+/.test(lineas[i])) html += `<li>${inline(lineas[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`;
      html += '</ul>';
      continue;
    }
    if (l.trim()) html += `<p>${inline(l)}</p>`;
    i++;
  }
  return html;
}

function vistaArchivo(slug, a, { borrar = true } = {}) {
  const url = `/archivos/${slug}/${a.ruta.split('/').map(encodeURIComponent).join('/')}`;
  let vista = '<div class="vista">📄</div>';
  if (a.tipo === 'imagen') vista = `<div class="vista"><img loading="lazy" src="${url}" alt=""></div>`;
  if (a.tipo === 'video') vista = `<div class="vista"><video src="${url}#t=0.5" preload="metadata" controls></video></div>`;
  if (a.tipo === 'audio') vista = `<div class="vista">🎙️</div><audio src="${url}" controls preload="none"></audio>`;
  return `<div class="archivo">${vista}
    <div class="nombre" title="${esc(a.nombre)}">${esc(a.nombre)}</div>
    <div class="fila entre"><span class="mini">${a.bytes ? kb(a.bytes) : ''}</span>
      <span class="fila" style="gap:6px"><a class="btn chico" href="${url}" target="_blank">Abrir</a>
      ${borrar ? `<button class="btn chico peligro" data-borrar="${esc(a.ruta)}">Quitar</button>` : ''}</span></div>
  </div>`;
}

// ---------- rutas ----------
async function enrutar() {
  dejarDeVigilar();
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!META) META = await api('/meta');
  try {
    if (partes[0] === 'p' && partes[1]) await vistaProyecto(partes[1], partes[2] || 'resumen', partes[3]);
    else await vistaInicio();
  } catch (e) {
    $app.innerHTML = `<div class="panel vacio">No se pudo cargar: ${esc(e.message)}<br><br><a class="btn" href="#/">Volver al inicio</a></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', enrutar);

// ---------- inicio ----------
async function vistaInicio() {
  $migas.innerHTML = '';
  const proyectos = await api('/proyectos');
  $app.innerHTML = `
    <div class="encabezado"><div><h1>Tus proyectos</h1>
      <p class="sutil">Cada proyecto es una marca o identidad visual con su propio material, reglas y pedidos.</p></div></div>
    <div class="rejilla">
      <button class="tarjeta-nueva" id="nuevo">＋ Nuevo proyecto</button>
      ${proyectos
        .map(
          (p) => `<a class="panel tarjeta-proyecto" href="#/p/${p.slug}">
        <div class="franja">${(p.colores.length ? p.colores.slice(0, 6) : [{ hex: p.color }]).map((c) => `<i style="background:${esc(c.hex)}"></i>`).join('')}</div>
        <h2>${esc(p.nombre)}</h2>
        <p class="sutil">${esc(p.descripcion || 'Sin descripción')}</p>
        <div class="fila mini"><span>${p.pedidos} pedidos</span>·<span>${num(p.creditosGastados)} créditos</span>·<span>${fecha(p.actualizado)}</span></div>
      </a>`,
        )
        .join('')}
    </div>`;
  document.getElementById('nuevo').onclick = () => {
    const caja = abrirModal(
      `<form class="pila" id="f"><h2>Nuevo proyecto</h2>
        <label class="campo">Nombre de la marca o proyecto<input type="text" name="nombre" required autofocus placeholder="Ej. Café Altura"></label>
        <label class="campo">Descripción breve<span class="ayuda">Qué es, qué vende o comunica.</span><textarea name="descripcion" placeholder="Tostadores de café de especialidad en Medellín..."></textarea></label>
        <div class="fila entre"><button type="button" class="btn" id="cancelar">Cancelar</button><button class="btn primario">Crear proyecto</button></div></form>`,
      true,
    );
    caja.querySelector('#cancelar').onclick = cerrarModal;
    caja.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { slug } = await api('/proyectos', { json: Object.fromEntries(fd) });
      cerrarModal();
      location.hash = `#/p/${slug}/identidad`;
    };
  };
}

// ---------- proyecto ----------
const MENU = [
  { grupo: 'Proyecto', items: [['resumen', 'Resumen']] },
  {
    grupo: 'Contexto',
    items: [
      ['identidad', 'Identidad visual'],
      ['webs', 'Webs'],
      ['guiones', 'Guiones'],
      ['voces', 'Voces en off'],
      ['referentes', 'Referentes'],
      ['material', 'Material propio'],
      ['musica', 'Música y efectos'],
      ['requerimientos', 'Requerimientos'],
    ],
  },
  {
    grupo: 'Producción',
    items: [
      ['nuevo', '＋ Nuevo pedido'],
      ['pedidos', 'Pedidos'],
      ['postpro', 'Auto postproducción'],
      ['biblioteca', 'Biblioteca'],
    ],
  },
];

async function vistaProyecto(slug, seccion, extra) {
  dejarDeVigilar();
  const d = await api(`/proyectos/${slug}`);
  const p = d.proyecto;
  const conteo = (k) => {
    if (k === 'webs') return p.webs?.length || 0;
    if (k === 'referentes') return (d.archivos.referentes?.length || 0) + (p.referentes?.length || 0);
    if (k === 'pedidos') return d.pedidos.length;
    if (k === 'postpro') return d.postpro || 0;
    if (k === 'biblioteca') return d.archivos.salidas?.length || 0;
    return d.archivos[k]?.length ?? '';
  };
  $migas.innerHTML = `<span>/</span><a href="#/p/${slug}">${esc(p.nombre)}</a>`;
  $app.innerHTML = `<div class="proyecto">
    <aside class="lateral">
      ${MENU.map(
        (g) => `<div class="grupo"><b>${g.grupo}</b>${g.items
          .map(([k, t]) => `<a href="#/p/${slug}/${k}" class="${k === seccion ? 'activo' : ''}">${t}<span class="n">${conteo(k) || ''}</span></a>`)
          .join('')}</div>`,
      ).join('')}
      <div class="consumo">
        <b style="margin-bottom:4px">Consumo del proyecto</b>
        <div><span>Créditos Higgsfield</span><b>${num(d.consumo.creditos)}</b></div>
        <div><span>Tokens Claude</span><b>${num(d.consumo.tokens)}</b></div>
        <div><span>Costo estimado</span><b>US$ ${d.consumo.costoUsd.toFixed(2)}</b></div>
      </div>
      <a href="/api/proyectos/${slug}/ficha" target="_blank" class="mini">Ver ficha de contexto ↗</a>
    </aside>
    <section id="contenido"></section></div>`;
  const $c = document.getElementById('contenido');
  const recargar = () => vistaProyecto(slug, seccion, extra);
  const vistas = { resumen: vResumen, identidad: vIdentidad, webs: vWebs, guiones: vGuiones, voces: vSeccionArchivos, referentes: vReferentes, material: vSeccionArchivos, musica: vSeccionArchivos, requerimientos: vRequerimientos, nuevo: vNuevoPedido, pedidos: vPedidos, biblioteca: vBiblioteca };
  if (seccion === 'pedidos' && extra) return vPedido($c, d, extra, recargar);
  if (seccion === 'postpro') return montarPostpro({ api, esc, aviso, abrirModal, cerrarModal, vigilar, dejarDeVigilar, fecha, num }, $c, d, recargar, extra);
  await (vistas[seccion] || vResumen)($c, d, recargar, seccion);
  // Botones "Quitar" de cualquier archivo.
  $c.querySelectorAll('[data-borrar]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Quitar este archivo del proyecto?')) return;
      await api(`/proyectos/${slug}/archivos?ruta=${encodeURIComponent(b.dataset.borrar)}`, { method: 'DELETE' });
      aviso('Archivo quitado');
      recargar();
    };
  });
}

const guardar = (slug, cambios) => api(`/proyectos/${slug}`, { json: cambios, method: 'PATCH' });

function zonaSubida(slug, seccion, texto, alSubir) {
  const id = `z-${seccion}`;
  setTimeout(() => {
    const zona = document.getElementById(id);
    if (!zona) return;
    const input = zona.querySelector('input');
    const subir = async (archivos) => {
      if (!archivos.length) return;
      const fd = new FormData();
      for (const f of archivos) fd.append('archivos', f);
      zona.querySelector('b').innerHTML = `<span class="girando"></span> Subiendo ${archivos.length} archivo(s)…`;
      const r = await fetch(`/api/proyectos/${slug}/archivos/${seccion}`, { method: 'POST', body: fd });
      if (!r.ok) aviso('No se pudo subir');
      else aviso('Archivos subidos');
      alSubir();
    };
    zona.onclick = () => input.click();
    input.onchange = () => subir([...input.files]);
    zona.ondragover = (e) => {
      e.preventDefault();
      zona.classList.add('sobre');
    };
    zona.ondragleave = () => zona.classList.remove('sobre');
    zona.ondrop = (e) => {
      e.preventDefault();
      zona.classList.remove('sobre');
      subir([...e.dataTransfer.files]);
    };
  });
  return `<div class="zona" id="${id}"><input type="file" multiple hidden accept="${esc(META.secciones[seccion]?.acepta || '')}">
    <b>Arrastra archivos aquí o haz clic</b><span class="mini">${esc(texto)}</span></div>`;
}

const galeria = (slug, archivos) =>
  archivos.length ? `<div class="rejilla chica">${archivos.map((a) => vistaArchivo(slug, a)).join('')}</div>` : '';

// ---------- secciones ----------
function vResumen($c, d, recargar) {
  const p = d.proyecto;
  const pasos = [
    ['identidad', 'Identidad visual: colores, tipografías o manual', (p.identidad?.colores?.length || 0) + d.archivos.identidad.length > 0],
    ['webs', 'Al menos una web analizada', (p.webs?.length || 0) > 0],
    ['requerimientos', 'Público, tono y plataformas', !!(p.requerimientos?.publico || p.requerimientos?.tono)],
    ['guiones', 'Guiones (opcional)', d.archivos.guiones.length > 0],
    ['referentes', 'Referentes de estilo (opcional)', d.archivos.referentes.length + (p.referentes?.length || 0) > 0],
    ['material', 'Material propio: fotos o videos (opcional)', d.archivos.material.length > 0],
  ];
  const hechos = pasos.filter((x) => x[2]).length;
  $c.innerHTML = `
    <div class="encabezado"><div><h1>${esc(p.nombre)}</h1><p class="sutil">${esc(p.descripcion || 'Agrega una descripción en Identidad visual.')}</p></div>
      <a class="btn primario" href="#/p/${d.slug}/nuevo">＋ Nuevo pedido</a></div>
    <div class="dos">
      <div class="panel pila">
        <div class="fila entre"><h2>Contexto del proyecto</h2><span class="mini">${hechos}/${pasos.length}</span></div>
        <div class="progreso"><i style="width:${(hechos / pasos.length) * 100}%"></i></div>
        <div>${pasos.map(([k, t, ok]) => `<a href="#/p/${d.slug}/${k}" class="check ${ok ? 'hecho' : ''}" style="color:inherit"><span class="marca-check">${ok ? '✓' : ''}</span>${t}</a>`).join('')}</div>
        <div id="digerir"></div>
      </div>
      <div class="panel pila">
        <div class="fila entre"><h2>Últimos pedidos</h2><a href="#/p/${d.slug}/pedidos" class="mini">Ver todos</a></div>
        ${d.pedidos.length ? `<div>${d.pedidos.slice(0, 5).map((x) => filaPedido(d.slug, x)).join('')}</div>` : '<p class="vacio">Aún no hay pedidos.</p>'}
      </div>
    </div>`;
  pintarDigerir(d.slug, d.digiriendo, recargar);
}

async function pintarDigerir(slug, enCurso, recargar) {
  const el = document.getElementById('digerir');
  if (!el) return;
  const { pendientes } = await api(`/proyectos/${slug}/digerir`);
  if (enCurso) {
    el.innerHTML = `<div class="aviso-caja info"><span class="girando"></span> Analizando el material nuevo con el modelo más económico…</div>`;
    vigilar(async () => {
      const r = await api(`/proyectos/${slug}/digerir`);
      if (!r.enCurso) {
        dejarDeVigilar();
        recargar();
      }
    }, 4000);
    return;
  }
  if (!pendientes.length) {
    el.innerHTML = '<p class="mini">Todo el material ya está resumido en la ficha de contexto.</p>';
    return;
  }
  el.innerHTML = `<div class="aviso-caja"><div class="fila entre"><span>${pendientes.length} archivo(s) sin analizar. Se resumen una sola vez para no gastar tokens en cada pedido.</span>
    <button class="btn chico primario" id="btn-digerir">Analizar ahora</button></div></div>`;
  el.querySelector('#btn-digerir').onclick = async () => {
    try {
      await api(`/proyectos/${slug}/digerir`, { json: {} });
      recargar();
    } catch (e) {
      aviso(e.message);
    }
  };
}

function vIdentidad($c, d, recargar) {
  const p = d.proyecto;
  const id = p.identidad || { colores: [], tipografias: [] };
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Identidad visual</h1><p class="sutil">Lo que hace reconocible a la marca. Se usa en todas las piezas.</p></div></div>
    <div class="pila">
      <div class="panel pila">
        <div class="dos">
          <label class="campo">Nombre<input type="text" id="nombre" value="${esc(p.nombre)}"></label>
          <label class="campo">Descripción<input type="text" id="descripcion" value="${esc(p.descripcion)}" placeholder="Qué es la marca, en una línea"></label>
        </div>
        <div class="pila" style="gap:8px"><h3>Colores</h3>
          <div class="colores" id="colores">${(id.colores || []).map((c, i) => `<span class="color"><i style="background:${esc(c.hex)}"></i>${esc(c.hex)}${c.nombre ? ` · ${esc(c.nombre)}` : ''}<span class="x" data-quitar-color="${i}">✕</span></span>`).join('') || '<span class="mini">Sin colores todavía.</span>'}</div>
          <div class="fila"><input type="color" id="nuevo-color" value="#6d5efc" style="width:44px;height:36px;padding:2px;border-radius:8px;border:1px solid var(--borde)">
            <input type="text" id="nombre-color" placeholder="Nombre o uso (opcional): primario, fondo…" style="max-width:320px">
            <button class="btn" id="agregar-color">Agregar color</button></div>
          ${(p.webs || []).some((w) => w.colores?.length) ? `<div class="fila mini">Importar desde web: ${p.webs.filter((w) => w.colores?.length).map((w, i) => `<button class="btn chico" data-importar="${i}">${esc(new URL(w.url).hostname)}</button>`).join('')}</div>` : ''}
        </div>
        <div class="pila" style="gap:8px"><h3>Tipografías</h3>
          <div class="fila">${(id.tipografias || []).map((t, i) => `<span class="chip">${esc(t)}<span class="x" data-quitar-tipo="${i}">✕</span></span>`).join('') || '<span class="mini">Sin tipografías todavía.</span>'}</div>
          <div class="fila"><input type="text" id="nueva-tipo" placeholder="Ej. Montserrat Bold (títulos)" style="max-width:320px"><button class="btn" id="agregar-tipo">Agregar</button></div>
        </div>
        <label class="campo">Estilo visual<span class="ayuda">Cómo se ve la marca: minimalista, vibrante, editorial, 3D, ilustrado…</span><textarea id="estilo">${esc(id.estilo)}</textarea></label>
        <label class="campo">Notas de marca<span class="ayuda">Reglas de logo, cosas que siempre o nunca se hacen.</span><textarea id="notas">${esc(id.notas)}</textarea></label>
        <div class="fila" style="justify-content:flex-end"><button class="btn primario" id="guardar">Guardar identidad</button></div>
      </div>
      <div class="panel pila"><h2>Archivos de identidad</h2>
        ${zonaSubida(d.slug, 'identidad', 'Logo (SVG/PNG), manual de marca (PDF), fuentes, plantillas', recargar)}
        ${galeria(d.slug, d.archivos.identidad)}
      </div>
    </div>`;
  const leer = () => ({
    ...id,
    estilo: $c.querySelector('#estilo').value,
    notas: $c.querySelector('#notas').value,
  });
  const persistir = async (identidad, msg = 'Guardado') => {
    await guardar(d.slug, { identidad, nombre: $c.querySelector('#nombre').value, descripcion: $c.querySelector('#descripcion').value });
    aviso(msg);
    recargar();
  };
  $c.querySelector('#guardar').onclick = () => persistir(leer());
  $c.querySelector('#agregar-color').onclick = () => {
    const i = leer();
    i.colores = [...(i.colores || []), { hex: $c.querySelector('#nuevo-color').value, nombre: $c.querySelector('#nombre-color').value.trim() }];
    persistir(i, 'Color agregado');
  };
  $c.querySelector('#agregar-tipo').onclick = () => {
    const v = $c.querySelector('#nueva-tipo').value.trim();
    if (!v) return;
    const i = leer();
    i.tipografias = [...(i.tipografias || []), v];
    persistir(i, 'Tipografía agregada');
  };
  $c.querySelectorAll('[data-quitar-color]').forEach((x) => (x.onclick = () => {
    const i = leer();
    i.colores = i.colores.filter((_, n) => n !== Number(x.dataset.quitarColor));
    persistir(i);
  }));
  $c.querySelectorAll('[data-quitar-tipo]').forEach((x) => (x.onclick = () => {
    const i = leer();
    i.tipografias = i.tipografias.filter((_, n) => n !== Number(x.dataset.quitarTipo));
    persistir(i);
  }));
  $c.querySelectorAll('[data-importar]').forEach((b) => (b.onclick = () => {
    const w = p.webs.filter((x) => x.colores?.length)[Number(b.dataset.importar)];
    const i = leer();
    const ya = new Set((i.colores || []).map((c) => c.hex));
    i.colores = [...(i.colores || []), ...w.colores.slice(0, 6).filter((h) => !ya.has(h)).map((hex) => ({ hex, nombre: '' }))];
    const ft = new Set(i.tipografias || []);
    i.tipografias = [...ft, ...(w.fuentes || []).slice(0, 2).filter((f) => !ft.has(f))];
    persistir(i, 'Identidad importada desde la web');
  }));
}

function vWebs($c, d, recargar) {
  const p = d.proyecto;
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Webs</h1><p class="sutil">Pega la web de la marca o páginas de referencia. Se leen título, descripción, colores y fuentes sin gastar tokens.</p></div></div>
    <div class="pila">
      <form class="panel fila" id="f">
        <input type="text" name="url" required placeholder="https://tumarca.com" style="flex:2;min-width:220px">
        <input type="text" name="nota" placeholder="Nota (opcional): web oficial, competencia, inspiración…" style="flex:2;min-width:220px">
        <button class="btn primario">Analizar web</button>
      </form>
      ${(p.webs || []).length ? (p.webs || [])
        .map(
          (w) => `<div class="panel pila" style="gap:10px">
        <div class="fila entre"><div><h3>${esc(w.titulo || w.url)}</h3><a class="mini" href="${esc(w.url)}" target="_blank">${esc(w.url)}</a></div>
          <button class="btn chico peligro" data-quitar-web="${esc(w.url)}">Quitar</button></div>
        ${w.error ? `<div class="aviso-caja">${esc(w.error)}. Claude podrá revisarla con su navegador durante el pedido.</div>` : ''}
        ${w.descripcion ? `<p class="sutil">${esc(w.descripcion)}</p>` : ''}
        ${w.nota ? `<p class="mini">Nota: ${esc(w.nota)}</p>` : ''}
        ${w.colores?.length ? `<div class="fila" style="gap:6px">${w.colores.map((c) => `<span class="muestra" title="${c}" style="background:${c}"></span>`).join('')}</div>` : ''}
        ${w.fuentes?.length ? `<div class="fila" style="gap:6px">${w.fuentes.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
      </div>`,
        )
        .join('') : '<div class="panel vacio">Sin webs todavía.</div>'}
    </div>`;
  $c.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    b.innerHTML = '<span class="girando"></span> Analizando…';
    try {
      await api(`/proyectos/${d.slug}/webs`, { json: Object.fromEntries(new FormData(e.target)) });
      aviso('Web analizada');
    } catch (err) {
      aviso(err.message);
    }
    recargar();
  };
  $c.querySelectorAll('[data-quitar-web]').forEach((b) => (b.onclick = async () => {
    await api(`/proyectos/${d.slug}/webs?url=${encodeURIComponent(b.dataset.quitarWeb)}`, { method: 'DELETE' });
    recargar();
  }));
}

function vGuiones($c, d, recargar) {
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Guiones</h1><p class="sutil">Escríbelos aquí o sube documentos. En cada pedido eliges cuál usar.</p></div></div>
    <div class="pila">
      <form class="panel pila" id="f"><h2>Escribir guion</h2>
        <input type="text" name="titulo" placeholder="Título del guion" required>
        <textarea name="texto" style="min-height:160px" placeholder="Escena 1: …&#10;Texto en pantalla: …&#10;Voz en off: …" required></textarea>
        <div class="fila" style="justify-content:flex-end"><button class="btn primario">Guardar guion</button></div>
      </form>
      <div class="panel pila"><h2>Archivos</h2>${zonaSubida(d.slug, 'guiones', 'TXT, MD, PDF, DOCX o SRT', recargar)}${galeria(d.slug, d.archivos.guiones)}</div>
    </div>`;
  $c.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    await api(`/proyectos/${d.slug}/textos/guiones`, { json: Object.fromEntries(new FormData(e.target)) });
    aviso('Guion guardado');
    recargar();
  };
}

const TEXTOS_SECCION = {
  voces: ['Voces en off', 'Grabaciones de voz para usar en los videos. Se transcriben una sola vez.', 'MP3, WAV, M4A o video con voz'],
  material: ['Material propio', 'Fotos y videos tuyos: producto, equipo, locaciones, tomas grabadas. Se usan antes de generar nada.', 'Imágenes y videos'],
  musica: ['Música y efectos', 'Pistas musicales y efectos de sonido con derechos de uso.', 'MP3, WAV, M4A'],
};
function vSeccionArchivos($c, d, recargar, seccion) {
  const [t, sub, ayuda] = TEXTOS_SECCION[seccion];
  $c.innerHTML = `<div class="encabezado"><div><h1>${t}</h1><p class="sutil">${sub}</p></div></div>
    <div class="panel pila">${zonaSubida(d.slug, seccion, ayuda, recargar)}${galeria(d.slug, d.archivos[seccion]) || '<p class="vacio">Sin archivos todavía.</p>'}</div>`;
}

function vReferentes($c, d, recargar) {
  const refs = d.proyecto.referentes || [];
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Referentes</h1><p class="sutil">Videos o piezas que te gustan como inspiración: links de TikTok, Instagram, YouTube o archivos.</p></div></div>
    <div class="pila">
      <form class="panel fila" id="f">
        <input type="text" name="url" required placeholder="Link del video de referencia" style="flex:2;min-width:220px">
        <input type="text" name="nota" placeholder="¿Qué te gusta de él? Ritmo, colores, transiciones…" style="flex:2;min-width:220px">
        <button class="btn primario">Agregar</button>
      </form>
      ${refs.length ? `<div class="panel">${refs.map((r, i) => `<div class="fila entre check"><div><a href="${esc(r.url)}" target="_blank">${esc(r.url)}</a>${r.nota ? `<p class="mini">${esc(r.nota)}</p>` : ''}</div><button class="btn chico peligro" data-quitar-ref="${i}">Quitar</button></div>`).join('')}</div>` : ''}
      <div class="panel pila"><h2>Archivos de referencia</h2>${zonaSubida(d.slug, 'referentes', 'Videos, imágenes o GIFs', recargar)}${galeria(d.slug, d.archivos.referentes)}</div>
      <div class="aviso-caja info">También puedes elegir un estilo de la galería de 800+ videos hechos con Claude al crear un pedido.</div>
    </div>`;
  $c.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const nuevo = Object.fromEntries(new FormData(e.target));
    await guardar(d.slug, { referentes: [...refs, nuevo] });
    aviso('Referente agregado');
    recargar();
  };
  $c.querySelectorAll('[data-quitar-ref]').forEach((b) => (b.onclick = async () => {
    await guardar(d.slug, { referentes: refs.filter((_, i) => i !== Number(b.dataset.quitarRef)) });
    recargar();
  }));
}

function vRequerimientos($c, d, recargar) {
  const r = d.proyecto.requerimientos || {};
  const pres = d.proyecto.presupuesto || {};
  const plataformas = new Set(r.plataformas || []);
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Requerimientos</h1><p class="sutil">Reglas que aplican a todas las piezas de este proyecto.</p></div></div>
    <form class="panel pila" id="f">
      <label class="campo">Público objetivo<textarea name="publico" placeholder="Edad, intereses, dónde está, qué le preocupa…">${esc(r.publico)}</textarea></label>
      <div class="pila" style="gap:8px"><b>Plataformas</b><div class="fila" id="plats">${META.plataformas.map((x) => `<button type="button" class="chip ${plataformas.has(x) ? 'activo' : ''}" data-p="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
      <label class="campo">Tono de comunicación<input type="text" name="tono" value="${esc(r.tono)}" placeholder="Cercano, experto, divertido, premium…"></label>
      <label class="campo">Evitar<span class="ayuda">Palabras, imágenes, colores o temas que no deben aparecer.</span><textarea name="evitar">${esc(r.evitar)}</textarea></label>
      <label class="campo">Otras notas<textarea name="notas">${esc(r.notas)}</textarea></label>
      <div class="dos">
        <label class="campo">Modo de presupuesto por defecto<select name="modo">${Object.entries(META.modos).map(([k, m]) => `<option value="${k}" ${pres.modo === k ? 'selected' : ''}>${m.titulo}</option>`).join('')}</select></label>
        <label class="campo">Tope mensual de créditos Higgsfield<input type="number" name="tope" min="0" value="${esc(pres.topeCreditosMes ?? 200)}"></label>
      </div>
      <div class="fila" style="justify-content:flex-end"><button class="btn primario">Guardar requerimientos</button></div>
    </form>`;
  $c.querySelectorAll('#plats .chip').forEach((b) => (b.onclick = () => b.classList.toggle('activo')));
  $c.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await guardar(d.slug, {
      requerimientos: { publico: f.publico, tono: f.tono, evitar: f.evitar, notas: f.notas, plataformas: [...$c.querySelectorAll('#plats .chip.activo')].map((b) => b.dataset.p) },
      presupuesto: { modo: f.modo, topeCreditosMes: Number(f.tope) || 0 },
    });
    aviso('Requerimientos guardados');
    recargar();
  };
}

// ---------- nuevo pedido ----------
function vNuevoPedido($c, d) {
  const p = d.proyecto;
  const estado = {
    categoria: null,
    formato: '9:16',
    plataformas: new Set(p.requerimientos?.plataformas || []),
    archivos: new Set(),
    estilo: null,
    modo: p.presupuesto?.modo || 'equilibrado',
    motor: 'auto',
  };
  const disponibles = ['guiones', 'voces', 'material', 'musica', 'referentes', 'identidad'].flatMap((s) => d.archivos[s].map((a) => ({ ...a, seccion: META.secciones[s].titulo })));
  const gastadoMes = (p.gastos || []).filter((g) => g.fecha?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, g) => s + g.creditos, 0);

  $c.innerHTML = `
    <div class="encabezado"><div><h1>Nuevo pedido</h1><p class="sutil">Primero recibes un storyboard con el costo estimado. Nada pagado se genera hasta que lo apruebes.</p></div></div>
    <div class="pila">
      <div class="panel pila"><div class="paso"><span class="num">1</span><h2>¿Qué quieres crear?</h2></div>
        <div class="rejilla" id="cats">${META.categorias.map((c) => `<button class="opcion" data-cat="${c.id}"><b>${esc(c.titulo)}</b><small>${esc(c.descripcion)}</small></button>`).join('')}</div>
      </div>
      <div class="panel pila"><div class="paso"><span class="num">2</span><h2>Detalles</h2></div>
        <label class="campo">Título del pedido<input type="text" id="titulo" placeholder="Ej. Lanzamiento café de temporada"></label>
        <label class="campo">Objetivo<span class="ayuda">Qué debe lograr la pieza y en quién.</span><textarea id="objetivo" placeholder="Que la gente conozca el nuevo café y entre a la web a comprarlo"></textarea></label>
        <label class="campo">Mensaje o textos clave (opcional)<textarea id="mensaje" placeholder="Frases, datos o llamado a la acción que deben aparecer"></textarea></label>
        <div class="fila" style="align-items:flex-end;gap:20px">
          <div class="pila" style="gap:6px"><b>Formato</b><div class="segmentado" id="formatos">${META.formatos.map((f) => `<button type="button" data-f="${f}">${f}</button>`).join('')}</div></div>
          <label class="campo" style="width:140px">Duración (s)<input type="number" id="duracion" min="0" value="15"></label>
        </div>
        <div class="pila" style="gap:6px"><b>Plataformas</b><div class="fila" id="plats">${META.plataformas.map((x) => `<button type="button" class="chip" data-p="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
      </div>
      <div class="panel pila"><div class="paso"><span class="num">3</span><h2>Material a usar</h2></div>
        ${disponibles.length ? `<div class="lista-archivos">${disponibles.map((a) => `<label><input type="checkbox" value="${esc(a.ruta)}"> <span class="mini" style="width:120px">${esc(a.seccion)}</span> ${esc(a.nombre)}</label>`).join('')}</div>` : `<p class="mini">Este proyecto aún no tiene archivos. Puedes subirlos en las secciones de Contexto; la identidad y requerimientos se usan siempre.</p>`}
      </div>
      <div class="panel pila"><div class="paso"><span class="num">4</span><h2>Estilo de referencia (opcional)</h2></div>
        <div id="estilo"></div>
      </div>
      <div class="panel pila"><div class="paso"><span class="num">5</span><h2>¿Con qué recursos?</h2></div>
        <div class="rejilla" id="motores">${Object.entries(META.motores).map(([k, m]) => `<button class="opcion" data-motor="${k}"><b>${m.titulo}</b><small>${m.descripcion}</small><small class="sugerido" hidden>Sugerido para este tipo de pieza</small></button>`).join('')}</div>
      </div>
      <div class="panel pila"><div class="paso"><span class="num">6</span><h2>Presupuesto</h2></div>
        <div class="rejilla" id="modos">${Object.entries(META.modos).map(([k, m]) => `<button class="opcion" data-modo="${k}"><b>${m.titulo}</b><small>${m.descripcion}</small><small>Hasta ${m.topeCreditos} créditos por pedido</small></button>`).join('')}</div>
        <div class="fila"><label class="campo" style="width:220px">Tope de créditos de este pedido<input type="number" id="tope" min="0"></label>
          <span class="mini">Gastado este mes: ${num(gastadoMes)} de ${num(p.presupuesto?.topeCreditosMes ?? 0)} créditos.</span></div>
        <label class="campo">Notas para Claude (opcional)<textarea id="notas" placeholder="Cualquier indicación extra"></textarea></label>
      </div>
      <div class="fila" style="justify-content:flex-end"><button class="btn" id="solo-guardar">Guardar sin iniciar</button><button class="btn primario" id="crear">Crear storyboard</button></div>
    </div>`;

  const marcar = (sel, attr, valor) => $c.querySelectorAll(sel).forEach((b) => b.classList.toggle('activo', b.dataset[attr] === valor));
  const elegirCategoria = (id) => {
    estado.categoria = id;
    const cat = META.categorias.find((c) => c.id === id);
    marcar('#cats .opcion', 'cat', id);
    estado.formato = cat.formato;
    marcar('#formatos button', 'f', cat.formato);
    $c.querySelector('#duracion').value = cat.duracion;
    $c.querySelectorAll('#motores .sugerido').forEach((x) => (x.hidden = x.closest('.opcion').dataset.motor !== cat.motor));
    elegirMotor(cat.motor || 'auto');
    if (!$c.querySelector('#titulo').value) $c.querySelector('#titulo').placeholder = cat.titulo;
  };
  const elegirModo = (k) => {
    estado.modo = k;
    marcar('#modos .opcion', 'modo', k);
    $c.querySelector('#tope').value = estado.motor === 'hyperframes' ? 0 : META.modos[k].topeCreditos;
  };
  // Solo HyperFrames no gasta créditos: el tope queda en 0 y bloqueado.
  function elegirMotor(k) {
    estado.motor = k;
    marcar('#motores .opcion', 'motor', k);
    const tope = $c.querySelector('#tope');
    tope.disabled = k === 'hyperframes';
    tope.value = k === 'hyperframes' ? 0 : META.modos[estado.modo].topeCreditos;
  }
  $c.querySelectorAll('#cats .opcion').forEach((b) => (b.onclick = () => elegirCategoria(b.dataset.cat)));
  $c.querySelectorAll('#formatos button').forEach((b) => (b.onclick = () => {
    estado.formato = b.dataset.f;
    marcar('#formatos button', 'f', b.dataset.f);
  }));
  $c.querySelectorAll('#plats .chip').forEach((b) => {
    b.classList.toggle('activo', estado.plataformas.has(b.dataset.p));
    b.onclick = () => {
      b.classList.toggle('activo');
      estado.plataformas[b.classList.contains('activo') ? 'add' : 'delete'](b.dataset.p);
    };
  });
  $c.querySelectorAll('#modos .opcion').forEach((b) => (b.onclick = () => elegirModo(b.dataset.modo)));
  $c.querySelectorAll('#motores .opcion').forEach((b) => (b.onclick = () => elegirMotor(b.dataset.motor)));
  marcar('#formatos button', 'f', estado.formato);
  elegirModo(estado.modo);
  elegirMotor(estado.motor);

  const pintarEstilo = () => {
    const el = $c.querySelector('#estilo');
    el.innerHTML = estado.estilo
      ? `<div class="estilo-elegido"><img src="${esc(estado.estilo.poster)}" alt=""><div style="flex:1"><b>@${esc(estado.estilo.autor)}</b> <span class="mini">${esc(estado.estilo.tecnica)}</span><p class="mini">${esc(estado.estilo.prompt.slice(0, 160))}…</p></div><button class="btn chico" id="quitar-estilo">Quitar</button></div>`
      : `<div class="fila"><button class="btn" id="abrir-galeria">Elegir de la galería de estilos</button><span class="mini">800+ videos hechos con Claude, con el prompt que los creó.</span></div>`;
    el.querySelector('#abrir-galeria')?.addEventListener('click', () => abrirGaleria((e) => {
      estado.estilo = e;
      pintarEstilo();
    }));
    el.querySelector('#quitar-estilo')?.addEventListener('click', () => {
      estado.estilo = null;
      pintarEstilo();
    });
  };
  pintarEstilo();

  const enviar = async (iniciar) => {
    if (!estado.categoria) return aviso('Elige qué quieres crear');
    const cuerpo = {
      categoria: estado.categoria,
      titulo: $c.querySelector('#titulo').value,
      objetivo: $c.querySelector('#objetivo').value,
      mensaje: $c.querySelector('#mensaje').value,
      formato: estado.formato,
      duracion: $c.querySelector('#duracion').value,
      plataformas: [...estado.plataformas],
      archivos: [...$c.querySelectorAll('.lista-archivos input:checked')].map((i) => i.value),
      estilo: estado.estilo,
      modo: estado.modo,
      motor: estado.motor,
      topeCreditos: $c.querySelector('#tope').value,
      notas: $c.querySelector('#notas').value,
      iniciar,
    };
    try {
      const pedido = await api(`/proyectos/${d.slug}/pedidos`, { json: cuerpo });
      location.hash = `#/p/${d.slug}/pedidos/${pedido.id}`;
    } catch (e) {
      aviso(e.message);
    }
  };
  $c.querySelector('#crear').onclick = () => enviar(true);
  $c.querySelector('#solo-guardar').onclick = () => enviar(false);
}

async function abrirGaleria(alElegir) {
  const caja = abrirModal(`<div class="pila">
    <div class="fila entre"><h2>Galería de estilos</h2><button class="btn-icono" id="cerrar">✕</button></div>
    <div class="fila"><input type="text" id="q" placeholder="Buscar: logo, 3D, partículas, explainer, kinetic…" style="flex:1;min-width:200px">
      <select id="cat" style="width:180px"><option value="">Todas</option><option value="motion">Motion graphics</option><option value="explainer">Explicativos</option><option value="3d">Escenas 3D</option><option value="interactive">Interactivos</option></select></div>
    <div id="res" class="rejilla chica"></div>
    <div class="fila" style="justify-content:center"><button class="btn" id="mas" hidden>Ver más</button></div></div>`);
  caja.querySelector('#cerrar').onclick = cerrarModal;
  let pagina = 0;
  let items = [];
  const buscar = async (reiniciar) => {
    if (reiniciar) {
      pagina = 0;
      items = [];
    }
    const q = encodeURIComponent(caja.querySelector('#q').value);
    const cat = caja.querySelector('#cat').value;
    const r = await api(`/estilos?q=${q}&cat=${cat}&pagina=${pagina}`);
    items = items.concat(r.items);
    caja.querySelector('#res').innerHTML = items.map((e, i) => `<div class="estilo" data-i="${i}"><img loading="lazy" src="${esc(e.poster)}" alt=""><b class="mini">@${esc(e.autor)} · ${esc(e.tecnica)}</b><p>${esc(e.prompt)}</p></div>`).join('') || '<p class="vacio">Sin resultados.</p>';
    caja.querySelector('#mas').hidden = items.length >= r.total;
    caja.querySelectorAll('.estilo').forEach((el) => (el.onclick = () => {
      alElegir(items[Number(el.dataset.i)]);
      cerrarModal();
    }));
  };
  let t;
  caja.querySelector('#q').oninput = () => {
    clearTimeout(t);
    t = setTimeout(() => buscar(true), 250);
  };
  caja.querySelector('#cat').onchange = () => buscar(true);
  caja.querySelector('#mas').onclick = () => {
    pagina++;
    buscar(false);
  };
  buscar(true);
}

// ---------- pedidos ----------
const NOMBRE_ESTADO = { borrador: 'Borrador', 'creando-storyboard': 'Creando storyboard', 'por-aprobar': 'Por aprobar', produciendo: 'Produciendo', listo: 'Listo', error: 'Error' };
const etiquetaEstado = (e) => `<span class="estado ${e}">${NOMBRE_ESTADO[e] || e}</span>`;
const filaPedido = (slug, x) =>
  `<a class="fila-pedido" href="#/p/${slug}/pedidos/${x.id}"><div><b>${esc(x.titulo)}</b><div class="mini">${esc(META.categorias.find((c) => c.id === x.categoria)?.titulo || '')} · ${esc(x.formato)} · ${fecha(x.creado)}</div></div>
   <span class="mini">${x.creditosGastados ? `${num(x.creditosGastados)} créditos` : ''}</span>${etiquetaEstado(x.estado)}</a>`;

function vPedidos($c, d) {
  $c.innerHTML = `<div class="encabezado"><div><h1>Pedidos</h1><p class="sutil">Todo lo que has pedido en este proyecto.</p></div><a class="btn primario" href="#/p/${d.slug}/nuevo">＋ Nuevo pedido</a></div>
    <div class="panel" style="padding:0">${d.pedidos.length ? d.pedidos.map((x) => filaPedido(d.slug, x)).join('') : '<p class="vacio">Aún no hay pedidos.</p>'}</div>`;
}

async function vPedido($c, d, id, recargar) {
  const r = await api(`/proyectos/${d.slug}/pedidos/${id}`);
  const x = r.pedido;
  const cat = META.categorias.find((c) => c.id === x.categoria);
  const consumo = (x.ejecuciones || []).reduce((s, e) => ({ usd: s.usd + (e.costoUsd || 0), tok: s.tok + (e.tokens?.entrada || 0) + (e.tokens?.salida || 0) }), { usd: 0, tok: 0 });
  const url = (ruta) => `/archivos/${d.slug}/${ruta.split('/').map(encodeURIComponent).join('/')}`;

  let acciones = '';
  if (r.enCurso) acciones = `<button class="btn peligro" id="detener">Detener</button>`;
  else if (x.estado === 'borrador' || x.estado === 'error') acciones = `<button class="btn primario" id="storyboard">${x.estado === 'error' ? 'Reintentar storyboard' : 'Crear storyboard'}</button>`;

  $c.innerHTML = `
    <div class="encabezado"><div><div class="fila">${etiquetaEstado(x.estado)}<span class="mini">${esc(cat?.titulo)} · ${esc(x.formato)}${x.duracion ? ` · ${x.duracion}s` : ''} · ${esc(META.motores[x.motor]?.titulo || 'Automático')} · modo ${esc(META.modos[x.modo]?.titulo)}</span></div>
      <h1 style="margin-top:8px">${esc(x.titulo)}</h1><p class="sutil">${esc(x.objetivo)}</p></div>
      <div class="fila">${acciones}<button class="btn" id="copiar">Copiar brief</button></div></div>
    <div class="pila">
      ${r.enCurso ? `<div class="aviso-caja info"><span class="girando"></span> Claude está trabajando en ${x.estado === 'creando-storyboard' ? 'el storyboard' : 'la producción'}. Esta página se actualiza sola.</div>` : ''}
      ${x.estado === 'por-aprobar' ? `<div class="panel pila" style="border-color:var(--alerta)">
          <h2>Revisa y aprueba</h2>
          <p class="sutil">Propuesta: <b>${esc(META.motores[r.estimacion?.motor]?.titulo || META.motores[x.motor]?.titulo || '')}</b> · costo estimado <b>${r.estimacion ? `${num(r.estimacion.creditos)} créditos de Higgsfield` : 'sin estimación'}</b>${r.estimacion?.resumen ? ` · ${esc(r.estimacion.resumen)}` : ''}.</p>
          ${r.estimacion?.alternativas?.length ? `<div class="pila" style="gap:8px"><b>Elige con qué recursos producir</b>
            <div class="rejilla" id="alternativas">${r.estimacion.alternativas.filter((a) => META.motores[a.motor]).map((a) => `<button class="opcion ${a.motor === (r.estimacion.motor || x.motor) ? 'activo' : ''}" data-motor="${a.motor}" data-creditos="${Number(a.creditos) || 0}"><b>${esc(META.motores[a.motor].titulo)}${a.motor === r.estimacion.motor ? ' · propuesto' : ''}</b><small>${num(a.creditos)} créditos estimados</small>${a.nota ? `<small>${esc(a.nota)}</small>` : ''}</button>`).join('')}</div>
            <p class="mini">Si eliges un motor distinto al propuesto, Claude adapta el storyboard al producir.</p></div>` : ''}
          <textarea id="comentarios" placeholder="Cambios o comentarios antes de producir (opcional)"></textarea>
          <div class="fila entre"><label class="fila mini">Tope de créditos <input type="number" id="tope" value="${x.topeCreditos}" style="width:100px"></label>
          <div class="fila"><button class="btn" id="rehacer">Rehacer storyboard</button><button class="btn primario" id="aprobar">Aprobar y producir</button></div></div>
        </div>` : ''}
      ${r.salidas.length ? `<div class="panel pila"><h2>Entregables</h2><div class="rejilla chica">${r.salidas.map((a) => vistaArchivo(d.slug, a, { borrar: false })).join('')}</div>
          ${!r.enCurso ? `<div class="pila" style="gap:8px"><textarea id="cambios" placeholder="¿Quieres ajustes? Descríbelos: cambia el color del título, acorta la escena 2…"></textarea><div class="fila" style="justify-content:flex-end"><button class="btn" id="ajustar">Pedir ajustes</button></div></div>` : ''}</div>` : ''}
      ${r.storyboard ? `<div class="panel"><h2>Storyboard</h2><div class="md">${md(r.storyboard)}</div></div>` : ''}
      ${r.previas.length ? `<div class="panel pila"><h2>Fotogramas de prueba</h2><div class="rejilla chica">${r.previas.map((a) => `<a href="${url(a.ruta)}" target="_blank" class="archivo">${a.tipo === 'imagen' ? `<div class="vista"><img src="${url(a.ruta)}" alt=""></div>` : esc(a.nombre)}</a>`).join('')}</div></div>` : ''}
      <div class="dos">
        <div class="panel pila"><h3>Consumo</h3>
          <div class="consumo" style="border:0;padding:0"><div><span>Créditos Higgsfield</span><b>${num(x.creditosGastados || 0)} / ${x.topeCreditos}</b></div>
          <div><span>Tokens Claude</span><b>${num(consumo.tok)}</b></div><div><span>Costo estimado</span><b>US$ ${consumo.usd.toFixed(2)}</b></div></div>
          ${(x.ejecuciones || []).map((e) => `<div class="mini">${fecha(e.inicio)} · ${e.fase} · ${e.modelo} · ${e.ok ? 'ok' : 'falló'}</div>`).join('')}
        </div>
        <div class="panel pila"><h3>Pedido</h3>
          ${x.mensaje ? `<p><b>Mensaje:</b> ${esc(x.mensaje)}</p>` : ''}
          ${x.plataformas?.length ? `<p><b>Plataformas:</b> ${esc(x.plataformas.join(', '))}</p>` : ''}
          ${x.archivos?.length ? `<p><b>Material:</b> ${x.archivos.map(esc).join(', ')}</p>` : ''}
          ${x.estilo ? `<p><b>Estilo:</b> @${esc(x.estilo.autor)} (${esc(x.estilo.tecnica)})</p>` : ''}
          ${x.notas ? `<p><b>Notas:</b> ${esc(x.notas)}</p>` : ''}
        </div>
      </div>
      <details class="panel" ${r.enCurso ? 'open' : ''}><summary><b>Registro de trabajo</b></summary><pre class="registro" id="registro">${esc(r.registro || 'Sin actividad todavía.')}</pre></details>
    </div>`;

  const reg = $c.querySelector('#registro');
  reg.scrollTop = reg.scrollHeight;
  const accion = async (ruta, cuerpo = {}) => {
    try {
      await api(`/proyectos/${d.slug}/pedidos/${id}/${ruta}`, { json: cuerpo });
      recargar();
    } catch (e) {
      aviso(e.message);
    }
  };
  $c.querySelector('#storyboard')?.addEventListener('click', () => accion('storyboard'));
  $c.querySelector('#rehacer')?.addEventListener('click', () => accion('storyboard'));
  $c.querySelector('#detener')?.addEventListener('click', () => accion('detener'));
  let motorElegido = r.estimacion?.motor || x.motor;
  $c.querySelectorAll('#alternativas .opcion').forEach((b) => (b.onclick = () => {
    motorElegido = b.dataset.motor;
    $c.querySelectorAll('#alternativas .opcion').forEach((o) => o.classList.toggle('activo', o === b));
    const tope = $c.querySelector('#tope');
    if (motorElegido === 'hyperframes') tope.value = 0;
    else if (Number(tope.value) < Number(b.dataset.creditos)) tope.value = b.dataset.creditos;
  }));
  $c.querySelector('#aprobar')?.addEventListener('click', () => accion('aprobar', { comentarios: $c.querySelector('#comentarios').value, topeCreditos: $c.querySelector('#tope').value, motor: motorElegido }));
  $c.querySelector('#ajustar')?.addEventListener('click', () => {
    const cambios = $c.querySelector('#cambios').value.trim();
    if (!cambios) return aviso('Describe los cambios');
    accion('ajustar', { cambios });
  });
  $c.querySelector('#copiar').onclick = async () => {
    try {
      await navigator.clipboard.writeText(r.prompt);
      aviso('Brief copiado: puedes pegarlo en Claude Code o en el chat');
    } catch {
      abrirModal(`<h2>Brief del pedido</h2><pre class="registro">${esc(r.prompt)}</pre>`);
    }
  };
  if (r.enCurso) {
    vigilar(async () => {
      const n = await api(`/proyectos/${d.slug}/pedidos/${id}`);
      if (!n.enCurso) {
        dejarDeVigilar();
        return recargar();
      }
      if (reg.textContent === n.registro) return;
      const alFinal = reg.scrollHeight - reg.scrollTop - reg.clientHeight < 40;
      reg.textContent = n.registro;
      if (alFinal) reg.scrollTop = reg.scrollHeight;
    }, 3000);
  }
}

function vBiblioteca($c, d) {
  $c.innerHTML = `<div class="encabezado"><div><h1>Biblioteca</h1><p class="sutil">Todos los entregables del proyecto.</p></div></div>
    <div class="panel">${d.archivos.salidas.length ? `<div class="rejilla chica">${d.archivos.salidas.map((a) => vistaArchivo(d.slug, a, { borrar: false })).join('')}</div>` : '<p class="vacio">Aún no hay entregables.</p>'}</div>`;
}

enrutar();
