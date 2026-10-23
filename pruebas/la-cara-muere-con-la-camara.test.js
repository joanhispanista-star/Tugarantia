'use strict';
/* ==========================================================================
 * DÓNDE ESTABAN LA CARA Y LOS OJOS MUERE CON LA CÁMARA — 22-oct-2026
 *
 *   node --test pruebas/la-cara-muere-con-la-camara.test.js
 *
 * La política (legal/privacidad.html, «La foto de tu cara, que se toma sola»)
 * dice que lo que el programa encuentra —dónde están tu cara y tus ojos en la
 * imagen— «vive solo mientras la cámara está prendida». detenerEscaner apagaba
 * la cámara y liberarDetectorRostro borraba ESCANER.ojos, pero la última
 * medida (la caja y los doce puntos de los ojos), la caja anterior y el
 * cuadro gris del óvalo se quedaban en la memoria de la página en todas las
 * salidas sin foto («Seguir sin la foto», la cámara del celular, «Usar mi foto
 * anterior», T4), y durante los cinco pasos que siguen. No salía del teléfono,
 * pero la frase afirmaba algo que el código no hacía.
 * Las dos primeras FALLAN con c601179; la de control (la que dice «sigue»)
 * pasa con las dos.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const FUENTE_RV = fs.readFileSync(path.join(RAIZ, 'app', 'rostro-en-vivo.js'), 'utf8');
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

/* El escáner con un face-api de mentira que ve una cara con sus dos ojos. */
async function escanerQueVioUnaCara() {
  const P = abrirPlay();
  P.ev(FUENTE_RV);
  const ojo = x0 => '[0,1,2,3,4,5].map(function (i) { return { x: ' + x0 + ' + i * 4, y: 180 + (i % 3) }; })';
  P.ev('window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () {} }, faceLandmark68TinyNet: { isLoaded: true, loadFromUri: function () { return Promise.resolve(); }, dispose: function () {} } },' +
    '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); }, getBackend: function () { return "webgl"; } },' +
    '  detectAllFaces: function () { var r = [{ detection: { box: { x: 102.4, y: 110, width: 115.2, height: 180 }, score: 0.95 }, landmarks: { getLeftEye: function () { return ' + ojo(130) + '; }, getRightEye: function () { return ' + ojo(170) + '; } } }];' +
    '    return { withFaceLandmarks: function () { return this; }, run: function () { return Promise.resolve(r); } }; } };');
  P.ev('window.cargarScript = function () { return Promise.resolve(); };');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 400 }; }; nitidezDeCara = function () { return 25; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
  P.ev('iniciarEscaner()');
  for (let i = 0; i < 6; i++) await esperar();
  P.ev("detectarCara($('camVideo'), 128)");
  await esperar();
  /* Y un cuadro gris del óvalo, como el que deja el bucle. */
  P.ev('ESCANER.previa = [1, 2, 3, 4]; ESCANER.ultima = { luz: 128, centro: 900, borde: 1000, ok: false, falla: "parejo" };');
  return P;
}
const loQueQueda = P => JSON.parse(P.ev('JSON.stringify({ medida: ESCANER.medida, previaCara: ESCANER.previaCara, previa: ESCANER.previa, ultima: ESCANER.ultima, ojos: ESCANER.ojos })'));

describe('al apagar la cámara no queda dónde estaban la cara y los ojos', () => {

  test('después de detenerEscaner (lo que hacen «Seguir sin la foto», la cámara del celular y T4) no queda ni la caja ni los ojos', async () => {
    const P = await escanerQueVioUnaCara();
    const antes = loQueQueda(P);
    assert.ok(antes.medida && antes.medida.cara && antes.medida.ojos && antes.medida.ojos.length === 2,
      'el escáner de mentira no vio la cara con sus ojos: la prueba no mediría nada');
    P.ev('detenerEscaner()');
    assert.equal(P.ev('ESCANER.activo'), false);
    assert.deepEqual(loQueQueda(P), { medida: null, previaCara: null, previa: null, ultima: null, ojos: null },
      'la cámara está apagada y la página sigue sabiendo dónde estaban la cara y los ojos: la política dice que eso vive solo mientras está prendida');
  });

  test('la salida por «la cámara no prendió» (escanerSinCamara) tampoco deja nada', async () => {
    const P = await escanerQueVioUnaCara();
    P.ev('escanerSinCamara("No pude encender el escáner.")');
    assert.deepEqual(loQueQueda(P), { medida: null, previaCara: null, previa: null, ultima: null, ojos: null });
  });

  test('mientras la cámara está prendida, la medida sigue ahí para dibujar (control)', async () => {
    const P = await escanerQueVioUnaCara();
    const m = loQueQueda(P).medida;
    assert.ok(m && m.cara && m.cara.w > 0, 'con la cámara prendida no quedó la caja de la cara: el dibujo no tendría qué seguir');
  });
});
