/* ===========================================================================
 * EL BANCO DEL OCR — el Tesseract.js COPIADO, corriendo en Node como en el
 * teléfono. 21 de octubre de 2026.
 *
 * No usa el Tesseract.js «para Node» (que pide sus paquetes de npm): carga los
 * MISMOS archivos que baja el teléfono —app/lib/ocr/tesseract.min.js en la
 * página, worker.min.js en un hilo aparte, el núcleo WebAssembly y el español—
 * con un Worker de mentira hecho con worker_threads. Así la prueba dice algo
 * del archivo que se publica, no de otro parecido.
 *
 * Y ANOTA TODO LO QUE SE PIDE. El worker y la página no tienen red: cada
 * archivo que piden pasa por `servir`, que solo entrega lo que está en
 * app/lib/ocr/ y anota la dirección. Un pedido a otro lado (el CDN que
 * Tesseract.js usa si no se le dan las rutas) falla y queda en `pedidos`:
 * pruebas/ocr-cedula.test.js se cae con él.
 *
 * Lo usan pruebas/ocr-cedula.test.js y herramientas/calibrar-ocr.js (para
 * medir las franjas con una foto de una cédula de verdad).
 * ========================================================================= */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { Worker } = require('node:worker_threads');

const RAIZ = path.join(__dirname, '..');
const OCR = path.join(RAIZ, 'app', 'lib', 'ocr');
const ORIGEN = 'https://tugarantia.net';
const PAGINA = ORIGEN + '/play/';

/* Lo que corre DENTRO del hilo: un WorkerGlobalScope mínimo. importScripts y
   fetch solo sirven app/lib/ocr/, y cada pedido se le cuenta al hilo
   principal antes de servirlo (o de negarlo). */
const ARRANQUE = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm'); const fs = require('node:fs'); const path = require('node:path');
const PRE = workerData.origen + '/app/lib/ocr/';
function servir(u) {
  const s = String(u);
  parentPort.postMessage({ __pedido: s });
  if (!s.startsWith(PRE)) throw new Error('pedido fuera del sitio: ' + s);
  const f = path.join(workerData.ocr, s.slice(PRE.length));
  if (path.relative(workerData.ocr, f).startsWith('..')) throw new Error('ruta rara: ' + s);
  return f;
}
globalThis.self = globalThis;
globalThis.WorkerGlobalScope = function () {};
globalThis.location = { href: workerData.url };
globalThis.importScripts = (...urls) => urls.forEach(u => vm.runInThisContext(fs.readFileSync(servir(u), 'utf8'), { filename: String(u) }));
globalThis.postMessage = d => parentPort.postMessage(d);
const oyentes = [];
globalThis.addEventListener = (t, f) => { if (t === 'message') oyentes.push(f); };
parentPort.on('message', d => { oyentes.forEach(f => f({ data: d })); if (typeof globalThis.onmessage === 'function') globalThis.onmessage({ data: d }); });
globalThis.fetch = async u => {
  const b = fs.readFileSync(servir(u));
  return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
importScripts(workerData.url);
`;

/**
 * Abre la «página» con tesseract.min.js cargado.
 * @returns {Tesseract, pedidos: [direcciones pedidas], ventana}
 */
function abrirTesseract() {
  const pedidos = [];
  const hilos = new Set();
  class WorkerDeMentira {
    constructor(url) {
      const u = String(url);
      pedidos.push(u);
      this.onmessage = null;
      this.w = new Worker(ARRANQUE, { eval: true, workerData: { url: u, origen: ORIGEN, ocr: OCR } });
      hilos.add(this.w);
      this.w.on('message', d => {
        if (d && d.__pedido) { pedidos.push(d.__pedido); return; }
        if (this.onmessage) this.onmessage({ data: d });
      });
      this.w.on('error', () => {});
      this.w.on('exit', () => hilos.delete(this.w));
    }
    postMessage(d) { this.w.postMessage(d); }
    terminate() { hilos.delete(this.w); this.w.terminate(); }
  }
  const ventana = {
    console, setTimeout, clearTimeout, Promise, Uint8Array, ArrayBuffer, Error, JSON, Math, Object, Array,
    document: {}, location: { href: PAGINA },
    Worker: WorkerDeMentira, Blob: class {}, File: class {},
    URL: class extends URL { static createObjectURL() { throw new Error('sin blob en el banco'); } },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    fetch: async u => { pedidos.push(String(u)); throw new Error('la página no baja nada en el banco'); }
  };
  ventana.window = ventana; ventana.self = ventana;
  vm.createContext(ventana);
  vm.runInContext(fs.readFileSync(path.join(OCR, 'tesseract.min.js'), 'utf8'), ventana, { filename: 'tesseract.min.js' });
  /* Un hilo que se queda vivo (una prueba que falló a mitad) no deja que
     Node termine: cerrar los mata a todos. */
  const cerrar = () => Promise.all([...hilos].map(h => h.terminate().catch(() => {})));
  return { Tesseract: ventana.Tesseract, pedidos, ventana, cerrar, ORIGEN, PAGINA };
}

/** Un PGM binario (P5), suelto o en .gz → {gris, w, h}. */
function leerPGM(ruta) {
  let b = fs.readFileSync(ruta);
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  const cab = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(b.slice(0, 40).toString('latin1'));
  if (!cab) throw new Error('no es un PGM binario: ' + ruta);
  const w = +cab[1], h = +cab[2];
  const gris = new Uint8ClampedArray(b.buffer, b.byteOffset + cab[0].length, w * h).slice();
  return { gris, w, h };
}

module.exports = { abrirTesseract, leerPGM, RAIZ, OCR };
