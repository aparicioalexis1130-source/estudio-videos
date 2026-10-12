// Análisis de una web sin gastar tokens: título, descripción, colores y fuentes
// leídos directamente del HTML y de sus hojas de estilo.

const LIMITE = 1_500_000;

async function traer(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (EstudioVideos; analisis de identidad)' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.text()).slice(0, LIMITE);
  } finally {
    clearTimeout(t);
  }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodificar = (t) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? m;
  });

const meta = (html, nombre) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return decodificar(tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || '');
};

function normalizarHex(h) {
  h = h.toLowerCase();
  if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  return h.length === 7 ? h : null;
}

// Descarta grises casi puros para quedarse con los colores de marca, pero conserva blanco y negro.
function esGris(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 12 && !['#ffffff', '#000000'].includes(hex);
}

export function extraerIdentidad(html, css) {
  const todo = `${html}\n${css}`;
  const cuenta = new Map();
  for (const m of todo.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = normalizarHex(m[0]);
    if (hex && !esGris(hex)) cuenta.set(hex, (cuenta.get(hex) || 0) + 1);
  }
  const theme = normalizarHex(meta(html, 'theme-color') || '') || null;
  const colores = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  if (theme) colores.unshift(theme);

  const fuentes = new Map();
  for (const m of todo.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const f = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (f && !/^(var\(|inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system)/i.test(f)) fuentes.set(f, (fuentes.get(f) || 0) + 1);
  }
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/g)) {
    for (const fam of decodeURIComponent(m[1]).split('|')) {
      const f = fam.split(':')[0].replace(/\+/g, ' ');
      fuentes.set(f, (fuentes.get(f) || 0) + 100);
    }
  }
  return {
    colores: [...new Set(colores)].slice(0, 12),
    fuentes: [...fuentes.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 6),
  };
}

export async function analizarWeb(url) {
  const base = new URL(url);
  const html = await traer(base.href);
  const hojas = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .slice(0, 4);
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const h of hojas) {
    try {
      css += '\n' + (await traer(new URL(h, base).href, 8000));
    } catch {
      // Una hoja que falla no impide el análisis.
    }
  }
  const titulo = decodificar(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || meta(html, 'og:title')).trim();
  const { colores, fuentes } = extraerIdentidad(html, css);
  return {
    url: base.href,
    titulo,
    descripcion: meta(html, 'description') || meta(html, 'og:description'),
    imagen: meta(html, 'og:image') ? new URL(meta(html, 'og:image'), base).href : '',
    colores,
    fuentes,
    analizado: new Date().toISOString(),
  };
}
