/* ============================================================================
 * EL MENÚ DEL PANEL LLEGA A AJUSTES — 1-oct-2026
 *
 *   node --test pruebas/el-menu-del-panel-llega-a-ajustes.test.js
 *
 * POR QUÉ EXISTE. La barra lateral del Panel tenía alto fijo (100vh) y
 * overflow:hidden. Con 16 botones el menú mide 924 px; en la pantalla de Joan
 * (1440×765, medida en su Chrome) «Equipo» empezaba en 770 y «Ajustes» en 814,
 * debajo del borde y sin forma de bajar. Joan buscó «☁ Subir historiales» y
 * contestó «en mi panel no veo ningún botón de ajustes». Una función a la que
 * no se llega no existe, aunque el código esté bien.
 *
 * El menú puede crecer —cada sección nueva es un botón más—, así que lo que se
 * cuida no es un número de botones sino que la barra se pueda bajar.
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

test('la barra lateral se puede bajar cuando no cabe', () => {
  const regla = CRM.match(/\n\s*\.side\{[^}]*\}/);
  assert.ok(regla, 'no encontré la regla .side{...} de crm.html');
  assert.match(regla[0], /overflow-y:auto/,
    'la barra lateral no baja: en una pantalla de 765 px de alto «Ajustes» queda fuera de alcance');
  assert.ok(!/overflow:hidden/.test(regla[0]),
    'volvió overflow:hidden en .side: recorta los últimos botones del menú sin dejar bajar');
});

test('y Ajustes sigue estando en el menú', () => {
  assert.match(CRM, /<button class="navbtn" data-v="cfg">/);
  assert.match(CRM, /onclick="sincronizarSocios\(\)">☁ Subir historiales<\/button>/);
});
