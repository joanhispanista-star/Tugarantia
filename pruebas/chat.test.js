/* ============================================================================
 * EL CHAT — fase 1. 28 de agosto de 2026.
 *
 *   cd pruebas && node --test
 *
 * Tres baterías, y cada una vigila un fallo que ya se pagó en este proyecto:
 *
 *  1. LO QUE SE PINTA. El texto de un mensaje lo escribe un cliente y se
 *     muestra en el navegador donde vive la cartera entera. Si alguna vez sale
 *     sin escapar, un socio escribe una etiqueta y le corre a Joan en su
 *     computador. La prueba del `<img onerror>` es la que no se puede borrar.
 *
 *  2. LA MIGRACIÓN. Cinco cosas concretas de 20260828b_chat.sql, incluidas las
 *     dos trampas que solo aparecerían meses después: la llave del socio que
 *     cambia y se lleva la conversación por delante, y los permisos que un
 *     `drop function` se lleva sin avisar.
 *
 *  3. EL CABLE. Que las tres páginas carguen de verdad el archivo compartido.
 *     El chat llevaba tres semanas escrito en la base y sin una sola pantalla
 *     que lo llamara: nadie se enteró porque nada fallaba.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const CHAT = require('../app/chat.js');
const SQL = leer('base/20260828b_chat.sql');

/* Una hora fija para que «Hoy» y «Ayer» no dependan del día en que se corra. */
const HOY = '2026-08-28T15:00:00-05:00';
const msg = (id, de, texto, extra) => Object.assign(
  { id, de, texto, creado_en: '2026-08-28T14:00:00-05:00' }, extra || {});


