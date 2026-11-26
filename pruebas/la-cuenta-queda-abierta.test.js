/* ===========================================================================
 * LA CUENTA QUEDA ABIERTA EN ESTE TELÉFONO — 26 de noviembre de 2026 (v171)
 *
 * Joan, con la foto de «Ya tienes una cuenta con este celular, pero esa
 * contraseña no es la suya»: «la app les pide contraseña y ya despues no pueden
 * ingresar… quiero que sea sencillo ingresar y registrarse como en cualquier
 * otra app y que quede guardado el usuario y contraseña en el telefono del
 * cliente para que siempre este abierta… que exista algun boton de guardar».
 *
 * La causa: play/ guardaba la sesión solo en la pestaña (sessionStorage, 17-sep).
 * Cerrar el navegador cerraba la cuenta, y de ahí salía el segundo registro con
 * una contraseña que nadie recordaba.
 *
 * QUÉ SE PRUEBA AQUÍ
 *   A. La pieza sola (app/cuenta-abierta.js): guardar, leer, renovar, y las dos
 *      reglas que protegen la cuenta —mirar lo guardado ANTES de gastar el token
 *      de renovar, y nunca cruzar la sesión de una persona con la de otra—.
 *   B. La página del registro (play/): entra y queda abierta; al volver abre
 *      sola; vencida se renueva; un «no» del servidor lleva a «Entrar» con el
 *      celular puesto; sin señal no se cierra nada; la casilla desmarcada deja
 *      todo como antes; «Salir» lo borra todo; un 401 a mitad de uso se renueva
 *      y se repite; la contraseña no queda escrita en ninguna parte; PlataChat
 *      no cambia.
 *   C. La app instalada (app/socio.html): la sesión que toma de play/ es UNA
 *      sola cadena —le devuelve lo que renueva y toma lo que play/ renueva—, y
 *      su «Salir» también borra la cuenta que play/ dejó abierta.
 *   D. PlataChat: su «Salir», lo mismo.
 *   E. Lo que se publica: el archivo en la precarga, con su firma y su ?v.
 *
 * UNA TRAMPA DEL BANCO, dicha para que nadie la tome por un defecto: el banco de
 * play/ fabrica los elementos al pedirlos, con `checked: false`; no lee el
 * atributo `checked` del HTML. En el teléfono la casilla NACE MARCADA (eso lo
 * mira un navegador de verdad, fuera de este archivo); aquí cada prueba la marca
 * a mano cuando quiere decir «la dejó como venía».
 * ======================================================================== */
'use strict';
const test = require('node:test');
const { describe } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const CA = require(path.join(RAIZ, 'app', 'cuenta-abierta.js'));
const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
const SOCIO = fs.readFileSync(path.join(RAIZ, 'app', 'socio.html'), 'utf8');
const PLATACHAT = fs.readFileSync(path.join(RAIZ, 'platachat', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const PIEZA = fs.readFileSync(path.join(RAIZ, 'app', 'cuenta-abierta.js'), 'utf8');

const HORA = 3600 * 1000;
const CORREO_MARIA = '573001112233@tugarantia.net';
const CORREO_PEDRO = '573109998877@tugarantia.net';
const CLAVE = 'Maria.Secreta9';

/* Una sesión como la entrega Supabase. `n` distingue los eslabones de la cadena. */
function sesionDe(n, extra) {
  return Object.assign({
    access_token: 'tok-' + n, refresh_token: 'ref-' + n, token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'u-maria', email: CORREO_MARIA, created_at: '2026-11-20T10:00:00Z', user_metadata: {} }
  }, extra || {});
}
/* La misma, ya guardada en el teléfono, vencida hace `hace` ms (o vigente si es negativo). */
function guardada(n, hace, extra) {
  const s = sesionDe(n, extra);
  s.expira_en = Date.now() - (hace === undefined ? 5 * 60000 : hace);
  s.expires_at = Math.floor(s.expira_en / 1000);
  return s;
}
function almacenDeMentira(inicial) {
  const d = Object.assign({}, inicial || {});
  return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}
const resp = (status, j) => ({
  ok: status >= 200 && status < 300, status,
  json: () => Promise.resolve(j), text: () => Promise.resolve(j == null ? '' : JSON.stringify(j))
});

/* La red de mentira. `o.renovar`: 'bien' (da el eslabón siguiente), un número (ese estado
   HTTP) o 'sin_red'. `o.rechaza`: el token al que las consultas le contestan 401. */
function red(o) {
  o = Object.assign({ renovar: 'bien', eslabon: 1 }, o || {});
  const ll = [];
  const fetch = (u, op) => {
    u = String(u);
    let c = null; try { c = JSON.parse(op && op.body); } catch (e) { c = null; }
    const auth = String((op && op.headers && op.headers.Authorization) || '');
    ll.push({ url: u, cuerpo: c, auth });
    if (/grant_type=password/.test(u)) {
      if (o.clave && c.password !== o.clave) return Promise.resolve(resp(400, { error: 'invalid_grant' }));
      return Promise.resolve(resp(200, sesionDe(o.eslabon, { user: { id: 'u-' + c.email, email: c.email, user_metadata: {} } })));
    }
    if (/grant_type=refresh_token/.test(u)) {
      if (o.renovar === 'sin_red') return Promise.reject(new Error('sin señal'));
      if (typeof o.renovar === 'number') return Promise.resolve(resp(o.renovar, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }));
      o.eslabon += 1;
      return Promise.resolve(resp(200, sesionDe(o.eslabon)));
    }
    if (/auth\/v1\/logout/.test(u)) return Promise.resolve(resp(204, null));
    if (/rest\/v1\/rpc\//.test(u)) {
      if (o.rechaza && auth === 'Bearer ' + o.rechaza) return Promise.resolve(resp(401, { message: 'JWT expired' }));
      if (/rpc\/mi_cuenta/.test(u)) return Promise.resolve(resp(200, { ok: true, vinculada: false }));
      return Promise.resolve(resp(200, { ok: true }));
    }
    return Promise.resolve(resp(200, { ok: true }));
  };
  return { fetch, ll, o, de: re => ll.filter(x => re.test(x.url)) };
}
const RENOVAR = /grant_type=refresh_token/, ENTRAR = /grant_type=password/;

