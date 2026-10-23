'use strict';
/* ==========================================================================
 * LA SESIÓN DE 24 HORAS, SIN HUECOS — 23 de octubre de 2026 (segunda vuelta)
 *
 *   node --test pruebas/la-sesion-de-24-horas-sin-huecos.test.js
 *
 * La primera vuelta (d03dcf4, pruebas/la-sesion-dura-24-horas.test.js) hizo
 * lo que Joan pidió: «que si yo actualizo mi crm no me lleve a nuevamente
 * ingresar mi usuario y contraseña … y que se cierre cada 24 horas». Una
 * auditoría adversaria le encontró cinco huecos que el refutador no pudo
 * tumbar. Cada `describe` de abajo es uno, y TODAS sus pruebas fallan con
 * d03dcf4:
 *
 *   1. LA PUERTA TAPABA, PERO NO CERRABA. Tras «Salir ahora» (o a las 24 h)
 *      la puerta opaca salía encima, pero el CRM de debajo seguía en el orden
 *      del teclado: con Tab y Enter se llegaba a Ajustes, al PIN escrito en
 *      claro y al respaldo de la cartera entera.
 *   2. «← SOY JOAN» RECARGABA, y la recarga volvía a entrar como el equipo:
 *      después de que un gerente entraba en el computador de Joan, Joan sin
 *      señal no llegaba a su PIN en hasta 24 h; con señal, su propio CRM lo
 *      metía al modo gerente de Willian.
 *   3. LA NUBE DEJABA DE RECONOCER LA SESIÓN y la pantalla mentía: la línea
 *      de la barra seguía diciendo «Al recargar no te pido tu contraseña», y
 *      la puerta culpaba a «otra pestaña o Salir ahora». Y un 503 de Supabase
 *      borraba la sesión como si la hubieran revocado.
 *   4. LAS 24 H NO CERRABAN NADA EN SUPABASE. Al vencer se borraba la copia
 *      del navegador sin avisarle a la nube, y «Salir ahora» después de una
 *      hora quieta mandaba el logout con un token vencido (401): la sesión
 *      quedaba viva en el servidor.
 *   5. CON DOS PESTAÑAS, la quieta renovaba con un refresh_token que la otra
 *      ya había rotado dos veces: Supabase lo toma por robado, revoca la
 *      familia, y las dos pestañas y el F5 quedaban afuera antes de las 24 h.
 *
 * El navegador es el banco del CRM (banco-panel.js, con `tarjeta: true` para
 * ver qué tarjeta muestra la puerta), el reloj es de mentira (reloj.js) y la
 * nube es un Supabase de mentira FIEL a GoTrue en lo que aquí importa: el
 * access_token vence a la hora, /logout exige uno vigente, los refresh_token
 * no vencen por tiempo y se rotan (el padre del activo se acepta; cualquier
 * otro reúso, pasados 10 s, revoca la familia entera).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { relojFijo } = require('./reloj.js');
const { asentar } = require('./esperar.js');

const PIN = '4821';
const CLAVE = 'abcd-efgh';
const WILLIAN = '3000000000';
const LLAVE_DUENO = 'tg_crm_sesion_dueno';
const LLAVE_EQUIPO = 'tg_crm_sesion_equipo';
/* La cartera de Joan, con un socio: en su computador la cartera TIENE gente,
   y eso es lo que distingue su navegador del celular de un gerente. */
const CARTERA = { socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567', gestiones: [] }],
  prestamos: [], config: { pin: PIN } };

/* Viernes 23-oct-2026, hora local (sin zona, como la primera vuelta). */
const ENTRA = '2026-10-23T10:30:00';
const DOS_HORAS = '2026-10-23T12:30:00';
const VEINTICUATRO_Y_UN_MIN = '2026-10-24T10:31:00';
const ms = iso => new Date(iso).getTime();

