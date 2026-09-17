'use strict';
/* ==========================================================================
 * LA VITRINA DE play/ — 9 de septiembre de 2026
 *
 * Joan pidió que el cliente nuevo viera más: una calculadora, a dónde se puede
 * llegar, la historia del proyecto y por qué conviene pagar en fecha. Pidió
 * también «una garantía ficticia y un cupo de hasta 4 millones».
 *
 * LO QUE VIGILA ESTE ARCHIVO ES JUSTO ESO ÚLTIMO. Una app de crédito que le
 * enseña a un visitante cifras que parecen suyas y no lo son es publicidad
 * engañosa, y la casa tiene una regla más vieja que este archivo: la interfaz
 * nunca promete lo que el código no hace. Así que acá no se comprueba que la
 * vitrina se vea bonita — se comprueba que no pueda volverse deshonesta sin que
 * una prueba lo grite.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { asentar } = require('./esperar.js');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../app/creditos.js');
const M = require('../app/motor.js');
const K = require('../app/cumplimiento.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PLAY = leer('play/index.html');
const CSS = leer('play/estilo.css');
/* Sin comentarios: lo que se vigila es lo que se PUBLICA, y un comentario que
   explique por qué NO se muestran 4 millones no puede hacer caer la prueba. */
const VIVO = PLAY.replace(/\/\*[\s\S]*?\*\//g, ' ');
const HOY = '2026-09-09';

describe('la vitrina no puede prometer lo que el producto no da', () => {

  test('NINGÚN «4.000.000» en la puerta pública', () => {
    /* Joan pidió un cupo de hasta cuatro millones. El producto que esta app
       vende llega a 2.000.000 y solo en el perfil más alto: pedirle 4.000.000 al
       motor devuelve puede:false, motivo 'sobre_cupo', y el servidor lo rechaza
       otra vez (play_solicitar). Un número que la plataforma no puede
       desembolsar, puesto donde alguien lea «mi cupo», es una oferta que no
       existe.
       Se prohíbe el LITERAL y no el valor a propósito: subir de verdad el cupo
       en creditos.js rompe otras pruebas al instante y se discute; escribir
       «$4.000.000» a mano en una tarjeta no rompía nada. */
    ['4000000', '4.000.000', "4'000.000"].forEach(lit => {
      assert.ok(VIVO.indexOf(lit) === -1,
        'apareció «' + lit + '» en play/: el producto llega hasta ' +
        C.PERFILES.preferente.cupo_maximo + ' y el motor niega más');
    });
    /* 9-sep-2026 — y la regla se generaliza, porque el tope ya subió una vez y
       va a volver a subir: NINGUNA cifra de millones escrita a mano en play/.
       Todas tienen que salir de PERFILES. Un número copiado se queda viejo el
       día que Joan mueva el tope, y entonces la pantalla promete una cosa y el
       motor contesta otra. */
    const millones = [...VIVO.matchAll(/(?:^|[^\d.'])(\d{7,})(?![\d.])/g)].map(m => m[1]);
    millones.forEach(n => assert.ok(false,
      'play/ escribió a mano la cifra ' + n + ': léela de C.PERFILES'));
  });

  test('la calculadora no ofrece nada que el servidor vaya a rechazar', () => {
    /* play_solicitar (base/20260828_correo_interno.sql) bota capital < 100.000,
       capital > 2.000.000 y meses fuera de 1..6, y la app traduce ese rechazo a
       «espera unos minutos» — un error falso que le echa la culpa a la
       conexión. Los topes de la pantalla tienen que caber dentro de los del
       servidor, no al revés. */
    const num = n => Number((VIVO.match(new RegExp('var ' + n + ' = (\\d+)')) || [])[1]);
    const min = num('CALC_MIN');
    const mMin = num('CALC_MESES_MIN'), mMax = num('CALC_MESES_MAX');
    assert.ok(min >= 100000, 'el mínimo de la calculadora cae por debajo del que acepta el servidor');
    /* 9-sep-2026 — el máximo YA NO ES UN NÚMERO en este archivo: se lee del
       perfil. Antes estaba clavado en 2.000.000, y el día que Joan subió el tope
       la calculadora se habría quedado ofreciendo el viejo mientras el motor
       aceptaba el nuevo. Así que la prueba ya no compara dos cifras: exige que
       haya UNA sola, y que la pantalla la lea. */
    assert.match(VIVO, /var CALC_MAX = C\.PERFILES\.preferente\.cupo_maximo/,
      'la calculadora volvió a escribir su tope a mano en vez de leerlo del perfil');
    assert.ok(mMax <= C.PLAZO_MESES, 'ofrece más meses de los que el producto tiene');
    assert.ok(mMin * 30 >= C.PLAZO_MINIMO_DIAS,
      'ofrece un plazo por debajo del piso legal: simular() lanzaría y la app dejaría de ser publicable');
  });

  test('un monto chiquito no puede publicar «0,00%»', () => {
    /* El defecto del 4-sep, por otra puerta: con capital muy bajo el costo se
       redondea a cero y la tasa efectiva sale 0,00%. El mínimo de la
       calculadora tiene que estar por encima de donde eso pasa. */
    const min = Number((VIVO.match(/var CALC_MIN = (\d+)/) || [])[1]);
    for (let m = 3; m <= 6; m++) {
      const r = C.simular({ perfil: 'preferente', capital: min, fecha_desembolso: HOY, meses: m });
      const c = r.puede ? r : r.cotizacion;
      assert.ok(c.efectivo_anual > 0.01,
        'con ' + min + ' a ' + m + ' meses la calculadora publicaría ' +
        (c.efectivo_anual * 100).toFixed(2) + '%');
      assert.ok(c.costo_total > 0, 'con ' + min + ' a ' + m + ' meses el crédito saldría gratis');
    }
  });

  test('cada plazo que se ofrece está cubierto por la tasa que se publica', () => {
    /* La divulgación publica UNA tasa máxima. Si la calculadora ofrece un plazo
       cuya tasa efectiva la supera, se está cobrando más de lo anunciado. */
    const d = K.divulgacion(HOY);
    const mMin = Number((VIVO.match(/var CALC_MESES_MIN = (\d+)/) || [])[1]);
    const mMax = Number((VIVO.match(/var CALC_MESES_MAX = (\d+)/) || [])[1]);
    assert.ok(mMin >= d.plazo_minimo_meses && mMax <= d.plazo_maximo_meses,
      'la calculadora ofrece plazos fuera de los que la divulgación declara (' +
      d.plazo_minimo_meses + '–' + d.plazo_maximo_meses + ')');
    for (let m = mMin; m <= mMax; m++) {
      const r = C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: HOY, meses: m });
      const c = r.puede ? r : r.cotizacion;
      assert.ok(c.efectivo_anual <= d.tae_maxima + 1e-12,
        'el plazo de ' + m + ' meses cobra ' + (c.efectivo_anual * 100).toFixed(4) +
        '% y la divulgación anuncia como máxima ' + (d.tae_maxima * 100).toFixed(4) + '%');
    }
  });

  test('los montos de la escalera SALEN de los perfiles, no de la mano', () => {
    /* Si mañana Joan sube el cupo de un perfil, la pantalla lo tiene que decir
       sola. Una cifra escrita a mano se queda vieja y nadie se entera. */
    assert.match(VIVO, /P\.recurrente\.cupo_maximo/, 'el segundo escalón escribió su cifra a mano');
    assert.match(VIVO, /P\.preferente\.cupo_maximo/, 'el tercer escalón escribió su cifra a mano');
  });

  test('CADA tarjeta con cifras lleva su sello, y el sello no es letra chica', () => {
    /* Por tarjeta y no por pantalla: la forma real en que un ejemplo se escapa
       de su descargo en Colombia es un recorte de WhatsApp. Si el sello vive en
       la cabecera y alguien recorta un escalón, la cifra viaja sola. */
    /* Los tres escalones salen de UNA plantilla, así que no se cuentan en el
       archivo: se comprueba que la plantilla ponga el sello y que lo ponga
       ANTES de la cifra. Que sean tres se comprueba abajo, ejecutando. */
    const plantilla = (VIVO.match(/<div class="escalon[\s\S]{0,600}?paso-como/) || [''])[0];
    assert.ok(plantilla, 'se perdió la plantilla del escalón');
    assert.ok(plantilla.indexOf('ej-sello') >= 0,
      'la tarjeta del escalón perdió su sello de ejemplo');
    assert.ok(plantilla.indexOf('ej-sello') < plantilla.indexOf('paso-cifra'),
      'el sello quedó después de la cifra: se lee el número antes que el descargo');
    /* Medido, no confiado: el descargo no puede ser más chico que 12px ni gris. */
    const regla = (CSS.match(/\.ej-sello\{[^}]*\}/) || [''])[0];
    const tam = Number((regla.match(/font-size:(\d+(?:\.\d+)?)px/) || [])[1]);
    assert.ok(tam >= 12, 'el sello mide ' + tam + 'px: un descargo ilegible no descarga nada');
    assert.ok(!/var\(--gris\)/.test(regla), 'el sello quedó en gris: menos visible que lo que niega');
  });

  /* 16-sep-2026 — Y NADIE MÁS PUEDE PINTAR ESE SELLO, que es por donde se coló
     el defecto que la prueba de arriba no podía ver.

     Lo que pasó: la ruleta del cupo (15-sep) reutilizó la clase `.escalon` de la
     escalera del recorrido y escribió `.escalon span { color: blanco-laca 72% }`
     sin acotar. El sello del recorrido es un `<span class="ej-sello">` dentro de
     un `.escalon`, y `.escalon span` (0,1,1) le gana a `.ej-sello` (0,1,0). Así
     que el descargo quedó en blanco roto sobre papel blanco: INVISIBLE en la
     puerta pública, durante un día entero, con las 1.841 pruebas en verde —
     porque la de arriba lee el TEXTO de la regla de `.ej-sello`, no el color que
     de verdad se aplica.

     De paso le llegaba `display:flex` y la tarjeta entera salía en cuatro
     columnas estrujadas. Se vio en el navegador, no acá.

     Esta prueba no mide colores (no hay motor de CSS en el banco): cierra la
     puerta por donde entró. Ninguna regla puede apuntar a un descendiente de
     `.escalon` sin decir de QUÉ escalera habla. */
  test('nadie pinta dentro de .escalon sin decir de qué escalera habla', () => {
    const selectores = [...CSS.matchAll(/(?:^|\})\s*([^{}@/]*\.escalon[^{}]*)\{/g)]
      .map(m => m[1].trim()).filter(Boolean);
    assert.ok(selectores.length > 3, 'se fueron los escalones de la hoja');
    selectores.forEach(s => {
      /* Las reglas de la escalera del recorrido son las dueñas de la clase y
         van sin prefijo. Cualquier OTRA pantalla que use `.escalon` tiene que
         acotarse a su propia tarjeta. Se reconoce porque toca un descendiente
         (`.escalon b`, `.escalon span`) o porque redefine la caja. */
      const tocaHijos = /\.escalon\s+[a-z]/.test(s);
      if (!tocaHijos) return;
      const propio = /\.escalon\s+\.(n|paso-tit|paso-cifra|paso-como)\b/.test(s);
      if (propio) return;
      assert.ok(/^\.[a-z-]+\s+\.escalon/.test(s),
        'la regla «' + s + '» pinta dentro de .escalon sin acotarse a su tarjeta: ' +
        'se va a comer la escalera del recorrido y el sello de ejemplo, como pasó el 15-sep');
    });
  });

  /* 14-sep-2026 — ESTE CENTINELA CAMBIÓ DE OFICIO, a propósito.

     Decía: la palabra «garantía» no se usa como mecánica, porque la garantía
     era del quincenal y play/ vendía otra cosa. Joan pidió lo contrario —«una
     calculadora abierta para que la gente pueda ver los créditos que se
     solicitan con garantía»— y play/ pasó a ser la puerta única de su negocio,
     no una vitrina para una tienda que ya se descartó (18-ago).

     Lo que aquella prueba protegía de verdad sigue vivo y se vigila acá: que la
     pantalla no PROMETA lo que el socio no tiene. Enseñar el producto está bien;
     enseñarlo sin decir hasta dónde le alcanza a quien mira, no. */
  test('la garantía se enseña, pero nunca sin decir hasta dónde alcanza', () => {
    /* La tarjeta de la garantía y la línea del acceso son inseparables: la
       primera no se pinta sin llamar a la segunda. Si alguien las separa, esto
       se cae. */
    const i = VIVO.indexOf('function tarjetaCalcGarantia');
    assert.ok(i > 0, 'desapareció la calculadora de la garantía que Joan pidió');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('function techoDeGarantia'));
    assert.match(cuerpo, /techoDeGarantia\(\)/,
      'la calculadora de la garantía pinta cifras sin decir hasta dónde le alcanza al que mira');
    /* Y la línea del acceso tiene que hablar del caso de quien no tiene nada:
       es el 100% de los que llegan hoy. */
    const techo = VIVO.slice(VIVO.indexOf('function techoDeGarantia'),
                             VIVO.indexOf('function cifrasDeGarantia'));
    assert.match(techo, /respaldoDisponible\(\)/,
      'la línea del acceso no lee el respaldo real: estaría escribiendo un techo a mano');
  });

  test('el precio de la garantía se calcula con el motor, no en esta pantalla', () => {
    /* La cuota que ve el cliente y la que cobra Joan tienen que salir de la
       misma función. Una segunda aritmética acá es la puerta por la que la app
       y el CRM empiezan a decir cifras distintas del mismo crédito. */
    assert.match(VIVO, /M\.simularPrestamoRespaldado\(/,
      'play/ cotiza la garantía sin el motor');
    assert.ok(!/0\.02|2\s*%\s*mensual\s*=/.test(VIVO.replace(/M\.TASA_RESPALDADO_MENSUAL/g, '')),
      'play/ escribió la tasa del respaldado a mano en vez de leerla del motor');
  });

  test('ningún plazo por debajo del piso legal, en NINGUNA de las dos calculadoras', () => {
    /* El motor acepta el préstamo con garantía desde UN mes —Joan lo opera así
       en su CRM—, pero esta página declara el piso de 90 días en la otra
       calculadora y en su propio encabezado. Dos calculadoras en la misma
       pantalla con dos pisos distintos es la pantalla contradiciéndose. */
    assert.match(VIVO, /var GCALC_MESES_MIN = Math\.ceil\(C\.PLAZO_MINIMO_DIAS \/ 30\)/,
      'el piso de la calculadora de la garantía se escribió a mano en vez de derivarse ' +
      'del de la página: el día que uno cambie, el otro se queda viejo');
  });
});

describe('la vitrina no puede cansar un celular de gama baja', () => {

  test('el rayo respeta a quien pidió menos movimiento', () => {
    /* No es un detalle: a hay gente a la que una animación así le produce mareo
       o le dispara una migraña, y el sistema operativo ya trae la respuesta
       puesta. Se le hace caso en los dos lados —CSS y JavaScript—, porque el
       CSS esconde el lienzo pero el bucle seguiría gastando batería. */
    assert.match(CSS, /prefers-reduced-motion/, 'la hoja no contempla el ajuste del sistema');
    assert.match(VIVO, /prefers-reduced-motion/, 'el rayo se dibuja igual aunque el sistema pida quietud');
  });

  test('el rayo se apaga solo y tiene tope', () => {
    assert.match(VIVO, /RAYOS\.vivos\.length >= 3/, 'sin tope, cada toque suma un rayo más');
    assert.match(VIVO, /RAYOS\.corriendo = false/, 'el bucle nunca se apaga: gasta batería en vacío');
    assert.match(VIVO, /degradado/, 'no hay autodegradado: en un teléfono lento el adorno gana');
  });

  test('el lienzo del rayo es sordo al tacto', () => {
    /* Un lienzo a pantalla completa que reciba toques se queda con el que era
       para un botón, y la persona cree que la app no responde. */
    assert.match(CSS, /#rayos\{[^}]*pointer-events:none/,
      'el lienzo del rayo puede robarse los toques de los botones');
  });

  test('no se anima nada que obligue a recalcular la página', () => {
    /* Animar `left`, `width` o `top` obliga al navegador a recalcular la
       posición de todo en cada fotograma. En un celular de gama baja eso se
       siente. Solo `transform` y `opacity` van en la tarjeta gráfica. */
    const animaciones = CSS.match(/@keyframes[^{]*\{[\s\S]*?\n\}/g) || [];
    animaciones.forEach(a => {
      const nombre = (a.match(/@keyframes\s+([a-z-]+)/i) || [])[1];
      /* `brillo` mueve `left` a propósito y es la excepción medida: es un solo
         elemento chico, absoluto dentro del botón, y no arrastra a nadie más.
         Cualquier animación NUEVA que mueva geometría tiene que justificarse
         acá o usar transform. */
      if (nombre === 'brillo') return;
      assert.ok(!/(^|[;{\s])(left|top|width|height|margin|padding)\s*:/.test(a),
        'la animación «' + nombre + '» mueve geometría: usa transform');
    });
  });
});

describe('instalar sí; pedir permisos que no se usan, no', () => {

  test('play/ está en el service worker, o el botón de instalar miente', () => {
    /* Ofrecer instalar una app que después no abre sin señal es peor que no
       ofrecerla. */
    const SW = leer('sw.js');
    ['play/index.html', 'play/estilo.css', 'play/app.webmanifest',
     'app/creditos.js', 'app/cuenta.js', 'app/cumplimiento.js']
      .forEach(f => assert.ok(SW.indexOf("'" + f + "'") >= 0,
        f + ' no está en la lista del service worker'));
  });

  test('EL JAVASCRIPT SE PIDE FRESCO, o los topes se congelan en el celular', () => {
    /* 9-sep-2026, visto en el navegador y no deducido: con el service worker
       desregistrado, la página seguía mostrando el tope viejo (2.000.000) un
       buen rato después de que el servidor ya servía el nuevo (8.000.000). Los
       cupos viven en app/creditos.js, que play/ carga con un <script src> sin
       marca de versión; mientras el navegador se quede con su copia, la
       PANTALLA DICE UNA COSA Y EL MOTOR OTRA — que es la falla que este
       proyecto persigue todo el tiempo, llegando por la puerta del caché.

       Lo que hoy lo salva es que el service worker pide los .js a la red
       PRIMERO y solo cae al caché si no hay señal. Esa regla es la garantía de
       que el día que Joan mueva un tope, sus clientes lo vean. Si alguien la
       cambia a caché-primero «para que cargue más rápido», los cupos se
       congelan en cada teléfono y nadie se entera. */
    const SW = leer('sw.js');
    const regla = (SW.match(/const frescoPrimero =[\s\S]{0,200}?;/) || [''])[0];
    assert.ok(regla, 'se perdió la regla que decide qué se pide fresco');
    assert.match(regla, /\bjs\b/,
      'los .js dejaron de pedirse a la red primero: los cupos se van a congelar en los celulares');
    assert.match(regla, /navigate/,
      'las páginas dejaron de pedirse a la red primero');
  });

  test('el botón de instalar solo aparece si el navegador dijo que puede', () => {
    assert.match(VIVO, /beforeinstallprompt/,
      'el botón se pinta siempre: en un iPhone o en un navegador que no instala, promete algo imposible');
    assert.match(VIVO, /if \(!INSTALADOR\) return ''/,
      'la tarjeta de instalar no comprueba que haya con qué instalar');
  });

  test('NO se pide el permiso de notificaciones mientras no haya quién mande una', () => {
    /* Joan lo pidió. No se hace todavía, y el motivo está medido: sw.js no
       escucha 'push' ni 'notificationclick', no hay Edge Function ni pg_net, o
       sea que no existe el emisor. Pedir un permiso que no se va a usar es
       pedirle algo al cliente a cambio de nada, y encima lo QUEMA: Android no
       lo vuelve a preguntar el día que sí haga falta. Es la misma decisión que
       ya está escrita en android/twa-manifest.json.
       El día que exista el emisor, esta prueba se cambia a propósito. */
    const SW = leer('sw.js');
    const hayEmisor = /addEventListener\(\s*['"]push['"]/.test(SW);
    if (hayEmisor) return;   // ya hay con qué: pedir el permiso pasa a ser legítimo
    assert.ok(!/Notification\.requestPermission|requestPermission\(\)/.test(VIVO),
      'play/ pide el permiso de notificaciones y todavía no hay con qué mandar una');
  });
});

/* ==========================================================================
 * LA PUERTA PÚBLICA, EJECUTÁNDOSE — 9 de septiembre de 2026
 *
 * Compilar no es ejecutar, y hoy costó: al borrar la tarjeta vieja del catálogo
 * se fue con ella la función `fila`, que la calculadora nueva usaba. El archivo
 * compilaba perfecto y la página quedaba EN BLANCO —«fila is not defined»—,
 * porque play/ es un <div> vacío que se llena con JavaScript. Lo cazó el
 * navegador, a mano. Esto lo caza sola la próxima vez.
 *
 * Es el mismo arnés que panel.test.js le puso al CRM el 28-ago y por el mismo
 * motivo: los defectos caros de este proyecto no están en las reglas, están en
 * el pegamento entre pantallas.
 * ======================================================================== */
/* El banco se declara afuera del describe: la cuenta del socio (más abajo) lo
   usa también, y tenerlo dos veces sería tener dos bancos que se separan. */
let abrirPlay;
describe('play/ pintando de verdad (9-sep-2026)', () => {

  const vm = require('node:vm');

  abrirPlay = function (opciones) {
    const o = opciones || {};
    const RAIZ = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    const almacen = {}, sesion = {}, elems = {};
    /* Un elemento de mentira que se acuerda de su innerHTML: es lo único que
       hace falta para leer lo que la página pintó. */
    const elem = id => (elems[id] = elems[id] || {
      id, value: '', checked: false, max: '', min: '', textContent: '', innerHTML: '',
      dataset: {}, style: {}, files: null,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, removeEventListener() {},
      querySelector: () => elem(id + '>hijo'), querySelectorAll: () => [],
      appendChild() {}, insertBefore() {}, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute: () => null, focus() {}, play: () => Promise.resolve(),
      getContext: () => null, scrollIntoView() {}
    });
    const doc = {
      getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => elem('creado-' + Math.random()), addEventListener() {},
      head: elem('head'), body: elem('body'), documentElement: elem('html'), title: ''
    };
    const ctx = {
      console, document: doc, alert() {}, confirm: () => true,
      localStorage: { getItem: k => (k in almacen ? almacen[k] : null),
                      setItem: (k, v) => { almacen[k] = String(v); },
                      removeItem: k => { delete almacen[k]; } },
      sessionStorage: { getItem: k => (k in sesion ? sesion[k] : null),
                        setItem: (k, v) => { sesion[k] = String(v); },
                        removeItem: k => { delete sesion[k]; } },
      location: { href: 'https://tugarantia.net/play/', hash: o.hash || '',
                  pathname: '/play/', search: '', protocol: 'https:',
                  host: 'tugarantia.net', origin: 'https://tugarantia.net', reload() {} },
      history: { replaceState() {} },
      navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() },
                   geolocation: { getCurrentPosition() {} }, mediaDevices: null },
      /* Sin red: la puerta pública TIENE que pintar sin nube. Si algún día
         necesita una respuesta del servidor para mostrar un precio, esta prueba
         se cae y hace bien.

         Con `o.red` se le puede dar una nube de mentiras a la que preguntarle:
         hace falta para probar la cuenta, donde lo que importa no es que la
         página pinte sin red sino QUÉ DICE cuando el servidor contesta 404,
         que es lo que contesta hoy mientras Joan no corra la migración. */
      fetch: (url, cfg) => (o.red ? o.red(url, cfg)
        : Promise.reject(new Error('sin red en el banco de pruebas'))),
      setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      requestAnimationFrame: () => 0, cancelAnimationFrame() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
      btoa: s => Buffer.from(s, 'binary').toString('base64'),
      atob: s => Buffer.from(s, 'base64').toString('binary'),
      Image: class {}, FileReader: class {}, Blob: class {}, File: class {},
      open() {}, scrollTo() {}, performance: { now: () => 0 },
      /* `window` es el propio contexto, así que los oyentes que la página
         registra al cargar (beforeinstallprompt, pointerdown del rayo, resize)
         cuelgan de acá. Se guardan en vez de tirarse: así una prueba puede
         disparar un toque y ver qué hace el rayo. */
      _oyentes: {},
      addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
      removeEventListener() {}, dispatchEvent() { return true; }
    };
    ctx.window = ctx; ctx.self = ctx;
    /* Los <script src> que play/ carga, con el nombre global con el que los toma
       la página. La lista se comprueba sola más abajo: ver «el banco carga todo
       lo que la página carga». */
    /*  simula que uno de los <script src> no llegó — un service
       worker viejo contestando index.html a una petición de .js, un CDN que
       falla, una caché a medias. Este proyecto ya lo vivió (sw.js, v19). */
    /* «sinReglas» simula que uno de los <script src> no llegó: un service worker
       viejo contestando index.html a una petición de .js, un CDN que falla, una
       caché a medias. No es hipotético — este proyecto ya lo vivió (sw.js, v19,
       28-ago-2026). */
    if (!o.sinReglas) ctx.CreditosPublicables = require(path.join(RAIZ, 'app', 'creditos.js'));
    ctx.CuentaSocio = require(path.join(RAIZ, 'app', 'cuenta.js'));
    ctx.Cumplimiento = require(path.join(RAIZ, 'app', 'cumplimiento.js'));
    /* 14-sep-2026 — el motor y el lector de la ficha entraron a play/ con la
       calculadora de la garantía. Si se olvidan acá, la página revienta en el
       banco con «undefined» y no se sabe si es el banco o la página. */
    ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
    ctx.FichaSocio = require(path.join(RAIZ, 'app', 'ficha.js'));
    /* 15-sep-2026 — la ruleta del cupo. */
    ctx.RuletaCupo = require(path.join(RAIZ, 'app', 'ruleta.js'));
    /* 15-sep-2026 — CHAT.JS NUNCA HABIA ESTADO ACA, y la pagina lo carga desde
       que existe la pestana de chat. O sea que todo lo que cuelga del chat se
       probaba MUERTO: sin el modulo, las funciones que lo usan se rinden
       calladas y ninguna prueba se queja. Lo encontro el centinela de arriba el
       dia que se escribio, no una persona mirando. */
    ctx.ChatTuGarantia = require(path.join(RAIZ, 'app', 'chat.js'));
    vm.createContext(ctx);
    const fallos = [];
    [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      /* Se atrapa como lo hace un NAVEGADOR: un error de primer nivel en un
         <script> mata ese bloque y nada más — la página que ya se pintó se
         queda. Sin esto, el banco era MÁS severo que el navegador y no se podía
         probar el camino del guardián, que termina en un `throw` a propósito
         (el mensaje ya está en pantalla y lo que sigue no tiene con qué
         funcionar). El fallo se guarda para quien quiera mirarlo. */
      .forEach((m, i) => {
        try { vm.runInContext(m[1], ctx, { filename: 'play#' + i }); }
        catch (e) { fallos.push(e); }
      });
    return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems, almacen, fallos };
  }

  test('NINGÚN ARCHIVO LLEVA CARACTERES DE CONTROL ESCONDIDOS', () => {
    /* 15-sep-2026 — ESTO PASÓ TRES VECES EN UNA TARDE. Escribiendo parches con
       scripts, la secuencia «BARRA-b» de una expresión regular se colapsó en un
       CARÁCTER DE RETROCESO de verdad (0x08) dentro del propio archivo. El
       resultado no es un error de sintaxis: es una expresión regular que busca
       un retroceso literal, o sea que NO ENCUENTRA NADA NUNCA.

       Y como esas expresiones viven dentro de centinelas, el efecto es el peor
       posible: la prueba pasa siempre, pase lo que pase. Dos centinelas nuevos
       de hoy nacieron muertos así, y solo se descubrió porque a uno se le metió
       el error a propósito y no lo vio.

       Un byte invisible que apaga una prueba sin romperla no se encuentra
       leyendo: hay que barrerlo. */
    const raiz = path.join(__dirname, '..');
    const dirs = ['app', 'play', 'panel', 'pruebas', 'base'];
    const malos = [];
    /* Se arma con códigos, no con una expresión literal: escribir
       «BARRA-x-0-8» dentro de una expresión regular acá es caer en el mismo
       agujero que esta prueba vino a tapar — y de hecho la primera versión de
       esta línea se colapsó exactamente así.

       Solo estos tres, y por una razón: son los que salen de que se colapse la
       BARRA-b, la BARRA-v o la BARRA-f de una expresión regular. Otros códigos
       bajos sí tienen uso legítimo como separador —panel/nube.js usa el 0x01
       para juntar tabla e identificador en una llave, a propósito y desde hace
       meses— y marcarlos sería enseñarle a este centinela a que lo callen. */
    const control = new RegExp('[' + String.fromCharCode(8, 11, 12) + ']');
    for (const d of dirs) {
      const dir = path.join(raiz, d);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(js|html|css|sql)$/.test(f)) continue;
        const ruta = path.join(dir, f);
        const t = fs.readFileSync(ruta, 'utf8');
        const m = t.match(control);
        if (m) {
          const linea = (t.slice(0, m.index).match(/\n/g) || []).length + 1;
          malos.push(d + '/' + f + ':' + linea + ' → 0x' +
            m[0].charCodeAt(0).toString(16).padStart(2, '0'));
        }
      }
    }
    assert.deepEqual(malos, [],
      'hay caracteres de control dentro del código. Si están en una expresión ' +
      'regular, esa expresión no encuentra nada y el centinela que la usa está ' +
      'dando verde sin mirar. Casi siempre es una BARRA-b que se colapsó (\x08).');
  });

  test('EL BANCO CARGA TODO LO QUE LA PÁGINA CARGA', () => {
    /* 15-sep-2026 — ESTE CENTINELA SE PROMETIÓ Y NUNCA SE ESCRIBIÓ. Tres
       líneas más arriba, desde hace días, hay un comentario que dice «la lista
       se comprueba sola más abajo: ver "el banco carga todo lo que la página
       carga"». No existía. Se descubrió al agregar app/ruleta.js: la página
       empezó a cargar un módulo que el banco no le daba, y las 1.460 pruebas
       siguieron en verde — la rueda se probaba MUERTA, porque sin su módulo
       tarjetaRuleta() devuelve cadena vacía y nadie se queja.

       Un banco que no carga lo mismo que la página no prueba la página: prueba
       otra cosa parecida. Y el modo de enterarse era que a alguien se le
       ocurriera mirar.

       Acá se lee la lista de <script src> del HTML de verdad y se exige que el
       banco tenga un global para cada uno. Si mañana entra un módulo nuevo y se
       olvida el banco, esta prueba lo dice con el nombre del archivo. */
    const html = fs.readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8');
    const srcs = [...html.matchAll(/<script\s[^>]*src="([^"]+)"/g)]
      .map(m => m[1])
      .filter(u => !/^https?:/.test(u));

    /* Qué global publica cada archivo. Se lee del propio archivo, no de una
       lista escrita a mano: una lista a mano es otra cosa que se desincroniza. */
    const P = abrirPlay();
    const faltan = [];
    for (const src of srcs) {
      const ruta = path.join(__dirname, '..', 'play', src);
      if (!fs.existsSync(ruta)) { faltan.push(src + ' (el archivo no existe)'); continue; }
      const fuente = fs.readFileSync(ruta, 'utf8');
      /* El patrón de todos los módulos de este proyecto:
         `raiz.NombreGlobal = fabrica()`. */
      const m = fuente.match(/ra[ií]z\.([A-Za-z_$][\w$]*)\s*=\s*fabrica\(\)/);
      if (!m) continue;   // no es un módulo con global (p. ej. una hoja suelta)
      if (P.ev('typeof ' + m[1]) === 'undefined') {
        faltan.push(src + ' → window.' + m[1]);
      }
    }
    assert.deepEqual(faltan, [],
      'el banco no le da a la página módulos que la página SÍ carga en el ' +
      'navegador, así que lo que cuelgue de ellos se está probando muerto');
  });

  test('SI UN SCRIPT NO LLEGA, SE DICE — no se queda en blanco', () => {
    /* 16-sep-2026 — el aviso existía desde siempre y NUNCA se ejecutaba cuando
       hacía falta. Vivía al final, dentro del arranque; y unas líneas antes hay
       constantes de primer nivel que leen los módulos (CALC_MAX lee C.PERFILES,
       GCALC lee M.MONTO_MINIMO_RESPALDADO, PLAZO lee C.PLAZO_MESES). Si un
       <script src> no llegaba, la primera de ellas lanzaba y se llevaba el
       bloque entero: el arranque no corría, el aviso no se pintaba, y la puerta
       pública quedaba en CERO letras.
       Medido con este banco antes de moverlo: cero. */
    const P = abrirPlay({ sinReglas: true });
    const body = P.elems.body.innerHTML || '';
    assert.ok(body.length > 60,
      'sin las reglas la página quedó en blanco: ' + body.length + ' letras');
    assert.match(body, /No pude cargar las reglas del crédito/,
      'no le dice a la persona qué pasó');
    /* Y la causa que se le da tiene que ser la suya: no llegó un archivo. */
    assert.match(body, /internet|vuelve a abrir/i,
      'no le dice qué puede hacer');
  });

  test('el guardián de las reglas corre ANTES de cualquier constante que las lea', () => {
    /* El orden es la corrección: mientras haya una constante de primer nivel que
       lea C, U, M o FS por encima del guardián, el guardián vuelve a ser
       inalcanzable el día que falte un archivo. */
    const guardia = VIVO.indexOf('if (!C || !U || !M || !FS)');
    assert.ok(guardia > 0, 'desapareció el guardián de las reglas');
    [['CALC_MAX', 'C.PERFILES'], ['GCALC', 'M.MONTO_MINIMO_RESPALDADO'],
     ['GCALC_MESES_MIN', 'C.PLAZO_MINIMO_DIAS'], ['PLAZO', 'C.PLAZO_MESES']].forEach(([n, lee]) => {
      const i = VIVO.indexOf('var ' + n + ' =');
      assert.ok(i > 0, 'no encontré la constante ' + n);
      assert.ok(i > guardia,
        'la constante ' + n + ' lee ' + lee + ' ANTES del guardián: si ese archivo ' +
        'no llega, lanza ahí y la página queda en blanco sin decir por qué');
    });
  });

  test('LA PORTADA PINTA: si algo revienta, la página queda en blanco', () => {
    /* El centinela que faltaba. `pintarEntrar()` es lo primero que ve todo el
       que llega, y si lanza, el visitante no ve un error: ve blanco y se va. */
    const P = abrirPlay();
    /* Con todos los archivos puestos, el arranque no puede lanzar nada. Desde
       que el banco atrapa los errores como un navegador, uno que se colara aquí
       pasaría callado: esto lo vuelve a hacer ruidoso. */
    assert.deepEqual(P.fallos.map(e => e.message), [],
      'el arranque lanzó con todos los archivos en su sitio');
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.ok(h.length > 800, 'la portada salió casi vacía (' + h.length + ' letras)');
    assert.match(h, /calcMonto/, 'no pintó la calculadora');
    assert.match(h, /escalon/, 'no pintó la escalera');
    assert.match(h, /plegable/, 'no pintó la historia ni la explicación');
  });

  test('la calculadora de la garantía arranca dentro de su propio rango', () => {
    const P = abrirPlay();
    const min = P.ev('GCALC_MESES_MIN'), max = P.ev('GCALC_MESES_MAX');
    assert.ok(min * 30 >= C.PLAZO_MINIMO_DIAS,
      'ofrece ' + min + ' meses y el piso de la página es ' + C.PLAZO_MINIMO_DIAS + ' días');
    assert.ok(max <= P.ev('M.PLAZO_RESPALDADO_MAX'),
      'ofrece más meses de los que el motor acepta para el préstamo con garantía');
    const meses = P.ev('GCALC.meses'), monto = P.ev('GCALC.monto');
    assert.ok(meses >= min && meses <= max, 'arranca fuera de su propio rango de plazo');
    assert.ok(monto >= P.ev('GCALC_MIN') && monto <= P.ev('GCALC_MAX'),
      'arranca fuera de su propio rango de monto');
    /* Y el mínimo del producto es el del motor, no uno escrito acá: es plata. */
    assert.equal(P.ev('GCALC_MIN'), P.ev('M.MONTO_MINIMO_RESPALDADO'),
      'el mínimo de la calculadora se separó del mínimo del producto');
  });

  test('sin garantía ganada, la calculadora lo DICE antes de la primera cifra', () => {
    /* El caso del 100% de los que llegan hoy: cero garantía. La tarjeta se pinta
       igual —Joan quiere que la vean todos— pero encima va que todavía no lo
       pueden pedir. Sin esa línea es publicidad de algo que no existe. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /todavía no lo puedes pedir/i,
      'la calculadora de la garantía no le dice al que no tiene nada que no puede pedirlo');
    assert.equal(P.ev('respaldoDisponible()'), 0, 'sin ficha el respaldo tiene que ser cero');
  });

  test('NINGÚN PRECIO AL LADO DE LA LETRA DE OTRO PRODUCTO', () => {
    /* 14-sep-2026 — el defecto que esto caza, cometido y visto en el navegador:
       la calculadora del crédito con garantía imprimía «Tasa efectiva anual
       26,82%» y debajo, como letra obligatoria, la del producto a 6 meses, que
       dice «Tasa efectiva anual MÁXIMA: 23,99%». La única frase de la app que
       existe para no afirmar nada falso estaba afirmando que el máximo era menor
       que el precio de tres renglones arriba.

       Es lo que el artículo 305 llama «cualquiera sea la forma utilizada para
       hacer constar la operación, ocultarla o disimularla», y 1.148 pruebas en
       verde no lo vieron porque ninguna leía las dos cifras juntas.

       La regla, escrita para cualquier producto que venga después: en el trozo
       de pantalla donde se imprime una tasa, la MÁXIMA que declare la letra no
       puede ser menor que la que se está cobrando. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    const num = t => Number(String(t).replace(/\./g, '').replace(',', '.'));

    /* A cada precio impreso se le busca la letra que le SIGUE, antes de que
       empiece el siguiente precio. No se parte por tarjetas: la calculadora del
       producto a 6 meses imprime sus cifras en una tarjeta y su letra en la de
       al lado, a propósito —los deslizadores no pueden vivir dentro de lo que se
       repinta—, y partir por tarjetas las separaría sin que nada esté mal. */
    const precios = [...h.matchAll(/Tasa efectiva anual<\/span><span class="v">([\d.,]+)%/g)];
    const letras  = [...h.matchAll(/Tasa efectiva anual máxima: ([\d.,]+)%/g)];
    let miradas = 0;
    precios.forEach((p, k) => {
      const hasta = precios[k + 1] ? precios[k + 1].index : h.length;
      const suya = letras.find(l => l.index > p.index && l.index < hasta);
      assert.ok(suya,
        'se imprime una tasa efectiva anual de ' + p[1] + '% y no le sigue su letra ' +
        'obligatoria antes del siguiente precio');
      miradas++;
      assert.ok(num(suya[1]) >= num(p[1]) - 0.01,
        'se cobra ' + p[1] + '% y la letra que le sigue declara un máximo de ' +
        suya[1] + '%: la letra es de otro producto');
    });
    assert.ok(miradas >= 2,
      'esperaba al menos dos tarjetas con precio en la portada (el crédito normal y ' +
      'el de garantía); encontré ' + miradas);
  });

  test('la letra de la garantía sale de cumplimiento.js y no de esta pantalla', () => {
    /* Los dos productos arman su letra en el mismo archivo y con la misma forma.
       Escrita a mano en la pantalla, se queda vieja el día que el precio cambie
       —y el precio de este producto ya cambió una vez este mes. */
    assert.match(VIVO, /K\.divulgacionRespaldado\(hoyISO\(\)\)/,
      'play/ arma la letra del préstamo con garantía por su cuenta');
    assert.match(VIVO, /function garantiaSePuedeCotizar[\s\S]{0,200}hayQueCotizarGarantia\(\)/,
      'la calculadora de la garantía cotiza sin comprobar que tiene su letra');
  });

  test('el motor se carga ANTES que cumplimiento.js, que lo necesita', () => {
    /* cumplimiento.js toma el motor de la ventana en cuanto se carga, para poder
       armar la letra del préstamo con garantía. Puesto detrás, la letra saldría
       vacía y la calculadora se callaría el precio sin que nadie entendiera por
       qué —un fallo mudo, que son los que este proyecto paga más caros. */
    const orden = [...PLAY.matchAll(/<script src="\.\.\/app\/([a-z.]+)"/g)].map(m => m[1]);
    const iM = orden.indexOf('motor.js'), iK = orden.indexOf('cumplimiento.js');
    assert.ok(iM >= 0, 'play/ dejó de cargar el motor');
    assert.ok(iK >= 0, 'play/ dejó de cargar cumplimiento.js');
    assert.ok(iM < iK, 'cumplimiento.js se carga antes que el motor y se queda sin él');
  });

  test('la calculadora arranca en un monto que se puede pedir', () => {
    /* Ese valor inicial es la primera impresión del negocio entero: si abre en
       el tope, lo primero que la persona ve es una cuota enorme y se va. */
    const P = abrirPlay();
    const monto = P.ev('CALC.monto'), max = P.ev('CALC_MAX'), min = P.ev('CALC_MIN');
    assert.ok(monto >= min && monto <= max, 'arranca fuera de su propio rango');
    assert.ok(monto < max, 'arranca en el tope: la primera cifra que se ve es la cuota más alta');
  });

  test('LOS TOPES QUE SE PINTAN SON LOS DEL MOTOR, sin copia de por medio', () => {
    /* La comprobación que el navegador no me dejó hacer por el caché, y que
       además queda para siempre: se ejecuta la página y se lee lo que pintó. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.ok(h.indexOf(COP(C.PERFILES.recurrente.cupo_maximo)) >= 0,
      'la escalera no muestra el cupo del segundo escalón (' + COP(C.PERFILES.recurrente.cupo_maximo) + ')');
    assert.ok(h.indexOf(COP(C.PERFILES.preferente.cupo_maximo)) >= 0,
      'la escalera no muestra el cupo del tercer escalón (' + COP(C.PERFILES.preferente.cupo_maximo) + ')');
    assert.equal(P.ev('CALC_MAX'), C.PERFILES.preferente.cupo_maximo,
      'el tope de la calculadora se separó del cupo del perfil más alto');
  });

  test('mover el monto y el plazo cambia las cifras, y las cifras cuadran', () => {
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    P.ev('CALC.monto = CALC_MAX; CALC.meses = 6;');
    const alTope = P.ev('cifrasDeCalc()');
    P.ev('CALC.monto = CALC_MIN; CALC.meses = 3;');
    const alPiso = P.ev('cifrasDeCalc()');
    assert.notEqual(alTope, alPiso, 'la calculadora pinta lo mismo para 100.000 que para el tope');
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.ok(alTope.indexOf(COP(C.PERFILES.preferente.cupo_maximo)) >= 0,
      'al tope no muestra el monto que se pidió');
    /* Y la cuota de verdad, comparada contra el motor. */
    const r = C.simular({ perfil: 'preferente', capital: C.PERFILES.preferente.cupo_maximo,
                          fecha_desembolso: new Date().toISOString().slice(0, 10), meses: 6 });
    const c = r.puede ? r : r.cotizacion;
    assert.ok(alTope.indexOf(COP(c.cuota_tipica)) >= 0,
      'la cuota que pinta la pantalla no es la que calcula el motor');
  });

  /* 16-sep-2026 — Joan: «que tenga un total de cuánto tiene que pagar el
     cliente, aparte agrégale las cuotas que quieres para pagar ese préstamo y
     las fechas, y que se pueda ver cuánto se paga por cuota para que el cliente
     tenga claridad de cómo pagaría eso».

     Las tres cosas son medibles y se miden acá. Lo que había antes: el total
     metido en una línea gris del mismo tamaño que el resto, y de las seis fechas
     se enseñaba UNA, la última. */
  test('«HOY TIENES $0» SOLO SI DE VERDAD SE SABE QUE TIENE CERO', () => {
    /* 16-sep-2026 — no tener ficha son CUATRO cosas distintas, y esta línea las
       trataba como una: el visitante sin cuenta, el socio cuyo historial se está
       cargando, el que no se pudo traer, y el que de verdad no ha ganado nada.
       Decirle «hoy tienes $0» a alguien que lleva medio año pagando, porque la
       nube no contestó, es la casa mintiendo sobre la causa de un fallo. */
    const P = abrirPlay();
    const linea = e => { P.ev('FICHA_ESTADO = "' + e + '"'); return P.ev('techoDeGarantia()'); };

    assert.ok(linea('cargando').indexOf('$0') === -1,
      'mientras busca la garantía ya afirma que es cero');
    ['falla', 'apagada', 'sesion'].forEach(e => {
      const h = linea(e);
      assert.ok(h.indexOf('$0') === -1, 'con ' + e + ' afirma un saldo que no pudo leer');
      assert.match(h, /no pude preguntar/i, 'con ' + e + ' no dice que no pudo preguntar');
    });
    /* Al visitante sin cuenta se le explica de dónde sale, no se le afirma un
       saldo que nadie ha mirado. */
    assert.ok(linea('sin').indexOf('Hoy tienes') === -1,
      'a un visitante sin cuenta le afirma cuánta garantía tiene');
    /* Y al registrado que sí sabemos que está en cero, se le dice el cero. */
    assert.match(linea('nueva'), /Hoy tienes/, 'al registrado en cero no le dice su cero');
  });

  test('NO SE PROMETE UN MONTO QUE EL PRODUCTO NO PRESTA', () => {
    /* La garantía puede alcanzar para trescientos mil y este crédito empieza en
       un millón. «Puedes pedir hasta $300.000» es ofrecer algo que la misma
       tarjeta rechaza dos renglones más abajo. */
    const P = abrirPlay();
    const min = P.ev('GCALC_MIN');
    P.ev('FICHA_ESTADO = "vinculada"; FICHA = { maxRespaldado: ' + Math.round(min / 3) + ' };');
    const h = P.ev('techoDeGarantia()');
    assert.ok(h.indexOf('puedes pedir hasta') === -1,
      'promete un monto por debajo del mínimo del producto');
    assert.match(h, /empieza en/, 'no dice desde cuánto empieza el producto');
    assert.match(h, /te faltan/, 'no dice cuánto le falta');
    /* Y por encima del mínimo sí se le dice hasta dónde. */
    P.ev('FICHA = { maxRespaldado: ' + (min * 2) + ' };');
    assert.match(P.ev('techoDeGarantia()'), /puedes pedir hasta/,
      'con garantía de sobra dejó de decirle hasta dónde le alcanza');
  });

  test('EL TOTAL SE VE, y es el del motor', () => {
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /En total vas a pagar/,
      'la calculadora no dice cuánto va a pagar en total');
    /* Contra el día de la PÁGINA, no contra la constante del 9-sep de este
       archivo: la página cotiza con el día de verdad. */
    const r = C.simular({ perfil: 'preferente', capital: P.ev('CALC.monto'),
                          fecha_desembolso: P.ev('hoyISO()'), meses: P.ev('CALC.meses') });
    const c = r.puede ? r : r.cotizacion;
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.ok(h.indexOf(COP(c.total_a_pagar)) >= 0,
      'el total que pinta no es el que calcula el motor');
    /* Y en su propia caja, no perdido en un renglón: si la caja se va, esto se
       cae y alguien tiene que decidir a propósito volver a esconderlo. */
    assert.match(h, /class="granTotal"/, 'el total volvió a ser un renglón más');
  });

  test('LAS CUOTAS SE VEN TODAS, con su fecha y su monto', () => {
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    /* La fecha de HOY sale de la PÁGINA, no de la constante de este archivo: la
       constante es del 9-sep y la página cotiza contra el día de verdad, así que
       comparar contra ella hacía fallar la prueba por un motivo que no era el
       que dice. */
    const r = C.simular({ perfil: 'preferente', capital: P.ev('CALC.monto'),
                          fecha_desembolso: P.ev('hoyISO()'), meses: P.ev('CALC.meses') });
    const c = r.puede ? r : r.cotizacion;
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.ok(c.cuotas.length >= 3, 'el caso de prueba no tiene cuotas que mirar');
    c.cuotas.forEach(q => {
      assert.ok(h.indexOf('Cuota ' + q.n) >= 0,
        'falta la cuota ' + q.n + ' en la calculadora');
      assert.ok(h.indexOf(COP(q.total)) >= 0,
        'falta el monto de la cuota ' + q.n);
    });
    /* Las fechas, no solo los montos: es la mitad de lo que Joan pidió, y es lo
       que sirve para saber si le cuadra con el día que le pagan. */
    const mes = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    c.cuotas.forEach(q => {
      const p = String(q.fecha).split('-');
      const bonita = Number(p[2]) + ' ' + mes[Number(p[1]) - 1] + ' ' + p[0];
      assert.ok(h.indexOf(bonita) >= 0, 'falta la fecha de la cuota ' + q.n + ' (' + bonita + ')');
    });
  });

  test('mover el monto mueve el total Y el plan entero', () => {
    /* Un total que no sigue al deslizador es peor que no tener total. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    P.ev('CALC.monto = CALC_MIN; CALC.meses = 6;');
    const bajo = P.ev('cifrasDeCalc()');
    P.ev('CALC.monto = CALC_MAX;');
    const alto = P.ev('cifrasDeCalc()');
    const COP = n => '$' + n.toLocaleString('es-CO');
    const hoy = P.ev('hoyISO()');
    const rB = C.simular({ perfil: 'preferente', capital: P.ev('CALC_MIN'), fecha_desembolso: hoy, meses: 6 });
    const rA = C.simular({ perfil: 'preferente', capital: P.ev('CALC_MAX'), fecha_desembolso: hoy, meses: 6 });
    const cB = rB.puede ? rB : rB.cotizacion, cA = rA.puede ? rA : rA.cotizacion;
    assert.ok(bajo.indexOf(COP(cB.total_a_pagar)) >= 0, 'el total no siguió al monto (abajo)');
    assert.ok(alto.indexOf(COP(cA.total_a_pagar)) >= 0, 'el total no siguió al monto (arriba)');
    /* Y el número de renglones de cuota sigue al plazo. */
    P.ev('CALC.meses = 3;');
    const tres = (P.ev('cifrasDeCalc()').match(/Cuota \d/g) || []).length;
    P.ev('CALC.meses = 6;');
    const seis = (P.ev('cifrasDeCalc()').match(/Cuota \d/g) || []).length;
    assert.equal(tres, 3, 'a tres meses pinta ' + tres + ' cuotas');
    assert.equal(seis, 6, 'a seis meses pinta ' + seis + ' cuotas');
  });

  test('LAS DOS CALCULADORAS DICEN SUS CIFRAS IGUAL', () => {
    /* Están una debajo de la otra en la misma pantalla. Dos formas de decir lo
       mismo obligan a leer dos veces para comparar — que es exactamente lo que
       alguien hace ahí: comparar. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.equal((h.match(/En total vas a pagar/g) || []).length, 2,
      'solo una de las dos calculadoras muestra el total de la misma forma');
    assert.equal((h.match(/Cuándo pagarías cada cuota/g) || []).length, 2,
      'solo una de las dos calculadoras muestra el plan de la misma forma');
    assert.equal((h.match(/class="granTotal"/g) || []).length, 2,
      'las dos cajas del total no son la misma caja');
  });

  test('el plan se pinta con UNA sola función, no con tres copias', () => {
    /* cuadroCuotas lo usan las dos calculadoras y la propuesta que manda Joan.
       Tres sitios, una función: el día que se decida mostrar también el saldo,
       cambia en una. */
    const usos = (VIVO.match(/cuadroCuotas\(/g) || []).length;
    assert.ok(usos >= 5,
      'cuadroCuotas se usa ' + usos + ' veces: alguien volvió a pintar cuotas a mano');
    /* Y la forma de comprobarlo que no se puede discutir: el rótulo «Cuota » se
       escribe UNA sola vez en todo el archivo, dentro de cuadroCuotas. Cualquier
       segunda aparición es una lista pintada a mano. Al escribir esto había
       CINCO copias; las cuatro de más las encontró esta línea. */
    const rotulos = (VIVO.match(/'Cuota '/g) || []).length;
    assert.equal(rotulos, 1,
      'el rótulo «Cuota » aparece ' + rotulos + ' veces: hay listas de cuotas ' +
      'pintadas fuera de cuadroCuotas, y se van a quedar viejas por separado');
  });

  /* ========================================================================
     LO QUE ENCONTRÓ LA REVISIÓN DEL 16-SEP, con su centinela cada cosa.
     ====================================================================== */

  test('EL PLAZO QUE SE ELIGE ES EL QUE SE PIDE, de punta a punta', () => {
    /* Estaba roto: la portada dejaba escoger de 3 a 6 cuotas y cotizaba cada
       plazo de verdad, pero adentro no había dónde elegirlo, el simulador
       llamaba al motor sin `meses` —y el motor cae a 6— y pedir() mandaba el 6
       fijo. El visitante escogía tres, memorizaba esa cuota, y la solicitud
       salía a seis con otra cuota. La base sí lo aceptaba: el único que tiraba
       la elección era la pantalla.
       Es literalmente lo que Joan pidió: «agrégale las cuotas que quieres para
       pagar ese préstamo». */
    const P = abrirPlay();
    /* 1 · el simulador de adentro tiene deslizador de plazo, con el MISMO rango
          que la calculadora de la portada. */
    const t = P.ev('tarjetaSimulador("nuevo")');
    assert.match(t, /id="rPlazo"/, 'el simulador de la cuenta no deja elegir el plazo');
    assert.ok(t.indexOf('min="' + P.ev('CALC_MESES_MIN') + '"') >= 0 &&
              t.indexOf('max="' + P.ev('CALC_MESES_MAX') + '"') >= 0,
      'el deslizador de plazo de adentro tiene otro rango que el de la portada');
    /* 2 · mover el plazo cambia lo que se cotiza. */
    P.ev('SESION = { access_token: "t", user: { email: "573001112233@tugarantia.net", ' +
         'user_metadata: { perfil: "nuevo" } } };');
    P.ev('cambiaPlazo(3)');
    assert.equal(P.ev('PLAZO'), 3);
    const tres = (P.elems.simu.innerHTML.match(/Cuota \d/g) || []).length;
    P.ev('cambiaPlazo(6)');
    const seis = (P.elems.simu.innerHTML.match(/Cuota \d/g) || []).length;
    assert.equal(tres, 3, 'a tres cuotas el simulador pinta ' + tres);
    assert.equal(seis, 6, 'a seis cuotas el simulador pinta ' + seis);
    /* 3 · y es ESE el que viaja en la solicitud, no el del producto. */
    const i = VIVO.indexOf('function pedir()');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /p_meses:\s*PLAZO/,
      'pedir() sigue mandando el plazo del producto en vez del que eligió el socio');
    assert.ok(!/p_meses:\s*C\.PLAZO_MESES/.test(cuerpo));
    /* 4 · y la confirmación dice el que se mandó. */
    const j = VIVO.indexOf('function pintarPedido()');
    assert.match(VIVO.slice(j, VIVO.indexOf('\nfunction ', j + 1)), /textoCuotas\(PLAZO\)/,
      'la pantalla de confirmación le dice un plazo que no es el que pidió');
  });

  test('el plazo se pinza al rango del motor antes de cotizar', () => {
    /* Por debajo del piso de 90 días C.simular LANZA, y esta pantalla es un div
       vacío: la lámina saldría en blanco. */
    const P = abrirPlay();
    P.ev('cambiaPlazo(1)');
    assert.equal(P.ev('PLAZO'), P.ev('CALC_MESES_MIN'), 'aceptó un plazo por debajo del piso');
    P.ev('cambiaPlazo(99)');
    assert.equal(P.ev('PLAZO'), P.ev('CALC_MESES_MAX'), 'aceptó un plazo por encima del tope');
    P.ev('cambiaPlazo("hola")');
    assert.ok(P.ev('PLAZO') >= P.ev('CALC_MESES_MIN') && P.ev('PLAZO') <= P.ev('CALC_MESES_MAX'),
      'una entrada que no es número deja el plazo fuera de rango');
  });

  test('NO SE DICE «MÁS BARATO» DE LO QUE CUESTA MÁS EN LA MISMA PANTALLA', () => {
    /* La tarjeta del crédito con garantía decía «más barato» y «más grande», y
       las dos eran falsas contra la calculadora de tres centímetros más arriba.
       Esta prueba no fija la frase: corre los DOS motores sobre el rango donde
       se pisan y solo prohíbe la palabra cuando el precio la desmiente. El día
       que Joan baje el 2% mensual y el respaldado sí salga más barato, la
       palabra vuelve a estar permitida sola. */
    const P = abrirPlay();
    const hoy = P.ev('hoyISO()');
    const vacia = { datos: {}, referidos: 0, acumulada: 0, ajuste: 0, comprometida: 0 };
    const min = M.MONTO_MINIMO_RESPALDADO;
    let respaldadoMasCaro = false, ejemplo = '';
    for (let cap = min; cap <= min * 4; cap += min) {
      for (let m = Math.ceil(C.PLAZO_MINIMO_DIAS / 30); m <= M.PLAZO_RESPALDADO_MAX; m++) {
        const a = C.simular({ perfil: 'preferente', capital: cap, fecha_desembolso: hoy, meses: m });
        const ca = a.puede ? a : a.cotizacion;
        const cb = M.simularPrestamoRespaldado(cap, m, vacia, { fechaDesembolso: hoy });
        if (ca && cb.total_a_pagar > ca.total_a_pagar) {
          respaldadoMasCaro = true;
          if (!ejemplo) ejemplo = cap + ' a ' + m + ' meses: respaldado ' +
            cb.total_a_pagar + ' contra ' + ca.total_a_pagar;
        }
      }
    }
    const i = VIVO.indexOf('function tarjetaCalcGarantia');
    const texto = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    if (respaldadoMasCaro) {
      assert.ok(!/barat|más bajo|mas bajo|menos cuesta/i.test(texto),
        'la tarjeta del crédito con garantía dice que es más barato y no lo es (' + ejemplo + ')');
    }
    /* Y «más grande» solo si el deslizador llega más lejos que el del otro. */
    if (P.ev('GCALC_MAX') < P.ev('CALC_MAX')) {
      assert.ok(!/más grande|mas grande/i.test(texto),
        'dice «más grande» y su deslizador llega a ' + P.ev('GCALC_MAX') +
        ' contra ' + P.ev('CALC_MAX') + ' del de arriba');
    }
  });

  test('EL GUARDIÁN DEL TECHO CORRE EN CADA ARRASTRE, no solo al abrir', () => {
    /* Se comprobaba una vez, con el combo de arranque. La efectiva anual no es
       constante en el rango —el redondeo de la cuota la mueve—, así que el mes
       que el techo caiga dentro de esa ventana, arrastrar el dedo publicaría un
       precio ilegal. Artículo 305. */
    const i = VIVO.indexOf('function cifrasDeGarantia');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /garantiaSePuedeCotizar\(c\)/,
      'cifrasDeGarantia imprime precios sin volver a comprobar el techo');
    /* Y de verdad frena: con un techo imposible, no pinta ni una cifra.
       Se le cambia el techo a la COPIA que la página tomó al cargar (`var C =
       window.CreditosPublicables`), no al módulo: reemplazar el global no habría
       hecho nada, porque la página ya guardó su referencia. */
    const P = abrirPlay();
    /* Se clavan LAS DOS: la vigente y la de referencia. Desde el 15-sep la reja
       pregunta por topeDeReferencia (porque la vigente se vence cada mes), así
       que clavar solo una dejaba la otra contestando lo de verdad y la prueba
       medía otra cosa de la que creía. */
    P.ev('C = Object.assign({}, C); ' +
         'C.topeVigente = function () { ' +
         'return { desde: "x", hasta: "y", consumo_ordinario: 0.01, fuente: "prueba" }; };' +
         'C.topeDeReferencia = function () { ' +
         'return { tope: 0.01, vigente: true, fuente: "prueba" }; };');
    const h = P.ev('cifrasDeGarantia()');
    assert.ok(h.indexOf('Tasa efectiva anual') === -1,
      'con el precio por encima del techo sigue imprimiendo la tasa');
    assert.match(h, /no podemos publicar un precio/i);
  });

  test('EL 1 DE OCTUBRE LA CALCULADORA NO DESAPARECE: se calla la frase, no el precio', () => {
    /* La tabla de topes se vence el último día de cada mes por diseño. Hasta el
       16-sep, un tope nulo hacía que la tarjeta ENTERA del crédito con garantía
       se fuera de la puerta pública —cuota, total, las seis fechas, el cuadro de
       lo que gana pagando— y se quedara así hasta que alguien le agregara una
       fila a la tabla. Es justo lo contrario de la decisión escrita del 4-sep. */
    /* No se le miente a nadie sobre el techo: se corre el RELOJ de la página al
       primer día que la tabla ya no cubre, y todo lo demás —el motor, la
       divulgación, el guardián— trabaja con su código de verdad. La fecha se
       DERIVA del último tope, así que el día que Joan cargue octubre esta prueba
       se muda sola al 1 de noviembre en vez de dejar de medir en silencio. */
    const ult = C.TOPES[C.TOPES.length - 1].hasta;
    const d = new Date(ult + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const TRAS = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                 '-' + String(d.getDate()).padStart(2, '0');
    assert.equal(C.topeVigente(TRAS), null,
      'el supuesto se rompió: la tabla ya cubre ' + TRAS + '. No borres la prueba.');

    const P = abrirPlay();
    P.ev('hoyISO = function () { return "' + TRAS + '"; };');
    P.ev('DIVULGACION = null; DIVULGACION_G = null;');
    const h = P.ev('tarjetaCalcGarantia()');
    assert.ok(h.indexOf('Hoy no podemos publicar su precio') === -1,
      'sin certificación la tarjeta del crédito con garantía vuelve a desaparecer');
    assert.match(h, /gcalcCifras/, 'no pinta las cifras');
    /* Y la letra obligatoria calla el techo en vez de inventarlo. */
    const letra = P.ev('divulgacionGarantiaHoy()');
    assert.ok(letra.indexOf('0,00%') === -1, 'publica que el techo legal es cero');
    assert.ok(letra.indexOf('Tasa máxima legal') === -1,
      'afirma cuál es el techo legal sin que nadie lo haya certificado');
    assert.match(letra, /Tasa efectiva anual máxima/,
      'se calló la divulgación entera en vez de solo la frase del techo');
  });

  test('LA ÚLTIMA CUOTA, CUANDO ES DISTINTA, SE DICE', () => {
    /* Los dos motores cuadran el sobrante en la última cuota, así que la cifra
       grande por el plazo puede no dar el total por dos o tres pesos. Antes no
       importaba porque nadie veía la última; desde que el plan está en pantalla,
       una cifra grande que dice «cada mes» al lado de una lista donde la última
       es distinta es la pantalla contradiciéndose. */
    const P = abrirPlay();
    const hoy = P.ev('hoyISO()');
    let caso = null;
    for (let cap = 100000; cap <= 2000000 && !caso; cap += 50000) {
      for (let m = 3; m <= 6 && !caso; m++) {
        const r = C.simular({ perfil: 'preferente', capital: cap, fecha_desembolso: hoy, meses: m });
        const c = r.puede ? r : r.cotizacion;
        if (c && c.cuotas[c.cuotas.length - 1].total !== c.cuota_tipica) caso = { cap, m, c };
      }
    }
    assert.ok(caso, 'no encontré ningún caso donde la última cuota difiera: revisa el motor');
    P.ev('CALC.monto = ' + caso.cap + '; CALC.meses = ' + caso.m + ';');
    const h = P.ev('cifrasDeCalc()');
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.match(h, /la última,/,
      'con ' + caso.cap + ' a ' + caso.m + ' meses la última cuota es distinta y no se dice');
    assert.ok(h.indexOf(COP(caso.c.cuotas[caso.c.cuotas.length - 1].total)) >= 0,
      'no muestra cuánto vale de verdad la última');
    /* Y cuando NO difiere, no se dice nada: un aviso que sale siempre no se lee. */
    const igual = { cuota_fija: 100, cuotas: [{ total: 100 }, { total: 100 }] };
    assert.equal(P.ev('avisoUltimaCuota(' + JSON.stringify(igual) + ')'), '',
      'avisa de la última cuota aunque sea igual a las demás');
  });

  test('COTIZAR NO PUEDE COSTAR 22 MS: el techo que cabe se recuerda', () => {
    /* La puerta pública cotiza en CADA movimiento del dedo. Medido el 16-sep:
       costoQueCabe hace 200 bisecciones y cada una llama a tirMensual, que hace
       otras 300 — unas 420.000 potencias por cotización, 22 ms en un escritorio
       y 250 a 450 ms en un celular de gama baja. Y el resultado no depende del
       monto: solo del plazo y del techo. */
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      C.simular({ perfil: 'preferente', capital: 100000 + i * 50000,
                  fecha_desembolso: HOY, meses: 6 });
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 100;
    assert.ok(ms < 3,
      'cada cotización cuesta ' + ms.toFixed(2) + ' ms en un escritorio: en el celular ' +
      'de un cliente eso es medio segundo por cada movimiento del deslizador');
    /* Y el resultado sigue siendo el mismo, que es lo que hace segura la caché. */
    const a = C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: HOY, meses: 6 });
    const b = C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: HOY, meses: 6 });
    const ca = a.puede ? a : a.cotizacion, cb = b.puede ? b : b.cotizacion;
    assert.deepEqual(ca, cb, 'dos cotizaciones iguales dan resultados distintos');
  });

  test('la letra obligatoria va SIEMPRE con las cifras', () => {
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    assert.match(P.elems.cuerpo.innerHTML, /Tasa efectiva anual máxima/,
      'la portada pinta precios sin la divulgación que Google exige');
  });

  test('y los nueve pasos del registro pintan sin reventar', () => {
    /* Uno por uno: un error en cualquiera deja al cliente en blanco a mitad de
       llenar el formulario, que es exactamente donde no puede volver a empezar. */
    const P = abrirPlay();
    const n = P.ev('PASOS.length');
    for (let i = 0; i < n; i++) {
      P.ev('pintarRegistro(' + i + ')');
      const h = P.elems.cuerpo.innerHTML;
      assert.ok(h.length > 200, 'el paso ' + (i + 1) + ' de ' + n + ' salió vacío');
      assert.ok(h.indexOf('Paso ' + (i + 1) + ' de ' + n) >= 0,
        'el paso ' + (i + 1) + ' no dice en cuál va');
    }
  });
});

