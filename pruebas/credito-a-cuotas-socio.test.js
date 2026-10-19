/* ============================================================================
 * EL CRÉDITO A CUOTAS EN LA APP DEL CLIENTE Y EN EL CELULAR DE JOAN
 * 16 de octubre de 2026.
 *
 *   node --test pruebas/credito-a-cuotas-socio.test.js
 *
 * Joan: «tengo el caso de un préstamo a cuotas de 650.000: paga la primera
 * cuota el 30 de este mes = 20% de 650.000 + la mitad del capital = 455.000, y
 * los 325.000 restantes el 15 de noviembre más el 20% (65.000) = 390.000».
 *
 * El núcleo (motor.js y puente.js) ya sabe armar, cobrar, abonar y saldar ese
 * crédito. Estas pruebas cuidan las dos pantallas que lo MUESTRAN, y se
 * escribieron contra lo que decían el 16-oct antes de tocarlas:
 *
 *   · LA APP DEL CLIENTE (app/socio.html) le decía «Total para saldar $455.000»
 *     de un crédito que debía 845.000, que «la entrada del plan ya la pagaste»
 *     (no hubo entrada), que «las de más adelante cuestan menos» (falso si Joan
 *     sube el costo de una posterior), lo llamaba «plan de pagos» —que en esta
 *     app quiere decir «se te acabaron las prórrogas»— y nunca mostraba la
 *     cuota 2. Y el historial pintaba «$0» de todo crédito ya pagado.
 *   · EL CELULAR DE JOAN (panel/espejo.html), al cobrar una cuota que ya tenía
 *     un abono anotado en el computador, volvía a bajar el capital entero de la
 *     cuota —el abono se descontaba dos veces— y la cerraba con un recargo menor
 *     que el que había entrado. Y su tablero de quincenas no contaba ni un peso
 *     de lo cobrado en cuotas.
 *
 * Todo se prueba ARRANCANDO la página (banco-socio.js, banco-espejo.js), con el
 * paquete que arma de verdad PuenteTuGarantia.migrarSocio.
 *
 * 17-oct-2026, revisión — LA REGLA ÚNICA DEL COSTO. El puente ahora cobra cada
 * cuota con su % sobre lo que se debe CUANDO EMPIEZA SU QUINCENA. Con eso, el
 * 30-oct, recién pagada la cuota 1, la cuota 2 vale 325.000 ese día y 390.000
 * desde el 31. Y las pantallas lo decían mal:
 *   · la app pintaba «pagar todo hasta el 15-nov» una cifra que vencía el 30-oct,
 *     y «Total de esta cuota $325.000» con fecha de pago 15-nov;
 *   · con dos cuotas vencidas daba el total «sin los recargos», aunque el
 *     paquete ya trae la mora de cada una;
 *   · el recordatorio rotulaba «costo» lo que faltaba de una cuota con abonos;
 *   · el celular cerraba la cuota con su propia cuenta (ahora: cierreDeCuota),
 *     su ficha decía «$455.000 para saldar», su tablero dejó de contar las
 *     cuotas (el puente las pone en la quincena que las contiene) y el choque
 *     pintaba el plan como «objeto»;
 *   · subir.html no enseñaba ni el plan ni los cierres en discusión.
 *
 * 17-oct-2026, segunda revisión — lo que la segunda revisión adversaria
 * encontró en estas pantallas, cada punto con su prueba (al final del archivo):
 *   1. el celular mandaba por WhatsApp de mora, y sumaba en «La cola de hoy»,
 *      solo la cuota en curso: el 20-nov, 523.250 de una deuda vencida de
 *      929.500 (ahora P.aPagarHoy, y la otra cuota vencida con su cifra);
 *   2. con abonos, «Costo de la cuota (20%)» al lado de lo que FALTA del costo
 *      y «Recargo por 11 día(s) · 1% diario» al lado de una cifra que no es
 *      11 × 1% de nada;
 *   3. su tablero sacaba de la quincena del 31-oct los 650.000 de una cuota del
 *      30-oct (comparaba la fecha de la cuota con la quincena a secas);
 *   4. el abono de cierre ahora trae `recibido`, y un cobro con fecha anterior
 *      al último pago de CUALQUIER cuota se rechaza con el texto del puente;
 *   5. la app prometía «pagando el 15 nov o antes, tu cupo sube» de una cuota
 *      del MEDIO que antes del 31-oct no se puede cerrar;
 *   6. Inicio decía «Ya trae adentro el recargo de los 6 días» con el recargo
 *      en cero;
 *   7. la tarjeta del choque decía que «los abonos de los dos lados se juntan»
 *      cuando los pagos de las cuotas viajan con su plan y uno se queda afuera;
 *   8. el resumen del plan en el choque no dejaba ver una reprogramación.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const M = require('../app/motor.js');
const P = require('../app/puente.js');
const NUBE = require('../panel/nube.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const copia = o => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------------
   EL CRÉDITO DEL CASO DE JOAN, armado como lo arma el CRM: el motor hace el
   calendario y el puente le da la forma que se guarda.
   ------------------------------------------------------------------------ */
function creditoACuotas(extra, fechas) {
  const dias = fechas || ['2026-10-30', '2026-11-15'];
  const plan = M.construirPlanACuotas(650000, dias.map(f => ({ fecha: f, pct: 20 })),
    { fechaDesembolso: '2026-10-16' });
  return Object.assign({
    id: 'c1', numero: 90, socioId: 's1', socioNombre: 'Clienta Cuotas', capital: 650000, costoPct: 20,
    fechaDesembolso: '2026-10-16', cicloActual: dias[0], prorrogas: [], abonosCapital: [],
    comprobantes: [], pagado: false, planPagos: P.planPagosDeAlta(plan)
  }, extra || {});
}
/* Un plan de RESCATE (§8): el que nace cuando se acaban las prórrogas, con su
   entrada pagada. Mismo dibujo que en la-barra-revisada.test.js. */
function creditoDeRescate() {
  return {
    id: 'c2', numero: 91, socioId: 's1', socioNombre: 'Clienta Cuotas', capital: 400000, costoPct: 20,
    fechaDesembolso: '2026-08-15', cicloActual: '2026-10-31', prorrogas: [], abonosCapital: [],
    comprobantes: [], pagado: false,
    planPagos: { creado: '2026-10-15', tasa_por_corte: 0.05,
      entrada: { fecha: '2026-10-15', ciclo: '2026-10-15', monto: 80000, mora: 0, aTiempo: true, diasMora: 0 },
      total_capital: 400000, total_costo: 30000, total_a_pagar: 430000,
      cuotas: [
        { n: 1, fecha: '2026-10-31', capital: 200000, costo: 20000, total: 220000, pagado: false,
          fechaPagado: null, recargo: 0, garantiaGenerada: 0 },
        { n: 2, fecha: '2026-11-17', capital: 200000, costo: 10000, total: 210000, pagado: false,
          fechaPagado: null, recargo: 0, garantiaGenerada: 0 }] }
  };
}
function cartera(prestamos) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Clienta Cuotas', cedula: '52111222', telefono: '3001112233',
               whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }],
    prestamos, config: { negocio: 'Tu Garantía' }
  };
}
/* Lo que hace la pantalla del computador con un abono `ok`: empujarlo. */
function abonar(p, fecha, monto) {
  const r = P.abonoACuota(p, fecha, monto);
  assert.equal(r.ok, true, r.detalle);
  p.abonosCapital.push(r.registros.abono);
  return r;
}
/* Cerrar la cuota que sigue: lo que hacen el computador y el celular con lo que
   devuelve PUENTE.cierreDeCuota (17-oct-2026: es la única cuenta del cierre). */
function cerrarCuota(p, fecha) {
  const r = P.cierreDeCuota(p, fecha);
  assert.equal(r.ok, true, r.detalle);
  Object.assign(p.planPagos.cuotas.find(c => c.n === r.registros.cuota.n), r.registros.cuota);
  if (r.registros.abono) p.abonosCapital.push(r.registros.abono);
  if (r.registros.cicloActual) p.cicloActual = r.registros.cicloActual;
  if (r.registros.credito) Object.assign(p, r.registros.credito);
  return r;
}
/* El texto de un .ics como lo lee una persona: sin el plegado de 75 columnas
   ni los escapes de coma y punto y coma. */
const icsPlano = s => String(s).replace(/\r\n /g, '').replace(/\\([,;])/g, '$1');
/* Y con «pagar todo»: lo que dice liquidarSaldoPlan que se guarda. */
function saldar(p, fecha) {
  const r = P.liquidarSaldoPlan(p, fecha);
  r.registros.cuotas.forEach(x => Object.assign(p.planPagos.cuotas.find(c => c.n === x.n), x));
  r.registros.abonos.forEach(a => p.abonosCapital.push(a));
  Object.assign(p, r.registros.credito);
  return r;
}

