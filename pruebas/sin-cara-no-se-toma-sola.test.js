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
const RV = require('../app/rostro-en-vivo.js');

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

/* ==========================================================================
 * 4. EL RATO SIN CARA EMPIEZA CUANDO EL DETECTOR MIRA — 23-oct-2026
 *
 * T3 contaba sus 12 s desde que el detector quedó listo, y el detector baja
 * mientras el teléfono pregunta por el permiso de la cámara. Quien tardaba
 * 14 s en tocar «Permitir» (a los 9 s la página misma dice «Esperando el
 * permiso de la cámara…»; Safari vuelve a preguntar, y quien retoma el
 * registro en «Tu rostro» lo ve ahí por primera vez) llegaba con el plazo
 * vencido: en el primer fotograma, sin una sola detección, el escáner pasaba a
 * «solo a mano», la nota decía «El escáner no logra ver tu cara» y la foto ya
 * no se tomaba sola con la cara quieta en el óvalo. Las tres FALLAN con
 * e52b871.
 * ======================================================================== */

/* El escáner con el permiso de la cámara en manos de la prueba: getUserMedia
   no contesta hasta P.permitir(); los setTimeout se guardan con su hora y
   corren cuando el reloj llega; el detector de mentira ve una cara centrada
   del tamaño justo (`cara: true`) o ninguna, y cuenta cada vez que mira. */
function escanerConPermiso(o) {
  const T0 = Date.UTC(2026, 9, 26, 15, 0, 0);
  let ahora = T0;
  const Real = Date;
  class Reloj extends Real { constructor(...a) { if (a.length) super(...a); else super(ahora); } static now() { return ahora; } }
  const P = abrirPlay({ Date: Reloj });
  P.ev(FUENTE_RV);
  const caras = o.cara ? '[{ box: { x: 0.33 * w, y: 0.27 * h, width: 0.34 * w, height: 0.46 * h }, score: 0.95 }]' : '[]';
  P.ev('window.__miradas = 0; window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () {} } },' +
    '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); }, getBackend: function () { return "webgl"; } },' +
    '  detectAllFaces: function (lienzo) { window.__miradas++; var w = lienzo.width || 320, h = lienzo.height || 427;' +
    '    return { run: function () { return Promise.resolve(' + caras + '); } }; } };');
  P.ev('window.cargarScript = function () { return Promise.resolve(); };');
  P.ev('window.__disparos = []; capturarRostro = function () { window.__disparos.push(ESCANER.modo); detenerEscaner(); return true; };');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 427 }; }; nitidezDeCara = function () { return 40; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('window.__permitir = null; navigator.mediaDevices = { getUserMedia: function () { return new Promise(function (res) {' +
    ' window.__permitir = function () { res({ getTracks: function () { return []; }, getVideoTracks: function () { return []; } }); }; }); } };');
  P.ev('window.__t = []; setTimeout = function (f, ms) { window.__t.push({ f: f, en: Date.now() + (ms || 0) }); return window.__t.length; }; clearTimeout = function () {};');
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;" +
    "$('camLienzo').getContext = function () { return new Proxy({}, { get: function (t, k) { return k in t ? t[k] : function () { return { addColorStop: function () {} }; }; }, set: function (t, k, v) { t[k] = v; return true; } }); };");
  P.ev('ESCANER.lienzoMedir = { width: 32, height: 32, getContext: function () { return { drawImage: function () {},' +
    ' getImageData: function () { var d = new Uint8ClampedArray(32 * 32 * 4); for (var i = 0; i < 32 * 32; i++) { d[4*i] = d[4*i+1] = d[4*i+2] = 120; d[4*i+3] = 255; } return { data: d }; } }; } };');
  P.segundos = () => (ahora - T0) / 1000;
  P.saltar = ms => { ahora += ms; };
  /* Corre el reloj de 80 en 80 ms (los temporizadores que venzan, corren)
     hasta `ms` o hasta el primer disparo. */
  P.correr = async ms => {
    const fin = ahora + ms;
    while (ahora < fin) {
      ahora += 80;
      P.ev('(function () { var l = window.__t.filter(function (x) { return x.en <= Date.now(); });' +
        ' window.__t = window.__t.filter(function (x) { return x.en > Date.now(); }); l.forEach(function (x) { x.f(); }); })()');
      await esperar();
      if (P.ev('window.__disparos.length')) break;
    }
  };
  P.permitir = async () => { P.ev('window.__permitir()'); for (let i = 0; i < 5; i++) await esperar(); };
  P.arrancar = async () => {
    P.ev('iniciarEscaner()');
    for (let i = 0; i < 5; i++) await esperar();
    assert.equal(P.ev('ESCANER.modo'), 'rostro', 'el detector de mentira no se encendió: la prueba no mediría nada');
  };
  return P;
}

