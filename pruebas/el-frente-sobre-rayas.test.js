'use strict';
/* ==========================================================================
 * EL FRENTE SOBRE UNA MESA DE RAYAS NO ES EL RESPALDO — 22 de octubre de 2026
 *
 *   node --test pruebas/el-frente-sobre-rayas.test.js
 *
 * La verificación de 522cf1f (lente «lote», confirmada por dos refutadores)
 * encontró el FRENTE guardado como respaldo. La persona muestra primero el
 * frente (el escáner pide primero el respaldo: el error del 19-oct que Joan
 * reportó) con la cédula sobre un mantel, un individual o un tapete de rayas
 * finas. El gris con que se mide la nitidez trae un 6 % de aire alrededor del
 * marco, y en ese aire las rayas son filas «de barras» de verdad: la franja
 * más fuerte salía EN LA MESA (filas 0-28 o 277-303 de 303) y
 * EC.franjaComoLaDelCodigo la tomaba por el PDF417 gastado. A los 2,5 s el
 * frente se guardaba como respaldo («Foto tomada. El código no se pudo
 * leer… Ahora el frente.»), el frente se volvía a guardar en su paso, el
 * registro pasaba solo a «Revisa tus datos», y el respaldo —el PDF417, la
 * expedición, la huella— no se guardaba nunca. Nadie se enteraba.
 *
 * Los refutadores midieron que es más ancho que el caso del hallazgo
 * (contraste de ±20 a ±60, rayas de 1,2 a 3,1 mm, de 0° a 8°, 15° con la
 * tarjeta al 95 %, con ruido, de onda seno o cuadrada) y que tiene dos
 * caminos más: el patrón del PDF417 (EC.orientacionDelRespaldo) «votaba» en
 * las rayas del aire, y eso es «vio el código» y el frente se tomaba al
 * segundo; y en el paso del FRENTE esas mismas rayas hacían decir «Ese es el
 * lado del código de barras» con el frente en el marco.
 *
 * Lo que se cuida aquí:
 *   1. lo puro: una franja de la mesa no es la del código (toca el borde del
 *      gris, o se sale de las filas del marco); con una mesa de rayas,
 *      franjaDeBarras da la franja del CÓDIGO y no la de la mesa, y el patrón
 *      no vota en las rayas;
 *   2. la página de verdad (pruebas/banco-camara.js: play/index.html, su
 *      bucle, ZXing de verdad, reloj de mentira): el frente sobre rayas en el
 *      paso del respaldo no se guarda y dice «voltéala»; el respaldo de verdad
 *      sobre las mismas rayas se sigue tomando (y por SU franja); el frente
 *      sobre rayas en su paso se toma; y «Tomar la foto ahora» con el frente
 *      sobre rayas no lo marca como la amarilla.
 * FALLAN con 522cf1f, salvo las marcadas CENTINELA.
 *
 * Las rayas son de mentira y las cédulas, fabricadas
 * (pruebas/fabricar-cedula-ocr.py y pruebas/fabrica-pdf417.js): ninguna foto
 * de nadie entra al repositorio.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const F = require('./fabrica-pdf417.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');
const ECAP = require('../app/escaner-captura.js');
/* 26-oct-2026 — el marco va DE PIE: la escena se sigue armando acostada (en
   el video ACOSTADO, con el marco acostado) y dePie la pone en el de verdad. */
const { TARJETA, ACOSTADO, escalar, abrirConCamara, dePie, acostada } = require('./banco-camara.js');