const puertaEncima = P => !!(P.elems.gate && P.elems.gate.style.display !== 'none');
const sinEtiquetas = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tarjeta = P => String(P.elems['gate-card'].innerHTML || '');
const cinta = P => sinEtiquetas(P.elems.sesionCinta && P.elems.sesionCinta.innerHTML);
const quienEntro = P => P.ev('CARTERA_EQUIPO && CARTERA_EQUIPO.yo && CARTERA_EQUIPO.yo.nombre');
const hora = (P, G, iso) => { P.ctx.Date = relojFijo(iso); if (G) G.reloj = ms(iso); };
/* Lo que hace el botón: su onclick, tal cual lo escribió la página. */
const tocarBoton = (P, texto) => {
  const m = tarjeta(P).match(new RegExp('onclick="([^"]+)"[^>]*>\\s*' + texto));
  assert.ok(m, 'la puerta no tiene el botón «' + texto + '»:\n' + tarjeta(P));
  P.ev(m[1]);
};
const evento = (tipo, target, key) => {
  const e = { type: tipo, key: key || '', target: target || null, frenado: false };
  e.preventDefault = () => { e.frenado = true; };
  e.stopPropagation = () => {};
  e.stopImmediatePropagation = () => {};
  return e;
};
const despachar = (P, fn, e) => { P.ctx.__e = e; P.ev(fn + '(__e)'); return e; };

