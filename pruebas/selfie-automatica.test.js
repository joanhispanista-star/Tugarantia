'use strict';
/* ==========================================================================
 * LA SELFIE QUE SE TOMA SOLA — 8 de octubre de 2026
 *
 * Joan: «quiero que el teléfono la enfoque y que se escanee, y cuando esté
 * centrada la cara y enfocada tome la foto automáticamente, y que parezca más
 * como reconocimiento facial».
 *
 * Antes el teléfono no buscaba la cara: medía un encuadre (luz, detalle en el
 * centro, quietud). Ahora un DETECTOR (app/rostro-en-vivo.js, el modelo chico
 * de face-api que ya vivía en el sitio) dice dónde hay una cara, y la foto se
 * dispara con una sola cara, centrada, cerca, nítida y quieta.
 *
 * Tres cosas se vigilan aquí, y la tercera es la que no se puede aflojar:
 *   1. LA DECISIÓN: números que entran y salen, con caras de mentira.
 *   2. LA PÁGINA: que el detector se pida solo en el paso del rostro (que
 *      solo existe con la autorización de datos sensibles), que si no llega se
 *      vuelva al encuadre de siempre, y que una detección tardía no dispare.
 *   3. LA FRONTERA: solo el modelo del detector; nada de puntos de la cara ni
 *      vectores; la caja de la cara no se guarda ni sale del teléfono. Es lo
 *      que dice la política («La foto de tu cara, que se toma sola»).
 *
 * Lo que necesita un teléfono de verdad (WebGL, la cámara frontal, el enfoque
 * continuo, cuánto tarda el detector) no se prueba aquí: va en la lista de lo
 * que hay que probar a mano.
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RV = require('../app/rostro-en-vivo.js');
const IM = require('./imagenes-de-mentira.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const FUENTE_RV = fs.readFileSync(path.join(RAIZ, 'app', 'rostro-en-vivo.js'), 'utf8');
const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
/* Sin comentarios. El «/*» tiene que venir después de un espacio o de un
   signo: `accept="image/*"` (en el HTML de la selfie) NO abre un comentario,
   y tomarlo como tal se tragaba media página. */
