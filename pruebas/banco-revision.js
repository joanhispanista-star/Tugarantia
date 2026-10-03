/* ============================================================================
 * EL BANCO DE LA REVISIÓN — panel/revision.html arrancada de verdad
 * 2 de octubre de 2026.
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato con
 * el que pruebas/revision-pagina.test.js ARRANCA revision.html entera, con un
 * DOM, un localStorage, un sessionStorage y una nube de mentira, y le pregunta
 * qué pintó y qué mandó.
 *
 * Sigue la receta de banco-espejo.js (los <script src> se corren DENTRO del
 * contexto y en el orden de la página, la red se inyecta con `o.red`, el reloj
 * es el de reloj.js) en vez de torcer aquel: lo usan las pruebas del celular,
 * y la página del computador necesita cosas que el celular no (la puerta del
 * PIN, sessionStorage, la pieza de las fotos).
 *
 * LA PIEZA DE LAS FOTOS (app/revision-fotos.js) se puede reemplazar con
 * `o.fotos`: en Node no hay lienzo ni face-api, y lo que se prueba aquí es la
 * página —qué pide, en qué orden, qué dice—, no la librería. La pieza de
 * verdad se prueba aparte (pruebas/revision-fotos.test.js). El motor de reglas
 * SÍ es el de verdad: lo que la página pinta es lo que dicen las reglas.
 * ==========================================================================*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { relojFijo } = require('./reloj.js');

const RAIZ = path.join(__dirname, '..');

function clases(iniciales) {
  const s = new Set(iniciales || []);
  return {
    add: c => { s.add(c); }, remove: c => { s.delete(c); },
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; },
    contains: c => s.has(c)
  };
}

function almacen(inicial, anotar, nombre) {
  const datos = Object.assign({}, inicial || {});
  return {
    datos,
    api: {
      getItem: k => (Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null),
      setItem: (k, v) => { anotar.push({ donde: nombre, que: 'set', k, v: String(v) }); datos[k] = String(v); },
      removeItem: k => { anotar.push({ donde: nombre, que: 'remove', k }); delete datos[k]; }
    }
  };
}

/**
 * @param {object} [opciones]
 *   cartera   el db del CRM en joan_socios_v1 (con config.pin si se quiere)
 *   nube      {url, anon, clave} en joan_socios_sb; false = sin conexión
 *   red       (url, cuerpo) => {status, cuerpo} | Promise de eso
 *   fotos     objeto que reemplaza a window.RevisionFotos (o null = «no llegó»)
 *   sin       ['../app/revision-registro.js', …] <script src> que «no llegaron»
 *   sesion    un sessionStorage ya lleno (para recargar la misma pestaña)
 *   ahora     'AAAA-MM-DDTHH:MM:SS' (por defecto, el de reloj.js)
 */
function abrirRevision(opciones) {
  const o = opciones || {};
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'revision.html'), 'utf8');
  const escrituras = [];
  const llamadas = [];
  const elems = {};
  const oyentes = {};

  const local = almacen({}, escrituras, 'local');
  if (o.cartera !== undefined) local.datos.joan_socios_v1 = JSON.stringify(o.cartera);
  if (o.nube !== false) {
    local.datos.joan_socios_sb = JSON.stringify(o.nube || { url: 'https://prueba.supabase.co', anon: 'sb_publishable_prueba', clave: 'clave-de-prueba-larga' });
  }
  const sesion = almacen(o.sesion || {}, escrituras, 'sesion');

  /* Cada elemento guarda la historia de lo que se le escribió: así se puede
     probar que la línea de progreso dijo «Revisando 1 de 2» en algún momento,
     aunque al final diga «Listo». */
  const elem = id => {
    if (elems[id]) return elems[id];
    const e = {
      id, value: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {},
      classList: clases(id === 'todo' ? ['oculto'] : []), _historia: [], _html: '',
      addEventListener() {}, setAttribute() {}, getAttribute: () => null, focus() {},
      appendChild() {}
    };
    Object.defineProperty(e, 'innerHTML', {
      get() { return this._html; },
      set(v) { this._html = String(v); this._historia.push(this._html); }
    });
    elems[id] = e;
    return e;
  };

  const doc = {
    getElementById: elem,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {} }),
    addEventListener(t, fn) { (oyentes[t] = oyentes[t] || []).push(fn); },
    head: { appendChild() {} }, body: { appendChild() {} },
    currentScript: null
  };

  const ctx = {
    console,
    document: doc,
    localStorage: local.api,
    sessionStorage: sesion.api,
    location: { protocol: 'https:', hostname: 'tugarantia.net', href: 'https://tugarantia.net/panel/revision.html', replace() {} },
    navigator: { userAgent: 'node' },
    fetch: (url, cfg) => {
      let cuerpo = null;
      try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = cfg && cfg.body; }
      llamadas.push({ url: String(url), cuerpo, crudo: cfg && cfg.body });
      if (!o.red) return Promise.reject(new Error('sin red en el banco de la revisión'));
      return Promise.resolve(o.red(String(url), cuerpo)).then(r => {
        if (!r) return Promise.reject(new Error('sin red'));
        const st = r.status || 200;
        const t = r.cuerpo === undefined ? '' : (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo));
        return { ok: st >= 200 && st < 300, status: st, text: () => Promise.resolve(t) };
      });
    },
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {},
    URL, Intl, Math, JSON, Promise,
    Date: relojFijo(o.ahora)
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);

  const sin = new Set(o.sin || []);
  const reemplazaFotos = Object.prototype.hasOwnProperty.call(o, 'fotos');
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = (/\bsrc="([^"]+)"/.exec(m[1]) || [])[1];
    if (src) {
      if (sin.has(src)) continue;
      if (reemplazaFotos && src === '../app/revision-fotos.js') {
        if (o.fotos) ctx.RevisionFotos = o.fotos;
        continue;
      }
      vm.runInContext(fs.readFileSync(path.join(RAIZ, 'panel', src), 'utf8'), ctx, { filename: src });
    } else {
      vm.runInContext(m[2], ctx, { filename: 'revision.html' });
    }
  }

  const ev = e => vm.runInContext(e, ctx, { filename: 'banco-revision' });

  function tocar(acc) {
    const el = { dataset: { acc }, getAttribute: () => acc };
    const objetivo = { closest: sel => (sel === '[data-acc]' ? el : null) };
    (oyentes.click || []).forEach(fn => fn({ target: objetivo }));
  }
  function entrar(pin) {
    elem('pin').value = pin;
    tocar('entrar');
  }

  return {
    ev, ctx, elems, llamadas, escrituras,
    local: local.datos, sesion: sesion.datos,
    resultado: () => elem('resultado').innerHTML,
    avisos: () => elem('avisos').innerHTML,
    progreso: () => elem('progreso').innerHTML,
    historiaProgreso: () => elem('progreso')._historia.slice(),
    abierta: () => !elem('todo').classList.contains('oculto'),
    errorPin: () => elem('pinErr').textContent,
    tocar, entrar
  };
}

module.exports = { abrirRevision };
