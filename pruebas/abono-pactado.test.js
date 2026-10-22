'use strict';
/* ============================================================================
 * EL PRÓXIMO PAGO LO DECIDE JOAN — 22 de octubre de 2026
 *
 *   node --test pruebas/abono-pactado.test.js
 *
 * El pedido de Joan, con sus palabras: «un cliente debe 750.000 y abona
 * únicamente 500.000 y el resto lo deja para la siguiente quincena, ese
 * restante es de 250.000 más el adicional que se pague; el CRM puede tener un
 * cálculo propio pero la decisión final sea mía, quiero poder decidir cuánto
 * cobro si más o menos, y que el CRM únicamente me muestre cuánto gané y qué
 * porcentaje de ganancias da ese crédito, y que muestre los números en rojo
 * cuando las ganancias sean negativas… incluso los días yo los pueda
 * seleccionar».
 *
 * El caso, con números: 625.000 al 20% (debe 750.000), vencía el sábado
 * 31-oct y ese día abona 500.000. La prórroga cuesta 125.000 y van 375.000 a
 * capital: quedan 250.000. El CRM propone 300.000 el 17-nov (el 15 es domingo
 * y el 16 festivo). Joan pone 280.000 el viernes 20-nov: el crédito le deja
 * 155.000 = 24,8% (125.000 + 30.000). Con 240.000 le perdona 10.000 de
 * capital (en rojo, con motivo) y le deja 115.000.
 *
 * Lo que vigila, ejecutando de verdad el puente, el CRM (banco-panel), la app
 * del cliente (banco-socio), el celular de Joan (banco-espejo) y la nube:
 *   A. la regla (puente.pactarProximoPago, abonoConProrroga con `pacto`, y
 *      gananciaDelCredito / gananciaDelCliente): el tope del 50%, el perdón de
 *      capital con motivo, la fecha que no se corre y el pago vencido que no
 *      se mueve; la mora solo desde el día siguiente a la fecha de Joan;
 *   B. el CRM: las dos casillas debajo de la cuenta, ya llenas; lo que te deja
 *      el crédito y el cliente, en rojo si es negativo; «✏️ Ajustar el próximo
 *      pago»; la lista y la ficha;
 *   C. la app del cliente y el recibo dicen la fecha y el monto de Joan;
 *   D. el celular cobra igual y no lo llama «crédito a cuotas»;
 *   E. la nube no pierde el pacto ni cuenta dos veces la plata.
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/motor.js');
const P = require('../app/puente.js');
const NUBE = require('../panel/nube.js');
const { abrirPanel } = require('./banco-panel.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const DIA = '2026-10-31';        // sábado: vencía, y ese día abona (dentro del horario legal)
const CRM_FECHA = '2026-11-17';  // la quincena siguiente del motor (15 domingo, 16 festivo)
const SUYA = '2026-11-20';       // la fecha que pone Joan (viernes)

const copia = o => JSON.parse(JSON.stringify(o));
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

function credito(extra) {
  return Object.assign({
    id: 'c1', numero: 7, socioId: 's1', socioNombre: 'Cliente de prueba', telefono: '3001112233',
    capital: 625000, costoPct: 20, fechaDesembolso: '2026-10-16', cicloActual: DIA,
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
  }, extra || {});
}
function cartera(ps) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Cliente de prueba', telefono: '3001112233', whatsappIgual: true,
               cedula: '52111222', gestiones: [], ajusteGarantia: 0 }],
    prestamos: ps, config: { negocio: 'Tu Garantía' }
  };
}
/* Lo que el CRM guarda con los registros de abonoConProrroga (registrarAbonoProrroga). */
function aplicar(p, r) {
  const g = r.registros;
  assert.ok(g, r.detalle);
  if (g.abono) p.abonosCapital.push(g.abono);
  p.prorrogas.push(g.prorroga);
  if (g.condonacion) (p.condonaciones = p.condonaciones || []).push(g.condonacion);
  if (g.planPagos) p.planPagos = g.planPagos;
  if (g.condonacionPacto) (p.condonaciones = p.condonaciones || []).push(g.condonacionPacto);
  p.cicloActual = g.cicloActual;
  return p;
}
/* Lo que guarda «✏️ Ajustar el próximo pago» (guardarAjuste). */
function aplicarPacto(p, r) {
  assert.equal(r.ok, true, r.detalle);
  p.planPagos = r.registros.planPagos;
  if (r.registros.condonacion) (p.condonaciones = p.condonaciones || []).push(r.registros.condonacion);
  p.cicloActual = r.registros.cicloActual;
  return p;
}
function abonoPactado(monto, motivo, fecha) {
  const p = credito();
  const r = P.abonoConProrroga(cartera([p]), p, DIA, 500000,
    { pacto: { fecha: fecha || SUYA, monto, motivo }, quien: 'computador' });
  return { p, r };
}
/* 22-oct-2026 (revisión) — cada pacto lleva su `id` (reloj + azar), en su
   cambio del plan y en su condonación: se mira que esté, y se compara el resto. */
const ID_PACTO = /^pacto-\d{4}-\d{2}-\d{2}-[0-9a-z]+$/;
function sinId(o) {
  if (Array.isArray(o)) return o.map(sinId);
  assert.match(String(o && o.id), ID_PACTO, 'cada pacto lleva su id');
  const c = Object.assign({}, o);
  delete c.id;
  return c;
}
function planSinIds(pp) {
  const c = copia(pp);
  c.cambios = sinId(c.cambios || []);
  return c;
}
/* El crédito del caso, ya registrado con el pago de Joan. */
function pactado(monto, motivo) {
  const { p, r } = abonoPactado(monto == null ? 280000 : monto, motivo);
  assert.equal(r.ok, true, r.detalle);
  return aplicar(p, r);
}

/* ==========================================================================
 * A. LA REGLA, EN EL PUENTE
 * ======================================================================== */
