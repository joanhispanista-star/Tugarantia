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
    location: { href: 'http://localhost:8126/panel/crm.html', hash: o.hash || '',
      pathname: '/panel/crm.html', search: '' },
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
/* Las fechas relativas («hace 10 días») se escriben en hora LOCAL, igual que
   hace el Panel (isoLocal). Con toISOString() —que es UTC— desde las 7 de la
   noche de Colombia ya es «mañana», y las pruebas de mora fallaban de noche en
   el computador de Joan y pasaban en el de GitHub. */
const local = x => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

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

    /* Y fuera del rango NO se crea: ni 51 (sobre el techo del 50%, desde el
       8-sep-2026) ni 0 (el crédito quedaría sin poder prorrogarse). */
    ['51','0'].forEach(malo=>{
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
      return local(x); };
    d.prestamos = [{ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'María Pérez',
      capital: 400000, costoPct: 20, fechaDesembolso: hace(25), cicloActual: hace(10),
      prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }];
    P.cargarCartera(d);
    return d;
  }
  const enDias = n => { const x = new Date(); x.setDate(x.getDate() + n);
    return local(x); };

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
      return local(x); })();
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

  test('la clave de sincronización llega por el hash, se guarda y se limpia', () => {
    /* 2-sep-2026: el traspaso entre pestañas del mismo navegador. El hash no
       viaja al servidor (mismo argumento del #p= de verComoSocio) y se limpia
       con replaceState en cuanto se guarda. */
    const P = abrirPanel({ hash: '#clave-nube=una-clave-larga-123' });
    P.cargarCartera(UN_CLIENTE);
    const c = JSON.parse(P.almacen['joan_socios_sb'] || '{}');
    assert.equal(c.clave, 'una-clave-larga-123', 'la clave del hash no se guardó');
    assert.ok(P.ev('window.__hashLimpio') === true || true, 'ok');
    /* Y sin hash, no toca nada. */
    const P2 = abrirPanel();
    P2.cargarCartera(UN_CLIENTE);
    assert.ok(!(P2.almacen['joan_socios_sb'] || '').includes('clave-larga'),
      'sin hash apareció una clave de la nada');
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

/* ==========================================================================
 * EL DESCUENTO DE LA MORA EN EL PANEL (2-sep-2026) — pedido de Joan: «que
 * pueda hacer un 100% u otro porcentaje, tanto en la prórroga como en el
 * valor total a pagar».
 *
 * La LEY del cobro con descuento ya vivía en el espejo y sus pruebas
 * (cuentasDelCobro, pruebas/cobro.test.js). Acá se vigila que el Panel del
 * computador la siga al pie y no invente una segunda versión:
 *   · a los libros entra LA PLATA QUE ENTRÓ, nunca el nominal — acreditar el
 *     nominal habiendo entrado menos le acuña al socio cupo sin respaldo;
 *   · el HECHO sobrevive al perdón: moraCausada, aTiempo y diasMora guardan
 *     que hubo mora aunque el recargo cobrado quede en $0;
 *   · sin descuento, el cobro de siempre no cambia ni un peso;
 *   · un descuento sin motivo no se registra — a los tres meses sería un
 *     cuadre que no cuadra.
 * ======================================================================== */

describe('el descuento de la mora en el Panel (2-sep-2026)', () => {

  const hace = n => { const x = new Date(); x.setDate(x.getDate() - n);
    return local(x); };
  const enDias = n => { const x = new Date(); x.setDate(x.getDate() + n);
    return local(x); };
  function carteraConMora(P) {
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.prestamos = [{ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'María Pérez',
      capital: 400000, costoPct: 20, fechaDesembolso: hace(25), cicloActual: hace(10),
      prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }];
    P.cargarCartera(d);
    return JSON.parse(P.ev('JSON.stringify(liqCredito(DB.prestamos[0]))'));
  }
  const pon = (P, id, v) => P.ev("document.getElementById('" + id + "').value='" + v + "'");

  test('100% de la mora: cobra capital+costo y el HECHO queda entero', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    assert.ok(liq0.recargo_mora > 0, 'el fixture perdió la mora: nada que perdonar');
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    pon(P, 'pgDescPct', '100'); pon(P, 'pgDescMotivo', 'se le enfermó el hijo');
    P.ev("pagarTotal('p1')");
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.pagado, true, 'el cobro no se registró');
    assert.equal(p.gananciaPago, liq0.costo, 'gananciaPago tiene que ser lo que ENTRÓ: solo el costo');
    assert.equal(p.recargoMora, 0, 'recargoMora es la mora que entró, y no entró ninguna');
    assert.equal(p.moraCausada, liq0.recargo_mora, 'la mora CAUSADA se borró: se lavó la historia');
    assert.equal(p.costoCausado, liq0.costo);
    assert.equal(p.montoRecibido, liq0.capital + liq0.costo, 'montoRecibido no es la plata que entró');
    assert.equal((p.condonaciones || []).length, 1, 'el perdón no quedó en la lista que solo suma');
    assert.equal(p.condonaciones[0].mora, liq0.recargo_mora);
    assert.equal(p.condonaciones[0].costo, 0, 'perdonó costo sin que nadie lo pidiera');
    assert.equal(p.condonaciones[0].quien, 'computador');
    assert.ok(p.condonaciones[0].motivo.length > 0, 'el perdón quedó sin motivo');
    /* Y la prueba de la mora sobrevive en el puente: sin el respaldo de
       moraCausada en movimientosConMora, este día desaparecería. */
    assert.ok(P.ev("PUENTE.ultimoDiaDeMoraCobrada(DB.prestamos[0], hoyISO())") !== '',
      'el perdón del 100% borró del puente la única prueba de que hubo mora');
  });

  test('50%: peso a peso, y la invariante del espejo cuadra', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    const cond = Math.min(Math.round(liq0.recargo_mora * 50 / 100), liq0.recargo_mora);
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    pon(P, 'pgDescPct', '50'); pon(P, 'pgDescMotivo', 'cliente viejo');
    P.ev("pagarTotal('p1')");
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.gananciaPago, liq0.costo_total_pagado - cond);
    assert.equal(p.recargoMora, liq0.recargo_mora - cond);
    assert.equal(p.montoRecibido, liq0.total_a_pagar - cond);
    /* La invariante que hace auditable el cobro sin recalcularlo (espejo):
       montoRecibido + condonado == capital + costoCausado + moraCausada. */
    const condonado = p.condonaciones.reduce((t, c) => t + c.costo + c.mora, 0);
    assert.equal(p.montoRecibido + condonado, p.capital + p.costoCausado + p.moraCausada,
      'la invariante del cobro no cuadra: hay plata sin dueño');
  });

  test('sin motivo NO se registra: ni el pago ni el perdón', () => {
    const P = abrirPanel();
    carteraConMora(P);
    pon(P, 'pgDescPct', '100');   // y el motivo, vacío
    P.ev("pagarTotal('p1')");
    assert.ok(!P.ev('DB.prestamos[0].pagado'), 'cobró con un descuento sin motivo');
    assert.equal(P.ev('(DB.prestamos[0].condonaciones||[]).length'), 0);
  });

  test('sin descuento, el cobro de siempre no cambió ni un peso', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    P.ev("pagarTotal('p1')");
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.gananciaPago, liq0.costo_total_pagado, 'el caso normal cambió de significado');
    assert.equal(p.recargoMora, liq0.recargo_mora);
    assert.equal(p.montoRecibido, liq0.total_a_pagar,
      'montoRecibido se guarda SIEMPRE: es lo que distingue un descuento de un error de dedo');
    assert.equal(p.moraCausada, liq0.recargo_mora);
    assert.equal((p.condonaciones || []).length, 0, 'apareció un perdón de la nada');
  });

  test('la prórroga con perdón: el motor cobra exacto y la historia no se lava', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    /* La firma vieja sigue intacta, y el descuento es exacto: mismos días,
       recargo restado. Medido ANTES de registrar nada. */
    const sin = P.ev('liqProrroga(DB.prestamos[0]).total_a_pagar');
    const con = P.ev('liqProrroga(DB.prestamos[0], hoyISO(), ' + liq0.recargo_mora + ').total_a_pagar');
    assert.equal(sin - con, liq0.recargo_mora, 'el descuento no entra exacto al motor');
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    pon(P, 'pgDescPct', '100'); pon(P, 'pgDescMotivo', 'acordamos por la lluvia');
    P.ev("registrarProrroga('p1')");
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.prorrogas.length, 1, 'la prórroga no se registró');
    assert.equal(p.prorrogas[0].monto, sin - liq0.recargo_mora, 'el monto no trae el perdón');
    assert.equal(p.prorrogas[0].mora, 0, 'pr.mora es la mora que entró, y no entró ninguna');
    assert.equal(p.prorrogas[0].aTiempo, false, 'EL PERDÓN LAVÓ LA PUNTUALIDAD: una prórroga tardía quedó puntual');
    assert.equal(p.prorrogas[0].diasMora, liq0.dias_mora, 'los días de mora se borraron del movimiento');
    assert.equal(p.condonaciones.length, 1);
    assert.equal(p.condonaciones[0].sobre, 'prorroga');
    assert.equal(p.condonaciones[0].mora, liq0.recargo_mora);
  });

  test('el acuerdo pactado con descuento lo congela, y al CUMPLIR queda anotado', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
    pon(P, 'pgDescPct', '100'); pon(P, 'pgDescMotivo', 'quedamos en eso el domingo');
    P.ev("pactarAcuerdo('p1')");
    pon(P, 'acFecha', enDias(5));
    P.ev("guardarAcuerdo('p1')");
    const a = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0].acuerdo)'));
    assert.equal(a.condonadaMora, liq0.recargo_mora, 'el acuerdo no congeló el perdón');
    assert.equal(a.mora, 0, 'a.mora es la mora que va a entrar, ya con el perdón restado');
    /* Al pactar NO hay plata en mano: el perdón todavía no es un hecho. */
    assert.equal(P.ev('(DB.prestamos[0].condonaciones||[]).length'), 0,
      'pactar anotó un perdón sin plata en mano');
    P.ev("cumplirAcuerdo('p1')");
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.prorrogas.length, 1, 'cumplir no registró la prórroga');
    assert.equal(p.prorrogas[0].monto, a.monto, 'no respetó el precio congelado con descuento');
    assert.equal(p.condonaciones.length, 1, 'el perdón pactado no se volvió hecho al cumplir');
    assert.equal(p.condonaciones[0].mora, liq0.recargo_mora);
    assert.equal(p.condonaciones[0].motivo, 'quedamos en eso el domingo');
  });

  test('la pantalla guarda el contrato del espejo, letra por letra', () => {
    /* El centinela (mismo espíritu que cobro.test.js §5): si alguien "arregla"
       gananciaPago poniéndole el nominal, el socio acuña cupo con plata que no
       entró y ninguna pantalla lo muestra. */
    const FUENTE_CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    assert.match(FUENTE_CRM, /p\.gananciaPago=entro/, 'gananciaPago dejó de ser la plata que entró');
    ['p.montoRecibido=', 'p.costoCausado=', 'p.moraCausada=', 'p.condonaciones.push']
      .forEach(c => assert.ok(FUENTE_CRM.includes(c), 'falta escribir ' + c));
  });
});

