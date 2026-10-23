/* ============================================================================
 * «¿A DÓNDE TE CONSIGNAMOS?» AL ACEPTAR, EN play/ Y EN PLATACHAT — 22-oct-2026
 *
 *   node --test pruebas/destino-al-aceptar.test.js
 *
 * Joan: «al momento de que el cliente acepte la contrapropuesta, que se le
 * pregunte nuevamente a qué cuenta desea que le consignen; recomendemos que
 * sea por billeteras digitales ya que es más rápido». Con las páginas de
 * verdad en el banco:
 *   · se ofrecen las que dio al registrarse (solicitud.datos), billeteras y
 *     llave primero con «Recomendado · llega más rápido», la de banco después,
 *     y «Otra cuenta a tu nombre»; en pantalla solo el final del número;
 *   · la elección viaja CON la aceptación (aceptar_con_destino), en el cuerpo
 *     de la petición y nunca en una dirección;
 *   · sin la función en la base (404) se acepta como siempre y se dice que la
 *     cuenta se pregunta por el chat;
 *   · aceptada, dice a dónde, solo si la cuenta es de ESTA propuesta;
 *   · si Joan cambia la propuesta, se vuelve a preguntar;
 *   · sin app/cuentas-pago.js, se acepta como antes.
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');
const { abrirPlataChat, asentar } = require('./banco-platachat.js');

const ticks = () => new Promise(r => setImmediate(r));
const DATOS = { nombres: 'MARIA JOSE', celular: '3001112233', nequi: '3001112233', llave_breb: '@MARIA123',
  banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si' };
const PROPUESTA = { id: 9, estado: 'contrapropuesta', datos: DATOS,
  contrapropuesta: { capital: 1500000, costo: 300000, total: 1800000, fecha_pago: '2026-11-14', dias: 37,
                     costo_pct: 20, texto: 'Te propongo esto', por: 'joan', creada_en: '2026-10-08T15:00:00Z' } };
const aceptadaCon = (destino, propuesta) => Object.assign({}, PROPUESTA, { estado: 'aceptada',
  destino_desembolso: destino ? Object.assign({}, destino, { propuesta: propuesta || PROPUESTA.contrapropuesta.creada_en }) : null });

/* play/ con una nube que anota y contesta lo que se le pida por función. */
function play(resp, opc) {
  const P = abrirPlay(opc || {});
  P.ev('window.__l = []; window.__resp = ' + JSON.stringify(resp || {}) + ';' +
       ' fetch = function (u, o) { var s = String(u); var fn = (/rpc\\/([a-z_]+)/.exec(s) || [, ""])[1];' +
       ' window.__l.push({ u: s, fn: fn, c: o && o.body ? JSON.parse(o.body) : null });' +
       ' var r = window.__resp[fn]; if (r && r.__estado) return Promise.resolve({ ok: false, status: r.__estado, json: function () { return Promise.resolve({}); } });' +
       ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r || { ok: true }); } }); };');
  P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(PROPUESTA) + ');');
  return P;
}
const llamadas = P => JSON.parse(P.ev('JSON.stringify(window.__l)'));

describe('play/: la pregunta', () => {
  test('las que dio al registrarse, en el orden que se recomienda, sin el número entero', () => {
    const P = play();
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /id="cajaDestino"/);
    assert.match(h, /¿A dónde te consignamos\?/);
    const i = h.indexOf('Nequi ···2233'), j = h.indexOf('Llave Bre-B ···A123'), k = h.indexOf('Bancolombia · ahorros ···6789');
    assert.ok(i > 0 && j > i && k > j, 'el orden no es billeteras, llave y banco');
    assert.equal((h.match(/Recomendado · llega más rápido/g) || []).length, 2);
    assert.match(h, /Otra cuenta a tu nombre/);
    assert.equal(/123456789|MARIA123/.test(h), false, 'el número entero quedó en pantalla');
    /* Va antes del «Acepto». */
    assert.ok(h.indexOf('¿A dónde te consignamos?') < h.indexOf('id="btnAceptar"'));
  });

  test('sin elegir no se acepta, y lo dice ahí mismo', async () => {
    const P = play();
    P.ev('marcarCondiciones(true); aceptarContrapropuesta(9);');
    await ticks();
    assert.deepEqual(llamadas(P), []);
    assert.match(P.elems.errAceptar.textContent, /Elige a dónde te consignamos/);
    assert.match(P.elems.cajaDestino.innerHTML, /cp-error[^>]*>Elige a dónde te consignamos/);
  });

  test('«Otra cuenta» sin «Es mía, a mi nombre» no se acepta', async () => {
    const P = play();
    P.ev("marcarCondiciones(true); elegirDestino('otra'); medioDestino('daviplata'); escribirDestino('numero', '320 555 6677'); aceptarContrapropuesta(9);");
    await ticks();
    assert.deepEqual(llamadas(P), []);
    assert.match(P.elems.errAceptar.textContent, /Es mía, a mi nombre/);
  });
});

