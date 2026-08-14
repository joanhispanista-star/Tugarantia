/* ============================================================================
 * Pruebas del COBRO CON MONTO REAL Y DESCUENTO — panel/espejo.html
 *
 *   cd pruebas && node --test cobro.test.js
 *
 * QUÉ CUIDAN, Y POR QUÉ ESTAS Y NO OTRAS.
 *
 * Un descuento mal contado no se ve: los tres pedazos del reparto siguen sumando
 * 100%, pero de un número equivocado. El socio se lleva cupo que su plata no
 * respalda —capital de Joan retirable la quincena siguiente— y el tablero de
 * exposición BAJA justo cuando hay más expuesto. Ninguna prueba de las que ya
 * existían cazaba eso, porque hasta hoy la plata que entraba nunca se guardaba.
 *
 * Por eso acá se prueban tres cosas y en este orden:
 *   1. que el reparto cierre exacto sobre LA PLATA QUE ENTRÓ, en la rejilla fea
 *      de redondeos (1, 3, 7, 13, 99, 101) y en los dos factores;
 *   2. que el descuento esté ENTERO explicado por los dos números que la
 *      pantalla le enseña a Joan antes de confirmar (lo que sale de su ganancia
 *      + lo que sale del cupo del socio). Si esa suma no diera el descuento,
 *      habría plata perdonada que no aparece en ninguna línea;
 *   3. que las funciones REALES de espejo.html —no una copia de su lógica—
 *      hagan eso mismo. Se leen del archivo y se evalúan: si alguien las cambia,
 *      esta prueba se entera.
 *
 * Lo que NO se prueba acá y hay que saberlo: la pantalla (pintarDif) no se puede
 * ejercitar sin DOM, así que los textos que decide se revisan a ojo. Es la misma
 * limitación que tiene hoy todo lo demás de espejo.html.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../app/motor.js');
const NUBE = require('../panel/nube.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* -------------------------------------------------------------------------
   LAS FUNCIONES DE VERDAD, SACADAS DEL ARCHIVO DE VERDAD.

   espejo.html es una página, no un módulo: no se puede `require`. Copiar acá su
   lógica sería la copia número trece de este proyecto y se separaría el primer
   día. Así que se recorta el texto de la función del propio archivo y se evalúa
   con las dependencias que necesita puestas a mano. Si alguien le cambia el
   nombre o la firma, esto revienta — que es exactamente lo que se quiere.
   ------------------------------------------------------------------------- */
/* Los saltos se normalizan a \n: el repo se edita en Windows y el archivo llega
   con CRLF, así que buscar '\n}\n' para cerrar una función no encontraría nada. */
const FUENTE = leer('panel/espejo.html').replace(/\r\n/g, '\n');

function recortarFuncion(nombre) {
  const i = FUENTE.indexOf('\nfunction ' + nombre + '(');
  assert.notEqual(i, -1, 'no encontré function ' + nombre + '() en panel/espejo.html');
  const j = FUENTE.indexOf('\n}\n', i);
  assert.notEqual(j, -1, nombre + ': no encontré el cierre de la función');
  return FUENTE.slice(i + 1, j + 3);
}

/* El entorno mínimo que esas dos funciones tocan: el motor, el puente (solo para
   el cupón pendiente) y socioDe/DB. Nada más. */
function armarEntorno(cuponPendiente) {
  const fuente = recortarFuncion('cuentasDelCobro') + '\n' + recortarFuncion('repartoDelDescuento');
  const fabrica = new Function('M', 'P', 'DB', 'socioDe', 'COP',
    fuente + '\nreturn {cuentasDelCobro: cuentasDelCobro, repartoDelDescuento: repartoDelDescuento};');
  return fabrica(
    M,
    { contabilidadCupon: () => ({ cupon_pendiente: cuponPendiente === undefined ? Infinity : cuponPendiente }) },
    { prestamos: [], socios: [] },
    () => ({ id: 's1' }),
    n => '$' + Math.round(Number(n) || 0)
  );
}

/* Una liquidación como la que devuelve el puente, con lo que este frente usa. */
function liq(capital, costo, mora, acredita) {
  return {
    capital, costo, recargo_mora: mora,
    costo_total_pagado: costo + mora,
    total_a_pagar: capital + costo + mora,
    acredita_en_fecha: acredita !== false,
    garantia_generada: M.acumularGarantia(costo + mora, acredita !== false)
  };
}

