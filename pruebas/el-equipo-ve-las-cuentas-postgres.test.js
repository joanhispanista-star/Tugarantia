/* ============================================================================
 * LAS CUENTAS QUE LE LLEGAN AL EQUIPO, EN UN POSTGRESQL DE VERDAD — 23-oct-2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/el-equipo-ve-las-cuentas-postgres.test.js
 *
 * Joan decidió el 23-oct que su gerente y sus asesores ven las cuentas de sus
 * clientes («pueden ver todo, está autorizado»), y el CRM las pinta
 * (pruebas/el-equipo-ve-las-cuentas.test.js). Pintarlas es seguro solo si la
 * BASE le manda a cada uno las de SUS clientes y nada más: la pantalla del
 * equipo se puede editar desde el navegador de cualquiera, la reja no.
 *
 * Esto no cambia la base: la mira. Se arma con TODAS las migraciones, en el
 * orden de base/ (las cuatro del 22-oct incluidas, la del equipo la última),
 * dos equipos —WILLIAN con su asesora LEIDY, y OTRO gerente— con la clave de
 * Joan puesta, un cliente de cada uno con sus cuentas en el registro y una
 * solicitud aceptada con «a dónde consignar». Y cada prueba mira las dos
 * caras: que cada uno reciba lo suyo, y que NO reciba lo ajeno. Una prueba
 * que solo mirara lo que sí aparece pasaría igual con una función que lo
 * devolviera todo.
 *
 * Lo que se vio al escribirla (23-oct), y lo que vigila:
 *   · ficha_de_mi_base (asesor y gerente) y gerente_registros (solo gerente)
 *     mandan los datos del registro enteros —con las cuentas— y, la segunda,
 *     las solicitudes con destino_desembolso, solo de su alcance;
 *   · mi_cartera (la lista de «Mi base») y gerente_archivos (las fotos) no
 *     llevan ninguna cuenta;
 *   · la bandeja de Joan (listar_solicitudes_abiertas) y las cuentas que se le
 *     ofrecen al cliente (mis_cuentas_de_pago) siguen cerradas para el equipo;
 *   · ninguna función sin argumentos que una sesión pueda llamar le devuelve a
 *     un gerente, a un asesor o a un cliente las cuentas de otro.
 * Pasa también contra b2aeae8: es la comprobación de la reja que ya había, no
 * del cambio de pantalla. Los números son de mentira.
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
const CLAVE = 'clave-de-prueba-larga-123';

const GER = '3000000000', ASE = '3000000002', OTRO = '3000000009', NADIE = '3009991111';
/* Tres clientes: P1 de LEIDY (equipo de WILLIAN), P2 del OTRO gerente, P3 de
   WILLIAN directo. Cada uno con números que no se repiten en ninguna otra
   parte, para que encontrarlos en una respuesta diga de quién son. */
const CEL = n => '310150000' + n;
const NEQ = n => '320' + String(n).repeat(3) + '000' + n;      // Nequi del registro
const BAN = n => String(n).repeat(3) + '000' + String(n).repeat(3); // cuenta de banco del registro
const LLAVE = n => '@CLIENTE' + ['', 'UNO', 'DOS', 'TRES'][n];  // llave Bre-B del registro
const DEST = n => '315' + String(n).repeat(7);                  // la que eligió al aceptar
const DE = n => [NEQ(n), BAN(n), LLAVE(n), DEST(n)];
const CREADA = '2026-10-23T15:00:00Z';

