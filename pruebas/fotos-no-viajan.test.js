/* ===========================================================================
 * LAS FOTOS NO VIAJAN — y las tres formas en que sí viajaban.
 *
 * panel/nube.js promete, con todas las letras y desde agosto, que las fotos se
 * quedan en el computador: pesan, y la selfie es dato biométrico (Ley 1581
 * art. 5), que es una decisión que se toma aparte y no de refilón dentro de una
 * sincronización.
 *
 * El 15-sep-2026 se midió esa promesa CORRIENDO el código en vez de leyéndolo,
 * y tenía tres agujeros. Ninguno de los tres lo veía el banco de pruebas, que
 * estaba verde:
 *
 *   1. LA QUINTA FOTO. Un respaldado lleva cuotas y cada cuota puede llevar el
 *      recibo del cobro. La palabra «cuotas» no aparecía en nube.js.
 *   2. LA PAPELERA, AL REVÉS. Guarda un envoltorio {socio, prestamos, …}, y
 *      como sinFotos solo miraba el nivel de arriba, quitaba la cédula del
 *      socio VIVO y dejaba subir entera la del BORRADO.
 *   3. LOS GEMELOS. Dos abonos del mismo monto el mismo día recibían los dos la
 *      foto del primero. La segunda foto no se perdía: se sustituía por otra,
 *      que es peor — la galería enseñaba el recibo del pago equivocado.
 *
 * Todas las pruebas de acá EJECUTAN. Un centinela que buscara la palabra
 * «cuotas» en el texto de nube.js aprobaría un `if (false)`.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../panel/nube.js');

describe('las fotos no viajan (15-sep-2026)', () => {

  test('LA QUINTA FOTO: el recibo de una cuota no sale en el lote', () => {
    /* Se prueba contra armarLote y no contra sinFotos, que es donde de verdad
       importa: lo que armarLote devuelve es lo que sale por la red. */
    const db = {
      socios: [], prestamos: [],
      respaldados: [{ id: 'R1', socioId: 'C1', monto: 500000,
        cuotas: [{ n: 1, comprobante: null },
                 { n: 2, comprobante: 'data:image/jpeg;base64,RECIBO-DE-LA-CUOTA-2' }] }]
    };
    const lote = N.armarLote(db, N.espejoVacio(), { marcarBorrados: false });
    assert.ok(!JSON.stringify(lote).includes('RECIBO-DE-LA-CUOTA-2'),
      'el recibo de una cuota viaja a Supabase, contra lo que promete nube.js');
  });

  test('LA PAPELERA: la cédula de alguien BORRADO no sube', () => {
    /* Y esta es la que se ponía roja con el código de antes: quitaba la foto del
       vivo —la única copia— y conservaba las dos del borrado. Exactamente al
       revés de lo que promete legal/privacidad.html. */
    const db = {
      socios: [{ id: 'C1', selfieFoto: 'CEDULA-DEL-VIVO' }],
      papeleraSocios: [{
        borradoEn: '2026-09-01',
        socio: { id: 'C9', selfieFoto: 'CEDULA-DEL-BORRADO' },
        prestamos: [{ id: 'P9', comprobantes: [{ fecha: '2026-01-01', tipo: 'pago', monto: 1, foto: 'RECIBO-DEL-BORRADO' }] }]
      }]
    };
    const t = JSON.stringify(N.dbSinFotos(db));
    assert.ok(!t.includes('CEDULA-DEL-VIVO'), 'sube la cédula del socio vivo');
    assert.ok(!t.includes('CEDULA-DEL-BORRADO'),
      'sube la cédula de una persona BORRADA: legal/privacidad.html promete que lo borrado se borra');
    assert.ok(!t.includes('RECIBO-DEL-BORRADO'), 'sube un recibo de la papelera');
  });

  test('LA PAPELERA, por el camino que de verdad usa la red', () => {
    /* dbSinFotos solo lo usa subir.html para PESAR. Lo que sale por el cable lo
       arma armarLote, que aplica sinFotos a cada ajuste por su cuenta. Arreglar
       uno y olvidar el otro es el error natural acá, y esto lo caza. */
    const db = {
      socios: [], prestamos: [],
      papeleraSocios: [{ borradoEn: '2026-09-01', socio: { id: 'C9', selfieFoto: 'CEDULA-DEL-BORRADO' }, prestamos: [] }]
    };
    const lote = N.armarLote(db, N.espejoVacio(), { marcarBorrados: false });
    assert.ok(!JSON.stringify(lote).includes('CEDULA-DEL-BORRADO'),
      'armarLote manda la cédula de una persona borrada aunque dbSinFotos ya no lo haga');
  });

  test('LOS GEMELOS: cada comprobante recupera SU foto, no la del otro', () => {
    /* Los comprobantes nacen con la fecha de HOY (crm.html), así que dos abonos
       del mismo monto el mismo día colisionan SIEMPRE. No es un caso raro: es
       el martes de cobro de cualquier semana. */
    const local = { id: 'P1', comprobantes: [
      { fecha: '2026-09-15', tipo: 'abono', monto: 50000, foto: 'FOTO-A' },
      { fecha: '2026-09-15', tipo: 'abono', monto: 50000, foto: 'FOTO-B' }
    ] };
    const vuelta = N.devolverFotos(N.sinFotos(local), local);
    assert.equal(vuelta.comprobantes[0].foto, 'FOTO-A');
    assert.equal(vuelta.comprobantes[1].foto, 'FOTO-B',
      'al segundo comprobante le pegaron la foto del primero: la galería enseña ' +
      'el recibo de otro pago rotulado con este monto');
  });

  test('y el que ya trae foto no se la deja pisar', () => {
    const local = { id: 'P1', comprobantes: [{ fecha: '2026-09-15', tipo: 'abono', monto: 50000, foto: 'LOCAL' }] };
    const nube  = { id: 'P1', comprobantes: [{ fecha: '2026-09-15', tipo: 'abono', monto: 50000, foto: 'YA-ESTABA' }] };
    assert.equal(N.devolverFotos(nube, local).comprobantes[0].foto, 'YA-ESTABA');
  });

  /* ------------------------------------------------- lo que NO puede cambiar */

  test('un socio normal no cambió de forma: el espejo sigue valiendo', () => {
    /* sinFotos define el JSON canónico sobre el que está escrito todo el plan de
       la nube. Si estas curas le cambiaran la forma a una fila sin fotos, cada
       fila de Joan saldría como «cambiada» en la primera sincronización. */
    const filas = [
      { id: 'C1', nombre: 'Ana', cedula: '1', telefono: '3001', comprobantes: [] },
      { id: 'P1', socioId: 'C1', monto: 300000, comprobantes: [{ fecha: '2026-09-01', tipo: 'pago', monto: 1000 }] },
      { id: 'R1', socioId: 'C1', cuotas: [{ n: 1, comprobante: null }] }
    ];
    for (const fila of filas) {
      assert.equal(N.jsonCanonico(N.sinFotos(fila)), N.jsonCanonico(fila),
        'sinFotos le cambió la forma a una fila que no tiene fotos: ' + fila.id);
    }
  });

  test('una sola devolverFotos en todo el proyecto', () => {
    /* De texto, y lo digo: subir.html no tiene banco. La de comportamiento es la
       de los gemelos, que corre sobre nube.js, que es donde queda la única. */
    const fs = require('node:fs'), path = require('node:path');
    const t = fs.readFileSync(path.join(__dirname, '..', 'panel', 'subir.html'), 'utf8');
    const n = (t.match(/function devolverFotos/g) || []).length;
    assert.equal(n, 1, 'subir.html tiene ' + n + ' definiciones de devolverFotos');
    assert.match(t, /function devolverFotos\([^)]*\)\s*\{\s*return NUBE\.devolverFotos/,
      'subir.html volvió a tener su propia copia: el arreglo de los gemelos no le llega');
    assert.equal(typeof N.devolverFotos, 'function');
  });

  test('esFaltaDeEspacio distingue quedarse sin sitio de romperse', () => {
    const lleno = new Error('x'); lleno.name = 'QuotaExceededError';
    const viejo = new Error('x'); viejo.code = 22;
    assert.ok(N.esFaltaDeEspacio(lleno));
    assert.ok(N.esFaltaDeEspacio(viejo), 'los navegadores viejos avisan con el código 22');
    assert.ok(!N.esFaltaDeEspacio(new SyntaxError('json malo')));
    assert.ok(!N.esFaltaDeEspacio(null));
  });
});
