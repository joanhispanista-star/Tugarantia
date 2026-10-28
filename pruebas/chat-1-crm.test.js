'use strict';
/* ==========================================================================
 * CHAT-1 EN EL CRM — 26 de octubre de 2026
 *
 *   node --test pruebas/chat-1-crm.test.js
 *
 * Joan, 23-oct: «quiero poder chatear con los del equipo, y también quiero
 * poder chatear con los clientes». El chat existía; no se veía. Estas pruebas
 * ARRANCAN panel/crm.html en su banco (banco-panel.js) con una nube de
 * mentira y miran LO QUE SE PINTA —#eqBandeja, #navSinLeer, #chSegmentos,
 * document.title, #chHilo, #chErr, el cuadro de texto— porque así fue como
 * se escapó vigilarJefeEq: existía, estaba bien escrita y nadie la llamaba.
 *
 * Cada bloque falla con 19c6264 (publicar-27, antes de chat-1) y pasa hoy:
 *   1. «💬 Chat», y el equipo aparece solo, sin tocar ↻; el número de la
 *      barra, el título de la pestaña y «Clientes (n) · Equipo (n)» suman;
 *      la tarjeta con algo sin leer sale primera; se busca por nombre.
 *   2. El reloj: a la vista 45 s con todo; escondido 60 s SOLO las dos
 *      listas, nunca un hilo; el globo dice «2 de tu equipo»; con la clave
 *      rechazada se detiene y un ↻ bueno lo reanuda.
 *   3. El sonido: solo cuando SUBE el número, con interruptor guardado.
 *   4. La conversación abierta se mueve sola cada 8 s: solo lo nuevo, sin
 *      tocar el cuadro de texto, sin arrastrar a quien lee arriba, nunca
 *      escondida, y muere con el cuadro. También la del equipo, y la del
 *      asesor con Joan en su CRM.
 *   5. «📷» al cliente desde el computador.
 *   6. Cobranzas fuera del horario de la Ley 2300 —domingo, de noche y
 *      festivo— avisa y NO envía; el texto sigue en el cuadro. Servicio sí.
 *   7. Honestidad: la frase del 🔔 y de «Escribirle por la app»; sin
 *      app/chat-vivo.js el CRM anda como antes y no promete de más; sw.js
 *      precarga el módulo nuevo y el CACHE no se tocó (lo sube la integración).
 *
 * chat.js habla con el fetch de NODE (está cargado con require, fuera del
 * banco): se tapa en cada prueba, o la prueba sale a internet.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const CLAVE = 'clave-de-prueba-bien-larga';
const MARTES = '2026-10-27T10:30:00-05:00';        /* hábil, dentro de la ventana */
const DOMINGO_NOCHE = '2026-10-25T23:00:00-05:00';
const FESTIVO = '2026-11-02T10:30:00-05:00';       /* lunes festivo (Todos los Santos) */

const CLIENTES = [
  { cedula: '1010', nombre: 'CLIENTE PRUEBA', celular: '3009998877', sin_leer: 1, ultimo: 'hola', ultimo_de: 'socio',
    ultimo_en: '2026-10-26T15:00:00Z', ultimo_canal: 'servicio', sin_leer_canal: { servicio: 1 } },
  { cedula: '2020', nombre: 'OTRO CLIENTE', celular: '3001112233', sin_leer: 0, ultimo: 'gracias', ultimo_de: 'panel',
    ultimo_en: '2026-10-25T15:00:00Z', ultimo_canal: 'cobranza', sin_leer_canal: {} }
];
const EQUIPO = [
  { cedula: '3001112233', nombre: 'WILLIAM PRUEBA', rol: 'gerente', sin_leer: 2, ultimo: 'Joan, ¿me contestas?',
    ultimo_de: 'socio', ultimo_en: '2026-10-26T15:00:00Z' }
];
const msg = (id, de, texto) => ({ id, de, texto, creado_en: '2026-10-26T15:00:00-05:00', visto: false });

const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))),
  json: () => Promise.resolve(cuerpo) });

/* La nube de mentira, por nombre de función: una respuesta fija o una
   función del cuerpo; lo que no está, 404. Anota cada llamada. */
function nube(o) {
  const vistas = [];
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    const r = o[fn];
    if (r !== undefined) {
      const v = typeof r === 'function' ? r(cuerpo) : r;
      return Promise.resolve(v && v.status ? resp(v.status, v.cuerpo) : resp(200, v));
    }
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { o, red, vistas, de: fn => vistas.filter(v => v.fn === fn), desde: i => vistas.slice(i).map(v => v.fn) };
}

/* El CRM con la nube conectada, el reloj congelado y los relojes de la
   página en la mano. `relojes[ms]` es la función de cada setInterval. */
function montar(opc) {
  opc = opc || {};
  const N = nube(Object.assign({ chat_conversaciones: CLIENTES, equipo_chat_conversaciones: EQUIPO,
    listar_solicitudes_abiertas: [], listar_ayudas_clave: [] }, opc.nube || {}));
  const P = abrirPanel({ red: N.red, ahora: opc.ahora || MARTES, sinChatVivo: !!opc.sinChatVivo });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: CLAVE });
  const relojes = {};
  P.ctx.setInterval = (f, ms) => { relojes[ms] = f; return ms; };
  P.ctx.clearInterval = ms => { delete relojes[ms]; };
  const real = globalThis.fetch;
  globalThis.fetch = (u, c) => N.red(String(u), c);
  const tic = async ms => { assert.ok(relojes[ms], 'no hay reloj de ' + ms + ' ms: ' + Object.keys(relojes)); relojes[ms](); await asentar(); };
  return { P, N, relojes, tic, cerrar: () => { globalThis.fetch = real; } };
}
/* Los elementos se piden por id: el banco los crea al pedirlos, no al pintar un innerHTML. */
const el = (P, id) => P.ctx.document.getElementById(id);
const CRM = leer('panel/crm.html');

