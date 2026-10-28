'use strict';
/* ==========================================================================
 * «HOY» EN EL CHAT DEL EQUIPO, Y LO QUE SE ESCONDE — 28 de octubre de 2026
 *
 * El revisor del lote del 30 vio en el chat de Joan con William (y en el de
 * William con Joan) los mensajes de hoy con fecha «28 de octubre» y los de
 * ayer como «Hoy»: el CRM pasaba hoyISO() («2026-10-28») y app/chat.js hace
 * new Date(eso), que es medianoche UTC = el día anterior en Bogotá. Y junto a
 * «📷 Mandar una foto» salía el control del navegador, porque la clase
 * .oculto no existía en panel/crm.html (el recuadro de error #eqErr se veía
 * vacío todo el tiempo por lo mismo).
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8').replace(/\r\n/g, '\n');
const CHAT = require('../app/chat.js');

function hoyLocalChat() {
  const m = CRM.match(/function hoyLocalChat\(iso\)\{[^\n]*\}/);
  assert.ok(m, 'panel/crm.html ya no tiene hoyLocalChat');
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '\nreturn hoyLocalChat;')();
}

test('los dos hilos del equipo pasan el día como fecha local, no como medianoche UTC', () => {
  assert.match(CRM, /CHAT\.hiloHTML\(lista,\{yo:'negocio',hoy:hoyLocalChat\(hoyISO\(\)\),/);
  assert.match(CRM, /CHAT\.hiloHTML\(_jefeMsgs, \{ yo: 'socio', hoy: hoyLocalChat\(hoyISOCrm\(\)\),/);
  assert.doesNotMatch(CRM, /hiloHTML\([^)]*hoy:\s*hoyISO(Crm)?\(\)\s*,/, 'un hilo volvió a pasar hoyISO() a secas');
});

test('un mensaje de esta tarde es «Hoy» y uno de anoche es «Ayer», con el día de hoyLocalChat', () => {
  const hoy = hoyLocalChat()('2026-10-28');
  assert.equal(hoy, '2026-10-28T12:00:00');
  const local = (a, m, d, h) => new Date(a, m - 1, d, h, 0, 0).toISOString();
  assert.equal(CHAT.dia(local(2026, 10, 28, 15), hoy), 'Hoy');
  assert.equal(CHAT.dia(local(2026, 10, 27, 21), hoy), 'Ayer');
  assert.equal(hoyLocalChat()(''), undefined, 'sin día, que chat.js use el reloj');
});

test('.oculto existe en el CRM, y el input de la foto se esconde sin display:none', () => {
  assert.match(CRM, /\.oculto\{display:none!important\}/);
  assert.match(CRM, /input\[type=file\]\.oculto\{display:block!important;position:absolute!important;width:1px;height:1px;opacity:0/);
  assert.match(CRM, /<input type="file" id="jefeFoto" accept="image\/\*" class="oculto"/);
  assert.match(CRM, /<div id="eqErr" class="alerta warn oculto"><\/div>/);
});
