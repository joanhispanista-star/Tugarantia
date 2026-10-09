'use strict';
/* ==========================================================================
 * EL RESPALDO DE LA CÉDULA: DERECHO, Y DISPARA SOLO — 8 de octubre de 2026
 *
 * Joan, registrándose él mismo:
 *   · «la primera foto sin problema, el teléfono solo enfocó y la tomó; pero
 *     en la foto de respaldo algo pasó y me tocó tomarla a mí porque el
 *     celular no escaneó»;
 *   · «y cuando la tomé, en el CRM se ve al revés».
 *
 * LAS DOS CAUSAS, encontradas en el código (no en un teléfono):
 *   1. El respaldo SOLO disparaba si el código de barras se leía del video.
 *      El frente dispara por encuadre. Cuando el lector no podía (resolución
 *      de la cámara, reflejo, la cédula torcida o tan cerca que el recorte le
 *      cortaba la barra de inicio), el escáner decía «Leyendo el código…» sin
 *      fin. Ahora lee mientras puede y, si no, dispara igual
 *      (EC.decidirRespaldo), y el recorte lleva aire (EC.margenDeLectura).
 *   2. El respaldo se escanea de pie y el recorte se gira 90° SIEMPRE hacia el
 *      mismo lado. La cédula se pone de pie hacia los dos lados: la mitad de
 *      las veces la foto quedaba cabeza abajo. El lector no se enteraba (lee a
 *      0° y a 180°). Ahora se mide (EC.orientacionDelRespaldo) y se guarda
 *      derecha.
 *
 * Lo que necesita una cámara de verdad no se prueba aquí: se prueba con
 * tarjetas FABRICADAS que llevan un PDF417 válido (pruebas/fabrica-pdf417.js),
 * texto, una huella y fondo oscuro a los lados, derechas y volteadas, nítidas,
 * desenfocadas e inclinadas. Ninguna foto de nadie entra al repositorio.
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const F = require('./fabrica-pdf417.js');
const IM = require('./imagenes-de-mentira.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const CODIGO = F.fabricar(F.registroCedula(), 15, 5);
const BUNDLE = fs.readFileSync(path.join(RAIZ, 'app', 'lib', 'zxing.min.js'), 'utf8');

/* --------------------------------------------------------------------------
   Una cara de atrás de cédula, acostada, como la deja el recorte: fondo con
   trama, renglones de letra, una huella, el código de barras (abajo o arriba:
   la cura no puede depender de dónde lo imprime la Registraduría) y, si se
   pide, fondo oscuro a los lados (la mesa que entra con el aire del recorte).
   -------------------------------------------------------------------------- */
function azar(s) { s >>>= 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
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
  const bc = F.render(CODIGO, s, o.sigma || 0, o.ruido || 0, { quieta: o.quieta || 4 });
  const bx = Math.round((W - bc.W) / 2), by = o.arriba ? Math.round(H * 0.08) : Math.round(H * 0.95 - bc.H);
  for (let y = 0; y < bc.H; y++) for (let x = 0; x < bc.W; x++) {
    const X = bx + x, Y = by + y;
    if (X >= 0 && X < W && Y >= 0 && Y < H) g[Y * W + X] = bc.lum[y * bc.W + x];
  }
  if (o.fondo) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < o.fondo || x >= W - o.fondo || y < o.fondo * 0.6 || y >= H - o.fondo * 0.6) g[y * W + x] = 50 + 20 * Math.sin(x / 5);
    }
  }
  let out = g;
  if (o.inclinada) {
    const t = o.inclinada * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t), n = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - W / 2, dy = y - H / 2, X = c * dx + sn * dy + W / 2, Y = -sn * dx + c * dy + H / 2;
      const xi = Math.floor(X), yi = Math.floor(Y);
      if (xi < 0 || yi < 0 || xi >= W - 1 || yi >= H - 1) { n[y * W + x] = 200; continue; }
      const fx = X - xi, fy = Y - yi;
      n[y * W + x] = g[yi * W + xi] * (1 - fx) * (1 - fy) + g[yi * W + xi + 1] * fx * (1 - fy) +
        g[(yi + 1) * W + xi] * (1 - fx) * fy + g[(yi + 1) * W + xi + 1] * fx * fy;
    }
    out = n;
  }
  const rr = azar(9), lum = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = out[i] + (rr() - 0.5) * 2 * (o.grano || 0);
  return { lum, W, H };
}
const voltear = lum => { const o = new Uint8ClampedArray(lum.length); for (let i = 0; i < lum.length; i++) o[i] = lum[lum.length - 1 - i]; return o; };

