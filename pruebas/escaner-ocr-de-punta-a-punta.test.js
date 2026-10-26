'use strict';
/* ==========================================================================
 * DE LA CÁMARA A «ESTÁN BIEN», SIN TECLEAR NADA — 21 de octubre de 2026
 *
 *   node --test pruebas/escaner-ocr-de-punta-a-punta.test.js
 *
 * La integración del lote 1 juntó dos ramas que se escribieron a la vez:
 * l1-escaner (las dos caras de la cédula ACOSTADAS y la foto del MEJOR cuadro
 * de una ventana) y l1-ocr (las letras impresas llenan «Revisa tus datos»).
 * Cada una se probó con la otra de mentira: el escáner con un oyente que solo
 * anotaba, y las letras con recortarGuia, fotoDeLienzo y codigoEnRecorte
 * reemplazados y el respaldo de pie. Lo que ninguna podía ver es la COSTURA:
 * que las letras lean exactamente el recorte de la foto que se guardó, con su
 * giro, y que las franjas caigan en la tarjeta acostada. Si esa costura falla
 * no revienta nada: las casillas quedan vacías y la persona escribe, que es
 * justo lo que Joan pidió que no pasara.
 *
 * Aquí casi nada es de mentira:
 *   · play/index.html de verdad (pruebas/banco-play.js), su bucle del escáner
 *     de verdad (la puerta, la ventana del mejor cuadro, recortarGuia,
 *     leerCuadroDoc, leidaDoc, capturarDoc, fotoDeLienzo) y el enganche
 *     alTomarLaCedula;
 *   · ZXing de verdad (app/lib/zxing.min.js) leyendo un PDF417 fabricado
 *     (pruebas/fabrica-pdf417.js) con los datos de la cédula;
 *   · el Tesseract.js copiado en app/lib/ocr/, en un hilo (pruebas/banco-ocr.js),
 *     leyendo la cédula amarilla fabricada (pruebas/fabricar-cedula-ocr.py).
 * De mentira solo lo que el banco no tiene: la cámara (un cuadro de video 4K
 * vertical con la cédula ACOSTADA dentro del marco, como la pone la persona),
 * un lienzo que dibuja en grises (LIENZO EN GRISES, en pruebas/banco-camara.js),
 * el reloj y la carga de <script> (la red).
 *
 * Tres casos, los de la calle: el respaldo con el código legible, el respaldo
 * con el código borroso (ilegible: lo ve pero no lo lee) y el respaldo cabeza
 * abajo (giro 180: la foto se guarda derecha y las franjas se buscan en el
 * lugar espejado). En los tres la persona solo toca: «Autorizo y escaneo»,
 * voltea la cédula, «Están bien» (y, sin código, «Sí, es mía»).
 *
 * Ninguna cédula de nadie: los datos son inventados.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const O = require('../app/ocr-cedula.js');
const EC = require('../app/escaner-cedula.js');
const F = require('./fabrica-pdf417.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirTesseract, leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');

/* 21-oct-2026 (verificación del lote 1) — la cámara, el lienzo en grises y la
   página con su reloj viven en pruebas/banco-camara.js: la prueba de la
   cédula digital (la-digital-no-se-lee.test.js) usa la MISMA cámara. */
/* 26-oct-2026 — el marco va DE PIE y la página copia del video girando: las
   escenas se arman acostadas, como siempre, en el video ACOSTADO, y dePie las
   pone en el de verdad (ver EL VIDEO DE PIE, LOS PÍXELES ACOSTADOS). */
const { FOTOS_HECHAS, huella, crearLienzo, GUIA, TARJETA, VIDEO, ACOSTADO, escalar, abrirConCamara, dePie, acostada } = require('./banco-camara.js');

/* ==========================================================================
 * LA CÉDULA FABRICADA, PUESTA EN EL MARCO
 * Los recortes de pruebas/fabricar-cedula-ocr.py traen la tarjeta dentro de
 * su marco (GUIA: 60, 38, 1000 × 631 en 1120 × 708) con el aire de
 * margenDeLectura. Se ponen en el cuadro de video de modo que ESE marco caiga
 * sobre el marco del escáner: es lo que hace la persona.
 * ======================================================================== */
const CARTA = lado => leerPGM(path.join(__dirname, 'cedula-ocr-' + lado + '.pgm.gz'));
const PERSONA = { documento: '0052123456', apellido1: 'PEREZ', apellido2: 'GOMEZ', nombre1: 'MARIA',
                  nombre2: 'ALEJANDRA', sexo: 'F', nacimiento: '19850315', municipio: '11001', rh: 'O+' };

function girar180(img) {
  const g = new Uint8ClampedArray(img.gris.length);
  for (let i = 0; i < g.length; i++) g[i] = img.gris[g.length - 1 - i];
  return { gris: g, w: img.w, h: img.h };
}
/* LA FOTO Y LA HUELLA CON TEXTURA. En la cédula fabricada para las letras la
   foto del frente y la huella del respaldo son manchas lisas, y el escáner
   mide la nitidez como la mediana de mosaicos con algo que enfocar
   (EscanerCaptura.nitidezDeGris): con las manchas lisas y el borde de la
   tarjeta, la mediana caía en 4 (frente) y 18 (respaldo), bajo el piso de 35,
   y el escáner pedía «Aléjala…» para siempre. Una foto y una huella de verdad
   tienen grano en todas las direcciones; se les pone (puntos de 4 px, ±80),
   FUERA de las franjas de las letras (ZONAS), así que lo que se lee es la
   misma tarjeta. Que una tarjeta lisa no pase el piso es de la calibración
   del escáner con cédulas reales (22-oct), no de esta prueba.
   26-oct-2026 — GRANO DE 1 PX, no bloques de 4. Con el marco de pie el gris
   de 480 px muestrea el recorte a 4,9 px de video por píxel (antes 4,2), y
   los bloques de 4 px hacían un moiré: en el parche de la huella del
   respaldo salía la fila «de barras» más fuerte del gris (6 filas, que
   franjaDelCodigo descarta por corta y no sigue buscando), y la franja del
   PDF417 gastado dejaba de verse; medido: con bloques de 2 a 8 px pasa, con
   grano por píxel (±80, calidad 44 sobre el piso de 35) el código gana en
   las dos geometrías. Un grano de bloques no es grano de foto. */
