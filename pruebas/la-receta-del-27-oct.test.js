'use strict';
/* ==========================================================================
 * LA RECETA DEL 27-OCT DICE LO QUE HAY EN base/ — 23-oct-2026
 *
 *   node --test pruebas/la-receta-del-27-oct.test.js
 *
 * RECETA-PUBLICAR-27-OCT.md es lo que Joan sigue SOLO, en la base de
 * producción, el martes 27. Una receta que nombra un archivo que ya no se
 * llama así, o que dice «6 filas en true» de una tabla que ahora tiene 7, es
 * peor que no tener receta: Joan para, o sigue creyendo que algo salió mal.
 * Y ya pasó una vez esta misma semana: el 23-oct tres de los cuatro SQL del
 * 22-oct cambiaron de nombre al juntar las ramas (b2b4fb6).
 *
 * Por eso estas pruebas atan la receta a los archivos:
 *   1. nombra, en encabezados y en el orden en que se corren, TODOS los SQL
 *      de base/ que vienen después del último aplicado en producción
 *      (20261020_la_cedula_de_la_cuenta.sql, aplicado el 21-oct) hasta el
 *      27-oct; uno que se agregue antes del martes tiene que entrar a la
 *      receta, y uno de después (20261028…) ya no es de esta publicación;
 *   2. para cada uno, cuántas filas tienen que salir en true es lo que cuenta
 *      la tabla del final de ESE archivo;
 *   3. la comprobación de la web va al dominio de CNAME y se compara con el
 *      sw.js que de verdad se sube (git show HEAD:sw.js), no con un número
 *      escrito a mano que alguien puede subir antes del martes;
 *   4. ninguna contraseña ni ningún celular de verdad. La línea de
 *      equipo_poner_clave lleva el mismo marcador que la tabla del SQL
 *      (UNA-CLAVE-NUEVA): la clave la escribe Joan en el editor de Supabase,
 *      nunca en la receta, que se copia, se reenvía y se imprime.
 *
 * LA RECETA NO VIAJA AL REPOSITORIO, a propósito: `RECETA-*.md` está en
 * .gitignore (el repositorio es público y Pages sirve los .md de la raíz en
 * tugarantia.net; una receta cuenta qué hueco tapa cada SQL antes de que esté
 * corrido). Así que esto se comprueba donde la receta está —la carpeta de
 * Joan, o la copia donde se escribió— y en un clon limpio (GitHub Actions) se
 * salta diciendo por qué, como platachat.test.js con RECETA-PLATACHAT.md.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const RUTA_RECETA = path.join(RAIZ, 'RECETA-PUBLICAR-27-OCT.md');
const leerReceta = () => {
  assert.ok(fs.existsSync(RUTA_RECETA), 'falta RECETA-PUBLICAR-27-OCT.md en la raíz');
  return fs.readFileSync(RUTA_RECETA, 'utf8');
};
const lineas = t => t.split(/\r?\n/);

/* El último SQL aplicado en producción antes de esta publicación (21-oct-2026,
   verificado ese día) y el día de la publicación. Lo que cae entre los dos es
   lo que la receta tiene que mandar a correr. */
const ULTIMO_APLICADO = '20261020_la_cedula_de_la_cuenta.sql';
const HASTA = '20261027';
const MIGRACION = f => /^\d{8}.*\.sql$/.test(f);
const pendientes = () => fs.readdirSync(path.join(RAIZ, 'base')).filter(MIGRACION).sort()
  .filter(f => f > ULTIMO_APLICADO && f.slice(0, 8) <= HASTA);

/* La sección de la receta que encabeza un archivo: desde su encabezado hasta
   el siguiente encabezado de nivel 2 o 3. */