/* Las que el lector LEE, y las que NO (inclinada 3-4°, desenfocada): estas
   últimas son el caso de Joan. */
const LEIBLES = [{}, { sigma: 1 }, { sigma: 1.5, grano: 8 }, { arriba: true }, { fondo: 60 },
  { fondo: 60, sigma: 1.2, grano: 6 }, { inclinada: 2 }, { s: 2.4, sigma: 1 }, { quieta: 2, fondo: 40 }, { s: 4, W: 1500 }];
const ILEGIBLES = [{ inclinada: -3, sigma: 1 }, { inclinada: 4, fondo: 50, sigma: 1.4, grano: 10 }];

describe('dónde vio el código, y hacia dónde mira', () => {
  test('el lector devuelve también las esquinas del código', () => {
    F.latin1EnNode(true);
    try {
      const t = respaldo({ sigma: 1 });
      const r = EC.decodificarLuminancias(F.Z, t.lum, t.W, t.H);
      assert.ok(r.texto, 'la tarjeta fabricada dejó de leerse: ' + r.error);
      assert.ok(Array.isArray(r.puntos) && r.puntos.length >= 4, 'no vinieron las esquinas');
      r.puntos.forEach(p => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)));
    } finally { F.latin1EnNode(false); }
  });

  test('EL LECTOR NO SE ENTERA DEL GIRO: lee igual derecha y volteada (la causa)', () => {
    /* Esto es lo que dejó vivir el defecto: si leer fallara con la foto
       volteada, alguien lo habría visto. Lee las dos, y las esquinas salen
       IGUALES — por eso hay que mirar la imagen para saber cuál era. */
    F.latin1EnNode(true);
    try {
      const t = respaldo({});
      const a = EC.decodificarLuminancias(F.Z, t.lum, t.W, t.H);
      const b = EC.decodificarLuminancias(F.Z, voltear(t.lum), t.W, t.H);
      assert.ok(a.texto && b.texto, 'una de las dos no se leyó');
      assert.equal(a.texto, b.texto);
      assert.deepEqual(a.puntos, b.puntos, 'las esquinas ya distinguen el giro: entonces la medida podría ser más simple');
    } finally { F.latin1EnNode(false); }
  });

  test('cuando LEYÓ: derecha dice 0, volteada dice 180, y está segura', () => {
    F.latin1EnNode(true);
    try {
      for (const o of LEIBLES) {
        const t = respaldo(o);
        for (const vuelta of [false, true]) {
          const lum = vuelta ? voltear(t.lum) : t.lum;
          const r = EC.decodificarLuminancias(F.Z, lum, t.W, t.H);
          assert.ok(r.texto, JSON.stringify(o) + ' dejó de leerse');
          const ori = EC.orientacionDelRespaldo(lum, t.W, t.H, { puntos: r.puntos });
          assert.equal(ori.seguro, true, JSON.stringify(o) + (vuelta ? ' volteada' : ' derecha') + ': no se decidió');
          assert.equal(ori.giro, vuelta ? 180 : 0, JSON.stringify(o) + (vuelta ? ' volteada' : ' derecha') + ' salió al revés');
        }
      }
    } finally { F.latin1EnNode(false); }
  });

  test('cuando NO LEYÓ (el caso de Joan): el patrón del código decide igual', () => {
    F.latin1EnNode(true);
    try {
      for (const o of ILEGIBLES) {
        const t = respaldo(o);
        assert.ok(!EC.decodificarLuminancias(F.Z, t.lum, t.W, t.H).texto,
          JSON.stringify(o) + ' sí se lee: este caso ya no prueba el camino sin lectura');
      }
      for (const o of ILEGIBLES.concat(LEIBLES)) {
        const t = respaldo(o);
        for (const vuelta of [false, true]) {
          const ori = EC.orientacionDelRespaldo(vuelta ? voltear(t.lum) : t.lum, t.W, t.H, {});
          assert.equal(ori.seguro, true, JSON.stringify(o) + ': sin lectura no se decidió');
          assert.equal(ori.giro, vuelta ? 180 : 0, JSON.stringify(o) + (vuelta ? ' volteada' : ' derecha') + ' salió al revés');
          assert.equal(ori.por, 'patron');
        }
      }
    } finally { F.latin1EnNode(false); }
  });

  test('SIN CÓDIGO NO OPINA: una foto que estaba bien no se voltea a ciegas', () => {
    /* Lo peor que puede hacer esta cura es voltear una foto derecha. Una
       tarjeta de letras, una selfie con pelo en hebras (rayitas verticales,
       lo más parecido a barras), ruido, una pared lisa y una camisa a rayas. */
    const W = 1000, H = 630;
    const rayas = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rayas[y * W + x] = (Math.floor(x / 7) % 2) ? 40 : 220;
    const casos = {
      tarjeta: Uint8ClampedArray.from(IM.tarjeta(W, H, 120)),
      selfie: Uint8ClampedArray.from(IM.selfie(W, H)),
      ruido: Uint8ClampedArray.from(IM.ruido(new Float64Array(W * H).fill(128), 40, 3)),
      pared: new Uint8ClampedArray(W * H).fill(200),
      rayas
    };
    for (const [n, g] of Object.entries(casos)) {
      const r = EC.orientacionDelRespaldo(g, W, H, {});
      assert.deepEqual(r, { giro: 0, seguro: false, por: '' }, n + ' opinó sin tener código: ' + JSON.stringify(r));
    }
    assert.deepEqual(EC.orientacionDelRespaldo(null, 0, 0), { giro: 0, seguro: false, por: '' });
    assert.deepEqual(EC.orientacionDelRespaldo(new Uint8ClampedArray(10), 5, 5), { giro: 0, seguro: false, por: '' });
  });
});

