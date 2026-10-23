'use strict';
/* ==========================================================================
 * LA SESIÓN DEL CRM DURA 24 HORAS, NO UNA RECARGA — 23 de octubre de 2026
 *
 *   node --test pruebas/la-sesion-dura-24-horas.test.js
 *
 * Joan: «quiero que si yo actualizo mi CRM no me lleve a nuevamente ingresar
 * mi usuario y contraseña, quiero que quede guardado, y que se cierre cada 24
 * horas, no cada vez que actualice».
 *
 * Por qué pedía todo en cada recarga (crm.html, antes de este cambio):
 *   · Joan: entrar() comparaba el PIN y escondía #gate con style.display. Nada
 *     quedaba escrito: un F5 volvía a pintar la puerta.
 *   · el equipo: SESION_EQUIPO era un `let` en memoria; al recargar volvía a
 *     null y la puerta pedía celular y contraseña otra vez.
 *
 * Aquí corre crm.html DE VERDAD en el banco (banco-panel.js) con un reloj de
 * mentira (reloj.js): «recargar» es volver a abrir la página con el MISMO
 * almacén (`almacen: A`) y otra hora. Las 24 h se cuentan desde que entró.
 *
 * Las que dicen «control» pasan antes y después: están para que el arreglo no
 * deje la puerta abierta de más. Todas las demás FALLAN con bb08698.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { relojFijo } = require('./reloj.js');
const { asentar } = require('./esperar.js');

const PIN = '4821';
const LLAVE_DUENO = 'tg_crm_sesion_dueno';
const LLAVE_EQUIPO = 'tg_crm_sesion_equipo';

/* Viernes 23-oct-2026, 10:30 de la mañana, hora local: las horas se escriben
   SIN zona para que el «mañana, 10:30 a. m.» no dependa de dónde corra. */
const ENTRA = '2026-10-23T10:30:00';
const DOS_HORAS = '2026-10-23T12:30:00';
const MEDIANOCHE = '2026-10-24T00:30:00';
const VEINTITRES_HORAS = '2026-10-24T09:30:00';
const VEINTICUATRO_Y_UN_MIN = '2026-10-24T10:31:00';
const ms = iso => new Date(iso).getTime();

const abierto = P => !!(P.elems.app && P.elems.app.style.display === 'grid' &&
  P.elems.gate && P.elems.gate.style.display === 'none');
const puertaEncima = P => !!(P.elems.gate && P.elems.gate.style.display !== 'none');
const marca = (A, llave) => (A[llave] ? JSON.parse(A[llave]) : null);
const sinEtiquetas = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cambiarHora = (P, iso) => { P.ctx.Date = relojFijo(iso); };
const toque = () => {
  const e = { type: 'pointerdown', frenado: false, target: null };
  e.preventDefault = () => { e.frenado = true; };
  e.stopPropagation = () => {};
  e.stopImmediatePropagation = () => {};
  return e;
};

/* ------------------------------------------------------------------ Joan */
function abrirDeJoan(iso, A) {
  const P = abrirPanel({ ahora: iso, almacen: A });
  if (!A) P.cargarCartera({ socios: [], prestamos: [], config: { pin: PIN } });
  return P;
}
function entrarConPin(P, pin) {
  P.ctx.document.getElementById('pinInput').value = pin || PIN;
  P.ev('entrar()');
}

