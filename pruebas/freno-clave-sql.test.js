/* ============================================================================
 * EL ACIERTO NO REPONE EL FRENO — base/20261002d_el_acierto_no_repone_el_freno.sql
 * 2 de octubre de 2026 (noche).
 *
 *   node --test pruebas/freno-clave-sql.test.js
 *
 * La revisión de seguridad de «🔎 Revisar a todos» encontró que cada acierto de
 * la clave de sincronización vuelve a cero el freno GLOBAL de clave_ok, y que
 * la página nueva acierta ~400 veces seguidas con 200 registrados: ~4.000
 * intentos de regalo para quien esté probando claves. La migración no se
 * ejecuta acá (la pega Joan); lo que se cuida es el TEXTO:
 *
 *   · que la expresión que busca la línea del «a cero» la ENCUENTRE en la
 *     clave_ok de base/supabase.sql (si no, la migración pararía sin hacer
 *     nada, que es mejor que nada, pero el hueco seguiría);
 *   · que no copie el cuerpo de la función (lección de la casa);
 *   · que se pueda correr dos veces, y que compruebe llamando, no mirando;
 *   · y, con un modelo de la cuenta, que el arreglo de verdad recorte los
 *     intentos de regalo.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261002d_el_acierto_no_repone_el_freno.sql';
const CRUDO = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const CODIGO = CRUDO.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const BASE = fs.readFileSync(path.join(RAIZ, 'base', 'supabase.sql'), 'utf8');

/* La clave_ok de base/supabase.sql, como la devolvería pg_get_functiondef
   (el cuerpo entre los $$). */
function claveOkDeLaBase() {
  const i = BASE.indexOf('create or replace function public.clave_ok(p_clave text)');
  assert.ok(i >= 0, 'base/supabase.sql ya no define clave_ok');
  const ini = BASE.indexOf('$$', i), fin = BASE.indexOf('$$', ini + 2);
  return BASE.slice(i, fin + 2);
}
const PATRON = (/\$p\$([\s\S]*?)\$p\$/.exec(CRUDO) || [])[1];
const REEMPLAZO = (/\$r\$([\s\S]*?)\$r\$/.exec(CRUDO) || [])[1];

describe('la migración encuentra la línea, y solo esa', () => {

  test('la expresión casa UNA vez en la clave_ok de la base: la del «a cero»', () => {
    assert.ok(PATRON, 'no hay expresión entre $p$');
    const re = new RegExp(PATRON, 'g');
    const f = claveOkDeLaBase();
    const casos = f.match(re) || [];
    assert.equal(casos.length, 1, 'la expresión no encuentra la línea (o encuentra más de una)');
    assert.match(casos[0], /setval\('public\.freno_clave', casillero \* 1000000000\);/);
    /* El reencuadre de un cuarto de hora nuevo (setval a «marca») no se toca. */
    assert.ok(!/marca/.test(casos[0]));
  });

  test('el reemplazo deja el freno, el tope y la clave como estaban', () => {
    const f = claveOkDeLaBase();
    const nueva = f.replace(new RegExp(PATRON), () => REEMPLAZO);
    assert.notEqual(nueva, f);
    ["nextval('public.freno_clave')", 'intentos > 10', 'config_privada', "perform setval('public.freno_clave', marca);", 'return true;']
      .forEach(k => assert.ok(nueva.includes(k), 'se perdió: ' + k));
    assert.match(nueva, /freno_clave_perdon\) >= 45 then/);
    assert.match(nueva, /greatest\(casillero \* 1000000000, \(select last_value from public\.freno_clave\) - 1\)/);
    /* El reemplazo no puede llevar barras ni dólares: regexp_replace los lee
       como referencias, y $ cerraría la cadena. */
    assert.ok(!/[\\$]/.test(REEMPLAZO));
  });

  test('no copia el cuerpo: lo lee vivo y para si no cambió nada', () => {
    assert.ok(!/create or replace function public\.clave_ok/i.test(CODIGO), 'copió la función');
    assert.ok(!/select valor into esperado/.test(CODIGO));
    assert.match(CODIGO, /pg_get_functiondef\(p\.oid\)/);
    assert.match(CODIGO, /if nueva = src then\s+raise exception/);
    assert.match(CODIGO, /execute nueva;/);
  });

  test('se puede correr dos veces, y la secuencia nueva no queda a la vista', () => {
    assert.match(CODIGO, /create sequence if not exists public\.freno_clave_perdon;/);
    assert.match(CODIGO, /revoke all on sequence public\.freno_clave_perdon from anon, authenticated, public;/);
    assert.match(CODIGO, /if src ~ 'freno_clave_perdon' then[\s\S]*?return;/);
  });

  test('comprueba LLAMANDO a la función (se compila en la primera llamada) y termina normal', () => {
    assert.match(CODIGO, /public\.clave_ok\(''\) is distinct from false/);
    assert.ok(!/raise exception\s+'TODO BIEN/i.test(CODIGO), 'terminar con una excepción revierte el archivo entero');
    assert.match(CODIGO, /raise notice 'Listo:/);
  });
});

describe('la cuenta: cuántos intentos de regalo deja una pasada de la revisión', () => {
  /* Un modelo de clave_ok, antes y después. El atacante, el peor caso: entre
     un acierto de Joan y el siguiente deja el contador en 9 (si lo llenara,
     Joan tampoco entraría y se notaría). Se cuentan los intentos del atacante
     que la base llega a COMPARAR con la clave. */
  function regalados(arreglada, aciertos, cadaSegundos) {
    let contador = 0, comparados = 0, ultimoPerdon = -Infinity;
    for (let k = 0; k < aciertos; k++) {
      const t = k * cadaSegundos;
      while (contador < 9) { contador++; comparados++; }
      contador++;                                    // el acierto anota su intento al entrar
      if (!arreglada || t - ultimoPerdon >= 45) { contador = 0; ultimoPerdon = t; }
      else contador -= 1;                            // y solo descuenta el suyo
    }
    return comparados;
  }

  test('400 aciertos seguidos (200 registrados): antes, 3.600 intentos; ahora, los de 45 segundos', () => {
    assert.equal(regalados(false, 400, 0.3), 3600);
    assert.ok(regalados(true, 400, 0.3) <= 9 * 4, 'el arreglo sigue regalando: ' + regalados(true, 400, 0.3));
  });

  test('al ritmo del CRM (cada 45 s) da lo mismo que antes: lo que la casa ya aceptó', () => {
    assert.equal(regalados(true, 20, 45), regalados(false, 20, 45));
  });
});
