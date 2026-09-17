'use strict';
/* ===========================================================================
 * EL ROBOT QUE TRAE LA USURA — 17 de septiembre de 2026
 *
 * Joan: «sobre la usura hay forma de que esa información se actualice
 * automáticamente cada mes?».
 *
 * Sí: la Superintendencia Financiera publica el interés bancario corriente en
 * el portal de Datos Abiertos del Estado, con una API de verdad
 * (datos.gov.co, serie pare-7x5i). Comprobado el 17-sep contra la tabla de
 * este repositorio: las tres filas que Joan tecleó a mano —julio, agosto y
 * septiembre de 2026— salen idénticas de esa API, con su número de resolución.
 *
 * PERO LA API PUBLICA EL INTERÉS CORRIENTE, NO EL TECHO. El ×1,5 lo hacemos
 * nosotros, y ahí está el precipicio que vigila este archivo:
 *
 *     (19.49 * 1.5).toFixed(2)   →  "29.23"   ← MAL, el techo certificado es 29,24%
 *     Math.round(19.49 * 1.5)    →  bien, pero solo si se trabaja en enteros
 *
 * 19,49 × 1,5 = 29,235 exacto, y la mitad exacta se redondea hacia arriba; en
 * binario 29.235 es 29.23499999… y `toFixed` corta hacia abajo. Pasó en TRES de
 * los últimos doce meses. Un techo publicado 0,01 por debajo del certificado le
 * quita precio a Joan; 0,01 por encima es el artículo 305 del Código Penal.
 *
 * POR ESO ESTAS PRUEBAS NO TOCAN LA RED. La red la comprueba el robot cuando
 * corre; lo que se vigila acá es la ARITMÉTICA y los controles, que son lo que
 * no puede fallar en silencio. Una prueba que dependa de datos.gov.co se pone
 * roja el día que ese portal tenga mantenimiento, y una suite que se pone roja
 * sola se ignora.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const RAIZ = path.join(__dirname, '..');
const R = require(path.join(RAIZ, 'herramientas', 'traer-usura.js'));
const C = require(path.join(RAIZ, 'app', 'creditos.js'));

/* Una certificación como la que devuelve el portal, con lo que se quiera
   cambiar encima. Los meses son de OCTUBRE a propósito: validar() rechaza una
   resolución que ya esté en TOPES, así que no se puede reconstruir un mes que
   ya está cargado. */
const MES = { desde: '2026-10-01', hasta: '2026-10-31' };
function certificacion(cambios) {
  return Object.assign({
    resolucion: '9999',
    fecha_resolucion: '2026-09-30T00:00:00.000',
    vigencia_desde: '2026-10-01T00:00:00.000',
    vigencia_hasta: '2026-10-31T00:00:00.000',
    interes_bancario_corriente: '19.49%',
    modalidad: 'CONSUMO Y ORDINARIO'
  }, cambios || {});
}

describe('el techo se calcula en enteros, nunca en decimales (17-sep-2026)', () => {

  /* Los tres casos reales de este repositorio. Si alguien «simplifica» la
     cuenta a (ibc * 1.5).toFixed(2), estos tres se caen. */
  test('los tres meses que Joan tecleó a mano salen idénticos', () => {
    [
      ['19.19%', '0.2879', 'julio: 28,785 redondea ARRIBA'],
      ['19.77%', '0.2966', 'agosto: 29,655 redondea ARRIBA'],
      ['19.49%', '0.2924', 'septiembre: 29,235 redondea ARRIBA']
    ].forEach(([ibc, esperado, porque]) => {
      const f = R.validar(certificacion({ interes_bancario_corriente: ibc }), MES);
      const linea = R.lineaNueva(f);
      assert.ok(linea.indexOf('consumo_ordinario: ' + esperado) >= 0,
        porque + ' — con ' + ibc + ' el techo salió: ' + linea);
    });
  });

  test('y coinciden con la tabla que hay en el repositorio', () => {
    /* La comprobación que de verdad importa: no que la cuenta dé lo que yo creo,
       sino que dé lo que la Superfinanciera certificó y Joan copió. */
    C.TOPES.forEach(fila => {
      if (fila.ibc == null) return;
      const ibc = (fila.ibc * 100).toFixed(2) + '%';
      const f = R.validar(certificacion({ interes_bancario_corriente: ibc }), MES);
      const esperado = fila.consumo_ordinario.toFixed(4).replace(/^0/, '0');
      assert.ok(R.lineaNueva(f).indexOf('consumo_ordinario: ' + esperado) >= 0,
        'con el interés de ' + fila.desde + ' (' + ibc + ') la cuenta ya no da ' +
        'el techo que dice la tabla (' + esperado + ')');
    });
  });

  test('el literal se escribe a mano, sin pasar por coma flotante', () => {
    /* Lo que se escribe en el archivo tiene que ser dígito por dígito lo que
       habría tecleado una persona. Un 0.29240000000000004 en el código fuente
       sería correcto para la máquina y basura para quien lo lea. */
    const f = R.validar(certificacion(), MES);
    const linea = R.lineaNueva(f);
    assert.match(linea, /consumo_ordinario: 0\.\d{4},/, 'el techo no quedó con cuatro cifras: ' + linea);
    assert.match(linea, /ibc: 0\.\d{4},/, 'el interés no quedó con cuatro cifras: ' + linea);
    assert.equal(/e-|\d{6,}/.test(linea), false, 'se coló notación científica o basura: ' + linea);
  });
});

