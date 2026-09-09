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
const fs = require('node:fs');
const path = require('node:path');
const C = require('../app/creditos.js');
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

  test('la palabra «garantía» NO se usa como mecánica del producto', () => {
    /* La garantía y los niveles son del crédito QUINCENAL (app/motor.js), que
       no es lo que esta app vende y que no puede ir a Google Play. Acá
       «Tu Garantía» es el nombre del negocio. Si un texto dice que la garantía
       se acumula, crece o da cupo, está describiendo otro producto. */
    const mecanica = /garant[íi]a[^.]{0,80}(acumul|crece|sube|gana|puntos|nivel|respald)/i;
    assert.ok(!mecanica.test(VIVO),
      'play/ describe la garantía como mecánica: eso es el quincenal, no este producto');
    assert.ok(!/\bniveles?\b/i.test(VIVO.replace(/Tu Garantía/g, '')),
      'aparecieron «niveles», que son del quincenal');
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
describe('play/ pintando de verdad (9-sep-2026)', () => {

  const vm = require('node:vm');

  function abrirPlay(opciones) {
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
         se cae y hace bien. */
      fetch: () => Promise.reject(new Error('sin red en el banco de pruebas')),
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
    /* Los tres <script src> que play/ carga, con el nombre global con el que los
       toma la página. */
    ctx.CreditosPublicables = require(path.join(RAIZ, 'app', 'creditos.js'));
    ctx.CuentaSocio = require(path.join(RAIZ, 'app', 'cuenta.js'));
    ctx.Cumplimiento = require(path.join(RAIZ, 'app', 'cumplimiento.js'));
    vm.createContext(ctx);
    [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'play#' + i }));
    return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems, almacen };
  }

  test('LA PORTADA PINTA: si algo revienta, la página queda en blanco', () => {
    /* El centinela que faltaba. `pintarEntrar()` es lo primero que ve todo el
       que llega, y si lanza, el visitante no ve un error: ve blanco y se va. */
    const P = abrirPlay();
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.ok(h.length > 800, 'la portada salió casi vacía (' + h.length + ' letras)');
    assert.match(h, /calcMonto/, 'no pintó la calculadora');
    assert.match(h, /escalon/, 'no pintó la escalera');
    assert.match(h, /plegable/, 'no pintó la historia ni la explicación');
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
