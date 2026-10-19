/* ============================================================================
 * EL ESTIMADO VIAJA, CONTRA UN POSTGRESQL DE VERDAD — opcional. 19-oct-2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/el-estimado-viaja-postgres.test.js
 *
 * Sin TG_PG_BIN se salta, como las otras de PostgreSQL (de donde toma el mismo
 * andamio de Supabase). Con él: corre las migraciones de base/ en orden, las
 * del 7 y 8-oct, y base/20261019_el_estimado_viaja.sql DOS veces
 * (idempotente), y prueba LLAMANDO lo que la app de verdad va a llamar:
 *
 *   · lo que arma app/calculadora-solicitud.js (el módulo, no una copia) la
 *     base lo acepta, en todos los plazos y montos del barrido, y el CRM lo
 *     lee de vuelta en la bandeja de siempre;
 *   · un estimado inflado, de otro pedido, ajeno o repetido, no entra;
 *   · la llave pública no la puede llamar;
 *   · la autocomprobación del archivo y la consulta de comprobación, en true.
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
const CLAVE = "'clave-de-prueba-larga-123'";
const CS = require('../app/calculadora-solicitud.js');
const C = require('../app/creditos.js');
/* El techo de octubre, valga el día que se corra: lo que se prueba aquí es que
   la base acepta lo que arma el módulo, no que la tabla esté al día. */
const OCTUBRE = Object.assign({}, C, { topeVigente: () => C.TOPES.find(t => t.desde === '2026-10-01') });

