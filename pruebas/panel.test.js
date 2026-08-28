/* ============================================================================
 * EL PANEL, CORRIENDO DE VERDAD — 28-ago-2026
 *
 *   cd pruebas && node --test
 *
 * POR QUÉ EXISTE ESTE ARCHIVO.
 *
 * Las 809 pruebas de motor.test.js leen crm.html como TEXTO: buscan una frase,
 * un nombre de función, un patrón. Una de ellas incluso lo COMPILA. Todas
 * pasaban en verde el día en que se descubrió esto:
 *
 *     👤 Tu usuario: {usuario}
 *
 * Eso es lo que le llegó por WhatsApp a cada cliente al que se le mandó su
 * código desde el 21 de agosto. La plantilla estaba perfecta, mensajeCodigoAcceso
 * calculaba el número y lo mandaba en `extra`… y aplicarVars no tenía la línea
 * que lo contesta. El dato que el cliente tiene que teclear para entrar, escrito
 * como una llave rota. Ninguna prueba de texto podía verlo: hay que ARMAR el
 * mensaje y mirarlo.
 *
 * Así que acá el JavaScript de crm.html se ejecuta de verdad, contra un DOM de
 * mentira y un localStorage de mentira, y se leen los mensajes que saldrían.
 * Es la misma medicina que el centinela que compila, un paso más allá: aquel
 * caza la sintaxis rota, éste caza el mensaje incompleto.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* --------------------------------------------------------------------------
 * EL BANCO DE PRUEBAS: un navegador de mentira, lo justo para que crm.html
 * arranque. Se devuelve `ev` para preguntarle cosas al contexto: `DB` y las
 * funciones son declaraciones de un `<script>`, no propiedades de un objeto,
 * así que desde Node solo se llegan evaluando dentro del contexto.
 * ------------------------------------------------------------------------ */
function abrirPanel() {
  const RAIZ = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
  const almacen = {};
  const elems = {};
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', checked: false, textContent: '', innerHTML: '',
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, querySelector: () => elem(id + '>hijo'),
    querySelectorAll: () => [], appendChild() {}, setAttribute() {}, focus() {}
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('nuevo'), addEventListener() {},
    body: elem('body'), documentElement: elem('html'), title: ''
  };
  const ctx = {
    console, document: doc, alert() {}, confirm: () => true,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: k => { delete almacen[k]; }
    },
    location: { href: 'http://localhost:8126/panel/crm.html' },
    history: { replaceState() {} },
    navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
    /* Sin red a propósito: el Panel TIENE que andar sin nube, y una prueba que
       dependiera de internet no sería una prueba. */
    fetch: () => Promise.reject(new Error('sin red en el banco de pruebas')),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    TextEncoder, TextDecoder, URL, Intl, Date, Math, JSON,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: class {}, FileReader: class {}
  };
  ctx.window = ctx; ctx.self = ctx;
  /* Los dos que crm.html carga con <script src>. El puente se publica como
     window.PuenteTuGarantia, que es de donde lo toma la página. */
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.PuenteTuGarantia = require(path.join(RAIZ, 'app', 'puente.js'));
  /* 28-ago-2026: el chat, que crm.html toma de window.ChatTuGarantia. */
  ctx.ChatTuGarantia = require(path.join(RAIZ, 'app', 'chat.js'));
  vm.createContext(ctx);

  const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  bloques.forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'crm.html#' + i }));

  const ev = expr => vm.runInContext(expr, ctx, { filename: 'banco' });
  const cargarCartera = d => {
    almacen['joan_socios_v1'] = JSON.stringify(d);
    return ev('DB=cargar()');
  };
  return { ev, cargarCartera, elems, almacen };
}

const CASA = 'https://tugarantia.net/app/socio.html';
const UN_CLIENTE = {
  socios: [{
    id: 's1', nombre: 'María Pérez', telefono: '3001112233', whatsappIgual: true,
    cedula: '52111222', codigoAcceso: 'K7QP3', codigoEnviadoEn: '2026-08-21'
  }],
  prestamos: [], config: { negocio: 'Tu Garantía' }
};

