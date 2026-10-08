/* ============================================================================
 * UNA SOLA PUERTA EN LA APP DEL SOCIO — app/socio.html y app/sesion-socio.js
 * 7 de octubre de 2026.
 *
 *   node --test pruebas/una-puerta-socio.test.js
 *
 * Joan: «¿Por qué cada cliente necesita un código? Eso ya no debería existir.
 * Quiero que todos se registren igual». Lo que estas pruebas cuidan, en orden
 * de lo que más cuesta si se rompe:
 *
 *   1. LA PUERTA DEL CÓDIGO SE FUE DE LA APP. Ni el campo, ni la llamada, ni
 *      «No tengo mi código», ni el #p=<cédula>-<código> del Panel.
 *   2. UNA CUENTA SIN JUNTAR NO VE NADA DE LA FICHA. Entra, y lo que ve es la
 *      verdad sobre su registro y su chat: ni cupo, ni deuda, ni nombre.
 *   3. LOS ESTADOS DICEN LA VERDAD: contraseña mala y «no tienes cuenta» son
 *      la misma frase (la nube no distingue, a propósito), la sesión vencida se
 *      arregla entrando, «Olvidé mi contraseña» deja un recado y no va por el
 *      chat.
 *   4. «VER LA APP COMO LA VE ÉL» sin códigos: un pase de un uso, del mismo
 *      computador, que no se puede volver a usar.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');
const SS = require('../app/sesion-socio.js');
const VC = require('../app/ver-como.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const CFG = { url: 'https://prueba.supabase.co', anon: 'sb_publishable_prueba' };
const AHORA = Date.parse('2026-10-07T15:00:00Z');
const CORREO = '573001112222@tugarantia.net';
const tokenDe = (extra) => Object.assign({ access_token: 'acceso-1', refresh_token: 'renovar-1',
  expires_at: Math.floor(AHORA / 1000) + 3600, user: { email: CORREO } }, extra || {});

/* Una nube de mentira: el login, mi_cuenta y mi_registro dicen lo que pida
   cada prueba. */
