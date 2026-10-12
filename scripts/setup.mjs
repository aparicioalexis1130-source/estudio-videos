// Prepara la computadora: revisa requisitos e instala las skills de HyperFrames.
import { execSync } from 'node:child_process';

const ok = (m) => console.log(`  ✓ ${m}`);
const falta = (m) => console.log(`  ✗ ${m}`);
const tiene = (cmd) => {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

console.log('\nRevisando requisitos del Estudio de videos\n');
const [mayor] = process.versions.node.split('.').map(Number);
mayor >= 22 ? ok(`Node ${process.versions.node}`) : falta(`Node ${process.versions.node}: se necesita 22 o superior (https://nodejs.org)`);
tiene('ffmpeg -version') ? ok('FFmpeg') : falta('FFmpeg no está instalado (macOS: brew install ffmpeg · Windows: winget install ffmpeg)');
const claude = tiene('claude --version');
claude ? ok('Claude Code') : falta('Claude Code no está instalado (https://claude.com/claude-code)');

console.log('\nInstalando las skills de HyperFrames (núcleo)…');
try {
  execSync('npx -y hyperframes skills update', { stdio: 'inherit' });
  ok('Skills de HyperFrames instaladas');
} catch {
  falta('No se pudieron instalar las skills. Prueba a mano: npx hyperframes skills update');
}

if (claude) {
  const mcp = (() => {
    try {
      return execSync('claude mcp list', { encoding: 'utf8' });
    } catch {
      return '';
    }
  })();
  /higgsfield/i.test(mcp)
    ? ok('MCP de Higgsfield configurado en Claude Code')
    : falta('Falta conectar Higgsfield en Claude Code. Revisa la guía en el README (sección Higgsfield).');
}
console.log('\nListo. Inicia el estudio con: npm start\n');
