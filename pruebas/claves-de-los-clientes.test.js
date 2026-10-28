'use strict';
/* ==========================================================================
 * LAS CLAVES DE LOS CLIENTES — 22-oct-2026
 *
 *   node --test pruebas/claves-de-los-clientes.test.js
 *
 * Joan: «los clientes deben de tener la opcion de cambiar contraseña y olvide
 * contraseña». El camino ya existía de punta a punta —recado, clave temporal
 * desde el CRM, WhatsApp al número de la ficha, el cliente la cambia—, pero
 * tenía cuatro huecos que lo hacían fallar en silencio. Estas pruebas corren
 * las páginas DE VERDAD (banco-platachat.js, banco-play.js, banco-panel.js)
 * y el módulo de la sesión de PlataChat, y todas FALLAN con main 8323fc0
 * (salvo las marcadas «control», que cuidan que lo nuevo no rompa lo de
 * antes):
 *
 *   1. PLATACHAT NO TENÍA «CAMBIAR MI CONTRASEÑA», y el WhatsApp de la clave
 *      nueva le decía al cliente que la cambiara ahí.
 *   2. EL PERFIL DE play/ ACEPTABA EL CELULAR COMO CONTRASEÑA (solo miraba el
 *      largo), cosa que la app del socio y el registro niegan.
 *   3. EL CRM NO SE ENTERABA DE LOS RECADOS: no subían el número de Socios;
 *      el globo llevaba siempre a Mensajes; su texto prometía avisar con el
 *      CRM en otra pestaña (el reloj se para con la pestaña escondida); el
 *      recado no decía cuánto llevaba esperando; había que marcarlo a mano
 *      aunque la clave ya se hubiera dado; y la lista decía «no está en tus
 *      clientes» de alguien a quien el botón sí reconocía.
 *   4. play/ Y PLATACHAT PROMETÍAN «Te escribimos al <número del recado>», y
 *      la clave va al número de la FICHA.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlataChat, asentar } = require('./banco-platachat.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirPanel } = require('./banco-panel.js');
const UP = require('../panel/una-puerta.js');

const CEL_MARIA = '3001112233', CLAVE_MARIA = 'Maria.Secreta9';
const CEL_PEDRO = '3109998877', CLAVE_PEDRO = 'Pedro.Propia7';
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

async function mariaEnPlataChat(opc) {
  const PC = abrirPlataChat(opc);
  await asentar(10);
  await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
  assert.match(PC.token() || '', /^tok-Maria-/, 'María no entró');
  return PC;
}
const puestas = (PC, desde) => PC.st.llamadas.slice(desde || 0).filter(x => /\/auth\/v1\/user$/.test(x.url));

/* ======================================================================== */
describe('1 · PlataChat: «Cambiar mi contraseña» existe, dentro de PlataChat', () => {

  test('Yo ofrece «Cambiar mi contraseña» con las mismas palabras que el WhatsApp de la clave nueva', async () => {
    /* El WhatsApp manda a «Cambiar mi contraseña»: la pantalla tiene que
       llamarse así, letra por letra, o el cliente no la encuentra. */
    assert.match(UP.mensajeClaveNueva('María', 'k3m9p2xq', CEL_MARIA), /«Cambiar mi contraseña»/);
    const PC = await mariaEnPlataChat();
    PC.ev("irA('yo')");
    assert.match(PC.elems.cuerpo.innerHTML, /onclick="pintarCambiarClave\(\);return false">Cambiar mi contraseña</,
      'Yo no tiene «Cambiar mi contraseña»: el WhatsApp de la clave nueva manda a una pantalla que no existe');
    PC.ev('pintarCambiarClave()');
    const h = PC.elems.cuerpo.innerHTML;
    assert.match(h, /id="ccNueva"/);
    assert.match(h, /id="ccRepite"/);
    assert.match(h, /onclick="cambiarClave\(\)"/);
    assert.match(h, /onclick="irA\('yo'\)">Volver/, 'sin «Volver» se queda atrapado en la pantalla');
  });

  test('la cambia de verdad: solo la contraseña, con SU token; la vieja deja de servir y la nueva entra', async () => {
    const PC = await mariaEnPlataChat();
    const desde = PC.st.llamadas.length;
    PC.ev("irA('yo'); pintarCambiarClave(); $('ccNueva').value = 'Maria.Nueva2026'; $('ccRepite').value = 'Maria.Nueva2026'; cambiarClave();");
    await asentar(20);
    const p = puestas(PC, desde);
    assert.equal(p.length, 1, 'no salió el cambio a /auth/v1/user');
    assert.equal(p[0].metodo, 'PUT');
    assert.deepEqual(p[0].c, { password: 'Maria.Nueva2026' }, 'el cambio lleva algo más que la contraseña (el correo es la identidad)');
    assert.match(p[0].auth, /^Bearer tok-Maria-/, 'el cambio no fue con la sesión de María');
    assert.match(texto(PC.elems.cuerpo.innerHTML), /Listo: tu contraseña quedó cambiada/);
    assert.match(PC.token() || '', /^tok-Maria-/, 'cambiar la contraseña la sacó de su cuenta');

    PC.ev('salir()');
    await asentar(5);
    await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
    assert.equal(PC.ev('SES'), null, 'la contraseña vieja sigue abriendo la cuenta');
    await PC.entrarComo(CEL_MARIA, 'Maria.Nueva2026');
    assert.match(PC.token() || '', /^tok-Maria-/, 'la contraseña nueva no abre la cuenta');
  });

  test('las reglas del registro: ni corta, ni obvia, ni el celular; las dos iguales; y nada de eso sale a la red', async () => {
    const PC = await mariaEnPlataChat();
    const desde = PC.st.llamadas.length;
    const probar = async (a, b) => {
      PC.ev("pintarCambiarClave(); $('ccNueva').value = " + JSON.stringify(a) + "; $('ccRepite').value = " + JSON.stringify(b) + '; cambiarClave();');
      await asentar(10);
      return PC.elems.ccMsg.textContent;
    };
    assert.match(await probar('corta', 'corta'), /al menos 8 caracteres/);
    assert.match(await probar('12345678', '12345678'), /de las que más se prueban/);
    assert.match(await probar('x' + CEL_MARIA + 'x', 'x' + CEL_MARIA + 'x'), /No uses tu número de celular/);
    assert.match(await probar('Maria.Nueva2026', 'Maria.Nueva2027'), /no quedaron iguales/);
    assert.equal(puestas(PC, desde).length, 0, 'una contraseña que no cumple salió a la red');
  });

  test('el «no» de Supabase sale en español, y el botón vuelve a encenderse', async () => {
    const PC = await mariaEnPlataChat({ resp: { auth_user: () => ({ __estado: 422, code: 422, error_code: 'same_password',
      msg: 'New password should be different from the old password.' }) } });
    PC.ev("pintarCambiarClave(); $('ccNueva').value = 'Maria.Nueva2026'; $('ccRepite').value = 'Maria.Nueva2026'; cambiarClave();");
    await asentar(20);
    const t = PC.elems.ccMsg.textContent;
    assert.match(t, /igual a la que ya tienes/);
    assert.doesNotMatch(t, /password|different/i, 'salió el inglés de Supabase: ' + t);
    assert.equal(PC.elems.ccBoton.disabled, false, 'el botón se quedó apagado después de un «no»');
  });

  test('una sesión que el servidor ya cerró (la clave temporal cierra sesiones) lleva a la puerta, con el porqué', async () => {
    const PC = await mariaEnPlataChat({ resp: { auth_user: () => ({ __estado: 403, code: 403, error_code: 'session_not_found',
      msg: 'Session from session_id claim in JWT does not exist' }) } });
    PC.ev("pintarCambiarClave(); $('ccNueva').value = 'Maria.Nueva2026'; $('ccRepite').value = 'Maria.Nueva2026'; cambiarClave();");
    await asentar(20);
    assert.equal(PC.ev('SES'), null, 'se quedó adentro con una sesión que el servidor ya no reconoce');
    assert.match(PC.elems.errEntrar.textContent, /Tu sesión venció/);
  });

  test('el «Listo» de María que llega tarde no se le pinta a Pedro, ni le borra lo que escribe, ni le apaga el botón', async () => {
    const PC = await mariaEnPlataChat();
    PC.st.colgar = /\/auth\/v1\/user$/;
    PC.ev("pintarCambiarClave(); $('ccNueva').value = 'Maria.Nueva2026'; $('ccRepite').value = 'Maria.Nueva2026'; cambiarClave();");
    await asentar(10);
    assert.equal(PC.st.colgadas.length, 1, 'el cambio de María no quedó en camino');
    PC.st.colgar = null;
    PC.ev('salir()');
    await asentar(5);
    await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
    assert.match(PC.token() || '', /^tok-Pedro-/);
    PC.ev("irA('yo'); pintarCambiarClave(); $('ccNueva').value = 'De.Pedro2026';");
    assert.equal(PC.elems.ccBoton.disabled, false, 'Pedro encontró el botón apagado por el cambio de María');
    PC.elems.ccMsg.textContent = '';
    PC.suelta(0);
    await asentar(20);
    assert.doesNotMatch(texto(PC.elems.cuerpo.innerHTML), /quedó cambiada/, 'a Pedro se le dijo que su contraseña quedó cambiada');
    assert.equal(PC.elems.ccMsg.textContent, '', 'la respuesta de María le escribió a Pedro');
    assert.equal(PC.ev("$('ccNueva').value"), 'De.Pedro2026', 'la respuesta de María le borró a Pedro lo que escribía');
  });
});