const COSTOS = [0, 1, 3, 7, 13, 99, 101, 20000, 40000, 33333];
const MORAS = [0, 1, 999, 20000, 160000];

/* ==========================================================================
 * 1. EL REPARTO CIERRA SOBRE LA PLATA QUE ENTRÓ
 * ======================================================================== */

describe('el reparto sigue sumando 100% exacto con descuento', () => {

  test('garantía + cupón + operativo == lo que entró, en toda la rejilla', () => {
    let casos = 0;
    for (const costo of COSTOS) {
      for (const mora of MORAS) {
        for (const dCosto of [0, 1, costo, Math.floor(costo / 3)]) {
          for (const dMora of [0, 1, mora, Math.floor(mora / 2)]) {
            if (dCosto > costo || dMora > mora) continue;
            for (const aTiempo of [true, false]) {
              for (const pendiente of [Infinity, 0, 5000]) {
                const entro = (costo - dCosto) + (mora - dMora);
                const r = M.repartirCosto(entro,
                  { aTiempo, producto: 'quincenal', cuponPendiente: pendiente });
                casos++;
                assert.equal(r.garantia_socio + r.amortiza_cupon + r.operativo, entro,
                  `no cierra con costo ${costo} mora ${mora} descuento ${dCosto}/${dMora}`);
                assert.equal(r.total, entro, 'el reparto se hizo sobre otro número');
              }
            }
          }
        }
      }
    }
    assert.ok(casos > 3000, 'la rejilla se encogió: ' + casos + ' casos');
  });

  test('el descuento NUNCA le sube la garantía al socio', () => {
    /* La "opción B" prohibida: acreditar el costo NOMINAL habiendo entrado
       menos. Si esto fallara, el socio quedaría con cupo que su plata no
       respalda y la exposición de Joan crecería sin que nada lo muestre. */
    for (const costo of COSTOS) {
      for (const mora of MORAS) {
        for (const aTiempo of [true, false]) {
          const opc = { aTiempo, producto: 'quincenal', cuponPendiente: Infinity };
          const nominal = M.repartirCosto(costo + mora, opc);
          for (let d = 0; d <= costo + mora; d += Math.max(1, Math.floor((costo + mora) / 7))) {
            const cobrado = M.repartirCosto(costo + mora - d, opc);
            assert.ok(cobrado.garantia_socio <= nominal.garantia_socio,
              `descuento ${d} sobre ${costo + mora} subió la garantía`);
          }
        }
      }
    }
  });
});

/* ==========================================================================
 * 2. EL DESCUENTO ESTÁ ENTERO EXPLICADO EN PANTALLA
 * ======================================================================== */

