'use strict';
/* ==========================================================================
 * LA SILUETA CON FORMA DE CARA, Y DOS SEGUNDOS EN VERDE — 26-oct-2026
 *
 *   node --test pruebas/la-silueta-y-los-dos-segundos.test.js
 *
 * Joan, con el iPhone: «la foto facial aparece un óvalo pero no tiene forma
 * de cara y te pide la app que te centres en el óvalo lo cual nunca pasará,
 * las caras tienen forma de huevo, y tampoco se tomó la foto
 * automáticamente, quiero que se vea escaneando y que cuando se ponga verde
 * se tome la foto automáticamente después de 2 segundos en color verde».
 *
 * Lo que se vigila:
 *   1. LA CUENTA EN VERDE (RostroEnVivo.contarVerde, pura): dispara a los
 *      MS_VERDE de la primera detección verde y nunca antes; un parpadeo del
 *      detector no la reinicia; perder la cara, o un detector que dejó de
 *      mirar, sí; y el estado son solo tiempos y conteos.
 *   2. EL CENTRO MEDIDO MÁS ABAJO (OVALO.dy): con la cabeza centrada en la
 *      silueta la caja del detector —que va de la frente al mentón— ya no
 *      queda al borde de «descentrada». Medido con el detector de verdad en
 *      Chrome sin ventana (scratchpad/lote-26/rostro-huevo/medicion.md).
 *   3. LA SILUETA en la página: más ancha en la frente que en la mandíbula,
 *      alto 1,35 veces el ancho, sin ctx.ellipse; el aro de la cuenta la
 *      recorre desde la coronilla.
 *   4. LA PÁGINA: dispara a los dos segundos en verde; la cara que se pierde
 *      reinicia; con un rostro-en-vivo.js VIEJO en la caché (sin contarVerde)
 *      sigue disparando con la racha de antes; la cuenta muere con la cámara.
 *   5. LOS TEXTOS: «la silueta» en la página, en el módulo y en la política,
 *      que además dice los dos segundos.
 * Las que prueban lo nuevo FALLAN con 375a715.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RV = require('../app/rostro-en-vivo.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const FUENTE_RV = fs.readFileSync(path.join(RAIZ, 'app', 'rostro-en-vivo.js'), 'utf8');
const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
const PRIV = fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8');
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));
const sinComentarios = t => t.replace(/(^|[\s;{}(,])\/\*[\s\S]*?\*\//g, '$1 ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const R = RV.ROSTRO;
const CARA = { x: 0.32, y: 0.275, w: 0.36, h: 0.45 };
const verde = () => ({ ok: true, falla: '', cara: CARA });
const parpadeo = () => ({ ok: false, falla: 'movimiento', cara: CARA });
const sinCara = () => ({ ok: false, falla: 'sin_cara', cara: null });
/* Una secuencia [medida, ms] por contarVerde: devuelve en qué ms disparó (o null) y el último resultado. */
function correr(seq) {
  let e = null, r = null, disparo = null;
  seq.forEach(([m, t]) => { r = RV.contarVerde(e, m, t); e = r.estado; if (r.disparar && disparo === null) disparo = t; });
  return { disparo, r };
}

/* --------------------------------------------------------------------------
   1. LA CUENTA EN VERDE
   -------------------------------------------------------------------------- */
