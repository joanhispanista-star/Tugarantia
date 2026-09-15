/* ===========================================================================
 * CUÁNDO PAGA EL CLIENTE — la prueba de que la fecha se elige y de que
 * elegirla no lo saca de la ley.
 *
 * Joan lo pidió el 15-sep-2026 así: «quiero ver la opción para yo escoger el
 * número de cuotas y las fechas de pago, y que se me muestre el total a pagar».
 * El número de cuotas y el total ya estaban; la fecha, no.
 *
 * Esta prueba existe por algo más grande que la comodidad. Las cuotas de este
 * producto caen en los cortes de la casa (el 15 y el fin de mes), así que con
 * desembolso el 10 la primera cae a VEINTE días y un crédito de «tres meses»
 * dura 81. La plata vuelve antes: la efectiva anual sube. Medido en septiembre
 * sobre los treinta días de desembolso, el producto a tres meses se pasaba del
 * techo de usura en DOCE de los treinta.
 *
 * Correr la primera cuota un corte lo arregla: cero de treinta. Por eso la
 * elección de fecha no es cosmética y por eso se prueba como regla de dinero,
 * no como botón.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../app/motor.js');
const { abrirPlay } = require('./banco-play.js');
const C = require('../app/creditos.js');

const RAIZ = path.join(__dirname, '..');
const ENTRADA = { maximoRespaldado: 9000000 };

function eaDe(desembolso, meses, saltar) {
  const r = M.simularPrestamoRespaldado(1000000, meses, ENTRADA,
    { fechaDesembolso: desembolso, saltarCortes: saltar });
  return C.efectivoAnualPorFechas(desembolso, r.capital,
    r.cuotas.map(q => ({ fecha: q.fecha_corte, total: q.total })));
}
function diasDelMes(anio, mes) {
  const n = new Date(anio, mes, 0).getDate();
  return Array.from({ length: n }, (_, i) =>
    anio + '-' + String(mes).padStart(2, '0') + '-' + String(i + 1).padStart(2, '0'));
}

describe('el calendario se puede correr (15-sep-2026)', () => {

  test('correr el arranque mueve TODAS las fechas, no solo la primera', () => {
    const a = M.calendarioRespaldado('2026-09-15', 3, 0);
    const b = M.calendarioRespaldado('2026-09-15', 3, 1);
    assert.equal(a.length, 3);
    assert.equal(b.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.ok(b[i] > a[i],
        'la cuota ' + (i + 1) + ' no se corrió: ' + a[i] + ' → ' + b[i]);
    }
    /* Y siguen siendo una por mes: correr el arranque no puede juntarlas. */
    for (let i = 1; i < 3; i++) {
      const dias = (new Date(b[i]) - new Date(b[i - 1])) / 86400000;
      assert.ok(dias >= 26 && dias <= 35, 'cuotas a ' + dias + ' días entre sí');
    }
  });

  test('las fechas que se ofrecen son cortes REALES, nunca domingo', () => {
    /* Si esto se rompe, la pantalla estaría citando un día en el que no hay
       quien reciba la plata — y el socio llegaría a pagar a una puerta cerrada. */
    for (const d of diasDelMes(2026, 9)) {
      for (const s of [0, 1]) {
        for (const f of M.calendarioRespaldado(d, 6, s)) {
          assert.notEqual(new Date(f + 'T12:00:00').getDay(), 0,
            'cuota en domingo: ' + f + ' (desembolso ' + d + ', saltar ' + s + ')');
        }
      }
    }
  });

  test('opcionesDeArranque da el calendario COMPLETO de cada opción', () => {
    /* Que devuelva solo la primera fecha sería la trampa: quien pinta el precio
       tendría que rearmar el resto por su cuenta y podría armar otro. */
    const ops = M.opcionesDeArranque('2026-09-15', 4);
    assert.equal(ops.length, 2, 'se esperaban dos opciones de arranque');
    for (const o of ops) {
      assert.equal(o.fechas.length, 4);
      assert.equal(o.primera, o.fechas[0]);
      assert.ok(o.dias_a_la_primera > 0);
      assert.deepEqual(o.fechas, M.calendarioRespaldado('2026-09-15', 4, o.saltar),
        'el calendario de la opción no es el que produce el motor');
    }
    assert.ok(ops[1].dias_a_la_primera > ops[0].dias_a_la_primera);
  });

  test('saltar fuera de rango se rechaza, no se recorta en silencio', () => {
    assert.throws(() => M.calendarioRespaldado('2026-09-15', 3, 2), /saltar va de 0 a 1/);
    assert.throws(() => M.calendarioRespaldado('2026-09-15', 3, -1), /saltar/);
  });

  /* ---------------------------------------------------- la razón de fondo */

  test('LA LEY: correr el arranque saca al producto de la usura', () => {
    /* Este es el número por el que existe todo lo anterior. Barrido, no
       muestreado: los treinta días de desembolso de septiembre, los dos plazos. */
    const techo = C.topeVigente('2026-09-15').consumo_ordinario;
    for (const meses of [3, 6]) {
      let malosSin = 0, malosCon = 0, peorCon = 0;
      for (const d of diasDelMes(2026, 9)) {
        if (eaDe(d, meses, 0) > techo) malosSin++;
        const e = eaDe(d, meses, 1);
        if (e > techo) malosCon++;
        if (e > peorCon) peorCon = e;
      }
      assert.ok(malosSin > 0,
        'a ' + meses + ' meses ya no hay días por encima del techo sin correr el ' +
        'arranque: el producto mejoró y esta prueba hay que volver a escribirla');
      assert.equal(malosCon, 0,
        'a ' + meses + ' meses quedan ' + malosCon + ' días sobre el techo aun ' +
        'corriendo el arranque (peor ' + (peorCon * 100).toFixed(2) + '%)');
    }
  });

  test('la opción que se elige es la que se cotiza — no una parecida', () => {
    /* La forma de equivocarse acá es pintar las fechas de una opción y el precio
       de otra. Se comprueba que el plan que devuelve el motor para el arranque
       elegido tiene EXACTAMENTE las fechas que esa opción anuncia. */
    for (const meses of [3, 6]) {
      for (const o of M.opcionesDeArranque('2026-09-10', meses)) {
        const r = M.simularPrestamoRespaldado(1500000, meses, ENTRADA,
          { fechaDesembolso: '2026-09-10', saltarCortes: o.saltar });
        assert.deepEqual(r.cuotas.map(q => q.fecha_corte), o.fechas,
          'el plan cotizado no cae en las fechas que la opción anuncia');
      }
    }
  });
});

