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

  test('dos iguales anotados en UN aparato no se funden al juntar la ficha: 400.000, junte quien junte', () => {
    /* Sin id, y sin que nadie los toque. Antes quedaba uno y el capital subía 50.000. */
    const dos = conAbonos(abono(50000), abono(50000));
    assert.equal(capital(juntar(dos, clon(dos)).fila), 400000, 'los dos lados los traen y quedó uno');
    assert.equal(capital(juntar(dos, base()).fila), 400000);
    assert.equal(capital(juntar(base(), dos).fila), 400000);
    assert.equal(capital(juntar(dos, conAbonos(abono(50000))).fila), 400000, 'el otro lado ya conocía uno: siguen siendo dos');
    assert.equal(capital(juntar(conAbonos(abono(50000)), dos).fila), 400000);
    assert.ok(juntar(dos, clon(dos)).fila.abonosCapital.every(a => !('id' in a)), 'se les puso un id a los de antes');
  });

  test('sus dos comprobantes también, cada uno con su foto', () => {
    const a = base();
    a.comprobantes.push({ fecha: HOY, tipo: 'abono', monto: 50000, foto: 'data:image/jpeg;base64,AAAA' },
      { fecha: HOY, tipo: 'abono', monto: 50000, foto: 'data:image/jpeg;base64,BBBB' });
    const r = N.fusionarFila(N.sinFotos(a), N.sinFotos(a), N.LISTAS_QUE_SUMAN);
    assert.equal(r.fila.comprobantes.length, 2);
    assert.deepEqual(N.devolverFotos(r.fila, a).comprobantes.map(c => c.foto), a.comprobantes.map(c => c.foto));
  });

  test('una gestión repetida se sigue juntando como siempre: la regla es solo para plata y recibos', () => {
    const g = { fecha: HOY, canal: 'wa', plantilla: 'x' };
    const a = { id: 'C1', gestiones: [g, g] };
    assert.equal(N.fusionarFila(a, a, N.LISTAS_QUE_SUMAN).fila.gestiones.length, 1);
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

  test('dos de antes de un lado contra uno nuevo del otro: empareja con uno, el otro se queda', () => {
    const dos = conAbonos(abono(50000), abono(50000)), uno = conAbonos(abono(50000, 'n'));
    assert.equal(capital(juntar(dos, uno).fila), 400000);
    assert.equal(capital(juntar(uno, dos).fila), 400000);
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

  /* 9-nov-2026 — la revisión de plata-e1 lo encontró con un barrido de todas las listas de
     hasta tres abonos: la regla miraba SI una identidad estaba del otro lado, no CUÁNTAS
     veces. Dos pagos reales de 50.000 quedaban en tres abonos y 350.000. */
  test('juntar otra vez con DOS de antes del otro lado no crece: [a] y [-,-] siguen siendo dos pagos', () => {
    const dosDeAntes = conAbonos(abono(50000), abono(50000));
    const una = juntar(conAbonos(abono(50000, 'a')), dosDeAntes).fila;
    assert.equal(capital(una), 400000);
    const otra = juntar(una, dosDeAntes).fila;
    assert.equal(otra.abonosCapital.length, 2, 'la vuelta repetida metió un abono que nadie anotó');
    assert.equal(capital(otra), 400000);
  });

  test('el mismo segundo pago sin id de un lado y con id del otro, con uno de antes en los dos: 400.000', () => {
    const aqui = conAbonos(abono(50000), abono(50000)), alla = conAbonos(abono(50000), abono(50000, 'n'));
    assert.equal(capital(juntar(aqui, alla).fila), 400000);
    assert.equal(capital(juntar(alla, aqui).fila), 400000);
  });

  test('todas las listas de hasta tres abonos: juntar dos veces da lo mismo que una, y nunca menos que el lado mayor', () => {
    const atomos = ['', 'a', 'b'];
    const listas = [[]];
    atomos.forEach(x => listas.push([x]));
    atomos.forEach(x => atomos.forEach(y => { if (!(x && x === y)) listas.push([x, y]); }));
    atomos.forEach(x => atomos.forEach(y => atomos.forEach(z => {
      if (!((x && (x === y || x === z)) || (y && y === z))) listas.push([x, y, z]);
    })));
    const fila = l => conAbonos(...l.map(id => abono(50000, id || undefined)));
    for (const la of listas) for (const lb of listas) {
      const a = fila(la), b = fila(lb);
      const r = juntar(a, b).fila;
      assert.ok(r.abonosCapital.length >= Math.max(la.length, lb.length), JSON.stringify([la, lb]));
      assert.equal(juntar(r, b).fila.abonosCapital.length, r.abonosCapital.length, 'crece al volver a juntar: ' + JSON.stringify([la, lb]));
      assert.equal(juntar(r, a).fila.abonosCapital.length, r.abonosCapital.length, 'crece al volver a juntar: ' + JSON.stringify([la, lb]));
    }
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

/* 9-nov-2026 — LAS REGLAS QUE DECIDEN POR IDENTIDAD TAMBIÉN CUENTAN (revisión de plata-e1).
   Desde que dos abonos iguales son dos, «conocer» un abono de 50.000 no es conocer dos. El
   pacto y la prórroga anotada distinta miraban un sí o no, y «lo mío» se llevaba plata que
   ese lado no tenía. */
describe('el pago acordado y la prórroga cuentan los abonos repetidos', () => {
  const pacto = () => ({ cuotas: [{ n: 1, fecha: '2026-11-20', capital: 450000, costo: 50000, total: 500000 }],
    pacto: { fecha: '2026-11-06', cambios: [{ total: 500000 }] } });
  const suma = f => (f.abonosCapital || []).reduce((t, x) => t + x.monto, 0);

  test('un pacto que conocía UN abono de 50.000 no se queda con el segundo que hizo el otro aparato, y lo dice', () => {
    const mia = Object.assign(conAbonos(abono(50000)), { planPagos: pacto() });
    const suya = conAbonos(abono(50000), abono(50000));
    const r = N.fusionarFila(mia, suya, N.LISTAS_QUE_SUMAN);
    assert.equal(suma(r.fila), 50000, '«lo mío» se llevó un abono que el pacto no conocía');
    assert.ok(r.pisables.some(p => p.campo === 'pagoAcordado'), 'la tarjeta no dice que hay plata fuera del pacto');
  });

  test('el pacto que sí conocía los dos se queda con los dos, sin choque de pago acordado', () => {
    const mia = Object.assign(conAbonos(abono(50000), abono(50000)), { planPagos: pacto() });
    const r = N.fusionarFila(mia, conAbonos(abono(50000), abono(50000)), N.LISTAS_QUE_SUMAN);
    assert.equal(suma(r.fila), 100000);
    assert.ok(!r.pisables.some(p => p.campo === 'pagoAcordado'));
  });

  test('la prórroga anotada distinta: «lo mío» deja a capital lo que la tarjeta dice de mi lado', () => {
    const pr = monto => ({ fecha: HOY, ciclo: '2026-11-15', monto });
    const mia = Object.assign(conAbonos(abono(50000)), { prorrogas: [pr(84000)] });
    const suya = Object.assign(conAbonos(abono(50000), abono(50000)), { prorrogas: [pr(88000)] });
    const r = N.fusionarFila(mia, suya, N.LISTAS_QUE_SUMAN);
    const dice = r.pisables.find(p => p.campo === 'abonosCapital');
    assert.deepEqual([dice.mio, dice.suyo], [50000, 100000]);
    assert.equal(suma(r.fila), dice.mio, 'la tarjeta dice 50.000 de mi lado y «lo mío» deja otra cifra');
  });
});

/* 9-nov-2026 — ¿EL MISMO PAGO ANOTADO EN LOS DOS APARATOS? (revisión de plata-e1). Con la app
   nueva en los dos, un pago de 100.000 que Joan anota en el computador y el cobrador en el
   celular trae dos ids distintos: quedaban dos abonos, ninguna tarjeta lo decía y, en el
   computador, ningún botón dejaba uno solo. Desde los datos no se distingue de dos pagos
   reales del mismo monto, que es lo que E1 vino a arreglar (la primera prueba de este
   archivo). Así que se pregunta: «lo mío» deja los dos y «lo de la nube» deja uno. */
describe('¿el mismo pago con id en los dos aparatos? se pregunta, y cada botón es una respuesta', () => {
  const pc = () => conAbonos(abono(100000, 'abono-del-pc'));
  const cel = () => conAbonos(abono(100000, 'abono-del-celular'));

  test('la fusión lo dice en un pisable propio, con el abono y el id de cada lado', () => {
    const r = juntar(pc(), cel());
    const x = r.pisables.find(p => p.campo === 'mismoPago');
    assert.ok(x, 'ninguna tarjeta lo diría');
    assert.equal(x.mio, 'abono ' + HOY + ' $100000');
    assert.deepEqual(x.ids, { mio: ['abono-del-pc'], suyo: ['abono-del-celular'] });
    assert.equal(capital(r.fila), 300000, '«lo mío» sigue siendo «son dos pagos», como manda E1');
  });

  test('dos del mismo aparato contra uno del otro: la pregunta es por UNO solo', () => {
    const r = juntar(conAbonos(abono(100000, 'a1'), abono(100000, 'a2')), cel());
    assert.deepEqual(r.pisables.find(p => p.campo === 'mismoPago').ids.suyo, ['abono-del-celular']);
  });

  test('montos o días distintos no se preguntan', () => {
    const otro = conAbonos(Object.assign(abono(100000, 'x'), { fecha: '2026-11-04' }));
    assert.ok(!juntar(pc(), otro).pisables.some(p => p.campo === 'mismoPago'));
    assert.ok(!juntar(pc(), conAbonos(abono(90000, 'y'))).pisables.some(p => p.campo === 'mismoPago'));
  });

  test('la subida del CRM no lo resuelve callada: nadaQueSumar dice que pisa', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(RAIZ, 'panel', 'nube-crm.js'), 'utf8').replace(/\r\n/g, '\n');
    const i = src.indexOf('\n  function nadaQueSumar(');
    const caja = { N, lista: v => (Array.isArray(v) ? v : []), objeto: v => ((v && typeof v === 'object' && !Array.isArray(v)) ? v : {}) };
    vm.createContext(caja);
    vm.runInContext(src.slice(i, src.indexOf('\n  }\n', i) + 4), caja);
    assert.equal(caja.nadaQueSumar(pc(), cel()), false);
    assert.equal(caja.nadaQueSumar(pc(), pc()), true, 'lo idéntico sigue sin choque');
  });

  test('la tarjeta del celular lo pregunta y dice qué hace cada botón', () => {
    const cartera = { socios: [{ id: 'C1', numero: 1, nombre: 'Cliente Inventada', telefono: '3001234567', gestiones: [] }], prestamos: [cel()],
      respaldados: [], config: { negocio: 'Tu Garantía' }, contadores: { cliente: 1, credito: 1, respaldado: 0 }, plantillas: {} };
    const E = abrirEspejo({ cartera, sesion: true, ahora: HOY + 'T15:00:00' });
    E.ctx.__c = { tabla: 'creditos', id: 'P1', mio: cel(), suyo: pc() };
    const h = E.ev('avisoPagosDeCuotas(__c)').replace(/<[^>]+>/g, '');
    assert.match(h, /¿Es el mismo pago\? Este celular y la nube traen cada uno un abono del mismo día y monto/);
    assert.match(h, /Si son dos pagos, Mandar lo mío encima deja los dos\. Si es el mismo pago, Dejar lo de la nube deja uno solo\./);
  });
});
