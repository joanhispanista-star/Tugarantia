/* ============================================================================
 * «TU FONDO DE PENSIONES» EN EL REGISTRO DE play/ — 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones-registro.test.js
 *
 * La página de verdad en el banco (pruebas/banco-registro.js): dónde va el
 * paso, qué pinta, que nunca frena el registro, qué se lleva cada salida, y
 * que lo escogido sube con la sesión de la cuenta que se abre —y solo con
 * ella— al tocar «Abrir mi cuenta». Los toques de la pantalla (escoger un
 * archivo, pegar) se prueban en un Chrome sin ventana (ver el lote del 28-oct
 * en el scratchpad): el banco no tiene DOM de verdad.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

const PDF64 = Buffer.from('%PDF-1.4\n% historia de mentira\n%%EOF\n', 'binary').toString('base64');
const hl = P => B.texto(P.ev("(document.getElementById('hlPaso') || {}).innerHTML || ''"));
const hlCrudo = P => P.ev("(document.getElementById('hlPaso') || {}).innerHTML || ''");
const avisoPension = P => B.texto(P.ev("(document.getElementById('avisoPension') || {}).innerHTML || ''"));

/* María con su celular y sus datos, parada en el paso del fondo. */
function enElPaso(opc) {
  const P = B.abrir(opc);
  P.ev('Object.assign(REGISTRO, ' + JSON.stringify(Object.assign({ celular: B.CEL_MARIA }, B.DATOS_MARIA, B.CONTACTO_MARIA, B.RESTO)) + '); guardarBorrador(REGISTRO);');
  /* Como si hubiera pasado «Tu celular y tu contraseña» con el suyo. */
  P.ev('anotarCelularDelRegistro(' + JSON.stringify(B.CEL_MARIA) + ')');
  P.ev("pintarRegistro(indiceDe('pension'))");
  return P;
}
/* Lo que la persona escoge en el paso, dicho al guardadero como lo dice la pantalla. */
function escoger(P, fondos, archivos) {
  P.ev('(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular);' +
       ' e.aut = HL.armarAutorizacion(new Date().toISOString()); e.fondos = ' + JSON.stringify(fondos) + '; g.guardarEstado(e); })()');
  (archivos || []).forEach(a => P.ev('guardaderoPension().agregar(REGISTRO.intento, REGISTRO.celular, ' + JSON.stringify(a) + ')'));
}
const UN_PDF = { tipo: 'pdf', bytes: 38, base64: PDF64, sha256: 'h1' };

describe('dónde va, y que nunca frena el registro', () => {
  test('después de «De qué vives» y antes de la plata; ni en PlataChat ni sin sus archivos', () => {
    const P = B.abrir();
    const ids = P.ev('PASOS.map(function (p) { return p.id; }).join()').split(',');
    assert.equal(ids.indexOf('pension'), ids.indexOf('ingresos') + 1);
    assert.equal(P.ev("PASOS[indiceDe('pension')].titulo"), 'Tu fondo de pensiones');
    assert.equal(B.abrir({ search: '?marca=platachat' }).ev("indiceDe('pension')"), -1, 'PlataChat también lo tiene');
    assert.equal(B.abrir({ sinPension: true }).ev("indiceDe('pension')"), -1, 'sin sus archivos el paso igual aparece');
  });

  test('se pinta con «Lo hago después» arriba y la autorización SIN marcar; sin ella no pregunta el fondo', async () => {
    const P = enElPaso();
    await B.asentar(10);
    assert.match(B.cuerpo(P), /Paso 8 de 11[\s\S]*Tu fondo de pensiones/);
    const h = hlCrudo(P);
    assert.ok(h.indexOf('Lo hago después') > 0 && h.indexOf('Lo hago después') < h.indexOf('id="hlAut"'),
      '«Lo hago después» no está arriba de la autorización');
    assert.match(h, /<input type="checkbox" id="hlAut" data-hl="aut">/, 'la autorización nació marcada');
    assert.equal(/data-hl="fondo"/.test(h), false);
    assert.match(hl(P), /Opcional/);
  });

  test('«Continuar» y «Lo hago después» pasan a «¿Dónde te enviamos la plata?», con o sin nada escogido', () => {
    const P = enElPaso();
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    const Q = enElPaso();
    Q.ev("HL.pasoDelRegistro(document.getElementById('hlPaso'), { guardadero: guardaderoPension(), intento: REGISTRO.intento," +
         " celular: REGISTRO.celular, despues: function () { pintarRegistro(PASO + 1); } })");
    Q.ev('(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular); e.despues = true; g.guardarEstado(e); pintarRegistro(PASO + 1); })()');
    assert.equal(B.pasoActual(Q), 'cobro');
    /* Con la autorización, el fondo y un PDF, «Continuar» también pasa. */
    const R = enElPaso();
    escoger(R, ['porvenir'], [UN_PDF]);
    R.ev('siguientePaso()');
    assert.equal(B.pasoActual(R), 'cobro');
  });

  test('con la autorización y el fondo: sus pasos y el botón a la página OFICIAL, en otra pestaña', async () => {
    const P = enElPaso();
    escoger(P, ['colpensiones', 'porvenir']);
    P.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(10);
    const h = hlCrudo(P);
    assert.match(h, /id="hlAut" data-hl="aut" checked/);
    assert.match(h, /href="https:\/\/sede\.colpensiones\.gov\.co\/tramite\/updInfo\/55\/" target="_blank" rel="noopener noreferrer"/);
    assert.match(h, /href="https:\/\/www\.porvenir\.com\.co\/web\/certificados-y-extractos\/certificado-de-historia-laboral" target="_blank"/);
    assert.match(hl(P), /Abrir la página de Porvenir/);
    assert.match(hl(P), /vuelve a esta pestaña de Tu Garantía/);
    /* 28-oct-2026 (arreglo, ronda 1) — y ANTES de irse sabe cuánto puede
       tardar: pasado ese rato con la página cerrada, la regla de la vuelta de
       la cámara le borra la cédula y la selfie (ver el-fondo-de-pensiones.test.js). */
    assert.ok(h.indexOf('id="hlAntesDeIrte"') > 0 && h.indexOf('id="hlAntesDeIrte"') < h.indexOf('data-hl="abrir"'),
      'el aviso de los minutos no va antes de «Abrir la página»');
    assert.match(hl(P), new RegExp('vuelve en menos de ' + P.ev('EC.MINUTOS_VUELTA_DE_LA_CAMARA') + ' minutos'));
    ['📄 Subir el PDF', '🖼️ Subir pantallazos', '📋 Pegar'].forEach(b => assert.ok(hl(P).indexOf(b) >= 0, 'falta ' + b));
  });
});