const PERSONA = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                  nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };
const CODIGO = F.fabricar(F.registroCedula(PERSONA), 20, 4);
function azarDe(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ==========================================================================
 * LA CÉDULA SOBRE LA MESA DE RAYAS
 * ======================================================================== */
/* La tarjeta sola (sin el aire del recorte fabricado), con el grano de una
   foto y una huella de verdad fuera de las franjas de las letras: sin él, la
   cédula fabricada no pasa el piso de nitidez (ver conTextura en
   pruebas/escaner-ocr-de-punta-a-punta.test.js). */
const TARJETAS = {};
function tarjeta(lado) {
  if (TARJETAS[lado]) return TARJETAS[lado];
  const c = leerPGM(path.join(__dirname, 'cedula-ocr-' + lado + '.pgm.gz'));
  const t = { gris: new Uint8ClampedArray(TARJETA.w * TARJETA.h), w: TARJETA.w, h: TARJETA.h };
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) t.gris[y * t.w + x] = c.gris[(TARJETA.y + y) * c.w + TARJETA.x + x];
  const z = lado === 'frente' ? [0.035, 0.205, 0.275, 0.795] : [0.725, 0.07, 0.945, 0.54];
  const azar = azarDe(lado === 'frente' ? 7 : 9);
  for (let y = Math.round(z[1] * t.h); y < Math.round(z[3] * t.h) - 4; y += 4) for (let x = Math.round(z[0] * t.w); x < Math.round(z[2] * t.w) - 4; x += 4) {
    const v = (azar() - 0.5) * 160;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const i = (y + a) * t.w + x + b; t.gris[i] = Math.max(0, Math.min(255, t.gris[i] + v)); }
  }
  return (TARJETAS[lado] = t);
}
/**
 * Una cara de la cédula, a la escala del video, sobre una mesa de rayas.
 * @param largo  el ancho de la tarjeta en píxeles del video
 * @param c      { cara: 'frente' | 'gastado' | 'legible',
 *                 amp: el contraste de las rayas (± grises sobre 110),
 *                 mm: su paso en milímetros de la tarjeta (85,6 mm de largo),
 *                 ang: su inclinación en grados (0: perpendiculares al lado
 *                   largo de la cédula, como las ve el marco acostado),
 *                 cuadrada: onda cuadrada (tela) en vez de seno,
 *                 esc: la tarjeta en fracción del ancho del marco,
 *                 corrida: desplazada en fracción del alto del marco,
 *                 ruido: σ del sensor, giro: 0 | 180,
 *                 sigma: el desenfoque del código gastado, en px }
 *   'gastado' es el PDF417 de la verificación del autollenado (4 px por
 *   módulo, desenfocado: se ve, no se lee); 'legible', 3 px por módulo. El
 *   código acaba en el 95 % del alto de la tarjeta, como en la amarilla.
 */
function escena(W, H, guia, c) {
  const px = new Uint8ClampedArray(W * H);
  const largo = guia.w * c.esc, paso = c.mm * largo / 85.6, an = (c.ang || 0) * Math.PI / 180;
  const co = Math.cos(an), si = Math.sin(an);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sn = Math.sin(2 * Math.PI * (x * co + y * si) / paso);
    px[y * W + x] = 110 + c.amp * (c.cuadrada ? Math.max(-1, Math.min(1, 3 * sn)) : sn);
  }
  const lado = c.cara === 'frente' ? 'frente' : 'reverso';
  let img = escalar(tarjeta(lado), largo / TARJETA.w);
  if (lado === 'reverso') {
    for (let y = Math.round(img.h * 0.66); y < Math.round(img.h * 0.985); y++)
      for (let x = Math.round(img.w * 0.02); x < Math.round(img.w * 0.98); x++) img.gris[y * img.w + x] = 222;
    const r = c.cara === 'gastado' ? F.render(CODIGO, 4, c.sigma || 6, 4, { quieta: 4 }) : F.render(CODIGO, 3, 0, 4, { quieta: 4 });
    const bx = Math.round((img.w - r.W) / 2), by = Math.round(img.h * 0.95) - r.H;
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const X = bx + x; if (X >= 0 && X < img.w) img.gris[(by + y) * img.w + X] = r.lum[y * r.W + x];
    }
  }
  if (c.giro === 180) { const g = new Uint8ClampedArray(img.gris.length); for (let i = 0; i < g.length; i++) g[i] = img.gris[g.length - 1 - i]; img = { gris: g, w: img.w, h: img.h }; }
  const ox = Math.round(guia.x + (guia.w - img.w) / 2), oy = Math.round(guia.y + (guia.h - img.h) / 2 + (c.corrida || 0) * guia.h);
  for (let y = 0; y < img.h; y++) {
    const Y = oy + y; if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < img.w; x++) { const X = ox + x; if (X >= 0 && X < W) px[Y * W + X] = img.gris[y * img.w + x]; }
  }
  if (c.ruido) {
    const azar = azarDe(12345);
    for (let i = 0; i < px.length; i++) px[i] = px[i] + c.ruido * Math.sqrt(-2 * Math.log(azar() + 1e-12)) * Math.cos(2 * Math.PI * azar());
  }
  return px;
}

/* Las mesas de los refutadores, con el frente. La primera es la del hallazgo
   (±20, 30 px a 4K con la tarjeta al 90 %: 1,57 mm). */