describe('A. la regla: el próximo pago lo decide Joan, con el tope y sin piso', () => {

  test('sin tocar nada, la cuenta del CRM queda como propuesta: 300.000 el 17-nov (te deja 175.000, 28%)', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera([p]), p, DIA, 500000);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.precio_prorroga, 125000);
    assert.equal(r.a_capital, 375000);
    assert.equal(r.capital_despues, 250000);
    assert.deepEqual(r.sugerido, { fecha: CRM_FECHA, monto: 300000 });
    assert.equal(r.proximo, null, 'sin cambio de Joan no hay pacto: el crédito sigue quincenal');
    assert.equal(r.registros.planPagos, undefined);
    assert.equal(r.ganancia.ganancia, 175000);
    assert.equal(r.ganancia.pct, 28);
    // Escribir en las casillas exactamente la cuenta del CRM tampoco pacta nada.
    const igual = P.abonoConProrroga(cartera([p]), p, DIA, 500000, { pacto: { fecha: CRM_FECHA, monto: 300000 } });
    assert.equal(igual.ok, true);
    assert.equal(igual.proximo, null);
  });

  test('Joan pone 280.000 el 20-nov: el crédito le deja 155.000 = 24,8% (125.000 + 30.000)', () => {
    const { p, r } = abonoPactado(280000);
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual(r.proximo, { fecha: SUYA, monto: 280000, capital: 250000, costo: 30000, perdona: 0, pct: 12,
                                  inhabiles: [] });
    assert.equal(r.ganancia.ganancia, 155000);
    assert.equal(r.ganancia.pct, 24.8);
    assert.equal(r.ganancia.cobrado, 125000, 'lo cobrado: la prórroga');
    assert.equal(r.ganancia.pendiente, 30000, 'lo pactado que falta');
    assert.equal(r.ganancia_cliente.ganancia, 155000);
    assert.equal(r.ganancia_cliente.creditos, 1);
    // Los registros: la prórroga de siempre, y el pacto como un plan de UNA cuota.
    const g = r.registros;
    assert.equal(g.prorroga.monto, 125000);
    assert.equal(g.abono.monto, 375000);
    assert.equal(g.cicloActual, SUYA);
    assert.equal(g.planPagos.origen, 'alta');
    assert.deepEqual(g.planPagos.pacto, { creado: DIA, de: CRM_FECHA, quien: 'computador' });
    assert.equal(g.planPagos.cuotas.length, 1);
    const c = g.planPagos.cuotas[0];
    assert.deepEqual([c.fecha, c.capital, c.costo, c.total, c.pagado], [SUYA, 250000, 30000, 280000, false]);
    // Queda anotado quién, cuándo, cuánto y lo que decía el CRM.
    assert.deepEqual(sinId(g.planPagos.cambios), [{ n: 1, fecha: DIA, pacto: true, quien: 'computador',
      de: { fecha: CRM_FECHA, total: 300000, capital: 250000, costo: 50000 },
      a: { fecha: SUYA, total: 280000, capital: 250000, costo: 30000 }, perdona: 0 }]);
    assert.equal(g.condonacionPacto, null);
    // Guardado, el crédito cobra eso y dice lo mismo.
    aplicar(p, r);
    assert.equal(P.corteDelCredito(p), SUYA);
    assert.equal(P.capitalActual(p), 250000);
    assert.equal(P.liquidarCiclo(p, SUYA).total_a_pagar, 280000);
    assert.deepEqual(P.gananciaDelCredito(p), { capital: 625000, cobrado: 125000, pendiente: 30000, perdonado: 0,
                                               ganancia: 155000, pct: 24.8, pagado: false });
    assert.match(r.detalle, /el próximo pago lo decidiste tú: \$280\.000 el 20 de noviembre de 2026/);
  });

  test('240.000: perdona 10.000 de capital — sin motivo no registra; con motivo, queda en condonaciones', () => {
    const sin = abonoPactado(240000).r;
    assert.equal(sin.ok, false);
    assert.equal(sin.motivo, 'pacto_falta_motivo');
    assert.equal(sin.registros, null, 'ni el abono ni la prórroga: Joan los confirmó junto con esa fecha');
    assert.match(sin.detalle, /le perdonas \$10\.000 de capital/);
    assert.equal(sin.pacto.ganancia.ganancia, 115000, 'la cuenta se le muestra mientras escribe el motivo');

    const { p, r } = abonoPactado(240000, 'cliente de años');
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.proximo.perdona, 10000);
    assert.equal(r.proximo.capital, 240000);
    assert.equal(r.proximo.costo, 0);
    assert.equal(r.registros.condonacionPacto.id, r.registros.planPagos.cambios[0].id, 'el perdón va atado a su pacto');
    assert.deepEqual(sinId(r.registros.condonacionPacto), { fecha: DIA, costo: 0, mora: 0, capital: 10000,
      motivo: 'cliente de años', quien: 'computador', sobre: 'pacto', para: SUYA });
    assert.equal(r.ganancia.ganancia, 115000);
    assert.equal(r.ganancia.perdonado, 10000);
    assert.equal(r.ganancia.pct, 18.4);
    aplicar(p, r);
    assert.equal(P.capitalActual(p), 240000, 'perdonado, ya no se debe');
    assert.equal(P.capitalPerdonadoDe(p), 10000);
    assert.equal(P.liquidarCiclo(p, SUYA).total_a_pagar, 240000);
    assert.equal(P.capitalRecuperadoDe(p), 375000, 'lo perdonado no es capital que volvió');
    assert.equal(P.gananciaDelCredito(p).ganancia, 115000);
  });

  test('una decisión que deja el crédito en pérdida: ganancia NEGATIVA, dicha con su signo', () => {
    const { r } = abonoPactado(100000, 'se quedó sin trabajo');
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.proximo.perdona, 150000);
    assert.equal(r.ganancia.ganancia, -25000, '500.000 + 100.000 que entran contra 625.000 prestados');
    assert.equal(r.ganancia.pct, -4);
  });

  test('el tope: lo cobrado sobre el capital que queda no pasa del 50% (la reja vive en el puente)', () => {
    assert.equal(M.TASA_CREDITO_MAXIMA, 0.5);
    const pasa = abonoPactado(375001).r;
    assert.equal(pasa.ok, false);
    assert.equal(pasa.motivo, 'pacto_sobre_tope');
    assert.equal(pasa.registros, null);
    assert.match(pasa.detalle, /el techo es el 50% de ese capital: \$125\.000\. Ese día le puedes cobrar hasta \$375\.000/);
    const justo = abonoPactado(375000).r;
    assert.equal(justo.ok, true, justo.detalle);
    assert.equal(justo.proximo.costo, 125000);
    assert.equal(justo.ganancia.ganancia, 250000);
    assert.equal(justo.ganancia.pct, 40);
    // Y en «Ajustar» también: es la misma función.
    const p = pactado();
    const aj = P.pactarProximoPago(cartera([p]), p, { fecha: '2026-11-27', monto: 375001 }, '2026-11-01');
    assert.equal(aj.motivo, 'sobre_tope');
  });

  test('pagar en la fecha de Joan no corre mora; un día después sí (y nunca desde el 17-nov del CRM)', () => {
    const p = pactado();
    const en = P.liquidarCiclo(p, SUYA);
    assert.equal(en.recargo_mora, 0);
    assert.equal(en.total_a_pagar, 280000);
    assert.equal(P.liquidarCiclo(p, '2026-11-18').recargo_mora, 0, 'el 18-nov ya pasó la fecha del CRM, no la de Joan');
    const tarde = P.liquidarCiclo(p, '2026-11-21');
    assert.equal(tarde.dias_mora, 1);
    assert.equal(tarde.recargo_mora, 2500, '1% de los 250.000 que faltan');
    assert.equal(tarde.total_a_pagar, 282500);
    // La cola, «vencido hoy» y el KPI de mora preguntan esto mismo.
    assert.equal(P.aPagarHoy(p, '2026-11-21'), 282500);
    assert.equal(P.aPagarHoy(p, SUYA), 280000);
    assert.deepEqual(P.cuotasVencidas(p, SUYA), []);
    assert.equal(P.cuotasVencidas(p, '2026-11-21')[0].mora, 2500);
    // La línea de tiempo: ningún día hasta el 20-nov estuvo vencido.
    ['2026-11-01', CRM_FECHA, '2026-11-18', SUYA].forEach(d => assert.equal(P.estabaVencido(p, d), false, d));
    assert.equal(P.estabaVencido(p, '2026-11-21'), true);
  });

  test('la garantía es la de lo que de verdad se cobra: el 80% de los 30.000 del pago pactado', () => {
    const p = pactado();
    const ci = P.cierreDeCuota(p, SUYA);
    assert.equal(ci.ok, true, ci.detalle);
    assert.equal(ci.total, 280000);
    assert.equal(ci.registros.cuota.garantiaGenerada, M.acumularGarantia(30000, true));
    assert.equal(ci.registros.cuota.garantiaGenerada, 24000);
    Object.assign(p.planPagos.cuotas[0], ci.registros.cuota);
    p.abonosCapital.push(ci.registros.abono);
    Object.assign(p, ci.registros.credito);
    assert.equal(p.pagado, true);
    const g = P.gananciaDelCredito(p);
    assert.deepEqual([g.cobrado, g.pendiente, g.ganancia, g.pct, g.pagado], [155000, 0, 155000, 24.8, true]);
    // La garantía del crédito entero: la de la prórroga más la del pago pactado.
    assert.equal(P.garantiaGanadaCredito(p), 100000 + 24000);
  });

  test('con pago acordado ya no se prorroga: se dice con sus cifras y se ofrece ajustarlo', () => {
    const p = pactado();
    const r = P.abonoConProrroga(cartera([p]), p, '2026-11-05', 100000);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'pacto');
    assert.match(r.detalle, /próximo pago acordado: \$280\.000 el 20 de noviembre de 2026/);
    assert.deepEqual(r.caminos, ['cuota_del_plan', 'ajustar']);
    const tarde = P.abonoConProrroga(cartera([p]), p, '2026-11-25', 100000);
    assert.deepEqual(tarde.caminos, ['cuota_del_plan'], 'vencido, ya no se ofrece moverlo');
    assert.equal(P.reprogramarPlan(p, [{ n: 1, fecha: '2026-11-27' }], '2026-11-01').motivo, 'es_pacto');
  });

  test('«✏️ Ajustar» en un crédito quincenal sin abono: 760.000 el 7-nov sobre 625.000', () => {
    const p = credito();
    const db = cartera([p]);
    const quieto = P.pactarProximoPago(db, p, {}, '2026-10-20');
    assert.equal(quieto.motivo, 'sin_cambios');
    assert.deepEqual(quieto.sugerido, { fecha: DIA, monto: 750000, capital: 625000, costo: 125000 });
    const r = P.pactarProximoPago(db, p, { fecha: '2026-11-07', monto: 760000 }, '2026-10-20');
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.costo, 135000);
    assert.equal(r.ganancia.ganancia, 135000);
    assert.equal(r.ganancia.pct, 21.6);
    aplicarPacto(p, r);
    assert.equal(P.corteDelCredito(p), '2026-11-07');
    assert.equal(P.corteOriginal(p), DIA, 'la línea de tiempo sabe de qué fecha salió el pacto');
    assert.equal(P.corteVigenteEn(p, '2026-10-19'), DIA);
    assert.equal(P.corteVigenteEn(p, '2026-10-20'), '2026-11-07');
  });

  test('un pago VENCIDO no se mueve por acá: se dice por qué y los caminos que existen', () => {
    const q = credito();
    const r = P.pactarProximoPago(cartera([q]), q, { fecha: '2026-11-07', monto: 760000 }, '2026-11-02');
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'vencido');
    assert.equal(r.registros, null);
    assert.match(r.detalle, /ya venció \(2 días de atraso\): moverlo le borraría la mora hacia atrás/);
    assert.deepEqual(r.caminos, ['cobro', 'prorroga', 'acuerdo']);
    const p = pactado();
    const r2 = P.pactarProximoPago(cartera([p]), p, { fecha: '2026-11-27', monto: 290000 }, '2026-11-21');
    assert.equal(r2.motivo, 'vencido');
    assert.deepEqual(r2.caminos, ['cobro']);
    // El día de la fecha todavía no está vencido: se puede volver a acordar.
    assert.equal(P.pactarProximoPago(cartera([p]), p, { fecha: '2026-11-27', monto: 290000 }, SUYA).ok, true);
  });

  test('domingo o festivo: la fecha se queda como la puso Joan y se avisa con la mora que le correría', () => {
    const r = abonoPactado(280000, null, '2026-11-22').r;   // domingo
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.proximo.fecha, '2026-11-22', 'no se corre');
    assert.deepEqual(r.proximo.inhabiles, [{ numero: 1, fecha: '2026-11-22', motivo: 'domingo',
      siguiente_habil: '2026-11-23', dias: 1, mora: 2500 }]);
  });

  test('fechas: después de hoy, a no más de 186 días; y una fecha que no existe no pasa', () => {
    const p = pactado();
    const db = cartera([p]);
    assert.equal(P.pactarProximoPago(db, p, { fecha: '2026-11-01', monto: 290000 }, '2026-11-01').motivo, 'al_pasado');
    assert.equal(P.pactarProximoPago(db, p, { fecha: '2027-11-01', monto: 290000 }, '2026-11-01').motivo, 'muy_lejos');
    assert.equal(P.pactarProximoPago(db, p, { fecha: '2026-11-31', monto: 290000 }, '2026-11-01').motivo, 'fecha_invalida');
    assert.equal(P.pactarProximoPago(db, p, { fecha: '2026-11-27', monto: 0 }, '2026-11-01').motivo, 'monto_invalido');
  });

  test('el crédito a cuotas y el plan del §8 no se ajustan por acá', () => {
    const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
      { fechaDesembolso: '2026-10-16' });
    const alta = credito({ capital: 650000, cicloActual: '2026-10-30', planPagos: P.planPagosDeAlta(plan) });
    assert.equal(P.pactarProximoPago(cartera([alta]), alta, { monto: 1 }, '2026-10-20').motivo, 'a_cuotas');
    const rescate = credito({ planPagos: { creado: '2026-10-15', tasa_por_corte: 0.05,
      entrada: { fecha: '2026-10-15', ciclo: '2026-10-15', monto: 80000, mora: 0 },
      cuotas: [{ n: 1, fecha: '2026-10-31', capital: 625000, costo: 31250, total: 656250, pagado: false }] } });
    assert.equal(P.pactarProximoPago(cartera([rescate]), rescate, { monto: 1 }, '2026-10-20').motivo, 'plan_de_pagos');
    assert.equal(P.pactarProximoPago(cartera([credito({ pagado: true })]), credito({ pagado: true }), {}, DIA).motivo, 'pagado');
  });

  test('volver a acordar después de un abono a la cuota: el costo que ya entró se queda', () => {
    const p = pactado();
    const ab = P.abonoACuota(p, SUYA, 100000);
    assert.equal(ab.ok, true, ab.detalle);
    assert.deepEqual(ab.aplica, { mora: 0, costo: 30000, capital: 70000 });
    p.abonosCapital.push(ab.registros.abono);
    const db = cartera([p]);
    const r = P.pactarProximoPago(db, p, { fecha: '2026-12-04', monto: 220000 }, SUYA);
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual(r.sugerido, { fecha: SUYA, monto: 180000, capital: 180000, costo: 0 });
    assert.equal(r.costo, 40000);
    assert.equal(r.ganancia.ganancia, 195000, '125.000 + 30.000 ya abonados + 40.000');
    assert.match(r.detalle, /Antes era \$180\.000 el 20 de noviembre de 2026/, 'lo de antes era el pacto, no la cuenta del CRM');
    aplicarPacto(p, r);
    assert.equal(p.planPagos.cambios.length, 2);
    assert.equal(P.liquidarCiclo(p, '2026-12-04').total_a_pagar, 220000);
    const ci = P.cierreDeCuota(p, '2026-12-04');
    assert.equal(ci.total, 220000);
    assert.equal(ci.registros.cuota.garantiaGenerada, M.acumularGarantia(70000, true), 'la de los 70.000 de costo, contando el abono');
  });

  test('lo que te deja el CLIENTE: todos sus créditos, y con la decisión que está en pantalla', () => {
    const viejo = { id: 'c0', numero: 3, socioId: 's1', capital: 200000, costoPct: 20, fechaDesembolso: '2026-09-01',
      cicloActual: '2026-09-15', cicloPago: '2026-09-15', prorrogas: [], abonosCapital: [], comprobantes: [],
      pagado: true, fechaPagado: '2026-09-15', gananciaPago: 40000, recargoMora: 0 };
    const p = credito();
    const db = cartera([viejo, p]);
    const r = P.abonoConProrroga(db, p, DIA, 500000, { pacto: { fecha: SUYA, monto: 280000 } });
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual([r.ganancia_cliente.creditos, r.ganancia_cliente.capital, r.ganancia_cliente.ganancia,
                      r.ganancia_cliente.pct], [2, 825000, 195000, 23.6]);
    // Sin la decisión, lo de hoy: 40.000 del viejo + 125.000 del costo de este ciclo.
    const hoy = P.gananciaDelCliente(db, db.socios[0]);
    assert.equal(hoy.ganancia, 165000);
    // Uno que pierde baja el total, y el total se pinta con su signo.
    const pierde = P.abonoConProrroga(db, p, DIA, 500000, { pacto: { fecha: SUYA, monto: 30000, motivo: 'x' } });
    assert.equal(pierde.ganancia.ganancia, -95000);
    assert.equal(pierde.ganancia_cliente.ganancia, -55000);
  });

  test('los descuentos del cliente cuentan el capital perdonado; los de la quincena no lo meten en la ganancia', () => {
    const p = pactado(240000, 'cliente de años');
    const db = cartera([p]);
    assert.deepEqual(P.descuentosDelSocio(db, db.socios[0]), { veces: 1, monto: 10000, costo: 0, mora: 0 });
    assert.deepEqual(P.descuentosDeQuincena(db, P.quincenaDe(SUYA)), { mora: 0, costo: 0, total: 0, veces: 0, clientes: 0 });
    assert.equal(P.quincenaDeCondonacion(p, p.condonaciones[0]), P.quincenaDe(SUYA));
  });

  test('el paquete de la app dice la fecha y el monto de Joan, sin porcentajes', () => {
    const p = pactado();
    const db = cartera([p]);
    const c = P.migrarSocio(db, db.socios[0], '2026-11-01').creditos[0];
    assert.equal(c.corte, SUYA);
    assert.equal(c.total_hoy, 280000);
    assert.equal(c.capital, 250000);
    assert.equal(c.costo, 30000);
    // 23-oct-2026 — y lo que se acordó ese día (`monto_acordado`): con abonos después, `monto` es menor.
    assert.deepEqual(c.pacto, { fecha: SUYA, monto: 280000, acordado: DIA, monto_acordado: 280000 });
    assert.equal(c.pago_acordado, true);
    assert.equal(c.plan_origen, 'alta', 'una app vieja lo ve como cuota 1 de 1: con su fecha y su valor, que es verdad');
    assert.ok(!/"pct"/.test(JSON.stringify(c)), 'el % viajó al teléfono del cliente');
    // Con perdón, el capital que se le dice es el que debe, y lo que pagó no se infla.
    const q = pactado(240000, 'x');
    const d = P.migrarSocio(cartera([q]), cartera([]).socios[0], '2026-11-01').creditos[0];
    assert.equal(d.saldo_capital, 240000);
    assert.equal(d.total_hoy, 240000);
    assert.equal(d.abonado, 500000, 'entraron 500.000: los 10.000 perdonados no los pagó');
  });

  test('el recibo del abono (puente.reciboAbonoConProrroga) dice la fecha y el monto de Joan', () => {
    const rc = P.reciboAbonoConProrroga(pactado());
    assert.equal(rc.entrego, 500000);
    assert.equal(rc.corte, SUYA);
    assert.equal(rc.total_en_fecha, 280000);
    assert.equal(rc.capital, 250000);
  });
});

