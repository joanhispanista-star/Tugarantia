/* ============================================================================
 * CERRAR EL CRÉDITO CON LO QUE JOAN DIGA — la hoja de cobro del CRM — 30-oct-2026
 *
 *   cd pruebas && node --test cerrar-con-perdon-crm.test.js
 *
 * La ley vive en app/puente.js (cerrar-con-perdon.test.js). Este archivo prueba
 * la PANTALLA: arranca panel/crm.html de verdad con el banco de siempre
 * (banco-panel.js), escribe el monto, toca «Se lo perdoné», escribe el motivo,
 * marca la casilla y registra, tal como lo haría Joan, en los cuatro tipos de
 * crédito. Y mira lo que queda: el crédito cerrado, la condonación con su
 * capital aparte, «Capital perdido» en el tablero, en la tabla de quincenas y
 * en la ficha, y «Entró de verdad» en el crédito.
 *
 * Lo que no se puede romper, y también se vigila: el cobro de siempre, «Queda
 * debiendo», el perdón que cabe en mora + costo y el abono a una cuota.
 * El reloj va congelado en cada prueba (`ahora`): la mora depende del día.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const RAIZ = path.join(__dirname, '..');
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const PU = require(path.join(RAIZ, 'app', 'puente.js'));

const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const SOCIO = { id: 's1', numero: 1, nombre: 'Marta Gómez', telefono: '3001234567', gestiones: [] };

function quincenal() {
  return { id: 'p1', numero: 1, socioId: 's1', socioNombre: 'Marta Gómez', capital: 300000, costoPct: 20,
    fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false };
}
function aCuotas() {
  const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
    { fechaDesembolso: '2026-10-16' });
  return { id: 'p1', numero: 1, socioId: 's1', socioNombre: 'Marta Gómez', capital: 650000, costoPct: 20,
    fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: PU.planPagosDeAlta(plan) };
}
function conPacto() {
  const q = quincenal();
  q.capital = 400000;
  const db = { socios: [SOCIO], prestamos: [q] };
  const pa = PU.pactarProximoPago(db, q, { fecha: '2026-11-06', monto: 450000 }, '2026-10-10');
  q.planPagos = pa.registros.planPagos;
  q.cicloActual = pa.registros.cicloActual;
  return q;
}
function planDel8() {
  const plan = M.construirPlanDePagos({ capital: 300000, fecha_corte: '2026-10-15', estado: 'en_corte' }, { desde: '2026-10-20' });
  const q = quincenal();
  q.cicloActual = plan.cuotas[0].fecha_corte;
  q.prorrogas = [{ fecha: '2026-10-15', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, nuevoCiclo: '2026-10-31' }];
  q.planPagos = { creado: '2026-10-20', tasa_por_corte: plan.tasa_por_corte,
    entrada: { fecha: '2026-10-20', ciclo: '2026-10-15', monto: 60000, mora: 0, aTiempo: true, diasMora: 0 },
    total_capital: plan.total_capital, total_costo: plan.total_costo, total_a_pagar: plan.total_a_pagar,
    cuotas: plan.cuotas.map(c => ({ n: c.numero, fecha: c.fecha_corte, capital: c.capital, costo: c.costo,
      total: c.total, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 })) };
  return q;
}

/* Un CRM con el crédito adentro, el reloj en `ahora`, y los confirm anotados:
   dice que sí a todo menos al WhatsApp (que abriría una ventana). */
function crmCon(ahora, credito) {
  const P = abrirPanel({ ahora });
  P.cargarCartera({ socios: [JSON.parse(JSON.stringify(SOCIO))], prestamos: [credito],
    config: { negocio: 'Tu Garantía' } });
  P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("WhatsApp")<0; }');
  return P;
}
const poner = (P, id, v) => P.ev("document.getElementById('" + id + "').value=" + JSON.stringify(String(v)));
const cred = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
/* El botón primario, preguntado con pintarBoton: es la MISMA decisión que pinta
   la hoja (decisionDeLaHoja), y en el banco el botón que vive dentro del HTML
   de #pgAccion no es un elemento: pintarBoton sí lo crea y le pone su texto. */
