'use strict';
/* ============================================================================
 * ABONO + PRÓRROGA EN UN SOLO PASO — 3 de octubre de 2026
 *
 *   node --test pruebas/abono-con-prorroga.test.js
 *
 * Joan: «la cliente hizo un abono de 200.000 y el resto de la deuda se
 * financia para la siguiente quincena, pero el CRM no tiene la función de
 * abonos… quiero que yo tenga la posibilidad de hacerlo manual».
 *
 * La regla vive en PuenteTuGarantia.abonoConProrroga (app/puente.js). Estas
 * pruebas vigilan las cuatro cosas que, si se rompen, cuestan plata sin que se
 * vea:
 *
 *   1. EL CASO REAL, de punta a punta por el motor: 400.000 al 20%, corte
 *      1-oct, paga el 3-oct con 200.000 → 8.000 de mora, 80.000 de costo,
 *      112.000 a capital, y el 15-oct debe 345.600. Los números salen del
 *      respaldo de Joan del 1-oct; acá va un crédito de prueba con los mismos
 *      datos y sin nombres.
 *   2. QUE LOS REGISTROS SEAN LOS DEL CRM DE VERDAD. Se arranca crm.html en el
 *      banco, se aprietan abonarCapital y registrarProrroga en ese orden, y lo
 *      que escriben tiene que ser campo por campo lo que devuelve el puente. Si
 *      algún día una de las dos cambia y la otra no, esto se entera.
 *   3. QUE EL ABONO NO DEJE GARANTÍA: la garantía y el 80/20 son los de la
 *      prórroga, iguales a hacer las dos cosas por separado en cualquier orden.
 *   4. QUE NO SE PUEDA HACER DOS VECES, ni inventar una prórroga que no hay, ni
 *      saldar con un «abono».
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/motor.js');
const P = require('../app/puente.js');
const NUBE = require('../panel/nube.js');
const { abrirPanel } = require('./banco-panel.js');

const DIA = '2026-10-03';          // el día en que pagó
const CORTE = '2026-10-01';        // el corte que venció
const NUEVO = '2026-10-15';        // la quincena siguiente, según el motor

/* El crédito del caso real, sin nombres: pedido el 19-sep (antes del 27-sep,
   así que su mora todavía deja garantía al 0,375). */
function credito(extra) {
  return Object.assign({
    id: 'c1', numero: 81, socioId: 's1', socioNombre: 'Cliente de prueba',
    capital: 400000, costoPct: 20, fechaDesembolso: '2026-09-19', cicloActual: CORTE,
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
  }, extra || {});
}
function cartera(p) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Cliente de prueba', telefono: '3001112233',
               whatsappIgual: true, cedula: '52111222' }],
    prestamos: [p], config: { negocio: 'Tu Garantía' }
  };
}
/* Lo que hace la pantalla con un resultado `ok`: empujar y mover el corte, en
   un solo paso. Nada más. */
function aplicar(p, r) {
  const g = r.registros;
  if (g.abono) p.abonosCapital.push(g.abono);
  p.prorrogas.push(g.prorroga);
  if (g.condonacion) (p.condonaciones = p.condonaciones || []).push(g.condonacion);
  p.cicloActual = g.cicloActual;
}
const copia = o => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------------
   El CRM de verdad, en el banco, con la hora congelada el día del pago.
   ------------------------------------------------------------------------ */
function panelCon(p) {
  const B = abrirPanel({ ahora: DIA + 'T10:00:00' });
  B.cargarCartera(cartera(p));
  // Sí a todo, menos a abrir WhatsApp.
  B.ev("confirm=t=>String(t).indexOf('WhatsApp')<0");
  return B;
}
const pon = (B, id, v) => B.ev("document.getElementById('" + id + "').value='" + v + "'");
function abonarEnElCRM(B, monto) {
  pon(B, 'abCap', String(monto));
  B.ev("abonarCapital('c1','" + DIA + "')");
}
function prorrogarEnElCRM(B, pct, motivo) {
  pon(B, 'pgFecha', DIA);
  pon(B, 'pgDescPct', pct ? String(pct) : '');
  pon(B, 'pgDescMotivo', motivo || '');
  B.ev("registrarProrroga('c1')");
}
const leerCartera = B => JSON.parse(B.ev('JSON.stringify(DB)'));

