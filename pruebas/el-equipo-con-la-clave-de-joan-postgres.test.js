/* ============================================================================
 * LO DEL EQUIPO SOLO SE ABRE CON LA CLAVE DE JOAN — 22 de octubre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/el-equipo-con-la-clave-de-joan-postgres.test.js
 *
 * El hueco que apareció buscando la selfie de William: las funciones del
 * equipo decidían quién eres SOLO por el correo de la sesión, y esa cuenta la
 * crea cualquiera que se registre en play/ con el celular de alguien del
 * equipo que todavía no tiene cuenta (o a quien se la borraron). Con eso veía
 * la cartera, los registros y las fotos de cédula de terceros, y creaba
 * asesores. base/20261022b_el_equipo_con_la_clave_de_joan.sql lo cierra: lo
 * del equipo se abre solo con la clave que Joan pone desde el editor SQL
 * (equipo_poner_clave, que deja su rastro en claves_equipo), puesta DESPUÉS de
 * crear la cuenta, y con una sesión de después de esa clave.
 *
 * Se arma la base con todas las migraciones (el andamio de Supabase de las
 * otras pruebas de PostgreSQL), se corre el archivo dos veces, y se llama lo
 * que llama el Panel. Con la base de ab6b595 (sin el archivo) fallan todas.
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
const NOMBRE = '20261022b_el_equipo_con_la_clave_de_joan.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const GER = '3172862539', ASE = '3001230001', TERCERA = '3159990001', CLIENTE = '3009991111';
const CLAVE = 'clave-de-prueba-larga-123';

describe('el archivo', () => {
  test('no copia ninguna función: las lee vivas, cambia SOLO la línea que decide quién eres, y lo comprueba con md5', () => {
    const codigo = SQL.replace(/--[^\n]*/g, '');
    assert.equal((codigo.match(/create\s+or\s+replace\s+function/gi) || []).length, 2, 'crea algo más que las dos funciones nuevas');
    assert.match(codigo, /create or replace function public\.celular_del_equipo_de_sesion\(\)/);
    assert.match(codigo, /create or replace function public\.equipo_cuenta_sin_clave\(\)/);
    assert.match(codigo, /replace\(pg_get_functiondef\(r\.oid\), 'public\.celular_de_sesion\(\)', 'public\.celular_del_equipo_de_sesion\(\)'\)/);
    assert.match(codigo, /md5\(replace\(despues, 'public\.celular_del_equipo_de_sesion\(\)', 'public\.celular_de_sesion\(\)'\)\) <> md5\(antes\)/);
    assert.match(codigo, /revoke all on function public\.celular_del_equipo_de_sesion\(\) from public, anon, authenticated;/);
    assert.equal(/(insert\s+into|update|delete\s+from)\s+auth\.users\b/i.test(codigo), false, 'el archivo que Joan pega en producción escribe en auth.users');
  });

  test('ninguna migración POSTERIOR vuelve a decidir el puesto con celular_de_sesion()', () => {
    /* 22-oct-2026 — el archivo de hoy cambia las funciones del equipo que
       EXISTEN al correrlo. Una función del equipo escrita después con
       celular_de_sesion() volvería a abrir el hueco sin que nada lo dijera
       (y si se aplica después de este archivo, su paso 2 ya no la ve). Las
       del equipo nuevas usan celular_del_equipo_de_sesion() o
       gerente_de_sesion(). */
    const EQUIPO = /(public\.equipo|from\s+equipo|join\s+equipo|update\s+equipo|public\.envios_asesor)\b/i;
    const despues = fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && f > NOMBRE).sort();
    despues.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/--[^\n]*/g, '');
      t.split(/create\s+or\s+replace\s+function/i).slice(1).forEach(cuerpo => {
        const nombre = (cuerpo.match(/^\s*([\w.]+)/) || [])[1] || '?';
        if (/^public\.(celular_de_sesion|celular_del_equipo_de_sesion|equipo_cuenta_sin_clave)$/.test(nombre)) return;
        assert.equal(/public\.celular_de_sesion\(\)/.test(cuerpo) && EQUIPO.test(cuerpo), false,
          f + ': ' + nombre + ' decide el puesto con celular_de_sesion(); usa celular_del_equipo_de_sesion()');
      });
    });
  });
});

