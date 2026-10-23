'use strict';
/* ==========================================================================
 * SIN CARA, LA SELFIE NO SE TOMA SOLA — 22-oct-2026 (segunda vuelta)
 *
 *   node --test pruebas/sin-cara-no-se-toma-sola.test.js
 *
 * Dos cambios de la misma rama se sumaban: T3 (el detector que en 12 s no ve
 * ninguna cara se suelta y vuelve al encuadre) y VENTAJA_CENTRO de 1,25 a 0,3
 * (para que el encuadre disparara con una cabeza con pelo). Juntos, con el
 * celular apoyado mirando una repisa o una camisa a rayas, la foto «se tomaba
 * sola» a los 12,9 s, salía «¡Listo! Tu foto quedó tomada» y llegaba al CRM
 * como «Su cara» —el síntoma de William al revés—, mientras la política dice
 * «dispara cuando hay una sola cara, centrada, cerca y quieta».
 *
 *   1. Una textura pareja quieta (el mismo detalle adentro y afuera del óvalo)
 *      no dispara el encuadre: falla 'parejo'.
 *   2. Si el detector se soltó porque no vio ninguna cara, el encuadre guía
 *      pero no dispara solo: ni verde, ni «3·2·1», y lo dice.
 *   3. Sin detector desde el arranque, el encuadre sigue disparando (es lo que
 *      se buscaba para el iPhone con poca señal), pero junto a la foto dice que
 *      se tomó sin buscar la cara, para que la persona la mire; y la política
 *      lo cuenta.
 * Las que prueban lo nuevo FALLAN con c601179; las de control (las que dicen
 * «sigue») pasan con las dos.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../app/cuenta.js');
const IM = require('./imagenes-de-mentira.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const FUENTE_RV = fs.readFileSync(path.join(RAIZ, 'app', 'rostro-en-vivo.js'), 'utf8');
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));
const L = 32;
const cuadro = f => { const g = new Array(L * L); for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) g[y * L + x] = Math.max(0, Math.min(255, Math.round(f(x, y)))); return g; };
function azar(semilla) { let s = semilla >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* Escenas sin cara que el celular apoyado puede tener delante. */
const r = azar(12345);
const TEXTURAS = {
  'baldosas del piso': cuadro((x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) ? 100 : 150),
  'camisa a rayas': cuadro((x, y) => (Math.floor(y / 3) % 2) ? 90 : 160),
  'persiana o repisa': cuadro((x, y) => (Math.floor(x / 5) % 2) ? 70 : 170),
  'tela (ruido parejo)': cuadro(() => 128 + (r() - 0.5) * 86),
  'teclado': cuadro((x, y) => (x % 4 === 0 || y % 4 === 0) ? 40 : 170),
  'pared de ladrillo': cuadro((x, y) => (y % 5 === 0 || ((x + (Math.floor(y / 5) % 2) * 4) % 8 === 0)) ? 60 : 160)
};
/* Una escena que el encuadre acepta con c601179 y con el arreglo: el techo con
   una lámpara en el centro (ya disparaba con el 1,25 de antes). Sirve para
   probar QUIÉN decide disparar, no el umbral. */
const LAMPARA = cuadro((x, y) => { const d = Math.hypot(x - 16, y - 16); return d < 5 ? 235 : (d < 7 ? 60 : 150); });

describe('1. una textura pareja quieta no dispara el encuadre', () => {

  test('baldosas, camisa a rayas, persiana, tela, teclado y ladrillo: «parejo», nunca ok', () => {
    for (const k of Object.keys(TEXTURAS)) {
      const g = TEXTURAS[k], m = U.medirEncuadre(g, g, L);
      assert.equal(m.ok, false, '«' + k + '» dispara el encuadre (centro/borde ' + (m.centro / m.borde).toFixed(2) + '): se toma sola una foto sin cara');
      assert.equal(m.falla, 'parejo', '«' + k + '» falla por «' + m.falla + '»');
    }
    assert.match(U.textoDeEncuadre({ falla: 'parejo' }), /cara dentro del óvalo/, 'la falla nueva se quedó sin frase que diga qué hacer');
  });

  test('la cabeza con pelo sigue disparando, y la cara que llena el óvalo también (control)', () => {
    const W = 720, H = 960, img = IM.selfie(W, H);
    const gris = escala => { const g = new Array(L * L), rx = W * 0.32, ry = H * 0.36;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        const sx = W / 2 + ((x + 0.5) / L * 2 - 1) * rx / escala, sy = H / 2 + ((y + 0.5) / L * 2 - 1) * ry / escala;
        g[y * L + x] = img[Math.max(0, Math.min(H - 1, Math.round(sy))) * W + Math.max(0, Math.min(W - 1, Math.round(sx)))];
      } return g; };
    [0.8, 1, 1.2].forEach(e => { const g = gris(e), m = U.medirEncuadre(g, g, L); assert.equal(m.ok, true, 'la cabeza a ' + e + '× ya no dispara: «' + m.falla + '»'); });
    const cara = cuadro((x, y) => (x >= 8 && x < 24 && y >= 8 && y < 24) ? (((x * 7 + y * 13) % 2) ? 40 : 210) : 130);
    assert.equal(U.medirEncuadre(cara, cara, L).ok, true, 'la cara de cerca (todo el detalle en el centro) ya no dispara');
  });
});

