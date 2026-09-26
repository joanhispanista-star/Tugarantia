'use strict';
/* ==========================================================================
 * LAS REGLAS DE PLATACHAT — 14 de septiembre de 2026
 *
 *   node --test pruebas/platachat-reglas.test.js
 *
 * Lo que este archivo vigila, en orden de lo que más duele si se rompe:
 *
 *   1. Que con proveedor manual (gasto 0) PlataChat dé EXACTAMENTE la misma
 *      garantía que el motor de Tu Garantía. Si no, un mismo cliente vería dos
 *      cupos distintos según la app que abra.
 *   2. Que las 28 filas del anexo A de PLAN-PLATACHAT.md salgan celda por
 *      celda. Las revisó otra sesión con el motor cargado; son la referencia
 *      que Joan leyó cuando decidió el reparto. Si una celda se mueve, o el
 *      plan está mal o esto está mal, y hay que saber cuál.
 *   3. Que la escalera reproduzca la de Tu Garantía (7 créditos) y la del
 *      plan con TumiPay (11, y 13 con IVA), fila por fila.
 *   4. Que el módulo sea puro: sin reloj, sin red, sin DOM. Y que ninguna
 *      frase que le llega al cliente traiga un porcentaje.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = require('../app/platachat-reglas.js');
const M = require('../app/motor.js');

const RUTA = path.join(__dirname, '..', 'app', 'platachat-reglas.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

const tumipay = (k, c) => R.gastoTumiPay(k, c);
const tumipayIva = (k, c) => R.gastoTumiPay(k, c, { conIva: true });
const NOVATO = { capital: 100000, tasa: 0.35 };

/* ==========================================================================
 * 1. COHERENCIA CON EL MOTOR
 * ======================================================================== */
describe('con proveedor manual PlataChat es el motor de hoy, peso a peso', () => {

  test('repartir(costo, 0).garantia === MotorReglas.acumularGarantia(costo, true)', () => {
    /* Todos los costos del anexo A más los que fuerzan el redondeo (.5). */
    const costos = [17500, 35000, 52500, 70000, 105000, 175000, 350000,
                    10000, 20000, 30000, 40000, 60000, 100000, 200000,
                    1, 2, 3, 5, 7, 9250, 10638, 12233, 14068, 16179, 18605, 999999];
    costos.forEach(c => {
      assert.equal(R.repartir(c, 0).garantia, M.acumularGarantia(c, true),
        'la garantía en fecha se desvió del motor para costo ' + c);
    });
  });

  test('y tarde también: repartir(costo, 0, {aTiempo:false}) === acumularGarantia(costo, false)', () => {
    [17500, 35000, 10000, 20000, 3, 5, 9250, 12233].forEach(c => {
      assert.equal(R.repartir(c, 0, { aTiempo: false }).garantia, M.acumularGarantia(c, false),
        'la garantía tarde se desvió del motor para costo ' + c);
    });
  });

  test('las constantes copiadas son las del motor (si esto revienta, el motor cambió y PlataChat no)', () => {
    /* Están escritas a mano a propósito: un cambio de reparto en el motor no
       debe arrastrar a PlataChat en silencio, porque su promesa está escrita
       en pesos en los términos. Esta prueba es el aviso. */
    assert.equal(R.FACTOR_GARANTIA, M.FACTOR_GARANTIA);
    assert.equal(R.FACTOR_TARDE, M.FACTOR_GARANTIA_MORA);
    assert.equal(R.TASA_ESTANDAR, M.TASA_CREDITO);
    assert.equal(R.TASA_NUEVO, M.POLITICA_NUEVOS_DEF.costo_pct / 100);
    assert.equal(R.TOPE_NUEVO, M.POLITICA_NUEVOS_DEF.capital);
  });

  test('los valores del contrato, tal cual', () => {
    assert.equal(R.MONEDA, 10000);
    assert.equal(R.LINGOTE, 100000);
    assert.equal(R.TASA_NUEVO, 0.35);
    assert.equal(R.TOPE_NUEVO, 100000);
    assert.equal(R.TASA_ESTANDAR, 0.20);
    assert.equal(R.TASA_SOBRE_CUPO, 0.25);
    /* 26-sep-2026: el 80/20 de Joan (23-sep), pague cuando pague. */
    assert.equal(R.FACTOR_GARANTIA, 0.80);
    assert.equal(R.FACTOR_TARDE, 0.80);
    assert.deepEqual(R.TARIFA_TUMIPAY, { payout_fijo: 2800, payin_pct: 0.015, payin_fijo: 700, iva: 0.19 });
    assert.ok(Object.isFrozen(R.TARIFA_TUMIPAY), 'la tarifa se cambia editando el archivo, no en caliente');
  });
});

/* ==========================================================================
 * 2. EL ANEXO A, CELDA POR CELDA
 *
 * Columnas del plan: capital · costo · gasto · HOY garantía · HOY ganancia ·
 * B neto · B garantía · B ganancia · C garantía · C ganancia.
 * HOY = Tu Garantía (garantía sobre el costo entero, sin gasto).
 * B = el reparto de PlataChat (gasto primero, del neto cuatro quintas partes).
 * C = garantía intacta y la ganancia es lo que queda (puede ser negativa).
 * ======================================================================== */
/* 26-sep-2026 — RECALCULADO CON EL 80/20. El anexo del plan se escribió el
   14-sep con el 75/25 de entonces; Joan pasó el reparto al 80/20 el 23-sep.
   Cada celda salió de una cuenta a mano (fórmulas escritas aparte, sin llamar
   a este módulo) y se cotejó contra el módulo: cero diferencias. */