/* ------------------------------------------------------------------------
   LA APP DEL CLIENTE, arrancada de verdad: una cuenta junta, sin señal, con el
   paquete del día guardado en el teléfono (es el camino que abre sin red).
   ------------------------------------------------------------------------ */
async function appDelCliente(prestamos, diaPaquete, diaApertura) {
  const db = cartera(prestamos);
  const paquete = P.migrarSocio(db, db.socios[0], diaPaquete);
  const ahora = new Date((diaApertura || diaPaquete) + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000,
    celular: '3001112233', paquete: { nombre: 'Clienta Cuotas', datos: paquete,
      actualizado_en: diaPaquete + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  return { A, paquete, inicio: () => plano(A.elem('cuerpo').innerHTML) };
}
const vista = (A, js) => { A.ev(js); return plano(A.elem('cuerpo').innerHTML); };

/* ======================================================================== */
describe('el paquete del cliente trae lo que la app pinta (y la app no rehace cuentas)', () => {

  test('migrarSocio manda el calendario en pesos, lo que falta y lo que costaría saldar hoy', () => {
    const c = P.migrarSocio(cartera([creditoACuotas()]), cartera([]).socios[0], '2026-10-16').creditos[0];
    assert.equal(c.plan_origen, 'alta');
    assert.deepEqual(c.plan.map(x => [x.n, x.fecha, x.total]), [[1, '2026-10-30', 455000], [2, '2026-11-15', 390000]]);
    assert.equal(c.saldo_plan, 845000);
    assert.equal(c.saldar_hoy, 780000);
    assert.ok(!/"pct"/.test(JSON.stringify(c)), 'el % de cada cuota viajó al teléfono del cliente');
  });
});

/* ======================================================================== */
describe('la app del cliente con el crédito a cuotas del caso de Joan', () => {

  test('el 16-oct: la cuota de 455.000 es «Total de esta cuota», no «Total para saldar»', async () => {
    const { inicio } = await appDelCliente([creditoACuotas()], '2026-10-16');
    const t = inicio();
    assert.match(t, /Tu crédito a cuotas · cuota 1 de 2/);
    assert.match(t, /\$455\.000 Total de esta cuota/);
    assert.ok(!/Total para saldar/.test(t), 'con 845.000 por pagar, 455.000 no salda nada');
    assert.match(t, /Es la cuota 1 de 2 de tu crédito a cuotas, el 30 oct 2026/);
  });

  test('ve el calendario entero: 455.000 el 30-oct y 390.000 el 15-nov, y que el 15 es domingo', async () => {
    const t = (await appDelCliente([creditoACuotas()], '2026-10-16')).inicio();
    assert.match(t, /Cuota 1 · 30 oct 2026 pendiente \$455\.000/);
    assert.match(t, /Cuota 2 · 15 nov 2026 \(domingo\) pendiente \$390\.000/);
    /* La fecha no se corre (decisión de Joan), así que se le dice qué hacer. */
    assert.match(t, /no se corre: si ese día no puedes, paga antes/);
  });

  test('le queda 845.000; pagando todo hasta el 30-oct, 780.000, y se le dice por qué es menos', async () => {
    const t = (await appDelCliente([creditoACuotas()], '2026-10-16')).inicio();
    assert.match(t, /Te queda por pagar en total \$845\.000/);
    assert.match(t, /Si quieres pagar todo hoy, o cualquier día hasta el 30 oct 2026 \$780\.000/);
    assert.match(t, /El costo de las cuotas que todavía no empiezan no se cobra/);
  });

  test('ni entrada, ni «plan de pagos», ni «las de más adelante cuestan menos»', async () => {
    const { A, inicio } = await appDelCliente([creditoACuotas()], '2026-10-16');
    const textos = [inicio(), vista(A, "irA('historial')"), vista(A, 'verReglas()'), A.ev('armarICS(S.activo)')];
    textos.forEach(t => {
      assert.ok(!/entrada del plan|ya la pagaste el día que lo pactamos/.test(t), 'habla de una entrada que no hubo');
      assert.ok(!/cuestan menos/.test(t), 'promete que las de adelante cuestan menos');
    });
    assert.ok(!/plan de pagos/i.test(textos[0]), 'Inicio le dice «plan de pagos» a un crédito a cuotas');
    assert.ok(!/plan de pagos/i.test(textos[1]), 'el historial le dice «plan de pagos»');
    assert.ok(!/plan de pagos/i.test(textos[3]), 'el recordatorio le dice «plan de pagos»');
    assert.match(textos[1], /a cuotas, 0 de 2 cuotas pagadas/);
  });

  test('ningún porcentaje en lo que ve: Inicio, historial, reglas y el recordatorio', async () => {
    const { A, inicio } = await appDelCliente([creditoACuotas()], '2026-10-16');
    const textos = { inicio: inicio(), historial: vista(A, "irA('historial')"),
                     reglas: vista(A, 'verReglas()'), ics: A.ev('armarICS(S.activo)') };
    Object.keys(textos).forEach(k => {
      const m = textos[k].match(/.{0,40}\d\s?%.{0,20}/);
      assert.equal(m, null, k + ' le muestra un porcentaje al cliente: ' + (m && m[0]));
    });
  });

  test('la salida de una cuota: no se prorroga, se puede abonar y el recargo es sobre el capital que falte', async () => {
    const { A, inicio } = await appDelCliente([creditoACuotas()], '2026-10-16');
    const frase = /no se prorroga\. Si ese día no te alcanza, escríbenos: puedes abonar lo que tengas a la cuota y lo que falte sigue en la misma fecha, con recargo solo sobre el capital que te falte/;
    assert.match(inicio(), frase);
    assert.match(A.ev('armarICS(S.activo)').replace(/\r\n /g, '').replace(/\\,/g, ','), frase);
    assert.equal(A.ev('salidasDelCredito(S.activo).prorroga'), false);
  });

  test('un día tarde (31-oct): la cuota con su recargo, y pagar todo hoy ya trae la quincena de la 2', async () => {
    const t = (await appDelCliente([creditoACuotas()], '2026-10-31')).inicio();
    assert.match(t, /Total de esta cuota hoy \$458\.250/);
    assert.match(t, /Te queda por pagar en total, con el recargo de hoy \$848\.250/);
    assert.match(t, /Si quieres pagar todo hoy \$848\.250/);
    assert.ok(!/cualquier día hasta/.test(t), 'con recargo corriendo, el valor de hoy no vale para mañana');
  });

  test('un paquete viejo con recargo corriendo no promete el «pagar todo» de otro día', async () => {
    /* Armado el 31-oct (848.250) y abierto el 2-nov, sin señal: ese número ya
       no es el de hoy (el puente diría 854.750) y la app no puede rehacerlo. */
    const t = (await appDelCliente([creditoACuotas()], '2026-10-31', '2026-11-02')).inicio();
    assert.ok(!/848\.250/.test(t), 'mostró el saldo de hace dos días como si fuera el de hoy');
    assert.match(t, /Si quieres pagar todo de una vez, escríbenos/);
  });

  test('con un abono de 100.000 el 5-nov: lo que abonó, lo que falta, y nada de «costo» rebajado a secas', async () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);   // 19.500 al recargo + 80.500 al costo
    const t = (await appDelCliente([p], '2026-11-05')).inicio();
    assert.match(t, /Ya abonaste a esta cuota \$100\.000/);
    assert.match(t, /Lo que falta del costo \$49\.500/);
    assert.match(t, /Lo que falta de esta cuota hoy \$374\.500/);
    assert.match(t, /Cuota 1 · 30 oct 2026 vencida · abonaste \$100\.000, te faltan \$374\.500 \$455\.000/);
    assert.match(t, /Te queda por pagar en total \$764\.500/);
  });

  test('con el costo ya abonado, no le dice «tu cupo sube $0»', async () => {
    const p = creditoACuotas();
    abonar(p, '2026-10-25', 200000);   // 130.000 al costo + 70.000 al capital
    const { A, inicio } = await appDelCliente([p], '2026-10-25');
    const t = inicio();
    assert.ok(!/sube \$0/.test(t), 'le promete una garantía de cero pesos');
    assert.match(t, /El costo de esta cuota ya lo abonaste/);
    assert.ok(!/sube \$0/.test(A.ev('armarICS(S.activo)')));
  });

  test('el 20-nov, con las dos vencidas: dice cuál más venció y el total CON los dos recargos', async () => {
    const t = (await appDelCliente([creditoACuotas()], '2026-11-20')).inicio();
    assert.match(t, /También venció la cuota 2 \(\$390\.000\), con su propio recargo/);
    /* 17-oct-2026: el paquete trae la mora de hoy de cada cuota (plan[].mora):
       845.000 que faltan + 68.250 de la 1 + 16.250 de la 2. Antes decía «sin
       los recargos» y la cliente leía 845.000 de una deuda de 929.500. */
    assert.match(t, /Te queda por pagar en total, con los recargos de hoy \$929\.500/);
    assert.ok(!/sin los recargos/.test(t));
    assert.match(t, /Tienes 2 cuotas vencidas/);
    /* Y es exactamente lo que el puente cobraría por pagar todo hoy. */
    assert.equal(P.liquidarSaldoPlan(creditoACuotas(), '2026-11-20').total, 929500);
    assert.match(t, /Si quieres pagar todo hoy \$929\.500/);
  });

  test('con dos vencidas y un paquete de otro día no inventa los recargos de hoy', async () => {
    /* Armado el 20-nov y abierto el 22-nov sin señal: la mora de cada cuota es
       la del 20 y la app no puede rehacerla cuota por cuota. */
    const t = (await appDelCliente([creditoACuotas()], '2026-11-20', '2026-11-22')).inicio();
    assert.ok(!/929\.500/.test(t), 'dio el total de hace dos días como si fuera el de hoy');
    assert.match(t, /Te queda por pagar, sin los recargos \$845\.000/);
    assert.match(t, /Escríbenos y te decimos el total con la cuenta de hoy/);
    assert.match(t, /Si quieres pagar todo de una vez, escríbenos/);
  });

  test('pagado entero: el historial dice lo que pidió (650.000), no «$0»', async () => {
    const p = creditoACuotas();
    saldar(p, '2026-10-30');
    const { A } = await appDelCliente([p], '2026-11-02');
    const h = vista(A, "irA('historial')");
    assert.match(h, /\$650\.000 CR-0090/);
    assert.ok(!/\$0 CR-0090/.test(h), 'el crédito pagado volvió a salir como de $0');
    assert.match(h, /a cuotas, 2 de 2 cuotas pagadas/);
  });

  test('las reglas explican el crédito a cuotas solo a quien tiene uno', async () => {
    const con = vista((await appDelCliente([creditoACuotas()], '2026-10-16')).A, 'verReglas()');
    assert.match(con, /Crédito a cuotas/);
    assert.match(con, /va primero al recargo, después al costo y después al capital/);
    assert.match(con, /El costo de las que todavía no empiezan no se cobra/);
    const sin = vista((await appDelCliente([creditoDeRescate()], '2026-10-16')).A, 'verReglas()');
    assert.ok(!/Crédito a cuotas/.test(sin), 'le explica un producto que no tiene');
  });
});

