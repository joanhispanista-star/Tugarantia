/* ===========================================================================
 * EL BANCO QUE ABRE play/ DE VERDAD
 *
 * La pagina entera corre en un contexto de mentira y se le pueden pedir cosas
 * con P.ev(). Vive en su propio archivo desde el 15-sep-2026 porque ya lo
 * querian tres pruebas y la tercera copia fue la que convencio: un banco
 * duplicado se desincroniza, y un banco desincronizado prueba otra pagina.
 *
 * Y hay precedente. El mismo dia se descubrio que el banco no cargaba
 * app/chat.js —que la pagina carga desde que existe la pestana de chat—, asi
 * que todo lo que colgaba del chat se probaba MUERTO y nadie se quejaba. Lo
 * encontro un centinela, no una persona: ver «EL BANCO CARGA TODO LO QUE LA
 * PAGINA CARGA» en vitrina.test.js, que compara esta lista contra los
 * <script src> del HTML de verdad. Si agregas un modulo a play/, agregalo aca
 * y esa prueba te lo recuerda si se te olvida.
 * ========================================================================= */
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');

function abrirPlay() {
  const vm = require('node:vm');
  const html = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
  const almacen = {}, sesion = {}, elems = {};
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', checked: false, max: '', min: '', textContent: '', innerHTML: '',
    dataset: {}, style: {}, files: null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => elem(id + '>hijo'), querySelectorAll: () => [],
    appendChild() {}, insertBefore() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, focus() {},
    play: () => Promise.resolve(), getContext: () => null, scrollIntoView() {}
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('creado-' + Math.random()), addEventListener() {},
    head: elem('head'), body: elem('body'), documentElement: elem('html'), title: ''
  };
  const ctx = {
    console, document: doc, alert() {}, confirm: () => true,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null),
                    setItem: (k, v) => { almacen[k] = String(v); },
                    removeItem: k => { delete almacen[k]; } },
    sessionStorage: { getItem: k => (k in sesion ? sesion[k] : null),
                      setItem: (k, v) => { sesion[k] = String(v); },
                      removeItem: k => { delete sesion[k]; } },
    location: { href: 'https://tugarantia.net/play/', hash: '', pathname: '/play/',
                search: '', protocol: 'https:', host: 'tugarantia.net',
                origin: 'https://tugarantia.net', reload() {} },
    history: { replaceState() {} },
    navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() },
                 geolocation: { getCurrentPosition() {} }, mediaDevices: null },
    fetch: () => Promise.reject(new Error('sin red en el banco de pruebas')),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Image: class {}, FileReader: class {}, Blob: class {}, File: class {},
    open() {}, scrollTo() {}, performance: { now: () => 0 },
    _oyentes: {},
    addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
    removeEventListener() {}, dispatchEvent() { return true; }
  };
  ctx.window = ctx; ctx.self = ctx;
  /* Cada banco recibe su PROPIA copia de los módulos. Sin esto, clavarle un
     topeVigente de mentira a uno se lo clava a todos los que vengan después en
     el mismo proceso: ya pasó, y envenenó tres pruebas de otro archivo. */
  ctx.CreditosPublicables = Object.assign({}, require(path.join(RAIZ, 'app', 'creditos.js')));
  ctx.CuentaSocio = require(path.join(RAIZ, 'app', 'cuenta.js'));
  ctx.Cumplimiento = require(path.join(RAIZ, 'app', 'cumplimiento.js'));
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.FichaSocio = require(path.join(RAIZ, 'app', 'ficha.js'));
  ctx.RuletaCupo = require(path.join(RAIZ, 'app', 'ruleta.js'));
  ctx.ChatTuGarantia = require(path.join(RAIZ, 'app', 'chat.js'));
  vm.createContext(ctx);
  const fallos = [];
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => {
      try { vm.runInContext(m[1], ctx, { filename: 'play#' + i }); }
      catch (e) { fallos.push(e); }
    });
  return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems, fallos };
}


module.exports = { abrirPlay: abrirPlay, RAIZ: RAIZ };