const boton = P => { P.ev("pintarBoton('p1')"); return P.elems.pgBtn.textContent; };
const apagado = P => { P.ev("pintarBoton('p1')"); return P.elems.pgBtn.disabled; };
const dif = P => texto(P.elems.pgDif.innerHTML);
const vistos = P => JSON.parse(P.ev('JSON.stringify(__vistos)'));
function abrirCobro(P, fecha) { P.ev("abrirPago('p1')"); poner(P, 'pgFecha', fecha); P.ev("calcPago('p1')"); }
function escribir(P, monto) { poner(P, 'pgMonto', monto); P.ev("cambioMonto('p1')"); }
function motivo(P, m) { P.ev('_cobro.motivo=' + JSON.stringify(m) + ";pintarBoton('p1')"); }
function casilla(P, x) { P.ev("_cobro.entiende=" + x + ";pintarBoton('p1')"); }

/* ==========================================================================
 * 1. QUINCENAL: LA MAQUETA EN LA HOJA DE VERDAD
 * ======================================================================== */
describe('1 · quincenal: debía 375.000 y trae 250.000, como la maqueta', () => {

  test('«Se lo perdoné» enseña el recuadro, pide motivo y casilla, y el botón dice lo que va a pasar', () => {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    assert.equal(Number(P.elems.pgMonto.value), 375000, 'el campo no arranca con lo que debía');
    escribir(P, 250000);
    assert.match(dif(P), /Faltan \$125\.000\. ¿Qué pasó\?/);
    P.ev("modoCobro('p1','perdon')");
    const d = dif(P);
    assert.match(d, /Lo que le perdonas: \$125\.000/);
    assert.match(d, /Mora \$15\.000/);
    assert.match(d, /Costo \$60\.000/);
    assert.match(d, /Capital \(pérdida: plata tuya que no vuelve\) \$50\.000/);
    assert.match(d, /No le suma garantía/);
    assert.match(d, /¿Por qué se lo perdonas\?/);
    assert.match(d, /Entiendo que pierdo \$50\.000 de capital/);
    assert.doesNotMatch(d, /no cabe/, 'volvió el «no cabe» del 2-sep');
    /* El bloque de arriba: el capital que se pierde en su renglón, y garantía $0. */
    const arriba = texto(P.elems.pgCalc.innerHTML);
    assert.match(arriba, /Capital que pierdes .*− \$50\.000/);
    assert.match(arriba, /Total para saldar \$250\.000/);
    assert.match(arriba, /Garantía que le deja \$0/);
    assert.match(arriba, /\$50\.000 son capital tuyo que no vuelve/);
    /* El botón no deja cerrar hasta tener motivo y casilla. */
    assert.equal(apagado(P), true);
    assert.match(boton(P), /Falta el motivo/);
    motivo(P, 'se quedó sin trabajo');
    assert.match(boton(P), /Marca «Entiendo que pierdo \$50\.000 de capital»/);
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).pagado, false, 'cerró sin la casilla');
    casilla(P, 50000);
    assert.equal(apagado(P), false);
    assert.equal(boton(P), 'Cerrar el crédito: recibió $250.000');
  });

  test('registrado: el crédito cerrado con lo que entró y la condonación con su capital aparte', () => {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    escribir(P, 250000);
    P.ev("modoCobro('p1','perdon')");
    motivo(P, 'se quedó sin trabajo');
    casilla(P, 50000);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true, 'no cerró el crédito');
    assert.equal(p.fechaPagado, '2026-10-20');
    assert.equal(p.montoRecibido, 250000);
    assert.equal(p.capitalPerdido, 50000);
    assert.equal(p.gananciaPago, 0);
    assert.equal(p.moraCausada, 15000);
    assert.equal(p.condonaciones.length, 1);
    const k = p.condonaciones[0];
    assert.deepEqual({ costo: k.costo, mora: k.mora, capital: k.capital, motivo: k.motivo, sobre: k.sobre, quien: k.quien },
      { costo: 60000, mora: 15000, capital: 50000, motivo: 'se quedó sin trabajo', sobre: 'cierre', quien: 'computador' });
    /* El confirm dijo la pérdida con todas las letras. */
    const c = vistos(P).find(t => /Cerrar el crédito de Marta/.test(t));
    assert.ok(c, 'no hubo confirm del cierre');
    assert.match(c, /CAPITAL: \$50\.000 — pérdida: plata tuya que no vuelve/);
    assert.match(c, /Motivo: se quedó sin trabajo/);
    assert.match(c, /No le suma garantía/);
    /* Es exactamente lo que dice el puente: la pantalla no hizo cuentas. */
    const r = PU.cierreConPerdon({ socios: [SOCIO], prestamos: [quincenal()] }, quincenal(), '2026-10-20', 250000,
      { motivo: 'se quedó sin trabajo', entiende: true });
    const sinId = x => Object.assign({}, x, { id: undefined });
    assert.deepEqual(sinId(k), sinId(r.registros.condonacion));
    Object.keys(r.registros.credito).forEach(f => assert.deepEqual(p[f], r.registros.credito[f], 'el campo ' + f + ' no es el del puente'));
  });

  test('la casilla vale solo para la cifra que se marcó: cambiar el monto la desmarca', () => {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    escribir(P, 250000);
    P.ev("modoCobro('p1','perdon')");
    motivo(P, 'x');
    casilla(P, 50000);
    assert.equal(boton(P), 'Cerrar el crédito: recibió $250.000');
    escribir(P, 200000);
    assert.match(boton(P), /Marca «Entiendo que pierdo \$100\.000 de capital»/);
    assert.match(dif(P), /Entiendo que pierdo \$100\.000 de capital/);
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).pagado, false, 'la casilla de 50.000 sirvió para cerrar perdiendo 100.000');
  });

  test('trae 330.000: el perdón cabe en mora + costo y va por el camino de siempre, sin pérdida', () => {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    escribir(P, 330000);
    P.ev("modoCobro('p1','perdon')");
    assert.doesNotMatch(dif(P), /Entiendo que pierdo/);
    assert.match(dif(P), /Se perdonan \$15\.000 de mora \+ \$30\.000 de costo/);
    motivo(P, 'cliente viejo');
    assert.match(boton(P), /✓ Registrar \$330\.000 con \$45\.000 de descuento/);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(p.capitalPerdido, 0, 'el cierre sin pérdida no dijo su pérdida (0)');
    assert.deepEqual({ costo: p.condonaciones[0].costo, mora: p.condonaciones[0].mora }, { costo: 30000, mora: 15000 });
    assert.equal(p.condonaciones[0].capital, undefined, 'el perdón de siempre cambió de forma');
    assert.equal(p.gananciaPago, 30000);
  });

  test('con $0: cierra igual, todo el capital es pérdida', () => {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    escribir(P, 0);
    P.ev("modoCobro('p1','perdon')");
    motivo(P, 'falleció el esposo');
    casilla(P, 300000);
    assert.equal(boton(P), 'Cerrar el crédito: recibió $0');
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).capitalPerdido, 300000);
  });

  test('lo de siempre no cambió: «Pagó todo», «Queda debiendo» y «Abonó y el resto pasa…» siguen ahí', () => {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    assert.match(boton(P), /✓ Pagó todo \(\$375\.000\)/);
    assert.match(texto(P.elems.pgAccion.innerHTML), /Abonó y el resto pasa a la próxima quincena/);
    escribir(P, 100000);
    assert.match(dif(P), /Queda debiendo \(misma fecha\)/);
    P.ev("modoCobro('p1','debe')");
    assert.match(boton(P), /Abonar \$100\.000 a capital/);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, false, 'un abono cerró el crédito');
    assert.equal(p.abonosCapital.length, 1);
    assert.equal((p.condonaciones || []).length, 0);
  });
});

