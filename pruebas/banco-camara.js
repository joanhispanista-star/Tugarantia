'use strict';
/* ==========================================================================
 * EL BANCO DE LA CÁMARA — 21 de octubre de 2026
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato
 * con el que play/ corre su escáner de la cédula DE VERDAD —la puerta, la
 * ventana del mejor cuadro, recortarGuia, leerCuadroDoc, leidaDoc,
 * capturarDoc, fotoDeLienzo y el enganche alTomarLaCedula— con ZXing de
 * verdad, delante de una cámara de mentira.
 *
 * Nació dentro de pruebas/escaner-ocr-de-punta-a-punta.test.js (la
 * integración del lote 1) y se mudó aquí el mismo día, con la verificación
 * de ese lote (R1): la prueba de la cédula digital necesitaba la MISMA
 * cámara, y «un banco duplicado se desincroniza, y un banco desincronizado
 * prueba otra página» (pruebas/banco-play.js).
 *
 * De mentira solo lo que el banco no tiene: la cámara (un cuadro de video 4K
 * vertical con lo que la prueba le ponga delante), un lienzo que dibuja en
 * grises (LIENZO EN GRISES), el reloj y la carga de <script> (la red).
 * ======================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const O = require('../app/ocr-cedula.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { asentar } = require('./esperar.js');

const ZXING = fs.readFileSync(path.join(RAIZ, 'app', 'lib', 'zxing.min.js'), 'utf8');

/* ==========================================================================
 * LIENZO EN GRISES
 * Lo mínimo de un <canvas> 2D para lo que el escáner hace: drawImage (de video
 * o de otro lienzo, a escala, con translate/rotate para la foto girada),
 * getImageData y toDataURL. Un canal de gris: las cédulas fabricadas son
 * grises. toDataURL no comprime nada: devuelve una marca con la huella de los
 * píxeles, y `FOTOS_HECHAS` guarda de qué recorte salió cada foto. Así una
 * prueba puede decir «las letras se leyeron del MISMO recorte de la foto».
 * ======================================================================== */
const FOTOS_HECHAS = new Map();
const huella = px => crypto.createHash('sha1').update(px).digest('hex').slice(0, 16);
function multiplicar(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
          m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
          m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function fuenteDe(src) {
  if (src && src.__px) return { px: src.__px, W: src.videoWidth, H: src.videoHeight, huella: null };
  if (src && src.__lienzo) return { px: src.__lienzo.px, W: src.width, H: src.height, huella: src.__lienzo };
  throw new Error('drawImage de algo que no es video ni lienzo');
}
function crearLienzo() {
  const L = { W: 0, H: 0, px: new Uint8ClampedArray(0), origen: null };
  let T = [1, 0, 0, 1, 0, 0];
  const pila = [];
  const c = {
    __lienzo: L,
    get width() { return L.W; },
    set width(v) { L.W = Math.max(0, v | 0); L.px = new Uint8ClampedArray(L.W * L.H); L.origen = null; },
    get height() { return L.H; },
    set height(v) { L.H = Math.max(0, v | 0); L.px = new Uint8ClampedArray(L.W * L.H); L.origen = null; },
    getContext() { return ctx; },
    toDataURL() {
      const id = 'data:image/jpeg;base64,' + Buffer.from('LIENZO ' + L.W + 'x' + L.H + ' ' + huella(L.px)).toString('base64');
      FOTOS_HECHAS.set(id, { W: L.W, H: L.H, px: Uint8ClampedArray.from(L.px), origen: L.origen });
      return id;
    }
  };
  const ctx = {
    canvas: c,
    save() { pila.push(T.slice()); },
    restore() { if (pila.length) T = pila.pop(); },
    setTransform(a, b, cc, d, e, f) { T = [a, b, cc, d, e, f]; },
    translate(x, y) { T = multiplicar(T, [1, 0, 0, 1, x, y]); },
    rotate(a) { const co = Math.cos(a), si = Math.sin(a); T = multiplicar(T, [co, si, -si, co, 0, 0]); },
    scale(x, y) { T = multiplicar(T, [x, 0, 0, y, 0, 0]); },
    fillRect() {}, clearRect() {}, putImageData() {},
    drawImage(src, ...a) {
      const f = fuenteDe(src);
      let sx = 0, sy = 0, sw = f.W, sh = f.H, dx, dy, dw, dh;
      if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; }
      else if (a.length === 4) { [dx, dy, dw, dh] = a; }
      else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
      /* De qué lienzo salió este (la foto sale del recorte): la huella del
         recorte en el momento de dibujar. */
      L.origen = f.huella ? huella(f.huella.px) : null;
      const recto = Math.abs(T[1]) < 1e-9 && Math.abs(T[2]) < 1e-9 && T[0] > 0 && T[3] > 0;
      if (recto) {
        const X0 = T[0] * dx + T[4], Y0 = T[3] * dy + T[5], DW = T[0] * dw, DH = T[3] * dh;
        const kx = sw / DW, ky = sh / DH;
        const i0 = Math.max(0, Math.floor(X0)), i1 = Math.min(L.W, Math.ceil(X0 + DW));
        const j0 = Math.max(0, Math.floor(Y0)), j1 = Math.min(L.H, Math.ceil(Y0 + DH));
        for (let j = j0; j < j1; j++) {
          const ya = sy + (j - Y0) * ky, yb = ya + ky;
          let y0 = Math.max(0, Math.floor(ya)), y1 = Math.min(f.H, Math.max(y0 + 1, Math.ceil(yb)));
          for (let i = i0; i < i1; i++) {
            const xa = sx + (i - X0) * kx, xb = xa + kx;
            const x0 = Math.max(0, Math.floor(xa)), x1 = Math.min(f.W, Math.max(x0 + 1, Math.ceil(xb)));
            if (x0 >= f.W || y0 >= f.H) continue;
            let s = 0, n = 0;
            for (let y = y0; y < y1; y++) { const b = y * f.W; for (let x = x0; x < x1; x++) { s += f.px[b + x]; n++; } }
            L.px[j * L.W + i] = n ? s / n : 0;
          }
        }
        return;
      }
      /* Girado (la foto derecha de fotoDeLienzo): al revés, punto a punto. */
      const det = T[0] * T[3] - T[1] * T[2];
      const inv = [T[3] / det, -T[1] / det, -T[2] / det, T[0] / det,
                   (T[2] * T[5] - T[3] * T[4]) / det, (T[1] * T[4] - T[0] * T[5]) / det];
      for (let j = 0; j < L.H; j++) for (let i = 0; i < L.W; i++) {
        const u = inv[0] * (i + 0.5) + inv[2] * (j + 0.5) + inv[4], v = inv[1] * (i + 0.5) + inv[3] * (j + 0.5) + inv[5];
        if (u < dx || v < dy || u >= dx + dw || v >= dy + dh) continue;
        const x = Math.min(f.W - 1, Math.floor(sx + (u - dx) * sw / dw)), y = Math.min(f.H - 1, Math.floor(sy + (v - dy) * sh / dh));
        L.px[j * L.W + i] = f.px[y * f.W + x];
      }
    },
    getImageData(x, y, w, h) {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) {
        const yy = y + j;
        for (let i = 0; i < w; i++) {
          const xx = x + i, k = (j * w + i) * 4;
          const v = (xx >= 0 && yy >= 0 && xx < L.W && yy < L.H) ? L.px[yy * L.W + xx] : 0;
          d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
        }
      }
      return { data: d, width: w, height: h };
    }
  };
  return c;
}

