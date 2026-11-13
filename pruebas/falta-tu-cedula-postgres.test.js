/* ============================================================================
 * FALTA TU CÉDULA, EN LA BASE — 13 de noviembre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/falta-tu-cedula-postgres.test.js
 *
 * NO SE CORRE CON JOAN EN EL PC: levanta un PostgreSQL. La corre quien
 * orquesta, de noche (escrita el 13-nov y todavía no corrida).
 *
 * base/20261113_falta_tu_cedula.sql, en un PostgreSQL con todas las
 * migraciones de base/ en orden (el andamio de Supabase de las otras pruebas
 * de PostgreSQL), corrida DOS veces, y llamando lo que la app llama:
 *
 *   · sin sesión: ok:false; la tabla de Joan, todas sus filas en true;
 *   · la cuenta con su registro y sin ninguna foto: las tres en false, sin
 *     el permiso de datos sensibles (sensibles:false);
 *   · la cédula subida DÍAS DESPUÉS del registro con registro_archivos_guardar
 *     (la misma de play/, con la sesión): aparece; sin la lectura del código,
 *     cedula_con_codigo:false; con la lectura, true;
 *   · nada de otra cuenta: ni sus fotos, ni su registro;
 *   · el registro de antes de la cámara, el de otra persona de antes de abrir
 *     la cuenta (registro:null) y el pasaporte;
 *   · nunca viaja una imagen.
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre). Con la
 * base de 746310d (sin el archivo) todas las de PostgreSQL fallan: la función
 * no existe.
 * Los celulares, los nombres y los documentos son de mentira.
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
const NOMBRE = '20261113_falta_tu_cedula.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const COMPROBAR = fs.readFileSync(path.join(RAIZ, 'base', 'comprobar_20261113_falta_tu_cedula.sql'), 'utf8');
const sinComentarios = t => t.replace(/--[^\n]*/g, '');

