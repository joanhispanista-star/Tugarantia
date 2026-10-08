/* ============================================================================
 * EL ENLACE CORTO — 8 de octubre de 2026
 *
 *   node --test pruebas/enlace-corto.test.js
 *
 * Joan: «¿por qué el link es tan largo si yo compré un dominio que es más
 * corto?». tugarantia.net/entrar lleva a la puerta del cliente
 * (app/socio.html). Lo que hay que cuidar es que conserve lo que va después de
 * # y de ?: por el # viajan el historial de un enlace de WhatsApp (#d=) y el
 * pase de «Ver la app como la ve él».
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'entrar', 'index.html'), 'utf8');

function irA(search, hash) {
  let destino = null;
  const location = { search, hash, replace: u => { destino = u; } };
  const script = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { location });
  return destino;
}

test('lleva a la puerta del cliente', () => {
  assert.equal(irA('', ''), '../app/socio.html');
});

test('conserva el # y el ? (historial de WhatsApp y Ver como él)', () => {
  assert.equal(irA('', '#d=abc123'), '../app/socio.html#d=abc123');
  assert.equal(irA('?v=2', '#p=xyz'), '../app/socio.html?v=2#p=xyz');
});

test('sin JavaScript también llega: meta refresh y enlace visible', () => {
  assert.match(HTML, /http-equiv="refresh" content="0; url=\.\.\/app\/socio\.html"/);
  assert.match(HTML, /<a href="\.\.\/app\/socio\.html">/);
});
