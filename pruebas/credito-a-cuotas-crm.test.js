/* ============================================================================
 * EL CRÉDITO A CUOTAS EN EL COMPUTADOR — 16-oct-2026
 *
 *   node --test pruebas/credito-a-cuotas-crm.test.js
 *
 * El pedido de Joan, con su caso: «tengo el caso de un préstamo a cuotas de
 * 650.000: paga la primera cuota el 30 de este mes = 20% de 650.000 + la mitad
 * del capital = 455.000, y los 325.000 restantes el 15 de noviembre más el 20%
 * (65.000) = 390.000. Quiero poder tener la opción de un registro a cuotas y
 * que el porcentaje y las fechas de pago de cada cuota lo pueda modificar yo».
 *
 * Las cuentas (motor.js y puente.js) tienen sus propias pruebas. Este archivo
 * prueba la PANTALLA: arranca crm.html de verdad con el banco de siempre
 * (banco-panel.js), llena el formulario, toca los botones y lee lo que el CRM
 * le dice a Joan y lo que guarda. Las decisiones de Joan del 16-oct que vigila:
 *
 *   1. la fecha que él pone se respeta aunque caiga domingo o festivo, pero se
 *      AVISA con la mora que le correría al cliente (15-nov-2026 es domingo y
 *      el 16 festivo: 2 días, $6.500);
 *   2. pagar todo antes: el costo de las cuotas que no han empezado no se
 *      cobra (todo el 30-oct = 780.000);
 *   3. un abono a la cuota va a mora, costo y capital, y lo que falta sigue en
 *      ESA cuota (100.000 el 5-nov = 19.500 + 80.500 + 0);
 *   4. solo se reprograman cuotas no vencidas, no pagadas y sin abonos, y cada
 *      cambio queda anotado.
 *
 * El reloj va congelado en cada prueba (`ahora`): la mora depende del día, y
 * una prueba que dependiera de cuándo se corre no sería una prueba. OJO: lo
 * que el CRM le pregunta al puente SIN fecha (totalCiclo, K) va con el reloj
 * del puente, no con el de la página; por eso esas cifras se leen de la página
 * y no se escriben a mano.
 *
 * 17-oct-2026, revisión adversaria — al final, un bloque por hallazgo: pagar
 * todo va primero (325.000 el 30-oct tras la cuota 1 cierran el crédito), la
 * cuota del medio que no ha empezado no se cierra sola, cerrar una cuota es
 * UNA cuenta del puente (cierreDeCuota), una garantía por hoja, rótulos de «lo
 * que falta», la E.A. de la lista por fechas, «si paga todo hoy», lo vencido
 * con dos cuotas, y decir NO a cada confirm no escribe nada.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const PU = require(path.join(RAIZ, 'app', 'puente.js'));

const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* El crédito de Joan, guardado como lo guarda el alta (la forma del puente). */
function creditoDeJoan(cuotas) {
  const plan = M.construirPlanACuotas(650000, cuotas || [
    { fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }
  ], { fechaDesembolso: '2026-10-16' });
  return {
    id: 'p1', numero: 1, socioId: 's1', socioNombre: 'Carlos Rincón', telefono: '3112457788',
    capital: 650000, costoPct: plan.cuotas[0].pct, fechaDesembolso: '2026-10-16',
    cicloActual: plan.cuotas[0].fecha_corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: PU.planPagosDeAlta(plan)
  };
}
const SOCIO = { id: 's1', numero: 1, nombre: 'Carlos Rincón', telefono: '3112457788', gestiones: [] };

/* Un CRM con el crédito de Joan adentro, el reloj en `ahora` y los confirm
   anotados. Dice que sí a todo menos al WhatsApp (que abriría una ventana). */
function crmCon(ahora, prestamos) {
  const P = abrirPanel({ ahora });
  P.cargarCartera({ socios: [JSON.parse(JSON.stringify(SOCIO))],
    prestamos: prestamos || [creditoDeJoan()], config: { negocio: 'Tu Garantía' } });
  P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("WhatsApp")<0; }');
  return P;
}
const vistos = P => JSON.parse(P.ev('JSON.stringify(__vistos)'));
const avisos = P => (P.ctx._avisos || []).slice();
const poner = (P, id, v) => P.ev("document.getElementById('" + id + "').value=" + JSON.stringify(String(v)));
const cred = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos.find(x=>x.id==="p1"))'));

/* La hoja de cobro abierta en una fecha, como la abre Joan. */
function abrirCobro(P, fecha) {
  P.ev("abrirPago('p1')");
  poner(P, 'pgFecha', fecha);
  P.ev("calcPago('p1')");
}
function escribirMonto(P, monto) {
  poner(P, 'pgMonto', monto);
  P.ev("cambioMonto('p1')");
}

/* El formulario de alta lleno con el caso de Joan, en modo «A cuotas». */
function llenarAlta(P, o) {
  o = o || {};
  P.ev('nuevoCredito()');
  poner(P, 'qNombre', 'Carlos Rincón');
  poner(P, 'qTel', '3112457788');
  poner(P, 'qCap', o.capital || '650000');
  poner(P, 'qFecha', '2026-10-16');
  P.ev("modoAlta('cuotas')");
  poner(P, 'qaF1', '2026-10-30');
  poner(P, 'qaF2', '2026-11-15');
  if (o.pct2) poner(P, 'qaP2', o.pct2);
  P.ev('_alta.tocadas=true; calcAltaCuotas()');
}

/* =========================================================================
 * EL ALTA
 * ======================================================================= */
