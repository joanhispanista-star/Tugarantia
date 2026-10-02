/* ============================================================================
 * TU GENTE — los referidos, contados para Joan (app/gente.js)
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/tu-gente.test.js
 *
 * QUÉ CUIDAN, Y POR QUÉ ESTAS.
 *   1. El caso de verdad: en el respaldo del 1-oct, quien más gente trajo tiene
 *      3 invitados y uno de ellos pagó 2 créditos → la simulación da 4.000. Se
 *      arma con datos INVENTADOS de la misma forma (ningún nombre real entra a
 *      este repositorio).
 *   2. Que la garantía por referidos NO se calcula acá: tiene que ser, peso por
 *      peso, la que devuelve el motor con la entrada del puente, tope incluido.
 *      Si alguien la reescribiera en gente.js, esta prueba se entera el día que
 *      la regla cambie y las dos copias se separen.
 *   3. Los bordes que en una cartera real existen: invitados sin créditos, el
 *      que figura como referido de sí mismo, dos que se invitaron entre sí, y
 *      el que apunta a una ficha borrada.
 *   4. Que el módulo es PURO (no toca la cartera) y que no saca el nombre de
 *      ningún invitado: lo que no sale no se puede filtrar.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../app/motor.js');
const P = require('../app/puente.js');
const G = require('../app/gente.js');

const RAIZ = path.join(__dirname, '..');
const HOY = '2026-09-15';

let numero = 1;
const socio = (id, nombre, referidoPor) => ({
  id, numero: numero++, nombre, cedula: '10' + String(numero).padStart(6, '0'),
  telefono: '300' + String(1000000 + numero), gestiones: [], ajusteGarantia: 0,
  referidoPor: referidoPor === undefined ? '' : referidoPor
});
const credito = (id, socioId, extra) => Object.assign({
  id, numero: numero++, socioId, capital: 100000, costoPct: 20,
  fechaDesembolso: '2026-08-20', cicloActual: '2026-08-31',
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
}, extra || {});
/* Un crédito cobrado por este sistema: con cobroRegistrado, el puente no le
   vuelve a migrar la fecha, y la garantía sale de gananciaPago. */
const pagado = (id, socioId, extra) => credito(id, socioId, Object.assign({
  pagado: true, fechaPagado: '2026-08-31', cicloPago: '2026-08-31',
  gananciaPago: 20000, cobroRegistrado: true
}, extra || {}));

/* LA FORMA DEL CASO DEL 1-OCT: un padrino con tres invitados. Uno pagó dos
   créditos; otro pidió y todavía debe; el tercero no ha pedido nada. Más un
   segundo padrino con un invitado que pagó uno, para que el orden importe. */
function carteraDelCaso() {
  numero = 1;
  return P.normalizar({
    socios: [
      socio('p1', 'Padrino Uno Zqx'),
      socio('i1', 'Invitada Pagadora Wvk', 'p1'),
      socio('i2', 'Invitado Debedor Qjz', 'p1'),
      socio('i3', 'Invitada Quieta Xyp', 'p1'),
      socio('p2', 'Padrino Dos Kvt'),
      socio('i4', 'Invitado Solo Mzr', 'p2'),
      socio('n1', 'Cliente Sin Padrino Hgf')
    ],
    prestamos: [
      pagado('cp1', 'p1'), pagado('cp1b', 'p1', { fechaDesembolso: '2026-07-20', cicloActual: '2026-07-31', cicloPago: '2026-07-31', fechaPagado: '2026-07-31' }),
      pagado('ci1a', 'i1'),
      pagado('ci1b', 'i1', { fechaDesembolso: '2026-07-20', cicloActual: '2026-07-31', cicloPago: '2026-07-31', fechaPagado: '2026-07-31' }),
      credito('ci2', 'i2', { fechaDesembolso: '2026-09-01', cicloActual: '2026-09-30' }),
      pagado('cp2', 'p2'),
      pagado('ci4', 'i4')
    ]
  });
}