function seccionDe(receta, archivo) {
  const ls = lineas(receta);
  const i = ls.findIndex(l => /^#{2,4}\s/.test(l) && l.indexOf(archivo) >= 0);
  if (i < 0) return null;
  let j = i + 1;
  while (j < ls.length && !/^#{2,3}\s/.test(ls[j])) j++;
  return ls.slice(i, j).join('\n');
}

/* Cuántas filas de comprobación trae la tabla del final de un SQL: los SELECT
   pegados al margen después de «¿QUEDÓ?» o «LO QUE JOAN VE» (los de adentro
   van con sangría). La del equipo agrega debajo una fila por persona del
   equipo (row_number): esas no son comprobaciones y no se cuentan. */
function filasDeLaTabla(archivo) {
  const t = fs.readFileSync(path.join(RAIZ, 'base', archivo), 'utf8');
  const i = Math.max(t.lastIndexOf('¿QUEDÓ?'), t.lastIndexOf('LO QUE JOAN VE'));
  assert.ok(i >= 0, archivo + ' no tiene la tabla final («¿QUEDÓ?» o «LO QUE JOAN VE»)');
  return lineas(t.slice(i)).filter(l => /^select\s/i.test(l) && !/row_number/.test(l)).length;
}

describe('la receta del 27-oct dice lo que hay en base/', {
  skip: !fs.existsSync(RUTA_RECETA) &&
    'RECETA-PUBLICAR-27-OCT.md no se publica (.gitignore: RECETA-*.md): corre solo donde está la receta, en el computador de Joan'
}, () => {

  test('control: hay SQL pendientes para el 27 (los cuatro del 22-oct, al menos)', () => {
    const p = pendientes();
    assert.ok(p.length >= 4, 'esperaba al menos los cuatro del 22-oct y hay: ' + p.join(', '));
    /* 27-oct-2026 — EL GERENTE AGREGA. El del equipo sigue siendo el último de
       los que dejan a alguien afuera; después va 20261027 (el 2.4-bis), que lo
       EXIGE: se para en su paso 0 si falta 22d. */
    assert.equal(p[p.length - 1], '20261027_el_gerente_agrega.sql',
      'el último pendiente ya no es el del gerente que agrega (2.4-bis)');
    assert.ok(p.indexOf('20261022d_el_equipo_con_la_clave_de_joan.sql') === p.length - 2,
      'el del equipo ya no va justo antes del 2.4-bis');
    const sql27 = fs.readFileSync(path.join(RAIZ, 'base', '20261027_el_gerente_agrega.sql'), 'utf8');
    assert.match(sql27, /to_regprocedure\('public\.celular_del_equipo_de_sesion\(\)'\) is null/, 'el 2.4-bis no exige el 2.4');
  });

  test('el 2.4-bis dice que va después del 2.4, de noche, y con 10 filas en true', () => {
    const s = seccionDe(leerReceta(), '20261027_el_gerente_agrega.sql');
    assert.ok(s, 'la receta no tiene la sección del 2.4-bis (base/20261027_el_gerente_agrega.sql): pégala de RECETA-2.4-bis.md');
    assert.match(s, /2\.4-bis/);
    assert.match(s, /de noche/i, 'no dice que se corre de noche (crea índices: mientras tanto nadie termina su registro)');
    assert.match(s, /10\s+filas/);
    assert.match(s, /equipo_acuerdo_firmado/, 'no dice cómo anotar el acuerdo del gerente');
    assert.match(s, /recarga el CRM/i, 'no dice que recargue el CRM del computador');
  });

  test('nombra cada SQL pendiente en un encabezado, en el orden en que se corren', () => {
    const receta = leerReceta();
    const ls = lineas(receta);
    const donde = pendientes().map(f => ({ f, i: ls.findIndex(l => /^#{2,4}\s/.test(l) && l.indexOf(f) >= 0) }));
    const faltan = donde.filter(d => d.i < 0).map(d => d.f);
    assert.deepEqual(faltan, [], 'la receta no tiene un paso para: ' + faltan.join(', '));
    for (let k = 1; k < donde.length; k++) {
      assert.ok(donde[k].i > donde[k - 1].i,
        donde[k].f + ' va antes que ' + donde[k - 1].f + ' en la receta, y en base/ es al revés');
    }
  });

  test('cada paso dice cuántas filas en true salen, y es lo que trae la tabla de ese SQL', () => {
    const receta = leerReceta();
    pendientes().forEach(f => {
      const s = seccionDe(receta, f);
      assert.ok(s, 'sin sección para ' + f);
      const m = s.match(/(\d+)\s+(?:primeras\s+)?filas/);
      assert.ok(m, 'la sección de ' + f + ' no dice cuántas filas tienen que salir');
      assert.equal(Number(m[1]), filasDeLaTabla(f),
        'la receta dice ' + m[1] + ' filas para ' + f + ' y su tabla trae ' + filasDeLaTabla(f));
      assert.match(s, /true/, 'la sección de ' + f + ' no dice que tienen que salir en true');
    });
  });

  test('la web se comprueba en el dominio de CNAME y contra el sw.js que se sube', () => {
    const receta = leerReceta();
    const dominio = fs.readFileSync(path.join(RAIZ, 'CNAME'), 'utf8').trim();
    assert.ok(receta.indexOf('https://' + dominio + '/sw.js') >= 0,
      'la comprobación con curl no va a https://' + dominio + '/sw.js');
    assert.match(receta, /git show HEAD:sw\.js/,
      'la receta no compara con el sw.js que de verdad se sube (git show HEAD:sw.js)');
    const cache = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/);
    assert.ok(cache, 'sw.js sin const CACHE');
  });

  test('ninguna contraseña ni ningún celular de verdad: la línea de la clave lleva el marcador del SQL', () => {
    const receta = leerReceta();
    const sqlEquipo = fs.readFileSync(path.join(RAIZ, 'base', '20261022d_el_equipo_con_la_clave_de_joan.sql'), 'utf8');
    const MARCA = 'UNA-CLAVE-NUEVA';
    assert.ok(sqlEquipo.indexOf("''" + MARCA + "''") >= 0, 'la tabla del SQL del equipo ya no usa ' + MARCA);
    const lineasClave = [...receta.matchAll(/equipo_poner_clave\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g)];
    assert.ok(lineasClave.length >= 1, 'la receta no muestra cómo se ve la línea de equipo_poner_clave');
    lineasClave.forEach(m => {
      assert.equal(m[2], MARCA, 'la receta trae una contraseña escrita: ' + m[0]);
      assert.doesNotMatch(m[1], /^3\d{9}$/, 'la receta trae un celular de verdad en la línea de la clave');
    });
    assert.doesNotMatch(receta, /(^|[^\d])3\d{9}([^\d]|$)/, 'la receta trae un celular de verdad (el repositorio es público)');
  });
});
