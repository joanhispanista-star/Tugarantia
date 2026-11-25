/* ============================================================================
 * LAS SOLICITUDES EN EL CELULAR, CONTRA UN POSTGRESQL DE VERDAD — 25-nov-2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/solicitudes-en-el-celular-postgres.test.js
 *
 * base/20261125_solicitudes_en_el_celular.sql crea panel_solicitudes: la bandeja
 * de solicitudes para la SESIÓN del dueño (el celular no tiene la clave del
 * computador). Sin TG_PG_BIN la parte de PostgreSQL se salta; la que lee el
 * archivo corre siempre. Con él: todas las migraciones de base/ en orden, el
 * archivo DOS veces (idempotente), y se LLAMA la función como la va a llamar el
 * celular:
 *   · sin sesión, con sesión de otro, y con la llave pública: no.
 *   · con la sesión del dueño: lo abierto (nueva, propuesta, aceptada), lo más
 *     reciente primero, con lo que la persona PIDIÓ aparte de lo que se le propone.
 *   · NUNCA sale la cuenta del desembolso, ni lo que declaró, ni el celular del
 *     gerente, ni la tasa.
 *   · el reloj de las vencidas corre antes de contestar, como en el computador.
 * Los nombres, celulares, cédulas y cuentas son de mentira.
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
const NOMBRE = '20261125_solicitudes_en_el_celular.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const sinComentarios = t => t.replace(/--[^\n]*/g, '');
const DUENO = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';