describe('el caso de verdad: tres invitados, uno pagó dos créditos → 4.000', () => {

  test('el padrino de tres', () => {
    const r = G.tuGente(carteraDelCaso(), { hoy: HOY });
    const p = r.padrinos.find(x => x.id === 'p1');
    assert.ok(p, 'el padrino no salió en la lista');
    assert.equal(p.invitados, 3);
    assert.equal(p.pidieron, 2, 'pidieron: la que pagó y el que debe; la tercera no ha pedido');
    assert.equal(p.pagaron, 1, 'PERSONAS que pagaron: una');
    assert.equal(p.creditos_pagados, 2, 'CRÉDITOS pagados por su gente: dos, de la misma persona');
    assert.equal(p.simulacion, 4000, 'la simulación del 1-oct era 4.000');
    assert.equal(p.simulacion, p.creditos_pagados * G.COMISION_SIMULADA);
  });

  test('la simulación cuenta créditos, no personas', () => {
    /* La regla de la v3 es «2.000 por crédito pagado». Contar personas daría
       2.000 aquí y escondería que una sola invitada ya pagó dos veces. */
    const p = G.tuGente(carteraDelCaso(), { hoy: HOY }).padrinos.find(x => x.id === 'p1');
    assert.notEqual(p.simulacion, p.pagaron * G.COMISION_SIMULADA);
  });

  test('los totales: cuántos llegaron referidos y qué parte de la cartera son', () => {
    const t = G.tuGente(carteraDelCaso(), { hoy: HOY }).totales;
    assert.equal(t.clientes, 7);
    assert.equal(t.llegaron_referidos, 4);
    assert.equal(t.pct_referidos, Math.round(4 * 100 / 7));
    assert.equal(t.padrinos, 2);
    assert.equal(t.creditos_pagados, 3);
    assert.equal(t.simulacion, 6000);
    assert.equal(t.huerfanos, 0);
  });

  test('primero quien más créditos trajo pagados', () => {
    const r = G.tuGente(carteraDelCaso(), { hoy: HOY });
    assert.deepEqual(r.padrinos.map(x => x.id), ['p1', 'p2']);
  });

  test('la etiqueta que tiene que ir al lado', () => {
    assert.equal(G.ROTULO_SIMULACION, 'simulación, no se le debe nada');
    assert.equal(G.COMISION_SIMULADA, 2000);
  });
});

describe('la garantía por referidos la decide el motor, con su tope', () => {

  test('es exactamente la de desglosarGarantia con la entrada del puente', () => {
    const db = carteraDelCaso();
    G.tuGente(db, { hoy: HOY }).padrinos.forEach(p => {
      const s = db.socios.find(x => x.id === p.id);
      const d = M.desglosarGarantia(P.entradaGarantia(db, s));
      assert.equal(p.garantia_acreditada, d.referidos, p.id + ': la garantía no es la del motor');
      assert.equal(p.garantia_sin_tope, d.referidos_sin_tope);
    });
  });

  test('el tope muerde: quien no ha ganado garantía pagando no cobra por su gente', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('p', 'Padrino Sin Pagar Rrt'), socio('i', 'Invitado Que Pago Lkj', 'p')],
      prestamos: [pagado('c1', 'i')]
    });
    const p = G.tuGente(db, { hoy: HOY }).padrinos[0];
    assert.equal(p.garantia_sin_tope, M.GARANTIA_POR_REFERIDO, 'su invitado pagó: vale 5.000');
    assert.equal(p.garantia_acreditada, 0, 'pero el tope es la garantía ganada, y es cero');
    assert.equal(p.tope_mordio, true);
    /* La simulación NO lleva el tope: es otra regla (la v3) y otra plata. */
    assert.equal(p.simulacion, 2000);
  });

  test('si Joan apaga el tope en Ajustes, se acredita entero', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('p', 'Padrino Sin Pagar Rrt'), socio('i', 'Invitado Que Pago Lkj', 'p')],
      prestamos: [pagado('c1', 'i')],
      config: { topeReferidos: { hasta_la_ganada: false } }
    });
    const p = G.tuGente(db, { hoy: HOY }).padrinos[0];
    assert.equal(p.garantia_acreditada, M.GARANTIA_POR_REFERIDO);
    assert.equal(p.tope_mordio, false);
  });

  test('un invitado que no ha pagado no suma garantía, aunque haya pedido', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('p', 'Padrino Pk'), socio('i', 'Invitado Debe Pk', 'p')],
      prestamos: [pagado('cp', 'p'), credito('ci', 'i', { fechaDesembolso: '2026-09-01', cicloActual: '2026-09-30' })]
    });
    const p = G.tuGente(db, { hoy: HOY }).padrinos[0];
    assert.equal(p.pidieron, 1);
    assert.equal(p.garantia_acreditada, 0);
    assert.equal(p.simulacion, 0);
  });
});

