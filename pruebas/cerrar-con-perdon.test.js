/* ============================================================================
 * CERRAR EL CRÉDITO CON LO QUE JOAN DIGA — la ley (app/puente.js) — 30-oct-2026
 *
 *   cd pruebas && node --test cerrar-con-perdon.test.js
 *
 * El pedido de Joan: «tengo una cliente con varios créditos y quiero hacerle un
 * descuento a cada crédito, quiero poder dejar escrito el monto que paga el
 * cliente después del descuento que yo haga… ya que tengo clientes que tienen
 * dificultades y tengo que hacer descuentos».
 *
 * Sus decisiones del 30-oct, que estas pruebas vigilan una por una:
 *   1. «Se lo perdoné» cierra el crédito con CUALQUIER monto (hasta con $0).
 *   2. La plata que entra va PRIMERO al capital; lo que no alcanza de capital
 *      es pérdida, y entonces la mora y el costo se perdonan enteros. Por
 *      encima del capital, lo perdonado es mora primero y después costo (o al
 *      revés, si lo elige), como hasta hoy.
 *   3. En los cuatro tipos: quincenal, a cuotas, plan del §8 y pago acordado.
 *   5. La pérdida nunca se esconde: motivo, casilla «Entiendo que pierdo $X» y
 *      «Capital perdido» aparte de los descuentos y de la ganancia.
 *   6. La garantía sale solo del costo que entró: si pagó menos que el
 *      capital, cero.
 * Lo que la nube le hace a ese cierre (la parte de capital se conserva, y un
 * cierre que perdió el choque no deja una pérdida fantasma) está en
 * cerrar-con-perdon-nube.test.js; la pantalla, en cerrar-con-perdon-crm.test.js.
 *
 * El ejemplo de la maqueta que vio Joan: debía 375.000 (300.000 de capital +
 * 60.000 de costo + 15.000 de mora) y trae 250.000.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const P = require(path.join(RAIZ, 'app', 'puente.js'));
const M = require(path.join(RAIZ, 'app', 'motor.js'));

const copia = x => JSON.parse(JSON.stringify(x));
const SOCIO = { id: 's1', numero: 1, nombre: 'Marta Gómez' };

/* Lo que hace la pantalla con los registros: el mismo orden que el CRM. */
function aplicar(p, regs) {
  const c = copia(p);
  (regs.cuotas || []).forEach(x => {
    const q = (c.planPagos.cuotas || []).find(y => Number(y.n) === Number(x.n));
    Object.assign(q, x);
  });
  c.abonosCapital = (c.abonosCapital || []).concat(regs.abonos || []);
  if (regs.condonacion) c.condonaciones = (c.condonaciones || []).concat([regs.condonacion]);
  Object.assign(c, regs.credito);
  return c;
}

/* El crédito de la maqueta: 300.000 al 20%, vencía el 15-oct; el 20-oct lleva
   5 días de mora (1% diario sobre 300.000 = 15.000). */
function quincenal(extra) {
  return Object.assign({ id: 'p1', numero: 1, socioId: 's1', socioNombre: 'Marta Gómez', capital: 300000,
    costoPct: 20, fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [],
    comprobantes: [], pagado: false }, extra || {});
}
const DIA = '2026-10-20';
const cartera = (...ps) => ({ socios: [copia(SOCIO)], prestamos: ps, respaldados: [], config: {}, contadores: {} });

/* El caso de Joan del 16-oct: 650.000 en dos cuotas, 455.000 el 30-oct y
   390.000 el 15-nov. */
function aCuotas() {
  const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
    { fechaDesembolso: '2026-10-16' });
  return { id: 'pc', numero: 2, socioId: 's1', socioNombre: 'Marta Gómez', capital: 650000, costoPct: 20,
    fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: P.planPagosDeAlta(plan) };
}

/* Un pago acordado: 400.000 que vencían el 15-oct, y Joan pactó el 10-oct
   pagar 450.000 el 6-nov. */
