/* ===========================================================================
 * EL ASESOR QUE CREA EL GERENTE ESPERA LA CLAVE DE JOAN — 23-oct-2026
 *
 *   node --test pruebas/el-asesor-del-gerente-espera-la-clave.test.js
 *
 * Desde base/20261022d_el_equipo_con_la_clave_de_joan.sql lo del equipo solo
 * se abre con la clave que Joan pone desde Supabase (equipo_poner_clave)
 * DESPUÉS de que nació la cuenta. El «Crear cuenta» de Joan ya lo decía; el
 * «＋ Crear asesor» del gerente no: le mostraba «X ya puede entrar» y le armaba
 * el WhatsApp «ya tienes tu acceso… Contraseña: …». El asesor entraba y su
 * Panel le contestaba «le falta la clave del equipo que pone Joan»; y cuando
 * Joan se la ponía, equipo_poner_clave le cambiaba la contraseña y la del
 * WhatsApp dejaba de servir (en la réplica: mi_rol {ok:false} para la cuenta
 * nueva, y crypt de la contraseña del gerente distinto después de la clave).
 *
 *   · el gerente ya no elige contraseña: la que vale es la de Joan;
 *   · después de crear, la pantalla dice que el puesto quedó y que todavía no
 *     entra, sin contraseña ni WhatsApp al asesor, con el aviso para Joan;
 *   · si la cuenta ya existía o no se alcanzó a crear, el puesto quedó igual
 *     y se dice lo mismo (antes: «No pude crearlo»);
 *   · y el camino que el aviso le nombra a Joan existe en su CRM: «↻ Traer del
 *     equipo» y «🔑 Crear cuenta» terminan en la línea de equipo_poner_clave.
 * Las que prueban lo nuevo FALLAN con e52b871; la de control («sigue») pasa
 * con las dos.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const desarmar = h => h.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/* El Panel de Willian (gerente, con su sesión) y un Supabase de mentira.
   `signup`: 'ok' (crea la cuenta), 'ya' (ya existía) o 'falla' (sin señal);
   `puesto`: false si la nube no acepta el puesto. */