/* ------------------------------------------------- la nube, fiel a GoTrue */
function gotrue() {
  const G = { pedidos: [], reloj: ms(ENTRA), sinRed: false, caida: 0, familiasRevocadas: 0 };
  const sesiones = {};    // sid → { correo, viva, tokens: [{ rt, padre, revocado, revocadoEn }] }
  const accesos = {};     // access_token → { sid, correo, vence }
  const refrescos = {};   // refresh_token → sid
  let n = 0;
  const r = (status, j) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j) });
  const nuevoAcceso = sid => { n++; const at = 'tok-' + n; accesos[at] = { sid, correo: sesiones[sid].correo, vence: G.reloj + 3600e3 }; return at; };
  const nuevoRefresco = (sid, padre) => { n++; const rt = 'ref-' + n; refrescos[rt] = sid; sesiones[sid].tokens.push({ rt, padre, revocado: false }); return rt; };
  /* Un JWT vale mientras no venza y su sesión exista: lo que mira PostgREST
     (que no mira la sesión: aquí sí, para que una sesión cerrada se note). */
  const vigente = auth => {
    const a = accesos[String(auth || '').replace(/^Bearer /, '')];
    return a && a.vence > G.reloj && sesiones[a.sid].viva ? a : null;
  };
  G.fetch = (url, cfg) => {
    url = String(url);
    const cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : {};
    const auth = (cfg && cfg.headers && cfg.headers.Authorization) || '';
    G.pedidos.push({ url, cuerpo, auth, hora: G.reloj });
    if (G.sinRed) return Promise.reject(new TypeError('Failed to fetch'));
    if (/grant_type=password/.test(url)) {
      if (cuerpo.password !== CLAVE) return r(400, { error: 'invalid_grant' });
      const sid = 's' + (++n);
      sesiones[sid] = { correo: cuerpo.email, viva: true, tokens: [] };
      return r(200, { access_token: nuevoAcceso(sid), refresh_token: nuevoRefresco(sid, null), expires_in: 3600 });
    }
    if (/grant_type=refresh_token/.test(url)) {
      if (G.caida) return r(G.caida, { code: G.caida, msg: 'Service Unavailable' });
      const sid = refrescos[cuerpo.refresh_token];
      const S = sid && sesiones[sid];
      if (!S || !S.viva) return r(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
      const t = S.tokens.find(x => x.rt === cuerpo.refresh_token);
      const activo = S.tokens.filter(x => !x.revocado).pop();
      if (t.revocado) {
        /* El padre del activo: el cliente no alcanzó a guardar la última
           renovación. GoTrue lo acepta y devuelve el activo. */
        if (activo && activo.padre === t.rt) return r(200, { access_token: nuevoAcceso(sid), refresh_token: activo.rt, expires_in: 3600 });
        if (G.reloj > t.revocadoEn + 10e3) {
          S.viva = false; S.tokens.forEach(x => { x.revocado = true; }); G.familiasRevocadas++;
          return r(400, { error: 'invalid_grant', error_code: 'refresh_token_already_used' });
        }
      }
      t.revocado = true; t.revocadoEn = G.reloj;
      return r(200, { access_token: nuevoAcceso(sid), refresh_token: nuevoRefresco(sid, t.rt), expires_in: 3600 });
    }
    if (/\/auth\/v1\/logout/.test(url)) {
      const a = vigente(auth);
      if (!a) return r(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired' });
      sesiones[a.sid].viva = false;
      return r(204, {});
    }
    if (/\/rest\/v1\/rpc\//.test(url)) {
      const a = vigente(auth);
      if (!a) return r(401, { code: 'PGRST301', message: 'JWT expired' });
      if (/\/rpc\/mi_cartera/.test(url)) {
        const tel = a.correo.replace(/\D/g, '').slice(-10);
        return r(200, { ok: true, yo: { nombre: 'Willian Prueba', rol: 'gerente', celular: tel }, equipo: [], gente: [] });
      }
      return r(200, []);
    }
    return r(200, []);
  };
  G.vivas = () => Object.keys(sesiones).filter(k => sesiones[k].viva).length;
  /* Lo que hace Supabase cuando él cambia su contraseña en otro aparato o
     Joan le pone otra: las sesiones abiertas dejan de existir. */
  G.revocarTodas = () => { Object.keys(sesiones).forEach(k => { sesiones[k].viva = false; }); };
  G.cuantos = re => G.pedidos.filter(x => re.test(x.url)).length;
  return G;
}

/* ------------------------------------------------------- abrir la página */
function abrirDeJoan(iso, A, G) {
  if (G) G.reloj = ms(iso);
  const P = abrirPanel({ ahora: iso, almacen: A, tarjeta: true, red: G ? G.fetch : undefined });
  if (!A) P.cargarCartera(CARTERA);
  P.ctx.scrollTo = () => {};
  P.recargas = 0;
  P.ctx.location.reload = () => { P.recargas++; };
  return P;
}
function entrarConPin(P, pin) {
  P.ctx.document.getElementById('pinInput').value = pin || PIN;
  P.ev('entrar()');
}
function abrirEquipo(iso, G, A, hash) {
  G.reloj = ms(iso);
  const P = abrirPanel({ ahora: iso, red: G.fetch, almacen: A, hash: hash == null ? '#equipo' : hash, tarjeta: true });
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

/* ======================================================================== */
describe('1 · con la puerta encima, el CRM de debajo no se maneja con el teclado', () => {

  test('«Salir ahora»: lo de debajo sale del teclado y del lector de pantalla (inert, aria-hidden), y vuelve con el PIN', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    assert.notEqual(P.elems.app.inert, true, 'el CRM arrancó tapado');
    P.ev('salirAhora()');
    assert.ok(puertaEncima(P), 'el caso de prueba no puso la puerta');
    assert.equal(P.elems.app.inert, true,
      'la puerta dice «Cerraste la sesión» y el CRM de debajo sigue al alcance de Tab (Ajustes → el PIN, el respaldo)');
    assert.equal((P.elems.app._attrs || {})['aria-hidden'], 'true', 'el lector de pantalla sigue leyendo la cartera de debajo');
    assert.equal(P.ctx.document.getElementById('modal').inert, true, 'una ficha o una cédula abierta en el modal sigue al alcance del teclado');
    entrarConPin(P);
    assert.equal(P.elems.gate.style.display, 'none');
    assert.equal(P.elems.app.inert, false, 'con el PIN, el CRM se quedó sin teclado');
    assert.equal((P.elems.app._attrs || {})['aria-hidden'], undefined, 'con el PIN, el CRM se quedó escondido del lector de pantalla');
  });

  test('donde no hay inert: la tecla que sale de un botón de debajo no pasa y el foco vuelve a la puerta; la del PIN sí pasa', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    P.ev('salirAhora()');
    const $ = id => P.ctx.document.getElementById(id);
    $('gate').contains = n => n === $('pinInput') || n === $('pinBtn');
    let enfocado = 0;
    $('pinInput').focus = () => { enfocado++; };
    const abajo = despachar(P, 'alTocarConSesion', evento('keydown', $('buscaGlobal'), 'Enter'));
    assert.ok(abajo.frenado, 'con la puerta encima, Enter en un botón del CRM de debajo pasó');
    assert.ok(enfocado > 0, 'el foco se quedó debajo de la puerta');
    const pin = despachar(P, 'alTocarConSesion', evento('keydown', $('pinInput'), 'Enter'));
    assert.equal(pin.frenado, false, 'frenó el Enter del propio campo del PIN');
    /* El clic que Enter o Espacio disparan en un botón de debajo, y el foco
       que llega ahí con Tab, tampoco pasan. */
    const clic = despachar(P, 'alActuarBajoLaPuerta', evento('click', $('buscaGlobal')));
    assert.ok(clic.frenado, 'con la puerta encima, un clic en el CRM de debajo pasó');
    const antes = enfocado;
    despachar(P, 'alActuarBajoLaPuerta', evento('focusin', $('buscaGlobal')));
    assert.ok(enfocado > antes, 'el foco se quedó en el CRM de debajo');
  });

  test('a las 24 h también tapa: el CRM de Joan con el reloj, y el modo equipo, que se destapa cuando él mismo vuelve', async () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    hora(P, null, VEINTICUATRO_Y_UN_MIN);
    P.ev('vigilarSesion()');
    assert.ok(puertaEncima(P));
    assert.equal(P.elems.app.inert, true, 'a las 24 h la puerta salió, pero el CRM de debajo sigue al alcance del teclado');

    const G = gotrue();
    const Q = abrirEquipo(ENTRA, G);
    await entrarEquipo(Q);
    hora(Q, G, VEINTICUATRO_Y_UN_MIN);
    despachar(Q, 'alTocarConSesion', evento('pointerdown'));
    assert.ok(puertaEncima(Q));
    assert.equal(Q.elems.app.inert, true, 'a las 24 h el modo equipo de debajo sigue al alcance del teclado');
    await entrarEquipo(Q, WILLIAN);
    assert.equal(Q.elems.gate.style.display, 'none');
    assert.equal(Q.elems.app.inert, false, 'volvió a entrar y el modo equipo se quedó sin teclado');
  });
});

