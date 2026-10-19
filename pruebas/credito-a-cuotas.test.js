'use strict';
/* ============================================================================
 * EL CRÉDITO A CUOTAS — 16 de octubre de 2026 (el núcleo: motor, puente, nube)
 *
 *   node --test pruebas/credito-a-cuotas.test.js
 *
 * Joan: «tengo el caso de un préstamo a cuotas de 650.000 pesos, paga la
 * primera cuota el 30 de este mes, el 20% de 650.000 y la mitad del capital
 * (455.000), y los 325.000 restantes para el 15 de noviembre más el 20%
 * (390.000). Quiero poder tener la opción de un registro a cuotas y que el
 * porcentaje y las fechas de pago de cada cuota lo pueda modificar yo».
 *
 * Y sus cuatro decisiones del mismo día, que estas pruebas amarran:
 *   1. la fecha que él pone NO se corre aunque caiga domingo o festivo (se
 *      avisa, con la cifra);
 *   2. pagar todo antes = el capital + el costo de las cuotas cuyo período ya
 *      empezó; «el interés de la siguiente quincena no se cobra»;
 *   3. un abono a la cuota va a mora, costo y capital, y lo que falta sigue en
 *      esa cuota;
 *   4. después del alta solo se cambian cuotas que no han vencido.
 *
 * Las pantallas tienen sus propias pruebas (credito-a-cuotas-crm y
 * credito-a-cuotas-socio). Estas miden LA PLATA: si una cifra de acá cambia,
 * cambió lo que se le cobra a alguien.
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/motor.js');
const P = require('../app/puente.js');
const N = require('../panel/nube.js');

const DESEMBOLSO = '2026-10-16';
const CUOTAS_DE_JOAN = [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }];

function planDeJoan() {
  return M.construirPlanACuotas(650000, CUOTAS_DE_JOAN, { fechaDesembolso: DESEMBOLSO });
}
function creditoDeJoan() {
  return { id: 'P1', numero: 1, socioId: 'C1', socioNombre: 'CLIENTE DE PRUEBA', capital: 650000, costoPct: 20,
           fechaDesembolso: DESEMBOLSO, cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [],
           comprobantes: [], pagado: false, planPagos: P.planPagosDeAlta(planDeJoan()) };
}
/* Cobrar la cuota que sigue con la cuenta COMPARTIDA (puente.cierreDeCuota),
   escribiendo lo que devuelve como lo escriben el CRM y el celular. */
function aplicarCierre(p, r) {
  Object.assign(P.cuotasPlan(p).find(c => c.n === r.registros.cuota.n), r.registros.cuota);
  if (r.registros.abono) p.abonosCapital.push(r.registros.abono);
  if (r.registros.cicloActual) p.cicloActual = r.registros.cicloActual;
  if (r.registros.credito) Object.assign(p, r.registros.credito);
}
function cobrarCuota(p, f) {
  const r = P.cierreDeCuota(p, f);
  assert.ok(r.ok, r.detalle);
  aplicarCierre(p, r);
  return r.total;
}
function abonar(p, f, monto) {
  const r = P.abonoACuota(p, f, monto);
  assert.ok(r.ok, r.detalle);
  p.abonosCapital.push(r.registros.abono);
  return r;
}
function saldar(p, f) {
  const r = P.liquidarSaldoPlan(p, f);
  assert.equal(r.rechazo, null, r.rechazo);
  r.registros.cuotas.forEach(x => Object.assign(P.cuotasPlan(p).find(c => c.n === x.n), x));
  r.registros.abonos.forEach(x => p.abonosCapital.push(x));
  Object.assign(p, r.registros.credito);
  return r;
}

