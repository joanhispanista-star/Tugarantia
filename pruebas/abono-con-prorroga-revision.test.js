'use strict';
/* ============================================================================
 * ABONO + PRÓRROGA — LO QUE ENCONTRÓ LA REVISIÓN — 3 de octubre de 2026
 *
 *   node --test pruebas/abono-con-prorroga-revision.test.js
 *
 * La cuenta de abonoConProrroga salió limpia (≈4.750 casos contra el CRM de
 * verdad). Los defectos estaban en los caminos de AL LADO, y cada uno costaba
 * plata o decía algo que no pasaba. Cada bloque de abajo fallaba antes del
 * arreglo:
 *
 *   1. «Ya tiene una prórroga ese día» mandaba a «Queda debiendo», que es el
 *      orden que cobra de más: prórroga de 88.000 y 112.000 más el mismo día
 *      → 368.000 el 15-oct en vez de 345.600.
 *   2. El acuerdo pactado prometía un precio congelado que ni «✓ Cumplió» ni
 *      el abono + prórroga respetaban (116.000 en vez de 88.000).
 *   3. La MISMA entrega anotada en los dos aparatos, con perdón de mora en el
 *      computador, dejaba en la nube los dos abonos: 172.000 de capital en
 *      vez de 284.000, sin choque.
 *   4. El acuerdo BORRADO volvía de la nube con «lo mío encima».
 *   5. Sin prórrogas, la plata que sobraba de la entrada del plan no tenía
 *      dónde quedar.
 *   6-8. Menores: el recibo «tu abono de  🙂», la galería que llamaba
 *      «Prórroga $200.000» a una de 88.000, y textos del celular que mandaban
 *      a caminos que no existen.
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/puente.js');
const NUBE = require('../panel/nube.js');
const { abrirPanel } = require('./banco-panel.js');
const { abrirEspejo } = require('./banco-espejo.js');

const DIA = '2026-10-03';          // el día en que pagó
const CORTE = '2026-10-01';        // el corte que venció
const NUEVO = '2026-10-15';        // la quincena siguiente, según el motor

function credito(extra) {
  return Object.assign({
    id: 'c1', numero: 81, socioId: 's1', socioNombre: 'Cliente de prueba',
    capital: 400000, costoPct: 20, fechaDesembolso: '2026-09-19', cicloActual: CORTE,
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
  }, extra || {});
}
function cartera(ps, plantillas) {
  const c = {
    socios: [{ id: 's1', numero: 1, nombre: 'Cliente de prueba', telefono: '3001112233',
               whatsappIgual: true, cedula: '52111222', gestiones: [] }],
    prestamos: ps, config: { negocio: 'Tu Garantía' }
  };
  if (plantillas !== undefined) c.plantillas = plantillas;
  return c;
}
const copia = o => JSON.parse(JSON.stringify(o));
/* Lo que hace una pantalla con un resultado `ok` del puente. */
function aplicar(p, r) {
  const g = r.registros;
  if (g.abono) p.abonosCapital.push(g.abono);
  p.prorrogas.push(g.prorroga);
  if (g.condonacion) (p.condonaciones = p.condonaciones || []).push(g.condonacion);
  p.cicloActual = g.cicloActual;
}

/* El acuerdo del caso de la revisión: pactado el 3-oct por 88.000 (80.000 de
   costo + 8.000 de mora de 2 días) para pagarlo el 10-oct. */
const ACUERDO = { pactadoEl: DIA, pactadaPara: '2026-10-10', monto: 88000, costo: 80000,
  mora: 8000, diasMora: 2, condonadaMora: 0, motivoDescuento: '' };

/* ------------------------------------------------------------------------
   El CRM de verdad, como en abono-con-prorroga-pantalla.test.js: se anotan
   los confirm y se dice sí a todo menos a abrir WhatsApp.
   ------------------------------------------------------------------------ */