describe('el alta a cuotas, ejecutando la página', () => {

  test('el caso de Joan: 455.000 el 30-oct y 390.000 el 15-nov, con su plan guardado', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: { negocio: 'Tu Garantía' } });
    P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("bienvenida")<0; }');
    llenarAlta(P);
    P.ev('guardarRapido()');
    assert.equal(P.ev('DB.prestamos.length'), 1, 'el crédito a cuotas no se creó');
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.capital, 650000);
    assert.equal(p.costoPct, 20, 'costoPct es el % de la cuota 1');
    assert.equal(p.cicloActual, '2026-10-30', 'cicloActual es la fecha de la cuota 1');
    assert.equal(p.fechaDesembolso, '2026-10-16');
    assert.equal(p.planPagos.origen, 'alta');
    assert.equal(p.planPagos.entrada, null);
    assert.deepEqual(p.planPagos.cambios, []);
    assert.deepEqual(p.planPagos.cuotas.map(c => [c.n, c.fecha, c.pct, c.capital, c.costo, c.total, c.pagado]),
      [[1, '2026-10-30', 20, 325000, 130000, 455000, false],
       [2, '2026-11-15', 20, 325000, 65000, 390000, false]]);
    assert.equal(p.planPagos.total_costo, 195000);
    /* Y es EXACTAMENTE lo que el puente arma para el celular: una sola forma. */
    const plan = M.construirPlanACuotas(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }],
      { fechaDesembolso: '2026-10-16' });
    assert.deepEqual(p.planPagos, JSON.parse(JSON.stringify(PU.planPagosDeAlta(plan))));

    const conf = vistos(P).find(t => /¿Lo registro\?/.test(t));
    assert.ok(conf, 'no hubo confirm final con «¿Lo registro?»');
    assert.match(conf, /Cuota 1: \$455\.000 el 30-oct-2026 \(capital \$325\.000 \+ costo \$130\.000\)/);
    assert.match(conf, /Cuota 2: \$390\.000 el 15-nov-2026 \(capital \$325\.000 \+ costo \$65\.000\)/);
    assert.match(conf, /\$845\.000/, 'el total a devolver');
    assert.match(conf, /\$156\.000/, 'la garantía que le deja');
    assert.ok(!/CIFRA REDONDA/.test(conf), '650.000 es redonda: no hay nada que marcar');
  });

  test('decir que NO al confirm final no deja ni la ficha ni el crédito', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('confirm=t=>String(t).indexOf("¿Lo registro?")<0');
    llenarAlta(P);
    P.ev('guardarRapido()');
    assert.equal(P.ev('DB.prestamos.length'), 0);
    assert.equal(P.ev('DB.socios.length'), 0, 'la ficha quedó a medio crear');
  });

  test('un capital que no es múltiplo de mil lleva la marca de CIFRA REDONDA', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return false; }');
    llenarAlta(P, { capital: '649961' });
    P.ev('guardarRapido()');
    assert.ok(vistos(P).some(t => /NO ES UNA CIFRA REDONDA/.test(t) && /¿Lo registro\?/.test(t)));
  });

  test('el 15-nov es domingo y el 16 festivo: se respeta y se avisa con $6.500', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("bienvenida")<0; }');
    llenarAlta(P);
    const vista = texto(P.elems.qaCalc.innerHTML);
    assert.match(vista, /El 15-nov es domingo y el 16 festivo: si paga el primer día hábil \(17-nov\) le corren 2 días de mora, \$6\.500/);
    P.ev('guardarRapido()');
    const conf = vistos(P).find(t => /¿Lo registro\?/.test(t));
    assert.match(conf, /15-nov es domingo y el 16 festivo.*\$6\.500/, 'el confirm final tiene que repetir el aviso');
    assert.equal(P.ev('DB.prestamos[0].planPagos.cuotas[1].fecha'), '2026-11-15', 'la fecha NO se corre');
  });

  test('la vista previa sale del motor: tabla, totales, garantía y la E.A. real por fechas', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    llenarAlta(P);
    const v = texto(P.elems.qaCalc.innerHTML);
    assert.match(v, /30-oct-2026 20% \$325\.000 \$130\.000 \$455\.000/);
    assert.match(v, /15-nov-2026 ⚠️ 20% \$325\.000 \$65\.000 \$390\.000/);
    assert.match(v, /Ganancia \(costo de las cuotas\) \$195\.000/);
    assert.match(v, /Total a pagar \$845\.000/);
    assert.match(v, /Garantía que le deja .*\$156\.000/);
    const ea = require(path.join(RAIZ, 'app', 'creditos.js')).efectivoAnualPorFechas('2026-10-16', 650000,
      [{ fecha: '2026-10-30', total: 455000 }, { fecha: '2026-11-15', total: 390000 }]);
    const eaTxt = (ea * 100).toLocaleString('es-CO', { maximumFractionDigits: 0 }) + '%';
    assert.ok(v.indexOf('E.A. real, con estas fechas ' + eaTxt) >= 0, 'la E.A. no es la de las fechas reales: ' + eaTxt);
    /* Lo que el motor repartió se ve en el campo, sin escribirlo. */
    assert.equal(P.elems.qaK1.placeholder, '$325.000');
  });

  test('una cuota al 25% pide la confirmación aparte, con el año, el art. 305 y los pesos', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("bienvenida")<0; }');
    llenarAlta(P, { pct2: 25 });
    P.ev('guardarRapido()');
    const v = vistos(P);
    const extra = v.find(t => /POR ENCIMA DEL ESTÁNDAR/.test(t) && /art\. 305/.test(t));
    assert.ok(extra, 'no pidió la confirmación aparte');
    assert.match(extra, /cuota 2 \(25%\)/);
    assert.match(extra, /efectivo anual/);
    assert.match(extra, /\$211\.250 de costo por \$650\.000/, '130.000 + 25% de 325.000 = 211.250, en pesos');
    assert.ok(v.indexOf(extra) < v.findIndex(t => /¿Lo registro\?$/.test(t)), 'la aparte va ANTES del confirm final');
    assert.equal(P.ev('DB.prestamos[0].planPagos.cuotas[1].costo'), 81250);

    /* Y si dice que no a la aparte, no se crea nada. 17-oct-2026, revisión — el
       confirm de la prueba rechaza SOLO la aparte (la que nombra el art. 305):
       el que rechazaba todo lo que dijera «POR ENCIMA DEL ESTÁNDAR» rechazaba
       también el final (que lleva esa marca en la cuota 2), y la prueba pasaba
       aunque la aparte no frenara nada. Y el final no puede llegar a verse. */
    const Q = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    Q.cargarCartera({ socios: [], prestamos: [], config: {} });
    Q.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return !/art\\. 305/.test(String(t)); }');
    llenarAlta(Q, { pct2: 25 });
    Q.ev('guardarRapido()');
    assert.ok(vistos(Q).some(t => /art\. 305/.test(t)), 'la aparte no se mostró');
    assert.ok(!vistos(Q).some(t => /¿Lo registro\?$/.test(t)), 'después del NO a la aparte siguió al confirm final');
    assert.equal(Q.ev('DB.prestamos.length'), 0);
    assert.equal(Q.ev('DB.socios.length'), 0, 'la ficha quedó a medio crear');
  });

  test('al estándar no hay confirmación aparte; por encima del techo el motor lo frena', () => {
    let P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("bienvenida")<0; }');
    llenarAlta(P);
    P.ev('guardarRapido()');
    assert.ok(!vistos(P).some(t => /COSTO POR ENCIMA DEL ESTÁNDAR/.test(t)));

    P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    llenarAlta(P, { pct2: 51 });
    assert.match(texto(P.elems.qaCalc.innerHTML), /Cuota 2: .*50% es el techo/, 'el error del motor, en ámbar y con el rótulo de Joan');
    P.ev('guardarRapido()');
    assert.equal(P.ev('DB.prestamos.length'), 0, 'al 51% se creó');
    assert.ok(avisos(P).some(t => /No registré nada/.test(t)));
  });

  test('fechas que no crecen: la frase del motor, y no se registra', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    llenarAlta(P);
    poner(P, 'qaF2', '2026-10-29');
    P.ev('calcAltaCuotas()');
    assert.match(texto(P.elems.qaCalc.innerHTML), /Cuota 2: el 2026-10-29 no es después de la cuota anterior/);
    P.ev('guardarRapido()');
    assert.equal(P.ev('DB.prestamos.length'), 0);
  });

  test('los dos botones no reabren el modal; a cuotas esconde la quincena y el % único', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('nuevoCredito()');
    poner(P, 'qPaste', 'Hola, soy Carlos 311 245 7788, necesito 650.000');
    poner(P, 'qCap', '650000'); poner(P, 'qFecha', '2026-10-16');
    const html = P.elems.mBody.innerHTML;
    P.ev("modoAlta('cuotas')");
    assert.equal(P.elems.mBody.innerHTML, html, 'el modal se reabrió: se perdería lo pegado');
    assert.equal(P.elems.qPaste.value, 'Hola, soy Carlos 311 245 7788, necesito 650.000');
    assert.equal(P.elems.qaBloque.style.display, '');
    assert.equal(P.elems.qCicloBox.style.display, 'none', 'la próxima quincena no aplica a cuotas');
    assert.equal(P.elems.qCostoBox.style.display, 'none');
    assert.equal(P.elems.qCalc.style.display, 'none', 'la vista previa de un solo pago no va');
    assert.match(P.elems.qaModoCuotas.className, /btn-negro/);
    /* Por defecto: 2 cuotas, al estándar, en los cortes del motor. */
    assert.equal(P.elems.qaN.value, String(M.CUOTAS_ALTA_MIN));
    assert.deepEqual([P.elems.qaF1.value, P.elems.qaF2.value], M.cortesSiguientes('2026-10-16', 2));
    assert.equal(P.elems.qaP1.value, '20');
    /* Tres cuotas: lo escrito en las dos primeras se conserva. */
    poner(P, 'qaP1', '15');
    poner(P, 'qaN', '3'); P.ev('filasAlta()');
    assert.match(P.elems.qaFilas.innerHTML, /id="qaF3"/);
    assert.equal(P.elems.qaP1.value, '15');
    assert.equal(P.elems.qaF3.value, M.cortesSiguientes(P.elems.qaF2.value, 1)[0]);
    /* Y de vuelta a un solo pago, el formulario de siempre. */
    P.ev("modoAlta('uno')");
    assert.equal(P.elems.qCicloBox.style.display, '');
    assert.equal(P.elems.qaBloque.style.display, 'none');
  });

  test('«Repartir en partes iguales» deja que el motor reparta', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('var __vistos=[]; confirm=t=>String(t).indexOf("bienvenida")<0');
    llenarAlta(P);
    poner(P, 'qaK1', '400000');
    P.ev('calcAltaCuotas()');
    assert.match(texto(P.elems.qaCalc.innerHTML), /\$400\.000 \$130\.000 \$530\.000/, 'la cuota 1 con 400.000 de capital');
    P.ev('repartirAltaIguales()');
    assert.equal(P.elems.qaK1.value, '');
    P.ev('guardarRapido()');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(DB.prestamos[0].planPagos.cuotas.map(c=>c.capital))')), [325000, 325000]);
  });

  test('el alta de un solo pago sigue igual (y vuelve a serlo después de mirar las cuotas)', () => {
    const P = abrirPanel({ ahora: '2026-10-16T10:30:00' });
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    P.ev('var __vistos=[]; confirm=t=>{ __vistos.push(String(t)); return String(t).indexOf("bienvenida")<0; }');
    P.ev('nuevoCredito()');
    ['qNombre', 'qTel', 'qCap', 'qCosto', 'qFecha'].forEach((id, i) =>
      poner(P, id, ['María Pérez', '3001112233', '300000', '20', '2026-10-16'][i]));
    P.ev("modoAlta('cuotas')");
    P.ev("modoAlta('uno')");
    P.ev('guardarRapido()');
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.planPagos, undefined, 'un solo pago no lleva plan');
    assert.equal(p.cicloActual, M.calcularFechaCorte('2026-10-16'));
    assert.equal(P.ev('K(DB.prestamos[0])'), 60000);
    assert.ok(vistos(P).some(t => /Registrar el crédito de María Pérez/.test(t) && /Paga el:/.test(t)));
    /* Y un formulario nuevo arranca siempre en un solo pago. */
    P.ev('nuevoCredito()');
    assert.equal(P.ev('_alta.modo'), 'uno');
  });
});

/* =========================================================================
 * EL COBRO
 * ======================================================================= */
describe('el cobro de un crédito a cuotas', () => {

  test('la hoja dice qué es cada cifra: capital pendiente y «Cuota 1 de 2 · vence»', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    const h = texto(P.elems.mBody.innerHTML);
    assert.match(h, /Capital pendiente del crédito \$650\.000/);
    assert.match(h, /Cuota 1 de 2 · vence 30 de oct de 2026 \$325\.000 \+ \$130\.000 de costo \(20%\)/);
    assert.ok(!/Costo del ciclo/.test(h), 'el costo de una cuota no es «el del ciclo» al lado del capital entero');
    const acc = texto(P.elems.pgAccion.innerHTML);
    assert.match(acc, /Pagó la cuota 1 \(\$455\.000\)/);
    assert.match(acc, /Pagó todo el crédito \(\$780\.000\)/);
    assert.ok(!/Abonó y el resto pasa/.test(acc), 'con cuotas no se pasa el resto a la próxima quincena');
    assert.equal(P.elems.pgMontoBox.style.display, '', 'el «¿Cuánto pagó?» tiene que estar a la vista');
    assert.equal(P.elems.pgMonto.value, '455000');
  });

  test('cobrar la cuota 1 el 30-oct: la cierra, baja el capital y pasa a la 2', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.planPagos.cuotas[0].pagado, true);
    assert.equal(p.planPagos.cuotas[0].fechaPagado, '2026-10-30');
    assert.equal(p.planPagos.cuotas[0].recargo, 0);
    /* 17-oct-2026, segunda revisión — el abono de cierre trae además `recibido`:
       lo que entró ese día por esa cuota (lo que la nube coteja entre aparatos). */
    assert.deepEqual(p.abonosCapital, [{ fecha: '2026-10-30', monto: 325000, cuotaPlan: 1, recibido: 455000 }]);
    assert.equal(p.cicloActual, '2026-11-15');
    assert.equal(p.pagado, false);
    assert.ok(vistos(P).some(t => /Cobrar la cuota 1 de 2 a Carlos Rincón: \$455\.000/.test(t)));
    assert.equal(P.ev("gananciaCobrada(DB.prestamos[0])"), 130000);
  });

  test('un abono de 100.000 el 5-nov: 19.500 a la mora, 80.500 al costo, 0 al capital', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05');
    escribirMonto(P, 100000);
    assert.match(texto(P.elems.pgAccion.innerHTML), /Abono de \$100\.000 a la cuota 1/);
    const dif = texto(P.elems.pgDif.innerHTML);
    assert.match(dif, /\$19\.500 a la mora, \$80\.500 al costo y \$0 al capital/);
    assert.match(dif, /quedan \$374\.500/);
    P.ev("registrarCobro('p1')");
    const conf = vistos(P).find(t => /^Abono de \$100\.000/.test(t));
    assert.ok(conf, 'no confirmó el abono');
    assert.match(conf, /A la mora: \$19\.500/);
    assert.match(conf, /Al costo: \$80\.500/);
    assert.match(conf, /Al capital: \$0/);
    assert.match(conf, /queda debiendo \$374\.500/);
    const p = cred(P);
    assert.equal(p.abonosCapital.length, 1);
    const a = p.abonosCapital[0];
    assert.deepEqual([a.fecha, a.monto, a.cuotaPlan, a.parcial, a.recibido, a.moraPagada, a.costoPagado],
      ['2026-11-05', 0, 1, true, 100000, 19500, 80500]);
    assert.equal(p.planPagos.cuotas[0].pagado, false, 'un abono no cierra la cuota');
    assert.equal(p.planPagos.cuotas[0].fecha, '2026-10-30', 'ni le mueve la fecha');
    assert.equal(P.ev('gananciaCobrada(DB.prestamos[0])'), 100000, 'lo que entró a mora y costo ya es ganancia');
  });

  test('después del abono, cobrar lo que falta: 374.500, con la mora del abono en la cuota', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05');
    escribirMonto(P, 100000);
    P.ev("registrarCobro('p1')");
    P.ev('__vistos=[]');
    abrirCobro(P, '2026-11-05');
    const h = texto(P.elems.pgCalc.innerHTML);
    assert.match(h, /Ya abonó a esta cuota \(1 abono: mora \$19\.500 \+ costo \$80\.500\) \$100\.000/);
    /* 17-oct-2026, revisión — con abonos, el rótulo dice que es lo que FALTA. */
    assert.match(h, /Lo que falta de la cuota \$374\.500/);
    assert.ok(!/Total de la cuota/.test(h));
    assert.equal(P.elems.pgMonto.value, '374500');
    P.ev("registrarCobro('p1')");
    const conf = vistos(P).find(t => /Cobrar lo que falta de la cuota 1/.test(t));
    assert.ok(conf, 'el confirm no dice que es lo que falta');
    assert.match(conf, /\$374\.500/);
    assert.match(conf, /Ya abonó \$100\.000/);
    const p = cred(P);
    assert.equal(p.planPagos.cuotas[0].pagado, true);
    assert.equal(p.planPagos.cuotas[0].recargo, 19500, 'la mora de la cuota es la del abono más la de hoy (0)');
    assert.deepEqual(p.abonosCapital.filter(x => !x.parcial), [{ fecha: '2026-11-05', monto: 325000, cuotaPlan: 1, recibido: 374500 }],
      'a capital va lo PENDIENTE, una sola vez');
    assert.equal(P.ev('capitalActual(DB.prestamos[0])'), 325000);
    assert.equal(P.ev('gananciaCobrada(DB.prestamos[0])'), 149500, '130.000 de costo + 19.500 de mora, sin contar dos veces');
  });

  test('un monto que pasa la cuota no se registra: lo dice el puente', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    escribirMonto(P, 500000);
    assert.match(P.elems.pgDif.innerHTML, /completa la cuota 1/);
    P.ev("registrarCobro('p1')");
    assert.ok(avisos(P).some(t => /completa la cuota 1 \(\$455\.000\)/.test(t)));
    assert.deepEqual(cred(P).abonosCapital, []);
  });

  test('«Pagó todo el crédito» el 30-oct: 780.000, la cuota 2 sin costo, y cerrado', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    P.ev("pagarTodoElCredito('p1')");
    const conf = vistos(P).find(t => /^Saldar TODO el crédito/.test(t));
    assert.ok(conf, 'no confirmó el saldo');
    assert.match(conf, /: \$780\.000/);
    assert.match(conf, /Cuota 1 \(30-oct-2026\): capital \$325\.000 \+ costo \$130\.000 = \$455\.000/);
    assert.match(conf, /Cuota 2 \(15-nov-2026\): capital \$325\.000 · sin costo: su quincena no ha empezado \(\$65\.000 que no se cobra\)/);
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(p.fechaPagado, '2026-10-30');
    assert.equal(p.gananciaPago, 0);
    assert.equal(p.planPagos.cuotas[1].saldadoAntes, true);
    assert.equal(p.planPagos.cuotas[1].costoPactado, 65000);
    assert.equal(P.ev('gananciaCobrada(DB.prestamos[0])'), 130000);
    assert.equal(P.ev('capitalActual(DB.prestamos[0])'), 0);
  });

  test('el 31-oct ya corre la quincena de la cuota 2: 848.250', () => {
    const P = crmCon('2026-10-31T10:30:00');
    abrirCobro(P, '2026-10-31');
    assert.match(texto(P.elems.pgAccion.innerHTML), /Pagó todo el crédito \(\$848\.250\)/);
  });

  test('la cuota de atrás no se calla: el 20-nov también debe la 2', () => {
    const P = crmCon('2026-11-20T10:30:00');
    abrirCobro(P, '2026-11-20');
    const h = texto(P.elems.pgCalc.innerHTML);
    assert.match(h, /Total de la cuota \$523\.250/);
    assert.match(h, /Además tiene vencida la cuota 2: \$406\.250 \(con \$16\.250 de mora\)/);
  });
});

