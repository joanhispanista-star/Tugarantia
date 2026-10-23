'use strict';
/* ==========================================================================
 * PLATACHAT CON LAS REGLAS DE play/ — 21-oct-2026 (I2)
 *
 *   node --test pruebas/platachat-la-respuesta-es-de-quien-la-pidio.test.js
 *
 * La verificación de f380a19 confirmó cinco caminos en PlataChat (todos ya
 * pasaban en main) con una sola raíz, la que play/ cerró en G1, H2 y H3: lo
 * que sale a la red sigue vivo aunque la pestaña ya sea de otra persona, y al
 * volver se adoptaba sin preguntar de quién era.
 *   · «ENTRAR»: Pedro toca «Entrar» con la señal floja (sin tope ni botón
 *     apagado), se cansa; María entra con la suya. La respuesta de Pedro
 *     llegaba, sesion.js la guardaba y María quedaba operando la cuenta de él.
 *   · LO QUE PIDE LA CUENTA: la foto del chat de María (su cédula), su
 *     solicitud de $450.000 y su «Acepto» que contestaban después de su
 *     «Salir» se pintaban encima de la entrada o de la cuenta de Pedro; y lo
 *     que traía mi_cuenta se guardaba dentro de la sesión de él.
 *   · EL REFRESCO: «Salir» con un refresco en camino; el refresco volvía a
 *     escribir la sesión de María en el teléfono (con un refresh_token vivo),
 *     y el siguiente que abría PlataChat entraba a su cuenta.
 *   · EL PASE QUE FALLÓ (play/): si el registro no podía pasarle la sesión a
 *     PlataChat, la copia de la pestaña se quedaba, y el siguiente «Abrir mi
 *     cuenta» se la volvía a pasar: PlataChat le abría a Pedro la de María.
 * Todas corren las páginas REALES (pruebas/banco-platachat.js para PlataChat,
 * pruebas/banco-registro.js para play/), con la nube que retiene y suelta.
 * Todas FALLAN con las páginas de f380a19; las de «control» también, porque
 * allá no existían ni el tope del «Entrar» ni SP.soltar: cuidan que lo nuevo
 * no deje a nadie afuera.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlataChat, asentar, RAIZ } = require('./banco-platachat.js');
const B = require('./banco-registro.js');

const CEL_MARIA = '3001112233', CLAVE_MARIA = 'Maria.Secreta9';
const CEL_PEDRO = '3109998877', CLAVE_PEDRO = 'Pedro.Propia7';
const deMaria = /Maria|MARIA|450\.000|495\.000/;
const conToken = (PC, re, desde) => PC.st.llamadas.slice(desde || 0).filter(x => re.test(x.auth));
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

async function mariaAdentro(opc) {
  const PC = abrirPlataChat(opc);
  await asentar(10);
  await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
  assert.match(PC.token() || '', /^tok-Maria-/, 'María no entró');
  return PC;
}
async function saleYEntraPedro(PC) {
  PC.ev('salir()');
  await asentar(5);
  assert.equal(PC.ev('SES'), null);
  await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
  assert.match(PC.token() || '', /^tok-Pedro-/, 'Pedro no entró');
}

describe('I2 — el «Entrar» de PlataChat: uno a la vez, con tope, y la respuesta solo vale para quien la pidió', () => {

  test('I2 — Pedro toca «Entrar» con la señal floja; el botón se apaga, a los 30 s se enciende; María entra a la suya; la respuesta de Pedro llega: no se adopta, no se guarda y se cierra', async () => {
    const PC = abrirPlataChat();
    await asentar(10);
    PC.st.colgar = (u, c) => /grant_type=password/.test(u) && c && /3109998877/.test(c.email);
    await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
    assert.equal(PC.st.colgadas.length, 1);
    assert.equal(PC.elems.btnEntrar.disabled, true, '«Entrar» no se apaga mientras viaja');
    /* Un segundo toque no saca otro «Entrar». */
    PC.ev('entrar()');
    await asentar(5);
    assert.equal(PC.st.llamadas.filter(x => /grant_type=password/.test(x.url)).length, 1, 'salió un segundo «Entrar» con el primero en camino');
    PC.pasa(30000);
    assert.equal(PC.elems.btnEntrar.disabled, false, 'el tope no encendió «Entrar»');
    assert.match(PC.elems.errEntrar.textContent, /Seguimos esperando/);
    PC.st.colgar = null;
    await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
    assert.match(PC.token(), /^tok-Maria-/);
    PC.suelta(0);
    await asentar(20);
    assert.match(PC.token(), /^tok-Maria-/, 'la respuesta tardía de Pedro le cambió la sesión a María');
    assert.equal(PC.ev('S && S.nombre'), 'Maria');
    assert.match(PC.guardada().access_token, /^tok-Maria-/, 'el teléfono quedó recordando la sesión de Pedro');
    const cerradas = PC.logouts();
    assert.equal(cerradas.length, 1, 'la sesión de Pedro que llegó tarde quedó abierta en el servidor');
    assert.match(cerradas[0].url, /scope=local/);
    assert.match(cerradas[0].auth, /tok-Pedro-/);
    assert.equal(conToken(PC, /tok-Pedro-/).filter(x => /rpc\//.test(x.url)).length, 0, 'la sesión de Pedro llamó a la base');
  });

  test('I2 — Pedro vuelve a tocar «Entrar» después del tope: la respuesta del primero ya no es de aquí (se cierra) y entra con la del segundo', async () => {
    const PC = abrirPlataChat();
    await asentar(10);
    PC.st.colgar = /grant_type=password/;
    await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
    PC.pasa(30000);
    PC.st.colgar = null;
    PC.ev('entrar()');
    await asentar(20);
    const segundo = PC.token();
    assert.match(segundo || '', /^tok-Pedro-/);
    PC.suelta(0);
    await asentar(20);
    assert.equal(PC.token(), segundo, 'la respuesta vieja reemplazó la sesión del segundo «Entrar»');
    assert.equal(PC.logouts().length, 1);
    assert.notEqual(PC.logouts()[0].auth, 'Bearer ' + segundo);
  });

  test('I2 — otro celular en la casilla (también a medias) suelta el «Entrar» en camino: el botón se enciende ya y la respuesta se cierra', async () => {
    const PC = abrirPlataChat();
    await asentar(10);
    PC.st.colgar = /grant_type=password/;
    await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
    PC.ev("$('inCelular').value = '300 111'; tecleaTel($('inCelular'));");
    assert.equal(PC.elems.btnEntrar.disabled, false, 'con otro número en la casilla, «Entrar» sigue apagado por el de Pedro');
    assert.equal(/Entrando/.test(PC.elems.errEntrar.textContent), false);
    PC.suelta(0);
    await asentar(20);
    assert.equal(PC.ev('SES'), null, 'se adoptó la sesión de Pedro con otro celular en la casilla');
    assert.equal(PC.guardada(), null);
    assert.equal(PC.logouts().length, 1);
    assert.match(PC.logouts()[0].auth, /tok-Pedro-/);
  });

  /* 21-oct-2026 — la verificación de da4c912: «Déjanos un recado» seguía
     encendido mientras el «Entrar» de Pedro viajaba, y al volver de él la
     entrada se repinta con la casilla VACÍA (un input nuevo, sin oninput):
     tecleaTel nunca veía otro número y la respuesta de Pedro se adoptaba y
     se guardaba en la pantalla de quien tuviera el teléfono. Ir al recado (o
     repintar la entrada) es otro flujo, como olvide() en play/. */
  for (const [nombre, pasos] of [
    ['va al recado y vuelve con la casilla vacía', ['pintarRecado()', 'pintarEntrar()']],
    ['solo va al recado', ['pintarRecado()']],
    ['pasado el tope, va al recado y vuelve', ['TOPE', 'pintarRecado()', 'pintarEntrar()']],
  ]) {
    test('I2 — con el «Entrar» de Pedro en camino, ' + nombre + ': su respuesta no se adopta, no se guarda y se cierra', async () => {
      const PC = abrirPlataChat();
      await asentar(10);
      PC.st.colgar = /grant_type=password/;
      await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
      for (const p of pasos) { if (p === 'TOPE') PC.pasa(30000); else PC.ev(p); }
      PC.st.colgar = null;
      PC.suelta(0);
      await asentar(20);
      assert.equal(PC.ev('SES'), null, 'se adoptó la sesión de Pedro después de pasar por el recado');
      assert.equal(PC.guardada(), null, 'la sesión de Pedro quedó guardada en el teléfono');
      assert.equal(PC.logouts().length, 1);
      assert.match(PC.logouts()[0].auth, /tok-Pedro-/);
      if (pasos[pasos.length - 1] === 'pintarEntrar()') {
        assert.equal(PC.elems.btnEntrar.disabled, false, '«Entrar» quedó apagado por un viaje que ya no es de nadie');
      }
    });
  }

  test('I2, control — pasado el tope, si nadie hizo nada, la respuesta llega, se adopta y se guarda (el tope no deja a nadie afuera)', async () => {
    const PC = abrirPlataChat();
    await asentar(10);
    PC.st.colgar = /grant_type=password/;
    await PC.entrarComo(CEL_PEDRO, CLAVE_PEDRO);
    PC.pasa(30000);
    PC.st.colgar = null;
    PC.suelta(0);
    await asentar(20);
    assert.match(PC.token() || '', /^tok-Pedro-/);
    assert.match(PC.guardada().access_token, /^tok-Pedro-/);
    assert.equal(PC.logouts().length, 0);
  });
});

