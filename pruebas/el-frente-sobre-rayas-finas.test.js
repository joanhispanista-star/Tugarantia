'use strict';
/* ==========================================================================
 * EL FRENTE SOBRE RAYAS FINAS DE CONTRASTE ALTO — 23 de octubre de 2026
 *
 *   node --test pruebas/el-frente-sobre-rayas-finas.test.js
 *
 * La verificación de a21746b (dos refutadores no la pudieron tumbar) volvió
 * a encontrar el FRENTE guardado como respaldo. Es el error del 19-oct (el
 * escáner pide primero el respaldo y la persona muestra el frente), ahora
 * sobre una tela de rayas blanco y negro finas: ±58 grises o más, 1,2 a
 * 1,54 mm, la cédula al 85-90 % del marco. a21746b ya descartaba las FILAS de
 * la mesa (arriba y abajo de la tarjeta); quedaban sus COLUMNAS, el aire
 * rayado a izquierda y derecha, por dos caminos:
 *
 *   1. LA FRANJA. Ese aire sube todas las filas de la tarjeta a un piso de
 *      unos 8, y encima un renglón del frente («NUMERO 52.123.456», en el
 *      tercio de arriba) daba una racha de 16 filas: «vioFranja». A los 2,6 s
 *      el frente quedaba en cedula_reverso, en su paso se guardaba OTRA VEZ
 *      el mismo cuadro, el registro pasaba solo a «Revisa tus datos», y el
 *      respaldo (el PDF417, la expedición, la huella) no se guardaba nunca.
 *   2. EL PATRÓN. Una racha del centro (rechazada como franja del código) se
 *      le daba igual al lector como banda; en ella el patrón del PDF417 tomaba
 *      las dos rayas de más afuera por la barra de inicio y la de fin: «vio el
 *      código», y el frente se guardaba como respaldo al segundo. En el paso
 *      del frente, el mismo frente oía «Ese es el lado del código de barras»
 *      y no se tomaba solo.
 *
 * Lo que se cuida aquí:
 *   1. lo puro: con las columnas del marco, ningún renglón del frente pasa
 *      por la franja del código (tampoco sin ellas: el piso de la tarjeta);
 *      el patrón no vota con las rayas que siguen arriba y abajo de la franja,
 *      ni en la banda de un renglón ni en el recorte entero; y el código de
 *      verdad sobre esas rayas sí se orienta;
 *   2. la página de verdad (pruebas/banco-camara.js: play/index.html, su
 *      bucle, ZXing de verdad, reloj de mentira): esos frentes no se guardan
 *      en el paso del respaldo y oyen «voltéala»; en su paso se toman; y las
 *      dos caras de punta a punta quedan cada una en su sitio.
 * FALLAN con a21746b, salvo las marcadas CENTINELA.
 *
 * Las rayas son de mentira y las cédulas, fabricadas: el frente nítido sale de
 * pruebas/fabricar-cedula-nitida.py (con él la verificación encontró el
 * defecto; con el de fabricar-cedula-ocr.py el camino de la franja no se
 * veía), el otro y el respaldo de pruebas/fabricar-cedula-ocr.py, el código
 * de pruebas/fabrica-pdf417.js. Ninguna foto de nadie entra al repositorio.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const ECAP = require('../app/escaner-captura.js');
const F = require('./fabrica-pdf417.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');
const { VIDEO, escalar, abrirConCamara } = require('./banco-camara.js');

const PERSONA = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                  nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };
const CODIGO = F.fabricar(F.registroCedula(PERSONA), 20, 4);
function azarDe(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ==========================================================================
 * LAS TARJETAS Y LA MESA (el generador de la verificación, ver-cierre3)
 * ======================================================================== */
/* La tarjeta (1000 x 631) del recorte fabricado: la guía del banco está en
   60,38 (pruebas/banco-camara.js, GUIA). */
