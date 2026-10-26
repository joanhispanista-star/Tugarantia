'use strict';
/* ==========================================================================
 * «QUIETA…» TAMPOCO CON LA VENTANA — 26 de octubre de 2026
 *
 * Joan: «no se estabiliza el celular y nunca se queda quieto». Desde
 * lectura-sin-temblor la puerta del escáner acepta el temblor de una mano, y
 * el camino sin ventana dice «Sosténla…». El camino que usan casi todos los
 * teléfonos —la ventana del mejor cuadro— tomaba sus letreros tal cual de
 * app/escaner-captura.js («Quieta… leyendo el código», «Quieta… tomando la
 * foto») y en la pantalla salían mezclados con «Sosténla ahí…».
 *
 * escaner-captura.js está publicado sin ?v= (cambiarlo obliga a la regla de
 * versiones entera, y una página con el .js viejo en la caché seguiría
 * diciendo «Quieta…»), así que la página los traduce con sinQuieta. Esta
 * prueba sujeta dos cosas: que sinQuieta traduce el prefijo y nada más, y que
 * ningún letrero de ECAP.TEXTO que empieza por «Quieta…» llega a la pantalla
 * sin pasar por ella.
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLAY = fs.readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const ECAP = require('../app/escaner-captura.js');

function sinQuietaDeLaPagina() {
  const m = PLAY.match(/function sinQuieta\(t\) \{[^\n]*\}/);
  assert.ok(m, 'play/index.html ya no tiene sinQuieta');
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '\nreturn sinQuieta;')();
}

test('sinQuieta cambia «Quieta…» por «Sosténla…» al principio, y nada más', () => {
  const f = sinQuietaDeLaPagina();
  assert.equal(f('Quieta… leyendo el código'), 'Sosténla… leyendo el código');
  assert.equal(f('Quieta… tomando la foto'), 'Sosténla… tomando la foto');
  assert.equal(f('Quieta…'), 'Sosténla…');
  assert.equal(f('Aléjala un poco'), 'Aléjala un poco');
  assert.equal(f('Déjala Quieta… ahí'), 'Déjala Quieta… ahí', 'solo el prefijo');
  assert.equal(f(undefined), undefined);
  assert.equal(f(''), '');
});

test('los letreros de ECAP.TEXTO que dicen «Quieta…» pasan todos por sinQuieta', () => {
  const T = ECAP.TEXTO || {};
  const conQuieta = Object.keys(T).filter(k => /^Quieta…/.test(String(T[k])));
  assert.ok(conQuieta.length >= 1, 'escaner-captura.js ya no dice «Quieta…»: esta prueba y sinQuieta sobran');
  conQuieta.forEach(k => {
    const usos = PLAY.split('\n').filter(l => new RegExp('(?:\\bT|ECAP\\.TEXTO)\\.' + k + '\\b').test(l));
    usos.forEach(l => assert.match(l, /sinQuieta\(/, 'TEXTO.' + k + ' llega a la pantalla sin traducir: ' + l.trim()));
  });
});

test('ninguna cadena de la página empieza por «Quieta…» sin pasar por sinQuieta', () => {
  const sueltas = PLAY.split('\n').filter(l => /['"]Quieta…/.test(l) && !/sinQuieta\(/.test(l) && !/^\s*(\/\*|\*|\/\/)/.test(l));
  assert.deepEqual(sueltas, []);
});