const MESAS_DEL_FRENTE = [
  { amp: 20, mm: 1.57, esc: 0.9 },
  { amp: 35, mm: 1.57, ang: 4, ruido: 4, esc: 0.9 },
  { amp: 50, mm: 2.1, ang: 8, esc: 0.9 },
  { amp: 35, mm: 1.57, ang: 15, esc: 0.95 },
  { amp: 40, mm: 2.6, cuadrada: true, giro: 180, esc: 0.88 },
  { amp: 50, mm: 1.9, corrida: 0.02, esc: 0.93 }     // la que además engañaba al patrón
];
const nombre = c => JSON.stringify(c).replace(/"/g, '');

/* ==========================================================================
 * 1. LO PURO
 * El recorte que mira la página (el marco del video 4K con su 6 % de aire,
 * EC.margenDeLectura) y el gris de 480 px con que mide la nitidez, como lo
 * dibuja el lienzo (promedio de cajas).
 * ======================================================================== */
const GUIA_4K = { x: 0, y: 0, w: 1814, h: 1145 };
const AIRE = { x: Math.round(GUIA_4K.w * 0.06), y: Math.round(GUIA_4K.h * 0.06) };
const RW = GUIA_4K.w + 2 * AIRE.x, RH = GUIA_4K.h + 2 * AIRE.y;
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
function recorte(c) {
  const px = escena(RW, RH, { x: AIRE.x, y: AIRE.y, w: GUIA_4K.w, h: GUIA_4K.h }, c);
  const w = 480, h = Math.round(480 * RH / RW);
  return { px, W: RW, H: RH, g: cajas(px, RW, RH, w, h), w, h,
           dentro: { y0: AIRE.y * h / RH, y1: (AIRE.y + GUIA_4K.h) * h / RH } };
}
const enLaTarjeta = (f, r) => !!f && f.y0 > 0 && f.y1 < r.h && f.y0 >= Math.floor(r.dentro.y0) && f.y1 <= Math.ceil(r.dentro.y1);

describe('1. lo puro: la franja del código es DE LA TARJETA', () => {

  test('una franja que toca el borde del gris es la mesa, no el código (las del hallazgo)', () => {
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 0, y1: 25 }, 303), false, 'la mesa de arriba pasó por el código');
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 277, y1: 303 }, 303), false, 'la mesa de abajo pasó por el código');
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 0, y1: 44 }, 303), false);
    /* Las de los respaldos de verdad siguen siendo el código. */
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 211, y1: 230 }, 303), true);
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 73, y1: 92 }, 303), true, 'la cédula al revés');
  });

  test('con las filas del marco: una franja en el aire no cuenta aunque no toque el borde', () => {
    const dentro = { y0: 16.2, y1: 286.8 };
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 3, y1: 28 }, 303, dentro), false, 'una franja que empieza en el aire pasó');
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 270, y1: 295 }, 303, dentro), false, 'una franja que acaba en el aire pasó');
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 211, y1: 230 }, 303, dentro), true);
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 73, y1: 92 }, 303, dentro), true);
    /* Sin las filas del marco, las del 6 % de aire de la medida. */
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 3, y1: 28 }, 303), false);
  });

  test('el FRENTE sobre las mesas de los refutadores: ninguna franja pasa por la del código', () => {
    for (const m of MESAS_DEL_FRENTE) {
      const r = recorte(Object.assign({ cara: 'frente' }, m));
      const f = EC.franjaDeBarras(r.g, r.w, r.h, r.dentro);
      assert.equal(EC.franjaComoLaDelCodigo(f, r.h, r.dentro), false, nombre(m) + ': la franja ' + JSON.stringify(f) + ' pasó por la del código');
    }
  });

  /* El código desenfocado 5 px (1,25 módulos) y no los 6 de la verificación
     del autollenado: con 6, en esta tarjeta fabricada la franja del código
     EMPATA con un renglón de arriba (7,8 contra 8,0 en mesa lisa, con
     522cf1f también) y gana uno u otro por un pelo de ruido. Eso no es de las
     rayas, y una prueba que lo mire fallaría a la suerte. */
  test('el respaldo GASTADO sobre las rayas: la franja que se da es la del código, no la de la mesa', () => {
    for (const m of [{ amp: 35, mm: 1.57 }, { amp: 50, mm: 2.1, ang: 4, ruido: 3 }, { amp: 60, mm: 2.1, cuadrada: true, giro: 180 }, { amp: 25, mm: 1.4 }]) {
      const r = recorte(Object.assign({ cara: 'gastado', esc: 0.95, sigma: 5 }, m));
      const f = EC.franjaDeBarras(r.g, r.w, r.h, r.dentro);
      assert.ok(enLaTarjeta(f, r), nombre(m) + ': la franja ' + JSON.stringify(f) + ' no es de la tarjeta (el lector leería la mesa)');
      assert.equal(EC.franjaComoLaDelCodigo(f, r.h, r.dentro), true, nombre(m) + ': no vio la franja del código gastado');
    }
  });

  /* Las rayas rectas y nítidas son las que más se parecen al peine de un
     PDF417: con 522cf1f el patrón votaba «cabeza abajo» en ellas, en el
     recorte entero y en la banda que le daba al lector la franja de la mesa
     (filas 0-23 de 303). Eso es «vio el código». */
  const MESAS_DEL_PATRON = [{ amp: 50, mm: 1.57, esc: 0.93 }, { amp: 35, mm: 1.57, corrida: -0.02, esc: 0.93 },
                            { amp: 60, mm: 2.1, corrida: 0.02, esc: 0.93, giro: 180 }];
  test('el patrón del PDF417 no vota en las rayas del aire; en el código de verdad, sí', () => {
    for (const m of MESAS_DEL_FRENTE.concat(MESAS_DEL_PATRON)) {
      const r = recorte(Object.assign({ cara: 'frente' }, m));
      const o = EC.orientacionDelRespaldo(r.px, r.W, r.H, {});
      assert.equal(o.seguro, false, nombre(m) + ': el patrón votó ' + o.giro + ' en un frente sobre rayas');
      const b = ECAP.bandaDeLectura({ y0: 0, y1: 23 }, r.h, r.H);
      const ob = EC.orientacionDelRespaldo(r.px.subarray(b.y0 * r.W, b.y1 * r.W), r.W, b.y1 - b.y0, {});
      assert.equal(ob.seguro, false, nombre(m) + ': el patrón votó ' + ob.giro + ' en la banda de la mesa');
    }
    for (const giro of [0, 180]) {
      const r = recorte({ cara: 'legible', esc: 0.9, amp: 50, mm: 2.1, ang: 4, ruido: 3, giro });
      assert.deepEqual(EC.orientacionDelRespaldo(r.px, r.W, r.H, {}), { giro, seguro: true, por: 'patron' },
        'el código de verdad sobre las rayas ya no se orienta (giro ' + giro + ')');
    }
  });
});

