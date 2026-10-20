'use strict';
/* ==========================================================================
 * LA PERSONA DE BUENA FE NO PIERDE SU CÉDULA — 20 de octubre de 2026
 *
 *   node --test pruebas/la-persona-de-buena-fe.test.js
 *
 * El rediseño de la mañana («lo sensible no sale del registro», 5724dd5)
 * cerró los caminos por los que la cédula de una persona terminaba en la
 * cuenta de otra. La verificación que vino después confirmó que el ATACANTE ya
 * no cruza cédulas, pero encontró ocho casos (A1 a A8) en los que la persona
 * DE BUENA FE perdía sus propias fotos, o leía en la pantalla algo que no era
 * verdad. Esta prueba cuenta cada uno como pasa, y corre play/index.html DE
 * VERDAD (pruebas/banco-play.js) con las cédulas fabricadas
 * (pruebas/fabrica-pdf417.js). Cada prueba con su A en el título falla con la
 * página de 5724dd5. La parte de la base (A1, A2: la reja y la corrección del
 * documento) está en pruebas/la-cedula-de-la-cuenta-postgres.test.js.
 * 20-oct-2026, cierre (B1) — la corrección del documento después de la primera
 * fila ya no entra en la base (abría que cualquiera sin sesión cambiara la
 * identidad de una solicitud): es una molestia aceptada, y lo que se cuida
 * aquí es que el teléfono no le afirme a la titular que la cédula no es suya
 * (las dos pruebas de A1 de abajo, que valen igual para ese caso).
 *
 * Y lo que la mañana cerró sigue cerrado: las pruebas de
 * lo-sensible-no-sale-del-registro.test.js (V1-V7) y de la persona-no-el-intento
 * (F4-F15) corren igual, y aquí se agrega la que cuida que la ausencia nueva
 * no le ahorre la pregunta «¿Es tuyo?» a quien no es.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');
const F = require('./fabrica-pdf417.js');
const U = require('../app/cuenta.js');
const EC = require('../app/escaner-cedula.js');

const SESION_JS = fs.readFileSync(path.join(__dirname, '..', 'platachat', 'sesion.js'), 'utf8');
const PLATACHAT = '../platachat/index.html';

function cedula(d) {
  const b = F.registroCedula(d);
  let t = '';
  for (const x of b) t += String.fromCharCode(x);
  return EC.cedulaDelTexto(U.leerCedulaPDF417, t);
}
const MARIA = cedula({ documento: '0052123456', apellido1: 'RODRIGUEZ', apellido2: 'PEREZ',
  nombre1: 'MARIA', nombre2: 'JOSE', sexo: 'F', nacimiento: '19880312', rh: 'A+' });
const CEL_MARIA = '3001112233';
const CEL_PEDRO = '3109998877';

/* La página con una cámara en vivo que pide permiso y nunca contesta, un GPS
   que cuenta, y un reloj que guarda los temporizadores para correrlos a mano
   (lo mismo que lo-sensible-no-sale-del-registro.test.js). */
function abrir(opc) {
  const o = Object.assign({ hash: '#registro' }, opc || {});
  const P = abrirPlay(o);
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  if (!o.sinCamara) {
    P.ev('window.__camaras = []; navigator.mediaDevices = { getUserMedia: function (c) { window.__camaras.push(c); return new Promise(function () {}); } };');
  }
  P.ev('window.__gps = 0; navigator.geolocation = { getCurrentPosition: function () { window.__gps++; } };');
  P.ev('window.__relojes = []; setTimeout = function (f, ms) { window.__relojes.push({ f: f, ms: ms }); return window.__relojes.length; }; clearTimeout = function () {};');
  return P;
}
function pasa(P, ms) {
  P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === ' + ms + '; });' +
       ' if (i < 0) throw new Error("no hay temporizador de ' + ms + ' ms"); var r = window.__relojes.splice(i, 1)[0]; r.f(); })()');
}
const pasoActual = P => P.ev('PASOS[PASO].id');
const cuerpo = P => P.elems.cuerpo.innerHTML;
const caja = P => P.elems.errReg ? P.elems.errReg.innerHTML : '';
const avisoFotos = P => P.elems.avisoFotos ? P.elems.avisoFotos.innerHTML : '';
const fueAPlataChat = P => P.ev('location.href') === PLATACHAT;

