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
  /* 23-oct-2026 — `almacen: A` RECARGA en el mismo navegador: el segundo
     abrirPanel con el mismo objeto arranca con lo que el primero dejó escrito
     (la cartera, la sesión de 24 h), igual que un F5. Sin esto no había forma
     de probar lo que la página hace AL ARRANCAR con algo ya guardado: el
     almacén nacía vacío en cada apertura. */
  const almacen = o.almacen || {};
  const elems = {};
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', checked: false, textContent: '', innerHTML: '',
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, querySelector: () => elem(id + '>hijo'),
    /* 16-sep-2026 — `click()` faltaba, y sin el ninguna prueba podia ejecutar una
       descarga: el patron <a> + click() es como este CRM baja el respaldo y el
       CSV de cobranzas. Se anota para poder comprobar QUE se bajo. */
    click() { (ctx._clics = ctx._clics || []).push({ href: this.href, nombre: this.download }); },
    querySelectorAll: () => [], appendChild() {}, focus() {},
    /* 23-oct-2026 — los atributos se ANOTAN en `_attrs`. setAttribute no hacía
       nada, y por eso ninguna prueba podía comprobar que la puerta del CRM
       saca de verdad lo de debajo del lector de pantalla (aria-hidden), ni
       que se lo devuelve al quitarse. removeAttribute faltaba: es de
       cualquier elemento, y sin él el banco reventaba donde el navegador no. */
    setAttribute(k, v) { (this._attrs = this._attrs || {})[k] = String(v); },
    removeAttribute(k) { if (this._attrs) delete this._attrs[k]; },
    /* `remove()` es un metodo de verdad de cualquier elemento y al banco le
       faltaba. Sin el, un `caja.remove()` que en un navegador funciona reventaba
       aca, y la prueba acusaba al CRM de un fallo que era del banco. Un banco
       mas pobre que el navegador no prueba el navegador: prueba otra cosa. */
    remove() { if (this.id) delete elems[this.id]; this._quitado = true; }
  });
  /* 23-oct-2026 — `tarjeta: true` le da a la página LA TARJETA DE LA PUERTA
     (`#gate .gate-card`) con el HTML de verdad de crm.html. Sin ella
     querySelector devuelve null, pintarPuertaEquipo no pinta nada y el
     cambio de tarjeta —PIN de Joan ↔ celular y contraseña del equipo— no se
     ve: justo donde Joan se quedaba sin campo del PIN. Opcional para no
     cambiarles nada a las pruebas que ya existen. */
  if (o.tarjeta) {
    const m = html.match(/<div class="gate-card">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="app" id="app"/);
    elem('gate-card').innerHTML = m ? m[1] : '';
  }
  const doc = {
    getElementById: elem, querySelectorAll: () => [],
    querySelector: sel => (o.tarjeta && sel === '#gate .gate-card' ? elem('gate-card') : null),
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
    /* 17-sep-2026 — LA HORA ES UN DATO, no algo que la página averigüe sola.
       `horarioLegalHoy()` y `hoyISO()` viven dentro de crm.html y cuelgan las
       dos de `new Date()`. Con `ahora` se les entrega un Date congelado y las
       pruebas de Cobranzas dejan de depender de a qué hora se corran: antes la
       misma suite daba 1.875 en verde a las 07:38 y 1.865 a las 23:30, porque
       de noche la reja de la Ley 2300 está cerrada y la lista sale vacía.
       Sin `ahora` se usa el reloj de verdad, que es lo que tiene que seguir
       pasando en las pruebas que vigilan el vencimiento de la tabla de usura:
       ésas no son frágiles, son alarmas. El porqué largo está en reloj.js. */
    TextEncoder, TextDecoder, URL, Intl, Math, JSON,
    Date: o.ahora ? require('./reloj.js').relojFijo(o.ahora) : Date,
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
  /* 23-oct-2026 — `puente: P => otro` cambia el puente que recibe la página:
     sirve para simular el app/puente.js viejo de la caché (el primer F5
     después de publicar) quitándole una función. Recibe el de verdad y debe
     devolver una COPIA: `require` lo comparte con todo el proceso, y tocarlo
     le quitaría la función a las demás pruebas. */
  if (typeof o.puente === 'function') ctx.PuenteTuGarantia = o.puente(ctx.PuenteTuGarantia);
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
  /* 19-oct-2026 — la calculadora del pedido, el <script src> nuevo de crm.html:
     el CRM la usa para leer el estimado que vio el cliente y avisarle a Joan si
     su propuesta se aleja. Copia propia por banco (guarda estado en el módulo,
     como en banco-play.js). `sinCalculadora: true` simula que no llegó. */
  if (!o.sinCalculadora) {
    delete require.cache[require.resolve(path.join(RAIZ, 'app', 'calculadora-solicitud.js'))];
    ctx.CalculadoraSolicitud = require(path.join(RAIZ, 'app', 'calculadora-solicitud.js'));
  }
  if (!o.sinBases) ctx.BasesTuGarantia = require(path.join(RAIZ, 'app', 'bases.js'));
  /* 22-oct-2026 — la lista de bancos y las reglas de la cuenta, los <script
     src> nuevos de crm.html («💸 Consignar a: …»). `sinCuentas: true` simula
     que no llegaron. */
  if (!o.sinCuentas) {
    ctx.BancosColombia = require(path.join(RAIZ, 'app', 'bancos-colombia.js'));
    ctx.CuentasPago = require(path.join(RAIZ, 'app', 'cuentas-pago.js'));
  }
  /* 7-oct-2026 — la puerta única: las palabras del toque «¿Es la misma
     persona?» y el pase de un uso de «Ver la app como la ve él», los dos
     <script src> nuevos de crm.html. `sinUnaPuerta: true` simula que no llegaron.
     revision-registro.js va también: el toque la usa y, en un navegador, el
     CRM la baja al primer toque (cargarScriptCRM), que acá no hay. */
  /* 15-oct-2026 — las reglas de la venta del gerente, el <script src> nuevo
     de crm.html. `sinGerenteVende: true` simula que no llegó. */
  if (!o.sinGerenteVende) ctx.GerenteVende = require(path.join(RAIZ, 'panel', 'gerente-vende.js'));
  /* 19-oct-2026 — «🔑 Mi contraseña» del equipo, el <script src> nuevo de
     crm.html. Trae sus reglas de app/cuenta.js por su cuenta (require), así
     que no depende de que el banco le dé CuentaSocio a la página.
     `sinMiClave: true` simula que no llegó. */
  if (!o.sinMiClave) ctx.MiClave = require(path.join(RAIZ, 'panel', 'mi-clave.js'));
  if (!o.sinUnaPuerta) {
    ctx.UnaPuerta = require(path.join(RAIZ, 'panel', 'una-puerta.js'));
    ctx.VerComo = require(path.join(RAIZ, 'app', 'ver-como.js'));
    ctx.RevisionRegistro = require(path.join(RAIZ, 'app', 'revision-registro.js'));
  }
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
  /* 16-sep-2026 — el modulo de gestion del asesor, que tampoco estaba: por eso
     las pantallas del equipo (mensajearEq, contactarEq, anotarGestionEq) nunca
     se habian ejecutado en una prueba. Y una de ellas resulto ser la unica ruta
     de envio que no consultaba la lista de quienes pidieron SALIR. */
  if (!o.sinGestionAsesor) {
    ctx.GestionAsesor = require(path.join(RAIZ, 'app', 'gestion-asesor.js'));
    ctx.AsesorTextos = require(path.join(RAIZ, 'app', 'asesor-textos.js'));
    /* 17-sep-2026 — EL MÓDULO COMPARTE RELOJ CON LA PÁGINA, como en un navegador.
       `puedeContactar` acepta `{ahora}` y crm.html no se lo pasa, así que cae en
       su `new Date()`. En un navegador eso es el MISMO reloj de la página y no
       hay diferencia; acá sí la hay, porque el módulo se carga con require —en
       el realm de Node— y la página corre dentro de un `vm` con su propio Date.
       Sin esta costura, congelarle la hora a la página dejaba fuera justo las
       dos rutas del equipo (mensajearEq, contactarEq), que son las que llaman a
       este módulo. Restaurar el reloj único no es maquillar el banco: es
       ponerlo al nivel del navegador, que es la regla de esta casa.
       Se copia el objeto en vez de tocarlo: `require` lo comparte con TODO el
       proceso y ensuciarlo le cambiaría la hora a las demás pruebas. */
    if (o.ahora) {
      const G = ctx.GestionAsesor;
      ctx.GestionAsesor = Object.assign({}, G, {
        puedeContactar: (persona, opciones) =>
          G.puedeContactar(persona, Object.assign({ ahora: new ctx.Date() }, opciones))
      });
    }
  }
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
