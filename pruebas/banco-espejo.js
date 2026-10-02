/* ============================================================================
 * EL BANCO DEL PANEL DEL BOLSILLO — panel/espejo.html arrancado de verdad
 * 2 de octubre de 2026.
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato con
 * el que las pruebas de la barra nueva ARRANCAN espejo.html entero, con un DOM,
 * un localStorage y una nube de mentira, y le preguntan qué pintó.
 *
 * POR QUÉ NACE AHORA Y NO SE REUSÓ OTRO
 * Hasta hoy ninguna prueba arrancaba el espejo. Las que lo miran recortan UNA
 * función del archivo y la evalúan sola (cobro.test.js, nube-crm.test.js) o
 * leen su texto (la-barra-de-pestanias-cabe.test.js). Eso alcanza para una
 * cuenta pura, pero la barra nueva es justo lo que no es puro: qué pestaña se
 * enciende, qué dice la pantalla cuando la nube contesta 404 o vacío, qué hay
 * debajo del dedo. Eso solo se prueba arrancando la página.
 *
 * banco-panel.js arranca crm.html y su documento de mentira devuelve [] a
 * cualquier querySelectorAll y se traga los oyentes: con él la barra del espejo
 * no se enciende nunca y ningún toque llega. En vez de torcerlo —lo usan las
 * pruebas del CRM y torcerlo es arriesgarlas— este banco sigue SU receta (el
 * mismo localStorage, la misma red inyectable `o.red`, el mismo reloj de
 * reloj.js) y agrega lo que el espejo necesita encima.
 *
 * UNA DIFERENCIA DE FONDO CON banco-panel.js, y es a propósito: acá los
 * <script src> se corren DENTRO del contexto, en el orden de la página, igual
 * que un navegador. nube.js lee `localStorage` y `fetch` como globales: cargado
 * con require() vería los de Node —que no existen— y el espejo arrancaría sin
 * cartera y sin red, probando otra cosa. Y como la lista sale de la propia
 * página, un <script src> nuevo entra solo al banco: no hay lista a mano que
 * se quede vieja.
 * ==========================================================================*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { relojFijo } = require('./reloj.js');

const RAIZ = path.join(__dirname, '..');

/* Una lista de clases de verdad: el espejo enciende la pestaña con
   classList.toggle('on', bool), y las pruebas tienen que poder preguntar cuál
   quedó encendida. */
function clases(iniciales) {
  const s = new Set(iniciales || []);
  return {
    add: c => { s.add(c); }, remove: c => { s.delete(c); },
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; },
    contains: c => s.has(c)
  };
}

/**
 * @param {object} [opciones]
 *   cartera   el db que el espejo encuentra en su caché (joan_panel_espejo)
 *   sesion    true = Joan ya entró con su correo (hay sesión guardada)
 *   ui        lo que haya en joan_panel_espejo_ui (p. ej. {pestania:'clientes'})
 *   red       (url, cuerpo) => {status, cuerpo} | Promise de eso; sin red, todo falla
 *   ahora     'AAAA-MM-DDTHH:MM:SS' para congelar el reloj (por defecto, el de reloj.js)
 *   sin       ['../app/gente.js', …] <script src> que «no llegaron»
 *   almacen   un localStorage ya lleno (para arrancar dos veces el mismo teléfono)
 */
