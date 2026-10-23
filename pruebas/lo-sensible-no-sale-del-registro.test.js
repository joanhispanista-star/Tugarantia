'use strict';
/* ==========================================================================
 * LO SENSIBLE NO SALE DEL REGISTRO — 20 de octubre de 2026, rediseño
 *
 *   node --test pruebas/lo-sensible-no-sale-del-registro.test.js
 *
 * Dos rondas de revisión del registro con la cédula primero encontraron
 * caminos para que, en un teléfono compartido, la cédula de una persona (sus
 * fotos y la lectura del código de barras) terminara en la cuenta de otra. Y
 * cada ronda de reglas en el teléfono abrió otro camino (V1 a V7, la
 * verificación del 20-oct). Esta tanda no parcha casos: cambia de dónde
 * pueden salir las fotos.
 *
 *   A. NADA SENSIBLE SOBREVIVE A SALIR DEL REGISTRO. Las fotos, la lectura,
 *      las correcciones, la selfie, el GPS y el permiso viven mientras dura el
 *      registro de quien las tomó, y SOLO suben en su «Abrir mi cuenta». Volver
 *      a la portada, entrar con una cuenta, salir de ella, irse a PlataChat o
 *      dejar la pestaña más rato que la vuelta de la cámara las borra (V1, V4).
 *      Lo único que queda pendiente es la COLA de una cuenta ya creada, con su
 *      propia llave: ningún registro nuevo la pisa, solo esa cuenta la sube, y
 *      caduca diciéndolo (V5).
 *   B. EL FRENTE SIEMPRE DESPUÉS DEL RESPALDO, y la caja que lo muestra no
 *      miente cuando se suelta (V3, V7).
 *   C. EL DOCUMENTO VACÍO ES «NO SE SABE», y una cédula sin código se confirma
 *      mirándola antes de seguir (V1, V2).
 *
 * Cada prueba es el escenario de la verificación, contado como pasa, y corre
 * play/index.html DE VERDAD (pruebas/banco-play.js) con dos cédulas
 * fabricadas (pruebas/fabrica-pdf417.js). De las 15, 14 FALLAN con la página
 * de la mañana del 20-oct (3d542b5) y pasan con el rediseño; la otra cuida
 * que la vuelta de la cámara siga retomando con las fotos de quien las tomó.
 * La reja de la base (D) y el registro que se tumbaba (V6) están en
 * pruebas/la-cedula-de-la-cuenta-postgres.test.js.
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

/* La página con una cámara en vivo que pide permiso y nunca contesta, un GPS
   que cuenta, y un reloj que guarda los temporizadores para correrlos a mano.
   `sinCamara: true` es el navegador sin cámara en vivo: quedan las cajas. */
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

/* Lo que la cámara en vivo deja en el marco, con nombre para saber de quién es. */
function camara(P, quien) {
  P.ev("ESCDOC.recorte = { width: 900, height: 570 };" +
       "fotoDeLienzo = function () { return 'data:image/jpeg;base64,' + (ESCDOC.lado === 'frente' ? 'FRENTE' : 'RESPALDO') + '_" + quien + "'; };" +
       "$('docVideo').videoWidth = 1080; $('docVideo').videoHeight = 1920;" +
       'recortarGuia = function () { return { width: 900, height: 570 }; }; codigoEnRecorte = function () { return false; };');
}
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
/* Las cajas de foto (la cámara del celular): la foto lleva el nombre del
   archivo, y el código de barras no se lee (no hay lector en el banco). */
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
       " ref2_nombre: 'Juan', ref2_parentesco: 'Amigo', ref2_celular: '3004445566', nequi: '3001112233', cuentas_mias: 'si' }); guardarBorrador(REGISTRO);");
}
/* La nube de mentira: anota cada llamada. `subida` decide qué pasa con las
   fotos: por defecto entran todas; 'sin_red' es la petición que no sale. El
   login con contraseña devuelve la sesión de ese correo. */
