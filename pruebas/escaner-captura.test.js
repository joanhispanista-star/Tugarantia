'use strict';
/* ===========================================================================
 * EL ESCÁNER HORIZONTAL Y AUTOMÁTICO — 21 de octubre de 2026
 *
 *   node --test pruebas/escaner-captura.test.js
 *
 * Joan, con su cédula amarilla: «que cuando esté enfocada la cédula de forma
 * horizontal la pantalla se ponga verde y tome la foto en el momento que se
 * vea mejor enfocada, y que al cambiar a la foto por el otro lado … no me toque
 * tomarla de forma vertical, quiero que las dos fotos de la cédula se tomen
 * horizontal y si no hay mucha iluminación … prender el flash».
 *
 * Lo que se prueba, y cómo:
 *   1. LO PURO (app/escaner-captura.js), con tarjetas FABRICADAS: la nitidez a
 *      la escala de la foto distingue el desenfoque que la puerta de 96 px no
 *      ve; la ventana se queda con el MEJOR cuadro; la linterna con su
 *      histéresis; la cámara a 4K «ideal»; el QR de la cédula digital.
 *   2. LA PÁGINA DE VERDAD (pruebas/banco-play.js) con un reloj de mentira:
 *      el bucle dispara el mejor cuadro y no el sexto quieto, con un mutante
 *      que escoge con la nitidez de la puerta; el frente rechaza también el
 *      lado del QR; la digital se toma sola y nunca oye «Voltéala»; la
 *      linterna se prende, se apaga con el reflejo y no vuelve; las respuestas
 *      tardías se tiran por turno y por generación; un solo lienzo por cosa, y
 *      se sueltan al salir; el enganche para leer lo visible.
 *   3. LO QUE LA PANTALLA DICE: nada «de pie», el verde de la máscara entera,
 *      el destello, los dos botones siempre a la vista.
 *   4. (23-oct-2026) LA CÉDULA DIFÍCIL: el PDF417 muy gastado, el frente liso
 *      y la poca luz sin linterna, con las cédulas fabricadas para las letras
 *      (ver allá).
 *
 * Ninguna foto de nadie entra al repositorio: todo es fabricado aquí.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ECAP = require('../app/escaner-captura.js');
const EC = require('../app/escaner-cedula.js');
const RR = require('../app/revision-registro.js');
const IM = require('./imagenes-de-mentira.js');
const F = require('./fabrica-pdf417.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { asentar } = require('./esperar.js');

const BUNDLE = fs.readFileSync(path.join(RAIZ, 'app', 'lib', 'zxing.min.js'), 'utf8');
const CODIGO = F.fabricar(F.registroCedula(), 15, 5);
const C = ECAP.CAPTURA;

/* --------------------------------------------------------------------------
   LAS TARJETAS FABRICADAS
   -------------------------------------------------------------------------- */
function azar(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/* El lado de atrás de la amarilla, acostado: trama, renglones de letra y el
   PDF417 abajo. `W` es el ancho de la tarjeta en píxeles del video. */
function atrasAmarilla(o) {
  o = o || {};
  const W = o.W || 1150, H = Math.round(W / 1.585), k = W / 1150;
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = 205 + 10 * Math.sin(x / (37 * k) + y / (53 * k));
  const r = azar(o.semilla || 5);
  for (let f = 0; f < 5; f++) {
    const y0 = Math.round(H * (0.08 + f * 0.09)); let x = Math.round(W * 0.05);
    while (x < W * 0.62) {
      const cw = Math.round((6 + Math.floor(r() * 10)) * k), ch = Math.round((12 + Math.floor(r() * 6)) * k);
      for (let y = y0; y < y0 + ch; y++) for (let xx = x; xx < x + cw; xx++) if (r() < 0.6) g[y * W + xx] = 60;
      x += cw + Math.round((3 + (r() < 0.2 ? 12 : 0)) * k);
    }
  }
  const bc = F.render(CODIGO, o.s || 3 * k, 0, 0, { quieta: 4 });
  const bx = Math.round((W - bc.W) / 2), by = Math.round(H * 0.95 - bc.H);
  for (let y = 0; y < bc.H; y++) for (let x = 0; x < bc.W; x++) {
    const X = bx + x, Y = by + y;
    if (X >= 0 && X < W && Y >= 0 && Y < H) g[Y * W + X] = bc.lum[y * bc.W + x];
  }
  return { g, W, H };
}
/* El lado de atrás de la DIGITAL: un QR a la izquierda (su contenido de
   verdad es biometría cifrada; aquí, bytes de relleno) y tres renglones de
   MRZ abajo. Sin PDF417. */
function atrasDigital(W) {
  const H = Math.round(W / 1.585), g = new Float32Array(W * H).fill(214);
  const pista = new Map(); pista.set(F.Z.EncodeHintType.MARGIN, 0);
  const qr = new F.Z.QRCodeWriter().encode('CIFRADO:' + 'Q7xK2mP9'.repeat(18), F.Z.BarcodeFormat.QR_CODE, 0, 0, pista);
  const n = qr.getWidth(), mod = Math.max(2, Math.round(W * 0.24 / n));
  const ox = Math.round(W * 0.06), oy = Math.round(H * 0.12);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.get(x, y)) {
    for (let a = 0; a < mod; a++) for (let b = 0; b < mod; b++) g[(oy + y * mod + a) * W + ox + x * mod + b] = 28;
  }
  const r = azar(11);
  for (let f = 0; f < 3; f++) {
    const y0 = Math.round(H * (0.70 + f * 0.09)), ch = Math.round(H * 0.05);
    for (let x = Math.round(W * 0.05); x < W * 0.95; x += Math.round(W * 0.03)) {
      for (let y = y0; y < y0 + ch; y++) for (let xx = x; xx < x + Math.round(W * 0.02); xx++) if (r() < 0.55) g[y * W + xx] = 40;
    }
  }
  return { g, W, H };
}
function frente(W) { const H = Math.round(W / 1.585); return { g: Float32Array.from(IM.tarjeta(W, H, 120)), W, H }; }
function gauss(t, s) {
  const { g, W, H } = t;
  if (!s) return Float32Array.from(g);
  const r = Math.ceil(s * 3), k = []; let tot = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * s * s)); k.push(v); tot += v; }
  for (let i = 0; i < k.length; i++) k[i] /= tot;
  const a = new Float32Array(g.length), b = new Float32Array(g.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); v += g[y * W + xx] * k[i + r]; } a[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); v += a[yy * W + x] * k[i + r]; } b[y * W + x] = v; }
  return b;
}
/* Achicar por promedio de área: lo que hace drawImage al dibujar a escala. */
function achicar(g, W, H, nw, nh) {
  const o = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const ax = Math.floor(x * W / nw), bx = Math.max(ax + 1, Math.floor((x + 1) * W / nw));
    const ay = Math.floor(y * H / nh), by = Math.max(ay + 1, Math.floor((y + 1) * H / nh));
    let s = 0, c = 0;
    for (let yy = ay; yy < by; yy++) for (let xx = ax; xx < bx; xx++) { s += g[yy * W + xx]; c++; }
    o[y * nw + x] = s / c;
  }
  return o;
}
const aLum = g => Uint8ClampedArray.from(g);
const voltear = lum => { const o = new Uint8ClampedArray(lum.length); for (let i = 0; i < lum.length; i++) o[i] = lum[lum.length - 1 - i]; return o; };

/* ==========================================================================
 * 1. LO PURO
 * ======================================================================== */
describe('la nitidez a la escala de la foto', () => {
  test('es la MISMA cuenta que la del CRM (RevisionRegistro.nitidezDeGris), número a número', () => {
    /* La copia vive en app/escaner-captura.js para no cargar 1.600 líneas de
       reglas del CRM en play/. Si una cambia y la otra no, esto se cae. */
    const casos = [atrasAmarilla({ W: 480 }), frente(480), atrasDigital(480)];
    for (const t of casos) for (const s of [0, 1, 2.5]) {
      const g = aLum(gauss(t, s));
      assert.equal(ECAP.nitidezDeGris(g, t.W, t.H), RR.nitidezDeGris(g, t.W, t.H, null, 0.5, false),
        'la nitidez del escáner y la del CRM ya no son la misma cuenta');
    }
    assert.equal(ECAP.nitidezDeGris(new Uint8ClampedArray(480 * 303).fill(200), 480, 303), 0, 'una pared lisa no es nítida');
    assert.equal(ECAP.nitidezDeGris(null, 0, 0), 0);
  });

  test('VE EL DESENFOQUE QUE LA PUERTA NO VE (la causa de que la amarilla no se leyera)', () => {
    /* La cédula acostada en un video de 1080 de ancho mide ~907 px. Se mide a
       480 (tamanoDeMedida) y, como hace la puerta, a 96 px de alto. */
    const t = atrasAmarilla({ W: 907 }), m = ECAP.tamanoDeMedida(t.W, t.H);
    assert.deepEqual(m, { w: 480, h: 303 });
    const a480 = [], puerta = [];
    for (const s of [0, 1, 2, 3]) {
      const b = gauss(t, s);
      a480.push(ECAP.nitidezDeGris(achicar(b, t.W, t.H, m.w, m.h), m.w, m.h));
      const gw = Math.round(96 * t.W / t.H), g96 = achicar(b, t.W, t.H, gw, 96);
      puerta.push(EC.medirTarjeta(g96, g96, gw, 96, { x0: 0, x1: gw, y0: 0, y1: 96 }).nitidez);
    }
    for (let i = 1; i < a480.length; i++) assert.ok(a480[i] < a480[i - 1], 'la nitidez no baja con el desenfoque: ' + a480.join(', '));
    assert.ok(a480[0] >= C.PISO_NITIDEZ && a480[1] >= C.PISO_NITIDEZ, 'una cédula enfocada no pasa el piso: ' + a480.join(', '));
    assert.ok(a480[3] < C.PISO_NITIDEZ, 'una cédula a σ 3 pasa el piso: ' + a480.join(', '));
    /* La puerta, en cambio, apenas se mueve: por eso no puede escoger la foto. */
    const caida = (x, y) => 1 - y / x;
    assert.ok(caida(puerta[0], puerta[2]) < 0.35, 'la puerta de 96 px sí ve el desenfoque: ' + puerta.join(', '));
    assert.ok(caida(a480[0], a480[2]) > 0.6, 'la medida a 480 px no ve el desenfoque: ' + a480.join(', '));
  });

  test('tamanoDeMedida nunca agranda, y con un recorte vacío no inventa', () => {
    assert.deepEqual(ECAP.tamanoDeMedida(1814, 1145), { w: 480, h: 303 });
    assert.deepEqual(ECAP.tamanoDeMedida(300, 189), { w: 300, h: 189 });
    assert.equal(ECAP.tamanoDeMedida(0, 0), null);
  });
});

