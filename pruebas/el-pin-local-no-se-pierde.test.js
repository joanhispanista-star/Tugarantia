/* ===========================================================================
 * EL PIN DE ESTE APARATO NO SE PIERDE POR LO QUE BAJE — E1, 4-nov-2026 (riesgo 11)
 *
 *   node --test pruebas/el-pin-local-no-se-pierde.test.js
 *
 * Hoy el PIN del CRM vive dentro de `config`, subir.html lo sube entero y
 * aplicarPaquete lo reemplaza entero. Reproducido con el nube.js de verdad: un
 * `config` sin `pin` que baje por ☁ Subir, paso 6 deja config.pin en nada, y
 * cargar() le pone '1234'. Sin esto, el SQL de E2 (que saca el PIN en claro de la
 * nube) dejaría el computador de Joan abriendo con el PIN de fábrica. POR ESO E1
 * TIENE QUE ESTAR PUBLICADA ANTES DE ESE SQL.
 *
 * Dos reglas, que son la misma: `pin` y `ultimoRespaldo` son de ESTE aparato.
 *   · lo que baja nunca se los quita ni se los cambia;
 *   · lo que sube nunca los lleva.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const N = require('../panel/nube.js');
const { abrirPanel } = require('./banco-panel.js');

const clon = v => JSON.parse(JSON.stringify(v));
const RAIZ = path.join(__dirname, '..');
const PIN = '482915';
const dbCon = config => ({ socios: [{ id: 'C1', numero: 1, nombre: 'Cliente Inventada', gestiones: [] }], prestamos: [], respaldados: [],
  config, plantillas: {}, contadores: { cliente: 1, credito: 0, respaldado: 0 } });
const baja = (db, config) => N.aplicarPaquete(db, { completo: false, socios: [], creditos: [], respaldados: [],
  ajustes: [{ clave: 'config', revision: 5, datos: config }] }).db;

describe('lo que baja no le quita a este aparato su PIN', () => {
  test('LA MEDICIÓN: un config sin pin no deja al computador sin PIN', () => {
    const d = baja(dbCon({ pin: PIN, negocio: 'Tu Garantía', tasaUsuraEA: 25 }), { negocio: 'Tu Garantía', tasaUsuraEA: 26.9 });
    assert.equal(d.config.pin, PIN, 'el computador quedó sin su PIN: cargar() le pondría 1234');
  });

  test('tampoco se lo cambia un config que traiga otro', () => {
    /* La nube todavía puede traer el PIN viejo: hasta el SQL de E2 sigue ahí. */
    const d = baja(dbCon({ pin: PIN }), { pin: '1234' });
    assert.equal(d.config.pin, PIN);
  });

  test('ni la fecha de su último respaldo', () => {
    const d = baja(dbCon({ pin: PIN, ultimoRespaldo: '2026-11-03' }), { ultimoRespaldo: '2026-01-01', negocio: 'X' });
    assert.equal(d.config.ultimoRespaldo, '2026-11-03');
    const d2 = baja(dbCon({ pin: PIN, ultimoRespaldo: '2026-11-03' }), { negocio: 'X' });
    assert.equal(d2.config.ultimoRespaldo, '2026-11-03', 'el aviso de «hace cuánto no respaldo» se quedó sin fecha');
  });

  test('un aparato no hereda la fecha del respaldo que bajó OTRO: aquí no hay ninguno', () => {
    const d = baja(dbCon({ pin: PIN }), { ultimoRespaldo: '2026-11-03' });
    assert.equal(d.config.ultimoRespaldo, undefined, 'este aparato diría que tiene un respaldo que no bajó');
    assert.equal(N.aplicarPaquete(null, { completo: true, ajustes: [{ clave: 'config', revision: 5, datos: { ultimoRespaldo: '2026-11-03' } }] }).db.config.ultimoRespaldo, undefined);
  });

  test('lo demás de config sí baja, y entero: un valor que ya no está, ya no está', () => {
    const d = baja(dbCon({ pin: PIN, tasaUsuraEA: 25, freno: { activo: true }, urlApp: 'x' }), { tasaUsuraEA: 26.9 });
    assert.deepEqual(d.config, { pin: PIN, tasaUsuraEA: 26.9 });
  });

  test('un aparato sin PIN propio toma el que traiga la nube: hasta E2, traer.html vive de eso', () => {
    const d = N.aplicarPaquete(null, { completo: true, ajustes: [{ clave: 'config', revision: 5, datos: { pin: PIN, negocio: 'X' } }] }).db;
    assert.equal(d.config.pin, PIN, 'un computador nuevo arrancaría con el PIN de fábrica aunque el suyo venga');
  });

  test('no se confunde con las otras claves ni con un ajuste raro', () => {
    assert.equal(N.fusionarAjuste('plantillas', { pin: 'x' }, { a: 1 }).pin, undefined, 'la regla del PIN se le aplicó a otra clave');
    assert.deepEqual(N.fusionarAjuste('config', { pin: PIN }, ['raro']), ['raro']);
    assert.equal(N.fusionarAjuste('config', { pin: PIN }, null), null);
  });

  test('no toca lo que le dieron', () => {
    const db = dbCon({ pin: PIN }), datos = { negocio: 'X' };
    const a = clon(db), b = clon(datos);
    baja(db, datos);
    assert.deepEqual(db, a);
    assert.deepEqual(datos, b);
  });

  test('el CRM de verdad: tras aplicar un config sin pin, abre con SU PIN y no con 1234', () => {
    const d = baja(dbCon({ pin: PIN, negocio: 'Tu Garantía' }), { negocio: 'Tu Garantía', tasaUsuraEA: 26.9 });
    const C = abrirPanel({ almacen: { joan_socios_v1: JSON.stringify(d) }, ahora: '2026-11-03T15:00:00' });
    assert.equal(C.ev('DB.config.pin'), PIN);
    C.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    assert.equal(C.ev('_crmAbierto'), false, 'el PIN de fábrica abrió la cartera');
    C.ev("document.getElementById('pinInput').value = " + JSON.stringify(PIN) + '; entrar()');
    assert.equal(C.ev('_crmAbierto'), true);
  });
});