describe('el equipo con la clave de Joan, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
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
  const uid = cel => "md5('cuenta-" + cel + "')::uuid";
  /* Llamar como la sesión de esa cuenta, con el token emitido `iat` (segundos
     desde ahora, negativo = antes). */
  const como = (cel, q, iat) => sql(
    "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(cel) + " || '\",\"email\":\"57" + cel + "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' ||" +
    ' floor(extract(epoch from now()) + ' + (iat || 0) + ") || '}', false);" +
    ' select (' + q + ')::text').split(/\r?\n/).pop();
  const jsonComo = (cel, q, iat) => JSON.parse(como(cel, q, iat));
  /* Una cuenta como la crea el signup de Supabase (el registro de play/ o el
     «Crear cuenta» del CRM): hace `hace` segundos. */
  const cuenta = (cel, hace, meta) => sql(
    'delete from auth.users where id = ' + uid(cel) + ';' +
    ' insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data) values (' + uid(cel) +
    ", '57" + cel + "@tugarantia.net', extensions.crypt('la-que-eligio', extensions.gen_salt('bf')), now(), now() - interval '" + (hace || 0) + " seconds', '" +
    JSON.stringify(meta || {}) + "'::jsonb)");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-equipo-clave-'));
    puerto = 57600 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost -c shared_buffers=32MB',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    sql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
         grant usage on schema public to service_role;
         alter default privileges in schema public grant execute on functions to service_role;
         alter table auth.users add column if not exists banned_until timestamptz;
         alter table auth.users add column if not exists email_confirmed_at timestamptz;`);
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && f !== NOMBRE).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = '" + CLAVE + "' where clave = 'clave_sync'");
    });
    /* El equipo de Joan: WILLIAN gerente y una asesora suya, con una prospecta
       (otra persona) asignada a la asesora, registrada con sus fotos. */
    sql("select public.equipo_publicar('" + CLAVE + "', '[{\"celular\":\"" + GER + "\",\"nombre\":\"WILLIAN\",\"rol\":\"gerente\"}," +
      "{\"celular\":\"" + ASE + "\",\"nombre\":\"ASESORA\",\"rol\":\"asesor\",\"jefe\":\"" + GER + "\"}]'::jsonb," +
      " '[{\"id\":\"a1\",\"persona_id\":\"p1\",\"asesor\":\"" + ASE + "\",\"desde\":\"2026-10-01\"}]'::jsonb," +
      " '[{\"id\":\"p1\",\"tipo\":\"prospecto\",\"celular\":\"" + TERCERA + "\",\"nombre\":\"TERCERA PERSONA\"}]'::jsonb)");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen) values ('', '52999888', 'Tercera Persona', '" + TERCERA +
      "', '{\"documento\":\"52999888\"}', 'abierto');" +
      " insert into public.registro_archivos (celular, tipo, imagen) values ('" + TERCERA + "', 'cedula_frente', 'data:image/jpeg;base64,RlJFTlRF'), ('" + TERCERA + "', 'selfie', 'data:image/jpeg;base64,Q0FSQQ==')");
    /* El archivo de hoy, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      if (i === 1) assert.match(r.stderr, /Cambiadas \d+ funciones del equipo/, r.stderr);
      else assert.match(r.stderr, /ya deciden quién eres con la clave de Joan: no se cambió nada/, r.stderr);
      const filas = r.stdout.trim().split(/\r?\n/).filter(l => /^\d+\|/.test(l));
      filas.filter(l => /^[1-4]\|/.test(l)).forEach(l => assert.match(l, /\|t\|/, 'una comprobación salió en false: ' + l));
      assert.ok(filas.some(l => /Puede entrar al equipo: WILLIAN \(gerente, 3172862539\)\|f\|Todavía no tiene cuenta/.test(l)),
        'la tabla de Joan no dice que WILLIAN no tiene cuenta: ' + r.stdout);
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('EL HUECO, CERRADO: quien se registra como cliente con el celular del gerente NO entra a lo del equipo', () => {
    /* El signup de play/ crea la cuenta con lo que manda el registro. */
    cuenta(GER, 60, { telefono: GER, vinculacion: { nombres: 'Alguien' }, autorizacion: { general: true, sensibles: true } });
    assert.deepEqual(jsonComo(GER, 'public.mi_rol()'), { ok: false }, 'la cuenta nacida de un registro de cliente salió gerente');
    assert.equal(jsonComo(GER, 'public.mi_cartera()').ok, false, 'vio la cartera del equipo');
    assert.equal(jsonComo(GER, 'public.gerente_registros()').ok, false, 'vio los registros de su equipo');
    assert.equal(/RlJFTlRF|Q0FSQQ/.test(como(GER, "public.gerente_archivos('" + TERCERA + "')")), false, 'vio las fotos de cédula de un tercero');
    assert.equal(jsonComo(GER, "public.asesor_crear('3005550000', 'Asesor Inventado')").ok, false, 'creó un asesor');
    assert.equal(sql("select count(*) from public.equipo where celular = '3005550000'"), '0');
    /* Y el Panel puede decirle la verdad: a esta cuenta le falta la clave de Joan. */
    assert.equal(como(GER, 'public.equipo_cuenta_sin_clave()'), 'true');
  });

  test('pero como CLIENTE sigue siendo una cuenta normal: su subida de fotos entra', () => {
    const r = jsonComo(GER, "public.registro_archivos_guardar('{\"selfie\":\"data:image/jpeg;base64,TUlDQVJB\"}'::jsonb, '{}'::jsonb)");
    assert.equal(r.ok, true, 'cerrar lo del equipo le tumbó la cuenta de cliente: ' + JSON.stringify(r));
  });

  test('con la clave de Joan (puesta DESPUÉS de crear la cuenta) entra; con un token de antes de la clave, no', () => {
    assert.match(sql("select public.equipo_poner_clave('" + GER + "', 'la-clave-de-joan-1')"), /^Listo: WILLIAN/);
    assert.deepEqual(jsonComo(GER, 'public.mi_rol()', -600), { ok: false }, 'un token de antes de la clave de Joan sigue abriendo lo del equipo');
    const yo = jsonComo(GER, 'public.mi_rol()', 5);
    assert.equal(yo.ok, true, 'con la clave de Joan y una sesión nueva no entró: ' + JSON.stringify(yo));
    assert.equal(yo.rol, 'gerente');
    assert.equal(jsonComo(GER, 'public.mi_cartera()', 5).ok, true);
    assert.match(como(GER, "public.gerente_archivos('" + TERCERA + "')", 5), /RlJFTlRF/);
    assert.equal(como(GER, 'public.equipo_cuenta_sin_clave()', 5), 'false');
  });

  test('si la cuenta se borra y alguien la vuelve a crear registrándose, la clave vieja no le sirve', () => {
    cuenta(GER, 0, { telefono: GER, vinculacion: { nombres: 'Otro' } });
    assert.deepEqual(jsonComo(GER, 'public.mi_rol()', 5), { ok: false },
      'una clave de Joan de una cuenta anterior le abrió el equipo a la cuenta nueva');
  });

  test('la cuenta que crea el «Crear cuenta» del CRM también necesita la clave (el signup es el mismo para todos)', () => {
    cuenta(ASE, 30, {});
    assert.deepEqual(jsonComo(ASE, 'public.mi_rol()'), { ok: false });
    assert.match(sql("select public.equipo_poner_clave('" + ASE + "', 'la-clave-de-joan-2')"), /^Listo: ASESORA/);
    assert.equal(jsonComo(ASE, 'public.mi_rol()', 5).rol, 'asesor');
  });

  test('un cliente que no es del equipo no nota nada', () => {
    cuenta(CLIENTE, 30, { autorizacion: { general: true, sensibles: true } });
    assert.equal(como(CLIENTE, 'public.celular_del_equipo_de_sesion()'), CLIENTE);
    assert.equal(como(CLIENTE, 'public.equipo_cuenta_sin_clave()'), 'false');
    assert.deepEqual(jsonComo(CLIENTE, 'public.mi_rol()'), { ok: false });
    assert.equal(jsonComo(CLIENTE, "public.registro_archivos_guardar('{}'::jsonb, '{}'::jsonb)").ok, true);
  });

  test('nadie de afuera llama la función que decide; la del aviso, solo una sesión', () => {
    assert.equal(sql("select has_function_privilege('anon', 'public.celular_del_equipo_de_sesion()', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated', 'public.celular_del_equipo_de_sesion()', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('anon', 'public.equipo_cuenta_sin_clave()', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated', 'public.equipo_cuenta_sin_clave()', 'execute')"), 't');
    /* Y las del equipo no perdieron sus permisos al cambiar. */
    assert.equal(sql("select has_function_privilege('authenticated', 'public.mi_cartera()', 'execute')"), 't');
    assert.equal(sql("select has_function_privilege('anon', 'public.mi_cartera()', 'execute')"), 'f');
  });

  test('toda función que ahora pregunta por la clave corre como su dueño (si no, la sesión no podría llamarla)', () => {
    /* 22-oct-2026 — celular_del_equipo_de_sesion() no se le da a
       `authenticated` (nadie de afuera la llama). Eso solo funciona si quien
       la llama es SECURITY DEFINER: una función del equipo que corriera con
       los permisos de la sesión fallaría con «permission denied» y dejaría a
       todo el equipo afuera, con la clave puesta. Las pruebas de arriba corren
       como postgres y no lo verían. */
    const invocadoras = sql("select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') from pg_proc p join pg_namespace s on s.oid = p.pronamespace" +
      " where s.nspname = 'public' and p.prosrc ~ 'celular_del_equipo_de_sesion' and not p.prosecdef");
    assert.equal(invocadoras, '', 'corren con los permisos de la sesión y no podrían llamarla: ' + invocadoras);
    const cuantas = Number(sql("select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace" +
      " where s.nspname = 'public' and p.prosrc ~ 'public\\.celular_del_equipo_de_sesion\\(\\)'" +
      " and p.proname not in ('celular_del_equipo_de_sesion', 'equipo_cuenta_sin_clave')"));
    assert.ok(cuantas >= 10, 'cambiaron muy pocas funciones del equipo: ' + cuantas);
  });
});