describe('el motor arma las cuotas de Joan, y no arma las que no cuadran', () => {
  test('su caso, peso a peso: 455.000 el 30-oct y 390.000 el 15-nov', () => {
    const r = planDeJoan();
    assert.deepEqual(r.cuotas.map(c => [c.fecha_corte, c.saldo_insoluto, c.capital, c.costo, c.total]), [
      ['2026-10-30', 650000, 325000, 130000, 455000],
      ['2026-11-15', 325000, 325000, 65000, 390000]]);
    assert.equal(r.total_a_pagar, 845000);
    assert.equal(r.total_costo, 195000);
    assert.equal(r.total_garantia, 156000, 'el 80% del costo');
    assert.equal(r.tasa_por_corte, 0.2, 'decimal, como el plan del §8: el CRM lo multiplica por 100');
    assert.equal(r.sobre_estandar, false);
  });

  test('el 15-nov es domingo (y el 16 festivo): NO se corre, se avisa', () => {
    /* Decisión de Joan. Si alguien «arregla» esto corriendo la fecha, el
       cliente de Joan pagaría otra fecha de la que él le dijo. */
    const r = planDeJoan();
    assert.equal(r.cuotas[1].fecha_corte, '2026-11-15');
    assert.equal(r.cuotas[1].habil, false);
    assert.deepEqual(r.inhabiles, [{ numero: 2, fecha: '2026-11-15', motivo: 'domingo', siguiente_habil: '2026-11-17' }]);
  });

  test('cada cuota con su %: el costo sale sobre lo que se debe al empezarla', () => {
    const r = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-17', pct: 10 }],
                                     { fechaDesembolso: DESEMBOLSO });
    assert.deepEqual(r.cuotas.map(c => c.costo), [130000, 32500]);
  });

  test('los capitales que no vienen se reparten, y la última cuota se queda con el resto', () => {
    const r = M.construirPlanACuotas(100001, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 },
      { fecha: '2026-11-30', pct: 20 }], { fechaDesembolso: DESEMBOLSO });
    assert.deepEqual(r.cuotas.map(c => c.capital), [33333, 33333, 33335]);
    const dados = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20, capital: 450000 },
      { fecha: '2026-11-15', pct: 20 }], { fechaDesembolso: DESEMBOLSO });
    assert.deepEqual(dados.cuotas.map(c => c.capital), [450000, 200000]);
  });

  test('revienta —no topa en silencio— con lo que no cuadra', () => {
    const malas = [
      ['% cero', [{ fecha: '2026-10-30', pct: 0 }, { fecha: '2026-11-15', pct: 20 }], /mayor que cero/],
      ['% con decimales', [{ fecha: '2026-10-30', pct: 12.5 }, { fecha: '2026-11-15', pct: 20 }], /entero/],
      ['% sobre el techo', [{ fecha: '2026-10-30', pct: 51 }, { fecha: '2026-11-15', pct: 20 }], /techo/],
      ['fechas al revés', [{ fecha: '2026-11-15', pct: 20 }, { fecha: '2026-10-30', pct: 20 }], /no es después de la cuota anterior/],
      ['el mismo día del desembolso', [{ fecha: DESEMBOLSO, pct: 20 }, { fecha: '2026-11-15', pct: 20 }], /no es después del desembolso/],
      // Una cuota de puro costo nunca causaría mora: el recargo corre sobre su capital.
      ['una cuota sin capital', [{ fecha: '2026-10-30', pct: 20, capital: 650000 }, { fecha: '2026-11-15', pct: 20 }], /no queda con qué repartir/],
      ['capitales que no suman', [{ fecha: '2026-10-30', pct: 20, capital: 300000 }, { fecha: '2026-11-15', pct: 20, capital: 300000 }], /suman 600000/],
      ['una sola cuota', [{ fecha: '2026-10-30', pct: 20 }], /van de 2/],
      ['la última a más de seis meses', [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2027-05-30', pct: 20 }], /tope/],
    ];
    for (const [que, cuotas, msj] of malas) {
      assert.throws(() => M.construirPlanACuotas(650000, cuotas, { fechaDesembolso: DESEMBOLSO }), msj, que);
    }
    assert.throws(() => M.construirPlanACuotas(650000, CUOTAS_DE_JOAN, {}), /fechaDesembolso/, 'sin desembolso');
  });

  test('construirPlanDePagos (el rescate del §8) sigue exactamente igual', () => {
    const r = M.construirPlanDePagos({ capital: 300000, fecha_corte: '2026-08-15' }, { desde: '2026-08-15' });
    assert.equal(r.cuotas.length, M.CUOTAS_PLAN_DE_PAGOS);
    assert.equal(r.tasa_por_corte, M.TASA_PLAN_DE_PAGOS);
  });
});

describe('el puente cobra las cuotas de Joan como él las dijo', () => {
  test('en fecha: 455.000 y 390.000; ganancia 195.000 y garantía 156.000', () => {
    const p = creditoDeJoan();
    const hoy = P.liquidarCiclo(p, DESEMBOLSO);
    assert.deepEqual([hoy.capital, hoy.costo, hoy.recargo_mora, hoy.total_a_pagar, hoy.corte],
                     [325000, 130000, 0, 455000, '2026-10-30']);
    assert.equal(cobrarCuota(p, '2026-10-30'), 455000);
    assert.equal(P.corteDelCredito(p), '2026-11-15');
    assert.equal(cobrarCuota(p, '2026-11-15'), 390000);
    assert.equal(P.gananciaCobrada(p), 195000);
    assert.equal(P.garantiaGanadaCredito(p), 156000);
    assert.equal(P.capitalRecuperadoDe(p), 650000);
  });

  test('pagarlo en fecha CUENTA como pagar en fecha: no es un plan de rescate', () => {
    /* Antes del 16-oct todo crédito con planPagos rompía la racha desde el día
       del desembolso, aunque se pagara perfecto. */
    const p = creditoDeJoan();
    assert.equal(P.estadoParaNivel(p, '2026-10-20'), 'abierto');
    cobrarCuota(p, '2026-10-30'); cobrarCuota(p, '2026-11-15');
    assert.equal(P.estadoParaNivel(p, '2026-11-20'), 'gana');
  });

  test('una cuota pagada tarde sí rompe, como cualquier crédito', () => {
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-11-03'); cobrarCuota(p, '2026-11-15');
    assert.equal(P.estadoParaNivel(p, '2026-11-20'), 'rompe');
  });

  test('el plan del §8 sigue rompiendo la racha: ese sí es un rescate', () => {
    const p = creditoDeJoan();
    p.planPagos.origen = undefined;
    p.planPagos.entrada = { fecha: DESEMBOLSO, ciclo: '2026-10-15', monto: 1, mora: 0, aTiempo: true };
    assert.equal(P.estadoParaNivel(p, '2026-10-20'), 'rompe');
  });

  test('la mora corre sobre el capital de la cuota, desde el día siguiente a su fecha', () => {
    const p = creditoDeJoan();
    assert.equal(P.liquidarCiclo(p, '2026-10-30').recargo_mora, 0, 'el día de la cuota no es mora');
    assert.equal(P.liquidarCiclo(p, '2026-11-05').recargo_mora, 19500, '6 días × 1% × 325.000');
    /* Y la fecha de Joan se respeta: el 15-nov (domingo) pagado el martes 17
       son 2 días. Es lo que él decidió, y lo que la pantalla avisa al guardar. */
    cobrarCuota(p, '2026-10-30');
    assert.equal(P.liquidarCiclo(p, '2026-11-17').recargo_mora, 6500);
  });

  test('la cuota vencida de atrás no se queda callada', () => {
    const p = creditoDeJoan();
    assert.equal(P.liquidarCiclo(p, '2026-11-20').total_a_pagar, 523250, 'la cuota 1 con 21 días');
    assert.deepEqual(P.cuotasVencidas(p, '2026-11-20').map(v => [v.n, v.total, v.mora, v.dias]),
                     [[1, 523250, 68250, 21], [2, 406250, 16250, 5]]);
  });

  test('el corte es la fecha de la cuota que sigue, aunque cicloActual se haya quedado atrás', () => {
    const p = creditoDeJoan();
    p.cicloActual = '2026-10-31';
    assert.equal(P.corteDelCredito(p), '2026-10-30');
    assert.equal(P.liquidarCiclo(p, '2026-10-31').recargo_mora, 3250);
  });

  test('la etiqueta del % es la de la cuota que corre', () => {
    const p = creditoDeJoan();
    p.planPagos.cuotas[1].pct = 10;
    assert.equal(P.tasaDelCiclo(p), 0.2);
    cobrarCuota(p, '2026-10-30');
    assert.equal(P.tasaDelCiclo(p), 0.1);
  });
});

