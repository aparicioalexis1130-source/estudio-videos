import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ESTUDIO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-test-'));
const pp = await import('../lib/postpro.js');
const run = await import('../lib/postpro-run.js');

const palabras = 'Hoy tostamos el café con cuidado y lo servimos en una taza perfecta para ti'.split(' ').map((t, k) => ({ t, i: k * 0.5, f: k * 0.5 + 0.4 }));
const trabajo = (extra = {}) => ({ id: 'pp-x', video: { ancho: 1080, alto: 1920, fps: 29.97, duracion: 10 }, transcripcion: { palabras }, fragmentos: [], ajustes: {}, ...extra });

test('las tomas respetan los límites de cada modelo', () => {
  assert.deepEqual(pp.planTomas(pp.generador('kling3_0'), 2.4), { tomas: 1, cobrados: 3, porToma: 3 });
  assert.deepEqual(pp.planTomas(pp.generador('kling3_0'), 20), { tomas: 2, cobrados: 20, porToma: 10 });
  assert.deepEqual(pp.planTomas(pp.generador('veo3_1'), 5), { tomas: 1, cobrados: 6, porToma: 6 });
  assert.deepEqual(pp.planTomas(pp.generador('veo3_1'), 12), { tomas: 2, cobrados: 12, porToma: 6 });
  assert.equal(pp.planTomas(pp.generador('hyperframes'), 5).cobrados, 0);
});

test('los fragmentos no se cruzan y toman los tiempos de las palabras', () => {
  const t = trabajo();
  const f = pp.armarFragmento(t, { desde: 1, hasta: 3, tipo: 'b-roll' });
  assert.equal(f.texto, 'tostamos el café');
  assert.equal(f.inicio, 0.5);
  assert.equal(f.fin, 1.9);
  t.fragmentos.push(f);
  assert.throws(() => pp.armarFragmento(t, { desde: 3, hasta: 5 }), /cruza/);
  const g = pp.armarFragmento(t, { desde: 6, hasta: 4 });
  assert.equal(g.desde, 4);
});

test('la estimación cobra el fotograma inicial cuando el modelo no acepta rostro', () => {
  const t = trabajo();
  t.fragmentos = [
    pp.armarFragmento(t, { desde: 0, hasta: 2, tipo: 'motion-graphic' }),
    { ...pp.armarFragmento(t, { desde: 3, hasta: 6, tipo: 'personaje' }), id: 'b' },
    { ...pp.armarFragmento(t, { desde: 8, hasta: 10, tipo: 'b-roll', generador: 'seedance_2_0_mini' }), id: 'c' },
  ];
  t.fragmentos[2].persona = true;
  const cat = { tipos: pp.TIPOS_BASE, enfoques: pp.ENFOQUES_BASE };
  const e = pp.estimar(t, cat);
  const [mg, kling, mini] = e.filas;
  assert.equal(mg.creditos, 0);
  assert.equal(kling.creditosVideo, 3 * 1.25);
  assert.equal(kling.creditosImagen, 2); // Nano Banana Pro para el fotograma con la persona
  assert.match(kling.rostroNota, /no acepta/);
  assert.equal(mini.creditosImagen, 0); // Seedance usa la referencia directa
  assert.equal(e.preparacion.creditos, 2); // personaje diseñado por la IA
  assert.equal(e.totales.creditos, 3.75 + 2 + 4 + 2);
  const conRostro = pp.estimar({ ...t, rostro: 'rostro.jpg' }, cat);
  assert.equal(conRostro.preparacion.creditos, 0);
});

