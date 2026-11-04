/* ============================================================================
 * CERRAR EL CRÉDITO CON LO QUE JOAN DIGA — la sincronización (panel/nube.js)
 * 30-oct-2026
 *
 *   cd pruebas && node --test cerrar-con-perdon-nube.test.js
 *
 * La ley vive en app/puente.js (cerrar-con-perdon.test.js). Acá se vigila lo
 * que la nube le hace a un cierre con perdón cuando el computador y el
 * celular tienen versiones distintas del crédito:
 *   · la condonación del cierre es un hecho en una lista que solo suma: se
 *     conserva ENTERA, con su parte de capital («capital» e «id» están en la
 *     identidad), y el mismo perdón anotado en los dos lados es uno solo;
 *   · cerrar o no cerrar es un CHOQUE que decide Joan («pagado» y
 *     «capitalPerdido» son pisables);
 *   · si gana el lado que no cerró, la condonación huérfana no resta capital ni
 *     aparece en ningún informe (el puente la lee atada a su cierre), y en un
 *     crédito con cuotas ni siquiera entra a «lo mío»: viaja con su plan.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const P = require(path.join(RAIZ, 'app', 'puente.js'));
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const NUBE = require(path.join(RAIZ, 'panel', 'nube.js'));
const { abrirPanel } = require('./banco-panel.js');

const copia = x => JSON.parse(JSON.stringify(x));
const SOCIO = { id: 's1', numero: 1, nombre: 'Marta Gómez' };
const DIA = '2026-10-20';
const SI = { motivo: 'se quedó sin trabajo', entiende: true };
const cartera = (...ps) => ({ socios: [copia(SOCIO)], prestamos: ps, respaldados: [], config: {}, contadores: {} });

/* Lo que hace la pantalla con los registros del puente, en su orden. */
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
/* El de la maqueta: 300.000 al 20% que vencían el 15-oct; el 20-oct debe 375.000. */
function quincenal() {
  return { id: 'p1', numero: 1, socioId: 's1', socioNombre: 'Marta Gómez', capital: 300000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false };
}
/* El de Joan del 16-oct: 650.000 en dos cuotas, el 30-oct y el 15-nov. */
function aCuotas() {
  const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
    { fechaDesembolso: '2026-10-16' });
  return { id: 'pc', numero: 2, socioId: 's1', socioNombre: 'Marta Gómez', capital: 650000, costoPct: 20,
    fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: P.planPagosDeAlta(plan) };
}

/* ==========================================================================
 * 4-NOV-2026 — UN ABONO QUE EL CIERRE NO CONOCÍA: el celular anotó un abono, el
 * computador cerró sin haberlo traído, y «Mandar lo mío encima» lo junta (es una
 * lista que suma). La pérdida se quedaba como estaba: entraron 280.000 y se
 * perdieron 50.000 de un capital de 300.000. Y con un abono mayor que la pérdida,
 * «Cerrado con pérdida» de un crédito por el que entró más que el capital.
 * ======================================================================== */