function tarjetaDe(archivo) {
  const c = leerPGM(path.join(__dirname, archivo)), o = new Uint8ClampedArray(1000 * 631);
  for (let y = 0; y < 631; y++) for (let x = 0; x < 1000; x++) o[y * 1000 + x] = c.gris[(38 + y) * c.w + 60 + x];
  return { gris: o, w: 1000, h: 631 };
}
/* El grano de una foto en la zona de la foto: sin él, la cédula de
   fabricar-cedula-ocr.py no pasa el piso de nitidez. */
function grano(t, sem, amp) {
  const z = [0.035, 0.205, 0.275, 0.795], azar = azarDe(sem);
  for (let y = Math.round(z[1] * t.h); y < Math.round(z[3] * t.h) - 3; y += 3) for (let x = Math.round(z[0] * t.w); x < Math.round(z[2] * t.w) - 3; x += 3) {
    const v = (azar() - 0.5) * amp;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const i = (y + a) * t.w + x + b; t.gris[i] = Math.max(0, Math.min(255, t.gris[i] + v)); }
  }
  return t;
}
function trama(t, sem, G) {
  const azar = azarDe(sem);
  for (let y = 0; y < t.h - 2; y += 2) for (let x = 0; x < t.w - 2; x += 2) {
    const v = (azar() - 0.5) * 2 * G;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const i = (y + a) * t.w + x + b; t.gris[i] = Math.max(0, Math.min(255, t.gris[i] + v)); }
  }
  return t;
}
const CARTAS = {
  nitida: () => tarjetaDe('cedula-nitida-frente.pgm.gz'),
  fab: () => grano(tarjetaDe('cedula-ocr-frente.pgm.gz'), 7, 160),
  fabTrama: () => grano(trama(tarjetaDe('cedula-ocr-frente.pgm.gz'), 5, 30), 11, 140),
  reverso: () => grano(tarjetaDe('cedula-ocr-reverso.pgm.gz'), 9, 120)
};
const HECHAS = {};
const carta = n => HECHAS[n] || (HECHAS[n] = CARTAS[n]());

/**
 * Una cara de la cédula sobre una mesa de rayas, en una imagen W x H con la
 * guía (el marco) en `guia`.
 * @param origen dónde cae (0,0) de esta imagen en el video: las rayas siguen
 *   en la mesa con la misma fase (ver ORIGEN, abajo)
 * @param c { carta: 'nitida' | 'fab' | 'fabTrama' | 'legible' | 'gastado',
 *            amp: el contraste de las rayas (± grises sobre `base`),
 *            mm: su paso en milímetros de la tarjeta (85,6 mm de largo),
 *            ang: su inclinación en grados, cuadrada: tela (si no, seno),
 *            esc: la tarjeta en fracción del ancho del marco,
 *            corrida / dx: desplazada en fracción del alto / ancho del marco,
 *            giro: 0 | 180, ruido: σ del sensor, sem: su semilla }
 *   'legible' y 'gastado' son el respaldo con un PDF417 de verdad (3 px por
 *   módulo, o 4 desenfocado 5 px: se ve, no se lee), acabado en el 95 % del
 *   alto de la tarjeta, como en la amarilla.
 */