/* ======================================================================== */
describe('A. La pieza sola (app/cuenta-abierta.js)', () => {

  test('sella la hora en que vence sin tocar la sesión que recibe', () => {
    const j = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };
    const s = CA.sellar(j, 1000);
    assert.equal(s.expira_en, 1000 + HORA);
    assert.equal(j.expira_en, undefined, 'cambió la sesión que le pasaron');
    assert.equal(CA.sellar({ access_token: 'a', expires_at: 5000 }, 1).expira_en, 5000 * 1000, 'expires_at de Supabase viene en segundos');
    assert.equal(CA.sellar({ refresh_token: 'r' }, 1), null, 'sin token de acceso no hay sesión');
  });

  test('vigente deja un minuto de margen: un token que vence en el aire no sirve', () => {
    assert.equal(CA.vigente({ access_token: 'a', expira_en: 100000 }, 100000 - CA.MARGEN_MS - 1), true);
    assert.equal(CA.vigente({ access_token: 'a', expira_en: 100000 }, 100000 - CA.MARGEN_MS + 1), false);
    assert.equal(CA.vigente({ access_token: 'a' }, 1), false, 'sin hora de vencimiento no se sabe: se renueva');
  });

  test('por defecto la cuenta queda abierta; quien dice que no, queda como antes y se le borra lo guardado', () => {
    const a = almacenDeMentira();
    assert.equal(CA.quiere(a), true);
    assert.equal(CA.guardar(a, sesionDe(1), Date.now()), true);
    CA.recordarCelular(a, '3001112233');
    assert.ok(a.d[CA.LLAVE]);
    CA.decir(a, false);
    assert.equal(CA.quiere(a), false);
    assert.equal(a.d[CA.LLAVE], undefined, 'dijo que no y la sesión se quedó en el teléfono');
    assert.equal(CA.celular(a), '', 'dijo que no y su celular se quedó a la vista');
    assert.equal(CA.guardar(a, sesionDe(1), Date.now()), false, 'guardó aunque dijo que no');
    CA.decir(a, true);
    assert.equal(CA.guardar(a, sesionDe(1), Date.now()), true);
  });

  test('sin token de renovar no se guarda ni se lee: no serviría para volver', () => {
    const a = almacenDeMentira();
    assert.equal(CA.guardar(a, { access_token: 'a' }, 1), false);
    a.d[CA.LLAVE] = JSON.stringify({ access_token: 'a' });
    assert.equal(CA.leer(a), null);
    assert.equal(a.d[CA.LLAVE], undefined, 'una sesión que no sirve se quedó guardada');
  });

  test('el relevo: si lo guardado es el eslabón que se gastó, se cambia por el nuevo; si es otra cadena, no se toca', () => {
    const a = almacenDeMentira();
    CA.guardar(a, sesionDe(1), Date.now());
    assert.equal(CA.relevar(a, 'ref-1', sesionDe(2), Date.now()), true);
    assert.equal(JSON.parse(a.d[CA.LLAVE]).refresh_token, 'ref-2');
    assert.equal(CA.relevar(a, 'ref-1', sesionDe(3), Date.now()), false, 'lo guardado ya no era ese eslabón');
    assert.equal(JSON.parse(a.d[CA.LLAVE]).refresh_token, 'ref-2');
    const vacio = almacenDeMentira();
    assert.equal(CA.relevar(vacio, 'ref-1', sesionDe(2), Date.now()), false);
    assert.equal(vacio.d[CA.LLAVE], undefined, 'escribió una cuenta donde no había ninguna');
  });

  test('un teléfono que no deja escribir no revienta nada', () => {
    const roto = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    assert.equal(CA.guardar(roto, sesionDe(1), 1), false);
    assert.equal(CA.leer(roto), null);
    assert.equal(CA.celular(roto), '');
    assert.doesNotThrow(() => { CA.borrar(roto); CA.decir(roto, false); CA.recordarCelular(roto, '3001112233'); CA.olvidarCelular(roto); });
  });

  test('renovar: trae el eslabón nuevo, sellado, y conserva de quién es', async () => {
    const R = red();
    const vieja = guardada(1);
    const n = await CA.renovar({ url: 'https://x.supabase.co/', anon: 'llave', fetch: R.fetch }, vieja);
    assert.equal(n.access_token, 'tok-2');
    assert.equal(n.refresh_token, 'ref-2');
    assert.ok(n.expira_en > Date.now() + 50 * 60000);
    assert.equal(n.user.email, CORREO_MARIA);
    assert.equal(R.de(RENOVAR).length, 1);
    assert.equal(R.de(RENOVAR)[0].url, 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token');
    assert.deepEqual(R.de(RENOVAR)[0].cuerpo, { refresh_token: 'ref-1' });
  });

  test('renovar: un «no» del servidor es sesión muerta; un corte, un 429 o un 500, NO', async () => {
    const cfg = R => ({ url: 'https://x', anon: 'k', fetch: R.fetch });
    await assert.rejects(CA.renovar(cfg(red({ renovar: 400 })), guardada(1)), e => e.causa === 'sesion');
    for (const caso of ['sin_red', 429, 500, 503, 408]) {
      await assert.rejects(CA.renovar(cfg(red({ renovar: caso })), guardada(1)), e => e.causa === 'red', 'con ' + caso + ' dio la cuenta por cerrada');
    }
  });

  test('renovar: dos pedidos a la vez gastan UN solo token de renovar', async () => {
    const R = red();
    const cfg = { url: 'https://x', anon: 'k', fetch: R.fetch };
    const vieja = guardada(1);
    const [a, b] = await Promise.all([CA.renovar(cfg, vieja), CA.renovar(cfg, vieja)]);
    assert.equal(R.de(RENOVAR).length, 1, 'el token de renovar sirve una vez: el segundo pedido lo habría quemado');
    assert.equal(a.refresh_token, b.refresh_token);
  });

  test('renovar: lee la respuesta aunque solo traiga json() (y aunque solo traiga text())', async () => {
    const soloJson = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(sesionDe(2)) });
    const soloTexto = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(sesionDe(3))) });
    assert.equal((await CA.renovar({ url: 'https://x', anon: 'k', fetch: soloJson }, guardada(1))).access_token, 'tok-2');
    assert.equal((await CA.renovar({ url: 'https://x', anon: 'k', fetch: soloTexto }, guardada(1, undefined, { refresh_token: 'otro' }))).access_token, 'tok-3');
  });

  describe('ANTES de gastar el token de renovar se mira lo guardado', () => {
    /* El token de renovar sirve UNA vez, y Supabase cierra la cuenta en todas partes si le
       llega uno de dos vueltas atrás. Otra pestaña, o la app instalada, pudo haber dejado
       un eslabón más nuevo en el teléfono. */

    test('hay uno más nuevo y vigente de la misma persona: se sigue con ese, sin salir a la red', async () => {
      const R = red();
      const nueva = guardada(5, -HORA);
      const n = await CA.renovar({ url: 'https://x', anon: 'k', fetch: R.fetch, releer: () => nueva }, guardada(1));
      assert.equal(n.refresh_token, 'ref-5');
      assert.equal(R.ll.length, 0, 'salió a renovar teniendo en el teléfono una sesión buena');
    });

    test('hay uno más nuevo pero también vencido: se renueva ESE, nunca el viejo', async () => {
      const R = red({ eslabon: 5 });
      const n = await CA.renovar({ url: 'https://x', anon: 'k', fetch: R.fetch, releer: () => guardada(5, 60000) }, guardada(1, 2 * HORA));
      assert.deepEqual(R.de(RENOVAR).map(x => x.cuerpo.refresh_token), ['ref-5'], 'quemó el eslabón viejo: así es como Supabase cierra la cuenta en todas partes');
      assert.equal(n.refresh_token, 'ref-6');
    });

    test('lo guardado es de OTRA persona: no se toca, se renueva la mía', async () => {
      const R = red();
      const dePedro = guardada(9, -HORA, { user: { id: 'u-pedro', email: CORREO_PEDRO } });
      const n = await CA.renovar({ url: 'https://x', anon: 'k', fetch: R.fetch, releer: () => dePedro }, guardada(1));
      assert.deepEqual(R.de(RENOVAR).map(x => x.cuerpo.refresh_token), ['ref-1']);
      assert.equal(n.user.email, CORREO_MARIA, 'la sesión de María se cambió por la de Pedro');
    });

    test('lo guardado es más VIEJO que lo vivo: no se retrocede', async () => {
      const R = red({ eslabon: 3 });
      const viva = guardada(3, 60000);
      await CA.renovar({ url: 'https://x', anon: 'k', fetch: R.fetch, releer: () => guardada(1, 3 * HORA) }, viva);
      assert.deepEqual(R.de(RENOVAR).map(x => x.cuerpo.refresh_token), ['ref-3']);
    });

    test('el servidor dijo que no, y mientras tanto otra pestaña guardó una buena: se sigue con esa', async () => {
      const R = red({ renovar: 400 });
      let veces = 0;
      const releer = () => (++veces === 1 ? null : guardada(7, -HORA));
      const n = await CA.renovar({ url: 'https://x', anon: 'k', fetch: R.fetch, releer }, guardada(1));
      assert.equal(n.refresh_token, 'ref-7');
    });

    test('el servidor dijo que no y lo guardado es de otra persona: la cuenta se da por cerrada, no se cruza', async () => {
      const R = red({ renovar: 400 });
      const dePedro = guardada(9, -HORA, { user: { id: 'u-pedro', email: CORREO_PEDRO } });
      await assert.rejects(CA.renovar({ url: 'https://x', anon: 'k', fetch: R.fetch, releer: () => dePedro }, guardada(1)), e => e.causa === 'sesion');
    });
  });

  test('mismaPersona: por la cuenta o por el correo; sin con qué comparar, no', () => {
    assert.equal(CA.mismaPersona({ user: { id: 'a' } }, { user: { id: 'a' } }), true);
    assert.equal(CA.mismaPersona({ user: { id: 'a' } }, { user: { id: 'b' } }), false);
    assert.equal(CA.mismaPersona({ user: { email: 'X@y.z' } }, { user: { email: 'x@y.z' } }), true);
    assert.equal(CA.mismaPersona({}, {}), false);
    assert.equal(CA.mismaPersona(null, { user: { id: 'a' } }), false);
  });

  test('copiarEn deja el MISMO objeto: la página sabe de quién es cada respuesta por la sesión que la pidió', () => {
    const viva = sesionDe(1), nueva = sesionDe(2);
    const r = CA.copiarEn(viva, nueva);
    assert.equal(r, viva);
    assert.equal(viva.access_token, 'tok-2');
    assert.equal(viva.refresh_token, 'ref-2');
  });

  test('la contraseña va al llavero del TELÉFONO, y solo si el teléfono tiene uno', async () => {
    const guardadas = [];
    const ventana = {
      PasswordCredential: function (d) { this.d = d; },
      navigator: { credentials: { store: c => { guardadas.push(c.d); return Promise.resolve(); } } }
    };
    assert.equal(await CA.guardarEnElLlavero(ventana, '300 111 2233', CLAVE, 'Tu Garantía'), true);
    assert.deepEqual(guardadas, [{ id: '3001112233', password: CLAVE, name: 'Tu Garantía' }]);
    assert.equal(await CA.guardarEnElLlavero({ navigator: {} }, '3001112233', CLAVE), false, 'un iPhone no tiene PasswordCredential: no revienta');
    assert.equal(await CA.guardarEnElLlavero(ventana, '', CLAVE), false);
    assert.equal(await CA.guardarEnElLlavero(ventana, '3001112233', ''), false);
    const queFalla = { PasswordCredential: function () { throw new Error('no'); }, navigator: { credentials: { store() {} } } };
    assert.equal(await CA.guardarEnElLlavero(queFalla, '3001112233', CLAVE), false);
  });

  test('la pieza no escribe la contraseña en ninguna parte del sitio', () => {
    const sinComentarios = PIEZA.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(sinComentarios, /setItem\([^)]*(clave|password)/i);
    /* Lo único que toca la contraseña es el llavero del navegador. */
    const usos = sinComentarios.match(/\bclave\b/g) || [];
    assert.ok(usos.length > 0 && usos.length <= 4, 'la contraseña se usa en más sitios que el llavero: ' + usos.length);
  });
});