function nube(o) {
  o = o || {};
  return (url, cuerpo) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return o.clave && cuerpo && cuerpo.password === o.clave && cuerpo.email === CORREO
        ? { status: 200, cuerpo: tokenDe() }
        : { status: 400, cuerpo: { error: 'invalid_grant', error_description: 'Invalid login credentials' } };
    }
    if (/\/auth\/v1\/token\?grant_type=refresh_token$/.test(url)) {
      return o.renovar === false ? { status: 400, cuerpo: { error: 'invalid_grant' } } : { status: 200, cuerpo: tokenDe({ access_token: 'acceso-2' }) };
    }
    if (/\/rest\/v1\/rpc\/mi_cuenta$/.test(url)) return typeof o.miCuenta === 'function' ? o.miCuenta() : (o.miCuenta || { status: 200, cuerpo: { ok: true, vinculada: false } });
    if (/\/rest\/v1\/rpc\/mi_registro$/.test(url)) return o.miRegistro || { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-10-07T14:55:00Z' } } };
    if (/\/rest\/v1\/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
    if (/\/rest\/v1\/rpc\/pedir_ayuda_clave$/.test(url)) return { status: 200, cuerpo: { ok: true } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}

const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
  socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };

/* ======================================================================== */
describe('la puerta del código se fue de la app', () => {

  test('en lo que la app EJECUTA no queda ni una llamada a la puerta del código', () => {
    ['app/socio.html', 'app/sesion-socio.js', 'app/chat.js', 'app/ver-como.js'].forEach(f => {
      const c = sinComentarios(leer(f));
      ['historial_socio_por_codigo', 'crear_solicitud_por_codigo', 'cambiar_codigo_acceso',
       'canjear_invitacion', "'chat_leer'", "'chat_escribir'", 'vincular_cuenta'].forEach(fn =>
        assert.ok(c.indexOf(fn) < 0, f + ' todavía llama a ' + fn + ', que la nube cerró'));
    });
  });

  test('la pantalla de entrar pide celular y contraseña, y nada de código', async () => {
    const A = abrirSocio();
    await asentar();
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.match(h, /id="inCel" type="tel"/);
    assert.match(h, /id="inClave" type="password"/);
    assert.match(h, /href="\.\.\/play\/#registro">Registrarme</);
    assert.match(h, /onclick="olvide\(\)">Olvidé mi contraseña</);
    assert.ok(!/inCodigo|K7QP3|tu código|tienes tu código|código de invitación/i.test(h),
      'la puerta todavía habla de códigos');
    assert.ok(A.visible('pEntrar'));
  });

  test('el viejo #p=<cédula>-<código> ya no abre a nadie, ni con la cartera de Joan al lado', async () => {
    const cartera = { socios: [{ id: 'C1', numero: 7, nombre: 'Adriana Prueba', cedula: '52111222', telefono: '3001112222', codigoAcceso: 'K7QP3' }],
                      prestamos: [] };
    const A = abrirSocio({ hash: '#p=52111222-K7QP3', local: { joan_socios_v1: JSON.stringify(cartera) } });
    await asentar();
    assert.ok(!A.visible('pCuenta'), 'la cédula y el código abrieron la cuenta de una clienta');
    assert.ok(A.visible('pEntrar'));
  });

  test('la sesión de código de antes se borra al arrancar', async () => {
    const A = abrirSocio({ local: { socio_sesion: JSON.stringify({ ident: '52111222', codigo: 'K7QP3', resp: { nombre: 'X', datos: PAQUETE } }) } });
    await asentar();
    assert.equal(A.local.getItem('socio_sesion'), null, 'la sesión vieja se quedó: una app vieja la seguiría leyendo');
    assert.ok(!A.visible('pCuenta'), 'la sesión vieja abrió una cuenta');
  });
});

/* ======================================================================== */
describe('entrar, y lo que ve una cuenta según esté junta o no', () => {

  async function entrarCon(A, cel, clave) {
    A.elem('inCel').value = cel; A.elem('inClave').value = clave;
    A.ev('entrar()');
    await asentar(16);
  }

  test('una cuenta SIN JUNTAR entra y no ve nada de ninguna ficha: ve su registro y su chat', async () => {
    const A = abrirSocio({ red: nube({ clave: 'mi-clave-buena' }), ahora: AHORA });
    await asentar();
    await entrarCon(A, '300 111 2222', 'mi-clave-buena');
    const login = A.llamadas.find(l => /grant_type=password/.test(l.url));
    assert.deepEqual(login.cuerpo, { email: CORREO, password: 'mi-clave-buena' }, 'el correo no sale del celular como en play/');
    assert.ok(A.llamadas.some(l => /rpc\/mi_cuenta$/.test(l.url) && l.cab.Authorization === 'Bearer acceso-1'),
      'mi_cuenta no se preguntó con la sesión');
    assert.ok(!A.visible('pCuenta'), 'una cuenta sin juntar abrió la pantalla de la cuenta');
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.match(h, /Tu registro llegó y lo estamos revisando/);
    assert.match(h, /para que nadie más pueda ver tus datos con tu número/);
    assert.match(h, /id="chHilo"/, 'sin el chat no hay por dónde avisarle que ya está');
    assert.ok(!/Tu cupo|Mi garantía|145\.000/.test(h));
    /* Se quedó la sesión (Joan pidió el 20-ago no teclear la clave cada día)… */
    assert.equal(JSON.parse(A.local.getItem('socio_cuenta')).access_token, 'acceso-1');
    /* …y SIN paquete: no hay nada de la ficha que guardar. */
    assert.equal(JSON.parse(A.local.getItem('socio_cuenta')).paquete, undefined);
  });

  test('cada estado del registro dice su verdad, y ninguno habla de códigos', () => {
    ['nuevo', 'atendido', 'descartado', 'sin_registro', 'no_se'].forEach(e => {
      const t = SS.textoSinJuntar(e);
      assert.ok(t.titulo && t.texto);
      assert.ok(!/c[oó]digo/i.test(t.titulo + t.texto), e + ' habla de códigos');
    });
    assert.match(SS.textoSinJuntar('descartado').texto, /no pudimos abrirte la cuenta/);
    /* 7-oct-2026 (segunda vuelta): ya no «tus datos no nos llegaron» (el que se
       registró un día y abrió la cuenta al siguiente sí nos los dejó). */
    assert.match(SS.textoSinJuntar('sin_registro').texto, /No encontramos un registro hecho junto con esta cuenta/);
    /* El «te avisamos por este chat» solo donde la base lo cumple (el aviso
       lo escribe vincular_interna al juntar). */
    assert.match(SS.textoSinJuntar('nuevo').texto, /Te avisamos por este chat/);
    assert.ok(!/Te avisamos/.test(SS.textoSinJuntar('descartado').texto));
  });

  test('una cuenta JUNTA entra a su cuenta, con sus números, y se guardan para abrir sin señal', async () => {
    const A = abrirSocio({ ahora: AHORA, red: nube({ clave: 'mi-clave-buena',
      miCuenta: { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-07T14:00:00Z' } } }) });
    await asentar();
    await entrarCon(A, '3001112222', 'mi-clave-buena');
    assert.ok(A.visible('pCuenta'));
    assert.equal(A.elem('uNombre').textContent, 'Adriana Prueba');
    const guardada = JSON.parse(A.local.getItem('socio_cuenta'));
    assert.equal(guardada.paquete.nombre, 'Adriana Prueba');
    assert.equal(A.ev('S.origen'), 'nube');
  });

  test('contraseña mala y «no tienes cuenta» son la MISMA frase, con las dos salidas', async () => {
    const A = abrirSocio({ red: nube({ clave: 'otra' }), ahora: AHORA });
    await asentar();
    await entrarCon(A, '3001112222', 'equivocada');
    const e = A.elem('errEntrar');
    assert.ok(!e.classList.contains('oculto'));
    assert.equal(e.textContent, SS.TEXTOS.datos);
    assert.match(e.textContent, /Registrarme/);
    assert.match(e.textContent, /Olvidé mi contraseña/);
    assert.equal(A.local.getItem('socio_cuenta'), null);
  });

  test('un celular mal escrito no gasta un intento en la nube', async () => {
    const A = abrirSocio({ red: nube({ clave: 'x' }), ahora: AHORA });
    await asentar();
    await entrarCon(A, '12345', 'loquesea');
    assert.equal(A.llamadas.length, 0);
    assert.equal(A.elem('errEntrar').textContent, SS.TEXTOS.celular);
  });

  test('con la sesión guardada abre sola; si ya no vale y no se renueva, vuelve a la puerta y lo dice', async () => {
    const sesion = JSON.stringify({ access_token: 'viejo', refresh_token: 'r', expira_en: AHORA - 1000, celular: '3001112222' });
    const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora: AHORA, red: nube({ renovar: false }) });
    await asentar(16);
    assert.ok(A.visible('pEntrar'));
    assert.equal(A.elem('errEntrar').textContent, SS.TEXTOS.vencida);
    assert.equal(A.local.getItem('socio_cuenta'), null, 'la sesión muerta se quedó guardada');
  });

  test('sin señal y con un paquete guardado, abre lo de la última vez', async () => {
    const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222',
      paquete: { nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-06T10:00:00Z', origen: 'nube', cedula: '3001112222' } });
    const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora: AHORA });   // sin red
    await asentar(16);
    assert.ok(A.visible('pCuenta'));
    assert.equal(A.elem('uNombre').textContent, 'Adriana Prueba');
  });

  test('si Joan deshizo la unión, el paquete guardado se borra del teléfono al volver a preguntar', async () => {
    const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222',
      paquete: { nombre: 'Adriana Prueba', datos: PAQUETE, origen: 'nube' } });
    const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora: AHORA, red: nube({}) });
    await asentar(16);
    assert.ok(!A.visible('pCuenta'));
    assert.equal(JSON.parse(A.local.getItem('socio_cuenta')).paquete, undefined, 'el historial quedó guardado en el teléfono de alguien que ya no lo ve');
  });

  test('salir le avisa al servidor y suelta la sesión de esta app y la de play/ en la pestaña', async () => {
    const A = abrirSocio({ red: nube({ clave: 'mi-clave-buena' }), ahora: AHORA, sesion: { play_sesion: JSON.stringify(tokenDe()) } });
    await asentar(16);
    A.ev('salir()');
    await asentar();
    /* 7-oct-2026 (segunda vuelta): scope=local, para no sacar a PlataChat y play/. */
    assert.ok(A.llamadas.some(l => /\/auth\/v1\/logout\?scope=local$/.test(l.url)));
    assert.equal(A.local.getItem('socio_cuenta'), null);
    assert.equal(A.sesion.getItem('play_sesion'), null, 'al recargar volvería a entrar sola');
  });
});

