/* ===========================================================================
 * LA FOTO DE LA CÉDULA NO PUEDE TUMBAR LA PÁGINA
 *
 * Joan, 16-sep-2026: «cuando intenté entrar como cliente en la parte de tomar
 * la foto de la cédula la página se cerró».
 *
 * LO QUE PASABA, en orden, al tomar el REVERSO:
 *   1. se descargaba la librería del código de barras (ZXing)
 *   2. se decodificaba la foto entera a 1600 px
 *   3. el lector la volvía a decodificar desde el data URL
 *   4. y SOLO ENTONCES se decodificaba una TERCERA vez a 900 px, para guardar
 *
 * Tres decodificaciones completas de una foto de celular —doce millones de
 * píxeles son unos cuarenta megas de mapa de bits cada una— justo cuando el
 * navegador acaba de volver de la cámara y está en su peor momento de memoria.
 * En un teléfono barato el sistema descarta la pestaña. Y como lo último que se
 * hacía era guardar, al volver NO HABÍA FOTO: la persona empezaba de cero.
 *
 * LAS DOS CURAS, y la segunda importa más que la primera:
 *   · una sola decodificación, de la que salen los dos tamaños;
 *   · y se GUARDA PRIMERO. Leer el código de barras ahorra teclear; perder la
 *     foto no se ahorra con nada.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');

/* Un archivo de mentira que cuenta cuántas veces lo decodifican. Es la medida
   que importa: cada decodificación es el pico de memoria que tumba la pestaña. */
function prepararCamara(P, opciones) {
  const o = opciones || {};
  P.ev('window.__decodificaciones = 0;');
  P.ev(`
    window.URL = window.URL || {};
    URL.createObjectURL = function () { return 'blob:falso'; };
    URL.revokeObjectURL = function () {};
    window.Image = function () {
      var self = this;
      this.width = 4000; this.height = 3000;
      Object.defineProperty(this, 'src', {
        set: function (v) {
          if (!v) return;
          window.__decodificaciones++;
          /* El banco tiene un setTimeout que no hace nada, asi que la camara de
             mentira dispara de una. Lo que se mide es el ORDEN y el NUMERO de
             decodificaciones, no el reloj. */
          if (self.onload) self.onload();
        },
        get: function () { return 'blob:falso'; }
      });
    };
  `);
  /* El lienzo devuelve una cadena reconocible y del tamaño que se le pida. */
  P.ev(`
    document.createElement = (function (o) {
      return function (t) {
        if (t === 'canvas') {
          return { width: 0, height: 0,
                   getContext: function () { return { drawImage: function () {} }; },
                   toDataURL: function () { return 'data:image/jpeg;base64,FOTO-' + this.width; } };
        }
        return o.call(document, t);
      };
    })(document.createElement);
  `);
  /* ZXing: por defecto revienta, que es el caso que importa. */
  P.ev(`
    window.cargarScript = function () {
      return ${o.zxingCae ? 'Promise.reject(new Error("sin red"))' : 'Promise.resolve()'};
    };
  `);
}

const disparar = (P, key) =>
  P.ev(`tomarFoto({ target: { files: [{ name: 'x.jpg', size: 4000000 }] } }, '${key}')`);

const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

