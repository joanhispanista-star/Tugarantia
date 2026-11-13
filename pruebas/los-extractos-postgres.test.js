/* ============================================================================
 * TUS EXTRACTOS, EN LA BASE — 13 de noviembre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/los-extractos-postgres.test.js
 *
 * NO SE CORRE CON JOAN EN EL PC: levanta un PostgreSQL. La corre quien
 * orquesta, de noche (escrita el 13-nov y todavía NO corrida: lo que se probó
 * ese día es lo que lee el archivo, en pruebas/los-extractos.test.js).
 *
 * base/20261113c_los_extractos.sql en un PostgreSQL con TODAS las migraciones
 * de base/ en orden (el andamio de Supabase de las otras pruebas de
 * PostgreSQL), corrido DOS veces, y llamando lo que llaman el registro, la app
 * del cliente y el CRM de Joan:
 *
 *   · sin sesión y sin la autorización aparte: no entra nada;
 *   · un TIPO NO PERMITIDO (SVG, HTML, un ejecutable, texto que dice ser PDF)
 *     no entra, diga lo que diga el teléfono; un archivo ENORME tampoco;
 *   · los topes por persona: 3 PDF (los tres meses), 5 pantallazos, 12 MB;
 *   · lo suyo vuelve SIN el contenido, con la ocupación de SU registro (no la
 *     de otra persona que usó ese celular antes de abrir la cuenta);
 *   · el EQUIPO: las funciones de Joan no se pueden llamar con la sesión de
 *     nadie, y gerente_archivos no trae ningún extracto;
 *   · BORRAR: lo quita el cliente (uno o todo, y queda la constancia), lo
 *     borra Joan, y se va con la cuenta de acceso por cualquier camino;
 *   · el CORTACIRCUITO: pasados 50 MB, «lleno» y no escribe; el reintento de
 *     lo que ya entró dice la verdad; liberado el espacio, vuelve a entrar.
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre). Con la
 * base de 431f488 (sin el archivo) todas las de PostgreSQL fallan: las
 * funciones no existen. Los celulares, nombres y documentos son de mentira.
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
const NOMBRE = '20261113c_los_extractos.sql';
const COMPROBAR = 'comprobar_20261113c_los_extractos.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const CLAVE = 'clave-de-prueba-larga-123';
const ANA = '3001113301', BETO = '3001113302', CARLA = '3001113303', GER = '3172862539';

/* Archivos de mentira, sin datos de nadie: lo que importa son sus primeros
   bytes (lo único con lo que la base decide el tipo). */
const b64 = s => Buffer.from(s, 'binary').toString('base64');
const PDF = n => b64('%PDF-1.4\n% extracto de mentira ' + n + '\n%%EOF\n');
const PNG = n => b64('\x89PNG\r\n\x1a\n' + 'pantallazo de mentira ' + n);
const JPG = n => b64('\xff\xd8\xff\xe0' + 'JFIF de mentira ' + n);

