'use strict';
/* ==========================================================================
 * LA RECARGA SOLA NO CORTA NADA NI PROMETE LO QUE NO HACE — 21 de octubre de
 * 2026 (verificación del lote 1: R2, R3, R4 y R5)
 *
 *   node --test pruebas/la-recarga-no-corta-nada.test.js
 *
 * SE ACTUALIZA SOLA (app/actualizar.js) recarga play/, app/socio.html y
 * platachat/ en un momento seguro que decide cada página. La verificación
 * del lote encontró, con el controlador de verdad, cuatro huecos:
 *   R2  «Salir» con las fotos del registro subiendo: la portada recargaba en
 *       el acto y mataba la subida que I3 deja viva a propósito; la copia de
 *       la cédula, la cara y la ubicación se quedaba en el teléfono prestado.
 *   R3  una escritura en camino (la foto del comprobante, un mensaje, la
 *       contraseña nueva) y un toque a otra pestaña: la recarga la cortaba.
 *   R4  la caja de SOLO LECTURA con el enlace de la tarjeta de instalar
 *       contaba como «texto tecleado»: en Edge, Firefox o dentro de
 *       Instagram la app del socio no se recargaba nunca, y prometía que sí.
 *   R5  un modo que NUNCA tiene momento seguro (la cuenta del enlace #d=, el
 *       «Ver como», PlataChat con la calculadora movida) prometía «se pone
 *       sola cuando termines y vuelvas al inicio».
 *
 * Aquí corren las páginas de verdad en sus bancos con el controlador DE
 * VERDAD de app/actualizar.js: solo el navegador (el service worker, las
 * cachés, la visibilidad, location.reload) es de mentira, y se le entrega
 * al controlador que la página arranca (controladorDeVerdad).
 *
 * Todas FALLAN con 49dc0c3.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../app/actualizar.js');
const B = require('./banco-registro.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirPlataChat } = require('./banco-platachat.js');
const { asentar } = require('./esperar.js');

/* ==========================================================================
 * EL CONTROLADOR DE VERDAD, CON UN NAVEGADOR DE MENTIRA
 * `ev` corre código en la página y `ventana` es su window. La página arranca
 * app/actualizar.js con SUS opciones (momentoSeguro, nuncaEsSeguro, lugar);
 * aquí solo se le pone el `entorno`: la versión publicada vive en
 * st.claves, location.reload cuenta, y `campos()` es lo que el navegador
 * tendría a la vista en <input>/<textarea>.
 * ======================================================================== */