test('timecodes, nombres y EDL', () => {
  assert.equal(pp.timecode(61.5, 30), '00:01:01:15');
  const t = trabajo({ titulo: 'Prueba' });
  const f = { ...pp.armarFragmento(t, { desde: 2, hasta: 3, tipo: 'b-roll' }), salida: 'x.mp4' };
  t.fragmentos = [f];
  assert.match(pp.nombreClip(f, 1, 30), /^01_00-00-01-00_el-cafe\.mp4$/);
  const edl = pp.edlExport(t);
  assert.match(edl, /001 {2}CLIP001 {2}V {5}C {8}00:00:00:00 00:00:00:27 00:00:01:00 00:00:01:27/);
  assert.match(pp.csvExport(t, pp.TIPOS_BASE, pp.ENFOQUES_BASE), /B-roll,Publicidad \/ ads,no,el café/);
});

test('los prompts tienen estructura fija y pasos seguidos', () => {
  const t = trabajo();
  const cat = { tipos: pp.TIPOS_BASE, enfoques: pp.ENFOQUES_BASE };
  const f = { ...pp.armarFragmento(t, { desde: 3, hasta: 6, tipo: 'personaje' }), topeCreditos: 7 };
  const p = pp.promptFragmento(t, f, cat);
  for (const campo of ['"subject"', '"action"', '"camera"', '"lighting"', '"continuity"', '"negative"', 'biblia.json', 'get_cost', 'start_image']) assert.ok(p.includes(campo), campo);
  const pasos = [...p.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(pasos, pasos.map((_, k) => k + 1));
  const capa = pp.promptFragmento(t, pp.armarFragmento(t, { desde: 0, hasta: 1, tipo: 'rotulo' }), cat);
  assert.match(capa, /--format mov/);
  assert.match(capa, /0\.00 Hoy · 0\.50 tostamos/);
  assert.doesNotMatch(capa, /generate_video/);
});

test('aspecto más parecido y palabras desde subtítulos', () => {
  assert.equal(pp.aspectoCercano(1080, 1920, ['16:9', '9:16', '1:1']), '9:16');
  assert.equal(pp.aspectoCercano(1080, 1350, ['auto', '16:9', '4:3', '3:4', '1:1']), '3:4');
  const w = run.palabrasDesde([{ text: 'hola mundo', start: 1, end: 2 }, { text: 'chao', start: 3, end: 3.5 }]);
  assert.deepEqual(w.map((x) => x.t), ['hola', 'mundo', 'chao']);
  assert.equal(w[1].f, 2);
});

let hayFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hayFfmpeg = false;
}
test('el clip queda con las medidas, fps y duración del original', { skip: !hayFfmpeg }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-'));
  const entrada = path.join(dir, 'in.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=24:d=2', '-pix_fmt', 'yuv420p', entrada]);
  const salida = path.join(dir, 'out.mp4');
  await run.normalizar(entrada, salida, { ancho: 720, alto: 1280, fps: 30, duracion: 3.2 });
  const m = await run.medirVideo(entrada.replace('in', 'in'));
  assert.equal(m.ancho, 1280);
  const o = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', salida]));
  assert.equal(o.streams.length, 1); // sin audio
  assert.equal(o.streams[0].width, 720);
  assert.equal(o.streams[0].height, 1280);
  assert.equal(o.streams[0].r_frame_rate, '30/1');
  assert.ok(Math.abs(Number(o.format.duration) - 3.2) < 0.05, o.format.duration);
});

test('la casilla de sonido general y la elección de cada clip', () => {
  assert.equal(pp.sonidoDe({}, {}), 'no');
  assert.equal(pp.sonidoDe({}, { sonido: true }), 'efectos');
  assert.equal(pp.sonidoDe({}, { sonido: true, musica: true }), 'efectos-musica');
  assert.equal(pp.sonidoDe({ sonido: 'no' }, { sonido: true }), 'no');
  assert.equal(pp.sonidoDe({ sonido: 'efectos' }, { sonido: false }), 'efectos');
  const t = trabajo();
  assert.equal(pp.armarFragmento(t, { desde: 0, hasta: 1, sonido: 'raro' }).sonido, null);
});