/* ========================================================================== */
describe('el caso real: abona 200.000 y el resto pasa a la quincena siguiente', () => {

  test('la plata se aplica en orden: mora, costo, capital', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.dias_mora, 2);
    assert.equal(r.mora, 8000, '1% diario de 400.000 por 2 días');
    assert.equal(r.mora_cobrada, 8000);
    assert.equal(r.costo, 80000, 'el costo del ciclo: 20% de 400.000');
    assert.equal(r.precio_prorroga, 88000, 'la prórroga es mora + costo');
    assert.equal(r.a_capital, 112000);
    assert.equal(r.capital_antes, 400000);
    assert.equal(r.capital_despues, 288000);
    assert.equal(r.corte_antes, CORTE);
    assert.equal(r.corte_nuevo, NUEVO, 'el corte nuevo lo pone el motor');
    assert.equal(r.corte_nuevo, M.fechaCorteProrroga(CORTE, DIA));
    assert.equal(r.costo_siguiente, 57600, 'el costo siguiente es sobre el capital NUEVO');
    assert.equal(r.total_siguiente, 345600);
    assert.equal(r.a_tiempo, false);
    assert.equal(r.prorrogas_usadas, 0);
    assert.equal(r.prorrogas_restantes, 1);
    assert.match(r.detalle, /\$112\.000 a capital/);
    assert.match(r.detalle, /15 de octubre de 2026/);
    assert.match(r.detalle, /\$345\.600/);
  });

  test('aplicados los registros, el PUENTE cobra 345.600 el 15-oct, y la mora corre sobre 288.000', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    aplicar(p, r);
    assert.equal(P.corteDelCredito(p), NUEVO);
    assert.equal(P.capitalActual(p), 288000);
    assert.equal(P.K(p), 57600, 'K tomó el costo del ciclo viejo como piso');
    const enFecha = P.liquidarCiclo(p, NUEVO);
    assert.deepEqual([enFecha.capital, enFecha.costo, enFecha.recargo_mora, enFecha.total_a_pagar],
      [288000, 57600, 0, 345600]);
    // Dos días tarde: el 1% diario sobre lo que de verdad debe, no sobre los 400.000.
    const tarde = P.liquidarCiclo(p, '2026-10-17');
    assert.equal(tarde.recargo_mora, 5760);
    assert.equal(tarde.total_a_pagar, 351360);
  });

  test('el paquete del socio (migrarSocio) le muestra lo mismo a la cliente', () => {
    const p = credito(), db = cartera(p);
    aplicar(p, P.abonoConProrroga(db, p, DIA, 200000));
    const c = P.migrarSocio(db, db.socios[0], DIA).creditos[0];
    assert.equal(c.corte, NUEVO);
    assert.equal(c.saldo_capital, 288000);
    assert.equal(c.capital, 288000);
    assert.equal(c.costo, 57600);
    assert.equal(c.total_hoy, 345600);
    assert.equal(c.prorrogas, 1);
    assert.equal(c.garantia, 67000, 'la garantía es la de la prórroga, nada más');
    assert.equal(c.mora, 0);
  });

  test('es pura: no toca ni el crédito ni la cartera', () => {
    const p = credito(), db = cartera(p);
    const antes = JSON.stringify(db);
    P.abonoConProrroga(db, p, DIA, 200000);
    P.abonoConProrroga(db, p, DIA, 50000);
    P.abonoConProrroga(db, p, DIA, 900000);
    P.abonoConProrroga(db, p, DIA, 200000, { condonaMora: 8000, motivo: 'x' });
    assert.equal(JSON.stringify(db), antes);
  });
});

