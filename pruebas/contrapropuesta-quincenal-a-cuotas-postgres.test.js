/* ============================================================================
 * LA PROPUESTA QUINCENAL A CUOTAS, EN LA BASE — 13 de noviembre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/contrapropuesta-quincenal-a-cuotas-postgres.test.js
 *
 * NO SE CORRE CON JOAN EN EL PC: levanta un PostgreSQL. La corre quien
 * orquesta, de noche (escrita el 13-nov y todavía no corrida).
 *
 * base/20261113b_propuesta_quincenal_a_cuotas.sql, en un PostgreSQL con todas
 * las migraciones de base/ en orden (el andamio de Supabase de las otras
 * pruebas de PostgreSQL), corrida DOS veces, y llamando lo que llaman el CRM y
 * la app:
 *
 *   · la tabla del final y la de comprobar, todas sus filas en true;
 *   · con la clave equivocada, error (y no se escribe nada);
 *   · el cliente pide a la medida (solicitar_a_la_medida), Joan le propone a
 *     cuotas con las cifras del MOTOR (app/motor.js, construirPlanACuotas) y la
 *     base las guarda tal cual, con producto 'quincenal' y fecha_pago = la
 *     última cuota;
 *   · el cliente la ve (mi_solicitud) y la acepta (aceptar_condiciones) con lo
 *     que arma app/calculadora-solicitud.js; la constancia guarda las cuotas y
 *     la bandeja de Joan (listar_solicitudes_abiertas) la trae;
 *   · las rejas: 1 y 7 cuotas, la primera ayer, la última a 187 días (186
 *     sí), el 51 %, un peso de más en un costo, capitales que no suman, y el
 *     redondeo del motor (10.250 al 35 % son 3.587, no 3.588);
 *   · volver a proponer sobre una aceptada la deja otra vez esperando, sin la
 *     aceptación vieja; una solicitud cerrada no se toca.
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre). Con la
 * base de 9ac0aff (sin el archivo) todas las de PostgreSQL fallan: la función
 * no existe.
 * Los celulares y los nombres son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const M = require('../app/motor.js');
const CS = require('../app/calculadora-solicitud.js');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const NOMBRE = '20261113b_propuesta_quincenal_a_cuotas.sql';
const COMPROBAR_NOMBRE = 'comprobar_20261113b_propuesta_quincenal_a_cuotas.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const COMPROBAR = fs.readFileSync(path.join(RAIZ, 'base', COMPROBAR_NOMBRE), 'utf8');
const CLAVE = "'clave-de-prueba-larga-123'";
const sinComentarios = t => t.replace(/--[^\n]*/g, '');

/* Lo que manda el CRM (cuerpoDeQuincenalACuotas en panel/crm.html), armado
   con el motor de verdad. */
function cuerpoDelMotor(capital, cuotas, desembolso, texto) {
  const plan = M.construirPlanACuotas(capital, cuotas, { fechaDesembolso: desembolso });
  return { capital: plan.total_capital, costo: plan.total_costo, total: plan.total_a_pagar,
    cuotas: plan.cuotas.map(q => ({ numero: q.numero, fecha: q.fecha_corte, pct: q.pct,
      capital: q.capital, costo: q.costo, total: q.total })),
    texto: texto || '' };
}