/* --------------------------------------------------------------------------
   LA CAUSA DE FONDO DE «EL CELULAR NO ESCANEÓ». Un cuadro de video vertical
   (1080×1920, en chico para la prueba) con la cédula de pie llenando el marco,
   sobre una mesa oscura. Se reproduce lo que hace grisDeGuia: la ventana del
   marco más su anillo, recortada contra el borde, achicada a 96 px de alto.
   Medido también con Chrome y una cámara de mentira que mostraba esta misma
   cédula fabricada: el código de antes decía «Pon la cédula dentro del
   marco» sin parar y no intentaba leer NI UNA vez.
   -------------------------------------------------------------------------- */
function cuadroDePie(VW, VH, tarjetaW) {
  const t = respaldo({ W: tarjetaW });
  const Y = new Float32Array(VW * VH);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) Y[y * VW + x] = 70 + 20 * Math.sin(x / 9) * Math.cos(y / 13);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const u = Math.round(y - VH / 2 + t.W / 2), v = Math.round(-(x - VW / 2) + t.H / 2);   // de pie, girada a la derecha
    if (u >= 0 && u < t.W && v >= 0 && v < t.H) Y[y * VW + x] = t.lum[v * t.W + u];
  }
  return Y;
}
function grisDeLaVentana(Y, VW, vg) {
  const g = new Uint8ClampedArray(vg.gw * vg.gh);
  for (let y = 0; y < vg.gh; y++) for (let x = 0; x < vg.gw; x++) {
    const X0 = Math.floor(vg.sx + x * vg.sw / vg.gw), X1 = Math.max(X0 + 1, Math.floor(vg.sx + (x + 1) * vg.sw / vg.gw));
    const Y0 = Math.floor(vg.sy + y * vg.sh / vg.gh), Y1 = Math.max(Y0 + 1, Math.floor(vg.sy + (y + 1) * vg.sh / vg.gh));
    let s = 0, n = 0;
    for (let yy = Y0; yy < Y1; yy++) for (let xx = X0; xx < X1; xx++) { s += Y[yy * VW + xx]; n++; }
    g[y * vg.gw + x] = s / n;
  }
  return g;
}