/* ======================================================================== */
describe('2 · «← Soy Joan» no recarga, y el CRM de Joan abre con su PIN aunque un gerente haya entrado ahí', () => {

  /* Joan entra a las 10:30; Willian entra por crm.html#equipo en el MISMO
     navegador a las 11:00 (eso cierra la sesión de Joan: la primera vuelta lo
     quiere así). */
  async function willianEnElComputadorDeJoan(G) {
    const J = abrirDeJoan(ENTRA, null, G);
    entrarConPin(J);
    const W = abrirEquipo('2026-10-23T11:00:00', G, J.almacen, '#equipo');
    await entrarEquipo(W);
    assert.equal(quienEntro(W), 'Willian Prueba', 'el caso de prueba no llegó a entrar como Willian');
    assert.equal(J.almacen[LLAVE_DUENO], undefined);
    assert.ok(J.almacen[LLAVE_EQUIPO]);
    return J.almacen;
  }

  test('sin señal, Joan abre su CRM: la puerta trae SU campo del PIN, y con el PIN entra (y la sesión del gerente se cierra)', async () => {
    const G = gotrue();
    const A = await willianEnElComputadorDeJoan(G);
    G.sinRed = true;
    const K = abrirEquipo('2026-10-23T14:00:00', G, A, '');
    await asentar();
    assert.match(tarjeta(K), /id="pinInput"/,
      'sin señal, la puerta es la del equipo y no hay dónde escribir el PIN: Joan se queda sin su CRM hasta 24 h');
    entrarConPin(K);
    assert.equal(K.ev('_crmAbierto'), true, 'con su PIN, Joan no entró');
    assert.equal(K.recargas, 0);
    assert.equal(K.almacen[LLAVE_EQUIPO], undefined, 'Joan entró y la sesión del gerente siguió guardada detrás');
  });

  test('con señal, su CRM no lo mete al modo gerente; «Soy del equipo» retoma la de Willian sin pedir la contraseña', async () => {
    const G = gotrue();
    const A = await willianEnElComputadorDeJoan(G);
    const K = abrirEquipo('2026-10-23T14:00:00', G, A, '');
    await asentar();
    assert.equal(quienEntro(K), null, 'Joan abrió su CRM y entró como Willian, en modo gerente');
    assert.match(tarjeta(K), /id="pinInput"/);
    const claves = G.cuantos(/grant_type=password/);
    tocarBoton(K, 'Soy del equipo');
    await asentar();
    assert.equal(quienEntro(K), 'Willian Prueba', '«Soy del equipo» no retomó la sesión guardada de Willian');
    assert.equal(G.cuantos(/grant_type=password/), claves, 'retomarla pidió la contraseña otra vez');
  });

  test('«← Soy Joan» vuelve al PIN sin recargar, suelta la sesión que se estaba retomando y no borra lo guardado', async () => {
    const G = gotrue();
    const P = abrirEquipo(ENTRA, G);           // el celular de Willian: sin cartera de Joan
    await entrarEquipo(P);
    const Q = abrirEquipo(DOS_HORAS, G, P.almacen, '');
    /* La nube todavía no contestó mi_cartera, y se toca «← Soy Joan». */
    tocarBoton(Q, '← Soy Joan');
    assert.equal(Q.recargas, 0, '«← Soy Joan» recargó la página: la recarga vuelve a entrar como el equipo');
    assert.match(tarjeta(Q), /id="pinInput"/, '«← Soy Joan» no volvió a la puerta del PIN');
    await asentar();
    assert.equal(quienEntro(Q), null, 'la respuesta tardía de la nube metió el modo equipo encima de la puerta de Joan');
    assert.ok(Q.almacen[LLAVE_EQUIPO], '«← Soy Joan» borró la sesión guardada del equipo');
  });

  test('«← Soy Joan» con «Entrando…»: esa entrada se suelta, no abre el modo equipo ni guarda nada, y su sesión se cierra en la nube', async () => {
    const G = gotrue();
    const P = abrirEquipo(ENTRA, G);           // crm.html#equipo: la tarjeta del equipo
    P.ctx.document.getElementById('eqTelIn').value = WILLIAN;
    P.ctx.document.getElementById('eqClaveIn').value = CLAVE;
    P.ev('entrarEquipo()');
    tocarBoton(P, '← Soy Joan');               // la nube todavía no contestó
    assert.equal(P.recargas, 0, '«← Soy Joan» recargó la página');
    await asentar();
    assert.equal(quienEntro(P), null, 'la entrada soltada abrió el modo equipo encima de la puerta de Joan');
    assert.equal(P.almacen[LLAVE_EQUIPO], undefined, 'la entrada soltada dejó una sesión guardada');
    assert.equal(G.vivas(), 0, 'la sesión que alcanzó a abrir esa contraseña quedó viva en Supabase');
  });

  test('con la puerta encima del CRM de Joan, «Soy del equipo» y «← Soy Joan» no recargan ni se llevan lo escrito', () => {
    const P = abrirDeJoan(ENTRA);
    entrarConPin(P);
    P.ev('var _repintadas = 0; var _render0 = render; render = function () { _repintadas++; return _render0.apply(this, arguments); };');
    P.ctx.document.getElementById('buscaGlobal').value = 'Mar';
    P.ev('salirAhora()');
    tocarBoton(P, 'Soy del equipo');
    assert.match(tarjeta(P), /id="eqTelIn"/, 'el caso de prueba no llegó a la puerta del equipo');
    tocarBoton(P, '← Soy Joan');
    assert.equal(P.recargas, 0, '«← Soy Joan» recargó: lo que Joan tenía a medio escribir se perdió');
    assert.match(tarjeta(P), /id="pinInput"/);
    assert.match(P.elems.pinErr.textContent, /Cerraste la sesión/, 'la puerta del PIN ya no dice por qué está ahí');
    entrarConPin(P);
    assert.equal(P.elems.gate.style.display, 'none');
    assert.equal(P.ev('_repintadas'), 0, 'volver a entrar repintó el CRM');
    assert.equal(P.elems.buscaGlobal.value, 'Mar', 'lo que estaba escrito se perdió');
  });
});