/* ==========================================================================
 * LA CUENTA DEL SOCIO — las cuatro pestañas, 14 de septiembre de 2026
 *
 * Joan pidió Perfil, Historial, Chat (tres canales) y Crédito. Lo que se vigila
 * acá no es que se vean bonitas: es que ninguna mienta.
 *
 * En particular la mentira que este proyecto tiene más a mano hoy: las funciones
 * de la base viven en una migración que Joan corre A MANO, y hasta que la corra
 * el servidor contesta 404. Traducir un 404 a «no tienes mensajes» o a «revisa
 * tu internet» es la interfaz mintiendo sobre la causa, y manda al cliente a
 * reiniciar el teléfono por algo que está en el servidor.
 * ======================================================================== */
describe('la cuenta del socio: cuatro pestañas que no mienten (14-sep-2026)', () => {

  const vm = require('node:vm');
  /* El mismo banco de la vitrina, pero abriendo la cuenta con una sesión puesta.
     `red` decide qué contesta la nube: por defecto, 404 — el estado real de la
     nube de Joan hoy. */
  function abrirCuenta(red) {
    const P = abrirPlay({ red: red || (() => Promise.resolve({
      ok: false, status: 404, json: () => Promise.resolve({}) })) });
    P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net", ' +
         'user_metadata: { perfil: "nuevo" } } };');
    P.ev('pintarCuenta()');
    return P;
  }
  const lamina = P => P.elems.lamina.innerHTML;

  test('LAS CUATRO PINTAN: ninguna deja al socio en blanco', () => {
    const P = abrirCuenta();
    ['credito', 'historial', 'chat', 'perfil'].forEach(t => {
      P.ev('irA("' + t + '")');
      assert.ok(lamina(P).length > 150,
        'la pestaña ' + t + ' salió casi vacía (' + lamina(P).length + ' letras)');
    });
  });

  test('la barra marca UNA sola pestaña, y son las cuatro que Joan pidió', () => {
    const P = abrirCuenta();
    const nombres = P.ev('PESTANAS.map(function (x) { return x[0]; }).join(",")');
    assert.equal(nombres, 'credito,historial,chat,perfil');
    ['credito', 'historial', 'chat', 'perfil'].forEach(t => {
      P.ev('irA("' + t + '")');
      const marcadas = (P.elems.tabs.innerHTML.match(/class="tab on"/g) || []).length;
      assert.equal(marcadas, 1, 'en ' + t + ' hay ' + marcadas + ' pestañas marcadas');
    });
  });

  test('CON LA MIGRACIÓN SIN CORRER, dice que no está encendido — no culpa al internet', () => {
    /* El estado real de la nube de Joan mientras no pegue las migraciones. La
       pantalla tiene tres respuestas distintas para tres causas distintas, y
       esta prueba exige que no se confundan. */
    const P = abrirCuenta();
    return asentar().then(() => {
      assert.equal(P.ev('FICHA_ESTADO'), 'apagada',
        'un 404 se está leyendo como otra cosa');
      P.ev('irA("credito")');
      const h = lamina(P);
      assert.match(h, /todavía no está encendida/,
        'la pantalla no dice que esa parte no está encendida');
      assert.ok(!/revisa tu internet/i.test(h),
        'la pantalla le echa la culpa al internet del cliente por un 404 del servidor');
      assert.ok(!/no tienes historial/i.test(h),
        'la pantalla afirma que el socio no tiene historial cuando lo que pasa es que no pudo preguntar');
    });
  });

  test('sin vincular NO es un error: se le dice cómo juntar su historial', () => {
    const P = abrirCuenta(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true, vinculada: false }) }));
    return asentar().then(() => {
      assert.equal(P.ev('FICHA_ESTADO'), 'nueva');
      P.ev('irA("credito")');
      assert.match(lamina(P), /Perfil/,
        'al registrado nuevo no se le dice dónde juntar su historial');
      assert.ok(!/ambar/.test(lamina(P).slice(0, 400)) || !/error/i.test(lamina(P)),
        'estar sin vincular se está pintando como un fallo');
    });
  });

  test('el chat tiene los TRES canales que Joan pidió, los tres a la vista', () => {
    const P = abrirCuenta();
    P.ev('irA("chat")');
    const h = lamina(P);
    ['Servicio al cliente', 'Cobranzas', 'Créditos nuevos'].forEach(c =>
      assert.ok(h.indexOf(c) >= 0, 'falta el canal: ' + c));
    const canales = P.ev('CANALES.map(function (c) { return c[0]; }).join(",")');
    assert.equal(canales, 'servicio,cobranza,creditos',
      'los nombres de los canales no son los que acepta el servidor (chat_escribir_sesion)');
  });

  test('cambiar de canal NO repinta la lámina: se perdería lo que el socio escribió', () => {
    /* Defecto cometido dos veces en este proyecto: repintar el contenedor de un
       campo mientras alguien escribe adentro. Acá se nota porque el cuadro de
       texto tendría que sobrevivir al cambio de canal. */
    const P = abrirCuenta();
    P.ev('irA("chat")');
    P.ev('document.getElementById("chTexto").value = "no me borres"');
    P.ev('abrirCanal("cobranza")');
    assert.equal(P.ev('document.getElementById("chTexto").value'), 'no me borres',
      'cambiar de canal le borró al socio lo que estaba escribiendo');
    assert.equal(P.ev('CANAL'), 'cobranza');
  });

  test('CUATRO CAUSAS, CUATRO RESPUESTAS: el 401 no es «revisa tu internet»', () => {
    /* 14-sep-2026 — visto en el navegador, con un token de mentira: el servidor
       contesta 401 y la pantalla decía «revisa tu internet». El internet estaba
       perfecto; lo que pasó fue que la sesión se venció, y eso se arregla con un
       toque, no reiniciando el teléfono.

       La prueba fija las cuatro causas para que nadie las vuelva a juntar. */
    const P = abrirCuenta();
    const causa = e => P.ev('causaDe(' + JSON.stringify(e) + ')');
    assert.equal(causa({ message: 'http 404' }), 'apagado');
    assert.equal(causa({ message: 'http 401' }), 'sesion');
    assert.equal(causa({ message: 'http 403' }), 'sesion');
    assert.equal(causa({ sinSesion: true }), 'sesion');
    assert.equal(causa({ message: 'Failed to fetch' }), 'falla');
    assert.equal(causa({}), 'falla');
    /* Y que un 500 no se lea como sesión vencida: mandaría a la persona a
       escribir su contraseña por un fallo del servidor. */
    assert.equal(causa({ message: 'http 500' }), 'falla');
  });

  test('con la sesión vencida se le ofrece volver a entrar, no reiniciar el teléfono', () => {
    const P = abrirCuenta(() => Promise.resolve({
      ok: false, status: 401, json: () => Promise.resolve({}) }));
    return asentar().then(() => {
      assert.equal(P.ev('FICHA_ESTADO'), 'sesion');
      P.ev('irA("credito")');
      const h = lamina(P);
      assert.match(h, /sesión se venció/, 'no dice que la sesión se venció');
      assert.match(h, /salirDeCuenta\(\)/, 'no le ofrece volver a entrar de un toque');
      assert.ok(!/revisa tu internet/i.test(h),
        'le echa la culpa al internet por una sesión vencida');
    });
  });

  test('el chat apagado se dice apagado, y no «no tienes mensajes»', () => {
    const P = abrirCuenta();
    P.ev('irA("chat")');
    return asentar().then(() => {
      assert.equal(P.ev('HILO.estado'), 'apagado');
      assert.match(P.elems.hilo.innerHTML, /todavía no está encendido/);
    });
  });

  test('EL PERFIL NO OFRECE CAMBIAR EL USUARIO, y explica por qué', () => {
    /* El usuario es el celular, y de ahí sale el correo interno que ES la
       identidad de la cuenta. Hay un disparador en la base que niega el cambio
       (20260914) porque por ahí se pudo entrar a la cuenta de otro. Ofrecer un
       botón que el servidor va a negar sería prometer lo que el código no hace. */
    const P = abrirCuenta();
    P.ev('irA("perfil")');
    const h = lamina(P);
    assert.match(h, /no se cambia desde aquí/,
      'el perfil no explica por qué el usuario no se toca');
    assert.ok(h.indexOf('3001112233') >= 0 || h.indexOf('300 111 2233') >= 0,
      'el perfil no muestra cuál es su usuario');
    /* Y el celular sale del correo con la MISMA forma que exige el servidor. */
    assert.equal(P.ev('celularDeSesion()'), '3001112233');
    assert.equal(P.ev('(function(){ var g = SESION; SESION = { user: { email: "570003172862539@tugarantia.net" } }; ' +
      'var r = celularDeSesion(); SESION = g; return r; })()'), '',
      'celularDeSesion acepta un correo que no es de esta casa: es el hueco del 14-sep otra vez');
  });

  test('cambiar la contraseña NO manda el correo, ni por error', () => {
    /* El 14-sep se pudo entrar a la cuenta de otro mandando {"email": ...} a
       /auth/v1/user con la llave pública. La base ya lo niega con un disparador;
       esto es la segunda cerradura, en la pantalla. */
    const cuerpos = [];
    const P = abrirCuenta((url, cfg) => {
      cuerpos.push({ url: String(url), body: cfg && cfg.body });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    P.ev('irA("perfil")');
    P.ev('document.getElementById("clave1").value = "unaclavelarga"');
    P.ev('document.getElementById("clave2").value = "unaclavelarga"');
    P.ev('cambiarClave()');
    const puesta = cuerpos.filter(c => c.url.indexOf('/auth/v1/user') >= 0);
    assert.equal(puesta.length, 1, 'no mandó el cambio de contraseña');
    assert.ok(puesta[0].body.indexOf('email') === -1,
      'el cambio de contraseña lleva el correo en el cuerpo: eso es lo que dejó entrar a la cuenta de otro');
    assert.match(puesta[0].body, /password/);
  });

  test('salir le avisa al servidor, no solo a la pantalla', () => {
    const urls = [];
    const P = abrirCuenta(url => {
      urls.push(String(url));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    P.ev('salirDeCuenta()');
    assert.ok(urls.some(u => u.indexOf('/auth/v1/logout') >= 0),
      'salir deja el token vivo en el servidor hasta que se venza solo');
    assert.equal(P.ev('SESION'), null);
  });

  test('con garantía ganada, la calculadora deja de decir que no puede pedir', () => {
    /* El camino completo: llega la ficha de un socio con garantía, ficha.js la
       lee, y la línea del acceso cambia sola. Si esto se cae, o la ficha no se
       está leyendo o el techo está escrito a mano. */
    const datos = { garantia: { total: 2000000, acumulada: 2000000, comprometida: 0,
                                cupon: 0, referidos: 0 },
                    creditos: [], respaldados: [], perfil: { datos: {} },
                    referidos: { total: 0, pagaron: 0 } };
    const P = abrirCuenta(() => Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ ok: true, vinculada: true, nombre: 'Ana', datos }) }));
    return asentar().then(() => {
      assert.equal(P.ev('FICHA_ESTADO'), 'vinculada');
      const disp = P.ev('respaldoDisponible()');
      assert.ok(disp > 0, 'la ficha llegó pero el respaldo salió en cero');
      /* Y sale del motor, no de una cuenta de la pantalla. */
      assert.equal(disp, M.maximoRespaldado({ datos: {}, referidos: 0,
        acumulada: 2000000, ajuste: 0, comprometida: 0 }),
        'el respaldo que enseña la pantalla no es el que calcula el motor');
      P.ev('irA("credito")');
      assert.ok(!/todavía no lo puedes pedir/.test(lamina(P)),
        'con garantía ganada sigue diciendo que no puede pedir');
      assert.match(lamina(P), /Tu garantía/, 'no le muestra su garantía');
    });
  });

  test('el crédito activo se ve con sus cuotas SEGMENTADAS', () => {
    /* Joan: «segmentado la fecha y monto a pagar para mejorar la cobranza y dar
       claridad». Una cuota sin fecha no sirve para cobrar. */
    const datos = { garantia: { total: 0, acumulada: 0, comprometida: 0 },
      creditos: [], perfil: { datos: {} }, referidos: { total: 0, pagaron: 0 },
      respaldados: [{ capital: 1000000, plazo_meses: 6, pagado: false, saldo_capital: 700000,
        cuotas: [{ numero: 1, fecha_corte: '2026-10-15', total: 178526, pagado: true },
                 { numero: 2, fecha_corte: '2026-11-15', total: 178526, pagado: false }] }] };
    const P = abrirCuenta(() => Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ ok: true, vinculada: true, nombre: 'Ana', datos }) }));
    return asentar().then(() => {
      P.ev('irA("credito")');
      const h = lamina(P);
      assert.match(h, /Tu crédito con garantía/, 'no muestra el crédito activo');
      assert.ok(h.indexOf('15 nov 2026') >= 0, 'la cuota que sigue no trae su fecha');
      assert.ok(h.indexOf('15 oct 2026') >= 0, 'las cuotas no se ven una por una');
      assert.ok(h.indexOf('$178.526') >= 0, 'las cuotas no traen su monto');
    });
  });
});