/* ======================================================================== */
describe('1 · platachat/sesion.js: cambiarClave, sin pantalla', () => {
  const SP = require('../platachat/sesion.js');
  const CFG = { url: 'https://prueba.supabase.co', anon: 'llave-anon' };
  function red(respuestas) {
    const vistas = [];
    return { vistas, fetch: (url, op) => {
      vistas.push({ url: String(url), op, cuerpo: op && op.body ? JSON.parse(op.body) : null });
      const r = respuestas.shift();
      if (r === 'caida') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ ok: r.status < 300, status: r.status, text: () => Promise.resolve(JSON.stringify(r.cuerpo || {})) });
    } };
  }
  const viva = () => ({ access_token: 'a', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, celular: CEL_MARIA });

  test('con el reloj vencido, refresca ANTES y cambia con el token nuevo', async () => {
    const R = red([{ status: 200, cuerpo: { access_token: 'nuevo', refresh_token: 'r2', expires_in: 3600 } }, { status: 200 }]);
    const s = Object.assign(viva(), { expires_at: Math.floor(Date.now() / 1000) - 5 });
    const r = await SP.cambiarClave(Object.assign({ fetch: R.fetch }, CFG), s, 'Maria.Nueva2026');
    assert.equal(r.ok, true);
    assert.match(R.vistas[0].url, /grant_type=refresh_token/);
    assert.match(R.vistas[1].url, /\/auth\/v1\/user$/);
    assert.equal(R.vistas[1].op.method, 'PUT');
    assert.equal(R.vistas[1].op.headers.Authorization, 'Bearer nuevo');
    assert.deepEqual(R.vistas[1].cuerpo, { password: 'Maria.Nueva2026' });
  });

  test('un 401 refresca UNA vez y repite; si el refresh ya no vale, sinSesion y no insiste', async () => {
    const R = red([{ status: 401 }, { status: 200, cuerpo: { access_token: 'nuevo', refresh_token: 'r2', expires_in: 3600 } }, { status: 200 }]);
    assert.equal((await SP.cambiarClave(Object.assign({ fetch: R.fetch }, CFG), viva(), 'Maria.Nueva2026')).ok, true);
    assert.equal(R.vistas[2].op.headers.Authorization, 'Bearer nuevo');

    const R2 = red([{ status: 401 }, { status: 400, cuerpo: { error: 'invalid_grant', error_description: 'Invalid Refresh Token' } }]);
    const r2 = await SP.cambiarClave(Object.assign({ fetch: R2.fetch }, CFG), viva(), 'Maria.Nueva2026');
    assert.equal(r2.ok, false);
    assert.equal(r2.sinSesion, true);
    assert.equal(R2.vistas.length, 2, 'insistió con un refresh que ya no sirve');
  });

  test('sin red lo dice como red; y lo que no cumple las reglas no sale', async () => {
    const R = red(['caida']);
    const r = await SP.cambiarClave(Object.assign({ fetch: R.fetch }, CFG), viva(), 'Maria.Nueva2026');
    assert.equal(r.ok, false);
    assert.equal(r.red, true);
    assert.match(r.motivo, /internet/);

    const R2 = red([]);
    for (const mala of ['12345678', CEL_MARIA + '!', 'aaaaaaaaaa']) {
      assert.equal((await SP.cambiarClave(Object.assign({ fetch: R2.fetch }, CFG), viva(), mala)).ok, false, mala);
    }
    assert.equal(R2.vistas.length, 0);
    /* Una sesión soltada («Salir») no cambia nada para nadie. */
    const s = Object.assign(viva(), { cerrada: true });
    assert.equal((await SP.cambiarClave(Object.assign({ fetch: R2.fetch }, CFG), s, 'Maria.Nueva2026')).sinSesion, true);
    assert.equal(R2.vistas.length, 0);
  });
});

