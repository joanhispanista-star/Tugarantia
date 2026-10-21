'use strict';
/* ==========================================================================
 * SI EL CELULAR CAMBIA A MITAD DEL REGISTRO, EL REGISTRO EMPIEZA DE CERO
 * — 21-oct-2026
 *
 *   node --test pruebas/el-celular-nuevo-empieza-de-cero.test.js
 *
 * La verificación de 4000801 confirmó tres hallazgos:
 *   · E-A1 (seguridad, Ley 1581): María escribe su identidad A MANO, pasa su
 *     celular y deja el teléfono en «Cómo te contactamos». Pedro vuelve dos
 *     pasos, pone el suyo y sigue adelante: nunca pasa por «Revisa tus datos»,
 *     ninguna pantalla le enseña el nombre de María, y su cuenta nacía con la
 *     identidad, el correo y el otro celular de ella (registrar_abierto, el
 *     signup, el acompañamiento y, en PlataChat, la sesión). Con selfie, el
 *     aviso le decía «Lo que escribiste a mano sigue aquí»: él no escribió nada.
 *     La premisa de soltarLoDeOtroCelular («lo escrito a mano es de quien está
 *     aquí, o lo va a escribir encima») era del orden viejo, con el celular
 *     primero; con la cédula primero, la identidad queda ANTES del celular y
 *     nadie la escribe encima.
 *   · E1 (honestidad): el aviso pendiente pedía las fotos y mandaba al primer
 *     paso a quien ya las había vuelto a dar entre los dos «Continuar».
 *   · E2 (honestidad): «Tu rostro» le decía «No autorizaste las fotos en el
 *     primer paso» a quien sí autorizó y se le quitó (tras relanzar la pestaña).
 * Decisión de mentor (cierra la clase, no el caso): SI EL CELULAR CAMBIA A
 * MITAD DEL REGISTRO, EL REGISTRO EMPIEZA DE CERO. Se borra todo lo personal,
 * también lo escrito a mano; se quedan el celular nuevo y su contraseña; el
 * «Continuar» que pasa lleva al primer paso, y el aviso dice por qué.
 *
 * Cada prueba con su E en el título falla con la página de 4000801. Todas
 * corren play/index.html DE VERDAD (pruebas/banco-play.js), con la cédula
 * fabricada (pruebas/fabrica-pdf417.js) y una nube de mentira que anota lo que
 * sale a registrar_abierto, al signup y al acompañamiento.
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
const PEDRO_CED = cedula({ documento: '0079111222', apellido1: 'GOMEZ', apellido2: 'RUIZ',
  nombre1: 'PEDRO', nombre2: 'LUIS', sexo: 'M', nacimiento: '19850101', rh: 'O+' });
const CEL_MARIA = '3001112233', CEL_PEDRO = '3109998877';
const CLAVE_MARIA = 'Maria.Secreta9', CLAVE_PEDRO = 'Pedro.Propia7';
const DATOS_MARIA = { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
  documento: '52123456', expedicion: '2010-05-20' };
const CONTACTO_MARIA = { correo: 'maria.rodriguez@correo.com', celular2: '3205556677' };
const PEDRO = { nombres: 'PEDRO LUIS', apellidos: 'GOMEZ RUIZ', tipo_doc: 'Cédula de ciudadanía',
  documento: '79111222', expedicion: '2005-01-10' };

/* Todo lo que es de María en estas pruebas: su nombre, su documento, su
   correo, sus dos celulares, su contraseña, su cara y su ubicación. */
const nadaDeMaria = (txt, quien) =>
  assert.equal(/MARIA|RODRIGUEZ|52\.?123\.?456|maria\.rodriguez|3205556677|3001112233|Maria\.Secreta9|4\.711111/.test(String(txt)), false,
    quien + ': ' + String(txt).slice(0, 400));

