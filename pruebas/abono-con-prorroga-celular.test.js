'use strict';
/* ============================================================================
 * «💵 ABONÓ Y EL RESTO PASA A LA PRÓXIMA QUINCENA» EN EL CELULAR
 * 3 de octubre de 2026
 *
 *   node --test pruebas/abono-con-prorroga-celular.test.js
 *
 * El panel del bolsillo (panel/espejo.html) ya cobra, abona y prorroga desde la
 * calle a través de su cola. Este paso nuevo va por ese MISMO camino: la regla
 * es la del puente (abonoConProrroga, la misma que usa el computador), los
 * registros van a las listas que ya existen (abonosCapital, prorrogas) y viaja
 * UNA línea de la cola con la fila entera, como la prórroga. Ningún campo
 * nuevo en la nube.
 *
 * Lo que el celular NO hace, y la hoja lo dice: perdonar mora (el descuento con
 * su motivo vive en el computador, igual que en la prórroga del celular) y
 * adjuntar la foto (las fotos no viajan en esta fase).
 *
 * Y la prueba que cierra el círculo: el MISMO abono anotado en los dos
 * aparatos llega a la nube una sola vez, y los dos le mandan a la cliente el
 * MISMO recibo.
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/puente.js');
const NUBE = require('../panel/nube.js');
const { abrirEspejo } = require('./banco-espejo.js');
const { abrirPanel } = require('./banco-panel.js');

const DIA = '2026-10-03';
const CORTE = '2026-10-01';
const NUEVO = '2026-10-15';

function credito(extra) {
  return Object.assign({
    id: 'c1', numero: 81, socioId: 's1', socioNombre: 'Cliente de prueba',
    capital: 400000, costoPct: 20, fechaDesembolso: '2026-09-19', cicloActual: CORTE,
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
  }, extra || {});
}
/* El recibo es el de crm.html, leído de allá: el celular recibe las plantillas
   del computador por la nube y no tiene texto propio. */
const PLANTILLA_CRM = (() => {
  const B = abrirPanel({ ahora: DIA + 'T10:00:00' });
  return { abonoProrroga: B.ev('PLANTILLAS_DEF.abonoProrroga.m'), prorroga: B.ev('PLANTILLAS_DEF.prorroga.m') };
})();
function cartera(ps, plantillas) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Cliente de prueba', telefono: '3001112233',
               whatsappIgual: true, cedula: '52111222', gestiones: [] }],
    prestamos: ps, config: { negocio: 'Tu Garantía' },
    plantillas: plantillas === undefined ? Object.assign({}, PLANTILLA_CRM) : plantillas
  };
}
/* El espejo de verdad. El banco devuelve null a cualquier querySelector, y la
   hoja del celular le pide a '.hoja-caja' que vuelva arriba al abrirse: se le
   da una caja de mentira acá, en esta prueba, sin tocar el banco que usan las
   demás. */
function celularCon(ps, plantillas) {
  const E = abrirEspejo({ cartera: cartera(ps, plantillas), ahora: DIA + 'T10:00:00' });
  E.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
  return E;
}
const html = (E, id) => String((E.elems[id] && E.elems[id].innerHTML) || '').replace(/\s+/g, ' ');
const boton = E => ({ txt: E.elems.apBtn.textContent, listo: !E.elems.apBtn.disabled });
const fecha = (E, iso) => E.ev("fmtFecha('" + iso + "')");
const cola = E => E.json('COLA');
const delPuente = (p, monto) => {
  const c = JSON.parse(JSON.stringify(p));
  return P.abonoConProrroga(cartera([c]), c, DIA, monto, { quien: 'celular' });
};

/* ========================================================================== */
describe('el botón en el celular', () => {

  test('en la hoja de cobro, al lado de «Pagó todo» y de la prórroga', () => {
    const E = celularCon([credito()]);
    E.tocar('cobro', { id: 'c1' });
    const h = html(E, 'pgCalc');
    assert.match(h, /✓ Pagó todo/);
    assert.match(h, /↻ Prórroga/);
    assert.match(h, /data-acc="abono-prorroga" data-desde="cobro" data-id="c1">💵 Abonó y el resto pasa a la próxima quincena/);
  });

  test('en la vista del crédito; y no en un plan de pagos, que no se prorroga', () => {
    const E = celularCon([credito(), credito({ id: 'c4', numero: 84, planPagos: { tasa_por_corte: 0.05, cuotas: [
      { n: 1, fecha: '2026-10-15', capital: 133334, costo: 20000, pagado: false },
      { n: 2, fecha: '2026-10-30', capital: 133333, costo: 13333, pagado: false },
      { n: 3, fecha: '2026-11-17', capital: 133333, costo: 6667, pagado: false }] } })]);
    E.ev("SEL.creditoId='c1'");
    assert.match(E.ev('vistaCredito()'), /data-acc="abono-prorroga" data-id="c1"/);
    E.ev("SEL.creditoId='c4'");
    assert.doesNotMatch(E.ev('vistaCredito()'), /abono-prorroga/);
  });
});

