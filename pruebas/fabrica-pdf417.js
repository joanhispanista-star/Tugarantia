/* ===========================================================================
 * FÁBRICA DE PDF417 — para probar el lector de la cédula sin cédula ni cámara
 *
 * El ZXing vendorizado (app/lib/zxing.min.js) NO trae escritor de PDF417 —solo
 * de QR, Aztec y DataMatrix— pero sí trae las dos tablas del decodificador
 * (SYMBOL_TABLE y CODEWORD_TABLE). Con ellas y la aritmética del estándar
 * (compactación de bytes en base 900, Reed-Solomon sobre GF(929) con raíces
 * 3^1..3^n) se arma un código válido. La prueba de que está bien armado es que
 * el propio ZXing lo lee entero a escala grande.
 *
 * Además renderiza el código a luminancias «como las vería la cámara»: tantos
 * píxeles por módulo, desenfoque gaussiano (el enfoque del celular), ruido y
 * zona quieta. Con eso se mide a qué tamaño y con cuánto desenfoque el lector
 * deja de leer, que es lo que decide cómo tiene que ser el marco del escáner.
 *
 * Nació el 21-sep-2026 en la investigación del escáner; medido con ella: lee
 * desde ~2 px/módulo nítido, 2,5 con desenfoque de celular, 3 con margen.
 * ========================================================================= */
const fs = require('node:fs');
const path = require('node:path');
const RUTA_ZXING = path.join(__dirname, '..', 'app', 'lib', 'zxing.min.js');
const Z = require(RUTA_ZXING);
const fuenteZXing = fs.readFileSync(RUTA_ZXING, 'latin1');

/* Las tablas se leen del propio bundle, no se copian: si algún día se
   actualiza ZXing, la fábrica sigue armando códigos que ESE lector entiende. */
function tabla(nombre) {
  const i = fuenteZXing.indexOf(nombre + '=Int32Array.from([');
  if (i < 0) throw new Error('no está ' + nombre + ' en zxing.min.js');
  const a = fuenteZXing.indexOf('[', i), b = fuenteZXing.indexOf(']', a);
  return fuenteZXing.slice(a + 1, b).split(',').map(Number);
}
const SYMBOL = tabla('SYMBOL_TABLE'), CODEWORD = tabla('CODEWORD_TABLE');
if (SYMBOL.length !== 2787 || CODEWORD.length !== 2787) {
  throw new Error('las tablas del PDF417 no tienen 2787 símbolos: ' + SYMBOL.length + ' / ' + CODEWORD.length);
}
/* cluster (0,1,2) ← CODEWORD_TABLE: patrón de barras por cluster y codeword */
const PATRON = [new Array(929).fill(0), new Array(929).fill(0), new Array(929).fill(0)];
for (let i = 0; i < 2787; i++) {
  const v = CODEWORD[i] - 1, cl = Math.floor(v / 929), cw = v % 929;
  PATRON[cl][cw] = SYMBOL[i];
}

/* --- GF(929) --- */
const P = 929;
function polMul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = (r[i + j] + a[i] * b[j]) % P;
  return r;
}
/* g(x) = producto de (x − 3^i), i = 1..n; grado mayor primero */
function generador(n) {
  let g = [1], pot = 1;
  for (let i = 1; i <= n; i++) { pot = (pot * 3) % P; g = polMul(g, [1, (P - pot) % P]); }
  return g;
}
function ecPDF417(datos, nivel) {
  const n = 1 << (nivel + 1), g = generador(n);
  const t = datos.slice().concat(new Array(n).fill(0));
  for (let i = 0; i < datos.length; i++) {
    const c = t[i]; if (!c) continue;
    for (let j = 0; j < g.length; j++) t[i + j] = (t[i + j] + P - (c * g[j]) % P) % P;
  }
  return t.slice(datos.length).map(v => (P - v) % P);
}
function compactarBytes(bytes) {
  const out = [bytes.length % 6 === 0 ? 924 : 901];
  let i = 0;
  while (i + 6 <= bytes.length) {
    let t = 0n;
    for (let k = 0; k < 6; k++) t = t * 256n + BigInt(bytes[i + k]);
    const cws = [];
    for (let k = 0; k < 5; k++) { cws.unshift(Number(t % 900n)); t /= 900n; }
    out.push(...cws); i += 6;
  }
  while (i < bytes.length) out.push(bytes[i++]);
  return out;
}