/* ==========================================================================
 * 2. LA PÁGINA DE VERDAD
 * ======================================================================== */
/* Enciende el escáner en `lado`, pone la escena delante y mira hasta `max`
   cuadros (100 ms cada uno). */
async function mirar(lado, c, max) {
  const E = abrirConCamara();
  const { P, video, correr } = E;
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  if (lado === 'frente') P.ev("ESCDOC.lado = 'frente'; reiniciarCuentaDoc();");
  await correr(150);
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  video.__px = dePie(escena(ACOSTADO.W, ACOSTADO.H, acostada(guia), c), ACOSTADO.W, ACOSTADO.H);
  const letreros = []; let vioFranja = false, vioCodigo = false;
  for (let i = 0; i < max && !P.ev('FOTOS.cedula_' + lado); i++) {
    await correr(100);
    const l = P.ev("$('docEstado').textContent");
    if (letreros[letreros.length - 1] !== l) letreros.push(l);
    if (P.ev('ESCDOC.vioFranja === true')) vioFranja = true;
    if (P.ev('!!ESCDOC.vioCodigo')) vioCodigo = true;
  }
  return { E, P, letreros, vioFranja, vioCodigo, tomada: !!P.ev('FOTOS.cedula_' + lado),
           franja: JSON.parse(P.ev('JSON.stringify(ESCDOC.franjaMejor)')), alto: P.ev('ESCDOC.altoMedida') };
}

