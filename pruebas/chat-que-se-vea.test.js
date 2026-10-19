/* ============================================================================
 * EL CHAT QUE SE VE — 19 de octubre de 2026
 *
 *   node --test pruebas/chat-que-se-vea.test.js
 *
 * Joan: «chat interno: el cliente escribe dentro de la app, el mensaje llega al
 * panel de Joan y él responde desde ahí, sin WhatsApp». Ya existía, de punta a
 * punta. No se veía, y estas pruebas sostienen las cinco piezas que lo hacen
 * visible, ABRIENDO las páginas con sus bancos (banco-panel, banco-espejo,
 * banco-play) y una nube de mentira:
 *
 *   1. QUIÉN ESCRIBE. Un registrado sin ficha sale con el nombre de su
 *      registro, rotulado «registrado, sin verificar»; un hilo '0' + celular,
 *      nunca con nombre (app/chat.js, quienEs; la base en
 *      base/20261019_chat_quien_escribe.sql, probada en
 *      chat-que-se-vea-postgres.test.js).
 *   2. LA CAUSA CORRECTA. «clave incorrecta» ya no se traduce a «revisa el
 *      internet».
 *   3. EL CELULAR DE JOAN. Mensajes con su número en la barra, que vuelve a
 *      preguntar al entrar y cada 45 s con la página a la vista, y que se
 *      detiene si la clave no pasa.
 *   4. EL CLIENTE VE LA RESPUESTA. «Chat (n)», (n) por canal, entrar donde le
 *      contestaron, y el latido de 20 s; el número sale de una función que
 *      CUENTA sin marcar visto.
 *   5. ESCRIBIRLE PRIMERO. «💬 Escribirle por la app» en la ficha y en
 *      Registrados, al hilo que dice la base.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');
const { abrirPanel } = require('./banco-panel.js');
const { abrirEspejo } = require('./banco-espejo.js');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const CLAVE = 'clave-de-prueba-bien-larga';

/* Una respuesta de la nube, con la forma que chat.js lee (text()). */
const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))),
  json: () => Promise.resolve(cuerpo) });

/* La nube de mentira: por nombre de función, una respuesta fija o una función
   del cuerpo. Lo que no está, 404 — que es lo que contesta una función que la
   base todavía no tiene. Anota cada llamada. */
function nube(o) {
  const vistas = [];
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    if (o[fn] !== undefined) {
      const r = typeof o[fn] === 'function' ? o[fn](cuerpo) : o[fn];
      return Promise.resolve(r && r.status ? resp(r.status, r.cuerpo) : resp(200, r));
    }
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas, de: fn => vistas.filter(v => v.fn === fn) };
}