/* =========================================================================
 * LA HOJA DEL CRÉDITO Y LA REPROGRAMACIÓN
 * ======================================================================= */
describe('la hoja del crédito a cuotas', () => {

  test('sin pagar no dice «Total para saldar» (era solo la cuota): cuota, saldo y saldar hoy', () => {
    const P = crmCon('2026-10-16T10:30:00');
    P.ev("verCredito('p1')");
    const h = texto(P.elems.mBody.innerHTML);
    assert.ok(!/Total para saldar/.test(h), 'con cuotas, pagar eso no salda el crédito');
    assert.match(h, /Cuota 1 de 2 \$455\.000/);
    assert.match(h, /Saldo del crédito \(las cuotas que faltan\) \$845\.000/);
    assert.match(h, /Para saldarlo todo hoy \$780\.000/);
    assert.match(h, /Costo de la cuota 1 \(20%\) \$130\.000/);
    assert.match(h, /Cuotas pactadas al desembolsar/);
    assert.ok(!/Plan de pagos \(§8\)/.test(h));
    assert.match(h, /Cuota 1 · 30 de oct de 2026 · 20% \$455\.000 Pendiente/);
    assert.match(P.elems.mBody.innerHTML, /reprogramarCuotas\('p1'\)/, 'falta el botón de cambiar fechas o %');
  });

  test('vencidas: el chip dice «Vencida · N días», y el saldo lleva la mora de hoy', () => {
    const P = crmCon('2026-11-20T10:30:00');
    P.ev("verCredito('p1')");
    const h = texto(P.elems.mBody.innerHTML);
    assert.match(h, /Cuota 1 · 30 de oct de 2026 · 20% \$455\.000 Vencida · 21 días/);
    assert.match(h, /Cuota 2 · 15 de nov de 2026 · 20% \$390\.000 Vencida · 5 días/);
    assert.ok(!/Pendiente/.test(h), 'el chip verde encima de una cuota vencida');
    assert.match(h, /Saldo del crédito \(las cuotas que faltan, con la mora de hoy\) \$929\.500/,
      '845.000 + 68.250 + 16.250 de mora');
  });

  test('pagada entera: «Ganancia cobrada» 195.000 sin el costo de UNA cuota al lado', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-11-15'); P.ev("registrarCobro('p1')");
    assert.equal(P.ev('DB.prestamos[0].pagado'), true);
    P.ev("verCredito('p1')");
    const h = texto(P.elems.mBody.innerHTML);
    assert.match(h, /Ganancia cobrada \$195\.000/);
    assert.match(h, /Costo pactado de las cuotas \$195\.000/);
    assert.ok(!/\$65\.000 Ganancia/.test(h) && !/Costo \/ ganancia/.test(h), 'la fila de costo decía el de una sola cuota');
    assert.ok(!/reprogramarCuotas/.test(P.elems.mBody.innerHTML), 'pagado no se reprograma');
  });

  test('saldada antes: «Saldada antes · sin costo (pactado $65.000)», y el abono bajo su cuota', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000); P.ev("registrarCobro('p1')");
    P.ev("verCredito('p1')");
    assert.match(texto(P.elems.mBody.innerHTML), /↳ abono del 05 de nov de 2026 \$100\.000 \(mora \$19\.500 \+ costo \$80\.500\)/);

    const Q = crmCon('2026-10-30T10:30:00');
    abrirCobro(Q, '2026-10-30'); Q.ev("pagarTodoElCredito('p1')");
    Q.ev("verCredito('p1')");
    assert.match(texto(Q.elems.mBody.innerHTML), /Saldada antes · sin costo \(pactado \$65\.000\)/);
  });

  test('reprogramar la cuota 2 al 20-nov y al 25%: rehace el costo y lo anota', () => {
    const P = crmCon('2026-10-16T10:30:00');
    P.ev("reprogramarCuotas('p1')");
    const html = P.elems.mBody.innerHTML;
    assert.match(html, /id="rpF1"/); assert.match(html, /id="rpF2"/);
    assert.equal(P.elems.rpF2.value, '2026-11-15');
    assert.equal(P.elems.rpP2.value, '20');
    poner(P, 'rpF2', '2026-11-20'); poner(P, 'rpP2', '25');
    P.ev("calcReprogramar('p1')");
    assert.match(texto(P.elems.rpCalc.innerHTML), /Cuota 2 · 20-nov-2026 · 25% \$406\.250/);
    assert.match(texto(P.elems.rpCalc.innerHTML), /\$195\.000 → \$211\.250/);
    P.ev("guardarReprogramacion('p1')");
    const v = vistos(P);
    assert.ok(v.some(t => /POR ENCIMA DEL ESTÁNDAR/.test(t) && /art\. 305/.test(t) && /efectivo anual/.test(t)),
      'subir el % por encima del estándar también se confirma aparte');
    assert.ok(v.some(t => /Cuota 2: del 15-nov-2026 al 20-nov-2026 · 20% → 25% · costo \$65\.000 → \$81\.250/.test(t)));
    const p = cred(P);
    assert.equal(p.planPagos.cuotas[1].fecha, '2026-11-20');
    assert.equal(p.planPagos.cuotas[1].costo, 81250);
    assert.equal(p.planPagos.total_costo, 211250);
    assert.equal(p.planPagos.cambios.length, 1);
    assert.deepEqual(p.planPagos.cambios[0], { n: 2, de: { fecha: '2026-11-15', pct: 20, costo: 65000 },
      a: { fecha: '2026-11-20', pct: 25, costo: 81250 }, fecha: '2026-10-16' });
    assert.equal(p.cicloActual, '2026-10-30');
    assert.match(texto(P.elems.mBody.innerHTML), /Cambios después del alta .*cuota 2: del 15 de nov de 2026 al 20 de nov de 2026 · 20% → 25%/);
  });

  test('mover una cuota a un domingo avisa la mora en la vista previa', () => {
    const P = crmCon('2026-10-16T10:30:00');
    P.ev("reprogramarCuotas('p1')");
    poner(P, 'rpF2', '2026-11-29');   // domingo; el lunes 30 es hábil
    P.ev("calcReprogramar('p1')");
    assert.match(texto(P.elems.rpCalc.innerHTML), /El 29-nov es domingo: si paga el primer día hábil \(30-nov\) le corren 1 día de mora, \$3\.250/);
  });

  test('una cuota vencida no se reprograma: ni se ofrece, ni se cuela', () => {
    const P = crmCon('2026-11-05T10:30:00');
    P.ev("reprogramarCuotas('p1')");
    const html = P.elems.mBody.innerHTML;
    assert.ok(!/id="rpF1"/.test(html), 'la cuota vencida no puede tener campo de fecha');
    assert.match(texto(html), /Cuota 1 · 30 de oct de 2026 · 20% vencida · no se cambia/);
    /* Aunque alguien escriba en su campo, no viaja. */
    poner(P, 'rpF1', '2026-11-10');
    P.ev("guardarReprogramacion('p1')");
    assert.equal(cred(P).planPagos.cuotas[0].fecha, '2026-10-30');
    assert.deepEqual(cred(P).planPagos.cambios, []);
    /* Y la regla de fondo la pone el puente. */
    const r = JSON.parse(P.ev("JSON.stringify(PUENTE.reprogramarPlan(DB.prestamos[0],[{n:1,fecha:'2026-11-10'}],'2026-11-05'))"));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'vencida');
  });

  test('una cuota con abonos tampoco se reprograma', () => {
    const P = crmCon('2026-10-20T10:30:00');
    abrirCobro(P, '2026-10-20'); escribirMonto(P, 50000); P.ev("registrarCobro('p1')");
    P.ev("reprogramarCuotas('p1')");
    assert.ok(!/id="rpF1"/.test(P.elems.mBody.innerHTML));
    assert.match(texto(P.elems.mBody.innerHTML), /Cuota 1 · .* tiene abonos · no se cambia/);
  });
});

