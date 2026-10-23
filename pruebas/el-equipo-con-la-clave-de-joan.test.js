/* ===========================================================================
 * EL CRM CON LA CLAVE DEL EQUIPO — 22-oct-2026
 *
 *   node --test pruebas/el-equipo-con-la-clave-de-joan.test.js
 *
 * Desde base/20261022d_el_equipo_con_la_clave_de_joan.sql lo del equipo solo
 * se abre con la clave que Joan pone desde Supabase (equipo_poner_clave): una
 * cuenta creada con «Crear cuenta», o por alguien que se registró como cliente
 * con ese celular, no ve nada hasta entonces. El CRM tiene que decirlo en sus
 * tres sitios, y no prometer lo que ya no pasa:
 *   · «Crear cuenta» ya no dice «quedó lista»: pide el paso de la clave;
 *   · «comprobarla y entregársela» no entrega una contraseña que sirve en una
 *     cuenta a la que le falta la clave (la recién creada ya tiene esa misma
 *     contraseña sin que nadie haya pegado la línea);
 *   · la puerta del equipo le dice a quien entra que le falta la clave, y no
 *     «todavía no tienes puesto».
 * La base corriendo de verdad está en el-equipo-con-la-clave-de-joan-postgres.
 * Las que prueban lo nuevo FALLAN con ab6b595; las de control (las que dicen
 * «sigue», «como siempre», «como antes» o «no … nada») pasan con las dos, y
 * están para que el arreglo no rompa lo que ya andaba.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const WILLIAN = { id: 'e1', nombre: 'Willian Prueba', celular: '3000000000', rol: 'gerente' };

/* Un Supabase de mentira: el signup crea, el token entra con `clave`, y
   equipo_cuenta_sin_clave contesta lo que diga `faltaClave`. */
function abrir(o) {
  const pedidos = [];
  const red = (url, cfg) => {
    pedidos.push({ url: String(url), cuerpo: (cfg && cfg.body) || '' });
    const r = (status, j) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
    if (/\/auth\/v1\/signup/.test(url)) return r(200, { access_token: 'tok-signup', user: {} });
    if (/\/auth\/v1\/token/.test(url)) {
      const b = JSON.parse(cfg.body);
      return b.password === o.clave ? r(200, { access_token: 'tok-prueba', refresh_token: 'ref', expires_in: 3600 }) : r(400, { error: 'invalid_grant' });
    }
    if (/\/auth\/v1\/logout/.test(url)) return r(204, {});
    if (/\/rpc\/equipo_cuenta_sin_clave/.test(url)) return o.sinFuncion ? r(404, { code: 'PGRST202' }) : r(200, !!o.faltaClave);
    if (/\/rpc\/mi_cartera/.test(url)) return r(200, { ok: false });
    return Promise.reject(new Error('sin red'));
  };
  const P = abrirPanel({ red });
  P.ctx.CuentaSocio = require('../app/cuenta.js');
  P.cargarCartera({ socios: [], prestamos: [], config: { pin: '1234' }, equipo: [WILLIAN] });
  P.pedidos = pedidos;
  return P;
}

describe('«Crear cuenta» y «comprobarla»', () => {

  test('«Crear cuenta» ya no dice «quedó lista»: pide la clave del equipo, con la línea', async () => {
    const P = abrir({ clave: 'abcd-efgh', faltaClave: true });
    P.ev("crearCuenta('e1')");
    P.ev("document.getElementById('ceClave').value = 'abcd-efgh'");
    P.ev("confirmarCrearCuenta('e1')");
    await asentar();
    assert.notEqual(P.elems.mTitle.textContent, 'Cuenta creada', 'dijo «Cuenta creada / quedó lista» y sin la clave de Joan no ve nada del equipo');
    assert.equal(P.elems.mTitle.textContent, 'Falta un paso: tu clave del equipo');
    const h = String(P.elems.mBody.innerHTML);
    assert.match(h, /todavía no ve nada del equipo/);
    assert.ok(h.indexOf("select public.equipo_poner_clave(&#39;3000000000&#39;, &#39;abcd-efgh&#39;);") >= 0 ||
              h.indexOf("select public.equipo_poner_clave('3000000000', 'abcd-efgh');") >= 0, 'no le da la línea');
  });

  test('«comprobarla» NO la entrega si a la cuenta le falta la clave, aunque la contraseña sirva', async () => {
    const P = abrir({ clave: 'abcd-efgh', faltaClave: true });
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh', 'creada')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.notEqual(P.elems.mTitle.textContent, 'Cuenta creada', 'entregó una cuenta que no ve nada del equipo');
    assert.match(String(P.elems.ceVerif.innerHTML), /todavía le falta tu clave del equipo/);
    assert.ok(P.pedidos.some(x => /\/auth\/v1\/logout/.test(x.url)), 'la sesión de prueba quedó abierta');
    assert.ok(P.ev('_claveEnCurso !== null'), 'perdió la clave y ya no se puede reintentar');
  });

  test('con la clave puesta, la entrega como «Cuenta creada»', async () => {
    const P = abrir({ clave: 'abcd-efgh', faltaClave: false });
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh', 'creada')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Cuenta creada');
    assert.equal(P.ev('_claveEnCurso'), null);
  });

  test('si la base todavía no tiene el archivo, no se afirma nada que no se sabe (se entrega como antes)', async () => {
    const P = abrir({ clave: 'abcd-efgh', sinFuncion: true });
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Contraseña cambiada');
  });
});

describe('la puerta del equipo', () => {
  async function entrar(o) {
    const P = abrir(o);
    P.ev("document.getElementById('eqTelIn').value = '3000000000'; document.getElementById('eqClaveIn').value = 'abcd-efgh';");
    P.ev('entrarEquipo()');
    await asentar();
    return String(P.elems.eqErr.innerHTML);
  }
  test('a la cuenta le falta la clave de Joan: lo dice, y no «todavía no tienes puesto»', async () => {
    const h = await entrar({ clave: 'abcd-efgh', faltaClave: true });
    assert.match(h, /le falta la clave del equipo que pone Joan/);
    assert.equal(/todavía no tienes puesto/.test(h), false, 'lo mandó a esperar un rol que ya tiene');
  });
  test('sin puesto de verdad, sigue diciendo lo de siempre', async () => {
    const h = await entrar({ clave: 'abcd-efgh', faltaClave: false });
    assert.match(h, /todavía no tienes puesto/);
  });
});
