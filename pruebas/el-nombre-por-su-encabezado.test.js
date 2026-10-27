'use strict';
/* ==========================================================================
 * EL NOMBRE, POR SU ENCABEZADO — 27 de octubre de 2026
 *
 * La verificación del gerente agrega cargó «Nombre;Celular;Barrio donde
 * vive;Negocio» y el nombre de cada persona salió siendo su BARRIO («Kennedy
 * Timiza»): bases.js elige la columna del nombre por sus valores, y un barrio
 * de dos palabras puntúa como un nombre. A LEIDY le habría llegado «Hola
 * Kennedy». Pasaba también en el «⤒ Cargar base» de Joan.
 *
 * AgregarProspectos.columnasConNombre: con una columna que se llama
 * exactamente como un nombre, esa manda; sin ella, una columna que se llama
 * como un lugar o un negocio no es el nombre (mejor sin nombre que con uno
 * inventado). Y las dos cargas del CRM la usan.
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

global.BasesTuGarantia = require('../app/bases.js');
const B = global.BasesTuGarantia;
const A = require('../panel/agregar-prospectos.js');

const BARRIOS = ['Kennedy Timiza', 'Bosa San Bernardino', 'Suba Rincón', 'Patio Bonito', 'Engativá Centro', 'Usme Santa Librada',
  'Fontibón Centro', 'Ciudad Bolívar', 'Chapinero Alto', 'San Cristóbal Sur', 'Rafael Uribe', 'Teusaquillo Galerías'];
const NOMBRES = ['Ana Gómez', 'Luis Pérez', 'Marta Ruiz', 'Juan Díaz', 'Sara Mora', 'Pedro Gil',
  'Rosa Vega', 'Iván Soto', 'Lina Cruz', 'Omar Ríos', 'Eva León', 'Raúl Paz'];
function feria(enc) {
  return [enc].concat(NOMBRES.map((n, i) => [n, '32011100' + String(i).padStart(2, '0'), BARRIOS[i], 'Tienda']));
}

test('control: con «Barrio donde vive», el puntaje de bases.js solo NO elige la columna «Nombre»', () => {
  const cols = B.detectarColumnas(feria(['Nombre', 'Celular', 'Barrio donde vive', 'Negocio']));
  assert.notEqual(cols.nombre, 0, 'si esto falla, bases.js ya lo resuelve y columnasConNombre sobra');
});

test('con una columna «Nombre», esa es el nombre aunque el barrio puntúe más', () => {
  const cols = A.columnasConNombre(feria(['Nombre', 'Celular', 'Barrio donde vive', 'Negocio']));
  assert.deepEqual([cols.celular, cols.nombre, cols.encabezado], [1, 0, 1]);
  const r = B.revisarBase(feria(['Nombre', 'Celular', 'Barrio donde vive', 'Negocio']), cols, { socios: [], prospectos: [] });
  assert.equal(r.nuevos[0].nombre, 'Ana Gómez');
});

test('«Nombres y apellidos», «Nombre completo» y «Cliente» también mandan', () => {
  ['Nombres y apellidos', 'NOMBRE COMPLETO', 'Cliente'].forEach(h => {
    const cols = A.columnasConNombre(feria([h, 'Celular', 'Barrio donde vive', 'Negocio']));
    assert.equal(cols.nombre, 0, h);
  });
});

test('sin columna de nombre, un barrio o una dirección NO se vuelven el nombre', () => {
  const filas = [['Celular', 'Barrio donde vive', 'Dirección de residencia']].concat(
    BARRIOS.map((b, i) => ['32011100' + String(i).padStart(2, '0'), b, 'Calle ' + (40 + i) + ' sur # 12-' + (10 + i)]));
  const cols = A.columnasConNombre(filas);
  assert.equal(cols.celular, 0);
  assert.equal(cols.nombre, -1, 'tomó un lugar como nombre');
});

test('sin encabezado, se queda la elección de bases.js (no hay nombre de columna que mirar)', () => {
  const filas = NOMBRES.map((n, i) => [n, '32011100' + String(i).padStart(2, '0')]);
  assert.deepEqual(A.columnasConNombre(filas), B.detectarColumnas(filas));
});

test('las dos cargas del CRM (la de Joan y la del equipo) usan columnasConNombre', () => {
  const crm = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const usos = crm.split(/\r?\n/).filter(l => /B\.detectarColumnas\(filas\)/.test(l));
  assert.equal(usos.length, 2);
  usos.forEach(l => assert.match(l, /columnasConNombre\(filas\)/, l.trim()));
});