describe('el chat: lo que se le muestra a una persona', () => {

  test('QUIÉN ESCRIBIÓ DECIDE DE QUÉ LADO VA, y hay cuatro autores', () => {
    assert.equal(CHAT.ladoDe('socio'), 'socio');
    ['panel', 'auto', 'agente'].forEach(de =>
      assert.equal(CHAT.ladoDe(de), 'negocio', de + ' tiene que ir del lado del negocio'));
    /* Un autor desconocido no revienta ni se cuela del lado del cliente: cae
       del lado del negocio, que es el lado en el que un dato raro hace menos
       daño (lo ve Joan, no el socio). */
    assert.equal(CHAT.ladoDe('lo-que-sea'), 'negocio');
    assert.equal(CHAT.ladoDe(undefined), 'negocio');
  });

  test('lo automático se reconoce por el AUTOR, no por la regla', () => {
    assert.equal(CHAT.esAutomatico({ de: 'auto' }), true);
    assert.equal(CHAT.esAutomatico({ de: 'agente' }), true);
    assert.equal(CHAT.esAutomatico({ de: 'panel' }), false);
    assert.equal(CHAT.esAutomatico({ de: 'socio' }), false);
    /* Un 'auto' sin regla anotada SIGUE siendo automático. Si se mirara la
       regla, ese mensaje se le pintaría al cliente como escrito por una
       persona — que es exactamente la mentira que la fase 3 no puede
       permitirse. */
    assert.equal(CHAT.esAutomatico({ de: 'auto', regla: null }), true);
  });

  test('EL TEXTO DEL CLIENTE SE PINTA ESCAPADO — la que no se puede borrar', () => {
    const veneno = '<img src=x onerror="alert(1)"> & <b>hola</b> \'comilla\'';
    const html = CHAT.hiloHTML([msg(1, 'socio', veneno)], { yo: 'negocio', hoy: HOY });
    assert.ok(html.indexOf('<img') < 0, 'salió una etiqueta viva del texto del cliente');
    assert.ok(html.indexOf('onerror') < 0 || html.indexOf('&quot;') >= 0,
      'el atributo del cliente llegó sin escapar');
    assert.ok(html.indexOf('&lt;img') >= 0, 'no escapó el menor-que');
    assert.ok(html.indexOf('&amp;') >= 0, 'no escapó el ampersand');
    assert.ok(html.indexOf('&#39;') >= 0, 'no escapó la comilla simple');
    /* Y lo mismo en la bandeja, que pinta el último mensaje de cada uno. */
    const lista = CHAT.listaHTML(
      [{ cedula: '1', nombre: '<script>x</script>', ultimo: veneno, ultimo_de: 'socio',
         ultimo_en: HOY, sin_leer: 1 }], { hoy: HOY });
    assert.ok(lista.indexOf('<script>x') < 0, 'el nombre salió sin escapar en la bandeja');
    assert.ok(lista.indexOf('<img') < 0, 'el último mensaje salió sin escapar');
  });

  test('un mensaje automático se ANUNCIA como automático en los dos lados', () => {
    const html = CHAT.hiloHTML([msg(1, 'auto', 'Tu pago es el 15', { regla: 'cuando-pago' })],
      { yo: 'socio', hoy: HOY });
    assert.ok(html.indexOf('ch-esauto') >= 0, 'no lleva la marca visual de automático');
    assert.ok(html.indexOf('Respuesta automática') >= 0, 'no lo dice con palabras');
    assert.ok(html.indexOf('cuando-pago') >= 0, 'no dice qué regla contestó');
    /* Visto desde el Panel, la misma marca. Joan tiene que poder distinguir lo
       que contestó él de lo que contestó la máquina. */
    const suyo = CHAT.hiloHTML([msg(1, 'auto', 'x', { regla: 'r' })], { yo: 'negocio', hoy: HOY });
    assert.ok(suyo.indexOf('ch-esauto') >= 0);
  });

  test('el «leído» solo se pinta en el último mensaje propio Y con dato', () => {
    const html = CHAT.hiloHTML([
      msg(1, 'socio', 'uno', { visto: true }),
      msg(2, 'socio', 'dos', { visto: true }),
      msg(3, 'panel', 'contesto')
    ], { yo: 'socio', hoy: HOY, textoVisto: 'Lo vieron' });
    assert.equal((html.match(/Lo vieron/g) || []).length, 1,
      'el «leído» se repitió: la conversación se vuelve una columna de garabatos');

    /* Sin el dato NO se afirma que lo leyeron. Es la regla de la casa: la
       pantalla no promete lo que el código no sabe. */
    const sinDato = CHAT.hiloHTML([msg(1, 'socio', 'uno')], { yo: 'socio', hoy: HOY });
    assert.ok(sinDato.indexOf('ch-visto') < 0,
      'dijo que lo leyeron sin tener con qué saberlo');
  });

  test('se agrupa por día, con «Hoy» y «Ayer», y sin reordenar', () => {
    const hoyMsg = msg(2, 'socio', 'de hoy');
    const ayer = msg(1, 'panel', 'de ayer', { creado_en: '2026-08-27T10:00:00-05:00' });
    const bloques = CHAT.agruparPorDia([ayer, hoyMsg], HOY);
    assert.equal(bloques.length, 2);
    assert.equal(bloques[0].dia, 'Ayer');
    assert.equal(bloques[1].dia, 'Hoy');
    /* El orden es el que trae la base (por id). Si algún día llegan
       desordenados, el problema está en la consulta: reordenar aquí lo
       escondería. */
    assert.equal(bloques[0].mensajes[0].id, 1);
    assert.equal(CHAT.dia('2026-08-12T10:00:00-05:00', HOY), '12 de agosto');
    assert.equal(CHAT.dia('2025-08-12T10:00:00-05:00', HOY), '12 de agosto de 2025');
  });

  test('el tope de 1.000 se avisa ANTES de mandar, con el número', () => {
    assert.equal(CHAT.LARGO_MAX, 1000, 'el tope tiene que ser el mismo que el de la base');
    const r = CHAT.revisar('x'.repeat(1005));
    assert.equal(r.ok, false);
    assert.match(r.motivo, /5 caracteres/, 'no dice por cuánto se pasó');
    assert.equal(CHAT.revisar('   ').ok, false, 'un mensaje en blanco no se manda');
    assert.equal(CHAT.revisar('  hola  ').texto, 'hola', 'no recorta los espacios');
    assert.equal(CHAT.revisar('x'.repeat(1000)).ok, true, 'mil justos sí caben');
  });

  test('la bandeja distingue «me escribió» de «le escribí»', () => {
    const suyo = CHAT.listaHTML([{ cedula: '1', nombre: 'Ana', ultimo: 'hola',
      ultimo_de: 'socio', ultimo_en: HOY, sin_leer: 2 }], { hoy: HOY });
    assert.ok(suyo.indexOf('Tú:') < 0);
    assert.ok(suyo.indexOf('>2<') >= 0, 'no pinta cuántos van sin leer');

    const mio = CHAT.listaHTML([{ cedula: '1', nombre: 'Ana', ultimo: 'listo',
      ultimo_de: 'panel', ultimo_en: HOY, sin_leer: 0 }], { hoy: HOY });
    assert.ok(mio.indexOf('Tú:') >= 0, 'no se ve que el último en hablar fuiste tú');

    const auto = CHAT.listaHTML([{ cedula: '1', nombre: 'Ana', ultimo: 'listo',
      ultimo_de: 'auto', ultimo_en: HOY, sin_leer: 0 }], { hoy: HOY });
    assert.ok(auto.indexOf('Automático:') >= 0,
      'una respuesta automática se ve como si la hubiera escrito Joan');

    assert.equal(CHAT.totalSinLeer([{ sin_leer: 2 }, { sin_leer: 3 }, {}]), 5);
  });

  test('sin conversaciones dice que no hay, y no se queda en blanco', () => {
    assert.match(CHAT.listaHTML([], {}), /ch-vacio/);
    assert.match(CHAT.hiloHTML([], { yo: 'socio' }), /ch-vacio/);
  });
});


