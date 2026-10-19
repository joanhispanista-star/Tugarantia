'use strict';
/* ============================================================================
 * EL GERENTE NO SE PROPONE A SÍ MISMO, EN UN POSTGRESQL DE VERDAD
 * 19 de octubre de 2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/el-gerente-no-se-propone-postgres.test.js
 *
 * Willian, el gerente, entró a la app como cliente y pidió $300.000. Puede ser
 * cliente; lo que no puede es ponerse él mismo las condiciones. Con
 * gerente_proponer de 20261015 sí podía, en cuanto su propio número cayera en
 * su alcance (Joan le asigna su registro, o está como prospecto de su base).
 *
 * Cada prueba mira las dos caras: que la reja nueva cierre lo suyo y que NO
 * cierre lo de nadie más. Y la primera mira el hueco ANTES del arreglo: una
 * prueba que solo mira el «no» del final pasaría igual si el montaje no
 * alcanzara nunca la solicitud (un 'no_es_tuyo' también es un «no»).
 * ==========================================================================*/

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
const MIGRACION = path.join(RAIZ, 'base', '20261019_el_gerente_no_se_propone.sql');

const WILLIAN = '3000000000', LEIDY = '3000000002', OTRO = '3000000009';
const CLIENTE = '3101500001';   // un cliente de verdad de la base de Willian

