'use strict';
/* ==========================================================================
 * EL CHAT COMO ÚNICO CANAL, Y EL CRÉDITO A LA MEDIDA — 22 de septiembre de 2026
 *
 * Joan: «el chat como unico canal continua y tambien el credito a medida y que
 * las fotos queden guardadas, escribe el codigo y migra», y antes: «no quiero
 * que me escriban por whatsapp, desde el chat de la plataforma que el cliente
 * pueda hablar conmigo, nada de compartir mi numero».
 *
 * QUÉ VIGILA ESTE ARCHIVO. Quitar un canal es fácil; lo difícil es no dejar a
 * nadie sin puerta al hacerlo. Las dos cosas que pueden salir mal aquí son:
 *
 *   1. Que vuelva el número. Un descuido, un copiar y pegar de socio.html, y
 *      el cliente nuevo vuelve a ver el celular de Joan.
 *
 *   2. Que el reemplazo no exista. «Olvidé mi contraseña» ya no abre WhatsApp;
 *      si el recado no sale de verdad hacia pedir_ayuda_clave, el botón está
 *      ahí, se toca, no pasa nada, y nadie se entera. La casa ya pagó por esto
 *      una vez: una función que corre pero que nadie puede encontrar ni usar es
 *      una función que no existe.
 *
 * Por eso casi ninguna de estas pruebas mira el texto del archivo: abren la
 * página en el banco, tocan el botón y miran QUÉ SALE A LA RED.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PLAY = leer('play/index.html');
const CRM = leer('panel/crm.html');
const PRIV = leer('legal/privacidad.html');
/* Sin comentarios: lo que se vigila es lo que se PUBLICA. Un comentario que
   explique por qué se quitó el número no puede hacer caer la prueba. */
const VIVO = PLAY.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Abre la página con una red de mentira que ANOTA cada llamada. Es la pieza de
   la que cuelga casi todo lo de abajo: sin ver el cuerpo del POST, «se envió»
   es una suposición. */
function conRed(respuesta) {
  const P = abrirPlay({});
  const llamadas = [];
  P.ev('CFG = { url: "https://x.supabase.co", anon: "llave-publica" };');
  P.ev('window.__llamadas = [];');
  P.ev('fetch = function (u, o) {' +
       '  window.__llamadas.push({ url: u, cuerpo: JSON.parse((o && o.body) || "{}"),' +
       '    auth: (o && o.headers && o.headers.Authorization) || "" });' +
       '  return Promise.resolve({ ok: true, status: 200,' +
       '    json: function () { return Promise.resolve(window.__respuesta); } });' +
       '};');
  P.ev('window.__respuesta = ' + JSON.stringify(respuesta || { ok: true }) + ';');
  return {
    P,
    llamadas: () => P.ev('JSON.stringify(window.__llamadas)') &&
                    JSON.parse(P.ev('JSON.stringify(window.__llamadas)')),
    responder: r => P.ev('window.__respuesta = ' + JSON.stringify(r) + ';')
  };
}

