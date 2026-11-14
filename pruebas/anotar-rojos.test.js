'use strict';
/* ============================================================================
 * LOS ROJOS DE GITHUB, A LA VISTA SIN INICIAR SESIÓN — 13 de noviembre de 2026
 *
 *   node --test pruebas/anotar-rojos.test.js
 *
 * La v145 salió roja en GitHub y verde aquí, y el porqué no se pudo leer: los
 * registros de Actions piden sesión; las anotaciones, no. herramientas/
 * anotar-rojos.js convierte cada prueba roja del TAP en una anotación. Aquí:
 *   1. lee el TAP de verdad de node (con una prueba que falla a propósito);
 *   2. salta los describe que solo envuelven a sus rojas, y lee el error
 *      de varias líneas y las rutas de Linux;
 *   3. escapa lo que GitHub pide y no pasa de 10 anotaciones sin callar el resto;
 *   4. vigilar.yml escribe el TAP y llama a la herramienta solo si falló.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const A = require('../herramientas/anotar-rojos.js');

const RAIZ = path.join(__dirname, '..');

describe('los rojos del TAP', () => {
  test('el TAP de verdad de node: una prueba roja sale con su archivo, su línea y su mensaje', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rojos-'));
    fs.mkdirSync(path.join(dir, 'pruebas'));
    const f = path.join(dir, 'pruebas', 'rojo-a-proposito.test.js');
    fs.writeFileSync(f, "const { test, describe } = require('node:test');\nconst assert = require('node:assert');\n" +
      "describe('un grupo', () => {\n  test('falla a propósito', () => { assert.equal(1, 2, 'uno no es dos'); });\n  test('pasa', () => {});\n});\n");
    /* Sin NODE_TEST_CONTEXT: heredado de este corredor, el de adentro hablaría
       el idioma de un hijo y no TAP. */
    const env = Object.assign({}, process.env); delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', f], { cwd: dir, env, encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.notEqual(r.status, 0, 'precondición: la prueba a propósito tenía que fallar');
    const rs = A.rojos(r.stdout);
    assert.equal(rs.length, 1, 'el describe que la envuelve se anotó también: ' + JSON.stringify(rs));
    assert.equal(rs[0].nombre, 'falla a propósito');
    assert.equal(rs[0].archivo, 'pruebas/rojo-a-proposito.test.js');
    assert.equal(rs[0].linea, 4);
    assert.equal(rs[0].error, 'uno no es dos');
  });

  test('error de varias líneas, rutas de Linux, y el archivo que se cayó entero', () => {
    const tap = [
      'TAP version 13',
      '# Subtest: /home/runner/work/Tugarantia/Tugarantia/pruebas/mapa-clientes.test.js',
      '    # Subtest: 7 · rápido',
      '        # Subtest: el zoom',
      '        not ok 1 - el zoom',
      '          ---',
      '          duration_ms: 3',
      "          location: '/home/runner/work/Tugarantia/Tugarantia/pruebas/mapa-clientes.test.js:1205:3'",
      "          failureType: 'testCodeFailure'",
      '          error: |-',
      '            Expected values to be strictly equal:',
      '',
      "            'a' !== 'b'",
      "          code: 'ERR_ASSERTION'",
      '          ...',
      '    not ok 1 - 7 · rápido',
      '      ---',
      "      failureType: 'subtestsFailed'",
      "      error: '1 subtest failed'",
      '      ...',
      'not ok 1 - /home/runner/work/Tugarantia/Tugarantia/pruebas/mapa-clientes.test.js',
      '  ---',
      "  location: '/home/runner/work/Tugarantia/Tugarantia/pruebas/mapa-clientes.test.js:1:1'",
      "  failureType: 'subtestsFailed'",
      "  error: '1 subtest failed'",
      '  ...',
      '# Subtest: /home/runner/work/Tugarantia/Tugarantia/pruebas/se-cae.test.js',
      'not ok 2 - /home/runner/work/Tugarantia/Tugarantia/pruebas/se-cae.test.js',
      '  ---',
      "  location: '/home/runner/work/Tugarantia/Tugarantia/pruebas/se-cae.test.js:1:1'",
      "  failureType: 'testCodeFailure'",
      "  error: 'test failed'",
      '  ...'].join('\n');
    const rs = A.rojos(tap);
    assert.deepEqual(rs.map(r => [r.nombre, r.archivo, r.linea]), [
      ['el zoom', 'pruebas/mapa-clientes.test.js', 1205],
      ['/home/runner/work/Tugarantia/Tugarantia/pruebas/se-cae.test.js', 'pruebas/se-cae.test.js', 1]]);
    assert.equal(rs[0].error, "Expected values to be strictly equal:\n\n'a' !== 'b'");
    assert.equal(rs[1].error, 'test failed');
  });
});

describe('las anotaciones', () => {
  test('escapa lo que GitHub pide en el título y en el mensaje', () => {
    const tap = ['not ok 1 - a: b, c', '  ---', "  location: 'C:\\\\x\\\\pruebas\\\\a.test.js:7:3'", "  error: 'línea 1'", '  ...'].join('\n');
    const { lineas } = A.anotaciones(tap);
    assert.deepEqual(lineas, ['::error file=pruebas/a.test.js,line=7,title=a%3A b%2C c::línea 1']);
    assert.equal(A.escDato('50%\nsigue'), '50%25%0Asigue');
  });

  test('con más de 10 rojas: 9 anotadas y la décima cuenta todas, sin callar el resto', () => {
    const tap = Array.from({ length: 12 }, (_, i) => ['not ok ' + (i + 1) + ' - roja ' + (i + 1), '  ---',
      "  location: '/r/pruebas/x.test.js:" + (i + 1) + ":1'", "  error: 'mal'", '  ...'].join('\n')).join('\n');
    const { lineas } = A.anotaciones(tap);
    assert.equal(lineas.length, A.TOPE);
    assert.match(lineas[9], /^::error title=12 pruebas en rojo::Arriba van las primeras 9\. Las demás: roja 10 \(pruebas\/x\.test\.js\) · roja 11/);
  });

  test('la herramienta sola: sin rojas avisa que el fallo fue de otra cosa, y nunca sale con error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rojos-'));
    const f = path.join(dir, 'p.tap');
    fs.writeFileSync(f, 'TAP version 13\nok 1 - bien\n');
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'herramientas', 'anotar-rojos.js'), f], { encoding: 'utf8' });
    const r2 = spawnSync(process.execPath, [path.join(RAIZ, 'herramientas', 'anotar-rojos.js'), path.join(dir, 'no-existe.tap')], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^::warning title=Rojo sin prueba roja::/);
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /^::warning title=Sin TAP::/);
  });
});

describe('vigilar.yml', () => {
  test('las pruebas escriben el TAP además de la salida de siempre, y la herramienta corre solo si fallaron, antes de la usura', () => {
    const y = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'vigilar.yml'), 'utf8');
    const pruebas = y.indexOf('- name: Las pruebas'), rojos = y.indexOf('- name: Los rojos, a la vista sin iniciar sesión'),
      usura = y.indexOf('- name: La tabla de usura');
    assert.ok(pruebas >= 0 && rojos > pruebas && usura > rojos, 'el orden de los pasos');
    const paso = y.slice(pruebas, rojos);
    assert.match(paso, /run: node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=\.\.\/pruebas\.tap/);
    assert.match(paso, /working-directory: pruebas/);
    const paso2 = y.slice(rojos, usura);
    assert.match(paso2, /if: failure\(\)/);
    assert.match(paso2, /run: node herramientas\/anotar-rojos\.js pruebas\.tap/);
  });
});
