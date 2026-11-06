/* ============================================================================
 * EL BANCO DE TRAER — panel/traer.html arrancada de verdad
 * 6 de noviembre de 2026.
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato con
 * el que pruebas/entrar-desde-otro-celular.test.js ARRANCA traer.html entera, con
 * un DOM, un localStorage y una nube de mentira. Hasta hoy esta página no tenía
 * banco (lo decía pruebas/siembra-espejo.test.js) y por eso nada comprobaba qué
 * le dice a Joan: solo que ciertas frases viejas ya no estaban.
 *
 * Sigue la receta de banco-revision.js: los <script src> corren DENTRO del
 * contexto y en el orden de la página (motor, puente y nube.js de verdad), y la
 * red se inyecta con `o.red`. Lo que este banco NO puede decir es dónde queda
 * nada en la pantalla: eso se mide en un navegador.
 * ==========================================================================*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

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
 *   almacen   objeto que hace de localStorage. Con el mismo objeto, «recargar».
 *   sinCajon  true: tocar localStorage lanza, como una ventana privada
 *   red       (url, cuerpo) => {status, cuerpo} | Promise de eso | Error para sin red
 *   confirmar el confirm() del paso 5 (true por defecto)
 */
function abrirTraer(opciones) {
  const o = opciones || {};
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'traer.html'), 'utf8').replace(/\r\n/g, '\n');
  const almacen = o.almacen || {};
  const llamadas = [];
  const elems = {};
  const alCargar = [];
  const oyentesVentana = {};
  const confirmaciones = [];
  const descargas = [];

  /* Como en un navegador: un id existe solo si lo trae el HTML o algo que se
     pintó. Con un elemento inventado para cualquier id, un `if (b)` sobre un
     botón que no se pintó pasaría en verde sin haber mirado nada. */
  const crear = (id, clasesDe) => {
    const e = {
      id, value: '', disabled: false, style: {}, dataset: {}, classList: clases(clasesDe),
      _html: '', _texto: '', _oyentes: {},
      addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
      focus() {}, setAttribute() {}, appendChild() {}, removeChild() {}, click() { descargas.push({ nombre: this.download, href: this.href }); }
    };
    Object.defineProperty(e, 'innerHTML', {
      get() { return this._html; },
      set(v) {
        this._html = String(v);
        for (const m of this._html.matchAll(/\bid="([^"]+)"/g)) if (!elems[m[1]]) elems[m[1]] = crear(m[1]);
      }
    });
    Object.defineProperty(e, 'textContent', {
      get() { return this._texto || String(this._html).replace(/<[^>]+>/g, ''); },
      set(v) { this._texto = String(v); this._html = ''; }
    });
    return e;
  };
  /* El HTML sin comentarios ni scripts: un id que solo sale en un comentario no
     es un elemento. Las clases se leen para que .oculto y .dormido nazcan puestas. */
  const cuerpo = html.slice(html.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of cuerpo.matchAll(/<[a-z0-9]+\b([^>]*)\bid="([^"]+)"([^>]*)>/g)) {
    const attrs = m[1] + ' ' + m[3];
    const c = (/\bclass="([^"]*)"/.exec(attrs) || [])[1] || '';
    elems[m[2]] = crear(m[2], c.split(/\s+/).filter(Boolean));
    if (/\bdisabled\b/.test(attrs)) elems[m[2]].disabled = true;
  }

  const doc = {
    getElementById: id => elems[id] || null,
    addEventListener(t, f) { if (t === 'DOMContentLoaded') alCargar.push(f); },
    createElement: () => crear('sin-id'),
    body: { appendChild() {}, removeChild() {} }, documentElement: {},
    currentScript: null
  };
  const local = {
    getItem: k => { if (o.sinCajon) throw new Error('SecurityError'); return Object.prototype.hasOwnProperty.call(almacen, k) ? almacen[k] : null; },
    setItem: (k, v) => { if (o.sinCajon) throw new Error('SecurityError'); almacen[k] = String(v); },
    removeItem: k => { if (o.sinCajon) throw new Error('SecurityError'); delete almacen[k]; }
  };
  const ctx = {
    console, document: doc, localStorage: local,
    location: { protocol: 'https:', hostname: 'tugarantia.net', href: 'https://tugarantia.net/panel/traer.html' },
    navigator: { userAgent: 'node', onLine: true },
    confirm: m => { confirmaciones.push(String(m)); return o.confirmar !== false; },
    addEventListener(t, f) { (oyentesVentana[t] = oyentesVentana[t] || []).push(f); },
    fetch: (url, cfg) => {
      let c = null;
      try { c = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { c = cfg && cfg.body; }
      llamadas.push({ url: String(url), cuerpo: c });
      if (!o.red) return Promise.reject(new TypeError('sin red en el banco de traer'));
      return Promise.resolve().then(() => o.red(String(url), c)).then(r => {
        const st = r.status || 200;
        const t = r.cuerpo === undefined ? '' : (typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo));
        return { ok: st >= 200 && st < 300, status: st, text: () => Promise.resolve(t) };
      });
    },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    TextEncoder, TextDecoder, Intl, Math, JSON, Promise, Date,
    Blob, URL: Object.assign(function () {}, { createObjectURL: () => 'blob:prueba', revokeObjectURL() {} })
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);

  for (const m of html.slice(html.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = ((/\bsrc="([^"]+)"/.exec(m[1]) || [])[1] || '').split('?')[0];
    if (src) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'panel', src), 'utf8'), ctx, { filename: src });
    else vm.runInContext(m[2], ctx, { filename: 'traer.html' });
  }
  alCargar.forEach(f => f());

  const ev = e => vm.runInContext(e, ctx, { filename: 'banco-traer' });
  return {
    ev, ctx, elems, almacen, llamadas, confirmaciones, descargas, html,
    /* La página cablea sus botones con addEventListener: esto los toca de verdad. */
    tocar(id) {
      const e = elems[id];
      if (!e) throw new Error('no existe #' + id + ' en la pantalla');
      if (e.disabled) throw new Error('#' + id + ' está apagado: un dedo no lo dispara');
      (e._oyentes.click || []).forEach(f => f({ target: e }));
    },
    puerta: () => elems.gate.classList.contains('on'),
    texto: id => String(elems[id].innerHTML || elems[id].textContent).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  };
}

module.exports = { abrirTraer };