/* ======================================================================== */
describe('B. La página del registro (play/)', () => {

  function entrarComoMaria(P, marcada) {
    P.ev("$('inTel').value = '300 111 2233'; $('inClave').value = " + JSON.stringify(CLAVE) + "; $('inDejar').checked = " + (marcada === false ? 'false' : 'true') + '; entrar();');
  }

  test('la página carga la pieza después de cuenta.js, y sin errores', () => {
    assert.match(PLAY, /<script src="\.\.\/app\/cuenta\.js\?v=\d+"><\/script>[\s\S]{0,900}<script src="\.\.\/app\/cuenta-abierta\.js\?v=171"><\/script>/);
    const P = abrirPlay();
    assert.deepEqual(P.fallos, []);
    assert.equal(P.ev('!!CA'), true);
  });

  test('ENTRA Y QUEDA ABIERTA: la sesión y el celular quedan en el teléfono; la contraseña, en ninguna parte', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch });
    entrarComoMaria(P);
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'cuenta');
    const g = JSON.parse(P.almacen.play_cuenta_abierta);
    assert.equal(g.access_token, 'tok-1');
    assert.equal(g.refresh_token, 'ref-1');
    assert.ok(g.expira_en > Date.now() + 50 * 60000, 'se guardó sin la hora en que vence');
    assert.equal(P.almacen.play_celular_recordado, '3001112233');
    const todo = JSON.stringify(P.almacen) + JSON.stringify(P.sesion);
    assert.ok(todo.indexOf(CLAVE) < 0, 'la contraseña quedó escrita en el teléfono');
  });

  test('AL VOLVER (otro día, otra pestaña) LA CUENTA ABRE SOLA, sin pedir nada', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch, almacen: { play_cuenta_abierta: JSON.stringify(guardada(1, -HORA / 2)), play_celular_recordado: '3001112233' } });
    await asentar(16);
    assert.deepEqual(P.fallos, []);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.ev('SESION.access_token'), 'tok-1');
    assert.equal(R.de(ENTRAR).length, 0);
    assert.equal(R.de(RENOVAR).length, 0, 'el token todavía servía: no había que renovarlo');
  });

  test('al volver con el token VENCIDO (lo normal: dura una hora) se renueva y abre', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch, almacen: { play_cuenta_abierta: JSON.stringify(guardada(1, 20 * HORA)), play_celular_recordado: '3001112233' } });
    assert.equal(P.ev('VISTA'), 'abriendo');
    assert.match(P.elems.cuerpo.innerHTML, /Abriendo tu cuenta/);
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.ev('SESION.access_token'), 'tok-2');
    assert.deepEqual(R.de(RENOVAR).map(x => x.cuerpo.refresh_token), ['ref-1']);
    assert.equal(JSON.parse(P.almacen.play_cuenta_abierta).refresh_token, 'ref-2', 'el eslabón nuevo no quedó guardado: la próxima visita quemaría el viejo');
    assert.equal(JSON.parse(P.sesion.play_sesion).refresh_token, 'ref-2');
    assert.equal(R.de(ENTRAR).length, 0);
  });

  test('el servidor dice que esa sesión ya no vale: «Entrar» va PRIMERO, con el celular puesto, y se dice qué pasó', async () => {
    const R = red({ renovar: 400 });
    const P = abrirPlay({ fetch: R.fetch, almacen: { play_cuenta_abierta: JSON.stringify(guardada(1, 20 * HORA)), play_celular_recordado: '3001112233' } });
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'entrar');
    const c = P.elems.cuerpo.innerHTML;
    assert.match(c, /Hola de nuevo/);
    assert.match(c, /value="300 111 2233"/, 'el celular no vino puesto');
    assert.ok(c.indexOf('Hola de nuevo') < c.indexOf('Abrir mi cuenta'), '«Abrir mi cuenta» sigue antes que «Entrar»: es el camino al segundo registro');
    assert.match(P.elems.errEntrar.textContent, /Tu cuenta se cerró en este teléfono/);
    assert.equal(P.almacen.play_cuenta_abierta, undefined, 'una sesión muerta se quedó guardada');
    assert.equal(P.almacen.play_celular_recordado, '3001112233');
  });

  test('SIN SEÑAL NO SE CIERRA NADA: la cuenta abre con lo que hay y lo guardado sigue ahí', async () => {
    const R = red({ renovar: 'sin_red' });
    const antes = JSON.stringify(guardada(1, 20 * HORA));
    const P = abrirPlay({ fetch: R.fetch, almacen: { play_cuenta_abierta: antes, play_celular_recordado: '3001112233' } });
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(JSON.parse(P.almacen.play_cuenta_abierta).refresh_token, 'ref-1', 'un corte de señal le cerró la cuenta');
  });

  test('«No es mi cuenta» mientras abre: se borra lo que quedó y se va a la portada sin el celular del otro', async () => {
    const R = red({ renovar: 'sin_red' });
    const P = abrirPlay({ fetch: R.fetch, almacen: { play_cuenta_abierta: JSON.stringify(guardada(1, 20 * HORA)), play_celular_recordado: '3001112233' } });
    assert.match(P.elems.cuerpo.innerHTML, /noEsMiCuenta\(\)/);
    P.ev('noEsMiCuenta()');
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'entrar', 'la respuesta que llegó después la devolvió a la cuenta del otro');
    assert.equal(P.almacen.play_cuenta_abierta, undefined);
    assert.equal(P.almacen.play_celular_recordado, undefined);
    assert.equal(P.ev('SESION'), null);
  });

  /* Una red que deja la renovación en el aire hasta que la prueba la suelte. */
  function redQueCuelgaAlRenovar() {
    const R = red();
    let soltar;
    const colgada = new Promise(r => { soltar = r; });
    return { R, soltar, fetch: (u, op) => (RENOVAR.test(String(u)) ? colgada.then(() => R.fetch(u, op)) : R.fetch(u, op)) };
  }
  const conCuentaVencida = () => ({ play_cuenta_abierta: JSON.stringify(guardada(1, 20 * HORA)), play_celular_recordado: '3001112233' });

  test('si la pantalla cambia mientras se renueva, el eslabón nuevo queda guardado igual: el viejo ya se gastó', async () => {
    const C = redQueCuelgaAlRenovar();
    const P = abrirPlay({ fetch: C.fetch, almacen: conCuentaVencida() });
    assert.equal(P.ev('VISTA'), 'abriendo');
    P.ev("VISTA = 'registro'");   // la persona se fue a otra pantalla
    C.soltar();
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'registro', 'la respuesta que llegó tarde le cambió la pantalla debajo del dedo');
    assert.equal(JSON.parse(P.almacen.play_cuenta_abierta).refresh_token, 'ref-2',
      'el teléfono se quedó con el eslabón gastado: la próxima visita lo quemaría otra vez');
  });

  test('«No es mi cuenta» y la renovación llega DESPUÉS: no se vuelve a escribir nada en el teléfono', async () => {
    const C = redQueCuelgaAlRenovar();
    const P = abrirPlay({ fetch: C.fetch, almacen: conCuentaVencida() });
    P.ev('noEsMiCuenta()');
    C.soltar();
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'entrar');
    assert.equal(P.almacen.play_cuenta_abierta, undefined, 'dijo que no era su cuenta y la respuesta tardía se la volvió a guardar');
    assert.equal(P.almacen.play_celular_recordado, undefined);
    assert.equal(P.ev('SESION'), null);
  });

  test('LA CASILLA DESMARCADA (el teléfono no es suyo): todo queda como antes, solo en la pestaña', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch });
    entrarComoMaria(P, false);
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.almacen.play_cuenta_abierta, undefined, 'dijo que no y la cuenta quedó abierta en el teléfono');
    assert.equal(P.almacen.play_celular_recordado, undefined);
    assert.equal(P.almacen.play_dejar_abierta, '0');
    assert.ok(P.sesion.play_sesion, 'la recarga sí tiene que sobrevivir, como siempre');
    /* Otro día, otra pestaña: la portada de siempre. */
    const Q = abrirPlay({ fetch: red().fetch, almacen: P.almacen });
    await asentar(8);
    assert.equal(Q.ev('VISTA'), 'entrar');
    assert.doesNotMatch(Q.elems.cuerpo.innerHTML, /Hola de nuevo/);
  });

  test('la casilla dice lo que hace, nace marcada, y la entrada es un formulario de verdad para el llavero', () => {
    const P = abrirPlay();
    const t = P.ev("tarjetaDeEntrar('')");
    assert.match(t, /<form id="formEntrar" autocomplete="on" onsubmit="return false">/);
    assert.match(t, /id="inTel" name="username"[^>]*autocomplete="username"/);
    assert.match(t, /current-password/);
    assert.match(t, /<input type="checkbox" id="inDejar" checked>/, 'la casilla no nace marcada');
    assert.match(t, /Dejar mi cuenta abierta en este teléfono/);
    assert.match(t, /Desmárcala si este teléfono no es tuyo/);
    assert.doesNotMatch(t, /noEsMiCuenta/);
    /* Quien dijo que no la vez pasada la encuentra desmarcada. */
    P.ev("CA.decir(almacenFijo(), false)");
    assert.match(P.ev("tarjetaDeEntrar('')"), /<input type="checkbox" id="inDejar">/);
  });

  test('la portada de quien nunca entró aquí trae «Ya tengo cuenta: entrar» al lado de «Abrir mi cuenta»', () => {
    const P = abrirPlay();
    const c = P.elems.cuerpo.innerHTML;
    assert.match(c, /Ya tengo cuenta: entrar/);
    assert.match(c, /¿Ya abriste tu cuenta\?/);
    assert.doesNotMatch(c, /Hola de nuevo/);
    assert.equal(typeof P.ev('irAEntrar'), 'function');
  });

  test('el último paso del registro trae la misma casilla, y la anota ANTES de crear la cuenta', () => {
    const P = abrirPlay();
    assert.match(PLAY, /casillaDejarAbierta\('rDejar'\)/);
    const desde = PLAY.indexOf('function enviarRegistro(sensibles)');
    const anota = PLAY.indexOf("anotarSiQuedaAbierta('rDejar');", desde), alta = PLAY.indexOf("'/auth/v1/signup'", desde);
    assert.ok(desde > 0 && anota > desde && alta > anota,
      'la casilla se anota después de crear la cuenta: la sesión ya se habría guardado sin preguntar');
    assert.equal(PLAY.indexOf('\nfunction ', desde + 10) > alta, true, 'el alta ya no está dentro de enviarRegistro: esta prueba mira otra cosa');
    assert.match(P.ev("casillaDejarAbierta('rDejar')"), /id="rDejar" checked/);
    /* Y la contraseña recién creada se le ofrece al llavero, en los dos finales del registro. */
    assert.equal((PLAY.match(/ofrecerGuardarLaClave\(foto\.celular, foto\.clave\)/g) || []).length, 2);
  });

  test('con la casilla marcada se le ofrece la contraseña al llavero del teléfono; desmarcada, no', async () => {
    for (const marcada of [true, false]) {
      const R = red();
      const P = abrirPlay({ fetch: R.fetch });
      const ofrecidas = [];
      P.ventana.PasswordCredential = function (d) { this.d = d; };
      P.ventana.navigator.credentials = { store: c => { ofrecidas.push(c.d); return Promise.resolve(); } };
      entrarComoMaria(P, marcada);
      await asentar(16);
      assert.equal(P.ev('VISTA'), 'cuenta');
      if (marcada) assert.deepEqual(ofrecidas, [{ id: '3001112233', password: CLAVE, name: 'Tu Garantía' }]);
      else assert.deepEqual(ofrecidas, [], 'en un teléfono que no es suyo se ofreció guardar su contraseña');
    }
  });

  test('«SALIR» LO BORRA TODO: la sesión del teléfono, la de la pestaña y el celular', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch });
    entrarComoMaria(P);
    await asentar(16);
    P.ev('salirDeCuenta()');
    await asentar(8);
    assert.equal(P.almacen.play_cuenta_abierta, undefined, 'salió y la cuenta quedó abierta en el teléfono');
    assert.equal(P.almacen.play_celular_recordado, undefined);
    assert.equal(P.sesion.play_sesion, undefined);
    assert.equal(R.de(/auth\/v1\/logout/).length, 1);
    const Q = abrirPlay({ fetch: red().fetch, almacen: P.almacen });
    await asentar(8);
    assert.equal(Q.ev('VISTA'), 'entrar');
  });

  test('UN 401 A MITAD DE USO se renueva y se repite: la persona no se entera, y la sesión viva es el mismo objeto', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch });
    entrarComoMaria(P);
    await asentar(16);
    R.o.rechaza = 'tok-1';
    R.ll.length = 0;
    P.ev("window.__s = SESION; window.__r = null; rpcConToken('mi_registro', {}, SESION).then(function (x) { window.__r = x; }, function (e) { window.__r = { fallo: e && e.status }; });");
    await asentar(16);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__r)')), { ok: true });
    assert.deepEqual(R.ll.map(x => (/rpc\/mi_registro/.test(x.url) ? x.auth : RENOVAR.test(x.url) ? 'renovar ' + x.cuerpo.refresh_token : x.url)),
      ['Bearer tok-1', 'renovar ref-1', 'Bearer tok-2']);
    assert.equal(P.ev('window.__s === SESION'), true, 'la sesión viva se cambió por otro objeto: las respuestas en camino ya no son de nadie');
    assert.equal(P.ev('SESION.access_token'), 'tok-2');
    assert.equal(JSON.parse(P.almacen.play_cuenta_abierta).refresh_token, 'ref-2');
    assert.equal(JSON.parse(P.sesion.play_sesion).refresh_token, 'ref-2');
  });

  test('un 401 y el servidor tampoco deja renovar: sale el 401 de siempre, una sola vez', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch });
    entrarComoMaria(P);
    await asentar(16);
    R.o.rechaza = 'tok-1'; R.o.renovar = 400;
    R.ll.length = 0;
    P.ev("window.__r = null; rpcConToken('mi_registro', {}, SESION).then(function (x) { window.__r = x; }, function (e) { window.__r = { fallo: e && e.status }; });");
    await asentar(16);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__r)')), { fallo: 401 });
    assert.equal(R.de(/rpc\/mi_registro/).length, 1, 'repitió la consulta sin haber podido renovar');
  });

  test('con la cuenta a la vista el token se renueva ANTES de vencer (el latido y la vuelta a la pestaña)', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch });
    entrarComoMaria(P);
    await asentar(16);
    R.ll.length = 0;
    P.ev('mantenerLaSesionAlDia()');
    await asentar(8);
    assert.equal(R.de(RENOVAR).length, 0, 'recién entrada y ya salió a renovar');
    P.ev('SESION.expira_en = Date.now() + 2 * 60000; SESION.expires_at = Math.floor(SESION.expira_en / 1000);');
    P.ev('mantenerLaSesionAlDia()');
    await asentar(8);
    assert.equal(R.de(RENOVAR).length, 1);
    assert.equal(P.ev('SESION.access_token'), 'tok-2');
    assert.equal(P.ev('VISTA'), 'cuenta');
  });

  test('la pieza pide por la red de la PÁGINA, no por la suya', () => {
    /* En el banco la pieza llega con require: su `fetch` sería el de Node y saldría a
       internet de verdad. La página le pasa el suyo, buscado al llamar. */
    assert.match(PLAY, /function cfgDeLaCuenta\(\) \{[\s\S]{0,700}fetch: function \(u, o\) \{ return fetch\(u, o\); \}/);
  });

  test('PLATACHAT NO CAMBIA: ni casilla, ni cuenta guardada aquí, ni abre la de Tu Garantía', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch, search: '?marca=platachat',
      almacen: { play_cuenta_abierta: JSON.stringify(guardada(1, -HORA / 2)), play_celular_recordado: '3001112233' } });
    await asentar(8);
    assert.notEqual(P.ev('VISTA'), 'cuenta', 'PlataChat abrió sola la cuenta que quedó de Tu Garantía');
    assert.notEqual(P.ev('VISTA'), 'abriendo');
    assert.equal(P.ev("casillaDejarAbierta('x')"), '');
    assert.equal(P.ev('dejarLaCuentaAbierta(' + JSON.stringify(sesionDe(4)) + ')'), false);
    assert.equal(JSON.parse(P.almacen.play_cuenta_abierta).refresh_token, 'ref-1', 'PlataChat escribió sobre la cuenta de Tu Garantía');
    assert.doesNotMatch(P.elems.cuerpo.innerHTML, /Hola de nuevo/);
  });

  test('si la pieza no llegó (una caché vieja), la página sigue como antes y no revienta', async () => {
    const R = red();
    const P = abrirPlay({ fetch: R.fetch, sinCuentaAbierta: true });
    assert.deepEqual(P.fallos, []);
    assert.equal(P.ev('CA'), null);
    assert.doesNotMatch(P.ev("tarjetaDeEntrar('')"), /inDejar/);
    entrarComoMaria(P);
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.almacen.play_cuenta_abierta, undefined);
    assert.ok(P.sesion.play_sesion);
    P.ev('salirDeCuenta()');
    await asentar(8);
    assert.equal(P.sesion.play_sesion, undefined);
  });

  test('pasar la sesión a otra parte (o salir) no deja la copia del teléfono: la sesión se pasa, no se copia', () => {
    assert.match(PLAY, /function olvidarSesionEnCurso\(\) \{[\s\S]{0,500}CA\.borrar\(almacenFijo\(\)\)/);
  });
});