function conTextura(img, lado) {
  const z = lado === 'frente' ? [0.035, 0.205, 0.275, 0.795] : [0.725, 0.07, 0.945, 0.54];
  let s = lado === 'frente' ? 7 : 9;
  const azar = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const x0 = Math.round(TARJETA.x + z[0] * TARJETA.w), x1 = Math.round(TARJETA.x + z[2] * TARJETA.w);
  const y0 = Math.round(TARJETA.y + z[1] * TARJETA.h), y1 = Math.round(TARJETA.y + z[3] * TARJETA.h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * img.w + x;
    img.gris[i] = Math.max(0, Math.min(255, img.gris[i] + (azar() - 0.5) * 160));
  }
  return img;
}
/**
 * El cuadro de video con un lado de la cédula en el marco.
 * @param guia   ESCDOC.guiaVideo (el marco del escáner, en píxeles del video)
 * @param lado   'reverso' | 'frente'
 * @param o      {codigo: 'legible' | 'borroso' | 'gastado', giro: 0 | 180,
 *               liso: sin la textura de la foto y la huella (como la demo
 *                 del 23-oct), desvaido: el contraste de la impresión (0..1)}
 *   23-oct-2026 — 'gastado': el PDF417 a 4 px por módulo y desenfocado 1,5
 *   módulos (6 px), el caso 7e de la verificación del autollenado: con la
 *   cámara enfocada el lector no lo lee, y sus mosaicos hunden la mediana
 *   de nitidez bajo el piso («Aléjala…» para siempre con ab6b595).
 *   26-oct-2026 — con el marco DE PIE (guia.vertical) la escena se arma en el
 *   video acostado con el marco acostado y se pone de pie al final: la
 *   cédula queda de pie con la cabeza a la derecha (la que sale derecha), y
 *   con `giro` 180, con la cabeza a la izquierda.
 */
/* El ancho del marco acostado del 21-oct en este banco (el 84 % del ancho del
   video 4K): la escala a la que se calibraron los códigos de estas escenas. */
const ANCHO_ACOSTADA_21_OCT = 1814;
function cuadroDeVideo(guia, lado, o) {
  const x = o || {};
  const dePieEnElVideo = guia.vertical === true, V = dePieEnElVideo ? ACOSTADO : VIDEO;
  guia = acostada(guia);
  const k = guia.w / GUIA.w;
  let img = escalar(x.liso ? CARTA(lado) : conTextura(CARTA(lado), lado), k);
  if (x.desvaido) for (let i = 0; i < img.gris.length; i++) img.gris[i] = 200 + (img.gris[i] - 200) * x.desvaido;
  if (lado === 'reverso') {
    /* El código de barras: el fabricado son barras al azar (no es un PDF417);
       aquí va uno de verdad con los datos de la persona, en la franja de abajo
       de la tarjeta, ya a la escala del video (3 px por módulo: lo que da 4K
       con la cédula acostada). Borroso (σ 3
       px) el lector lo ve —su patrón— pero no lo lee: la cédula gastada, o el
       enfoque que no engancha.
       26-oct-2026 — el código ESCALA con la tarjeta: 3 px por módulo era lo
       que daba 4K con la cédula acostada al 84 % del ancho (1814 px en este
       banco); de pie al 55 % del largo son 2110 px, 3,5 por módulo. Un código
       de píxeles fijos en una tarjeta más grande sería una cédula con el
       código encogido, que no existe. El GASTADO escala tal cual (4,65 px por
       módulo, σ 7: lo que se mira es su franja). El LEGIBLE va a módulos
       ENTEROS, los 3 px del 21-oct (medido: a 3,4895 px por módulo, girado
       180°, el detector de ZXing devolvía «no_hay» en el cuadro nítido, y a
       3,489 leía: la fábrica a escala fraccionaria deja bordes a medias que
       el detector no reconoce en una de las dos orientaciones; eso es de la
       fábrica, no de la cámara). A 3 px la prueba es conservadora: lo que
       lee a 3 lee a 3,5. El BORROSO (σ de un módulo: se ve, no se lee) escala
       tal cual, como el gastado: con el código de 3 px en la tarjeta de hoy,
       más grande, la puerta de 96 px lo veía «borrosa» (el código es lo que
       más bordes le pone a esta tarjeta fabricada), y a 3,5 con σ 3,5 pasa. */
    const t = { x: Math.round(TARJETA.x * k), y: Math.round(TARJETA.y * k), w: Math.round(TARJETA.w * k), h: Math.round(TARJETA.h * k) };
    const y0 = t.y + Math.round(t.h * 0.66), y1 = t.y + Math.round(t.h * 0.985);
    for (let yy = y0; yy < y1; yy++) for (let xx = t.x + Math.round(t.w * 0.02); xx < t.x + Math.round(t.w * 0.98); xx++) img.gris[yy * img.w + xx] = 222;
    const cod = F.fabricar(F.registroCedula(PERSONA), 20, 4);
    const e = guia.w / ANCHO_ACOSTADA_21_OCT, pxm = Math.max(3, Math.floor(3 * e));
    const r = x.codigo === 'gastado' ? F.render(cod, 4 * e, 6 * e, 4, { quieta: 4 })
      : x.codigo === 'borroso' ? F.render(cod, 3 * e, 3 * e, 4, { quieta: 4 })
      : F.render(cod, pxm, 0, 4, { quieta: 4 });
    const bx = t.x + Math.round((t.w - r.W) / 2), by = t.y + Math.round(t.h * 0.975) - r.H;
    for (let yy = 0; yy < r.H; yy++) for (let xx = 0; xx < r.W; xx++) img.gris[(by + yy) * img.w + bx + xx] = r.lum[yy * r.W + xx];
  }
  /* Dónde cae el marco fabricado dentro de la imagen (girada, en el lugar
     espejado), para ponerlo sobre el del escáner. */
  let gx = Math.round(GUIA.x * k), gy = Math.round(GUIA.y * k);
  if (x.giro === 180) { img = girar180(img); gx = img.w - gx - guia.w; gy = img.h - gy - guia.h; }
  const px = new Uint8ClampedArray(V.W * V.H).fill(VIDEO.MESA);
  const ox = guia.x - gx, oy = guia.y - gy;
  for (let yy = 0; yy < img.h; yy++) {
    const Y = oy + yy; if (Y < 0 || Y >= V.H) continue;
    for (let xx = 0; xx < img.w; xx++) {
      const X = ox + xx; if (X < 0 || X >= V.W) continue;
      px[Y * V.W + X] = img.gris[yy * img.w + xx];
    }
  }
  return dePieEnElVideo ? dePie(px, V.W, V.H) : px;
}