/* ========================================================================== */
describe('1. quién escribe: el nombre del registro, rotulado, y nunca en un hilo «0»', () => {

  const conv = o => Object.assign({ cedula: '3001234567', nombre: '', celular: '', ultimo: 'Hola, pedí 300.000',
    ultimo_de: 'socio', ultimo_en: '2026-10-19T14:00:00Z', sin_leer: 1 }, o);

  test('el registrado sin ficha sale con su nombre y «registrado, sin verificar»', () => {
    /* El caso de William el 19-oct: «Socio nuevo · 3001234567» y nada más. */
    const h = plano(CHAT.listaHTML([conv({ nombre_registro: 'William Pérez' })], {}));
    assert.match(h, /William Pérez \(registrado, sin verificar\) · 3001234567/);
    assert.doesNotMatch(h, /Socio nuevo/);
  });

  test('la ficha manda sobre el registro', () => {
    const h = plano(CHAT.listaHTML([conv({ nombre: 'William de la Ficha', nombre_registro: 'Otro Nombre' })], {}));
    assert.match(h, /William de la Ficha/);
    assert.doesNotMatch(h, /Otro Nombre|sin verificar/);
  });

  test('un hilo «0» + celular NO lleva nombre aunque llegue uno, y sigue el aviso', () => {
    /* La base no lo manda; la pantalla tampoco lo pintaría si lo mandara. Con
       un nombre ahí, Joan lee «es él» y le habla de la deuda a quien tenga el
       número (Ley 1581 y Ley 2300). */
    const h = plano(CHAT.listaHTML([conv({ cedula: '03001234567', nombre_registro: 'Alguien Con El Numero' })], {}));
    assert.match(h, /Sin juntar · 3001234567 \(número de una ficha\) · no sabemos si es él: no le hables de su deuda aquí/);
    assert.doesNotMatch(h, /Alguien Con El Numero/);
  });

  test('con una llave que no es un celular no se pinta el registro, y sin nada sigue «Socio nuevo»', () => {
    assert.match(CHAT.quienEs(conv({ cedula: '52111222', nombre_registro: 'Raro' })), /^Socio nuevo · 52111222$/);
    assert.equal(CHAT.quienEs(conv({})), 'Socio nuevo · 3001234567');
    assert.equal(CHAT.quienEs(conv({ nombre_registro: '   ' })), 'Socio nuevo · 3001234567');
  });

  test('el nombre del registro lo escribió una persona: sale escapado', () => {
    const h = CHAT.listaHTML([conv({ nombre_registro: '<img src=x onerror=alert(1)>' })], {});
    assert.ok(h.indexOf('<img') < 0, 'el nombre del registro se pintó crudo en el navegador de Joan');
    assert.match(h, /&lt;img/);
  });

  test('el CRM pinta la bandeja con el nombre, y el hilo abierto dice lo mismo que la bandeja', () => {
    const P = abrirPanel({});
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: CLAVE });
    const real = globalThis.fetch;
    globalThis.fetch = () => new Promise(() => {});   // el hilo se queda «Abriendo…»: aquí solo se mira el título
    try {
      P.ev('_convs = ' + JSON.stringify([conv({ nombre_registro: 'William Pérez' }),
        conv({ cedula: '03009998877', ultimo: 'soy yo' })]) + '; _convsEstado = "ok"; renderMensajes();');
      assert.match(plano(P.elems.chBandeja.innerHTML), /William Pérez \(registrado, sin verificar\) · 3001234567/);
      P.ev('abrirConversacion("3001234567")');
      assert.equal(P.elems.mTitle.textContent, 'William Pérez (registrado, sin verificar) · 3001234567',
        'la bandeja dice el nombre y el hilo abierto vuelve a decir «Socio»');
      P.ev('abrirConversacion("03009998877")');
      assert.match(P.elems.mTitle.textContent, /no le hables de su deuda aquí/,
        'el hilo «0» abierto no repite el aviso que tiene en la bandeja');
    } finally { globalThis.fetch = real; }
  });
});

/* ========================================================================== */
describe('2. la causa correcta: la clave no es «revisa el internet»', () => {

  const cfg = (status, cuerpo) => ({ url: 'https://x.supabase.co', anon: 'a', clave: 'mala',
    fetch: () => Promise.resolve(resp(status, cuerpo)) });

  test('«clave incorrecta» dice que es la clave, cómo probarla, y lo marca para quien sondea', async () => {
    await assert.rejects(() => CHAT.conversaciones(cfg(400, { code: 'P0001', message: 'clave incorrecta' })), e => {
      assert.equal(e.clave, true, 'sin la marca, el celular seguiría sondeando con la clave mala y armaría el freno');
      assert.doesNotMatch(e.humano, /internet/i, 'manda a Joan a revisar el wifi por algo que se arregla en Ajustes');
      assert.match(e.humano, /clave de sincronización/);
      assert.match(e.humano, /Ajustes → 🔌 Probar conexión/);
      /* clave_ok dice que no en tres casos, y el freno es uno: decirlo evita
         que Joan cambie una clave que estaba bien. */
      assert.match(e.humano, /intentos fallidos/);
      return true;
    });
  });

  test('«clave de sincronización incorrecta» (las de la puerta única) es lo mismo', async () => {
    await assert.rejects(() => CHAT.hiloDeCelular(cfg(400, { message: 'clave de sincronización incorrecta' }), '3001234567'),
      e => e.clave === true && /Probar conexión/.test(e.humano));
  });

  test('un fallo que NO es la clave sigue siendo un fallo de conexión, sin la marca', async () => {
    await assert.rejects(() => CHAT.conversaciones(cfg(500, { message: 'se cayó algo' })),
      e => !e.clave && /Revisa el internet/.test(e.humano));
  });

  test('el 404 nombra el archivo que falta, según la función', async () => {
    await assert.rejects(() => CHAT.hiloDeCelular(cfg(404, ''), '3001234567'),
      e => /20261019b_chat_sin_leer_sesion\.sql/.test(e.humano));
    await assert.rejects(() => CHAT.conversaciones(cfg(404, '')),
      e => /20260828b_chat\.sql/.test(e.humano));
  });

  test('el CRM lo dice así en la bandeja (lo que se reprodujo el 19-oct)', async () => {
    const P = abrirPanel({});
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: 'una-que-no-es-la' });
    const real = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(resp(400, { message: 'clave incorrecta' }));
    try {
      P.ev('traerConversaciones()');
      await asentar();
      const h = plano(P.elems.chBandeja.innerHTML);
      assert.match(h, /no aceptó tu clave de sincronización/);
      assert.doesNotMatch(h, /Revisa el internet/);
      assert.equal(P.elems.navSinLeer.textContent, ' (?)');
    } finally { globalThis.fetch = real; }
  });
});