describe('lo que sube nunca lleva el PIN', () => {
  const ajusteDe = (lote, clave) => lote.ajustes.filter(a => a.clave === clave)[0];

  test('config sale sin pin y sin ultimoRespaldo, y con todo lo demás', () => {
    const lote = N.armarLote(dbCon({ pin: PIN, ultimoRespaldo: '2026-11-03', tasaUsuraEA: 25, negocio: 'X' }), N.espejoVacio());
    assert.deepEqual(ajusteDe(lote, 'config').datos, { tasaUsuraEA: 25, negocio: 'X' });
    assert.ok(JSON.stringify(lote).indexOf(PIN) < 0, 'el PIN salió por la red');
  });

  test('tampoco en el lote «con fotos», que es solo para pesar', () => {
    const lote = N.armarLote(dbCon({ pin: PIN, negocio: 'X' }), N.espejoVacio(), { conFotos: true });
    assert.ok(JSON.stringify(lote).indexOf(PIN) < 0);
  });

  test('no se lleva el PIN de la cartera de verdad', () => {
    const db = dbCon({ pin: PIN, negocio: 'X' });
    N.armarLote(db, N.espejoVacio());
    assert.equal(db.config.pin, PIN);
  });

  test('con el espejo de antes, que sí lo trae, sube UNA vez para sacarlo; después, nada', () => {
    const db = dbCon({ pin: PIN, negocio: 'X' });
    const e = N.espejoVacio();
    e.ajustes.config = { revision: 4, json: N.jsonCanonico(db.config) };
    const lote = N.armarLote(db, e, { claves: ['config'] });
    assert.equal(ajusteDe(lote, 'config').revision_base, 4);
    assert.equal(ajusteDe(lote, 'config').datos.pin, undefined);
    const tras = N.espejoTrasEmpujar(e, lote, { revisiones: [{ tabla: 'ajustes', id: 'config', revision: 5 }], choques: [] });
    assert.equal(N.armarLote(db, tras, { claves: ['config'] }).ajustes.length, 0, 'config sube en cada vuelta');
  });

  test('cambiar el PIN aquí no hace subir nada', () => {
    const db = dbCon({ pin: PIN, negocio: 'X' });
    const e = N.espejoVacio();
    e.ajustes.config = { revision: 4, json: N.jsonCanonico({ negocio: 'X' }) };
    db.config.pin = '000111';
    assert.equal(N.armarLote(db, e, { claves: ['config'] }).ajustes.length, 0);
  });

  test('configQueViaja: la misma regla para quien tenga que comparar', () => {
    assert.deepEqual(N.configQueViaja({ pin: PIN, ultimoRespaldo: 'x', negocio: 'X' }), { negocio: 'X' });
    assert.deepEqual(N.configQueViaja(null), {});
  });
});

