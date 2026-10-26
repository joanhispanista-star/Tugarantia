'use strict';
/* ==========================================================================
 * LA CÉDULA SE TOMA SOLA CON LA MANO TEMBLANDO — 26 de octubre de 2026
 *
 *   node --test pruebas/lectura-sin-temblor.test.js
 *
 * Joan, en su iPhone: «al escanear la cédula no se toma la foto
 * automáticamente, parece que es porque no se estabiliza el celular y nunca
 * se queda quieto y me tocó tomarla manualmente». La puerta del escáner
 * (EC.medirTarjeta) exigía que dos grises seguidos de 96 px difirieran menos
 * de 6 en promedio, y a 4K un píxel de ese gris son 17 px del video: el pulso
 * de una mano, que corre la imagen 0,5-2 px de gris cada 100 ms, daba 5-13.
 * Nunca verde, nunca la foto.
 *
 * La regla de hoy (app/escaner-cedula.js, TARJETA.TEMBLOR_MAX y
 * contarRachaDoc), medida antes de escribirla (scratchpad lote-26/
 * lectura-sin-temblor/medicion.md):
 *   · quieta es moverse menos que TEMBLOR_MAX veces lo que el propio cuadro
 *     cambiaría corrido 1 px (`unPixel`): un desplazamiento en píxeles de
 *     gris, que no depende de la tinta ni de cómo se redujo el video;
 *   · la racha tolera huecos aislados por movimiento o desenfoque (hasta dos
 *     cuadros seguidos); 'sin_tarjeta' y la luz la cortan;
 *   · la foto sigue siendo el cuadro más nítido de la ventana: lo que la
 *     protege es la nitidez, no la quietud.
 * Aquí: lo puro con cédulas fabricadas corridas una fracción de píxel a la
 * resolución del video, y la página de verdad (pruebas/banco-camara.js)
 * delante de una cámara que TIEMBLA: con la regla vieja no se toma en 6 s
 * (lo de Joan); con la de hoy, sí, en los dos lados; deslizándose o sin
 * cédula, nunca. Ninguna cédula de nadie: todo es inventado.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const F = require('./fabrica-pdf417.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');
/* 26-oct-2026 (integración con marco-de-pie) — la página pone el marco DE PIE
   y copia del video girando (dibujarAcostado): la escena de la página (las
   secciones 3 y 4) se arma acostada en el video ACOSTADO, con el marco
   acostado, y dePie la pone en el video de verdad. Lo puro (1 y 2) sigue en
   el video de siempre: mide la puerta, que no sabe de giros. */
const { VIDEO, ACOSTADO, TARJETA, escalar, abrirConCamara, dePie, acostada } = require('./banco-camara.js');

const PERSONA = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                  nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };
const CODIGO = F.fabricar(F.registroCedula(PERSONA), 20, 4);
function azarDe(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ==========================================================================
 * LAS CÉDULAS, A LA ESCALA DEL VIDEO
 * La tarjeta sola de las cédulas fabricadas para las letras, con el grano de
 * una foto (sin él no pasan el piso de nitidez: ver conTextura en
 * pruebas/escaner-ocr-de-punta-a-punta.test.js) y, en el respaldo, un PDF417
 * legible donde va el de la amarilla. Es la misma receta de
 * pruebas/el-frente-sobre-rayas.test.js, sobre una mesa lisa.
 * ======================================================================== */
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
/* La cara a la escala del marco (`guia`, en píxeles del video), al 90 %. */
function caraEnVideo(lado, guia) {
  const largo = guia.w * 0.9;
  const img = escalar(tarjeta(lado), largo / TARJETA.w);
  if (lado === 'reverso') {
    for (let y = Math.round(img.h * 0.66); y < Math.round(img.h * 0.985); y++)
      for (let x = Math.round(img.w * 0.02); x < Math.round(img.w * 0.98); x++) img.gris[y * img.w + x] = 222;
    /* 26-oct-2026 (integración con marco-de-pie) — el código crece con la
       tarjeta, como en una cédula de verdad: 3 px por módulo con el marco
       acostado de siempre (1814 px de largo), ~3,5 con el de pie (2110). Con
       el módulo fijo en 3, la tarjeta de pie llevaba un código más chico que
       el de la cédula y la puerta la veía «borrosa» (8,6-9 contra 9): no era
       la página, era la escena. */
    const r = F.render(CODIGO, 3 * guia.w / EC.rectanguloGuia(VIDEO.W, VIDEO.H).w, 0, 4, { quieta: 4 });
    const bx = Math.round((img.w - r.W) / 2), by = Math.round(img.h * 0.95) - r.H;
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const X = bx + x; if (X >= 0 && X < img.w) img.gris[(by + y) * img.w + X] = r.lum[y * r.W + x];
    }
  }
  return { img, ox: Math.round(guia.x + (guia.w - img.w) / 2), oy: Math.round(guia.y + (guia.h - img.h) / 2) };
}
const MESA = 110;
/* El cuadro de video entero con la cara corrida (dx, dy) píxeles ENTEROS del
   video (a 4K, 17 de ellos son 1 px del gris de la puerta).
   26-oct-2026 (integración con marco-de-pie) — para la página: la cara va en
   el video ACOSTADO (con el marco acostado que devuelve encender) y el cuadro
   se pone de pie, que es lo que la cámara le entrega. El giro no cambia el
   tamaño del temblor: (dx, dy) acostados son (dy, -dx) de pie. */