describe('la ventana del mejor cuadro (EscanerCaptura.decidirVentana)', () => {
  const ventanaCon = (lista, guardado) => {
    let v = ECAP.ventanaNueva(1000);
    lista.forEach(n => { v = ECAP.anotarMedida(v, n, guardado === undefined ? ECAP.esMejor(v, n) : guardado); });
    return v;
  };
  const SERIE = [50, 120, 80, 200, 90, 60, 150, 70, 110, 95];

  test('se queda con el MEJOR de la ventana, no con el último ni con el sexto', () => {
    const v = ventanaCon(SERIE);
    assert.equal(v.mejor, 200);
    assert.equal(v.nMejor, 4, 'el mejor era el cuarto cuadro');
    assert.equal(v.medidas, 10);
  });

  test('lo que no se guardó en el lienzo no cuenta como el mejor (la foto es la que se leyó)', () => {
    const v = ventanaCon([50, 300], false);
    assert.equal(v.mejor, 0);
    assert.equal(ECAP.esMejor(ECAP.ventanaNueva(0), 0), false, 'un cuadro sin nitidez no puede ser el mejor');
  });

  test('abierta mide; se cierra a las diez medidas, o a 1,5 s si el teléfono es lento', () => {
    const e = { lado: 'reverso', ahora: 1000, vioCodigo: true, lectorListo: true };
    const nueve = ventanaCon(SERIE.slice(0, 9));
    const d9 = ECAP.decidirVentana(nueve, e);
    assert.equal(d9.estado, 'midiendo');
    assert.ok(d9.avance > 0.85 && d9.avance < 1, 'la barra no cuenta la ventana: ' + d9.avance);
    assert.equal(ECAP.decidirVentana(ventanaCon(SERIE), e).estado, 'disparar');
    /* Lento: tres medidas en 1,5 s ya deciden; dos no. */
    assert.equal(ECAP.decidirVentana(ventanaCon([120, 130, 125]), Object.assign({}, e, { ahora: 1000 + C.MS_VENTANA_MAX })).estado, 'disparar');
    assert.equal(ECAP.decidirVentana(ventanaCon([120, 130]), Object.assign({}, e, { ahora: 9999 })).estado, 'midiendo');
  });

  test('si NINGUNO pasa el piso, no se toma nada y se pide distancia', () => {
    const d = ECAP.decidirVentana(ventanaCon([10, 20, C.PISO_NITIDEZ - 1, 15, 12, 18, 9, 22, 30, 25]),
      { lado: 'reverso', ahora: 1000, vioCodigo: true, lectorListo: true });
    assert.equal(d.estado, 'alejala');
    assert.equal(d.disparar, false);
    assert.equal(ECAP.TEXTO.ALEJALA, 'Aléjala un poco y espera el enfoque');
  });

  test('el respaldo: con código dispara; sin código pide el otro lado; con una lectura en vuelo espera', () => {
    const v = ventanaCon(SERIE), base = { lado: 'reverso', ahora: 1000, lectorListo: true };
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: true })).estado, 'disparar');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: false })).estado, 'sin_codigo');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: true, leyendo: true })).estado, 'esperando');
  });

  test('el respaldo sin lector todavía (señal floja): espera su rato, y no más', () => {
    const v = ventanaCon(SERIE), base = { lado: 'reverso', ahora: 1000, lectorListo: false };
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: true, msVerde: 1000 })).estado, 'esperando');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: false, msVerde: 1000 })).estado, 'esperando',
      'dijo «no hay código» sin haber podido buscar un QR');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: true, msVerde: C.MS_SIN_LECTOR })).estado, 'disparar');
    assert.equal(C.MS_SIN_LECTOR, EC.RESPALDO.MS_SIN_LECTOR, 'los dos escáneres esperan al lector distinto');
  });

  test('el frente: con un código a la vista NO dispara; sin mirarlo todavía, espera', () => {
    const v = ventanaCon(SERIE), base = { lado: 'frente', ahora: 1000, lectorListo: true };
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: true, limpias: 3 })).estado, 'con_codigo');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: false, limpias: 0 })).estado, 'esperando');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: false, limpias: 1 })).estado, 'disparar');
  });

  test('sin datos no revienta ni dispara', () => {
    assert.equal(ECAP.decidirVentana(null, {}).disparar, false);
    assert.equal(ECAP.decidirVentana(ECAP.ventanaNueva(0), null).estado, 'midiendo');
  });
});

describe('la linterna (EscanerCaptura.decidirLinterna)', () => {
  const L = ECAP.LINTERNA;
  const base = { puede: true, autorizado: true, prendida: false, vetada: false, luz: 40, saturados: 0, msOscura: 0, msBorrosa: 0 };
  const con = c => ECAP.decidirLinterna(Object.assign({}, base, c));

  test('se prende sola con poca luz sostenida, y no en un parpadeo', () => {
    assert.equal(con({ msOscura: L.MS_OSCURA - 100 }).accion, '');
    assert.deepEqual(con({ msOscura: L.MS_OSCURA }), { accion: 'prender', motivo: 'poca_luz', pedirLuz: false });
  });

  test('la oscuridad se cuenta con histéresis: entre 70 y 85 ni suma ni se borra', () => {
    assert.equal(ECAP.acumularOscura(500, L.LUZ_PRENDER - 1, 100), 600);
    assert.equal(ECAP.acumularOscura(500, L.LUZ_PRENDER + 5, 100), 500, 'un cuarto que oscila alrededor de 70 la deja a medio contar');
    assert.equal(ECAP.acumularOscura(500, L.LUZ_PRENDER + L.BANDA + 1, 100), 0);
  });

  test('prendida NO se apaga porque haya luz (la luz es ella): solo con un reflejo', () => {
    assert.equal(con({ prendida: true, luz: 230 }).accion, '', 'parpadearía: prender → hay luz → apagar → no hay luz…');
    assert.deepEqual(con({ prendida: true, saturados: L.REFLEJO_MAX + 0.01 }), { accion: 'apagar', motivo: 'reflejo', pedirLuz: false });
  });

  test('la que se apagó por reflejo (o la apagó la persona) no vuelve sola; con reflejo no se prende', () => {
    assert.equal(con({ vetada: true, msOscura: 5000 }).accion, '');
    assert.equal(con({ saturados: L.REFLEJO_MAX + 0.05, msOscura: 5000 }).accion, '');
  });

  test('borrosa y quieta con poca luz también la prende; con buena luz no (no arregla el enfoque)', () => {
    assert.equal(con({ msBorrosa: L.MS_BORROSA, luz: 120 }).accion, 'prender');
    assert.equal(con({ msBorrosa: L.MS_BORROSA, luz: 200 }).accion, '');
  });

  test('NUNCA sin torch (el iPhone): pide luz a la persona; NUNCA antes de la autorización', () => {
    assert.deepEqual(con({ puede: false, msOscura: 5000 }), { accion: '', motivo: 'poca_luz', pedirLuz: true });
    assert.deepEqual(con({ autorizado: false, msOscura: 5000 }), { accion: '', motivo: '', pedirLuz: false });
    assert.equal(con({ autorizado: undefined, msOscura: 5000 }).accion, '', 'sin decir que autorizó, se tomó como que sí');
  });

  test('la puerta cuenta el reflejo que la media no ve (medirTarjeta.saturados)', () => {
    const W = 64, H = 96, g = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dentro = x >= W * 0.15 && x < W * 0.85 && y >= H * 0.15 && y < H * 0.85;
      g[y * W + x] = dentro ? ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 40 : 210) : 128;
    }
    /* Un brillo de la linterna en un punto: ~5 % del interior quemado. */
    for (let y = 30; y < 42; y++) for (let x = 20; x < 34; x++) g[y * W + x] = 255;
    const m = EC.medirTarjeta(g, g, W, H);
    assert.ok(m.luz < EC.TARJETA.LUZ_MAX, 'la media ya lo veía: esta prueba no mide nada');
    assert.ok(m.saturados > L.REFLEJO_MAX, 'el reflejo no se contó: ' + m.saturados);
    assert.equal(m.ok, true, 'el reflejo cambió el verde de la puerta, y eso no se pidió');
  });
});