describe('el número de Joan no se reparte desde play/', () => {

  test('no queda el celular en ninguna parte de lo que se publica', () => {
    assert.ok(!/3103606348/.test(PLAY),
      'el celular de Joan volvió a play/index.html');
    assert.ok(!/310[\s.-]?360[\s.-]?6348/.test(PLAY),
      'el celular de Joan volvió a play/index.html, escrito con espacios');
    assert.ok(!/WA_NEGOCIO\s*=/.test(PLAY),
      'volvió la variable con el número del negocio');
    assert.ok(!/3103606348/.test(PRIV),
      'el celular de Joan volvió a la política de privacidad, que está publicada en vivo');
  });

  test('ningún enlace de play/ abre WhatsApp CON destinatario', () => {
    /* El wa.me SIN número sigue valiendo: es el botón de compartir, que abre
       WhatsApp para que la persona escoja a quién mandarle la invitación. Lo
       que no puede volver es un wa.me con un número detrás. */
    const conDestino = VIVO.match(/wa\.me\/\d/g) || [];
    assert.equal(conDestino.length, 0,
      'play/ volvió a enlazar a un WhatsApp con destinatario: ' + conDestino.join(', '));
  });

  test('ninguna pantalla le promete al cliente que le escriben por WhatsApp', () => {
    /* La promesa, no la palabra. «Tiene que tener WhatsApp» sigue siendo cierto
       —es como se valida que el celular es de verdad— y no promete nada. */
    const promesas = (VIVO.match(/(escribimos|respondemos|avisamos|resolvemos|contactamos)[^<'"]{0,40}WhatsApp/gi) || []);
    assert.equal(promesas.length, 0,
      'una pantalla volvió a prometer WhatsApp: ' + promesas.join(' | '));
  });
});

describe('«Olvidé mi contraseña» lleva a alguna parte', () => {

  test('el botón pinta una pantalla que pide el celular', () => {
    const { P } = conRed();
    P.ev('olvide()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /ayTel/, 'la pantalla de ayuda no pide el celular');
    assert.match(h, /mandarAyuda\(\)/, 'no hay botón que mande el recado');
    /* Y dice por dónde le contestan y en cuánto: «te contactamos» a secas deja
       a la persona mirando un teléfono que no suena. */
    assert.ok(/te escribimos/i.test(h) && /no es autom/i.test(h),
      'la pantalla de ayuda no dice qué pasa después ni que no es instantáneo');
  });

  test('el celular escrito a medias NO se manda, y se dice por qué', () => {
    const { P, llamadas } = conRed();
    P.ev('olvide()');
    P.ev('document.getElementById("ayTel").value = "300";');
    P.ev('mandarAyuda()');
    assert.equal(llamadas().length, 0, 'mandó un celular incompleto a la nube');
    assert.match(P.elems.errAyuda.textContent, /10 números/,
      'no le dijo a la persona qué tiene mal el celular');
  });

  test('el recado SALE, sin sesión y con el celular en limpio', () => {
    const { P, llamadas } = conRed({ ok: true });
    P.ev('olvide()');
    P.ev('document.getElementById("ayTel").value = "300 111 2233";');
    P.ev('document.getElementById("ayNota").value = "Cambié de teléfono";');
    P.ev('mandarAyuda()');
    const l = llamadas();
    assert.equal(l.length, 1, 'el botón de ayuda no llamó a nadie');
    assert.match(l[0].url, /rpc\/pedir_ayuda_clave$/,
      'el recado no fue a pedir_ayuda_clave');
    /* CON LA LLAVE PÚBLICA. Es la única llamada del sistema que tiene que
       funcionar SIN sesión: el que olvidó la contraseña no puede abrir una. */
    assert.match(l[0].auth, /llave-publica/,
      'el recado viajó con una sesión: quien olvidó la contraseña no tiene ninguna');
    assert.equal(l[0].cuerpo.p_celular, '3001112233',
      'el celular viajó sin normalizar');
    assert.equal(l[0].cuerpo.p_nota, 'Cambié de teléfono');
  });

  test('cada motivo del servidor se traduce a algo distinto', () => {
    /* Cinco respuestas y una sola frase para todas es la pantalla mintiendo por
       omisión: el que escribió mal un dígito se queda tocando el mismo botón. */
    const dichas = new Set();
    return ['celular', 'muchas', 'otro'].reduce((cad, m) => cad.then(() => {
      const { P, llamadas } = conRed({ ok: false, motivo: m });
      P.ev('olvide()');
      P.ev('document.getElementById("ayTel").value = "3001112233";');
      P.ev('mandarAyuda()');
      assert.equal(llamadas().length, 1);
      return asentar().then(() => {
        const t = P.elems.errAyuda.textContent;
        assert.ok(t && t !== 'Enviando…', 'el motivo «' + m + '» no dijo nada');
        dichas.add(t);
      });
    }), Promise.resolve()).then(() => {
      assert.equal(dichas.size, 3,
        'dos motivos distintos le dicen lo mismo a la persona: ' + [...dichas].join(' | '));
    });
  });

  test('un recado recibido NO se anuncia como resuelto', () => {
    /* La diferencia entre «lo recibimos» y «ya está arreglado» es la que evita
       que alguien se quede esperando sentado. */
    const { P } = conRed({ ok: true });
    P.ev('olvide()');
    P.ev('document.getElementById("ayTel").value = "3001112233";');
    P.ev('mandarAyuda()');
    return asentar().then(() => {
      const h = P.elems.cuerpo.innerHTML;
      assert.match(h, /lo recibimos/i, 'no acusó recibo del recado');
      assert.ok(!/contraseña nueva|ya puedes entrar|restablecid/i.test(h),
        'la pantalla dio por resuelto un recado que todavía tiene que leer una persona');
    });
  });
});

describe('el crédito a la medida', () => {

  function enSimulador() {
    const P = abrirPlay({});
    P.ev('CFG = { url: "https://x.supabase.co", anon: "llave-publica" };');
    P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net", ' +
         'user_metadata: { perfil: "nuevo" } } };');
    P.ev('pintarCuenta()');
    P.ev('irA("credito")');
    return P;
  }

  test('hay dónde escribir una cifra propia y para qué se quiere', () => {
    const P = enSimulador();
    const h = P.elems.lamina.innerHTML;
    assert.match(h, /id="rMontoLibre"/, 'no hay casilla para escribir el monto');
    assert.match(h, /id="rNota"/, 'no hay dónde decir para qué lo quiere');
    /* El deslizador se queda: es lo cómodo y lo que usa casi todo el mundo. */
    assert.match(h, /id="rMonto"/, 'desapareció el deslizador del monto');
  });

  test('la cifra escrita manda sobre el deslizador, aunque se le salga del tope', () => {
    const P = enSimulador();
    P.ev('document.getElementById("rMontoLibre").value = "12500000";');
    P.ev('escribeMonto(document.getElementById("rMontoLibre"))');
    assert.equal(P.ev('MONTO'), 12500000,
      'lo que la persona escribió no llegó al monto que se va a pedir');
    /* Y el deslizador NO se arrastra a su tope: mostraría una cifra distinta de
       la que la persona acaba de escribir, debajo de sus propios ojos. */
    assert.ok(Number(P.elems.rMonto.value) !== 12500000,
      'el deslizador se movió a una cifra que no puede representar');
  });

  test('la cifra se escribe con puntos, como se escribe en Colombia', () => {
    const P = enSimulador();
    /* El banco crea los elementos la primera vez que alguien los PIDE, así que
       la casilla se toca desde dentro de la página, no desde aquí. */
    P.ev('document.getElementById("rMontoLibre").value = "1250000";');
    P.ev('escribeMonto(document.getElementById("rMontoLibre"))');
    assert.match(P.elems.rMontoLibre.value, /1\.250\.000/,
      'la cifra se queda sin puntos y se vuelve ilegible mientras se teclea');
  });

  test('la solicitud lleva la nota del cliente', () => {
    const P = enSimulador();
    const llamadas = [];
    P.ev('window.__llamadas = [];');
    P.ev('fetch = function (u, o) { window.__llamadas.push({ url: u, cuerpo: JSON.parse(o.body) });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };');
    P.ev('MONTO = 1250000; PLAZO = 3;');
    P.ev('document.getElementById("rNota").value = "Surtir la tienda";');
    P.ev('pedir()');
    const l = JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
    assert.equal(l.length, 1, 'no salió la solicitud');
    assert.match(l[0].url, /rpc\/play_solicitar$/);
    assert.equal(l[0].cuerpo.p_capital, 1250000);
    assert.equal(l[0].cuerpo.p_meses, 3);
    assert.equal(l[0].cuerpo.p_nota, 'Surtir la tienda',
      'la nota del cliente se quedó en el teléfono: es justo lo que Joan lee antes de contraproponer');
  });

  test('cada rechazo del servidor dice algo distinto, y con SU cifra', () => {
    const casos = [
      { r: { ok: false, motivo: 'minimo', minimo: 50000 }, espera: /50\.000/ },
      { r: { ok: false, motivo: 'maximo', maximo: 50000000 }, espera: /50\.000\.000/ },
      { r: { ok: false, motivo: 'plazo' }, espera: /1 y 6/ },
      { r: { ok: false, motivo: 'sesion' }, espera: /sesión/i },
      { r: { ok: false, motivo: 'muchas' }, espera: /chat/i }
    ];
    const dichas = new Set();
    return casos.reduce((cad, c) => cad.then(() => {
      const P = enSimulador();
      P.ev('window.__r = ' + JSON.stringify(c.r) + ';');
      P.ev('fetch = function () { return Promise.resolve({ ok: true, status: 200,' +
           ' json: function () { return Promise.resolve(window.__r); } }); };');
      P.ev('pedir()');
      return asentar().then(() => {
        const t = P.elems.errPedir.textContent;
        assert.match(t, c.espera, 'el motivo «' + c.r.motivo + '» dijo: ' + t);
        dichas.add(t);
      });
    }), Promise.resolve()).then(() => {
      assert.equal(dichas.size, casos.length,
        'dos rechazos distintos le dicen lo mismo al cliente');
    });
  });

  test('el piso y el techo NO están escritos a mano en la app', () => {
    /* Los manda el servidor en la misma respuesta que el motivo. Tenerlos
       también aquí sería la misma regla en dos sitios, y el día que Joan mueva
       una la app seguiría diciendo la otra. */
    assert.ok(!/50000000|50\.000\.000/.test(VIVO.replace(/j\.maximo/g, '')),
      'play/ volvió a escribir el techo a mano en vez de leerlo de la respuesta');
  });

  test('el acuse dice que todavía NO es un crédito, y por dónde le contestan', () => {
    const P = enSimulador();
    P.ev('MONTO = 800000; PLAZO = 3;');
    P.ev('pintarPedido()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /Todavía no es un crédito/,
      'el acuse dejó de decir que la solicitud no es un crédito');
    assert.match(h, /chat de la app/,
      'el acuse no dice por dónde le van a contestar');
  });
});

describe('lo que el CRM tiene que mostrar para que esto no sea un buzón cerrado', () => {

  test('la bandeja enseña la nota del cliente y lo que pidió', () => {
    assert.match(CRM, /function notaDelCliente/,
      'el CRM no muestra en sus palabras para qué quiere la plata el cliente');
    assert.match(CRM, /pedido_nota/, 'el CRM no lee la nota');
    assert.match(CRM, /pedido_monto/, 'el CRM no lee lo que pidió el cliente');
  });

  test('los recados de acceso tienen su lista, y se traen solos', () => {
    assert.match(CRM, /id="ayudas"/, 'no hay dónde pintar los recados');
    assert.match(CRM, /listar_ayudas_clave/, 'el CRM no pide los recados');
    assert.match(CRM, /marcar_ayuda_clave/, 'no se pueden marcar como atendidos');
    /* Y el mismo botón que trae las solicitudes trae los recados: un botón
       aparte, para una lista que se mira una vez al día, es un botón que nadie
       toca. Esto es lo que evita que la tabla se llene sola en silencio. */
    assert.match(CRM, /traerAyudas\(\);[\s\S]{0,80}\}\s*[\r\n]+function renderBandeja/,
      'traerSolicitudes() dejó de traer también los recados de acceso');
  });

  test('un recado solo se borra de la pantalla cuando el servidor lo confirma', () => {
    const f = CRM.slice(CRM.indexOf('function marcarAyuda'), CRM.indexOf('function marcarEnNube'));
    assert.ok(f.indexOf('_ayudas=_ayudas.filter') > f.indexOf('.then(j=>'),
      'el recado se quita de la lista antes de que el servidor confirme: si la ' +
      'llamada falla, queda vivo en la base y desaparecido de la pantalla');
  });
});

describe('las migraciones dicen lo que prometen', () => {

  const base = f => fs.readFileSync(path.join(__dirname, '..', 'base', f), 'utf8');

  test('la del crédito a la medida crea las tres columnas y la tabla de recados', () => {
    const S = base('20260922_a_la_medida_y_ayuda.sql');
    ['pedido_monto', 'pedido_plazo', 'pedido_nota'].forEach(c =>
      assert.ok(S.indexOf(c) >= 0, 'la migración no crea ' + c));
    assert.match(S, /create table if not exists public\.ayudas_clave/);
    /* RLS SIN POLÍTICAS: es la misma forma de reputation_events. Sin RLS, la
       llave pública lee los recados de todo el mundo. */
    assert.match(S, /alter table public\.ayudas_clave\s+enable row level security/,
      'ayudas_clave se quedó sin RLS y la llave pública podría leerla entera');
    assert.ok(!/create policy[^;]*ayudas_clave/.test(S),
      'le pusieron una política a ayudas_clave: se entra solo por las funciones');
    /* La única función del sistema llamable sin sesión tiene que tener freno. */
    const f = S.slice(S.indexOf('function public.pedir_ayuda_clave'),
                      S.indexOf('function public.listar_ayudas_clave'));
    assert.match(f, /puede_intentar/,
      'pedir_ayuda_clave no tiene freno, y es la única puerta sin sesión del sistema');
  });

  test('la del desempate no copia los cuerpos de las funciones', () => {
    /* Copiarlos es como se introducen las diferencias entre el repo y la base.
       Esta migración le pide a PostgreSQL su propia definición y le cambia una
       línea, así que no puede quedar desincronizada. */
    const S = base('20260922b_desempate.sql');
    assert.match(S, /pg_get_functiondef/,
      'la migración del desempate volvió a copiar los cuerpos a mano');
    assert.match(S, /creada_en desc, id desc/);
    assert.ok(!/create or replace function public\.mi_solicitud/.test(S),
      'la migración reescribe mi_solicitud entera: eso es lo que se quería evitar');
  });

  test('las tres migraciones se comprueban solas al final', () => {
    ['20260914b_tres_canales.sql', '20260922_a_la_medida_y_ayuda.sql', '20260922b_desempate.sql']
      .forEach(f => {
        const S = base(f);
        assert.match(S, /raise exception/,
          f + ' no tiene comprobaciones: puede aplicarse a medias sin que nadie se entere');
      });
  });
});