/* =========================================================================
 * LO QUE ROZA: la cola, el calendario y el tablero de quincenas
 * ======================================================================= */
describe('el crédito a cuotas en el resto del CRM', () => {

  test('la cola dice «a cuotas · cuota 1 de 2», no «plan de pagos»', () => {
    const P = crmCon('2026-10-30T10:30:00');
    P.ev('renderCola()');
    const h = texto(P.elems.cola.innerHTML);
    assert.match(h, /a cuotas · cuota 1 de 2/);
    assert.ok(!/plan de pagos/.test(h));
  });

  test('el calendario llama a sus cuotas «del crédito a cuotas»', () => {
    const P = crmCon('2026-10-16T10:30:00');
    const d = P.ev("detalleCobro(DB.prestamos[0],{vigente:false,n:2,de:2,monto:390000})");
    assert.equal(d, 'Cuota 2 de 2 del crédito a cuotas, ya pactada: $390.000.');
  });

  /* 17-oct-2026, revisión — LA REGLA CAMBIÓ, y es la del puente
     (cobradoDelPlanEnQuincena): una cuota no abre fila propia, cuenta en la
     quincena del tablero que CONTIENE su fecha (PUENTE.quincenaDe). La del
     30-oct va en la del 31-oct; la del 15-nov —domingo, con el 16 festivo— en
     la del 17-nov. Es la misma respuesta que da el celular. */
  test('el tablero de quincenas cuenta los 195.000, cada cuota en la quincena que contiene su fecha', () => {
    const P = crmCon('2026-11-15T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-11-15'); P.ev("registrarCobro('p1')");
    assert.equal(P.ev('DB.prestamos[0].pagado'), true);
    const qs = JSON.parse(P.ev('JSON.stringify(quincenasRelevantes())'));
    assert.ok(!qs.includes('2026-10-30'), 'la cuota del 30-oct abrió una fila propia');
    assert.ok(qs.includes('2026-10-31'));
    assert.ok(qs.includes('2026-11-17'));
    assert.equal(P.ev("gananciaDeQuincena('2026-10-31')"), 130000);
    assert.equal(P.ev("gananciaDeQuincena('2026-11-17')"), 65000);
    const total = qs.reduce((t, q) => t + P.ev("gananciaDeQuincena('" + q + "')"), 0);
    assert.equal(total, 195000, 'el plan entero cobrado no aparecía en ninguna quincena');
  });

  test('el KPI «Ganancia ciclo actual» del 31-oct incluye la cuota cobrada el 30-oct', () => {
    const P = crmCon('2026-10-31T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    assert.equal(P.ev('cicloActualGlobal()'), '2026-10-31');
    P.ev('renderKpis()');
    assert.match(texto(P.elems.kpis.innerHTML), /Ganancia ciclo actual \$130\.000/);
  });

  test('el abono parcial entra en la quincena que contiene la fecha de su cuota', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000); P.ev("registrarCobro('p1')");
    assert.equal(P.ev("gananciaDeQuincena('2026-10-31')"), 100000);
    assert.equal(P.ev("gananciaDeQuincena('2026-10-30')"), 0);
  });
});

/* =========================================================================
 * LOS CENTINELAS — el registro a cuotas cumple las mismas rejas que el de un
 * solo pago (pruebas/motor.test.js «EL PANEL NO REGISTRA PLATA SIN MOSTRARLA»
 * y pruebas/panel.test.js «el alta por encima del estándar»).
 * ======================================================================= */