describe('la cámara, lo que dio, y los códigos', () => {
  test('se pide 4K IDEAL, por la cámara de atrás, y nunca un mínimo que tumbe el escáner', () => {
    const p = ECAP.pedidoDeCamara();
    assert.equal(p.video.facingMode.ideal, 'environment');
    assert.equal(p.video.width.ideal, 3840);
    assert.equal(p.video.height.ideal, 2160);
    assert.equal(/"(min|exact)"/.test(JSON.stringify(p)), false, 'un `min` que la cámara no cumple hace fallar getUserMedia');
    assert.equal(p.audio, false);
  });

  test('lo que la cámara de verdad entregó: 1080 no alcanza para leer acostada, 2160 sí', () => {
    assert.deepEqual(ECAP.resolucionEfectiva({ width: 1920, height: 1080 }),
      { ancho: 1920, alto: 1080, corto: 1080, conocida: true, suficiente: false });
    assert.equal(ECAP.resolucionEfectiva({ width: 2160, height: 3840 }).suficiente, true);
    assert.equal(ECAP.resolucionEfectiva({ width: 2560, height: 1440 }).suficiente, true);
    assert.equal(ECAP.resolucionEfectiva({}).conocida, false);
  });

  test('el detector nativo pide PDF417 y QR, de los que tenga', () => {
    assert.deepEqual(ECAP.formatosDelDetector(['ean_13', 'qr_code', 'pdf417']), ['pdf417', 'qr_code']);
    assert.deepEqual(ECAP.formatosDelDetector(['pdf417']), ['pdf417']);
    assert.deepEqual(ECAP.formatosDelDetector(null), []);
  });

  test('del QR solo se dice que estaba: su texto (biometría cifrada) no sale', () => {
    const k = ECAP.clasificarCodigos([{ format: 'qr_code', rawValue: 'BIOMETRIA-CIFRADA-0042' },
      { format: 'pdf417', rawValue: 'EL-PDF417' }]);
    assert.deepEqual(k, { pdf417: 'EL-PDF417', qr: true });
    assert.equal(JSON.stringify(ECAP.clasificarCodigos([{ format: 'qr_code', rawValue: 'BIOMETRIA-CIFRADA-0042' }])).indexOf('BIOMETRIA'), -1);
  });

  test('el QR de la cédula digital se ve a 960 px; la amarilla y el frente no tienen QR', () => {
    const dig = atrasDigital(960), ama = atrasAmarilla({ W: 960 }), fre = frente(960);
    const r = ECAP.buscarQr(F.Z, aLum(dig.g), dig.W, dig.H);
    assert.deepEqual(r, { hay: true, sinLector: false }, 'no vio el QR de la digital');
    assert.equal(ECAP.buscarQr(F.Z, aLum(gauss(dig, 1)), dig.W, dig.H).hay, true, 'con el desenfoque de un celular ya no lo ve');
    assert.equal(ECAP.buscarQr(F.Z, aLum(ama.g), ama.W, ama.H).hay, false, 'vio un QR en la amarilla');
    assert.equal(ECAP.buscarQr(F.Z, aLum(fre.g), fre.W, fre.H).hay, false, 'vio un QR en el frente: se quedaría sin disparo');
    assert.deepEqual(ECAP.buscarQr(null, null, 0, 0), { hay: false, sinLector: true });
  });

  test('la franja del código se ve a 480 px, y la banda que se lee la cubre con aire', () => {
    const t = atrasAmarilla({ W: 1150 }), m = ECAP.tamanoDeMedida(t.W, t.H);
    const g480 = achicar(t.g, t.W, t.H, m.w, m.h);
    const f = EC.franjaDeBarras(g480, m.w, m.h);
    assert.ok(f && f.y1 > f.y0, 'no encontró la franja del código a 480 px');
    const b = ECAP.bandaDeLectura(f, m.h, t.H);
    assert.ok(b.y0 >= 0 && b.y1 <= t.H && b.y1 - b.y0 < t.H, 'la banda se sale o es la tarjeta entera');
    /* El código fabricado va en el 95 % de abajo: la banda tiene que llegar. */
    assert.ok(b.y1 >= Math.round(t.H * 0.95) - 2, 'la banda le corta el final al código');
    const fr = frente(480);
    assert.equal(EC.franjaDeBarras(aLum(fr.g), fr.W, fr.H), null, 'vio barras en el frente');
    assert.equal(ECAP.bandaDeLectura(null, 303, 1145), null);
  });
});

/* ==========================================================================
 * 2. LA PÁGINA DE VERDAD
 *
 * Un reloj de mentira (abrirPlay acepta `Date`), la puerta en verde, y la
 * medida a 480 px que dice la prueba cuadro por cuadro. El lienzo del recorte
 * anota QUÉ cuadro tiene dibujado, y la foto guardada dice cuál fue.
 * ======================================================================== */
function relojDeMentira() {
  const reloj = { t: Date.parse('2026-10-21T15:00:00-05:00') };
  class Reloj extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj.t); }
    static now() { return reloj.t; }
  }
  return { reloj, Reloj };
}
function escanerConVentana(opc) {
  const o = opc || {};
  const { reloj, Reloj } = relojDeMentira();
  const P = abrirPlay({ Date: Reloj });
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.reloj = reloj;
  P.ev("REGISTRO.celular = '3001112233'; anotarCelularDelRegistro('3001112233'); FOTOS = { sensibles: true }; guardarFotos();");
  P.ev("$('docVideo').videoWidth = 2160; $('docVideo').videoHeight = 3840;");
  P.ev('medirCajaDoc = function () {}; grisDeGuia = function () { return [1]; };');
  P.ev('window.__medida = { ok: true, nitidez: 20, luz: 150, saturados: 0, falla: "" }; window.__franja = null;');
  P.ev('EC = Object.assign({}, EC, { medirTarjeta: function () { return window.__medida; },' +
       ' franjaDeBarras: function () { return window.__franja; } });');
  P.ev('window.__nit = 0; window.__cuadro = 0; window.__dibujos = []; window.__estados = [];' +
       'medirNitidezDoc = function () { return { nitidez: window.__nit, gris: new Uint8ClampedArray(480 * 303), w: 480, h: 303 }; };' +
       'window.__lienzo = { width: 1814, height: 1145, cuadro: -1 };' +
       'recortarGuia = function () { window.__lienzo.cuadro = window.__cuadro; window.__dibujos.push(window.__cuadro); ESCDOC.recorte = window.__lienzo; return window.__lienzo; };' +
       'fotoDeLienzo = function (c) { return "data:image/jpeg;base64,CUADRO_" + c.cuadro; };');
  if (o.lector !== false) P.ev('window.ZXing = window.ZXing || {};');
  P.ev("leerCedulaDeLienzo = function () { return { cedula: null, error: 'no_hay', giro: null, patron: false }; };");
  P.ev("ESCDOC.stream = {}; ESCDOC.turno = 1; ESCDOC.activo = true; ESCDOC.lado = '" + (o.lado || 'reverso') + "'; ESCDOC.desde = Date.now();");
  return P;
}
/* Un cuadro del bucle, 100 ms después del anterior, con esa nitidez a 480 px. */
function cuadro(P, i, nit) {
  P.reloj.t += 100;
  P.ev('window.__cuadro = ' + i + '; window.__nit = ' + nit + '; bucleEscanerDoc();' +
       "window.__estados.push($('docEstado').textContent);");
}
const SERIE = [50, 120, 80, 200, 90, 60, 150, 70, 110, 95];
const estados = P => JSON.parse(P.ev('JSON.stringify(window.__estados)'));