/* ======================================================================== */
describe('2 · play/: el Perfil cambia la contraseña con las reglas del registro', () => {

  function perfil() {
    const P = abrirPlay();
    const vistas = [];
    P.ev('this').fetch = (url, cfg) => {
      vistas.push({ url: String(url), cfg });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    P.ev('SESION = { access_token: "tok", user: { email: "57' + CEL_MARIA + '@tugarantia.net" } };');
    P.ev('tarjetaCambiarClave()');
    const probar = async clave => {
      P.ev('document.getElementById("clave1").value = ' + JSON.stringify(clave));
      P.ev('document.getElementById("clave2").value = ' + JSON.stringify(clave));
      P.ev('cambiarClave()');
      await asentar();
      return P.elems.errClave.textContent;
    };
    return { P, vistas, probar };
  }

  test('niega el celular de la cuenta como contraseña, y no sale a la red', async () => {
    const { vistas, probar } = perfil();
    assert.match(await probar('x' + CEL_MARIA + 'x'), /No uses tu número de celular/);
    assert.equal(vistas.filter(v => /\/auth\/v1\/user/.test(v.url)).length, 0,
      'el Perfil de play/ mandó el celular como contraseña nueva');
  });

  test('niega las de siempre («12345678»), igual que la app del socio y el registro', async () => {
    const { vistas, probar } = perfil();
    assert.match(await probar('12345678'), /de las que más se prueban/);
    assert.equal(vistas.length, 0);
  });

  test('control — una contraseña buena sí sale, y solo con la contraseña', async () => {
    const { vistas, probar } = perfil();
    assert.match(await probar('Maria.Nueva2026'), /quedó cambiada/);
    const p = vistas.filter(v => /\/auth\/v1\/user/.test(v.url));
    assert.equal(p.length, 1);
    assert.deepEqual(JSON.parse(p[0].cfg.body), { password: 'Maria.Nueva2026' });
  });
});

/* ======================================================================== */
describe('4 · el recado no promete escribir al número del recado', () => {

  test('play/: «Listo, lo recibimos» sin «Te escribimos al <número>»', async () => {
    const P = abrirPlay();
    P.ev('CFG = { url: "https://x.supabase.co", anon: "llave-publica" };');
    P.ev('this').fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    P.ev('olvide()');
    P.ev('document.getElementById("ayTel").value = "300 999 8877";');
    P.ev('mandarAyuda()');
    await asentar();
    const h = texto(P.elems.cuerpo.innerHTML);
    assert.match(h, /Listo, lo recibimos/);
    assert.doesNotMatch(h, /Te escribimos al/, 'promete escribir al número del recado: la clave va al de la ficha');
    assert.doesNotMatch(h, /999 8877|3009998877/, 'muestra el número del recado como destino');
    assert.match(h, /si ya eres cliente, te puede llegar al número que tenemos en tu ficha/, 'no dice a qué número le llega la respuesta');
  });

  test('PlataChat: lo mismo', async () => {
    const PC = abrirPlataChat({ resp: { pedir_ayuda_clave: () => ({ ok: true }) } });
    await asentar(10);
    PC.ev('pintarRecado()');
    PC.ev("$('rcCelular').value = '300 999 8877';");
    await PC.ev('mandarRecado()');
    await asentar(10);
    const h = texto(PC.elems.entrarCuerpo.innerHTML);
    assert.match(h, /Listo, lo recibimos/);
    assert.doesNotMatch(h, /Te escribimos al/, 'promete escribir al número del recado: la clave va al de la ficha');
    assert.doesNotMatch(h, /999 8877|3009998877/, 'muestra el número del recado como destino');
    assert.match(h, /si ya eres cliente, te puede llegar al número que tenemos en tu ficha/);
  });
});

/* ======================================================================== */
describe('3 · el CRM se entera de los recados y los atiende', () => {
  const CLAVE = 'clave-de-prueba-bien-larga';
  const AHORA = '2026-10-22T15:00:00-05:00';
  const CARTERA = {
    socios: [
      { id: 'C1', numero: 7, nombre: 'Adriana Antigua', cedula: '', telefono: '3001112222', whatsappIgual: true,
        cuentaJunta: { celular: '3009998888', fecha: '2026-10-07' } },
      { id: 'C2', numero: 8, nombre: 'Bruno WhatsApp', cedula: '52111222', telefono: '3003334444', whatsappIgual: false,
        whatsappNumero: '3157776666' }
    ],
    prestamos: [],
    config: { negocio: 'Tu Garantía' }
  };
  const RECADO_NUEVO = { id: 1, celular: '3001112222', nota: '', estado: 'nueva', creada_en: '2026-10-22T19:00:00+00:00' };
  const RECADO_VIEJO = { id: 2, celular: '3005550000', nota: 'no me deja entrar', estado: 'nueva', creada_en: '2026-10-21T15:00:00+00:00' };

  function montar(o) {
    o = o || {};
    const vistas = [];
    const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
    const red = (url, cfg) => {
      const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
      const cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null;
      vistas.push({ fn, cuerpo });
      const r = o[fn];
      if (r !== undefined) {
        const v = typeof r === 'function' ? r(cuerpo) : r;
        return Promise.resolve(v && v.__estado ? resp(v.__estado, v) : resp(200, v));
      }
      if (fn === 'listar_solicitudes_abiertas') return Promise.resolve(resp(200, []));
      return Promise.resolve(resp(404, { message: 'no existe' }));
    };
    const P = abrirPanel({ red, ahora: AHORA });
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
    P.cargarCartera(JSON.parse(JSON.stringify(o.cartera || CARTERA)));
    P.ctx._abiertos = [];
    P.ctx.open = u => { P.ctx._abiertos.push(String(u)); };
    return { P, vistas, a: fn => vistas.filter(v => v.fn === fn) };
  }
  const avisos = P => (P.ctx._avisos || []).join('\n');

  test('los recados cuentan en el número de Socios', async () => {
    const { P } = montar({ listar_ayudas_clave: [RECADO_NUEVO, RECADO_VIEJO] });
    P.ev('traerAyudas()');
    await asentar();
    assert.equal(P.elems.navSolicitudes.textContent, ' (2)',
      'dos personas no pueden entrar y el número de Socios no se movió');
    assert.match(P.elems.navSolicitudes.title, /2 recado\(s\)/, 'el número no dice que son recados');
  });

  test('si los recados no se pudieron leer, Socios queda en (?), no en el número de la vez pasada', async () => {
    let falla = false;
    const { P } = montar({ listar_ayudas_clave: () => (falla ? { __estado: 500, message: 'caída' } : [RECADO_NUEVO]) });
    P.ev('traerAyudas()');
    await asentar();
    assert.equal(P.elems.navSolicitudes.textContent, ' (1)');
    falla = true;
    P.ev('traerAyudas(true)');
    await asentar();
    assert.equal(P.elems.navSolicitudes.textContent, ' (?)', 'un fallo al leer los recados se pinta como si nada');
  });

  test('el globo de un recado (o de una solicitud) lleva a Socios, no a Mensajes', async () => {
    const { P } = montar();
    const globos = [];
    P.ctx.Notification = class { constructor(t, o) { this.body = o && o.body; globos.push(this); } close() {} };
    P.ctx.Notification.permission = 'granted';
    P.ev('irA = function (v) { window._fuiA = v; };');
    P.ev('_vistos = { mensajes: 0, solicitudes: 0, ayudas: 0 };');
    P.ev('_ayudas = ' + JSON.stringify([RECADO_NUEVO]) + '; pintarAvisos();');
    assert.equal(globos.length, 1, 'un recado nuevo no sacó globo');
    assert.match(globos[0].body, /1 recado\(s\) de acceso/);
    globos[0].onclick();
    assert.equal(P.ev('window._fuiA'), 'socios', 'el globo del recado llevó a ' + P.ev('window._fuiA'));

    P.ev("_solicitudes = [{ id: 'x', origen: 'nube', estado: 'nueva' }]; pintarAvisos();");
    assert.equal(globos.length, 2);
    globos[1].onclick();
    assert.equal(P.ev('window._fuiA'), 'socios', 'el globo de una solicitud llevó a ' + P.ev('window._fuiA'));
  });

  test('el texto del globo y del pie dice lo que el reloj hace: escondida revisa solo las listas del chat, cada minuto', async () => {
    /* 26-oct-2026 — chat-1: con el CRM en otra pestaña el reloj de 60 s pide
       SOLO las dos listas del chat (nunca un hilo, nunca solicitudes ni
       recados), y eso es lo que la frase promete ahora. Antes la frase decía
       «no pregunto» y el reloj no preguntaba; las dos cambian juntas. La
       prueba fina del reloj está en pruebas/chat-1-crm.test.js; aquí, que el
       texto y el reloj digan lo mismo. chat.js habla con el fetch de Node:
       se tapa para que la vuelta no salga a internet. */
    const { P, vistas } = montar({ listar_ayudas_clave: [], equipo_chat_conversaciones: [] });
    const real = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });
    try {
      P.ctx.Notification = { permission: 'granted' };
      P.ev('renderAvisoBoton(); pintarAvisos();');
      const boton = texto(P.elems.avisoBoton.innerHTML), pie = texto(P.elems.avisoPie.innerHTML);
      assert.doesNotMatch(boton, /aunque tengas el CRM en otra pestaña/, 'promete avisar con el CRM en otra pestaña, sin decir cómo');
      assert.match(boton, /a la vista, en menos de un minuto/);
      /* 26-oct-2026 (hallazgo del 26-oct) — «solo el chat»: escondido no se
         miran solicitudes ni recados, y «te aviso solo si llegó algo» lo
         prometía. La prueba fina está en chat-1-crm.test.js, bloque 2. */
      assert.match(boton, /reviso solo el chat, cada minuto, y te aviso si llegó un mensaje/);
      assert.match(boton, /Con el CRM cerrado, no/);
      assert.doesNotMatch(pie, /esté abierta/, '«abierta» promete avisos que no llegan');
      assert.match(pie, /en otra pestaña o minimizada, cada minuto y solo el chat\. Cerrada, no/);
      /* Y eso es lo que pasa: dos relojes, y el de 60 s escondido pide las listas del chat y nada más. */
      const relojes = {};
      P.ctx.setInterval = (f, ms) => { relojes[ms] = f; return ms; };
      P.ev('_reloj = null; vigilarPendientes(true);');
      assert.ok(relojes[45000] && relojes[60000], 'faltan los dos relojes (45 s a la vista, 60 s escondido): ' + Object.keys(relojes));
      P.ctx.document.hidden = true;
      const antes = vistas.length;
      relojes[45000]();
      await asentar();
      assert.equal(vistas.length, antes, 'el reloj de 45 s trabajó con la pestaña escondida');
      relojes[60000]();
      await asentar();
      const escondido = vistas.slice(antes).map(v => v.fn);
      assert.ok(escondido.includes('equipo_chat_conversaciones'), 'escondido no preguntó por el chat del equipo: ' + escondido.join(','));
      assert.ok(!escondido.includes('listar_ayudas_clave') && !escondido.includes('listar_solicitudes_abiertas'),
        'escondido preguntó más que las listas del chat: ' + escondido.join(','));
      assert.ok(!escondido.includes('chat_de') && !escondido.includes('equipo_chat_de'), 'escondido pidió un hilo: lo marcaría «Lo vio» sin que nadie lo mire');
      /* Control: a la vista, la vuelta de 45 s sí pregunta por los recados; la de 60 s no trabaja. */
      P.ctx.document.hidden = false;
      const antes2 = vistas.length;
      relojes[60000]();
      await asentar();
      assert.equal(vistas.length, antes2, 'el reloj de 60 s trabajó con la pestaña a la vista');
      relojes[45000]();
      await asentar();
      assert.ok(vistas.some((v, i) => i >= antes2 && v.fn === 'listar_ayudas_clave'), 'a la vista, el reloj no preguntó por los recados');
    } finally { globalThis.fetch = real; }
  });

  test('cada recado dice cuánto lleva esperando, y el de más de un día se resalta', () => {
    const { P } = montar();
    P.ev('_ayudas = ' + JSON.stringify([RECADO_NUEVO, RECADO_VIEJO]) + '; renderAyudas();');
    const h = P.elems.ayudas.innerHTML;
    assert.match(h, /hace 1 h/, 'el recado de hace una hora no dice cuánto lleva');
    assert.match(h, /hace 1 día/, 'el recado de ayer no dice cuánto lleva');
    assert.equal((h.match(/class="recado-viejo"/g) || []).length, 1, 'tenía que resaltarse uno, el de más de un día');
    assert.match(h, /<span class="chip mora">hace 1 día<\/span>/);
    assert.match(h, /<span class="chip al-dia">hace 1 h<\/span>/);
    assert.match(texto(h), /1 recado\(s\) llevan más de un día esperando/);
  });

  test('la lista reconoce al cliente igual que el botón: por la cuenta junta y por el WhatsApp de la ficha', () => {
    const { P } = montar();
    P.ev("_ayudas = [{ id: 3, celular: '3009998888', nota: '', creada_en: '2026-10-22T19:00:00+00:00' }," +
         "          { id: 4, celular: '3157776666', nota: '', creada_en: '2026-10-22T19:00:00+00:00' }]; renderAyudas();");
    const h = texto(P.elems.ayudas.innerHTML);
    assert.match(h, /Adriana Antigua · CL-0007/, 'la cuenta junta de Adriana sale como «no está en tus clientes»');
    assert.match(h, /Bruno WhatsApp · CL-0008/, 'el WhatsApp de la ficha de Bruno sale como «no está en tus clientes»');
    assert.doesNotMatch(h, /no está en tus clientes/);
    /* Y el botón dice lo mismo de la misma persona. */
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev('darClaveNueva(4)');
    assert.match(preguntas[0], /al número de su ficha \(CL-0008 Bruno WhatsApp\): 315 777 6666/);
  });

  test('con la clave dada (ok), el recado se marca atendido solo, y la ventana lo dice', async () => {
    const { P, a } = montar({ clave_temporal_joan: { ok: true, celular: '3001112222', clave: 'k3m9p2xq' },
      marcar_ayuda_clave: { ok: true } });
    P.ev('_ayudas = ' + JSON.stringify([RECADO_NUEVO, RECADO_VIEJO]) + '; renderAyudas(); pintarAvisos();');
    assert.equal(P.elems.navSolicitudes.textContent, ' (2)');
    P.ev('darClaveNueva(1)');
    await asentar();
    assert.equal(a('marcar_ayuda_clave').length, 1, 'la clave quedó dada y el recado sigue pendiente');
    assert.deepEqual(a('marcar_ayuda_clave')[0].cuerpo, { p_clave: CLAVE, p_id: 1, p_estado: 'atendida' });
    assert.equal(P.ev('_ayudas.length'), 1);
    assert.equal(P.ev('_ayudas[0].id'), 2, 'se marcó el recado equivocado');
    assert.equal(P.elems.navSolicitudes.textContent, ' (1)', 'el número de Socios no bajó');
    assert.match(P.elems.mBody.innerHTML, /k3m9p2xq/, 'la clave se dejó de mostrar');
    assert.match(P.elems.claveNuevaRecado.textContent, /ya salió de la lista/);
    assert.equal(avisos(P), '', 'un alert encima de la clave que se muestra una sola vez');
  });

  test('si marcarlo falla, el recado se queda y la ventana dice qué hacer', async () => {
    const { P } = montar({ clave_temporal_joan: { ok: true, celular: '3001112222', clave: 'k3m9p2xq' },
      marcar_ayuda_clave: { __estado: 500, message: 'caída' } });
    P.ev('_ayudas = ' + JSON.stringify([RECADO_NUEVO]));
    P.ev('darClaveNueva(1)');
    await asentar();
    assert.equal(P.ev('_ayudas.length'), 1, 'el recado desapareció de la pantalla sin que la nube lo marcara');
    assert.match(P.elems.claveNuevaRecado.textContent, /No pude sacar el recado.*Ya le escribí/);
    assert.equal(avisos(P), '');
  });

  test('control — si la nube no da la clave, el recado NO se toca', async () => {
    const { P, a } = montar({ clave_temporal_joan: { ok: false, motivo: 'sin_cuenta' }, marcar_ayuda_clave: { ok: true } });
    P.ev('_ayudas = ' + JSON.stringify([RECADO_VIEJO]));
    P.ev('darClaveNueva(2)');
    await asentar();
    assert.equal(a('marcar_ayuda_clave').length, 0, 'se marcó atendido un recado sin clave dada');
    assert.equal(P.ev('_ayudas.length'), 1);
    assert.match(avisos(P), /no tiene cuenta en la app/);
  });
});