const ANEXO_A = {
  '35 % · sin IVA': { tasa: 0.35, conIva: false, filas: [
    [50000, 17500, 4513, 14000, 3500, 12987, 10390, 2597, 14000, -1013],
    [100000, 35000, 5525, 28000, 7000, 29475, 23580, 5895, 28000, 1475],
    [150000, 52500, 6538, 42000, 10500, 45962, 36770, 9192, 42000, 3962],
    [200000, 70000, 7550, 56000, 14000, 62450, 49960, 12490, 56000, 6450],
    [300000, 105000, 9575, 84000, 21000, 95425, 76340, 19085, 84000, 11425],
    [500000, 175000, 13625, 140000, 35000, 161375, 129100, 32275, 140000, 21375],
    [1000000, 350000, 23750, 280000, 70000, 326250, 261000, 65250, 280000, 46250]
  ] },
  '20 % · sin IVA': { tasa: 0.20, conIva: false, filas: [
    [50000, 10000, 4400, 8000, 2000, 5600, 4480, 1120, 8000, -2400],
    [100000, 20000, 5300, 16000, 4000, 14700, 11760, 2940, 16000, -1300],
    [150000, 30000, 6200, 24000, 6000, 23800, 19040, 4760, 24000, -200],
    [200000, 40000, 7100, 32000, 8000, 32900, 26320, 6580, 32000, 900],
    [300000, 60000, 8900, 48000, 12000, 51100, 40880, 10220, 48000, 3100],
    [500000, 100000, 12500, 80000, 20000, 87500, 70000, 17500, 80000, 7500],
    [1000000, 200000, 21500, 160000, 40000, 178500, 142800, 35700, 160000, 18500]
  ] },
  '35 % · con IVA': { tasa: 0.35, conIva: true, filas: [
    [50000, 17500, 5370, 14000, 3500, 12130, 9704, 2426, 14000, -1870],
    [100000, 35000, 6575, 28000, 7000, 28425, 22740, 5685, 28000, 425],
    [150000, 52500, 7780, 42000, 10500, 44720, 35776, 8944, 42000, 2720],
    [200000, 70000, 8985, 56000, 14000, 61015, 48812, 12203, 56000, 5015],
    [300000, 105000, 11394, 84000, 21000, 93606, 74885, 18721, 84000, 9606],
    [500000, 175000, 16214, 140000, 35000, 158786, 127029, 31757, 140000, 18786],
    [1000000, 350000, 28263, 280000, 70000, 321737, 257390, 64347, 280000, 41737]
  ] },
  '20 % · con IVA': { tasa: 0.20, conIva: true, filas: [
    [50000, 10000, 5236, 8000, 2000, 4764, 3811, 953, 8000, -3236],
    [100000, 20000, 6307, 16000, 4000, 13693, 10954, 2739, 16000, -2307],
    [150000, 30000, 7378, 24000, 6000, 22622, 18098, 4524, 24000, -1378],
    [200000, 40000, 8449, 32000, 8000, 31551, 25241, 6310, 32000, -449],
    [300000, 60000, 10591, 48000, 12000, 49409, 39527, 9882, 48000, 1409],
    [500000, 100000, 14875, 80000, 20000, 85125, 68100, 17025, 80000, 5125],
    [1000000, 200000, 25585, 160000, 40000, 174415, 139532, 34883, 160000, 14415]
  ] }
};

describe('el anexo A del plan, celda por celda', () => {
  Object.keys(ANEXO_A).forEach(nombre => {
    const tabla = ANEXO_A[nombre];
    test('tabla ' + nombre + ' (' + tabla.filas.length + ' filas)', () => {
      tabla.filas.forEach(([capital, costo, gasto, hoyG, hoyGan, bNeto, bGar, bGan, cGar, cGan]) => {
        const donde = nombre + ', capital ' + capital + ': ';
        assert.equal(M.calcularCosto(capital, tabla.tasa), costo, donde + 'el costo del motor');
        assert.equal(R.gastoTumiPay(capital, costo, { conIva: tabla.conIva }), gasto, donde + 'gasto TumiPay');

        const hoy = R.repartir(costo, 0);
        assert.equal(hoy.garantia, hoyG, donde + 'HOY garantía');
        assert.equal(hoy.ganancia, hoyGan, donde + 'HOY ganancia');

        const b = R.repartir(costo, gasto);
        assert.equal(b.neto, bNeto, donde + 'B neto');
        assert.equal(b.garantia, bGar, donde + 'B garantía');
        assert.equal(b.ganancia, bGan, donde + 'B ganancia');
        assert.equal(b.gasto, gasto, donde + 'el gasto se absorbió entero');
        assert.equal(b.descubierto, 0, donde + 'nada descubierto');

        /* El modelo C no es una función del módulo (Joan lo descartó, 4a):
           se deriva para comprobar que la tabla del plan es aritméticamente
           la misma cuenta. */
        assert.equal(hoy.garantia, cGar, donde + 'C garantía');
        assert.equal(costo - gasto - hoy.garantia, cGan, donde + 'C ganancia');
      });
    });
  });

  test('las cuatro celdas que pidió el contrato, escritas a mano por si la tabla se edita', () => {
    assert.deepEqual(sinExtras(R.repartir(35000, 5525)), { costo: 35000, gasto: 5525, neto: 29475, garantia: 23580, ganancia: 5895, descubierto: 0 });
    assert.deepEqual(sinExtras(R.repartir(17500, 4513)), { costo: 17500, gasto: 4513, neto: 12987, garantia: 10390, ganancia: 2597, descubierto: 0 });
    assert.deepEqual(sinExtras(R.repartir(20000, 5300)), { costo: 20000, gasto: 5300, neto: 14700, garantia: 11760, ganancia: 2940, descubierto: 0 });
    assert.deepEqual(sinExtras(R.repartir(10000, 4400)), { costo: 10000, gasto: 4400, neto: 5600, garantia: 4480, ganancia: 1120, descubierto: 0 });
    assert.deepEqual(sinExtras(R.repartir(35000, 6575)), { costo: 35000, gasto: 6575, neto: 28425, garantia: 22740, ganancia: 5685, descubierto: 0 });
    assert.deepEqual(sinExtras(R.repartir(10000, 5236)), { costo: 10000, gasto: 5236, neto: 4764, garantia: 3811, ganancia: 953, descubierto: 0 });
  });
});