function cuadroDeVideo(cara, dx, dy) {
  const px = new Uint8ClampedArray(ACOSTADO.W * ACOSTADO.H).fill(MESA);
  if (cara) {
    const { img, ox, oy } = cara;
    for (let y = 0; y < img.h; y++) {
      const Y = oy + dy + y; if (Y < 0 || Y >= ACOSTADO.H) continue;
      const b = Y * ACOSTADO.W, c = y * img.w;
      for (let x = 0; x < img.w; x++) { const X = ox + dx + x; if (X >= 0 && X < ACOSTADO.W) px[b + X] = img.gris[c + x]; }
    }
  }
  return dePie(px, ACOSTADO.W, ACOSTADO.H);
}

/* ==========================================================================
 * EL GRIS DE LA PUERTA, COMO LO ARMA LA PÁGINA (grisDeGuia): el marco más su
 * anillo (EC.ventanaDeGuia), reducido a 96 px de alto por promedio de áreas.
 * Solo la banda que hace falta, y con la cara corrida una FRACCIÓN de píxel
 * (bilineal): el pulso de una mano no se mueve de a píxeles enteros.
 * ======================================================================== */
const GUIA_4K = EC.rectanguloGuia(VIDEO.W, VIDEO.H);
const VG = EC.ventanaDeGuia(GUIA_4K, VIDEO.W, VIDEO.H, 96);
const PX_POR_GRIS = VG.sh / VG.gh;   // ≈ 17
function grisDePuerta(cara, dxGris, dyGris, extra) {
  const dx = dxGris * PX_POR_GRIS, dy = dyGris * PX_POR_GRIS;
  const { img, ox, oy } = cara, W = img.w, H = img.h, g = img.gris;
  const y0 = Math.floor(VG.sy), y1 = Math.ceil(VG.sy + VG.sh), BH = y1 - y0;
  const banda = new Float32Array(VIDEO.W * BH).fill(MESA);
  const fx0 = ox + dx, fy0 = oy + dy;
  for (let Y = Math.max(y0, Math.floor(fy0)); Y < Math.min(y1, Math.ceil(fy0 + H)); Y++) {
    const fy = Y - fy0; if (fy < 0 || fy > H - 1) continue;
    const iy = Math.floor(fy), ay = fy - iy, iy1 = Math.min(H - 1, iy + 1);
    for (let X = Math.max(0, Math.floor(fx0)); X < Math.min(VIDEO.W, Math.ceil(fx0 + W)); X++) {
      const fx = X - fx0; if (fx < 0 || fx > W - 1) continue;
      const ix = Math.floor(fx), ax = fx - ix, ix1 = Math.min(W - 1, ix + 1);
      banda[(Y - y0) * VIDEO.W + X] = (g[iy * W + ix] * (1 - ax) + g[iy * W + ix1] * ax) * (1 - ay) + (g[iy1 * W + ix] * (1 - ax) + g[iy1 * W + ix1] * ax) * ay;
    }
  }
  if (extra) for (let Y = y0; Y < y1; Y++) for (let X = 0; X < VIDEO.W; X++) { const v = extra(X, Y); if (v != null) banda[(Y - y0) * VIDEO.W + X] = v; }
  const o = new Uint8ClampedArray(VG.gw * VG.gh);
  for (let j = 0; j < VG.gh; j++) {
    const ya = Math.floor(VG.sy + j * VG.sh / VG.gh), yb = Math.max(ya + 1, Math.floor(VG.sy + (j + 1) * VG.sh / VG.gh));
    for (let i = 0; i < VG.gw; i++) {
      const xa = Math.floor(VG.sx + i * VG.sw / VG.gw), xb = Math.max(xa + 1, Math.floor(VG.sx + (i + 1) * VG.sw / VG.gw));
      let s = 0, n = 0;
      for (let y = ya; y < yb; y++) { const b = (y - y0) * VIDEO.W; for (let x = xa; x < xb && x < VIDEO.W; x++) { s += banda[b + x]; n++; } }
      o[j * VG.gw + i] = s / n;
    }
  }
  return o;
}
const puerta = (antes, ahora) => EC.medirTarjeta(ahora, antes, VG.gw, VG.gh, VG.interior);