describe('Joan: recargar no vuelve a pedir el PIN mientras no pasen 24 horas desde que entró', () => {

  test('entra con el PIN y recarga a las 2 h: entra solo, sin la puerta', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    assert.ok(abierto(P), 'el caso de prueba no llegó a entrar');
    const Q = abrirDeJoan(DOS_HORAS, P.almacen);
    assert.ok(abierto(Q), 'recargar volvió a pedir el PIN: la sesión no quedó guardada');
  });

  test('las 24 h cuentan DESDE QUE ENTRÓ: a las 23 h sigue, y recargar no las alarga', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    const hasta = marca(P.almacen, LLAVE_DUENO).hasta;
    assert.equal(hasta, ms(ENTRA) + 24 * 3600 * 1000, 'la sesión no vence a las 24 h de haber entrado');
    const Q = abrirDeJoan(VEINTITRES_HORAS, P.almacen);
    assert.ok(abierto(Q), 'a las 23 h ya pedía el PIN');
    assert.equal(marca(Q.almacen, LLAVE_DUENO).hasta, hasta, 'recargar movió la hora de cierre');
  });

  test('control: a las 24 h, la próxima vez que abre pide el PIN, y la marca vencida se borra', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    const Q = abrirDeJoan(VEINTICUATRO_Y_UN_MIN, P.almacen);
    assert.equal(abierto(Q), false, 'pasadas las 24 h abrió sin el PIN');
    assert.equal(Q.almacen[LLAVE_DUENO], undefined, 'la marca vencida se quedó guardada');
  });

  test('control: sin haber entrado, abrir pide el PIN como siempre', () => {
    const P = abrirDeJoan(ENTRA);
    assert.equal(abierto(P), false);
    const Q = abrirDeJoan(DOS_HORAS, P.almacen);
    assert.equal(abierto(Q), false);
  });

  test('control: un PIN equivocado no abre ni guarda nada', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P, '0000');
    assert.equal(abierto(P), false);
    assert.equal(P.almacen[LLAVE_DUENO], undefined);
    assert.equal(P.elems.pinErr.textContent, 'PIN incorrecto.');
  });

  test('lo guardado es la SESIÓN, no la clave: ni el PIN ni nada que lo nombre, y el campo queda vacío', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    const crudo = P.almacen[LLAVE_DUENO];
    assert.ok(crudo, 'no se guardó la sesión');
    assert.equal(crudo.indexOf(PIN) >= 0, false, 'el PIN quedó escrito en la marca');
    assert.equal(/pin|clave|password/i.test(crudo), false, 'la marca guarda algo con nombre de clave: ' + crudo);
    assert.deepEqual(Object.keys(JSON.parse(crudo)).sort(), ['desde', 'hasta', 'id', 'tipo', 'v']);
    assert.equal(P.elems.pinInput.value, '', 'el PIN se quedó escrito en el campo de la puerta');
  });

  test('«Salir ahora» lo borra en el acto: la puerta sale, y recargar vuelve a pedir el PIN', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    P.ev('salirAhora()');
    assert.equal(P.almacen[LLAVE_DUENO], undefined, '«Salir ahora» dejó la sesión guardada');
    assert.ok(puertaEncima(P), '«Salir ahora» no puso la puerta');
    const Q = abrirDeJoan(DOS_HORAS, P.almacen);
    assert.equal(abierto(Q), false, 'después de «Salir ahora», recargar entró solo');
  });
});