/* ======================================================================== */
describe('C. La app instalada (app/socio.html): la sesión que vino de play/ es una sola cadena', () => {
  const AHORA = Date.now();
  const deMaria = (n, vence) => ({ access_token: 'tok-' + n, refresh_token: 'ref-' + n,
    expires_at: Math.floor((vence || AHORA + HORA) / 1000), expira_en: vence || AHORA + HORA,
    user: { id: 'u-maria', email: CORREO_MARIA } });
  const nubeSocio = () => (url) => {
    if (/grant_type=refresh_token/.test(url)) return { status: 200, cuerpo: deMaria(2, AHORA + 2 * HORA) };
    if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: false } };
    if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-11-26T14:55:00Z' } } };
    return { status: 200, cuerpo: { ok: true } };
  };

  test('lo que la app renueva se le devuelve a play/: la copia de la pestaña y la del teléfono quedan con el eslabón nuevo', async () => {
    const A = abrirSocio({ red: nubeSocio(), ahora: AHORA,
      sesion: { play_sesion: JSON.stringify(deMaria(1)) }, local: { play_cuenta_abierta: JSON.stringify(deMaria(1)) } });
    await asentar(16);
    assert.equal(A.ev('SESION.soloEstaPestana'), true, 'la sesión de play/ no se tomó en esta pestaña');
    A.ev("guardarSesionSocio({ access_token: 'tok-2', refresh_token: 'ref-2', expira_en: " + (AHORA + 2 * HORA) + ", celular: SESION.celular })");
    for (const [donde, crudo] of [['la pestaña', A.sesion.getItem('play_sesion')], ['el teléfono', A.local.getItem('play_cuenta_abierta')]]) {
      const j = JSON.parse(crudo);
      assert.equal(j.refresh_token, 'ref-2', donde + ' se quedó con el eslabón viejo: la próxima visita a play/ lo quemaría');
      assert.equal(j.access_token, 'tok-2');
      assert.equal(j.expira_en, AHORA + 2 * HORA);
      assert.equal(j.expires_at, Math.floor((AHORA + 2 * HORA) / 1000), donde + ': quedó con la hora vieja de Supabase, que manda sobre la nuestra');
      assert.equal(j.user.email, CORREO_MARIA, donde + ': se perdió de quién es');
    }
    assert.equal(A.local.getItem('socio_cuenta'), null, 'la que vino de play/ no se guarda como sesión de la app (decisión del 7-oct)');
  });

  test('la copia de OTRA persona (u otra cadena) en el teléfono no se toca', async () => {
    const dePedro = JSON.stringify({ access_token: 'tok-p', refresh_token: 'ref-p', expira_en: AHORA + HORA, user: { id: 'u-pedro', email: CORREO_PEDRO } });
    const A = abrirSocio({ red: nubeSocio(), ahora: AHORA,
      sesion: { play_sesion: JSON.stringify(deMaria(1)) }, local: { play_cuenta_abierta: dePedro } });
    await asentar(16);
    A.ev("guardarSesionSocio({ access_token: 'tok-2', refresh_token: 'ref-2', expira_en: " + (AHORA + 2 * HORA) + ", celular: SESION.celular })");
    assert.equal(A.local.getItem('play_cuenta_abierta'), dePedro);
  });

  test('lo que play/ renovó en otra pestaña se toma aquí, en el MISMO objeto y solo hacia adelante', async () => {
    const A = abrirSocio({ red: nubeSocio(), ahora: AHORA,
      sesion: { play_sesion: JSON.stringify(deMaria(1)) }, local: { play_cuenta_abierta: JSON.stringify(deMaria(1)) } });
    await asentar(16);
    A.ev('window.__s = SESION');
    assert.equal(A.ev('tomarDePlayLoNuevo()'), false, 'no había nada nuevo que tomar');
    A.local.setItem('play_cuenta_abierta', JSON.stringify(deMaria(3, AHORA + 3 * HORA)));
    assert.equal(A.ev('tomarDePlayLoNuevo()'), true);
    assert.equal(A.ev('SESION.refresh_token'), 'ref-3');
    assert.equal(A.ev('SESION.access_token'), 'tok-3');
    assert.equal(A.ev('window.__s === SESION'), true);
    assert.equal(JSON.parse(A.sesion.getItem('play_sesion')).refresh_token, 'ref-3', 'la copia de la pestaña quedó atrás: una recarga volvería al eslabón viejo');
    /* Una más vieja no hace retroceder. */
    A.local.setItem('play_cuenta_abierta', JSON.stringify(deMaria(1, AHORA + HORA)));
    assert.equal(A.ev('tomarDePlayLoNuevo()'), false);
    assert.equal(A.ev('SESION.refresh_token'), 'ref-3');
  });

  test('la de otra persona no se toma, ni la sesión propia de la app (la que no vino de play/) se cambia', async () => {
    const dePedro = Object.assign(deMaria(9, AHORA + 9 * HORA), { user: { id: 'u-pedro', email: CORREO_PEDRO } });
    const A = abrirSocio({ red: nubeSocio(), ahora: AHORA,
      sesion: { play_sesion: JSON.stringify(deMaria(1)) }, local: { play_cuenta_abierta: JSON.stringify(dePedro) } });
    await asentar(16);
    assert.equal(A.ev('tomarDePlayLoNuevo()'), false);
    assert.equal(A.ev('SESION.refresh_token'), 'ref-1');
    /* La app con su propia sesión guardada: lo de play/ no es asunto suyo. */
    const propia = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + HORA, celular: '3001112233' });
    const B = abrirSocio({ red: nubeSocio(), ahora: AHORA, local: { socio_cuenta: propia, play_cuenta_abierta: JSON.stringify(deMaria(5, AHORA + 5 * HORA)) } });
    await asentar(16);
    assert.equal(B.ev('tomarDePlayLoNuevo()'), false);
    assert.equal(B.ev('SESION.refresh_token'), 'r');
  });

  test('al arrancar con la sesión de play/ en la pestaña, toma el eslabón más nuevo que play/ dejó en el teléfono', async () => {
    const A = abrirSocio({ red: nubeSocio(), ahora: AHORA,
      sesion: { play_sesion: JSON.stringify(deMaria(1)) }, local: { play_cuenta_abierta: JSON.stringify(deMaria(4, AHORA + 4 * HORA)) } });
    await asentar(16);
    assert.equal(A.ev('SESION.refresh_token'), 'ref-4', 'arrancó con el eslabón viejo de la pestaña teniendo uno más nuevo en el teléfono');
  });

  test('«Salir» de la app también borra la cuenta que play/ dejó abierta en el teléfono, y su celular', async () => {
    const A = abrirSocio({ red: nubeSocio(), ahora: AHORA,
      sesion: { play_sesion: JSON.stringify(deMaria(1)) },
      local: { play_cuenta_abierta: JSON.stringify(deMaria(1)), play_celular_recordado: '3001112233' } });
    await asentar(16);
    A.ev('salir()');
    await asentar();
    assert.equal(A.local.getItem('play_cuenta_abierta'), null, 'salió de la app y la próxima visita a play/ le abriría la cuenta sola');
    assert.equal(A.local.getItem('play_celular_recordado'), null);
    assert.equal(A.sesion.getItem('play_sesion'), null);
  });

  test('la app oye los cambios del teléfono y la vuelta a la pestaña', () => {
    assert.match(SOCIO, /addEventListener\('storage', function \(e\) \{[^}]*tomarDePlayLoNuevo\(\)/);
    assert.match(SOCIO, /addEventListener\('visibilitychange', function \(\) \{ if \(!document\.hidden\) tomarDePlayLoNuevo\(\); \}\)/);
  });
});

