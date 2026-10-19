/* ============================================================================
 * «🔑 MI CONTRASEÑA» DEL EQUIPO, Y LOS «NO» DE SUPABASE EN ESPAÑOL
 * 19 de octubre de 2026.
 *
 *   node --test pruebas/mi-clave-equipo.test.js
 *
 * Joan: «William no puede cambiar la contraseña para ingresar al panel de
 * control». No podía porque no había dónde, y lo que estas pruebas sostienen,
 * con el CRM de verdad corriendo (banco-panel.js) y un Supabase Auth de
 * mentira que contesta lo que contesta el de verdad:
 *
 *   1. EL MENÚ DEL EQUIPO TIENE «🔑 Mi contraseña», y al abrirla se enciende
 *      ESE botón (el 22-sep una entrada sin su título apagó el menú entero).
 *   2. SE CAMBIA CON LA DE AHORA: primero /token con la vieja, después
 *      PUT /auth/v1/user con ESA sesión fresca, mandando solo la contraseña.
 *   3. LA SESIÓN QUE QUEDA VIVA SE GUARDA. Supabase cierra todas las demás al
 *      cambiar la clave; si el Panel se quedara con la vieja, lo siguiente
 *      después del «Listo» sería «tu sesión se venció».
 *   4. LO QUE SE SABE ANTES NO SALE A LA RED: el celular como clave, dos
 *      nuevas distintas, la nueva igual a la vieja.
 *   5. NINGÚN «NO» DE SUPABASE SALE EN INGLÉS — ni aquí, ni en la app del
 *      cliente (app/sesion-socio.js), ni en play/. Es la misma cuenta.
 *   6. LA PUERTA DEL EQUIPO dice cómo pedirle una nueva a Joan, y el recado
 *      de un celular del equipo ya no manda a «Supabase → Authentication» (un
 *      camino que no existe): nombra «Ponerle otra contraseña» y lo abre.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');
const MC = require('../panel/mi-clave.js');
const U = require('../app/cuenta.js');
const SS = require('../app/sesion-socio.js');
const UP = require('../panel/una-puerta.js');

const CELULAR = '3105550000';
const CORREO = '573105550000@tugarantia.net';
const VIEJA = 'abcd-2345';
const NUEVA = 'mi-clave-propia';

/* Lo que contesta Supabase Auth de verdad (reproducido el 19-oct contra
   GoTrue): el cuerpo y el código HTTP de cada rechazo al cambiar la clave. */
const RECHAZOS = {
  reautenticar: [400, { code: 400, error_code: 'reauthentication_needed', msg: 'Password update requires reauthentication' }],
  misma: [422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }],
  debil: [422, { code: 422, error_code: 'weak_password',
    msg: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
    weak_password: { reasons: ['characters'] } }],
  muchos: [429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }]
};
const LO_QUE_DICE = {
  reautenticar: /Sal de tu cuenta, entra otra vez con la contraseña de ahora y cámbiala enseguida/,
  misma: /igual a la que ya tienes/,
  debil: /al menos una minúscula, una mayúscula y un número/,
  muchos: /Espera unos minutos/
};
/* Palabras de los mensajes de GoTrue: si alguna aparece, se coló el inglés. */
const INGLES = /password|should|requires|reached|request|limit|invalid|credentials|different|known to be|reauthentication/i;