describe('1. contarVerde: dos segundos en verde, con los parpadeos tolerados', () => {

  test('dispara en la primera detección verde a MS_VERDE o más de la primera verde, y nunca antes', () => {
    assert.equal(R.MS_VERDE, 2000, 'Joan pidió dos segundos');
    [167, 250, 500].forEach(paso => {
      const seq = []; for (let t = 0; t <= 3000; t += paso) seq.push([verde(), t]);
      const { disparo } = correr(seq);
      assert.ok(disparo !== null, 'a ' + paso + ' ms por detección no disparó');
      assert.ok(disparo >= R.MS_VERDE, 'a ' + paso + ' ms por detección disparó a los ' + disparo + ' ms');
      assert.ok(disparo < R.MS_VERDE + paso, 'a ' + paso + ' ms por detección disparó tarde: ' + disparo + ' ms');
    });
    /* Antes de los dos segundos, nunca: ni con todo verde. */
    const { disparo } = correr([[verde(), 0], [verde(), 100], [verde(), 1999]]);
    assert.equal(disparo, null);
  });

  test('un parpadeo del detector entre dos verdes no reinicia la cuenta (a 6/s y a 2/s)', () => {
    /* 6 por segundo: verde, «movimiento», verde. */
    let { r } = correr([[verde(), 0], [verde(), 167], [parpadeo(), 334], [verde(), 501]]);
    assert.equal(r.enVerde, true); assert.equal(r.ms, 501, 'el parpadeo reinició la cuenta');
    /* Dos seguidas dentro de MS_PARPADEO desde la última verde, también. */
    ({ r } = correr([[verde(), 0], [verde(), 167], [parpadeo(), 334], [parpadeo(), 501], [verde(), 668]]));
    assert.equal(r.ms, 668, 'dos parpadeos en ' + R.MS_PARPADEO + ' ms reiniciaron la cuenta');
    /* 2 por segundo (Safari, un Android barato): UNA no verde seguida se tolera aunque el hueco pase de MS_PARPADEO. */
    ({ r } = correr([[verde(), 0], [verde(), 500], [parpadeo(), 1000], [verde(), 1500]]));
    assert.equal(r.ms, 1500, 'a 2 detecciones por segundo un solo parpadeo reinició la cuenta');
    /* Y el que se tolera es un parpadeo: la detección que lo trae lo dice. */
    ({ r } = correr([[verde(), 0], [parpadeo(), 200]]));
    assert.equal(r.parpadeo, true); assert.equal(r.enVerde, true);
    /* Una detección tolerada no dispara aunque la cuenta llegue a los dos segundos: dispara una verde. */
    ({ r } = correr([[verde(), 0], [verde(), 1000], [verde(), 1900], [parpadeo(), 2100]]));
    assert.equal(r.disparar, false, 'disparó con una detección que no era verde');
    assert.equal(r.ms, 2100);
  });

  test('pero dos no verdes seguidas más allá de MS_PARPADEO sí reinician (la persona se movió de verdad)', () => {
    const { r } = correr([[verde(), 0], [verde(), 500], [parpadeo(), 1000], [parpadeo(), 1500], [verde(), 2000]]);
    assert.equal(r.ms, 0, 'dos «movimiento» seguidas a 2/s no reiniciaron la cuenta');
    assert.equal(r.enVerde, true, 'la verde nueva no abrió una cuenta nueva');
  });

  test('perder la cara más de MS_PERDIDA reinicia; una sola detección sin cara, pegada a la anterior, no', () => {
    let { r } = correr([[verde(), 0], [verde(), 167], [sinCara(), 334], [verde(), 501]]);
    assert.equal(r.ms, 501, 'una detección sin cara a 167 ms de la última reinició la cuenta');
    ({ r } = correr([[verde(), 0], [verde(), 167], [sinCara(), 334], [sinCara(), 600]]));
    assert.equal(r.enVerde, false, 'sin cara ' + (600 - 167) + ' ms y la cuenta siguió');
    ({ r } = correr([[verde(), 0], [verde(), 500], [sinCara(), 1000]]));
    assert.equal(r.enVerde, false, 'a 2/s, una detección sin cara 500 ms después de la última cara y la cuenta siguió');
  });

  test('un hueco entre verdes mayor que MS_HUECO_MAX (el detector dejó de mirar) reinicia, y avanceVerde lo ve antes', () => {
    const { r } = correr([[verde(), 0], [verde(), 500], [verde(), 500 + R.MS_HUECO_MAX + 1]]);
    assert.equal(r.ms, 0, 'tras un hueco de ' + (R.MS_HUECO_MAX + 1) + ' ms la cuenta siguió llenándose por el reloj');
    assert.equal(r.enVerde, true);
    const e = correr([[verde(), 0], [verde(), 500]]).r.estado;
    assert.deepEqual(RV.avanceVerde(e, 1500), { enVerde: true, ms: 1500, avance: 0.75, segundos: 1 });
    assert.deepEqual(RV.avanceVerde(e, 600), { enVerde: true, ms: 600, avance: 0.3, segundos: 2 });
    assert.equal(RV.avanceVerde(e, 500 + R.MS_HUECO_MAX + 1).enVerde, false, 'el aro siguió lleno sin detecciones');
    assert.equal(RV.avanceVerde(null, 100).enVerde, false);
  });

  test('el estado son solo tiempos y conteos: nunca dónde estaba la cara', () => {
    const { r } = correr([[verde(), 0], [verde(), 167], [parpadeo(), 334]]);
    assert.deepEqual(Object.keys(r.estado).sort(), ['activa', 'desde', 'miradas', 'parpadeos', 'ultimaCara', 'ultimoVerde', 'verdes']);
    Object.values(r.estado).forEach(v => assert.equal(typeof v, 'number'));
    assert.equal(/cara|0\.32|0\.275/.test(JSON.stringify(r.estado)), false);
    /* Y aguanta basura: un estado que no es un estado empieza de cero. */
    assert.equal(RV.contarVerde('x', verde(), 10).ms, 0);
    assert.equal(RV.contarVerde({ activa: 'sí', desde: NaN }, verde(), 10).enVerde, true);
  });
});