/* ========================================================================== */
describe('3. el celular de Joan: el número de Mensajes y el sondeo de 45 s', () => {

  const CONVS = [
    { cedula: '3001234567', nombre: '', nombre_registro: 'William Pérez', ultimo: 'hola', ultimo_de: 'socio',
      ultimo_en: '2026-10-19T14:00:00Z', sin_leer: 2 },
    { cedula: '52111222', nombre: 'Bruno', ultimo: 'listo', ultimo_de: 'panel', ultimo_en: '2026-10-19T13:00:00Z', sin_leer: 0 }
  ];
  function celular(o) {
    o = o || {};
    const almacen = { joan_socios_sb: JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: CLAVE }) };
    const N = nube(Object.assign({ chat_conversaciones: CONVS }, o.nube));
    const e = abrirEspejo({ almacen, ui: o.ui, red: (url, cuerpo) => N.red(url, { body: JSON.stringify(cuerpo) })
      .then(r => r.text().then(t => ({ status: r.status, cuerpo: t }))) });
    return { e, N };
  }

  test('al abrir la app pregunta una vez, y la barra dice cuántos mensajes sin leer hay', async () => {
    const { e, N } = celular();
    await asentar();
    assert.equal(N.de('chat_conversaciones').length, 1, 'no preguntó al abrir, o preguntó de más');
    const g = e.elems.globoMensajes;
    assert.ok(g, 'la pestaña Mensajes no tiene dónde decir el número');
    assert.equal(g.hidden, false, 'hay 2 mensajes sin leer y la barra no dice nada');
    assert.match(g.innerHTML, />?2</);
    assert.match(g.innerHTML, /sin leer/, 'el lector de pantalla no sabe qué es el número');
  });

  test('sin respuesta de la nube no hay número: un «0» diría que nadie escribió', async () => {
    const { e } = celular({ nube: { chat_conversaciones: { status: 500, cuerpo: { message: 'caída' } } } });
    await asentar();
    assert.equal(e.elems.globoMensajes.hidden, true);
  });

  test('entrar a Mensajes vuelve a preguntar, cada vez', async () => {
    const { e, N } = celular();
    await asentar();
    const antes = N.de('chat_conversaciones').length;
    e.tocarPestania('mensajes'); e.correrPendientes(); await asentar();
    e.tocarPestania('hoy');
    e.tocarPestania('mensajes'); e.correrPendientes(); await asentar();
    assert.equal(N.de('chat_conversaciones').length, antes + 2,
      'volver a la pestaña enseña la lista de hace una hora hasta tocar ↻');
    assert.match(plano(e.cuerpo()), /William Pérez \(registrado, sin verificar\)/);
    /* Y el límite del aviso está dicho en la pantalla. */
    assert.match(plano(e.cuerpo()), /Con la app cerrada no te llega ningún aviso/);
  });

  test('el reloj es de 45 s, uno solo, y la vuelta respeta los 45 s y la página escondida', async () => {
    const { e, N } = celular();
    await asentar();
    e.ev('window.__relojes = []; setInterval = function (f, ms) { window.__relojes.push(ms); return 7; };' +
         '_relojMensajes = null; vigilarMensajes(); vigilarMensajes();');
    assert.deepEqual(e.json('window.__relojes'), [45000], 'el sondeo no es de 45 s, o se armaron dos relojes');
    /* Recién preguntó al abrir: una vuelta inmediata no vuelve a preguntar. */
    assert.equal(e.ev('latidoMensajes()'), false, 'preguntó dos veces en menos de 45 s');
    /* Con la página escondida, nada. */
    e.ev('_msj.ultimaVez = 0; document.hidden = true;');
    assert.equal(e.ev('latidoMensajes()'), false, 'pregunta con la app en segundo plano');
    e.ev('document.hidden = false;');
    const antes = N.de('chat_conversaciones').length;
    assert.equal(e.ev('latidoMensajes()'), true);
    await asentar();
    assert.equal(N.de('chat_conversaciones').length, antes + 1);
  });

  test('con la clave rechazada el sondeo se DETIENE y la barra dice «?»', async () => {
    const { e, N } = celular({ nube: { chat_conversaciones: { status: 400, cuerpo: { message: 'clave incorrecta' } } } });
    await asentar();
    assert.equal(N.de('chat_conversaciones').length, 1);
    e.ev('_msj.ultimaVez = 0;');
    assert.equal(e.ev('latidoMensajes()'), false,
      'siguió preguntando con la clave mala: cada vuelta es un intento fallido que acerca el freno para todos');
    assert.equal(N.de('chat_conversaciones').length, 1);
    assert.equal(e.elems.globoMensajes.hidden, false);
    assert.match(e.elems.globoMensajes.innerHTML, /^\?/);
  });

  test('el sondeo no repinta un hilo abierto: Joan puede estar escribiendo', async () => {
    const { e } = celular({ nube: { chat_de: [] } });
    await asentar();
    e.tocarPestania('mensajes'); e.correrPendientes(); await asentar();
    e.ev('abrirHilo("3001234567")'); await asentar();
    e.elems.cuerpo.innerHTML = 'MARCA: Joan escribiendo';
    e.ev('_msj.ultimaVez = 0;');
    assert.equal(e.ev('latidoMensajes()'), true);
    await asentar();
    assert.equal(e.elems.cuerpo.innerHTML, 'MARCA: Joan escribiendo', 'el sondeo le repintó el hilo a Joan');
    assert.equal(e.elems.globoMensajes.hidden, false, 'el número de la barra no se actualizó');
  });

  test('el título del hilo abierto en el celular sale de la misma regla', async () => {
    const { e } = celular({ nube: { chat_de: [] } });
    await asentar();
    e.tocarPestania('mensajes'); e.correrPendientes(); await asentar();
    e.ev('abrirHilo("3001234567")'); await asentar();
    assert.match(plano(e.cuerpo()), /William Pérez \(registrado, sin verificar\) · 3001234567/);
  });
});

