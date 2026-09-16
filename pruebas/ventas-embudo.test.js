/* ===========================================================================
 * EL EMBUDO DE VENTAS
 *
 * Joan lo pidió el 16-sep-2026: «una pestaña de ventas con las bases y las
 * herramientas». Casi todo estaba construido y repartido en cuatro sitios; lo
 * que faltaba de verdad era que el embudo tuviera FINAL.
 *
 * EL FALLO QUE SE ARREGLA, y es de los que no se ven: `ESTADOS_PROSPECTO`
 * declaraba siete estados y `ESTADO_DE_GESTION` solo sabía escribir cuatro.
 * `registrado` y `cliente` —los dos últimos— no los asignaba nadie. Medido con
 * grep antes de tocarlo: cero asignaciones en todo el repositorio. O sea que el
 * embudo no tenía final y la conversión daba SIEMPRE cero, por mucha gente que
 * se registrara. Un número que siempre da cero no es un número: es un adorno.
 *
 * Y el poco recálculo que había vivía DENTRO de `traerGestiones`, la bajada de
 * la nube. Si Joan anotaba en su computador, el estado no se movía.
 *
 * LA CURA: no esperar a que alguien declare la conversión — mirarla. Si el
 * celular del prospecto está en la cartera, se registró. Si ese socio tiene
 * créditos, compró. Un prospecto no se declara convertido: se le nota.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');

const HOY = new Date().toISOString().slice(0, 10);

function panel(extra) {
  const P = abrirPanel();
  P.cargarCartera(Object.assign({
    socios: [], prestamos: [], prospectos: [], gestiones: [], config: { pin: '1234' }
  }, extra));
  return P;
}
const estadoDe = (P, id) =>
  P.ev('(prospectos().find(function(p){return p.id==="' + id + '";})||{}).estado');

describe('el embudo tiene final (16-sep-2026)', () => {

  test('quien está en la cartera pasa a «se registró», sin que nadie lo marque', () => {
    /* MUTANTE QUE CAZA: quitar la búsqueda en la cartera y volver a depender solo
       de ESTADO_DE_GESTION — que es el código que estuvo vivo hasta hoy. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Luis', cedula: '2', telefono: '3002222222',
                 whatsappIgual: true, gestiones: [] }],
      prospectos: [{ id: 'p2', nombre: 'Luis', celular: '3002222222', estado: 'nuevo' }]
    });
    P.ev('recalcularEmbudo()');
    assert.equal(estadoDe(P, 'p2'), 'registrado',
      'alguien que ya está en la cartera sigue contando como prospecto sin contactar');
  });

  test('y si además tiene crédito, pasa a «tomó crédito»', () => {
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001111111',
                 whatsappIgual: true, gestiones: [] }],
      prestamos: [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY }],
      prospectos: [{ id: 'p1', nombre: 'Ana', celular: '3001111111', estado: 'nuevo' }]
    });
    P.ev('recalcularEmbudo()');
    assert.equal(estadoDe(P, 'p1'), 'cliente',
      'el último paso del embudo sigue siendo inalcanzable');
  });

  test('empareja también por el número de WhatsApp, no solo por el de la ficha', () => {
    /* Alguien puede haberse registrado con su WhatsApp y no con el número por el
       que se le llamó. Es el mismo desfase que hacía que a quien pidió SALIR se
       le siguiera escribiendo. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Rosa', cedula: '3', telefono: '3009999999',
                 whatsappIgual: false, whatsappNumero: '3003333333', gestiones: [] }],
      prospectos: [{ id: 'p3', nombre: 'Rosa', celular: '3003333333', estado: 'nuevo' }]
    });
    P.ev('recalcularEmbudo()');
    assert.equal(estadoDe(P, 'p3'), 'registrado',
      'no se reconoce a quien se registró con su WhatsApp en vez de con su otro número');
  });

  test('sin hecho que lo mueva, manda la última gestión', () => {
    const P = panel({
      prospectos: [{ id: 'p4', nombre: 'Pedro', celular: '3004444444', estado: 'nuevo' }],
      gestiones: [{ id: 'g1', persona_id: 'p4', tipo: 'no_contesta', cuando: '2026-09-15T10:00:00Z' }]
    });
    P.ev('recalcularEmbudo()');
    assert.equal(estadoDe(P, 'p4'), 'no_contesta');
  });

  test('y quien YA se registró no vuelve atrás porque alguien anote «no contesta»', () => {
    /* Eso ya pasó. Un embudo que retrocede borra la única cifra que mide si la
       venta funciona.
       MUTANTE QUE CAZA: quitar la guardia de los dos estados de arriba. */
    /* EL CASO TIENE QUE SER UNO QUE NO ESTE EN LA CARTERA, o la prueba no mide
       nada: si el socio está ahí, el camino de los hechos ya lo deja en
       «registrado» y la guardia no se ejecuta. Pasó en el primer intento — el
       mutante escapó. Éste es el caso real: alguien que se registró por la app
       y que todavía no está en la cartera de Joan (o que él borró), y a quien
       después alguien le anota «no contesta». */
    const P = panel({
      socios: [],
      prospectos: [{ id: 'p2', nombre: 'Luis', celular: '3002222222', estado: 'registrado' }],
      gestiones: [{ id: 'g9', persona_id: 'p2', tipo: 'no_contesta', cuando: '2026-09-16T10:00:00Z' }]
    });
    assert.equal(P.ev('DB.socios.length'), 0,
      'con el socio en la cartera esta prueba no mide la guardia');
    P.ev('recalcularEmbudo()');
    assert.equal(estadoDe(P, 'p2'), 'registrado',
      'una gestión posterior devolvió al prospecto a un paso anterior del embudo');
  });

  test('LA CONVERSIÓN deja de dar cero', () => {
    /* El número por el que existe toda la pantalla. Con el código anterior era
       cero por construcción, pasara lo que pasara. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001111111', whatsappIgual: true, gestiones: [] },
               { id: 'S2', numero: 2, nombre: 'Luis', cedula: '2', telefono: '3002222222', whatsappIgual: true, gestiones: [] }],
      prestamos: [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY }],
      prospectos: [{ id: 'p1', nombre: 'Ana', celular: '3001111111', estado: 'nuevo' },
                   { id: 'p2', nombre: 'Luis', celular: '3002222222', estado: 'nuevo' },
                   { id: 'p3', nombre: 'Rosa', celular: '3003333333', estado: 'nuevo' },
                   { id: 'p4', nombre: 'Pedro', celular: '3004444444', estado: 'nuevo' }]
    });
    P.ev('renderVentas()');
    const c = JSON.parse(P.ev('JSON.stringify(conteoEmbudo())'));
    assert.equal(c.registrado + c.cliente, 2, 'no se cuentan los que se registraron');
    assert.equal(c.cliente, 1, 'no se cuentan los que tomaron crédito');

    const kpi = String(P.elems['kpiVentas'].innerHTML);
    assert.match(kpi, /50% de los que entraron/, 'la conversión no se muestra o da cero');
  });

  test('las salidas NO se mezclan con los pasos hacia el cliente', () => {
    /* «No contesta» no está más cerca de comprar que «sin contactar»: es la
       puerta por la que se fue. Ponerlos en la misma fila haría leer el embudo
       al revés. */
    const P = panel({ prospectos: [{ id: 'p1', nombre: 'X', celular: '3001111111', estado: 'nuevo' }] });
    P.ev('renderVentas()');
    const html = String(P.elems['embudoVentas'].innerHTML);
    const iPasos = html.indexOf('Tomó crédito');
    const iSalidas = html.indexOf('Se cayeron');
    assert.ok(iPasos > -1 && iSalidas > iPasos,
      'los estados de salida no están separados de los pasos del embudo');
  });
});

