/* ============================================================================
 * LA PIEZA DE LAS FOTOS — app/revision-fotos.js, y los dos botones del CRM
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/revision-fotos.test.js
 *
 * El rostro y el código de barras vivían dentro de crm.html. Desde hoy viven en
 * app/revision-fotos.js y los usan los dos botones de la ficha y la revisión
 * automática (panel/revision.html). Lo que se cuida:
 *
 *   1. UNA SOLA COPIA. El CRM ya no lleva sus propios giros, ni sus opciones
 *      del detector, ni su cuenta del parecido: llama a la pieza. Y el corte
 *      del rostro sale del motor (UMBRALES.ROSTRO_DISTANCIA), no de un 0.6
 *      escrito a mano.
 *   2. LOS BOTONES DICEN LO MISMO QUE ANTES, con el mismo escape.
 *   3. UN SCRIPT QUE NO LLEGA SE DICE: si el service worker entrega index.html
 *      en vez del .js, el navegador dispara `load` igual; eso no es «cargó».
 *   4. NADA DE RED salvo bajar las librerías del propio sitio, y ninguna
 *      «foto» que no pase la reja se abre.
 *
 * En Node no hay lienzo ni face-api: la pieza se corre dentro de un contexto
 * con un documento, un lienzo y un face-api de mentira que anotan qué se les
 * pidió. El motor de reglas sí es el de verdad.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RR = require('../app/revision-registro.js');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const FUENTE = fs.readFileSync(path.join(RAIZ, 'app', 'revision-fotos.js'), 'utf8');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
/* Lo que vuelve del contexto trae el Object y el Array de OTRO reino, y
   deepStrictEqual los da por distintos aunque digan lo mismo. */
const j = x => JSON.parse(JSON.stringify(x));
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/mg, ' ');

/* --------------------------------------------------------------------------
 * Un navegador de mentira para la pieza.
 *   cargas: {sufijo de url: 'ok' | 'error' | 'sin_global'}
 * ------------------------------------------------------------------------ */
function navegador(opc) {
  const o = opc || {};
  const anotado = { scripts: [], modelos: [], opciones: [], lecturas: [], imagenes: [] };
  const globales = {
    'face-api.js': () => ({ faceapi: o.faceapi || caraDeMentira(anotado, o) }),
    'zxing.min.js': () => ({ ZXing: { soy: 'zxing' } }),
    'escaner-cedula.js': () => ({ EscanerCedula: escanerDeMentira(anotado, o) }),
    'cuenta.js': () => ({ CuentaSocio: { leerCedulaPDF417: t => (t === 'PDF417-BUENO' ? { documento: '1032456789', nombres: 'ROSA' } : null) } })
  };
  const ctx = {
    console, URL, Math, JSON, Promise, Uint8Array, Uint8ClampedArray, Float32Array,
    document: {
      currentScript: null,
      createElement(tipo) {
        if (tipo === 'canvas') return lienzo(anotado, o);
        return { tipo };
      },
      head: {
        appendChild(s) {
          anotado.scripts.push(s.src);
          const k = Object.keys(globales).find(x => String(s.src).endsWith(x));
          const modo = (o.cargas && k && o.cargas[k]) || 'ok';
          setImmediate(() => {
            if (modo === 'error') return s.onerror && s.onerror();
            if (modo === 'ok' && k) Object.assign(ctx, globales[k]());
            s.onload && s.onload();
          });
        }
      }
    },
    Image: function () { anotado.imagenes.push(this); const yo = this;
      Object.defineProperty(this, 'src', { set(v) { yo._src = v; setImmediate(() => yo.onload && yo.onload()); }, get() { return yo._src; } }); }
  };
  if (o.conMotor !== false) ctx.RevisionRegistro = RR;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx, { filename: 'revision-fotos.js' });
  return { RF: ctx.RevisionFotos, ctx, anotado };
}