/* ======================================================================== */
describe('un paquete viejo no cobra de menos la quincena que ya empezó', () => {
  test('paquete del 30-oct (cuota 1 recién pagada) abierto sin señal el 20-nov: 390.000 más el recargo, no 325.000', async () => {
    /* El 30-oct la cuota 2 valía 325.000 (su quincena empezaba el 31); el
       paquete de ese día viaja con costo 0. Abierto el 20-nov, la quincena ya
       corrió entera y la cuota venció el 15: son 325.000 + 65.000 + 5 días de
       recargo (16.250). Sin `costo_en_su_fecha` la app decía 341.250. */
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const { A, paquete } = await appDelCliente([p], '2026-10-30', '2026-11-20');
    assert.equal(paquete.creditos[0].costo_en_su_fecha, 65000);
    const q = A.ev('JSON.stringify(liquidacion(S.activo))');
    const l = JSON.parse(q);
    assert.equal(l.costo, 65000);
    assert.equal(l.total_a_pagar, 325000 + 65000 + 16250);
  });

  test('el mismo paquete abierto el mismo día sigue diciendo 325.000', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const { A } = await appDelCliente([p], '2026-10-30');
    assert.equal(JSON.parse(A.ev('JSON.stringify(liquidacion(S.activo))')).total_a_pagar, 325000);
  });
});

describe('el plan de RESCATE se queda con sus textos', () => {

  test('sigue siendo «plan de pagos», con su entrada; solo cambia el rótulo del total', async () => {
    const t = (await appDelCliente([creditoDeRescate()], '2026-10-16')).inicio();
    assert.match(t, /Tu plan de pagos · cuota 1 de 2/);
    assert.match(t, /La entrada del plan ya la pagaste el día que lo pactamos/);
    assert.match(t, /\$220\.000 Total de esta cuota/);
    assert.ok(!/Total para saldar/.test(t));
    assert.ok(!/crédito a cuotas|Tus cuotas/.test(t), 'el rescate se pinta como crédito a cuotas');
  });

  test('un paquete viejo, sin plan_origen, también se queda con los textos del rescate', async () => {
    const db = cartera([creditoACuotas()]);
    const paquete = P.migrarSocio(db, db.socios[0], '2026-10-16');
    ['plan_origen', 'plan', 'saldo_plan', 'saldar_hoy'].forEach(k => delete paquete.creditos[0][k]);
    const ahora = new Date('2026-10-16T10:30:00').getTime();
    const A = abrirSocio({ ahora, local: { socio_cuenta: JSON.stringify({ access_token: 'a', refresh_token: 'r',
      expira_en: ahora + 3600000, celular: '3001112233',
      paquete: { nombre: 'Clienta Cuotas', datos: paquete, origen: 'nube', cedula: '3001112233' } }) } });
    await asentar(16);
    const t = plano(A.elem('cuerpo').innerHTML);
    assert.match(t, /Tu plan de pagos · cuota 1 de 2/);
    assert.match(t, /Total de esta cuota/);
    assert.ok(!/Tus cuotas|pagar todo/.test(t), 'pintó datos que el paquete viejo no trae');
  });
});