/* ========================================================================== */
describe('dónde se anota el abono, y por qué (la evidencia es del puente)', () => {

  test('el abono va al ciclo VIEJO con su congelado; el ciclo nuevo arranca sin piso', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.deepEqual(r.registros.abono, {
      fecha: DIA, monto: 112000, ciclo: CORTE,
      costoCausado: 80000, moraCausada: 8000, diasMoraCausada: 2
    });
    aplicar(p, r);
    assert.equal(P.causadoDelCiclo(p).tiene, false,
      'el congelado del ciclo viejo se coló en el ciclo nuevo');
    assert.equal(P.inicioDelCiclo(p), DIA, 'el ciclo nuevo arranca el día de la prórroga');
    assert.equal(P.capitalBaseDelCiclo(p), 288000,
      'capitalVigenteEn del día de la prórroga ya descuenta el abono del mismo día');
  });

  test('si el abono se anotara en el ciclo NUEVO con lo congelado, la quincena saldría a 80.000', () => {
    /* El contrafáctico, armado a mano: es lo que abonarCapital escribe cuando se
       aprieta DESPUÉS de la prórroga (cicloActual ya movido, y el costo
       causado cotizado sobre los 400.000 de antes del abono). K() lo toma de
       piso y la cliente pagaría 22.400 de más. Por eso la función fija el otro
       orden. */
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    p.prorrogas.push(r.registros.prorroga);
    p.cicloActual = NUEVO;
    p.abonosCapital.push({ fecha: DIA, monto: 112000, ciclo: NUEVO,
      costoCausado: 80000, moraCausada: 0, diasMoraCausada: 0 });
    assert.equal(P.K(p), 80000);
    assert.equal(P.liquidarCiclo(p, NUEVO).total_a_pagar, 368000);
    assert.ok(P.liquidarCiclo(p, NUEVO).total_a_pagar > r.total_siguiente);
  });
});

/* ========================================================================== */
describe('los registros son, campo por campo, los que escribe el CRM de verdad', () => {

  test('abonarCapital y después registrarProrroga escriben exactamente esto', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    const B = panelCon(credito());
    abonarEnElCRM(B, r.a_capital);
    prorrogarEnElCRM(B);
    const q = leerCartera(B).prestamos[0];
    assert.equal(q.abonosCapital.length, 1, 'el CRM no registró el abono');
    assert.equal(q.prorrogas.length, 1, 'el CRM no registró la prórroga: ' + (B.ctx._avisos || []).join(' | '));
    assert.deepEqual(q.abonosCapital[0], r.registros.abono);
    assert.deepEqual(q.prorrogas[0], r.registros.prorroga);
    assert.equal(q.cicloActual, r.registros.cicloActual);
    assert.equal((q.condonaciones || []).length, 0);
    assert.equal(r.registros.condonacion, null);
  });

  test('con el 50% de la mora perdonado, también la condonación', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000,
      { condonaMora: 4000, motivo: 'se le inundó la casa' });
    assert.equal(r.ok, true, r.detalle);
    const B = panelCon(credito());
    abonarEnElCRM(B, r.a_capital);
    prorrogarEnElCRM(B, 50, 'se le inundó la casa');
    const q = leerCartera(B).prestamos[0];
    assert.deepEqual(q.abonosCapital[0], r.registros.abono);
    assert.deepEqual(q.prorrogas[0], r.registros.prorroga);
    assert.deepEqual(q.condonaciones[0], r.registros.condonacion);
    assert.equal(q.cicloActual, r.registros.cicloActual);
  });

  test('si la plata es justo la prórroga, es la prórroga de siempre y no hay abono', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 88000);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.registros.abono, null, 'un abono de $0 no se anota');
    assert.equal(r.a_capital, 0);
    assert.equal(r.capital_despues, 400000);
    assert.equal(r.costo_siguiente, 80000);
    const B = panelCon(credito());
    prorrogarEnElCRM(B);
    const q = leerCartera(B).prestamos[0];
    assert.deepEqual(q.prorrogas[0], r.registros.prorroga);
  });

  test('el comprobante es uno solo, por todo lo que entregó, con un tipo que la galería conoce', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    /* 3-oct-2026 (revisión): con abono el tipo es 'abonoProrroga'; con
       'prorroga' la galería decía «Prórroga $200.000» junto a una de $88.000. */
    assert.deepEqual(r.registros.comprobante, { tipo: 'abonoProrroga', monto: 200000 });
    const crm = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    assert.match(crm, /abonoProrroga:'Abono \+ prórroga'/,'la galería no sabe nombrar el tipo abonoProrroga');
    assert.match(crm, /prorroga:'Prórroga'/, 'la galería dejó de nombrar el tipo prorroga');
  });
});