test('con sonido el prompt pide efectos de interfaz o ambiente sin gastar créditos', () => {
  const cat = { tipos: pp.TIPOS_BASE, enfoques: pp.ENFOQUES_BASE };
  const t = trabajo({ ajustes: { sonido: true } });
  const grafico = pp.promptFragmento(t, pp.armarFragmento(t, { desde: 0, hasta: 2, tipo: 'dato' }), cat);
  assert.match(grafico, /INTERFAZ/);
  assert.match(grafico, /sonido\.wav/);
  assert.match(grafico, /Epidemic Sound/);
  assert.match(grafico, /No generes audio con Higgsfield/);
  const escena = pp.promptFragmento(t, { ...pp.armarFragmento(t, { desde: 3, hasta: 5, tipo: 'b-roll', sonido: 'efectos-musica' }), topeCreditos: 5 }, cat);
  assert.match(escena, /AMBIENTE/);
  assert.match(escena, /base musical/);
  const mudo = pp.promptFragmento(trabajo(), pp.armarFragmento(trabajo(), { desde: 0, hasta: 2, tipo: 'dato' }), cat);
  assert.doesNotMatch(mudo, /sonido\.wav/);
  assert.match(mudo, /SIN audio/);
  const solo = pp.promptSonido(t, pp.armarFragmento(t, { desde: 0, hasta: 2, tipo: 'dato' }), cat);
  assert.match(solo, /NO lo cambies/);
  assert.doesNotMatch(solo, /generate_video/);
  // El sonido suma tokens pero no créditos.
  const f = pp.armarFragmento(t, { desde: 0, hasta: 2, tipo: 'dato' });
  const con = pp.estimar({ ...t, fragmentos: [f] }, cat);
  const sin = pp.estimar({ ...t, ajustes: {}, fragmentos: [f] }, cat);
  assert.ok(con.totales.tokens > sin.totales.tokens);
  assert.equal(con.totales.creditos, 0);
});

test('el sonido se ajusta a la duración exacta del clip', { skip: !hayFfmpeg }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-'));
  const entrada = path.join(dir, 'in.mp4');
  const audio = path.join(dir, 'sonido.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24:d=3', '-pix_fmt', 'yuv420p', entrada]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=d=1', audio]);
  const salida = path.join(dir, 'out.mp4');
  await run.normalizar(entrada, salida, { ancho: 640, alto: 360, fps: 30, duracion: 2.5, audio });
  const o = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', salida]));
  const a = o.streams.find((x) => x.codec_type === 'audio');
  assert.ok(a, 'debe tener audio');
  assert.ok(Math.abs(Number(a.duration) - 2.5) < 0.06, a.duration);
  assert.equal(await run.tieneAudio(salida), true);
  assert.equal(await run.tieneAudio(entrada), false);
});

test('un guion pegado da palabras con tiempos estimados y párrafos', () => {
  const p = pp.palabrasDeGuion('# Título\n\n**Hola** a todos, hoy hablamos.\n\n- Primer punto aquí.', 'normal');
  assert.deepEqual(p.map((w) => w.t), ['Título', 'Hola', 'a', 'todos,', 'hoy', 'hablamos.', 'Primer', 'punto', 'aquí.']);
  assert.ok(p[1].par && p[6].par && !p[2].par);
  for (let k = 1; k < p.length; k++) assert.ok(p[k].i >= p[k - 1].f, 'los tiempos avanzan');
  const pps = p.length / p.at(-1).f;
  assert.ok(pps > 1.6 && pps < 3, `ritmo razonable (${pps.toFixed(2)} palabras/s)`);
  assert.ok(pp.palabrasDeGuion('uno dos tres cuatro', 'rapido').at(-1).f < pp.palabrasDeGuion('uno dos tres cuatro', 'lento').at(-1).f);
});

