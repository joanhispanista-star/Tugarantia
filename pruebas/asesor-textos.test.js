/* ===========================================================================
 * LO QUE EL ASESOR LEE
 *
 * Joan lo pidió el 15-sep-2026: «que le muestre la tabla de comisiones de ellos
 * en ventas y cobranzas con las reglas claras» y «que tenga mensajes
 * motivacionales».
 *
 * La prueba que importa es la primera: que la tabla que el asesor LEE diga
 * exactamente lo que el motor PAGA. Si se separan, el asesor trabaja contra una
 * tabla equivocada, y eso no es un defecto de pantalla: es una discusión de
 * plata a fin de mes, con él convencido de que le deben.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../app/asesor-textos.js');
const COMIS = require('../app/comisiones.js');

describe('la tabla dice lo que el motor paga (15-sep-2026)', () => {

  test('CADA cifra de la tabla sale de comisiones.js, no escrita a mano', () => {
    /* Barrido sobre todas las tarifas que existan, no solo la de hoy: el día
       que Joan agregue una nueva con otra fecha, esta prueba la cubre sola. */
    for (const tarifa of COMIS.TARIFAS) {
      const t = T.tablaComisiones(tarifa.desde);
      assert.ok(t, 'no se pudo armar la tabla para ' + tarifa.desde);

      const dice = {};
      t.venta.concat(t.cobranza).forEach(r => { dice[r.id] = r.monto; });

      assert.equal(dice.registro, tarifa.registro, 'registro, en ' + tarifa.desde);
      assert.equal(dice.desembolso, tarifa.desembolso, 'desembolso, en ' + tarifa.desde);
      assert.equal(dice.pago, tarifa.pago, 'pago, en ' + tarifa.desde);
      assert.equal(dice.recurrencia, tarifa.recurrencia, 'recurrencia, en ' + tarifa.desde);
      /* El castigo se muestra NEGATIVO: es lo que se resta. Mostrarlo positivo
         al lado de los que se suman lo haría leer como una ganancia más. */
      assert.equal(dice.castigo, -Math.abs(tarifa.castigo), 'castigo, en ' + tarifa.desde);
      assert.ok(dice.castigo < 0, 'el castigo no se muestra como resta');
    }
  });

  test('los días de mora del castigo son los del motor', () => {
    for (const tarifa of COMIS.TARIFAS) {
      const t = T.tablaComisiones(tarifa.desde);
      const castigo = t.cobranza.find(r => r.id === 'castigo');
      assert.match(castigo.cuando, new RegExp('\\b' + tarifa.dias_castigo + ' días\\b'),
        'la tabla no dice los ' + tarifa.dias_castigo + ' días que usa el motor');
    }
  });

  test('las que nacen BLOQUEADAS son exactamente las del motor', () => {
    /* Si la tabla dijera que una se cobra de una y el motor la bloquea, el
       asesor cuenta con una plata que no le van a pagar todavía. */
    const t = T.tablaComisiones('2026-09-09');
    const marcadas = t.venta.concat(t.cobranza)
      .filter(r => r.bloqueado).map(r => r.id).sort();
    assert.deepEqual(marcadas, COMIS.NACEN_BLOQUEADOS.slice().sort(),
      'la tabla marca como bloqueadas otras distintas de las que bloquea el motor');
  });

  test('la regla de oro suma bien lo que queda esperando', () => {
    const t = T.tablaComisiones('2026-09-09');
    const tarifa = COMIS.tarifaEn('2026-09-09');
    const esperado = (tarifa.registro + tarifa.desembolso).toLocaleString('es-CO');
    assert.ok(t.la_regla_de_oro.indexOf('$' + esperado) > -1,
      'la regla de oro dice otra cifra: ' + t.la_regla_de_oro);
  });

  test('cada renglón explica CUÁNDO se gana y qué mirar', () => {
    const t = T.tablaComisiones('2026-09-09');
    for (const r of t.venta.concat(t.cobranza)) {
      assert.ok(r.titulo && r.titulo.length > 5, r.id + ' sin título');
      assert.ok(r.cuando && r.cuando.length > 15, r.id + ' no dice cuándo se gana');
      assert.ok(r.ojo && r.ojo.length > 20, r.id + ' no explica la letra chica');
    }
  });

  test('está partida en VENTA y COBRANZA, como pidió Joan', () => {
    const t = T.tablaComisiones('2026-09-09');
    assert.ok(t.venta.length >= 2 && t.cobranza.length >= 2);
    /* El pago va en cobranza, no en venta: lo que hace es que la plata vuelva. */
    assert.ok(t.cobranza.some(r => r.id === 'pago'));
    assert.ok(t.venta.some(r => r.id === 'registro'));
  });

  test('el punto de equilibrio sale del motor', () => {
    for (const pct of [10, 20, 50]) {
      const e = T.explicarEquilibrio(pct, '2026-09-09');
      const esperado = COMIS.puntoDeEquilibrio(pct, COMIS.tarifaEn('2026-09-09'));
      assert.equal(e.minimo, esperado, 'con costo ' + pct + '%');
      assert.ok(e.texto.indexOf('$' + esperado.toLocaleString('es-CO')) > -1,
        'el texto no dice el mínimo que calculó: ' + e.texto);
    }
  });
});

describe('los mensajes (15-sep-2026)', () => {

  test('NINGUNO promete una cifra de ingreso', () => {
    /* Prometerle a alguien que trabaja a comisión que va a ganar X es una
       promesa que no se puede sostener: depende de cuánta gente pague. */
    for (const m of T.MENSAJES) {
      assert.equal(/\$\s?[\d.]+/.test(m.texto + ' ' + m.pie), false,
        'un mensaje promete plata: ' + m.texto);
      assert.equal(/\bgana(r[aá]s)?\s+(hasta|mas|más)?\s*\d/i.test(m.texto), false,
        'un mensaje promete una cifra: ' + m.texto);
    }
  });

  test('el de Joan está', () => {
    assert.ok(T.MENSAJES.some(m => /base sólida de clientes.*base sólida de ingresos/i.test(m.texto)),
      'falta el mensaje que Joan escribió con sus palabras');
  });

  test('el mensaje del día NO cambia en el mismo día', () => {
    /* Si cambiara en cada repintado, la pantalla parecería inquieta y nadie lo
       leería. Con la fecha, el asesor ve el mismo todo el día. */
    const a = T.mensajeDelDia('2026-09-15');
    for (let i = 0; i < 50; i++) {
      assert.equal(T.mensajeDelDia('2026-09-15').id, a.id, 'el mensaje cambió dentro del mismo día');
    }
  });

  test('y SÍ cambia de un día a otro, y los recorre todos', () => {
    const vistos = new Set();
    for (let d = 1; d <= 28; d++) {
      const iso = '2026-09-' + String(d).padStart(2, '0');
      vistos.add(T.mensajeDelDia(iso).id);
    }
    assert.equal(vistos.size, T.MENSAJES.length,
      'en 28 días solo se vieron ' + vistos.size + ' de ' + T.MENSAJES.length + ' mensajes');
  });

  test('una fecha rara no revienta ni deja la pantalla sin mensaje', () => {
    for (const mala of ['', null, undefined, 'ayer', '2026-13-99']) {
      const m = T.mensajeDelDia(mala);
      assert.ok(m && m.texto, 'con ' + JSON.stringify(mala) + ' no hubo mensaje');
    }
  });
});