describe('las cuentas que le llegan al equipo, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
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
  const uid = cel => "md5('cuenta-" + cel + "')::uuid";
  /* Como la sesión de esa cuenta, con un token emitido 5 s después de ahora:
     posterior a la clave de Joan (base/20261022d_el_equipo_con_la_clave_de_joan.sql). */
  const como = (cel, q) => sql(
    "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(cel) + " || '\",\"email\":\"57" + cel + "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' ||" +
    " floor(extract(epoch from now()) + 5) || '}', false);" +
    ' select (' + q + ')::text').split(/\r?\n/).slice(1).join('\n');
  const jsonComo = (cel, q) => JSON.parse(como(cel, q));
  const cuenta = cel => sql(
    'delete from auth.users where id = ' + uid(cel) + ';' +
    ' insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data) values (' + uid(cel) +
    ", '57" + cel + "@tugarantia.net', extensions.crypt('la-que-eligio', extensions.gen_salt('bf')), now(), now() - interval '60 seconds', '{}'::jsonb)");
  /* Ningún número de esos clientes en el texto. */
  const sinNada = (texto, clientes, que) => clientes.forEach(c => DE(c).forEach(x =>
    assert.equal(String(texto).indexOf(x), -1, que + ': trae ' + x + ', que es del cliente ' + c)));
  let ids = {};

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-equipo-cuentas-'));
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
    /* TODAS, en el orden de base/: el orden alfabético es el orden en que Joan
       las corre (RECETA-PUBLICAR-27-OCT), y la del equipo va la última. */
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = '" + CLAVE + "' where clave = 'clave_sync'");
    });
    /* Sin la columna del 22-oct, lo que sigue no prueba nada. */
    assert.equal(sql("select count(*) from information_schema.columns where table_name = 'solicitudes' and column_name = 'destino_desembolso'"), '1',
      'no corrió base/20261022b_destino_del_desembolso.sql');
    assert.notEqual(sql("select to_regprocedure('public.celular_del_equipo_de_sesion()')"), '', 'no corrió el archivo del equipo (22d)');

    sql("select public.equipo_publicar('" + CLAVE + "', '" + JSON.stringify([
      { celular: GER, nombre: 'WILLIAN', rol: 'gerente' },
      { celular: ASE, nombre: 'LEIDY', rol: 'asesor', jefe: GER },
      { celular: OTRO, nombre: 'OTRO', rol: 'gerente' }]) + "'::jsonb, '" + JSON.stringify([
      { id: 'a1', persona_id: 'P1', asesor: ASE, desde: '2026-10-01' },
      { id: 'a2', persona_id: 'P2', asesor: OTRO, desde: '2026-10-01' },
      { id: 'a3', persona_id: 'P3', asesor: GER, desde: '2026-10-01' }]) + "'::jsonb, '" + JSON.stringify([1, 2, 3].map(i =>
      ({ id: 'P' + i, tipo: 'prospecto', celular: CEL(i), nombre: 'CLIENTE ' + i }))) + "'::jsonb)");
    [1, 2, 3].forEach(i => {
      const datos = { documento: '10' + i, ciudad: 'Bogotá', nequi: NEQ(i), llave_breb: LLAVE(i), banco: 'Bancolombia', banco_codigo: '1-7',
        banco_tipo: 'Ahorros', banco_numero: BAN(i), cuentas_mias: 'si' };
      /* «with … returning» y un select: así psql devuelve solo el id, sin el
         «INSERT 0 1». */
      const reg = sql("with x as (insert into public.registros (codigo, cedula, nombre, telefono, datos, origen) values ('', '10" + i + "', 'Cliente " + i + "', '" +
        CEL(i) + "', '" + JSON.stringify(datos) + "'::jsonb, 'abierto') returning id) select id from x");
      ids[i] = sql("with x as (insert into public.solicitudes (cedula, celular, nombre, capital, tasa, costo, total, fecha_corte, producto, estado, app, registro_id," +
        " contrapropuesta, destino_desembolso) values ('" + CEL(i) + "', '" + CEL(i) + "', 'Cliente " + i + "', 250000, 0, 50000, 300000," +
        " public.hoy_bogota() + 20, 'quincenal', 'aceptada', 'tugarantia', " + reg + ", '" +
        JSON.stringify({ capital: 250000, total: 300000, creada_en: CREADA }) + "'::jsonb, '" +
        JSON.stringify({ medio: 'nequi', numero: DEST(i), es_mia: true, propuesta: CREADA, elegido_en: CREADA }) + "'::jsonb) returning id) select id from x");
    });
    /* El equipo con su cuenta y la clave de Joan, puesta después de crearla. */
    [GER, ASE, OTRO].forEach((c, i) => {
      cuenta(c);
      assert.match(sql("select public.equipo_poner_clave('" + c + "', 'la-clave-de-joan-" + i + "')"), /^Listo/);
    });
    cuenta(NADIE);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('LA FICHA DEL ASESOR: las cuentas de SU cliente sí; las del cliente de su jefe o de otro equipo, no', () => {
    const f = jsonComo(ASE, "public.ficha_de_mi_base('P1')");
    assert.equal(f.ok, true, JSON.stringify(f));
    assert.equal(f.registrado, true);
    assert.equal(f.datos.nequi, NEQ(1), 'la ficha de su cliente no trae el Nequi');
    assert.equal(f.datos.banco_numero, BAN(1));
    assert.equal(f.datos.llave_breb, LLAVE(1));
    sinNada(JSON.stringify(f), [2, 3], 'la ficha de su cliente');
    ['P2', 'P3'].forEach(p => {
      const t = como(ASE, "public.ficha_de_mi_base('" + p + "')");
      assert.equal(JSON.parse(t).ok, false, 'LEIDY abrió la ficha de ' + p);
      sinNada(t, [1, 2, 3], 'la ficha negada de ' + p);
    });
  });

  test('LA FICHA DEL GERENTE: la de su equipo sí, la del otro gerente no (y al revés)', () => {
    assert.equal(jsonComo(GER, "public.ficha_de_mi_base('P1')").datos.nequi, NEQ(1), 'WILLIAN no ve la de su asesora');
    assert.equal(jsonComo(GER, "public.ficha_de_mi_base('P3')").datos.nequi, NEQ(3));
    const ajena = como(GER, "public.ficha_de_mi_base('P2')");
    assert.equal(JSON.parse(ajena).ok, false, 'WILLIAN abrió la ficha del otro equipo');
    sinNada(ajena, [2], 'la ficha negada');
    assert.equal(jsonComo(OTRO, "public.ficha_de_mi_base('P2')").datos.nequi, NEQ(2));
    ['P1', 'P3'].forEach(p => sinNada(como(OTRO, "public.ficha_de_mi_base('" + p + "')"), [1, 3], 'OTRO pidiendo ' + p));
  });

  test('«REGISTROS» DEL GERENTE: sus cuentas y su «Consignar a», nada del otro equipo, y nada para el asesor', () => {
    const r = jsonComo(GER, 'public.gerente_registros()');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.registros.map(x => x.telefono).sort(), [CEL(1), CEL(3)]);
    const uno = r.registros.find(x => x.telefono === CEL(1));
    assert.equal(uno.datos.nequi, NEQ(1), 'el registro no trae las cuentas');
    const s = uno.solicitudes[0];
    assert.equal(s.estado, 'aceptada');
    assert.equal(s.destino_desembolso.numero, DEST(1), 'la solicitud aceptada no trae a dónde consignar');
    assert.ok(!('datos' in s), 'la solicitud trae el paquete del registro repetido');
    sinNada(JSON.stringify(r), [2], 'los registros de WILLIAN');

    const o = jsonComo(OTRO, 'public.gerente_registros()');
    assert.deepEqual(o.registros.map(x => x.telefono), [CEL(2)]);
    assert.equal(o.registros[0].solicitudes[0].destino_desembolso.numero, DEST(2));
    sinNada(JSON.stringify(o), [1, 3], 'los registros del OTRO');

    const a = como(ASE, 'public.gerente_registros()');
    assert.equal(JSON.parse(a).motivo, 'solo_gerente');
    sinNada(a, [1, 2, 3], 'la asesora pidiendo los registros');
  });

  test('«MI BASE» Y LAS FOTOS NO LLEVAN NINGUNA CUENTA', () => {
    [GER, ASE, OTRO].forEach(c => {
      const t = como(c, 'public.mi_cartera()');
      assert.equal(JSON.parse(t).ok, true, c + ' no recibió su cartera: ' + t);
      sinNada(t, [1, 2, 3], 'mi_cartera de ' + c);
    });
    const f = como(GER, "public.gerente_archivos('" + CEL(1) + "')");
    assert.equal(JSON.parse(f).ok, true, f);
    sinNada(f, [1, 2, 3], 'las fotos');
  });

  test('NINGÚN CAMINO NUEVO: la bandeja de Joan y las cuentas que se le ofrecen al cliente siguen cerradas para el equipo', () => {
    assert.equal(sql("select has_function_privilege('authenticated', 'public.listar_solicitudes_abiertas(text)', 'execute')"), 'f',
      'una sesión del equipo puede pedir la bandeja de Joan');
    assert.throws(() => sql("select public.listar_solicitudes_abiertas('no-es-la-clave')"), /clave/);
    [GER, ASE, OTRO].forEach(c => [1, 2, 3].forEach(i =>
      sinNada(como(c, 'public.mis_cuentas_de_pago(' + ids[i] + ')'), [i], 'mis_cuentas_de_pago pedida por ' + c)));
    ['public.ficha_de_mi_base(text)', 'public.gerente_registros()', 'public.gerente_archivos(text)', 'public.mi_cartera()'].forEach(f =>
      assert.equal(sql("select has_function_privilege('anon', '" + f + "', 'execute')"), 'f', f + ' se puede llamar con la llave pública'));
  });

  test('NINGUNA FUNCIÓN SIN ARGUMENTOS le devuelve a nadie las cuentas de un cliente ajeno', () => {
    /* La barrida: todo lo que una sesión puede llamar sin decir de quién
       (PostgREST la deja llamar con {}), como cada uno. Si mañana aparece una
       función nueva que devuelva cuentas sin reja, esto lo dice. Las que
       revientan (pg_net, Supabase de verdad) no devuelven nada: no cuentan. */
    const fns = sql("select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'" +
      " and p.pronargs = p.pronargdefaults and p.prorettype <> 'trigger'::regtype" +
      " and has_function_privilege('authenticated', p.oid, 'execute') order by 1").split(/\r?\n/).filter(Boolean);
    /* TG_VER_BARRIDA=1 lista lo que se barre (el 23-oct eran 22 funciones). */
    if (process.env.TG_VER_BARRIDA) console.log(fns.join('\n'));
    assert.ok(fns.includes('mi_cartera()') && fns.includes('gerente_registros()'), 'la barrida no ve las funciones del equipo: ' + fns.join(', '));
    const ajenos = { [GER]: [2], [ASE]: [2, 3], [OTRO]: [1, 3], [NADIE]: [1, 2, 3] };
    let llamadas = 0;
    Object.keys(ajenos).forEach(c => fns.forEach(f => {
      const nombre = f.replace(/\(.*$/, '');
      let t;
      try { t = como(c, 'public.' + nombre + '()'); llamadas++; } catch (e) { return; }
      sinNada(t, ajenos[c], nombre + '() pedida por ' + c);
    }));
    assert.ok(llamadas >= 4 * 5, 'la barrida casi no llamó nada (' + llamadas + ' llamadas): no prueba lo que dice');
  });
});