/* EL ENFOQUE QUE BUSCA. La cámara de un teléfono no da diez cuadros iguales:
   salen casi todos un poco borrosos y alguno nítido. Aquí el cuarto cuadro
   que el escáner mira de cada lado es el nítido y los demás, el mismo con un
   desenfoque de caja de 5 px. Así la foto buena NO es la del instante del
   disparo (la ventana se cierra con uno borroso a la vista), y la prueba puede
   decir si las letras leyeron la foto que se guardó o el cuadro de ahora. */
function desenfocado(px, guia, radio) {
  const x0 = Math.max(0, guia.x - Math.round(guia.w * 0.1)), x1 = Math.min(VIDEO.W, guia.x + Math.round(guia.w * 1.1));
  const y0 = Math.max(0, guia.y - Math.round(guia.h * 0.1)), y1 = Math.min(VIDEO.H, guia.y + Math.round(guia.h * 1.1));
  const t = Uint8ClampedArray.from(px), o = Uint8ClampedArray.from(px), R = radio || 2;
  for (let y = y0; y < y1; y++) for (let x = x0 + R; x < x1 - R; x++) {
    let s = 0; for (let d = -R; d <= R; d++) s += px[y * VIDEO.W + x + d];
    t[y * VIDEO.W + x] = s / (2 * R + 1);
  }
  for (let y = y0 + R; y < y1 - R; y++) for (let x = x0; x < x1; x++) {
    let s = 0; for (let d = -R; d <= R; d++) s += t[(y + d) * VIDEO.W + x];
    o[y * VIDEO.W + x] = s / (2 * R + 1);
  }
  return o;
}
const CUADRO_NITIDO = 3;
/* La huella del recorte que recortarGuia saca de un cuadro: el marco con su
   aire (EC.margenDeLectura), a 1:1. Dice de qué cuadro salió una foto.
   26-oct-2026 — con el marco de pie el recorte sale ACOSTADO (play/,
   dibujarAcostado: 90° en contra del reloj, el lado derecho arriba): la
   misma región del video, girada igual. */
function huellaDelRecorte(px, guia) {
  const m = EC.margenDeLectura(guia, VIDEO.W, VIDEO.H, 0.06);
  if (guia.vertical === true) {
    const W = m.h, H = m.w, o = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = px[(m.y + x) * VIDEO.W + (m.x + m.w - 1 - y)];
    return huella(o);
  }
  const o = new Uint8ClampedArray(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) o[y * m.w + x] = px[(m.y + y) * VIDEO.W + m.x + x];
  return huella(o);
}

/* ==========================================================================
 * LA PÁGINA, CON CÁMARA, RELOJ Y LETRAS
 * ======================================================================== */
function abrir(motor) { return abrirConCamara({ motor }); }
const paso = P => P.ev('PASOS[PASO] && PASOS[PASO].id');
/* El navegador pinta las casillas con el value= que la página escribió; el
   banco no convierte innerHTML en elementos, así que se copia aquí. No es
   teclear: es lo que la persona VE en «Revisa tus datos». */