function abrirEspejo(opciones) {
  const o = opciones || {};
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8');
  const almacen = o.almacen || {};
  const elems = {};
  const oyentes = {};
  const temporizadores = [];
  const avisos = [];
  const llamadas = [];

  if (o.cartera) {
    almacen.joan_panel_espejo = JSON.stringify({ v: 1, espejo: null, db: o.cartera, guardado_en: null });
  }
  if (o.sesion) {
    almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'sb_publishable_prueba', clave: '' });
    almacen.joan_panel_sesion = JSON.stringify({ access_token: 'tok', refresh_token: 'ref',
      expira_en: 4102444800000, correo: 'joan@prueba.co' });
  }
  if (o.ui) almacen.joan_panel_espejo_ui = JSON.stringify(o.ui);

  const elem = id => (elems[id] = elems[id] || {
    id, value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
    dataset: {}, style: {}, classList: clases(), _oyentes: {}, _attr: {},
    addEventListener(t, fn) { (this._oyentes[t] = this._oyentes[t] || []).push(fn); },
    removeEventListener() {},
    setAttribute(k, v) { this._attr[k] = String(v); },
    getAttribute(k) { return k in this._attr ? this._attr[k] : null; },
    appendChild() {}, removeChild() {}, focus() {}, setSelectionRange() {},
    closest: () => null, querySelector: () => null, querySelectorAll: () => []
  });

  /* Las pestañas salen del HTML de la barra, con su `class="on"` inicial. */
  const nav = html.slice(html.indexOf('id="nav"'), html.indexOf('</nav>'));
  /* Con sus atributos (2-oct-2026): la pestaña encendida lleva
     aria-current="page" para el lector de pantalla, y las pruebas lo leen. */
  const pestanias = [...nav.matchAll(/<button([^>]*)data-v="([a-z]+)"([^>]*)>([^<]*)/g)].map(m => ({
    dataset: { v: m[2] }, texto: m[4].trim(), _attr: {},
    classList: clases(/class="on"/.test(m[1] + m[3]) ? ['on'] : []),
    setAttribute(k, v) { this._attr[k] = String(v); },
    removeAttribute(k) { delete this._attr[k]; },
    getAttribute(k) { return k in this._attr ? this._attr[k] : null; }
  }));

  let nuevos = 0;
  const doc = {
    getElementById: elem,
    querySelector: () => null,
    querySelectorAll: sel => (sel === '#nav button' ? pestanias : []),
    createElement: () => elem('creado-' + (nuevos++)),
    addEventListener(t, fn) { (oyentes[t] = oyentes[t] || []).push(fn); },
    removeEventListener() {},
    body: elem('body'), documentElement: elem('html'), hidden: false
  };

  const ctx = {
    console,
    document: doc,
    alert(m) { avisos.push(String(m)); },
    confirm: () => true,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: k => { delete almacen[k]; }
    },
    location: { protocol: 'https:', hostname: 'tugarantia.net',
      href: 'https://tugarantia.net/panel/espejo.html', replace() {} },
    navigator: { userAgent: 'node', onLine: true,
      storage: { persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) } },
    /* La red, igual que en banco-panel.js: sin `o.red` todo falla como sin
       internet. Se anota cada llamada con su cuerpo para poder probar QUÉ se
       pidió (por ejemplo, que el número de la pestaña no baja los datos de
       nadie). */
    fetch: (url, cfg) => {
      let cuerpo = null;
      try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = cfg && cfg.body; }
      llamadas.push({ url: String(url), cuerpo });
      if (!o.red) return Promise.reject(new Error('sin red en el banco del espejo'));
      return Promise.resolve(o.red(String(url), cuerpo)).then(r => {
        if (!r) return Promise.reject(new Error('sin red'));
        const st = r.status || 200;
        const t = r.cuerpo === undefined ? '' : (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo));
        return { ok: st >= 200 && st < 300, status: st, text: () => Promise.resolve(t) };
      });
    },
    /* Los setTimeout se guardan y se corren cuando la prueba lo pide: así se
       puede mirar la pantalla ANTES de que la nube conteste («Preguntando…») y
       después. */
    setTimeout: fn => { temporizadores.push(fn); return temporizadores.length; },
    clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    scrollTo() {},
    TextEncoder, TextDecoder, URL, Intl, Math, JSON,
    Date: relojFijo(o.ahora),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);

  /* Los scripts en el orden de la página: los de archivo y los escritos dentro. */
  const sin = new Set(o.sin || []);
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = (/\bsrc="([^"]+)"/.exec(m[1]) || [])[1];
    if (src) {
      if (sin.has(src)) continue;
      const ruta = path.join(RAIZ, 'panel', src);
      vm.runInContext(fs.readFileSync(ruta, 'utf8'), ctx, { filename: src });
    } else {
      vm.runInContext(m[2], ctx, { filename: 'espejo.html' });
    }
  }

  const ev = e => vm.runInContext(e, ctx, { filename: 'banco-espejo' });
  /* Lo que vuelve del contexto se pasa por JSON: los objetos de adentro tienen
     el Array y el Object de OTRO reino, y deepStrictEqual los da por distintos
     aunque digan lo mismo. */
  const json = e => JSON.parse(ev('JSON.stringify(' + e + ')'));

  function correrPendientes() {
    let vueltas = 0;
    while (temporizadores.length && vueltas++ < 50) temporizadores.shift()();
  }
  /* Un toque delegado, como el de un dedo: el oyente de document busca el
     [data-acc] más cercano al objetivo. */
  function tocar(acc, datos) {
    const el = { dataset: Object.assign({ acc }, datos || {}) };
    const objetivo = { closest: sel => (sel === '[data-acc]' ? el : null) };
    (oyentes.click || []).forEach(fn => fn({ target: objetivo }));
  }
  function tocarPestania(v) {
    const b = pestanias.find(p => p.dataset.v === v);
    if (!b) throw new Error('no hay pestaña ' + v);
    const objetivo = { closest: sel => (sel === 'button[data-v]' ? b : null) };
    (elem('nav')._oyentes.click || []).forEach(fn => fn({ target: objetivo }));
  }
  function escribir(id, valor) {
    elem(id).value = valor;
    const objetivo = { id, value: valor, selectionStart: String(valor).length };
    (oyentes.input || []).forEach(fn => fn({ target: objetivo }));
  }

  return {
    ev, json, ctx, elems, almacen, avisos, llamadas, pestanias,
    cuerpo: () => elem('cuerpo').innerHTML,
    titulo: () => elem('cabTitulo').textContent,
    encendida: () => pestanias.filter(p => p.classList.contains('on')).map(p => p.dataset.v),
    globo: () => elem('globoRegistrados'),
    correrPendientes, tocar, tocarPestania, escribir
  };
}

module.exports = { abrirEspejo };