describe('lo que la pantalla le promete a Joan antes de confirmar', () => {

  test('descuento == lo que sale de tu ganancia + lo que sale del cupo de él', () => {
    /* Los dos números que pinta la hoja de cobro. Si su suma no diera el
       descuento, habría plata perdonada sin dueño en la pantalla: Joan creería
       que un descuento le cuesta menos de lo que le cuesta. */
    const E = armarEntorno();
    for (const costo of [40000, 33333, 101, 7]) {
      for (const mora of [0, 999, 20000, 160000]) {
        for (const aTiempo of [true, false]) {
          const l = liq(200000, costo, mora, aTiempo);
          for (const dMora of [0, Math.floor(mora / 2), mora]) {
            for (const dCosto of [0, Math.floor(costo / 3), costo]) {
              const q = E.cuentasDelCobro({ id: 'p1', socioId: 's1' }, l,
                { condonaCosto: dCosto, condonaMora: dMora });
              assert.equal(q.de_tu_ganancia + q.de_su_cupo, dCosto + dMora,
                `descuento ${dCosto}+${dMora} sobre costo ${costo} mora ${mora}: no cuadra`);
            }
          }
        }
      }
    }
  });

  test('el ejemplo de Joan, con los números que va a ver', () => {
    /* Capital 200.000, costo 40.000, en fecha, le perdona 20.000 del costo. */
    const E = armarEntorno();
    const l = liq(200000, 40000, 0, true);
    const q = E.cuentasDelCobro({ id: 'p1', socioId: 's1' }, l, { condonaCosto: 20000 });
    assert.equal(q.ganancia_pago, 20000, 'gananciaPago tiene que ser lo que entró');
    assert.equal(q.total_a_recibir, 220000);
    assert.equal(q.garantia, 15000);
    assert.equal(q.garantia_sin_descuento, 30000);
    assert.equal(q.de_tu_ganancia, 5000, 'perdonar 20.000 de costo le cuesta a Joan 5.000');
    assert.equal(q.de_su_cupo, 15000, 'y al socio 15.000 de cupo');
  });

  test('perdonar la MORA le cuesta a Joan proporcionalmente más que perdonar el costo', () => {
    /* El dato que debería hacerlo dudar: el 47,5% de operativo de la mora es
       casi todo suyo. No es una regla del código, es una consecuencia — pero si
       algún día deja de cumplirse, la pantalla estaría diciendo otra cosa. */
    const E = armarEntorno();
    const l = liq(200000, 40000, 20000, false);   // pagó tarde
    const q = E.cuentasDelCobro({ id: 'p1', socioId: 's1' }, l, { condonaMora: 20000 });
    assert.equal(q.ganancia_pago, 40000);
    assert.equal(q.garantia, 15000);
    assert.equal(q.garantia_sin_descuento, 22500);
    assert.equal(q.de_tu_ganancia, 12500);
    assert.equal(q.de_su_cupo, 7500);
    assert.ok(q.de_tu_ganancia > q.de_su_cupo);
  });

  test('sin descuento, cuentasDelCobro devuelve exactamente lo de hoy', () => {
    /* El caso normal no puede haber cambiado ni un peso: gananciaPago sigue
       siendo costo_total_pagado y la garantía sigue siendo la del puente. */
    const E = armarEntorno();
    for (const mora of [0, 20000, 160000]) {
      for (const aTiempo of [true, false]) {
        const l = liq(200000, 40000, mora, aTiempo);
        const q = E.cuentasDelCobro({ id: 'p1', socioId: 's1' }, l, {});
        assert.equal(q.ganancia_pago, l.costo_total_pagado);
        assert.equal(q.garantia, l.garantia_generada);
        assert.equal(q.total_a_recibir, l.total_a_pagar);
        assert.equal(q.condonado_total, 0);
        assert.equal(q.de_tu_ganancia, 0);
        assert.equal(q.de_su_cupo, 0);
      }
    }
  });

  test('un descuento no puede desbordar el ciclo ni tocar el capital', () => {
    const E = armarEntorno();
    const l = liq(200000, 40000, 20000, false);
    /* Se topa contra lo causado: pedir más se recorta, no se cuela al capital. */
    const q = E.cuentasDelCobro({ id: 'p1', socioId: 's1' }, l,
      { condonaCosto: 999999, condonaMora: 999999 });
    assert.equal(q.condonado_costo, 40000);
    assert.equal(q.condonado_mora, 20000);
    assert.equal(q.ganancia_pago, 0);
    assert.equal(q.total_a_recibir, 200000, 'el capital vuelve entero siempre');
    /* Y el reparto de cero sigue cerrando. */
    assert.equal(q.reparto.garantia_socio + q.reparto.amortiza_cupon + q.reparto.operativo, 0);
  });

  test('un descuento negativo o basura no acredita nada de más', () => {
    const E = armarEntorno();
    const l = liq(200000, 40000, 20000, true);
    for (const malo of [-50000, NaN, null, undefined, 'mucho']) {
      const q = E.cuentasDelCobro({ id: 'p1', socioId: 's1' }, l,
        { condonaCosto: malo, condonaMora: malo });
      assert.equal(q.condonado_total, 0);
      assert.equal(q.ganancia_pago, 60000);
    }
  });
});

/* ==========================================================================
 * 3. DÓNDE CAE EL DESCUENTO: MORA O COSTO
 * ======================================================================== */