/* ==========================================================================
 * 2. A CUOTAS
 * ======================================================================== */
describe('2 · a cuotas: el perdón cierra el crédito entero', () => {

  test('trae 500.000 el 5-nov: se le ofrece «Se lo perdoné», y cierra perdiendo 150.000', () => {
    const P = crmCon('2026-11-05T10:30:00', aCuotas());
    abrirCobro(P, '2026-11-05');
    assert.match(texto(P.elems.pgCalc.innerHTML), /« ?Se lo perdoné ?» cierra el crédito entero/,
      'el aviso del crédito a cuotas sigue diciendo que no tiene descuento');
    assert.match(P.elems.pgPista.innerHTML, /¿No puede pagar más\?/);
    escribir(P, 500000);
    assert.match(dif(P), /Se lo perdoné: cerrar el crédito con \$500\.000/);
    P.ev("modoCobro('p1','perdon')");
    const d = dif(P);
    assert.match(d, /Lo que le perdonas: \$364\.500/);
    assert.match(d, /Capital \(pérdida: plata tuya que no vuelve\) \$150\.000/);
    assert.match(d, /Debía hoy \$864\.500 por todo el crédito/);
    assert.match(d, /No se lo perdoné: volver/);
    motivo(P, 'quedó sin trabajo');
    casilla(P, 150000);
    assert.equal(boton(P), 'Cerrar el crédito: recibió $500.000');
    assert.match(texto(P.elems.pgCalc.innerHTML), /Garantía que le deja cerrarlo así \$0/);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(p.capitalPerdido, 150000);
    assert.equal(p.montoRecibido, 500000);
    assert.ok(p.planPagos.cuotas.every(c => c.pagado), 'quedó una cuota abierta');
    assert.equal(p.planPagos.cuotas[1].capitalPerdido, 150000);
    assert.deepEqual(p.abonosCapital.map(a => [a.cuotaPlan, a.monto]), [[1, 325000], [2, 175000]]);
    assert.equal(p.condonaciones[0].capital, 150000);
    /* El crédito dice la pérdida, sin llamarla deuda. */
    P.ev("verCredito('p1')");
    const v = texto(P.elems.mBody.innerHTML);
    assert.match(v, /Capital prestado \$650\.000/);
    assert.match(v, /Capital perdido al cerrar \$150\.000/);
    assert.match(v, /Entró de verdad \$500\.000/);
    assert.match(v, /Cuota 1 .*Cerrada con perdón/, 'la cuota 1 dice «Pagada» aunque se le perdonaron costo y mora');
    assert.match(v, /↳ capital perdido al cerrar \$150\.000/);
  });

  test('un abono sigue siendo un abono; el perdón es una salida que se elige y se puede deshacer', () => {
    const P = crmCon('2026-11-05T10:30:00', aCuotas());
    abrirCobro(P, '2026-11-05');
    /* Sin tocar el campo (la cuota de siempre) no se ofrece nada nuevo. */
    assert.doesNotMatch(dif(P), /Se lo perdoné/);
    escribir(P, 100000);
    assert.match(boton(P), /Abono de \$100\.000 a la cuota 1/);
    assert.match(dif(P), /Se lo perdoné: cerrar el crédito con \$100\.000/);
    P.ev("modoCobro('p1','perdon')");
    assert.match(boton(P), /Falta el motivo/);
    P.ev("modoCobro('p1','ninguno')");
    assert.match(boton(P), /Abono de \$100\.000 a la cuota 1/, '«volver» no devolvió el abono');
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, false, 'el abono cerró el crédito');
    assert.equal(p.abonosCapital.length, 1);
    assert.equal((p.condonaciones || []).length, 0);
  });

  test('la cuota entera sigue cobrándose como siempre', () => {
    const P = crmCon('2026-10-30T10:30:00', aCuotas());
    abrirCobro(P, '2026-10-30');
    assert.match(boton(P), /Pagó la cuota 1 \(\$455\.000\)/);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.planPagos.cuotas[0].pagado, true);
    assert.equal(p.pagado, false);
  });
});