/* ========================================================================== */
describe('1. «💬 Chat»: el equipo aparece solo, los números suman y se busca por nombre', () => {

  test('la pestaña se llama Chat, en el CRM de Joan y en el del equipo', () => {
    assert.match(CRM, /<span class="ic">💬<\/span> Chat<span id="navSinLeer">/, 'la barra de Joan sigue diciendo «Mensajes»');
    assert.match(CRM, /<h1>Chat<span class="dot">\.<\/span><\/h1><div class="sub">Lo que te escriben tus clientes y tu equipo/);
    assert.match(CRM, /<span class="ic">💬<\/span> Chat<span id="sinLeerJefe">/, 'el menú del asesor sigue diciendo «Mensajes»');
    assert.match(CRM, /jefe: 'Chat'/, 'el mapa del menú del equipo no conoce «Chat»: el botón no se enciende');
    assert.match(CRM, /<h1>Chat<span class="dot">\.<\/span><\/h1>' \+\s*'<div class="sub">Tu conversación con Joan/);
    assert.doesNotMatch(CRM, /<span class="ic">💬<\/span> Mensajes/, 'queda un botón «💬 Mensajes»');
  });

  test('al entrar a Chat se pide el equipo SIN tocar ↻, y la tarjeta trae a William con su número', async () => {
    const { P, N, cerrar } = montar();
    try {
      P.ev("irA('mensajes')");
      await asentar();
      assert.equal(N.de('equipo_chat_conversaciones').length, 1, 'no preguntó por el equipo al entrar (antes: solo con «↻ Traer de la nube»)');
      assert.match(plano(el(P,'eqBandeja').innerHTML), /WILLIAM PRUEBA/, 'la tarjeta del equipo salió en blanco');
      assert.doesNotMatch(plano(el(P,'eqBandeja').innerHTML), /Toca «↻/);
      assert.match(plano(el(P,'chBandeja').innerHTML), /CLIENTE PRUEBA/);
    } finally { cerrar(); }
  });

  test('el número de la barra suma clientes y equipo, el title lo desglosa, y el título de la pestaña dice «(3) Tu Garantía · Panel»', async () => {
    const { P, cerrar } = montar();
    try {
      P.ev("irA('mensajes')");
      await asentar();
      assert.equal(el(P,'navSinLeer').textContent, ' (3)', 'la barra cuenta solo clientes (1): William escribió dos veces y no se movió');
      assert.match(el(P,'navSinLeer').title, /1 de clientes y 2 de tu equipo/);
      assert.equal(P.ctx.document.title, '(3) Tu Garantía · Panel', 'la pestaña del navegador no dice cuántos hay');
      /* Y renderMensajes solo, que corre en cada render(), no vuelve a dejar el número en (1). */
      P.ev('renderMensajes()');
      assert.equal(el(P,'navSinLeer').textContent, ' (3)', 'un render() cualquiera baja el número a solo clientes');
    } finally { cerrar(); }
  });

  test('arriba, «Clientes (1) · Equipo (2)»; la tarjeta con algo sin leer sale primera', async () => {
    const { P, N, cerrar } = montar();
    try {
      P.ev("irA('mensajes')");
      await asentar();
      assert.match(plano(el(P,'chSegmentos').innerHTML), /Clientes \(1\) · Equipo \(2\)/, 'no se ve de un vistazo dónde hay algo sin leer');
      /* Las dos tienen algo: los clientes arriba, que es a quienes se les debe respuesta. */
      assert.equal(el(P,'chTarjetaClientes').style.order, 0);
      assert.equal(el(P,'chTarjetaEquipo').style.order, 1);
      /* Solo el equipo tiene algo: su tarjeta sube. */
      N.o.chat_conversaciones = CLIENTES.map(c => Object.assign({}, c, { sin_leer: 0, sin_leer_canal: {} }));
      P.ev('traerConversaciones()');
      await asentar();
      assert.match(plano(el(P,'chSegmentos').innerHTML), /Clientes · Equipo \(2\)/);
      assert.equal(el(P,'chTarjetaEquipo').style.order, 0, 'el equipo tiene lo único sin leer y su tarjeta no subió');
      assert.equal(el(P,'chTarjetaClientes').style.order, 1);
      assert.equal(el(P,'navSinLeer').textContent, ' (2)');
      assert.equal(P.ctx.document.title, '(2) Tu Garantía · Panel');
      /* Si falló la pregunta por el equipo, su número es (?), no un cero. */
      N.o.equipo_chat_conversaciones = { status: 500, cuerpo: { message: 'caída' } };
      P.ev('traerChatEquipo(true)');
      await asentar();
      assert.match(plano(el(P,'chSegmentos').innerHTML), /Equipo \(\?\)/);
      assert.equal(el(P,'navSinLeer').textContent, ' (?)');
      assert.equal(P.ctx.document.title, 'Tu Garantía · Panel', 'con la nube fallando dejó un número viejo en la pestaña');
    } finally { cerrar(); }
  });

  test('el buscador filtra las dos listas por nombre, sin tildes, y no le pregunta nada a la nube', async () => {
    const { P, N, cerrar } = montar();
    try {
      P.ev("irA('mensajes')");
      await asentar();
      const antes = N.vistas.length;
      el(P,'chBusca').value = 'WILLI';
      P.ev('renderMensajes(); renderChatEquipo()');
      assert.match(plano(el(P,'eqBandeja').innerHTML), /WILLIAM PRUEBA/);
      assert.match(plano(el(P,'chBandeja').innerHTML), /Ningún cliente se llama así/);
      assert.doesNotMatch(plano(el(P,'chBandeja').innerHTML), /CLIENTE PRUEBA/);
      el(P,'chBusca').value = 'cliénte';
      P.ev('renderMensajes(); renderChatEquipo()');
      assert.match(plano(el(P,'chBandeja').innerHTML), /CLIENTE PRUEBA.*OTRO CLIENTE|OTRO CLIENTE.*CLIENTE PRUEBA/);
      assert.match(plano(el(P,'eqBandeja').innerHTML), /Nadie de tu equipo se llama así/);
      el(P,'chBusca').value = '';
      P.ev('renderMensajes(); renderChatEquipo()');
      assert.match(plano(el(P,'eqBandeja').innerHTML), /WILLIAM PRUEBA/);
      assert.equal(N.vistas.length, antes, 'buscar le preguntó a la nube');
      /* El número de la barra no cambia por buscar: lo sin leer sigue ahí. */
      assert.equal(el(P,'navSinLeer').textContent, ' (3)');
    } finally { cerrar(); }
  });
});

