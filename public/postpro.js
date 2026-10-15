// Auto postproducción: subir un video ya cortado (o solo el guion), resaltar frases
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
const GUION_EXT = /\.(txt|md|markdown|docx|srt|vtt)$/i;
const sinVideo = (t) => !t.video?.archivo;

// Sube con XMLHttpRequest para mostrar el avance (los videos pesan).
function subirConProgreso(url, fd, barra, alTerminar) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  if (barra) {
    barra.hidden = false;
    xhr.upload.onprogress = (e) => e.lengthComputable && (barra.firstElementChild.style.width = `${(e.loaded / e.total) * 100}%`);
  }
  xhr.onload = () => {
    let r = {};
    try {
      r = JSON.parse(xhr.responseText);
    } catch {}
    alTerminar(xhr.status >= 400 ? r.error || 'No se pudo subir' : null, r);
  };
  xhr.onerror = () => alTerminar('Se cortó la subida', {});
  xhr.send(fd);
}

// Muestra en miniatura de una plantilla; con marca, usa su color de acento y su tipografía.
function muestraPlantilla(p, marca = null) {
  const c = p.css;
  const acento = marca?.acento || c.acento || c.texto;
  const fuente = marca?.fuente ? `'${marca.fuente.replace(/[^\p{L}\p{N} -]/gu, '')}', ${c.fuente}` : c.fuente;
  const estilo = `background:${c.fondo};color:${c.texto};font-family:${fuente};font-weight:${c.peso};text-transform:${c.transformar};letter-spacing:${c.espaciado};${c.sombra ? `text-shadow:${c.sombra};` : ''}`;
  const clases = ['pl-titular', c.tarjeta ? 'pl-tarjeta' : '', c.girado ? 'pl-girado' : '', c.caja ? 'pl-caja' : ''].join(' ');
  const deco = c.barras
    ? `<span class="pl-barras">${[40, 70, 55, 90].map((h) => `<i style="height:${h}%;background:${acento}"></i>`).join('')}</span>`
    : c.barra ? `<i class="pl-raya" style="background:${acento}"></i>` : '';
  return `<div class="pl-muestra" style="${estilo}">${deco}<span class="${clases}" style="${c.caja ? `background:${acento};color:#000;` : ''}${c.subrayado ? `box-shadow:inset 0 -0.35em 0 ${acento}55;` : ''}">Tu mensaje</span><span class="pl-dato" style="color:${acento}">+70%</span></div>`;
}
const paletaHtml = (lista) => `<span class="pl-paleta">${lista.map((h) => `<i style="background:${h}" title="${h}"></i>`).join('')}</span>`;

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
  const guionesProyecto = (d.archivos?.guiones || []).filter((a) => GUION_EXT.test(a.nombre));
  $c.innerHTML = `
    <div class="encabezado"><div><h1>Auto postproducción</h1>
      <p class="sutil">Sube tu video ya cortado, resalta frases de la transcripción y recibe un clip por frase (motion graphics, b-roll, tomas de apoyo…) listo para ponerlo encima en tu editor.</p></div></div>
    <div class="panel pila">
      <div class="fila entre"><h2>Nuevo</h2>
        <div class="segmentado" id="pp-modo"><button class="activo" data-modo="video">Subir video</button><button data-modo="guion">Desde un guion (sin video)</button></div></div>
      <div class="fila" style="align-items:flex-end">
        <label class="campo" style="flex:1;min-width:220px">Nombre (opcional)<input type="text" id="pp-titulo" placeholder="Ej. Reel lanzamiento octubre"></label>
        <label class="campo" style="width:180px">Idioma de la voz<select id="pp-idioma">${Object.entries(IDIOMAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      </div>
      <div class="pila" id="pp-guion" hidden>
        <p class="mini">Pega o sube el guion y resalta frases igual que en un video. Los tiempos se estiman como si se leyera en voz alta; cuando grabes, vinculas el video y los clips se acomodan solos.</p>
        <textarea id="pp-guion-texto" rows="8" placeholder="Pega aquí el guion…"></textarea>
        <div class="fila" style="gap:8px;align-items:flex-end">
          <label class="btn chico">Subir archivo (TXT, MD, DOCX)<input type="file" hidden accept=".txt,.md,.markdown,.docx,.srt,.vtt" id="pp-guion-archivo"></label>
          ${guionesProyecto.length ? `<label class="campo" style="flex:1;min-width:200px">O usa un guion del proyecto<select id="pp-guion-proyecto"><option value="">—</option>${guionesProyecto.map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)}</option>`).join('')}</select></label>` : ''}
          <span class="mini" id="pp-guion-nombre"></span>
        </div>
        <div class="fila" style="gap:8px;align-items:flex-end">
          <label class="campo" style="width:240px">Formato<select id="pp-formato">${Object.entries(CAT.formatos).map(([k, v]) => `<option value="${k}">${esc(v.titulo)}</option>`).join('')}</select></label>
          <label class="campo" style="width:160px">Ritmo de lectura<select id="pp-ritmo">${Object.entries(CAT.ritmos).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${esc(v.titulo)}</option>`).join('')}</select></label>
          <button class="btn primario" id="pp-crear-guion" style="margin-left:auto">Crear y resaltar</button>
        </div>
      </div>
      <div class="zona" id="pp-zona"><input type="file" hidden accept="video/*,.mov,.mp4,.m4v,.webm,.mkv">
        <b>Arrastra tu video aquí o haz clic</b><span class="mini">MP4 o MOV con la voz en off. La transcripción se hace en tu Mac: no gasta créditos ni tokens.</span>
        <div class="progreso" hidden style="width:260px;margin-top:8px"><i style="width:0"></i></div></div>
    </div>
    <div class="panel" style="padding:0;margin-top:16px">
      ${lista.length ? lista.map((t) => `<a class="fila-pedido" href="#/p/${d.slug}/postpro/${t.id}"><div><b>${esc(t.titulo)}</b>${t.origen === 'guion' ? ` <span class="chip">${t.video?.archivo ? 'Guion + video' : 'Guion'}</span>` : ''}
        <div class="mini">${t.video ? `${t.video.archivo ? '' : '≈ '}${seg(t.video.duracion)} · ${t.video.ancho}×${t.video.alto}` : ''} · ${fecha(t.creado)}</div></div>
        <span class="mini">${t.fragmentos ? `${t.listos}/${t.fragmentos} clips listos` : 'Sin clips aún'}</span>
        <span class="estado ${t.generando ? 'produciendo' : t.estado === 'error' ? 'error' : t.estado === 'transcribiendo' ? 'creando-storyboard' : 'listo'}">${t.generando ? 'Generando' : t.estado === 'transcribiendo' ? 'Transcribiendo' : t.estado === 'error' ? 'Error' : 'Listo para editar'}</span></a>`).join('') : '<p class="vacio">Aún no has subido videos ni guiones.</p>'}
    </div>`;

  const zona = $c.querySelector('#pp-zona');
  const input = zona.querySelector('input');
  const $guion = $c.querySelector('#pp-guion');
  $c.querySelector('#pp-modo').onclick = (e) => {
    const b = e.target.closest('[data-modo]');
    if (!b) return;
    $c.querySelectorAll('#pp-modo button').forEach((x) => x.classList.toggle('activo', x === b));
    zona.hidden = b.dataset.modo !== 'video';
    $guion.hidden = b.dataset.modo !== 'guion';
  };
  let archivoGuion = null;
  $c.querySelector('#pp-guion-archivo').onchange = (e) => {
    archivoGuion = e.target.files[0] || null;
    $c.querySelector('#pp-guion-nombre').textContent = archivoGuion ? `Archivo: ${archivoGuion.name}` : '';
    // Un TXT o MD se muestra en el cuadro para retocarlo antes de crear.
    if (archivoGuion && /\.(txt|md|markdown)$/i.test(archivoGuion.name)) archivoGuion.text().then((x) => ($c.querySelector('#pp-guion-texto').value = x));
  };
  $c.querySelector('#pp-crear-guion').onclick = async (e) => {
    const fd = new FormData();
    fd.append('titulo', $c.querySelector('#pp-titulo').value);
    fd.append('idioma', $c.querySelector('#pp-idioma').value);
    fd.append('formato', $c.querySelector('#pp-formato').value);
    fd.append('ritmo', $c.querySelector('#pp-ritmo').value);
    const texto = $c.querySelector('#pp-guion-texto').value;
    const delProyecto = $c.querySelector('#pp-guion-proyecto')?.value;
    if (texto.trim()) fd.append('texto', texto);
    else if (archivoGuion) fd.append('archivo', archivoGuion);
    else if (delProyecto) fd.append('guionProyecto', delProyecto);
    else return aviso('Pega el guion, sube un archivo o elige uno del proyecto');
    e.target.disabled = true;
    try {
      const res = await fetch(`/api/proyectos/${d.slug}/postpro/guion`, { method: 'POST', body: fd });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'No se pudo crear');
      location.hash = `#/p/${d.slug}/postpro/${r.id}`;
    } catch (er) {
      aviso(er.message);
      e.target.disabled = false;
    }
  };
  const subir = (archivo) => {
    if (!archivo) return;
    if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(archivo.name)) return aviso('Sube un video MP4, MOV o WebM');
    const fd = new FormData();
    fd.append('titulo', $c.querySelector('#pp-titulo').value);
    fd.append('idioma', $c.querySelector('#pp-idioma').value);
    fd.append('video', archivo);
    const barra = zona.querySelector('.progreso');
    zona.querySelector('b').innerHTML = '<span class="girando"></span> Subiendo video…';
    subirConProgreso(`/api/proyectos/${d.slug}/postpro`, fd, barra, (error, r) => {
      if (error || !r.id) {
        aviso(error || 'No se pudo subir el video');
        zona.querySelector('b').textContent = 'Arrastra tu video aquí o haz clic';
        barra.hidden = true;
        return;
      }
      location.hash = `#/p/${d.slug}/postpro/${r.id}`;
    });
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
      <p class="sutil">${sinVideo(t) ? `Guion · ≈ ${seg(t.video.duracion)} de lectura · ${t.video.ancho}×${t.video.alto} · ${t.video.fps} fps · sin video todavía` : `${seg(t.video.duracion)} · ${t.video.ancho}×${t.video.alto} · ${t.video.fps} fps · ${esc(t.video.nombre || '')}${t.origen === 'guion' ? ' · empezó como guion' : ''}`}</p></div>
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
        ${sinVideo(t) ? `<div class="panel pila pp-guion-info">
          <h3>Guion sin video</h3>
          <p class="mini">Los tiempos de cada palabra son estimados leyendo a ritmo ${esc(CAT.ritmos[t.guion?.ritmo]?.titulo.toLowerCase() || 'normal')}. Ya puedes generar los clips; cuando grabes, vincula el video y los clips se acomodan solos a los tiempos reales (los que cambien de duración quedan para regenerar).</p>
          <div class="fila" style="gap:8px"><button class="btn chico" id="pp-editar-guion">✎ Editar texto</button>
            <label class="btn chico primario">Vincular video grabado<input type="file" hidden accept="video/*,.mov,.mp4,.m4v,.webm,.mkv" id="pp-vincular"></label></div>
          <div class="progreso" hidden><i style="width:0"></i></div>
        </div>` : `<video id="pp-video" src="${urlArchivo(d.slug, `postpro/${id}/${t.video.archivo}`)}" controls preload="metadata" class="pp-video" style="aspect-ratio:${t.video.ancho}/${t.video.alto}"></video>`}
        <div class="panel pila" id="pp-estilo"></div>
        <div class="panel pila" id="pp-identidad"></div>
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
          <div class="fila entre"><h2>${sinVideo(t) ? 'Guion' : 'Transcripción'}</h2>
            ${sinVideo(t) ? '' : `<div class="fila" style="gap:8px"><button class="btn chico" id="pp-corregir">✎ Corregir palabras</button>
            <button class="btn chico" id="pp-retranscribir">Transcribir de nuevo</button></div>`}</div>
          ${t.error ? `<div class="aviso-caja">${esc(t.error)}</div>` : ''}
          ${t.aviso ? `<div class="aviso-caja">${esc(t.aviso)}</div>` : ''}
          <p class="mini" id="pp-ayuda">${sinVideo(t) ? 'Selecciona con el mouse una frase para convertirla en clip. Clic en un tramo resaltado para editarlo.' : 'Selecciona con el mouse una frase para convertirla en clip. Clic en una palabra para ir a ese momento del video; clic en un tramo resaltado para editarlo.'}</p>
          <div class="leyenda"><span class="frag hyperframes">Gratis (HyperFrames)</span><span class="frag material">Tu material</span><span class="frag generador">IA (créditos)</span></div>
          <div class="transcripcion" id="pp-texto"></div>
        </div>
        <div class="panel pila" id="pp-obs"></div>
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
    const palabra = (k) => `${palabras[k].par ? '<br><br>' : ''}<span class="w" data-i="${k}">${esc(palabras[k].t)}</span>`;
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
  $video?.addEventListener('timeupdate', () => {
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
    if (w && $video) {
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

  // ----- estilo: plantillas de motion graphics y edición -----
  const enFoco = ($el) => $el.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  const plantillaDe = (pid) => CAT.plantillas.find((p) => p.id === pid);
  const marcaDe = () => {
    const i = t.identidad || {};
    return i.paleta?.length || i.tipografias?.length ? { acento: i.paleta?.[0], fuente: i.tipografias?.[0] } : null;
  };
  const guardarTrabajo = async (cambios) => {
    try {
      await api(base, { json: cambios, method: 'PATCH' });
      await refrescar(true);
    } catch (e) {
      aviso(e.message);
    }
  };
  const tarjetaPlantilla = (p, { razon = '', elegida = false, marca = null } = {}) => `<button class="pl-card ${elegida ? 'activo' : ''}" data-plantilla="${p.id}" title="${esc(p.descripcion)}">
      ${muestraPlantilla(p, marca)}
      <b>${esc(p.titulo)}</b>
      ${razon ? `<span class="mini">${esc(razon)}</span>` : `<span class="mini">${esc(p.descripcion)}</span>`}
    </button>`;

  function pintarEstilo() {
    const $e = $c.querySelector('#pp-estilo');
    const elegida = plantillaDe(t.plantilla);
    const marca = marcaDe();
    const sugeridas = (r.sugerencias || []).filter((x) => x.id !== t.plantilla).map((x) => ({ ...x, p: plantillaDe(x.id) })).filter((x) => x.p);
    const g = t.estiloGaleria;
    $e.innerHTML = `<div class="fila entre"><h3>Estilo de edición</h3><span class="mini">opcional</span></div>
      ${elegida ? `<div class="pl-elegida">${muestraPlantilla(elegida, marca)}
          <div class="pila" style="gap:4px"><b>${esc(elegida.titulo)}</b><span class="mini">${esc(elegida.descripcion)}</span>
          <span class="mini">${esc(elegida.movimiento)}</span>
          ${marca ? '<span class="mini">Se adapta a tu marca: usa tus colores y tipografías y conserva el movimiento y la edición de la plantilla.</span>' : paletaHtml(elegida.paleta)}
          <div class="fila" style="gap:6px"><button class="btn chico" data-ver-todas>Cambiar</button><button class="btn chico peligro" data-quitar-plantilla>Quitar</button></div></div></div>`
        : '<p class="mini">Sin plantilla, los clips siguen la ficha de tu marca. Elige una para que todos compartan el mismo lenguaje de motion graphics y edición.</p>'}
      ${sugeridas.length ? `<b class="mini">${elegida ? 'Otras que encajan' : 'Sugeridas para este video'}</b><div class="pl-rejilla">${sugeridas.map((x) => tarjetaPlantilla(x.p, { razon: x.razon, marca })).join('')}</div>` : ''}
      <div class="fila" style="gap:6px">${elegida ? '' : '<button class="btn chico" data-ver-todas>Ver las 16 plantillas</button>'}<button class="btn chico" data-galeria>${g ? 'Cambiar inspiración' : 'Inspiración de la galería'}</button></div>
      ${g ? `<div class="estilo-elegido"><img src="${esc(g.poster)}" alt=""><div style="flex:1"><b class="mini">@${esc(g.autor)}</b> <span class="mini">${esc(g.tecnica)}</span><p class="mini">${esc(String(g.prompt).slice(0, 120))}…</p></div><button class="btn-icono" data-quitar-galeria title="Quitar">✕</button></div>` : ''}`;
    $e.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.plantilla) guardarTrabajo({ plantilla: b.dataset.plantilla });
      if (b.dataset.quitarPlantilla !== undefined) guardarTrabajo({ plantilla: null });
      if (b.dataset.verTodas !== undefined) abrirPlantillas();
      if (b.dataset.galeria !== undefined) C.abrirGaleria((x) => guardarTrabajo({ estiloGaleria: x }));
      if (b.dataset.quitarGaleria !== undefined) guardarTrabajo({ estiloGaleria: null });
    };
  }

  function abrirPlantillas() {
    const marca = marcaDe();
    const sugeridas = Object.fromEntries((r.sugerencias || []).map((x) => [x.id, x.razon]));
    const orden = [...CAT.plantillas].sort((a, b) => (b.id in sugeridas) - (a.id in sugeridas));
    const caja = C.abrirModal(`<div class="pila">
      <div class="fila entre"><h2>Plantillas de estilo</h2><button class="btn-icono" id="cerrar">✕</button></div>
      <p class="mini">${marca ? 'Las muestras ya usan tu color de acento y tu tipografía.' : 'Si subes la paleta o tipografías de tu marca, la plantilla se adapta a ellas.'} Las marcadas con ★ encajan con el enfoque y los clips de este video.</p>
      <div class="pl-rejilla grande">${orden.map((p) => tarjetaPlantilla(p, { razon: sugeridas[p.id] ? `★ ${sugeridas[p.id]}` : '', elegida: p.id === t.plantilla, marca })).join('')}</div></div>`);
    caja.querySelector('#cerrar').onclick = C.cerrarModal;
    caja.onclick = (ev) => {
      const b = ev.target.closest('[data-plantilla]');
      if (!b) return;
      C.cerrarModal();
      guardarTrabajo({ plantilla: b.dataset.plantilla });
    };
  }

  // ----- identidad de marca (todo opcional) -----
  const CLASES = {
    logos: { titulo: 'Logos', acepta: 'image/png,image/jpeg,image/webp,.svg' },
    tipografias: { titulo: 'Archivos de tipografía', acepta: '.ttf,.otf,.woff,.woff2' },
    recursos: { titulo: 'Recursos propios', acepta: 'image/*,video/*,.svg' },
    estilos: { titulo: 'Referencias de estilo de edición', acepta: 'image/*,video/*' },
  };
  function pintarIdentidad() {
    const $i = $c.querySelector('#pp-identidad');
    if (enFoco($i)) return;
    const i = { paleta: [], tipografias: [], webs: [], notas: '', ...(t.identidad || {}), archivos: { logos: [], recursos: [], tipografias: [], estilos: [], ...(t.identidad?.archivos || {}) } };
    const cuantos = i.paleta.length + i.tipografias.length + i.webs.length + Object.values(i.archivos).reduce((s2, l) => s2 + l.length, 0) + (i.notas.trim() ? 1 : 0);
    const abierto = $i.querySelector('details')?.open ?? cuantos > 0;
    const archivo = (clase, n) => {
      const url = urlArchivo(d.slug, `postpro/${id}/identidad/${clase}/${n}`);
      const vista = /\.(mp4|mov|m4v|webm)$/i.test(n) ? `<video src="${url}" muted preload="metadata"></video>` : /\.(ttf|otf|woff2?)$/i.test(n) ? `<span class="mini">Aa</span>` : `<img src="${url}" alt="">`;
      return `<span class="pp-ref" title="${esc(n)}">${vista}<button data-quitar-archivo="${clase}/${esc(n)}" title="Quitar">✕</button></span>`;
    };
    const ev = r.biblia?.evaluacion;
    $i.innerHTML = `<details ${abierto ? 'open' : ''}><summary><h3 style="display:inline">Identidad de marca</h3> <span class="mini">${cuantos ? `${cuantos} elemento(s)` : 'opcional'}</span></summary>
      <div class="pila" style="margin-top:10px">
        <p class="mini">Solo si el proyecto lo requiere. Lo que subas se evalúa antes de generar y se aplica a todos los clips; si no subes nada, se usa la ficha del proyecto.</p>
        ${ev ? `<div class="aviso-caja info"><b>Evaluación:</b> ${esc(ev)}</div>` : ''}
        <div class="pila" style="gap:6px"><b class="mini">Paleta de colores</b>
          <div class="fila" style="gap:6px">${i.paleta.map((h) => `<span class="pp-color" style="background:${h}" title="${h}"><button data-quitar-color="${h}" title="Quitar">✕</button></span>`).join('')}
            <input type="color" id="id-color" value="#6d5efc" title="Elige un color"><input type="text" id="id-hex" placeholder="#hex" style="width:90px;padding:5px 8px"><button class="btn chico" data-agregar-color>Agregar</button></div></div>
        <div class="pila" style="gap:6px"><b class="mini">Tipografías</b>
          <div class="fila" style="gap:6px">${i.tipografias.map((f) => `<span class="chip">${esc(f)} <button class="btn-icono" data-quitar-fuente="${esc(f)}">✕</button></span>`).join('')}
            <input type="text" id="id-fuente" placeholder="Nombre, ej. Montserrat" style="width:170px;padding:5px 8px"><button class="btn chico" data-agregar-fuente>Agregar</button></div></div>
        ${Object.entries(CLASES).map(([clase, info]) => `<div class="pila" style="gap:6px"><b class="mini">${info.titulo}</b>
          <div class="fila" style="gap:6px">${i.archivos[clase].map((n) => archivo(clase, n)).join('')}
            <label class="btn chico">＋ Subir<input type="file" hidden multiple accept="${info.acepta}" data-subir="${clase}"></label></div></div>`).join('')}
        <div class="pila" style="gap:6px"><b class="mini">Páginas web</b>
          ${i.webs.map((w) => `<div class="fila" style="gap:6px;flex-wrap:nowrap"><span class="mini" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.titulo || w.url)}</span>${paletaHtml((w.colores || []).slice(0, 5))}<button class="btn-icono" data-quitar-web="${esc(w.url)}" title="Quitar">✕</button></div>${w.error ? `<span class="mini">${esc(w.error)}</span>` : ''}`).join('')}
          <div class="fila" style="gap:6px"><input type="url" id="id-web" placeholder="https://tumarca.com" style="flex:1;min-width:160px;padding:5px 8px"><button class="btn chico" data-agregar-web>Agregar</button></div></div>
        <label class="campo">Notas de identidad<textarea id="id-notas" rows="2" placeholder="Ej. tono cercano, nunca usar fondos blancos, el logo solo al final">${esc(i.notas)}</textarea></label>
      </div></details>`;
    const guardarIdentidad = (cambios) => guardarTrabajo({ identidad: cambios });
    $i.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.agregarColor !== undefined) {
        const hex = ($i.querySelector('#id-hex').value.trim() || $i.querySelector('#id-color').value).toLowerCase();
        const limpio = hex.startsWith('#') ? hex : `#${hex}`;
        if (!/^#[0-9a-f]{6}$/.test(limpio)) return aviso('Escribe el color como #RRGGBB');
        guardarIdentidad({ paleta: [...i.paleta, limpio] });
      }
      if (b.dataset.quitarColor) guardarIdentidad({ paleta: i.paleta.filter((h) => h !== b.dataset.quitarColor) });
      if (b.dataset.agregarFuente !== undefined) {
        const f = $i.querySelector('#id-fuente').value.trim();
        if (f) guardarIdentidad({ tipografias: [...i.tipografias, f] });
      }
      if (b.dataset.quitarFuente) guardarIdentidad({ tipografias: i.tipografias.filter((f) => f !== b.dataset.quitarFuente) });
      if (b.dataset.quitarArchivo) {
        try {
          await api(`${base}/identidad/${b.dataset.quitarArchivo}`, { method: 'DELETE' });
          await refrescar(true);
        } catch (er) {
          aviso(er.message);
        }
      }
      if (b.dataset.agregarWeb !== undefined) {
        const url = $i.querySelector('#id-web').value.trim();
        if (!url) return;
        b.disabled = true;
        b.innerHTML = '<span class="girando"></span>';
        try {
          await api(`${base}/identidad-web`, { json: { url } });
          $i.querySelector('#id-web').value = '';
          document.activeElement?.blur();
          await refrescar(true);
        } catch (er) {
          aviso(er.message);
          b.disabled = false;
          b.textContent = 'Agregar';
        }
      }
      if (b.dataset.quitarWeb) {
        try {
          await api(`${base}/identidad-web?url=${encodeURIComponent(b.dataset.quitarWeb)}`, { method: 'DELETE' });
          await refrescar(true);
        } catch (er) {
          aviso(er.message);
        }
      }
    };
    $i.querySelector('#id-color').oninput = (e) => ($i.querySelector('#id-hex').value = e.target.value);
    $i.querySelector('#id-notas').onblur = (e) => e.target.value !== i.notas && guardarIdentidad({ notas: e.target.value });
    $i.querySelectorAll('[data-subir]').forEach((inp) => (inp.onchange = async () => {
      if (!inp.files.length) return;
      const fd = new FormData();
      for (const f of inp.files) fd.append('archivos', f);
      inp.closest('label').innerHTML = '<span class="girando"></span> Subiendo…';
      const res = await fetch(`/api${base}/identidad/${inp.dataset.subir}`, { method: 'POST', body: fd });
      if (!res.ok) aviso((await res.json().catch(() => ({}))).error || 'No se pudo subir');
      await refrescar(true);
    }));
  }

  // ----- sugerencias y observaciones puntuales -----
  function pintarObservaciones() {
    const $o = $c.querySelector('#pp-obs');
    if (enFoco($o)) return;
    const lista = t.observaciones || [];
    const orden = [...t.fragmentos].sort((a, b) => a.inicio - b.inicio);
    const numero = Object.fromEntries(orden.map((f, n) => [f.id, n + 1]));
    $o.innerHTML = `<div class="fila entre"><h2>Sugerencias y observaciones</h2><span class="mini">${lista.length ? `${lista.length} anotada(s)` : 'opcional'}</span></div>
      <p class="mini">Anota observaciones puntuales que Claude debe respetar, para todo el video o para un clip. Las de todo el video se aplican a los clips que generes desde ahora; una observación sobre un clip ya hecho lo deja listo para regenerar.</p>
      ${lista.length ? `<div class="pila" style="gap:6px">${lista.map((o) => `<div class="pp-obs"><span class="chip ${o.clip ? '' : 'activo'}">${o.clip ? `Clip ${numero[o.clip] || '?'}` : 'Todo el video'}</span><span style="flex:1">${esc(o.texto)}</span><button class="btn-icono" data-quitar-obs="${o.id}" title="Quitar">✕</button></div>`).join('')}</div>` : ''}
      <div class="fila" style="gap:8px;align-items:flex-start">
        <select id="obs-clip" style="width:170px"><option value="">Todo el video</option>${orden.map((f) => `<option value="${f.id}">Clip ${numero[f.id]}: ${esc(f.texto.slice(0, 24))}…</option>`).join('')}</select>
        <textarea id="obs-texto" rows="2" style="flex:1;min-width:200px" placeholder="Ej. que el logo aparezca solo al final, no usar fondos blancos, el número del clip 3 es 70%"></textarea>
        <button class="btn" id="obs-agregar">Agregar</button></div>`;
    $o.querySelector('#obs-agregar').onclick = async () => {
      const texto = $o.querySelector('#obs-texto').value.trim();
      if (!texto) return aviso('Escribe la observación');
      try {
        await api(`${base}/observaciones`, { json: { texto, clip: $o.querySelector('#obs-clip').value || null } });
        $o.querySelector('#obs-texto').value = '';
        document.activeElement?.blur();
        await refrescar(true);
      } catch (e) {
        aviso(e.message);
      }
    };
    $o.querySelectorAll('[data-quitar-obs]').forEach((b) => (b.onclick = async () => {
      await api(`${base}/observaciones/${b.dataset.quitarObs}`, { method: 'DELETE' });
      await refrescar(true);
    }));
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
          <div class="fila" style="gap:8px"><span class="pp-num ${ruta}">${n + 1}</span><b>${tc(f.inicio)} → ${tc(f.fin)}</b><span class="mini">${sinVideo(t) ? '≈ ' : ''}${seg(f.fin - f.inicio)}</span></div>
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
        ${(t.observaciones || []).filter((o) => o.clip === f.id).map((o) => `<p class="mini">📝 ${esc(o.texto)}</p>`).join('')}
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
        if (!$video) return;
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
        ${sinVideo(t) ? '<span class="mini">Vincula el video grabado para verlos encima de tu voz.</span>' : `<button class="btn" id="pp-previa" ${vp?.estado === 'armando' || r.armandoPrevia ? 'disabled' : ''}>${vp?.estado === 'armando' || r.armandoPrevia ? '<span class="girando"></span> Armando vista previa…' : 'Ver clips sobre mi video'}</button>`}
      </div>
      ${vp?.estado === 'error' ? `<p class="mini" style="color:var(--error)">${esc(vp.error)}</p>` : ''}
      ${vp?.estado === 'listo' ? `<video src="${urlArchivo(d.slug, `salidas/${id}/${vp.archivo}`)}?v=${encodeURIComponent(vp.fecha)}" controls preload="metadata" class="pp-resultado" style="aspect-ratio:${t.video.ancho}/${t.video.alto}"></video>` : ''}`;
    $e.querySelector('#pp-carpeta').onclick = async () => {
      await api(`${base}/abrir-carpeta`, { json: {} });
      aviso('Carpeta abierta en el Finder');
    };
    $e.querySelector('#pp-previa')?.addEventListener('click', async () => {
      try {
        await api(`${base}/vista-previa`, { json: {} });
        await refrescar();
      } catch (er) {
        aviso(er.message);
      }
    });
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
  $c.querySelector('#pp-corregir')?.addEventListener('click', (e) => {
    estadoVista.corrigiendo = !estadoVista.corrigiendo;
    e.target.classList.toggle('primario', estadoVista.corrigiendo);
    $c.querySelector('#pp-ayuda').textContent = estadoVista.corrigiendo ? 'Modo corrección: haz clic en una palabra para corregirla. Vuelve a pulsar "Corregir palabras" para salir.' : 'Selecciona con el mouse una frase para convertirla en clip. Clic en una palabra para ir a ese momento del video; clic en un tramo resaltado para editarlo.';
    pintarTexto();
  });
  $c.querySelector('#pp-retranscribir')?.addEventListener('click', async () => {
    const aviso2 = t.origen === 'guion' ? 'Se transcribe de nuevo y los clips se reubican en lo que se dice. ¿Seguir?' : 'Se transcribe de nuevo y se borran los clips marcados (los videos ya generados quedan en la carpeta). ¿Seguir?';
    if (t.fragmentos.length && !confirm(aviso2)) return;
    try {
      await api(`${base}/transcribir`, { json: {} });
      recargar();
    } catch (e) {
      aviso(e.message);
    }
  });

  // ----- guion sin video: editar el texto o vincular el video grabado -----
  $c.querySelector('#pp-editar-guion')?.addEventListener('click', () => {
    const caja = C.abrirModal(`<div class="pila"><h2>Editar guion</h2>
      <p class="mini">Los clips marcados se reubican solos en el texto nuevo; si su frase desaparece, se quitan y te avisamos.</p>
      <textarea id="g-texto" rows="14">${esc(t.guion?.texto || '')}</textarea>
      <label class="campo" style="width:200px">Ritmo de lectura<select id="g-ritmo">${Object.entries(CAT.ritmos).map(([k, v]) => `<option value="${k}" ${k === (t.guion?.ritmo || 'normal') ? 'selected' : ''}>${esc(v.titulo)} (${String(v.pps).replace('.', ',')} palabras/s)</option>`).join('')}</select></label>
      <div class="fila entre"><button class="btn" id="cancelar">Cancelar</button><button class="btn primario" id="guardar">Guardar</button></div></div>`);
    caja.querySelector('#cancelar').onclick = C.cerrarModal;
    caja.querySelector('#guardar').onclick = async () => {
      try {
        await api(`${base}/guion`, { json: { texto: caja.querySelector('#g-texto').value, ritmo: caja.querySelector('#g-ritmo').value }, method: 'PUT' });
        C.cerrarModal();
        recargar();
      } catch (e) {
        aviso(e.message);
      }
    };
  });
  $c.querySelector('#pp-vincular')?.addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const fd = new FormData();
    fd.append('video', archivo);
    const info = $c.querySelector('.pp-guion-info');
    subirConProgreso(`/api${base}/video`, fd, info.querySelector('.progreso'), (error) => {
      if (error) {
        aviso(error);
        info.querySelector('.progreso').hidden = true;
        return;
      }
      aviso('Video vinculado: transcribiendo para ubicar los clips');
      recargar();
    });
  });

  // ----- refresco sin parpadeo: solo se repinta lo que cambió -----
  let firma = '';
  const fechaTranscripcion = t.transcripcion?.fecha;
  async function refrescar(forzar = false) {
    r = await api(base);
    t = r.trabajo;
    if (t.estado !== 'listo' || fechaTranscripcion !== t.transcripcion?.fecha) return recargar();
    const nueva = JSON.stringify([t.fragmentos, t.preparacion, t.rostro, t.vistaPrevia, r.generando, r.armandoPrevia, r.estimacion.totales, r.personaje, t.ajustes, t.identidad, t.plantilla, t.estiloGaleria, t.observaciones, r.sugerencias, r.biblia]);
    if (!forzar && nueva === firma) return;
    firma = nueva;
    // La transcripción solo se repinta si cambian los tramos resaltados (repintarla borra la selección del usuario).
    const huella = JSON.stringify(t.fragmentos.map((f) => [f.id, f.desde, f.hasta, f.tipo, f.generador, f.estado === 'listo']));
    if (forzar || huella !== huellaTexto) {
      huellaTexto = huella;
      pintarTexto();
    }
    pintarEstilo();
    pintarIdentidad();
    pintarObservaciones();
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