describe('Joan, con el CRM abierto cuando se cumplen las 24 h', () => {

  test('al siguiente toque sale la puerta, el toque no pasa, y lo escrito sigue ahí', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    P.ev('var _repintadas = 0; var _render0 = render; render = function () { _repintadas++; return _render0.apply(this, arguments); };');
    P.ctx.document.getElementById('buscaGlobal').value = 'Mar';
    cambiarHora(P, VEINTICUATRO_Y_UN_MIN);
    const e = toque();
    P.ctx.__toque = e;
    P.ev('alTocarConSesion(__toque)');
    assert.ok(puertaEncima(P), 'pasadas las 24 h, el toque no pidió el PIN');
    assert.ok(e.frenado, 'el toque pasó al CRM aunque la sesión ya había vencido');
    assert.match(P.elems.pinErr.textContent, /24 horas/, 'la puerta no dice por qué volvió');
    assert.equal(P.almacen[LLAVE_DUENO], undefined, 'la sesión vencida se quedó guardada');
    entrarConPin(P);
    assert.equal(P.elems.gate.style.display, 'none', 'con el PIN no se quitó la puerta');
    assert.equal(P.ev('_repintadas'), 0, 'volver a entrar repintó el CRM: lo que estaba a medio escribir se pierde');
    assert.equal(P.elems.buscaGlobal.value, 'Mar', 'lo que estaba escrito se perdió');
    assert.equal(marca(P.almacen, LLAVE_DUENO).hasta, ms(VEINTICUATRO_Y_UN_MIN) + 24 * 3600 * 1000,
      'la sesión nueva no cuenta 24 h desde que volvió a entrar');
  });

  test('antes de las 24 h el toque pasa sin pedir nada: la vigilia no frena de más', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    cambiarHora(P, VEINTITRES_HORAS);
    const e = toque();
    P.ctx.__toque = e;
    P.ev('alTocarConSesion(__toque)');
    assert.equal(e.frenado, false);
    assert.equal(P.elems.gate.style.display, 'none');
  });

  test('el reloj también la cierra: a las 24 h la puerta sale aunque nadie toque', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    cambiarHora(P, VEINTICUATRO_Y_UN_MIN);
    P.ev('vigilarSesion()');
    assert.ok(puertaEncima(P));
  });

  test('«Salir ahora» en OTRA pestaña la cierra aquí al siguiente toque', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    delete P.almacen[LLAVE_DUENO];   // lo que deja la otra pestaña
    const e = toque();
    P.ctx.__toque = e;
    P.ev('alTocarConSesion(__toque)');
    assert.ok(puertaEncima(P), 'la sesión cerrada en otra pestaña siguió abierta en ésta');
    assert.ok(e.frenado);
  });
});

describe('la línea «Sesión abierta hasta …» con «Salir ahora»', () => {

  test('dice hasta cuándo, con «mañana» y la hora, y trae la salida', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    const h = String(P.elems.sesionCinta.innerHTML);
    assert.match(sinEtiquetas(h), /Sesión abierta hasta mañana, 10:30 a\. m\./);
    assert.match(h, /onclick="salirAhora\(\)"[^>]*>Salir ahora</);
  });

  test('pasada la medianoche dice «hoy»', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    cambiarHora(P, MEDIANOCHE);
    P.ev('vigilarSesion()');
    assert.match(sinEtiquetas(P.elems.sesionCinta.innerHTML), /Sesión abierta hasta hoy, 10:30 a\. m\./);
  });

  test('al recargar dentro de las 24 h dice la MISMA hora de cierre', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    const Q = abrirDeJoan(DOS_HORAS, P.almacen);
    assert.match(sinEtiquetas(Q.elems.sesionCinta.innerHTML), /hasta mañana, 10:30 a\. m\./);
  });

  test('si el navegador no deja guardar, NO promete que sobrevive a recargar', () => {
    const P = abrirPanel({ ahora: ENTRA, topeKB: 0.01 });
    P.cargarCartera({ socios: [], prestamos: [], config: { pin: PIN } });
    entrarConPin(P);
    assert.ok(abierto(P), 'sin dónde guardar, ni siquiera entró');
    const t = sinEtiquetas(P.elems.sesionCinta.innerHTML);
    assert.match(t, /no (me )?deja guardar/i, 'la línea no dice que la sesión no quedó guardada: ' + t);
    assert.match(t, /PIN otra vez/);
  });
});

/* ---------------------------------------------------------------- equipo */
const WILLIAN = '3000000000';
const OTRO = '3011111111';
const CLAVE = 'abcd-efgh';

/* Un Supabase de mentira. Cada token sabe de quién es, para que mi_cartera
   conteste por la persona del token (como el servidor de verdad). */
