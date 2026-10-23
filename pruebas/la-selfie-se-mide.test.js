'use strict';
/* ==========================================================================
 * MEDIR LA SELFIE EN EL TELÉFONO DE VERDAD — 22-oct-2026
 *
 *   node --test pruebas/la-selfie-se-mide.test.js
 *
 * Los umbrales de la selfie que se toma sola se calibraron en Node con un
 * temblor de la caja SUPUESTO (pruebas/la-selfie-se-toma-sola.test.js). El
 * lunes 26 Joan la prueba en su Android y en el iPhone de William; si no se
 * toma sola, hace falta saber QUÉ la frena. play/?medir=1 pone debajo del
 * escáner los números (motor, video, lo que tarda cada detección, la falla, y
 * qué rompió cada racha) para un pantallazo. Se vigila:
 *   · sin ?medir=1 no existe ni el recuadro (nadie lo ve por accidente);
 *   · con ?medir=1 dice lo que hace falta para calibrar, y cómo disparó;
 *   · NADA de eso se guarda ni sale del teléfono, y al apagarse la cámara se
 *     borra dónde estaba la cara (la política: vive mientras la cámara está
 *     prendida).
 * Las que prueban lo nuevo FALLAN con ab6b595 (no había modo de medir); las
 * de control («sin ?medir=1 … nada» y «NADA … se guarda») pasan con las dos:
 * están para que medir no abra un hueco.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RV = require('../app/rostro-en-vivo.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const FUENTE_RV = fs.readFileSync(path.join(RAIZ, 'app', 'rostro-en-vivo.js'), 'utf8');
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

/* El face-api de mentira de la-selfie-se-toma-sola: una cara centrada y
   quieta, en píxeles de un lienzo de 320×400, y el motor que se diga. */
function conModulo(P, o) {
  o = o || {};
  P.ev(FUENTE_RV);
  P.ev('window.__cajas = ' + JSON.stringify(o.cajas || [{ x: 102.4, y: 110, width: 115.2, height: 180 }]) + ';' +
    'window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () {} } },' +
    '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); }, getBackend: function () { return "webgl"; } },' +
    '  detectAllFaces: function () { var r = window.__cajas.map(function (b) { return { box: b, score: 0.9 }; });' +
    '    return { run: function () { return Promise.resolve(r); } }; } };');
  P.ev('window.cargarScript = function () { return Promise.resolve(); };');
  P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; detenerEscaner(); };');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 400 }; }; nitidezDeCara = function () { return 25; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
  /* Un iPhone: video 9:16, y lienzos que no dibujan nada (el bucle pinta). */
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 1280;" +
    "$('camLienzo').getContext = function () { return new Proxy({}, { get: function (t, k) { return k in t ? t[k] : function () {" +
    '  return k === "createLinearGradient" ? { addColorStop: function () {} } : undefined; }; }, set: function (t, k, v) { t[k] = v; return true; } }); };' +
    'ESCANER.lienzoMedir = { width: 32, height: 32, getContext: function () { return { drawImage: function () {},' +
    '  getImageData: function () { var d = new Uint8ClampedArray(32 * 32 * 4); for (var i = 0; i < d.length; i++) d[i] = (i * 37) % 255; return { data: d }; } }; } };');
}
function reloj() {
  const r = { ahora: Date.UTC(2026, 9, 22, 15, 0, 0) };
  const Real = Date;
  r.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(r.ahora); } static now() { return r.ahora; } };
  return r;
}