describe('LA LETRA OBLIGATORIA HABLA DEL CRÉDITO QUE ESTÁ EN PANTALLA (15-sep-2026)', () => {

  /* Lo encontró Joan mirando la página: con el deslizador en ocho millones, la
     calculadora decía «En total vas a pagar $8.513.600» y tres centímetros más
     abajo, en la letra obligatoria, «Ejemplo: por $500.000 (…) un total de
     $532.100». Dos juegos de cifras juntos y nada que dijera cuál era el suyo.

     El ejemplo fijo no estaba MAL —un ejemplo representativo es justo lo que
     piden Google y la norma—, pero estar bien y entenderse no son lo mismo.
     Quien lee dos totales distintos no concluye «uno es un ejemplo»: concluye
     que le están escondiendo algo. */

  test('el ejemplo SIGUE al deslizador, en todo el rango', () => {
    const P = abrirPlay();
    const min = P.ev('CALC_MIN'), max = P.ev('CALC_MAX'), paso = P.ev('CALC_PASO');
    const malos = [];
    for (let m = P.ev('CALC_MESES_MIN'); m <= P.ev('CALC_MESES_MAX'); m++) {
      for (let v = min; v <= max; v += paso) {
        P.ev('CALC.monto = ' + v + '; CALC.meses = ' + m + ';');
        const letra = P.ev('letraDeCalc()');
        const cifras = P.ev('cifrasDeCalc()');
        if (/aviso ambar">No podemos/.test(cifras)) continue;

        const totalArriba = (cifras.match(/En total vas a pagar<\/span><b>\$([\d.]+)/) || [])[1];
        const ej = letra.match(/Ejemplo: por \$([\d.]+) a (\d+) meses pagas \d+ cuotas de \$([\d.]+), para un total de \$([\d.]+)/);
        if (!ej) { malos.push(v + '/' + m + 'm: la letra no trae ejemplo'); continue; }
        if (ej[1] !== v.toLocaleString('es-CO')) {
          malos.push(v + '/' + m + 'm: arriba pide $' + v.toLocaleString('es-CO') +
            ' y el ejemplo habla de $' + ej[1]);
        }
        if (Number(ej[2]) !== m) {
          malos.push(v + '/' + m + 'm: el ejemplo dice ' + ej[2] + ' meses');
        }
        if (totalArriba && ej[4] !== totalArriba) {
          malos.push(v + '/' + m + 'm: total arriba $' + totalArriba +
            ' y en la letra $' + ej[4]);
        }
      }
    }
    assert.deepEqual(malos.slice(0, 8), [],
      'la letra obligatoria habla de un crédito distinto del que el cliente está mirando');
  });

  test('la TASA MÁXIMA no se mueve: es la del producto, no la de su crédito', () => {
    /* Publicar la de su cotización como «máxima» sería anunciar una tasa menor
       que la mayor que se cobra. La tasa es del producto; el ejemplo es suyo. */
    const K = require('../app/cumplimiento.js');
    const base = K.divulgacion('2026-09-15');
    for (const cap of [300000, 1000000, 5000000, 8000000]) {
      for (const meses of [3, 4, 5, 6]) {
        const d = K.divulgacion('2026-09-15', { capital: cap, meses });
        assert.equal(d.tae_maxima, base.tae_maxima,
          'la tasa máxima cambió con el monto (' + cap + '/' + meses + 'm)');
      }
    }
  });

  test('mover el deslizador REPINTA la letra', () => {
    /* Sin esto el ejemplo se queda en la combinación anterior y vuelve el
       defecto exacto que encontró Joan. */
    const P = abrirPlay();
    P.ev('tarjetaCalculadora()');
    /* El elemento de mentira nace la primera vez que alguien lo pide, asi que
       hay que pedirlo ANTES de ponerle valor. */
    P.ev("$('calcMonto').value = String(CALC_MAX); $('calcMeses').value = '6';");
    P.ev('moverCalc()');
    const pintado = P.elems.calcLetra.innerHTML || '';
    assert.ok(pintado.indexOf('Ejemplo') > -1, 'moverCalc no repinta la letra obligatoria');
    assert.ok(pintado.indexOf('8.000.000') > -1,
      'la letra repintada sigue hablando de otro monto: ' + pintado.slice(0, 200));
  });

  test('si su combinación no se puede cotizar, la letra NO se queda sin números', () => {
    /* La letra es obligatoria. Antes que publicarla coja, se cae al ejemplo de
       siempre, que siempre cotiza. */
    const K = require('../app/cumplimiento.js');
    for (const malo of [{ capital: -5, meses: 6 }, { capital: 0, meses: 6 },
                        { capital: 1000000, meses: 99 }]) {
      const d = K.divulgacion('2026-09-15', malo);
      if (!d.puede) continue;
      assert.match(d.texto, /Ejemplo: por \$[\d.]+ a \d+ meses/,
        'con ' + JSON.stringify(malo) + ' la letra quedó sin ejemplo');
    }
  });

  test('la caché de la letra va POR COMBINACIÓN, no una sola', () => {
    /* Con una sola entrada, que el ejemplo siguiera al deslizador no habría
       servido: la primera respuesta se queda pegada. */
    const P = abrirPlay();
    P.ev('CALC.monto = 500000; CALC.meses = 6;');
    const a = P.ev('divulgacionHoy({ capital: 500000, meses: 6 })');
    const b = P.ev('divulgacionHoy({ capital: 3000000, meses: 4 })');
    assert.notEqual(a, b, 'la caché devuelve el mismo texto para dos créditos distintos');
    assert.equal(P.ev('divulgacionHoy({ capital: 500000, meses: 6 })'), a,
      'la caché no conserva la primera combinación');
  });
});

describe('CADA CIFRA TIENE NOMBRE (15-sep-2026)', () => {

  /* Joan, mirando su propia página: «me refiero al valor en color amarillo (…)
     miro el capital del prestamo y lo que el cliente paga al final y no cuadra
     con el valor en color amarillo o no entiendo que significa».

     El número grande era la CUOTA, pero encima decía «Mira cuánto te costaría»
     y su única explicación estaba debajo, en gris chiquito. Tres cifras en la
     tarjeta —cuota, costo y total— y la más grande era la única sin nombre
     propio. Si el dueño del negocio no la entiende, el cliente tampoco. */

  const texto = h => String(h).replace(/<[^>]*>/g, '\n').replace(/\n{2,}/g, '\n').trim();

  /* 16-sep-2026 — ESTA PRUEBA SE AFLOJÓ A PROPÓSITO, Y SOLO EN UNA COSA.

     Decía: la primera línea tiene que decir «Pagarías cada mes». Eso clavaba
     CUÁL es la cifra grande, y el 16 Joan pidió cambiarla: «el monto que RECIBE
     grande y de primero, con el costo pequeño y abajo». La calculadora de
     arriba ahora encabeza con «Lo que recibes».

     LO QUE ESTA PRUEBA PROTEGE DE VERDAD NO ERA ESA FRASE: era que la cifra
     grande TENGA NOMBRE Y QUE EL NOMBRE VAYA ENCIMA. El defecto del 15-sep fue
     un número de 38 px sin etiqueta propia, no un número equivocado. Así que se
     comprueba eso mismo, sin decir cuál tiene que ser el número: la primera
     línea es texto —no un monto—, y la segunda es el monto.

     Si alguien vuelve a poner la cifra grande sin rótulo, esto se cae igual que
     antes. Lo único que ya no se exige es QUÉ dice el rótulo, que es una
     decisión de producto y es de Joan. */
  test('la cifra grande dice qué es, ANTES de la cifra', () => {
    const P = abrirPlay();
    const esMonto = l => /^\$[\d.]+( ✓)?$/.test(String(l).trim());
    for (const [nombre, prep, pinta] of [
      ['ARRIBA', 'CALC.monto = 500000; CALC.meses = 6;', 'cifrasDeCalc()'],
      ['GARANTIA', 'GCALC.monto = 1000000; GCALC.meses = 6; GCALC.arranque = null;', 'cifrasDeGarantia()']
    ]) {
      P.ev(prep);
      const lineas = texto(P.ev(pinta)).split('\n');
      assert.ok(lineas[0].trim().length > 3 && !esMonto(lineas[0]),
        nombre + ': la primera línea no dice qué es la cifra grande, dice: ' + lineas[0]);
      assert.match(lineas[1], /^\$[\d.]+$/,
        nombre + ': la cifra grande no va justo debajo de su nombre');
    }
  });

  /* Y el rótulo de la cifra grande no puede volver a hablar de COSTO, que es
     el defecto original: «MIRA CUÁNTO TE COSTARÍA» encima de una cuota hacía
     leer la cuota como el costo. Da igual cuál sea la cifra: si la palabra de
     arriba nombra una cosa y debajo hay otra, la pantalla miente. */
  test('el rótulo de la cifra grande no habla de costo', () => {
    const P = abrirPlay();
    for (const [nombre, prep, pinta] of [
      ['ARRIBA', 'CALC.monto = 500000; CALC.meses = 6;', 'cifrasDeCalc()'],
      ['GARANTIA', 'GCALC.monto = 1000000; GCALC.meses = 6; GCALC.arranque = null;', 'cifrasDeGarantia()']
    ]) {
      P.ev(prep);
      const rotulo = texto(P.ev(pinta)).split('\n')[0];
      assert.ok(!/cuesta|costar|costo/i.test(rotulo),
        nombre + ': el rótulo de la cifra grande dice «' + rotulo + '», y lo que ' +
        'hay debajo no es el costo');
    }
  });

  test('NINGUNA cifra de la tarjeta queda sin etiqueta', () => {
    /* Se recorre el texto plano: cada línea que sea solo un monto tiene que
       venir precedida de una línea que NO sea un monto. */
    const P = abrirPlay();
    for (const [nombre, prep, pinta] of [
      ['ARRIBA', 'CALC.monto = 500000; CALC.meses = 6;', 'cifrasDeCalc()'],
      ['GARANTIA', 'GCALC.monto = 1000000; GCALC.meses = 6; GCALC.arranque = null;', 'cifrasDeGarantia()']
    ]) {
      P.ev(prep);
      const lineas = texto(P.ev(pinta)).split('\n').map(x => x.trim()).filter(Boolean);
      const esMonto = l => /^\$[\d.]+( ✓)?$/.test(l);
      for (let i = 0; i < lineas.length; i++) {
        if (!esMonto(lineas[i])) continue;
        assert.ok(i > 0 && !esMonto(lineas[i - 1]),
          nombre + ': la cifra ' + lineas[i] + ' no tiene etiqueta encima');
      }
    }
  });

  test('el título de la tarjeta ya no promete que la cifra es el costo', () => {
    /* La frase «Mira cuánto te costaría», pegada encima de la cifra grande,
       hacía leer la CUOTA como si fuera el costo. */
    const P = abrirPlay();
    const gancho = P.ev('TEXTOS.gancho');
    assert.equal(/cu[aá]nto te costar/i.test(gancho), false,
      'el título vuelve a prometer un costo justo encima de una cifra que es la cuota: ' + gancho);
  });
});

/* ==========================================================================
 * LO QUE RECIBE MANDA, PERO LO QUE PAGA NO SE ESCONDE (16-sep-2026)
 *
 * Joan: «el monto que RECIBE grande y de primero, con el costo pequeño y
 * abajo». Se hizo. Y se le dijo que no a la otra mitad del pedido —«que no
 * muestre cuánto tiene que pagar»—, porque el costo total y la tasa efectiva
 * anual son divulgación obligatoria en la oferta de un crédito en Colombia y
 * app/cumplimiento.js existe justo para imprimirlos. Mostrar solo lo que
 * recibe y callar lo que paga es el patrón que la SIC sanciona.
 *
 * ESTE BLOQUE ES LA DIFERENCIA ENTRE LAS DOS COSAS. Reordenar está bien; que
 * el reordenar se lleve por delante una cifra obligatoria, no. Si mañana
 * alguien «limpia» la tarjeta y se le va el costo o la tasa, esto lo grita.
 * ======================================================================== */
describe('lo que recibe manda, pero lo que paga sigue en pantalla (16-sep-2026)', () => {

  test('la cifra grande de la calculadora es LO QUE RECIBE, no otra cosa', () => {
    const P = abrirPlay();
    P.ev('CALC.monto = 500000; CALC.meses = 6;');
    const h = P.ev('cifrasDeCalc()');
    const grande = (h.match(/class="calc-cifra">([^<]+)</) || [])[1];
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.equal(grande, COP(500000),
      'la cifra grande dejó de ser el capital que la persona pidió, dice: ' + grande);
    /* Y su rótulo lo nombra. No se exige la frase exacta —eso es de Joan— pero
       sí que hable de recibir: si dice otra cosa, la cifra está mal nombrada. */
    const rotulo = (h.match(/class="etq-cifra">([^<]+)</) || [])[1];
    assert.match(rotulo, /recib/i,
      'la cifra grande es el capital y su rótulo dice «' + rotulo + '»');
  });

  test('el costo, el total y la tasa siguen impresos con la cifra', () => {
    const P = abrirPlay();
    P.ev('CALC.monto = 500000; CALC.meses = 6;');
    const h = P.ev('cifrasDeCalc()');
    const r = C.simular({ perfil: 'preferente', capital: 500000,
                          fecha_desembolso: P.ev('hoyISO()'), meses: 6 });
    const c = r.puede ? r : r.cotizacion;
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.match(h, /Lo que cuesta/, 'se fue el costo del crédito');
    assert.ok(h.indexOf(COP(c.costo_total)) >= 0, 'el costo que pinta no es el del motor');
    assert.match(h, /En total vas a pagar/, 'se fue el total');
    assert.ok(h.indexOf(COP(c.total_a_pagar)) >= 0, 'el total que pinta no es el del motor');
    assert.match(h, /Tasa efectiva anual/, 'se fue la tasa efectiva anual');
    /* El total sigue en su propia caja: la reordenada no puede degradarlo a
       renglón, que es de donde se lo sacó el 16-sep por la mañana. */
    assert.match(h, /class="granTotal"/, 'el total volvió a ser un renglón más');
  });

  test('LA CUOTA NO SE PIERDE al dejar de ser la cifra grande', () => {
    /* «Menos cuotas en la lista» no puede convertirse en «no se dice la
       cuota»: es el número con el que una persona decide si puede pagar o no.
       Bajó al pie de la cifra grande, con su propia clase para que se lea. */
    const P = abrirPlay();
    P.ev('CALC.monto = 500000; CALC.meses = 6;');
    const h = P.ev('cifrasDeCalc()');
    const r = C.simular({ perfil: 'preferente', capital: 500000,
                          fecha_desembolso: P.ev('hoyISO()'), meses: 6 });
    const c = r.puede ? r : r.cotizacion;
    const COP = n => '$' + n.toLocaleString('es-CO');
    assert.match(h, /class="pie-cuota"/, 'la cuota perdió su realce y quedó en gris chiquito');
    assert.ok(h.indexOf(COP(c.cuota_tipica)) >= 0, 'la cuota que pinta no es la del motor');
    assert.ok(h.indexOf(' ' + c.meses + ' cuotas') >= 0,
      'la cuota se dice sin decir cuántas son');
  });

  test('el plan de pago se PLIEGA, no se borra', () => {
    /* Joan pidió menos cuotas a la vista. Las seis fechas siguen en el HTML
       —las pidió él mismo esa misma mañana, «para dar claridad»— dentro de un
       <details> cerrado. Si alguien resuelve «menos» borrando, esto se cae. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.equal((h.match(/class="plegable det-cuotas"/g) || []).length, 2,
      'las dos calculadoras ya no pliegan su plan de pago de la misma forma');
    /* Cerrado de verdad: un <details> con `open` no pliega nada. */
    assert.equal(/<details[^>]*det-cuotas[^>]*\sopen/.test(h), false,
      'el plan de pago nace abierto: no se plegó nada');
  });

  test('el plan abierto NO se cierra solo al mover el deslizador', () => {
    /* Las cifras se repintan enteras en cada movimiento del dedo. Sin memoria,
       quien abre el plan y mueve un peso lo ve cerrarse — y lo que estaba
       mirando era justamente cómo cambian las fechas con el monto. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    P.ev('recordarPlan({ getAttribute: function () { return "calc"; }, open: true });');
    const h = P.ev('cifrasDeCalc()');
    assert.match(h, /data-plan="calc"\s+open/,
      'la calculadora se olvidó de que el plan estaba abierto');
    /* Y abrir el de arriba no abre el de la garantía: son dos lecturas. */
    assert.equal(/\sopen/.test(P.ev('cifrasDeGarantia()')), false,
      'abrir un plan abre también el de la otra calculadora');
  });
});

describe('EL ACOMPAÑAMIENTO: el permiso va primero (15-sep-2026)', () => {

  /* Joan pidió ver al cliente registrándose con sus fotos. Hoy NADA sale de ese
     teléfono hasta el paso 9, y la casilla que autoriza las fotos está EN el
     paso 9: quien la desmarca consigue que no salgan, y eso funciona de verdad.
     Publicar en el paso 2 volvería esa garantía papel mojado.
     Por eso el permiso es del cliente y va por delante. */

  test('no se publica NADA hasta que el cliente lo pide', () => {
    const P = abrirPlay();
    let llamadas = 0;
    P.ev('ACOMPANA = false; REGISTRO.celular = "3007778899";');
    /* Sin permiso, publicarAvance no llama a nadie. Se comprueba mirando que
       devuelva sin tocar la red: el banco no tiene red, así que si intentara
       llamar reventaría. */
    assert.doesNotThrow(() => P.ev('publicarAvance()'));
    assert.equal(P.ev('ACOMPANA'), false);
  });

  test('la tarjeta solo aparece cuando ya hay celular', () => {
    /* Sin número no hay a quién asociarlo: el asesor lo encuentra por ahí. */
    const P = abrirPlay();
    P.ev('REGISTRO.celular = "";');
    assert.equal(P.ev('tarjetaAcompanar()'), '');
    P.ev('REGISTRO.celular = "3007778899";');
    assert.match(P.ev('tarjetaAcompanar()'), /asesor te acompañe/);
  });

  test('la tarjeta DICE qué se ve y qué no', () => {
    const P = abrirPlay();
    P.ev('REGISTRO.celular = "3007778899"; ACOMPANA = false;');
    const t = P.ev('tarjetaAcompanar()');
    assert.match(t, /Nunca ve tu contraseña/);
    assert.match(t, /referencias/);
    assert.match(t, /dónde estás/);
    assert.match(t, /apagar cuando quieras/);
  });

  test('se puede apagar, y apagarlo BORRA lo publicado', () => {
    const P = abrirPlay();
    P.ev('REGISTRO.celular = "3007778899"; ACOMPANA = true;');
    assert.match(P.ev('tarjetaAcompanar()'), /Prefiero seguir solo/);
    const i = PLAY.indexOf('function acompanar');
    const c = PLAY.slice(i, PLAY.indexOf('\n}', i));
    assert.match(c, /else borrarAvance\(\)/,
      'apagar el acompañamiento no borra lo que ya se publicó');
  });

  test('lo que se publica es una lista BLANCA, no una negra', () => {
    /* Una lista negra hay que acordarse de ampliarla cada vez que el formulario
       gane un campo, y ese olvido es el que manda de más. */
    const i = PLAY.indexOf('var CAMPOS_QUE_SE_PUBLICAN');
    assert.ok(i > -1, 'no hay lista blanca de campos');
    const linea = PLAY.slice(i, PLAY.indexOf(';', i));
    for (const prohibido of ['referencia', 'clave', 'gps', 'lat', 'lng', 'ubicacion',
                             'contrasena', 'password', 'direccion', 'ingresos']) {
      assert.equal(linea.indexOf(prohibido) > -1, false,
        'la lista blanca deja pasar «' + prohibido + '»');
    }
    /* Y sí lleva lo que sirve para guiar por teléfono. */
    for (const bueno of ['nombres', 'apellidos', 'documento', 'celular']) {
      assert.ok(linea.indexOf(bueno) > -1, 'la lista blanca no lleva ' + bueno);
    }
  });

  test('LA SELFIE NO VIAJA, ni con el permiso puesto', () => {
    /* Es biometría —la categoría más sensible de la Ley 1581— y para guiar a
       alguien por teléfono no hace falta: lo que se atasca es el código de
       barras de la cédula, no la cara. */
    /* Esto se COMPRUEBA ejecutando, no leyendo. La primera versión buscaba la
       cadena «'selfie'» con comillas en el código; se le metió el error a
       propósito con `fotos.selfie = FOTOS.selfie` —sin comillas— y no lo vio.
       Un centinela que busca una forma de escribir aprueba cualquier otra. */
    const P = abrirPlay();
    P.ev('var _enviado = null;' +
         'fetch = function (u, cfg) {' +
         '  if (String(u).indexOf("registro_vivo_publicar") > -1) {' +
         '    _enviado = JSON.parse(cfg.body);' +
         '    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });' +
         '  }' +
         '  return Promise.reject(new Error("sin red"));' +
         '};');
    P.ev('CFG.url = "https://x.supabase.co"; CFG.anon = "llave";' +
         'ACOMPANA = true; REGISTRO.celular = "3007778899"; REGISTRO.nombres = "Luis";' +
         'FOTOS.sensibles = true;' +
         'FOTOS.cedula_reverso = "data:1"; FOTOS.cedula_frente = "data:2"; FOTOS.selfie = "data:3";' +
         'publicarAvance();');
    const fotos = JSON.parse(P.ev('JSON.stringify(Object.keys((_enviado||{}).p_fotos || {}))'));
    assert.ok(fotos.length > 0, 'no se publicó ninguna foto: la prueba no está midiendo');
    assert.equal(fotos.indexOf('selfie'), -1,
      'LA SELFIE SE ESTÁ PUBLICANDO. Es biometría: ' + JSON.stringify(fotos));
    assert.ok(fotos.indexOf('cedula_reverso') > -1,
      'no se publica la del código de barras, que es la que sirve para guiar');
  });

  test('las fotos SOLO si ya marcó la autorización de fotos', () => {
    /* Son dos permisos distintos para dos cosas distintas, y ninguno vale por
       el otro: acompañarme no es autorizar mis fotos. */
    const i = PLAY.indexOf('function publicarAvance');
    const c = PLAY.slice(i, PLAY.indexOf('\nfunction borrarAvance', i));
    assert.match(c, /if \(FOTOS\.sensibles\)/,
      'se publican las fotos sin mirar si autorizó las fotos');
  });

  test('si el acompañamiento falla, el registro SIGUE', () => {
    /* Un adorno no puede impedirle a nadie abrir su cuenta. */
    assert.match(PLAY, /try \{ publicarAvance\(\); \} catch \(e\) \{\}/,
      'publicarAvance puede tumbar el pintado del registro');
  });
});

describe('LA REJA DEL TECHO NO TIENE FECHA DE APERTURA (15-sep-2026)', () => {

  /* Lo encontró la auditoría de los ocho agentes, y era mío, de esta misma
     mañana. `garantiaSePuedeCotizar` terminaba en:

         var t = C.topeVigente(hoyISO());
         if (!t) return true;          // <- la reja se abre sola

     `topeVigente` devuelve null desde el día en que la tabla se vence —el 30 de
     septiembre— así que el 1 de octubre esa línea daba por bueno CUALQUIER
     precio. Medido sobre octubre, un millón: el crédito con garantía a tres
     meses se pasa del último techo conocido en DOCE de los treinta y un días, y
     el peor da 32,81%.

     No era una reja con un hueco: era una reja con fecha de apertura. */

  test('sin techo vigente, la calculadora NO publica un precio ilegal', () => {
    const P = abrirPlay();
    /* El 1 de octubre: la tabla ya no cubre la fecha. Se clava topeVigente en
       null —como se comportará de verdad— y se deja topeDeReferencia real. */
    P.ev('C = Object.assign({}, C); C.topeVigente = function () { return null; };');
    /* Y se le pone una tasa imposible al producto, para que la única forma de
       publicar sea que la reja esté abierta. */
    P.ev('eaDeGarantia = function () { return 0.99; };');
    P.ev('GCALC.meses = 3; GCALC.monto = GCALC_MIN; GCALC.arranque = null;');
    const h = P.ev('cifrasDeGarantia()');
    assert.equal(/En total vas a pagar/.test(h), false,
      'sin techo vigente publicó un precio del 99% efectivo anual');
    assert.match(h, /no podemos publicar un precio/i);
  });

  test('sin NINGUNA tabla de topes, tampoco se publica', () => {
    /* El caso más extremo: alguien vacía TOPES. Antes de hoy eso también
       devolvía true. */
    const P = abrirPlay();
    P.ev('C = Object.assign({}, C); C.topeDeReferencia = function () { return null; };');
    P.ev('GCALC.meses = 3; GCALC.monto = GCALC_MIN; GCALC.arranque = null;');
    assert.match(P.ev('cifrasDeGarantia()'), /no podemos publicar un precio/i,
      'sin tabla de topes se publica igual');
  });

  test('el techo de referencia es el ÚLTIMO conocido, y dice que está vencido', () => {
    const C2 = require('../app/creditos.js');
    const hoy = C2.topeDeReferencia('2026-09-15');
    const oct = C2.topeDeReferencia('2026-10-01');
    assert.equal(hoy.vigente, true);
    assert.equal(oct.vigente, false, 'octubre se reporta como vigente y no lo está');
    assert.equal(oct.tope, hoy.tope, 'el de referencia no es el último conocido');
    assert.ok(oct.vencio, 'no dice desde cuándo está vencido');
  });

  test('la letra obligatoria tampoco anuncia un producto que se pasa', () => {
    /* La otra mitad: `if (techo && ...)` no se evaluaba nunca cuando techo era
       null, así que la divulgación seguía anunciando el producto. */
    const K = require('../app/cumplimiento.js');
    const i = fs.readFileSync(path.join(__dirname, '..', 'app', 'cumplimiento.js'), 'utf8')
      .indexOf('function divulgacionRespaldado');
    assert.ok(i > -1);
    const cuerpo = fs.readFileSync(path.join(__dirname, '..', 'app', 'cumplimiento.js'), 'utf8')
      .slice(i, i + 3000);
    assert.equal(/if \(techo &&/.test(cuerpo), false,
      'la divulgación vuelve a depender de que el techo esté vigente');
    assert.match(cuerpo, /topeDeReferencia/,
      'la divulgación no usa el techo de referencia');
  });

  test('y el mes ENTERO despues del ultimo techo, no solo el dia 1', () => {
    /* Lo encontró la auditoría, y era un agujero con la forma exacta del riesgo.
       La prueba de arriba mide UN día —el primero del mes siguiente— y el día 1
       es estructuralmente el más barato: ese día la tasa da 27,08%, por debajo
       del último techo. O sea que comprobaba que la tarjeta sobrevive, y nunca
       que el precio que sobrevive siga siendo legal.

       Las 1.716 pruebas habrían seguido en verde el día que la app publicara
       32,81%. Se barre el mes entero. */
    const C2 = require('../app/creditos.js');
    const hasta = C2.ultimoTopeCertificado();
    const ultimo = C2.topeDeReferencia(hasta).tope;
    const d0 = new Date(hasta + 'T12:00:00');
    const malos = [];

    for (let i = 1; i <= 31; i++) {
      const d = new Date(d0.getTime() + i * 86400000);
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                  '-' + String(d.getDate()).padStart(2, '0');
      const P = abrirPlay();
      /* El día se mueve con hoyISO, que es de donde sale la fecha de desembolso
         Y la que decide si hay techo vigente. Así el banco vive ese día entero. */
      P.ev('hoyISO = function () { return "' + iso + '"; };');
      for (const meses of [3, 4, 5, 6]) {
        P.ev('GCALC.meses = ' + meses + '; GCALC.monto = GCALC_MIN; GCALC.arranque = null;');
        const h = P.ev('cifrasDeGarantia()');
        const m = h.match(/Tasa efectiva anual<\/span><span class="v">([^<]*)</);
        if (!m) continue;                       // no publicó precio: correcto
        const ea = Number(m[1].replace('%', '').replace(',', '.')) / 100;
        if (ea > ultimo + 1e-9) {
          malos.push(iso + ' a ' + meses + 'm: publica ' + (ea * 100).toFixed(2) + '%');
        }
      }
    }
    assert.deepEqual(malos.slice(0, 6), [],
      'después de que se venza la tabla, la página publica tasas por encima del ' +
      'último techo certificado (' + (ultimo * 100).toFixed(2) + '%)');
  });

  test('NADIE vuelve a escribir «sin techo, adelante»', () => {
    /* El patrón exacto que abrió la reja. Si reaparece en cualquier archivo que
       decida si se publica un precio, esta prueba lo dice. */
    for (const f of ['play/index.html', 'app/cumplimiento.js', 'app/creditos.js']) {
      const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');   // sin comentarios: ahí sí se puede nombrar
      assert.equal(/if \(!\s*t\s*\)\s*return true/.test(t), false,
        f + ' volvió a abrir la reja cuando no hay techo');
    }
  });
});

/* ==========================================================================
 * LA GENTE DIBUJADA Y LA PLATA QUE CAE — 16 de septiembre de 2026
 *
 * Joan pidió dos cosas para vender: «imágenes de gente feliz y textos cortos»
 * y una animación del celular con la plata que llega. No hay herramienta de
 * imagen en la sesión, así que se dibujó en SVG y CSS.
 *
 * LO QUE VIGILA ESTE BLOQUE NO ES QUE SE VEA BONITO: es que una pieza hecha
 * PARA VENDER no pueda volverse una promesa. Las tres frases que Joan dictó
 * —«te desvara súper rápido y cuando quieras», «lo más flexible en créditos»,
 * «una gran ayuda financiera»— contenían, entre las tres, un compromiso de
 * tiempo que el negocio no tiene, una oferta de crédito a demanda que la misma
 * pantalla desmiente, y un superlativo comparativo que habría que sustentar.
 * Se reescribieron con el porqué anotado en TEXTOS. Esto impide que vuelvan.
 *
 * Y la animación: lo más fácil del mundo es que alguien le agregue un ✓ verde
 * o la palabra «aprobado» para que «venda más». Sería una promesa de
 * aprobación en una pantalla donde la aprobación la da una persona por
 * WhatsApp, tres centímetros debajo de la frase que dice «esto es un cálculo,
 * no una aprobación».
 * ======================================================================== */
describe('lo que se dibujó para vender no puede prometer (16-sep-2026)', () => {

  test('las tres razones se pintan, con su dibujo y su descargo', () => {
    const P = abrirPlay();
    const h = P.ev('tarjetaGente()');
    const razones = P.ev('TEXTOS.gente');
    assert.equal(razones.length, 3, 'ya no son tres razones');
    razones.forEach(r => {
      assert.ok(h.indexOf(r.dice) >= 0, 'falta la razón «' + r.dice + '»');
      assert.ok(h.indexOf(r.porque) >= 0, 'la razón «' + r.dice + '» se quedó sin su apoyo');
    });
    /* Tres dibujos, uno por razón. Si alguien renombra una escena en TEXTOS y
       no la agrega al registro, la fila sale sin dibujo y nadie se entera. */
    assert.equal((h.match(/class="gente-esc"/g) || []).length, 3,
      'una de las tres razones se quedó sin su dibujo');
    assert.ok(h.indexOf(P.ev('TEXTOS.gente_pie')) >= 0,
      'se fue el descargo de que no se promete una hora');
    assert.ok(h.indexOf(P.ev('TEXTOS.gente_nota')) >= 0,
      'se fue la nota de que las personas son ilustraciones y no clientes');
  });

  test('NINGUNA de las razones promete un plazo de respuesta', () => {
    /* No hay un solo compromiso de tiempo escrito en el código: la solicitud
       cae en la bandeja y la contesta una persona. Bajo el artículo 29 de la
       Ley 1480 lo anunciado obliga, y probarlo le toca al que lo anuncia.
       El día que Joan se comprometa a un plazo Y lo cumpla, esta prueba se
       cambia a propósito — antes no. */
    const P = abrirPlay();
    const dicho = P.ev('TEXTOS.gente').map(r => r.dice + ' ' + r.porque).join(' ') +
      ' ' + P.ev('TEXTOS.gente_titulo');
    [/s[uú]per r[aá]pido/i, /al instante/i, /inmediat/i, /en (unos )?minutos/i,
     /mismo d[ií]a/i, /24 horas/i, /en el acto/i, /ya mismo/i]
      .forEach(p => assert.equal(p.test(dicho), false,
        'una de las razones promete un plazo de respuesta que no existe: ' +
        (dicho.match(p) || [])[0]));
    /* Y el descargo que sostiene el «rápido» del título tiene que seguir ahí. */
    assert.match(P.ev('TEXTOS.gente_pie'), /no te prometemos una hora/i,
      'se fue la frase que explica por qué no hay un plazo prometido');
  });

  test('NINGÚN superlativo comparativo en las razones', () => {
    /* «Lo más flexible» es una afirmación objetiva que hay que sustentar en el
       momento de publicarla, y no hay estudio de mercado que la sustente. Esta
       página YA pagó este error: la tarjeta de la garantía decía «más barato» y
       «más grande» y las dos eran falsas contra el producto de su misma
       pantalla. */
    const P = abrirPlay();
    const dicho = P.ev('TEXTOS.gente').map(r => r.dice + ' ' + r.porque).join(' ') +
      ' ' + P.ev('TEXTOS.gente_titulo');
    [/lo m[aá]s\b/i, /el m[aá]s\b/i, /la m[aá]s\b/i, /el mejor/i, /la mejor/i,
     /m[aá]s barat/i, /el [uú]nico/i, /garantizad/i]
      .forEach(p => assert.equal(p.test(dicho), false,
        'una de las razones usa un superlativo que habría que probar: ' +
        (dicho.match(p) || [])[0]));
  });

  test('ni la gente ni la plata dicen que el crédito está aprobado', () => {
    /* Lo más fácil del mundo es agregarle un ✓ o la palabra «aprobado» para que
       «venda más». Sería una promesa de aprobación en la puerta de un negocio
       donde aprueba una persona por WhatsApp. */
    const P = abrirPlay();
    const pintado = P.ev('tarjetaGente()') + P.ev('lluviaDeCalc()');
    [/aprobad/i, /desembolsad/i, /ya es tuyo/i, /te lo damos/i]
      .forEach(p => assert.equal(p.test(pintado), false,
        'la pieza de venta afirma una aprobación: ' + (pintado.match(p) || [])[0]));
  });

  test('ninguna marca ajena, ni escrita ni vestida', () => {
    /* Joan dijo «Nequi» describiendo la idea, no pidiendo el logo. Desembolsar
       por Nequi es cierto y se puede nombrar en una frase; lo que no se puede
       es que la escena se vista de una billetera reconocible, porque eso le
       dice al cliente —sin decirlo— que detrás de este crédito hay una entidad
       vigilada por la Superfinanciera. No la hay. */
    const P = abrirPlay();
    const pintado = P.ev('tarjetaGente()') + P.ev('lluviaDeCalc()') +
      P.ev('tarjetaCalculadora()');
    [/nequi/i, /daviplata/i, /bancolombia/i, /davivienda/i, /movii/i]
      .forEach(p => assert.equal(p.test(pintado), false,
        'la vitrina se viste de una marca ajena: ' + (pintado.match(p) || [])[0]));
  });

  test('ninguna cifra dentro de las piezas nuevas', () => {
    /* La única cifra de la portada es la de la calculadora, que sigue al
       deslizador. Un segundo número del mismo producto en la misma pantalla es
       exactamente el defecto que Joan encontró el 15-sep. */
    const P = abrirPlay();
    const pintado = P.ev('tarjetaGente()') + P.ev('lluviaDeCalc()');
    const plata = pintado.replace(/<svg[\s\S]*?<\/svg>/g, ' ').match(/\$[\d.]+/g) || [];
    assert.deepEqual(plata, [],
      'una de las piezas de venta escribió una cifra de plata: ' + plata.join(', '));
  });

  test('los SVG de play/ van SIN xmlns, o la suite se cae por otro lado', () => {
    /* No es una manía de estilo. pruebas/cumplimiento.test.js barre TODO
       http(s):// de play/index.html y solo tolera wa.me y el proyecto de
       Supabase, así que un xmlns="http://www.w3.org/2000/svg" pegado por
       costumbre hace fallar «la app no llama a ningún servidor que no sea el
       suyo» — y el mensaje de error habla de un servidor, no de un dibujo, así
       que nadie entiende por qué. Dentro de HTML el xmlns no hace falta.
       Esta prueba existe para que el error llegue con su nombre propio. */
    const svgs = VIVO.match(/<svg[^>]*>/g) || [];
    assert.ok(svgs.length > 0, 'se fueron todos los dibujos de la puerta pública');
    svgs.forEach(s => assert.equal(/xmlns/.test(s), false,
      'un <svg> de play/ lleva xmlns y eso mete una URL externa en el archivo: ' + s));
  });

  test('la plata que cae respeta a quien pidió menos movimiento', () => {
    /* Hay gente a la que una animación así le produce mareo o le dispara una
       migraña, y el sistema operativo ya trae la respuesta puesta. Y apagarla
       no puede significar enseñar menos: las piezas están DIBUJADAS en su sitio
       de reposo, así que el fotograma quieto es la escena completa. */
    assert.match(CSS, /\.vj-cae\{animation:none\}/,
      'la plata sigue cayendo aunque el sistema pida quietud');
    assert.match(CSS, /\.gente-esc \.g-vive[\s\S]{0,200}?animation:none/,
      'la gente sigue moviéndose aunque el sistema pida quietud');
  });

  test('el sello de EJEMPLO llegó a la tarjeta de la cifra grande', () => {
    /* La calculadora es la tarjeta MÁS recortable de la página: es la que tiene
       el número grande. Su descargo («esto es un cálculo, no una aprobación»)
       vive en la tarjeta de al lado, así que un recorte de WhatsApp viajaba
       desnudo. El sello va antes de la primera cifra, como en los escalones. */
    const P = abrirPlay();
    const h = P.ev('tarjetaCalculadora()');
    assert.ok(h.indexOf('ej-sello') >= 0, 'la calculadora perdió su sello de ejemplo');
    assert.ok(h.indexOf('ej-sello') < h.indexOf('calc-cifra'),
      'el sello quedó después de la cifra: se lee el número antes que el descargo');
  });
});

/* ==========================================================================
 * LOS AGUJEROS QUE ENCONTRÓ LA REVISIÓN — 17 de septiembre de 2026
 *
 * Seis lentes sobre el cambio del 16, y cada hallazgo pasado por tres
 * escépticos que intentaban refutarlo. Lo que sobrevivió y se arregló está
 * vigilado acá, porque un arreglo sin centinela vuelve.
 * ======================================================================== */
describe('lo que la revisión del 17-sep encontró y no puede volver', () => {

  /* El peor de todos, y reproducido: la página contradiciéndose sola. */
  test('sin precio que publicar, la tarjeta de venta NO afirma que hay precio', () => {
    /* tarjetaCalculadora() tiene un camino honesto de degradación: si no hay
       certificación con la que cotizar, dice «no publicamos un precio» y no
       pinta ni una cifra ni un deslizador. tarjetaGente() se pintaba igual, dos
       centímetros más abajo, diciendo «con el precio a la vista», «lo que
       cuesta está aquí arriba» y describiendo unos deslizadores que en esa
       pantalla no existían.

       No es hipotético: pasa cuando la Superfinanciera certifica un techo por
       debajo del 24% fijo de este producto —en enero de 2026 estuvo a 0,36
       puntos— y también cuando app/cumplimiento.js no llega, que es el
       incidente del service worker v19 del 28-ago. */
    const P = abrirPlay();
    P.ev('hayQueCotizar = function () { return false; };');
    assert.equal(P.ev('tarjetaGente()'), '',
      'la tarjeta de venta se pinta aunque la página se haya negado a publicar un precio');
    /* Y la portada entera, en ese estado, no puede afirmar un precio. */
    P.ev('DIVULGACION = null; hayQueCotizar = function () { return false; };');
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /no publicamos un precio/i, 'el caso de prueba no llegó al estado degradado');
    [/precio a la vista/i, /está aquí arriba/i, /las cifras cambian contigo/i]
      .forEach(p => assert.equal(p.test(h), false,
        'la portada sin precio sigue diciendo: ' + (h.match(p) || [])[0]));
  });

  test('toda clase pensada para la laca tiene su pareja en papel', () => {
    /* Dos veces en dos días: `.escalon` y `.etq-cifra`. Una clase nacida para
       una tarjeta oscura, reutilizada en una de papel, pinta texto blanco sobre
       blanco — y ninguna prueba lo ve, porque el banco no tiene motor de CSS.
       Lo que sí se puede comprobar es que exista la regla de repuesto. */
    ['.etq-cifra', '.pie-cuota', '.granTotal'].forEach(clase => {
      const usa = new RegExp('\\' + clase + '\\{[^}]*(blanco-laca|--amarillo\\))');
      if (!usa.test(CSS)) return;   // no está vestida de laca: no hace falta pareja
      const pareja = new RegExp('\\.card:not\\(\\.laca\\)[^{]*\\' + clase);
      assert.ok(pareja.test(CSS),
        clase + ' se pinta con colores de laca y no tiene regla para las tarjetas ' +
        'de papel: fuera de la laca queda invisible, como pasó con «Pagarías cada mes»');
    });
  });

  test('la letra obligatoria NUNCA queda dentro de lo plegado', () => {
    /* Plegar el plan de pago está bien. Plegar el costo o la tasa sería
       esconder la divulgación detrás de un clic, que es justo lo que se le dijo
       a Joan que no se podía hacer. Hoy no pasa; esto impide que pase. */
    const P = abrirPlay();
    for (const pinta of ['cifrasDeCalc()', 'cifrasDeGarantia()']) {
      const h = P.ev(pinta);
      const dentro = (h.match(/<details[\s\S]*?<\/details>/g) || []).join(' ');
      [/Lo que cuesta/, /Tasa efectiva anual/, /En total vas a pagar/, /granTotal/]
        .forEach(p => assert.equal(p.test(dentro), false,
          pinta + ': la divulgación obligatoria quedó dentro del plegado (' +
          (dentro.match(p) || [])[0] + ')'));
    }
  });

  test('ni un visto bueno ni una cifra DENTRO de los dibujos', () => {
    /* La prueba de ayer miraba el texto de la tarjeta y limpiaba los <svg>
       antes de buscar cifras, así que un ✓ o un «te consignamos $2.000.000»
       metido dentro del dibujo pasaba las tres pruebas que decían vigilarlo. */
    const P = abrirPlay();
    const svgs = (P.ev('tarjetaGente()') + P.ev('lluviaDeCalc()'))
      .match(/<svg[\s\S]*?<\/svg>/g) || [];
    assert.ok(svgs.length === 4, 'cambió el número de dibujos: revisa esta prueba');
    svgs.forEach(s => {
      assert.equal(/[✓✔√]/.test(s), false, 'un dibujo lleva un visto bueno: eso es un «aprobado»');
      assert.equal(/\$[\d.]/.test(s), false, 'un dibujo lleva una cifra de plata escrita adentro');
      assert.equal(/<text|<foreignObject/i.test(s), false,
        'un dibujo lleva texto adentro: ahí se puede escribir cualquier promesa sin que nadie la lea');
    });
  });

  test('el título de la puerta y su contrapeso viajan juntos', () => {
    /* «Rápido» está en el <h1> porque Joan lo pidió, y no hay ningún plazo de
       respuesta escrito en el código. Lo que lo sostiene es la línea que dice
       que quien contesta es una persona y que por eso no se promete una hora.
       Si esa línea se cae, el título se queda siendo una promesa sin respaldo. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const titulo = P.elems.titulo.textContent + ' ' + PLAY.slice(0, 4000);
    if (!/r[aá]pid/i.test(titulo)) return;   // si algún día se quita, no hay nada que sostener
    assert.match(P.ev('TEXTOS.gente_pie'), /no te prometemos una hora/i,
      'la puerta dice «rápido» y se quedó sin la línea que explica que no hay hora prometida');
    assert.ok(P.elems.cuerpo.innerHTML.indexOf(P.ev('TEXTOS.gente_pie')) >= 0,
      'la línea existe pero no se pinta en la portada');
  });

  test('el anillo de foco del plegable se dibuja hacia adentro', () => {
    /* .plegable lleva overflow:hidden para redondear sus esquinas, y eso recorta
       el anillo de foco, que la hoja dibuja 2 px por fuera. Con el plan de pago
       plegado ese <summary> es el primer control al que llega el tabulador en la
       puerta pública: quien navega con teclado no veía dónde estaba parado. */
    assert.match(CSS, /\.plegable\s*>\s*summary:focus-visible\{[^}]*outline-offset:-/,
      'el anillo de foco del plegable vuelve a dibujarse por fuera, donde lo recorta el overflow');
  });

  test('el nombre de la app instalada dice lo mismo que la página', () => {
    /* El manifiesto es el nombre que queda debajo del icono en el teléfono: es
       donde un nombre viejo dura más y se ve más. */
    const man = JSON.parse(leer('play/app.webmanifest'));
    assert.equal(/6 meses/.test(man.name), false,
      'el manifiesto sigue llamando a la app «' + man.name + '»');
    assert.match(man.name, /Tu Garantía/, 'el manifiesto perdió la marca');
  });

  test('la plata cae UNA vez y se queda: nada de franjas vacías', () => {
    /* Era un ciclo infinito de seis segundos con las piezas desvaneciéndose al
       final de cada vuelta: más de la mitad del tiempo la tarjeta tenía una
       franja vacía de 88 px entre el gancho y la cifra. Eso no se lee como un
       adorno que descansa, se lee como una imagen que no cargó. */
    const regla = (CSS.match(/\.vj-cae\{[^}]*\}/) || [''])[0];
    assert.ok(regla, 'se fue la regla de la plata que cae');
    assert.equal(/infinite/.test(regla), false,
      'la plata volvió a caer en bucle: deja la tarjeta vacía media vida');
    assert.match(regla, /backwards|both/,
      'sin fill backwards las piezas se pintan en su sitio y después saltan arriba para caer');
    /* Y el último fotograma es la escena completa, que es lo mismo que ve quien
       pidió menos movimiento. */
    const marco = (CSS.match(/@keyframes tgcae\{[\s\S]*?\n\}/) || [''])[0];
    assert.match(marco, /100%\{opacity:1/,
      'la animación termina en opacidad cero: la plata desaparece al final');
  });
});