const sinComentarios = t => t.replace(/(^|[\s;{}(,])\/\*[\s\S]*?\*\//g, '$1 ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

/* Una cara centrada en el óvalo, del tamaño justo (en fracciones del cuadro). */
const CENTRADA = { x: 0.32, y: 0.275, w: 0.36, h: 0.45, score: 0.9 };
const bien = (extra) => Object.assign({ luz: 128, nitidez: 30, mejorNitidez: 30, previa: { x: 0.32, y: 0.275, w: 0.36, h: 0.45 } }, extra || {});

describe('la decisión (RostroEnVivo.medirRostro)', () => {
  test('una cara centrada, cerca, nítida y quieta: se puede disparar', () => {
    const m = RV.medirRostro([CENTRADA], bien());
    assert.equal(m.ok, true, 'no disparó con todo bien: ' + m.falla);
    assert.equal(m.falla, '');
  });

  test('sin cara no dispara, y si es por la luz, lo dice', () => {
    assert.equal(RV.medirRostro([], bien()).falla, 'sin_cara');
    assert.equal(RV.medirRostro([], bien({ luz: 10 })).falla, 'poca_luz');
    assert.equal(RV.medirRostro(null, bien({ luz: 250 })).falla, 'mucha_luz');
    /* Lo que el detector no cree que sea una cara no cuenta. */
    assert.equal(RV.medirRostro([Object.assign({}, CENTRADA, { score: 0.2 })], bien()).falla, 'sin_cara');
  });

  test('lejos, cerca y a un lado: cada uno con su falla', () => {
    assert.equal(RV.medirRostro([{ x: 0.45, y: 0.43, w: 0.1, h: 0.14, score: 0.9 }], bien()).falla, 'lejos');
    assert.equal(RV.medirRostro([{ x: 0.1, y: 0.05, w: 0.8, h: 0.9, score: 0.9 }], bien()).falla, 'cerca');
    assert.equal(RV.medirRostro([Object.assign({}, CENTRADA, { x: 0.05 })], bien()).falla, 'descentrada');
    assert.equal(RV.medirRostro([Object.assign({}, CENTRADA, { y: 0.02 })], bien()).falla, 'descentrada');
  });

  test('DOS CARAS NO: la foto es de una sola persona', () => {
    const otra = { x: 0.05, y: 0.3, w: 0.3, h: 0.4, score: 0.8 };
    assert.equal(RV.medirRostro([CENTRADA, otra], bien()).falla, 'varias');
    /* Una carita chiquita al fondo (un afiche, alguien lejos) no frena a nadie. */
    const fondo = { x: 0.8, y: 0.1, w: 0.06, h: 0.08, score: 0.8 };
    assert.equal(RV.medirRostro([CENTRADA, fondo], bien()).ok, true);
  });

  test('borrosa o movida no dispara: «enfocada» es una condición, no un adorno', () => {
    assert.equal(RV.medirRostro([CENTRADA], bien({ nitidez: 1 })).falla, 'borrosa');
    assert.equal(RV.medirRostro([CENTRADA], bien({ nitidez: 15, mejorNitidez: 30 })).falla, 'borrosa',
      'disparó en un cuadro mucho menos nítido que el mejor visto');
    assert.equal(RV.medirRostro([CENTRADA], bien({ previa: null })).falla, 'movimiento', 'sin cuadro anterior no se sabe si está quieta');
    assert.equal(RV.medirRostro([CENTRADA], bien({ previa: { x: 0.2, y: 0.275, w: 0.36, h: 0.45 } })).falla, 'movimiento');
    assert.equal(RV.medirRostro([CENTRADA], bien({ previa: { x: 0.32, y: 0.275, w: 0.36, h: 0.3 } })).falla, 'movimiento',
      'acercándose rápido también es moverse');
  });

  test('LA MEDIDA SOLO TRAE NÚMEROS Y UNA CAJA: ahí no cabe nada de la cara', () => {
    /* El centinela de la frontera, como el de medirEncuadre en cuenta.test.js:
       si algún día esto devolviera puntos de la cara o un vector, sería dato
       biométrico y la política diría una cosa que el código no cumple. */
    const m = RV.medirRostro([Object.assign({ marcas: [1, 2, 3], vector: [0.1, 0.2] }, CENTRADA)], bien());
    assert.deepEqual(Object.keys(m).sort(), ['cara', 'caras', 'desvio', 'falla', 'movimiento', 'ok', 'tamano']);
    assert.deepEqual(Object.keys(m.cara).sort(), ['h', 'w', 'x', 'y'], 'la caja trae algo más que la caja');
    Object.keys(m).filter(k => k !== 'cara').forEach(k => assert.ok(['number', 'boolean', 'string'].includes(typeof m[k]), k));
  });

  test('cada falla dice QUÉ HACER, con las frases que pidió el escaneo', () => {
    ['sin_cara', 'varias', 'poca_luz', 'mucha_luz', 'lejos', 'cerca', 'descentrada', 'borrosa', 'movimiento', '']
      .forEach(f => assert.ok(RV.textoDeRostro({ falla: f }).length > 3, 'la falla «' + f + '» se quedó muda'));
    assert.match(RV.textoDeRostro({ falla: 'descentrada' }), /Centra tu cara/);
    assert.match(RV.textoDeRostro({ falla: 'lejos' }), /Acércate/);
    assert.match(RV.textoDeRostro({ falla: 'movimiento' }), /Quieto/);
    assert.ok(RV.textoDeRostro(null).length > 3);
    /* Y ninguna promete lo que no se hace: aquí no se reconoce a nadie. */
    Object.values({ a: RV.textoDeRostro({ falla: '' }), b: RV.textoDeRostro({ falla: 'sin_cara' }) })
      .forEach(t => assert.equal(/reconoc|verific|identidad/i.test(t), false, t));
  });
});

describe('la racha y la nitidez', () => {
  test('cuatro detecciones buenas seguidas disparan; una mala vuelve a cero', () => {
    let e = 0, r;
    for (let i = 0; i < RV.ROSTRO.CUADROS - 1; i++) { r = RV.contarRacha(e, { ok: true }); e = r.estables; assert.equal(r.disparar, false); }
    assert.equal(RV.contarRacha(e, { ok: false }).estables, 0, 'una detección mala no tumbó la racha');
    r = RV.contarRacha(e, { ok: true });
    assert.equal(r.disparar, true);
    assert.equal(r.avance, 1);
  });

  test('la cara nítida mide más que la desenfocada o movida, y una pared lisa da cero', () => {
    const W = 640, H = 800, g = IM.selfie(W, H);
    const recorte = (img) => {
      const L = 64, o = new Float64Array(L * L), x0 = W * 0.3, y0 = H * 0.25, w = W * 0.4, h = H * 0.5;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) o[y * L + x] = img[Math.floor(y0 + y * h / L) * W + Math.floor(x0 + x * w / L)];
      return RV.nitidezDe(o, L, L);
    };
    const nitida = recorte(g), borrosa = recorte(IM.caja(g, W, H, 4)), movida = recorte(IM.movida(g, W, H, 12, 1, 0));
    assert.ok(nitida > borrosa * 1.5, 'no distingue el desenfoque: ' + nitida + ' vs ' + borrosa);
    assert.ok(nitida > movida * 1.5, 'no distingue la foto movida: ' + nitida + ' vs ' + movida);
    /* Con poca luz una cara nítida sigue siendo nítida: la medida no es el contraste. */
    assert.ok(recorte(IM.oscurecer(g, 0.35)) > borrosa, 'con poca luz la cara nítida se lee como borrosa');
    assert.equal(RV.nitidezDe(new Float64Array(64 * 64).fill(120), 64, 64), 0);
    assert.equal(RV.nitidezDe(null, 0, 0), 0);
    assert.ok(nitida >= RV.ROSTRO.NITIDEZ_MIN, 'la vara mínima deja afuera una cara nítida');
  });

  test('la mejor nitidez se desinfla: un destello no deja la vara imposible', () => {
    let m = RV.mejorNitidez(0, 100);
    for (let i = 0; i < 40; i++) m = RV.mejorNitidez(m, 30);
    assert.ok(m < 100 * 0.4, 'la vara sigue en el destello: ' + m);
    assert.ok(30 >= RV.ROSTRO.NITIDEZ_RELATIVA * m, 'una cara normal ya no alcanza la vara');
  });
});

describe('el detector: SOLO el detector', () => {
  function faceapiDeMentira(anotado, o) {
    const red = n => ({ isLoaded: false, loadFromUri(u) { anotado.modelos.push(n + '@' + u); this.isLoaded = true; return Promise.resolve(); },
      dispose() { anotado.liberadas.push(n); } });
    return {
      nets: { tinyFaceDetector: red('detector'), faceLandmark68TinyNet: red('marcas'), faceRecognitionNet: red('vector') },
      TinyFaceDetectorOptions: function (op) { anotado.opciones = op; },
      detectAllFaces() {
        return { run: () => Promise.resolve((o && o.caras) || [{ box: { x: 80, y: 100, width: 160, height: 200 }, score: 0.9,
          landmarks: [[1, 2]], descriptor: [0.1, 0.2] }]) };
      },
      tf: { ready: () => Promise.resolve() }
    };
  }

  test('baja face-api y UN SOLO MODELO, del propio sitio', async () => {
    const anotado = { modelos: [], liberadas: [], cargas: [] };
    const antes = globalThis.faceapi;
    globalThis.faceapi = faceapiDeMentira(anotado);
    try {
      const d = await RV.crearDetector({ cargarScript: u => { anotado.cargas.push(u); return Promise.resolve(); }, base: '../app/lib/rostro/' });
      assert.deepEqual(anotado.cargas, ['../app/lib/rostro/face-api.js']);
      assert.deepEqual(anotado.modelos, ['detector@../app/lib/rostro'],
        'el teléfono pidió otro modelo además del detector: eso ya sería medir la cara');
      assert.equal(anotado.opciones.inputSize, RV.ROSTRO.ENTRADA);
      const cajas = await d.detectar({ width: 320, height: 400 });
      assert.deepEqual(cajas, [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5, score: 0.9 }],
        'lo que sale del detector trae algo más que la caja y el puntaje');
      d.liberar();
      assert.deepEqual(anotado.liberadas, ['detector']);
      assert.deepEqual(await d.detectar({ width: 320, height: 400 }), [], 'después de soltarlo siguió detectando');
    } finally { if (antes === undefined) delete globalThis.faceapi; else globalThis.faceapi = antes; }
  });

  test('si face-api no llega o no trae el detector, falla DICIÉNDOLO (y la página vuelve al encuadre)', async () => {
    const antes = globalThis.faceapi;
    delete globalThis.faceapi;
    try {
      await assert.rejects(RV.crearDetector({ cargarScript: () => Promise.resolve(), base: 'x' }), /no cargó el detector/);
      await assert.rejects(RV.crearDetector({ cargarScript: () => Promise.reject(new Error('sin red')), base: 'x' }), /sin red/);
      await assert.rejects(RV.crearDetector({}), /cargarScript/);
    } finally { if (antes !== undefined) globalThis.faceapi = antes; }
  });

  test('LA FRONTERA EN EL CÓDIGO: ni puntos de la cara, ni vectores, ni nada que salga', () => {
    const t = sinComentarios(FUENTE_RV);
    ['withFaceLandmarks', 'withFaceDescriptor', 'faceRecognitionNet', 'faceLandmark68', 'computeFaceDescriptor',
     'FaceMesh', 'descriptor', 'embedding', 'landmark', 'faceExpression', 'ageGender']
      .forEach(p => assert.equal(t.toLowerCase().indexOf(p.toLowerCase()), -1, 'apareció «' + p + '» en el detector del teléfono'));
    ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'http://', 'https://']
      .forEach(p => assert.equal(t.indexOf(p), -1, 'el detector del teléfono usa «' + p + '»: lo que mira no puede salir ni quedarse'));
    const redes = [...t.matchAll(/nets\.([A-Za-z0-9]+)/g)].map(m => m[1]);
    assert.ok(redes.length > 0);
    assert.deepEqual([...new Set(redes)], ['tinyFaceDetector'], 'se pidió otra red: ' + redes.join(', '));
  });

  test('play/ no nombra la librería: todo pasa por el módulo', () => {
    /* La regla vieja de la casa sigue en pie: play/ no menciona nada de lo que
       sería biometría (cuenta.test.js y cumplimiento.test.js). El detector
       entra por app/rostro-en-vivo.js, que esta misma prueba vigila arriba. */
    ['faceapi', 'FaceMesh', 'descriptor', 'embedding', 'faceDescriptor', 'landmark']
      .forEach(p => assert.equal(PLAY.indexOf(p), -1, 'apareció «' + p + '» en play/'));
    assert.match(PLAY, /var URL_ROSTRO_VIVO = '\.\.\/app\/rostro-en-vivo\.js';/);
    assert.match(PLAY, /var BASE_ROSTRO = '\.\.\/app\/lib\/rostro';/, 'el detector tiene que bajar del propio sitio');
  });
});

