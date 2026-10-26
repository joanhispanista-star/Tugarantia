'use strict';
/* ==========================================================================
 * EL RESPALDO DE PIE PASA LA PUERTA — 26 de octubre de 2026 (remate)
 *
 *   node --test pruebas/el-respaldo-de-pie-pasa-la-puerta.test.js
 *
 * Lo que vio el remate de publicar-27 en Chrome sin ventana, con la cédula
 * de la demo DE PIE, nítida, quieta y bien puesta en el marco: la puerta de
 * 96 px (EC.medirTarjeta) la llamaba «borrosa» en el 100 % de los cuadros
 * (nitidez media 8,6-8,9 con video de 720 de ancho, 7,0-7,1 con 1080 y 4K,
 * contra NITIDEZ_MIN = 9). Nunca se ponía en verde, el lector nunca la
 * miraba, y a los 20 s decía «Tranquilo: si no sale, toca…». El respaldo
 * solo se tomaba con el toque: el punto 1 de Joan, sin cumplir, en su
 * iPhone. El frente sí se tomaba solo: su puerta, con la ventana, ya pedía
 * el piso chico (NITIDEZ_MIN_FRENTE) desde el 23-oct.
 *
 * Esta prueba lo habría cazado: la integración del marco de pie vio lo mismo
 * en pruebas/lectura-sin-temblor.test.js («la puerta la veía "borrosa" (8,6-9
 * contra 9)») y agrandó el código de la escena hasta que pasó. Aquí la
 * escena es la de ESE día —el código a 3 px por módulo, como el de la demo—
 * y se exige que la puerta de siempre la llame borrosa (si no, la prueba no
 * prueba el caso), que con la regla vieja NO se tome sola, y que con la de
 * hoy se tome sola y con el código leído, sin temblor y sin toque.
 *
 * La página es la de verdad (pruebas/banco-camara.js): la puerta, la
 * ventana del mejor cuadro, el lector ZXing y el giro de pie a acostado.
 * Ninguna cédula de nadie: todo es fabricado.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const F = require('./fabrica-pdf417.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');
const { VIDEO, ACOSTADO, TARJETA, escalar, abrirConCamara, dePie, acostada } = require('./banco-camara.js');

const PERSONA = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                  nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };
const CODIGO = F.fabricar(F.registroCedula(PERSONA), 20, 4);
function azarDe(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* El respaldo de las cédulas fabricadas para las letras, con el grano de una
   foto y un PDF417 LEGIBLE a 3 px por módulo del video (la receta de
   pruebas/lectura-sin-temblor.test.js antes de que la integración le
   agrandara el código), al 90 % del marco acostado. */
function respaldoEnVideo(guia) {
  const c = leerPGM(path.join(__dirname, 'cedula-ocr-reverso.pgm.gz'));
  const t = { gris: new Uint8ClampedArray(TARJETA.w * TARJETA.h), w: TARJETA.w, h: TARJETA.h };
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) t.gris[y * t.w + x] = c.gris[(TARJETA.y + y) * c.w + TARJETA.x + x];
  const azar = azarDe(9);
  for (let y = Math.round(0.07 * t.h); y < Math.round(0.54 * t.h) - 4; y += 4) for (let x = Math.round(0.725 * t.w); x < Math.round(0.945 * t.w) - 4; x += 4) {
    const v = (azar() - 0.5) * 160;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const i = (y + a) * t.w + x + b; t.gris[i] = Math.max(0, Math.min(255, t.gris[i] + v)); }
  }
  const img = escalar(t, guia.w * 0.9 / TARJETA.w);
  for (let y = Math.round(img.h * 0.66); y < Math.round(img.h * 0.985); y++)
    for (let x = Math.round(img.w * 0.02); x < Math.round(img.w * 0.98); x++) img.gris[y * img.w + x] = 222;
  const r = F.render(CODIGO, 3, 0, 4, { quieta: 4 });
  const bx = Math.round((img.w - r.W) / 2), by = Math.round(img.h * 0.95) - r.H;
  for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
    const X = bx + x; if (X >= 0 && X < img.w) img.gris[(by + y) * img.w + X] = r.lum[y * r.W + x];
  }
  /* En el video ACOSTADO, centrada en el marco acostado; dePie la pone en
     el video de verdad, que es lo que la cámara le entrega a la página. */
  const px = new Uint8ClampedArray(ACOSTADO.W * ACOSTADO.H).fill(110);
  const ox = Math.round(guia.x + (guia.w - img.w) / 2), oy = Math.round(guia.y + (guia.h - img.h) / 2);
  for (let y = 0; y < img.h; y++) {
    const Y = oy + y; if (Y < 0 || Y >= ACOSTADO.H) continue;
    for (let x = 0; x < img.w; x++) { const X = ox + x; if (X >= 0 && X < ACOSTADO.W) px[Y * ACOSTADO.W + X] = img.gris[y * img.w + x]; }
  }
  return dePie(px, ACOSTADO.W, ACOSTADO.H);
}

