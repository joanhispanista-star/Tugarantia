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
function abrirPanel(opciones) {
  const o = opciones || {};
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
  /* 28-ago-2026: el chat, que crm.html toma de window.ChatTuGarantia.
     `sinChat: true` simula que ese <script src> no llegó — que es lo que pasa
     con un service worker viejo o sin señal, y lo que tumbó el Panel el día que
     se entregó el chat. */
  if (!o.sinChat) ctx.ChatTuGarantia = require(path.join(RAIZ, 'app', 'chat.js'));
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

  test('EL PANEL ABRE AUNQUE NO LLEGUE chat.js — y lo dice', () => {
    /* La regresión del 28-ago, en una prueba. `render()` pinta todas las
       secciones seguidas: si una revienta, se lleva las de atrás y el Panel se
       queda a medias después del PIN. Desde fuera eso se ve como «no abre», sin
       un solo mensaje que lo explique.

       El archivo puede faltar por causas que no son un fallo del código: un
       service worker viejo que no lo tiene en su lista y contesta otra cosa
       cuando la red falla, un teléfono sin señal, una caché a medias. */
    const P = abrirPanel({ sinChat: true });
    P.cargarCartera(UN_CLIENTE);
    /* La nube conectada es el caso PEOR: sin ella renderMensajes salía antes de
       tocar el módulo y el defecto no aparecía. */
    P.almacen['joan_socios_sb'] = JSON.stringify(
      { url: 'https://ejemplo.supabase.co', anon: 'llave', clave: 'clave-de-prueba' });

    assert.doesNotThrow(() => P.ev('render()'),
      'render() se cayó por falta de chat.js: eso deja el Panel a medio pintar');

    const b = P.elems['chBandeja'].innerHTML || '';
    assert.ok(b.indexOf('chat.js') >= 0,
      'la pestaña de mensajes no explica qué le falta: ' + b.slice(0, 120));

    /* Y lo que importa de verdad: las demás secciones SÍ se pintaron. */
    assert.ok((P.elems['tblClientes'].innerHTML || '').indexOf('María Pérez') >= 0,
      'la lista de clientes se quedó vacía: render() murió antes de llegar');

    /* Los botones de la pestaña tampoco pueden reventar. */
    assert.doesNotThrow(() => P.ev('traerConversaciones()'));
    assert.doesNotThrow(() => P.ev('abrirConversacion("3001112233")'));
  });

  test('y el botón para soltar la copia guardada no toca los datos', () => {
    /* Existe porque la única cura de un service worker atascado eran las
       herramientas de desarrollador. Lo que NO puede hacer es tocar la cartera:
       si algún día alguien le añade un removeItem, esta prueba lo caza. */
    const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    const i = CRM.indexOf('function soltarCopiaGuardada()');
    assert.ok(i > 0, 'crm.html ya no declara soltarCopiaGuardada');
    const bloque = CRM.slice(i, i + 1500);
    assert.ok(bloque.indexOf('localStorage') < 0,
      'soltarCopiaGuardada toca el localStorage, que es donde vive la cartera');
    assert.match(bloque, /tugarantia-/, 'borra cachés que no son suyas');
    assert.match(bloque, /unregister/);
  });

  test('«nadie te ha escrito» y «no pude preguntar» NO se ven igual', () => {
    /* La trampa que este proyecto ya pagó en la cola de cobro: con la cartera
       vacía pintaba un ✓ verde y «Nada por gestionar hoy» — afirmando en
       positivo justo lo contrario de lo que pasaba. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    P.almacen['joan_socios_sb'] = JSON.stringify(
      { url: 'https://ejemplo.supabase.co', anon: 'llave', clave: 'k' });

    /* Todavía no se ha preguntado. */
    P.ev('renderMensajes()');
    let h = P.elems['chBandeja'].innerHTML || '';
    assert.ok(/no he preguntado/i.test(h),
      'sin haber preguntado ya afirma algo: ' + h.slice(0, 140));

    /* La consulta falló. */
    P.ev("_convsEstado='error'; _convsError='No pude traerlas.'; renderMensajes()");
    h = P.elems['chBandeja'].innerHTML || '';
    assert.ok(/no pude/i.test(h), 'no dice que falló la consulta');
    assert.ok(!/no te ha escrito nadie/i.test(h),
      'con la consulta caída afirma que nadie escribió, que es lo contrario');

    /* La nube contestó y de verdad no hay nadie: ESE es el único caso en que
       se puede afirmar. */
    P.ev("_convsEstado='ok'; _convs=[]; renderMensajes()");
    h = P.elems['chBandeja'].innerHTML || '';
    assert.ok(/no te ha escrito nadie/i.test(h),
      'con la nube contestando y cero conversaciones sí hay que decirlo');
  });

  test('el buscador encuentra sin tildes, por celular partido y con +57', () => {
    /* 29-ago-2026 — «un buscador por cliente que pueda ser con el numero de
       celular o el nombre». Las tres formas reales de teclear: sin tilde desde
       un computador, el celular con espacios, y el numero copiado de WhatsApp
       con el +57 pegado. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    assert.equal(P.ev("buscarClientes('maria').length"), 1,
      '«maria» sin tilde no encontró a María');
    assert.equal(P.ev("buscarClientes('PÉREZ').length"), 1);
    assert.equal(P.ev("buscarClientes('300 111').length"), 1,
      'el celular con espacios no encontró');
    assert.equal(P.ev("buscarClientes('+57 300 111 2233').length"), 1,
      'el número copiado de WhatsApp con +57 no encontró');
    assert.equal(P.ev("buscarClientes('CL-').length"), 1, 'el código CL- no encontró');
    assert.equal(P.ev("buscarClientes('zutano').length"), 0);
    assert.equal(P.ev("buscarClientes('').length"), 0, 'vacío no puede listar a todos');
    /* Dos dígitos sueltos no son una búsqueda de celular: casi todo número los
       contiene y la lista sería ruido. */
    assert.equal(P.ev("buscarClientes('30').length"), 0);
  });

  test('y lo que pinta va escapado y abre la ficha', () => {
    const P = abrirPanel();
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.socios[0].nombre = '<img src=x onerror=alert(1)> Pérez';
    P.cargarCartera(d);
    P.ev("document.getElementById('buscaGlobal').value='perez'");
    P.ev('pintarBusqueda()');
    const h = P.elems['buscaRes'].innerHTML || '';
    assert.ok(h.indexOf('<img') < 0, 'el nombre del cliente salió sin escapar en el buscador');
    assert.ok(h.indexOf('abrirDesdeBusqueda') >= 0, 'el resultado no abre la ficha');
    /* Y sin texto, la caja queda limpia — no una lista fantasma. */
    P.ev("document.getElementById('buscaGlobal').value=''");
    P.ev('pintarBusqueda()');
    assert.equal(P.elems['buscaRes'].innerHTML, '');
  });

  test('la ficha suma todos los créditos activos — y solo cuando hay más de uno', () => {
    /* 29-ago-2026 — «si un cliente tiene más de un crédito quiero que pueda ver
       una sumatoria total». La cifra es suma de totalCiclo del motor: si acá
       apareciera una cuenta propia, habría dos verdades sobre la misma plata. */
    const P = abrirPanel();
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.prestamos = [
      { id:'p1', numero:1, socioId:'s1', socioNombre:'María Pérez', capital:400000, costoPct:20,
        fechaDesembolso:'2026-08-20', cicloActual:'2026-08-31', prorrogas:[], abonosCapital:[], comprobantes:[], pagado:false },
      { id:'p2', numero:2, socioId:'s1', socioNombre:'María Pérez', capital:200000, costoPct:20,
        fechaDesembolso:'2026-08-25', cicloActual:'2026-09-15', prorrogas:[], abonosCapital:[], comprobantes:[], pagado:false }
    ];
    P.cargarCartera(d);
    const esperado = P.ev("DB.prestamos.reduce((t,p)=>t+totalCiclo(p),0)");
    P.ev('verCliente("s1")');
    const f = P.elems['mBody'].innerHTML || '';
    assert.ok(f.indexOf('Todos sus créditos, juntos') >= 0, 'la ficha no trae la sumatoria');
    assert.ok(f.indexOf(P.ev('COP(' + esperado + ')')) >= 0,
      'la cifra de la sumatoria no es la suma de totalCiclo del motor');

    /* Con UN solo crédito el renglón no sale: la cifra sería la del propio
       crédito y el bloque perdería su significado. */
    d.prestamos = d.prestamos.slice(0, 1);
    P.cargarCartera(d);
    P.ev('verCliente("s1")');
    assert.ok((P.elems['mBody'].innerHTML || '').indexOf('Todos sus créditos, juntos') < 0,
      'la sumatoria salió con un solo crédito');
  });

  test('el alta guarda la tasa pactada y el ciclo cobra con ella', () => {
    /* 29-ago-2026 — el camino ENTERO: Joan teclea 10 en el campo de costo,
       registra, y el crédito queda cobrando el 10% — no el 20 con una etiqueta
       de mentira. La cifra del ciclo la da K(p) del puente, que es el mismo que
       usa la app del socio. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    P.ev("confirm=t=>String(t).indexOf('bienvenida')<0");   // sí a todo, menos al WhatsApp
    ['qNombre','qTel','qCap','qCosto','qFecha'].forEach((id,i)=>{
      const v=['María Pérez','3001112233','300000','10','2026-08-25'][i];
      P.ev("document.getElementById('"+id+"').value='"+v+"'");
    });
    P.ev("document.getElementById('qCiclo').value=''");
    const antes = P.ev('DB.prestamos.length');
    P.ev('guardarRapido()');
    assert.equal(P.ev('DB.prestamos.length'), antes+1, 'el crédito no se creó');
    assert.equal(P.ev('DB.prestamos[DB.prestamos.length-1].costoPct'), 10,
      'guardó otra tasa distinta de la tecleada');
    assert.equal(P.ev('K(DB.prestamos[DB.prestamos.length-1])'), 30000,
      'el ciclo no cobra con la tasa pactada: 300.000 al 10% son 30.000');

    /* Y fuera del rango NO se crea: ni 25 (sobre el techo) ni 0 (el crédito
       quedaría sin poder prorrogarse). */
    ['25','0'].forEach(malo=>{
      P.ev("document.getElementById('qCosto').value='"+malo+"'");
      const n = P.ev('DB.prestamos.length');
      P.ev('guardarRapido()');
      assert.equal(P.ev('DB.prestamos.length'), n,
        'con costo '+malo+' el crédito se creó igual');
    });
  });

  /* ======================================================================
   * EL ACUERDO DE PRÓRROGA (29-ago-2026) — «paga la prórroga, pero otro día».
   * La regla que vigilan estas pruebas es UNA, y es la lección del 4-ago:
   * EL CORTE SOLO SE MUEVE CON PLATA EN MANO.
   * ==================================================================== */

  function carteraConMora(P) {
    /* Un crédito vencido hace 10 días, con fechas relativas a hoy porque el
       banco corre con el reloj real. */
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    const hace = n => { const x = new Date(); x.setDate(x.getDate() - n);
      return x.toISOString().slice(0, 10); };
    d.prestamos = [{ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'María Pérez',
      capital: 400000, costoPct: 20, fechaDesembolso: hace(25), cicloActual: hace(10),
      prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }];
    P.cargarCartera(d);
    return d;
  }
  const enDias = n => { const x = new Date(); x.setDate(x.getDate() + n);
    return x.toISOString().slice(0, 10); };

  test('PACTAR NO MUEVE NADA: ni el corte, ni las prórrogas, ni la ganancia', () => {
    const P = abrirPanel();
    carteraConMora(P);
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    const antes = {
      ciclo: P.ev("DB.prestamos[0].cicloActual"),
      gan: P.ev("gananciaCobrada(DB.prestamos[0])"),
      pr: P.ev("(DB.prestamos[0].prorrogas||[]).length")
    };
    const esperado = P.ev("liqProrroga(DB.prestamos[0],hoyISO()).total_a_pagar");
    P.ev("pactarAcuerdo('p1')");
    P.ev("document.getElementById('acFecha').value='" + enDias(5) + "'");
    P.ev("guardarAcuerdo('p1')");
    assert.ok(P.ev("!!DB.prestamos[0].acuerdo"), 'el acuerdo no se guardó');
    assert.equal(P.ev("DB.prestamos[0].acuerdo.monto"), esperado,
      'el monto congelado no es el que cotizó el motor');
    assert.equal(P.ev("DB.prestamos[0].cicloActual"), antes.ciclo,
      'PACTAR MOVIÓ EL CORTE — el agujero del 4-ago, otra vez');
    assert.equal(P.ev("(DB.prestamos[0].prorrogas||[]).length"), antes.pr,
      'pactar creó una prórroga sin plata en mano');
    assert.equal(P.ev("gananciaCobrada(DB.prestamos[0])"), antes.gan,
      'pactar sumó ganancia sin plata en mano');
  });

  test('el acuerdo vigente ES el cobro: su fecha, su monto, y uno solo', () => {
    const P = abrirPanel();
    carteraConMora(P);
    P.ev("DB.prestamos[0].acuerdo={pactadoEl:hoyISO(),pactadaPara:'" + enDias(4) +
      "',monto:123450,costo:80000,mora:43450,diasMora:10}");
    const cobros = JSON.parse(P.ev("JSON.stringify(cobrosDelCredito(DB.prestamos[0]))"));
    assert.equal(cobros.length, 1, 'publicó más de un cobro: suma doble en el calendario');
    assert.equal(cobros[0].fecha, enDias(4), 'el cobro no cae el día pactado');
    assert.equal(cobros[0].monto, 123450, 'el cobro no es el monto congelado');
    assert.ok(cobros[0].acuerdo === true, 'el cobro no viene marcado como acuerdo');
  });

  test('CUMPLIR ejecuta la prórroga de siempre y borra el acuerdo', () => {
    const P = abrirPanel();
    carteraConMora(P);
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    P.ev("pactarAcuerdo('p1')");
    P.ev("document.getElementById('acFecha').value='" + enDias(5) + "'");
    P.ev("guardarAcuerdo('p1')");
    const pactado = P.ev("DB.prestamos[0].acuerdo.monto");
    const cicloAntes = P.ev("DB.prestamos[0].cicloActual");
    P.ev("cumplirAcuerdo('p1')");
    assert.equal(P.ev("(DB.prestamos[0].prorrogas||[]).length"), 1,
      'cumplir no registró la prórroga');
    /* Cumple HOY, dentro del plazo: el precio es el congelado del pacto. */
    assert.equal(P.ev("DB.prestamos[0].prorrogas[0].monto"), pactado,
      'no respetó el precio congelado pagando en fecha');
    assert.ok(P.ev("DB.prestamos[0].cicloActual") > cicloAntes,
      'el corte no se movió — y aquí SÍ hay plata en mano');
    assert.ok(P.ev("!DB.prestamos[0].acuerdo"), 'el acuerdo no se borró al cumplirse');
  });

  test('acuerdo VENCIDO sin pagar: vuelve el cobro real y la cola lo sube', () => {
    const P = abrirPanel();
    carteraConMora(P);
    const ayer = (() => { const x = new Date(); x.setDate(x.getDate() - 1);
      return x.toISOString().slice(0, 10); })();
    P.ev("DB.prestamos[0].acuerdo={pactadoEl:'" + ayer + "',pactadaPara:'" + ayer +
      "',monto:123450,costo:80000,mora:43450,diasMora:9}");
    /* El cobro publicado ya no es el pacto: es lo causado real de hoy. */
    const cobros = JSON.parse(P.ev("JSON.stringify(cobrosDelCredito(DB.prestamos[0]))"));
    assert.ok(!cobros[0].acuerdo, 'siguió publicando el pacto vencido como cobro');
    assert.equal(cobros[0].monto, P.ev("totalCiclo(DB.prestamos[0])"),
      'el cobro no volvió al total real del ciclo');
    /* Y la cola lo dice con todas las letras, de primero. */
    P.ev("renderCola()");
    const cola = P.elems['cola'].innerHTML || '';
    assert.ok(cola.indexOf('Incumplido') >= 0, 'la cola no marca el acuerdo incumplido');
    assert.ok(cola.indexOf('INCUMPLIDO') >= 0 || cola.indexOf('debe') >= 0,
      'la cola no dice cuánto debe de verdad');
  });

  test('el acuerdo viaja en el paquete del socio — sin él, dos verdades', () => {
    const P = abrirPanel();
    carteraConMora(P);
    P.ev("DB.prestamos[0].acuerdo={pactadoEl:hoyISO(),pactadaPara:'" + enDias(3) +
      "',monto:99000,costo:80000,mora:19000,diasMora:5}");
    const a = JSON.parse(P.ev("JSON.stringify(migrarSocio(DB.socios[0]).creditos[0].acuerdo)"));
    assert.equal(a.fecha, enDias(3), 'el paquete no lleva la fecha pactada');
    assert.equal(a.monto, 99000, 'el paquete no lleva el monto congelado');
    /* Y deshacer lo saca del paquete también. */
    P.ev("confirm=()=>true; romperAcuerdo('p1')");
    assert.ok(P.ev("migrarSocio(DB.socios[0]).creditos[0].acuerdo === null"),
      'roto el pacto, el paquete lo sigue llevando');
  });

  test('el buscador encuentra por nombre sin tildes y por pedazo de celular', () => {
    /* 29-ago-2026 — «por el número de celular o el nombre, con más agilidad».
       La normalización de dígitos es la MISMA de socioDelCredito: si difirieran,
       el buscador y el registro de pagos encontrarían gente distinta. */
    const P = abrirPanel();
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.socios.push({ id: 's2', nombre: 'José Roldán', telefono: '3109998877',
      whatsappIgual: true, codigoAcceso: 'ZZZZ9' });
    P.cargarCartera(d);

    P.ev("document.getElementById('buscaCliente').value='maria'");
    assert.equal(P.ev('clientesFiltrados().length'), 1, "'maria' no encontró a María");
    assert.equal(P.ev('clientesFiltrados()[0].nombre'), 'María Pérez');

    P.ev("document.getElementById('buscaCliente').value='300 111'");
    assert.equal(P.ev('clientesFiltrados().length'), 1, 'el pedazo de celular no lo encontró');

    P.ev("document.getElementById('buscaCliente').value='rold'");
    assert.equal(P.ev('clientesFiltrados()[0].nombre'), 'José Roldán');

    /* Enter con UNO abre la ficha; con dos no adivina. */
    P.ev("document.getElementById('buscaCliente').value='maria'");
    P.ev('abrirUnicoCliente()');
    /* El nombre vive en el TÍTULO del modal (openModal), no en el cuerpo. */
    assert.ok((P.elems['mTitle'].textContent || '').indexOf('María Pérez') >= 0,
      'Enter con un solo resultado no abrió la ficha');
    P.elems['mTitle'].textContent = '';
    P.ev("document.getElementById('buscaCliente').value=''");
    P.ev('abrirUnicoCliente()');
    assert.equal(P.elems['mTitle'].textContent, '',
      'Enter sin filtro abrió una ficha adivinada');

    /* Y sin resultados la tabla dice que no coincide, no que no hay clientes. */
    P.ev("document.getElementById('buscaCliente').value='zzzz'");
    P.ev('renderClientes()');
    assert.ok((P.elems['tblClientes'].innerHTML || '').indexOf('Nadie coincide') >= 0,
      'con filtro sin resultados dijo otra cosa');
  });

  test('{nivel} se contesta con el nivel real — la llave rota del 1-sep', () => {
    /* Joan escribió {nivel} en SU plantilla de recibo y a una clienta real le
       llegó "(nivel {nivel})" literal. El dato existe: se contesta, no se avisa. */
    const P = abrirPanel();
    P.cargarCartera(UN_CLIENTE);
    P.ev("DB.plantillas.recibo='Gracias {nombre}, sumas a tu historial (nivel {nivel}).'");
    const d = { id:'px', numero:1, socioId:'s1', socioNombre:'María Pérez', capital:100000,
      costoPct:20, fechaDesembolso:'2026-08-01', cicloActual:'2026-08-15',
      prorrogas:[], abonosCapital:[], comprobantes:[], pagado:true, fechaPagado:'2026-08-15' };
    P.ev('DB.prestamos.push(' + JSON.stringify(d) + ')');
    const msg = P.ev("mensajeParaCredito(DB.prestamos[DB.prestamos.length-1],DB.socios[0],'recibo')");
    assert.ok(msg.indexOf('{nivel}') < 0, 'la llave siguió saliendo literal: ' + msg);
    /* La lista sale de M.NIVELES, no quemada: el 2-sep la escala crecio a
       nueve nombres y una regex fija se habria quedado mintiendo. */
    const M2 = require('../app/motor.js');
    assert.match(msg, new RegExp('nivel (' + M2.NIVELES.join('|') + ')'),
      'no puso un nivel de verdad: ' + msg);
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