describe('repartoDelDescuento', () => {
  const E = armarEntorno();
  const l = liq(200000, 40000, 20000, false);

  test('por defecto vacía la mora primero', () => {
    const r = E.repartoDelDescuento(l, 20000, 'mora');
    assert.equal(r.mora, 20000);
    assert.equal(r.costo, 0);
    assert.equal(r.excede, false);
  });

  test('si lo elige, sale del costo', () => {
    const r = E.repartoDelDescuento(l, 20000, 'costo');
    assert.equal(r.costo, 20000);
    assert.equal(r.mora, 0);
  });

  test('lo que no cabe en una bolsa desborda a la otra, y se dice', () => {
    const r = E.repartoDelDescuento(l, 50000, 'mora');
    assert.equal(r.mora, 20000);
    assert.equal(r.costo, 30000);
    assert.equal(r.hay_eleccion, false, 'con desborde no hay nada que elegir');
    assert.match(r.explica, /mora/);
    assert.match(r.explica, /costo/);
  });

  test('perdonar más que costo+mora es tocar capital: se rechaza', () => {
    const r = E.repartoDelDescuento(l, 60001, 'mora');
    assert.equal(r.excede, true);
    assert.equal(r.tope, 60000);
    assert.equal(r.costo, 0);
    assert.equal(r.mora, 0);
  });

  test('sin mora no se pregunta nada', () => {
    const sinMora = liq(200000, 40000, 0, true);
    const r = E.repartoDelDescuento(sinMora, 10000, 'mora');
    assert.equal(r.hay_eleccion, false);
    assert.equal(r.costo, 10000);
    assert.equal(r.mora, 0);
  });

  test('el reparto siempre suma el faltante exacto', () => {
    for (let falta = 0; falta <= 60000; falta += 137) {
      for (const sobre of ['mora', 'costo']) {
        const r = E.repartoDelDescuento(l, falta, sobre);
        assert.equal(r.excede, false);
        assert.equal(r.costo + r.mora, falta, 'falta ' + falta + ' por ' + sobre);
        assert.ok(r.costo <= 40000 && r.mora <= 20000);
      }
    }
  });
});

/* ==========================================================================
 * 4. LOS CAMPOS NUEVOS VIAJAN Y SE FUSIONAN COMO TOCA
 * ======================================================================== */

describe('la sincronización de un cobro con descuento', () => {

  test('las condonaciones SE SUMAN: ningún aparato le borra el perdón al otro', () => {
    const mio = { id: 'c1', pagado: true, condonaciones: [
      { fecha: '2026-08-14', costo: 0, mora: 20000, motivo: 'enfermo', quien: 'celular' }] };
    const suyo = { id: 'c1', pagado: true, condonaciones: [
      { fecha: '2026-08-10', costo: 5000, mora: 0, motivo: 'cliente viejo', quien: 'computador' }] };
    const r = NUBE.fusionarFila(mio, suyo);
    assert.equal(r.fila.condonaciones.length, 2, 'se perdió un descuento al fusionar');
    assert.equal(r.fila.condonaciones[0].fecha, '2026-08-10', 'quedaron fuera de orden');
    assert.equal(r.hayChoque, false, 'un descuento en cada aparato no es un choque');
  });

  test('el mismo perdón anotado dos veces con motivo distinto es UNO solo', () => {
    const uno = { id: 'c1', condonaciones: [{ fecha: '2026-08-14', costo: 0, mora: 20000, motivo: 'enfermo', quien: 'celular' }] };
    const dos = { id: 'c1', condonaciones: [{ fecha: '2026-08-14', costo: 0, mora: 20000, motivo: 'se le enfermó el hijo', quien: 'computador' }] };
    const r = NUBE.fusionarFila(uno, dos);
    assert.equal(r.fila.condonaciones.length, 1, 'el motivo no puede duplicar el hecho');
  });

  test('dos montos recibidos distintos SÍ son choque, y Joan ve los dos', () => {
    /* El caso real: el celular cobró 240.000 con descuento y el computador
       registró "pagó todo" 260.000. Resolverlo solo sería borrar un cobro. */
    const cel = { id: 'c1', pagado: true, montoRecibido: 240000, gananciaPago: 40000 };
    const pc = { id: 'c1', pagado: true, montoRecibido: 260000, gananciaPago: 60000 };
    const r = NUBE.fusionarFila(cel, pc);
    assert.equal(r.hayChoque, true);
    const campos = r.pisables.map(x => x.campo);
    assert.ok(campos.includes('montoRecibido'), 'sin montoRecibido a la vista, Joan escoge a ciegas');
    const m = r.pisables.find(x => x.campo === 'montoRecibido');
    assert.equal(m.mio, 240000);
    assert.equal(m.suyo, 260000);
  });

  test('los campos nuevos están declarados como pisables en nube.js', () => {
    ['montoRecibido', 'costoCausado', 'moraCausada', 'saldoAFavor'].forEach(c => {
      assert.ok(NUBE.CAMPOS_PISABLES_TIPICOS.includes(c), c + ' no está documentado como pisable');
    });
    assert.ok(NUBE.LISTAS_QUE_SUMAN.condonaciones, 'condonaciones no es una lista que suma');
  });
});

