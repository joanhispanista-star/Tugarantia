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

/* 17-sep-2026 — EL BANCO ACEPTA ALMACENES DE FUERA, y hace falta para probar lo
   único que no se podía probar: LA RECARGA.

   La cámara del sistema hace que un teléfono barato descarte la pestaña y la
   recargue. Hasta hoy cada banco nacía con localStorage y sessionStorage
   vacíos, así que no había forma de escribir «abre la página, avanza, y ahora
   vuelve a cargarla con lo que quedó guardado». Por eso un defecto que devolvía
   al cliente al login vivió ocho días: el arreglo del 9-sep leía el paso
   guardado solo si la dirección terminaba en #registro, y nadie ponía esa
   dirección. No había prueba que lo viera porque no se podía escribir.
   Ahora se pasan los dos almacenes —y el hash— y una recarga es abrir el banco
   otra vez con los mismos objetos. */
function abrirPlay(opciones) {
  const vm = require('node:vm');
  const o = opciones || {};
  const html = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
  const almacen = o.almacen || {}, sesion = o.sesion || {}, elems = {};
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
    location: { href: 'https://tugarantia.net/play/' + (o.hash || ''), hash: o.hash || '',
                pathname: '/play/', search: '', protocol: 'https:',
                host: 'tugarantia.net', origin: 'https://tugarantia.net', reload() {} },
    /* replaceState MUEVE EL HASH DE VERDAD, y no es un lujo del banco: la página
       marca dónde está la persona con él (marcarVista), y un replaceState de
       mentira dejaba esa marca sin efecto — que es justo el hueco por el que se
       coló el defecto de la cámara. Un banco que no mueve el hash prueba otra
       página. */
    history: { replaceState(estado, titulo, url) {
      const i = String(url == null ? '' : url).indexOf('#');
      ctx.location.hash = i >= 0 ? String(url).slice(i) : '';
      ctx.location.href = 'https://tugarantia.net/play/' + ctx.location.hash;
    } },
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
  /* 21-sep-2026 — el escáner de la cédula (encuadre, marco, decodificación, de
     quién son las fotos). Sin cámara en el banco, la página cae a las cajas de
     foto de siempre; lo puro se prueba con cuadros y códigos fabricados. */
  ctx.EscanerCedula = require(path.join(RAIZ, 'app', 'escaner-cedula.js'));
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
  /* `almacen` y `sesion` salen a la vista para que una prueba pueda volver a
     abrir el banco con ellos: eso es una recarga. */
  return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems, fallos,
           almacen, sesion, hash: () => ctx.location.hash };
}


module.exports = { abrirPlay: abrirPlay, RAIZ: RAIZ };