function conPacto(monto, perdonMotivo) {
  const q = { id: 'pq', numero: 3, socioId: 's1', socioNombre: 'Marta Gómez', capital: 400000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false };
  const pa = P.pactarProximoPago(cartera(q), q, { fecha: '2026-11-06', monto: monto || 450000, motivo: perdonMotivo || '' },
    '2026-10-10');
  assert.equal(pa.ok, true, 'no se pudo armar el pacto de la prueba: ' + pa.detalle);
  q.planPagos = pa.registros.planPagos;
  q.cicloActual = pa.registros.cicloActual;
  if (pa.registros.condonacion) q.condonaciones = [pa.registros.condonacion];
  return q;
}

/* Un plan del §8: 300.000 que pasaron a plan el 20-oct, tres cuotas al 5%
   sobre el saldo (15.000, 10.000 y 5.000 de costo). */
function planDel8() {
  const plan = M.construirPlanDePagos({ capital: 300000, fecha_corte: '2026-10-15', estado: 'en_corte' },
    { desde: '2026-10-20' });
  return { id: 'p8', numero: 4, socioId: 's1', socioNombre: 'Marta Gómez', capital: 300000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: plan.cuotas[0].fecha_corte,
    prorrogas: [{ fecha: '2026-10-15', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, nuevoCiclo: '2026-10-31' }],
    abonosCapital: [], comprobantes: [], pagado: false,
    planPagos: { creado: '2026-10-20', tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: '2026-10-20', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, diasMora: 0 },
      total_capital: plan.total_capital, total_costo: plan.total_costo, total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(q => ({ n: q.numero, fecha: q.fecha_corte, capital: q.capital, costo: q.costo,
        total: q.total, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 })) } };
}

const SI = { motivo: 'se quedó sin trabajo', entiende: true };

/* ==========================================================================
 * 1. EL EJEMPLO DE LA MAQUETA
 * ======================================================================== */
