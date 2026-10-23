/* ============================================================================
 * A DÓNDE SE CONSIGNA, EN LA BASE — 22 de octubre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/destino-del-desembolso-postgres.test.js
 *
 * base/20261022b_destino_del_desembolso.sql trae aceptar_con_destino: la
 * aceptación de siempre y la cuenta elegida, en una sola transacción. Esta
 * prueba monta un PostgreSQL con las migraciones de base/ (el andamio de
 * pruebas/condiciones-aceptadas-postgres.test.js), corre el archivo nuevo DOS
 * veces (idempotente) y llama lo que la app llama:
 *
 *   · un destino que no sirve no acepta NADA (la solicitud sigue esperando);
 *   · otra cuenta no acepta ni escribe destino en lo ajeno;
 *   · aceptada, el destino ya no se cambia (ni con la misma función);
 *   · el destino lleva el sello de la propuesta: si Joan vuelve a proponer,
 *     el de la vieja ya no coincide, y aceptar la nueva lo reemplaza;
 *   · aceptar_condiciones (la app publicada) sigue aceptando, sin destino;
 *   · las reglas de la base dicen lo mismo que app/cuentas-pago.js.
 *
 * Sin TG_PG_BIN se salta la parte de PostgreSQL; lo que lee el archivo corre
 * siempre. Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const CP = require('../app/cuentas-pago.js');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261022b_destino_del_desembolso.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = "'clave-de-prueba-larga-123'";

/* Los casos que las dos reglas (la del teléfono y la de la base) tienen que
   contestar igual. `null` = no sirve. */