describe('play/: la elección viaja con la aceptación', () => {
  test('elige su Nequi: aceptar_con_destino lo lleva en el cuerpo, y la pantalla dice a dónde', async () => {
    const P = play({ aceptar_con_destino: { ok: true, solicitud: aceptadaCon({ medio: 'nequi', numero: '3001112233', es_mia: true }) } });
    P.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await ticks(); await ticks();
    const l = llamadas(P);
    const a = l.find(x => x.fn === 'aceptar_con_destino');
    assert.ok(a, 'no aceptó con la cuenta');
    assert.deepEqual(a.c.p_destino, { medio: 'nequi', numero: '3001112233', es_mia: true });
    assert.equal(a.c.p_id, 9);
    assert.ok(a.c.p_vio && a.c.p_vio.total === 1800000, 'no llevó lo que vio');
    assert.equal(l.some(x => x.fn === 'aceptar_condiciones'), false, 'aceptó dos veces');
    /* Ni el número ni la llave en ninguna dirección. */
    assert.equal(l.some(x => /3001112233|MARIA123|123456789/.test(x.u)), false);
    assert.match(P.elems.cuerpo.innerHTML, /Te la consignamos a <b>Nequi ···2233<\/b>, a tu nombre/);
  });

  test('elige la cuenta de banco: viaja entera para Joan', async () => {
    const P = play({ aceptar_con_destino: { ok: true, solicitud: aceptadaCon(null) } });
    P.ev("marcarCondiciones(true); elegirDestino('2'); aceptarContrapropuesta(9);");
    await ticks(); await ticks();
    const a = llamadas(P).find(x => x.fn === 'aceptar_con_destino');
    assert.deepEqual(a.c.p_destino, { medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros',
      numero: '123456789', es_mia: true });
  });

  test('sin la función en la base (404): acepta como siempre y dice que la cuenta se pregunta por el chat', async () => {
    const P = play({ aceptar_con_destino: { __estado: 404 },
                     aceptar_condiciones: { ok: true, solicitud: aceptadaCon(null) } });
    P.ev("marcarCondiciones(true); elegirDestino('1'); aceptarContrapropuesta(9);");
    await ticks(); await ticks(); await ticks();
    assert.deepEqual(llamadas(P).map(x => x.fn).filter(f => /^aceptar/.test(f)), ['aceptar_con_destino', 'aceptar_condiciones']);
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /Listo: aceptaste/);
    assert.match(h, /no alcanzamos a guardar a qué cuenta te consignamos/);
    assert.equal(/Te la consignamos a/.test(h), false, 'dice a dónde sin que la base lo sepa');
  });

  test('la base dice que esa cuenta no sirve: no se aceptó nada, y se dice', async () => {
    const P = play({ aceptar_con_destino: { ok: false, motivo: 'destino' } });
    P.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await ticks(); await ticks();
    assert.match(P.elems.errAceptar.textContent, /No pudimos guardar esa cuenta/);
    assert.equal(/Listo: aceptaste/.test(P.elems.cuerpo.innerHTML), false);
  });
});