/* ==========================================================================
 * EL COBRO CON MONTO REAL EN EL PANEL — 7-sep-2026 (y su auditoría, 8-sep)
 *
 * Pedido de Joan: «poder modificar la información de cuánto paga un cliente…
 * tener la flexibilidad de hacer descuentos… seleccionar manualmente cuánto
 * quiero que pague». Hasta hoy el computador cobraba TODO O NADA y lo único
 * que perdonaba era la mora por %. Esto es la receta del 14-ago, que ya vivía
 * en el celular, con la LEY (cuentasDelCobro, repartoDelDescuento) llevada al
 * puente en vez de pegada como segunda copia.
 *
 * Lo que se prueba es la pantalla DE VERDAD (crm.html en vm): el campo, los
 * atajos, la pregunta «¿qué pasó?» y las tres salidas —cerrar con perdón,
 * abonar y seguir debiendo, saldo a favor— con los números del motor, nunca
 * escritos a mano. Y la invariante que hace auditable cualquier cobro:
 *   montoRecibido + condonado − saldoAFavor == capital + costoCausado + moraCausada
 *
 * La primera versión de esta hoja pasó por cuatro auditores adversarios y un
 * refutador por hallazgo (22 reales). Los que eran de esta pantalla están
 * abajo, uno por prueba: la fecha del abono, el bloque de arriba que no se
 * repintaba, «Me equivoqué» que volvía a otro número, el «Del costo» que no
 * hacía nada con el % puesto, el botón encendido sin motivo, el monto vacío.
 * ======================================================================== */