describe('play/?medir=1', () => {
  test('sin ?medir=1 no existe ni el recuadro, y el escáner no anota nada', async () => {
    const P = abrirPlay();
    conModulo(P);
    P.ev("pintarRegistro(indiceDe('rostro'))");
    assert.equal(/camMedir/.test(P.ev('pasoRostro()')), false, 'el recuadro de medir sale sin ?medir=1');
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    P.ev("detectarCara($('camVideo'), 128)"); await esperar();
    assert.equal(P.ev('typeof MEDIDAS === "undefined" || MEDIDAS === null'), true, 'sin ?medir=1 se anotan medidas');
  });

  test('con ?medir=1 dice el motor, el video y lo que se ve, lo que tarda, la falla y qué rompió la racha', async () => {
    const R = reloj();
    const P = abrirPlay({ search: '?medir=1', Date: R.Date });
    conModulo(P);
    assert.match(P.ev('pasoRostro()'), /id="camMedir"/);
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    assert.equal(P.ev('ESCANER.modo'), 'rostro');
    /* Dos buenas, una movida (rompe la racha) y otra buena: no alcanza a disparar. */
    const det = async (caja) => {
      if (caja) P.ev('window.__cajas = [' + JSON.stringify(caja) + '];');
      P.ev("detectarCara($('camVideo'), 128)"); await esperar(); R.ahora += 200;
    };
    await det(); await det(); await det();
    await det({ x: 122.4, y: 110, width: 115.2, height: 180 });   // 20 px: se movió, sin salirse del óvalo
    await det({ x: 102.4, y: 110, width: 115.2, height: 180 });
    P.ev('bucleEscaner()');
    const t = P.ev("$('camMedir').textContent");
    assert.match(t, /no se guarda ni se manda/);
    assert.match(t, /modo rostro · motor webgl · ojos no · entrada 224/);
    assert.match(t, /video 720×1280 · se ve 720×960/, 'no dice que el video es 9:16 y qué parte se ve');
    assert.match(t, /detecciones 5 · última \d+ ms · mediana \d+ ms/);
    assert.match(t, /ahora: \w+ · tamaño [\d,]+ \(0,4–1\) · desvío [\d,]+ \(≤[\d,]+\)/);
    assert.match(t, /cambio [\d,—]+ \(≤0,2\) · nitidez 25 de 25 \(≥0,6 y ≥6\)/);
    assert.match(t, /racha \d de 3 · cara a la vista [\d,]+ s \(mín 0,9\)/);
    assert.match(t, /rompieron la racha: movimiento 1/, 'no dice qué rompió la racha');
    assert.match(t, /disparo: todavía no/);
  });

  test('cuando dispara solo lo dice, y al apagarse la cámara se borra dónde estaba la cara', async () => {
    const R = reloj();
    const P = abrirPlay({ search: '?medir=1', Date: R.Date });
    conModulo(P);
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    let n = 0;
    while (P.ev('window.__disparo') === 0 && n < 30) { P.ev("detectarCara($('camVideo'), 128)"); await esperar(); R.ahora += 250; n++; }
    assert.equal(P.ev('window.__disparo'), 1);
    const t = P.ev("$('camMedir').textContent");
    assert.match(t, /disparo: sola, con el detector, a los [\d,]+ s/);
    assert.match(t, /fallas: (movimiento \d+ · ok \d+|ok \d+ · movimiento \d+)/);
    assert.equal(/ahora:|tamaño|desvío|nitidez/.test(t), false, 'con la cámara apagada sigue en pantalla dónde estaba la cara');
  });

  test('con el botón dice «a mano»; con el encuadre, «con el encuadre»', () => {
    const P = abrirPlay({ search: '?medir=1' });
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
    P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;");
    P.ev('document.createElement = (function (ce) { return function (t) { return t === "canvas" ? { getContext: function () { return { drawImage: function () {} }; },' +
      ' toDataURL: function () { return "data:image/jpeg;base64,CARA"; } } : ce(t); }; })(document.createElement);');
    P.ev('MEDIDAS = medidasNuevas(); capturarRostro();');
    assert.match(P.ev('MEDIDAS.disparo'), /^a mano, a los/);
    P.ev('MEDIDAS = medidasNuevas(); anotarDisparo("sola, con el encuadre"); capturarRostro();');
    assert.match(P.ev('MEDIDAS.disparo'), /^sola, con el encuadre/, 'el botón pisó cómo disparó');
  });

  test('NADA de lo medido se guarda en el teléfono ni viaja con la foto', async () => {
    const R = reloj();
    const P = abrirPlay({ search: '?medir=1', Date: R.Date });
    conModulo(P);
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    for (let i = 0; i < 8; i++) { P.ev("detectarCara($('camVideo'), 128)"); await esperar(); R.ahora += 250; }
    const guardado = JSON.stringify(P.almacen) + JSON.stringify(P.sesion) + P.ev('JSON.stringify(FOTOS)');
    assert.equal(/detecciones|rompieron|mediana|motor|disparo|tamano|desvio/.test(guardado), false,
      'algo de lo medido quedó guardado: ' + guardado.slice(0, 300));
    /* Y la subida no tiene de dónde sacarlo: la huella se arma con FOTOS. */
    const fuente = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    const i = fuente.indexOf('function subirArchivosRegistro'), f = fuente.indexOf('\nfunction ', i + 10);
    assert.equal(/MEDIDAS/.test(fuente.slice(i, f)), false, 'la subida lee lo medido');
  });
});
