'use strict';
/* ==========================================================================
 * AGREGAR PROSPECTOS: LAS REGLAS PURAS — 27-oct-2026
 *
 *   node --test pruebas/agregar-prospectos.test.js
 *
 * panel/agregar-prospectos.js decide qué columnas extra de un archivo se
 * ofrecen para guardar (y cuáles no, y por qué), cómo se limpian el nombre, la
 * nota y cada valor, y cómo se parte y se reparte un archivo. Lo que se cuida:
 *   · (ronda 3) LO QUE VIAJA ES UNA LISTA BLANCA: solo Ciudad, Monto que pide,
 *     Ocupación o negocio, Cómo llegó y Observación, con su nombre fijo; una
 *     columna «DIR», «Ubicación», «Domicilio» o «Barrio» no se ofrece nunca, y
 *     una dirección escrita sin «#» («CL 45 SUR 12 34») tampoco se guarda;
 *   · (ronda 4) la columna que llena cada dato se reconoce por su nombre
 *     EXACTO, no por pedazos: «Ubicación del negocio», «Barrio / Ciudad»,
 *     «Municipio / Vereda», «Observaciones de visita» o «Medio de pago» no se
 *     ofrecen; «Empresa» sí (es el negocio);
 *   · una base de COBRANZA de otra empresa (la forma de las nueve que midió
 *     detectarColumnas) no deja pasar ninguna de sus columnas: ni el estado
 *     «YA PAGO» / «VENCIDO», ni el asesor, ni el valor, ni la fecha de Excel;
 *   · lo que sí se puede guardar va SIN MARCAR;
 *   · la regla es la misma del servidor (extra_limpio): el mismo ejemplo y las
 *     mismas direcciones, leídos de la prueba de PostgreSQL;
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
const PG = fs.readFileSync(path.join(__dirname, 'el-gerente-agrega-postgres.test.js'), 'utf8');
/* Las direcciones del hallazgo de la ronda 3, las MISMAS que prueba extra_limpio. */
const DIRECCIONES = JSON.parse((PG.match(/const DIRECCIONES = (\[[^\]]+\]);/) || [])[1] || '[]');