async function controladorDeVerdad(ev, ventana, o) {
  o = o || {};
  const st = { recargas: 0, hidden: false, claves: ['tugarantia-v139'], oyentes: { doc: {}, win: {}, sw: {} },
               sesion: {}, t: Date.parse('2026-10-21T19:00:00-05:00'), campos: o.campos || (() => []), elementos: [] };
  const oir = d => (t, f) => { (st.oyentes[d][t] = st.oyentes[d][t] || []).push(f); };
  const disparar = (d, t) => (st.oyentes[d][t] || []).slice().forEach(f => f({ type: t }));
  const reg = { installing: null, waiting: null, update: () => Promise.resolve() };
  const el = tag => {
    const e = { tagName: String(tag).toUpperCase(), style: {}, hijos: [], textContent: '', id: '', className: '', attrs: {}, oyentes: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(h) { this.hijos.push(h); return h; },
      addEventListener(t, f) { this.oyentes[t] = f; } };
    st.elementos.push(e);
    return e;
  };
  const document = {
    get hidden() { return st.hidden; }, get visibilityState() { return st.hidden ? 'hidden' : 'visible'; },
    addEventListener: oir('doc'), removeEventListener() {},
    createElement: el, getElementById: id => st.elementos.find(e => e.id === id) || null,
    querySelectorAll: sel => (sel === 'video' ? [] : st.campos()), body: null, head: null
  };
  document.body = el('body'); document.head = el('head');
  ventana.__entornoACT = {
    window: { addEventListener: oir('win'), removeEventListener() {} },
    document,
    navigator: { onLine: true, serviceWorker: { ready: Promise.resolve(reg), addEventListener: oir('sw'), removeEventListener() {} } },
    caches: { keys: () => Promise.resolve(st.claves.slice()) },
    sessionStorage: { getItem: k => (k in st.sesion ? st.sesion[k] : null), setItem: (k, v) => { st.sesion[k] = String(v); }, removeItem: k => { delete st.sesion[k]; } },
    location: { protocol: 'https:', reload() { st.recargas++; } },
    ahora: () => st.t, setInterval: () => 1, clearInterval() {}
  };
  ev('(function () { var i = Actualizar.iniciar; Actualizar.iniciar = function (op) { op.entorno = window.__entornoACT; return i(op); }; })();' +
     'if (ACT) ACT.detener(); arrancarActualizar();');
  await asentar(16);
  const C = {
    st,
    /* La persona ya está mirando: pasó el rato de «justo al volver» y tocó. */
    mirando() { st.t += 10000; disparar('doc', 'pointerdown'); },
    publicar(v) { st.claves = ['tugarantia-' + v]; disparar('sw', 'controllerchange'); return asentar(16); },
    ocultar() { st.hidden = true; disparar('doc', 'visibilitychange'); return asentar(16); },
    volver() { st.hidden = false; disparar('doc', 'visibilitychange'); return asentar(16); },
    /* Lo último que decidió el controlador: {accion, aviso: {texto, boton}}. */
    estado: () => JSON.parse(ev('JSON.stringify(ACT.estado())')),
    texto() { const e = C.estado(); return e.aviso ? e.aviso.texto : ''; }
  };
  return C;
}

/* ==========================================================================
 * R2 — «SALIR» CON LAS FOTOS DEL REGISTRO SUBIENDO
 * ======================================================================== */
describe('R2: «Salir» con la subida de fotos en el aire (la que I3 deja viva)', () => {

  test('la portada NO recarga mientras la subida no conteste; contesta, suelta la copia, y recarga al salir de la app', async () => {
    const almacen = {}, sesion = {};
    const P = B.abrir({ almacen, sesion });
    B.nube(P);
    B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
    B.mariaHastaElPermiso(P, true);
    P.ev('window.__colgar = /registro_archivos_guardar/;');
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.equal(B.colgadas(P).length, 1, 'la subida de las fotos no salió');
    P.ev('window.__colgar = null;');
    P.ev('pintarCuenta()');
    await asentar(10);
    P.ev("irA('perfil')");   // donde está «Salir»: no es momento seguro
    const C = await controladorDeVerdad(P.ev, P.ventana);
    C.mirando();
    await C.publicar('v140');
    assert.equal(C.st.recargas, 0, 'recargó en Perfil');
    /* «Salir» para devolver el teléfono prestado. */
    P.ev('salirDeCuenta()');
    await asentar(16);
    assert.equal(P.ev('VISTA'), 'entrar');
    assert.equal(C.st.recargas, 0, 'la portada recargó con la subida en el aire: la copia de María se queda en el teléfono prestado');
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'la subida suelta no frena el momento seguro');
    await C.ocultar();
    assert.equal(C.st.recargas, 0, 'recargó al salir de la app con la subida en el aire');
    await C.volver();
    /* La subida contesta: I3 suelta la copia del teléfono. */
    B.soltar(P, 0);
    await asentar(16);
    assert.equal(P.ev('colaDe(' + JSON.stringify(B.CEL_MARIA) + ')'), null, 'la respuesta no soltó la copia de María');
    assert.equal(P.ev('momentoSeguroPlay()'), true);
    C.mirando();
    await C.ocultar();
    assert.equal(C.st.recargas, 1, 'terminada la subida, no se puso sola al salir de la app');
  });
});