describe('el archivo de la migración', () => {
  test('crea UNA función nueva y no reescribe ninguna de las que ya viven', () => {
    const creadas = [...sinComentarios(SQL).matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map(m => m[1]);
    assert.deepEqual(creadas, ['mis_fotos_del_registro']);
    assert.equal(/registro_archivos_guardar\s*\(\s*p_archivos/.test(SQL), false, 'copia la firma de la subida');
    assert.equal(/\b(insert\s+into|update\s+public|delete\s+from)\b/i.test(sinComentarios(SQL)), false, 'escribe filas');
  });

  test('solo la sesión la llama: revoca a public, anon y authenticated, y se la da a authenticated', () => {
    const t = sinComentarios(SQL);
    assert.match(t, /revoke all on function public\.mis_fotos_del_registro\(\) from public, anon, authenticated;/);
    assert.match(t, /grant execute on function public\.mis_fotos_del_registro\(\) to authenticated;/);
    assert.equal(/grant[^;]*mis_fotos_del_registro[^;]*\banon\b/.test(t), false, 'se la da a la llave pública');
  });

  test('stable, security definer, search_path fijo, y por el celular de la sesión', () => {
    const t = sinComentarios(SQL);
    const cabeza = t.slice(t.indexOf('create or replace function public.mis_fotos_del_registro'), t.indexOf('as $$'));
    assert.match(cabeza, /^\s*stable\s*$/m);
    assert.match(cabeza, /security definer/);
    assert.match(cabeza, /set search_path = public/);
    const cuerpo = t.slice(t.indexOf('as $$'), t.indexOf('$$;', t.indexOf('as $$')));
    assert.match(cuerpo, /cel := public\.celular_de_sesion\(\);/);
    assert.match(cuerpo, /if cel is null then\s+return jsonb_build_object\('ok', false\);/);
    /* La misma expresión que registro_archivos_guardar (20261020, 2-bis). */
    assert.match(cuerpo, /raw_user_meta_data -> 'autorizacion' ->> 'sensibles'\) = 'true'/);
    assert.match(cuerpo, /where u\.id = auth\.uid\(\)/);
    /* Sin imágenes: ni la columna ni la función de Joan que las devuelve. */
    assert.equal(/imagen|archivos_de_registro/.test(cuerpo), false);
  });

  test('el paso 0 para si falta lo de antes, y termina en la tabla que Joan ve', () => {
    const t = sinComentarios(SQL);
    const paso0 = t.slice(0, t.indexOf('end $$;') + 7);
    assert.match(paso0, /celular_del_equipo_de_sesion\(\)'\) is null[\s\S]*?raise exception/);
    assert.match(paso0, /column_name = 'documento'/);
    assert.match(t, /select 1 as n, '[^']+' as comprobacion,[\s\S]*order by 1;\s*$/);
    /* La consulta de comprobar es la misma (mismas seis filas). */
    assert.equal((COMPROBAR.match(/^select \d/gm) || []).length, 6);
    assert.equal((SQL.match(/^select \d/gm) || []).length, 6);
  });
});

describe('falta tu cédula, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
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
  const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  const uid = cel => "md5('57" + cel + "')::uuid";
  /* La cuenta, como la deja el signup: abierta `hace` (un intervalo) y con la
     autorización que se le diga. */
  const cuenta = (cel, hace, sensibles) => sql(
    'insert into auth.users (id, email, created_at, raw_user_meta_data) values (' + uid(cel) + ", '57" + cel + "@tugarantia.net'," +
    " now() - interval '" + hace + "', " + jb({ autorizacion: { version: '2026-10-19', general: true, sensibles: !!sensibles } }) + ')' +
    ' on conflict (id) do update set raw_user_meta_data = excluded.raw_user_meta_data, created_at = excluded.created_at');
  /* El registro, como lo deja registrar_abierto (sin sesión). */
  const registro = (cel, hace, datos) => sql(
    "insert into public.registros (codigo, cedula, nombre, telefono, datos, creado_en) values ('', '52123456', 'Prueba', '" + cel + "', " +
    jb(Object.assign({ documento: '52123456' }, datos || {})) + ", now() - interval '" + hace + "')");
  const comoLaSesion = cel => "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(cel) + " || '\",\"email\":\"57" + cel + "@tugarantia.net\"}', false); ";
  const mis = cel => JSON.parse(sql(comoLaSesion(cel) + 'select public.mis_fotos_del_registro()::text').split('\n').pop());
  const subir = (cel, archivos, huella) => JSON.parse(sql(comoLaSesion(cel) +
    'select public.registro_archivos_guardar(' + jb(archivos) + ', ' + jb(huella || {}) + ')::text').split('\n').pop());
  const FOTO = s => 'data:image/jpeg;base64,' + s;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-falta-cedula-'));
    puerto = 57600 + Math.floor(Math.random() * 380);
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
    /* El archivo nuevo, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      assert.doesNotMatch(r.stderr, /FALLA:/, r.stderr);
      const filas = r.stdout.trim().split(/\r?\n/).filter(l => /\|[tf]$/.test(l));
      assert.equal(filas.length, 6, 'la tabla final no salió entera: ' + r.stdout);
      filas.forEach(l => assert.match(l, /\|t$/, 'una comprobación salió en false: ' + l));
    });
    /* Y la de comprobar, aparte, también en true. */
    const c = archivo(path.join(RAIZ, 'base', 'comprobar_20261113_falta_tu_cedula.sql'));
    assert.equal(c.status, 0, c.stderr);
    const filas = c.stdout.trim().split(/\r?\n/).filter(l => /\|[tf]\|/.test(l));
    assert.equal(filas.length, 6, c.stdout);
    filas.forEach(l => assert.match(l, /\|t\|/, 'comprobar dice false: ' + l));
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('sin sesión: ok:false, sin nada más', () => {
    const j = JSON.parse(sql('select public.mis_fotos_del_registro()::text'));
    assert.deepEqual(j, { ok: false });
  });

  test('la llave pública no la puede llamar; la sesión sí', () => {
    assert.equal(sql("select has_function_privilege('anon', 'public.mis_fotos_del_registro()', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated', 'public.mis_fotos_del_registro()', 'execute')"), 't');
  });

  test('el caso del 8-nov: registro sin cédula y sin el permiso → las dos en false, sensibles:false', () => {
    const CEL = '3001110001';
    cuenta(CEL, '5 days', false);
    registro(CEL, '5 days');
    const j = mis(CEL);
    assert.equal(j.ok, true);
    assert.deepEqual(j.registro, { estado: 'nuevo', antes_de_la_camara: false, pasaporte: false });
    assert.deepEqual(j.fotos, { cedula_frente: false, cedula_reverso: false, selfie: false });
    assert.equal(j.cedula_con_codigo, false);
    assert.equal(j.sensibles, false);
    /* Y sin el permiso la subida no entra: por eso la app lo pide antes. */
    const r = subir(CEL, { cedula_frente: FOTO('FRENTE') });
    assert.equal(r.motivo, 'sin_autorizacion');
    assert.deepEqual(mis(CEL).fotos.cedula_frente, false);
  });

  test('la cédula subida días después, sin lectura del código, aparece; y no viaja ninguna imagen', () => {
    const CEL = '3001110002';
    cuenta(CEL, '4 days', true);
    registro(CEL, '4 days');
    /* Solo la selfie, como el registro del 8-nov. */
    assert.equal(subir(CEL, { selfie: FOTO('CARA') }).ok, true);
    let j = mis(CEL);
    assert.deepEqual(j.fotos, { cedula_frente: false, cedula_reverso: false, selfie: true });
    assert.equal(j.sensibles, true);
    /* Cuatro días después, desde la app: los dos lados, sin lectura. */
    const r = subir(CEL, { cedula_frente: FOTO('FRENTE'), cedula_reverso: FOTO('RESPALDO') });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.guardados.slice().sort(), ['cedula_frente', 'cedula_reverso']);
    j = mis(CEL);
    assert.deepEqual(j.fotos, { cedula_frente: true, cedula_reverso: true, selfie: true });
    assert.equal(j.cedula_con_codigo, false, 'sin lectura no hay documento en la foto');
    const texto = sql(comoLaSesion(CEL) + 'select public.mis_fotos_del_registro()::text').split('\n').pop();
    assert.equal(/base64|FRENTE|RESPALDO|CARA/.test(texto), false, 'viajó una imagen');
    /* Y es la misma fila que Joan trae al abrir la ficha. */
    const joan = JSON.parse(sql("select public.archivos_de_registro('clave-de-prueba-larga-123', '" + CEL + "')::text"));
    assert.ok(joan.fotos.cedula_frente && joan.fotos.cedula_reverso, 'el CRM no la ve');
  });

  test('con la lectura del código: cedula_con_codigo, y entonces una foto suelta no entra (por eso la app manda al chat)', () => {
    const CEL = '3001110003';
    cuenta(CEL, '2 days', true);
    registro(CEL, '2 days');
    const r = subir(CEL, { cedula_reverso: FOTO('RESPALDO') }, { cedula_leida: { documento: '52123456', nombres: 'PRUEBA', apellidos: '' } });
    assert.equal(r.ok, true, JSON.stringify(r));
    let j = mis(CEL);
    assert.deepEqual(j.fotos, { cedula_frente: false, cedula_reverso: true, selfie: false });
    assert.equal(j.cedula_con_codigo, true);
    /* El frente solo, sin lectura: la reja de 20261020 lo descarta. */
    const r2 = subir(CEL, { cedula_frente: FOTO('FRENTE') });
    assert.deepEqual(r2.descartados, ['cedula_frente']);
    j = mis(CEL);
    assert.equal(j.fotos.cedula_frente, false);
  });

  test('nada de otra cuenta: sus fotos y su registro no se ven', () => {
    const A = '3001110004', B = '3001110005';
    cuenta(A, '1 day', true); registro(A, '1 day');
    cuenta(B, '1 day', true); registro(B, '1 day', { tipo_doc: 'Pasaporte' });
    assert.equal(subir(B, { cedula_frente: FOTO('DE-B') }).ok, true);
    const a = mis(A);
    assert.deepEqual(a.fotos, { cedula_frente: false, cedula_reverso: false, selfie: false }, 'A ve las fotos de B');
    assert.equal(a.registro.pasaporte, false, 'A ve el registro de B');
    const b = mis(B);
    assert.equal(b.fotos.cedula_frente, true);
    assert.equal(b.registro.pasaporte, true);
  });

  test('el registro de antes de la cámara, y el de otra persona de antes de abrir la cuenta', () => {
    const VIEJO = '3001110006', AJENO = '3001110007';
    /* Cuenta y registro de agosto, antes del 9-sep: ese registro nunca pidió fotos. */
    sql('insert into auth.users (id, email, created_at, raw_user_meta_data) values (' + uid(VIEJO) + ", '57" + VIEJO +
        "@tugarantia.net', timestamptz '2026-08-20 10:00:00-05', '{}'::jsonb)");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, creado_en) values ('', '1', 'Viejo', '" + VIEJO +
        "', '{}'::jsonb, timestamptz '2026-08-20 10:05:00-05')");
    assert.equal(mis(VIEJO).registro.antes_de_la_camara, true);
    /* El número lo usó otra persona hace un mes; la cuenta se abrió hoy sin registro. */
    registro(AJENO, '30 days');
    cuenta(AJENO, '1 hour', true);
    const j = mis(AJENO);
    assert.equal(j.ok, true);
    assert.equal(j.registro, null, 'le habla del registro de otra persona');
  });
});