describe('2. la página de verdad: el frente sobre rayas no pasa por respaldo', () => {

  test('en el paso del RESPALDO, el frente sobre rayas no se guarda y le dice que la voltee (las seis mesas)', async (t) => {
    for (const m of MESAS_DEL_FRENTE) {
      const r = await mirar('reverso', Object.assign({ cara: 'frente' }, m), 50);
      const que = nombre(m) + ': ' + r.letreros.join(' | ');
      t.diagnostic(que + ' · franja ' + JSON.stringify(r.franja));
      assert.equal(r.tomada, false, 'el FRENTE se guardó como respaldo. ' + que);
      assert.equal(r.vioFranja, false, 'la mesa pasó por la franja del código. ' + que);
      assert.equal(r.vioCodigo, false, 'la mesa pasó por el código. ' + que);
      assert.ok(r.letreros.some(l => /volt[ée]ala/i.test(l)), 'no le pidió voltearla. ' + que);
      assert.equal(r.P.ev('ESCDOC.lado'), 'reverso', 'el escáner pasó al frente: ' + que);
    }
  });

  test('CENTINELA: el respaldo LEGIBLE sobre las mismas rayas se lee y se toma', async () => {
    const r = await mirar('reverso', { cara: 'legible', esc: 0.9, amp: 35, mm: 1.57 }, 30);
    assert.ok(r.tomada, 'el respaldo legible sobre rayas no se tomó: ' + r.letreros.join(' | '));
    assert.equal(r.P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), true, 'no se leyó');
    assert.equal(r.P.ev('tipoDelRespaldo()'), 'amarilla');
  });

  /* 23-oct-2026 (tarde) — decía «se sigue tomando solo». La franja sola ya
     no toma la foto (un frente sobre cuadros escoceses también la deja:
     pruebas/el-frente-sobre-cuadros-escoceses.test.js). Lo que se cuida: la
     franja es la de SU código, nunca oye «voltéala», y la foto sale sola
     solo si el lector VIO el código (encontrado sin leer: lo de siempre);
     si solo vio la franja, se le invita a tocar «Tomar la foto ahora» y el
     toque la guarda. */
  test('el respaldo GASTADO sobre las rayas: por la franja de SU código, sin «voltéala»; sola solo con el código visto, si no, el botón', async () => {
    for (const m of [{ amp: 35, mm: 1.57 }, { amp: 50, mm: 2.1, ang: 4, ruido: 3 }]) {
      const r = await mirar('reverso', Object.assign({ cara: 'gastado', esc: 0.95, sigma: 5 }, m), 50);
      const que = nombre(m) + ': ' + r.letreros.join(' | ') + ' · franja ' + JSON.stringify(r.franja);
      assert.equal(r.vioFranja, true, que);
      assert.ok(r.franja && r.franja.y0 > 0 && r.franja.y1 < r.alto, 'la franja del mejor cuadro es la de la mesa. ' + que);
      assert.equal(r.letreros.some(l => /volt[ée]ala/i.test(l)), false, 'le pidió voltear el respaldo. ' + que);
      if (r.tomada) {
        assert.equal(r.vioCodigo, true, 'la franja sola tomó la foto. ' + que);
      } else {
        assert.ok(r.letreros.includes(ECAP.TEXTO.SOLO_FRANJA), 'no invitó a tocar «Tomar la foto ahora». ' + que);
        r.P.ev('capturarDoc()');
        assert.ok(r.P.ev('FOTOS.cedula_reverso'), 'con el toque no se guardó. ' + que);
      }
    }
  });

  test('en el paso del FRENTE, el frente sobre rayas se toma, sin «Ese es el lado del código de barras»', async () => {
    for (const m of [MESAS_DEL_FRENTE[0], MESAS_DEL_FRENTE[5], { amp: 50, mm: 1.57, ruido: 4, giro: 180, esc: 0.93 }]) {
      const r = await mirar('frente', Object.assign({ cara: 'frente' }, m), 40);
      const que = nombre(m) + ': ' + r.letreros.join(' | ');
      assert.ok(r.tomada, 'el frente sobre rayas no se tomó en su paso. ' + que);
      assert.equal(r.letreros.some(l => /lado del código de barras/.test(l)), false, 'le dijo que el frente es el lado del código. ' + que);
    }
  });

  test('«Tomar la foto ahora» con el frente sobre rayas en el paso del respaldo: se guarda (lo pidió), pero no como la amarilla', async () => {
    const r = await mirar('reverso', Object.assign({ cara: 'frente' }, MESAS_DEL_FRENTE[5]), 8);
    assert.equal(r.tomada, false, 'se tomó solo: ' + r.letreros.join(' | '));
    r.P.ev('capturarDoc()');
    await r.E.correr(100);
    assert.ok(r.P.ev('FOTOS.cedula_reverso'), 'el toque a mano no guardó la foto');
    assert.notEqual(r.P.ev('tipoDelRespaldo()'), 'amarilla', 'un frente quedó marcado como el respaldo de la amarilla');
  });
});