function escena(W, H, guia, c, origen) {
  const px = new Uint8ClampedArray(W * H), base = c.base == null ? 127 : c.base;
  const o = origen || { x: 0, y: 0 };
  const largo = guia.w * c.esc, paso = c.mm * largo / 85.6, an = (c.ang || 0) * Math.PI / 180;
  const co = Math.cos(an), si = Math.sin(an);
  /* Las rayas, solo cerca del marco (el resto del video 4K no lo mira nadie y
     son ocho millones de píxeles). */
  const y0 = Math.max(0, guia.y - 300), y1 = Math.min(H, guia.y + guia.h + 300);
  px.fill(base);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const u = ((x + o.x) * co + (y + o.y) * si) / paso;
    const onda = c.cuadrada ? (u - Math.floor(u) < 0.5 ? 1 : -1) : Math.sin(2 * Math.PI * u);
    px[y * W + x] = base + c.amp * onda;
  }
  const respaldo = c.carta === 'legible' || c.carta === 'gastado';
  let img = escalar(carta(respaldo ? 'reverso' : c.carta), largo / 1000);
  if (respaldo) {
    for (let y = Math.round(img.h * 0.66); y < Math.round(img.h * 0.985); y++)
      for (let x = Math.round(img.w * 0.02); x < Math.round(img.w * 0.98); x++) img.gris[y * img.w + x] = 222;
    const r = c.carta === 'gastado' ? F.render(CODIGO, 4, 5, 4, { quieta: 4 }) : F.render(CODIGO, 3, 0, 4, { quieta: 4 });
    const bx = Math.round((img.w - r.W) / 2), by = Math.round(img.h * 0.95) - r.H;
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const X = bx + x; if (X >= 0 && X < img.w) img.gris[(by + y) * img.w + X] = r.lum[y * r.W + x];
    }
  }
  if (c.giro === 180) { const g = new Uint8ClampedArray(img.gris.length); for (let i = 0; i < g.length; i++) g[i] = img.gris[g.length - 1 - i]; img = { gris: g, w: img.w, h: img.h }; }
  const ox = Math.round(guia.x + (guia.w - img.w) / 2 + (c.dx || 0) * guia.w);
  const oy = Math.round(guia.y + (guia.h - img.h) / 2 + (c.corrida || 0) * guia.h);
  for (let y = 0; y < img.h; y++) {
    const Y = oy + y; if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < img.w; x++) { const X = ox + x; if (X >= 0 && X < W) px[Y * W + X] = img.gris[y * img.w + x]; }
  }
  if (c.ruido) {
    const az = azarDe(c.sem || 1);
    for (let i = y0 * W; i < y1 * W; i++) px[i] = px[i] + c.ruido * (az() + az() + az() - 1.5) * 2;
  }
  return px;
}

/* Las escenas de la verificación. Las tres primeras van por la franja (con
   a21746b, «vioFranja» y la foto a los 2,6 s en el paso del respaldo); las
   dos últimas por el patrón (con a21746b, la primera se toma al segundo en
   el paso del respaldo, y las dos oyen «Ese es el lado del código de barras»
   en el del frente). */