describe('las rejas del registro a cuotas (centinela gemelo)', () => {
  /* El mismo recorte que usa el centinela de guardarRapido: hasta la primera
     llave de cierre en la columna 0. */
  function cuerpoDe(nombre) {
    const m = new RegExp('function ' + nombre + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}').exec(CRM);
    assert.ok(m, 'crm.html ya no declara ' + nombre + '()');
    return m[0];
  }

  test('confirma con los montos ANTES de registrar, y marca la cifra no redonda', () => {
    const f = cuerpoDe('guardarRapidoACuotas');
    const confirma = f.indexOf('¿Lo registro?'), registra = f.indexOf('DB.prestamos.push');
    assert.ok(confirma >= 0 && registra >= 0);
    assert.ok(confirma < registra, 'la confirmación quedó DESPUÉS del registro');
    assert.ok(f.indexOf('CIFRA REDONDA') >= 0, 'se perdió el aviso de cifra no redonda');
  });

  test('por encima del estándar, la confirmación aparte con el año y el art. 305', () => {
    const f = cuerpoDe('guardarRapidoACuotas');
    ['POR ENCIMA DEL ESTÁNDAR', 'efectivo anual', 'art. 305'].forEach(t =>
      assert.ok(f.indexOf(t) >= 0, 'falta «' + t + '» en la confirmación aparte'));
    assert.ok(f.indexOf('POR ENCIMA DEL ESTÁNDAR') < f.indexOf('DB.prestamos.push'));
  });

  test('guardarRapido entrega al de cuotas, y el de un solo pago conserva sus rejas', () => {
    const f = cuerpoDe('guardarRapido');
    assert.match(f, /_alta\.modo==='cuotas'\) return guardarRapidoACuotas\(\)/);
    assert.ok(f.indexOf('¿Lo registro?') < f.indexOf('DB.prestamos.push'));
  });

  test('las cuentas del plan las hacen el motor y el puente, no la pantalla', () => {
    assert.match(cuerpoDe('planDelAlta'), /MotorReglas\.construirPlanACuotas\(/);
    assert.match(cuerpoDe('guardarRapidoACuotas'), /PUENTE\.planPagosDeAlta\(plan\)/);
    assert.match(cuerpoDe('abonarACuotaDelPlan'), /r\.registros\.abono/);
    assert.match(cuerpoDe('pagarTodoElCredito'), /PUENTE\.liquidarSaldoPlan\(/);
    assert.match(cuerpoDe('guardarReprogramacion'), /PUENTE\.reprogramarPlan\(/);
    assert.match(cuerpoDe('avisosInhabilesCuotas'), /PUENTE\.cuotasVencidas\(/,
      'la mora del aviso la contesta el puente, no un 1% multiplicado acá');
  });

  test('cerrar una cuota es UNA cuenta, la del puente: la pantalla solo aplica sus registros', () => {
    const f = cuerpoDe('cobrarCuotaDelPlan');
    assert.match(f, /PUENTE\.cierreDeCuota\(/);
    assert.match(f, /Object\.assign\(c,reg\.cuota\)/);
    ['c.pagado=', 'c.recargo=', 'c.garantiaGenerada=', 'p.pagado=', 'p.cicloActual=sig'].forEach(t =>
      assert.ok(f.indexOf(t) < 0, 'cobrarCuotaDelPlan volvió a escribir «' + t + '» por su cuenta'));
    assert.ok(f.indexOf('confirm(') < f.indexOf('Object.assign(c,reg.cuota)'), 'aplica antes de confirmar');
    assert.match(cuerpoDe('decisionCuotaDeAlta'), /PUENTE\.liquidarSaldoPlan\(/);
    assert.match(cuerpoDe('decisionCuotaDeAlta'), /PUENTE\.cierreDeCuota\(/);
    assert.match(cuerpoDe('gananciaPendiente'), /PUENTE\.costoPendienteDelPlan\(/);
    /* 17-oct-2026, segunda revisión — lo de hoy es UNA cuenta del puente, la
       misma que usa el celular (aPagarHoy); lo que se anuncia con fecha, otra
       (aPagarEnSuFecha). La pantalla no arma ninguna de las dos. */
    assert.match(cuerpoDe('vencidoHoy'), /PUENTE\.aPagarHoy\(p,hoyISO\(\)\)/);
    assert.ok(!/vencidoDelPlan|totalCiclo/.test(cuerpoDe('vencidoHoy')), 'vencidoHoy volvió a armar la suma acá');
    assert.match(cuerpoDe('montoEnSuFecha'), /PUENTE\.aPagarEnSuFecha\(p,hoyISO\(\)\)/);
    assert.match(cuerpoDe('siPagaTodoHoy'), /PUENTE\.liquidarSaldoPlan\(/);
  });
});

/* =========================================================================
 * LA REVISIÓN ADVERSARIA DEL 17-oct-2026 — cada hallazgo confirmado, con el
 * caso de Joan. La regla única del costo es del puente: el costo de cada cuota
 * es su % sobre lo que de verdad se debe cuando EMPIEZA su quincena. Acá se
 * prueba que la PANTALLA la sigue sin hacer cuentas propias.
 * ======================================================================= */

/* Tres cuotas de 300.000 sobre 900.000: la única forma de tener una cuota del
   MEDIO que todavía no empieza (la 1 empieza con el desembolso). */
function creditoDeTres() {
  return creditoDeJoanCon(900000, [
    { fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }, { fecha: '2026-11-30', pct: 20 }]);
}
function creditoDeJoanCon(capital, cuotas) {
  const plan = M.construirPlanACuotas(capital, cuotas, { fechaDesembolso: '2026-10-16' });
  return {
    id: 'p1', numero: 1, socioId: 's1', socioNombre: 'Carlos Rincón', telefono: '3112457788',
    capital, costoPct: plan.cuotas[0].pct, fechaDesembolso: '2026-10-16',
    cicloActual: plan.cuotas[0].fecha_corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: PU.planPagosDeAlta(plan)
  };
}
/* Dice que NO solo a los confirm que casan con `re` (y al WhatsApp, siempre). */
function negarA(P, re) {
  P.ev('__vistos=[]; confirm=t=>{ __vistos.push(String(t)); return !(' + re + ').test(String(t)) && String(t).indexOf("WhatsApp")<0; }');
}
const textoDe = (P, id) => texto(P.elems[id].innerHTML);

describe('revisión del 17-oct: pagar todo es UNA salida, y va primero', () => {

  test('cuota 1 pagada el 30-oct: ese día trae 325.000 → pago total, y el crédito queda pagado', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-10-30');
    /* La cuota 2 es la última y su quincena no ha empezado: pagarla es pagar
       todo, y por eso hay UN botón, no dos con la misma cifra. */
    const acc = textoDe(P, 'pgAccion');
    assert.match(acc, /✓ Pagó todo el crédito \(\$325\.000\)/);
    assert.equal((acc.match(/Pagó todo el crédito/g) || []).length, 1, 'dos botones con el mismo cierre');
    assert.ok(!/Pagó la cuota 2/.test(acc));
    assert.match(textoDe(P, 'pgDif'), /Es la cuota 2, la última: pagarla es pagar todo el crédito\. Su quincena todavía no empieza: sin costo\./);
    assert.match(textoDe(P, 'pgCalc'), /Costo de la cuota \(su quincena todavía no empieza: pagándola hoy no cuesta; pactado al 20%\) \$0/);
    assert.ok(!/20% del saldo\) \$0/.test(textoDe(P, 'pgCalc')), 'un costo de $0 rotulado «20% del saldo»');
    assert.match(P.elems.pgPista.innerHTML, /¿Trajo todo el crédito\?/);
    escribirMonto(P, 325000);
    P.ev("registrarCobro('p1')");
    const conf = vistos(P).find(t => /^Saldar TODO el crédito/.test(t));
    assert.ok(conf, 'los 325.000 no fueron por «pagar todo»');
    assert.match(conf, /: \$325\.000/);
    const p = cred(P);
    assert.equal(p.pagado, true, 'el crédito quedó abierto: lo de la primera versión');
    assert.equal(p.fechaPagado, '2026-10-30');
    assert.ok(!p.abonosCapital.some(a => a.parcial), 'quedó anotado como abono');
    assert.equal(p.planPagos.cuotas[1].saldadoAntes, true);
    assert.equal(p.planPagos.cuotas[1].costo, 0);
    assert.equal(p.planPagos.cuotas[1].costoPactado, 65000);
    assert.equal(P.ev('capitalActual(DB.prestamos[0])'), 0);
    assert.equal(P.ev('gananciaCobrada(DB.prestamos[0])'), 130000);
  });

  test('desde el 31-oct la cuota 2 ya empezó: 390.000, y sigue siendo pagar todo', () => {
    const P = crmCon('2026-10-31T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-10-31');
    assert.match(textoDe(P, 'pgAccion'), /✓ Pagó todo el crédito \(\$390\.000\)/);
    assert.match(textoDe(P, 'pgCalc'), /Costo de la cuota \(20% del saldo\) \$65\.000/);
  });

  test('780.000 el 30-oct sin haber pagado nada → pago total, no «eso pasa la cuota»', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    escribirMonto(P, 780000);
    const acc = textoDe(P, 'pgAccion');
    assert.match(acc, /✓ Pagó todo el crédito \(\$780\.000\)/);
    assert.equal((acc.match(/Pagó todo el crédito/g) || []).length, 1);
    assert.match(textoDe(P, 'pgDif'), /Con \$780\.000 salda todo el crédito.*No se cobran \$65\.000 de costo de cuotas que no han empezado/);
    P.ev("registrarCobro('p1')");
    assert.ok(vistos(P).some(t => /^Saldar TODO el crédito.*: \$780\.000/.test(t)));
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.deepEqual(p.planPagos.cuotas.map(c => c.pagado), [true, true]);
  });

  test('más que todo el crédito no se registra: la frase del puente', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    escribirMonto(P, 800000);
    assert.match(textoDe(P, 'pgAccion'), /Eso paga más que todo el crédito/);
    assert.match(textoDe(P, 'pgDif'), /salda el crédito entero \(\$780\.000\).*sobran \$20\.000/);
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).pagado, false);
    assert.deepEqual(cred(P).abonosCapital, []);
  });

  test('regla (b): cuota 1 el 20-oct + abono de 100.000 el 25-oct → la 2 vale 270.000 el 15-nov', () => {
    const P = crmCon('2026-11-15T10:30:00');
    abrirCobro(P, '2026-10-20'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-10-25'); escribirMonto(P, 100000);
    assert.match(textoDe(P, 'pgDif'), /\$0 a la mora, \$0 al costo y \$100\.000 al capital/);
    assert.match(textoDe(P, 'pgDif'), /Su quincena todavía no empieza: el abono va entero a capital/);
    P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-11-15');
    const h = textoDe(P, 'pgCalc');
    assert.match(h, /Lo que falta del costo de la cuota \(pactado al 20%\) \$45\.000/);
    assert.match(h, /Lo que falta de la cuota \$270\.000/);
    assert.match(textoDe(P, 'pgAccion'), /✓ Pagó todo el crédito \(\$270\.000\)/);
  });
});

describe('revisión del 17-oct: la cuota del medio que no ha empezado no se cierra sola', () => {
  function tresConLaPrimeraPagada(ahora) {
    const P = crmCon(ahora, [creditoDeTres()]);
    abrirCobro(P, '2026-10-20'); P.ev("registrarCobro('p1')");
    assert.equal(cred(P).planPagos.cuotas[0].pagado, true, 'la cuota 1 no se cerró el 20-oct');
    return P;
  }

  test('el 25-oct: ni «Pagó la cuota» ni un monto por defecto; la frase del puente, abono y «Pagó todo»', () => {
    const P = tresConLaPrimeraPagada('2026-10-25T10:30:00');
    abrirCobro(P, '2026-10-25');
    assert.equal(P.elems.pgMonto.value, '', 'prellenó lo que la cuota valdría en su fecha');
    const acc = textoDe(P, 'pgAccion');
    assert.ok(!/Pagó la cuota/.test(acc), 'ofreció cerrar una cuota del medio que no ha empezado');
    assert.match(acc, /Escribe cuánto abonó/);
    assert.match(acc, /Pagó todo el crédito \(\$600\.000\)/);
    assert.match(P.elems.pgAccion.innerHTML, /id="pgBtn" disabled/);
    const dif = P.elems.pgDif.innerHTML;
    assert.match(dif, /alerta info/);
    assert.match(texto(dif), /La cuota 2 todavía no empieza: su quincena corre desde el día después del 30 de octubre de 2026/);
    assert.match(textoDe(P, 'pgCalc'), /Costo de la cuota cuando empiece su quincena \(20% de lo que deba ese día\)/);
    /* Registrar sin monto no escribe nada. */
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).planPagos.cuotas[1].pagado, false);
    assert.equal(cred(P).abonosCapital.length, 1);
  });

  test('un abono a la cuota del medio va entero a capital, sin garantía ni «Solo para ti»', () => {
    const P = tresConLaPrimeraPagada('2026-10-25T10:30:00');
    abrirCobro(P, '2026-10-25');
    escribirMonto(P, 100000);
    assert.match(textoDe(P, 'pgAccion'), /✓ Abono de \$100\.000 a la cuota 2/);
    const h = textoDe(P, 'pgCalc');
    assert.match(h, /Garantía que le deja este abono \$0 \(va todo a capital: el capital que vuelve no deja garantía\)/);
    assert.ok(!/Solo para ti/.test(h), 'un abono a capital no reparte nada');
    P.ev("registrarCobro('p1')");
    const a = cred(P).abonosCapital.find(x => x.parcial);
    assert.deepEqual([a.cuotaPlan, a.monto, a.costoPagado, a.moraPagada], [2, 100000, 0, 0]);
  });

  test('más que todo su capital: «adelanta de más», con la cifra del puente, y no se registra', () => {
    const P = tresConLaPrimeraPagada('2026-10-25T10:30:00');
    abrirCobro(P, '2026-10-25');
    escribirMonto(P, 300001);
    assert.match(textoDe(P, 'pgAccion'), /Eso pasa el capital de la cuota/);
    assert.match(textoDe(P, 'pgDif'), /puede recibir hasta \$300\.000 \(todo su capital\).*«Pagó todo el crédito» \(\$600\.000\)/);
    P.ev("registrarCobro('p1')");
    assert.equal(cred(P).abonosCapital.length, 1);
  });

  test('600.000 el 25-oct es pagar todo: las cuotas 2 y 3 sin costo', () => {
    const P = tresConLaPrimeraPagada('2026-10-25T10:30:00');
    abrirCobro(P, '2026-10-25');
    escribirMonto(P, 600000);
    assert.match(textoDe(P, 'pgAccion'), /✓ Pagó todo el crédito \(\$600\.000\)/);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.equal(P.ev('gananciaCobrada(DB.prestamos[0])'), 180000, 'solo el costo de la cuota 1');
  });

  test('cobrarCuotaDelPlan directo también lo niega: alert con la frase y nada escrito', () => {
    const P = tresConLaPrimeraPagada('2026-10-25T10:30:00');
    P.ev("cobrarCuotaDelPlan(DB.prestamos[0],'2026-10-25')");
    assert.ok(avisos(P).some(t => /La cuota 2 todavía no empieza/.test(t) && /No registré nada/.test(t)));
    assert.equal(cred(P).planPagos.cuotas[1].pagado, false);
    assert.equal(cred(P).abonosCapital.length, 1);
  });
});

describe('revisión del 17-oct: cerrar la cuota con cierreDeCuota', () => {

  test('el confirm sale de r.total y la garantía de registros.cuota.garantiaGenerada', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    const r = JSON.parse(P.ev("JSON.stringify(PUENTE.cierreDeCuota(DB.prestamos[0],'2026-10-30'))"));
    P.ev("registrarCobro('p1')");
    const conf = vistos(P).find(t => /^Cobrar la cuota 1 de 2/.test(t));
    assert.match(conf, new RegExp(': ' + P.ev('COP(' + r.total + ')').replace(/\$/g, '\\$').replace(/\./g, '\\.')));
    assert.match(conf, /La cuota le deja \$104\.000 de garantía\./);
    assert.equal(r.registros.cuota.garantiaGenerada, 104000);
    assert.equal(cred(P).planPagos.cuotas[0].garantiaGenerada, 104000);
  });

  test('la última antes de que empiece su quincena, por pagarTotal: «sin costo» y el pactado al lado', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-10-30');
    P.ev('__vistos=[]');
    P.ev("pagarTotal('p1')");
    const conf = vistos(P).find(t => /^Cobrar la cuota 2 de 2/.test(t));
    assert.ok(conf, 'no confirmó');
    assert.match(conf, /: \$325\.000/);
    assert.match(conf, /su quincena todavía no empieza: sin costo \(el pactado era \$65\.000\)/);
    assert.match(conf, /La cuota le deja \$0 de garantía/);
    const p = cred(P);
    assert.equal(p.pagado, true);
    assert.deepEqual([p.planPagos.cuotas[1].saldadoAntes, p.planPagos.cuotas[1].costo, p.planPagos.cuotas[1].costoPactado],
      [true, 0, 65000]);
  });

  test('una fecha anterior a un abono ya anotado: nada se registra, ni la cuota ni pagar todo', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-11-03');
    assert.equal(P.elems.pgMonto.value, '');
    /* 17-oct-2026, segunda revisión — el piso es el último hecho del CRÉDITO, y
       la frase es la del puente: «un pago anotado», no «un abono». */
    assert.match(textoDe(P, 'pgAccion'), /Esa fecha es anterior a un pago ya anotado/);
    assert.ok(!/Pagó todo el crédito/.test(textoDe(P, 'pgAccion')), 'ofreció pagar todo con una fecha que el puente rechaza');
    assert.match(textoDe(P, 'pgDif'), /Este crédito ya tiene un pago anotado el 5 de noviembre de 2026/);
    P.ev("registrarCobro('p1')");
    P.ev("pagarTodoElCredito('p1')");
    P.ev("cobrarCuotaDelPlan(DB.prestamos[0],'2026-11-03')");
    assert.ok(avisos(P).some(t => /Anota los pagos en el orden en que llegaron/.test(t) && /No registré nada/.test(t)));
    const p = cred(P);
    assert.equal(p.pagado, false);
    assert.equal(p.planPagos.cuotas[0].pagado, false);
    assert.equal(p.abonosCapital.length, 1);
  });
});