function abrir(opc) {
  const o = Object.assign({ hash: '#registro' }, opc || {});
  const P = abrirPlay(o);
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.ev('window.__camaras = []; navigator.mediaDevices = { getUserMedia: function (c) { window.__camaras.push(c); return new Promise(function () {}); } };');
  P.ev('window.__gps = 0; navigator.geolocation = { getCurrentPosition: function (ok) { window.__gps++; if (window.__gpsDe) ok({ coords: window.__gpsDe }); } };');
  P.ev('window.__relojes = []; setTimeout = function (f, ms) { window.__relojes.push({ f: f, ms: ms }); return window.__relojes.length; }; clearTimeout = function () {};');
  return P;
}
function pasa(P, ms) {
  P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === ' + ms + '; });' +
       ' if (i < 0) throw new Error("no hay temporizador de ' + ms + ' ms"); var r = window.__relojes.splice(i, 1)[0]; r.f(); })()');
}
const pasoActual = P => P.ev('PASOS[PASO].id');
const cuerpo = P => P.elems.cuerpo.innerHTML;
const caja = P => P.elems.errReg ? ((P.elems.errReg.innerHTML || '') + ' ' + (P.elems.errReg.textContent || '')) : '';
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/* La caja de avisos del banco es UN objeto que sobrevive a cada repintada (en
   el teléfono, pintarRegistro la crea vacía): se vacía antes de un toque cuyo
   aviso se mira. */
function cajaEnBlanco(P) {
  if (P.elems.errReg) { P.elems.errReg.innerHTML = ''; P.elems.errReg.textContent = ''; }
}
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
function camara(P, quien) {
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO') + '_" + quien + "'; };" +
       "$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
}
/* «📷 Autorizo y escaneo mi cédula», el respaldo leído y el frente: la página
   pasa sola a «Revisa tus datos». */
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
/* El celular (tecla por tecla, como el oninput de verdad) y las dos casillas de
   la contraseña, y «Continuar». `clave` vacía es dejarla en blanco. */
function toque(P, cel, c1, c2) {
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));" +
       "$('rClave').value = " + JSON.stringify(c1) + "; $('rClave2').value = " + JSON.stringify(c2 == null ? c1 : c2) + '; siguientePaso();');
}
function selfie(P, quien) {
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;" +
       "if (!window.__ceOrig) window.__ceOrig = document.createElement;" +
       "document.createElement = function (t) { if (t === 'canvas') return { width: 0, height: 0, getContext: function () { return { drawImage: function () {} }; }," +
       " toDataURL: function () { return 'data:image/jpeg;base64,CARA_" + quien + "'; } }; return window.__ceOrig(t); };" +
       'capturarRostro();');
}
/* La nube de mentira: anota cada llamada. El acompañamiento devuelve su
   testigo, como la base de verdad, para que la fila del celular anterior se
   pueda borrar. */
