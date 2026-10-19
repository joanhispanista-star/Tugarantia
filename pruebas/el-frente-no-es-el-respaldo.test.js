'use strict';
/* ==========================================================================
 * EL FRENTE NO ES EL RESPALDO — 19 de octubre de 2026
 *
 *   node --test pruebas/el-frente-no-es-el-respaldo.test.js
 *
 * Joan: «él tomó la foto de la cédula por los dos lados pero en mi panel
 * solo se ve un lado».
 *
 * LA CAUSA, reproducida antes de tocar nada (play/index.html en el banco,
 * ZXing de verdad y una cédula fabricada con pruebas/fabrica-pdf417.js): el
 * escáner lee el respaldo, dice «Ahora el frente, acostado…», y el frente se
 * disparaba con seis cuadros quietos y NADA MÁS. Quien acuesta la cédula
 * antes de voltearla y la deja quieta medio segundo guarda el respaldo como
 * frente: el teléfono dice «Listo: las dos caras.», suben dos fotos del mismo
 * lado, y en el CRM salen dos miniaturas iguales. El propio lector de la
 * página leía el código de barras en ese «frente».
 *
 * Lo que se cuida aquí, en este orden:
 *   1. lo puro (EC.decidirFrente, EC.guardarFrente);
 *   2. el escáner de la página: el respaldo en el marco del frente NO se
 *      guarda, el frente de verdad sí, y un segundo toque a mano lo guarda
 *      igual (la salida para un frente que el lector confunda);
 *   3. con un solo lado, «Continuar» avisa una vez y deja seguir;
 *   4. el CRM dice qué lado falta en vez de callarlo;
 *   5. la revisión del computador encuentra los registros ya guardados así.
 *
 * Ninguna foto de nadie entra al repositorio: las cédulas son fabricadas.
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const RR = require('../app/revision-registro.js');
const F = require('./fabrica-pdf417.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { abrirPanel } = require('./banco-panel.js');
const { abrirRevision } = require('./banco-revision.js');
const { asentar, hasta } = require('./esperar.js');

const BUNDLE = fs.readFileSync(path.join(RAIZ, 'app', 'lib', 'zxing.min.js'), 'utf8');
const CODIGO = F.fabricar(F.registroCedula(), 15, 5);

function azar(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/* La cara de atrás, ACOSTADA: como queda cuando la persona la gira para el
   marco del frente sin voltearla. Es la de pruebas/respaldo-derecho.test.js. */
function respaldo(o) {
  o = o || {};
  const s = o.s || 3, W = o.W || 1150, H = Math.round(W / 1.585);
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = 205 + 10 * Math.sin(x / 37 + y / 53);
  const r = azar(o.semilla || 5);
  for (let k = 0; k < 5; k++) {
    const y0 = Math.round(H * (0.08 + k * 0.09)); let x = Math.round(W * 0.05);
    while (x < W * 0.62) {
      const cw = 6 + Math.floor(r() * 10), ch = 12 + Math.floor(r() * 6);
      for (let y = y0; y < y0 + ch; y++) for (let xx = x; xx < x + cw; xx++) if (r() < 0.6) g[y * W + xx] = 60;
      x += cw + 3 + (r() < 0.2 ? 12 : 0);
    }
  }
  const cx = W * 0.82, cy = H * 0.28, rx = W * 0.09, ry = H * 0.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = (x - cx) / rx, b = (y - cy) / ry, d = Math.sqrt(a * a + b * b);
    if (d < 1 && Math.sin(d * 40 + a * 3) > 0.2) g[y * W + x] = 70;
  }
  const bc = F.render(CODIGO, s, o.sigma || 0, o.ruido || 0, { quieta: 4 });
  const bx = Math.round((W - bc.W) / 2), by = Math.round(H * 0.95 - bc.H);
  for (let y = 0; y < bc.H; y++) for (let x = 0; x < bc.W; x++) {
    const X = bx + x, Y = by + y;
    if (X >= 0 && X < W && Y >= 0 && Y < H) g[Y * W + X] = bc.lum[y * bc.W + x];
  }
  const lum = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = g[i];
  return { lum, W, H };
}
/* El frente: la foto de la persona a la izquierda y renglones de letra a la
   derecha, sin código de barras. El de frente-sin-codigo.js del diagnóstico. */
