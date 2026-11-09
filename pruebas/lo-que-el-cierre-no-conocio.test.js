/* ============================================================================
 * LA PLATA QUE UN CIERRE NO CONOCIÓ — la regla de Joan, entera. 9-nov-2026
 *
 *   node --test pruebas/lo-que-el-cierre-no-conocio.test.js
 *
 * Joan decidió: «Que me pregunte cada vez». Vale para TODO crédito cerrado cuyo cierre no
 * conoció uno o más abonos que llegaron después desde el otro aparato, haya o no capital
 * perdido. La primera versión (15f61b3) solo frenaba los cierres que perdieron capital, y la
 * revisión lo midió con el caso más real: la clienta debe 375.000, le da 60.000 al cobrador
 * (celular) y 315.000 a Joan, que cierra en el computador antes de traer lo del celular.
 * Quedaban 15.000 de ganancia, 60.000 de «Descuentos dados» que no existieron y 300.000
 * recuperados: entraron 375.000 y solo 315.000 estaban en alguna cifra, sin preguntar.
 *
 * Lo que se vigila aquí, por cada camino de cierre que existe (el CRM, el celular y las
 * cuentas del puente que aplican sus pantallas) × abono del otro aparato × cada decisión:
 *   · CADA PESO QUE ENTRÓ ESTÁ UNA VEZ en alguna cifra (capital recuperado, ganancia, saldo a
 *     su favor) o está «por decidir»;
 *   · por decidir, ninguna cifra del cierre se mueve (ni la pérdida, ni el descuento, ni la
 *     garantía, ni el fondo 80/20);
 *   · «Era la misma plata»: lo que entró es lo del cierre, y todas las cifras son las suyas;
 *   · «Es plata nueva: lo cobro» paga capital perdido, mora y costo perdonados, en ese orden,
 *     y solo se ofrece si el cierre perdió o perdonó algo;
 *   · lo que se debía (recuperado + ganancia + descuentos + pérdida) no cambia con ninguna.
 * Todos los nombres, celulares y cifras de estas pruebas son inventados.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RAIZ = path.join(__dirname, '..');
const P = require(path.join(RAIZ, 'app', 'puente.js'));
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const NUBE = require(path.join(RAIZ, 'panel', 'nube.js'));
const { abrirPanel } = require('./banco-panel.js');
const { abrirEspejo } = require('./banco-espejo.js');

const copia = x => JSON.parse(JSON.stringify(x));
const SOCIO = { id: 's1', numero: 1, nombre: 'Marta Inventada' };
const DIA = '2026-10-20';
const SI = { motivo: 'se quedó sin trabajo', entiende: true };
const cartera = (...ps) => ({ socios: [copia(SOCIO)], prestamos: ps, respaldados: [], config: {}, contadores: {} });
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* 300.000 al 20 % que vencían el 15-oct: el 20-oct debe 375.000 (60.000 de costo y 15.000 de mora). */
function quincenal() {
  return { id: 'p1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre, capital: 300000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false };
}
function aCuotas() {
  const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
    { fechaDesembolso: '2026-10-16' });
  return { id: 'p1', numero: 2, socioId: 's1', socioNombre: SOCIO.nombre, capital: 650000, costoPct: 20,
    fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: P.planPagosDeAlta(plan) };
}
function planDel8() {
  const plan = M.construirPlanDePagos({ capital: 300000, fecha_corte: '2026-10-15', estado: 'en_corte' }, { desde: '2026-10-20' });
  return { id: 'p1', numero: 4, socioId: 's1', socioNombre: SOCIO.nombre, capital: 300000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: plan.cuotas[0].fecha_corte,
    prorrogas: [{ fecha: '2026-10-15', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, nuevoCiclo: '2026-10-31' }],
    abonosCapital: [], comprobantes: [], pagado: false,
    planPagos: { creado: '2026-10-20', tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: '2026-10-20', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, diasMora: 0 },
      total_capital: plan.total_capital, total_costo: plan.total_costo, total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(q => ({ n: q.numero, fecha: q.fecha_corte, capital: q.capital, costo: q.costo,
        total: q.total, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 })) } };
}
function conPacto(monto) {
  const q = { id: 'p1', numero: 3, socioId: 's1', socioNombre: SOCIO.nombre, capital: 400000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false };
  const pa = P.pactarProximoPago(cartera(q), q, { fecha: '2026-11-06', monto, motivo: 'acordado' }, '2026-10-10');
  assert.equal(pa.ok, true, pa.detalle);
  q.planPagos = pa.registros.planPagos; q.cicloActual = pa.registros.cicloActual;
  if (pa.registros.condonacion) q.condonaciones = [pa.registros.condonacion];
  return q;
}
/* Lo que hace la pantalla con los registros del puente, en su orden. */
function aplicar(p, regs) {
  const c = copia(p);
  (regs.cuotas || []).forEach(x => Object.assign(c.planPagos.cuotas.find(y => Number(y.n) === Number(x.n)), x));
  c.abonosCapital = (c.abonosCapital || []).concat(regs.abonos || []);
  if (regs.condonacion) c.condonaciones = (c.condonaciones || []).concat([regs.condonacion]);
  Object.assign(c, regs.credito);
  return c;
}
/* Las cuotas cobradas una por una, como el CRM y el celular (cierreDeCuota), hasta la última. */
function cuotaPorCuota(p) {
  const c = copia(p);
  for (let i = 0; i < 6 && !c.pagado; i++) {
    const r = P.cierreDeCuota(c, P.cuotaPlanActual(c).fecha);
    assert.equal(r.ok, true, r.detalle);
    const g = r.registros;
    Object.assign(c.planPagos.cuotas.find(x => Number(x.n) === Number(g.cuota.n)), g.cuota);
    if (g.abono) c.abonosCapital.push(g.abono);
    if (g.cicloActual) c.cicloActual = g.cicloActual;
    if (g.credito) Object.assign(c, g.credito);
  }
  return c;
}
/* El CRM de verdad, cerrando con pagarTotal (Pagó todo, Pagó de más y «Se lo perdoné» que no toca capital). */
function cierreDelCRM(p, codigo) {
  const C = abrirPanel({ ahora: DIA + 'T10:00:00' });
  C.cargarCartera({ socios: [copia(SOCIO)], prestamos: [copia(p)], config: { negocio: 'Tu Garantía' } });
  C.ev("confirm=t=>String(t).indexOf('WhatsApp')<0;alert=()=>{};document.getElementById('pgFecha').value='" + DIA + "'");
  C.ev(codigo);
  return JSON.parse(C.ev('JSON.stringify(DB.prestamos[0])'));
}
/* El celular de verdad: su cobro (cobrar) y su abono (abonarEnCalle). */
function delCelular(p, codigo) {
  const E = abrirEspejo({ cartera: cartera(copia(p)), ahora: DIA + 'T10:00:00' });
  E.ev("confirm=function(t){return String(t).indexOf('WhatsApp')<0};alert=function(){}");
  E.ev(codigo);
  return JSON.parse(E.ev('JSON.stringify(DB.prestamos[0])'));
}
const ABONO = (monto, fecha) => ({ fecha: fecha || '2026-10-18', monto, id: 'ab-celular-' + monto, ciclo: '2026-10-15' });
/* El celular anotó el abono sobre el crédito abierto, y «Mandar lo mío encima» lo junta al cerrado. */
function conAbonoDelOtro(abierto, cerrado, monto) {
  const otro = copia(abierto);
  otro.abonosCapital = (otro.abonosCapital || []).concat([ABONO(monto)]);
  return NUBE.fusionarFila(cerrado, otro, NUBE.LISTAS_QUE_SUMAN).fila;
}
const decidir = (f, destino) => {
  const r = P.decidirSobrante(f, destino, '2026-10-22', 'computador');
  assert.equal(r.ok, true, r.detalle);
  return Object.assign(copia(f), r.registros);
};
const cifras = f => {
  const d = P.descuentosDelSocio(cartera(f), SOCIO);
  return { recuperado: P.capitalRecuperadoDe(f), ganancia: P.gananciaCobrada(f), aFavor: P.saldoAFavorDe(f),
    porDecidir: P.sobrantePorDecidir(f), perdida: P.perdidaDelCierre(f), descuentos: d.costo + d.mora,
    garantia: P.garantiaGanadaCredito(f), fondo: P.movimientosCobradosCredito(f).reduce((t, m) => t + m.monto, 0),
    quincena: P.sobranteCobradoEnQuincena(f, f.cicloPago) };
};
const entro = c => c.recuperado + c.ganancia + c.aFavor + c.porDecidir;
const deuda = c => c.recuperado + c.ganancia + c.descuentos + c.perdida;

