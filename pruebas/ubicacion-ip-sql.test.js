/* ============================================================================
 * base/20261008_ubicacion_por_ip.sql — la ubicación aproximada, anotada
 * 8 de octubre de 2026.
 *
 *   node --test pruebas/ubicacion-ip-sql.test.js
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/ubicacion-ip-sql.test.js
 *
 * La primera mitad lee el archivo (siempre corre): lo que esta casa ya pagó
 * caro una vez —una función stable que escribe, un permiso que Supabase
 * regala, una excepción al final que deshace todo— no puede estar.
 *
 * La segunda, con TG_PG_BIN, lo corre DOS veces contra un PostgreSQL de tirar
 * y LLAMA a la función: anota, limpia, compara la IP, y no abre a nadie más.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261008_ubicacion_por_ip.sql';
const CRUDO = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
/* Lo que se EJECUTA: sin comentarios (un centinela que lee prosa se caza a sí mismo). */
const CODIGO = CRUDO.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const FIRMA = 'public.anotar_ubicacion_ip(text, bigint, jsonb)';

describe('lo que el archivo dice (siempre corre)', () => {

  test('UNA función nueva, ninguna tabla, nada que se tire', () => {
    const creadas = [...CODIGO.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
    assert.deepEqual(creadas, ['anotar_ubicacion_ip']);
    assert.ok(!/create\s+table/i.test(CODIGO), 'crea una tabla: esto solo anota en una que ya existe');
    assert.ok(!/\bdrop\s+(function|table|view|column)/i.test(CODIGO));
    assert.match(CODIGO, /create or replace function public\.anotar_ubicacion_ip\(p_clave text, p_id bigint, p_ubicacion jsonb\)/);
  });

  test('ninguna otra migración tiene una función con ese nombre (sería una sobrecarga)', () => {
    const otras = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /\.sql$/.test(f) && f !== NOMBRE)
      .map(f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8')).join('\n');
    assert.ok(!/function public\.anotar_ubicacion_ip\b/.test(otras));
  });

  test('security definer con search_path, y volátil (pasa por clave_ok, que escribe)', () => {
    const cabeza = CODIGO.slice(CODIGO.indexOf('create or replace function public.anotar_ubicacion_ip'), CODIGO.indexOf('as $$', CODIGO.indexOf('anotar_ubicacion_ip')));
    assert.match(cabeza, /security definer/);
    assert.match(cabeza, /set search_path = public/);
    assert.ok(!/\b(stable|immutable)\b/.test(cabeza), 'stable: PostgREST la correría en solo lectura y no serviría nunca');
  });

  test('la clave primero, con la espera de siempre', () => {
    const cuerpo = CODIGO.slice(CODIGO.indexOf('as $$', CODIGO.indexOf('anotar_ubicacion_ip')));
    assert.ok(cuerpo.indexOf('public.clave_ok(p_clave)') < cuerpo.indexOf('update public.registros'));
    assert.match(cuerpo, /perform pg_sleep\(1\)/);
  });

  test('compara la IP, bloquea la fila, y la fecha la pone la base', () => {
    assert.match(CODIGO, /for update/);
    assert.match(CODIGO, /v_dice <> v_ip/);
    assert.match(CODIGO, /'consultada',\s+to_char\(now\(\) at time zone 'America\/Bogota'/);
    assert.match(CODIGO, /jsonb_build_object\('ubicacion_ip', v_u\)/);
  });

  test('los permisos: se revoca de los TRES por nombre y se da solo a anon', () => {
    assert.match(CODIGO, new RegExp('revoke all on function ' + FIRMA.replace(/[().]/g, '\\$&') + ' from public, anon, authenticated;'));
    assert.match(CODIGO, new RegExp('grant\\s+execute on function ' + FIRMA.replace(/[().]/g, '\\$&') + ' to anon;'));
    assert.ok(!/to\s+authenticated/.test(CODIGO), 'una sesión de cliente podría escribir ubicaciones');
  });

  test('la comprobación del final solo avisa: una excepción ahí desharía todo', () => {
    const final = CODIGO.slice(CODIGO.lastIndexOf('do $$'));
    assert.ok(!/raise\s+exception/i.test(final));
    assert.match(final, /raise notice/);
  });

  test('el CRM y la revisión la llaman con los mismos nombres de parámetro', () => {
    const crm = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const rev = fs.readFileSync(path.join(RAIZ, 'panel', 'revision.html'), 'utf8');
    assert.match(crm, /rpc\('anotar_ubicacion_ip',\{p_clave:sbCfg\(\)\.clave,p_id:Number\(r\.id\),p_ubicacion:u\}\)/);
    assert.match(rev, /rpc\('anotar_ubicacion_ip', \{ p_clave: sbCfg\(\)\.clave, p_id: Number\(r\.id\), p_ubicacion: u \}\)/);
  });
});

/* ------------------------------------------------ con un PostgreSQL de verdad */
const BIN = process.env.TG_PG_BIN || '';
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = "'clave-de-prueba-larga-123'";

describe('anotar_ubicacion_ip en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
  const sql = (consulta, db) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  const archivo = (f, una) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = q => JSON.parse(sql(q));
  /* En Windows lo que va en la línea de comandos de psql pasa por la página de
     códigos de la consola y una tilde llega rota: lo que no es ASCII viaja
     como \uXXXX dentro del JSON, que PostgreSQL entiende igual. */
  const ascii = s => s.replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const anotar = (id, u) => json('select public.anotar_ubicacion_ip(' + CLAVE + ', ' + id + ", '" + ascii(JSON.stringify(u)).replace(/'/g, "''") + "'::jsonb)");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-ip-'));
    puerto = 55900 + Math.floor(Math.random() * 90);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    /* Solo lo que la función necesita: la tabla, clave_ok y la columna. */
    archivo(path.join(RAIZ, 'base', 'supabase.sql'), true);
    sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    archivo(path.join(RAIZ, 'base', NOMBRE), true);
    archivo(path.join(RAIZ, 'base', NOMBRE), true);   // dos veces: idempotente
    sql("insert into public.registros (codigo, cedula, nombre, telefono, huella) values "
      + "('', '52000000', 'Ana', '3001112222', '{\"ip\":\"181.1.1.1, 10.0.0.1\",\"aparato\":\"x\"}'), "
      + "('', '52000001', 'Beto', '3001113333', null)");
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  const ANA = () => sql("select id from public.registros where nombre = 'Ana'");

  test('anota en la huella, limpia los textos y pone la fecha ella', () => {
    const j = anotar(ANA(), { ip: '181.1.1.1', ciudad: 'Bo\u0001gotá ', region: 'Distrito Capital de Bogotá', pais: 'Colombia',
      codigo_pais: 'co', red: 'COMCEL', fuente: 'ipwho.is', consultada: '1999-01-01', extra: 'no se guarda' });
    assert.equal(j.ok, true);
    assert.equal(j.ubicacion_ip.ciudad, 'Bo gotá');
    assert.equal(j.ubicacion_ip.codigo_pais, 'CO');
    assert.notEqual(j.ubicacion_ip.consultada, '1999-01-01', 'la fecha la puso quien llama');
    assert.equal(j.ubicacion_ip.extra, undefined);
    const h = json("select huella from public.registros where nombre = 'Ana'");
    assert.equal(h.ip, '181.1.1.1, 10.0.0.1', 'se perdió la IP de la huella');
    assert.equal(h.aparato, 'x');
    assert.equal(h.ubicacion_ip.ciudad, 'Bo gotá');
  });

  test('la de OTRA IP no se anota', () => {
    const antes = sql("select huella::text from public.registros where nombre = 'Ana'");
    assert.equal(anotar(ANA(), { ip: '186.2.2.2', ciudad: 'Soacha' }).motivo, 'otra_ip');
    assert.equal(sql("select huella::text from public.registros where nombre = 'Ana'"), antes);
  });

  test('sin lugar, sin registro o sin huella: no anota y dice por qué', () => {
    assert.equal(anotar(ANA(), { ip: '181.1.1.1', red: 'x' }).motivo, 'sin_lugar');
    assert.equal(anotar(999999, { ip: '181.1.1.1', ciudad: 'Bogotá' }).motivo, 'no_existe');
    const beto = sql("select id from public.registros where nombre = 'Beto'");
    assert.equal(anotar(beto, { ip: '181.1.1.1', ciudad: 'Bogotá' }).motivo, 'otra_ip');
  });

  test('con una clave mala revienta, y no anota', () => {
    assert.throws(() => sql("select public.anotar_ubicacion_ip('mala', " + ANA() + ", '{\"ip\":\"181.1.1.1\",\"ciudad\":\"Cali\"}')"));
    assert.equal(json("select huella from public.registros where nombre = 'Ana'").ubicacion_ip.ciudad, 'Bo gotá');
  });

  test('anon la llama; una sesión de cliente no; y es security definer', () => {
    assert.equal(sql("select has_function_privilege('anon', '" + FIRMA + "', 'execute')"), 't');
    assert.equal(sql("select has_function_privilege('authenticated', '" + FIRMA + "', 'execute')"), 'f');
    assert.equal(sql("select prosecdef from pg_proc where oid = to_regprocedure('" + FIRMA + "')"), 't');
  });
});