/* face-api de mentira: cada «imagen» trae su descriptor (o null si no hay cara). */
function caraDeMentira(anotado, o) {
  const red = n => ({ isLoaded: false, loadFromUri(u) { anotado.modelos.push(n + '@' + u); this.isLoaded = true; return Promise.resolve(); } });
  return {
    nets: { tinyFaceDetector: red('tiny'), faceLandmark68TinyNet: red('marcas'), faceRecognitionNet: red('rostro') },
    TinyFaceDetectorOptions: function (op) { anotado.opciones.push(op); this.op = op; },
    detectSingleFace(img) {
      return { withFaceLandmarks() { return { withFaceDescriptor() { return Promise.resolve(img.desc ? { descriptor: img.desc } : null); } }; } };
    },
    euclideanDistance(a, b) { return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) * (x - b[i]), 0)); }
  };
}

/* El escáner de mentira: decodifica solo cuando el lienzo está «acostado»
   (más alto que ancho, o sea después del giro de 90°), como la cédula de pie. */
function escanerDeMentira(anotado, o) {
  return {
    grisDeImageData: (d, w, h) => ({ w, h }),
    decodificarLuminancias(Z, g, w, h) {
      anotado.lecturas.push(w + 'x' + h);
      if (o.nuncaLee) return { texto: '' };
      return h > w ? { texto: 'PDF417-BUENO' } : { texto: '' };
    },
    cedulaDelTexto: (leer, t) => leer(t)
  };
}

/* Un lienzo que devuelve un damero: así la nitidez medida no es cero. */
function lienzo() {
  const c = { width: 0, height: 0 };
  c.getContext = () => ({
    drawImage() {}, translate() {}, rotate() {},
    getImageData(x, y, w, h) {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const v = ((xx >> 2) + (yy >> 2)) % 2 ? 230 : 30, i = (yy * w + xx) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      return { data: d };
    }
  });
  return c;
}

const img = (w, h, desc) => ({ naturalWidth: w, naturalHeight: h, desc });

describe('el rostro: la pieza da la distancia y el corte sale del motor', () => {

  test('distancia, parecido, y «debajo» con el corte del motor', async () => {
    const { RF, anotado } = navegador();
    const r = await RF.compararRostros(img(480, 640, [0, 0, 0]), img(900, 568, [0.3, 0.4, 0]),
      { face: '../app/lib/rostro/face-api.js', modelos: '../app/lib/rostro' });
    assert.ok(Math.abs(r.distancia - 0.5) < 1e-9);
    assert.equal(r.parecido, Math.round((1 - 0.5 / 1.2) * 100));
    assert.equal(r.umbral, RR.UMBRALES.ROSTRO_DISTANCIA);
    assert.equal(r.debajo, true);
    assert.deepEqual(j(anotado.opciones[0]), { inputSize: 416, scoreThreshold: 0.4 },
      'cambiaron las opciones del detector que usaba el CRM desde el 8-sep');
    assert.deepEqual(anotado.modelos.sort(), ['marcas@../app/lib/rostro', 'rostro@../app/lib/rostro', 'tiny@../app/lib/rostro']);
  });

  test('por encima del corte: debajo = false', async () => {
    const { RF } = navegador();
    const r = await RF.compararRostros(img(1, 1, [0, 0]), img(1, 1, [0.7, 0]));
    assert.equal(r.debajo, false);
  });

  test('sin cara: dice en cuál, con las palabras que entiende el motor', async () => {
    const { RF } = navegador();
    assert.deepEqual(j(await RF.compararRostros(img(1, 1, null), img(1, 1, [0]))), { sin_rostro: 'selfie' });
    assert.deepEqual(j(await RF.compararRostros(img(1, 1, [0]), img(1, 1, null))), { sin_rostro: 'cedula' });
    assert.deepEqual(j(await RF.compararRostros(img(1, 1, null), img(1, 1, null))), { sin_rostro: 'ambas' });
    const res = RR.revisarRegistro({ id: 1 }, { rostro: { sin_rostro: 'selfie' } });
    assert.ok(res.para_mirar.some(x => x.clave === 'rostro_sin_cara'), 'el motor no entiende lo que devuelve la pieza');
  });

  test('si face-api no llega, falla diciéndolo, y el siguiente intento vuelve a pedirlo', async () => {
    const n = navegador({ cargas: { 'face-api.js': 'error' } });
    await assert.rejects(n.RF.compararRostros(img(1, 1, [0]), img(1, 1, [0])), /no cargó .*face-api\.js/);
    await assert.rejects(n.RF.cargarRostro(), /no cargó/);
    assert.equal(n.anotado.scripts.filter(s => /face-api/.test(s)).length, 2, 'el fallo quedó guardado: nunca vuelve a intentar');
  });

  test('si en vez del .js llega otra cosa (index.html del service worker), NO es «cargó»', async () => {
    const { RF } = navegador({ cargas: { 'face-api.js': 'sin_global' } });
    await assert.rejects(RF.cargarRostro(), /no cargó/);
  });

  test('dos toques seguidos bajan face-api UNA vez', async () => {
    const { RF, anotado } = navegador();
    await Promise.all([RF.cargarRostro(), RF.cargarRostro()]);
    assert.equal(anotado.scripts.filter(s => /face-api/.test(s)).length, 1);
  });

  test('sin el motor no se inventa el corte: falla y lo dice', async () => {
    const { RF } = navegador({ conMotor: false });
    await assert.rejects(RF.compararRostros(img(1, 1, [0]), img(1, 1, [0])), /falta app\/revision-registro\.js/);
  });
});

