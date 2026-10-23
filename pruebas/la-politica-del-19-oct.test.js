'use strict';
/* ==========================================================================
 * LA POLÍTICA DEL 19-OCT DICE LO QUE HACE EL CÓDIGO DEL 19-OCT
 *
 *   node --test pruebas/la-politica-del-19-oct.test.js
 *
 * Dos commits del 19-oct-2026 volvieron falsa legal/privacidad.html sin tocar
 * una letra de ella:
 *   · b508c96, la cédula va primero. La autorización de las fotos y la
 *     ubicación dejó de ser una casilla: es el botón «📷 Autorizo y escaneo mi
 *     cédula», con «Prefiero escribir mis datos» al lado. El avance se publica
 *     después del paso del celular, que ya no es el primero, y la ubicación se
 *     pide en el paso del rostro. La política decía «paso 2», «casilla» y «al
 *     registrarte».
 *   · 706146a, el teléfono dice cuál es. El navegador informa el modelo, y la
 *     política decía «no los manda tu celular».
 * Cada frase nueva se amarra aquí al código que la hace verdad. Cuando el
 * código vuelva a cambiar, que lo diga esta prueba y no un cliente con la
 * política en la mano. Las que corren la página usan pruebas/banco-play.js.
 *
 * Lo más caro de equivocar, y por eso va de primero: la política promete que
 * la autorización se QUITA en el último paso y que entonces no sale ninguna
 * foto ni la ubicación. Ninguna prueba lo corría hasta hoy.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay, RAIZ } = require('./banco-play.js');
const { asentar } = require('./esperar.js');
const F = require('./fabrica-pdf417.js');
const U = require('../app/cuenta.js');
const EC = require('../app/escaner-cedula.js');
const A = require('../app/aparato.js');
const IP = require('../app/ubicacion-ip.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const blanco = s => s.replace(/[^\n]/g, ' ');
const sinComentarios = t => String(t)
  .replace(/<!--[\s\S]*?-->/g, blanco)
  .replace(/\/\*[\s\S]*?\*\//g, blanco)
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + blanco(m.slice(a.length)));
const visible = html => sinComentarios(html)
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');

const PRIV = leer('legal/privacidad.html');
const P_VIS = visible(PRIV);
const PLAY = sinComentarios(leer('play/index.html'));
const SOCIO = sinComentarios(leer('app/socio.html'));
/* Una fila de la tabla de datos, por el texto de su primera celda. */
function fila(etiqueta) {
  const tr = [...PRIV.matchAll(/<tr><td>([\s\S]*?)<\/tr>/g)].map(m => m[1])
    .find(t => t.replace(/<[^>]+>/g, '').indexOf(etiqueta) >= 0);
  assert.ok(tr, 'la tabla de datos perdió la fila «' + etiqueta + '»');
  return [...('<td>' + tr).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}
const seccion = id => visible((PRIV.match(new RegExp('<section id="' + id + '">([\\s\\S]*?)<\\/section>')) || [])[1] || '');

/* La cédula fabricada de pruebas/la-cedula-primero.test.js: nadie de verdad. */
const CEDULA = (() => {
  const b = F.registroCedula({ documento: '0052123456', apellido1: 'RODRIGUEZ', apellido2: 'PEREZ',
    nombre1: 'MARIA', nombre2: 'JOSE', sexo: 'F', nacimiento: '19880312', rh: 'A+' });
  let t = '';
  for (const x of b) t += String.fromCharCode(x);
  return EC.cedulaDelTexto(U.leerCedulaPDF417, t);
})();
const CEL = '3001112233';

/* La página con cámara de mentira, un GPS que contesta y un reloj a mano
   (el banco no tiene reloj). Igual que en la-cedula-primero.test.js. */
function abrir() {
  const P = abrirPlay({ hash: '#registro' });
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.ev('window.__camaras = []; navigator.mediaDevices = { getUserMedia: function (c) { window.__camaras.push(c); return new Promise(function () {}); } };');
  P.ev('window.__gps = 0; navigator.geolocation = { getCurrentPosition: function (ok) { window.__gps++;' +
       ' ok({ coords: { latitude: 4.6097, longitude: -74.0817, accuracy: 12 } }); } };');
  P.ev('window.__relojes = []; setTimeout = function (f, ms) { window.__relojes.push({ f: f, ms: ms }); return window.__relojes.length; }; clearTimeout = function () {};');
  P.ev('var __ce = document.createElement; document.createElement = function (t) { return t === "link" ? { tag: "link" } : __ce.call(document, t); };' +
       'document.head.appendChild = function () {};');
  return P;
}
function pasa(P, ms) {
  P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === ' + ms + '; });' +
       ' if (i < 0) throw new Error("no hay temporizador de ' + ms + ' ms"); var r = window.__relojes.splice(i, 1)[0]; r.f(); })()');
}
const pasoActual = P => P.ev('PASOS[PASO].id');
/* Toca «Autorizo y escaneo», lee el respaldo, toma el frente; revisa los
   datos; pone celular y contraseña; en el rostro sigue sin selfie (ahí se pide
   la ubicación). Queda en «Cómo te contactamos» con dos fotos y un GPS. */