/* ========================================================================== */
describe('la garantía y el 80/20 son los de hacer las dos cosas por separado', () => {

  function porSeparado(orden) {
    const B = panelCon(credito());
    if (orden === 'prorroga-abono') { prorrogarEnElCRM(B); abonarEnElCRM(B, 112000); }
    else { abonarEnElCRM(B, 112000); prorrogarEnElCRM(B); }
    return leerCartera(B);
  }
  function deUnPaso() {
    const p = credito(), db = cartera(p);
    aplicar(p, P.abonoConProrroga(db, p, DIA, 200000));
    return db;
  }
  const cuentas = db => {
    const p = db.prestamos[0], s = db.socios[0], c = P.contabilidadCupon(db, s);
    return {
      garantia: P.garantiaGanadaCredito(p),
      ganancia: P.gananciaCobrada(p),
      capital: P.capitalActual(p),
      cobrado: c.cobrado, garantia_socio: c.garantia_socio, operativo: c.operativo,
      cupon_pendiente: c.cupon_pendiente,
      movimientos: P.movimientosCobradosCredito(p).map(m => [m.tipo, m.monto, m.aTiempo])
    };
  };

  test('en cualquier orden, la misma garantía, la misma ganancia y el mismo reparto', () => {
    const uno = cuentas(deUnPaso());
    assert.deepEqual(cuentas(porSeparado('abono-prorroga')), uno);
    assert.deepEqual(cuentas(porSeparado('prorroga-abono')), uno);
    assert.equal(uno.garantia, 67000);
    assert.equal(uno.ganancia, 88000, 'la ganancia es la prórroga: el abono es capital que vuelve');
    assert.deepEqual(uno.movimientos, [['costo_prorroga', 80000, false], ['recargo_mora', 8000, false]],
      'el abono se coló como un movimiento cobrado');
  });

  test('lo que Joan ve antes de confirmar es lo que el socio va a tener', () => {
    const p = credito(), db = cartera(p);
    const r = P.abonoConProrroga(db, p, DIA, 200000);
    assert.equal(r.garantia, 67000);
    assert.equal(r.reparto.garantia_socio, r.garantia);
    assert.equal(r.reparto.total, 88000, 'el reparto es de la plata de la prórroga, no del abono');
    assert.equal(r.reparto.mora, 8000);
    assert.equal(r.reparto.garantia_socio + r.reparto.amortiza_cupon + r.reparto.operativo, 88000,
      'el reparto no suma la plata que entró');
    const antes = P.garantiaGanadaCredito(p);
    aplicar(p, r);
    assert.equal(P.garantiaGanadaCredito(p) - antes, r.garantia);
  });

  test('el abono no deja ni un peso de garantía', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    const soloProrroga = credito({ prorrogas: [r.registros.prorroga], cicloActual: NUEVO });
    const conAbono = credito({ prorrogas: [r.registros.prorroga], cicloActual: NUEVO,
                               abonosCapital: [r.registros.abono] });
    assert.equal(P.garantiaGanadaCredito(conAbono), P.garantiaGanadaCredito(soloProrroga));
  });
});

/* ========================================================================== */
describe('la mora deja garantía o no según el día en que se PIDIÓ el crédito', () => {

  test('pedido antes del 27-sep: 80% del costo + 0,375 de la mora', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.ok(p.fechaDesembolso < M.FECHA_MORA_SIN_GARANTIA);
    assert.equal(r.garantia, M.acumularGarantia(80000, false) + M.garantiaDeMoraPagada(8000, p.fechaDesembolso));
    assert.equal(r.garantia, 67000);
    assert.equal(r.reparto.garantia_mora, 3000);
    assert.equal(r.reparto.operativo, 21000);
  });

  test('pedido desde el 27-sep: la mora es toda de la empresa', () => {
    const p = credito({ fechaDesembolso: '2026-09-27' });
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.garantia, 64000);
    assert.equal(r.reparto.garantia_mora, 0);
    assert.equal(r.reparto.operativo, 24000);
    // Lo demás no cambia: la fecha del crédito decide la garantía, no la plata.
    assert.deepEqual([r.a_capital, r.capital_despues, r.total_siguiente], [112000, 288000, 345600]);
  });
});