/* ========================================================================== */
describe('2. el reloj: 45 s a la vista con todo, 60 s escondido solo las listas, y se detiene con la clave', () => {

  test('a la vista, la vuelta de 45 s pide las dos listas del chat (y lo demás); el de 60 s no trabaja', async () => {
    const { P, N, tic, relojes, cerrar } = montar();
    try {
      P.ev('_reloj = null; vigilarPendientes(true)');
      assert.deepEqual(Object.keys(relojes).map(Number).sort(), [45000, 60000], 'no son dos relojes (45 s a la vista, 60 s escondido)');
      const i = N.vistas.length;
      await tic(60000);
      assert.deepEqual(N.desde(i), [], 'el reloj de 60 s trabajó con la pestaña a la vista');
      await tic(45000);
      const vuelta = N.desde(i);
      ['chat_conversaciones', 'equipo_chat_conversaciones', 'listar_solicitudes_abiertas', 'listar_ayudas_clave']
        .forEach(fn => assert.ok(vuelta.includes(fn), 'la vuelta a la vista no pidió ' + fn + ': ' + vuelta.join(',')));
    } finally { cerrar(); }
  });

  test('ESCONDIDO: cada minuto SOLO las dos listas, nunca un hilo; y el globo dice «2 de tu equipo»', async () => {
    const { P, N, tic, cerrar } = montar();
    try {
      const globos = [];
      P.ctx.Notification = class { constructor(t, o) { this.body = o && o.body; globos.push(this); } close() {} };
      P.ctx.Notification.permission = 'granted';
      P.ev('_vistos = { mensajes: 0, solicitudes: 0, ayudas: 0, equipo: 0 }; _reloj = null; vigilarPendientes(true)');
      /* Abre una conversación y la deja abierta: escondido, ni ese hilo se pide. */
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirConversacion('1010')"); await asentar();
      globos.length = 0;
      P.ctx.document.hidden = true;
      const i = N.vistas.length;
      await tic(45000);
      assert.deepEqual(N.desde(i), [], 'el reloj de 45 s trabajó escondido');
      N.o.equipo_chat_conversaciones = [Object.assign({}, EQUIPO[0], { sin_leer: 4 })];
      await tic(60000);
      const vuelta = N.desde(i);
      assert.deepEqual([...new Set(vuelta)].sort(), ['chat_conversaciones', 'equipo_chat_conversaciones'],
        'escondido pidió otra cosa que las dos listas: ' + vuelta.join(','));
      assert.ok(!vuelta.includes('chat_de'), 'escondido pidió el hilo abierto: lo marcaría «Lo vio» sin que Joan lo mire');
      assert.equal(globos.length, 1, 'llegaron 2 del equipo con el CRM escondido y no salió el globo');
      assert.match(globos[0].body, /2 de tu equipo/, 'el globo no dice que es del equipo: ' + globos[0].body);
      /* La misma vuelta otra vez, sin nada nuevo: ningún globo más. */
      await tic(60000);
      assert.equal(globos.length, 1, 'repitió el globo con lo mismo');
    } finally { cerrar(); }
  });

  test('con la clave rechazada el reloj se DETIENE (también escondido); un ↻ que sale bien lo reanuda', async () => {
    const { P, N, tic, cerrar } = montar();
    try {
      P.ev('_reloj = null; vigilarPendientes(true)');
      N.o.chat_conversaciones = { status: 400, cuerpo: { message: 'clave incorrecta' } };
      P.ctx.document.hidden = true;
      await tic(60000);
      assert.equal(P.ev('_reloj.estado().vivo'), false, 'siguió preguntando con la clave mala: cada vuelta arma el freno para todos');
      assert.equal(P.ev('_reloj.estado().parado'), 'clave');
      const i = N.vistas.length;
      await tic(60000).catch(() => {});
      assert.equal(N.vistas.length, i, 'parado, siguió pidiendo');
      assert.equal(el(P,'navSinLeer').textContent, ' (?)');
      /* Joan corrige la clave en Ajustes y toca ↻: vuelve a andar. */
      N.o.chat_conversaciones = CLIENTES;
      P.ev('traerConversaciones()');
      await asentar();
      assert.equal(P.ev('_reloj.estado().vivo'), true, 'un ↻ bueno no reanudó el reloj');
      /* Y el equipo con la clave mala también lo para (rpc() lo dice en la frase). */
      N.o.equipo_chat_conversaciones = { status: 400, cuerpo: { message: 'clave incorrecta' } };
      P.ev('traerChatEquipo(true)');
      await asentar();
      assert.equal(P.ev('_reloj.estado().parado'), 'clave');
    } finally { cerrar(); }
  });

  test('escondido NO mira solicitudes ni recados (a propósito: la cuota), y el 🔔, el pie y el rótulo del sonido lo dicen', async () => {
    /* 26-oct-2026 — hallazgo del 26-oct: la frase nueva del 🔔 prometía «en
       otra pestaña o minimizado, reviso cada minuto y te aviso solo si llegó
       algo», y «algo» es lo que ese globo avisa desde el 22-sep: también las
       solicitudes de crédito y los recados de «Olvidé mi contraseña».
       Escondido el reloj pide SOLO las dos listas del chat (vueltaDelReloj),
       así que una solicitud no daba globo ni movía «Socios (n)» hasta
       volver. El comportamiento se queda (PLAN del chat, §9: la cuota); la
       frase dice la verdad. Sin mensajes del chat, para que el único globo
       posible sea el de la solicitud. */
    const { P, N, tic, cerrar } = montar({ nube: { chat_conversaciones: [], equipo_chat_conversaciones: [] } });
    try {
      const globos = [];
      P.ctx.Notification = class { constructor(t, o) { this.body = o && o.body; globos.push(this); } close() {} };
      P.ctx.Notification.permission = 'granted';
      P.ev('_vistos = { mensajes: 0, solicitudes: 0, ayudas: 0, equipo: 0 }; _reloj = null; vigilarPendientes(true); renderAvisoBoton(); pintarAvisos();');
      const boton = plano(el(P,'avisoBoton').innerHTML), pie = plano(el(P,'avisoPie').innerHTML);
      assert.match(boton, /En otra pestaña o minimizado reviso solo el chat/, 'el 🔔 promete avisar de «algo» escondido, y escondido solo se mira el chat: ' + boton);
      assert.match(boton, /solicitudes de crédito y los recados[^.]*al volver/, 'el 🔔 no dice que las solicitudes y los recados se ven al volver: ' + boton);
      assert.doesNotMatch(boton, /te aviso solo si llegó algo/);
      assert.match(pie, /en otra pestaña o minimizada, cada minuto y solo el chat\. Cerrada, no/, 'el pie no dice «solo el chat»: ' + pie);
      assert.match(boton, /Un toque corto cuando llega algo nuevo\./, 'el rótulo del sonido dice «del chat», y a la vista suena también por una solicitud');
      /* Y eso es lo que pasa: Joan minimiza Chrome; un cliente pide un crédito y otro manda un recado. */
      globos.length = 0;
      P.ctx.document.hidden = true;
      N.o.listar_solicitudes_abiertas = [{ id: 1, estado: 'nueva', nombre: 'CLIENTE NUEVO', monto: 200000, creado_en: '2026-10-27T15:31:00Z' }];
      N.o.listar_ayudas_clave = [{ id: 7, telefono: '3005556677', creado_en: '2026-10-27T15:32:00Z' }];
      const i = N.vistas.length;
      for (let k = 0; k < 10; k++) await tic(60000);
      assert.deepEqual([...new Set(N.desde(i))].sort(), ['chat_conversaciones', 'equipo_chat_conversaciones'], 'escondido pidió otra cosa: ' + N.desde(i).join(','));
      assert.equal(globos.length, 0, 'escondido salió un globo por la solicitud: entonces la frase vieja era verdad y esta prueba sobra');
      assert.equal(el(P,'navSolicitudes').textContent, '', 'escondido se movió «Socios (n)» sin haber preguntado');
      /* Al volver, la vuelta de 45 s a la vista sí las trae, y entonces sale el globo. */
      P.ctx.document.hidden = false;
      await tic(45000);
      assert.ok(globos.some(g => /solicitud\(es\) de crédito/.test(g.body)), 'al volver no avisó de la solicitud: ' + globos.map(g => g.body).join(' | '));
      assert.equal(el(P,'navSolicitudes').textContent, ' (2)');
    } finally { cerrar(); }
  });

  test('parado por la clave: el 🔔 y el pie lo dicen; «Guardar conexión» lo reanuda y «Probar conexión» ✅ pregunta ya, sin entrar a Chat', async () => {
    /* 26-oct-2026 — hallazgo del 26-oct: el único reanudar vivía en
       traerConversaciones, o sea en la vista Chat. Joan arreglaba la clave
       en Ajustes, «Probar conexión» decía ✅, se iba a Socios y nada volvía
       a preguntar —ni solicitudes, ni recados, ni el chat— con el 🔔
       diciendo «✅ Te aviso…». Antes de chat-1 el setInterval no se detenía
       nunca y 45 s después de arreglarla todo volvía solo. */
    const { P, N, tic, cerrar } = montar();
    const LISTAS = ['chat_conversaciones', 'equipo_chat_conversaciones', 'listar_solicitudes_abiertas', 'listar_ayudas_clave'];
    const MAL = { status: 400, cuerpo: { message: 'clave incorrecta' } };
    const buena = () => { N.o.chat_conversaciones = CLIENTES; N.o.equipo_chat_conversaciones = EQUIPO; N.o.listar_solicitudes_abiertas = []; N.o.listar_ayudas_clave = []; };
    try {
      P.ctx.Notification = { permission: 'granted' };
      P.ev('_reloj = null; vigilarPendientes(true); renderAvisoBoton(); pintarAvisos();');
      assert.match(plano(el(P,'avisoBoton').innerHTML), /✅ Te aviso con un globo/);
      LISTAS.forEach(f => { N.o[f] = MAL; });
      await tic(45000);
      assert.equal(P.ev('_reloj.estado().parado'), 'clave');
      /* Mientras está parado, la verdad, sin esperar a un render(): nada de «✅ Te aviso». */
      const boton = plano(el(P,'avisoBoton').innerHTML), pie = plano(el(P,'avisoPie').innerHTML);
      assert.doesNotMatch(boton, /✅ Te aviso/, 'parado por la clave, el 🔔 sigue prometiendo el globo: ' + boton);
      assert.match(boton, /no aceptó tu clave de sincronización/, boton);
      assert.match(boton, /Ajustes/, 'no dice dónde arreglarla');
      assert.match(pie, /Dejé de preguntar/, pie);
      assert.match(pie, /no aceptó tu clave/);
      /* Joan pega la clave nueva en Ajustes y toca «Guardar conexión»; la nube la acepta. Nunca entra a Chat. */
      buena();
      el(P,'cfgSbUrl').value = 'https://prueba.supabase.co'; el(P,'cfgSbAnon').value = 'anon'; el(P,'cfgSbClave').value = CLAVE + '-nueva';
      P.ev('guardarSupabase()');
      assert.equal(P.ev('_reloj.estado().vivo'), true, 'guardó la clave nueva y el reloj siguió muerto: solo revivía al entrar a Chat');
      assert.match(plano(el(P,'avisoBoton').innerHTML), /✅ Te aviso con un globo/, 'reanudado, el 🔔 sigue diciendo que está parado');
      const i = N.vistas.length;
      await tic(45000);
      LISTAS.forEach(fn => assert.ok(N.desde(i).includes(fn), 'la vuelta después de guardar no pidió ' + fn + ': ' + N.desde(i).join(',')));
      assert.equal(el(P,'navSinLeer').textContent, ' (3)', 'la barra se quedó vieja');
      /* Parado otra vez; esta vez Joan toca «🔌 Probar conexión»: con el ✅ pregunta ya, sin esperar los 45 s. */
      LISTAS.forEach(f => { N.o[f] = MAL; });
      await tic(45000);
      assert.equal(P.ev('_reloj.estado().parado'), 'clave');
      buena();
      N.o.sincronizar_socios = { ok: true }; N.o.vinculos_listar = [];
      const j = N.vistas.length;
      P.ev('probarSupabase()'); await asentar(16);
      assert.match(plano(el(P,'sbEstado').innerHTML), /Todo listo/, 'el caso de prueba no llegó al ✅: ' + plano(el(P,'sbEstado').innerHTML));
      assert.equal(P.ev('_reloj.estado().vivo'), true, 'Probar conexión dijo ✅ y el reloj siguió muerto');
      assert.ok(N.desde(j).includes('chat_conversaciones') && N.desde(j).includes('listar_solicitudes_abiertas'), 'con el ✅ no preguntó ya: ' + N.desde(j).join(','));
      /* El 'apagado' a propósito no se toca: guardar la conexión no enciende un reloj que no existe. */
      P.ev('vigilarPendientes(false); guardarSupabase()');
      assert.equal(P.ev('_reloj'), null);
    } finally { cerrar(); }
  });
});

