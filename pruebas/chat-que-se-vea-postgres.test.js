/* ============================================================================
 * EL CHAT QUE SE VE, CONTRA UN POSTGRESQL DE VERDAD — opcional.
 * 19 de octubre de 2026.
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/chat-que-se-vea-postgres.test.js
 *
 * (En el Bash de Windows, `VAR=x node` no le llega a node: pásala con
 * spawnSync y su `env`.)
 *
 * Sin TG_PG_BIN se salta, como las otras de PostgreSQL (de donde toma el
 * mismo andamio de Supabase). Con él: corre TODAS las migraciones de base/ en
 * orden, después las dos de hoy DOS veces cada una, y prueba LLAMANDO:
 *
 *   · base/20261019_chat_quien_escribe.sql — la bandeja trae el nombre del
 *     registro de quien no tiene ficha, nunca en un hilo '0' + celular, y la
 *     ficha manda sobre el registro. Y si el cuerpo vivo de
 *     chat_conversaciones no es el de 20260922d, el archivo PARA y no toca
 *     nada (la huella md5).
 *   · base/20261019b_chat_sin_leer_sesion.sql — el cliente cuenta lo que le
 *     falta por leer SIN marcarlo leído (si lo marcara, Joan vería «Lo vio»
 *     sin que nadie leyera); y el CRM pregunta en qué hilo lee un celular, con
 *     la misma regla de llave_de_sesion (ficha junta, '0' + celular, celular).
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
const QUIEN = path.join(RAIZ, 'base', '20261019_chat_quien_escribe.sql');
const SIN_LEER = path.join(RAIZ, 'base', '20261019b_chat_sin_leer_sesion.sql');

/* Una ficha sin juntar con su celular, una junta con otro, y nada más. Los
   celulares de prueba empiezan por 399: no existe ningún móvil así. */
const SEMILLA = `
insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values
 ('52000111', '3991110001', '0001', 'Ana Con Ficha', '{}', now()),
 ('52000222', '3991110002', '0002', 'Beto Ya Junto', '{}', now());
update public.socios_historial set auth_vinculada_en = now() - interval '3 days', auth_celular = '3991110002'
 where cedula = '52000222';
insert into public.registros (codigo, cedula, nombre, telefono, datos, origen) values
 ('', '', 'Nombre Viejo', '3991110009', '{}', 'abierto'),
 ('', '', 'William Prueba', '+57 399 111 0009', '{}', 'abierto'),
 ('', '', 'El Del Numero De Ana', '3991110001', '{}', 'abierto'),
 ('', '', 'Carla Registrada', '3991110003', '{}', 'abierto');
update public.registros set creado_en = now() - interval '2 days' where nombre = 'Nombre Viejo';
insert into public.mensajes (cedula, de, texto, canal) values
 ('3991110009', 'socio', 'Hola, pedí 300.000', 'servicio'),
 ('03991110001', 'socio', 'soy yo, con el número de Ana', 'servicio'),
 ('52000111', 'panel', 'Ana, te escribo', 'cobranza');
`;