const q0 = quincenal();
const l0 = P.liquidarCiclo(q0, DIA);
const rep = falta => P.repartoDelDescuento(l0, falta, 'mora', { cierra: true });
const CAMINOS = {
  'CRM · Pagó todo': () => ({ abierto: q0, cerrado: cierreDelCRM(q0, "pagarTotal('p1',{montoRecibido:375000})") }),
  'CRM · Pagó de más': () => ({ abierto: q0, cerrado: cierreDelCRM(q0, "pagarTotal('p1',{montoRecibido:400000,saldoAFavor:25000})") }),
  'CRM · Se lo perdoné sin pérdida (315.000)': () => ({ abierto: q0,
    cerrado: cierreDelCRM(q0, "pagarTotal('p1',{montoRecibido:315000,condonaCosto:" + rep(60000).costo + ",condonaMora:" + rep(60000).mora + ",motivo:'x'})") }),
  'Se lo perdoné sin pérdida, del puente (340.000)': () => ({ abierto: q0, cerrado: aplicar(q0, P.cierreConPerdon(cartera(q0), q0, DIA, 340000, SI).registros) }),
  'Se lo perdoné con pérdida (250.000)': () => ({ abierto: q0, cerrado: aplicar(q0, P.cierreConPerdon(cartera(q0), q0, DIA, 250000, SI).registros) }),
  'Se lo perdoné de v141 que perdonó todo (gananciaPago 0)': () => ({ abierto: q0, cerrado: Object.assign(copia(q0), {
    pagado: true, fechaPagado: DIA, cicloPago: '2026-10-15', cobroRegistrado: true, gananciaPago: 0, recargoMora: 0,
    costoCausado: l0.costo, moraCausada: l0.recargo_mora, montoRecibido: 300000, saldoAFavor: 0,
    condonaciones: [{ fecha: DIA, costo: l0.costo, mora: l0.recargo_mora, motivo: 'v141', quien: 'computador' }] }) }),
  'Pagó todo de antes de v142 (sin capitalPerdido)': () => ({ abierto: q0, cerrado: Object.assign(copia(q0), {
    pagado: true, fechaPagado: DIA, cicloPago: '2026-10-15', cobroRegistrado: true, gananciaPago: 75000, recargoMora: 15000,
    costoCausado: 60000, moraCausada: 15000, montoRecibido: 375000, saldoAFavor: 0 }) }),
  'Celular · Pagó todo': () => ({ abierto: q0, cerrado: delCelular(q0, "cobrar('p1','" + DIA + "',{montoRecibido:375000})") }),
  'Celular · con descuento (340.000)': () => ({ abierto: q0,
    cerrado: delCelular(q0, "cobrar('p1','" + DIA + "',{montoRecibido:340000,condonaCosto:" + rep(35000).costo + ",condonaMora:" + rep(35000).mora + ",motivo:'x'})") }),
  'A cuotas · Pagó todo': () => { const a = aCuotas(); return { abierto: a, cerrado: aplicar(a, P.liquidarSaldoPlan(a, DIA).registros) }; },
  'A cuotas · la última cuota': () => { const a = aCuotas(); return { abierto: a, cerrado: cuotaPorCuota(a) }; },
  'A cuotas · Se lo perdoné con pérdida': () => { const a = aCuotas(); return { abierto: a, cerrado: aplicar(a, P.cierreConPerdon(cartera(a), a, DIA, 300000, SI).registros) }; },
  'A cuotas · Se lo perdoné sin pérdida': () => { const a = aCuotas(); return { abierto: a, cerrado: aplicar(a, P.cierreConPerdon(cartera(a), a, DIA, 700000, SI).registros) }; },
  'Plan del §8 · la última cuota': () => { const a = planDel8(); return { abierto: a, cerrado: cuotaPorCuota(a) }; },
  'Plan del §8 · Se lo perdoné con pérdida': () => { const a = planDel8(); return { abierto: a, cerrado: aplicar(a, P.cierreConPerdon(cartera(a), a, '2026-10-25', 200000, SI).registros) }; }
};