/* ==========================================================================
 * B. EL CRM, EJECUTANDO LA PÁGINA
 * ======================================================================== */
function crm(ps, ahora) {
  const B = abrirPanel({ ahora: (ahora || DIA) + 'T10:00:00' });
  B.cargarCartera(cartera(ps || [credito()]));
  B.ev('window._conf=[];window._guardados=0;window._siWhatsApp=false;' +
       "confirm=function(t){t=String(t);_conf.push(t);if(t.indexOf('WhatsApp')>=0)return _siWhatsApp;return true};" +
       '(function(){var g=guardar;guardar=function(){_guardados++;return g.apply(this,arguments)}})()');
  return B;
}
const html = (B, id) => String((B.elems[id] && B.elems[id].innerHTML) || '').replace(/\s+/g, ' ');
const leer = B => JSON.parse(B.ev('JSON.stringify(DB)'));
const confs = B => JSON.parse(B.ev('JSON.stringify(_conf)'));
function hojaDelAbono(B, monto) {
  B.ev("abrirPago('c1')");
  B.elems.pgFecha.value = DIA;
  B.ev("calcPago('c1')");
  B.ev("modoAbonoProrroga('c1')");
  B.elems.pgMonto.value = String(monto);
  B.ev("cambioMonto('c1')");
}
function casilla(B, cual, v) {
  const id = { fecha: 'pgPactoFecha', monto: 'pgPactoMonto', motivo: 'pgPactoMotivo' }[cual];
  B.elems[id].value = String(v);
  B.ev("cambioPacto('c1','" + cual + "')");
}