function frente(semilla, W) {
  W = W || 900; const H = Math.round(W / 1.585), g = new Float32Array(W * H), r = azar(semilla);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = 200 + 12 * Math.sin(x / 23 + y / 31) + 8 * Math.sin(x / 7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = (x - W * 0.2) / (W * 0.1), b = (y - H * 0.55) / (H * 0.28);
    if (a * a + b * b < 1) g[y * W + x] = 120 + 40 * Math.sin(x / 9) * Math.cos(y / 11);
  }
  for (let k = 0; k < 7; k++) {
    const y0 = Math.round(H * (0.15 + k * 0.1)); let x = Math.round(W * 0.38);
    while (x < W * 0.95) {
      const cw = 5 + Math.floor(r() * 9), ch = 10 + Math.floor(r() * 5);
      for (let y = y0; y < y0 + ch; y++) for (let xx = x; xx < x + cw; xx++) if (r() < 0.6) g[y * W + xx] = 55;
      x += cw + 3 + (r() < 0.2 ? 12 : 0);
    }
  }
  const lum = new Uint8ClampedArray(W * H); for (let i = 0; i < W * H; i++) lum[i] = g[i];
  return { lum, W, H };
}
const RESPALDO = respaldo({ sigma: 1 });
const FRENTE = frente(3);

/* ==========================================================================
 * 1. LO PURO
 * ======================================================================== */
describe('EC.decidirFrente: el frente solo dispara sin código a la vista', () => {
  const N = EC.TARJETA.CUADROS_FRENTE;

  test('quieta, mirada y sin código: dispara', () => {
    assert.deepEqual(EC.decidirFrente({ estables: N, vioCodigo: false, limpias: 1 }), { disparar: true, voltear: false });
  });

  test('EL CASO DE WILLIAM: quieta, pero con código de barras: no dispara y pide voltearla', () => {
    assert.deepEqual(EC.decidirFrente({ estables: N + 20, vioCodigo: true, limpias: 3 }), { disparar: false, voltear: true },
      'el respaldo acostado en el marco del frente se guardaba como frente');
  });

  test('sin haber mirado en esta racha, todavía no dispara', () => {
    assert.equal(EC.decidirFrente({ estables: N, vioCodigo: false, limpias: 0 }).disparar, false,
      'seis cuadros quietos llegaron antes de mirar si traía código');
  });

  test('sin `limpias` (quien no puede mirar) decide como antes, por la quietud', () => {
    assert.equal(EC.decidirFrente({ estables: N, vioCodigo: false }).disparar, true);
    assert.equal(EC.decidirFrente({ estables: N - 1, vioCodigo: false }).disparar, false);
  });

  test('sin datos no revienta ni dispara', () => {
    assert.deepEqual(EC.decidirFrente(null), { disparar: false, voltear: false });
    assert.deepEqual(EC.decidirFrente({}), { disparar: false, voltear: false });
  });
});

describe('EC.guardarFrente: la última reja, y el segundo toque a mano', () => {
  const RATO = EC.FRENTE.MS_GUARDAR_IGUAL;

  test('sin código se guarda, la pida quien la pida', () => {
    assert.deepEqual(EC.guardarFrente({ conCodigo: false, aMano: false }), { guardar: true, forzada: false });
    assert.deepEqual(EC.guardarFrente({ conCodigo: false, aMano: true }), { guardar: true, forzada: false });
  });

  test('con código no se guarda: ni el bucle ni el primer toque', () => {
    assert.equal(EC.guardarFrente({ conCodigo: true, aMano: false, msDesdeRechazo: 100 }).guardar, false,
      'el bucle no puede usar la salida de la persona');
    assert.equal(EC.guardarFrente({ conCodigo: true, aMano: true, msDesdeRechazo: null }).guardar, false);
  });

  test('el segundo toque a mano, dentro del rato, la guarda igual y lo dice', () => {
    assert.deepEqual(EC.guardarFrente({ conCodigo: true, aMano: true, msDesdeRechazo: 1500 }), { guardar: true, forzada: true });
    assert.equal(EC.guardarFrente({ conCodigo: true, aMano: true, msDesdeRechazo: RATO + 1 }).guardar, false,
      'un toque de hace un rato largo no es «insistir»');
    assert.equal(EC.guardarFrente({ conCodigo: true, aMano: true, msDesdeRechazo: -5 }).guardar, false);
  });

  test('sin datos se guarda (es lo de siempre: el lector no vio nada)', () => {
    assert.deepEqual(EC.guardarFrente(null), { guardar: true, forzada: false });
  });
});