function sinExtras(r) {
  return { costo: r.costo, gasto: r.gasto, neto: r.neto, garantia: r.garantia, ganancia: r.ganancia, descubierto: r.descubierto };
}

/* ==========================================================================
 * 3. REPARTIR: lo que no debe pasar
 * ======================================================================== */
describe('repartir', () => {

  test('garantía + ganancia + gasto = costo, siempre (la invariante)', () => {
    for (let costo = 0; costo <= 60000; costo += 1237) {
      for (const gasto of [0, 1, 700, 4400, 5525, costo, costo + 1]) {
        for (const aTiempo of [true, false]) {
          const r = R.repartir(costo, gasto, { aTiempo });
          assert.equal(r.garantia + r.ganancia + r.gasto, costo,
            'no cierra con costo ' + costo + ', gasto ' + gasto + ', aTiempo ' + aTiempo);
          assert.ok(r.neto >= 0 && r.garantia >= 0 && r.ganancia >= 0, 'un negativo con costo ' + costo + ', gasto ' + gasto);
        }
      }
    }
  });

  test('tarde suma LO MISMO desde el 23-sep: factor 0,80 sobre el neto (la mora no pasa por aquí)', () => {
    /* Joan retiró el bono por puntualidad: lo que castiga el atraso es la
       mora, que va entera a la empresa y nunca entra a repartir(). */
    const r = R.repartir(35000, 5525, { aTiempo: false });
    assert.equal(r.factor, 0.80);
    assert.equal(r.garantia, Math.round(29475 * 0.80));   // 23580
    assert.equal(r.garantia, 23580);
    assert.equal(r.ganancia, 29475 - 23580);
    assert.equal(r.aTiempo, false);
    /* Y sin gasto, es el motor tarde. */
    assert.equal(R.repartir(20000, 0, { aTiempo: false }).garantia, 16000);
  });

  test('aTiempo se asume true si no viene, y un valor que no es booleano es un error', () => {
    assert.equal(R.repartir(20000, 0).aTiempo, true);
    assert.equal(R.repartir(20000, 0, {}).factor, 0.80);
    assert.throws(() => R.repartir(20000, 0, { aTiempo: 'si' }), TypeError);
  });

  test('descubierto: cuando el gasto es más que el costo, el neto es cero y el sobrante lo pone Joan', () => {
    /* Un crédito de 20.000 al 20 %: costo 4.000, TumiPay cobra 3.860.
       Uno de 10.000: costo 2.000, TumiPay 3.680. El cliente no ve nada de
       esto: su garantía simplemente no sube, y no baja. */
    const r = R.repartir(2000, 3680);
    assert.equal(r.neto, 0);
    assert.equal(r.garantia, 0);
    assert.equal(r.ganancia, 0);
    assert.equal(r.gasto, 2000, 'el costo absorbió lo que pudo');
    assert.equal(r.descubierto, 1680, 'y el resto quedó descubierto');
    assert.equal(R.repartir(0, 700).descubierto, 700);
    assert.equal(R.repartir(4000, 4000).descubierto, 0);
  });

  test('gasto omitido es cero; costo o gasto negativos o basura, error dicho y no cero silencioso', () => {
    assert.equal(R.repartir(35000).garantia, 28000);
    assert.equal(R.repartir(35000, null).garantia, 28000);
    assert.throws(() => R.repartir(-1, 0), RangeError);
    assert.throws(() => R.repartir(35000, -1), RangeError);
    assert.throws(() => R.repartir('35000', 0), TypeError);
    assert.throws(() => R.repartir(undefined, 0), TypeError);
    assert.throws(() => R.repartir(NaN, 0), TypeError);
  });
});

/* ==========================================================================
 * 4. EL GASTO DEL PROVEEDOR
 * ======================================================================== */
describe('gastoTumiPay y gastoManual', () => {

  test('la cuenta de Joan: 2.800 al desembolsar + 1,5 % de lo recaudado + 700 al cobrar', () => {
    assert.equal(R.gastoTumiPay(100000, 35000), 2800 + Math.round(0.015 * 135000) + 700);
    assert.equal(R.gastoTumiPay(100000, 35000), 5525);
    assert.equal(R.gastoTumiPay(100000, 20000), 5300);
    assert.equal(R.gastoTumiPay(50000, 10000), 4400);
    assert.equal(R.gastoTumiPay(0, 0), 3500, 'las dos tarifas fijas se cobran aunque no haya monto');
  });

  test('con IVA: la SUMA por 1,19, redondeada una sola vez', () => {
    assert.equal(R.gastoTumiPay(100000, 35000, { conIva: true }), Math.round(5525 * 1.19));
    assert.equal(R.gastoTumiPay(100000, 35000, { conIva: true }), 6575);
    /* La celda que separa «redondear la suma» de «redondear cada tarifa»:
       23.750 × 1,19 = 28.262,5 → 28.263. Tarifa a tarifa daría otra cosa. */
    assert.equal(R.gastoTumiPay(1000000, 350000, { conIva: true }), 28263);
    assert.equal(R.gastoTumiPay(50000, 17500, { conIva: true }), 5370);
    assert.equal(R.gastoTumiPay(50000, 17500, { conIva: false }), 4513);
    assert.equal(R.gastoTumiPay(50000, 17500, {}), 4513, 'sin decirlo, sin IVA');
  });

  test('manual es cero, siempre, con lo que sea', () => {
    assert.equal(R.gastoManual(), 0);
    assert.equal(R.gastoManual(100000, 35000), 0);
    assert.equal(R.gastoManual(100000, 35000, { conIva: true }), 0);
  });

  test('capital o costo inválidos revientan', () => {
    assert.throws(() => R.gastoTumiPay(-1, 0), RangeError);
    assert.throws(() => R.gastoTumiPay('100000', 35000), TypeError);
    assert.throws(() => R.gastoTumiPay(100000), TypeError);
  });
});

