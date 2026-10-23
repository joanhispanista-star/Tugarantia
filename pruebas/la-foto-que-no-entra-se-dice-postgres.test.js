/* ============================================================================
 * LA FOTO QUE NO ENTRA SE DICE, EN LA BASE — 22 de octubre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/la-foto-que-no-entra-se-dice-postgres.test.js
 *
 * base/20261022_la_foto_que_no_entra_se_dice.sql, en un PostgreSQL con todas
 * las migraciones de base/ en orden (el andamio de Supabase de las otras
 * pruebas de PostgreSQL), corrido DOS veces, y llamando lo que la app llama:
 *
 *   · B1: una selfie que no es imagen o pasa de 600.000 caracteres ya no se
 *     salta en silencio: vuelve en `rechazadas` con su motivo, queda en la
 *     huella (sin la imagen) y lo demás de la llamada entra igual;
 *   · B2: «siguió sin la foto de su cara» queda en la huella con su motivo y
 *     la hora del servidor; un motivo inventado no; y cuando la selfie entra,
 *     la marca se va;
 *   · lo de antes no cambia: la autorización de datos sensibles, la reja de
 *     la cédula y la respuesta de siempre.
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre). Con la
 * base de ab6b595 (sin el archivo) todas fallan.
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
const NOMBRE = '20261022_la_foto_que_no_entra_se_dice.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const CEL = '3001112233';

describe('el archivo de la migración', () => {
  test('no copia la función: la lee viva y la parcha con su huella, y para si no casa', () => {
    assert.equal(/create\s+or\s+replace\s+function/i.test(SQL), false, 'copia el cuerpo de una función');
    assert.match(SQL, /pg_get_functiondef\(f\)/);
    assert.match(SQL, /huella constant text := '63fe473024fc1ac8f2d358677adcc176'/);
    assert.match(SQL, /md5\(replace\(cuerpo, chr\(13\), ''\)\) <> huella/);
    assert.match(SQL, /position\('fotos_rechazadas' in cuerpo\) > 0/, 'no es idempotente');
    /* Y no escribe la firma como texto (la vigila la-cedula-de-la-cuenta-postgres). */
    assert.equal(/function public\.registro_archivos_guardar\s*\(/.test(SQL), false);
    /* Termina en un SELECT que Joan ve (el editor no muestra los NOTICE). */
    assert.match(SQL.replace(/--[^\n]*/g, ''), /select '[^']+' as comprobacion,[\s\S]*\) as ok from f/);
  });
});

