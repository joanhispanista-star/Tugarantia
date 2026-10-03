'use strict';
/* ============================================================================
 * «💵 ABONÓ Y EL RESTO PASA A LA PRÓXIMA QUINCENA» EN EL COMPUTADOR
 * 3 de octubre de 2026
 *
 *   node --test pruebas/abono-con-prorroga-pantalla.test.js
 *
 * Joan, con una cliente real delante: «hizo un abono de 200.000 y el resto de
 * la deuda se financia para la siguiente quincena, pero el CRM no tiene la
 * función de abonos… quiero que yo tenga la posibilidad de hacerlo manual».
 *
 * La REGLA ya está probada en abono-con-prorroga.test.js (el puente). Estas
 * pruebas arrancan crm.html de verdad en el banco y cuidan lo que la regla no
 * puede cuidar sola:
 *
 *   1. QUE SE ENCUENTRE. El botón está en la hoja de cobro al lado de «Pagó
 *      todo» y de la prórroga, y a esa hoja se llega desde Cobranzas, desde
 *      «Todavía no les toca» y desde la ficha. Una función que no se encuentra
 *      no existe (la lección del 21-sep con el descuento de la prórroga).
 *   2. QUE LA HOJA DIGA LA VERDAD antes de confirmar: el desglose del caso real
 *      (8.000 + 80.000 + 112.000 → 288.000, 345.600 el 15-oct) y un botón que
 *      solo se deja apretar cuando el puente dice que sí.
 *   3. QUE SEA ATÓMICO: un solo guardar(), con los registros del puente tal
 *      cual; si Joan dice que no, o si el puente dice que no, nada.
 *   4. QUE EL RECIBO DIGA las tres cifras: abonó X, queda debiendo Y, próximo
 *      pago Z el <fecha>.
 *   5. QUE «QUEDA DEBIENDO» DIGA que la fecha NO se mueve, para que Joan
 *      escoja el camino que es.
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/motor.js');
const P = require('../app/puente.js');
const { abrirPanel } = require('./banco-panel.js');

const DIA = '2026-10-03';          // el día en que pagó (sábado, dentro del horario legal)
const CORTE = '2026-10-01';        // el corte que venció
const NUEVO = '2026-10-15';        // la quincena siguiente, según el motor

/* El crédito del caso real, sin nombres (el mismo de abono-con-prorroga.test.js). */
function credito(extra) {
  return Object.assign({
    id: 'c1', numero: 81, socioId: 's1', socioNombre: 'Cliente de prueba',
    capital: 400000, costoPct: 20, fechaDesembolso: '2026-09-19', cicloActual: CORTE,
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
  }, extra || {});
}
function cartera(ps) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Cliente de prueba', telefono: '3001112233',
               whatsappIgual: true, cedula: '52111222', gestiones: [] }],
    prestamos: ps, config: { negocio: 'Tu Garantía' }
  };
}
/* Lo que el puente diría con la cartera tal como está ANTES de registrar. */
function delPuente(p, monto, o) {
  const c = JSON.parse(JSON.stringify(p));
  return P.abonoConProrroga(cartera([c]), c, DIA, monto, o);
}

/* El CRM de verdad, con la hora congelada el día del pago. Se anotan los
   confirm (para leer lo que Joan ve) y se cuentan los guardar(): un solo
   guardar es lo que hace que sean los dos registros o ninguno. Por defecto
   dice sí a todo menos a abrir WhatsApp. */
function panelCon(ps, o) {
  const B = abrirPanel({ ahora: DIA + 'T10:00:00' });
  B.cargarCartera(cartera(ps));
  B.ev('window._conf=[];window._guardados=0;window._siWhatsApp=' + (o && o.whatsapp ? 'true' : 'false') + ';' +
       'window._noRegistro=' + (o && o.noRegistro ? 'true' : 'false') + ';' +
       "confirm=function(t){t=String(t);_conf.push(t);" +
       "if(t.indexOf('WhatsApp')>=0)return _siWhatsApp;" +
       "if(t.indexOf('¿Lo registro?')>=0)return !_noRegistro;return true};" +
       '(function(){var g=guardar;guardar=function(){_guardados++;return g.apply(this,arguments)}})()');
  return B;
}
const html = (B, id) => String((B.elems[id] && B.elems[id].innerHTML) || '').replace(/\s+/g, ' ');
const boton = B => ({ txt: B.elems.pgBtn.textContent, listo: !B.elems.pgBtn.disabled });
const fecha = (B, iso) => B.ev("fmtFecha('" + iso + "')");
const leer = B => JSON.parse(B.ev('JSON.stringify(DB)'));
const avisos = B => (B.ctx._avisos || []).join(' | ');