/* ========================================================================== */
describe('3. el sonido: solo cuando sube el número, con interruptor', () => {

  function audio(P) {
    const sonados = [];
    P.ctx.AudioContext = class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      createOscillator() { return { type: '', frequency: {}, connect() {}, start() { sonados.push(1); }, stop() {} }; }
      createGain() { return { gain: { value: 0, exponentialRampToValueAtTime() {} }, connect() {} }; }
    };
    return sonados;
  }

  test('suena una vez cuando sube, no en cada vuelta, y el botón lo apaga y lo guarda', async () => {
    const { P, cerrar } = montar();
    try {
      const sonados = audio(P);
      /* El timbre con un reloj en la mano: el de verdad no deja sonar dos
         veces en 1,5 s, y acá todo pasa en el mismo milisegundo. */
      P.ev('window.__t = 1000; _timbre = ChatVivo.timbre({ almacen: localStorage, crear: function () { return new AudioContext(); }, ahora: function () { return window.__t; } });');
      P.ev('_vistos = { mensajes: 0, solicitudes: 0, ayudas: 0, equipo: 0 }');
      P.ev("irA('mensajes')"); await asentar();
      assert.equal(sonados.length, 1, 'llegó algo nuevo (1 de clientes, 2 del equipo, en la misma vuelta) y sonó ' + sonados.length + ' veces: tiene que ser UN toque');
      P.ev('window.__t += 5000');
      P.ev('pintarAvisos()');
      assert.equal(sonados.length, 1, 'sonó otra vez con lo mismo: Joan lo apaga el primer día');
      P.ev('renderAvisoBoton()');
      assert.match(plano(el(P,'avisoBoton').innerHTML), /🔔 Sonido encendido · apagarlo/, 'no hay con qué apagarlo');
      P.ev('alternarSonidoChat()');
      assert.equal(P.almacen.joan_chat_sonido, 'apagado', 'el interruptor no quedó guardado en el navegador');
      assert.match(plano(el(P,'avisoBoton').innerHTML), /🔕 Sonido apagado · encenderlo/);
      P.ev('_vistos = { mensajes: 0, solicitudes: 0, ayudas: 0, equipo: 0 }; pintarAvisos()');
      assert.equal(sonados.length, 1, 'apagado, sonó');
      P.ev('alternarSonidoChat(); window.__t += 5000');
      P.ev('_vistos = { mensajes: 0, solicitudes: 0, ayudas: 0, equipo: 0 }; pintarAvisos()');
      assert.equal(sonados.length, 2, 'encendido otra vez, no volvió a sonar');
    } finally { cerrar(); }
  });

  test('sin app/chat-vivo.js no se ofrece el sonido, y nada suena', async () => {
    const { P, cerrar } = montar({ sinChatVivo: true });
    try {
      const sonados = audio(P);
      P.ev("irA('mensajes')"); await asentar();
      P.ev('renderAvisoBoton()');
      assert.doesNotMatch(plano(el(P,'avisoBoton').innerHTML), /Sonido/);
      assert.equal(sonados.length, 0);
    } finally { cerrar(); }
  });
});

