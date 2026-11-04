/* ============================================================================
 * CERRAR EL CRÉDITO CON LO QUE JOAN DIGA — el Panel del bolsillo — 30-oct-2026
 *
 *   cd pruebas && node --test cerrar-con-perdon-espejo.test.js
 *
 * «Se lo perdoné» con pérdida de capital se hace desde el computador (su hoja
 * tiene el recuadro, el motivo y la casilla «Entiendo que pierdo $X»). El
 * celular tiene que hacer dos cosas, y es lo que se vigila aquí arrancando
 * panel/espejo.html de verdad (banco-espejo.js):
 *   1. LEER LO MISMO sin romperse: un crédito que el computador cerró con
 *      pérdida se ve como lo que es —lo que entró y lo que se perdió—, con las
 *      mismas cuentas del puente (capitalRecuperadoDe, perdidaDelCierre,
 *      capitalPerdidoDeQuincena, capitalPerdidoDelSocio), nunca como «capital
 *      devuelto» entero;
 *   2. DECIR CLARO lo que no ofrece: «El descuento que toca el capital se hace
 *      desde el computador», en la hoja de cobro y en los créditos con cuotas,
 *      nunca un bloqueo mudo. Y su cobro de siempre deja `capitalPerdido` en 0.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { abrirEspejo } = require('./banco-espejo.js');
const P = require(path.join(__dirname, '..', 'app', 'puente.js'));
const M = require(path.join(__dirname, '..', 'app', 'motor.js'));

const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const copia = x => JSON.parse(JSON.stringify(x));
const SOCIO = { id: 's1', numero: 1, nombre: 'Marta Gómez', telefono: '3001234567', gestiones: [] };

function quincenal(extra) {
  return Object.assign({ id: 'c1', numero: 1, socioId: 's1', socioNombre: 'Marta Gómez', capital: 300000,
    costoPct: 20, fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [],
    comprobantes: [], pagado: false }, extra || {});
}
const cartera = ps => ({ socios: [copia(SOCIO)], prestamos: ps, respaldados: [], config: { negocio: 'Tu Garantía' },
  contadores: { cliente: 1, credito: ps.length, respaldado: 0 }, plantillas: {} });

/* El crédito de la maqueta cerrado EN EL COMPUTADOR con 250.000 (la ley del
   puente, la misma que usa crm.html). */
function cerradoEnElComputador(dia) {
  const p = quincenal();
  const r = P.cierreConPerdon(cartera([p]), p, dia || '2026-10-20', 250000, { motivo: 'se quedó sin trabajo', entiende: true });
  assert.equal(r.ok, true, r.detalle);
  const c = copia(p);
  c.condonaciones = [r.registros.condonacion];
  Object.assign(c, r.registros.credito);
  return c;
}