describe('la matriz: cada camino de cierre × abono del otro aparato × cada decisión, y cada peso una vez', () => {
  Object.keys(CAMINOS).forEach(nombre => {
    test(nombre, () => {
      const { abierto, cerrado } = CAMINOS[nombre]();
      assert.equal(cerrado.pagado, true, 'el camino no cerró el crédito');
      const base = cifras(cerrado);
      const L = base.perdida;
      const x = P.cuentaDelSobrante(aplicar(cerrado, {})) ;
      /* Sin abono: nada que preguntar. */
      assert.equal(base.porDecidir, 0, 'sin abono del otro aparato ya pregunta');
      assert.equal(x, null);
      assert.equal(P.decidirSobrante(cerrado, 'aFavor', DIA).ok, false);
      const perdonoAlgo = L > 0 || base.descuentos > 0;
      const montos = L ? [Math.round(L / 2), L, L + 10000, L + 150000] : [30000, 60000, 200000];
      montos.forEach(monto => {
        const etq = nombre + ' + ' + monto + ' del otro aparato';
        const f = conAbonoDelOtro(abierto, cerrado, monto);
        const c0 = cifras(f);
        /* Sin decidir: todo por decidir, y las cifras del cierre como se anotaron. */
        assert.equal(c0.porDecidir, monto, etq + ': no está por decidir');
        assert.equal(entro(c0), entro(base) + monto, etq + ': un peso que entró no está en ninguna cifra');
        ['recuperado', 'ganancia', 'aFavor', 'perdida', 'descuentos', 'garantia', 'fondo', 'quincena'].forEach(k =>
          assert.equal(c0[k], base[k], etq + ': por decidir movió «' + k + '»'));
        const cu = P.cuentaDelSobrante(f);
        assert.deepEqual(cu.botones, perdonoAlgo ? ['cobrar', 'aFavor', 'misma'] : ['aFavor', 'misma'], etq + ': botones');
        ['cobrar', 'aFavor', 'misma'].forEach(destino => {
          const r = P.decidirSobrante(f, destino, '2026-10-22');
          if (!cu.botones.includes(destino)) {
            assert.equal(r.ok, false, etq + ': «' + destino + '» salió sin tener sentido');
            return;
          }
          const g = Object.assign(copia(f), r.registros);
          const c = cifras(g);
          const e = etq + ' · ' + destino;
          assert.equal(c.porDecidir, 0, e + ': sigue por decidir');
          assert.equal(deuda(c), deuda(base), e + ': cambió lo que se debía');
          if (destino === 'misma') {
            assert.deepEqual(c, base, e + ': «Era la misma plata» movió alguna cifra');
            assert.equal(entro(c), entro(base), e + ': lo que entró no es lo del cierre');
            return;
          }
          assert.equal(entro(c), entro(base) + monto, e + ': la plata nueva no está una vez');
          if (destino === 'aFavor') {
            assert.equal(c.aFavor, base.aFavor + monto, e);
            ['recuperado', 'ganancia', 'perdida', 'descuentos', 'garantia', 'fondo'].forEach(k => assert.equal(c[k], base[k], e + ': movió «' + k + '»'));
            return;
          }
          /* «Lo cobro»: capital perdido, mora y costo perdonados, en ese orden; el resto, a su favor. */
          const pz = P.piezasDelSobrante(g);
          assert.equal(pz.capital, Math.min(monto, L), e + ': no fue primero al capital perdido');
          assert.equal(c.perdida, L - pz.capital, e);
          assert.equal(c.recuperado, base.recuperado + pz.capital, e);
          assert.equal(c.ganancia - base.ganancia, pz.mora + pz.costo, e + ': lo cobrado no es ganancia');
          assert.equal(base.descuentos - c.descuentos, pz.mora + pz.costo, e + ': lo cobrado sigue como descuento');
          assert.equal(c.quincena, pz.mora + pz.costo, e + ': no entró en la quincena del cierre');
          assert.equal(c.fondo - base.fondo, pz.mora + pz.costo, e + ': no entró al 80/20');
          assert.ok(c.garantia >= base.garantia, e + ': bajó la garantía');
          assert.equal(c.aFavor, base.aFavor + pz.aFavor, e);
        });
      });
    });
  });

  /* Dos CONTROLES de lo que ya cubría la tarjeta del choque (nube.js) y esta tanda no toca: no
     fallan sin el arreglo, a propósito. Un abono a una CUOTA y lo que un pago acordado no
     conocía viajan con su plan: no llegan a la fila cerrada, así que la caja no los puede ver, y
     la tarjeta los pregunta antes. Si un día entraran callados, estas pruebas lo dirían. */
  test('CONTROL · un abono a una cuota que el cierre no conocía no entra callado: la tarjeta del choque lo nombra', () => {
    const a = aCuotas();
    const cerrado = aplicar(a, P.liquidarSaldoPlan(a, DIA).registros);
    const ab = P.abonoACuota(a, '2026-10-18', 100000);
    assert.equal(ab.ok, true, ab.detalle);
    const otro = copia(a);
    otro.abonosCapital = [ab.registros.abono];
    const r = NUBE.fusionarFila(cerrado, otro, NUBE.LISTAS_QUE_SUMAN);
    assert.deepEqual(cifras(r.fila), cifras(cerrado), 'el abono a la cuota entró callado');
    const pc = r.pisables.find(x => x.campo === 'abonosCapital');
    assert.ok(pc, 'la tarjeta no pregunta por el abono de la cuota');
    assert.match(String(pc.suyo), /Cuota 1: abono 2026-10-18 \$100000/);
  });

  test('CONTROL · pago acordado: el abono que el pacto no conocía no entra callado a la fila cerrada; la tarjeta del choque lo nombra', () => {
    [['cuota pagada', a => cuotaPorCuota(a)],
     ['Se lo perdoné con pérdida', a => aplicar(a, P.cierreConPerdon(cartera(a), a, '2026-11-06', 300000, SI).registros)]].forEach(([nombre, cerrar]) => {
      const a = conPacto(450000);
      const cerrado = cerrar(a);
      const otro = copia(a);
      otro.abonosCapital = [ABONO(60000)];
      const r = NUBE.fusionarFila(cerrado, otro, NUBE.LISTAS_QUE_SUMAN);
      assert.deepEqual(cifras(r.fila), cifras(cerrado), nombre + ': el abono entró callado');
      const pa = r.pisables.find(x => x.campo === 'pagoAcordado');
      assert.ok(pa, nombre + ': la tarjeta no pregunta por el pago acordado');
      assert.match(String(pa.suyo), /abono 2026-10-18 \$60000/, nombre + ': la tarjeta no nombra el abono que el pacto no conocía');
    });
  });
});

