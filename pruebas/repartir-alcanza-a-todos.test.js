'use strict';
/* ==========================================================================
 * REPARTIR ALCANZA A LOS QUE NO ESTÁN PINTADOS
 * 23 de septiembre de 2026
 *
 * Salió cargando la base de verdad de Joan: 18.190 prospectos.
 *
 * La pantalla de repartir de la pestaña Equipo pintaba 300 casillas y leía lo
 * marcado con `querySelectorAll('.reChk')`. Con 300 personas eso es lo mismo;
 * con 18.190, «Todos» marcaba 300 y el botón asignaba 300.
 *
 * Y no eran 300 distintas cada vez: la lista sale ordenada por etapa, así que
 * al volver a abrir salían LAS MISMAS. El reparto se quedaba clavado en 300
 * para siempre — sin un error, sin un aviso, sin nada que mirar.
 *
 * ---------------------------------------------------------------------------
 * LO QUE ENSEÑA, Y NO ES SOBRE ESTE BOTÓN
 *
 * La pantalla decía «Se pintan 300 de 18190». Eso era CIERTO. Y el botón decía
 * «Asignar», sin decir a cuántos. Una frase cierta al lado de una incompleta se
 * lee como si las dos estuvieran completas: el número honesto de arriba hacía
 * de aval del silencio de abajo.
 *
 * Por eso el arreglo no es solo mover la selección a memoria: es que el botón
 * diga «Seleccionar los 18190» y que el aviso del tope explique que
 * seleccionar SÍ alcanza a todos.
 *
 * ---------------------------------------------------------------------------
 * Y LA OTRA MITAD YA ESTABA BIEN. `pantallaAsignar` —la de Bases, mil líneas
 * más abajo— lleva su bandera `_todosMarcados` desde el principio, con un
 * comentario que nombra el problema. Esta se quedó sin el arreglo, y
 * `_marcadosEq` era el muñón de la intención: se declaraba, se vaciaba, y no lo
 * leía nadie. Un arreglo aplicado a uno de dos caminos iguales es medio
 * arreglo, y el que queda sin él no avisa de que le falta.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CRM = fs.readFileSync(
  path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

const funcion = nombre => {
  const i = CRM.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return CRM.slice(i, CRM.indexOf('\n}', i));
};

describe('la selección no vive en el DOM', () => {

  test('el botón reparte lo marcado, no lo pintado', () => {
    const f = funcion('confirmarRepartirEq');
    assert.match(f, /Object\.keys\(_marcadosEq\)/,
      'volvió a leer la selección del DOM: en el DOM solo están los 300 pintados, ' +
      'así que el reparto se queda clavado en 300 sin dar un solo error');
    assert.equal(/querySelectorAll\('\.reChk'\)[\s\S]*?\.checked/.test(f), false,
      'confirmarRepartirEq vuelve a deducir del DOM lo que hay marcado');
  });

  test('«seleccionar todos» recorre la lista COMPLETA', () => {
    const f = funcion('marcarTodosEq');
    assert.match(f, /_genteEq\.forEach/,
      'marcarTodosEq volvió a marcar solo las casillas pintadas');
  });

  test('y «solo los míos» también', () => {
    /* Es el mismo fallo con otra ropa: si mis clientes 400 al 900 no están
       pintados, «solo los míos» se deja fuera a los míos. */
    assert.match(funcion('marcarMiosEq'), /_genteEq\.forEach/,
      'marcarMiosEq mira el DOM: se deja fuera a los tuyos que no están pintados');
  });

  test('la lista completa se guarda al abrir la pantalla', () => {
    assert.match(funcion('repartirEq'), /_genteEq = gente/,
      'sin guardar la lista entera, los marcadores no tienen sobre qué trabajar');
  });

  test('el DOM es el espejo, y se pone al día solo', () => {
    assert.match(funcion('reflejarEq'), /c\.checked = !!_marcadosEq\[c\.value\]/,
      'las casillas pintadas dejaron de reflejar la selección: se marca por ' +
      'dentro y la pantalla no lo enseña');
    assert.match(funcion('marcarUnoEq'), /_marcadosEq\[chk\.value\] = true/,
      'tocar una casilla ya no escribe en la selección');
  });

  test('la cuenta sale de la selección, no de las casillas', () => {
    assert.match(funcion('contarEq'), /Object\.keys\(_marcadosEq\)\.length/,
      'el contador volvió a contar casillas: diría 300 sobre 18.190 marcados');
  });
});

describe('la pantalla dice a cuántos alcanza', () => {

  test('el botón lleva el número escrito', () => {
    /* «Todos» a secas era la palabra exacta que el código no cumplía. */
    assert.match(CRM, /marcarTodosEq\(true\)">Seleccionar los \$\{gente\.length\}/,
      'el botón volvió a decir «Todos» sin decir cuántos son');
  });

  test('y el aviso del tope explica la consecuencia, no solo el hecho', () => {
    /* Decir «se pintan 300 de 18190» es cierto y no basta: lo que Joan necesita
       saber es si seleccionar alcanza más allá de lo que ve. */
    assert.match(CRM, /alcanza a todos<\/b>,\s*\n?\s*no solo a los de esta lista/,
      'el aviso volvió a decir solo cuántas se pintan, sin decir que ' +
      'seleccionar sí llega a todas');
  });
});

describe('el otro camino de repartir sigue bien', () => {
  /* La de Bases es la que Joan usa para sus bases. Se vigila aquí porque las
     dos hacen lo mismo y la lección se aprendió en la otra. */

  test('pantallaAsignar conserva su bandera', () => {
    assert.match(CRM, /let _todosMarcados=false;\s*\/\/ «seleccionar todos» alcanza a los no pintados/,
      'desapareció la bandera que hace que el reparto de Bases alcance a todos');
    assert.match(funcion('idsAAsignar'), /_todosMarcados.*_asignables\.map/s,
      'idsAAsignar dejó de devolver la lista entera cuando están todos marcados');
  });

  test('y su botón también lleva el número', () => {
    assert.match(CRM, /marcarTodos\(true\)">Seleccionar los \$\{_asignables\.length\}/);
  });
});
