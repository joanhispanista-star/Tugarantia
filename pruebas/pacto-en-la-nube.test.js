'use strict';
/* ============================================================================
 * EL PAGO ACORDADO EN LA NUBE — revisión del 22 de octubre de 2026
 *
 *   node --test pruebas/pacto-en-la-nube.test.js
 *
 * La revisión de plata del pago que pacta Joan (puente.pactarProximoPago, el
 * commit ef3e74c) encontró cinco maneras de que la nube contara mal la plata.
 * Estas pruebas corren las páginas de verdad —el celular (banco-espejo) con
 * sus botones del choque, subir.html con sus dos fusiones y sus textos— y
 * NUBE.fusionarFila en los dos órdenes, y fallan contra ef3e74c:
 *
 *   N1. el lado SIN pacto ganaba el choque y el pacto entraba igual, junto con
 *       el abono del celular: 675.000 de capital por 625.000 prestados, con la
 *       tarjeta diciendo «el pago acordado no entra»;
 *   N2. una prórroga del celular que el pacto no conocía se sumaba callada al
 *       pacto: el cliente pagaba 125.000 + 780.000 por lo que Joan acordó en
 *       780.000, y la tarjeta prometía el corte del 17-nov;
 *   N3. el perdón de capital de un pacto que perdió el choque seguía restando:
 *       capitalRecuperadoDe 600.000 de 625.000 que sí entraron;
 *   N4. dos perdones del mismo día y el mismo monto se fundían en uno;
 *   N5. el celular decía «Ya lleva 1 descuento(s) por $0» de un perdón de
 *       10.000 de capital.
 *
 * LA REGLA QUE VIGILAN: el pago acordado viaja ENTERO con su lado. Lo que el
 * pacto no conocía del otro lado es un choque en pesos que Joan ve y decide,
 * nunca una suma en silencio, y cada botón hace lo que su texto dice.
 * ==========================================================================*/

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const M = require('../app/motor.js');
const P = require('../app/puente.js');
const NUBE = require('../panel/nube.js');
const { abrirEspejo } = require('./banco-espejo.js');

const DIA = '2026-10-31';        // sábado: vencía
const CRM_FECHA = '2026-11-17';  // la quincena siguiente del motor (15 domingo, 16 festivo)
const SUYA = '2026-11-20';       // la fecha que pone Joan
const PRESTADO = 625000;

const copia = o => JSON.parse(JSON.stringify(o));
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

function credito(extra) {
  return Object.assign({
    id: 'c1', numero: 7, socioId: 's1', socioNombre: 'Cliente de prueba', telefono: '3001112233',
    capital: PRESTADO, costoPct: 20, fechaDesembolso: '2026-10-16', cicloActual: DIA,
    prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
  }, extra || {});
}
function cartera(ps) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Cliente de prueba', telefono: '3001112233', whatsappIgual: true,
               cedula: '52111222', gestiones: [], ajusteGarantia: 0 }],
    prestamos: ps, config: { negocio: 'Tu Garantía' }
  };
}
/* Lo que guarda el CRM con el «💵 Abonó y el resto pasa…» (registrarAbonoProrroga). */
function conAbonoYProrroga(p) {
  const r = P.abonoConProrroga(cartera([p]), p, DIA, 500000);
  assert.equal(r.ok, true, r.detalle);
  const g = r.registros;
  p.abonosCapital.push(g.abono);
  p.prorrogas.push(g.prorroga);
  if (g.condonacion) (p.condonaciones = p.condonaciones || []).push(g.condonacion);
  p.cicloActual = g.cicloActual;
  return p;
}
/* Lo que guarda «✏️ Ajustar el próximo pago» (crm.html guardarAjuste). */
function pactar(p, pedido, hoy) {
  const r = P.pactarProximoPago(cartera([p]), p, pedido, hoy);
  assert.equal(r.ok, true, r.detalle);
  p.planPagos = r.registros.planPagos;
  if (r.registros.condonacion) (p.condonaciones = p.condonaciones || []).push(r.registros.condonacion);
  p.cicloActual = r.registros.cicloActual;
  return p;
}
/* La cuenta de plata que no puede fallar: lo que ya entró a capital, más lo
   que el crédito todavía cobra de capital en su próximo pago, más lo
   perdonado, es lo prestado. Ni un peso más (cobrar dos veces) ni uno menos. */
function capitalQueCobra(p) {
  const abonado = (p.abonosCapital || []).reduce((t, a) => t + a.monto, 0);
  const falta = p.pagado ? 0 : Math.round(P.liquidarCiclo(p, P.corteDelCredito(p)).capital);
  return abonado + falta + P.capitalPerdonadoDe(p);
}
/* El choque, en el celular: lo de este celular contra lo que trae la nube. */
function choqueEnElCelular(e, mio, suyo) {
  e.ev('CHOQUES = [' + JSON.stringify({ tabla: 'creditos', id: 'c1', mio, suyo, revision_servidor: 7,
    actualizado_por: 'computador', actualizado_en: '2026-11-05T15:00:00Z' }) + ']');
}

/* subir.html arrancada en una caja, como en credito-a-cuotas-socio.test.js.
   `nube` (23-oct-2026, N8): el nube.js que le llegó, si no es el de hoy. */
function abrirSubir(nube) {
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
  ctx.NubeTuGarantia = nube || NUBE; ctx.MotorReglas = M; ctx.PuenteTuGarantia = P;
  vm.createContext(ctx);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'subir#' + i }));
  const ev = e => vm.runInContext(e, ctx, { filename: 'banco' });
  return {
    ev,
    /* El choque del paso 7: lo de este computador contra lo que trae la nube. */
    choque(local, nube) {
      ctx.__it = { tabla: 'creditos', id: 'c1', local,
        fila: { id: 'c1', datos: nube, revision: 7, actualizado_por: 'celular', actualizado_en: '2026-11-05T15:00:00Z' } };
    },
    loMio: () => ev('queHaceLoMio(__it)'),
    loDeLaNube: () => { ev("E.decisiones[llaveDe('creditos', __it.fila)] = 'nube'"); return plano(ev("tarjetaChoque(__it, 'b0')")); },
    tarjeta: () => { ev("delete E.decisiones[llaveDe('creditos', __it.fila)]"); return plano(ev("tarjetaChoque(__it, 'b0')")); },
    conLoMio: () => JSON.parse(ev("JSON.stringify(loMioEncima('creditos', __it.fila.datos, __it.local))")),
    conLaNube: () => JSON.parse(ev("JSON.stringify(fusionarConLoMio('creditos', __it.fila.datos, __it.local))"))
  };
}

/* ==========================================================================
 * N1 — EL ABONO DEL CELULAR SIN SEÑAL Y EL PACTO DEL COMPUTADOR
 * ======================================================================== */