describe('los dos casos que midió la revisión, con el CRM y el celular de verdad', () => {
  /* El abono del cobrador, anotado por el celular de verdad sobre el crédito abierto. */
  function abonoDelCobrador(monto) {
    const cel = delCelular(q0, "abonarEnCalle('p1', " + monto + ", '2026-10-18')");
    assert.equal(cel.abonosCapital.length, 1, 'el celular no anotó el abono');
    return cel;
  }
  const junto = (cerrado, cel) => NUBE.fusionarFila(cerrado, cel, NUBE.LISTAS_QUE_SUMAN).fila;

  test('debe 375.000: 60.000 al cobrador y 315.000 a Joan, que cierra con «Se lo perdoné» sin traer lo del celular', () => {
    const cerrado = CAMINOS['CRM · Se lo perdoné sin pérdida (315.000)']().cerrado;
    const f = junto(cerrado, abonoDelCobrador(60000));
    const c = cifras(f);
    assert.deepEqual([c.recuperado, c.ganancia, c.descuentos, c.porDecidir], [300000, 15000, 60000, 60000]);
    assert.equal(entro(c), 375000, 'entraron 375.000 y no están todos');
    /* «Es plata nueva: lo cobro»: 75.000 de ganancia y 0 de descuento, como si hubiera pagado todo. */
    const g = decidir(f, 'cobrar');
    const d = cifras(g);
    assert.deepEqual([d.recuperado, d.ganancia, d.descuentos, d.aFavor, d.porDecidir], [300000, 75000, 0, 0, 0]);
    assert.equal(P.descuentosDeQuincena(cartera(g), g.cicloPago).total, 0, '«Descuentos dados» sigue diciendo un descuento que no existió');
    assert.equal(P.descuentosDelSocio(cartera(g), SOCIO).monto, 0);
    const pagoTodo = CAMINOS['CRM · Pagó todo']().cerrado;
    assert.equal(d.garantia, P.garantiaGanadaCredito(pagoTodo), 'la garantía no es la de quien pagó todo');
    assert.equal(d.fondo, cifras(pagoTodo).fondo, 'el 80/20 no es el de quien pagó todo');
    assert.equal(P.gananciaCobrada(g), 75000);
  });

  test('«Pagó todo» por 375.000 más 60.000 del celular: «Era la misma plata» deja 375.000; «Queda a su favor», 60.000 a su favor; «Lo cobro» no sale', () => {
    const cerrado = CAMINOS['CRM · Pagó todo']().cerrado;
    const f = junto(cerrado, abonoDelCobrador(60000));
    assert.equal(entro(cifras(f)), 435000);
    assert.equal(P.sobrantePorDecidir(f), 60000);
    const misma = cifras(decidir(f, 'misma'));
    assert.equal(entro(misma), 375000, 'con «Era la misma plata» entraron 375.000');
    assert.deepEqual([misma.recuperado, misma.ganancia, misma.aFavor], [300000, 75000, 0]);
    const aFavor = cifras(decidir(f, 'aFavor'));
    assert.equal(aFavor.aFavor, 60000);
    assert.equal(entro(aFavor), 435000);
    assert.equal(P.decidirSobrante(f, 'cobrar', DIA).ok, false, '«Lo cobro» daría lo mismo que «Queda a su favor»');
  });
});