/* ==========================================================================
 * 5. LA TASA POR CUPO: los cuatro casos de la decisión 7a
 * ======================================================================== */
describe('tasaPorCupo', () => {

  test('sin garantía y hasta 100.000: el 35 % de novato', () => {
    assert.deepEqual(R.tasaPorCupo(100000, 0), { tasa: 0.35, motivo: 'nuevo', tope: 100000 });
    assert.equal(R.tasaPorCupo(50000, 0).motivo, 'nuevo');
    assert.equal(R.tasaPorCupo(50000, undefined).motivo, 'nuevo', 'cupo omitido es cupo cero');
    /* El sinGarantia explícito manda aunque venga un cupo: es la bandera de
       «no tiene historial», no una cuenta. */
    assert.equal(R.tasaPorCupo(80000, 500000, { sinGarantia: true }).tasa, 0.35);
  });

  test('sin garantía y más de 100.000: no se cotiza (tope_nuevo)', () => {
    assert.deepEqual(R.tasaPorCupo(100001, 0), { tasa: null, motivo: 'tope_nuevo', tope: 100000 });
    assert.equal(R.tasaPorCupo(200000, 0, { sinGarantia: true }).tasa, null);
  });

  test('dentro del cupo: el 20 % estándar, con el cupo justo incluido', () => {
    assert.deepEqual(R.tasaPorCupo(46250, 46250), { tasa: 0.20, motivo: 'dentro', tope: 46250 });
    assert.equal(R.tasaPorCupo(46250, 46250 + 1).motivo, 'dentro');
    assert.equal(R.tasaPorCupo(1, 46250).tasa, 0.20);
  });

  test('por encima del cupo: null, lo revisa Joan; el 25 % existe pero no se cotiza solo', () => {
    assert.deepEqual(R.tasaPorCupo(46251, 46250), { tasa: null, motivo: 'sobre_cupo', tope: 46250 });
    assert.equal(R.TASA_SOBRE_CUPO, 0.25);
    /* Ninguna rama devuelve 0,25: si algún día se cotiza, es una decisión de
       Joan (7b) que hay que escribir aquí, no un descuido. */
    for (const [k, q] of [[1, 0], [100000, 0], [100001, 0], [50, 100], [200, 100], [1e6, 1e6], [1e6 + 1, 1e6]]) {
      assert.notEqual(R.tasaPorCupo(k, q).tasa, 0.25, 'cotizó el 25 % con capital ' + k + ' y cupo ' + q);
    }
  });

  test('un capital de cero o negativo es un error, no una tasa', () => {
    assert.throws(() => R.tasaPorCupo(0, 100000), RangeError);
    assert.throws(() => R.tasaPorCupo(-5, 100000), RangeError);
    assert.throws(() => R.tasaPorCupo('100', 100000), TypeError);
  });
});

/* ==========================================================================
 * 6. LA ESCALERA
 * ======================================================================== */
