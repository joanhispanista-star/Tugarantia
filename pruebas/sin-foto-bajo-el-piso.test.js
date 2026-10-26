'use strict';
/* ==========================================================================
 * SIN FOTO Y POR DEBAJO DEL PISO DE SIEMPRE — 26 de octubre de 2026 (los
 * graves del remate)
 *
 *   node --test pruebas/sin-foto-bajo-el-piso.test.js
 *
 * 4be5d64 le dio al respaldo, con la ventana del mejor cuadro, el piso chico
 * de la puerta (NITIDEZ_MIN_FRENTE): la cédula de pie, nítida y quieta, daba
 * 7-8,9 contra 9 y nunca se ponía en verde (pruebas/el-respaldo-de-pie-pasa-
 * la-puerta.test.js). Pero la puerta abierta deja pasar también lo que la de
 * siempre llamaba «borrosa», y dos refutadores lo vieron en Chrome sin
 * ventana, en iPhone y en Android:
 *   · la amarilla con el PDF417 GASTADO (las barras se ven en la pantalla;
 *     el lector no las encuentra, ni su patrón, ni su franja) y
 *   · el respaldo puesto ACOSTADO dentro del marco de pie (ZXing no lee a 90°)
 * cerraban cada ventana en 'sin_codigo' y oían «No vemos código en ese lado:
 * si es el frente, voltéala» los 30 s, con el código a la vista; el
 * «Tranquilo: si no sale, toca…» de los 20 s no salía nunca (el letrero lo
 * calla en verde), y a los 12 s salía la nota de la cédula NUEVA, gris,
 * falsa para una amarilla. El respaldo desenfocado entero, lo mismo con
 * «Aléjala un poco…». Con la puerta de siempre (72e595e) esas tarjetas
 * decían «Aléjala o acércala…» y a los 20 s «Tranquilo…», sin nota.
 *
 * Aquí: la página de verdad (pruebas/banco-camara.js) delante de cada una,
 * 21 s de cuadros. Se exige que la escena sea la del caso (la puerta entre
 * los dos pisos, nada del código visto, el lector mirando), que no se diga
 * «voltéala», que a los 20 s vuelva «Tranquilo…» y que la nota de la cédula
 * nueva no salga. Y el control: un FRENTE puesto en el paso del respaldo, por
 * encima del piso de siempre, sigue oyendo «… si es el frente, voltéala».
 * Ninguna cédula de nadie: todo es fabricado.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const ECAP = require('../app/escaner-captura.js');
const F = require('./fabrica-pdf417.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');
const { ACOSTADO, TARJETA, escalar, abrirConCamara, dePie, acostada, ponerCarta } = require('./banco-camara.js');

const PERSONA = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                  nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };
const CODIGO = F.fabricar(F.registroCedula(PERSONA), 20, 4);
const TRANQUILO = 'Tranquilo: si no sale, toca «Tomar la foto ahora»';
function azarDe(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* Desenfoque de caja (tres pasadas, casi gaussiano) sobre un rectángulo. */
function borronCaja(img, x0, y0, x1, y1, rad, pasadas) {
  for (let p = 0; p < pasadas; p++) {
    const o = Uint8ClampedArray.from(img.gris);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let s = 0, n = 0;
      for (let b = -rad; b <= rad; b++) for (let a = -rad; a <= rad; a++) {
        const X = x + a, Y = y + b; if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;
        s += o[Y * img.w + X]; n++;
      }
      img.gris[y * img.w + x] = s / n;
    }
  }
}
/* El respaldo de la escena de pruebas/el-respaldo-de-pie-pasa-la-puerta.test.js
   (las cédulas fabricadas para las letras, el grano de una foto y un PDF417
   legible a 3 px por módulo), a `ancho` px. `codigo`: el radio del borrón de
   la franja del código (la amarilla gastada); `toda`: el de la tarjeta entera
   (el enfoque que no engancha). */
