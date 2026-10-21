'use strict';
/* ==========================================================================
 * SI EL CELULAR CAMBIA A MITAD DEL REGISTRO, ES OTRA PERSONA — 20-oct-2026
 *
 *   node --test pruebas/el-celular-es-la-persona.test.js
 *
 * La verificación del cierre (3887d46) confirmó seis hallazgos, C1 a C6. Los
 * dos de seguridad tienen la misma raíz: con la cédula primero (19-oct),
 * cambiar el celular dentro del mismo registro dejó de soltar lo de antes, y la
 * única reja que quedó fue una pregunta por la cédula al final.
 *   · C1: María deja su selfie y su ubicación; Pedro pone su celular y abre su
 *     cuenta con la cara y la ubicación de María.
 *   · C2: María crea su contraseña; Pedro pone su celular, deja la casilla en
 *     blanco como le dice la pantalla, y su cuenta nace con la contraseña de
 *     María (ella entra a la cuenta de él; él no).
 * Decisión de mentor: SI EL CELULAR CAMBIA, ES OTRA PERSONA. Al tocar
 * «Continuar» en «Tu celular y tu contraseña» con un celular distinto del que
 * este registro ya tenía, se borra lo sensible de la persona anterior (fotos de
 * la cédula, lectura y correcciones, selfie, ubicación, permiso) y su
 * contraseña en curso. La primera vez que se escribe el celular no se borra
 * nada.
 *   · C3: con el teléfono que no deja escribir nada, la nota y los avisos de la
 *     subida viven en la memoria de la página, como la cola (B6).
 *   · C4: el aviso «las borramos» también pasada la hora de las fotos sin
 *     dueño.
 *   · C5: el aviso dice exactamente lo que se borró, y no devuelve al paso de
 *     la cédula si de la cédula no se borró nada.
 *   · C6: las fotos que dejó la versión publicada y que ya se reconocen de este
 *     registro reciben su intento, sin tocar su hora.
 *
 * Cada prueba con su C en el título falla con la página de 3887d46. Todas
 * corren play/index.html DE VERDAD (pruebas/banco-play.js), con la cédula
 * fabricada (pruebas/fabrica-pdf417.js). Lo de las tandas anteriores (V1-V7,
 * F4-F15, A1-A8, B1-B7) sigue en sus archivos y corre igual.
 *
 * 21-oct-2026 — la verificación de 74e8922 confirmó D1-D4. Al final del
 * archivo, las de la página (cada una con su D en el título falla con
 * 74e8922):
 *   · D1: un celular que no sirve (a medias, vacío, con un dígito de más)
 *     dejaba seguir con el de María: «Continuar» miraba REGISTRO.celular y no
 *     la casilla, y C1 y C2 se volvían a abrir.
 *   · D3: si el «Continuar» que borraba fallaba por la contraseña, el
 *     siguiente mandaba a «Tu rostro» sin el nombre ni el documento, y sin
 *     decirlo.
 *   · D4: una foto tomada mientras la casilla tenía un número sin «Continuar»
 *     quedaba a nombre de ese número, y corregirlo lo borraba todo.
 *   D2 (el atajo sin sesión de registrar_abierto, del 9-sep) va en otra tanda:
 *   queda nombrado como riesgo conocido en base/20261020_la_cedula_de_la_cuenta.sql.
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
const PEDRO = { nombres: 'PEDRO LUIS', apellidos: 'GOMEZ RUIZ', tipo_doc: 'Cédula de ciudadanía',
  documento: '79111222', expedicion: '2005-01-10' };

/* La página con una cámara en vivo que pide permiso y nunca contesta, un GPS
   que contesta si se le dice dónde está (window.__gpsDe) y un reloj que guarda
   los temporizadores para correrlos a mano. */
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
const caja = P => P.elems.errReg ? P.elems.errReg.innerHTML : '';
const avisoFotos = P => P.elems.avisoFotos ? P.elems.avisoFotos.innerHTML : '';
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function boton(html, txt) {
  const re = new RegExp('onclick="([^"]+)"[^>]*>' + txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<');
  const m = re.exec(html);
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}
/* «Volver», el botón de verdad del paso (pintarRegistro(PASO - 1)). */
function volver(P) {
  const b = boton(cuerpo(P), 'Volver');
  assert.ok(b, 'el paso no tiene «Volver»');
  P.ev(b);
}
function camara(P, quien) {
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO') + '_" + quien + "'; };" +
       "$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
}
function soloElRespaldo(P, ced, quien) {
  P.ev('autorizarYEscanear()');
  camara(P, quien);
  P.ev("ESCDOC.lado = 'reverso'; leidaDoc(" + JSON.stringify(ced) + ', 0)');
  pasa(P, 1500);
}
function escanear(P, ced, quien) {
  soloElRespaldo(P, ced, quien);
  camara(P, quien);
  P.ev('capturarDoc(true)');
  pasa(P, 1500);
}
function casillas(P, grupo, cambios) {
  P.ev("U.camposDelGrupo('" + grupo + "').forEach(function (c) { if (c.id === 'celular') return;" +
       " $('f_' + c.id).value = REGISTRO[c.id] === undefined ? '' : String(REGISTRO[c.id]); });");
  Object.keys(cambios || {}).forEach(k => P.ev("$('f_" + k + "').value = " + JSON.stringify(cambios[k]) + ';'));
}
/* Escribe el celular (tecla por tecla: anotarCelular) y la contraseña, y toca
   «Continuar». `clave` vacía es dejar la casilla en blanco. */
function celularYClave(P, cel, clave) {
  const k = JSON.stringify(clave == null ? 'Perro.2026x' : clave);
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));" +
       "$('rClave').value = " + k + "; $('rClave2').value = " + k + '; siguientePaso();');
}
/* La selfie que toma el escáner en vivo: un lienzo de mentira con su nombre. */
function selfie(P, quien) {
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;" +
       "if (!window.__ceOrig) window.__ceOrig = document.createElement;" +
       "document.createElement = function (t) { if (t === 'canvas') return { width: 0, height: 0, getContext: function () { return { drawImage: function () {} }; }," +
       " toDataURL: function () { return 'data:image/jpeg;base64,CARA_" + quien + "'; } }; return window.__ceOrig(t); };" +
       'capturarRostro();');
}
function elResto(P) {
  P.ev("Object.assign(REGISTRO, { correo: 'x@correo.com', ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo'," +
       " anos_direccion: 'Más de 5 años', ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000'," +
       " dia_pago: 'Quincenal (15 y 30)', ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344'," +
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566' }); guardarBorrador(REGISTRO);");
}
/* La nube de mentira (la de el-cierre-del-registro.test.js): anota cada
   llamada con su sesión. `subida` decide qué contesta la base a las fotos. */
function nube(P, subida) {
  P.ev('window.__subida = ' + JSON.stringify(subida == null ? null : subida) + ';' +
    `window.__llamadas = [];
    fetch = function (u, op) {
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c, auth: op && op.headers && op.headers.Authorization });
      var bien = function (r) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };
      var mal = function (s, r) { return Promise.resolve({ ok: false, status: s, json: function () { return Promise.resolve(r); } }); };
      if (/registro_archivos_guardar/.test(String(u))) {
        if (window.__subida === 'sin_red') return Promise.reject(new Error('sin señal'));
        if (typeof window.__subida === 'number') return mal(window.__subida, { message: 'JWT expired' });
        return bien(window.__subida || { ok: true, guardados: Object.keys((c && c.p_archivos) || {}) });
      }
      if (/auth\\/v1\\/signup/.test(String(u))) {
        return bien({ access_token: 'tok-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } });
      }
      if (/grant_type=password/.test(String(u))) {
        return bien({ access_token: 'tok-nuevo-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } });
      }
      return bien({ ok: true });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
const subidas = ll => ll().filter(x => /registro_archivos_guardar/.test(x.url));
const signups = ll => ll().filter(x => /auth\/v1\/signup/.test(x.url));
function abrirLaCuenta(P) {
  elResto(P);
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  P.ev('siguientePaso()');
}
function conSesionJs(P) {
  P.ev(SESION_JS);
  P.ev("SCRIPTS['../platachat/sesion.js'] = Promise.resolve();");
}
/* El teléfono que no deja escribir NADA en localStorage (datos del sitio
   bloqueados, o la cuota llena hasta el borde): leer sí. */
function nadaSeEscribe(P) {
  P.ev("localStorage.setItem = function () { throw new Error('QuotaExceededError'); };");
}
/* Todo lo de este registro pasó a la hora `t`: el último toque, el paso y la
   hora de las fotos (la de el-cierre-del-registro.test.js). */
function todoALaHora(P, t) {
  P.almacen.play_registro_toque = String(t);
  P.almacen.play_registro_paso = JSON.stringify(Object.assign(JSON.parse(P.almacen.play_registro_paso), { t }));
  const f = JSON.parse(P.almacen.play_fotos_borrador); f.de.t = t; P.almacen.play_fotos_borrador = JSON.stringify(f);
}
const nadaDeMaria = (txt, quien) =>
  assert.equal(/CARA_MARIA|_MARIA|MARIA|52\.?123\.?456|RODRIGUEZ|4\.711111/.test(txt), false, quien + ': ' + String(txt).slice(0, 300));

/* María, en el teléfono de Pedro: autoriza las fotos, su cédula no se deja
   leer (sigue sin ellas), escribe sus datos, su celular y su contraseña, se
   toma la selfie (que da la ubicación) y deja la página en «Cómo te
   contactamos». */
function mariaSinCedulaConSuCara() {
  const P = abrir();
  P.ev('autorizarYEscanear()');
  P.ev('siguientePaso()');                          // sin fotos de la cédula
  assert.equal(pasoActual(P), 'identidad');
  casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
    documento: '52123456', expedicion: '2010-05-20' });
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'entrada');
  celularYClave(P, CEL_MARIA, CLAVE_MARIA);
  assert.equal(pasoActual(P), 'rostro');
  P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
  selfie(P, 'MARIA');
  assert.equal(P.ev('FOTOS.selfie'), 'data:image/jpeg;base64,CARA_MARIA', 'la selfie no quedó: la prueba no cuenta el caso');
  assert.ok(P.ev('!!FOTOS.gps'), 'la ubicación no quedó: la prueba no cuenta el caso');
  P.ev('window.__gpsDe = { latitude: 4.6, longitude: -74.1, accuracy: 30 };');   // donde está Pedro
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'contacto');
  return P;
}
/* Pedro, de buena fe, toma el registro con los botones de verdad: «Volver»
   hasta «Revisa tus datos», escribe los suyos y llega a su celular. */
function pedroHastaSuCelular(P) {
  volver(P); volver(P); volver(P);                  // contacto → rostro → entrada → identidad
  assert.equal(pasoActual(P), 'identidad');
  casillas(P, 'identidad', PEDRO);
  ['nombres', 'apellidos', 'documento'].forEach(k => P.ev("anotarCampo($('f_" + k + "'))"));
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'entrada', 'Pedro no llegó a su celular: ' + texto(caja(P)));
}

describe('C1. la selfie y la ubicación de otra persona no pasan a la cuenta del celular nuevo', () => {

  test('C1 — PEDRO PONE SU CELULAR: la cara y la ubicación de María se borran, y su cuenta no las sube', async () => {
    const P = mariaSinCedulaConSuCara();
    pedroHastaSuCelular(P);
    celularYClave(P, CEL_PEDRO, CLAVE_PEDRO);
    assert.equal(P.ev('FOTOS.selfie'), undefined, 'la selfie de María se quedó en el registro de Pedro');
    assert.equal(P.ev('FOTOS.gps'), undefined, 'la ubicación de María se quedó en el registro de Pedro');
    assert.equal(P.ev('autorizoEsteIntento()'), false, 'el permiso que dio María le sirve a Pedro');
    assert.equal(P.ev('GPS_PEDIDO'), false, 'la ubicación no se le vuelve a pedir a Pedro');
    nadaDeMaria(cuerpo(P), 'el paso siguiente le enseña a Pedro algo de María');
    /* Y se dice lo que se borró, sin decir de quién era. */
    const c = texto(caja(P));
    assert.match(c, /la foto de la cara/, 'no dice que borró la selfie: ' + c);
    assert.match(c, /ubicación/, 'no dice que borró la ubicación: ' + c);
    assert.equal(/cédula/.test(c), false, 'habla de una cédula que nunca se escaneó: ' + c);
    /* Pedro abre su cuenta: no sube nada de María. */
    const ll = nube(P);
    abrirLaCuenta(P);
    const seguir = boton(caja(P), 'Seguir');
    if (seguir) P.ev(seguir);
    await asentar();
    assert.ok(signups(ll).length === 1, 'la cuenta de Pedro no se abrió: ' + texto(caja(P)));
    nadaDeMaria(JSON.stringify(subidas(ll)), 'subió a la cuenta de Pedro la cara o la ubicación de María');
  });

  test('C1 — …también si Pedro repite la selfie: la ubicación que sube es la suya, pedida otra vez', async () => {
    const P = mariaSinCedulaConSuCara();
    pedroHastaSuCelular(P);
    celularYClave(P, CEL_PEDRO, CLAVE_PEDRO);
    /* Para tomarse la suya tiene que volver a dar el permiso: el de María se fue. */
    P.ev("pintarRegistro(indiceDe('documento'))");
    P.ev('autorizarYEscanear()');
    P.ev("pintarRegistro(indiceDe('rostro'))");
    selfie(P, 'PEDRO');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(FOTOS.gps)')), { lat: 4.6, lng: -74.1, acc: 30, fecha: P.ev('hoyISO()') },
      'la ubicación de Pedro no se pidió: quedó la de María');
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    const s = subidas(ll);
    assert.equal(s.length, 1);
    assert.equal(s[0].cuerpo.p_archivos.selfie, 'data:image/jpeg;base64,CARA_PEDRO');
    nadaDeMaria(JSON.stringify(s), 'con la cara de Pedro subió la ubicación de María');
  });

  test('C1 — LA PREGUNTA DEL FINAL NO HABLA DE UNA CÉDULA QUE NO SE ESCANEÓ: enseña la cara y nombra la ubicación', () => {
    const P = mariaSinCedulaConSuCara();
    /* La selfie y la ubicación quedaron en duda (pasó más de un día con el
       mismo intento, o se tomaron con otro celular): «Abrir mi cuenta» pregunta. */
    P.ev('FOTOS.de.duda = true; guardarFotos();');
    nube(P);
    abrirLaCuenta(P);
    const h = caja(P);
    assert.ok(boton(h, 'Seguir'), 'no preguntó: ' + texto(h));
    assert.equal(/cédula/.test(texto(h)), false, 'pregunta por «la cédula que se escaneó» y no se escaneó ninguna: ' + texto(h));
    assert.match(h, /<img[^>]+CARA_MARIA/, 'pregunta por la cara sin enseñarla');
    assert.match(texto(h), /ubicación/, 'no dice que también va la ubicación');
  });
});

describe('C2. ninguna cuenta nace con la contraseña creada con otro celular', () => {

  test('C2 — PEDRO CAMBIA EL CELULAR Y DEJA LA CONTRASEÑA EN BLANCO: no se le ofrece la de María, y su cuenta nace con la suya', async () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    P.ev('siguientePaso()');
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
      documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    volver(P); volver(P);
    casillas(P, 'identidad', PEDRO);
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    /* La pantalla se pintó con el celular de María (el del borrador): ahí sí
       es verdad que esa contraseña ya se creó. En cuanto Pedro escribe el suyo,
       deja de ofrecerse. */
    P.ev("$('rTel').value = '" + CEL_PEDRO + "'; anotarCelular($('rTel'));");
    assert.equal(P.elems.rClaveEtq && P.elems.rClaveEtq.textContent, 'Crea tu contraseña',
      'con otro celular la casilla sigue diciendo «Tu contraseña»');
    assert.equal(/Déjalo en blanco/.test(P.elems.rClaveMisma ? P.elems.rClaveMisma.textContent : 'Déjalo en blanco'), false,
      'con otro celular le sigue diciendo «Déjalo en blanco para seguir con la misma»');
    const ll = nube(P);
    P.ev("$('rClave').value = ''; $('rClave2').value = ''; siguientePaso();");
    assert.equal(pasoActual(P), 'entrada', 'siguió con la contraseña que creó María');
    assert.match(P.elems.errReg.textContent, /la contraseña es nueva: créala y escríbela dos veces/);   // fallo() escribe texto
    assert.equal(P.ev('CLAVE_EN_MEMORIA'), '', 'la contraseña de María sigue en la pestaña');
    assert.equal(/Maria\.Secreta9/.test(JSON.stringify(P.sesion)), false, 'la contraseña de María sigue en el sessionStorage');
    /* Con la suya, sigue; y su cuenta nace con ella. */
    P.ev("$('rClave').value = '" + CLAVE_PEDRO + "'; $('rClave2').value = '" + CLAVE_PEDRO + "'; siguientePaso();");
    assert.equal(pasoActual(P), 'rostro');
    abrirLaCuenta(P);
    const seguir = boton(caja(P), 'Seguir');
    if (seguir) P.ev(seguir);
    await asentar();
    const s = signups(ll);
    assert.equal(s.length, 1, 'no se abrió la cuenta: ' + texto(caja(P)));
    assert.equal(s[0].cuerpo.email, U.correoDeTelefono(CEL_PEDRO));
    assert.equal(s[0].cuerpo.password, CLAVE_PEDRO, 'la cuenta de Pedro nació con la contraseña de María');
    assert.equal(/Maria\.Secreta9/.test(JSON.stringify(ll())), false, 'la contraseña de María salió del teléfono');
  });

  test('C2 — LA REJA DEL FINAL: si se llega a «Abrir mi cuenta» con otro celular que el de la contraseña, se pide la suya y no se manda la otra', async () => {
    const P = abrir();
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
      documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    /* Un camino que no pase por «Continuar» del celular (no lo hay hoy: esta
       reja es por si mañana aparece uno). */
    P.ev("REGISTRO.celular = '" + CEL_PEDRO + "'; guardarBorrador(REGISTRO);");
    elResto(P);
    P.ev("pintarRegistro(indiceDe('permiso'))");
    assert.match(cuerpo(P), /id="rClaveFin"/, 'no pide la contraseña de este celular');
    const ll = nube(P);
    P.ev("$('autGeneral').checked = true; siguientePaso();");
    await asentar();
    assert.equal(signups(ll).length, 0, 'abrió la cuenta con la contraseña creada con otro celular');
    P.ev("$('rClaveFin').value = '" + CLAVE_PEDRO + "'; $('rClaveFin2').value = '" + CLAVE_PEDRO + "'; siguientePaso();");
    await asentar();
    const s = signups(ll);
    assert.equal(s.length, 1);
    assert.equal(s[0].cuerpo.password, CLAVE_PEDRO);
  });

  test('con el MISMO celular, «déjalo en blanco» sigue sirviendo (quien vuelve a su paso no la teclea otra vez)', () => {
    const P = abrir();
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
      documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    volver(P);
    assert.equal(pasoActual(P), 'entrada');
    assert.match(cuerpo(P), /Déjalo en blanco para seguir con la misma/);
    celularYClave(P, CEL_MARIA, '');
    assert.equal(pasoActual(P), 'rostro', 'con el mismo celular no dejó seguir en blanco: ' + texto(caja(P)));
    assert.equal(P.ev('CLAVE_EN_MEMORIA'), CLAVE_MARIA);
  });
});

describe('la regla: si el celular cambia, se borra lo de la persona anterior; la primera vez, nada', () => {

  test('LA PRIMERA VEZ QUE SE ESCRIBE EL CELULAR no se borra nada de lo escaneado', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO_MARIA');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE');
    assert.equal(P.ev('autorizoEsteIntento()'), true);
    assert.equal(/borramos/.test(caja(P)), false, 'dice que borró algo la primera vez');
  });

  test('LA PRIMERA VEZ, con fotos de OTRO registro en el teléfono: esas se sueltan, y el permiso de quien escribe se queda', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    P.ev("Object.assign(FOTOS, { cedula_reverso: 'data:DE-OTRO', de: { celular: '3009999999', intento: 'otro-intento', t: Date.now() } }); guardarFotos();");
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', PEDRO);
    P.ev('siguientePaso()');
    celularYClave(P, CEL_PEDRO);
    assert.equal(pasoActual(P), 'rostro');
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'la cédula de otro registro se le pegó a este');
    assert.equal(P.ev('autorizoEsteIntento()'), true, 'se le borró el permiso que acaba de dar');
    assert.equal(/borramos/.test(caja(P)), false, 'le dice que borró lo suyo');
  });

  test('CON LA CÉDULA ESCANEADA, otro celular se lleva las fotos, la lectura y lo que el escáner escribió con ella, y lleva a escribir los datos', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
    selfie(P, 'MARIA');
    volver(P);                                        // rostro → entrada
    celularYClave(P, CEL_PEDRO, CLAVE_PEDRO);
    assert.equal(P.ev('REGISTRO.nombres'), undefined, 'el nombre leído de la cédula anterior se quedó');
    assert.equal(P.ev('REGISTRO.documento'), undefined, 'el documento leído de la cédula anterior se quedó');
    assert.equal(P.ev('hayContenidoEnFotos()'), false, 'quedó algo sensible de la persona anterior: ' + P.ev('Object.keys(FOTOS).join()'));
    assert.equal(P.ev('autorizoEsteIntento()'), false);
    assert.equal(pasoActual(P), 'identidad', 'sin nombre ni documento lo mandó adelante');
    const c = texto(caja(P));
    assert.match(c, /las fotos de la cédula/);
    assert.match(c, /lo que leímos de ella/);
    assert.match(c, /la foto de la cara/);
    assert.match(c, /ubicación/);
    assert.match(c, /el permiso de las fotos/);
    nadaDeMaria(JSON.stringify(P.almacen), 'quedó en el teléfono algo de la persona anterior');
  });

  test('con la pestaña relanzada (sin sessionStorage) el celular anterior se sigue sabiendo: el permiso que quedó se va', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    P.ev('siguientePaso()');
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
      documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    /* Sin selfie y con la ubicación negada: solo queda el permiso. */
    const Q = abrir({ almacen: P.almacen, sesion: {} });
    assert.equal(Q.ev('autorizoEsteIntento()'), true, 'el permiso no sobrevivió la relanzada: la prueba no cuenta el caso');
    Q.ev("pintarRegistro(indiceDe('entrada'))");
    celularYClave(Q, CEL_PEDRO, CLAVE_PEDRO);
    assert.equal(Q.ev('autorizoEsteIntento()'), false, 'el permiso que dio María le quedó a Pedro');
  });
});

describe('C3. si el teléfono no deja escribir nada, la nota y los avisos de la subida viven en la página', () => {

  function mariaHastaElCelular(opc) {
    const P = abrir(opc);
    if (opc && opc.search) conSesionJs(P);
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    return P;
  }

  test('C3 — TU GARANTÍA, LA BASE NO CONFIRMA LA CÉDULA: la cuenta dice que las borramos y que la mande por el chat', async () => {
    const P = mariaHastaElCelular();
    nadaSeEscribe(P);
    nube(P, { ok: false, motivo: 'otro_documento' });
    abrirLaCuenta(P);
    await asentar();
    const a = texto(avisoFotos(P));
    assert.match(a, /No pudimos confirmar de quién es la cédula/, 'el rechazo de la base se calló: ' + a);
    assert.match(a, /chat de Servicio/);
  });

  test('C3 — PLATACHAT, LA BASE NO CONFIRMA LA CÉDULA: no termina en «Tu cuenta quedó abierta» a secas', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat', hash: '' });
    nadaSeEscribe(P);
    nube(P, { ok: false, motivo: 'otro_documento' });
    abrirLaCuenta(P);
    await asentar();
    assert.match(P.elems.pcSubida.textContent, /No pudimos confirmar de quién es la cédula/,
      'PlataChat calla que las fotos no entraron: ' + P.elems.pcSubida.textContent);
  });

  test('C3 — TU GARANTÍA, LA SESIÓN VENCE CON LAS FOTOS EN LA PÁGINA: pide volver a entrar, no «Subirlas ahora» para siempre', async () => {
    const P = mariaHastaElCelular();
    nadaSeEscribe(P);
    const ll = nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.match(texto(avisoFotos(P)), /no cierres esta página/);
    P.ev('window.__subida = 401;');
    P.ev(boton(avisoFotos(P), 'Subirlas ahora'));
    await asentar();
    assert.equal(subidas(ll).length, 2);
    const a = avisoFotos(P);
    assert.match(texto(a), /Tu sesión se venció/, 'la sesión vencida se tomó por falta de señal: ' + texto(a));
    assert.ok(boton(a, 'Volver a entrar'), 'no le da cómo volver a entrar');
  });

  test('C3 — PLATACHAT, LA SESIÓN VENCE CON LAS FOTOS EN LA PÁGINA: pide la contraseña', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat', hash: '' });
    nadaSeEscribe(P);
    nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.match(P.elems.pcAcciones.innerHTML, /Volver a intentar subirlas/);
    P.ev('window.__subida = 401;');
    P.ev(boton(P.elems.pcAcciones.innerHTML, 'Volver a intentar subirlas'));
    await asentar();
    assert.match(cuerpo(P), /id="pcClave"/, 'con la sesión vencida no pide la contraseña: «Volver a intentar» fallaría para siempre');
  });
});

describe('C4. el aviso «las borramos» también pasada la hora', () => {

  /* María, en el paso de la cédula, ya tomó el respaldo (leído) y toca la caja
     del frente; un mandado de setenta minutos y la pestaña se relanza. */
  function mariaConElRespaldo(escrito, minutos) {
    const P = abrir();
    soloElRespaldo(P, MARIA, 'MARIA');
    assert.equal(pasoActual(P), 'documento');
    if (escrito) P.ev("REGISTRO.correo = 'maria@correo.com'; guardarBorrador(REGISTRO);");
    todoALaHora(P, Date.now() - minutos * 60e3);
    return P;
  }

  test('C4 — SETENTA MINUTOS, CON #registro: el paso de la cédula dice que las borramos', () => {
    const Q = abrirPlay({ almacen: mariaConElRespaldo(false, 70).almacen, sesion: {}, hash: '#registro' });
    assert.deepEqual(Q.fallos, []);
    assert.equal(Q.ev('FOTOS.cedula_reverso'), undefined);
    assert.equal(Q.ev('PASOS[PASO].id'), 'documento');
    assert.match(caja(Q), /Pasó un rato desde que se tomaron las fotos de la cédula, y por seguridad las borramos/,
      'pasada la hora se le borró la cédula sin una palabra');
  });

  test('C4 — SETENTA MINUTOS, SIN EL HASH: no cae callada en la portada', () => {
    const Q = abrirPlay({ almacen: mariaConElRespaldo(false, 70).almacen, sesion: {}, hash: '' });
    assert.equal(/¿Ya abriste tu cuenta\?/.test(cuerpo(Q)), false, 'cayó en la portada sin decir que borró su cédula');
    assert.match(caja(Q), /por seguridad las borramos/);
  });

  test('C4 — SETENTA MINUTOS, CON ALGO ESCRITO: «¿Es tuyo?» → «Seguir» dice que las borramos', () => {
    const Q = abrirPlay({ almacen: mariaConElRespaldo(true, 70).almacen, sesion: {}, hash: '#registro' });
    assert.match(cuerpo(Q), /¿Es tuyo\?/);
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    assert.equal(Q.ev('PASOS[PASO].id'), 'documento');
    assert.match(caja(Q), /por seguridad las borramos/);
    assert.equal(Q.ev('REGISTRO.correo'), 'maria@correo.com');
  });
});

describe('C5. el aviso dice exactamente lo que se borró', () => {

  test('C5 — SOLO LA UBICACIÓN (siguió sin la cédula a propósito): vuelve a su paso, y el aviso no habla de la cédula', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    P.ev('siguientePaso()');                        // sin la cédula
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
      documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
    P.ev('siguientePaso()');                        // sin selfie: se pide la ubicación al salir
    assert.ok(P.ev('!!FOTOS.gps'), 'la ubicación no quedó: la prueba no cuenta el caso');
    elResto(P);
    P.ev("pintarRegistro(indiceDe('permiso'))");
    todoALaHora(P, Date.now() - 30 * 60e3);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.match(cuerpo(Q), /¿Es tuyo\?/);
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    assert.equal(Q.ev('PASOS[PASO].id'), 'permiso', 'la devolvió del último paso al primero, que había saltado a propósito');
    const c = texto(caja(Q));
    assert.equal(/cédula|leímos/.test(c), false, 'dice que borró una cédula que nunca se tomó: ' + c);
    assert.match(c, /ubicación/, 'no dice que borró la ubicación: ' + c);
    assert.match(c, /permiso/, 'no dice que borró el permiso: ' + c);
    assert.equal(Q.ev('FOTOS.gps'), undefined);
  });

  test('C5 — LA CÉDULA, LA SELFIE Y LA UBICACIÓN: el aviso las nombra todas', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
    selfie(P, 'MARIA');
    todoALaHora(P, Date.now() - 30 * 60e3);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    const c = texto(caja(Q));
    assert.match(c, /Pasó un rato desde que se tomaron las fotos de la cédula, y por seguridad las borramos/);
    assert.match(c, /la foto de (tu|la) cara/, 'calla que también borró la selfie: ' + c);
    assert.match(c, /ubicación/, 'calla que también borró la ubicación: ' + c);
  });
});

describe('C6. la foto de la versión publicada que cruza la actualización conserva su hora', () => {

  /* Lo que deja e7a3737 a media foto: el paso con el orden viejo (sin nombre),
     las fotos con dueño y sin intento, el permiso sin sello y sin la hora del
     último toque (esa versión no la tenía). */
  function laVersionPublicada(entroHaceMin, fotoHaceMin) {
    const ahora = Date.now();
    return {
      play_registro_borrador: JSON.stringify({ celular: CEL_MARIA, nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ',
        tipo_doc: 'Cédula de ciudadanía', documento: '52123456' }),
      play_fotos_borrador: JSON.stringify({ sensibles: true, cedula_reverso: 'data:image/jpeg;base64,RESPALDO_MARIA',
        cedula_leida: { documento: '0052123456', nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ' },
        de: { celular: CEL_MARIA, t: ahora - fotoHaceMin * 60e3 } }),
      play_registro_paso: JSON.stringify({ paso: 1, t: ahora - entroHaceMin * 60e3 })
    };
  }

  test('C6 — ENTRÓ AL PASO HACE DOCE MINUTOS Y TOMÓ LA FOTO HACE MEDIO: la foto se queda, sin «Pasó un rato»', () => {
    const Q = abrirPlay({ almacen: laVersionPublicada(12, 0.5), sesion: {}, hash: '#registro' });
    assert.deepEqual(Q.fallos, []);
    const s = boton(cuerpo(Q), 'Seguir'); if (s) Q.ev(s);
    assert.equal(Q.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO_MARIA',
      'se borró la foto de hace treinta segundos');
    assert.equal(/Pasó un rato/.test(caja(Q)), false, 'le dice «Pasó un rato» a quien estuvo fuera medio minuto');
    assert.equal(Q.ev('FOTOS.de.intento'), Q.ev('REGISTRO.intento'), 'las fotos no quedaron con el intento de este registro');
  });

  test('…y la hora de la foto no se toca: la de hace once minutos se suelta igual', () => {
    const Q = abrirPlay({ almacen: laVersionPublicada(12, 11), sesion: {}, hash: '#registro' });
    const s = boton(cuerpo(Q), 'Seguir'); if (s) Q.ev(s);
    assert.equal(Q.ev('FOTOS.cedula_reverso'), undefined, 'una foto de hace once minutos volvió a valer');
  });
});

/* ==========================================================================
 * 21-oct-2026 — D1, D3 y D4 (verificación de 74e8922). Cada prueba con su D
 * en el título falla con la página de 74e8922.
 * ======================================================================== */

/* El celular tecla por tecla, como el oninput de verdad (anotarCelular), sin
   tocar «Continuar». */
function teclear(P, cel) {
  P.ev("$('rTel').value = ''; anotarCelular($('rTel'));");
  for (let i = 1; i <= cel.length; i++) {
    P.ev("$('rTel').value = " + JSON.stringify(cel.slice(0, i)) + "; anotarCelular($('rTel'));");
  }
}
/* El celular y las dos casillas de la contraseña, cada una con lo suyo, y
   «Continuar». */
function toque(P, cel, c1, c2) {
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));" +
       "$('rClave').value = " + JSON.stringify(c1) + "; $('rClave2').value = " + JSON.stringify(c2) + '; siguientePaso();');
}
/* Repetir el frente desde «Tu cédula» con el botón de la tarjeta (solo existe
   si la tarjeta tiene su ✓) y tomarlo con la cámara en vivo. */
function repetirElFrente(P, quien) {
  assert.match(cuerpo(P), /repetirDoc\('frente'\)/, 'el frente no se ve tomado: no hay «Repetir»');
  P.ev("repetirDoc('frente')");
  camara(P, quien);
  P.ev("ESCDOC.lado = 'frente'; capturarDoc(true)");
  try { pasa(P, 1500); } catch (e) { /* si no pasó sola, se sigue a mano */ }
}
/* La caja de avisos del banco es UN objeto que sobrevive a cada repintada (en
   el teléfono, pintarRegistro la crea vacía): se vacía antes de un toque cuyo
   aviso se mira, para no leer el del toque anterior. */
function cajaEnBlanco(P) {
  if (P.elems.errReg) { P.elems.errReg.innerHTML = ''; P.elems.errReg.textContent = ''; }
}
/* De donde quede después de la foto hasta «Tu celular y tu contraseña». */
function hastaElCelular(P) {
  if (pasoActual(P) === 'documento') P.ev('siguientePaso()');
  if (pasoActual(P) === 'identidad') { casillas(P, 'identidad'); P.ev('siguientePaso()'); }
  assert.equal(pasoActual(P), 'entrada', 'no llegó al celular: ' + texto(caja(P)));
}
const DATOS_MARIA = { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
  documento: '52123456', expedicion: '2010-05-20' };

describe('D1. «Continuar» decide con el celular que MUESTRA la casilla', () => {

  [['A MEDIAS (9 dígitos)', '310 999 887'],
   ['VACÍA', ''],
   ['CON UN DÍGITO DE MÁS (11, pegados)', '31099988771']].forEach(([como, enLaCasilla]) => {
    test('D1 — LA CASILLA ' + como + ': «Revisa tu celular» con contraseña nueva y en blanco, y no sigue con el celular ni la contraseña de María', async () => {
      const P = mariaSinCedulaConSuCara();
      pedroHastaSuCelular(P);
      for (const clave of [CLAVE_PEDRO, '']) {
        celularYClave(P, enLaCasilla, clave);
        assert.equal(pasoActual(P), 'entrada',
          'con la casilla ' + como.toLowerCase() + ' y la contraseña ' + (clave ? 'nueva' : 'en blanco') + ' siguió con el celular de María');
        assert.match(P.elems.errReg.textContent, /Revisa tu celular: son 10 números y empiezan por 3/);
        /* El aviso sale ANTES de soltar nada y antes de «déjalo en blanco»:
           ni dice que borró, ni usó la contraseña de María. */
        assert.equal(/borramos/.test(P.elems.errReg.textContent), false, 'borró algo con un número que no sirve');
      }
      /* Con su número completo, ahora sí: lo de María se va y la cuenta es suya. */
      const ll = nube(P);
      celularYClave(P, CEL_PEDRO, CLAVE_PEDRO);
      assert.equal(pasoActual(P), 'rostro');
      assert.equal(P.ev('FOTOS.selfie'), undefined, 'la selfie de María se quedó');
      abrirLaCuenta(P);
      const seguir = boton(caja(P), 'Seguir');
      if (seguir) P.ev(seguir);
      await asentar();
      const s = signups(ll);
      assert.equal(s.length, 1, 'no se abrió la cuenta: ' + texto(caja(P)));
      assert.equal(s[0].cuerpo.email, U.correoDeTelefono(CEL_PEDRO), 'la cuenta nació con el celular de María');
      assert.equal(s[0].cuerpo.password, CLAVE_PEDRO, 'la cuenta nació con la contraseña de María');
      nadaDeMaria(JSON.stringify(subidas(ll)), 'subió a la cuenta de Pedro algo de María');
      assert.equal(/Maria\.Secreta9/.test(JSON.stringify(ll())), false, 'la contraseña de María salió del teléfono');
    });
  });

  test('con el MISMO celular de siempre en la casilla, sigue como antes (con espacios, y en blanco)', () => {
    const P = abrir();
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', DATOS_MARIA);
    P.ev('siguientePaso()');
    celularYClave(P, '300 111 2233', CLAVE_MARIA);   // con espacios, como lo escribe la gente
    assert.equal(pasoActual(P), 'rostro', texto(caja(P)));
    volver(P);
    celularYClave(P, CEL_MARIA, '');
    assert.equal(pasoActual(P), 'rostro', texto(caja(P)));
  });
});

describe('D3. el desvío a «Revisa tus datos» y el aviso no dependen de que el «Continuar» que borró sea el que pasa', () => {

  /* María escanea su cédula y teclea la fecha de expedición; pone 3001112234
     por error y sigue; desde «Tu rostro» vuelve y lo corrige. */
  function mariaVuelveACorregirSuCelular() {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    celularYClave(P, '3001112234', CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    volver(P);
    assert.equal(pasoActual(P), 'entrada');
    return P;
  }

  [['EN BLANCO (lo que le ofrecía «Déjalo en blanco»)', '', ''],
   ['QUE NO QUEDA IGUAL LAS DOS VECES', CLAVE_MARIA, 'Maria.Secreta8'],
   ['MUY CORTA', 'abc', 'abc']].forEach(([como, c1, c2]) => {
    test('D3 — EL PRIMER «CONTINUAR» FALLA (CONTRASEÑA ' + como + '): dice que se borraron sus datos, y el que pasa la lleva a «Revisa tus datos»', () => {
      const P = mariaVuelveACorregirSuCelular();
      toque(P, CEL_MARIA, c1, c2);
      assert.equal(pasoActual(P), 'entrada', 'la contraseña no servía y siguió');
      assert.equal(P.ev('REGISTRO.documento'), undefined, 'no se borró lo de la cédula: la prueba no cuenta el caso');
      const f = P.elems.errReg.textContent;
      assert.match(f, /los nombres/, 'el aviso calla que se borraron los nombres: ' + f);
      assert.match(f, /número de documento/, 'el aviso calla que se borró el documento: ' + f);
      assert.match(f, /fecha de expedición/, 'el aviso calla la fecha de expedición que tecleó: ' + f);
      /* El segundo «Continuar», con la contraseña bien, ya no ve ningún cambio
         de celular: lo que decide es lo que quedó pendiente. */
      cajaEnBlanco(P);
      toque(P, CEL_MARIA, CLAVE_MARIA, CLAVE_MARIA);
      assert.equal(pasoActual(P), 'identidad', 'la mandó adelante sin su nombre ni su documento (se entera en el paso 9)');
      const c = texto(caja(P));
      assert.match(c, /Escribe tus datos otra vez/, 'no le dice que escriba sus datos: ' + c);
      assert.match(c, /fecha de expedición/, 'no le dice que también se fue la fecha de expedición: ' + c);
      /* Y lo pendiente se cerró: el siguiente paso por su celular no lo repite. */
      casillas(P, 'identidad', DATOS_MARIA);
      P.ev('siguientePaso()');
      cajaEnBlanco(P);
      celularYClave(P, CEL_MARIA, '');
      assert.equal(pasoActual(P), 'rostro', texto(caja(P)));
      assert.equal(/borramos/.test(caja(P) + P.elems.errReg.textContent), false, 'repite el aviso de lo borrado en un «Continuar» que ya no borró nada');
    });
  });

  test('D3 — …y si la pestaña se relanza entre los dos «Continuar», lo pendiente sigue', () => {
    const P = mariaVuelveACorregirSuCelular();
    toque(P, CEL_MARIA, '', '');
    assert.equal(pasoActual(P), 'entrada');
    const Q = abrir({ almacen: P.almacen, sesion: {} });
    const s = boton(cuerpo(Q), 'Seguir'); if (s) Q.ev(s);   // «¿Es tuyo?», si lo pregunta
    Q.ev("pintarRegistro(indiceDe('entrada'))");
    cajaEnBlanco(Q);
    toque(Q, CEL_MARIA, CLAVE_MARIA, CLAVE_MARIA);
    assert.equal(Q.ev('PASOS[PASO].id'), 'identidad', 'tras la relanzada la mandó adelante sin sus datos');
    assert.match(texto(caja(Q)), /Escribe tus datos otra vez/);
  });

  test('D3 — SI ESCRIBIÓ SUS DATOS ENTRE UN «CONTINUAR» Y OTRO: el que pasa dice lo que se borró, y no se los pide otra vez', () => {
    const P = mariaVuelveACorregirSuCelular();
    toque(P, CEL_MARIA, '', '');
    volver(P);
    assert.equal(pasoActual(P), 'identidad');
    casillas(P, 'identidad', DATOS_MARIA);
    P.ev('siguientePaso()');
    cajaEnBlanco(P);
    toque(P, CEL_MARIA, CLAVE_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro', texto(caja(P)));
    const c = texto(caja(P));
    assert.match(c, /borramos/, 'en el «Continuar» que pasa no se dice lo que se borró');
    assert.equal(/Escribe tus datos otra vez/.test(c), false, 'le pide otra vez unos datos que ya escribió: ' + c);
  });
});

describe('D4. el dueño de una foto es un celular que ya pasó «Continuar», no el que se va tecleando', () => {

  test('D4 — LA PRIMERA VEZ: un número mal tecleado, sin «Continuar», no se vuelve dueño de la foto que se repite; al corregirlo no se borra nada', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    teclear(P, '3001112234');                          // mal, y sin «Continuar»
    volver(P); volver(P);                              // entrada → identidad → documento
    assert.equal(pasoActual(P), 'documento');
    repetirElFrente(P, 'MARIA');
    assert.equal(P.ev('FOTOS.de.celular'), '', 'la foto quedó a nombre de un número que nunca pasó «Continuar»');
    hastaElCelular(P);
    teclear(P, CEL_MARIA);
    cajaEnBlanco(P);
    P.ev("$('rClave').value = '" + CLAVE_MARIA + "'; $('rClave2').value = '" + CLAVE_MARIA + "'; siguientePaso();");
    assert.equal(pasoActual(P), 'rostro', 'la primera vez que pasa su celular la mandó a otra parte: ' + texto(caja(P)));
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA', 'se borró el frente que acababa de tomar');
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO_MARIA', 'se borró el respaldo');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE', 'se borró lo leído de su cédula');
    assert.equal(P.ev('REGISTRO.expedicion'), '2010-05-20', 'se borró la fecha que tecleó');
    assert.equal(P.ev('autorizoEsteIntento()'), true, 'se borró el permiso que dio');
    assert.equal(/borramos|otro celular/.test(caja(P) + P.elems.errReg.textContent), false, 'le dice que cambió de celular, y no lo cambió: ' + texto(caja(P)));
    assert.equal(P.ev('FOTOS.de.celular'), CEL_MARIA, 'su «Continuar» no les puso dueño');
  });

  test('D4 — CON SU CELULAR YA CONFIRMADO: teclea otro sin «Continuar», repite una foto y vuelve al suyo; no se borra nada, ni la contraseña', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    volver(P);                                         // rostro → entrada
    teclear(P, '3001112234');                          // sin «Continuar»
    volver(P); volver(P);                              // entrada → identidad → documento
    /* Sus fotos se ven como suyas: el número tecleado no decide nada todavía. */
    repetirElFrente(P, 'MARIA');
    assert.equal(P.ev('FOTOS.de.celular'), CEL_MARIA, 'la foto quedó a nombre del número tecleado');
    hastaElCelular(P);
    teclear(P, CEL_MARIA);
    cajaEnBlanco(P);
    P.ev("$('rClave').value = ''; $('rClave2').value = ''; siguientePaso();");
    assert.equal(pasoActual(P), 'rostro', 'con su mismo celular confirmado no la dejó seguir: ' + texto(caja(P)));
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA');
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO_MARIA');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE');
    assert.equal(P.ev('CLAVE_EN_MEMORIA'), CLAVE_MARIA, 'se le borró la contraseña de su propio celular');
    assert.equal(/borramos|Cambiaste el celular/.test(caja(P) + P.elems.errReg.textContent), false, 'le dice que cambió de celular: ' + texto(caja(P)));
  });

  test('D4 — LAS FOTOS SE SIGUEN VIENDO SUYAS mientras el número tecleado no pasa «Continuar»; si pasa con otro, se van', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA, CLAVE_MARIA);
    volver(P);
    teclear(P, CEL_PEDRO);
    volver(P); volver(P);
    repetirElFrente(P, 'MARIA');
    hastaElCelular(P);
    teclear(P, CEL_PEDRO);
    P.ev("$('rClave').value = '" + CLAVE_PEDRO + "'; $('rClave2').value = '" + CLAVE_PEDRO + "'; siguientePaso();");
    assert.equal(P.ev('hayContenidoEnFotos()'), false, 'las fotos tomadas antes del cambio se quedaron con el celular nuevo');
    assert.equal(P.ev('autorizoEsteIntento()'), false);
  });
});
