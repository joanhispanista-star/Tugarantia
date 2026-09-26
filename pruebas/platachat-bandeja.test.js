/* ============================================================================
 * PLATACHAT EN LA BANDEJA DEL CRM — 26 de septiembre de 2026.
 *
 *   node --test            (desde la raíz; descubre pruebas/*.test.js)
 *
 * Dos defectos que cambiaban plata a la vista, hallados en la revisión
 * adversaria del 15-sep y aplicados el 26 (RECETA-PLATACHAT.md, pasos 12 y 13):
 *
 *   1. La bandeja recalculaba la propuesta con UN solo corte. El cliente
 *      aceptaba en su chat «devuelves $140.000, dos quincenas» y Joan leía
 *      «Total a devolver $120.000»; al desembolsar, el crédito nacía con una
 *      quincena y la fecha lejana.
 *   2. Una solicitud de PlataChat en 'nueva' —pidió y está esperando propuesta,
 *      con una hora límite en la mano— salía con «Crear crédito» y con el precio
 *      del Panel, no con el que el cliente vio.
 *
 * El orden en PlataChat es proponer → el cliente acepta → desembolsar. Estas
 * pruebas corren crm.html DE VERDAD (banco-panel.js) y comprueban que la
 * pantalla lo respeta, y que las solicitudes de Tu Garantía no cambiaron.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');

const UN_CLIENTE = {
  socios: [{ id: 's1', nombre: 'Marta Ruiz', telefono: '3004445566', whatsappIgual: true, cedula: '3004445566' }],
  prestamos: [], config: { negocio: 'Tu Garantía' }
};

/* Una solicitud de PlataChat tal como la deja base/20261005 (solicitar_platachat). */
const pc = extra => Object.assign({
  id: 501, origen: 'nube', app: 'platachat', cedula: '3004445566', celular: '3004445566', nombre: 'Marta Ruiz',
  capital: 200000, tasa: 0.20, costo: 80000, total: 280000, fecha_corte: '2026-10-31', producto: 'quincenal',
  estado: 'nueva', contrapropuesta: null,
  responder_antes_de: '2026-09-26T20:40:00Z',
  pedido: { capital: 200000, fecha_pago: '2026-10-31', cortes: 2, cupo: 267000, garantia: 150000, tiene_garantia: true,
            automatica: 'estandar', espera_minutos: 60 }
}, extra || {});

const conBandeja = (P, s) => { P.ev('_solicitudes=' + JSON.stringify([s]) + ';renderBandeja()'); return P.elems.bandeja.innerHTML; };
const avisos = P => P.ctx._avisos || [];