describe('6-bis · un abono del otro aparato baja la pérdida del cierre que no lo conocía', () => {
  const ABONO = monto => ({ fecha: '2026-10-18', monto, id: 'ab-celular' });
  function choque(monto) {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, SI);
    assert.equal(r.ok, true, r.detalle);
    const cerrado = aplicar(p, r.registros);
    const delCelular = copia(p);
    delCelular.abonosCapital = [ABONO(monto)];
    return NUBE.fusionarFila(cerrado, delCelular, NUBE.LISTAS_QUE_SUMAN).fila;   // «Mandar lo mío encima»
  }

  test('abono de 30.000 y cierre con 250.000: se perdieron 20.000, no 50.000', () => {
    const f = choque(30000);
    assert.equal(f.abonosCapital.length, 1, 'el abono del celular no se juntó');
    assert.equal(P.perdidaDelCierre(f), 20000);
    assert.equal(P.capitalRecuperadoDe(f), 280000);
    assert.equal(P.perdidaDelCierre(f) + P.capitalRecuperadoDe(f), 300000, 'lo que volvió más lo perdido tiene que dar el capital');
    assert.equal(P.gananciaDelCredito(f).ganancia, -20000);
    assert.equal(P.cerroConPerdida(f), true);
    const db = cartera(f);
    assert.equal(P.capitalPerdidoDelSocio(db, SOCIO).capital, 20000);
    /* El renglón con el motivo sigue siendo el de ese cierre: la quincena no pierde su descuento. */
    assert.equal(P.perdidasDeCapital(f)[0].motivo, SI.motivo);
    assert.ok(P.condonacionDelCierre(f), 'el perdón del cierre se quedó huérfano');
    assert.equal(P.descuentosDelSocio(db, SOCIO).veces, 1);
  });

  test('abono mayor que la pérdida: entró más que el capital, y no hay pérdida ni «Cerrado con pérdida»', () => {
    const f = choque(60000);
    assert.equal(P.perdidaDelCierre(f), 0);
    assert.equal(P.cerroConPerdida(f), false);
    assert.equal(P.capitalRecuperadoDe(f), 300000);
    assert.equal(P.gananciaCobrada(f), 10000, 'los 10.000 de más entraron de verdad');
    assert.equal(P.gananciaDelCredito(f).ganancia, 10000);
  });

  test('sin choque, con el abono conocido al cerrar, la cuenta es la misma y no se descuenta dos veces', () => {
    const p = quincenal();
    p.abonosCapital = [ABONO(30000)];
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, SI);
    assert.equal(r.ok, true, r.detalle);
    const c = aplicar(p, r.registros);
    assert.equal(c.capitalPerdido, 20000);
    assert.equal(P.perdidaDelCierre(c), 20000, 'descontó dos veces el abono que el cierre ya conocía');
    assert.equal(P.capitalRecuperadoDe(c), 280000);
    assert.equal(P.gananciaCobrada(c), 0);
  });

  test('el mismo abono en los dos lados no es un abono de más', () => {
    const p = quincenal();
    p.abonosCapital = [ABONO(30000)];
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, SI);
    const f = NUBE.fusionarFila(aplicar(p, r.registros), copia(p), NUBE.LISTAS_QUE_SUMAN).fila;
    assert.equal(f.abonosCapital.length, 1);
    assert.equal(P.perdidaDelCierre(f), 20000);
  });

  test('un crédito con cuotas no pasa por aquí: sus abonos viajan con su plan', () => {
    const p = aCuotas();
    const r = P.cierreConPerdon(cartera(p), p, '2026-10-20', 300000, SI);
    assert.equal(r.ok, true, r.detalle);
    const c = aplicar(p, r.registros);
    assert.equal(P.perdidaDelCierre(c), c.capitalPerdido);
  });

  test('lo que Joan lee en el CRM: lo que volvió, lo perdido y el Tablero cuadran', () => {
    const f = choque(30000);
    const CRM = abrirPanel({ ahora: '2026-10-21T10:30:00' });
    CRM.cargarCartera({ socios: [copia(SOCIO)], prestamos: [f], config: { negocio: 'Tu Garantía' } });
    CRM.ev("verCredito('p1')");
    const t = String(CRM.elems.mBody.innerHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(t, /Capital perdido al cerrar \$20\.000/, 'dijo otra cosa: ' + t);
    assert.match(t, /de los \$300\.000 prestados volvieron \$280\.000/);
    assert.equal(CRM.ev('capitalRecuperadoTotal()'), 280000);
  });
});

/* ==========================================================================
 * LA NUBE: LA PARTE DE CAPITAL SE CONSERVA, Y UN CIERRE QUE PERDIÓ NO PESA
 * ======================================================================== */