/* ======================================================================== */
describe('olvidé mi contraseña: un recado, nunca el chat', () => {

  test('deja el recado con la llave pública y promete solo lo que pasa', async () => {
    const A = abrirSocio({ red: nube({}), ahora: AHORA });
    await asentar();
    A.ev('olvide()');
    assert.match(A.elem('entrarCuerpo').innerHTML, /no es automático ni es al instante/);
    A.elem('ayTel').value = '3001112222';
    A.ev('mandarAyuda()');
    await asentar();
    const r = A.llamadas.find(l => /rpc\/pedir_ayuda_clave$/.test(l.url));
    assert.ok(r, 'no dejó el recado');
    assert.equal(r.cab.Authorization, 'Bearer ' + 'sb_publishable_uWFyReBljFSh7l0KYkWmmg_Swo4SOxj');
    assert.deepEqual(r.cuerpo, { p_celular: '3001112222', p_nota: '' });
    assert.ok(!A.llamadas.some(l => /chat_/.test(l.url)), 'el recado fue por el chat');
    const h = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(h, /Listo, lo recibimos/);
    assert.ok(!/a ese número/.test(h), 'promete escribir al número del recado: la clave va al número de la ficha');
  });
});

/* ======================================================================== */
describe('la sesión, sin pantalla (app/sesion-socio.js)', () => {

  function red(respuestas) {
    const vistas = [];
    return { vistas, fetch: (url, op) => {
      vistas.push({ url, op, cuerpo: op && op.body ? JSON.parse(op.body) : null });
      const r = respuestas.shift();
      if (r === 'caida') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ ok: r.status < 300, status: r.status, text: () => Promise.resolve(JSON.stringify(r.cuerpo)) });
    } };
  }

  test('mi_cuenta vencida: se renueva UNA vez y se reintenta; sin renovar, causa «sesion»', async () => {
    const R = red([{ status: 401, cuerpo: {} }, { status: 200, cuerpo: tokenDe({ access_token: 'nuevo' }) },
                   { status: 200, cuerpo: { ok: true, vinculada: false } }]);
    const cfg = Object.assign({ fetch: R.fetch, ahora: () => AHORA }, CFG);
    const nuevas = [];
    const s = { access_token: 'viejo', refresh_token: 'r', expira_en: AHORA + 3600000 };
    const r = await SS.miCuenta(cfg, s, n => nuevas.push(n));
    assert.equal(r.estado, 'sin_juntar');
    assert.equal(nuevas[0].access_token, 'nuevo');
    assert.equal(R.vistas[2].op.headers.Authorization, 'Bearer nuevo');

    const R2 = red([{ status: 401, cuerpo: {} }, { status: 400, cuerpo: { error: 'invalid_grant' } }]);
    await assert.rejects(() => SS.miCuenta(Object.assign({ fetch: R2.fetch, ahora: () => AHORA }, CFG), s), e => e.causa === 'sesion');
    assert.equal(R2.vistas.length, 2, 'insistió con un token de renovar que ya no sirve');
  });

  test('un 404 es «apagado» (falta la migración), no «sin internet»', async () => {
    const R = red([{ status: 404, cuerpo: {} }]);
    await assert.rejects(() => SS.miCuenta(Object.assign({ fetch: R.fetch, ahora: () => AHORA }, CFG),
      { access_token: 'a', refresh_token: 'r', expira_en: AHORA + 3600000 }), e => e.causa === 'apagado');
  });

  test('cambiar la contraseña: solo la contraseña, con la sesión, y con las reglas del registro', async () => {
    const R = red([{ status: 200, cuerpo: {} }]);
    const cfg = Object.assign({ fetch: R.fetch, ahora: () => AHORA }, CFG);
    const s = { access_token: 'a', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222' };
    const mala = await SS.cambiarClave(cfg, s, '12345678');
    assert.equal(mala.ok, false);
    assert.equal(R.vistas.length, 0, 'una contraseña obvia salió a la red');
    assert.equal((await SS.cambiarClave(cfg, s, 'x3001112222x')).ok, false, 'dejó usar el celular de contraseña');
    const buena = await SS.cambiarClave(cfg, s, 'una-clave-mia');
    assert.equal(buena.ok, true);
    assert.match(R.vistas[0].url, /\/auth\/v1\/user$/);
    assert.equal(R.vistas[0].op.method, 'PUT');
    assert.deepEqual(R.vistas[0].cuerpo, { password: 'una-clave-mia' });
    assert.equal(R.vistas[0].op.headers.Authorization, 'Bearer a');
  });

  test('la sesión de play/ en la pestaña se lee con su forma, y la vieja de código se borra', () => {
    const ses = { getItem: k => (k === 'play_sesion' ? JSON.stringify(tokenDe()) : null) };
    const s = SS.deSesionDePlay(ses, AHORA);
    assert.equal(s.access_token, 'acceso-1');
    assert.equal(s.celular, '3001112222');
    const d = { socio_sesion: 'x' };
    SS.borrarVieja({ removeItem: k => { delete d[k]; } });
    assert.deepEqual(d, {});
  });

  test('el celular sale del correo con la forma exacta del servidor', () => {
    assert.equal(SS.celularDeCorreo('573001112222@tugarantia.net'), '3001112222');
    assert.equal(SS.celularDeCorreo('5730011122223@tugarantia.net'), '');
    assert.equal(SS.celularDeCorreo('573001112222@tugarantia.net.evil.com'), '');
  });
});