describe('la escalera', () => {

  test('con gasto 0 y tasa 0,20 es la de Tu Garantía: 6 créditos para volver a 100.000 (eran 7 con el 75/25)', () => {
    const e = R.escalera(0, 20000, { meta: 100000, primero: NOVATO });
    assert.equal(e.creditos, 6);
    assert.equal(e.alcanzada, true);
    assert.equal(e.atascada, false);
    assert.deepEqual(e.pasos.map(p => p.cupo), [48000, 55680, 64589, 74923, 86911, 100817]);
    assert.equal(e.pasos[0].tasa, 0.35, 'el primero es el de novato');
    assert.equal(e.pasos[1].tasa, 0.20, 'y del segundo en adelante, el estándar');
    assert.equal(e.pasos[1].capital, e.pasos[0].cupo, 'cada peldaño pide todo el cupo anterior');
    assert.equal(R.creditosHasta(100000, 0, 20000, { primero: NOVATO }), 6);
  });

  test('con TumiPay son 10 créditos (eran 11 con el 75/25), fila por fila', () => {
    const ESPERADA = [
      [1, 100000, 0.35, 35000, 5525, 23580, 23580, 43580],
      [2, 43580, 0.20, 8716, 4284, 3546, 27126, 47126],
      [3, 47126, 0.20, 9425, 4348, 4062, 31188, 51188],
      [4, 51188, 0.20, 10238, 4421, 4654, 35842, 55842],
      [5, 55842, 0.20, 11168, 4505, 5330, 41172, 61172],
      [6, 61172, 0.20, 12234, 4601, 6106, 47278, 67278],
      [7, 67278, 0.20, 13456, 4711, 6996, 54274, 74274],
      [8, 74274, 0.20, 14855, 4837, 8014, 62288, 82288],
      [9, 82288, 0.20, 16458, 4981, 9182, 71470, 91470],
      [10, 91470, 0.20, 18294, 5146, 10518, 81988, 101988]
    ];
    const e = R.escalera(0, 20000, { meta: 100000, gasto: tumipay, primero: NOVATO });
    assert.equal(e.creditos, 10);
    assert.equal(e.pasos.length, 10);
    e.pasos.forEach((p, i) => {
      assert.deepEqual([p.n, p.capital, p.tasa, p.costo, p.gasto, p.suma, p.acumulada, p.cupo], ESPERADA[i],
        'la fila ' + (i + 1) + ' de la escalera con TumiPay no es la de la cuenta a mano');
    });
  });

  test('con IVA son 12 (eran 13)', () => {
    assert.equal(R.creditosHasta(100000, 0, 20000, { gasto: tumipayIva, primero: NOVATO }), 12);
  });

  test('el millón del préstamo con garantía se cuenta sobre la GANADA, no sobre el cupo: 29 y 31 (eran 31 y 33)', () => {
    /* MONTO_MINIMO_RESPALDADO es garantía ganada a secas; el cupón no cuenta.
       Los 29/31 solo salen así (31/33 en el plan, con el 75/25). Sobre el cupo daría uno menos, y
       sería prometer que los datos acercan al millón. */
    assert.equal(M.MONTO_MINIMO_RESPALDADO, 1000000);
    const o = { sobre: 'ganada', primero: NOVATO };
    assert.equal(R.creditosHasta(M.MONTO_MINIMO_RESPALDADO, 0, 20000, Object.assign({ gasto: tumipay }, o)), 29);
    assert.equal(R.creditosHasta(M.MONTO_MINIMO_RESPALDADO, 0, 20000, Object.assign({ gasto: tumipayIva }, o)), 31);
    /* Y las dos cifras de la ficha completa del mismo párrafo del plan. */
    assert.equal(R.creditosHasta(M.MONTO_MINIMO_RESPALDADO, 0, 100000, Object.assign({ gasto: tumipay }, o)), 19);
    assert.equal(R.creditosHasta(M.MONTO_MINIMO_RESPALDADO, 0, 100000, o), 16);
    const e = R.escalera(0, 20000, Object.assign({ meta: 1000000, gasto: tumipay }, o));
    assert.equal(e.sobre, 'ganada');
    assert.ok(e.pasos[e.pasos.length - 1].acumulada >= 1000000);
    assert.ok(e.pasos[e.pasos.length - 2].acumulada < 1000000, 'paró en el primer peldaño que llega, no después');
    assert.throws(() => R.escalera(0, 0, { meta: 1, sobre: 'total' }), RangeError);
  });

  test('la meta ya alcanzada: cero créditos, sin peldaños', () => {
    const e = R.escalera(150000, 20000, { meta: 100000 });
    assert.equal(e.creditos, 0);
    assert.equal(e.alcanzada, true);
    assert.deepEqual(e.pasos, []);
    assert.equal(e.cupo_inicial, 170000);
    assert.equal(e.ganada_inicial, 150000);
  });

  test('sin primero y con cupo cero no arranca, y lo dice (atascada) en vez de fingir 60 peldaños', () => {
    const e = R.escalera(0, 0, { meta: 100000 });
    assert.equal(e.creditos, null);
    assert.equal(e.alcanzada, false);
    assert.equal(e.atascada, true);
    assert.equal(e.pasos.length, 1);
    assert.equal(e.pasos[0].suma, 0);
  });

  test('si el gasto se come el costo, se atasca; si solo lo muerde, sube más despacio', () => {
    /* Créditos de 20.000 al 20 % con TumiPay: costo 4.000, gasto 3.860,
       suma 112 el primero. Sube lentísimo pero sube: 35 créditos, y se dice. */
    assert.equal(R.creditosHasta(100000, 0, 20000, { gasto: tumipay }), 35);
    /* Un gasto que deja un peso de neto en cada peldaño: suma 1 por crédito.
       La escalera sube y no llega en 60: null SIN atasco. */
    const lenta = R.escalera(0, 20000, { meta: 100000, gasto: (k, c) => c - 1 });
    assert.equal(lenta.creditos, null);
    assert.equal(lenta.atascada, false);
    assert.equal(lenta.pasos.length, 60, 'agotó maxPasos');
    /* Un gasto fijo mayor que cualquier costo: el primer peldaño suma cero y
       el siguiente sería idéntico. */
    const muerta = R.escalera(0, 20000, { meta: 100000, gasto: () => 99999 });
    assert.equal(muerta.atascada, true);
    assert.equal(muerta.pasos.length, 1);
    /* Con primero, el segundo peldaño NO es idéntico al primero aunque el
       primero sume cero (cambia el capital), así que no se declara atasco ahí. */
    const conNovato = R.escalera(0, 20000, { meta: 100000, gasto: (k) => (k === 100000 ? 99999 : 0), primero: NOVATO });
    assert.equal(conNovato.pasos[0].suma, 0);
    assert.ok(conNovato.pasos.length > 1);
    assert.equal(conNovato.alcanzada, true);
  });

  test('maxPasos se respeta y las opciones inválidas revientan', () => {
    assert.equal(R.escalera(0, 20000, { meta: 1e7, maxPasos: 5, primero: NOVATO }).pasos.length, 5);
    assert.throws(() => R.escalera(0, 20000, {}), TypeError, 'sin meta');
    assert.throws(() => R.escalera(0, 20000, { meta: 0 }), RangeError);
    assert.throws(() => R.escalera(-1, 20000, { meta: 1 }), RangeError);
    assert.throws(() => R.escalera(0, 20000, { meta: 1, gasto: 5 }), TypeError, 'gasto tiene que ser función');
    /* La meta tiene que estar lejos: con la meta ya alcanzada no hay peldaño
       y el gasto ni se llama. */
    assert.throws(() => R.escalera(0, 20000, { meta: 100000, gasto: () => -1 }), RangeError, 'un gasto negativo es un error');
    assert.throws(() => R.escalera(0, 20000, { meta: 1, primero: { capital: 0, tasa: 0.35 } }), RangeError);
  });

  test('creditosHasta no le cambia las opciones a quien llama', () => {
    const o = { gasto: tumipay, primero: NOVATO };
    R.creditosHasta(100000, 0, 20000, o);
    assert.deepEqual(Object.keys(o).sort(), ['gasto', 'primero']);
  });
});