describe('la foto de la cédula (16-sep-2026)', () => {

  test('el REVERSO se decodifica UNA vez, no tres', () => {
    /* El número es la memoria. Tres decodificaciones de una foto de celular son
       unos ciento veinte megas de picos, y por ahí se va la pestaña.
       MUTANTE QUE CAZA: volver a llamar a comprimirImagen por separado para cada
       tamaño, que es el código que estuvo vivo hasta hoy. */
    const P = abrirPlay();
    prepararCamara(P);
    disparar(P, 'cedula_reverso');
    return esperar().then(() => {
      assert.equal(P.ev('window.__decodificaciones'), 1,
        'la foto se decodificó ' + P.ev('window.__decodificaciones') + ' veces: cada una es ' +
        'un pico de memoria, y son los que cierran la página en un teléfono barato');
    });
  });

  test('y el FRENTE también, que no necesita código de barras', () => {
    const P = abrirPlay();
    prepararCamara(P);
    disparar(P, 'cedula_frente');
    return esperar().then(() => {
      assert.equal(P.ev('window.__decodificaciones'), 1);
    });
  });

  test('LA FOTO SE GUARDA ANTES de intentar leer el código', () => {
    /* Es la cura que de verdad importa. Si la pestaña se muere leyendo el
       código, la foto ya tiene que estar guardada.
       MUTANTE QUE CAZA: devolver el orden anterior (código primero). */
    const P = abrirPlay();
    prepararCamara(P, { zxingCae: true });   // el lector revienta, como sin señal
    disparar(P, 'cedula_reverso');
    return esperar().then(() => {
      assert.ok(String(P.ev('FOTOS.cedula_reverso || ""')).indexOf('FOTO-900') > -1,
        'el lector del código falló y la foto NO quedó guardada: la persona ' +
        'tiene que volver a tomarla');
    });
  });

  test('la foto que se guarda es la CHICA, no la de 1600', () => {
    /* La de 1600 existe solo para que el lector vea el código. Guardar esa sería
       cuadruplicar lo que pesa cada cédula en el teléfono y en la nube. */
    const P = abrirPlay();
    prepararCamara(P);
    disparar(P, 'cedula_reverso');
    return esperar().then(() => {
      assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,FOTO-900',
        'se guardó la versión grande, que pesa cuatro veces más y no hace falta');
    });
  });

  test('si la foto no se puede abrir, se dice y no se rompe nada', () => {
    const P = abrirPlay();
    prepararCamara(P);
    P.ev('window.Image = function () { var s = this; Object.defineProperty(this, "src", ' +
         '{ set: function (v) { if (v && s.onerror) s.onerror(); } }); };');
    disparar(P, 'cedula_frente');
    return esperar().then(() => {
      assert.ok(!P.ev('FOTOS.cedula_frente'), 'se guardó algo de una foto que no se pudo abrir');
    });
  });

  test('una sola forma de comprimir en todo el archivo', () => {
    /* Tener dos es como se llegó a decodificar la misma foto tres veces. */
    const fs = require('node:fs'), path = require('node:path');
    const t = fs.readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8');
    assert.match(t, /function comprimirImagen[\s\S]{0,400}?return comprimirVarias/,
      'comprimirImagen volvió a tener su propia decodificación en vez de reenviar');
  });
});

/* ===========================================================================
 * LA VUELTA DE LA CÁMARA — 17 de septiembre de 2026
 *
 * Joan: «el cliente toma la foto de la cédula y la página lo devuelve y
 * nuevamente tiene que ingresar la contraseña».
 *
 * NO ERA LA FOTO: ERA DÓNDE CAE LA PERSONA AL VOLVER. La cámara del sistema
 * hace que un teléfono barato descarte la pestaña y recargue la página. El
 * 9-sep se guardó el paso en sessionStorage justo para eso, pero el arranque
 * solo lo leía si la dirección terminaba en #registro — y `pintarRegistro`
 * nunca ponía esa dirección. Quien abría tugarantia.net/play/ y tocaba «Abrir
 * mi cuenta» se quedaba sin ella, así que al volver de la cámara aparecía en la
 * portada, delante de la caja que pide celular y contraseña. Ocho días.
 *
 * Y había un segundo agujero del mismo tamaño: la sesión no se guardaba en
 * ninguna parte, así que el socio que YA había entrado también volvía al login
 * con solo recargar.
 *
 * POR QUÉ NINGUNA PRUEBA LO VIO: no se podía escribir. Cada banco nacía con los
 * almacenes vacíos, así que no había forma de decir «abre, avanza, y ahora
 * recarga». Ahora abrirPlay acepta los dos almacenes y una recarga es abrirlo
 * otra vez con los mismos objetos.
 * ========================================================================= */