/* --------------------------------------------------------------------------
   2. EL CENTRO, MEDIDO MÁS ABAJO
   -------------------------------------------------------------------------- */
describe('2. el centro contra el que se mide la caja va OVALO.dy más abajo', () => {
  const O = RV.OVALO;
  const bien = (cara) => RV.medirRostro([Object.assign({ score: 0.9 }, cara)], { luz: 128, nitidez: 30, mejorNitidez: 30, previa: cara });

  test('la cabeza que llena la silueta, centrada (la caja medida: f = 0,62, 0,74 del alto) pasa con margen', () => {
    /* Lo medido en Chrome sin ventana con el detector de verdad (a-llena):
       cabeza de 0,140 a 0,861 de la zona; caja de 0,325 a 0,857. */
    const caja = { x: 0.32, y: 0.325, w: 0.36, h: 0.532 };
    const m = bien(caja);
    assert.equal(m.ok, true, 'con la cabeza centrada en la silueta dice «' + m.falla + '» (desvío ' + m.desvio.toFixed(2) + ')');
    assert.ok(m.desvio < 0.1, 'la cabeza centrada sigue al borde de «descentrada»: ' + m.desvio.toFixed(2));
    assert.ok(O.dy > 0.15 && O.dy < 0.3, 'dy=' + O.dy + ' no es el pequeño desplazamiento medido (0,23-0,26 con la cabeza centrada)');
  });

  test('y la ventana queda simétrica: la cabeza un poco más abajo o más arriba de la silueta pasa igual', () => {
    const d = 0.2 * O.ry;   // un quinto del radio
    const centrada = { x: 0.32, y: 0.325, w: 0.36, h: 0.532 };
    assert.equal(bien(Object.assign({}, centrada, { y: centrada.y + d })).ok, true, 'la cabeza un poco más abajo ya no pasa');
    assert.equal(bien(Object.assign({}, centrada, { y: centrada.y - d })).ok, true, 'la cabeza un poco más arriba ya no pasa');
    /* Lejos de la silueta, sigue diciendo «descentrada». */
    assert.equal(bien(Object.assign({}, centrada, { y: centrada.y + 0.5 * O.ry })).falla, 'descentrada');
    assert.equal(bien(Object.assign({}, centrada, { y: centrada.y - 0.5 * O.ry })).falla, 'descentrada');
    assert.equal(bien(Object.assign({}, centrada, { x: 0.05 })).falla, 'descentrada');
  });
});

/* --------------------------------------------------------------------------
   3. LA SILUETA EN LA PÁGINA
   -------------------------------------------------------------------------- */
