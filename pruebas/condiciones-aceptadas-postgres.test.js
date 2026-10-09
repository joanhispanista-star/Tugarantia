/* ============================================================================
 * PEDIR A LA MEDIDA Y ACEPTAR LAS CONDICIONES, CONTRA UN POSTGRESQL DE VERDAD
 * — opcional. 8 de octubre de 2026.
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/condiciones-aceptadas-postgres.test.js
 *
 * Sin TG_PG_BIN se salta, como las otras dos de PostgreSQL (de donde toma el
 * mismo andamio de Supabase). Con él: corre todas las migraciones de base/ en
 * orden, las del 7-oct y después base/20261008_condiciones_aceptadas.sql DOS
 * veces (idempotente), y prueba LLAMANDO lo que la app de verdad va a llamar:
 *
 *   · pedir a la medida nace 'nueva', SIN propuesta automática, con la fecha
 *     y los días pedidos, y al cliente no se le devuelven `datos`;
 *   · pedir otra vez cambia lo pedido en la misma solicitud, no crea otra;
 *   · la propuesta que Joan pone con su clave (contrapropuesta_solicitud) se
 *     acepta solo con las cifras que la base tiene: otras → 'cambio';
 *   · lo aceptado queda en condiciones_aceptadas (que nadie lee desde afuera)
 *     y el resumen viaja en la solicitud, que es lo que lee el CRM;
 *   · si Joan vuelve a proponer, el resumen se va con la propuesta vieja;
 *   · la consulta de comprobación sale toda en true.
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
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = "'clave-de-prueba-larga-123'";

describe('pedir a la medida y aceptar las condiciones, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
  /* La consulta va en un ARCHIVO y no en `-c`: en Windows los argumentos de la
     línea de comandos viajan en la página de códigos de la consola, y una «é»
     llega a PostgreSQL como un byte que no es UTF-8. */
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
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = q => JSON.parse(sql(q));
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());
  const fechaEn = dias => sql("select to_char(public.hoy_bogota() + " + dias + ", 'YYYY-MM-DD')");

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-cond-'));
    puerto = 54600 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261007c_una_puerta_cierres.sql'), true);
    /* Dos veces: idempotente. */
    archivo(path.join(RAIZ, 'base', '20261008_condiciones_aceptadas.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261008_condiciones_aceptadas.sql'), true);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la autocomprobación del archivo no dice FALLA', () => {
    /* psql manda los NOTICE por stderr: se corre otra vez (la tercera) para leerlos. */
    const r = require('node:child_process').spawnSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg',
      '-v', 'ON_ERROR_STOP=1', '-1', '-f', path.join(RAIZ, 'base', '20261008_condiciones_aceptadas.sql')], { encoding: 'utf8' });
    const notas = String(r.stderr || '');
    assert.doesNotMatch(notas, /FALLA/, notas);
    assert.match(notas, /Condiciones: 1 piso; 2 fecha; 3 nace-nueva-sin-propuesta; 4 una-sola-abierta; 5 otra-cifra-no-acepta; 6 sin-texto-no-acepta; 7 lo-ajeno-no; 10 otra-fecha-no-acepta; 11 otra-propuesta-no-acepta; 8 acepta-y-anota; 9 solo-agregar;/, notas);
    assert.equal(r.status, 0, 'el archivo no corre limpio la tercera vez: ' + notas);
  });

  test('pedir a la medida: nace nueva, sin propuesta, con lo que pidió', () => {
    sql("insert into auth.users (email, created_at) values ('573101230001@tugarantia.net', now())");
    const j = comoCuenta('3101230001', "public.solicitar_a_la_medida(1500000, '" + fechaEn(37) + "'::date, 'surtir la tienda')");
    assert.equal(j.ok, true, JSON.stringify(j));
    const s = j.solicitud;
    assert.equal(s.estado, 'nueva');
    assert.equal(s.contrapropuesta, null, 'le puso una propuesta automática: eso lo hace Joan');
    assert.equal(s.pedido.origen, 'play');
    assert.equal(s.pedido.dias, 37);
    assert.equal(s.pedido.fecha_pago, fechaEn(37));
    assert.equal(Number(s.pedido_monto), 1500000);
    assert.equal(s.pedido_nota, 'surtir la tienda');
    assert.ok(!('datos' in s) && !('registro_id' in s) && !('responsable' in s), 'le devolvió campos que son de Joan');
    /* La lee como siempre: mi_solicitud la devuelve. */
    assert.equal(comoCuenta('3101230001', 'public.mi_solicitud()').solicitud.id, s.id);
  });

  test('cada rechazo dice por qué', () => {
    sql("insert into auth.users (email, created_at) values ('573101230002@tugarantia.net', now())");
    assert.equal(comoCuenta('3101230002', "public.solicitar_a_la_medida(10000, '" + fechaEn(10) + "'::date, null)").motivo, 'minimo');
    assert.equal(comoCuenta('3101230002', "public.solicitar_a_la_medida(25000000, '" + fechaEn(10) + "'::date, null)").motivo, 'maximo');
    assert.equal(comoCuenta('3101230002', "public.solicitar_a_la_medida(300000, '" + fechaEn(0) + "'::date, null)").motivo, 'fecha');
    assert.equal(comoCuenta('3101230002', "public.solicitar_a_la_medida(300000, '" + fechaEn(367) + "'::date, null)").motivo, 'fecha');
    /* Sin sesión no hay nada. */
    assert.equal(json('select public.solicitar_a_la_medida(300000, current_date + 5, null)').ok, false);
  });

  test('pedir otra vez cambia lo pedido en LA MISMA solicitud', () => {
    sql("insert into auth.users (email, created_at) values ('573101230003@tugarantia.net', now())");
    const a = comoCuenta('3101230003', "public.solicitar_a_la_medida(300000, '" + fechaEn(8) + "'::date, null)");
    const b = comoCuenta('3101230003', "public.solicitar_a_la_medida(450000, '" + fechaEn(15) + "'::date, null)");
    assert.equal(b.cambiada, true);
    assert.equal(b.solicitud.id, a.solicitud.id);
    assert.equal(Number(b.solicitud.pedido_monto), 450000);
    assert.equal(b.solicitud.pedido.dias, 15);
    assert.equal(sql("select count(*) from public.solicitudes where cedula = '3101230003'"), '1');
  });

  /* 8-oct-2026 (segunda vuelta): Y CON SU FECHA Y SU SELLO. La misma plata con
     otra fecha —Joan cambia los días mientras el cliente lee— se aceptaba: el
     costo de contrapropuesta_de no depende de los días, así que el total no
     cambia. Lo reprodujo la revisión de seguridad. */
  test('Joan propone con su clave, y se acepta SOLO con las cifras, la fecha y el sello de la base', () => {
    sql("insert into auth.users (email, created_at) values ('573101230004@tugarantia.net', now())");
    const s = comoCuenta('3101230004', "public.solicitar_a_la_medida(800000, '" + fechaEn(20) + "'::date, null)").solicitud;
    const p = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + s.id + ", 600000, 20, 15, 'Te podemos dar esto')");
    assert.equal(p.ok, true, JSON.stringify(p));
    const cp = p.solicitud.contrapropuesta;
    const vio = (total, texto, otro) => "'" + JSON.stringify(Object.assign({ version: '2026-10-08', capital: 600000, total,
      fecha_pago: cp.fecha_pago, creada_en: cp.creada_en,
      texto: texto == null ? 'Las condiciones de este crédito\n- Recibes: $600.000\n- Total a pagar: $720.000' : texto,
      lineas: [{ clave: 'recibes', k: 'Recibes', v: '$600.000' }] }, otro || {})) + "'::jsonb";

    const mal = comoCuenta('3101230004', 'public.aceptar_condiciones(' + s.id + ', ' + vio(cp.total + 1) + ')');
    assert.equal(mal.ok, false); assert.equal(mal.motivo, 'cambio');
    const otraFecha = comoCuenta('3101230004', 'public.aceptar_condiciones(' + s.id + ', ' +
      vio(cp.total, null, { fecha_pago: fechaEn(3) }) + ')');
    assert.equal(otraFecha.motivo, 'cambio', 'aceptó la misma plata con otra fecha de pago: ' + JSON.stringify(otraFecha));
    const otroSello = comoCuenta('3101230004', 'public.aceptar_condiciones(' + s.id + ', ' +
      vio(cp.total, null, { creada_en: '2026-01-01T00:00:00+00:00' }) + ')');
    assert.equal(otroSello.motivo, 'cambio', 'aceptó con el sello de otra propuesta');
    /* Sin fecha ni sello (una app vieja en caché) tampoco: no se sabe qué leyó. */
    const sinSello = comoCuenta('3101230004', 'public.aceptar_condiciones(' + s.id + ', ' +
      vio(cp.total, null, { fecha_pago: undefined, creada_en: undefined }) + ')');
    assert.equal(sinSello.motivo, 'cambio');
    assert.equal(sql('select estado from public.solicitudes where id = ' + s.id), 'contrapropuesta');

    /* Otra cuenta, con las cifras buenas, tampoco. */
    sql("insert into auth.users (email, created_at) values ('573101230005@tugarantia.net', now())");
    assert.equal(comoCuenta('3101230005', 'public.aceptar_condiciones(' + s.id + ', ' + vio(cp.total) + ')').ok, false);

    const bien = comoCuenta('3101230004', 'public.aceptar_condiciones(' + s.id + ', ' + vio(cp.total) + ')');
    assert.equal(bien.ok, true, JSON.stringify(bien));
    assert.equal(bien.solicitud.estado, 'aceptada');
    assert.equal(bien.solicitud.contrapropuesta.condiciones.version, '2026-10-08');
    /* Lo que tenía LA BASE, al lado de lo que dijo el teléfono (el CRM los compara). */
    assert.equal(bien.solicitud.contrapropuesta.condiciones.base.fecha_pago, cp.fecha_pago);
    assert.equal(Number(bien.solicitud.contrapropuesta.condiciones.base.total), cp.total);
    assert.equal(bien.solicitud.contrapropuesta.condiciones.lineas[0].v, '$600.000');
    assert.ok(!('datos' in bien.solicitud));

    /* Lo guardado: la oferta es la de la base, lo visto es lo que mandó. */
    const fila = json('select row_to_json(c) from public.condiciones_aceptadas c where solicitud_id = ' + s.id);
    assert.equal(Number(fila.oferta.total), cp.total);
    assert.match(fila.vio.texto, /Las condiciones de este crédito/);
    assert.equal(fila.celular, '3101230004');

    /* El CRM lo ve en la bandeja de siempre. */
    const bandeja = json("select json_agg(x) from public.listar_solicitudes_abiertas(" + CLAVE + ") x where x.id = " + s.id);
    assert.equal(bandeja[0].contrapropuesta.condiciones.version, '2026-10-08');

    /* Joan vuelve a proponer: lo aceptado de la vieja se va con ella. */
    const p2 = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + s.id + ", 500000, 20, 15, 'Otra')");
    assert.equal(p2.solicitud.estado, 'contrapropuesta');
    assert.equal(p2.solicitud.contrapropuesta.condiciones, undefined, 'la propuesta nueva arrastró la aceptación de la vieja');
    /* Pero el registro de lo aceptado se queda. */
    assert.equal(sql('select count(*) from public.condiciones_aceptadas where solicitud_id = ' + s.id), '1');
  });

  test('nadie lee condiciones_aceptadas desde afuera', () => {
    let err = '';
    try { sql("set role authenticated; select count(*) from public.condiciones_aceptadas"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /permission denied|permiso denegado/i, 'una sesión cualquiera lee lo que aceptaron todos');
    err = '';
    try { sql("set role anon; select count(*) from public.condiciones_aceptadas"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /permission denied|permiso denegado/i);
  });

  test('la consulta de comprobación sale toda en true', () => {
    const filas = sql(fs.readFileSync(path.join(RAIZ, 'base', '20261008b_condiciones_comprobar.sql'), 'utf8')
      .replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''));
    const malas = filas.split('\n').filter(l => !/\|t\|/.test(l));
    assert.deepEqual(malas, [], filas);
  });
});