describe('play/: lo que se muestra después, y cuando la propuesta cambia', () => {
  test('aceptada con la cuenta de OTRA propuesta: no se dice a dónde', () => {
    const P = play();
    const vieja = aceptadaCon({ medio: 'nequi', numero: '3001112233', es_mia: true }, '2026-10-01T10:00:00Z');
    P.ev('pintarSolicitud(' + JSON.stringify(vieja) + ')');
    const h = P.elems.cuerpo.innerHTML;
    assert.equal(/Te la consignamos a/.test(h), false, 'muestra la cuenta de una propuesta vieja como la de esta');
    assert.match(h, /cuándo y por dónde recibes la plata/);
  });

  test('si Joan cambia la propuesta, se vuelve a preguntar', () => {
    const P = play();
    P.ev("elegirDestino('0')");
    assert.match(P.elems.cajaDestino.innerHTML, /value="0" checked/);
    const nueva = JSON.parse(JSON.stringify(PROPUESTA));
    nueva.contrapropuesta.creada_en = '2026-10-09T09:00:00Z';
    P.ev('pintarSolicitud(' + JSON.stringify(nueva) + ')');
    assert.equal(/checked onchange="elegirDestino/.test(P.elems.cuerpo.innerHTML), false, 'la elección de la propuesta vieja valió para la nueva');
  });

  test('sin app/cuentas-pago.js no se pregunta, y se acepta como antes', async () => {
    const P = play({ aceptar_condiciones: { ok: true, solicitud: aceptadaCon(null) } }, { sinCuentas: true });
    assert.equal(/A dónde te consignamos/.test(P.elems.cuerpo.innerHTML), false);
    P.ev('marcarCondiciones(true); aceptarContrapropuesta(9);');
    await ticks(); await ticks();
    assert.deepEqual(llamadas(P).map(x => x.fn).filter(f => /^aceptar/.test(f)), ['aceptar_condiciones']);
  });
});

describe('PlataChat: la misma pregunta en la tarjeta de Créditos', () => {
  const ahora = () => new Date().toISOString();
  const solM = () => ({ id: 41, app: 'platachat', estado: 'contrapropuesta', capital: 450000, cortes: 1, datos: DATOS,
    contrapropuesta: { capital: 450000, costo: 45000, total: 495000, fecha_pago: '2026-11-15', creada_en: ahora(), por: 'auto' } });

  async function maria(resp) {
    const sol = solM();
    const PC = abrirPlataChat({ resp: Object.assign({
      mi_solicitud_platachat: () => ({ ok: true, solicitud: sol, ahora: ahora() }) }, resp ? resp(sol) : {}) });
    await asentar(10);
    await PC.entrarComo('3001112233', 'Maria.Secreta9');
    PC.ev("CANAL = 'creditos'; irA('chats')");
    await asentar(10);
    assert.equal(PC.ev('SOL && SOL.id'), 41);
    return PC;
  }

  test('ofrece sus cuentas y «Otra», con la recomendación', async () => {
    const PC = await maria();
    const h = PC.elems.chPropuesta.innerHTML;
    assert.match(h, /¿A dónde te consignamos\?/);
    assert.ok(h.indexOf('Nequi ···2233') > 0 && h.indexOf('Nequi ···2233') < h.indexOf('Bancolombia'));
    assert.match(h, /Recomendado · llega más rápido/);
    assert.ok(h.indexOf('A dónde te consignamos') < h.indexOf('Acepto: recibo'), 'la pregunta va después del «Acepto»');
  });

  test('escribir la otra cuenta no hace que el latido repinte la tarjeta (no le roba el teclado)', async () => {
    const PC = await maria();
    PC.ev("elegirDestinoPC('otra'); medioDestinoPC('nequi');");
    const antes = PC.elems.chPropuesta.innerHTML;
    PC.ev("escribirDestinoPC('numero', '310 999')");
    assert.equal(PC.elems.chPropuesta.innerHTML, antes, 'repintó mientras escribía');
    assert.equal(PC.ev("$('chPropuesta').__tarjeta === tarjetaPropuesta(SOL)"), true,
      'el latido ve la tarjeta «distinta» y la repinta con la siguiente letra');
  });

  test('acepta con la cuenta elegida, y la tarjeta dice a dónde', async () => {
    const PC = await maria(sol => ({
      aceptar_con_destino: (q, c) => ({ ok: true, solicitud: Object.assign({}, sol, { estado: 'aceptada', aceptada_en: ahora(),
        destino_desembolso: Object.assign({}, c.p_destino, { propuesta: sol.contrapropuesta.creada_en }) }) })
    }));
    PC.ev("CONDICIONES_LEIDAS = new Proxy({}, { get: function () { return true; } }); elegirDestinoPC('1'); aceptarPropuesta(41);");
    await asentar(10);
    const a = PC.st.llamadas.find(x => /rpc\/aceptar_con_destino$/.test(x.url));
    assert.ok(a, 'no aceptó con la cuenta');
    assert.deepEqual(a.c.p_destino, { medio: 'breb', llave: '@MARIA123', es_mia: true });
    assert.equal(PC.st.llamadas.some(x => /MARIA123|123456789/.test(x.url)), false);
    assert.match(PC.elems.chPropuesta.innerHTML, /Te la consignamos a Llave Bre-B ···A123, a tu nombre/);
  });

  test('sin elegir no sale nada', async () => {
    const PC = await maria();
    const n0 = PC.st.llamadas.length;
    PC.ev("CONDICIONES_LEIDAS = new Proxy({}, { get: function () { return true; } }); aceptarPropuesta(41);");
    await asentar(5);
    assert.equal(PC.st.llamadas.slice(n0).some(x => /aceptar_/.test(x.url)), false);
    assert.match(PC.elems.chError.textContent, /Elige a dónde te consignamos/);
  });
});
