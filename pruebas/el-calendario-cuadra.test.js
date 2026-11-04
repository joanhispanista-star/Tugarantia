/* ===========================================================================
 * EL CALENDARIO NO PONE UNA FECHA BAJO EL DÍA EQUIVOCADO — E1, 4-nov-2026
 *
 *   node --test pruebas/el-calendario-cuadra.test.js
 *
 * Bloque 1 de RECETA-CRM-MOVIL.md. #calDow y #calGrid son dos rejillas hermanas, y
 * `repeat(7,1fr)` es `minmax(auto,1fr)`: una columna nunca queda más angosta que su
 * celda más ancha. A 390 px, la palabra «quincena» empujaba las columnas de los
 * números y no las de los nombres: el número iba hasta 26 px corrido del día al que
 * pertenece. Esa es una fecha de cobro leída mal.
 *
 * Esto vigila el CSS. La medida de verdad, con la geometría de cada casilla en un
 * Chrome a 390 px, se hizo en un navegador sin ventana y no vive en el repositorio.
 * ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const hoja = CRM.slice(CRM.indexOf('<style>'), CRM.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

test('en el teléfono, las dos rejillas están obligadas a repartir igual', () => {
  const i = hoja.search(/\.cal-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.ok(i > 0, 'sin minmax(0,1fr), cada rejilla hace sus columnas según lo que lleva adentro');
  const antes = hoja.lastIndexOf('@media', i);
  assert.match(hoja.slice(antes, i), /@media\s*\(max-width:\s*880px\)/, 'tiene que aplicar donde se esconden los eventos');
  assert.ok(i > hoja.indexOf('.cal-grid{display:grid'), 'va antes de la regla que tiene que ganarle');
});

test('la palabra «quincena», que era la culpable, no empuja: queda el punto, y la leyenda lo explica', () => {
  assert.match(hoja, /\.cal-day \.dn small\{font-size:0;line-height:0\}/);
  assert.match(hoja, /\.cal-day \.dn small::after\{content:'●'/);
  assert.match(CRM, /🔴 quincena/, 'el punto rojo ya no se explica en ninguna parte');
});

test('la casilla no deja que nada la ensanche', () => {
  assert.match(hoja, /\.cal-day\{min-height:52px;padding:5px 3px;overflow:hidden\}/);
});
