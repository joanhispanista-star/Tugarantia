/* ============================================================================
 * LAS CUENTAS DEL REGISTRO, EN LA BASE — 22 de octubre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/cuentas-del-registro-al-aceptar-postgres.test.js
 *
 * La revisión adversaria del 22-oct montó un PostgreSQL con las migraciones y
 * recorrió el camino de verdad: registrar_abierto (sin sesión) con el Nequi,
 * la llave y la cuenta de banco; la cuenta; solicitar_a_la_medida; la
 * propuesta de Joan; y mi_solicitud con la sesión de la clienta. La solicitud
 * llegaba SIN `datos` (el corte del 7-oct, a propósito), y la pantalla, que
 * leía las cuentas de ahí, ofrecía solo «Escribe tu cuenta».
 *
 * Esta prueba recorre ese MISMO camino con base/20261022c_las_cuentas_del_registro.sql
 * (corrido dos veces: idempotente) y mira lo que importa:
 *   · mi_solicitud SIGUE sin `datos` (el corte no se deshace);
 *   · mis_cuentas_de_pago le da a la dueña sus ocho llaves de pago, y nada más
 *     del registro; con ellas, la pantalla ofrece sus tres cuentas;
 *   · el riesgo D2: quien sabe el celular de Luisa escribe primero SU fila con
 *     SU Nequi; la solicitud de Luisa la copia, pero el sello no casa con su
 *     cuenta y no se le ofrece NADA (no el Nequi del otro);
 *   · una cuenta sin sello (abierta antes de esto), una ajena, sin sesión, una
 *     solicitud que ya no está en propuesta: nada;
 *   · PlataChat (registrar_abierto_app y solicitar_platachat), igual.
 * Sin TG_PG_BIN se salta la parte de PostgreSQL; lo que lee el archivo corre
 * siempre. Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const CP = require('../app/cuentas-pago.js');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261022c_las_cuentas_del_registro.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = "'clave-de-prueba-larga-123'";
const sinComentarios = s => s.replace(/--[^\n]*/g, '');

