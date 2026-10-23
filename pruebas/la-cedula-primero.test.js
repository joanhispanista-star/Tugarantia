'use strict';
/* ==========================================================================
 * LA CÉDULA VA PRIMERO — 19 de octubre de 2026
 *
 *   node --test pruebas/la-cedula-primero.test.js
 *
 * Joan: «quiero que lo primero que aparezca al momento de que un cliente se
 * registre sea el escanear la cédula para que el sistema tome automáticamente
 * toda la información de la cédula y se diligencie automáticamente, y que el
 * cliente solo tenga que corregir en caso de que el sistema falle».
 *
 * El escáner y el autollenado ya existían; estaban detrás del celular, dos
 * contraseñas y una casilla. Lo que estas pruebas cuidan es lo que el orden
 * nuevo podía romper, y todas corren play/index.html DE VERDAD
 * (pruebas/banco-play.js):
 *
 *   1. el registro abre en la cédula, con un solo botón que autoriza y escanea,
 *      y ese botón NUNCA autoriza sin que lo toquen;
 *   2. «Prefiero escribir mis datos» lleva al formulario vacío: la cuenta no
 *      se condiciona a las fotos;
 *   3. respaldo, frente, y el registro pasa solo a «Revisa tus datos», lleno;
 *   4. LAS FOTOS SIN DUEÑO: se toman antes del celular y tienen que subir con
 *      él (el defecto del 21-sep era una foto que decía «Listo» y no subía);
 *      las viejas o de otro intento no suben;
 *   5. cambiar el celular no borra lo escaneado, y el teléfono prestado lo
 *      cubre «¿Eres …?»; 20-oct-2026, otro celular — YA NO: si el celular
 *      cambia a mitad del registro es otra persona, y lo escaneado se borra
 *      (pruebas/el-celular-es-la-persona.test.js). «¿Eres …?» queda para la
 *      cédula de más de una hora sin celular;
 *   6. PlataChat, que usa el mismo registro.
 *
 * Ninguna cédula de nadie: la cédula es fabricada (pruebas/fabrica-pdf417.js).
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

/* Lo que el lector deja en la página al leer el respaldo: el texto del PDF417
   pasado por EC.cedulaDelTexto, que ya le quitó el sexo y el RH. */
const CEDULA = (() => {
  const b = F.registroCedula({ documento: '0052123456', apellido1: 'RODRIGUEZ', apellido2: 'PEREZ',
    nombre1: 'MARIA', nombre2: 'JOSE', sexo: 'F', nacimiento: '19880312', rh: 'A+' });
  let t = '';
  for (const x of b) t += String.fromCharCode(x);
  const crudo = U.leerCedulaPDF417(t);
  assert.equal(crudo.sexo, 'F', 'la cédula fabricada no trae el sexo: la prueba no mediría que se descarta');
  return EC.cedulaDelTexto(U.leerCedulaPDF417, t);
})();
const CEL = '3001112233';
const SESION_JS = fs.readFileSync(path.join(RAIZ, 'platachat', 'sesion.js'), 'utf8');

/* La página con una cámara que pide permiso y nunca contesta (anota lo que se
   le pidió), un GPS que cuenta las veces que se le pregunta, y un reloj que
   guarda los temporizadores para correrlos a mano: el banco no tiene reloj. */
function abrir(opc) {
  const P = abrirPlay(Object.assign({ hash: '#registro' }, opc || {}));
  assert.deepEqual(P.fallos, [], 'la página reventó al cargar');
  P.ev('window.__camaras = []; navigator.mediaDevices = { getUserMedia: function (c) { window.__camaras.push(c); return new Promise(function () {}); } };');
  P.ev('window.__gps = 0; navigator.geolocation = { getCurrentPosition: function () { window.__gps++; } };');
  P.ev('window.__relojes = []; setTimeout = function (f, ms) { window.__relojes.push({ f: f, ms: ms }); return window.__relojes.length; }; clearTimeout = function () {};');
  P.ev('window.__links = []; var __ce = document.createElement; document.createElement = function (t) { return t === "link" ? { tag: "link" } : __ce.call(document, t); };' +
       'document.head.appendChild = function (e) { if (e && e.tag === "link") window.__links.push(e.href); };');
  return P;
}
/* Corre el primer temporizador de esa duración, como si hubiera pasado. */
function pasa(P, ms) {
  P.ev('(function () { var i = window.__relojes.findIndex(function (r) { return r.ms === ' + ms + '; });' +
       ' if (i < 0) throw new Error("no hay temporizador de ' + ms + ' ms"); var r = window.__relojes.splice(i, 1)[0]; r.f(); })()');
}
const pasoActual = P => P.ev('PASOS[PASO].id');
const cuerpo = P => P.elems.cuerpo.innerHTML;

/* El escáner en vivo: toca el botón, lee el respaldo (lo que hace leidaDoc
   cuando el lector devuelve la cédula), pasa al frente, lo toma, y espera lo
   que espera la pantalla. Cada foto queda con su nombre para saber cuál es. */
