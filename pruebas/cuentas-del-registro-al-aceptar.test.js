/* ============================================================================
 * LAS CUENTAS DEL REGISTRO LLEGAN AL «ACEPTO» — 22 de octubre de 2026
 *
 *   node --test pruebas/cuentas-del-registro-al-aceptar.test.js
 *
 * Un defecto que la revisión adversaria encontró en la entrega del 22-oct (tres
 * de sus lentes, por separado), y que las pruebas de entonces no veían:
 * «¿A dónde te consignamos?» leía las cuentas de solicitud.datos, y la base
 * no le manda ese campo al teléfono desde el 7-oct (mi_solicitud y
 * mi_solicitud_platachat le quitan `datos`, a propósito). La lista salía
 * siempre vacía —solo «Escribe tu cuenta»— mientras el registro prometía
 * «cuando aceptes cada crédito eliges a cuál». pruebas/destino-al-aceptar no
 * lo veía porque le ponía `datos` a mano a la solicitud, una forma que la base
 * nunca devuelve. AQUÍ LA SOLICITUD VA COMO LA MANDA LA BASE, SIN `datos`, y
 * las cuentas llegan por mis_cuentas_de_pago (con el sello del registro:
 * base/20261022b_las_cuentas_del_registro.sql, y su prueba en PostgreSQL,
 * pruebas/cuentas-del-registro-al-aceptar-postgres.test.js).
 *
 * El banco tocado sin querer en el registro tiene su prueba aparte:
 * pruebas/el-banco-se-puede-soltar.test.js.
 *
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CP = require('../app/cuentas-pago.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirPlataChat, asentar } = require('./banco-platachat.js');
const B = require('./banco-registro.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ticks = () => asentar(10);

/* Lo que contesta mis_cuentas_de_pago: SOLO las ocho llaves de pago. */
const CUENTAS = { nequi: '3001112233', llave_breb: '@MARIA123', banco: 'Bancolombia', banco_codigo: '1-7',
  banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si' };
/* La solicitud TAL COMO LA DEVUELVE mi_solicitud: sin `datos` ni `registro_id`
   (base/20261007c_una_puerta_cierres.sql, sección 3). */
const PROPUESTA = { id: 9, estado: 'contrapropuesta', destino_desembolso: null,
  contrapropuesta: { capital: 1500000, costo: 300000, total: 1800000, fecha_pago: '2026-11-14', dias: 37,
                     costo_pct: 20, texto: 'Te propongo esto', por: 'joan', creada_en: '2026-10-08T15:00:00Z' } };

/* play/ con una nube que anota y contesta por función; `colgar` retiene esa
   función hasta que la prueba la suelte (window.__soltar()). */
function play(resp, colgar) {
  const P = abrirPlay({});
  P.ev('window.__l = []; window.__resp = ' + JSON.stringify(resp || {}) + '; window.__colgar = ' + JSON.stringify(colgar || '') + ';' +
       ' window.__soltar = null;' +
       ' fetch = function (u, o) { var s = String(u); var fn = (/rpc\\/([a-z_]+)/.exec(s) || [, ""])[1];' +
       ' window.__l.push({ u: s, fn: fn, c: o && o.body ? JSON.parse(o.body) : null });' +
       ' var r = window.__resp[fn];' +
       ' var R = function () { if (r && r.__estado) return { ok: false, status: r.__estado, json: function () { return Promise.resolve({}); } };' +
       '   return { ok: true, status: 200, json: function () { return Promise.resolve(r || { ok: true }); } }; };' +
       ' if (fn && fn === window.__colgar) return new Promise(function (res) { window.__soltar = function () { res(R()); }; });' +
       ' return Promise.resolve(R()); };');
  P.ev('SESION = { access_token: "t-maria", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(PROPUESTA) + ');');
  return P;
}
const llamadas = P => JSON.parse(P.ev('JSON.stringify(window.__l)'));

describe('play/: al aceptar salen las cuentas del registro', () => {
  test('con la solicitud como la manda la base (SIN datos), ofrece las que dio, en orden y con la recomendación', async () => {
    const P = play({ mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    await ticks();
    const h = P.elems.cajaDestino.innerHTML;
    const i = h.indexOf('Nequi ···2233'), j = h.indexOf('Llave Bre-B ···A123'), k = h.indexOf('Bancolombia · ahorros ···6789');
    assert.ok(i > 0 && j > i && k > j, 'no ofreció las cuentas del registro (o no en el orden recomendado): ' + h);
    assert.equal((h.match(/Recomendado · llega más rápido/g) || []).length, 2);
    assert.match(h, /Otra cuenta a tu nombre/);
    assert.equal(/123456789|MARIA123/.test(h), false, 'el número entero quedó en pantalla');
    /* Las pidió para ESTA solicitud, en el cuerpo y no en la dirección. */
    const m = llamadas(P).filter(x => x.fn === 'mis_cuentas_de_pago');
    assert.equal(m.length, 1);
    assert.deepEqual(m[0].c, { p_id: 9 });
  });

  test('mientras llegan no hay ninguna opción bajo el dedo; cuando llegan, se pintan', async () => {
    const P = play({ mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } }, 'mis_cuentas_de_pago');
    await ticks();
    const antes = P.elems.cuerpo.innerHTML;
    assert.match(antes, /¿A dónde te consignamos\?/);
    assert.match(antes, /Buscando las cuentas que nos diste/);
    assert.equal(/name="dst_eleccion"/.test(antes), false, 'pintó «Escribe tu cuenta» antes de saber si había cuentas');
    P.ev('window.__soltar()');
    await ticks();
    assert.match(P.elems.cajaDestino.innerHTML, /Nequi ···2233/);
    assert.equal(/Buscando las cuentas/.test(P.elems.cajaDestino.innerHTML), false);
  });

  test('NO lee solicitud.datos: aunque la solicitud trajera un Nequi, solo ofrece lo que da mis_cuentas_de_pago', async () => {
    /* Si un día la base volviera a mandar `datos`, podrían ser los de otra
       persona (el registro sin sesión). La pantalla no los toma. */
    const P = abrirPlay({});
    P.ev('fetch = function (u) { return Promise.resolve({ ok: true, status: 200, json: function () {' +
         ' return Promise.resolve(/mis_cuentas_de_pago/.test(String(u)) ? { ok: true, cuentas: {} } : { ok: true }); } }); };');
    const ajena = Object.assign({}, PROPUESTA, { datos: { nequi: '3209990000', cuentas_mias: 'si' } });
    P.ev('SESION = { access_token: "t-maria", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(ajena) + ');');
    await ticks();
    const h = P.elems.cajaDestino.innerHTML;
    assert.equal(/···0000/.test(h), false, 'ofreció como suyo un Nequi que no vino de mis_cuentas_de_pago');
    assert.match(h, /Escribe tu cuenta/);
  });

  test('sin la función en la base (404): «Escribe tu cuenta», sin trabar nada', async () => {
    const P = play({ mis_cuentas_de_pago: { __estado: 404 } });
    await ticks();
    const h = P.elems.cajaDestino.innerHTML;
    assert.match(h, /Escribe tu cuenta/);
    assert.equal(/Buscando las cuentas/.test(h), false, 'se quedó «buscando» para siempre');
    assert.equal(/Otra cuenta a tu nombre/.test(h), false);
  });

  test('elige su Nequi del registro y viaja con la aceptación', async () => {
    const P = play({ mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
      aceptar_con_destino: { ok: true, solicitud: Object.assign({}, PROPUESTA, { estado: 'aceptada',
        destino_desembolso: { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: PROPUESTA.contrapropuesta.creada_en } }) } });
    await ticks();
    P.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await ticks();
    const a = llamadas(P).find(x => x.fn === 'aceptar_con_destino');
    assert.ok(a, 'no aceptó con la cuenta');
    assert.deepEqual(a.c.p_destino, { medio: 'nequi', numero: '3001112233', es_mia: true });
    assert.match(P.elems.cuerpo.innerHTML, /Te la consignamos a <b>Nequi ···2233<\/b>/);
  });

  test('las pide una vez por solicitud, no en cada repintada', async () => {
    const P = play({ mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    await ticks();
    P.ev('pintarSolicitud(' + JSON.stringify(PROPUESTA) + '); repintarDestino(); repintarDestino();');
    await ticks();
    assert.equal(llamadas(P).filter(x => x.fn === 'mis_cuentas_de_pago').length, 1);
  });

  test('«Salir» suelta las cuentas que trajo y la que estaba escribiendo', async () => {
    const P = play({ mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    await ticks();
    P.ev("elegirDestino('otra'); medioDestino('daviplata'); escribirDestino('numero', '3205556677');");
    assert.ok(P.ev('Object.keys(CUENTAS_DEL_REGISTRO).length') > 0);
    P.ev('salirDeCuenta()');
    assert.equal(P.ev('Object.keys(CUENTAS_DEL_REGISTRO).length'), 0, 'las cuentas de María se quedaron en la pestaña');
    assert.equal(P.ev('Object.keys(DESTINOS).length'), 0, 'lo que escribía María se quedó en la pestaña');
  });
});

describe('PlataChat: lo mismo en la tarjeta de Créditos', () => {
  const ahora = () => new Date().toISOString();
  /* Como la manda mi_solicitud_platachat: sin `datos`. */
  const solM = () => ({ id: 41, app: 'platachat', estado: 'contrapropuesta', capital: 450000, cortes: 1,
    contrapropuesta: { capital: 450000, costo: 45000, total: 495000, fecha_pago: '2026-11-15', creada_en: ahora(), por: 'auto' } });

  async function maria(cuentas) {
    const sol = solM();
    const PC = abrirPlataChat({ resp: {
      mi_solicitud_platachat: () => ({ ok: true, solicitud: sol, ahora: ahora() }),
      mis_cuentas_de_pago: () => cuentas } });
    await asentar(10);
    await PC.entrarComo('3001112233', 'Maria.Secreta9');
    PC.ev("CANAL = 'creditos'; irA('chats')");
    await asentar(20);
    assert.equal(PC.ev('SOL && SOL.id'), 41);
    return PC;
  }
  const pedidas = PC => PC.st.llamadas.filter(x => /rpc\/mis_cuentas_de_pago$/.test(x.url));

  test('con la solicitud como la manda la base, ofrece las del registro', async () => {
    const PC = await maria({ ok: true, cuentas: CUENTAS });
    const h = PC.elems.chPropuesta.innerHTML;
    assert.ok(h.indexOf('Nequi ···2233') > 0, 'no ofreció las cuentas del registro: ' + h);
    assert.ok(h.indexOf('Nequi ···2233') < h.indexOf('Bancolombia'));
    assert.match(h, /Recomendado · llega más rápido/);
    assert.deepEqual(pedidas(PC).map(x => x.c), [{ p_id: 41 }]);
  });

  test('el latido repinta muchas veces y las pide una sola', async () => {
    const PC = await maria({ ok: true, cuentas: CUENTAS });
    PC.ev('pintarPropuesta(); tarjetaPropuesta(SOL); tarjetaPropuesta(SOL);');
    await asentar(10);
    assert.equal(pedidas(PC).length, 1);
  });

  test('renovar el token (sesion.js lo cambia en su sitio) no la devuelve a «Buscando…» ni las pide otra vez', async () => {
    /* Con el token en la llave, cada hora la tarjeta volvía a «Buscando las
       cuentas que nos diste…» y, si estaba escribiendo la otra cuenta, el
       latido le quitaba la casilla de debajo del dedo. */
    const PC = await maria({ ok: true, cuentas: CUENTAS });
    PC.ev("SES.access_token = 'tok-renovado'; pintarPropuesta();");
    await asentar(10);
    const h = PC.elems.chPropuesta.innerHTML;
    assert.match(h, /Nequi ···2233/);
    assert.equal(/Buscando las cuentas/.test(h), false);
    assert.equal(pedidas(PC).length, 1);
  });

  test('sin cuentas (el sello no casó, o la función no está): «Escribe tu cuenta»', async () => {
    const PC = await maria({ __estado: 404 });
    const h = PC.elems.chPropuesta.innerHTML;
    assert.match(h, /Escribe tu cuenta/);
    assert.equal(/Buscando las cuentas/.test(h), false);
  });
});

describe('el registro: lo que promete y el sello', () => {
  test('el paso, la ficha de Google y la nota de cumplimiento ya no prometen «eliges a cuál»: dicen que se pregunta', () => {
    const P = B.abrir();
    P.ev("pintarRegistro(indiceDe('cobro'))");
    const h = B.cuerpo(P);
    assert.match(h, /te preguntamos a qué cuenta te lo consignamos/);
    assert.equal(/eliges a cuál/.test(h), false);
    for (const f of ['PLAY-FICHA.md', 'app/cumplimiento.js']) {
      assert.equal(/eliges a cuál se consigna/.test(leer(f)), false, f + ' promete elegir entre las cuentas del registro');
      assert.match(leer(f), /te preguntamos a qué cuenta se consigna/, f);
    }
  });

  test('el sello nace al pasar el paso y va IGUAL a la bandeja y a la cuenta; no es un dato de pago', async () => {
    const P = B.abrir();
    const ll = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    P.ev("pintarRegistro(indiceDe('cobro')); mismoCelular('nequi'); $('f_cuentas_mias').checked = true; anotarCuenta($('f_cuentas_mias')); siguientePaso();");
    assert.equal(B.pasoActual(P), 'referencias', B.texto(B.caja(P)));
    const sello = P.ev('REGISTRO.' + CP.LLAVE_SELLO);
    assert.match(String(sello), /^[0-9a-f]{32}$/, 'no nació el sello al pasar el paso');
    P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = false;");
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    const bandeja = ll().find(x => /rpc\/registrar_abierto$/.test(x.url));
    const signup = ll().find(x => /auth\/v1\/signup/.test(x.url));
    assert.ok(bandeja && signup, 'no salió la bandeja o la cuenta');
    assert.equal(bandeja.cuerpo.p_datos.cuentas_sello, sello);
    assert.equal(signup.cuerpo.data.vinculacion.cuentas_sello, sello, 'la cuenta no lleva el sello: mis_cuentas_de_pago nunca casaría');
    assert.equal('nequi' in signup.cuerpo.data.vinculacion, false, 'el signup se llevó un dato de pago');
    assert.ok(Object.keys(bandeja.cuerpo.p_datos).length <= 40, 'la base botaría llaves');
    assert.equal(CP.LLAVES_DEL_REGISTRO.indexOf(CP.LLAVE_SELLO), -1);
  });

  test('el sello no se repite entre registros, y «Empezar de cero» se lo lleva', () => {
    const a = CP.selloNuevo(), b = CP.selloNuevo();
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, b);
    const P = B.abrir();
    P.ev("REGISTRO.celular = '" + B.CEL_MARIA + "'; pintarRegistro(indiceDe('cobro')); mismoCelular('nequi');" +
         " $('f_cuentas_mias').checked = true; anotarCuenta($('f_cuentas_mias')); siguientePaso();");
    const s1 = P.ev('REGISTRO.cuentas_sello');
    assert.match(String(s1), /^[0-9a-f]{32}$/);
    /* Volver a pasar el paso no lo cambia (la bandeja se queda con el primero). */
    P.ev("pintarRegistro(indiceDe('cobro')); mismoCelular('nequi'); $('f_cuentas_mias').checked = true; anotarCuenta($('f_cuentas_mias')); siguientePaso();");
    assert.equal(P.ev('REGISTRO.cuentas_sello'), s1);
    P.ev('empezarDeNuevo()');
    assert.equal(P.ev('REGISTRO.cuentas_sello'), undefined);
    assert.equal(new RegExp(s1).test(P.almacen.play_registro_borrador || ''), false);
  });

  test('el CRM no le pinta el sello a Joan ni al equipo como si fuera un dato de la persona', () => {
    const crm = leer('panel/crm.html');
    assert.match(crm, /k!=='cuentas_sello'/, 'verDatosRegistro pinta «cuentas sello»');
    assert.match(crm, /const usados = \{ cuentas_sello: true \};/, 'la ficha del equipo pinta «cuentas_sello» entre los extras');
  });
});
