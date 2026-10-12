// Crea "Estudio de videos.app" en el Escritorio (macOS). Al abrirla arranca el estudio
// si no está corriendo y abre la interfaz en el navegador.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.log('Este acceso directo es para macOS. En otros sistemas usa: npm start');
  process.exit(0);
}

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PORT || 4173);
const APP = path.join(os.homedir(), 'Desktop', 'Estudio de videos.app');

// Las apps abiertas desde el Finder no heredan el PATH de la Terminal: se guardan las
// carpetas donde están node, claude y ffmpeg para que el estudio los encuentre.
const donde = (cmd) => {
  try {
    return path.dirname(execSync(`command -v ${cmd}`, { encoding: 'utf8', shell: '/bin/zsh' }).trim());
  } catch {
    return null;
  }
};
const carpetas = [...new Set([path.dirname(process.execPath), donde('claude'), donde('ffmpeg'), '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean))];
const PATH = `${carpetas.join(':')}:/usr/bin:/bin:/usr/sbin:/sbin`;
const q = (s) => `quoted form of "${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const url = `http://localhost:${PUERTO}`;
const probar = `do shell script "curl -s -o /dev/null --max-time 1 ${url}/api/meta"`;

const script = `
try
  ${probar}
on error
  -- Todo va en una subshell con las redirecciones afuera: si no, "do shell script" se queda
  -- esperando la salida de node y el applet nunca llega a abrir el navegador.
  do shell script "(cd " & ${q(RAIZ)} & " && PATH=" & ${q(PATH)} & " PORT=${PUERTO} NO_ABRIR=1 exec nohup " & ${q(process.execPath)} & " server.js) > " & ${q(path.join(os.tmpdir(), 'estudio-videos.log'))} & " 2>&1 < /dev/null &"
  repeat 40 times
    delay 0.5
    try
      ${probar}
      exit repeat
    end try
  end repeat
end try
open location "${url}"
`;

fs.rmSync(APP, { recursive: true, force: true });
const tmp = path.join(os.tmpdir(), 'estudio-videos-acceso.applescript');
fs.writeFileSync(tmp, script);
execFileSync('osacompile', ['-o', APP, tmp]);

// Ícono propio: PNG -> .icns con las herramientas del sistema.
try {
  const set = path.join(os.tmpdir(), 'estudio.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set);
  for (const t of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', `${t}`, `${t}`, path.join(RAIZ, 'assets', 'icono.png'), '--out', path.join(set, `icon_${t}x${t}.png`)], { stdio: 'ignore' });
    execFileSync('sips', ['-z', `${t * 2}`, `${t * 2}`, path.join(RAIZ, 'assets', 'icono.png'), '--out', path.join(set, `icon_${t}x${t}@2x.png`)], { stdio: 'ignore' });
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(APP, 'Contents', 'Resources', 'applet.icns')]);
  execFileSync('touch', [APP]);
} catch {
  console.log('  (No se pudo poner el ícono; el acceso directo funciona igual.)');
}

console.log(`\n  ✓ Acceso directo creado en el Escritorio: ${APP}\n  Ábrelo con doble clic. La primera vez macOS puede pedir permiso para abrirlo.\n`);
