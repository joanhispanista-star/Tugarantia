'use strict';
/* ==========================================================================
 * «⬇ DESCARGAR PARA EXCEL» — 27 de octubre de 2026
 *
 * Joan: «quiero que el rol de gerente tenga la posibilidad de descargar la
 * base de prospectos para que pueda gestionar incluso desde un excel».
 *
 * Lo que esta prueba sujeta:
 *   1. solo PROSPECTOS: un cliente (con su saldo y su fecha de pago) no sale
 *      en un archivo que se reenvía con un toque;
 *   2. una fórmula en un nombre o una nota no corre al abrir el Excel;
 *   3. «;» y BOM, como lo demás que descarga el CRM, y las comillas y los
 *      saltos de línea no rompen las columnas;
 *   4. el botón está solo en la cabecera del gerente, y el cuadro dice la
 *      verdad: son datos personales, y lo que cambie en el Excel NO vuelve.
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

global.BasesTuGarantia = require('../app/bases.js');
const A = require('../panel/agregar-prospectos.js');
const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8').replace(/\r\n/g, '\n');

const GENTE = [
  { id: 'P1', tipo: 'prospecto', nombre: 'Ana Gómez', celular: '3001112233', etapa: 'PC', asesor_nombre: 'LEIDY',
    gestion: { tipo: 'no_contesta', cuando: '2026-10-26T10:00:00Z', nota: 'llamar "tarde"\nmañana' } },
  { id: 'P2', tipo: 'prospecto', nombre: '=HYPERLINK("http://x","clic")', celular: '3001112244', etapa: 'PC' },
  { id: 'C1', tipo: 'cliente', nombre: 'Clienta Con Saldo', celular: '3002223344', etapa: 'AL', saldo: 300000 }
];
const INFO = { P1: { nota: '+vende arepas', extra: { Ciudad: 'Bogotá', 'Monto que pide': '$500.000' }, origen: 'feria', autoriza: true, prueba: 'formulario' } };
function filas(csv) { return csv.replace(/^﻿/, '').split('\r\n'); }

test('solo prospectos: el cliente no sale, y n lo dice', () => {
  const r = A.csvDeMiBase(GENTE, { info: INFO });
  assert.equal(r.n, 2);
  assert.equal(filas(r.csv).length, 3, 'encabezado + 2 prospectos');
  assert.doesNotMatch(r.csv, /Clienta Con Saldo|3002223344|300000/);
});

test('una fórmula no corre: lleva una comilla delante', () => {
  const r = A.csvDeMiBase(GENTE, { info: INFO });
  assert.match(r.csv, /"'=HYPERLINK\(""http:\/\/x"",""clic""\)"/);
  assert.match(r.csv, /"'\+vende arepas"/);
  ['=1+1', '+57', '-2', '@SUM(A1)', '\tx'].forEach(v => assert.equal(A.celdaCSV(v)[1], "'", v));
  assert.equal(A.celdaCSV('Ana'), '"Ana"');
});

test('«;» y BOM, comillas dobladas y sin saltos de línea dentro de una celda', () => {
  const r = A.csvDeMiBase(GENTE, { info: INFO });
  assert.equal(r.csv.charCodeAt(0), 0xFEFF);
  const f = filas(r.csv);
  assert.equal(f[0].split('";"').length, A.COLUMNAS_DESCARGA.length);
  assert.match(f[1], /"llamar ""tarde"" mañana"/);
  f.forEach(l => assert.equal(l.split('";"').length, A.COLUMNAS_DESCARGA.length, l));
});

test('la información adicional va en sus columnas, y «Autorizó» dice Sí / No / nada', () => {
  const r = A.csvDeMiBase(GENTE, { info: INFO });
  const enc = filas(r.csv)[0].replace(/^"|"$/g, '').split('";"');
  const ana = filas(r.csv)[1].replace(/^"|"$/g, '').split('";"');
  assert.equal(ana[enc.indexOf('Ciudad')], 'Bogotá');
  assert.equal(ana[enc.indexOf('Monto que pide')], '$500.000');
  assert.equal(ana[enc.indexOf('De dónde salió')], 'feria');
  assert.equal(ana[enc.indexOf('Autorizó')], 'Sí');
  const otro = filas(A.csvDeMiBase([GENTE[1]], { info: { P2: { autoriza: false } } }).csv)[1].replace(/^"|"$/g, '').split('";"');
  assert.equal(otro[enc.indexOf('Autorizó')], 'No');
  assert.equal(filas(A.csvDeMiBase([GENTE[1]], {}).csv)[1].replace(/^"|"$/g, '').split('";"')[enc.indexOf('Autorizó')], '');
});

test('el botón vive solo en la cabecera del gerente, y el cuadro dice la verdad', () => {
  assert.match(CRM, /function botonesAgregarEq\(\) \{[\s\S]{0,400}onclick="descargarBaseEq\(\)">⬇ Descargar para Excel/);
  assert.match(CRM, /\$\{esGerenteEq\(\) \? botonesAgregarEq\(\) : ''\}/);
  const f = CRM.slice(CRM.indexOf('function descargarBaseEq()'), CRM.indexOf('function bajarBaseEq()'));
  assert.match(f, /if \(!esGerenteEq\(\)\) return;/);
  assert.match(f, /Son datos personales que Joan te confía/);
  assert.match(f, /Lo que cambies en el Excel no vuelve solo a Tu Garantía/);
  assert.match(f, /Los clientes no van/);
});