describe('la página dispara el MEJOR cuadro', () => {

  test('EL RESPALDO, CON EL CÓDIGO A LA VISTA: al cerrar la ventana se guarda el más nítido, no el sexto quieto', () => {
    const P = escanerConVentana();
    /* El lector ve el código pero no lo lee (el caso de la amarilla borrosa). */
    P.ev('window.__leidos = []; leerCuadroDoc = function (v, mejor) { window.__leidos.push(mejor && mejor.lienzo.cuadro); ESCDOC.lecturas++; ESCDOC.vioCodigo = true; };');
    SERIE.forEach((n, i) => cuadro(P, i, n));
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_3', 'no se guardó el más nítido de la ventana');
    /* UN lienzo, redibujado solo cuando llegó uno mejor: 3 veces en 10 cuadros. */
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__dibujos)')), [0, 1, 3]);
    /* Y lo que se le dio al lector fue siempre el mejor de ese momento. */
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__leidos)')), [0, 1, 3]);
    assert.ok(estados(P).some(t => /buscando la foto más nítida|leyendo el código/.test(t)), 'no dijo que estaba buscando la mejor');
  });

  test('MUTANTE: con la nitidez de la PUERTA no se escoge (la puerta dice 99 y la foto está borrosa)', () => {
    const P = escanerConVentana();
    P.ev('window.__medida.nitidez = 99;');
    P.ev('leerCuadroDoc = function () { ESCDOC.vioCodigo = true; };');
    for (let i = 0; i < 20; i++) cuadro(P, i, C.PISO_NITIDEZ - 15);
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'disparó una foto borrosa porque la puerta de 96 px la vio «nítida»');
    assert.ok(estados(P).includes('Aléjala un poco y espera el enfoque'), 'no le pidió alejarla: ' + estados(P).slice(-3).join(' | '));
  });

  test('…y al revés: la puerta casi en el límite, la foto nítida → se toma', () => {
    const P = escanerConVentana();
    P.ev('window.__medida.nitidez = EC.TARJETA.NITIDEZ_MIN + 0.2;');
    P.ev('leerCuadroDoc = function () { ESCDOC.vioCodigo = true; };');
    for (let i = 0; i < 10; i++) cuadro(P, i, 150);
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_0');
  });

  test('con el lector todavía bajando, espera; cuando llega, lee ESE mejor aunque no venga otro más nítido', () => {
    const P = escanerConVentana({ lector: false });
    P.ev('window.__leidos = []; leerCuadroDoc = function (v, mejor) { window.__leidos.push(mejor.lienzo.cuadro); ESCDOC.vioCodigo = true; };');
    cuadro(P, 0, 200);
    for (let i = 1; i < 12; i++) cuadro(P, i, 100);
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'disparó sin que nadie hubiera podido leer el código');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__leidos)')), []);
    P.ev('window.ZXing = {};');   // llegó el lector
    cuadro(P, 12, 100);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__leidos)')), [0], 'el mejor que esperaba al lector no se leyó nunca');
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_0');
  });

  test('si lee el PDF417 en el mejor cuadro, dispara ahí mismo, sin esperar la ventana', () => {
    const P = escanerConVentana();
    P.ev('leerCuadroDoc = function (v, mejor) { if (mejor.lienzo.cuadro === 1) leidaDoc({ documento: "1234567", nombres: "JUAN", apellidos: "PEREZ" }, 0); };');
    cuadro(P, 0, 60); cuadro(P, 1, 90);
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_1');
    assert.equal(P.ev('ESCDOC.activo'), false);
  });

  test('una cara nítida SIN ningún código no se guarda como respaldo, y lo dice sin afirmar de más', () => {
    const P = escanerConVentana();
    P.ev('leerCuadroDoc = function () { ESCDOC.lecturas++; };');
    for (let i = 0; i < 12; i++) cuadro(P, i, 150);
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'guardó el frente como respaldo');
    assert.ok(estados(P).includes('No vemos código en ese lado: si es el frente, voltéala'));
  });

  /* 26-oct-2026 — REESCRITA: la vuelta era UN cuadro de «movimiento». Desde
     hoy un cuadro así es un pico del temblor de la mano y no corta nada
     (EC.contarRachaDoc tolera dos seguidos); voltear una cédula toma más y la
     saca del marco. Se mira primero que el pico no tire la ventana ni olvide
     el código, y después la vuelta de verdad: tres cuadros seguidos. */
  test('voltearla corta la racha: el código visto en una cara no deja pasar la otra (y un pico del temblor no la corta)', () => {
    const P = escanerConVentana();
    P.ev('window.__hay = true; leerCuadroDoc = function () { if (window.__hay) ESCDOC.vioCodigo = true; };');
    for (let i = 0; i < 4; i++) cuadro(P, i, 20);   // el respaldo, borroso: no se dispara
    P.ev('window.__medida = { ok: false, luz: 150, saturados: 0, falla: "movimiento", temblor: 2.5 };');
    cuadro(P, 4, 0);                                // un pico del temblor
    assert.equal(P.ev('ESCDOC.vioCodigo'), true, 'un cuadro movido olvidó el código visto');
    assert.equal(P.ev('!!ESCDOC.ventana'), true, 'un cuadro movido tiró la ventana del mejor cuadro');
    cuadro(P, 5, 0); cuadro(P, 6, 0);               // la voltea de verdad
    assert.equal(P.ev('ESCDOC.vioCodigo'), false, 'lo visto antes de voltearla se quedó pegado');
    assert.equal(P.ev('ESCDOC.ventana'), null, 'la ventana sobrevivió a la vuelta');
    P.ev('window.__hay = false; window.__medida = { ok: true, nitidez: 20, luz: 150, saturados: 0, falla: "" };');
    for (let i = 7; i < 19; i++) cuadro(P, i, 150);  // el frente, nítido
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'el frente pasó como respaldo con el código que se vio antes de voltearla');
  });
});

describe('la cédula digital (el QR) en la página', () => {

  test('SE TOMA SOLA con el QR, y nunca oye «Voltéala» ni «el código no se pudo leer»', () => {
    const P = escanerConVentana();
    P.ev('qrEnLienzo = function () { return true; };');
    for (let i = 0; i < 10; i++) cuadro(P, i, 120);
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_0', 'la digital no se tomó sola');
    assert.equal(P.ev('ESCDOC.vioQr'), true);
    assert.equal(estados(P).some(t => /volt[ée]ala/i.test(t)), false, 'le pidió voltear la cédula con el lado del QR en el marco');
    const listo = P.ev("$('docListoTxt').textContent");
    assert.match(listo, /la del QR/);
    assert.equal(/no se pudo leer/.test(listo), false, 'le dijo que el código no se pudo leer, como si la foto fuera mala');
    /* Ni la lectura ni el borrado por «otra persona»: sin corrección de errores no hay cédula leída. */
    assert.equal(P.ev('FOTOS.cedula_leida'), undefined);
  });

  test('con el detector nativo: el QR cuenta y su texto no queda en ningún lado', async () => {
    const P = escanerConVentana({ lector: false });
    P.ev("ESCDOC.nativo = { detect: function () { return Promise.resolve([{ format: 'qr_code', rawValue: 'BIOMETRIA-CIFRADA-0042' }]); } };");
    cuadro(P, 0, 120);
    await asentar();
    assert.equal(P.ev('ESCDOC.vioQr'), true, 'el QR del detector nativo no contó');
    for (let i = 1; i < 10; i++) cuadro(P, i, 110);
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_0');
    const todo = JSON.stringify(P.almacen) + P.ev('JSON.stringify(FOTOS) + JSON.stringify(REGISTRO)');
    assert.equal(todo.indexOf('BIOMETRIA'), -1, 'el contenido del QR quedó guardado');
  });

  test('UNA RESPUESTA TARDÍA NO VALE: el QR que llega después de cancelar o de cambiar de registro se tira', async () => {
    for (const cambio of ['ESCDOC.turno = 2;', 'otraGeneracion();', '']) {
      const P = escanerConVentana({ lector: false });
      P.ev("ESCDOC.nativo = { detect: function () { return new Promise(function (r) { window.__suelta = r; }); } };");
      cuadro(P, 0, 120);
      P.ev(cambio);
      P.ev("window.__suelta([{ format: 'qr_code', rawValue: 'X' }]);");
      await asentar();
      assert.equal(P.ev('ESCDOC.vioQr'), cambio === '', cambio
        ? 'una lectura de otro turno o de otro registro cambió este escáner (' + cambio + ')'
        : 'la lectura a tiempo no contó');
    }
  });

  test('el frente rechaza también el lado del QR (la digital acostada sin voltear)', () => {
    const P = escanerConVentana({ lado: 'frente' });
    P.ev("FOTOS.cedula_reverso = 'data:image/jpeg;base64,RESPALDO'; marcarDuenoDeLasFotos('cedula_reverso');");
    /* Sin PDF417 a la vista (el lector no ve nada), solo el QR: lo tiene que
       ver el codigoEnRecorte de verdad, que es también la última reja. */
    P.ev('qrEnLienzo = function () { return true; };');
    for (let i = 0; i < 25; i++) cuadro(P, i, 150);
    P.ev('capturarDoc(true, true)');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'guardó el lado del QR como frente');
    assert.ok(estados(P).includes('Ese es el lado del código de barras: voltéala y muestra el frente, con tu foto'));
  });

  test('…y el frente de verdad se toma solo, con su mejor cuadro', () => {
    const P = escanerConVentana({ lado: 'frente' });
    P.ev("FOTOS.cedula_reverso = 'data:image/jpeg;base64,RESPALDO'; marcarDuenoDeLasFotos('cedula_reverso');");
    P.ev('qrEnLienzo = function () { return false; }; codigoEnRecorte = function () { return false; };');
    SERIE.forEach((n, i) => cuadro(P, i, n));
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,CUADRO_3');
    assert.equal(P.ev("$('docListoTxt').textContent"), 'Listo: las dos caras.');
  });
});

