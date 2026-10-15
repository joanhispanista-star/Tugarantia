/* ===========================================================================
 * equipo_poner_clave, corriendo en un PostgreSQL de verdad — 15-oct-2026
 *
 * Se salta sin TG_PG_BIN (la carpeta bin de PostgreSQL 17), como las demás
 * pruebas *-postgres. Arma la base igual que el-gerente-vende-postgres: el
 * esqueleto de Supabase (con sus privilegios por defecto, que le dan EXECUTE a
 * anon y authenticated), todas las migraciones, y encima la de hoy, dos veces.
 * ========================================================================= */
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
const GERENTE = '3000000000', RETIRADO = '3000000003', SIN_CUENTA = '3000000004', CLIENTE = '3101500001';
const BLOQUEADO = '3000000005', SIN_CONFIRMAR = '3000000006';
const correo = cel => '57' + cel + '@tugarantia.net';

describe('equipo_poner_clave en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const falla = consulta => {
    try { sql(consulta); } catch (e) { return String(e.stderr || e.message); }
    return null;
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8' });
  const claveSirve = (cel, clave) =>
    sql("select (encrypted_password = extensions.crypt('" + clave + "', encrypted_password))::text from auth.users where email = '" + correo(cel) + "'");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-clave-'));
    puerto = 55400 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    /* Lo que el esqueleto no trae y Supabase sí: la llave de servicio con los
       mismos permisos por defecto que anon y authenticated, y las columnas de
       cuenta bloqueada y sin confirmar. Sin esto, las tres negativas de la
       función no se podrían probar. */
    sql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
         grant usage on schema public to service_role;
         alter default privileges in schema public grant execute on functions to service_role;
         alter default privileges in schema public grant all on tables to service_role;
         alter table auth.users add column if not exists banned_until timestamptz;
         alter table auth.users add column if not exists email_confirmed_at timestamptz;`);
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && !/^20261015/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
    });
    /* La de hoy, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(() => {
      const r = archivo(path.join(RAIZ, 'base', '20261015c_clave_del_equipo.sql'), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia: ' + r.stderr);
    });
    sql(`
      insert into public.equipo (celular, nombre, rol, estado) values
        ('${GERENTE}', 'WILLIAN', 'gerente', 'activo'),
        ('${RETIRADO}', 'RETIRADO', 'asesor', 'retirado'),
        ('${SIN_CUENTA}', 'SIN CUENTA', 'asesor', 'activo'),
        ('${BLOQUEADO}', 'BLOQUEADO', 'asesor', 'activo'),
        ('${SIN_CONFIRMAR}', 'SIN CONFIRMAR', 'asesor', 'activo')
      on conflict do nothing;
      insert into auth.users (email, encrypted_password, email_confirmed_at, banned_until) values
        ('${correo(GERENTE)}', extensions.crypt('la-vieja-1', extensions.gen_salt('bf')), now(), null),
        ('${correo(RETIRADO)}', extensions.crypt('la-vieja-2', extensions.gen_salt('bf')), now(), null),
        ('${correo(CLIENTE)}', extensions.crypt('del-cliente', extensions.gen_salt('bf')), now(), null),
        ('${correo(BLOQUEADO)}', extensions.crypt('la-vieja-5', extensions.gen_salt('bf')), now(), now() + interval '30 days'),
        ('${correo(SIN_CONFIRMAR)}', extensions.crypt('la-vieja-6', extensions.gen_salt('bf')), null, null);
      insert into auth.sessions (user_id) select id from auth.users where email = '${correo(GERENTE)}';`);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
  });

  test('a alguien del equipo le pone la clave nueva, y la vieja deja de servir', () => {
    const r = sql("select public.equipo_poner_clave('" + GERENTE + "', 'nueva-clave-1')");
    assert.match(r, /^Listo: WILLIAN ya puede entrar/);
    assert.match(r, /Las sesiones que tenía abiertas se cerraron/);
    assert.equal(claveSirve(GERENTE, 'nueva-clave-1'), 'true', 'la clave nueva no sirve');
    assert.equal(claveSirve(GERENTE, 'la-vieja-1'), 'false', 'la clave vieja sigue sirviendo');
  });

  test('cierra las sesiones que tenía abiertas', () => {
    assert.equal(sql("select count(*) from auth.sessions s join auth.users u on u.id = s.user_id where u.email = '" + correo(GERENTE) + "'"), '0');
  });

  test('acepta el celular escrito como sea (+57, espacios)', () => {
    assert.match(sql("select public.equipo_poner_clave('+57 300 000 0000', 'otra-clave-2')"), /^Listo/);
    assert.equal(claveSirve(GERENTE, 'otra-clave-2'), 'true');
  });

  test('NO toca a un cliente que no es del equipo', () => {
    /* Para los clientes está la clave nueva de la puerta única, con sus rejas.
       MUTANTE QUE CAZA: quitar la búsqueda en public.equipo. */
    assert.match(falla("select public.equipo_poner_clave('" + CLIENTE + "', 'me-robo-la-cuenta')") || '', /no es de nadie del equipo/);
    assert.equal(claveSirve(CLIENTE, 'del-cliente'), 'true', 'le cambió la clave a un cliente');
  });

  test('a un retirado no, a quien no tiene cuenta tampoco, y menos de 8 caracteres tampoco', () => {
    assert.match(falla("select public.equipo_poner_clave('" + RETIRADO + "', 'una-clave-3')") || '', /retirado/);
    assert.equal(claveSirve(RETIRADO, 'la-vieja-2'), 'true');
    assert.match(falla("select public.equipo_poner_clave('" + SIN_CUENTA + "', 'una-clave-4')") || '', /todavía no tiene cuenta/);
    assert.match(falla("select public.equipo_poner_clave('" + GERENTE + "', 'corta')") || '', /al menos 8/);
    assert.equal(claveSirve(GERENTE, 'otra-clave-2'), 'true', 'una clave corta rechazada igual cambió algo');
  });

  test('una cuenta bloqueada o sin confirmar no recibe clave: no le serviría para entrar', () => {
    /* Decir «Listo» ahí sería mentir: Supabase Auth no la dejaría entrar igual. */
    assert.match(falla("select public.equipo_poner_clave('" + BLOQUEADO + "', 'una-clave-5')") || '', /bloqueada/);
    assert.equal(claveSirve(BLOQUEADO, 'la-vieja-5'), 'true');
    assert.match(falla("select public.equipo_poner_clave('" + SIN_CONFIRMAR + "', 'una-clave-6')") || '', /sin confirmar/);
    assert.equal(claveSirve(SIN_CONFIRMAR, 'la-vieja-6'), 'true');
  });

  test('NADIE de afuera la puede llamar: ni anon ni authenticated', () => {
    /* El esqueleto le da EXECUTE a anon y authenticated por defecto, como
       Supabase. Si el revoke no los nombra, esto pasa y alguien se vuelve gerente.
       MUTANTE QUE CAZA: dejar solo `revoke ... from public`. */
    for (const rol of ['anon', 'authenticated', 'service_role']) {
      const e = falla("set role " + rol + "; select public.equipo_poner_clave('" + GERENTE + "', 'me-hago-gerente')");
      assert.match(e || '', /permission denied/, rol + ' pudo llamar equipo_poner_clave');
    }
    assert.equal(claveSirve(GERENTE, 'otra-clave-2'), 'true');
  });

  test('el rastro dice cuándo y de quién, sin la contraseña', () => {
    assert.equal(sql("select count(*) from public.claves_equipo where celular = '" + GERENTE + "'"), '2');
    const cols = sql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'claves_equipo'");
    assert.equal(cols, 'celular,cuando,id,quien');
    assert.equal(sql("select string_agg(distinct quien, ',') from public.claves_equipo"), 'postgres',
      'el rastro no anota a quien corrió la línea');
    for (const rol of ['anon', 'authenticated', 'service_role']) {
      assert.match(falla("set role " + rol + "; select * from public.claves_equipo") || '', /permission denied/);
    }
  });
});