/* La cámara del respaldo encendida, con el marco de pie, y un testigo de lo
   que dice la puerta en cada cuadro del respaldo (sin tocar el EC del
   módulo, que comparten todas las páginas del banco). */
async function encender() {
  const E = abrirConCamara();
  const { P, correr } = E;
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  await correr(150);
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  assert.equal(guia.vertical, true, 'el marco no vino de pie: la prueba no prueba la página de hoy');
  P.ev("window.__puerta = []; EC = Object.assign({}, EC, { medirTarjeta: (function (f) { return function () {" +
       " var r = f.apply(this, arguments); if (ESCDOC.lado === 'reverso') window.__puerta.push({ nitidez: r.nitidez, falla: r.falla }); return r; }; })(EC.medirTarjeta) });");
  E.video.__px = respaldoEnVideo(acostada(guia));
  return E;
}
/* Cuadros de 100 ms con la cédula QUIETA hasta que se tome el respaldo, o `max`. */
async function esperarElRespaldo(E, max) {
  const letreros = []; let n = 0;
  for (; n < max && !E.P.ev('FOTOS.cedula_reverso'); n++) {
    await E.correr(100);
    const l = E.P.ev("$('docEstado').textContent");
    if (letreros[letreros.length - 1] !== l) letreros.push(l);
  }
  return { cuadros: n, tomada: !!E.P.ev('FOTOS.cedula_reverso'), letreros, puerta: JSON.parse(E.P.ev('JSON.stringify(window.__puerta)')) };
}
const media = l => l.reduce((a, x) => a + x.nitidez, 0) / (l.length || 1);

describe('el respaldo de pie, nítido y quieto, pasa la puerta y se toma solo', () => {

  test('CON LA REGLA VIEJA (lo del remate): la puerta lo llama «borrosa» y en 6 s no se toma', async () => {
    const E = await encender();
    /* La regla vieja: el piso chico solo para el frente. */
    E.P.ev('opcionesDeLaPuerta = function (esFrente) { return esFrente ? { nitidezMin: EC.TARJETA.NITIDEZ_MIN_FRENTE } : undefined; };');
    const r = await esperarElRespaldo(E, 60);
    assert.ok(r.puerta.length >= 30, 'la puerta casi no midió: ' + r.puerta.length);
    const m = media(r.puerta);
    assert.ok(m < EC.TARJETA.NITIDEZ_MIN && m >= EC.TARJETA.NITIDEZ_MIN_FRENTE,
      'la prueba no prueba el caso: la nitidez de la puerta da ' + m.toFixed(2) + ' (el remate midió 7-8,9 contra 9)');
    assert.ok(r.puerta.filter(x => x.falla === 'borrosa').length >= r.puerta.length * 0.9,
      'la prueba no prueba el caso: la puerta de siempre no la llamó «borrosa»: ' + JSON.stringify(r.puerta.slice(0, 5)));
    assert.equal(r.tomada, false, 'la prueba no prueba el caso: con la regla vieja el respaldo se tomó solo en ' + r.cuadros + ' cuadros');
    assert.equal(E.P.ev('ESCDOC.lecturas'), 0, 'con la puerta cerrada el lector no debía mirarla nunca');
  });

  test('CON LA DE HOY: se pone en verde, el lector lee el código y la foto se toma sola, sin toque', async () => {
    const E = await encender();
    const r = await esperarElRespaldo(E, 60);
    assert.ok(r.tomada, 'el respaldo de pie no se tomó solo en 6 s: ' + r.letreros.join(' | ') +
      ' · puerta ' + media(r.puerta).toFixed(2) + ' · ' + JSON.stringify(r.puerta.slice(-3)));
    assert.ok(r.cuadros <= 40, 'tardó ' + r.cuadros + ' cuadros');
    assert.equal(E.P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), true, 'se tomó, pero el código no se leyó');
    assert.equal(E.P.ev('FOTOS.cedula_leida.documento'), '52123456');
    assert.equal(r.letreros.some(l => /Tranquilo: si no sale/.test(l)), false, 'invitó al toque: ' + r.letreros.join(' | '));
    assert.equal(r.letreros.some(l => /Aléjala o acércala/.test(l)), false, 'pidió moverla con la cédula nítida y quieta: ' + r.letreros.join(' | '));
  });

  test('la puerta con la ventana pide el piso chico en las dos caras; sin ventana, la de siempre', () => {
    const E = abrirConCamara();
    const { P } = E;
    P.ev("ESCDOC.sinVentana = false; ESCDOC.lado = 'reverso';");
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify([opcionesDeLaPuerta(false), opcionesDeLaPuerta(true)])')),
      [{ nitidezMin: EC.TARJETA.NITIDEZ_MIN_FRENTE }, { nitidezMin: EC.TARJETA.NITIDEZ_MIN_FRENTE }]);
    P.ev('ESCDOC.sinVentana = true;');
    assert.equal(P.ev('opcionesDeLaPuerta(false) === undefined && opcionesDeLaPuerta(true) === undefined'), true,
      'sin la ventana nadie más juzga la nitidez: la puerta tiene que pedir la de siempre');
  });
});