describe('I2 — lo que pide la cuenta de PlataChat es de la sesión que lo pidió', () => {

  test('I2 — mi_cuenta de María que contesta después de «Salir» no se guarda dentro de la sesión de Pedro', async () => {
    const PC = abrirPlataChat({ resp: { mi_cuenta: q => ({ ok: true, vinculada: false, nombre: q, datos_de_prueba: 'cuenta de ' + q }) } });
    await asentar(10);
    PC.st.colgar = (u, c, a) => /rpc\/mi_cuenta/.test(u) && /tok-Maria-/.test(a);
    await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
    assert.equal(PC.st.colgadas.length, 1);
    PC.st.colgar = null;
    await saleYEntraPedro(PC);
    PC.suelta(0);
    await asentar(20);
    const g = PC.guardada();
    assert.match(g.access_token, /^tok-Pedro-/);
    assert.equal(deMaria.test(JSON.stringify(g)), false, 'los datos de la cuenta de María quedaron guardados en la sesión de Pedro: ' + JSON.stringify(g.ultimo));
    assert.equal(PC.ev('S && S.nombre'), 'Pedro');
  });

  for (const nadie of [false, true]) {
    test('I2 — la foto del chat de María que llega después de «Salir» no se abre ' + (nadie ? 'sobre la entrada' : 'sobre la cuenta de Pedro'), async () => {
      const PC = await mariaAdentro({ resp: { chat_foto_sesion_ver: q => ({ ok: true, imagen: 'data:image/jpeg;base64,/9jCEDULA' + q.toUpperCase() + 'AAAA' }) } });
      PC.ev("CANAL = 'servicio'; irA('chats')");
      await asentar(10);
      PC.st.colgar = /chat_foto_sesion_ver/;
      PC.ev('verFotoChat(7)');
      await asentar(5);
      assert.equal(PC.st.colgadas.length, 1);
      PC.st.colgar = null;
      if (nadie) { PC.ev('salir()'); await asentar(5); } else await saleYEntraPedro(PC);
      const capas = PC.elems.body.hijos.length;
      PC.suelta(0);
      await asentar(20);
      assert.equal(PC.elems.body.hijos.length, capas, 'la foto de la cédula de María se abrió a pantalla completa después de su «Salir»');
      assert.deepEqual(PC.alertas, []);
    });
  }

  test('I2 — un «tu sesión venció» tardío de una llamada de María no saca a Pedro (y la sesión de ella se cierra con el token nuevo)', async () => {
    const PC = await mariaAdentro();
    PC.ev("CANAL = 'servicio'; irA('chats')");
    await asentar(10);
    PC.st.colgar = /chat_foto_sesion_ver/;
    PC.ev('verFotoChat(7)');
    await asentar(5);
    PC.st.colgar = null;
    await saleYEntraPedro(PC);
    const pedro = PC.token();
    PC.suelta(0, { __estado: 401 });
    await asentar(20);
    assert.equal(PC.token(), pedro, 'la respuesta vencida de María sacó a Pedro de su cuenta');
    assert.match(PC.guardada().access_token, /^tok-Pedro-/);
    assert.equal(/venció/.test(PC.elems.errEntrar.textContent), false);
    assert.ok(PC.logouts().some(x => /tok-Maria-r/.test(x.auth) && /scope=local/.test(x.url)),
      'la sesión de María que se refrescó para repetir la llamada no se cerró con el token nuevo');
  });

  test('I2 — la solicitud de $450.000 de María que contesta después de «Salir» no salta la pantalla de Pedro a Créditos ni le pinta nada de ella', async () => {
    const solicitud = q => ({ ok: true, solicitud: { id: q === 'Maria' ? 41 : 77, estado: 'nueva', capital: 450000, fecha_pago: '2026-11-15', cortes: 1,
      creada_en: new Date().toISOString(), responder_antes_de: new Date(Date.now() + 3600e3).toISOString(), pedido: { capital: 450000 } } });
    const PC = await mariaAdentro({ resp: { solicitar_platachat: solicitud } });
    PC.ev("irA('plata')");
    await asentar(10);
    PC.st.colgar = /solicitar_platachat|reproponer_platachat/;
    PC.ev("pedirPorChat(450000, '2026-11-15', 25, 1)");
    await asentar(5);
    assert.equal(PC.st.colgadas.length, 1, 'la solicitud no salió');
    PC.st.colgar = null;
    await saleYEntraPedro(PC);
    assert.equal(PC.ev('TAB'), 'plata');
    PC.suelta(0);
    await asentar(20);
    assert.equal(PC.ev('SOL'), null, 'la solicitud de María quedó como la de Pedro');
    assert.equal(PC.ev('TAB'), 'plata', 'la respuesta de María saltó la pantalla de Pedro a Chats');
    assert.equal(deMaria.test(texto((PC.elems.chPropuesta || {}).innerHTML) + texto(PC.elems.cuerpo.innerHTML)), false,
      'la pantalla de Pedro muestra la solicitud de María');
  });

  test('I2 — el «Acepto» de María que contesta después de «Salir» no pinta «Aceptaste $450.000» en la cuenta de Pedro', async () => {
    const solM = { id: 41, estado: 'contrapropuesta', capital: 450000, fecha_pago: '2026-11-15', cortes: 1,
      contrapropuesta: { capital: 450000, costo: 45000, total: 495000, fecha_pago: '2026-11-15', creada_en: new Date().toISOString(), por: 'auto' } };
    const aceptada = () => ({ ok: true, solicitud: Object.assign({}, solM, { estado: 'aceptada', aceptada_en: new Date().toISOString() }) });
    const PC = await mariaAdentro({ resp: {
      aceptar_propuesta_platachat: aceptada, aceptar_condiciones: aceptada,
      mi_solicitud_platachat: q => ({ ok: true, solicitud: q === 'Maria' ? solM : null, ahora: new Date().toISOString() })
    } });
    PC.ev("CANAL = 'creditos'; irA('chats')");
    await asentar(10);
    assert.equal(PC.ev('SOL && SOL.id'), 41);
    PC.st.colgar = /aceptar_/;
    PC.ev('CONDICIONES_LEIDAS = new Proxy({}, { get: function () { return true; } }); aceptarPropuesta(41)');
    await asentar(5);
    assert.equal(PC.st.colgadas.length, 1, 'la aceptación no salió');
    PC.st.colgar = null;
    await saleYEntraPedro(PC);
    PC.ev("CANAL = 'creditos'; irA('chats')");
    await asentar(10);
    PC.suelta(0);
    await asentar(20);
    assert.equal(PC.ev('SOL'), null, 'la solicitud aceptada de María quedó en la cuenta de Pedro');
    assert.equal(/Aceptaste|495\.000/.test(texto(PC.elems.chPropuesta.innerHTML)), false, 'a Pedro se le dice «Aceptaste…» de lo que aceptó María');
    assert.equal(PC.ev('ACEPTANDO'), false);
  });

  test('I2 — el mensaje de María que contesta después de «Salir» no le borra a Pedro lo que está escribiendo, ni le trae el hilo de ella', async () => {
    const PC = await mariaAdentro({ resp: {
      chat_leer_sesion: q => ({ ok: true, mensajes: q === 'Maria' ? [{ id: 9, de: 'socio', texto: 'Hola, soy Maria', creado_en: new Date().toISOString() }] : [] })
    } });
    PC.ev("CANAL = 'servicio'; irA('chats')");
    await asentar(10);
    PC.ev("$('chTexto').value = 'Hola, soy Maria';");
    PC.st.colgar = (u, c, a) => /chat_escribir_sesion|chat_leer_sesion/.test(u) && /tok-Maria-/.test(a);
    PC.ev('enviarChat()');
    await asentar(5);
    PC.ev('chatTraer(false)');
    await asentar(5);
    PC.st.colgar = null;
    await saleYEntraPedro(PC);
    PC.ev("CANAL = 'servicio'; irA('chats')");
    await asentar(10);
    PC.ev("$('chTexto').value = 'Lo que escribe Pedro';");
    const n0 = PC.st.llamadas.length;
    PC.st.colgadas.forEach(x => x.soltar());
    await asentar(20);
    assert.equal(PC.ev("$('chTexto').value"), 'Lo que escribe Pedro', 'la respuesta de María le borró el mensaje a Pedro');
    assert.equal(/Maria/.test(JSON.stringify(PC.ev('JSON.stringify(CH.mensajes)'))), false, 'el hilo de María apareció en el de Pedro');
    assert.equal(conToken(PC, /tok-Pedro-/, n0).filter(x => /chat_leer_sesion/.test(x.url)).length, 0,
      'la respuesta de María hizo que el hilo de Pedro se volviera a pedir');
  });

  test('I2 — la página no le pide nada a la base por fuera de rpcSesion (una sola puerta, con la sesión que pidió)', () => {
    const pagina = fs.readFileSync(path.join(RAIZ, 'platachat', 'index.html'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const usos = pagina.match(/\bSP\.rpc\(/g) || [];
    assert.equal(usos.length, 1, 'hay llamadas a la base que no pasan por rpcSesion: ' + usos.length);
    /* 21-oct-2026 (verificación del lote 1, R3) — la llamada de la red se
       guarda en `p` para contarla como escritura en camino (la atada a la
       sesión se calla para siempre si la sesión cambia, y no se puede contar
       esa); lo que sale de rpcSesion sigue siendo la atada, deEstaSesion. */
    assert.match(pagina, /function rpcSesion\(fn, cuerpo, ses\)[\s\S]{0,300}var p = SP\.rpc\(CFG, ses, fn, cuerpo\);[\s\S]{0,200}return deEstaSesion\(ses, p\);/);
  });
});

describe('I2 — «Salir» con un refresco en camino: la sesión de María no vuelve al teléfono', () => {

  async function mariaConElRefrescoEnCamino(almacen, sesion, vencida) {
    const PC = abrirPlataChat({ almacen, sesion, resp: vencida ? {} : { chat_leer_sesion: () => ({ __estado: 401 }) } });
    await asentar(10);
    await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
    if (vencida) PC.ev('SES.expires_at = Math.floor(Date.now() / 1000) - 10;');
    PC.st.colgar = /grant_type=refresh_token/;
    PC.ev("CANAL = 'servicio'; irA('chats')");
    await asentar(10);
    assert.ok(PC.st.colgadas.length >= 1, 'no salió el refresco');
    PC.ev("irA('yo')");
    await asentar(2);
    return PC;
  }

  for (const vencida of [true, false]) {
    test('I2 — ' + (vencida ? 'con el token vencido' : 'con un 401 de la base') + ': «Salir», llega el refresco, el teléfono sigue sin sesión, y la sesión se cierra con el token NUEVO', async () => {
      const almacen = {}, sesion = {};
      const PC = await mariaConElRefrescoEnCamino(almacen, sesion, vencida);
      const viejo = PC.token();
      PC.ev('salir()');
      await asentar(5);
      assert.equal(almacen.platachat_sesion, undefined);
      PC.st.colgar = null;
      PC.st.colgadas.forEach(x => x.soltar());
      await asentar(20);
      assert.equal(almacen.platachat_sesion, undefined, 'el refresco volvió a escribir en el teléfono la sesión de María');
      const nuevos = PC.st.llamadas.filter(x => /grant_type=refresh_token/.test(x.url)).length;
      const conNuevo = PC.logouts().filter(x => /tok-Maria-r/.test(x.auth));
      assert.ok(conNuevo.length >= 1 && conNuevo.length <= nuevos, 'la sesión refrescada no se cerró en el servidor con el token nuevo: ' +
        PC.logouts().map(x => x.auth).join(', '));
      conNuevo.forEach(x => assert.match(x.url, /scope=local/));
      if (!vencida) assert.ok(PC.logouts().some(x => x.auth === 'Bearer ' + viejo), '«Salir» no avisó con el token que todavía valía');
      /* Pedro abre PlataChat en ese teléfono: la entrada, no la cuenta de María. */
      const Q = abrirPlataChat({ almacen, sesion: {} });
      await asentar(20);
      assert.equal(Q.ev('SES'), null, 'PlataChat le abrió a Pedro la cuenta de María');
      assert.equal(Q.st.llamadas.filter(x => /rpc\/mi_cuenta/.test(x.url)).length, 0);
    });
  }

  test('I2 — «Salir» con el token vencido y sin refresco en camino: refresca para poder cerrar de verdad, y no guarda nada', async () => {
    const almacen = {}, sesion = {};
    const PC = await mariaAdentro({ almacen, sesion });
    PC.ev('SES.expires_at = Math.floor(Date.now() / 1000) - 10;');
    const n0 = PC.st.llamadas.length;
    PC.ev('salir()');
    await asentar(20);
    const despues = PC.st.llamadas.slice(n0);
    assert.equal(despues.filter(x => /grant_type=refresh_token/.test(x.url)).length, 1, 'con el token vencido, «Salir» no pidió uno que el servidor acepte');
    assert.ok(despues.some(x => /\/auth\/v1\/logout\?scope=local/.test(x.url) && /tok-Maria-r/.test(x.auth)),
      'la sesión no se cerró con el token refrescado: ' + despues.map(x => x.url.replace(/.*\/v1\//, '') + ' ' + x.auth).join(', '));
    assert.equal(almacen.platachat_sesion, undefined);
  });

  test('I2, control — sesion.js: una sesión soltada no se guarda, no pide nada y no se refresca para nadie', async () => {
    const SP = require('../platachat/sesion.js');
    const s = { access_token: 'a', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, celular: CEL_MARIA };
    const llamadas = [];
    const cfg = { url: 'https://x.supabase.co', anon: 'anon', fetch: (u, op) => { llamadas.push({ u: String(u), auth: (op.headers || {}).Authorization });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ access_token: 'nuevo', refresh_token: 'r2', expires_in: 3600 })) }); } };
    SP.soltar(cfg, s);
    assert.equal(s.cerrada, true);
    assert.equal(SP.guardar(s), false);
    await assert.rejects(() => SP.rpc(cfg, s, 'mi_cuenta'), e => e.sinSesion === true);
    assert.equal(await SP.refrescar(cfg, s), null);
    await asentar(5);
    assert.equal(s.access_token, 'a', 'el refresco mutó la sesión soltada');
    assert.ok(llamadas.some(x => /logout/.test(x.u) && x.auth === 'Bearer nuevo'), 'el refresco que llegó no se cerró con su token');
  });
});

describe('I2 — play/: si el pase a PlataChat falla, la copia de la pestaña y la marca se olvidan', () => {

  const scripts = P => Object.values(P.elems).filter(e => e && e.src === '../platachat/sesion.js');

  async function mariaConElPaseFallido(almacen, sesion) {
    const A = B.abrir({ search: '?marca=platachat', almacen, sesion });
    const ll = B.nube(A);
    /* La primera visita: sesion.js no está todavía (se quita lo que el banco precarga). */
    A.ev("delete window.SesionPlataChat; delete SCRIPTS['../platachat/sesion.js'];");
    B.mariaHastaElPermiso(A, false);
    B.tocar(A, 'Abrir mi cuenta');
    await B.asentar(30);
    const s1 = scripts(A).pop();
    assert.ok(s1, 'el final del registro no pidió platachat/sesion.js');
    s1.onerror();   // la señal se cayó justo ahí
    await B.asentar(30);
    assert.match(B.texto(A.elems.pcSubida.textContent), /En PlataChat entra con tu celular/);
    return { A, ll };
  }

  test('I2 — el pase falla: play_sesion y la marca de cuenta creada se olvidan, y el siguiente «Abrir mi cuenta» de esa pestaña no le pasa a nadie la sesión de María', async () => {
    const almacen = {}, sesion = {};
    await mariaConElPaseFallido(almacen, sesion);
    assert.equal(sesion.play_sesion, undefined, 'la sesión de María (con su refresh_token) se quedó en la pestaña después del pase fallido');
    assert.equal(almacen.play_cuenta_creada, undefined, 'la marca de «cuenta recién creada» se quedó');
    /* Pedro toca «Abrir mi cuenta» de PlataChat en la misma pestaña (sesion.js ya carga). */
    const C = B.abrir({ search: '?marca=platachat', hash: '#registro', almacen, sesion });
    B.nube(C);
    await B.asentar(30);
    assert.equal(C.ev('VISTA'), 'registro', 'no se pintó el registro de Pedro');
    assert.notEqual(C.ev('location.href'), '../platachat/index.html', 'el arranque mandó a Pedro a PlataChat');
    assert.equal(almacen.platachat_sesion, undefined, 'el arranque le pasó a PlataChat la sesión de María');
    assert.equal(/573001112233/.test(JSON.stringify(almacen) + JSON.stringify(sesion)), false, 'algo de la sesión de María quedó en la pestaña');
  });

  test('I2 — «Ir a PlataChat» reintenta el pase con la sesión de ESTA página: si ahora carga, María entra sin volver a escribir la contraseña', async () => {
    const almacen = {}, sesion = {};
    const { A } = await mariaConElPaseFallido(almacen, sesion);
    A.ev(B.SESION_JS);
    A.ev(B.boton(A.elems.pcAcciones.innerHTML, 'Ir a PlataChat'));
    await B.asentar(5);
    const s2 = scripts(A).pop();
    s2.onload();
    await B.asentar(30);
    assert.equal(A.ev('location.href'), '../platachat/index.html');
    assert.match(JSON.parse(almacen.platachat_sesion).access_token, /573001112233/);
    assert.equal(sesion.play_sesion, undefined);
  });

  test('I2 — y si el reintento tampoco puede, la sesión de esta página se cierra en el servidor y se va a PlataChat a entrar', async () => {
    const almacen = {}, sesion = {};
    const { A, ll } = await mariaConElPaseFallido(almacen, sesion);
    A.ev(B.boton(A.elems.pcAcciones.innerHTML, 'Ir a PlataChat'));
    await B.asentar(5);
    scripts(A).pop().onerror();
    await B.asentar(30);
    assert.equal(A.ev('location.href'), '../platachat/index.html');
    assert.equal(almacen.platachat_sesion, undefined);
    assert.equal(A.ev('SESION'), null);
    const cerradas = ll().filter(x => /\/auth\/v1\/logout\?scope=local/.test(x.url));
    assert.equal(cerradas.length, 1, 'la sesión que nadie va a tener quedó abierta en el servidor');
    assert.match(cerradas[0].auth, /573001112233/);
  });
});
