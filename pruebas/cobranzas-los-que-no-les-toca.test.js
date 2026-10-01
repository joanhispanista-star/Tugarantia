/* ============================================================================
 * COBRANZAS: LOS QUE TODAVÍA NO LES TOCA — 1 de octubre de 2026
 *
 *   node --test pruebas/cobranzas-los-que-no-les-toca.test.js
 *
 * Joan: «quiero que en la parte de cobranza me aparezcan todos los clientes,
 * incluso los que no tienen que pagar aún. Hoy me pagó un cliente
 * anticipadamente y no lo encontré en la pestaña de cobranzas».
 *
 * Las dos tablas de Cobranzas nacen de casosDeCobroHoy (mora, hoy, dentro de
 * dos días). Un crédito «al día» no estaba en ninguna: con el respaldo del
 * 1-oct, 5 de 16 créditos abiertos. Estas pruebas cuidan que la tercera tabla
 * los traiga a TODOS, que no duplique a nadie de arriba sin avisar, y que no
 * tenga casillas (no envía nada).
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const RELOJ = require('./reloj.js');

const HOY = RELOJ.HOY;
const EN_10 = RELOJ.haceDias(-10);
const EN_12 = RELOJ.haceDias(-12);
const HACE_5 = RELOJ.haceDias(5);

function socio(id, n, nombre) {
  return { id, numero: n, nombre, cedula: String(n), telefono: '300000000' + n,
           whatsappIgual: true, gestiones: [] };
}

function panel() {
  const P = abrirPanel({ ahora: RELOJ.MOMENTO });
  P.cargarCartera({
    socios: [socio('S1', 1, 'Ana Vence Hoy'), socio('S2', 2, 'Luis Al Dia'),
             socio('S3', 3, 'Marta Ya Pago'), socio('S4', 4, 'Pedro Mora Y Al Dia')],
    prestamos: [
      { id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY },
      { id: 'P2', socioId: 'S2', monto: 300000, fechaPago: EN_10 },
      { id: 'P3', socioId: 'S3', monto: 100000, fechaPago: EN_10, pagado: true },
      { id: 'P4', socioId: 'S4', monto: 150000, fechaPago: HACE_5 },
      { id: 'P5', socioId: 'S4', monto: 250000, fechaPago: EN_12 }
    ],
    config: { pin: '1234', whatsapp: '3009999999' }
  });
  P.ev('renderCobranzas()');
  return P;
}

describe('la tabla «Todavía no les toca»', () => {

  test('trae al que tiene un crédito al día, que antes no salía en ninguna tabla', () => {
    const P = panel();
    const arriba = String(P.elems['tblCobranzas'].innerHTML) + String(P.elems['tblFueraCob'].innerHTML);
    assert.ok(!/Luis Al Dia/.test(arriba), 'el escenario ya no prueba nada: Luis salía arriba');
    assert.match(String(P.elems['tblNoToca'].innerHTML), /Luis Al Dia/,
      'el cliente con un crédito que todavía no vence no aparece en Cobranzas: no hay dónde registrarle el pago anticipado');
  });

  test('no trae al que ya pagó ni repite al que solo tiene uno vencido', () => {
    const html = String(panel().elems['tblNoToca'].innerHTML);
    assert.ok(!/Marta Ya Pago/.test(html), 'aparece alguien sin crédito abierto');
    assert.ok(!/Ana Vence Hoy/.test(html), 'repite a quien vence hoy y ya está en la tabla de arriba');
  });

  test('quien tiene uno vencido Y otro al día aparece también, avisado', () => {
    /* Si no, su crédito al día volvía a quedar sin dónde registrarle el pago:
       el botón de arriba abre el vencido. */
    const html = String(panel().elems['tblNoToca'].innerHTML);
    assert.match(html, /Pedro Mora Y Al Dia/, 'el crédito al día de quien también está en mora se perdió');
    assert.match(html, /También tiene uno vencido arriba/, 'no avisa que esa persona también está arriba');
  });

  test('dice cuántos son, y cuándo vence cada uno', () => {
    const P = panel();
    assert.equal(String(P.elems['cuentaNoToca'].textContent), '2 personas');
    assert.match(String(P.elems['tblNoToca'].innerHTML), /faltan \d+ días/);
  });

  test('tiene el botón de pago y NINGUNA casilla', () => {
    const html = String(panel().elems['tblNoToca'].innerHTML);
    assert.match(html, /pagoDesdeCobro\('S2','P2',1,true\)/, 'falta «💵 Pago» con el crédito de esa persona');
    assert.equal((html.match(/type="checkbox"/g) || []).length, 0,
      'la tabla de los que no les toca tiene casillas: marcarTodoCob los mandaría al envío de cobro');
  });

  test('el pago de un crédito al día abre ese crédito', () => {
    const P = panel();
    P.ev('var _abierto=null; abrirPago=function(id){ _abierto=id; }');
    P.ev('pagoDesdeCobro("S2","P2",1,true)');
    assert.equal(P.ev('_abierto'), 'P2');
  });

  test('con varios, el selector no dice «vencidos» de créditos que no han vencido', () => {
    const P = panel();
    P.ev('var _modal=""; openModal=function(t,h){ _modal=h; }');
    P.ev('pagoDesdeCobro("S4","P5",2,true)');
    const m = String(P.ev('_modal'));
    assert.match(m, /todavia no vencen/);
    assert.ok(!/vencidos/.test(m), 'le dice a Joan que son créditos vencidos y no lo son');
  });
});
