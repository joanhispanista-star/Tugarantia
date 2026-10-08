/* ============================================================================
 * LA PUERTA ÚNICA CONTRA UN POSTGRESQL DE VERDAD — opcional
 * 7 de octubre de 2026.
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/una-puerta-postgres.test.js
 *
 * Sin TG_PG_BIN se salta (la suite no depende de tener un PostgreSQL). Con él:
 * arranca un PostgreSQL de usar y tirar en una carpeta temporal, le pone lo
 * mínimo de Supabase (los roles anon y authenticated, auth.users, auth.jwt(),
 * pgcrypto en extensions, el permiso que Supabase regala a cada función
 * nueva), le corre TODAS las migraciones de base/ en orden, siembra fichas de
 * mentira, corre base/20261007_una_puerta.sql DOS veces y prueba LLAMANDO:
 *
 *   · un desconocido que se registra con el celular de una clienta sin cédula
 *     no ve su historial, ni su chat, ni su solicitud de antes;
 *   · Joan junta, y la cuenta ve todo; deshace, y lo que escribió esa cuenta
 *     vuelve a su hilo aparte mientras lo de Joan se queda en la ficha;
 *   · dos fichas que comparten celular: juntar a una no se lleva el chat de
 *     la otra, y el mismo teléfono no se junta con las dos;
 *   · la aprobación con señales raras pide el toque;
 *   · la puerta del código, cerrada para anon y para las sesiones;
 *   · la clave nueva queda en un bcrypt que la contraseña abre;
 *   · borrar la cuenta suelta la unión;
 *   · y la consulta de verificación sale toda en true.
 *
 * Así se probó el 7-oct-2026 antes de entregarla (PostgreSQL 17.10).
 * 7-oct-2026 (segunda vuelta): juntar pide el nombre de la ficha (p_nombre),
 * y la nube lo compara con el de la fila; los cierres que encontró la revisión
 * se prueban en pruebas/una-puerta-cierres-postgres.test.js.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);

const STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), session_id uuid references auth.sessions(id) on delete cascade);
create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(auth.jwt()->>'sub','')::uuid $f$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint language sql as 'select 1::bigint';
`;

const SEMILLA = `
insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values
 ('3001112222', '3001112222', '2222', 'Adriana Sin Cedula', '{"garantia":{"total":145000}}', now()),
 ('3005556666', '3005556666', '6666', 'Beto Comparte', '{}', now()),
 ('79000111',   '3005556666', '6666', 'Ana Comparte', '{}', now()),
 ('41000222',   '3007778888', '8888', 'Eva Ya Junta', '{}', now()),
 ('3009990000', '3009990000', '0000', 'Nuevo Raro', '{}', now());
update public.socios_historial set auth_vinculada_en = now() - interval '10 days', auth_celular = '3007778888' where cedula = '41000222';
insert into public.mensajes (cedula, de, texto, canal) values
 ('3001112222', 'panel', 'Adriana, tu cuota de 145.000 vence el 15', 'cobranza'),
 ('3005556666', 'socio', 'soy Beto', 'servicio');
insert into public.solicitudes (cedula, nombre, capital, tasa, costo, total, creada_en) values
 ('3001112222', 'Adriana Sin Cedula', 300000, 0.2, 60000, 360000, now() - interval '2 days');
`;

describe('la puerta única en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, psql;
  const sql = (consulta, db) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const archivo = (f, una) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = q => JSON.parse(sql(q));
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-'));
    puerto = 55500 + Math.floor(Math.random() * 400);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^20261007/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad; la puerta no las necesita */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    fs.writeFileSync(path.join(dir, 'semilla.sql'), SEMILLA);
    archivo(path.join(dir, 'semilla.sql'));
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);   // dos veces: idempotente
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  const CLAVE = "'clave-de-prueba-larga-123'";

  test('un desconocido con el celular de Adriana no ve nada; Joan junta y lo ve; deshace y lo de él vuelve a su hilo', () => {
    sql("insert into auth.users (email, created_at) values ('573001112222@tugarantia.net', now() - interval '5 minutes')");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen, creado_en) values ('', '', 'Intruso', '3001112222', '{\"verificacion\":\"TG-1\"}', 'abierto', now() - interval '4 minutes')");
    const reg = sql('select max(id) from public.registros');
    assert.equal(comoCuenta('3001112222', 'public.mi_cuenta()').vinculada, false);
    assert.deepEqual(comoCuenta('3001112222', "public.chat_leer_sesion('cobranza', 0)").mensajes, [], 'leyó el chat de cobranza de Adriana');
    assert.equal(comoCuenta('3001112222', 'public.mi_solicitud()').solicitud, null, 'vio la solicitud de Adriana');
    assert.equal(comoCuenta('3001112222', "public.chat_escribir_sesion('servicio', 'hola, soy yo')").ok, true);
    assert.equal(sql("select public.llave_de_sesion('3001112222')"), '03001112222');

    const j = json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + reg + ", '3001112222', p_nombre => 'Adriana Sin Cedula')");
    assert.equal(j.ok, true); assert.equal(j.mensajes_movidos, 1);
    const c = comoCuenta('3001112222', 'public.mi_cuenta()');
    assert.equal(c.vinculada, true); assert.equal(c.nombre, 'Adriana Sin Cedula');
    assert.equal(comoCuenta('3001112222', "public.chat_leer_sesion('cobranza', 0)").mensajes.length, 1);
    assert.equal(comoCuenta('3001112222', "public.chat_escribir_sesion('servicio', 'despues de juntar')").ok, true);

    const d = json('select public.desvincular_cuenta_joan(' + CLAVE + ", '3001112222', 'no era ella')");
    assert.equal(d.ok, true);
    assert.equal(comoCuenta('3001112222', 'public.mi_cuenta()').vinculada, false);
    assert.equal(sql("select string_agg(texto, '|' order by id) from public.mensajes where cedula = '03001112222'"),
      'hola, soy yo|Listo, ya juntamos tu historial con tu cuenta. Desde ahora lo ves al entrar con tu celular y tu contraseña.|despues de juntar');
    assert.equal(sql("select count(*) from public.mensajes where cedula = '3001112222' and de = 'panel'"), '1', 'lo de Joan salió de la ficha');
    assert.equal(sql("select count(*) from public.vinculos where cedula = '3001112222' and deshecho_en is not null and motivo = 'no era ella'"), '1');
  });

  test('dos fichas con el mismo celular: juntar a Ana no se lleva el chat de Beto, y el teléfono no se junta con las dos', () => {
    sql("insert into auth.users (email, created_at) values ('573005556666@tugarantia.net', now() - interval '3 minutes')");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen, creado_en) values ('', '79000111', 'Ana', '3005556666', 'abierto', now() - interval '2 minutes')");
    const reg = sql('select max(id) from public.registros');
    assert.equal(json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + reg + ", '79000111', p_nombre => 'Ana Comparte')").ok, true);
    assert.equal(sql("select count(*) from public.mensajes where cedula = '3005556666' and texto = 'soy Beto'"), '1', 'el chat de Beto se fue con Ana');
    assert.equal(json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + reg + ", '3005556666', p_nombre => 'Beto Comparte')").motivo, 'telefono_con_otra_ficha');
    /* Y borrar la cuenta suelta la unión. */
    sql("delete from auth.users where email = '573005556666@tugarantia.net'");
    assert.equal(sql("select coalesce(auth_celular, 'suelta') from public.socios_historial where cedula = '79000111'"), 'suelta');
  });

  test('la aprobación con señales raras pide el toque; sin cuenta no junta', () => {
    sql("insert into auth.users (email, created_at) values ('573009990000@tugarantia.net', now() - interval '3 hours')");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen) values ('', '', 'Nuevo Raro', '3009990000', 'abierto')");
    /* La nota en ASCII: la línea de comandos de Windows no le lleva tildes a psql. */
    sql("insert into public.ayudas_clave (celular, nota) values ('3009990000', 'olvide')");
    const reg = sql('select max(id) from public.registros');
    const j = json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + reg + ", '3009990000', 'aprobacion', p_nombre => 'Nuevo Raro')");
    assert.equal(j.motivo, 'pide_toque'); assert.equal(j.razones.length, 2);
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen) values ('', '', 'Sin Cuenta', '3001230000', 'abierto')");
    const sin = sql('select max(id) from public.registros');
    assert.equal(json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + sin + ", '41000222')").motivo, 'sin_cuenta');
  });

  test('una ficha que estrena cédula después de juntarse: la lista y «deshacer» la encuentran con su llave nueva', () => {
    sql("insert into auth.users (email, created_at) values ('573004445555@tugarantia.net', now())");
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('3004445555','3004445555','5555','Carla Muda','{}',now())");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen) values ('', '', 'Carla', '3004445555', 'abierto')");
    const reg = sql('select max(id) from public.registros');
    assert.equal(json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + reg + ", '3004445555', p_nombre => 'Carla Muda')").ok, true);
    sql('select public.sincronizar_socios(' + CLAVE + ", '[{\"cedula\":\"1030555666\",\"telefono\":\"3004445555\",\"nombre\":\"Carla Muda\",\"codigo\":null,\"codigo_forzar\":false,\"datos\":{}}]'::jsonb)");
    const fila = json('select public.vinculos_listar(' + CLAVE + ')').find(v => v.celular === '3004445555');
    assert.equal(fila.ficha, '1030555666', 'la lista ofrece deshacer con la llave vieja, que ya no existe');
    assert.equal(json('select public.desvincular_cuenta_joan(' + CLAVE + ", '1030555666', 'prueba')").ok, true);
    assert.equal(sql("select count(*) from public.vinculos where celular = '3004445555' and deshecho_en is null"), '0',
      'quedó una unión «viva» en la evidencia de algo que ya se deshizo');
  });

  test('la clave nueva abre con su bcrypt', () => {
    sql("create table t_clave as select public.clave_temporal_joan(" + CLAVE + ", '3009990000') j");
    assert.equal(sql("select (u.encrypted_password = extensions.crypt(t.j->>'clave', u.encrypted_password))::text from auth.users u, t_clave t where u.email = '573009990000@tugarantia.net'"), 'true');
  });

  test('la puerta del código, cerrada; las puertas nuevas, solo para quien son', () => {
    assert.throws(() => sql("set role anon; select public.historial_socio_por_codigo('1','ABCDE')"), /permission denied/);
    assert.throws(() => sql("set role authenticated; select public.vincular_cuenta('1','ABCDE')"), /permission denied/);
    assert.throws(() => sql("set role anon; select public.panel_vincular_cuenta(1,'1')"), /permission denied/);
    assert.throws(() => sql("set role anon; select * from public.vinculos"), /permission denied/);
    assert.throws(() => sql("set role anon; select public.vincular_cuenta_joan('mala',1,'1')"), /clave de sincronizaci/);
  });

  test('la consulta de verificación sale toda en true', () => {
    const filas = execFileSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-F', '|',
      '-f', path.join(RAIZ, 'base', '20261007b_una_puerta_comprobar.sql')], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(filas.length, 11);
    filas.forEach(f => assert.equal(f.split('|')[2], 't', 'falló: ' + f));
  });
});