/* ========================================================================== */
describe('perdonar parte de la mora', () => {

  test('el 50%: la prórroga baja, el abono sube, y queda anotado con su motivo', () => {
    const p = credito(), db = cartera(p);
    const r = P.abonoConProrroga(db, p, DIA, 200000, { condonaMora: 4000, motivo: 'cliente vieja' });
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual([r.mora, r.mora_condonada, r.mora_cobrada, r.precio_prorroga, r.a_capital],
      [8000, 4000, 4000, 84000, 116000]);
    assert.deepEqual([r.capital_despues, r.costo_siguiente, r.total_siguiente], [284000, 56800, 340800]);
    assert.deepEqual(r.registros.condonacion, { fecha: DIA, costo: 0, mora: 4000,
      motivo: 'cliente vieja', quien: 'computador', sobre: 'prorroga' });
    assert.equal(r.registros.prorroga.moraCausada, 8000, 'la mora causada es un hecho: el perdón no la borra');
    assert.equal(r.de_tu_ganancia + r.de_su_cupo, 4000, 'hay plata perdonada sin dueño');
    aplicar(p, r);
    // Cae en la quincena del corte VIEJO, donde se rebajó la ganancia.
    assert.equal(P.quincenaDeCondonacion(p, r.registros.condonacion), CORTE);
    assert.equal(P.descuentosDeQuincena(db, CORTE).mora, 4000);
  });

  test('el 100%: la mora no entra, pero la prórroga sigue siendo tardía', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000, { condonaMora: 8000, motivo: 'acuerdo' });
    assert.equal(r.precio_prorroga, 80000);
    assert.equal(r.a_capital, 120000);
    assert.equal(r.registros.prorroga.mora, 0);
    assert.equal(r.registros.prorroga.aTiempo, false, 'el perdón lavó la puntualidad');
    assert.equal(r.registros.prorroga.diasMora, 2);
  });

  test('se topa contra lo causado, y sin motivo no se registra', () => {
    const p = credito();
    const topado = P.abonoConProrroga(cartera(p), p, DIA, 200000, { condonaMora: 99999, motivo: 'x' });
    assert.equal(topado.mora_condonada, 8000, 'perdonar más que la mora sería perdonar capital');
    const sinMotivo = P.abonoConProrroga(cartera(p), p, DIA, 200000, { condonaMora: 4000, motivo: '  ' });
    assert.equal(sinMotivo.ok, false);
    assert.equal(sinMotivo.motivo, 'falta_motivo');
    assert.equal(sinMotivo.registros, null);
  });
});