/* ======================================================================== */
describe('el celular de Joan con el crédito a cuotas', () => {

  test('cobrar la cuota tras un abono anotado en el computador baja el capital SOLO lo que faltaba', () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 200000);   // 19.500 recargo + 130.000 costo + 50.500 capital
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-05T10:30:00' });
    e.ev("cobrar('c1', '2026-11-05')");
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.planPagos.cuotas[0].pagado, true);
    assert.equal(P.capitalActual(q), 325000, 'el capital de la cuota se descontó dos veces');
    const deLaCuota = q.abonosCapital.filter(a => a.cuotaPlan === 1);
    assert.deepEqual(deLaCuota.map(a => a.monto).sort((x, y) => x - y), [50500, 274500]);
    assert.equal(q.planPagos.cuotas[0].recargo, 19500, 'el recargo que entró en el abono se perdió al cerrar');
    assert.equal(q.cicloActual, '2026-11-15');
  });

  test('el recargo de la cuota es el del abono más el de hoy (19.500 + 16.250)', () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);
    const hoy = P.liquidarCiclo(copia(p), '2026-11-10');
    assert.equal(hoy.recargo_mora, 16250);
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-10T10:30:00' });
    e.ev("cobrar('c1', '2026-11-10')");
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.planPagos.cuotas[0].recargo, 35750);
    assert.equal(P.capitalActual(q), 325000);
    /* Y la partición del puente cuadra con lo que entró: 100.000 + 390.750. */
    assert.equal(P.pagadoDeCuota(q, q.planPagos.cuotas[0]).recibido, 100000);
  });

  test('sin abonos el cobro sigue igual: un abono a capital por la cuota entera', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-10-30T10:30:00' });
    e.ev("cobrar('c1', '2026-10-30')");
    const q = e.json('DB.prestamos[0]');
    /* 17-oct-2026, segunda revisión: el abono de cierre trae también lo que
       entró ese día por la cuota (`recibido`), para cotejar un choque. */
    assert.deepEqual(q.abonosCapital, [{ fecha: '2026-10-30', monto: 325000, cuotaPlan: 1, recibido: 455000 }]);
    assert.equal(q.planPagos.cuotas[0].recargo, 0);
  });

  test('su tablero cuenta lo cobrado en cuotas: los 195.000, cada cuota en la quincena que la contiene', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-10-30T10:30:00' });
    e.ev("cobrar('c1', '2026-10-30')");
    /* La tarjeta del día es la quincena del 31-oct: la cuota del 30 cae adentro,
       y una sola vez (130.000, no 260.000: la tarjeta ya no suma renglones). */
    const tarjeta = plano(e.ev('vistaQuincena()'));
    assert.match(tarjeta, /Quincena del .*\$130\.000 ganancia del ciclo/);
    e.ev("cobrar('c1', '2026-11-15')");
    /* 17-oct-2026: el puente pone cada cuota en la quincena que contiene su
       fecha (quincenaDe): la del 30-oct en la del 31-oct y la del 15-nov
       (domingo, 16 festivo) en la del 17-nov. Una fecha de cuota no es una
       quincena: ahí no cuenta nada, y así no se cuenta dos veces. */
    assert.equal(e.ev("gananciaDeQuincena('2026-10-31')"), 130000);
    assert.equal(e.ev("gananciaDeQuincena('2026-11-17')"), 65000);
    assert.equal(e.ev("gananciaDeQuincena('2026-10-30') + gananciaDeQuincena('2026-11-15')"), 0);
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.pagado, true);
    assert.equal(q.gananciaPago, 0, 'el cierre contaría la ganancia dos veces');
    /* Y el celular dice lo mismo que el computador, que pregunta lo mismo al puente. */
    assert.equal(P.cobradoDelPlanEnQuincena(q, '2026-11-17'), 65000);
    /* La tarjeta del 15-nov es la de la quincena del 17-nov. */
    const e2 = abrirEspejo({ cartera: cartera([q]), ahora: '2026-11-15T10:30:00' });
    assert.match(plano(e2.ev('vistaQuincena()')), /Quincena del .*\$65\.000 ganancia del ciclo/);
  });

  test('antes de cobrar, la cuota del 30-oct vence en la quincena del 31-oct', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-10-16T10:30:00' });
    const t = plano(e.ev('vistaQuincena()'));
    assert.match(t, /Por cobrar en el ciclo \$455\.000/);
    assert.match(t, /Créditos que vencen 1/);
    assert.match(t, /Clienta Cuotas \$455\.000/);
  });

  test('los rótulos: «Costo de la cuota (20%)» en el crédito a cuotas, el del plan en el rescate', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas(), creditoDeRescate()]), ahora: '2026-10-16T10:30:00' });
    e.ev("SEL.creditoId = 'c1'");
    const alta = plano(e.ev('vistaCredito()'));
    assert.match(alta, /Costo de la cuota \(20%\) \$130\.000/);
    assert.ok(!/Costo del plan/.test(alta));
    assert.match(alta, /Es un crédito a cuotas/);
    assert.match(alta, /Cuota 2 · 15 de nov de 2026 \(20%\) \$390\.000/);
    e.ev("SEL.creditoId = 'c2'");
    const rescate = plano(e.ev('vistaCredito()'));
    assert.match(rescate, /Costo del plan \(5% del saldo\)/);
    assert.match(rescate, /Está en plan de pagos/);
  });

  test('con abonos, la vista del crédito dice lo que falta y cuánto entró', () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-05T10:30:00' });
    e.ev("SEL.creditoId = 'c1'");
    const t = plano(e.ev('vistaCredito()'));
    assert.match(t, /Lo que falta del costo de la cuota \(pactado al 20%\) \$49\.500/);
    assert.match(t, /Lo que falta de la cuota \$374\.500/);
    assert.match(t, /Cuota 1 · 30 de oct de 2026 \(20%\) abonó \$100\.000/);
    assert.match(t, /a la cuota 1 \$0 a capital \$100\.000/);
  });

  test('la hoja de cobro dice la verdad: abono a una cuota y «pagar todo» se anotan en el computador', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-10-16T10:30:00' });
    // La hoja busca su caja para subirla al principio (como en abono-con-prorroga-celular).
    e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
    e.tocar('cobro', { id: 'c1' });
    const t = plano(e.elems.pgCalc.innerHTML);
    assert.match(t, /Es un crédito a cuotas/);
    assert.match(t, /El abono a una cuota y «pagar todo» se anotan desde el computador/);
    assert.ok(!/plan de pagos/.test(t));
    assert.match(t, /Pagó la cuota 1 \(\$455\.000\)/);
    /* Y un abono suelto desde el celular no se cuela por fuera de la cascada. */
    e.ev("abonarEnCalle('c1', 100000, '2026-10-16')");
    assert.match(e.avisos.pop(), /el abono a una cuota se anota desde el computador/);
    assert.deepEqual(e.json('DB.prestamos[0].abonosCapital'), []);
  });
});

/* ========================================================================
   17-oct-2026, revisión — LA ÚLTIMA CUOTA ANTES DE QUE EMPIECE SU QUINCENA.
   El caso de Joan: paga la cuota 1 el 30-oct. Ese día la cuota 2 vale 325.000
   (su quincena empieza el 31 y antes no hay costo); desde el 31, 390.000.
   ======================================================================== */
describe('la app del cliente con la regla única del costo', () => {

  test('cuota 1 pagada el 30-oct, paquete del 30: «pagar todo hoy» son 325.000, y NO «hasta el 15-nov»', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const { inicio, paquete } = await appDelCliente([p], '2026-10-30');
    assert.equal(paquete.creditos[0].saldar_hasta, '2026-10-30');
    const t = inicio();
    assert.match(t, /Si quieres pagar todo hoy \$325\.000/);
    assert.ok(!/hasta el 15 nov/.test(t), 'le dio quince días a una cifra que vence esta noche');
    assert.match(t, /El costo de las cuotas que todavía no empiezan no se cobra/);
  });

  test('ese mismo día la cuota se presenta con lo que vale en su fecha, y los 325.000 aparte y con su porqué', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const t = (await appDelCliente([p], '2026-10-30')).inicio();
    assert.ok(!/\$325\.000 Total de esta cuota/.test(t), '«Total de esta cuota $325.000» a secas: el 15-nov son 390.000');
    assert.match(t, /Este corte tienes que pagar \$390\.000 Es la cuota 2 de 2 de tu crédito a cuotas, el 15 nov 2026\. Si la pagas hoy, son \$325\.000: abajo te decimos por qué/);
    assert.match(t, /\$390\.000 Total de esta cuota el 15 nov 2026/);
    assert.match(t, /Si la pagas hoy, son \$325\.000\. Su quincena empieza el día después del 30 oct 2026, y antes de eso su costo no se cobra\. Es tu última cuota: pagarla antes es pagar todo el crédito/);
    assert.ok(!/sube \$0|Costo \$0/.test(t), 'le muestra un costo o una garantía de cero pesos');
    /* La cifra del 15 la trae el puente, y es la que cobraría ese día. */
    assert.equal(P.liquidarCiclo(copia(p), '2026-11-15').total_a_pagar, 390000);
  });

  test('cuota 1 pagada el 20-oct: los 325.000 valen hasta el 30-oct, el día antes de que empiece la quincena', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-20');
    const t = (await appDelCliente([p], '2026-10-20')).inicio();
    assert.match(t, /Si quieres pagar todo hoy, o cualquier día hasta el 30 oct 2026 \$325\.000/);
    assert.match(t, /Si la pagas hasta el 30 oct 2026, son \$325\.000/);
  });

  test('un paquete del 30-oct abierto el 2-nov ya no promete los 325.000', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const t = (await appDelCliente([p], '2026-10-30', '2026-11-02')).inicio();
    assert.ok(!/son \$325\.000|pagar todo hoy[^.]*\$325\.000/.test(t), 'prometió una cifra que venció el 30-oct');
    assert.match(t, /Si quieres pagar todo de una vez, escríbenos: ese valor cambió después del 30 oct 2026/);
    /* Lo de su fecha sí sigue valiendo. */
    assert.match(t, /\$390\.000 Total de esta cuota el 15 nov 2026/);
  });

  test('el 31-oct, ya empezada la quincena de la 2, se vuelve una sola cifra: 390.000', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const t = (await appDelCliente([p], '2026-10-31')).inicio();
    assert.match(t, /\$390\.000 Total de esta cuota/);
    assert.ok(!/Si la pagas/.test(t));
    assert.ok(!/325\.000 Total/.test(t));
  });

  test('un abono antes de su quincena va a capital: 270.000 el 15-nov, 225.000 hasta el 30-oct', async () => {
    /* Caso (b) del puente: cuota 1 pagada el 20-oct + abono de 100.000 el 25. */
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-20');
    const r = abonar(p, '2026-10-25', 100000);
    assert.deepEqual(r.aplica, { mora: 0, costo: 0, capital: 100000 });
    const { A, inicio } = await appDelCliente([p], '2026-10-25');
    const t = inicio();
    assert.match(t, /\$270\.000 Lo que falta de esta cuota el 15 nov 2026/);
    assert.match(t, /Ya abonaste a esta cuota \$100\.000/);
    assert.match(t, /Lo que falta del capital de la cuota 2 \$225\.000/);
    assert.match(t, /Si la pagas hasta el 30 oct 2026, son \$225\.000/);
    assert.match(t, /abonaste \$100\.000, te faltan \$270\.000/);
    assert.match(t, /Si quieres pagar todo hoy, o cualquier día hasta el 30 oct 2026 \$225\.000/);
    /* Y el recordatorio, que es para el 15-nov, lleva lo del 15-nov. */
    const ics = icsPlano(A.ev('armarICS(S.activo)'));
    assert.match(ics, /SUMMARY:Pagar \$270\.000/);
    assert.match(ics, /Ya abonaste \$100\.000 a esta cuota\. Lo que falta: \$270\.000 \(la cuota 2 de 2 de tu crédito a cuotas: lo que falta de su capital, \$225\.000, y su costo/);
  });

  test('el recordatorio de la última cuota antes de su quincena dice lo del 15-nov, no lo de hoy', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const { A } = await appDelCliente([p], '2026-10-30');
    const ics = icsPlano(A.ev('armarICS(S.activo)'));
    assert.match(ics, /DTSTART:20261115/);
    assert.match(ics, /SUMMARY:Pagar \$390\.000/);
    assert.match(ics, /En 2 días vence tu pago de \$390\.000/);
    assert.ok(!/325\.000 \+ costo|costo \$0|sube \$0/.test(ics), 'liquidó el 15-nov con el costo de hoy (cero)');
  });

  test('el recordatorio de una cuota con abonos dice cuánto abonó y que lo de abajo es lo que FALTA', async () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);   // 19.500 al recargo + 80.500 al costo
    const { A } = await appDelCliente([p], '2026-11-05');
    const ics = icsPlano(A.ev('armarICS(S.activo)'));
    assert.match(ics, /Ya abonaste \$100\.000 a esta cuota\. Lo que falta: \$374\.500 \(lo que falta del capital \$325\.000 \+ lo que falta del costo \$49\.500\)/);
    assert.ok(!/\+ costo \$49\.500/.test(ics), 'rotuló como costo de la cuota lo que falta del costo');
  });

  test('cero porcentajes en los casos nuevos, y ninguna función pct( en la app', async () => {
    const casos = [];
    const a = creditoACuotas(); cerrarCuota(a, '2026-10-30'); casos.push([a, '2026-10-30']);
    const b = creditoACuotas(); cerrarCuota(b, '2026-10-20'); abonar(b, '2026-10-25', 100000); casos.push([b, '2026-10-25']);
    casos.push([creditoACuotas(), '2026-11-20']);
    for (const [p, dia] of casos) {
      const { A, inicio } = await appDelCliente([p], dia);
      const textos = { inicio: inicio(), ics: icsPlano(A.ev('armarICS(S.activo)')) };
      Object.keys(textos).forEach(k => {
        const m = textos[k].match(/.{0,40}\d\s?%.{0,20}/);
        assert.equal(m, null, k + ' (' + dia + ') le muestra un porcentaje al cliente: ' + (m && m[0]));
      });
    }
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');
    assert.ok(!/function\s+pct\s*\(/.test(fuente), 'socio.html volvió a declarar pct(');
  });
});

