'use strict';
/* ==========================================================================
 * PRESTAR DESDE LA CALLE — Fase C
 * 23 de septiembre de 2026
 *
 * El espejo decía con todas las letras que no crea créditos: «eso se hace en el
 * computador». Era verdad y era el hueco más caro de la pantalla, porque es LA
 * conversación de venta entera —«te presto X, me devuelves Y el día Z»— y Joan
 * la tiene de pie, delante del cliente, con el teléfono en la mano.
 *
 * Lo que este archivo vigila no es que la pantalla exista. Es que siga
 * cumpliendo las tres reglas que la hacen confiable:
 *
 *   1. NINGÚN NÚMERO SE CALCULA AHÍ. El costo lo da el motor, la fecha de corte
 *      el motor, el cupo el puente y la efectiva anual `app/creditos.js`. El día
 *      que el porcentaje se escribió a mano en ocho pantallas del Panel, ocho
 *      siguieron diciendo 90% cuando el motor ya acreditaba 75.
 *
 *   2. EL NÚMERO DEL CRÉDITO LO EMITE LA NUBE. Si el celular lo inventara sin
 *      señal, el computador podría estar entregando ese mismo número al mismo
 *      tiempo.
 *
 *   3. LAS CIFRAS PEGADAS NO SE ADIVINAN. En el computador, el cuadro de pegar
 *      toma EL NÚMERO MÁS GRANDE del texto como capital. Por ahí entró un
 *      crédito de $29.961 (CR-0043). Acá el capital NUNCA se rellena solo.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CR = require('../app/creditos.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ESPEJO = leer('panel/espejo.html');

const funcion = nombre => {
  const i = ESPEJO.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return ESPEJO.slice(i, ESPEJO.indexOf('\n}', i));
};

describe('1 · ningún número se calcula en la pantalla', () => {

  test('la efectiva anual sale de app/creditos.js', () => {
    assert.match(funcion('cotizacionCredito'), /CR\.efectivoAnualPorFechas\(/,
      'el espejo dejó de pedirle la E.A. al módulo');
    assert.match(ESPEJO, /<script src="\.\.\/app\/creditos\.js"><\/script>/,
      'no se carga el módulo de la E.A.');
  });

  test('y NO se copió la fórmula', () => {
    /* `crm.html` ya lleva una segunda implementación propia (`eaEquivalente`)
       que da el mismo número al decimal. Una tercera es como se separan. */
    assert.equal(/Math\.pow\(1 ?\+ ?c ?\/ ?100/.test(ESPEJO), false,
      'se copió la fórmula de la E.A. al espejo: ya son tres implementaciones');
  });

  test('las dos implementaciones que ya existen siguen de acuerdo', () => {
    /* Esta es la prueba que hace soportable la duplicación de crm.html: si una
       de las dos se mueve, se cae acá y no en la cara de un cliente. */
    const eaCrm = (c, d) => (Math.pow(1 + c / 100, 365 / Math.max(1, d)) - 1) * 100;
    const conFecha = (c, dias) => {
      const f = new Date('2026-09-01T12:00:00');
      f.setDate(f.getDate() + dias);
      return CR.efectivoAnualPorFechas('2026-09-01', 1000000,
        [{ fecha: f.toISOString().slice(0, 10), total: 1000000 * (1 + c / 100) }]) * 100;
    };
    [[20, 15], [20, 30], [50, 15], [8, 7], [30, 45]].forEach(([c, d]) => {
      const a = eaCrm(c, d), b = conFecha(c, d);
      assert.ok(Math.abs(a - b) / Math.max(1, a) < 1e-6,
        'la E.A. de crm.html y la de creditos.js dejaron de coincidir en ' +
        c + '% a ' + d + ' días: ' + a.toFixed(2) + ' vs ' + b.toFixed(2));
    });
  });

  test('el costo y la fecha de corte los da el motor', () => {
    const f = funcion('cotizacionCredito');
    assert.match(f, /M\.calcularCosto\(/);
    assert.match(f, /M\.calcularFechaCorte\(/);
  });

  test('el cupo lo da el puente', () => {
    assert.match(funcion('cotizacionCredito'), /P\.cupoDelSocio\(/);
  });

  test('los dos topes del costo salen del motor, no escritos a mano', () => {
    /* El techo subió del 20% al 50% el 8-sep-2026. El día que se vuelva a mover,
       esta pantalla tiene que moverse sola. */
    assert.match(ESPEJO, /var TASA_FIJA_PCT\s+= M \? Math\.round\(M\.TASA_CREDITO \* 100\)/);
    assert.match(ESPEJO, /TASA_CREDITO_MAXIMA \|\| M\.TASA_CREDITO/);
  });

  test('sin el motor no cotiza: no enseña números inventados', () => {
    assert.match(funcion('abrirNuevoCredito'), /if \(!M \|\| !P \|\| !CR\)/,
      'sin las reglas cargadas, la pantalla cotizaría con lo que sea');
  });
});

describe('2 · el número lo emite la nube', () => {

  test('se pide con siguienteNumero(credito)', () => {
    assert.match(funcion('crearCredito'), /NUBE\.siguienteNumero\('credito'\)/);
  });

  test('sin señal no presta, y lo dice ANTES de llenar el formulario', () => {
    assert.match(funcion('crearCredito'), /if \(!nubeLista\(\)\)/);
    assert.match(funcion('abrirNuevoCredito'), /Sin señal no se puede prestar/,
      'el aviso llega después de llenarlo todo, que es cuando ya no sirve');
  });

  test('el id lleva marca del aparato', () => {
    /* Dos aparatos creando en el mismo milisegundo producirían el mismo id y la
       sincronización los trataría como la misma fila. Mismo cuidado que en
       crearCliente. */
    assert.match(funcion('crearCredito'), /'P' \+ Date\.now\(\) \+ '-cel'/,
      'el id volvió a ser solo la hora: dos aparatos pueden chocar');
  });

  test('si la nube falla, NO se registra nada', () => {
    const f = funcion('crearCredito');
    const iPush = f.indexOf('DB.prestamos.push');
    const iNumero = f.indexOf("siguienteNumero('credito')");
    assert.ok(iNumero > 0 && iPush > iNumero,
      'el crédito se guarda antes de tener número: quedaría uno sin código');
    assert.match(f, /No pude pedirle el número a la nube\. No registré nada/);
  });

  test('y se encola para que suba', () => {
    assert.match(funcion('crearCredito'), /encolar\('crédito'/,
      'el crédito se crea en el teléfono y no sube nunca');
  });
});

describe('3 · las cifras pegadas no se adivinan', () => {

  test('el capital NUNCA se rellena solo', () => {
    /* La regla entera de la Fase C en una línea: `leerPegado` puede tocar el
       campo del celular —su forma no deja dudas— pero no el del capital. */
    const f = funcion('leerPegado');
    assert.equal(/getElementById\('crCap'\)/.test(f), false,
      'el texto pegado volvió a escribir el capital solo: así entró el crédito ' +
      'de $29.961, con un comprobante que traía otra cifra encima del monto real');
  });

  test('ofrece las cifras y explica por qué no elige', () => {
    assert.match(funcion('leerPegado'), /Toca la del capital/);
    assert.match(ESPEJO, /tomar la más grande metió un crédito de \$29\.961/,
      'se perdió el porqué: sin él, alguien lo "mejora" eligiendo la más grande');
  });

  test('el celular sí, porque su forma no deja dudas', () => {
    assert.match(funcion('leerPegado'), /\^3\\d\{9\}\$/,
      'se aflojó la regla del celular colombiano');
  });

  test('una cédula no se cuela como capital', () => {
    /* El tope de arriba es lo que descarta un número de cédula de diez dígitos,
       que es exactamente de donde salió el $29.961. */
    assert.match(funcion('leerPegado'), /n >= 20000 && n <= 20000000/);
  });
});

describe('las tres confirmaciones del computador, en el mismo orden', () => {

  test('el cupo, antes de tocar nada', () => {
    const f = funcion('crearCredito');
    const iCupo = f.indexOf('cupoDelSocio');
    const iPush = f.indexOf('DB.prestamos.push');
    assert.ok(iCupo > 0 && iCupo < iPush, 'el cupo se revisa después de registrar');
  });

  test('el costo por encima del estándar, aparte y con el letrero legal', () => {
    const f = funcion('crearCredito');
    assert.match(f, /COSTO POR ENCIMA DEL ESTÁNDAR/);
    assert.match(f, /art\. 305 del Código Penal.*el responsable eres tú/,
      'se perdió la mención legal: es lo que hace que quede dicho cada vez');
    assert.match(f, /Al cliente se le muestra en pesos/,
      'el cliente ve pesos, nunca porcentajes');
  });

  test('y el resumen en pesos, con el aviso de la cifra no redonda', () => {
    const f = funcion('crearCredito');
    assert.match(f, /NO ES UNA CIFRA REDONDA/,
      'la plata se entrega en billetes: un capital que no es múltiplo de mil ' +
      'casi siempre es un número que se coló');
    assert.match(f, /Total a devolver/);
  });
});

describe('la pantalla no promete lo que no hace', () => {

  test('la cabecera dejó de decir que no crea créditos', () => {
    assert.equal(/no crea créditos ni préstamos con garantía/.test(ESPEJO), false,
      'la cabecera sigue diciendo que no puede, y ahora sí puede');
    assert.match(ESPEJO, /SÍ crea créditos desde el 23-sep-2026/);
  });

  test('pero sigue diciendo lo que de verdad no hace', () => {
    /* Corregir de más es el otro lado del mismo error. Los préstamos con
       garantía son otra figura y siguen siendo del computador. */
    assert.match(ESPEJO, /Los préstamos con garantía siguen siendo del/);
    assert.match(ESPEJO, /no pacta planes de pagos/);
  });

  test('se llega desde la ficha de alguien, no de un nombre suelto', () => {
    assert.match(ESPEJO, /data-acc="cr-nuevo"/);
    assert.match(funcion('crearCredito'), /Para prestar, el cliente tiene que existir primero/,
      'se puede crear un crédito colgado de un nombre y no de una ficha');
  });
});