/* ==========================================================================
 * 1. LO PURO: LA PUERTA
 * ======================================================================== */
describe('EC.medirTarjeta: el temblor cuenta como quieta, un barrido no', () => {
  const cara = caraEnVideo('reverso', GUIA_4K);
  const g0 = grisDePuerta(cara, 0, 0);

  test('la medida trae cuánto cambiaría el cuadro corrido 1 px, y el movimiento en esos píxeles', () => {
    const m = puerta(g0, g0);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.ok(m.unPixel > 3 && m.unPixel < 40, 'unPixel raro: ' + m.unPixel);
    assert.equal(m.temblor, 0);
    const m1 = puerta(g0, grisDePuerta(cara, 1, 0));
    assert.ok(m1.temblor > 0.6 && m1.temblor < 1.5, 'corrida 1 px de gris no mide ~1 px: ' + m1.temblor);
  });

  test('EL CASO DE JOAN: corrida 1 px de gris (17 px del video, ~0,8 mm) está QUIETA, en cualquier dirección', () => {
    for (const [dx, dy] of [[1, 0], [0, 1], [0.7, 0.7], [-1, 0], [0.5, -0.5], [1.2, 0]]) {
      const m = puerta(g0, grisDePuerta(cara, dx, dy));
      assert.equal(m.ok, true, 'corrida (' + dx + ', ' + dy + ') px de gris: ' + JSON.stringify(m));
    }
    /* MUTANTE QUE CAZA: con el umbral de antes (6 absoluto) esto era
       «movimiento» (medido: 5,5-8,4 con 1 px). */
    const mov = puerta(g0, grisDePuerta(cara, 0.7, 0.7)).movimiento;
    assert.ok(mov > 6, 'la prueba no prueba el caso: con 1 px diagonal el movimiento absoluto es ' + mov + ' (≤ 6, la regla vieja también lo dejaba pasar)');
  });

  test('un barrido de verdad (5 px de gris por cuadro, ~4 mm) NO está quieta', () => {
    for (const [dx, dy] of [[5, 0], [0, 5], [3.5, 3.5]]) {
      const m = puerta(g0, grisDePuerta(cara, dx, dy));
      assert.equal(m.ok, false, 'corrida (' + dx + ', ' + dy + ') pasó por quieta: ' + JSON.stringify(m));
      assert.equal(m.falla, 'movimiento');
      assert.ok(m.temblor > EC.TARJETA.TEMBLOR_MAX, 'midió ' + m.temblor + ' px');
    }
    /* Más lejos todavía (8 px), lo que la frena puede ser el desenfoque del
       movimiento antes que el movimiento: tampoco es verde. */
    assert.equal(puerta(g0, grisDePuerta(cara, 8, 0)).ok, false);
  });

  test('una cédula que entra deslizándose a 6 px por cuadro nunca está quieta, y una mano que entra tampoco', () => {
    let antes = null, ok = 0;
    for (let k = -8; k <= 0; k++) {
      const g = grisDePuerta(cara, 0, -k * 6);
      if (antes && puerta(antes, g).ok) ok++;
      antes = g;
    }
    assert.equal(ok, 0, 'la cédula entrando pasó por quieta en ' + ok + ' cuadros');
    /* La mano (gris 60, 12 px de gris por cuadro, ~1 cm) entra por abajo
       sobre la cédula quieta. Su primer paso apenas toca el borde de la
       tarjeta (con la regla vieja daba 6,2: lo mismo); desde que la tapa, no
       hay verde. */
    antes = g0; ok = 0;
    for (let k = 1; k <= 4; k++) {
      const tope = VG.sy + VG.sh - k * 12 * PX_POR_GRIS;
      const g = grisDePuerta(cara, 0, 0, (X, Y) => Y >= tope ? 60 : null);
      if (k >= 2 && puerta(antes, g).ok) ok++;
      antes = g;
    }
    assert.equal(ok, 0, 'la mano sobre la cédula pasó por quieta en ' + ok + ' cuadros');
  });

  test('el ruido del sensor no es movimiento (sube el movimiento y unPixel por igual)', () => {
    const azar = azarDe(77);
    const ruido = s => { const o = new Uint8ClampedArray(g0.length); for (let i = 0; i < o.length; i++) o[i] = g0[i] + s * Math.sqrt(-2 * Math.log(azar() + 1e-12)) * Math.cos(2 * Math.PI * azar()); return o; };
    for (const s of [2, 4, 6]) {
      const m = puerta(ruido(s), ruido(s));
      assert.equal(m.ok, true, 'ruido σ=' + s + ': ' + JSON.stringify(m));
      assert.ok(m.temblor < 1, 'el ruido midió ' + m.temblor + ' px');
    }
  });

  test('lo de siempre sigue: sin cuadro anterior no se sabe; una mesa no es una tarjeta; el piso absoluto se queda', () => {
    assert.equal(puerta(null, g0).falla, 'movimiento');
    const mesa = grisDePuerta({ img: { gris: new Uint8ClampedArray(4).fill(MESA), w: 2, h: 2 }, ox: -9, oy: -9 }, 0, 0);
    assert.equal(puerta(mesa, mesa).falla, 'sin_tarjeta');
    assert.equal(EC.TARJETA.MOVIMIENTO_MAX, 6);
    assert.ok(EC.TARJETA.TEMBLOR_MAX >= 1 && EC.TARJETA.TEMBLOR_MAX <= 2, 'el temblor tolerado se salió de lo medido: ' + EC.TARJETA.TEMBLOR_MAX);
  });
});