describe('el chat: cómo habla con la nube', () => {

  /* Un `fetch` de mentira que anota lo que le pidieron. Sin red: una prueba que
     dependiera de internet no sería una prueba. */
  function banco(respuesta) {
    const visto = { llamadas: [] };
    const cfg = {
      url: 'https://ejemplo.supabase.co/', anon: 'llave-publica',
      clave: 'la-clave-de-joan',
      fetch: (url, opciones) => {
        visto.llamadas.push({ url, cuerpo: JSON.parse(opciones.body), cab: opciones.headers });
        return Promise.resolve(Object.assign(
          { ok: true, status: 200, text: () => Promise.resolve('7') }, respuesta || {}));
      }
    };
    return { cfg, visto };
  }

  test('el socio manda su identificador y su código, no su cédula a secas', async () => {
    const b = banco();
    await CHAT.escribir(b.cfg, '3001112233', 'K7QP3', '  hola  ');
    assert.equal(b.visto.llamadas.length, 1);
    assert.match(b.visto.llamadas[0].url, /\/rest\/v1\/rpc\/chat_escribir$/);
    assert.deepEqual(b.visto.llamadas[0].cuerpo,
      { p_cedula: '3001112233', p_codigo: 'K7QP3', p_texto: 'hola' });
    /* La llave pública va en las dos cabeceras, como en el resto del proyecto. */
    assert.equal(b.visto.llamadas[0].cab.apikey, 'llave-publica');
    assert.equal(b.visto.llamadas[0].cab.Authorization, 'Bearer llave-publica');
  });

  test('y un mensaje vacío NO sale a la red', async () => {
    const b = banco();
    await assert.rejects(() => CHAT.escribir(b.cfg, '1', 'K', '   '));
    assert.equal(b.visto.llamadas.length, 0,
      'gastó una petición para preguntar algo que ya se sabía');
  });

  test('lo de Joan va con su clave, y lo del socio nunca', async () => {
    const b = banco();
    await CHAT.conversaciones(b.cfg);
    await CHAT.responder(b.cfg, '52111222', 'listo');
    await CHAT.leer(b.cfg, '52111222', 'K7QP3', 12);
    const [conv, resp, leer_] = b.visto.llamadas;
    assert.deepEqual(conv.cuerpo, { p_clave: 'la-clave-de-joan' });
    assert.equal(resp.cuerpo.p_clave, 'la-clave-de-joan');
    assert.equal(leer_.cuerpo.p_desde, 12);
    assert.ok(!('p_clave' in leer_.cuerpo),
      'la clave de Joan viajó en una llamada del socio');
  });

  test('un 404 dice que falta correr la migración, no «error»', async () => {
    const b = banco({ ok: false, status: 404, text: () => Promise.resolve('') });
    await assert.rejects(() => CHAT.conversaciones(b.cfg), e => {
      /* Es el fallo que ya pasó con play_solicitar: llamada y sin existir desde
         el 11-ago, dando un 404 mudo durante trece días. */
      assert.match(e.humano, /20260828b_chat.sql/);
      return true;
    });
  });

  test('sin conexión no inventa: se niega antes de pedir', async () => {
    await assert.rejects(() => CHAT.conversaciones({ url: '', anon: '' }),
      e => { assert.match(e.humano, /nube/i); return true; });
  });
});


