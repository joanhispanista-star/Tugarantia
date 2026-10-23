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

/* 23-oct-2026 — LA FICHA Y EL CUADRO DE «CREAR» TAMPOCO PROMETEN QUE ENTRA.
   La rama arregló pantallaCuentaExiste y el Panel del gerente, pero dejó dos
   textos de main que el SQL del equipo volvió falsos: la ficha (✏️) decía en
   verde «Ya tiene cuenta… Entra con su celular por <enlace>» con solo
   `cuentaCreada` —la cuenta creada antes del 22-oct sin la línea, o la que
   Joan acaba de crear cerrando «Falta un paso» antes de pegarla—, y el
   cuadro de crear prometía «podrá entrar por el mismo enlace». */
describe('la ficha y el cuadro de «Crear cuenta» no prometen que entra sin la clave del equipo', () => {
  const ficha = P => { P.ev("editarPersona('e1')"); return String(P.elems.mBody.innerHTML); };
  const sinEtiquetas = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  test('el cuadro de «Crear cuenta» no dice «podrá entrar»: dice que falta la clave del equipo', () => {
    const P = abrir({ clave: 'abcd-efgh' });
    P.ev("crearCuenta('e1')");
    const h = sinEtiquetas(String(P.elems.mBody.innerHTML));
    assert.equal(/podrá entrar/.test(h), false, 'promete que entra con solo crearla');
    assert.match(h, /falta un paso: tu clave del equipo/i);
    assert.match(h, /no ve tu cartera/, 'se perdió lo de la cartera');
  });

  test('creada y cerrada «Falta un paso» sin pegar la línea: la ficha NO dice en verde que entra', async () => {
    const P = abrir({ clave: 'abcd-efgh', faltaClave: true });
    P.ev("crearCuenta('e1')");
    P.ev("document.getElementById('ceClave').value = 'abcd-efgh'");
    P.ev("confirmarCrearCuenta('e1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Falta un paso: tu clave del equipo', 'la prueba no prueba el caso');
    const h = ficha(P);
    assert.equal(/alerta ok">Ya tiene cuenta/.test(h), false, 'le dice en verde que tiene cuenta lista');
    assert.equal(/Entra con su celular por/.test(h), false, 'le dice a Joan que entra, y la base la deja afuera');
    assert.match(sinEtiquetas(h), /no ha comprobado que ya entre/);
    assert.match(h, /crearCuenta\('e1'\)">Ponerle otra contraseña/, 'no le deja la salida');
  });

  test('una cuenta de antes del 22-oct (sin comprobar la clave): tampoco', () => {
    const P = abrir({ clave: 'abcd-efgh' });
    P.ev("personaDeEquipo('e1').cuentaCreada = '2026-10-10'");
    const h = ficha(P);
    assert.equal(/Entra con su celular por/.test(h), false);
    assert.match(sinEtiquetas(h), /Tiene cuenta, creada el 10 de oct de 2026, pero este computador no ha comprobado que ya entre/);
  });

  test('CENTINELA: comprobada con «Ya dijo Listo» (la clave sirve y no le falta la del equipo), la ficha sí dice que entra', async () => {
    const P = abrir({ clave: 'abcd-efgh', faltaClave: false });
    P.ev("personaDeEquipo('e1').cuentaCreada = '2026-10-10'");
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh', 'creada')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Cuenta creada');
    const h = ficha(P);
    assert.match(h, /alerta ok">Ya tiene cuenta, creada el/);
    assert.match(h, /Entra con su celular por/);
  });

  test('CENTINELA: si a la cuenta le falta la clave, «comprobarla» no la da por lista en la ficha', async () => {
    const P = abrir({ clave: 'abcd-efgh', faltaClave: true });
    P.ev("personaDeEquipo('e1').cuentaCreada = '2026-10-10'");
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh', 'creada')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.equal(/Entra con su celular por/.test(ficha(P)), false);
  });
});

/* 23-oct-2026 (verificación de 129e85e) — LA CUENTA NUEVA NO HEREDA LA
   COMPROBACIÓN DE LA VIEJA. La marca claveEquipoLista protegía solo a quien
   nunca la tuvo: a Leidy, ya comprobada, le cambiaban el celular en ✏️ (o le
   borraban la cuenta con «🧪 Borrar y repetir»), Joan tocaba «Ponerle otra
   contraseña», el signup creaba una cuenta NUEVA, salía «Falta un paso» y,
   cerrado sin pegar la línea, la ficha volvía a decir en verde «Entra con su
   celular por…». La base la deja afuera: en celular_del_equipo_de_sesion una
   clave anterior a la cuenta no vale (clave < creada → null), y con el
   celular nuevo ni siquiera hay clave. */
describe('la cuenta nueva de alguien ya comprobado no hereda el verde', () => {
  const ficha = P => { P.ev("editarPersona('e1')"); return String(P.elems.mBody.innerHTML); };
  const sinEtiquetas = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  function comprobada(o) {
    const P = abrir(o);
    P.ctx.confirm = () => true;
    P.ev("Object.assign(personaDeEquipo('e1'), { cuentaCreada: '2026-09-15', claveEquipoLista: '2026-10-20', estado: 'activo', jefe: '' })");
    assert.match(ficha(P), /Entra con su celular por/, 'la prueba no prueba el caso: no arranca comprobada');
    return P;
  }
  async function crearYCerrar(P) {
    P.ev("crearCuenta('e1')");
    P.ev("document.getElementById('ceClave').value = 'abcd-efgh'");
    P.ev("confirmarCrearCuenta('e1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Falta un paso: tu clave del equipo', 'la prueba no prueba el caso: el signup no creó');
    P.ev('cerrarModal()');
  }

  test('le borraron la cuenta y el signup crea otra: cerrada «Falta un paso», la ficha NO dice en verde que entra', async () => {
    const P = comprobada({ clave: 'abcd-efgh', faltaClave: true });
    await crearYCerrar(P);
    const h = ficha(P);
    assert.equal(/Entra con su celular por/.test(h), false, 'la cuenta nueva heredó la comprobación de la vieja');
    assert.match(sinEtiquetas(h), /no ha comprobado que ya entre/);
    assert.match(h, /crearCuenta\('e1'\)">Ponerle otra contraseña/, 'no le deja la salida');
  });

  test('le cambian el celular en ✏️: la ficha ya no dice que entra, y ofrece crear la cuenta del número nuevo', async () => {
    const P = comprobada({ clave: 'abcd-efgh', faltaClave: true });
    P.ev("editarPersona('e1')");
    P.ev("document.getElementById('eqNombre').value = 'Willian Prueba'; document.getElementById('eqTel').value = '3005556677';" +
         " document.getElementById('eqRol').value = 'gerente'; document.getElementById('eqJefe').value = '';" +
         " document.getElementById('eqEstado').value = 'activo';");
    P.ev("guardarPersona('e1')");
    await asentar();
    assert.equal(P.ev("personaDeEquipo('e1').celular"), '3005556677', 'la prueba no prueba el caso: el celular no cambió');
    const h = ficha(P);
    assert.equal(/Entra con su celular por/.test(h), false, 'la comprobación era de la cuenta del número viejo');
    assert.equal(/Ya tiene cuenta|Tiene cuenta, creada/.test(sinEtiquetas(h)), false, 'la cuenta anotada era la del número viejo');
    assert.match(h, /crearCuenta\('e1'\)">Crear su cuenta/, 'no le deja la salida');
    /* Y la cuenta que crea para el número nuevo tampoco sale en verde. */
    await crearYCerrar(P);
    assert.ok(P.pedidos.some(x => /\/auth\/v1\/signup/.test(x.url) && /573005556677@/.test(x.cuerpo)), 'no creó la del número nuevo');
    assert.equal(/Entra con su celular por/.test(ficha(P)), false);
  });

  test('CENTINELA: guardar la ficha sin tocar el celular no le quita el verde a quien ya se comprobó', async () => {
    const P = comprobada({ clave: 'abcd-efgh', faltaClave: false });
    P.ev("editarPersona('e1')");
    P.ev("document.getElementById('eqNombre').value = 'Willian Prueba Dos'; document.getElementById('eqTel').value = '300 000 0000';" +
         " document.getElementById('eqRol').value = 'gerente'; document.getElementById('eqJefe').value = '';" +
         " document.getElementById('eqEstado').value = 'activo';");
    P.ev("guardarPersona('e1')");
    await asentar();
    assert.equal(P.ev("personaDeEquipo('e1').nombre"), 'Willian Prueba Dos', 'la prueba no prueba el caso: no guardó');
    assert.match(ficha(P), /Entra con su celular por/, 'cambiar el nombre (o escribir el mismo celular con espacios) le quitó la comprobación');
  });
});