/* ========================================================================== */
describe('4. la conversación abierta se mueve sola', () => {

  function conHilo(extra) {
    const hilo = { 1010: { servicio: [msg(1, 'socio', 'hola')], cobranza: [] } };
    const M = montar(Object.assign({ nube: {
      chat_de: c => (hilo[c.p_cedula] && hilo[c.p_cedula][c.p_canal] || []).filter(x => x.id > (c.p_desde || 0)),
      chat_responder: () => 9,
      chat_foto_responder: { ok: true, id: 10 }
    } }, extra || {}));
    return Object.assign(M, { hilo });
  }

  test('cada 8 s pide SOLO lo nuevo desde el último id y lo pinta sin tocar el cuadro de texto', async () => {
    const M = conHilo();
    const { P, N, tic, cerrar, hilo } = M;
    try {
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirConversacion('1010')"); await asentar();
      assert.equal(N.de('chat_de').length, 1);
      assert.equal(N.de('chat_de')[0].cuerpo.p_desde, 0);
      assert.match(plano(el(P,'chHilo').innerHTML), /hola/);
      assert.ok(M.relojes[8000], 'no hay reloj de 8 s para el hilo abierto: ' + Object.keys(M.relojes));
      el(P,'chResp').value = 'estoy escribiendo…';
      hilo[1010].servicio.push(msg(2, 'socio', 'y otra cosa'));
      await tic(8000);
      assert.equal(N.de('chat_de').length, 2, 'el reloj no pidió el hilo');
      assert.equal(N.de('chat_de')[1].cuerpo.p_desde, 1, 'pidió el hilo entero en vez de lo nuevo');
      assert.equal(N.de('chat_de')[1].cuerpo.p_canal, 'servicio');
      assert.match(plano(el(P,'chHilo').innerHTML), /hola.*y otra cosa/, 'lo nuevo no se pintó');
      assert.equal(el(P,'chResp').value, 'estoy escribiendo…', 'repintó el cuadro de texto: se llevó lo que Joan escribía');
      /* Sin nada nuevo, no repinta (la caja queda tal cual). */
      el(P,'chHilo').innerHTML = 'MARCA';
      await tic(8000);
      assert.equal(el(P,'chHilo').innerHTML, 'MARCA', 'repintó el hilo sin que llegara nada');
    } finally { cerrar(); }
  });

  test('escondido NO pide el hilo (lo marcaría «Lo vio»); al cerrar el cuadro, el reloj muere; al cambiar de pestaña, pide el otro canal', async () => {
    const M = conHilo();
    const { P, N, tic, cerrar } = M;
    try {
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirConversacion('1010')"); await asentar();
      P.ctx.document.hidden = true;
      await tic(8000);
      assert.equal(N.de('chat_de').length, 1, 'pidió el hilo con el CRM escondido');
      P.ctx.document.hidden = false;
      P.ev("cambiarCanalChat('cobranza')"); await asentar();
      assert.equal(N.de('chat_de').length, 2);
      assert.equal(N.de('chat_de')[1].cuerpo.p_canal, 'cobranza');
      assert.equal(N.de('chat_de')[1].cuerpo.p_desde, 0, 'al cambiar de canal pidió desde el último id del otro canal');
      P.ev('cerrarModal()');
      assert.equal(P.ev('_hiloVivo'), null, 'cerrar el cuadro no paró el reloj del hilo');
      const n = N.de('chat_de').length;
      if (M.relojes[8000]) { await tic(8000); }
      assert.equal(N.de('chat_de').length, n, 'cerrado el cuadro, siguió pidiendo el hilo');
    } finally { cerrar(); }
  });

  test('no arrastra la pantalla si Joan lee arriba; lo que manda él sí baja, y el texto solo se borra cuando la nube dijo que sí', async () => {
    const M = conHilo();
    const { P, N, tic, cerrar, hilo } = M;
    try {
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirConversacion('1010')"); await asentar();
      const caja = el(P,'chHilo');
      caja.scrollHeight = 1000; caja.clientHeight = 300; caja.scrollTop = 100;   /* leyendo arriba */
      hilo[1010].servicio.push(msg(2, 'socio', 'más'));
      await tic(8000);
      assert.equal(caja.scrollTop, 100, 'le arrastró la pantalla a Joan, que estaba leyendo arriba');
      /* Manda: la nube dice que sí (id 9), el cuadro se vacía y el hilo baja. */
      el(P,'chResp').value = 'respuesta';
      hilo[1010].servicio.push(msg(9, 'panel', 'respuesta'));
      P.ev('responderChat()'); await asentar();
      assert.equal(N.de('chat_responder').length, 1);
      assert.equal(N.de('chat_responder')[0].cuerpo.p_canal, 'servicio');
      assert.equal(el(P,'chResp').value, '', 'enviado y el cuadro no se vació');
      assert.equal(caja.scrollTop, 1000, 'lo que acaba de mandar no bajó a verse');
      /* Manda y la nube dice que no: el texto SIGUE en el cuadro y se dice. */
      N.o.chat_responder = { status: 500, cuerpo: { message: 'caída' } };
      el(P,'chResp').value = 'otra';
      P.ev('responderChat()'); await asentar();
      assert.equal(el(P,'chResp').value, 'otra', 'falló el envío y el texto se perdió');
      assert.equal(el(P,'chErr').hidden, false);
      assert.match(el(P,'chErr').textContent, /El texto sigue en el cuadro/);
      assert.equal((P.ctx._avisos || []).length, 0, 'lo dijo con un alert en vez de al lado del cuadro');
    } finally { cerrar(); }
  });

  test('el hilo con la persona del equipo también se mueve solo, y lo que llega baja el número de la barra', async () => {
    const eq = [msg(1, 'socio', 'Joan, ¿me contestas?'), msg(2, 'socio', '¿estás?')];
    const M = montar({ nube: { equipo_chat_de: c => eq.filter(x => x.id > (c.p_desde || 0)) } });
    const { P, N, tic, cerrar } = M;
    try {
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirChatEquipo('3001112233')"); await asentar();
      assert.equal(N.de('equipo_chat_de').length, 1);
      assert.match(plano(el(P,'eqHilo').innerHTML), /me contestas.*estás/);
      el(P,'eqTxt').value = 'escribiendo al equipo';
      eq.push(msg(3, 'socio', 'ya vi'));
      await tic(8000);
      assert.equal(N.de('equipo_chat_de').length, 2);
      assert.equal(N.de('equipo_chat_de')[1].cuerpo.p_desde, 2, 'pidió el hilo del equipo entero en vez de lo nuevo');
      assert.match(plano(el(P,'eqHilo').innerHTML), /ya vi/);
      assert.equal(el(P,'eqTxt').value, 'escribiendo al equipo', 'repintó el cuadro de texto del equipo');
      /* La base ya lo marcó visto: el número de la barra baja sin otra pregunta (1 de clientes queda). */
      assert.equal(el(P,'navSinLeer').textContent, ' (1)', 'lo que Joan acaba de ver sigue contando como sin leer');
      P.ev('cerrarModal()');
      assert.equal(P.ev('_hiloEquipoVivo'), null);
    } finally { cerrar(); }
  });

  test('el asesor en su CRM: su hilo con Joan se mueve solo mientras esa pestaña está abierta, y se para al salir de ella', async () => {
    const { P, tic, relojes, cerrar } = montar();
    try {
      P.ev('window.__eq = []; rpcEquipo = function (fn, c) { window.__eq.push({ fn: fn, c: c }); return Promise.resolve({ ok: true, status: 200, j: { ok: true, mensajes: [' +
        JSON.stringify(msg(5, 'panel', 'hola William')) + '] } }); };');
      P.ev("VISTA_EQUIPO = 'jefe'; _jefeMsgs = [" + JSON.stringify(msg(3, 'socio', '¿jefe?')) + "]; _jefeUltimo = 3; vigilarHiloJefe();");
      assert.ok(relojes[8000], 'el hilo del asesor no tiene reloj');
      assert.equal(P.ev('window.__eq.length'), 0, 'arrancó pidiendo el hilo entero otra vez');
      el(P,'txtJefe').value = 'le escribo a Joan';
      await tic(8000);
      assert.equal(P.ev('window.__eq.length'), 1);
      assert.equal(P.ev('window.__eq[0].fn'), 'equipo_chat_leer');
      assert.equal(P.ev('window.__eq[0].c.p_desde'), 3, 'pidió desde cero: equipo_chat_leer marca visto todo, pero el asesor lo está mirando; lo que no puede es bajar el hilo entero cada 8 s');
      assert.match(plano(el(P,'hiloJefe').innerHTML), /jefe\?.*hola William/);
      assert.equal(el(P,'txtJefe').value, 'le escribo a Joan');
      /* Sale de la pestaña: el reloj se para (irEquipo), o si no, la caja ya no es suya y se para solo. */
      P.ev("irEquipo('tablero')");
      assert.equal(P.ev('_jefeVivo'), null, 'salió de la pestaña y el reloj siguió marcando visto');
    } finally { cerrar(); }
  });

  test('la puerta de la sesión (24 h, «Salir ahora») mata el reloj del hilo abierto; con el PIN vuelve desde el último id', async () => {
    /* 26-oct-2026 — hallazgo del 26-oct: pedirEntrarOtraVez solo tapa (#gate
       encima, inert debajo) y la conversación abierta seguía pidiendo chat_de
       cada 8 s con la pestaña a la vista. chat_de marca «visto» lo que
       devuelve: el cliente veía «Lo vio» en lo que escribió mientras Joan
       solo tenía delante el campo del PIN, o ya se había ido con «Salir
       ahora». Antes de chat-1 el hilo no tenía reloj. */
    const hilo = { 1010: { servicio: [msg(1, 'socio', 'hola')], cobranza: [] } };
    const eq = [msg(1, 'socio', 'Joan, ¿me contestas?')];
    const M = montar({ nube: {
      chat_de: c => (hilo[c.p_cedula] && hilo[c.p_cedula][c.p_canal] || []).filter(x => x.id > (c.p_desde || 0)),
      equipo_chat_de: c => eq.filter(x => x.id > (c.p_desde || 0))
    } });
    const { P, N, tic, cerrar } = M;
    const vencida = () => P.ev("_crmAbierto = true; _sesion = { v: 1, tipo: 'dueno', id: 'x', desde: 1, hasta: 2, guardada: false }; vigilarSesion();");
    const conPin = () => { el(P,'pinInput').value = '1234'; P.ev('entrar()'); };
    try {
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirConversacion('1010')"); await asentar();
      assert.equal(N.de('chat_de').length, 1);
      assert.ok(M.relojes[8000]);
      /* Pasan las 24 h: el reloj de 30 s pone la puerta sin que nadie toque. */
      vencida();
      assert.equal(P.ev('_candado'), true, 'el caso de prueba no puso la puerta');
      assert.match(el(P,'pinErr').textContent, /Pasaron 24 horas/);
      assert.equal(P.ev('_hiloVivo'), null, 'con la puerta encima el reloj del hilo sigue vivo');
      assert.equal(M.relojes[8000], undefined, 'con la puerta encima el reloj de 8 s sigue armado');
      /* El cliente escribe mientras la puerta tapa la pantalla: nadie lo pide, nadie lo marca «visto». */
      hilo[1010].servicio.push(msg(2, 'socio', 'ya pagué, ¿lo viste?'));
      if (M.relojes[8000]) await tic(8000);
      await asentar();
      assert.equal(N.de('chat_de').length, 1, 'bajo la puerta pidió chat_de: marcó «Lo vio» lo que nadie mira');
      assert.doesNotMatch(plano(el(P,'chHilo').innerHTML), /ya pagué/);
      /* Joan escribe el PIN: solo se quita la puerta, y el hilo vuelve a moverse desde donde iba, no desde cero. */
      conPin(); await asentar();
      assert.equal(P.ev('_candado'), false);
      assert.ok(M.relojes[8000], 'quitada la puerta, el hilo abierto no volvió a moverse solo');
      assert.equal(N.de('chat_de').length, 2, 'al volver no pidió lo nuevo');
      assert.equal(N.de('chat_de')[1].cuerpo.p_desde, 1, 'al volver pidió el hilo entero en vez de lo nuevo');
      assert.match(plano(el(P,'chHilo').innerHTML), /hola.*ya pagué/, 'lo que llegó bajo la puerta no se pintó al volver');
      el(P,'chResp').value = 'lo estoy mirando';
      hilo[1010].servicio.push(msg(3, 'socio', 'gracias'));
      await tic(8000);
      assert.match(plano(el(P,'chHilo').innerHTML), /gracias/);
      assert.equal(el(P,'chResp').value, 'lo estoy mirando');
      /* «Salir ahora» con la conversación abierta: lo mismo. */
      P.ev('salirAhora()'); await asentar();
      assert.equal(P.ev('_candado'), true);
      assert.match(el(P,'pinErr').textContent, /Cerraste la sesión/);
      assert.equal(P.ev('_hiloVivo'), null, 'tras «Salir ahora» el hilo sigue pidiendo');
      assert.equal(M.relojes[8000], undefined);
      hilo[1010].servicio.push(msg(4, 'socio', '¿sigues?'));
      conPin(); await asentar();
      assert.equal(N.de('chat_de')[N.de('chat_de').length - 1].cuerpo.p_desde, 3);
      assert.match(plano(el(P,'chHilo').innerHTML), /sigues/);
      /* Y el hilo del equipo, igual: muere con la puerta y vuelve con el PIN desde el último id. */
      P.ev('cerrarModal()');
      P.ev("abrirChatEquipo('3001112233')"); await asentar();
      assert.equal(N.de('equipo_chat_de').length, 1);
      vencida();
      assert.equal(P.ev('_hiloEquipoVivo'), null, 'con la puerta encima el hilo del equipo sigue vivo');
      assert.equal(M.relojes[8000], undefined);
      eq.push(msg(2, 'socio', '¿estás?'));
      conPin(); await asentar();
      assert.ok(M.relojes[8000], 'quitada la puerta, el hilo del equipo no volvió a moverse solo');
      assert.equal(N.de('equipo_chat_de').length, 2);
      assert.equal(N.de('equipo_chat_de')[1].cuerpo.p_desde, 1);
      assert.match(plano(el(P,'eqHilo').innerHTML), /me contestas.*estás/);
      /* Cerrado el cuadro, una puerta nueva no revive nada. */
      P.ev('cerrarModal()');
      vencida(); conPin(); await asentar();
      assert.equal(P.ev('_hiloVivo'), null);
      assert.equal(P.ev('_hiloEquipoVivo'), null);
      assert.equal(M.relojes[8000], undefined, 'con el cuadro cerrado, la puerta armó un reloj del hilo');
    } finally { cerrar(); }
  });
});

