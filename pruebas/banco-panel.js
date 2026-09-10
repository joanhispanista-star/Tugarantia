/* ============================================================================
 * EL BANCO DE PRUEBAS DEL PANEL — un navegador de mentira
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato con
 * el que panel.test.js y repartir.test.js ARRANCAN crm.html de verdad, con un
 * DOM y un localStorage falsos, y le preguntan cosas.
 *
 * Vivía dentro de panel.test.js hasta el 10-sep-2026. Salió acá cuando hizo
 * falta en un segundo archivo: dos copias del banco es como una regla escrita
 * dos veces — el día que crm.html cargue un <script src> nuevo, una de las dos
 * se queda vieja y sus pruebas pasan en verde sobre una página que no arranca.
 * ==========================================================================*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* --------------------------------------------------------------------------
 * EL BANCO DE PRUEBAS: un navegador de mentira, lo justo para que crm.html
 * arranque. Se devuelve `ev` para preguntarle cosas al contexto: `DB` y las
 * funciones son declaraciones de un `<script>`, no propiedades de un objeto,
 * así que desde Node solo se llegan evaluando dentro del contexto.
 * ------------------------------------------------------------------------ */
function abrirPanel(opciones) {
  const o = opciones || {};
  const RAIZ = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
  const almacen = {};
  const elems = {};
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', checked: false, textContent: '', innerHTML: '',
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, querySelector: () => elem(id + '>hijo'),
    querySelectorAll: () => [], appendChild() {}, setAttribute() {}, focus() {}
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('nuevo'), addEventListener() {},
    body: elem('body'), documentElement: elem('html'), title: ''
  };
  const ctx = {
    console, document: doc, alert() {}, confirm: () => true,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: k => { delete almacen[k]; }
    },
    location: { href: 'http://localhost:8126/panel/crm.html', hash: o.hash || '',
      pathname: '/panel/crm.html', search: '' },
    history: { replaceState() {} },
    navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
    /* Sin red a propósito: el Panel TIENE que andar sin nube, y una prueba que
       dependiera de internet no sería una prueba. */
    fetch: () => Promise.reject(new Error('sin red en el banco de pruebas')),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    TextEncoder, TextDecoder, URL, Intl, Date, Math, JSON,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: class {}, FileReader: class {}
  };
  ctx.window = ctx; ctx.self = ctx;
  /* Los dos que crm.html carga con <script src>. El puente se publica como
     window.PuenteTuGarantia, que es de donde lo toma la página. */
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.PuenteTuGarantia = require(path.join(RAIZ, 'app', 'puente.js'));
  /* 28-ago-2026: el chat, que crm.html toma de window.ChatTuGarantia.
     `sinChat: true` simula que ese <script src> no llegó — que es lo que pasa
     con un service worker viejo o sin señal, y lo que tumbó el Panel el día que
     se entregó el chat. */
  if (!o.sinChat) ctx.ChatTuGarantia = require(path.join(RAIZ, 'app', 'chat.js'));
  /* 9-sep-2026 — las comisiones del equipo. `sinComisiones: true` simula que
     ESE <script src> no llego, que es lo que pasa con un service worker viejo. */
  if (!o.sinComisiones) ctx.ComisionesTuGarantia = require(path.join(RAIZ, 'app', 'comisiones.js'));
  /* 10-sep-2026 — las etapas de cartera y el lector de bases, los otros dos
     <script src> de crm.html. Sin ellos el Panel se pinta por el camino del
     «ese archivo no llegó», que no es el que ve Joan. */
  if (!o.sinEtapas) ctx.EtapasTuGarantia = require(path.join(RAIZ, 'app', 'etapas.js'));
  if (!o.sinBases) ctx.BasesTuGarantia = require(path.join(RAIZ, 'app', 'bases.js'));
  vm.createContext(ctx);

  const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  bloques.forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'crm.html#' + i }));

  const ev = expr => vm.runInContext(expr, ctx, { filename: 'banco' });
  const cargarCartera = d => {
    almacen['joan_socios_v1'] = JSON.stringify(d);
    return ev('DB=cargar()');
  };
  return { ev, cargarCartera, elems, almacen };
}

module.exports = { abrirPanel };