function camara(P, quien) {
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO') + '_" + quien + "'; };" +
       "$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
}
function escanear(P, ced, quien) {
  P.ev('autorizarYEscanear()');
  camara(P, quien);
  P.ev("ESCDOC.lado = 'reverso'; leidaDoc(" + JSON.stringify(ced) + ', 0)');
  pasa(P, 1500);                       // «¡Leída! Ahora el frente.»
  camara(P, quien);
  P.ev('capturarDoc(true)');
  pasa(P, 1500);                       // «Listo: las dos caras.» → «Revisa tus datos»
}
function conCajas(P) {
  P.ev("comprimirVarias = function (f, t) { return Promise.resolve(t.map(function (x) {" +
       " return x[1] == null ? { width: 1, height: 1 } : 'data:image/jpeg;base64,' + f.name; })); };" +
       "window.cargarScript = function () { return Promise.reject(new Error('sin lector')); };");
}
async function fotoEnCaja(P, key, nombre) {
  await P.ev("tomarFoto({ target: { files: [{ name: '" + nombre + "' }] } }, '" + key + "')");
  await asentar();
}
function casillas(P, grupo, cambios) {
  P.ev("U.camposDelGrupo('" + grupo + "').forEach(function (c) { if (c.id === 'celular') return;" +
       " $('f_' + c.id).value = REGISTRO[c.id] === undefined ? '' : String(REGISTRO[c.id]); });");
  Object.keys(cambios || {}).forEach(k => P.ev("$('f_" + k + "').value = " + JSON.stringify(cambios[k]) + ';'));
}
function celularYClave(P, cel) {
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));" +
       "$('rClave').value = 'Perro.2026x'; $('rClave2').value = 'Perro.2026x'; siguientePaso();");
}
function elResto(P) {
  P.ev("Object.assign(REGISTRO, { correo: 'x@correo.com', ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo'," +
       " anos_direccion: 'Más de 5 años', ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000'," +
       " dia_pago: 'Quincenal (15 y 30)', ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344'," +
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566' }); guardarBorrador(REGISTRO);");
}
/* La nube de mentira: anota cada llamada. `subida` decide qué contesta la base
   a las fotos (por defecto entran todas; 'sin_red' es la petición que no sale;
   'colgada' la que nunca vuelve). `existe`: el signup dice «ya existe», y el
   login solo abre con 'LaDeMiCuenta.1'. */
function nube(P, subida, opc) {
  const o = opc || {};
  P.ev('window.__subida = ' + JSON.stringify(subida || null) + '; window.__existe = ' + (o.existe ? 'true' : 'false') + ';' +
    `window.__llamadas = [];
    fetch = function (u, op) {
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      var bien = function (r) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };
      var mal = function (s, r) { return Promise.resolve({ ok: false, status: s, json: function () { return Promise.resolve(r); } }); };
      if (/registro_archivos_guardar/.test(String(u))) {
        if (window.__subida === 'sin_red') return Promise.reject(new Error('sin señal'));
        if (window.__subida === 'colgada') return new Promise(function () {});
        return bien(window.__subida || { ok: true, guardados: Object.keys((c && c.p_archivos) || {}) });
      }
      if (/auth\\/v1\\/signup/.test(String(u))) {
        return window.__existe ? mal(422, { msg: 'User already registered' })
          : bien({ access_token: 'tok-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } });
      }
      if (/grant_type=password/.test(String(u))) {
        if (window.__existe && c.password !== 'LaDeMiCuenta.1') return mal(400, { error: 'invalid_grant' });
        return bien({ access_token: 'tok-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } });
      }
      return bien({ ok: true });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
const subidas = ll => ll().filter(x => /registro_archivos_guardar/.test(x.url));
function abrirLaCuenta(P) {
  elResto(P);
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  P.ev('siguientePaso()');
}
/* platachat/sesion.js dentro de la página, como lo dejaría cargarScript. */
function conSesionJs(P) {
  P.ev(SESION_JS);
  P.ev("SCRIPTS['../platachat/sesion.js'] = Promise.resolve();");
}
function boton(html, texto) {
  const re = new RegExp('onclick="([^"]+)"[^>]*>' + texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<');
  const m = re.exec(html);
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}
const nadaDe = (texto, quien) => assert.equal(/_MARIA|MARIA|52\.?123\.?456|RODRIGUEZ/.test(texto), false, quien);

/* María, de buena fe, hasta «Tu celular y tu contraseña» con su cédula leída. */
function mariaHastaElCelular(opc) {
  const P = abrir(opc);
  if (opc && opc.search) conSesionJs(P);
  escanear(P, MARIA, 'MARIA');
  casillas(P, 'identidad', { expedicion: '2010-05-20' });
  P.ev('siguientePaso()');
  celularYClave(P, CEL_MARIA);
  return P;
}
/* Todo lo de este registro pasó a la hora `t`: el último toque, el paso y la
   hora de las fotos. */
function todoALaHora(P, t) {
  P.almacen.play_registro_toque = String(t);
  P.almacen.play_registro_paso = JSON.stringify(Object.assign(JSON.parse(P.almacen.play_registro_paso), { t }));
  const f = JSON.parse(P.almacen.play_fotos_borrador); f.de.t = t; P.almacen.play_fotos_borrador = JSON.stringify(f);
}

describe('A1, A2. lo que la base no pudo confirmar no se le afirma a la titular', () => {

  test('A1 — LA BASE CONTESTA «otro_documento» A LA CÉDULA DE MARÍA (una fila que otro escribió sin sesión, o la vieja del documento mal tecleado): no le dice que «no es la del documento de su cuenta»; le dice que no se pudo confirmar y le ofrece el chat', async () => {
    const P = mariaHastaElCelular();
    const ll = nube(P, { ok: false, motivo: 'otro_documento' });
    abrirLaCuenta(P);
    await asentar();
    assert.equal(subidas(ll).length, 1, 'la subida ni se intentó');
    assert.equal(subidas(ll)[0].cuerpo.p_huella.cedula_leida.documento, '52123456', 'subió otra lectura que la suya');
    const a = avisoFotos(P);
    assert.equal(/no son las del documento de tu cuenta|no es la del documento/.test(a), false,
      'le afirma a la titular que su propia cédula no es la de su cuenta: ' + a);
    assert.match(a, /No pudimos confirmar de quién es la cédula/);
    assert.match(a, /chat de Servicio/, 'no le dice cómo mandarnos su cédula');
    /* Y su cuenta, cuando vuelve a entrar, dice lo mismo. */
    const M = abrir({ almacen: P.almacen, sesion: {}, hash: '' });
    nube(M);
    M.ev("pintarCuenta({ access_token: 'tok-m', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    assert.match(avisoFotos(M), /No pudimos confirmar de quién es la cédula/);
  });

  test('A1 — …y lo mismo con «en_duda» (los registros de su celular dicen documentos distintos): no se queda reintentando para siempre', async () => {
    const P = mariaHastaElCelular();
    const ll = nube(P, { ok: false, motivo: 'en_duda' });
    abrirLaCuenta(P);
    await asentar();
    assert.equal(subidas(ll).length, 1);
    assert.match(avisoFotos(P), /No pudimos confirmar de quién es la cédula/);
    assert.equal(/RESPALDO_MARIA/.test(JSON.stringify(P.almacen)), false, 'la cédula se quedó en el teléfono');
  });
});

describe('A3, A4. PlataChat: la cédula sube antes de irse, o se dice que no', () => {

  test('A3 — PLATACHAT, YA TENÍA CUENTA Y PUSO OTRA CONTRASEÑA: la escribe ahí mismo y su cédula sube antes de irse; la salida a PlataChat dice que las fotos se borran', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    const ll = nube(P, null, { existe: true });
    abrirLaCuenta(P);
    await asentar();
    assert.match(P.ev("$('errReg').textContent"), /esa contraseña no es la suya/);
    assert.match(caja(P), /id="rClaveCuenta"/, 'en PlataChat no le deja escribir la contraseña de su cuenta sin salir del registro');
    assert.match(caja(P), /se borran de este teléfono/, 'la salida a PlataChat no dice que le cuesta las fotos');
    assert.equal(subidas(ll).length, 0);
    P.ev("$('rClaveCuenta').value = 'LaDeMiCuenta.1';");
    P.ev(boton(caja(P), 'Entrar y terminar mi registro'));
    await asentar();
    const s = subidas(ll)[0];
    assert.ok(s, 'su cédula no subió a la cuenta que ya tenía');
    assert.equal(s.cuerpo.p_huella.cedula_leida.documento, '52123456');
    assert.equal(s.cuerpo.p_archivos.cedula_reverso, 'data:image/jpeg;base64,RESPALDO_MARIA');
    assert.ok(fueAPlataChat(P), 'no terminó en PlataChat');
  });

  test('A3 — PLATACHAT, LA BASE NO CONFIRMÓ LA CÉDULA: no ofrece «Volver a intentar subirlas», y volver a intentar no termina en «Listo» sin subir nada', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    const ll = nube(P, { ok: false, motivo: 'otro_documento' });
    abrirLaCuenta(P);
    await asentar();
    assert.equal(subidas(ll).length, 1);
    assert.equal(fueAPlataChat(P), false, 'se fue a PlataChat sin decir que la cédula no subió');
    const s = P.elems.pcSubida.textContent, a = P.elems.pcAcciones.innerHTML;
    assert.equal(/Volver a intentar subirlas/.test(a), false, 'ofrece reintentar lo que ya se borró: ' + a);
    assert.match(s, /no las subimos y las borramos de este teléfono/);
    assert.match(s, /chat de Servicio/);
    assert.ok(boton(a, 'Entrar a PlataChat'), 'no tiene cómo seguir a PlataChat');
    /* Si algo vuelve a llamar el final (el botón de la versión de la mañana),
       no hay cola: no puede decir «Listo» ni irse callado. */
    P.ev('terminarEnPlataChat()');
    await asentar();
    assert.equal(subidas(ll).length, 1);
    assert.equal(/Listo/.test(P.elems.pcSubida.textContent), false, '«Listo» sin haber subido nada: ' + P.elems.pcSubida.textContent);
    assert.equal(fueAPlataChat(P), false);
  });

  test('A3 — …y «Entrar a PlataChat sin ellas» (las fotos no alcanzaron a subir) las borra, y lo dice antes', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    const a = P.elems.pcAcciones.innerHTML;
    assert.match(a, /Volver a intentar subirlas/, 'sin señal sí se puede reintentar');
    assert.match(a, /las borramos de este teléfono/, 'no dice que irse sin ellas las borra');
    P.ev(boton(a, 'Entrar a PlataChat sin ellas'));
    await asentar();
    assert.ok(fueAPlataChat(P));
    assert.equal(/RESPALDO_MARIA/.test(JSON.stringify(P.almacen)), false, 'dijo que las borraba y se quedaron en el teléfono');
  });

  test('A4 — PLATACHAT, LA PESTAÑA SE RELANZA CON LAS FOTOS SUBIENDO (sin la sesión, que Android no devuelve): no se va derecho a PlataChat; pide la contraseña y las sube', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    nube(P, 'colgada');                                   // la cuenta se abre; la subida se queda pegada
    abrirLaCuenta(P);
    await asentar();
    assert.ok(JSON.parse(P.almacen.play_fotos_cola || '{}')[CEL_MARIA], 'la cola de su cuenta no quedó guardada');
    /* Android mata la pestaña y la relanza: el sessionStorage vuelve vacío. */
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, search: '?marca=platachat', hash: '' });
    assert.deepEqual(Q.fallos, []);
    assert.equal(fueAPlataChat(Q), false, 'se fue a PlataChat con la cédula sin subir y sin decir nada');
    assert.match(cuerpo(Q), /Tus fotos todavía no han subido/);
    nadaDe(cuerpo(Q), 'la pantalla de la relanzada enseña algo de la cédula');
    const ll = nube(Q);
    conSesionJs(Q);
    Q.ev("$('pcClave').value = 'Perro.2026x';");
    Q.ev(boton(cuerpo(Q), 'Subir mis fotos'));
    await asentar();
    const s = subidas(ll)[0];
    assert.ok(s, 'no subió la cola de su cuenta');
    assert.equal(s.cuerpo.p_archivos.cedula_reverso, 'data:image/jpeg;base64,RESPALDO_MARIA');
    assert.ok(fueAPlataChat(Q), 'subió y no la llevó a PlataChat');
  });

  test('A4 — …y si la relanzada sí trae la sesión (una recarga), sube con ella antes de irse', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    nube(P, 'colgada');
    abrirLaCuenta(P);
    await asentar();
    assert.ok(P.sesion.play_sesion, 'la sesión no quedó guardada');
    /* El arranque corre con la red del banco (que no contesta): lo dice y espera. */
    const Q = abrirPlay({ almacen: P.almacen, sesion: P.sesion, search: '?marca=platachat', hash: '' });
    await asentar();
    assert.equal(fueAPlataChat(Q), false, 'se fue a PlataChat sin intentar subir la cola');
    assert.ok(Q.elems.pcSubida, 'no intentó subir la cola: iba derecho a PlataChat');
    assert.match(Q.elems.pcSubida.textContent, /no alcanzaron a subir/);
    const ll = nube(Q);
    conSesionJs(Q);
    Q.ev(boton(Q.elems.pcAcciones.innerHTML, 'Volver a intentar subirlas'));
    await asentar();
    assert.equal(subidas(ll).length, 1);
    assert.ok(fueAPlataChat(Q));
  });
});

describe('A5, A7. la vuelta de la cámara mide la ausencia', () => {

  test('A5 — DOCE MINUTOS QUIETA EN «TU ROSTRO» (una llamada), toca la caja de la selfie, la cámara del sistema tumba la pestaña y vuelve al minuto: su cédula sigue', () => {
    const P = mariaHastaElCelular();
    assert.equal(pasoActual(P), 'rostro');
    todoALaHora(P, Date.now() - 13 * 60e3);           // lo último que tecleó fue hace trece minutos
    /* Toca la caja de la selfie: lo que se haga al tocarla, antes de que se
       abra la cámara del sistema. */
    const input = /<input type="file"[^>]*capture="user"[^>]*>/.exec(cuerpo(P));
    assert.ok(input, 'no está la caja de la selfie');
    const alTocar = /onclick="([^"]+)"/.exec(input[0]);
    assert.ok(alTocar, 'la caja de la selfie no anota nada al abrir la cámara del sistema');
    P.ev(alTocar[1]);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.equal(Q.ev('PASOS[PASO].id'), 'rostro');
    assert.equal(Q.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA', 'estuvo fuera un minuto y le borró la cédula');
    assert.equal(/Pasó un rato/.test(Q.elems.errReg.innerHTML), false, 'le dice «Pasó un rato» a quien volvió de la cámara');
    assert.match(Q.elems.errReg.innerHTML, /La página se volvió a abrir/);
  });

  test('A5 — …y lo mismo si la página solo deja de verse (otra app, la llamada, la cámara) y vuelve relanzada al minuto', () => {
    const P = mariaHastaElCelular();
    todoALaHora(P, Date.now() - 13 * 60e3);
    P.ev("document.visibilityState = 'hidden'; document.hidden = true;" +
         " (document._oyentes.visibilitychange || []).forEach(function (f) { f({ type: 'visibilitychange' }); });");
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.equal(Q.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA', 'el rato contó la quietud y no la ausencia');
  });

  test('A5 — CUANDO SÍ PASÓ EL RATO, la fecha de expedición que tecleó se queda, como dice el aviso («Lo que escribiste a mano sigue aquí»)', () => {
    const P = mariaHastaElCelular();
    todoALaHora(P, Date.now() - 30 * 60e3);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.match(cuerpo(Q), /¿Es tuyo\?/);
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    assert.match(Q.elems.errReg.innerHTML, /Lo que escribiste a mano sigue aquí/);
    assert.equal(Q.ev('REGISTRO.expedicion'), '2010-05-20', 'el aviso dice que lo escrito a mano sigue aquí, y la expedición se borró');
    nadaDe(cuerpo(Q), 'volvió algo de la cédula que se soltó');
    assert.equal(Q.ev('FOTOS.cedula_frente'), undefined);
  });

  test('…pero la ausencia no le ahorra la pregunta a quien no es: en «¿Es tuyo?» irse de la página no cuenta como haber estado', () => {
    const P = mariaHastaElCelular();
    todoALaHora(P, Date.now() - 30 * 60e3);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.match(cuerpo(Q), /¿Es tuyo\?/);
    /* Quien la tiene en la mano no contesta: se va a otra app, y la pestaña
       vuelve relanzada enseguida. */
    Q.ev("document.visibilityState = 'hidden'; document.hidden = true;" +
         " (document._oyentes.visibilitychange || []).forEach(function (f) { f({}); });" +
         " (window._oyentes.pagehide || []).forEach(function (f) { f({}); });");
    const R = abrirPlay({ almacen: Q.almacen, sesion: {}, hash: '' });
    assert.match(cuerpo(R), /¿Es tuyo\?/, 'se saltó la pregunta y pintó el registro de otra persona');
  });

  test('A7 — PASAR LA MEDIANOCHE EN LA VUELTA DE LA CÁMARA no borra la cédula: el cambio de día pregunta «¿Es tuyo?», y «Seguir» la trae', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    const T0 = new Date(2026, 9, 20, 23, 59, 0).getTime();
    const T1 = new Date(2026, 9, 21, 0, 1, 0).getTime();
    todoALaHora(P, T0);                                 // la foto, a las 23:59
    class Reloj extends Date {
      constructor(...a) { if (a.length) super(...a); else super(T1); }
      static now() { return T1; }
    }
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '', Date: Reloj });   // la relanzada, a las 00:01
    assert.deepEqual(Q.fallos, []);
    assert.match(cuerpo(Q), /¿Es tuyo\?/, 'el cambio de día ya no pregunta');
    assert.ok(/FRENTE_MARIA/.test(Q.almacen.play_fotos_borrador || ''), 'el cambio de día le borró la cédula a quien estuvo fuera dos minutos');
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    assert.equal(Q.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA');
    assert.equal(/Pasó un rato/.test(Q.elems.errReg ? Q.elems.errReg.innerHTML : ''), false);
  });
});

describe('A6. las fotos pendientes de la versión publicada', () => {

  /* Lo que deja la versión del 15-oct cuando la subida falla: las fotos en la
     llave del registro, con su celular y sin intento, el borrador ya borrado
     (lo borra al crear la cuenta), y —si entró a su cuenta con esa versión—
     SIN la marca de la cuenta recién creada (su pintarCuenta la borra). */
  const lote = () => JSON.stringify({ sensibles: true, cedula_reverso: 'data:image/jpeg;base64,RESPALDO_MARIA',
    cedula_leida: { documento: '52123456' }, de: { celular: CEL_MARIA, t: Date.now() - 60e3 } });
  const notaVieja = () => JSON.stringify({ estado: 'sin_red', pedidas: ['cedula_reverso'], guardadas: [], t: Date.now() - 30e3, celular: CEL_MARIA });
  const entra = async (M, cel) => {
    const ll = nube(M);
    M.ev("pintarCuenta({ access_token: 'tok', user: { email: '57" + cel + "@tugarantia.net' } })");
    await asentar();
    return ll;
  };

  test('A6 — YA ENTRÓ A SU CUENTA CON LA VERSIÓN PUBLICADA (la marca se borró): sin borrador en el teléfono, las fotos son de su cuenta y suben', async () => {
    const M = abrir({ hash: '', sesion: {}, almacen: { play_fotos_borrador: lote(), play_subida_fotos: notaVieja() } });
    const ll = await entra(M, CEL_MARIA);
    const s = subidas(ll)[0];
    assert.ok(s, 'las fotos pendientes de la versión publicada se borraron calladas al actualizar');
    assert.equal(s.cuerpo.p_archivos.cedula_reverso, 'data:image/jpeg;base64,RESPALDO_MARIA');
  });

  test('A6 — …y si no se pueden adoptar (en el teléfono hay otro registro), no se borran calladas: la cuenta de ese celular lo dice, sin subir nada', async () => {
    const M = abrir({ hash: '', sesion: {}, almacen: { play_fotos_borrador: lote(), play_subida_fotos: notaVieja(),
      play_registro_borrador: JSON.stringify({ celular: CEL_PEDRO, nombres: 'PEDRO LUIS' }) } });
    assert.equal(/RESPALDO_MARIA/.test(JSON.stringify(M.almacen)), false, 'las fotos que no se adoptan se quedan en el teléfono');
    const ll = await entra(M, CEL_MARIA);
    assert.equal(subidas(ll).length, 0, 'subió fotos que no se pudieron atar a su cuenta');
    assert.match(avisoFotos(M), /antes de una actualización/, 'la cuenta no dice que se borraron');
    assert.match(avisoFotos(M), /chat de Servicio/);
    /* Y la cuenta de otro no se entera de nada. */
    const O = abrir({ almacen: M.almacen, sesion: {}, hash: '' });
    await entra(O, CEL_PEDRO);
    assert.equal(/fotos/.test(avisoFotos(O)), false, 'la cuenta de Pedro habla de las fotos de otro celular');
  });
});

describe('A8. lo que la base dejó, se dice', () => {

  test('A8 — RE-INSCRIPCIÓN SIN CÓDIGO: la base deja las fotos que ya tenía leídas con su código, y la pantalla no dice «Listo: tus fotos llegaron»', async () => {
    const P = abrir({ sinCamara: true });
    P.ev('autorizarYEscanear()');
    conCajas(P);
    await fotoEnCaja(P, 'cedula_reverso', 'RESPALDO_MARIA');
    await fotoEnCaja(P, 'cedula_frente', 'FRENTE_MARIA');
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
                               documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    P.ev(boton(caja(P), 'Sí, es mía'));
    celularYClave(P, CEL_MARIA);
    const ll = nube(P, { ok: true, guardados: [], descartados: ['cedula_frente', 'cedula_reverso'] });
    abrirLaCuenta(P);
    await asentar();
    assert.equal(subidas(ll).length, 1);
    const a = avisoFotos(P);
    assert.equal(/tus fotos llegaron/.test(a), false, 'dice que llegaron unas fotos que la base no guardó: ' + a);
    assert.match(a, /Ya teníamos fotos de tu cédula leídas con su código: dejamos esas/);
  });
});
