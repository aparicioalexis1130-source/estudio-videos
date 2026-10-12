import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerIdentidad } from '../lib/webs.js';
import { slugify, nombreSeguro } from '../lib/store.js';

test('extrae colores de marca y fuentes, ignorando grises', () => {
  const html = '<meta name="theme-color" content="#FF5500"><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap">';
  const css = 'body{color:#333;background:#fff} .a{color:#ff5500} .b{color:#1a73e8;font-family:"Inter",sans-serif} .c{color:#1A73E8}';
  const r = extraerIdentidad(html, css);
  assert.equal(r.colores[0], '#ff5500');
  assert.ok(r.colores.includes('#1a73e8'));
  assert.ok(!r.colores.includes('#333333'));
  assert.equal(r.fuentes[0], 'Playfair Display');
  assert.ok(r.fuentes.includes('Inter'));
});

test('nombres seguros', () => {
  assert.equal(slugify('Café Altura!'), 'cafe-altura');
  assert.equal(nombreSeguro('Guión Final (v2).PDF'), 'guion-final-v2.pdf');
});