describe('la puerta del respaldo se ponía en verde (la causa de «no escaneó»)', () => {
  const VW = 540, VH = 960;   // la mitad de 1080×1920: la misma geometría
  const guia = EC.rectanguloGuia(VW, VH, false);
  const vg = EC.ventanaDeGuia(guia, VW, VH, 96);
  const Y = cuadroDePie(VW, VH, Math.round(guia.h * 0.98));
  const gris = grisDeLaVentana(Y, VW, vg);

  test('con el respaldo de pie, el anillo NO cabe en el cuadro: el marco no queda en el 15-85 %', () => {
    assert.equal(guia.vertical, true);
    assert.ok(vg.interior.x0 < vg.gw * 0.1 && vg.interior.x1 > vg.gw * 0.9,
      'el marco quedó en el 15-85 %: entonces la medida vieja servía y esta prueba no mide nada');
  });

  test('ANTES: con la cédula llenando el marco decía «Pon la cédula dentro del marco»', () => {
    const m = EC.medirTarjeta(gris, gris, vg.gw, vg.gh);
    assert.equal(m.falla, 'sin_tarjeta', 'la medida vieja ya veía la cédula: ' + JSON.stringify(m));
    assert.ok(m.anillo > m.textura, 'el anillo no se estaba llenando de cédula');
  });

  test('AHORA: sabiendo dónde quedó el marco, en verde', () => {
    const m = EC.medirTarjeta(gris, gris, vg.gw, vg.gh, vg.interior);
    assert.equal(m.ok, true, JSON.stringify(m));
  });

  test('y una mesa sola sigue sin pasar, con o sin interior', () => {
    const mesa = new Uint8ClampedArray(vg.gw * vg.gh).fill(90);
    assert.equal(EC.medirTarjeta(mesa, mesa, vg.gw, vg.gh, vg.interior).falla, 'sin_tarjeta');
  });

  test('la página le pasa el interior a la puerta', () => {
    const t = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    assert.match(t, /EC\.medirTarjeta\(g, ESCDOC\.previa, ESCDOC\.grisW, ESCDOC\.grisH, ESCDOC\.interiorGris\)/);
    assert.match(t, /ESCDOC\.interiorGris = vg\.interior;/);
  });
});

describe('el recorte con aire', () => {
  test('crece alrededor del marco sin salirse del cuadro, y no pierde el «de pie»', () => {
    const g = EC.rectanguloGuia(1080, 1920, false);
    const m = EC.margenDeLectura(g, 1080, 1920, 0.06);
    assert.equal(m.vertical, true);
    assert.ok(m.x <= g.x && m.y < g.y && m.x + m.w >= g.x + g.w && m.y + m.h > g.y + g.h, 'no creció');
    assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.w <= 1080 && m.y + m.h <= 1920, 'se salió del cuadro');
    assert.equal(EC.margenDeLectura(null, 10, 10), null);
    const sin = EC.margenDeLectura(g, 1080, 1920, 0);
    assert.deepEqual([sin.x, sin.y, sin.w, sin.h], [g.x, g.y, g.w, g.h]);
  });
});

describe('el respaldo dispara solo (EC.decidirRespaldo)', () => {
  const R = EC.RESPALDO, Q = EC.TARJETA.CUADROS_FRENTE;
  /* 8-oct-2026 (segunda vuelta) — `vioCodigo: true` en la base, y es a
     propósito: desde hoy el respaldo dispara solo si en ese lado se vio un
     código de barras (ver «sin código a la vista NO dispara», abajo). Sin
     eso, el frente puesto al revés se guardaba como respaldo. */
  const base = { estables: Q, msVerde: R.MS_LEYENDO, lecturas: R.LECTURAS_MIN, nitidez: 20, mejorNitidez: 20, vioCodigo: true };

  test('con la cédula bien puesta su rato y el lector habiendo intentado: dispara', () => {
    assert.equal(EC.decidirRespaldo(base).disparar, true);
    assert.equal(EC.decidirRespaldo(base).avance, 1);
  });
  test('antes de su rato NO: primero se le da al lector la oportunidad de leer', () => {
    const d = EC.decidirRespaldo(Object.assign({}, base, { msVerde: R.MS_LEYENDO - 100 }));
    assert.equal(d.disparar, false);
    assert.ok(d.avance > 0.9 && d.avance < 1, 'la barra no cuenta el rato: ' + d.avance);
  });
  test('moviéndose o en un cuadro borroso NO: la foto sale en un cuadro nítido', () => {
    assert.equal(EC.decidirRespaldo(Object.assign({}, base, { estables: Q - 1 })).disparar, false);
    assert.equal(EC.decidirRespaldo(Object.assign({}, base, { nitidez: 10, mejorNitidez: 20 })).disparar, false);
  });
  test('si el lector ni llegó (señal floja), no se espera para siempre', () => {
    assert.equal(EC.decidirRespaldo(Object.assign({}, base, { lecturas: 0 })).disparar, false);
    assert.equal(EC.decidirRespaldo(Object.assign({}, base, { lecturas: 0, msVerde: R.MS_SIN_LECTOR })).disparar, true);
  });
  test('sin código a la vista NO dispara, y pide voltearla (el frente puesto al revés)', () => {
    const d = EC.decidirRespaldo(Object.assign({}, base, { vioCodigo: false, msVerde: R.MS_SIN_LECTOR }));
    assert.equal(d.disparar, false, 'disparó sin haber visto un código de barras');
    assert.equal(d.voltear, true);
    assert.equal(EC.decidirRespaldo(base).voltear, false);
  });
  test('sin datos no revienta ni dispara', () => {
    assert.deepEqual(EC.decidirRespaldo(null), { disparar: false, avance: 0, voltear: false });
    assert.deepEqual(EC.decidirRespaldo({}), { disparar: false, avance: 0, voltear: false });
  });
});

