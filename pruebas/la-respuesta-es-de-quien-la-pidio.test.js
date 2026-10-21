'use strict';
/* ==========================================================================
 * UNA RESPUESTA DE LA RED SOLO VALE PARA QUIEN LA PIDIÓ — 21-oct-2026
 *
 *   node --test pruebas/la-respuesta-es-de-quien-la-pidio.test.js
 *
 * La verificación de f915cd9 confirmó cuatro hallazgos, y aquí va una prueba
 * (al menos) por cada uno. Todas FALLAN con la página de f915cd9 y pasan con
 * la de hoy, salvo las que dicen «control» en el título: esas cuidan que el
 * arreglo no se pase de la raya (pasan con las dos):
 *   · G1 (seguridad, Ley 1581): una respuesta que llega tarde se adoptaba en
 *     una pestaña que ya era de otra persona. El signup colgado de María le
 *     abría a Pedro la sesión de ella (también en PlataChat, y también si
 *     Pedro ya estaba dentro de SU cuenta); la bandeja colgada hacía salir el
 *     signup con el celular y la contraseña de Pedro y la autorización que
 *     tocó María; «Entrar» de la portada, la ubicación y la lectura del código
 *     de una foto fija caían igual en el registro de otro.
 *   · G2 (datos que se pierden): la contraseña en curso no iba atada al
 *     registro; tras «Salir» de una cuenta, el PRIMER celular del registro
 *     siguiente se tomaba por un cambio de celular y se le borraba todo.
 *   · G3 (datos que se pierden): después de «Salir», la memoria quedaba vacía
 *     y el borrador seguía en el teléfono: «Abrir mi cuenta» no preguntaba
 *     «¿Es tuyo?» y la primera tecla lo pisaba.
 *   · G4 (honestidad): que el registro vuelve a empezar con otro celular se
 *     decía solo DESPUÉS de borrarlo.
 *
 * Las carreras se escriben con una nube de mentira que RETIENE la respuesta
 * que se le pida (window.__colgar) y la suelta a mano, como los guiones del
 * ataque: así «el signup tarda un minuto» es una línea, no un reloj de verdad.
 * El tope de 30 s es un setTimeout que la prueba dispara (tope()); con la
 * página de f915cd9 no existe, y tope() devuelve false sin hacer nada: la
 * prueba sigue y falla por lo que de verdad importa.
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

function cedula(d) {
  const b = F.registroCedula(d);
  let t = '';
  for (const x of b) t += String.fromCharCode(x);
  return EC.cedulaDelTexto(U.leerCedulaPDF417, t);
}
const MARIA = cedula({ documento: '0052123456', apellido1: 'RODRIGUEZ', apellido2: 'PEREZ',
  nombre1: 'MARIA', nombre2: 'JOSE', sexo: 'F', nacimiento: '19880312', rh: 'A+' });
const CEL_MARIA = '3001112233', CEL_PEDRO = '3109998877';
const CLAVE_MARIA = 'Maria.Secreta9', CLAVE_PEDRO = 'Pedro.Propia7';
const CORREO_MARIA = '573001112233@tugarantia.net', CORREO_PEDRO = '573109998877@tugarantia.net';
const DATOS_MARIA = { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
  documento: '52123456', expedicion: '2010-05-20' };
const CONTACTO_MARIA = { correo: 'maria.rodriguez@correo.com', celular2: '3205556677' };
const PEDRO = { nombres: 'PEDRO LUIS', apellidos: 'GOMEZ RUIZ', tipo_doc: 'Cédula de ciudadanía',
  documento: '79111222', expedicion: '2005-01-10' };
const RESTO = { ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo', anos_direccion: 'Más de 5 años',
  ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000', dia_pago: 'Quincenal (15 y 30)',
  ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344',
  ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566' };
const TOKEN_MARIA = { access_token: 'tok-MARIA', refresh_token: 'r', expires_in: 3600, user: { email: CORREO_MARIA } };
const deMaria = /MARIA|RODRIGUEZ|52\.?123\.?456|maria\.rodriguez|3205556677|3001112233|Maria\.Secreta9|4\.711111|tok-MARIA/;

/* El banco, con la cámara que nunca contesta, el GPS que contesta o se cuelga
   a pedido, y los relojes anotados para dispararlos a mano. */
function abrir(opc) {
  const o = Object.assign({ hash: '#registro' }, opc || {});
  const P = abrirPlay(o);
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
  P.ev('window.__gpsPend = []; navigator.geolocation = { getCurrentPosition: function (ok) {' +
       ' if (window.__gpsColgar) { window.__gpsPend.push(ok); return; } if (window.__gpsDe) ok({ coords: window.__gpsDe }); } };');
  P.ev('window.__relojes = []; setTimeout = function (f, ms) { window.__relojes.push({ f: f, ms: ms }); return window.__relojes.length; }; clearTimeout = function () {};');
  if (o.search) { P.ev(SESION_JS); P.ev("SCRIPTS['../platachat/sesion.js'] = Promise.resolve();"); }
  return P;
}
function pasa(P, ms) {
  P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === ' + ms + '; });' +
       ' if (i < 0) throw new Error("no hay temporizador de ' + ms + ' ms"); var r = window.__relojes.splice(i, 1)[0]; r.f(); })()');
}
/* Pasan los 30 s del tope. Con la página de f915cd9 no hay tope: no hace nada. */
function tope(P) {
  return P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === 30000; });' +
              ' if (i < 0) return false; var r = window.__relojes.splice(i, 1)[0]; r.f(); return true; })()');
}
/* La nube de mentira. Anota cada llamada CON su cabecera de autorización (así
   se ve qué token se cierra en /auth/v1/logout), y retiene las que casen con
   window.__colgar hasta que la prueba las suelte. */