function panelCon(ps, o) {
  o = o || {};
  const B = abrirPanel({ ahora: (o.ahora || DIA) + 'T10:00:00' });
  B.cargarCartera(cartera(ps));
  B.ev('window._conf=[];window._guardados=0;' +
       "confirm=function(t){t=String(t);_conf.push(t);return t.indexOf('WhatsApp')<0};" +
       '(function(){var g=guardar;guardar=function(){_guardados++;return g.apply(this,arguments)}})()');
  return B;
}
const html = (B, id) => String((B.elems[id] && B.elems[id].innerHTML) || '').replace(/\s+/g, ' ');
const boton = B => ({ txt: B.elems.pgBtn.textContent, listo: !B.elems.pgBtn.disabled });
const leer = B => JSON.parse(B.ev('JSON.stringify(DB)'));
const confirms = B => JSON.parse(B.ev('JSON.stringify(_conf)')).join('\n----\n');
const avisos = B => (B.ctx._avisos || []).join(' | ');
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
/* La prórroga de siempre, por su botón de siempre, sin descuento. */
function prorrogaNormal(B, id) {
  B.ev("abrirPago('" + id + "')");
  B.elems.pgFecha.value = DIA;
  B.ev("registrarProrroga('" + id + "')");
}

/* El celular de verdad. */
function celularCon(ps, o) {
  o = o || {};
  const E = abrirEspejo({ cartera: cartera(ps, o.plantillas), ahora: (o.ahora || DIA) + 'T10:00:00' });
  E.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
  E.ev("window._conf=[];confirm=function(t){_conf.push(String(t));return true}");
  return E;
}
const htmlE = (E, id) => String((E.elems[id] && E.elems[id].innerHTML) || '').replace(/\s+/g, ' ');

