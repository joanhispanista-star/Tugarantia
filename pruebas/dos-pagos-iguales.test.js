/* ===========================================================================
 * DOS PAGOS IGUALES SON DOS PAGOS — E1, 4-nov-2026
 *
 *   node --test pruebas/dos-pagos-iguales.test.js
 *
 * Medido el 3-nov con el nube.js y el puente.js de verdad: el abono suelto
 * (panel/crm.html abonarCapital, panel/espejo.html abonarEnCalle) no traía id y
 * fusionarListas quita los repetidos. Con 500.000 de capital, dos abonos de
 * 50.000 el mismo día —uno en cada aparato, o los dos en el mismo— quedaban en
 * uno al juntar la ficha: 450.000 de capital en vez de 400.000. El cliente pagó y
 * el libro dice que debe. Y la foto del segundo comprobante se iba con él.
 *
 * LA CURA: el abono suelto y su comprobante nacen con id.
 *
 * LOS ABONOS DE ANTES SE QUEDAN COMO ESTÁN. Son plata de clientes de verdad: no
 * se les pone id, no cambia su identidad, y un abono de antes en los dos aparatos
 * sigue siendo uno. Lo único que se agrega es para el rato en que conviven dos
 * versiones de la app: el mismo pago anotado con id de un lado y sin id del otro
 * no se puede volver dos.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const N = require('../panel/nube.js');
const P = require('../app/puente.js');
const { abrirPanel } = require('./banco-panel.js');
const { abrirEspejo } = require('./banco-espejo.js');

const clon = v => JSON.parse(JSON.stringify(v));
const RAIZ = path.join(__dirname, '..');
const HOY = '2026-11-03';
const base = () => ({ id: 'P1', numero: 3050, socioId: 'C1', socioNombre: 'Cliente Inventada', capital: 500000, costoPct: 20,
  fechaDesembolso: '2026-10-20', fechaPago: '2026-11-15', cicloActual: '2026-11-15', pagado: false,
  prorrogas: [], abonosCapital: [], comprobantes: [] });
const abono = (monto, id) => Object.assign({ fecha: HOY, monto, ciclo: '2026-11-15', costoCausado: 100000, moraCausada: 0, diasMoraCausada: 0 },
  id ? { id } : {});
const capital = p => p.capital - (p.abonosCapital || []).reduce((t, a) => t + a.monto, 0);
const juntar = (mia, suya) => N.fusionarFila(N.sinFotos(mia), suya, N.LISTAS_QUE_SUMAN);
const conAbonos = (...l) => Object.assign(base(), { abonosCapital: l });

describe('con id, dos abonos iguales son dos', () => {
  test('DOS pagos reales del mismo monto, uno en cada aparato: 400.000 y no 450.000', () => {
    const a = conAbonos(abono(50000, 'a')), b = conAbonos(abono(50000, 'b'));
    const r = juntar(a, b);
    assert.equal(r.fila.abonosCapital.length, 2, 'se fundieron dos pagos');
    assert.equal(capital(r.fila), 400000);
    assert.equal(capital(juntar(b, a).fila), 400000, 'el resultado depende de quién junta');
    assert.equal(capital(N.fusionarFila(a, b).fila), 400000, 'el espejo llama sin mapa de listas y da otra cosa');
  });

  test('DOS abonos iguales en UN aparato, y el otro solo anotó una gestión: 400.000', () => {
    const a = conAbonos(abono(50000, 'a'), abono(50000, 'b'));
    const b = Object.assign(base(), { gestiones: [{ fecha: HOY, canal: 'wa', plantilla: 'x' }] });
    assert.equal(capital(juntar(a, b).fila), 400000);
    assert.equal(capital(juntar(b, a).fila), 400000);
  });

  test('el MISMO abono, con su mismo id en los dos aparatos, es uno', () => {
    const a = conAbonos(abono(50000, 'a'));
    assert.equal(capital(juntar(a, clon(a)).fila), 450000, 'un abono que está en los dos lados se contó dos veces');
  });

  test('sus dos comprobantes sobreviven, cada uno con SU foto', () => {
    const a = base();
    a.comprobantes.push({ fecha: HOY, tipo: 'abono', monto: 50000, id: 'a', foto: 'data:image/jpeg;base64,AAAA' },
      { fecha: HOY, tipo: 'abono', monto: 50000, id: 'b', foto: 'data:image/jpeg;base64,BBBB' });
    const b = base();
    const r = N.fusionarFila(N.sinFotos(a), b, N.LISTAS_QUE_SUMAN);
    assert.equal(r.fila.comprobantes.length, 2, 'N.LISTAS_QUE_SUMAN funde dos comprobantes con id distinto');
    const d = N.devolverFotos(r.fila, a);
    assert.deepEqual(d.comprobantes.map(c => c.foto), ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB']);
  });

  test('cada foto vuelve a SU comprobante aunque la nube los traiga en otro orden', () => {
    const local = { id: 'P1', comprobantes: [
      { fecha: HOY, tipo: 'abono', monto: 50000, id: 'a', foto: 'FOTO-A' },
      { fecha: HOY, tipo: 'abono', monto: 50000, id: 'b', foto: 'FOTO-B' }
    ] };
    const nube = { id: 'P1', comprobantes: [
      { fecha: HOY, tipo: 'abono', monto: 50000, id: 'b' },
      { fecha: HOY, tipo: 'abono', monto: 50000, id: 'a' }
    ] };
    const d = N.devolverFotos(nube, local);
    assert.equal(d.comprobantes[0].foto, 'FOTO-B', 'la galería enseñaría el recibo de otro pago');
    assert.equal(d.comprobantes[1].foto, 'FOTO-A');
  });

  test('el mapa que usan las pantallas y el del crédito dicen lo mismo de un comprobante', () => {
    /* mezclar(LISTAS_SOCIO, LISTAS_CREDITO, LISTAS_RESPALDADO): gana el último. Desde
       el 16-oct el del crédito decía ['fecha','tipo','monto','id'] y el de los
       respaldados, sin id, le ganaba en LISTAS_QUE_SUMAN: el id nunca separó nada en
       las pantallas. Lo encontró este lote: el plan decía «la identidad ya lo admite». */
    assert.deepEqual(N.LISTAS_QUE_SUMAN.comprobantes, N.LISTAS_CREDITO.comprobantes);
    assert.deepEqual(N.LISTAS_QUE_SUMAN.abonosCapital, ['fecha', 'monto', 'cuotaPlan', 'id']);
  });
});