describe('la vuelta de la cámara no puede devolver a nadie al login', () => {

  /* Deja la página a mitad del registro, como quien acaba de poner su celular y
     su contraseña y va a tomar la foto de la cédula. */
  function aMitadDelRegistro(hash) {
    const P = abrirPlay({ hash: hash || '' });
    if (!hash) P.ev('pintarRegistro(0)');
    P.ev("REGISTRO.celular='3001112233';" +
         "$('rTel').value='3001112233';" +
         "$('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x';");
    P.ev('siguientePaso()');
    return P;
  }
  /* Y esto es la recarga: el mismo teléfono, los mismos almacenes, la página
     cargada de nuevo desde cero. */
  function recargar(P) {
    return abrirPlay({ almacen: P.almacen, sesion: P.sesion, hash: P.hash() });
  }
  const paso = P => {
    const m = /Paso (\d+) de/.exec(P.elems.cuerpo.innerHTML);
    return m ? Number(m[1]) : null;
  };

  test('EL CASO DE JOAN: sin #registro en la dirección, la cámara lo devolvía al login', () => {
    const P = aMitadDelRegistro('');
    assert.equal(paso(P), 2, 'el caso de prueba no llegó al paso de la cédula');
    const Q = recargar(P);
    assert.equal(Q.ev('VISTA'), 'registro',
      'al volver de la cámara la página lo sacó del registro: eso es el defecto que reportó Joan');
    assert.equal(paso(Q), 2, 'volvió al registro pero no al paso donde iba');
    assert.equal(/Ya abriste tu cuenta/.test(Q.elems.cuerpo.innerHTML), false,
      'le está pidiendo otra vez el celular y la contraseña');
  });

  test('por el enlace que Joan reparte (#registro) también vuelve donde iba', () => {
    const P = aMitadDelRegistro('#registro');
    const Q = recargar(P);
    assert.equal(paso(Q), 2, 'el camino del enlace dejó de restaurar el paso');
  });

  test('el registro tiene su propia dirección, o la recarga no sabe dónde estaba', () => {
    /* Es la pieza que faltaba: guardar el paso no sirve de nada si la página no
       deja marcado que la persona está en el formulario. */
    const P = abrirPlay({ hash: '' });
    P.ev('pintarRegistro(0)');
    assert.equal(P.hash(), '#registro',
      'pintarRegistro no marca la dirección: una recarga volvería a la portada');
    P.ev('pintarEntrar()');
    assert.equal(P.hash(), '',
      'volver a la portada dejó puesta la dirección del registro');
  });

  test('quien ya entró sigue adentro después de recargar', () => {
    /* La sesión no se guardaba en NINGUNA parte: cualquier recarga la cerraba.
       En un escritorio es una molestia; en el celular de un cliente es el mismo
       defecto de la cámara por la otra puerta. */
    const P = abrirPlay({ hash: '' });
    P.ev("pintarCuenta({ access_token:'tok-de-prueba', user:{ id:'u1' } })");
    assert.equal(P.ev('VISTA'), 'cuenta', 'el caso de prueba no llegó a la cuenta');
    const Q = recargar(P);
    assert.equal(Q.ev('VISTA'), 'cuenta',
      'recargar cerró la sesión y lo mandó a teclear la contraseña otra vez');
    assert.equal(Q.ev('SESION && SESION.access_token'), 'tok-de-prueba',
      'la sesión se restauró vacía');
  });

  test('la sesión se guarda en sessionStorage y NUNCA en localStorage', () => {
    /* La diferencia es de seguridad, no de gusto: sessionStorage muere con la
       pestaña. En localStorage sería una cuenta abierta para siempre en un
       teléfono que se presta, se pierde o se vende, y esta app es de plata. */
    const P = abrirPlay({ hash: '' });
    P.ev("pintarCuenta({ access_token:'tok-de-prueba', user:{ id:'u1' } })");
    assert.deepEqual(Object.keys(P.almacen).filter(k => /sesion|token/i.test(k)), [],
      'la sesión acabó en localStorage: sobrevive a cerrar el navegador');
    assert.ok(Object.keys(P.sesion).some(k => /sesion/i.test(k)),
      'la sesión no se guardó en ninguna parte: una recarga la cierra');
    assert.equal(/access_token/.test(JSON.stringify(P.almacen)), false,
      'hay un token en localStorage');
  });

  test('salir de la cuenta borra la sesión guardada, o volvería sola', () => {
    const P = abrirPlay({ hash: '' });
    P.ev("pintarCuenta({ access_token:'tok-de-prueba', user:{ id:'u1' } })");
    P.ev('salirDeCuenta()');
    const Q = recargar(P);
    assert.notEqual(Q.ev('VISTA'), 'cuenta',
      'salió de la cuenta y una recarga lo metió de vuelta adentro');
  });

  test('quien volvió a la portada a propósito NO cae en el registro al recargar', () => {
    /* El otro lado del mismo interruptor: si el paso se quedara pegado, alguien
       que se arrepintió se encontraría dentro del formulario sin pedirlo. */
    const P = aMitadDelRegistro('');
    P.ev('pintarRegistro(0)');
    P.ev('pintarEntrar()');
    const Q = recargar(P);
    assert.equal(Q.ev('VISTA'), 'entrar',
      'volver a la portada no soltó el registro: la recarga lo metió de vuelta');
  });

  test('el aviso de la interrupción sale SOLO cuando hubo interrupción', () => {
    const P = aMitadDelRegistro('');
    const Q = recargar(P);
    assert.match(Q.elems.errReg.innerHTML, /La página se volvió a abrir/,
      'no le explica por qué volvió a aparecer la página');
    /* Y quien llega limpio por el enlace no tiene ningún susto que explicarle. */
    const R = abrirPlay({ hash: '#registro' });
    assert.equal(/La página se volvió a abrir/.test(R.elems.cuerpo.innerHTML), false,
      'le avisa de una interrupción que no ocurrió');
  });

  test('el aviso NO inventa la causa de la recarga', () => {
    /* Decía «tu teléfono cerró la página mientras usabas la cámara», y la
       página no sabe eso: la recarga puede ser el botón de recargar, quedarse
       sin memoria en cualquier otro paso, o el navegador reabriendo la pestaña.
       Afirmar una causa que no se conoce es la misma falta que promete de más,
       por el otro lado. */
    const P = aMitadDelRegistro('');
    const Q = recargar(P);
    assert.equal(/usabas la cámara/.test(Q.elems.errReg.innerHTML), false,
      'la página vuelve a afirmar una causa que no conoce');
  });

  test('en un teléfono prestado se puede soltar el registro de otro', () => {
    /* El precio de guardarlo todo para que nadie pierda media hora de trabajo
       es que el siguiente que use el teléfono se encuentra el registro del
       anterior, con su nombre, su cédula y sus fotos. Tiene que poder soltarlo,
       y hasta hoy no había forma: el borrador solo se borraba al crear la
       cuenta. */
    const P = aMitadDelRegistro('');
    const Q = recargar(P);
    assert.match(Q.elems.errReg.innerHTML, /empezarDeNuevo\(\)/,
      'no hay forma de soltar el registro de otra persona');
    Q.ev('empezarDeNuevo()');
    /* Se cuenta desde DENTRO de la página y se compara un número: los objetos
       del banco vienen de otro realm y `deepEqual` de assert/strict compara
       también el prototipo, así que un [] de allá no es igual a un [] de acá. */
    assert.equal(Q.ev('Object.keys(REGISTRO).length'), 0, 'quedaron datos del anterior en memoria');
    assert.equal(Q.ev('Object.keys(FOTOS).length'), 0, 'quedaron fotos del anterior en memoria');
    assert.equal(Q.almacen['play_registro_borrador'], undefined, 'el borrador del anterior sigue en el teléfono');
    assert.equal(Q.almacen['play_fotos_borrador'], undefined, 'las fotos del anterior siguen en el teléfono');
    assert.equal(Q.ev('CLAVE_EN_MEMORIA'), '', 'la contraseña del anterior sigue viva');
  });

  test('la contraseña NO vuelve al formulario, y aun así no se teclea dos veces', () => {
    /* Se intentó devolverla al campo —para no teclearla otra vez, y dos veces—
       y se deshizo el mismo día: en un teléfono prestado, la siguiente persona
       se encontraría el registro del anterior con su contraseña puesta. Lo que
       queda: el campo en blanco, y continuar en blanco vale como «sigo con la
       misma». */
    const P = aMitadDelRegistro('');
    const Q = recargar(P);
    Q.ev('pintarRegistro(0)');
    const h = Q.elems.cuerpo.innerHTML;
    assert.equal(/Perro\.2026x/.test(h), false,
      'la contraseña volvió al formulario: el siguiente que use el teléfono la tiene');
    assert.match(h, /Déjalo en blanco para seguir con la misma/,
      'no le dice que puede continuar sin volver a escribirla');
    assert.match(h, /id="rTel"[^>]*value="[^"]+"/, 'perdió el celular');
    /* Y de verdad continúa: con los dos campos vacíos pasa al paso 2. */
    Q.ev("$('rClave').value=''; $('rClave2').value='';");
    Q.ev('siguientePaso()');
    assert.equal(paso(Q), 2, 'dejarlo en blanco no lo dejó continuar, así que la teclea otra vez');
  });

  test('las fotos solo suben a la cuenta de quien las tomó', () => {
    /* Las fotos viven en localStorage, que no muere al cerrar la pestaña, y la
       subida las manda a la cuenta que esté abierta. Sin esta regla, la cédula
       que alguien dejó a medias en un teléfono prestado se sube sola a la
       cuenta del siguiente que entre: dato sensible de otra persona en el
       expediente de un tercero, y el CRM lo compara con el rostro.

       21-sep-2026 — LA REGLA CAMBIÓ DE DUEÑO, Y ESTA PRUEBA CON ELLA. Era «solo
       la pestaña que las tomó» (una marca en sessionStorage), y eso resultó ser
       la mitad del defecto que Joan reportaba: Android no restaura el
       sessionStorage al volver de la cámara, así que las fotos de la persona de
       verdad tampoco subían, en silencio y con la caja diciendo «Listo». Ahora
       las fotos llevan escrito el CELULAR del registro y la hora. Escrita así,
       la prueba dice lo que de verdad protege: las de otro no entran, las
       propias sí. Tal como estaba, pasaba por la razón equivocada (REGISTRO
       vacío en un banco nuevo), no por la regla. */
    const P = aMitadDelRegistro('');
    P.ev("FOTOS = { sensibles: true, cedula_frente: 'data:image/jpeg;base64,AAA' }; marcarDuenoDeLasFotos(); guardarFotos();");
    /* Otra pestaña: el mismo teléfono, el mismo localStorage, sessionStorage
       nuevo. Es lo que pasa al día siguiente, o al volver de la cámara. */
    const otra = abrirPlay({ almacen: P.almacen, hash: '' });
    const conCuenta = cel => {
      otra.ev("SESION = { access_token: 'tok', user: { email: '57" + cel + "@tugarantia.net' } };");
      otra.ev('window.__subio = false; rpcSesion = function () { window.__subio = true; return Promise.resolve({ ok: true }); };');
      otra.ev('subirArchivosRegistro()');
      return otra.ev('!!window.__subio');
    };
    assert.equal(conCuenta('3009999999'), false,
      'subió a esta cuenta las fotos de la cédula de otra persona');
    assert.equal(conCuenta('3001112233'), true,
      'la persona volvió de la cámara y sus propias fotos ya no suben: el CRM recibe el registro sin cédula');
  });

  test('la contraseña sigue SIN tocar localStorage ni el borrador', () => {
    /* La regla vieja no se afloja: lo que cambió es que ahora se usa, no dónde
       vive. */
    const P = aMitadDelRegistro('');
    assert.equal(/Perro\.2026x/.test(JSON.stringify(P.almacen)), false,
      'la contraseña acabó en localStorage');
    const borrador = P.almacen['play_registro_borrador'] || '';
    assert.equal(/clave/.test(borrador), false, 'la contraseña viaja dentro del borrador');
  });
});

