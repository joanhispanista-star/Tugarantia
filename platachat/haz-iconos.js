/* ============================================================================
   LOS ICONOS DE PLATACHAT · PNG de verdad, dibujados desde código

   Uso, desde la raíz del repositorio:   node platachat/haz-iconos.js
   Escribe en platachat/: icono-192.png, icono-512.png, icono-maskable-512.png
   e icono-180.png (el de iPhone, apple-touch-icon).

   ── ES UN ICONO PROVISIONAL, Y LO DICE ──────────────────────────────────────
   El lienzo de diseño pinta la moneda con un «$» en Georgia. Ese signo no se
   puede rasterizar acá: Node no trae fuentes, y un «$» dibujado a mano con
   curvas sale torcido —peor que ninguno—. Así que este icono es GEOMETRÍA
   PURA: una moneda de plata con degradado radial, su canto, un aro claro por
   dentro y la burbuja verde de chat abajo a la derecha con tres puntos (la
   señal universal de «te están escribiendo»). Sale igual en todos los
   teléfonos y se reconoce a 48 píxeles. El día que Joan quiera el «$» o una
   ilustración de verdad, se dibuja en un editor, se exporta a estos cuatro
   tamaños con los mismos nombres y ESTE archivo se borra o se deja de correr:
   lo que no se puede es tener las dos fuentes de verdad al tiempo.

   ── POR QUÉ SE FABRICA Y NO SE COPIA ────────────────────────────────────────
   La lección de Academia (pruebas/haz-iconos.js, de donde viene el codificador):
   un PNG que el repositorio sabe fabricar se revisa leyendo las líneas que lo
   dibujan, es determinista y se regenera con un comando. Un PNG que alguien
   soltó no se sabe de dónde salió ni cómo cambiarlo. Y el TWA (Bubblewrap)
   necesita iconos descargables por URL: un `data:` en el manifiesto no le
   sirve.

   ── LOS COLORES SON LOS DE platachat/estilo.css ─────────────────────────────
   --laca, --marca, --marca-oscuro y las cuatro paradas de la moneda
   (--moneda-1 … --moneda-4) y su canto. Si cambian allá, cambian acá: son el
   mismo icono en la pantalla de inicio y en la cabecera de la app.

   Sin dependencias: el codificador PNG son 30 líneas sobre el zlib de Node.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = __dirname;                            /* platachat/: los PNG viven junto al manifiesto */

/* ───────────────────────────────────────────────── el codificador PNG ──── */

const TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function trozo(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const t = Buffer.from(tipo, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([len, t, datos, crc]);
}
/* RGBA (tipo de color 6, «32 bits»), que es lo que piden el webmanifest y
   Bubblewrap. Acá el alfa es siempre 255: el fondo es la laca, no
   transparente, para que el icono se vea igual sobre cualquier fondo de
   pantalla y para que la maskable tenga con qué llenar la máscara. */
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const cruda = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    cruda[y * (w * 4 + 1)] = 0;                    /* filtro «ninguno» por fila */
    rgba.copy(cruda, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(cruda, { level: 9 })), trozo('IEND', Buffer.alloc(0)),
  ]);
}

/* ─────────────────────────────────────────────────────── los colores ───── */

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const LACA = hex('#0C0A0B');
const MARCA = hex('#07C160'), MARCA_OSCURO = hex('#06AD56');
const LUZ = hex('#FFFFFF');
/* las cuatro paradas del radial de la moneda, como --moneda-1 … --moneda-4,
   y la parada honda del contrato (#6F7682) como el final del canto */
const PARADAS = [[0, hex('#FFFFFF')], [0.42, hex('#DCE0E6')], [0.8, hex('#9AA1AC')], [1, hex('#6F7682')]];
const CANTO = hex('#5C6370');

