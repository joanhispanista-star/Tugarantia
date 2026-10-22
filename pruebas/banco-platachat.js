'use strict';
/* ===========================================================================
 * PLATACHAT DE VERDAD, CON UNA NUBE QUE RETIENE — 21-oct-2026 (I2)
 *
 * Lo que necesitan las pruebas de «la respuesta es de quien la pidió» en
 * PlataChat: la página real (platachat/index.html con sus <script src>, en el
 * orden del HTML) dentro de un contexto de mentira, con
 *   · el localStorage y el sessionStorage de la pestaña, que se pueden pasar
 *     de fuera (una recarga, u otra página en la misma pestaña, es abrir el
 *     banco otra vez con los mismos objetos);
 *   · una nube que contesta como GoTrue y PostgREST lo justo: las cuentas
 *     ({correo: {clave, quien}}), tokens con el nombre de quien entró
 *     («tok-Maria-3»), el refresco que entrega un token nuevo, el logout que
 *     se anota, y las funciones de la base que la prueba conteste a mano
 *     (`resp`: {fn: (quien, cuerpo) => respuesta});
 *   · RETENER: la llamada que case con `st.colgar` (regex sobre la URL, o
 *     función (url, cuerpo, autorización)) se queda en `st.colgadas` hasta que
 *     la prueba la suelte —con lo que diría la nube en ese momento, o con lo
 *     que se le pase ({__estado: 401} contesta ese estado)— o la corte;
 *   · los relojes de la página anotados, para dispararlos a mano (pasa).
 * Es el arnés de pruebas/platachat-sale-de-verdad.test.js con la nube que
 * retiene de pruebas/banco-registro.js: el mismo patrón, para la otra página.
 * ======================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const CUENTAS = () => ({
  '573001112233@tugarantia.net': { clave: 'Maria.Secreta9', quien: 'Maria' },
  '573109998877@tugarantia.net': { clave: 'Pedro.Propia7', quien: 'Pedro' }
});

function abrirPlataChat(opc) {
  const o = opc || {};
  const almacen = o.almacen || {}, sesion = o.sesion || {};
  const PAGINA = leer('platachat/index.html');
  const elems = {};
  const nuevo = id => ({ id, value: '', checked: false, textContent: '', innerHTML: '', dataset: {}, style: {}, files: null,
    disabled: false, hijos: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    appendChild(n) { this.hijos.push(n); }, insertBefore() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, click() {}, getContext: () => null, scrollIntoView() {} });
  const elem = id => (elems[id] = elems[id] || nuevo(id));
  const doc = { getElementById: elem, querySelector: () => null, querySelectorAll: () => [], createElement: t => nuevo('creado-' + t),
    addEventListener() {}, removeEventListener() {}, head: elem('head'), body: elem('body'), documentElement: elem('html'),
    title: '', hidden: false };
  const st = { llamadas: [], colgadas: [], colgar: null, cuentas: o.cuentas || CUENTAS(), resp: o.resp || {}, n: 0, relojes: [] };
  const R = (r, ok, status) => ({ ok: ok !== false, status: status || (ok === false ? 400 : 200),
    text: () => Promise.resolve(r === undefined ? '' : JSON.stringify(r)), json: () => Promise.resolve(r) });
  const quienDe = auth => (/tok-([A-Za-z]+)-/.exec(auth) || [, '?'])[1];
  const contestar = (url, c, auth) => {
    const fn = (/rpc\/([a-z_0-9]+)/.exec(url) || [, ''])[1];
    if (/auth\/v1\/token\?grant_type=password/.test(url)) {
      const cu = st.cuentas[c && c.email];
      if (!cu || cu.clave !== c.password) return R({ error: 'invalid_grant' }, false, 400);
      const k = ++st.n;
      return R({ access_token: 'tok-' + cu.quien + '-' + k, refresh_token: 'ref-' + cu.quien + '-' + k, expires_in: 3600,
        user: { email: c.email, user_metadata: { nombre: cu.quien } } });
    }
    if (/grant_type=refresh_token/.test(url)) {
      const q = (/^ref-([A-Za-z]+)-/.exec(String((c && c.refresh_token) || '')) || [, '?'])[1];
      const k = ++st.n;
      return R({ access_token: 'tok-' + q + '-r' + k, refresh_token: 'ref-' + q + '-r' + k, expires_in: 3600,
        user: { user_metadata: { nombre: q } } });
    }
    if (/auth\/v1\/logout/.test(url)) return R(undefined, true, 204);
    /* 22-oct-2026 — «Cambiar mi contraseña» (PUT /auth/v1/user): como GoTrue,
       le cambia la clave a la cuenta DEL TOKEN, y la vieja deja de servir para
       entrar. `resp.auth_user` (quien, cuerpo) contesta a mano (un rechazo de
       Supabase, un 401). Un token que no es de nadie: 401. */
    if (/\/auth\/v1\/user$/.test(url)) {
      const q = quienDe(auth);
      if (st.resp.auth_user) {
        const r = st.resp.auth_user(q, c);
        return r && r.__estado ? R(r, false, r.__estado) : R(r);
      }
      const correo = Object.keys(st.cuentas).find(k => st.cuentas[k].quien === q);
      if (!correo) return R({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, false, 401);
      st.cuentas[correo].clave = String(c && c.password);
      return R({ email: correo });
    }
    const quien = quienDe(auth);
    if (st.resp[fn]) {
      const r = st.resp[fn](quien, c);
      if (r && r.__estado) return R(r, false, r.__estado);
      return R(r);
    }
    if (fn === 'mi_cuenta') return R({ ok: true, vinculada: false, nombre: quien });
    if (fn === 'mi_solicitud_platachat') return R({ ok: true, solicitud: null, ahora: new Date().toISOString() });
    if (fn === 'chat_leer_sesion') return R({ ok: true, mensajes: [] });
    return R({ ok: true });
  };
  const red = (url, cfg) => {
    url = String(url);
    const h = (cfg && cfg.headers) || {};
    let c = null; try { c = JSON.parse(cfg && cfg.body); } catch (e) { c = null; }
    const auth = String(h.Authorization || '');
    st.llamadas.push({ url, metodo: (cfg && cfg.method) || 'GET', auth, c });
    if (st.colgar && (typeof st.colgar === 'function' ? st.colgar(url, c, auth) : st.colgar.test(url))) {
      return new Promise((res, rej) => st.colgadas.push({ url, auth, c,
        soltar: r => res(r === undefined ? contestar(url, c, auth) : (r && r.__estado ? R(r, false, r.__estado) : R(r))),
        cortar: () => rej(new TypeError('Failed to fetch')) }));
    }
    return Promise.resolve(contestar(url, c, auth));
  };
  const alertas = [];
  const ctx = { console, document: doc, alert: m => alertas.push(String(m)), confirm: () => true,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); }, removeItem: k => { delete almacen[k]; } },
    sessionStorage: { getItem: k => (k in sesion ? sesion[k] : null), setItem: (k, v) => { sesion[k] = String(v); }, removeItem: k => { delete sesion[k]; } },
    location: { href: 'https://tugarantia.net/platachat/', hash: '', hostname: 'tugarantia.net', pathname: '/platachat/', search: '', protocol: 'https:',
      host: 'tugarantia.net', origin: 'https://tugarantia.net', reload() {}, replace() {} },
    history: { replaceState() {} }, navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() } },
    fetch: red,
    setTimeout: (f, ms) => { st.relojes.push({ f, ms }); return st.relojes.length; },
    clearTimeout: id => { const r = st.relojes[id - 1]; if (r) r.muerto = true; },
    setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error, TypeError,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    Image: class {}, FileReader: class {}, Blob: class {}, File: class {}, open() {}, scrollTo() {}, performance: { now: () => 0 },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  [...PAGINA.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
    .forEach(s => vm.runInContext(leer(path.join('platachat', s)), ctx, { filename: s }));
  [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'pc#' + i }));
  const P = { ev: e => vm.runInContext(e, ctx), elems, st, almacen, sesion, alertas, ctx };
  /* Dispara el reloj de `ms` que la página armó (el primero vivo que case). */
  P.pasa = ms => {
    const r = st.relojes.find(x => x.ms === ms && !x.muerto && !x.hecho);
    if (!r) throw new Error('no hay temporizador vivo de ' + ms + ' ms');
    r.hecho = true; r.f();
  };
  P.suelta = (i, r) => st.colgadas[i].soltar(r);
  /* Entra con su celular y su contraseña, como el dedo: la casilla, el oninput y «Entrar». */
  P.entrarComo = async (cel, clave) => {
    P.ev("$('inCelular').value = " + JSON.stringify(cel) + "; tecleaTel($('inCelular')); $('inClave').value = " + JSON.stringify(clave) + '; entrar();');
    await asentar(20);
  };
  P.token = () => P.ev('SES && SES.access_token');
  P.guardada = () => { try { return JSON.parse(almacen.platachat_sesion || 'null'); } catch (e) { return null; } };
  P.logouts = () => st.llamadas.filter(x => /\/auth\/v1\/logout/.test(x.url));
  return P;
}

module.exports = { abrirPlataChat, asentar, CUENTAS, RAIZ };