/* ======================================================================== */
describe('el celular de Joan con la regla única del costo', () => {

  test('la ficha del socio dice qué cuota es y cuánto vale, no «para saldar»', () => {
    const ficha = (p, ahora) => {
      const e = abrirEspejo({ cartera: cartera([p]), ahora });
      e.ev("SEL.socioId = 's1'");
      return plano(e.ev('vistaFicha()'));
    };
    const t1 = ficha(creditoACuotas(), '2026-10-16T10:30:00');
    assert.match(t1, /vence el 30 de oct de 2026 · cuota 1 de 2: \$455\.000/);
    assert.ok(!/para saldar/.test(t1), 'con 845.000 por pagar, 455.000 no salda nada');
    const conAbono = creditoACuotas();
    abonar(conAbono, '2026-11-05', 100000);
    assert.match(ficha(conAbono, '2026-11-05T10:30:00'), /cuota 1 de 2 · lo que falta de la cuota: \$374\.500/);
    const sinEmpezar = creditoACuotas();
    cerrarCuota(sinEmpezar, '2026-10-30');
    assert.match(ficha(sinEmpezar, '2026-10-30T10:30:00'),
      /vence el 15 de nov de 2026 · cuota 2 de 2: \$390\.000 \(si la cierra hoy, \$325\.000\)/);
  });

  test('cobrar la última cuota antes de su quincena escribe EXACTAMENTE lo que dice cierreDeCuota', () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const esperado = copia(p);
    const r = cerrarCuota(esperado, '2026-10-30');
    assert.equal(r.saldado_antes, true);
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-10-30T10:30:00' });
    e.ev("cobrar('c1', '2026-10-30')");
    const q = e.json('DB.prestamos[0]');
    assert.deepEqual(q.planPagos, esperado.planPagos);
    assert.deepEqual(q.abonosCapital, esperado.abonosCapital);
    assert.equal(q.pagado, true);
    assert.equal(q.planPagos.cuotas[1].costo, 0, 'cobró el costo de una quincena que no empezó');
    assert.equal(q.planPagos.cuotas[1].costoPactado, 65000);
    assert.equal(P.capitalActual(q), 0);
  });

  test('la hoja de cobro avisa que es pagar todo antes y dice lo que vale en su fecha', () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-10-30T10:30:00' });
    e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
    e.tocar('cobro', { id: 'c1' });
    const t = plano(e.elems.pgCalc.innerHTML);
    assert.match(t, /La cuota 2 todavía no empieza y es la última: cobrarla ese día es pagar todo antes \(\$325\.000\), y su costo no se cobra\. En su fecha \(15 de nov de 2026\) vale \$390\.000/);
    assert.match(t, /Pagó la cuota 2 \(\$325\.000\)/);
  });

  test('una cuota del MEDIO que no ha empezado no se cobra desde el celular: lo dice y no registra', () => {
    const p = creditoACuotas(null, ['2026-10-30', '2026-11-15', '2026-11-30']);
    cerrarCuota(p, '2026-10-20');
    assert.equal(P.cierreDeCuota(copia(p), '2026-10-25').motivo, 'no_ha_empezado');
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-10-25T10:30:00' });
    e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
    e.tocar('cobro', { id: 'c1' });
    const hoja = plano(e.elems.pgCalc.innerHTML);
    assert.match(hoja, /Esta cuota no se puede cobrar con esa fecha\. La cuota 2 todavía no empieza/);
    assert.ok(!/Pagó la cuota 2/.test(hoja), 'ofreció un botón que no puede cumplir');
    e.ev("cobrar('c1', '2026-10-25')");
    /* Y el aviso no manda a buscar en el celular un botón que vive en el computador. */
    assert.match(e.avisos.pop(), /La cuota 2 todavía no empieza[\s\S]*se anotan en el computador/);
    const q = e.json('DB.prestamos[0]');
    assert.deepEqual(q.planPagos.cuotas.map(c => c.pagado), [true, false, false]);
    assert.equal(q.abonosCapital.length, 1);
  });

  test('un cobro con fecha anterior a un abono ya anotado no se registra', () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-05T10:30:00' });
    e.ev("cobrar('c1', '2026-11-03')");
    assert.match(e.avisos.pop(), /Este crédito ya tiene un pago anotado el 5 de noviembre de 2026/);
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.planPagos.cuotas[0].pagado, false);
    assert.equal(q.abonosCapital.length, 1);
  });

  test('el cobro de una cuota ya no escribe por su cuenta: aplica los registros del puente', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'panel', 'espejo.html'), 'utf8');
    const i = fuente.indexOf('\nfunction cobrarCuotaDelPlan('), j = fuente.indexOf('\nfunction ', i + 1);
    const cuerpo = fuente.slice(i, j);
    assert.match(cuerpo, /P\.cierreDeCuota\(p, f\)/);
    assert.match(cuerpo, /aplicarCierreDeCuota\(p, r\.registros\)/);
    assert.ok(!/c\.pagado\s*=|abonosCapital\.push\(\{|p\.pagado\s*=/.test(cuerpo), 'volvió la escritura propia del cierre');
  });

  test('el choque de una cuota cobrada en un aparato y abonada en el otro se puede leer', () => {
    const base = creditoACuotas();
    const cel = copia(base);
    cerrarCuota(cel, '2026-10-30');
    const pc = copia(base);
    abonar(pc, '2026-11-02', 100000);
    const e = abrirEspejo({ cartera: cartera([base]), ahora: '2026-11-03T10:30:00' });
    e.ev('var __c=' + JSON.stringify({ mio: cel, suyo: pc }));
    const t = plano(e.ev('ladosHTML(__c)'));
    assert.ok(!/objeto/.test(t), 'el plan sigue saliendo como «objeto»');
    assert.match(t, /Cuotas 1 de 2 cuotas pagadas: cuota 1 pagada el 30 de oct de 2026 · cuota 2 pendiente: 15 de nov de 2026 \(20%\) \$390\.000/);
    assert.match(t, /Cuotas 0 de 2 cuotas pagadas: cuota 1 pendiente: 30 de oct de 2026 \(20%\) \$455\.000 · cuota 2 pendiente/);
    /* 17-oct-2026, segunda revisión: en pesos que ENTRARON (el cierre por lo
       que se cobró, 455.000), no por el capital (325.000). */
    assert.match(t, /Lo que entró por las cuotas Cuota 1: cierre 30 de oct de 2026 \$455\.000/);
    assert.match(t, /Lo que entró por las cuotas Cuota 1: abono 02 de nov de 2026 \$100\.000/);
  });
});