describe('las cédulas fabricadas dicen lo que deben', () => {
  test('el lector y el patrón ven el código en el respaldo acostado, y no en los frentes', () => {
    F.latin1EnNode(true);
    try {
      const d = EC.decodificarLuminancias(F.Z, RESPALDO.lum, RESPALDO.W, RESPALDO.H);
      assert.ok(d.texto, 'el respaldo fabricado no se lee: esta prueba ya no prueba nada');
      assert.equal(EC.orientacionDelRespaldo(RESPALDO.lum, RESPALDO.W, RESPALDO.H, {}).seguro, true,
        'sin lector, el patrón de barras no ve el respaldo');
      for (let s = 1; s <= 6; s++) for (const W of [700, 900]) {
        const t = frente(s, W);
        const r = EC.decodificarLuminancias(F.Z, t.lum, t.W, t.H);
        assert.ok(!r.texto && r.error === 'no_hay', 'un frente sin código se tomó por respaldo (' + s + ', ' + W + '): ' + JSON.stringify(r));
        assert.equal(EC.orientacionDelRespaldo(t.lum, t.W, t.H, {}).seguro, false, 'el patrón vio barras en un frente');
      }
    } finally { F.latin1EnNode(false); }
  });
});

/* ==========================================================================
 * 2. EL ESCÁNER DE LA PÁGINA
 *
 * Como en repro-frente.js: un lienzo de mentira con los píxeles de la tarjeta,
 * ZXing de verdad, la puerta del encuadre en verde (la medida que dio el caso
 * del respaldo acostado: ok), y cada foto guardada numerada para saber cuál.
 * ======================================================================== */
function ponerTarjeta(P, t) {
  const b64 = Buffer.from(t.lum).toString('base64');
  P.ev("window.__lum = Uint8ClampedArray.from(atob('" + b64 + "'), function (c) { return c.charCodeAt(0); });");
  P.ev('window.__lienzo = { width: ' + t.W + ', height: ' + t.H + ', getContext: function () { return { getImageData: function () {' +
       ' var n = window.__lum.length, d = new Uint8ClampedArray(n * 4);' +
       ' for (var i = 0, j = 0; i < n; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = window.__lum[i]; d[j + 3] = 255; }' +
       ' return { data: d }; } }; } };');
  P.ev('ESCDOC.recorte = window.__lienzo;');
}
function escaner(opc) {
  const o = opc || {};
  const P = abrirPlay();
  if (o.lector !== false) {
    P.ev(BUNDLE);
    P.ev("ZXing.ZXingStringEncoding.customDecoder = function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };");
  }
  ponerTarjeta(P, RESPALDO);
  P.ev('window.__n = 0; fotoDeLienzo = function () { window.__n++; return "data:image/jpeg;base64,FOTO_" + window.__n; };');
  P.ev('recortarGuia = function () { return window.__lienzo; };');
  P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;");
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev("medirCajaDoc = function () {}; grisDeGuia = function () { return [1]; };");
  P.ev('window.__medida = { ok: true, nitidez: 23.2, falla: "" };');
  P.ev('EC = Object.assign({}, EC, { medirTarjeta: function () { return window.__medida; } });');
  return P;
}
/* El respaldo se lee en vivo y, como en el teléfono, se pasa al frente.
   `antes` corre entre las dos cosas: reanudarEscanerDoc ya mira el primer
   cuadro, así que lo que esté en el marco en ese momento es lo que cuenta. */
