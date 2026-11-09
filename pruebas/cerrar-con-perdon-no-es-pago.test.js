/* ============================================================================
 * UN CIERRE CON PÉRDIDA NO ES UN PAGO — 31-oct-2026
 *
 *   cd pruebas && node --test cerrar-con-perdon-no-es-pago.test.js
 *
 * Desde el 30-oct «Se lo perdoné» cierra el crédito con CUALQUIER monto, hasta
 * con $0 (cerrar-con-perdon.test.js). Antes de eso un crédito solo quedaba
 * `pagado` si el cliente devolvía por lo menos el capital, y todo lo que lee
 * `p.pagado` como «el cliente pagó» se escribió con esa verdad adentro. La
 * revisión del 31-oct encontró seis sitios donde un cierre que PERDIÓ capital
 * se contaba como un pago:
 *
 *   1. la comisión del asesor: «el cliente pagó su primer crédito» (10.000 y
 *      el desbloqueo de 15.000), la recurrencia (5.000), y el castigo de los 20
 *      días de mora, que el cierre borraba;
 *   2. los 5.000 de garantía por referido de quien lo trajo (y «Trajiste a
 *      alguien»): un cupo acuñado con plata que no entró. Y «Tu gente», en el
 *      celular de Joan (app/gente.js), que tiene que contar lo pagado con la
 *      misma vara que esa garantía;
 *   3. la racha, «Pagados a tiempo», «Pagado en fecha», las insignias y las
 *      cifras del grupo;
 *   4. la columna «Capital» de la lista de Créditos, que decía el capital
 *      PERDIDO sin rótulo, como una deuda viva (y, del mismo tablero, «%
 *      Recuperación de cuentas», que lo contaba como cuenta recuperada);
 *   5. el «Riesgo (sugerido)», que el perdón BAJABA (Alto → Bajo);
 *   6. la app del cliente: «Pagado en fecha», «3 de 3 cuotas pagadas» y
 *      «Garantía que te dejó: al pagarlo» de un crédito ya cerrado (y
 *      PlataChat, que lee el mismo paquete con su propia tarjeta).
 *
 * La regla es una sola y vive en el puente (cerroConPerdida): un cierre que no
 * devolvió el capital no es un pago. El perdón de mora y costo con el capital
 * devuelto entero SÍ lo es, como desde el 2-sep: cada sección lo vigila
 * también, para que el arreglo no le cambie nada a lo de antes.
 *
 * 31-oct-2026, SEGUNDA REVISIÓN — el primer arreglo se pasó en dos sitios y
 * dejó uno sin ver:
 *   · al asesor (sección 1) le dejaba el crédito cerrado con pérdida
 *     corriendo para siempre: castigo de «Mora de 20 días» por créditos que
 *     se cerraron el día del corte, o antes, sin un día de mora; y lo
 *     bloqueado no se soltaba nunca, aunque el cliente pagara en fecha sus
 *     créditos siguientes, con textos que prometen que se suelta;
 *   · al cliente (sección 5) lo dejaba en «Alto» para siempre: perder 1.000
 *     a los 6 días pesaba más que pagar todo con 16 de atraso, y Joan había
 *     decidido que el cierre no le pone marca (decisión 4);
 *   · y después de cerrar con pérdida (sección 7), el CRM le ofrecía a Joan
 *     mandarle al cliente «Tu pago quedó registrado… gracias por tu
 *     cumplimiento», aunque hubiera entregado $0; y el celular, en «Pagaron
 *     ayer», también.
 * ==========================================================================*/
'use strict';

const { test, describe, mock } = require('node:test');
/* 3-nov-2026 — la hora es un dato (pruebas/reloj.js): crmCon le pasa a la página
   el 31-oct, pero app/puente.js se carga por fuera del contexto y miraba el
   reloj de verdad. El 3-nov, «3 días de mora» eran 6 y Lucía salía Alto. */
mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-31T10:30:00').getTime() });
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const RAIZ = path.join(__dirname, '..');
const P = require(path.join(RAIZ, 'app', 'puente.js'));
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const C = require(path.join(RAIZ, 'app', 'comisiones.js'));
const G = require(path.join(RAIZ, 'app', 'gente.js'));
const { abrirPanel } = require('./banco-panel.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const copia = x => JSON.parse(JSON.stringify(x));
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const SI = { motivo: 'se quedó sin trabajo', entiende: true };

/* Lo que guarda la pantalla con los registros del cierre: el mismo orden que el CRM. */
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
function cerrar(db, p, fecha, monto) {
  const r = P.cierreConPerdon(db, p, fecha, monto, SI);
  assert.equal(r.ok, true, 'no se pudo cerrar el crédito de la prueba: ' + r.detalle);
  return aplicar(p, r.registros);
}
/* Un cobro de siempre, entero: lo que deja el CRM con «✓ Pagó todo». */
function pagarTodo(p, fecha) {
  const liq = P.liquidarCiclo(p, fecha);
  return Object.assign(copia(p), { pagado: true, fechaPagado: fecha, cicloPago: P.corteDelCredito(p), cobroRegistrado: true,
    gananciaPago: liq.costo + liq.recargo_mora, recargoMora: liq.recargo_mora, costoCausado: liq.costo,
    moraCausada: liq.recargo_mora, montoRecibido: liq.total_a_pagar, saldoAFavor: 0, capitalPerdido: 0 });
}
function quincenal(o) {
  return Object.assign({ prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false, costoPct: 20 }, o);
}
function aCuotas(o) {
  const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
    { fechaDesembolso: '2026-10-16' });
  return Object.assign({ capital: 650000, costoPct: 20, fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30',
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false, planPagos: P.planPagosDeAlta(plan) }, o);
}
/* Los otros dos tipos, con la misma forma de cerrar-con-perdon-crm.test.js:
   un pago acordado el 10-oct para el 6-nov y un plan del §8 desde el 20-oct. */