function respaldo(ancho, o) {
  const x = o || {};
  const c = leerPGM(path.join(__dirname, 'cedula-ocr-reverso.pgm.gz'));
  const t = { gris: new Uint8ClampedArray(TARJETA.w * TARJETA.h), w: TARJETA.w, h: TARJETA.h };
  for (let y = 0; y < t.h; y++) for (let xx = 0; xx < t.w; xx++) t.gris[y * t.w + xx] = c.gris[(TARJETA.y + y) * c.w + TARJETA.x + xx];
  const azar = azarDe(9);
  for (let y = Math.round(0.07 * t.h); y < Math.round(0.54 * t.h) - 4; y += 4) for (let xx = Math.round(0.725 * t.w); xx < Math.round(0.945 * t.w) - 4; xx += 4) {
    const v = (azar() - 0.5) * 160;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const i = (y + a) * t.w + xx + b; t.gris[i] = Math.max(0, Math.min(255, t.gris[i] + v)); }
  }
  const img = escalar(t, ancho / TARJETA.w);
  for (let y = Math.round(img.h * 0.66); y < Math.round(img.h * 0.985); y++)
    for (let xx = Math.round(img.w * 0.02); xx < Math.round(img.w * 0.98); xx++) img.gris[y * img.w + xx] = 222;
  const r = F.render(CODIGO, 3, 0, 4, { quieta: 4 });
  const bx = Math.round((img.w - r.W) / 2), by = Math.round(img.h * 0.95) - r.H;
  for (let y = 0; y < r.H; y++) for (let xx = 0; xx < r.W; xx++) {
    const X = bx + xx; if (X >= 0 && X < img.w) img.gris[(by + y) * img.w + X] = r.lum[y * r.W + xx];
  }
  if (x.codigo) borronCaja(img, Math.max(0, bx - 8), Math.max(0, by - 8), Math.min(img.w, bx + r.W + 8), Math.min(img.h, by + r.H + 8), x.codigo, 3);
  if (x.toda) borronCaja(img, 0, 0, img.w, img.h, x.toda, 2);
  return img;
}
/* La tarjeta centrada en el marco del video ACOSTADO; dePie la pone en el
   video de verdad, que es lo que la cámara le entrega a la página. */
function enElMarco(guiaA, img) {
  const px = new Uint8ClampedArray(ACOSTADO.W * ACOSTADO.H).fill(110);
  const ox = Math.round(guiaA.x + (guiaA.w - img.w) / 2), oy = Math.round(guiaA.y + (guiaA.h - img.h) / 2);
  for (let y = 0; y < img.h; y++) {
    const Y = oy + y; if (Y < 0 || Y >= ACOSTADO.H) continue;
    for (let x = 0; x < img.w; x++) { const X = ox + x; if (X >= 0 && X < ACOSTADO.W) px[Y * ACOSTADO.W + X] = img.gris[y * img.w + x]; }
  }
  return dePie(px, ACOSTADO.W, ACOSTADO.H);
}
function girar90(img) {
  const o = new Uint8ClampedArray(img.w * img.h), W = img.h, H = img.w;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = img.gris[(img.h - 1 - x) * img.w + y];
  return { gris: o, w: W, h: H };
}
const ESCENAS = {
  gastado: g => enElMarco(acostada(g), respaldo(acostada(g).w * 0.9, { codigo: 6 })),
  /* Acostada en el video de pie llena el ANCHO del marco de pie, que en el
     video acostado es el ALTO del marco acostado; y sale girada 90°. */
  acostada: g => enElMarco(acostada(g), girar90(respaldo(acostada(g).h * 0.9))),
  desenfocada: g => enElMarco(acostada(g), respaldo(acostada(g).w * 0.9, { toda: 6 })),
  frente: g => ponerCarta(g, leerPGM(path.join(__dirname, 'cedula-ocr-frente.pgm.gz')))
};

/* El paso del respaldo con la escena delante, `cuadros` de 100 ms, y un
   testigo de lo que mide la puerta (sin tocar el EC del módulo, que
   comparten todas las páginas del banco). */