/* Abre la hoja de cobro, entra al modo nuevo y teclea la plata. */
function abono(B, id, monto, dia) {
  B.ev("abrirPago('" + id + "')");
  B.elems.pgFecha.value = dia || DIA;
  B.ev("calcPago('" + id + "')");
  B.ev("modoAbonoProrroga('" + id + "')");
  if (monto != null) {
    B.elems.pgMonto.value = String(monto);
    B.ev("cambioMonto('" + id + "')");
  }
}

/* ========================================================================== */
describe('el botón está en la hoja de cobro, al lado de «Pagó todo» y de la prórroga', () => {

  test('siempre a la vista, con su nombre entero', () => {
    const B = panelCon([credito()]);
    B.ev("abrirPago('c1')");
    const acc = html(B, 'pgAccion');
    assert.match(acc, /✓ Pagó todo/);
    assert.match(acc, /↻ Prórroga/);
    assert.match(acc, /modoAbonoProrroga\('c1'\)/);
    assert.match(acc, /💵 Abonó y el resto pasa a la próxima quincena/);
  });

  test('también cuando no se puede (sin prórrogas o en plan): adentro dice por qué', () => {
    const agotado = credito({ id: 'c3', fechaDesembolso: '2026-08-18', prorrogas: [
      { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: '2026-09-15' },
      { fecha: '2026-09-15', ciclo: '2026-09-15', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: CORTE }] });
    const B = panelCon([agotado]);
    B.ev("abrirPago('c3')");
    assert.match(html(B, 'pgAccion'), /💵 Abonó y el resto pasa a la próxima quincena/,
      'el botón desaparecía en silencio: es el defecto del 18-sep con la prórroga');
  });

  test('arranca VACÍO: la plata la teclea Joan, no se adivina', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', null);
    assert.equal(B.elems.pgMonto.value, '');
    assert.deepEqual(boton(B), { txt: 'Escribe cuánto pagó', listo: false });
    // Pero ya dice cuánto cuesta la prórroga y desde cuánto salda todo.
    assert.match(html(B, 'pgCalc'), /La prórroga cuesta/);
    assert.match(html(B, 'pgCalc'), /\$88\.000/);
    assert.match(html(B, 'pgDif'), /\$88\.000.*\$488\.000/);
  });
});

