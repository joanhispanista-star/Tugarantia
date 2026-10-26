'use strict';
/* ==========================================================================
 * EL MARCO DE PIE, EL RECORTE ACOSTADO — 26 de octubre de 2026
 *
 *   node --test pruebas/el-marco-de-pie.test.js
 *
 * Joan, probando en el iPhone el 26-oct: «me pide escanear de esta forma
 * horizontal lo cual me hace alejarme más de la cédula para que se vea toda,
 * no entiendo porque hay que tomar la foto con ese escáner horizontal en una
 * pantalla vertical». El marco vuelve a ser VERTICAL en las dos caras, pero
 * no como el 8-oct (llenando el video: 7,7 cm, fuera de foco) sino llenando
 * la CAJA (11,7 cm). Y todo lo que mira píxeles sigue viendo la cédula
 * ACOSTADA, porque la página gira al copiar del video (play/, EL MARCO DE
 * PIE, EL RECORTE ACOSTADO).
 *
 * Lo que se fija aquí, con la página de verdad delante de la cámara de
 * mentira (pruebas/banco-camara.js):
 *   · el marco va de pie en el video, al 55 % del largo, y el letrero lo dice;
 *   · el recorte sale acostado, píxel a píxel igual que si la cédula hubiera
 *     estado acostada en un marco acostado, con su marco anotado (6 % de aire);
 *   · la puerta de 96 px ve la cédula de pie en verde, con el anillo entero;
 *   · con un escaner-cedula.js VIEJO en la caché (v138, main) nada se gira y
 *     el letrero pide la cédula acostada; y con un .js que diera «de pie» sin
 *     las cuentas del giro, la página vuelve al acostado;
 *   · el frente tomado de pie queda «en duda» hasta que sus letras digan en
 *     qué posición salió (EL FRENTE SE ENDEREZA POR SUS LETRAS); a 180° la
 *     foto guardada se gira exacta; y lo que sube lo dice solo si la duda
 *     sigue y es de ESA foto.
 * Ninguna cédula de nadie: la fabricada de pruebas/fabricar-cedula-ocr.py.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const { abrirPlay } = require('./banco-play.js');
const { FOTOS_HECHAS, huella, GUIA, VIDEO, ACOSTADO, escalar, enElVideoDe, ponerCarta, abrirConCamara, acostada } = require('./banco-camara.js');
const { leerPGM } = require('./banco-ocr.js');
const { asentar } = require('./esperar.js');

const CARTA = lado => leerPGM(path.join(__dirname, 'cedula-ocr-' + lado + '.pgm.gz'));

/* El rectanguloGuia de v138 (main, el del 8-oct), tal cual: no sabe de
   `dePie`, y con el tercer `true` da el marco acostado. */
const GUIA_V138 = 'function (w, h, acostada) { var vertical = !acostada && h > w; var largo = (vertical ? h : w) * 0.84;' +
  ' var corto = largo / EC.PROPORCION; var tope = (vertical ? w : h) * 0.92; if (corto > tope) { corto = tope; largo = corto * EC.PROPORCION; }' +
  ' var rw = vertical ? corto : largo, rh = vertical ? largo : corto;' +
  ' return { x: Math.round((w - rw) / 2), y: Math.round((h - rh) / 2), w: Math.round(rw), h: Math.round(rh), vertical: vertical }; }';

/* Enciende el escáner (el respaldo) y deja que calcule su marco. `o.js`:
   'v138' (el de main en la caché) o 'sinGiro' (uno que diera el marco de pie
   sin EC.rectAcostado / rectDePie). */
async function encender(o) {
  const E = abrirConCamara();
  const { P } = E;
  if (o && o.js === 'v138') P.ev('EC = Object.assign({}, EC, { rectanguloGuia: ' + GUIA_V138 + ', rectAcostado: undefined, rectDePie: undefined });');
  if (o && o.js === 'sinGiro') P.ev('EC = Object.assign({}, EC, { rectAcostado: undefined, rectDePie: undefined });');
  P.ev('autorizarYEscanear()');
  await asentar();
  assert.equal(P.ev('!!ESCDOC.stream'), true, 'la cámara no encendió');
  await E.correr(150);
  E.guia = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaVideo)'));
  return E;
}
/* El recorte que la página haría de un cuadro con `carta` en el marco si la
   cédula estuviera ACOSTADA en el marco acostado: lo que tiene que salir. */