function nube(o) {
  o = o || {};
  const pedidos = [];
  const deQuien = {};
  let n = 0;
  const r = (status, j) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j) });
  const fetch = (url, cfg) => {
    url = String(url);
    const cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : {};
    const auth = (cfg && cfg.headers && cfg.headers.Authorization) || '';
    pedidos.push({ url, cuerpo, auth });
    if (G.sinRed) return Promise.reject(new TypeError('Failed to fetch'));
    if (/grant_type=password/.test(url)) {
      if (cuerpo.password !== CLAVE) return r(400, { error: 'invalid_grant' });
      n++; deQuien['tok-' + n] = cuerpo.email; deQuien['ref-' + n] = cuerpo.email;
      return r(200, { access_token: 'tok-' + n, refresh_token: 'ref-' + n, expires_in: 3600 });
    }
    if (/grant_type=refresh_token/.test(url)) {
      if (G.refrescoMuerto) return r(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
      const quien = deQuien[cuerpo.refresh_token];
      n++; deQuien['tok-' + n] = quien; deQuien['ref-' + n] = quien;
      return r(200, { access_token: 'tok-' + n, refresh_token: 'ref-' + n, expires_in: 3600 });
    }
    if (/\/auth\/v1\/logout/.test(url)) return r(204, {});
    if (/\/rpc\/mi_cartera/.test(url)) {
      if (G.sinPuesto) return r(200, { ok: false });   // Joan le quitó el puesto
      const correo = deQuien[auth.replace(/^Bearer /, '')] || '';
      const tel = correo.replace(/\D/g, '').slice(-10);
      return r(200, { ok: true, yo: { nombre: tel === OTRO ? 'Otra Persona' : 'Willian Prueba', rol: 'gerente', celular: tel },
        equipo: [], gente: [] });
    }
    return r(200, []);
  };
  const G = { fetch, pedidos, sinRed: !!o.sinRed, refrescoMuerto: !!o.refrescoMuerto };
  return G;
}
function abrirEquipo(iso, G, A, hash) {
  const P = abrirPanel({ ahora: iso, red: G.fetch, almacen: A, hash: hash == null ? '#equipo' : hash });
  P.ctx.CuentaSocio = require('../app/cuenta.js');
  P.ctx.scrollTo = () => {};
  P.recargas = 0;
  P.ctx.location.reload = () => { P.recargas++; };
  if (!A) P.cargarCartera({ socios: [], prestamos: [], config: { pin: PIN } });
  return P;
}
async function entrarEquipo(P, tel) {
  P.ctx.document.getElementById('eqTelIn').value = tel || WILLIAN;
  P.ctx.document.getElementById('eqClaveIn').value = CLAVE;
  P.ev('entrarEquipo()');
  await asentar();
}
const quienEntro = P => P.ev('CARTERA_EQUIPO && CARTERA_EQUIPO.yo && CARTERA_EQUIPO.yo.nombre');