describe('1 · la maqueta: debía 375.000 y trae 250.000', () => {

  test('le perdona 15.000 de mora + 60.000 de costo + 50.000 de capital, y no le suma garantía', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.tipo, 'quincenal');
    assert.deepEqual(r.debia, { capital: 300000, costo: 60000, mora: 15000, total: 375000 });
    assert.equal(r.falta, 125000);
    assert.deepEqual(r.aplica, { capital: 250000, costo: 0, mora: 0 }, 'la plata no fue primero al capital');
    assert.deepEqual(r.perdona, { capital: 50000, costo: 60000, mora: 15000, total: 125000 });
    assert.equal(r.garantia, 0, 'acuñó cupo con costo que no entró');
    assert.equal(r.hay_eleccion, false, 'con pérdida de capital no hay nada que elegir');
    /* Lo que el perdón le cuesta, entero explicado: el 80% del costo era cupo
       de ella; la mora y el 20%, tuyos; y el capital, aparte. */
    assert.equal(r.garantia_sin_perdon, 48000);
    assert.equal(r.de_su_cupo, 48000);
    assert.equal(r.de_tu_ganancia, 27000);
    assert.equal(r.de_tu_ganancia + r.de_su_cupo, r.perdona.costo + r.perdona.mora);
    assert.match(r.detalle, /\$50\.000 de capital, que es pérdida/);
    assert.match(r.detalle, /No le suma garantía/);
  });

  test('los registros: el crédito cerrado con lo que entró y la condonación con su capital aparte', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, SI);
    const c = r.registros.credito;
    assert.deepEqual({ pagado: c.pagado, fechaPagado: c.fechaPagado, cicloPago: c.cicloPago, cobroRegistrado: c.cobroRegistrado },
      { pagado: true, fechaPagado: DIA, cicloPago: '2026-10-15', cobroRegistrado: true });
    assert.equal(c.gananciaPago, 0, 'gananciaPago es lo que ENTRÓ de costo y mora: nada');
    assert.equal(c.recargoMora, 0);
    assert.equal(c.moraCausada, 15000, 'perdonar la mora lavó la prueba de que la hubo');
    assert.equal(c.costoCausado, 60000);
    assert.equal(c.montoRecibido, 250000);
    assert.equal(c.capitalPerdido, 50000);
    assert.equal(c.saldoAFavor, 0);
    const k = r.registros.condonacion;
    assert.equal(k.sobre, 'cierre');
    assert.deepEqual({ costo: k.costo, mora: k.mora, capital: k.capital, motivo: k.motivo, quien: k.quien, fecha: k.fecha },
      { costo: 60000, mora: 15000, capital: 50000, motivo: 'se quedó sin trabajo', quien: 'computador', fecha: DIA });
    assert.match(k.id, /^cierre-2026-10-20-/, 'la condonación sin id se funde con otra igual en la nube');
    /* La invariante del cobro, con el capital adentro. */
    assert.equal(c.montoRecibido + k.costo + k.mora + k.capital, 300000 + c.costoCausado + c.moraCausada);
  });

  test('cerrado así, el crédito y los informes dicen lo mismo que la maqueta', () => {
    const p = quincenal();
    const db = cartera(p);
    const r = P.cierreConPerdon(db, p, DIA, 250000, SI);
    db.prestamos = [aplicar(p, r.registros)];
    const q = db.prestamos[0];
    assert.equal(P.perdidaDelCierre(q), 50000);
    assert.equal(P.capitalRecuperadoDe(q), 250000, 'contó como recuperado capital que no volvió');
    assert.deepEqual(P.gananciaDelCredito(q),
      { capital: 300000, cobrado: 0, pendiente: 0, perdonado: 50000, ganancia: -50000, pct: -16.7, pagado: true });
    assert.equal(P.garantiaGanadaCredito(q), 0);
    /* Descuentos dados (mora + costo) y capital perdido, en la MISMA fila: la
       del corte que se estaba cumpliendo, como la ganancia del cierre. */
    assert.deepEqual(P.descuentosDeQuincena(db, '2026-10-15'), { mora: 15000, costo: 60000, total: 75000, veces: 1, clientes: 1 });
    assert.deepEqual(P.capitalPerdidoDeQuincena(db, '2026-10-15'), { capital: 50000, cierre: 50000, pacto: 0, veces: 1, clientes: 1 });
    assert.deepEqual(P.capitalPerdidoDeQuincena(db, '2026-10-31'), { capital: 0, cierre: 0, pacto: 0, veces: 0, clientes: 0 });
    assert.deepEqual(P.descuentosDelSocio(db, SOCIO), { veces: 1, monto: 125000, costo: 60000, mora: 15000 });
    assert.deepEqual(P.capitalPerdidoDelSocio(db, SOCIO), { capital: 50000, cierre: 50000, pacto: 0, veces: 1, creditos: 1 });
    /* La app del cliente: el crédito pagado, lo que de verdad pagó, y ninguna
       marca (decisión 4): ni aviso ni bloqueo para pedir otro. */
    const paq = P.migrarSocio(db, SOCIO, '2026-10-21');
    const cr = paq.creditos.find(x => x.codigo === 'CR-0001');
    assert.equal(cr.pagado, true);
    assert.equal(cr.abonado, 250000, 'la app le diría que pagó plata que no pagó');
    assert.equal(cr.garantia, 0);
    assert.equal(JSON.stringify(paq).indexOf('capitalPerdido'), -1, 'la pérdida viajó al teléfono del cliente');
  });

  test('trae 330.000: perdona 15.000 de mora + 30.000 de costo, sin pérdida, y la garantía es la del costo que entró', () => {
    const p = quincenal();
    const db = cartera(p);
    const r = P.cierreConPerdon(db, p, DIA, 330000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual(r.perdona, { capital: 0, costo: 30000, mora: 15000, total: 45000 });
    assert.deepEqual(r.aplica, { capital: 300000, costo: 30000, mora: 0 });
    assert.equal(r.garantia, M.repartirCosto(30000, { aTiempo: false, producto: 'quincenal', fechaDelCredito: '2026-10-01' }).garantia_socio);
    assert.equal(r.registros.credito.capitalPerdido, 0);
    /* Lo que ve Joan es lo que el puente le acredita después al socio. */
    const q = aplicar(p, r.registros);
    assert.equal(P.garantiaGanadaCredito(q) - P.garantiaGanadaCredito(p), r.garantia);
    assert.equal(P.perdidaDelCierre(q), 0);
    /* Cabe holgado en el costo: la elección «Del costo» se conserva. */
    assert.equal(r.hay_eleccion, true);
    const c = P.cierreConPerdon(db, p, DIA, 330000, Object.assign({ sobre: 'costo' }, SI));
    assert.deepEqual(c.perdona, { capital: 0, costo: 45000, mora: 0, total: 45000 });
    assert.ok(c.garantia < r.garantia, 'perdonar costo en vez de mora no le bajó el cupo');
  });

  test('con $0 también cierra: todo el capital es pérdida', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 0, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual(r.perdona, { capital: 300000, costo: 60000, mora: 15000, total: 375000 });
    assert.equal(r.registros.credito.montoRecibido, 0);
    assert.equal(r.registros.credito.capitalPerdido, 300000);
  });
});