/* ========================================================================== */
describe('4. el cliente ve la respuesta: «Chat (n)», el canal y el latido', () => {

  /* play/ con una sesión y una nube que contesta por función. */
  function cliente(o) {
    o = o || {};
    const P = abrirPlay({});
    P.ev('CFG = { url: "https://x.supabase.co", anon: "llave-publica" };');
    /* Las respuestas que son funciones del cuerpo viajan como TEXTO al
       contexto de la página: JSON.stringify se las comería. */
    const r = o.nube || {};
    const fuente = '{' + Object.keys(r).map(k => JSON.stringify(k) + ': ' +
      (typeof r[k] === 'function' ? '(' + r[k].toString() + ')' : JSON.stringify(r[k]))).join(', ') + '}';
    P.ev('window.__l = []; window.__timers = []; window.__r = ' + fuente + ';' +
      'setTimeout = function (f, ms) { window.__timers.push({ f: f, ms: ms }); return window.__timers.length; };' +
      'fetch = function (u, op) {' +
      '  var fn = (/\\/rpc\\/([a-z_]+)$/.exec(String(u)) || [])[1]; var c = JSON.parse((op && op.body) || "{}");' +
      '  window.__l.push({ fn: fn, c: c });' +
      '  var r = window.__r[fn];' +
      '  if (typeof r === "function") r = r(c);' +
      '  if (r === undefined) return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });' +
      '  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } });' +
      '};');
    P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net", user_metadata: { perfil: "nuevo" } } };');
    return P;
  }
  const llamadas = (P, fn) => JSON.parse(P.ev('JSON.stringify(window.__l)')).filter(x => !fn || x.fn === fn);
  const barra = P => plano(P.elems.tabs.innerHTML);
  /* La fila de canales: la pinta laminaChat dentro de la lámina, y después
     abrirCanal y los contadores la repintan en su sitio (lamina>hijo en el
     banco). Se lee la más reciente. */
  const canales = P => plano(P.elems['lamina>hijo'] && P.elems['lamina>hijo'].innerHTML
    ? P.elems['lamina>hijo'].innerHTML : P.elems.lamina.innerHTML);
  const SIN = (s, c, k) => ({ ok: true, servicio: s, cobranza: c, creditos: k, total: s + c + k });

  test('al entrar a la cuenta cuenta lo que le falta por leer y lo dice en la barra: «Chat (2)»', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 0, 2) } });
    P.ev('pintarCuenta()');
    await asentar();
    assert.equal(llamadas(P, 'chat_sin_leer_sesion').length, 1);
    assert.match(barra(P), /Chat \(2\)/, 'Joan le contestó y la pestaña no lo dice');
  });

  test('CONTAR NO ES LEER: al contar no se llama chat_leer_sesion (Joan vería «Lo vio» sin que nadie leyera)', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(1, 1, 1) } });
    P.ev('pintarCuenta()');
    await asentar();
    assert.equal(llamadas(P, 'chat_leer_sesion').length, 0);
    assert.deepEqual(llamadas(P, 'chat_sin_leer_sesion')[0].c, {}, 'el contador mandó algo: el hilo sale de la sesión, no de un parámetro');
  });

  test('entrar al chat abre en el canal donde le contestaron, con (n) en cada botón', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 0, 2),
      chat_leer_sesion: c => ({ ok: true, canal: c.p_canal, mensajes: [] }) } });
    P.ev('pintarCuenta()');
    await asentar();
    /* Para mirar los botones antes de que se lea el canal, la lectura se
       queda en camino. */
    P.ev('window.__r.chat_leer_sesion = undefined; fetch = (function (f) { return function (u, op) {' +
         ' if (/chat_leer_sesion$/.test(u)) return new Promise(function () {}); return f(u, op); }; })(fetch);');
    P.ev('irA("chat")');
    assert.equal(P.ev('CANAL'), 'creditos', 'abrió en «Servicio» y la respuesta está en «Créditos nuevos»');
    assert.match(canales(P), /Créditos nuevos \(2\)/);
    assert.doesNotMatch(canales(P), /Servicio al cliente \(|Cobranzas \(/);
  });

  test('leer el canal lo deja en cero: la barra y el botón dejan de contarlo', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 1, 2),
      chat_leer_sesion: c => ({ ok: true, canal: c.p_canal,
        mensajes: [{ id: 41, de: 'panel', texto: 'te contesto', creado_en: '2026-10-19T14:00:00Z' }] }) } });
    P.ev('pintarCuenta()');
    await asentar();
    assert.match(barra(P), /Chat \(3\)/);
    /* Con pendientes en dos canales entra al primero, en el orden de la
       barra: el mismo criterio del CRM (canalDeEntrada). */
    P.ev('irA("chat")');
    await asentar();
    assert.equal(P.ev('CANAL'), 'cobranza');
    assert.match(barra(P), /Chat \(2\)/, 'leer «Cobranzas» no bajó el número de la barra');
    assert.match(canales(P), /Créditos nuevos \(2\)/);
    assert.doesNotMatch(canales(P), /Cobranzas \(/);
  });

  test('una cuenta pedida ANTES de leer no le vuelve a poner el número a lo que está mirando', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 0, 0),
      chat_leer_sesion: c => ({ ok: true, canal: c.p_canal, mensajes: [] }) } });
    P.ev('pintarCuenta(); irA("chat");');
    await asentar();
    /* La cuenta sale, el cliente abre «Cobranzas» y la lectura vuelve ANTES
       que la cuenta (que trae el número de antes de leer). */
    P.ev('var __soltar; window.__r.chat_sin_leer_sesion = undefined; fetch = (function (f) { return function (u, op) {' +
         ' if (/chat_sin_leer_sesion$/.test(u)) return new Promise(function (ok) { __soltar = function () { ok({ ok: true, status: 200,' +
         ' json: function () { return Promise.resolve({ ok: true, servicio: 0, cobranza: 3, creditos: 0, total: 3 }); } }); }; });' +
         ' return f(u, op); }; })(fetch);');
    P.ev('contarSinLeer(); abrirCanal("cobranza");');
    await asentar();
    P.ev('__soltar()');
    await asentar();
    assert.doesNotMatch(barra(P), /Chat \(/, 'la cuenta vieja le volvió a poner «(3)» al canal que está mirando');
  });

  test('estando en el chat, volver a tocar «Chat» no le cambia el canal; pedirlo por el chat abre «Créditos nuevos»', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 4, 0),
      chat_leer_sesion: c => ({ ok: true, canal: c.p_canal, mensajes: [] }) } });
    P.ev('pintarCuenta()');
    await asentar();
    P.ev('irA("chat"); abrirCanal("servicio");');
    await asentar();
    P.ev('irA("chat")');
    assert.equal(P.ev('CANAL'), 'servicio', 'le cambiaron el canal debajo del dedo');
    P.ev('irA("credito"); pedirPorElChat();');
    assert.equal(P.ev('CANAL'), 'creditos');
  });

  test('el latido: 20 s, y con la página escondida no pregunta nada', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 0, 0) } });
    P.ev('pintarCuenta()');
    await asentar();
    const t = JSON.parse(P.ev('JSON.stringify(window.__timers.map(function (x) { return x.ms; }))'));
    assert.ok(t.indexOf(20000) >= 0, 'no hay latido de 20 s');
    /* Un solo latido aunque se vuelva a pintar la cuenta. */
    P.ev('pintarCuenta()');
    const t2 = JSON.parse(P.ev('JSON.stringify(window.__timers.map(function (x) { return x.ms; }))'));
    assert.equal(t2.filter(ms => ms === 20000).length, 1, 'pintar la cuenta otra vez armó un segundo latido');
    const antes = llamadas(P, 'chat_sin_leer_sesion').length;
    P.ev('document.hidden = true; window.__timers.filter(function (x) { return x.ms === 20000; }).pop().f();');
    await asentar();
    assert.equal(llamadas(P, 'chat_sin_leer_sesion').length, antes, 'preguntó con la página escondida');
    P.ev('document.hidden = false; window.__timers.filter(function (x) { return x.ms === 20000; }).pop().f();');
    await asentar();
    assert.equal(llamadas(P, 'chat_sin_leer_sesion').length, antes + 1, 'el latido no volvió a contar');
  });

  test('con el chat abierto, el latido trae SOLO lo nuevo del canal y lo pinta', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(0, 0, 0),
      chat_leer_sesion: c => ({ ok: true, canal: c.p_canal,
        mensajes: Number(c.p_desde) >= 41 ? [{ id: 52, de: 'panel', texto: 'RESPUESTA NUEVA', creado_en: '2026-10-19T14:05:00Z' }]
                                         : [{ id: 41, de: 'socio', texto: 'hola', creado_en: '2026-10-19T14:00:00Z' }] }) } });
    P.ev('pintarCuenta(); irA("chat");');
    await asentar();
    P.ev('document.getElementById("chTexto").value = "a medio escribir"');
    P.ev('window.__timers.filter(function (x) { return x.ms === 20000; }).pop().f();');
    await asentar();
    const leidas = llamadas(P, 'chat_leer_sesion');
    assert.equal(leidas[leidas.length - 1].c.p_desde, 41, 'el latido volvió a bajar el hilo entero');
    assert.match(P.elems.hilo.innerHTML, /RESPUESTA NUEVA/);
    assert.match(P.elems.hilo.innerHTML, /hola/, 'lo que ya se veía se borró');
    assert.equal(P.ev('document.getElementById("chTexto").value'), 'a medio escribir', 'el latido le borró lo que escribía');
  });

  test('si la base todavía no tiene el contador (404): ningún número, y no vuelve a preguntar en la visita', async () => {
    const P = cliente({ nube: {} });
    P.ev('pintarCuenta()');
    await asentar();
    assert.doesNotMatch(barra(P), /Chat \(/);
    assert.equal(P.ev('SIN_LEER_APAGADO'), true);
    P.ev('contarSinLeer()');
    await asentar();
    assert.equal(llamadas(P, 'chat_sin_leer_sesion').length, 1, 'siguió preguntando por una función que no existe');
  });

  test('salir de la cuenta olvida el número y apaga el latido', async () => {
    const P = cliente({ nube: { chat_sin_leer_sesion: SIN(2, 0, 0) } });
    P.ev('pintarCuenta()');
    await asentar();
    P.ev('salirDeCuenta()');
    assert.equal(P.ev('SIN_LEER'), null);
    assert.equal(P.ev('LATIDO'), null);
  });
});