describe('B. el CRM: las dos casillas, lo que te deja y «✏️ Ajustar el próximo pago»', () => {

  test('debajo de la cuenta del CRM, las dos casillas YA LLENAS con ella, y la siguen mientras no las toques', () => {
    const B = crm();
    hojaDelAbono(B, 500000);
    assert.equal(B.elems.pgPactoBox.style.display, '');
    assert.equal(B.elems.pgPactoFecha.value, CRM_FECHA);
    assert.equal(B.elems.pgPactoMonto.value, '300000');
    const t = plano(html(B, 'pgPactoCalc'));
    assert.match(t, /Este crédito te deja .*\$175\.000 · 28%/);
    assert.match(t, /Con este cliente llevas .*\$175\.000 · 28%/);
    assert.match(t, /no se resta: es cupo/);
    // Otro abono, otra cuenta: las casillas sin tocar la siguen.
    B.elems.pgMonto.value = '400000'; B.ev("cambioMonto('c1')");
    assert.equal(B.elems.pgPactoMonto.value, '420000');
    // Tocada la del monto, manda lo de Joan aunque cambie el abono.
    casilla(B, 'monto', 280000);
    B.elems.pgMonto.value = '500000'; B.ev("cambioMonto('c1')");
    assert.equal(B.elems.pgPactoMonto.value, '280000');
    // Fuera de este modo, las casillas no se ven: «Pagó todo» no las usa.
    B.ev("volverAlCobro('c1')");
    assert.equal(B.elems.pgPactoBox.style.display, 'none');
  });

  test('el caso de Joan: 280.000 el 20-nov, el botón lo dice, UN guardar, y el recibo trae su fecha y su monto', () => {
    const B = crm();
    hojaDelAbono(B, 500000);
    casilla(B, 'monto', 280000);
    casilla(B, 'fecha', SUYA);
    const t = plano(html(B, 'pgPactoCalc'));
    assert.match(t, /Próximo pago que decidiste \(el CRM decía \$300\.000 el 17 de nov de 2026\) \$280\.000 el 20 de nov de 2026/);
    assert.match(t, /Y costo \(12% del capital que queda; el techo es el 50%\) \$30\.000/);
    assert.match(t, /Este crédito te deja .*\$155\.000 · 24,8%/);
    assert.match(html(B, 'pgPactoCalc'), /<b class="gano">\$155\.000 · 24,8%<\/b>/);
    assert.equal(B.elems.pgBtn.disabled, false);
    assert.equal(B.elems.pgBtn.textContent, '💵 Registrar $500.000: $375.000 a capital y paga $280.000 el 20 de nov de 2026');
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 1, 'abono, prórroga y pacto: los tres o ninguno');
    const c = confs(B);
    assert.match(c[0], /Próximo pago, como lo decidiste: \$280\.000 el 20 de nov de 2026 \(\$250\.000 de capital \+ \$30\.000 de costo\)\. El CRM decía \$300\.000 el 17 de nov de 2026/);
    assert.match(c[0], /Este crédito te deja \$155\.000 \(24,8% de lo prestado\); con este cliente llevas \$155\.000 en 1 crédito \(24,8%\)/);
    assert.ok(!/le quedaría/.test(c[0]), 'con pago acordado no se le ofrece otra prórroga');
    assert.match(c[1], /paga \$280\.000 el 20 de nov de 2026, como lo decidiste/);
    const p = leer(B).prestamos[0];
    assert.equal(p.cicloActual, SUYA);
    assert.equal(p.prorrogas.length, 1);
    assert.equal(p.abonosCapital[0].monto, 375000);
    assert.deepEqual(planSinIds(p.planPagos), planSinIds(abonoPactado(280000).r.registros.planPagos));
    // El recibo por WhatsApp lee lo GUARDADO.
    B.ev("gestionar('c1','abonoProrroga')");
    const wa = String(B.elems.gTexto.value || plano(html(B, 'mBody')));
    assert.match(wa, /recibimos tu abono de \$500\.000/);
    assert.match(wa, /quedas debiendo \$250\.000 y tu próximo pago es de \$280\.000 el 20 de nov de 2026/);
  });

  test('240.000: el perdón sale en rojo y pide motivo; con motivo se registra en condonaciones', () => {
    const B = crm();
    hojaDelAbono(B, 500000);
    casilla(B, 'fecha', SUYA);
    casilla(B, 'monto', 240000);
    assert.equal(B.elems.pgPactoMotivoBox.style.display, '');
    assert.match(html(B, 'pgPactoCalc'), /<span class="pierde">Le perdonas de capital<\/span><span class="v pierde">− \$10\.000/);
    assert.match(plano(html(B, 'pgPactoCalc')), /Este crédito te dejaría .*\$115\.000 · 18,4%/);
    assert.equal(B.elems.pgBtn.disabled, true);
    assert.equal(B.elems.pgBtn.textContent, 'Falta el motivo del capital que perdonas');
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 0, 'sin motivo no se escribe nada');
    casilla(B, 'motivo', 'cliente de años');
    assert.equal(B.elems.pgBtn.disabled, false);
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 1);
    assert.match(confs(B)[0], /le perdonas \$10\.000 \(cliente de años\): debe \$240\.000/);
    const p = leer(B).prestamos[0];
    assert.equal(p.condonaciones[0].id, p.planPagos.cambios[0].id, 'el perdón va atado a su pacto');
    assert.deepEqual(sinId(p.condonaciones), [{ fecha: DIA, costo: 0, mora: 0, capital: 10000, motivo: 'cliente de años',
                                          quien: 'computador', sobre: 'pacto', para: SUYA }]);
    assert.equal(P.capitalActual(p), 240000);
  });

  test('una decisión con ganancia NEGATIVA se pinta en el rojo de la casa', () => {
    const B = crm();
    hojaDelAbono(B, 500000);
    casilla(B, 'fecha', SUYA);
    casilla(B, 'monto', 100000);
    casilla(B, 'motivo', 'se quedó sin trabajo');
    assert.match(html(B, 'pgPactoCalc'), /<b class="pierde">-\$25\.000 · -4%<\/b>/);
    // Y la clase existe, en el rojo de la casa (la excepción de la ley de colores).
    assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'panel', 'crm.html'), 'utf8'),
      /\.pierde\{color:var\(--rojo\)/);
  });

  test('arriba del tope del 50% no deja registrar, y dice hasta cuánto', () => {
    const B = crm();
    hojaDelAbono(B, 500000);
    casilla(B, 'fecha', SUYA);
    casilla(B, 'monto', 375001);
    assert.equal(B.elems.pgBtn.disabled, true);
    assert.equal(B.elems.pgBtn.textContent, 'Ese próximo pago pasa el techo del 50%');
    assert.match(plano(html(B, 'pgPactoCalc')), /Ese día le puedes cobrar hasta \$375\.000/);
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 0);
    assert.equal(leer(B).prestamos[0].prorrogas.length, 0);
  });

  test('«✏️ Ajustar el próximo pago» está en el crédito y en la hoja de cobro (quincenal y pago acordado)', () => {
    const B = crm();
    B.ev("verCredito('c1')");
    assert.match(html(B, 'mBody'), /ajustarProximoPago\('c1'\)/);
    B.ev("abrirPago('c1')");
    assert.match(html(B, 'pgAccion'), /✏️ Ajustar el próximo pago/);
    const B2 = crm([pactado()], '2026-11-01');
    B2.ev("abrirPago('c1')");
    /* La fecha de la hoja se escribe como la escribe Joan: el banco no lee el
       value del HTML, y sin ella el puente liquidaría con su propio reloj. */
    B2.elems.pgFecha.value = '2026-11-01';
    B2.ev("calcPago('c1')");
    assert.match(html(B2, 'pgAccion'), /✏️ Ajustar el próximo pago/);
    const hc = plano(html(B2, 'pgCalc'));
    assert.match(hc, /tiene un próximo pago acordado\s*:\s*\$280\.000 el 20 de nov de 2026/);
    assert.match(hc, /Total del pago acordado \$280\.000/);
    assert.ok(!/cuota 1 de 1/.test(hc), 'el pago acordado no es «la cuota 1 de 1»');
    B2.ev("verCredito('c1')");
    const v = plano(html(B2, 'mBody'));
    assert.match(v, /Próximo pago acordado/);
    assert.match(v, /el CRM decía \$300\.000 el 17 de nov de 2026/);
    assert.match(v, /Este crédito te deja .*\$155\.000 · 24,8%/);
    assert.ok(!/Cambiar fechas o %/.test(v), 'el pago acordado no se rehace con %');
  });

  test('registrar HOY el abono como siempre y DESPUÉS ponerle fecha y monto da lo mismo que en un paso', () => {
    const B = crm();
    hojaDelAbono(B, 500000);
    B.ev("registrarCobro('c1')");
    assert.equal(leer(B).prestamos[0].cicloActual, CRM_FECHA);
    B.ev("ajustarProximoPago('c1')");
    assert.equal(B.elems.ajFecha.value, CRM_FECHA);
    assert.equal(B.elems.ajMonto.value, '300000');
    B.elems.ajFecha.value = SUYA; B.elems.ajMonto.value = '280000';
    B.ev("calcAjuste('c1')");
    assert.match(plano(html(B, 'ajCalc')), /Este crédito te deja .*\$155\.000 · 24,8%/);
    assert.equal(B.elems.ajBtn.disabled, false);
    B.ev("guardarAjuste('c1')");
    const p = leer(B).prestamos[0];
    assert.equal(p.cicloActual, SUYA);
    assert.deepEqual(planSinIds(p.planPagos), planSinIds(abonoPactado(280000).r.registros.planPagos));
  });

  test('ajustar un pago VENCIDO: dice por qué, ofrece los caminos y no guarda nada', () => {
    const B = crm([credito()], '2026-11-03');
    B.ev("ajustarProximoPago('c1')");
    const m = html(B, 'mBody');
    assert.match(plano(m), /ya venció \(3 días de atraso\): moverlo le borraría la mora hacia atrás/);
    assert.match(m, /pactarAcuerdo\('c1'\)/);
    assert.match(m, /abrirPago\('c1'\)/);
    assert.equal(B.ev('_guardados'), 0);
    assert.equal(leer(B).prestamos[0].planPagos, undefined);
  });

  test('la lista de créditos y la ficha del cliente dicen lo que te deja, en rojo si pierde', () => {
    const B = crm([pactado(100000, 'se quedó sin trabajo')], '2026-11-01');
    B.ev('renderCred()');
    const l = html(B, 'tblCred');
    assert.match(l, /te deja <b class="pierde">-\$25\.000 · -4%<\/b>/);
    assert.match(plano(l), /pago acordado/);
    B.ev("verCliente('s1')");
    const f = html(B, 'mBody');
    assert.match(plano(f), /Con este cliente llevas 1 crédito · \$625\.000 prestados · \$150\.000 de capital perdonado/);
    assert.match(f, /<b class="pierde">-\$25\.000 · -4%<\/b>/);
  });
});