describe('el abono a una cuota: mora, costo, capital, y lo que falta sigue ahí', () => {
  test('100.000 el 5-nov: 19.500 a mora, 80.500 a costo, y quedan 374.500 en la cuota 1', () => {
    const p = creditoDeJoan();
    const r = abonar(p, '2026-11-05', 100000);
    assert.deepEqual(r.aplica, { mora: 19500, costo: 80500, capital: 0 });
    assert.deepEqual(r.queda, { mora: 0, costo: 49500, capital: 325000, total: 374500 });
    assert.equal(P.liquidarCiclo(p, '2026-11-05').total_a_pagar, 374500);
    assert.equal(P.corteDelCredito(p), '2026-10-30', 'la cuota sigue en su fecha');
  });

  test('la mora sigue corriendo, pero solo sobre el capital que falta', () => {
    const p = creditoDeJoan();
    abonar(p, '2026-11-05', 100000);
    const r = abonar(p, '2026-11-08', 200000);
    assert.deepEqual(r.aplica, { mora: 9750, costo: 49500, capital: 140750 }, '3 días × 3.250, el costo y el resto a capital');
    const liq = P.liquidarCiclo(p, '2026-11-10');
    assert.deepEqual([liq.capital, liq.costo, liq.recargo_mora, liq.total_a_pagar], [184250, 0, 3685, 187935],
      '2 días × 1% × 184.250');
    assert.equal(P.capitalActual(p), 509250);
  });

  test('el costo que entra en un abono ya es ganancia, y deja su garantía ese día', () => {
    const p = creditoDeJoan();
    abonar(p, '2026-11-05', 100000);
    abonar(p, '2026-11-08', 200000);
    assert.equal(P.gananciaCobrada(p), 159250, '130.000 de costo + 29.250 de mora');
    assert.equal(P.garantiaGanadaCredito(p), 104000, 'el 80% de los 130.000; la mora no deja (crédito de después del 27-sep)');
  });

  test('cerrar la cuota después de abonar cobra solo lo que falta y no baja el capital dos veces', () => {
    const p = creditoDeJoan();
    abonar(p, '2026-11-05', 100000);
    abonar(p, '2026-11-08', 200000);
    assert.equal(cobrarCuota(p, '2026-11-10'), 187935);
    assert.equal(P.cuotasPlan(p)[0].recargo, 32935, 'toda la mora de la cuota: 19.500 + 9.750 + 3.685');
    assert.equal(P.capitalActual(p), 325000);
    assert.equal(cobrarCuota(p, '2026-11-15'), 390000);
    assert.equal(P.gananciaCobrada(p), 227935);
    assert.equal(P.garantiaGanadaCredito(p), 156000);
  });

  test('el reparto 80/20 parte la cuota en los mismos pedazos que la garantía', () => {
    /* Si las dos cuentas partieran distinto, la suma de las garantías del
       reparto dejaría de dar la garantía del socio por un peso de redondeo. */
    const p = creditoDeJoan();
    abonar(p, '2026-11-05', 100001);
    abonar(p, '2026-11-08', 33333);
    cobrarCuota(p, '2026-11-10'); cobrarCuota(p, '2026-11-15');
    const movs = P.movimientosCobradosCredito(p);
    const costo = movs.filter(m => m.tipo === 'cuota_plan');
    assert.equal(costo.reduce((t, m) => t + m.monto, 0), 195000);
    const garantiaDelReparto = costo.reduce((t, m) => t + M.acumularGarantia(m.monto, m.aTiempo), 0);
    assert.equal(garantiaDelReparto, P.garantiaGanadaCredito(p));
  });

  test('si la plata completa la cuota, no es un abono: se cobra la cuota', () => {
    const p = creditoDeJoan();
    const r = P.abonoACuota(p, '2026-10-30', 455000);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'completa_la_cuota');
    const mas = P.abonoACuota(p, '2026-10-30', 500000);
    assert.match(mas.detalle, /sobra \(\$45\.000\)/);
    assert.equal(P.abonoACuota(p, '2026-10-30', 0).motivo, 'monto_invalido');
  });

  test('dos abonos iguales el mismo día son dos abonos', () => {
    const p = creditoDeJoan();
    const a = abonar(p, '2026-10-30', 50000), b = abonar(p, '2026-10-30', 50000);
    assert.notEqual(a.registros.abono.id, b.registros.abono.id);
    const fila = N.fusionarFila(p, { abonosCapital: [] }).fila;
    assert.equal(fila.abonosCapital.length, 2, 'la nube no los funde en uno');
  });

  test('ni aunque los anoten dos aparatos distintos sobre la misma copia', () => {
    /* El id contaba los abonos de esa copia: los dos aparatos sacaban el
       mismo, y la nube fundía 50.000 y 30.000 en uno solo (los dos van enteros
       al costo, así que lo que va a capital es 0 en los dos). */
    const A = creditoDeJoan(), B = creditoDeJoan();
    abonar(A, '2026-10-31', 50000);
    abonar(B, '2026-10-31', 30000);
    /* Desde la tercera revisión (19-oct) dos abonos a la misma cuota anotados
       cada uno sin conocer el otro son un CHOQUE —cada reparto contó la mora
       como si el otro no existiera—, pero ninguno desaparece en silencio: los
       dos salen en pesos para que Joan decida. */
    const r = N.fusionarFila(A, B);
    const ab = r.pisables.find(x => x.campo === 'abonosCapital');
    assert.ok(ab);
    assert.match(ab.mio, /\$50000/);
    assert.match(ab.suyo, /\$30000/);
  });

  test('un abono con fecha anterior a otro ya anotado no se acepta', () => {
    /* La mora pendiente de una fecha descuenta solo lo abonado hasta esa
       fecha: anotar el del 2-nov después del del 5-nov cobraba dos veces la
       mora del 31-oct al 2-nov. */
    const p = creditoDeJoan();
    abonar(p, '2026-11-05', 100000);
    assert.equal(P.abonoACuota(p, '2026-11-02', 50000).motivo, 'fecha_anterior');
    assert.equal(P.cierreDeCuota(p, '2026-11-03').motivo, 'fecha_anterior');
    assert.match(P.liquidarSaldoPlan(p, '2026-11-03').rechazo, /orden/);
  });

  test('ni con una fecha anterior al cobro de OTRA cuota', () => {
    /* La cuota 1 cobrada el 2-nov; la 2 anotada con fecha 29-oct pasaba por
       «quincena no empezada» y salía 65.000 más barata. */
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-11-02');
    assert.equal(P.cierreDeCuota(p, '2026-10-29').motivo, 'fecha_anterior');
    assert.equal(P.abonoACuota(p, '2026-10-29', 100000).motivo, 'fecha_anterior');
    assert.match(P.liquidarSaldoPlan(p, '2026-10-29').rechazo, /orden/);
    assert.equal(P.cierreDeCuota(p, '2026-11-02').total, 390000, 'el mismo día de la otra sí');
  });

  test('un abono antes de que empiece la quincena dice lo que la cuota valdrá en su fecha', () => {
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-10-20');
    const r = P.abonoACuota(p, '2026-10-25', 100000);
    assert.equal(r.queda.total, 225000, 'hoy: solo capital');
    assert.deepEqual(r.en_su_fecha, { fecha: '2026-11-15', total: 270000, capital: 225000, costo: 45000 });
  });

  test('si trae lo de pagar todo, no es un abono: es pagar todo', () => {
    const r = P.abonoACuota(creditoDeJoan(), '2026-10-30', 780000);
    assert.equal(r.motivo, 'salda_el_credito');
    assert.match(r.detalle, /\$780\.000/);
  });
});