/* --------------------------------------------------------- Supabase Auth */
function gotrue(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, j, crudo) => ({
    ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(crudo !== undefined ? crudo : (j === undefined ? '' : JSON.stringify(j))),
    json: () => (crudo !== undefined ? Promise.reject(new SyntaxError('no es JSON')) : Promise.resolve(j))
  });
  const fetch = (url, cfg) => {
    url = String(url);
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ url, metodo: cfg && cfg.method, headers: (cfg && cfg.headers) || {}, cuerpo });
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      if (o.tokenCae) return Promise.reject(new TypeError('Failed to fetch'));
      if (o.token) return Promise.resolve(resp(o.token[0], o.token[1]));
      return Promise.resolve(cuerpo && cuerpo.email === CORREO && cuerpo.password === VIEJA
        ? resp(200, { access_token: 'tok-fresco', refresh_token: 'ref-fresco', expires_in: 3600, user: { email: CORREO } })
        : resp(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }));
    }
    if (/\/auth\/v1\/user$/.test(url)) {
      if (o.putCae) return Promise.reject(new TypeError('Failed to fetch'));
      if (o.putCrudo) return Promise.resolve(resp(o.putCrudo[0], undefined, o.putCrudo[1]));
      if (o.put) return Promise.resolve(resp(o.put[0], o.put[1]));
      return Promise.resolve(resp(200, { id: 'u-1', email: CORREO }));
    }
    if (/\/auth\/v1\/logout/.test(url)) return Promise.resolve(resp(204));
    if (/\/rest\/v1\/rpc\/clave_temporal_joan$/.test(url)) {
      return Promise.resolve(resp(200, o.claveTemporal || { ok: false, motivo: 'equipo' }));
    }
    return Promise.reject(new TypeError('sin red: ' + url));
  };
  const auth = () => vistas.filter(v => v.url.indexOf('/auth/v1/') >= 0);
  return { fetch, vistas, auth };
}

const cambiar = (G, x) => MC.cambiarMiClave(Object.assign({
  url: 'https://prueba.supabase.co/', anon: 'llave-anon', celular: '+57 310 555 0000',
  vieja: VIEJA, nueva: NUEVA, repite: NUEVA, fetch: G.fetch
}, x || {}));

/* ======================================================================== */
describe('panel/mi-clave.js: la propia, con la de ahora', () => {

  test('pide /token con la de ahora y cambia con ESA sesión, mandando solo la contraseña', async () => {
    const G = gotrue();
    const r = await cambiar(G);
    assert.equal(r.ok, true, r.texto);
    assert.equal(r.sesion.access_token, 'tok-fresco', 'no devolvió la sesión que queda viva');
    assert.equal(r.sesion.refresh_token, 'ref-fresco');
    const [token, puesta, ...resto] = G.auth();
    assert.match(token.url, /^https:\/\/prueba\.supabase\.co\/auth\/v1\/token\?grant_type=password$/);
    assert.equal(token.metodo, 'POST');
    assert.deepEqual(token.cuerpo, { email: CORREO, password: VIEJA });
    assert.equal(token.headers.apikey, 'llave-anon');
    assert.equal(token.headers.Authorization, undefined, 'el paso de la clave de ahora no lleva sesión');
    assert.match(puesta.url, /\/auth\/v1\/user$/);
    assert.equal(puesta.metodo, 'PUT');
    assert.equal(puesta.headers.Authorization, 'Bearer tok-fresco',
      'el cambio no fue con la sesión recién hecha: con una sesión de días, Supabase pide reautenticar');
    assert.deepEqual(puesta.cuerpo, { password: NUEVA }, 'el cambio manda algo más que la contraseña');
    assert.equal(resto.length, 0, 'después de cambiarla cerró la sesión que quedó viva');
  });

  test('lo que se sabe antes no sale a la red', async () => {
    const casos = [
      [{ vieja: '' }, /contraseña de ahora/],
      [{ nueva: 'x3105550000x', repite: 'x3105550000x' }, /No uses tu número de celular/],
      [{ nueva: '1234', repite: '1234' }, /al menos 8 caracteres/],
      [{ repite: 'mi-clave-propiA' }, /no quedaron iguales/],
      [{ nueva: VIEJA, repite: VIEJA }, /igual a la que ya tienes/],
      [{ celular: '' }, /Salir/]
    ];
    for (const [x, dice] of casos) {
      const G = gotrue();
      const r = await cambiar(G, x);
      assert.equal(r.ok, false, JSON.stringify(x) + ' pasó');
      assert.match(r.texto, dice, JSON.stringify(x));
      assert.equal(G.vistas.length, 0, JSON.stringify(x) + ' salió a la red');
    }
  });

  test('la de ahora mal: lo dice en español y no intenta cambiarla', async () => {
    for (const token of [undefined, [400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }]]) {
      const G = gotrue({ token });
      const r = await cambiar(G, { vieja: 'otra-cosa-1' });
      assert.equal(r.ok, false);
      assert.match(r.texto, /no es tu contraseña de ahora/);
      assert.doesNotMatch(r.texto, INGLES);
      assert.equal(G.auth().length, 1, 'con la de ahora mal, igual intentó cambiarla');
    }
  });

  test('cada «no» de Supabase al cambiarla sale en español, y se cierra SOLO la sesión de prueba', async () => {
    for (const nombre of Object.keys(RECHAZOS)) {
      const G = gotrue({ put: RECHAZOS[nombre] });
      const r = await cambiar(G);
      assert.equal(r.ok, false, nombre);
      assert.equal(r.sesion, undefined, nombre + ': entregó una sesión cuando la clave no cambió');
      assert.match(r.texto, LO_QUE_DICE[nombre], nombre);
      assert.doesNotMatch(r.texto, INGLES, nombre + ' salió en inglés: ' + r.texto);
      const salidas = G.auth().filter(v => /\/logout/.test(v.url));
      assert.equal(salidas.length, 1, nombre + ': la sesión de prueba quedó abierta');
      assert.match(salidas[0].url, /\/logout\?scope=local$/,
        nombre + ': sin scope=local, Supabase cierra TODAS las sesiones, también la del Panel abierto');
      assert.equal(salidas[0].headers.Authorization, 'Bearer tok-fresco');
    }
  });

  test('sin red al pedir el token dice que no hubo conexión; sin red al guardar, que no se sabe', async () => {
    const a = await cambiar(gotrue({ tokenCae: true }));
    assert.equal(a.ok, false);
    assert.equal(a.motivo, 'red');
    assert.match(a.texto, /No pude conectarme/);
    /* La red se cayó DESPUÉS de mandar la nueva: decir «no se cambió» sería
       mentir la mitad de las veces. Y la sesión del paso 1 es buena pase lo
       que pase, así que se entrega. */
    const b = await cambiar(gotrue({ putCae: true }));
    assert.equal(b.ok, false);
    assert.equal(b.motivo, 'incierto');
    assert.match(b.texto, /no supe si quedó cambiada/);
    assert.equal(b.sesion && b.sesion.access_token, 'tok-fresco');
  });

  test('un cuerpo que no es JSON (un 502 de una puerta intermedia) no es «sin red»', async () => {
    const r = await cambiar(gotrue({ putCrudo: [502, '<html>Bad Gateway</html>'] }));
    assert.equal(r.ok, false);
    assert.match(r.texto, /El sistema no contestó bien/);
  });
});