function recorteEsperado(guia, carta) {
  const ga = acostada(guia), k = ga.w / GUIA.w;
  const esc = enElVideoDe(ACOSTADO, ga, escalar(carta, k), Math.round(GUIA.x * k), Math.round(GUIA.y * k));
  const m = EC.margenDeLectura(ga, ACOSTADO.W, ACOSTADO.H, 0.06), o = new Uint8ClampedArray(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) o[y * m.w + x] = esc[(m.y + y) * ACOSTADO.W + m.x + x];
  return { huella: huella(o), w: m.w, h: m.h, marco: { x: ga.x - m.x, y: ga.y - m.y, w: ga.w, h: ga.h } };
}

describe('el marco de pie en la página (26-oct-2026)', () => {

  test('el marco va DE PIE en el video, al ~55 % del largo, y el letrero pide la cédula de pie', async () => {
    const E = await encender();
    const { guia, P } = E;
    assert.equal(guia.vertical, true, 'el marco no está de pie: ' + JSON.stringify(guia));
    assert.ok(guia.h > guia.w);
    assert.ok(Math.abs(guia.h / VIDEO.H - 0.55) < 0.02, 'el marco no llena ~55 % del largo del video (11,7 cm): ' + (guia.h / VIDEO.H).toFixed(3));
    assert.ok(Math.abs(guia.w / VIDEO.W - 0.62) < 0.02, 'el marco no llena ~62 % del ancho del video: ' + (guia.w / VIDEO.W).toFixed(3));
    assert.equal(P.ev('marcoDePie()'), true);
    assert.equal(P.ev("textoDelLado('reverso')"), 'Pon tu cédula DE PIE dentro del marco, por el lado de atrás');
    assert.equal(P.ev("textoDelLado('frente')"), 'Ahora el frente: voltéala y ponla DE PIE en el marco, con tu foto');
    /* Con la mesa sola delante, la puerta pide la cédula, de pie. */
    assert.equal(P.ev("$('docEstado').textContent"), 'Pon la cédula DE PIE dentro del marco');
    /* Y la guía de la caja, que es lo que la persona ve: vertical. */
    const gc = JSON.parse(P.ev('JSON.stringify(ESCDOC.guiaCaja)'));
    assert.ok(gc.vertical === true && gc.h > gc.w, 'el marco de la caja no está de pie: ' + JSON.stringify(gc));
    assert.equal(P.ev("$('docGuia').style.height"), gc.h + 'px');
  });

  test('el recorte sale ACOSTADO: píxel a píxel el de la cédula acostada en un marco acostado, con el marco anotado', async () => {
    const E = await encender();
    const { guia, P, video } = E;
    video.__px = ponerCarta(guia, CARTA('frente'));
    /* Por JSON: lo que sale de P.ev es de otro contexto y deepEqual lo nota. */
    const r = JSON.parse(P.ev("JSON.stringify((function () { var c = recortarGuia($('docVideo')); return c ? { w: c.width, h: c.height, marco: ESCDOC.marcoEnRecorte } : null; })())"));
    assert.ok(r, 'no hubo recorte');
    const e = recorteEsperado(guia, CARTA('frente'));
    assert.ok(r.w > r.h, 'el recorte no está acostado: ' + r.w + '×' + r.h);
    assert.deepEqual([r.w, r.h], [e.w, e.h], 'el recorte no mide lo del marco acostado con su aire');
    assert.deepEqual(r.marco, e.marco, 'el marco anotado no es el del recorte acostado');
    assert.ok(Math.abs(r.marco.x / r.w - 0.06) < 0.01 && Math.abs(r.marco.y / r.h - 0.06) < 0.01, 'el marco no cae con su 6 % de aire: ' + JSON.stringify(r.marco));
    assert.equal(huella(P.ventana.ESCDOC.recorte.__lienzo.px), e.huella, 'los píxeles del recorte no son los de la cédula acostada: el giro de la fuente no es el del banco');
    /* Derecho de verdad: con la cabeza a la derecha, la foto de la persona
       (la mancha oscura del frente fabricado) queda a la IZQUIERDA. */
    const px = P.ventana.ESCDOC.recorte.__lienzo.px;
    const media = (x0, x1) => { let s = 0, n = 0; for (let y = Math.floor(r.h * 0.3); y < r.h * 0.7; y++) for (let x = Math.floor(r.w * x0); x < r.w * x1; x++) { s += px[y * r.w + x]; n++; } return s / n; };
    assert.ok(media(0.1, 0.28) < media(0.72, 0.9) - 20, 'la foto de la persona no quedó a la izquierda del recorte');
    /* Y el marco calculado (sin anotar) cae en el mismo sitio. */
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify((function () { var c = ESCDOC.recorte; ESCDOC.marcoEnRecorte = null; return guiaEnElRecorte(c); })())')), e.marco);
  });

  test('con la cabeza a la IZQUIERDA el recorte sale cabeza abajo: lo mismo que acostada al revés (lo enderezan el código o las letras)', async () => {
    const E = await encender();
    const { guia, P, video } = E;
    video.__px = ponerCarta(guia, CARTA('frente'), { giro: 180 });
    P.ev("recortarGuia($('docVideo'))");
    const px = P.ventana.ESCDOC.recorte.__lienzo.px, W = P.ventana.ESCDOC.recorte.width, H = P.ventana.ESCDOC.recorte.height;
    assert.ok(W > H);
    const media = (x0, x1) => { let s = 0, n = 0; for (let y = Math.floor(H * 0.3); y < H * 0.7; y++) for (let x = Math.floor(W * x0); x < W * x1; x++) { s += px[y * W + x]; n++; } return s / n; };
    assert.ok(media(0.72, 0.9) < media(0.1, 0.28) - 20, 'con la cabeza a la izquierda la foto tenía que quedar a la derecha (cabeza abajo)');
  });

  test('la puerta de 96 px ve la cédula de pie: el anillo entero (interior 15-85 %) y en verde', async () => {
    const E = await encender();
    const { guia, P, video } = E;
    video.__px = ponerCarta(guia, CARTA('reverso'));
    const m = P.ev("(function () { var v = $('docVideo'); var g = grisDeGuia(v); var m = EC.medirTarjeta(g, grisDeGuia(v), ESCDOC.grisW, ESCDOC.grisH, ESCDOC.interiorGris);" +
                   " return { ok: m.ok, falla: m.falla, gw: ESCDOC.grisW, gh: ESCDOC.grisH, interior: ESCDOC.interiorGris }; })()");
    assert.ok(m.gw > m.gh, 'el gris de la puerta no está acostado: ' + m.gw + '×' + m.gh);
    assert.ok(Math.abs(m.interior.x0 / m.gw - 0.15) < 0.01 && Math.abs(m.interior.x1 / m.gw - 0.85) < 0.01 &&
              Math.abs(m.interior.y0 / m.gh - 0.15) < 0.01 && Math.abs(m.interior.y1 / m.gh - 0.85) < 0.01,
      'el anillo de la puerta no cupo entero: ' + JSON.stringify(m.interior));
    assert.equal(m.ok, true, 'la cédula de pie llenando el marco no se puso en verde: ' + JSON.stringify(m));
  });

  test('con el escaner-cedula.js VIEJO (v138) en la caché: marco acostado, nada se gira, y el letrero pide acostada', async () => {
    const E = await encender({ js: 'v138' });
    const { guia, P, video } = E;
    assert.equal(guia.vertical, false, 'con el .js viejo el marco se puso de pie: ' + JSON.stringify(guia));
    assert.ok(guia.w > guia.h);
    assert.equal(P.ev('marcoDePie()'), false);
    assert.equal(P.ev("textoDelLado('reverso')"), 'Pon tu cédula acostada dentro del marco, por el lado de atrás');
    assert.equal(P.ev("textoDelLado('frente')"), 'Ahora el frente: tu cédula acostada, con tu foto a la izquierda');
    video.__px = ponerCarta(guia, CARTA('frente'));
    const r = JSON.parse(P.ev("JSON.stringify((function () { var c = recortarGuia($('docVideo')); return { w: c.width, h: c.height, marco: ESCDOC.marcoEnRecorte }; })())"));
    const m = EC.margenDeLectura(guia, VIDEO.W, VIDEO.H, 0.06);
    assert.deepEqual([r.w, r.h], [m.w, m.h], 'con el marco acostado el recorte no es el de siempre');
    assert.deepEqual(r.marco, { x: guia.x - m.x, y: guia.y - m.y, w: guia.w, h: guia.h });
    assert.deepEqual(P.fallos, [], 'la página reventó con el .js viejo');
  });

  test('un .js que diera el marco de pie SIN las cuentas del giro: la página vuelve al acostado (un recorte de través no sirve)', async () => {
    const E = await encender({ js: 'sinGiro' });
    assert.equal(E.guia.vertical, false, JSON.stringify(E.guia));
    assert.ok(E.guia.w > E.guia.h);
    assert.equal(E.P.ev('marcoDePie()'), false);
    assert.deepEqual(E.P.fallos, []);
  });
});