function leerElRespaldo(P, antes) {
  P.ev("ESCDOC.lado = 'reverso'; leidaDoc(leerCedulaDeLienzo(window.__lienzo, null, 'siempre').cedula);");
  assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,FOTO_1');
  if (antes) antes();
  P.ev("ESCDOC.stream = {}; ESCDOC.turno = 1; reanudarEscanerDoc('frente');");
}
const cuadros = (P, n) => { for (let i = 0; i < n && P.ev('ESCDOC.activo'); i++) P.ev('bucleEscanerDoc()'); };

describe('el escáner del frente', () => {

  test('EL CASO DE WILLIAM: el respaldo acostado sin voltear NO se guarda como frente', () => {
    const P = escaner();
    leerElRespaldo(P);
    cuadros(P, 12);
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined,
      'el respaldo quieto en el marco del frente se guardó como frente: Joan ve dos veces el mismo lado');
    assert.equal(P.ev('ESCDOC.activo'), true, 'el escáner se cerró en vez de seguir esperando el frente');
    assert.equal(P.ev("$('docEstado').textContent"),
      'Ese es el lado del código de barras: voltéala y muestra el frente, con tu foto');
    assert.notEqual(P.ev("$('docListoTxt').textContent"), 'Listo: las dos caras.');
    /* Y a la nube solo va el lado que sí hay. */
    P.ev("window.__subida = null; celularDeSesion = function () { return '3001112233'; };" +
         "rpcSesion = function (f, a) { window.__subida = Object.keys(a.p_archivos); return Promise.resolve({ ok: true }); };");
    P.ev('subirArchivosRegistro()');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__subida)')), ['cedula_reverso'],
      'subió dos llaves con la foto del respaldo');
    assert.deepEqual(P.fallos, []);
  });

  test('sin el lector todavía (ZXing bajando), el patrón de las barras lo frena igual', () => {
    const P = escaner({ lector: false });
    P.ev("FOTOS.cedula_reverso = 'data:image/jpeg;base64,RESPALDO'; marcarDuenoDeLasFotos();");
    P.ev("ESCDOC.stream = {}; ESCDOC.turno = 1; reanudarEscanerDoc('frente');");
    cuadros(P, 12);
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'sin ZXing el respaldo volvió a pasar como frente');
  });

  test('el frente de verdad se guarda solo, y ahí sí «Listo: las dos caras.»', () => {
    const P = escaner();
    leerElRespaldo(P, () => ponerTarjeta(P, FRENTE));
    cuadros(P, 12);
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FOTO_2', 'el frente sin código no se guardó');
    assert.equal(P.ev("$('docListoTxt').textContent"), 'Listo: las dos caras.');
  });

  test('voltearla funciona: el respaldo frena, se mueve, y el frente que llega se guarda', () => {
    const P = escaner();
    leerElRespaldo(P);
    cuadros(P, 8);
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined);
    /* La persona la voltea: la tarjeta se mueve (la puerta deja de estar en
       verde) y lo visto en esa racha se olvida. */
    P.ev('window.__medida = { ok: false, nitidez: 23, falla: "movimiento" };');
    cuadros(P, 2);
    assert.equal(P.ev('ESCDOC.vioCodigo'), false, 'el código visto antes de voltearla se quedó pegado');
    ponerTarjeta(P, FRENTE);
    /* tPatron = 0: voltearla toma más de medio segundo, y el banco no tiene
       reloj que avance solo entre cuadros. */
    P.ev('window.__medida = { ok: true, nitidez: 23.2, falla: "" }; ESCDOC.tPatron = 0;');
    cuadros(P, 12);
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FOTO_2', 'después de voltearla no se guardó el frente');
  });

  test('si el bucle no lo vio, capturarDoc lo ve: el disparo automático tampoco guarda el respaldo', () => {
    const P = escaner();
    leerElRespaldo(P, () => {
      /* El bucle «mira» y no ve nada (un falso negativo): dispara. Al disparar
         se le devuelve a capturarDoc el lector de verdad. */
      P.ev('codigoEnRecorteReal = codigoEnRecorte; codigoEnRecorte = function () { return false; };');
      P.ev('capturarDocReal = capturarDoc; window.__disparo = 0; capturarDoc = function (a) { window.__disparo++; codigoEnRecorte = codigoEnRecorteReal; capturarDoc = capturarDocReal; return capturarDocReal(a); };');
    });
    cuadros(P, 8);
    assert.equal(P.ev('window.__disparo'), 1, 'el bucle no llegó a disparar: esta prueba no prueba la última reja');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'la última reja dejó pasar el respaldo');
    assert.equal(P.ev('ESCDOC.tRechazoAMano'), 0, 'un rechazo del bucle armó la salida que es de la persona');
  });
});