describe('PlataChat en la bandeja: nada se desembolsa sin propuesta aceptada (26-sep-2026)', () => {

  test('NUEVA: «Esperando TU propuesta» con la hora, sin total, y el único botón de acción es Proponer', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, pc());
    assert.match(h, /Esperando TU propuesta · hasta las /, 'no dice que la propuesta es de Joan, ni hasta qué hora');
    assert.match(h, /3:40/, 'la hora límite no sale en hora de Colombia (20:40 UTC son las 3:40 p. m.)');
    assert.match(h, / · PlataChat/, 'la fila no dice de qué app viene');
    assert.match(h, /sin proponer/, 'pinta un total que nadie le ha propuesto');
    assert.match(h, /Pidió por el chat/);
    assert.match(h, /2 cortes · todavía sin propuesta/, 'no enseña lo que pidió (los cortes)');
    assert.match(h, /✏️ Proponer/);
    assert.ok(!/Crear crédito|Desembolsar/.test(h), 'ofrece desembolsar lo que nadie le ha propuesto');
  });

  test('NUEVA, por la puerta de atrás: crearDesdeSolicitud frena y lo dice', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    conBandeja(P, pc());
    P.ev('confirm=()=>true');
    P.ev("crearDesdeSolicitud('501')");
    assert.equal(P.ev('DB.prestamos.length'), 0, 'creó un crédito sin propuesta ni aceptación');
    assert.ok(avisos(P).some(t => /todavía no tiene propuesta/.test(t) && /le propones, él acepta, y ahí desembolsas/.test(t)),
      'frenó sin decir por qué: ' + avisos(P).join(' | '));
  });

  test('NUEVA con el cupo corto: avisa que el automático NO va a proponer (esa la contesta Joan o nadie)', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, pc({ pedido: Object.assign(pc().pedido, { automatica: 'sin_cupo' }) }));
    assert.match(h, /su cupo no alcanza: el automático no va a proponer/);
    const h2 = conBandeja(P, pc());
    assert.ok(!/el automático no va a proponer/.test(h2), 'avisa de más cuando el automático sí va a contestar');
  });

  test('ACEPTADA A DOS CORTES: el total es el que el cliente aceptó, dice quién la puso, y no se registra mal', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const cp = { capital: 100000, costo_pct: 20, dias: 35, cortes: 2, costo: 40000, total: 140000, fecha_pago: '2026-10-31',
                 texto: 'Dentro de tu cupo, al precio de siempre.', por: 'automatica_1h' };
    const h = conBandeja(P, pc({ estado: 'aceptada', contrapropuesta: cp, capital: 100000 }));
    assert.match(h, /\$140\.000/, 'el total no es el que el cliente aceptó');
    assert.ok(!/\$120\.000/.test(h), 'cobra UNA quincena de una deuda de dos');
    assert.match(h, /2 cortes/);
    assert.match(h, /\(la puso el automático\)/, 'no distingue una propuesta del automático de una de Joan');
    assert.match(h, /✅ Aceptó/);
    /* El Panel todavía registra un solo corte: frena en vez de registrar mal. */
    P.ev('confirm=()=>true');
    P.ev("crearDesdeSolicitud('501')");
    assert.equal(P.ev('DB.prestamos.length'), 0, 'registró un crédito de dos cortes como si fuera de uno');
    assert.ok(avisos(P).some(t => /a 2 cortes/.test(t) && /\$140\.000/.test(t)), 'frenó sin decir por qué: ' + avisos(P).join(' | '));
  });

  test('DESCUADRE: si lo que aceptó no es lo que da el motor, la fila lo dice y no se desembolsa', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const cp = { capital: 100000, costo_pct: 20, dias: 15, cortes: 1, costo: 20000, total: 125000, fecha_pago: '2026-10-15', por: 'joan' };
    const h = conBandeja(P, pc({ estado: 'aceptada', contrapropuesta: cp, capital: 100000 }));
    assert.match(h, /él aceptó \$125\.000/);
    assert.match(h, /\(cambiada por ti\)/);
    P.ev('confirm=()=>true');
    P.ev("crearDesdeSolicitud('501')");
    assert.equal(P.ev('DB.prestamos.length'), 0, 'desembolsó una cifra que no cuadra con la que aceptó');
    assert.ok(avisos(P).some(t => /no coincide/.test(t)));
  });

  test('la propuesta del gerente se distingue: «la puso tu gerente» con los cuatro últimos de su celular', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const cp = { capital: 100000, costo_pct: 20, dias: 15, costo: 20000, total: 120000, fecha_pago: '2026-10-15', por: 'gerente:3009998877' };
    const h = conBandeja(P, pc({ estado: 'contrapropuesta', contrapropuesta: cp, capital: 100000 }));
    assert.match(h, /\(la puso tu gerente 8877\)/);
    assert.ok(!/3009998877/.test(h), 'la fila enseña el celular entero del gerente');
  });

  test('PROPONER arranca con lo que el cliente pidió, no con la política del primer crédito', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    conBandeja(P, pc());
    P.ev("editarContrapropuesta('501')");
    assert.match(P.elems.mTitle.textContent, /^Proponer · Marta Ruiz/, 'el título habla de cambiar una propuesta que no existe');
    const b = P.elems.mBody.innerHTML;
    assert.match(b, /id="cpCap"[^>]*value="200000"/, 'el capital no es el que pidió');
    assert.match(b, /id="cpPct"[^>]*value="20"/, 'el costo no es el que la calculadora le mostró (arrancó en el 35 del novato)');
  });
});

describe('Tu Garantía en la bandeja: lo de siempre, sin cambios', () => {

  test('una solicitud sin app sigue igual: nueva sin propuesta ofrece «Crear crédito» y no dice PlataChat', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const s = { id: 88, origen: 'nube', cedula: '3004445566', nombre: 'Marta Ruiz', capital: 100000, tasa: 0.2, costo: 20000,
                total: 120000, fecha_corte: '2026-10-15', producto: 'quincenal', estado: 'nueva' };
    const h = conBandeja(P, s);
    assert.match(h, /Crear crédito/);
    assert.ok(!/PlataChat|Esperando TU propuesta|sin proponer/.test(h), 'le puso reglas de PlataChat a una solicitud de Tu Garantía');
  });

  test('un primer crédito de un solo corte sigue diciendo su total de siempre', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const cp = { capital: 100000, costo_pct: 35, dias: 8, costo: 35000, total: 135000, fecha_pago: '2026-10-04', por: 'automatica' };
    const h = conBandeja(P, { id: 89, origen: 'nube', cedula: '3004445566', nombre: 'Marta Ruiz', capital: 100000, tasa: 0.35,
      costo: 35000, total: 135000, fecha_corte: '2026-10-04', producto: 'quincenal', estado: 'aceptada', contrapropuesta: cp });
    assert.match(h, /\$135\.000/);
    assert.ok(!/cortes|él aceptó/.test(h), 'le puso cortes o descuadre a una propuesta de un solo pago');
    assert.match(h, /Desembolsar/);
  });
});
