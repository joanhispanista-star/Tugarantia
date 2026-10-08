/* ============================================================================
 * EL BANCO DE LA APP DEL SOCIO — app/socio.html arrancada de verdad
 * 7 de octubre de 2026.
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato con
 * el que pruebas/una-puerta-socio.test.js ARRANCA socio.html entera —sus
 * <script src> en el orden de la página y sus bloques escritos— con un DOM, un
 * localStorage, un sessionStorage y una nube de mentira, y le pregunta qué
 * pintó.
 *
 * Nace con la puerta única: hasta hoy ninguna prueba arrancaba socio.html, solo
 * se leía su texto. Pero «la puerta no pide código» y «una cuenta sin juntar no
 * ve nada de la ficha» no se prueban leyendo: se prueban entrando.
 *
 * Igual que banco-espejo.js, los <script src> se corren DENTRO del contexto y
 * la lista sale de la propia página: un <script src> nuevo entra solo al banco.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

function clases(iniciales) {
  const s = new Set(iniciales || []);
  return {
    add: c => { s.add(c); }, remove: c => { s.delete(c); },
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; },
    contains: c => s.has(c)
  };
}

function almacen(inicial) {
  const d = Object.assign({}, inicial || {});
  return {
    d,
    getItem: k => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: k => { delete d[k]; }
  };
}

/**
 * @param {object} [o]
 *   local, sesion   lo que ya hay en localStorage / sessionStorage
 *   hash            location.hash al abrir
 *   red             (url, opciones) => {status, cuerpo} | Promise de eso
 *   ahora           milisegundos para Date.now() (las sesiones vencen)
 */
function abrirSocio(o) {
  o = o || {};
  const html = fs.readFileSync(path.join(RAIZ, 'app', 'socio.html'), 'utf8');
  const elems = {};
  const llamadas = [];
  const avisos = [];
  const temporizadores = [];
  const loc = {
    protocol: 'https:', hostname: 'tugarantia.net', pathname: '/app/socio.html', search: '',
    hash: o.hash || '', href: 'https://tugarantia.net/app/socio.html' + (o.hash || ''),
    replace() {}
  };
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', textContent: '', innerHTML: '', disabled: false, dataset: {}, style: {},
    classList: clases(['pCargando', 'pCuenta'].indexOf(id) >= 0 ? ['oculto'] : []),
    _oyentes: {},
    addEventListener(t, fn) { (this._oyentes[t] = this._oyentes[t] || []).push(fn); },
    querySelectorAll: () => [], querySelector: () => null, focus() {}, scrollTop: 0, scrollHeight: 0
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => elem('creado'), body: elem('body'), hidden: false
  };
  const local = almacen(o.local), sesion = almacen(o.sesion);
  const ahora = () => (o.ahora != null ? o.ahora : Date.now());
  const D = function (...a) { return a.length ? new Date(...a) : new Date(ahora()); };
  D.now = ahora; D.parse = Date.parse; D.UTC = Date.UTC; D.prototype = Date.prototype;
  const ctx = {
    console, document: doc, location: loc,
    history: { replaceState: (a, b, url) => { const i = String(url).indexOf('#'); loc.hash = i >= 0 ? String(url).slice(i) : ''; } },
    localStorage: local, sessionStorage: sesion,
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
    alert: m => { avisos.push(String(m)); },
    matchMedia: () => ({ matches: false }),
    scrollTo() {},
    addEventListener() {},
    open: (u) => { (ctx._abiertos = ctx._abiertos || []).push(String(u)); },
    performance: { now: () => 3000 },
    setTimeout: (fn, ms) => { temporizadores.push({ fn, ms }); return temporizadores.length; },
    clearTimeout() {},
    fetch: (url, opciones) => {
      let cuerpo = null;
      try { cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : null; } catch (e) { cuerpo = opciones && opciones.body; }
      llamadas.push({ url: String(url), metodo: (opciones && opciones.method) || 'GET', cuerpo, cab: (opciones && opciones.headers) || {} });
      if (!o.red) return Promise.reject(new Error('sin red en el banco del socio'));
      return Promise.resolve(o.red(String(url), cuerpo, opciones)).then(r => {
        if (!r) return Promise.reject(new TypeError('Failed to fetch'));
        const st = r.status || 200;
        const t = r.cuerpo === undefined ? '' : (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo));
        return { ok: st >= 200 && st < 300, status: st, text: () => Promise.resolve(t),
                 json: () => Promise.resolve(t ? JSON.parse(t) : null) };
      });
    },
    crypto: { getRandomValues: b => require('crypto').randomFillSync(b) },
    Uint8Array, TextEncoder, TextDecoder, URL, Intl, Math, JSON, Date: D,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);

  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = (/\bsrc="([^"]+)"/.exec(m[1]) || [])[1];
    if (src) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'app', src), 'utf8'), ctx, { filename: src });
    else vm.runInContext(m[2], ctx, { filename: 'socio.html' });
  }
  const ev = e => vm.runInContext(e, ctx, { filename: 'banco-socio' });
  const visible = id => !elem(id).classList.contains('oculto');
  return { ev, elem, elems, llamadas, avisos, local, sesion, ctx, loc, visible, temporizadores };
}

module.exports = { abrirSocio, RAIZ };