describe('los abonos de antes, sin id, se quedan como están', () => {
  test('su identidad no cambia: el mismo abono en los dos aparatos sigue siendo uno', () => {
    const a = conAbonos(abono(50000)), b = conAbonos(abono(50000));
    const r = juntar(a, b);
    assert.equal(r.fila.abonosCapital.length, 1);
    assert.equal(capital(r.fila), 450000);
    assert.ok(!('id' in r.fila.abonosCapital[0]), 'se le puso un id a un abono de antes');
  });

  test('abrir la cartera con el código nuevo no les pone id ni los toca', () => {
    const almacen = {};
    const db = { socios: [{ id: 'C1', nombre: 'Cliente Inventada', numero: 1, gestiones: [] }], prestamos: [conAbonos(abono(50000), abono(70000))],
      respaldados: [], config: { pin: '123456' }, contadores: { cliente: 1, credito: 1, respaldado: 0 } };
    almacen.joan_socios_v1 = JSON.stringify(db);
    const C = abrirPanel({ almacen, ahora: HOY + 'T15:00:00' });
    assert.equal(C.ev('JSON.stringify(DB.prestamos[0].abonosCapital)'), JSON.stringify(db.prestamos[0].abonosCapital));
    C.ev('guardar()');
    assert.deepEqual(JSON.parse(almacen.joan_socios_v1).prestamos[0].abonosCapital, db.prestamos[0].abonosCapital);
  });
});