describe('la linterna en la página', () => {
  function conPista(P, caps) {
    P.ev('window.__restricciones = []; window.__pista = { getCapabilities: function () { return ' + JSON.stringify(caps) + '; },' +
         ' getSettings: function () { return { width: 3840, height: 2160 }; },' +
         ' applyConstraints: function (c) { window.__restricciones.push(JSON.stringify(c)); return Promise.resolve(); } };' +
         'ESCDOC.stream = { getVideoTracks: function () { return [window.__pista]; }, getTracks: function () { return []; } };' +
         'afinarCamaraDoc(window.__pista);');
  }
  const torchs = P => JSON.parse(P.ev('JSON.stringify(window.__restricciones)')).filter(r => /torch/.test(r));

  test('con poca luz se PRENDE SOLA, el botón dice «Apagar la luz», y un reflejo la apaga para siempre', () => {
    const P = escanerConVentana();
    conPista(P, { torch: true });
    assert.equal(P.ev("$('btnDocLinterna').textContent"), 'Prender la luz');
    P.ev('window.__medida = { ok: false, luz: 20, saturados: 0, falla: "poca_luz" };');
    for (let i = 0; i < 12; i++) cuadro(P, i, 0);
    assert.deepEqual(torchs(P), ['{"advanced":[{"torch":true}]}'], 'no se prendió con poca luz');
    assert.equal(P.ev("$('btnDocLinterna').textContent"), 'Apagar la luz');
    assert.ok(estados(P).includes('Prendimos la luz del celular: hay poca'), 'se prendió sin decirlo');
    /* El plástico refleja: se apaga y pide inclinarla. */
    P.ev('window.__medida = { ok: true, nitidez: 20, luz: 190, saturados: 0.12, falla: "" };');
    cuadro(P, 12, 80);
    assert.deepEqual(torchs(P).slice(-1), ['{"advanced":[{"torch":false}]}'], 'el reflejo no la apagó');
    assert.equal(P.ev("$('docEstado').textContent"), 'Hay un reflejo: inclínala un poco');
    /* Y vuelve a estar oscuro: no se prende otra vez sola en este lado. */
    P.ev('window.__medida = { ok: false, luz: 20, saturados: 0, falla: "poca_luz" };');
    for (let i = 13; i < 40; i++) cuadro(P, i, 0);
    assert.equal(torchs(P).filter(r => /true/.test(r)).length, 1, 'parpadea: se volvió a prender después del reflejo');
  });

  test('la que apaga la persona no se vuelve a prender sola', () => {
    const P = escanerConVentana();
    conPista(P, { torch: true });
    P.ev('window.__medida = { ok: false, luz: 20, saturados: 0, falla: "poca_luz" };');
    for (let i = 0; i < 12; i++) cuadro(P, i, 0);
    P.ev('alternarLinterna()');
    for (let i = 12; i < 40; i++) cuadro(P, i, 0);
    assert.equal(torchs(P).filter(r => /true/.test(r)).length, 1);
    assert.equal(P.ev("$('btnDocLinterna').textContent"), 'Prender la luz');
  });

  test('NUNCA sin torch, y NUNCA sin la autorización de este intento', () => {
    const sin = escanerConVentana();
    conPista(sin, {});
    assert.equal(sin.ev('ESCDOC.puedeLuz'), false);
    sin.ev('window.__medida = { ok: false, luz: 20, saturados: 0, falla: "poca_luz" };');
    for (let i = 0; i < 20; i++) cuadro(sin, i, 0);
    assert.deepEqual(torchs(sin), [], 'intentó prender una linterna que la cámara no tiene');
    const P = escanerConVentana();
    conPista(P, { torch: true });
    P.ev('FOTOS.sensibles = false;');
    P.ev('window.__medida = { ok: false, luz: 20, saturados: 0, falla: "poca_luz" };');
    for (let i = 0; i < 20; i++) cuadro(P, i, 0);
    assert.deepEqual(torchs(P), [], 'prendió la linterna sin la autorización');
  });
});

describe('la cámara en la página', () => {
  test('pide 4K ideal y anota lo que de verdad dio', () => {
    const P = abrirPlay({ hash: '#registro' });
    P.ev('window.__camaras = []; navigator.mediaDevices = { getUserMedia: function (c) { window.__camaras.push(c); return new Promise(function () {}); } };');
    P.ev('autorizarYEscanear()');
    const c = JSON.parse(P.ev('JSON.stringify(window.__camaras[0])'));
    assert.equal(c.video.width.ideal, 3840, 'sigue pidiendo 1080: el código queda en el límite del lector');
    assert.equal(c.video.height.ideal, 2160);
    assert.equal(c.video.facingMode.ideal, 'environment');
    assert.equal(/"(min|exact)"/.test(JSON.stringify(c)), false);
    P.ev('afinarCamaraDoc({ getSettings: function () { return { width: 1920, height: 1080 }; }, getCapabilities: function () { return {}; }, applyConstraints: function () { return Promise.resolve(); } })');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(ESCDOC.resolucion)')),
      { ancho: 1920, alto: 1080, corto: 1080, conocida: true, suficiente: false });
  });
});

describe('los lienzos: uno por cosa, y se sueltan al salir', () => {
  /* Lienzos de mentira que dibujan de verdad: drawImage anota de dónde, y
     getImageData achica esos píxeles por promedio de área. */
  function lienzosDeMentira(P) {
    P.ev(`window.__pixelesDe = function (src, r, w, h) {
      var d = new Uint8ClampedArray(w * h * 4);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var ax = Math.floor(r[0] + x * r[2] / w), bx = Math.max(ax + 1, Math.floor(r[0] + (x + 1) * r[2] / w));
        var ay = Math.floor(r[1] + y * r[3] / h), by = Math.max(ay + 1, Math.floor(r[1] + (y + 1) * r[3] / h));
        var s = 0, n = 0;
        for (var yy = ay; yy < by; yy++) for (var xx = ax; xx < bx; xx++) { s += src.lum[yy * src.W + xx]; n++; }
        var v = s / n, k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
      }
      return d;
    };
    window.__lienzos = [];
    document.createElement = (function (orig) { return function (t) {
      if (t !== 'canvas') return orig.call(document, t);
      var c = { _w: 0, _h: 0, reservas: 0, fuente: null, rect: null };
      Object.defineProperty(c, 'width', { get: function () { return c._w; }, set: function (v) { c._w = v; c.reservas++; } });
      Object.defineProperty(c, 'height', { get: function () { return c._h; }, set: function (v) { c._h = v; c.reservas++; } });
      c.getContext = function () { return {
        drawImage: function (src, sx, sy, sw, sh) { c.fuente = src; c.rect = [sx, sy, sw, sh]; },
        getImageData: function (x, y, w, h) { return { data: window.__pixelesDe(c.fuente, c.rect, w, h) }; } }; };
      window.__lienzos.push(c);
      return c;
    }; })(document.createElement);`);
  }
  function videoCon(P, t, VW, VH) {
    /* La cédula acostada en el centro de un video vertical, sobre una mesa. */
    const Y = new Uint8ClampedArray(VW * VH).fill(80);
    const x0 = Math.round((VW - t.W) / 2), y0 = Math.round((VH - t.H) / 2);
    for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) Y[(y0 + y) * VW + x0 + x] = t.g[y * t.W + x];
    P.ev("window.__video = { videoWidth: " + VW + ", videoHeight: " + VH + ", W: " + VW + ", H: " + VH +
         ", lum: Uint8ClampedArray.from(atob('" + Buffer.from(Y).toString('base64') + "'), function (c) { return c.charCodeAt(0); }) };");
    P.ev('ESCDOC.guiaVideo = ' + JSON.stringify({ x: x0, y: y0, w: t.W, h: t.H, vertical: false }) + ';');
  }

  test('la nitidez se mide a 480 px del mismo rectángulo que el recorte, en UN lienzo que no se reserva cada cuadro', () => {
    const P = abrirPlay();
    lienzosDeMentira(P);
    const t = atrasAmarilla({ W: 454 });
    videoCon(P, t, 540, 960);
    const medidas = [];
    for (let i = 0; i < 5; i++) medidas.push(JSON.parse(P.ev('JSON.stringify((function () { var m = medirNitidezDoc(window.__video); return { n: m.nitidez, w: m.w, h: m.h }; })())')));
    assert.equal(P.ev('window.__lienzos.length'), 1, 'cada medida creó un lienzo nuevo');
    assert.equal(P.ev('window.__lienzos[0].reservas'), 2, 'el lienzo de medir se volvió a reservar en cada cuadro');
    assert.equal(medidas[0].w, Math.min(480, P.ev('EC.margenDeLectura(ESCDOC.guiaVideo, 540, 960, 0.06).w')));
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__lienzos[0].rect)')),
      JSON.parse(P.ev('JSON.stringify((function (g) { return [g.x, g.y, g.w, g.h]; })(EC.margenDeLectura(ESCDOC.guiaVideo, 540, 960, 0.06)))')),
      'la nitidez se midió en otro rectángulo que el de la foto');
    assert.ok(medidas[0].n > C.PISO_NITIDEZ, 'la cédula nítida no pasó el piso: ' + medidas[0].n);
  });

  test('qrEnLienzo ve el QR de la digital en el mejor recorte (a 960 px), y no en la amarilla', () => {
    const P = abrirPlay();
    P.ev(BUNDLE);
    lienzosDeMentira(P);
    for (const [t, hay] of [[atrasDigital(1600), true], [atrasAmarilla({ W: 1600 }), false]]) {
      P.ev("window.__rec = { width: " + t.W + ", height: " + t.H + ", W: " + t.W + ", H: " + t.H +
           ", lum: Uint8ClampedArray.from(atob('" + Buffer.from(aLum(t.g)).toString('base64') + "'), function (c) { return c.charCodeAt(0); }) };");
      assert.equal(P.ev('qrEnLienzo(window.__rec)'), hay);
    }
    assert.equal(P.ev('window.__lienzos.length'), 1, 'cada búsqueda del QR creó un lienzo nuevo');
    assert.equal(P.ev('window.__lienzos[0]._w'), 960, 'el QR se buscó a resolución completa');
  });

  test('«Prefiero escribir mis datos», cambiar de paso y SALIR DEL REGISTRO sueltan el mejor cuadro y los lienzos chicos', () => {
    for (const salir of ['prefieroEscribirMisDatos()', "pintarRegistro(indiceDe('identidad'))", 'soltarLoSensibleDelRegistro()']) {
      const P = abrirPlay();
      P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
      P.ev('ESCDOC.recorte = { width: 1814, height: 1145 }; ESCDOC.medida = { width: 480, height: 303 }; ESCDOC.lienzoQr = { width: 960, height: 606 };');
      P.ev(salir);
      assert.deepEqual(JSON.parse(P.ev('JSON.stringify([ESCDOC.recorte.width, ESCDOC.medida.width, ESCDOC.lienzoQr.width])')), [1, 1, 1],
        'la foto de la cédula (el mejor cuadro) se quedó viva al salir con ' + salir);
    }
  });

  test('el lector lee SOLO la franja del código (memoria con 4K) y la foto sale derecha igual', () => {
    const P = abrirPlay();
    P.ev(BUNDLE);
    P.ev("ZXing.ZXingStringEncoding.customDecoder = function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };");
    const t = atrasAmarilla({ W: 1150 }), m = ECAP.tamanoDeMedida(t.W, t.H);
    const banda = ECAP.bandaDeLectura(EC.franjaDeBarras(achicar(t.g, t.W, t.H, m.w, m.h), m.w, m.h), m.h, t.H);
    for (const [lum, giro] of [[aLum(t.g), 0], [voltear(aLum(t.g)), 180]]) {
      const b = giro ? { y0: t.H - banda.y1, y1: t.H - banda.y0 } : banda;   // volteada, la franja queda arriba
      P.ev("window.__l = (function () { var lum = Uint8ClampedArray.from(atob('" + Buffer.from(lum).toString('base64') + "'), function (c) { return c.charCodeAt(0); });" +
           ' var W = ' + t.W + ', H = ' + t.H + ', c = { width: W, height: H, pedidos: [] };' +
           ' c.getContext = function () { return { getImageData: function (x, y, w, h) { c.pedidos.push([x, y, w, h]);' +
           '   var d = new Uint8ClampedArray(w * h * 4);' +
           '   for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) { var v = lum[(y + j) * W + x + i], k = (j * w + i) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }' +
           '   return { data: d }; } }; }; return c; })();');
      const r = JSON.parse(P.ev("JSON.stringify(leerCedulaDeLienzo(window.__l, null, 'siempre', " + JSON.stringify(b) + '))'));
      assert.equal(r.cedula && r.cedula.documento, '1234567', 'leyendo la franja no leyó la cédula');
      assert.equal(r.giro, giro, 'la foto leída por la franja no sale derecha');
      const pedidos = JSON.parse(P.ev('JSON.stringify(window.__l.pedidos)'));
      assert.ok(pedidos[0][3] < t.H * 0.8, 'el lector pidió la tarjeta entera: ' + JSON.stringify(pedidos[0]));
    }
  });
});

