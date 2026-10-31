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
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
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

/* ==========================================================================
 * 1. LA COMISIÓN DEL ASESOR
 * ======================================================================== */
describe('1 · la comisión del asesor: perdonarle la plata al cliente no le paga al asesor ni le borra el castigo', () => {
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

  test('el primer crédito cerrado con $0 el día 19 de mora: ni «pagó su primer crédito», ni desbloqueo, y el castigo llega el día 20', () => {
    const cerrado = cerrar({ socios: [S], prestamos: [primero()] }, primero(), '2026-11-03', 0);
    assert.equal(P.perdidaDelCierre(cerrado), 300000, 'precondición: se perdió todo el capital');
    const L = libro([cerrado], '2026-11-05');
    assert.ok(!L.movs.some(m => m.tipo === 'pago'),
      'le anotó al asesor «el cliente pagó su primer crédito» de un cliente que no pagó nada');
    const castigo = L.movs.find(m => m.tipo === 'castigo_mora');
    assert.ok(castigo, 'el cierre con pérdida le borró al asesor el castigo de los 20 días');
    assert.equal(castigo.fecha, '2026-11-04');
    assert.equal(castigo.monto, -10000);
    /* El motivo dice lo que pasó: el crédito no llegó abierto al día 20. */
    assert.match(castigo.motivo, /no pagó todo en menos de 20 días de mora/);
    assert.match(castigo.motivo, /se cerró con pérdida de capital/);
    assert.equal(L.desbloquear.puede, false, 'le dejó desbloquear los 15.000');
    /* Exactamente lo mismo que si el crédito siguiera abierto y sin pagar. */
    assert.deepEqual(corto(L), corto(libro([primero()], '2026-11-05')));
    assert.deepEqual(corto(L), { bloqueado: 5000, libre: 0, castigos: 10000, puede: false });
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
describe('5 · «Riesgo (sugerido)»: el perdón no se lo baja', () => {
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

  test('Lucía con 16 días de mora es Alto, y cerrarle el crédito con $0 la deja en Alto (no en Bajo)', () => {
    const antes = crmCon(HOY, [LUCIA], [vencido(), otro()]);
    assert.equal(riesgo(antes).txt, 'Alto', 'precondición');
    const db = { socios: [LUCIA], prestamos: [vencido(), otro()] };
    const cerrado = cerrar(db, vencido(), '2026-10-31', 0);
    const CRM = crmCon(HOY, [LUCIA], [cerrado, otro()]);
    assert.equal(riesgo(CRM).txt, 'Alto', 'perder el 100% del capital le bajó el riesgo a la clienta');
    /* La ficha dice por qué, que no se ve ninguna mora abierta. */
    CRM.ev("verCliente('s3')");
    const ficha = texto(CRM.elems.mBody.innerHTML);
    assert.match(ficha, /Riesgo \(sugerido\) Alto/);
    assert.match(ficha, /se cerró con pérdida de capital a los 16 días de mora/);
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