/* ========================================================================== */
describe('5. «📷» al cliente desde el computador', () => {

  test('el cuadro tiene el botón, manda la foto comprimida por el canal abierto con el pie del cuadro, y limpia solo si la nube dijo que sí', async () => {
    const M = montar({ nube: { chat_de: [], chat_foto_responder: { ok: true, id: 10 } } });
    const { P, N, cerrar } = M;
    try {
      P.ev("irA('mensajes')"); await asentar();
      P.ev("abrirConversacion('1010')"); await asentar();
      assert.match(el(P,'mBody').innerHTML, /id="chFoto"[^>]*accept="image\/\*"/, 'Joan no tiene por dónde mandar una foto desde el computador');
      assert.match(plano(el(P,'mBody').innerHTML), /📷 Mandar una foto/);
      P.ev('prepararFotoChat = function () { return Promise.resolve({ grande: "data:image/jpeg;base64,AAAA", chica: "data:image/jpeg;base64,BBBB" }); }');
      el(P,'chResp').value = 'mira esto';
      P.ev('mandarFotoAlCliente({ files: [{ type: "image/jpeg", name: "f.jpg" }], value: "x" })');
      await asentar();
      const f = N.de('chat_foto_responder');
      assert.equal(f.length, 1, 'no se llamó chat_foto_responder');
      assert.equal(f[0].cuerpo.p_cedula, '1010');
      assert.equal(f[0].cuerpo.p_canal, 'servicio', 'la foto no va por el canal de la pestaña abierta');
      assert.equal(f[0].cuerpo.p_imagen, 'data:image/jpeg;base64,AAAA');
      assert.equal(f[0].cuerpo.p_miniatura, 'data:image/jpeg;base64,BBBB');
      assert.equal(f[0].cuerpo.p_texto, 'mira esto', 'el pie no viajó con la foto');
      assert.equal(el(P,'chResp').value, '', 'mandada y el pie sigue en el cuadro');
      assert.equal(el(P,'chErr').hidden, true);
      /* La nube dice «lleno»: se dice, y el pie sigue en el cuadro. */
      N.o.chat_foto_responder = { ok: false, motivo: 'lleno' };
      el(P,'chResp').value = 'otra';
      P.ev('mandarFotoAlCliente({ files: [{ type: "image/jpeg" }], value: "x" })');
      await asentar();
      assert.match(el(P,'chErr').textContent, /lleno/);
      assert.equal(el(P,'chResp').value, 'otra');
      /* Un video se ataja antes de preparar nada. */
      P.ev('mandarFotoAlCliente({ files: [{ type: "video/mp4" }], value: "x" })');
      await asentar();
      assert.match(el(P,'chErr').textContent, /Solo fotos: un video no cabe/);
      assert.equal(N.de('chat_foto_responder').length, 2);
    } finally { cerrar(); }
  });
});

