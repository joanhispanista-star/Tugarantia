/* ============================================================================
 * EL BANCO DE PRUEBAS DEL PANEL — un navegador de mentira
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): es el aparato con
 * el que panel.test.js y repartir.test.js ARRANCAN crm.html de verdad, con un
 * DOM y un localStorage falsos, y le preguntan cosas.
 *
 * Vivía dentro de panel.test.js hasta el 10-sep-2026. Salió acá cuando hizo
 * falta en un segundo archivo: dos copias del banco es como una regla escrita
 * dos veces — el día que crm.html cargue un <script src> nuevo, una de las dos
 * se queda vieja y sus pruebas pasan en verde sobre una página que no arranca.
 * ==========================================================================*/

'use strict';

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
    /* 16-sep-2026 — `click()` faltaba, y sin el ninguna prueba podia ejecutar una
       descarga: el patron <a> + click() es como este CRM baja el respaldo y el
       CSV de cobranzas. Se anota para poder comprobar QUE se bajo. */
    click() { (ctx._clics = ctx._clics || []).push({ href: this.href, nombre: this.download }); },
    querySelectorAll: () => [], appendChild() {}, setAttribute() {}, focus() {},
    /* `remove()` es un metodo de verdad de cualquier elemento y al banco le
       faltaba. Sin el, un `caja.remove()` que en un navegador funciona reventaba
       aca, y la prueba acusaba al CRM de un fallo que era del banco. Un banco
       mas pobre que el navegador no prueba el navegador: prueba otra cosa. */
    remove() { if (this.id) delete elems[this.id]; this._quitado = true; }
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('nuevo'), addEventListener() {},
    body: elem('body'), documentElement: elem('html'), title: ''
  };
  const ctx = {
    console,
    document: doc,
    /* 15-sep-2026 — LOS AVISOS SE ANOTAN. Antes se tiraban, y por eso no habia
       forma de probar QUE le dice el CRM a Joan cuando algo sale mal: solo si
       seguia vivo. La diferencia entre «Archivo invalido» y «no cupo» es la
       diferencia entre mandarlo a buscar un respaldo que no existe y decirle la
       verdad, y eso solo se prueba leyendo el aviso. */
    alert(m) { (ctx._avisos = ctx._avisos || []).push(String(m)); },
    confirm: () => true,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      /* 15-sep-2026 — el almacen se puede LLENAR a proposito. Sin esto no habia
         forma de probar que pasa cuando el navegador se queda sin espacio, que
         es el caso en que el CRM mas puede mentir: hasta hoy mostraba un aviso
         y seguia como si hubiera guardado. Con `o.topeKB` el banco lanza igual
         que un navegador de verdad. */
      setItem: (k, v) => {
        const t = String(v);
        if (o.topeKB && (t.length / 1024) > o.topeKB) {
          const e = new Error('QuotaExceededError');
          e.name = 'QuotaExceededError';
          throw e;
        }
        almacen[k] = t;
      },
      removeItem: k => { delete almacen[k]; }
    },
    location: { href: 'http://localhost:8126/panel/crm.html', hash: o.hash || '',
      pathname: '/panel/crm.html', search: '' },
    history: { replaceState() {} },
    /* 15-sep-2026 — `storage` entra al navegador de mentira para poder
       comprobar que el CRM pide de verdad el permiso persistente. Se anota si
       lo pidio (`_pidioPersistir`) en vez de solo devolver una promesa: sin
       eso, la unica forma de probarlo era buscar el texto en el archivo, y un
       centinela que busca texto aprueba `if (false)`. */
    navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() },
      storage: {
        persisted: function () { return Promise.resolve(false); },
        persist: function () { ctx._pidioPersistir = true; return Promise.resolve(true); }
      } },
    /* Sin red a propósito: el Panel TIENE que andar sin nube, y una prueba que
       dependiera de internet no sería una prueba.

       Con `o.red` se le puede dar una nube de mentiras a la que preguntarle.
       Hace falta para las pantallas del equipo, donde lo que importa no es que
       el Panel ande sin nube sino QUÉ DICE cuando el servidor contesta 404 —que
       es lo que contesta mientras una migración no esté corrida— frente a
       cuando contesta que no. Confundir las dos manda al asesor a revisar su
       señal por un problema que está en el servidor. */
    fetch: (url, cfg) => (o.red ? o.red(String(url), cfg)
      : Promise.reject(new Error('sin red en el banco de pruebas'))),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    TextEncoder, TextDecoder, URL, Intl, Date, Math, JSON,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    /* 16-sep-2026 — EL Blob DE VERDAD, no un cascarón. Era `class {}`, y como
       `URL` sí es el de Node, `URL.createObjectURL(new Blob(...))` reventaba con
       «must be an instance of Blob. Received an instance of Blob» — el error más
       confuso posible. Con eso, ninguna prueba podía ejecutar una descarga: ni
       el respaldo, ni el CSV de cobranzas. */
    Blob: Blob,
    /* 15-sep-2026 — UN FileReader QUE DE VERDAD LEE. Era `class {}`, un cascaron,
       y por eso importar() —el SEGUNDO escritor de la cartera, el que reemplaza
       todo— no lo habia ejecutado ninguna prueba en la vida: solo se miraba su
       texto. Lee sincronico a proposito: una prueba no tiene por que esperar a
       un tick para comprobar lo que el CRM hace con un archivo. */
    FileReader: class {
      readAsText(f) {
        this.result = f && f.texto !== undefined ? f.texto : String(f);
        if (this.onload) this.onload({ target: this });
      }
    }
  };
  ctx.window = ctx; ctx.self = ctx;
  /* Los dos que crm.html carga con <script src>. El puente se publica como
     window.PuenteTuGarantia, que es de donde lo toma la página. */
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.PuenteTuGarantia = require(path.join(RAIZ, 'app', 'puente.js'));
  /* 15-sep-2026 — nube.js. El CRM lo carga desde hoy y guardar() lo usa para
     salvar la cartera sin fotos cuando el navegador se llena. Sin esto aca, esa
     rama se probaba MUERTA: el banco no le daba el modulo, dbSinFotos no
     existia, y la prueba veia «no guardo nada» sin saber por que. */
  ctx.NubeTuGarantia = require(path.join(RAIZ, 'panel', 'nube.js'));
  /* 28-ago-2026: el chat, que crm.html toma de window.ChatTuGarantia.
     `sinChat: true` simula que ese <script src> no llegó — que es lo que pasa
     con un service worker viejo o sin señal, y lo que tumbó el Panel el día que
     se entregó el chat. */
  if (!o.sinChat) ctx.ChatTuGarantia = require(path.join(RAIZ, 'app', 'chat.js'));
  /* 9-sep-2026 — las comisiones del equipo. `sinComisiones: true` simula que
     ESE <script src> no llego, que es lo que pasa con un service worker viejo. */
  if (!o.sinComisiones) ctx.ComisionesTuGarantia = require(path.join(RAIZ, 'app', 'comisiones.js'));
  /* 10-sep-2026 — las etapas de cartera y el lector de bases, los otros dos
     <script src> de crm.html. Sin ellos el Panel se pinta por el camino del
     «ese archivo no llegó», que no es el que ve Joan. */
  if (!o.sinEtapas) ctx.EtapasTuGarantia = require(path.join(RAIZ, 'app', 'etapas.js'));
  /* 16-sep-2026 — la tabla certificada del techo de usura y la TIR, que el CRM
     pasa a cargar para poder mandar una contrapropuesta a cuotas sin pasarse. */
  if (!o.sinCreditos) ctx.CreditosPublicables = require(path.join(RAIZ, 'app', 'creditos.js'));
  if (!o.sinBases) ctx.BasesTuGarantia = require(path.join(RAIZ, 'app', 'bases.js'));
  /* 16-sep-2026 — LOS DOS DE COBRANZAS, que faltaban. El CRM los toma de
     window.CobranzaEnvio y window.TandaTuGarantia, y el banco no se los daba:
     toda la pestaña de Cobranzas —la que manda mensajes de cobro y la que
     aplica los topes de la Ley 2300— NUNCA se habia ejecutado en una prueba.
     Por eso TODOS sus centinelas miraban el texto del archivo, y por eso el que
     vigila que no se pueda agregar a alguien que la ley excluyo estuvo ciego
     desde que se escribio.
     `sinCobranza: true` simula que ese <script src> no llego, que es lo que
     pasa con un service worker viejo, y es la rama que pinta «Faltan los
     archivos cobranza-envio.js o tanda.js». */
  if (!o.sinCobranza) {
    ctx.CobranzaEnvio = require(path.join(RAIZ, 'app', 'cobranza-envio.js'));
    ctx.TandaTuGarantia = require(path.join(RAIZ, 'panel', 'tanda.js'));
  }
  vm.createContext(ctx);

  const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  bloques.forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'crm.html#' + i }));

  const ev = expr => vm.runInContext(expr, ctx, { filename: 'banco' });
  const cargarCartera = d => {
    almacen['joan_socios_v1'] = JSON.stringify(d);
    return ev('DB=cargar()');
  };
  /* `ctx` sale afuera para poder meterle objetos a la página —un nodo de
     mentira, por ejemplo— y leer después lo que el CRM les hizo. Sin esto, todo
     lo que se le entrega al Panel tiene que caber en un `ev()` como texto, y un
     objeto con métodos no cabe. */
  return { ev, cargarCartera, elems, almacen, ctx };
}

module.exports = { abrirPanel };