describe('revisión del 17-oct: lo que se guarda y lo que se proyecta', () => {

  test('el comprobante del abono lleva el MISMO id del abono', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05');
    P.ev("_compTmp='data:image/jpeg;base64,AAAA'");
    escribirMonto(P, 100000);
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.comprobantes.length, 1);
    assert.ok(p.abonosCapital[0].id, 'el abono no trae id');
    assert.equal(p.comprobantes[0].id, p.abonosCapital[0].id);
    assert.deepEqual([p.comprobantes[0].tipo, p.comprobantes[0].monto], ['abonoCuota', 100000]);
    /* Y sin id, addComp hace lo de siempre: el comprobante no gana un campo vacío. */
    P.ev("_compTmp='data:image/jpeg;base64,BBBB'; addComp(DB.prestamos[0],'pago',5)");
    assert.equal('id' in cred(P).comprobantes[1], false);
  });

  test('la ganancia proyectada tras un abono no cuenta dos veces lo abonado', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000); P.ev("registrarCobro('p1')");
    /* Faltan 49.500 de costo de la 1 y 65.000 de la 2; la mora de hoy ya entró. */
    assert.equal(P.ev('gananciaPendiente(DB.prestamos[0])'), 114500);
    assert.equal(P.ev('gananciaEsperada(DB.prestamos[0])'), 214500, '195.000 de costo + 19.500 de mora');
    assert.equal(P.ev('gananciaProyectadaPendiente()'), 114500);
    assert.equal(P.ev('gananciaPendiente(DB.prestamos[0])'), P.ev('PUENTE.costoPendienteDelPlan(DB.prestamos[0])'));
  });

  test('la lista: E.A. por las fechas de las cuotas pactadas, la usura con ESA cifra, «a cuotas · cuota n de N»', () => {
    const P = crmCon('2026-10-16T10:30:00');
    const ea = require(path.join(RAIZ, 'app', 'creditos.js')).efectivoAnualPorFechas('2026-10-16', 650000,
      [{ fecha: '2026-10-30', total: 455000 }, { fecha: '2026-11-15', total: 390000 }]) * 100;
    /* El techo entre las dos cifras: la del plan (~9.481%) pasa, la del 20% a
       14 días (~11.498%) no. Con la cuenta vieja la fila salía marcada. */
    P.ev('DB.config.tasaUsuraEA=10000; renderCred()');
    const html = P.elems.tblCred.innerHTML;
    assert.ok(html.indexOf(P.ev('fmtEA(' + ea + ')')) >= 0, 'la E.A. no es la de las fechas de las cuotas');
    assert.match(html, /class="ea-ok"/);
    assert.ok(!/ea-bad/.test(html), 'marcó usura con la E.A. del 20% a 14 días');
    assert.match(texto(html), /costo 20% · a cuotas · cuota 1 de 2/);
    P.ev('DB.config.tasaUsuraEA=9000; renderCred()');
    assert.match(P.elems.tblCred.innerHTML, /ea-bad/);
  });

  test('la lista dice el % de la cuota que corre, no el de la cuota 1', () => {
    const P = crmCon('2026-10-30T10:30:00', [creditoDeJoan([{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 10 }])]);
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    P.ev('renderCred()');
    assert.match(textoDe(P, 'tblCred'), /costo 10% · a cuotas · cuota 2 de 2/);
  });

  test('reprogramar el % de la cuota 1 mueve p.costoPct', () => {
    const P = crmCon('2026-10-16T10:30:00');
    P.ev("reprogramarCuotas('p1')");
    poner(P, 'rpP1', '15');
    P.ev("guardarReprogramacion('p1')");
    const p = cred(P);
    assert.equal(p.planPagos.cuotas[0].pct, 15);
    assert.equal(p.costoPct, 15);
  });

  test('la ficha: «si paga todo hoy» salda el crédito a cuotas y nunca queda por debajo del capital', () => {
    const otro = { id: 'p2', numero: 2, socioId: 's1', socioNombre: 'Carlos Rincón', capital: 300000, costoPct: 20,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false };
    const P = crmCon('2026-10-16T10:30:00', [creditoDeJoan(), otro]);
    assert.equal(P.ev("siPagaTodoHoy(DB.prestamos[0])"), 780000);
    assert.equal(P.ev("siPagaTodoHoy(DB.prestamos[1])"), P.ev("totalCiclo(DB.prestamos[1])"));
    P.ev("verCliente('s1')");
    const h = textoDe(P, 'mBody');
    /* totalCiclo sin fecha pregunta con el reloj del puente: la suma se arma
       con lo que él diga, no con una cifra escrita que vencería el 30-oct. */
    const suma = P.ev('COP(780000+totalCiclo(DB.prestamos[1]))');
    assert.ok(h.indexOf('Todos sus créditos, juntos 2 activos · capital en la calle $950.000 ' + suma + ' si paga todo hoy') >= 0,
      'la ficha no suma lo de saldar el crédito a cuotas: ' + suma);
    assert.ok(P.ev('siPagaTodoHoy(DB.prestamos[0])+siPagaTodoHoy(DB.prestamos[1])') >= 950000, 'por debajo del capital en la calle');
    /* El plan del §8 (sin origen 'alta'): el saldo de sus cuotas más la mora de
       las vencidas. 20-nov sin pagar: 845.000 + 68.250 + 16.250. */
    const Q = crmCon('2026-11-20T10:30:00', [Object.assign(creditoDeJoan(), {
      planPagos: Object.assign(creditoDeJoan().planPagos, { origen: undefined }) })]);
    assert.equal(Q.ev('PUENTE.esPlanDeAlta(DB.prestamos[0])'), false);
    assert.equal(Q.ev('siPagaTodoHoy(DB.prestamos[0])'), 929500);
    assert.ok(Q.ev('siPagaTodoHoy(DB.prestamos[0])') >= Q.ev('capitalActual(DB.prestamos[0])'));
  });
});

describe('revisión del 17-oct: con dos cuotas vencidas, todo lo vencido', () => {

  test('la cola, el KPI «En mora» y el WhatsApp de mora dicen 929.500 el 20-nov', () => {
    const P = crmCon('2026-11-20T10:30:00');
    assert.equal(P.ev("PUENTE.vencidoDelPlan(DB.prestamos[0],'2026-11-20')"), 929500);
    P.ev('renderCola()');
    assert.match(textoDe(P, 'cola'), /\$929\.500 a cuotas · cuota 1 de 2 \+ cuota 2 vencida \$406\.250/);
    P.ev('renderKpis()');
    assert.match(textoDe(P, 'kpis'), /En mora \$929\.500 1 vencidos/);
    const k = P.ev('plantillaPara(DB.prestamos[0])');
    assert.ok(['mora', 'moraTemprana'].includes(k), 'la cola no le toca un mensaje de mora: ' + k);
    assert.match(P.ev('mensajeParaCredito(DB.prestamos[0],DB.socios[0])'), /Tu pago de \$929\.500 (sigue|quedó) pendiente/);
    assert.match(P.ev("mensajeParaCredito(DB.prestamos[0],DB.socios[0],'mora')"), /Tu pago de \$929\.500 sigue pendiente/);
    assert.match(P.ev("mensajeParaCredito(DB.prestamos[0],DB.socios[0],'moraTemprana')"), /Tu pago de \$929\.500 quedó pendiente/);
    /* 17-oct-2026, segunda revisión — los recordatorios dicen lo que vale la
       cuota EN SU FECHA (PUENTE.aPagarEnSuFecha), y vencida eso es lo de hoy:
       todo lo vencido. La primera versión le dejaba al recordatorio la cuota 1
       sola (523.250), la mitad de lo que el cliente debía ese día. */
    const rec = P.ev("mensajeParaCredito(DB.prestamos[0],DB.socios[0],'recordatorio1')");
    assert.equal(P.ev("PUENTE.aPagarEnSuFecha(DB.prestamos[0],'2026-11-20')"), 929500);
    assert.match(rec, /es tu pago de \$929\.500/);
    assert.ok(rec.indexOf('$523.250') < 0, 'el recordatorio callaba la cuota 2 vencida');
  });

  test('la base de SMS y voz de Cobranzas también: 929.500, no solo la primera cuota', () => {
    /* casosDeCobroHoy suma por persona; con totalCiclo sumaba solo la cuota
       que sigue (523.250) y el SMS de mora le decía al cliente la mitad. */
    const P = crmCon('2026-11-20T10:30:00');
    const casos = JSON.parse(P.ev('JSON.stringify(casosDeCobroHoy())'));
    const suyo = casos.find(c => c && (c.saldo_total != null));
    assert.ok(suyo, 'el crédito vencido no salió en la base de Cobranzas');
    assert.equal(suyo.saldo_total, 929500);
  });

  test('con UNA cuota vencida, la cola dice esa y no inventa otra', () => {
    const P = crmCon('2026-11-05T10:30:00');
    P.ev('renderCola()');
    const h = textoDe(P, 'cola');
    assert.match(h, /\$474\.500 a cuotas · cuota 1 de 2/);
    assert.ok(!/vencida \$/.test(h));
  });
});

describe('revisión del 17-oct: una garantía por hoja y rótulos que dicen «lo que falta»', () => {

  test('con un abono escrito, la garantía y el «Solo para ti» son los del abono', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05');
    const completo = P.ev("COP(liqCredito(DB.prestamos[0],'2026-11-05').garantia_generada)");
    assert.equal(completo, '$104.000');
    escribirMonto(P, 100000);
    const ab = JSON.parse(P.ev("JSON.stringify(PUENTE.abonoACuota(DB.prestamos[0],'2026-11-05',100000))"));
    const g = P.ev('COP(' + ab.garantia + ')');
    const h = textoDe(P, 'pgCalc');
    assert.ok(h.indexOf('Garantía que le deja este abono ' + g) >= 0, 'la fila no es la del abono: ' + g);
    assert.match(h, new RegExp('De los \\$100\\.000 que entran: ' + g.replace(/\$/g, '\\$').replace(/\./g, '\\.') + ' se le vuelven garantía'));
    assert.ok(h.indexOf(completo) < 0, 'quedó la garantía del cobro completo en la misma hoja');
  });

  test('después de un abono: capital, costo, recargo y cuota dicen «lo que falta», sin el 1% al lado', () => {
    const P = crmCon('2026-11-10T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-11-10');
    const h = textoDe(P, 'pgCalc');
    assert.match(h, /Lo que falta del capital de la cuota 1 de 2 \$325\.000/);
    assert.match(h, /Lo que falta del costo de la cuota \(pactado al 20%\) \$49\.500/);
    assert.match(h, /Lo que falta del recargo por mora \(11 días de atraso · ya abonó \$19\.500 de mora\) \$16\.250/);
    assert.match(h, /Lo que falta de la cuota \$390\.750/);
    assert.ok(!/diario/.test(h), '«N días · 1% diario» al lado de una cifra que no es N × 1%');
    assert.ok(!/20% del saldo/.test(h));
    /* La cabecera de la hoja y la hoja del crédito, igual. */
    assert.match(textoDe(P, 'mBody'), /Lo que falta de la cuota 1 de 2 · vence 30 de oct de 2026 \$325\.000 de capital \+ \$49\.500 de costo/);
    P.ev("verCredito('p1')");
    const v = textoDe(P, 'mBody');
    assert.match(v, /Lo que falta del costo de la cuota 1 \(pactado al 20%\) \$49\.500/);
    assert.match(v, /Lo que falta de la cuota 1 de 2 \$390\.750/);
  });

  test('sin abonos, los rótulos de siempre', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05');
    const h = textoDe(P, 'pgCalc');
    assert.match(h, /Capital de la cuota 1 de 2 \$325\.000/);
    assert.match(h, /Recargo por 6 día\(s\) de mora · 1% diario \$19\.500/);
    assert.match(h, /Total de la cuota \$474\.500/);
    assert.match(h, /Garantía que le deja \$104\.000/);
  });
});

