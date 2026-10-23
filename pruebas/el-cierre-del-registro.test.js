'use strict';
/* ==========================================================================
 * EL CIERRE DEL REGISTRO CON LA CÉDULA PRIMERO — 20 de octubre de 2026
 *
 *   node --test pruebas/el-cierre-del-registro.test.js
 *
 * La verificación de la tanda de buena fe (cdd7707) confirmó siete hallazgos
 * (B1-B7). B1 vive en la base y su prueba está en
 * pruebas/la-cedula-de-la-cuenta-postgres.test.js. Aquí van los seis del
 * teléfono, cada uno contado como pasa, con play/index.html corriendo DE VERDAD
 * (pruebas/banco-play.js) y la cédula fabricada (pruebas/fabrica-pdf417.js).
 * Cada prueba con su B en el título falla con la página de cdd7707.
 *
 * Lo que las tandas de antes cerraron sigue cerrado: V1-V7
 * (lo-sensible-no-sale-del-registro.test.js), F4-F15
 * (la-persona-no-el-intento.test.js) y A1-A8 (la-persona-de-buena-fe.test.js)
 * corren igual.
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

/* La página con una cámara en vivo que pide permiso y nunca contesta, un GPS
   que cuenta y un reloj que guarda los temporizadores para correrlos a mano
   (lo mismo que la-persona-de-buena-fe.test.js). */