/* ==========================================================================
 * 2. LO PURO: LA RACHA CON HUECOS
 * ======================================================================== */
describe('EC.contarRachaDoc: los picos del temblor no cortan la racha; voltearla, taparla o sacarla, sí', () => {
  /* Un pico del temblor: 'movimiento' con un temblor algo por encima de lo
     tolerado. Un cambio de escena: 'movimiento' con mucho más (cambiar de
     cara de un cuadro al otro da 4,5; la cédula entrando, 3-5). */
  const ok = { ok: true, falla: '', temblor: 0.8 }, mov = { ok: false, falla: 'movimiento', temblor: 2.6 }, bor = { ok: false, falla: 'borrosa', temblor: 1 };
  const escena = { ok: false, falla: 'movimiento', temblor: 4.5 };
  const sin = { ok: false, falla: 'sin_tarjeta' }, luz = { ok: false, falla: 'poca_luz' };
  const correr = (sec, dt) => { let r = null; const vistos = []; sec.forEach(m => { r = EC.contarRachaDoc(r, m, dt == null ? 100 : dt); vistos.push(r); }); return vistos; };

  test('los verdes suman; un hueco de movimiento no suma ni resta y la racha sigue (verde, puente)', () => {
    const v = correr([ok, ok, ok, mov, ok, ok, ok]);
    assert.deepEqual(v.map(r => r.estables), [1, 2, 3, 3, 4, 5, 6]);
    assert.deepEqual(v.map(r => r.verde), [true, true, true, true, true, true, true]);
    assert.deepEqual(v.map(r => r.puente), [false, false, false, true, false, false, false]);
  });

  test('dos huecos seguidos se toleran; el tercero corta todo', () => {
    const v = correr([ok, ok, mov, mov, ok, ok, mov, mov, mov, ok]);
    assert.deepEqual(v.map(r => r.estables), [1, 2, 2, 2, 3, 4, 4, 4, 0, 1]);
    assert.equal(v[7].verde, true); assert.equal(v[8].verde, false);
    assert.equal(v[8].hueco, 0, 'el corte no limpió los huecos');
  });

  test('un hueco largo (teléfono lento: 400 ms sin verde) corta aunque sea el primero', () => {
    const v = correr([ok, ok, mov], 400);
    assert.equal(v[2].verde, false);
    assert.equal(v[2].estables, 0);
    const w = correr([ok, ok, mov, mov], 160);   // 320 ms > HUECO_MS
    assert.equal(w[2].verde, true); assert.equal(w[3].verde, false);
  });

  test('otra escena (un movimiento grande), una mano que tapa (borrosa), sin tarjeta, poca luz o sin medida: corte, no hueco', () => {
    for (const m of [escena, bor, sin, luz, null, { ok: false, falla: 'movimiento' }]) {
      const v = correr([ok, ok, m]);
      assert.equal(v[2].verde, false, JSON.stringify(m));
      assert.equal(v[2].estables, 0);
    }
    assert.ok(EC.TARJETA.HUECO_TEMBLOR_MAX >= 2 * EC.TARJETA.TEMBLOR_MAX && EC.TARJETA.HUECO_TEMBLOR_MAX < 4.5,
      'el tope del pico se salió de lo medido: ' + EC.TARJETA.HUECO_TEMBLOR_MAX);
  });

  test('sin racha empezada no hay hueco: el primer cuadro (sin previa) no gana nada por fallar', () => {
    const v = correr([mov, mov, ok]);
    assert.deepEqual(v.map(r => [r.verde, r.estables]), [[false, 0], [false, 0], [true, 1]]);
  });
});

