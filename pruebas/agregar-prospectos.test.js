'use strict';
/* ==========================================================================
 * AGREGAR PROSPECTOS: LAS REGLAS PURAS — 27-oct-2026
 *
 *   node --test pruebas/agregar-prospectos.test.js
 *
 * panel/agregar-prospectos.js decide qué columnas extra de un archivo se
 * ofrecen para guardar (y cuáles no, y por qué), cómo se limpian el nombre, la
 * nota y cada valor, y cómo se parte y se reparte un archivo. Lo que se cuida:
 *   · una base de COBRANZA de otra empresa (la forma de las nueve que midió
 *     detectarColumnas) no deja pasar ninguna de sus columnas: ni el estado
 *     «YA PAGO» / «VENCIDO», ni el asesor, ni el valor, ni la fecha de Excel;
 *   · lo que sí se puede guardar va SIN MARCAR, hasta 6, y una columna sin
 *     encabezado se llama por su letra;
 *   · la regla es la misma del servidor (extra_limpio): el mismo ejemplo, con
 *     las mismas claves fuera;
 *   · el nombre sin comilla (nada se ejecuta), el resumen sin nombres.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../panel/agregar-prospectos.js');
const B = require('../app/bases.js');

const FIRMA = '(function () { try { var s = document.currentScript; if (s && s.src) '
  + '(window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();';

describe('las columnas extra', () => {

  test('una feria: Barrio, Empresa y una sin encabezado se ofrecen SIN marcar; celular y nombre no', () => {
    const filas = [
      ['Nombre completo', 'Celular', 'Barrio', 'Empresa', ''],
      ['ANA MARIA PEREZ', '3001112233', 'Kennedy', 'Panadería La 40', 'tarde'],
      ['PEDRO GOMEZ', '310 222 3344', 'Suba', 'Taller El Rayo', 'mañana'],
      ['LUZ TORRES', '+57 320 555 6677', 'Bosa', '', 'tarde']];
    const cols = B.detectarColumnas(filas);
    assert.deepEqual([cols.nombre, cols.celular, cols.encabezado], [0, 1, 1]);
    const r = A.columnasExtra(filas, cols);
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Barrio', 'Empresa', 'Columna E']);
    assert.ok(r.columnas.every(c => c.marcada === false), 'una columna salió marcada: se marcan a propósito, no por defecto');
    assert.equal(r.columnas[0].muestra, 'Kennedy');
    assert.deepEqual(r.descartadas, []);
  });

  test('una base de COBRANZA de mentira (como las nueve medidas) no ofrece NINGUNA de sus columnas', () => {
    const filas = [
      ['TITULAR', 'CELULAR', 'OBSERVACIÓN', 'Asesor', 'Valor', 'Fecha', 'Estado', 'Saldo', 'EPS', 'Cédula', 'Recomendado por'],
      ['ANA PEREZ', '3001112233', 'YA PAGO', 'CAMILA', '350000', '45950', 'VENCIDO', '120.000', 'Sura', '52111222', 'María'],
      ['PEDRO GOMEZ', '3102223344', 'NO CONTESTA', 'CAMILA', '200000', '45951', 'VENCIDO', '80.000', 'Nueva EPS', '52111223', 'Juan'],
      ['LUZ TORRES', '3205556677', 'PROMESA DE PAGO', 'JORGE', '150000', '45952', 'AL DIA', '0', 'Sanitas', '52111224', 'Ana'],
      ['JOSE RUIZ', '3115556677', 'YA PAGO', 'JORGE', '90000', '45953', 'VENCIDO', '15.000', 'Sura', '52111225', 'Ana']];
    const r = A.columnasExtra(filas, B.detectarColumnas(filas));
    assert.deepEqual(r.columnas, [], 'ofreció guardar: ' + r.columnas.map(c => c.nombre).join(', '));
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    assert.match(motivo('OBSERVACIÓN'), /trae estados de cobro: «YA PAGO», «NO CONTESTA»/);
    assert.equal(motivo('Asesor'), 'es otra persona');
    assert.equal(motivo('Valor'), 'son solo números');
    assert.equal(motivo('Fecha'), 'son solo números', 'la fecha de Excel (45950) pasaría como texto');
    assert.match(motivo('Estado'), /trae estados de cobro: «VENCIDO»/);
    assert.equal(motivo('Saldo'), 'es plata o deuda');
    assert.equal(motivo('EPS'), 'es un dato de salud');
    assert.equal(motivo('Cédula'), 'es un documento');
    assert.equal(motivo('Recomendado por'), 'es otra persona');
  });

  /* 27-oct-2026, revisión — «Observaciones» se descartaba por su NOMBRE
     («es de cobranza») aunque dijera «vende arepas», y una fecha escrita por
     sus 8 cifras («trae cédulas o teléfonos»). */
  test('una feria: «Observaciones» y «Fecha de la feria» SÍ se ofrecen; la cédula no; el motivo de un nombre dice lo que suele traer', () => {
    const filas = [
      ['Nombre', 'Celular', 'Observaciones', 'Fecha de la feria', 'Cédula', 'Estado'],
      ['ANA PEREZ', '3001112233', 'vende arepas en la esquina', '2026-10-01', '52111222', 'interesada'],
      ['PEDRO GOMEZ', '3102223344', 'prefiere WhatsApp', '01/10/2026', '52111223', 'lo piensa'],
      ['LUZ TORRES', '3205556677', 'tiene un taller', '2026-10-01', '52111224', 'interesada']];
    const r = A.columnasExtra(filas, B.detectarColumnas(filas));
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Observaciones', 'Fecha de la feria']);
    assert.equal(r.columnas[0].muestra, 'vende arepas en la esquina');
    assert.equal(r.columnas[1].muestra, '2026-10-01');
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    assert.equal(motivo('Cédula'), 'es un documento');
    assert.equal(motivo('Estado'), 'suele traer datos de cobranza');
    const e = A.extrasPorCelular(filas, B.detectarColumnas(filas), r.columnas);
    assert.deepEqual(e['3102223344'], { Observaciones: 'prefiere WhatsApp', 'Fecha de la feria': '01/10/2026' });
  });

  /* 27-oct-2026, ronda 2 — LA DIRECCIÓN NO VIAJA. Lo que Joan acepta al publicar
     dice «Sigue sin viajar: cédula, dirección, fotos y referencias», y una columna
     «Dirección» marcada llegaba al celular del asesor («Carrera 17 # 7-7»). */
  test('«Dirección» no se ofrece, y una dirección escrita en otra columna tampoco se guarda (la MISMA regla de extra_limpio)', () => {
    const filas = [
      ['Nombre', 'Celular', 'Dirección', 'Ubicación', 'Observaciones', 'Barrio'],
      ['PABLO GOMEZ', '3001112233', 'Carrera 17 # 7-7', 'Cl 45 No. 12-30', 'vende empanadas', 'Kennedy'],
      ['ANA PEREZ', '3102223344', 'Calle 1 # 2-3', 'Kr 10 #20-30', 'vive en la Cra 5 # 10-20', 'Bosa'],
      ['LUZ TORRES', '3205556677', 'Av. Boyacá 3 # 4-5', 'Diagonal 4 Bis # 5-6', 'tiene un taller', 'Suba']];
    const r = A.columnasExtra(filas, B.detectarColumnas(filas));
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Observaciones', 'Barrio']);
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    assert.equal(motivo('Dirección'), 'es una dirección: no viaja al equipo');
    assert.equal(motivo('Ubicación'), 'es una dirección: no viaja al equipo');
    const e = A.extrasPorCelular(filas, B.detectarColumnas(filas), r.columnas);
    assert.deepEqual(e['3102223344'], { Barrio: 'Bosa' }, 'la dirección escrita en «Observaciones» viajó');
    assert.deepEqual(e['3001112233'], { Observaciones: 'vende empanadas', Barrio: 'Kennedy' });
    /* CONTROL: lo que no es una dirección sigue entrando. */
    ['vende en la calle del mercado', 'Calle 13', 'Av. principal', 'tiene 2 hijos'].forEach(v => assert.equal(A.limpiarValor(v), v, v));
    assert.equal(A.familiaDeClave('Domicilio'), 'direccion');
  });

  test('hasta 6, y el séptimo dice por qué; dos encabezados iguales no se pisan', () => {
    const cab = ['Nombre', 'Celular', 'A1', 'A2', 'A3', 'A4', 'A5', 'Barrio', 'Barrio'];
    const fila = ['ANA PEREZ', '3001112233', 'x', 'y', 'z', 'w', 'v', 'Kennedy', 'Suba'];
    const r = A.columnasExtra([cab, fila, fila.map((v, i) => i === 1 ? '3001112234' : v)], { nombre: 0, celular: 1, encabezado: 1 });
    assert.equal(r.columnas.length, 6);
    assert.equal(r.columnas[5].nombre, 'Barrio');
    assert.deepEqual(r.descartadas.map(d => d.motivo), ['solo se guardan 6']);
  });

  test('la columna que bases.js marca como financiera tampoco', () => {
    const filas = [['Nombre', 'Celular', 'App name'], ['ANA PEREZ', '3001112233', 'PlataX'], ['PEDRO GOMEZ', '3102223344', 'PlataX']];
    const r = A.columnasExtra(filas, B.detectarColumnas(filas));
    assert.deepEqual(r.columnas, []);
    assert.equal(r.descartadas[0].nombre, 'App name');
  });
});