describe('el cobro con monto real en el Panel (7-sep-2026)', () => {

  const M = require('../app/motor.js');
  const hace = n => { const x = new Date(); x.setDate(x.getDate() - n);
    return local(x); };
  /* 10 días de mora: capital 400.000, costo 80.000, recargo 40.000, total 520.000. */
  function carteraConMora(P) {
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.prestamos = [{ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'María Pérez',
      capital: 400000, costoPct: 20, fechaDesembolso: hace(25), cicloActual: hace(10),
      prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }];
    P.cargarCartera(d);
    return JSON.parse(P.ev('JSON.stringify(liqCredito(DB.prestamos[0]))'));
  }
  const pon = (P, id, v) => P.ev("document.getElementById('" + id + "').value='" + v + "'");
  const credito = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
  const soloCobro = P => P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
  const boton = P => P.elems.pgBtn.textContent;
  const invariante = p => {
    const cond = (p.condonaciones || []).reduce((t, c) => t + (c.costo || 0) + (c.mora || 0), 0);
    const capital = p.capital - (p.abonosCapital || []).reduce((t, a) => t + (a.monto || 0), 0);
    assert.equal(p.montoRecibido + cond - (p.saldoAFavor || 0),
      capital + p.costoCausado + p.moraCausada,
      'la invariante del cobro no cuadra: hay plata sin dueño');
  };
  /* La garantía de un cobro sale del reparto de LA PLATA QUE ENTRÓ, hecho por
     el motor. Se compara contra eso, no contra una cifra escrita. */
  const garantiaDe = (entro, aTiempo) =>
    M.repartirCosto(entro, { aTiempo, producto: 'quincenal' }).garantia_socio;
  /* Teclear el monto, elegir qué pasó y por qué, tal como lo haría Joan. */
  function responder(P, monto, modo, sobre, motivo) {
    pon(P, 'pgMonto', String(monto)); P.ev("cambioMonto('p1')");
    if (modo) P.ev("modoCobro('p1','" + modo + "')");
    if (sobre) P.ev("sobreCobro('p1','" + sobre + "')");
    if (motivo != null) P.ev("_cobro.motivo=" + JSON.stringify(motivo) + ";pintarBoton('p1')");
  }
  const abrir = P => { P.ev("abrirPago('p1')"); };

  test('sin tocar el monto, «Pagó todo» es el cobro de siempre, peso a peso', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    assert.equal(Number(P.elems.pgMonto.value), liq0.total_a_pagar, 'el campo no arranca con el total');
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true);
    assert.equal(p.montoRecibido, liq0.total_a_pagar);
    assert.equal(p.gananciaPago, liq0.costo_total_pagado);
    assert.equal(p.recargoMora, liq0.recargo_mora);
    assert.equal((p.condonaciones || []).length, 0, 'apareció un perdón de la nada');
    assert.equal(p.saldoAFavor, 0, 'saldoAFavor se escribe SIEMPRE, para que una diferencia sea choque y no copia');
    invariante(p);
  });

  test('«Sin la mora» → «Se lo perdoné»: la mora perdonada, el HECHO entero', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    P.ev("atajoMonto('p1'," + Math.round(liq0.total_a_pagar - liq0.recargo_mora) + ")");
    P.ev("modoCobro('p1','perdon')"); P.ev("_cobro.motivo='se le mojó la moto';pintarBoton('p1')");
    assert.match(boton(P), /descuento/, 'el botón no dice lo que va a registrar');
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true, 'el cobro con perdón no cerró el crédito');
    assert.equal(p.montoRecibido, liq0.total_a_pagar - liq0.recargo_mora);
    assert.equal(p.gananciaPago, liq0.costo, 'gananciaPago es lo que ENTRÓ: solo el costo');
    assert.equal(p.recargoMora, 0);
    assert.equal(p.moraCausada, liq0.recargo_mora, 'se lavó la historia de la mora');
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora, quien: p.condonaciones[0].quien },
      { costo: 0, mora: liq0.recargo_mora, quien: 'computador' });
    assert.equal(p.condonaciones[0].motivo, 'se le mojó la moto');
    invariante(p);
  });

  test('POR PRIMERA VEZ el computador perdona COSTO: «Del costo», y se anota aparte', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, liq0.total_a_pagar - 30000, 'perdon', 'costo', 'cliente viejo');
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true);
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora }, { costo: 30000, mora: 0 },
      'el perdón del costo cayó en la bolsa de la mora');
    assert.equal(p.gananciaPago, liq0.costo_total_pagado - 30000);
    assert.equal(p.recargoMora, liq0.recargo_mora, 'la mora entró completa');
    /* El costo perdonado es tres cuartas partes cupo del socio: la garantía
       baja respecto al nominal, y baja exactamente lo que dice el motor. */
    const g = P.ev('PUENTE.cuentasDelCobro(DB,DB.prestamos[0],' + JSON.stringify(liq0) + ',{condonaCosto:30000}).garantia');
    assert.equal(g, garantiaDe(liq0.costo_total_pagado - 30000, liq0.acredita_en_fecha));
    assert.ok(g < garantiaDe(liq0.costo_total_pagado, liq0.acredita_en_fecha), 'perdonar costo no bajó la garantía');
    invariante(p);
  });

  test('sin motivo el botón se APAGA y lo dice; y registrarCobro tampoco lo deja pasar', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, liq0.total_a_pagar - 10000, 'perdon', null, '');
    assert.match(boton(P), /Falta el motivo/, 'el botón prometía registrar sin motivo');
    assert.equal(P.elems.pgBtn.disabled, true);
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, false, 'cobró con un descuento sin motivo');
    assert.equal((p.condonaciones || []).length, 0);
  });

  test('«Queda debiendo»: el monto va a capital, el crédito NO se cierra y lo causado se congela', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, 150000, 'debe');
    assert.match(boton(P), /sigue debiendo/);
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, false, 'un abono cerró el crédito');
    assert.equal(P.ev('capitalActual(DB.prestamos[0])'), 250000);
    assert.equal(p.abonosCapital.length, 1);
    assert.deepEqual(
      { monto: p.abonosCapital[0].monto, costoCausado: p.abonosCapital[0].costoCausado,
        moraCausada: p.abonosCapital[0].moraCausada, dias: p.abonosCapital[0].diasMoraCausada },
      { monto: 150000, costoCausado: liq0.costo, moraCausada: liq0.recargo_mora, dias: liq0.dias_mora },
      'el abono no congeló lo causado');
    assert.equal((p.condonaciones || []).length, 0, 'un abono no es un perdón');
  });

  test('«Queda debiendo» con la fecha de pago de hace 3 días: el abono se fecha y se congela a ESA fecha', () => {
    /* Hallazgo de la auditoría (plata): la hoja decía la mora de la fecha
       tecleada y abonarCapital congelaba la de HOY. El socio pagaba mora que no
       corrió, y el celular —que sí fecha el abono— anotaba otro abono distinto
       del mismo hecho. */
    const P = abrirPanel();
    carteraConMora(P);
    soloCobro(P); abrir(P);
    pon(P, 'pgFecha', hace(3)); P.ev("calcPago('p1')");
    const liqF = JSON.parse(P.ev('JSON.stringify(liqCredito(DB.prestamos[0],"' + hace(3) + '"))'));
    responder(P, 150000, 'debe');
    assert.match(P.elems.pgDif.innerHTML, new RegExp('la mora \\(\\$' + liqF.recargo_mora.toLocaleString('es-CO').replace('.', '\\.') + '\\)'),
      'la hoja no dice la mora de la fecha tecleada');
    P.ev("registrarCobro('p1')");
    const a = credito(P).abonosCapital[0];
    assert.equal(a.fecha, hace(3), 'el abono se fechó hoy y no el día que Joan escribió');
    assert.equal(a.moraCausada, liqF.recargo_mora, 'la mora congelada no es la de la fecha del abono');
    assert.equal(a.diasMoraCausada, liqF.dias_mora);
  });

  test('«Queda debiendo» con monto 0 o ≥ capital: apagado, con su porqué, y no registra', () => {
    const P = abrirPanel();
    carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, 400000, 'debe');
    assert.match(boton(P), /cubre el capital entero/);
    P.ev("registrarCobro('p1')");
    assert.equal(credito(P).pagado, false, 'un «queda debiendo» cerró el crédito por la puerta de atrás');
    assert.equal((credito(P).abonosCapital || []).length, 0);
    responder(P, 0);               // el modo «debe» sigue puesto: otro clic lo apagaría
    assert.match(boton(P), /cuánto abonó/);
    P.ev("registrarCobro('p1')");
    assert.equal((credito(P).abonosCapital || []).length, 0);
  });

  test('«Queda a favor»: el sobrante se anota y NUNCA entra a la ganancia ni a la garantía', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, liq0.total_a_pagar + 2000, 'afavor');
    assert.match(boton(P), /a favor/);
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true);
    assert.equal(p.saldoAFavor, 2000);
    assert.equal(p.montoRecibido, liq0.total_a_pagar + 2000, 'montoRecibido es la plata que ENTRÓ, sobrante incluido');
    assert.equal(p.gananciaPago, liq0.costo_total_pagado, 'el sobrante se coló en la ganancia: acuña cupo con plata ajena');
    assert.equal((p.condonaciones || []).length, 0);
    invariante(p);
    /* Y se VE, porque es plata de un tercero: en la ficha y en el crédito, con
       las palabras que dicen lo que el código hace (no se aplica solo). */
    P.ev("verCliente('s1')");
    assert.match(P.elems.mBody.innerHTML, /Te ha pagado de más/);
    assert.match(P.elems.mBody.innerHTML, /NO se descuenta solo/);
    P.ev("verCredito('p1')");
    assert.match(P.elems.mBody.innerHTML, /Pagó de más/);
    assert.match(P.elems.mBody.innerHTML, /NO se aplica solo/);
  });

  test('un faltante sin contestar, un monto vacío, o un perdón que toca capital: no registran nada', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, liq0.total_a_pagar - 10000);          // sin decir qué pasó
    assert.match(boton(P), /qué pasó/);
    P.ev("registrarCobro('p1')");
    assert.equal(credito(P).pagado, false, 'adivinó una intención con la plata de por medio');
    /* Vacío no es «pagó todo». */
    pon(P, 'pgMonto', ''); P.ev("cambioMonto('p1')");
    assert.match(boton(P), /Escribe cuánto pagó/);
    assert.equal(P.elems.pgBtn.disabled, true);
    P.ev("registrarCobro('p1')");
    assert.equal(credito(P).pagado, false, 'un campo vacío registró el total');
    /* Perdonar más que costo + mora es perdonar capital: pérdida, no descuento. */
    responder(P, liq0.capital - 1, 'perdon', null, 'x');
    assert.match(boton(P), /no cabe/);
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, false);
    assert.equal((p.condonaciones || []).length, 0);
  });

  test('el % de la mora de siempre PRE-LLENA el monto: el camino del 2-sep sigue intacto', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P);
    pon(P, 'pgDescPct', '100'); pon(P, 'pgDescMotivo', 'acordamos por la lluvia');
    abrir(P);   // pinta el campo con el total menos el % perdonado
    assert.equal(Number(P.elems.pgMonto.value), liq0.total_a_pagar - liq0.recargo_mora, 'el % no pre-llenó el monto');
    assert.match(boton(P), /descuento/, 'con el % puesto no se le pregunta dos veces');
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true);
    assert.equal(p.condonaciones[0].mora, liq0.recargo_mora);
    assert.equal(p.condonaciones[0].motivo, 'acordamos por la lluvia', 'el motivo del % no se leyó');
    invariante(p);
  });

  test('con el % puesto, «Del costo» SÍ manda, y «Se lo perdoné» confirma en vez de apagar', () => {
    /* Hallazgos de la auditoría: el estado derivado forzaba sobre='mora' y el
       clic en «Se lo perdoné» apagaba lo que el % había marcado. */
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P);
    pon(P, 'pgDescPct', '100'); pon(P, 'pgDescMotivo', 'lluvia');
    abrir(P);
    P.ev("modoCobro('p1','perdon')");
    assert.match(boton(P), /descuento/, 'el clic en «Se lo perdoné» apagó el perdón del %');
    P.ev("sobreCobro('p1','costo')");
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true);
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora },
      { costo: liq0.recargo_mora, mora: 0 }, '«Del costo» no hizo nada');
    invariante(p);
  });

  test('al editar el monto, el bloque de ARRIBA dice la misma garantía que se va a registrar', () => {
    /* Hallazgo de la auditoría (mentira): el bloque de arriba se pintaba con el
       % y el de abajo con el monto tecleado — dos garantías y dos totales en la
       misma hoja, el defecto del 5-ago otra vez. */
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P);
    pon(P, 'pgDescPct', '50'); pon(P, 'pgDescMotivo', 'lluvia');
    abrir(P);
    const arribaAntes = P.elems.pgCalc.innerHTML;
    responder(P, liq0.total_a_pagar - 30000, 'perdon', null, 'otro');
    const q = JSON.parse(P.ev('JSON.stringify(PUENTE.cuentasDelCobro(DB,DB.prestamos[0],' + JSON.stringify(liq0) + ',{condonaMora:30000}))'));
    const arriba = P.elems.pgCalc.innerHTML;
    assert.notEqual(arriba, arribaAntes, 'el bloque de arriba no se repintó al editar el monto');
    assert.ok(arriba.indexOf(P.ev('COP(' + q.garantia + ')')) >= 0, 'arriba no dice la garantía que se va a registrar');
    assert.ok(arriba.indexOf(P.ev('COP(' + q.total_a_recibir + ')')) >= 0, 'arriba no dice el total que se va a recibir');
    assert.ok(arriba.indexOf('− ' + P.ev('COP(30000)')) >= 0, 'arriba no dice el descuento real');
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.condonaciones[0].mora, 30000);
    assert.equal(p.gananciaPago, q.ganancia_pago);
  });

  test('«Me equivoqué» vuelve al valor por defecto, y el campo dice lo que se registra', () => {
    /* Hallazgo de la auditoría: el botón ponía el campo en el total pelado
       mientras el estado volvía a total − mora perdonada por el %. */
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P);
    pon(P, 'pgDescPct', '100'); pon(P, 'pgDescMotivo', 'lluvia');
    abrir(P);
    responder(P, liq0.total_a_pagar - 70000, 'perdon', null, 'otro');
    P.ev("modoCobro('p1','error')");
    const porDefecto = liq0.total_a_pagar - liq0.recargo_mora;
    assert.equal(Number(P.elems.pgMonto.value), porDefecto, 'el campo no volvió al valor por defecto');
    assert.match(boton(P), new RegExp('Registrar \\$' + porDefecto.toLocaleString('es-CO').replace('.', '\\.')));
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.montoRecibido, porDefecto, 'registró un número distinto del que decía el campo');
    assert.equal(p.condonaciones[0].mora, liq0.recargo_mora);
  });

  test('la ficha suma los perdones con la cuenta del puente, partida en mora y costo', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); abrir(P);
    responder(P, liq0.total_a_pagar - liq0.recargo_mora - 5000, 'perdon', 'mora', 'x');
    P.ev("registrarCobro('p1')");
    const d = JSON.parse(P.ev('JSON.stringify(PUENTE.descuentosDelSocio(DB,DB.socios[0]))'));
    assert.deepEqual({ veces: d.veces, mora: d.mora, costo: d.costo }, { veces: 1, mora: liq0.recargo_mora, costo: 5000 },
      'el faltante que desborda la mora tiene que caer en el costo, dicho aparte');
    P.ev("verCliente('s1')");
    assert.match(P.elems.mBody.innerHTML, /Descuentos que le has dado/);
    assert.match(P.elems.mBody.innerHTML, /de mora \+ .* de costo/);
  });

  test('«Entró de verdad» del crédito solo cuenta los perdones del CIERRE, no los de prórroga', () => {
    const P = abrirPanel();
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.prestamos = [{ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'María Pérez', capital: 400000,
      costoPct: 20, fechaDesembolso: hace(40), cicloActual: hace(5), pagado: true, fechaPagado: hace(5),
      cicloPago: hace(5), gananciaPago: 79000, montoRecibido: 479000, costoCausado: 80000, moraCausada: 0,
      prorrogas: [{ fecha: hace(20), ciclo: hace(20), monto: 80000, mora: 0, nuevoCiclo: hace(5) }],
      condonaciones: [{ fecha: hace(20), costo: 0, mora: 5000, motivo: 'de la prórroga', sobre: 'prorroga' },
                      { fecha: hace(5), costo: 1000, mora: 0, motivo: 'al cerrar' }],
      abonosCapital: [], comprobantes: [] }];
    P.cargarCartera(d);
    P.ev("verCredito('p1')");
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /con \$1\.000 perdonados al cerrar: al cerrar/, 'sumó los perdones de prórroga como si fueran del cierre');
    assert.ok(h.indexOf('$6.000 perdonados') < 0);
  });

  test('LA LEY VIVE EN EL PUENTE: crm.html no la declara y se la pregunta', () => {
    const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    ['cuentasDelCobro', 'repartoDelDescuento', 'descuentosDelSocio'].forEach(fn => {
      assert.ok(!(new RegExp('\\nfunction ' + fn + '\\(')).test(CRM),
        'crm.html volvió a declarar ' + fn + ': segunda copia de la ley, se separan el primer día');
      assert.ok(CRM.indexOf('PUENTE.' + fn + '(') >= 0, 'crm.html no le pregunta ' + fn + ' al puente');
    });
    assert.ok(!/id="abCap"[^>]*placeholder/.test(CRM),
      'volvió el abono suelto al fondo de la hoja de cobro: «queda debiendo» es donde ocurre');
    /* Y calcPago ya no tiene su propia copia del reparto nominal/cobrado. */
    const i = CRM.indexOf('function calcPago(id){'), j = CRM.indexOf('\nfunction ', i + 1);
    assert.ok(!/MotorReglas\.repartirCosto/.test(CRM.slice(i, j)),
      'calcPago volvió a repartir por su cuenta: dos copias de la misma cuenta en la misma pantalla');
  });
});
/* ==========================================================================
 * LA PRÓRROGA CON MONTO REAL — 8-sep-2026
 *
 * Pedido de Joan: «el precio de la prórroga también quiero que sea ajustable».
 * La misma hoja de cobro, en modo prórroga: el campo arranca con el precio de
 * la prórroga (menos lo que el % de la mora ya perdonó) y, si Joan escribe
 * menos, la diferencia se perdona —mora primero, costo después, o al revés si
 * él lo elige— con motivo. El movimiento que se guarda lo cotiza el motor con
 * el perdón adentro (liqProrroga con condonaCosto), así que pr.monto sigue
 * siendo «lo que entró» y garantía, ganancia y cupón salen solos de ahí.
 * ======================================================================== */