describe('«Tomar la foto ahora» en el frente', () => {

  test('atascada un rato pidiendo voltearla, la salida de los dos toques se ofrece sola', () => {
    const P = escaner();
    leerElRespaldo(P);
    cuadros(P, 3);
    assert.equal(P.ev("$('docNota').textContent"), '', 'ofreció guardarla igual antes de tiempo');
    P.ev('ESCDOC.desde = Date.now() - 11000;');
    cuadros(P, 2);
    assert.match(P.ev("$('docNota').textContent"), /toca «Tomar la foto ahora» dos veces/,
      'un frente que el lector confunda se quedaría pidiendo voltearla para siempre, sin decir la salida');
    P.ev('capturarDoc()');
    P.ev('capturarDoc()');
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FOTO_2', 'los dos toques que promete la nota no la guardaron');
    assert.equal(P.ev("$('docNota').textContent"), '', 'la nota se quedó después de guardar');
  });

  test('con el respaldo en el marco: el primer toque no guarda y explica la salida', () => {
    const P = escaner();
    leerElRespaldo(P);
    P.ev('capturarDoc()');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'el botón guardó el respaldo como frente sin mirar');
    assert.match(P.ev("$('docNota').textContent"), /vuelve a tocar «Tomar la foto ahora»/);
    assert.equal(P.ev('ESCDOC.activo'), true, 'el escáner quedó apagado después de rechazarla');
  });

  test('el segundo toque, dentro del rato, la guarda igual (y lo dice)', () => {
    const P = escaner();
    leerElRespaldo(P);
    P.ev('capturarDoc()');
    P.ev('capturarDoc()');
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FOTO_2', 'la salida para un frente confundido no sirvió');
    assert.equal(P.ev("$('docListoTxt').textContent"), 'La guardamos como el frente, como pediste.');
    assert.equal(P.ev("$('docNota').textContent"), '', 'la nota de «vuelve a tocar» se quedó después de guardar');
  });

  test('un toque de hace rato no cuenta como insistir', () => {
    const P = escaner();
    leerElRespaldo(P);
    P.ev('capturarDoc()');
    P.ev('ESCDOC.tRechazoAMano = Date.now() - ' + (EC.FRENTE.MS_GUARDAR_IGUAL + 1000) + ';');
    P.ev('capturarDoc()');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined);
  });

  test('con el frente en el marco, un toque basta', () => {
    const P = escaner();
    leerElRespaldo(P);
    ponerTarjeta(P, FRENTE);
    P.ev('capturarDoc()');
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FOTO_2');
    assert.equal(P.ev("$('docListoTxt').textContent"), 'Listo: las dos caras.');
  });

  test('«Listo: las dos caras.» solo si el respaldo está', () => {
    const P = escaner();
    ponerTarjeta(P, FRENTE);
    P.ev("ESCDOC.lado = 'frente'; ESCDOC.stream = {}; capturarDoc();");
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FOTO_1');
    assert.equal(P.ev("$('docListoTxt').textContent"), 'Listo: el frente. Falta el respaldo.');
  });
});

/* ==========================================================================
 * 3. CON UN SOLO LADO, «CONTINUAR» AVISA UNA VEZ Y DEJA SEGUIR
 * ======================================================================== */