/* ==========================================================================
 * 7. LA PILA DE PLATA
 * ======================================================================== */
describe('monedas', () => {

  test('0 · 5.000 · 45.000 · 145.000 · 1.000.000', () => {
    assert.deepEqual(R.monedas(0), { lingotes: 0, monedas: 0, media: false, total: 0 });
    assert.deepEqual(R.monedas(5000), { lingotes: 0, monedas: 0, media: true, total: 5000 });
    assert.deepEqual(R.monedas(45000), { lingotes: 0, monedas: 4, media: true, total: 45000 });
    assert.deepEqual(R.monedas(145000), { lingotes: 1, monedas: 4, media: true, total: 145000 });
    assert.deepEqual(R.monedas(1000000), { lingotes: 10, monedas: 0, media: false, total: 1000000 });
  });

  test('el primer crédito pagado en fecha deja dos monedas y media (hoy 28.000; con TumiPay dos: 23.580)', () => {
    assert.deepEqual(R.monedas(28000), { lingotes: 0, monedas: 2, media: true, total: 28000 });
    assert.deepEqual(R.monedas(23580), { lingotes: 0, monedas: 2, media: false, total: 23580 });
    assert.equal(R.monedas(4999).media, false, 'por debajo de la mitad no hay media moneda');
    assert.equal(R.monedas(109999).monedas, 0);
    assert.equal(R.monedas(109999).lingotes, 1);
  });

  test('una cuenta sin vincular (ganada undefined) pinta el molde vacío, no revienta', () => {
    assert.deepEqual(R.monedas(undefined), { lingotes: 0, monedas: 0, media: false, total: 0 });
    assert.deepEqual(R.monedas(null), R.monedas(0));
    assert.deepEqual(R.monedas(-500), R.monedas(0));
    assert.deepEqual(R.monedas('45000'), R.monedas(0), 'una cadena no es plata');
    assert.equal(R.monedas(45000.9).total, 45000, 'los centavos no existen');
  });
});

/* ==========================================================================
 * 8. LAS FRASES: pesos y palabras, ni un porcentaje
 * ======================================================================== */
describe('las frases en pesos', () => {
  const sinPorcentaje = (t, donde) => assert.ok(!/\d\s?%/.test(t), donde + ' le muestra un porcentaje al cliente: ' + t);

  test('pesos() pinta con puntos de miles y sin depender del locale', () => {
    assert.equal(R.pesos(0), '$0');
    assert.equal(R.pesos(999), '$999');
    assert.equal(R.pesos(1000), '$1.000');
    assert.equal(R.pesos(135000), '$135.000');
    assert.equal(R.pesos(1234567), '$1.234.567');
    assert.equal(R.pesos(-300), '−$300');
    assert.equal(R.pesos(22106.4), '$22.106');
    assert.equal(R.pesos(undefined), '$0');
  });

  test('garantiaEnPalabras: con gasto, sin gasto, tarde y descubierto', () => {
    const conGasto = R.garantiaEnPalabras(R.repartir(35000, 5525));
    assert.match(conGasto, /\$35\.000 del costo, \$5\.525 son gastos del pago/);
    assert.match(conGasto, /\$29\.475 que quedan, \$23\.580 son tu garantía \(cuatro de cada cinco pesos\)/);
    assert.match(conGasto, /\$5\.895 quedan para PlataChat/);

    const sinGasto = R.garantiaEnPalabras(R.repartir(35000, 0));
    assert.doesNotMatch(sinGasto, /gastos/, 'con Nequi no se le habla de gastos que no hubo');
    assert.match(sinGasto, /\$28\.000 son tu garantía \(cuatro de cada cinco pesos\)/);

    const tarde = R.garantiaEnPalabras(R.repartir(20000, 0, { aTiempo: false }));
    /* Desde el 23-sep pagar tarde suma lo mismo por el costo, y lo que no
       suma es la mora: la frase tiene que decir las dos cosas. */
    assert.match(tarde, /\$16\.000 son tu garantía/);
    assert.match(tarde, /igual que en fecha/);
    assert.match(tarde, /mora no suma/);
    assert.doesNotMatch(tarde, /la mitad/, 'el bono por puntualidad se retiró el 23-sep');

    const descubierto = R.garantiaEnPalabras(R.repartir(2000, 3680));
    assert.match(descubierto, /\$1\.680 que el costo no alcanza a cubrir los pone PlataChat, no tú/);

    assert.match(R.garantiaEnPalabras(R.repartir(0, 0)), /Todavía no hay costo pagado/);
    assert.match(R.garantiaEnPalabras(undefined), /Todavía no hay costo pagado/);
    [conGasto, sinGasto, tarde, descubierto].forEach(t => sinPorcentaje(t, 'garantiaEnPalabras'));
  });

  test('escaleraEnPalabras: en pesos y en créditos, distingue cupo de ganada, y no promete lo que no llega', () => {
    const t1 = R.escaleraEnPalabras(R.escalera(0, 20000, { meta: 100000, gasto: tumipay, primero: NOVATO }));
    assert.match(t1, /Te faltan \$80\.000 de garantía para pedir \$100\.000: 10 créditos pagados en fecha/);
    assert.match(t1, /de una sola vez/, 'dice que supone un solo pago por crédito');
    assert.doesNotMatch(t1, /ganada/);

    const t2 = R.escaleraEnPalabras(R.escalera(23580, 20000, { meta: 1000000, sobre: 'ganada', gasto: tumipay }));
    assert.match(t2, /\$976\.420 de garantía ganada para llegar a \$1\.000\.000 ganados: 28 créditos/);

    assert.match(R.escaleraEnPalabras(R.escalera(200000, 20000, { meta: 100000 })), /Ya puedes pedir \$100\.000/);
    assert.match(R.escaleraEnPalabras(R.escalera(1000000, 0, { meta: 1000000, sobre: 'ganada' })), /Ya tienes \$1\.000\.000 de garantía ganada/);
    assert.match(R.escaleraEnPalabras(R.escalera(0, 3000, { meta: 100000, gasto: () => 99999 })), /no suben tu garantía/);
    assert.match(R.escaleraEnPalabras(R.escalera(0, 20000, { meta: 100000, gasto: (k, c) => c - 1 })), /más de 60 créditos, y eso no se promete/);
    assert.match(R.escaleraEnPalabras(R.escalera(0, 20000, { meta: 48000, primero: NOVATO })), /1 crédito pagado en fecha/);

    [R.escalera(0, 20000, { meta: 100000, primero: NOVATO }), R.escalera(0, 0, { meta: 5 }), R.escalera(1, 1, { meta: 1 })]
      .map(R.escaleraEnPalabras).forEach(t => sinPorcentaje(t, 'escaleraEnPalabras'));
  });

  test('frases agrupa las mismas funciones (el contrato las nombra ahí)', () => {
    assert.equal(R.frases.garantiaEnPalabras, R.garantiaEnPalabras);
    assert.equal(R.frases.escaleraEnPalabras, R.escaleraEnPalabras);
    assert.equal(R.frases.pesos, R.pesos);
  });
});