/* ========================================================================== */
describe('1. la plata de más del día de la prórroga ya no se cobra de más', () => {

  test('el puente no manda a «Queda debiendo»: arma el abono de la misma entrega, en el ciclo viejo', () => {
    const p = credito(), db = cartera([p]);
    aplicar(p, P.abonoConProrroga(db, p, DIA, 88000));          // una prórroga a secas
    const r = P.abonoConProrroga(db, p, DIA, 112000);
    assert.equal(r.ok, false, 'no puede ser una segunda prórroga');
    assert.equal(r.motivo, 'ya_registrado');
    assert.equal(r.registros, null, 'esto no se registra con «Registrar»');
    assert.deepEqual(r.caminos, ['abono_mismo_dia']);
    assert.doesNotMatch(r.detalle, /anótala como abono a capital/,
      'sigue recomendando el orden que cobra de más');
    assert.deepEqual(r.mismo_dia.abono, { fecha: DIA, monto: 112000, ciclo: CORTE,
      costoCausado: 80000, moraCausada: 8000, diasMoraCausada: 2 });
    assert.deepEqual([r.mismo_dia.capital_despues, r.mismo_dia.costo_siguiente, r.mismo_dia.total_siguiente],
      [288000, 57600, 345600]);
    assert.match(r.detalle, /ya entraron \$88\.000/);
  });

  test('en el CRM: prórroga de 88.000 y 112.000 más ese día → 345.600 el 15-oct, no 368.000', () => {
    const B = panelCon([credito()]);
    prorrogaNormal(B, 'c1');
    assert.equal(leer(B).prestamos[0].prorrogas[0].monto, 88000);

    abono(B, 'c1', 112000);
    const d = html(B, 'pgDif');
    assert.match(d, /registrarAbonoMismoDia\('c1'\)">💵 Sumar \$112\.000 a capital/);
    assert.doesNotMatch(d, /irAlCobroCon\('c1',112000,'debe'\)/, 'sigue mandando a «Queda debiendo»');
    assert.equal(B.elems.pgMontoBox.style.display, '', 'sin el campo no hay dónde escribir lo de más');
    // «Registrar» sigue cerrado: esto va por su propio botón.
    assert.deepEqual(boton(B), { txt: 'Ya tiene una prórroga registrada ese día', listo: false });

    B.ev("registrarAbonoMismoDia('c1')");
    const q = leer(B).prestamos[0];
    assert.equal(q.prorrogas.length, 1);
    assert.equal(P.capitalActual(q), 288000);
    assert.equal(P.K(q), 57600, 'el costo de la quincena nueva sigue sobre los 400.000');
    assert.equal(P.liquidarCiclo(q, NUEVO).total_a_pagar, 345600);
    assert.equal(B.ev('gananciaCobrada(DB.prestamos[0])'), 88000, 'el abono no es ganancia');
    assert.equal(P.garantiaGanadaCredito(q), 67000, 'el abono dejó garantía: no es costo');
    const c = confirms(B);
    assert.match(c, /YA tiene registrado/);
    assert.match(c, /\$88\.000 de la prórroga/);
    assert.match(c, /¿Trajo \$112\.000 MÁS, aparte de eso\?/);
    assert.match(c, /son \$345\.600/);
  });

  test('una segunda llamada con la hoja vieja no mete la misma plata otra vez', () => {
    const B = panelCon([credito()]);
    prorrogaNormal(B, 'c1');
    abono(B, 'c1', 112000);
    B.ev("registrarAbonoMismoDia('c1')");
    B.ev("registrarAbonoMismoDia('c1')");
    const q = leer(B).prestamos[0];
    assert.equal(q.abonosCapital.length, 1, 'la misma plata entró dos veces');
    assert.match(avisos(B), /No registré nada/);
  });

  test('200.000 de una vez y 50.000 más ese día = una sola operación de 250.000', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.ev("registrarCobro('c1')");
    abono(B, 'c1', 50000);
    B.ev("registrarAbonoMismoDia('c1')");
    const q = leer(B).prestamos[0];
    const una = credito(), db = cartera([una]);
    aplicar(una, P.abonoConProrroga(db, una, DIA, 250000));
    assert.equal(P.liquidarCiclo(q, NUEVO).total_a_pagar, 285600, 'antes daba 295.600');
    assert.equal(P.liquidarCiclo(q, NUEVO).total_a_pagar, P.liquidarCiclo(una, NUEVO).total_a_pagar);
    // Y el recibo cuenta toda la plata del día.
    assert.equal(P.reciboAbonoConProrroga(q).entrego, 250000);
  });

  test('la hoja de la prórroga ya no dice «regístralo aparte»: ofrece hacerlo todo junto', () => {
    const B = panelCon([credito()]);
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.ev("modoProrroga('c1')");
    B.elems.pgMonto.value = '200000';
    B.ev("cambioMonto('c1')");
    const d = html(B, 'pgDif');
    assert.doesNotMatch(d, /regístralo aparte como abono a capital/);
    assert.match(d, /modoAbonoProrroga\('c1',200000\)">💵 Abonó y el resto pasa a la próxima quincena/);
    assert.match(boton(B).txt, /devuélvele \$112\.000 o, si es abono, usa «💵 Abonó/);
    B.ev("modoAbonoProrroga('c1',200000)");
    B.ev("registrarCobro('c1')");
    assert.equal(P.liquidarCiclo(leer(B).prestamos[0], NUEVO).total_a_pagar, 345600);
  });

  test('«Queda debiendo» después de la prórroga de hoy avisa que cobra de más', () => {
    const B = panelCon([credito()]);
    prorrogaNormal(B, 'c1');
    B.ev("abrirPago('c1')");
    B.elems.pgFecha.value = DIA;
    B.elems.pgMonto.value = '112000';
    B.ev("cambioMonto('c1')");
    B.ev("modoCobro('c1','debe')");
    const d = html(B, 'pgDif');
    assert.match(d, /Ojo: hoy ya pagó la prórroga/);
    assert.match(d, /paga \$345\.600/);
  });

  test('desde el celular: el mismo abono de la misma entrega, en su propio botón', () => {
    const p = credito(), db = cartera([p]);
    aplicar(p, P.abonoConProrroga(db, p, DIA, 88000));
    const E = celularCon([p]);
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '112000');
    assert.match(htmlE(E, 'apCalc'), /data-acc="abono-mismo-dia" data-id="c1">💵 Sumar \$112\.000 a capital/);
    assert.equal(E.elems.apBtn.disabled, true, '«Registrar» tiene que seguir cerrado');
    E.tocar('abono-mismo-dia', { id: 'c1' });
    const q = E.json('DB.prestamos[0]');
    assert.equal(q.abonosCapital.length, 1);
    assert.equal(q.abonosCapital[0].ciclo, CORTE, 'el abono quedó en el ciclo nuevo: cobra de más');
    assert.equal(P.liquidarCiclo(q, NUEVO).total_a_pagar, 345600);
    const cola = E.json('COLA');
    assert.equal(cola[cola.length - 1].que, 'abono');
    // Un segundo toque con la hoja vieja no repite la plata.
    E.tocar('abono-mismo-dia', { id: 'c1' });
    assert.equal(E.json('DB.prestamos[0]').abonosCapital.length, 1);
  });

  test('el celular tampoco recomienda «Queda debiendo» después de la prórroga de hoy sin avisar', () => {
    const p = credito(), db = cartera([p]);
    aplicar(p, P.abonoConProrroga(db, p, DIA, 88000));
    const E = celularCon([p]);
    E.tocar('cobro', { id: 'c1' });
    E.escribir('pgMonto', '112000');
    E.tocar('cobro-modo', { id: 'c1', m: 'debe' });
    assert.match(htmlE(E, 'pgDif'), /Ojo: hoy ya pagó la prórroga/);
  });
});