const POR_LA_FRANJA = [
  { carta: 'nitida', amp: 60, mm: 1.2, ang: 1.4, cuadrada: true, esc: 0.88, corrida: -0.019, ruido: 0.4, sem: 39 },
  { carta: 'nitida', amp: 70, mm: 1.2, ang: 1.4, cuadrada: true, esc: 0.9, corrida: 0.019, dx: -0.005, ruido: 0.4, sem: 122 },
  { carta: 'nitida', amp: 70, mm: 1.2, ang: 1.4, cuadrada: true, esc: 0.88, corrida: 0.019, giro: 180, ruido: 0.4, sem: 28 }
];
const POR_EL_PATRON = [
  { carta: 'fab', amp: 70, mm: 1.54, ang: 1.4, cuadrada: true, esc: 0.9, corrida: 0.019, dx: -0.005, ruido: 0.4, sem: 196 },
  { carta: 'fabTrama', amp: 70, mm: 1.54, ang: 1.4, cuadrada: true, esc: 0.9, corrida: -0.019, dx: -0.005, ruido: 0.4, sem: 161 }
];
const nombre = c => JSON.stringify(c).replace(/"/g, '');

/* ==========================================================================
 * 1. LO PURO
 * El recorte que mira la página (el marco del video 4K con su 6 % de aire,
 * EC.margenDeLectura) y el gris de 480 px con que mide la nitidez, como lo
 * dibuja el lienzo (promedio de cajas), con las filas Y LAS COLUMNAS del
 * marco, como las da medirNitidezDoc.
 * ======================================================================== */
/* Dónde pone el banco el marco acostado en su video 4K (ESCDOC.guiaVideo), y
   dónde cae entonces el recorte con su aire: con las rayas en la misma fase
   que en la página, lo puro mira los mismos píxeles que ella. */
const GUIA_VIDEO = { x: 173, y: 1348, w: 1814, h: 1145 };
const ORIGEN = EC.margenDeLectura(GUIA_VIDEO, VIDEO.W, VIDEO.H, 0.06);
const GUIA_4K = { w: GUIA_VIDEO.w, h: GUIA_VIDEO.h };
const AIRE = { x: GUIA_VIDEO.x - ORIGEN.x, y: GUIA_VIDEO.y - ORIGEN.y };
const RW = ORIGEN.w, RH = ORIGEN.h;
function cajas(px, W, H, w, h) {
  const o = new Uint8ClampedArray(w * h), kx = W / w, ky = H / h;
  for (let j = 0; j < h; j++) {
    const y0 = Math.floor(j * ky), y1 = Math.max(y0 + 1, Math.floor((j + 1) * ky));
    for (let i = 0; i < w; i++) {
      const x0 = Math.floor(i * kx), x1 = Math.max(x0 + 1, Math.floor((i + 1) * kx));
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += px[y * W + x]; n++; }
      o[j * w + i] = s / n;
    }
  }
  return o;
}
function recorte(c, fase) {
  /* `fase` (0..1): la mesa corrida esa fracción de una raya. Lo que pasa o no
     pasa depende de dónde cae cada raya contra el borde de la tarjeta, y con
     a21746b el defecto salía en unas fases sí y en otras no. */
  const paso = c.mm * GUIA_4K.w * c.esc / 85.6;
  const px = escena(RW, RH, { x: AIRE.x, y: AIRE.y, w: GUIA_4K.w, h: GUIA_4K.h }, c,
                    { x: ORIGEN.x + paso * (fase || 0), y: ORIGEN.y });
  const w = 480, h = Math.round(480 * RH / RW);
  return { px, W: RW, H: RH, g: cajas(px, RW, RH, w, h), w, h,
           dentro: { y0: AIRE.y * h / RH, y1: (AIRE.y + GUIA_4K.h) * h / RH,
                     x0: AIRE.x * w / RW, x1: (AIRE.x + GUIA_4K.w) * w / RW } };
}
const filas = d => ({ y0: d.y0, y1: d.y1 });
const FASES = [0, 1, 2, 3, 4, 5, 6, 7].map(k => k / 8);