describe('los bordes de una cartera de verdad', () => {

  test('invitados sin ningún crédito: salen, con todo en cero', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('p', 'Padrino Nada Ft'), socio('a', 'Quieto Uno Ft', 'p'), socio('b', 'Quieto Dos Ft', 'p')],
      prestamos: []
    });
    const r = G.tuGente(db, { hoy: HOY });
    assert.equal(r.padrinos.length, 1);
    const p = r.padrinos[0];
    assert.deepEqual([p.invitados, p.pidieron, p.pagaron, p.creditos_pagados, p.simulacion], [2, 0, 0, 0, 0]);
    assert.equal(r.totales.llegaron_referidos, 2);
  });

  test('el que figura como referido de sí mismo no es una invitación', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('s', 'Se Invito Solo Bnm', 's')],
      prestamos: [pagado('c', 's')]
    });
    const r = G.tuGente(db, { hoy: HOY });
    const p = r.padrinos[0];
    assert.ok(p, 'tiene que salir: es justo lo que Joan tiene que ver');
    assert.equal(p.invitados, 0);
    assert.equal(p.simulacion, 0, 'un autorreferido no cobraría en el programa');
    assert.equal(p.se_refirio_a_si_mismo, true);
    assert.equal(r.totales.llegaron_referidos, 0, 'no llegó referido por nadie');
    assert.equal(r.totales.autorreferidos, 1);
    assert.equal(r.totales.padrinos, 0);
    assert.match(p.alertas.join(' '), /referido de sí mismo/);
    /* Y lo que el MOTOR hace con él se dice tal cual: hoy lo cuenta. La
       pantalla no lo esconde, porque la cifra de garantía ya lo trae. */
    const d = M.desglosarGarantia(P.entradaGarantia(db, db.socios[0]));
    assert.equal(p.garantia_acreditada, d.referidos);
    assert.match(p.alertas.join(' '), /el motor sí lo cuenta/);
  });

  test('dos que se invitaron entre sí: se cuentan, se avisa y no se queda dando vueltas', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('a', 'Ana Cruce Plk', 'b'), socio('b', 'Beto Cruce Plk', 'a')],
      prestamos: [pagado('ca', 'a'), pagado('cb', 'b')]
    });
    const r = G.tuGente(db, { hoy: HOY });
    assert.equal(r.padrinos.length, 2);
    r.padrinos.forEach(p => {
      assert.equal(p.invitados, 1);
      assert.equal(p.cruzado, true);
      assert.match(p.alertas.join(' '), /el uno al otro/);
    });
    assert.equal(r.totales.en_cruce, 2);
  });

  test('el que apunta a una ficha que ya no está: llegó referido, pero no hay a quién sumárselo', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('x', 'Huerfano De Padrino Tyu', 'borrado-hace-un-mes')],
      prestamos: [pagado('c', 'x')]
    });
    const r = G.tuGente(db, { hoy: HOY });
    assert.equal(r.padrinos.length, 0);
    assert.equal(r.totales.huerfanos, 1);
    assert.equal(r.totales.llegaron_referidos, 1);
    assert.equal(r.totales.simulacion, 0);
  });

  test('los que su gente tiene en mora, contados con la regla del puente', () => {
    numero = 1;
    const db = P.normalizar({
      socios: [socio('p', 'Padrino Mora Gh'), socio('i', 'Invitado Atrasado Gh', 'p'),
               socio('j', 'Invitada Al Dia Gh', 'p')],
      prestamos: [
        credito('ci', 'i', { fechaDesembolso: '2026-08-25', cicloActual: '2026-09-10' }),
        credito('cj', 'j', { fechaDesembolso: '2026-09-01', cicloActual: '2026-09-30' })
      ]
    });
    const p = G.tuGente(db, { hoy: HOY }).padrinos[0];
    const ci = db.prestamos.find(x => x.id === 'ci');
    assert.equal(P.estabaVencido(ci, HOY), true, 'la prueba está mal armada: ese crédito no está vencido');
    assert.equal(p.invitados_en_mora, 1);
  });

  test('una cartera vacía o rota no revienta', () => {
    assert.equal(G.tuGente(null).padrinos.length, 0);
    assert.equal(G.tuGente({}).totales.clientes, 0);
    assert.equal(G.tuGente({ socios: [null, undefined], prestamos: null }).totales.pct_referidos, 0);
  });

  test('un referidoPor guardado como número no se cuenta distinto que en el motor', () => {
    /* referidosDe compara con ===. Si gente.js normalizara a texto, contaría un
       invitado que el motor no le acredita, y la misma tarjeta diría dos cosas. */
    numero = 1;
    const db = P.normalizar({
      socios: [socio(7, 'Padrino Numerico Zz'), socio('i', 'Invitado Texto Zz', '7')],
      prestamos: [pagado('c', 'i')]
    });
    const r = G.tuGente(db, { hoy: HOY });
    assert.equal(P.referidosDe(db, db.socios[0]).length, 0, 'el motor no lo cuenta');
    assert.equal(r.padrinos.length, 0, 'y esta pantalla tampoco');
    assert.equal(r.totales.huerfanos, 1, 'queda como huérfano, que es lo que es para el motor');
  });
});