/* ========================================================================== */
describe('el caso real: 200.000 sobre 400.000 vencido el 1-oct, pagado el 3-oct', () => {

  test('el desglose antes de confirmar: mora, costo, capital, la fecha y lo que pagará', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    const h = html(B, 'pgCalc');
    assert.match(h, /Entregó.*\$200\.000/);
    assert.match(h, /1\. Recargo por 2 día\(s\) de mora.*\$8\.000/);
    assert.match(h, /2\. Costo del ciclo \(20%\).*\$80\.000/);
    assert.match(h, /3\. A capital.*\$112\.000/);
    assert.match(h, /Capital que queda.*\$400\.000 → <b>\$288\.000/);
    assert.ok(h.includes('Nueva fecha de pago</span><span class="v"><b>' + fecha(B, NUEVO)),
      'la fecha nueva no es la del motor');
    assert.match(h, /si paga a tiempo.*\$288\.000 \+ \$57\.600 de costo.*\$345\.600/);
    assert.match(h, /Garantía que le deja.*el abono es capital y no deja garantía.*\$67\.000/);
    assert.match(h, /Prórroga<\/span><span class="v">1 de 2/);
    // El 80/20 es el de la prórroga; el abono no es ganancia ni garantía.
    assert.match(h, /De los \$88\.000 de la prórroga: <b>\$67\.000<\/b> se le vuelven garantía/);
    assert.match(h, /<b>\$21\.000<\/b> son tuyos/);
    assert.match(h, /Los \$112\.000 del abono son capital que vuelve/);
  });

  test('el botón dice exactamente lo que va a registrar', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    assert.deepEqual(boton(B), { listo: true,
      txt: '💵 Registrar $200.000: $112.000 a capital y pasa al ' + fecha(B, NUEVO) });
    assert.equal(html(B, 'pgDif'), '<div class="alerta info">' + delPuente(credito(), 200000).detalle + '</div>');
  });

  test('registrar: UN guardar, los registros del puente tal cual y el corte movido', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.ev("registrarCobro('c1')");
    assert.equal(avisos(B), '', 'el CRM se quejó');
    assert.equal(B.ev('_guardados'), 1, 'dos guardar() son dos momentos: uno puede quedar sin el otro');
    const r = delPuente(credito(), 200000);
    const q = leer(B).prestamos[0];
    assert.deepEqual(q.abonosCapital, [r.registros.abono]);
    assert.deepEqual(q.prorrogas, [r.registros.prorroga]);
    assert.equal(q.cicloActual, NUEVO);
    assert.equal((q.condonaciones || []).length, 0);
    assert.equal(q.pagado, false, 'un abono + prórroga no cierra el crédito');
    // Y lo que queda escrito cobra lo que la hoja prometió.
    assert.equal(P.capitalActual(q), 288000);
    assert.equal(P.liquidarCiclo(q, NUEVO).total_a_pagar, 345600);
  });

  test('lo que Joan confirma lleva el desglose entero, y después las tres cifras del recibo', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.ev("registrarCobro('c1')");
    const [registro, whatsapp] = B.ev('_conf');
    assert.match(registro, /Registrar lo que entregó Cliente de prueba: \$200\.000/);
    assert.match(registro, /Recargo por 2 día\(s\) de mora: \$8\.000/);
    assert.match(registro, /Costo del ciclo: \$80\.000/);
    assert.match(registro, /A capital: \$112\.000/);
    assert.match(registro, /baja de \$400\.000 a \$288\.000/);
    assert.match(registro, /son \$345\.600 \(\$288\.000 \+ \$57\.600 de costo\)/);
    assert.match(registro, /El abono es capital y no deja garantía/);
    assert.match(registro, /prórroga 1 de 2/);
    assert.equal(whatsapp, 'Listo: abonó $200.000, queda debiendo $288.000 de capital y paga $345.600 el ' +
      fecha(B, NUEVO) + '.\n\n¿Mandarle el recibo por WhatsApp?');
  });

  test('el recibo por WhatsApp: abonó X, queda debiendo Y, próximo pago Z el <fecha>', () => {
    const B = panelCon([credito()], { whatsapp: true });
    abono(B, 'c1', 200000);
    B.ev("registrarCobro('c1')");
    const cuerpo = html(B, 'mBody');
    const txt = (cuerpo.match(/<div class="preview" id="gPrev">([^<]*)<\/div>/) || [])[1];
    assert.ok(txt, 'no se abrió la hoja de gestión con el recibo');
    assert.equal(txt, 'Listo Cliente, recibimos tu abono de $200.000 🙂 Lo demás pasa a la siguiente ' +
      'quincena: de capital quedas debiendo $288.000 y tu próximo pago es de $345.600 el ' +
      fecha(B, NUEVO) + '. Gracias por cumplirnos; cualquier cosa nos cuentas.');
    // Va con su plantilla elegida y, al abrir WhatsApp, queda la gestión como en todo cobro.
    assert.match(cuerpo, /<option value="abonoProrroga" selected>/);
    assert.match(cuerpo, /onclick="marcarGestion\('c1','abonoProrroga'\)"/);
  });

  test('una foto del comprobante es UNA transferencia: la de todo lo que entregó', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.ev("_compTmp='data:image/jpeg;base64,AAAA'");
    B.ev("registrarCobro('c1')");
    const q = leer(B).prestamos[0];
    assert.equal(q.comprobantes.length, 1);
    assert.deepEqual([q.comprobantes[0].tipo, q.comprobantes[0].monto], ['abonoProrroga', 200000]);
  });

  test('si Joan dice que no en el confirm, no se escribe nada', () => {
    const B = panelCon([credito()], { noRegistro: true });
    abono(B, 'c1', 200000);
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 0);
    const q = leer(B).prestamos[0];
    assert.deepEqual([q.abonosCapital.length, q.prorrogas.length, q.cicloActual], [0, 0, CORTE]);
  });

  test('el doble clic no registra dos veces: el puente lo para y la hoja lo dice', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.ev("registrarCobro('c1')");
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 1);
    const q = leer(B).prestamos[0];
    assert.deepEqual([q.abonosCapital.length, q.prorrogas.length], [1, 1]);
    assert.match(avisos(B), /Ya tiene una prórroga registrada ese día/);
    assert.match(avisos(B), /No registré nada/);
  });
});