/* ==========================================================================
 * C. LA APP DEL CLIENTE
 * ======================================================================== */
async function appDelCliente(prestamos, diaPaquete) {
  const db = cartera(prestamos);
  const paquete = P.migrarSocio(db, db.socios[0], diaPaquete);
  const ahora = new Date(diaPaquete + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000,
    celular: '3001112233', paquete: { nombre: 'Cliente de prueba', datos: paquete,
      actualizado_en: diaPaquete + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  return { A, inicio: () => plano(A.elem('cuerpo').innerHTML) };
}

describe('C. la app del cliente dice la fecha y el monto que puso Joan', () => {

  test('antes de la fecha: 280.000 el 20-nov, «acordado con nosotros», sin hablar de un crédito a cuotas', async () => {
    const { A, inicio } = await appDelCliente([pactado()], '2026-11-01');
    const t = inicio();
    assert.match(t, /Tu próximo pago, acordado con nosotros/);
    assert.match(t, /\$280\.000 Lo que acordamos que pagas/);
    assert.match(t, /Fecha de pago 20 nov 2026/);
    assert.match(t, /Lo acordamos el 31 oct 2026/);
    assert.match(t, /Pagas \$280\.000 el 20 nov 2026/);
    assert.match(t, /Este pago lo acordamos contigo, con su fecha y su valor: no se prorroga/);
    assert.ok(!/crédito a cuotas/i.test(t), 'no pidió un crédito a cuotas');
    assert.ok(!/cuota 1 de 1/i.test(t));
    A.ev('verReglas()');
    assert.ok(!/Crédito a cuotas/.test(plano(A.elem('cuerpo').innerHTML)), 'las reglas del crédito a cuotas no son las suyas');
  });

  test('un día después de la fecha, la app trae el recargo de ese día (282.500)', async () => {
    const t = (await appDelCliente([pactado()], '2026-11-21')).inicio();
    assert.match(t, /1 día de atraso/);
    assert.match(t, /Lo que pagas hoy, con el recargo \$282\.500/);
    assert.ok(!/Total de esta cuota/.test(t));
  });

  /* 23-oct-2026 — EL ACUERDO VIGENTE (revisión de plata). `pacto.creado` es el
     día del PRIMER acuerdo y volver a acordar no lo toca: la app decía «Lo
     acordamos el 31 oct» de un 300.000 el 4-dic que se acordó el 12-nov. Y con
     un abono después del acuerdo, «Pagas $180.000» debajo de «Lo acordamos el
     31 oct» afirmaba que ese día se acordó 180.000, y se acordó 280.000.
     Fallan contra 1c9bdcd. */
  test('volver a acordar: «Lo acordamos el» es el día del último acuerdo, con su monto y su fecha', async () => {
    const p = pactado();
    aplicarPacto(p, P.pactarProximoPago(cartera([p]), p, { fecha: '2026-12-04', monto: 300000 }, '2026-11-12'));
    const db = cartera([p]);
    assert.deepEqual(P.migrarSocio(db, db.socios[0], '2026-11-13').creditos[0].pacto,
      { fecha: '2026-12-04', monto: 300000, acordado: '2026-11-12', monto_acordado: 300000 });
    const t = (await appDelCliente([p], '2026-11-13')).inicio();
    assert.match(t, /Lo acordamos el 12 nov 2026 Pagas \$300\.000 el 4 dic 2026/);
    assert.ok(!/Lo acordamos el 31 oct/.test(t), 'dijo el día del primer acuerdo');
  });

  test('un abono después del acuerdo: dice lo que se acordó ese día y lo que paga con lo abonado', async () => {
    const p = pactado();
    const ab = P.abonoACuota(p, '2026-11-10', 100000);
    assert.equal(ab.ok, true, ab.detalle);
    p.abonosCapital.push(ab.registros.abono);
    const db = cartera([p]);
    assert.deepEqual(P.migrarSocio(db, db.socios[0], '2026-11-11').creditos[0].pacto,
      { fecha: SUYA, monto: 180000, acordado: DIA, monto_acordado: 280000 });
    const t = (await appDelCliente([p], '2026-11-11')).inicio();
    assert.match(t, /Lo acordamos el 31 oct 2026 Lo que acordamos \$280\.000 el 20 nov 2026 Con lo que abonaste, pagas \$180\.000 el 20 nov 2026/);
    assert.ok(!/Pagas \$180\.000/.test(t), 'dijo que ese día se acordó lo que falta');
  });

  test('abono y nuevo acuerdo: el día y el monto del nuevo, sin restarle el abono que ya conocía', async () => {
    const p = pactado();
    const ab = P.abonoACuota(p, '2026-11-10', 100000);
    assert.equal(ab.ok, true, ab.detalle);
    p.abonosCapital.push(ab.registros.abono);
    aplicarPacto(p, P.pactarProximoPago(cartera([p]), p, { fecha: '2026-11-26', monto: 200000 }, '2026-11-10'));
    const db = cartera([p]);
    assert.deepEqual(P.migrarSocio(db, db.socios[0], '2026-11-11').creditos[0].pacto,
      { fecha: '2026-11-26', monto: 200000, acordado: '2026-11-10', monto_acordado: 200000 });
    const t = (await appDelCliente([p], '2026-11-11')).inicio();
    assert.match(t, /Lo acordamos el 10 nov 2026 Pagas \$200\.000 el 26 nov 2026/);
    assert.ok(!/Con lo que abonaste/.test(t), 'el abono de antes del acuerdo ya estaba en la cuenta del acuerdo');
  });
});

/* ==========================================================================
 * D. EL CELULAR DE JOAN
 * ======================================================================== */
describe('D. el celular cobra el pago acordado con la misma cuenta y lo llama por su nombre', () => {

  test('cobrarlo el 20-nov desde el celular: 280.000, la misma garantía que en el computador', () => {
    const e = abrirEspejo({ cartera: cartera([pactado()]), ahora: SUYA + 'T10:30:00' });
    const esperado = P.cierreDeCuota(pactado(), SUYA);
    e.ev("cobrar('c1', '" + SUYA + "')");
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.pagado, true);
    assert.equal(q.planPagos.cuotas[0].garantiaGenerada, esperado.registros.cuota.garantiaGenerada);
    assert.equal(q.abonosCapital[q.abonosCapital.length - 1].monto, 250000);
    assert.equal(P.gananciaDelCredito(q).ganancia, 155000);
  });

  test('la vista del crédito dice «próximo pago acordado» y lo que te deja; prorrogarlo no se puede', () => {
    const e = abrirEspejo({ cartera: cartera([pactado()]), ahora: '2026-11-01T10:30:00' });
    e.ev("SEL.creditoId = 'c1'");
    const t = plano(e.ev('vistaCredito()'));
    assert.match(t, /Tiene un próximo pago acordado\s*:\s*\$280\.000 el 20 de nov de 2026/);
    assert.match(t, /Total del pago acordado \$280\.000/);
    assert.ok(!/cuota 1 de 1/.test(t));
    assert.match(t, /Este crédito te deja \$155\.000 · 24,8%/);
    assert.ok(!/crédito a cuotas/.test(t));
    e.ev("abonarYProrrogar('c1', '2026-11-01', 100000)");
    assert.match(e.avisos.join(' | '), /próximo pago acordado: \$280\.000 el 20 de noviembre de 2026/);
    assert.equal(e.json('DB.prestamos[0]').prorrogas.length, 1, 'no registró otra prórroga');
  });
});

/* ==========================================================================
 * E. LA NUBE, CON LOS DOS LADOS
 * ======================================================================== */
describe('E. la nube no pierde el pacto ni cuenta dos veces la plata', () => {

  /* Los dos lados registraron el mismo abono + prórroga; solo el computador le
     puso el pago de Joan (con perdón de 10.000). */
  function lados() {
    const sinPacto = credito();
    const r0 = P.abonoConProrroga(cartera([sinPacto]), sinPacto, DIA, 500000);
    aplicar(sinPacto, r0);
    return { computador: pactado(240000, 'cliente de años'), celular: sinPacto };
  }

  /* 22-oct-2026 (revisión) — esta prueba decía que el pacto «entra al otro con
     su perdón». Era el defecto N1 de la revisión de plata: con el corte en
     discusión, «lo mío» del lado sin pacto se quedaba con el pacto de allá
     (el bucle de fusionarFila copia sin preguntar un campo que solo está de un
     lado), y con cualquier abono del celular cobraba capital dos veces. El
     pacto viaja entero con su lado: ver pruebas/pacto-en-la-nube.test.js. */
  test('el pacto de un lado NO entra a la versión del otro cuando hay algo en discusión: lo decide Joan', () => {
    const { computador, celular } = lados();
    const f = NUBE.fusionarFila(copia(celular), copia(computador));
    assert.equal(f.fila.planPagos, undefined, '«lo mío» del lado sin pacto se queda sin el pacto');
    assert.deepEqual(f.fila.condonaciones, [], 'ni con su perdón');
    assert.equal(f.fila.prorrogas.length, 1, 'la misma prórroga no se cuenta dos veces');
    assert.equal(f.fila.abonosCapital.length, 1, 'el mismo abono no se cuenta dos veces');
    assert.equal(P.capitalActual(f.fila), 250000);
    assert.equal(P.corteDelCredito(f.fila), CRM_FECHA);
    assert.ok(f.pisables.some(x => x.campo === 'cicloActual'));
    assert.ok(f.pisables.some(x => x.campo === 'pagoAcordado' &&
      x.suyo === 'pago acordado $240000 el ' + SUYA + ', perdonando $10000 de capital'));
    const g = NUBE.fusionarFila(copia(computador), copia(celular));
    assert.deepEqual(g.fila.planPagos, computador.planPagos);
    assert.deepEqual(g.fila.condonaciones, computador.condonaciones);
    assert.equal(P.capitalActual(g.fila), 240000);
    assert.equal(P.corteDelCredito(g.fila), SUYA, 'el corte sale de la cuota acordada');
  });

  /* 22-oct-2026 (revisión) — con perdones de verdad, de dos pactos del mismo
     día: desde la revisión el perdón se cuenta desde su plan (un perdón sin su
     pacto no existe) y cada uno lleva su id. */
  test('dos perdones de capital del mismo día son dos hechos, no uno', () => {
    const p = pactado(240000, 'cliente de años');
    const r = P.pactarProximoPago(cartera([p]), p, { fecha: SUYA, monto: 235000, motivo: 'otro' }, DIA);
    aplicarPacto(p, r);
    const f = NUBE.fusionarFila(copia(p), copia(p));
    assert.equal(f.fila.condonaciones.length, 2);
    assert.equal(P.capitalPerdonadoDe(f.fila), 15000);
    assert.equal(P.capitalActual(f.fila), 235000);
  });

  test('un abono suelto que el pacto no conocía es un choque en pesos, no capital contado dos veces', () => {
    const { computador } = lados();
    const otro = copia(computador);
    delete otro.planPagos;
    otro.condonaciones = [];
    otro.cicloActual = CRM_FECHA;
    otro.abonosCapital.push({ fecha: '2026-11-01', monto: 50000, ciclo: CRM_FECHA, costoCausado: 50000, moraCausada: 0 });
    const f = NUBE.fusionarFila(copia(computador), copia(otro));
    /* 22-oct-2026 (revisión): el choque se llama `pagoAcordado` —el de las
       cuotas es otro, con otro texto— y trae lo de cada lado. */
    const ch = f.pisables.find(x => x.campo === 'pagoAcordado');
    assert.ok(ch, 'debió avisar');
    assert.match(String(ch.suyo), /abono 2026-11-01 \$50000/);
    assert.equal(f.fila.abonosCapital.length, 1, '«lo mío encima» se queda con lo que el pacto conocía');
    const g = NUBE.fusionarFila(copia(otro), copia(computador));
    assert.ok(g.pisables.some(x => x.campo === 'pagoAcordado'), 'y desde el otro lado, también');
    assert.equal(g.fila.planPagos, undefined, 'y desde ese lado el pacto no entra');
  });
});