/* ======================================================================== */
describe('D. PlataChat: su «Salir» también', () => {
  test('borra la cuenta que play/ dejó abierta en el teléfono y el celular que recuerda', () => {
    const salir = PLATACHAT.slice(PLATACHAT.indexOf('function salir(msg)'));
    const cuerpo = salir.slice(0, salir.indexOf('\nfunction ', 20));
    assert.match(cuerpo, /localStorage\.removeItem\('play_cuenta_abierta'\); localStorage\.removeItem\('play_celular_recordado'\);/);
  });
});

/* ======================================================================== */
describe('E. Lo que se publica', () => {
  test('la pieza está en la precarga con el mismo ?v que pide la página, y firma al llegar', () => {
    assert.match(SW, /'app\/cuenta-abierta\.js\?v=171'/);
    assert.match(SW, /const CACHE = 'tugarantia-v(\d+)'/);
    assert.ok(Number(/const CACHE = 'tugarantia-v(\d+)'/.exec(SW)[1]) >= 171);
    const sinComentarios = PIEZA.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
    assert.ok(sinComentarios.indexOf('(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();') === 0,
      'la firma no es lo primero después del comentario de cabecera');
  });

  test('las llaves del teléfono son las mismas en la pieza, en la app y en PlataChat', () => {
    assert.equal(CA.LLAVE, 'play_cuenta_abierta');
    assert.equal(CA.LLAVE_CELULAR, 'play_celular_recordado');
    assert.equal(CA.LLAVE_PREFERENCIA, 'play_dejar_abierta');
    assert.match(SOCIO, /var LLAVE_PLAY_ABIERTA = 'play_cuenta_abierta', LLAVE_PLAY_CELULAR = 'play_celular_recordado';/);
  });
});
