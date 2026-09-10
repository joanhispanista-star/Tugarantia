'use strict';
/* ==========================================================================
 * LAS ETAPAS DEL CLIENTE — 10 de septiembre de 2026
 *
 * Joan describió las carteras con los días de un crédito de OCHO («día 5 →
 * D-3, día 7 → D-1, día 8 → D0»). Acá se comprueba que la regla que se
 * implementó —contar hacia atrás desde el día de pago— le da a él esos mismos
 * números Y funciona igual en un quincenal de quince días.
 *
 * Y lo que más importa: que la pregunta «¿en qué cartera estaba el día X?» se
 * conteste con el corte que regía ESE día, no con el de hoy. Una prórroga mueve
 * el corte, y contestar con el de hoy contesta mal en silencio.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../app/etapas.js');

/* Un crédito de OCHO días, como el primer crédito del cliente nuevo:
   desembolsado el 1, se paga el 9. */
const ocho = (o) => Object.assign({
  id: 'p1', numero: 1, socioId: 's1', capital: 100000, costoPct: 35,
  fechaDesembolso: '2026-09-01', cicloActual: '2026-09-09', cicloPago: '2026-09-09',
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
}, o);

/* Un quincenal de quince: desembolsado el 1, se paga el 16. */
const quince = (o) => Object.assign({
  id: 'q1', numero: 1, socioId: 's1', capital: 400000, costoPct: 20,
  fechaDesembolso: '2026-09-01', cicloActual: '2026-09-16', cicloPago: '2026-09-16',
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
}, o);

describe('las carteras que pidió Joan, con SUS números', () => {

  test('en un crédito de 8 días le dan exactamente lo que describió', () => {
    /* «cuando lleguen al 5 día el cliente ingrese a la cartera D-3… hasta
       llegar a D-1 que es el día 7… un día antes del día de pago que se llama
       D0». Desembolso el 1, pago el 9: el día 5 del crédito es el 6-sep. */
    const p = ocho();
    assert.equal(E.etapaDeCredito(p, '2026-09-06'), 'D-3', 'el día 6 debía ser D-3');
    assert.equal(E.etapaDeCredito(p, '2026-09-07'), 'D-2');
    assert.equal(E.etapaDeCredito(p, '2026-09-08'), 'D-1', 'la víspera');
    assert.equal(E.etapaDeCredito(p, '2026-09-09'), 'D0', 'el día de pago');
  });

  test('y en un quincenal de 15 días la misma regla cae donde debe', () => {
    /* Aquí está el motivo de contar hacia atrás: si se contara desde el
       desembolso, el D-3 de un quincenal caería en el día 5 —cuando todavía
       faltan diez días para pagar— y el asesor cobraría diez días antes. */
    const q = quince();
    assert.equal(E.etapaDeCredito(q, '2026-09-06'), 'CA', 'el día 5 de un quincenal NO es D-3');
    assert.equal(E.etapaDeCredito(q, '2026-09-13'), 'D-3');
    assert.equal(E.etapaDeCredito(q, '2026-09-15'), 'D-1');
    assert.equal(E.etapaDeCredito(q, '2026-09-16'), 'D0');
  });

  test('las tres carteras de mora, día por día', () => {
    const p = ocho();   // corte 9-sep
    /* M1A: 1 a 5 días */
    ['2026-09-10', '2026-09-14'].forEach(f =>
      assert.equal(E.etapaDeCredito(p, f), 'M1A', f + ' debía ser M1A'));
    /* M1B: 6 a 9 */
    ['2026-09-15', '2026-09-18'].forEach(f =>
      assert.equal(E.etapaDeCredito(p, f), 'M1B', f + ' debía ser M1B'));
    /* M1-2: 10 a 20 */
    ['2026-09-19', '2026-09-29'].forEach(f =>
      assert.equal(E.etapaDeCredito(p, f), 'M1-2', f + ' debía ser M1-2'));
    /* y pasados los 20, ya se aplicó el castigo del asesor */
    assert.equal(E.etapaDeCredito(p, '2026-09-30'), 'M2');
  });

  test('EL DÍA 20 ES EL ÚLTIMO DE M1-2, y es el mismo día en que el asesor pierde $10.000', () => {
    /* Las dos reglas tienen que caer el mismo día o la pantalla le miente al
       asesor: le diría «te quedan días» cuando ya se lo descontaron. */
    const p = ocho();
    const COMIS = require('../app/comisiones.js');
    assert.equal(E.etapaDeCredito(p, '2026-09-29'), 'M1-2', 'el día 20 todavía es la última oportunidad');
    assert.equal(E.etapaDeCredito(p, '2026-09-30'), 'M2');
    /* El castigo se fecha el día 20 del tramo: corte 9-sep + 20 = 29-sep. */
    assert.equal(COMIS.diaDelCastigo(p, '2026-12-31', 20), '2026-09-29',
      'el castigo del asesor y el fin de M1-2 se separaron');
  });

  test('lejos del pago es CA, y pagado es PAGADO', () => {
    assert.equal(E.etapaDeCredito(ocho(), '2026-09-02'), 'CA');
    assert.equal(E.etapaDeCredito(ocho({ pagado: true, fechaPagado: '2026-09-09' }), '2026-09-20'), 'PAGADO');
  });
});