describe('6 · la nube conserva la parte de capital, y un cierre que perdió el choque no deja pérdida', () => {

  function cerrado() {
    const p = quincenal();
    const r = P.cierreConPerdon(cartera(p), p, DIA, 250000, SI);
    return { abierto: p, cerrado: aplicar(p, r.registros) };
  }

  test('fusionar: la condonación entra con su capital, y cerrar o no es un choque que decide Joan', () => {
    const { abierto, cerrado: c } = cerrado();
    const r = NUBE.fusionarFila(copia(abierto), copia(c));
    const k = r.fila.condonaciones.find(x => x.sobre === 'cierre');
    assert.ok(k, 'la condonación del cierre se perdió en la fusión');
    assert.equal(k.capital, 50000, 'la parte de capital no viajó');
    /* `pagado` lo traen los dos lados y dicen distinto: choque. Lo que solo trae
       el lado cerrado (montoRecibido, capitalPerdido…) se copia, y por eso la
       pérdida se lee SOLO con el crédito pagado (perdidaDelCierre). */
    const campos = r.pisables.map(x => x.campo);
    assert.ok(campos.includes('pagado'), 'cerrar no fue choque');
    assert.equal(r.fila.pagado, false);
    assert.equal(r.fila.capitalPerdido, 50000, 'el campo de un solo lado no se copió (cambió la regla de fusionarFila)');
    assert.equal(P.perdidaDelCierre(r.fila), 0, 'una pérdida copiada sin su cierre se contó');
    assert.ok(NUBE.CAMPOS_PISABLES_TIPICOS.includes('capitalPerdido'), 'capitalPerdido no está documentado como pisable');
  });

  test('si gana el lado abierto, la condonación huérfana no resta capital ni sale en ningún informe', () => {
    const { abierto, cerrado: c } = cerrado();
    const lo = NUBE.fusionarFila(copia(abierto), copia(c)).fila;   // «lo mío»: sin el cierre
    assert.equal(lo.pagado, false);
    assert.equal(P.perdidaDelCierre(lo), 0);
    assert.equal(P.capitalActual(lo), 300000, 'una pérdida de un cierre que no existe le bajó la deuda');
    assert.equal(P.capitalRecuperadoDe(lo), 0);
    const db = cartera(lo);
    assert.deepEqual(P.descuentosDeQuincena(db, '2026-10-15'), { mora: 0, costo: 0, total: 0, veces: 0, clientes: 0 });
    assert.deepEqual(P.descuentosDeQuincena(db, '2026-10-31'), { mora: 0, costo: 0, total: 0, veces: 0, clientes: 0 });
    assert.equal(P.capitalPerdidoDeQuincena(db, '2026-10-15').capital, 0);
    assert.deepEqual(P.descuentosDelSocio(db, SOCIO), { veces: 0, monto: 0, costo: 0, mora: 0 });
    /* Y cobrarlo después con la cuenta de siempre no hereda la pérdida. */
    const r = P.cierreConPerdon(db, lo, DIA, 375000 - 15000, { motivo: 'sin mora' });
    assert.equal(r.ok, true, r.detalle);
    const despues = aplicar(lo, r.registros);
    assert.equal(P.perdidaDelCierre(despues), 0);
    assert.equal(P.capitalRecuperadoDe(despues), 300000);
  });

  test('los dos lados cerraron el mismo día, uno con pérdida: si Joan elige el que no la tiene, no hay pérdida', () => {
    const p = quincenal();
    const conPerdida = aplicar(p, P.cierreConPerdon(cartera(p), p, DIA, 250000, SI).registros);
    const sinPerdida = aplicar(p, P.cierreConPerdon(cartera(p), p, DIA, 330000, { motivo: 'otro' }).registros);
    const f = NUBE.fusionarFila(copia(sinPerdida), copia(conPerdida));
    assert.ok(f.pisables.some(x => x.campo === 'capitalPerdido'), 'la pérdida de un lado no fue choque');
    const lo = f.fila;
    assert.equal(lo.capitalPerdido, 0);
    assert.equal(P.perdidaDelCierre(lo), 0);
    const db = cartera(lo);
    assert.equal(P.capitalPerdidoDeQuincena(db, '2026-10-15').capital, 0);
    /* Su condonación (30.000 de costo + 15.000 de mora) sí; la del otro lado, no. */
    assert.deepEqual(P.descuentosDeQuincena(db, '2026-10-15'), { mora: 15000, costo: 30000, total: 45000, veces: 1, clientes: 1 });
  });

  test('a cuotas: la condonación del cierre viaja con su plan, entera y con su capital', () => {
    const p = aCuotas();
    const c = aplicar(p, P.cierreConPerdon(cartera(p), p, '2026-11-05', 0, SI).registros);
    /* «Lo mío» es el lado abierto: el plan sin cerrar no se queda con el perdón
       de un cierre que no conoce. */
    const lo = NUBE.fusionarFila(copia(p), copia(c)).fila;
    assert.equal((lo.condonaciones || []).filter(x => x.sobre === 'cierre').length, 0,
      'un perdón de un cierre que no existe entró a la fila que no lo conoce');
    assert.equal(P.descuentosDeQuincena(cartera(lo), '2026-10-31').total, 0);
    /* Y del lado que cerró, la condonación sigue entera, capital incluido. */
    const suyo = NUBE.fusionarFila(copia(c), copia(p)).fila;
    const k = suyo.condonaciones.find(x => x.sobre === 'cierre');
    assert.deepEqual({ capital: k.capital, costo: k.costo, mora: k.mora }, { capital: 650000, costo: 195000, mora: 19500 });
    assert.equal(P.perdidaDelCierre(suyo), 650000);
  });

  test('dos cierres con el mismo perdón son dos hechos; el mismo, anotado en los dos lados, es uno', () => {
    const { cerrado: c } = cerrado();
    const k = c.condonaciones[0];
    const otro = Object.assign({}, k, { id: k.id + 'x', motivo: 'otro' });
    assert.equal(NUBE.fusionarListas([k], [otro], NUBE.LISTAS_QUE_SUMAN.condonaciones).length, 2);
    assert.equal(NUBE.fusionarListas([k], [Object.assign({}, k, { motivo: 'distinto' })],
      NUBE.LISTAS_QUE_SUMAN.condonaciones).length, 1);
  });
});