describe('1. lo puro: las rayas de los lados no son de la tarjeta', () => {

  test('con las columnas del marco, ningún renglón del frente nítido pasa por la franja del código, en ninguna fase de la mesa', () => {
    for (const c of POR_LA_FRANJA) for (const fase of FASES) {
      const r = recorte(c, fase);
      const f = EC.franjaDeBarras(r.g, r.w, r.h, r.dentro);
      assert.equal(EC.franjaComoLaDelCodigo(f, r.h, r.dentro), false,
        nombre(c) + ' (fase ' + fase + '): el renglón ' + JSON.stringify(f) + ' pasó por la franja del código');
    }
  });

  /* Una página vieja en la caché (o quien llame sin las columnas) da solo
     las filas: ahí no se sabe dónde acaban los lados, y lo que lo para es
     el piso de la tarjeta. */
  test('sin las columnas, el piso de la tarjeta lo para igual', () => {
    for (const c of POR_LA_FRANJA) for (const fase of FASES) {
      const r = recorte(c, fase);
      const f = EC.franjaDeBarras(r.g, r.w, r.h, filas(r.dentro));
      assert.equal(EC.franjaComoLaDelCodigo(f, r.h, filas(r.dentro)), false,
        nombre(c) + ' (fase ' + fase + '): sin columnas, el renglón ' + JSON.stringify(f) + ' pasó por la franja del código');
    }
  });

  test('CENTINELA: el respaldo GASTADO sobre esas rayas sigue dando la franja de SU código', () => {
    for (const m of [{ amp: 60, mm: 1.2 }, { amp: 70, mm: 1.54, giro: 180 }, { amp: 0, mm: 1.2 }]) {
      const c = Object.assign({ carta: 'gastado', ang: 1.4, cuadrada: true, esc: 0.95, ruido: 0.4 }, m);
      const r = recorte(c);
      const f = EC.franjaDeBarras(r.g, r.w, r.h, r.dentro);
      assert.equal(EC.franjaComoLaDelCodigo(f, r.h, r.dentro), true, nombre(c) + ': la franja del código gastado se perdió (' + JSON.stringify(f) + ')');
    }
  });

  /* La racha del centro que a21746b le daba igual al lector como banda: con
     la escena del hallazgo, filas 171-184 del gris de 303. */
  test('el patrón no vota con las rayas de los lados: ni en la banda de un renglón ni en el recorte entero, en ninguna fase', () => {
    for (const c of POR_EL_PATRON) for (const fase of FASES) {
      const r = recorte(c, fase), que = nombre(c) + ' (fase ' + fase + ')';
      const o = EC.orientacionDelRespaldo(r.px, r.W, r.H, {});
      assert.equal(o.seguro, false, que + ': el patrón votó ' + o.giro + ' en el recorte entero de un frente');
      for (const fr of [{ y0: 160, y1: 176 }, { y0: 171, y1: 184 }]) {
        const b = ECAP.bandaDeLectura(fr, r.h, r.H);
        const ob = EC.orientacionDelRespaldo(r.px.subarray(b.y0 * r.W, b.y1 * r.W), r.W, b.y1 - b.y0, {});
        assert.equal(ob.seguro, false, que + ': el patrón votó ' + ob.giro + ' en la banda ' + JSON.stringify(b) + ' de un renglón');
      }
    }
  });

  /* Con a21746b, sobre las rayas una raya más gruesa que la barra de inicio
     le ganaba el puesto («las más gruesas») y el patrón no decidía: la foto
     del respaldo ilegible no se enderezaba. Las rayas que siguen arriba y
     abajo ya no compiten. */
  test('el código de verdad sobre esas rayas sí se orienta, en las dos posiciones', () => {
    for (const giro of [0, 180]) {
      for (const m of [{ amp: 70, mm: 1.54 }, { amp: 60, mm: 1.2 }, { amp: 0, mm: 1.2 }]) {
        const c = Object.assign({ carta: 'legible', ang: 1.4, cuadrada: true, esc: 0.9, ruido: 0.4, giro }, m);
        const r = recorte(c);
        assert.deepEqual(EC.orientacionDelRespaldo(r.px, r.W, r.H, {}), { giro, seguro: true, por: 'patron' },
          nombre(c) + ': el código de verdad no se orientó');
      }
    }
  });
});

/* ==========================================================================
 * 2. LA PÁGINA DE VERDAD
 * ======================================================================== */
/* Pone la escena delante de la cámara y mira hasta `max` cuadros (100 ms
   cada uno) o hasta que haya foto de este lado. */
