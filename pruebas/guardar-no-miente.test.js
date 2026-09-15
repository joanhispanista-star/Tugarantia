/* ===========================================================================
 * GUARDAR NUNCA MIENTE SOBRE SI GUARDÓ
 *
 * Era la línea más peligrosa de crm.html:
 *
 *     try { localStorage.setItem(KEY, JSON.stringify(DB)); }
 *     catch (e) { alert('Poco espacio en el navegador...'); }
 *
 * Cuando el navegador se llena: sale un aviso, Joan da OK, y SIGUE TRABAJANDO
 * sobre una pantalla que se ve normal — pero nada de lo que haga desde ese
 * momento se guarda. Al recargar, el día entero desaparece.
 *
 * Y se llena de verdad. Medido: las fotos son el 100% del peso de la cartera
 * (200 clientes sin fotos pesan 81 KB; con fotos, 57 MB). Con el límite típico
 * de 5 MB caben unos DIECISIETE clientes con sus tres fotos.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const N = require('../panel/nube.js');

describe('cuando el navegador se llena (15-sep-2026)', () => {

  test('con espacio, guardar() devuelve true y guarda', () => {
    const P = abrirPanel();
    assert.equal(P.ev('guardar()'), true);
    assert.equal(P.ev('_guardadoOk'), true);
  });

  test('SIN espacio, guardar() devuelve FALSE — no dice que sí', () => {
    /* Lo que hacía antes: no devolvía nada (undefined) y quien llamaba seguía
       igual. Ahora el que llama puede saber. */
    const P = abrirPanel({ topeKB: 0.001 });
    assert.equal(P.ev('guardar()'), false);
    assert.equal(P.ev('_guardadoOk'), false);
  });

  test('salva el LIBRO sacrificando las fotos', () => {
    /* Las cuentas —quién debe cuánto, los abonos, las fechas— pesan 81 KB por
       doscientos clientes y siempre caben. Perder las fotos para salvar el
       libro es la decisión correcta; hacerlo en silencio no lo es. */
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
    const P = abrirPanel({ topeKB: 30 });
    P.ev('DB.socios = [{ id: "s1", nombre: "Ana", cedula: "111", ' +
         'cedulaFrenteFoto: "' + foto + '", selfieFoto: "' + foto + '" }];');
    P.ev('DB.prestamos = [{ id: "p1", socioId: "s1", capital: 500000, abonos: [] }];');
    assert.equal(P.ev('guardar()'), false, 'dijo que guardó todo y no cabía');

    /* Y sin embargo el libro quedó: el socio y el crédito están, sin las fotos. */
    const guardado = JSON.parse(P.almacen[P.ev('KEY')] || '{}');
    assert.equal(guardado.socios.length, 1, 'se perdió el socio');
    assert.equal(guardado.socios[0].nombre, 'Ana');
    assert.equal(guardado.prestamos.length, 1, 'se perdió el crédito');
    assert.equal(guardado.socios[0].cedulaFrenteFoto, undefined,
      'las fotos siguen ahí: no se sacrificó nada y por eso no cupo');
  });

  test('y lo DICE, en la pantalla, no en un aviso que se cierra', () => {
    /* Un alert se cierra y se olvida. Esto se queda hasta que baje el respaldo. */
    const P = abrirPanel({ topeKB: 0.001 });
    P.ev('guardar()');
    const caja = P.ev('_cajaAviso ? _cajaAviso.innerHTML : ""');
    assert.ok(caja && caja.length > 40, 'no se pintó ningún aviso');
    assert.match(caja, /respaldo/i, 'el aviso no ofrece bajar el respaldo');
    assert.match(caja, /NO SE PUDO GUARDAR/, 'el aviso no dice lo que pasó');
  });

  test('cuando vuelve a caber, el aviso SE VA', () => {
    /* Un aviso rojo que no se quita enseña a ignorarlo. */
    const P = abrirPanel({ topeKB: 0.001 });
    P.ev('guardar()');
    assert.equal(P.ev('_guardadoOk'), false);
    /* Se le quita el tope al almacen de mentira: a partir de aca cabe todo. */
    P.ev('localStorage.setItem = function (k, v) { _guardadoDePrueba = v; };');
    assert.equal(P.ev('guardar()'), true);
    assert.equal(P.ev('_guardadoOk'), true);
    assert.equal(P.ev('_cajaAviso ? 1 : 0'), 0,
      'el aviso rojo se quedó después de que volvió a guardar');
  });
});

describe('por que se llena: las fotos (15-sep-2026)', () => {

  test('las fotos son practicamente todo el peso de la cartera', () => {
    /* El numero que explica el problema, medido y no supuesto. */
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(60000);
    const socios = [], prestamos = [];
    for (let i = 0; i < 200; i++) {
      socios.push({ id: 's' + i, nombre: 'Cliente ' + i, cedula: '10' + i,
        cedulaFrenteFoto: foto, cedulaReversoFoto: foto, selfieFoto: foto });
      prestamos.push({ id: 'p' + i, socioId: 's' + i, capital: 500000, abonos: [] });
    }
    const db = { socios, prestamos, respaldados: [], config: {} };
    const con = N.pesoKB(db), sin = N.pesoKB(N.dbSinFotos(db));
    assert.ok(sin < con / 100,
      'las fotos ya no dominan el peso: con ' + Math.round(con) + ' KB, sin ' +
      Math.round(sin) + ' KB. Si esto cambió, el diseño de guardar() hay que repensarlo');
    /* Y el libro solo cabe de sobra en cualquier navegador. */
    assert.ok(sin < 500, 'el libro sin fotos pesa ' + Math.round(sin) + ' KB');
  });
});