/* --------------------------------------------------------------------------
   DENTRO DE LA PÁGINA. Un lienzo de mentira que devuelve los píxeles de la
   tarjeta fabricada, ZXing de verdad, y la foto que se guarda espiada para
   saber con qué giro se guardó.
   -------------------------------------------------------------------------- */
function conTarjeta(P, t) {
  P.ev(BUNDLE);
  P.ev("ZXing.ZXingStringEncoding.customDecoder = function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };");
  const b64 = Buffer.from(t.lum).toString('base64');
  P.ev("window.__lum = Uint8ClampedArray.from(atob('" + b64 + "'), function (c) { return c.charCodeAt(0); });");
  P.ev('window.__lienzo = { width: ' + t.W + ', height: ' + t.H + ', getContext: function () { return { getImageData: function () {' +
       ' var n = window.__lum.length, d = new Uint8ClampedArray(n * 4);' +
       ' for (var i = 0, j = 0; i < n; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = window.__lum[i]; d[j + 3] = 255; }' +
       ' return { data: d }; } }; } };');
  P.ev('window.__giros = []; fotoDeLienzo = function (c, max, q, giro) { window.__giros.push(giro); return "data:image/jpeg;base64,FOTO"; };');
  P.ev('recortarGuia = function () { return window.__lienzo; }; ESCDOC.recorte = window.__lienzo;');
  P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;");
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
}
const ultimoGiro = P => JSON.parse(P.ev('JSON.stringify(window.__giros)')).pop();