describe('N1 · el pago acordado viaja entero con su lado: nunca se copia a la versión que no lo trae', () => {

  /* El 31-oct los dos aparatos anotaron el abono de 500.000 (quedan 250.000).
     El 2-nov el computador pacta 280.000 el 20-nov. El 5-nov el celular, sin
     señal y con la copia quincenal, anota un «Queda debiendo» de 50.000. */
  function lados() {
    const base = conAbonoYProrroga(credito());
    const computador = pactar(copia(base), { fecha: SUYA, monto: 280000 }, '2026-11-02');
    const e = abrirEspejo({ cartera: cartera([copia(base)]), ahora: '2026-11-05T10:30:00' });
    e.ev("abonarEnCalle('c1', 50000, '2026-11-05')");
    const celular = e.json('DB.prestamos[0]');
    assert.equal(celular.abonosCapital.length, 2, 'el celular anotó su abono');
    return { e, computador, celular };
  }

  test('NUBE.fusionarFila: la fila del lado sin pacto no trae el pacto; la del pacto no trae el abono que no conocía', () => {
    const { computador, celular } = lados();
    const f = NUBE.fusionarFila(copia(celular), copia(computador));
    assert.equal(f.fila.planPagos, undefined, 'el pacto se copió a la versión que no lo trae');
    assert.deepEqual(f.fila.abonosCapital.map(a => a.monto), [375000, 50000]);
    assert.equal(P.capitalActual(f.fila), 200000);
    assert.equal(capitalQueCobra(f.fila), PRESTADO, 'cobra capital dos veces');
    const pa = f.pisables.find(x => x.campo === 'pagoAcordado');
    assert.ok(pa, 'el choque del pago acordado no se avisó');
    assert.equal(pa.mio, 'sin pago acordado: abono 2026-11-05 $50000');
    assert.equal(pa.suyo, 'pago acordado $280000 el 2026-11-20');

    const g = NUBE.fusionarFila(copia(computador), copia(celular));
    assert.ok(P.esPacto(g.fila));
    assert.deepEqual(g.fila.abonosCapital.map(a => a.monto), [375000], 'el pacto se quedó con un abono que no conocía');
    assert.equal(P.liquidarCiclo(g.fila, SUYA).total_a_pagar, 280000);
    assert.equal(capitalQueCobra(g.fila), PRESTADO);
    const pb = g.pisables.find(x => x.campo === 'pagoAcordado');
    assert.deepEqual([pb.mio, pb.suyo], [pa.suyo, pa.mio], 'los dos órdenes dicen lo mismo de cada lado');
    nadaQueDecidir();
    laSubidaNoHereda();
  });

  /* La subida del computador no hereda la revisión de una nube que trae un
     abono que su pacto no conoce (nadaQueSumar, nube-crm.js). Con el aviso del
     pago acordado, «lo mío» ya no trae el abono y las listas «cuadraban»: sin
     contar `pagoAcordado` como algo que pisa, la subida se lo comía sin choque. */
  function laSubidaNoHereda() {
    /* La función de verdad, recortada de su archivo (es una pieza interna del
       CRM, sin exportar) y evaluada con sus dos ayudantes y la nube de verdad. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'panel', 'nube-crm.js'), 'utf8').replace(/\r\n/g, '\n');
    const i = src.indexOf('\n  function nadaQueSumar(');
    assert.notEqual(i, -1, 'no encontré nadaQueSumar en nube-crm.js');
    const caja = { N: NUBE, lista: v => (Array.isArray(v) ? v : []),
                   objeto: v => ((v && typeof v === 'object' && !Array.isArray(v)) ? v : {}) };
    vm.createContext(caja);
    vm.runInContext(src.slice(i, src.indexOf('\n  }\n', i) + 4), caja);
    const { computador, celular } = lados();
    assert.equal(caja.nadaQueSumar(copia(computador), copia(celular)), false,
      'la nube trae un abono que el pacto de acá no conoce: la subida no puede heredar su revisión');
    assert.equal(caja.nadaQueSumar(copia(celular), copia(computador)), false);
    assert.equal(caja.nadaQueSumar(copia(computador), copia(computador)), true, 'lo idéntico sigue sin choque');
  }

  /* LA EXCEPCIÓN: si el lado sin pacto no anotó nada que el pacto no
     conociera y no hay otro campo en discusión, ese lado va atrás y el pacto
     entra sin choque (con choque, Joan aprende a tocar «lo mío» sin leer). */
  function nadaQueDecidir() {
    /* Pacto del mismo día con otro monto (el corte no se mueve) y un celular
       que solo anotó un comprobante. */
    const base = conAbonoYProrroga(credito());
    const computador = pactar(copia(base), { fecha: CRM_FECHA, monto: 290000 }, '2026-11-02');
    const celular = copia(base);
    celular.comprobantes = celular.comprobantes.concat([{ fecha: '2026-11-03', tipo: 'otro', monto: 0 }]);
    const f = NUBE.fusionarFila(copia(celular), copia(computador));
    assert.deepEqual(f.pisables, []);
    assert.deepEqual(f.fila.planPagos, computador.planPagos);
    assert.equal(P.liquidarCiclo(f.fila, CRM_FECHA).total_a_pagar, 290000);
    /* Del otro lado, el plan es «un campo que solo tengo yo» —el pisable de
       siempre, sin nada de allá que pisar— y no hay choque del pago acordado. */
    const g = NUBE.fusionarFila(copia(computador), copia(celular));
    assert.ok(!g.pisables.some(x => x.campo === 'pagoAcordado'));
    assert.ok(g.pisables.every(x => x.suyo === undefined));
    assert.deepEqual(g.fila.planPagos, computador.planPagos);
  }

  test('el celular: la tarjeta dice lo que hace cada botón, y los dos botones hacen eso: ninguno cobra dos veces', () => {
    const { e, computador, celular } = lados();
    choqueEnElCelular(e, celular, computador);
    const t = plano(e.ev('bloqueChoques()'));
    assert.match(t, /El pago acordado no se junta con lo que no conocía\. Con Mandar lo mío encima queda lo de este celular \(sin pago acordado: abono 05 de nov de 2026 \$50\.000\) y lo de la nube \(pago acordado \$280\.000 el 20 de nov de 2026\) no entra\./);
    assert.match(t, /Con Dejar lo de la nube es al revés: queda lo de la nube y lo de este celular no entra\./);
    assert.ok(!/Los pagos de las cuotas no se juntan/.test(t), 'le habló de cuotas a un pago acordado');
    e.tocar('choque-mio', { i: '0' });
    const q = e.json('DB.prestamos[0]');
    assert.ok(!q.planPagos, 'con «lo mío» entró el pacto de la nube');
    assert.deepEqual(q.abonosCapital.map(a => a.monto), [375000, 50000]);
    assert.equal(capitalQueCobra(q), PRESTADO);
    const sube = e.json('COLA').filter(c => c.id === 'c1')[0];
    assert.ok(sube && !sube.datos.planPagos, 'a la nube sube la misma versión');
    /* Y «Dejar lo de la nube» deja el pacto entero, sin el abono que no conocía. */
    const otra = lados();
    choqueEnElCelular(otra.e, otra.celular, otra.computador);
    otra.e.tocar('choque-nube', { i: '0' });
    const n = otra.e.json('DB.prestamos[0]');
    assert.ok(P.esPacto(n));
    assert.deepEqual(n.abonosCapital.map(a => a.monto), [375000]);
    assert.equal(capitalQueCobra(n), PRESTADO);
  });

  test('subir.html: «Dejar lo de la nube» (la del celular) no mete el pacto, y su texto lo dice', () => {
    const { computador, celular } = lados();
    const S = abrirSubir();
    S.choque(computador, celular);
    const nube = S.loDeLaNube();
    assert.match(nube, /El pago acordado no se junta con lo que no conocía: queda lo de la nube \(sin pago acordado: abono 5 nov 2026 \$50\.000\) y lo de este computador \(pago acordado \$280\.000 el 20 nov 2026\) no entra\./);
    const conLaNube = S.conLaNube();
    assert.equal(conLaNube.planPagos, undefined, 'fusionarConLoMio metió el pacto que el texto dice que no entra');
    assert.equal(capitalQueCobra(conLaNube), PRESTADO);
    const mio = S.loMio();
    assert.match(mio, /queda lo de este computador \(pago acordado \$280\.000 el 20 nov 2026\) y lo de la nube \(sin pago acordado: abono 5 nov 2026 \$50\.000\) no entra/);
    const conLoMio = S.conLoMio();
    assert.ok(P.esPacto(conLoMio));
    assert.equal(capitalQueCobra(conLoMio), PRESTADO);
    /* Y la tarjeta enseña los dos lados en la misma línea. */
    assert.match(S.tarjeta(), /pago acordado pago acordado \$280\.000 el 20 nov 2026 .*pago acordado sin pago acordado: abono 5 nov 2026 \$50\.000/);
  });
});

/* ==========================================================================
 * N2 — LA PRÓRROGA QUE EL PACTO NO CONOCÍA
 * ======================================================================== */
describe('N2 · una prórroga del otro lado no se suma callada a un pago acordado', () => {

  /* El 28-oct Joan acuerda 780.000 el 20-nov (costo 155.000 por todo el
     tramo). El 31-oct el celular, con la copia vieja, cobra la prórroga. */
  function lados() {
    const base = credito();
    const computador = pactar(copia(base), { fecha: SUYA, monto: 780000 }, '2026-10-28');
    const e = abrirEspejo({ cartera: cartera([copia(base)]), ahora: '2026-10-31T10:30:00' });
    e.ev("prorrogar('c1', '2026-10-31')");
    const celular = e.json('DB.prestamos[0]');
    assert.equal(celular.prorrogas.length, 1, 'el celular cobró la prórroga');
    assert.equal(celular.prorrogas[0].monto, 125000);
    return { e, computador, celular };
  }

  test('el celular elige lo suyo: queda la prórroga sin el pacto, y el corte es el 17-nov que dijo la tarjeta', () => {
    const { e, computador, celular } = lados();
    choqueEnElCelular(e, celular, computador);
    e.ev('_choqueAbierto = 0');
    const t = plano(e.ev('bloqueChoques()'));
    assert.match(t, /Corte vigente 17 de nov de 2026/);
    assert.match(t, /queda lo de este celular \(sin pago acordado: prórroga 31 de oct de 2026 \$125\.000\) y lo de la nube \(pago acordado \$780\.000 el 20 de nov de 2026\) no entra/);
    e.tocar('choque-mio', { i: '0' });
    const q = e.json('DB.prestamos[0]');
    assert.ok(!q.planPagos, 'el pacto entró callado junto con la prórroga');
    assert.equal(P.corteDelCredito(q), CRM_FECHA, 'la tarjeta prometió el 17-nov');
    const g = P.gananciaDelCredito(q);
    assert.equal(g.cobrado, 125000);
    assert.equal(g.cobrado + g.pendiente, 250000, 'dos quincenas al 20%, nada cobrado dos veces');
  });

  test('el pacto que se queda no trae la prórroga que no conocía: cobra lo que Joan acordó', () => {
    const { computador, celular } = lados();
    const g = NUBE.fusionarFila(copia(computador), copia(celular));
    assert.ok(P.esPacto(g.fila));
    assert.deepEqual(g.fila.prorrogas, [], 'la prórroga del celular se sumó al pacto');
    assert.equal(P.liquidarCiclo(g.fila, SUYA).total_a_pagar, 780000);
    assert.equal(P.gananciaDelCredito(g.fila).ganancia, 155000, 'el período se cobra una vez');
    const pa = g.pisables.find(x => x.campo === 'pagoAcordado');
    assert.equal(pa.suyo, 'sin pago acordado: prórroga 2026-10-31 $125000');
    /* subir.html, con el computador eligiendo lo suyo: lo mismo. */
    const S = abrirSubir();
    S.choque(computador, celular);
    assert.deepEqual(S.conLoMio().prorrogas, []);
    assert.match(S.loMio(), /lo de la nube \(sin pago acordado: prórroga 31 oct 2026 \$125\.000\) no entra/);
    assert.equal(S.conLaNube().planPagos, undefined);
  });

  test('una prórroga con su perdón de mora: el perdón se va con ella', () => {
    const { computador, celular } = lados();
    const otro = copia(celular);
    otro.condonaciones = [{ fecha: '2026-10-31', costo: 0, mora: 3000, motivo: 'x', sobre: 'prorroga' }];
    const g = NUBE.fusionarFila(copia(computador), otro);
    assert.deepEqual(g.fila.condonaciones || [], [], 'quedó el perdón de una prórroga que no está');
  });
});

/* ==========================================================================
 * N3 — EL PERDÓN DE CAPITAL VA ATADO A SU PACTO
 * ======================================================================== */
describe('N3 · el perdón de capital existe solo mientras su pacto sea el vigente', () => {

  test('el celular cobró «Pagó todo» y Joan elige el cobro: el perdón del pacto que perdió no resta nada', () => {
    const base = credito();
    const computador = pactar(copia(base), { fecha: SUYA, monto: 600000, motivo: 'se le murió el papá' }, '2026-10-25');
    assert.equal(P.capitalPerdonadoDe(computador), 25000);
    const e = abrirEspejo({ cartera: cartera([copia(base)]), ahora: '2026-10-31T10:30:00' });
    e.ev("cobrar('c1', '2026-10-31')");
    const celular = e.json('DB.prestamos[0]');
    assert.equal(celular.pagado, true);
    choqueEnElCelular(e, celular, computador);
    e.tocar('choque-mio', { i: '0' });
    const q = e.json('DB.prestamos[0]');
    assert.equal(q.pagado, true);
    assert.equal(P.capitalPerdonadoDe(q), 0);
    assert.equal(P.capitalRecuperadoDe(q), PRESTADO, 'entraron los 625.000');
    assert.deepEqual([P.gananciaDelCredito(q).ganancia, P.gananciaDelCredito(q).pct], [125000, 20]);
    assert.deepEqual(P.descuentosDelSocio(cartera([q]), { id: 's1' }), { veces: 0, monto: 0, costo: 0, mora: 0 });
    /* Y en el computador, «Dejar lo de la nube» (la del celular): igual. */
    const S = abrirSubir();
    S.choque(computador, celular);
    const n = S.conLaNube();
    assert.equal(P.capitalRecuperadoDe(n), PRESTADO);
    assert.equal(P.gananciaDelCredito(n).ganancia, 125000);
  });

  test('una condonación de capital sin su pacto en el plan es un perdón que no existe', () => {
    /* Como la dejaba la nube antes de esta revisión: la lista suma, el plan no. */
    const conPacto = pactar(credito(), { fecha: SUYA, monto: 600000, motivo: 'x' }, '2026-10-25');
    const huerfano = Object.assign(credito({ pagado: true, fechaPagado: DIA, cicloPago: DIA, gananciaPago: 125000,
      montoRecibido: 750000 }), { condonaciones: copia(conPacto.condonaciones) });
    assert.equal(P.capitalPerdonadoDe(huerfano), 0);
    assert.equal(P.capitalRecuperadoDe(huerfano), PRESTADO);
    assert.equal(P.gananciaDelCredito(huerfano).ganancia, 125000);
    assert.deepEqual(P.descuentosDelSocio(cartera([huerfano]), { id: 's1' }).monto, 0);
  });

  test('dos pactos distintos: gana un plan y cuenta SU perdón, no los dos', () => {
    const base = conAbonoYProrroga(credito());
    const a = pactar(copia(base), { fecha: SUYA, monto: 240000, motivo: 'diez' }, '2026-11-02');
    const b = pactar(copia(base), { fecha: SUYA, monto: 230000, motivo: 'veinte' }, '2026-11-02');
    const f = NUBE.fusionarFila(copia(a), copia(b));
    assert.deepEqual(f.fila.planPagos, a.planPagos);
    assert.deepEqual(f.fila.condonaciones.map(c => c.capital), [10000]);
    assert.equal(P.capitalActual(f.fila), 240000);
    assert.equal(P.liquidarCiclo(f.fila, SUYA).total_a_pagar, 240000, 'la cuota y el capital dicen lo mismo');
    assert.ok(f.pisables.some(x => x.campo === 'pagoAcordado' &&
      /\$240000 el 2026-11-20, perdonando \$10000/.test(x.mio) && /\$230000 el 2026-11-20, perdonando \$20000/.test(x.suyo)));
    /* Aunque la lista traiga los dos perdones, cuenta el del plan vigente. */
    const union = Object.assign(copia(a), { condonaciones: a.condonaciones.concat(b.condonaciones) });
    assert.equal(P.capitalPerdonadoDe(union), 10000);
    assert.equal(P.capitalActual(union), 240000);
    assert.equal(P.descuentosDelSocio(cartera([union]), { id: 's1' }).monto, 10000);
  });
});

/* ==========================================================================
 * N4 — DOS PERDONES IGUALES DEL MISMO DÍA SON DOS
 * ======================================================================== */
describe('N4 · cada perdón de un pacto lleva su id, y dos iguales del mismo día no se funden', () => {

  function dosVeces() {
    const base = conAbonoYProrroga(credito());
    const uno = pactar(copia(base), { fecha: SUYA, monto: 240000, motivo: 'uno' }, DIA);
    const dos = pactar(copia(uno), { fecha: SUYA, monto: 230000, motivo: 'dos' }, DIA);
    return { uno, dos };
  }

  test('los dos perdones de 10.000 tienen ids distintos, atados a su cambio del plan', () => {
    const { dos } = dosVeces();
    assert.equal(dos.condonaciones.length, 2);
    assert.notEqual(dos.condonaciones[0].id, dos.condonaciones[1].id);
    assert.deepEqual(dos.condonaciones.map(c => c.id), dos.planPagos.cambios.map(c => c.id));
    assert.deepEqual(P.perdonesDeCapital(dos).map(x => [x.capital, x.motivo]), [[10000, 'uno'], [10000, 'dos']]);
    assert.equal(P.capitalActual(dos), 230000);
  });

  test('ninguna fusión los junta: ni contra sí mismo, ni «lo mío» contra la versión del primer pacto', () => {
    const { uno, dos } = dosVeces();
    const g = NUBE.fusionarFila(copia(dos), copia(dos));
    assert.equal(g.fila.condonaciones.length, 2);
    const f = NUBE.fusionarFila(copia(dos), copia(uno));
    assert.equal(f.fila.condonaciones.length, 2);
    assert.equal(P.capitalActual(f.fila), 230000);
    assert.equal(P.liquidarCiclo(f.fila, SUYA).total_a_pagar, 230000);
    /* Volver a pactar después de la fusión cuadra. */
    const r = P.pactarProximoPago(cartera([f.fila]), f.fila, { fecha: SUYA, monto: 220000, motivo: 'tres' }, DIA);
    assert.equal(r.ok, true, r.detalle);
    /* Y el lado del primer pacto se queda con UN perdón, el suyo, y cuadra. */
    const h = NUBE.fusionarFila(copia(uno), copia(dos));
    assert.equal(h.fila.condonaciones.length, 1);
    assert.equal(P.capitalActual(h.fila), 240000);
    assert.equal(P.liquidarCiclo(h.fila, SUYA).total_a_pagar, 240000);
  });

  test('subir.html y nube.js le ponen el id a la identidad de las condonaciones; las viejas no cambian', () => {
    assert.deepEqual(NUBE.LISTAS_QUE_SUMAN.condonaciones, ['fecha', 'costo', 'mora', 'capital', 'id']);
    const S = abrirSubir();
    assert.deepEqual(JSON.parse(S.ev('JSON.stringify(LISTAS_QUE_SUMAN.creditos.condonaciones)')),
      ['fecha', 'costo', 'mora', 'capital', 'id']);
    const vieja = { fecha: DIA, costo: 5000, mora: 2000, motivo: 'a' };
    const f = NUBE.fusionarFila({ id: 'c1', condonaciones: [vieja] }, { id: 'c1', condonaciones: [Object.assign({}, vieja, { motivo: 'b' })] });
    assert.equal(f.fila.condonaciones.length, 1, 'el mismo perdón viejo, anotado en los dos lados, es uno');
    /* «Mandar lo mío encima» del computador con los dos perdones: quedan los dos. */
    const { uno, dos } = dosVeces();
    S.choque(dos, uno);
    assert.equal(S.conLoMio().condonaciones.length, 2);
  });
});

/* ==========================================================================
 * N5 — EL CELULAR CUENTA LOS DESCUENTOS CON EL PUENTE
 * ======================================================================== */
describe('N5 · el celular dice los descuentos del cliente con la cuenta del puente', () => {

  test('un perdón de 10.000 de capital: «Ya lleva 1 descuento(s) por $10.000», como el CRM', () => {
    const c1 = pactar(conAbonoYProrroga(credito()), { fecha: SUYA, monto: 240000, motivo: 'uno' }, DIA);
    const c2 = credito({ id: 'c2', numero: 8, capital: 200000, fechaDesembolso: '2026-10-20', cicloActual: '2026-11-04' });
    const db = cartera([c1, c2]);
    const e = abrirEspejo({ cartera: db, ahora: '2026-11-04T10:30:00' });
    const d = e.json("descuentosDelSocio(socioDe(creditoPorId('c2')))");
    assert.deepEqual(d, P.descuentosDelSocio(db, db.socios[0]));
    assert.equal(d.monto, 10000);
    /* En la hoja de cobro de verdad, con 5.000 menos y «Se lo perdoné». */
    e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
    e.ev("abrirCobro('c2')");
    const total = e.ev("Math.round(liq(creditoPorId('c2'), '2026-11-04').total_a_pagar)");
    e.ev("_cobro.monto = " + (total - 5000) + "; _cobro.modo = 'perdon'; pintarDif('c2')");
    assert.match(plano(e.elems.pgDif.innerHTML), /Ya lleva 1 descuento\(s\) por \$10\.000\./);
  });

  test('el celular ya no tiene su copia de la cuenta', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'panel', 'espejo.html'), 'utf8').replace(/\r\n/g, '\n');
    const i = src.indexOf('\nfunction descuentosDelSocio(');
    const cuerpo = src.slice(i, src.indexOf('\n}\n', i));
    assert.match(cuerpo, /return P\.descuentosDelSocio\(DB, s\);/);
    assert.ok(!/condonaciones/.test(cuerpo), 'volvió la copia de la cuenta en el celular');
  });
});