function gerente(o) {
  o = o || {};
  const pedidos = [];
  const red = (url, cfg) => {
    pedidos.push({ url: String(url), cuerpo: (cfg && cfg.body) || '' });
    const r = (status, j) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
    if (/\/rpc\/asesor_crear/.test(url)) return r(200, o.puesto === false ? { ok: false, motivo: 'Ese celular ya es de alguien del equipo.' } : { ok: true });
    if (/\/auth\/v1\/signup/.test(url)) {
      if (o.signup === 'ya') return r(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      if (o.signup === 'falla') return Promise.reject(new Error('sin red'));
      return r(200, { access_token: 'tok-signup', user: {} });
    }
    if (/\/rpc\/mi_cartera/.test(url)) return r(200, { ok: true, rol: 'gerente', nombre: 'WILLIAN', celular: '3172862539', equipo: [], personas: [], asignaciones: [] });
    return r(200, {});
  };
  const P = abrirPanel({ red });
  P.ctx.CuentaSocio = require('../app/cuenta.js');
  if (o.crypto) P.ctx.crypto = require('node:crypto').webcrypto;
  P.cargarCartera({ socios: [], prestamos: [], config: { pin: '1234' } });
  P.ev("SESION_EQUIPO = { access_token: 'tok-willian', refresh_token: 'r', expira_en: Date.now() + 3600000 };");
  P.ev('refrescarCarteraEq = function () { return Promise.resolve(); };');
  P.pedidos = pedidos;
  P.crear = async () => {
    P.ev('crearAsesorEq()');
    P.formulario = String(P.elems.mBody.innerHTML);
    P.ev("document.getElementById('naNombre').value = 'Leidy Asesora'; document.getElementById('naTel').value = '3001230009';");
    /* Con e52b871 el formulario pedía contraseña: se llena para que la prueba
       compare lo mismo con las dos (con el arreglo, nadie lee ese campo). */
    P.ev("document.getElementById('naClave').value = 'clave-que-dicta-1';");
    P.ev('confirmarCrearAsesorEq()');
    await asentar(); await asentar();
    P.titulo = P.elems.mTitle.textContent;
    P.html = String(P.elems.mBody.innerHTML);
    P.avisos = (P.ctx._avisos || []).slice();
    const wa = (P.html.match(/href="([^"]*wa\.me[^"]*)"/) || [])[1] || '';
    P.whatsapp = { a: wa, texto: decodeURIComponent((desarmar(wa).split('text=')[1] || '')) };
    const s = pedidos.find(x => /\/auth\/v1\/signup/.test(x.url));
    P.claveDelSignup = s ? JSON.parse(s.cuerpo).password : null;
  };
  return P;
}

describe('el gerente crea un asesor', () => {

  test('no dice «ya puede entrar» ni le arma un WhatsApp con contraseña: dice que falta la clave de Joan', async () => {
    const P = gerente();
    await P.crear();
    const orden = P.pedidos.map(x => (x.url.match(/asesor_crear|signup/) || [''])[0]).filter(Boolean);
    assert.deepEqual(orden, ['asesor_crear', 'signup'], 'cambió el orden: primero el puesto, después la cuenta');
    assert.notEqual(P.titulo, 'Asesor creado', 'dice «Asesor creado · ya puede entrar» y sin la clave de Joan no ve nada del equipo');
    assert.equal(P.titulo, 'Falta un paso: la clave de Joan');
    assert.equal(/ya puede entrar/.test(P.html), false, 'promete que ya puede entrar');
    assert.match(P.html, /Todavía no puede entrar/);
    assert.match(P.html, /clave que Joan le pone desde Supabase/);
    /* Ninguna contraseña a la vista ni en el mensaje, y el mensaje no va al asesor. */
    assert.equal(P.html.indexOf('clave-que-dicta-1'), -1, 'muestra una contraseña que la clave de Joan va a cambiar');
    assert.equal(P.html.indexOf(P.claveDelSignup), -1, 'muestra la contraseña de relleno');
    assert.equal(/wa\.me\/57?3001230009/.test(P.whatsapp.a), false, 'le arma al asesor un WhatsApp con un acceso que no sirve');
    assert.equal(/Contraseña:/.test(P.whatsapp.texto), false, 'el mensaje lleva una contraseña');
  });

  test('el aviso a Joan nombra lo que tiene que tocar, y eso existe en su CRM', async () => {
    const P = gerente();
    await P.crear();
    assert.match(P.html, /Avisarle a Joan por WhatsApp/, 'no hay cómo avisarle a Joan desde aquí');
    assert.match(P.whatsapp.texto, /Leidy Asesora/);
    assert.match(P.whatsapp.texto, /3001230009/);
    assert.match(P.whatsapp.texto, /clave del equipo/);
    assert.match(P.whatsapp.texto, /«↻ Traer del equipo»/);
    assert.match(P.whatsapp.texto, /«🔑 Crear cuenta»/);
    assert.equal(/equipo_poner_clave|select /i.test(P.whatsapp.texto), false,
      'el mensaje lleva SQL: Joan no tiene por qué pegar en Supabase algo que le llegó por WhatsApp');
    /* Los dos botones que nombra el mensaje, con esas palabras, en el CRM de Joan. */
    assert.ok(CRM.indexOf('>↻ Traer del equipo</button>') > 0, 'el CRM de Joan ya no tiene «↻ Traer del equipo»: el mensaje lo manda a buscar algo que no existe');
    assert.ok(CRM.indexOf('🔑 Crear cuenta</button>') > 0, 'el CRM de Joan ya no tiene «🔑 Crear cuenta»');
  });

  test('el formulario ya no pide contraseña, y la cuenta nace con una de relleno larga que no sale en ninguna parte', async () => {
    const P = gerente({ crypto: true });
    await P.crear();
    assert.equal(/naClave/.test(P.formulario), false, 'el gerente elige una contraseña que la clave de Joan va a reemplazar');
    assert.match(P.formulario, /su contraseña se la pone Joan/);
    assert.ok(P.claveDelSignup && P.claveDelSignup.length >= 32, 'la cuenta nace con una contraseña corta o adivinable: ' + P.claveDelSignup);
    assert.equal(P.whatsapp.texto.indexOf(P.claveDelSignup), -1);
    /* Sin el azar del navegador (un banco sin crypto), igual larga. */
    const Q = gerente();
    await Q.crear();
    assert.ok(Q.claveDelSignup && Q.claveDelSignup.length >= 24, 'sin crypto, la de relleno sale corta: ' + Q.claveDelSignup);
  });

  test('si ya había una cuenta con ese celular (un cliente), el puesto quedó y se dice lo mismo, no «No pude crearlo»', async () => {
    const P = gerente({ signup: 'ya' });
    await P.crear();
    assert.equal(P.avisos.some(a => /No pude crearlo/.test(a)), false, 'dice «No pude crearlo» y el puesto sí quedó: ' + P.avisos.join(' | '));
    assert.equal(P.titulo, 'Falta un paso: la clave de Joan');
    assert.match(P.html, /quedó creado/);
  });

  test('si la cuenta no se alcanzó a crear (sin señal), el puesto quedó y dice que Joan la crea con el mismo paso', async () => {
    const P = gerente({ signup: 'falla' });
    await P.crear();
    assert.equal(P.avisos.some(a => /No pude crearlo/.test(a)), false, 'dice «No pude crearlo» y el puesto sí quedó: ' + P.avisos.join(' | '));
    assert.equal(P.titulo, 'Falta un paso: la clave de Joan');
    assert.match(P.html, /no se alcanzó a crear/);
    assert.match(P.html, /Joan la crea con el mismo paso/);
  });

  test('si la nube no acepta el puesto, sigue diciendo que no lo creó, y no intenta la cuenta', async () => {
    const P = gerente({ puesto: false });
    await P.crear();
    assert.ok(P.avisos.some(a => /No pude crearlo: Ese celular ya es de alguien del equipo/.test(a)), 'no dijo por qué no lo creó: ' + P.avisos.join(' | '));
    assert.equal(P.pedidos.some(x => /\/auth\/v1\/signup/.test(x.url)), false, 'creó una cuenta huérfana sin puesto');
  });
});

describe('el camino que el aviso le nombra a Joan', () => {

  test('Joan trae al asesor que creó su gerente, y su «🔑 Crear cuenta» termina en la línea de equipo_poner_clave', async () => {
    const red = (url) => {
      const r = (status, j) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
      if (/\/auth\/v1\/signup/.test(url)) return r(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      return Promise.reject(new Error('sin red'));
    };
    const P = abrirPanel({ red });
    P.ctx.CuentaSocio = require('../app/cuenta.js');
    P.cargarCartera({ socios: [], prestamos: [], config: { pin: '1234' },
      equipo: [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: '3000000000' }] });
    P.ev(`
      sbListo = function () { return true; };
      sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
      rpc = function (fn) {
        if (fn === 'equipo_traer') return Promise.resolve({ equipo: [
          { celular: '3000000000', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo' },
          { celular: '3001230009', nombre: 'Leidy Asesora', rol: 'asesor', estado: 'activo', jefe: '3000000000' }] });
        return Promise.resolve(null);
      };
    `);
    await P.ev('traerEquipo(true)');
    await asentar();
    const id = P.ev("(equipo().find(function (p) { return p.celular === '3001230009'; }) || {}).id");
    assert.ok(id, 'no trajo al asesor que creó el gerente');
    assert.equal(P.ev("personaDeEquipo('" + id + "').cuentaCreada"), undefined, 'sin «🔑 Crear cuenta» no hay cómo ponerle la clave');
    P.ev("crearCuenta('" + id + "')");
    P.ev("document.getElementById('ceClave').value = 'joan-1234'");
    P.ev("confirmarCrearCuenta('" + id + "')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Ya existe una cuenta con ese celular');
    const h = desarmar(String(P.elems.mBody.innerHTML));
    assert.ok(h.indexOf("select public.equipo_poner_clave('3001230009', 'joan-1234');") >= 0, 'no le da a Joan la línea de la clave');
    assert.match(h, /la creó su gerente/, 'no cuenta que la cuenta la pudo crear su gerente: Joan va a pensar que alguien se registró con ese celular');
  });
});