describe('la decisión vale solo para su cifra y su cierre', () => {
  const f = conAbonoDelOtro(q0, CAMINOS['CRM · Se lo perdoné sin pérdida (315.000)']().cerrado, 60000);

  test('guarda la cifra y el cierre para los que se tomó', () => {
    const g = decidir(f, 'misma');
    assert.deepEqual(g.sobranteDecidido.cierre, { fecha: DIA, monto: 315000 });
    assert.equal(g.sobranteDecidido.monto, 60000);
    assert.equal(g.sobranteDecidido.destino, 'misma');
  });

  test('si otro abono cambia la cifra, se vuelve a preguntar por toda', () => {
    const g = decidir(f, 'cobrar');
    g.abonosCapital = g.abonosCapital.concat([ABONO(5000, '2026-10-19')]);
    assert.equal(P.sobrantePorDecidir(g), 65000);
    assert.equal(P.gananciaCobrada(g), 15000, 'contó una decisión que era de otra cifra');
  });

  test('si en un choque gana otro cierre, la decisión del de antes no vale', () => {
    const g = decidir(f, 'cobrar');
    /* El mismo crédito cerrado de otra forma, con el mismo abono sin conocer. */
    const otro = Object.assign(copia(g), { montoRecibido: 320000, gananciaPago: 20000 });
    assert.equal(P.sobrantePorDecidir(otro), 60000, 'la decisión del otro cierre se aplicó a este');
  });
});