/* ==========================================================================
 * R3 — UNA ESCRITURA EN CAMINO, EN CUALQUIER PANTALLA
 * ======================================================================== */
describe('R3: una escritura en camino no se corta por cambiar de pestaña', () => {
  const SESION_PLAY = JSON.stringify({ access_token: 'tok-prueba', refresh_token: 'ref', user: { email: '573001112233@tugarantia.net', created_at: '2026-10-20T10:00:00Z' } });
  /* La red de play/, que retiene todo hasta que la prueba conteste. */
  const redQueRetiene = P => P.ev('window.__pend = []; fetch = function (u, o) { return new Promise(function (res) {' +
    ' window.__pend.push({ u: String(u), o: o || {}, res: res }); }); };');
  const contestar = (P, re) => P.ev('window.__pend.filter(function (x) { return ' + re + '.test(x.u); }).forEach(function (x) {' +
    " x.res({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); });");

  test('play/: la contraseña nueva y una RPC que escribe frenan Historial; una lectura no', async () => {
    for (const [nombre, salir, re] of [
      ['la contraseña nueva', "irA('perfil'); $('clave1').value = 'Nueva.Clave9'; $('clave2').value = 'Nueva.Clave9'; cambiarClave();", '/auth\\/v1\\/user/'],
      ['la foto del chat', "rpcSesion('chat_foto_sesion', { p_canal: 'servicio', p_imagen: 'data:image/jpeg;base64,AAAA' });", '/chat_foto_sesion/'],
      ['un mensaje del chat', "rpcSesion('chat_escribir_sesion', { p_canal: 'servicio', p_texto: 'hola' });", '/chat_escribir_sesion/']]) {
      const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
      assert.equal(P.ev('VISTA'), 'cuenta');
      redQueRetiene(P);
      const C = await controladorDeVerdad(P.ev, P.ventana);
      C.mirando();
      await C.publicar('v140');
      P.ev("irA('chat')");   // una pantalla que no es de la lista
      P.ev(salir);
      await asentar(8);
      P.ev("irA('historial')");
      await asentar(16);
      assert.equal(C.st.recargas, 0, nombre + ' en camino y la recarga la cortó al tocar «Historial»');
      contestar(P, re);
      await asentar(16);
      assert.equal(P.ev('ESCRITURAS_EN_CAMINO'), 0, nombre + ': el conteo no bajó al contestar');
      assert.equal(C.st.recargas, 0, 'recargó debajo del dedo al terminar ' + nombre);
      await C.ocultar();
      assert.equal(C.st.recargas, 1, 'terminada ' + nombre + ', no se puso sola al salir de la app');
    }
    /* Una lectura (el latido del chat) no frena nada: cortarla no pierde nada. */
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    redQueRetiene(P);
    const C = await controladorDeVerdad(P.ev, P.ventana);
    C.mirando();
    await C.publicar('v140');
    P.ev("irA('chat'); rpcSesion('chat_leer_sesion', { p_canal: 'servicio', p_desde: 0 });");
    P.ev("irA('historial')");
    await asentar(16);
    assert.equal(C.st.recargas, 1, 'una lectura en camino frenó la recarga');
  });

  test('platachat/: la foto del comprobante subiendo y un toque a «Plata»: no recarga', async () => {
    for (const [nombre, mandar, re] of [
      ['la foto del comprobante', "subirFotoChat('data:image/jpeg;base64,COMPROBANTE', null)", /chat_foto_sesion/],
      ['un mensaje', "$('chTexto').value = 'ya pagué'; enviarChat()", /chat_escribir_sesion/]]) {
      const P = abrirPlataChat();
      await asentar();
      await P.entrarComo('3001112233', 'Maria.Secreta9');
      const C = await controladorDeVerdad(P.ev, P.ctx);
      C.mirando();
      await C.publicar('v140');
      P.ev("irA('chats')");
      await asentar(8);
      P.st.colgar = re;
      P.ev(mandar);
      await asentar(8);
      assert.equal(P.st.colgadas.length, 1, nombre + ' no salió');
      P.ev("irA('plata')");
      await asentar(16);
      assert.equal(C.st.recargas, 0, nombre + ' en camino y la recarga la cortó al tocar «Plata»');
      P.suelta(0, { ok: true, id: 1 });
      await asentar(16);
      assert.equal(C.st.recargas, 0, 'recargó debajo del dedo al terminar');
      await C.ocultar();
      assert.equal(C.st.recargas, 1, 'terminada ' + nombre + ', no se puso sola al salir de la app');
    }
  });

  test('app/socio.html: un mensaje del chat o la contraseña nueva en camino, y un toque a «Inicio»: no recarga', async () => {
    const CORREO = '573001112222@tugarantia.net';
    const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
      socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
    for (const [nombre, hacer, colgar] of [
      ['un mensaje del chat', "irA('chat'); $('chTexto').value = 'hola, ya pagué'; chatEnviar();", /chat_escribir_sesion/],
      ['la contraseña nueva', "pantallaCambiarClave(); $('ccNueva').value = 'Nueva.Clave.2026'; $('ccRepite').value = 'Nueva.Clave.2026'; cambiarClave();", /auth\/v1\/user/]]) {
      const pendientes = [];
      const red = (url, cuerpo) => {
        if (colgar.test(url)) return new Promise(r => pendientes.push(r));
        if (/grant_type=password$/.test(url)) return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
        if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-21T10:00:00Z' } };
        if (/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
        return { status: 404, cuerpo: { message: 'no existe' } };
      };
      const S = abrirSocio({ red });
      await asentar();
      S.elem('inCel').value = '3001112222'; S.elem('inClave').value = 'mi-clave-buena';
      S.ev('entrar()');
      await asentar(16);
      S.elem('inCel').value = ''; S.elem('inClave').value = '';
      assert.equal(S.ev('PANTALLA'), 'inicio', 'no entró');
      const C = await controladorDeVerdad(S.ev, S.ctx);
      C.mirando();
      await C.publicar('v140');
      S.ev(hacer);
      await asentar(8);
      assert.equal(pendientes.length, 1, nombre + ' no salió');
      S.ev("irA('inicio')");
      await asentar(16);
      assert.equal(C.st.recargas, 0, nombre + ' en camino y la recarga lo cortó al tocar «Inicio»');
      pendientes[0]({ status: 200, cuerpo: { ok: true, id: 1 } });
      await asentar(16);
      await C.ocultar();
      assert.equal(C.st.recargas, 1, 'terminado ' + nombre + ', no se puso sola al salir de la app');
    }
  });
});

/* ==========================================================================
 * R4 — LO QUE NADIE PUEDE ESCRIBIR NO ES «TEXTO TECLEADO»
 * ======================================================================== */
describe('R4: la caja de solo lectura de la tarjeta de instalar no frena la actualización', () => {

  test('hayTextoALaVista salta lo de solo lectura y lo apagado (propiedad o atributo)', () => {
    const campo = (extra) => Object.assign({ tagName: 'INPUT', value: 'https://tugarantia.net/app/socio.html', getClientRects: () => [1],
      getAttribute: k => (k === 'type' ? 'text' : null), hasAttribute: () => false }, extra);
    const doc = l => ({ querySelectorAll: () => l });
    assert.equal(A.hayTextoALaVista(doc([campo({ readOnly: true })])), false, 'una caja de solo lectura contó como texto tecleado');
    assert.equal(A.hayTextoALaVista(doc([campo({ disabled: true })])), false, 'una caja apagada contó como texto tecleado');
    assert.equal(A.hayTextoALaVista(doc([campo({ hasAttribute: k => k === 'readonly' })])), false, 'el atributo readonly no se miró');
    assert.equal(A.hayTextoALaVista(doc([campo({})])), true, 'lo tecleado de verdad dejó de contar');
  });

  /* Los <input> que la pantalla visible pintó, como los vería el navegador:
     con su readonly y el valor vivo de los que tienen id. */
  function camposVisibles(S) {
    const html = String(S.elem(S.visible('pCuenta') ? 'cuerpo' : 'entrarCuerpo').innerHTML);
    const out = [];
    for (const m of html.matchAll(/<(input|textarea)\b([^>]*)>/g)) {
      const a = m[2];
      const id = (/\bid="([^"]*)"/.exec(a) || [])[1];
      const tipo = (/\btype="([^"]*)"/.exec(a) || [, ''])[1];
      const ro = /\sreadonly\b/.test(' ' + a);
      out.push({ tagName: m[1].toUpperCase(), type: tipo || 'text', readOnly: ro, disabled: false,
        value: id ? String(S.elem(id).value || '') : (/\bvalue="([^"]*)"/.exec(a) || [, ''])[1],
        getAttribute: k => (k === 'type' ? tipo : null), hasAttribute: k => (k === 'readonly' ? ro : false),
        getClientRects: () => [{}] });
    }
    return out;
  }
  const UA = {
    firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    instagram: 'Mozilla/5.0 (Linux; Android 14; SM-A146M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 Instagram 352.0.0.0.0 Android'
  };

  test('socio.html en Firefox y dentro de Instagram (Android): la entrada se recarga sola al salir de la app', async () => {
    for (const [nombre, ua] of Object.entries(UA)) {
      const S = abrirSocio({ navegador: { userAgent: ua, maxTouchPoints: 5 } });
      await asentar();
      assert.equal(S.ev('PANTALLA'), 'entrar');
      const cajas = camposVisibles(S).filter(c => c.readOnly && c.value);
      assert.ok(cajas.length >= 1, nombre + ': la tarjeta no pintó la caja del enlace: la prueba no prueba el caso');
      const C = await controladorDeVerdad(S.ev, S.ctx, { campos: () => camposVisibles(S) });
      C.mirando();
      await C.publicar('v140');
      assert.equal(/se pone sola cuando termines/.test(C.texto()), false,
        nombre + ': en la entrada (que es el inicio) dijo «cuando termines y vuelvas al inicio»: ' + C.texto());
      await C.ocultar();
      assert.equal(C.st.recargas, 1, nombre + ': la caja de solo lectura del enlace frenó la recarga para siempre');
    }
  });
});