/* ==========================================================================
 * 3. LA PÁGINA DE VERDAD, CON UNA CÁMARA QUE TIEMBLA
 * ======================================================================== */
async function encender(E, lado) {
  const { P, correr } = E;
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  if (lado === 'frente') P.ev("ESCDOC.lado = 'frente'; reiniciarCuentaDoc();");
  await correr(150);
  /* 26-oct-2026 (integración con marco-de-pie) — el marco tiene que venir de
     pie (si no, esta prueba no prueba el temblor con la página de hoy), y se
     devuelve ACOSTADO: donde lo ven la puerta, la ventana y el recorte. */
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  assert.equal(guia.vertical, true, 'el marco no vino de pie: ' + JSON.stringify(guia));
  return acostada(guia);
}
/* Cuántos píxeles del video son 1 px del gris de la puerta con ESTE marco
   (acostado, en el video acostado): con el marco de pie la cédula llena más
   video que acostada (2110 px de largo contra 1814), así que 1 px de gris son
   ~20 px del video y no 17. */
function pxPorGrisEn(guia) {
  const v = EC.ventanaDeGuia(guia, ACOSTADO.W, ACOSTADO.H, 96);
  return v.sh / v.gh;
}
/* Cuadros con la cara corrida al azar hasta ±amp px del video en cada eje (un
   temblor sin memoria) hasta que se tome la foto del lado, o `max` cuadros. */
async function temblar(E, lado, cara, amp, max, semilla) {
  const { P, video, correr } = E, azar = azarDe(semilla || 3);
  const letreros = []; let n = 0;
  for (; n < max && !P.ev('FOTOS.cedula_' + lado); n++) {
    video.__px = cuadroDeVideo(cara, Math.round((azar() * 2 - 1) * amp), Math.round((azar() * 2 - 1) * amp));
    await correr(100);
    const l = P.ev("$('docEstado').textContent");
    if (letreros[letreros.length - 1] !== l) letreros.push(l);
  }
  return { cuadros: n, tomada: !!P.ev('FOTOS.cedula_' + lado), letreros };
}
/* ±17 px del video por eje: hasta 1 px de gris por eje, 1,3 px por cuadro en
   promedio sumando los dos ejes. Lo que da una mano a 12 cm, y lo que la
   medición llama «~1 px de gris».
   26-oct-2026 (integración con marco-de-pie) — «1 px de gris por eje» es lo
   que se mantiene: con el marco de pie son ~20 px del video (pxPorGrisEn). */
