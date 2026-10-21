/* ============================================================================
 * SIN AUTORIZACIÓN DE DATOS SENSIBLES, NADA SENSIBLE ENTRA — 21-oct-2026 (H4)
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/la-autorizacion-antes-de-lo-sensible-postgres.test.js
 *
 * La verificación de f1bcfde lo confirmó en una réplica: registro_archivos_
 * guardar, con la sesión de Ana, guardaba su selfie, las fotos de su cédula,
 * su GPS y la lectura del código aunque la única constancia de su cuenta
 * dijera sensibles:false (la del signup de hace semanas: el de hoy contestó
 * «ya existe» y GoTrue no tocó nada). El teléfono ya guarda la constancia de
 * ESE registro antes de subir (pruebas/la-autorizacion-antes-de-lo-sensible
 * .test.js); la reja de verdad es esta, en la base
 * (base/20261020_la_cedula_de_la_cuenta.sql, paso 2-bis): la cuenta
 * —auth.users, no el JWT— tiene que tener una autorización con sensibles:true
 * para que entren la cédula, la selfie, la ubicación o la lectura.
 *
 * Monta un PostgreSQL con las migraciones de base/ en orden (el andamio de
 * Supabase de las otras pruebas de PostgreSQL) y corre el archivo DOS veces.
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre). Todas
 * FALLAN con el archivo de f1bcfde.
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
const NOMBRE = '20261020_la_cedula_de_la_cuenta.sql';
const APARATO = '20261019_aparato_del_telefono.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');

const FOTO = q => 'data:image/jpeg;base64,' + q;
const VIEJA = { version: '2026-08-11', momento: '2026-09-10T15:00:00Z', general: true, sensibles: false };
const HOY = { version: '2026-10-19', momento: '2026-10-21T15:00:00Z', general: true, sensibles: true };

describe('el archivo: la reja de la autorización', () => {
  test('lee la autorización de la CUENTA (auth.users de auth.uid()), y va antes que la reja de la cédula', () => {
    const i = SQL.indexOf('2-bis. SIN AUTORIZACIÓN DE DATOS SENSIBLES');
    assert.ok(i > 0, 'no está el paso 2-bis');
    const paso = SQL.slice(i, SQL.indexOf('====== 3.', i));
    assert.match(paso, /raw_user_meta_data -> 'autorizacion' ->> 'sensibles'\) = 'true'/);
    assert.match(paso, /from auth\.users u\s+where u\.id = auth\.uid\(\)/);
    assert.equal(/auth\.jwt\(\)/.test(paso.replace(/--[^\n]*/g, '')), false, 'la reja lee la autorización del JWT, que puede ser de antes de la constancia');
    assert.match(paso, /\?\| array\['cedula_frente', 'cedula_reverso', 'selfie'\]/);
    assert.match(paso, /\?\| array\['gps', 'cedula_leida'\]/);
    assert.match(paso, /'motivo', 'sin_autorizacion'/);
    /* Idempotente, y encima de la reja de la cédula. */
    assert.match(paso, /position\('sin_autorizacion' in cuerpo\) > 0/);
    assert.match(paso, /position\('cedula_rechazada' in cuerpo\) = 0 then\s+raise exception/);
    assert.equal(/create\s+or\s+replace\s+function/i.test(SQL), false, 'copia el cuerpo de una función');
  });
});