/* ===========================================================================
 * UNA FOTO A LA VEZ — 17 de septiembre de 2026
 *
 * El 16-sep se arregló que la MISMA foto se decodificara tres veces. Quedó
 * abierto el caso de al lado, y medido es peor: tocar la caja del frente
 * mientras el lector todavía mastica el reverso SUMA los dos picos — unos 48 MB
 * de la segunda decodificación encima de los ~25 MB que el lector tiene vivos.
 * Entre 76 y 84 megas, en el peor momento de memoria del teléfono y justo
 * cuando la persona acaba de volver de la cámara.
 *
 * El número de decodificaciones es la memoria. Eso es lo que se mide acá.
 * ========================================================================= */
describe('dos fotos a la vez no pueden sumar sus picos (17-sep-2026)', () => {

  test('la segunda foto NO entra mientras la primera se está procesando', () => {
    /* MUTANTE QUE CAZA: quitar el cerrojo de tomarFoto. Sin él son dos
       decodificaciones vivas a la vez, que es el caso de los 84 MB. */
    const P = abrirPlay();
    prepararCamara(P);
    /* Se trabanca el lector a propósito: así la primera foto sigue «en curso»
       cuando llega la segunda, que es exactamente la carrera real. */
    P.ev('window.cargarScript = function () { return new Promise(function () {}); };');
    disparar(P, 'cedula_reverso');
    disparar(P, 'cedula_frente');
    return esperar().then(() => {
      assert.equal(P.ev('window.__decodificaciones'), 1,
        'las dos fotos se decodificaron a la vez: eso suma los dos picos y es lo que tumba la pestaña');
      assert.equal(P.ev('FOTO_EN_CURSO'), true, 'el cerrojo no quedó tomado');
      assert.equal(P.ev('CAJA_EN_ESPERA'), 'cedula_frente', 'no se anotó cuál caja quedó esperando');
    });
  });

  test('a la que esperó se le DICE, y se le devuelve su etiqueta al terminar', () => {
    /* Un botón que no hace nada y no explica por qué es peor que uno lento. */
    const P = abrirPlay();
    prepararCamara(P);
    P.ev('window.cargarScript = function () { return new Promise(function () {}); };');
    disparar(P, 'cedula_reverso');
    disparar(P, 'cedula_frente');
    return esperar().then(() => {
      const caja = P.elems['fot_cedula_frente>hijo'];
      assert.match(caja.textContent, /Espera a que termine/,
        'la caja que no pudo entrar se quedó muda o diciendo «Procesando…» para siempre');
      /* Y cuando la primera termina, la etiqueta vuelve sola a lo que decía. */
      P.ev('soltarCerrojo()');
      assert.equal(P.ev('CAJA_EN_ESPERA'), null, 'la caja en espera no se soltó');
      assert.match(caja.textContent, /Foto del frente/,
        'la caja se quedó diciendo «espera» aunque ya podía');
    });
  });

  test('el cerrojo cubre TAMBIÉN el rato del lector, que es la mitad cara', () => {
    /* El lector tiene ~25 MB vivos mientras decodifica. Si el cerrojo se
       soltara al guardar la foto, el solapamiento seguiría siendo posible
       justo en el tramo que más pesa. Lo que lo garantiza es el `return`
       delante de leerCodigoDeBarras. */
    const VIVO = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', 'play', 'index.html'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const i = VIVO.indexOf('function tomarFoto');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /return leerCodigoDeBarras\(/,
      'el lector dejó de encadenarse: el cerrojo se suelta antes de tiempo');
    assert.match(cuerpo, /\.then\(soltarCerrojo, soltarCerrojo\)/,
      'el cerrojo no se suelta por los dos caminos: un fallo lo dejaría trancado para siempre');
  });

  test('el campo del archivo se vacía SIEMPRE, o la cámara se queda pegada', () => {
    /* Dos cosas en una línea: suelta los 3-4 MB del archivo de la cámara, que
       si no se quedan vivos colgando del <input>; y deja que la misma foto de
       la galería vuelva a disparar onchange, que es lo que necesita quien
       reintenta con la que ya había elegido. */
    const P = abrirPlay();
    prepararCamara(P);
    const entrada = { value: '/ruta/falsa/x.jpg', files: [{ name: 'x.jpg', size: 4000000 }] };
    P.ev('window.__entrada = ' + JSON.stringify(entrada) + ';');
    P.ev("tomarFoto({ target: window.__entrada }, 'cedula_frente')");
    return esperar().then(() => {
      assert.equal(P.ev('window.__entrada.value'), '',
        'el <input> sigue agarrado al archivo de la cámara');
    });
  });

  test('el lienzo del escáner no se reserva de nuevo en cada cuadro', () => {
    /* Escribir c.width vuelve a reservar el mapa de bits entero aunque el
       número sea el mismo: a 720x960 son 2,76 MB por cuadro, doce veces por
       segundo, durante todo el escaneo del rostro. No es el pico de la foto;
       es la presión de fondo que hace que el pico siguiente sea el que mata. */
    const VIVO = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', 'play', 'index.html'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(VIVO, /if \(c\.width !== v\.videoWidth \|\| c\.height !== v\.videoHeight\)/,
      'el lienzo del escáner volvió a redimensionarse en cada cuadro');
  });
});