describe('el chat que se ve, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  /* Corre un archivo como lo corre el editor de Supabase (una transacción) y
     devuelve lo que dijo, notas incluidas. */
  const correr = f => {
    const r = spawnSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg',
      '-v', 'ON_ERROR_STOP=1', '-1', '-f', f], { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
    return { estado: r.status, notas: String(r.stderr || '') + String(r.stdout || '') };
  };
  const json = q => JSON.parse(sql(q));
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text")
    .split('\n').pop());
  let primeraQuien, segundaQuien, primeraSinLeer, segundaSinLeer;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-chat-'));
    puerto = 55100 + Math.floor(Math.random() * 300);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^20261019/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    fs.writeFileSync(path.join(dir, 'semilla.sql'), SEMILLA);
    archivo(path.join(dir, 'semilla.sql'));
    /* Dos veces cada una: idempotentes. */
    primeraQuien = correr(QUIEN);
    segundaQuien = correr(QUIEN);
    primeraSinLeer = correr(SIN_LEER);
    segundaSinLeer = correr(SIN_LEER);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  describe('base/20261019_chat_quien_escribe.sql', () => {

    test('se aplica, se comprueba sola, y la segunda vez no cambia nada', () => {
      assert.equal(primeraQuien.estado, 0, primeraQuien.notas);
      assert.doesNotMatch(primeraQuien.notas, /FALLO/, primeraQuien.notas);
      assert.match(primeraQuien.notas, /Listo: la bandeja dice quién escribe/, primeraQuien.notas);
      assert.equal(segundaQuien.estado, 0, segundaQuien.notas);
      assert.match(segundaQuien.notas, /ya trae el nombre del registro: no se cambió nada/, segundaQuien.notas);
      /* La comprobación limpia lo suyo. */
      assert.equal(sql("select count(*) from public.registros where telefono = '3990001019'"), '0');
      assert.equal(sql("select count(*) from public.mensajes where cedula in ('3990001019', '03990001019')"), '0');
    });

    test('el registrado sin ficha sale con SU nombre del registro más reciente; la ficha manda; el hilo «0» no tiene nombre', () => {
      const j = json('select public.chat_conversaciones(' + CLAVE + ')');
      const de = k => j.find(c => c.cedula === k);
      /* William: sin ficha, con dos registros (el viejo y el de hoy, escrito
         con +57 y espacios). Sale el de hoy. */
      assert.equal(de('3991110009').nombre_registro, 'William Prueba');
      assert.equal(de('3991110009').nombre, '', 'el nombre del registro se coló como nombre de ficha');
      /* Ana tiene ficha: manda la ficha, y el registro no se manda. */
      assert.equal(de('52000111').nombre, 'Ana Con Ficha');
      assert.equal(de('52000111').nombre_registro, '');
      /* El hilo '0' + el número de Ana: hay un registro con ese número, y NO
         sale. Ni el de la ficha ni el del registro. */
      assert.equal(de('03991110001').nombre, '');
      assert.equal(de('03991110001').nombre_registro, '',
        'un hilo sin juntar trae un nombre: Joan leería «es él» y le hablaría de la deuda a quien tenga el número');
      /* Lo de antes sigue llegando. */
      assert.equal(de('3991110009').sin_leer, 1);
      assert.equal(de('3991110009').sin_leer_canal.servicio, 1);
    });

    test('sin la clave no sale nada, y una sesión de cliente no la puede llamar', () => {
      let err = '';
      try { sql("select public.chat_conversaciones('una-que-no-es')"); } catch (e) { err = String(e.stderr || e.message); }
      assert.match(err, /clave incorrecta/);
      assert.equal(sql("select has_function_privilege('authenticated', 'public.chat_conversaciones(text)', 'execute')"), 'f');
      assert.equal(sql("select has_function_privilege('anon', 'public.chat_conversaciones(text)', 'execute')"), 't');
    });

    test('LA HUELLA: si el cuerpo vivo no es el de 20260922d, el archivo para y NO lo toca', () => {
      /* Lo que pasaría si alguien hubiera cambiado chat_conversaciones en la
         base después del 22-sep: copiarle encima la línea nueva borraría ese
         cambio en silencio. */
      const antes = sql("select pg_get_functiondef('public.chat_conversaciones(text)'::regprocedure)");
      sql("create or replace function public.chat_conversaciones(p_clave text) returns jsonb language plpgsql " +
          "security definer set search_path = public as $$ begin if not public.clave_ok(p_clave) then " +
          "raise exception 'clave incorrecta'; end if; return '[]'::jsonb; end $$;");
      const r = correr(QUIEN);
      assert.notEqual(r.estado, 0, 'reescribió una función que no era la que esperaba');
      assert.match(r.notas, /no es la de base\/20260922d \(huella [0-9a-f]{32}/, r.notas);
      assert.match(r.notas, /NO se tocó nada/);
      assert.equal(sql("select prosrc ~ 'nombre_registro' from pg_proc where oid = 'public.chat_conversaciones(text)'::regprocedure"), 'f',
        'tocó la función a pesar de la huella');
      /* Se deja como estaba para las demás pruebas. */
      const f = path.join(dir, 'devolver.sql');
      fs.writeFileSync(f, antes + ';\n');
      archivo(f, true);
      assert.equal(sql("select prosrc ~ 'nombre_registro' from pg_proc where oid = 'public.chat_conversaciones(text)'::regprocedure"), 't');
    });
  });

  describe('base/20261019b_chat_sin_leer_sesion.sql', () => {

    test('se aplica dos veces y las dos se comprueban solas', () => {
      [primeraSinLeer, segundaSinLeer].forEach(r => {
        assert.equal(r.estado, 0, r.notas);
        assert.doesNotMatch(r.notas, /FALLO/, r.notas);
        assert.match(r.notas, /Listo: el cliente cuenta sin marcar, y el CRM sabe dónde escribir/, r.notas);
      });
      assert.equal(sql("select count(*) from public.mensajes where cedula = '3990002019'"), '0');
    });

    test('el cliente cuenta lo del negocio por canal, SIN marcarlo visto, y al leer baja el suyo', () => {
      sql("delete from public.mensajes where cedula = '3991110003';" +
          "insert into public.mensajes (cedula, de, texto, canal) values " +
          "('3991110003', 'panel', 'te contesto en creditos', 'creditos')," +
          "('3991110003', 'equipo', 'y yo en cobranzas', 'cobranza')," +
          "('3991110003', 'socio', 'lo mío', 'servicio');");
      const j = comoCuenta('3991110003', 'public.chat_sin_leer_sesion()');
      assert.deepEqual(j, { ok: true, servicio: 0, cobranza: 1, creditos: 1, total: 2 });
      assert.equal(sql("select count(*) from public.mensajes where cedula = '3991110003' and de <> 'socio' and not visto"), '2',
        'contar marcó como visto: el CRM diría «Lo vio» sin que nadie leyera');
      comoCuenta('3991110003', "public.chat_leer_sesion('creditos', 0)");
      assert.deepEqual(comoCuenta('3991110003', 'public.chat_sin_leer_sesion()'),
        { ok: true, servicio: 0, cobranza: 1, creditos: 0, total: 1 });
    });

    test('la cuenta sin juntar cuenta en SU hilo aparte, no en el de la ficha', () => {
      /* Ana tiene un mensaje de Joan en su ficha (52000111, cobranza). Quien
         entra con el número de Ana sin estar junto lee el hilo '0' + celular
         y NO cuenta lo de la ficha. */
      const j = comoCuenta('3991110001', 'public.chat_sin_leer_sesion()');
      assert.equal(j.ok, true);
      assert.equal(j.total, 0, 'la cuenta sin juntar ve cuántos mensajes tiene la ficha de otra persona');
      /* Beto ya está junto: cuenta en el hilo de su ficha. */
      sql("insert into public.mensajes (cedula, de, texto, canal) values ('52000222', 'panel', 'Beto, listo', 'servicio')");
      assert.equal(comoCuenta('3991110002', 'public.chat_sin_leer_sesion()').servicio, 1);
    });

    test('sin sesión no cuenta nada, y la llave pública no la puede llamar', () => {
      assert.deepEqual(comoCuenta('', 'public.chat_sin_leer_sesion()'), { ok: false });
      assert.equal(sql("select has_function_privilege('anon', 'public.chat_sin_leer_sesion()', 'execute')"), 'f');
      assert.equal(sql("select has_function_privilege('public', 'public.chat_sin_leer_sesion()', 'execute')"), 'f');
      assert.equal(sql("select has_function_privilege('authenticated', 'public.chat_sin_leer_sesion()', 'execute')"), 't');
    });

    test('el hilo de un celular lo dice la base: ficha junta → su cédula; número de una ficha → «0»; si no, el celular', () => {
      const hilo = cel => json('select public.chat_hilo_de_celular(' + CLAVE + ", '" + cel + "')");
      assert.deepEqual(hilo('3991110002'), { ok: true, hilo: '52000222' });
      assert.deepEqual(hilo('+57 399 111 0001'), { ok: true, hilo: '03991110001' });
      assert.deepEqual(hilo('399 111 0009'), { ok: true, hilo: '3991110009' });
      assert.deepEqual(hilo('12345'), { ok: false, motivo: 'celular' });
    });

    test('el hilo pide la clave, y una sesión de cliente no lo puede preguntar', () => {
      let err = '';
      try { sql("select public.chat_hilo_de_celular('una-que-no-es', '3991110001')"); } catch (e) { err = String(e.stderr || e.message); }
      assert.match(err, /clave incorrecta/);
      assert.equal(sql("select has_function_privilege('authenticated', 'public.chat_hilo_de_celular(text, text)', 'execute')"), 'f');
      assert.equal(sql("select has_function_privilege('anon', 'public.chat_hilo_de_celular(text, text)', 'execute')"), 't');
      assert.equal(sql("select has_function_privilege('anon', 'public.llave_de_sesion(text)', 'execute')"), 'f',
        'llave_de_sesion quedó llamable desde afuera');
    });
  });
});