describe('pagar todo antes: «el interés de la siguiente quincena no se cobra»', () => {
  test('todo el 30-oct = 780.000 (o el 20-oct: la quincena que empezó se cobra entera)', () => {
    for (const f of ['2026-10-20', '2026-10-30']) {
      const r = P.liquidarSaldoPlan(creditoDeJoan(), f);
      assert.deepEqual([r.capital, r.costo, r.mora, r.total, r.costo_que_no_se_cobra], [650000, 130000, 0, 780000, 65000], f);
    }
  });

  test('el 31-oct ya corre la quincena de la cuota 2, y la 1 trae un día de mora', () => {
    const r = P.liquidarSaldoPlan(creditoDeJoan(), '2026-10-31');
    assert.deepEqual([r.costo, r.mora, r.total], [195000, 3250, 848250]);
  });

  test('con la cuota 1 pagada antes de su fecha, la 2 todavía no empezó: solo capital', () => {
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-10-20');
    assert.equal(P.liquidarSaldoPlan(p, '2026-10-25').total, 325000);
  });

  test('saldado el 30-oct: queda pagado, ganó 130.000, la garantía es la de lo que entró, y cuenta en fecha', () => {
    const p = creditoDeJoan();
    saldar(p, '2026-10-30');
    assert.equal(p.pagado, true);
    assert.equal(P.cuotaPlanActual(p), null);
    assert.equal(P.gananciaCobrada(p), 130000);
    assert.equal(P.garantiaGanadaCredito(p), 104000);
    assert.equal(P.capitalRecuperadoDe(p), 650000);
    assert.equal(P.capitalActual(p), 0);
    assert.equal(P.estadoParaNivel(p, '2026-11-20'), 'gana');
    const c2 = P.cuotasPlan(p)[1];
    assert.deepEqual([c2.costo, c2.costoPactado, c2.saldadoAntes], [0, 65000, true], 'lo pactado queda escrito aparte');
  });

  test('las dos cuotas de 325.000 cerradas el mismo día sobreviven a la nube', () => {
    /* Antes del 16-oct la identidad de un abono era fecha + monto, y
       fusionarListas deduplica también dentro de un mismo lado: el primer
       viaje a la nube se comía 325.000 de capital devuelto. */
    const p = creditoDeJoan();
    saldar(p, '2026-10-30');
    const fila = N.fusionarFila(p, JSON.parse(JSON.stringify(p))).fila;
    assert.equal(fila.abonosCapital.reduce((t, a) => t + a.monto, 0), 650000);
  });

  test('saldar después de un abono con mora cuenta TODA la mora que entró', () => {
    const p = creditoDeJoan();
    abonar(p, '2026-11-05', 100000);
    assert.equal(saldar(p, '2026-11-10').total, 780750);
    assert.equal(P.cuotasPlan(p)[0].recargo, 35750, '19.500 del abono + 16.250 al saldar');
    assert.equal(P.gananciaCobrada(p), 230750);
  });

  test('pagar la última cuota antes de que empiece ES pagar todo: el mismo precio', () => {
    /* La revisión del 16-oct lo encontró: el 30-oct, con la cuota 1 pagada,
       cobrar la cuota 2 costaba 390.000 y pagar todo 325.000 por el mismo
       cierre. */
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-10-30');
    assert.equal(P.liquidarCiclo(p, '2026-10-30').total_a_pagar, 325000);
    assert.equal(P.liquidarSaldoPlan(p, '2026-10-30').total, 325000);
    assert.equal(P.liquidarCiclo(p, '2026-10-31').total_a_pagar, 390000, 'desde el 31-oct corre su quincena');
    const r = P.cierreDeCuota(p, '2026-10-30');
    assert.equal(r.total, 325000);
    assert.deepEqual([r.registros.cuota.costo, r.registros.cuota.costoPactado, r.registros.cuota.saldadoAntes],
                     [0, 65000, true]);
  });

  test('capital devuelto antes de que empiece una cuota baja su costo: el % corre sobre lo que se debe', () => {
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-10-20');
    const a = abonar(p, '2026-10-25', 100000);
    assert.deepEqual(a.aplica, { mora: 0, costo: 0, capital: 100000 }, 'antes de su quincena, todo a capital');
    assert.equal(P.liquidarCiclo(p, '2026-11-15').total_a_pagar, 270000, '225.000 + el 20% de 225.000');
  });

  test('una cuota del medio que no ha empezado no se cierra sola; se abona o se paga todo', () => {
    const plan = M.construirPlanACuotas(600000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-17', pct: 20 },
      { fecha: '2026-11-30', pct: 20 }], { fechaDesembolso: DESEMBOLSO });
    const p = Object.assign(creditoDeJoan(), { capital: 600000, planPagos: P.planPagosDeAlta(plan) });
    cobrarCuota(p, '2026-10-30');
    assert.equal(P.cierreDeCuota(p, '2026-10-30').motivo, 'no_ha_empezado');
    assert.equal(P.abonoACuota(p, '2026-10-30', 200001).motivo, 'adelanta_de_mas', 'más que todo su capital no tiene adónde ir');
    assert.ok(P.abonoACuota(p, '2026-10-30', 200000).ok, 'todo su capital sí');
    assert.equal(P.liquidarSaldoPlan(p, '2026-10-30').total, 400000, 'pagar todo: solo capital');
  });

  test('BARRIDO: pagar todo = cuota por cuota = abonar y pagar todo, el mismo día', () => {
    /* La propiedad que la primera versión rompía en 192 combinaciones. */
    const planes = [
      [650000, CUOTAS_DE_JOAN],
      [600001, [{ fecha: '2026-10-31', pct: 7 }, { fecha: '2026-11-17', pct: 33, capital: 150000 }, { fecha: '2026-11-30', pct: 12 }]],
    ];
    const dia = d => { const t = new Date(2026, 9, 16 + d); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
    const copia = o => JSON.parse(JSON.stringify(o));
    let casos = 0;
    for (const [cap, cuotas] of planes) {
      const plan = M.construirPlanACuotas(cap, cuotas, { fechaDesembolso: DESEMBOLSO });
      const base = Object.assign(creditoDeJoan(), { capital: cap, planPagos: P.planPagosDeAlta(plan) });
      for (let a = 0; a < 50; a += 3) for (let b = a; b < 50; b += 4) {
        const p = copia(base);
        const r1 = P.cierreDeCuota(p, dia(a)); if (!r1.ok) continue;
        aplicarCierre(p, r1); if (p.pagado) continue;
        const todo = P.liquidarSaldoPlan(p, dia(b)).total;
        const uno = copia(p); let t = 0, bloqueado = false;
        while (!uno.pagado) {
          const r = P.cierreDeCuota(uno, dia(b));
          if (!r.ok) { bloqueado = r.motivo === 'no_ha_empezado'; assert.ok(bloqueado, r.detalle); break; }
          aplicarCierre(uno, r); t += r.total;
        }
        if (!bloqueado) assert.equal(t, todo, 'cuota por cuota el ' + dia(b));
        for (const x of [1000, 19500, 77777]) {
          const q = copia(p), ab = P.abonoACuota(q, dia(b), x);
          if (!ab.ok) continue;
          q.abonosCapital.push(ab.registros.abono);
          assert.equal(x + P.liquidarSaldoPlan(q, dia(b)).total, todo, 'abono ' + x + ' y pagar todo el ' + dia(b));
          casos++;
        }
      }
    }
    assert.ok(casos > 100, 'el barrido se quedó corto: ' + casos);
  });

  test('el plan del §8 no se salda por aquí: su regla de pago anticipado no está decidida', () => {
    const p = creditoDeJoan();
    p.planPagos.origen = undefined;
    assert.equal(P.liquidarSaldoPlan(p, '2026-10-30'), null);
  });
});