describe('lo que sobrevive y lo que se va', () => {
  test('lo escogido sobrevive a irse al correo y que la pestaña se vuelva a abrir', async () => {
    const almacen = {}, sesion = {};
    const P = enElPaso({ almacen, sesion });
    escoger(P, ['proteccion']);
    P.ev("(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular); e.pidio = { proteccion: new Date().toISOString() }; g.guardarEstado(e); })()");
    const Q = B.abrir({ almacen, sesion });
    await B.asentar(10);
    assert.equal(B.pasoActual(Q), 'pension', 'no volvió al paso del fondo');
    assert.match(hlCrudo(Q), /data-hl="fondo" value="proteccion" checked/, 'se perdió el fondo al volver del correo');
    assert.match(hl(Q), /Abriste la página de Protección hoy/);
  });

  test('«Empezar de cero» y otro celular se llevan TODO lo del fondo', async () => {
    const P = enElPaso();
    escoger(P, ['skandia'], [UN_PDF]);
    P.ev('empezarDeNuevo()');
    await B.asentar(5);
    assert.equal(P.ev("localStorage.getItem('play_pension')"), null, 'lo escogido por la persona anterior se quedó');
    const Q = enElPaso();
    escoger(Q, ['skandia'], [UN_PDF]);
    const intento = Q.ev('REGISTRO.intento');
    Q.ev("pintarRegistro(indiceDe('entrada'))");
    B.toque(Q, B.CEL_PEDRO, B.CLAVE_PEDRO);
    await B.asentar(5);
    assert.equal(Q.ev('guardaderoPension().estado(' + JSON.stringify(intento) + ', ' + JSON.stringify(B.CEL_MARIA) + ').aut'), null,
      'con otro celular, la autorización de María se quedó');
  });

  test('salir a la portada suelta los archivos (como las fotos) y deja lo escogido (como el borrador)', async () => {
    const P = enElPaso();
    escoger(P, ['colfondos'], [UN_PDF]);
    await B.asentar(5);
    P.ev('pintarEntrar()');
    await B.asentar(5);
    const r = JSON.parse(P.ev('JSON.stringify({ n: 0 })'));
    P.ev('guardaderoPension().archivos(REGISTRO.intento, REGISTRO.celular).then(function (r) { window.__n = r.lista.length; })');
    await B.asentar(5);
    assert.equal(P.ev('window.__n'), 0, 'los archivos se quedaron al salir del registro');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(guardaderoPension().estado(REGISTRO.intento, REGISTRO.celular).fondos)')), ['colfondos']);
    assert.ok(r);
  });

  test('al volver pasado el rato de la cámara, los archivos se sueltan y el paso lo dice; dentro del rato, no', async () => {
    const corre = async minutos => {
      const almacen = {}, sesion = {};
      const P = enElPaso({ almacen, sesion });
      escoger(P, ['porvenir'], [UN_PDF]);
      await B.asentar(5);
      assert.equal(P.ev('guardaderoPension().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), true);
      const D0 = Date, d = minutos * 60e3;
      class Luego extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + d); } static now() { return D0.now() + d; } }
      const Q = B.abrir({ almacen, sesion, Date: Luego });
      await B.asentar(10);
      return Q;
    };
    const tarde = await corre(25);
    assert.equal(tarde.ev('guardaderoPension().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), false);
    if (B.pasoActual(tarde) === 'pension') assert.match(hl(tarde), /se borraron de este teléfono/);
    const pronto = await corre(2);
    assert.equal(pronto.ev('PENSION_PERDIDOS'), false, 'soltó los archivos de quien volvió en dos minutos');
  });
});

describe('al abrir la cuenta: sube con la sesión de ESA cuenta, y se dice', () => {
  test('la autorización, el fondo y el PDF, con el token de la cuenta nueva; la caja dice que llegó', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['colpensiones', 'porvenir'], [UN_PDF]);
    await B.asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    const l = llamadas();
    const aut = l.find(x => /rpc\/pension_autorizar/.test(x.url));
    const sub = l.find(x => /rpc\/pension_subir/.test(x.url));
    assert.ok(aut, 'la autorización del fondo no salió');
    assert.deepEqual(aut.cuerpo.p_fondos, ['colpensiones', 'porvenir']);
    assert.equal(aut.cuerpo.p_version, '2026-11-03');
    assert.match(aut.auth, /^Bearer tok-573001112233@tugarantia\.net-/, 'no salió con la sesión de la cuenta de María');
    assert.ok(sub, 'el PDF no salió');
    assert.equal(sub.cuerpo.p_archivo, PDF64);
    assert.ok(l.indexOf(aut) < l.indexOf(sub), 'el archivo salió antes que la autorización');
    assert.ok(l.findIndex(x => /auth\/v1\/signup/.test(x.url)) < l.indexOf(aut), 'salió antes de que existiera la cuenta');
    assert.match(avisoPension(P), /Tu historia laboral llegó/);
    /* Y no se queda nada en el teléfono. */
    P.ev("guardaderoPension().cola('" + B.CEL_MARIA + "').then(function (c) { window.__cola = c; })");
    await B.asentar(5);
    assert.equal(P.ev('window.__cola'), null);
    assert.equal(P.ev("localStorage.getItem('play_pension')"), null);
  });

  test('lo dejó para después (autorizó y escogió, sin archivo): llegan la autorización y el fondo', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['nunca']);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    const l = llamadas();
    assert.ok(l.some(x => /pension_autorizar/.test(x.url) && x.cuerpo.p_fondos[0] === 'nunca'));
    assert.equal(l.some(x => /pension_subir/.test(x.url)), false);
    assert.match(avisoPension(P), /Guardamos tu autorización y tu fondo/);
    /* «súbela desde tu cuenta», con el camino al lado: el Perfil de ESTA
       cuenta, nunca un enlace al quincenal (la frontera de Play). */
    const h = P.ev("document.getElementById('avisoPension').innerHTML");
    assert.match(h, /onclick="abrirHistoriaLaboralEnPerfil\(\);return false">Subirla desde tu Perfil<\/a>/);
    assert.equal(/socio\.html/.test(h), false, 'play/ enlaza a la app del quincenal');
    P.ev('abrirHistoriaLaboralEnPerfil()');
    await B.asentar(20);
    assert.equal(P.ev('VISTA + "/" + TAB'), 'cuenta/perfil');
  });

  test('sin la autorización, nada del fondo sale (ni lo escogido sin marcar la casilla)', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    P.ev('(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular); e.fondos = ["porvenir"]; g.guardarEstado(e); })()');
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.equal(llamadas().some(x => /pension_/.test(x.url)), false, 'salió algo del fondo sin la autorización');
    assert.equal(avisoPension(P), '');
  });

  test('la base sin la migración (404): se queda en el teléfono y se dice; entrar a la cuenta lo reintenta', async () => {
    const P = B.abrir();
    B.nube(P);
    P.ev("window.__fetchOriginal = fetch; fetch = function (u, op) {" +
         " if (/rpc\\/pension_/.test(String(u))) return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });" +
         " return window.__fetchOriginal(u, op); };");
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.match(avisoPension(P), /todavía no está encendida/);
    /* Y sin el camino al Perfil: con la base así, la tarjeta tampoco aparece. */
    assert.equal(/Subirla desde tu Perfil/.test(P.ev("document.getElementById('avisoPension').innerHTML")), false,
      'ofrece un camino que no lleva a nada');
    P.ev("guardaderoPension().cola('" + B.CEL_MARIA + "').then(function (c) { window.__cola = c; })");
    await B.asentar(5);
    assert.ok(P.ev('!!window.__cola'), 'la historia laboral se perdió con la base sin la migración');
    /* Ya con la base al día, entrar a la cuenta la sube. */
    P.ev('fetch = window.__fetchOriginal; window.__llamadas = [];');
    P.ev('pintarCuenta()');
    await B.asentar(30);
    assert.ok(JSON.parse(P.ev('JSON.stringify(window.__llamadas.map(function (x) { return x.url; }))')).some(u => /pension_subir/.test(u)));
    assert.match(avisoPension(P), /Tu historia laboral llegó/);
  });

  test('el «después» existe también aquí: el Perfil de la cuenta de play/ trae «Tu historia laboral», con la sesión de ESA cuenta', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    P.ev("pintarCuenta(); irA('perfil')");
    await B.asentar(30);
    assert.match(P.ev('laminaPerfil()'), /<div id="hlCuenta"><\/div>/, 'el Perfil no trae el lugar de la tarjeta');
    const mia = llamadas().filter(x => /rpc\/pension_mia/.test(x.url));
    assert.ok(mia.length >= 1, 'el Perfil no preguntó por la historia laboral');
    assert.match(mia[0].auth, /^Bearer tok-573001112233@tugarantia\.net-/, 'no preguntó con la sesión de la cuenta');
    assert.match(B.texto(P.ev("document.getElementById('hlCuenta').innerHTML")), /Tu historia laboral · opcional/);
    /* Y en PlataChat, ni el lugar. */
    assert.equal(B.abrir({ search: '?marca=platachat' }).ev("SESION = { access_token: 't', user: { email: '573001112233@tugarantia.net' } }; montarHistoriaLaboralEnPerfil(); document.getElementById('hlCuenta').innerHTML"), '');
  });

  /* 28-oct-2026 (arreglo de los leves, P7) — la cola de una cuenta solo se
     borraba si ESA cuenta volvía a este teléfono. Ahora play/ barre lo
     vencido al abrir, y la tarjeta del Perfil borra la cola de su cuenta al
     retirar la autorización. Con el código de antes, la cola vencida de otra
     cuenta seguía en el teléfono y la tarjeta no sabía de ninguna cola. */
  test('al abrir play/ se barre lo vencido de la historia laboral de cualquier cuenta; lo vigente se queda', async () => {
    const { idbDeMentira } = require('./idb-de-mentira.js');
    const { hasta } = require('./esperar.js');
    const ahora = Date.now();
    const idb = idbDeMentira({
      'cola:3009998877': { celular: '3009998877', t: ahora - 25 * 3600e3, archivos: [{ id: 'a', base64: PDF64 }] },
      'cola:3001112233': { celular: '3001112233', t: ahora - 3600e3, archivos: [] } });
    B.abrir({ indexedDB: idb });
    assert.ok(await hasta(() => !idb.datos.has('cola:3009998877'), 200), 'la historia laboral vencida de otra cuenta se quedó en el teléfono');
    assert.ok(idb.datos.has('cola:3001112233'), 'se llevó lo vigente');
  });

  test('la tarjeta del Perfil borra al retirar la cola de ESTA cuenta, y el aviso deja de decir «Lo volvemos a intentar»', async () => {
    const P = B.abrir();
    B.nube(P);
    B.mariaHastaElPermiso(P, false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    P.ev('window.__opciones = null; var __montar = HL.tarjetaDeCuenta; HL.tarjetaDeCuenta = function (c, o) { window.__opciones = o; return __montar(c, o); };');
    P.ev("pintarCuenta(); irA('perfil')");
    await B.asentar(30);
    assert.ok(P.ev('!!window.__opciones'), 'el Perfil no montó la tarjeta');
    assert.ok(P.ev('window.__opciones.guardadero === guardaderoPension()'), 'la tarjeta no tiene la cola del teléfono para borrarla al retirar');
    assert.equal(P.ev('window.__opciones.celular()'), B.CEL_MARIA, 'la tarjeta borraría la cola de otro celular');
    P.ev("pintarAvisoPension('<b>Tu historia laboral no alcanzó a subir.</b> Lo volvemos a intentar…', 'ambar')");
    P.ev('window.__opciones.alRetirar()');
    assert.equal(avisoPension(P), '', 'retiró su autorización y el aviso sigue prometiendo reintentar');
  });

  test('«Tu autorización» dice que la app recibe solo los archivos que la persona escoja', () => {
    const P = B.abrir();
    B.mariaHastaElPermiso(P, false);
    assert.match(B.texto(B.cuerpo(P)), /no accede a tus mensajes, ni a tus llamadas, ni a tus contactos, ni a tus fotos guardadas\. Solo la cámara en el momento de tomar la foto, tu ubicación una sola vez si la autorizas, y los archivos que tú mismo escojas si subes tu historia laboral\./);
  });
});