function lienzoQueAnota(P) {
  P.ev('window.__args = [];' +
    'window.__ctx2 = new Proxy({}, { get: function (t, k) { if (k in t) return t[k];' +
    '  return function () { window.__args.push([k].concat([].slice.call(arguments))); return k === "createLinearGradient" ? { addColorStop: function () {} } : undefined; }; },' +
    '  set: function (t, k, v) { t[k] = v; return true; } });');
  return () => JSON.parse(P.ev('JSON.stringify(window.__args.splice(0))'));
}
/* Los trazos de un path: desde un moveTo hasta el siguiente moveTo/closePath. */
function paths(args) {
  const out = []; let cur = null;
  args.forEach(a => {
    if (a[0] === 'moveTo') { cur = { pts: [[a[1], a[2]]], cerrado: false }; out.push(cur); }
    else if (a[0] === 'lineTo' && cur) cur.pts.push([a[1], a[2]]);
    else if (a[0] === 'closePath' && cur) { cur.cerrado = true; cur = null; }
    else if (a[0] === 'stroke' || a[0] === 'clip' || a[0] === 'fill') cur = null;
  });
  return out;
}

describe('3. la silueta tiene forma de cabeza', () => {
  test('más ancha en la frente que en la mandíbula, el alto 1,35 veces el ancho, cerrada, sin ctx.ellipse', () => {
    const P = abrirPlay();
    const trazos = lienzoQueAnota(P);
    P.ev('dibujarMarco(window.__ctx2, 720, 960, 1, false, 0, { cara: null })');
    const args = trazos();
    assert.equal(args.some(a => a[0] === 'ellipse'), false, 'sigue dibujando un óvalo');
    const sil = paths(args).find(p => p.cerrado && p.pts.length > 20);
    assert.ok(sil, 'no hay una silueta cerrada de muchos puntos');
    const cx = 360, cy = 480, ry = 960 * 0.36;
    const ys = sil.pts.map(p => p[1]), xs = sil.pts.map(p => p[0]);
    assert.ok(Math.abs(Math.min(...ys) - (cy - ry)) < 1 && Math.abs(Math.max(...ys) - (cy + ry)) < 1, 'la silueta no va de la coronilla al mentón del marco de decisión');
    const alto = Math.max(...ys) - Math.min(...ys), ancho = Math.max(...xs) - Math.min(...xs);
    assert.ok(alto / ancho > 1.3 && alto / ancho < 1.4, 'alto/ancho = ' + (alto / ancho).toFixed(2) + ' (una cabeza es ~1,35)');
    /* El ancho a una altura: la frente (un cuarto por encima del centro) contra la mandíbula (la mitad por debajo). */
    const anchoEn = y => { const cerca = sil.pts.filter(p => Math.abs(p[1] - y) < ry * 0.08); return Math.max(...cerca.map(p => p[0])) - Math.min(...cerca.map(p => p[0])); };
    const frente = anchoEn(cy - 0.25 * ry), mandibula = anchoEn(cy + 0.5 * ry);
    assert.ok(frente > mandibula * 1.25, 'la frente (' + frente.toFixed(0) + ') no es claramente más ancha que la mandíbula (' + mandibula.toFixed(0) + '): es un óvalo, no un huevo');
    /* Simétrica: el lienzo está espejado y no se puede notar. */
    sil.pts.forEach(p => assert.ok(sil.pts.some(q => Math.abs(q[0] - (2 * cx - p[0])) < 0.01 && Math.abs(q[1] - p[1]) < 0.01), 'la silueta no es simétrica'));
  });

  test('el aro de la cuenta recorre la silueta desde la coronilla, abierto, y llega a donde va la cuenta', () => {
    const P = abrirPlay();
    const trazos = lienzoQueAnota(P);
    P.ev('dibujarMarco(window.__ctx2, 720, 960, 1, true, 0.5, { cara: ' + JSON.stringify(CARA) + ', conCara: true })');
    const ps = paths(trazos());
    const abiertos = ps.filter(p => !p.cerrado && p.pts.length > 10);
    assert.equal(abiertos.length, 1, 'el aro de avance no es un solo tramo abierto: ' + abiertos.length);
    const aro = abiertos[0], cy = 480, ry = 960 * 0.36 + 6;
    assert.ok(Math.abs(aro.pts[0][0] - 360) < 0.01 && Math.abs(aro.pts[0][1] - (cy - ry)) < 0.01, 'el aro no empieza en la coronilla');
    const fin = aro.pts[aro.pts.length - 1];
    assert.ok(Math.abs(fin[0] - 360) < 0.01 && Math.abs(fin[1] - (cy + ry)) < 0.01, 'con la mitad de la cuenta el aro no llega al mentón: ' + JSON.stringify(fin));
    /* Y el relleno desde abajo sigue la silueta (recorta con ella) y sube hasta la mitad. */
    P.ev('dibujarMarco(window.__ctx2, 720, 960, 1, true, 0.5, { cara: ' + JSON.stringify(CARA) + ', conCara: true })');
    const args = trazos();
    const iClip = args.findIndex(a => a[0] === 'clip'), iFill = args.findIndex(a => a[0] === 'fillRect');
    assert.ok(iClip >= 0 && iFill > iClip, 'el relleno no está recortado por la silueta');
    const fr = args[iFill];
    assert.ok(Math.abs(fr[2] - cy) < 0.01 && Math.abs(fr[4] - (960 * 0.36)) < 0.01, 'el relleno no sube hasta la mitad: ' + JSON.stringify(fr));
  });
});

