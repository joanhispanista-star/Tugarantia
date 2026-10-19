/* ============================================================================
 * base/20261019_aparato_del_telefono.sql, LEÍDO — 19 de octubre de 2026
 *
 *   node --test pruebas/aparato-sql.test.js
 *
 * Siempre corre (no necesita PostgreSQL). Lo que esta casa ya pagó caro una
 * vez no puede estar en el archivo: una tabla sin RLS, un permiso que Supabase
 * regala a anon y authenticated, una función stable que escribe, una
 * excepción al final que deshace todo, o reescribir una función viva copiando
 * su cuerpo. Lo que hace de verdad lo prueba pruebas/aparato-postgres.test.js.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261019_aparato_del_telefono.sql';
const CRUDO = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
/* Lo que se EJECUTA: sin comentarios (un centinela que lee prosa se caza a sí mismo). */
const CODIGO = CRUDO.split(/\r?\n/).map(l => l.replace(/--.*$/, '')).join('\n');
const cabeza = fn => {
  const i = CODIGO.indexOf('create or replace function public.' + fn + '(');
  assert.ok(i >= 0, 'no está ' + fn);
  return CODIGO.slice(i, CODIGO.indexOf('as $$', i));
};
const cuerpo = fn => {
  const i = CODIGO.indexOf('as $$', CODIGO.indexOf('create or replace function public.' + fn + '('));
  return CODIGO.slice(i, CODIGO.indexOf('$$;', i + 5));
};

