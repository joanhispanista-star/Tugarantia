'use strict';
/* ==========================================================================
 * LA SELFIE SE TOMA SOLA, DE VERDAD, EN UN ANDROID Y EN UN IPHONE — 22-oct-2026
 *
 *   node --test pruebas/la-selfie-se-toma-sola.test.js
 *
 * Joan: «que la foto de la cara se tome automáticamente, y que parezca aún
 * más que se escanea la cara y los ojos». Hasta hoy él la tomaba siempre a
 * mano, y a William (iPhone) no se le tomó nunca. Lo que la frenaba, medido
 * en Node con las funciones de verdad (scratchpad inv-22oct del 22-oct):
 *   1. la racha era más estricta que el temblor de la caja del detector
 *      chico: con una frontal barata, a los 5 s se había disparado el 41 %;
 *   2. sin detector (señal floja: lo normal en un iPhone, que no precarga),
 *      el encuadre de respaldo NO disparaba con una cabeza con pelo;
 *   3. sin WebGL el detector corría en el procesador y congelaba la página;
 *   4. con un video 9:16 (el de Safari) el óvalo y la decisión iban sobre el
 *      cuadro ENTERO y no sobre lo que se ve en la caja 3:4;
 *   y un detector que contestaba siempre «no hay cara» dejaba a la persona
 *   en «Pon tu cara dentro del óvalo» hasta rendirse (T3), y una foto que no
 *   salía del lienzo no decía nada (T4).
 * Lo de los ojos (dibujarlos donde el detector los vio) y la frontera nueva
 * se vigilan en pruebas/selfie-automatica.test.js.
 * Las que prueban lo nuevo FALLAN con ab6b595; las de control (las que dicen
 * «sigue», «como siempre», «como antes» o «no … nada») pasan con las dos, y
 * están para que el arreglo no rompa lo que ya andaba.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RV = require('../app/rostro-en-vivo.js');
const U = require('../app/cuenta.js');
const IM = require('./imagenes-de-mentira.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const FUENTE_RV = fs.readFileSync(path.join(RAIZ, 'app', 'rostro-en-vivo.js'), 'utf8');
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

/* --------------------------------------------------------------------------
   1. LA RACHA AGUANTA LA CAJA DE UN TELÉFONO DE VERDAD
   -------------------------------------------------------------------------- */