async function elRespaldoCon(escena, cuadros) {
  const E = abrirConCamara();
  const { P, correr } = E;
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  await correr(150);
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  assert.equal(guia.vertical, true, 'el marco no vino de pie: la prueba no prueba la página de hoy');
  P.ev("window.__puerta = []; EC = Object.assign({}, EC, { medirTarjeta: (function (f) { return function () {" +
       " var r = f.apply(this, arguments); if (ESCDOC.lado === 'reverso') window.__puerta.push(r.nitidez); return r; }; })(EC.medirTarjeta) });");
  E.video.__px = ESCENAS[escena](guia);
  const letreros = []; let nota = false;
  for (let n = 0; n < cuadros && !P.ev('FOTOS.cedula_reverso'); n++) {
    await correr(100);
    letreros.push({ s: (n + 1) / 10, l: P.ev("$('docEstado').textContent") });
    if (/gris y de plástico/.test(P.ev("$('docNota').textContent") || '')) nota = true;
  }
  const puerta = JSON.parse(P.ev('JSON.stringify(window.__puerta)'));
  return { P, letreros, nota, tomada: !!P.ev('FOTOS.cedula_reverso'),
           puerta: puerta.reduce((a, x) => a + x, 0) / (puerta.length || 1),
           antes: s => letreros.filter(x => x.s <= s).map(x => x.l), despues: s => letreros.filter(x => x.s > s).map(x => x.l) };
}
/* Que la escena sea la del caso: la puerta entre los dos pisos (la de
   siempre la llamaba «borrosa», la chica la deja pasar), nada del código
   visto, y el lector mirando (con el piso chico lee cada ventana: eso era lo
   que hacía salir la nota de la cédula nueva). */
function esElCaso(r, quien) {
  assert.ok(r.puerta >= EC.TARJETA.NITIDEZ_MIN_FRENTE && r.puerta < EC.TARJETA.NITIDEZ_MIN,
    'la prueba no prueba el caso (' + quien + '): la puerta da ' + r.puerta.toFixed(2));
  assert.equal(r.P.ev('ESCDOC.vioCodigo || ESCDOC.vioFranja || ESCDOC.vioBarras || ESCDOC.vioQr'), false,
    'la prueba no prueba el caso (' + quien + '): algo del código se vio');
  assert.ok(r.P.ev('ESCDOC.lecturas') > 6, 'el lector no la miró (' + quien + '): el piso chico ya no la deja pasar');
  assert.equal(r.tomada, false, 'la prueba no prueba el caso (' + quien + '): se tomó sola');
}

describe('el respaldo que no se toma solo y está por debajo del piso de siempre', () => {

  for (const [escena, quien, texto] of [
    ['gastado', 'la amarilla con el código gastado', EC.textoDeTarjeta({ falla: 'borrosa' })],
    ['acostada', 'el respaldo acostado en el marco de pie', EC.textoDeTarjeta({ falla: 'borrosa' })],
    ['desenfocada', 'el respaldo desenfocado entero', ECAP.TEXTO.ALEJALA]
  ]) {
    test(quien + ': no dice «voltéala», a los 20 s vuelve «Tranquilo…» y no sale la nota de la cédula nueva', async () => {
      const r = await elRespaldoCon(escena, 210);
      esElCaso(r, quien);
      assert.equal(r.letreros.some(x => /voltéala/.test(x.l)), false,
        'le dijo que no hay código, con el código a la vista: ' + [...new Set(r.letreros.map(x => x.l))].join(' | '));
      assert.ok(r.antes(20).includes(texto), 'antes de los 20 s no dijo «' + texto + '»: ' + [...new Set(r.antes(20))].join(' | '));
      assert.ok(r.despues(20.5).length > 0 && r.despues(20.5).every(l => l === TRANQUILO),
        'a los 20 s no invitó a «Tomar la foto ahora»: ' + [...new Set(r.despues(20))].join(' | '));
      assert.equal(r.nota, false, 'le dijo «¿Tu cédula es la nueva, gris y de plástico?» a una amarilla');
    });
  }

  test('el control: un FRENTE en el paso del respaldo, por encima del piso de siempre, sigue oyendo «… si es el frente, voltéala»', async () => {
    const r = await elRespaldoCon('frente', 30);
    assert.ok(r.puerta >= EC.TARJETA.NITIDEZ_MIN, 'la prueba no prueba el control: la puerta da ' + r.puerta.toFixed(2));
    assert.equal(r.tomada, false, 'el frente se tomó como respaldo');
    assert.ok(r.letreros.some(x => x.l === ECAP.TEXTO.SIN_CODIGO),
      'el frente bien enfocado ya no oye «voltéala»: ' + [...new Set(r.letreros.map(x => x.l))].join(' | '));
  });
});