/* ======================================================================== */
describe('«ver la app como la ve él», sin códigos', () => {

  function cartera() {
    return { socios: [
      { id: 'C1', numero: 7, nombre: 'Ana Comparte', cedula: '52111222', telefono: '3005556666' },
      { id: 'C2', numero: 8, nombre: 'Beto Comparte', cedula: '', telefono: '3005556666' }
    ], prestamos: [] };
  }

  test('el pase del CRM abre a esa ficha (aunque comparta celular) y no sirve dos veces', async () => {
    const local = { joan_socios_v1: JSON.stringify(cartera()) };
    const guardar = { setItem: (k, v) => { local[k] = v; } };
    const pase = VC.crear(guardar, 'C2', Date.now());
    const A = abrirSocio({ hash: '#v=' + pase, local });
    await asentar();
    assert.ok(A.visible('pCuenta'), 'el pase no abrió la app');
    assert.equal(A.elem('uNombre').textContent, 'Beto Comparte', 'abrió la ficha equivocada de las dos que comparten celular');
    assert.equal(A.ev('S.origen'), 'panel');
    assert.equal(A.local.getItem('joan_ver_como'), null, 'el pase quedó guardado');
    assert.equal(A.loc.hash, '', 'el pase quedó en la barra');
    assert.equal(A.ev('chatDisponible()'), false, 'Joan mirando la app podía escribir como el cliente');
    /* El mismo enlace, otra vez: ya no abre. */
    const B = abrirSocio({ hash: '#v=' + pase, local: A.local.d });
    await asentar();
    assert.ok(!B.visible('pCuenta'), 'un pase usado volvió a abrir la cuenta');
    assert.match(B.elem('errEntrar').textContent, /se usa una sola vez y dura un minuto/);
  });

  test('un pase vencido o ajeno no abre, y desde otro aparato no hay cartera que leer', () => {
    const d = {};
    const a = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, removeItem: k => { delete d[k]; } };
    const p1 = VC.crear(a, 'C1', 1000);
    assert.equal(VC.consumir(a, '#v=' + p1, 1000 + VC.VIGENCIA_MS + 1), null, 'un pase vencido abrió');
    const p2 = VC.crear(a, 'C1', 1000);
    assert.equal(VC.consumir(a, '#v=' + 'f'.repeat(32), 2000), null, 'un pase inventado abrió');
    assert.equal(VC.consumir(a, '#v=' + p2, 2000), null, 'el pase sobrevivió a un intento con otro nonce');
    assert.deepEqual(VC.buscar({ socios: [] }, 'C1'), { motivo: 'ninguna' });
  });

  test('el CRM ya no arma #p=, ni genera códigos para abrir la app', () => {
    const CRM = sinComentarios(leer('panel/crm.html'));
    const i = CRM.indexOf('function verComoSocio(');
    const cuerpo = CRM.slice(i, CRM.indexOf('\n}', i));
    assert.match(cuerpo, /VerComo\.crear\(localStorage,s\.id,Date\.now\(\)\)/);
    assert.match(cuerpo, /socio\.html#v='\+pase/);
    assert.ok(!/#p=|codigoAcceso|asegurarCodigoAcceso/.test(cuerpo));
  });
});