/* ==========================================================================
 * N6 — LA TARJETA DICE EL ACUERDO VIGENTE (23-oct-2026)
 *
 * La revisión de plata del 23-oct: después de un abono y de volver a acordar,
 * la tarjeta del choque decía `cuota.total` como «pago acordado». Al volver a
 * acordar, la cuota guarda su costo como lo ya pagado en abonos + lo que se
 * cobra ese día, y su capital sin restar lo abonado: Joan acordaba 200.000 y
 * leía «pago acordado $300.000» justo en el texto con el que elige lado. Con
 * perdón, «$220.000» de un pago de 120.000. Estas pruebas fallan contra
 * 1c9bdcd y miden cada monto contra lo que el puente cobra ese día.
 * ======================================================================== */
describe('N6 · la tarjeta del choque dice el pago acordado vigente, y lo que falta si ya abonó', () => {

  const NUEVA = '2026-11-26';
  /* El 2-nov Joan acuerda 280.000 el 20-nov (o 240.000 perdonando 10.000). */
  function base(monto, motivo) {
    return pactar(conAbonoYProrroga(credito()), { fecha: SUYA, monto: monto || 280000, motivo }, '2026-11-02');
  }
  /* El computador anota un abono a la cuota (lo que guarda «¿Cuánto pagó?»). */
  function abonar(p, dia, monto) {
    const r = P.abonoACuota(p, dia, monto);
    assert.equal(r.ok, true, r.detalle);
    p.abonosCapital.push(r.registros.abono);
    return p;
  }
  /* El celular, con la copia del primer acuerdo, cobra el pago completo. */
  function celularCobra(b) {
    const e = abrirEspejo({ cartera: cartera([copia(b)]), ahora: '2026-11-10T10:30:00' });
    e.ev("cobrar('c1', '2026-11-10')");
    const cel = e.json('DB.prestamos[0]');
    assert.equal(cel.planPagos.cuotas[0].pagado, true, 'el celular no cobró: la prueba no estaría mirando nada');
    return { e, cel };
  }
  const lado = (f, cual) => f.pisables.find(x => x.campo === 'pagoAcordado')[cual];

  test('abono de 100.000 y nuevo acuerdo de 200.000: la tarjeta dice 200.000, lo que el cliente paga ese día', () => {
    const b = base();
    const comp = pactar(abonar(copia(b), '2026-11-10', 100000), { fecha: NUEVA, monto: 200000 }, '2026-11-10');
    assert.equal(comp.planPagos.cuotas[0].total, 300000, 'la cuota guarda lo ya abonado: es lo que confundía a la tarjeta');
    assert.equal(P.liquidarCiclo(comp, NUEVA).total_a_pagar, 200000);
    const { e, cel } = celularCobra(b);
    const f = NUBE.fusionarFila(copia(comp), copia(cel));
    assert.equal(lado(f, 'mio'), 'pago acordado $200000 el ' + NUEVA);
    assert.equal(lado(f, 'suyo'), 'pago acordado $280000 el ' + SUYA + ' (ya pagado)');
    const g = NUBE.fusionarFila(copia(cel), copia(comp));
    assert.deepEqual([lado(g, 'mio'), lado(g, 'suyo')], [lado(f, 'suyo'), lado(f, 'mio')], 'los dos órdenes dicen lo mismo');
    /* subir.html, eligiendo lo del computador, y el celular, con su tarjeta.
       La fila «planPagos» sigue diciendo el total de la CUOTA (300.000, con
       los 100.000 ya abonados en su propia fila): es la cuenta de la cuota,
       no el pago acordado. Lo que se mira es el texto del pago acordado. */
    const S = abrirSubir();
    S.choque(copia(comp), copia(cel));
    assert.match(S.loMio(), /queda lo de este computador \(pago acordado \$200\.000 el 26 nov 2026\) y lo de la nube/);
    assert.ok(!/\$300\.000/.test(S.loMio()), 'el texto de «lo mío» dijo el total de la cuota como pago acordado');
    assert.match(S.loDeLaNube(), /queda lo de la nube \(pago acordado \$280\.000 el 20 nov 2026 \(ya pagado\)\) y lo de este computador \(pago acordado \$200\.000 el 26 nov 2026\) no entra/);
    assert.match(S.tarjeta(), /pago acordado pago acordado \$200\.000 el 26 nov 2026 /);
    choqueEnElCelular(e, cel, comp);
    const t = plano(e.ev('bloqueChoques()'));
    const frase = t.slice(t.indexOf('El pago acordado no se junta'), t.indexOf('no entra.', t.indexOf('El pago acordado no se junta')));
    assert.match(frase, /lo de la nube \(pago acordado \$200\.000 el 26 de nov de 2026\) $/);
    assert.ok(!/\$300\.000/.test(frase), 'la tarjeta del celular dijo el total de la cuota como pago acordado');
  });

  test('con perdón en los dos acuerdos: 120.000 perdonando 30.000, no «$220.000»', () => {
    const b = base(240000, 'diez');
    const comp = pactar(abonar(copia(b), '2026-11-10', 100000), { fecha: NUEVA, monto: 120000, motivo: 'veinte' }, '2026-11-10');
    assert.equal(P.liquidarCiclo(comp, NUEVA).total_a_pagar, 120000);
    assert.equal(P.capitalPerdonadoDe(comp), 30000);
    const { cel } = celularCobra(b);
    const f = NUBE.fusionarFila(copia(comp), copia(cel));
    assert.equal(lado(f, 'mio'), 'pago acordado $120000 el ' + NUEVA + ', perdonando $30000 de capital');
    /* Y sin cobro del otro lado: cualquier cambio a la par basta para el choque. */
    const otro = copia(b);
    otro.comprobantes = [{ fecha: '2026-11-09', tipo: 'otro', monto: 0 }];
    otro.notas = 'llamó';
    const h = NUBE.fusionarFila(copia(comp), otro);
    assert.equal(lado(h, 'mio'), 'pago acordado $120000 el ' + NUEVA + ', perdonando $30000 de capital');
  });

  test('un abono después del acuerdo, sin volver a acordar: el acuerdo, lo que ya entró y lo que falta', () => {
    const b = base();
    const comp = abonar(copia(b), '2026-11-10', 100000);
    const falta = P.liquidarCiclo(comp, SUYA).total_a_pagar;
    assert.equal(falta, 180000);
    const { cel } = celularCobra(b);
    const f = NUBE.fusionarFila(copia(comp), copia(cel));
    assert.equal(lado(f, 'mio'), 'pago acordado $280000 el ' + SUYA + '; ya abonó $100000 y faltan $' + falta);
    const S = abrirSubir();
    S.choque(copia(comp), copia(cel));
    assert.match(S.loMio(), /queda lo de este computador \(pago acordado \$280\.000 el 20 nov 2026; ya abonó \$100\.000 y faltan \$180\.000\)/);
  });

  test('abono, nuevo acuerdo y otro abono: cuenta solo lo que entró después del acuerdo vigente', () => {
    const b = base();
    const comp = pactar(abonar(copia(b), '2026-11-10', 100000), { fecha: NUEVA, monto: 200000 }, '2026-11-10');
    abonar(comp, '2026-11-15', 50000);
    const falta = P.liquidarCiclo(comp, NUEVA).total_a_pagar;
    assert.equal(falta, 150000);
    const { cel } = celularCobra(b);
    const f = NUBE.fusionarFila(copia(comp), copia(cel));
    assert.equal(lado(f, 'mio'), 'pago acordado $200000 el ' + NUEVA + '; ya abonó $50000 y faltan $' + falta);
  });
});