describe('4. el rato sin cara empieza cuando el detector mira, no cuando cargó', () => {

  test('el permiso que tarda 14 s no apaga el disparo: con la cara quieta en el óvalo, la foto se toma sola', async () => {
    const P = escanerConPermiso({ cara: true });
    await P.arrancar();
    await P.correr(14000);
    assert.match(P.ev("$('camEstado').textContent"), /Esperando el permiso de la cámara/, 'la prueba no pasó por el diálogo del permiso');
    const antes = P.ev('window.__miradas');
    await P.permitir();
    assert.equal(P.ev('ESCANER.soloAMano'), false,
      'con el permiso a los 14 s, en el primer fotograma y con ' + (P.ev('window.__miradas') - antes) + ' detecciones, el escáner ya quedó «solo a mano»');
    assert.doesNotMatch(P.ev("$('selfieNota').textContent"), /no logra ver tu cara/,
      'dice «El escáner no logra ver tu cara» sin haber mirado la cámara');
    await P.correr(10000);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__disparos)')), ['rostro'],
      'con la cara quieta en el óvalo la foto no se tomó sola: el encabezado del paso promete que sí');
    assert.ok(P.ev('window.__miradas') - antes >= 3, 'disparó sin mirar la cámara');
  });

  test('sin cara y con el permiso a los 14 s: se suelta 12 s después de la PRIMERA mirada, habiendo mirado', async () => {
    const P = escanerConPermiso({ cara: false });
    await P.arrancar();
    await P.correr(14000);
    const antes = P.ev('window.__miradas');
    await P.permitir();
    const permiso = P.segundos();
    let suelto = null;
    for (let n = 0; n < 200 && suelto === null; n++) {
      await P.correr(80);
      if (P.ev('ESCANER.soloAMano')) suelto = P.segundos();
    }
    assert.ok(suelto !== null, 'un detector que nunca ve una cara dejó a la persona esperando (T3 ya no se suelta)');
    assert.ok(suelto - permiso > 12 && suelto - permiso < 13.5,
      'se soltó ' + (suelto - permiso).toFixed(2) + ' s después del permiso: el rato sin cara no se cuenta desde la primera mirada');
    const miradas = P.ev('window.__miradas') - antes;
    assert.ok(miradas >= RV.ROSTRO.MIRADAS_SIN_CARA, 'dijo que no ve la cara habiendo mirado ' + miradas + ' veces');
    assert.match(P.ev("$('selfieNota').textContent"), /no logra ver tu cara/);
    assert.equal(P.ev('window.__disparos.length'), 0);
  });

  test('el reloj que corre sin que el detector mire (pantalla apagada, otra app) no lo suelta: hacen falta las miradas', async () => {
    const P = escanerConPermiso({ cara: false });
    await P.arrancar();
    const antes = P.ev('window.__miradas');
    await P.permitir();
    await P.correr(240);
    const pocas = P.ev('window.__miradas') - antes;
    /* Menos de las que pide MIRADAS_SIN_CARA (8 al 23-oct; el «|| 8» deja que
       la prueba corra también contra e52b871, que no la tenía). */
    assert.ok(pocas >= 1 && pocas < (RV.ROSTRO.MIRADAS_SIN_CARA || 8), 'la prueba necesita pocas miradas antes del salto: ' + pocas);
    P.saltar(20000);   // la persona vuelve a la página 20 s después
    await P.correr(80);
    assert.equal(P.ev('ESCANER.soloAMano'), false,
      'con ' + pocas + ' miradas y 20 s de reloj sin mirar, la nota ya dice «el escáner no logra ver tu cara»');
    assert.equal(P.ev('ESCANER.modo'), 'rostro');
    /* Y en cuanto mira las veces que hacen falta, sí se suelta (T3 sigue vivo). */
    await P.correr(2000);
    assert.equal(P.ev('ESCANER.soloAMano'), true, 'con las miradas completas y sin ninguna cara, T3 no se soltó');
  });
});