/* --------------------------------------------------------------------------
   4. LA PÁGINA
   -------------------------------------------------------------------------- */
function reloj() {
  let ahora = Date.UTC(2026, 9, 26, 15, 0, 0);
  const Real = Date;
  class Reloj extends Real { constructor(...a) { if (a.length) super(...a); else super(ahora); } static now() { return ahora; } }
  return { Reloj, avanzar: ms => { ahora += ms; } };
}
function conModulo(P, o) {
  o = o || {};
  P.ev(FUENTE_RV);
  if (o.viejo) P.ev('delete window.RostroEnVivo.contarVerde; delete window.RostroEnVivo.avanceVerde; window.RostroEnVivo.VERSION = "2026-10-22";');
  P.ev('window.__cajas = ' + JSON.stringify(o.cajas || [{ x: 102.4, y: 110, width: 115.2, height: 180 }]) + ';' +
    'window.faceapi = { nets: { tinyFaceDetector: { isLoaded: true, dispose: function () { window.__soltado = true; } } },' +
    '  TinyFaceDetectorOptions: function () {}, tf: { ready: function () { return Promise.resolve(); }, getBackend: function () { return "webgl"; } },' +
    '  detectAllFaces: function () { var r = window.__cajas.map(function (b) { return { box: b, score: 0.9 }; });' +
    '    return { run: function () { return Promise.resolve(r); } }; } };');
  P.ev('window.cargarScript = function () { return Promise.resolve(); };');
  P.ev('window.__disparo = 0; capturarRostro = function () { window.__disparo++; detenerEscaner(); };');
  P.ev('lienzoParaDetectar = function () { return { width: 320, height: 400 }; }; nitidezDeCara = function () { return window.__nit === undefined ? 25 : window.__nit; };');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
}
async function arrancar(P) {
  P.ev('iniciarEscaner()');
  await esperar(); await esperar();
  assert.equal(P.ev('ESCANER.modo'), 'rostro', 'el detector de mentira no se encendió: la prueba no mediría nada');
}
/* Una detección cada `paso` ms hasta `n` veces o el disparo; devuelve en cuál disparó (o null). */
async function detectar(P, rj, n, paso) {
  for (let i = 1; i <= n; i++) {
    P.ev("detectarCara($('camVideo'), 128)"); await esperar();
    if (P.ev('window.__disparo')) return i;
    rj.avanzar(paso);
  }
  return null;
}