describe('el descuento que puede dar el ASESOR, no el que puede dar Joan', () => {

  test('80% en M1A y 100% de M1B en adelante', () => {
    assert.equal(E.descuentoMaximo('M1A'), 80);
    assert.equal(E.descuentoMaximo('M1B'), 100);
    assert.equal(E.descuentoMaximo('M1-2'), 100);
  });

  test('antes de la mora NO hay nada que descontar', () => {
    /* Un descuento antes del día de pago no es un descuento: es rebajar el
       precio pactado, y eso no lo decide un asesor. */
    ['PC', 'CR', 'CA', 'D-3', 'D-1', 'D0'].forEach(e =>
      assert.equal(E.descuentoMaximo(e), 0, e + ' dejó descontar antes de la mora'));
  });

  test('una etapa que no existe no regala nada', () => {
    assert.equal(E.descuentoMaximo('inventada'), 0);
    assert.equal(E.descuentoMaximo(null), 0);
  });
});

describe('la pregunta con fecha adentro se contesta con el corte de ESE día', () => {

  test('UNA PRÓRROGA NO BORRA LA MORA DE AYER', () => {
    /* El defecto que este proyecto ya arregló once veces: preguntar «¿en qué
       cartera estaba el 20?» y contestar con el corte de HOY. La prórroga movió
       el corte del 9 al 24; si se contestara con el corte nuevo, el 20 de
       septiembre saldría «CA» cuando ese día el crédito llevaba once días
       vencido y estaba en M1-2. */
    const p = ocho({
      cicloActual: '2026-09-24',
      prorrogas: [{ fecha: '2026-09-21', ciclo: '2026-09-09', a: '2026-09-24' }]
    });
    assert.equal(E.etapaDeCredito(p, '2026-09-20'), 'M1-2',
      'contestó con el corte de hoy: la mora de ayer desapareció');
    /* Y del día de la prórroga en adelante manda el corte NUEVO: el 22 faltan
       dos días para el 24, así que es D-2 — la mora se acabó y el reloj de los
       recordatorios volvió a empezar. */
    assert.equal(E.etapaDeCredito(p, '2026-09-22'), 'D-2');
    assert.equal(E.etapaDeCredito(p, '2026-09-24'), 'D0', 'el corte nuevo es el nuevo día de pago');
  });

  test('sin fecha no inventa una etapa', () => {
    assert.equal(E.etapaDeCredito(ocho(), ''), null);
    assert.equal(E.etapaDeCredito(null, '2026-09-10'), null);
  });
});

