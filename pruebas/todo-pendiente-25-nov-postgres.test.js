/* ============================================================================
 * EL ARCHIVO ÚNICO CON LOS CUATRO SQL PENDIENTES — 25 de noviembre de 2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/todo-pendiente-25-nov-postgres.test.js
 *
 * base/TODO-PENDIENTE-25-NOV.sql junta, en orden, los cuatro SQL que Joan tiene
 * por correr (extractos, plataformas, solicitudes en el celular y el chat con su
 * sesión), para que sea UN pegado y UN Run, como el del 9 de septiembre.
 *
 * Un archivo armado a mano que se aparte de sus partes es peor que cuatro
 * pegados: por eso aquí se comprueba que cada parte va TAL CUAL, y —con
 * TG_PG_BIN— que el archivo entero corre limpio, dos veces, en una base que
 * tiene todo lo demás, y que su tabla final dice «bien» en todo.
 * Sin TG_PG_BIN la parte de PostgreSQL se salta; la que lee el archivo corre siempre.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const NOMBRE = 'TODO-PENDIENTE-25-NOV.sql';
const PARTES = ['20261113c_los_extractos.sql', '20261124_plataformas_del_extracto.sql',
  '20261125_solicitudes_en_el_celular.sql', '20261125b_el_chat_con_tu_sesion.sql'];
const leer = f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/\r\n/g, '\n');
const TODO = leer(NOMBRE);
const DUENO = '11111111-1111-4111-8111-111111111111';

describe('el archivo único', () => {
  test('trae las cuatro partes TAL CUAL, en el orden en que se corren, y nada más que cabeceras y el resumen', () => {
    let desde = 0, resto = TODO;
    PARTES.forEach((f, i) => {
      const cuerpo = leer(f).replace(/\n+$/, '');
      const en = TODO.indexOf(cuerpo, desde);
      assert.ok(en >= 0, f + ' no va tal cual en el archivo único (o va antes que la anterior): alguien cambió una de las dos copias');
      assert.equal(TODO.indexOf(cuerpo, en + 1), -1, f + ' va dos veces');
      assert.match(TODO.slice(desde, en), new RegExp('-- PARTE ' + (i + 1) + ' DE 4: ' + f.replace(/\./g, '\\.')), 'la parte ' + (i + 1) + ' no dice de qué archivo sale');
      desde = en + cuerpo.length;
      resto = resto.replace(cuerpo, '');
    });
    /* Lo que queda fuera de las partes: solo comentarios y UN select, el del resumen. */
    const sinComentarios = resto.replace(/--[^\n]*/g, '').trim();
    assert.match(sinComentarios, /^select 1 as "parte"/, 'hay SQL suelto fuera de las cuatro partes');
    assert.equal((sinComentarios.match(/;/g) || []).length, 1, 'fuera de las partes hay más de una sentencia');
    assert.equal(/\b(create|alter|drop|insert|update|delete|grant|revoke)\b/i.test(sinComentarios), false, 'el resumen cambia algo');
  });

  test('son todos los SQL de base/ desde el de los extractos: no se quedó ninguno por fuera', () => {
    const base = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort();
    assert.deepEqual(base.slice(base.indexOf(PARTES[0])), PARTES,
      'hay un SQL más nuevo en base/ que no está en el archivo único (o cambió el orden)');
  });

  test('dice cómo se corre, y no se confunde con una migración (las pruebas con PostgreSQL no lo cargan dos veces)', () => {
    assert.match(TODO, /Supabase → SQL Editor → New query → pegar TODO ESTO → Run/);
    assert.match(TODO, /Settings → API → Reload schema/);
    assert.match(TODO, /todas las filas deben decir «bien»/);
    assert.equal(/^\d{8}.*\.sql$/.test(NOMBRE), false);
  });
});