describe('4. la página dispara a los dos segundos en verde', () => {

  test('la cara que se pierde (más de MS_PERDIDA sin cara) reinicia la cuenta, y la foto sale dos segundos después de que vuelve', async () => {
    const rj = reloj();
    const P = abrirPlay({ Date: rj.Reloj });
    conModulo(P);
    await arrancar(P);
    /* Cuatro detecciones con cara (la segunda abre la cuenta), después la cara se va 750 ms, y vuelve. */
    assert.equal(await detectar(P, rj, 4, 250), null);
    assert.equal(P.ev('ESCANER.verde.activa'), 1, 'la cuenta no arrancó con la cara en verde');
    P.ev('window.__cajas = [];');
    assert.equal(await detectar(P, rj, 3, 250), null);
    assert.equal(P.ev('ESCANER.verde.activa'), 0, 'con 500 ms sin cara la cuenta siguió andando');
    P.ev('window.__cajas = [{ x: 102.4, y: 110, width: 115.2, height: 180 }];');
    /* Si no hubiera reiniciado, dispararía en la detección 10 desde el arranque; ahora cuenta de nuevo. */
    const k = await detectar(P, rj, 20, 250);
    assert.ok(k !== null, 'con la cara de vuelta no disparó');
    assert.equal(k, 2 + Math.ceil(R.MS_VERDE / 250), 'disparó en la detección ' + k + ' tras volver la cara: la cuenta no empezó de cero');
    assert.equal(P.ev('window.__disparo'), 1);
  });

  test('un parpadeo del detector (una detección «movimiento» entre dos verdes) no atrasa la foto', async () => {
    const rj = reloj();
    const P = abrirPlay({ Date: rj.Reloj });
    conModulo(P);
    await arrancar(P);
    assert.equal(await detectar(P, rj, 3, 250), null);
    /* En UNA detección la cara sale borrosa (el autofoco) y en la siguiente
       vuelve nítida: la caja no se movió, así que la de vuelta es verde. */
    P.ev('window.__nit = 1;');
    assert.equal(await detectar(P, rj, 1, 250), null);
    assert.equal(P.ev('ESCANER.medida.falla'), 'borrosa', 'la prueba no provocó un parpadeo');
    assert.equal(P.ev('ESCANER.verde.activa'), 1, 'un parpadeo del detector reinició la cuenta');
    P.ev('window.__nit = 25;');
    const k = await detectar(P, rj, 20, 250);
    assert.ok(k !== null);
    assert.equal(k + 4, 2 + Math.ceil(R.MS_VERDE / 250), 'el parpadeo atrasó la foto: disparó en la detección ' + (k + 4) + ' desde el arranque');
  });

  test('CON UN rostro-en-vivo.js VIEJO EN LA CACHÉ (sin contarVerde) la página sigue disparando con la racha de antes', async () => {
    const rj = reloj();
    const P = abrirPlay({ Date: rj.Reloj });
    conModulo(P, { viejo: true });
    await arrancar(P);
    const k = await detectar(P, rj, 20, 250);
    assert.equal(k, Math.max(1 + R.CUADROS, 1 + Math.ceil(R.MS_ESCANEO_MIN / 250)), 'con el módulo viejo disparó en la detección ' + k);
    assert.equal(P.ev('ESCANER.verde'), null, 'con el módulo viejo la página inventó una cuenta en verde');
  });

  test('la cuenta en verde muere con la cámara (detenerEscaner), como la caja y los ojos', async () => {
    const rj = reloj();
    const P = abrirPlay({ Date: rj.Reloj });
    conModulo(P);
    await arrancar(P);
    await detectar(P, rj, 3, 250);
    assert.ok(P.ev('ESCANER.verde && ESCANER.verde.activa'));
    P.ev('detenerEscaner()');
    assert.equal(P.ev('ESCANER.verde'), null);
    /* Y un intento nuevo empieza de cero. */
    P.ev('iniciarEscaner()');
    assert.equal(P.ev('ESCANER.verde'), null);
  });

  test('en la pantalla, el aro, el relleno y el número salen de la misma cuenta que dispara', () => {
    const P = abrirPlay({ Date: reloj().Reloj });   // el reloj quieto: lo que se mide es la cuenta, no los ms que tarda la prueba
    P.ev(FUENTE_RV);
    const trazos = lienzoQueAnota(P);
    P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960; $('camLienzo').getContext = function () { return window.__ctx2; };" +
      'ESCANER.lienzoMedir = { width: 32, height: 32, getContext: function () { return { drawImage: function () {},' +
      '  getImageData: function () { var d = new Uint8ClampedArray(32 * 32 * 4); for (var i = 0; i < d.length; i++) d[i] = (i * 37) % 255; return { data: d }; } }; } };');
    P.ev("ESCANER.activo = true; ESCANER.modo = 'rostro'; ESCANER.detectando = true; ESCANER.detectandoDesde = Date.now(); ESCANER.vioCara = true;" +
      'ESCANER.detector = { liberar: function () {} }; ESCANER.medida = { ok: true, falla: "", cara: ' + JSON.stringify(CARA) + ', ojos: null };' +
      'ESCANER.verde = { activa: 1, desde: Date.now() - 1500, ultimoVerde: Date.now() - 100, ultimaCara: Date.now(), parpadeos: 0, verdes: 5, miradas: 5 }; bucleEscaner();');
    assert.equal(P.ev("$('camCuenta').textContent"), '1');
    const args = trazos();
    const fr = args.find(a => a[0] === 'fillRect');
    assert.ok(fr && Math.abs(fr[4] - 0.75 * 2 * 960 * 0.36) < 0.01, 'el relleno no está a las tres cuartas partes: ' + JSON.stringify(fr));
    const aro = paths(args).filter(p => !p.cerrado && p.pts.length > 10)[0];
    assert.ok(aro && aro.pts.length >= 35 && aro.pts.length <= 38, 'el aro no está a las tres cuartas partes: ' + (aro && aro.pts.length) + ' puntos');
  });
});