/* ==========================================================================
 * 2. LAS REJAS: MOTIVO, CASILLA, MONTO, Y NO ES UN PERDÓN SI NO FALTA NADA
 * ======================================================================== */
describe('2 · lo que pide antes de cerrar', () => {

  test('sin motivo no hay registros, pero sí las cifras (la pantalla las enseña mientras lo pide)', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, { entiende: true });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'falta_motivo');
    assert.equal(r.registros, null);
    assert.equal(r.perdona.capital, 50000, 'sin motivo tampoco enseñó cuánto perdona');
  });

  test('con pérdida de capital, sin la casilla «Entiendo que pierdo $X» no cierra', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, { motivo: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'falta_entiende');
    assert.match(r.detalle, /Entiendo que pierdo \$50\.000 de capital/);
    /* Sin pérdida, la casilla no hace falta. */
    assert.equal(P.cierreConPerdon(cartera(p), p, DIA, 330000, { motivo: 'x' }).ok, true);
    /* Y «entiende» tiene que ser un sí de verdad, no cualquier cosa. */
    assert.equal(P.cierreConPerdon(cartera(p), p, DIA, 250000, { motivo: 'x', entiende: 'sí' }).ok, false);
  });

  test('si trae todo o más, no es un perdón: lo dice y no registra', () => {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 375000, SI);
    assert.equal(r.motivo, 'no_falta');
    const m = P.cierreConPerdon(cartera(p), p, DIA, 380000, SI);
    assert.equal(m.motivo, 'no_falta');
    assert.match(m.detalle, /sobran \$5\.000/);
  });

  test('un monto vacío, negativo o basura no es un monto; y no lanza nunca', () => {
    const p = quincenal();
    for (const malo of ['', null, undefined, -1, 'mucho', NaN]) {
      assert.equal(P.cierreConPerdon(cartera(p), p, DIA, malo, SI).motivo, 'monto_invalido', 'aceptó ' + malo);
    }
    assert.equal(P.cierreConPerdon(cartera(p), Object.assign({}, p, { pagado: true }), DIA, 0, SI).motivo, 'pagado');
    assert.doesNotThrow(() => P.cierreConPerdon(null, null, null, null, null));
    assert.doesNotThrow(() => P.cierreConPerdon({}, { planPagos: { cuotas: [null, 'x'] } }, 'basura', 5, 'x'));
  });
});

/* ==========================================================================
 * 3. EL REPARTO Y LAS CUENTAS DEL COBRO
 * ======================================================================== */
