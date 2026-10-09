/* ============================================================================
 * «REGISTRÁNDOSE AHORA», CONTRA UN POSTGRESQL DE VERDAD — opcional.
 * 8 de octubre de 2026 (segunda vuelta).
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/registro-vivo-joan-postgres.test.js
 *
 * Sin TG_PG_BIN se salta, como las otras de PostgreSQL (de donde toma el mismo
 * andamio de Supabase). Con él: corre las migraciones de base/ en orden y
 * después base/20261008c_registro_vivo_joan.sql DOS veces (idempotente), y
 * prueba LLAMANDO lo que el CRM de Joan va a llamar:
 *
 *   · con la clave del CRM ve a quien se está registrando, en qué paso, y
 *     NADA de fotos (aunque la fila las tenga, de una versión vieja de play/);
 *   · lo que no está en la lista blanca de play/ no sale, aunque esté en la fila;
 *   · lo vencido (más de dos horas) no sale;
 *   · con otra clave, falla; una sesión de cliente (authenticated) no la llama.
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
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = "'clave-de-prueba-larga-123'";

describe('registro_vivo_joan en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = q => JSON.parse(sql(q));

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-vivo-'));
    puerto = 54980 + Math.floor(Math.random() * 15);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    /* Dos veces: idempotente. */
    archivo(path.join(RAIZ, 'base', '20261008c_registro_vivo_joan.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261008c_registro_vivo_joan.sql'), true);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la autocomprobación del archivo dice «Listo» y no FALLA', () => {
    const r = spawnSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg',
      '-v', 'ON_ERROR_STOP=1', '-1', '-f', path.join(RAIZ, 'base', '20261008c_registro_vivo_joan.sql')], { encoding: 'utf8' });
    const notas = String(r.stderr || '');
    assert.doesNotMatch(notas, /FALLA|OJO/, notas);
    assert.match(notas, /Listo: «Registrándose ahora»/, notas);
    assert.equal(r.status, 0, notas);
  });

  test('con la clave: quién, en qué paso, la lista blanca, y NADA de fotos ni de lo vencido', () => {
    sql("delete from public.registro_en_vivo;" +
        "insert into public.registro_en_vivo (celular, paso, de_pasos, nombre, avance, fotos, actualizado, vence_en) values " +
        "('3001112233', 4, 9, 'Ana Prueba', '{\"nombres\":\"Ana\",\"documento\":\"123\",\"direccion\":\"no sale\"}'::jsonb," +
        " '{\"cedula_frente\":\"data:image/jpeg;base64,AAA\"}'::jsonb, now(), now() + interval '2 hours')," +
        "('3009998877', 2, 9, 'Vencido', '{}'::jsonb, '{}'::jsonb, now() - interval '3 hours', now() - interval '1 hour');");
    const j = json('select public.registro_vivo_joan(' + CLAVE + ')');
    assert.equal(j.ok, true);
    assert.equal(j.gente.length, 1, 'salió lo vencido: ' + JSON.stringify(j.gente));
    const g = j.gente[0];
    assert.equal(g.celular, '3001112233'); assert.equal(g.paso, 4); assert.equal(g.nombre, 'Ana Prueba');
    assert.equal(g.avance.nombres, 'Ana');
    assert.ok(!('direccion' in g.avance), 'salió un campo que no está en la lista blanca de play/');
    assert.ok(!('fotos' in g) && JSON.stringify(j).indexOf('data:image') < 0, 'salieron fotos');
  });

  test('con otra clave falla, y una sesión de cliente no la puede llamar', () => {
    let err = '';
    try { sql("select public.registro_vivo_joan('una-que-no-es')"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /clave/i);
    assert.equal(sql("select has_function_privilege('authenticated', 'public.registro_vivo_joan(text)', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('anon', 'public.registro_vivo_joan(text)', 'execute')"), 't');
  });
});