function conPacto(o) {
  const q = quincenal(Object.assign({ capital: 400000, fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' }, o));
  const pa = P.pactarProximoPago({ socios: [], prestamos: [q] }, q, { fecha: '2026-11-06', monto: 450000 }, '2026-10-10');
  assert.equal(pa.ok, true, 'no se pudo pactar el pago de la prueba: ' + pa.detalle);
  q.planPagos = pa.registros.planPagos;
  q.cicloActual = pa.registros.cicloActual;
  return q;
}
function planDel8(o) {
  const plan = M.construirPlanDePagos({ capital: 300000, fecha_corte: '2026-10-15', estado: 'en_corte' }, { desde: '2026-10-20' });
  return quincenal(Object.assign({ capital: 300000, fechaDesembolso: '2026-10-01', cicloActual: plan.cuotas[0].fecha_corte,
    prorrogas: [{ fecha: '2026-10-15', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, nuevoCiclo: '2026-10-31' }],
    planPagos: { creado: '2026-10-20', tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: '2026-10-20', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, diasMora: 0 },
      total_capital: plan.total_capital, total_costo: plan.total_costo, total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(c => ({ n: c.numero, fecha: c.fecha_corte, capital: c.capital, costo: c.costo,
        total: c.total, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 })) } }, o));
}

/* ==========================================================================
 * 1. LA COMISIÓN DEL ASESOR
 * ======================================================================== */
describe('1 · la comisión del asesor: perdonarle la plata al cliente no le paga al asesor, ni le borra un castigo que ya llegó, ni le inventa uno', () => {
  const S = { id: 'sA', numero: 1, nombre: 'Clienta Inventada', telefono: '3000000020', gestiones: [] };
  const asign = [{ socio_id: 'sA', asesor_id: 'asesor-1', desde: '2026-08-30' }];
  const primero = () => quincenal({ id: 'pA', numero: 1, socioId: 'sA', socioNombre: S.nombre, capital: 300000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
  function libro(prestamos, hasta) {
    const movs = C.derivarMovimientos({ socios: [S], prestamos, registros: [], asignaciones: asign, actos: [], hasta });
    return { movs, saldo: C.saldoDeAsesor(movs, 'asesor-1', hasta), desbloquear: C.puedeDesbloquear(movs, 'asesor-1', 'sA') };
  }
  const corto = L => ({ bloqueado: L.saldo.bloqueado, libre: L.saldo.libre, castigos: L.saldo.castigos,
    puede: L.desbloquear.puede });

  test('el primer crédito cerrado con $0 el día 19 de mora: ni «pagó su primer crédito», ni desbloqueo, ni castigo (no llegó a 20 días)', () => {
    const cerrado = cerrar({ socios: [S], prestamos: [primero()] }, primero(), '2026-11-03', 0);
    assert.equal(P.perdidaDelCierre(cerrado), 300000, 'precondición: se perdió todo el capital');
    const L = libro([cerrado], '2026-12-31');
    assert.ok(!L.movs.some(m => m.tipo === 'pago'),
      'le anotó al asesor «el cliente pagó su primer crédito» de un cliente que no pagó nada');
    assert.equal(L.desbloquear.puede, false, 'le dejó desbloquear los 15.000');
    /* 31-oct-2026 (segunda revisión) — el cierre termina el tramo, como
       cualquier cierre: el crédito no llegó abierto al día 20, y la regla que
       el asesor tiene escrita es «si un crédito tuyo llega a 20 días sin
       pagar». Ni el día 20 ni dos meses después. */
    assert.ok(!L.movs.some(m => m.tipo === 'castigo_mora'),
      'castigó al asesor por 20 días de mora que el crédito no alcanzó a tener');
    assert.deepEqual(corto(L), { bloqueado: 15000, libre: 0, castigos: 0, puede: false });
    /* Y el botón dice algo que todavía es verdad: si paga otro, se suelta (abajo). */
    assert.match(L.desbloquear.motivo, /se desbloquean cuando pague/);
  });

  test('cerrado el día del corte perdiendo 10.000, sin un día de mora: ningún castigo, y lo bloqueado se suelta con el siguiente crédito que pague', () => {
    /* El caso de la segunda revisión: devolvió 290.000 de 300.000 el mismo
       15-oct del corte y Joan le perdonó 10.000 de capital y el costo. Antes
       del arreglo: «Mora de 20 días» el 4-nov, y los 15.000 bloqueados para
       siempre aunque pagara en fecha los dos créditos siguientes, con «Los
       15.000 se desbloquean cuando pague» en el botón. */
    const c1 = cerrar({ socios: [S], prestamos: [primero()] }, primero(), '2026-10-15', 290000);
    assert.equal(P.perdidaDelCierre(c1), 10000, 'precondición: perdió 10.000 de capital');
    const solo = libro([c1], '2026-12-31');
    assert.ok(!solo.movs.some(m => m.tipo === 'castigo_mora'),
      'castigó al asesor con «Mora de 20 días» por un crédito que nunca tuvo un día de mora');
    assert.equal(solo.desbloquear.puede, false, 'todavía no ha pagado nada: no se desbloquea');
    const c2 = pagarTodo(quincenal({ id: 'pB', numero: 2, socioId: 'sA', socioNombre: S.nombre, capital: 300000,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31' }), '2026-10-31');
    const c3 = pagarTodo(quincenal({ id: 'pC', numero: 3, socioId: 'sA', socioNombre: S.nombre, capital: 300000,
      fechaDesembolso: '2026-11-01', cicloActual: '2026-11-17' }), '2026-11-17');
    const L = libro([c1, c2, c3], '2026-12-31');
    assert.ok(!L.movs.some(m => m.tipo === 'castigo_mora'));
    assert.equal(L.desbloquear.puede, true,
      'pagó en fecha dos créditos y los 15.000 seguían bloqueados: «se desbloquean cuando pague» era mentira');
    assert.equal(L.desbloquear.monto, 15000);
    /* El pago que desbloquea es el del segundo, con un motivo que dice lo que pasó… */
    const pago = L.movs.find(m => m.tipo === 'pago');
    assert.equal(pago.credito_id, 'pB');
    assert.equal(pago.fecha, '2026-10-31');
    assert.equal(pago.monto, 10000);
    assert.match(pago.motivo, /el primero se cerró con pérdida de capital/);
    /* …y ese crédito no cobra además la recurrencia: un hecho, un movimiento. */
    const tipos = L.movs.map(m => m.tipo + ':' + m.credito_id);
    assert.ok(!tipos.includes('recurrencia:pB'), 'el mismo pago le pagó dos comisiones');
    assert.ok(tipos.includes('recurrencia:pC'));
    assert.deepEqual(corto(L), { bloqueado: 15000, libre: 15000, castigos: 0, puede: true });
    /* La ficha de la persona dice la misma cifra arriba y en la fila. */
    assert.equal(L.saldo.bloqueado, L.desbloquear.monto);
  });

  test('cerrado con pérdida ANTES del corte, y en los otros tres tipos, sin llegar a 20 días de mora: ningún castigo, ni con el tiempo', () => {
    const db = p => ({ socios: [S], prestamos: [p] });
    const casos = [
      ['quincenal, el 10-oct (corte 15-oct)', primero(), '2026-10-10', 250000],
      ['a cuotas, el 30-oct (su primera cuota)', aCuotas({ id: 'pA', numero: 1, socioId: 'sA', socioNombre: S.nombre }), '2026-10-30', 500000],
      ['pago acordado, el 6-nov (el día pactado)', conPacto({ id: 'pA', numero: 1, socioId: 'sA', socioNombre: S.nombre }), '2026-11-06', 300000],
      ['plan del §8, el 20-oct', planDel8({ id: 'pA', numero: 1, socioId: 'sA', socioNombre: S.nombre }), '2026-10-20', 200000]
    ];
    casos.forEach(([nombre, p, fecha, monto]) => {
      const c = cerrar(db(p), p, fecha, monto);
      assert.ok(P.perdidaDelCierre(c) > 0, 'precondición (' + nombre + '): perdió capital');
      const L = libro([c], '2027-01-31');
      assert.ok(!L.movs.some(m => m.tipo === 'castigo_mora'),
        nombre + ': castigo de «Mora de 20 días» por un crédito cerrado sin llegar a 20 días de mora');
      assert.ok(!L.movs.some(m => m.tipo === 'pago'), nombre + ': no pagó, no hay «pagó»');
    });
  });

  test('lo de antes no cambia: si el primero sigue abierto, el pago que desbloquea lo espera a él, aunque pague otros', () => {
    const p2 = pagarTodo(quincenal({ id: 'pB', numero: 2, socioId: 'sA', socioNombre: S.nombre, capital: 300000,
      fechaDesembolso: '2026-10-05', cicloActual: '2026-10-20' }), '2026-10-20');
    const L = libro([primero(), p2], '2026-10-25');
    assert.ok(!L.movs.some(m => m.tipo === 'pago'), 'el primero no se ha pagado: no hay «pagó su primer crédito»');
    assert.ok(L.movs.some(m => m.tipo === 'recurrencia' && m.credito_id === 'pB'));
    assert.equal(L.desbloquear.puede, false);
  });

  test('si el castigo ya había llegado con el crédito abierto, su motivo sigue siendo el de siempre', () => {
    const cerrado = cerrar({ socios: [S], prestamos: [primero()] }, primero(), '2026-11-10', 50000);
    const castigo = libro([cerrado], '2026-11-12').movs.find(m => m.tipo === 'castigo_mora');
    assert.equal(castigo.fecha, '2026-11-04');
    assert.equal(castigo.motivo, 'el crédito llegó a 20 días de mora');
  });

  test('un crédito posterior cerrado con pérdida no le paga la recurrencia («cerró otro crédito»)', () => {
    const p1 = pagarTodo(quincenal({ id: 'p1', numero: 1, socioId: 'sA', socioNombre: S.nombre, capital: 300000,
      fechaDesembolso: '2026-09-01', cicloActual: '2026-09-15' }), '2026-09-15');
    const p2 = quincenal({ id: 'p2', numero: 2, socioId: 'sA', socioNombre: S.nombre, capital: 300000,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
    const c2 = cerrar({ socios: [S], prestamos: [p1, p2] }, p2, '2026-10-20', 100000);
    const tipos = libro([p1, c2], '2026-10-25').movs.map(m => m.tipo + ':' + m.credito_id);
    assert.ok(tipos.includes('pago:p1'), 'el primero, pagado de verdad, sí paga');
    assert.ok(!tipos.includes('recurrencia:p2'), 'le pagó la recurrencia de un crédito que se cerró perdiendo 200.000');
  });

  test('lo de antes no cambia: si devolvió todo el capital (el perdón fue de mora y costo), el asesor cobra como siempre', () => {
    const cerrado = cerrar({ socios: [S], prestamos: [primero()] }, primero(), '2026-10-20', 330000);
    assert.equal(P.perdidaDelCierre(cerrado), 0, 'precondición: sin pérdida de capital');
    const L = libro([cerrado], '2026-11-05');
    assert.ok(L.movs.some(m => m.tipo === 'pago' && m.fecha === '2026-10-20'));
    assert.ok(!L.movs.some(m => m.tipo === 'castigo_mora'), 'se cerró el día 5 de mora: no hay castigo');
    assert.equal(L.desbloquear.puede, true);
  });
});

/* ==========================================================================
 * 2. LA GARANTÍA POR REFERIDO
 * ======================================================================== */
describe('2 · un referido que no pagó no le suma cupo a quien lo trajo', () => {
  const R = { id: 'sR', numero: 1, nombre: 'Padrino Inventado', telefono: '3000000010', gestiones: [] };
  const X = { id: 'sX', numero: 2, nombre: 'Referido Inventado', telefono: '3000000011', gestiones: [], referidoPor: 'sR' };
  /* El padrino ya se ganó garantía pagando un crédito: el tope de los referidos no muerde. */
  const delPadrino = () => pagarTodo(quincenal({ id: 'pR', numero: 1, socioId: 'sR', socioNombre: R.nombre, capital: 300000,
    fechaDesembolso: '2026-09-01', cicloActual: '2026-09-15' }), '2026-09-15');
  const delReferido = () => quincenal({ id: 'pX', numero: 2, socioId: 'sX', socioNombre: X.nombre, capital: 300000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
  const db = (...ps) => ({ socios: [copia(R), copia(X)], prestamos: ps, respaldados: [], config: {}, contadores: {} });

  test('el referido cerrado con $0: no cuenta como «ya pagó», y el cupo del padrino no sube', () => {
    const antes = db(delPadrino(), delReferido());
    const despues = db(delPadrino(), cerrar(antes, delReferido(), '2026-10-20', 0));
    const paq = P.migrarSocio(despues, despues.socios[0], '2026-10-21');
    assert.equal(paq.referidos.pagaron, 0, '«Trajiste a alguien» de un referido que no pagó nada');
    assert.equal(paq.garantia.referidos, 0, 'le acuñó 5.000 de garantía con plata que no entró');
    assert.equal(P.cupoDelSocio(despues, despues.socios[0]).cupo, P.cupoDelSocio(antes, antes.socios[0]).cupo,
      'el cupo del padrino subió por un referido que no pagó');
    assert.equal(P.referidosDe(despues, despues.socios[0])[0].pago, false);
  });

  test('«Tu gente» del celular cuenta con la misma vara: ni «pagó su gente» ni los 2.000 de la simulación', () => {
    /* Sin esto, la tarjeta diría «Créditos que pagó su gente: 1» al lado de
       «Garantía por referidos: $0»: dos cifras de créditos distintos. */
    const antes = db(delPadrino(), delReferido());
    const despues = db(delPadrino(), cerrar(antes, delReferido(), '2026-10-20', 0));
    const p = G.tuGente(despues, { hoy: '2026-10-21' }).padrinos.find(x => x.id === 'sR');
    assert.equal(p.garantia_acreditada, 0, 'precondición: el motor no le acredita nada');
    assert.equal(p.pagaron, 0, '«Tu gente» contó como pagado un crédito cerrado con $0');
    assert.equal(p.creditos_pagados, 0);
    assert.equal(p.simulacion, 0, 'la simulación le sumó 2.000 por un crédito que no se pagó');
    const bien = db(delPadrino(), cerrar(antes, delReferido(), '2026-10-15', 320000));
    const q = G.tuGente(bien, { hoy: '2026-10-21' }).padrinos.find(x => x.id === 'sR');
    assert.deepEqual([q.pagaron, q.creditos_pagados, q.garantia_acreditada], [1, 1, M.GARANTIA_POR_REFERIDO]);
  });

  test('lo de antes no cambia: el referido que devolvió el capital (con el costo perdonado) sí suma', () => {
    const antes = db(delPadrino(), delReferido());
    const despues = db(delPadrino(), cerrar(antes, delReferido(), '2026-10-15', 320000));
    const paq = P.migrarSocio(despues, despues.socios[0], '2026-10-21');
    assert.equal(paq.referidos.pagaron, 1);
    assert.equal(paq.garantia.referidos, M.GARANTIA_POR_REFERIDO);
    assert.equal(P.cupoDelSocio(despues, despues.socios[0]).cupo,
      P.cupoDelSocio(antes, antes.socios[0]).cupo + M.GARANTIA_POR_REFERIDO);
  });
});

/* ==========================================================================
 * 3. LA PUNTUALIDAD, LAS INSIGNIAS Y LAS CIFRAS DEL GRUPO
 * ======================================================================== */
describe('3 · un cierre con pérdida no es un pago en fecha', () => {
  const SO = { id: 's1', numero: 1, nombre: 'Prueba Inventada' };
  const cartera = (...ps) => ({ socios: [copia(SO)], prestamos: ps, respaldados: [], config: {}, contadores: {} });
  const a = () => pagarTodo(quincenal({ id: 'a', numero: 1, socioId: 's1', socioNombre: SO.nombre, capital: 300000,
    fechaDesembolso: '2026-09-01', cicloActual: '2026-09-15' }), '2026-09-15');
  const b = () => pagarTodo(quincenal({ id: 'b', numero: 2, socioId: 's1', socioNombre: SO.nombre, capital: 300000,
    fechaDesembolso: '2026-09-16', cicloActual: '2026-09-30' }), '2026-09-30');
  const tercero = () => quincenal({ id: 'c', numero: 3, socioId: 's1', socioNombre: SO.nombre, capital: 300000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });

  test('dos pagados en fecha y el tercero cerrado con $0 el día del corte: racha 0, dos a tiempo, y el paquete lo dice', () => {
    const c = cerrar(cartera(a(), b(), tercero()), tercero(), '2026-10-15', 0);
    const db = cartera(a(), b(), c);
    const paq = P.migrarSocio(db, db.socios[0], '2026-10-16');
    assert.equal(P.esPuntual(c), false, 'un crédito que no se pagó salió «pagado en fecha»');
    assert.equal(P.estadoParaNivel(c, '2026-10-16'), 'rompe');
    assert.equal(paq.garantia.racha, 0, 'la racha contó un crédito que no se pagó');
    assert.equal(paq.garantia.pagados_a_tiempo, 2);
    /* Igual que si siguiera abierto y vencido: dejarlo sin pagar no puede valer más que perdonárselo. */
    const abierto = cartera(a(), b(), tercero());
    assert.equal(P.migrarSocio(abierto, abierto.socios[0], '2026-10-16').garantia.racha, 0);
    const cr = paq.creditos.find(x => x.codigo === 'CR-0003');
    assert.equal(cr.pagado, true);
    assert.equal(cr.cerrado_con_perdida, true, 'la app no tiene cómo saber que no fue un pago');
    assert.equal(paq.creditos.find(x => x.codigo === 'CR-0001').cerrado_con_perdida, false);
    /* Las cifras del grupo, que ven todos los clientes. */
    const g = P.fotoComunidad(db);
    assert.equal(g.creditos_pagados, 2, '«Créditos pagados» del grupo contó uno que no se pagó');
    assert.equal(g.puntualidad, 100);
  });

  test('la garantía no cambia con el arreglo: el cierre con pérdida sigue sin dejar nada', () => {
    const c = cerrar(cartera(a(), b(), tercero()), tercero(), '2026-10-15', 0);
    assert.equal(P.garantiaGanadaCredito(c), 0);
    const r = P.cierreConPerdon(cartera(a(), b(), tercero()), tercero(), '2026-10-15', 250000, SI);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.garantia, 0);
  });

  test('lo de antes no cambia: devolvió el capital con parte del costo perdonado, en la fecha: cuenta como en fecha', () => {
    const c = cerrar(cartera(a(), b(), tercero()), tercero(), '2026-10-15', 330000);
    const db = cartera(a(), b(), c);
    const paq = P.migrarSocio(db, db.socios[0], '2026-10-16');
    assert.equal(P.esPuntual(c), true);
    assert.equal(paq.garantia.racha, 3);
    assert.equal(paq.garantia.pagados_a_tiempo, 3);
    assert.equal(P.fotoComunidad(db).creditos_pagados, 3);
  });
});

/* ==========================================================================
 * 4. LA LISTA DE CRÉDITOS DEL CRM
 * ======================================================================== */
const SOCIO = { id: 's1', numero: 1, nombre: 'Marta Gómez', telefono: '3001234567', gestiones: [] };
function crmCon(ahora, socios, prestamos) {
  const P2 = abrirPanel({ ahora });
  P2.cargarCartera({ socios: copia(socios), prestamos: copia(prestamos), config: { negocio: 'Tu Garantía' } });
  return P2;
}
const celdas = fila => [...String(fila).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => texto(m[1]));
function filaDe(html, codigo) {
  const f = String(html).split('<tr>').find(x => x.indexOf('>' + codigo + '<') >= 0);
  assert.ok(f, 'no encontré la fila de ' + codigo);
  return celdas(f);
}

describe('4 · Créditos: la columna «Capital» de un crédito cerrado con pérdida dice lo prestado, y la pérdida con su nombre', () => {

  test('a cuotas de 650.000 cerrado con 500.000 y quincenal de 300.000 cerrado con 250.000', () => {
    const q0 = quincenal({ id: 'p1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre, capital: 300000,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
    const c0 = aCuotas({ id: 'p2', numero: 2, socioId: 's1', socioNombre: SOCIO.nombre });
    const db = { socios: [SOCIO], prestamos: [q0, c0] };
    const q = cerrar(db, q0, '2026-10-20', 250000);
    const c = cerrar(db, c0, '2026-10-30', 500000);
    assert.deepEqual([P.perdidaDelCierre(q), P.perdidaDelCierre(c)], [50000, 150000], 'precondición');
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [q, c]);
    CRM.ev('renderCred()');
    const html = CRM.elems.tblCred.innerHTML;
    const cuotas = filaDe(html, 'CR-0002')[2], quinc = filaDe(html, 'CR-0001')[2];
    assert.match(cuotas, /^\$650\.000 /, 'la columna «Capital» dijo el capital perdido como si fuera una deuda viva: ' + cuotas);
    assert.match(cuotas, /prestado/);
    assert.match(cuotas, /\$150\.000 perdido/);
    assert.match(quinc, /^\$300\.000 /);
    assert.match(quinc, /\$50\.000 perdido/);
    /* El pie suma lo que dice la columna: lo prestado, no la pérdida. */
    const pie = celdas(html.slice(html.indexOf('<tfoot>')));
    assert.equal(pie[1], '$950.000');
    /* Y el detalle del crédito dice la misma cifra de capital que la lista. */
    CRM.ev("verCredito('p2')");
    assert.match(texto(CRM.elems.mBody.innerHTML), /Capital prestado \$650\.000/);
  });

  test('el tablero: «% Recuperación de cuentas» (créditos pagados / total) no cuenta el cerrado con pérdida', () => {
    const pagado = pagarTodo(quincenal({ id: 'p1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre, capital: 200000,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' }), '2026-10-15');
    const q0 = quincenal({ id: 'p2', numero: 2, socioId: 's1', socioNombre: SOCIO.nombre, capital: 300000,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
    const perdido = cerrar({ socios: [SOCIO], prestamos: [pagado, q0] }, q0, '2026-10-20', 0);
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [pagado, perdido]);
    assert.equal(CRM.ev('pctRecuperacionCuentas()'), 50, 'contó como cuenta recuperada un crédito cerrado con $0');
  });

  test('lo de antes no cambia: un crédito abierto dice su capital pendiente, y uno pagado entero lo de siempre', () => {
    const abierto = quincenal({ id: 'p1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre, capital: 300000,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31' });
    const pagado = pagarTodo(quincenal({ id: 'p2', numero: 2, socioId: 's1', socioNombre: SOCIO.nombre, capital: 200000,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' }), '2026-10-15');
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [abierto, pagado]);
    CRM.ev('renderCred()');
    const html = CRM.elems.tblCred.innerHTML;
    assert.equal(filaDe(html, 'CR-0001')[2], '$300.000');
    assert.equal(filaDe(html, 'CR-0002')[2], '$200.000');
    assert.equal(celdas(html.slice(html.indexOf('<tfoot>')))[1], '$500.000');
  });
});

/* ==========================================================================
 * 5. EL RIESGO SUGERIDO DEL CRM
 * ======================================================================== */
/* 31-oct-2026 (segunda revisión) — el primer arreglo decía «el perdón no se lo
   baja» y lo dejaba en Alto con la mora del día del cierre, para siempre. Era
   la marca en el cliente que Joan decidió no ponerle (decisión 4 del 30-oct:
   «no se le bloquea ni se le pone aviso para créditos nuevos; solo queda
   anotado en el crédito y en los informes»), y el «Alto» sale en Clientes y en
   la ficha, al lado de «＋ Nuevo crédito». El cierre con pérdida cuenta como
   el crédito pagado tarde: deja de pesar. */
describe('5 · «Riesgo (sugerido)»: el cierre con pérdida no marca al cliente (decisión 4)', () => {
  const LUCIA = { id: 's3', numero: 3, nombre: 'Lucía Ejemplo Vargas', telefono: '3001110003', gestiones: [] };
  /* Vencía el 15-oct: el 31-oct lleva 16 días de mora, sin prórrogas. */
  const vencido = () => quincenal({ id: 'pX', numero: 14, socioId: 's3', socioNombre: LUCIA.nombre, capital: 200000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
  /* Y otro crédito abierto, a cuotas, cuya cuota vence hoy. */
  const otro = () => {
    const plan = M.construirPlanACuotas(300000, [{ fecha: '2026-10-31', pct: 20 }, { fecha: '2026-11-13', pct: 20 }],
      { fechaDesembolso: '2026-10-16' });
    return { id: 'pY', numero: 15, socioId: 's3', socioNombre: LUCIA.nombre, capital: 300000, costoPct: 20,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31', prorrogas: [], abonosCapital: [], comprobantes: [],
      pagado: false, planPagos: P.planPagosDeAlta(plan) };
  };
  const HOY = '2026-10-31T10:30:00';
  const riesgo = CRM => JSON.parse(CRM.ev('JSON.stringify(riesgoCliente(DB.socios[0]))'));

  test('Lucía con 16 días de mora es Alto; cerrarle el crédito con $0 la deja como pagarlo tarde (Bajo), y lo perdido sigue en su ficha', () => {
    const antes = crmCon(HOY, [LUCIA], [vencido(), otro()]);
    assert.equal(riesgo(antes).txt, 'Alto', 'precondición');
    const db = { socios: [LUCIA], prestamos: [vencido(), otro()] };
    const cerrado = cerrar(db, vencido(), '2026-10-31', 0);
    const CRM = crmCon(HOY, [LUCIA], [cerrado, otro()]);
    const tarde = crmCon(HOY, [LUCIA], [pagarTodo(vencido(), '2026-10-31'), otro()]);
    assert.deepEqual(riesgo(CRM), riesgo(tarde), 'el cierre con pérdida le puso una marca que pagar tarde no pone');
    assert.equal(riesgo(CRM).txt, 'Bajo');
    /* La ficha no le cuelga un aviso al riesgo, y lo perdido sigue anotado. */
    CRM.ev("verCliente('s3')");
    const ficha = texto(CRM.elems.mBody.innerHTML);
    assert.match(ficha, /Riesgo \(sugerido\) Bajo/);
    assert.doesNotMatch(ficha, /se cerró con pérdida de capital a los/);
    assert.match(ficha, /Capital perdido con él \$200\.000/, 'lo perdido tiene que seguir en la ficha (decisión 5)');
  });

  test('cerrado con pérdida en mayo y después tres créditos pagados en fecha: Bajo, como el que lo pagó entero y tarde', () => {
    /* La medida de la segunda revisión: a los 16 días perdiendo 50.000, y a
       los 6 días perdiendo solo 1.000. Antes del arreglo, los dos «Alto» para
       siempre; pagado entero con 16 días de atraso, «Bajo». */
    const de = o => quincenal(Object.assign({ socioId: 's3', socioNombre: LUCIA.nombre, capital: 200000 }, o));
    const mayo = () => de({ id: 'v', numero: 1, fechaDesembolso: '2026-05-01', cicloActual: '2026-05-15' });
    const bien = [['b1', 2, '2026-06-01', '2026-06-15'], ['b2', 3, '2026-07-01', '2026-07-15'], ['b3', 4, '2026-08-01', '2026-08-15']]
      .map(([id, n, d, c]) => pagarTodo(de({ id, numero: n, fechaDesembolso: d, cicloActual: c }), c));
    const db = { socios: [LUCIA], prestamos: [mayo()] };
    const a16 = cerrar(db, mayo(), '2026-05-31', 150000);
    const a6 = cerrar(db, mayo(), '2026-05-21', 199000);
    assert.deepEqual([P.perdidaDelCierre(a16), P.perdidaDelCierre(a6)], [50000, 1000], 'precondición');
    assert.equal(riesgo(crmCon(HOY, [LUCIA], [pagarTodo(mayo(), '2026-05-31'), ...bien])).txt, 'Bajo', 'precondición');
    assert.equal(riesgo(crmCon(HOY, [LUCIA], [a16, ...bien])).txt, 'Bajo',
      'perder capital a los 16 días la dejó en Alto para siempre, aunque después pagara tres en fecha');
    assert.equal(riesgo(crmCon(HOY, [LUCIA], [a6, ...bien])).txt, 'Bajo',
      'perder 1.000 a los 6 días pesó más que pagar todo con 16 días de atraso');
  });

  test('lo de antes no cambia: si pagó todo, aunque tarde, el riesgo baja como siempre', () => {
    const CRM = crmCon(HOY, [LUCIA], [pagarTodo(vencido(), '2026-10-31'), otro()]);
    assert.equal(riesgo(CRM).txt, 'Bajo');
  });

  test('sin marca nueva: un cierre con pérdida a los 3 días de mora no la vuelve Alto (no lo era)', () => {
    const corto = quincenal({ id: 'pX', numero: 14, socioId: 's3', socioNombre: LUCIA.nombre, capital: 200000,
      fechaDesembolso: '2026-10-13', cicloActual: '2026-10-28' });
    assert.equal(riesgo(crmCon(HOY, [LUCIA], [corto, otro()])).txt, 'Bajo', 'precondición');
    const cerrado = cerrar({ socios: [LUCIA], prestamos: [corto, otro()] }, corto, '2026-10-31', 0);
    assert.equal(riesgo(crmCon(HOY, [LUCIA], [cerrado, otro()])).txt, 'Bajo');
  });
});

/* ==========================================================================
 * 6. LA APP DEL CLIENTE: HISTORIAL E INSIGNIAS
 * ======================================================================== */
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
function carteraApp(prestamos) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Clienta Cuotas', cedula: '52111222', telefono: '3001112233',
               whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }],
    prestamos, config: { negocio: 'Tu Garantía' }
  };
}
/* La app arrancada de verdad, con el paquete del día guardado en el teléfono
   (el camino sin red), como en credito-a-cuotas-socio.test.js. Devuelve el
   HTML del Historial. */
async function historialDe(prestamos, dia) {
  const db = carteraApp(prestamos);
  const paquete = P.migrarSocio(db, db.socios[0], dia);
  const ahora = new Date(dia + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000,
    celular: '3001112233', paquete: { nombre: 'Clienta Cuotas', datos: paquete,
      actualizado_en: dia + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  A.ev("irA('historial')");
  return A.elem('cuerpo').innerHTML;
}
/* La tarjeta de UN crédito en el Historial, en texto: cada una es un
   <div class="credito"> con su código adentro. */
function tarjeta(html, codigo) {
  const t = String(html).split('<div class="credito">').find(x => x.indexOf('>' + codigo + '<') >= 0);
  assert.ok(t, 'no está ' + codigo + ' en el historial');
  const k = t.indexOf('class="gan"'), fin = k >= 0 ? t.indexOf('</div>', k) : -1;
  return plano(fin >= 0 ? t.slice(0, fin) : t);
}

describe('6 · la app del cliente no dice «pagado» de lo que no se pagó', () => {

  test('cerrado con $50.000 el día del corte: «Cerrado», sin garantía prometida, racha 0 y sin la insignia', async () => {
    const p = quincenal({ id: 'pZ', numero: 9, socioId: 's1', socioNombre: 'Clienta Cuotas', capital: 200000,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31' });
    const c = cerrar(carteraApp([p]), p, '2026-10-31', 50000);
    const html = await historialDe([c], '2026-11-01'), h = plano(html);
    const t = tarjeta(html, 'CR-0009');
    assert.match(t, /Cerrado/);
    assert.doesNotMatch(t, /Pagado en fecha/, 'la app le dijo «Pagado en fecha» de un crédito que no pagó');
    assert.doesNotMatch(t, /al pagarlo/, 'prometió garantía «al pagarlo» de un crédito ya cerrado');
    assert.match(t, /Garantía que te dejó \$ ?0/);
    assert.match(h, /Pagos en fecha seguidos 0/);
    assert.doesNotMatch(h, /✅ Primer pago en fecha/, 'le dio «Primer pago en fecha» por un crédito que no pagó');
  });

  test('a cuotas cerrado con pérdida: no dice «2 de 2 cuotas pagadas»; el pagado de verdad sigue «Pagado en fecha»', async () => {
    const c0 = aCuotas({ id: 'pC', numero: 7, socioId: 's1', socioNombre: 'Clienta Cuotas' });
    const cuotas = cerrar(carteraApp([c0]), c0, '2026-10-30', 500000);
    const bueno = pagarTodo(quincenal({ id: 'pB', numero: 3, socioId: 's1', socioNombre: 'Clienta Cuotas',
      capital: 200000, fechaDesembolso: '2026-09-01', cicloActual: '2026-09-15' }), '2026-09-15');
    const html = await historialDe([bueno, cuotas], '2026-11-01'), h = plano(html);
    const tc = tarjeta(html, 'CR-0007');
    assert.match(tc, /Cerrado/);
    assert.match(tc, /a cuotas/);
    assert.doesNotMatch(tc, /cuotas pagadas/, 'contó como pagadas las cuotas de un crédito que perdió 150.000 de capital');
    assert.doesNotMatch(tc, /Pagado/);
    const tb = tarjeta(html, 'CR-0003');
    assert.match(tb, /Pagado en fecha/);
    assert.match(tb, /Garantía que te dejó \+\$/);
    assert.match(h, /✅ Primer pago en fecha/, 'el pago de verdad perdió su insignia');
  });

  test('PlataChat, que lee el mismo paquete, dice lo mismo: «Cerrado», no «Pagado en fecha»', () => {
    /* platachat/index.html tiene su propia tarjeta de créditos (tarjetaHistorial,
       recortada de la de socio.html): se corre tal cual, con el paquete del puente. */
    const fuente = fs.readFileSync(path.join(RAIZ, 'platachat', 'index.html'), 'utf8');
    const i = fuente.indexOf('\nfunction tarjetaHistorial('), j = fuente.indexOf('\nfunction ', i + 1);
    assert.ok(i >= 0 && j > i, 'no encontré tarjetaHistorial en platachat/index.html');
    const p = quincenal({ id: 'pZ', numero: 9, socioId: 's1', socioNombre: 'Clienta Cuotas', capital: 200000,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31' });
    const c = cerrar(carteraApp([p]), p, '2026-10-31', 50000);
    const db = carteraApp([c]);
    const paquete = P.migrarSocio(db, db.socios[0], '2026-11-01');
    const ctx = { S: { creditos: paquete.creditos }, COP: n => '$' + n, esc: x => String(x), fmtFecha: x => String(x) };
    vm.createContext(ctx);
    vm.runInContext(fuente.slice(i, j), ctx);
    const h = plano(vm.runInContext('tarjetaHistorial()', ctx));
    assert.match(h, /Cerrado/);
    assert.doesNotMatch(h, /Pagado en fecha/, 'PlataChat le dijo «Pagado en fecha» de un crédito que no pagó');
  });
});

/* ==========================================================================
 * 7. EL MENSAJE DESPUÉS DE CERRAR CON PÉRDIDA (segunda revisión, 31-oct-2026)
 *
 * Al cerrar con «Se lo perdoné», el CRM pregunta si le manda algo por
 * WhatsApp. Le ofrecía el recibo de siempre —«¡Recibido, Rosa! Tu pago quedó
 * registrado… muchas gracias por tu cumplimiento»— con $0 entregados. Y el
 * celular, en la tanda «Pagaron ayer», le mandaba lo mismo a todo crédito
 * cerrado ayer. Con pérdida de capital no hubo pago: le toca 'cierre' («tu
 * crédito quedó cerrado: de ese crédito ya no nos debes nada»). Sin pérdida
 * (lo perdonado fue mora o costo) el recibo es el de siempre.
 * ======================================================================== */
const { abrirEspejo } = require('./banco-espejo.js');

describe('7 · después de cerrar con pérdida no se le agradece un pago que no hizo', () => {
  const ROSA = { id: 's7', numero: 7, nombre: 'Rosa Inventada', telefono: '3001110007', gestiones: [] };
  /* El CRM con la hoja de cobro de verdad, diciéndole que SÍ a todo (también
     al WhatsApp: el banco no abre ventanas, solo pinta la de gestión). */
  function cerrarEnLaHoja(credito, fecha, monto, capitalQuePierde) {
    const CRM = abrirPanel({ ahora: fecha + 'T10:30:00' });
    CRM.cargarCartera({ socios: [copia(ROSA)], prestamos: [copia(credito)], config: { negocio: 'Tu Garantía' } });
    CRM.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return true; }');
    const id = credito.id, poner = (k, v) => CRM.ev("document.getElementById('" + k + "').value=" + JSON.stringify(String(v)));
    CRM.ev("abrirPago('" + id + "')"); poner('pgFecha', fecha); CRM.ev("calcPago('" + id + "')");
    poner('pgMonto', monto); CRM.ev("cambioMonto('" + id + "')");
    CRM.ev("modoCobro('" + id + "','perdon')");
    CRM.ev("_cobro.motivo='se fue de la ciudad';_cobro.entiende=" + capitalQuePierde + ";pintarBoton('" + id + "')");
    CRM.ev("registrarCobro('" + id + "')");
    const p = JSON.parse(CRM.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.pagado, true, 'precondición: no se cerró el crédito');
    assert.equal(p.capitalPerdido, capitalQuePierde, 'precondición: el capital perdido');
    const html = String(CRM.elems.mBody.innerHTML);
    const m = html.match(/<textarea id="gTexto">([\s\S]*?)<\/textarea>/);
    return { CRM, preguntas: JSON.parse(CRM.ev('JSON.stringify(__vistos)')), titulo: CRM.elems.mTitle.textContent,
      mensaje: m ? m[1] : '', elegida: (html.match(/<option value="(\w+)" selected>/) || [])[1] };
  }
  const deRosa = o => quincenal(Object.assign({ id: 'r1', numero: 1, socioId: 's7', socioNombre: ROSA.nombre, capital: 200000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' }, o));

  test('cerrado con $0 a los 16 días de mora: el WhatsApp que ofrece dice que quedó cerrado, sin «pago» ni «cumplimiento»', () => {
    const r = cerrarEnLaHoja(deRosa(), '2026-10-31', 0, 200000);
    const pregunta = r.preguntas[r.preguntas.length - 1];
    assert.match(pregunta, /perdiste \$200\.000 de capital/);
    assert.match(pregunta, /¿Avisarle por WhatsApp que el crédito quedó cerrado\?/);
    assert.doesNotMatch(pregunta, /recibo/, 'le ofreció «el recibo» de un pago que no hubo');
    assert.equal(r.titulo, 'Gestionar · Rosa Inventada');
    assert.equal(r.elegida, 'cierre');
    assert.match(r.mensaje, /tu crédito de \$200\.000 que recibiste el 01 de oct de 2026 quedó cerrado: de ese crédito ya no nos debes nada/,
      'la segunda ronda: con varios créditos, «tu crédito quedó cerrado» sin decir cuál se lee como que ya no debe nada');
    assert.doesNotMatch(r.mensaje, /pago|cumplimiento|Recibido/i,
      'le ofreció mandarle «Tu pago quedó registrado… gracias por tu cumplimiento» a quien entregó $0: ' + r.mensaje);
  });

  test('dos cierres de la misma clienta no proponen el mismo texto, y no queda ninguna llave suelta', () => {
    const a = cerrarEnLaHoja(deRosa(), '2026-10-31', 0, 200000);
    const b = cerrarEnLaHoja(deRosa({ id: 'r9', numero: 9, capital: 350000, fechaDesembolso: '2026-10-05' }), '2026-10-31', 0, 350000);
    assert.notEqual(a.mensaje, b.mensaje);
    assert.match(b.mensaje, /tu crédito de \$350\.000 que recibiste el 05 de oct de 2026 quedó cerrado/);
    assert.doesNotMatch(a.mensaje + b.mensaje, /\{[a-z_]+\}/, 'quedó una llave sin contestar');
    const CRM = crmCon('2026-10-31T10:30:00', [ROSA], []);
    assert.deepEqual(JSON.parse(CRM.ev("JSON.stringify(tokensSueltos(PLANTILLAS_DEF.cierre.m,'cierre'))")), []);
    /* La de fábrica que ya quedó guardada en un disco se pone al día; una escrita por Joan, no. */
    const V = abrirPanel({ ahora: '2026-10-31T10:30:00' });
    V.cargarCartera({ socios: [], prestamos: [], plantillas: { cierre: V.ev('CIERRE_SIN_CREDITO') } });
    assert.match(V.ev('DB.plantillas.cierre'), /\{credito\}/);
    const W = abrirPanel({ ahora: '2026-10-31T10:30:00' });
    W.cargarCartera({ socios: [], prestamos: [], plantillas: { cierre: 'Hola {nombre}, lo mío' } });
    assert.equal(W.ev('DB.plantillas.cierre'), 'Hola {nombre}, lo mío');
  });

  test('el celular contesta {credito} igual que el computador', () => {
    const c = cerrar({ socios: [ROSA], prestamos: [deRosa()] }, deRosa(), '2026-10-31', 0);
    const E = abrirEspejo({ ahora: '2026-10-31T10:30:00', cartera: { socios: [copia(ROSA)], prestamos: [c], respaldados: [],
      config: { negocio: 'Tu Garantía' }, contadores: { cliente: 7, credito: 1, respaldado: 0 }, plantillas: {} } });
    assert.equal(E.ev("aplicarVars('tu crédito {credito} quedó cerrado', creditoPorId('r1'), {nombre:'Rosa'})"),
      'tu crédito de $200.000 que recibiste el 01 de oct de 2026 quedó cerrado');
  });

  test('a cuotas cerrado con 500.000 de 650.000: tampoco es un pago, y el mensaje es el mismo', () => {
    const c = aCuotas({ id: 'r2', numero: 2, socioId: 's7', socioNombre: ROSA.nombre });
    const r = cerrarEnLaHoja(c, '2026-11-05', 500000, 150000);
    assert.equal(r.elegida, 'cierre');
    assert.doesNotMatch(r.mensaje, /pago|cumplimiento/i, r.mensaje);
  });

  test('lo de antes no cambia: si devolvió todo el capital (el perdón fue de mora y costo), el recibo es el de siempre', () => {
    const c = aCuotas({ id: 'r3', numero: 3, socioId: 's7', socioNombre: ROSA.nombre });
    const r = cerrarEnLaHoja(c, '2026-11-05', 700000, 0);
    assert.match(r.preguntas[r.preguntas.length - 1], /¿Enviar recibo por WhatsApp\?/);
    assert.equal(r.elegida, 'recibo');
    assert.match(r.mensaje, /Tu pago quedó registrado/);
  });

  test('plantillaPara, la que decide en el CRM: «cierre» para el cerrado con pérdida, «recibo» para el pagado', () => {
    const perdido = cerrar({ socios: [ROSA], prestamos: [deRosa()] }, deRosa(), '2026-10-31', 0);
    const pagado = pagarTodo(deRosa({ id: 'r4', numero: 4 }), '2026-10-15');
    const sinPerdida = cerrar({ socios: [ROSA], prestamos: [deRosa({ id: 'r5', numero: 5 })] },
      deRosa({ id: 'r5', numero: 5 }), '2026-10-20', 210000);
    assert.equal(P.perdidaDelCierre(sinPerdida), 0, 'precondición: devolvió todo el capital');
    const CRM = crmCon('2026-10-31T10:30:00', [ROSA], [perdido, pagado, sinPerdida]);
    const k = id => CRM.ev("plantillaPara(DB.prestamos.find(function(p){return p.id==='" + id + "'}))");
    assert.equal(k('r1'), 'cierre', 'al cerrado con pérdida le tocaba el recibo de «gracias por tu cumplimiento»');
    assert.equal(k('r4'), 'recibo');
    assert.equal(k('r5'), 'recibo');
  });

  test('el celular: «Pagaron ayer» no le agradece a quien cerró ayer con pérdida, y su gestión le da «cierre»', () => {
    const LUCIA7 = { id: 's8', numero: 8, nombre: 'Lucía Inventada', telefono: '3001110008', gestiones: [] };
    const perdido = cerrar({ socios: [ROSA], prestamos: [deRosa()] }, deRosa(), '2026-10-30', 50000);
    const pagado = pagarTodo(quincenal({ id: 'l1', numero: 2, socioId: 's8', socioNombre: LUCIA7.nombre, capital: 200000,
      fechaDesembolso: '2026-10-15', cicloActual: '2026-10-30' }), '2026-10-30');
    const E = abrirEspejo({ ahora: '2026-10-31T10:30:00', cartera: { socios: [copia(ROSA), copia(LUCIA7)],
      prestamos: [perdido, pagado], respaldados: [], config: { negocio: 'Tu Garantía' },
      contadores: { cliente: 8, credito: 2, respaldado: 0 }, plantillas: {} } });
    assert.deepEqual(E.json("casosDelGrupo('pagaron-ayer').map(function (c) { return c.id; })"), ['l1'],
      '«Pagaron ayer» le iba a mandar «gracias por tu cumplimiento» a un crédito cerrado con pérdida');
    assert.equal(E.ev("plantillaPara(creditoPorId('r1'))"), 'cierre');
    assert.equal(E.ev("plantillaPara(creditoPorId('l1'))"), 'recibo');
  });
});

/* ==========================================================================
 * 6-bis. 4-NOV-2026 — EL TERCER CAMINO: EL EQUIPO. La pregunta de después de
 * cerrar (CRM) y la tanda del celular ya no dicen «gracias por tu cumplimiento»
 * (sección de la segunda revisión). Pero el 📲 de asesor y gerente abría con
 * «Confirmarle que pagó» marcada para todo el que cerró, hasta con $0.
 * ======================================================================== */
describe('6-bis · Lo que el equipo le propone decirle a quien cerró su crédito', () => {
  function crmDelEquipo() {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], []);
    CRM.ev("CARTERA_EQUIPO = { yo: { nombre: 'Ana Inventada', rol: 'asesor' }, gente: [] }");
    return CRM;
  }

  test('el 📲 no dice que pagó ni que cumplió, y el chip tampoco', () => {
    const CRM = crmDelEquipo();
    CRM.ev("pantallaMensajeEq({ id: 's1', etapa: 'PAGADO', nombre: 'Marta Inventada', celular: '3000000001' })");
    const t = texto(CRM.elems.mBody.innerHTML);
    assert.doesNotMatch(t, /registrado tu pago|Gracias por cumplir/, 'el asesor tiene listo para enviar un pago que no existió: ' + t);
    assert.doesNotMatch(t, /Confirmarle que pagó/);
    assert.doesNotMatch(t, /PAGADO/, 'el chip le dice PAGADO a quien entregó $0');
    assert.match(t, /Marta/);
    assert.match(t, /tu crédito quedó cerrado/);
    assert.match(t, /Ofrécele el siguiente/, 'sin marca en el cliente: se le sigue ofreciendo el siguiente');
  });

  test('«Toda tu base» los llama por lo que se sabe, y el servidor sigue recibiendo la misma llave', () => {
    const E = require(path.join(RAIZ, 'app', 'etapas.js'));
    assert.doesNotMatch(E.ETAPAS.PAGADO.nombre, /Pag/, 'cuenta como «Pagó» a quien cerró con $0');
    const db = { prestamos: [cerrar({ socios: [SOCIO], prestamos: [] }, quincenal({ id: 'p9', socioId: 's1', capital: 200000,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' }), '2026-10-31', 0)] };
    /* La llave no cambia: base/20260922q la compara, y una etapa desconocida
       caería del lado del cobro. */
    assert.equal(E.etapaDe({ tipo: 'socio', id: 's1' }, db, '2026-10-31'), 'PAGADO');
  });

  test('el ✉️ no le recuerda «tu pago de $0» a quien ya no debe nada', () => {
    const CRM = crmDelEquipo();
    assert.equal(CRM.ev("plantillaSMSDe('PAGADO')"), 'invitacion');
    assert.equal(CRM.ev("plantillaSMSDe('D-1')"), 'recordatorio1', 'a quien sí debe se le sigue recordando');
  });
});

/* ==========================================================================
 * 7. 3-NOV-2026 — LO QUE JOAN LEE DE UN CIERRE CON PÉRDIDA: tres frases que
 * quedaron de la revisión del 31-oct, y las tres afirmaban algo falso.
 * ======================================================================== */
describe('7 · Lo que Joan lee de un cierre con pérdida', () => {
  const credito = () => quincenal({ id: 'p7', numero: 7, socioId: 's1', socioNombre: SOCIO.nombre, capital: 300000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
  const cerrado = monto => cerrar({ socios: [SOCIO], prestamos: [credito()] }, credito(), '2026-10-31', monto);

  test('el Calendario no dice que entró plata que no entró', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(250000)]);
    CRM.ev("verDia('2026-10-31')");
    const t = texto(CRM.elems.mBody.innerHTML);
    assert.match(t, /\$250\.000 de \$300\.000 · cerrado perdiendo \$50\.000/, 'el Calendario dijo otra cosa: ' + t);
    assert.doesNotMatch(t, /\$300\.000 \+ ganancia/, 'dijo que entraron los 300.000');
  });

  test('un pago de verdad sigue diciendo lo de siempre en el Calendario', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    CRM.ev("verDia('2026-10-31')");
    assert.match(texto(CRM.elems.mBody.innerHTML), /\$300\.000 \+ ganancia/);
  });

  test('«Pagado» no sale de un crédito cerrado con pérdida; de uno pagado, sí', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(0)]);
    assert.equal(CRM.ev('textoEstado(DB.prestamos[0])'), 'Cerrado con pérdida');
    CRM.ev("verCredito('p7')");
    assert.match(texto(CRM.elems.mBody.innerHTML), /Estado Cerrado con pérdida/);
    const OTRO = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    assert.equal(OTRO.ev('textoEstado(DB.prestamos[0])'), 'Pagado');
  });

  /* 4-nov-2026 — ee7c3cc cambió la columna y el Estado; quedaban estos. Hasta con $0
     entregados se leía «Pagado el» justo encima de «Entró de verdad $0». */
  test('el detalle: «Cerrado el», no «Pagado el»; y el de un pago de verdad sigue igual', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(0)]);
    CRM.ev("verCredito('p7')");
    const t = texto(CRM.elems.mBody.innerHTML);
    assert.match(t, /Cerrado el 31 de oct de 2026/, 'dijo otra cosa: ' + t);
    assert.doesNotMatch(t, /Pagado el/);
    const OTRO = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    OTRO.ev("verCredito('p7')");
    assert.match(texto(OTRO.elems.mBody.innerHTML), /Pagado el 31 de oct de 2026/);
  });

  function loQuePregunta(CRM, llamada) {
    const dicho = [];
    CRM.ctx.confirm = m => { dicho.push(String(m)); return false; };
    CRM.ev(llamada);
    assert.equal(dicho.length, 1, 'no preguntó: ' + JSON.stringify(CRM.ctx._avisos || []));
    return dicho[0];
  }

  test('borrar el crédito: no pregunta por un crédito «Pagado» que se cerró con $0', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(0)]);
    assert.match(loQuePregunta(CRM, "borrarCredito('p7')"), /Estado: Cerrado con pérdida/);
    const OTRO = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    assert.match(loQuePregunta(OTRO, "borrarCredito('p7')"), /Estado: Pagado/);
  });

  test('borrar la ficha: «todos pagados» era falso, y el capital perdido también sale de los informes', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(0)]);
    const m = loQuePregunta(CRM, "borrarCliente('s1')");
    assert.doesNotMatch(m, /todos pagados/);
    assert.match(m, /Créditos en su historial \(todos cerrados\): 1/);
    assert.match(m, /Capital perdido que deja de contar en tus totales: \$300\.000/);
    const OTRO = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    const n = loQuePregunta(OTRO, "borrarCliente('s1')");
    assert.match(n, /todos pagados/);
    assert.doesNotMatch(n, /Capital perdido/);
  });

  test('el Calendario: el cierre con pérdida no va en «✓ Pagos recibidos» ni con la marca de pagado', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(0)]);
    CRM.ev('renderCalendario()');
    const celda = texto(CRM.elems.calGrid.innerHTML);
    assert.doesNotMatch(celda, /✓ Marta/, 'la celda del día marca como pagado a quien entregó $0');
    assert.match(celda, /✕ Marta/);
    CRM.ev("verDia('2026-10-31')");
    const t = texto(CRM.elems.mBody.innerHTML);
    assert.doesNotMatch(t, /Pagos recibidos/, 'lo listó como un pago recibido');
    assert.match(t, /✕ Cerrados con pérdida/);
    assert.match(t, /volvieron \$0 de \$300\.000 · cerrado perdiendo \$300\.000/);
    assert.doesNotMatch(t, /\+ ganancia/, 'un cierre con pérdida no dejó ganancia ese día');
    const hoja = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    assert.match(hoja, /class="cal-ev cer"[^>]*>●<\/span> cerrado con pérdida/, 'la leyenda no dice qué es la marca nueva');
  });

  test('el Calendario: lo que volvió antes por un abono se dice como lo que volvió en total, no como lo de ese día', () => {
    const p = credito();
    p.abonosCapital = [{ fecha: '2026-10-25', monto: 100000 }];
    const c = cerrar({ socios: [SOCIO], prestamos: [p] }, p, '2026-10-31', 0);
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [c]);
    CRM.ev("verDia('2026-10-31')");
    assert.match(texto(CRM.elems.mBody.innerHTML), /volvieron \$100\.000 de \$300\.000 · cerrado perdiendo \$200\.000/);
  });

  test('un pago de verdad sigue con su marca y bajo «✓ Pagos recibidos»', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    CRM.ev('renderCalendario()');
    assert.match(texto(CRM.elems.calGrid.innerHTML), /✓ Marta/);
    CRM.ev("verDia('2026-10-31')");
    const t = texto(CRM.elems.mBody.innerHTML);
    assert.match(t, /✓ Pagos recibidos/);
    assert.doesNotMatch(t, /Cerrados con pérdida/);
  });

  test('la tarjeta «Capital perdido» dice de qué corte es: no «ninguno» a secas el día que se perdió de otro corte', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(250000)]);
    CRM.ev('render()');
    const k = texto(CRM.elems.kpis.innerHTML);
    assert.match(k, /Capital perdido \$0 ninguno en créditos con corte del 31 oct/, 'la tarjeta dijo otra cosa: ' + k);
  });

  /* 9-nov-2026 — la segunda ronda: con la tarjeta por corte, el cierre del día casi
     nunca sale, y el total no estaba en ninguna parte. */
  test('el Tablero y los Indicadores dicen el capital perdido en total, aunque sea de otro corte', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerrado(150000)]);
    CRM.ev('render()');
    assert.match(texto(CRM.elems.kpis.innerHTML), /Capital perdido \$0 ninguno en créditos con corte del 31 oct · en total \$150\.000/);
    assert.match(texto(CRM.elems.kpis2.innerHTML), /Capital perdido \(total\) \$150\.000 histórico · 1 crédito/);
    const OTRO = crmCon('2026-10-31T10:30:00', [SOCIO], [pagarTodo(credito(), '2026-10-31')]);
    OTRO.ev('render()');
    assert.doesNotMatch(texto(OTRO.elems.kpis.innerHTML) + texto(OTRO.elems.kpis2.innerHTML), /· en total \$|Capital perdido \(total\)/, 'sin pérdida no se pinta');
    /* La misma cifra que la columna de Ciclos, sumada. */
    assert.equal(CRM.ev('capitalPerdidoTotal().capital'), P.capitalPerdidoDe(cerrado(150000)));
  });

  test('el celular también dice el total', () => {
    const E = abrirEspejo({ ahora: '2026-10-31T10:30:00', cartera: { socios: [copia(SOCIO)], prestamos: [cerrado(150000)], respaldados: [],
      config: { negocio: 'Tu Garantía' }, contadores: { cliente: 1, credito: 7, respaldado: 0 }, plantillas: {} } });
    assert.match(texto(E.ev('vistaQuincena()')), /Capital perdido en total \$150\.000/);
  });
});
/* ==========================================================================
 * 8. 9-nov-2026 — LA SEGUNDA RONDA: LO QUE QUEDABA DICIENDO «PAGADO»
 *    «🔍 Revisar la cartera» (donde Joan decide qué registro doble borrar), la
 *    galería de comprobantes y la tarjeta del choque, en el celular y en
 *    panel/subir.html.
 * ======================================================================== */