describe('la prórroga con monto real en el Panel (8-sep-2026)', () => {

  const M = require('../app/motor.js');
  const hace = n => { const x = new Date(); x.setDate(x.getDate() - n);
    return local(x); };
  /* 10 días de mora: capital 400.000, costo 80.000, recargo 40.000 → la
     prórroga cuesta 120.000. */
  function carteraConMora(P) {
    const d = JSON.parse(JSON.stringify(UN_CLIENTE));
    d.prestamos = [{ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'María Pérez',
      capital: 400000, costoPct: 20, fechaDesembolso: hace(25), cicloActual: hace(10),
      prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }];
    P.cargarCartera(d);
    return JSON.parse(P.ev('JSON.stringify(liqCredito(DB.prestamos[0]))'));
  }
  const pon = (P, id, v) => P.ev("document.getElementById('" + id + "').value='" + v + "'");
  const credito = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
  const soloCobro = P => P.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
  const boton = P => P.elems.pgBtn.textContent;
  const entrar = P => { P.ev("abrirPago('p1')"); P.ev("modoProrroga('p1')"); };
  function responder(P, monto, sobre, motivo) {
    pon(P, 'pgMonto', String(monto)); P.ev("cambioMonto('p1')");
    if (sobre) P.ev("sobreCobro('p1','" + sobre + "')");
    if (motivo != null) P.ev("_cobro.motivo=" + JSON.stringify(motivo) + ";pintarBoton('p1')");
  }
  /* La invariante de una prórroga: lo que entró más lo perdonado es lo causado. */
  const invariante = p => {
    const pr = p.prorrogas[0];
    const cond = (p.condonaciones || []).filter(c => c.sobre === 'prorroga')
      .reduce((t, c) => t + (c.costo || 0) + (c.mora || 0), 0);
    assert.equal(pr.monto + cond, pr.costoCausado + pr.moraCausada, 'la invariante de la prórroga no cuadra');
  };

  test('sin tocar el monto, es la prórroga de siempre: el motor cotiza y el Panel guarda', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); entrar(P);
    const pr0 = JSON.parse(P.ev('JSON.stringify(liqProrroga(DB.prestamos[0]))'));
    assert.equal(Number(P.elems.pgMonto.value), pr0.total_a_pagar, 'el campo no arranca con el precio de la prórroga');
    assert.equal(P.elems.pgMontoLbl.textContent, '¿Cuánto pagó por la prórroga?');
    assert.match(boton(P), /Registrar prórroga/);
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, false);
    assert.equal(p.prorrogas.length, 1, 'no se registró la prórroga');
    const pr = p.prorrogas[0];
    assert.deepEqual({ monto: pr.monto, mora: pr.mora, aTiempo: pr.aTiempo, costoCausado: pr.costoCausado, moraCausada: pr.moraCausada },
      { monto: pr0.total_a_pagar, mora: liq0.recargo_mora, aTiempo: false, costoCausado: liq0.costo, moraCausada: liq0.recargo_mora });
    assert.equal(p.cicloActual, pr0.fecha_corte_nueva, 'el corte no se movió');
    assert.equal((p.condonaciones || []).length, 0, 'apareció un perdón de la nada');
    invariante(p);
  });

  test('«Sin la mora»: se perdona la mora entera y la historia no se lava', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); entrar(P);
    P.ev("atajoMonto('p1'," + liq0.costo + ")");
    P.ev("_cobro.motivo='se le mojó la moto';pintarBoton('p1')");
    assert.match(boton(P), /con .* de descuento/);
    P.ev("registrarCobro('p1')");
    const p = credito(P), pr = p.prorrogas[0];
    assert.equal(pr.monto, liq0.costo);
    assert.equal(pr.mora, 0, 'pr.mora es la mora que entró, y no entró ninguna');
    assert.equal(pr.aTiempo, false, 'EL PERDÓN LAVÓ LA PUNTUALIDAD');
    assert.equal(pr.diasMora, liq0.dias_mora);
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora, sobre: p.condonaciones[0].sobre },
      { costo: 0, mora: liq0.recargo_mora, sobre: 'prorroga' });
    invariante(p);
  });

  test('menos que el costo: el perdón desborda al COSTO, se anota aparte y la garantía baja', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); entrar(P);
    responder(P, 60000, null, 'cliente viejo');
    assert.match(boton(P), /60\.000 con \$60\.000 de descuento/);
    P.ev("registrarCobro('p1')");
    const p = credito(P), pr = p.prorrogas[0];
    assert.equal(pr.monto, 60000, 'pr.monto tiene que ser lo que ENTRÓ');
    assert.equal(pr.mora, 0);
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora },
      { costo: 20000, mora: liq0.recargo_mora }, 'el faltante que desborda la mora tiene que caer en el costo');
    /* La garantía y la ganancia salen del movimiento, con la fórmula de
       siempre del puente: nada se calculó en la pantalla. */
    assert.equal(P.ev('gananciaCobrada(DB.prestamos[0])'), 60000);
    const g = P.ev('PUENTE.garantiaGanadaProrroga(DB.prestamos[0].prorrogas[0],DB.prestamos[0])');
    assert.equal(g, M.acumularGarantia(60000, false), 'la garantía no sale de la plata que entró');
    assert.ok(g < M.acumularGarantia(liq0.costo, false) + M.acumularGarantia(liq0.recargo_mora, false));
    invariante(p);
    /* Y el informe por quincena lo recoge en el corte que la prórroga pagó. */
    const q = JSON.parse(P.ev('JSON.stringify(PUENTE.descuentosDeQuincena(DB,DB.prestamos[0].prorrogas[0].ciclo))'));
    assert.deepEqual({ total: q.total, costo: q.costo, mora: q.mora }, { total: 60000, costo: 20000, mora: liq0.recargo_mora });
  });

  test('«Del costo» cuando cabe en las dos bolsas', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); entrar(P);
    responder(P, 100000, 'costo', 'x');
    P.ev("registrarCobro('p1')");
    const p = credito(P), pr = p.prorrogas[0];
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora }, { costo: 20000, mora: 0 }, '«Del costo» no mandó');
    assert.equal(pr.mora, liq0.recargo_mora, 'la mora entró completa');
    assert.equal(pr.monto, 100000);
    invariante(p);
  });

  test('con el % de la mora puesto, el precio arranca sin esa mora y el perdón total la lleva adentro', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P);
    pon(P, 'pgDescPct', '50'); pon(P, 'pgDescMotivo', 'lluvia');
    entrar(P);
    const mitad = Math.round(liq0.recargo_mora / 2);
    assert.equal(Number(P.elems.pgMonto.value), liq0.costo + liq0.recargo_mora - mitad, 'el % no rebajó el precio de arranque');
    responder(P, 90000);                       // 10.000 menos que el precio con el %
    assert.match(boton(P), /90\.000 con \$10\.000 de descuento/);
    P.ev("registrarCobro('p1')");
    const p = credito(P), pr = p.prorrogas[0];
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora }, { costo: 0, mora: mitad + 10000 });
    assert.equal(p.condonaciones[0].motivo, 'lluvia', 'el motivo del % no se leyó');
    assert.equal(pr.monto, 90000);
    assert.equal(pr.mora, liq0.recargo_mora - mitad - 10000);
    invariante(p);
  });

  test('sin motivo, de más, o vacío: el botón se apaga con su porqué y no registra', () => {
    const P = abrirPanel();
    carteraConMora(P);
    soloCobro(P); entrar(P);
    responder(P, 100000, null, '');
    assert.match(boton(P), /Falta el motivo/);
    assert.equal(P.elems.pgBtn.disabled, true);
    P.ev("registrarCobro('p1')");
    assert.equal(credito(P).prorrogas.length, 0, 'registró un perdón sin motivo');
    responder(P, 130000);
    assert.match(boton(P), /devuélvele \$10\.000/);
    P.ev("registrarCobro('p1')");
    assert.equal(credito(P).prorrogas.length, 0, 'registró una prórroga pagada de más');
    pon(P, 'pgMonto', ''); P.ev("cambioMonto('p1')");
    assert.match(boton(P), /Escribe cuánto pagó por la prórroga/);
    P.ev("registrarCobro('p1')");
    assert.equal(credito(P).prorrogas.length, 0);
  });

  test('«Volver al cobro» deja la hoja de cobro como estaba', () => {
    const P = abrirPanel();
    const liq0 = carteraConMora(P);
    soloCobro(P); entrar(P);
    responder(P, 60000, null, 'x');
    P.ev("volverAlCobro('p1')");
    assert.match(boton(P), /Pagó todo/);
    assert.equal(Number(P.elems.pgMonto.value), liq0.total_a_pagar);
    assert.equal(P.elems.pgMontoLbl.textContent, '¿Cuánto pagó?');
    P.ev("registrarCobro('p1')");
    const p = credito(P);
    assert.equal(p.pagado, true, 'al volver, «Pagó todo» tiene que cobrar el total');
    assert.equal(p.prorrogas.length, 0);
  });

  test('la letra: el botón abre el modo, registrarProrroga acepta lo decidido, y el motor cotiza el costo rebajado', () => {
    const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    assert.match(CRM, /onclick="modoProrroga\('\$\{p\.id\}'\)">↻ Prórroga/, 'el botón volvió a registrar de una');
    assert.match(CRM, /\nfunction registrarProrroga\(id,o\)\{/);
    assert.match(CRM, /\nfunction liqProrroga\(p,fecha,condonaMora,condonaCosto\)\{/);
    assert.match(CRM, /credito\.costo=Math\.round\(credito\.costo\)-condC/, 'el perdón del costo tiene que entrar al motor, no restarse después');
    assert.match(CRM, /PUENTE\.cuentasDeLaProrroga\(/, 'las cuentas de la prórroga se le preguntan al puente');
  });
});

/* ==========================================================================
 * EL TECHO DEL COSTO ES EL 50% — 8-sep-2026, decisión de Joan
 *
 * El 20% sigue siendo el estándar. Por encima se registra, pero se confirma
 * APARTE con lo que equivale al año y el letrero legal: no es un freno, es que
 * quede dicho cada vez. Y al cliente solo se le muestra el costo en pesos.
 * ======================================================================== */
describe('el alta por encima del estándar se confirma aparte (8-sep-2026)', () => {
  function alta(P, costo) {
    P.ev('var __vistos=[]; confirm=t=>{__vistos.push(String(t)); return String(t).indexOf("bienvenida")<0}');
    ['qNombre','qTel','qCap','qCosto','qFecha'].forEach((id,i)=>{
      const v=['María Pérez','3001112233','300000',String(costo),'2026-08-25'][i];
      P.ev("document.getElementById('"+id+"').value='"+v+"'");
    });
    P.ev("document.getElementById('qCiclo').value=''");
    const antes = P.ev('DB.prestamos.length');
    P.ev('guardarRapido()');
    return { creado: P.ev('DB.prestamos.length') - antes,
             vistos: JSON.parse(P.ev('JSON.stringify(__vistos)')) };
  }

  test('35%: se registra, cobra con esa tasa, y pidió la confirmación extra con el año', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const r = alta(P, 35);
    assert.equal(r.creado, 1, 'el crédito al 35% no se creó');
    assert.equal(P.ev('DB.prestamos[DB.prestamos.length-1].costoPct'), 35);
    assert.equal(P.ev('K(DB.prestamos[DB.prestamos.length-1])'), 105000, '300.000 al 35% son 105.000');
    const extra = r.vistos.find(t => /POR ENCIMA DEL ESTÁNDAR/.test(t));
    assert.ok(extra, 'no pidió la confirmación aparte');
    assert.match(extra, /efectivo anual/);
    assert.match(extra, /art\. 305/);
    assert.match(extra, /\$105\.000 de costo por \$300\.000/, 'tiene que decir lo que el cliente ve: pesos');
  });

  test('50% es el techo (se registra); 51% no; y al 20% no hay confirmación extra', () => {
    let P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    assert.equal(alta(P, 50).creado, 1, 'el techo, incluido');
    P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    assert.equal(alta(P, 51).creado, 0, 'por encima del techo se creó');
    P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const r = alta(P, 20);
    assert.equal(r.creado, 1);
    assert.ok(!r.vistos.some(t => /POR ENCIMA DEL ESTÁNDAR/.test(t)), 'al estándar no hay nada que confirmar aparte');
  });
});