function hastaDespuesDelRostro(P) {
  P.ev('autorizarYEscanear()');
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO'); };");
  P.ev('leidaDoc(' + JSON.stringify(CEDULA) + ', 0)');
  pasa(P, 1500);
  P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
  P.ev('capturarDoc(true)');
  pasa(P, 1500);
  P.ev("U.camposDelGrupo('identidad').forEach(function (c) { if (c.id === 'celular') return;" +
       " $('f_' + c.id).value = REGISTRO[c.id] === undefined ? '' : String(REGISTRO[c.id]); });" +
       "$('f_expedicion').value = '2010-05-20'; siguientePaso();");
  assert.equal(pasoActual(P), 'entrada');
  P.ev("$('rTel').value = '" + CEL + "'; anotarCelular($('rTel'));" +
       "$('rClave').value = 'Perro.2026x'; $('rClave2').value = 'Perro.2026x'; siguientePaso();");
  assert.equal(pasoActual(P), 'rostro');
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'contacto');
}
/* La nube de mentira: anota cada llamada y contesta bien. */
function nube(P) {
  P.ev(`window.__llamadas = [];
    fetch = function (u, o) {
      var c = null; try { c = JSON.parse(o && o.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      var r = /auth\\/v1\\/signup/.test(String(u))
        ? { access_token: 'tok-nuevo', refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } }
        : /registro_archivos_guardar/.test(String(u)) ? { ok: true, guardados: ['cedula_reverso', 'cedula_frente'] }
        : { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
/* El último paso: la casilla general marcada, la de las fotos como se pida. */
function abrirLaCuenta(P, conFotos) {
  P.ev("Object.assign(REGISTRO, { correo: 'maria@correo.com', ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo'," +
       " anos_direccion: 'Más de 5 años', ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000'," +
       " dia_pago: 'Quincenal (15 y 30)', ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344'," +
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566', nequi: '3001112233', cuentas_mias: 'si' }); guardarBorrador(REGISTRO);");
  P.ev("pintarRegistro(indiceDe('permiso'))");
  /* Lo que la persona ve antes de tocar nada: la casilla de las fotos marcada,
     porque tocó «Autorizo y escaneo». Es la que la política dice que puede quitar. */
  assert.match(P.ev('pasoPermiso()'), /id="autSensible" checked/,
    'el último paso no muestra marcada la autorización que dio con el botón: no hay qué quitar');
  P.ev("$('autGeneral').checked = true; $('autSensible').checked = " + (conFotos ? 'true' : 'false') + '; siguientePaso();');
}

/* ======================================================================== */
describe('1. la autorización de las fotos y la ubicación: un botón, y se puede quitar al final', () => {

  test('QUITARLA EN EL ÚLTIMO PASO: no sale ninguna foto ni la ubicación, y la constancia dice que no', async () => {
    /* El control primero: sin quitarla, las fotos y el GPS SÍ salen. Sin esto,
       una subida rota en otra parte haría pasar la prueba de abajo sin medir nada. */
    const C = abrir();
    hastaDespuesDelRostro(C);
    assert.ok(C.ev('FOTOS.gps && FOTOS.gps.lat'), 'el paso del rostro no tomó la ubicación: el control no mediría nada');
    const llC = nube(C);
    abrirLaCuenta(C, true);
    await asentar();
    const subioC = llC().find(x => /registro_archivos_guardar/.test(x.url));
    assert.ok(subioC, 'con la autorización puesta no subió nada: la prueba de abajo no estaría midiendo');
    assert.ok(subioC.cuerpo.p_huella.gps, 'con la autorización puesta la ubicación no viajó');

    const P = abrir();
    hastaDespuesDelRostro(P);
    assert.equal(P.ev("hayFotoLista('cedula_reverso')"), true);
    const ll = nube(P);
    abrirLaCuenta(P, false);
    await asentar();
    const llamadas = ll();
    assert.ok(llamadas.some(x => /auth\/v1\/signup/.test(x.url)), 'la cuenta no se abrió sin la autorización: la política dice que se abre igual');
    assert.equal(llamadas.filter(x => /registro_archivos_guardar/.test(x.url)).length, 0,
      'quitó la autorización en el último paso y las fotos subieron igual');
    const todo = JSON.stringify(llamadas);
    assert.ok(!/RESPALDO|FRENTE/.test(todo), 'una foto de la cédula salió en alguna llamada');
    assert.ok(!/4\.6097|-74\.0817/.test(todo), 'la ubicación salió en alguna llamada');
    const cuenta = llamadas.find(x => /auth\/v1\/signup/.test(x.url));
    assert.equal(cuenta.cuerpo.data.autorizacion.sensibles, false, 'la constancia dice que autorizó las fotos');
    assert.equal(cuenta.cuerpo.data.autorizacion.version, U.VERSION_AUTORIZACION);
    /* «se borran de tu celular»: ni en memoria ni en el borrador. */
    assert.equal(P.ev('FOTOS.cedula_reverso || FOTOS.cedula_frente || FOTOS.gps || null'), null, 'las fotos siguen en el teléfono');
    assert.ok(!/RESPALDO|FRENTE|4\.6097/.test(String(P.almacen.play_fotos_borrador || '')), 'las fotos siguen guardadas en el teléfono');
  });

  test('el botón y la salida que nombra la política son los que pinta el primer paso', () => {
    const P = abrir();
    assert.equal(pasoActual(P), 'documento', 'el registro ya no empieza por la cédula y la política dice que sí');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, />📷 Autorizo y escaneo mi cédula<\/button>/);
    assert.match(h, />Prefiero escribir mis datos<\/button>/);
    const s = seccion('sensibles');
    assert.match(s, /la das tocando «Autorizo y escaneo mi cédula» en el primer paso del registro/);
    assert.match(s, /la puedes quitar en el último paso, antes de abrir tu cuenta/);
    assert.match(s, /si tocas «Prefiero escribir mis datos», tu cuenta se abre igual y la cámara no se enciende para esto/);
    /* «la cámara no se enciende»: escoger escribir no pide la cámara. */
    P.ev('prefieroEscribirMisDatos()');
    assert.equal(P.ev('window.__camaras.length'), 0, '«Prefiero escribir mis datos» encendió la cámara');
    assert.ok(!P.ev('FOTOS.sensibles'), '«Prefiero escribir mis datos» dio la autorización');
  });

  test('ya no habla de la casilla del registro, ni del «paso 1» o el «paso 2»', () => {
    assert.ok(!/su propia casilla|si marcas la casilla|marcaste la casilla|si no la marcas/i.test(P_VIS),
      'la política vuelve a hablar de la casilla de las fotos del registro, que desde el 19-oct es un botón');
    assert.ok(!/\bpaso [12]\b/i.test(P_VIS), 'la política vuelve a numerar los pasos del registro: el orden cambió el 19-oct');
    assert.match(fila('La foto de tu cédula, la de tu cara')[1], /con su propia autorización, aparte de la general/);
  });

  test('en la app del socio sí hay casilla, y la política lo dice ahí', () => {
    /* La única casilla que queda es la de completar el perfil en app/socio.html. */
    const f = SOCIO.slice(SOCIO.indexOf('function pantallaAutorizacion('), SOCIO.indexOf('function revisarAutorizacion('));
    assert.match(f, /<input type="checkbox" id="autSensible"/, 'socio.html ya no tiene casilla para la selfie y la política dice que sí');
    assert.match(seccion('sensibles'), /Si completas tu perfil desde la app[^.]*\.[^.]*es una casilla aparte, también opcional/);
  });
});

/* ======================================================================== */
describe('2. el avance, la ubicación y la cédula leída, en el orden nuevo', () => {

  test('el avance se manda después del paso del celular, y antes van la cédula y la revisión', () => {
    const f = fila('Tu avance mientras te registras');
    assert.match(f[1], /Se manda después de que escribes tu celular y tu contraseña y tocas «Continuar» en ese paso/);
    assert.match(f[1], /Antes de ese paso \(la foto de tu cédula y la revisión de tus datos\) no se manda nada/);
    assert.equal(f[2], 'Después del paso de tu celular');
    /* Lo que hace que sea verdad: el orden de los pasos y la reja por NOMBRE
       (que no se publique antes lo corre vitrina.test.js, paso por paso). */
    const P = abrir();
    assert.ok(P.ev("indiceDe('documento') < indiceDe('entrada') && indiceDe('identidad') < indiceDe('entrada')"),
      'la cédula o la revisión ya no van antes del celular, y la política dice que sí');
    assert.equal(P.ev("PASOS[indiceDe('entrada')].titulo"), 'Tu celular y tu contraseña');
    assert.match(PLAY, /if \(!\(PASO > indiceDe\('entrada'\)\) \|\| !REGISTRO\.celular \|\| !vioAvisoVivo\(\)\) return Promise\.resolve\(\);/,
      'publicarAvance ya no espera al paso del celular');
  });

  test('la ubicación se pide en el paso del rostro, no en el de la cédula', () => {
    assert.match(seccion('sensibles'), /en el paso de la foto de tu cara tu celular nos dice una sola vez dónde estás/);
    const P = abrir();
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('window.__gps'), 0, 'la cédula pidió la ubicación y la política dice que se pide en el rostro');
    P.ev("pintarRegistro(indiceDe('rostro')); siguientePaso();");
    assert.equal(P.ev('window.__gps'), 1, 'el paso del rostro no pidió la ubicación');
  });

  test('la cédula leída llena el formulario, y se guarda lo leído y qué corregiste', () => {
    const s = seccion('sensibles');
    assert.match(s, /te dejamos escritos tus nombres, tus apellidos y tu número de documento, y tú solo corriges/);
    assert.match(s, /y qué datos corregiste/);
    assert.ok(!/los comparamos con lo que escribiste/.test(s), 'vuelve a decir que la persona escribió lo que la app llenó');
    assert.match(PLAY, /var CAMPOS_DE_LA_CEDULA = \['nombres', 'apellidos', 'documento'\];/,
      'la cédula llena otros campos que los que nombra la política');
    /* 20-oct-2026, revisión — la subida manda el LOTE de la cuenta (la memoria
       se vacía al crearla): ver subirArchivosRegistro. */
    assert.match(PLAY, /huella\.cedula_editado = (FOTOS|lote)\.cedula_editado/, 'ya no sube qué corrigió, y la política dice que sí');
  });
});

/* ======================================================================== */
describe('3. los datos técnicos: unos los anota el servidor, otros los informa el celular', () => {

  test('la fila dice quién informa qué, y en qué tres momentos', () => {
    const f = fila('Los datos técnicos de tu celular y de tu conexión');
    assert.match(f[0], /al registrarte, al pedir y al aceptar/);
    assert.match(f[0], /marca y modelo del celular, versión del sistema y del navegador/);
    assert.match(f[1], /La IP y lo que anuncia tu navegador los anota nuestro servidor de la propia conexión/);
    assert.match(f[1], /los informa el navegador de tu celular/);
    assert.match(f[1], /En iPhone el modelo no se puede saber/);
    assert.match(f[1], /no deciden nada por sí solos/);
    assert.ok(!/no los manda tu celular/i.test(P_VIS), 'volvió «no los manda tu celular», y desde el 19-oct el navegador informa el modelo');
  });

  test('los tres momentos son los del código: registro, solicitud y aceptación', () => {
    /* 21-oct-2026 — con o sin la sesión que pidió (H2: anotarAparato('solicitud', ses)). */
    ['registro', 'solicitud', 'aceptacion'].forEach(c =>
      assert.ok(new RegExp("anotarAparato\\('" + c + "'(, ses)?\\)").test(PLAY), 'play/ ya no anota el aparato en «' + c + '» y la política dice que sí'));
    assert.ok(SOCIO.indexOf("anotarAparatoSocio('solicitud')") >= 0, 'la app del socio ya no anota el aparato al pedir');
  });

  test('el modelo lo informa el navegador; en iPhone no hay, y se dice por qué', async () => {
    const android = await A.leerAparato({
      navegador: { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
                   maxTouchPoints: 5, userAgentData: { getHighEntropyValues: () => Promise.resolve({ platform: 'Android', model: 'SM-A155M', platformVersion: '14.0.0' }) } } });
    assert.equal(android.modelo, 'SM-A155M');
    assert.equal(android.fuente_modelo, 'client_hints', 'el modelo no salió de lo que informa el navegador');
    const iphone = await A.leerAparato({
      navegador: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 } });
    assert.equal(iphone.modelo, null, 'en iPhone se mandó un modelo, y la política dice que no se puede saber');
    assert.equal(iphone.sin_modelo, 'apple_no_lo_entrega');
  });
});

/* ======================================================================== */
describe('4. lo demás que la política dice desde el 19-oct', () => {

  test('la IP por ipwho.is: desde la versión del 15-oct en adelante, y no antes', () => {
    assert.match(P_VIS, /aceptando esta política en su versión del 15 de octubre de 2026 o en una posterior; la de quien se registró antes, no/);
    assert.equal(IP.autorizaUbicacion({ autorizacion_version: '2026-10-15' }), true);
    assert.equal(IP.autorizaUbicacion({ autorizacion_version: U.VERSION_AUTORIZACION }), true,
      'quien acepta la versión de hoy no queda autorizando la consulta que la política le describe');
    assert.equal(IP.autorizaUbicacion({ autorizacion_version: '2026-08-11' }), false);
    assert.equal(IP.autorizaUbicacion({}), false);
  });

  test('el equipo te puede escribir por el chat de la app, y la política y la app lo dicen', () => {
    assert.match(leer('panel/crm.html'), /Escribirle por la app/, 'el CRM ya no escribe primero por la app: sobra en la política');
    assert.match(seccion('para'), /Escribirte por WhatsApp, por el chat de la app o por correo/);
    const f = SOCIO.slice(SOCIO.indexOf('function pantallaAutorizacion('), SOCIO.indexOf('function revisarAutorizacion('));
    assert.match(f, /escribirte por WhatsApp o por el chat de la app sobre tus pagos\. Nada más\./);
  });

  test('la versión que se acepta es la de la fecha publicada, y «Lo que cambió» la nombra', () => {
    assert.equal(U.VERSION_AUTORIZACION, '2026-10-19');
    assert.match(PRIV, /Última actualización: 19 de octubre de 2026/);
    const s = seccion('cambios');
    assert.match(s, /Lo que cambió el 19 de octubre de 2026:/);
    assert.match(s, /Esta versión rige desde el 19 de octubre de 2026/);
  });
});