/* ======================================================================== */
describe('3 · cuando la nube deja de reconocer la sesión, la pantalla dice la verdad', () => {

  test('la puerta sale EN EL ACTO con la razón verdadera, la línea de la barra deja de prometer, y el aviso de la pantalla se suma', async () => {
    const G = gotrue();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    assert.match(cinta(P), /Al recargar no te pido tu contraseña/, 'el caso de prueba no llegó a la línea de la barra');
    hora(P, G, DOS_HORAS);
    G.revocarTodas();          // él cambió su contraseña en el celular, o Joan le puso otra
    let e = null;
    try { await P.ev('rpcEquipo("gestiones_de", {})'); } catch (x) { e = x; }
    assert.ok(e && e.sesion, 'el caso de prueba no llegó a la sesión muerta');
    assert.equal(P.almacen[LLAVE_EQUIPO], undefined);
    assert.ok(puertaEncima(P), 'la nube cerró la sesión y la pantalla siguió como si nada hasta el siguiente toque');
    const t = sinEtiquetas(P.elems.eqErr.innerHTML);
    assert.match(t, /venció por seguridad/, 'la puerta no dice por qué volvió: ' + t);
    assert.doesNotMatch(t, /otra pestaña|Salir ahora/, 'la puerta culpa a algo que no pasó: ' + t);
    assert.doesNotMatch(cinta(P), /Al recargar no te pido/, 'la barra sigue prometiendo que recargar no pide la contraseña');
    P.ev('avisarFinDeSesion("Lo que marcaste no se guardó. ")');
    assert.match(sinEtiquetas(P.elems.eqErr.innerHTML), /Lo que marcaste no se guardó/, 'la puerta se tragó lo que se perdió');
    assert.deepEqual(P.ctx._avisos || [], [], 'además de la puerta salió un alert');
    despachar(P, 'alTocarConSesion', evento('pointerdown'));
    assert.doesNotMatch(sinEtiquetas(P.elems.eqErr.innerHTML), /otra pestaña/, 'el siguiente toque cambió la razón por una falsa');
  });

  test('un 503 de la nube al renovar no es fin de sesión: no la borra, no pone la puerta, y el F5 sigue adentro', async () => {
    const G = gotrue();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    hora(P, G, DOS_HORAS);
    G.caida = 503;
    let e = null;
    try { await P.ev('tokenDeEquipo()'); } catch (x) { e = x; }
    assert.ok(e, 'con la nube caída devolvió un token');
    P.ctx.__e = e;
    assert.equal(P.ev('esFinDeSesion(__e)'), false, 'un 503 se tomó por sesión revocada');
    assert.ok(P.almacen[LLAVE_EQUIPO], 'un 503 borró la sesión guardada: al volver la nube, pediría la contraseña');
    assert.equal(puertaEncima(P), false, 'un 503 puso la puerta');
    G.caida = 0;
    const Q = abrirEquipo('2026-10-23T12:31:00', G, P.almacen);
    await asentar();
    assert.equal(quienEntro(Q), 'Willian Prueba', 'después del 503, el F5 pidió la contraseña antes de las 24 h');
  });
});

