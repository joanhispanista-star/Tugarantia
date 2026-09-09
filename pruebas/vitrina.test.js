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
  });

  test('la calculadora no ofrece nada que el servidor vaya a rechazar', () => {
    /* play_solicitar (base/20260828_correo_interno.sql) bota capital < 100.000,
       capital > 2.000.000 y meses fuera de 1..6, y la app traduce ese rechazo a
       «espera unos minutos» — un error falso que le echa la culpa a la
       conexión. Los topes de la pantalla tienen que caber dentro de los del
       servidor, no al revés. */
    const num = n => Number((VIVO.match(new RegExp('var ' + n + ' = (\\d+)')) || [])[1]);
    const min = num('CALC_MIN'), max = num('CALC_MAX');
    const mMin = num('CALC_MESES_MIN'), mMax = num('CALC_MESES_MAX');
    assert.ok(min >= 100000, 'el mínimo de la calculadora cae por debajo del que acepta el servidor');
    assert.equal(max, C.PERFILES.preferente.cupo_maximo,
      'el máximo de la calculadora se separó del cupo del perfil más alto');
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