describe('el enganche para leer lo visible (alTomarLaCedula)', () => {
  test('cada lado tomado avisa con SU recorte, el giro, si se leyó, y la generación; un oyente que revienta no tumba la foto', () => {
    const P = escanerConVentana();
    P.ev('window.__avisos = []; alTomarLaCedula(function () { throw new Error("oyente roto"); });' +
         'alTomarLaCedula(function (d) { window.__avisos.push({ lado: d.lado, cuadro: d.lienzo.cuadro, giro: d.giro, leida: d.leida, qr: d.qr,' +
         ' automatica: d.automatica, generacion: d.generacion === GENERACION_DEL_REGISTRO, turno: d.turno, nitidez: d.nitidez }); });');
    P.ev('qrEnLienzo = function () { return true; };');
    SERIE.forEach((n, i) => cuadro(P, i, n));
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,CUADRO_3', 'el oyente que revienta tumbó la foto');
    let av = JSON.parse(P.ev('JSON.stringify(window.__avisos)'));
    assert.deepEqual(av, [{ lado: 'reverso', cuadro: 3, giro: null, leida: false, qr: true, automatica: true, generacion: true, turno: 1, nitidez: 200 }]);
    /* El frente a mano, con «Tomar la foto ahora». */
    P.ev("ESCDOC.lado = 'frente'; window.__cuadro = 77; codigoEnRecorte = function () { return false; }; capturarDoc();");
    av = JSON.parse(P.ev('JSON.stringify(window.__avisos)'));
    assert.equal(av.length, 2);
    assert.deepEqual([av[1].lado, av[1].cuadro, av[1].automatica], ['frente', 77, false]);
  });

  test('una foto que NO se guarda no avisa (el respaldo en el marco del frente)', () => {
    const P = escanerConVentana({ lado: 'frente' });
    P.ev('window.__avisos = 0; alTomarLaCedula(function () { window.__avisos++; });');
    P.ev('codigoEnRecorte = function () { return true; }; capturarDoc();');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined);
    assert.equal(P.ev('window.__avisos'), 0, 'avisó de una foto que se rechazó');
  });
});

/* ==========================================================================
 * 3. LO QUE LA PANTALLA DICE Y MUESTRA
 * ======================================================================== */
describe('la pantalla del escáner', () => {
  const HTML = () => fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
  /* Solo lo que el cliente puede leer: fuera comentarios, estilos y HTML comentado. */
  const TEXTOS = () => HTML().replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/'\s*\+\s*'/g, '');

  test('NADA «de pie», y «se toma sola» solo con la condición que lo hace cierto', () => {
    const t = TEXTOS();
    assert.equal(/de pie/i.test(t), false, 'volvió a pedirle la cédula de pie');
    assert.equal(/toma las fotos sola/.test(t), false, 'promete que la cámara toma sola las fotos, y con la digital no lo hacía');
    assert.match(t, /Pon tu cédula <b>acostada<\/b> dentro del marco/);
    assert.match(t, /Cuando se ve nítida, la foto se toma sola; si tarda, toca «Tomar la foto ahora»/);
    assert.equal(/¿Es el lado del código de barras\? Voltéala/.test(t), false, 'volvió el «Voltéala» falso');
    /* Y sin bloquear la orientación: en iPhone no existe y en Chrome pide
       pantalla completa; la app ya va fija en vertical. */
    assert.equal(/orientation\.lock/.test(t), false);
  });

  test('«Tomar la foto ahora» y «Prefiero escribir mis datos» SIEMPRE a la vista con el escáner abierto', () => {
    const P = abrirPlay({ hash: '#registro' });
    P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('ESCDOC.activo'), true);
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /id="btnDocCapturar" onclick="capturarDoc\(\)">Tomar la foto ahora</);
    assert.match(h, /id="btnDocEscribir" onclick="prefieroEscribirMisDatos\(\)">Prefiero escribir mis datos</,
      'con el escáner abierto no hay salida a escribir los datos (Ley 1581, art. 6)');
    P.ev('prefieroEscribirMisDatos()');
    assert.equal(P.ev('PASOS[PASO].id'), 'identidad');
    assert.equal(P.ev('ESCDOC.activo'), false, 'la cámara siguió encendida después de escoger escribir');
  });

  test('VERDE DE VERDAD: la máscara entera vira a verde, y el disparo destella y vibra', () => {
    const css = HTML().slice(HTML().indexOf('<style>'), HTML().indexOf('</style>'));
    const enganche = /\.escaner\.escaner-doc\.enganchado\{[^}]*--mascara:(\d+),(\d+),(\d+)/.exec(css);
    assert.ok(enganche, 'la máscara no cambia de color al enganchar: solo se pone verde el borde');
    const [r, g, b] = enganche.slice(1).map(Number);
    assert.ok(g > r * 2 && g > b, 'la máscara enganchada no es verde: ' + enganche[0]);
    assert.match(css, /\.doc-guia\{[^}]*box-shadow:0 0 0 9999px rgba\(var\(--mascara\)/, 'la máscara no usa el color que vira');
    assert.match(css, /@keyframes doc-destello\{/);
    const P = escanerConVentana({ lado: 'frente' });
    P.ev('window.__vibro = []; navigator.vibrate = function (ms) { window.__vibro.push(ms); return true; };');
    P.ev('codigoEnRecorte = function () { return false; }; capturarDoc();');
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,CUADRO_0');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__vibro)')), [60], 'el disparo no vibró');
    assert.match(P.ev('escanerDocHTML()'), /class="doc-destello"/);
  });

  test('el módulo nuevo llega con la página: en el banco, en el <script src> y en la precarga del service worker', () => {
    assert.match(HTML(), /<script src="\.\.\/app\/escaner-captura\.js"><\/script>/);
    assert.match(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), /'app\/escaner-captura\.js'/,
      'sin señal, la página nueva caería a la cuenta de antes');
    assert.equal(abrirPlay().ev('typeof ECAP.decidirVentana'), 'function');
  });
});