describe('sin autorización de datos sensibles, nada sensible entra (PostgreSQL de verdad)', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, segunda;
  let nConsulta = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++nConsulta) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  /* Una cuenta con esa metadata (null = sin metadata), y su registro. */
  const cuenta = (cel, meta) => {
    sql("insert into auth.users (id, email, raw_user_meta_data) values (md5('57" + cel + "')::uuid, '57" + cel + "@tugarantia.net', " +
        (meta === null ? 'null' : jb(meta)) + ')');
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos) values ('', '52123456', 'Prueba', '" + cel + "', " + jb({ documento: '52123456' }) + ')');
  };
  /* Como la app: con la sesión de esa cuenta (su sub y su correo en el JWT).
     `jwtMeta`: lo que diga el JWT de user_metadata (puede ser viejo). */
  const subir = (cel, archivos, huella, jwtMeta) => {
    const claims = { sub: '__SUB__', email: '57' + cel + '@tugarantia.net' };
    if (jwtMeta) claims.user_metadata = jwtMeta;
    const c = JSON.stringify(claims).replace('"__SUB__"', "\"' || md5('57" + cel + "')::uuid || '\"");
    return JSON.parse(sql("select set_config('request.jwt.claims', '" + c + "', false);" +
      ' select public.registro_archivos_guardar(' + jb(archivos) + ', ' + jb(huella || {}) + ')::text').split('\n').pop());
  };
  const archivosDe = cel => sql("select count(*) from public.registro_archivos where celular = '" + cel + "'");
  const huellaDe = cel => sql("select coalesce(huella::text, '') from public.registros where telefono = '" + cel + "'");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-autorizacion-'));
    puerto = 57200 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && f !== NOMBRE && f !== APARATO).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    ['20261007_una_puerta.sql', '20261007c_una_puerta_cierres.sql', '20261008_condiciones_aceptadas.sql', APARATO].forEach(f => {
      const r = archivo(path.join(RAIZ, 'base', f), true);
      assert.equal(r.status, 0, f + ' no corrió en el banco: ' + r.stderr);
    });
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      if (i === 2) segunda = r.stderr;
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('H4 — EL CASO DE ANA: su constancia dice sensibles:false; ni su cédula, ni su cara, ni su ubicación, ni la lectura entran, y no se escribe nada', () => {
    const cel = '3201120001';
    cuenta(cel, { telefono: cel, autorizacion: VIEJA });
    const r = subir(cel, { cedula_frente: FOTO('F'), cedula_reverso: FOTO('R'), selfie: FOTO('CARA') },
      { cedula_leida: { documento: '52123456', nombres: 'ANA' }, gps: { lat: 4.6, lng: -74.1 } });
    assert.deepEqual(r, { ok: false, motivo: 'sin_autorizacion' });
    assert.equal(archivosDe(cel), '0', 'entró algo sensible sin la autorización de la cuenta');
    assert.equal(huellaDe(cel), '', 'la reja escribió en la huella del registro');
    /* Cada cosa sensible, sola, tampoco. */
    [[{ selfie: FOTO('C') }, {}], [{ cedula_frente: FOTO('F') }, {}], [{ cedula_reverso: FOTO('R') }, {}],
     [{}, { gps: { lat: 4.6, lng: -74.1 } }], [{}, { cedula_leida: { documento: '52123456' } }]].forEach(([a, h]) =>
      assert.deepEqual(subir(cel, a, h), { ok: false, motivo: 'sin_autorizacion' }, JSON.stringify([a, h])));
    assert.equal(archivosDe(cel), '0');
  });

  test('H4 — una cuenta sin ninguna constancia (ni metadata) tampoco sube nada sensible', () => {
    const cel = '3201120002';
    cuenta(cel, null);
    assert.deepEqual(subir(cel, { selfie: FOTO('C') }, {}), { ok: false, motivo: 'sin_autorizacion' });
    assert.equal(archivosDe(cel), '0');
  });

  test('H4 — se lee de la CUENTA, no del JWT: un token que dice sensibles:true no abre la puerta si la cuenta dice que no', () => {
    const cel = '3201120003';
    cuenta(cel, { autorizacion: VIEJA });
    assert.deepEqual(subir(cel, { selfie: FOTO('C') }, {}, { autorizacion: HOY }), { ok: false, motivo: 'sin_autorizacion' });
    assert.equal(archivosDe(cel), '0');
  });

  test('H4 — con la constancia de este registro (la del signup, o la que guarda el «ya tenías cuenta»), entra como siempre', () => {
    const cel = '3201120004';
    cuenta(cel, { autorizacion: VIEJA });
    assert.equal(subir(cel, { selfie: FOTO('C') }, {}).motivo, 'sin_autorizacion');
    /* Lo que hace PUT /auth/v1/user con data: mezcla las llaves de arriba. */
    sql("update auth.users set raw_user_meta_data = raw_user_meta_data || " + jb({ autorizacion: HOY, autorizaciones: [VIEJA, HOY] }) +
        " where id = md5('57" + cel + "')::uuid");
    const r = subir(cel, { cedula_reverso: FOTO('R'), selfie: FOTO('C') }, { cedula_leida: { documento: '52123456', nombres: 'ANA' }, gps: { lat: 4.6, lng: -74.1 } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.guardados.sort(), ['cedula_reverso', 'selfie']);
    assert.equal(archivosDe(cel), '2');
    /* Y la cuenta nueva del signup, con sensibles:true desde el principio. */
    const nueva = '3201120005';
    cuenta(nueva, { autorizacion: HOY });
    assert.equal(subir(nueva, { selfie: FOTO('C') }, {}).ok, true);
  });

  test('H4 — manda la ÚLTIMA: un sí viejo en el historial no habilita nada si la de hoy dice que no', () => {
    const cel = '3201120006';
    cuenta(cel, { autorizacion: Object.assign({}, HOY, { sensibles: false }), autorizaciones: [HOY, Object.assign({}, HOY, { sensibles: false })] });
    assert.deepEqual(subir(cel, { selfie: FOTO('C') }, {}), { ok: false, motivo: 'sin_autorizacion' });
  });

  test('H4, control — una llamada sin nada sensible sigue como siempre (no pide la autorización)', () => {
    const cel = '3201120007';
    cuenta(cel, { autorizacion: VIEJA });
    const r = subir(cel, {}, { cedula_editado: { nombres: true } });
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  test('H4 — la segunda corrida no vuelve a parchar, y la autocomprobación probó la reja', () => {
    assert.match(segunda, /ya pide la autorización de datos sensibles: no se cambió nada/, segunda);
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    assert.match(r.stderr, /2 sin-autorizacion-no;/, r.stderr);
    const src = sql("select prosrc from pg_proc where oid = 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure");
    assert.equal((src.match(/'sin_autorizacion'/g) || []).length, 1, 'la reja quedó dos veces');
    assert.ok(src.indexOf('sin_autorizacion') < src.indexOf('cedula_rechazada'), 'la reja de la autorización va después de la de la cédula');
    assert.ok(src.indexOf('sin_autorizacion') < src.indexOf('insert into public.registro_archivos'));
  });
});