/* ========================================================================== */
describe('cuando la plata no alcanza, o alcanza para todo', () => {

  test('menos que la prórroga: lo dice y ofrece los caminos que ya existen', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 80000);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'no_alcanza');
    assert.equal(r.falta, 8000);
    assert.deepEqual(r.caminos, ['prorroga_con_descuento', 'acuerdo', 'queda_debiendo']);
    assert.equal(r.registros, null);
    assert.match(r.detalle, /cuesta \$88\.000/);
    assert.match(r.detalle, /Faltan \$8\.000/);
  });

  test('con $0 no se ofrece abonar, y con un acuerdo pactado no se ofrece otro', () => {
    const p = credito();
    assert.deepEqual(P.abonoConProrroga(cartera(p), p, DIA, 0).caminos,
      ['prorroga_con_descuento', 'acuerdo']);
    const conPacto = credito({ acuerdo: { pactadaPara: '2026-10-05', monto: 88000 } });
    const r = P.abonoConProrroga(cartera(conPacto), conPacto, DIA, 50000);
    assert.deepEqual(r.caminos, ['prorroga_con_descuento', 'queda_debiendo']);
    assert.equal(r.hay_acuerdo, true);
  });

  test('lo que salda el crédito no es un abono: es «Pagó todo»', () => {
    const p = credito();
    const justo = P.abonoConProrroga(cartera(p), p, DIA, 488000);
    assert.equal(justo.motivo, 'paga_todo');
    assert.equal(justo.total_para_saldar, 488000);
    assert.equal(justo.a_capital, 0, 'pintó un abono del tamaño de la deuda');
    assert.deepEqual(justo.caminos, ['pago_total']);
    const deMas = P.abonoConProrroga(cartera(p), p, DIA, 500000);
    assert.equal(deMas.motivo, 'paga_todo');
    assert.equal(deMas.sobra, 12000);
    const casi = P.abonoConProrroga(cartera(p), p, DIA, 487999);
    assert.equal(casi.ok, true, 'un peso menos que saldar sí es abono + prórroga');
    assert.equal(casi.capital_despues, 1);
  });

  test('en toda la rejilla: el abono nunca alcanza al capital y la plata cuadra al peso', () => {
    const p = credito(), db = cartera(p);
    let oks = 0;
    for (let x = 0; x <= 600000; x += 997) {
      const r = P.abonoConProrroga(db, p, DIA, x);
      if (x < 88000) { assert.equal(r.motivo, 'no_alcanza', 'x=' + x); continue; }
      if (x >= 488000) { assert.equal(r.motivo, 'paga_todo', 'x=' + x); continue; }
      assert.equal(r.ok, true, 'x=' + x + ': ' + r.detalle);
      oks++;
      assert.equal(r.precio_prorroga + r.a_capital, x, 'se perdió plata en x=' + x);
      assert.ok(r.a_capital >= 0 && r.a_capital < r.capital_antes, 'x=' + x);
      assert.equal(r.capital_despues, r.capital_antes - r.a_capital);
      assert.equal(r.costo_siguiente, Math.round(r.capital_despues * 0.20), 'x=' + x);
      assert.equal(r.total_siguiente, r.capital_despues + r.costo_siguiente);
    }
    assert.ok(oks > 300, 'la rejilla se encogió: ' + oks);
  });

  test('un monto que no es plata no se registra', () => {
    const p = credito();
    assert.equal(P.abonoConProrroga(cartera(p), p, DIA, -1).motivo, 'monto_invalido');
    assert.equal(P.abonoConProrroga(cartera(p), p, DIA, 'abc').motivo, 'monto_invalido');
    assert.equal(P.abonoConProrroga(cartera(p), p, DIA, undefined).motivo, 'monto_invalido');
  });

  test('pagando el día del corte no hay mora y la prórroga es a tiempo', () => {
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, CORTE, 150000);
    assert.equal(r.ok, true, r.detalle);
    assert.deepEqual([r.mora, r.costo, r.a_capital, r.a_tiempo], [0, 80000, 70000, true]);
    assert.equal(r.corte_nuevo, NUEVO);
    assert.deepEqual([r.capital_despues, r.costo_siguiente, r.total_siguiente], [330000, 66000, 396000]);
    assert.equal(r.garantia, 64000);
  });
});

/* ========================================================================== */
describe('sin prórroga disponible no hay abono + prórroga', () => {

  test('pagado', () => {
    const p = credito({ pagado: true, fechaPagado: CORTE, cicloPago: CORTE });
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.equal(r.motivo, 'pagado');
    assert.equal(r.registros, null);
  });

  test('en plan de pagos: se cobra la cuota que sigue', () => {
    const p = credito({ planPagos: { tasa_por_corte: 0.05, cuotas: [
      { n: 1, fecha: '2026-10-15', capital: 133334, costo: 20000, pagado: false },
      { n: 2, fecha: '2026-10-30', capital: 133333, costo: 13333, pagado: false },
      { n: 3, fecha: '2026-11-17', capital: 133333, costo: 6667, pagado: false }] } });
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.equal(r.motivo, 'plan_de_pagos');
    assert.deepEqual(r.caminos, ['cuota_del_plan']);
    assert.equal(r.registros, null);
  });

  test('sin prórrogas en su nivel: dice por qué y trae el plan de pagos del motor', () => {
    const p = credito({ fechaDesembolso: '2026-08-18', prorrogas: [
      { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: '2026-09-15' },
      { fecha: '2026-09-15', ciclo: '2026-09-15', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: CORTE }] });
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'prorrogas_agotadas');
    /* 3-oct-2026 (revisión): con más plata que la entrada del plan, también
       «Queda debiendo» con lo que sobra (abono-con-prorroga-revision.test.js). */
    assert.deepEqual(r.caminos, ['queda_debiendo', 'plan_de_pagos']);
    assert.equal(r.prorrogas_usadas, 2);
    assert.equal(r.prorrogas_permitidas, M.prorrogasPermitidas(r.nivel_socio));
    assert.ok(r.plan_de_pagos && r.plan_de_pagos.cuotas.length === M.CUOTAS_PLAN_DE_PAGOS,
      'no trajo el plan de pagos que arma el motor');
    assert.match(r.detalle, /plan de pagos/);
    assert.equal(r.registros, null);
  });

  test('capital en cero', () => {
    const p = credito({ abonosCapital: [{ fecha: '2026-09-25', monto: 400000 }] });
    assert.equal(P.abonoConProrroga(cartera(p), p, DIA, 100000).motivo, 'capital_cero');
  });
});