describe('el Panel corriendo: los mensajes salen enteros (28-ago-2026)', () => {

  test('EL MENSAJE DEL CÓDIGO NO DEJA NINGÚN TOKEN SIN CONTESTAR', () => {
    /* La regresión que da nombre a este archivo. Si vuelve a faltar una línea
       en aplicarVars, el token aparece acá y no en el teléfono del cliente. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    const msg = P.ev('mensajeCodigoAcceso(DB.socios[0])');
    const sueltos = msg.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || [];
    assert.deepEqual(sueltos, [],
      'el mensaje sale con tokens sin resolver (' + sueltos.join(' ') + '): ' +
      'al cliente le llegan así, con las llaves, o vacíos');
    assert.ok(msg.indexOf('3001112233') >= 0, 'no lleva el usuario que el cliente teclea');
    assert.ok(msg.indexOf('K7QP3') >= 0, 'no lleva su código');
    assert.ok(msg.indexOf(CASA) >= 0, 'no lleva el enlace de la app');
  });

  test('y ningún mensaje con enlace manda una dirección muerta', () => {
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    const muerta = /github\.io|localhost|127\.0\.0\.1|tugarantia\.co[^m]|file:\/\//;
    ['mensajeCodigoAcceso(DB.socios[0])',
     'mensajeEnlaceCorregido(DB.socios[0])'].forEach(expr => {
      const m = P.ev(expr);
      assert.ok(!muerta.test(m), expr + ' manda una dirección que no abre: ' + m);
      assert.ok(m.indexOf(CASA) >= 0, expr + ' no lleva el enlace de casa');
    });
  });

  test('una dirección guardada que ya no sirve NO le gana a la del archivo', () => {
    /* DB.config.urlApp viaja en el lote de la nube (nube.js, CLAVES_AJUSTES),
       así que se copia de aparato en aparato y sobrevive a toda versión nueva. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    P.ev("DB.config.urlApp='https://joanhispanista-star.github.io/joan-te-presta/tg/app/socio.html'");
    assert.equal(P.ev('urlApp()'), CASA, 'la dirección muerta guardada le ganó');
    P.ev("DB.config.urlApp='http://localhost:8899/app/socio.html'");
    assert.equal(P.ev('urlApp()'), CASA);
    /* Y una viva sí manda: el ajuste sigue sirviendo para lo que se hizo. */
    P.ev("DB.config.urlApp='https://tugarantia.net/app/socio.html?v=2'");
    assert.equal(P.ev('urlApp()'), 'https://tugarantia.net/app/socio.html?v=2');
  });

  test('y al cargar se borra, para que no siga viajando por la nube', () => {
    const P = abrirPanel();
    const d = P.cargarCartera(Object.assign({}, UN_CLIENTE, {
      config: { negocio: 'Tu Garantía', urlApp: 'http://localhost:8899/app/socio.html' }
    }));
    assert.equal(d.config.urlApp, undefined,
      'cargar() se quedó con la dirección muerta: el próximo respaldo la reparte');
  });

  test('a quien recibió el enlace viejo se le puede mandar el bueno, una vez', () => {
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    assert.equal(P.ev('pudoRecibirEnlaceViejo(DB.socios[0])'), true,
      'un cliente con el código mandado antes del arreglo tiene que salir en la lista');
    P.ev("DB.socios[0].enlaceReenviadoEn='2026-08-28'");
    assert.equal(P.ev('pudoRecibirEnlaceViejo(DB.socios[0])'), false,
      'después de mandárselo sigue en la lista: se le mandaría dos veces');
  });

  test('las tres pantallas que se tocaron hoy se pintan sin reventar', () => {
    /* Un error acá no rompe una función: deja la pantalla en blanco. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    const aviso = P.ev('avisoCodigosHTML()');
    assert.ok(aviso.indexOf(CASA) >= 0, 'el aviso ya no enseña el enlace que se manda');
    assert.ok(aviso.indexOf('Mandarles el enlace bueno') >= 0,
      'el aviso no ofrece mandar el enlace corregido');
    P.ev('reenviarEnlaceBueno()');
    assert.ok((P.elems['mBody'].innerHTML || '').indexOf('María Pérez') >= 0,
      'la lista de reparación salió vacía');
    P.ev('verCliente("s1")');
    assert.ok((P.elems['mBody'].innerHTML || '').indexOf(CASA) >= 0,
      'la ficha del cliente ya no enseña el enlace que le va a llegar');
  });

  test('una dirección pegada dentro de una plantilla se avisa y se cambia', () => {
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    P.ev("DB.plantillas.historial='Mira acá: https://joanhispanista-star.github.io/joan-te-presta/tg/app/socio.html'");
    P.ev('renderPlantillas()');
    assert.ok((P.elems['pltWrap'].innerHTML || '').indexOf('Cambiar por {enlace}') >= 0,
      'la plantilla con una dirección muerta pegada a mano pasó sin aviso');
    P.ev("cambiarPorTokenEnlace('historial')");
    assert.equal(P.ev('DB.plantillas.historial'), 'Mira acá: {enlace}');
  });

  test('la vista previa no resuelve un token que el mensaje no contesta', () => {
    /* Antes los trece chips salían en las catorce plantillas y la vista previa
       los resolvía todos. Joan veía "Entras acá: https://…" y al cliente le
       llegaba "Entras acá: " y nada. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    const conEnlace = P.ev("aplicarVarsDemo('Entras acá: {enlace}','codigoAcceso')");
    assert.ok(conEnlace.indexOf(CASA) >= 0, 'el mensaje del código sí manda enlace');
    const sinEnlace = P.ev("aplicarVarsDemo('Entras acá: {enlace}','mora')");
    assert.ok(sinEnlace.indexOf('{enlace}') >= 0,
      'la vista previa resolvió un enlace que el mensaje de mora no manda');
    /* Se comparan como texto, no con deepEqual: el arreglo nace dentro del
       contexto de la página y su prototipo es el de ESE mundo, así que la
       comparación estricta lo rechaza aunque tenga lo mismo adentro. */
    assert.equal(P.ev("tokensSueltos('hola {enlace} {nombre}','mora').join(' ')"), '{enlace}');
    assert.equal(P.ev("tokensSueltos('hola {enlace} {nombre}','codigoAcceso').join(' ')"), '');
  });

  test('la bandeja de mensajes se pinta, y sin nube dice la verdad', () => {
    /* 28-ago-2026. Sin conexión, la bandeja NO puede decir «no hay mensajes»:
       las conversaciones viven en la nube y solo en la nube, así que lo único
       cierto es que no puede mirar. Es la misma trampa que la cola de cobro
       pintando un ✓ verde con la cartera vacía. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    P.ev('renderMensajes()');
    const h = P.elems['chBandeja'].innerHTML || '';
    assert.ok(h.indexOf('nube') >= 0,
      'la bandeja sin conexión no explica que le falta la nube: ' + h.slice(0, 120));
    assert.ok(!/no te ha escrito nadie/i.test(h),
      'afirmó que nadie escribió cuando lo que pasa es que no pudo mirar');
    /* Y el contador de la pestaña no puede quedarse con un número viejo. */
    assert.equal(P.elems['navSinLeer'].textContent, '');
  });

  test('con conversaciones traídas, los sin leer suben y el contador cuenta', () => {
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    /* Se conecta la nube a mano (la clave nunca sale de acá) y se le meten dos
       conversaciones ya traídas: lo que se prueba es el pintado, no la red. */
    P.almacen['joan_socios_sb'] = JSON.stringify(
      { url: 'https://ejemplo.supabase.co', anon: 'llave', clave: 'clave-de-prueba' });
    P.ev("_convs=[{cedula:'1',nombre:'Sin pendientes',ultimo:'ok',ultimo_de:'panel',ultimo_en:'2026-08-31T10:00:00-05:00',sin_leer:0}," +
         "{cedula:'2',nombre:'Con pendientes',ultimo:'hola',ultimo_de:'socio',ultimo_en:'2026-08-30T10:00:00-05:00',sin_leer:3}]");
    P.ev('renderMensajes()');
    const h = P.elems['chBandeja'].innerHTML || '';
    assert.ok(h.indexOf('Con pendientes') < h.indexOf('Sin pendientes'),
      'el que tiene mensajes sin leer no salió de primero, y es a quien hay que contestarle');
    assert.equal(P.elems['navSinLeer'].textContent, ' (3)',
      'la pestaña no dice cuántos van sin leer');
  });

  test('y el banco de pruebas sirve: si el Panel no arranca, se nota', () => {
    /* Desconfiar del medidor antes que de la página: si abrirPanel() se tragara
       un error, todo lo de arriba pasaría en verde sin haber corrido nada. */
    const P = abrirPanel();
    assert.equal(P.ev('typeof urlApp'), 'function');
    assert.equal(P.ev('typeof DB'), 'object');
    assert.throws(() => P.ev('funcionQueNoExiste()'), /is not defined/);
  });
});