test('al editar el guion o vincular el video los clips se reubican', () => {
  const viejas = pp.palabrasDeGuion('Hoy les quiero contar cómo tostamos el mejor café. Visita nuestra web.');
  const nuevas = 'Hoy les voy a contar cómo tostamos el mejor café de Medellín. Entra a la tienda.'.split(' ').map((t, k) => ({ t, i: k, f: k + 0.8 }));
  const frags = [
    { id: 'a', desde: 5, hasta: 8, texto: 'tostamos el mejor café.', inicio: 0, fin: 1, estado: 'listo', salida: 'x.mp4' },
    { id: 'b', desde: 9, hasta: 11, texto: 'Visita nuestra web.', inicio: 0, fin: 1 },
  ];
  const r = pp.remapearFragmentos(viejas, nuevas, frags);
  assert.equal(r.fragmentos.length, 1);
  assert.equal(r.fragmentos[0].texto, 'tostamos el mejor café');
  assert.equal(r.fragmentos[0].inicio, 6);
  assert.equal(r.fragmentos[0].estado, 'cambiado', 'cambió la duración: hay que regenerarlo');
  assert.deepEqual(r.perdidos.map((f) => f.id), ['b']);
});

test('identidad, plantilla y observaciones llegan a los prompts y a la biblia', async () => {
  const catalogo = await pp.leerCatalogo();
  const t = trabajo({ video: { archivo: null, ancho: 1080, alto: 1920, fps: 30, duracion: 10 }, origen: 'guion' });
  const f = pp.armarFragmento(t, { desde: 1, hasta: 3, tipo: 'dato' });
  t.fragmentos.push(f);
  assert.equal(pp.firmaEstilo(t), '', 'sin identidad no hay nada que preparar');
  assert.equal(pp.estimar(t, catalogo).preparacion, null, 'un clip gratis sin estilo no necesita preparación');
  t.plantilla = 'kinetic-bold';
  t.identidad = { paleta: ['#ff0055'], tipografias: ['Montserrat'], archivos: { logos: ['logo.png'] } };
  t.observaciones = [{ id: 'o1', texto: 'Nada de fondos blancos', clip: null }, { id: 'o2', texto: 'El número va grande', clip: f.id }];
  const est = pp.estimar(t, catalogo);
  assert.ok(est.preparacion && /identidad/.test(est.preparacion.motivo));
  const prompt = pp.promptFragmento(t, f, catalogo);
  assert.match(prompt, /tiempos son estimados/);
  assert.match(prompt, /Tipografía cinética bold/);
  assert.match(prompt, /#ff0055/);
  assert.match(prompt, /identidad\/logos\/logo\.png/);
  assert.match(prompt, /Nada de fondos blancos/);
  assert.match(prompt, /El número va grande/);
  assert.match(prompt, /mandan sobre los de la plantilla/);
  const prep = pp.promptPreparacion(t, catalogo);
  assert.match(prep, /"evaluacion"/);
  assert.match(prep, /el guion \(el video aún no está grabado\)/);
  // Ya preparada con esta identidad, no se repite; si cambia, sí.
  t.preparacion = { estado: 'listo', firma: pp.firmaEstilo(t) };
  assert.equal(pp.estimar(t, catalogo).preparacion, null);
  t.identidad.paleta.push('#111111');
  assert.ok(pp.estimar(t, catalogo).preparacion);
});

test('las plantillas sugeridas siguen el enfoque y los tipos de clip', async () => {
  const catalogo = await pp.leerCatalogo();
  assert.equal(pp.PLANTILLAS_ESTILO.length, 16);
  const t = trabajo({ ajustes: { enfoque: 'corporativo' }, fragmentos: [{ tipo: 'dato' }, { tipo: 'infografia' }, { tipo: 'comparacion' }] });
  const s = pp.sugerirPlantillas(t, catalogo);
  assert.equal(s.length, 3);
  assert.equal(s[0].id, 'dashboard-datos');
  assert.match(s[0].razon, /Corporativo/);
});
