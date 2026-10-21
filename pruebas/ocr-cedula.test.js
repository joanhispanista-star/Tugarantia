'use strict';
/* ==========================================================================
 * LO QUE SE VE EN LA CÉDULA SE LLENA SOLO — 21 de octubre de 2026
 *
 *   node --test pruebas/ocr-cedula.test.js
 *
 * Joan: «si la información es visible en la cédula no quiero que nada se
 * diligencie a mano». Estas pruebas cuidan, en este orden:
 *
 *   1. LEER LAS LETRAS CON RUIDO: la fecha impresa con el mes en letras (y la
 *      O que el OCR lee como cero), el número con sus puntos, los nombres bajo
 *      sus rótulos; el consenso de dos lecturas y las validaciones. Nada de lo
 *      que no es fecha, número o nombre sale (el RH, el sexo, la estatura).
 *   2. QUÉ SE LLENA: con el código de barras manda el código; sin él, las
 *      letras; nunca una casilla escrita o tocada; el número distinto queda
 *      como señal.
 *   3. NADA SALE A TERCEROS: el Tesseract.js copiado, sus sumas, y que la
 *      página y el módulo den SIEMPRE las rutas del propio sitio.
 *   4. DE PUNTA A PUNTA CON EL MOTOR DE VERDAD, en Node, sobre una cédula
 *      fabricada (pruebas/fabricar-cedula-ocr.py): lo que se lee, lo que se
 *      pide (solo app/lib/ocr/) y cuánto tarda cada lado en esta máquina.
 *   5. LA PÁGINA (play/index.html de verdad, pruebas/banco-play.js): llena solo
 *      «Revisa tus datos», con «leído de tu cédula · revísalo» y «Están bien»,
 *      sin pasar sola; no toca cedula_leida, no se salta el «¿Es tuya?», no
 *      lee con la cámara encendida, descarta lo que llega tarde, y lo que
 *      escribió se va con sus fotos.
 *
 * Ninguna cédula de nadie: los datos son inventados.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const O = require('../app/ocr-cedula.js');
const EC = require('../app/escaner-cedula.js');
const U = require('../app/cuenta.js');
const F = require('./fabrica-pdf417.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { abrirTesseract, leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');

const HOY = '2026-10-21';
const leer = r => fs.readFileSync(path.join(RAIZ, r), 'utf8');
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

/* ==========================================================================
 * 1. LEER LAS LETRAS
 * ======================================================================== */