function nube(P) {
  P.ev(`window.__llamadas = [];
    fetch = function (u, op) {
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      var bien = function (r) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };
      if (/registro_archivos_guardar/.test(String(u))) return bien({ ok: true, guardados: Object.keys((c && c.p_archivos) || {}) });
      if (/auth\\/v1\\/signup/.test(String(u))) {
        return bien({ access_token: 'tok-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } });
      }
      if (/registro_vivo_publicar/.test(String(u))) return bien({ ok: true, testigo: 'tst-' + (c && c.p_celular) });
      return bien({ ok: true });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
const bandeja = ll => ll().filter(x => /registrar_abierto/.test(x.url));
const signups = ll => ll().filter(x => /auth\/v1\/signup/.test(x.url));
const vivos = ll => ll().filter(x => /registro_vivo_publicar/.test(x.url));
const borrados = ll => ll().filter(x => /registro_vivo_borrar/.test(x.url));
function conSesionJs(P) {
  P.ev(SESION_JS);
  P.ev("SCRIPTS['../platachat/sesion.js'] = Promise.resolve();");
}

/* María, en el teléfono de Pedro: escribe su identidad A MANO (o autoriza las
   fotos sin poder tomar la cédula, y se toma la selfie, que da la ubicación),
   pasa su celular y su contraseña, y deja la página en «Cómo te contactamos»
   con su correo y su otro celular escritos. */
function mariaHastaContacto(P, conSelfie) {
  if (conSelfie) { P.ev('autorizarYEscanear()'); P.ev('siguientePaso()'); }   // sin fotos de la cédula
  else tocar(P, 'Prefiero escribir mis datos');
  assert.equal(pasoActual(P), 'identidad');
  casillas(P, 'identidad', DATOS_MARIA);
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'entrada');
  toque(P, CEL_MARIA, CLAVE_MARIA);
  assert.equal(pasoActual(P), 'rostro', 'María no pasó su celular: ' + texto(caja(P)));
  if (conSelfie) {
    P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
    selfie(P, 'MARIA');
    assert.equal(P.ev('FOTOS.selfie'), 'data:image/jpeg;base64,CARA_MARIA', 'la selfie no quedó: la prueba no cuenta el caso');
    assert.ok(P.ev('!!FOTOS.gps'), 'la ubicación no quedó: la prueba no cuenta el caso');
    P.ev('window.__gpsDe = { latitude: 4.6, longitude: -74.1, accuracy: 30 };');   // donde está Pedro
  }
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'contacto');
  casillas(P, 'contacto', CONTACTO_MARIA);
  ['correo', 'celular2'].forEach(k => P.ev("anotarCampo($('f_" + k + "'))"));
  assert.equal(P.ev('REGISTRO.celular2'), CONTACTO_MARIA.celular2, 'el otro celular de María no quedó: la prueba no cuenta el caso');
}
/* Pedro, de buena fe, toma el teléfono en «Cómo te contactamos»: «Volver» dos
   veces (contacto → rostro → entrada), su celular y su contraseña. Nunca pasa
   por «Revisa tus datos». */
function pedroPoneSuCelular(P, clave) {
  volver(P); volver(P);
  assert.equal(pasoActual(P), 'entrada');
  cajaEnBlanco(P);
  toque(P, CEL_PEDRO, clave == null ? CLAVE_PEDRO : clave);
}
/* Lo que ve quien llega al primer paso después del cambio: los dos botones de
   la cédula, y el aviso que dice la verdad sin decir nada de la otra persona. */
function enElPrimerPasoConElAviso(P) {
  assert.equal(pasoActual(P), 'documento', 'el «Continuar» con otro celular no lleva al primer paso: va a «' + pasoActual(P) + '»');
  const h = cuerpo(P);
  assert.match(h, /id="btnAutorizoEscaneo"/, 'el primer paso no ofrece «Autorizo y escaneo mi cédula»');
  assert.match(h, /id="btnEscribirDatos"/, 'el primer paso no ofrece «Prefiero escribir mis datos»');
  const c = texto(caja(P));
  assert.match(c, /Cambiaste el celular, así que el registro volvió a empezar/, 'el aviso no dice que se empezó de nuevo: ' + c);
  assert.match(c, /lo que se había llenado con el otro celular/, 'el aviso no dice qué se borró: ' + c);
  assert.equal(/sigue aquí/.test(c), false, 'después de un cambio de celular dice que algo «sigue aquí»: ' + c);
  nadaDeMaria(c, 'el aviso le enseña algo de la otra persona');
  nadaDeMaria(h, 'el primer paso le enseña algo de la otra persona');
}
/* El registro que queda: el intento, el celular nuevo y nada más. */
function soloElCelularNuevo(P, cel) {
  assert.deepEqual(JSON.parse(P.ev("JSON.stringify(Object.keys(REGISTRO).filter(function (k) { return k !== 'intento'; }))")), ['celular'],
    'del registro anterior quedó: ' + P.ev('JSON.stringify(REGISTRO)'));
  assert.equal(P.ev('REGISTRO.celular'), cel);
  assert.equal(P.ev('hayContenidoEnFotos()'), false, 'quedaron fotos: ' + P.ev('Object.keys(FOTOS).join()'));
  assert.equal(P.ev('autorizoEsteIntento()'), false, 'el permiso de las fotos de la otra persona le vale a esta');
}
/* Pedro hace su registro desde el primer paso, escribiendo sus datos, y llega
   a «Tu rostro» con su contraseña de antes (no se la piden otra vez). */
function pedroDesdeElPrimerPaso(P) {
  tocar(P, 'Prefiero escribir mis datos');
  assert.equal(pasoActual(P), 'identidad');
  ['nombres', 'apellidos', 'documento', 'expedicion'].forEach(k =>
    assert.match(cuerpo(P), new RegExp('id="f_' + k + '"[^>]*value=""'), 'la casilla ' + k + ' no está vacía'));
  casillas(P, 'identidad', PEDRO);
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'entrada', 'Pedro no llegó otra vez a su celular: ' + texto(caja(P)));
  assert.match(cuerpo(P), /Déjalo en blanco para seguir con la misma/, 'la contraseña que Pedro ya creó no se conservó');
  cajaEnBlanco(P);
  toque(P, CEL_PEDRO, '');
  assert.equal(pasoActual(P), 'rostro', 'con su mismo celular y su contraseña no lo dejó seguir: ' + texto(caja(P)));
  assert.equal(/borramos|Cambiaste el celular/.test(caja(P)), false, 'volvió a borrar con el mismo celular: ' + texto(caja(P)));
}
/* De «Tu rostro» a «Abrir mi cuenta»: «Cómo te contactamos» sale VACÍO (nada
   del correo ni del otro celular de María), y el resto lo escribe Pedro. */
async function pedroAbreSuCuenta(P) {
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'contacto');
  const h = cuerpo(P);
  assert.match(h, /id="f_correo"[^>]*value=""/, '«Cómo te contactamos» trae un correo que Pedro no escribió');
  assert.match(h, /id="f_celular2"[^>]*value=""/, '«Cómo te contactamos» trae un celular que Pedro no escribió');
  nadaDeMaria(h, '«Cómo te contactamos» le enseña a Pedro algo de María');
  P.ev("Object.assign(REGISTRO, { correo: 'pedro@correo.com', ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo'," +
       " anos_direccion: 'Más de 5 años', ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000'," +
       " dia_pago: 'Quincenal (15 y 30)', ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344'," +
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566' }); guardarBorrador(REGISTRO);");
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  cajaEnBlanco(P);
  P.ev('siguientePaso()');
  const seguir = boton(caja(P), 'Seguir');
  if (seguir) P.ev(seguir);
  await asentar();
}
/* Lo que salió del teléfono con el celular de Pedro: solo lo de Pedro. */
function soloLoDePedroSalio(ll, ruta) {
  const b = bandeja(ll);
  assert.equal(b.length, 1, 'no llegó a ' + ruta);
  assert.match(b[0].url, new RegExp(ruta + '$'));
  assert.equal(b[0].cuerpo.p_celular, CEL_PEDRO);
  assert.equal(b[0].cuerpo.p_nombre, 'PEDRO LUIS GOMEZ RUIZ', 'la solicitud de Pedro llegó con otro nombre');
  assert.equal(b[0].cuerpo.p_cedula, '79111222', 'la solicitud de Pedro llegó con otro documento');
  nadaDeMaria(JSON.stringify(b), ruta + ' llevó algo de María con el celular de Pedro');
  const s = signups(ll);
  assert.equal(s.length, 1, 'la cuenta de Pedro no se abrió');
  assert.equal(s[0].cuerpo.email, U.correoDeTelefono(CEL_PEDRO));
  assert.equal(s[0].cuerpo.password, CLAVE_PEDRO, 'la cuenta de Pedro nació con otra contraseña');
  assert.equal(s[0].cuerpo.data.vinculacion.documento, '79111222');
  nadaDeMaria(JSON.stringify(s), 'el signup de Pedro llevó algo de María');
  nadaDeMaria(JSON.stringify(vivos(ll).filter(x => x.cuerpo.p_celular === CEL_PEDRO)),
    'el acompañamiento publicó algo de María con el celular de Pedro');
}

describe('E-A1. si el celular cambia, el registro empieza de cero: también lo escrito a mano se borra', () => {

  test('E-A1 — PEDRO ENTRA POR «CÓMO TE CONTACTAMOS» Y NUNCA POR «REVISA TUS DATOS»: va al primer paso, y su cuenta no lleva nada de María', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaContacto(P, false);
    await asentar();                                   // el testigo de su fila llega con la respuesta
    assert.ok(vivos(ll).some(x => x.cuerpo.p_celular === CEL_MARIA), 'el avance de María no se publicó: la prueba no cuenta el caso');
    assert.ok(P.ev('testigoVivo(' + JSON.stringify(CEL_MARIA) + ')'), 'no quedó el testigo de la fila de María: la prueba no cuenta el caso');
    pedroPoneSuCelular(P);
    enElPrimerPasoConElAviso(P);
    soloElCelularNuevo(P, CEL_PEDRO);
    nadaDeMaria(JSON.stringify(P.almacen) + JSON.stringify(P.sesion), 'quedó en el teléfono algo de María');
    assert.ok(borrados(ll).some(x => x.cuerpo.p_celular === CEL_MARIA), 'la fila del acompañamiento con el celular de María no se borró');
    assert.equal(vivos(ll).filter(x => x.cuerpo.p_celular === CEL_PEDRO).length, 0,
      'se publicó el avance con el celular de Pedro antes de que escribiera nada suyo');
    pedroDesdeElPrimerPaso(P);
    await pedroAbreSuCuenta(P);
    soloLoDePedroSalio(ll, 'registrar_abierto');
  });

  test('E-A1 — …CON LA SELFIE Y LA UBICACIÓN DE MARÍA: el aviso nombra lo que se borró y nunca dice «Lo que escribiste a mano sigue aquí»', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaContacto(P, true);
    pedroPoneSuCelular(P);
    enElPrimerPasoConElAviso(P);
    const c = texto(caja(P));
    assert.match(c, /los datos del formulario/, 'el aviso calla que se borraron los datos escritos: ' + c);
    assert.match(c, /la foto de la cara/, 'el aviso calla la selfie: ' + c);
    assert.match(c, /la ubicación/, 'el aviso calla la ubicación: ' + c);
    assert.match(c, /el permiso de las fotos/, 'el aviso calla el permiso: ' + c);
    assert.equal(/cédula/.test(c), false, 'habla de una cédula que nunca se escaneó: ' + c);
    soloElCelularNuevo(P, CEL_PEDRO);
    pedroDesdeElPrimerPaso(P);
    /* Sin permiso, «Tu rostro» se salta con un texto que es verdad para él. */
    assert.equal(/No autorizaste/.test(cuerpo(P)), false, 'le dice «No autorizaste» en un registro donde se dio un permiso');
    await pedroAbreSuCuenta(P);
    soloLoDePedroSalio(ll, 'registrar_abierto');
    nadaDeMaria(JSON.stringify(ll().filter(x => /registro_archivos_guardar/.test(x.url))), 'subió a la cuenta de Pedro la cara o la ubicación de María');
  });

  test('E-A1 — PLATACHAT: ni registrar_abierto_app ni la sesión que se le pasa a PlataChat llevan el nombre de María', async () => {
    const P = abrir({ search: '?marca=platachat' });
    assert.equal(P.ev('MARCA'), 'platachat');
    conSesionJs(P);
    const ll = nube(P);
    mariaHastaContacto(P, false);
    pedroPoneSuCelular(P);
    enElPrimerPasoConElAviso(P);
    soloElCelularNuevo(P, CEL_PEDRO);
    pedroDesdeElPrimerPaso(P);
    await pedroAbreSuCuenta(P);
    await asentar();
    soloLoDePedroSalio(ll, 'registrar_abierto_app');
    assert.equal(vivos(ll).length, 0, 'PlataChat publicó un avance');
    const sesion = P.almacen.platachat_sesion;
    assert.ok(sesion, 'no se le pasó la sesión a PlataChat: la prueba no cuenta el caso');
    assert.match(sesion, /PEDRO LUIS GOMEZ RUIZ/, 'la sesión de PlataChat no lleva el nombre de Pedro: ' + sesion);
    nadaDeMaria(sesion, 'la sesión de PlataChat de Pedro lleva algo de María');
  });

  test('E-A1 — EL PRIMER «CONTINUAR» FALLA POR LA CONTRASEÑA: ya se borró todo y se dice; el que pasa lleva al primer paso', async () => {
    const P = abrir();
    const ll = nube(P);
    mariaHastaContacto(P, false);
    pedroPoneSuCelular(P, '');
    assert.equal(pasoActual(P), 'entrada', 'siguió sin contraseña');
    const f = P.elems.errReg.textContent;
    assert.match(f, /Cambiaste el celular, así que el registro volvió a empezar/, 'el aviso del toque que falla no dice que se empezó de nuevo: ' + f);
    assert.match(f, /la contraseña es nueva/);
    soloElCelularNuevo(P, CEL_PEDRO);
    nadaDeMaria(JSON.stringify(P.almacen) + JSON.stringify(P.sesion), 'quedó en el teléfono algo de María');
    cajaEnBlanco(P);
    toque(P, CEL_PEDRO, CLAVE_PEDRO);
    enElPrimerPasoConElAviso(P);
    pedroDesdeElPrimerPaso(P);
    await pedroAbreSuCuenta(P);
    soloLoDePedroSalio(ll, 'registrar_abierto');
  });

  test('E-A1 — …Y SI LA PESTAÑA SE RELANZA ENTRE LOS DOS «CONTINUAR», el que pasa lleva igual al primer paso', () => {
    const P = abrir();
    mariaHastaContacto(P, false);
    pedroPoneSuCelular(P, '');
    assert.equal(pasoActual(P), 'entrada');
    const Q = abrir({ almacen: P.almacen, sesion: {} });
    const s = boton(cuerpo(Q), 'Seguir'); if (s) Q.ev(s);   // «¿Es tuyo?», si lo pregunta
    nadaDeMaria(cuerpo(Q), 'la pestaña relanzada le enseña algo de María');
    Q.ev("pintarRegistro(indiceDe('entrada'))");
    cajaEnBlanco(Q);
    toque(Q, CEL_PEDRO, CLAVE_PEDRO);
    enElPrimerPasoConElAviso(Q);
    soloElCelularNuevo(Q, CEL_PEDRO);
  });

  test('E-A1 — EL CELULAR NUEVO Y SU CONTRASEÑA SE QUEDAN: escanea su cédula, vuelve a su paso, sigue en blanco y no se borra nada', () => {
    const P = abrir();
    mariaHastaContacto(P, false);
    pedroPoneSuCelular(P);
    enElPrimerPasoConElAviso(P);
    escanear(P, PEDRO_CED, 'PEDRO');
    assert.equal(pasoActual(P), 'identidad');
    assert.equal(P.ev('FOTOS.de.celular'), CEL_PEDRO, 'las fotos de Pedro no quedaron a nombre de su celular');
    casillas(P, 'identidad', { expedicion: '2005-01-10' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    assert.match(cuerpo(P), /Déjalo en blanco para seguir con la misma/, 'se le pide otra vez la contraseña que ya creó');
    cajaEnBlanco(P);
    toque(P, CEL_PEDRO, '');
    assert.equal(pasoActual(P), 'rostro', texto(caja(P)));
    assert.equal(/borramos|Cambiaste el celular/.test(caja(P)), false, 'con el mismo celular se volvió a borrar algo: ' + texto(caja(P)));
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO_PEDRO', 'se le borró la cédula que acaba de escanear');
    assert.equal(P.ev('REGISTRO.nombres'), 'PEDRO LUIS');
    assert.equal(P.ev('autorizoEsteIntento()'), true, 'se le borró el permiso que acaba de dar');
    assert.equal(P.ev('CLAVE_EN_MEMORIA'), CLAVE_PEDRO, 'se le borró su contraseña');
  });
});

describe('E1. el aviso del cambio de celular decide con lo que hay AHORA', () => {

  /* María escanea su cédula y teclea la fecha de expedición; pone 3001112234
     por error y sigue; desde «Tu rostro» vuelve, lo corrige y deja la
     contraseña en blanco: ese toque empieza de cero y falla. */
  function mariaCorrigeYFalla() {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    toque(P, '3001112234', CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    volver(P);
    toque(P, CEL_MARIA, '');
    assert.equal(pasoActual(P), 'entrada', 'la contraseña en blanco pasó');
    assert.equal(P.ev('hayContenidoEnFotos()'), false, 'el cambio no borró las fotos: la prueba no cuenta el caso');
    return P;
  }

  test('E1 — VOLVIÓ A ESCANEAR Y A DAR EL PERMISO ENTRE LOS DOS «CONTINUAR»: el aviso no le pide las fotos ni la manda al primer paso', () => {
    const P = mariaCorrigeYFalla();
    volver(P); volver(P);                              // entrada → identidad → documento
    assert.equal(pasoActual(P), 'documento');
    escanear(P, MARIA, 'MARIA');
    assert.equal(pasoActual(P), 'identidad');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    cajaEnBlanco(P);
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro', 'con todo vuelto a dar la mandó a otra parte: ' + texto(caja(P)));
    assert.equal(P.ev("hayFotoLista('cedula_reverso') && hayFotoLista('cedula_frente') && autorizoEsteIntento()"), true,
      'las fotos y el permiso no están: la prueba no cuenta el caso');
    const c = caja(P);
    assert.equal(/Si quieres dar las fotos/.test(c), false, 'le pide unas fotos que ya volvió a dar: ' + texto(c));
    assert.equal(/Ir al primer paso/.test(c), false, 'la manda a repetir el escaneo que ya hizo: ' + texto(c));
    /* Lo que dice en pasado sigue siendo verdad, y se puede quedar. */
    assert.match(texto(c), /Cambiaste el celular/);
  });

  test('…y si volvió a escribir sus datos pero NO dio las fotos, la invitación a las fotos sí sale (es verdad que faltan)', () => {
    const P = mariaCorrigeYFalla();
    volver(P);                                         // entrada → identidad
    assert.equal(pasoActual(P), 'identidad');
    casillas(P, 'identidad', DATOS_MARIA);
    P.ev('siguientePaso()');
    cajaEnBlanco(P);
    toque(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro', texto(caja(P)));
    const c = caja(P);
    assert.match(texto(c), /Si quieres dar las fotos, vuelve al primer paso/, 'calla que las fotos se fueron: ' + texto(c));
    assert.match(c, /Ir al primer paso/);
  });
});

describe('E2. «Tu rostro» sin permiso dice algo que es verdad en todos los casos', () => {

  const TEXTO_POR_DEFECTO = /Sin el permiso de las fotos este paso se salta: tu cuenta se abre igual\. Si quieres darlas, vuelve al primer paso\./;

  test('E2 — EL PERMISO SE FUE CON EL CAMBIO DE CELULAR Y LA PESTAÑA SE RELANZÓ: no le dice «No autorizaste» a quien sí autorizó', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    toque(P, '3001112234', CLAVE_MARIA);
    volver(P);
    toque(P, CEL_MARIA, '');                           // borra (con el permiso) y falla
    assert.equal(pasoActual(P), 'entrada');
    const Q = abrir({ almacen: P.almacen, sesion: {} });
    const s = boton(cuerpo(Q), 'Seguir'); if (s) Q.ev(s);
    Q.ev("pintarRegistro(indiceDe('entrada'))");
    cajaEnBlanco(Q);
    toque(Q, CEL_MARIA, CLAVE_MARIA);
    /* Hasta «Tu rostro» por donde la lleve la página, sin volver a dar las fotos. */
    for (let i = 0; i < 6 && pasoActual(Q) !== 'rostro'; i++) {
      const p = pasoActual(Q);
      if (p === 'documento') tocar(Q, 'Prefiero escribir mis datos');
      else if (p === 'identidad') { casillas(Q, 'identidad', DATOS_MARIA); Q.ev('siguientePaso()'); }
      else if (p === 'entrada') toque(Q, CEL_MARIA, '');
      else break;
    }
    assert.equal(pasoActual(Q), 'rostro', 'no llegó a «Tu rostro»: ' + texto(caja(Q)));
    assert.equal(Q.ev('autorizoEsteIntento()'), false, 'el permiso volvió solo: la prueba no cuenta el caso');
    const h = cuerpo(Q);
    assert.equal(/No autorizaste/.test(h), false, 'le dice «No autorizaste las fotos» a quien sí las autorizó');
    assert.match(h, TEXTO_POR_DEFECTO);
  });

  test('E2 — EL PERMISO SE FUE CON UNA CÉDULA DE OTRO DOCUMENTO Y LA PESTAÑA SE RELANZÓ: tampoco «No autorizaste»', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { documento: '79111222', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    assert.match(texto(caja(P)), /no es la del documento que escribiste/, 'no soltó la cédula: la prueba no cuenta el caso');
    assert.equal(P.ev('autorizoEsteIntento()'), false);
    /* En la misma pestaña se sabe por qué, y se dice. */
    P.ev("pintarRegistro(indiceDe('rostro'))");
    assert.match(cuerpo(P), /Quitamos el permiso de las fotos junto con la cédula/);
    const Q = abrir({ almacen: P.almacen, sesion: {} });
    const s = boton(cuerpo(Q), 'Seguir'); if (s) Q.ev(s);
    Q.ev("pintarRegistro(indiceDe('rostro'))");
    const h = cuerpo(Q);
    assert.equal(/No autorizaste/.test(h), false, 'tras la relanzada le dice «No autorizaste las fotos» a quien sí las autorizó');
    assert.match(h, TEXTO_POR_DEFECTO);
  });

  test('cuando se sabe con certeza (el registro nació en esta pestaña y nunca se tocó «Autorizo»), sigue diciendo «No autorizaste»', () => {
    const P = abrir();
    tocar(P, 'Prefiero escribir mis datos');
    P.ev("pintarRegistro(indiceDe('rostro'))");
    assert.match(cuerpo(P), /No autorizaste las fotos en el primer paso, así que este paso se salta: tu cuenta se abre igual/);
  });
});