describe('las columnas extra: una lista blanca', () => {

  test('las cinco, y nada más; con su nombre fijo y la columna de donde salen', () => {
    assert.deepEqual(A.CLAVES_QUE_VIAJAN, ['Ciudad', 'Monto que pide', 'Ocupación o negocio', 'Cómo llegó', 'Observación']);
    assert.equal(A.MAX_EXTRAS, 5);
  });

  test('una feria: Ocupación, Municipio y «¿Cómo llegó?» se ofrecen SIN marcar; Barrio, una segunda de negocio (Empresa) y una sin encabezado no', () => {
    const filas = [
      ['Nombre completo', 'Celular', 'Barrio', 'Ocupación', 'Municipio', '¿Cómo llegó?', 'Empresa', ''],
      ['ANA MARIA PEREZ', '3001112233', 'Kennedy', 'vende arepas', 'Bogotá', 'feria', 'Panadería La 40', 'tarde'],
      ['PEDRO GOMEZ', '310 222 3344', 'Suba', 'taller de motos', 'Soacha', 'volante', 'Taller El Rayo', 'mañana'],
      ['LUZ TORRES', '+57 320 555 6677', 'Bosa', 'modista', 'Bogotá', 'feria', '', 'tarde']];
    const cols = B.detectarColumnas(filas);
    assert.deepEqual([cols.nombre, cols.celular, cols.encabezado], [0, 1, 1]);
    const r = A.columnasExtra(filas, cols);
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Ocupación o negocio', 'Ciudad', 'Cómo llegó']);
    assert.deepEqual(r.columnas.map(c => c.columna), ['Ocupación', 'Municipio', '¿Cómo llegó?']);
    assert.ok(r.columnas.every(c => c.marcada === false), 'una columna salió marcada: se marcan a propósito, no por defecto');
    assert.equal(r.columnas[1].muestra, 'Bogotá');
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    assert.equal(motivo('Barrio'), 'no es de lo que viaja');
    /* Ronda 4 — «Empresa» es el negocio, pero ya va «Ocupación». */
    assert.equal(motivo('Empresa'), 'ya va «Ocupación o negocio» de la columna «Ocupación»');
    assert.equal(motivo('Columna H'), 'no es de lo que viaja');
    const e = A.extrasPorCelular(filas, cols, r.columnas);
    assert.deepEqual(e['3102223344'], { 'Ocupación o negocio': 'taller de motos', Ciudad: 'Soacha', 'Cómo llegó': 'volante' });
  });

  /* 27-oct-2026, ronda 3 — EL HALLAZGO: la dirección seguía viajando con una
     columna «DIR» o «Ubicación» y con direcciones escritas sin «#». */
  test('LA DIRECCIÓN NO VIAJA: «DIR», «Ubicación», «Domicilio», «Barrio» o «Dir 2» no se ofrecen, y una dirección en «Observaciones» no se guarda', () => {
    const filas = [
      ['Nombre', 'Celular', 'DIR', 'Ubicación', 'Domicilio', 'Barrio', 'Dir 2', 'Observaciones', 'Ciudad'],
      ['PABLO GOMEZ', '3001112233', 'CL 45 SUR 12 34', 'KR 7 45 10', 'Mz 4 Casa 12', 'Kennedy', 'Cll 45 N 12-30', 'vende empanadas', 'Bogotá'],
      ['ANA PEREZ', '3102223344', 'KR 7 # 12-30', 'Av Boyacá 12-30', 'Mz B Cs 12', 'Bosa', 'AK 68 12 30', 'KR 80 C 2-15', 'Soacha'],
      ['LUZ TORRES', '3205556677', 'Diagonal 5 Bis 3-2', 'Transv. 5 # 3-2', 'Apto 301', 'Suba', 'Calle 13', 'tiene un taller', 'Bogotá']];
    const cols = B.detectarColumnas(filas);
    const r = A.columnasExtra(filas, cols);
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Observación', 'Ciudad'], 'ofreció: ' + r.columnas.map(c => c.columna).join(', '));
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    ['DIR', 'Ubicación', 'Barrio', 'Dir 2'].forEach(n => assert.equal(motivo(n), 'no es de lo que viaja', n));
    assert.equal(motivo('Domicilio'), 'es una dirección: no viaja al equipo');
    const e = A.extrasPorCelular(filas, cols, r.columnas);
    assert.deepEqual(e['3102223344'], { Ciudad: 'Soacha' }, 'la dirección escrita en «Observaciones» viajó');
    assert.deepEqual(e['3001112233'], { 'Observación': 'vende empanadas', Ciudad: 'Bogotá' });
    /* Aunque alguien le pase la columna a mano, una que no es de las cinco no se guarda. */
    assert.deepEqual(A.extrasPorCelular(filas, cols, [{ i: 2, nombre: 'DIR' }, { i: 5, nombre: 'Barrio' }]), {});
    /* Cada una de las direcciones del hallazgo, en cualquiera de las cinco. */
    assert.ok(DIRECCIONES.length >= 15, 'no encontré la lista DIRECCIONES de la prueba de PostgreSQL');
    DIRECCIONES.forEach(v => {
      assert.equal(A.limpiarValor(v), '', v);
      A.CLAVES_QUE_VIAJAN.forEach(k => assert.equal(A.limpiarValorDe(k, v), '', k + ': ' + v));
    });
    /* CONTROL: lo que no es una dirección sigue entrando. */
    ['vende en la calle del mercado', 'Av. principal', 'tiene 2 hijos', 'vende manzanas', 'casa propia', 'Apartadó']
      .forEach(v => assert.equal(A.limpiarValor(v), v, v));
  });

  /* 27-oct-2026, ronda 4 — EL HALLAZGO: la lista blanca seguía ADIVINANDO qué
     columna llenaba cada dato por pedazos del nombre. «Ubicación del negocio» o
     «Lugar de trabajo» entraban como «Ocupación o negocio», «Barrio / Ciudad»
     como «Ciudad», «Observaciones de visita» como «Observación» y «Medio de
     pago» como «Cómo llegó». Y «Empresa», que es el negocio, se descartaba. */
  test('la columna se reconoce por su nombre EXACTO (sin mayúsculas, tildes ni signos), no por pedazos', () => {
    ['Ubicación del negocio', 'Sitio del negocio', 'Lugar de trabajo', 'Punto de venta del negocio', 'Barrio / Ciudad', 'Ciudad y barrio',
      'Municipio / Vereda', 'Ciudad / Barrio', '¿En qué ciudad y barrio vives?', 'Municipio - Barrio', 'Dirección y ciudad',
      'Observaciones de visita', 'Medio de pago', 'Origen de los fondos', 'Valor de la cuota que pide', 'Trabajo de la mamá']
      .forEach(n => assert.equal(A.queViajaDe(n), null, n + ' se ofreció como «' + (A.queViajaDe(n) || {}).clave + '»'));
    [['Ciudad', 'Ciudad'], ['  CIUDAD:  ', 'Ciudad'], ['Municipio', 'Ciudad'], ['Ciudad de residencia', 'Ciudad'],
      ['Monto que pide', 'Monto que pide'], ['Valor solicitado', 'Monto que pide'], ['¿Cuánto necesita?', 'Monto que pide'],
      ['Ocupación', 'Ocupación o negocio'], ['Empresa', 'Ocupación o negocio'], ['Negocio', 'Ocupación o negocio'], ['¿A qué se dedica?', 'Ocupación o negocio'],
      ['¿Cómo llegó?', 'Cómo llegó'], ['Medio', 'Cómo llegó'], ['Campaña', 'Cómo llegó'],
      ['Observaciones', 'Observación'], ['OBS.', 'Observación'], ['Comentarios', 'Observación']]
      .forEach(([n, clave]) => assert.equal((A.queViajaDe(n) || {}).clave, clave, n));
    assert.equal(A.normalEncabezado('  ¿Cómo  llegó? '), 'como llego');
    /* En un archivo: la de feria-suba.xlsx («Empresa») entra; las del hallazgo, no. */
    const filas = [['Nombre', 'Celular', 'Empresa', 'Ubicación del negocio', 'Barrio / Ciudad', 'Observaciones de visita', 'Medio de pago'],
      ['ANA PEREZ', '3001112233', 'Panadería La 40', 'CC Gran Estación local 2-115', 'Kennedy, Bogotá', 'casa esquinera azul frente al parque', 'efectivo'],
      ['PEDRO GOMEZ', '3102223344', 'Taller El Rayo', 'Corabastos bodega 23', 'La Calera - Vereda El Salitre', 'detrás de la iglesia', 'Nequi']];
    const r = A.columnasExtra(filas, { nombre: 0, celular: 1, encabezado: 1 });
    assert.deepEqual(r.columnas.map(c => [c.nombre, c.columna]), [['Ocupación o negocio', 'Empresa']]);
    ['Ubicación del negocio', 'Barrio / Ciudad', 'Observaciones de visita'].forEach(n =>
      assert.equal((r.descartadas.find(d => d.nombre === n) || {}).motivo, 'no es de lo que viaja', n));
    assert.equal((r.descartadas.find(d => d.nombre === 'Medio de pago') || {}).motivo, 'es plata o deuda');
    /* El puesto donde trabaja es otra forma de encontrarlo: no se guarda. */
    ['CC Gran Estación local 2-115', 'Corabastos bodega 23 puesto cuarenta', 'puesto 40 de la plaza', 'Oficina 301']
      .forEach(v => assert.equal(A.limpiarValorDe('Ocupación o negocio', v), '', v));
    ['tiene un local propio', 'vende en la plaza', 'trabaja en oficina'].forEach(v => assert.equal(A.limpiarValor(v), v, v));
  });

  test('una base de COBRANZA de mentira (como las nueve medidas) no ofrece NINGUNA de sus columnas', () => {
    const filas = [
      ['TITULAR', 'CELULAR', 'OBSERVACIÓN', 'Asesor', 'Valor', 'Fecha', 'Estado', 'Saldo', 'EPS', 'Cédula', 'Recomendado por'],
      ['ANA PEREZ', '3001112233', 'YA PAGO', 'CAMILA', '350000', '45950', 'VENCIDO', '120.000', 'Sura', '52111222', 'María'],
      ['PEDRO GOMEZ', '3102223344', 'NO CONTESTA', 'CAMILA', '200000', '45951', 'VENCIDO', '80.000', 'Nueva EPS', '52111223', 'Juan'],
      ['LUZ TORRES', '3205556677', 'PROMESA DE PAGO', 'JORGE', '150000', '45952', 'AL DIA', '0', 'Sanitas', '52111224', 'Ana'],
      ['JOSE RUIZ', '3115556677', 'YA PAGO', 'JORGE', '90000', '45953', 'VENCIDO', '15.000', 'Sura', '52111225', 'Ana']];
    const r = A.columnasExtra(filas, B.detectarColumnas(filas));
    assert.deepEqual(r.columnas, [], 'ofreció guardar: ' + r.columnas.map(c => c.columna).join(', '));
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    assert.match(motivo('OBSERVACIÓN'), /trae estados de cobro: «YA PAGO», «NO CONTESTA»/);
    assert.equal(motivo('Asesor'), 'es otra persona');
    assert.equal(motivo('Valor'), 'suele traer datos de cobranza');
    assert.equal(motivo('Fecha'), 'no es de lo que viaja');
    assert.equal(motivo('Estado'), 'suele traer datos de cobranza');
    assert.equal(motivo('Saldo'), 'es plata o deuda');
    assert.equal(motivo('EPS'), 'es un dato de salud');
    assert.equal(motivo('Cédula'), 'es un documento');
    assert.equal(motivo('Recomendado por'), 'es otra persona');
  });

  /* 27-oct-2026, revisión — «Observaciones» se descartaba por su NOMBRE
     («es de cobranza») aunque dijera «vende arepas». */
  test('una feria: «Observaciones» SÍ se ofrece; la cédula y la fecha no', () => {
    const filas = [
      ['Nombre', 'Celular', 'Observaciones', 'Fecha de la feria', 'Cédula', 'Estado'],
      ['ANA PEREZ', '3001112233', 'vende arepas en la esquina', '2026-10-01', '52111222', 'interesada'],
      ['PEDRO GOMEZ', '3102223344', 'prefiere WhatsApp', '01/10/2026', '52111223', 'lo piensa'],
      ['LUZ TORRES', '3205556677', 'tiene un taller', '2026-10-01', '52111224', 'interesada']];
    const r = A.columnasExtra(filas, B.detectarColumnas(filas));
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Observación']);
    assert.equal(r.columnas[0].muestra, 'vende arepas en la esquina');
    const motivo = n => (r.descartadas.find(d => d.nombre === n) || {}).motivo;
    assert.equal(motivo('Cédula'), 'es un documento');
    assert.equal(motivo('Fecha de la feria'), 'no es de lo que viaja');
    assert.equal(motivo('Estado'), 'suele traer datos de cobranza');
    const e = A.extrasPorCelular(filas, B.detectarColumnas(filas), r.columnas);
    assert.deepEqual(e['3102223344'], { 'Observación': 'prefiere WhatsApp' });
  });

  test('cada dato una sola vez: la segunda columna de lo mismo dice de dónde sale el primero', () => {
    const filas = [['Nombre', 'Celular', 'Ocupación', 'Negocio'], ['ANA PEREZ', '3001112233', 'modista', 'Taller Ana'],
      ['PEDRO GOMEZ', '3102223344', 'mecánico', 'Motos Pedro']];
    const r = A.columnasExtra(filas, { nombre: 0, celular: 1, encabezado: 1 });
    assert.deepEqual(r.columnas.map(c => c.columna), ['Ocupación']);
    assert.deepEqual(r.descartadas.map(d => d.motivo), ['ya va «Ocupación o negocio» de la columna «Ocupación»']);
  });

  test('«Monto que pide»: solo montos en pesos, redondos a mil; «Monto» a secas no (es plata o deuda)', () => {
    const filas = [['Nombre', 'Celular', 'Monto que pide', 'Monto'], ['ANA PEREZ', '3001112233', '500.000', '120.000'],
      ['PEDRO GOMEZ', '3102223344', '$ 1.200.000', '80.000'], ['LUZ TORRES', '3205556677', 800000, '0']];
    const cols = { nombre: 0, celular: 1, encabezado: 1 };
    const r = A.columnasExtra(filas, cols);
    assert.deepEqual(r.columnas.map(c => c.nombre), ['Monto que pide']);
    assert.equal(r.columnas[0].muestra, '$500.000');
    assert.equal((r.descartadas.find(d => d.nombre === 'Monto') || {}).motivo, 'es plata o deuda');
    assert.deepEqual(A.extrasPorCelular(filas, cols, r.columnas)['3205556677'], { 'Monto que pide': '$800.000' });
    /* Una cédula o un teléfono no son un monto: no terminan en 000, o no caben. */
    ['52345678', '3001234567', '1.000', 'lo que pueda', '1.5 millones'].forEach(v => assert.equal(A.montoQuePide(v), '', v));
    assert.equal(A.montoQuePide('500.000,00'), '$500.000');
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
      ['Nombre', 'Celular', 'Ciudad', 'Observaciones'],
      ['ANA PEREZ', '3001112233', 'Bogotá', 'su hermano 3109998877'],
      ['ANA PEREZ', '573001112233', 'Cali', 'otra'],
      ['PEDRO GOMEZ', '3102223344', 'x'.repeat(200), 'vende arepas']];
    const cols = { nombre: 0, celular: 1, encabezado: 1 };
    const e = A.extrasPorCelular(filas, cols, [{ i: 2, nombre: 'Ciudad' }, { i: 3, nombre: 'Observación' }]);
    assert.deepEqual(e['3001112233'], { Ciudad: 'Bogotá' }, 'no ganó la primera aparición, o pasó un teléfono ajeno');
    assert.equal(e['3102223344'].Ciudad.length, 120);
    assert.equal(e['3102223344']['Observación'], 'vende arepas');
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
    /* Una ciudad no lleva números. */
    assert.equal(A.limpiarValorDe('Ciudad', 'Bogotá'), 'Bogotá');
    assert.equal(A.limpiarValorDe('Ciudad', 'Bogotá 110111'), '');
    assert.equal(A.limpiarValorDe('Barrio', 'Kennedy'), '', 'una clave que no es de las cinco se guardó');
  });

  test('el ejemplo de la prueba del servidor da lo mismo aquí (extra_limpio)', () => {
    const m = PG.match(/const EJEMPLO = (\{[^}]+\});/);
    assert.ok(m, 'no encontré EJEMPLO en la prueba de PostgreSQL');
    const ejemplo = JSON.parse(m[1]);
    const esperado = JSON.parse((PG.match(/const QUEDAN = (\{[^}]+\});/) || [])[1] || 'null');
    const aqui = {};
    Object.keys(ejemplo).forEach(k => { const v = A.limpiarValorDe(k, ejemplo[k]); if (v) aqui[k] = v; });
    assert.deepEqual(aqui, esperado, 'el CRM y extra_limpio no guardan lo mismo');
    assert.match(PG, /assert\.deepEqual\(limpio, QUEDAN/);
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