/* ========================================================================== */
describe('el caso real desde la calle', () => {

  test('desde la hoja de cobro se lleva la fecha y lo que Joan ya tecleó', () => {
    const E = celularCon([credito()]);
    E.tocar('cobro', { id: 'c1' });
    E.escribir('pgMonto', '200000');
    E.tocar('abono-prorroga', { id: 'c1', desde: 'cobro' });
    assert.equal(E.elems.hojaTitulo.textContent, 'Abono · Cliente de prueba');
    assert.equal(E.elems.apMonto.value, '200000');
    assert.equal(E.elems.apFecha.value, DIA);
    const h = html(E, 'apCalc');
    assert.match(h, /Entregó.*\$200\.000/);
    assert.match(h, /1\. Recargo por 2 día\(s\) de mora.*\$8\.000/);
    assert.match(h, /2\. Costo del ciclo.*\$80\.000/);
    assert.match(h, /3\. A capital.*\$112\.000/);
    assert.match(h, /Capital que queda.*\$288\.000/);
    assert.ok(h.includes('Nueva fecha de pago</span><span class="v"><b>' + fecha(E, NUEVO)));
    assert.match(h, /Ese día paga, si paga a tiempo.*\$345\.600/);
    assert.match(h, /Garantía que le deja.*\$67\.000/);
    assert.match(h, /El abono es capital: no deja garantía/);
    assert.deepEqual(boton(E), { listo: true,
      txt: '💵 Registrar $200.000: $112.000 a capital y pasa al ' + fecha(E, NUEVO) });
  });

  test('registrar: los registros del puente, el corte movido y UNA línea en la cola', () => {
    const E = celularCon([credito()]);
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    const antes = cola(E).length;
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    assert.deepEqual(E.avisos, []);
    const r = delPuente(credito(), 200000);
    const q = E.json('DB.prestamos[0]');
    assert.deepEqual(q.abonosCapital, [r.registros.abono]);
    assert.deepEqual(q.prorrogas, [r.registros.prorroga]);
    assert.equal(q.cicloActual, NUEVO);
    const c = cola(E);
    assert.equal(c.length, antes + 1, 'los dos registros son UNA operación: una línea de la cola');
    const linea = c[c.length - 1];
    assert.deepEqual([linea.tabla, linea.id, linea.que], ['creditos', 'c1', 'prorroga']);
    assert.match(linea.detalle, /abonó \$200\.000 · \$112\.000 a capital/);
    assert.deepEqual(linea.datos.abonosCapital, q.abonosCapital, 'la fila que sube no lleva el abono');
    assert.deepEqual(linea.datos.prorrogas, q.prorrogas, 'la fila que sube no lleva la prórroga');
  });

  test('arranca vacío desde la vista del crédito, y escribir repinta el botón', () => {
    const E = celularCon([credito()]);
    E.tocar('abono-prorroga', { id: 'c1' });
    assert.equal(E.elems.apMonto.value, '');
    assert.deepEqual(boton(E), { txt: 'Escribe cuánto pagó', listo: false });
    assert.match(html(E, 'apCalc'), /Con <b>\$88\.000<\/b> paga justo la prórroga/);
    E.escribir('apMonto', '50000');
    assert.deepEqual(boton(E), { txt: 'No alcanza: la prórroga cuesta $88.000', listo: false });
    assert.match(html(E, 'apCalc'), /la prórroga con descuento se registra en el computador/);
    assert.match(html(E, 'apCalc'), /«Queda debiendo» está en la hoja de cobro/);
    E.escribir('apMonto', '500000');
    assert.deepEqual(boton(E), { txt: 'Con eso salda todo: es «Pagó todo»', listo: false });
    // Aunque el toque llegara, no se escribe nada.
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    assert.match(E.avisos.join(' '), /No registré nada/);
    const q = E.json('DB.prestamos[0]');
    assert.deepEqual([q.abonosCapital.length, q.prorrogas.length, q.cicloActual], [0, 0, CORTE]);
  });

  test('la fecha se puede corregir: pagó ayer, un día de mora', () => {
    const E = celularCon([credito()]);
    E.tocar('cobro', { id: 'c1' });
    E.elems.pgFecha.value = '2026-10-02';
    E.tocar('abono-prorroga', { id: 'c1', desde: 'cobro' });
    assert.equal(E.elems.apFecha.value, '2026-10-02');
    E.escribir('apMonto', '200000');
    assert.match(html(E, 'apCalc'), /1\. Recargo por 1 día\(s\) de mora.*\$4\.000/);
    assert.match(html(E, 'apCalc'), /3\. A capital.*\$116\.000/);
    // Y cambiarla en la hoja también repinta.
    E.elems.apFecha.value = DIA;
    E.elems.apFecha._oyentes.input.forEach(fn => fn());
    assert.match(html(E, 'apCalc'), /3\. A capital.*\$112\.000/);
  });

  test('sin prórrogas en su nivel: lo dice desde el primer momento y dónde está la salida', () => {
    const agotado = credito({ id: 'c3', fechaDesembolso: '2026-08-18', prorrogas: [
      { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: '2026-09-15' },
      { fecha: '2026-09-15', ciclo: '2026-09-15', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: CORTE }] });
    const E = celularCon([agotado]);
    E.tocar('abono-prorroga', { id: 'c3' });
    assert.deepEqual(boton(E), { txt: 'Ya no le quedan prórrogas', listo: false });
    assert.match(html(E, 'apCalc'), /plan de pagos se registra en el computador/);
  });

  test('dos veces el mismo día no: el puente lo para', () => {
    const E = celularCon([credito()]);
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    const q = E.json('DB.prestamos[0]');
    assert.deepEqual([q.abonosCapital.length, q.prorrogas.length], [1, 1]);
    assert.match(E.avisos.join(' '), /ya tiene una prórroga registrada/);
  });
});