describe('el archivo de la migración', () => {
  test('crea DOS funciones nuevas y no reescribe ninguna de las que ya viven', () => {
    const creadas = [...sinComentarios(SQL).matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map(m => m[1]);
    assert.deepEqual(creadas, ['propuesta_quincenal_a_cuotas_revisar', 'contrapropuesta_quincenal_a_cuotas']);
    assert.equal(/\b(alter\s+table|drop\s+function|create\s+table)\b/i.test(sinComentarios(SQL)), false);
  });

  test('la de Joan: la llave pública con su clave; la revisión, nadie de afuera', () => {
    const t = sinComentarios(SQL);
    assert.match(t, /revoke all on function public\.contrapropuesta_quincenal_a_cuotas\(text, bigint, jsonb\) from public, anon, authenticated;/);
    assert.match(t, /grant\s+execute on function public\.contrapropuesta_quincenal_a_cuotas\(text, bigint, jsonb\) to anon;/);
    assert.match(t, /revoke all on function public\.propuesta_quincenal_a_cuotas_revisar\(jsonb, date\) from public, anon, authenticated;/);
    assert.equal(/grant[^;]*propuesta_quincenal_a_cuotas_revisar/.test(t), false, 'alguien de afuera puede llamar la revisión');
    assert.equal(/grant[^;]*contrapropuesta_quincenal_a_cuotas[^;]*authenticated/.test(t), false, 'una sesión de cliente se cambiaría su propuesta');
  });

  test('volátil, security definer, search_path fijo, y la clave antes que nada', () => {
    const t = sinComentarios(SQL);
    const i = t.indexOf('create or replace function public.contrapropuesta_quincenal_a_cuotas');
    const cabeza = t.slice(i, t.indexOf('as $$', i));
    assert.match(cabeza, /^\s*volatile\s*$/m);
    assert.match(cabeza, /security definer/);
    assert.match(cabeza, /set search_path = public/);
    const cuerpo = t.slice(t.indexOf('as $$', i), t.indexOf('$$;', t.indexOf('as $$', i)));
    const clave = cuerpo.indexOf('public.clave_ok(p_clave)');
    assert.ok(clave > 0 && clave < cuerpo.indexOf('propuesta_quincenal_a_cuotas_revisar') && clave < cuerpo.indexOf('update public.solicitudes'));
    /* Los mismos estados y la misma regla sobre la aceptación anterior que
       contrapropuesta_solicitud y contrapropuesta_a_cuotas. */
    assert.match(cuerpo, /where id = p_id and estado in \('nueva', 'contrapropuesta', 'aceptada'\)/);
    assert.match(cuerpo, /estado\s+= 'contrapropuesta',\s+aceptada_en = null,/);
    assert.match(cuerpo, /producto\s+= 'quincenal'/);
    assert.match(cuerpo, /fecha_corte = v_ult/);
    assert.match(cuerpo, /'fecha_pago', to_char\(v_ult, 'YYYY-MM-DD'\)/);
    assert.match(cuerpo, /v_hoy := public\.hoy_bogota\(\);/);
    /* PlataChat, como contrapropuesta_solicitud: resuelta_en y el mensaje en Créditos. */
    assert.match(cuerpo, /resuelta_en = case when app = 'platachat' then now\(\) else resuelta_en end/);
    assert.match(cuerpo, /if s\.app = 'platachat' then[\s\S]*insert into public\.mensajes[\s\S]*'creditos'\);/);
  });

  test('los límites son los del motor (los que valen al desembolsar) y el redondeo también', () => {
    const t = sinComentarios(SQL);
    const i = t.indexOf('create or replace function public.propuesta_quincenal_a_cuotas_revisar');
    const cuerpo = t.slice(i, t.indexOf('$$;', t.indexOf('as $$', i)));
    assert.match(cuerpo, new RegExp('if v_n < ' + M.CUOTAS_ALTA_MIN + ' or v_n > ' + M.CUOTAS_ALTA_MAX + ' then'));
    assert.match(cuerpo, new RegExp('if f_ant - p_hoy > ' + M.DIAS_ALTA_MAX + ' then'));
    assert.match(cuerpo, new RegExp('v_pct < 1 or v_pct > ' + Math.round(M.TASA_CREDITO_MAXIMA * 100) + ' then'));
    /* El monto, el mismo rango de contrapropuesta_solicitud. */
    assert.match(cuerpo, /v_capital < 10000 or v_capital > 20000000/);
    /* La cuenta del motor: doble precisión y floor(x + 0,5), no round() de numeric. */
    assert.match(cuerpo, /v_motor := floor\(saldo::float8 \* \(v_pct::float8 \/ 100::float8\) \+ 0\.5::float8\)::bigint;/);
    assert.match(cuerpo, /v_techo := floor\(saldo::float8 \* \(50::float8 \/ 100::float8\) \+ 0\.5::float8\)::bigint;/);
    assert.equal(/\bround\s*\(/.test(cuerpo), false, 'round() de numeric redondea distinto que el motor (10.250 al 35 %)');
    /* Y la primera fecha contra hoy en Bogotá (p_hoy), no contra current_date. */
    assert.equal(/current_date/.test(cuerpo), false);
    assert.match(cuerpo, /if f_ant is null and f < p_hoy then/);
  });

  test('el paso 0 para si falta lo de antes, y termina en la tabla que Joan ve (8 filas, las mismas de comprobar)', () => {
    const t = sinComentarios(SQL);
    const paso0 = t.slice(0, t.indexOf('end $$;') + 7);
    assert.match(paso0, /celular_del_equipo_de_sesion\(\)'\) is null[\s\S]*?raise exception/);
    assert.match(paso0, /aceptar_condiciones\(bigint, jsonb\)'\) is null[\s\S]*?raise exception/);
    assert.match(t, /select 1 as n, '[^']+' as comprobacion,[\s\S]*order by 1;\s*$/);
    assert.equal((SQL.match(/^select \d/gm) || []).length, 8);
    assert.equal((COMPROBAR.match(/^select \d/gm) || []).length, 8);
    /* Las filas que llaman la revisión son las mismas en los dos archivos. */
    const llamadas = f => (f.match(/propuesta_quincenal_a_cuotas_revisar\(\s*'[^']*'/g) || []).map(x => x.replace(/\s+/g, ''));
    assert.deepEqual(llamadas(COMPROBAR), llamadas(SQL.slice(SQL.indexOf('select 1 as n'))));
  });

  test('las cifras de la tabla son las del motor (el caso de Joan y el del redondeo)', () => {
    const a = cuerpoDelMotor(650000, [{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }], '2026-10-16');
    assert.deepEqual(a.cuotas.map(q => [q.capital, q.costo, q.total]), [[325000, 130000, 455000], [325000, 65000, 390000]]);
    const b = cuerpoDelMotor(20500, [{ fecha: '2026-10-30', pct: 35 }, { fecha: '2026-11-15', pct: 35 }], '2026-10-16');
    assert.deepEqual(b.cuotas.map(q => [q.capital, q.costo, q.total]), [[10250, 7175, 17425], [10250, 3587, 13837]]);
    assert.equal(b.costo, 10762);
    assert.ok(SQL.indexOf('"capital":20500,"costo":10762,"total":31262') > 0);
  });
});

describe('la propuesta quincenal a cuotas, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
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
  const json = q => JSON.parse(sql('select (' + q + ')::text'));
  const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());
  const hoy = () => sql("select to_char(public.hoy_bogota(), 'YYYY-MM-DD')");
  const fechaEn = dias => sql("select to_char(public.hoy_bogota() + " + dias + ", 'YYYY-MM-DD')");
  const proponer = (id, cuerpo, clave) => json('public.contrapropuesta_quincenal_a_cuotas(' + (clave || CLAVE) + ', ' + id + ', ' + jb(cuerpo) + ')');
  /* Una cuenta que pide a la medida, como play/: la solicitud nace 'nueva'. */
  const pedir = (cel, monto, dias) => {
    sql("insert into auth.users (email, created_at) values ('57" + cel + "@tugarantia.net', now())");
    const j = comoCuenta(cel, 'public.solicitar_a_la_medida(' + monto + ", '" + fechaEn(dias) + "'::date, 'para surtir')");
    assert.equal(j.ok, true, JSON.stringify(j));
    return j.solicitud;
  };
  const fila = id => json('(select to_jsonb(s) from public.solicitudes s where s.id = ' + id + ')');

  before(() => {
    const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
      .match(/const STUB = `([\s\S]*?)`;/)[1];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-cuotas-q-'));
    puerto = 57980 + Math.floor(Math.random() * 300);
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
      assert.equal(filas.length, 8, 'la tabla final no salió entera: ' + r.stdout);
      filas.forEach(l => assert.match(l, /\|t$/, 'una comprobación salió en false: ' + l));
    });
    const c = archivo(path.join(RAIZ, 'base', COMPROBAR_NOMBRE));
    assert.equal(c.status, 0, c.stderr);
    const filas = c.stdout.trim().split(/\r?\n/).filter(l => /\|[tf]\|/.test(l));
    assert.equal(filas.length, 8, c.stdout);
    filas.forEach(l => assert.match(l, /\|t\|/, 'comprobar dice false: ' + l));
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('con la clave equivocada: error, y la solicitud no cambia', () => {
    const s = pedir('3001230101', 2000000, 79);
    const cuerpo = cuerpoDelMotor(2000000, [{ fecha: fechaEn(15), pct: 20 }, { fecha: fechaEn(79), pct: 20 }], hoy());
    assert.throws(() => proponer(s.id, cuerpo, "'otra-clave-que-no-es-la-buena'"), /clave de sincronizaci/);
    assert.equal(fila(s.id).estado, 'nueva');
    assert.equal(fila(s.id).contrapropuesta, null);
  });

  test('de punta a punta: pide, Joan propone a cuotas con el motor, ella la ve, la acepta, y la bandeja la trae', () => {
    const CEL = '3001230102';
    const s = pedir(CEL, 2000000, 79);
    const cuerpo = cuerpoDelMotor(2000000,
      [{ fecha: fechaEn(15), pct: 20 }, { fecha: fechaEn(30), pct: 15 }, { fecha: fechaEn(79), pct: 10 }], hoy(), 'Te propongo esto en tres');
    const j = proponer(s.id, cuerpo);
    assert.equal(j.ok, true, JSON.stringify(j));
    const cp = j.solicitud.contrapropuesta;
    assert.equal(j.solicitud.estado, 'contrapropuesta');
    assert.equal(j.solicitud.producto, 'quincenal');
    assert.equal(cp.producto, 'quincenal');
    assert.deepEqual(cp.cuotas, cuerpo.cuotas, 'la base no guardó las cuotas del motor tal cual');
    assert.equal(cp.capital, 2000000);
    assert.equal(cp.costo, cuerpo.costo);
    assert.equal(cp.total, cuerpo.total);
    assert.equal(cp.fecha_pago, fechaEn(79), 'fecha_pago tiene que ser la última cuota');
    assert.equal(cp.dias, 79);
    assert.equal(cp.texto, 'Te propongo esto en tres');
    assert.equal(cp.por, 'joan');
    assert.ok(cp.creada_en);
    assert.equal(String(j.solicitud.fecha_corte).slice(0, 10), fechaEn(79));
    assert.equal(Number(j.solicitud.total), cuerpo.total);
    /* Lo pedido no se pisa. */
    assert.equal(Number(j.solicitud.pedido_monto), 2000000);

    /* Ella la ve en su app (mi_solicitud), y la acepta con lo que arma la app. */
    const mia = comoCuenta(CEL, 'public.mi_solicitud()');
    assert.equal(mia.solicitud.id, s.id);
    assert.deepEqual(mia.solicitud.contrapropuesta.cuotas, cuerpo.cuotas);
    const cond = CS.condiciones(mia.solicitud, { hoy: hoy() });
    assert.equal(cond.cuotas, 3);
    const vio = CS.paraAceptar(cond);
    const ok = comoCuenta(CEL, 'public.aceptar_condiciones(' + s.id + ', ' + jb(vio) + ')');
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.solicitud.estado, 'aceptada');
    assert.equal(ok.solicitud.contrapropuesta.condiciones.base.fecha_pago, fechaEn(79));
    /* LA CONSTANCIA GUARDA LAS CUOTAS: la oferta entera (de la base) y los
       renglones de cada cuota (lo que vio). */
    const c = json('(select row_to_json(c) from public.condiciones_aceptadas c where solicitud_id = ' + s.id + ')');
    assert.deepEqual(c.oferta.cuotas, cuerpo.cuotas);
    assert.deepEqual(c.vio.lineas.filter(l => /^cuota\d$/.test(l.clave)).map(l => l.v),
      cuerpo.cuotas.map(q => CS.pesos(q.total) + ' el ' + CS.fechaLarga(q.fecha)));

    /* La bandeja de Joan la trae, con sus cuotas y su constancia. */
    const b = json('(select json_agg(x) from public.listar_solicitudes_abiertas(' + CLAVE + ') x where x.id = ' + s.id + ')');
    assert.equal(b.length, 1);
    assert.deepEqual(b[0].contrapropuesta.cuotas, cuerpo.cuotas);
    assert.ok(b[0].contrapropuesta.condiciones);

    /* Volver a proponer sobre una aceptada: otra vez esperando, sin la aceptación vieja. */
    const otra = cuerpoDelMotor(1500000, [{ fecha: fechaEn(15), pct: 20 }, { fecha: fechaEn(30), pct: 20 }], hoy());
    const j2 = proponer(s.id, otra);
    assert.equal(j2.ok, true, JSON.stringify(j2));
    assert.equal(j2.solicitud.estado, 'contrapropuesta');
    assert.equal(j2.solicitud.aceptada_en, null);
    assert.equal(j2.solicitud.contrapropuesta.condiciones, undefined, 'arrastró la aceptación de la vieja');
    assert.equal(sql('select count(*) from public.condiciones_aceptadas where solicitud_id = ' + s.id), '1', 'se perdió la constancia vieja');
  });

  test('las rejas: cada una dice que no, con su porqué, y no toca la fila', () => {
    const s = pedir('3001230103', 650000, 30);
    const base = () => cuerpoDelMotor(650000, [{ fecha: fechaEn(14), pct: 20 }, { fecha: fechaEn(30), pct: 20 }], hoy());
    const no = (cuerpo, motivo) => {
      const j = proponer(s.id, cuerpo);
      assert.equal(j.ok, false, 'pasó: ' + JSON.stringify(cuerpo));
      assert.match(j.motivo, motivo);
      assert.equal(fila(s.id).estado, 'nueva', 'una propuesta rechazada tocó la fila');
    };
    /* 1 cuota y 7 cuotas. */
    const una = base(); una.cuotas = [Object.assign({}, una.cuotas[0], { capital: 650000, costo: 130000, total: 780000 })];
    una.costo = 130000; una.total = 780000;
    no(una, /van de 2 a 6/);
    const siete = cuerpoDelMotor(700000, [1, 2, 3, 4, 5, 6].map(i => ({ fecha: fechaEn(i * 15), pct: 20 })), hoy());
    siete.cuotas.push(Object.assign({}, siete.cuotas[5], { numero: 7, fecha: fechaEn(100) }));
    no(siete, /van de 2 a 6/);
    /* La primera, ayer. */
    const ayer = base(); ayer.cuotas[0].fecha = fechaEn(-1);
    no(ayer, /primera cuota ya pasó/);
    /* Fechas que no crecen. */
    const revueltas = base(); revueltas.cuotas[1].fecha = fechaEn(14);
    no(revueltas, /de menor a mayor/);
    /* La última a 187 días (186 sí: ver abajo). */
    const lejos = base(); lejos.cuotas[1].fecha = fechaEn(187);
    no(lejos, /187 días; el tope es 186/);
    /* El 51 %. */
    const alto = base(); alto.cuotas[0].pct = 51;
    no(alto, /va entero de 1 a 50/);
    /* Un peso de más en el costo de una cuota (y su total, para que sume). */
    const peso = base(); peso.cuotas[0].costo += 1; peso.cuotas[0].total += 1; peso.costo += 1; peso.total += 1;
    no(peso, /no es su 20 %/);
    /* Por encima del techo (con un % que miente). */
    const techo = base(); techo.cuotas[0].costo = 400000; techo.cuotas[0].total = 725000;
    techo.costo = 465000; techo.total = 1115000;
    no(techo, /pasa el techo/);
    /* Capitales que no suman. */
    const corto = base(); corto.cuotas[1].capital -= 1000; corto.cuotas[1].total -= 1000; corto.total -= 1000;
    no(corto, /suman 649000 y el préstamo es de 650000/);
    /* Totales que no casan con la cuota. */
    const malTotal = base(); malTotal.cuotas[1].total += 5;
    no(malTotal, /no suma su capital más su costo/);
    /* Cifras que no son pesos enteros. */
    const texto = base(); texto.cuotas[0].capital = '325000';
    no(texto, /no son pesos enteros/);
    /* Un monto fuera del rango de un solo pago. */
    no(cuerpoDelMotor(9000, [{ fecha: fechaEn(14), pct: 20 }, { fecha: fechaEn(30), pct: 20 }], hoy()), /de \$10\.000 a \$20\.000\.000/);
  });

  test('el redondeo es el del motor, y 186 días todavía caben', () => {
    /* Pide 50.000, el piso de solicitar_a_la_medida (con 20.500 la base dice
       'minimo' y la prueba no llega a proponer); Joan le propone 20.500, que
       sí cabe en el rango de la propuesta (desde 10.000). */
    const s = pedir('3001230104', 50000, 30);
    const motor = cuerpoDelMotor(20500, [{ fecha: fechaEn(14), pct: 35 }, { fecha: fechaEn(186), pct: 35 }], hoy());
    assert.equal(motor.cuotas[1].costo, 3587);
    const j = proponer(s.id, motor);
    assert.equal(j.ok, true, 'la base rechazó lo que el motor armó: ' + JSON.stringify(j));
    /* Y el redondeo exacto (3.588), que NO es el del motor, no pasa. */
    const exacto = JSON.parse(JSON.stringify(motor));
    exacto.cuotas[1].costo = 3588; exacto.cuotas[1].total += 1; exacto.costo += 1; exacto.total += 1;
    const no = proponer(s.id, exacto);
    assert.equal(no.ok, false);
    assert.match(no.motivo, /da 3587 y llegó 3588/);
  });

  test('una solicitud cerrada no se toca', () => {
    const s = pedir('3001230105', 650000, 30);
    sql("update public.solicitudes set estado = 'atendida' where id = " + s.id);
    const j = proponer(s.id, cuerpoDelMotor(650000, [{ fecha: fechaEn(14), pct: 20 }, { fecha: fechaEn(30), pct: 20 }], hoy()));
    assert.equal(j.ok, false);
    assert.match(j.motivo, /no está abierta/);
    assert.equal(fila(s.id).contrapropuesta, null);
  });
});