/* ==========================================================================
 * 4. LA CÉDULA DIFÍCIL — 23 de octubre de 2026 (la verificación del
 *    autollenado y la demo de ese día)
 *
 * Lo que la verificación encontró con el escáner de verdad, y que estas
 * pruebas fijan (FALLAN con ab6b595, salvo las marcadas CENTINELA):
 *   · un PDF417 MUY gastado: la mediana de nitidez la dominaban los mosaicos
 *     del código (29 < 35 con las letras perfectas), el escáner pedía
 *     «Aléjala…» para siempre, después «si es el frente, voltéala» a quien ya
 *     mostraba el respaldo, y a los 12 s le sugería la cédula digital;
 *   · un FRENTE LISO: la puerta de 96 px lo dejaba en 8,5 < 9 y nunca se
 *     ponía en verde (la demo), y la mediana a 480 px daba 6 enfocado;
 *   · con poca luz y sin linterna, el letrero pedía «Aléjala o acércala» en
 *     vez de luz.
 * Las cédulas son las fabricadas para las letras (pruebas/cedula-ocr-*), a
 * 907 px de ancho del marco (la que ve un video de 1080, la escala de la
 * tabla de app/escaner-captura.js), sin la textura que les pone la prueba de
 * punta a punta: lisas, como la demo. Ninguna cédula de nadie.
 * ======================================================================== */
const { leerPGM } = require('./banco-ocr.js');
const { GUIA: GUIA_OCR, TARJETA: TARJETA_OCR, escalar } = require('./banco-camara.js');
const PERSONA_OCR = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                      nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };
/* La cédula de las letras con el marco a 907 px. `gastado`: el PDF417 de la
   persona en la franja de abajo, desenfocado ese σ en MÓDULOS (el código
   viejo, no la cámara). `desvaido`: el contraste de la impresión (1, la de
   fábrica). */
function cartaOcr(lado, o) {
  o = o || {};
  const k = 907 / GUIA_OCR.w;
  const img = escalar(leerPGM(path.join(__dirname, 'cedula-ocr-' + lado + '.pgm.gz')), k);
  if (o.desvaido) for (let i = 0; i < img.gris.length; i++) img.gris[i] = 200 + (img.gris[i] - 200) * o.desvaido;
  if (lado === 'reverso' && o.gastado != null) {
    const t = { x: Math.round(TARJETA_OCR.x * k), y: Math.round(TARJETA_OCR.y * k), w: Math.round(TARJETA_OCR.w * k), h: Math.round(TARJETA_OCR.h * k) };
    for (let y = t.y + Math.round(t.h * 0.66); y < t.y + Math.round(t.h * 0.985); y++)
      for (let x = t.x + Math.round(t.w * 0.02); x < t.x + Math.round(t.w * 0.98); x++) img.gris[y * img.w + x] = 222;
    const cod = F.fabricar(F.registroCedula(PERSONA_OCR), 20, 4);
    const s = Math.max(1, Math.floor(t.w * 0.94 / F.render(cod, 1, 0, 0, { quieta: 4 }).W));
    const r = F.render(cod, s, o.gastado * s, 4, { quieta: 4 });
    const bx = t.x + Math.round((t.w - r.W) / 2), by = t.y + Math.round(t.h * 0.975) - r.H;
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) img.gris[(by + y) * img.w + bx + x] = r.lum[y * r.W + x];
  }
  return { g: Float32Array.from(img.gris), W: img.w, H: img.h };
}
/* Lo que mide la ventana (480 px) y la puerta (96 px de alto, con el marco
   como interior) de esa cédula con la cámara desenfocada σ (a 907). */
function medidasDe(t, s) {
  const b = gauss(t, s), m = ECAP.tamanoDeMedida(t.W, t.H), g480 = achicar(b, t.W, t.H, m.w, m.h);
  const gw = Math.round(96 * t.W / t.H), g96 = achicar(b, t.W, t.H, gw, 96), k = 96 / t.H, e = 907 / GUIA_OCR.w;
  const interior = { x0: GUIA_OCR.x * e * k, x1: (GUIA_OCR.x + GUIA_OCR.w) * e * k, y0: GUIA_OCR.y * e * k, y1: (GUIA_OCR.y + GUIA_OCR.h) * e * k };
  return { mediana: ECAP.nitidezDeGris(g480, m.w, m.h), calidad: ECAP.calidadDeGris(g480, m.w, m.h),
           franja: EC.franjaDeBarras(g480, m.w, m.h), alto: m.h,
           puerta: o => EC.medirTarjeta(g96, g96, gw, 96, interior, o) };
}

describe('4a. el piso de la ventana no lo decide una parte de la tarjeta', () => {

  test('un PDF417 MUY gastado con las letras enfocadas: la mediana no llega al piso; la calidad sí', () => {
    const t = cartaOcr('reverso', { gastado: 1.5 });
    const m = medidasDe(t, 0);
    assert.ok(m.mediana < C.PISO_NITIDEZ, 'la mediana ya pasaba: la prueba no prueba el caso (' + m.mediana + ')');
    assert.ok(m.calidad >= C.PISO_NITIDEZ, 'los mosaicos del código gastado siguen hundiendo el piso: ' + m.calidad.toFixed(1));
  });

  test('un FRENTE LISO enfocado: la mediana da casi 0 (bordes rectos); la calidad pasa el piso', () => {
    const m = medidasDe(cartaOcr('frente'), 0);
    assert.ok(m.mediana < 10, 'la prueba no prueba el caso: ' + m.mediana);
    assert.ok(m.calidad >= C.PISO_NITIDEZ, 'un frente liso enfocado no pasa el piso: ' + m.calidad.toFixed(1));
  });

  test('SIN ACEPTAR FOTOS BORROSAS: con la cámara desenfocada (σ 1,5 y 2 a 907 px) ninguna de las dos pasa', () => {
    for (const [nombre, t] of [['el frente liso', cartaOcr('frente')], ['el respaldo gastado', cartaOcr('reverso', { gastado: 1.5 })]]) {
      for (const s of [1.5, 2]) {
        const c = medidasDe(t, s).calidad;
        assert.ok(c < C.PISO_NITIDEZ, nombre + ' con σ ' + s + ' pasó el piso: ' + c.toFixed(1));
      }
    }
  });

  test('con el código legible manda la mediana de siempre (la del CRM), y la calidad nunca baja de ella', () => {
    for (const s of [0, 1, 2]) {
      const m = medidasDe(cartaOcr('reverso', { gastado: 0 }), s);
      assert.equal(m.calidad, m.mediana, 'con el código legible cambió lo que mide la ventana (σ ' + s + ')');
    }
    for (const t of [atrasAmarilla({ W: 480 }), frente(480), atrasDigital(480)]) {
      const g = aLum(t.g);
      assert.ok(ECAP.calidadDeGris(g, t.W, t.H) >= ECAP.nitidezDeGris(g, t.W, t.H));
    }
    assert.equal(ECAP.calidadDeGris(new Uint8ClampedArray(480 * 303).fill(200), 480, 303), 0, 'una pared lisa no es nítida');
    assert.equal(ECAP.calidadDeGris(null, 0, 0), 0);
  });
});

describe('4b. la franja de las barras gastadas es del respaldo', () => {

  test('el código gastado deja su franja en el tercio de abajo, también desenfocado; el frente y la digital, ninguna', () => {
    for (const s of [0, 1, 2]) {
      const m = medidasDe(cartaOcr('reverso', { gastado: 1.5 }), s);
      assert.ok(EC.franjaComoLaDelCodigo(m.franja, m.alto), 'la franja del código gastado no se vio (σ ' + s + '): ' + JSON.stringify(m.franja));
    }
    for (const t of [cartaOcr('frente'), cartaOcr('frente', { desvaido: 0.8 })]) {
      const m = medidasDe(t, 0);
      assert.equal(EC.franjaComoLaDelCodigo(m.franja, m.alto), false, 'vio la franja del código en el frente');
    }
    const d = atrasDigital(907), md = ECAP.tamanoDeMedida(d.W, d.H), gd = achicar(d.g, d.W, d.H, md.w, md.h);
    assert.equal(EC.franjaComoLaDelCodigo(EC.franjaDeBarras(gd, md.w, md.h), md.h), false, 'vio barras en la digital');
  });

  test('en su sitio: el tercio de abajo o el de arriba (al revés), y no un renglón delgado ni del medio', () => {
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 211, y1: 230 }, 303), true);
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 73, y1: 92 }, 303), true, 'la cédula al revés');
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 140, y1: 165 }, 303), false, 'una franja en el medio no es la del código');
    assert.equal(EC.franjaComoLaDelCodigo({ y0: 250, y1: 260 }, 303), false, 'un renglón de 10 filas no es el código');
    assert.equal(EC.franjaComoLaDelCodigo(null, 303), false);
  });

  /* 23-oct-2026 (tarde) — decía «espera el rato del lector y dispara». Un
     frente sobre cuadros escoceses también deja franja
     (pruebas/el-frente-sobre-cuadros-escoceses.test.js): la franja sola ya
     no toma la foto, invita a tocar «Tomar la foto ahora». */
  test('la ventana: con solo la franja, espera el rato del lector y NUNCA dispara: invita al botón; sin ella, «sin código» como siempre', () => {
    let v = ECAP.ventanaNueva(1000);
    [60, 80, 70, 90, 65, 75, 85, 70, 60, 80].forEach(n => { v = ECAP.anotarMedida(v, n, ECAP.esMejor(v, n)); });
    const base = { lado: 'reverso', ahora: 1000, lectorListo: true, vioCodigo: false, vioFranja: true };
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { msVerde: C.MS_SOLO_FRANJA - 100 })).estado, 'esperando');
    for (const ms of [C.MS_SOLO_FRANJA, C.MS_SIN_LECTOR, 60000]) {
      const d = ECAP.decidirVentana(v, Object.assign({}, base, { msVerde: ms }));
      assert.equal(d.estado, 'solo_franja', 'con la franja sola, a los ' + ms + ' ms');
      assert.equal(d.disparar, false, 'la franja sola tomó la foto a los ' + ms + ' ms');
    }
    /* Sin lector todavía, igual: la franja no toma la foto. */
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { lectorListo: false, msVerde: 60000 })).disparar, false);
    assert.match(ECAP.TEXTO.SOLO_FRANJA, /Tomar la foto ahora/);
    assert.equal(/volt[ée]ala/i.test(ECAP.TEXTO.SOLO_FRANJA), false, 'al del código gastado lo dejaba dando vueltas');
    /* Con el código visto, sí (lo de siempre). */
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioCodigo: true, msVerde: 0 })).estado, 'disparar');
    assert.equal(ECAP.decidirVentana(v, Object.assign({}, base, { vioFranja: false, msVerde: 9000 })).estado, 'sin_codigo');
    /* La franja no le da nada al frente: ahí manda la mirada al código. */
    assert.equal(ECAP.decidirVentana(v, { lado: 'frente', ahora: 1000, vioCodigo: false, vioFranja: true, limpias: 1, msVerde: 9000 }).estado, 'disparar');
    assert.equal(C.MS_SOLO_FRANJA, EC.RESPALDO.MS_LEYENDO, 'el respaldo gastado y el visto sin leer le dan al lector ratos distintos');
  });
});