describe('el equipo (Willian y los asesores): recargar no pide celular y contraseña', () => {

  test('entra y recarga a las 2 h: vuelve a su CRM solo, renovando el token por su cuenta', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    assert.equal(quienEntro(P), 'Willian Prueba', 'el caso de prueba no llegó a entrar');
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen);
    await asentar();
    assert.equal(quienEntro(Q), 'Willian Prueba', 'recargar volvió a pedir celular y contraseña');
    /* A las 2 h el token de 1 h ya venció: se renovó solo y quedó guardado
       el par NUEVO (Supabase rota el refresh_token: el viejo ya no sirve). */
    assert.ok(G.pedidos.some(x => /grant_type=refresh_token/.test(x.url)), 'no renovó el token vencido');
    const g = marca(Q.almacen, LLAVE_EQUIPO);
    assert.equal(g.access_token, 'tok-2');
    assert.equal(g.refresh_token, 'ref-2', 'quedó guardado el refresh_token gastado');
    assert.equal(g.hasta, ms(ENTRA) + 24 * 3600 * 1000, 'renovar el token movió las 24 h');
  });

  test('la contraseña no se guarda en ninguna parte', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    assert.ok(P.almacen[LLAVE_EQUIPO], 'no se guardó la sesión');
    assert.equal(JSON.stringify(P.almacen).indexOf(CLAVE) >= 0, false, 'la contraseña quedó en el almacén');
    assert.equal(P.elems.eqClaveIn.value, '', 'la contraseña se quedó escrita en el campo de la puerta');
  });

  test('control: a las 24 h desde que entró, abrir pide entrar otra vez (aunque el token se haya renovado entre medias)', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen);
    await asentar();
    const antes = G.pedidos.length;
    const R = abrirEquipo(VEINTICUATRO_Y_UN_MIN, G, P.almacen);
    await asentar();
    assert.equal(quienEntro(R), null, 'pasadas las 24 h entró sin contraseña');
    assert.equal(R.almacen[LLAVE_EQUIPO], undefined, 'la sesión vencida se quedó guardada');
    assert.equal(G.pedidos.slice(antes).some(x => /mi_cartera/.test(x.url)), false, 'con la sesión vencida le preguntó a la nube');
  });

  test('entra con su celular sin #equipo en la dirección (el enlace que le manda Joan) y recarga: sigue adentro', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G, null, '');
    await entrarEquipo(P);
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen, '');
    await asentar();
    assert.equal(quienEntro(Q), 'Willian Prueba');
  });

  test('si la nube ya no reconoce la sesión antes de las 24 h, lo dice claro y la borra', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    G.refrescoMuerto = true;
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen);
    await asentar();
    assert.equal(quienEntro(Q), null);
    assert.equal(Q.almacen[LLAVE_EQUIPO], undefined, 'la sesión muerta se quedó guardada');
    assert.match(sinEtiquetas(Q.elems.eqErr.innerHTML), /sesión se cerró/i, 'no dice por qué vuelve a pedir la contraseña');
  });

  test('a quien Joan le quitó el puesto, recargar le cierra la sesión guardada (no se queda probándola)', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    G.sinPuesto = true;
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen);
    await asentar();
    assert.equal(quienEntro(Q), null);
    assert.equal(Q.almacen[LLAVE_EQUIPO], undefined, 'la sesión de alguien sin puesto se quedó guardada');
    assert.match(sinEtiquetas(Q.elems.eqErr.innerHTML), /sesión se cerró/i);
  });

  test('sin señal al recargar NO borra la sesión: dice que no pudo conectarse y deja reintentar', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    G.sinRed = true;
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen);
    await asentar();
    assert.ok(Q.almacen[LLAVE_EQUIPO], 'sin señal borró la sesión: con señal tendría que volver a escribir la contraseña');
    const t = sinEtiquetas(Q.elems.eqErr.innerHTML);
    assert.match(t, /No pude conectarme/);
    assert.match(String(Q.elems.eqErr.innerHTML), /reintentarSesionEquipo\(\)/);
    G.sinRed = false;
    Q.ev('reintentarSesionEquipo()');
    await asentar();
    assert.equal(quienEntro(Q), 'Willian Prueba', '«Reintentar» no entró');
  });

  test('otra pestaña ya renovó el token: se toma el suyo y no se gasta el refresh dos veces', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    const g = marca(P.almacen, LLAVE_EQUIPO);
    /* La otra pestaña renovó a las 11:30 y dejó escrito el par nuevo. */
    P.almacen[LLAVE_EQUIPO] = JSON.stringify(Object.assign({}, g,
      { access_token: 'tok-otra', refresh_token: 'ref-otra', expira_en: ms('2026-10-23T12:30:00') }));
    cambiarHora(P, '2026-10-23T11:45:00');
    const antes = G.pedidos.length;
    assert.equal(await P.ev('tokenDeEquipo()'), 'tok-otra');
    assert.equal(G.pedidos.slice(antes).some(x => /grant_type=refresh_token/.test(x.url)), false,
      'renovó con el refresh_token que la otra pestaña ya había gastado');
  });

  test('sin señal al renovar NO es fin de sesión: se queda, y el error dice que es la señal', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    cambiarHora(P, DOS_HORAS);
    G.sinRed = true;
    let e = null;
    try { await P.ev('tokenDeEquipo()'); } catch (x) { e = x; }
    assert.ok(e, 'sin señal devolvió un token');
    P.ctx.__e = e;
    assert.equal(P.ev('esFinDeSesion(__e)'), false, 'sin señal se tomó por sesión vencida');
    assert.match(String(e.message || ''), /señal/, 'el error no dice que es la señal: ' + (e.message || e));
    assert.ok(P.almacen[LLAVE_EQUIPO], 'sin señal borró la sesión guardada');
    assert.ok(P.ev('SESION_EQUIPO !== null'));
  });
});