describe('solo para Joan: puro y sin nombres de invitados', () => {

  test('no toca la cartera que recibe', () => {
    const db = carteraDelCaso();
    const antes = JSON.stringify(db);
    G.tuGente(db, { hoy: HOY });
    assert.equal(JSON.stringify(db), antes, 'gente.js modificó la cartera');
  });

  test('no saca el nombre de ningún invitado', () => {
    const r = G.tuGente(carteraDelCaso(), { hoy: HOY });
    const txt = JSON.stringify(r);
    ['Pagadora', 'Debedor', 'Quieta', 'Invitado Solo'].forEach(n =>
      assert.ok(!txt.includes(n), 'sale el nombre de un invitado: ' + n));
    /* Y el del padrino sí, que es a quien Joan está mirando. */
    assert.ok(txt.includes('Padrino Uno Zqx'));
  });

  test('ni un setItem ni un fetch en el módulo', () => {
    const codigo = fs.readFileSync(path.join(RAIZ, 'app', 'gente.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/mg, '');
    assert.ok(!/setItem|removeItem|localStorage|fetch\s*\(|XMLHttpRequest/.test(codigo),
      'gente.js tiene que ser puro: recibe la cartera y devuelve números');
    assert.ok(!/normalizar\s*\(/.test(codigo),
      'P.normalizar rellena los objetos que recibe: gente.js no puede llamarlo sobre la cartera viva');
  });

  test('la garantía no se reescribe acá: se le pregunta al motor', () => {
    const codigo = fs.readFileSync(path.join(RAIZ, 'app', 'gente.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/mg, '');
    assert.match(codigo, /M\.desglosarGarantia\(P\.entradaGarantia\(db, s\)\)/);
    assert.ok(!/5000|GARANTIA_POR_REFERIDO|hasta_la_ganada/.test(codigo),
      'la regla de los 5.000 y su tope viven en el motor; una segunda copia acá se separaría');
  });

  test('la app del cliente y la puerta pública no cargan gente.js', () => {
    ['app/socio.html', 'play/index.html', 'platachat/index.html'].forEach(f => {
      const ruta = path.join(RAIZ, f);
      if (!fs.existsSync(ruta)) return;
      assert.ok(!/gente\.js/.test(fs.readFileSync(ruta, 'utf8')),
        f + ' carga gente.js: los referidos de un cliente llegarían a otro teléfono');
    });
  });
});