/* --------------------------------------------------------------------------
   DENTRO DE LA PÁGINA
   -------------------------------------------------------------------------- */
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));
function conModulo(P, o) {
  o = o || {};
  P.ev(FUENTE_RV);
  /* Un face-api de mentira dentro de la página: cajas en píxeles del lienzo
     que se le pasa (320×400). Con `o.diferido`, la detección no contesta
     hasta que la prueba lo diga. */
  P.ev('window.__cajas = ' + JSON.stringify(o.cajas || [{ x: 102.4, y: 110, width: 115.2, height: 180 }]) + ';' +
    'window.__pendientes = [];' +
    'window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () { window.__soltado = true; } } },' +
    '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); } },' +
    '  detectAllFaces: function () { var r = window.__cajas.map(function (b) { return { box: b, score: 0.9 }; });' +
    (o.diferido
      ? '    return { run: function () { return new Promise(function (res) { window.__pendientes.push(function () { res(r); }); }); } }; } };'
      : '    return { run: function () { return Promise.resolve(r); } }; } };'));
  P.ev('window.__cargas = []; window.cargarScript = function (u) { window.__cargas.push(u); return ' +
    (o.sinRed ? 'Promise.reject(new Error("sin red"))' : 'Promise.resolve()') + '; };');
  P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; detenerEscaner(); };');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 400 }; }; nitidezDeCara = function () { return 25; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
}