describe('el gerente no se propone a sí mismo, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-At', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const json = q => JSON.parse(sql(q));
  const como = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());
  const fechaEn = dias => sql("select to_char(public.hoy_bogota() + " + dias + ", 'YYYY-MM-DD')");
  const proponer = (cel, id) =>
    como(cel, 'public.gerente_proponer(' + id + ", 250000, 20, 15, 'Te podemos dar esto')");
  /* Una solicitud metida a mano, para probar cada uno de los tres caminos por
     los que la función saca el celular. Sin sesión: así ningún disparador le
     cambia nada. */
  const solicitud = (campos) => Number(sql(
    "with x as (insert into public.solicitudes (cedula, celular, nombre, capital, tasa, costo, total, fecha_corte, producto, estado, app, registro_id) values ("
    + [campos.cedula, campos.celular].map(v => v == null ? 'null' : "'" + v + "'").join(', ')
    + ", 'Prueba', 300000, 0, 0, 0, public.hoy_bogota() + 20, 'quincenal', 'nueva', 'tugarantia', "
    + (campos.registro_id == null ? 'null' : campos.registro_id) + ") returning id) select id from x"));
  const sigueIntacta = id => sql('select estado || \'|\' || (contrapropuesta is null) from public.solicitudes where id = ' + id);
  let deWillian, deCliente;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-a-si-mismo-'));
    puerto = 56100 + Math.floor(Math.random() * 300);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    /* service_role, como en Supabase: la migración se lo quita. */
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB + '\ncreate role service_role nologin;\n');
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && !/^202610(15|19)/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    ['20261007_una_puerta.sql', '20261007c_una_puerta_cierres.sql', '20261008_condiciones_aceptadas.sql',
     '20261015_el_gerente_vende.sql']
      .forEach(f => {
        const r = archivo(path.join(RAIZ, 'base', f), true);
        assert.equal(r.status, 0, f + ' no corrió en el banco: ' + r.stderr);
      });
    sql('grant execute on function public.gerente_proponer(bigint, bigint, integer, integer, text) to service_role');

    sql(`
      insert into public.equipo (celular, nombre, rol, estado, jefe) values
        ('${WILLIAN}', 'WILLIAN', 'gerente', 'activo', null),
        ('${LEIDY}',   'LEIDY',   'asesor',  'activo', '${WILLIAN}'),
        ('${OTRO}',    'OTRO',    'gerente', 'activo', null);
      insert into public.cartera (id, tipo, celular, nombre) values ('P1', 'prospecto', '${CLIENTE}', 'Cliente');
      insert into public.asignaciones (id, persona_id, asesor, desde) values ('A1', 'P1', '${WILLIAN}', current_date - 5);
      insert into public.registros (cedula, nombre, telefono, datos, estado, origen) values
        ('1010', 'Cliente Registrado', '${CLIENTE}', '{}', 'nuevo', 'abierto');
      insert into auth.users (email, created_at) values
        ('57${WILLIAN}@tugarantia.net', now() - interval '40 days'), ('57${CLIENTE}@tugarantia.net', now());
    `);
    const t = json('select public.topes_equipo_guardar(' + CLAVE + ', 500000, 10, 20, 30)');
    assert.equal(t.ok, true, JSON.stringify(t));

    /* Willian pide como cliente, desde su sesión y sin registro: la fila queda
       como la del 19-oct, «Registrado», con su celular en cedula y celular. */
    const w = como(WILLIAN, "public.solicitar_a_la_medida(300000, '" + fechaEn(30) + "'::date, null)");
    assert.equal(w.ok, true, 'Willian no pudo pedir: ' + JSON.stringify(w));
    deWillian = Number(w.solicitud.id);
    assert.equal(w.solicitud.nombre, 'Registrado');
    const c = como(CLIENTE, "public.solicitar_a_la_medida(400000, '" + fechaEn(20) + "'::date, null)");
    assert.equal(c.ok, true, JSON.stringify(c));
    deCliente = Number(c.solicitud.id);
    /* Y Joan le asigna a Willian su propio registro sin darse cuenta: su número
       entra en su alcance. */
    assert.equal(json('select public.registro_asignar(' + CLAVE + ", '" + WILLIAN + "', '" + WILLIAN + "')").ok, true);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('EL HUECO, ANTES DEL ARREGLO: con 20261015 sola, Willian se propone a sí mismo', () => {
    const r = proponer(WILLIAN, deWillian);
    assert.equal(r.ok, true, 'el montaje no alcanza el hueco (la prueba de después no probaría nada): ' + JSON.stringify(r));
    assert.equal(r.solicitud.contrapropuesta.por, 'gerente:' + WILLIAN);
    /* Se deja como estaba, para que la reja nueva tenga algo que cerrar. */
    sql("update public.solicitudes set estado = 'nueva', contrapropuesta = null, capital = 300000 where id = " + deWillian);
  });

  test('LA HUELLA del archivo es la de la función que deja 20261015', () => {
    const huella = (/huella constant text := '([0-9a-f]{32})'/.exec(fs.readFileSync(MIGRACION, 'utf8')) || [])[1];
    assert.ok(huella, 'la migración no trae su huella');
    assert.equal(sql("select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure"),
      huella, 'la huella de la migración no es la de gerente_proponer: en la base de Joan pararía sin parchar');
  });

  test('LA MIGRACIÓN corre limpia DOS veces, y la segunda no cambia nada', () => {
    const r1 = archivo(MIGRACION, true);
    assert.equal(r1.status, 0, 'la migración no corrió limpia: ' + r1.stderr);
    assert.match(r1.stdout, /^t\|t\|t$/m, 'la fila para Joan no sale toda en true: ' + r1.stdout);
    const antes = sql("select md5(prosrc) from pg_proc where oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure");
    const r2 = archivo(MIGRACION, true);
    assert.equal(r2.status, 0, 'la segunda vuelta falló: ' + r2.stderr);
    assert.match(r2.stderr, /no se cambió nada/);
    assert.equal(sql("select md5(prosrc) from pg_proc where oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure"),
      antes, 'la segunda vuelta volvió a parchar la función');
  });

  test('A SÍ MISMO NO: su solicitud, en su alcance, la rechaza y no la toca', () => {
    const r = proponer(WILLIAN, deWillian);
    assert.equal(r.ok, false, 'Willian se pudo proponer a sí mismo: ' + JSON.stringify(r));
    assert.equal(r.motivo, 'no_a_ti_mismo');
    assert.equal(sigueIntacta(deWillian), 'nueva|true', 'la solicitud cambió aunque la base dijo que no');
  });

  test('POR LOS TRES CAMINOS: su sesión con un registro ajeno, su número en la cédula (también con el «0» de PlataChat) y su registro', () => {
    /* 1. El registro de la solicitud es el de un cliente de su base y la
          cédula es una de verdad (cuenta ya junta con su ficha), pero la sesión
          que pidió es la de Willian: el camino que «gana» arriba es el del
          cliente, y aun así es él. Solo la columna celular lo delata. */
    const regCliente = sql("select id from public.registros where telefono = '" + CLIENTE + "'");
    const a = solicitud({ cedula: '79000111', celular: WILLIAN, registro_id: regCliente });
    assert.equal(proponer(WILLIAN, a).motivo, 'no_a_ti_mismo', 'se coló por el registro de otro');
    /* 2. Sin celular ni registro: solo la cédula guarda el número (cuenta sin
          juntar). */
    const b = solicitud({ cedula: WILLIAN, celular: null });
    assert.equal(proponer(WILLIAN, b).motivo, 'no_a_ti_mismo', 'se coló por la cédula');
    /* 3. El hilo aparte de PlataChat: '0' + celular. Esta es también la prueba
          de que la barra de \d llegó entera a la función parchada. */
    const c = solicitud({ cedula: '0' + WILLIAN, celular: null });
    assert.equal(proponer(WILLIAN, c).motivo, 'no_a_ti_mismo', 'se coló por el hilo de PlataChat');
    /* 4. Su propio registro, aunque la fila traiga otra cédula y otro celular:
          el camino que gana arriba (el registro) es el suyo. */
    const regW = sql("with x as (insert into public.registros (cedula, nombre, telefono, datos, estado, origen) values ('79000333', 'Willian Registrado', '"
      + WILLIAN + "', '{}', 'nuevo', 'abierto') returning id) select id from x");
    const d = solicitud({ cedula: '79000222', celular: '3109990000', registro_id: regW });
    assert.equal(proponer(WILLIAN, d).motivo, 'no_a_ti_mismo', 'se coló por su propio registro');
    [a, b, c, d].forEach(id => assert.equal(sigueIntacta(id), 'nueva|true'));
  });

  test('LO DE LOS DEMÁS SIGUE IGUAL: su cliente sí, lo ajeno no, el asesor no', () => {
    assert.equal(proponer(OTRO, deCliente).motivo, 'no_es_tuyo', 'otro gerente le vendió al cliente de Willian');
    assert.equal(proponer(LEIDY, deCliente).motivo, 'solo_gerente');
    const bien = proponer(WILLIAN, deCliente);
    assert.equal(bien.ok, true, 'la reja nueva cerró también la venta a un cliente de verdad: ' + JSON.stringify(bien));
    assert.equal(bien.solicitud.contrapropuesta.por_nombre, 'WILLIAN');
  });

  test('JOAN SÍ LE PROPONE A SU GERENTE: contrapropuesta_solicitud no cambió', () => {
    const j = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + deWillian + ", 300000, 20, 30, 'Willian, esta es tu propuesta')");
    assert.equal(j.ok, true, JSON.stringify(j));
    assert.equal(sql('select contrapropuesta ->> \'por\' from public.solicitudes where id = ' + deWillian), 'joan');
  });

  test('PERMISOS: la llama el gerente con su sesión y nadie más', () => {
    const f = 'public.gerente_proponer(bigint, bigint, integer, integer, text)';
    assert.equal(sql("select has_function_privilege('authenticated', '" + f + "', 'execute')"), 't');
    assert.equal(sql("select has_function_privilege('anon', '" + f + "', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('service_role', '" + f + "', 'execute')"), 'f');
  });

  test('SI LA FUNCIÓN VIVA CAMBIÓ, el archivo para y no toca nada', () => {
    /* Se pone una gerente_proponer distinta de la del 15-oct (la misma, con un
       comentario de más) y sin la reja: la huella no casa. */
    const t = fs.readFileSync(path.join(RAIZ, 'base', '20261015_el_gerente_vende.sql'), 'utf8').replace(/\r/g, '');
    const i = t.indexOf('create or replace function public.gerente_proponer(');
    const otra = t.slice(i, t.indexOf('\n$$;', i) + 4).replace(/\nbegin\n/, '\nbegin\n  -- otra sesión cambió algo aquí\n');
    assert.ok(otra.includes('otra sesión cambió algo'));
    sql(otra);
    const r = archivo(MIGRACION, true);
    assert.notEqual(r.status, 0, 'parchó una función que no conocía');
    assert.match(r.stderr, /cambió desde el 15-oct-2026/);
    assert.equal(sql("select position('no_a_ti_mismo' in prosrc) > 0 from pg_proc where oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure"),
      'f', 'tocó la función aunque dijo que paraba');
  });
});