function abrir(opc) {
  const o = Object.assign({ hash: '#registro' }, opc || {});
  const P = abrirPlay(o);
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.ev('window.__camaras = []; navigator.mediaDevices = { getUserMedia: function (c) { window.__camaras.push(c); return new Promise(function () {}); } };');
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
/* Solo el respaldo: queda en el paso de la cédula, con el respaldo y la lectura. */
function soloElRespaldo(P, ced, quien) {
  P.ev('autorizarYEscanear()');
  camara(P, quien);
  P.ev("ESCDOC.lado = 'reverso'; leidaDoc(" + JSON.stringify(ced) + ', 0)');
  pasa(P, 1500);                       // «¡Leída! Ahora el frente.»
}
function escanear(P, ced, quien) {
  soloElRespaldo(P, ced, quien);
  camara(P, quien);
  P.ev('capturarDoc(true)');
  pasa(P, 1500);                       // «Listo: las dos caras.» → «Revisa tus datos»
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
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566', nequi: '3001112233', cuentas_mias: 'si' }); guardarBorrador(REGISTRO);");
}
/* La nube de mentira: anota cada llamada. `subida` decide qué contesta la base
   a las fotos: por defecto entran todas; 'sin_red' es la petición que no sale;
   'colgada' la que nunca vuelve; un número es ese estado HTTP (401: la sesión
   venció). Se puede cambiar después con window.__subida. */
function nube(P, subida) {
  P.ev('window.__subida = ' + JSON.stringify(subida == null ? null : subida) + ';' +
    `window.__llamadas = [];
    fetch = function (u, op) {
      var c = null; try { c = JSON.parse(op && op.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      var bien = function (r) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };
      var mal = function (s, r) { return Promise.resolve({ ok: false, status: s, json: function () { return Promise.resolve(r); } }); };
      if (/registro_archivos_guardar/.test(String(u))) {
        if (window.__subida === 'sin_red') return Promise.reject(new Error('sin señal'));
        if (window.__subida === 'colgada') return new Promise(function () {});
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
function abrirLaCuenta(P) {
  elResto(P);
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  P.ev('siguientePaso()');
}
function conSesionJs(P) {
  P.ev(SESION_JS);
  P.ev("SCRIPTS[URL_SESION_PLATACHAT] = Promise.resolve();");
}
function boton(html, texto) {
  const re = new RegExp('onclick="([^"]+)"[^>]*>' + texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<');
  const m = re.exec(html);
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}
const nadaDe = (texto, quien) => assert.equal(/_MARIA|MARIA|52\.?123\.?456|RODRIGUEZ/.test(texto), false, quien);

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

describe('B2. el nombre de la cuenta de PlataChat es el de su dueña', () => {

  test('B2 — PLATACHAT SE RELANZA CON LA COLA DE MARÍA Y EL BORRADOR DE BETO EN EL TELÉFONO: la sesión de PlataChat de María no se lleva el nombre de Beto', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    nube(P, 'colgada');                                   // la cuenta se abre; la subida se queda pegada
    abrirLaCuenta(P);
    await asentar();
    assert.ok(JSON.parse(P.almacen.play_fotos_cola || '{}')[CEL_MARIA], 'la cola de su cuenta no quedó guardada');
    /* En el mismo teléfono, Beto abre Tu Garantía, toca «Abrir mi cuenta»,
       escribe a mano su nombre y su documento, y vuelve a la portada: su
       borrador se queda en el teléfono. */
    const B = abrir({ almacen: P.almacen, sesion: {}, hash: '' });
    B.ev('abrirRegistro()');
    B.ev("Object.assign(REGISTRO, { nombres: 'ALBERTO', apellidos: 'GOMEZ RUIZ', tipo_doc: 'Cédula de ciudadanía'," +
         " documento: '80999888', expedicion: '2012-01-10' }); guardarBorrador(REGISTRO); pintarEntrar();");
    assert.match(B.almacen.play_registro_borrador, /ALBERTO/, 'el borrador de Beto no quedó en el teléfono: la prueba no cuenta el caso');
    /* La pestaña de María vuelve (Android no devuelve el sessionStorage): pide
       la contraseña, sube y la lleva a PlataChat. */
    const Q = abrirPlay({ almacen: B.almacen, sesion: {}, search: '?marca=platachat', hash: '' });
    assert.deepEqual(Q.fallos, []);
    assert.match(cuerpo(Q), /Tus fotos todavía no han subido/);
    const ll = nube(Q);
    conSesionJs(Q);
    Q.ev("$('pcClave').value = 'Perro.2026x';");
    Q.ev(boton(cuerpo(Q), 'Subir mis fotos'));
    await asentar();
    assert.equal(subidas(ll).length, 1, 'no subió la cola de su cuenta');
    assert.ok(fueAPlataChat(Q), 'subió y no la llevó a PlataChat');
    const s = Q.almacen.platachat_sesion;
    assert.ok(s, 'no le pasó la sesión a PlataChat');
    assert.equal(/ALBERTO|GOMEZ/.test(s), false, 'la cuenta de PlataChat de María quedó con el nombre de Beto: ' + s);
  });
});

describe('B3. la cédula soltada en el primer paso se avisa', () => {

  /* María, en el paso de la cédula, ya tomó el respaldo (leído) y toca la caja
     del frente; le entra una llamada de quince minutos y Android relanza la
     pestaña. */
  function mariaConElRespaldo(escrito) {
    const P = abrir();
    soloElRespaldo(P, MARIA, 'MARIA');
    assert.equal(pasoActual(P), 'documento');
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO_MARIA');
    if (escrito) P.ev("REGISTRO.correo = 'maria@correo.com'; guardarBorrador(REGISTRO);");
    todoALaHora(P, Date.now() - 15 * 60e3);
    return P;
  }

  test('B3 — CON #registro: el paso de la cédula vuelve vacío y DICE que las borramos', () => {
    const P = mariaConElRespaldo(false);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '#registro' });
    assert.deepEqual(Q.fallos, []);
    assert.equal(Q.ev('FOTOS.cedula_reverso'), undefined, 'la cédula de hace quince minutos sigue en el teléfono');
    assert.equal(Q.ev('PASOS[PASO].id'), 'documento');
    assert.match(caja(Q), /Pasó un rato desde que se tomaron las fotos de la cédula, y por seguridad las borramos/,
      'se le borró la cédula sin una palabra');
    nadaDe(cuerpo(Q), 'el paso pintó algo de la cédula que se soltó');
  });

  test('B3 — SIN EL HASH (el ícono de la app): no cae callada en la portada', () => {
    const P = mariaConElRespaldo(false);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.equal(/¿Ya abriste tu cuenta\?/.test(cuerpo(Q)), false, 'cayó en la portada sin decir que borró su cédula');
    assert.match(caja(Q), /por seguridad las borramos/);
  });

  test('B3 — CON ALGO ESCRITO A MANO: «¿Es tuyo?» → «Seguir» dice que las borramos', () => {
    const P = mariaConElRespaldo(true);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '#registro' });
    assert.match(cuerpo(Q), /¿Es tuyo\?/);
    nadaDe(cuerpo(Q), 'la pregunta enseña algo de la cédula');
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    assert.equal(Q.ev('PASOS[PASO].id'), 'documento');
    assert.match(caja(Q), /por seguridad las borramos/, '«Seguir» no dice por qué no está su cédula');
    assert.equal(Q.ev('REGISTRO.correo'), 'maria@correo.com');
  });
});

describe('B4. la sesión vencida pide la contraseña, no un reintento sin fin', () => {

  test('B4 — PLATACHAT, «VOLVER A INTENTAR SUBIRLAS» UNA HORA DESPUÉS (la base contesta 401): pide la contraseña y sube con ella', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    const ll = nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.match(P.elems.pcAcciones.innerHTML, /Volver a intentar subirlas/);
    /* Llega a su casa con señal, pasada la hora del token del registro. */
    P.ev('window.__subida = 401;');
    P.ev(boton(P.elems.pcAcciones.innerHTML, 'Volver a intentar subirlas'));
    await asentar();
    assert.equal(subidas(ll).length, 2);
    assert.equal(JSON.parse(P.almacen.play_subida_fotos).estado, 'sesion', 'la sesión vencida se anotó como falta de señal');
    assert.match(cuerpo(P), /id="pcClave"/, 'con la sesión vencida no le pide la contraseña: «Volver a intentar» fallaría para siempre');
    assert.match(cuerpo(P), /Tu sesión se venció/);
    assert.ok(JSON.parse(P.almacen.play_fotos_cola || '{}')[CEL_MARIA], 'la cola se soltó por una sesión vencida');
    /* Con la contraseña, suben y se va a PlataChat. */
    P.ev('window.__subida = null;');
    P.ev("$('pcClave').value = 'Perro.2026x';");
    P.ev(boton(cuerpo(P), 'Subir mis fotos'));
    await asentar();
    assert.equal(subidas(ll).length, 3, 'con la contraseña no volvió a subir');
    assert.ok(fueAPlataChat(P));
  });

  test('B4 — …y lo mismo si la pestaña se recarga con la sesión vencida guardada', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    const Q = abrirPlay({ almacen: P.almacen, sesion: P.sesion, search: '?marca=platachat', hash: '' });
    await asentar();
    assert.ok(Q.elems.pcAcciones, 'la recarga no intentó subir la cola');
    nube(Q, 401);
    conSesionJs(Q);
    Q.ev(boton(Q.elems.pcAcciones.innerHTML, 'Volver a intentar subirlas'));
    await asentar();
    assert.match(cuerpo(Q), /id="pcClave"/, 'la recarga con la sesión vencida no pide la contraseña');
  });

  test('B4 — TU GARANTÍA, LA CUENTA CON LA SESIÓN VENCIDA: no ofrece «Subirlas ahora» (fallaría igual), dice que vuelva a entrar', async () => {
    const P = mariaHastaElCelular();
    nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.ok(JSON.parse(P.almacen.play_fotos_cola || '{}')[CEL_MARIA]);
    const M = abrir({ almacen: P.almacen, sesion: {}, hash: '' });
    nube(M, 401);
    M.ev("pintarCuenta({ access_token: 'tok-vencido', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    const a = avisoFotos(M);
    assert.match(a, /Tu sesión se venció/, 'la cuenta no dice por qué no suben: ' + a);
    assert.equal(/Subirlas ahora/.test(a), false, 'ofrece reintentar con una sesión que ya no sirve: ' + a);
    assert.ok(boton(a, 'Volver a entrar'), 'no le da cómo volver a entrar');
  });
});

describe('B5. lo que corrigió a mano sigue aquí', () => {

  test('B5 — CORRIGIÓ SU APELLIDO A MANO y pasó el rato: «Lo que escribiste a mano sigue aquí» es verdad también para la corrección', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20', apellidos: 'RODRÍGUEZ PÉREZ' });
    P.ev("anotarCampo($('f_apellidos'))");
    assert.equal(P.ev('FOTOS.cedula_editado && FOTOS.cedula_editado.apellidos'), true, 'la corrección no quedó marcada: la prueba no cuenta el caso');
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    assert.equal(pasoActual(P), 'rostro');
    todoALaHora(P, Date.now() - 30 * 60e3);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.match(cuerpo(Q), /¿Es tuyo\?/);
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    assert.match(caja(Q), /Lo que escribiste a mano sigue aquí/);
    assert.equal(Q.ev('REGISTRO.apellidos'), 'RODRÍGUEZ PÉREZ', 'el aviso dice que lo escrito a mano sigue aquí, y su corrección se borró');
    /* Lo que el escáner escribió y nadie tocó sí se va con la lectura. */
    assert.equal(Q.ev('REGISTRO.nombres'), undefined);
    assert.equal(Q.ev('REGISTRO.documento'), undefined);
    assert.equal(Q.ev('FOTOS.cedula_frente'), undefined);
  });
});

describe('B6. si el teléfono no guardó la cola, no se promete que la guardó', () => {

  test('B6 — EL TELÉFONO NO DEJA ESCRIBIR LA COLA y la cuenta se abre sin señal: no dice «Siguen guardadas en este teléfono hasta…»', async () => {
    const P = mariaHastaElCelular();
    P.ev("(function () { var guardar = localStorage.setItem; localStorage.setItem = function (k, v) {" +
         " if (k === 'play_fotos_cola') throw new Error('QuotaExceededError'); return guardar.call(localStorage, k, v); }; })()");
    nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.equal(P.almacen.play_fotos_cola, undefined, 'la cola sí se guardó: la prueba no cuenta el caso');
    assert.ok(P.ev("!!colaDe('" + CEL_MARIA + "')"), 'la cola ni siquiera quedó en la memoria de la página');
    const a = avisoFotos(P);
    assert.equal(/Siguen guardadas en este teléfono|cada vez que entras a tu cuenta/.test(a), false,
      'promete que siguen guardadas y que se reintentan al entrar, y solo viven en esta página: ' + a);
    assert.match(a, /No pudimos guardarlas en este teléfono/);
    assert.match(a, /no cierres esta página/);
  });

  test('B6 — …y en PlataChat el final lo dice igual', async () => {
    const P = mariaHastaElCelular({ search: '?marca=platachat' });
    P.ev("(function () { var guardar = localStorage.setItem; localStorage.setItem = function (k, v) {" +
         " if (k === 'play_fotos_cola') throw new Error('QuotaExceededError'); return guardar.call(localStorage, k, v); }; })()");
    nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.match(P.elems.pcSubida.textContent, /no cierres esta página/, 'no avisa que las fotos solo viven en esta página');
  });
});

describe('B7. lo que dejó la versión publicada no se retoma sin preguntar', () => {

  test('B7 — UN REGISTRO A MEDIAS DE LA VERSIÓN PUBLICADA (permiso sin sello, de hace tres horas): sanear no lo vuelve «la vuelta de la cámara»', () => {
    const hace3h = Date.now() - 3 * 3600e3;
    /* Lo que deja e7a3737: fotos con dueño y sin intento, permiso sin sello,
       el paso con el orden viejo y sin nombre, y sin la hora del último toque
       (esa versión no la tenía). */
    const almacen = {
      play_registro_borrador: JSON.stringify({ celular: CEL_MARIA, nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ',
        tipo_doc: 'Cédula de ciudadanía', documento: '52123456', correo: 'maria@correo.com' }),
      play_fotos_borrador: JSON.stringify({ sensibles: true, cedula_reverso: 'data:image/jpeg;base64,RESPALDO_MARIA',
        cedula_frente: 'data:image/jpeg;base64,FRENTE_MARIA',
        cedula_leida: { documento: '0052123456', nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ' },
        de: { celular: CEL_MARIA, t: hace3h } }),
      play_registro_paso: JSON.stringify({ paso: 3, t: hace3h })
    };
    const Q = abrirPlay({ almacen, sesion: {}, hash: '' });
    assert.deepEqual(Q.fallos, []);
    assert.match(cuerpo(Q), /¿Es tuyo\?/, 'retomó sin preguntar el registro de hace tres horas');
    nadaDe(cuerpo(Q), 'pintó la cédula de otra persona');
    assert.equal(/y las fotos que ya habías tomado/.test(caja(Q)), false);
    assert.equal(Q.ev('FOTOS.cedula_frente'), undefined, 'la cédula de hace tres horas sigue en el teléfono');
    assert.equal(/FRENTE_MARIA|RESPALDO_MARIA/.test(JSON.stringify(Q.almacen)), false);
  });
});