describe('con dos versiones de la app a la vez: un abono con id en un aparato y sin id en otro', () => {
  test('el mismo pago no se vuelve dos, junte quien junte', () => {
    const conId = conAbonos(abono(50000, 'a')), sinId = conAbonos(abono(50000));
    assert.equal(capital(juntar(conId, sinId).fila), 450000, 'el aparato nuevo duplicó el abono');
    assert.equal(capital(juntar(sinId, conId).fila), 450000, 'juntando al revés, se duplicó');
    assert.equal(capital(N.fusionarFila(sinId, conId).fila), 450000, 'el espejo llama sin mapa de listas y duplica');
  });

  test('CONTROL: con el nube.js de v142 sí se duplicaba, así que el verde de arriba mide algo', () => {
    let fuente;
    try { fuente = execFileSync('git', ['show', 'ee7c3cc:panel/nube.js'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { return; }   // una copia sin esa historia no tiene con qué comparar
    const mod = { exports: {} };
    vm.runInNewContext(fuente, { module: mod, globalThis: {} });
    const r = mod.exports.fusionarFila(conAbonos(abono(50000, 'a')), conAbonos(abono(50000)), mod.exports.LISTAS_QUE_SUMAN);
    assert.equal(r.fila.abonosCapital.length, 2);
  });

  test('se queda el de quien junta, tal como estaba: no se le inventa un id al de antes', () => {
    const conId = conAbonos(abono(50000, 'a')), sinId = conAbonos(abono(50000));
    assert.deepEqual(juntar(sinId, conId).fila.abonosCapital, [abono(50000)]);
    assert.deepEqual(juntar(conId, sinId).fila.abonosCapital, [abono(50000, 'a')]);
  });

  test('el de antes empareja con UNO solo: los demás pagos del mismo monto se quedan', () => {
    const dos = conAbonos(abono(50000, 'a'), abono(50000, 'b')), uno = conAbonos(abono(50000));
    assert.equal(capital(juntar(dos, uno).fila), 400000, 'el abono de antes se comió dos pagos');
    assert.equal(capital(juntar(uno, dos).fila), 400000);
  });

  test('un abono de antes que los dos aparatos conocen no empareja con uno nuevo: son dos pagos', () => {
    /* Esta mañana con la versión de antes (lo tienen los dos) y esta tarde con la nueva. */
    const viejo = abono(50000), nuevo = abono(50000, 'n');
    const a = conAbonos(viejo, nuevo), b = conAbonos(viejo);
    assert.equal(capital(juntar(a, b).fila), 400000, 'se fundieron el pago de la mañana y el de la tarde');
    assert.equal(capital(juntar(b, a).fila), 400000);
  });

  test('dentro de un mismo aparato nunca empareja: lo anotó él, son dos', () => {
    const a = conAbonos(abono(50000), abono(50000, 'n'));
    assert.equal(capital(juntar(a, base()).fila), 400000);
    assert.equal(capital(juntar(base(), a).fila), 400000);
  });

  test('montos distintos no emparejan: eso es lo que E2 le va a preguntar a Joan', () => {
    const r = juntar(conAbonos(abono(100000, 'a')), conAbonos(abono(120000)));
    assert.equal(r.fila.abonosCapital.length, 2);
  });

  test('juntar otra vez lo ya juntado no cambia nada', () => {
    const conId = conAbonos(abono(50000, 'a')), sinId = conAbonos(abono(50000));
    const una = juntar(conId, sinId).fila;
    const dos = juntar(una, sinId).fila;
    assert.deepEqual(dos.abonosCapital, una.abonosCapital);
  });

  test('«lo de la nube» y «lo mío» dejan la misma plata', () => {
    const conId = conAbonos(abono(50000, 'a')), sinId = conAbonos(abono(50000));
    assert.equal(capital(N.fusionarFila(conId, sinId, N.LISTAS_QUE_SUMAN).fila), capital(N.fusionarFila(sinId, conId, N.LISTAS_QUE_SUMAN).fila));
  });
});

describe('el abono suelto nace con id: el CRM de verdad', () => {
  const abrir = () => {
    const almacen = {};
    const C = abrirPanel({ almacen, ahora: HOY + 'T15:00:00' });
    C.cargarCartera({ socios: [{ id: 'C1', nombre: 'Cliente Inventada', numero: 1, gestiones: [] }], prestamos: [base()],
      respaldados: [], config: { pin: '123456' }, contadores: { cliente: 1, credito: 1, respaldado: 0 } });
    return { C, almacen };
  };
  const cobrar = (C, monto) => {
    C.ev("document.getElementById('abCap').value = " + JSON.stringify(String(monto)));
    C.ev("abonarCapital('P1', '" + HOY + "')");
  };

  test('dos abonos iguales en una tarde: dos ids distintos, 400.000 de capital', () => {
    const { C, almacen } = abrir();
    cobrar(C, 50000); cobrar(C, 50000);
    const l = JSON.parse(almacen.joan_socios_v1).prestamos[0].abonosCapital;
    assert.equal(l.length, 2);
    assert.ok(l[0].id && l[1].id, 'el abono nació sin id');
    assert.notEqual(l[0].id, l[1].id);
    assert.equal(C.ev("capitalActual(DB.prestamos[0])"), 400000);
    /* y al juntarla con lo que dice la nube, también */
    const fila = JSON.parse(almacen.joan_socios_v1).prestamos[0];
    assert.equal(capital(juntar(fila, base()).fila), 400000);
  });

  test('el id es un texto sin nada raro: va a parar a un jsonb y a la identidad', () => {
    const { C, almacen } = abrir();
    cobrar(C, 50000);
    assert.match(JSON.parse(almacen.joan_socios_v1).prestamos[0].abonosCapital[0].id, /^[A-Za-z0-9_-]{1,64}$/);
  });

  test('su comprobante lleva el MISMO id del abono, y los dos sobreviven con su foto', () => {
    const { C, almacen } = abrir();
    C.ev("_compTmp = 'data:image/jpeg;base64,AAAA'"); cobrar(C, 50000);
    C.ev("_compTmp = 'data:image/jpeg;base64,BBBB'"); cobrar(C, 50000);
    const fila = JSON.parse(almacen.joan_socios_v1).prestamos[0];
    assert.deepEqual(fila.comprobantes.map(c => c.id), fila.abonosCapital.map(a => a.id));
    const r = N.fusionarFila(N.sinFotos(fila), base(), N.LISTAS_QUE_SUMAN);
    const d = N.devolverFotos(r.fila, fila);
    assert.deepEqual(d.comprobantes.map(c => c.foto), ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB']);
  });

  test('las cuentas del puente no cambian porque el abono traiga id', () => {
    const conId = conAbonos(abono(50000, 'a')), sinId = conAbonos(abono(50000));
    assert.equal(P.capitalActual(conId), P.capitalActual(sinId));
    assert.deepEqual(P.liquidarCiclo(conId, '2026-11-20'), P.liquidarCiclo(sinId, '2026-11-20'));
  });
});

describe('el abono suelto nace con id: el Panel en el bolsillo de verdad', () => {
  const cartera = () => ({ socios: [{ id: 'C1', numero: 1, nombre: 'Cliente Inventada', telefono: '3001234567', gestiones: [] }], prestamos: [base()],
    respaldados: [], config: { negocio: 'Tu Garantía' }, contadores: { cliente: 1, credito: 1, respaldado: 0 }, plantillas: {} });

  test('dos abonos iguales en la calle: dos ids distintos, 400.000 de capital', () => {
    const E = abrirEspejo({ cartera: cartera(), sesion: true, ahora: HOY + 'T15:00:00' });
    E.ev("abonarEnCalle('P1', 50000, '" + HOY + "')");
    E.ev("abonarEnCalle('P1', 50000, '" + HOY + "')");
    const l = JSON.parse(E.ev("JSON.stringify(creditoPorId('P1').abonosCapital)"));
    assert.equal(l.length, 2);
    assert.ok(l[0].id && l[1].id, 'el abono del celular nació sin id');
    assert.notEqual(l[0].id, l[1].id);
    assert.match(l[0].id, /^[A-Za-z0-9_-]{1,64}$/);
    /* lo que sube es lo que hay en la cola */
    const fila = JSON.parse(E.ev("JSON.stringify(creditoPorId('P1'))"));
    assert.equal(capital(N.fusionarFila(fila, base()).fila), 400000);
  });
});