describe('1. las letras de la cédula, con el ruido de siempre', () => {

  test('la fecha impresa DD-MMM-AAAA, con la O leída como cero y sin separadores', () => {
    /* «24-0CT-1986 BARRANCABERMEJA» es el ejemplo público de la investigación:
       el OCR ya leyó un cero donde va la O de OCT. */
    assert.equal(O.leerFechaImpresa('24-0CT-1986 BARRANCABERMEJA'), '1986-10-24');
    assert.equal(O.leerFechaImpresa('2O-ABR-2OO3 BOGOTA D.C'), '2003-04-20');
    assert.equal(O.leerFechaImpresa('FECHA DE NACIMIENTO 15-MAR-1985'), '1985-03-15');
    assert.equal(O.leerFechaImpresa('15 MAR 1985'), '1985-03-15');
    assert.equal(O.leerFechaImpresa('15.MAR.1985'), '1985-03-15');
    assert.equal(O.leerFechaImpresa('15MAR1985'), '1985-03-15');
    assert.equal(O.leerFechaImpresa('O7-D1C-l999'), '1999-12-07', 'los cruces O/0, 1/I y l/1 no se corrigieron');
    assert.equal(O.leerFechaImpresa('03-A8R-2010'), '2010-04-03', 'el 8 por B del mes no se corrigió');
    assert.equal(O.leerFechaImpresa('03—AGO—2010'), '2010-08-03', 'la raya larga no cuenta como guion');
    assert.equal(O.leerFechaImpresa('29-FEB-2000'), '2000-02-29');
  });

  test('una fecha que no existe, o un mes que podría ser dos, NO se adivina', () => {
    assert.equal(O.leerFechaImpresa('31-FEB-2000'), '', 'un 31 de febrero salió como fecha');
    assert.equal(O.leerFechaImpresa('29-FEB-1999'), '', 'un 29 de febrero de año no bisiesto salió como fecha');
    assert.equal(O.leerFechaImpresa('12-MAX-1990'), '', '«MAX» está a una letra de MAR y de MAY: se adivinó');
    assert.equal(O.leerFechaImpresa('12-JUM-1990'), '', '«JUM» está a una letra de JUN y de JUL: se adivinó');
    assert.equal(O.leerFechaImpresa('12-0CX-1990'), '1990-10-12', 'a una letra de un solo mes (OCT) sí se corrige');
    assert.equal(O.leerFechaImpresa('BOGOTA D.C (CUNDINAMARCA)'), '');
    assert.equal(O.leerFechaImpresa('1.65 O+ F ESTATURA G.S. RH SEXO'), '', 'la fila del RH dio una fecha');
    assert.equal(O.leerFechaImpresa('123-MAR-19850'), '', 'una fecha pegada a otros dígitos se tomó');
  });

  test('el número: después de NUMERO, con sus puntos de miles y las confusiones de siempre', () => {
    assert.equal(O.normalizarNumero('NUMERO 52.123.456'), '52123456');
    assert.equal(O.normalizarNumero('NUMER0 1.O2O.3O4.O5O'), '1020304050');
    assert.equal(O.normalizarNumero('NUMERO 52.l23.456'), '52123456');
    assert.equal(O.normalizarNumero('NUMERO 52 123 456'), '52123456');
    assert.equal(O.normalizarNumero('REPUBLICA DE COLOMBIA\nNUMERO 80.123.456\nPEREZ GOMEZ'), '80123456');
    /* Palabras que son «dígitos» posibles y ninguno de verdad. */
    assert.equal(O.normalizarNumero('SOLIS DIOS'), '');
    assert.equal(O.normalizarNumero('BOGOTA'), '');
    /* Puntos que no son de miles: no es una cédula leída bien. */
    assert.equal(O.normalizarNumero('NUMERO 52.12.456'), '');
    assert.equal(O.normalizarNumero('NUMERO 1234'), '', 'cuatro dígitos no son una cédula');
  });

  test('el frente: el valor va encima de su rótulo, con ruido, tildes y Ñ', () => {
    assert.deepEqual(O.parsearFrente('REPUBLICA DE COLOMBIA\nNUMERO 52.123.456\nPEREZ GOMEZ\nAPELLIDOS\nMARIA ALEJANDRA\nNOMBRES\n'),
      { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA' });
    /* Lo que de verdad devuelve el motor con el holograma encima. */
    assert.deepEqual(O.parsearFrente('TT ZII\nNUMER0 52.123.456\nPEREZ G0MEZ\nAPELLID0S\n\nMARIA ALEJANDRA ll\nNOMBRFS\n'),
      { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA' });
    assert.deepEqual(O.parsearFrente('NUMERO 1.020.304.050\nMUÑOZ PÉREZ\nAPELLIDOS\nJOSÉ ÁNGEL\nNOMBRES'),
      { documento: '1020304050', apellidos: 'MUÑOZ PEREZ', nombres: 'JOSE ANGEL' });
    /* El rótulo en la misma línea que el valor. */
    assert.deepEqual(O.parsearFrente('NUMERO 52.123.456\nPEREZ GOMEZ APELLIDOS\nMARIA NOMBRES'),
      { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA' });
    /* Sin ningún rótulo a la vista (la variante binarizada se los come): el
       orden de la tarjeta. */
    assert.deepEqual(O.parsearFrente('NUMERO 52.123.456\nPEREZ GOMEZ\nMARIA ALEJANDRA\n'),
      { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA' });
  });

  test('lo que no es un nombre no se vuelve nombre', () => {
    assert.equal(O.normalizarNombre('APELLIDOS'), '');
    assert.equal(O.normalizarNombre('LL TE'), '', 'dos letras sueltas del holograma salieron como apellido');
    assert.equal(O.normalizarNombre('1.65 O+'), '');
    assert.equal(O.normalizarNombre('CEDULA DE CIUDADANIA'), '', 'el encabezado de la tarjeta salió como nombre');
  });

  test('el CONSENSO: dos lecturas distintas tienen que decir lo mismo', () => {
    assert.equal(O.consenso(['2003-04-20', '2003-04-20']), '2003-04-20');
    assert.equal(O.consenso(['2003-04-20', '2083-04-20']), '', 'dos lecturas en desacuerdo dieron un valor');
    assert.equal(O.consenso(['2003-04-20', '', '']), '', 'una sola lectura dio un valor');
    assert.equal(O.consenso(['2003-04-20', '2083-04-20', '2003-04-20']), '2003-04-20', 'dos de tres no ganaron');
  });

  test('las validaciones tiran lo que no es creíble', () => {
    const v = c => O.validar(c, { hoy: HOY });
    assert.equal(v({ expedicion: '2027-01-01' }).expedicion, '', 'una expedición futura pasó');
    assert.equal(v({ expedicion: '1925-05-05' }).expedicion, '');
    assert.equal(v({ expedicion: '1986-10-24' }).expedicion, '1986-10-24', 'una expedición de los 80 (la original de la amarilla) no pasó');
    /* La regla de los 18 años es la de EC.revisarExpedicion, con el nacimiento
       del código si lo hay, y si no el leído. */
    assert.equal(O.validar({ expedicion: '2000-01-01' }, { hoy: HOY, nacimientoLeido: '1990-06-01' }).expedicion, '');
    assert.equal(v({ nacimiento: '1990-06-01', expedicion: '2000-01-01' }).expedicion, '');
    assert.equal(v({ nacimiento: '1985-03-15', expedicion: '2003-04-20' }).expedicion, '2003-04-20');
    /* La misma fecha en las dos franjas: no se sabe cuál es cuál. */
    assert.deepEqual([v({ nacimiento: '2003-04-20', expedicion: '2003-04-20' }).nacimiento,
      v({ nacimiento: '2003-04-20', expedicion: '2003-04-20' }).expedicion], ['', '']);
    assert.equal(v({ nacimiento: '2015-01-01' }).nacimiento, '', 'un nacimiento de un menor de edad pasó');
    assert.equal(v({ documento: '1234' }).documento, '');
    assert.deepEqual([v({ apellidos: 'PEREZ', nombres: 'PEREZ' }).apellidos, v({ apellidos: 'PEREZ', nombres: 'PEREZ' }).nombres], ['', '']);
  });

  test('de una franja solo sale fecha, número o nombre: el RH, el sexo y la estatura no existen', async () => {
    /* Un lector de mentira que contesta, para el respaldo, lo que contestaría
       si una franja mal puesta alcanzara la fila de la estatura, el RH y el
       sexo. */
    /* Las dos primeras lecturas son de la franja del nacimiento (solo la fila
       del RH, sin fecha); las siguientes, de la expedición (el RH y la fecha). */
    let n = 0;
    const lector = { leer: () => Promise.resolve(n++ < 2 ? '1.65  O+  F\nESTATURA G.S. RH SEXO\n'
      : '1.65  O+  F\nESTATURA G.S. RH SEXO\n20-ABR-2003 BOGOTA D.C\n'), terminar() {} };
    const gris = new Uint8ClampedArray(1000 * 631).fill(200);
    const rec = O.recortarDeGris('reverso', gris, 1000, 631, {});
    assert.deepEqual(rec.zonas.map(z => z.id), ['nacimiento', 'expedicion']);
    const r = await O.leerRecorte(lector, rec, { hoy: HOY });
    assert.deepEqual(r.campos, { expedicion: '2003-04-20' });
    const todo = JSON.stringify(r);
    ['O+', 'RH', 'SEXO', 'ESTATURA', '1.65', 'BOGOTA'].forEach(p =>
      assert.ok(todo.indexOf(p) < 0, 'salió «' + p + '» de la lectura: ' + todo));
    assert.deepEqual(O.CAMPOS, { frente: ['documento', 'apellidos', 'nombres'], reverso: ['nacimiento', 'expedicion'] });
  });

  test('el consenso de verdad: una variante que lee mal no gana, y la tercera desempata', async () => {
    const textos = ['20-ABR-2003', '20-ABR-2083', '20-ABR-2003'];
    let i = 0;
    const lector = { leer: () => Promise.resolve('FECHA ' + (textos[i++ % 3])), terminar() {} };
    const gris = new Uint8ClampedArray(1000 * 631).fill(200);
    const rec = O.recortarDeGris('reverso', gris, 1000, 631, {});
    rec.zonas = rec.zonas.filter(z => z.id === 'expedicion');
    const r = await O.leerRecorte(lector, rec, { hoy: HOY });
    assert.equal(r.campos.expedicion, '2003-04-20');
    assert.equal(r.lecturas, 3, 'no hizo falta la tercera lectura, o se hicieron de más');
    let j = 0;
    const malo = { leer: () => Promise.resolve(['01-ENE-2001', '02-ENE-2001', '03-ENE-2001'][j++ % 3]), terminar() {} };
    const r2 = await O.leerRecorte(malo, rec, { hoy: HOY });
    assert.equal(r2.campos.expedicion, undefined, 'tres lecturas distintas dieron una fecha');
  });

  test('el enganche en una llamada (leerLado): al lienzo se le piden SOLO las franjas', async () => {
    const pedidas = [];
    const lienzo = { width: 1000, height: 631, getContext: () => ({ getImageData: (x, y, w, h) => {
      pedidas.push([x, y, w, h]); return { data: new Uint8ClampedArray(w * h * 4).fill(200) }; } }) };
    const lector = { leer: () => Promise.resolve('20-ABR-2003 BOGOTA D.C'), terminar() {} };
    const r = await O.leerLado(lector, 'reverso', lienzo, { hoy: HOY });
    assert.equal(r.lado, 'reverso');
    assert.equal(pedidas.length, 2, 'se le pidió al lienzo algo más que las dos franjas');
    pedidas.forEach(([x, y, w, h]) => {
      /* Ninguna franja toca la fila del RH del diseño (el 30-44 % del alto). */
      assert.ok(y + h <= 0.20 * 631 || y >= 0.44 * 631, 'una franja cae en la fila del RH: ' + [x, y, w, h]);
    });
    assert.ok(pedidas.every(([, , w, h]) => w * h < 0.15 * 1000 * 631));
  });
});

/* ==========================================================================
 * 2. QUÉ SE LLENA
 * ======================================================================== */
describe('2. qué casillas se llenan, y con qué', () => {
  const VISTA = { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA', expedicion: '2003-04-20' };

  test('sin código de barras: el número, los apellidos, los nombres, la expedición y el tipo', () => {
    const p = O.planDeLlenado({ vista: VISTA, leida: null, registro: {}, tocados: {} });
    assert.deepEqual(p.llenar, Object.assign({ tipo_doc: 'Cédula de ciudadanía' }, VISTA));
    assert.equal(p.numero_distinto, undefined, 'sin código no hay con qué comparar el número');
  });

  test('con el código leído manda el código: las letras solo completan la expedición', () => {
    const leida = { documento: '52123456', nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', nacimiento: '1988-03-12', lectura: 'anchos_fijos' };
    const p = O.planDeLlenado({ vista: VISTA, leida, registro: {}, tocados: {} });
    assert.deepEqual(p.llenar, { expedicion: '2003-04-20' });
    assert.equal(p.numero_distinto, false);
    const otro = O.planDeLlenado({ vista: Object.assign({}, VISTA, { documento: '52123465' }), leida, registro: {}, tocados: {} });
    assert.equal(otro.numero_distinto, true, 'el número impreso distinto no quedó como señal');
    assert.deepEqual(otro.llenar, { expedicion: '2003-04-20' }, 'el número de las letras pisó al del código');
    /* Los ceros de la izquierda que trae el código no son una diferencia. */
    assert.equal(O.planDeLlenado({ vista: VISTA, leida: Object.assign({}, leida, { documento: '0052123456' }), registro: {} }).numero_distinto, false);
  });

  test('nunca una casilla escrita, ni una que la persona tocó (aunque la haya dejado vacía)', () => {
    const p = O.planDeLlenado({ vista: VISTA, leida: null,
      registro: { nombres: 'MARÍA ALEJANDRA', expedicion: '' }, tocados: { expedicion: true } });
    assert.equal(p.llenar.nombres, undefined, 'pisó un nombre escrito');
    assert.equal(p.llenar.expedicion, undefined, 'llenó una casilla que la persona vació a propósito');
    assert.equal(p.llenar.documento, '52123456');
  });

  test('con otro tipo de documento escogido, la letra de una cédula no llena nada', () => {
    const p = O.planDeLlenado({ vista: VISTA, leida: null, registro: { tipo_doc: 'Pasaporte' }, tocados: {} });
    assert.deepEqual(p.llenar, {});
  });
});

/* ==========================================================================
 * 3. NADA SALE A TERCEROS
 * ======================================================================== */
describe('3. el motor vive en el propio sitio', () => {

  test('las copias de app/lib/ocr/ son las que dice ORIGEN.md (sha256)', () => {
    const origen = leer('app/lib/ocr/ORIGEN.md');
    const filas = [...origen.matchAll(/\| `([^`]+)` \|[^\n]*\| `([0-9a-f]{64})` \|/g)];
    assert.ok(filas.length >= 5, 'ORIGEN.md no trae las sumas');
    filas.forEach(m => {
      let b = fs.readFileSync(path.join(RAIZ, 'app', 'lib', 'ocr', m[1]));
      /* Los .js con git en Windows (core.autocrlf) salen con CRLF en la
         copia de trabajo; el repositorio y lo que sirve el sitio son LF, que
         es lo que dice la suma. El .gz es binario y no se toca. */
      if (/\.js$/.test(m[1])) b = Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
      assert.equal(crypto.createHash('sha256').update(b).digest('hex'), m[2], m[1] + ' no es la copia que dice ORIGEN.md');
    });
  });

  test('las rutas son SIEMPRE del sitio, y sin rutas no hay motor', async () => {
    const r = O.rutas('../app/', true);
    assert.deepEqual(r, { libreria: '../app/lib/ocr/tesseract.min.js', workerPath: '../app/lib/ocr/worker.min.js',
      corePath: '../app/lib/ocr/tesseract-core-simd-lstm.wasm.js', langPath: '../app/lib/ocr' });
    assert.equal(O.rutas('../app/', false).corePath, '../app/lib/ocr/tesseract-core-lstm.wasm.js');
    [r.libreria, r.workerPath, r.corePath, r.langPath + '/spa.traineddata.gz', O.rutas('../app/', false).corePath].forEach(u =>
      assert.ok(fs.existsSync(path.join(RAIZ, 'play', u)), u + ' no existe en el repositorio'));
    /* crearLector pasa las tres, siempre (sin ellas Tesseract.js va al CDN). */
    let opciones = null;
    const T = { createWorker: (l, oem, o) => { opciones = o; return Promise.resolve({ setParameters: () => Promise.resolve(), recognize: () => Promise.resolve({ data: { text: '' } }), terminate() {} }); } };
    await O.crearLector(T, r);
    assert.equal(opciones.workerPath, r.workerPath);
    assert.equal(opciones.corePath, r.corePath);
    assert.equal(opciones.langPath, r.langPath);
    assert.equal(opciones.cacheMethod, 'none', 'el modelo se copiaría a IndexedDB');
    await assert.rejects(O.crearLector(T, { workerPath: r.workerPath }), /sin_rutas/);
  });

  test('ni el módulo ni la página nombran un CDN, y la página no carga el motor con <script>', () => {
    const prohibidos = /jsdelivr|unpkg|tessdata|githubusercontent|cdnjs|googleapis/i;
    const modulo = leer('app/ocr-cedula.js');
    assert.ok(!/https?:\/\//.test(sinComentarios(modulo)), 'app/ocr-cedula.js trae una dirección de afuera');
    assert.ok(!prohibidos.test(modulo), 'app/ocr-cedula.js nombra un CDN');
    const play = leer('play/index.html');
    assert.ok(!prohibidos.test(sinComentarios(play)), 'play/index.html nombra un CDN');
    assert.match(play, /var URL_OCR_CEDULA = '\.\.\/app\/ocr-cedula\.js';/);
    assert.match(play, /var BASE_OCR = '\.\.\/app\/';/);
    assert.ok(!/<script[^>]+src="[^"]*(ocr|tesseract)/i.test(play), 'el motor se carga para todos con un <script src>');
  });

  test('sw.js precarga el módulo chico, NUNCA los 6 MB del motor', () => {
    const sw = leer('sw.js');
    assert.match(sw, /'app\/ocr-cedula\.js'/);
    assert.ok(!/'app\/lib\/ocr\//.test(sinComentarios(sw)), 'el motor entró a la precarga: se lo baja a cada socio que abre la app');
  });
});

/* ==========================================================================
 * 4. DE PUNTA A PUNTA, CON EL MOTOR DE VERDAD
 * ======================================================================== */
/* Dónde quedó el marco en los recortes fabricados (fabricar-cedula-ocr.py). */
const GUIA = { x: 60, y: 38, w: 1000, h: 631 };
const CARTA = lado => leerPGM(path.join(__dirname, 'cedula-ocr-' + lado + '.pgm.gz'));
function girar180(img) {
  const g = new Uint8ClampedArray(img.gris.length);
  for (let i = 0; i < g.length; i++) g[i] = img.gris[g.length - 1 - i];
  return { gris: g, w: img.w, h: img.h };
}
function guiaGirada(img) { return { x: img.w - GUIA.x - GUIA.w, y: img.h - GUIA.y - GUIA.h, w: GUIA.w, h: GUIA.h }; }

describe('4. de punta a punta: Tesseract.js copiado, en Node, sobre una cédula fabricada', () => {

  test('lee el respaldo y el frente, pide solo lo del sitio, y dice cuánto tarda', async (t) => {
    const b = abrirTesseract();
    try {
      const t0 = Date.now();
      const lector = await O.crearLector(b.Tesseract, O.rutas('../app/'));
      const msMotor = Date.now() - t0;
      const rev = CARTA('reverso'), fre = CARTA('frente');
      const t1 = Date.now();
      const r1 = await O.leerRecorte(lector, O.recortarDeGris('reverso', rev.gris, rev.w, rev.h, { giro: 0, guia: GUIA }), { hoy: HOY });
      const msRespaldo = Date.now() - t1;
      const t2 = Date.now();
      const r2 = await O.leerRecorte(lector, O.recortarDeGris('frente', fre.gris, fre.w, fre.h, { giro: 0, guia: GUIA }), { hoy: HOY });
      const msFrente = Date.now() - t2;
      await lector.terminar();
      t.diagnostic('motor listo en ' + msMotor + ' ms; respaldo ' + msRespaldo + ' ms (' + r1.lecturas +
        ' lecturas); frente ' + msFrente + ' ms (' + r2.lecturas + ' lecturas) — en esta máquina, escritorio');
      assert.deepEqual(r1.campos, { nacimiento: '1985-03-15', expedicion: '2003-04-20' });
      assert.deepEqual(r2.campos, { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA' });
      /* Todo lo que se pidió es del sitio: ni jsdelivr, ni unpkg, ni tessdata. */
      const ajenos = b.pedidos.filter(u => !u.startsWith('https://tugarantia.net/app/lib/ocr/'));
      assert.deepEqual(ajenos, [], 'el motor pidió algo fuera de app/lib/ocr/');
      assert.ok(b.pedidos.some(u => /spa\.traineddata\.gz$/.test(u)), 'el español no salió de app/lib/ocr/');
      assert.ok(b.pedidos.some(u => /tesseract-core-(simd-)?lstm\.wasm\.js$/.test(u)), 'el núcleo no salió de app/lib/ocr/');
    } finally { await b.cerrar(); }
  });

  test('las franjas del respaldo no alcanzan la fila del RH, el sexo y la estatura', async () => {
    const b = abrirTesseract();
    try {
      const lector = await O.crearLector(b.Tesseract, O.rutas('../app/'));
      const rev = CARTA('reverso');
      const rec = O.recortarDeGris('reverso', rev.gris, rev.w, rev.h, { giro: 0, guia: GUIA });
      let crudo = '';
      for (const z of rec.zonas) {
        for (const v of ['A', 'B', 'C']) {
          const p = O.preparar(z, rec.ancho, v);
          crudo += await lector.leer(O.aPGM(p.gris, p.w, p.h), { lista: z.lista, psm: z.psm }) + '\n';
        }
      }
      await lector.terminar();
      ['ESTATURA', 'SEXO', 'G.S', 'RH', 'O+', '1.65'].forEach(p =>
        assert.ok(crudo.indexOf(p) < 0, 'una franja del respaldo leyó «' + p + '»: ' + JSON.stringify(crudo)));
      /* Y lo recortado es poco: dos franjas finas, no la tarjeta. */
      const px = rec.zonas.reduce((s, z) => s + z.w * z.h, 0);
      assert.ok(px < 0.25 * GUIA.w * GUIA.h, 'se recortó ' + Math.round(100 * px / (GUIA.w * GUIA.h)) + ' % del respaldo');
    } finally { await b.cerrar(); }
  });

  test('el respaldo cabeza abajo (giro 180) se lee igual, y el frente al revés también', async () => {
    const b = abrirTesseract();
    try {
      const lector = await O.crearLector(b.Tesseract, O.rutas('../app/'));
      const rev = girar180(CARTA('reverso'));
      const r1 = await O.leerRecorte(lector, O.recortarDeGris('reverso', rev.gris, rev.w, rev.h, { giro: 180, guia: guiaGirada(rev) }), { hoy: HOY });
      assert.equal(r1.campos.expedicion, '2003-04-20');
      /* El frente no tiene cómo saber que quedó al revés: lo intenta derecho,
         no sale nada, y prueba girado. */
      const fre = girar180(CARTA('frente'));
      const r2 = await O.leerRecorte(lector, O.recortarDeGris('frente', fre.gris, fre.w, fre.h, { giro: 0, guia: guiaGirada(fre) }), { hoy: HOY });
      await lector.terminar();
      assert.equal(r2.campos.documento, '52123456', 'el frente al revés no se leyó');
    } finally { await b.cerrar(); }
  });
});

/* ==========================================================================
 * 5. LA PÁGINA
 * ======================================================================== */
const CEDULA = (() => {
  const b = F.registroCedula({ documento: '0052123456', apellido1: 'RODRIGUEZ', apellido2: 'PEREZ',
    nombre1: 'MARIA', nombre2: 'JOSE', sexo: 'F', nacimiento: '19880312', rh: 'A+' });
  let t = '';
  for (const x of b) t += String.fromCharCode(x);
  return EC.cedulaDelTexto(U.leerCedulaPDF417, t);
})();
const LEIDO_POR_LETRAS = {
  reverso: { nacimiento: '1985-03-15', expedicion: '2003-04-20' },
  frente: { documento: '52123456', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA' }
};

/* La página con cámara que nunca contesta, relojes a mano, un lienzo de
   mentira para el recorte, y el módulo de las letras (con un lector de
   mentira que anota lo que hace, o el motor de verdad si `motor` viene). */
function abrir(opc) {
  const o = opc || {};
  const P = abrirPlay({ hash: '#registro' });
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
  P.ev('window.__relojes = []; setTimeout = function (f, ms) { window.__relojes.push({ f: f, ms: ms }); return window.__relojes.length; }; clearTimeout = function () {};');
  P.ev('window.__scripts = []; cargarScript = function (u) { window.__scripts.push(u); return Promise.resolve(); };');
  P.ev('window.__links = []; document.head.appendChild = function (e) { if (e && e.rel) window.__links.push(e.rel + " " + e.href); };' +
       'var __ce = document.createElement; document.createElement = function (t) { return t === "link" ? { tag: "link" } : __ce.call(document, t); };');
  /* El lienzo del recorte: getImageData de una franja, desde un gris. */
  P.ev(`window.lienzoDeGris = function (g, W, H) {
    return { width: W, height: H, getContext: function () { return { getImageData: function (x, y, w, h) {
      var d = new Uint8ClampedArray(w * h * 4);
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var v = g ? g[(y + j) * W + x + i] : 200, k = (j * w + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
      }
      window.__franjas = (window.__franjas || 0) + w * h;
      return { data: d };
    } }; } };
  };`);
  const reg = { lectores: 0, terminados: 0, lecturas: [], esperas: [] };
  if (o.motor) {
    P.ventana.OcrCedula = O;
    P.ventana.Tesseract = o.motor.Tesseract;
  } else {
    const res = o.resultados || LEIDO_POR_LETRAS;
    P.ventana.OcrCedula = Object.assign({}, O, {
      crearLector: () => { reg.lectores++; return Promise.resolve({ leer: () => Promise.resolve(''), terminar: () => { reg.terminados++; } }); },
      leerRecorte: (l, rec, ctx) => {
        reg.lecturas.push({ lado: rec.lado, zonas: rec.zonas.map(z => z.id), ctx: ctx });
        const salida = { lado: rec.lado, campos: Object.assign({}, res[rec.lado] || {}), ms: 1, lecturas: 2 };
        if (o.esperar) return new Promise(r => reg.esperas.push(() => r(salida)));
        return Promise.resolve(salida);
      }
    });
  }
  return { P, reg };
}
function pasa(P, ms) {
  P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === ' + ms + '; });' +
       ' if (i < 0) throw new Error("no hay temporizador de ' + ms + ' ms"); var r = window.__relojes.splice(i, 1)[0]; r.f(); })()');
}
const pasoActual = P => P.ev('PASOS[PASO].id');
const cuerpo = P => P.ev("$('cuerpo').innerHTML");
/* Las medidas del escáner con las que el marco cae donde lo dejó la fábrica
   (GUIA: 60, 38, 1000 × 631 dentro del recorte de 1120 × 708). Ver
   guiaEnElRecorte.
   21-oct-2026 (integración del lote 1) — LAS DOS CARAS ACOSTADAS. Hasta hoy el
   respaldo iba de pie (el teléfono vertical, el recorte girado 90°); el
   escáner del 21-oct (l1-escaner) acuesta las dos, y el marco de pie ya no
   existe. Con el de pie de antes, el marco calculado no cabía en el recorte y
   las franjas salían de la tarjeta entera con su aire: la prueba de «solo las
   franjas» lo vio. Aquí recortarGuia está de mentira y no anota su marco
   (ESCDOC.marcoEnRecorte), así que se lee el calculado; el de verdad, el
   anotado al dibujar, lo prueba pruebas/escaner-ocr-de-punta-a-punta.test.js. */
const VIDEO = {
  reverso: "$('docVideo').videoWidth = 1200; $('docVideo').videoHeight = 800; ESCDOC.guiaVideo = { x: 100, y: 100, w: 1000, h: 631, vertical: false };",
  frente: "$('docVideo').videoWidth = 1200; $('docVideo').videoHeight = 800; ESCDOC.guiaVideo = { x: 100, y: 100, w: 1000, h: 631, vertical: false };"
};
/* El escáner en vivo, lado por lado. Sin `cedula`, el respaldo NO se lee
   (capturarDoc a los 2,5 s, «Tomar la foto ahora»); con ella, se lee como lo
   lee leidaDoc. `grises`: los recortes de verdad (la prueba con el motor). */
function escanear(P, opc) {
  const o = opc || {};
  P.ev('autorizarYEscanear()');
  P.ev("codigoEnRecorte = function () { return false; }; giroPorPatron = function () { return 0; };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO'); };");
  const lienzo = lado => o.grises ? 'lienzoDeGris(window.__gris_' + lado + ', ' + o.grises[lado].w + ', ' + o.grises[lado].h + ')' : 'lienzoDeGris(null, 1120, 708)';
  P.ev(VIDEO.reverso + 'ESCDOC.recorte = ' + lienzo('reverso') + '; recortarGuia = function () { return ESCDOC.recorte; };');
  if (o.cedula) {
    P.ev('leidaDoc(' + JSON.stringify(o.cedula) + ', 0)');
    pasa(P, 1500);
  } else {
    P.ev('capturarDoc(true)');
    pasa(P, 4500);
  }
  if (o.soloRespaldo) return;
  P.ev(VIDEO.frente + 'ESCDOC.recorte = ' + lienzo('frente') + ';');
  P.ev('capturarDoc(true)');
  pasa(P, 1500);
}

describe('5. la página: «Revisa tus datos» se llena solo, y la persona confirma', () => {

  test('sin código de barras: las letras llenan todo, con su marca, «Están bien» y sin pasar sola', async () => {
    const { P, reg } = abrir();
    escanear(P);
    await asentar();
    assert.equal(pasoActual(P), 'identidad', 'con las dos caras no llegó a «Revisa tus datos»');
    assert.deepEqual(reg.lecturas.map(x => x.lado), ['reverso', 'frente'], 'no leyó primero el respaldo (la expedición)');
    assert.equal(P.ev('REGISTRO.documento'), '52123456');
    assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA ALEJANDRA');
    assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20');
    assert.equal(P.ev('REGISTRO.tipo_doc'), 'Cédula de ciudadanía');
    /* En pantalla, sin repintar: las casillas, su marca, el botón. */
    assert.equal(P.ev("$('f_expedicion').value"), '2003-04-20');
    assert.equal(P.ev("$('f_documento').value"), '52123456');
    assert.equal(P.ev("$('leido_expedicion').textContent"), '· leído de tu cédula · revísalo');
    assert.equal(P.ev("$('leido_nombres').textContent"), '· leído de tu cédula · revísalo');
    assert.equal(P.ev("$('btnSeguir').textContent"), 'Están bien', 'el botón no es el toque que confirma');
    assert.match(P.ev("$('notaFoto').innerHTML"), /Leímos de las fotos de tu cédula/);
    assert.match(P.ev("$('ayudaExpedicion').textContent"), /La leímos del respaldo de tu cédula/);
    /* Y repintado (la persona vuelve al paso), lo mismo. */
    P.ev("pintarRegistro(indiceDe('identidad'))");
    const h = cuerpo(P);
    assert.match(h, /<h3 class="tit"[^>]*>Revisa tus datos<\/h3>/);
    assert.match(h, /<label for="f_apellidos">Tus apellidos <span class="opc" id="leido_apellidos">· leído de tu cédula · revísalo<\/span><\/label>/);
    assert.match(h, /id="btnSeguir"[^>]*>Están bien</);
    assert.match(h, /class="aviso ambar oculto" id="notaSinLeer"/, 'sigue diciendo «los datos los escribes tú» con los datos ya escritos');
    /* NUNCA pasa sola: lo confirma la persona. */
    await asentar();
    assert.equal(pasoActual(P), 'identidad', 'pasó sola al paso siguiente');
    /* El motor se terminó al acabar. */
    assert.equal(reg.lectores, 1);
    assert.equal(reg.terminados, 1, 'el motor (el worker) quedó vivo después de leer');
    assert.equal(P.ev('OCR_CEDULA.estado'), 'listo');
  });

  test('lo leído de las letras NUNCA es «la cédula leída»: no toca cedula_leida y no se salta el «¿Es tuya?»', async () => {
    const { P } = abrir();
    escanear(P);
    await asentar();
    assert.equal(P.ev('FOTOS.cedula_leida'), undefined, 'las letras escribieron cedula_leida');
    assert.equal(P.ev('FOTOS.cedula_vista.fuente'), 'ocr');
    assert.equal(P.ev('cedulaLeidaDeEsteRegistro()'), false);
    /* Lo que sube a la cola tampoco: sin lectura del código, la cédula solo
       sube con el «es mía» (motivoParaNoSubir). */
    assert.equal(P.ev('motivoParaNoSubir(FOTOS, "3001112233", "52123456", true)'), 'sin_dueno');
    /* «Están bien» revisa y pregunta. */
    P.ev("U.camposDelGrupo('identidad').forEach(function (c) { $('f_' + c.id).value = REGISTRO[c.id] || ''; });");
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'identidad', 'se saltó el «¿Es tuya?» de la cédula sin código');
    assert.match(P.ev("$('errReg').innerHTML"), /¿Esta cédula es la tuya, la del documento 52\.123\.456\?/);
    assert.match(P.ev("$('errReg').innerHTML"), /id="btnCedulaEsMia"/);
    P.ev('confirmarCedulaSinLectura()');
    assert.equal(pasoActual(P), 'entrada');
  });

  test('con el código leído manda el código: las letras solo llenan la expedición, y el número distinto queda como señal', async () => {
    const otroNumero = { reverso: LEIDO_POR_LETRAS.reverso,
      frente: { documento: '52123465', apellidos: 'PEREZ GOMEZ', nombres: 'MARIA ALEJANDRA' } };
    const { P } = abrir({ resultados: otroNumero });
    escanear(P, { cedula: CEDULA });
    await asentar();
    assert.equal(pasoActual(P), 'identidad');
    assert.equal(P.ev('REGISTRO.documento'), '52123456', 'el número de las letras pisó al del código');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE');
    assert.equal(P.ev('REGISTRO.apellidos'), 'RODRIGUEZ PEREZ');
    assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20', 'la expedición no salió de las letras');
    assert.equal(P.ev('FOTOS.cedula_leida.documento'), '52123456', 'la lectura del código cambió');
    assert.equal(P.ev('FOTOS.cedula_vista.numero_distinto'), true, 'el número distinto no quedó como señal para Joan');
    /* Ni borra el registro por «otra persona» ni lo dice: no es una lectura. */
    assert.equal(P.ev("FOTOS.cedula_reverso"), 'data:image/jpeg;base64,RESPALDO');
    assert.ok(!/otra persona/.test(P.ev("$('errReg').innerHTML") || ''));
    /* Y a nadie se le dice «verificado». */
    assert.ok(!/verificad/i.test(cuerpo(P) + P.ev("$('notaFoto').innerHTML")));
    assert.equal(P.ev("$('btnSeguir').textContent"), 'Están bien');
  });

  test('lo que la persona escribió, o tocó y dejó vacío, no se llena', async () => {
    const { P, reg } = abrir({ esperar: true });
    escanear(P);
    await asentar();
    assert.equal(P.ev('OCR_CEDULA.estado'), 'leyendo');
    assert.match(cuerpo(P), /Estamos leyendo las letras de tu cédula/);
    assert.match(cuerpo(P), /<h3 class="tit"[^>]*>Revisa tus datos<\/h3>/);
    /* Mientras lee, la persona escribe su nombre y borra la expedición. */
    P.ev("$('f_nombres').value = 'MARÍA ALEJANDRA'; anotarCampo($('f_nombres'));");
    P.ev("$('f_expedicion').value = ''; anotarCampo($('f_expedicion'));");
    reg.esperas.shift()();
    await asentar();
    reg.esperas.shift()();
    await asentar();
    assert.equal(P.ev('REGISTRO.nombres'), 'MARÍA ALEJANDRA', 'pisó lo que la persona escribió');
    assert.equal(P.ev('REGISTRO.expedicion'), '', 'llenó la casilla que la persona vació');
    assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
    assert.equal(P.ev("$('leido_nombres').textContent"), '', 'dice «leído de tu cédula» en lo que escribió la persona');
  });

  test('NUNCA con la cámara encendida: lo disparado espera, y encenderla otra vez deja la lectura', async () => {
    const { P, reg } = abrir({ esperar: true });
    escanear(P, { soloRespaldo: true });
    assert.ok(P.ev('!!OCR_CEDULA.pendientes.reverso'), 'el disparo no dejó las franjas del respaldo');
    assert.equal(P.ev('ESCDOC.activo'), true, 'el escáner no siguió con el frente');
    P.ev('ocrLeerLoPendiente()');
    await asentar();
    assert.equal(reg.lectores, 0, 'el motor arrancó con la cámara encendida');
    /* El frente, y al cerrar la cámara empieza. */
    P.ev(VIDEO.frente + 'ESCDOC.recorte = lienzoDeGris(null, 1120, 708); capturarDoc(true)');
    pasa(P, 1500);
    await asentar();
    assert.equal(reg.lectores, 1);
    /* Repetir el frente enciende la cámara: la lectura se deja y el motor se termina. */
    P.ev("repetirDoc('frente')");
    assert.equal(reg.terminados, 1, 'el motor siguió vivo con la cámara encendida otra vez');
    reg.esperas.forEach(f => f());
    await asentar();
    assert.equal(P.ev('REGISTRO.expedicion'), undefined, 'una lectura dejada escribió igual');
  });

  test('una lectura que llega tarde no es de nadie: salir del registro la descarta y se lleva lo que escribió', async () => {
    const { P, reg } = abrir({ esperar: true });
    escanear(P);
    await asentar();
    assert.equal(P.ev('OCR_CEDULA.estado'), 'leyendo');
    P.ev('pintarEntrar()');   // «Volver» hasta la portada: soltar lo sensible
    assert.equal(reg.terminados, 1, 'salir del registro no terminó el motor');
    reg.esperas.forEach(f => f());
    await asentar();
    assert.equal(P.ev('REGISTRO.expedicion'), undefined, 'la lectura de antes escribió después de salir');
    assert.equal(P.ev('FOTOS.cedula_vista'), undefined);

    /* Y lo que ya había escrito se va con las fotos al salir, como lo del código. */
    const { P: Q } = abrir();
    escanear(Q);
    await asentar();
    assert.equal(Q.ev('REGISTRO.expedicion'), '2003-04-20');
    Q.ev("$('f_apellidos').value = 'PÉREZ GÓMEZ'; anotarCampo($('f_apellidos'));");
    Q.ev('soltarLoSensibleDelRegistro()');
    assert.equal(Q.ev('REGISTRO.expedicion'), undefined, 'la expedición de las letras se quedó sin sus fotos');
    assert.equal(Q.ev('REGISTRO.documento'), undefined);
    assert.equal(Q.ev('REGISTRO.apellidos'), 'PÉREZ GÓMEZ', 'se llevó lo que la persona corrigió: eso ya es suyo');
  });

  test('un respaldo nuevo o un «No es mía» se llevan lo que escribieron las letras', async () => {
    const { P } = abrir();
    escanear(P);
    await asentar();
    P.ev("repetirDoc('reverso')");
    assert.equal(P.ev('REGISTRO.expedicion'), undefined, 'la expedición del respaldo anterior se quedó');
    assert.equal(P.ev('REGISTRO.nombres'), undefined, 'los nombres del frente anterior se quedaron');
    assert.equal(P.ev('FOTOS.cedula_vista'), undefined);

    const { P: Q } = abrir();
    escanear(Q);
    await asentar();
    Q.ev("U.camposDelGrupo('identidad').forEach(function (c) { $('f_' + c.id).value = REGISTRO[c.id] || ''; }); siguientePaso();");
    assert.match(Q.ev("$('errReg').innerHTML"), /id="btnCedulaNoEsMia"/);
    Q.ev('soltarCedulaSinLectura()');
    assert.equal(Q.ev('REGISTRO.documento'), undefined, 'el número de una cédula que «no es mía» se quedó');
    assert.equal(Q.ev('REGISTRO.expedicion'), undefined);
    assert.equal(Q.ev("$('f_documento').value"), '', 'la casilla siguió mostrando el número: «Continuar» lo volvería a tomar');
  });

  test('con la página fabricada: el número de las letras en una cédula de OTRO no borra nada', async () => {
    /* Con el código leído de María, el frente dice otro número: las letras no
       deciden de quién es la cédula (esDeOtraPersona solo mira el código). */
    const { P } = abrir({ resultados: { reverso: {}, frente: { documento: '79999999' } } });
    escanear(P, { cedula: CEDULA });
    await asentar();
    assert.equal(P.ev('FOTOS.cedula_leida.documento'), '52123456');
    assert.equal(P.ev("hayFotoLista('cedula_frente')"), true, 'las letras borraron el frente');
    assert.equal(P.ev('FOTOS.cedula_vista.numero_distinto'), true);
    assert.equal(P.ev('REGISTRO.documento'), '52123456');
  });

  test('lo que viaja a la base: nombres de casillas y un sí/no, nunca valores ni cedula_leida', async () => {
    const { P } = abrir({ resultados: { reverso: LEIDO_POR_LETRAS.reverso, frente: { documento: '52123465' } } });
    escanear(P, { cedula: CEDULA });
    await asentar();
    const r = JSON.parse(P.ev('JSON.stringify(resumenDeLaVista(FOTOS))'));
    assert.deepEqual(r, { fuente: 'ocr', version: O.VERSION, llenados: ['expedicion'], numero_distinto: true });
    /* La subida de verdad (subirArchivosRegistro) con la cola de la cuenta. */
    P.ev("SESION = { access_token: 'tok', user: { email: '573001112233@tugarantia.net' } };" +
         "window.__subio = null; rpcSesion = function (f, a) { window.__subio = a; return Promise.resolve({ ok: true, guardados: ['cedula_reverso','cedula_frente'] }); };" +
         "FOTOS.de = { celular: '3001112233', intento: REGISTRO.intento, t: Date.now() }; FOTOS.sensibles = true; REGISTRO.documento = '52123456';" +
         "guardarCola('3001112233', JSON.parse(JSON.stringify(Object.assign({}, FOTOS, { de: { celular: '3001112233', t: Date.now(), documento: '52123456' } }))));" +
         "REGISTRADO = { celular: '3001112233' };");
    await P.ev('subirArchivosRegistro()');
    const h = JSON.parse(P.ev('JSON.stringify(window.__subio && window.__subio.p_huella)'));
    assert.ok(h, 'no se llamó la subida');
    assert.deepEqual(h.cedula_vista, { fuente: 'ocr', version: O.VERSION, llenados: ['expedicion'], numero_distinto: true });
    assert.equal(h.cedula_leida.documento, '52123456', 'la lectura del código dejó de viajar');
    assert.ok(JSON.stringify(h.cedula_vista).indexOf('2003') < 0, 'un valor leído viajó en cedula_vista');
  });

  test('las franjas se recortan del lienzo, no la tarjeta: el respaldo entero nunca se copia', () => {
    const { P } = abrir();
    escanear(P, { soloRespaldo: true });
    const copiado = P.ev('window.__franjas');
    assert.ok(copiado > 0, 'no se recortó nada');
    assert.ok(copiado < 0.25 * 1000 * 631, 'se copió ' + copiado + ' px del respaldo: más que las dos franjas');
    /* Y el motor se empezó a bajar mientras la persona voltea la cédula. */
    const links = JSON.parse(P.ev('JSON.stringify(window.__links)'));
    assert.ok(links.some(l => /^prefetch \.\.\/app\/lib\/ocr\/spa\.traineddata\.gz$/.test(l)), 'el español no se pidió con prefetch');
    assert.ok(links.some(l => /^prefetch \.\.\/app\/lib\/ocr\/tesseract-core-(simd-)?lstm\.wasm\.js$/.test(l)));
  });
});

describe('5b. la página con el motor de verdad: de la foto a «Revisa tus datos»', () => {

  test('escanear las dos caras llena «Revisa tus datos» con lo impreso, y solo pide archivos del sitio', async (t) => {
    const b = abrirTesseract();
    try {
      const rev = CARTA('reverso'), fre = CARTA('frente');
      const { P } = abrir({ motor: b });
      P.ventana.__gris_reverso = rev.gris; P.ventana.__gris_frente = fre.gris;
      const t0 = Date.now();
      escanear(P, { grises: { reverso: rev, frente: fre } });
      for (let i = 0; i < 600 && P.ev('OCR_CEDULA.estado') === 'leyendo'; i++) await new Promise(r => setTimeout(r, 50));
      t.diagnostic('la página leyó las dos caras (motor incluido) en ' + (Date.now() - t0) + ' ms en esta máquina');
      assert.equal(P.ev('OCR_CEDULA.estado'), 'listo', 'la lectura no terminó');
      assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__scripts.filter(function (u) { return /ocr/.test(u); }))')),
        ['../app/ocr-cedula.js', '../app/ocr-cedula.js', '../app/lib/ocr/tesseract.min.js']);
      assert.equal(pasoActual(P), 'identidad');
      assert.equal(P.ev('REGISTRO.documento'), '52123456');
      assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
      assert.equal(P.ev('REGISTRO.nombres'), 'MARIA ALEJANDRA');
      assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20');
      assert.equal(P.ev('REGISTRO.nacimiento'), undefined, 'el nacimiento leído de las letras se guardó: solo sirve para revisar la expedición');
      assert.equal(P.ev("$('btnSeguir').textContent"), 'Están bien');
      const ajenos = b.pedidos.filter(u => !u.startsWith('https://tugarantia.net/app/lib/ocr/'));
      assert.deepEqual(ajenos, [], 'se pidió algo fuera de app/lib/ocr/');
      assert.equal(P.ev('OCR_CEDULA.lector'), null, 'el motor quedó vivo');
    } finally { await b.cerrar(); }
  });
});