describe('la migración del teléfono, leída', () => {

  test('dos funciones nuevas y una tabla nueva; ninguna función viva se reescribe', () => {
    const creadas = [...CODIGO.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
    assert.deepEqual(creadas, ['aparato_anotar', 'aparatos_de']);
    assert.match(CODIGO, /create table if not exists public\.aparatos_vistos/);
    assert.ok(!/registro_archivos_guardar|aceptar_condiciones|celular_de_sesion\s*\(\)\s*returns/.test(
      CODIGO.replace(/public\.celular_de_sesion\(\)/g, '')), 'toca una función viva');
    assert.ok(!/\bdrop\s+(function|table|view|column)/i.test(CODIGO));
    /* Ninguna otra migración las declara: sería una sobrecarga. */
    const otras = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /\.sql$/.test(f) && f !== NOMBRE)
      .map(f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8')).join('\n');
    assert.ok(!/function public\.(aparato_anotar|aparatos_de)\b/.test(otras));
    assert.ok(!/table if not exists public\.aparatos_vistos/.test(otras));
  });

  test('la tabla: RLS encendido, nada para nadie, y solo cuándos que existen', () => {
    assert.match(CODIGO, /alter table public\.aparatos_vistos enable row level security;/);
    assert.match(CODIGO, /revoke all on table public\.aparatos_vistos from public, anon, authenticated;/);
    assert.ok(!/create policy/i.test(CODIGO), 'una política abriría la tabla');
    assert.ok(!/grant[^;]*on table public\.aparatos_vistos/i.test(CODIGO));
    assert.match(CODIGO, /check \(cuando in \('registro', 'solicitud', 'aceptacion'\)\)/);
  });

  test('las dos: security definer, search_path fijo, y volátiles (escriben)', () => {
    ['aparato_anotar', 'aparatos_de'].forEach(fn => {
      const c = cabeza(fn);
      assert.match(c, /security definer/, fn);
      assert.match(c, /set search_path = public/, fn);
      assert.match(c, /\bvolatile\b/, fn);
      assert.ok(!/\b(stable|immutable)\b/.test(c), fn + ' stable: PostgREST la correría en solo lectura');
    });
  });

  test('anotar: la sesión primero, el cuándo cerrado, tope por celular y cada campo validado', () => {
    const c = cuerpo('aparato_anotar');
    assert.ok(c.indexOf('public.celular_de_sesion()') < c.indexOf('insert into public.aparatos_vistos'));
    assert.match(c, /perform pg_sleep\(0\.3\)/);
    assert.match(c, /p_cuando not in \('registro', 'solicitud', 'aceptacion'\)/);
    assert.match(c, /pg_advisory_xact_lock/);
    assert.match(c, /momento > now\(\) - interval '1 day'/);
    assert.match(c, /if v_n >= 20 then/);
    assert.match(c, /length\(d::text\) > 2000/);
    /* Lo que viaja a la tabla es v_dec (lo validado), nunca p_declarado. */
    const ins = c.slice(c.indexOf('insert into public.aparatos_vistos'), c.indexOf(';', c.indexOf('insert into public.aparatos_vistos')));
    assert.match(ins, /v_dec\)/);
    assert.ok(!/p_declarado/.test(ins) && !/\bd\)/.test(ins), 'guarda lo declarado sin validar');
    ['plataforma', 'sistema_version', 'modelo', 'navegador', 'navegador_version', 'via', 'sin_modelo', 'fuente_modelo']
      .forEach(k => assert.match(c, new RegExp("jsonb_typeof\\(d -> '" + k + "'\\) = 'string'"), k + ' no exige texto'));
    /* El registro: solo con 'registro', con su propia red, y diciendo si quedó. */
    assert.match(c, /if p_cuando = 'registro' then\s+begin/);
    assert.match(c, /'aparato_telefono', v_dec \|\| jsonb_build_object\('momento', now\(\)\)/);
    assert.match(c, /coalesce\(r\.huella, '\{\}'::jsonb\)\s*\|\| jsonb_build_object/, 'pisaría el resto de la huella');
    assert.match(c, /'en_registro', v_en_reg/);
  });

  test('leer: la clave primero, con la espera de siempre', () => {
    const c = cuerpo('aparatos_de');
    assert.ok(c.indexOf('public.clave_ok(p_clave)') < c.indexOf('from public.aparatos_vistos'));
    assert.match(c, /perform pg_sleep\(1\);\s+raise exception 'clave de sincronizacion incorrecta'/);
    assert.match(c, /from public\.condiciones_aceptadas c/);
    assert.match(c, /limit 60/);
  });

  test('los permisos: se revoca de los tres por nombre; anotar solo con sesión, leer solo con la llave del CRM', () => {
    const esc = s => s.replace(/[().]/g, '\\$&');
    const A = 'public.aparato_anotar(text, jsonb)', L = 'public.aparatos_de(text, text)';
    assert.match(CODIGO, new RegExp('revoke all on function ' + esc(A) + ' from public, anon, authenticated;'));
    assert.match(CODIGO, new RegExp('grant\\s+execute on function ' + esc(A) + ' to authenticated;'));
    assert.match(CODIGO, new RegExp('revoke all on function ' + esc(L) + ' from public, anon, authenticated;'));
    assert.match(CODIGO, new RegExp('grant\\s+execute on function ' + esc(L) + ' to anon;'));
    assert.ok(!new RegExp('on function ' + esc(A) + ' to anon').test(CODIGO), 'la llave pública sola podría anotar');
    assert.ok(!new RegExp('on function ' + esc(L) + ' to authenticated').test(CODIGO), 'un cliente podría leer los aparatos de otro');
    /* Y la llave de servicio, tampoco. */
    assert.match(CODIGO, /revoke all on function public\.aparato_anotar\(text, jsonb\) from service_role/);
    assert.match(CODIGO, /revoke all on table public\.aparatos_vistos from service_role/);
  });

  test('después de la sección 0, ninguna excepción: el editor desharía todo', () => {
    const i = CODIGO.indexOf('alter table public.registros add column if not exists huella jsonb;');
    assert.ok(i > 0);
    const resto = CODIGO.slice(i).replace(/raise exception 'clave de sincronizacion incorrecta'/, '');
    assert.ok(!/raise\s+exception/i.test(resto), 'una excepción fuera de la sección 0 deshace la migración entera');
    const final = CODIGO.slice(CODIGO.lastIndexOf('do $prueba$'));
    assert.match(final, /raise notice 'FALLA/);
    assert.match(final, /Aparato: listo/);
    /* La prueba de adentro no crea registros: la tabla puede tener avisos enganchados. */
    assert.ok(!/insert into public\.registros/i.test(final));
    assert.match(final, /delete from public\.aparatos_vistos where celular = v_cel;/);
  });

  test('la app y el CRM la llaman con los mismos nombres de parámetro', () => {
    const play = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    const socio = fs.readFileSync(path.join(RAIZ, 'app', 'socio.html'), 'utf8');
    const crm = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    assert.match(play, /\/rest\/v1\/rpc\/aparato_anotar'[\s\S]{0,400}JSON\.stringify\(\{ p_cuando: cuando, p_declarado: declarado \}\)/);
    assert.match(socio, /'aparato_anotar', \{ p_cuando: cuando, p_declarado: declarado \}/);
    assert.match(crm, /rpc\('aparatos_de',\{p_clave:sbCfg\(\)\.clave,p_celular:String\(cel\|\|''\)\}\)/);
  });
});