/* ==========================================================================
 * 3. PAGO ACORDADO Y PLAN DEL §8
 * ======================================================================== */
describe('3 · el pago acordado y el plan del §8', () => {

  test('pago acordado: el 10-nov trae 300.000 y se cierra perdiendo 100.000', () => {
    const P = crmCon('2026-11-10T10:30:00', conPacto());
    abrirCobro(P, '2026-11-10');
    assert.match(texto(P.elems.pgCalc.innerHTML), /« ?Se lo perdoné ?» cierra el crédito con lo que traiga/);
    escribir(P, 300000);
    P.ev("modoCobro('p1','perdon')");
    assert.match(dif(P), /Lo que le perdonas: \$166\.000/);
    assert.match(dif(P), /Capital \(pérdida: plata tuya que no vuelve\) \$100\.000/);
    motivo(P, 'se le murió la mamá');
    casilla(P, 100000);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(p.capitalPerdido, 100000);
    assert.equal(p.condonaciones.find(k => k.sobre === 'cierre').capital, 100000);
  });

  test('plan del §8: ahora tiene campo; sin tocarlo cobra la cuota, y con otra cifra ofrece el perdón', () => {
    const P = crmCon('2026-11-03T10:30:00', planDel8());
    abrirCobro(P, '2026-11-03');
    assert.equal(P.elems.pgMontoBox.style.display, '', 'el plan del §8 sigue sin dónde escribir lo que trajo');
    assert.match(boton(P), /✓ Pagó la cuota 1/);
    assert.doesNotMatch(texto(P.elems.pgCalc.innerHTML), /no está disponible para los planes/);
    escribir(P, 200000);
    assert.match(boton(P), /Faltan|más que la cuota/);
    assert.equal(apagado(P), true, 'otra cifra sin decir qué pasó registraría la cuota');
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).planPagos.cuotas[0].pagado, false, 'registró la cuota con otra cifra escrita');
    assert.match(dif(P), /Se lo perdoné: cerrar el crédito con \$200\.000/);
    P.ev("modoCobro('p1','perdon')");
    assert.match(dif(P), /el que el plan del §8 tiene fijo/);
    motivo(P, 'no puede más');
    casilla(P, 100000);
    assert.equal(boton(P), 'Cerrar el crédito: recibió $200.000');
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(p.capitalPerdido, 100000);
    /* «Me equivoqué» en el §8 vuelve a la cuota. */
    const Q = crmCon('2026-11-03T10:30:00', planDel8());
    abrirCobro(Q, '2026-11-03');
    escribir(Q, 50000);
    Q.ev("modoCobro('p1','error')");
    assert.match(boton(Q), /✓ Pagó la cuota 1/);
  });

  /* 4-nov-2026 — la cifra que un cliente del §8 conoce y trae es la cuota. Con otra
     cifra aparecía «Se lo perdoné»; con la cuota exacta, no, aunque la pista dice
     «Escribe lo que trajo». Y el camino obvio, cobrar la cuota y cerrar con $0, da
     otra cuenta: esa plata va a mora y costo, no primero al capital. */
  test('plan del §8: la cuota exacta ESCRITA también ofrece el perdón, y primero al capital', () => {
    const P = crmCon('2026-11-03T10:30:00', planDel8());
    abrirCobro(P, '2026-11-03');
    assert.doesNotMatch(dif(P), /Se lo perdoné/, 'con el campo sin tocar es el cobro de siempre');
    const cuota = Number(P.elems.pgMonto.value);
    assert.ok(cuota > 0 && cuota < 300000, 'la prueba necesita una cuota menor que el capital: ' + cuota);
    const enPesos = '$' + cuota.toLocaleString('es-CO');
    escribir(P, cuota);
    assert.match(boton(P), /✓ Pagó la cuota 1/, 'cobrar la cuota sigue siendo la salida de siempre');
    assert.ok(dif(P).includes('Se lo perdoné: cerrar el crédito con ' + enPesos),
      'con la cuota escrita no ofrece el perdón, y la pista lo promete: ' + dif(P));
    P.ev("modoCobro('p1','perdon')");
    motivo(P, 'no puede más');
    casilla(P, 300000 - cuota);
    assert.equal(boton(P), 'Cerrar el crédito: recibió ' + enPesos);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(p.montoRecibido, cuota);
    assert.equal(p.capitalPerdido, 300000 - cuota, 'la plata no fue primero al capital');
  });

  test('plan del §8: con la cuota exacta, cobrarla sigue cobrándola; y en la última no hay nada que perdonar', () => {
    const P = crmCon('2026-11-03T10:30:00', planDel8());
    abrirCobro(P, '2026-11-03');
    const cuota = Number(P.elems.pgMonto.value);
    escribir(P, cuota);
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).pagado, false, 'cobrar la cuota cerró el crédito');
    assert.equal(cred(P).planPagos.cuotas[0].pagado, true, 'no cobró la cuota');
    /* La última: la cuota es toda la deuda. */
    const u = planDel8();
    u.planPagos.cuotas.slice(0, -1).forEach(c => { c.pagado = true; c.fechaPagado = '2026-10-25'; });
    const Q = crmCon('2026-10-26T10:30:00', u);
    abrirCobro(Q, '2026-10-26');
    escribir(Q, Number(Q.elems.pgMonto.value));
    assert.doesNotMatch(dif(Q), /Se lo perdoné/, 'ofrece perdonar con la plata que paga todo');
  });
});