/* Toma el frente con el escáner (a mano, sin código a la vista) delante de
   `carta`, y devuelve la foto. */
async function tomarElFrente(E, o) {
  const { P, video } = E;
  P.ev("ESCDOC.lado = 'frente'; reiniciarCuentaDoc(); codigoEnRecorte = function () { return false; };");
  video.__px = ponerCarta(E.guia, CARTA('frente'), o);
  P.ev('capturarDoc()');
  const foto = P.ev('FOTOS.cedula_frente');
  assert.ok(foto, 'el frente no se guardó: ' + P.ev("$('docEstado').textContent"));
  return foto;
}

describe('el frente se endereza por sus letras (26-oct-2026)', () => {

  test('tomado DE PIE queda «en duda» (incierto) hasta que las letras hablen; con el marco acostado, no', async () => {
    const E = await encender();
    await tomarElFrente(E);
    assert.equal(E.P.ev('giroDelFrente()'), 'incierto');
    const V = await encender({ js: 'v138' });
    await tomarElFrente(V);
    assert.equal(V.P.ev('giroDelFrente()'), '', 'un frente acostado quedó en duda');
  });

  test('a 180° la foto guardada se gira exacta y la marca pasa a «letras»; a 0° solo la marca; sin lectura, sigue la duda', async () => {
    const E = await encender();
    const { P } = E;
    const antes = await tomarElFrente(E, { giro: 180 });
    P.ev('enderezarFrentePorLasLetras(180, GENERACION_DEL_REGISTRO)');
    await asentar(4);
    const despues = P.ev('FOTOS.cedula_frente');
    assert.notEqual(despues, antes, 'la foto no se giró');
    const a = FOTOS_HECHAS.get(antes), d = FOTOS_HECHAS.get(despues);
    assert.deepEqual([d.W, d.H], [a.W, a.H]);
    let difs = 0;
    for (let i = 0, n = a.px.length; i < n; i++) if (d.px[i] !== a.px[n - 1 - i]) difs++;
    assert.equal(difs, 0, 'la foto girada no es la de antes a 180° exactos');
    assert.equal(P.ev('giroDelFrente()'), 'letras');
    /* La marca está atada a la foto nueva: la firma es la suya. */
    assert.equal(P.ev('FOTOS.cedula_frente_giro_de === firmaDeFoto(FOTOS.cedula_frente)'), true);
    /* Y «derecha» de verdad: la foto de la persona a la izquierda. */
    const media = (x0, x1) => { let s = 0, n = 0; for (let y = Math.floor(d.H * 0.3); y < d.H * 0.7; y++) for (let x = Math.floor(d.W * x0); x < d.W * x1; x++) { s += d.px[y * d.W + x]; n++; } return s / n; };
    assert.ok(media(0.1, 0.28) < media(0.72, 0.9) - 20, 'la foto enderezada no quedó con la persona a la izquierda');

    /* A 0°: la marca, y la foto no se toca. */
    const f0 = await tomarElFrente(E);
    P.ev('enderezarFrentePorLasLetras(0, GENERACION_DEL_REGISTRO)');
    await asentar(4);
    assert.equal(P.ev('FOTOS.cedula_frente'), f0);
    assert.equal(P.ev('giroDelFrente()'), 'letras');

    /* Sin lectura (null): no se sabe, y se dice que no se sabe. */
    const fn = await tomarElFrente(E);
    P.ev('enderezarFrentePorLasLetras(null, GENERACION_DEL_REGISTRO)');
    await asentar(4);
    assert.equal(P.ev('FOTOS.cedula_frente'), fn);
    assert.equal(P.ev('giroDelFrente()'), 'incierto');

    /* De otra generación (la cuenta ya se creó, o es otro registro): nada. */
    const fg = await tomarElFrente(E, { giro: 180 });
    P.ev('enderezarFrentePorLasLetras(180, GENERACION_DEL_REGISTRO + 1)');
    await asentar(4);
    assert.equal(P.ev('FOTOS.cedula_frente'), fg, 'una lectura de otro registro giró la foto de este');
    assert.equal(P.ev('giroDelFrente()'), 'incierto');
    assert.deepEqual(P.fallos, []);
  });

  test('lo que las letras escriben del frente sigue saliendo del lienzo ACOSTADO con giro 0 (las franjas de la acostada)', async () => {
    const E = await encender();
    const { P } = E;
    P.ev("FOTOS.cedula_reverso = 'R'; anotarTipoDelRespaldo('amarilla');");
    await tomarElFrente(E);
    const r = E.recortes.filter(x => x.lado === 'frente').pop();
    assert.ok(r, 'las letras no recortaron el frente');
    assert.equal(r.giro, 0, 'al frente de pie le llegó un giro que no es 0/180: ' + r.giro);
    assert.ok(r.W > r.H, 'las franjas se recortaron de un lienzo de pie');
    assert.ok(Math.abs(r.guia.x / r.guia.w - 0.06) < 0.01, 'el marco de las franjas no es el acostado: ' + JSON.stringify(r.guia));
  });

  test('la huella que sube dice «incierto» solo si la duda sigue y es de ESA foto', () => {
    const subida = (marca, firmaRota) => {
      const P = abrirPlay({ hash: '#registro' });
      P.ev("REGISTRO.celular = '3001112233'; REGISTRO.documento = '52123456'; anotarCelularDelRegistro('3001112233');" +
           "FOTOS = { sensibles: true, cedula_frente: 'data:image/jpeg;base64,F', cedula_reverso: 'data:image/jpeg;base64,R', cedula_confirmada: '52123456' };" +
           "marcarDuenoDeLasFotos(); guardarFotos();");
      if (marca) P.ev("anotarGiroDelFrente('" + marca + "')");
      if (firmaRota) P.ev("FOTOS.cedula_frente_giro_de = 'otra'");
      P.ev("window.__subida = null; celularDeSesion = function () { return '3001112233'; };" +
           "rpcSesion = function (f, a) { window.__subida = a; return Promise.resolve({ ok: true }); };");
      P.ev('encolarLasFotosDelRegistro(REGISTRO.celular); subirArchivosRegistro()');
      const s = P.ev('JSON.stringify(window.__subida)');
      assert.ok(s, 'la subida no salió (' + marca + ')');
      return JSON.parse(s);
    };
    assert.equal(subida('incierto').p_huella.cedula_frente_giro, 'incierto', 'la duda del frente no viajó en la huella');
    assert.deepEqual(subida('incierto').p_archivos && Object.keys(subida('incierto').p_archivos).sort(), ['cedula_frente', 'cedula_reverso']);
    assert.equal(subida('letras').p_huella.cedula_frente_giro, undefined, 'un frente que las letras ya enderezaron subió «en duda»');
    assert.equal(subida('').p_huella.cedula_frente_giro, undefined, 'un frente sin marca (acostado, o la cámara del celular) subió «en duda»');
    assert.equal(subida('incierto', true).p_huella.cedula_frente_giro, undefined, 'la marca de OTRA foto se tomó por la de esta');
  });
});
