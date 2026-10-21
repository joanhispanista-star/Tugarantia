'use strict';
/* ===========================================================================
 * EL REGISTRO DE play/, DE PUNTA A PUNTA, PARA LAS PRUEBAS — 21-oct-2026
 *
 * Lo que necesitan las pruebas de H1-H4 (la red lenta, la cuenta que sale, el
 * «Salir» de PlataChat y la constancia de la autorización): llenar el
 * registro de María como lo llena una persona (la cédula escaneada, la selfie,
 * la ubicación, las casillas), una nube de mentira que retiene la respuesta
 * que se le pida, y —para la red lenta— un reloj virtual que ordena por hora
 * los temporizadores de la página y las idas y vueltas de la red.
 *
 * Las ayudas de llenar el registro son las de
 * pruebas/la-respuesta-es-de-quien-la-pidio.test.js (G1), en un solo sitio
 * para las pruebas nuevas: una cuarta copia se desincroniza, y un banco
 * desincronizado prueba otra página (ver la cabecera de banco-play.js).
 * ======================================================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { asentar } = require('./esperar.js');
const F = require('./fabrica-pdf417.js');
const U = require('../app/cuenta.js');
const EC = require('../app/escaner-cedula.js');

const SESION_JS = fs.readFileSync(path.join(RAIZ, 'platachat', 'sesion.js'), 'utf8');

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
const RESTO = { ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo', anos_direccion: 'Más de 5 años',
  ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000', dia_pago: 'Quincenal (15 y 30)',
  ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344',
  ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566' };

/* El banco, con la cámara que nunca contesta, el GPS que contesta a pedido y
   los relojes anotados para dispararlos a mano. */
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
const pasoActual = P => P.ev('VISTA === "registro" ? PASOS[PASO].id : VISTA');
const cuerpo = P => P.elems.cuerpo.innerHTML;
const caja = P => P.elems.errReg ? ((P.elems.errReg.innerHTML || '') + ' ' + (P.elems.errReg.textContent || '')) : '';
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
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
function toque(P, cel, c1, c2) {
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));");
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
   ubicación) o escrita a mano, y las dos casillas como se le pida. */
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

/* LA NUBE QUE RETIENE. Anota cada llamada con su método, su cuerpo y su
   cabecera de autorización; retiene las que casen con window.__colgar hasta
   que la prueba las suelte. Las cuentas viven en window.__cuentas
   ({correo: {clave, meta}}): el signup crea (o dice «ya existe»), la entrada
   compara la contraseña y devuelve la metadata, y PUT /auth/v1/user la mezcla
   como GoTrue. `resp` (opcional) contesta a mano: {regex: cuerpo}. */
function nube(P) {
  P.ev(`window.__llamadas = []; window.__colgadas = []; window.__cuentas = window.__cuentas || {}; window.__resp = window.__resp || [];
    fetch = function (u, op) {
      u = String(u);
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      var h = (op && op.headers) || {};
      var metodo = (op && op.method) || 'GET';
      window.__llamadas.push({ url: u, metodo: metodo, cuerpo: c, auth: String(h.Authorization || '') });
      var R = function (r, ok, st) { return { ok: ok !== false, status: st || (ok === false ? 400 : 200), json: function () { return Promise.resolve(r); } }; };
      var contestar = function () {
        for (var i = 0; i < window.__resp.length; i++) if (window.__resp[i][0].test(u)) return R(window.__resp[i][1]);
        var tok = function (correo) { return { access_token: 'tok-' + correo + '-' + window.__llamadas.length, refresh_token: 'ref', expires_in: 3600,
          user: { email: correo, user_metadata: JSON.parse(JSON.stringify(window.__cuentas[correo].meta || {})) } }; };
        if (/auth\\/v1\\/signup/.test(u)) {
          if (window.__cuentas[c.email]) return R({ msg: 'User already registered' }, false, 422);
          window.__cuentas[c.email] = { clave: c.password, meta: JSON.parse(JSON.stringify(c.data || {})) };
          return R(tok(c.email));
        }
        if (/auth\\/v1\\/token/.test(u)) {
          var cu = window.__cuentas[c && c.email];
          if (!cu || cu.clave !== c.password) return R({ error: 'invalid_grant' }, false, 400);
          return R(tok(c.email));
        }
        if (/auth\\/v1\\/user/.test(u) && metodo === 'PUT') {
          if (window.__constanciaFalla) return R({ msg: 'falló' }, false, 500);
          var correo = String(h.Authorization || '').replace(/^Bearer tok-/, '').replace(/-\\d+$/, '');
          var cta = window.__cuentas[correo];
          if (cta && c && c.data) Object.keys(c.data).forEach(function (k) { cta.meta[k] = c.data[k]; });
          return R({ email: correo, user_metadata: cta ? cta.meta : {} });
        }
        if (/registro_archivos_guardar/.test(u)) return R({ ok: true, guardados: Object.keys((c && c.p_archivos) || {}) });
        if (/registro_vivo_publicar/.test(u)) return R({ ok: true, testigo: 'tst' });
        if (/rpc\\/mi_cuenta/.test(u)) return R({ ok: true, vinculada: false });
        return R({ ok: true });
      };
      if (window.__colgar && window.__colgar.test(u)) {
        return new Promise(function (res, rej) {
          window.__colgadas.push({ url: u, c: c, auth: String(h.Authorization || ''),
            soltar: function (r, ok) { res(r === undefined ? contestar() : R(r, ok)); }, cortar: function () { rej(new Error('corte')); } });
        });
      }
      return Promise.resolve(contestar());
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
const colgadas = P => JSON.parse(P.ev('JSON.stringify(window.__colgadas.map(function (x) { return x.url; }))'));
/* Suelta la i-ésima retenida: con `r` contesta eso; sin `r`, lo que diría la nube. */
function soltar(P, i, r, ok) {
  P.ev('window.__colgadas[' + i + '].soltar(' + (r === undefined ? 'undefined' : JSON.stringify(r)) + ', ' + (ok === false ? 'false' : 'true') + ')');
}
function cuentaDe(P, correo, clave, meta) {
  P.ev('window.__cuentas = window.__cuentas || {}; window.__cuentas[' + JSON.stringify(correo) + '] = { clave: ' + JSON.stringify(clave) +
       ', meta: ' + JSON.stringify(meta || {}) + ' };');
}
/* Entra por la portada con ese celular y esa contraseña. */
async function entrarComo(P, cel, clave) {
  P.ev("$('inTel').value = " + JSON.stringify(U.telefonoBonito(cel)) + "; $('inClave').value = " + JSON.stringify(clave) + '; entrar();');
  await asentar(20);
}

module.exports = {
  RAIZ, SESION_JS, MARIA, CEL_MARIA, CEL_PEDRO, CLAVE_MARIA, CLAVE_PEDRO, CORREO_MARIA, CORREO_PEDRO,
  DATOS_MARIA, CONTACTO_MARIA, RESTO, abrir, pasa, pasoActual, cuerpo, caja, texto, boton, tocar,
  escanear, casillas, toque, selfie, mariaHastaElPermiso, nube, colgadas, soltar, cuentaDe, entrarComo, asentar
};