/* ==========================================================================
 * 4. LOS INFORMES: «CAPITAL PERDIDO» AL LADO DE «DESCUENTOS DADOS»
 * ======================================================================== */
describe('4 · los informes dicen la pérdida aparte de la ganancia', () => {

  function cerradoConPerdida() {
    const P = crmCon('2026-10-20T10:30:00', quincenal());
    abrirCobro(P, '2026-10-20');
    escribir(P, 250000);
    P.ev("modoCobro('p1','perdon')");
    motivo(P, 'se quedó sin trabajo');
    casilla(P, 50000);
    P.ev("registrarCobro('p1')");
    return P;
  }

  test('el resumen del ciclo y la tabla de quincenas: «Capital perdido» pegado a los descuentos', () => {
    const P = cerradoConPerdida();
    /* El ciclo del tablero es el del reloj (31-oct); el cierre es de la quincena
       del corte que se cumplía (15-oct): se mira esa fila. */
    P.ev('renderCiclos()');
    const t = texto(P.elems.tblCiclos.innerHTML);
    assert.match(t, /Descuentos dados ya restados de la ganancia Capital perdido no está en la ganancia: no vuelve/);
    assert.match(t, /15 de oct de 2026 .*\$0 \$75\.000 mora \$15\.000 · costo \$60\.000 · 1 cliente \$50\.000 1 cliente/);
    /* La ganancia del ciclo no mezcla la pérdida: es lo que entró ($0). */
    assert.equal(P.ev("gananciaDeQuincena('2026-10-15')"), 0);
    /* El KPI está al lado del de descuentos. */
    P.ev('renderKpis()');
    const k = texto(P.elems.kpis.innerHTML);
    assert.match(k, /Descuentos dados .* Capital perdido/);
    assert.equal(P.ev("PUENTE.capitalPerdidoDeQuincena(DB,'2026-10-15').capital"), 50000);
  });

  test('el KPI del ciclo actual cuenta la pérdida del ciclo actual', () => {
    /* Un crédito que vence el 31-oct, cerrado el 30-oct con pérdida. */
    const p = quincenal(); p.cicloActual = '2026-10-31'; p.fechaDesembolso = '2026-10-16';
    const P = crmCon('2026-10-30T10:30:00', p);
    abrirCobro(P, '2026-10-30');
    escribir(P, 200000);
    P.ev("modoCobro('p1','perdon')"); motivo(P, 'x'); casilla(P, 100000);
    P.ev("registrarCobro('p1')");
    P.ev('renderKpis()');
    assert.match(texto(P.elems.kpis.innerHTML), /Capital perdido \$100\.000 1 cliente · créditos con corte del .+ · plata tuya que no vuelve/);
  });

  test('la ficha del cliente: «Capital perdido con él» junto a los descuentos', () => {
    const P = cerradoConPerdida();
    P.ev("verCliente('s1')");
    const f = texto(P.elems.mBody.innerHTML);
    assert.match(f, /Descuentos que le has dado \$125\.000 en 1 perdón \(\$15\.000 de mora \+ \$60\.000 de costo \+ \$50\.000 de capital\)/);
    assert.match(f, /Capital perdido con él \$50\.000 en 1 crédito · plata tuya que no vuelve/);
  });

  test('el crédito: «Entró de verdad» con el capital aparte, y lo que te dejó en rojo', () => {
    const P = cerradoConPerdida();
    P.ev("verCredito('p1')");
    const v = texto(P.elems.mBody.innerHTML);
    assert.match(v, /Entró de verdad \$250\.000 con \$125\.000 perdonados al cerrar \(\$75\.000 de mora y costo \+ \$50\.000 de capital ?\): se quedó sin trabajo/);
    assert.match(v, /Capital perdido al cerrar \$50\.000 · plata tuya que no vuelve: de los \$300\.000 prestados volvieron \$250\.000/);
    assert.match(v, /Este crédito te dejó .*-\$50\.000 · -16,7%/);
    assert.match(P.elems.mBody.innerHTML, /class="pierde">-\$50\.000/);
  });
});