/* ========================================================================== */
describe('la misma operación dos veces no se puede', () => {

  test('aplicada una vez, volver a pedirla el mismo día la para', () => {
    const p = credito(), db = cartera(p);
    const r = P.abonoConProrroga(db, p, DIA, 200000);
    aplicar(p, r);
    const otra = P.abonoConProrroga(db, p, DIA, 200000);
    assert.equal(otra.ok, false, 'dejó registrar la misma operación dos veces');
    assert.equal(otra.motivo, 'ya_registrado');
    assert.equal(otra.registros, null);
    /* 3-oct-2026 (revisión): ya no manda a «Queda debiendo» (cobra de más);
       ofrece sumar la plata a la misma entrega, en otro botón con su confirm. */
    assert.deepEqual(otra.caminos, ['abono_mismo_dia']);
    assert.match(otra.detalle, /3 de octubre de 2026/);
    assert.equal(p.prorrogas.length, 1);
  });

  test('un resultado viejo se reconoce: su corte ya no es el del crédito', () => {
    /* La pantalla guarda el resultado de cuando pintó la hoja. Si entre tanto
       se registró, el corte se movió y no coincide: no se empuja. */
    const p = credito();
    const r = P.abonoConProrroga(cartera(p), p, DIA, 200000);
    aplicar(p, r);
    assert.notEqual(P.corteDelCredito(p), r.corte_antes);
  });

  test('otro día y desde el corte nuevo sí es otra operación, con otra identidad en la nube', () => {
    const p = credito(), db = cartera(p);
    const r1 = P.abonoConProrroga(db, p, DIA, 200000);
    aplicar(p, r1);
    const r2 = P.abonoConProrroga(db, p, NUEVO, 100000);
    assert.equal(r2.ok, true, r2.detalle);
    assert.equal(r2.corte_antes, NUEVO);
    assert.equal(r2.prorrogas_usadas, 1);
    assert.equal(r2.prorrogas_restantes, 0);
    assert.equal(r2.costo, 57600);
    assert.notDeepEqual([r2.registros.prorroga.fecha, r2.registros.prorroga.ciclo],
                        [r1.registros.prorroga.fecha, r1.registros.prorroga.ciclo]);
  });
});

/* ========================================================================== */
describe('la nube lo entiende sin campos nuevos', () => {

  test('subir lo hecho contra la versión de antes trae cada hecho UNA vez', () => {
    const antes = credito();
    const despues = credito();
    aplicar(despues, P.abonoConProrroga(cartera(despues), despues, DIA, 200000,
      { condonaMora: 4000, motivo: 'cliente vieja' }));
    const f = NUBE.fusionarFila(despues, antes, NUBE.LISTAS_QUE_SUMAN).fila;
    assert.equal(f.abonosCapital.length, 1);
    assert.equal(f.prorrogas.length, 1);
    assert.equal(f.condonaciones.length, 1);
    const mismo = NUBE.fusionarFila(despues, copia(despues), NUBE.LISTAS_QUE_SUMAN);
    assert.equal(mismo.hayChoque, false);
    assert.equal(mismo.fila.prorrogas.length, 1, 'la misma prórroga de los dos lados se duplicó');
    assert.equal(mismo.fila.abonosCapital.length, 1, 'el mismo abono de los dos lados se duplicó');
  });
});

/* ========================================================================== */
describe('no lanza nunca', () => {
  test('con basura devuelve un no, nunca un error', () => {
    assert.doesNotThrow(() => P.abonoConProrroga());
    assert.equal(P.abonoConProrroga(null, null, DIA, 1).motivo, 'sin_credito');
    assert.doesNotThrow(() => P.abonoConProrroga({}, {}, 'basura', 'x', 'y'));
    assert.doesNotThrow(() => P.abonoConProrroga({}, { capital: 1000, cicloActual: 'nunca' }, DIA, 500));
    const r = P.abonoConProrroga({}, { capital: 1000, cicloActual: 'nunca' }, DIA, 500);
    assert.equal(r.ok, false);
    assert.equal(r.registros, null);
  });
});