/* ==========================================================================
 * 9. EL MÓDULO ES PURO Y CARGA EN LOS DOS MUNDOS
 * ======================================================================== */
/* ==========================================================================
 * 6. LOS CORTES HASTA UNA FECHA (15-sep-2026)
 * Con el motor REAL cargado: la fecha que ve el cliente en la calculadora
 * tiene que ser la que Joan vería en el Panel al aplicar la prórroga. Desde
 * el 15-sep-2026 los cortes son 30-sep, 15-oct y 31-oct (sábado: vale como
 * corte), y los días 15, 30 y 46.
 * ======================================================================== */
describe('los cortes hasta una fecha, con el motor real', () => {

  const HOY = '2026-09-15';

  test('pagando el 30 de septiembre es UN corte; el 15 de octubre, dos; el 31, tres', () => {
    assert.deepEqual(R.cortesHasta(HOY, '2026-09-30', M),
      { cortes: 1, fechas: ['2026-09-30'], fecha: '2026-09-30', dias: 15, recortado: false });
    assert.deepEqual(R.cortesHasta(HOY, '2026-10-15', M),
      { cortes: 2, fechas: ['2026-09-30', '2026-10-15'], fecha: '2026-10-15', dias: 30, recortado: false });
    assert.deepEqual(R.cortesHasta(HOY, '2026-10-31', M),
      { cortes: 3, fechas: ['2026-09-30', '2026-10-15', '2026-10-31'], fecha: '2026-10-31', dias: 46, recortado: false });
  });

  test('una fecha entre cortes salta al corte que la cubre; una anterior al primero, al primero', () => {
    const r = R.cortesHasta(HOY, '2026-10-03', M);
    assert.equal(r.cortes, 2);
    assert.equal(r.fecha, '2026-10-15');
    assert.equal(R.cortesHasta(HOY, '2026-10-01', M).fecha, '2026-10-15');
    assert.equal(R.cortesHasta(HOY, '2026-10-16', M).fecha, '2026-10-31');
    assert.equal(R.cortesHasta(HOY, '2026-09-20', M).cortes, 1);
    assert.equal(R.cortesHasta(HOY, '2026-09-15', M).cortes, 1);
    assert.equal(R.cortesHasta(HOY, '2026-01-01', M).cortes, 1, 'una fecha pasada no da cero cortes');
  });

  test('las fechas son las del motor: calcularFechaCorte para la primera y fechaCorteProrroga para las demás', () => {
    const f = R.cortesDesde(HOY, 4, M);
    assert.equal(f[0], M.calcularFechaCorte(HOY));
    for (let i = 1; i < f.length; i++) assert.equal(f[i], M.fechaCorteProrroga(f[i - 1]));
    assert.deepEqual(f, ['2026-09-30', '2026-10-15', '2026-10-31', '2026-11-17']);
    /* El 15 de noviembre de 2026 es domingo y el 16 festivo: el motor corre
       el corte al 17, y acá sale corrido igual, sin cuenta propia. */
    assert.ok(M.esFestivo('2026-11-16'));
    assert.deepEqual(R.cortesHasta(HOY, '2026-11-01', M).fechas, ['2026-09-30', '2026-10-15', '2026-10-31', '2026-11-17']);
    /* Desde otro día: el desembolso decide el primer corte (ventana mínima incluida). */
    assert.deepEqual(R.cortesDesde('2026-09-28', 2, M), [M.calcularFechaCorte('2026-09-28'), M.fechaCorteProrroga(M.calcularFechaCorte('2026-09-28'))]);
  });

  test('maxCortes recorta y lo dice: con tope 3, el 31 de diciembre se queda en el 31 de octubre', () => {
    const r = R.cortesHasta(HOY, '2026-12-31', M, { maxCortes: 3 });
    assert.equal(r.cortes, 3);
    assert.equal(r.fecha, '2026-10-31');
    assert.equal(r.recortado, true);
    assert.equal(R.cortesHasta(HOY, '2026-10-31', M, { maxCortes: 3 }).recortado, false);
    /* Con tope 1 todo cae en el primer corte, que es lo que hace la pantalla
       si el nivel no admitiera prórrogas. */
    assert.deepEqual(R.cortesHasta(HOY, '2026-10-31', M, { maxCortes: 1 }).fechas, ['2026-09-30']);
    /* Sin tope, una fecha absurda se frena sola en 60 cortes en vez de recorrer años. */
    assert.equal(R.cortesHasta(HOY, '2099-12-31', M).cortes, 60);
  });

  test('las fechas entran como texto AAAA-MM-DD y el motor por parámetro; lo demás se rechaza con su nombre', () => {
    assert.throws(() => R.cortesHasta('hoy', '2026-10-03', M), /desembolsoISO: se esperaba una fecha AAAA-MM-DD/);
    assert.throws(() => R.cortesHasta(HOY, new Date(2026, 9, 3), M), /pagoISO: se esperaba una fecha AAAA-MM-DD/);
    assert.throws(() => R.cortesHasta(HOY, '2026-10-03'), /motor: se esperaba MotorReglas con calcularFechaCorte/);
    assert.throws(() => R.cortesHasta(HOY, '2026-10-03', { calcularFechaCorte() {} }), /motor: se esperaba MotorReglas con fechaCorteProrroga/);
    assert.throws(() => R.cortesHasta(HOY, '2026-10-03', M, { maxCortes: 0 }), /maxCortes: debe ser mayor que cero/);
    assert.throws(() => R.cortesHasta(HOY, '2026-10-03', M, { maxCortes: 1.5 }), /maxCortes: se esperaba un entero/);
    assert.throws(() => R.cortesDesde(HOY, 0, M), /cantidad: debe ser mayor que cero/);
    /* Una fecha que no existe la rechaza el motor, no se disimula. */
    assert.throws(() => R.cortesHasta('2026-02-30', '2026-10-03', M), /esa fecha no existe/);
  });

  test('el módulo no carga motor.js por su cuenta: sigue puro y sin require', () => {
    assert.doesNotMatch(FUENTE, /require\(\s*['"]\.\/motor/);
    /* Fuera de los comentarios (la cabecera nombra al motor para explicar la coincidencia). */
    const codigo = FUENTE.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(codigo, /MotorReglas\./, 'lee el motor por el global en vez de por parámetro');
    assert.doesNotMatch(codigo, /(window|globalThis|raiz)\.MotorReglas/);
  });
});


describe('el módulo es puro', () => {

  test('ninguna función lee la hora del sistema', () => {
    assert.doesNotMatch(FUENTE, /Date\.now/, 'usa Date.now');
    assert.doesNotMatch(FUENTE, /new\s+Date\b/, 'construye una fecha con el reloj de pared');
    assert.doesNotMatch(FUENTE, /\bperformance\.now/);
  });

  test('no habla con la red ni con el navegador', () => {
    assert.doesNotMatch(FUENTE, /fetch/, 'el módulo no debe contener la palabra fetch');
    assert.doesNotMatch(FUENTE, /XMLHttpRequest|WebSocket|navigator\./);
    assert.doesNotMatch(FUENTE, /localStorage|sessionStorage|document\./);
  });

  test('la misma entrada da la misma salida (sin estado entre llamadas)', () => {
    const a = JSON.stringify(R.escalera(0, 20000, { meta: 100000, gasto: tumipay, primero: NOVATO }));
    R.repartir(1, 1); R.monedas(1); R.tasaPorCupo(1, 1);
    const b = JSON.stringify(R.escalera(0, 20000, { meta: 100000, gasto: tumipay, primero: NOVATO }));
    assert.equal(a, b);
  });

  test('UMD: en el navegador queda como window.PlataChatReglas con la misma API', () => {
    const ventana = {};
    ventana.window = ventana;
    vm.runInNewContext(FUENTE, ventana, { filename: 'platachat-reglas.js' });
    assert.ok(ventana.PlataChatReglas, 'no dejó el global');
    assert.deepEqual(Object.keys(ventana.PlataChatReglas).sort(), Object.keys(R).sort());
    assert.equal(ventana.PlataChatReglas.repartir(35000, 5525).garantia, 23580);
  });

  test('la API del contrato está completa', () => {
    ['repartir', 'gastoTumiPay', 'gastoManual', 'tasaPorCupo', 'escalera', 'creditosHasta', 'monedas', 'garantiaEnPalabras',
     'cortesDesde', 'cortesHasta']
      .forEach(f => assert.equal(typeof R[f], 'function', 'falta ' + f));
    ['MONEDA', 'LINGOTE', 'TASA_NUEVO', 'TOPE_NUEVO', 'TASA_ESTANDAR', 'TASA_SOBRE_CUPO', 'FACTOR_GARANTIA', 'FACTOR_TARDE']
      .forEach(k => assert.equal(typeof R[k], 'number', 'falta ' + k));
    assert.equal(typeof R.TARIFA_TUMIPAY, 'object');
  });

  test('la cabecera dice el porqué: el reparto, la Ley 45 y la coincidencia con el motor', () => {
    /* Los comentarios son parte de la entrega: el próximo que abra este archivo
       tiene que poder saber por qué la garantía sale del neto sin buscar el plan. */
    assert.match(FUENTE, /Ley 45 de 1990, art\. 68/);
    assert.match(FUENTE, /gastos.*primero/i);
    assert.match(FUENTE, /neto/);
    assert.match(FUENTE, /peso a peso/i);
    assert.match(FUENTE, /acumularGarantia/);
  });
});