function enElPasoDocumento(fotos, sensibles) {
  const P = abrirPlay();
  P.ev("REGISTRO.celular = '3001112233';");
  P.ev('FOTOS = ' + JSON.stringify(Object.assign({ sensibles: sensibles !== false }, fotos)) +
       "; FOTOS.de = { celular: '3001112233', t: Date.now() }; guardarFotos();");
  P.ev("pintarRegistro(PASOS.map(function (p) { return p.id; }).indexOf('documento'));");
  return P;
}
const pasoActual = P => P.ev('PASOS[PASO].id');
const FOTO = 'data:image/jpeg;base64,QUJD';

describe('el paso de la cédula con un solo lado', () => {

  test('falta el frente: avisa, ofrece tomarlo, y no pasa todavía', () => {
    const P = enElPasoDocumento({ cedula_reverso: FOTO });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'documento', 'pasó callado con un solo lado: es como Joan ve un solo lado sin saber por qué');
    const h = P.ev("$('errReg').innerHTML");
    assert.match(h, /Te falta la foto del frente de tu cédula/);
    assert.match(h, /onclick="tomarLadoQueFalta\('frente'\)">Tomar el frente</);
    assert.match(h, /Seguir sin él/);
    assert.match(h, /tu cuenta se abre igual/);
  });

  test('no bloquea: el segundo «Continuar» pasa', () => {
    const P = enElPasoDocumento({ cedula_reverso: FOTO });
    P.ev('siguientePaso()');
    P.ev('siguientePaso()');
    assert.notEqual(pasoActual(P), 'documento', 'el aviso se volvió un bloqueo: el paso es opcional');
  });

  test('falta el respaldo: lo mismo, con el respaldo', () => {
    const P = enElPasoDocumento({ cedula_frente: FOTO });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'documento');
    assert.match(P.ev("$('errReg').innerHTML"), /Te falta la foto del respaldo de tu cédula[^]*Tomar el respaldo/);
  });

  test('con los dos lados, sin ninguno, o sin autorizar las fotos: pasa sin aviso', () => {
    [[{ cedula_frente: FOTO, cedula_reverso: FOTO }, true], [{}, true], [{ cedula_reverso: FOTO }, false]].forEach(([f, s]) => {
      const P = enElPasoDocumento(f, s);
      P.ev('siguientePaso()');
      assert.notEqual(pasoActual(P), 'documento', 'avisó cuando no faltaba un lado: ' + JSON.stringify(f) + ' sensibles=' + s);
    });
  });
});

/* ==========================================================================
 * 4. EL CRM DICE QUÉ LADO FALTA
 * ======================================================================== */
const REVERSO_NUBE = 'data:image/jpeg;base64,RVNUQS1FUy1MQS1DRURVTEEtUE9SLURFVFJBUw==';
const FRENTE_NUBE = 'data:image/jpeg;base64,RVNUQS1FUy1MQS1DRURVTEEtUE9SLURFTEFOVEU=';
function crm(fotos, cartera) {
  const red = url => (String(url).includes('archivos_de_registro')
    ? Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ fotos: fotos || {}, huella: null })) })
    : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('null') }));
  const P = abrirPanel({ red });
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.cargarCartera(cartera || { socios: [], prestamos: [] });
  return P;
}
const registro = () => ({ id: 9, nombre: 'William', cedula: '80000000', telefono: '3001234567', estado: 'nuevo',
  datos: { nombres: 'William' }, huella: null, creado_en: '2026-10-18T15:00:00Z' });
async function fotosDelRegistro(fotos) {
  const P = crm(fotos);
  P.ctx.__r = [registro()]; P.ev('_registros=__r');
  P.ev('verDatosRegistro(9)');
  await asentar();
  return P.elems.regFotos.innerHTML;
}