/* ==========================================================================
 * LAS CÉDULAS FABRICADAS, PUESTAS EN EL MARCO
 * Los recortes de pruebas/fabricar-cedula-ocr.py (y los que fabrica una
 * prueba con la misma geometría) traen la tarjeta dentro de su marco (GUIA:
 * 60, 38, 1000 × 631 en 1120 × 708) con el aire de margenDeLectura. Se ponen
 * en el cuadro de video de modo que ESE marco caiga sobre el marco del
 * escáner: es lo que hace la persona.
 * ======================================================================== */
const GUIA = { x: 60, y: 38, w: 1000, h: 631 };
const TARJETA = { x: 68, y: 44, w: 985, h: 622 };   // dónde cae la tarjeta en el recorte fabricado
const VIDEO = { W: 2160, H: 3840, MESA: 70 };         // 4K vertical: lo que pide el escáner

/* Escala bilineal del recorte fabricado al tamaño que tiene en el video. */
function escalar(img, k) {
  const W = Math.round(img.w * k), H = Math.round(img.h * k), o = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(img.h - 1, Math.max(0, (y + 0.5) / k - 0.5)), y0 = Math.floor(fy), y1 = Math.min(img.h - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(img.w - 1, Math.max(0, (x + 0.5) / k - 0.5)), x0 = Math.floor(fx), x1 = Math.min(img.w - 1, x0 + 1), ax = fx - x0;
      const g = img.gris;
      o[y * W + x] = (g[y0 * img.w + x0] * (1 - ax) + g[y0 * img.w + x1] * ax) * (1 - ay) + (g[y1 * img.w + x0] * (1 - ax) + g[y1 * img.w + x1] * ax) * ay;
    }
  }
  return { gris: o, w: W, h: H };
}
/* El cuadro de video con una tarjeta YA a la escala del video (`img`, con el
   marco fabricado en gx, gy) puesta de modo que su marco caiga en `guia`. */