describe('la decisión viaja con el crédito y la tarjeta del choque dice qué cambia', () => {
  const f = conAbonoDelOtro(q0, CAMINOS['CRM · Pagó todo']().cerrado, 60000);
  const misma = decidir(f, 'misma'), aFavor = decidir(f, 'aFavor');

  test('una decisión contra nada no es choque, y no se pierde con ninguno de los dos botones', () => {
    const mio = NUBE.fusionarFila(misma, f, NUBE.LISTAS_QUE_SUMAN);   // «Mandar lo mío encima»
    assert.equal(mio.pisables.some(x => x.campo === 'sobranteDecidido'), false, 'pregunta otra vez lo que Joan ya escogió');
    assert.equal(mio.fila.sobranteDecidido.destino, 'misma');
    const nube = NUBE.fusionarFila(f, misma, NUBE.LISTAS_QUE_SUMAN);  // «Dejar lo de la nube» (subir.html: la nube primero)
    assert.equal(nube.fila.sobranteDecidido.destino, 'misma', '«Dejar lo de la nube» perdió la decisión callada');
    assert.equal(P.sobrantePorDecidir(nube.fila), 0);
  });

  test('dos decisiones distintas son un choque, y cada cara dice la suya', () => {
    const r = NUBE.fusionarFila(misma, aFavor, NUBE.LISTAS_QUE_SUMAN);
    assert.ok(r.pisables.some(x => x.campo === 'sobranteDecidido'), 'dos decisiones distintas no salen en la tarjeta');
    /* subir.html: el campo está entre los que se miran, y se dice en palabras. */
    const hoja = fs.readFileSync(path.join(RAIZ, 'panel', 'subir.html'), 'utf8').split(String.fromCharCode(13)).join('');
    assert.match(hoja.slice(hoja.indexOf('var CAMPOS_MIRABLES'), hoja.indexOf('var TABLAS')), /'sobranteDecidido'/);
    const i = hoja.indexOf('var DESTINOS_DEL_SOBRANTE'), j = hoja.indexOf('\nfunction decidir', i);
    assert.ok(i >= 0 && j > i, 'no encontré la cara del choque en subir.html');
    const caja = { PUENTE: P, fechaCorta: x => String(x), pesosCO: n => '$' + Number(n).toLocaleString('es-CO'), resumenDelPlan: () => '' };
    vm.createContext(caja);
    vm.runInContext(hoja.slice(i, j), caja);
    caja.__a = misma; caja.__b = aFavor; caja.__f = f;
    assert.match(vm.runInContext("muestra(__a.sobranteDecidido, 'sobranteDecidido', __a)", caja), /^«Era la misma plata» para \$60\.000/);
    assert.match(vm.runInContext("muestra(__b.sobranteDecidido, 'sobranteDecidido', __b)", caja), /^«Queda a su favor» para \$60\.000/);
    assert.match(vm.runInContext("muestra(undefined, 'sobranteDecidido', __f)", caja), /sin decidir: el CRM pregunta qué son \$60\.000/);
    /* Una decisión que no es de esta fila se dice, no se pierde callada. */
    caja.__v = Object.assign(copia(misma), { montoRecibido: 380000 });
    assert.match(vm.runInContext("muestra(__v.sobranteDecidido, 'sobranteDecidido', __v)", caja), /no vale con este cierre: el CRM vuelve a preguntar/);
    /* El celular, con su etiqueta. */
    const E = abrirEspejo({ cartera: cartera(copia(misma)), ahora: '2026-10-21T10:00:00' });
    E.ctx.__a = misma;
    assert.equal(E.ev("etiquetaCampo('sobranteDecidido')"), 'Lo que decidiste de la plata que el cierre no conoció');
    assert.match(E.ev("valorCorto('sobranteDecidido', __a.sobranteDecidido, __a)"), /^«Era la misma plata» para \$60\.000/);
  });
});