function nube(P) {
  P.ev(`window.__llamadas = []; window.__colgadas = [];
    fetch = function (u, op) {
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      var h = (op && op.headers) || {};
      window.__llamadas.push({ url: String(u), cuerpo: c, auth: String(h.Authorization || '') });
      var resp = function (r, ok) { return { ok: ok !== false, status: ok === false ? 400 : 200, json: function () { return Promise.resolve(r); } }; };
      if (window.__colgar && window.__colgar.test(String(u))) {
        return new Promise(function (res, rej) {
          window.__colgadas.push({ url: String(u), c: c, soltar: function (r, ok) { res(resp(r, ok)); }, cortar: function () { rej(new Error('corte')); } });
        });
      }
      if (window.__yaExiste && /auth\\/v1\\/signup/.test(String(u))) return Promise.resolve(resp({ msg: 'User already registered' }, false));
      if (/registro_archivos_guardar/.test(String(u))) return Promise.resolve(resp({ ok: true, guardados: Object.keys((c && c.p_archivos) || {}) }));
      if (/auth\\/v1\\/(signup|token)/.test(String(u))) return Promise.resolve(resp({ access_token: 'tok-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } }));
      if (/registro_vivo_publicar/.test(String(u))) return Promise.resolve(resp({ ok: true, testigo: 'tst-' + (c && c.p_celular) }));
      if (/rpc\\/mi_cuenta/.test(String(u))) return Promise.resolve(resp({ ok: true, vinculada: false }));
      return Promise.resolve(resp({ ok: true }));
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
const colgadas = P => JSON.parse(P.ev('JSON.stringify(window.__colgadas.map(function (x) { return x.url; }))'));
function soltar(P, i, r, ok) { P.ev('window.__colgadas[' + i + '].soltar(' + JSON.stringify(r) + ', ' + (ok === false ? 'false' : 'true') + ')'); }
const pasoActual = P => P.ev('VISTA === "registro" ? PASOS[PASO].id : VISTA');
const cuerpo = P => P.elems.cuerpo.innerHTML;
const caja = P => P.elems.errReg ? ((P.elems.errReg.innerHTML || '') + ' ' + (P.elems.errReg.textContent || '')) : '';
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
function cajaEnBlanco(P) { if (P.elems.errReg) { P.elems.errReg.innerHTML = ''; P.elems.errReg.textContent = ''; } }
function boton(html, txt) {
  const re = new RegExp('onclick="([^"]+)"[^>]*>' + txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<');
  const m = re.exec(html);
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}
function tocar(P, txt) {
  const b = boton(cuerpo(P), txt);
  assert.ok(b, 'en «' + pasoActual(P) + '» no está el botón «' + txt + '»');
  P.ev(b);
}
const volver = P => tocar(P, 'Volver');
function hastaElPaso(P, id) {
  for (let i = 0; i < 12 && pasoActual(P) !== id; i++) volver(P);
  assert.equal(pasoActual(P), id, 'no se pudo volver hasta «' + id + '»');
}
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
  pasa(P, 1500);
  camara(P, quien);
  P.ev('capturarDoc(true)');
  pasa(P, 1500);
}
function casillas(P, grupo, cambios) {
  P.ev("U.camposDelGrupo('" + grupo + "').forEach(function (c) { if (c.id === 'celular') return;" +
       " $('f_' + c.id).value = REGISTRO[c.id] === undefined ? '' : String(REGISTRO[c.id]); });");
  Object.keys(cambios || {}).forEach(k => P.ev("$('f_" + k + "').value = " + JSON.stringify(cambios[k]) + ';'));
}
/* Escribe en las casillas como el oninput de verdad (anotarCampo). */
function teclear(P, valores) {
  Object.keys(valores).forEach(k => P.ev("(function () { var e = $('f_" + k + "'); e.value = " + JSON.stringify(valores[k]) + '; anotarCampo(e); })()'));
}
function celularEnLaCasilla(P, cel) {
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));");
}
function toque(P, cel, c1, c2) {
  celularEnLaCasilla(P, cel);
  P.ev("$('rClave').value = " + JSON.stringify(c1) + "; $('rClave2').value = " + JSON.stringify(c2 == null ? c1 : c2) + '; siguientePaso();');
}
function selfie(P, quien) {
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;" +
       "if (!window.__ceOrig) window.__ceOrig = document.createElement;" +
       "document.createElement = function (t) { if (t === 'canvas') return { width: 0, height: 0, getContext: function () { return { drawImage: function () {} }; }," +
       " toDataURL: function () { return 'data:image/jpeg;base64,CARA_" + quien + "'; } }; return window.__ceOrig(t); };" +
       'capturarRostro();');
}
/* María hasta «Tu autorización», con la cédula escaneada (y su selfie y su
   ubicación) o escrita a mano. */
function mariaHastaElPermiso(P, conCedula) {
  if (conCedula) { escanear(P, MARIA, 'MARIA'); casillas(P, 'identidad', { expedicion: DATOS_MARIA.expedicion }); }
  else { tocar(P, 'Prefiero escribir mis datos'); casillas(P, 'identidad', DATOS_MARIA); }
  P.ev('siguientePaso()');
  toque(P, CEL_MARIA, CLAVE_MARIA);
  assert.equal(pasoActual(P), 'rostro', 'María no pasó su celular: ' + texto(caja(P)));
  if (conCedula) {
    P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
    selfie(P, 'MARIA');
  }
  P.ev('siguientePaso()');
  casillas(P, 'contacto', CONTACTO_MARIA);
  ['correo', 'celular2'].forEach(k => P.ev("anotarCampo($('f_" + k + "'))"));
  P.ev('Object.assign(REGISTRO, ' + JSON.stringify(RESTO) + '); guardarBorrador(REGISTRO);');
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = " + (conCedula ? 'true' : 'false') + ';');
}
/* El «Continuar» de Pedro con su celular, y sus datos escritos a mano. */
function pedroEmpiezaDeCero(P) {
  hastaElPaso(P, 'entrada');
  cajaEnBlanco(P);
  toque(P, CEL_PEDRO, CLAVE_PEDRO);
  assert.equal(pasoActual(P), 'documento', 'el cambio de celular no llevó al primer paso: ' + texto(caja(P)));
  tocar(P, 'Prefiero escribir mis datos');
  casillas(P, 'identidad', PEDRO);
  P.ev('siguientePaso()');
}
const cerradas = (ll, token) => ll().filter(x => /auth\/v1\/logout/.test(x.url) && x.auth === 'Bearer ' + token);

describe('G1 — mientras dice «Creando tu cuenta…» no se sale, y a los 30 s se dice la verdad', () => {

  test('G1 — «Volver», «Abrir mi cuenta» y la portada no hacen nada y se ven apagados; a los 30 s se encienden con un aviso que no afirma nada', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaElPermiso(P, false);
    P.ev('window.__colgar = /auth\\/v1\\/signup/;');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    assert.deepEqual(colgadas(P).map(u => u.replace(/.*\/auth/, '/auth')), ['/auth/v1/signup']);
    assert.match(texto(caja(P)), /Creando tu cuenta/);
    assert.equal(P.ev("$('btnVolver').disabled"), true, '«Volver» sigue encendido mientras se crea la cuenta');
    assert.equal(P.ev("$('btnSeguir').disabled"), true, '«Abrir mi cuenta» sigue encendido mientras se crea la cuenta');
    /* Un toque que se cuele (o un botón repintado) tampoco sale de aquí. */
    volver(P);
    assert.equal(pasoActual(P), 'permiso', '«Volver» salió del paso con la cuenta creándose');
    P.ev('pintarEntrar()');
    assert.equal(pasoActual(P), 'permiso', 'la portada se pintó encima de «Creando tu cuenta…»');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    assert.equal(ll().filter(x => /registrar_abierto/.test(x.url)).length, 1, 'un segundo toque mandó otra vez el registro');

    /* Pasan los 30 s. */
    assert.equal(tope(P), true, 'no hay tope: «Creando tu cuenta…» puede quedarse para siempre');
    assert.equal(P.ev("$('btnVolver').disabled"), false, 'el tope no volvió a encender «Volver»');
    assert.equal(P.ev("$('btnSeguir').disabled"), false);
    const dice = texto(caja(P));
    assert.match(dice, /tardó demasiado/);
    assert.match(dice, /no sabemos si tu cuenta alcanzó a crearse/, 'el aviso afirma algo que no se sabe');
    assert.equal(/quedó creada|Listo/.test(dice), false, 'el aviso del tope dice que la cuenta se creó');

    /* 21-oct-2026 — H1: el tope DESBLOQUEA, NO ABORTA. Decía «la respuesta
       que llega después del tope se descarta»: con señal floja pero estable la
       cuenta se creaba en el servidor y la persona no entraba nunca. Ahora,
       si nadie hizo otra cosa en la pestaña, la respuesta tardía se adopta:
       es la cuenta que esta misma persona pidió. Lo que la descarta es otra
       generación u otro viaje (las pruebas de abajo y
       pruebas/la-red-lenta-no-deja-afuera.test.js). */
    soltar(P, 0, TOKEN_MARIA);
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'listo', 'la respuesta que llegó después del tope, sin que nadie hiciera nada, no abrió la cuenta');
    assert.equal(P.ev('SESION && SESION.access_token'), 'tok-MARIA');
    assert.equal(cerradas(ll, 'tok-MARIA').length, 0, 'se cerró la sesión de la cuenta que la persona acababa de crear');
  });

  test('H1 — después del tope, volver a tocar «Abrir mi cuenta» deja atrás el primer viaje: entra con la contraseña, y la respuesta vieja se cierra sola (scope=local)', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaElPermiso(P, false);
    P.ev('window.__colgar = /auth\\/v1\\/signup/;');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    assert.equal(tope(P), true);
    P.ev('window.__colgar = null;');
    tocar(P, 'Abrir mi cuenta');
    await asentar(20);
    /* El signup ya había salido: el reintento entra primero con la contraseña. */
    const despues = ll().slice(ll().findIndex(x => /auth\/v1\/signup/.test(x.url)) + 1);
    assert.equal(/auth\/v1\/token/.test((despues[0] || {}).url || ''), true,
      'el reintento no probó primero entrar con la contraseña: ' + despues.map(x => x.url).join(', '));
    assert.equal(P.ev('VISTA'), 'listo', 'después del tope, «Abrir mi cuenta» ya no abre la cuenta');
    const nueva = P.ev('SESION.access_token');
    /* Llega la respuesta del primero: ya hubo otro viaje, no se adopta. */
    soltar(P, 0, TOKEN_MARIA);
    await asentar(20);
    assert.equal(P.ev('SESION.access_token'), nueva, 'la respuesta vieja pisó la sesión del reintento');
    const c = cerradas(ll, 'tok-MARIA');
    assert.equal(c.length, 1, 'la sesión huérfana no se cerró en el servidor');
    assert.match(c[0].url, /logout\?scope=local/, 'el cierre de la huérfana es global: se llevaría la sesión del reintento');
  });
});

describe('G1 — la respuesta tardía de María no le abre su sesión a Pedro', () => {

  for (const marca of ['', '?marca=platachat']) {
    test('G1 — el signup de María llega después de que Pedro puso su celular (' + (marca ? 'PlataChat' : 'Tu Garantía') + ')', async () => {
      const P = abrir({ search: marca });
      const ll = nube(P);
      mariaHastaElPermiso(P, true);
      P.ev('window.__colgar = /auth\\/v1\\/signup/;');
      tocar(P, 'Abrir mi cuenta');
      await asentar();
      assert.equal(colgadas(P).length, 1);
      tope(P);
      P.ev('window.__colgar = null;');
      pedroEmpiezaDeCero(P);
      assert.equal(pasoActual(P), 'entrada');
      soltar(P, 0, TOKEN_MARIA);
      await asentar(20);

      assert.equal(pasoActual(P), 'entrada', 'la pestaña de Pedro saltó a la pantalla de la cuenta de María');
      assert.equal(P.ev('SESION'), null, 'la pestaña de Pedro adoptó la sesión de María');
      assert.equal(P.sesion.play_sesion, undefined, 'la sesión de María quedó guardada en la pestaña de Pedro');
      assert.equal(P.almacen.platachat_sesion, undefined, 'la sesión de PlataChat de María quedó en el teléfono de Pedro');
      assert.equal(P.almacen.play_cuenta_creada, undefined, 'el celular de Pedro quedó anotado como «cuenta creada»');
      assert.match(P.almacen.play_registro_borrador || '', /PEDRO LUIS/, 'se borró el borrador de Pedro');
      assert.equal(P.ev('REGISTRO.nombres'), 'PEDRO LUIS');
      assert.equal(P.almacen.play_fotos_cola, undefined, 'se encoló algo para una cuenta que no existe');
      assert.equal(P.ev('location.href').indexOf('platachat/index.html'), -1, 'se fue a PlataChat con la cuenta de María');
      assert.equal(cerradas(ll, 'tok-MARIA').length, 1, 'el token de María quedó abierto: nadie lo cierra');
      /* Y Pedro termina su registro con lo suyo. */
      assert.equal(deMaria.test(JSON.stringify({ r: P.ev('JSON.stringify(REGISTRO)'), b: P.almacen.play_registro_borrador })), false);
    });
  }

  test('G1 — Pedro ya estaba dentro de SU cuenta: el signup tardío de María no se la cambia', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaElPermiso(P, false);
    P.ev('window.__colgar = /auth\\/v1\\/signup/;');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    tope(P);
    P.ev('window.__colgar = null;');
    for (let i = 0; i < 12 && P.ev('VISTA') === 'registro'; i++) volver(P);
    assert.equal(P.ev('VISTA'), 'entrar');
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.ev('SESION.access_token'), 'tok-' + CORREO_PEDRO);
    soltar(P, 0, TOKEN_MARIA);
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta', 'la cuenta de Pedro saltó a «Listo» con la de María');
    assert.equal(P.ev('SESION.access_token'), 'tok-' + CORREO_PEDRO, 'la sesión de Pedro se cambió por la de María');
    assert.match(P.sesion.play_sesion || '', /tok-573109998877/, 'la sesión guardada de Pedro se pisó');
    assert.equal(cerradas(ll, 'tok-MARIA').length, 1);
  });

  test('G1 — la bandeja de María contesta tarde: el signup NO sale, ni con lo de Pedro ni con lo de ella', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaElPermiso(P, true);
    P.ev('window.__colgar = /registrar_abierto/;');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    assert.equal(colgadas(P).length, 1);
    tope(P);
    P.ev('window.__colgar = null;');
    pedroEmpiezaDeCero(P);
    soltar(P, 0, { ok: true });
    await asentar(20);
    const signups = ll().filter(x => /auth\/v1\/signup/.test(x.url));
    assert.deepEqual(signups.map(x => x.cuerpo.email), [],
      'salió un signup después de una bandeja tardía: la cuenta de Pedro nacía sin fila en el CRM y con la autorización de María');
    assert.equal(P.ev('VISTA'), 'registro');
    assert.equal(P.ev('SESION'), null);
    assert.match(P.almacen.play_registro_borrador || '', /PEDRO LUIS/);
    assert.equal(P.almacen.play_cuenta_creada, undefined);
  });

  test('G1 — el signup sale con la FOTO del toque: lo que cambie en vivo mientras contesta la bandeja no viaja', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaElPermiso(P, false);
    P.ev('window.__colgar = /registrar_abierto/;');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    const bandeja = ll().filter(x => /registrar_abierto/.test(x.url))[0].cuerpo;
    /* Lo que nunca debería poder pasar en pantalla (está todo apagado), pero
       que el signup no tiene por qué creerse: el registro y la contraseña de
       la memoria cambian mientras la bandeja contesta. */
    P.ev("REGISTRO.nombres = 'OTRA PERSONA'; REGISTRO.celular = '" + CEL_PEDRO + "'; CLAVE_EN_MEMORIA = 'Otra.Clave99'; CLAVE_DEL_CELULAR = '" + CEL_PEDRO + "';");
    P.ev('window.__colgar = null;');
    soltar(P, 0, { ok: true });
    await asentar(20);
    const s = ll().filter(x => /auth\/v1\/signup/.test(x.url));
    assert.equal(s.length, 1);
    assert.equal(s[0].cuerpo.email, CORREO_MARIA, 'el signup salió con el celular que había en vivo');
    assert.equal(s[0].cuerpo.password, CLAVE_MARIA, 'el signup salió con la contraseña que había en vivo');
    assert.equal(s[0].cuerpo.data.vinculacion.nombres, 'MARIA JOSE', 'el signup salió con los datos que había en vivo');
    /* La bandeja y el signup salen de la MISMA foto: los mismos datos (la
       bandeja suma solo la versión de la política aceptada). */
    const { autorizacion_version: version, ...enLaBandeja } = bandeja.p_datos;
    assert.ok(version, 'la bandeja no lleva la versión de la política');
    assert.deepEqual(s[0].cuerpo.data.vinculacion, enLaBandeja, 'la bandeja y el signup no llevan los mismos datos');
  });

  test('G1 — «ya tenías cuenta»: la entrada con la contraseña del registro también es de quien la pidió', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaElPermiso(P, false);
    P.ev('window.__yaExiste = true; window.__colgar = /auth\\/v1\\/token/;');
    tocar(P, 'Abrir mi cuenta');
    await asentar();
    const t = ll().filter(x => /auth\/v1\/token/.test(x.url));
    assert.equal(t.length, 1, 'no intentó entrar con la contraseña del registro');
    assert.equal(t[0].cuerpo.email, CORREO_MARIA);
    assert.equal(t[0].cuerpo.password, CLAVE_MARIA);
    tope(P);
    P.ev('window.__colgar = null; window.__yaExiste = false;');
    pedroEmpiezaDeCero(P);
    soltar(P, 0, TOKEN_MARIA);
    await asentar(20);
    assert.equal(P.ev('SESION'), null, 'la pestaña de Pedro adoptó la sesión de María');
    assert.equal(pasoActual(P), 'entrada');
    assert.match(P.almacen.play_registro_borrador || '', /PEDRO LUIS/);
    assert.equal(cerradas(ll, 'tok-MARIA').length, 1);
  });

  test('G1 — «Entrar» de la portada: mientras dice «Entrando…» nada de la portada se toca, y a los 30 s se dice', () => {
    const P = abrir({ hash: '' });
    nube(P);
    assert.equal(P.ev('VISTA'), 'entrar');
    P.ev('window.__colgar = /auth\\/v1\\/token/;');
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    assert.match(P.ev("$('errEntrar').textContent"), /Entrando/);
    assert.equal(P.ev("$('btnEntrar').disabled"), true, '«Entrar» sigue encendido mientras entra');
    P.ev('abrirRegistro()');
    assert.equal(P.ev('VISTA'), 'entrar', '«Abrir mi cuenta» abrió el registro con un «Entrar» en camino');
    P.ev('olvide()');
    assert.equal(P.ev('VISTA'), 'entrar', '«Olvidé mi contraseña» salió de la portada con un «Entrar» en camino');
    P.ev('entrar()');
    assert.equal(colgadas(P).length, 1, 'un segundo «Entrar» salió con el primero en camino');
    assert.equal(tope(P), true, 'no hay tope: «Entrando…» puede quedarse para siempre');
    const dice = P.ev("$('errEntrar').textContent");
    assert.match(dice, /tardó demasiado/);
    assert.equal(/Esos datos no nos abren|contraseña no es/.test(dice), false, 'el tope culpa a la contraseña, que nadie revisó');
    assert.equal(P.ev("$('btnEntrar').disabled"), false, 'el tope no volvió a encender «Entrar»');
    P.ev('abrirRegistro()');
    assert.equal(P.ev('VISTA'), 'registro', 'después del tope, «Abrir mi cuenta» no abre');
  });

  test('G1 — «Entrar» de la portada: la sesión que llega con la pestaña ya en el registro de otra persona no se adopta', async () => {
    const P = abrir({ hash: '' });
    const ll = nube(P);
    P.ev('window.__colgar = /auth\\/v1\\/token/;');
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    tope(P);
    P.ev('window.__colgar = null;');
    /* Pedro se cansa; María abre su registro en la misma pestaña. */
    P.ev('abrirRegistro()');
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, { nombres: 'MARIA JOSE' });
    soltar(P, 0, { access_token: 'tok-PEDRO', refresh_token: 'r', expires_in: 3600, user: { email: CORREO_PEDRO } });
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'registro', 'el registro de María saltó a la cuenta de Pedro');
    assert.equal(P.ev('SESION'), null, 'la pestaña de María adoptó la sesión de Pedro');
    assert.equal(P.sesion.play_sesion, undefined);
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE');
    assert.equal(cerradas(ll, 'tok-PEDRO').length, 1, 'el token de Pedro quedó abierto');
  });

  test('G1 — la ubicación que llega tarde no cae en el registro que empezó de cero', async () => {
    const P = abrir();
    nube(P);
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: DATOS_MARIA.expedicion });
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    P.ev('window.__gpsColgar = true;');
    selfie(P, 'MARIA');
    assert.equal(P.ev('window.__gpsPend.length'), 1, 'no se pidió la ubicación');
    P.ev('window.__gpsColgar = false;');
    pedroEmpiezaDeCero(P);
    P.ev('window.__gpsPend[0]({ coords: { latitude: 4.711111, longitude: -74.072222, accuracy: 12 } })');
    await asentar();
    assert.equal(P.ev('FOTOS.gps'), undefined, 'la ubicación de María cayó en el registro de Pedro');
    assert.equal(deMaria.test(P.almacen.play_fotos_borrador || ''), false);
  });

  test('G1 — la lectura del código de una foto fija que termina tarde no escribe en el registro de otro', async () => {
    const P = abrir();
    nube(P);
    P.ev("window.__grande = { width: 1600, height: 1000 };" +
         "comprimirVarias = function (f, t) { return Promise.resolve(t.map(function (x) { return x[1] == null ? window.__grande : 'data:image/jpeg;base64,' + f.name; })); };" +
         'window.__zxing = null; window.cargarScript = function () { return new Promise(function (res) { window.__zxing = res; }); };' +
         'leerCedulaDeLienzo = function () { return { cedula: ' + JSON.stringify(MARIA) + ', error: "", giro: null }; };');
    P.ev('autorizarYEscanear()');
    P.ev("tomarFoto({ target: { files: [{ name: 'RESPALDO_MARIA' }] } }, 'cedula_reverso')");
    await asentar();
    assert.equal(P.ev('typeof window.__zxing'), 'function', 'la lectura no quedó esperando al lector');
    /* María se va a la portada; Pedro abre su registro y escribe lo suyo. */
    hastaElPaso(P, 'documento');
    volver(P);
    assert.equal(P.ev('VISTA'), 'entrar');
    P.ev('abrirRegistro()');
    if (P.ev('VISTA') === 'pregunta') P.ev('empezarDeNuevo()');
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, PEDRO);
    P.ev('window.__zxing()');
    await asentar();
    /* El respiro antes de decodificar es un setTimeout de 0 ms: en este banco
       los relojes se disparan a mano. Sin esto la lectura no llega nunca, y
       la prueba pasaría por no probar nada. */
    pasa(P, 0);
    await asentar();
    assert.equal(P.ev('window.__grande.width'), 1, 'la lectura tardía no llegó a terminar (soltar el lienzo): la prueba no prueba nada');
    assert.equal(P.ev('REGISTRO.nombres'), 'PEDRO LUIS', 'la lectura tardía de la cédula de María pisó el nombre de Pedro');
    assert.equal(P.ev('REGISTRO.documento'), '79111222');
    assert.equal(P.ev('FOTOS.cedula_leida'), undefined, 'la lectura de María quedó en el registro de Pedro');
    assert.equal(deMaria.test(P.almacen.play_registro_borrador || ''), false);
  });

  test('G1 — la ficha de la cuenta que llega después de «Salir» no se pinta en la cuenta del siguiente', async () => {
    const P = abrir({ hash: '' });
    nube(P);
    P.ev('window.__colgar = /rpc\\/mi_cuenta/;');
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    P.ev('salirDeCuenta()');
    P.ev("$('inTel').value = '300 111 2233'; $('inClave').value = " + JSON.stringify(CLAVE_MARIA) + '; entrar();');
    await asentar(20);
    assert.equal(P.ev('SESION.access_token'), 'tok-' + CORREO_MARIA);
    const n = colgadas(P).length;
    assert.ok(n >= 2, 'no quedaron colgadas las dos fichas');
    soltar(P, 0, { ok: true, vinculada: true, nombre: 'PEDRO LUIS GOMEZ RUIZ', datos: {} });
    await asentar(20);
    assert.notEqual(P.ev('FICHA && FICHA.nombre'), 'PEDRO LUIS GOMEZ RUIZ', 'la ficha de Pedro se pintó en la cuenta de María');
  });
});

describe('G2 — la contraseña en curso es del registro en que se creó', () => {

  test('G2 — tras «ya tenías cuenta» → entrar → «Salir», el primer celular del siguiente registro NO es «un cambio de celular»', async () => {
    const P = abrir({ hash: '' });
    P.ev(`fetch = function (u, op) {
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      var r = function (ok, j) { return Promise.resolve({ ok: ok, status: ok ? 200 : 400, json: function () { return Promise.resolve(j); } }); };
      u = String(u);
      if (/auth\\/v1\\/signup/.test(u)) return r(false, { msg: 'User already registered' });
      if (/auth\\/v1\\/token/.test(u)) return (c && c.password === 'Vieja.Clave55') ? r(true, { access_token: 't', refresh_token: 'rf', expires_in: 3600, user: { email: c.email } }) : r(false, { error: 'invalid_grant' });
      if (/registro_vivo_publicar/.test(u)) return r(true, { ok: true, testigo: 'w' });
      return r(true, { ok: true });
    };`);
    tocar(P, 'Abrir mi cuenta');
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, DATOS_MARIA);
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, 'Nueva.Clave77');
    assert.equal(pasoActual(P), 'rostro');
    P.ev('siguientePaso()');
    teclear(P, { correo: 'maria@correo.com' });
    P.ev('Object.assign(REGISTRO, ' + JSON.stringify(RESTO) + '); guardarBorrador(REGISTRO);');
    P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true;");
    cajaEnBlanco(P);
    P.ev('siguientePaso()');
    await asentar();
    const aviso = P.elems.errReg.innerHTML;
    assert.match(texto(aviso), /esa contraseña no es la suya/);
    P.ev(boton(aviso, 'Entrar con mi contraseña'));
    assert.equal(P.ev('VISTA'), 'entrar');
    P.ev("$('inClave').value = 'Vieja.Clave55'; entrar();");
    await asentar();
    assert.equal(P.ev('VISTA'), 'cuenta');
    P.ev('salirDeCuenta()');
    assert.equal(P.ev('VISTA'), 'entrar');

    /* Pedro, en la misma pestaña. Si la página le pregunta «¿Es tuyo?» por lo
       que dejó María (G3), dice que no y empieza de cero. */
    tocar(P, 'Abrir mi cuenta');
    if (P.ev('VISTA') === 'pregunta') tocar(P, 'Empezar de cero (se borra)');
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, PEDRO);
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    cajaEnBlanco(P);
    toque(P, CEL_PEDRO, CLAVE_PEDRO);
    assert.equal(/Cambiaste el celular/.test(texto(caja(P))), false, 'a Pedro se le dijo que cambió el celular, y nunca lo cambió: ' + texto(caja(P)));
    assert.equal(pasoActual(P), 'rostro', 'el primer celular de Pedro lo devolvió al primer paso');
    assert.equal(P.ev('REGISTRO.nombres'), 'PEDRO LUIS', 'se le borró a Pedro lo que escribió');
  });

  test('G2 — «Salir» olvida la contraseña en curso, en la memoria y en la pestaña', async () => {
    const P = abrir();
    nube(P);
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, DATOS_MARIA);
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    assert.ok(P.sesion.play_clave_en_curso, 'el caso de prueba no tiene contraseña en curso');
    hastaElPaso(P, 'documento');
    volver(P);
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    P.ev('salirDeCuenta()');
    assert.equal(P.sesion.play_clave_en_curso, undefined, 'la contraseña de María sobrevivió al «Salir» de otra cuenta');
    assert.equal(P.ev('CLAVE_EN_MEMORIA'), '');
    assert.equal(P.ev('CLAVE_DEL_CELULAR'), '');
  });

  test('G2 — una contraseña de OTRO registro no cuenta: ni para borrar, ni para «déjalo en blanco», ni para el signup', () => {
    const P = abrir();
    nube(P);
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, DATOS_MARIA);
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    const guardada = JSON.parse(P.sesion.play_clave_en_curso);
    assert.equal(guardada.intento, P.ev('REGISTRO.intento'), 'la contraseña en curso no lleva el intento de su registro');
    /* Otro registro en la memoria de la pestaña, con la contraseña de María
       todavía en curso (sin «Empezar de cero» de por medio). */
    P.ev("olvidarCelularDelRegistro(); REGISTRO = { intento: 'otro-registro' };");
    assert.equal(P.ev("claveDeEsteCelular('" + CEL_MARIA + "')"), '', 'la contraseña de otro registro abre este');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(celularesDelRegistro())')), [], 'el celular de la contraseña de otro registro cuenta como de este');
    assert.equal(P.ev("vaAEmpezarDeCero && vaAEmpezarDeCero('" + CEL_PEDRO + "')"), false);
  });

  test('G2 — lo que dejó la versión anterior (la contraseña sin intento) no se lee', () => {
    const P = abrir({ sesion: { play_clave_en_curso: JSON.stringify({ celular: CEL_MARIA, clave: CLAVE_MARIA }) } });
    assert.equal(P.ev('CLAVE_EN_MEMORIA'), '', 'una contraseña sin registro se tomó como en curso');
    assert.equal(P.ev("claveDeEsteCelular('" + CEL_MARIA + "')"), '');
  });
});

describe('G3 — la memoria y el teléfono dicen lo mismo', () => {

  /* María escribe a mano hasta «Tu rostro» y sale a la portada; su hermano
     entra a SU cuenta y toca «Salir». */
  async function elHermanoEntraYSale(P) {
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, DATOS_MARIA);
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    hastaElPaso(P, 'documento');
    volver(P);
    assert.equal(P.ev('VISTA'), 'entrar');
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    await asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    P.ev("irA('perfil')");
    const salir = boton(P.elems.lamina.innerHTML, 'Salir');
    assert.ok(salir, 'no está el botón «Salir»');
    P.ev(salir);
    assert.equal(P.ev('VISTA'), 'entrar');
  }

  test('G3 — tras «Salir» de otra cuenta, «Abrir mi cuenta» pregunta «¿Es tuyo?», y «Seguir» le devuelve a María lo suyo', async () => {
    const P = abrir();
    nube(P);
    await elHermanoEntraYSale(P);
    assert.match(P.almacen.play_registro_borrador || '', /MARIA JOSE/, 'el caso de prueba no dejó el borrador de María');
    tocar(P, 'Abrir mi cuenta');
    assert.equal(P.ev('VISTA'), 'pregunta', 'no preguntó «¿Es tuyo?» con un registro a medias en el teléfono');
    assert.equal(deMaria.test(texto(cuerpo(P))), false, 'la pregunta enseña lo de María');
    tocar(P, 'Seguir');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE', '«Seguir» no le devolvió a María lo que escribió');
    assert.equal(P.ev('REGISTRO.documento'), '52123456');
  });

  test('G3 — la primera tecla no pisa sin preguntar un borrador que solo está en el teléfono', async () => {
    const P = abrir();
    nube(P);
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, DATOS_MARIA);
    hastaElPaso(P, 'documento');
    volver(P);
    assert.equal(P.ev('VISTA'), 'entrar');
    /* Cualquier camino que deje la memoria vacía con el borrador vivo. */
    P.ev('REGISTRO = {};');
    tocar(P, 'Abrir mi cuenta');
    assert.equal(P.ev('VISTA'), 'pregunta', 'con la memoria vacía, el borrador del teléfono se pisaría sin preguntar');
    assert.match(P.almacen.play_registro_borrador || '', /MARIA JOSE/);
  });

  test('G3 — después de «Salir» no queda nada sensible en la memoria: solo lo escrito a mano', async () => {
    const P = abrir();
    nube(P);
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: DATOS_MARIA.expedicion });
    P.ev("anotarCampo($('f_expedicion'))");
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    hastaElPaso(P, 'documento');
    volver(P);
    P.ev("$('inTel').value = '310 999 8877'; $('inClave').value = " + JSON.stringify(CLAVE_PEDRO) + '; entrar();');
    await asentar(20);
    P.ev('salirDeCuenta()');
    assert.equal(P.ev('JSON.stringify(FOTOS)'), '{}', 'quedaron fotos en la memoria después de «Salir»');
    assert.equal(P.ev('REGISTRO.nombres'), undefined, 'lo que escribió el escáner volvió a la memoria');
    assert.equal(P.ev('REGISTRO.expedicion'), '2010-05-20', 'lo escrito a mano no volvió a la memoria');
  });
});

describe('G4 — el aviso de que el registro vuelve a empezar va ANTES de tocar «Continuar»', () => {

  function mariaPasoSuCelular(P) {
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, DATOS_MARIA);
    P.ev('siguientePaso()');
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    volver(P);
    assert.equal(pasoActual(P), 'entrada');
  }
  const aviso = P => String(P.ev("$('avisoOtroCelular').textContent") || '');

  test('G4 — con otro número válido en la casilla se dice antes; vuelve al confirmado (o a medias) y se va', () => {
    const P = abrir();
    nube(P);
    mariaPasoSuCelular(P);
    assert.equal(/vuelve a empezar/.test(texto(cuerpo(P))), false, 'con el celular confirmado ya avisa');
    celularEnLaCasilla(P, '310 999 8877');
    assert.match(aviso(P), /Con otro celular, el registro vuelve a empezar desde tu cédula/, 'no avisa antes de borrar');
    assert.equal(deMaria.test(aviso(P)), false, 'el aviso enseña datos de alguien');
    celularEnLaCasilla(P, '300 111 2233');
    assert.equal(aviso(P), '', 'de vuelta al número confirmado, el aviso se quedó');
    celularEnLaCasilla(P, '310 999');
    assert.equal(aviso(P), '', 'con un número a medias, avisa de un borrado que no va a pasar');
    /* Y lo que dice se cumple: con el otro número, «Continuar» empieza de cero. */
    toque(P, CEL_PEDRO, CLAVE_PEDRO);
    assert.match(texto(caja(P)), /Cambiaste el celular/);
  });

  test('G4, control — la primera vez que se escribe el celular no hay nada que avisar', () => {
    const P = abrir();
    nube(P);
    tocar(P, 'Prefiero escribir mis datos');
    teclear(P, PEDRO);
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    celularEnLaCasilla(P, '310 999 8877');
    assert.equal(aviso(P), '');
    assert.equal(/vuelve a empezar/.test(texto(cuerpo(P))), false);
  });

  test('G4 — si la casilla ya trae otro número al pintar el paso, el aviso sale pintado', () => {
    const P = abrir();
    nube(P);
    mariaPasoSuCelular(P);
    celularEnLaCasilla(P, '310 999 8877');   // lo escribe y se va sin tocar «Continuar»
    volver(P);
    assert.equal(pasoActual(P), 'identidad');
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    assert.match(texto(cuerpo(P)), /Con otro celular, el registro vuelve a empezar desde tu cédula/,
      'el paso se pintó con otro número en la casilla y sin el aviso');
  });
});