describe('el archivo de la migración', () => {
  const codigo = SQL.replace(/--[^\n]*/g, '');
  test('crea solo funciones extracto_…: no reescribe ninguna de las que ya viven', () => {
    const nombres = [...codigo.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
    assert.equal(nombres.length, 10);
    nombres.forEach(n => assert.match(n, /^extracto_/, 'el archivo reescribe ' + n));
    assert.equal(/registro_archivos_guardar|archivos_de_registro|gerente_archivos|pension_/.test(codigo), false);
    assert.equal(/(insert\s+into|update|delete\s+from)\s+auth\.users\b/i.test(codigo), false, 'escribe en auth.users');
  });
});

describe('los extractos, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }),
        maxBuffer: 64 * 1024 * 1024 }).trim();
  };
  const sqlCrudo = consulta => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return spawnSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const uid = cel => "md5('cuenta-" + cel + "')::uuid";
  const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
  /* Como la sesión de esa cuenta, con el ROL de la sesión (authenticated):
     así PostgreSQL mira los permisos de verdad, como PostgREST. */
  const comoRol = (rol, cel, q) => sqlCrudo(
    (cel ? "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(cel) + " || '\",\"email\":\"57" + cel +
      "@tugarantia.net\",\"role\":\"authenticated\"}', false);"
      : "select set_config('request.jwt.claims', '', false);") +
    ' set role ' + rol + '; select (' + q + ')::text;');
  const como = (cel, q) => {
    const r = comoRol('authenticated', cel, q);
    assert.equal(r.status, 0, 'la llamada falló: ' + r.stderr);
    return r.stdout.trim().split(/\r?\n/).pop();
  };
  const jsonComo = (cel, q) => JSON.parse(como(cel, q));
  const comoAnon = q => {
    const r = comoRol('anon', null, q);
    assert.equal(r.status, 0, 'la llamada de Joan falló: ' + r.stderr);
    return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  };
  const cuenta = (cel, hace) => sql(
    'delete from auth.users where id = ' + uid(cel) + ';' +
    ' insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data) values (' + uid(cel) +
    ", '57" + cel + "@tugarantia.net', 'x', now(), now() - interval '" + (hace || '60 seconds') + "', '{}'::jsonb)");
  const registro = (cel, hace, ocupacion) => sql(
    "insert into public.registros (codigo, cedula, nombre, telefono, datos, creado_en) values ('', '52123456', 'Prueba De Mentira', '" + cel + "', " +
    lit(JSON.stringify({ documento: '52123456', ocupacion })) + "::jsonb, now() - interval '" + hace + "')");
  const autorizar = cel => jsonComo(cel, "public.extracto_autorizar('2026-11-19', '2026-11-19T10:00:00.000Z')");
  const subir = (cel, b) => jsonComo(cel, 'public.extracto_subir(' + lit(b) + ')');
  const mia = cel => jsonComo(cel, 'public.extracto_mia()');
  const filas = cel => sql("select count(*) from public.extracto_archivos where celular = '" + cel + "'");
  const limpiarFreno = cel => sql("delete from public.intentos_fallidos where cedula = 'ex:" + cel + "'");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-extractos-'));
    puerto = 58400 + Math.floor(Math.random() * 380);
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
    /* El gerente de Joan, con la clave de Joan puesta DESPUÉS de crear su
       cuenta (20261022d), y Ana en su base: él ve su registro. */
    sql("select public.equipo_publicar('" + CLAVE + "', '[{\"celular\":\"" + GER + "\",\"nombre\":\"GERENTE DE MENTIRA\",\"rol\":\"gerente\"}]'::jsonb," +
      " '[{\"id\":\"a1\",\"persona_id\":\"p1\",\"asesor\":\"" + GER + "\",\"desde\":\"2026-11-01\"}]'::jsonb," +
      " '[{\"id\":\"p1\",\"tipo\":\"prospecto\",\"celular\":\"" + ANA + "\",\"nombre\":\"ANA DE MENTIRA\"}]'::jsonb)");
    cuenta(GER);
    sql("select public.equipo_poner_clave('" + GER + "', 'la-clave-de-joan-1')");
    /* El archivo de hoy, DOS veces: tiene que ser idempotente, y su tabla de
       comprobaciones sale entera y en true las dos veces. */
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      const comp = r.stdout.trim().split(/\r?\n/).filter(l => /^\d+\|.*\|[tf]?$/.test(l));
      assert.equal(comp.length, 12, 'la tabla de comprobaciones no salió entera: ' + r.stdout);
      comp.forEach(l => assert.match(l, /\|t$/, 'una comprobación salió en false: ' + l));
    });
    /* Y la de comprobar, aparte, también en true (n|que|ok|detalle). */
    const c = archivo(path.join(RAIZ, 'base', COMPROBAR));
    assert.equal(c.status, 0, c.stderr);
    const comp = c.stdout.trim().split(/\r?\n/).filter(l => /\|[tf]\|/.test(l));
    assert.equal(comp.length, 9, c.stdout);
    comp.forEach(l => assert.match(l, /\|t\|/, 'comprobar dice false: ' + l));
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('sin sesión no entra nada; con sesión y sin la autorización aparte, tampoco', () => {
    cuenta(ANA, '2 days');
    registro(ANA, '2 days', 'Independiente');
    const r = comoRol('authenticated', null, 'public.extracto_subir(' + lit(PDF(0)) + ')');
    assert.equal(JSON.parse(r.stdout.trim().split(/\r?\n/).pop()).motivo, 'sin_sesion');
    assert.equal(subir(ANA, PDF(0)).motivo, 'sin_autorizacion');
    assert.equal(filas(ANA), '0');
    /* Sin versión no hay firma (no hay nada que cambiar sin firmar). */
    assert.equal(jsonComo(ANA, 'public.extracto_autorizar(null, null)').motivo, 'version');
    assert.equal(sql("select count(*) from public.extracto_autorizaciones where celular = '" + ANA + "'"), '0');
  });

  test('la llave pública no llama lo del cliente, y una sesión no llama lo de Joan', () => {
    ['public.extracto_mia()', 'public.extracto_retirar()'].forEach(q => {
      const r = comoRol('anon', null, q);
      assert.notEqual(r.status, 0, 'anon pudo llamar ' + q);
      assert.match(r.stderr, /permission denied/i);
    });
    ["public.extracto_resumen('" + CLAVE + "')", "public.extracto_archivo('" + CLAVE + "', 1)",
     "public.extracto_borrar('" + CLAVE + "', '" + ANA + "')"].forEach(q => {
      const r = comoRol('authenticated', ANA, q);
      assert.notEqual(r.status, 0, 'una sesión pudo llamar ' + q);
      assert.match(r.stderr, /permission denied/i);
    });
  });

  test('con la autorización: el PDF y los pantallazos entran; lo que no es PDF ni imagen no, diga lo que diga', () => {
    limpiarFreno(ANA);
    assert.equal(autorizar(ANA).ok, true);
    const p = subir(ANA, PDF(1));
    assert.deepEqual([p.ok, p.tipo], [true, 'pdf'], JSON.stringify(p));
    assert.equal(subir(ANA, PNG(1)).tipo, 'png');
    assert.equal(subir(ANA, JPG(1)).tipo, 'jpg');
    ['data:application/pdf;base64,' + b64('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
     b64('<!doctype html><script>alert(1)</script>'), b64('MZ\x90\x00 un ejecutable'), b64(' %PDF-1.4 con un espacio delante')]
      .forEach(x => assert.equal(subir(ANA, x).motivo, 'tipo_no_permitido', x.slice(0, 40)));
    assert.equal(subir(ANA, 'A'.repeat(4500001)).motivo, 'muy_grande');
    /* El mismo archivo dos veces (el reintento con la señal floja) no se duplica. */
    const re = subir(ANA, PDF(1));
    assert.deepEqual([re.ok, re.ya_estaba, re.id], [true, true, p.id]);
    assert.equal(filas(ANA), '3');
  });

  test('los topes por persona: 3 PDF (los tres meses) y 5 pantallazos', () => {
    limpiarFreno(ANA);
    assert.equal(subir(ANA, PDF(2)).ok, true);
    assert.equal(subir(ANA, PDF(3)).ok, true);
    assert.equal(subir(ANA, PDF(4)).motivo, 'demasiados', 'entró un cuarto PDF');
    [2, 3, 4].forEach(i => assert.equal(subir(ANA, PNG(i)).ok, true));
    assert.equal(subir(ANA, PNG(9)).motivo, 'demasiados', 'entró un sexto pantallazo');
    assert.equal(filas(ANA), '8');
  });

  test('lo suyo vuelve SIN el contenido, con la ocupación de SU registro', () => {
    const j = mia(ANA);
    assert.equal(j.ok, true);
    assert.equal(j.ocupacion, 'Independiente');
    assert.equal(j.autorizacion.version, '2026-11-19');
    assert.equal(j.autorizacion.revocada_en, null);
    assert.equal(j.archivos.length, 8);
    const texto = como(ANA, 'public.extracto_mia()');
    assert.equal(/base64|JVBER|iVBOR|extracto de mentira/.test(texto), false, 'viajó el contenido');
  });

  test('el registro de otra persona que usó ese celular antes de abrir la cuenta no le da ocupación', () => {
    /* Beto: hace un mes alguien se registró con este número como Independiente;
       la cuenta de hoy no tiene registro propio. */
    registro(BETO, '30 days', 'Independiente');
    cuenta(BETO, '1 hour');
    assert.equal(mia(BETO).ocupacion, null, 'le habla del registro de otra persona');
    /* Y la de un empleado sale como la escribió: la app decide. */
    cuenta(CARLA, '1 day');
    registro(CARLA, '1 day', 'Empleado');
    assert.equal(mia(CARLA).ocupacion, 'Empleado');
  });

  test('nada de otra cuenta: Beto no ve ni quita los de Ana', () => {
    limpiarFreno(BETO);
    const deAna = mia(ANA).archivos[0].id;
    assert.equal(mia(BETO).archivos.length, 0);
    assert.equal(jsonComo(BETO, 'public.extracto_quitar(' + Number(deAna) + ')').borrados, 0);
    assert.equal(filas(ANA), '8');
  });

  test('Joan, con su clave: el resumen sin archivos, el detalle, y UN archivo con sus bytes', () => {
    const r = comoAnon("public.extracto_resumen('" + CLAVE + "')");
    const ana = r.personas.find(p => p.celular === ANA);
    assert.deepEqual([Number(ana.pdf), Number(ana.imagenes)], [3, 5]);
    assert.ok(r.espacio && Number(r.espacio.tope) === 50 * 1024 * 1024, JSON.stringify(r.espacio));
    assert.equal(/base64/.test(JSON.stringify(r)), false);
    const d = comoAnon("public.extracto_de('" + CLAVE + "', '57 " + ANA + "')");
    assert.equal(d.celular, ANA);
    assert.equal(d.archivos.length, 8);
    const pdf = d.archivos.find(a => a.tipo === 'pdf');
    const a = comoAnon("public.extracto_archivo('" + CLAVE + "', " + Number(pdf.id) + ')');
    assert.equal(Buffer.from(a.base64, 'base64').toString('binary').slice(0, 5), '%PDF-');
    /* Con la clave mala, nada. */
    const mala = comoRol('anon', null, "public.extracto_resumen('otra-clave')");
    assert.notEqual(mala.status, 0);
    assert.match(mala.stderr, /clave de sincronizaci/);
  });

  test('el EQUIPO: la ficha del gerente (gerente_archivos) no trae ningún extracto', () => {
    const r = comoRol('authenticated', GER, "public.gerente_archivos('" + ANA + "')");
    if (r.status === 0) assert.equal(/extracto|JVBER|%PDF/.test(r.stdout), false, 'el gerente recibió un extracto: ' + r.stdout.slice(0, 200));
    /* Y ninguna función que no sea de los extractos los nombra. */
    assert.equal(sql("select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'" +
      " and p.proname not like 'extracto\\_%' and p.prosrc ~ 'extracto_archivos|extracto_autorizaciones'"), '0');
  });

  test('BORRAR: quitar uno, retirar todo (y queda la constancia), Joan borra, y la cuenta borrada se los lleva', () => {
    const uno = mia(ANA).archivos.find(a => a.tipo === 'png').id;
    assert.equal(jsonComo(ANA, 'public.extracto_quitar(' + Number(uno) + ')').borrados, 1);
    assert.equal(filas(ANA), '7');
    assert.equal(jsonComo(ANA, 'public.extracto_retirar()').borrados, 7);
    assert.equal(filas(ANA), '0');
    const j = mia(ANA);
    assert.ok(j.autorizacion && j.autorizacion.revocada_en, 'no quedó la constancia de que la retiró');
    limpiarFreno(ANA);
    assert.equal(subir(ANA, PDF(5)).motivo, 'sin_autorizacion', 'retirada, siguió entrando');
    /* Joan, a pedido por el chat. */
    limpiarFreno(ANA);
    assert.equal(autorizar(ANA).ok, true);
    assert.equal(subir(ANA, PDF(6)).ok, true);
    const b = comoAnon("public.extracto_borrar('" + CLAVE + "', '" + ANA + "')");
    assert.deepEqual([b.archivos, b.autorizaciones], [1, 1]);
    assert.equal(sql("select count(*) from public.extracto_autorizaciones where celular = '" + ANA + "'"), '0');
    /* La cuenta borrada a mano (Supabase → Authentication → borrar). */
    limpiarFreno(CARLA);
    assert.equal(autorizar(CARLA).ok, true);
    assert.equal(subir(CARLA, PDF(7)).ok, true);
    sql('delete from auth.users where id = ' + uid(CARLA));
    assert.equal(filas(CARLA), '0');
    assert.equal(sql("select count(*) from public.extracto_autorizaciones where celular = '" + CARLA + "'"), '0');
  });

  /* EL CORTACIRCUITO. Los topes son POR PERSONA y el registro está abierto:
     cuentas inventadas con su tope lleno llenarían la base. Aquí, lo que
     dejarían unas cinco: 51 MB de bytes al azar (no se comprimen, como un JPG
     de verdad). Con extracto_subir sin el cortacircuito, el segundo archivo de
     Ana entra y esta prueba falla. */
  test('ATAQUE: cuentas inventadas no llenan la base — pasados 50 MB, extracto_subir dice «lleno» y no escribe', () => {
    cuenta(ANA, '2 days');
    limpiarFreno(ANA);
    assert.equal(autorizar(ANA).ok, true);
    assert.equal(subir(ANA, PDF(8)).ok, true, 'con espacio, su PDF no entró');
    sql(`insert into public.extracto_archivos (celular, tipo, datos, bytes, sha256)
         select '32099911' || lpad(i::text, 2, '0'), 'jpg', x.d, octet_length(x.d), encode(sha256(x.d), 'hex')
           from generate_series(1, 17) i,
                lateral (select decode('ffd8ff', 'hex') || string_agg(extensions.gen_random_bytes(1024), ''::bytea) as d
                           from generate_series(1, 3071) g where i > 0) x`);
    const tam = Number(sql("select pg_total_relation_size('public.extracto_archivos')"));
    assert.ok(tam > 50 * 1024 * 1024, 'la prueba no pasó de 50 MB: ' + tam);
    const r = subir(ANA, PNG(8));
    assert.deepEqual([r.ok, r.motivo], [false, 'lleno'], 'con la tabla por encima de su trozo, entró: ' + JSON.stringify(r));
    assert.equal(filas(ANA), '1', 'con la tabla llena, se escribió');
    const re = subir(ANA, PDF(8));
    assert.deepEqual([re.ok, re.ya_estaba], [true, true], JSON.stringify(re));
    sql("delete from public.extracto_archivos where celular like '32099911%'");
    sql('vacuum full public.extracto_archivos');
    assert.equal(subir(ANA, PNG(8)).ok, true, 'liberado el espacio, sigue diciendo «lleno»');
    sql("delete from public.extracto_archivos where celular = '" + ANA + "'");
    limpiarFreno(ANA);
  });
});