describe('lo que Joan ve: el Tablero, la caja del crédito y el celular', () => {
  const pagoTodo = conAbonoDelOtro(q0, CAMINOS['CRM · Pagó todo']().cerrado, 60000);
  const perdon = conAbonoDelOtro(q0, CAMINOS['CRM · Se lo perdoné sin pérdida (315.000)']().cerrado, 60000);
  function crm(p) {
    const C = abrirPanel({ ahora: '2026-10-21T10:30:00' });
    C.cargarCartera({ socios: [copia(SOCIO)], prestamos: [copia(p)], config: { negocio: 'Tu Garantía' } });
    return C;
  }

  test('un cierre sin pérdida también se detiene: el Tablero lo nombra y la caja trae los tres botones', () => {
    const C = crm(perdon);
    const aviso = plano(C.ev('avisoSobrantesPorDecidir()'));
    assert.match(aviso, /Llegó plata que un cierre no conoció: decide qué es\./);
    assert.match(aviso, /\$60\.000 por decidir/);
    C.ev("verCredito('p1')");
    const h = String(C.elems.mBody.innerHTML), t = plano(h);
    assert.match(t, /se anotó que entraron \$315\.000 ?, con \$15\.000 de mora perdonada y \$45\.000 de costo perdonado/, t);
    assert.match(t, /Otro aparato había anotado \$60\.000 en abonos que ese cierre no tuvo en cuenta/);
    assert.match(t, /«Es plata nueva»: \$60\.000 de mora y costo perdonados pasan a ganancia de la quincena del cierre y bajan el descuento/);
    ['cobrar', 'aFavor', 'misma'].forEach(d => assert.match(h, new RegExp("decidirSobrante\\('p1','" + d + "'\\)")));
    assert.equal(C.ev('gananciaDeQuincena(DB.prestamos[0].cicloPago)'), 15000, 'la quincena contó la plata por decidir');
  });

  test('con «Pagó todo», la caja no ofrece «Lo cobro»', () => {
    const C = crm(pagoTodo);
    C.ev("verCredito('p1')");
    const h = String(C.elems.mBody.innerHTML);
    assert.match(plano(h), /sin perder ni perdonar nada/);
    assert.doesNotMatch(h, /decidirSobrante\('p1','cobrar'\)/);
    assert.match(h, /decidirSobrante\('p1','aFavor'\)/);
    assert.match(h, /decidirSobrante\('p1','misma'\)/);
  });

  test('«Era la misma plata» en el CRM: queda escrito en el disco, el Tablero deja de pedirlo y la caja lo dice', () => {
    const C = crm(pagoTodo);
    C.ev('confirm=()=>true');
    C.ev("decidirSobrante('p1','misma')");
    const enDisco = JSON.parse(C.almacen.joan_socios_v1).prestamos[0];
    assert.equal(enDisco.sobranteDecidido.destino, 'misma');
    assert.equal(enDisco.sobranteDecidido.monto, 60000);
    assert.equal(C.ev('avisoSobrantesPorDecidir()'), '');
    C.ev("verCredito('p1')");
    assert.match(plano(C.elems.mBody.innerHTML), /Lo que el cierre no conoció \$60\.000 · era la misma plata que entró al cierre: no suma nada/);
  });

  test('el Calendario dice la plata por decidir aparte de la ganancia', () => {
    const C = crm(perdon);
    C.ev("verDia('" + DIA + "')");
    const t = plano(C.elems.mBody.innerHTML);
    assert.match(t, /ganancia \$15\.000 · \$60\.000 que el cierre no conoció, por decidir/, t);
  });

  test('el celular dice que está por decidir, y no lo cuenta en su quincena hasta que Joan decida', () => {
    const E = abrirEspejo({ cartera: cartera(copia(perdon)), ahora: '2026-10-21T10:30:00' });
    E.ev("SEL.creditoId='p1'");
    assert.match(plano(E.ev('vistaCredito()')), /\$60\.000 que este cierre no conoció, por decidir\./);
    assert.equal(E.ev('gananciaDeQuincena(' + JSON.stringify(perdon.cicloPago) + ')'), 15000);
    const g = decidir(perdon, 'cobrar');
    const E2 = abrirEspejo({ cartera: cartera(g), ahora: '2026-10-21T10:30:00' });
    assert.equal(E2.ev('gananciaDeQuincena(' + JSON.stringify(g.cicloPago) + ')'), 75000, 'el celular no cuenta lo que Joan cobró');
  });
});

/* 9-nov-2026 — revisión de plata-e1 (leve a): en el celular, «Lo que registraste hoy» decía en la
   fila del cierre solo gananciaPago, y el total «Ganancia registrada hoy» sumaba además lo que Joan
   cobró de la plata que el cierre no conoció: la fila decía $0 y el total $10.000. */