describe('los controles frenan la basura antes de escribir nada', () => {

  const VENENOS = [
    ['coma en vez de punto', { interes_bancario_corriente: '19,49%' }],
    ['sin el signo de porcentaje', { interes_bancario_corriente: '19.49' }],
    ['ya venía en tanto por uno', { interes_bancario_corriente: '0.19%' }],
    ['la coma se corrió a la derecha', { interes_bancario_corriente: '94.90%' }],
    ['celda vacía serializada como cero', { interes_bancario_corriente: '0.00%' }],
    ['nulo', { interes_bancario_corriente: null }],
    ['salto imposible contra el mes pasado', { interes_bancario_corriente: '24.49%' }],
    ['no cubre el mes entero', { vigencia_hasta: '2026-10-15T00:00:00.000' }],
    ['es del mes equivocado', { vigencia_desde: '2026-11-01T00:00:00.000' }],
    ['firmada DESPUÉS de entrar a regir', { fecha_resolucion: '2026-10-05T00:00:00.000' }],
    ['firmada tres meses antes', { fecha_resolucion: '2026-07-01T00:00:00.000' }],
    ['la resolución no es un número', { resolucion: 'mil doscientos' }]
  ];

  VENENOS.forEach(([nombre, cambio]) => {
    test('frena: ' + nombre, () => {
      assert.throws(() => R.validar(certificacion(cambio), MES),
        'pasó una certificación envenenada (' + nombre + '): el robot habría escrito basura');
    });
  });

  test('una resolución que YA está en la tabla se rechaza', () => {
    /* La fuente puede devolver una fila vieja por un error de su lado. Si se
       escribiera, la tabla tendría dos meses con la misma certificación. */
    const ultima = C.TOPES[C.TOPES.length - 1];
    const num = (String(ultima.fuente).match(/(\d+)/) || [])[1];
    if (!num) return;   // la fila más nueva no cita número: nada que comprobar
    assert.throws(() => R.validar(certificacion({ resolucion: num }), MES),
      'aceptó la resolución ' + num + ', que ya está en TOPES');
  });

  test('la buena SÍ pasa, o los controles no sirven de nada', () => {
    /* El otro lado del interruptor: doce venenos frenados no valen nada si
       también frena el dato bueno. */
    assert.doesNotThrow(() => R.validar(certificacion(), MES),
      'rechaza una certificación correcta: el robot nunca cargaría nada');
  });
});

describe('el robot sabe qué mes le falta, y no publica solo', () => {

  test('pide el mes siguiente al último certificado', () => {
    const m = R.mesQueFalta();
    const ultimo = C.ultimoTopeCertificado();
    const d = new Date(ultimo + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    assert.equal(m.desde, d.toISOString().slice(0, 10),
      'no está pidiendo el mes que sigue al último cargado');
    assert.match(m.hasta, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(m.hasta > m.desde, 'el mes termina antes de empezar');
  });

  test('NADIE publica sin que un humano mire, y está escrito en el workflow', () => {
    /* Este número decide si el precio es delito, el sitio es estático y lo que
       entra a main está en la calle un minuto después. El robot teclea; la
       firma sigue siendo de Joan. Si alguien cambia esto por un commit directo,
       esta prueba se cae. */
    const yml = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'traer-usura.yml'), 'utf8');
    assert.match(yml, /gh pr create/, 'el robot dejó de abrir un Pull Request');
    assert.equal(/git push origin main|--base main --head main/.test(yml), false,
      'el robot empuja a main: estaría publicando un techo de usura sin que nadie lo mire');
    assert.match(yml, /node --test/, 'abre el PR sin correr las pruebas con la fila nueva puesta');
  });

  test('el script no escribe si no se le pide', () => {
    /* `--escribir` es explícito. Corriéndolo sin esa bandera, el archivo no se
       toca: eso es lo que permite que el vigilante de vigilar.yml lo use solo
       para avisar. */
    const fuente = fs.readFileSync(path.join(RAIZ, 'herramientas', 'traer-usura.js'), 'utf8');
    assert.match(fuente, /--escribir/, 'se perdió la bandera que separa mirar de escribir');
    assert.match(fuente, /if \(escribirlo\)/, 'escribe siempre, se le pida o no');
  });
});