describe('la foto que no entra, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0, huellaAntes = '';
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  /* Como la app: con la sesión de una cuenta que AUTORIZÓ los datos sensibles. */
  const subir = (archivos, huella) => JSON.parse(sql(
    "insert into auth.users (id, email, raw_user_meta_data) select md5('57" + CEL + "')::uuid, '57" + CEL + "@tugarantia.net'," +
    " '{\"autorizacion\":{\"general\":true,\"sensibles\":true}}'::jsonb where not exists (select 1 from auth.users where id = md5('57" + CEL + "')::uuid);" +
    " select set_config('request.jwt.claims', '{\"sub\":\"' || md5('57" + CEL + "')::uuid || '\",\"email\":\"57" + CEL + "@tugarantia.net\"}', false);" +
    ' select public.registro_archivos_guardar(' + jb(archivos) + ', ' + jb(huella || {}) + ')::text').split('\n').pop());
  const huella = () => JSON.parse(sql("select coalesce(huella, '{}'::jsonb)::text from public.registros where telefono = '" + CEL + "' order by id desc limit 1"));
  const tipos = () => sql("select coalesce(string_agg(tipo, ',' order by tipo), '') from public.registro_archivos where celular = '" + CEL + "'");
  const FOTO = s => 'data:image/jpeg;base64,' + s;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-rechazadas-'));
    puerto = 57200 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost -c shared_buffers=32MB',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && f !== NOMBRE).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    huellaAntes = sql("select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure");
    /* El archivo nuevo, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      if (i === 2) assert.match(r.stderr, /ya dice qué foto no entró: no se cambió nada/, r.stderr);
      /* La tabla de Joan: todas sus filas en true. */
      const filas = r.stdout.trim().split(/\r?\n/).filter(l => /\|[tf]$/.test(l));
      assert.equal(filas.length, 6, 'la comprobación final no salió entera: ' + r.stdout);
      filas.forEach(l => assert.match(l, /\|t$/, 'una comprobación salió en false: ' + l));
    });
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos) values ('', '52123456', 'Prueba', '" + CEL + "', " + jb({ documento: '52123456' }) + ')');
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la huella del archivo es la del cuerpo que dejaron las migraciones de antes', () => {
    assert.equal(huellaAntes, '63fe473024fc1ac8f2d358677adcc176',
      'registro_archivos_guardar cambió en otra migración: el archivo pararía en producción');
  });

  test('B1 — la selfie que pasa de 600.000 caracteres ya no se pierde en silencio', () => {
    const r = subir({ cedula_frente: FOTO('FRENTE'), selfie: FOTO('S'.repeat(600001)) }, { gps: { lat: 4.6, lng: -74.1 } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.guardados, ['cedula_frente'], 'la cédula de la misma llamada no entró');
    assert.deepEqual(r.rechazadas, [{ tipo: 'selfie', motivo: 'muy_grande' }], 'la base no dijo qué selfie se saltó ni por qué');
    assert.equal(tipos(), 'cedula_frente');
    const h = huella();
    assert.deepEqual(h.fotos_rechazadas.fotos, [{ tipo: 'selfie', motivo: 'muy_grande' }], 'la huella no guarda que la selfie no entró');
    assert.ok(h.fotos_rechazadas.momento);
    assert.equal(/SSSS|base64/.test(JSON.stringify(h)), false, 'la huella guardó la imagen que no entró');
    assert.ok(h.gps, 'el GPS de la misma llamada no entró');
  });

  test('B1 — lo que no es una imagen dice «no_es_imagen»', () => {
    const r = subir({ selfie: 'javascript:alert(1)' });
    assert.deepEqual(r.rechazadas, [{ tipo: 'selfie', motivo: 'no_es_imagen' }]);
    assert.deepEqual(r.guardados, []);
  });

  test('una llamada normal: todo entra, `rechazadas` vacía, y la lista vieja de rechazadas se va', () => {
    const r = subir({ cedula_reverso: FOTO('RESPALDO'), selfie: FOTO('CARA') });
    assert.deepEqual(r.rechazadas, []);
    assert.deepEqual(r.guardados.sort(), ['cedula_reverso', 'selfie']);
    assert.equal(huella().fotos_rechazadas, undefined, 'la huella sigue diciendo que la selfie no entró, y ya entró');
  });

  test('B2 — «siguió sin la foto de su cara» queda en la huella con su motivo y la hora del servidor', () => {
    sql("delete from public.registro_archivos where celular = '" + CEL + "' and tipo = 'selfie'");
    sql("update public.registros set huella = null where telefono = '" + CEL + "'");
    subir({ cedula_frente: FOTO('FRENTE2') }, { selfie_omitida: { motivo: 'repitio_y_siguio', momento: '2001-01-01', foto: 'x' } });
    const h = huella();
    assert.equal(h.selfie_omitida.motivo, 'repitio_y_siguio');
    assert.notEqual(h.selfie_omitida.momento, '2001-01-01', 'la hora la puso el teléfono');
    assert.deepEqual(Object.keys(h.selfie_omitida).sort(), ['momento', 'motivo'], 'la marca guardó algo más que el motivo y la hora');
  });

  test('B2 — un motivo inventado no entra, ni la marca de una llamada que sí trae la selfie', () => {
    sql("update public.registros set huella = null where telefono = '" + CEL + "'");
    subir({ cedula_frente: FOTO('FRENTE3') }, { selfie_omitida: { motivo: '<script>' } });
    assert.equal(huella().selfie_omitida, undefined);
    subir({ selfie: FOTO('CARA2') }, { selfie_omitida: { motivo: 'siguio_sin_ella' } });
    assert.equal(huella().selfie_omitida, undefined, 'anotó que siguió sin la selfie en la misma llamada que la trae');
  });

  test('B2 — cuando la selfie por fin entra, la marca vieja se va', () => {
    sql("delete from public.registro_archivos where celular = '" + CEL + "' and tipo = 'selfie'");
    sql("update public.registros set huella = null where telefono = '" + CEL + "'");
    subir({ cedula_frente: FOTO('FRENTE4') }, { selfie_omitida: { motivo: 'siguio_sin_ella' } });
    assert.equal(huella().selfie_omitida.motivo, 'siguio_sin_ella');
    subir({ selfie: FOTO('CARA3') });
    assert.equal(huella().selfie_omitida, undefined, 'la ficha seguiría diciendo «siguió sin la foto» con la foto en la nube');
  });

  test('lo de antes sigue: sin la autorización de datos sensibles no entra nada, y no anota nada', () => {
    const otro = '3001119999';
    const r = JSON.parse(sql(
      "insert into auth.users (id, email, raw_user_meta_data) values (md5('x" + otro + "')::uuid, '57" + otro + "@tugarantia.net', '{\"autorizacion\":{\"sensibles\":false}}');" +
      " select set_config('request.jwt.claims', '{\"sub\":\"' || md5('x" + otro + "')::uuid || '\",\"email\":\"57" + otro + "@tugarantia.net\"}', false);" +
      " select public.registro_archivos_guardar('{\"selfie\":\"data:image/jpeg;base64," + 'S'.repeat(10) + "\"}'::jsonb, '{}'::jsonb)::text").split('\n').pop());
    assert.equal(r.motivo, 'sin_autorizacion');
    assert.equal(sql("select count(*) from public.registro_archivos where celular = '" + otro + "'"), '0');
  });
});
