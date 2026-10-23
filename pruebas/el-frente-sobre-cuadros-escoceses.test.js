'use strict';
/* ==========================================================================
 * EL FRENTE SOBRE UNA TELA DE CUADROS ESCOCESES — 23 de octubre de 2026
 *
 *   node --test pruebas/el-frente-sobre-cuadros-escoceses.test.js
 *
 * La verificación del lote del 27-oct (lente «escáner», confirmada por dos
 * refutadores) encontró el FRENTE guardado como respaldo otra vez, ahora por
 * la FRANJA SOLA. El escáner pide primero el respaldo; la persona comete el
 * error del 19-oct y muestra el frente, con la cédula sobre una camisa, un
 * mantel o una cobija de cuadros escoceses: rayas finas verticales (1,5 a
 * 2,5 mm) cuyo contraste cambia por bandas horizontales. En la tela que queda
 * entre el borde de la tarjeta y el del marco eso es una racha de filas «de
 * barras» que no toca el borde del gris, cae en las filas del marco, en el
 * tercio de abajo, y pasa el 5 % del alto: EC.franjaComoLaDelCodigo la
 * aceptaba, eso es «vioFranja», y a los 2,6 s ECAP.decidirVentana disparaba
 * la foto sin código. El frente quedaba en cedula_reverso («Foto tomada. El
 * código no se pudo leer… Ahora el frente.»), el paso del frente guardaba el
 * mismo cuadro, el registro pasaba solo a «Revisa tus datos», y el respaldo
 * —el PDF417, la expedición, la huella— no se guardaba nunca.
 *
 * a21746b y 3be12a8 (las filas, las columnas y el piso de la tarjeta)
 * cubrían rayas uniformes, no rayas cuyo contraste cambia por filas. El
 * arreglo decidido: la franja sola YA NO toma la foto. Calla el «voltéala»
 * (lo que necesitaba el código gastado) e invita a tocar «Tomar la foto
 * ahora»: decide la persona, que ve qué lado tiene.
 *
 * Las dos escenas son las del hallazgo (semillas 110 y 64 de
 * ver-27/repro-escoces.jsonl), con la cédula nítida fabricada del
 * repositorio: ninguna foto de nadie. Las dos FALLAN con c3c3439 (la
 * segunda, porque la foto ya se había tomado sola antes del toque).
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ECAP = require('../app/escaner-captura.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');
const { VIDEO, escalar, abrirConCamara } = require('./banco-camara.js');

function azarDe(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* El frente nítido fabricado, sin el aire del recorte (1000 × 631). */
let FRENTE = null;
function frente() {
  if (FRENTE) return FRENTE;
  const c = leerPGM(path.join(__dirname, 'cedula-nitida-frente.pgm.gz'));
  const o = new Uint8ClampedArray(1000 * 631);
  for (let y = 0; y < 631; y++) for (let x = 0; x < 1000; x++) o[y * 1000 + x] = c.gris[(38 + y) * c.w + 60 + x];
  FRENTE = { gris: o, w: 1000, h: 631 };
  return FRENTE;
}

/* LA TELA: rayas verticales finas (paso mmV, ±ampV) que están enteras solo
   dentro de bandas horizontales (paso mmB, ocupan dB del paso); fuera, al
   kFuera de su contraste; y una banda de color (±ampH) con el mismo paso. Es
   el tejido de un escocés de sarga, en gris. */
function tela(m, pxmm) {
  const an = (m.ang || 0) * Math.PI / 180, co = Math.cos(an), si = Math.sin(an);
  const PV = m.mmV * pxmm, PB = m.mmB * pxmm;
  return (x, y) => {
    const xr = x * co + y * si, yr = -x * si + y * co;
    const fb = (yr / PB) - Math.floor(yr / PB);
    const enBanda = fb < m.dB;
    const v = Math.sin(2 * Math.PI * xr / PV) * m.ampV * (enBanda ? 1 : m.kFuera);
    return m.base + v + (enBanda ? m.ampH : -m.ampH);
  };
}

/* La escena del video 4K: la tela, y encima la tarjeta (al revés si giro 180,
   un poco girada `rot` grados y corrida), con el ruido del sensor. */