const CASOS = [
  [{ medio: 'nequi', numero: '300 111 2233', es_mia: true }, '3001112233'],
  [{ medio: 'nequi', numero: '+57 300 111 2233', es_mia: true }, '3001112233'],
  [{ medio: 'daviplata', numero: '3101234567', es_mia: true }, '3101234567'],
  [{ medio: 'daviplata', numero: '6011234567', es_mia: true }, null],
  [{ medio: 'nequi', numero: '300111223', es_mia: true }, null],
  [{ medio: 'nequi', numero: '3001112233', es_mia: false }, null],
  [{ medio: 'nequi', numero: '3001112233' }, null],
  [{ medio: 'breb', llave: '@MARIA123', es_mia: true }, '@MARIA123'],
  [{ medio: 'breb', llave: '@abc', es_mia: true }, null],
  [{ medio: 'breb', llave: '@María12', es_mia: true }, null],
  [{ medio: 'breb', llave: '@' + 'A'.repeat(21), es_mia: true }, null],
  [{ medio: 'breb', llave: 'maria.perez@gmail.com', es_mia: true }, 'maria.perez@gmail.com'],
  [{ medio: 'breb', llave: 'a'.repeat(31) + '@gmail.com', es_mia: true }, null],
  [{ medio: 'breb', llave: 'maria@gmail', es_mia: true }, null],
  [{ medio: 'breb', llave: 'ma ria@gmail.com', es_mia: true }, null],
  [{ medio: 'breb', llave: '52.123.456', es_mia: true }, '52123456'],
  [{ medio: 'breb', llave: '+57 300 111 2233', es_mia: true }, '3001112233'],
  [{ medio: 'breb', llave: 'AB1234567', es_mia: true }, 'AB1234567'],
  [{ medio: 'breb', llave: '1'.repeat(19), es_mia: true }, null],
  [{ medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', numero: '123-456-789', es_mia: true }, '123456789'],
  [{ medio: 'banco', banco: 'Coomultrasan', banco_codigo: 'otro', banco_tipo: 'Corriente', numero: '1234567890', es_mia: true }, '1234567890'],
  [{ medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', numero: '12345', es_mia: true }, null],
  [{ medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', numero: '1'.repeat(21), es_mia: true }, null],
  [{ medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Nómina', numero: '123456789', es_mia: true }, null],
  [{ medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', numero: '12AB56789', es_mia: true }, null],
  [{ medio: 'tarjeta', numero: '4111111111111111', es_mia: true }, null]
];
const valorDe = d => d ? (d.medio === 'breb' ? d.llave : d.numero) : null;

describe('el archivo de la migración', () => {
  test('no copia ni sobrecarga la aceptación de la app publicada', () => {
    const codigo = SQL.replace(/--[^\n]*/g, '');
    assert.equal(/function\s+public\.aceptar_condiciones\s*\(/i.test(codigo), false, 'reescribe aceptar_condiciones');
    assert.equal(/function\s+public\.aceptar_contrapropuesta\s*\(/i.test(codigo), false);
    assert.equal(/function\s+public\.aceptar_propuesta_platachat\s*\(/i.test(codigo), false);
    assert.match(codigo, /create or replace function public\.aceptar_con_destino\(p_id bigint, p_vio jsonb, p_destino jsonb\)/);
    assert.match(codigo, /res := public\.aceptar_condiciones\(p_id, p_vio\);/, 'no pasa por la aceptación de siempre');
    assert.match(codigo, /add column if not exists destino_desembolso jsonb/);
  });

  test('los permisos: se le quitan a todos y solo la sesión acepta', () => {
    assert.match(SQL, /revoke all on function public\.destino_desembolso_limpio\(jsonb\) from public, anon, authenticated;/);
    assert.match(SQL, /revoke all on function public\.aceptar_con_destino\(bigint, jsonb, jsonb\) from public, anon, authenticated;/);
    assert.match(SQL, /grant\s+execute on function public\.aceptar_con_destino\(bigint, jsonb, jsonb\) to authenticated;/);
    assert.equal(/grant[^;]*destino_desembolso_limpio/.test(SQL), false, 'las reglas quedaron abiertas a alguien');
    assert.equal(/to anon/.test(SQL.replace(/--[^\n]*/g, '')), false, 'algo quedó para anon');
  });

  test('termina con una consulta que devuelve renglones (el editor de Supabase no muestra los NOTICE)', () => {
    const cola = SQL.slice(SQL.lastIndexOf('5. ¿QUEDÓ?'));
    assert.match(cola, /select 1 as n, '[^']+' as que,/);
    assert.match(cola, /order by 1;\s*$/);
    assert.equal(/\b(insert|update|delete)\b/i.test(cola.replace(/--[^\n]*/g, '')), false, 'la comprobación cambia datos');
  });
});

describe('a dónde se consigna, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
  let nConsulta = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++nConsulta) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const json = q => JSON.parse(sql(q));
  const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());
  const fechaEn = dias => sql("select to_char(public.hoy_bogota() + " + dias + ", 'YYYY-MM-DD')");
  const NEQUI = { medio: 'nequi', numero: '3101230001', es_mia: true };

  /* Una solicitud con propuesta de Joan, lista para aceptar, y lo que el
     teléfono manda como «lo que vio». */
  function conPropuesta(cel) {
    sql("insert into auth.users (email, created_at) values ('57" + cel + "@tugarantia.net', now())");
    const s = comoCuenta(cel, "public.solicitar_a_la_medida(800000, '" + fechaEn(20) + "'::date, null)").solicitud;
    const p = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + s.id + ", 600000, 20, 15, 'Te podemos dar esto')");
    assert.equal(p.ok, true, JSON.stringify(p));
    return { id: s.id, cp: p.solicitud.contrapropuesta };
  }
  const vio = cp => jb({ version: '2026-10-08', capital: 600000, total: cp.total, fecha_pago: cp.fecha_pago, creada_en: cp.creada_en,
    texto: 'Las condiciones de este crédito\n- Recibes: $600.000\n- Total a pagar: $720.000',
    lineas: [{ clave: 'recibes', k: 'Recibes', v: '$600.000' }] });
  const aceptar = (cel, id, cp, destino) =>
    comoCuenta(cel, 'public.aceptar_con_destino(' + id + ', ' + vio(cp) + ', ' + jb(destino) + ')');
  const fila = id => json('select row_to_json(s) from public.solicitudes s where id = ' + id);

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-destino-'));
    puerto = 57200 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && f !== NOMBRE).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261007c_una_puerta_cierres.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261008_condiciones_aceptadas.sql'), true);
    /* Dos veces: idempotente. */
    archivo(path.join(RAIZ, 'base', NOMBRE), true);
    archivo(path.join(RAIZ, 'base', NOMBRE), true);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la tabla del final sale toda en true (la que ve Joan en el editor)', () => {
    /* psql en Windows termina cada renglón con \r\n. */
    const filas = sql(fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8')).split(/\r?\n/).filter(l => /^\d+\|/.test(l));
    assert.equal(filas.length, 10, filas.join('\n'));
    const malas = filas.filter(l => !/\|t$/.test(l));
    assert.deepEqual(malas, [], filas.join('\n'));
  });

  test('las reglas de la base dicen lo mismo que las del teléfono', () => {
    for (const [d, espera] of CASOS) {
      const js = CP.revisarDestino(d);
      const pg = json('select coalesce(public.destino_desembolso_limpio(' + jb(d) + "), 'null'::jsonb)");
      assert.equal(js.ok ? valorDe(js.destino) : null, espera, 'el teléfono: ' + JSON.stringify(d) + ' → ' + JSON.stringify(js));
      assert.equal(valorDe(pg), espera, 'la base: ' + JSON.stringify(d) + ' → ' + JSON.stringify(pg));
      if (js.ok) assert.deepEqual(pg, js.destino, 'las dos limpian distinto: ' + JSON.stringify(d));
    }
  });

  test('un destino que no sirve no acepta NADA, y otra cuenta no toca lo ajeno', () => {
    const { id, cp } = conPropuesta('3101230001');
    const mal = aceptar('3101230001', id, cp, { medio: 'nequi', numero: '12345', es_mia: true });
    assert.equal(mal.ok, false); assert.equal(mal.motivo, 'destino');
    const sinMia = aceptar('3101230001', id, cp, { medio: 'nequi', numero: '3101230001' });
    assert.equal(sinMia.motivo, 'destino', 'aceptó con una cuenta que el cliente no dijo que fuera suya');
    assert.equal(fila(id).estado, 'contrapropuesta', 'con el destino malo la solicitud quedó aceptada sin cuenta');
    assert.equal(sql('select count(*) from public.condiciones_aceptadas where solicitud_id = ' + id), '0');

    sql("insert into auth.users (email, created_at) values ('573101230099@tugarantia.net', now())");
    const ajena = aceptar('3101230099', id, cp, { medio: 'nequi', numero: '3101230099', es_mia: true });
    assert.equal(ajena.ok, false, 'otra cuenta aceptó lo ajeno: ' + JSON.stringify(ajena));
    assert.equal(fila(id).destino_desembolso, null, 'otra cuenta le puso su Nequi a la solicitud ajena');
  });

  test('acepta y guarda la cuenta en la MISMA transacción, con el sello de la propuesta', () => {
    const { id, cp } = conPropuesta('3101230002');
    const r = aceptar('3101230002', id, cp, { medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7',
      banco_tipo: 'Ahorros', numero: '123-456-789', es_mia: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.solicitud.estado, 'aceptada');
    assert.equal(r.solicitud.destino_desembolso.numero, '123456789');
    assert.equal(r.solicitud.destino_desembolso.propuesta, cp.creada_en);
    assert.ok(r.solicitud.destino_desembolso.elegido_en);
    assert.ok(!('datos' in r.solicitud) && !('registro_id' in r.solicitud) && !('responsable' in r.solicitud));
    /* La constancia de siempre quedó, y la bandeja de Joan la ve con la cuenta. */
    assert.equal(sql('select count(*) from public.condiciones_aceptadas where solicitud_id = ' + id), '1');
    const bandeja = json('select json_agg(x) from public.listar_solicitudes_abiertas(' + CLAVE + ') x where x.id = ' + id);
    assert.equal(bandeja[0].destino_desembolso.banco, 'Bancolombia');
    assert.equal(bandeja[0].destino_desembolso.banco_tipo, 'Ahorros');
  });

  test('aceptada, la cuenta ya no se cambia; y desembolsada, menos', () => {
    const { id, cp } = conPropuesta('3101230003');
    assert.equal(aceptar('3101230003', id, cp, NEQUI).ok, true);
    const otra = aceptar('3101230003', id, cp, { medio: 'daviplata', numero: '3209998877', es_mia: true });
    assert.equal(otra.ok, false, 'cambió la cuenta de una solicitud ya aceptada');
    assert.equal(fila(id).destino_desembolso.medio, 'nequi');
    sql("update public.solicitudes set estado = 'atendida' where id = " + id);
    assert.equal(aceptar('3101230003', id, cp, { medio: 'daviplata', numero: '3209998877', es_mia: true }).ok, false);
    assert.equal(fila(id).destino_desembolso.numero, '3101230001');
  });

  test('si Joan vuelve a proponer, la cuenta de la vieja ya no es la de la nueva; aceptar la nueva la reemplaza', () => {
    const { id, cp } = conPropuesta('3101230004');
    assert.equal(aceptar('3101230004', id, cp, NEQUI).ok, true);
    const p2 = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + id + ", 500000, 20, 15, 'Otra')");
    const cp2 = p2.solicitud.contrapropuesta;
    assert.equal(p2.solicitud.estado, 'contrapropuesta');
    assert.notEqual(p2.solicitud.destino_desembolso.propuesta, cp2.creada_en,
      'la cuenta de la propuesta vieja pasa por la de la nueva');
    const vio2 = jb({ version: '2026-10-08', capital: 500000, total: cp2.total, fecha_pago: cp2.fecha_pago, creada_en: cp2.creada_en,
      texto: 'Las condiciones de este crédito\n- Recibes: $500.000\n- Total a pagar: $600.000', lineas: [] });
    const r = comoCuenta('3101230004', 'public.aceptar_con_destino(' + id + ', ' + vio2 + ', ' +
      jb({ medio: 'breb', llave: '@NEQUIMARIA1', es_mia: true }) + ')');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.solicitud.destino_desembolso.llave, '@NEQUIMARIA1');
    assert.equal(r.solicitud.destino_desembolso.propuesta, cp2.creada_en);
  });

  test('la app publicada (aceptar_condiciones) sigue aceptando, sin cuenta', () => {
    const { id, cp } = conPropuesta('3101230005');
    const r = comoCuenta('3101230005', 'public.aceptar_condiciones(' + id + ', ' + vio(cp) + ')');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(fila(id).destino_desembolso, null);
  });

  test('sin sesión no se acepta, y las reglas no se llaman desde afuera', () => {
    let err = '';
    try { sql("set role anon; select public.aceptar_con_destino(1, '{}'::jsonb, '{}'::jsonb)"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /permission denied|permiso denegado/i, 'anon puede llamar aceptar_con_destino');
    err = '';
    try { sql("set role authenticated; select public.destino_desembolso_limpio('{}'::jsonb)"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /permission denied|permiso denegado/i);
    /* Con sesión pero sin cuenta (sin celular en el token): la reja de siempre. */
    const r = json("select public.aceptar_con_destino(1, '{}'::jsonb, " + jb(NEQUI) + ')');
    assert.equal(r.ok, false);
  });
});