describe('8 · lo que quedaba diciendo «pagado» de un cierre con pérdida', () => {
  const credito = (id, numero, capital) => quincenal({ id, numero, socioId: 's1', socioNombre: SOCIO.nombre, capital: capital || 300000,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15' });
  const cerradoCon = (p, monto) => cerrar({ socios: [SOCIO], prestamos: [p] }, p, '2026-10-31', monto);

  test('«Revisar la cartera» dice «cerrado con pérdida», no «pagado»; un pago de verdad sigue diciendo «pagado»', () => {
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [cerradoCon(credito('a', 1), 0), pagarTodo(credito('b', 2, 200000), '2026-10-31'),
      cerradoCon(credito('c', 3, 300500), 0)]);
    CRM.ev('revisarCartera()');
    const v = texto(CRM.elems.mBody.innerHTML);
    assert.match(v, /CR-0001 \$300\.000 cerrado con pérdida/, 'el doble registro: ' + v);
    assert.match(v, /CR-0002 \$200\.000 pagado/);
    assert.doesNotMatch(v, /CR-0001 \$300\.000 pagado/);
    assert.match(v, /CR-0003 · Marta Gómez · \$300\.500 · 01 de oct de 2026 · cerrado con pérdida/, 'el monto no redondo: ' + v);
  });

  test('la galería: el comprobante de un «Se lo perdoné» no dice «Pago $0»', () => {
    const c = cerradoCon(credito('p7', 7), 0);
    c.comprobantes = [{ fecha: '2026-10-31', tipo: 'pago', monto: 0, foto: 'data:image/jpeg;base64,QQ==', id: c.condonaciones[0].id }];
    const CRM = crmCon('2026-10-31T10:30:00', [SOCIO], [c]);
    CRM.ev("verCredito('p7')");
    const v = texto(CRM.elems.mBody.innerHTML);
    assert.doesNotMatch(v, /Pago \$0/);
    assert.match(v, /Cierre con perdón \$0/);
    const pago = pagarTodo(credito('p7', 7), '2026-10-31');
    pago.comprobantes = [{ fecha: '2026-10-31', tipo: 'pago', monto: 360000, foto: 'data:image/jpeg;base64,QQ==' }];
    const OTRO = crmCon('2026-10-31T10:30:00', [SOCIO], [pago]);
    OTRO.ev("verCredito('p7')");
    assert.match(texto(OTRO.elems.mBody.innerHTML), /Pago \$360\.000/, 'un pago de verdad sigue siendo «Pago»');
  });

  /* El crédito a cuotas de la maqueta (650.000 en dos cuotas) cerrado con 300.000. */
  function cuotasCerrado() {
    const p = aCuotas({ id: 'q1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre });
    return cerrar({ socios: [SOCIO], prestamos: [p] }, p, '2026-10-31', 300000);
  }

  test('la tarjeta del choque en el celular: ni «¿Pagado? sí» ni «2 de 2 cuotas pagadas» de un cierre con pérdida', () => {
    const c = cuotasCerrado();
    assert.ok(P.cerroConPerdida(c), 'precondición: se cerró con pérdida');
    const e = abrirEspejo({ cartera: { socios: [copia(SOCIO)], prestamos: [copia(c)] }, ahora: '2026-10-31T15:00:00' });
    e.ctx.__c = copia(c);
    assert.equal(e.ev("valorCorto('pagado', true, __c)"), 'cerrado con pérdida');
    const plan = e.ev('resumenDelPlan(__c.planPagos)');
    assert.doesNotMatch(plan, /2 de 2 cuotas pagadas/, plan);
    assert.match(plan, /cerrada con perdón/);
    assert.doesNotMatch(plan, /cuota \d pagada/, 'una cuota cerrada con perdón no se pagó: ' + plan);
    /* Control: un crédito pagado de verdad sigue diciendo «sí». */
    e.ctx.__p = pagarTodo(credito('x', 9), '2026-10-31');
    assert.equal(e.ev("valorCorto('pagado', true, __p)"), 'sí');
    const hoja = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8');
    assert.match(hoja, /valorCorto\(p\.campo, p\.mio, c\.mio\)/);
    assert.match(hoja, /valorCorto\(p\.campo, p\.suyo, c\.suyo\)/);
  });

  test('la tarjeta del choque en panel/subir.html dice lo mismo', () => {
    const hoja = fs.readFileSync(path.join(RAIZ, 'panel', 'subir.html'), 'utf8').split(String.fromCharCode(13)).join('');
    const trozo = (desde, hasta) => { const i = hoja.indexOf(desde), j = hoja.indexOf(hasta, i); assert.ok(i >= 0 && j > i, 'no encontré ' + desde); return hoja.slice(i, j); };
    const codigo = trozo('function resumenDelPlan(pp){', '\nfunction textoDelCambio') + trozo('function textoDelCambio(u){', '\n}\n') + '\n}\n'
      + trozo('function muestra(v, campo, fila){', '\nfunction decidir');
    const caja = { PUENTE: P, fechaCorta: x => String(x), pesosCO: n => '$' + Number(n).toLocaleString('es-CO') };
    vm.createContext(caja);
    vm.runInContext(codigo.replace(/\r/g, ''), caja);
    const c = cuotasCerrado();
    caja.__c = c;
    assert.equal(vm.runInContext("muestra(true, 'pagado', __c)", caja), 'cerrado con pérdida');
    const plan = vm.runInContext('resumenDelPlan(__c.planPagos)', caja);
    assert.doesNotMatch(plan, /2 de 2 pagadas/, plan);
    assert.match(plan, /cerrada con perdón/);
    caja.__p = pagarTodo(credito('x', 9), '2026-10-31');
    assert.equal(vm.runInContext("muestra(true, 'pagado', __p)", caja), 'sí');
    assert.match(hoja, /esc\(muestra\(v, c, obj\)\)/);
  });
});