describe('3 · repartoDelDescuento y cuentasDelCobro', () => {
  const l = { capital: 300000, costo: 60000, recargo_mora: 15000, acredita_en_fecha: false };

  test('sin `cierra` todo sigue como era: lo que pasa de costo + mora se rechaza', () => {
    const r = P.repartoDelDescuento(l, 75001, 'mora');
    assert.deepEqual(r, { excede: true, tope: 75000, costo: 0, mora: 0, hay_eleccion: true });
    assert.deepEqual(P.repartoDelDescuento(l, 20000, 'mora'),
      { excede: false, tope: 75000, costo: 5000, mora: 15000, hay_eleccion: true });
  });

  test('con `cierra`, lo que pasa de costo + mora es capital, y costo y mora van enteros', () => {
    assert.deepEqual(P.repartoDelDescuento(l, 125000, 'mora', { cierra: true }),
      { excede: false, tope: 75000, costo: 60000, mora: 15000, hay_eleccion: false, capital: 50000 });
    assert.deepEqual(P.repartoDelDescuento(l, 125000, 'costo', { cierra: true }),
      { excede: false, tope: 75000, costo: 60000, mora: 15000, hay_eleccion: false, capital: 50000 },
      'la elección no puede mover plata que ya es pérdida');
    assert.deepEqual(P.repartoDelDescuento(l, 45000, 'mora', { cierra: true }),
      { excede: false, tope: 75000, costo: 30000, mora: 15000, hay_eleccion: true, capital: 0 });
    /* Más que todo lo que se debe (un monto negativo): no. */
    assert.equal(P.repartoDelDescuento(l, 375001, 'mora', { cierra: true }).excede, true);
  });

  test('cuentasDelCobro: con capital perdonado, la plata fue toda al capital y no deja garantía', () => {
    const p = quincenal();
    /* Aunque quien llama pida perdonar solo un poco de costo, si hay capital
       perdonado es porque no alcanzó: costo y mora se perdonan enteros. */
    const q = P.cuentasDelCobro(cartera(p), p, l, { condonaCapital: 50000, condonaCosto: 1, condonaMora: 0 });
    assert.equal(q.condonado_capital, 50000);
    assert.equal(q.condonado_costo, 60000);
    assert.equal(q.condonado_mora, 15000);
    assert.equal(q.condonado_total, 75000, 'el capital no es «descuento»: va aparte');
    assert.equal(q.ganancia_pago, 0);
    assert.equal(q.garantia, 0);
    assert.equal(q.capital_recibido, 250000);
    assert.equal(q.total_a_recibir, 250000);
    assert.equal(q.de_tu_ganancia + q.de_su_cupo, q.condonado_total);
    /* El capital se topa contra el que hay. */
    assert.equal(P.cuentasDelCobro(cartera(p), p, l, { condonaCapital: 999999 }).condonado_capital, 300000);
    /* Y sin capital perdonado, lo de siempre. */
    const s = P.cuentasDelCobro(cartera(p), p, l, { condonaMora: 15000 });
    assert.equal(s.condonado_capital, 0);
    assert.equal(s.total_a_recibir, 360000);
  });
});

/* ==========================================================================
 * 4. EL CRÉDITO A CUOTAS
 * ======================================================================== */