describe('el código de barras del reverso', () => {

  test('prueba los giros de la app, en orden, y devuelve la cédula leída', async () => {
    const { RF, anotado } = navegador();
    const ced = await RF.leerCodigoDeImagen(img(900, 568), { zxing: '../app/lib/zxing.min.js', escaner: '../app/escaner-cedula.js' });
    assert.deepEqual(j(ced), { documento: '1032456789', nombres: 'ROSA' });
    assert.deepEqual(anotado.lecturas, ['900x568', '568x900'], 'no probó primero derecho y después a 90°');
    assert.deepEqual(j(RF.GIROS), [0, 90, 180, 270, 2, -2, 4, -4]);
  });

  test('si no lee con ningún giro, devuelve null (que no dice nada de los datos)', async () => {
    const { RF, anotado } = navegador({ nuncaLee: true });
    assert.equal(await RF.leerCodigoDeImagen(img(900, 568)), null);
    assert.equal(anotado.lecturas.length, 8);
  });

  test('una foto sin terminar de cargar no se lee a ciegas', async () => {
    const { RF } = navegador();
    await assert.rejects(RF.leerCodigoDeImagen(img(0, 0)), /no terminó de cargar/);
  });

  test('las librerías salen del propio sitio, nunca de un CDN', () => {
    const vivo = sinComentarios(FUENTE);
    assert.equal(/https?:\/\//.test(vivo), false, 'la pieza nombra una dirección de afuera');
    assert.match(vivo, /lib\/rostro\/face-api\.js/);
    assert.match(vivo, /lib\/zxing\.min\.js/);
  });
});

describe('medir y abrir fotos', () => {

  test('medirImagen pasa la foto entera a la cuenta del motor', () => {
    const { RF } = navegador();
    const m = RF.medirImagen(img(900, 568), 'documento', 1234);
    assert.equal(m.ancho, 900); assert.equal(m.alto, 568); assert.equal(m.bytes, 1234);
    assert.ok(m.nitidez > RR.UMBRALES.NITIDEZ_MIN.documento, 'un damero nítido salió borroso: no se midió lo que había');
    assert.equal(m.medida.ancho, RR.UMBRALES.LADO_MEDIDA, 'no se redujo a la medida del motor');
    const s = RF.medirImagen(img(480, 640), 'cualquier-cosa');
    assert.equal(s.ancho, 480, 'un tipo raro se mide como documento, no revienta');
  });

  test('una «foto» que no pasa la reja no se abre: ni se crea la imagen', async () => {
    const { RF, anotado } = navegador();
    for (const mala of ['data:image/png;base64,AAAA" onerror="alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=',
      'javascript:alert(1)', '', null, { src: 'x' }]) {
      await assert.rejects(RF.imagenDe(mala), /no es una foto/);
      assert.equal(RF.fotoSegura(mala), '');
    }
    assert.equal(anotado.imagenes.length, 0);
    const buena = 'data:image/jpeg;base64,QUJD';
    const im = await RF.imagenDe(buena);
    assert.equal(im.src, buena);
  });

  test('la pieza no habla con la red ni guarda nada', () => {
    const vivo = sinComentarios(FUENTE);
    ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'sendBeacon']
      .forEach(x => assert.ok(!vivo.includes(x), 'revision-fotos.js usa ' + x));
  });
});