describe('revisión del 17-oct: reprogramar avisa solo lo que viene', () => {

  test('la cuota 1 venció en domingo: no se avisa; la 2 movida a un domingo, sí', () => {
    const P = crmCon('2026-11-05T10:30:00', [creditoDeJoan([{ fecha: '2026-11-01', pct: 20 }, { fecha: '2026-11-20', pct: 20 }])]);
    P.ev("reprogramarCuotas('p1')");
    poner(P, 'rpF2', '2026-11-29');
    P.ev("calcReprogramar('p1')");
    const h = textoDe(P, 'rpCalc');
    assert.match(h, /Cuota 2 · El 29-nov es domingo/);
    assert.ok(!/Cuota 1 · El 1-nov/.test(h), 'avisó del domingo de una cuota que ya venció');
    P.ev("guardarReprogramacion('p1')");
    const conf = vistos(P).find(t => /^Cambiar las cuotas/.test(t));
    assert.ok(conf);
    assert.match(conf, /Cuota 2 · El 29-nov es domingo/);
    assert.ok(!/Cuota 1 · El 1-nov/.test(conf));
  });
});

describe('revisión del 17-oct: decir NO no escribe nada', () => {

  test('NO a «Saldar TODO»: el crédito sigue abierto y sin abonos', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    negarA(P, '/^Saldar TODO/');
    P.ev("pagarTodoElCredito('p1')");
    assert.ok(vistos(P).some(t => /^Saldar TODO/.test(t)), 'no llegó a preguntar');
    const p = cred(P);
    assert.equal(p.pagado, false);
    assert.deepEqual(p.abonosCapital, []);
    assert.deepEqual(p.planPagos.cuotas.map(c => c.pagado), [false, false]);
  });

  test('NO al pago total escrito en el monto (325.000 tras la cuota 1): sigue abierto', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    abrirCobro(P, '2026-10-30'); escribirMonto(P, 325000);
    negarA(P, '/^Saldar TODO/');
    P.ev("registrarCobro('p1')");
    const p = cred(P);
    assert.equal(p.pagado, false);
    assert.equal(p.abonosCapital.length, 1, 'solo el capital de la cuota 1');
  });

  test('NO al abono: abonosCapital vacío', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000);
    negarA(P, '/^Abono de/');
    P.ev("registrarCobro('p1')");
    assert.ok(vistos(P).some(t => /^Abono de \$100\.000/.test(t)));
    assert.deepEqual(cred(P).abonosCapital, []);
  });

  test('NO a cobrar la cuota: la cuota sigue sin pagar', () => {
    const P = crmCon('2026-10-30T10:30:00');
    abrirCobro(P, '2026-10-30');
    negarA(P, '/^Cobrar /');
    P.ev("registrarCobro('p1')");
    assert.ok(vistos(P).some(t => /^Cobrar la cuota 1 de 2/.test(t)));
    const p = cred(P);
    assert.equal(p.planPagos.cuotas[0].pagado, false);
    assert.deepEqual(p.abonosCapital, []);
    assert.equal(p.cicloActual, '2026-10-30');
  });

  test('NO al confirm final de reprogramar: ni cambios, ni fecha, ni %', () => {
    const P = crmCon('2026-10-16T10:30:00');
    P.ev("reprogramarCuotas('p1')");
    poner(P, 'rpF2', '2026-11-20'); poner(P, 'rpP2', '15'); poner(P, 'rpP1', '15');
    negarA(P, '/^Cambiar las cuotas/');
    P.ev("guardarReprogramacion('p1')");
    assert.ok(vistos(P).some(t => /^Cambiar las cuotas/.test(t)), 'no llegó a preguntar');
    const p = cred(P);
    assert.deepEqual(p.planPagos.cambios, []);
    assert.deepEqual(p.planPagos.cuotas.map(c => [c.fecha, c.pct]), [['2026-10-30', 20], ['2026-11-15', 20]]);
    assert.equal(p.costoPct, 20);
  });

  test('NO a la aparte de reprogramar por encima del estándar: el final ni se muestra', () => {
    const P = crmCon('2026-10-16T10:30:00');
    P.ev("reprogramarCuotas('p1')");
    poner(P, 'rpP2', '25');
    negarA(P, '/art\\. 305/');
    P.ev("guardarReprogramacion('p1')");
    assert.ok(vistos(P).some(t => /POR ENCIMA DEL ESTÁNDAR/.test(t) && /art\. 305/.test(t)));
    assert.ok(!vistos(P).some(t => /^Cambiar las cuotas/.test(t)), 'siguió al confirm final después del NO');
    const p = cred(P);
    assert.deepEqual(p.planPagos.cambios, []);
    assert.equal(p.planPagos.cuotas[1].pct, 20);
    assert.equal(p.planPagos.cuotas[1].costo, 65000);
  });
});

/* =========================================================================
 * LA SEGUNDA REVISIÓN ADVERSARIA DEL 17-oct-2026 — lo que el puente ya sabía
 * (ultimoHechoDelPlan, en_su_fecha, aPagarHoy, aPagarEnSuFecha) y la pantalla
 * todavía no decía. Cada prueba EJECUTA la página con el caso de Joan.
 * ======================================================================= */
describe('segunda revisión del 17-oct: el piso de la fecha es el último hecho del crédito', () => {

  test('la cuota 2 anotada con fecha anterior al cobro de la 1: no se registra (ni cuota, ni abono, ni pagar todo)', () => {
    const P = crmCon('2026-11-02T10:30:00');
    abrirCobro(P, '2026-11-02'); P.ev("registrarCobro('p1')");
    assert.equal(cred(P).planPagos.cuotas[0].pagado, true, 'la cuota 1 no se cobró el 2-nov');
    assert.equal(cred(P).planPagos.cuotas[0].fechaPagado, '2026-11-02');
    const antes = JSON.stringify(cred(P));
    P.ev('__vistos=[]');
    /* El 29-oct la quincena de la cuota 2 «no ha empezado»: sin la reja, salía
       sin costo, 65.000 más barata, con una historia imposible. */
    abrirCobro(P, '2026-10-29');
    assert.equal(P.elems.pgMonto.value, '', 'prellenó un monto que el puente no deja registrar');
    assert.match(textoDe(P, 'pgAccion'), /Esa fecha es anterior a un pago ya anotado/);
    assert.ok(!/Pagó todo el crédito/.test(textoDe(P, 'pgAccion')), 'ofreció pagar todo con fecha anterior');
    assert.match(textoDe(P, 'pgDif'), /Este crédito ya tiene un pago anotado el 2 de noviembre de 2026/);
    assert.match(P.elems.pgAccion.innerHTML, /id="pgBtn" disabled/);
    P.ev("registrarCobro('p1')");
    /* Escribir la plata tampoco abre la puerta: ni los 325.000 (pagar todo) ni un abono. */
    escribirMonto(P, 325000);
    assert.match(textoDe(P, 'pgAccion'), /Esa fecha es anterior a un pago ya anotado/);
    P.ev("registrarCobro('p1')");
    escribirMonto(P, 100000);
    assert.match(textoDe(P, 'pgAccion'), /Esa fecha es anterior a un pago ya anotado/);
    P.ev("registrarCobro('p1')");
    P.ev("pagarTodoElCredito('p1','2026-10-29')");
    P.ev("cobrarCuotaDelPlan(DB.prestamos[0],'2026-10-29')");
    assert.ok(avisos(P).some(t => /ya tiene un pago anotado el 2 de noviembre de 2026/.test(t) && /No registré nada/.test(t)),
      'el aviso no dijo por qué no registró');
    assert.equal(JSON.stringify(cred(P)), antes, 'algo se escribió con una fecha anterior al cobro de la cuota 1');
    assert.ok(!vistos(P).some(t => /^Saldar TODO|^Cobrar la cuota 2|^Abono de/.test(t)), 'llegó a preguntar un registro imposible');
  });
});

describe('segunda revisión del 17-oct: el abono antes de que empiece la quincena dice las dos cifras', () => {

  test('cuota 1 el 20-oct + abono de 100.000 el 25-oct: hoy 225.000 de capital, el 15-nov 270.000', () => {
    const P = crmCon('2026-10-25T10:30:00');
    abrirCobro(P, '2026-10-20'); P.ev("registrarCobro('p1')");
    const r = JSON.parse(P.ev("JSON.stringify(PUENTE.abonoACuota(DB.prestamos[0],'2026-10-25',100000))"));
    assert.deepEqual(r.en_su_fecha, { fecha: '2026-11-15', total: 270000, capital: 225000, costo: 45000 });
    assert.equal(r.queda.total, 225000);
    P.ev('__vistos=[]');
    abrirCobro(P, '2026-10-25'); escribirMonto(P, 100000);
    const dif = textoDe(P, 'pgDif');
    assert.match(dif, /En esta cuota, hoy quedan \$225\.000 de capital; el 15 de nov de 2026, con el costo de su quincena, la cuota es \$270\.000 \(capital \$225\.000 \+ costo \$45\.000\)/);
    assert.ok(!/costo \$0/.test(dif), '«costo $0» al lado de la fecha de la cuota');
    assert.ok(!/con la misma fecha/.test(dif), 'dijo «quedan 225.000 … con la misma fecha» de una cuota que ese día vale 270.000');
    P.ev("registrarCobro('p1')");
    const conf = vistos(P).find(t => /^Abono de \$100\.000 a la cuota 2/.test(t));
    assert.ok(conf, 'no confirmó el abono');
    assert.match(conf, /hoy quedan \$225\.000 de capital; el 15 de nov de 2026, con el costo de su quincena, la cuota es \$270\.000/);
    assert.ok(!/costo \$0/.test(conf), 'el confirm decía «costo $0»');
    assert.ok(!/queda debiendo \$225\.000/.test(conf));
    const despues = vistos(P).find(t => /^Abono registrado/.test(t));
    assert.ok(despues, 'no salió el aviso de después');
    assert.match(despues, /^Abono registrado: en la cuota 2, hoy quedan \$225\.000 de capital; el 15 de nov de 2026, con el costo de su quincena, la cuota es \$270\.000/);
    assert.ok(!/quedan \$225\.000 para el/.test(despues), 'el aviso de después le ponía fecha a la cifra sin costo');
    const a = cred(P).abonosCapital.find(x => x.parcial);
    assert.deepEqual([a.cuotaPlan, a.monto, a.costoPagado, a.moraPagada, a.recibido], [2, 100000, 0, 0, 100000]);
  });

  test('una cuota vencida no tiene «su fecha» por delante: el abono dice lo de siempre', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-11-05'); escribirMonto(P, 100000);
    const dif = textoDe(P, 'pgDif');
    assert.match(dif, /En esta cuota quedan \$374\.500 \(capital \$325\.000 \+ costo \$49\.500\), con la misma fecha/);
    assert.ok(!/con el costo de su quincena/.test(dif), 'habló de una fecha que ya pasó');
  });
});