/* 9-nov-2026 — la segunda ronda, en un iPhone (390 px): el chip «Cerrada con perdón
   04 de nov de 2026» se salía del cuadro y «Entró de verdad» se partía «verda / d».
   Lo que se ve se midió en Chrome sin ventana (antes: chip hasta 417 px con el cuadro
   en 370, barra de lado, etiqueta de 39 px; después: nada fuera). Aquí se cuida que
   las piezas sigan puestas. */
describe('el detalle de un cierre con perdón cabe en un iPhone', () => {
  test('«Entró de verdad» es un renglón largo y el chip parte si no cabe (solo en pantalla chica)', () => {
    const hoja = require('node:fs').readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    assert.match(hoja, /<div class="info-row fila-larga"><span class="k">Entró de verdad<\/span>/);
    const chica = hoja.slice(hoja.indexOf('@media (max-width:560px){\r\n    .info-row.con-botones .vv{text-align:left}') >= 0
      ? hoja.indexOf('@media (max-width:560px){\r\n    .info-row.con-botones .vv{text-align:left}')
      : hoja.indexOf('@media (max-width:560px){\n    .info-row.con-botones .vv{text-align:left}'));
    const bloque = chica.slice(0, chica.indexOf('\n  }'));
    assert.match(bloque, /#mBody \.info-row \.vv \.chip\{white-space:normal\}/);
    assert.match(bloque, /#mBody \.info-row\.fila-larga\{flex-wrap:wrap\}/);
    assert.match(bloque, /#mBody \.info-row\.fila-larga \.vv\{flex:1 1 100%;min-width:0;text-align:left\}/);
  });
});