async function ponerYMirar(E, lado, c, max) {
  const { P, video, correr } = E;
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  assert.deepEqual({ x: guia.x, y: guia.y, w: guia.w, h: guia.h }, GUIA_VIDEO, 'el banco movió el marco: lo puro ya no mira lo mismo que la página');
  video.__px = escena(VIDEO.W, VIDEO.H, guia, c);
  const letreros = []; let vioFranja = false, vioCodigo = false;
  for (let i = 0; i < max && !P.ev('FOTOS.cedula_' + lado); i++) {
    await correr(100);
    const l = P.ev("$('docEstado').textContent");
    if (letreros[letreros.length - 1] !== l) letreros.push(l);
    if (P.ev('ESCDOC.vioFranja === true')) vioFranja = true;
    if (P.ev('!!ESCDOC.vioCodigo')) vioCodigo = true;
  }
  return { letreros, vioFranja, vioCodigo, tomada: !!P.ev('FOTOS.cedula_' + lado) };
}
async function encender(lado) {
  const E = abrirConCamara();
  E.P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(E.P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  if (lado === 'frente') E.P.ev("ESCDOC.lado = 'frente'; reiniciarCuentaDoc();");
  await E.correr(150);
  return E;
}

describe('2. la página de verdad: el frente sobre rayas finas no pasa por respaldo', () => {

  test('en el paso del RESPALDO, ninguno de esos frentes se guarda: oyen «voltéala»', async (t) => {
    for (const c of POR_LA_FRANJA.concat(POR_EL_PATRON)) {
      const E = await encender('reverso');
      const r = await ponerYMirar(E, 'reverso', c, 50);
      const que = nombre(c) + ': ' + r.letreros.join(' | ');
      t.diagnostic(que);
      assert.equal(r.tomada, false, 'el FRENTE se guardó como respaldo. ' + que);
      assert.equal(r.vioFranja, false, 'un renglón pasó por la franja del código. ' + que);
      assert.equal(r.vioCodigo, false, 'las rayas de los lados pasaron por el código. ' + que);
      assert.ok(r.letreros.some(l => /volt[ée]ala/i.test(l)), 'no le pidió voltearla. ' + que);
      assert.equal(E.P.ev('ESCDOC.lado'), 'reverso', 'el escáner pasó al frente: ' + que);
    }
  });

  test('en el paso del FRENTE, esos frentes se toman, sin «Ese es el lado del código de barras»', async () => {
    for (const c of POR_EL_PATRON.concat([POR_LA_FRANJA[0]])) {
      const E = await encender('frente');
      const r = await ponerYMirar(E, 'frente', c, 40);
      const que = nombre(c) + ': ' + r.letreros.join(' | ');
      assert.ok(r.tomada, 'el frente sobre rayas finas no se tomó en su paso. ' + que);
      assert.equal(r.letreros.some(l => /lado del código de barras/.test(l)), false, 'le dijo que el frente es el lado del código. ' + que);
    }
  });

  /* Lo que se perdía, entero: la persona muestra el frente, oye «voltéala»,
     voltea, el respaldo se lee, y en su paso el frente se toma. Cada cara en
     su sitio, y dos cuadros distintos. */
  test('las dos caras de punta a punta: el frente mostrado primero no se guarda, y cada cara queda en su sitio', async () => {
    const mesa = { amp: 60, mm: 1.2, ang: 1.4, cuadrada: true, ruido: 0.4 };
    const E = await encender('reverso');
    const r1 = await ponerYMirar(E, 'reverso', Object.assign({ carta: 'nitida', esc: 0.88, corrida: -0.019, sem: 39 }, mesa), 40);
    assert.equal(r1.tomada, false, 'el frente se guardó como respaldo: ' + r1.letreros.join(' | '));
    /* Voltearla la saca del marco un momento: la racha en verde se corta. */
    E.video.__px = new Uint8ClampedArray(VIDEO.W * VIDEO.H).fill(127);
    await E.correr(400);
    const r2 = await ponerYMirar(E, 'reverso', Object.assign({ carta: 'legible', esc: 0.9 }, mesa), 40);
    assert.ok(r2.tomada, 'el respaldo de verdad sobre las rayas no se tomó: ' + r2.letreros.join(' | '));
    assert.equal(E.P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), true, 'el respaldo no se leyó');
    assert.equal(E.P.ev('tipoDelRespaldo()'), 'amarilla');
    await E.correr(1700);   // «¡Leída…! Ahora el frente.» se ve 1,5 s y el escáner sigue solo
    assert.equal(E.P.ev('ESCDOC.lado'), 'frente', 'no pasó al frente');
    const r3 = await ponerYMirar(E, 'frente', Object.assign({ carta: 'nitida', esc: 0.88, corrida: -0.019, sem: 39 }, mesa), 40);
    assert.ok(r3.tomada, 'el frente no se tomó en su paso: ' + r3.letreros.join(' | '));
    assert.notEqual(E.P.ev('FOTOS.cedula_frente'), E.P.ev('FOTOS.cedula_reverso'), 'las dos caras son la misma foto');
  });
});