/* ======================================================================== */
describe('4 · al cerrarse, la sesión del equipo se cierra también en Supabase', () => {

  test('«Salir ahora» después de una hora quieta: renueva primero y cierra con un token que sirve', async () => {
    const G = gotrue();
    const P = abrirEquipo('2026-10-23T09:00:00', G);
    await entrarEquipo(P);
    assert.equal(G.vivas(), 1);
    hora(P, G, '2026-10-23T10:30:00');      // el token de las 9:00 venció a las 10:00
    P.ev('salirAhora()');
    await asentar();
    assert.equal(P.almacen[LLAVE_EQUIPO], undefined);
    const salidas = G.pedidos.filter(x => /\/auth\/v1\/logout/.test(x.url));
    assert.ok(salidas.length, 'no le avisó a la nube');
    assert.equal(G.vivas(), 0, '«Salir ahora» mandó el logout con el token vencido (401): la sesión sigue viva en Supabase');
    assert.match(salidas[salidas.length - 1].url, /scope=local/, 'cerró las sesiones de TODOS sus aparatos');
    assert.equal(P.recargas, 1);
  });

  test('al reabrir pasadas las 24 h, la sesión guardada se cierra en la nube antes de borrarse', async () => {
    const G = gotrue();
    const P = abrirEquipo('2026-10-23T09:00:00', G);
    await entrarEquipo(P);
    const Q = abrirEquipo('2026-10-24T09:01:00', G, P.almacen);
    await asentar();
    assert.equal(quienEntro(Q), null);
    assert.equal(Q.almacen[LLAVE_EQUIPO], undefined);
    assert.equal(G.vivas(), 0, 'pasadas las 24 h se borró la copia del navegador y la sesión siguió viva en Supabase');
    assert.equal(G.cuantos(/rpc\/mi_cartera/), 1, 'con la sesión vencida le preguntó a la nube por la cartera');
  });

  test('Joan entra con su PIN donde quedó la sesión de un gerente: se cierra también en la nube, no solo aquí', async () => {
    const G = gotrue();
    const J = abrirDeJoan(ENTRA, null, G);
    entrarConPin(J);
    const W = abrirEquipo('2026-10-23T11:00:00', G, J.almacen, '#equipo');
    await entrarEquipo(W);
    assert.equal(G.vivas(), 1);
    const K = abrirDeJoan('2026-10-23T14:00:00', J.almacen, G);
    entrarConPin(K);
    await asentar();
    assert.equal(K.almacen[LLAVE_EQUIPO], undefined);
    assert.equal(G.vivas(), 0, 'la sesión del gerente se borró de este navegador y siguió viva en Supabase');
  });

  test('a quien Joan le quitó el puesto, recargar le cierra la sesión también en la nube', async () => {
    const G = gotrue();
    const P = abrirEquipo(ENTRA, G);
    await entrarEquipo(P);
    const fetch0 = G.fetch;
    const sinPuesto = (url, cfg) => (/\/rpc\/mi_cartera/.test(String(url))
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: false }) }) : fetch0(url, cfg));
    G.reloj = ms(DOS_HORAS);
    const Q = abrirPanel({ ahora: DOS_HORAS, red: sinPuesto, almacen: P.almacen, hash: '#equipo', tarjeta: true });
    await asentar();
    assert.match(sinEtiquetas(Q.elems.eqErr.innerHTML), /ya no tienes acceso/, 'el caso de prueba no llegó a «sin puesto»');
    assert.equal(Q.almacen[LLAVE_EQUIPO], undefined);
    assert.equal(G.vivas(), 0, 'la sesión sin puesto se borró de este navegador y siguió viva en Supabase');
  });

  test('con el modo equipo abierto a las 24 h: la puerta sale y la sesión se cierra en la nube', async () => {
    const G = gotrue();
    const P = abrirEquipo('2026-10-23T09:00:00', G);
    await entrarEquipo(P);
    hora(P, G, '2026-10-24T09:01:00');
    despachar(P, 'alTocarConSesion', evento('pointerdown'));
    await asentar();
    assert.ok(puertaEncima(P));
    assert.equal(G.vivas(), 0, 'a las 24 h la puerta salió y la sesión siguió viva en Supabase');
  });
});