describe('cambiar la fecha o el % después del alta: solo lo que no ha vencido', () => {
  test('la cuota 2 al 17-nov y al 15%: el costo se rehace en el motor y el cambio queda anotado', () => {
    const p = creditoDeJoan();
    const r = P.reprogramarPlan(p, [{ n: 2, fecha: '2026-11-17', pct: 15 }], '2026-10-20');
    assert.ok(r.ok, r.detalle);
    assert.deepEqual(r.planPagos.cuotas.map(c => [c.fecha, c.pct, c.costo, c.total]),
                     [['2026-10-30', 20, 130000, 455000], ['2026-11-17', 15, 48750, 373750]]);
    assert.equal(r.planPagos.total_costo, 178750);
    assert.deepEqual(r.cambios, [{ n: 2, fecha: '2026-10-20', de: { fecha: '2026-11-15', pct: 20, costo: 65000 },
                                   a: { fecha: '2026-11-17', pct: 15, costo: 48750 } }]);
    assert.equal(r.cicloActual, '2026-10-30');
    assert.equal(p.planPagos.cuotas[1].fecha, '2026-11-15', 'no escribe nada: lo guarda la pantalla');
  });

  test('una cuota vencida no se mueve: le borraría la mora hacia atrás', () => {
    const p = creditoDeJoan();
    const r = P.reprogramarPlan(p, [{ n: 1, fecha: '2026-11-10' }], '2026-11-02');
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'vencida');
  });

  test('ni una pagada, ni una con abonos, ni a una fecha que ya pasó', () => {
    const p = creditoDeJoan();
    assert.equal(P.reprogramarPlan(p, [{ n: 1, fecha: '2026-10-18' }], '2026-10-20').motivo, 'al_pasado');
    abonar(p, '2026-10-25', 50000);
    assert.equal(P.reprogramarPlan(p, [{ n: 1, pct: 10 }], '2026-10-26').motivo, 'con_abonos');
    const q = creditoDeJoan();
    cobrarCuota(q, '2026-10-30');
    assert.equal(P.reprogramarPlan(q, [{ n: 1, pct: 10 }], '2026-10-31').motivo, 'pagada');
  });

  test('si el calendario nuevo no cuadra, lo dice el motor y no se guarda nada', () => {
    const r = P.reprogramarPlan(creditoDeJoan(), [{ n: 2, fecha: '2026-10-25' }], '2026-10-20');
    assert.equal(r.ok, false);
    assert.match(r.detalle, /no es después de la cuota anterior/);
  });
});