describe('anotar desde Ventas (16-sep-2026)', () => {

  test('la anotación va al MISMO cuaderno que la de Cobranzas', () => {
    /* Si fuera a otra lista, la historia de una persona quedaría partida en dos
       y ninguna de las dos pantallas la contaría entera.
       MUTANTE QUE CAZA: escribir en una lista nueva. */
    const P = panel({ prospectos: [{ id: 'p1', nombre: 'Rosa', celular: '3003333333', estado: 'nuevo' }] });
    P.ev('anotarVenta("p1")');
    P.ev('document.querySelector=function(s){ return s.indexOf("vTipo")>-1?{value:"va_a_pedir"}:null; }');
    P.ev('guardarAnotacionVenta()');

    assert.equal(P.ev('gestiones().length'), 1, 'no quedó anotada la gestión');
    assert.equal(P.ev('gestiones()[0].persona_id'), 'p1');
    assert.equal(P.ev('gestionesDe("p1").length'), 1,
      'la gestión no la encuentra el mismo lector que usa la historia del cliente');
  });

  test('y mueve el embudo en el momento, sin esperar a sincronizar', () => {
    /* El recálculo vivía dentro de la bajada de la nube: anotar en el computador
       no movía nada hasta la siguiente sincronización.
       MUTANTE QUE CAZA: quitar el recalcularEmbudo del render. */
    const P = panel({ prospectos: [{ id: 'p1', nombre: 'Rosa', celular: '3003333333', estado: 'nuevo' }] });
    P.ev('anotarVenta("p1")');
    P.ev('document.querySelector=function(s){ return s.indexOf("vTipo")>-1?{value:"no_quiere"}:null; }');
    P.ev('guardarAnotacionVenta()');
    assert.equal(estadoDe(P, 'p1'), 'no_quiso',
      'el embudo no se movió al anotar: hay que esperar a sincronizar para verlo');
  });

  test('la anotación guarda desde qué número se habló', () => {
    const P = panel({
      prospectos: [{ id: 'p1', nombre: 'Rosa', celular: '3003333333', estado: 'nuevo' }],
      config: { pin: '1234', whatsapp: '3009999999' }
    });
    P.ev('anotarVenta("p1")');
    P.ev('document.querySelector=function(s){ return s.indexOf("vTipo")>-1?{value:"contesto"}:null; }');
    P.ev('guardarAnotacionVenta()');
    assert.equal(P.ev('gestiones()[0].desde'), '3009999999',
      'no queda desde qué número se contactó: eso es lo que sirve si alguien reclama');
  });
});