/* ========================================================================
   subir.html, ARRANCADO DE VERDAD (el mismo montaje que lo-mio-encima.test.js):
   la tarjeta del choque de un crédito a cuotas.
   ======================================================================== */
function abrirSubir() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'panel', 'subir.html'), 'utf8');
  const elems = {};
  const elem = id => (elems[id] = elems[id] || { id, value: '', checked: false, textContent: '',
    innerHTML: '', dataset: {}, style: {}, disabled: false, title: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, setAttribute() {}, focus() {}, remove() {} });
  const doc = { getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('nuevo'), addEventListener() {}, body: elem('body'),
    documentElement: elem('html'), title: '' };
  const almacen = {};
  const ctx = { console, document: doc, alert() {}, confirm: () => true, prompt: () => null,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null),
                    setItem: (k, v) => { almacen[k] = String(v); }, removeItem: k => { delete almacen[k]; } },
    location: { href: 'http://localhost/panel/subir.html', hash: '', pathname: '/panel/subir.html', search: '' },
    history: { replaceState() {} }, navigator: { userAgent: 'node' },
    fetch: () => Promise.reject(new Error('sin red')), setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}, TextEncoder, TextDecoder, URL, Intl, Date, Math, JSON,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'), Blob: class {}, FileReader: class {} };
  ctx.window = ctx; ctx.self = ctx;
  ctx.NubeTuGarantia = NUBE; ctx.MotorReglas = M; ctx.PuenteTuGarantia = P;
  vm.createContext(ctx);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'subir#' + i }));
  return { ctx, ev: e => vm.runInContext(e, ctx, { filename: 'banco' }) };
}

describe('subir.html enseña las cuotas en la tarjeta del choque', () => {

  function choqueDeCuota() {
    const base = creditoACuotas();
    const pc = copia(base);
    cerrarCuota(pc, '2026-10-30');           // este computador cobró la cuota 1
    const cel = copia(base);
    abonar(cel, '2026-11-02', 100000);       // el celular, con su copia vieja, le abonó
    return { pc, cel };
  }

  test('el plan se lee por cuota (pagada y cuándo) y los cierres en discusión van en pesos', () => {
    const { pc, cel } = choqueDeCuota();
    const S = abrirSubir();
    S.ctx.__it = { tabla: 'creditos', id: 'c1', local: pc,
      fila: { id: 'c1', datos: cel, revision: 5, actualizado_por: 'celular', actualizado_en: '2026-11-02T15:00:00Z' } };
    const t = plano(S.ev("tarjetaChoque(__it, 'b0')"));
    assert.match(t, /planPagos 1 de 2 pagadas: cuota 1 pagada el 30 oct 2026 · cuota 2 pendiente: 15 nov 2026 \(20%\) \$390\.000/);
    assert.match(t, /planPagos 0 de 2 pagadas: cuota 1 pendiente: 30 oct 2026 \(20%\) \$455\.000 · cuota 2 pendiente/);
    assert.match(t, /lo que entró por las cuotas Cuota 1: cierre 30 oct 2026 \$455\.000/);
    assert.match(t, /lo que entró por las cuotas Cuota 1: abono 2 nov 2026 \$100\.000/);
    assert.ok(!/\[object Object\]/.test(t));
  });

  test('la tarjeta de un choque de subida también los enseña', () => {
    const { pc, cel } = choqueDeCuota();
    const S = abrirSubir();
    S.ctx.__pc = pc;
    S.ev("E.unidades = [{ tabla: 'creditos', fila: { id: 'c1', datos: __pc } }]");
    S.ctx.__c = { tabla: 'creditos', id: 'c1', datos_servidor: cel, revision_servidor: 6,
                  actualizado_por: 'celular', actualizado_en: '2026-11-02T15:00:00Z' };
    const t = plano(S.ev("tarjetaChoqueSubida(__c, 's0')"));
    assert.match(t, /Lo que mandé .*lo que entró por las cuotas Cuota 1: cierre 30 oct 2026 \$455\.000/);
    assert.match(t, /Lo que hay en la nube .*lo que entró por las cuotas Cuota 1: abono 2 nov 2026 \$100\.000/);
  });

  test('un crédito sin cuotas no estrena líneas nuevas en la tarjeta', () => {
    const S = abrirSubir();
    const c = { id: 'q1', socioId: 's1', numero: 3, capital: 200000, pagado: false, cicloActual: '2026-10-31',
                prorrogas: [], abonosCapital: [], comprobantes: [] };
    S.ctx.__it = { tabla: 'creditos', id: 'q1', local: Object.assign({}, c, { pagado: true }),
      fila: { id: 'q1', datos: c, revision: 2, actualizado_por: 'celular', actualizado_en: '2026-10-31T15:00:00Z' } };
    const t = plano(S.ev("tarjetaChoque(__it, 'b0')"));
    assert.ok(!/cierres y abonos de la cuota|lo que entró por las cuotas/.test(t));
    assert.match(t, /planPagos — /);
  });
});

/* ========================================================================
   17-oct-2026, segunda revisión — un caso por cada punto que encontró la
   segunda revisión adversaria en estas pantallas (ver la cabecera).
   ======================================================================== */
/* 900.000 en tres cuotas de 300.000 al 20% (30-oct, 15-nov, 30-nov): el caso
   de la cuota del MEDIO que todavía no empieza. */
function creditoDe900() {
  const plan = M.construirPlanACuotas(900000,
    ['2026-10-30', '2026-11-15', '2026-11-30'].map(f => ({ fecha: f, pct: 20 })), { fechaDesembolso: '2026-10-16' });
  return {
    id: 'c3', numero: 92, socioId: 's1', socioNombre: 'Clienta Cuotas', capital: 900000, costoPct: 20,
    fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', prorrogas: [], abonosCapital: [],
    comprobantes: [], pagado: false, planPagos: P.planPagosDeAlta(plan)
  };
}
/* El choque de siempre: un aparato cobró la cuota 1 el 30-oct y el otro, con
   su copia vieja, le abonó 100.000 el 2-nov. */
function choqueCobroContraAbono() {
  const base = creditoACuotas();
  const cobro = copia(base);
  cerrarCuota(cobro, '2026-10-30');
  const abono = copia(base);
  abonar(abono, '2026-11-02', 100000);
  return { base, cobro, abono };
}
const conHoja = e => e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");