describe('la selfie dentro de la página', () => {
  test('sin la autorización de datos sensibles, el paso no enciende cámara ni detector', () => {
    const P = abrirPlay();
    P.ev('FOTOS = { sensibles: false };');
    assert.equal(/camVideo/.test(P.ev('pasoRostro()')), false, 'sin autorización se pintó el escáner');
    assert.match(PLAY, /p\.id === 'rostro' && FOTOS\.sensibles && !hayFotoLista\('selfie'\)\) setTimeout\(iniciarEscaner/,
      'el escáner del rostro dejó de depender de la autorización');
    /* El detector solo se pide desde iniciarEscaner. */
    const t = sinComentarios(PLAY);
    const usos = [...t.matchAll(/(?<!function )prepararDetectorRostro\(\)/g)].length;
    assert.equal(usos, 1, 'prepararDetectorRostro se llama desde más de un lugar');
    const i = t.indexOf('function iniciarEscaner()');
    assert.ok(t.slice(i, t.indexOf('\nfunction ', i + 1)).indexOf('prepararDetectorRostro()') > 0);
    /* Se EJECUTA desde un solo lugar (prepararDetectorRostro); bajarlo sin
       ejecutarlo (precalentarDetectorRostro) es aparte y se prueba abajo. */
    assert.equal([...t.matchAll(/cargarScript\(URL_ROSTRO_VIVO\)/g)].length, 1, 'el módulo se ejecuta desde otro lado');
    assert.equal([...t.matchAll(/URL_ROSTRO_VIVO/g)].length, 4, 'apareció otro uso del módulo: revisa que no corra antes del paso del rostro');
  });

  test('se BAJA antes, con la cédula, y solo con la autorización — sin encender nada', () => {
    const anota = P => P.ev('window.__links = []; document.createElement = function (t) { var e = { tag: t }; return e; };' +
      'document.head.appendChild = function (e) { if (e.tag === "link") window.__links.push(e.rel + " " + e.href); };');
    const sin = abrirPlay();
    sin.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: false }; guardarFotos();");
    anota(sin);
    sin.ev('precalentarDetectorRostro(); cambiarConsentimiento(false);');
    assert.deepEqual(JSON.parse(sin.ev('JSON.stringify(window.__links)')), [], 'se bajó el detector sin la autorización de fotos');
    assert.match(PLAY, /if \(p\.id === 'documento' && FOTOS\.sensibles\) precalentarDetectorRostro\(\);/,
      'el paso de la cédula dejó de bajar el detector solo con la autorización');
    const con = abrirPlay();
    con.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: false }; guardarFotos();");
    anota(con);
    con.ev('cambiarConsentimiento(true); cambiarConsentimiento(true);');
    const links = JSON.parse(con.ev('JSON.stringify(window.__links)'));
    assert.deepEqual(links, ['prefetch ../app/rostro-en-vivo.js', 'prefetch ../app/lib/rostro/face-api.js',
      'prefetch ../app/lib/rostro/tiny_face_detector_model-weights_manifest.json', 'prefetch ../app/lib/rostro/tiny_face_detector_model.bin'],
      'no se bajó (una sola vez) lo que el detector necesita, o se bajó algo más');
    assert.equal(con.ev('typeof window.faceapi'), 'undefined', 'bajarlo no es encenderlo');
  });

  test('al encender la cámara se pide el módulo, y con él la selfie busca la cara', async () => {
    const P = abrirPlay();
    conModulo(P);
    P.ev('iniciarEscaner()');
    assert.equal(P.ev('ESCANER.modo'), 'cargando');
    await esperar(); await esperar();
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__cargas)')), ['../app/rostro-en-vivo.js', '../app/lib/rostro/face-api.js']);
    assert.equal(P.ev('ESCANER.modo'), 'rostro', 'el detector llegó y no se usa');
  });

  test('una cara centrada y quieta dispara sola; antes no', async () => {
    const P = abrirPlay();
    conModulo(P);
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    for (let i = 0; i < RV.ROSTRO.CUADROS; i++) {
      P.ev("detectarCara($('camVideo'), 128)"); await esperar();
      assert.equal(P.ev('window.__disparo'), 0, 'disparó en la detección ' + (i + 1) + ': la primera no sabe si está quieta');
    }
    P.ev("detectarCara($('camVideo'), 128)"); await esperar();
    assert.equal(P.ev('window.__disparo'), 1, 'con la cara centrada y quieta no disparó');
    assert.equal(P.ev('window.__soltado'), true, 'tomada la foto, el detector se quedó con su memoria');
    /* LO QUE MIRÓ NO QUEDÓ EN NINGÚN LADO. */
    const guardado = JSON.stringify(P.almacen) + JSON.stringify(P.sesion);
    assert.equal(/"score"|115\.2|0\.275|"cara"/.test(guardado), false, 'la caja de la cara quedó guardada en el teléfono');
    assert.equal(/cara|score/.test(P.ev('JSON.stringify(FOTOS)')), false, 'la caja de la cara viaja con las fotos');
  });

  test('dos caras no disparan nunca', async () => {
    const P = abrirPlay();
    conModulo(P, { cajas: [{ x: 102.4, y: 110, width: 115.2, height: 180 }, { x: 10, y: 120, width: 100, height: 160 }] });
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    for (let i = 0; i < 8; i++) { P.ev("detectarCara($('camVideo'), 128)"); await esperar(); }
    assert.equal(P.ev('window.__disparo'), 0);
    assert.equal(P.ev('ESCANER.medida.falla'), 'varias');
  });

  test('la detección que llega tarde (después de cambiar de paso o de «Repetir») no dispara', async () => {
    const P = abrirPlay();
    conModulo(P, { diferido: true });
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    P.ev('ESCANER.estables = 3; ESCANER.previaCara = { x: 0.32, y: 0.275, w: 0.36, h: 0.45 };');
    P.ev("detectarCara($('camVideo'), 128)");
    P.ev('detenerEscaner()');
    P.ev('window.__pendientes.forEach(function (f) { f(); })'); await esperar();
    assert.equal(P.ev('window.__disparo'), 0, 'una detección de un escáner ya apagado tomó la foto');
  });

  test('SIN SEÑAL PARA EL DETECTOR: vuelve al encuadre de siempre, no se atasca', async () => {
    const P = abrirPlay();
    conModulo(P, { sinRed: true });
    P.ev('iniciarEscaner()');
    await esperar(); await esperar();
    assert.equal(P.ev('ESCANER.modo'), 'encuadre', 'sin detector la persona se queda en «Preparando…» para siempre');
  });

  test('si llega cuando ya no hace falta, se suelta', async () => {
    const P = abrirPlay();
    conModulo(P);
    P.ev('iniciarEscaner(); detenerEscaner();');
    await esperar(); await esperar();
    assert.equal(P.ev('window.__soltado'), true, 'el detector se quedó cargado sin nadie que lo use');
    assert.equal(P.ev('ESCANER.detector'), null);
  });
});