describe('el estimado viaja con lo pedido, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
  let nConsulta = 0;
  /* La consulta va en un ARCHIVO y no en `-c`: en Windows los argumentos de la
     línea de comandos viajan en la página de códigos de la consola. */
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
  const hoyBase = () => sql("select to_char(public.hoy_bogota(), 'YYYY-MM-DD')");
  const lit = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  /* Lo que manda play/: estimadoParaEnviar, con el techo de octubre. */
  const delModulo = (monto, dias, hoy) => {
    const e = CS.estimadoDelCosto(monto, CS.fechaEn(dias, hoy), hoy, { creditos: OCTUBRE });
    return { version: e.version, capital: e.capital, fecha_pago: e.fecha_pago, costo: e.costo, total: e.total,
             tasa: e.tasa_mensual, ea: Math.round(e.ea * 1e6) / 1e6, techo: e.techo };
  };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-est-'));
    puerto = 54200 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]|^20261019/.test(f)).sort());
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
    archivo(path.join(RAIZ, 'base', '20261019_el_estimado_viaja.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261019_el_estimado_viaja.sql'), true);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la autocomprobación del archivo no dice FALLA, y corrió entera', () => {
    /* psql manda los NOTICE por stderr: se corre otra vez (la tercera) para leerlos. */
    const r = spawnSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg',
      '-v', 'ON_ERROR_STOP=1', '-1', '-f', path.join(RAIZ, 'base', '20261019_el_estimado_viaja.sql')], { encoding: 'utf8' });
    const notas = String(r.stderr || '');
    assert.doesNotMatch(notas, /FALLA/, notas);
    assert.match(notas, /Estimado: 1 no-pasa-el-2; 2 de-este-pedido; 3 anota; 4 una-vez; 5 pedir-otra-vez-lo-borra; 6 lo-ajeno-no; 7 con-propuesta-no;/, notas);
    assert.equal(r.status, 0, 'el archivo no corre limpio la tercera vez: ' + notas);
  });

  test('el caso de William: lo que arma el módulo entra, y el CRM lo lee en su bandeja', () => {
    sql("insert into auth.users (email, created_at) values ('573101910001@tugarantia.net', now())");
    const hoy = hoyBase();
    const p = CS.pedidoParaEnviar({ monto: 300000, dias: 30 }, hoy);
    const s = comoCuenta('3101910001', 'public.solicitar_a_la_medida(' + p.p_capital + ", '" + p.p_fecha_pago + "'::date, null)").solicitud;
    const est = delModulo(300000, 30, hoy);
    assert.equal(est.costo, 6000);
    const j = comoCuenta('3101910001', 'public.anotar_estimado(' + s.id + ', ' + lit(est) + ')');
    assert.equal(j.ok, true, JSON.stringify(j));
    const fila = json("select row_to_json(x) from public.listar_solicitudes_abiertas(" + CLAVE + ") x where x.id = " + s.id);
    assert.deepEqual(Object.keys(fila.pedido.estimado).sort(), ['costo', 'cuando', 'tasa', 'total', 'version']);
    assert.equal(fila.pedido.estimado.costo, 6000);
    assert.equal(fila.pedido.estimado.total, 306000);
    /* Y lo que el CRM hace con esa fila, con el mismo módulo. */
    assert.equal(CS.estimadoDeSolicitud(fila).costo, 6000);
    assert.equal(CS.avisoDelEstimado(60000, CS.estimadoDeSolicitud(fila)).aviso,
      'Tu propuesta ($60.000) es 10 veces lo que la app le estimó: dile por qué, o se va a sentir engañado.');
    /* Una segunda vez no lo reescribe. */
    assert.equal(comoCuenta('3101910001', 'public.anotar_estimado(' + s.id + ', ' + lit(est) + ')').ya_estaba, true);
  });

  test('barrido: todo lo que el módulo arma, la base lo deja pasar', () => {
    const hoy = hoyBase();
    const casos = [];
    [50000, 50250, 300000, 1000000, 20000000].forEach(m => [1, 7, 30, 61, 180].forEach(d => casos.push([m, d])));
    casos.forEach(([m, d], k) => {
      /* Una cuenta por cada cinco: pedir otra vez tiene techo de diez cambios. */
      const cel = '31019200' + String(Math.floor(k / 5)).padStart(2, '0');
      if (k % 5 === 0) sql("insert into auth.users (email, created_at) values ('57" + cel + "@tugarantia.net', now())");
      const p = CS.pedidoParaEnviar({ monto: m, dias: d }, hoy);
      const s = comoCuenta(cel, 'public.solicitar_a_la_medida(' + p.p_capital + ", '" + p.p_fecha_pago + "'::date, null)").solicitud;
      const j = comoCuenta(cel, 'public.anotar_estimado(' + s.id + ', ' + lit(delModulo(m, d, hoy)) + ')');
      assert.equal(j.ok, true, m + ' a ' + d + ' días: ' + JSON.stringify(j));
    });
  });

  test('lo que no entra: inflado, de otro pedido, ajeno, sin sesión, o con propuesta', () => {
    sql("insert into auth.users (email, created_at) values ('573101910003@tugarantia.net', now())");
    const hoy = hoyBase();
    const p = CS.pedidoParaEnviar({ monto: 300000, dias: 30 }, hoy);
    const s = comoCuenta('3101910003', 'public.solicitar_a_la_medida(' + p.p_capital + ", '" + p.p_fecha_pago + "'::date, null)").solicitud;
    const est = delModulo(300000, 30, hoy);
    const intento = (o, cel) => comoCuenta(cel || '3101910003', 'public.anotar_estimado(' + s.id + ', ' + lit(Object.assign({}, est, o)) + ')');
    assert.equal(intento({ costo: 60000, total: 360000 }).motivo, 'estimado', 'entró un estimado diez veces el 2%');
    assert.equal(intento({ total: 999999 }).motivo, 'estimado', 'entró un total que no es capital + costo');
    assert.equal(intento({ tasa: 0.2 }).motivo, 'estimado', 'entró una tasa por encima del 2%');
    assert.equal(intento({ costo: 'mucho' }).motivo, 'estimado');
    assert.equal(intento({ capital: 500000, total: 506000 }).motivo, 'otro_pedido');
    assert.equal(intento({ fecha_pago: CS.fechaEn(31, hoy) }).motivo, 'otro_pedido');
    sql("insert into auth.users (email, created_at) values ('573101910004@tugarantia.net', now())");
    assert.equal(intento({}, '3101910004').motivo, 'no_es_tuya', 'otra cuenta anotó en lo ajeno');
    assert.equal(json('select public.anotar_estimado(' + s.id + ', ' + lit(est) + ')').motivo, 'sesion');
    assert.equal(sql('select pedido ? \'estimado\' from public.solicitudes where id = ' + s.id), 'f', 'algo de lo de arriba sí se anotó');
    /* Con la propuesta de Joan ya no hay nada que estimar. */
    const pr = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + s.id + ", 300000, 20, 30, 'Te propongo esto')");
    assert.equal(pr.ok, true, JSON.stringify(pr));
    assert.equal(intento({}).motivo, 'no_aplica');
  });

  test('la llave pública no la puede llamar', () => {
    let err = '';
    try { sql("set role anon; select public.anotar_estimado(1, '{}'::jsonb)"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /permission denied|permiso denegado/i);
  });

  test('la consulta de comprobación sale toda en true', () => {
    const filas = sql(fs.readFileSync(path.join(RAIZ, 'base', '20261019b_el_estimado_comprobar.sql'), 'utf8')
      .replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''));
    const malas = filas.split('\n').filter(l => !/\|t\|/.test(l));
    assert.deepEqual(malas, [], filas);
  });
});