describe('la etapa de una PERSONA: PC → CR → CA', () => {

  const db = {
    prestamos: [
      { id: 'p1', socioId: 's1', cicloActual: '2026-09-09', cicloPago: '2026-09-09',
        prorrogas: [], pagado: false },
      { id: 'p2', socioId: 's2', cicloActual: '2026-09-09', prorrogas: [],
        pagado: true, fechaPagado: '2026-09-09' }
    ]
  };

  test('un prospecto sin registrar es PC', () => {
    assert.equal(E.etapaDe({ tipo: 'prospecto', estado: 'nuevo' }, db, '2026-09-10'), 'PC');
    assert.equal(E.etapaDe({ tipo: 'prospecto', estado: 'contactado' }, db, '2026-09-10'), 'PC');
  });

  test('cuando se registra pasa a CR, aunque siga en la lista de prospectos', () => {
    /* Lo que manda es el hecho, no en qué tabla quedó guardado. */
    assert.equal(E.etapaDe({ tipo: 'prospecto', estado: 'registrado' }, db, '2026-09-10'), 'CR');
  });

  test('y cuando tiene crédito pasa a la cartera que le toque', () => {
    assert.equal(E.etapaDe({ tipo: 'socio', id: 's1' }, db, '2026-09-10'), 'M1A');
    assert.equal(E.etapaDe({ tipo: 'socio', id: 's2' }, db, '2026-09-20'), 'PAGADO');
  });

  test('un socio sin ningún crédito es CR, no CA', () => {
    /* Registrarse no es tener crédito. Contarlo como activo inflaría la cartera
       del asesor con gente a la que nadie le ha prestado un peso. */
    assert.equal(E.etapaDe({ tipo: 'socio', id: 's99' }, db, '2026-09-10'), 'CR');
  });

  test('CON VARIOS CRÉDITOS VIVOS manda el que está peor', () => {
    /* Es el que hay que atender hoy. Mostrar el mejor escondería la mora. */
    const dos = { prestamos: [
      { id: 'a', socioId: 's3', cicloActual: '2026-09-20', prorrogas: [], pagado: false },
      { id: 'b', socioId: 's3', cicloActual: '2026-09-01', prorrogas: [], pagado: false }
    ] };
    assert.equal(E.etapaDe({ tipo: 'socio', id: 's3' }, dos, '2026-09-10'), 'M1B',
      'mostró el crédito al día y escondió el vencido');
  });
});

describe('el resumen que ven el asesor y el gerente', () => {

  test('los dos cuentan con la MISMA función', () => {
    /* Si el tablero del asesor y el del gerente contaran por su cuenta, el día
       que una cambie el gerente vería otra cosa que su asesor y la conversación
       se vuelve sobre quién tiene razón. */
    const db = { prestamos: [
      { id: 'p1', socioId: 's1', cicloActual: '2026-09-09', prorrogas: [], pagado: false },
      { id: 'p2', socioId: 's2', cicloActual: '2026-09-20', prorrogas: [], pagado: false }
    ] };
    const gente = [
      { tipo: 'socio', id: 's1' }, { tipo: 'socio', id: 's2' },
      { tipo: 'prospecto', estado: 'nuevo' }, { tipo: 'prospecto', estado: 'registrado' }
    ];
    const r = E.resumenDeCartera(gente, db, '2026-09-10');
    assert.equal(r.M1A, 1);
    assert.equal(r.CA, 1);
    assert.equal(r.PC, 1);
    assert.equal(r.CR, 1);
    assert.equal(Object.values(r).reduce((a, b) => a + b, 0), gente.length,
      'alguien se quedó sin etapa y no aparece en ninguna columna');
  });

  test('las urgentes están en el orden en que hay que atenderlas', () => {
    /* Primero la que se va a perder. */
    assert.equal(E.URGENTES[0], 'M1-2', 'lo primero tiene que ser lo que está por vencerse del todo');
    E.URGENTES.forEach(u => assert.ok(E.ETAPAS[u], 'la urgente ' + u + ' no existe en la tabla'));
  });

  test('toda etapa tiene nombre y le dice al asesor qué hacer', () => {
    /* Una etiqueta que no dice qué hacer obliga a preguntar, y el asesor está
       en la calle. */
    E.ORDEN.forEach(k => {
      const e = E.ETAPAS[k];
      assert.ok(e, 'falta la etapa ' + k);
      assert.ok(e.nombre && e.nombre.length > 3, k + ' sin nombre legible');
      assert.ok(e.que && e.que.length > 15, k + ' no dice qué hacer');
    });
  });
});

describe('el archivo describe, no decide', () => {
  test('es puro: sin reloj de pared, sin red, sin navegador', () => {
    const fs = require('node:fs'), path = require('node:path');
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'app', 'etapas.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.ok(!/new Date\(\s*\)/.test(codigo), 'etapas.js lee el reloj de pared');
    assert.ok(!/localStorage|fetch\(|document\./.test(codigo), 'etapas.js tocó el navegador');
  });

  test('no escribe en la cartera que le pasan', () => {
    const db = { prestamos: [{ id: 'p1', socioId: 's1', cicloActual: '2026-09-09', prorrogas: [], pagado: false }] };
    const antes = JSON.stringify(db);
    E.etapaDe({ tipo: 'socio', id: 's1' }, db, '2026-09-10');
    E.resumenDeCartera([{ tipo: 'socio', id: 's1' }], db, '2026-09-10');
    assert.equal(JSON.stringify(db), antes);
  });
});