function azar(semilla) { let s = semilla >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function normal(r) { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/* Una persona quieta frente a una frontal barata: la caja del detector chico
   tiembla de una detección a la siguiente (jC el centro, jH el alto) y la
   nitidez también (jN: el autofoco y el ruido del sensor). Se recorre como la
   recorre detectarCara en play/, con el reloj de la detección. Devuelve en
   qué segundo se disparó (o Infinity). */
function segundosHastaDisparar(r, o) {
  const H = 0.42, W = 0.32, porSeg = o.porSeg, paso = 1000 / porSeg;
  let previa = null, mejor = 0, estables = 0, desde = 0;
  for (let i = 0; i < porSeg * 30; i++) {
    const ahora = i * paso;
    const h = H * (1 + o.jH * normal(r)), w = W * (1 + o.jH * normal(r));
    const cx = 0.5 + o.jC * normal(r), cy = 0.53 + o.jC * normal(r);
    const nit = 20 * Math.exp(o.jN * normal(r));
    mejor = RV.mejorNitidez(mejor, nit);
    const m = RV.medirRostro([{ x: cx - w / 2, y: cy - h / 2, w, h, score: 0.9 }], { luz: 128, nitidez: nit, mejorNitidez: mejor, previa });
    previa = m.cara;
    const rr = RV.contarRacha(estables, m, { ahora, desde });
    estables = rr.estables; desde = rr.desde || 0;
    if (rr.disparar) return ahora / 1000;
  }
  return Infinity;
}
function porcentajeAntesDe(seg, o) {
  const r = azar(2210), N = 600;
  let n = 0;
  for (let k = 0; k < N; k++) if (segundosHastaDisparar(r, o) <= seg) n++;
  return n / N;
}

describe('1. la racha aguanta el temblor de una frontal barata', () => {
  const FRONTAL_BARATA = { jC: 0.015, jH: 0.08, jN: 0.20 };

  test('a 6 detecciones por segundo: casi siempre antes de 3 segundos', () => {
    const p = porcentajeAntesDe(3, Object.assign({ porSeg: 6 }, FRONTAL_BARATA));
    assert.ok(p >= 0.9, 'con una frontal barata solo se disparó el ' + Math.round(p * 100) + ' % antes de 3 s (con ab6b595: 41 % a los 5 s)');
  });

  test('a 2 por segundo (un Android barato, o Safari): casi siempre antes de 6 segundos', () => {
    const p = porcentajeAntesDe(6, Object.assign({ porSeg: 2 }, FRONTAL_BARATA));
    assert.ok(p >= 0.85, 'a 2 detecciones por segundo solo se disparó el ' + Math.round(p * 100) + ' % antes de 6 s');
  });

  test('y no dispara sin que se vea escanear: nunca antes de MS_ESCANEO_MIN con la cara a la vista', () => {
    const quieto = { jC: 0, jH: 0, jN: 0, porSeg: 30 };
    const s = segundosHastaDisparar(azar(1), quieto);
    assert.ok(s * 1000 >= RV.ROSTRO.MS_ESCANEO_MIN, 'con 30 detecciones por segundo disparó a los ' + s + ' s: no alcanza a verse el escaneo');
    assert.ok(s < 2, 'quieto de verdad tardó ' + s + ' s');
  });

  test('pero sigue sin disparar con la cara movida, lejos o borrosa', () => {
    const r = azar(7);
    assert.equal(segundosHastaDisparar(r, { jC: 0.08, jH: 0.3, jN: 0.2, porSeg: 6 }), Infinity, 'disparó con la cara bailando');
    let e = 0, desde = 0;
    for (let i = 0; i < 20; i++) {
      const m = RV.medirRostro([{ x: 0.45, y: 0.43, w: 0.1, h: 0.14, score: 0.9 }], { luz: 128, nitidez: 20, mejorNitidez: 20, previa: { x: 0.45, y: 0.43, w: 0.1, h: 0.14 } });
      const rr = RV.contarRacha(e, m, { ahora: i * 200, desde }); e = rr.estables; desde = rr.desde || 0;
      assert.equal(rr.disparar, false, 'disparó con la cara lejos');
    }
  });
});

/* --------------------------------------------------------------------------
   2. SIN DETECTOR, EL ENCUADRE DISPARA CON UNA CABEZA DE VERDAD
   -------------------------------------------------------------------------- */
describe('2. el respaldo (el encuadre) dispara con una cabeza con pelo', () => {
  const W = 720, H = 960, L = 32;
  /* El recorte de fotogramaGris: el rectángulo del óvalo (0,32 × 0,36 de la
     zona que se ve) a 32×32. `escala`: el tamaño de la cara respecto a la de
     la selfie de mentira, que llena el óvalo. */
  function gris(img, escala) {
    const g = new Array(L * L), rx = W * 0.32, ry = H * 0.36;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const sx = W / 2 + ((x + 0.5) / L * 2 - 1) * rx / escala, sy = H / 2 + ((y + 0.5) / L * 2 - 1) * ry / escala;
      const xi = Math.max(0, Math.min(W - 1, Math.round(sx))), yi = Math.max(0, Math.min(H - 1, Math.round(sy)));
      g[y * L + x] = img[yi * W + xi];
    }
    return g;
  }
  test('la selfie de mentira (con pelo en el borde del óvalo) pasa, de cerca, justa y de lejos', () => {
    const base = IM.selfie(W, H);
    [0.8, 1, 1.2].forEach(e => {
      const g = gris(base, e);
      const m = U.medirEncuadre(g, g, L);
      assert.equal(m.ok, true, 'con la cara a ' + e + '× el encuadre dice «' + m.falla + '» (centro ' + Math.round(m.centro) +
        ', borde ' + Math.round(m.borde) + '): sin detector, la selfie no se tomaba nunca sola');
    });
  });
  test('y una pared sigue sin disparar', () => {
    const pared = new Array(L * L).fill(128);
    assert.equal(U.medirEncuadre(pared, pared, L).ok, false);
  });
});

/* --------------------------------------------------------------------------
   3. EL DETECTOR: SIN ACELERACIÓN, NO; SIN OJOS, SIGUE; LENTO, SE ALIVIA
   -------------------------------------------------------------------------- */
describe('3. el detector se cuida del teléfono que no da', () => {
  function faceapi(o) {
    const anot = { cargas: 0, detecciones: 0, conOjos: 0, liberadas: [], entradas: [] };
    const red = n => ({ isLoaded: false, loadFromUri() { if (o.ojosFallan && n === 'marcas') return Promise.reject(new Error('sin señal')); this.isLoaded = true; return Promise.resolve(); },
      dispose() { anot.liberadas.push(n); } });
    const caja = { box: { x: 80, y: 100, width: 160, height: 200 }, score: 0.9 };
    const ojo = x0 => [0, 1, 2, 3, 4, 5].map(i => ({ x: x0 + i * 8, y: 160 }));
    const nets = { tinyFaceDetector: red('detector') };
    if (!o.sinModeloDeOjos) nets.faceLandmark68TinyNet = red('marcas');
    return { anot, api: {
      nets,
      TinyFaceDetectorOptions: function (op) { anot.entradas.push(op.inputSize); },
      detectAllFaces() {
        anot.detecciones++;
        return { run: () => Promise.resolve([caja]),
          withFaceLandmarks() { anot.conOjos++; return { run: () => Promise.resolve([{ detection: caja, landmarks: { getLeftEye: () => ojo(100), getRightEye: () => ojo(180) } }]) }; } };
      },
      tf: { ready: () => Promise.resolve(), getBackend: () => o.motor || 'webgl' }
    } };
  }
  async function conFaceapi(o, f) {
    const antes = globalThis.faceapi;
    const { anot, api } = faceapi(o);
    globalThis.faceapi = api;
    try { return await f(anot); } finally { if (antes === undefined) delete globalThis.faceapi; else globalThis.faceapi = antes; }
  }
  const cargar = () => Promise.resolve();

  test('SIN WEBGL NO SE ENCIENDE: la librería caería en silencio al procesador y congelaría la página', async () => {
    await conFaceapi({ motor: 'cpu' }, async () => {
      await assert.rejects(RV.crearDetector({ cargarScript: cargar }), /aceleración gráfica/);
    });
    await conFaceapi({ motor: 'webgl' }, async () => { await RV.crearDetector({ cargarScript: cargar }); });
    await conFaceapi({ motor: 'webgpu' }, async () => { await RV.crearDetector({ cargarScript: cargar }); });
  });

  test('si el modelo de los ojos no llega (o no está), la selfie sigue con la caja, sin ojos', async () => {
    for (const o of [{ ojosFallan: true }, { sinModeloDeOjos: true }]) {
      await conFaceapi(o, async (anot) => {
        const d = await RV.crearDetector({ cargarScript: cargar });
        await esperar();
        const cajas = await d.detectar({ width: 320, height: 400 });
        assert.equal(cajas.length, 1, 'sin el modelo de los ojos dejó de detectar la cara');
        assert.equal(cajas[0].ojos, undefined, 'sin el modelo de los ojos aparecieron ojos');
        assert.equal(anot.conOjos, 0);
      });
    }
  });

  test('la primera detección (la que compila) se hace ANTES, sobre el lienzo vacío', async () => {
    await conFaceapi({}, async (anot) => {
      await RV.crearDetector({ cargarScript: cargar, calentar: { width: 320, height: 427 } });
      assert.equal(anot.detecciones, 1, 'no calentó el detector antes de entregarlo');
    });
  });

  test('LENTO: primero se apagan los ojos, y si sigue lento, mira más chico. La foto es lo que importa', async () => {
    await conFaceapi({}, async (anot) => {
      let reloj = 0, cuesta = 600;
      const d = await RV.crearDetector({ cargarScript: cargar, ahora: () => { reloj += cuesta; return reloj; } });
      await esperar();
      assert.equal(d.info().ojos, true, 'los ojos no se encendieron');
      for (let i = 0; i < RV.ROSTRO.MUESTRAS_TIEMPO; i++) await d.detectar({ width: 320, height: 400 });
      assert.equal(d.info().ojos, false, 'con ' + cuesta + ' ms por detección siguió pagando los ojos');
      assert.ok(anot.liberadas.includes('marcas'), 'apagó los ojos y se quedó con su memoria');
      cuesta = 900;
      for (let i = 0; i < RV.ROSTRO.MUESTRAS_TIEMPO; i++) await d.detectar({ width: 320, height: 400 });
      assert.equal(d.info().entrada, RV.ROSTRO.ENTRADA_LENTA, 'con ' + cuesta + ' ms sin ojos no bajó la entrada');
      const cajas = await d.detectar({ width: 320, height: 400 });
      assert.equal(cajas.length, 1, 'lento, dejó de detectar');
      assert.equal(anot.entradas[anot.entradas.length - 1], RV.ROSTRO.ENTRADA_LENTA, 'la detección siguiente no miró más chico');
    });
  });

  test('rápido, se queda con los ojos y la entrada de siempre', async () => {
    await conFaceapi({}, async () => {
      let reloj = 0;
      const d = await RV.crearDetector({ cargarScript: cargar, ahora: () => { reloj += 60; return reloj; } });
      await esperar();
      for (let i = 0; i < 8; i++) await d.detectar({ width: 320, height: 400 });
      assert.deepEqual(d.info(), { motor: 'webgl', ojos: true, entrada: RV.ROSTRO.ENTRADA });
    });
  });
});

/* --------------------------------------------------------------------------
   4. EN LA PÁGINA: LA ZONA QUE SE VE, EL DETECTOR QUE NO VE CARAS, LA FOTO
   -------------------------------------------------------------------------- */
function conModulo(P, o) {
  o = o || {};
  P.ev(FUENTE_RV);
  P.ev('window.__cajas = ' + JSON.stringify(o.cajas || []) + ';' +
    'window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () { window.__soltado = true; } } },' +
    '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); }, getBackend: function () { return ' + JSON.stringify(o.motor || 'webgl') + '; } },' +
    '  detectAllFaces: function () { var r = window.__cajas.map(function (b) { return { box: b, score: 0.9 }; });' +
    '    return { run: function () { return Promise.resolve(r); } }; } };');
  P.ev('window.cargarScript = function () { return Promise.resolve(); };');
  P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; detenerEscaner(); };');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 400 }; }; nitidezDeCara = function () { return 25; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
}
function lienzosDeMentira(P, w, h) {
  P.ev('window.__trazos = [];' +
    'window.__ctx = new Proxy({}, { get: function (t, k) { if (k in t) return t[k];' +
    '  return function () { window.__trazos.push([k].concat([].slice.call(arguments))); return k === "createLinearGradient" ? { addColorStop: function () {} } : undefined; }; },' +
    '  set: function (t, k, v) { t[k] = v; return true; } });' +
    "$('camVideo').videoWidth = " + w + "; $('camVideo').videoHeight = " + h + ';' +
    "$('camLienzo').getContext = function () { return window.__ctx; };" +
    'ESCANER.lienzoMedir = { width: 32, height: 32, getContext: function () { return { drawImage: function () { window.__trazos.push(["medir"].concat([].slice.call(arguments, 1))); },' +
    '  getImageData: function () { var d = new Uint8ClampedArray(32 * 32 * 4); for (var i = 0; i < d.length; i++) d[i] = (i * 37) % 255; return { data: d }; } }; } };');
}