/* ========================================================================== */
describe('perdonar parte de la mora: el % de siempre, con su motivo', () => {

  test('sin motivo no se deja; con motivo queda la condonación del puente', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.elems.pgDescPct.value = '50';
    B.ev("calcPago('c1')");
    assert.deepEqual(boton(B), { txt: 'Falta el motivo del descuento', listo: false });
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 0, 'registró un descuento sin motivo');

    B.elems.pgDescMotivo.value = 'se le inundó la casa';
    B.ev("calcPago('c1')");
    assert.equal(boton(B).listo, true);
    assert.match(html(B, 'pgCalc'), /Descuento de la mora \(50%\).*− \$4\.000/);
    assert.match(html(B, 'pgCalc'), /3\. A capital.*\$116\.000/);
    B.ev("registrarCobro('c1')");
    const r = delPuente(credito(), 200000, { condonaMora: 4000, motivo: 'se le inundó la casa' });
    const q = leer(B).prestamos[0];
    assert.deepEqual(q.condonaciones, [r.registros.condonacion]);
    assert.deepEqual(q.abonosCapital, [r.registros.abono]);
    assert.deepEqual(q.prorrogas, [r.registros.prorroga]);
    assert.equal(B.ev('_guardados'), 1);
  });
});

/* ========================================================================== */
describe('cuando no se puede, lo dice y ofrece los caminos que YA existen', () => {

  test('muy poca plata: dice cuánto cuesta la prórroga, y nada se registra', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 50000);
    assert.deepEqual(boton(B), { txt: 'No alcanza: la prórroga cuesta $88.000', listo: false });
    const d = html(B, 'pgDif');
    assert.match(d, /Con \$50\.000 no alcanza la prórroga: cuesta \$88\.000/);
    assert.match(d, /irAProrrogaCon\('c1',50000\)/, 'falta la prórroga con descuento');
    assert.match(d, /pactarAcuerdo\('c1'\)/, 'falta el acuerdo');
    assert.match(d, /irAlCobroCon\('c1',50000,'debe'\)/, 'falta «queda debiendo»');
    B.ev("registrarCobro('c1')");
    assert.equal(B.ev('_guardados'), 0);
    assert.match(avisos(B), /No registré nada/);
  });

  test('cada camino lleva a su pantalla de siempre, con la plata que Joan escribió', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 50000);
    B.ev("irAProrrogaCon('c1',50000)");
    assert.deepEqual(JSON.parse(B.ev('JSON.stringify([_cobro.tipo,_cobro.monto])')), ['prorroga', 50000]);
    assert.match(html(B, 'pgDif'), /Faltan \$38\.000: se le perdonan/);

    abono(B, 'c1', 50000);
    B.ev("irAlCobroCon('c1',50000,'debe')");
    assert.deepEqual(JSON.parse(B.ev('JSON.stringify([_cobro.tipo,_cobro.modo,_cobro.monto])')), ['cobro', 'debe', 50000]);
    assert.equal(boton(B).txt, '↓ Abonar $50.000 a capital (sigue debiendo, misma fecha)');
  });

  test('plata de más: eso es «Pagó todo», no una prórroga', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 500000);
    assert.deepEqual(boton(B), { txt: 'Con $500.000 salda todo: es «Pagó todo»', listo: false });
    assert.match(html(B, 'pgDif'), /salda el crédito entero/);
    assert.match(html(B, 'pgDif'), /irAlCobroCon\('c1',500000,null\)/);
  });

  test('sin prórrogas en su nivel: dice por qué y lleva al plan de pagos', () => {
    const agotado = credito({ id: 'c3', fechaDesembolso: '2026-08-18', prorrogas: [
      { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: '2026-09-15' },
      { fecha: '2026-09-15', ciclo: '2026-09-15', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: CORTE }] });
    const B = panelCon([agotado]);
    abono(B, 'c3', null);
    assert.deepEqual(boton(B), { txt: 'Ya no le quedan prórrogas', listo: false });
    assert.match(html(B, 'pgDif'), /plan de pagos/);
    assert.match(html(B, 'pgDif'), /registrarProrroga\('c3'\)">Ver el plan de pagos/);
    assert.equal(B.elems.pgMontoBox.style.display, 'none', 'un campo que no sirve invita a teclear para nada');
  });

  test('en plan de pagos: lo dice y vuelve a la cuota', () => {
    const plan = credito({ id: 'c4', planPagos: { tasa_por_corte: 0.05, cuotas: [
      { n: 1, fecha: '2026-10-15', capital: 133334, costo: 20000, pagado: false },
      { n: 2, fecha: '2026-10-30', capital: 133333, costo: 13333, pagado: false },
      { n: 3, fecha: '2026-11-17', capital: 133333, costo: 6667, pagado: false }] } });
    const B = panelCon([plan]);
    abono(B, 'c4', null);
    assert.deepEqual(boton(B), { txt: 'Está en plan de pagos: no se prorroga', listo: false });
    assert.match(html(B, 'pgDif'), /volverAlCobro\('c4'\)">← Cobrar la cuota del plan/);
    B.ev("registrarCobro('c4')");
    assert.equal(B.ev('_guardados'), 0);
  });
});