describe('una sesión no sirve para otra', () => {

  test('la sesión del equipo no abre el CRM de Joan, ni la de Joan el del equipo', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    const Q = abrirDeJoan(DOS_HORAS, P.almacen);   // sin red ni #equipo
    await asentar();
    assert.equal(Q.ev('_crmAbierto'), false, 'la sesión del gerente abrió la cartera de Joan');
    const J = abrirDeJoan(ENTRA);
    entrarConPin(J);
    const K = abrirEquipo(DOS_HORAS, nube(), J.almacen);   // #equipo con la marca de Joan
    await asentar();
    assert.equal(quienEntro(K), null, 'la marca de Joan entró al modo equipo');
  });

  test('un gerente que entra en el computador de Joan cierra la sesión de Joan', async () => {
    const G = nube();
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    assert.ok(P.almacen[LLAVE_DUENO]);
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen);
    await entrarEquipo(Q);
    assert.equal(Q.almacen[LLAVE_DUENO], undefined, 'la cartera de Joan quedó abierta detrás del gerente');
    const R = abrirDeJoan(DOS_HORAS, P.almacen);
    assert.equal(R.ev('_crmAbierto'), false);
  });

  test('a las 24 h, con el modo equipo abierto: la puerta sale con su celular; él mismo vuelve sin repintar', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    P.ev('var _modos = 0; var _modo0 = modoEquipo; modoEquipo = function () { _modos++; return _modo0.apply(this, arguments); };');
    cambiarHora(P, VEINTICUATRO_Y_UN_MIN);
    const e = toque();
    P.ctx.__toque = e;
    P.ev('alTocarConSesion(__toque)');
    assert.ok(puertaEncima(P) && e.frenado, 'pasadas las 24 h el modo equipo siguió sin pedir nada');
    assert.equal(P.elems.eqTelIn.value, WILLIAN, 'la puerta no trae su celular');
    assert.match(sinEtiquetas(P.elems.eqErr.innerHTML), /24 horas/);
    await entrarEquipo(P, WILLIAN);
    assert.equal(P.elems.gate.style.display, 'none');
    assert.equal(P.ev('_modos'), 0, 'volver a entrar repintó el modo equipo');
    assert.equal(P.recargas, 0);
    assert.ok(marca(P.almacen, LLAVE_EQUIPO), 'la sesión nueva no quedó guardada');
  });

  test('en esa puerta entra OTRO celular: la página se recarga entera (lo de pantalla es del anterior)', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    cambiarHora(P, VEINTICUATRO_Y_UN_MIN);
    const e = toque();
    P.ctx.__toque = e;
    P.ev('alTocarConSesion(__toque)');
    await entrarEquipo(P, OTRO);
    assert.equal(P.recargas, 1, 'otra persona heredó la pantalla de Willian');
    assert.equal(marca(P.almacen, LLAVE_EQUIPO).tel, OTRO);
  });

  test('«Salir ahora» del equipo: lo borra todo, cierra la sesión en la nube (solo la de este aparato) y recarga', async () => {
    const G = nube();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    P.ev('salirAhora()');
    await asentar();
    assert.equal(P.almacen[LLAVE_EQUIPO], undefined);
    assert.equal(P.ev('SESION_EQUIPO'), null);
    const salida = G.pedidos.find(x => /\/auth\/v1\/logout/.test(x.url));
    assert.ok(salida, 'no le avisó a la nube: el refresh_token sigue sirviendo');
    assert.match(salida.url, /scope=local/, 'cerró la sesión de TODOS sus aparatos, no la de éste');
    assert.equal(P.recargas, 1);
  });
});