/* ======================================================================== */
describe('app/cuenta.js: traducirErrorAuth', () => {

  test('cada forma en que Supabase dice que no, en español', () => {
    const casos = [
      [RECHAZOS.reautenticar[1], 400, LO_QUE_DICE.reautenticar],
      [RECHAZOS.misma[1], 422, LO_QUE_DICE.misma],
      [RECHAZOS.debil[1], 422, LO_QUE_DICE.debil],
      [RECHAZOS.muchos[1], 429, LO_QUE_DICE.muchos],
      /* La forma nueva de GoTrue: `code` es el código y el texto va en `message`. */
      [{ code: 'same_password', message: 'New password should be different from the old password.' }, 422, LO_QUE_DICE.misma],
      /* La forma vieja: sin código, solo el mensaje. */
      [{ code: 422, msg: 'Password should be at least 6 characters' }, 422, /tiene que tener al menos 6 caracteres/],
      [{ code: 422, error_code: 'weak_password',
         msg: 'Password should be at least 10 characters. Password should contain at least one character of each: ' +
           'abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~.',
         weak_password: { reasons: ['length', 'characters'] } }, 422,
       /al menos 10 caracteres y llevar al menos una minúscula, una mayúscula, un número y un símbolo/],
      [{ code: 422, error_code: 'weak_password', msg: 'Password is known to be weak and easy to guess, please choose a different one.',
         weak_password: { reasons: ['pwned'] } }, 422, /listas de claves filtradas/],
      [{ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400, /no es tu contraseña de ahora/],
      [{ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }, 400, /Tu sesión se venció/],
      [{ code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }, 403, /Tu sesión se venció/],
      [{ message: 'upstream error' }, 503, /El sistema no contestó bien/],
      [null, 0, /No pude conectarme/],
      [null, 500, /El sistema no contestó bien/]
    ];
    casos.forEach(([j, estado, dice]) => {
      const t = U.traducirErrorAuth(j, estado);
      assert.match(t, dice, JSON.stringify(j));
      assert.doesNotMatch(t, INGLES, 'salió en inglés: ' + t);
    });
  });

  test('lo que no conoce dice el código para buscarlo, nunca el mensaje en inglés', () => {
    const t = U.traducirErrorAuth({ code: 400, error_code: 'user_banned', msg: 'User is banned' }, 400);
    assert.match(t, /«user_banned»/);
    assert.doesNotMatch(t, /User is banned/);
  });
});

/* ======================================================================== */
describe('la app del cliente (la misma cuenta) tampoco muestra el inglés', () => {

  test('app/sesion-socio.js: cambiarClave dice cada rechazo en español', async () => {
    for (const nombre of Object.keys(RECHAZOS)) {
      const [estado, cuerpo] = RECHAZOS[nombre];
      const cfg = { url: 'https://prueba.supabase.co', anon: 'llave-anon', ahora: () => Date.now(),
        fetch: () => Promise.resolve({ ok: false, status: estado, text: () => Promise.resolve(JSON.stringify(cuerpo)) }) };
      const s = { access_token: 't', refresh_token: 'r', expira_en: Date.now() + 3600e3, celular: '3000000000' };
      const r = await SS.cambiarClave(cfg, s, 'una-clave-mia', () => {});
      assert.equal(r.ok, false, nombre);
      assert.match(r.motivo, LO_QUE_DICE[nombre], nombre);
      assert.doesNotMatch(r.motivo, INGLES, nombre + ' salió en inglés: ' + r.motivo);
    }
  });

  test('play/: «Cambiar mi contraseña» dice cada rechazo en español', async () => {
    for (const nombre of Object.keys(RECHAZOS)) {
      const [estado, cuerpo] = RECHAZOS[nombre];
      const P = abrirPlay();
      const puestas = [];
      /* El fetch de la página es el del contexto: se reemplaza ahí, como haría
         el navegador con la respuesta de Supabase. */
      P.ev('this').fetch = (url, cfg) => {
        puestas.push({ url: String(url), cfg });
        return Promise.resolve({ ok: false, status: estado, json: () => Promise.resolve(cuerpo) });
      };
      P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net" } };');
      assert.match(P.ev('tarjetaCambiarClave()'), /id="errClave"/);
      P.ev('document.getElementById("clave1").value = "una-clave-mia"');
      P.ev('document.getElementById("clave2").value = "una-clave-mia"');
      P.ev('cambiarClave()');
      await asentar();
      assert.equal(puestas.length, 1, nombre + ': no mandó el cambio');
      const t = P.elems.errClave.textContent;
      assert.match(t, LO_QUE_DICE[nombre], nombre + ': ' + t);
      assert.doesNotMatch(t, INGLES, nombre + ' salió en inglés: ' + t);
    }
  });
});

/* ======================================================================== */
describe('el CRM en modo equipo: «🔑 Mi contraseña»', () => {

  /* El CRM en modo equipo, con la sesión de antes («tok-viejo») y la barra y
     el cuerpo de verdad: el banco no trae '.side' ni '.main', y sin ellos
     irEquipo no pinta nada. Los botones del menú se arman desde lo que la
     página pintó, para poder ver cuál se enciende. */
  function abrirEquipo(o, opciones) {
    const G = gotrue(o);
    const P = abrirPanel(Object.assign({ red: G.fetch }, opciones || {}));
    const doc = P.ctx.document;
    const nodo = sel => doc.getElementById('sel:' + sel);
    /* Con '.main' de verdad, irEquipo llega hasta el final, y el final sube la
       pantalla: el banco no traía scrollTo porque nadie había llegado ahí. */
    P.ctx.scrollTo = () => {};
    P.botones = [];
    doc.querySelector = sel => (['.side', '.main', '#gate .gate-card'].indexOf(sel) >= 0 ? nodo(sel) : null);
    doc.querySelectorAll = sel => {
      if (sel !== '.side .navbtn') return [];
      const h = String(nodo('.side').innerHTML);
      P.botones = [...h.matchAll(/<button class="navbtn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map(m => ({
        textContent: m[1].replace(/<[^>]+>/g, ''),
        on: false,
        classList: { toggle(c, si) { if (c === 'on') this.dueno.on = !!si; } }
      }));
      P.botones.forEach(b => { b.classList.dueno = b; });
      return P.botones;
    };
    P.ev('SESION_EQUIPO = { access_token: "tok-viejo", refresh_token: "ref-viejo", expira_en: Date.now() + 3600000 };');
    P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true,
      yo: { nombre: 'William Prueba', rol: 'gerente', celular: CELULAR }, equipo: [], gente: [] }) + ';');
    P.ev('modoEquipo()');
    return { P, G, nodo };
  }
  const escribir = (P, vieja, nueva, repite) => {
    const d = P.ctx.document;
    d.getElementById('mcVieja').value = vieja;
    d.getElementById('mcNueva').value = nueva;
    d.getElementById('mcRepite').value = repite;
  };

  test('el menú la tiene, y al abrirla se enciende ESE botón y ningún otro', () => {
    const { P, nodo } = abrirEquipo();
    assert.match(nodo('.side').innerHTML, /onclick="irEquipo\('clave'\)"[^>]*>.*Mi contraseña/,
      'el menú del equipo no tiene «Mi contraseña»');
    P.ev("irEquipo('clave')");
    const on = P.botones.filter(b => b.on);
    assert.equal(on.length, 1, 'al abrir «Mi contraseña» quedaron ' + on.length + ' botones encendidos');
    assert.match(on[0].textContent, /Mi contraseña/);
    const h = nodo('.main').innerHTML;
    ['mcVieja', 'mcNueva', 'mcRepite'].forEach(id => assert.match(h, new RegExp('id="' + id + '"'), 'falta ' + id));
    assert.match(h, /una sola cuenta, la de tu celular: esta contraseña es también la de la app de cliente/,
      'no dice que es la misma cuenta de su app de cliente');
    assert.match(h, /Joan no conoce tu contraseña nueva/);
  });

  test('si mi-clave.js no llegó, la pestaña lo dice y el menú sigue vivo', () => {
    const { P, nodo } = abrirEquipo({}, { sinMiClave: true });
    P.ev("irEquipo('clave')");
    assert.match(nodo('.main').innerHTML, /No cargó panel\/mi-clave\.js/);
  });

  test('cambiarla deja guardada la sesión fresca: la siguiente acción no dice «sesión vencida»', async () => {
    const { P, G, nodo } = abrirEquipo();
    P.ev("irEquipo('clave')");
    escribir(P, VIEJA, NUEVA, NUEVA);
    await P.ev('guardarMiClaveEq()');
    await asentar();
    const [token, puesta] = G.auth();
    assert.deepEqual(token.cuerpo, { email: CORREO, password: VIEJA });
    assert.equal(puesta.headers.Authorization, 'Bearer tok-fresco');
    assert.equal(P.ev('SESION_EQUIPO.access_token'), 'tok-fresco',
      'el Panel se quedó con la sesión vieja, que Supabase cerró al cambiar la clave');
    assert.equal(P.ev('SESION_EQUIPO.refresh_token'), 'ref-fresco');
    assert.equal(await P.ev('tokenDeEquipo()'), 'tok-fresco');
    const h = nodo('.main').innerHTML + P.elems.mcCaja.innerHTML;
    assert.match(h, /Listo: tu contraseña quedó cambiada/);
    assert.match(P.elems.mcCaja.innerHTML, /app de cliente/, 'no dice que también cambió la de su app de cliente');
    assert.match(P.elems.mcCaja.innerHTML, /Joan no conoce/);
  });

  test('un «no» de Supabase se dice en español, y el Panel sigue con su sesión', async () => {
    const { P } = abrirEquipo({ put: RECHAZOS.misma });
    P.ev("irEquipo('clave')");
    escribir(P, VIEJA, NUEVA, NUEVA);
    await P.ev('guardarMiClaveEq()');
    await asentar();
    const m = P.elems.mcMsg.innerHTML;
    assert.match(m, /igual a la que ya tienes/);
    assert.doesNotMatch(m, INGLES);
    assert.equal(P.ev('SESION_EQUIPO.access_token'), 'tok-viejo', 'cambió de sesión sin haber cambiado la clave');
    assert.equal(P.elems.mcBtn.disabled, false, 'el botón quedó apagado después del «no»');
  });

  test('el celular como clave y dos nuevas distintas se niegan sin salir a la red', async () => {
    for (const [nueva, repite, dice] of [['x' + CELULAR + 'x', 'x' + CELULAR + 'x', /No uses tu número de celular/],
                                         [NUEVA, NUEVA + '!', /no quedaron iguales/]]) {
      const { P, G } = abrirEquipo();
      P.ev("irEquipo('clave')");
      escribir(P, VIEJA, nueva, repite);
      await P.ev('guardarMiClaveEq()');
      assert.match(P.elems.mcMsg.innerHTML, dice);
      assert.equal(G.auth().length, 0, 'salió a la red con algo que se sabía que no');
    }
  });

  test('la puerta del equipo dice cómo pedirle una nueva a Joan', () => {
    const { P, nodo } = abrirEquipo();
    P.ev('pintarPuertaEquipo()');
    const h = nodo('#gate .gate-card').innerHTML;
    assert.match(h, /¿Olvidaste tu contraseña\? Escríbele a Joan y pídele una nueva/);
    assert.match(h, /Equipo → tu nombre → «Ponerle otra contraseña»/);
  });
});

