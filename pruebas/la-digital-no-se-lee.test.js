'use strict';
/* ==========================================================================
 * LA CÉDULA DIGITAL NO PASA POR LAS LETRAS DE LA AMARILLA — 21 de octubre de
 * 2026 (verificación del lote 1, R1: hallazgos 1 y 6, la misma raíz)
 *
 *   node --test pruebas/la-digital-no-se-lee.test.js
 *
 * Las franjas de las letras (app/ocr-cedula.js) son las de la cédula
 * amarilla. En la DIGITAL el RH, el sexo y la estatura van en el frente, justo
 * donde cae el bloque que se lee (Ley 1581: el RH es un dato de salud), y el
 * rótulo va encima del valor: los apellidos caían en «nombres» con la marca
 * «leído de tu cédula · revísalo». La única defensa era una marca en la
 * memoria que solo se ponía con un QR leído en vivo. Dos caminos sin ella,
 * los dos reproducidos por la verificación con ZXing y Tesseract de verdad:
 *   (a) la pestaña se RELANZA entre el respaldo (por el QR) y el frente;
 *   (b) el teléfono no lee el QR y la persona toca «Tomar la foto ahora»,
 *       que es lo que TEXTO_CEDULA_NUEVA le pide; y además le decía «te
 *       llenamos lo que alcancemos a leer», contradiciendo esa nota.
 *
 * La regla de hoy, al revés: se lee SOLO con prueba POSITIVA de la amarilla
 * (su PDF417 leído, visto sin leer o su patrón, en el recorte que se guarda),
 * anotada CON LA FOTO (FOTOS.cedula_reverso_tipo): sobrevive a relanzar y se
 * va con ella.
 *
 * Aquí corre play/ de verdad con su escáner y ZXing de verdad
 * (pruebas/banco-camara.js), delante de una cédula digital fabricada: un QR
 * de verdad (el QRCodeWriter del propio ZXing) y la zona de lectura mecánica.
 * No hace falta el motor de las letras: lo que se prueba es que NO se les da
 * nada que recortar. Ninguna cédula de nadie: todo es inventado.
 *
 * Todas FALLAN con 49dc0c3.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const F = require('./fabrica-pdf417.js');
const { leerPGM } = require('./banco-ocr.js');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');
const { TARJETA, ponerCarta, abrirConCamara } = require('./banco-camara.js');

/* ==========================================================================
 * LA DIGITAL FABRICADA, en la geometría de las cédulas de las letras
 * (1120 × 708, la tarjeta en TARJETA): el QR a la izquierda —su contenido de
 * verdad es biometría cifrada; aquí, relleno— y tres renglones de la zona de
 * lectura mecánica abajo. Sin PDF417. `qrBorroso`: el reflejo o el desenfoque
 * con que un teléfono no lo lee.
 * ======================================================================== */
function atrasDigital(o) {
  o = o || {};
  const W = 1120, H = 708, T = TARJETA;
  const g = new Uint8ClampedArray(W * H).fill(70);
  for (let y = T.y; y < T.y + T.h; y++) for (let x = T.x; x < T.x + T.w; x++) g[y * W + x] = 214;
  const pista = new Map(); pista.set(F.Z.EncodeHintType.MARGIN, 0);
  const qr = new F.Z.QRCodeWriter().encode('CIFRADO:' + 'Q7xK2mP9'.repeat(18), F.Z.BarcodeFormat.QR_CODE, 0, 0, pista);
  const n = qr.getWidth(), mod = Math.max(2, Math.round(T.w * 0.30 / n));
  const ox = T.x + Math.round(T.w * 0.05), oy = T.y + Math.round(T.h * 0.10);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.get(x, y)) {
    for (let a = 0; a < mod; a++) for (let b = 0; b < mod; b++) g[(oy + y * mod + a) * W + ox + x * mod + b] = 28;
  }
  let s = 11; const azar = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let f = 0; f < 3; f++) {
    const y0 = T.y + Math.round(T.h * (0.70 + f * 0.09)), ch = Math.round(T.h * 0.05);
    for (let x = T.x + Math.round(T.w * 0.05); x < T.x + T.w * 0.95; x += Math.round(T.w * 0.03)) {
      for (let y = y0; y < y0 + ch; y++) for (let xx = x; xx < x + Math.round(T.w * 0.02); xx++) if (azar() < 0.55) g[y * W + xx] = 40;
    }
  }
  if (o.qrBorroso) {
    /* Un desenfoque de caja de 13 px sobre el QR: el lector no lo encuentra. */
    const x0 = ox - 4, x1 = ox + n * mod + 4, y0 = oy - 4, y1 = oy + n * mod + 4, R = 6;
    const src = Float32Array.from(g);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let t = 0, c = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { t += src[(y + dy) * W + x + dx]; c++; }
      g[y * W + x] = t / c;
    }
  }
  return { gris: g, w: W, h: H };
}
/* El frente: el de la cédula fabricada para las letras. Qué frente sea da
   igual: lo que se prueba es si se recorta. */