/* ========================================================================== */
describe('2. el acuerdo: el precio prometido es el que se cobra', () => {

  test('«✓ Cumplió» el día pactado cobra el precio congelado: 88.000, no 116.000', () => {
    const B = panelCon([credito({ acuerdo: Object.assign({}, ACUERDO) })], { ahora: '2026-10-10' });
    B.ev("cumplirAcuerdo('c1')");
    const q = leer(B).prestamos[0];
    assert.equal(q.prorrogas.length, 1);
    assert.equal(q.prorrogas[0].monto, 88000, 'le corrieron los días desde el pacto');
    assert.equal(q.prorrogas[0].mora, 8000);
    assert.equal(q.prorrogas[0].diasMora, 9, 'los días de mora de verdad no se borran');
    assert.match(confirms(B), /Recibes \$88\.000 \(el precio congelado del pacto\)/);
    assert.ok('acuerdo' in q && q.acuerdo === null, 'el acuerdo no quedó en null');
  });

  test('el abono + prórroga sobre ese acuerdo también lo respeta, y anota el perdón', () => {
    const B = panelCon([credito({ acuerdo: Object.assign({}, ACUERDO) })], { ahora: '2026-10-10' });
    abono(B, 'c1', 200000, '2026-10-10');
    const h = html(B, 'pgCalc');
    assert.match(h, /respeta el precio congelado/);
    assert.match(h, /Se la perdona el acuerdo/);
    assert.doesNotMatch(h, /cobra lo causado de hoy/);
    B.ev("registrarCobro('c1')");
    const q = leer(B).prestamos[0];
    assert.equal(q.prorrogas[0].monto, 88000, 'cobró 116.000 y dijo «queda cumplido»');
    assert.equal(q.abonosCapital[0].monto, 112000);
    assert.equal(q.condonaciones.length, 1);
    assert.equal(q.condonaciones[0].mora, 28000, 'los 7 días desde el pacto son un perdón: se anotan');
    assert.match(q.condonaciones[0].motivo, /acuerdo pactado/);
    assert.ok('acuerdo' in q && q.acuerdo === null);
    assert.equal(P.liquidarCiclo(q, NUEVO).total_a_pagar, 345600);
    assert.match(confirms(B), /se respeta ese precio/);
  });

  test('pasada la fecha pactada se cobra lo causado, y lo dice', () => {
    const B = panelCon([credito({ acuerdo: Object.assign({}, ACUERDO) })], { ahora: '2026-10-11' });
    abono(B, 'c1', 200000, '2026-10-11');
    assert.match(html(B, 'pgCalc'), /El precio pactado venció/);
    B.ev("registrarCobro('c1')");
    const q = leer(B).prestamos[0];
    assert.equal(q.prorrogas[0].monto, 120000, '80.000 + 10 días × 4.000');
    assert.equal((q.condonaciones || []).length, 0);
    assert.match(confirms(B), /el precio pactado ya venció/);
  });

  test('el celular: respeta el precio pactado y dice cuál es', () => {
    const E = celularCon([credito({ acuerdo: Object.assign({}, ACUERDO) })], { ahora: '2026-10-10' });
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    const h = htmlE(E, 'apCalc');
    assert.match(h, /Se la perdona el acuerdo/);
    assert.match(h, /respeta el precio pactado/);
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    const q = E.json('DB.prestamos[0]');
    assert.equal(q.prorrogas[0].monto, 88000);
    assert.equal(q.condonaciones[0].mora, 28000);
    assert.match(E.json('_conf').join('\n'), /se respeta ese precio/);
  });
});

