// Auto postproducción: subir un video ya cortado, resaltar frases de su transcripción
// y generar un clip por frase para ponerlo en la línea de tiempo del editor.

let C = null; // utilidades de app.js: api, esc, aviso, abrirModal, cerrarModal, vigilar, dejarDeVigilar, fecha, num
let CAT = null; // catálogo: tipos, enfoques, generadores
let soltarOyentes = () => {};

const RUTAS = {
  hyperframes: { titulo: 'Gratis con HyperFrames', corto: 'Gratis' },
  material: { titulo: 'Con tu material (gratis)', corto: 'Tu material' },
  generador: { titulo: 'Generado con IA (créditos)', corto: 'IA' },
};
const SONIDOS = { no: 'Sin sonido', efectos: 'Efectos de sonido', 'efectos-musica': 'Efectos y música' };
const IDIOMAS = { es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', it: 'Italiano', de: 'Alemán', auto: 'Detectar solo' };
const ESTADOS = {
  pendiente: 'Por generar', 'en-cola': 'En cola', generando: 'Generando', listo: 'Listo', error: 'Error', cambiado: 'Cambió: regenerar',
};

const cr = (n) => new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(n || 0);
const seg = (s) => `${(s || 0).toFixed(1).replace('.', ',')} s`;
function tc(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
const urlArchivo = (slug, ruta) => `/archivos/${slug}/${ruta.split('/').map(encodeURIComponent).join('/')}`;
const tipoDe = (id) => CAT.tipos.find((t) => t.id === id);
const enfoqueDe = (id) => CAT.enfoques.find((e) => e.id === id);
const genDe = (id) => CAT.generadores.video.find((g) => g.id === id);

function rutaDe(f) {
  if (f.generador === 'hyperframes') return 'hyperframes';
  if (f.generador && genDe(f.generador)) return 'generador';
  return tipoDe(f.tipo)?.ruta || 'generador';
}

function textoRostro(g) {
  if (g.gratis) return 'sin créditos';
  return g.rostro === 'referencia' ? 'acepta tu rostro' : 'rostro vía fotograma inicial';
}
const opcionGenerador = (g, elegido) =>
  `<option value="${g.id}" ${g.id === elegido ? 'selected' : ''}>${C.esc(g.nombre)}${g.gratis ? '' : ` · ${cr(g.creditosPorSegundo * 5)} cr por 5 s · ${textoRostro(g)}`}</option>`;

export async function montarPostpro(ctx, $c, d, recargar, id) {
  C = ctx;
  CAT = await C.api('/postpro/catalogo');
  if (id) return vistaTrabajo($c, d, id, recargar);
  return vistaLista($c, d, recargar);
}

// ---------- Lista y subida ----------

async function vistaLista($c, d) {
  const { esc, api, aviso, fecha } = C;
  const lista = await api(`/proyectos/${d.slug}/postpro`);
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Auto postproducción</h1>
      <p class="sutil">Sube tu video ya cortado, resalta frases de la transcripción y recibe un clip por frase (motion graphics, b-roll, tomas de apoyo…) listo para ponerlo encima en tu editor.</p></div></div>
    <div class="panel pila">
      <h2>Nuevo video</h2>
      <div class="fila" style="align-items:flex-end">
        <label class="campo" style="flex:1;min-width:220px">Nombre (opcional)<input type="text" id="pp-titulo" placeholder="Ej. Reel lanzamiento octubre"></label>
        <label class="campo" style="width:180px">Idioma de la voz<select id="pp-idioma">${Object.entries(IDIOMAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      </div>
      <div class="zona" id="pp-zona"><input type="file" hidden accept="video/*,.mov,.mp4,.m4v,.webm,.mkv">
        <b>Arrastra tu video aquí o haz clic</b><span class="mini">MP4 o MOV con la voz en off. La transcripción se hace en tu Mac: no gasta créditos ni tokens.</span>
        <div class="progreso" hidden style="width:260px;margin-top:8px"><i style="width:0"></i></div></div>
    </div>
    <div class="panel" style="padding:0;margin-top:16px">
      ${lista.length ? lista.map((t) => `<a class="fila-pedido" href="#/p/${d.slug}/postpro/${t.id}"><div><b>${esc(t.titulo)}</b>
        <div class="mini">${t.video ? `${seg(t.video.duracion)} · ${t.video.ancho}×${t.video.alto}` : ''} · ${fecha(t.creado)}</div></div>
        <span class="mini">${t.fragmentos ? `${t.listos}/${t.fragmentos} clips listos` : 'Sin clips aún'}</span>
        <span class="estado ${t.generando ? 'produciendo' : t.estado === 'error' ? 'error' : t.estado === 'transcribiendo' ? 'creando-storyboard' : 'listo'}">${t.generando ? 'Generando' : t.estado === 'transcribiendo' ? 'Transcribiendo' : t.estado === 'error' ? 'Error' : 'Listo para editar'}</span></a>`).join('') : '<p class="vacio">Aún no has subido videos.</p>'}
    </div>`;

  const zona = $c.querySelector('#pp-zona');
  const input = zona.querySelector('input');
  const subir = (archivo) => {
    if (!archivo) return;
    if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(archivo.name)) return aviso('Sube un video MP4, MOV o WebM');
    const fd = new FormData();
    fd.append('titulo', $c.querySelector('#pp-titulo').value);
    fd.append('idioma', $c.querySelector('#pp-idioma').value);
    fd.append('video', archivo);
    const barra = zona.querySelector('.progreso');
    barra.hidden = false;
    zona.querySelector('b').innerHTML = '<span class="girando"></span> Subiendo video…';
    // XHR para mostrar el avance: los videos pesan.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/proyectos/${d.slug}/postpro`);
    xhr.upload.onprogress = (e) => e.lengthComputable && (barra.firstElementChild.style.width = `${(e.loaded / e.total) * 100}%`);
    xhr.onload = () => {
      let r = {};
      try {
        r = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 400 || !r.id) {
        aviso(r.error || 'No se pudo subir el video');
        zona.querySelector('b').textContent = 'Arrastra tu video aquí o haz clic';
        barra.hidden = true;
        return;
      }
      location.hash = `#/p/${d.slug}/postpro/${r.id}`;
    };
    xhr.onerror = () => aviso('Se cortó la subida');
    xhr.send(fd);
  };
  zona.onclick = (e) => e.target !== input && input.click();
  input.onchange = () => subir(input.files[0]);
  zona.ondragover = (e) => {
    e.preventDefault();
    zona.classList.add('sobre');
  };
  zona.ondragleave = () => zona.classList.remove('sobre');
  zona.ondrop = (e) => {
    e.preventDefault();
    zona.classList.remove('sobre');
    subir(e.dataTransfer.files[0]);
  };
}

// ---------- Trabajo ----------

async function vistaTrabajo($c, d, id, recargar) {
  const { esc, api, aviso } = C;
  const base = `/proyectos/${d.slug}/postpro/${id}`;
  let r = await api(base);
  let t = r.trabajo;
  const estadoVista = { corrigiendo: false };

  const encabezado = () => `
    <div class="encabezado"><div>
      <a href="#/p/${d.slug}/postpro" class="mini">← Auto postproducción</a>
      <h1 style="margin-top:6px" id="pp-nombre" title="Clic para renombrar">${esc(t.titulo)}</h1>
      <p class="sutil">${seg(t.video.duracion)} · ${t.video.ancho}×${t.video.alto} · ${t.video.fps} fps · ${esc(t.video.nombre || '')}</p></div>
      <div class="fila"><button class="btn peligro" id="pp-borrar">Borrar</button></div></div>`;

  if (t.estado === 'transcribiendo' || t.estado === 'error' || !t.transcripcion?.palabras?.length) {
    $c.innerHTML = `${encabezado()}
      <div class="panel pila">
        ${t.estado === 'transcribiendo' || r.transcribiendo
          ? `<div class="aviso-caja info"><span class="girando"></span> Transcribiendo la voz en tu Mac (gratis). La primera vez descarga el modelo de transcripción y tarda más. Esta página se actualiza sola.</div>`
          : `<div class="aviso-caja" style="background:var(--error-suave);color:var(--error)">${esc(t.error || 'Falta la transcripción.')}</div>`}
        <video src="${urlArchivo(d.slug, `postpro/${id}/${t.video.archivo}`)}" controls preload="metadata" class="pp-video"></video>
        ${t.estado !== 'transcribiendo' ? `<div class="fila"><button class="btn primario" id="pp-retranscribir">Transcribir de nuevo</button>
          <label class="btn">Importar subtítulos (.srt o .vtt)<input type="file" hidden accept=".srt,.vtt" id="pp-srt"></label></div>
          <p class="mini">Si tu editor exporta subtítulos (Premiere, CapCut, DaVinci), puedes importarlos en lugar de transcribir.</p>` : ''}
      </div>`;
    accionesComunes();
    $c.querySelector('#pp-retranscribir')?.addEventListener('click', async () => {
      try {
        await api(`${base}/transcribir`, { json: {} });
        recargar();
      } catch (e) {
        aviso(e.message);
      }
    });
    $c.querySelector('#pp-srt')?.addEventListener('change', async (e) => {
      const fd = new FormData();
      fd.append('archivo', e.target.files[0]);
      const res = await fetch(`/api${base}/subtitulos`, { method: 'POST', body: fd });
      if (!res.ok) aviso((await res.json()).error || 'No se pudo importar');
      recargar();
    });
    if (t.estado === 'transcribiendo' || r.transcribiendo) {
      C.vigilar(async () => {
        const n = await api(base);
        if (!n.transcribiendo && n.trabajo.estado !== 'transcribiendo') {
          C.dejarDeVigilar();
          recargar();
        }
      }, 3000);
    }
    return;
  }

  const ajustes = { ...CAT.ajustesDefecto, ...t.ajustes };
  const sonidoGeneral = () => (!ajustes.sonido ? 'no' : ajustes.musica ? 'efectos-musica' : 'efectos');
  const palabras = t.transcripcion.palabras;

  $c.innerHTML = `${encabezado()}
    <div class="pp-grid">
      <div class="pp-lado">
        <video id="pp-video" src="${urlArchivo(d.slug, `postpro/${id}/${t.video.archivo}`)}" controls preload="metadata" class="pp-video" style="aspect-ratio:${t.video.ancho}/${t.video.alto}"></video>
        <div class="panel pila" id="pp-persona"></div>
        <div class="panel pila">
          <h3>IA y generadores</h3>
          <label class="campo">Generador de video por defecto
            <select id="aj-video">${CAT.generadores.video.filter((g) => !g.gratis).map((g) => opcionGenerador(g, ajustes.video)).join('')}</select>
            <span class="ayuda">Puedes cambiarlo en cada clip. Los motion graphics y textos siempre salen gratis con HyperFrames.</span></label>
          <label class="campo">Imagen (personaje y fotogramas iniciales)
            <select id="aj-imagen">${CAT.generadores.imagen.map((g) => `<option value="${g.id}" ${g.id === ajustes.imagen ? 'selected' : ''}>${esc(g.nombre)} · ${cr(g.creditos)} cr · ${esc(g.descripcion)}</option>`).join('')}</select></label>
          <label class="campo">IA que escribe los prompts y arma los clips
            <select id="aj-claude">${CAT.generadores.claude.map((g) => `<option value="${g.id}" ${g.id === ajustes.claude ? 'selected' : ''}>${esc(g.nombre)} · ${esc(g.descripcion)}</option>`).join('')}</select></label>
          <label class="campo">Enfoque general
            <select id="aj-enfoque">${CAT.enfoques.map((e) => `<option value="${e.id}" ${e.id === ajustes.enfoque ? 'selected' : ''}>${esc(e.titulo)}</option>`).join('')}</select>
            <span class="ayuda">Se usa en los clips donde no elijas otro.</span></label>
          <div class="pila" style="gap:6px">
            <label class="fila" style="gap:8px"><input type="checkbox" id="aj-sonido" ${ajustes.sonido ? 'checked' : ''}> <b>Clips con sonido</b></label>
            <label class="fila mini" style="gap:8px;padding-left:22px" ${ajustes.sonido ? '' : 'hidden'} id="aj-musica-fila"><input type="checkbox" id="aj-musica" ${ajustes.musica ? 'checked' : ''}> Incluir música de fondo</label>
            <span class="mini">Efectos de interfaz en los gráficos (whoosh, pop, clics) y sonido ambiente en las escenas, desde tu carpeta de música o Epidemic Sound. No gasta créditos. Puedes cambiarlo en cada clip.</span>
          </div>
          <p class="mini">${esc(CAT.generadores.nota)} (${esc(CAT.generadores.consultado)})</p>
        </div>
      </div>
      <div class="pp-principal">
        <div class="panel pila">
          <div class="fila entre"><h2>Transcripción</h2>
            <div class="fila" style="gap:8px"><button class="btn chico" id="pp-corregir">✎ Corregir palabras</button>
            <button class="btn chico" id="pp-retranscribir">Transcribir de nuevo</button></div></div>
          ${t.error ? `<div class="aviso-caja">${esc(t.error)}</div>` : ''}
          <p class="mini" id="pp-ayuda">Selecciona con el mouse una frase para convertirla en clip. Clic en una palabra para ir a ese momento del video; clic en un tramo resaltado para editarlo.</p>
          <div class="leyenda"><span class="frag hyperframes">Gratis (HyperFrames)</span><span class="frag material">Tu material</span><span class="frag generador">IA (créditos)</span></div>
          <div class="transcripcion" id="pp-texto"></div>
        </div>
        <div class="panel pila" id="pp-export"></div>
        <div class="pila" id="pp-clips"></div>
      </div>
    </div>
    <div class="pp-barra" id="pp-barra"></div>
    <div class="pp-pop" id="pp-pop" hidden></div>`;
  accionesComunes();

  const $video = $c.querySelector('#pp-video');
  const $texto = $c.querySelector('#pp-texto');
  const $pop = $c.querySelector('#pp-pop');

  // ----- transcripción con fragmentos resaltados -----
  function pintarTexto() {
    const frags = [...t.fragmentos].sort((a, b) => a.desde - b.desde);
    const numero = Object.fromEntries([...t.fragmentos].sort((a, b) => a.inicio - b.inicio).map((f, n) => [f.id, n + 1]));
    let html = '';
    let i = 0;
    const palabra = (k) => `<span class="w" data-i="${k}">${esc(palabras[k].t)}</span>`;
    for (const f of frags) {
      while (i < f.desde) html += `${palabra(i++)} `;
      let dentro = '';
      for (let k = f.desde; k <= f.hasta; k++) dentro += `${palabra(k)}${k < f.hasta ? ' ' : ''}`;
      const tipo = tipoDe(f.tipo);
      html += `<mark class="frag ${rutaDe(f)} ${f.estado === 'listo' ? 'hecho' : ''}" data-frag="${f.id}" title="${esc(tipo?.titulo || 'Sin tipo')}"><sup>${numero[f.id]}</sup>${dentro}</mark> `;
      i = f.hasta + 1;
    }
    while (i < palabras.length) html += `${palabra(i++)} `;
    $texto.innerHTML = html;
    $texto.classList.toggle('corrigiendo', estadoVista.corrigiendo);
  }

  // Palabra que suena ahora: búsqueda binaria sobre los tiempos.
  let sonando = null;
  $video.addEventListener('timeupdate', () => {
    const s = $video.currentTime;
    let lo = 0;
    let hi = palabras.length - 1;
    let k = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (palabras[m].i <= s) {
        k = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    if (k >= 0 && s > palabras[k].f + 0.6) k = -1;
    const el = k >= 0 ? $texto.querySelector(`.w[data-i="${k}"]`) : null;
    if (el === sonando) return;
    sonando?.classList.remove('sonando');
    el?.classList.add('sonando');
    sonando = el;
  });

  function indicesSeleccion() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const rango = sel.getRangeAt(0);
    if (!$texto.contains(rango.commonAncestorContainer)) return null;
    const tocadas = [...$texto.querySelectorAll('.w')].filter((w) => rango.intersectsNode(w) && w.textContent.trim());
    // Una palabra apenas rozada al final de la selección no cuenta.
    if (tocadas.length > 1 && rango.endContainer.nodeType === 3 && rango.endOffset === 0 && tocadas.at(-1).contains(rango.endContainer)) tocadas.pop();
    if (!tocadas.length) return null;
    return { desde: Number(tocadas[0].dataset.i), hasta: Number(tocadas.at(-1).dataset.i), rect: rango.getBoundingClientRect() };
  }

  const alSoltar = (e) => {
    if ($pop.contains(e.target)) return;
    setTimeout(() => {
      const s = indicesSeleccion();
      if (!s) return;
      const cruce = t.fragmentos.find((f) => !(s.hasta < f.desde || s.desde > f.hasta));
      if (cruce) {
        aviso('Esa selección se cruza con otro clip. Edita ese clip o selecciona otra frase.');
        window.getSelection().removeAllRanges();
        return;
      }
      abrirBarra({ nuevo: { desde: s.desde, hasta: s.hasta } }, s.rect);
    });
  };
  $texto.addEventListener('mouseup', alSoltar);
  $texto.addEventListener('touchend', alSoltar);
  $texto.addEventListener('keyup', (e) => e.shiftKey && alSoltar(e));
  $texto.addEventListener('click', async (e) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const w = e.target.closest('.w');
    if (estadoVista.corrigiendo && w) {
      const k = Number(w.dataset.i);
      const nuevo = prompt('Corrige la palabra (los tiempos no cambian):', palabras[k].t);
      if (!nuevo || nuevo.trim() === palabras[k].t) return;
      try {
        await api(`${base}/palabras/${k}`, { json: { texto: nuevo.trim() }, method: 'PATCH' });
        palabras[k].t = nuevo.trim();
        w.textContent = nuevo.trim();
      } catch (er) {
        aviso(er.message);
      }
      return;
    }
    if (w) {
      $video.currentTime = palabras[Number(w.dataset.i)].i;
    }
    const m = e.target.closest('mark.frag');
    if (m) abrirBarra({ fid: m.dataset.frag }, m.getBoundingClientRect());
  });

  // ----- barra flotante: tipo de contenido y enfoque -----
  function abrirBarra(modo, rect) {
    let f = modo.fid ? t.fragmentos.find((x) => x.id === modo.fid) : null;
    let paso = f ? 'editar' : 'tipo';
    let filtro = '';
    const pintar = () => {
      const texto = f ? f.texto : palabras.slice(modo.nuevo.desde, modo.nuevo.hasta + 1).map((p) => p.t).join(' ');
      const tipos = CAT.tipos.filter((x) => !filtro || `${x.titulo} ${x.descripcion}`.toLowerCase().includes(filtro));
      const grupoTipos = Object.entries(RUTAS).map(([ruta, info]) => {
        const items = tipos.filter((x) => x.ruta === ruta);
        return items.length ? `<div class="pop-grupo"><b class="${ruta}">${info.titulo}</b><div class="fila" style="gap:6px">${items.map((x) => `<button class="chip ${f?.tipo === x.id ? 'activo' : ''}" data-tipo="${x.id}" title="${esc(x.descripcion || '')}">${esc(x.titulo)}${x.capa ? ' ◌' : ''}</button>`).join('')}</div></div>` : '';
      }).join('');
      const enfoqueActual = f?.enfoque || '';
      $pop.innerHTML = `
        <div class="fila entre"><span class="mini">«${esc(texto.slice(0, 90))}${texto.length > 90 ? '…' : ''}»</span><button class="btn-icono" data-cerrar title="Cerrar">✕</button></div>
        ${paso === 'tipo' || paso === 'editar' ? `<div class="pila" style="gap:8px">
            <div class="fila entre"><b>1 · Tipo de contenido</b><input type="text" placeholder="Buscar tipo…" data-filtro value="${esc(filtro)}" style="width:160px;padding:5px 9px"></div>
            ${grupoTipos || '<p class="mini">Sin coincidencias.</p>'}
            <div class="fila" style="gap:6px"><button class="btn chico" data-nuevo-tipo>＋ Agregar tipo</button><span class="mini">◌ = capa transparente para poner encima</span></div></div>` : ''}
        ${f && (paso === 'enfoque' || paso === 'editar') ? `<div class="pila" style="gap:8px">
            <b>2 · Enfoque</b>
            <div class="fila" style="gap:6px"><button class="chip ${!enfoqueActual ? 'activo' : ''}" data-enfoque="">General (${esc(enfoqueDe(ajustes.enfoque)?.titulo || '')})</button>
            ${CAT.enfoques.map((x) => `<button class="chip ${enfoqueActual === x.id ? 'activo' : ''}" data-enfoque="${x.id}" title="${esc(x.descripcion)}">${esc(x.titulo)}</button>`).join('')}
            <button class="btn chico" data-nuevo-enfoque>＋ Agregar enfoque</button></div>
            <div class="fila" style="gap:8px"><label class="btn chico">＋ Referencias visuales<input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" data-refs></label>
              <span class="mini">${f.refs?.length ? `${f.refs.length} referencia(s)` : 'Opcional: imágenes del estilo que buscas'}</span></div>
            <div class="fila entre"><button class="btn chico peligro" data-quitar>Quitar clip</button><button class="btn chico primario" data-cerrar>Listo</button></div></div>` : ''}`;
      // Posición: debajo de la selección, dentro de la pantalla.
      $pop.hidden = false;
      const ancho = Math.min(560, window.innerWidth - 24);
      $pop.style.width = `${ancho}px`;
      const izq = Math.max(12, Math.min(rect.left, window.innerWidth - ancho - 12));
      let arriba = rect.bottom + 8;
      if (arriba + $pop.offsetHeight > window.innerHeight - 12) arriba = Math.max(12, rect.top - $pop.offsetHeight - 8);
      $pop.style.left = `${izq}px`;
      $pop.style.top = `${arriba}px`;
      const buscar = $pop.querySelector('[data-filtro]');
      if (buscar && filtro) {
        buscar.focus();
        buscar.setSelectionRange(filtro.length, filtro.length);
      }
    };
    const guardarCambio = async (cambios) => {
      try {
        if (!f) {
          f = await api(`${base}/fragmentos`, { json: { ...modo.nuevo, ...cambios } });
          t.fragmentos.push(f);
          window.getSelection().removeAllRanges();
        } else {
          f = await api(`${base}/fragmentos/${f.id}`, { json: cambios, method: 'PATCH' });
          t.fragmentos = t.fragmentos.map((x) => (x.id === f.id ? f : x));
        }
        await refrescar();
        return true;
      } catch (e) {
        aviso(e.message);
        return false;
      }
    };
    $pop.oninput = (e) => {
      if (e.target.dataset.filtro !== undefined) {
        filtro = e.target.value.toLowerCase();
        pintar();
      }
    };
    $pop.onchange = async (e) => {
      if (e.target.dataset.refs === undefined || !e.target.files.length) return;
      const fd = new FormData();
      for (const archivo of e.target.files) fd.append('imagenes', archivo);
      const res = await fetch(`/api${base}/refs`, { method: 'POST', body: fd });
      const datos = await res.json();
      if (!res.ok) return aviso(datos.error || 'No se pudo subir');
      if (await guardarCambio({ refs: [...(f.refs || []), ...datos.nombres].slice(0, 6) })) pintar();
    };
    $pop.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cerrar !== undefined) return cerrarBarra();
      if (b.dataset.tipo) {
        if (await guardarCambio({ tipo: b.dataset.tipo })) {
          paso = 'enfoque';
          pintar();
        }
      }
      if (b.dataset.enfoque !== undefined) {
        if (await guardarCambio({ enfoque: b.dataset.enfoque })) cerrarBarra();
      }
      if (b.dataset.quitar !== undefined) {
        if (!confirm('¿Quitar este clip?')) return;
        try {
          await api(`${base}/fragmentos/${f.id}`, { method: 'DELETE' });
          t.fragmentos = t.fragmentos.filter((x) => x.id !== f.id);
          cerrarBarra();
          await refrescar();
        } catch (er) {
          aviso(er.message);
        }
      }
      if (b.dataset.nuevoTipo !== undefined) nuevoEnCatalogo('tipos', async (item) => {
        if (await guardarCambio({ tipo: item.id })) {
          paso = 'enfoque';
          pintar();
        }
      });
      if (b.dataset.nuevoEnfoque !== undefined) nuevoEnCatalogo('enfoques', async (item) => {
        if (await guardarCambio({ enfoque: item.id })) cerrarBarra();
      });
    };
    pintar();
  }
  function cerrarBarra() {
    $pop.hidden = true;
    $pop.innerHTML = '';
  }
  const cerrarFuera = (e) => {
    if (!$pop.hidden && !$pop.contains(e.target) && !$texto.contains(e.target) && !document.getElementById('modal').contains(e.target)) cerrarBarra();
  };
  const alTecla = (e) => e.key === 'Escape' && cerrarBarra();
  // Oyentes globales: se sueltan al salir de la vista o al volver a pintarla.
  soltarOyentes();
  document.addEventListener('mousedown', cerrarFuera);
  document.addEventListener('keydown', alTecla);
  soltarOyentes = () => {
    document.removeEventListener('mousedown', cerrarFuera);
    document.removeEventListener('keydown', alTecla);
  };
  window.addEventListener('hashchange', () => soltarOyentes(), { once: true });

  function nuevoEnCatalogo(clase, alCrear) {
    const caja = C.abrirModal(`<form class="pila" id="f-cat"><h2>${clase === 'tipos' ? 'Nuevo tipo de contenido' : 'Nuevo enfoque'}</h2>
      <label class="campo">Nombre<input type="text" name="titulo" required autofocus placeholder="${clase === 'tipos' ? 'Ej. Pantalla de celular con chat' : 'Ej. Anime'}"></label>
      <label class="campo">Descripción<span class="ayuda">Cómo debe verse. Claude la usa para armar el prompt.</span><textarea name="descripcion"></textarea></label>
      ${clase === 'tipos' ? `<div class="pila" style="gap:6px"><b>¿Cómo se hace?</b>
        <label><input type="radio" name="ruta" value="hyperframes" checked> Gratis con HyperFrames (gráficos, textos, animación con código)</label>
        <label><input type="radio" name="ruta" value="generador"> Con un generador de video de IA (gasta créditos)</label>
        <label><input type="radio" name="ruta" value="material"> Con clips de mi material</label>
        <label><input type="checkbox" name="persona"> Suele aparecer una persona</label>
        <label><input type="checkbox" name="capa"> Capa transparente para poner encima del video</label></div>` : ''}
      <div class="fila entre"><button type="button" class="btn" id="cancelar">Cancelar</button><button class="btn primario">Agregar</button></div></form>`, true);
    caja.querySelector('#cancelar').onclick = C.cerrarModal;
    caja.querySelector('#f-cat').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const item = await api(`/postpro/catalogo/${clase}`, { json: { titulo: fd.get('titulo'), descripcion: fd.get('descripcion'), ruta: fd.get('ruta'), persona: !!fd.get('persona'), capa: !!fd.get('capa') } });
        CAT[clase].push({ ...item, propio: true });
        C.cerrarModal();
        alCrear(item);
      } catch (er) {
        aviso(er.message);
      }
    };
  }

  // ----- persona -----
  function pintarPersona() {
    const $p = $c.querySelector('#pp-persona');
    const prep = t.preparacion;
    const img = t.rostro ? urlArchivo(d.slug, `postpro/${id}/${t.rostro}`) : r.personajeImagen ? urlArchivo(d.slug, r.personajeImagen) : null;
    $p.innerHTML = `<h3>Rostro de la persona (opcional)</h3>
      <div class="fila" style="align-items:flex-start;flex-wrap:nowrap">
        <div class="pp-rostro">${img ? `<img src="${img}" alt="">` : '<span>👤</span>'}</div>
        <div class="pila" style="gap:6px">
          <span class="mini">${t.rostro ? 'Los clips con persona usarán este rostro.' : r.personajeImagen ? 'Personaje creado por la IA. Se usa en todos los clips con persona.' : 'Sin foto: la IA crea un personaje que encaje y lo repite en todos los clips.'}</span>
          ${r.personaje?.descripcion ? `<span class="mini">${esc(r.personaje.descripcion)}</span>` : ''}
          ${prep?.estado === 'generando' ? '<span class="mini"><span class="girando"></span> Preparando biblia visual y persona…</span>' : ''}
          ${prep?.estado === 'error' ? `<span class="mini" style="color:var(--error)">${esc(prep.error || 'Falló la preparación')} · <a href="/api${base}/fragmentos/prep/registro" target="_blank">ver registro</a></span>` : ''}
          <div class="fila" style="gap:6px">
            <label class="btn chico">${t.rostro ? 'Cambiar foto' : 'Subir foto del rostro'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" id="pp-subir-rostro"></label>
            ${t.rostro ? '<button class="btn chico peligro" id="pp-quitar-rostro">Quitar</button>' : ''}
            ${!t.rostro && r.personajeImagen && !r.generando ? '<button class="btn chico" id="pp-rehacer">Otro personaje</button>' : ''}
          </div>
        </div>
      </div>
      ${r.biblia ? `<details><summary class="mini">Biblia visual del video (para que todos los clips combinen)</summary><pre class="registro" style="max-height:200px">${esc(JSON.stringify(r.biblia, null, 2))}</pre></details>` : ''}`;
    $p.querySelector('#pp-subir-rostro').onchange = async (e) => {
      const fd = new FormData();
      fd.append('imagen', e.target.files[0]);
      const res = await fetch(`/api${base}/rostro`, { method: 'POST', body: fd });
      if (!res.ok) return aviso((await res.json()).error || 'No se pudo subir');
      aviso('Rostro guardado');
      await refrescar();
    };
    $p.querySelector('#pp-quitar-rostro')?.addEventListener('click', async () => {
      try {
        await api(`${base}/rostro`, { method: 'DELETE' });
        await refrescar();
      } catch (er) {
        aviso(er.message);
      }
    });
    $p.querySelector('#pp-rehacer')?.addEventListener('click', async () => {
      await api(`${base}/rehacer-personaje`, { json: {} });
      aviso('Se creará otro personaje en la próxima generación');
      await refrescar();
    });
  }

  // ----- tarjetas de clips -----
  function pintarClips() {
    const $l = $c.querySelector('#pp-clips');
    if ($l.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    const orden = [...t.fragmentos].sort((a, b) => a.inicio - b.inicio);
    const filas = Object.fromEntries(r.estimacion.filas.map((x) => [x.id, x]));
    if (!orden.length) {
      $l.innerHTML = '<div class="panel vacio">Aún no hay clips. Selecciona frases en la transcripción para crearlos.</div>';
      return;
    }
    $l.innerHTML = `<h2>Clips (${orden.length})</h2>` + orden.map((f, n) => {
      const ruta = rutaDe(f);
      const tipo = tipoDe(f.tipo);
      const est = filas[f.id];
      const ocupado = ['en-cola', 'generando'].includes(f.estado);
      const salida = f.salida ? urlArchivo(d.slug, `salidas/${id}/${f.salida}`) : null;
      return `<div class="panel pila pp-clip ${ruta}" data-fid="${f.id}">
        <div class="fila entre">
          <div class="fila" style="gap:8px"><span class="pp-num ${ruta}">${n + 1}</span><b>${tc(f.inicio)} → ${tc(f.fin)}</b><span class="mini">${seg(f.fin - f.inicio)}</span></div>
          <div class="fila" style="gap:8px"><span class="estado ${f.estado === 'listo' ? 'listo' : f.estado === 'error' ? 'error' : ocupado ? 'produciendo' : f.estado === 'cambiado' ? 'por-aprobar' : 'borrador'}">${f.estado === 'generando' ? '<span class="girando"></span> ' : ''}${ESTADOS[f.estado] || f.estado}</span>
          <span class="mini">${ruta === 'generador' ? `≈ ${cr(est?.creditos)} créditos` : 'Gratis'}</span></div>
        </div>
        <p>«${esc(f.texto)}»</p>
        <div class="fila" style="gap:8px">
          <button class="chip activo" data-editar>${esc(tipo?.titulo || 'Elegir tipo')}</button>
          <button class="chip" data-editar>${esc(enfoqueDe(f.enfoque)?.titulo || `Enfoque general`)}</button>
          ${tipo?.capa ? '<span class="chip">Capa transparente (.mov)</span>' : ''}
          ${f.salida ? `<span class="chip">${f.conSonido ? '🔊 Con sonido' : '🔇 Sin sonido'}</span>` : ''}
        </div>
        <div class="dos" style="gap:10px">
          <label class="campo">Cómo se hace
            <select data-campo="generador" ${ocupado ? 'disabled' : ''}>
              <option value="">Según el tipo${tipo ? ` (${tipo.ruta === 'generador' ? genDe(ajustes.video)?.nombre : RUTAS[tipo.ruta].corto})` : ''}</option>
              ${CAT.generadores.video.map((g) => opcionGenerador(g, f.generador)).join('')}
            </select></label>
          <div class="fila" style="gap:8px;align-items:flex-end">
            <label class="campo" style="width:96px">Entrada (s)<input type="number" step="0.05" min="0" data-campo="inicio" value="${f.inicio}" ${ocupado ? 'disabled' : ''}></label>
            <label class="campo" style="width:96px">Salida (s)<input type="number" step="0.05" min="0" data-campo="fin" value="${f.fin}" ${ocupado ? 'disabled' : ''}></label>
          </div>
        </div>
        <label class="campo">Sonido
          <select data-campo="sonido" ${ocupado ? 'disabled' : ''}>
            <option value="">Como el general (${SONIDOS[sonidoGeneral()]})</option>
            ${Object.entries(SONIDOS).map(([k, v]) => `<option value="${k}" ${f.sonido === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select></label>
        ${f.sonidoAviso && f.salida ? `<p class="mini">${esc(f.sonidoAviso)}</p>` : ''}
        ${f.sonidoPendiente && f.salida && !ocupado ? `<div class="aviso-caja fila entre"><span>Cambiaste el sonido de este clip.</span>${r.generando ? '' : '<button class="btn chico primario" data-sonido>Actualizar solo el sonido (gratis)</button>'}</div>` : ''}
        ${ruta === 'generador' ? `<label class="fila mini" style="gap:6px"><input type="checkbox" data-campo="persona" ${est?.persona ? 'checked' : ''} ${ocupado ? 'disabled' : ''}> Aparece la persona (${t.rostro ? 'tu rostro' : 'personaje de la IA'})</label>
          ${est?.rostroNota ? `<p class="mini">${esc(est.rostroNota)}</p>` : ''}
          <p class="mini">${esc(est?.generadorNombre || '')}: ${est?.tomas > 1 ? `${est.tomas} tomas, ` : ''}${cr(est?.cobrados)} s cobrados (el clip se ajusta a ${seg(f.fin - f.inicio)}).</p>` : ''}
        ${f.refs?.length ? `<div class="fila" style="gap:6px">${f.refs.map((ref) => `<span class="pp-ref"><img src="${urlArchivo(d.slug, `postpro/${id}/refs/${ref}`)}" alt=""><button data-quitar-ref="${esc(ref)}" title="Quitar">✕</button></span>`).join('')}</div>` : ''}
        <textarea data-campo="nota" placeholder="Indicaciones para este clip (opcional): qué debe verse, colores, texto exacto…" ${ocupado ? 'disabled' : ''}>${esc(f.nota || '')}</textarea>
        ${f.error ? `<div class="aviso-caja" style="background:var(--error-suave);color:var(--error)">${esc(f.error)}</div>` : ''}
        ${salida ? `<video src="${salida}?v=${f.version || 0}" controls preload="metadata" class="pp-resultado" style="aspect-ratio:${t.video.ancho}/${t.video.alto}"></video>` : ''}
        <div class="fila entre">
          <div class="fila" style="gap:6px">
            ${f.ejecucion || f.enCurso ? `<a class="btn chico" href="/api${base}/fragmentos/${f.id}/registro" target="_blank">Ver registro</a>` : ''}
            ${salida ? `<a class="btn chico" href="${salida}" download>Descargar</a>` : ''}
          </div>
          ${!ocupado && !r.generando ? `<button class="btn chico ${f.estado === 'listo' ? '' : 'primario'}" data-generar>${f.estado === 'listo' ? 'Regenerar' : 'Generar este clip'}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    $l.querySelectorAll('.pp-clip').forEach(($k) => {
      const fid = $k.dataset.fid;
      const guardarCampo = async (cambios) => {
        try {
          const f = await api(`${base}/fragmentos/${fid}`, { json: cambios, method: 'PATCH' });
          t.fragmentos = t.fragmentos.map((x) => (x.id === fid ? f : x));
          await refrescar(true);
        } catch (er) {
          aviso(er.message);
          await refrescar(true);
        }
      };
      $k.querySelectorAll('[data-campo]').forEach((el) => {
        const evento = el.tagName === 'TEXTAREA' ? 'blur' : 'change';
        el.addEventListener(evento, () => {
          const k = el.dataset.campo;
          const valor = k === 'persona' ? el.checked : el.value;
          const f = t.fragmentos.find((x) => x.id === fid);
          if (k === 'nota' && valor === (f.nota || '')) return;
          guardarCampo({ [k]: valor });
        });
      });
      $k.querySelectorAll('[data-editar]').forEach((b) => (b.onclick = () => abrirBarra({ fid }, b.getBoundingClientRect())));
      $k.querySelectorAll('[data-quitar-ref]').forEach((b) => (b.onclick = () => {
        const f = t.fragmentos.find((x) => x.id === fid);
        guardarCampo({ refs: f.refs.filter((x) => x !== b.dataset.quitarRef) });
      }));
      $k.querySelector('[data-generar]')?.addEventListener('click', () => confirmarGeneracion([fid]));
      $k.querySelector('[data-sonido]')?.addEventListener('click', () => actualizarSonido([fid]));
      $k.querySelector('b').onclick = () => {
        const f = t.fragmentos.find((x) => x.id === fid);
        $video.currentTime = f.inicio;
        $video.play().catch(() => {});
      };
    });
  }

  // ----- exportar -----
  function pintarExport() {
    const $e = $c.querySelector('#pp-export');
    const listos = t.fragmentos.filter((f) => f.salida);
    if (!listos.length) {
      $e.hidden = true;
      return;
    }
    $e.hidden = false;
    const vp = t.vistaPrevia;
    $e.innerHTML = `<div class="fila entre"><h2>Exportar a tu editor</h2><span class="mini">${listos.length} de ${t.fragmentos.length} clips listos</span></div>
      <p class="mini">Cada clip dura exactamente lo que su frase, a ${t.video.ancho}×${t.video.alto} y ${t.video.fps} fps, sin la voz (${listos.some((f) => f.conSonido) ? 'los que tienen sonido traen solo sus efectos o música, en volumen bajo para ir debajo de tu voz' : 'sin audio'}). El nombre empieza con el número y el tiempo donde va (minutos-segundos-cuadros). La EDL los coloca solos en Premiere o DaVinci.</p>
      <div class="fila" style="gap:8px">
        <button class="btn primario" id="pp-carpeta">Abrir carpeta de clips</button>
        <a class="btn" href="${urlArchivo(d.slug, `salidas/${id}/indice.csv`)}" download>Índice (.csv)</a>
        <a class="btn" href="${urlArchivo(d.slug, `salidas/${id}/linea-de-tiempo.edl`)}" download>Línea de tiempo (.edl)</a>
        <button class="btn" id="pp-previa" ${vp?.estado === 'armando' || r.armandoPrevia ? 'disabled' : ''}>${vp?.estado === 'armando' || r.armandoPrevia ? '<span class="girando"></span> Armando vista previa…' : 'Ver clips sobre mi video'}</button>
      </div>
      ${vp?.estado === 'error' ? `<p class="mini" style="color:var(--error)">${esc(vp.error)}</p>` : ''}
      ${vp?.estado === 'listo' ? `<video src="${urlArchivo(d.slug, `salidas/${id}/${vp.archivo}`)}?v=${encodeURIComponent(vp.fecha)}" controls preload="metadata" class="pp-resultado" style="aspect-ratio:${t.video.ancho}/${t.video.alto}"></video>` : ''}`;
    $e.querySelector('#pp-carpeta').onclick = async () => {
      await api(`${base}/abrir-carpeta`, { json: {} });
      aviso('Carpeta abierta en el Finder');
    };
    $e.querySelector('#pp-previa').onclick = async () => {
      try {
        await api(`${base}/vista-previa`, { json: {} });
        await refrescar();
      } catch (er) {
        aviso(er.message);
      }
    };
  }

  // ----- barra inferior y confirmación -----
  function pintarBarra() {
    const $b = $c.querySelector('#pp-barra');
    const pendientes = t.fragmentos.filter((f) => f.estado !== 'listo');
    const sinTipo = t.fragmentos.filter((f) => !f.tipo).length;
    const listos = t.fragmentos.filter((f) => f.estado === 'listo').length;
    const enMarcha = t.fragmentos.filter((f) => ['en-cola', 'generando'].includes(f.estado)).length;
    const est = r.estimacion.totales;
    if (!t.fragmentos.length) {
      $b.innerHTML = '<span>Selecciona una frase en la transcripción para crear tu primer clip.</span>';
      return;
    }
    const sonidoPendiente = t.fragmentos.filter((f) => f.sonidoPendiente && f.salida && f.estado === 'listo');
    $b.innerHTML = r.generando
      ? `<span><span class="girando"></span> ${t.generacion?.soloSonido ? 'Actualizando sonido' : 'Generando'}: ${listos} listos, ${enMarcha} en marcha.</span><button class="btn peligro" id="pp-detener">Detener</button>`
      : `<span>${t.fragmentos.length} clips · ${est.gratis} gratis · ${est.pagos} con IA${sinTipo ? ` · <b style="color:var(--alerta)">${sinTipo} sin tipo</b>` : ''}</span>
         ${sonidoPendiente.length ? `<button class="btn" id="pp-sonido">Actualizar sonido de ${sonidoPendiente.length} clip(s)</button>` : ''}
         <button class="btn primario" id="pp-generar" ${pendientes.length ? '' : 'disabled'}>${pendientes.length ? `Evaluar y generar ${pendientes.length === t.fragmentos.length ? 'todo' : `${pendientes.length} pendientes`}` : 'Todo generado'}</button>`;
    $b.querySelector('#pp-generar')?.addEventListener('click', () => confirmarGeneracion(null));
    $b.querySelector('#pp-sonido')?.addEventListener('click', () => actualizarSonido(sonidoPendiente.map((f) => f.id)));
    $b.querySelector('#pp-detener')?.addEventListener('click', async () => {
      await api(`${base}/detener`, { json: {} });
      aviso('Deteniendo… los clips listos se conservan');
      await refrescar();
    });
  }

  // Rehace solo el sonido: quitarlo es inmediato; ponerlo usa a Claude con Epidemic Sound, sin créditos.
  async function actualizarSonido(ids) {
    try {
      const res = await api(`${base}/sonido`, { json: { fragmentos: ids } });
      aviso(res.clips && !r.generando ? 'Actualizando el sonido' : 'Listo');
      await refrescar(true);
    } catch (e) {
      aviso(e.message);
    }
  }

  async function confirmarGeneracion(ids) {
    const sinTipo = t.fragmentos.filter((f) => (!ids || ids.includes(f.id)) && f.estado !== 'listo' && !f.tipo);
    if (sinTipo.length && !ids) return aviso('Hay clips sin tipo de contenido: elígelo primero');
    let est;
    try {
      est = await api(`${base}/estimacion${ids ? `?fragmentos=${ids.join(',')}` : ''}`);
    } catch (e) {
      return aviso(e.message);
    }
    const orden = Object.fromEntries([...t.fragmentos].sort((a, b) => a.inicio - b.inicio).map((f, n) => [f.id, n + 1]));
    const tope = Math.ceil(est.totales.creditos);
    const unoListo = ids?.length === 1 && t.fragmentos.find((f) => f.id === ids[0])?.estado === 'listo';
    const caja = C.abrirModal(`<div class="pila">
      <h2>Antes de generar</h2>
      <p class="sutil">${est.filas.length} clip(s): ${est.totales.gratis} gratis con HyperFrames o tu material, ${est.totales.pagos} con IA.</p>
      <div class="pp-tabla"><table><tr><th>#</th><th>Frase</th><th>Cómo</th><th>Duración</th><th>Créditos</th><th>Tokens</th></tr>
        ${est.preparacion ? `<tr><td>—</td><td colspan="2">${C.esc(est.preparacion.motivo)}</td><td></td><td>${cr(est.preparacion.creditos)}</td><td>${C.num(est.preparacion.tokens)}</td></tr>` : ''}
        ${est.filas.map((x) => {
          const f = t.fragmentos.find((y) => y.id === x.id);
          return `<tr><td>${orden[x.id]}</td><td>${C.esc(f.texto.slice(0, 60))}${f.texto.length > 60 ? '…' : ''}${x.rostroNota ? `<div class="mini">${C.esc(x.rostroNota)}</div>` : ''}</td><td>${C.esc(x.generadorNombre)}${x.tomas > 1 ? ` · ${x.tomas} tomas` : ''}<div class="mini">${SONIDOS[x.sonido] || ''}</div></td><td>${seg(x.segundos)}${x.cobrados && x.cobrados !== x.segundos ? `<div class="mini">${cr(x.cobrados)} s cobrados</div>` : ''}</td><td>${x.creditos ? cr(x.creditos) : 'Gratis'}</td><td>${C.num(x.tokens)}</td></tr>`;
        }).join('')}
        <tr class="total"><td></td><td colspan="3">Total</td><td>${cr(est.totales.creditos)}</td><td>${C.num(est.totales.tokens)}</td></tr></table></div>
      ${est.avisos.map((a) => `<div class="aviso-caja">${C.esc(a)}</div>`).join('')}
      <div class="consumo"><div><span>Créditos de Higgsfield (precios del ${C.esc(est.consultado)})</span><b>${cr(est.totales.creditos)}</b></div>
        <div><span>Tokens de ${C.esc(est.claude)} ${est.calibrado ? '(según tus clips anteriores)' : '(aproximado)'}</span><b>${C.num(est.totales.tokens)}</b></div>
        <div><span>Equivalente en API (con suscripción no se cobra aparte)</span><b>US$ ${est.totales.usd.toFixed(2)}</b></div></div>
      ${unoListo ? '<label class="campo">¿Qué quieres cambiar? (opcional)<textarea id="pp-cambios" placeholder="Ej. más cerca, de noche, que el texto sea más grande"></textarea></label>' : ''}
      ${est.totales.creditos > 0 ? `<label class="fila mini">Tope total de créditos <input type="number" id="pp-tope" min="${tope}" value="${tope}" style="width:110px"> <span>Claude vuelve a cotizar antes de cada clip y no pasa del tope.</span></label>` : '<p class="mini">No gasta créditos de Higgsfield.</p>'}
      <div class="fila entre"><button class="btn" id="cancelar">Cancelar</button><button class="btn primario" id="confirmar">Generar ${est.filas.length} clip(s)</button></div></div>`);
    caja.querySelector('#cancelar').onclick = C.cerrarModal;
    caja.querySelector('#confirmar').onclick = async () => {
      const topeTotal = Number(caja.querySelector('#pp-tope')?.value || 0);
      if (est.totales.creditos > 0 && topeTotal < est.totales.creditos) return aviso(`El tope no puede ser menor a ${cr(est.totales.creditos)} créditos`);
      const cambios = unoListo ? { [ids[0]]: caja.querySelector('#pp-cambios').value } : undefined;
      try {
        await api(`${base}/generar`, { json: { fragmentos: ids || est.filas.map((x) => x.id), topeTotal, cambios } });
        C.cerrarModal();
        aviso('Generando los clips');
        await refrescar();
      } catch (e) {
        aviso(e.message);
      }
    };
  }

  // ----- ajustes -----
  const guardarAjuste = async (k, v) => {
    try {
      t = await api(base, { json: { ajustes: { [k]: v } }, method: 'PATCH' });
      Object.assign(ajustes, t.ajustes);
      await refrescar(true);
    } catch (e) {
      aviso(e.message);
    }
  };
  for (const k of ['video', 'imagen', 'claude', 'enfoque']) $c.querySelector(`#aj-${k}`).onchange = (e) => guardarAjuste(k, e.target.value);
  $c.querySelector('#aj-sonido').onchange = (e) => {
    $c.querySelector('#aj-musica-fila').hidden = !e.target.checked;
    guardarAjuste('sonido', e.target.checked);
  };
  $c.querySelector('#aj-musica').onchange = (e) => guardarAjuste('musica', e.target.checked);
  $c.querySelector('#pp-corregir').onclick = (e) => {
    estadoVista.corrigiendo = !estadoVista.corrigiendo;
    e.target.classList.toggle('primario', estadoVista.corrigiendo);
    $c.querySelector('#pp-ayuda').textContent = estadoVista.corrigiendo ? 'Modo corrección: haz clic en una palabra para corregirla. Vuelve a pulsar "Corregir palabras" para salir.' : 'Selecciona con el mouse una frase para convertirla en clip. Clic en una palabra para ir a ese momento del video; clic en un tramo resaltado para editarlo.';
    pintarTexto();
  };
  $c.querySelector('#pp-retranscribir').onclick = async () => {
    if (t.fragmentos.length && !confirm('Se transcribe de nuevo y se borran los clips marcados (los videos ya generados quedan en la carpeta). ¿Seguir?')) return;
    try {
      await api(`${base}/transcribir`, { json: {} });
      recargar();
    } catch (e) {
      aviso(e.message);
    }
  };

  // ----- refresco sin parpadeo: solo se repinta lo que cambió -----
  let firma = '';
  const fechaTranscripcion = t.transcripcion?.fecha;
  async function refrescar(forzar = false) {
    r = await api(base);
    t = r.trabajo;
    if (t.estado !== 'listo' || fechaTranscripcion !== t.transcripcion?.fecha) return recargar();
    const nueva = JSON.stringify([t.fragmentos, t.preparacion, t.rostro, t.vistaPrevia, r.generando, r.armandoPrevia, r.estimacion.totales, r.personaje, t.ajustes]);
    if (!forzar && nueva === firma) return;
    firma = nueva;
    // La transcripción solo se repinta si cambian los tramos resaltados (repintarla borra la selección del usuario).
    const huella = JSON.stringify(t.fragmentos.map((f) => [f.id, f.desde, f.hasta, f.tipo, f.generador, f.estado === 'listo']));
    if (forzar || huella !== huellaTexto) {
      huellaTexto = huella;
      pintarTexto();
    }
    pintarPersona();
    pintarClips();
    pintarExport();
    pintarBarra();
    const activo = r.generando || r.armandoPrevia;
    if (activo && !sondeando) {
      sondeando = true;
      C.vigilar(() => refrescar().catch(() => {}), 3000);
    } else if (!activo && sondeando) {
      sondeando = false;
      C.dejarDeVigilar();
    }
  }
  let sondeando = false;
  let huellaTexto = '';

  function accionesComunes() {
    $c.querySelector('#pp-nombre').onclick = async () => {
      const nombre = prompt('Nombre del video', t.titulo);
      if (!nombre?.trim()) return;
      await api(base, { json: { titulo: nombre.trim() }, method: 'PATCH' });
      recargar();
    };
    $c.querySelector('#pp-borrar').onclick = async () => {
      const conClips = t.fragmentos?.some((f) => f.salida);
      if (!confirm(`¿Borrar este video y sus clips marcados?${conClips ? ' Los clips ya generados también se borran.' : ''}`)) return;
      try {
        await api(`${base}?salidas=1`, { method: 'DELETE' });
        location.hash = `#/p/${d.slug}/postpro`;
      } catch (e) {
        aviso(e.message);
      }
    };
  }

  await refrescar(true);
}