const FRENTE = () => leerPGM(path.join(__dirname, 'cedula-ocr-frente.pgm.gz'));

const paso = P => P.ev('PASOS[PASO] && PASOS[PASO].id');
const listo = P => P.ev("$('docListoTxt').textContent");
const recortesDe = (E, lado) => E.recortes.filter(r => r.lado === lado);
async function encenderEn(E) {
  E.P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(E.P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  await E.correr(150);   // el primer cuadro: el escáner calcula su marco
  return JSON.parse(E.P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
}
/* El frente, a mano si el escáner no lo toma solo (la cédula fabricada para
   las letras no pasa el piso de nitidez sin textura: da igual, la persona
   toca «Tomar la foto ahora»). */
async function tomarElFrente(E) {
  const { P, video, correr } = E;
  assert.equal(P.ev('ESCDOC.lado'), 'frente', 'el escáner no pasó al frente');
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  video.__px = ponerCarta(guia, FRENTE());
  for (let i = 0; i < 10 && !P.ev('FOTOS.cedula_frente'); i++) await correr(100);
  if (!P.ev('FOTOS.cedula_frente')) P.ev('capturarDoc()');
  assert.ok(P.ev('FOTOS.cedula_frente'), 'el frente no se guardó: ' + P.ev("$('docEstado').textContent"));
}
/* Nada de las letras llegó a «Revisa tus datos». */
function nadaLlenado(P) {
  ['documento', 'nombres', 'apellidos', 'expedicion'].forEach(c =>
    assert.equal(P.ev('REGISTRO.' + c), undefined, 'las letras llenaron «' + c + '» con lo leído de una cédula que no es la amarilla'));
  assert.equal(P.ev('FOTOS.cedula_vista'), undefined, 'quedó una lectura de las letras');
  assert.equal(/Leímos de las fotos/.test(String(P.ev("($('notaFoto') || {}).innerHTML || ''"))), false);
}

describe('la cédula digital no pasa por las letras de la amarilla (R1)', () => {

  test('(a) la digital por su QR, la pestaña se RELANZA, y el frente: cero recortes y nada llenado', async () => {
    const almacen = {}, sesion = {};
    const E = abrirConCamara({ almacen, sesion });
    const guia = await encenderEn(E);
    E.video.__px = ponerCarta(guia, atrasDigital());
    for (let i = 0; i < 140 && !E.P.ev('FOTOS.cedula_reverso'); i++) await E.correr(100);
    assert.ok(E.P.ev('FOTOS.cedula_reverso'), 'la digital no se tomó sola con su QR: ' + E.P.ev("$('docEstado').textContent"));
    assert.match(listo(E.P), /la del QR/);
    assert.deepEqual(E.recortes, [], 'se recortó algo del respaldo de la digital');
    await E.correr(4700);
    /* Android descarta la pestaña (el video 4K, la memoria): la página vuelve
       a abrir con lo que quedó en el teléfono y en la pestaña. */
    const R = abrirConCamara({ almacen, sesion, t: E.reloj.t + 20000 });
    await asentar();
    assert.equal(R.P.ev("hayFotoLista('cedula_reverso')"), true, 'al relanzar se perdió el respaldo: la prueba no prueba el caso');
    await encenderEn(R);
    await tomarElFrente(R);
    assert.deepEqual(recortesDe(R, 'frente'), [], 'el frente de la DIGITAL (con el RH, el sexo y la estatura) pasó por el bloque de la amarilla');
    assert.equal(R.P.ev('!!OCR_CEDULA.pendientes.frente'), false);
    await R.correr(4700);
    assert.equal(paso(R.P), 'identidad', 'con las dos caras no pasó solo a «Revisa tus datos»');
    nadaLlenado(R.P);
    /* Y la decisión es la que viajó con la foto. */
    assert.equal(R.P.ev('tipoDelRespaldo()'), 'digital');
  });

  test('(b) la digital cuyo QR NO se lee, con «Tomar la foto ahora»: ni letras, ni la promesa de leerlas', async () => {
    const E = abrirConCamara();
    const guia = await encenderEn(E);
    E.video.__px = ponerCarta(guia, atrasDigital({ qrBorroso: true }));
    for (let i = 0; i < 20; i++) await E.correr(100);
    assert.equal(E.P.ev('FOTOS.cedula_reverso'), undefined, 'se tomó sola: el QR borroso se leyó y la prueba no prueba el caso');
    assert.equal(E.P.ev('ESCDOC.vioQr'), false);
    E.P.ev('capturarDoc()');   // «Tomar la foto ahora»
    assert.ok(E.P.ev('FOTOS.cedula_reverso'));
    const t = listo(E.P);
    assert.equal(/te llenamos|alcancemos a leer/.test(t), false, 'le prometió leer las letras de una cédula que no se va a leer: ' + t);
    assert.match(t, /escribes tus datos/, 'no le dijo que escribe sus datos, como la nota de la cédula nueva: ' + t);
    assert.deepEqual(E.recortes, [], 'se recortó el respaldo de una cédula sin prueba de ser la amarilla');
    await E.correr(4600);
    await tomarElFrente(E);
    assert.deepEqual(recortesDe(E, 'frente'), [], 'el frente sin prueba de la amarilla pasó por las franjas');
    await E.correr(1700);
    nadaLlenado(E.P);
    assert.equal(E.P.ev('tipoDelRespaldo()'), '', 'no ver un QR se tomó por prueba de algo');
  });

  test('(b2) …y sin el lector todavía (un iPhone con ZXing bajando): lo mismo', async () => {
    const E = abrirConCamara();
    const guia = await encenderEn(E);
    E.video.__px = ponerCarta(guia, atrasDigital({ qrBorroso: true }));
    E.P.ev('window.ZXing = undefined;');
    E.P.ev('capturarDoc()');
    assert.ok(E.P.ev('FOTOS.cedula_reverso'));
    assert.equal(/te llenamos/.test(listo(E.P)), false, listo(E.P));
    assert.deepEqual(E.recortes, []);
    assert.equal(E.P.ev('tipoDelRespaldo()'), '');
  });

  /* 23-oct-2026 (verificación del autollenado, caso 4) — en «Escribe tus
     datos» la nota decía «No alcanzamos a leer el código de barras de tu
     cédula» a quien tiene la digital, que no trae código de barras, justo
     después de que el escáner le dijera «Tu cédula es la nueva (la del QR)».
     FALLA con ab6b595. */
  for (const [nombre, qrBorroso, dice] of [
    ['su QR se vio: la nota dice que es la nueva y que sus datos todavía no se leen', false, /Tu cédula es la nueva \(la del QR\) y sus datos todavía no los sabemos leer/],
    ['su QR NO se vio (no se sabe cuál es): la nota no le promete ni le culpa un código de barras', true, /No alcanzamos a leer tu cédula, así que esta vez los datos los escribes tú/]
  ]) {
    test('(d) la digital en «Escribe tus datos», ' + nombre, async () => {
      const E = abrirConCamara();
      const guia = await encenderEn(E);
      E.video.__px = ponerCarta(guia, atrasDigital({ qrBorroso }));
      E.P.ev('capturarDoc()');   // «Tomar la foto ahora»
      assert.ok(E.P.ev('FOTOS.cedula_reverso'));
      assert.equal(E.P.ev('tipoDelRespaldo()'), qrBorroso ? '' : 'digital', 'la prueba no prueba el caso');
      await E.correr(4600);
      await tomarElFrente(E);
      await E.correr(1700);
      assert.equal(paso(E.P), 'identidad', 'con las dos caras no pasó solo a «Escribe tus datos»');
      const h = String(E.P.ev("$('cuerpo').innerHTML"));
      const nota = (/id="notaSinLeer">([^<]*)</.exec(h) || [])[1] || '';
      assert.match(nota, dice, 'la nota no dice lo que se sabe de esta cédula: ' + nota);
      assert.equal(/código de barras/.test(nota), false, 'le habló del código de barras a una cédula que no se sabe si lo trae: ' + nota);
    });
  }

  test('(c) «Tomar la foto ahora» antes de que el bucle vea el QR: se busca en el recorte que se guarda', async () => {
    const E = abrirConCamara();
    const guia = await encenderEn(E);
    E.video.__px = ponerCarta(guia, atrasDigital());
    assert.equal(E.P.ev('ESCDOC.vioQr'), false);
    E.P.ev('capturarDoc()');   // el toque llega antes que la lectura del bucle
    assert.match(listo(E.P), /Tu cédula es la nueva \(la del QR\)/, 'no reconoció la digital en la foto que guardó: ' + listo(E.P));
    assert.deepEqual(E.recortes, []);
    assert.equal(E.P.ev('tipoDelRespaldo()'), 'digital');
  });
});

/* ==========================================================================
 * LA MARCA VA CON LA FOTO
 * ======================================================================== */
describe('qué cédula es el respaldo se guarda CON LA FOTO (R1)', () => {
  const conAmarilla = P => P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true, sensibles_intento: asegurarIntento() };" +
    "FOTOS.cedula_reverso = 'data:image/jpeg;base64,RESPALDO_DE_MARIA'; anotarTipoDelRespaldo('amarilla'); marcarDuenoDeLasFotos('cedula_reverso'); guardarFotos();");

  test('sobrevive a relanzar la pestaña: la amarilla probada se sigue leyendo', () => {
    const almacen = {}, sesion = {};
    const P = abrirPlay({ hash: '#registro', almacen, sesion });
    conAmarilla(P);
    const Q = abrirPlay({ hash: '#registro', almacen, sesion });
    assert.equal(Q.ev('tipoDelRespaldo()'), 'amarilla', 'la decisión vivía en la memoria y se perdió al relanzar');
  });

  test('se va con la foto: respaldo nuevo, repetir, soltar las fotos, salir del registro, otra persona', () => {
    for (const camino of ['prepararRespaldoNuevo()', "repetirDoc('reverso')", 'soltarLasFotos(true)', 'soltarLasFotos(false)',
                          'soltarLoSensibleDelRegistro()', 'borrarTodoElRegistro()']) {
      const almacen = {};
      const P = abrirPlay({ hash: '#registro', almacen });
      conAmarilla(P);
      assert.equal(P.ev('tipoDelRespaldo()'), 'amarilla');
      P.ev('try { ' + camino + ' } catch (e) {}');
      assert.equal(P.ev('FOTOS.cedula_reverso_tipo'), undefined, camino + ' dejó la marca de la cédula sin su foto');
      /* En el teléfono: los caminos que guardan, sin la marca. prepararRespaldoNuevo
         no guarda (lo hace quien pone el respaldo nuevo): ahí el teléfono sigue con
         la foto vieja Y su marca, que es un par que no miente. */
      if (camino !== 'prepararRespaldoNuevo()') {
        assert.equal(/cedula_reverso_tipo/.test(almacen.play_fotos_borrador || ''), false, camino + ' dejó la marca en el teléfono');
      }
    }
  });

  test('una foto que no es ESA no hereda la marca, y la marca no guarda nada de la foto', () => {
    const P = abrirPlay({ hash: '#registro' });
    conAmarilla(P);
    const marca = P.ev('JSON.stringify([FOTOS.cedula_reverso_tipo, FOTOS.cedula_reverso_tipo_de])');
    assert.equal(/MARIA|RESPALDO/.test(marca), false, 'la marca copia un pedazo de la foto: ' + marca);
    P.ev("FOTOS.cedula_reverso = 'data:image/jpeg;base64,OTRO_RESPALDO';");
    assert.equal(P.ev('tipoDelRespaldo()'), '', 'otro respaldo heredó la prueba del anterior');
    /* Y el oyente no lee ninguno de los dos lados con ese respaldo. */
    P.ev("window.__recortes = 0; window.OcrCedula = { recortarDeLienzo: function () { window.__recortes++; return null; } };" +
         "FOTOS.cedula_frente = 'F'; ocrAlTomarLaCedula({ lado: 'frente', lienzo: { width: 10, height: 10, getContext: function () { return {}; } }, giro: 0 });");
    assert.equal(P.ev('window.__recortes'), 0);
  });

  test('la foto de la cámara del celular: su PDF417 visto la marca como amarilla (el frente en vivo se lee como antes)', async () => {
    for (const [r, tipo] of [[{ cedula: null, error: 'ilegible', giro: null, patron: false }, 'amarilla'],
                             [{ cedula: null, error: 'no_hay', giro: null, patron: true }, 'amarilla'],
                             [{ cedula: null, error: 'no_hay', giro: null, patron: false }, '']]) {
      const P = abrirPlay({ hash: '#registro' });
      P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; FOTOS.cedula_reverso = 'data:image/jpeg;base64,DE_LA_GALERIA'; marcarDuenoDeLasFotos('cedula_reverso');");
      P.ev('cargarScript = function () { return Promise.resolve(); }; leerCedulaDeLienzo = function () { return ' + JSON.stringify(r) + '; };');
      await P.ev('leerCodigoDeBarras({ width: 1600, height: 1010 })');
      assert.equal(P.ev('tipoDelRespaldo()'), tipo, JSON.stringify(r));
    }
  });

  test('los textos: la nota de la cédula nueva y el «te llenamos» piden la misma condición', () => {
    const P = abrirPlay({ hash: '#registro' });
    assert.match(P.ev('TEXTO_CEDULA_NUEVA'), /escribes tus datos/);
    /* «te llenamos lo que alcancemos a leer» solo con la amarilla probada. */
    const fuente = require('node:fs').readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8');
    const i = fuente.indexOf('var conLetras =');
    assert.ok(i > 0);
    assert.match(fuente.slice(i, fuente.indexOf('\n', i)), /respaldoEsAmarilla\(\)/,
      '«te llenamos lo que alcancemos a leer» no pide la prueba de la amarilla');
    assert.equal(/OCR_CEDULA\.digital\s*=(?!=)|function ocrRespaldoEsDigital/.test(fuente), false, 'volvió la marca de la digital en la memoria');
  });
});