describe('4 · a cuotas: cierra el crédito entero, la cuota más vieja primero', () => {

  test('el 5-nov debe 864.500; trae 500.000: 150.000 de capital perdidos, sin garantía', () => {
    const p = aCuotas();
    const db = cartera(p);
    const r = P.cierreConPerdon(db, p, '2026-11-05', 500000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.tipo, 'a_cuotas');
    const todo = P.liquidarSaldoPlan(p, '2026-11-05');
    assert.equal(r.debia.total, todo.total, '«lo que debía hoy» no es «pagar todo»');
    assert.deepEqual(r.debia, { capital: 650000, costo: 195000, mora: 19500, total: 864500 });
    assert.deepEqual(r.perdona, { capital: 150000, costo: 195000, mora: 19500, total: 364500 });
    assert.equal(r.garantia, 0);
    /* La cuota 1 recibe su capital entero, la 2 lo que alcanza. */
    assert.deepEqual(r.registros.abonos.map(a => [a.cuotaPlan, a.monto, a.recibido]), [[1, 325000, 325000], [2, 175000, 175000]]);
    const [c1, c2] = r.registros.cuotas;
    assert.equal(c1.pagado && c2.pagado, true);
    assert.equal(c1.capitalPerdido, undefined);
    assert.equal(c2.capitalPerdido, 150000);
    assert.equal(c1.moraCausada, 19500, 'la mora perdonada de la cuota 1 no dejó su prueba');
    assert.equal(c1.recargo, 0);
    /* Las dos llevan su marca: a la 1 se le perdonaron costo y mora; a la 2,
       costo y capital. «Pagada» a secas diría que entró todo lo suyo. */
    assert.equal(c1.conPerdon, true);
    assert.equal(c2.conPerdon, true);
    assert.equal(r.registros.credito.capitalPerdido, 150000);
    assert.equal(r.registros.credito.montoRecibido, 500000);
    const q = aplicar(p, r.registros);
    db.prestamos = [q];
    assert.equal(q.pagado, true);
    assert.equal(P.capitalActual(q), 150000, 'el capital que no volvió no es la pérdida');
    assert.equal(P.capitalRecuperadoDe(q), 500000);
    assert.equal(P.gananciaDelCredito(q).ganancia, -150000);
    assert.equal(P.garantiaGanadaCredito(q), 0);
    /* El cierre de un crédito con cuotas va a la quincena que contiene el corte
       de la cuota más vieja: la del 30-oct es de la del 31. */
    assert.equal(P.quincenaDe('2026-10-30'), '2026-10-31');
    assert.deepEqual(P.capitalPerdidoDeQuincena(db, '2026-10-31'), { capital: 150000, cierre: 150000, pacto: 0, veces: 1, clientes: 1 });
    assert.equal(P.descuentosDeQuincena(db, '2026-10-31').total, 214500);
    /* La mora existió aunque se haya perdonado entera (el nivel no se lava). */
    assert.equal(P.estuvoEnMora(q, '2026-11-30'), true);
  });

  test('trae 700.000: capital entero, 50.000 al costo de la cuota más vieja, y la garantía de ese costo', () => {
    const p = aCuotas();
    const r = P.cierreConPerdon(cartera(p), p, '2026-11-05', 700000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual(r.perdona, { capital: 0, costo: 145000, mora: 19500, total: 164500 });
    assert.equal(r.registros.cuotas[0].costo, 50000);
    assert.equal(r.registros.cuotas[0].costoPactado, 130000);
    assert.equal(r.registros.cuotas[1].costo, 0);
    const q = aplicar(p, r.registros);
    assert.equal(P.garantiaGanadaCredito(q) - P.garantiaGanadaCredito(p), r.garantia, 'la garantía que ve Joan no es la que se acredita');
    assert.ok(r.garantia > 0);
    assert.equal(P.perdidaDelCierre(q), 0);
    assert.equal(P.capitalActual(q), 0);
  });

  test('antes de que empiece la cuota 2, su costo no se debe (la regla de «pagar todo»)', () => {
    const p = aCuotas();
    const r = P.cierreConPerdon(cartera(p), p, '2026-10-29', 600000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.debia.total, P.liquidarSaldoPlan(p, '2026-10-29').total);
    assert.equal(r.debia.costo, 130000);
    assert.equal(r.costo_que_no_se_cobra, 65000);
    assert.equal(r.perdona.capital, 50000);
  });

  test('con un abono previo a la cuota 1, el cierre cuenta lo que ya entró', () => {
    const p = aCuotas();
    const ab = P.abonoACuota(p, '2026-11-02', 100000);
    assert.equal(ab.ok, true, ab.detalle);
    p.abonosCapital.push(ab.registros.abono);
    const r = P.cierreConPerdon(cartera(p), p, '2026-11-05', 400000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.debia.total, P.liquidarSaldoPlan(p, '2026-11-05').total);
    const q = aplicar(p, r.registros);
    assert.equal(P.capitalActual(q), r.perdona.capital);
    assert.equal(P.capitalRecuperadoDe(q), 650000 - r.perdona.capital);
  });

  test('con una fecha anterior a un pago ya anotado, no', () => {
    const p = aCuotas();
    const ab = P.abonoACuota(p, '2026-11-02', 100000);
    p.abonosCapital.push(ab.registros.abono);
    const r = P.cierreConPerdon(cartera(p), p, '2026-11-01', 400000, SI);
    assert.equal(r.motivo, 'fecha_anterior');
    assert.equal(r.registros, null);
  });
});

/* ==========================================================================
 * 5. EL PAGO ACORDADO Y EL PLAN DEL §8
 * ======================================================================== */
describe('5 · el pago acordado y el plan del §8 también cierran con perdón', () => {

  test('pago acordado de 450.000 el 6-nov; el 10-nov trae 300.000', () => {
    const q = conPacto();
    const db = cartera(q);
    const r = P.cierreConPerdon(db, q, '2026-11-10', 300000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.tipo, 'pacto');
    assert.deepEqual(r.debia, { capital: 400000, costo: 50000, mora: 16000, total: 466000 });
    assert.deepEqual(r.perdona, { capital: 100000, costo: 50000, mora: 16000, total: 166000 });
    const c = aplicar(q, r.registros);
    db.prestamos = [c];
    assert.equal(P.capitalRecuperadoDe(c), 300000);
    assert.equal(P.gananciaDelCredito(c).ganancia, -100000);
    assert.equal(P.capitalPerdidoDeQuincena(db, P.quincenaDe('2026-11-06')).capital, 100000);
  });

  test('si el pacto ya perdonó capital, las dos pérdidas se cuentan, cada una en su fila, sin doble cuenta', () => {
    /* Pactó 380.000 el 6-nov sobre 400.000 de capital: perdonó 20.000. */
    const q = conPacto(380000, 'le rebajé para que alcance');
    assert.equal(P.capitalPerdonadoDe(q), 20000);
    const db = cartera(q);
    const r = P.cierreConPerdon(db, q, '2026-11-10', 300000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.debia.capital, 380000, 'el capital que ya se perdonó en el pacto se volvió a deber');
    assert.equal(r.perdona.capital, 80000);
    const c = aplicar(q, r.registros);
    db.prestamos = [c];
    assert.equal(P.capitalPerdidoDe(c), 100000);
    assert.equal(P.capitalRecuperadoDe(c), 300000);
    assert.deepEqual(P.capitalPerdidoDelSocio(db, SOCIO), { capital: 100000, cierre: 80000, pacto: 20000, veces: 2, creditos: 1 });
    const d = P.descuentosDelSocio(db, SOCIO);
    assert.equal(d.monto, d.costo + d.mora + 100000);
  });

  test('plan del §8: debe el capital de las tres cuotas, su costo fijo y la mora', () => {
    const p = planDel8();
    const r = P.cierreConPerdon(cartera(p), p, '2026-11-03', 200000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.tipo, 'plan_de_pagos');
    assert.equal(r.debia.capital, 300000);
    assert.equal(r.debia.costo, 30000, 'el costo del plan del §8 es el que el plan tiene fijo');
    assert.equal(r.perdona.capital, 100000);
    assert.equal(r.garantia, 0);
    const c = aplicar(p, r.registros);
    assert.equal(c.pagado, true);
    assert.equal(P.capitalActual(c), 100000);
    assert.equal(P.capitalRecuperadoDe(c), 200000);
    /* Por encima del capital, la cuota más vieja cobra su costo primero. */
    const s = P.cierreConPerdon(cartera(p), p, '2026-11-03', 310000, SI);
    assert.equal(s.ok, true, s.detalle);
    assert.equal(s.registros.cuotas[0].costo, 10000);
    assert.equal(s.registros.credito.capitalPerdido, 0);
    /* La cuota 1 recibió solo 10.000 de sus 15.000 de costo: se le perdonó algo. */
    assert.equal(s.registros.cuotas[0].conPerdon, true);
    /* Y una cuota que la plata cubrió entera no lleva la marca: el 30-oct
       (antes de que la 1 venza, sin mora) debe 330.000; con 325.000 la 1 entra
       completa (100.000 + 15.000) y los 5.000 que faltan caen en la 3. */
    const t = P.cierreConPerdon(cartera(p), p, '2026-10-30', 325000, SI);
    assert.equal(t.ok, true, t.detalle);
    assert.equal(t.registros.cuotas[0].conPerdon, undefined, 'marcó con perdón una cuota que entró entera');
    assert.equal(t.registros.cuotas[2].conPerdon, true);
  });
});