/* ========================================================================== */
describe('el recibo del celular', () => {

  test('con la plantilla del computador: el MISMO texto que manda el computador', () => {
    const E = celularCon([credito()]);
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    E.correrPendientes();
    assert.equal(E.elems.hojaTitulo.textContent.indexOf('Abono registrado'), 0);
    const delCelular = (html(E, 'hojaCuerpo').match(/<textarea[^>]*>([^<]*)<\/textarea>/) || [])[1];
    assert.ok(delCelular, 'no se abrió el recibo');

    const B = abrirPanel({ ahora: DIA + 'T10:00:00' });
    B.cargarCartera(cartera([credito()]));
    B.ev("confirm=function(t){return String(t).indexOf('WhatsApp')<0}");
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.ev("modoAbonoProrroga('c1',200000)");
    B.ev("registrarCobro('c1')");
    const delComputador = B.ev("aplicarVars(DB.plantillas.abonoProrroga,DB.prestamos[0],DB.socios[0],'',varsDePlantilla(DB.prestamos[0],'abonoProrroga'))");
    /* Las fechas se escriben con el fmtFecha de cada aparato; lo demás tiene
       que ser letra por letra lo mismo. */
    const sinFecha = (t, f) => t.split(f).join('<fecha>');
    assert.equal(sinFecha(delCelular, fecha(E, NUEVO)), sinFecha(delComputador, B.ev("fmtFecha('" + NUEVO + "')")));
    assert.match(delCelular, /recibimos tu abono de \$200\.000.*quedas debiendo \$288\.000.*próximo pago es de \$345\.600/);
  });

  test('si la plantilla todavía no llegó, va la de la prórroga y lo dice', () => {
    const E = celularCon([credito()], { prorroga: PLANTILLA_CRM.prorroga });
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    E.correrPendientes();
    const h = html(E, 'hojaCuerpo');
    assert.match(h, /El recibo del abono todavía no llegó a este teléfono/);
    assert.match(h, /abonaste \$200\.000/);
    assert.match(h, /prórroga de \$88\.000/);
  });
});

/* ========================================================================== */
describe('la nube: el mismo abono, anotado en los dos aparatos, llega una vez', () => {

  test('lo que sube el celular contra la versión de antes y contra lo del computador', () => {
    const E = celularCon([credito()]);
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    const c = cola(E), delCelular = c[c.length - 1].datos;

    const B = abrirPanel({ ahora: DIA + 'T10:00:00' });
    B.cargarCartera(cartera([credito()]));
    B.ev("confirm=function(t){return String(t).indexOf('WhatsApp')<0}");
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.ev("modoAbonoProrroga('c1',200000)");
    B.ev("registrarCobro('c1')");
    const delComputador = JSON.parse(B.ev('JSON.stringify(DB.prestamos[0])'));

    const contraAntes = NUBE.fusionarFila(delCelular, credito(), NUBE.LISTAS_QUE_SUMAN).fila;
    assert.equal(contraAntes.abonosCapital.length, 1);
    assert.equal(contraAntes.prorrogas.length, 1);

    const f = NUBE.fusionarFila(delCelular, delComputador, NUBE.LISTAS_QUE_SUMAN);
    assert.equal(f.hayChoque, false, 'los dos aparatos escribieron la misma operación distinto');
    assert.equal(f.fila.abonosCapital.length, 1, 'el mismo abono de los dos aparatos se duplicó');
    assert.equal(f.fila.prorrogas.length, 1, 'la misma prórroga de los dos aparatos se duplicó');
    assert.equal(f.fila.cicloActual, NUEVO);
  });
});