/* ========================================================================== */
describe('6. Cobranzas fuera del horario de la Ley 2300: avisa y no envía', () => {

  function abrirCobranza(ahora) {
    const M = montar({ ahora, nube: { chat_de: [], chat_responder: () => 9, chat_foto_responder: { ok: true, id: 10 } } });
    M.P.ev("irA('mensajes')");
    return M;
  }

  test('domingo a las 23:00: el cuadro lo dice al abrir en Cobranzas, Enviar no manda y el texto sigue', async () => {
    const { P, N, cerrar } = abrirCobranza(DOMINGO_NOCHE);
    try {
      await asentar();
      P.ev("abrirConversacion('2020')"); await asentar();     /* su último canal es cobranza */
      assert.equal(P.ev('_chatCanal'), 'cobranza');
      assert.match(plano(el(P,'chCandado').innerHTML), /domingo/i, 'abrió en Cobranzas un domingo y no avisó');
      assert.match(plano(el(P,'chCandado').innerHTML), /Por Cobranzas no sale nada hasta el horario de la ley/);
      el(P,'chResp').value = 'paga hoy';
      P.ev('responderChat()'); await asentar();
      assert.equal(N.de('chat_responder').length, 0, 'MANDÓ un cobro un domingo a las 23:00: la multa le cae a Joan');
      assert.match(el(P,'chErr').textContent, /domingo/i);
      assert.match(el(P,'chErr').textContent, /No se envió/);
      assert.equal(el(P,'chResp').value, 'paga hoy', 'no se envió y el texto se perdió');
      /* La foto, tampoco. */
      P.ev('prepararFotoChat = function () { return Promise.resolve({ grande: "data:image/jpeg;base64,AAAA", chica: null }); }');
      P.ev('mandarFotoAlCliente({ files: [{ type: "image/jpeg" }], value: "x" })'); await asentar();
      assert.equal(N.de('chat_foto_responder').length, 0, 'mandó una foto de cobro un domingo');
      assert.match(el(P,'chErr').textContent, /La foto no se mandó/);
      /* Por Servicio, el mismo domingo, sí: vender y atender no tienen ventana legal. */
      P.ev("cambiarCanalChat('servicio')"); await asentar();
      assert.equal(plano(el(P,'chCandado').innerHTML), '');
      el(P,'chResp').value = 'claro, te explico';
      P.ev('responderChat()'); await asentar();
      assert.equal(N.de('chat_responder').length, 1);
      assert.equal(N.de('chat_responder')[0].cuerpo.p_canal, 'servicio');
    } finally { cerrar(); }
  });

  test('el 2 de noviembre (lunes festivo) a las 10:30, tampoco; el martes 27 a las 10:30, sí', async () => {
    const A = abrirCobranza(FESTIVO);
    try {
      await asentar();
      A.P.ev("abrirConversacion('2020')"); await asentar();
      assert.match(plano(el(A.P,'chCandado').innerHTML), /festivo/i, 'un festivo en horario hábil pasó como día de cobro');
      el(A.P,'chResp').value = 'paga';
      A.P.ev('responderChat()'); await asentar();
      assert.equal(A.N.de('chat_responder').length, 0);
      assert.match(el(A.P,'chErr').textContent, /festivo/i);
    } finally { A.cerrar(); }
    const B = abrirCobranza(MARTES);
    try {
      await asentar();
      B.P.ev("abrirConversacion('2020')"); await asentar();
      assert.equal(plano(el(B.P,'chCandado').innerHTML), '', 'martes a las 10:30 y el cuadro dice que no se puede');
      el(B.P,'chResp').value = 'te recuerdo tu pago';
      B.P.ev('responderChat()'); await asentar();
      assert.equal(B.N.de('chat_responder').length, 1, 'en horario hábil no dejó cobrar');
      assert.equal(B.N.de('chat_responder')[0].cuerpo.p_canal, 'cobranza');
    } finally { B.cerrar(); }
  });

  test('el candado reutiliza el horario que el CRM ya carga, no otro escrito a mano', () => {
    const i = CRM.indexOf('function candadoCobranzaChat');
    const f = CRM.slice(i, CRM.indexOf('\n}', i));
    assert.match(f, /GestionAsesor/);
    assert.match(f, /G\.puedeContactar\(/);
    assert.match(f, /MotorReglas\.esFestivo/);
    assert.doesNotMatch(f, /getHours|getDay/, 'escribió otro horario de la Ley 2300 en vez de reutilizar el que hay');
  });
});

/* ========================================================================== */
describe('7. honestidad, y sin el módulo el CRM anda como antes', () => {

  test('«Escribirle por la app» ya no manda a una pestaña que no existía', () => {
    assert.match(CRM, /const AVISO_SIN_PUSH='No le llega aviso al celular: lo ve cuando abra la app, en Chat\.'/);
    assert.doesNotMatch(CRM, /en la pestaña Chat\./);
  });

  test('sin app/chat-vivo.js: un solo reloj de 45 s, el hilo se carga una vez, y la frase del 🔔 es la verdad vieja', async () => {
    const { P, N, relojes, cerrar } = montar({ sinChatVivo: true, nube: { chat_de: [msg(1, 'socio', 'hola')] } });
    try {
      P.ctx.Notification = { permission: 'granted' };
      P.ev('_reloj = null; vigilarPendientes(true); renderAvisoBoton();');
      assert.deepEqual(Object.keys(relojes).map(Number), [45000]);
      assert.match(plano(el(P,'avisoBoton').innerHTML), /En otra pestaña, minimizado o cerrado, no pregunto/, 'sin el módulo prometió el globo escondido');
      P.ev("irA('mensajes')"); await asentar();
      assert.match(plano(el(P,'eqBandeja').innerHTML), /WILLIAM PRUEBA/, 'sin el módulo el equipo volvió a salir en blanco');
      assert.equal(el(P,'navSinLeer').textContent, ' (3)');
      P.ev("abrirConversacion('1010')"); await asentar();
      assert.equal(N.de('chat_de').length, 1);
      assert.match(plano(el(P,'chHilo').innerHTML), /hola/);
      assert.equal(relojes[8000], undefined, 'sin el módulo armó un reloj del hilo');
      /* Y el pie dice la verdad vieja. */
      P.ev('pintarAvisos()');
      assert.match(plano(el(P,'avisoPie').innerHTML), /escondida, minimizada o cerrada, no/);
    } finally { cerrar(); }
  });

  test('crm.html carga el módulo, sw.js lo precarga, y el CACHE es el de la integración del 30-oct (v140)', () => {
    assert.match(CRM, /<script src="\.\.\/app\/chat-vivo\.js"><\/script>/);
    assert.ok(CRM.indexOf('<script src="../app/chat-vivo.js">') > CRM.indexOf('<script src="../app/chat.js">'), 'chat-vivo.js va antes de chat.js');
    const SW = leer('sw.js');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS = ['), SW.indexOf('].map(f => BASE + f)'));
    assert.ok(lista.indexOf("'app/chat-vivo.js'") >= 0, 'sw.js no precarga app/chat-vivo.js: la primera vez sin señal, sin reloj');
    /* 30-oct-2026 — la integración del lote del viernes subió el CACHE a v140
       (chat-1 sale ahí, con el gerente agrega). */
    assert.match(SW, /const CACHE = 'tugarantia-v140';/, 'chat-1 sale en v140: el CACHE lo subió la integración del 30-oct');
    assert.ok(fs.existsSync(path.join(RAIZ, 'app', 'chat-vivo.js')));
    /* Y las páginas siguen pidiendo app/chat.js como antes: chat-1 no lo tocó,
       así que ninguna tiene que subir su ?v= (eso lo vigila
       la-pagina-nueva-no-corre-con-un-js-viejo.test.js contra lo publicado). */
    assert.match(CRM, /<script src="\.\.\/app\/chat\.js"><\/script>/);
  });

  test('vigilarJefeEq sigue sin llamadores, a propósito, y el comentario dice por qué', () => {
    const veces = (CRM.match(/vigilarJefeEq\(\)/g) || []).length;
    assert.equal(veces, 1, 'alguien enchufó vigilarJefeEq: con equipo_chat_leer apagaría el contador sin que nadie lea');
    assert.match(CRM, /equipo_chat_sin_leer, que\s+solo cuenta, en chat-2/);
  });
});