describe('la página guarda el respaldo derecho', () => {
  test('«Tomar la foto ahora» con la cédula volteada: se lee Y se guarda girada 180°', () => {
    const P = abrirPlay();
    const t = respaldo({ sigma: 1 });
    conTarjeta(P, Object.assign({}, t, { lum: voltear(t.lum) }));
    P.ev("ESCDOC.lado = 'reverso'; capturarDoc();");
    assert.equal(ultimoGiro(P), 180, 'el respaldo volteado se guardó tal cual: es lo que Joan vio en el CRM');
    assert.equal(P.ev('FOTOS.cedula_leida && FOTOS.cedula_leida.documento'), '1234567', 'dejó de leer');
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,FOTO');
  });

  test('derecha, se guarda sin girar', () => {
    const P = abrirPlay();
    conTarjeta(P, respaldo({ sigma: 1 }));
    P.ev("ESCDOC.lado = 'reverso'; capturarDoc();");
    assert.ok(!ultimoGiro(P), 'giró una foto que ya estaba derecha: ' + ultimoGiro(P));
  });

  test('EL CASO DE JOAN: no se lee, y aun así se guarda derecha', () => {
    const P = abrirPlay();
    const t = respaldo(ILEGIBLES[1]);
    conTarjeta(P, Object.assign({}, t, { lum: voltear(t.lum) }));
    P.ev("ESCDOC.lado = 'reverso'; capturarDoc();");
    assert.equal(P.ev('FOTOS.cedula_leida'), undefined, 'leyó: este caso ya no es el de Joan');
    assert.equal(ultimoGiro(P), 180, 'sin lectura la foto volteada se quedó volteada');
    assert.match(P.ev("$('docListoTxt').textContent"), /Foto tomada\. El código no se pudo leer/,
      'no le dice que los datos se escriben en el paso siguiente');
  });

  test('lectura en vivo (el bucle) con la cédula volteada: también derecha', () => {
    const P = abrirPlay();
    const t = respaldo({});
    conTarjeta(P, Object.assign({}, t, { lum: voltear(t.lum) }));
    P.ev("ESCDOC.lado = 'reverso'; ESCDOC.turno = 7; ESCDOC.stream = {}; ESCDOC.activo = true;");
    P.ev("leerCuadroDoc($('docVideo'))");
    assert.equal(P.ev('ESCDOC.activo'), false, 'no leyó en vivo');
    assert.equal(ultimoGiro(P), 180);
  });

  test('el detector nativo no dice cómo leyó: se mide por el patrón', () => {
    const P = abrirPlay();
    const t = respaldo({ sigma: 1 });
    conTarjeta(P, Object.assign({}, t, { lum: voltear(t.lum) }));
    P.ev("ESCDOC.lado = 'reverso'; leidaDoc({ documento: '1234567', nombres: 'JUAN', apellidos: 'PEREZ' });");
    assert.equal(ultimoGiro(P), 180, 'con el lector nativo la foto se quedaba volteada');
  });

  test('la foto de la galería también se endereza (después de leer, con el lienzo grande suelto)', async () => {
    const P = abrirPlay();
    const t = respaldo({ sigma: 1 });
    conTarjeta(P, Object.assign({}, t, { lum: voltear(t.lum) }));
    P.ev('window.cargarScript = function () { return Promise.resolve(); };');
    P.ev('window.__enderezo = null; enderezarFotoGuardada = function (k, g) { window.__enderezo = [k, g, window.__lienzo.width]; return Promise.resolve(true); };');
    await P.ev('leerCodigoDeBarras(window.__lienzo)');
    const e = JSON.parse(P.ev('JSON.stringify(window.__enderezo)'));
    assert.deepEqual(e.slice(0, 2), ['cedula_reverso', 180], 'la foto de la galería se quedó volteada');
    assert.equal(e[2], 1, 'enderezó con el lienzo grande todavía vivo: dos fotos grandes en memoria a la vez');
  });

  test('fotoDeLienzo gira de verdad, y sin giro hace lo de siempre', () => {
    const P = abrirPlay();
    P.ev('window.__ops = [];' +
      'document.createElement = function () { return { width: 0, height: 0, getContext: function () { return {' +
      '  translate: function (x, y) { window.__ops.push(["t", x, y]); }, rotate: function (a) { window.__ops.push(["r", Math.round(a * 180 / Math.PI)]); },' +
      '  drawImage: function () { window.__ops.push(["d"].concat([].slice.call(arguments, 1))); } }; },' +
      '  toDataURL: function () { window.__ops.push(["tam", this.width, this.height]); return "data:image/jpeg;base64,X"; } }; };');
    const op = () => JSON.parse(P.ev('JSON.stringify(window.__ops.splice(0))'));
    P.ev('fotoDeLienzo({ width: 1800, height: 1000 }, 900, 0.6, 180)');
    let o = op();
    assert.deepEqual(o.find(x => x[0] === 'r'), ['r', 180]);
    assert.deepEqual(o.find(x => x[0] === 'tam'), ['tam', 900, 500]);
    P.ev('fotoDeLienzo({ width: 1800, height: 1000 }, 900, 0.6, 90)');
    o = op();
    assert.deepEqual(o.find(x => x[0] === 'tam'), ['tam', 500, 900], 'a 90° no se cambiaron los lados');
    P.ev('fotoDeLienzo({ width: 1800, height: 1000 }, 900, 0.6)');
    o = op();
    assert.equal(o.find(x => x[0] === 'r'), undefined, 'sin giro también rotó');
    assert.deepEqual(o.find(x => x[0] === 'd'), ['d', 0, 0, 900, 500], 'sin giro dejó de dibujar como siempre');
  });
});