/* ========================================================================== */
describe('3. la nube: la misma entrega, anotada distinto en los dos aparatos', () => {

  function versiones() {
    const pc = credito(), cel = credito();
    aplicar(pc, P.abonoConProrroga(cartera([pc]), pc, DIA, 200000,
      { condonaMora: 4000, motivo: 'lluvia', quien: 'computador' }));
    aplicar(cel, P.abonoConProrroga(cartera([cel]), cel, DIA, 200000, { quien: 'celular' }));
    return { pc, cel };
  }

  test('es un choque, y la parte a capital de esa entrega no se suma dos veces', () => {
    const { pc, cel } = versiones();
    assert.deepEqual([pc.prorrogas[0].monto, pc.abonosCapital[0].monto], [84000, 116000]);
    assert.deepEqual([cel.prorrogas[0].monto, cel.abonosCapital[0].monto], [88000, 112000]);
    [[pc, cel, 284000], [cel, pc, 288000]].forEach(([mio, suyo, capital]) => {
      [NUBE.fusionarFila(mio, suyo, NUBE.LISTAS_QUE_SUMAN), NUBE.fusionarFila(mio, suyo)].forEach(f => {
        assert.equal(f.hayChoque, true, 'la misma entrega con montos distintos pasó sin choque');
        const campos = f.pisables.map(x => x.campo);
        assert.ok(campos.includes('prorrogas'));
        assert.ok(campos.includes('abonosCapital'));
        assert.equal(f.fila.abonosCapital.length, 1);
        assert.equal(P.capitalActual(f.fila), capital, 'antes quedaba en 172.000');
      });
    });
  });

  test('la pantalla del choque del celular enseña las dos plata, no «las dos caben»', () => {
    const { pc, cel } = versiones();
    const E = celularCon([credito()]);
    E.ev('var __c=' + JSON.stringify({ mio: cel, suyo: pc }));
    const h = E.ev('ladosHTML(__c)');
    assert.doesNotMatch(h, /Las dos versiones caben/);
    assert.match(h, /Prórroga de ese día/);
    assert.match(h, /\$84\.000/);
    assert.match(h, /\$116\.000/);
  });

  test('lo que sí son dos hechos se sigue sumando: la plata de más de ese día', () => {
    const a = credito();
    aplicar(a, P.abonoConProrroga(cartera([a]), a, DIA, 200000));
    const b = copia(a);
    a.abonosCapital.push(P.abonoConProrroga(cartera([a]), a, DIA, 50000).mismo_dia.abono);
    const f = NUBE.fusionarFila(b, a, NUBE.LISTAS_QUE_SUMAN);
    assert.equal(f.hayChoque, false);
    assert.equal(P.capitalActual(f.fila), 238000);
    const igual = NUBE.fusionarFila(a, copia(a), NUBE.LISTAS_QUE_SUMAN);
    assert.equal(igual.hayChoque, false);
    assert.equal(igual.fila.abonosCapital.length, 2);
  });
});

/* ========================================================================== */
describe('4. el acuerdo cumplido no vuelve de la nube', () => {

  test('el celular lo deja en null, y la fusión lo enseña como choque en vez de devolverlo', () => {
    const conPacto = credito({ acuerdo: Object.assign({}, ACUERDO) });
    const E = celularCon([copia(conPacto)], { ahora: '2026-10-10' });
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    const q = E.json('DB.prestamos[0]');
    assert.ok('acuerdo' in q && q.acuerdo === null, 'el celular borró la llave');
    const f = NUBE.fusionarFila(q, conPacto);
    assert.equal(f.fila.acuerdo, null, 'con «lo mío encima» volvió el acuerdo ya cumplido');
    assert.ok(f.pisables.some(x => x.campo === 'acuerdo'));
  });

  test('el computador también: abono + prórroga, «Cumplió» y «Deshacer»', () => {
    const B = panelCon([credito({ acuerdo: Object.assign({}, ACUERDO) }),
      credito({ id: 'c2', numero: 82, acuerdo: Object.assign({}, ACUERDO) })], { ahora: '2026-10-10' });
    abono(B, 'c1', 200000, '2026-10-10');
    B.ev("registrarCobro('c1')");
    B.ev("romperAcuerdo('c2')");
    const [q1, q2] = leer(B).prestamos;
    assert.ok('acuerdo' in q1 && q1.acuerdo === null);
    assert.ok('acuerdo' in q2 && q2.acuerdo === null);
    assert.equal(B.ev("acuerdoDe(DB.prestamos[1])"), null);
  });
});