describe('la pantalla ofrece la fecha (15-sep-2026)', () => {

  const html = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');

  test('el mando de fechas se pinta dentro de la tarjeta de la calculadora', () => {
    assert.ok(html.indexOf('id="gcalcFechas"') > -1 &&
              html.indexOf('mandoDeFechas()') > -1,
      'la tarjeta no pinta el mando de fechas');
  });

  test('mover el plazo repinta las fechas', () => {
    /* Sin esto los botones muestran el calendario del plazo ANTERIOR mientras
       las cifras de al lado ya son del nuevo: dos planes en una pantalla. */
    const i = html.indexOf('function moverGCalc');
    assert.ok(i > -1);
    const cuerpo = html.slice(i, html.indexOf('\n}', i));
    assert.ok(cuerpo.indexOf('gcalcFechas') > -1,
      'moverGCalc no repinta el mando de fechas');
  });

  test('cada opción se cotiza aparte antes de ofrecerse', () => {
    const i = html.indexOf('function arranquesPosibles');
    assert.ok(i > -1, 'no existe arranquesPosibles');
    const cuerpo = html.slice(i, html.indexOf('\n}', i));
    assert.ok(cuerpo.indexOf('garantiaSePuedeCotizar') > -1,
      'las opciones se ofrecen sin preguntarle al guardián del techo');
  });

  test('arranqueElegido NUNCA devuelve una opción que no pase el techo', () => {
    /* Es la línea de la que cuelga el precio publicado. Si devolviera un
       arranque ilegal por no tener a mano uno legal, la página publicaría ese
       precio — que es exactamente el artículo 305. */
    /* Esto se prueba CORRIENDO la página, no leyendo su texto. La primera
       versión de este centinela buscaba las palabras «garantiaSePuedeCotizar» y
       «legales» en el código y daba verde; se le metió el error a propósito —un
       `return 0` al principio de la función, dejando el resto intacto— y NO lo
       vio. Un centinela que mira el texto aprueba cualquier mutante que no
       borre palabras. Éste le pone un techo que solo una de las dos opciones
       alcanza, y exige que la página elija ESA. */
    const P = abrirPlay();
    /* El techo de mentira: 24%. A tres meses desde hoy, el arranque sin correr
       da ~26,6% (ilegal) y el corrido ~20,8% (legal). Se le clava a la COPIA de
       C que tiene la página, no al módulo: el módulo es único para todo el
       proceso y ensuciarlo envenena las demás pruebas. */
    P.ev('C = Object.assign({}, C);' +
         'C.topeVigente = function () { return { consumo_ordinario: 0.24 }; };' +
         'C.topeDeReferencia = function () { return { tope: 0.24, vigente: true }; };');
    P.ev('GCALC.meses = 3; GCALC.monto = GCALC_MIN; GCALC.arranque = 0;');

    /* Se pide ya unido en un texto: lo que vuelve del contexto de la página es
       un Array de OTRO realm, y deepStrictEqual lo rechaza por el prototipo
       aunque el contenido sea idéntico — cuesta media hora entender el fallo. */
    const ops = P.ev('arranquesPosibles().map(function (o) { return o.saltar + ":" + o.sirve; }).join("|")');
    assert.equal(ops, '0:false|1:true',
      'el techo de mentira no separó las dos opciones; esta prueba no está midiendo nada');

    assert.equal(P.ev('arranqueElegido()'), 1,
      'la página eligió un arranque que NO cabe debajo del techo, y va a publicar su precio');

    /* Y el que no sirve no se ofrece como botón. */
    assert.ok(P.ev('mandoDeFechas()').indexOf('eligeArranque(0)') === -1,
      'se ofrece como botón una opción que se pasa del techo de usura');
  });

  test('si NINGUNA opción cabe, no se publica precio', () => {
    const P = abrirPlay();
    P.ev('C = Object.assign({}, C);' +
         'C.topeVigente = function () { return { consumo_ordinario: 0.01 }; };' +
         'C.topeDeReferencia = function () { return { tope: 0.01, vigente: true }; };');
    P.ev('GCALC.meses = 3; GCALC.monto = GCALC_MIN;');
    assert.equal(P.ev('mandoDeFechas()'), '',
      'sin ninguna opción legal se sigue pintando el mando de fechas');
    assert.match(P.ev('tarjetaCalcGarantia()'), /Hoy no podemos publicar su precio/,
      'sin ninguna opción legal la tarjeta publica un precio igual');
  });

  test('con una sola opción no se pinta una elección de una sola cosa', () => {
    const i = html.indexOf('function mandoDeFechas');
    const cuerpo = html.slice(i, html.indexOf('\n}', i));
    assert.ok(cuerpo.indexOf('sirven.length === 1') > -1,
      'con una sola opción válida se seguiría pintando una fila de botones');
  });
});