describe('el archivo de la migración', () => {
  test('no toca mi_solicitud ni ninguna función que devuelve la solicitud: el corte de `datos` se queda', () => {
    const c = sinComentarios(SQL);
    ['mi_solicitud', 'mi_solicitud_platachat', 'aceptar_condiciones', 'aceptar_con_destino', 'registrar_abierto',
     'solicitar_a_la_medida', 'solicitar_platachat'].forEach(f =>
      assert.equal(new RegExp('function\\s+public\\.' + f + '\\s*\\(', 'i').test(c), false, 'reescribe ' + f));
    assert.match(c, /create or replace function public\.mis_cuentas_de_pago\(p_id bigint\)/);
    /* Nunca la fila ni `datos` enteros: solo lo que arma llave por llave. */
    assert.equal(/to_jsonb\(s\)|'cuentas',\s*s\.datos/.test(c), false, 'devuelve la solicitud o sus datos enteros');
  });

  test('las llaves que devuelve son EXACTAMENTE las de pago de app/cuentas-pago.js, y el sello es el mismo', () => {
    const m = /foreach k in array array\[([^\]]+)\]/.exec(SQL);
    assert.ok(m, 'no encontré la lista de llaves');
    const llaves = m[1].replace(/\s+/g, '').split(',').map(x => x.replace(/'/g, ''));
    assert.deepEqual(llaves, CP.LLAVES_DEL_REGISTRO);
    assert.match(SQL, new RegExp("->> '" + CP.LLAVE_SELLO + "'"));
    assert.match(SQL, /raw_user_meta_data -> 'vinculacion' ->> 'cuentas_sello'/, 'el sello de la cuenta no sale de la cuenta');
  });

  test('los permisos: se le quitan a todos y solo la sesión pregunta', () => {
    assert.match(SQL, /revoke all on function public\.mis_cuentas_de_pago\(bigint\) from public, anon, authenticated;/);
    assert.match(SQL, /grant\s+execute on function public\.mis_cuentas_de_pago\(bigint\) to authenticated;/);
    assert.equal(/to anon/.test(sinComentarios(SQL)), false, 'algo quedó para anon');
  });

  test('termina con una consulta que devuelve renglones y no cambia nada', () => {
    const cola = SQL.slice(SQL.lastIndexOf('3. ¿QUEDÓ?'));
    assert.match(cola, /select 1 as n, '[^']+' as que,/);
    assert.match(cola, /order by 1;\s*$/);
    assert.equal(/\b(insert|update|delete)\b/i.test(sinComentarios(cola)), false, 'la comprobación cambia datos');
  });
});

describe('las cuentas del registro, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
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
  const ultima = s => s.split(/\r?\n/).pop();
  const fechaEn = dias => sql("select to_char(public.hoy_bogota() + " + dias + ", 'YYYY-MM-DD')");
  const sello = () => crypto.randomBytes(16).toString('hex');

  /* Una cuenta como la deja el signup de play/: su id, su correo sintético y
     la vinculación (sin datos de pago, con el sello si se lo damos). */
  function cuenta(cel, vinculacion) {
    const id = crypto.randomUUID();
    sql("insert into auth.users (id, email, created_at, raw_user_meta_data) values ('" + id + "', '57" + cel +
        "@tugarantia.net', now(), " + jb({ telefono: cel, vinculacion: vinculacion || {} }) + ')');
    return { cel, id };
  }
  const como = (c, q) => JSON.parse(ultima(sql(
    "select set_config('request.jwt.claims', '" + JSON.stringify({ email: '57' + c.cel + '@tugarantia.net', sub: c.id }) +
    "', false); select (" + q + ')::text')));
  /* La bandeja, SIN sesión, como la llama el teléfono. */
  const registrar = (cel, nombre, cedula, datos, app) => JSON.parse(ultima(sql('set role anon; select (' +
    (app ? 'public.registrar_abierto_app' : 'public.registrar_abierto') + "('" + cel + "', '" + nombre + "', '" + cedula + "', " +
    jb(datos) + (app ? ", '" + app + "'" : '') + '))::text')));
  const proponer = id => {
    const p = json('select public.contrapropuesta_solicitud(' + CLAVE + ', ' + id + ", 600000, 20, 15, 'Te podemos dar esto')");
    assert.equal(p.ok, true, JSON.stringify(p));
    return p.solicitud.contrapropuesta;
  };
  const PAGO = { nequi: '3101239001', llave_breb: '@MARIA123', banco: 'Bancolombia', banco_codigo: '1-7',
    banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si' };
  const IDENTIDAD = { nombres: 'MARIA', apellidos: 'PRUEBA', documento: '52123001', direccion: 'Calle 1 # 2-3',
    ref1_nombre: 'Luz', ref1_celular: '3002223344' };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-cuentas-reg-'));
    puerto = 57600 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    /* El andamio de pruebas/destino-del-desembolso-postgres.test.js. */
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && !/^20261022/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261007c_una_puerta_cierres.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261008_condiciones_aceptadas.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261022b_destino_del_desembolso.sql'), true);
    /* Dos veces: idempotente. */
    archivo(path.join(RAIZ, 'base', NOMBRE), true);
    archivo(path.join(RAIZ, 'base', NOMBRE), true);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la tabla del final sale toda en true (la que ve Joan en el editor)', () => {
    const filas = sql(SQL).split(/\r?\n/).filter(l => /^\d+\|/.test(l));
    assert.equal(filas.length, 6, filas.join('\n'));
    assert.deepEqual(filas.filter(l => !/\|t$/.test(l)), [], filas.join('\n'));
  });

  test('el camino de verdad: registro sin sesión, cuenta, pedido, propuesta; mi_solicitud SIN datos y las cuentas por mis_cuentas_de_pago', () => {
    const S = sello();
    const reg = registrar('3101239001', 'MARIA PRUEBA', '52123001', Object.assign({}, IDENTIDAD, PAGO, { cuentas_sello: S }));
    assert.equal(reg.ok, true, JSON.stringify(reg));
    const c = cuenta('3101239001', Object.assign({}, IDENTIDAD, { cuentas_sello: S }));
    const sol = como(c, "public.solicitar_a_la_medida(800000, '" + fechaEn(20) + "'::date, null)").solicitud;
    proponer(sol.id);

    /* Lo que el teléfono lee de la solicitud: SIN datos, como desde el 7-oct. */
    const mi = como(c, 'public.mi_solicitud()');
    assert.equal(mi.solicitud.id, sol.id);
    assert.equal(mi.solicitud.estado, 'contrapropuesta');
    assert.equal('datos' in mi.solicitud, false, 'mi_solicitud volvió a mandar los datos del registro');
    assert.deepEqual(CP.opcionesDeDestino(mi.solicitud.datos || {}), [], 'el defecto: de la solicitud no sale nada');

    /* Lo que ahora pide la pantalla. */
    const r = como(c, 'public.mis_cuentas_de_pago(' + sol.id + ')');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.cuentas, PAGO, 'no devolvió las ocho llaves de pago, o devolvió de más');
    const op = CP.opcionesDeDestino(r.cuentas);
    assert.deepEqual(op.map(o => o.medio), ['nequi', 'breb', 'banco']);
    assert.equal(op[0].numero, '3101239001');
    assert.equal(op[1].llave, '@MARIA123');
    assert.equal(op[2].numero, '123456789');

    /* Y la que elige viaja con la aceptación; aceptada, ya no se piden. */
    const cp = mi.solicitud.contrapropuesta;
    const vio = jb({ version: '2026-10-08', capital: 600000, total: cp.total, fecha_pago: cp.fecha_pago, creada_en: cp.creada_en,
      texto: 'Las condiciones de este crédito\n- Recibes: $600.000\n- Total a pagar: $720.000', lineas: [] });
    const a = como(c, 'public.aceptar_con_destino(' + sol.id + ', ' + vio + ', ' + jb(CP.revisarDestino(op[0]).destino) + ')');
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(a.solicitud.destino_desembolso.numero, '3101239001');
    assert.equal(como(c, 'public.mis_cuentas_de_pago(' + sol.id + ')').ok, false, 'después de aceptar sigue dando las cuentas');
  });

  test('D2: quien sabe el celular de Luisa escribe primero SU fila con SU Nequi; a Luisa no se le ofrece NADA', () => {
    const cel = '3101239002';
    const deEl = registrar(cel, 'PEDRO OTRO', '80111222', { nombres: 'PEDRO', nequi: '3209990000', cuentas_mias: 'si', cuentas_sello: sello() });
    assert.equal(deEl.ok, true);
    const S = sello();
    const deElla = registrar(cel, 'LUISA PRUEBA', '52999888', Object.assign({ nombres: 'LUISA' }, { nequi: cel, cuentas_mias: 'si', cuentas_sello: S }));
    assert.equal(deElla.ok, true, 'a Luisa se le contesta ok aunque su fila no entre (el atajo del 9-sep)');
    const c = cuenta(cel, { nombres: 'LUISA', cuentas_sello: S });
    const sol = como(c, "public.solicitar_a_la_medida(500000, '" + fechaEn(20) + "'::date, null)").solicitud;
    proponer(sol.id);
    /* La premisa: la solicitud de Luisa SÍ copió la fila del otro. */
    assert.equal(sql("select datos ->> 'nequi' from public.solicitudes where id = " + sol.id), '3209990000',
      'la premisa no se dio: la solicitud no copió la fila del otro');
    const r = como(c, 'public.mis_cuentas_de_pago(' + sol.id + ')');
    assert.equal(r.ok, true);
    assert.deepEqual(r.cuentas, {}, 'le ofreció a Luisa el Nequi que escribió otro con su celular');
    assert.deepEqual(CP.opcionesDeDestino(r.cuentas), []);
  });

  test('una cuenta sin sello (abierta antes de esto) no recibe nada, aunque su registro sí tenga uno', () => {
    const cel = '3101239003';
    registrar(cel, 'ANA PRUEBA', '52111333', Object.assign({ nombres: 'ANA' }, PAGO, { nequi: cel, cuentas_sello: sello() }));
    const c = cuenta(cel, { nombres: 'ANA' });
    const sol = como(c, "public.solicitar_a_la_medida(500000, '" + fechaEn(20) + "'::date, null)").solicitud;
    proponer(sol.id);
    assert.deepEqual(como(c, 'public.mis_cuentas_de_pago(' + sol.id + ')').cuentas, {});
    /* Ni con un registro sin sello: dos «nada» no casan. */
    const cel2 = '3101239004';
    registrar(cel2, 'EVA PRUEBA', '52111444', Object.assign({ nombres: 'EVA' }, PAGO, { nequi: cel2 }));
    const c2 = cuenta(cel2, { nombres: 'EVA' });
    const sol2 = como(c2, "public.solicitar_a_la_medida(500000, '" + fechaEn(20) + "'::date, null)").solicitud;
    proponer(sol2.id);
    assert.deepEqual(como(c2, 'public.mis_cuentas_de_pago(' + sol2.id + ')').cuentas, {});
  });

  test('ni lo ajeno, ni sin propuesta, ni sin sesión, ni anon', () => {
    const cel = '3101239005', S = sello();
    registrar(cel, 'ROSA PRUEBA', '52111555', Object.assign({ nombres: 'ROSA' }, PAGO, { nequi: cel, cuentas_sello: S }));
    const c = cuenta(cel, { nombres: 'ROSA', cuentas_sello: S });
    const sol = como(c, "public.solicitar_a_la_medida(500000, '" + fechaEn(20) + "'::date, null)").solicitud;
    /* Sin propuesta todavía ('nueva'): nada. */
    const nueva = como(c, 'public.mis_cuentas_de_pago(' + sol.id + ')');
    assert.equal(nueva.ok, false); assert.equal(nueva.motivo, 'no_esta');
    proponer(sol.id);
    assert.equal(Object.keys(como(c, 'public.mis_cuentas_de_pago(' + sol.id + ')').cuentas).length, 7);
    /* Otra cuenta, con el MISMO sello copiado (no basta saber el sello). */
    const ajena = cuenta('3101239099', { nombres: 'INTRUSO', cuentas_sello: S });
    const r = como(ajena, 'public.mis_cuentas_de_pago(' + sol.id + ')');
    assert.equal(r.ok, false, 'otra cuenta leyó las cuentas ajenas: ' + JSON.stringify(r));
    assert.equal(r.cuentas, undefined);
    /* Sin sesión (sin celular en el token). */
    assert.equal(json('select public.mis_cuentas_de_pago(' + sol.id + ')').motivo, 'sesion');
    let err = '';
    try { sql('set role anon; select public.mis_cuentas_de_pago(' + sol.id + ')'); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /permission denied|permiso denegado/i, 'anon puede llamar mis_cuentas_de_pago');
  });

  test('PlataChat: el registro con la etiqueta y solicitar_platachat, igual', () => {
    const cel = '3101239006', S = sello();
    const reg = registrar(cel, 'SOFIA PRUEBA', '52111666', Object.assign({ nombres: 'SOFIA' },
      { daviplata: cel, llave_breb: 'sofia@gmail.com', cuentas_mias: 'si', cuentas_sello: S }), 'platachat');
    assert.equal(reg.ok, true, JSON.stringify(reg));
    const c = cuenta(cel, { nombres: 'SOFIA', cuentas_sello: S });
    const p = como(c, "public.solicitar_platachat(300000, '" + fechaEn(15) + "'::date, 1)");
    assert.equal(p.ok, true, JSON.stringify(p));
    proponer(p.solicitud.id);
    const mi = como(c, 'public.mi_solicitud_platachat()');
    assert.equal(mi.solicitud.estado, 'contrapropuesta');
    assert.equal('datos' in mi.solicitud, false, 'mi_solicitud_platachat volvió a mandar los datos del registro');
    const r = como(c, 'public.mis_cuentas_de_pago(' + p.solicitud.id + ')');
    assert.deepEqual(r.cuentas, { daviplata: cel, llave_breb: 'sofia@gmail.com', cuentas_mias: 'si' });
    assert.deepEqual(CP.opcionesDeDestino(r.cuentas).map(o => o.medio), ['daviplata', 'breb']);
  });
});