function escena(guia, c) {
  const t = frente();
  const largo = guia.w * c.esc, pxmm = largo / 85.6;
  const px = new Uint8ClampedArray(VIDEO.W * VIDEO.H);
  const y0 = Math.max(0, guia.y - 300), y1 = Math.min(VIDEO.H, guia.y + guia.h + 300);
  const f = tela(c.mesa, pxmm);
  px.fill(c.mesa.base);
  for (let y = y0; y < y1; y++) for (let x = 0; x < VIDEO.W; x++) px[y * VIDEO.W + x] = f(x, y);
  let img = escalar(t, largo / 1000);
  if (c.giro === 180) { const g = new Uint8ClampedArray(img.gris.length); for (let i = 0; i < g.length; i++) g[i] = img.gris[g.length - 1 - i]; img = { gris: g, w: img.w, h: img.h }; }
  const cx = guia.x + guia.w / 2 + c.dx * guia.w, cy = guia.y + guia.h / 2 + c.corrida * guia.h;
  const rot = c.rot * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  const R = Math.ceil(Math.hypot(img.w, img.h) / 2) + 2;
  for (let Y = Math.max(0, Math.floor(cy - R)); Y < Math.min(VIDEO.H, Math.ceil(cy + R)); Y++) {
    for (let X = Math.max(0, Math.floor(cx - R)); X < Math.min(VIDEO.W, Math.ceil(cx + R)); X++) {
      const ddx = X + 0.5 - cx, ddy = Y + 0.5 - cy;
      const u = cr * ddx + sr * ddy + img.w / 2 - 0.5, v = -sr * ddx + cr * ddy + img.h / 2 - 0.5;
      if (u < 0 || v < 0 || u > img.w - 1 || v > img.h - 1) continue;
      const u0 = Math.floor(u), v0 = Math.floor(v), au = u - u0, av = v - v0;
      const u1 = Math.min(img.w - 1, u0 + 1), v1 = Math.min(img.h - 1, v0 + 1);
      const g = img.gris;
      px[Y * VIDEO.W + X] = (g[v0 * img.w + u0] * (1 - au) + g[v0 * img.w + u1] * au) * (1 - av) +
                            (g[v1 * img.w + u0] * (1 - au) + g[v1 * img.w + u1] * au) * av;
    }
  }
  const az = azarDe(c.sem);
  for (let i = y0 * VIDEO.W; i < y1 * VIDEO.W; i++) px[i] = px[i] + c.ruido * (az() + az() + az() - 1.5) * 2;
  return px;
}

/* Las dos del hallazgo: tomadas como respaldo a los 2,6 s por la franja sola. */
const ESCOCESES = [
  { nombre: 'sem 110 (±32, rayas de 1,71 mm, bandas de 6,5 mm)', esc: 0.837, corrida: -0.028, dx: 0.028, giro: 180, rot: -0.96, ruido: 3.5, sem: 110,
    mesa: { ampV: 32, mmV: 1.71, mmB: 6.5, dB: 0.62, kFuera: 0.52, ampH: 28, ang: -1.6, base: 132 } },
  { nombre: 'sem 64 (±32, rayas de 2,32 mm, bandas de 24,7 mm)', esc: 0.837, corrida: 0.02, dx: -0.019, giro: 180, rot: 1.35, ruido: 2.6, sem: 64,
    mesa: { ampV: 32, mmV: 2.32, mmB: 24.7, dB: 0.61, kFuera: 0.1, ampH: 6, ang: 3.6, base: 150 } }
];

/* El paso del RESPALDO (el primero que pide el escáner), con la escena
   delante, hasta `max` cuadros de 100 ms. */
async function mirar(c, max) {
  const E = abrirConCamara();
  const { P, video, correr } = E;
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  await correr(150);
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  video.__px = escena(guia, c);
  const letreros = []; let vioFranja = false, vioCodigo = false, t = 0;
  for (let i = 0; i < max && !P.ev('FOTOS.cedula_reverso'); i++) {
    await correr(100);
    t = (i + 1) / 10;
    const l = P.ev("$('docEstado').textContent");
    if (letreros[letreros.length - 1] !== l) letreros.push(l);
    if (P.ev('ESCDOC.vioFranja === true')) vioFranja = true;
    if (P.ev('!!ESCDOC.vioCodigo')) vioCodigo = true;
  }
  return { P, letreros, vioFranja, vioCodigo, t, tomada: !!P.ev('FOTOS.cedula_reverso') };
}

describe('el frente sobre cuadros escoceses, en el paso del respaldo', () => {

  test('no se guarda como respaldo: la franja de la tela invita a «Tomar la foto ahora», no dispara', async (t) => {
    for (const c of ESCOCESES) {
      const r = await mirar(c, 60);
      const que = c.nombre + ' (' + r.t + ' s): ' + r.letreros.join(' | ');
      t.diagnostic(que);
      assert.equal(r.tomada, false, 'el FRENTE se guardó como respaldo por la franja de la tela. ' + que);
      assert.equal(r.vioCodigo, false, 'vio un código en la tela: la prueba ya no prueba la franja sola. ' + que);
      assert.equal(r.vioFranja, true, 'la tela ya no deja franja: la prueba ya no prueba el caso. ' + que);
      assert.ok(r.letreros.includes(ECAP.TEXTO.SOLO_FRANJA), 'no invitó a tocar «Tomar la foto ahora». ' + que);
      assert.equal(r.P.ev('ESCDOC.lado'), 'reverso', 'el escáner pasó al frente. ' + que);
      assert.equal(r.P.ev('!!ESCDOC.activo'), true, 'el escáner dejó de mirar. ' + que);
    }
  });

  test('con el toque de la persona sí se guarda (lo pidió), sin datos leídos', async () => {
    const r = await mirar(ESCOCESES[0], 40);
    assert.equal(r.tomada, false, 'se tomó sola antes del toque');
    r.P.ev('capturarDoc()');
    assert.ok(r.P.ev('FOTOS.cedula_reverso'), 'el toque no guardó la foto');
    assert.equal(r.P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), false);
    assert.match(r.P.ev("$('docListoTxt').textContent"), /El código no se pudo leer/);
  });
});