/* --------------------------------------------------------------------------
   5. LOS TEXTOS
   -------------------------------------------------------------------------- */
describe('5. lo que se lee dice «la silueta», y la política dice los dos segundos', () => {

  test('el paso del rostro y el escáner ya no hablan del óvalo', () => {
    const t = sinComentarios(PLAY);
    const region = t.slice(t.indexOf('function pasoRostro'), t.indexOf('function mostrarSelfieTomada'));
    assert.ok(region.length > 1000);
    assert.equal(/óvalo/i.test(region), false, 'queda un «óvalo» en lo que la pantalla dice');
    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
    assert.match(P.ev('pasoRostro()'), /Pon tu cara dentro de la silueta/);
    assert.match(P.ev('pasoRostro()'), /la foto se toma sola/);
  });

  test('los textos del módulo', () => {
    assert.match(RV.textoDeRostro({ falla: 'sin_cara' }), /silueta/);
    assert.match(RV.textoDeRostro({ falla: 'descentrada' }), /Centra tu cara en la silueta/);
    Object.keys(RV.ROSTRO).forEach(k => assert.equal(typeof RV.ROSTRO[k], 'number'));
    ['MS_VERDE', 'MS_PARPADEO', 'PARPADEOS_MAX', 'MS_HUECO_MAX', 'MS_PERDIDA'].forEach(k => assert.ok(RV.ROSTRO[k] > 0, k));
  });

  test('la política: la silueta y los dos segundos, y sigue sin prometer reconocer a nadie', () => {
    const i = PRIV.indexOf('<h3>La foto de tu cara, que se toma sola</h3>');
    assert.ok(i > 0);
    const seccion = PRIV.slice(i, PRIV.indexOf('<h3>', i + 10)).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.equal(/óvalo/i.test(seccion), false, 'la política sigue hablando del óvalo');
    assert.match(seccion, /dentro de la silueta/);
    assert.match(seccion, /quieta durante dos segundos/, 'la política no dice los dos segundos en verde que la pantalla cuenta');
    assert.equal(/reconoc|verific|biometr/i.test(seccion.split('Después, en el computador')[0]), false);
  });
});
