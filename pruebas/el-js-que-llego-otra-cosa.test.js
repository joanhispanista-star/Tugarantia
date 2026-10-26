'use strict';
/* ==========================================================================
 * EL .JS QUE LLEGÓ OTRA COSA NO SE DA POR CARGADO — 23-oct-2026
 *
 *   node --test pruebas/el-js-que-llego-otra-cosa.test.js
 *
 * Joan, 23-oct-2026: «la cédula no se escanea … ya no aparece para tomar la
 * foto de la selfie». Reproducido en Chrome sin ventana con el service worker
 * mandando y la red cortada justo al pedir zxing.min.js o face-api.js
 * (registro-roto/mio/envenena.js; igual en lo publicado v138 y en
 * publicar-27). Dos piezas se juntaban:
 *
 *   1. sw.js, rama fresco-primero: sin señal y sin copia guardada caía a
 *      index.html para TODO (.js, .css, lo que fuera), no solo para una
 *      navegación. Chrome ejecutaba el HTML como script (SyntaxError '<') y
 *      el <script> disparaba `load` igual.
 *   2. play/ cargarScript: resolvía en `load` sin mirar si el global llegó, y
 *      recordaba la promesa resuelta para siempre: ZXing y face-api no se
 *      volvían a pedir en toda la sesión aunque volviera la señal. En vivo:
 *      «Tranquilo: si no sale, toca Tomar la foto ahora», la foto «no se pudo
 *      leer», y en el rostro el encuadre sin detector: la selfie no se toma
 *      sola. (El reintento del 21-sep solo cubría el `error`.)
 *
 * Lo que se prueba:
 *   A. sw.js: sin señal, lo que no está guardado es un error de red (el
 *      <script> dispara `error`), salvo una navegación, que sigue cayendo a
 *      la web pública; lo guardado sigue saliendo de la caché.
 *   B. cargarScript(url, listo): `load` sin el global es un fallo que se
 *      olvida; el siguiente intento vuelve a pedir el archivo. Y cada llamada
 *      de play/ dice qué global espera.
 *   C. rostro-en-vivo: crearDetector le dice a cargarScript qué global espera
 *      (face-api), así que una copia envenenada no se recuerda.
 *   D. el escáner de la cédula, con la cámara abierta, vuelve a pedir el lector
 *      si no está (cada MS_REINTENTO_LECTOR): hasta hoy se pedía UNA vez por
 *      sesión del escáner, y con esa carga caída la señal podía volver sin que
 *      nadie lo pidiera otra vez (registro-roto/arreglo/envenena-arreglo.js).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const ORIGEN = 'https://tugarantia.net/';
const leer = r => fs.readFileSync(path.join(RAIZ, r));
const INDEX = leer('index.html');
const igual = (a, b) => a != null && b != null && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

/* ==========================================================================
 * A · sw.js: un teléfono de mentira (red por interruptor, CacheStorage) con
 * el sw.js de verdad corrido en un contexto aparte.
 * ======================================================================== */