describe('4. la página', () => {

  test('la zona que se ve: 3:4 entera; 9:16 (Safari) la franja del medio; apaisado, el centro', () => {
    const P = abrirPlay();
    const z = (w, h) => JSON.parse(P.ev('JSON.stringify(zonaVisible(' + w + ', ' + h + '))'));
    assert.deepEqual(z(720, 960), { x: 0, y: 0, w: 720, h: 960 });
    assert.deepEqual(z(720, 1280), { x: 0, y: 160, w: 720, h: 960 });
    assert.deepEqual(z(1280, 720), { x: 370, y: 0, w: 540, h: 720 });
  });

  test('CON UN VIDEO 9:16 el detector, el encuadre y el óvalo miran la franja que se ve, no el cuadro entero', () => {
    const P = abrirPlay();
    lienzosDeMentira(P, 720, 1280);
    /* Lo que mira el detector: la zona, recortada del video. */
    P.ev('window.__dibujos = []; ESCANER.lienzoDetectar = { width: 0, height: 0, getContext: function () { return { drawImage: function () { window.__dibujos.push([].slice.call(arguments, 1)); } }; } };');
    const c = JSON.parse(P.ev("JSON.stringify((function () { var c = lienzoParaDetectar($('camVideo')); return { w: c.width, h: c.height }; })())"));
    assert.deepEqual(c, { w: 320, h: 427 }, 'el detector no mira la zona 3:4');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__dibujos[0])')), [0, 160, 720, 960, 0, 0, 320, 427],
      'el detector mira el cuadro entero, y la cara tenía que llenar el 38 % de lo visible en vez del 29 %');
    /* Lo que mide el encuadre: el óvalo de la zona. */
    P.ev("fotogramaGris($('camVideo'))");
    const medir = JSON.parse(P.ev('JSON.stringify(window.__trazos.filter(function (t) { return t[0] === "medir"; })[0])'));
    const rx = 720 * 0.32, ry = 960 * 0.36;
    assert.deepEqual(medir.slice(1, 5).map(n => Math.round(n)), [Math.round(360 - rx), Math.round(160 + 480 - ry), Math.round(2 * rx), Math.round(2 * ry)],
      'el encuadre mide el óvalo del cuadro entero y no el que se ve');
  });

  test('T3 — EL DETECTOR QUE NUNCA VE UNA CARA SE SUELTA: vuelve al encuadre y ofrece la cámara del celular', async () => {
    let ahora = Date.UTC(2026, 9, 22, 15, 0, 0);
    const Real = Date;
    class Reloj extends Real { constructor(...a) { if (a.length) super(...a); else super(ahora); } static now() { return ahora; } }
    const P = abrirPlay({ Date: Reloj });
    conModulo(P, { cajas: [] });
    lienzosDeMentira(P, 720, 960);
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    assert.equal(P.ev('ESCANER.modo'), 'rostro');
    P.ev("ESCANER.activo = true; $('fot_selfie').style.display = 'none';");
    for (let t = 0; t <= RV.ROSTRO.MS_SIN_CARA + 1000; t += 1000) {
      P.ev('bucleEscaner()'); await esperar();
      if (t < RV.ROSTRO.MS_SIN_CARA) assert.equal(P.ev('ESCANER.modo'), 'rostro', 'se soltó el detector antes de tiempo');
      ahora += 1000;
    }
    assert.equal(P.ev('ESCANER.modo'), 'encuadre', 'un detector que nunca ve una cara dejó a la persona esperando');
    assert.equal(P.ev('window.__soltado'), true, 'el detector se quedó con su memoria');
    assert.equal(P.ev("$('fot_selfie').style.display"), '', 'no ofreció la cámara del celular');
    assert.match(P.ev("$('selfieNota').textContent"), /no logra ver tu cara/);
  });

  test('…pero si alguna vez vio una cara, no se suelta por eso', async () => {
    let ahora = Date.UTC(2026, 9, 22, 15, 0, 0);
    const Real = Date;
    class Reloj extends Real { constructor(...a) { if (a.length) super(...a); else super(ahora); } static now() { return ahora; } }
    const P = abrirPlay({ Date: Reloj });
    conModulo(P, { cajas: [{ x: 10, y: 10, width: 40, height: 50 }] });   // una cara lejos: «Acércate»
    lienzosDeMentira(P, 720, 960);
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    P.ev('ESCANER.activo = true;');
    for (let t = 0; t <= RV.ROSTRO.MS_SIN_CARA + 2000; t += 1000) { P.ev('bucleEscaner()'); await esperar(); ahora += 1000; }
    assert.equal(P.ev('ESCANER.modo'), 'rostro');
  });

  test('sin WebGL, la página vuelve al encuadre de siempre (no se congela)', async () => {
    const P = abrirPlay();
    conModulo(P, { motor: 'cpu' });
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    assert.equal(P.ev('ESCANER.modo'), 'encuadre');
  });

  test('LA CUENTA «3·2·1» ES LA RACHA: aparece con la cara en verde y se va si se mueve', () => {
    const P = abrirPlay();
    lienzosDeMentira(P, 720, 960);
    P.ev(FUENTE_RV);
    P.ev("ESCANER.activo = true; ESCANER.modo = 'rostro'; ESCANER.detectando = true; ESCANER.detectandoDesde = Date.now(); ESCANER.vioCara = true;" +
      'ESCANER.detector = { liberar: function () {} }; ESCANER.desdeCara = Date.now();');
    const cuenta = (estables, ok) => {
      P.ev('ESCANER.estables = ' + estables + "; ESCANER.medida = { ok: " + ok + ", falla: " + (ok ? "''" : "'movimiento'") +
        ', cara: { x: 0.32, y: 0.275, w: 0.36, h: 0.45 }, ojos: null }; bucleEscaner();');
      return P.ev("$('camCuenta').textContent");
    };
    assert.equal(cuenta(1, true), '3');
    assert.equal(cuenta(2, true), '2');
    assert.equal(cuenta(3, true), '1');
    assert.equal(cuenta(0, false), '', 'con la cara movida la cuenta siguió');
  });

  test('T4 — si el lienzo no da la foto, se dice y se ofrece la cámara del celular; nunca un botón mudo', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
    P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 1280;");
    const con = (lienzo) => {
      P.ev('if (!window.__ce) window.__ce = document.createElement; document.createElement = function (t) { return t === "canvas" ? (' + lienzo + ')() : window.__ce(t); };');
      P.ev("$('selfieNota').textContent = ''; delete FOTOS.selfie;");
      return P.ev('capturarRostro()');
    };
    /* Safari sin memoria para un lienzo más: getContext da null. */
    assert.equal(con('function () { return { getContext: function () { return null; } }; }'), false);
    assert.equal(P.ev('FOTOS.selfie'), undefined);
    assert.match(P.ev("$('selfieNota').textContent"), /No pude tomar la foto con el escáner/);
    /* Un lienzo que no dibuja nada devuelve «data:,». */
    assert.equal(con('function () { return { getContext: function () { return { drawImage: function () {} }; }, toDataURL: function () { return "data:,"; } }; }'), false);
    assert.equal(P.ev('FOTOS.selfie'), undefined, 'se guardó como selfie algo que no es una foto');
    /* La que sí sale es la zona que se ve (la franja 3:4 de un video 9:16). */
    P.ev('window.__dib = null;');
    assert.equal(con('function () { return { getContext: function () { return { drawImage: function () { window.__dib = [].slice.call(arguments, 1); } }; }, toDataURL: function () { return "data:image/jpeg;base64,CARA"; } }; }'), true);
    assert.equal(P.ev('FOTOS.selfie'), 'data:image/jpeg;base64,CARA');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__dib)')), [0, 160, 720, 960, 0, 0, 540, 720],
      'la foto no es lo que la persona tenía enmarcado');
  });
});