/** Arma el código: devuelve las filas de módulos (cadenas de 0/1). */
function fabricar(bytes, columnas, nivel) {
  columnas = columnas || 15; nivel = nivel === undefined ? 5 : nivel;
  const datos = compactarBytes(bytes);
  const n = 1 << (nivel + 1);
  let filas = Math.ceil((datos.length + 1 + n) / columnas);
  if (filas < 3) filas = 3;
  const total = filas * columnas;
  const cuerpo = [total - n].concat(datos);
  while (cuerpo.length < total - n) cuerpo.push(900);
  const todos = cuerpo.concat(ecPDF417(cuerpo, nivel));
  const START = '11111111010101000', STOP = '111111101000101001';
  const filasBits = [];
  for (let r = 0; r < filas; r++) {
    const k = r % 3, base = Math.floor(r / 3) * 30;
    const izq = k === 0 ? base + Math.floor((filas - 1) / 3) : k === 1 ? base + nivel * 3 + (filas - 1) % 3 : base + (columnas - 1);
    const der = k === 0 ? base + (columnas - 1) : k === 1 ? base + Math.floor((filas - 1) / 3) : base + nivel * 3 + (filas - 1) % 3;
    let s = START + PATRON[k][izq].toString(2).padStart(17, '0');
    for (let c = 0; c < columnas; c++) s += PATRON[k][todos[r * columnas + c]].toString(2).padStart(17, '0');
    s += PATRON[k][der].toString(2).padStart(17, '0') + STOP;
    filasBits.push(s);
  }
  return { filasBits, filas, columnas, anchoModulos: filasBits[0].length };
}

/* --- render a luminancias: s px por módulo, alto de fila en módulos, zona
   quieta, muestreo exacto por área, desenfoque gaussiano (sigma en px) y ruido --- */
function gauss1d(sigma) {
  if (!sigma) return [1];
  const r = Math.ceil(sigma * 3), k = []; let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); s += v; }
  return k.map(v => v / s);
}
/**
 * @returns {lum: Uint8ClampedArray, W, H}  luminancias 0..255 (blanco 235,
 *          negro 40: una tarjeta con luz normal)
 */
function render(cod, s, sigma, ruido, opciones) {
  const o = opciones || {};
  const altoFila = o.altoFila || 3, quieta = o.quieta === undefined ? 12 : o.quieta;
  let seed = o.seed || 1;
  const Wm = cod.anchoModulos + 2 * quieta, Hm = cod.filas * altoFila + 2 * quieta;
  const W = Math.ceil(Wm * s), H = Math.ceil(Hm * s);
  const filaPx = cod.filasBits.map(bits => {
    const out = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const m0 = x / s - quieta, m1 = (x + 1) / s - quieta; let negro = 0;
      const a = Math.max(0, Math.floor(m0)), b = Math.min(bits.length - 1, Math.ceil(m1) - 1);
      for (let m = a; m <= b; m++) if (bits[m] === '1') negro += Math.max(0, Math.min(m1, m + 1) - Math.max(m0, m));
      out[x] = negro * s;
    }
    return out;
  });
  const img = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const my0 = y / s - quieta, my1 = (y + 1) / s - quieta;
    for (let r = 0; r < cod.filas; r++) {
      const r0 = r * altoFila, r1 = r0 + altoFila;
      const sol = Math.max(0, Math.min(my1, r1) - Math.max(my0, r0));
      if (sol <= 0) continue;
      const f = filaPx[r], peso = sol * s;
      for (let x = 0; x < W; x++) img[y * W + x] += f[x] * peso;
    }
  }
  let cur = img;
  if (sigma > 0) {
    const k = gauss1d(sigma), r = (k.length - 1) / 2;
    const t1 = new Float32Array(W * H), t2 = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); v += cur[y * W + xx] * k[i + r]; }
      t1[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); v += t1[yy * W + x] * k[i + r]; }
      t2[y * W + x] = v;
    }
    cur = t2;
  }
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const lum = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 235 - cur[i] * 195 + (rnd() - 0.5) * 2 * (ruido || 0);
  return { lum, W, H };
}

/** Gira unas luminancias 90° (a la derecha): lo que hace un teléfono vertical. */
function girar90(lum, W, H) {
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[x * H + (H - 1 - y)] = lum[y * W + x];
  return { lum: out, W: H, H: W };
}

/**
 * El registro de 531 bytes con la forma de la cédula colombiana: número en
 * 48..58, apellidos en 58 y 81, nombres en 104 y 127, sexo en 150, fecha,
 * municipio y RH. Después viene la huella dactilar: binario de verdad.
 */
function registroCedula(datos) {
  const d = Object.assign({
    documento: '0001234567', apellido1: 'PEREZ', apellido2: 'GOMEZ',
    nombre1: 'JUAN', nombre2: 'CARLOS', sexo: 'M', nacimiento: '19900515', municipio: '11001', rh: 'O+'
  }, datos || {});
  const b = new Uint8Array(531).fill(0);
  const pon = (pos, txt) => { for (let i = 0; i < txt.length; i++) b[pos + i] = txt.charCodeAt(i); };
  pon(0, 'I03'); pon(48, d.documento); pon(58, d.apellido1); pon(81, d.apellido2);
  pon(104, d.nombre1); pon(127, d.nombre2);
  pon(150, d.sexo + d.nacimiento); pon(159, d.municipio); pon(164, d.rh);
  for (let i = 170; i < 531; i++) b[i] = (i * 37) % 256;
  return b;
}

/* En Node no hay TextDecoder «de navegador» para ZXing: su respaldo pasa por
   decodeURIComponent y revienta con la cola binaria de la huella. En el
   teléfono no pasa (usa TextDecoder). Las pruebas activan este gancho. */
function latin1EnNode(activar) {
  Z.ZXingStringEncoding.customDecoder = activar
    ? function (bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
    : undefined;
}

module.exports = { Z, fabricar, render, girar90, registroCedula, latin1EnNode, compactarBytes };