const TEMBLOR = guia => Math.round(pxPorGrisEn(guia));
/* EL CÓDIGO DE JOAN: el lector lo ENCUENTRA y no lo lee ('ilegible'). Con un
   PDF417 que sí se lee, leerlo dispara al instante sin racha ni ventana —
   con la regla vieja también—, y no es lo que le pasó. Lo demás (la puerta,
   la ventana del mejor cuadro, el patrón, la franja) corre de verdad. */
const lectorQueVeSinLeer = P => P.ev("window.__leerReal = window.__leerReal || leerCedulaDeLienzo; leerCedulaDeLienzo = function () { return { cedula: null, error: 'ilegible', giro: null, patron: false }; };");
/* El frente se mira con el lector de verdad: con el de arriba, cualquier
   lienzo «trae código» y el frente se tomaría por el respaldo. */
const lectorDeVerdad = P => P.ev('if (window.__leerReal) leerCedulaDeLienzo = window.__leerReal;');
/* La regla vieja: el umbral absoluto de 6 y la racha sin huecos. EC.TARJETA es
   el objeto del módulo, el MISMO en todas las páginas del banco: lo que se
   cambia aquí se devuelve al terminar (si no, envenena la prueba siguiente). */
const TEMBLOR_MAX = EC.TARJETA.TEMBLOR_MAX, HUECO_CUADROS = EC.TARJETA.HUECO_CUADROS;
const viejaRegla = () => { EC.TARJETA.TEMBLOR_MAX = 0; EC.TARJETA.HUECO_CUADROS = 0; };
const reglaDeHoy = () => { EC.TARJETA.TEMBLOR_MAX = TEMBLOR_MAX; EC.TARJETA.HUECO_CUADROS = HUECO_CUADROS; };

describe('la página con la mano temblando', () => {

  test('CON LA REGLA VIEJA (lo que vio Joan): ni el respaldo ni el frente se toman en 6 s', async () => {
    viejaRegla();
    try {
      const E = abrirConCamara();
      const guia = await encender(E, 'reverso');
      assert.equal(E.P.ev('EC.TARJETA.TEMBLOR_MAX'), 0, 'la página no ve la regla vieja: la prueba no prueba el caso');
      lectorQueVeSinLeer(E.P);
      const r = await temblar(E, 'reverso', caraEnVideo('reverso', guia), TEMBLOR(guia), 60);
      assert.equal(r.tomada, false, 'la prueba no prueba el caso: con la regla vieja el respaldo se tomó solo en ' + r.cuadros + ' cuadros');
      assert.ok(r.letreros.some(l => /Sostenla ahí/.test(l)), 'la puerta nunca dijo que se movía: ' + r.letreros.join(' | '));
      const S = abrirConCamara();
      await encender(S, 'frente');
      const f = await temblar(S, 'frente', caraEnVideo('frente', guia), TEMBLOR(guia), 60, 5);
      assert.equal(f.tomada, false, 'la prueba no prueba el caso: con la regla vieja el frente se tomó solo en ' + f.cuadros + ' cuadros');
    } finally { reglaDeHoy(); }
  });

  test('CON LA DE HOY: el respaldo (código visto sin leer) se toma solo en menos de 6 s, y el frente después también', async () => {
    const E = abrirConCamara();
    const guia = await encender(E, 'reverso');
    lectorQueVeSinLeer(E.P);
    const r = await temblar(E, 'reverso', caraEnVideo('reverso', guia), TEMBLOR(guia), 60);
    assert.ok(r.tomada, 'el respaldo no se tomó con el temblor: ' + r.letreros.join(' | '));
    assert.ok(r.cuadros <= 60, 'tardó ' + r.cuadros + ' cuadros');
    assert.equal(E.P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), false, 'la prueba no prueba el caso: el código se leyó');
    assert.equal(E.P.ev('tipoDelRespaldo()'), 'amarilla', 'el código visto sin leer no la marcó como la amarilla');
    /* La página pasa sola al frente a los 4,5 s (el texto del código sin leer). */
    await E.correr(4600);
    assert.equal(E.P.ev('ESCDOC.lado'), 'frente', 'no pasó al frente');
    lectorDeVerdad(E.P);
    const f = await temblar(E, 'frente', caraEnVideo('frente', guia), TEMBLOR(guia), 60, 5);
    assert.ok(f.tomada, 'el frente no se tomó con el temblor: ' + f.letreros.join(' | '));
    assert.ok(f.cuadros <= 60, 'el frente tardó ' + f.cuadros + ' cuadros');
    assert.equal(E.P.ev("$('docListoTxt').textContent"), 'Listo: las dos caras.');
    /* Ningún letrero pidió lo que una mano no da. */
    assert.equal(r.letreros.concat(f.letreros).some(l => /^Quieta…$/.test(l)), false, r.letreros.concat(f.letreros).join(' | '));
  });

  test('…y con un código que SÍ se lee, se lee y dispara igual que siempre, temblando', async () => {
    const E = abrirConCamara();
    const guia = await encender(E, 'reverso');
    const r = await temblar(E, 'reverso', caraEnVideo('reverso', guia), TEMBLOR(guia), 60);
    assert.ok(r.tomada, 'el respaldo legible no se tomó con el temblor: ' + r.letreros.join(' | '));
    assert.equal(E.P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), true, 'se tomó pero no se leyó el código');
  });

  test('deslizándose (6 px de gris por cuadro) nunca se toma; sin cédula, tampoco', async () => {
    const E = abrirConCamara();
    const guia = await encender(E, 'reverso');
    const cara = caraEnVideo('reverso', guia), paso = Math.round(6 * pxPorGrisEn(guia));
    for (let i = 0; i < 80 && !E.P.ev('FOTOS.cedula_reverso'); i++) {
      E.video.__px = cuadroDeVideo(cara, 0, (i - 40) * paso);
      await E.correr(100);
    }
    assert.equal(E.P.ev('FOTOS.cedula_reverso'), undefined, 'se tomó una cédula que se estaba deslizando');
    const S = abrirConCamara();
    await encender(S, 'reverso');
    S.video.__px = cuadroDeVideo(null, 0, 0);
    for (let i = 0; i < 40; i++) await S.correr(100);
    assert.equal(S.P.ev('FOTOS.cedula_reverso'), undefined, 'se tomó una mesa');
    assert.equal(S.P.ev('ESCDOC.estables'), 0);
  });
});

