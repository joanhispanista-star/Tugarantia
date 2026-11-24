/* ============================================================================
 * LA SESIÓN DEL CLIENTE NO SE CIERRA POR UN TROPIEZO — 24-nov-2026
 *
 * Joan: «quiero que el cliente siempre este conectado a la app cuando quiera de
 * una forma facil y si esta abierta la pagina en el celular que la cuenta
 * siempre permanesca abierta».
 *
 * La sesión ya vivía en el teléfono (localStorage, desde el 20-ago) y se renueva
 * sola. Pero al renovar, TODO lo que no fuera un error 5xx se tomaba por «sesión
 * muerta», y la app borraba la cuenta del teléfono y pedía la contraseña. Dos
 * casos de esos NO son una sesión muerta:
 *   1. un 429 («muchos intentos», Supabase frenando unos segundos) o un 408;
 *   2. la app abierta en dos pestañas: el token de renovar se usa una sola vez,
 *      y la pestaña que llega segunda recibe «ya no sirve» aunque la otra acaba
 *      de guardar la sesión nueva en el mismo teléfono.
 * Aquí se fija que en esos dos casos la cuenta siga abierta, y que cuando la
 * sesión SÍ murió (clave nueva, «Salir» desde otro lado) se siga cerrando.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SS = require('../app/sesion-socio.js');

const CFG = { url: 'https://prueba.supabase.co', anon: 'sb_publishable_prueba' };
const AHORA = Date.parse('2026-11-24T15:00:00Z');
const CORREO = '573001112222@tugarantia.net';
const tokenDe = extra => Object.assign({ access_token: 'acceso-nuevo', refresh_token: 'renovar-nuevo',
  expires_at: Math.floor(AHORA / 1000) + 3600, user: { email: CORREO } }, extra || {});

/* Una red que contesta, en orden, lo que cada prueba le deja. */
function red(respuestas) {
  const vistas = [];
  return { vistas, fetch: (url, op) => {
    vistas.push({ url, op });
    const r = respuestas.shift() || { status: 500, cuerpo: {} };
    if (r === 'sin-red') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status,
      text: () => Promise.resolve(JSON.stringify(r.cuerpo == null ? null : r.cuerpo)) });
  } };
}
const cfgCon = (R, extra) => Object.assign({ fetch: R.fetch, ahora: () => AHORA }, CFG, extra || {});
const VENCIDA = { access_token: 'viejo', refresh_token: 'renovar-viejo', expira_en: AHORA - 1000, celular: '3001112222' };
const OK_CUENTA = { status: 200, cuerpo: { ok: true, vinculada: false } };

describe('renovar la sesión · qué es «murió» y qué es «ahora no»', () => {
  test('un 429 al renovar es «ahora no», no «sesión muerta»', async () => {
    const R = red([{ status: 429, cuerpo: { msg: 'rate limit' } }]);
    await assert.rejects(() => SS.refrescar(cfgCon(R), VENCIDA), e => e.causa === 'red' && e.estado === 429);
  });

  test('un 408 también', async () => {
    const R = red([{ status: 408, cuerpo: {} }]);
    await assert.rejects(() => SS.refrescar(cfgCon(R), VENCIDA), e => e.causa === 'red');
  });

  test('un 5xx y la red caída siguen siendo «red», como siempre', async () => {
    await assert.rejects(() => SS.refrescar(cfgCon(red([{ status: 503, cuerpo: {} }])), VENCIDA), e => e.causa === 'red');
    await assert.rejects(() => SS.refrescar(cfgCon(red(['sin-red'])), VENCIDA), e => e.causa === 'red');
  });

  test('un 400 (el token de renovar ya no sirve) SÍ es «sesión»: una clave nueva tiene que sacar al de antes', async () => {
    const R = red([{ status: 400, cuerpo: { error: 'invalid_grant' } }]);
    await assert.rejects(() => SS.refrescar(cfgCon(R), VENCIDA), e => e.causa === 'sesion');
    await assert.rejects(() => SS.refrescar(cfgCon(red([{ status: 401, cuerpo: {} }])), VENCIDA), e => e.causa === 'sesion');
  });

  test('con un 429, mi_cuenta contesta «red» y NO pide volver a entrar', async () => {
    const R = red([{ status: 429, cuerpo: {} }]);
    await assert.rejects(() => SS.miCuenta(cfgCon(R), VENCIDA), e => e.causa === 'red');
    assert.equal(R.vistas.length, 1, 'y no insiste: insistir gasta el tope que ya se llenó');
  });
});