describe('lo que viaja al cliente: el calendario en pesos, sin un solo %', () => {
  const db = () => ({ socios: [{ id: 'C1', numero: 1, nombre: 'CLIENTE DE PRUEBA', telefono: '3001112233' }],
                      prestamos: [creditoDeJoan()], config: {} });

  test('las dos cuotas, lo que falta y lo que costaría pagar todo hoy', () => {
    const d = db();
    const c = P.migrarSocio(d, d.socios[0], DESEMBOLSO).creditos[0];
    assert.equal(c.plan_origen, 'alta');
    assert.deepEqual(c.plan.map(x => [x.n, x.fecha, x.total, x.pagado]),
                     [[1, '2026-10-30', 455000, false], [2, '2026-11-15', 390000, false]]);
    assert.equal(c.saldo_plan, 845000);
    assert.equal(c.saldar_hoy, 780000);
    assert.equal(c.total_hoy, 455000);
  });

  test('ninguna llave del calendario lleva el %', () => {
    const d = db();
    const c = P.migrarSocio(d, d.socios[0], DESEMBOLSO).creditos[0];
    c.plan.forEach(x => Object.keys(x).forEach(k =>
      assert.doesNotMatch(k, /pct|tasa/, 'la cuota viaja con ' + k + ': el cliente no ve porcentajes')));
  });

  test('hasta cuándo vale «pagar todo», y la cuota en su fecha cuando todavía no empieza', () => {
    const d = db();
    const p = d.prestamos[0];
    assert.equal(P.migrarSocio(d, d.socios[0], DESEMBOLSO).creditos[0].saldar_hasta, '2026-10-30');
    cobrarCuota(p, '2026-10-30');
    const c = P.migrarSocio(d, d.socios[0], '2026-10-30').creditos[0];
    assert.equal(c.saldar_hoy, 325000);
    assert.equal(c.saldar_hasta, '2026-10-30', 'el 31-oct ya corre la quincena de la cuota 2');
    assert.equal(c.cuota_en_su_fecha, 390000);
    assert.equal(c.total_hoy, 325000);
  });

  test('lo que debe hoy y lo que vale la cuota en su fecha: una sola cuenta', () => {
    const p = creditoDeJoan();
    assert.equal(P.aPagarHoy(p, '2026-11-20'), 929500, 'las dos vencidas');
    assert.equal(P.aPagarHoy(p, '2026-10-20'), 455000);
    cobrarCuota(p, '2026-10-30');
    assert.equal(P.aPagarHoy(p, '2026-10-30'), 325000, 'cerrarla hoy');
    assert.equal(P.aPagarEnSuFecha(p, '2026-10-30'), 390000, 'lo que se le anuncia para el 15-nov');
  });

  test('el paquete dice desde cuándo corre la quincena de la cuota en curso', () => {
    const d = db();
    cobrarCuota(d.prestamos[0], '2026-10-20');
    const c = P.migrarSocio(d, d.socios[0], '2026-10-25').creditos[0];
    assert.equal(c.cuota_empieza, '2026-10-31');
    assert.equal(c.cuota_es_la_ultima, true);
  });

  test('con dos cuotas vencidas, cada fila trae su mora', () => {
    const d = db();
    const c = P.migrarSocio(d, d.socios[0], '2026-11-20').creditos[0];
    assert.deepEqual(c.plan.map(x => x.mora), [68250, 16250]);
    assert.equal(P.vencidoDelPlan(d.prestamos[0], '2026-11-20'), 523250 + 406250);
  });

  test('el plan del §8 viaja como rescate y sin «pagar todo hoy»', () => {
    const d = db();
    d.prestamos[0].planPagos.origen = undefined;
    const c = P.migrarSocio(d, d.socios[0], DESEMBOLSO).creditos[0];
    assert.equal(c.plan_origen, 'rescate');
    assert.equal(c.saldar_hoy, null);
  });
});