describe('4c. la puerta del frente pregunta si hay tarjeta; la nitidez la juzga la ventana', () => {

  test('un frente liso y desvaído (7,5 < 9) no pasa la puerta de siempre; con la del frente, sí', () => {
    const m = medidasDe(cartaOcr('frente', { desvaido: 0.8 }), 0);
    assert.equal(m.puerta().falla, 'borrosa', 'la puerta de siempre ya lo dejaba pasar: la prueba no prueba el caso');
    assert.ok(EC.TARJETA.NITIDEZ_MIN_FRENTE < EC.TARJETA.NITIDEZ_MIN);
    const r = m.puerta({ nitidezMin: EC.TARJETA.NITIDEZ_MIN_FRENTE });
    assert.equal(r.ok, true, 'el frente liso sigue sin ponerse en verde: ' + r.falla + ' ' + r.nitidez.toFixed(1));
    assert.ok(m.calidad >= C.PISO_NITIDEZ, 'y la ventana lo da por nítido: ' + m.calidad.toFixed(1));
    /* Desenfocado pasa la puerta (no ve el desenfoque) pero NO la ventana. */
    const b = medidasDe(cartaOcr('frente', { desvaido: 0.8 }), 2);
    assert.equal(b.puerta({ nitidezMin: EC.TARJETA.NITIDEZ_MIN_FRENTE }).ok, true);
    assert.ok(b.calidad < C.PISO_NITIDEZ, 'la ventana dio por nítido un frente desenfocado: ' + b.calidad.toFixed(1));
  });

  test('la página: la puerta del frente con la ventana; el respaldo, y el frente SIN ventana, con la de siempre', () => {
    const P = escanerConVentana({ lado: 'frente' });
    P.ev('window.__opciones = []; var __mt = EC.medirTarjeta; EC.medirTarjeta = function (g, p, w, h, i, op) { window.__opciones.push(op ? op.nitidezMin : null); return __mt.apply(this, arguments); };');
    cuadro(P, 0, 80);
    P.ev("ESCDOC.lado = 'reverso';");
    cuadro(P, 1, 80);
    P.ev("ESCDOC.lado = 'frente'; ESCDOC.sinVentana = true;");
    cuadro(P, 2, 80);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__opciones)')), [EC.TARJETA.NITIDEZ_MIN_FRENTE, null, null]);
  });
});

describe('4d. lo que la pantalla dice con la cédula difícil', () => {

  /* 23-oct-2026 (tarde) — decía «se toma solo». Ya no: un frente sobre
     cuadros escoceses también deja franja. Invita al botón, nunca oye
     «voltéala», y con el toque se guarda sin datos, como antes. */
  test('el respaldo que solo muestra la franja de sus barras NO se toma solo: invita a «Tomar la foto ahora», nunca oye «voltéala» ni lo de la cédula digital', () => {
    const P = escanerConVentana();
    P.ev('window.__franja = { y0: 211, y1: 230 }; leerCuadroDoc = function () { ESCDOC.lecturas++; };');
    for (let i = 0; i < 60 && !P.ev('FOTOS.cedula_reverso'); i++) cuadro(P, i, 50);
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'la franja sola tomó la foto: ' + estados(P).slice(-2).join(' | '));
    assert.ok(estados(P).includes(ECAP.TEXTO.SOLO_FRANJA), 'no invitó a tocar «Tomar la foto ahora»: ' + estados(P).join(' | '));
    assert.ok(P.ev('ESCDOC.msVerde') >= C.MS_SOLO_FRANJA, 'invitó sin darle al lector su rato');
    assert.equal(estados(P).some(t => /volt[ée]ala/i.test(t)), false, 'le pidió voltear la cédula con el respaldo en el marco');
    assert.equal(P.ev("$('docNota').textContent"), '', 'le sugirió la cédula digital a una amarilla');
    assert.ok(P.ev('ESCDOC.lecturas') > 2, 'el lector dejó de intentarlo');
    P.ev('capturarDoc()');
    assert.ok(P.ev('FOTOS.cedula_reverso'), 'con el toque no se guardó');
    assert.match(P.ev("$('docListoTxt').textContent"), /El código no se pudo leer/);
  });

  test('CENTINELA: una franja en el medio (un renglón de letra) no es el código: sigue «si es el frente, voltéala» y no se toma', () => {
    const P = escanerConVentana();
    P.ev('window.__franja = { y0: 140, y1: 165 }; leerCuadroDoc = function () { ESCDOC.lecturas++; };');
    for (let i = 0; i < 40; i++) cuadro(P, i, 50);
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'se tomó como respaldo una cara sin código');
    assert.ok(estados(P).includes('No vemos código en ese lado: si es el frente, voltéala'));
  });

  test('con algo del PDF417 visto (su patrón) no se sugiere la cédula digital, aunque no pase el piso', () => {
    const P = escanerConVentana();
    P.ev("leerCedulaDeLienzo = function () { return { cedula: null, error: 'no_hay', giro: null, patron: true }; };");
    for (let i = 0; i < 140; i++) cuadro(P, i, C.PISO_NITIDEZ - 10);
    assert.ok(P.ev('ESCDOC.lecturas') > 6, 'no leyó lo suficiente: la prueba no prueba el caso');
    assert.equal(P.ev("$('docNota').textContent"), '', 'le sugirió la cédula digital a una amarilla cuyo código se vio');
  });

  test('CENTINELA: sin nada visto (ni código, ni patrón, ni franja) la nota de la cédula nueva sí sale a los 12 s', () => {
    const P = escanerConVentana();
    P.ev('leerCuadroDoc = function () { ESCDOC.lecturas++; };');
    for (let i = 0; i < 140; i++) cuadro(P, i, C.PISO_NITIDEZ - 10);
    assert.equal(P.ev("$('docNota').textContent"), P.ev('TEXTO_CEDULA_NUEVA'));
  });

  for (const [camino, sinVentana] of [['con la ventana', false], ['sin la ventana (un navegador que no deja medir)', true]]) {
    test('poca luz y SIN linterna, ' + camino + ': fuera de verde pide luz, no «Aléjala o acércala»', () => {
      const P = escanerConVentana();
      P.ev('window.__pista = { getCapabilities: function () { return {}; }, getSettings: function () { return { width: 3840, height: 2160 }; },' +
           ' applyConstraints: function () { return Promise.resolve(); } };' +
           'ESCDOC.stream = { getVideoTracks: function () { return [window.__pista]; }, getTracks: function () { return []; } };' +
           'afinarCamaraDoc(window.__pista);');
      assert.equal(P.ev('ESCDOC.puedeLuz'), false);
      if (sinVentana) P.ev('ESCDOC.sinVentana = true;');
      P.ev('window.__medida = { ok: false, nitidez: 4, luz: 50, saturados: 0, falla: "borrosa" };');
      for (let i = 0; i < 15; i++) cuadro(P, i, 0);
      assert.equal(P.ev('ESCDOC.pedirLuz'), true, 'la linterna no supo que falta luz: la prueba no prueba el caso');
      assert.equal(P.ev("$('docEstado').textContent"), ECAP.TEXTO.BUSCA_LUZ);
      /* Con luz de sobra y desenfocada, lo de siempre. */
      const Q = escanerConVentana();
      if (sinVentana) Q.ev('ESCDOC.sinVentana = true;');
      Q.ev('window.__medida = { ok: false, nitidez: 4, luz: 160, saturados: 0, falla: "borrosa" };');
      for (let i = 0; i < 15; i++) cuadro(Q, i, 0);
      assert.equal(Q.ev("$('docEstado').textContent"), EC.textoDeTarjeta({ falla: 'borrosa' }));
    });
  }
});