/* El montaje de siempre (abrirSubir de lo-mio-encima), para traer.html. */
function abrirTraer() {
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'traer.html'), 'utf8');
  const elems = {};
  const elem = id => (elems[id] = elems[id] || { id, value: '', checked: false, textContent: '', innerHTML: '', dataset: {}, style: {}, disabled: false, title: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, setAttribute() {}, focus() {}, remove() {} });
  const doc = { getElementById: elem, querySelector: () => null, querySelectorAll: () => [], createElement: () => elem('nuevo'), addEventListener() {},
    body: elem('body'), documentElement: elem('html'), title: '' };
  const almacen = {};
  const ctx = { console, document: doc, alert() {}, confirm: () => true, prompt: () => null,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); }, removeItem: k => { delete almacen[k]; }, key: () => null, length: 0 },
    location: { href: 'http://localhost/panel/traer.html', hash: '', pathname: '/panel/traer.html', search: '' },
    history: { replaceState() {} }, navigator: { userAgent: 'node' }, addEventListener() {},
    fetch: () => Promise.reject(new Error('sin red')), setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    TextEncoder, TextDecoder, URL, Intl, Date, Math, JSON, Blob: class {}, FileReader: class {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
  ctx.window = ctx; ctx.self = ctx;
  ctx.NubeTuGarantia = N;
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.PuenteTuGarantia = require(path.join(RAIZ, 'app', 'puente.js'));
  vm.createContext(ctx);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'traer#' + i }));
  return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), ctx, elems, almacen };
}

describe('traer.html no promete que el PIN viaja', () => {
  const conAjustes = datos => ({ completo: true, socios: [], creditos: [], respaldados: [], ajustes: datos ? [{ clave: 'config', revision: 3, datos }] : [] });
  const avisos = paquete => {
    const T = abrirTraer();
    T.ctx.__paq = paquete;
    T.ev('E.paquete = __paq; E.lectura = medirPaquete(E.paquete); E.hay = mirarEsteAparato(); pintarLoQueViene();');
    return T.elems.resumen3.innerHTML;
  };

  test('si config trae el PIN, lo dice: hasta el SQL de E2 todavía puede venir', () => {
    assert.match(avisos(conAjustes({ pin: PIN, negocio: 'X' })), /mismo PIN del computador/);
  });

  test('si config NO trae el PIN, dice que este aparato arranca con el de fábrica', () => {
    const h = avisos(conAjustes({ negocio: 'X' }));
    assert.doesNotMatch(h, /mismo PIN del computador/, 'prometió un PIN que no viene');
    assert.match(h, /PIN 1234/);
    assert.match(h, /Cámbialo/);
  });

  test('sin config, lo de siempre', () => {
    assert.match(avisos(conAjustes(null)), /Los ajustes no vienen/);
  });
});