describe('el CRM no calla el lado que falta', () => {

  test('en los registros: solo llegó el respaldo → «Falta la foto del frente»', async () => {
    const h = await fotosDelRegistro({ cedula_reverso: REVERSO_NUBE });
    assert.match(h, /Falta la foto del frente de la cédula: solo está la del respaldo\./,
      'el CRM pinta un lado y calla el otro');
    assert.match(h, /No llegó a la nube/);
  });

  test('en los registros: solo llegó el frente → «Falta la foto del respaldo»', async () => {
    const h = await fotosDelRegistro({ cedula_frente: FRENTE_NUBE });
    assert.match(h, /Falta la foto del respaldo de la cédula/);
  });

  test('con los dos lados no dice nada de más', async () => {
    const h = await fotosDelRegistro({ cedula_frente: FRENTE_NUBE, cedula_reverso: REVERSO_NUBE });
    assert.ok(!/Falta la foto/.test(h), 'avisó que falta un lado que sí está');
  });

  test('en la ficha del cliente', () => {
    const P = crm({}, { socios: [{ id: 'C1', numero: 1, nombre: 'William', cedula: '80000000', telefono: '3001234567',
      gestiones: [], cedulaReversoFoto: REVERSO_NUBE }], prestamos: [] });
    P.ev('verCliente("C1")');
    assert.match(P.ev('document.getElementById("mBody").innerHTML'), /Falta la foto del frente de la cédula/);
  });

  test('en la ficha que ve el equipo', () => {
    const P = crm();
    const h = P.ev('fichaHTML(' + JSON.stringify({ nombre: 'William', registrado_en: '2026-10-18T15:00:00Z', cedula: '80000000',
      celular: '3001234567', datos: {}, fotos: { cedula_frente: FRENTE_NUBE }, huella: {} }) + ')');
    assert.match(h, /Falta la foto del respaldo de la cédula[^]*Pídesela antes de desembolsar/);
    const h2 = P.ev('fichaHTML(' + JSON.stringify({ nombre: 'William', registrado_en: '2026-10-18T15:00:00Z', cedula: '80000000',
      celular: '3001234567', datos: {}, fotos: { cedula_frente: FRENTE_NUBE, cedula_reverso: REVERSO_NUBE }, huella: {} }) + ')');
    assert.ok(!/Falta la foto/.test(h2));
  });
});

/* ==========================================================================
 * 5. LA REVISIÓN ENCUENTRA LOS QUE YA QUEDARON ASÍ
 *
 * Lo ya guardado no se arregla solo: William y cualquier otro registro
 * afectado tienen el respaldo dos veces. La revisión del computador lee el
 * código de barras también en la foto del frente.
 * ======================================================================== */
const TEXTO_HALLAZGO = 'La foto del frente es el respaldo; pídele el frente';
const FILA = {
  id: 21, cedula: '80000000', nombre: 'William Revisado', telefono: '3001234567', estado: 'nuevo',
  creado_en: '2026-10-18T15:00:00Z', origen: 'abierto',
  datos: { documento: '80000000', celular: '3001234567', tipo_doc: 'Cédula de ciudadanía', expedicion: '2012-01-01' },
  huella: { ip: '181.1.1.1', momento: '2026-10-18T15:00:40Z' }
};

describe('la regla de las fotos', () => {
  const MEDIDA = { ancho: 900, alto: 568, nitidez: 99, brillo: 150, saturados: 0 };

  test('con código en el frente: «La foto del frente es el respaldo; pídele el frente»', () => {
    const r = RR.revisarRegistro(FILA, { hoy: '2026-10-19', fotos: { frente: MEDIDA, reverso: MEDIDA }, frente_codigo: true });
    const h = r.para_mirar.find(x => x.clave === 'frente_es_respaldo');
    assert.ok(h, 'la revisión no dice que el frente es el respaldo');
    assert.equal(h.texto, TEXTO_HALLAZGO);
    assert.equal(h.regla, 'fotos');
    assert.ok(!h.biometrico, 'no es un dato del rostro: tiene que poder ir al celular');
  });

  test('sin código en el frente no lo dice', () => {
    const r = RR.revisarRegistro(FILA, { hoy: '2026-10-19', fotos: { frente: MEDIDA, reverso: MEDIDA } });
    assert.ok(!r.para_mirar.some(x => x.clave === 'frente_es_respaldo'));
  });

  test('aunque ninguna foto se haya podido medir, lo dice igual', () => {
    const r = RR.revisarRegistro(FILA, { hoy: '2026-10-19', fotos: {}, frente_codigo: true });
    assert.ok(r.para_mirar.some(x => x.clave === 'frente_es_respaldo'));
  });

  test('por la bandeja entera (porId) también llega', () => {
    const l = RR.revisarLista([FILA], { hoy: '2026-10-19', porId: { 21: { fotos: { frente: MEDIDA }, frente_codigo: true } } });
    assert.ok(l[0].resultado.para_mirar.some(x => x.texto === TEXTO_HALLAZGO));
  });
});