/* ========================================================================== */
describe('5. escribirle primero desde el CRM: «💬 Escribirle por la app»', () => {

  const CARTERA = {
    socios: [
      { id: 'C1', numero: 7, nombre: 'Adriana Ficha', cedula: '', telefono: '3001112222', whatsappIgual: true },
      { id: 'C2', numero: 8, nombre: 'Bruno Ficha', cedula: '52111222', telefono: '+57 300 333 4444', whatsappIgual: true,
        cuentaJunta: { celular: '3003334444', fecha: '2026-10-10', registro_id: 9, por: 'crm' } }
    ],
    prestamos: [],
    config: { negocio: 'Tu Garantía' }
  };
  const REG = { id: 41, nombre: 'William   Registrado', cedula: '', telefono: '+57 300 123 4567', origen: 'abierto',
    estado: 'nuevo', creado_en: '2026-10-19T14:55:00Z', datos: {} };

  function crm(o) {
    o = o || {};
    const P = abrirPanel({});
    if (o.conectado !== false) {
      P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
    }
    P.cargarCartera(JSON.parse(JSON.stringify(CARTERA)));
    P.ev('_registros = ' + JSON.stringify([REG]));
    return P;
  }
  /* chat.js corre en el reino de Node dentro del banco del CRM: su fetch es el
     global de Node, y se cambia por uno de mentira mientras dura la prueba. */
  async function conNube(o, fn) {
    const N = nube(o);
    const real = globalThis.fetch;
    globalThis.fetch = (u, c) => N.red(u, c);
    try { await fn(N); } finally { globalThis.fetch = real; }
  }

  test('el botón está en la ficha y en la fila de Registrados', () => {
    const P = crm();
    P.ev("verCliente('C1')");
    assert.match(P.elems.mBody.innerHTML, /escribirlePorLaApp\('ficha','C1'\)[^>]*>💬 Escribirle por la app/);
    P.ev('renderRegistros()');
    assert.match(P.elems.tblRegistros.innerHTML, /escribirlePorLaApp\('registro','41'\)[^>]*>💬 Escribirle por la app/);
  });

  test('desde la ficha escribe en el hilo DE LA FICHA, nunca en el «0», y dice que no le llega aviso', async () => {
    const P = crm();
    await conNube({ chat_de: [], chat_conversaciones: [] }, async N => {
      P.ev("escribirlePorLaApp('ficha','C1')");
      await asentar();
      assert.equal(P.ev('_chatAbierta'), '3001112222', 'no es la llave de la ficha en la nube (llaveEnLaNube)');
      assert.equal(P.elems.mTitle.textContent, 'Adriana Ficha');
      const cuerpo = plano(P.elems.mBody.innerHTML);
      assert.match(cuerpo, /lo lee cuando su cuenta de la app esté junta con ella/,
        'la ficha sin cuenta junta no dice que el mensaje espera a que se junte');
      assert.match(cuerpo, /No le llega aviso al celular: lo ve cuando abra la app/);
      assert.equal(N.de('chat_de')[0].cuerpo.p_cedula, '3001112222');
      /* Con la cuenta junta (desde este computador) no se dice lo de juntar. */
      P.ev("escribirlePorLaApp('ficha','C2')");
      await asentar();
      assert.equal(P.ev('_chatAbierta'), '52111222');
      assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /esté junta con ella/);
    });
  });

  test('desde Registrados el hilo lo dice la base; si es un «0», va el aviso y NINGÚN nombre', async () => {
    const P = crm();
    await conNube({ chat_hilo_de_celular: { ok: true, hilo: '03001234567' }, chat_de: [], chat_conversaciones: [] }, async N => {
      P.ev("escribirlePorLaApp('registro','41')");
      await asentar();
      assert.deepEqual(N.de('chat_hilo_de_celular')[0].cuerpo, { p_clave: CLAVE, p_celular: '3001234567' });
      assert.equal(P.ev('_chatAbierta'), '03001234567', 'no abrió el hilo que dijo la base');
      assert.match(P.elems.mTitle.textContent, /no le hables de su deuda aquí/);
      assert.doesNotMatch(P.elems.mTitle.textContent, /William/,
        'un hilo sin juntar salió con nombre: se leería como «es él»');
    });
  });

  test('si el hilo es su celular, el nombre del registro sale rotulado; si es una ficha junta, el de la ficha', async () => {
    const P = crm();
    await conNube({ chat_hilo_de_celular: { ok: true, hilo: '3001234567' }, chat_de: [], chat_conversaciones: [] }, async () => {
      P.ev("escribirlePorLaApp('registro','41')");
      await asentar();
      assert.equal(P.ev('_chatAbierta'), '3001234567');
      assert.equal(P.elems.mTitle.textContent, 'William Registrado (registrado, sin verificar)');
    });
    await conNube({ chat_hilo_de_celular: { ok: true, hilo: '52111222' }, chat_de: [], chat_conversaciones: [] }, async () => {
      P.ev("escribirlePorLaApp('registro','41')");
      await asentar();
      assert.equal(P.ev('_chatAbierta'), '52111222');
      assert.equal(P.elems.mTitle.textContent, 'Bruno Ficha');
    });
  });

  test('si la base no dice dónde, no abre nada a ciegas; y sin nube lo dice sin preguntar', async () => {
    const P = crm();
    await conNube({ chat_hilo_de_celular: { status: 400, cuerpo: { message: 'clave incorrecta' } } }, async () => {
      P.ev('_chatAbierta = null;');
      P.ev("escribirlePorLaApp('registro','41')");
      await asentar();
      assert.equal(P.ev('_chatAbierta'), null, 'abrió un hilo sin saber cuál es');
      assert.match((P.ctx._avisos || []).join('\n'), /Probar conexión/, 'no dijo que es la clave');
    });
    const Q = crm({ conectado: false });
    await conNube({}, async N => {
      Q.ev("escribirlePorLaApp('ficha','C1')");
      assert.equal(N.vistas.length, 0);
      assert.match((Q.ctx._avisos || []).join('\n'), /Conéctala en Ajustes/);
    });
  });
});

/* ========================================================================== */
describe('lo que no se puede romper sin que se note', () => {

  test('play/ no lee el contador con la función que marca visto', () => {
    const PLAY = leer('play/index.html');
    const i = PLAY.indexOf('function contarSinLeer(');
    assert.ok(i > 0);
    const cuerpo = PLAY.slice(i, PLAY.indexOf('\n}', i));
    assert.match(cuerpo, /rpcSesion\('chat_sin_leer_sesion'/);
    assert.doesNotMatch(cuerpo, /chat_leer_sesion/);
  });

  test('crm.html no declara dos veces ninguna de las funciones nuevas', () => {
    const CRM = leer('panel/crm.html');
    ['escribirlePorLaApp', 'abrirConversacion'].forEach(n => {
      const veces = (CRM.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
      assert.equal(veces, 1, n + ' está declarada ' + veces + ' veces');
    });
  });
});
