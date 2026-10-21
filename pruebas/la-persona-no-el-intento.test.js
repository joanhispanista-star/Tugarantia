'use strict';
/* ==========================================================================
 * LAS FOTOS SON DE LA PERSONA, NO DEL INTENTO — 20 de octubre de 2026
 *
 *   node --test pruebas/la-persona-no-el-intento.test.js
 *
 * La revisión adversaria del registro con la cédula primero (la del 19-oct)
 * dejó diez hallazgos con una sola raíz: las fotos y la lectura de la cédula
 * se ataban al «intento» —este registro, en este teléfono— y no a la persona.
 * En un teléfono prestado dos personas comparten el intento, y la cédula de
 * una terminaba en la cuenta de la otra, o se le pintaba en pantalla.
 *
 * Cada prueba de aquí es uno de los escenarios de la revisión, contado como
 * pasa, y corre play/index.html DE VERDAD (pruebas/banco-play.js). Todas
 * FALLAN con la página del 19-oct (d7d480e) y pasan con las reglas duras:
 *
 *   1. la cédula es de quien dice su documento (F4, F6);
 *   2. un respaldo con otro documento es otra persona, y un respaldo nuevo
 *      pide el frente otra vez (F11, F15);
 *   3. nada sensible sobrevive a otra persona: ni en memoria tras crear la
 *      cuenta o salir (F7), ni pintado antes de preguntar (F4, F11), ni la
 *      autorización por ninguno de sus tres caminos (F5);
 *   4. «Leímos tu cédula» solo de la lectura de este registro (F8);
 *   5. un doble toque no guarda el respaldo como frente (F9);
 *   6. un paso guardado por la versión anterior no se salta la cédula
 *      (F12, F14).
 *
 * Ninguna cédula de nadie: las dos son fabricadas (pruebas/fabrica-pdf417.js).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');
const F = require('./fabrica-pdf417.js');
const U = require('../app/cuenta.js');
const EC = require('../app/escaner-cedula.js');

function cedula(d) {
  const b = F.registroCedula(d);
  let t = '';
  for (const x of b) t += String.fromCharCode(x);
  return EC.cedulaDelTexto(U.leerCedulaPDF417, t);
}
const MARIA = cedula({ documento: '0052123456', apellido1: 'RODRIGUEZ', apellido2: 'PEREZ',
  nombre1: 'MARIA', nombre2: 'JOSE', sexo: 'F', nacimiento: '19880312', rh: 'A+' });
const PEDRO = cedula({ documento: '0079111222', apellido1: 'GOMEZ', apellido2: 'DIAZ',
  nombre1: 'PEDRO', nombre2: 'LUIS', sexo: 'M', nacimiento: '19850704', rh: 'O+' });
const CEL_MARIA = '3001112233';
const CEL_PEDRO = '3109998877';

/* La página con una cámara que pide permiso y nunca contesta, un GPS que
   cuenta, y un reloj que guarda los temporizadores para correrlos a mano. */