describe('el chat: la migración 20260828b (lo que la base tiene que hacer)', () => {

  test('caben los cuatro autores y se guarda QUÉ regla contestó', () => {
    assert.match(SQL, /check \(de in \('socio', 'panel', 'auto', 'agente'\)\)/);
    assert.match(SQL, /add column if not exists regla text/);
    /* La restricción se nombra a mano: depender del nombre que PostgreSQL le
       pone solo es depender de un detalle que puede cambiar. */
    assert.match(SQL, /drop constraint if exists mensajes_de_check/);
    assert.match(SQL, /add constraint mensajes_autor_ok/);
  });

  test('EL CHAT DEJA DE PEDIR CÉDULA — si no, deja fuera a 11 de 16 clientes', () => {
    /* La puerta de la app cambió el 20-ago a celular O cédula porque solo 5 de
       16 fichas tienen cédula. El chat se había quedado buscando `cedula = ced`. */
    const escribir = SQL.slice(SQL.indexOf('function public.chat_escribir'),
                               SQL.indexOf('function public.chat_leer'));
    assert.match(escribir, /where \(cedula = ident or celular = ident\)/,
      'chat_escribir sigue buscando solo por cédula');
    assert.match(escribir, /values \(r\.cedula, 'socio'/,
      'guarda el mensaje bajo lo que tecleó el cliente y no bajo la llave de su ' +
      'ficha: el que entra por celular abriría una conversación paralela');

    const leerFn = SQL.slice(SQL.indexOf('function public.chat_leer'),
                             SQL.indexOf('function public.chat_conversaciones'));
    assert.match(leerFn, /where \(cedula = ident or celular = ident\)/,
      'chat_leer sigue buscando solo por cédula');
    assert.match(leerFn, /m\.cedula = r\.cedula/);
    /* Y el freno se mide contra lo que TECLEÓ, como en la puerta de entrada:
       es lo que hay que frenar cuando alguien tantea. */
    assert.match(leerFn, /puede_intentar\(ident\)/);
    assert.match(leerFn, /anotar_fallo\(ident\)/);
  });

  test('los mensajes VIAJAN con el cliente cuando le cambian la llave', () => {
    /* La trampa que solo aparecería meses después: sincronizar_socios borra la
       fila vieja al cargarle la cédula a una ficha que subía por celular, y sin
       esta línea la conversación se queda colgando de una llave borrada. */
    const i = SQL.indexOf('update public.mensajes set cedula = ident where cedula = cel');
    const j = SQL.indexOf('delete from public.socios_historial where cedula = cel');
    assert.ok(i > 0, 'sincronizar_socios no arrastra los mensajes al re-llavear');
    assert.ok(j > 0, 'desapareció el delete de la fila vieja');
    assert.ok(i < j,
      'los mensajes se mueven DESPUÉS de borrar la fila: entre las dos ' +
      'sentencias la conversación apunta a algo que ya no existe');
  });

  test('el código propio del socio sigue intacto en sincronizar_socios', () => {
    /* Esta función se reescribe entera acá, así que la prueba vigila que al
       copiarla no se haya perdido lo de 20260820b: que la subida de Joan NO
       pise la clave que el socio se puso, salvo cuando él aprieta «Cambiar». */
    assert.match(SQL, /when socios_historial\.codigo_propio then socios_historial\.codigo_hash/);
    assert.match(SQL, /codigo_propio *= *case when forzar then false/);
  });

  test('los permisos quedan en UN solo sitio, y el oráculo sigue cerrado', () => {
    ['chat_escribir(text, text, text)', 'chat_leer(text, text, bigint)',
     'chat_conversaciones(text)', 'chat_de(text, text, bigint)',
     'chat_responder(text, text, text)', 'chat_olvidar(text, text)'].forEach(f => {
      assert.ok(SQL.indexOf('revoke all on function public.' + f + ' ') >= 0 ||
                SQL.indexOf('revoke all on function public.' + f) >= 0,
        'falta el revoke de ' + f);
      assert.match(SQL, new RegExp('grant execute on function public\\.' +
        f.replace(/[()]/g, '\\$&').replace(/, /g, ', ') + '\\s+to anon, authenticated'),
        'falta el grant de ' + f);
    });
    /* chat_puede_escribir NO se concede, y eso es deliberado: concedida es un
       oráculo de «esta persona está usando el chat ahora mismo», llamable por
       internet con la llave pública. Ya se cerró una vez el 11-ago. */
    assert.match(SQL, /revoke all on function public\.chat_puede_escribir\(text\)\s+from public/);
    assert.ok(!/grant execute on function public\.chat_puede_escribir/.test(SQL),
      'se volvió a conceder chat_puede_escribir: es un oráculo');
  });

  test('PostgREST se entera de las firmas nuevas', () => {
    assert.match(SQL, /notify pgrst, 'reload schema'/);
  });
});


describe('el chat: que esté de verdad cableado', () => {

  /* La lección de esta fase: el chat llevaba tres semanas escrito en la base y
     sin una sola pantalla que lo llamara, y nadie se enteró porque nada
     fallaba. Lo que no se llama no existe. */

  const PAGINAS = [
    { f: 'app/socio.html',    js: 'chat.js',        css: 'chat.css' },
    { f: 'panel/crm.html',    js: '../app/chat.js', css: '../app/chat.css' },
    { f: 'panel/espejo.html', js: '../app/chat.js', css: '../app/chat.css' }
  ];

  PAGINAS.forEach(p => {
    test(p.f + ' carga el chat compartido', () => {
      const t = leer(p.f);
      assert.ok(t.indexOf('<script src="' + p.js + '"></script>') >= 0,
        p.f + ' no carga ' + p.js);
      assert.ok(t.indexOf('href="' + p.css + '"') >= 0,
        p.f + ' no carga ' + p.css);
    });
  });

  test('y ninguna de las tres se copió el escapado por su cuenta', () => {
    /* Es el defecto que espejo.html dejó escrito de sí mismo cuando tuvo que
       copiarse aplicarVars: «ES UNA SEGUNDA COPIA Y VA A DERIVAR». Acá se
       vigila que el HTML del hilo lo arme chat.js y solo chat.js. */
    PAGINAS.forEach(p => {
      const t = leer(p.f);
      assert.ok(t.indexOf('ch-burbuja') < 0,
        p.f + ' arma la burbuja del chat por su cuenta: eso es una segunda copia');
    });
  });

  test('la app del socio no ofrece chat cuando no puede haberlo', () => {
    const t = leer('app/socio.html');
    /* Sin nube, sin código o entrando por un enlace congelado no hay a quién
       escribirle. Decirlo es la regla de la casa; fingir una caja de texto que
       no manda nada es lo que no se puede. */
    assert.match(t, /function chatDisponible\(\)/);
    assert.match(t, /CFG\.url && CFG\.anon && S && S\.cedula && S\.acceso/);
  });

  test('el Panel no dice «no hay mensajes» cuando lo que pasa es que no miró', () => {
    const t = leer('panel/crm.html');
    const i = t.indexOf('function renderMensajes()');
    assert.ok(i > 0, 'crm.html ya no declara renderMensajes');
    const bloque = t.slice(i, i + 1400);
    assert.match(bloque, /sbListo\(\)/,
      'la bandeja no distingue «sin conexión» de «nadie te ha escrito» — y eso ' +
      'ya pasó una vez en la cola de cobro, pintando un ✓ verde con la cartera vacía');
  });
});


/* ==========================================================================
 * LOS AYUDANTES INTERNOS, CERRADOS (28-ago-2026, noche)
 *
 * Encontrado al correr las comprobaciones de 20260828b_chat.sql contra la base
 * de verdad: `chat_puede_escribir` seguía llamable por `anon` DESPUÉS del
 * `revoke ... from public`. El motivo es la lección, y aplica a todo este
 * proyecto: **Supabase concede EXECUTE a `anon` y `authenticated` en cada
 * función nueva del esquema public**, y ese permiso es EXPLÍCITO. Un
 * `revoke ... from public` no lo quita — no quita nada.
 *
 * O sea que el revoke del 11-ago llevaba diecisiete días dando por cerrado algo
 * que seguía abierto, y no se notaba porque un permiso de más no rompe ninguna
 * pantalla. Nada falla; solo queda la puerta.
 * ======================================================================== */
describe('los ayudantes internos no se llaman desde internet (28-ago-2026)', () => {

  const PERM = leer('base/20260828c_permisos.sql');
  /* La lista que de verdad se cierra es la del `in (...)` del bucle, no el
     archivo entero: al final hay una consulta de comprobación —en un
     comentario— que nombra funciones que SÍ deben seguir abiertas. Mirar el
     archivo a secas daba un falso positivo, y esta prueba lo cazó. */
  const LISTA = (/p\.proname in \(([\s\S]*?)\)\s*\n\s*loop/.exec(PERM) || [, ''])[1];

  /* Las que NUNCA puede llamar un navegador. Las dos primeras juntas son lo
     grave: sin freno, un código de 5 caracteres se prueba entero. */
  const INTERNAS = ['limpiar_fallos', 'clave_ok', 'anotar_fallo', 'puede_intentar',
                    'puede_intentar_tope', 'huella_codigo', 'chat_puede_escribir',
                    'solo_digitos', 'codigo_invitacion_normalizado', 'codigo_invitacion_nuevo'];

  test('las diez internas están en la lista que se cierra', () => {
    assert.ok(LISTA.length > 50, 'no encontré el `in (...)` del bucle de revoke');
    INTERNAS.forEach(f => assert.ok(LISTA.indexOf("'" + f + "'") >= 0,
      f + ' se quedó fuera de la migración de permisos'));
  });

  test('se revoca de anon Y de authenticated, no solo de public', () => {
    /* Si algún día alguien lo «simplifica» a `from public`, vuelve a no hacer
       nada. Esta prueba existe para que esa simplificación falle. */
    assert.match(PERM, /revoke all on function %s from anon, authenticated, public/,
      'el revoke volvió a dejar fuera a anon: entonces no cierra nada');
  });

  test('revoca por oid, no por firma escrita a mano', () => {
    /* Estas funciones han cambiado de firma con las migraciones. Un revoke con
       la firma equivocada revienta el script o revoca otra cosa. */
    assert.match(PERM, /p\.oid::regprocedure/);
    assert.match(PERM, /from pg_proc p/);
  });

  test('NO cierra ninguna de las que llaman las pantallas', () => {
    /* La lista negra tiene que ser exactamente la de los ayudantes. Si aquí
       entrara una de las que usa la app, el cliente deja de poder entrar. */
    ['historial_socio_por_codigo', 'chat_escribir', 'chat_leer', 'chat_conversaciones',
     'chat_de', 'chat_responder', 'chat_olvidar', 'cambiar_codigo_acceso',
     'crear_solicitud_por_codigo', 'canjear_invitacion', 'registrar_abierto',
     'sincronizar_socios'].forEach(f =>
      assert.ok(LISTA.indexOf("'" + f + "'") < 0,
        f + ' entró en la lista de cierre y esa la llaman las pantallas'));
  });

  test('y ninguna pantalla llama a un ayudante interno', () => {
    /* El barrido que se hizo a mano antes de revocar, ahora automático: si
       alguien cablea una de estas desde el front, esta prueba lo caza antes de
       que el revoke le apague la app a un cliente. */
    const FRONT = ['app/socio.html', 'app/chat.js', 'panel/crm.html',
                   'panel/espejo.html', 'panel/nube.js', 'play/index.html'];
    FRONT.forEach(f => {
      const t = leer(f);
      INTERNAS.forEach(fn => assert.ok(t.indexOf('rpc/' + fn) < 0,
        f + ' llama a ' + fn + ', que ya no es llamable desde internet'));
    });
  });
});