describe('segunda revisión del 17-oct: el celular de Joan', () => {

  test('1 · el 20-nov sin pagar nada: la cola, la tanda y el WhatsApp de mora dicen 929.500 y nombran la cuota 2', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-11-20T10:30:00' });
    e.ev("DB.plantillas = { moraTemprana: 'Hola {nombre}, tu pago de {saldo} está vencido.', "
      + "mora: 'Hola {nombre}, tu pago de {saldo} sigue pendiente.' }");
    const cola = plano(e.ev('vistaHoy()'));
    assert.match(cola, /La cola de hoy \$929\.500/);
    assert.ok(!/La cola de hoy \$523\.250/.test(cola), 'la cola sumó solo la cuota 1');
    assert.match(cola, /Todo lo vencido hoy \$929\.500/);
    assert.match(cola, /cuota 1 de 2 \$523\.250 \+ cuota 2 vencida \$406\.250/);
    /* El WhatsApp, suelto o en tanda, pasa por textoPlantilla. */
    ['moraTemprana', 'mora'].forEach(k => {
      const txt = e.ev("textoPlantilla(DB.prestamos[0], DB.socios[0], '" + k + "')");
      assert.match(txt, /tu pago de \$929\.500/, k + ' le calló la cuota 2 a la cliente');
    });
    const casos = e.json("casosDelGrupo('mora').map(function (c) { return c.plantilla; })");
    assert.deepEqual(casos, ['mora']);
    const tarjeta = plano(e.ev("tarjetaDeTanda(casosDelGrupo('mora')[0], { grupo: { clave: 'mora' } }, { puedes: 1 })"));
    assert.match(tarjeta, /Debe hoy \$929\.500/);
    assert.match(tarjeta, /\+ cuota 2 vencida \$406\.250/);
    assert.match(tarjeta, /tu pago de \$929\.500 sigue pendiente/);
    /* Y es la cifra del puente, la misma del computador. */
    assert.equal(P.aPagarHoy(creditoACuotas(), '2026-11-20'), 929500);
  });

  test('1 · con una sola cuota vencida el mensaje de mora sigue siendo esa cuota (458.250 el 31-oct)', () => {
    const e = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-10-31T10:30:00' });
    e.ev("DB.plantillas = { moraTemprana: 'Tu pago de {saldo} está vencido.' }");
    assert.match(e.ev("textoPlantilla(DB.prestamos[0], DB.socios[0], 'moraTemprana')"), /\$458\.250/);
    const cola = plano(e.ev('vistaHoy()'));
    assert.ok(!/Todo lo vencido hoy|vencida \$/.test(cola), 'nombró una cuota vencida que no hay');
    assert.match(cola, /La cola de hoy \$458\.250/);
  });

  test('2 · con abonos, el costo dice «pactado al 20%» y el recargo lo que falta, sin el % diario', () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);   // 19.500 al recargo + 80.500 al costo
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-10T10:30:00' });
    e.ev("SEL.creditoId = 'c1'");
    const pantallas = { credito: plano(e.ev('vistaCredito()')), cola: plano(e.ev('vistaHoy()')) };
    conHoja(e);
    e.tocar('cobro', { id: 'c1' });
    pantallas.hoja = plano(e.elems.pgCalc.innerHTML);
    Object.keys(pantallas).forEach(k => {
      const t = pantallas[k];
      assert.match(t, /Lo que falta del recargo \(11 día\(s\) de atraso · ya abonó \$19\.500\) \$16\.250/, k);
      assert.ok(!/diario/.test(t), k + ': «1% diario» al lado de una cifra que no es N × 1%');
    });
    assert.match(pantallas.credito, /Lo que falta del costo de la cuota \(pactado al 20%\) \$49\.500/);
    assert.match(pantallas.hoja, /Lo que falta del costo de la cuota \(pactado al 20%\) \$49\.500/);
    /* Sin abonos, el rótulo de siempre, con el % diario que sí explica la cifra. */
    const e2 = abrirEspejo({ cartera: cartera([creditoACuotas()]), ahora: '2026-11-05T10:30:00' });
    e2.ev("SEL.creditoId = 'c1'");
    const t2 = plano(e2.ev('vistaCredito()'));
    assert.match(t2, /Recargo por 6 día\(s\) · 1% diario \$19\.500/);
    assert.match(t2, /Costo de la cuota \(20%\) \$130\.000/);
  });

  test('3 · el tablero pone el capital en la quincena que contiene la fecha de la cuota', () => {
    const quincenal = { id: 'q1', numero: 3, socioId: 's1', socioNombre: 'Clienta Cuotas', capital: 200000,
      costoPct: 20, fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31', prorrogas: [], abonosCapital: [],
      comprobantes: [], pagado: false };
    const e = abrirEspejo({ cartera: cartera([creditoACuotas(), quincenal]), ahora: '2026-10-16T10:30:00' });
    /* La cuota del 30-oct es de la quincena del 31-oct: antes, «30-oct < 31-oct»
       la sacaba y el tablero decía 200.000 en la calle en vez de 850.000. */
    assert.equal(e.ev("invertidoEnQuincena('2026-10-31')"), 850000);
    assert.match(plano(e.ev('vistaQuincena()')), /Invertido en el ciclo \$850\.000/);
    /* Pagada la cuota 1, la 2 (15-nov, domingo; 16 festivo) es de la quincena
       del 17-nov, y ahí está lo que falta de capital. El quincenal no cambia. */
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-30');
    const e2 = abrirEspejo({ cartera: cartera([p, quincenal]), ahora: '2026-10-30T10:30:00' });
    assert.equal(e2.ev("invertidoEnQuincena('2026-11-17')"), 325000);
    assert.deepEqual(e2.json("creditosQueVencenEn('2026-11-17').map(function (x) { return x.id; })"), ['c1']);
    assert.equal(e2.json("creditosQueVencenEn('2026-11-15').length"), 0);
    assert.equal(e2.ev("invertidoEnQuincena('2026-10-31')"), 325000 + 200000);
  });

  test('4 · un cobro con fecha anterior al cierre de OTRA cuota se rechaza con el texto del puente', () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-11-02');
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-03T10:30:00' });
    e.ev("cobrar('c1', '2026-10-29')");
    assert.match(e.avisos.pop(),
      /Este crédito ya tiene un pago anotado el 2 de noviembre de 2026: el cobro de la cuota 2 no puede ir con una fecha anterior/);
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.planPagos.cuotas[1].pagado, false);
    assert.equal(q.pagado, false);
    assert.equal(q.abonosCapital.length, 1);
    /* La hoja con esa fecha lo dice ahí mismo y no ofrece el botón. */
    conHoja(e);
    e.tocar('cobro', { id: 'c1' });
    e.elems.pgFecha.value = '2026-10-29';
    e.ev("calcCobro('c1')");
    const hoja = plano(e.elems.pgCalc.innerHTML);
    assert.match(hoja, /Esta cuota no se puede cobrar con esa fecha\. Este crédito ya tiene un pago anotado el 2 de noviembre de 2026/);
    assert.ok(!/Pagó la cuota 2/.test(hoja), 'ofreció un botón que el puente niega');
  });

  test('4 · el cierre que escribe el celular lleva lo que entró ese día (recibido), igual que el puente', () => {
    const p = creditoACuotas();
    const esperado = copia(p);
    const r = cerrarCuota(esperado, '2026-11-02');
    assert.equal(r.registros.abono.recibido, 464750);
    const e = abrirEspejo({ cartera: cartera([p]), ahora: '2026-11-02T10:30:00' });
    e.ev("cobrar('c1', '2026-11-02')");
    assert.deepEqual(e.json('DB.prestamos[0].abonosCapital'), esperado.abonosCapital);
  });

  test('7 · el choque avisa, antes de tocar un botón, que los pagos de las cuotas no se juntan', () => {
    const { base, cobro, abono } = choqueCobroContraAbono();
    const e = abrirEspejo({ cartera: cartera([base]), ahora: '2026-11-03T10:30:00' });
    e.ev('CHOQUES = [' + JSON.stringify({ tabla: 'creditos', id: 'c1', mio: cobro, suyo: abono,
      actualizado_por: 'computador' }) + ']');
    const t = plano(e.ev('bloqueChoques()'));
    assert.match(t, /Los pagos de las cuotas no se juntan\. Con Mandar lo mío encima quedan solo los de este celular \(Cuota 1: cierre 30 de oct de 2026 \$455\.000\) y lo que trae la nube para esas cuotas \(Cuota 1: abono 02 de nov de 2026 \$100\.000\) no entra/);
    assert.match(t, /Con Dejar lo de la nube es al revés/);
    assert.match(t, /Si la plata del lado que no queda entró de verdad, se vuelve a anotar después como abono a la cuota/);
    assert.ok(!/no se pierde nada|se juntan/.test(t.replace('no se juntan', '')), 'prometió que se juntan');
    /* Y lo que dice es lo que hace «Mandar lo mío encima»: solo los pagos de
       cuotas de este celular. */
    const fila = NUBE.fusionarFila(cobro, abono).fila;
    assert.deepEqual(fila.abonosCapital.filter(a => a.cuotaPlan != null), cobro.abonosCapital);
    /* Sin cuotas de por medio no hay aviso. */
    const sin = creditoDeRescate();
    e.ev('CHOQUES = [' + JSON.stringify({ tabla: 'creditos', id: 'c2', mio: Object.assign({}, sin, { pagado: true }),
      suyo: sin }) + ']');
    assert.ok(!/pagos de las cuotas/.test(plano(e.ev('bloqueChoques()'))));
  });

  test('8 · el resumen del plan en el choque deja ver una reprogramación', () => {
    const base = creditoACuotas();
    const reprog = copia(base);
    const r = P.reprogramarPlan(reprog, [{ n: 2, fecha: '2026-11-20', pct: 25 }], '2026-10-17');
    assert.equal(r.ok, true, r.detalle);
    reprog.planPagos = r.planPagos;
    const e = abrirEspejo({ cartera: cartera([base]), ahora: '2026-10-17T10:30:00' });
    e.ev('var __c=' + JSON.stringify({ mio: base, suyo: reprog }));
    const t = plano(e.ev('ladosHTML(__c)'));
    assert.match(t, /cuota 2 pendiente: 15 de nov de 2026 \(20%\) \$390\.000/);
    assert.match(t, /cuota 2 pendiente: 20 de nov de 2026 \(25%\) \$406\.250 · último cambio \(17 de oct de 2026\): cuota 2 del 15 de nov de 2026 al 20 de nov de 2026, 20% → 25%/);
  });
});