/* ==========================================================================
 * N7 — UN ABONO QUE LOS DOS LADOS YA TIENEN NO ES PLATA QUE «NO ENTRA»
 * (23-oct-2026)
 *
 * La lente de abonos de la revisión del 23-oct, contra 7793481: el 2-nov se
 * acuerdan 280.000 para el 20-nov; el 10-nov entra un abono A de 100.000 a la
 * cuota y los DOS aparatos lo tienen (mismo plan: la lista suma); el 12-nov el
 * computador vuelve a acordar 200.000 para el 26-nov, y el otro CRM, con el
 * primer acuerdo, cambia cualquier cosa (o anota un abono B de 50.000). La
 * tarjeta del lado del primer acuerdo decía «ya abonó $100.000 (o $150.000) y
 * faltan…» DENTRO de lo que «no entra», y pedía volver a anotar «esa plata».
 * Pero A está en los dos lados y se queda con cualquiera de los dos botones:
 * si Joan lo volvía a anotar, el 26-nov la cuenta pedía 100.000 de menos.
 * Estas pruebas corren el puente, NUBE.fusionarFila, subir.html y la tarjeta
 * del celular de verdad, y miden lo que cada botón deja contra liquidarCiclo.
 * ======================================================================== */
describe('N7 · un abono que los dos lados ya tienen no se cuenta como «ya abonó» ni se pide volver a anotar', () => {

  const NUEVA = '2026-11-26';
  function abonar(p, dia, monto) {
    const r = P.abonoACuota(p, dia, monto);
    assert.equal(r.ok, true, r.detalle);
    p.abonosCapital.push(r.registros.abono);
    return p;
  }
  /* comp: el computador, que vuelve a acordar el 12-nov. otro: el otro CRM,
     con el primer acuerdo y el abono A; con `conB`, anota además B. */
  function lados(conB) {
    const conA = abonar(pactar(conAbonoYProrroga(credito()), { fecha: SUYA, monto: 280000 }, '2026-11-02'),
      '2026-11-10', 100000);
    const comp = pactar(copia(conA), { fecha: NUEVA, monto: 200000 }, '2026-11-12');
    const otro = copia(conA);
    if (conB) abonar(otro, '2026-11-13', 50000);
    else { otro.notas = 'llamó el 13-nov'; otro.comprobantes = [{ fecha: '2026-11-13', tipo: 'otro', monto: 0 }]; }
    assert.equal(P.liquidarCiclo(comp, NUEVA).total_a_pagar, 200000);
    return { comp, otro };
  }
  const lado = (f, cual) => f.pisables.find(x => x.campo === 'pagoAcordado')[cual];
  const conA = f => f.abonosCapital.filter(a => a.cuotaPlan && a.fecha === '2026-11-10' && a.recibido === 100000).length;
  /* El aviso del pago acordado en la tarjeta del celular, solo. */
  function avisoDelCelular(mio, suyo) {
    const e = abrirEspejo({ cartera: cartera([copia(mio)]), ahora: '2026-11-13T10:30:00' });
    choqueEnElCelular(e, mio, suyo);
    const h = String(e.ev('bloqueChoques()'));
    const i = h.indexOf('El pago acordado no se junta');
    assert.ok(i >= 0, 'la tarjeta del celular no habló del pago acordado: la prueba no estaría mirando nada');
    return plano(h.slice(i, h.indexOf('</div>', i)));
  }

  test('sin otro abono: el lado del primer acuerdo dice lo que falta y que el abono está en los dos lados', () => {
    const { comp, otro } = lados(false);
    const f = NUBE.fusionarFila(copia(comp), copia(otro));
    assert.equal(lado(f, 'mio'), 'pago acordado $200000 el ' + NUEVA);
    assert.equal(lado(f, 'suyo'), 'pago acordado $280000 el ' + SUYA +
      '; faltan $180000 (los $100000 abonados también los tiene el otro lado y se quedan con los dos)');
    assert.equal(P.liquidarCiclo(otro, SUYA).total_a_pagar, 180000, 'lo que falta es lo que ese lado cobra');
    const g = NUBE.fusionarFila(copia(otro), copia(comp));
    assert.deepEqual([lado(g, 'mio'), lado(g, 'suyo')], [lado(f, 'suyo'), lado(f, 'mio')], 'los dos órdenes dicen lo mismo');

    /* subir.html: el texto de «lo mío» no mete los 100.000 en «ya abonó», y
       dice que lo que tienen los dos lados se queda. Y es verdad: con los dos
       botones A sigue en la cuota y la cuenta cuadra. */
    const S = abrirSubir();
    S.choque(copia(comp), copia(otro));
    const t = S.loMio();
    assert.ok(!/ya abonó/.test(t), 'dijo «ya abonó» de un abono que los dos lados tienen: ' + t);
    assert.match(t, /lo de la nube \(pago acordado \$280\.000 el 20 nov 2026; faltan \$180\.000 \(los \$100\.000 abonados también los tiene el otro lado y se quedan con los dos\)\) no entra\./);
    assert.match(t, /Lo abonado que tienen los dos lados se queda con cualquiera de las dos\. Si la plata que solo trae la nube entró de verdad, vuelve a anotarla después/);
    assert.ok(!/Si esa plata entró de verdad, vuelve a anotarla después y vuelve a acordar/.test(t),
      'la instrucción de volver a anotar no puede quedar suelta detrás de un abono que se queda');
    const mio = S.conLoMio();
    assert.equal(conA(mio), 1, 'con «lo mío» el abono A se queda');
    assert.equal(P.liquidarCiclo(mio, NUEVA).total_a_pagar, 200000);
    const nube = S.conLaNube();
    assert.equal(conA(nube), 1, 'con «lo de la nube» también');
    assert.equal(P.liquidarCiclo(nube, SUYA).total_a_pagar, 180000);
    assert.match(S.loDeLaNube(), /Lo abonado que tienen los dos lados se queda con cualquiera de las dos\. Si la plata que solo trae este computador entró de verdad/);

    /* El celular, del lado del primer acuerdo: lo mismo con sus botones. */
    const a = avisoDelCelular(otro, comp);
    assert.ok(!/ya abonó/.test(a), 'el celular dijo «ya abonó» de un abono que los dos lados tienen: ' + a);
    assert.match(a, /faltan \$\s?180\.000 \(los \$\s?100\.000 abonados también los tiene el otro lado y se quedan con los dos\)/);
    assert.match(a, /Lo abonado que tienen los dos lados se queda con cualquiera de los dos botones\. Si la plata que solo trae el lado que no queda entró de verdad/);
  });

  test('con un abono B de 50.000 solo de un lado: «ya abonó» dice ese, y volver a anotarlo deja la cuenta bien', () => {
    const { comp, otro } = lados(true);
    const falta = P.liquidarCiclo(otro, SUYA).total_a_pagar;
    assert.equal(falta, 130000);
    const f = NUBE.fusionarFila(copia(comp), copia(otro));
    assert.equal(lado(f, 'suyo'), 'pago acordado $280000 el ' + SUYA + '; ya abonó $50000 y faltan $' + falta +
      ' (los otros $100000 abonados también los tiene el otro lado y se quedan con los dos)');
    const S = abrirSubir();
    S.choque(copia(comp), copia(otro));
    const t = S.loMio();
    assert.ok(!/ya abonó \$150\.000/.test(t), 'contó como «ya abonó» el abono que los dos lados tienen: ' + t);
    assert.match(t, /ya abonó \$50\.000 y faltan \$130\.000 \(los otros \$100\.000 abonados también los tiene el otro lado y se quedan con los dos\)/);
    /* Lo que de verdad deja «lo mío»: A sí, B no. Si Joan hace lo que dice la
       tarjeta y vuelve a anotar SOLO los 50.000 de B, el 26-nov se cobra lo
       que falta de verdad: 300.000 de la cuota menos 150.000 que entraron. */
    const mio = S.conLoMio();
    assert.equal(conA(mio), 1);
    assert.equal(mio.abonosCapital.filter(a => a.cuotaPlan && a.fecha === '2026-11-13').length, 0, 'B no entra con «lo mío»');
    assert.equal(P.liquidarCiclo(mio, NUEVA).total_a_pagar, 200000);
    assert.equal(P.liquidarCiclo(abonar(copia(mio), '2026-11-14', 50000), NUEVA).total_a_pagar, 150000);

    const a = avisoDelCelular(otro, comp);
    assert.match(a, /ya abonó \$\s?50\.000 y faltan \$\s?130\.000 \(los otros \$\s?100\.000 abonados/);
    assert.ok(!/ya abonó \$\s?150\.000/.test(a));
  });
});

/* ==========================================================================
 * N8 — EL ESPEJO NUEVO CON EL nube.js DE ANTES DE LOS PACTOS (23-oct-2026)
 *
 * La regla de arriba vive en panel/nube.js, y lo que llega a un teléfono no
 * siempre viaja junto: con señal floja el sw.js v138 contesta de su caché el
 * nube.js de main (8323fc0), y espejo.html nuevo corre con él hasta que se
 * recargue (actualizar.js no avisa: las dos son v139). Ese fusionarFila copia
 * a «lo mío» el pago acordado del otro lado y le suma lo que el pacto no
 * conocía: con «Mandar lo mío encima», N1 quedaba en 675.000 de capital por
 * 625.000 prestados y N2 cobraba la prórroga y el pacto juntos, y la cola lo
 * subía a la nube. Ahora la página pregunta NUBE.PACTOS y, sin él, no decide
 * un choque con pago acordado: dice que se recargue. Fallan contra 9d49c18.
 * ======================================================================== */
const { execFileSync } = require('node:child_process');
const RAIZ = path.join(__dirname, '..');

/* El nube.js que está hoy en el sitio, sacado de la historia. Sin ella (un
   checkout de profundidad 1, como el de vigilar.yml) se arma con el de hoy
   sin su PACTOS: no repite la fusión de antes —la cuenta de plata se mira
   solo con el archivo de verdad—, pero sí la pregunta que hacen las páginas. */
function nubeDeAntes() {
  try {
    const codigo = execFileSync('git', ['show', '8323fc0:panel/nube.js'],
      { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 });
    if (/function fusionarFila\(/.test(codigo)) return { codigo, deVerdad: true };
  } catch (e) { /* sin historia de git: abajo */ }
  const hoy = fs.readFileSync(path.join(RAIZ, 'panel', 'nube.js'), 'utf8');
  const codigo = hoy.replace(/\r?\n[ \t]*PACTOS:[ \t]*\d+,/, '');
  assert.notEqual(codigo, hoy, 'el nube.js de hoy no dice PACTOS: las páginas no tienen qué preguntarle');
  return { codigo, deVerdad: false };
}
function cargarNube(codigo) {
  const m = { exports: {} };
  new Function('module', 'exports', codigo)(m, m.exports);
  return m.exports;
}

describe('N8 · con el nube.js de antes de los pactos, un choque con pago acordado no se decide: se pide recargar', () => {
  /* Se pide dentro de cada prueba: si falta, falla la prueba y no la suite. */
  let _viejo = null;
  const viejo = () => (_viejo = _viejo || nubeDeAntes());
  const REGLAS_VIEJAS = /versión vieja de las reglas de la nube/;

  /* N1 en el celular con el nube.js de antes. El choque se guarda en disco,
     como lo deja nube.js al subir, para que vuelva después de recargar. */
  function ladosN1() {
    const base = conAbonoYProrroga(credito());
    const computador = pactar(copia(base), { fecha: SUYA, monto: 280000 }, '2026-11-02');
    const e = abrirEspejo({ cartera: cartera([copia(base)]), ahora: '2026-11-05T10:30:00',
                            archivos: { 'nube.js': viejo().codigo } });
    e.ev("abonarEnCalle('c1', 50000, '2026-11-05')");
    const celular = e.json('DB.prestamos[0]');
    assert.equal(celular.abonosCapital.length, 2, 'el celular anotó su abono');
    e.ev('NUBE.guardarChoques([' + JSON.stringify({ tabla: 'creditos', id: 'c1', mio: celular, suyo: computador,
      revision_servidor: 7, actualizado_por: 'computador', actualizado_en: '2026-11-05T15:00:00Z' }) + ']); recargarDeDisco()');
    return { e, computador, celular };
  }
  const subeConPacto = e => e.json('COLA').some(c => c.id === 'c1' && c.datos && c.datos.planPagos);

  test('el celular (N1): la tarjeta no ofrece decidir y dice que recargues; un toque igual no cambia nada', () => {
    const { e, computador, celular } = ladosN1();
    assert.equal(e.ev('NUBE.PACTOS'), undefined, 'el banco no cargó el nube.js de antes');
    if (viejo().deVerdad) {
      /* Lo que se frena, con el archivo de verdad: su fusión deja el pacto y
         el abono que el pacto no conocía, y cobra 50.000 dos veces. */
      const f = cargarNube(viejo().codigo).fusionarFila(copia(celular), copia(computador)).fila;
      assert.ok(P.esPacto(f));
      assert.equal(capitalQueCobra(f), PRESTADO + 50000);
    }
    const html = e.ev('bloqueChoques()');
    const t = plano(html);
    assert.match(t, REGLAS_VIEJAS);
    assert.match(t, /recarga la app con señal y vuelve a decidir este choque/);
    assert.match(t, /Nada se ha perdido/);
    assert.ok(!/Decide cuál queda/.test(t), 'pide decidir lo que no se puede decidir');
    assert.ok(!/data-acc="choque-(mio|nube|ver)"/.test(html), 'ofreció decidir con las reglas de antes');
    assert.match(html, /data-acc="choque-recargar"/);

    /* Un toque que llega de una tarjeta pintada antes, con los dos botones. */
    const antes = e.json('DB.prestamos[0]');
    e.tocar('choque-mio', { i: '0' });
    e.tocar('choque-nube', { i: '0' });
    const q = e.json('DB.prestamos[0]');
    assert.deepEqual(q, antes, 'cambió la ficha con las reglas de antes');
    assert.ok(!q.planPagos);
    assert.equal(capitalQueCobra(q), PRESTADO);
    assert.ok(!subeConPacto(e), 'la cola sube a la nube el pacto junto con el abono del celular');
    assert.equal(e.json('CHOQUES').length, 1, 'el choque se dio por resuelto');
    assert.equal(e.json('NUBE.leerChoques().filter(function (c) { return !c.resuelto_como; })').length, 1);
    assert.ok(e.avisos.some(a => REGLAS_VIEJAS.test(a)), 'el toque no dijo por qué no hizo nada');
  });

  test('…y al recargar con el nube.js de hoy el mismo choque vuelve y se decide bien: ni un peso dos veces', () => {
    const { e } = ladosN1();
    e.tocar('choque-mio', { i: '0' });
    const r = abrirEspejo({ almacen: e.almacen, ahora: '2026-11-05T16:00:00' });
    assert.equal(r.ev('NUBE.PACTOS'), 1);
    assert.equal(r.json('CHOQUES').length, 1, 'el choque no volvió después de recargar');
    const html = r.ev('bloqueChoques()');
    assert.ok(!REGLAS_VIEJAS.test(plano(html)));
    assert.match(plano(html), /El pago acordado no se junta con lo que no conocía/);
    r.tocar('choque-mio', { i: '0' });
    const q = r.json('DB.prestamos[0]');
    assert.ok(!q.planPagos, 'con «lo mío» entró el pacto de la nube');
    assert.deepEqual(q.abonosCapital.map(a => a.monto), [375000, 50000]);
    assert.equal(capitalQueCobra(q), PRESTADO);
  });

  test('el celular (N2): la prórroga que el pacto no conocía tampoco se junta con las reglas de antes', () => {
    const base = credito();
    const computador = pactar(copia(base), { fecha: SUYA, monto: 780000 }, '2026-10-28');
    const e = abrirEspejo({ cartera: cartera([copia(base)]), ahora: '2026-10-31T10:30:00',
                            archivos: { 'nube.js': viejo().codigo } });
    e.ev("prorrogar('c1', '2026-10-31')");
    const celular = e.json('DB.prestamos[0]');
    assert.equal(celular.prorrogas.length, 1, 'el celular cobró la prórroga');
    choqueEnElCelular(e, celular, computador);
    assert.ok(!/data-acc="choque-mio"/.test(e.ev('bloqueChoques()')), 'ofreció «lo mío» con las reglas de antes');
    e.tocar('choque-mio', { i: '0' });
    const q = e.json('DB.prestamos[0]');
    assert.ok(!q.planPagos, 'entró el pacto de 780.000 junto con la prórroga de 125.000');
    const g = P.gananciaDelCredito(q);
    assert.equal(g.cobrado + g.pendiente, 250000, 'el costo del tramo se cobra dos veces');
    assert.ok(!subeConPacto(e));
  });

  test('subir.html (el computador): con las reglas de antes no junta nada y la tarjeta dice que recargues', () => {
    const base = conAbonoYProrroga(credito());
    const computador = pactar(copia(base), { fecha: SUYA, monto: 280000 }, '2026-11-02');
    const e = abrirEspejo({ cartera: cartera([copia(base)]), ahora: '2026-11-05T10:30:00' });
    e.ev("abonarEnCalle('c1', 50000, '2026-11-05')");
    const celular = e.json('DB.prestamos[0]');
    const S = abrirSubir(cargarNube(viejo().codigo));
    S.choque(computador, celular);
    assert.match(S.tarjeta(), REGLAS_VIEJAS);
    assert.ok(!/decidir\(/.test(S.ev("tarjetaChoque(__it, 'b0')")), 'ofreció decidir con las reglas de antes');
    /* Si una decisión llega igual, aplicar no junta: «No apliqué nada». */
    assert.throws(() => S.conLoMio(), REGLAS_VIEJAS);
    assert.throws(() => S.conLaNube(), REGLAS_VIEJAS);
    /* Con el nube.js de hoy, la misma tarjeta sí deja decidir. */
    const H = abrirSubir();
    H.choque(computador, celular);
    assert.ok(!REGLAS_VIEJAS.test(H.tarjeta()));
    assert.match(H.ev("tarjetaChoque(__it, 'b0')"), /decidir\(/);
    assert.equal(capitalQueCobra(H.conLoMio()), PRESTADO);
  });
});