/* ======================================================================== */
describe('el recado de un celular del equipo', () => {

  test('ya no manda a «Supabase → Authentication»: nombra el camino que sí existe', () => {
    const t = UP.textoMotivo({ ok: false, motivo: 'equipo' });
    assert.doesNotMatch(t, /Supabase → Authentication/,
      'el panel de Supabase no deja escribirle una contraseña a nadie: ese camino no existe');
    assert.match(t, /Equipo → esa persona → «Ponerle otra contraseña»/);
    assert.match(t, /Mi contraseña/);
  });

  function conRecado(persona) {
    const G = gotrue();
    const P = abrirPanel({ red: G.fetch });
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
    P.cargarCartera({ socios: [], prestamos: [], config: { negocio: 'Tu Garantía' }, equipo: [persona] });
    P.ev("_ayudas=[{id:11,celular:'" + CELULAR + "',nota:'',creada_en:'2026-10-19'}]");
    P.preguntas = [];
    P.ctx.confirm = m => { P.preguntas.push(String(m)); return true; };
    return P;
  }

  test('«Darle una clave nueva» a alguien del equipo abre su «Ponerle otra contraseña»', async () => {
    const P = conRecado({ id: 'e1', nombre: 'William Prueba', celular: '+57 310 555 0000', rol: 'gerente', estado: 'activo' });
    P.ev('darClaveNueva(11)');
    await asentar();
    assert.match(P.preguntas[1] || '', /¿Abro ya «Ponerle otra contraseña» de William Prueba\?/);
    const m = String(P.elems.mBody.innerHTML);
    assert.ok(m.indexOf("select public.equipo_poner_clave('" + CELULAR + "', ") >= 0 ||
              m.indexOf('select public.equipo_poner_clave(&#39;' + CELULAR + '&#39;, ') >= 0,
      'no abrió la pantalla con la línea para el editor SQL');
  });

  test('a alguien retirado no se le ofrece: equipo_poner_clave no lo toca', async () => {
    const P = conRecado({ id: 'e1', nombre: 'William Prueba', celular: CELULAR, rol: 'gerente', estado: 'retirado' });
    P.ev('darClaveNueva(11)');
    await asentar();
    assert.equal(P.preguntas.length, 1, 'le ofreció ponerle clave a un retirado');
    assert.match((P.ctx._avisos || []).join('\n'), /alguien de tu equipo/);
  });
});