/* ========================================================================== */
describe('5. sin prórrogas: lo que sobra de la entrada del plan no se pierde', () => {

  const agotado = () => credito({ id: 'c3', fechaDesembolso: '2026-08-18', prorrogas: [
    { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: '2026-09-15' },
    { fecha: '2026-09-15', ciclo: '2026-09-15', monto: 80000, mora: 0, aTiempo: true, nuevoCiclo: CORTE }] });

  test('el puente dice cuánto va a capital primero, y el CRM lo lleva así', () => {
    const p = agotado();
    const r = P.abonoConProrroga(cartera([p]), p, DIA, 200000);
    assert.equal(r.motivo, 'prorrogas_agotadas');
    assert.equal(r.entrada_plan, 88000);
    assert.equal(r.a_capital_sugerido, 112000);
    assert.deepEqual(r.caminos, ['queda_debiendo', 'plan_de_pagos']);
    assert.match(r.detalle, /Anota PRIMERO esos \$112\.000/);

    const B = panelCon([agotado()]);
    abono(B, 'c3', 200000);
    const d = html(B, 'pgDif');
    assert.match(d, /irAlCobroCon\('c3',112000,'debe'\)/, 'se llevaba los 200.000 enteros');
    // Y en ese orden, el plan sale con la misma entrada y sobre lo que quedó.
    B.ev("irAlCobroCon('c3',112000,'debe')");
    B.ev("registrarCobro('c3')");
    B.ev("registrarProrroga('c3')");
    B.ev("registrarPlanDePagos('c3')");
    const q = leer(B).prestamos[0];
    assert.equal(P.capitalActual(q) + 0, 288000);
    assert.equal(q.planPagos.entrada.monto, 88000, 'la entrada cambió por el abono');
    assert.equal(q.planPagos.total_capital, 288000);
  });

  test('si con lo que trajo salda, lo dice', () => {
    const p = agotado();
    const r = P.abonoConProrroga(cartera([p]), p, DIA, 488000);
    assert.deepEqual(r.caminos, ['pago_total', 'plan_de_pagos']);
    assert.match(r.detalle, /«Pagó todo»/);
  });
});

/* ========================================================================== */
describe('6-8. los menores', () => {

  test('el recibo del abono sobre una prórroga a secas no dice «tu abono de $88.000»', () => {
    const p = credito(), db = cartera([p]);
    aplicar(p, P.abonoConProrroga(db, p, DIA, 88000));
    const B = panelCon([p]);
    B.ev("gestionar('c1','abonoProrroga')");
    const cuerpo = html(B, 'mBody');
    const txt = (cuerpo.match(/<div class="preview" id="gPrev">([^<]*)<\/div>/) || [])[1];
    assert.match(txt, /tu abono de \{abono\}/, 'quedó vacío o con la prórroga');
    assert.match(cuerpo, /no tiene un abono \+ prórroga registrado ese día/);
    // El celular, igual.
    const E = celularCon([p], { plantillas: { abonoProrroga: B.ev('PLANTILLAS_DEF.abonoProrroga.m') } });
    assert.match(E.ev("textoPlantilla(DB.prestamos[0],DB.socios[0],'abonoProrroga')"), /tu abono de \{abono\}/);
  });

  test('el crédito por dentro: «Abono + prórroga $200.000» y el renglón del abono a capital', () => {
    const B = panelCon([credito()]);
    abono(B, 'c1', 200000);
    B.ev("_compTmp='data:image/jpeg;base64,AAAA'");
    B.ev("registrarCobro('c1')");
    B.ev("verCredito('c1')");
    const h = html(B, 'mBody');
    assert.match(h, /Abono \+ prórroga \$200\.000/);
    assert.doesNotMatch(h, /Prórroga \$200\.000/);
    assert.match(h, /Abonos a capital/);
    assert.match(h, /abono a capital \$112\.000/);
  });

  test('el celular no manda a caminos que no existen, y sin plantillas da las cifras', () => {
    const E = celularCon([credito()], { plantillas: {} });
    E.tocar('abono-prorroga', { id: 'c1' });
    E.escribir('apMonto', '200000');
    const h = htmlE(E, 'apCalc');
    assert.doesNotMatch(h, /adjúntalo en el computador/);
    assert.match(h, /no lo registres acá/);
    E.tocar('abono-prorroga-ok', { id: 'c1' });
    E.correrPendientes();
    const hoja = htmlE(E, 'hojaCuerpo');
    assert.doesNotMatch(hoja, /Te dejo el de la prórroga/);
    assert.match(hoja, /abonó \$200\.000, queda debiendo \$288\.000 de capital y su próximo pago es de \$345\.600/);
  });
});
