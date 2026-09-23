'use strict';
/* ==========================================================================
 * RETIRAR A ALGUIEN NO PUEDE HACER DESAPARECER SU CARTERA
 * 22 de septiembre de 2026 — fase 4 del plan de los roles
 *
 * Joan: el gerente «sera mi mano derecha en la gestion de personal».
 *
 * ---------------------------------------------------------------------------
 * EL DEFECTO, Y POR QUÉ NO GRITABA
 *
 * `asesor_retirar` hacía una sola cosa: `set estado = 'retirado'`. Las
 * asignaciones seguían apuntando a ese celular y `mi_alcance` solo devolvía
 * gente activa. Así que desde el segundo siguiente:
 *
 *   · el asesor retirado no veía nada (correcto),
 *   · y su GERENTE tampoco veía a los clientes que llevaba (no correcto),
 *   · ni podía reasignarlos, porque para reasignar hay que poder verlos.
 *
 * Esa gente no daba un error: dejaba de estar. Nadie los llama, nadie les
 * cobra, y el único sitio donde siguen existiendo es el computador de Joan —
 * que es justo el que su mano derecha no tiene delante. Con treinta clientes en
 * cobranza a nombre de alguien que se fue, eso es un mes de cartera en
 * silencio.
 *
 * Y había una segunda mitad: `asesor_retirar` **no tenía un solo llamador**.
 * Existía en la base desde el 11-sep y no había botón en ninguna pantalla.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922p_el_gerente_gestiona.sql')
  .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const funcion = nombre => {
  const i = CRM.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
};

describe('la cartera de quien se fue no se cae por un agujero', () => {

  test('un gerente alcanza a los suyos AUNQUE estén retirados', () => {
    assert.match(SQL, /where celular = p_celular or jefe = p_celular\), array\[\]::text\[\]\)/,
      'el alcance del gerente vuelve a filtrar por estado: la cartera del que se ' +
      'va desaparecería para todo el mundo, sin un error');
  });

  test('pero un retirado sigue sin ver nada', () => {
    /* Es la otra mitad. Si al abrirle la puerta al jefe se le abriera también
       al que se fue, esto sería peor que el defecto. */
    assert.match(SQL, /FALLO 4b GRAVE: un RETIRADO sigue viendo cartera/,
      'no se comprueba que el retirado quede fuera');
  });

  test('y el jefe ve marcado a quien se quedó sin asesor', () => {
    assert.match(SQL, /asesor_activo/, 'no se marca de quién hay que repartir');
    assert.match(SQL, /coalesce\(e2\.estado = ''activo'', false\)/,
      'sin el coalesce, un LEFT JOIN sin fila da null y la pantalla leería ' +
      '«no lo sé» donde tiene que leer «este no tiene asesor»');
    assert.match(SQL, /FALLO 5 GRAVE: la cartera de un retirado desaparecio para su jefe/);
  });
});

describe('no se retira a ciegas', () => {

  test('con gente asignada y sin destino, NO se retira y se dice cuánta', () => {
    assert.match(SQL, /'motivo', 'tiene_gente', 'cuantos', cuantos/,
      'se retira sin decir a dónde va la gente: ahí es donde nace el agujero');
    assert.match(SQL, /FALLO 1 GRAVE: se retiro a alguien con cartera sin decir a quien/);
  });

  test('el destino tiene que ser suyo y estar ACTIVO', () => {
    /* Pasarle la cartera a otro retirado sería mover el agujero de sitio. */
    assert.match(SQL, /'motivo', 'destino_no_sirve'/);
    assert.match(SQL, /where celular = destino and estado = 'activo'/);
  });

  test('y la asignación vieja NO se pisa', () => {
    /* La comisión de un cliente reasignado le sigue tocando a quien lo llevaba
       EN ESA FECHA. Pisar la fila se la daría al que no fue. */
    assert.match(SQL, /FALLO 3c: se piso la asignacion vieja/,
      'no se comprueba que el pasado se conserve: la comisión se le iría al que no fue');
    assert.match(SQL, /a\.persona_id, destino, current_date, now\(\)/,
      'no se escribe una fila nueva con la fecha de hoy');
  });
});

describe('y se puede deshacer', () => {

  test('hay reactivar, y solo sobre los suyos', () => {
    assert.match(SQL, /function public\.asesor_reactivar/);
    assert.match(SQL, /where celular = q and jefe = yo\.celular and estado = 'retirado'/,
      'se podría reactivar a alguien de otro gerente, o fabricarse uno por esta vía');
  });

  test('la de un solo argumento se BORRA, y antes de crear la nueva', () => {
    /* Dos razones distintas. En la base: conviviendo, PostgREST tendría dos
       funciones con el mismo nombre y la llamada sería ambigua. Y en las
       pruebas: el barrido de motor.test.js sigue los `drop` POR NOMBRE, así
       que con el drop después del create daba por muerta la función entera. */
    assert.match(SQL, /drop function if exists public\.asesor_retirar\(text\);/);
    assert.ok(SQL.indexOf('drop function if exists public.asesor_retirar(text);')
            < SQL.indexOf('create or replace function public.asesor_retirar(p_celular text, p_pasar_a'),
      'el drop va DESPUÉS del create: el barrido da la función por muerta');
  });

  test('el centinela no deja que vuelva', () => {
    assert.match(SQL, /volvio asesor_retirar de un solo argumento/);
  });
});

describe('y por fin hay botón: antes no lo llamaba nadie', () => {

  test('se puede retirar desde la ficha del asesor', () => {
    assert.match(CRM, /onclick="retirarAsesorEq\(/,
      'asesor_retirar sigue sin un solo llamador, como desde el 11-sep');
  });

  test('cuando lleva gente, la pantalla PREGUNTA a quién se la pasa', () => {
    const f = funcion('retirarAsesorEq');
    assert.match(f, /j\.motivo === 'tiene_gente'/, 'no se reacciona al motivo del servidor');
    assert.match(funcion('preguntarDestinoEq'), /reDestino/, 'no hay dónde elegir el destino');
  });

  test('y si no hay a quién pasársela, lo dice en vez de dejarlo a medias', () => {
    const f = funcion('preguntarDestinoEq');
    assert.match(f, /No hay a quién pasarle la gente/,
      'con un solo asesor, el gerente se quedaría mirando una lista vacía');
    assert.match(f, /esa gente se queda sin quién la trabaje/,
      'no se dice la consecuencia, que es lo único que le deja decidir');
  });

  test('la lista de retirados existe y se puede reactivar', () => {
    assert.match(CRM, /CARTERA_EQUIPO\.retirados/, 'el gerente no ve a quién retiró');
    assert.match(CRM, /onclick="reactivarAsesorEq\(/);
  });

  test('y se avisa de que la base NO vuelve sola', () => {
    /* Reactivar devuelve el puesto, no la cartera: esa se reasignó al retirarlo.
       Callarlo dejaría al gerente esperando gente que no va a llegar. */
    assert.match(funcion('reactivarAsesorEq'), /Su base no volvió sola/);
  });

  test('con la migración sin correr, se dice cuál falta — no se culpa al internet', () => {
    assert.match(funcion('retirarAsesorEq'), /20260922p_el_gerente_gestiona\.sql/,
      'un 404 saldría como «la nube contestó que no» y se perdería la tarde');
  });

  test('en la lista, el que se quedó sin asesor sale marcado', () => {
    assert.match(CRM, /p\.asesor_activo === false \? ' <span class="chip mora">se fue/,
      'la cartera del que se fue se mezcla con la demás y no hay forma de saber cuál repartir');
  });
});