/* ========================================================================== */
describe('«Queda debiendo» y el abono nuevo ya no tienen la misma cara', () => {

  test('desde «Faltan X. ¿Qué pasó?» el abono nuevo se lleva lo que Joan escribió', () => {
    const B = panelCon([credito()]);
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.elems.pgMonto.value = '200000';
    B.ev("cambioMonto('c1')");
    const d = html(B, 'pgDif');
    assert.match(d, /Faltan \$288\.000\. ¿Qué pasó\?/);
    assert.match(d, /Queda debiendo \(misma fecha\)/);
    assert.match(d, /modoAbonoProrroga\('c1',200000\)">💵 Abonó y el resto pasa a la próxima quincena/);
    B.ev("modoAbonoProrroga('c1',200000)");
    assert.equal(B.elems.pgMonto.value, '200000');
    assert.equal(boton(B).listo, true);
  });

  test('«Queda debiendo» dice que la fecha NO se mueve, y cuál es', () => {
    const B = panelCon([credito()]);
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.elems.pgMonto.value = '200000';
    B.ev("cambioMonto('c1')");
    B.ev("modoCobro('c1','debe')");
    const d = html(B, 'pgDif');
    assert.match(d, /La fecha de pago NO se mueve:<\/b> ya venció el <b>/);
    assert.ok(d.includes(fecha(B, CORTE)), 'no dice cuál es la fecha que no se mueve');
    assert.match(d, /«💵 Abonó y el resto pasa a la próxima quincena»/);
    assert.equal(boton(B).txt, '↓ Abonar $200.000 a capital (sigue debiendo, misma fecha)');
  });
});

/* ========================================================================== */
describe('se encuentra: Cobranzas, «Todavía no les toca» y la ficha', () => {

  test('«💵 Pago» de Cobranzas abre la misma hoja, con el botón ahí', () => {
    const B = panelCon([credito()]);
    B.ev('renderCobranzas()');
    const tablas = html(B, 'tblCobranzas') + html(B, 'tblFueraCob');
    assert.match(tablas, /pagoDesdeCobro\('s1','c1',1\)/, 'el vencido no salió en Cobranzas con su «💵 Pago»');
    B.ev("pagoDesdeCobro('s1','c1',1)");
    assert.match(html(B, 'pgAccion'), /💵 Abonó y el resto pasa a la próxima quincena/);
  });

  test('«Todavía no les toca»: pagar antes y pasar a la otra quincena también vale', () => {
    /* Un crédito que vence el 15-oct y paga el 3-oct: sin mora, el costo del
       ciclo y lo demás a capital; el corte nuevo es el que diga el motor. */
    const alDia = credito({ id: 'c2', numero: 82, fechaDesembolso: '2026-10-01', cicloActual: NUEVO });
    const B = panelCon([alDia]);
    B.ev('renderCobranzas()');
    assert.match(html(B, 'tblNoToca'), /pagoDesdeCobro\('s1','c2',1,true\)/,
      'el crédito al día no salió en «Todavía no les toca»');
    B.ev("pagoDesdeCobro('s1','c2',1,true)");
    assert.match(html(B, 'pgAccion'), /modoAbonoProrroga\('c2'\)/);
    abono(B, 'c2', 150000);
    const r = delPuente(alDia, 150000);
    assert.equal(r.ok, true, r.detalle);
    assert.equal(r.corte_nuevo, M.fechaCorteProrroga(NUEVO, DIA));
    assert.deepEqual([r.mora, r.costo, r.a_capital, r.capital_despues], [0, 80000, 70000, 330000]);
    assert.doesNotMatch(html(B, 'pgCalc'), /Recargo/);
    assert.deepEqual(boton(B), { listo: true,
      txt: '💵 Registrar $150.000: $70.000 a capital y pasa al ' + fecha(B, r.corte_nuevo) });
    B.ev("registrarCobro('c2')");
    const q = leer(B).prestamos[0];
    assert.deepEqual(q.abonosCapital, [r.registros.abono]);
    assert.deepEqual(q.prorrogas, [r.registros.prorroga]);
    assert.equal(q.cicloActual, r.corte_nuevo);
  });

  test('la ficha del cliente tiene «💵 pago» al lado de cada crédito activo', () => {
    const pagado = credito({ id: 'c5', numero: 75, pagado: true, fechaPagado: '2026-09-15',
      cicloActual: '2026-09-15', cicloPago: '2026-09-15', gananciaPago: 80000, cobroRegistrado: true });
    const B = panelCon([credito(), pagado]);
    const h = B.ev("bloqueCreditosHTML(DB.socios[0])");
    assert.match(h, /abrirPago\('c1'\)/, 'el activo no tiene cómo llegar al cobro desde la ficha');
    assert.doesNotMatch(h, /abrirPago\('c5'\)/, 'a uno pagado no se le cobra');
    B.ev("abrirPago('c1')");
    assert.match(html(B, 'pgAccion'), /💵 Abonó y el resto pasa a la próxima quincena/);
  });

  test('y el crédito por dentro lo nombra en su botón', () => {
    const B = panelCon([credito()]);
    B.ev("verCredito('c1')");
    assert.match(html(B, 'mBody'), /Registrar cobro \/ abono \/ prórroga/);
  });
});

/* ========================================================================== */
describe('la plantilla del recibo', () => {

  test('ofrece {abono} solo donde se contesta, y la vista previa cuadra con el caso real', () => {
    const B = panelCon([credito()]);
    const m = B.ev('PLANTILLAS_DEF.abonoProrroga.m');
    assert.deepEqual(JSON.parse(B.ev("JSON.stringify(tokensSueltos(PLANTILLAS_DEF.abonoProrroga.m,'abonoProrroga'))")), []);
    assert.deepEqual(JSON.parse(B.ev("JSON.stringify(tokensSueltos('{abono}','recibo'))")), ['{abono}'],
      'en otro mensaje {abono} sale vacío y el editor tiene que avisarlo');
    const demo = B.ev("aplicarVarsDemo(PLANTILLAS_DEF.abonoProrroga.m,'abonoProrroga')");
    assert.match(demo, /abono de \$200\.000.*quedas debiendo \$288\.000.*\$345\.600 el 15 de octubre de 2026/);
    assert.match(m, /\{abono\}.*\{monto\}.*\{saldo\}.*\{fecha_pago\}/);
  });

  test('el recibo LEE lo guardado: sale igual si Joan lo hizo con los dos botones viejos el mismo día', () => {
    /* abonarCapital y después registrarProrroga, el mismo día: es la misma
       entrega partida en dos, y el recibo tiene que decir los 200.000. */
    const B = panelCon([credito()]);
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.ev("var i=document.getElementById('abCap'); i.value='112000'; abonarCapital('c1','" + DIA + "')");
    B.ev("registrarProrroga('c1')");
    const v = JSON.parse(B.ev("JSON.stringify(varsDePlantilla(DB.prestamos[0],'abonoProrroga'))"));
    assert.deepEqual(v, { abono: '$200.000', prorroga: '$88.000', saldo: '$345.600' });
  });

  test('sin prórroga guardada no inventa cifras', () => {
    assert.equal(P.reciboAbonoConProrroga(credito()), null);
    assert.equal(P.reciboAbonoConProrroga(null), null);
  });
});