describe('el bucle y el dibujo', () => {
  /* Un lienzo 2D de mentira que anota qué se dibuja. */
  function conLienzos(P) {
    P.ev('window.__trazos = [];' +
      'window.__ctx = new Proxy({}, { get: function (t, k) { if (k in t) return t[k];' +
      '  return function () { window.__trazos.push(k); return k === "createLinearGradient" ? { addColorStop: function () {} } : undefined; }; },' +
      '  set: function (t, k, v) { t[k] = v; return true; } });' +
      "$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;" +
      "$('camLienzo').getContext = function () { return window.__ctx; };" +
      'ESCANER.lienzoMedir = { width: 32, height: 32, getContext: function () { return { drawImage: function () {},' +
      '  getImageData: function () { var d = new Uint8ClampedArray(32 * 32 * 4); for (var i = 0; i < d.length; i++) d[i] = (i * 37) % 255; return { data: d }; } }; } };');
  }
  const trazos = P => JSON.parse(P.ev('JSON.stringify(window.__trazos.splice(0))'));

  test('mientras baja el detector no dispara por encuadre, y lo dice', () => {
    const P = abrirPlay();
    conLienzos(P);
    P.ev('U = Object.assign({}, U, { medirEncuadre: function () { return { ok: true, luz: 128, falla: "" }; } });');
    P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; };');
    P.ev("ESCANER.activo = true; ESCANER.modo = 'cargando'; ESCANER.desdeCarga = Date.now(); ESCANER.estables = 99;");
    P.ev('bucleEscaner()');
    assert.equal(P.ev('window.__disparo'), 0, 'disparó por encuadre antes de que el detector pudiera mirar');
    assert.equal(P.ev("$('camEstado').textContent"), 'Preparando el escáner…');
  });

  test('sin detector, el encuadre de siempre sigue disparando', () => {
    const P = abrirPlay();
    conLienzos(P);
    P.ev('U = Object.assign({}, U, { medirEncuadre: function () { return { ok: true, luz: 128, falla: "" }; } });');
    P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; };');
    P.ev("ESCANER.activo = true; ESCANER.modo = 'encuadre'; ESCANER.estables = U.ENCUADRE.CUADROS - 1;");
    P.ev('bucleEscaner()');
    assert.equal(P.ev('window.__disparo'), 1);
  });

  test('con el detector, el encuadre ya no decide, y el texto es el de la cara', () => {
    const P = abrirPlay();
    conLienzos(P);
    P.ev(FUENTE_RV);
    P.ev('U = Object.assign({}, U, { medirEncuadre: function () { return { ok: true, luz: 128, falla: "" }; } });');
    P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; };');
    P.ev("ESCANER.activo = true; ESCANER.modo = 'rostro'; ESCANER.detectando = true; ESCANER.detectandoDesde = Date.now(); ESCANER.detector = { liberar: function () {} };" +
      "ESCANER.estables = 99; ESCANER.medida = { ok: false, falla: 'lejos', cara: { x: 0.45, y: 0.43, w: 0.1, h: 0.14 } };");
    P.ev('bucleEscaner()');
    assert.equal(P.ev('window.__disparo'), 0, 'el encuadre disparó por encima del detector');
    assert.equal(P.ev("$('camEstado').textContent"), 'Acércate un poco');
    const t = trazos(P);
    assert.ok(t.includes('rect') && t.includes('clip'), 'no se dibujó la caja que sigue la cara');
  });

  test('una detección que no contesta no deja el escáner mudo: vuelve al encuadre', () => {
    const P = abrirPlay();
    conLienzos(P);
    P.ev(FUENTE_RV);
    P.ev('window.__soltado = false;');
    P.ev("ESCANER.activo = true; ESCANER.modo = 'rostro'; ESCANER.detectando = true; ESCANER.detectandoDesde = Date.now() - 7000;" +
      'ESCANER.detector = { liberar: function () { window.__soltado = true; } };');
    P.ev('bucleEscaner()');
    assert.equal(P.ev('ESCANER.modo'), 'encuadre', 'una detección colgada dejó el escáner esperando para siempre');
    assert.equal(P.ev('window.__soltado'), true);
  });

  test('el dibujo: la caja solo con una cara de verdad, sin anillos de ojos, y quieto si el sistema lo pide', () => {
    const P = abrirPlay();
    conLienzos(P);
    P.ev('dibujarMarco(window.__ctx, 720, 960, 1, false, 0, { cara: null })');
    let t = trazos(P);
    assert.equal(t.includes('rect'), false, 'se pintó una cara sin detección: sobre una pared vacía no hay cara');
    P.ev('dibujarMarco(window.__ctx, 720, 960, 1, true, 0.5, { cara: { x: 0.32, y: 0.275, w: 0.36, h: 0.45 }, conCara: true })');
    t = trazos(P);
    assert.ok(t.includes('rect'));
    assert.ok(t.includes('createLinearGradient'), 'no barre la cara');
    assert.equal(t.includes('arc'), false, 'volvieron los anillos de los ojos: parecen una medida que no se hace');
    P.ev('MOVIMIENTO_REDUCIDO = true;');
    P.ev('dibujarMarco(window.__ctx, 720, 960, 1, true, 0.5, { cara: { x: 0.32, y: 0.275, w: 0.36, h: 0.45 }, conCara: true })');
    t = trazos(P);
    assert.equal(t.includes('createLinearGradient'), false, 'con movimiento reducido la línea sigue barriendo');
    assert.ok(t.includes('ellipse'), 'con movimiento reducido se fue también el arco de la racha, que es lo que informa');
  });

  test('el texto de la pantalla no promete reconocer a nadie', () => {
    const t = sinComentarios(PLAY);
    const i = t.indexOf('function pasoRostro'), f = t.indexOf('function repetirRostro');
    const paso = t.slice(i, f);
    assert.match(paso, /la foto se toma sola/);
    assert.equal(/reconoc|verific|identidad confirmada|Rostro registrado/i.test(paso), false,
      'el paso del rostro promete algo que no se hace');
  });
});