/* ==========================================================================
 * 4. LAS LETRAS SE LEEN AUNQUE EL CÓDIGO NO SE HAYA VISTO (regla del 26-oct)
 * Joan: «yo fui muy claro indicando que no leas el código de barras y mejor
 * lee lo que está legible en la cédula; en la foto veo perfectamente el nombre
 * y número de cédula, no hay por qué pedirlo». El respaldo cuya prueba de ser
 * la amarilla no se vio (la marca '') ahora pasa por las letras; solo la
 * DIGITAL probada (su QR visto) no. La reja de verdad y sus textos se prueban
 * en pruebas/la-digital-no-se-lee.test.js y escaner-ocr-de-punta-a-punta;
 * aquí, el letrero de «Tomar la foto ahora» con el respaldo desconocido.
 * ======================================================================== */
describe('«Tomar la foto ahora» con un respaldo que no se sabe cuál es: promete las letras, y es verdad', () => {
  test('sin código ni QR vistos: «te llenamos lo que alcancemos a leer de las letras», y las franjas quedan pendientes', async () => {
    const E = abrirConCamara();
    const guia = await encender(E, 'reverso');
    /* El respaldo sin su PDF417 (una amarilla tan gastada que no se ve): la
       tarjeta de las letras, con su textura y nada más. */
    const cara = caraEnVideo('frente', guia);   // una cara sin código: lo que se prueba es la marca ''
    E.video.__px = cuadroDeVideo(cara, 0, 0);
    await E.correr(300);
    E.P.ev('capturarDoc()');
    assert.ok(E.P.ev('FOTOS.cedula_reverso'));
    assert.equal(E.P.ev('tipoDelRespaldo()'), '', 'la prueba no prueba el caso: el respaldo quedó probado como algo');
    assert.equal(E.P.ev('!!OCR_CEDULA.pendientes.reverso'), true, 'con la marca vacía no dejó las franjas pendientes');
    assert.match(E.P.ev("$('docListoTxt').textContent"), /te llenamos lo que alcancemos a leer de las letras/);
  });
});