function telefonoConSW() {
  const oyentes = {};
  const red = { con: true };
  const almacen = new Map();   // nombre de caché → Map(url → Buffer)
  class Req {
    constructor(e, init) {
      if (e instanceof Req) {
        this.url = e.url; this.mode = e.mode; this.method = e.method; this.cache = (init && init.cache) || e.cache;
      } else {
        this.url = new URL(String(e), ORIGEN).href; this.mode = 'cors'; this.method = 'GET'; this.cache = (init && init.cache) || 'default';
      }
    }
  }
  const aReq = r => (r instanceof Req ? r : new Req(r));
  const servir = url => {
    let r = decodeURIComponent(new URL(url).pathname.slice(1));
    if (r === '' || r.endsWith('/')) r += 'index.html';
    const f = path.join(RAIZ, r);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null;
  };
  const fetch = async (e, init) => {
    const req = e instanceof Req && !init ? e : new Req(e, init);
    if (!red.con) throw new TypeError('Failed to fetch (sin señal): ' + req.url);
    const c = servir(req.url);
    return c == null ? new Response('404', { status: 404 }) : new Response(c);
  };
  const cacheDe = n => {
    if (!almacen.has(n)) almacen.set(n, new Map());
    const m = almacen.get(n);
    return {
      match: async r => (m.has(aReq(r).url) ? new Response(m.get(aReq(r).url)) : undefined),
      put: async (r, res) => { m.set(aReq(r).url, Buffer.from(await res.arrayBuffer())); },
      add: async r => { const res = await fetch(aReq(r)); if (!res.ok) throw new TypeError('add ' + res.status); m.set(aReq(r).url, Buffer.from(await res.arrayBuffer())); },
      keys: async () => [...m.keys()]
    };
  };
  const caches = {
    open: async n => cacheDe(n), keys: async () => [...almacen.keys()], delete: async n => almacen.delete(n),
    match: async r => { for (const n of almacen.keys()) { const x = await cacheDe(n).match(r); if (x) return x; } return undefined; }
  };
  const ctx = vm.createContext({
    self: { location: new URL(ORIGEN + 'sw.js'), addEventListener: (t, f) => { oyentes[t] = f; },
            skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, fetch, Request: Req, Response, URL, Promise, Set, Map, console
  });
  vm.runInContext(String(leer('sw.js')), ctx, { filename: 'sw.js' });
  const esperar = async tipo => { let p = null; oyentes[tipo]({ waitUntil: x => { p = x; } }); await p; };
  /* Lo que la página recibe por esa dirección: { cuerpo } o { error }. */
  async function pedir(url, mode) {
    const req = new Req(url); if (mode) req.mode = mode;
    let p = null;
    oyentes.fetch({ request: req, respondWith: x => { p = x; } });
    if (!p) return { pasa: true };
    try {
      const res = await p;
      if (!res) return { error: 'el service worker no contestó nada' };
      if (!res.ok) return { error: 'HTTP ' + res.status };
      return { cuerpo: Buffer.from(await res.arrayBuffer()) };
    } catch (e) { return { error: e.message }; }
  }
  return { red, instalar: () => esperar('install'), activar: () => esperar('activate'), pedir, guardados: () => almacen };
}

describe('A · sw.js sin señal: lo que no está guardado es un error de red, no index.html', () => {

  test('un .js que no está guardado (zxing.min.js, face-api.js) no recibe index.html: el <script> tiene que disparar `error`', async () => {
    const T = telefonoConSW();
    await T.instalar(); await T.activar();
    T.red.con = false;
    for (const u of ['app/lib/zxing.min.js', 'app/lib/rostro/face-api.js', 'app/lib/ocr/tesseract.min.js']) {
      const r = await T.pedir(ORIGEN + u);
      assert.ok(!r.cuerpo || !igual(r.cuerpo, INDEX), u + ': sin señal el service worker contestó index.html como si fuera el .js');
      assert.ok(r.error, u + ': tenía que ser un error de red y llegó ' + (r.cuerpo ? r.cuerpo.length + ' bytes' : 'nada'));
    }
  });

  test('una hoja o un manifiesto que no están guardados tampoco reciben index.html', async () => {
    const T = telefonoConSW();
    T.red.con = false;
    for (const u of ['play/otra.css', 'otra/app.webmanifest']) {
      const r = await T.pedir(ORIGEN + u);
      assert.ok(r.error, u + ': llegó ' + (r.cuerpo ? r.cuerpo.length + ' bytes' : 'nada'));
    }
  });

  test('control: una NAVEGACIÓN a una página que no está guardada sigue cayendo a la web pública', async () => {
    const T = telefonoConSW();
    await T.instalar(); await T.activar();
    T.red.con = false;
    const r = await T.pedir(ORIGEN + 'play/una-pagina-que-no-se-guardo.html', 'navigate');
    assert.ok(r.cuerpo && igual(r.cuerpo, INDEX), 'sin señal, la navegación a lo no guardado ya no da la web pública');
  });

  test('control: lo precargado sigue saliendo de la caché sin señal (.js con versión, la página, la hoja)', async () => {
    const T = telefonoConSW();
    await T.instalar(); await T.activar();
    T.red.con = false;
    for (const u of ['app/escaner-cedula.js?v=139', 'app/rostro-en-vivo.js?v=139', 'play/index.html', 'play/estilo.css', 'app/ocr-cedula.js']) {
      const r = await T.pedir(ORIGEN + u, /\.html$/.test(u) ? 'navigate' : undefined);
      assert.ok(r.cuerpo && igual(r.cuerpo, leer(u.split('?')[0])), u + ': no salió de la caché: ' + (r.error || ''));
    }
  });

  test('control: con señal, un .js que no está guardado llega de la red y queda guardado', async () => {
    const T = telefonoConSW();
    await T.instalar(); await T.activar();
    const r = await T.pedir(ORIGEN + 'app/lib/zxing.min.js');
    assert.ok(r.cuerpo && igual(r.cuerpo, leer('app/lib/zxing.min.js')));
    await new Promise(x => setImmediate(x));
    T.red.con = false;
    const r2 = await T.pedir(ORIGEN + 'app/lib/zxing.min.js');
    assert.ok(r2.cuerpo && igual(r2.cuerpo, leer('app/lib/zxing.min.js')), 'la copia que bajó con señal no se guardó');
  });
});

/* ==========================================================================
 * B · cargarScript de play/: `load` sin el global es un fallo que se olvida
 * ======================================================================== */
function playConScripts(queHaceAlCargar) {
  const P = abrirPlay();
  P.ev('window.__intentos = [];');
  P.ev("document.createElement = (function (o) { return function (t) {" +
       " var e = o.call(document, t); if (t === 'script') window.__intentos.push(e); return e; }; })(document.createElement);");
  P.ev('document.head.appendChild = ' + queHaceAlCargar + ';');
  return P;
}
const resultado = (P, expr) => P.ev(expr + ".then(function () { return 'ok'; }, function (e) { return 'falla: ' + e.message; })");

describe('B · cargarScript(url, listo) de play/', () => {

  test('el archivo «cargó» pero el global no está (index.html servido como .js): se rechaza, se olvida, y el siguiente intento vuelve a pedirlo', async () => {
    /* El service worker v138, sin señal, contesta index.html; Chrome dispara
       `load` igual (sin nosniff: tugarantia.net no lo manda). */
    const P = playConScripts('function (e) { if (e && e.onload) e.onload(); }');
    const r1 = await resultado(P, "cargarScript('../app/lib/zxing.min.js', function () { return !!window.ZXing; })");
    assert.match(r1, /^falla/, 'dio por cargado un .js cuyo global no apareció');
    assert.equal(P.ev("!!SCRIPTS['../app/lib/zxing.min.js']"), false, 'recordó la promesa del archivo que llegó mal');
    assert.equal(P.ev('window.__intentos.length'), 1);
    assert.equal(P.ev('window.__intentos[0].src'), '../app/lib/zxing.min.js');
    /* Vuelve la señal: el siguiente intento PIDE el archivo otra vez. */
    P.ev('document.head.appendChild = function (e) { if (e && e.onload) { window.ZXing = { lector: true }; e.onload(); } };');
    const r2 = await resultado(P, "cargarScript('../app/lib/zxing.min.js', function () { return !!window.ZXing; })");
    assert.equal(r2, 'ok', 'con señal otra vez, no cargó: ' + r2);
    assert.equal(P.ev('window.__intentos.length'), 2, 'no volvió a pedir el archivo');
    /* Y ya cargado, no se vuelve a pedir. */
    assert.equal(await resultado(P, "cargarScript('../app/lib/zxing.min.js', function () { return !!window.ZXing; })"), 'ok');
    assert.equal(P.ev('window.__intentos.length'), 2);
  });

  test('el <script> que llegó mal se quita del documento (no queda un nodo muerto)', async () => {
    const P = playConScripts('function (e) { window.__enDom = (window.__enDom || []).concat([e]); e.parentNode = document.head; if (e && e.onload) e.onload(); }');
    P.ev('document.head.removeChild = function (e) { window.__quitados = (window.__quitados || []).concat([e]); };');
    await resultado(P, "cargarScript('x.js', function () { return false; })");
    assert.equal(P.ev('(window.__quitados || []).length'), 1, 'el nodo del .js envenenado se quedó en el documento');
  });

  test('control: con el global presente resuelve, y una carga en vuelo no se duplica', async () => {
    const P = playConScripts('function (e) { window.__pendiente = e; }');
    const p1 = P.ev("cargarScript('y.js', function () { return !!window.Y; })");
    const p2 = P.ev("cargarScript('y.js', function () { return !!window.Y; })");
    assert.equal(P.ev('window.__intentos.length'), 1, 'dos llamadas seguidas pidieron el archivo dos veces');
    P.ev('window.Y = 1; window.__pendiente.onload();');
    await p1; await p2;
    assert.equal(P.ev("!!SCRIPTS['y.js']"), true);
  });

  test('control: sin `listo` (una llamada vieja) se sigue resolviendo en `load`, y `error` se sigue olvidando', async () => {
    const P = playConScripts('function (e) { if (e && e.onload) e.onload(); }');
    assert.equal(await resultado(P, "cargarScript('z.js')"), 'ok');
    P.ev('document.head.appendChild = function (e) { if (e && e.onerror) e.onerror(); };');
    assert.match(await resultado(P, "cargarScript('w.js', function () { return true; })"), /^falla/);
    assert.equal(P.ev("!!SCRIPTS['w.js']"), false);
  });

  test('cada cargarScript de play/ dice qué global espera (si no, la copia envenenada se recordaría igual)', () => {
    const t = String(leer('play/index.html'));
    const llamadas = [...t.matchAll(/\bcargarScript\(((?:[^()]|\([^()]*\))*)\)/g)]
      .filter(m => !/^url(,\s*listo)?$/.test(m[1].trim()))         // la definición
      .map(m => m[1].trim());
    assert.ok(llamadas.length >= 7, 'esperaba las llamadas de zxing, OCR, Tesseract, el rostro y PlataChat: ' + llamadas.join(' | '));
    const sinGlobal = llamadas.filter(a => !/,\s*llegoElGlobal\('\w+'\)$/.test(a));
    assert.deepEqual(sinGlobal, [], 'llamadas sin decir qué global esperan');
    assert.match(t, /function llegoElGlobal\(/);
  });
});

/* ==========================================================================
 * C · rostro-en-vivo: crearDetector dice qué global espera de face-api.js
 * ======================================================================== */
describe('C · crearDetector le dice a cargarScript que espera `faceapi`', () => {
  const RV = require(path.join(RAIZ, 'app', 'rostro-en-vivo.js'));

  test('con un cargarScript que honra `listo` y sin faceapi, falla por «llegó otra cosa» (y no se recuerda)', async () => {
    const antes = globalThis.faceapi;
    delete globalThis.faceapi;
    const pedidos = [];
    /* El cargarScript de play/ desde hoy: `load` sin el global es un fallo. */
    const cargar = (u, listo) => { pedidos.push(u); return (typeof listo === 'function' && !listo()) ? Promise.reject(new Error('llegó otra cosa por ' + u)) : Promise.resolve(); };
    try {
      await assert.rejects(RV.crearDetector({ cargarScript: cargar, base: '../app/lib/rostro' }), /llegó otra cosa por \.\.\/app\/lib\/rostro\/face-api\.js/);
      await assert.rejects(RV.crearDetector({ cargarScript: cargar, base: '../app/lib/rostro' }), /llegó otra cosa/);
      assert.equal(pedidos.length, 2, 'el segundo intento no volvió a pedir face-api.js');
    } finally { if (antes !== undefined) globalThis.faceapi = antes; }
  });

  test('la comprobación que manda dice que face-api llegó solo cuando trae el detector', async () => {
    const antes = globalThis.faceapi;
    delete globalThis.faceapi;
    let listo = null;
    try {
      await RV.crearDetector({ cargarScript: (u, l) => { listo = l; return Promise.reject(new Error('corto aquí')); }, base: 'x' }).catch(() => {});
      assert.equal(typeof listo, 'function', 'crearDetector no le dice a cargarScript qué espera');
      assert.equal(listo(), false);
      globalThis.faceapi = { otra: 'cosa' };
      assert.equal(listo(), false, 'un faceapi sin redes cuenta como llegado');
      globalThis.faceapi = { nets: { tinyFaceDetector: {} } };
      assert.equal(listo(), true);
    } finally { if (antes === undefined) delete globalThis.faceapi; else globalThis.faceapi = antes; }
  });
});

/* ==========================================================================
 * D · con la cámara abierta, el lector se vuelve a pedir
 * ======================================================================== */
describe('D · bucleEscanerDoc vuelve a pedir zxing.min.js mientras no esté', () => {
  /* El reloj de la página, en manos de la prueba (como en banco-camara.js). */
  function abrirConReloj() {
    const reloj = { t: Date.parse('2026-10-23T10:00:00-05:00') };
    class Reloj extends Date {
      constructor(...a) { if (a.length) super(...a); else super(reloj.t); }
      static now() { return reloj.t; }
    }
    const P = abrirPlay({ hash: '#registro', Date: Reloj });
    assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
    /* El bucle con una tarjeta en verde y sin lector, como en respaldo-derecho.test.js. */
    P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;");
    P.ev("medirCajaDoc = function () {}; grisDeGuia = function () { return [1]; }; vigilarLinterna = function () {};");
    P.ev('EC = Object.assign({}, EC, { medirTarjeta: function () { return { ok: true, nitidez: 20, falla: "" }; } });');
    P.ev('capturarDoc = function () {}; leerCuadroDoc = function () {};');
    P.ev("window.__pedidos = []; cargarScript = function (u, listo) { window.__pedidos.push({ u: u, listo: typeof listo === 'function' ? listo() : null }); return Promise.reject(new Error('sin señal')); };");
    P.ev("ESCDOC.activo = true; ESCDOC.lado = 'reverso'; ESCDOC.desde = Date.now(); ESCDOC.leyendo = false; ESCDOC.ultima = 0; ESCDOC.tUltimo = 0;" +
         'ESCDOC.estables = 0; ESCDOC.msVerde = 0; ESCDOC.lecturas = 0; ESCDOC.mejorNitidez = 20; ESCDOC.vioCodigo = true; ESCDOC.tLector = 0;');
    const pedidos = () => JSON.parse(P.ev('JSON.stringify(window.__pedidos)'));
    const tic = ms => { reloj.t += ms; P.ev('bucleEscanerDoc()'); };
    return { P, reloj, pedidos, tic };
  }

  test('sin ZXing, el bucle pide el lector al primer cuadro, no lo repite cada cuadro, y lo vuelve a pedir pasado MS_REINTENTO_LECTOR', () => {
    const { P, pedidos, tic } = abrirConReloj();
    assert.equal(P.ev('typeof window.ZXing'), 'undefined');
    tic(0);
    assert.equal(pedidos().length, 1, 'el primer cuadro sin lector no lo pidió');
    assert.equal(pedidos()[0].u, P.ev('URL_ZXING'));
    assert.equal(pedidos()[0].listo, false, 'no le dice a cargarScript qué global espera (o dice que ya está)');
    tic(250); tic(250); tic(1000);
    assert.equal(pedidos().length, 1, 'lo pidió en cada cuadro: sin señal, eso es una petición fallida cuatro veces por segundo');
    tic(P.ev('MS_REINTENTO_LECTOR'));
    assert.equal(pedidos().length, 2, 'pasado MS_REINTENTO_LECTOR no volvió a pedirlo: con la señal de vuelta, el escáner seguiría sin lector');
    assert.ok(P.ev('MS_REINTENTO_LECTOR') >= 2000 && P.ev('MS_REINTENTO_LECTOR') <= 10000, 'el reintento tiene que ser de segundos, no de cuadros ni de minutos');
  });

  test('control: con ZXing ya cargado el bucle no pide nada; y con la cámara apagada, tampoco', () => {
    const { P, pedidos, tic } = abrirConReloj();
    P.ev('window.ZXing = {};');
    tic(0); tic(5000);
    assert.equal(pedidos().length, 0, 'con el lector puesto lo volvió a pedir');
    P.ev('delete window.ZXing; ESCDOC.activo = false;');
    tic(5000);
    assert.equal(pedidos().length, 0, 'con la cámara apagada pidió el lector');
  });
});
