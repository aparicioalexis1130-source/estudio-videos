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
  assert.match(pp.csvExport(t, pp.TIPOS_BASE, pp.ENFOQUES_BASE), /B-roll,Publicidad \/ ads,el café/);
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