function nube(P, subida) {
  P.ev('window.__subida = ' + JSON.stringify(subida || null) + ';' + `window.__llamadas = [];
    fetch = function (u, o) {
      var c = null; try { c = JSON.parse(o && o.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: c });
      if (/registro_archivos_guardar/.test(String(u)) && window.__subida === 'sin_red') return Promise.reject(new Error('sin señal'));
      var r = /auth\\/v1\\/signup/.test(String(u)) || /grant_type=password/.test(String(u))
        ? { access_token: 'tok-' + (c && c.email), refresh_token: 'ref', expires_in: 3600, user: { email: c && c.email } }
        : /registro_archivos_guardar/.test(String(u))
          ? (window.__subida || { ok: true, guardados: Object.keys((c && c.p_archivos) || {}) })
        : { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } });
    };`);
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}
const subidas = ll => ll().filter(x => /registro_archivos_guardar/.test(x.url));
function abrirLaCuenta(P) {
  elResto(P);
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
  P.ev('siguientePaso()');
}
/* Los botones de la pantalla, por su texto: se toca lo que la persona ve. */
function boton(html, texto) {
  const re = new RegExp('onclick="([^"]+)"[^>]*>' + texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<');
  const m = re.exec(html);
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}
function tocarAbrirMiCuenta(P) {
  P.ev('pintarEntrar()');
  const m = /<button class="btn arriba" onclick="([^"]+)">Abrir mi cuenta<\/button>/.exec(cuerpo(P));
  assert.ok(m, 'la portada no tiene el botón «Abrir mi cuenta»');
  P.ev(m[1]);
}
/* Entrar desde la portada con un celular y una contraseña, como en la caja. */
async function entrarDesdeLaPortada(P, cel) {
  P.ev('pintarEntrar()');
  P.ev("$('inTel').value = " + JSON.stringify(cel) + "; $('inClave').value = 'LaDeSiempre.1';");
  P.ev('entrar()');
  await asentar();
}
const nadaDe = (texto, quien) => assert.equal(/_MARIA|MARIA|52\.?123\.?456|RODRIGUEZ/.test(texto), false, quien);

describe('A. nada sensible sobrevive a salir del registro', () => {

  test('V1 — PEDRO ENTRA DESDE LA PORTADA CON SU CONTRASEÑA: la cédula que María dejó en «Revisa tus datos» no sube a la cuenta que él ya tenía', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');                         // María la deja en «Revisa tus datos»
    assert.equal(pasoActual(P), 'identidad');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');                             // Pedro, sin tocar el documento de María
    celularYClave(P, CEL_PEDRO);                         // su celular: las fotos quedan «de» él
    P.ev("pintarRegistro(indiceDe('documento'))");      // «Volver», «Volver»…
    const ll = nube(P);
    await entrarDesdeLaPortada(P, CEL_PEDRO);           // …y entra con la de siempre
    assert.equal(P.ev('VISTA'), 'cuenta', 'Pedro no quedó dentro de su cuenta');
    assert.equal(subidas(ll).length, 0, 'la cédula de María subió a la cuenta que Pedro ya tenía');
    nadaDe(JSON.stringify(ll()), 'algo de la cédula de María salió del teléfono');
    assert.equal(/_MARIA|52123456/.test(JSON.stringify(P.almacen)), false,
      'la cédula de María se quedó en el teléfono después de salir del registro');
  });

  test('V1 — …y tampoco si Pedro BORRA el documento antes de irse: vacío es «no se sabe», no «es el mismo»', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_PEDRO);
    P.ev("pintarRegistro(indiceDe('identidad')); $('f_documento').value = ''; anotarCampo($('f_documento'));");
    assert.equal(P.ev('REGISTRO.documento'), '');
    const ll = nube(P);
    await entrarDesdeLaPortada(P, CEL_PEDRO);
    assert.equal(subidas(ll).length, 0, 'con el documento borrado, la cédula de María subió a la cuenta de Pedro');
    nadaDe(JSON.stringify(ll()), 'algo de la cédula de María salió del teléfono');
  });

  test('V4 — PLATACHAT: «Volver» desde el primer paso suelta lo de María, y quien abre el registro después no lo ve', () => {
    const P = abrir({ search: '?marca=platachat' });
    assert.equal(P.ev('MARCA'), 'platachat');
    escanear(P, MARIA, 'MARIA');
    P.ev('pintarRegistro(0)');                           // «Volver»
    const volver = boton(cuerpo(P), 'Volver');
    assert.equal(volver, 'volverAPlataChat()', 'el «Volver» del primer paso no va a PlataChat');
    P.ev(volver);                                        // «Volver»: sale a PlataChat
    /* Pedro toca «Abrir cuenta» en PlataChat poco después. */
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, search: '?marca=platachat', hash: '#registro' });
    assert.deepEqual(Q.fallos, []);
    nadaDe(cuerpo(Q) + (Q.elems.errReg ? Q.elems.errReg.innerHTML : ''), 'Pedro ve la cédula de María al abrir el registro de PlataChat');
    assert.equal(/La página se volvió a abrir/.test(Q.elems.errReg ? Q.elems.errReg.innerHTML : ''), false,
      'le dice que «la página se volvió a abrir» a quien la abrió por primera vez');
    assert.equal(/_MARIA|52123456/.test(JSON.stringify(P.almacen)), false, 'la cédula de María se quedó en el teléfono');
  });

  test('ABANDONADA: la pestaña que vuelve media hora después pregunta, y «Seguir» ya no trae las fotos ni la lectura', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    P.ev("REGISTRO.correo = 'maria@correo.com'; guardarBorrador(REGISTRO);");   // algo que escribió a mano
    const antes = Date.now() - 30 * 60e3;
    P.almacen.play_registro_toque = String(antes);
    P.almacen.play_registro_paso = JSON.stringify(Object.assign(JSON.parse(P.almacen.play_registro_paso), { t: antes }));
    const f = JSON.parse(P.almacen.play_fotos_borrador); f.de.t = antes; P.almacen.play_fotos_borrador = JSON.stringify(f);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.match(cuerpo(Q), /En este teléfono quedó un registro a medias\. ¿Es tuyo\?/);
    assert.equal(/_MARIA|52123456/.test(JSON.stringify(Q.almacen)), false,
      'la cédula abandonada sigue en el teléfono, a un «Seguir» de cualquiera');
    Q.ev(boton(cuerpo(Q), 'Seguir'));
    nadaDe(cuerpo(Q), '«Seguir» le devolvió a quien lo tocó la cédula abandonada');
    assert.equal(Q.ev('REGISTRO.correo'), 'maria@correo.com', 'lo que se escribió a mano también se perdió');
  });

  test('…pero la vuelta de la cámara (un minuto) sigue sin preguntar y sin perder las fotos de quien las tomó', () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.equal(Q.ev('PASOS[PASO].id'), 'identidad');
    assert.match(Q.elems.errReg.innerHTML, /La página se volvió a abrir/);
    assert.equal(Q.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA', 'la vuelta de la cámara perdió el frente');
    assert.equal(Q.ev("hayFotoLista('cedula_reverso')"), true);
  });
});