function enElVideo(guia, img, gx, gy) {
  const px = new Uint8ClampedArray(VIDEO.W * VIDEO.H).fill(VIDEO.MESA);
  const ox = guia.x - gx, oy = guia.y - gy;
  for (let yy = 0; yy < img.h; yy++) {
    const Y = oy + yy; if (Y < 0 || Y >= VIDEO.H) continue;
    for (let xx = 0; xx < img.w; xx++) {
      const X = ox + xx; if (X < 0 || X >= VIDEO.W) continue;
      px[Y * VIDEO.W + X] = img.gris[yy * img.w + xx];
    }
  }
  return px;
}
/* Una tarjeta fabricada (1120 × 708, la geometría de GUIA) en el cuadro. */
function ponerCarta(guia, carta) {
  const k = guia.w / GUIA.w;
  return enElVideo(guia, escalar(carta, k), Math.round(GUIA.x * k), Math.round(GUIA.y * k));
}

/* ==========================================================================
 * LA PÁGINA, CON CÁMARA Y RELOJ
 * `o.motor`: el Tesseract.js de verdad (pruebas/banco-ocr.js) para leer las
 * letras; sin él, las letras se recortan y nadie las lee (basta para probar
 * QUÉ se recorta). `o.almacen` / `o.sesion`: los del teléfono y la pestaña,
 * para relanzar la página con lo que quedó guardado (eso es una recarga).
 * `o.t`: la hora de arranque. Devuelve { P, video, reloj, correr, recortes }:
 * `recortes` anota cada recorte de franjas que pidieron las letras (lado,
 * huella del lienzo, tamaño, giro y marco).
 * ======================================================================== */
function abrirConCamara(o) {
  o = o || {};
  const reloj = { t: o.t || Date.parse('2026-10-21T18:00:00-05:00') };
  class Reloj extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj.t); }
    static now() { return reloj.t; }
  }
  const P = abrirPlay({ hash: '#registro', Date: Reloj, almacen: o.almacen, sesion: o.sesion });
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  const w = P.ventana;
  /* El reloj de la página: los temporizadores esperan su hora en una cola, y
     la prueba la hace pasar (correr). */
  const cola = [];
  let id = 0;
  w.setTimeout = (fn, ms) => { cola.push({ id: ++id, t: reloj.t + (Number(ms) || 0), fn }); return id; };
  w.clearTimeout = n => { const i = cola.findIndex(c => c.id === n); if (i >= 0) cola.splice(i, 1); };
  /* La cámara: un video 4K vertical, con lo que la prueba le ponga delante. */
  const pista = { stop() {}, getSettings: () => ({ width: VIDEO.W, height: VIDEO.H }),
                  getCapabilities: () => ({}), applyConstraints: () => Promise.resolve() };
  w.navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getVideoTracks: () => [pista], getTracks: () => [pista] }) };
  P.ev("$('docVideo')");
  const video = P.elems.docVideo;
  video.videoWidth = VIDEO.W; video.videoHeight = VIDEO.H;
  video.__px = new Uint8ClampedArray(VIDEO.W * VIDEO.H).fill(VIDEO.MESA);
  /* Los lienzos, en grises; y la carga de scripts sin red: ZXing y las letras
     ya están puestos, como si hubieran bajado. */
  w.__crearLienzo = crearLienzo;
  P.ev("var __ce = document.createElement; document.createElement = function (t) { return t === 'canvas' ? window.__crearLienzo() : __ce.call(document, t); };");
  P.ev(ZXING);
  P.ev("ZXing.ZXingStringEncoding.customDecoder = function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };");
  P.ev('window.__scripts = []; cargarScript = function (u) { window.__scripts.push(u); return Promise.resolve(); };');
  /* Las letras de verdad, y un testigo de lo que se les da a recortar: el
     lienzo (su huella), el giro y el marco. */
  const recortes = [];
  w.OcrCedula = Object.assign({}, O, {
    recortarDeLienzo(lado, lienzo, op) {
      recortes.push({ lado, huella: lienzo.__lienzo ? huella(lienzo.__lienzo.px) : null,
                      W: lienzo.width, H: lienzo.height, giro: op && op.giro, guia: op && op.guia ? Object.assign({}, op.guia) : null });
      return O.recortarDeLienzo(lado, lienzo, op);
    }
  });
  if (o.motor) w.Tesseract = o.motor.Tesseract;
  const correr = async ms => {
    const fin = reloj.t + ms;
    for (;;) {
      cola.sort((a, b) => a.t - b.t || a.id - b.id);
      const c = cola[0];
      if (!c || c.t > fin) break;
      cola.shift();
      reloj.t = Math.max(reloj.t, c.t);
      c.fn();
      await asentar(2);
    }
    reloj.t = fin;
  };
  return { P, video, reloj, correr, recortes };
}

module.exports = { ZXING, FOTOS_HECHAS, huella, crearLienzo, GUIA, TARJETA, VIDEO, escalar, enElVideo, ponerCarta, abrirConCamara };