function abrir(opc) {
  const P = abrirPlay(Object.assign({ hash: '#registro' }, opc || {}));
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

/* Lo que la cámara deja en el marco, con nombre para saber de quién es. */
function camara(P, quien) {
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO') + '_" + quien + "'; };" +
       "$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
}
/* Lee el respaldo en vivo (lo que hace leidaDoc cuando el lector devuelve la
   cédula) y, si sigue con el frente, lo toma. */
function leerRespaldo(P, ced, quien) {
  camara(P, quien);
  P.ev("ESCDOC.lado = 'reverso'; leidaDoc(" + JSON.stringify(ced) + ', 0)');
}
function escanear(P, ced, quien) {
  P.ev('autorizarYEscanear()');
  leerRespaldo(P, ced, quien);
  pasa(P, 1500);                       // «¡Leída! Ahora el frente.»
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
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566' }); guardarBorrador(REGISTRO);");
}
/* La nube de mentira: anota cada llamada. `subida` decide qué contesta la
   base a las fotos (por defecto, que entraron todas). */
function nube(P, subida) {
  P.ev('window.__subida = ' + JSON.stringify(subida || null) + ';' + `window.__llamadas = [];
    fetch = function (u, o) {
      var c = null; try { c = JSON.parse(o && o.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      var r = /auth\\/v1\\/signup/.test(String(u))
        ? { access_token: 'tok-nuevo', refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } }
        : /registro_archivos_guardar/.test(String(u))
          ? (window.__subida || { ok: true, guardados: Object.keys((c && c.p_archivos) || {}) })
        : { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
function abrirLaCuenta(P) {
  elResto(P);
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  P.ev('siguientePaso()');
}
/* «Abrir mi cuenta» en la portada, TOCANDO EL BOTÓN que la portada pinta (no
   una función por su nombre): así la prueba mide la puerta que usa la gente. */
function tocarAbrirMiCuenta(P) {
  P.ev('pintarEntrar()');
  const m = /<button class="btn arriba" onclick="([^"]+)">Abrir mi cuenta<\/button>/.exec(cuerpo(P));
  assert.ok(m, 'la portada no tiene el botón «Abrir mi cuenta»');
  P.ev(m[1]);
}
/* Si la página pregunta «¿Es tuyo?», contesta «Seguir» (lo que haría quien
   miente, o quien no entiende). La versión del 19-oct no preguntaba. */
function siPreguntaSeguir(P) {
  const m = /id="btnRestosSeguir" onclick="([^"]+)"/.exec(cuerpo(P));
  if (m) P.ev(m[1]);
}
/* Nada de María en la pantalla: ni su nombre, ni su número, ni sus fotos. */
function nadaDeMaria(P, donde) {
  const h = cuerpo(P) + caja(P);
  assert.equal(/MARIA|Maria|RODRIGUEZ/.test(h), false, donde + ': se le pinta el nombre de la cédula de María');
  assert.equal(/52\.?123\.?456/.test(h), false, donde + ': se le pinta el número de la cédula de María');
  assert.equal(/_MARIA/.test(h), false, donde + ': se le pinta la foto de la cédula de María');
}
/* María: autoriza, escanea los dos lados, la app pasa sola a «Revisa tus
   datos», y ella vuelve con «Volver» hasta la portada. */
function mariaEscaneaYSeVa(P) {
  escanear(P, MARIA, 'MARIA');
  assert.equal(pasoActual(P), 'identidad', 'la cédula de María no pasó sola a «Revisa tus datos»');
  P.ev('pintarRegistro(0)');         // «Volver»
  P.ev('pintarEntrar()');            // «Volver» otra vez: la portada
}

describe('1. la cédula es de quien dice su documento (F4, F6)', () => {

  test('F4 — MARÍA/PEDRO EN LA MISMA PESTAÑA: Pedro toca «Abrir mi cuenta» y no ve nada de María', () => {
    const P = abrir();
    mariaEscaneaYSeVa(P);
    tocarAbrirMiCuenta(P);
    nadaDeMaria(P, 'al tocar «Abrir mi cuenta»');
    /* 20-oct-2026, rediseño (A) — decía «y le pregunta si el registro a medias
       es suyo». Desde el rediseño, «Volver» hasta la portada ya soltó la
       cédula de María y lo que el escáner escribió con ella: no queda nada suyo
       por lo que preguntar. Lo que esta prueba cuidaba —que Pedro no vea nada
       de María— se mira ahora también en el teléfono entero. */
    assert.equal(/_MARIA|52123456|MARIA|RODRIGUEZ/.test(JSON.stringify(P.almacen)), false,
      'algo de la cédula de María se quedó en el teléfono después de volver a la portada');
  });

  test('F4 — …y si Pedro dice «Seguir» y escribe SU documento, la cédula de María no sube a su cuenta', async () => {
    const P = abrir();
    mariaEscaneaYSeVa(P);
    tocarAbrirMiCuenta(P);
    siPreguntaSeguir(P);
    P.ev("pintarRegistro(indiceDe('identidad'))");
    /* 20-oct-2026, rediseño (A) — con el tipo de documento: la portada ya soltó
       la lectura de María y, con ella, lo que el escáner había escrito. */
    casillas(P, 'identidad', { nombres: 'PEDRO LUIS', apellidos: 'GOMEZ DIAZ', tipo_doc: 'Cédula de ciudadanía',
                               documento: '79111222', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    if (pasoActual(P) === 'identidad') {
      assert.match(caja(P), /La cédula que escaneaste no es la del documento que escribiste: no la subimos/);
      assert.match(caja(P), /Escanea la tuya o sigue sin fotos/);
      assert.equal(P.ev("hayFotoLista('cedula_reverso') || hayFotoLista('cedula_frente')"), false);
      P.ev('siguientePaso()');       // «Seguir sin fotos»
    }
    assert.equal(pasoActual(P), 'entrada');
    celularYClave(P, CEL_PEDRO);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    if (/seguirSoyYo/.test(caja(P))) { P.ev('seguirSoyYo()'); await asentar(); }   // Pedro dice la verdad: sí es Pedro
    assert.ok(ll().some(x => /auth\/v1\/signup/.test(x.url)), 'la cuenta de Pedro no se abrió: sin las fotos tiene que abrirse igual');
    assert.equal(ll().filter(x => /registro_archivos_guardar/.test(x.url)).length, 0,
      'la cédula de María subió a la cuenta de Pedro');
    assert.equal(/MARIA|_MARIA|52123456/.test(JSON.stringify(ll())), false, 'algo de la cédula de María salió del teléfono');
  });

  test('F6 — PASADA LA HORA: «¿Eres …?» ya no pregunta por el nombre que tecleó Pedro, y la cédula de María no sube', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    P.ev('FOTOS.de.t = Date.now() - ' + ((EC.MINUTOS_SIN_DUENO + 10) * 60e3) + '; guardarFotos();');
    casillas(P, 'identidad', { nombres: 'PEDRO LUIS', apellidos: 'GOMEZ DIAZ', documento: '79111222', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    if (pasoActual(P) === 'identidad') P.ev('siguientePaso()');
    celularYClave(P, CEL_PEDRO);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.equal(/¿Eres Pedro\?/.test(caja(P)), false, 'le pregunta a Pedro si es Pedro: contesta que sí diciendo la verdad');
    if (/seguirSoyYo/.test(caja(P))) { P.ev('seguirSoyYo()'); await asentar(); }
    assert.equal(ll().filter(x => /registro_archivos_guardar/.test(x.url)).length, 0, 'la cédula de María subió a la cuenta de Pedro');
  });

  test('la misma regla en la pantalla y en la subida: sin el número escrito, ni «Listo» ni foto que viaje', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    assert.equal(P.ev("hayFotoLista('cedula_reverso')"), true);
    P.ev("REGISTRO.documento = '79111222'; guardarBorrador(REGISTRO);");
    assert.equal(P.ev("hayFotoLista('cedula_reverso')"), false, 'dice «Listo» de una cédula cuyo número no es el escrito');
    /* La última reja: un lote que llegue a la subida con el número de otra
       persona anotado no sale del teléfono, y se suelta.
       20-oct-2026, rediseño (A) — desde la cola de la cuenta, que es lo único
       que sube: el registro en curso no sube nunca por sí solo. */
    const Q = abrir();
    escanear(Q, MARIA, 'MARIA');
    Q.ev("guardarCola('" + CEL_PEDRO + "', Object.assign({}, FOTOS, { de: { celular: '" + CEL_PEDRO + "', t: Date.now(), documento: '79111222' } }));" +
         "SESION = { access_token: 'tok', user: { email: '57" + CEL_PEDRO + "@tugarantia.net' } };");
    const ll = nube(Q);
    await Q.ev('subirArchivosRegistro()');
    assert.equal(ll().filter(x => /registro_archivos_guardar/.test(x.url)).length, 0, 'subió una cédula con el número de otro');
    assert.equal(/_MARIA/.test(String(Q.almacen.play_fotos_cola || '')), false, 'la cédula de otro se quedó en el teléfono');
    /* Y con el documento VACÍO tampoco: vacío es «no se sabe», no «el mismo». */
    Q.ev("guardarCola('" + CEL_PEDRO + "', Object.assign({}, FOTOS, { de: { celular: '" + CEL_PEDRO + "', t: Date.now(), documento: '' } }));");
    await Q.ev('subirArchivosRegistro()');
    assert.equal(ll().filter(x => /registro_archivos_guardar/.test(x.url)).length, 0, 'con el documento vacío subió la cédula de otro');
    assert.equal(/_MARIA/.test(String(Q.almacen.play_fotos_cola || '')), false);
  });

  test('…y la de la propia persona sí sube, con su número', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    const s = ll().find(x => /registro_archivos_guardar/.test(x.url));
    assert.ok(s, 'la cédula de la propia persona no subió');
    assert.deepEqual(Object.keys(s.cuerpo.p_archivos).sort(), ['cedula_frente', 'cedula_reverso']);
    assert.equal(s.cuerpo.p_huella.cedula_leida.documento, '52123456');
  });
});

describe('2. un respaldo nuevo (F11, F15)', () => {

  test('F15 — ANA/BETO EN EL MISMO INTENTO: el respaldo de Beto borra TODO lo de Ana y pide el permiso otra vez', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');                 // Ana (la cédula de «María» hace de Ana)
    P.ev("$('f_apellidos').value = 'RODRIGUEZ PERES'; anotarCampo($('f_apellidos'));");   // corrige su apellido
    assert.equal(P.ev('FOTOS.cedula_editado.apellidos'), true);
    P.ev('pintarRegistro(0)');                   // «Volver» a la cédula
    /* Beto toca «Repetir» en el respaldo y escanea el suyo. */
    P.ev("repetirDoc('reverso')");
    leerRespaldo(P, PEDRO, 'PEDRO');
    assert.equal(/_MARIA/.test(String(P.ev('JSON.stringify(FOTOS)'))), false,
      'el frente de Ana se quedó junto al respaldo de Beto');
    assert.equal(/RODRIGUEZ|PERES/.test(String(P.ev('JSON.stringify(REGISTRO)'))), false,
      'el apellido que Ana corrigió se quedó en el registro de Beto');
    assert.equal(P.ev('FOTOS.cedula_editado'), undefined, 'las correcciones de Ana viajarían como si fueran de Beto');
    assert.notEqual(P.ev('FOTOS.sensibles'), true, 'Beto sigue con el permiso que dio Ana');
    assert.equal(pasoActual(P), 'documento');
    assert.match(cuerpo(P), /id="btnAutorizoEscaneo"/, 'no le pide a Beto su propio permiso');
    assert.match(caja(P), /Esa cédula es de otra persona que la que se escaneó antes en este registro/);
    /* Y con su permiso, lo suyo: su respaldo, su frente, su nombre. */
    escanear(P, PEDRO, 'PEDRO');
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_PEDRO');
    assert.equal(P.ev('REGISTRO.apellidos'), 'GOMEZ DIAZ');
  });

  test('F11 — un respaldo nuevo, aunque sea del MISMO documento, pide el frente otra vez', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    P.ev('pintarRegistro(0)');
    P.ev("repetirDoc('reverso')");
    leerRespaldo(P, MARIA, 'MARIA2');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'el frente del respaldo viejo viaja con el respaldo nuevo');
    assert.match(P.ev("$('docListoTxt').textContent"), /Ahora el frente/, 'no le pide el frente del respaldo nuevo');
    assert.equal(P.ev('REGISTRO.documento'), '52123456', 'el mismo documento no es otra persona: se borró lo suyo');
    assert.equal(P.ev('FOTOS.sensibles'), true, 'el mismo documento no es otra persona: se le quitó su permiso');
  });

  test('F11 — una foto nueva no refresca la hora de una vieja: el frente vencido no vuelve a salir «✓»', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    P.ev('pintarRegistro(0)');
    P.ev('FOTOS.de.t = Date.now() - ' + ((EC.MINUTOS_SIN_DUENO + 30) * 60e3) + '; guardarFotos();');
    assert.equal(P.ev("hayFotoLista('cedula_frente')"), false);
    /* Otra persona escanea un respaldo en el mismo intento, una hora y media después. */
    leerRespaldo(P, PEDRO, 'PEDRO');
    assert.equal(P.ev("hayFotoLista('cedula_frente')"), false, 'el frente de hace hora y media volvió a valer');
    assert.equal(/FRENTE_MARIA/.test(String(P.ev('JSON.stringify(FOTOS)'))), false, 'el frente vencido se quedó para subir');
  });
});

describe('3. nada sensible sobrevive a otra persona (F7, F4, F11, F5)', () => {

  test('F7 — MISMA PESTAÑA TRAS «SALIR»: el siguiente no hereda el intento, el formulario ni la cédula que no alcanzó a subir', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    const intentoDeMaria = P.ev('REGISTRO.intento');
    const ll = nube(P, { ok: false });           // la subida falla: queda pendiente
    abrirLaCuenta(P);
    await asentar();
    assert.ok(ll().some(x => /registro_archivos_guardar/.test(x.url)), 'la subida ni se intentó');
    P.ev('salirDeCuenta()');
    tocarAbrirMiCuenta(P);
    nadaDeMaria(P, 'tras «Salir»');
    assert.notEqual(P.ev('REGISTRO.intento'), intentoDeMaria, 'el siguiente heredó el intento de María');
    assert.equal(P.ev("Object.keys(REGISTRO).filter(function (k) { return k !== 'intento'; }).length"), 0,
      'el formulario de María se quedó en memoria');
    assert.match(cuerpo(P), /id="btnAutorizoEscaneo"/, 'el siguiente no da su propio permiso');
    assert.equal(/Diste tu permiso/.test(cuerpo(P)), false);
    /* Lo pendiente sigue en su cola, con su dueño: sube cuando María vuelva a
       entrar, y nunca con la cuenta de otro. */
    const deOtro = abrir({ almacen: P.almacen, sesion: {}, hash: '' });
    const llO = nube(deOtro);
    deOtro.ev("pintarCuenta({ access_token: 'tok-o', user: { email: '57" + CEL_PEDRO + "@tugarantia.net' } })");
    await asentar();
    assert.equal(llO().filter(x => /registro_archivos_guardar/.test(x.url)).length, 0, 'la cédula de María subió a la cuenta de otro');
    const deMaria = abrir({ almacen: P.almacen, sesion: {}, hash: '' });
    const llM = nube(deMaria);
    deMaria.ev("pintarCuenta({ access_token: 'tok-m', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    const s = llM().find(x => /registro_archivos_guardar/.test(x.url));
    assert.ok(s, 'lo que María no alcanzó a subir se perdió');
    assert.equal(s.cuerpo.p_archivos.cedula_reverso, 'data:image/jpeg;base64,RESPALDO_MARIA');
  });

  test('F11 — LA PÁGINA QUE VUELVE SOLA MEDIA HORA DESPUÉS pregunta antes de pintar nada', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    assert.equal(pasoActual(P), 'identidad');
    /* 20-oct-2026, rediseño (A) — con algo escrito a mano: lo que el escáner
       escribió se va con la lectura cuando el registro queda abandonado, y sin
       nada más no habría registro a medias por el que preguntar (eso lo mide
       pruebas/lo-sensible-no-sale-del-registro.test.js). */
    P.ev("REGISTRO.correo = 'ana@correo.com'; guardarBorrador(REGISTRO);");
    /* Ana se fue sin escribir su celular. Media hora después Beto abre el enlace. */
    const antes = Date.now() - 30 * 60e3;
    P.almacen.play_registro_toque = String(antes);
    P.almacen.play_registro_paso = JSON.stringify(Object.assign(JSON.parse(P.almacen.play_registro_paso), { t: antes }));
    const f = JSON.parse(P.almacen.play_fotos_borrador); f.de.t = antes; P.almacen.play_fotos_borrador = JSON.stringify(f);
    const copia = Object.assign({}, P.almacen);   // el mismo teléfono, para la otra respuesta
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    nadaDeMaria(Q, 'al volver a abrir el enlace');
    assert.match(cuerpo(Q), /En este teléfono quedó un registro a medias\. ¿Es tuyo\?/);
    /* «Empezar de cero» lo borra todo; «Seguir» la devuelve a su registro.
       20-oct-2026, rediseño (A) — sin la cédula: decía «a su paso, con MARIA
       JOSE escrito». Pasada media hora el registro quedó abandonado y el
       arranque ya soltó las fotos y la lectura; «Seguir» vuelve al primer paso
       que le falta (la cédula), dice por qué, y trae lo escrito a mano. */
    const R = abrirPlay({ almacen: copia, sesion: {}, hash: '' });
    R.ev(/id="btnRestosSeguir" onclick="([^"]+)"/.exec(cuerpo(R))[1]);
    assert.equal(R.ev('PASOS[PASO].id'), 'documento');
    assert.match(R.elems.errReg.innerHTML, /por seguridad las borramos de este teléfono/, '«Seguir» no dice por qué no están sus fotos');
    nadaDeMaria(R, 'tras «Seguir»');
    Q.ev('empezarDeNuevo()');
    assert.equal(/MARIA|RESPALDO/.test(JSON.stringify(Q.almacen)), false, 'quedó algo de la persona anterior en el teléfono');
  });

  test('…pero la relanzada de la cámara (un minuto) vuelve a su paso sin preguntar, como siempre', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.equal(Q.ev('PASOS[PASO].id'), 'identidad', 'la vuelta de la cámara ya no retoma el registro');
    assert.match(Q.elems.errReg.innerHTML, /La página se volvió a abrir/);
  });

  test('F5 (a) — TOCÓ «AUTORIZO», LA CÁMARA NO LE SIRVIÓ Y SE FUE: el siguiente da su propio permiso', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('FOTOS.sensibles'), true);
    /* Otra persona abre el enlace (otra carga de la página)… */
    const Q = abrir({ almacen: P.almacen, sesion: {}, hash: '#registro' });
    sinPermisoHeredado(Q, 'al abrir el enlace');
    /* …o, en la misma pestaña, «Volver» y «Abrir mi cuenta». */
    tocarAbrirMiCuenta(P);
    sinPermisoHeredado(P, 'en la misma pestaña');
  });

  test('F5 (b) — LAS FOTOS DE HACE DOS DÍAS SE SOLTARON: el permiso se va con ellas', () => {
    const almacen = { play_fotos_borrador: JSON.stringify({ sensibles: true, cedula_reverso: 'data:image/jpeg;base64,RESPALDO_VIEJO',
      de: { celular: '', intento: 'de-hace-dos-dias', t: Date.now() - 49 * 3600e3 } }) };
    const P = abrir({ almacen, sesion: {}, hash: '#registro' });
    sinPermisoHeredado(P, 'tras soltar las fotos viejas');
    assert.equal(/RESPALDO_VIEJO/.test(String(P.almacen.play_fotos_borrador || '')), false);
  });

  test('F5 (c) — ABRIÓ SU CUENTA, SUS FOTOS SUBIERON Y TOCÓ «SALIR»: el siguiente no hereda el permiso', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.ok(ll().some(x => /registro_archivos_guardar/.test(x.url)));
    assert.notEqual(P.ev('FOTOS.sensibles'), true, 'tras subir quedó la marca del permiso en memoria');
    P.ev('salirDeCuenta()');
    tocarAbrirMiCuenta(P);
    sinPermisoHeredado(P, 'tras la cuenta creada y «Salir»');
  });
});

/* Lo que ve quien NO tocó «Autorizo y escaneo mi cédula»: el botón, la salida
   «Prefiero escribir mis datos», ninguna frase que afirme un permiso que no
   dio, y el rostro sin cámara ni ubicación. */
function sinPermisoHeredado(P, donde) {
  const h = cuerpo(P);
  assert.match(h, /id="btnAutorizoEscaneo"/, donde + ': no le ofrece el botón para dar SU permiso');
  assert.match(h, /id="btnEscribirDatos"/, donde + ': no le ofrece «Prefiero escribir mis datos»');
  assert.equal(/Diste tu permiso/.test(h), false, donde + ': le dice «Diste tu permiso» a quien no lo dio');
  assert.notEqual(P.ev('FOTOS.sensibles'), true, donde + ': la autorización de otro le vale');
  P.ev("pintarRegistro(indiceDe('rostro'))");
  assert.equal(/camVideo/.test(cuerpo(P)), false, donde + ': el rostro enciende la cámara con el permiso de otro');
  /* 21-oct-2026 — E2: decía solo /No autorizaste las fotos/. Desde hoy «No
     autorizaste» sale únicamente cuando la página vio el registro entero sin
     un permiso; con un intento que viene de otra carga (o en el que alguien
     tocó «Autorizo» y se fue), no se sabe qué pasó, y sale el texto que es
     verdad en todos los casos. Lo que esta prueba cuida no cambia: el rostro
     se salta y ninguna frase afirma un permiso que no se dio. */
  assert.match(cuerpo(P), /No autorizaste las fotos|Sin el permiso de las fotos este paso se salta/);
  assert.equal(/id="autSensible" checked/.test(P.ev('pasoPermiso()')), false, donde + ': la casilla de las fotos sale marcada');
}

describe('4. «Leímos tu cédula» solo de este registro (F8)', () => {

  test('F8 — refrescarDoc no le pinta la cédula leída de otro registro', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    /* Lo que quedó de otra cuenta que no alcanzó a subir sus fotos, en el teléfono. */
    P.ev("FOTOS.cedula_leida = " + JSON.stringify(MARIA) + "; FOTOS.cedula_reverso = 'data:image/jpeg;base64,RESPALDO_MARIA';" +
         " FOTOS.de = { celular: '" + CEL_MARIA + "', intento: 'de-otra-cuenta', t: Date.now() }; guardarFotos();");
    P.ev("pintarRegistro(indiceDe('documento'))");
    P.ev('cerrarEscanerDoc()');      // «Cancelar», o «Prefiero tomar las fotos con la cámara del celular»
    assert.equal(/MARIA|52123456/.test(P.ev("$('docLeido').innerHTML")), false,
      'al cerrar el escáner se le pintó el nombre y el documento de la cédula de otra persona');
  });
});

describe('5. un doble toque no guarda el respaldo como frente (F9)', () => {

  test('lo puro: ni a 0 ms, ni a 150, ni sin el aviso en pantalla', () => {
    const g = o => EC.guardarFrente(Object.assign({ conCodigo: true, aMano: true, avisoMostrado: true }, o)).guardar;
    assert.equal(g({ msDesdeRechazo: 0 }), false, 'un doble toque cuenta como insistir');
    assert.equal(g({ msDesdeRechazo: 150 }), false, 'un doble toque cuenta como insistir');
    assert.equal(g({ msDesdeRechazo: EC.FRENTE.MS_SEGUNDO_TOQUE - 1 }), false);
    assert.equal(g({ msDesdeRechazo: EC.FRENTE.MS_SEGUNDO_TOQUE }), true, 'insistir después de leer el aviso dejó de servir');
    assert.equal(g({ msDesdeRechazo: 3000, avisoMostrado: false }), false, 'guardó sin que el aviso estuviera en pantalla');
  });

  test('en la página: dos toques seguidos con el respaldo en el marco NO lo guardan como frente', () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    leerRespaldo(P, MARIA, 'MARIA');
    pasa(P, 1500);                     // pasa al frente…
    camara(P, 'MARIA');
    P.ev('codigoEnRecorte = function () { return true; };');   // …pero en el marco sigue el respaldo
    P.ev('capturarDoc()'); P.ev('capturarDoc()');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'el doble toque guardó el respaldo como frente');
    assert.match(P.ev("$('docNota').textContent"), /vuelve a tocar «Tomar la foto ahora»/);
    /* Quien de verdad tiene el frente y lee el aviso, sí sale. */
    P.ev('ESCDOC.tRechazoAMano -= ' + EC.FRENTE.MS_SEGUNDO_TOQUE + '; capturarDoc();');
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA');
  });
});

describe('6. un paso guardado por la versión anterior (F12, F14)', () => {
  const esPortada = P => /¿Ya abriste tu cuenta\?/.test(cuerpo(P));

  test('F14 — {paso:0} de solo abrir el formulario: el enlace abre la PORTADA, no «Tu celular»', () => {
    const P = abrirPlay({ almacen: { play_registro_paso: JSON.stringify({ paso: 0, t: Date.now() }) }, sesion: {}, hash: '' });
    assert.ok(esPortada(P), 'el {paso:0} viejo secuestró el enlace: cae en el formulario');
    assert.equal(/Paso \d+ de/.test(cuerpo(P)), false);
  });

  test('F12 — el rostro viejo sin cédula vuelve a «Tu cédula», sin decir que sigue donde iba', () => {
    const P = abrirPlay({ almacen: { play_registro_borrador: JSON.stringify({ celular: CEL_MARIA }),
      play_registro_paso: JSON.stringify({ paso: 2, t: Date.now() }), play_registro_toque: String(Date.now()) }, sesion: {}, hash: '' });
    assert.equal(P.ev('PASOS[PASO].id'), 'documento', 'se saltó la cédula');
    assert.equal(/Seguimos en el paso donde ibas/.test(caja(P)), false, 'dice que sigue donde iba, y no es verdad');
    assert.match(caja(P), /ahora empieza por tu cédula/);
  });

  test('F12 — con la cédula pero sin la expedición, vuelve a «Revisa tus datos», no a lo que el número viejo diría', () => {
    const almacen = {
      play_registro_borrador: JSON.stringify({ celular: CEL_MARIA, nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ',
        tipo_doc: 'Cédula de ciudadanía', documento: '52123456' }),
      play_fotos_borrador: JSON.stringify({ sensibles: true, cedula_reverso: 'data:x', cedula_frente: 'data:y',
        de: { celular: CEL_MARIA, t: Date.now() } }),
      play_registro_paso: JSON.stringify({ paso: 4, t: Date.now() }),     // 'contacto' en el orden viejo
      play_registro_toque: String(Date.now())
    };
    const P = abrirPlay({ almacen, sesion: {}, hash: '' });
    assert.equal(P.ev('PASOS[PASO].id'), 'identidad', 'se saltó «Revisa tus datos» con la expedición sin escribir');
    assert.equal(/Seguimos en el paso donde ibas/.test(caja(P)), false);
  });
});

describe('lo puro (app/escaner-cedula.js)', () => {

  test('el documento se compara en dígitos y sin los ceros del código', () => {
    assert.equal(EC.normalizarDocumento('0052123456'), '52123456');
    assert.equal(EC.normalizarDocumento('52.123.456'), '52123456');
    assert.equal(EC.mismoDocumento('0052123456', '52.123.456'), true);
    assert.equal(EC.mismoDocumento('52123456', '79111222'), false);
    assert.equal(EC.mismoDocumento('', ''), false, 'dos vacíos no son el mismo documento');
  });

  test('restosEnDuda: por la portada o el enlace siempre; al volver solo, pasado el rato de la cámara o el día', () => {
    const ahora = Date.parse('2026-10-20T15:00:00');
    const r = o => EC.restosEnDuda(Object.assign({ hayRestos: true, ahora }, o));
    assert.equal(EC.restosEnDuda({ hayRestos: false, retomando: false, ahora }), false, 'sin restos no hay nada que preguntar');
    assert.equal(r({ retomando: false, t: ahora - 1000 }), true, 'por la portada, con restos, no preguntó');
    assert.equal(r({ retomando: true, t: ahora - 60e3 }), false, 'la vuelta de la cámara preguntó');
    assert.equal(r({ retomando: true, t: ahora - EC.MINUTOS_VUELTA_DE_LA_CAMARA * 60e3 }), true);
    assert.equal(r({ retomando: true, t: 0 }), true, 'sin hora no se sabe de quién es');
    assert.equal(r({ retomando: true, t: Date.parse('2026-10-19T23:58:00'), ahora: Date.parse('2026-10-20T00:01:00') }), true, 'otro día');
  });
});