/* ==========================================================================
 * 5. LO QUE EL ARCHIVO NO PUEDE DEJAR DE DECIR
 * ======================================================================== */

describe('la interfaz no promete lo que el código no cumple', () => {

  test('espejo.html guarda los cinco campos del cobro', () => {
    ['p.montoRecibido', 'p.costoCausado', 'p.moraCausada', 'p.condonaciones', 'p.gananciaPago']
      .forEach(c => assert.ok(FUENTE.includes(c + ' ='), 'falta escribir ' + c) );
  });

  test('gananciaPago se llena con lo que ENTRÓ, nunca con el nominal', () => {
    /* El centinela del frente entero. Si alguien "arregla" esto poniéndole
       liq.costo_total_pagado, el socio empieza a acuñar cupo con plata que no
       entró y no hay pantalla que lo muestre. */
    assert.match(FUENTE, /p\.gananciaPago = q\.ganancia_pago;/,
      'gananciaPago dejó de ser la plata que entró');
  });

  test('la pantalla dice que "queda debiendo" NO cierra el crédito', () => {
    assert.match(FUENTE, /NO se cierra/);
  });

  test('el sobrante avisa que no suma cupo', () => {
    assert.match(FUENTE, /No le suma cupo: no es costo/);
  });

  /* ------------------------------------------------------------------------
     EL SALDO A FAVOR: NI SE PROMETE NI SE ESCONDE.

     `p.saldoAFavor` se escribe y HOY NO LO LEE NADIE para crear el crédito
     siguiente — ni espejo.html, ni crm.html, ni puente.js, ni motor.js. Estas
     tres pruebas son el candado de esa verdad incómoda:

       · que la pantalla no vuelva a prometer una aplicación automática que no
         existe (fue exactamente el texto que había, con el socio delante);
       · que el dato se pueda CONSULTAR después de cerrar la hoja de cobro, que
         es lo que impide que un pasivo con un tercero dependa de la memoria;
       · y que si algún día alguien SÍ construye la aplicación automática, tenga
         que venir acá a cambiar estas pruebas — o sea, a decidirlo a propósito.
     ---------------------------------------------------------------------- */
  test('la pantalla NO promete que el saldo a favor se aplique solo', () => {
    /* Se miran los TEXTOS, no los comentarios: en espejo.html hay un comentario
       que CITA la promesa vieja para dejar dicho por qué se cambió. Sin quitar
       los comentarios, esta prueba se dispararía contra su propia explicación. */
    const SIN_COMENTARIOS = FUENTE.replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.doesNotMatch(SIN_COMENTARIOS, /a favor para el cr[ée]dito siguiente/i,
      'volvió la promesa: nada en el repo aplica saldoAFavor al crédito siguiente');
    assert.match(FUENTE, /todav[íi]a no se descuenta/i,
      'el aviso del sobrepago dejó de decir que la aplicación es a mano');
  });

  test('el saldo a favor se ve en el detalle del crédito', () => {
    /* Sin esto, cerrar la hoja de cobro hacía desaparecer la plata que Joan le
       debe al socio: no había NINGUNA pantalla donde consultarla. */
    const vista = recortarFuncion('vistaCredito');
    assert.match(vista, /saldoAFavor/,
      'vistaCredito volvió a no pintar el sobrepago');
    assert.match(vista, /no se descuenta sola/i,
      'el detalle del crédito dejó de advertir que la aplicación es a mano');
  });

  test('el saldo a favor se ve sumado en la ficha del socio', () => {
    const vista = recortarFuncion('vistaFicha');
    assert.match(vista, /saldoAFavor/,
      'la ficha del socio volvió a no mostrar lo que le pagó de más');
    assert.match(vista, /no se descuenta solo/i,
      'la ficha dejó de advertir que la aplicación es a mano');
  });
});