describe('1 · el celular lee el cierre con pérdida sin romperse y sin contar distinto', () => {

  test('el crédito dice lo que entró y lo que se perdió, no «saldo» ni «pagado» a secas', () => {
    const e = abrirEspejo({ cartera: cartera([cerradoEnElComputador()]), ahora: '2026-10-20T15:00:00' });
    e.ev("SEL.creditoId='c1'");
    const v = plano(e.ev('vistaCredito()'));
    assert.match(v, /se cerró el .* con «Se lo perdoné»: entraron \$250\.000 y se perdieron \$50\.000 de capital/);
    assert.match(v, /Capital perdido al cerrar \$50\.000/);
    assert.doesNotMatch(v, /Saldo de capital del crédito/, 'la pérdida se leía como una deuda viva');
    /* Lo que te dejó, con la cuenta del puente: −50.000. */
    assert.match(v, /-\$50\.000/);
  });

  test('«Lo que registraste hoy» dice el capital que de verdad volvió, y la quincena el capital perdido', () => {
    /* Cerrado HOY (30-oct) un crédito que vencía el 31: el cierre es de la
       quincena del 31, la que el celular enseña. */
    const p = quincenal({ fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31' });
    const r = P.cierreConPerdon(cartera([p]), p, '2026-10-30', 200000, { motivo: 'x', entiende: true });
    const c = copia(p); c.condonaciones = [r.registros.condonacion]; Object.assign(c, r.registros.credito);
    const e = abrirEspejo({ cartera: cartera([c]), ahora: '2026-10-30T15:00:00' });
    const q = plano(e.ev('vistaQuincena()'));
    assert.match(q, /\$200\.000 de capital devuelto · \$100\.000 de capital perdido/);
    assert.doesNotMatch(q, /\$300\.000 de capital devuelto/, 'contó como devuelto capital que no entró');
    assert.match(q, /Capital perdido en el ciclo \$100\.000/);
    assert.equal(e.json("P.capitalPerdidoDeQuincena(DB,'2026-10-31').capital"), 100000);
  });

  test('la ficha del cliente: el crédito y el capital perdido con él, la misma cuenta del computador', () => {
    const db = cartera([cerradoEnElComputador()]);
    const e = abrirEspejo({ cartera: db, ahora: '2026-10-21T10:00:00' });
    e.ev("SEL.socioId='s1'");
    const f = plano(e.ev('vistaFicha()'));
    assert.match(f, /cerrado el .* · se perdieron \$50\.000 de capital/);
    assert.doesNotMatch(f, /pagado el/, 'la tarjeta dice «Cerrado con pérdida» y debajo «pagado el»');
    assert.match(f, /Capital perdido con él: \$50\.000 en 1 crédito/);
    assert.deepEqual(e.json("descuentosDelSocio(socioPorId('s1'))"), P.descuentosDelSocio(db, db.socios[0]));
  });
});

describe('1-bis · 4-nov-2026: el celular no le dice «Pagado» a un crédito cerrado con pérdida', () => {
  const pildora = v => (/<span class="pill [^"]*">([^<]*)<\/span>/.exec(v) || [])[1];

  test('la píldora del detalle dice lo mismo que la tarjeta de la ficha, hasta con $0', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera([p]), p, '2026-10-20', 0, { motivo: 'x', entiende: true });
    const c = copia(p); c.condonaciones = [r.registros.condonacion]; Object.assign(c, r.registros.credito);
    const e = abrirEspejo({ cartera: cartera([c]), ahora: '2026-10-21T10:00:00' });
    e.ev("SEL.creditoId='c1'");
    assert.equal(pildora(e.ev('vistaCredito()')), 'Cerrado con pérdida', 'la píldora dice «Pagado» encima de «entraron $0»');
    e.ev("SEL.socioId='s1'");
    assert.match(plano(e.ev('vistaFicha()')), /Cerrado con pérdida/);
  });

  test('de un pago de verdad sigue diciendo «Pagado» y «pagado el»', () => {
    const p = quincenal();
    const liq = P.liquidarCiclo(p, '2026-10-20');
    const c = Object.assign(copia(p), { pagado: true, fechaPagado: '2026-10-20', cicloPago: '2026-10-15', cobroRegistrado: true,
      gananciaPago: liq.costo + liq.recargo_mora, recargoMora: liq.recargo_mora, costoCausado: liq.costo,
      moraCausada: liq.recargo_mora, montoRecibido: liq.total_a_pagar, saldoAFavor: 0, capitalPerdido: 0 });
    const e = abrirEspejo({ cartera: cartera([c]), ahora: '2026-10-20T15:00:00' });
    e.ev("SEL.creditoId='c1'");
    assert.equal(pildora(e.ev('vistaCredito()')), 'Pagado');
    e.ev("SEL.socioId='s1'");
    assert.match(plano(e.ev('vistaFicha()')), /pagado el /);
    assert.match(plano(e.ev('vistaQuincena()')), /Pago · Marta/);
  });

  test('«Lo que registraste hoy» no llama «Pago» a un cierre con $0', () => {
    const p = quincenal({ fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31' });
    const r = P.cierreConPerdon(cartera([p]), p, '2026-10-30', 0, { motivo: 'x', entiende: true });
    const c = copia(p); c.condonaciones = [r.registros.condonacion]; Object.assign(c, r.registros.credito);
    const e = abrirEspejo({ cartera: cartera([c]), ahora: '2026-10-30T15:00:00' });
    const q = plano(e.ev('vistaQuincena()'));
    assert.doesNotMatch(q, /Pago · Marta/);
    assert.match(q, /Cierre con pérdida · Marta/);
    assert.match(q, /\$0 de capital devuelto · \$300\.000 de capital perdido/);
  });
});

describe('2 · lo que el celular no hace, lo dice', () => {

  test('en la hoja de cobro: pasar de mora + costo «se hace desde el computador», y no registra nada', () => {
    const e = abrirEspejo({ cartera: cartera([quincenal()]), ahora: '2026-10-20T10:30:00' });
    e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
    e.ev("abrirCobro('c1')");
    e.ev("_cobro.monto = 250000; _cobro.modo = 'perdon'; _cobro.motivo='x'; pintarDif('c1')");
    const d = plano(e.elems.pgDif.innerHTML);
    assert.match(d, /el descuento que toca el capital se hace desde el computador/);
    assert.doesNotMatch(d, /no se registra desde el celular/, 'volvió el bloqueo que no dice dónde sí');
    assert.equal(e.elems.pgBtn.disabled, true);
    assert.match(e.elems.pgBtn.textContent, /se hace en el computador/);
    e.ev("registrarCobro('c1','2026-10-20')");
    assert.equal(e.json("creditoPorId('c1').pagado"), false, 'el celular cerró perdonando capital');
    assert.ok(e.avisos.some(a => /El descuento que toca el capital se hace desde el computador/.test(a)),
      'el aviso no dice dónde se hace');
  });

  test('en un crédito a cuotas y en uno con pago acordado, la hoja dice dónde está «Se lo perdoné»', () => {
    const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
      { fechaDesembolso: '2026-10-16' });
    const c = quincenal({ capital: 650000, fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30',
      planPagos: P.planPagosDeAlta(plan) });
    const e = abrirEspejo({ cartera: cartera([c]), ahora: '2026-10-30T10:30:00' });
    e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
    e.ev("abrirCobro('c1')");
    const h = plano(e.elems.pgCalc.innerHTML);
    assert.match(h, /El abono a una cuota y «pagar todo» se anotan desde el computador/);
    assert.match(h, /«Se lo perdoné» \(cerrar el crédito con lo que traiga\) también se hace desde el computador/);
  });

  test('su cobro de siempre deja la pérdida en 0 (para que un cierre distinto en el computador sea choque)', () => {
    const e = abrirEspejo({ cartera: cartera([quincenal()]), ahora: '2026-10-20T10:30:00' });
    e.ev("cobrar('c1','2026-10-20',{montoRecibido:375000})");
    const p = e.json("creditoPorId('c1')");
    assert.equal(p.pagado, true);
    assert.equal(p.capitalPerdido, 0);
    assert.equal(p.montoRecibido, 375000);
  });
});