describe('V5. la cola de una cuenta ya creada', () => {

  /* María abre su cuenta sin señal: la subida de sus fotos no sale. */
  async function mariaSinSenal() {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    const ll = nube(P, 'sin_red');
    abrirLaCuenta(P);
    await asentar();
    assert.equal(subidas(ll).length, 1, 'la subida ni se intentó');
    return P;
  }
  const entraMaria = async almacen => {
    const M = abrir({ almacen, sesion: {}, hash: '' });
    const ll = nube(M);
    M.ev("pintarCuenta({ access_token: 'tok-m', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    return { M, ll };
  };

  test('V5 — PEDRO EMPIEZA SU REGISTRO EN EL MISMO TELÉFONO: las fotos de María no se borran, y suben cuando ella vuelve a entrar', async () => {
    const P = await mariaSinSenal();
    P.ev('salirDeCuenta()');
    tocarAbrirMiCuenta(P);                               // Pedro
    P.ev('autorizarYEscanear()');                        // su permiso se escribe en el teléfono
    P.ev('empezarDeNuevo()');                            // y hasta «Empezar de cero»
    const { ll } = await entraMaria(P.almacen);
    const s = subidas(ll)[0];
    assert.ok(s, 'las fotos de María se borraron en silencio cuando Pedro empezó su registro');
    assert.equal(s.cuerpo.p_archivos.cedula_reverso, 'data:image/jpeg;base64,RESPALDO_MARIA');
    assert.equal(s.cuerpo.p_huella.cedula_leida.documento, '52123456');
  });

  test('V5 — LA PANTALLA LO DICE: «Listo» no calla que las fotos no subieron, y su cuenta trae el botón para reintentar', async () => {
    const P = await mariaSinSenal();
    assert.match(cuerpo(P), /Tu cuenta quedó creada/);
    assert.match(avisoFotos(P), /no alcanzaron a subir/, '«Listo» calla que las fotos no subieron');
    /* Vuelve a entrar, todavía sin señal: su cuenta se lo dice, con el botón. */
    const M = abrir({ almacen: P.almacen, sesion: {}, hash: '' });
    nube(M, 'sin_red');
    M.ev("pintarCuenta({ access_token: 'tok-m', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    const aviso = avisoFotos(M);
    assert.match(aviso, /no han subido/, 'su cuenta no le dice que sus fotos siguen en el teléfono');
    const reintentar = boton(aviso, 'Subirlas ahora');
    assert.ok(reintentar, 'no hay botón para reintentar');
    /* Con señal, el botón las sube y la caja lo dice. */
    const ll = nube(M);
    M.ev(reintentar);
    await asentar();
    assert.equal(subidas(ll).length, 1, 'el botón no subió nada');
    assert.match(avisoFotos(M), /llegaron/);
    /* Y la cuenta de otro no ve nada de esto. */
    const O = abrir({ almacen: M.almacen, sesion: {}, hash: '' });
    nube(O);
    O.ev("pintarCuenta({ access_token: 'tok-o', user: { email: '57" + CEL_PEDRO + "@tugarantia.net' } })");
    await asentar();
    assert.equal(/fotos/.test(avisoFotos(O)), false,
      'la cuenta de Pedro habla de las fotos de María');
  });

  test('LA COLA DE LA VERSIÓN PUBLICADA: la de una cuenta recién abierta en este teléfono sube; un formulario con un celular, no', async () => {
    /* Lo que deja la versión del 15-oct cuando la subida falla: las fotos en la
       llave del registro, con su celular y sin intento, el borrador ya borrado
       y la marca de la cuenta recién creada. */
    const lote = JSON.stringify({ sensibles: true, cedula_reverso: 'data:image/jpeg;base64,RESPALDO_MARIA',
      cedula_leida: { documento: '52123456' }, de: { celular: CEL_MARIA, t: Date.now() - 60e3 } });
    const conMarca = abrir({ hash: '', sesion: {}, almacen: { play_fotos_borrador: lote,
      play_cuenta_creada: JSON.stringify({ celular: CEL_MARIA, t: Date.now() - 60e3 }) } });
    const ll = nube(conMarca);
    conMarca.ev("pintarCuenta({ access_token: 'tok-m', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    assert.equal(subidas(ll).length, 1, 'la cola que dejó la versión anterior se perdió al actualizar');
    /* Sin la marca, es un formulario abandonado con el celular de alguien: el
       camino de V1. No sube, aunque entre esa cuenta.
       20-oct-2026, buena fe (A6) — y un formulario abandonado deja su BORRADOR
       (la versión publicada solo lo borra al crear la cuenta, o con «Empezar de
       cero», que se lleva las fotos): sin borrador, esas fotos son la cola de
       la cuenta que se creó aquí, y sí se adoptan (la-persona-de-buena-fe).
       Aquí va el borrador de quien lo dejó a medias, como queda de verdad. */
    const sinMarca = abrir({ hash: '', sesion: {}, almacen: { play_fotos_borrador: lote,
      play_registro_borrador: JSON.stringify({ celular: CEL_MARIA, nombres: 'MARIA JOSE', documento: '52123456' }) } });
    const ll2 = nube(sinMarca);
    sinMarca.ev("pintarCuenta({ access_token: 'tok-m', user: { email: '57" + CEL_MARIA + "@tugarantia.net' } })");
    await asentar();
    assert.equal(subidas(ll2).length, 0, 'un formulario abandonado subió a la cuenta de su celular al iniciar sesión');
    assert.equal(/RESPALDO_MARIA/.test(JSON.stringify(sinMarca.almacen)), false);
  });

  test('YA TENÍA CUENTA Y PUSO OTRA CONTRASEÑA: la escribe ahí mismo y termina su registro, con sus fotos', async () => {
    const P = abrir();
    escanear(P, MARIA, 'MARIA');
    casillas(P, 'identidad', { expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    celularYClave(P, CEL_MARIA);
    /* El signup dice «ya existe», y la contraseña del registro no es la de su
       cuenta; la segunda, la de la caja, sí. */
    P.ev(`window.__llamadas = []; window.__claves = [];
      fetch = function (u, o) {
        var c = null; try { c = JSON.parse(o && o.body); } catch (e) {}
        window.__llamadas.push({ url: String(u), cuerpo: c });
        var bien = function (r) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };
        if (/auth\\/v1\\/signup/.test(String(u))) return Promise.resolve({ ok: false, status: 422, json: function () { return Promise.resolve({ msg: 'User already registered' }); } });
        if (/grant_type=password/.test(String(u))) {
          window.__claves.push(c.password);
          return c.password === 'LaDeMiCuenta.1' ? bien({ access_token: 'tok', user: { email: c.email } })
            : Promise.resolve({ ok: false, status: 400, json: function () { return Promise.resolve({ error: 'invalid_grant' }); } });
        }
        if (/registro_archivos_guardar/.test(String(u))) return bien({ ok: true, guardados: Object.keys(c.p_archivos || {}) });
        return bien({ ok: true });
      };`);
    abrirLaCuenta(P);
    await asentar();
    assert.match(P.ev("$('errReg').textContent"), /esa contraseña no es la suya/);
    assert.match(caja(P), /id="rClaveCuenta"/, 'no le deja escribir la contraseña de su cuenta sin salir del registro');
    P.ev("$('rClaveCuenta').value = 'LaDeMiCuenta.1';");
    P.ev(boton(caja(P), 'Entrar y terminar mi registro'));
    await asentar();
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__claves)')), ['Perro.2026x', 'LaDeMiCuenta.1']);
    const s = JSON.parse(P.ev('JSON.stringify(window.__llamadas)')).find(x => /registro_archivos_guardar/.test(x.url));
    assert.ok(s, 'sus fotos no subieron a la cuenta que ya tenía');
    assert.equal(s.cuerpo.p_huella.cedula_leida.documento, '52123456');
  });

  test('V5 — LA COLA CADUCA DICIÉNDOLO: pasado un día sin subir se borra del teléfono, y su cuenta se lo cuenta', async () => {
    const P = await mariaSinSenal();
    assert.ok(P.almacen.play_fotos_cola, 'la cola de María no tiene su propia llave');
    const colas = JSON.parse(P.almacen.play_fotos_cola);
    assert.ok(colas[CEL_MARIA], 'la cola no está a nombre de la cuenta de María');
    colas[CEL_MARIA].de.t = Date.now() - 25 * 3600e3;
    P.almacen.play_fotos_cola = JSON.stringify(colas);
    const { M, ll } = await entraMaria(P.almacen);
    assert.equal(subidas(ll).length, 0, 'subió fotos de hace más de un día');
    assert.equal(/RESPALDO_MARIA/.test(JSON.stringify(M.almacen)), false, 'las fotos vencidas siguen en el teléfono');
    assert.match(avisoFotos(M), /no alcanzaron a subir/);
    assert.match(avisoFotos(M), /chat/, 'no le dice cómo mandarnos la cédula');
  });
});

describe('B. el frente siempre después del respaldo', () => {

  test('V3 — UN FRENTE TOMADO ANTES DEL PRIMER RESPALDO no viaja con el respaldo de otra persona, y la página no pasa sola al paso 2', async () => {
    const P = abrir();
    P.ev('autorizarYEscanear()');
    conCajas(P);
    await fotoEnCaja(P, 'cedula_frente', 'FRENTE_MARIA');    // María toma solo el frente y se va
    assert.equal(P.ev('FOTOS.cedula_frente'), 'data:image/jpeg;base64,FRENTE_MARIA');
    leerRespaldo(P, PEDRO, 'PEDRO');                         // Pedro: su respaldo, leído
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'el frente de María se quedó con el respaldo de Pedro');
    assert.match(P.ev("$('docListoTxt').textContent"), /Ahora el frente/, 'no le pide el frente de su respaldo');
    pasa(P, 1500);
    assert.equal(pasoActual(P), 'documento', 'pasó solo a «Revisa tus datos» con el frente de otra persona');
  });

  test('V7 — REPETIR EL RESPALDO CON LA CAJA suelta el frente, y su caja deja de decir «Listo»', async () => {
    const P = abrir({ sinCamara: true });
    P.ev('autorizarYEscanear()');
    conCajas(P);
    await fotoEnCaja(P, 'cedula_reverso', 'RESPALDO_MARIA');
    await fotoEnCaja(P, 'cedula_frente', 'FRENTE_MARIA');
    assert.equal(pasoActual(P), 'identidad');
    P.ev('pintarRegistro(0)');                               // vuelve a la cédula
    await fotoEnCaja(P, 'cedula_reverso', 'RESPALDO_MARIA_2');   // el primero salió borroso
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined);
    const fijo = P.elems.docFijo.innerHTML;
    const i = fijo.indexOf('id="fot_cedula_frente"');
    assert.ok(i >= 0, 'la caja del frente no se volvió a pintar: sigue la de antes');
    const delFrente = fijo.slice(i, fijo.indexOf('</label>', i));
    assert.equal(/Listo/.test(delFrente), false, 'la caja del frente sigue diciendo «Listo» de una foto que ya no existe');
    assert.equal(/FRENTE_MARIA/.test(delFrente), false, 'la caja del frente sigue mostrando la miniatura borrada');
  });
});

describe('C. una cédula sin código se confirma mirándola', () => {

  /* María toma las dos fotos de su cédula gris (sin código: no se lee) y se va.
     La página pasa sola a «Escribe tus datos». */
  async function cedulaSinCodigo() {
    const P = abrir({ sinCamara: true });
    P.ev('autorizarYEscanear()');
    conCajas(P);
    await fotoEnCaja(P, 'cedula_reverso', 'RESPALDO_MARIA');
    await fotoEnCaja(P, 'cedula_frente', 'FRENTE_MARIA');
    assert.equal(pasoActual(P), 'identidad');
    assert.match(cuerpo(P), /Escribe tus datos/);
    return P;
  }

  test('V2 — PEDRO ESCRIBE SUS DATOS DE BUENA FE: la página le muestra la cédula y le pregunta si es suya; «No es mía» la borra y su cuenta se abre sin ella', async () => {
    const P = await cedulaSinCodigo();
    casillas(P, 'identidad', { nombres: 'PEDRO LUIS', apellidos: 'GOMEZ DIAZ', tipo_doc: 'Cédula de ciudadanía',
                               documento: '79111222', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'identidad', 'siguió sin preguntar de quién es la cédula que no se pudo leer');
    assert.match(caja(P), /FRENTE_MARIA/, 'pregunta sin mostrar la cédula');
    assert.match(caja(P), /79\.111\.222/, 'no dice por qué documento pregunta');
    const noEsMia = boton(caja(P), 'No es mía · borrar las fotos');
    assert.ok(noEsMia, 'no hay salida para decir que no es suya');
    P.ev(noEsMia);
    assert.equal(P.ev("hayFotoLista('cedula_frente') || hayFotoLista('cedula_reverso')"), false);
    P.ev('siguientePaso()');
    assert.equal(pasoActual(P), 'entrada');
    celularYClave(P, CEL_PEDRO);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.ok(ll().some(x => /auth\/v1\/signup/.test(x.url)), 'la cuenta de Pedro no se abrió');
    assert.equal(subidas(ll).length, 0, 'las fotos de la cédula de María subieron a la cuenta de Pedro');
    nadaDe(JSON.stringify(ll()), 'algo de la cédula de María salió del teléfono');
  });

  test('V2 — …y la dueña dice «Sí, es mía»: sus fotos suben, con el documento que confirmó', async () => {
    const P = await cedulaSinCodigo();
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
                               documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    const esMia = boton(caja(P), 'Sí, es mía');
    assert.ok(esMia);
    P.ev(esMia);
    assert.equal(pasoActual(P), 'entrada');
    celularYClave(P, CEL_MARIA);
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    const s = subidas(ll)[0];
    assert.ok(s, 'la cédula de la dueña no subió');
    assert.deepEqual(Object.keys(s.cuerpo.p_archivos).sort(), ['cedula_frente', 'cedula_reverso']);
  });

  test('V2 — si después cambia el documento, la confirmación ya no vale: se pregunta otra vez al abrir la cuenta', async () => {
    const P = await cedulaSinCodigo();
    casillas(P, 'identidad', { nombres: 'MARIA JOSE', apellidos: 'RODRIGUEZ PEREZ', tipo_doc: 'Cédula de ciudadanía',
                               documento: '52123456', expedicion: '2010-05-20' });
    P.ev('siguientePaso()');
    P.ev(boton(caja(P), 'Sí, es mía'));
    celularYClave(P, CEL_PEDRO);
    P.ev("REGISTRO.documento = '79111222'; guardarBorrador(REGISTRO);");   // otro documento, ya confirmada la foto
    const ll = nube(P);
    abrirLaCuenta(P);
    await asentar();
    assert.equal(ll().some(x => /auth\/v1\/signup/.test(x.url)), false, 'abrió la cuenta sin volver a preguntar');
    assert.match(caja(P), /79\.111\.222/);
    assert.match(caja(P), /FRENTE_MARIA/);
  });
});