/* El escáner de play/ con un detector de mentira que contesta siempre «no hay
   cara» (o ninguno), y una cámara que muestra `escena` quieta. El reloj lo
   lleva la prueba; los setTimeout se guardan y los corre la prueba. */
function escaner(escena, o) {
  o = o || {};
  let ahora = Date.UTC(2026, 9, 22, 15, 0, 0);
  const Real = Date;
  class Reloj extends Real { constructor(...a) { if (a.length) super(...a); else super(ahora); } static now() { return ahora; } }
  const P = abrirPlay({ Date: Reloj });
  P.ev(FUENTE_RV);
  if (o.conDetector) {
    P.ev('window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () {} } },' +
      '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); }, getBackend: function () { return "webgl"; } },' +
      '  detectAllFaces: function () { return { run: function () { return Promise.resolve([]); } }; } };');
    P.ev('window.cargarScript = function () { return Promise.resolve(); };');
  } else {
    /* Sin señal para el detector: el script no llega. */
    P.ev('window.cargarScript = function () { return Promise.reject(new Error("sin señal")); };');
  }
  P.ev('window.__disparos = []; window.__capturar = capturarRostro;' +
    'capturarRostro = function () { window.__disparos.push(ESCANER.modo); return window.__capturar(); };');
  /* La foto sale de un lienzo que sí da un JPEG (el del banco no da ninguno). */
  P.ev('document.createElement = (function (ce) { return function (t) { return t === "canvas" ? { getContext: function () { return { drawImage: function () {} }; },' +
    ' toDataURL: function () { return "data:image/jpeg;base64,RVNDRU5B"; } } : ce(t); }; })(document.createElement);');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 400 }; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return Promise.resolve({ getTracks: function () { return []; }, getVideoTracks: function () { return []; } }); } };');
  P.ev('window.__t = []; setTimeout = function (f) { window.__t.push(f); return 1; }; clearTimeout = function () {};');
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;" +
    "$('camLienzo').getContext = function () { return new Proxy({}, { get: function (t, k) { return k in t ? t[k] : function () { return { addColorStop: function () {} }; }; }, set: function (t, k, v) { t[k] = v; return true; } }); };");
  P.ev('window.__escena = ' + JSON.stringify(escena) + ';' +
    'ESCANER.lienzoMedir = { width: 32, height: 32, getContext: function () { return { drawImage: function () {},' +
    ' getImageData: function () { var d = new Uint8ClampedArray(32 * 32 * 4); for (var i = 0; i < 32 * 32; i++) { d[4*i] = d[4*i+1] = d[4*i+2] = window.__escena[i]; d[4*i+3] = 255; } return { data: d }; } }; } };');
  P.reloj = { avanzar: ms => { ahora += ms; }, segundos: () => (ahora - Real.UTC(2026, 9, 22, 15, 0, 0)) / 1000 };
  /* Corre el bucle del escáner hasta `seg` segundos o hasta el primer disparo,
     y devuelve en qué segundo pasó a 'encuadre' y en cuál disparó. */
  P.correr = async seg => {
    let cambio = null, disparo = null;
    for (let n = 0; n < seg * 1000 / 80 && !P.ev('window.__disparos.length'); n++) {
      P.ev('var f = window.__t.shift(); window.__t = []; if (f) f(); else if (ESCANER.activo) bucleEscaner();');
      await esperar();
      if (cambio === null && P.ev('ESCANER.modo') === 'encuadre') cambio = P.reloj.segundos();
      P.reloj.avanzar(80);
    }
    if (P.ev('window.__disparos.length')) disparo = P.reloj.segundos();
    return { cambio, disparo };
  };
  return P;
}