describe('el archivo de la migración', () => {
  const t = sinComentarios(SQL);
  test('crea UNA función y no toca nada de lo que ya vive', () => {
    const creadas = [...t.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map(m => m[1]);
    assert.deepEqual(creadas, ['panel_solicitudes']);
    assert.equal(/\b(alter\s+table|drop\s+function|create\s+table\s+(if\s+not\s+exists\s+)?public\.|update\s+public\.|delete\s+from|insert\s+into\s+public\.)/i.test(t), false,
      'el archivo cambia algo más que su función');
  });

  test('se para en su paso 0 si falta lo de antes, y antes de crear nada', () => {
    const paso0 = t.slice(0, t.indexOf('end $$;') + 7);
    assert.match(paso0, /to_regprocedure\('public\.celular_del_equipo_de_sesion\(\)'\) is null[\s\S]*?raise exception/);
    assert.match(paso0, /to_regprocedure\('public\.panel_es_dueno\(\)'\) is null[\s\S]*?raise exception/);
    assert.match(paso0, /to_regclass\('public\.solicitudes'\) is null[\s\S]*?raise exception/);
    assert.ok(t.indexOf('do $$') < t.search(/create (temporary table|or replace function)/));
  });

  test('pregunta por el dueño antes que nada, y solo se abre con sesión: nunca a la llave pública', () => {
    const i = t.indexOf('create or replace function public.panel_solicitudes');
    const cabeza = t.slice(i, t.indexOf('as $$', i));
    assert.match(cabeza, /security definer/);
    assert.match(cabeza, /set search_path = public/);
    const cuerpo = t.slice(t.indexOf('as $$', i), t.indexOf('$$;', t.indexOf('as $$', i)));
    const dueno = cuerpo.indexOf("if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;");
    assert.ok(dueno > 0 && dueno < cuerpo.indexOf('resolver_vencidas') && dueno < cuerpo.indexOf('from public.solicitudes'), 'algo corre antes de preguntar quién es');
    assert.match(t, /revoke all on function public\.panel_solicitudes\(integer\) from public, anon, authenticated;/);
    assert.match(t, /grant execute on function public\.panel_solicitudes\(integer\) to authenticated;/);
    assert.equal(/grant[^;]*panel_solicitudes[^;]*\banon\b/.test(t), false, 'quedó abierta a la llave pública');
    assert.match(t, /notify pgrst, 'reload schema';/);
  });

  test('ninguna columna privada se nombra para sacarla, y las que pueden faltar se leen sin reventar', () => {
    const i = t.indexOf('create or replace function public.panel_solicitudes');
    const cuerpo = t.slice(t.indexOf('as $$', i), t.indexOf('$$;', t.indexOf('as $$', i)));
    ['destino_desembolso', 'responsable', 's.datos', "'datos'", 's.tasa', 's.costo', 's.total'].forEach(c =>
      assert.equal(cuerpo.includes(c), false, 'la función nombra «' + c + '»'));
    /* Lo que no es de la tabla original va por to_jsonb(s): si la columna no está, sale null. */
    ['celular', 'app', 'producto', 'plazo_meses', 'pedido_monto', 'pedido_plazo', 'pedido_nota', 'aceptada_en', 'responder_antes_de', 'cuenta_sin_juntar'].forEach(c => {
      assert.equal(new RegExp('\\bs\\.' + c + '\\b').test(cuerpo), false, c + ' se lee por nombre: en una base sin esa columna la función muere en la primera llamada');
    });
    /* El reloj se llama con EXECUTE y solo si existe. */
    assert.match(cuerpo, /if to_regprocedure\('public\.resolver_vencidas\(\)'\) is not null then\s+execute 'select public\.resolver_vencidas\(\)';/);
    assert.equal(/perform public\.resolver_vencidas/.test(cuerpo), false);
  });
});

describe('panel_solicitudes en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const entorno = Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' });
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: entorno }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: entorno });
  /* Como la llama el celular: con el papel `authenticated` y el `sub` de la sesión. */
  const como = (uid, q, papel) => sql(
    "select set_config('request.jwt.claims', '" + (uid ? '{"sub":"' + uid + '","role":"authenticated"}' : '') + "', false);" +
    'set role ' + (papel || 'authenticated') + '; select (' + q + ')::text').split('\n').pop();
  const fallo = f => { try { f(); return ''; } catch (e) { return String(e.stderr || e.message); } };
  const bandeja = lim => JSON.parse(como(DUENO, 'public.panel_solicitudes(' + (lim === undefined ? 100 : lim) + ')'));
  const filasDeLaTabla = r => r.stdout.trim().split(/\r?\n/).filter(l => /\|(bien|FALLA|no corrió)/.test(l));

  before(() => {
    const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-sol-cel-'));
    puerto = 56480 + Math.floor(Math.random() * 300);
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
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('corre limpia en una base SIN dueño todavía: la prueba con sesión no corre, y lo dice', () => {
    assert.equal(sql('select count(*) from public.panel_duenos'), '0', 'precondición: nadie en panel_duenos');
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    assert.equal(r.status, 0, 'la migración no corrió limpia: ' + r.stderr);
    assert.doesNotMatch(r.stderr, /FALLA/, r.stderr);
    assert.match(r.stderr, /Todavía no hay ningún dueño en panel_duenos/);
    assert.match(r.stderr, /Listo: las solicitudes en el celular/);
    const filas = filasDeLaTabla(r);
    assert.equal(filas.length, 6, 'la tabla final no salió entera: ' + r.stdout);
    assert.equal(filas.filter(l => /\|bien$/.test(l)).length, 4, r.stdout);
    assert.equal(filas.filter(l => /\|no corrió/.test(l)).length, 2, r.stdout);
    assert.equal(sql('select count(*) from public.panel_duenos'), '0', 'la migración dejó un dueño de mentira');
  });

  test('con un dueño, DOS veces más (idempotente): todas las comprobaciones en «bien»', () => {
    sql("insert into auth.users (id, email) values ('" + DUENO + "', 'duena@prueba.test'), ('" + OTRO + "', 'otro@prueba.test');" +
        "insert into public.panel_duenos (uid, nota) values ('" + DUENO + "', 'de prueba');");
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      assert.doesNotMatch(r.stderr, /FALLA/, r.stderr);
      const filas = filasDeLaTabla(r);
      assert.equal(filas.length, 7, 'la tabla final no salió entera: ' + r.stdout);
      filas.forEach(l => assert.match(l, /\|bien$/, 'una comprobación no salió bien: ' + l));
    });
    assert.equal(sql('select count(*) from public.panel_duenos'), '1');
  });

  test('sin sesión, con la sesión de otro, y con la llave pública: no', () => {
    assert.match(fallo(() => como('', 'public.panel_solicitudes(10)')), /no autorizado/);
    assert.match(fallo(() => como(OTRO, 'public.panel_solicitudes(10)')), /no autorizado/);
    assert.match(fallo(() => como(DUENO, 'public.panel_solicitudes(10)', 'anon')), /permission denied|permiso denegado/i);
    assert.equal(sql("select has_function_privilege('anon', 'public.panel_solicitudes(integer)', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated', 'public.panel_solicitudes(integer)', 'execute')"), 't');
  });

  test('con la sesión del dueño: lo abierto, lo más reciente primero, y lo que PIDIÓ aparte de lo que se le propone', () => {
    sql("delete from public.solicitudes;" +
      /* 1. La de la app de socios: entra con la cédula, sin cifra pedida. La más vieja. */
      "insert into public.solicitudes (cedula, nombre, capital, tasa, costo, total, fecha_corte, estado, creada_en) values " +
      " ('52000111', 'Socia De La App', 300000, 0.2, 60000, 360000, '2026-12-15', 'nueva', now() - interval '3 hours');" +
      /* 2. La de play/: guarda el CELULAR en cedula, y lo que pidió en pedido_monto. */
      "insert into public.solicitudes (cedula, nombre, capital, tasa, costo, total, fecha_corte, estado, pedido_monto, pedido_plazo, pedido_nota, contrapropuesta, creada_en) values " +
      " ('3001110001', 'Nuevo De Play', 100000, 0.35, 35000, 135000, '2026-12-05', 'contrapropuesta', 250000, 30, 'para surtir', " +
      "  '{\"capital\":100000,\"por\":\"automatica:nuevos\"}'::jsonb, now() - interval '2 hours');" +
      /* 3. Una aceptada, con TODO lo privado puesto: nada de eso puede salir. */
      "insert into public.solicitudes (cedula, celular, nombre, capital, tasa, costo, total, fecha_corte, estado, aceptada_en, producto, plazo_meses, sobre_cupo, cuenta_sin_juntar, " +
      "  destino_desembolso, datos, responsable, contrapropuesta, creada_en) values " +
      " ('3001110002', '3001110002', 'Aceptó La Propuesta', 500000, 0.2, 100000, 600000, '2027-02-15', 'aceptada', now() - interval '10 minutes', 'cuotas', 3, true, true, " +
      "  '{\"banco\":\"Banco De Mentira\",\"numero\":\"99887766554\"}'::jsonb, '{\"ingresos\":\"1800000\",\"direccion\":\"Calle Falsa 123\"}'::jsonb, '3009990000', " +
      "  '{\"capital\":500000,\"por\":\"gerente:3009990000\"}'::jsonb, now() - interval '1 hour');" +
      /* 4. Una cerrada: no es de la bandeja. */
      "insert into public.solicitudes (cedula, nombre, capital, tasa, costo, total, estado, creada_en) values " +
      " ('52000222', 'Ya Atendida', 200000, 0.2, 40000, 240000, 'atendida', now() - interval '30 minutes');" +
      /* 5. Propuesta de Joan, la más reciente. */
      "insert into public.solicitudes (cedula, nombre, capital, tasa, costo, total, fecha_corte, estado, contrapropuesta, creada_en) values " +
      " ('52000333', 'Con Propuesta De Joan', 400000, 0.2, 80000, 480000, '2026-12-15', 'contrapropuesta', '{\"capital\":400000,\"por\":\"joan\"}'::jsonb, now() - interval '5 minutes');");
    const j = bandeja();
    assert.equal(j.nuevas, 1); assert.equal(j.aceptadas, 1); assert.equal(j.propuestas, 2);
    assert.ok(!isNaN(Date.parse(j.servidor_ahora)), 'sin la hora del servidor');
    assert.deepEqual(j.solicitudes.map(s => s.nombre), ['Con Propuesta De Joan', 'Aceptó La Propuesta', 'Nuevo De Play', 'Socia De La App']);

    const [joan, acepto, play, app] = j.solicitudes;
    assert.equal(app.estado, 'nueva'); assert.equal(app.llave, '52000111'); assert.equal(app.celular, null);
    assert.equal(app.pedido_monto, null, 'le inventó una cifra pedida a quien no dijo ninguna');
    assert.equal(app.capital, 300000); assert.equal(app.fecha_corte, '2026-12-15');
    assert.equal(app.app, 'tugarantia'); assert.equal(app.producto, 'quincenal'); assert.equal(app.propuesta_por, null);

    assert.equal(play.llave, '3001110001');
    assert.equal(play.pedido_monto, 250000, '«pidió» tiene que ser lo que pidió, no lo que se le propone');
    assert.equal(play.capital, 100000); assert.equal(play.pedido_plazo, 30); assert.equal(play.pedido_nota, 'para surtir');
    assert.equal(play.propuesta_por, 'automatica');

    assert.equal(acepto.estado, 'aceptada'); assert.equal(acepto.celular, '3001110002');
    assert.equal(acepto.producto, 'cuotas'); assert.equal(acepto.plazo_meses, 3);
    assert.equal(acepto.sobre_cupo, true); assert.equal(acepto.cuenta_sin_juntar, true);
    assert.ok(!isNaN(Date.parse(acepto.aceptada_en)), 'sin la hora en que aceptó');
    assert.equal(acepto.propuesta_por, 'gerente', 'del gerente sale el tipo, no su celular');
    assert.equal(joan.propuesta_por, 'joan');
  });

  test('NUNCA sale la cuenta del desembolso, lo que declaró, el celular del gerente ni la tasa', () => {
    const crudo = como(DUENO, 'public.panel_solicitudes(100)');
    /* («contrapropuesta» sí sale, pero como ESTADO; que no salga la propuesta entera lo dice la lista de campos de abajo.) */
    ['99887766554', 'Banco De Mentira', 'Calle Falsa', '1800000', '3009990000', 'destino_desembolso', '"datos"', 'responsable', '"tasa"', '"costo"', '"total"', '"por"']
      .forEach(x => assert.equal(crudo.includes(x), false, 'salió «' + x + '» hacia el celular'));
    const campos = Object.keys(JSON.parse(crudo).solicitudes[0]).sort();
    assert.deepEqual(campos, ['aceptada_en', 'app', 'capital', 'celular', 'creada_en', 'cuenta_sin_juntar', 'estado', 'fecha_corte', 'id', 'llave', 'nombre',
      'pedido_monto', 'pedido_nota', 'pedido_plazo', 'plazo_meses', 'producto', 'propuesta_por', 'responder_antes_de', 'sobre_cupo'].sort(),
      'la tarjeta recibe un campo de más o de menos');
  });

  test('con el límite en cero solo cuenta; un límite absurdo se recorta', () => {
    const cero = bandeja(0);
    assert.deepEqual(cero.solicitudes, []);
    assert.equal(cero.nuevas, 1); assert.equal(cero.propuestas, 2);
    assert.equal(bandeja(1).solicitudes.length, 1);
    assert.equal(bandeja(-5).solicitudes.length, 0);
    assert.equal(bandeja(100000).solicitudes.length, 4);
  });

  test('PlataChat: lo pedido sale del pedido, y el reloj de las vencidas corre antes de contestar', () => {
    sql("insert into public.solicitudes (cedula, celular, nombre, capital, tasa, costo, total, estado, app, pedido, responder_antes_de, creada_en) values " +
        " ('3001110009', '3001110009', 'De PlataChat Vencida', 150000, 0.35, 52500, 202500, 'nueva', 'platachat', " +
        "  '{\"capital\":180000,\"fecha_pago\":\"2026-12-10\"}'::jsonb, now() - interval '20 minutes', now() - interval '50 minutes');");
    const id = sql("select id from public.solicitudes where nombre = 'De PlataChat Vencida'");
    assert.equal(sql('select resuelta_en is null from public.solicitudes where id = ' + id), 't', 'precondición: nadie la ha resuelto');
    const j = bandeja();
    assert.equal(sql('select resuelta_en is not null from public.solicitudes where id = ' + id), 't',
      'el celular contestó sin correr el reloj: mostraría como abierta una que ya venció');
    const s = j.solicitudes.find(x => x.id === Number(id));
    if (s) {   // si el automático le mandó propuesta, sigue abierta; lo que pidió no cambia
      assert.equal(s.app, 'platachat');
      assert.equal(s.pedido_monto, 180000);
    }
    /* Y lo que quedó no se vuelve a tocar en la siguiente lectura. */
    const antes = sql('select to_jsonb(s)::text from public.solicitudes s where s.id = ' + id);
    bandeja();
    assert.equal(sql('select to_jsonb(s)::text from public.solicitudes s where s.id = ' + id), antes);
  });
});
