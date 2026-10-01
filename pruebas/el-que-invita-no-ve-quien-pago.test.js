/* ============================================================================
 * EL QUE INVITA NO VE QUIÉN PAGÓ — 1-oct-2026
 *
 *   node --test pruebas/el-que-invita-no-ve-quien-pago.test.js
 *
 * POR QUÉ EXISTE. El paquete que arma migrarSocio —el que se sube a la nube y
 * llega al teléfono de cada cliente— llevaba `referidos.lista` con el nombre de
 * pila de cada invitado y si pagó. Medido en la cartera real el 1-oct: al
 * teléfono del que más invitados tiene le llegaba «ERICK pagó, MARIA no,
 * CRISTIAN no», y su pantalla decía «Te faltan 2 por pagar». Que un tercero
 * pagó o no, no es dato de quien lo invitó (Ley 2300 art. 4), y la política
 * publicada promete «Ningún otro cliente puede ver los tuyos».
 *
 * Lo que cuidan estas pruebas es el CABLE y no solo la pantalla: un dato que
 * viaja al teléfono ya salió, se pinte o no. Por eso la primera revisa el JSON
 * entero del paquete buscando los nombres de los invitados.
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../app/motor.js');
const P = require('../app/puente.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
/* Solo el código: el comentario que explica el arreglo cita las frases viejas. */
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/mg, '');

/* Un padrino con tres invitados: uno pagó, dos no. Los apellidos son raros a
   propósito para que buscarlos en el JSON no choque con ninguna otra palabra. */
function cartera() {
  const socio = (id, nombre, referidoPor) => ({ id, nombre, cedula: id.replace(/\D/g, '') || '9',
    telefono: '300111' + id.replace(/\D/g, '').padStart(4, '0'), gestiones: [], ajusteGarantia: 0,
    referidoPor: referidoPor || '' });
  const credito = (id, socioId, pagado) => ({ id, numero: 1, socioId, capital: 100000, costoPct: 20,
    fechaDesembolso: '2026-09-10', cicloActual: '2026-09-25', pagado,
    fechaPago: pagado ? '2026-09-25' : undefined, prorrogas: [], abonosCapital: [], comprobantes: [] });
  return P.normalizar({
    socios: [
      socio('s1', 'Padrino Zuluaguita Prueba'),
      socio('s2', 'Ermenegildo Pagador Xyq', 's1'),
      socio('s3', 'Filomena Debedora Wvk', 's1'),
      socio('s4', 'Casimiro Nuevo Qjz', 's1')
    ],
    prestamos: [
      credito('c1', 's1', true),
      credito('c2', 's2', true),
      credito('c3', 's3', false),
      credito('c4', 's4', false)
    ]
  });
}

describe('el paquete del socio no lleva a sus invitados', () => {

  test('ningún nombre de un invitado viaja en el paquete', () => {
    const db = cartera();
    const json = JSON.stringify(P.migrarSocio(db, db.socios[0], '2026-10-01'));
    ['Ermenegildo', 'Pagador', 'Filomena', 'Debedora', 'Casimiro', 'Nuevo Qjz'].forEach(n => {
      assert.ok(!json.includes(n), 'el paquete del padrino lleva «' + n + '»');
    });
  });

  test('la lista viaja vacía pero sigue existiendo, para las apps viejas', () => {
    const db = cartera();
    const r = P.migrarSocio(db, db.socios[0], '2026-10-01').referidos;
    assert.deepEqual(r.lista, []);
    // Los conteos se quedan: el cupo por referido está en términos firmados.
    assert.equal(r.total, 3);
    assert.equal(r.pagaron, 1);
  });

  test('el Panel sí ve a quién trajo, y eso no sale de este equipo', () => {
    const db = cartera();
    const lista = P.referidosDe(db, db.socios[0]);
    assert.deepEqual(lista.map(x => [x.nombre.split(' ')[0], x.pago]),
      [['Ermenegildo', true], ['Filomena', false], ['Casimiro', false]]);
  });

  test('el Panel arma «A quién trajo» con referidosDe y no con el paquete', () => {
    const crm = sinComentarios(leer('panel/crm.html'));
    assert.ok(!/referidos\.lista/.test(crm), 'crm.html volvió a leer la lista del paquete');
    assert.match(crm, /referidosDe\(f\.s\)\.map/);
  });
});

describe('la tarjeta del que invita', () => {

  const SOCIO = sinComentarios(leer('app/socio.html'));

  test('no dice cuántos pagaron ni cuántos le faltan', () => {
    assert.ok(!/Ya pagaron/.test(SOCIO), 'volvió la fila «Ya pagaron»');
    assert.ok(!/por pagar\. Cuando lo hagan/.test(SOCIO), 'volvió el aviso «Te faltan N por pagar»');
  });

  test('la garantía que muestra es la que el motor acredita, con su tope', () => {
    assert.match(SOCIO, /fila\('Garantía que te dieron', COP\(S\.gd\.referidos\)\)/);
    assert.ok(!/\(r\.pagaron \|\| 0\) \* M\.GARANTIA_POR_REFERIDO/.test(SOCIO),
      'la tarjeta volvió a multiplicar invitados × 5.000 sin el tope');
  });

  test('y ese tope existe: con poca garantía ganada, los referidos no valen invitados × 5.000', () => {
    const g = M.desglosarGarantia({ datos: {}, referidos: 10, acumulada: 12000, ajuste: 0, comprometida: 0 });
    assert.equal(g.referidos_sin_tope, 10 * M.GARANTIA_POR_REFERIDO);
    assert.ok(g.referidos < g.referidos_sin_tope, 'el motor ya no topa los referidos: revisa la tarjeta');
  });
});