describe('2. el detector que no vio ninguna cara no deja que el encuadre dispare solo', () => {

  test('con el celular apoyado mirando algo que el encuadre acepta: a los 12 s pasa al encuadre y NO dispara en 32 s', async () => {
    const P = escaner(LAMPARA, { conDetector: true });
    P.ev('iniciarEscaner()');
    for (let i = 0; i < 4; i++) await esperar();
    assert.equal(P.ev('ESCANER.modo'), 'rostro', 'el detector de mentira no se encendió: la prueba no mediría nada');
    const { cambio, disparo } = await P.correr(32);
    assert.ok(cambio !== null && cambio > 12 && cambio < 13, 'no se soltó el detector a los 12 s (T3): ' + cambio);
    assert.equal(disparo, null, 'la foto se tomó sola a los ' + disparo + ' s, cuando el detector acababa de concluir que no había ninguna cara');
    assert.equal(P.ev('ESCANER.vioCara'), false);
    /* Y la pantalla no promete el disparo: ni verde, ni cuenta, y lo dice. */
    assert.equal(P.ev("$('camCuenta').textContent"), '', 'la cuenta «3·2·1» promete un disparo que no va a llegar');
    assert.match(P.ev("$('camEstado').textContent"), /toca «Tomar la foto ahora»/);
    assert.match(P.ev("$('selfieNota').textContent"), /no la va a tomar solo/);
  });

  test('solo a mano, el botón toma la foto; y un intento nuevo empieza sin el «solo a mano»', async () => {
    const P = escaner(LAMPARA, { conDetector: true });
    P.ev('iniciarEscaner()');
    for (let i = 0; i < 4; i++) await esperar();
    await P.correr(14);
    assert.equal(P.ev('capturarRostro()'), true, 'con el escáner solo a mano, el botón no tomó la foto');
    assert.equal(P.ev('FOTOS.selfie'), 'data:image/jpeg;base64,RVNDRU5B');
    P.ev('iniciarEscaner()');
    assert.equal(P.ev('ESCANER.soloAMano'), false, 'el «solo a mano» de un intento pasó al siguiente');
  });
});

describe('3. sin detector desde el arranque, el encuadre dispara y lo dice junto a la foto', () => {

  test('sin señal para el detector, con algo que pasa el encuadre: dispara, y la nota pide mirar la foto', async () => {
    const P = escaner(LAMPARA, { conDetector: false });
    P.ev('iniciarEscaner()');
    for (let i = 0; i < 4; i++) await esperar();
    const { disparo } = await P.correr(10);
    assert.ok(disparo !== null, 'sin detector el encuadre dejó de disparar: el iPhone con poca señal se queda sin selfie automática');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__disparos)')), ['encuadre']);
    assert.equal(P.ev('FOTOS.selfie'), 'data:image/jpeg;base64,RVNDRU5B');
    assert.match(P.ev("$('selfieNota').textContent"), /Se tomó sola sin poder buscar tu cara: mírala/,
      'la foto que se tomó sin buscar una cara sale con «¡Listo!» y nada le pide a la persona mirarla');
  });

  test('sin señal y con una camisa a rayas delante: no dispara', async () => {
    const P = escaner(TEXTURAS['camisa a rayas'], { conDetector: false });
    P.ev('iniciarEscaner()');
    for (let i = 0; i < 4; i++) await esperar();
    const { disparo } = await P.correr(20);
    assert.equal(disparo, null, 'sin detector, la camisa a rayas se tomó sola como selfie a los ' + disparo + ' s');
  });

  test('la política cuenta el respaldo: sin el programa, el celular dispara sin buscar la cara y pide mirar la foto', () => {
    /* Decía solo «dispara cuando hay una sola cara», y el encuadre de
       respaldo dispara sin buscarla (mide luz, detalle y quietud). Mientras
       play/ pueda disparar con el encuadre, la política tiene que decirlo. */
    const PRIV = fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8');
    const i = PRIV.indexOf('<h3>La foto de tu cara, que se toma sola</h3>');
    const seccion = PRIV.slice(i, PRIV.indexOf('<h3>', i + 10)).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    assert.match(PLAY, /anotarDisparo\('sola, con el encuadre'\)/, 'play/ ya no dispara con el encuadre: esta prueba sobra');
    assert.match(seccion, /no busca tu cara/, 'la política no dice que sin el programa el celular dispara sin buscar la cara');
    assert.match(seccion, /mirar la foto y repetirla si no se ve tu cara/);
  });
});