function pintarCasillas(P) {
  const h = P.ev("$('cuerpo').innerHTML");
  const vistos = {};
  for (const m of h.matchAll(/<input[^>]*\bid="f_([a-z_]+)"[^>]*>/g)) {
    const v = /\bvalue="([^"]*)"/.exec(m[0]);
    vistos[m[1]] = v ? v[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
  }
  for (const m of h.matchAll(/<select[^>]*\bid="f_([a-z_]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const s = /<option value="([^"]*)"[^>]*\bselected\b/.exec(m[2]);
    vistos[m[1]] = s ? s[1] : '';
  }
  P.ventana.__vistos = vistos;
  /* Lo que la página ya escribió en una casilla DESPUÉS de pintarla (las letras
     que terminan con el paso a la vista) gana: así pasa en el navegador. */
  P.ev("Object.keys(window.__vistos).forEach(function (k) { var e = $('f_' + k); if (!e.value) e.value = window.__vistos[k]; });");
  return vistos;
}

/**
 * La persona escanea las dos caras. Devuelve lo que pasó en el camino.
 * @param o {codigo: 'legible' | 'borroso', giro: 0 | 180 (el respaldo),
 *           giroFrente: 0 | 180 (26-oct-2026: el frente con la cabeza a la
 *           izquierda, que sale cabeza abajo y lo enderezan las letras)}
 */
async function escanearLasDosCaras(E, o) {
  const { P, video, correr } = E;
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  assert.equal(P.ev('ESCDOC.lado'), 'reverso');
  /* Primer cuadro: la mesa. El escáner calcula su marco; la persona pone la
     cédula DE PIE dentro (26-oct-2026; antes acostada). */
  await correr(150);
  const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  assert.ok(guia && guia.vertical === true && guia.h > guia.w, 'el marco del respaldo no está de pie: ' + JSON.stringify(guia));
  /* El 55 % del lado largo del video: ~11,7 cm, donde la cámara enfoca (la
     cuenta en EC.rectanguloGuia). Ni el 84 % del 8-oct (7,7 cm) ni menos. */
  assert.ok(guia.h / VIDEO.H > 0.5 && guia.h / VIDEO.H < 0.6, 'el marco de pie no llena ~55 % del largo del video: ' + (guia.h / VIDEO.H));
  const verLado = async (lado, op) => {
    /* 26-oct-2026 — la caja del desenfoque, de 7 px (R 3) y no de 5: con el
       código a 3,5 px por módulo (lo que gana la cédula de pie) el lector
       leía a través de la caja de 5 y disparaba con un cuadro borroso, y la
       prueba dejaba de probar que la foto es la del MEJOR cuadro. */
    const nitido = cuadroDeVideo(guia, lado, op), borroso = desenfocado(nitido, guia, 3);
    let mirados = 0;
    for (let i = 0; i < 80 && !P.ev('FOTOS.cedula_' + lado); i++) {
      /* Solo cuentan los cuadros que el escáner mira de ESTE lado (entre un
         lado y otro hay segundo y medio de «¡Leída!» con el bucle quieto). */
      const mira = P.ev('ESCDOC.activo') && P.ev('ESCDOC.lado') === lado;
      video.__px = (mira && mirados === CUADRO_NITIDO) ? nitido : borroso;
      if (mira) mirados++;
      await correr(100);
    }
    return { nitido: huellaDelRecorte(nitido, guia), borroso: huellaDelRecorte(borroso, guia) };
  };
  const vr = await verLado('reverso', o);
  assert.ok(P.ev('FOTOS.cedula_reverso'), 'el escáner no disparó el respaldo: ' + P.ev("$('docEstado').textContent"));
  const respaldo = { cuadros: vr,
    leida: P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'),
    listo: P.ev("$('docListoTxt').textContent"),
    foto: P.ev('FOTOS.cedula_reverso'),
    pendiente: P.ev('!!OCR_CEDULA.pendientes.reverso')
  };
  /* La voltea: el frente, de pie en el mismo marco. */
  const vf = await verLado('frente', { giro: o.giroFrente || 0 });
  assert.ok(P.ev('FOTOS.cedula_frente'), 'el escáner no disparó el frente: ' + P.ev("$('docEstado').textContent"));
  /* 26-oct-2026 — recién tomado de pie, el frente queda «en duda» hasta que
     sus letras digan si salió derecho (EL FRENTE SE ENDEREZA POR SUS LETRAS). */
  const frente = { cuadros: vf, foto: P.ev('FOTOS.cedula_frente'), fotoAntes: P.ev('FOTOS.cedula_frente'), marcaAntes: P.ev('giroDelFrente()') };
  /* «Listo: las dos caras.» y, solo, a «Revisa tus datos». */
  await correr(1600);
  assert.equal(paso(P), 'identidad', 'con las dos caras no pasó solo a «Revisa tus datos»');
  assert.equal(P.ev('!!ESCDOC.stream'), false, 'la cámara siguió encendida');
  const casillas = pintarCasillas(P);
  /* Las letras se leen con la cámara apagada, con el motor de verdad. */
  for (let i = 0; i < 800 && P.ev('OCR_CEDULA.estado') === 'leyendo'; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(P.ev('OCR_CEDULA.estado'), 'listo', 'la lectura de las letras no terminó');
  /* Y lo que las letras hicieron con la foto del frente (girarla es volver a
     cargarla: un paso más del reloj de Node). */
  await asentar(4);
  frente.foto = P.ev('FOTOS.cedula_frente'); frente.marca = P.ev('giroDelFrente()');
  return { respaldo, frente, casillas };
}

/* Las letras se leyeron del MISMO recorte del que salió la foto guardada de
   ese lado, con su giro, y con el marco anotado al dibujar ese cuadro. */
function mismoRecorte(E, lado, cara, giro) {
  const r = E.recortes.filter(x => x.lado === lado).pop();
  assert.ok(r, 'las letras del ' + lado + ' no recortaron nada');
  const hecha = FOTOS_HECHAS.get(cara.foto);
  assert.ok(hecha, 'la foto del ' + lado + ' no salió de un lienzo');
  /* La foto es la del cuadro NÍTIDO (el mejor de la ventana), no la del
     borroso que estaba a la vista al disparar. */
  assert.equal(hecha.origen, cara.cuadros.nitido, 'la foto del ' + lado + ' no es la del cuadro más nítido' +
    (hecha.origen === cara.cuadros.borroso ? ' (es la del borroso)' : ''));
  assert.equal(r.huella, hecha.origen, 'las letras del ' + lado + ' no leyeron el recorte de la foto guardada');
  assert.equal(r.giro, giro, 'las letras del ' + lado + ' no usaron el giro de la foto');
  assert.ok(r.W > r.H, 'el recorte del ' + lado + ' no está acostado');
  /* El marco: el del escáner, dentro del recorte con su aire (6 %). */
  assert.ok(r.guia, 'las letras del ' + lado + ' no recibieron el marco del cuadro');
  assert.ok(Math.abs(r.guia.x / r.guia.w - 0.06) < 0.01 && Math.abs(r.guia.y / r.guia.h - 0.06) < 0.01,
    'el marco del ' + lado + ' no cae donde lo dejó recortarGuia: ' + JSON.stringify(r.guia));
  return r;
}

describe('de la cámara a «Están bien», sin teclear nada (la cédula DE PIE en el marco, el escáner y las letras de verdad)', () => {

  test('con el código de barras LEGIBLE: el código pone los datos, las letras la expedición, y «Están bien» pasa', async (t) => {
    const b = abrirTesseract();
    try {
      const E = abrir(b);
      const t0 = Date.now();
      const r = await escanearLasDosCaras(E, { codigo: 'legible' });
      const { P } = E;
      t.diagnostic('de «Autorizo» a «Revisa tus datos» lleno: ' + (Date.now() - t0) + ' ms en esta máquina');
      assert.equal(r.respaldo.leida, true, 'el escáner no leyó el PDF417: ' + r.respaldo.listo);
      assert.match(r.respaldo.listo, /¡Leída, MARIA!/);
      mismoRecorte(E, 'reverso', r.respaldo, 0);
      mismoRecorte(E, 'frente', r.frente, 0);
      /* 26-oct-2026 — el frente de pie con la cabeza a la derecha salió
         derecho: las letras lo confirman (la marca pasa de «incierto» a
         «letras») y la foto no se toca. */
      assert.equal(r.frente.marcaAntes, 'incierto', 'el frente tomado de pie no quedó en duda hasta que las letras hablaran');
      assert.equal(r.frente.marca, 'letras', 'las letras no confirmaron el giro del frente');
      assert.equal(r.frente.foto, r.frente.fotoAntes, 'la foto del frente derecho se tocó');
      /* El código manda: número, nombres, apellidos. Las letras: la expedición. */
      assert.equal(P.ev('REGISTRO.documento'), '52123456');
      assert.equal(P.ev('REGISTRO.nombres'), 'MARIA ALEJANDRA');
      assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
      assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20', 'las letras del respaldo no llenaron la expedición');
      assert.equal(P.ev("$('f_expedicion').value"), '2003-04-20', 'la casilla de la expedición quedó vacía en pantalla');
      assert.equal(P.ev("$('leido_expedicion').textContent"), '· leído de tu cédula · revísalo');
      assert.match(P.ev("$('ayudaExpedicion').textContent"), /La leímos del respaldo de tu cédula/);
      assert.equal(P.ev('FOTOS.cedula_vista.numero_distinto'), false, 'el número impreso y el del código son el mismo');
      /* El toque que confirma, y pasa. */
      assert.equal(P.ev("$('btnSeguir').textContent"), 'Están bien');
      P.ev('siguientePaso()');
      assert.notEqual(paso(P), 'identidad', 'con «Están bien» no pasó: ' + P.ev("$('errReg').innerHTML"));
      assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20');
      assert.equal(P.ev('REGISTRO.documento'), '52123456');
    } finally { await b.cerrar(); }
  });

  test('con el código de barras BORROSO (lo ve, no lo lee): las letras llenan todo, «Están bien» y «Sí, es mía»', async () => {
    const b = abrirTesseract();
    try {
      const E = abrir(b);
      const r = await escanearLasDosCaras(E, { codigo: 'borroso' });
      const { P } = E;
      assert.equal(r.respaldo.leida, false, 'el código borroso se leyó: la prueba no prueba el caso');
      assert.equal(r.respaldo.pendiente, true, 'el respaldo sin código no dejó sus franjas');
      assert.match(r.respaldo.listo, /te llenamos lo que alcancemos a leer de las letras/);
      mismoRecorte(E, 'reverso', r.respaldo, 0);
      mismoRecorte(E, 'frente', r.frente, 0);
      assert.equal(P.ev('FOTOS.cedula_leida'), undefined, 'las letras escribieron la cédula leída');
      assert.equal(P.ev('REGISTRO.documento'), '52123456');
      assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
      assert.equal(P.ev('REGISTRO.nombres'), 'MARIA ALEJANDRA');
      assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20');
      assert.equal(P.ev('REGISTRO.tipo_doc'), 'Cédula de ciudadanía');
      ['documento', 'apellidos', 'nombres', 'expedicion'].forEach(c =>
        assert.equal(P.ev("$('f_" + c + "').value"), P.ev('REGISTRO.' + c), 'la casilla ' + c + ' no muestra lo leído'));
      assert.equal(P.ev("$('f_tipo_doc').value"), 'Cédula de ciudadanía');
      assert.match(P.ev("$('notaFoto').innerHTML"), /Leímos de las fotos de tu cédula/);
      assert.equal(P.ev("$('btnSeguir').textContent"), 'Están bien');
      /* «Están bien» y, sin código, el «¿Es tuya?» de siempre: un toque más. */
      P.ev('siguientePaso()');
      assert.equal(paso(P), 'identidad');
      assert.match(P.ev("$('errReg').innerHTML"), /id="btnCedulaEsMia"[^>]*onclick="confirmarCedulaSinLectura\(\)"/);
      P.ev('confirmarCedulaSinLectura()');
      assert.notEqual(paso(P), 'identidad', '«Sí, es mía» no pasó');
      assert.equal(P.ev('REGISTRO.nombres'), 'MARIA ALEJANDRA');
    } finally { await b.cerrar(); }
  });

  test('con el respaldo CABEZA ABAJO: la foto se guarda derecha y las letras se leen con el giro (180°)', async () => {
    const b = abrirTesseract();
    try {
      const E = abrir(b);
      const r = await escanearLasDosCaras(E, { codigo: 'legible', giro: 180 });
      const { P } = E;
      const hechaR = FOTOS_HECHAS.get(r.respaldo.foto);
      assert.equal(r.respaldo.leida, true, 'el respaldo cabeza abajo no se leyó: ' + r.respaldo.listo + ' · la foto es del cuadro ' +
        (hechaR && hechaR.origen === r.respaldo.cuadros.nitido ? 'NÍTIDO' : hechaR && hechaR.origen === r.respaldo.cuadros.borroso ? 'BORROSO' : 'desconocido') +
        ' · ' + P.ev('JSON.stringify({ tipo: tipoDelRespaldo(), resolucion: ESCDOC.resolucion })'));
      mismoRecorte(E, 'reverso', r.respaldo, 180);
      /* La foto guardada, derecha: el código de barras ABAJO. 26-oct-2026 —
         se mide por las barras (cuánto cambia el gris a lo ancho), no por la
         media de gris: con la cédula de pie el código ocupa menos de la
         tarjeta y la media ya no lo distinguía. */
      const f = FOTOS_HECHAS.get(r.respaldo.foto);
      const barras = (y0, y1) => { let s = 0, n = 0; for (let y = Math.floor(f.H * y0); y < f.H * y1; y++) for (let x = Math.floor(f.W * 0.1); x < f.W * 0.9 - 1; x++) { s += Math.abs(f.px[y * f.W + x + 1] - f.px[y * f.W + x]); n++; } return s / n; };
      assert.ok(barras(0.7, 0.95) > 2 * barras(0.05, 0.3), 'la foto del respaldo se guardó cabeza abajo (barras abajo ' + barras(0.7, 0.95).toFixed(1) + ', arriba ' + barras(0.05, 0.3).toFixed(1) + ')');
      assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20', 'con el giro, las letras no encontraron la expedición');
      assert.equal(P.ev("$('btnSeguir').textContent"), 'Están bien');
      P.ev('siguientePaso()');
      assert.notEqual(paso(P), 'identidad');
    } finally { await b.cerrar(); }
  });

  /* 26-oct-2026 — EL FRENTE DE PIE CON LA CABEZA A LA IZQUIERDA. Con el marco
     de pie la mitad de la gente lo pone así, y el recorte acostado sale cabeza
     abajo. El frente no tiene código que lo diga: lo dicen sus letras
     (OcrCedula.leerRecorte, `giro`), y la foto guardada se gira ANTES de que
     suba (play/, EL FRENTE SE ENDEREZA POR SUS LETRAS). */
  test('con el FRENTE CABEZA ABAJO: las letras lo leen girado, llenan igual, y la foto guardada se endereza antes de subir', async () => {
    const b = abrirTesseract();
    try {
      const E = abrir(b);
      const r = await escanearLasDosCaras(E, { codigo: 'borroso', giroFrente: 180 });
      const { P } = E;
      assert.equal(r.respaldo.leida, false, 'el código borroso se leyó: la prueba no prueba que el número venga de las letras');
      /* Las letras del frente cabeza abajo llenan lo mismo que derechas. */
      assert.equal(P.ev('REGISTRO.documento'), '52123456', 'el número no salió del frente cabeza abajo');
      assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
      assert.equal(P.ev('REGISTRO.nombres'), 'MARIA ALEJANDRA');
      assert.equal(P.ev('REGISTRO.expedicion'), '2003-04-20');
      /* La foto: la de antes, girada 180° exacta (fotoDeLienzo sobre la de
         900 px), y la marca dice que las letras ya hablaron. */
      assert.equal(r.frente.marcaAntes, 'incierto');
      assert.equal(r.frente.marca, 'letras', 'la marca del frente no quedó en «letras»');
      assert.notEqual(r.frente.foto, r.frente.fotoAntes, 'la foto del frente cabeza abajo no se giró');
      const antes = FOTOS_HECHAS.get(r.frente.fotoAntes), despues = FOTOS_HECHAS.get(r.frente.foto);
      assert.ok(antes && despues, 'las fotos del frente no salieron de un lienzo');
      assert.deepEqual([despues.W, despues.H], [antes.W, antes.H], 'girar 180° cambió las medidas');
      let difs = 0;
      for (let i = 0, n = antes.px.length; i < n; i++) if (despues.px[i] !== antes.px[n - 1 - i]) difs++;
      assert.equal(difs, 0, 'la foto enderezada no es la de antes girada 180°');
      /* Derecha de verdad: la foto de la persona (la mancha oscura con grano)
         queda a la IZQUIERDA, como en la cédula amarilla. */
      const media = (x0, x1) => { let s = 0, n = 0; for (let y = Math.floor(despues.H * 0.25); y < despues.H * 0.75; y++) for (let x = Math.floor(despues.W * x0); x < despues.W * x1; x++) { s += despues.px[y * despues.W + x]; n++; } return s / n; };
      assert.ok(media(0.06, 0.26) < media(0.74, 0.94) - 10, 'la foto de la persona no quedó a la izquierda: sigue cabeza abajo');
      /* Lo que sube lleva la marca con la foto (giroDelFrente la ata por su
         firma): «letras», no «incierto». Lo que la huella hace con eso lo
         prueba pruebas/el-marco-de-pie.test.js. */
      assert.equal(P.ev("giroDelFrente(FOTOS)"), 'letras');
    } finally { await b.cerrar(); }
  });
});

/* ==========================================================================
 * EL OYENTE, PIEZA POR PIEZA (sin motor): lo que la costura decide sola.
 * ======================================================================== */
function oyente() {
  const P = abrirPlay({ hash: '#registro' });
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  const recortes = [];
  P.ventana.OcrCedula = Object.assign({}, O, {
    recortarDeLienzo(lado, lienzo, op) {
      recortes.push({ lado, giro: op && op.giro, guia: op && op.guia ? Object.assign({}, op.guia) : null });
      return O.recortarDeLienzo(lado, lienzo, op);
    }
  });
  /* El recorte del escáner (1120 × 708, como el fabricado) con su marco
     anotado, y un marco de AHORA distinto: el que se recalcularía. */
  P.ventana.__lienzo = crearLienzo();
  P.ev('__lienzo.width = 1120; __lienzo.height = 708; ESCDOC.recorte = __lienzo;' +
       'ESCDOC.marcoEnRecorte = { x: 60, y: 38, w: 1000, h: 631 };' +
       "$('docVideo').videoWidth = 2160; $('docVideo').videoHeight = 3840; ESCDOC.guiaVideo = { x: 300, y: 1500, w: 1500, h: 946 };");
  return { P, recortes };
}
const pendiente = (P, lado) => P.ev('!!OCR_CEDULA.pendientes.' + lado);

/* 21-oct-2026 (verificación del lote 1, R1) — las letras solo se leen con la
   amarilla PROBADA y anotada con la foto (FOTOS.cedula_reverso_tipo): aquí se
   anota como lo hacen leidaDoc y capturarDoc antes de avisar. */
const amarilla = (P, foto) => P.ev("FOTOS.cedula_reverso = '" + foto + "'; anotarTipoDelRespaldo('amarilla');");

describe('el oyente de las letras (ocrAlTomarLaCedula), sin motor', () => {

  test('lee el lienzo de la foto con SU giro y SU marco (el anotado al dibujar), no uno recalculado', () => {
    const { P, recortes } = oyente();
    amarilla(P, 'R1');
    P.ev("avisarCedulaTomada('reverso', __lienzo, 180, { leida: true, automatica: true });");
    assert.equal(pendiente(P, 'reverso'), true, 'el respaldo no dejó sus franjas');
    assert.deepEqual(recortes, [{ lado: 'reverso', giro: 180, guia: { x: 60, y: 38, w: 1000, h: 631 } }]);
    /* Sin marco anotado (otro lienzo), el calculado; y si no cabe, ninguno. */
    P.ev("ESCDOC.marcoEnRecorte = null; avisarCedulaTomada('reverso', __lienzo, 0, {});");
    assert.equal(recortes[1].guia, null, 'usó un marco que no cabe en el recorte');
  });

  test('la cédula DIGITAL (su respaldo se tomó por el QR) no se lee con las franjas de la amarilla, ni su frente', () => {
    const { P, recortes } = oyente();
    P.ev("FOTOS.cedula_reverso = 'DIGITAL'; anotarTipoDelRespaldo('digital'); avisarCedulaTomada('reverso', __lienzo, null, { qr: true, automatica: true });");
    assert.equal(pendiente(P, 'reverso'), false);
    P.ev("FOTOS.cedula_frente = 'F1'; avisarCedulaTomada('frente', __lienzo, null, { automatica: true });");
    assert.equal(pendiente(P, 'frente'), false, 'el frente de la digital (con el RH y el sexo) pasó por las franjas');
    assert.equal(recortes.length, 0, 'se recortó algo de la digital');
    /* Un respaldo NUEVO: la marca era de la foto de antes, y no le sirve a
       esta para nada — ni como digital ni como amarilla.
       26-oct-2026 — y sin marca ('') SE LEE: la regla nueva lee salvo con la
       digital probada (antes exigía la amarilla probada, y dejaba sin letras
       a la amarilla gastada). Con la amarilla probada, igual que siempre. */
    P.ev("FOTOS.cedula_reverso = 'AMARILLA'; avisarCedulaTomada('frente', __lienzo, null, {});");
    assert.equal(P.ev('tipoDelRespaldo()'), '', 'la marca de la foto de antes se quedó pegada a un respaldo que ya no es el suyo');
    assert.equal(pendiente(P, 'frente'), true, 'con el respaldo desconocido no se intentó leer el frente');
    P.ev("delete OCR_CEDULA.pendientes.frente;");
    amarilla(P, 'AMARILLA');
    P.ev("avisarCedulaTomada('frente', __lienzo, null, {});");
    assert.equal(pendiente(P, 'frente'), true, 'con la amarilla probada el frente no se leyó');
  });

  test('un frente guardado a la fuerza no se lee como frente, y suelta lo del anterior; de través no se lee', () => {
    const { P } = oyente();
    amarilla(P, 'R0');
    P.ev("FOTOS.cedula_frente = 'F1'; avisarCedulaTomada('frente', __lienzo, null, {});");
    assert.equal(pendiente(P, 'frente'), true);
    P.ev("FOTOS.cedula_frente = 'F2'; avisarCedulaTomada('frente', __lienzo, null, { forzada: true });");
    assert.equal(pendiente(P, 'frente'), false, 'un frente con un código a la vista se iba a leer como frente');
    P.ev("FOTOS.cedula_reverso = 'R1'; avisarCedulaTomada('reverso', __lienzo, 90, {});");
    assert.equal(pendiente(P, 'reverso'), false, 'una tarjeta de través se iba a leer con las franjas de la acostada');
  });
});

/* ==========================================================================
 * LA CÉDULA DIFÍCIL, CON EL ESCÁNER DE VERDAD — 23 de octubre de 2026
 *
 * Los dos casos de la verificación del autollenado y de la demo de ese día
 * que el escáner no tomaba nunca, ahora con la página, ZXing y los píxeles de
 * verdad (sin el motor de las letras: lo que se prueba es la cámara):
 *   · el respaldo con el PDF417 MUY gastado y la cámara enfocada (el caso
 *     7e): «Aléjala…» para siempre, «¿Tu cédula es la nueva…?» a los 12 s;
 *   · el frente liso y desvaído: la puerta de 96 px no lo dejaba ponerse en
 *     verde. Y el mismo frente DESENFOCADO no se toma (la ventana lo juzga).
 * FALLAN con ab6b595, salvo la marcada CENTINELA.
 * ======================================================================== */
describe('la cédula difícil, con el escáner de verdad', () => {
  /* Enciende el escáner en `lado`, pone `px` delante (o lo que devuelva para
     cada cuadro) y mira hasta `max` cuadros. Devuelve los letreros vistos. */
  async function mirar(lado, cuadro, max) {
    const E = abrirConCamara();
    const { P, video, correr } = E;
    P.ev('autorizarYEscanear()');
    await asentar();
    assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
    if (lado === 'frente') P.ev("ESCDOC.lado = 'frente'; reiniciarCuentaDoc();");
    await correr(150);
    const guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
    const px = cuadro(guia);
    video.__px = px;
    const letreros = new Set(), verdes = [];
    for (let i = 0; i < max && !P.ev('FOTOS.cedula_' + lado); i++) {
      await correr(100);
      letreros.add(P.ev("$('docEstado').textContent"));
      const n = P.ev("$('docNota').textContent"); if (n) letreros.add('NOTA: ' + n);
      verdes.push(P.ev('!!(ESCDOC.ventana)'));
    }
    return { E, P, letreros: [...letreros], verde: verdes.some(Boolean) };
  }

  test('el PDF417 MUY gastado con la cámara enfocada: el respaldo se toma solo, sin «voltéala» y sin sugerirle la cédula digital', async (t) => {
    const r = await mirar('reverso', guia => cuadroDeVideo(guia, 'reverso', { codigo: 'gastado' }), 150);
    const { P } = r;
    t.diagnostic('lo que dijo: ' + r.letreros.join(' | ') + ' · ' + P.ev('ESCDOC.msVerde') + ' ms en verde · ' + P.ev('JSON.stringify({ vioCodigo: ESCDOC.vioCodigo, vioFranja: ESCDOC.vioFranja, vioBarras: ESCDOC.vioBarras, ilegibles: ESCDOC.ilegibles, lecturas: ESCDOC.lecturas, tipo: tipoDelRespaldo() })'));
    assert.ok(P.ev('FOTOS.cedula_reverso'), 'el respaldo gastado no se tomó en 15 s: ' + r.letreros.join(' | '));
    assert.equal(P.ev('!!(FOTOS.cedula_leida && FOTOS.cedula_leida.documento)'), false, 'el código gastado se leyó: la prueba no prueba el caso');
    assert.equal(r.letreros.some(t => /volt[ée]ala/i.test(t)), false, 'le pidió voltear la cédula con el respaldo en el marco: ' + r.letreros.join(' | '));
    assert.equal(r.letreros.some(t => /la nueva, gris/.test(t)), false, 'le sugirió la cédula digital a una amarilla: ' + r.letreros.join(' | '));
    assert.match(P.ev("$('docListoTxt').textContent"), /El código no se pudo leer/);
  });

  test('el frente liso y desvaído, enfocado: se pone en verde y se toma solo', async (t) => {
    const r = await mirar('frente', guia => cuadroDeVideo(guia, 'frente', { liso: true, desvaido: 0.8 }), 60);
    t.diagnostic('lo que dijo: ' + r.letreros.join(' | '));
    assert.ok(r.verde, 'el frente liso nunca se puso en verde: ' + r.letreros.join(' | '));
    assert.ok(r.P.ev('FOTOS.cedula_frente'), 'el frente liso no se tomó solo: ' + r.letreros.join(' | '));
  });

  test('CENTINELA (sin aceptar borrosas): el mismo frente DESENFOCADO no se toma, y pide alejarla', async (t) => {
    const r = await mirar('frente', guia => desenfocado(cuadroDeVideo(guia, 'frente', { liso: true, desvaido: 0.8 }), guia, 6), 40);
    t.diagnostic('lo que dijo: ' + r.letreros.join(' | '));
    assert.equal(r.P.ev('FOTOS.cedula_frente'), undefined, 'tomó un frente desenfocado: ' + r.letreros.join(' | '));
    assert.ok(r.letreros.some(t => /Aléjala/.test(t)), r.letreros.join(' | '));
  });
});