describe('«Lo que registraste hoy» en el celular: las filas suman el total', () => {
  test('con «lo cobro», la fila del cierre dice lo mismo que el total', () => {
    const cerrado = CAMINOS['Se lo perdoné con pérdida (250.000)']().cerrado;
    const g = decidir(conAbonoDelOtro(q0, cerrado, 60000), 'cobrar');
    const E = abrirEspejo({ cartera: cartera(g), ahora: DIA + 'T18:00:00' });
    const t = plano(E.ev('vistaQuincena()'));
    const m = /Lo que registraste hoy (.*?) Ganancia registrada hoy (\$[\d.]+)/.exec(t);
    assert.ok(m, 'no encontré «Lo que registraste hoy»: ' + t.slice(0, 400));
    assert.equal(m[2], '$10.000', 'el total cambió: ' + m[0]);
    const filas = (m[1].match(/\$[\d.]+(?= |$)/g) || []);
    assert.equal(filas[filas.length - 1], '$10.000', 'la fila del cierre no suma el total: ' + m[1]);
  });
});

/* 9-nov-2026 — revisión de plata-e1 (leve f): el detalle de un crédito cerrado cuyo abono del otro
   aparato pasaba de la pérdida decía «Capital $240.000»: lo prestado menos ese abono, una cifra que
   no es ni lo prestado ni lo que se debe. Cerrado, se dice lo prestado. */
describe('el detalle de un crédito cerrado dice lo prestado', () => {
  const capital = f => {
    const C = abrirPanel({ ahora: '2026-10-21T10:30:00' });
    C.cargarCartera({ socios: [copia(SOCIO)], prestamos: [copia(f)], config: { negocio: 'Tu Garantía' } });
    C.ev("verCredito('p1')");
    return plano(C.elems.mBody.innerHTML);
  };

  test('con el abono del otro aparato, pase o no de la pérdida, y con cualquier decisión', () => {
    const conPerdida = CAMINOS['Se lo perdoné con pérdida (250.000)']().cerrado;
    const pagoTodo = CAMINOS['CRM · Pagó todo']().cerrado;
    [conAbonoDelOtro(q0, conPerdida, 60000), decidir(conAbonoDelOtro(q0, conPerdida, 60000), 'cobrar'),
     conAbonoDelOtro(q0, pagoTodo, 60000), decidir(conAbonoDelOtro(q0, pagoTodo, 60000), 'misma')].forEach((f, i) => {
      const t = capital(f);
      assert.match(t, /Capital prestado \$300\.000/, 'caso ' + i + ': ' + t.slice(0, 200));
      assert.doesNotMatch(t, /Capital \$240\.000/, 'caso ' + i);
    });
  });

  test('CONTROL: abierto, sigue diciendo el capital que se debe', () => {
    const abierto = Object.assign(copia(q0), { abonosCapital: [ABONO(60000)] });
    assert.match(capital(abierto), /Capital \$240\.000/);
  });
});

/* 9-nov-2026 — revisión de plata-e1, cuarta tanda: en el CELULAR (vistaCredito) el detalle de un
   crédito cerrado sin pérdida decía «Saldo de capital del crédito $240.000» cuando traía un abono
   del otro aparato que el cierre no conoció, también después de «Lo cobro»: lo prestado menos ese
   abono. La leve f se había arreglado solo en el computador. */
describe('el detalle del celular, con un crédito cerrado, dice lo prestado', () => {
  const detalle = f => {
    const E = abrirEspejo({ cartera: cartera(copia(f)), ahora: '2026-10-21T10:30:00' });
    E.ev("SEL.creditoId='p1'");
    return plano(E.ev('vistaCredito()'));
  };

  test('con el abono del otro aparato, por decidir o decidido, y sin él', () => {
    const pagoTodo = CAMINOS['CRM · Pagó todo']().cerrado;
    const conPerdida = CAMINOS['Se lo perdoné con pérdida (250.000)']().cerrado;
    const sinPerdida = CAMINOS['CRM · Se lo perdoné sin pérdida (315.000)']().cerrado;
    [pagoTodo, conAbonoDelOtro(q0, pagoTodo, 60000), decidir(conAbonoDelOtro(q0, pagoTodo, 60000), 'aFavor'),
     decidir(conAbonoDelOtro(q0, conPerdida, 60000), 'cobrar'), decidir(conAbonoDelOtro(q0, sinPerdida, 60000), 'cobrar')]
      .forEach((f, i) => {
        const t = detalle(f);
        assert.match(t, /Capital prestado \$300\.000/, 'caso ' + i + ': ' + t.slice(0, 400));
        assert.doesNotMatch(t, /Saldo de capital del crédito/, 'caso ' + i + ': un crédito cerrado no tiene saldo');
      });
  });

  test('CONTROL: con pérdida dice la pérdida, y abierto sigue diciendo el saldo', () => {
    const conPerdida = CAMINOS['Se lo perdoné con pérdida (250.000)']().cerrado;
    assert.match(detalle(conAbonoDelOtro(q0, conPerdida, 60000)), /Capital perdido al cerrar \$50\.000/);
    const abierto = Object.assign(copia(q0), { abonosCapital: [ABONO(60000)] });
    assert.match(detalle(abierto), /Saldo de capital del crédito \$240\.000/);
  });
});