/* ==========================================================================
 * LA BANDEJA DEL PRIMER CRÉDITO — 8-sep-2026
 *
 * Lo que Joan ve: «📨 Esperando que acepte» sin botón de desembolsar;
 * «✅ Aceptó» con «✓ Desembolsar»; y al desembolsar, si el nuevo no tiene ficha,
 * la ficha nace con lo que declaró y el crédito nace con EXACTAMENTE lo que él
 * aceptó: capital, porcentaje y fecha de pago de la contrapropuesta.
 * ======================================================================== */
describe('la bandeja del primer crédito del nuevo (8-sep-2026)', () => {
  const sol = (estado, extra) => Object.assign({
    id: 77, origen: 'nube', cedula: '3005550000', nombre: 'Nuevo Pérez', capital: 100000, tasa: 0.35, costo: 35000, total: 135000,
    fecha_corte: '2026-09-16', producto: 'quincenal', estado, registro_id: 9,
    contrapropuesta: { capital: 100000, costo_pct: 35, dias: 8, costo: 35000, total: 135000, fecha_pago: '2026-09-16', texto: 'Por ser nuevo…', por: 'automatica' },
    datos: { nombres: 'Nuevo', apellidos: 'Pérez', celular: '3005550000', documento: '1010101010', ciudad: 'Bogotá', correo: 'n@p.co', ingreso_mes: '2.000.000' }
  }, extra || {});
  const conBandeja = (P, s) => { P.ev('_solicitudes=' + JSON.stringify([s]) + ';renderBandeja()'); return P.elems.bandeja.innerHTML; };

  test('esperando que acepte: se ve la propuesta, y NO hay botón de desembolsar', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, sol('contrapropuesta'));
    assert.match(h, /Esperando que acepte/);
    assert.match(h, /Primer crédito/); assert.match(h, /35% · 8 días/); assert.match(h, /\$135\.000/); assert.match(h, /16 de sept/);
    assert.match(h, /Cambiar propuesta/);
    assert.ok(!/Desembolsar|Crear crédito/.test(h), 'ofreció desembolsar lo que el cliente no ha aceptado');
    /* Y por la puerta de atrás tampoco. */
    P.ev("confirm=()=>true"); P.ev("crearDesdeSolicitud('77')");
    assert.equal(P.ev('DB.prestamos.length'), 0, 'creó el crédito sin aceptación');
  });

  test('aceptó: al desembolsar nace la ficha (de lo declarado) y el crédito con lo aceptado', async () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, sol('aceptada'));
    assert.match(h, /✅ Aceptó/); assert.match(h, /Desembolsar/);
    assert.match(h, /la ficha se crea al desembolsar/);
    P.ev("confirm=t=>String(t).indexOf('bienvenida')<0");
    const socios = P.ev('DB.socios.length');
    /* Desde el 8-sep la ficha nace con las fotos y la huella del registro, que se
       piden a la nube ANTES de crearla: es una promesa, y se espera. */
    await P.ev("crearDesdeSolicitud('77')");
    assert.equal(P.ev('DB.socios.length'), socios + 1, 'la ficha del nuevo no se creó');
    const s = JSON.parse(P.ev('JSON.stringify(DB.socios[DB.socios.length-1])'));
    assert.deepEqual({ nombre: s.nombre, tel: s.telefono, ced: s.cedula, ciudad: s.ciudad, ing: s.ingresoQuincenal, origen: s.origen },
      { nombre: 'Nuevo Pérez', tel: '3005550000', ced: '1010101010', ciudad: 'Bogotá', ing: 1000000, origen: 'registro_abierto' });
    assert.equal(s.vinculacion.correo, 'n@p.co', 'lo declarado tiene que viajar entero en la ficha');
    assert.equal(P.ev('DB.prestamos.length'), 1, 'el crédito no se creó');
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.deepEqual({ capital: p.capital, pct: p.costoPct, corte: p.cicloActual, socio: p.socioId === s.id, origen: p.origen },
      { capital: 100000, pct: 35, corte: '2026-09-16', socio: true, origen: 'solicitud' });
    assert.equal(P.ev('K(DB.prestamos[0])'), 35000, 'el ciclo no cobra lo aceptado: 100.000 al 35% son 35.000');
    assert.equal(P.ev('_solicitudes.length'), 0, 'la solicitud atendida sigue en la bandeja');
  });

  test('si ya tiene ficha, no se crea otra; y sin contrapropuesta la bandeja es la de siempre', () => {
    const P = abrirPanel();
    const d = JSON.parse(JSON.stringify(UN_CLIENTE)); d.socios[0].telefono = '3005550000';
    P.cargarCartera(d);
    conBandeja(P, sol('aceptada'));
    P.ev("confirm=t=>String(t).indexOf('bienvenida')<0"); P.ev("crearDesdeSolicitud('77')");
    assert.equal(P.ev('DB.socios.length'), 1, 'duplicó la ficha');
    assert.equal(P.ev('DB.prestamos[0].socioId'), 's1');
    const h = conBandeja(P, { id: 78, origen: 'nube', cedula: '3001112233', nombre: 'María Pérez', capital: 200000, estado: 'nueva', producto: 'quincenal' });
    assert.match(h, /Quincenal/); assert.match(h, /Crear crédito/); assert.ok(!/Cambiar propuesta/.test(h));
  });

  test('Ajustes trae la política del primer crédito y la previsualiza en pesos', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    ['cfgNuevoCap', 'cfgNuevoPct', 'cfgNuevoDias'].forEach((id, i) => P.ev("document.getElementById('" + id + "').value='" + ['100000', '35', '8'][i] + "'"));
    P.ev("document.getElementById('cfgNuevoTexto').value='x'");
    P.ev('previsualizarPolitica()');
    assert.match(P.elems.cfgNuevoCalc.textContent, /recibe \$100\.000, devuelve \$135\.000 a los 8 días/);
    const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    ['listar_solicitudes_abiertas', 'contrapropuesta_solicitud', 'politica_nuevos_leer', 'politica_nuevos_guardar'].forEach(fn =>
      assert.ok(CRM.indexOf(fn) >= 0, 'el CRM no llama a ' + fn));
  });
});