/* ======================================================================== */
describe('5 · dos pestañas del equipo no se tumban la sesión una a la otra', () => {

  test('la quieta toma el último refresh_token aunque el par guardado ya haya vencido, y nadie vuelve a escribir la contraseña', async () => {
    const G = gotrue();
    const T1 = abrirEquipo('2026-10-23T08:00:00', G);
    await entrarEquipo(T1);
    const T2 = abrirEquipo('2026-10-23T08:01:00', G, T1.almacen);
    await asentar();
    assert.equal(quienEntro(T2), 'Willian Prueba', 'el caso de prueba no abrió la segunda pestaña');
    /* La pestaña 1 trabaja y renueva dos veces; la 2 se queda quieta en el
       tablero con su par de las 8:00. */
    for (const iso of ['2026-10-23T09:10:00', '2026-10-23T10:20:00']) {
      hora(T1, G, iso);
      await T1.ev('tokenDeEquipo()');
    }
    /* 11:30: el token de la pestaña 2 venció a las 9:00 y el guardado a las
       11:20. Antes renovaba con su refresh_token de las 8:00. */
    hora(T2, G, '2026-10-23T11:30:00');
    let e = null;
    try { await T2.ev('tokenDeEquipo()'); } catch (x) { e = x; }
    assert.equal(e, null, 'la pestaña quieta no consiguió token: ' + JSON.stringify(e && (e.message || e)));
    assert.equal(G.familiasRevocadas, 0, 'la pestaña quieta gastó un refresh_token rotado y Supabase revocó la sesión entera');
    assert.ok(T2.almacen[LLAVE_EQUIPO], 'se borró la sesión guardada antes de las 24 h');
    hora(T1, G, '2026-10-23T11:35:00');
    await T1.ev('tokenDeEquipo()');
    const F5 = abrirEquipo('2026-10-23T13:30:00', G, T1.almacen);
    await asentar();
    assert.equal(quienEntro(F5), 'Willian Prueba', 'a las 3 h de entrar, el F5 volvió a pedir celular y contraseña');
  });
});