describe('el archivo único en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const entorno = Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' });
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: entorno }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: entorno });
  const FUNCIONES = ['public.extracto_mia()', 'public.extracto_plataformas_mias()', 'public.panel_solicitudes(integer)', 'public.panel_chat_conversaciones()'];
  const hay = f => sql("select to_regprocedure('" + f + "') is not null");
  /* La tabla del resumen: las últimas filas «parte|comprobación|resultado». */
  const resumen = r => r.stdout.trim().split(/\r?\n/).filter(l => /^[1-5]\|.*\|(bien|FALLA|no corrió)$/.test(l));

  before(() => {
    const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-todo-'));
    puerto = 57280 + Math.floor(Math.random() * 300);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost -c shared_buffers=32MB',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    /* Todo lo de base/ MENOS las cuatro partes: así está la base de Joan hoy. */
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && PARTES.indexOf(f) < 0).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    sql("insert into auth.users (id, email) values ('" + DUENO + "', 'duena@prueba.test');" +
        "insert into public.panel_duenos (uid, nota) values ('" + DUENO + "', 'de prueba');");
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('precondición: la base de la prueba está como la de Joan hoy (sin ninguna de las cuatro)', () => {
    FUNCIONES.forEach(f => assert.equal(hay(f), 'f', f + ' ya existía: la prueba no probaría nada'));
  });

  test('UN pegado y UN Run: corre limpio, deja las cuatro partes y su tabla final dice «bien» en todo', () => {
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    assert.equal(r.status, 0, 'el archivo único no corrió limpio: ' + String(r.stderr).split('\n').filter(l => /ERROR|FALLA/.test(l)).slice(0, 4).join(' | '));
    assert.doesNotMatch(r.stderr, /FALLA/, r.stderr);
    FUNCIONES.forEach(f => assert.equal(hay(f), 't', 'no quedó ' + f));
    const filas = resumen(r);
    assert.ok(filas.length >= 14, 'la tabla final no salió entera: ' + r.stdout.split('\n').slice(-20).join(' / '));
    filas.forEach(l => assert.match(l, /\|bien$/, 'una comprobación no salió bien: ' + l));
    [1, 2, 3, 4, 5].forEach(p => assert.ok(filas.some(l => l.startsWith(p + '|')), 'el resumen no trae la parte ' + p));
  });

  test('y otra vez encima: es idempotente', () => {
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    assert.equal(r.status, 0, String(r.stderr).split('\n').filter(l => /ERROR|FALLA/.test(l)).slice(0, 4).join(' | '));
    resumen(r).forEach(l => assert.match(l, /\|bien$/, l));
  });

  test('si una parte falla, no queda NADA a medias: ni las que iban antes', () => {
    /* Otra base igual, pero donde al chat le falta una función: la parte 4 se para en su paso 0. */
    sql('drop database if exists tg2', 'postgres');
    sql('create database tg2 template tg', 'postgres');
    const en2 = consulta => { const f = path.join(dir, 'q' + (++n) + '.sql'); fs.writeFileSync(f, consulta, 'utf8');
      return execFileSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg2', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: entorno }).trim(); };
    en2(['extracto_mia()', 'extracto_plataformas_mias()', 'panel_solicitudes(integer)'].map(f => 'drop function if exists public.' + f + ' cascade;').join('') +
        "do $$ declare r record; begin for r in select p.oid::regprocedure as f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^panel_(chat|equipo_chat|equipo_foto)_' loop execute 'drop function ' || r.f; end loop; end $$;" +
        'drop function public.equipo_foto_responder(text,text,text,text,text);');
    const r = spawnSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg2', '-At', '-v', 'ON_ERROR_STOP=1', '-1', '-f', path.join(RAIZ, 'base', NOMBRE)],
      { encoding: 'utf8', env: entorno });
    assert.notEqual(r.status, 0, 'corrió «limpio» con una función del chat faltando');
    assert.match(r.stderr, /A tu base le faltan funciones del chat[\s\S]*equipo_foto_responder/);
    assert.equal(en2("select to_regprocedure('public.panel_solicitudes(integer)') is not null"), 'f', 'la parte 3 quedó aplicada aunque el archivo falló: quedó a medias');
    assert.equal(en2("select to_regprocedure('public.extracto_mia()') is not null"), 'f', 'la parte 1 quedó aplicada aunque el archivo falló');
  });
});