describe('la página de la revisión lee el frente', () => {
  const foto = n => 'data:image/jpeg;base64,' + Buffer.from('foto-' + n).toString('base64');
  async function revisar(frenteTraeCodigo) {
    const bitacora = [];
    const red = (url, cuerpo) => {
      const fn = url.split('/rpc/')[1];
      if (fn === 'listar_registros') return { status: 200, cuerpo: cuerpo.p_estado === 'nuevo' ? [FILA] : [] };
      if (fn === 'archivos_de_registro') {
        return { status: 200, cuerpo: { fotos: { cedula_frente: foto('frente'), cedula_reverso: foto('reverso'), selfie: foto('selfie') }, huella: null } };
      }
      if (fn === 'verificar_registro_foto') return { status: 200, cuerpo: { ok: true, cotejo: { estado: 'intacto', documento: 'igual', nombre: 'igual', nivel: 'foto' } } };
      return { status: 404, cuerpo: {} };
    };
    const pieza = {
      fotoSegura: s => (RR.bytesDeFoto(s) === null ? '' : String(s)),
      imagenDe: src => Promise.resolve({ src }),
      medirImagen: (img, tipo) => ({ ancho: tipo === 'selfie' ? 480 : 900, alto: tipo === 'selfie' ? 640 : 568, nitidez: 99, brillo: 150, saturados: 0 }),
      leerCodigoDeImagen: img => {
        bitacora.push('leer:' + img.src);
        const hay = img.src === foto('reverso') || (frenteTraeCodigo && img.src === foto('frente'));
        return Promise.resolve(hay ? { documento: '80000000', nombres: 'WILLIAM' } : null);
      },
      cargarRostro: () => Promise.resolve({}),
      compararRostros: a => { bitacora.push('rostro:' + a.src); return Promise.resolve({ distancia: 0.4, parecido: 70, umbral: 0.6, debajo: true }); }
    };
    const e = abrirRevision({ cartera: { config: { pin: '4321' }, socios: [], prestamos: [] }, red, fotos: pieza });
    e.entrar('4321');
    await hasta(() => /Listo:/.test(e.progreso()) || /No pude traer/.test(e.resultado()), 400);
    await asentar();
    return { e, bitacora };
  }

  test('EL CASO DE WILLIAM: el frente trae código → hallazgo, y no se compara la cara contra él', async () => {
    const { e, bitacora } = await revisar(true);
    assert.ok(bitacora.includes('leer:' + foto('frente')), 'la revisión no leyó la foto del frente');
    assert.ok(e.resultado().includes(TEXTO_HALLAZGO), 'William quedó sin el hallazgo: Joan no se entera de cuáles pedir otra vez');
    assert.ok(!bitacora.some(x => x.startsWith('rostro:')), 'comparó la selfie contra un respaldo, que no tiene cara');
    /* Y se recuerda en la pestaña: al recargar no se pierde. */
    assert.match(e.sesion.tg_revision_registros_v1 || '', /"frente_codigo":true/);
  });

  test('un frente normal: sin hallazgo, y la cara se compara como siempre', async () => {
    const { e, bitacora } = await revisar(false);
    assert.ok(!e.resultado().includes(TEXTO_HALLAZGO), 'dijo que el frente es el respaldo sin código en el frente');
    assert.ok(bitacora.some(x => x.startsWith('rostro:')), 'dejó de comparar la cara con un frente normal');
  });
});
