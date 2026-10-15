/* ===========================================================================
 * LA CLAVE DE ALGUIEN DEL EQUIPO, CUANDO SU CUENTA YA EXISTE — 15-oct-2026
 *
 * Joan no pudo entrar como su gerente: la cuenta existía desde el 10-sep y
 * «Crear cuenta» terminaba en «la única salida es que use otro celular». La
 * salida nueva es una línea que Joan pega en el editor SQL de Supabase
 * (base/20261015c_clave_del_equipo.sql), y después el CRM COMPRUEBA contra
 * Supabase Auth que la clave sirve antes de decir que cambió.
 *
 * Lo que aquí se vigila son las dos mitades: que la base no se la entregue a
 * nadie de afuera, y que el CRM deje de mandar a cambiar de celular, arme la
 * línea exacta y no se crea el «Listo» de palabra.
 *
 * La función corriendo de verdad está en clave-del-equipo-postgres.test.js.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'base', '20261015c_clave_del_equipo.sql'), 'utf8');
const VIVO = SQL.replace(/--[^\n]*/g, ' ');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const CRM_VIVO = CRM.replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('la base: equipo_poner_clave no se le entrega a nadie de afuera', () => {

  test('se le quita a public, anon, authenticated y service_role, y no se le da a nadie', () => {
    /* `revoke ... from public` solo no basta en Supabase: sus privilegios por
       defecto le dan EXECUTE a anon y a authenticated aparte. Así quedaron 28
       funciones abiertas en agosto.
       MUTANTE QUE CAZA: dejar solo `from public`, o agregar un grant de
       cualquier forma (execute, all, con o sin esquema). */
    assert.match(VIVO, /revoke all on function public\.equipo_poner_clave\(text, text\) from public, anon, authenticated;/);
    assert.match(VIVO, /revoke all on function public\.equipo_poner_clave\(text, text\) from service_role/);
    assert.doesNotMatch(VIVO, /grant\s+(execute|all)[^;]*equipo_poner_clave/i,
      'alguien le dio permiso de llamarla: con la llave pública cualquiera podría volverse gerente');
  });

  test('solo toca a alguien del equipo, activo, con cuenta usable', () => {
    assert.match(VIVO, /from public\.equipo e/);
    assert.match(VIVO, /no es de nadie del equipo/);
    assert.match(VIVO, /quien\.estado is distinct from 'activo'/);
    assert.match(VIVO, /todavía no tiene cuenta/);
    assert.match(VIVO, /bloqueada en Supabase Auth/);
    assert.match(VIVO, /sin confirmar en Supabase Auth/);
  });

  test('guarda la contraseña como Supabase Auth, con el esquema escrito, y cierra las sesiones viejas', () => {
    /* Con `crypt` sin esquema y public antes que extensions en el search_path,
       quien pudiera crear una «crypt» en public leería la contraseña en claro.
       MUTANTE QUE CAZA: volver a `crypt(` a secas. */
    assert.match(VIVO, /encrypted_password = extensions\.crypt\(p_clave, extensions\.gen_salt\('bf'\)\)/);
    assert.match(VIVO, /set search_path = pg_catalog, public, auth/);
    assert.match(VIVO, /delete from auth\.sessions where user_id::text = c_uid::text/);
    assert.match(VIVO, /length\(p_clave\) < 8/);
    assert.match(VIVO, /when cerradas then 'Las sesiones que tenía abiertas se cerraron\.'/,
      'dice que cerró las sesiones aunque no haya podido');
  });

  test('anota cuándo y quién la corrió, NUNCA la contraseña', () => {
    const tabla = VIVO.match(/create table if not exists public\.claves_equipo \(([\s\S]*?)\);/)[1];
    assert.doesNotMatch(tabla, /clave|password|contras/i, 'la tabla del rastro guarda la contraseña');
    assert.match(VIVO, /insert into public\.claves_equipo \(celular, quien\) values \(cel, session_user\)/,
      'el rastro anota al dueño de la función en vez de a quien la corrió');
    assert.match(VIVO, /alter table public\.claves_equipo enable row level security/);
    assert.match(VIVO, /revoke all on table public\.claves_equipo from public, anon, authenticated/);
  });

  test('el CRM NUNCA la llama: la línea la pega Joan en Supabase', () => {
    /* Si el CRM la pudiera llamar, iría con la clave de sincronización, que es
       justo lo que 20261007c cerró para el equipo.
       MUTANTE QUE CAZA: un rpc('equipo_poner_clave') en el CRM. */
    assert.doesNotMatch(CRM_VIVO, /rpc[A-Za-z]*\(\s*['"]equipo_poner_clave/,
      'el CRM llama a equipo_poner_clave por la API');
    assert.doesNotMatch(CRM_VIVO, /\/rpc\/equipo_poner_clave/);
  });
});

describe('el CRM: «ya existe» deja de ser un callejón', () => {

  const WILLIAN = { id: 'e1', nombre: 'Willian Prueba', celular: '+57 300 000 0000', rol: 'gerente' };
  const LEIDY = { id: 'e2', nombre: 'Leidy Prueba', celular: '3000000002', rol: 'asesor' };
  /* Un Supabase Auth de mentira: entra solo con `clave`, y anota lo que se le
     pidió para poder comprobar que la sesión de prueba se cierra. */
  function abrir(clave) {
    const pedidos = [];
    const red = (url, cfg) => {
      pedidos.push({ url, cuerpo: (cfg && cfg.body) || '' });
      const r = (status, j) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(j),
                                                 text: () => Promise.resolve(JSON.stringify(j)) });
      if (/\/auth\/v1\/token/.test(url)) {
        const b = JSON.parse(cfg.body);
        return b.password === clave && b.email === '573000000000@tugarantia.net'
          ? r(200, { access_token: 'tok-prueba', user: { email: b.email } })
          : r(400, { error: 'invalid_grant' });
      }
      if (/\/auth\/v1\/logout/.test(url)) return r(204, {});
      return Promise.reject(new Error('sin red'));
    };
    const P = abrirPanel({ red });
    /* crm.html carga app/cuenta.js con <script src>, y el banco no lo trae: sin
       él correoDeEquipo da vacío y la comprobación preguntaría por nadie. */
    P.ctx.CuentaSocio = require('../app/cuenta.js');
    P.cargarCartera({ socios: [], prestamos: [], config: { pin: '1234' }, equipo: [WILLIAN, LEIDY] });
    P.pedidos = pedidos;
    return P;
  }
  const todoLoGuardado = P => Object.values(P.almacen).join('\n');

  test('ya no manda a cambiar de celular, y dice por qué no puede entrar', () => {
    const P = abrir('abcd-efgh');
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    const h = String(P.elems.mBody.innerHTML);
    assert.doesNotMatch(h, /única salida es que use otro celular/,
      'el callejón volvió: a un gerente con su cartera no se le cambia el celular');
    assert.match(h, /no se aplicó/);
  });

  test('arma la línea con los diez dígitos del celular (los mismos del correo) y el enlace a SU proyecto', () => {
    const P = abrir('abcd-efgh');
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    const h = String(P.elems.mBody.innerHTML);
    assert.ok(h.indexOf('select public.equipo_poner_clave(&#39;3000000000&#39;, &#39;abcd-efgh&#39;);') >= 0 ||
              h.indexOf("select public.equipo_poner_clave('3000000000', 'abcd-efgh');") >= 0,
      'la línea no lleva los diez dígitos del celular y la clave');
    assert.match(h, /https:\/\/supabase\.com\/dashboard\/project\/wnsioekvjspwtghbodbg\/sql\/new/);
    assert.match(h, /20261015c_clave_del_equipo\.sql/, 'no dice qué pegar si la función todavía no existe');
    assert.match(h, /borra la línea del editor/, 'no avisa que la línea lleva la contraseña');
  });

  test('una comilla en la clave no rompe la línea', () => {
    const P = abrir('x');
    assert.equal(P.ev("lineaClaveEquipo('3000000000', \"ab'cd-efgh\")"),
      "select public.equipo_poner_clave('3000000000', 'ab''cd-efgh');");
  });

  test('«Copiar» copia la línea tal cual, sin entidades HTML', async () => {
    const P = abrir('x');
    let copiado = null;
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), \"ab'cd&efgh\")");
    /* El banco no parsea innerHTML: el div se crea al pedirlo, con el texto que
       en un navegador sale de decodificar el escHTML de la pantalla. */
    P.ev("document.getElementById('ceLinea').textContent = lineaClaveEquipo('3000000000', \"ab'cd&efgh\")");
    P.ctx.navigator = { clipboard: { writeText: t => { copiado = t; return Promise.resolve(); } } };
    const btn = { textContent: '📋 Copiar la línea' };
    P.ctx.__btn = btn;
    P.ev('copiarLineaClave(__btn)');
    await asentar();
    assert.equal(copiado, "select public.equipo_poner_clave('3000000000', 'ab''cd&efgh');");
    assert.equal(btn.textContent, '✓ Copiada');
  });

  test('NO dice «cambiada» si Supabase Auth no acepta la clave', async () => {
    /* Era el defecto que encontró la revisión: el botón entregaba la clave sin
       comprobar nada, bajo un título que decía que sí había cambiado.
       MUTANTE QUE CAZA: entregar sin preguntarle a /auth/v1/token. */
    const P = abrir('la-que-de-verdad-quedo');
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.notEqual(P.elems.mTitle.textContent, 'Contraseña cambiada', 'dijo «cambiada» sin que la clave sirviera');
    assert.match(String(P.elems.ceVerif.innerHTML), /todavía no acepta esa contraseña/);
    assert.ok(P.pedidos.some(x => /\/auth\/v1\/token/.test(x.url)), 'ni siquiera le preguntó a Supabase Auth');
    assert.ok(P.ev('_claveEnCurso !== null'), 'perdió la clave y ya no se puede reintentar');
  });

  test('si la clave sirve, la entrega, cierra la sesión de prueba y no la deja guardada en ningún lado', async () => {
    /* La regla de «Crear cuenta»: la contraseña se muestra, se manda y se olvida.
       MUTANTE QUE CAZA: guardarla en la ficha del equipo, en la cartera o en
       cualquier otra llave del almacén; o dejar abierta la sesión de prueba. */
    const P = abrir('abcd-efgh');
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    P.ev("claveListaEnSupabase('e1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, 'Contraseña cambiada');
    assert.match(String(P.elems.mBody.innerHTML), /abcd-efgh/, 'no le muestra a Joan la clave que tiene que mandar');
    assert.ok(P.pedidos.some(x => /\/auth\/v1\/logout/.test(x.url)), 'la sesión de prueba quedó abierta');
    assert.ok(todoLoGuardado(P).indexOf('abcd-efgh') < 0, 'la contraseña del gerente quedó escrita en el almacén del CRM');
    assert.equal(P.ev('_claveEnCurso'), null, 'la clave se quedó viva en la página después de entregarla');
  });

  test('la clave en curso es de UNA persona: no se le entrega a otra', () => {
    /* MUTANTE QUE CAZA: un _claveEnCurso que sea solo un texto. Con él, abrir la
       pantalla de Willian y después oprimir el botón con otra ficha le
       entregaría a Leidy la contraseña de Willian. */
    const P = abrir('abcd-efgh');
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    P.ev("claveListaEnSupabase('e2')");
    assert.match(String(P.ev('(window._avisos||[]).join(" ")')), /Se perdió la contraseña/);
    assert.ok(!P.pedidos.length, 'probó la clave de Willian con la cuenta de otra persona');
  });

  test('la ruta de «sí sé la de ahora» sigue en pie', () => {
    const P = abrir('x');
    P.ev("pantallaCuentaExiste(personaDeEquipo('e1'), 'abcd-efgh')");
    const h = String(P.elems.mBody.innerHTML);
    assert.match(h, /ceVieja/);
    assert.match(h, /cambiarClave\(&#39;e1&#39;\)|cambiarClave\('e1'\)/);
  });
});