describe('segunda revisión del 17-oct: la app del cliente', () => {

  test('5 · una cuota del MEDIO sin empezar no promete «pagando el 15 nov o antes»: dice desde cuándo se paga', async () => {
    const p = creditoDe900();
    cerrarCuota(p, '2026-10-20');
    const { A, inicio, paquete } = await appDelCliente([p], '2026-10-25');
    assert.equal(paquete.creditos[0].cuota_empieza, '2026-10-31');
    assert.equal(paquete.creditos[0].cuota_es_la_ultima, false);
    const frase = /Esta cuota se paga desde el 31 oct 2026 hasta el 15 nov 2026: pagándola en esos días no pagas recargo y tu cupo sube \$96\.000\. Si quieres adelantar antes, escríbenos: lo que abones va a capital y baja su costo\./;
    const t = inicio();
    assert.ok(!/o antes, tu cupo sube/.test(t), 'prometió cerrar antes una cuota que el puente no deja cerrar');
    assert.match(t, frase);
    const ics = icsPlano(A.ev('armarICS(S.activo)'));
    assert.ok(!/Pagando en fecha tu cupo sube/.test(ics));
    assert.match(ics, frase);
    /* Y el puente lo niega de verdad: el 26-oct la cuota 2 no se cierra. */
    assert.equal(P.cierreDeCuota(copia(p), '2026-10-26').motivo, 'no_ha_empezado');
    [t, ics].forEach(x => assert.equal(x.match(/.{0,40}\d\s?%.{0,20}/), null, 'le mostró un porcentaje'));
  });

  test('5 · el mismo paquete abierto el 31-oct, ya empezada la quincena, vuelve a la frase de siempre', async () => {
    const p = creditoDe900();
    cerrarCuota(p, '2026-10-20');
    const t = (await appDelCliente([p], '2026-10-25', '2026-10-31')).inicio();
    assert.match(t, /Pagando el 15 nov 2026 o antes, tu cupo sube \$96\.000/);
    assert.ok(!/Esta cuota se paga desde/.test(t));
  });

  test('5 · la ÚLTIMA cuota antes de su quincena se queda con su texto (pagarla antes es pagar todo)', async () => {
    const p = creditoACuotas();
    cerrarCuota(p, '2026-10-20');
    const { paquete, inicio } = await appDelCliente([p], '2026-10-25');
    assert.equal(paquete.creditos[0].cuota_es_la_ultima, true);
    const t = inicio();
    assert.ok(!/Esta cuota se paga desde/.test(t));
    assert.match(t, /Es tu última cuota: pagarla antes es pagar todo el crédito/);
  });

  test('6 · Inicio no dice «ya trae el recargo» si el recargo está en cero, y con abonos dice lo que falta', async () => {
    const p = creditoACuotas();
    abonar(p, '2026-11-05', 100000);   // el abono de ese día pagó los 19.500 de recargo
    const t = (await appDelCliente([p], '2026-11-05')).inicio();
    assert.ok(!/Ya trae adentro el recargo/.test(t), 'dijo que traía un recargo que es cero');
    assert.match(t, /que vencía el 30 oct 2026\. Hoy no trae recargo pendiente\./);
    const t2 = (await appDelCliente([p], '2026-11-10')).inicio();
    assert.match(t2, /que vencía el 30 oct 2026\. Ya trae adentro lo que falta del recargo: \$16\.250 \(11 días de atraso\)\./);
    /* Sin abonos, la frase de siempre (y en singular con un día). */
    assert.match((await appDelCliente([creditoACuotas()], '2026-11-05')).inicio(),
      /Ya trae adentro el recargo de los 6 días\./);
    assert.match((await appDelCliente([creditoACuotas()], '2026-10-31')).inicio(),
      /Ya trae adentro el recargo de un día\./);
  });
});

describe('segunda revisión del 17-oct: subir.html', () => {

  test('7 · con pagos de cuotas en discusión, ninguna elección dice que «los abonos se juntan»', () => {
    const { cobro, abono } = choqueCobroContraAbono();
    const S = abrirSubir();
    S.ctx.__it = { tabla: 'creditos', id: 'c1', local: cobro,
      fila: { id: 'c1', datos: abono, revision: 5, actualizado_por: 'celular', actualizado_en: '2026-11-02T15:00:00Z' } };
    const mio = S.ev('queHaceLoMio(__it)');
    assert.ok(!/abonos de los dos lados se juntan/.test(mio));
    assert.match(mio, /Los pagos de las cuotas NO se juntan: quedan solo los de este computador \(Cuota 1: cierre 30 oct 2026 \$455\.000\) y lo que trae la nube para esas cuotas \(Cuota 1: abono 2 nov 2026 \$100\.000\) no entra\. Si esa plata entró de verdad, vuelve a anotarla como abono a la cuota después/);
    S.ev("E.decisiones[llaveDe('creditos', __it.fila)] = 'nube'");
    const nube = plano(S.ev("tarjetaChoque(__it, 'b0')"));
    assert.ok(!/abonos de los dos lados se juntan/.test(nube));
    assert.match(nube, /Elegiste lo de la nube\. .*Los pagos de las cuotas NO se juntan: quedan los de la nube \(Cuota 1: abono 2 nov 2026 \$100\.000\) y lo que trae este computador para esas cuotas \(Cuota 1: cierre 30 oct 2026 \$455\.000\) no entra/);
    /* Y lo que dicen es lo que hacen las dos fusiones de esta página. */
    const conLoMio = JSON.parse(S.ev("JSON.stringify(loMioEncima('creditos', __it.fila.datos, __it.local))"));
    assert.deepEqual(conLoMio.abonosCapital.filter(a => a.cuotaPlan != null), cobro.abonosCapital);
    const conLaNube = JSON.parse(S.ev("JSON.stringify(fusionarConLoMio('creditos', __it.fila.datos, __it.local))"));
    assert.deepEqual(conLaNube.abonosCapital.filter(a => a.cuotaPlan != null), abono.abonosCapital);
  });

  test('7 · sin ese pisable, las elecciones siguen diciendo que las listas se juntan', () => {
    const S = abrirSubir();
    const c = { id: 'q1', socioId: 's1', numero: 3, capital: 200000, pagado: false, cicloActual: '2026-10-31',
                prorrogas: [], abonosCapital: [], comprobantes: [] };
    S.ctx.__it = { tabla: 'creditos', id: 'q1', local: Object.assign({}, c, { pagado: true }),
      fila: { id: 'q1', datos: c, revision: 2, actualizado_por: 'celular', actualizado_en: '2026-10-31T15:00:00Z' } };
    assert.match(S.ev('queHaceLoMio(__it)'), /prórrogas y abonos de los dos lados se juntan/);
    S.ev("E.decisiones[llaveDe('creditos', __it.fila)] = 'nube'");
    assert.match(plano(S.ev("tarjetaChoque(__it, 'b0')")), /Elegiste lo de la nube\. Al aplicar, las gestiones, comprobantes, prórrogas y abonos de los dos lados se juntan\./);
  });

  test('8 · el resumen del plan trae fecha, % y total de cada pendiente y el último cambio', () => {
    const base = creditoACuotas();
    const reprog = copia(base);
    const r = P.reprogramarPlan(reprog, [{ n: 2, fecha: '2026-11-20', pct: 25 }], '2026-10-17');
    assert.equal(r.ok, true, r.detalle);
    reprog.planPagos = r.planPagos;
    const S = abrirSubir();
    S.ctx.__it = { tabla: 'creditos', id: 'c1', local: reprog,
      fila: { id: 'c1', datos: base, revision: 3, actualizado_por: 'celular', actualizado_en: '2026-10-17T15:00:00Z' } };
    const t = plano(S.ev("tarjetaChoque(__it, 'b0')"));
    assert.match(t, /Lo de este computador .*cuota 2 pendiente: 20 nov 2026 \(25%\) \$406\.250 · último cambio \(17 oct 2026\): cuota 2 15 nov 2026 → 20 nov 2026, 20% → 25%/);
    assert.match(t, /Lo de la nube .*cuota 2 pendiente: 15 nov 2026 \(20%\) \$390\.000/);
  });
});