describe('una sola copia: los botones del CRM llaman a la pieza', () => {

  test('crm.html ya no lleva los giros, ni el detector, ni la cuenta del parecido', () => {
    const vivo = sinComentarios(CRM);
    assert.ok(!/TinyFaceDetectorOptions/.test(vivo), 'el CRM sigue armando el detector por su cuenta');
    assert.ok(!/euclideanDistance/.test(vivo));
    assert.ok(!/\[0,\s*90,\s*180,\s*270/.test(vivo), 'el CRM sigue con su propia lista de giros');
    assert.ok(!/function parecidoDeDistancia/.test(vivo));
    assert.ok(!/d<0\.6/.test(vivo), 'el corte del rostro volvió a escribirse a mano en el CRM');
    assert.match(vivo, /RF\.compararRostros\(/);
    assert.match(vivo, /RF\.leerCodigoDeImagen\(img,\{zxing:URL_ZXING_CRM,escaner:URL_ESCANER_CRM\}\)/);
    assert.match(vivo, /URL_REVISION_FOTOS='\.\.\/app\/revision-fotos\.js'/);
  });

  test('y cada cosa vive una vez en la pieza', () => {
    const vivo = sinComentarios(FUENTE);
    assert.equal((vivo.match(/TinyFaceDetectorOptions\(/g) || []).length, 1);
    assert.equal((vivo.match(/function parecidoDeDistancia/g) || []).length, 1);
    assert.equal((vivo.match(/\[0, 90, 180, 270, 2, -2, 4, -4\]/g) || []).length, 1);
    assert.match(vivo, /UMBRALES\.ROSTRO_DISTANCIA/);
  });

  /* El CRM arrancado de verdad, con una pieza de mentira enchufada. */
  function crmCon(pieza) {
    const P = abrirPanel();
    P.ctx.RevisionRegistro = RR;
    P.ctx.RevisionFotos = pieza;
    return P;
  }

  /* 2-oct-2026 (noche): ya no dice «Parecido: 41%» ni «no parece la misma
     persona» (pruebas/revision-hallazgos-pagina.test.js, ley 3). */
  test('«Comparar el rostro» dice la distancia, como la revisión automática', async () => {
    const P = crmCon({ compararRostros: () => Promise.resolve({ distancia: 0.71, parecido: 41, umbral: 0.6, debajo: false }) });
    P.ev("compararRostro('regFoto_selfie','regFoto_frente','regParecido')");
    await asentar();
    const h = P.elems.regParecido.innerHTML;
    assert.match(h, /alerta warn/);
    assert.match(h, /Se parecen poco \(distancia 0,71; desde 0,60 se avisa\)/);
    assert.match(h, /Es una ayuda, no un veredicto: la foto de la cédula es chica y vieja/);
  });

  test('sin cara en la selfie: el mismo aviso de siempre', async () => {
    const P = crmCon({ compararRostros: () => Promise.resolve({ sin_rostro: 'selfie' }) });
    P.ev("compararRostro('a','b','caja')");
    await asentar();
    assert.match(P.elems.caja.innerHTML, /No encontré un rostro en la foto del rostro\. Míralas tú\./);
  });

  test('un error con marcado sale escapado', async () => {
    const P = crmCon({ compararRostros: () => Promise.reject(new Error('<img src=x onerror=alert(1)>')) });
    P.ev("compararRostro('a','b','caja')");
    await asentar();
    assert.match(P.elems.caja.innerHTML, /No pude comparar: &lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test('«Leer el código de barras»: lo leído va a la base, y la base coteja', async () => {
    const enviados = [];
    const P = abrirPanel({ red: (url, cfg) => {
      enviados.push({ url, cuerpo: JSON.parse(cfg.body) });
      const t = JSON.stringify({ ok: true, cotejo: { estado: 'no_cuadra', documento: 'cambiado',
        visto: { documento_codigo: '111', documento_escrito: '112' } } });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(t) });
    } });
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: 'clave' });
    P.ctx.RevisionRegistro = RR;
    P.ctx.RevisionFotos = { leerCodigoDeImagen: () => Promise.resolve({ documento: '111', nombres: 'X' }) };
    P.ev("cotejarConLaFoto('regFoto_reverso','3001234567','regCotejo')");
    await asentar();
    assert.equal(enviados.length, 1);
    assert.match(enviados[0].url, /\/rpc\/verificar_registro_foto$/);
    assert.deepEqual(j(enviados[0].cuerpo.p_leida), { documento: '111', nombres: 'X' });
    assert.match(P.elems.regCotejo.innerHTML, /Leído de la foto guardada/);
    assert.match(P.elems.regCotejo.innerHTML, /No cuadra con el código/);
  });

  test('si no lee la foto, lo dice como antes: no dice nada sobre los datos', async () => {
    const P = crmCon({ leerCodigoDeImagen: () => Promise.resolve(null) });
    P.ev("cotejarConLaFoto('regFoto_reverso','3001234567','regCotejo')");
    await asentar();
    assert.match(P.elems.regCotejo.innerHTML, /No pude leer el código de barras de esa foto/);
    assert.match(P.elems.regCotejo.innerHTML, /cédula nueva de plástico/);
  });
});

describe('«Revisar a todos» en la bandeja del CRM', () => {

  test('el botón está en Registrados y abre revision.html aparte', () => {
    const i = CRM.indexOf('id="v-registrados"');
    const seccion = CRM.slice(i, CRM.indexOf('</section>', i));
    assert.match(seccion, /<a class="btn btn-ghost"[^>]*href="revision\.html"[^>]*target="_blank"[^>]*rel="noopener"[^>]*>🔎 Revisar a todos<\/a>/);
    assert.match(seccion, /onclick="traerRegistros\(\)">↻ Traer de la nube/, 'se perdió el botón de traer');
  });

  test('revision.html existe y no se precarga en el service worker (necesita la nube)', () => {
    assert.ok(fs.existsSync(path.join(RAIZ, 'panel', 'revision.html')));
    const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS = ['), SW.indexOf('].map(f => BASE + f)'));
    const ARCHIVOS = new Set([...lista.matchAll(/^\s*'([^']*)',?/mg)].map(m => m[1]));
    assert.ok(ARCHIVOS.has('app/revision-registro.js'), 'el celular abre Registrados sin señal y le faltaría el motor');
    assert.ok(!ARCHIVOS.has('panel/revision.html'));
    assert.ok(!ARCHIVOS.has('app/revision-fotos.js'));
    const v = Number((/const CACHE = 'tugarantia-v(\d+)';/.exec(SW) || [])[1]);
    assert.ok(v >= 126, 'la caché no subió con el motor nuevo en la precarga');
  });
});