const mezcla = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function radial(t) {
  for (let i = 1; i < PARADAS.length; i++) {
    if (t <= PARADAS[i][0]) {
      const [t0, c0] = PARADAS[i - 1], [t1, c1] = PARADAS[i];
      return mezcla(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return PARADAS[PARADAS.length - 1][1];
}

/* ───────────────────────────────────────────────────────── el dibujo ───── */

/* Todo en coordenadas de 0 a 1 sobre el cuadro, escaladas alrededor del
   centro. La composición cabe en un círculo de radio 0,47 desde el centro:
   con escala 0,8 (la maskable) queda en 0,376, dentro del círculo seguro de
   radio 0,4 que Android garantiza que no recorta, con aire de sobra. */
function figura(escala) {
  const e = (v) => 0.5 + (v - 0.5) * escala;
  return {
    /* la moneda, un pelo arriba y a la izquierda del centro: la burbuja pesa
       abajo a la derecha y así el conjunto queda centrado a ojo */
    cx: e(0.485), cy: e(0.485), R: 0.36 * escala,
    /* el foco del degradado, arriba a la izquierda, como cx=.35 cy=.28 del SVG */
    fx: e(0.485 - 0.36 * 0.30), fy: e(0.485 - 0.36 * 0.44), fr: 0.36 * 2 * 0.78 * escala,
    canto: 0.013 * escala,                        /* el filo gris oscuro del borde */
    aroR: 0.36 * 0.68 * escala, aroW: 0.016 * escala, /* el aro claro por dentro */
    /* la burbuja verde, montada sobre el canto inferior derecho */
    bx: e(0.735), by: e(0.735), br: 0.15 * escala,
    borde: 0.026 * escala,                        /* el anillo de laca que la separa de la moneda */
    /* la cola: un triángulo hacia abajo a la izquierda, pegado a la burbuja, y
       su versión crecida (misma forma, escalada desde el centro de la
       burbuja) que pinta el anillo de laca alrededor */
    cola: cola(e, 1),
    colaBorde: cola(e, 1.22),
    /* los tres puntos de «te están escribiendo» */
    puntos: [[e(0.68), e(0.735)], [e(0.735), e(0.735)], [e(0.79), e(0.735)]],
    puntoR: 0.02 * escala,
  };
}

/* La cola de la burbuja en coordenadas de 0 a 1, escalada alrededor del
   centro de la burbuja (0,735, 0,735) por `k` para poder dibujar el borde. */
function cola(e, k) {
  const c = 0.735;
  return [[0.66, 0.83], [0.60, 0.93], [0.735, 0.87]]
    .map(([x, y]) => [e(c + (x - c) * k), e(c + (y - c) * k)]);
}

const dentro = (px, py, pol) => {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
};

function colorEn(u, v, f) {
  let c = LACA;
  const dm = Math.hypot(u - f.cx, v - f.cy);
  if (dm <= f.R) {
    /* la cara: degradado radial desde el foco, aproximado por paradas */
    const t = Math.min(1, Math.hypot(u - f.fx, v - f.fy) / f.fr);
    c = radial(t);
    /* el aro claro interior: luz al 55 % sobre la cara, como en el SVG */
    if (Math.abs(dm - f.aroR) <= f.aroW / 2) c = mezcla(c, LUZ, 0.55);
    /* el canto, gris oscuro, en el filo */
    if (dm >= f.R - f.canto) c = CANTO;
  }
  /* la burbuja, encima de todo: primero el anillo de laca (círculo crecido y
     cola crecida), después el cuerpo verde (círculo y cola), después los
     puntos. El anillo es lo que la separa de la moneda a 48 píxeles. */
  const db = Math.hypot(u - f.bx, v - f.by);
  if (db <= f.br + f.borde || dentro(u, v, f.colaBorde)) c = LACA;
  if (db <= f.br || dentro(u, v, f.cola)) {
    /* verde más claro arriba, más hondo abajo: es una pieza, no un disco plano */
    const t = Math.max(0, Math.min(1, (v - (f.by - f.br)) / (2 * f.br)));
    c = mezcla(MARCA, MARCA_OSCURO, t);
    for (const [px, py] of f.puntos) if (Math.hypot(u - px, v - py) <= f.puntoR) c = LUZ;
  }
  return c;
}

function dibuja(lado, escala) {
  const SS = 4, W = lado * SS;                     /* se pinta a 4× y se reduce: bordes sin dientes */
  const f = figura(escala);
  const buf = Buffer.alloc(W * W * 3);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const c = colorEn((x + 0.5) / W, (y + 0.5) / W, f);
      const i = (y * W + x) * 3;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
  /* reducir promediando los SS×SS de cada píxel */
  const out = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const i = ((y * SS + dy) * W + (x * SS + dx)) * 3;
      r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
    }
    const n = SS * SS, i = (y * lado + x) * 4;
    out[i] = Math.round(r / n); out[i + 1] = Math.round(g / n); out[i + 2] = Math.round(b / n); out[i + 3] = 255;
  }
  return png(lado, lado, out);
}

/* ─────────────────────────────────────────────────────────── salida ────── */

const HECHOS = [
  /* 'any': la moneda llena el cuadro. */
  ['icono-192.png', () => dibuja(192, 1)],
  ['icono-512.png', () => dibuja(512, 1)],
  /* 'maskable': Android le recorta las esquinas (círculo, cuadrado redondeado,
     gota…), así que el dibujo se encoge al 80 % —el margen de seguridad de la
     especificación— y el fondo de laca llena lo que la máscara deje ver. Un
     maskable sin ese margen sale con la burbuja decapitada en medio teléfono
     del mercado. */
  ['icono-maskable-512.png', () => dibuja(512, 0.8)],
  /* iPhone no lee el manifiesto para el icono: quiere su apple-touch-icon de
     180. Safari le redondea las esquinas él solo. */
  ['icono-180.png', () => dibuja(180, 1)],
];

if (require.main === module) {
  for (const [nombre, hacer] of HECHOS) {
    const b = hacer();
    fs.writeFileSync(path.join(DIR, nombre), b);
    console.log('  ' + nombre.padEnd(28) + (b.length / 1024).toFixed(1).padStart(7) + ' KB');
  }
  console.log('\n' + HECHOS.length + ' iconos en platachat/ · se regeneran con  node platachat/haz-iconos.js');
}

module.exports = { dibuja, png, figura, HECHOS };