describe('el bucle dispara el respaldo sin lectura', () => {
  function enElBucle(P, estado) {
    P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;");
    P.ev("medirCajaDoc = function () {}; grisDeGuia = function () { return [1]; };");
    /* El lector ya bajó (si no, la pantalla dice «Escaneando…», que también es cierto). */
    P.ev("window.ZXing = window.ZXing || {};");
    P.ev('EC = Object.assign({}, EC, { medirTarjeta: function () { return { ok: true, nitidez: 20, falla: "" }; } });');
    P.ev('window.__hizo = []; capturarDoc = function () { window.__hizo.push("foto"); }; leerCuadroDoc = function () { window.__hizo.push("leer"); };');
    P.ev("ESCDOC.activo = true; ESCDOC.lado = 'reverso'; ESCDOC.desde = Date.now(); ESCDOC.leyendo = false; ESCDOC.ultima = 0; ESCDOC.tUltimo = 0;" +
      'ESCDOC.estables = ' + estado.estables + '; ESCDOC.msVerde = ' + estado.msVerde + '; ESCDOC.lecturas = ' + estado.lecturas + '; ESCDOC.mejorNitidez = 20;' +
      'ESCDOC.vioCodigo = ' + (estado.vioCodigo === false ? 'false' : 'true') + ';');
    P.ev('bucleEscanerDoc()');
    return JSON.parse(P.ev('JSON.stringify(window.__hizo)'));
  }

  /* 8-oct-2026 (segunda vuelta): con `vioCodigo` — el lector encontró un código
     que no pudo leer, o vio el patrón de sus barras. Sin eso no dispara: ver la
     prueba de abajo. */
  test('pasado su rato, con la cédula quieta Y un código a la vista: toma la foto aunque no haya leído', () => {
    const P = abrirPlay();
    assert.deepEqual(enElBucle(P, { estables: 10, msVerde: 3000, lecturas: 4 }), ['foto'],
      'el respaldo volvió a esperar la lectura para siempre: es lo que le pasó a Joan');
    assert.match(P.ev("$('docEstado').textContent"), /tomando la foto/);
  });

  /* 8-oct-2026 (segunda vuelta) — LA REVISIÓN DEL TELÉFONO: con el FRENTE puesto
     en el marco de pie (también es una tarjeta nítida y quieta), a los 2,5 s se
     guardaba como respaldo y el paso siguiente guardaba el otro lado: fotos
     cambiadas. Sin un solo código visto, se pide voltearla y no se dispara. */
  test('sin ningún código a la vista NO dispara: pide voltearla', () => {
    const P = abrirPlay();
    assert.ok(!enElBucle(P, { estables: 10, msVerde: 7000, lecturas: 8, vioCodigo: false }).includes('foto'),
      'guardó como respaldo una cara sin código de barras (el frente puesto al revés)');
    assert.match(P.ev("$('docEstado').textContent"), /¿Es el lado del código de barras\? Voltéala/);
  });

  test('un código encontrado sin leer, o el patrón de sus barras, cuentan como «vio el código»', () => {
    const P = abrirPlay();
    P.ev("ESCDOC.turno = 1; ESCDOC.stream = {}; ESCDOC.vioCodigo = false; window.ZXing = {}; ESCDOC.nativo = null;" +
         "recortarGuia = function () { return { width: 10, height: 10 }; };" +
         "leerCedulaDeLienzo = function () { return { cedula: null, error: 'ilegible', giro: null, patron: false }; };");
    P.ev("leerCuadroDoc({ videoWidth: 1080 })");
    assert.equal(P.ev('ESCDOC.vioCodigo'), true, 'un código ilegible no contó');
    P.ev("ESCDOC.vioCodigo = false; leerCedulaDeLienzo = function () { return { cedula: null, error: 'no_hay', giro: null, patron: true }; };");
    P.ev("leerCuadroDoc({ videoWidth: 1080 })");
    assert.equal(P.ev('ESCDOC.vioCodigo'), true, 'el patrón de barras no contó');
    P.ev("ESCDOC.vioCodigo = false; leerCedulaDeLienzo = function () { return { cedula: null, error: 'no_hay', giro: null, patron: false }; };");
    P.ev("leerCuadroDoc({ videoWidth: 1080 })");
    assert.equal(P.ev('ESCDOC.vioCodigo'), false, 'contó como código una tarjeta sin código');
    /* Y cada lado empieza sin haber visto nada. */
    P.ev('ESCDOC.vioCodigo = true; reiniciarCuentaDoc();');
    assert.equal(P.ev('ESCDOC.vioCodigo'), false);
  });

  test('antes de su rato, sigue intentando leer', () => {
    const P = abrirPlay();
    assert.deepEqual(enElBucle(P, { estables: 10, msVerde: 500, lecturas: 1 }), ['leer']);
    assert.match(P.ev("$('docEstado').textContent"), /Leyendo el código/);
  });
});