describe('el tablero de quincenas ve las cuotas', () => {
  test('cada cuota en la quincena que contiene su fecha, con su mora', () => {
    /* La del 30-oct es de la quincena del 31-oct; la del 15-nov (domingo, con
       el 16 festivo) de la del 17-nov. El computador y el celular preguntan
       esto mismo: en la primera versión cada uno agrupaba distinto. */
    assert.equal(P.quincenaDe('2026-10-30'), '2026-10-31');
    assert.equal(P.quincenaDe('2026-11-15'), '2026-11-17');
    assert.equal(P.quincenaDe('2026-10-31'), '2026-10-31');
    const p = creditoDeJoan();
    cobrarCuota(p, '2026-11-02');
    cobrarCuota(p, '2026-11-15');
    assert.equal(P.cobradoDelPlanEnQuincena(p, '2026-10-31'), 130000 + 9750);
    assert.equal(P.cobradoDelPlanEnQuincena(p, '2026-11-17'), 65000);
    assert.equal(P.cobradoDelPlanEnQuincena(p, '2026-10-30'), 0, 'el 30-oct no es una quincena');
  });
});

describe('la nube: una cuota se cierra una sola vez, y cerrada no recibe abonos', () => {
  test('la misma cuota cobrada en los dos aparatos es un choque, no dos cierres', () => {
    const A = creditoDeJoan(), B = creditoDeJoan();
    cobrarCuota(A, '2026-10-30');
    cobrarCuota(B, '2026-10-31');
    const r = N.fusionarFila(A, B);
    assert.ok(r.pisables.some(x => x.campo === 'abonosCapital' && /Cuota 1/.test(x.suyo)));
    assert.equal(r.fila.abonosCapital.filter(x => x.cuotaPlan === 1).length, 1, 'lo mío encima lleva solo mi cierre');
  });

  test('un abono anotado sobre una copia vieja, después del cierre del otro, es un choque', () => {
    const A = creditoDeJoan(), B = creditoDeJoan();
    cobrarCuota(A, '2026-10-30');
    abonar(B, '2026-11-02', 100000);
    const r = N.fusionarFila(A, B);
    assert.ok(r.pisables.some(x => x.campo === 'abonosCapital'));
    assert.equal(r.fila.abonosCapital.length, 1);
  });

  test('los abonos de las cuotas viajan con el plan de su lado: elegir uno nunca mezcla los dos', () => {
    /* A tiene el abono; B lo trajo y después cerró la cuota. Los planes
       difieren, así que cada lado manda lo suyo entero y la diferencia sale en
       pesos para que Joan elija. */
    const A = creditoDeJoan();
    abonar(A, '2026-10-25', 50000);
    const B = JSON.parse(JSON.stringify(A));
    cobrarCuota(B, '2026-10-30');
    const desdeA = N.fusionarFila(A, B), desdeB = N.fusionarFila(B, A);
    assert.equal(desdeA.fila.abonosCapital.length, 1, 'lo de A: su abono y su plan');
    assert.equal(desdeB.fila.abonosCapital.length, 2, 'lo de B: el abono y el cierre que lo conocía');
    assert.ok(desdeA.pisables.some(x => x.campo === 'abonosCapital' && /cierre 2026-10-30 \$405000/.test(x.suyo)),
      'el cierre se muestra por lo que entró ese día (405.000), no por su capital');
  });

  test('un cierre que no conocía el abono del otro aparato no devuelve capital dos veces', () => {
    /* El computador anota 200.000 el 25-oct; el celular, sin señal, cobra la
       cuota entera el 30-oct. Sumadas, la cuota devolvía 395.000 de capital
       sobre 325.000 y nada lo avisaba. */
    const PC = creditoDeJoan(), CEL = creditoDeJoan();
    abonar(PC, '2026-10-25', 200000);
    cobrarCuota(CEL, '2026-10-30');
    for (const [mio, suyo] of [[CEL, PC], [PC, CEL]]) {
      const r = N.fusionarFila(mio, suyo);
      const q = Object.assign(JSON.parse(JSON.stringify(mio)), { abonosCapital: r.fila.abonosCapital });
      assert.ok(r.pisables.some(x => x.campo === 'abonosCapital'), 'sin choque en pesos');
      assert.equal(P.capitalActual(q), P.capitalActual(mio), 'la fila no cuadra con su propio plan');
    }
  });

  test('un «Pagó todo» del otro lado no le deja a la cuota 2 un cierre que mi plan no tiene', () => {
    const CEL = creditoDeJoan(), PC = creditoDeJoan();
    cobrarCuota(CEL, '2026-10-30');
    saldar(PC, '2026-10-30');
    const r = N.fusionarFila(CEL, PC);
    const q = Object.assign(JSON.parse(JSON.stringify(CEL)), { abonosCapital: r.fila.abonosCapital });
    assert.equal(P.capitalActual(q), 325000);
    assert.equal(P.cierreDeCuota(q, '2026-11-15').total, 390000, 'la cuota 2 conserva su costo');
  });

  test('con el MISMO plan, un abono que solo anotó un aparato entra como siempre', () => {
    const A = creditoDeJoan();
    const B = JSON.parse(JSON.stringify(A));
    abonar(B, '2026-11-06', 50000);
    const r = N.fusionarFila(A, B);
    assert.equal(r.fila.abonosCapital.length, 1);
    assert.equal(r.pisables.filter(x => x.campo === 'abonosCapital').length, 0);
  });

  test('pero dos abonos a la MISMA cuota, anotados cada uno sin conocer el otro, son un choque', () => {
    /* Tercera revisión: el del 6-nov se repartió contando otra vez los 19.500
       de mora que el del 5-nov ya había pagado, y sumados el cliente pagaba de
       más al cerrar. */
    const A = creditoDeJoan(), B = creditoDeJoan();
    abonar(A, '2026-11-05', 100000);
    abonar(B, '2026-11-06', 50000);
    const r = N.fusionarFila(A, B);
    assert.ok(r.pisables.some(x => x.campo === 'abonosCapital'));
    assert.equal(r.fila.abonosCapital.length, 1, 'lo mío encima lleva solo mi reparto');
  });

  test('la misma cuota cerrada el mismo día con cifras distintas no se funde en una', () => {
    const A = creditoDeJoan(), B = creditoDeJoan();
    abonar(A, '2026-10-25', 100000);
    const B2 = JSON.parse(JSON.stringify(A));
    cobrarCuota(A, '2026-10-30');
    cobrarCuota(B, '2026-10-30');
    const r = N.fusionarFila(A, B);
    const ab = r.pisables.find(x => x.campo === 'abonosCapital');
    assert.ok(ab, 'sin choque');
    assert.match(ab.mio, /\$355000/);
    assert.match(ab.suyo, /\$455000/);
    void B2;
  });

  test('un crédito que en el otro aparato pasó al plan del §8 trae su plan Y sus abonos', () => {
    /* La copia vieja no tiene la llave planPagos: el plan del otro entra solo,
       y su cierre tiene que entrar con él. Antes del arreglo la cuota quedaba
       pagada con su capital debiéndose. */
    const PC = creditoDeJoan();
    PC.planPagos.origen = undefined;
    PC.planPagos.entrada = { fecha: DESEMBOLSO, ciclo: '2026-10-15', monto: 1, mora: 0, aTiempo: true };
    cobrarCuota(PC, '2026-10-30');
    const CEL = JSON.parse(JSON.stringify(PC));
    delete CEL.planPagos;
    CEL.abonosCapital = [{ fecha: '2026-10-28', monto: 50000 }];
    for (const [mio, suyo] of [[CEL, PC], [PC, CEL]]) {
      const r = N.fusionarFila(mio, suyo);
      const fila = Object.assign({}, r.fila, { planPagos: r.fila.planPagos || PC.planPagos });
      assert.equal(P.cuotasPlan(fila)[0].pagado, true);
      assert.ok(fila.abonosCapital.some(a => a.cuotaPlan === 1), 'el cierre de la cuota 1 se cayó');
    }
  });

  test('la tarjeta dice solo lo que difiere: lo que está en los dos lados se queda', () => {
    const A = creditoDeJoan();
    cobrarCuota(A, '2026-10-30');
    const B = JSON.parse(JSON.stringify(A));
    abonar(A, '2026-11-05', 100000);
    B.planPagos.cambios.push({ n: 2, fecha: '2026-11-01', de: {}, a: {} });
    const ab = N.fusionarFila(B, A).pisables.find(x => x.campo === 'abonosCapital');
    assert.ok(ab);
    assert.equal(ab.mio, 'nada');
    assert.doesNotMatch(ab.suyo, /Cuota 1/, 'el cierre de la cuota 1 está en los dos lados');
  });

  test('salvo que juntos pasen lo que la cuota tiene: eso es un choque', () => {
    const A = creditoDeJoan(), B = creditoDeJoan();
    abonar(A, '2026-11-05', 400000);
    abonar(B, '2026-11-05', 300000);
    const r = N.fusionarFila(A, B);
    assert.ok(r.pisables.some(x => x.campo === 'abonosCapital'));
    assert.equal(r.fila.abonosCapital.length, 1);
  });
});

describe('la ganancia que falta', () => {
  test('después de un abono, el costo que falta no cuenta otra vez lo que entró', () => {
    const p = creditoDeJoan();
    assert.equal(P.costoPendienteDelPlan(p), 195000);
    abonar(p, '2026-11-05', 100000);
    assert.equal(P.costoPendienteDelPlan(p), 49500 + 65000);
  });
});

describe('la nube ya no ve choques donde no los hay', () => {
  test('un planPagos con las llaves en el orden de jsonb es el mismo planPagos', () => {
    const p = creditoDeJoan();
    const deLaNube = JSON.parse(JSON.stringify(p));
    deLaNube.planPagos = JSON.parse(N.jsonCanonico ? N.jsonCanonico(p.planPagos) : JSON.stringify(p.planPagos));
    // Las llaves de la cuota, a propósito al revés.
    deLaNube.planPagos.cuotas = deLaNube.planPagos.cuotas.map(c =>
      Object.fromEntries(Object.entries(c).reverse()));
    assert.equal(N.fusionarFila(p, deLaNube).hayChoque, false);
  });
});