describe('segunda revisión del 17-oct: la última cuota se anuncia con lo que vale EN SU FECHA', () => {
  /* Cuota 1 cobrada el 30-oct: cerrar la 2 ese día es pagar todo (325.000),
     pero el 15-nov vale 390.000. Lo que lleva la fecha dice 390.000. */
  function conLaPrimeraPagada() {
    const otro = { id: 'p2', numero: 2, socioId: 's1', socioNombre: 'Carlos Rincón', capital: 300000, costoPct: 20,
      fechaDesembolso: '2026-10-16', cicloActual: '2026-11-15', prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false };
    const P = crmCon('2026-10-30T10:30:00', [creditoDeJoan(), otro]);
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    assert.equal(cred(P).planPagos.cuotas[0].pagado, true);
    return P;
  }

  test('el puente: hoy 325.000, en su fecha 390.000; la página pregunta por ahí', () => {
    const P = conLaPrimeraPagada();
    assert.equal(P.ev("PUENTE.aPagarHoy(DB.prestamos[0],'2026-10-30')"), 325000);
    assert.equal(P.ev("PUENTE.aPagarEnSuFecha(DB.prestamos[0],'2026-10-30')"), 390000);
    assert.equal(P.ev('montoEnSuFecha(DB.prestamos[0])'), 390000);
    assert.equal(P.ev('vencidoHoy(DB.prestamos[0])'), 325000);
    /* El quincenal sigue con totalCiclo. */
    assert.equal(P.ev('montoEnSuFecha(DB.prestamos[1])'), P.ev('totalCiclo(DB.prestamos[1])'));
  });

  test('calendario, verDia, «+Google» y el .ics: «Cobro … $390.000» el 15-nov', () => {
    const P = conLaPrimeraPagada();
    const cobros = JSON.parse(P.ev("JSON.stringify(cobrosDelCredito(DB.prestamos[0]).map(c=>({fecha:c.fecha,monto:c.monto,n:c.n})))"));
    assert.deepEqual(cobros, [{ fecha: '2026-11-15', monto: 390000, n: 2 }]);
    P.ev('calY=2026; calM=10; renderCalendario()');
    assert.match(textoDe(P, 'calGrid'), /⏰ Carlos \$390\.000/);
    assert.ok(!/Carlos \$325\.000/.test(textoDe(P, 'calGrid')), 'el calendario anunciaba lo de cerrarla hoy');
    P.ev("verDia('2026-11-15')");
    const h = P.elems.mBody.innerHTML;
    assert.match(texto(h), /Carlos Rincón .*\$390\.000 · \+Google/);
    assert.ok(h.indexOf(encodeURIComponent('Cobro Carlos Rincón $390.000')) >= 0, 'el evento de Google no lleva los 390.000');
    /* El .ics, ejecutado: se atrapa el texto que iría al archivo. */
    P.ev('var __ics=""; Blob=class{ constructor(a){ __ics=a.join(""); } }; URL={ createObjectURL:()=>"blob:x" }; alert=()=>{};');
    P.ev('exportarICS()');
    const ics = P.ev('__ics');
    assert.match(ics, /SUMMARY:⏰ Cobro Carlos Rincón \$390\.000 \(cuota 2 de 2\)/);
    assert.match(ics, /DTSTART;VALUE=DATE:20261115/);
    assert.ok(!/Cobro Carlos Rincón \$325\.000/.test(ics), 'el .ics anunciaba 325.000 para el 15-nov');
  });

  test('recordatorio1, recordatorio2 y venceHoy dicen $390.000', () => {
    const P = conLaPrimeraPagada();
    ['recordatorio1', 'recordatorio2', 'venceHoy'].forEach(k => {
      const m = P.ev("mensajeParaCredito(DB.prestamos[0],DB.socios[0],'" + k + "')");
      assert.match(m, /tu pago de \$390\.000/, k + ' no dice lo que vale la cuota en su fecha: ' + m);
      assert.ok(m.indexOf('$325.000') < 0, k + ' anuncia lo de cerrarla hoy');
    });
    /* El quincenal, como siempre. */
    const q = P.ev("mensajeParaCredito(DB.prestamos[1],DB.socios[0],'recordatorio1')");
    assert.ok(q.indexOf(P.ev('COP(totalCiclo(DB.prestamos[1]))')) >= 0);
  });

  test('la lista («A pagar») y el tablero («Por cobrar» en la quincena del 17-nov)', () => {
    const P = conLaPrimeraPagada();
    P.ev('renderCred()');
    /* Capital $325.000, A pagar $390.000, Ganancia $130.000. */
    assert.match(textoDe(P, 'tblCred'), /\$325\.000 \$390\.000 \$130\.000/);
    assert.equal(P.ev("PUENTE.quincenaDe('2026-11-15')"), '2026-11-17');
    /* El quincenal de 300.000 con corte 15-nov cae en la fila «15-nov» (su
       corte pelado), no en la del 17-nov: en esta fila solo está el de cuotas. */
    assert.equal(P.ev("porCobrarEnQuincena('2026-11-17')"), 390000);
  });

  test('la hoja del crédito: «Cuota 2 de 2 · el 15-nov $390.000 (si la cierra hoy, $325.000)»', () => {
    const P = conLaPrimeraPagada();
    P.ev("verCredito('p1')");
    const h = textoDe(P, 'mBody');
    assert.match(h, /Cuota 2 de 2 · el 15-nov \$390\.000 \(si la cierra hoy, \$325\.000\)/);
    assert.match(h, /Para saldarlo todo hoy \$325\.000/);
    /* Desde el 31-oct ya corre su quincena: las dos cifras son la misma y no se repite. */
    const Q = crmCon('2026-10-31T10:30:00');
    abrirCobro(Q, '2026-10-30'); Q.ev("registrarCobro('p1')");
    Q.ev("verCredito('p1')");
    const g = textoDe(Q, 'mBody');
    assert.match(g, /Cuota 2 de 2 \$390\.000/);
    assert.ok(!/si la cierra hoy/.test(g));
  });

  test('vencido: el cobro de hoy lleva TODO lo vencido y la cuota de atrás no sale otra vez en su día', () => {
    const P = crmCon('2026-11-20T10:30:00');
    const cobros = JSON.parse(P.ev("JSON.stringify(cobrosDelCredito(DB.prestamos[0]).map(c=>({fecha:c.fecha,monto:c.monto,vigente:c.vigente})))"));
    assert.deepEqual(cobros, [{ fecha: '2026-11-20', monto: 929500, vigente: true }],
      'la cuota 2 vencida se contaba dos veces: en el cobro de hoy y en su 15-nov');
  });
});

describe('segunda revisión del 17-oct: el tablero de quincenas cuenta el crédito a cuotas', () => {

  test('el 20-oct, «Invertido en el ciclo» del 31-oct incluye los 650.000 y «Vencen» lo cuenta', () => {
    const P = crmCon('2026-10-20T10:30:00');
    assert.equal(P.ev('cicloActualGlobal()'), '2026-10-31');
    assert.equal(P.ev("invertidoEnQuincena('2026-10-31')"), 650000);
    P.ev('renderKpis()');
    assert.match(textoDe(P, 'kpis'), /Invertido en el ciclo \$650\.000/);
    P.ev('renderCiclos()');
    /* Quincena · Invertido · Por cobrar (455.000 el 30-oct) · Ganancia · Descuentos · Vencen. */
    assert.match(textoDe(P, 'tblCiclos'), /31 de oct de 2026 actual \$650\.000 \$455\.000 \$0 — 1/);
    /* La cuota 2 todavía no es la que vence: en la del 17-nov no cuenta. */
    assert.match(textoDe(P, 'tblCiclos'), /17 de nov de 2026 \$0 \$0 \$0 — 0/);
  });

  test('cobrada la cuota 1, el crédito pasa a la quincena del 17-nov', () => {
    const P = crmCon('2026-11-05T10:30:00');
    abrirCobro(P, '2026-10-30'); P.ev("registrarCobro('p1')");
    assert.equal(P.ev("invertidoEnQuincena('2026-11-17')"), 325000);
    P.ev('renderCiclos()');
    assert.match(textoDe(P, 'tblCiclos'), /17 de nov de 2026 (actual )?\$325\.000 \$390\.000 \$0 — 1/);
  });
});

describe('segunda revisión del 17-oct: SMS y voz con UN crédito a cuotas y dos cuotas vencidas', () => {

  test('cobranzasListas, ejecutada: la fila dice 929.500, no la cuota 1 sola', () => {
    const P = crmCon('2026-11-20T10:30:00');
    const casos = JSON.parse(P.ev('JSON.stringify(casosDeCobroHoy().map(c=>({saldo:c.saldo,saldo_total:c.saldo_total,cuantos:c.cuantos})))'));
    assert.deepEqual(casos, [{ saldo: 929500, saldo_total: 929500, cuantos: 1 }]);
    assert.equal(P.ev('vencidoHoy(DB.prestamos[0])'), P.ev("PUENTE.aPagarHoy(DB.prestamos[0],'2026-11-20')"));
    const r = JSON.parse(P.ev('JSON.stringify(cobranzasListas())'));
    assert.ok(r && r.envio, 'cobranzasListas no armó nada');
    assert.equal(r.horario.ok, true, 'el viernes 20-nov a las 10:30 está dentro del horario de la Ley 2300');
    assert.equal(r.envio.filas.length, 1, 'el crédito vencido no salió en la base');
    const f = r.envio.filas[0];
    assert.equal(f.monto, 929500, 'con un solo crédito, filasDeEnvio usa `saldo`: era la cuota 1 sola (523.250)');
    assert.equal(f.creditos, 1);
    assert.ok(f.mensaje_sms.indexOf('929.500') >= 0, 'el SMS no dice 929.500: ' + f.mensaje_sms);
    assert.ok(f.mensaje_sms.indexOf('523.250') < 0);
  });
});