describe('renovar la sesión · otra pestaña ya la renovó', () => {
  test('si en el teléfono hay OTRA sesión vigente, se sigue con esa y no se pide la contraseña', async () => {
    const otra = { access_token: 'de-la-otra-pestana', refresh_token: 'renovar-de-la-otra', expira_en: AHORA + 3600000, celular: '3001112222' };
    const R = red([{ status: 400, cuerpo: { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' } }, OK_CUENTA]);
    const guardadas = [];
    const r = await SS.miCuenta(cfgCon(R, { releer: () => otra }), VENCIDA, n => guardadas.push(n));
    assert.equal(r.estado, 'sin_juntar');
    assert.equal(R.vistas[1].op.headers.Authorization, 'Bearer de-la-otra-pestana', 'la consulta sale con la sesión de la otra pestaña');
    assert.deepEqual(guardadas, [otra], 'y esta pestaña se queda con ella');
  });

  test('si la del teléfono es otra pero ya venció, se renueva ESA', async () => {
    const otra = { access_token: 'otra-vencida', refresh_token: 'renovar-de-la-otra', expira_en: AHORA - 5, celular: '3001112222' };
    const R = red([{ status: 400, cuerpo: { error: 'invalid_grant' } }, { status: 200, cuerpo: tokenDe() }, OK_CUENTA]);
    const guardadas = [];
    const r = await SS.miCuenta(cfgCon(R, { releer: () => otra }), VENCIDA, n => guardadas.push(n));
    assert.equal(r.estado, 'sin_juntar');
    assert.equal(JSON.parse(R.vistas[1].op.body).refresh_token, 'renovar-de-la-otra');
    assert.equal(R.vistas[2].op.headers.Authorization, 'Bearer acceso-nuevo');
    assert.equal(guardadas[0].access_token, 'acceso-nuevo');
  });

  test('si lo guardado es la MISMA sesión, de verdad murió: se cierra', async () => {
    const R = red([{ status: 400, cuerpo: { error: 'invalid_grant' } }]);
    await assert.rejects(() => SS.miCuenta(cfgCon(R, { releer: () => Object.assign({}, VENCIDA) }), VENCIDA), e => e.causa === 'sesion');
    assert.equal(R.vistas.length, 1, 'no vuelve a intentar con el mismo token');
  });

  test('si no hay nada guardado (se salió en la otra pestaña), se cierra', async () => {
    const R = red([{ status: 400, cuerpo: { error: 'invalid_grant' } }]);
    await assert.rejects(() => SS.miCuenta(cfgCon(R, { releer: () => null }), VENCIDA), e => e.causa === 'sesion');
    const R2 = red([{ status: 400, cuerpo: { error: 'invalid_grant' } }]);
    await assert.rejects(() => SS.miCuenta(cfgCon(R2, { releer: () => { throw new Error('sin permiso'); } }), VENCIDA), e => e.causa === 'sesion');
  });

  test('sin `releer` (quien no lo ponga) todo sigue como antes', async () => {
    const R = red([{ status: 400, cuerpo: { error: 'invalid_grant' } }]);
    await assert.rejects(() => SS.miCuenta(cfgCon(R), VENCIDA), e => e.causa === 'sesion');
  });

  test('la otra sesión también murió: se cierra, y no entra en un bucle', async () => {
    const otra = { access_token: 'otra-vencida', refresh_token: 'renovar-de-la-otra', expira_en: AHORA - 5, celular: '3001112222' };
    const R = red([{ status: 400, cuerpo: {} }, { status: 400, cuerpo: {} }]);
    await assert.rejects(() => SS.miCuenta(cfgCon(R, { releer: () => otra }), VENCIDA), e => e.causa === 'sesion');
    assert.equal(R.vistas.length, 2);
  });
});

describe('app/socio.html · le presta a la sesión lo que hay guardado en el teléfono', () => {
  const APP = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');
  test('CFG lleva `releer`, y lee de localStorage con SesionSocio.leer', () => {
    assert.match(APP, /n\.releer = function \(\) \{\s*try \{ return window\.SesionSocio \? window\.SesionSocio\.leer\(localStorage\) : null; \}/);
  });
  test('la conexión de fábrica no se toca: se copia', () => {
    assert.match(APP, /var CFG_POR_DEFECTO = \{\s*url: 'https:\/\/[a-z0-9]+\.supabase\.co',\s*anon: '[^']+'\s*\};/);
    assert.doesNotMatch(APP, /CFG_POR_DEFECTO\.releer/);
  });
  test('la página pide sesion-socio.js con una versión que el service worker guarda', () => {
    const v = /<script src="sesion-socio\.js\?v=(\d+)"><\/script>/.exec(APP)[1];
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    assert.ok(sw.includes("'app/sesion-socio.js?v=" + v + "'"), 'sw.js guarda app/sesion-socio.js?v=' + v);
  });
});