/* ==========================================================================
 * R5 — UN MODO QUE NUNCA ES SEGURO NO PROMETE «SE PONE SOLA»
 * ======================================================================== */
describe('R5: un modo sin momento seguro no promete «se pone sola»', () => {
  const PROMESA = /se pone sola/;

  test('decidir: con `nunca`, ni recarga ni promete, en ningún momento; ofrece el botón', () => {
    const base = { pagina: 'v139', nueva: 'v140', instalando: false, enLinea: true, soloAvisar: false,
                   seguro: true, autoPosible: true };
    for (const momento of ['oculta', 'volviendo', 'transicion', 'mirando']) {
      for (const autoPosible of [true, false]) {
        const d = A.decidir(Object.assign({}, base, { nunca: true, momento, autoPosible }));
        assert.equal(d.accion, 'avisar', momento + ': recargó en un modo que nunca es seguro');
        assert.equal(PROMESA.test(d.aviso.texto), false, momento + ': ' + d.aviso.texto);
        assert.equal(d.aviso.boton, 'Actualizar ahora');
        assert.match(d.aviso.texto, /«Actualizar ahora»/);
      }
    }
    assert.deepEqual(A.decidir(Object.assign({}, base, { nunca: true, enLinea: false, momento: 'mirando' })), { accion: 'nada', aviso: null });
  });

  test('app/socio.html abierta por el enlace del CRM (#d=): Inicio, Historial y Garantía SÍ se recargan, y vuelve a la pestaña', async () => {
    const PAQ = { n: 'Adriana Prueba', f: '2026-10-21T10:00:00Z',
      d: { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [], socio: { codigo: 'CL-0007' },
           perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } } };
    const hash = '#d=' + Buffer.from(JSON.stringify(PAQ)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const S = abrirSocio({ hash });
    await asentar();
    assert.equal(S.ev('S && S.origen'), 'enlace');
    assert.equal(S.ev('PANTALLA'), 'inicio');
    const C = await controladorDeVerdad(S.ev, S.ctx);
    C.mirando();
    await C.publicar('v140');
    assert.equal(C.st.recargas, 0, 'recargó debajo del dedo');
    assert.equal(/termines y vuelvas al inicio/.test(C.texto()), false, 'en el inicio le dijo «cuando vuelvas al inicio»: ' + C.texto());
    S.ev("irA('calc')");
    await asentar(16);
    assert.equal(C.st.recargas, 0, 'recargó con la calculadora');
    S.ev("irA('historial')");
    await asentar(16);
    assert.equal(C.st.recargas, 1, 'la cuenta del enlace no se recargó nunca: el paquete viaja en el #');
    assert.deepEqual(JSON.parse(C.st.sesion[A.LLAVE_VUELTA]).lugar, { tab: 'historial' }, 'no recordó la pestaña');
  });

  test('app/socio.html, el «Ver como» de Joan: en NINGUNA pantalla «se pone sola», y nunca recarga solo', async () => {
    const S = abrirSocio();
    await asentar();
    S.ev("abrir({ nombre: 'Adriana Prueba', datos: { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: []," +
         " socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } }, origen: 'panel' })");
    const C = await controladorDeVerdad(S.ev, S.ctx);
    C.mirando();
    await C.publicar('v140');
    for (const t of ['inicio', 'historial', 'garantia', 'calc', 'chat', 'inicio']) {
      S.ev("irA('" + t + "')");
      await asentar(16);
      assert.equal(PROMESA.test(C.texto()), false, t + ': prometió «se pone sola» en un modo que nunca es seguro: ' + C.texto());
      assert.equal(C.estado().aviso.boton, 'Actualizar ahora', t + ': sin el botón no hay forma de ponerla al día');
    }
    await C.ocultar(); await C.volver();
    assert.equal(C.st.recargas, 0, 'el «Ver como» se recargó solo: el pase no sirve para recargar');
  });

  test('platachat/ con la calculadora MOVIDA: en ninguna pantalla «se pone sola», y no recarga (la cifra vive en memoria)', async () => {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    assert.equal(P.ev('PANTALLA'), 'plata');
    P.ev('setMonto(MONTO + 50000)');
    const C = await controladorDeVerdad(P.ev, P.ctx);
    C.mirando();
    await C.publicar('v140');
    for (const t of ['plata', 'yo', 'chats', 'plata']) {
      P.ev("irA('" + t + "')");
      await asentar(16);
      assert.equal(PROMESA.test(C.texto()), false, t + ': prometió «se pone sola» con la calculadora movida: ' + C.texto());
      assert.equal(C.estado().aviso.boton, 'Actualizar ahora', t);
    }
    assert.equal(C.st.recargas, 0, 'recargó y se llevó la cifra que la persona movió');
    await C.ocultar();
    assert.equal(C.st.recargas, 0, 'recargó al salir de la app con la calculadora movida');
    /* Y si la vuelve a dejar como se abrió, el modo deja de serlo. */
    await C.volver();
    P.ev('setMonto(MONTO - 50000)');
    assert.equal(P.ev('nuncaSeguroPC()'), false);
    C.mirando();
    await C.ocultar();
    assert.equal(C.st.recargas, 1);
  });
});