describe('lo que se guarda de cada persona', () => {

  test('extrasPorCelular: solo lo elegido, la primera aparición, sin cédulas ni teléfonos ajenos, cortado a 120', () => {
    const filas = [
      ['Nombre', 'Celular', 'Barrio', 'Nota'],
      ['ANA PEREZ', '3001112233', 'Kennedy', 'su hermano 3109998877'],
      ['ANA PEREZ', '573001112233', 'Suba', 'otra'],
      ['PEDRO GOMEZ', '3102223344', 'x'.repeat(200), 'vende arepas']];
    const cols = { nombre: 0, celular: 1, encabezado: 1 };
    const e = A.extrasPorCelular(filas, cols, [{ i: 2, nombre: 'Barrio' }, { i: 3, nombre: 'Nota' }]);
    assert.deepEqual(e['3001112233'], { Barrio: 'Kennedy' }, 'no ganó la primera aparición, o pasó un teléfono ajeno');
    assert.equal(e['3102223344'].Barrio.length, 120);
    assert.equal(e['3102223344'].Nota, 'vende arepas');
    assert.deepEqual(A.extrasPorCelular(filas, cols, []), {}, 'sin nada elegido guardó algo');
  });

  test('limpiarValor: la misma regla del servidor', () => {
    assert.equal(A.limpiarValor('Kennedy'), 'Kennedy');
    assert.equal(A.limpiarValor('350000'), '');
    assert.equal(A.limpiarValor('$ 1.200'), '');
    assert.equal(A.limpiarValor('45950'), '');
    assert.equal(A.limpiarValor('52.111.222'), '');
    assert.equal(A.limpiarValor('YA PAGO'), '');
    assert.equal(A.limpiarValor('En mora'), '');
    assert.equal(A.limpiarValor('Moravia'), 'Moravia', 'un barrio que empieza por «mora» no es una mora');
    assert.equal(A.limpiarValor('<b>"x"</b>'), 'bx/b');
    /* Una fecha escrita no es una cédula; ocho cifras seguidas sí lo parecen. */
    assert.equal(A.limpiarValor('2026-10-01'), '2026-10-01');
    assert.equal(A.limpiarValor('01/10/2026'), '01/10/2026');
    assert.equal(A.limpiarValor('20261001'), '');
    assert.equal(A.limpiarValor('2026-10-01 llamar 3109998877'), '', 'una fecha con un teléfono al lado');
  });

  test('el ejemplo de la prueba del servidor da lo mismo aquí (extra_limpio)', () => {
    const pg = fs.readFileSync(path.join(__dirname, 'el-gerente-agrega-postgres.test.js'), 'utf8');
    assert.match(pg, /assert\.deepEqual\(Object\.keys\(limpio\)\.sort\(\), \['Barrio', 'Ciudad', 'Empresa'\]/);
    const ejemplo = { 'Estado': 'VENCIDO', 'Valor': '350000', 'Fecha': '45950', 'EPS': 'Sura', 'Asesor': 'CAMILA',
      'Observación': 'YA PAGO', 'Recomendado por': 'María', 'Barrio': 'Kennedy', 'Teléfono 2': '310 555 1234',
      'Empresa': 'Panadería La 40', 'Comentario': 'debe 3 cuotas', 'Ciudad': 'Bogotá' };
    const quedan = Object.keys(ejemplo).filter(k => !A.familiaDeClave(k) && A.limpiarValor(ejemplo[k]));
    assert.deepEqual(quedan.sort(), ['Barrio', 'Ciudad', 'Empresa']);
    /* Y el de la feria (27-oct, revisión): las dos pruebas usan el mismo ejemplo. */
    assert.match(pg, /assert\.deepEqual\(Object\.keys\(feria\)\.sort\(\), \['Fecha de la feria', 'Observaciones'\]/);
    const feria = { 'Observaciones': 'vende arepas en la esquina', 'Fecha de la feria': '2026-10-01', 'Cédula': '52111222' };
    assert.deepEqual(Object.keys(feria).filter(k => !A.familiaDeClave(k) && A.limpiarValor(feria[k])).sort(), ['Fecha de la feria', 'Observaciones']);
  });

  test('el nombre sin comilla ni símbolos (nada se ejecuta), en Mayúscula Inicial', () => {
    assert.equal(A.limpiarNombre("x',alert(1),'"), 'X Alert');
    assert.equal(A.limpiarNombre("JENNY D'ANGELO"), 'Jenny D Angelo');
    assert.doesNotMatch(A.limpiarNombre("a'b\"c(d)e/f<g>"), /['"()/<>]/);
  });

  test('la nota: 300, sin caracteres de control ni < > " \' `', () => {
    const n = A.limpiarNota('línea uno\nlínea dos\t<script>"x"</script>' + 'y'.repeat(400));
    assert.equal(n.length, 300);
    assert.doesNotMatch(n, /[\n\t<>"']/);
    assert.match(n, /^línea uno línea dos/);
  });
});

describe('partir y repartir', () => {
  test('enTandas de 200 y primerasN', () => {
    const l = Array.from({ length: 450 }, (_, i) => i);
    assert.deepEqual(A.enTandas(l, 200).map(t => t.length), [200, 200, 50]);
    assert.equal(A.TOPE_TANDA, 200);
    assert.deepEqual(A.primerasN(l, 300).length, 300);
    assert.deepEqual(A.primerasN(l, 300)[299], 299, 'no son las primeras del archivo');
  });

  test('repartirParejo: en turno, en el orden del archivo', () => {
    const r = A.repartirParejo([{ celular: 'a' }, { celular: 'b' }, { celular: 'c' }],
      [{ celular: '3000000002' }, { celular: '3000000004' }]);
    assert.deepEqual(r.map(x => x.para), ['3000000002', '3000000004', '3000000002']);
  });

  test('el resumen dice cuentas, nunca nombres ni de quién', () => {
    const t = A.textoResultado({ entraron: 244, ya_existen: 38, ya_en_tu_base: 18, repetidas: 12, invalidas: 8 }).join(' ');
    assert.match(t, /Listo\. Entraron 244 a tu base\./);
    assert.match(t, /Ya existían en Tu Garantía: 38\. No te digo de quién: son datos de otras personas\./);
    assert.match(t, /Ya eran tuyos: 18/);
    assert.match(t, /Repetidas o sin celular: 20/);
    assert.doesNotMatch(t, /cliente|código|registrad/i);
    assert.match(t, /Cuentan para el tope del día solo la primera vez que los subes\./);
  });

  test('con 0 no hay «Listo» (debajo de «Paré…» se leía como que salió bien)', () => {
    const l = A.textoResultado({ entraron: 0, ya_existen: 60 });
    assert.equal(l[0], 'No entró nadie a tu base.');
    assert.equal(A.textoResultado({ entraron: 1 })[0], 'Listo. Entró 1 a tu base.');
  });
});

test('la firma TG_LLEGARON es su primer código, y una sola vez', () => {
  const t = fs.readFileSync(path.join(__dirname, '..', 'panel', 'agregar-prospectos.js'), 'utf8').replace(/\r\n/g, '\n');
  const codigo = t.replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, '');
  assert.ok(codigo.startsWith(FIRMA));
  assert.equal(t.split('TG_LLEGARON = window.TG_LLEGARON').length - 1, 1);
});