function escanear(P, opc) {
  const o = opc || {};
  P.ev('autorizarYEscanear()');
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO'); };");
  P.ev('leidaDoc(' + JSON.stringify(CEDULA) + ', 0)');
  pasa(P, 1500);                     // «¡Leída, MARIA! Ahora el frente.»
  if (o.soloRespaldo) return;
  P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
  P.ev('capturarDoc(true)');
  pasa(P, 1500);                     // «Listo: las dos caras.»
}
/* Lo que el navegador tiene en las casillas de un paso: el banco no tiene DOM,
   así que se ponen a mano, con lo que la página pintó. */
function casillas(P, grupo, cambios) {
  P.ev("U.camposDelGrupo('" + grupo + "').forEach(function (c) { if (c.id === 'celular') return;" +
       " $('f_' + c.id).value = REGISTRO[c.id] === undefined ? '' : String(REGISTRO[c.id]); });");
  Object.keys(cambios || {}).forEach(k => P.ev("$('f_" + k + "').value = " + JSON.stringify(cambios[k]) + ";"));
}
function celularYClave(P, cel) {
  P.ev("$('rTel').value = " + JSON.stringify(cel) + "; anotarCelular($('rTel'));" +
       "$('rClave').value = 'Perro.2026x'; $('rClave2').value = 'Perro.2026x'; siguientePaso();");
}
/* Lo que falta para abrir la cuenta, de los pasos que no son de esta prueba. */
function elResto(P) {
  P.ev("Object.assign(REGISTRO, { correo: 'maria@correo.com', ciudad: 'Bogotá', barrio: 'Centro', tipo_vivienda: 'Arriendo'," +
       " anos_direccion: 'Más de 5 años', ocupacion: 'Empleado', ingreso_mes: '2000000', gastos_mes: '800000'," +
       " dia_pago: 'Quincenal (15 y 30)', ref1_nombre: 'Luz', ref1_parentesco: 'Hermana', ref1_celular: '3002223344'," +
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566', nequi: '3001112233', cuentas_mias: 'si' }); guardarBorrador(REGISTRO);");
}
/* La nube de mentira: anota cada llamada y contesta bien. La cuenta nace con
   el correo que se le pidió (el del celular del registro), como la de verdad. */
function nube(P) {
  P.ev(`window.__llamadas = [];
    fetch = function (u, o) {
      var c = null; try { c = JSON.parse(o && o.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      var r = /auth\\/v1\\/signup/.test(String(u))
        ? { access_token: 'tok-nuevo', refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } }
        : /registro_archivos_guardar/.test(String(u)) ? { ok: true, guardados: ['cedula_reverso', 'cedula_frente', 'selfie'] }
        : { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
/* El último paso con las dos casillas marcadas, y «Abrir mi cuenta». */
function abrirLaCuenta(P) {
  elResto(P);
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  P.ev('siguientePaso()');
}
/* De la cédula a «Revisa tus datos», de ahí al celular. */
function hastaElRostro(P, cel) {
  escanear(P);
  casillas(P, 'identidad', { expedicion: '2010-05-20' });
  P.ev('siguientePaso()');
  assert.equal(pasoActual(P), 'entrada');
  celularYClave(P, cel || CEL);
  assert.equal(pasoActual(P), 'rostro');
}

describe('1. el registro abre en la cédula, y el botón autoriza solo si lo tocan', () => {

  test('EL ORDEN: la cédula, revisar los datos, el celular y la contraseña, el rostro, y lo demás igual', () => {
    const P = abrir();
    /* 22-oct-2026 — con «¿Dónde te enviamos la plata?» (cobro) después de
       «De qué vives»: son diez. */
    assert.equal(P.ev('PASOS.map(function (p) { return p.id; }).join()'),
      'documento,identidad,entrada,rostro,contacto,domicilio,ingresos,cobro,referencias,permiso');
    assert.equal(P.ev('VISTA'), 'registro');
    assert.equal(pasoActual(P), 'documento', 'el registro no abre en la cédula');
    const h = cuerpo(P);
    assert.match(h, /Paso 1 de 10[\s\S]*Tu cédula/);
    assert.match(h, /Escanea tu cédula y llenamos tus datos por ti/);
    assert.equal(/id="rTel"|id="rClave"/.test(h), false, 'el primer paso volvió a pedir el celular o la contraseña');
  });

  test('UN SOLO BOTÓN, con el texto de la autorización de datos sensibles A LA VISTA encima', () => {
    const P = abrir();
    const h = cuerpo(P);
    const texto = h.indexOf('Autorizo la foto de mi cédula, la de mi rostro y mi ubicación');
    const boton = h.indexOf('id="btnAutorizoEscaneo"');
    assert.ok(texto >= 0, 'el texto de la autorización no está a la vista');
    assert.ok(boton > texto, 'el botón va antes del texto que autoriza: se tocaría sin haberlo leído');
    assert.match(h, /id="btnAutorizoEscaneo" onclick="autorizarYEscanear\(\)">📷 Autorizo y escaneo mi cédula<\/button>/);
    assert.match(h, /Son datos sensibles: esto es aparte y es opcional/);
    assert.match(h, /Al tocar «Autorizo y escaneo mi cédula» nos das este permiso/, 'no dice que tocarlo ES la autorización');
    assert.match(h, /Tu cuenta se abre igual sin darlo/);
    assert.equal(/id="autFotos"|type="checkbox"/.test(h), false, 'volvió la casilla: Joan decidió un solo botón');
    /* «Igual de visible»: un botón de verdad, no un enlace pálido. */
    assert.match(h, /<button class="btn sec" type="button" id="btnEscribirDatos"[^>]*onclick="prefieroEscribirMisDatos\(\)">Prefiero escribir mis datos<\/button>/);
    assert.match(h, /cédula de extranjería o pasaporte/);
  });

  test('EL BOTÓN NUNCA AUTORIZA SIN TOCARLO: ni al abrir, ni al recargar, ni pasando por todos los pasos', () => {
    const P = abrir();
    assert.match(cuerpo(P), /id="btnAutorizoEscaneo"/, 'el primer paso no ofrece el botón: esta prueba no mediría nada');
    assert.ok(!P.ev('FOTOS.sensibles'), 'la autorización de datos sensibles salió marcada de fábrica');
    assert.equal(P.ev('window.__camaras.length'), 0, 'la cámara se pidió sin que nadie tocara el botón');
    const Q = abrirPlay({ almacen: P.almacen, sesion: P.sesion, hash: '#registro' });
    assert.ok(!Q.ev('FOTOS.sensibles'), 'una recarga la marcó');
    const n = Q.ev('PASOS.length');
    for (let i = n - 1; i >= 0; i--) Q.ev('pintarRegistro(' + i + ')');
    assert.ok(!Q.ev('FOTOS.sensibles'), 'pasar por los pasos la marcó');
    assert.equal(/id="autSensible" checked/.test(Q.ev('pasoPermiso()')), false,
      'la casilla de las fotos del último paso sale marcada sin que la persona haya autorizado nada');
    assert.equal(/"sensibles":true/.test(String(Q.almacen.play_fotos_borrador || '')), false);
  });

  test('TOCARLO es la autorización (la misma marca de la casilla) y abre la cámara de una, por el respaldo', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('FOTOS.sensibles'), true, 'tocar el botón no quedó como autorización');
    assert.match(String(P.almacen.play_fotos_borrador || ''), /"sensibles":true/, 'la autorización no quedó guardada: una recarga la pierde');
    assert.equal(P.ev('window.__camaras.length'), 1, 'la cámara no se abrió de una');
    assert.equal(P.ev('window.__camaras[0].video.facingMode.ideal'), 'environment', 'abrió la cámara de la cara, no la de atrás');
    assert.equal(P.ev('ESCDOC.lado'), 'reverso', 'no empezó por el respaldo (el del código de barras)');
    assert.equal(P.ev('ESCDOC.activo'), true);
    /* Y la constancia que viaja es la de siempre: U.armarAutorizacion con la
       casilla del último paso, que ahora sale marcada porque la dio. */
    assert.match(P.ev('pasoPermiso()'), /id="autSensible" checked/);
    assert.match(cuerpo(P), /Si cambias de opinión, en el último paso lo puedes quitar/);
  });

  test('lo primero no son dos permisos a la vez: ni ubicación ni detector de rostro en la cédula', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('window.__gps'), 0, 'el primer paso pidió la ubicación junto con la cámara');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__links)')), [], 'el primer paso bajó el detector de rostro');
    /* El detector se baja en el paso del celular, el que va antes del rostro. */
    P.ev("pintarRegistro(indiceDe('entrada'))");
    assert.equal(P.ev('window.__links.length'), 4, 'el paso del celular no bajó el detector');
    /* La ubicación, en el paso del rostro, y no junto con su cámara: al seguir
       sin la selfie (o al tomarla). */
    P.ev("pintarRegistro(indiceDe('rostro'))");
    assert.equal(P.ev('window.__gps'), 0, 'se pidió la ubicación al mismo tiempo que la cámara de la selfie');
    assert.match(cuerpo(P), /Después de la foto te pedimos tu ubicación/);
    /* 22-oct-2026 — sin la selfie, el primer «Continuar» solo avisa (y no pide
       la ubicación: pedirla le hizo creer a William que la foto ya estaba);
       al seguir sin ella, sí. */
    P.ev('siguientePaso()');
    assert.equal(P.ev('window.__gps'), 0, 'el «Continuar» que avisa de la selfie pidió la ubicación');
    P.ev('seguirSinSelfie()');
    assert.equal(P.ev('window.__gps'), 1, 'la ubicación autorizada no se pidió nunca');
  });
});

describe('2. «Prefiero escribir mis datos»', () => {

  test('lleva al formulario VACÍO, sin autorizar nada y sin encender la cámara', () => {
    const P = abrir();
    P.ev('prefieroEscribirMisDatos()');
    assert.equal(pasoActual(P), 'identidad');
    const h = cuerpo(P);
    assert.match(h, /<h3 class="tit"[^>]*>Escribe tus datos<\/h3>/, 'le dice «revisa» unos datos que la app no llenó');
    ['nombres', 'apellidos', 'documento', 'expedicion'].forEach(k =>
      assert.match(h, new RegExp('id="f_' + k + '"[^>]*value=""'), 'la casilla ' + k + ' no está vacía'));
    assert.match(h, /<option value="" disabled hidden selected>/, 'el tipo de documento se escogió solo');
    assert.equal(/no los escribiste tú/.test(h), false, 'dice que los leyó de la cédula sin haberla leído');
    assert.ok(!P.ev('FOTOS.sensibles'), 'escoger escribir marcó la autorización de las fotos');
    assert.equal(P.ev('window.__camaras.length'), 0);
    /* Y el rostro se salta: no hay fotos que tomar sin la autorización. */
    P.ev("pintarRegistro(indiceDe('rostro'))");
    assert.match(cuerpo(P), /No autorizaste las fotos en el primer paso/);
    assert.equal(/camVideo/.test(cuerpo(P)), false);
  });

  test('la cédula de extranjería o el pasaporte pasan escribiendo, sin cámara', () => {
    const P = abrir();
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', { nombres: 'ANA', apellidos: 'GOMEZ', tipo_doc: 'Pasaporte', documento: 'AB123456', expedicion: '2020-01-01' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada', 'sin fotos no se puede seguir: la cuenta se condicionó a un dato sensible');
  });
});

describe('3. respaldo, frente, y el registro pasa solo a revisar los datos', () => {

  test('se lee el respaldo, después el frente, y pasa SOLO al paso 2 con los datos puestos', () => {
    const P = abrir();
    escanear(P, { soloRespaldo: true });
    assert.equal(P.ev('ESCDOC.lado'), 'frente', 'después del respaldo no siguió con el frente');
    assert.equal(pasoActual(P), 'documento', 'se fue del paso con un solo lado');
    assert.match(cuerpo(P), /Paso 1 de/);
    P.ev("$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
         'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
    P.ev('capturarDoc(true)');
    assert.equal(P.ev("$('docListoTxt').textContent"), 'Listo: las dos caras.');
    pasa(P, 1500);
    assert.equal(pasoActual(P), 'identidad', 'con las dos caras no pasó solo al paso 2');
    const h = cuerpo(P);
    assert.match(h, /<h3 class="tit"[^>]*>Revisa tus datos<\/h3>/);
    assert.match(h, /Estos datos no los escribiste tú/, 'no dice que los datos los leyó la app');
    assert.match(h, /id="f_nombres"[^>]*value="MARIA JOSE"/);
    assert.match(h, /id="f_apellidos"[^>]*value="RODRIGUEZ PEREZ"/);
    assert.match(h, /id="f_documento"[^>]*value="52123456"/);
    assert.match(h, /<option value="Cédula de ciudadanía" selected>/);
    /* La fecha de nacimiento leída se MUESTRA, sin casilla que la cambie. */
    assert.match(h, /id="nacLeido" type="text" readonly aria-readonly="true" value="12 mar 1988"/);
    /* La expedición no viene en el código: vacía, con dónde buscarla. */
    assert.match(h, /id="f_expedicion" type="date" max="\d{4}-\d{2}-\d{2}" min="2006-03-12"[^>]*value=""/);
    assert.match(h, /id="ayudaExpedicion">No viene en el código de barras[^<]*FECHA Y LUGAR DE EXPEDICIÓN/);
  });

  test('con la cámara del celular (sin cámara en vivo) también pasa solo, y si el código no se leyó lo dice', async () => {
    /* El banco sin mediaDevices es el navegador sin cámara en vivo: quedan las
       cajas de foto. Sin red para el lector, el código no se lee. */
    const P = abrirPlay({ hash: '#registro' });
    P.ev('autorizarYEscanear()');
    assert.match(cuerpo(P), /id="docFijo">/, 'sin cámara en vivo no quedaron las cajas de foto a la vista');
    P.ev("comprimirVarias = function (f, t) { return Promise.resolve(t.map(function (x) { return x[1] == null ? { width: 1, height: 1 } : 'data:image/jpeg;base64,F' + x[0]; })); };" +
         "window.cargarScript = function () { return Promise.reject(new Error('sin red')); };");
    await P.ev("tomarFoto({ target: { files: [{ name: 'r.jpg' }] } }, 'cedula_reverso')");
    assert.equal(pasoActual(P), 'documento', 'con un solo lado se fue del paso');
    await P.ev("tomarFoto({ target: { files: [{ name: 'f.jpg' }] } }, 'cedula_frente')");
    assert.equal(pasoActual(P), 'identidad', 'con las dos fotos de la cámara del celular no pasó solo al paso 2');
    assert.match(cuerpo(P), /<h3 class="tit"[^>]*>Escribe tus datos<\/h3>/);
    /* 23-oct-2026 — sin lector no se sabe si es la amarilla o la digital (que
       no trae código de barras): la nota dice lo que es cierto en las dos
       (textoSinLeer en play/). Antes decía «el código de barras». */
    assert.match(cuerpo(P), /No alcanzamos a leer tu cédula, así que esta vez los datos los escribes tú/,
      'el formulario vacío no explica que la cédula no se leyó: parece un error de la app');
    assert.equal(/código de barras de tu cédula/.test(cuerpo(P)), false, 'le habló del código de barras sin saber si su cédula lo trae');
  });

  test('el sexo y el RH ni se guardan ni se muestran', () => {
    const P = abrir();
    escanear(P);
    assert.equal(P.ev('FOTOS.cedula_leida.sexo'), undefined, 'el sexo llegó a la página');
    assert.equal(P.ev('FOTOS.cedula_leida.rh'), undefined, 'el RH llegó a la página');
    assert.equal(P.ev('REGISTRO.sexo'), undefined);
    assert.equal(P.ev('REGISTRO.rh'), undefined);
    assert.equal(/A\+|\bRH\b|[Ss]exo/.test(cuerpo(P)), false, 'el paso 2 muestra el sexo o el RH');
    assert.equal(/"sexo"|"rh"/.test(String(P.almacen.play_registro_borrador) + String(P.almacen.play_fotos_borrador)), false);
  });

  test('la expedición: ni después de hoy, ni antes de los 18 años; y lo que se corrige queda anotado', () => {
    const P = abrir();
    escanear(P);
    casillas(P, 'identidad', { expedicion: '2999-01-01' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'identidad');
    assert.match(P.ev("$('errReg').textContent"), /no puede ser después de hoy/);
    casillas(P, 'identidad', { expedicion: '2006-03-11' });   // un día antes de cumplir 18
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'identidad');
    assert.match(P.ev("$('errReg').textContent"), /desde los 18 años/);
    /* Corrige un apellido mal leído: queda anotado para el cotejo de Joan. */
    P.ev("$('f_apellidos').value = 'RODRIGUEZ PERES'; anotarCampo($('f_apellidos'));");
    assert.equal(P.ev('FOTOS.cedula_editado.apellidos'), true, 'la corrección no quedó anotada en cedula_editado');
    casillas(P, 'identidad', { expedicion: '2006-03-12' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada', 'una expedición el día que cumplió 18 no pasa');
    assert.equal(P.ev('REGISTRO.apellidos'), 'RODRIGUEZ PERES', 'la corrección se perdió');
  });
});

describe('4. las fotos sin dueño: se toman antes del celular y suben con él', () => {

  test('mientras no hay celular, el dueño es el intento, y la pantalla dice «Listo»', () => {
    const P = abrir();
    escanear(P);
    assert.equal(P.ev('FOTOS.de.celular'), '', 'las fotos salieron con un celular que nadie ha escrito');
    assert.ok(P.ev('FOTOS.de.intento') && P.ev('FOTOS.de.intento') === P.ev('REGISTRO.intento'));
    assert.match(String(P.almacen.play_registro_borrador || ''), /"intento":/, 'el intento no quedó en el borrador: una recarga deja las fotos sin dueño reconocible');
    assert.equal(P.ev("hayFotoLista('cedula_reverso')"), true);
    assert.equal(P.ev("hayFotoLista('cedula_frente')"), true);
    /* Y sobrevive la recarga de la cámara del sistema (localStorage). */
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '#registro' });
    assert.equal(Q.ev("hayFotoLista('cedula_reverso')"), true, 'tras la recarga la foto ya no es «de este registro»');
  });

  test('FOTO SIN DUEÑO + CELULAR = FOTO QUE SUBE (el defecto del 21-sep era una que decía «Listo» y no subía)', async () => {
    const P = abrir();
    hastaElRostro(P);
    assert.equal(P.ev('FOTOS.de.celular'), CEL, 'el celular no se volvió el dueño de las fotos');
    assert.equal(P.ev('FOTOS.de.duda'), undefined);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    const subida = ll().find(x => /registro_archivos_guardar/.test(x.url));
    assert.ok(subida, 'las fotos de la cédula NO subieron: la caja dijo «Listo» y el CRM las recibe vacías');
    assert.deepEqual(Object.keys(subida.cuerpo.p_archivos).sort(), ['cedula_frente', 'cedula_reverso']);
    assert.equal(subida.cuerpo.p_archivos.cedula_reverso, 'data:image/jpeg;base64,RESPALDO');
    assert.equal(subida.cuerpo.p_huella.cedula_leida.documento, '52123456');
    assert.equal(subida.cuerpo.p_huella.cedula_leida.sexo, undefined);
    /* La bandeja recibe el registro SIN el intento, que es de este teléfono. */
    const bandeja = ll().find(x => /rpc\/registrar_abierto$/.test(x.url));
    assert.ok(bandeja && bandeja.cuerpo.p_datos.nombres === 'MARIA JOSE');
    assert.equal(bandeja.cuerpo.p_datos.intento, undefined, 'el intento viajó a la nube');
    const cuenta = ll().find(x => /auth\/v1\/signup/.test(x.url));
    assert.equal(cuenta.cuerpo.data.vinculacion.intento, undefined, 'el intento viajó en la cuenta');
  });

  test('la subida sigue exigiendo el celular de la cuenta: una foto sin dueño no sube sola', () => {
    const P = abrir();
    escanear(P);
    P.ev("SESION = { access_token: 'tok', user: { email: '573001112233@tugarantia.net' } };" +
         'window.__subio = null; rpcSesion = function (f, a) { window.__subio = a; return Promise.resolve({ ok: true }); };');
    P.ev('subirArchivosRegistro()');
    assert.equal(P.ev('window.__subio'), null, 'subieron fotos sin dueño a una cuenta');
  });

  test('FOTO SIN DUEÑO VIEJA (más de una hora): ni «Listo» ni subida, y no la refresca el celular', () => {
    const P = abrir();
    escanear(P);
    P.ev('FOTOS.de.t = Date.now() - ' + ((EC.MINUTOS_SIN_DUENO + 1) * 60e3) + '; guardarFotos();');
    assert.equal(P.ev("hayFotoLista('cedula_reverso')"), false, 'una foto sin dueño de hace más de una hora se ve lista');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL);
    assert.equal(P.ev('FOTOS.de.duda'), true, 'el celular adoptó en silencio una cédula de hace más de una hora');
    P.ev("SESION = { access_token: 'tok', user: { email: '573001112233@tugarantia.net' } };" +
         'window.__subio = null; rpcSesion = function (f, a) { window.__subio = a; return Promise.resolve({ ok: true }); };');
    P.ev('subirArchivosRegistro()');
    assert.equal(P.ev('window.__subio'), null, 'subió una cédula vieja sin que nadie dijera que es suya');
  });

  test('FOTO DE OTRO INTENTO: no es de este registro, no sube, y la foto nueva no se mezcla con ella', () => {
    const P = abrir();
    /* Lo que dejó otra persona en el teléfono: su respaldo, su lectura y su
       selfie, sin celular y de otro intento. */
    P.ev("FOTOS = { sensibles: true, cedula_reverso: 'data:DE-OTRO', selfie: 'data:CARA-DE-OTRO'," +
         " cedula_leida: { nombres: 'PEDRO', apellidos: 'LOPEZ', documento: '111' }," +
         " de: { celular: '', intento: 'otro-intento', t: Date.now() } }; guardarFotos();");
    assert.equal(P.ev("hayFotoLista('cedula_reverso')"), false, 'la cédula de otro intento se ve lista en este registro');
    escanear(P);
    assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,RESPALDO');
    assert.equal(P.ev('FOTOS.selfie'), undefined, 'la selfie de otra persona se quedó pegada a la cédula de esta');
    assert.equal(P.ev('REGISTRO.nombres'), 'MARIA JOSE');
  });

  test('otro intento con celular: se suelta al dar el celular, y la identidad que escribió ESTA persona se queda', () => {
    const P = abrir();
    P.ev("FOTOS = { sensibles: true, cedula_reverso: 'data:DE-OTRO', cedula_leida: { nombres: 'PEDRO', apellidos: 'LOPEZ', documento: '111' }," +
         " de: { celular: '3009999999', intento: 'otro-intento', t: Date.now() } }; guardarFotos();");
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', { nombres: 'ANA', apellidos: 'GOMEZ', tipo_doc: 'Cédula de ciudadanía', documento: '222', expedicion: '2010-01-01' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL);
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'la cédula de otro registro se le pegó a este');
    assert.equal(P.ev('REGISTRO.nombres'), 'ANA', 'se borró lo que esta persona escribió de sí misma');
    assert.equal(P.ev('REGISTRO.documento'), '222');
  });
});

/* 20-oct-2026, otro celular — ESTA SECCIÓN CAMBIÓ DE REGLA. Hasta hoy medía
   lo que Joan decidió el 19-oct: cambiar el celular conservaba lo escaneado y
   le dejaba el teléfono prestado a la pregunta «¿Eres …?». La verificación del
   cierre (C1, C2) mostró que esa pregunta no alcanzaba —la selfie, la ubicación
   y la contraseña de la persona anterior pasaban sin preguntar—, y la decisión
   de mentor fue volver a la regla de antes: si el celular cambia a mitad del
   registro, es otra persona, y lo de la anterior se borra. Las pruebas de la
   regla nueva están en pruebas/el-celular-es-la-persona.test.js; aquí quedan
   las de esta sección reescritas con ella, y la pregunta para lo que sigue
   cubriendo (la cédula de más de una hora sin celular).
   21-oct-2026 — Y OTRA VEZ (E-A1, decisión de mentor): si el celular cambia,
   el registro EMPIEZA DE CERO, también lo escrito a mano, y el «Continuar»
   que pasa lleva al primer paso. Dos pruebas de aquí esperaban «Revisa tus
   datos» después del cambio; ahora esperan el primer paso, y la que abre la
   cuenta escribe los datos desde ahí. Las de la regla nueva están en
   pruebas/el-celular-nuevo-empieza-de-cero.test.js. */
describe('5. cambiar el celular borra lo escaneado (es otra persona), y «¿Eres …?» cubre la cédula vieja', () => {

  test('CAMBIAR EL CELULAR BORRA LO ESCANEADO: las fotos, la lectura y lo que el escáner escribió con ella', () => {
    const P = abrir();
    hastaElRostro(P, '3001112233');
    P.ev("pintarRegistro(indiceDe('entrada'))");
    celularYClave(P, '3005556677');
    assert.equal(P.ev('REGISTRO.nombres'), undefined, 'los nombres leídos con el otro celular se quedaron');
    assert.equal(P.ev('REGISTRO.documento'), undefined, 'el documento leído con el otro celular se quedó');
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'las fotos tomadas con el otro celular se quedaron');
    assert.equal(P.ev('FOTOS.cedula_leida'), undefined);
    /* 21-oct-2026 — regla nueva (E-A1): era 'identidad'; el registro empieza
       de cero y lleva al primer paso. */
    assert.equal(pasoActual(P), 'documento', 'el registro no volvió a empezar por el primer paso');
  });

  test('…y lo que se publica al acompañamiento con el celular nuevo no lleva nada de la cédula anterior', () => {
    const P = abrir();
    hastaElRostro(P, '3001112233');
    P.ev("pintarRegistro(indiceDe('entrada'))");
    celularYClave(P, '3005556677');
    const ll = nube(P);
    P.ev("CFG.url = 'https://x.supabase.co'; CFG.anon = 'llave'; anotarAvisoVivo(); pintarRegistro(indiceDe('rostro')); publicarAvance();");
    const publicado = ll().filter(x => /registro_vivo_publicar/.test(x.url));
    assert.equal(/MARIA|52123456|RODRIGUEZ/.test(JSON.stringify(publicado)), false,
      'el nombre leído de una cédula se publicó bajo un celular distinto del que la escaneó');
  });

  test('…y al abrir la cuenta no sube nada de la cédula anterior, ni pregunta por ella', async () => {
    const P = abrir();
    hastaElRostro(P, '3001112233');
    P.ev("pintarRegistro(indiceDe('entrada'))");
    celularYClave(P, '3005556677');
    /* 21-oct-2026 — regla nueva (E-A1): el «Continuar» la dejó en el primer
       paso, con el registro en cero; escribe sus datos desde ahí. */
    assert.equal(pasoActual(P), 'documento');
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', { nombres: 'ANA', apellidos: 'GOMEZ', tipo_doc: 'Cédula de ciudadanía', documento: '222', expedicion: '2010-01-01' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    P.ev("$('rClave').value = ''; $('rClave2').value = ''; siguientePaso();");   // la contraseña de ESTE celular, en blanco
    assert.equal(pasoActual(P), 'rostro');
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.equal(/¿La cédula/.test(P.ev("$('errReg').innerHTML")), false, 'preguntó por una cédula que ya no está');
    assert.equal(ll().find(x => /registro_archivos_guardar/.test(x.url)), undefined, 'subió algo de la cédula anterior');
    const bandeja = ll().find(x => /rpc\/registrar_abierto$/.test(x.url));
    assert.ok(bandeja, 'no abrió la cuenta');
    assert.equal(bandeja.cuerpo.p_celular, '3005556677');
    assert.equal(/MARIA|52123456/.test(JSON.stringify(bandeja.cuerpo)), false, 'la bandeja recibió la identidad leída con el otro celular');
  });

  test('«¿Eres …?» también con una cédula de hace más de una hora; «Empezar de cero» lo borra TODO', async () => {
    const P = abrir();
    escanear(P);
    P.ev('FOTOS.de.t = Date.now() - ' + ((EC.MINUTOS_SIN_DUENO + 5) * 60e3) + '; guardarFotos();');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.equal(ll().length, 0, 'abrió la cuenta con una cédula escaneada hace más de una hora sin preguntar');
    assert.match(P.ev("$('errReg').innerHTML"), /¿La cédula 52\.123\.456, de Maria, es tuya\?/);
    P.ev('empezarDeNuevo()');
    assert.equal(pasoActual(P), 'documento');
    assert.equal(P.ev('REGISTRO.nombres'), undefined, 'el nombre del anterior se quedó');
    assert.equal(P.ev('FOTOS.cedula_reverso'), undefined, 'la cédula del anterior se quedó');
    assert.equal(/MARIA|RESPALDO/.test(JSON.stringify(P.almacen)), false, 'quedó algo del anterior en el teléfono');
  });

  test('no le pregunta «¿Eres …?» a quien no tiene que ver con las fotos que hay en el teléfono', async () => {
    /* Una cédula pendiente de subir de OTRA cuenta (otro intento, otro
       documento): no es de este registro y no se sube a él, pero tampoco se le
       pregunta a esta persona si es Pedro —«Empezar de cero» le borraría lo suyo. */
    const P = abrir();
    P.ev('prefieroEscribirMisDatos()');
    casillas(P, 'identidad', { nombres: 'ANA', apellidos: 'GOMEZ', tipo_doc: 'Cédula de ciudadanía', documento: '222', expedicion: '2010-01-01' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL);
    P.ev("FOTOS = { sensibles: true, cedula_reverso: 'data:DE-OTRO', cedula_leida: { nombres: 'PEDRO', documento: '111' }," +
         " de: { celular: '3009999999', intento: 'otro-intento', t: Date.now() } }; guardarFotos();");
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.equal(/¿Eres/.test(P.ev("$('errReg').innerHTML")), false, 'le preguntó si es otra persona');
    assert.ok(ll().some(x => /rpc\/registrar_abierto$/.test(x.url)), 'no abrió la cuenta');
    const subida = ll().find(x => /registro_archivos_guardar/.test(x.url));
    assert.equal(subida, undefined, 'subió a esta cuenta la cédula de otra persona');
  });
});

describe('6. PlataChat usa el mismo registro', () => {

  test('?marca=platachat abre en la cédula, con el mismo botón, y «Volver» regresa a PlataChat', () => {
    const P = abrir({ search: '?marca=platachat', hash: '' });
    assert.equal(P.ev('MARCA'), 'platachat');
    assert.equal(pasoActual(P), 'documento');
    const h = cuerpo(P);
    assert.match(h, /📷 Autorizo y escaneo mi cédula/);
    assert.match(h, /Prefiero escribir mis datos/);
    assert.match(h, /onclick="volverAPlataChat\(\)">Volver</);
    assert.ok(!P.ev('FOTOS.sensibles'));
  });

  test('de punta a punta: escanea, el celular, y las fotos suben ANTES de irse a PlataChat', async () => {
    const P = abrir({ search: '?marca=platachat', hash: '' });
    P.ev(SESION_JS);
    P.ev("SCRIPTS[URL_SESION_PLATACHAT] = Promise.resolve();");
    hastaElRostro(P);
    assert.equal(P.ev('avisoAcompana()'), '', 'PlataChat no tiene acompañamiento');
    assert.equal(P.almacen.tg_vivo_aviso_8oct2026, undefined, 'anotó un permiso que PlataChat no pide');
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar(16);
    assert.ok(ll().some(x => /registrar_abierto_app$/.test(x.url)), 'no fue a la bandeja con la etiqueta');
    const subida = ll().find(x => /registro_archivos_guardar/.test(x.url));
    assert.ok(subida, 'las fotos escaneadas antes del celular no subieron en PlataChat');
    assert.deepEqual(Object.keys(subida.cuerpo.p_archivos).sort(), ['cedula_frente', 'cedula_reverso']);
    assert.equal(P.ev('location.href'), '../platachat/index.html');
  });
});

describe('lo puro (app/escaner-cedula.js)', () => {
  const ahora = Date.parse('2026-10-19T15:00:00Z');

  test('una foto sin dueño es del intento que la tomó, y solo una hora', () => {
    assert.equal(EC.MINUTOS_SIN_DUENO, 60);
    const de = (min, intento) => ({ de: { celular: '', intento: intento || 'i-1', t: ahora - min * 60e3 } });
    assert.equal(EC.fotosPertenecen(de(5), '', ahora, 'i-1'), true);
    assert.equal(EC.fotosPertenecen(de(59), '3001112233', ahora, 'i-1'), true, 'el celular que se teclea no cuenta para una foto sin dueño');
    assert.equal(EC.fotosPertenecen(de(61), '', ahora, 'i-1'), false, 'una foto sin dueño vale más de una hora');
    assert.equal(EC.fotosPertenecen(de(5, 'i-2'), '', ahora, 'i-1'), false, 'la foto de otro intento es de este');
    assert.equal(EC.fotosPertenecen(de(5), '', ahora), false, 'sin intento, una foto sin dueño es de cualquiera');
    assert.equal(EC.fotosPertenecen(de(-5), '', ahora, 'i-1'), false, 'una foto del futuro');
  });

  test('con dueño, la regla de siempre (el intento no la afloja)', () => {
    const f = { de: { celular: '3001112233', intento: 'i-1', t: ahora - 3 * 3600e3 } };
    assert.equal(EC.fotosPertenecen(f, '3001112233', ahora, 'i-1'), true);
    assert.equal(EC.fotosPertenecen(f, '3001112233', ahora, 'otro'), true, 'con dueño, el intento no manda');
    assert.equal(EC.fotosPertenecen(f, '3009999999', ahora, 'i-1'), false, 'el mismo intento no le da las fotos a otro celular');
    assert.equal(EC.fotosPertenecen(f, '', ahora, 'i-1'), false);
    assert.equal(EC.fotosPertenecen({ de: { celular: '3001112233', t: ahora - 25 * 3600e3 } }, '3001112233', ahora), false);
  });

  test('la fecha de expedición', () => {
    const r = (e, n, t) => EC.revisarExpedicion(e, n, '2026-10-19', t);
    assert.equal(r('', '1988-03-12').ok, true, 'vacía es asunto de «obligatorio», no de esta regla');
    assert.equal(r('2010-05-20', '1988-03-12').ok, true);
    assert.equal(r('2026-10-19', '1988-03-12').ok, true, 'hoy vale');
    assert.match(r('2026-10-20', '1988-03-12').motivo, /después de hoy/);
    assert.equal(r('2006-03-12', '1988-03-12').ok, true, 'el día que cumple 18 vale');
    assert.match(r('2006-03-11', '1988-03-12').motivo, /18 años/);
    assert.equal(r('2006-03-11', '').ok, true, 'sin fecha de nacimiento leída no se rechaza por edad');
    assert.equal(r('2006-03-11', '1988-03-12', 'Pasaporte').ok, true, 'a un pasaporte se le aplicó la regla de la cédula');
    assert.equal(r('2006-02-28', '1988-02-29').ok, false);
    assert.equal(r('2006-03-01', '1988-02-29').ok, true, 'el 29 de febrero');
    assert.match(r('20-05-2010', '').motivo, /no se entiende/);
    assert.match(r('2010-13-01', '').motivo, /no se entiende/);
  });
});
