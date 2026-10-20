/* ============================================================================
 * EL TELÉFONO DE VERDAD, CONTRA UN POSTGRESQL DE VERDAD — opcional
 * 19 de octubre de 2026.
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/aparato-postgres.test.js
 *
 * Sin TG_PG_BIN se salta, como las otras de PostgreSQL (de donde toma el mismo
 * andamio de Supabase). Con él: corre todas las migraciones de base/ en orden,
 * las del 7 y el 8-oct, y después base/20261019_aparato_del_telefono.sql DOS
 * veces (idempotente), y prueba LLAMANDO lo que la app y el CRM van a llamar:
 *
 *   · anotar guarda lo validado y lo que dijo la conexión (IP, User-Agent,
 *     sec-ch-ua), y tira lo que no cumple;
 *   · con 'registro' deja huella.aparato_telefono en el último registro de ese
 *     celular SIN pisar el resto de la huella, y una subida de fotos después
 *     (registro_archivos_guardar) no se lo lleva;
 *   · listar_registros lo devuelve (es lo que lee el CRM);
 *   · el tope de 20 por día;
 *   · aparatos_de con la clave trae lo anotado y la constancia de la
 *     aceptación; sin clave, nada; y nadie toca la tabla desde afuera.
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
const NOMBRE = '20261019_aparato_del_telefono.sql';
const UA_CONGELADA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

describe('el teléfono de verdad, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
  /* La consulta va en un ARCHIVO y no en `-c`: en Windows los argumentos de la
     línea de comandos viajan en la página de códigos de la consola. */
  let nConsulta = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++nConsulta) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const json = q => JSON.parse(sql(q));
  /* Como la app: con la sesión de esa cuenta y las cabeceras de la petición. */
  const comoCuenta = (cel, q, cab) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false);" +
    " select set_config('request.headers', '" + JSON.stringify(cab || {}).replace(/'/g, "''") + "', false);" +
    ' select (' + q + ')::text').split('\n').pop());
  const declarado = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-aparato-'));
    puerto = 56400 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    /* La llave de servicio, con lo que Supabase le regala, para comprobar que
       también se le quita. */
    sql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
         grant usage on schema public to service_role;
         alter default privileges in schema public grant execute on functions to service_role;
         alter default privileges in schema public grant all on tables to service_role;`);
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && f !== NOMBRE).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    ['20261007_una_puerta.sql', '20261007c_una_puerta_cierres.sql', '20261008_condiciones_aceptadas.sql'].forEach(f => {
      const r = archivo(path.join(RAIZ, 'base', f), true);
      assert.equal(r.status, 0, f + ' no corrió en el banco: ' + r.stderr);
    });
    /* El archivo nuevo, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(() => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia: ' + r.stderr);
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la autocomprobación del archivo dice «listo» y ninguna FALLA', () => {
    /* psql manda los NOTICE por stderr: se corre otra vez (la tercera) para leerlos. */
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    const notas = String(r.stderr || '');
    assert.equal(r.status, 0, notas);
    assert.doesNotMatch(notas, /FALLA/, notas);
    assert.match(notas, /Aparato: 1 sin-sesion-no; 2 cuando-cerrado; 3 anota; 4 lo-invalido-no-entra; 5 sin-registro-no-falla; 6 tres-filas; 7 permisos; 8 definer;/, notas);
    assert.match(notas, /Aparato: listo/);
    /* Y no dejó nada suyo. */
    assert.equal(sql("select count(*) from public.aparatos_vistos where celular = '3009990819'"), '0');
  });

  test('al registrarse: guarda lo validado y lo de la conexión, y lo deja en la huella del registro sin pisar lo demás', () => {
    const cel = '3101230001';
    sql("insert into public.registros (codigo, cedula, nombre, telefono, huella) values " +
        "('', '1029384274', 'Ana', '300 000 0000', null), " +
        "('', '1029384274', 'Ana', '" + cel + "', '{\"ip\":\"181.50.1.2\",\"aparato\":\"viejo\",\"gps\":{\"lat\":4.6}}')");
    const j = comoCuenta(cel, 'public.aparato_anotar(\'registro\', ' + declarado({
      plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14', navegador: 'Chrome', navegador_version: '129',
      via: 'app_tu_garantia', fuente_modelo: 'client_hints', movil: true, sin_modelo: 'el_navegador_no_lo_dice', inventado: 'x' }) + ')',
      { 'user-agent': UA_CONGELADA, 'x-forwarded-for': '181.50.1.2, 10.0.0.1',
        'sec-ch-ua': '"Chromium";v="129", "Google Chrome";v="129"', 'sec-ch-ua-platform': '"Android"', 'sec-ch-ua-mobile': '?1' });
    assert.equal(j.ok, true, JSON.stringify(j));
    assert.equal(j.en_registro, true);
    /* Lo que no es un campo conocido no entra; y el «sin modelo» con modelo, tampoco. */
    assert.deepEqual(j.declarado, { plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14', navegador: 'Chrome',
      navegador_version: '129', via: 'app_tu_garantia', fuente_modelo: 'client_hints', movil: true });

    const fila = json("select row_to_json(a) from public.aparatos_vistos a where celular = '" + cel + "'");
    assert.equal(fila.cuando, 'registro');
    assert.equal(fila.ua_cabecera, UA_CONGELADA);
    assert.equal(fila.ip, '181.50.1.2, 10.0.0.1');
    assert.equal(fila.ch_cabecera['sec-ch-ua-platform'], '"Android"');
    assert.equal(fila.declarado.modelo, 'SM-A155M');

    const h = json("select huella from public.registros where telefono = '" + cel + "'");
    assert.equal(h.aparato_telefono.modelo, 'SM-A155M');
    assert.ok(h.aparato_telefono.momento, 'sin la hora en que lo informó');
    assert.equal(h.ip, '181.50.1.2', 'pisó la IP de la huella');
    assert.equal(h.gps.lat, 4.6, 'pisó el GPS de la huella');
    /* El otro registro (otro celular) no se tocó. */
    assert.equal(sql("select huella is null from public.registros where telefono = '300 000 0000'"), 't');
  });

  test('una subida de fotos después NO se lleva lo informado, y listar_registros lo devuelve', () => {
    const cel = '3101230001';
    const r = comoCuenta(cel, "public.registro_archivos_guardar('{}'::jsonb, '{}'::jsonb)", { 'user-agent': UA_CONGELADA });
    assert.equal(r.ok, true, JSON.stringify(r));
    const h = json("select huella from public.registros where telefono = '" + cel + "'");
    assert.equal(h.aparato_telefono.modelo, 'SM-A155M', 'registro_archivos_guardar borró lo que informó el teléfono');
    assert.equal(h.aparato, UA_CONGELADA);
    const lista = json('select json_agg(x) from public.listar_registros(' + CLAVE + ", 'nuevo') x");
    const mio = lista.find(x => x.telefono === cel);
    assert.equal(mio.huella.aparato_telefono.modelo, 'SM-A155M', 'el CRM no lo recibe');
  });

  /* 20-oct-2026, revisión (F16) — el teléfono de otro día no pisa el del
     registro. La clienta se registra el día 1 desde el teléfono 1; el día 4
     vuelve a registrarse desde otro (el camino «ya tenías cuenta», que no crea
     fila nueva). Antes, el teléfono 2 quedaba en la fila del día 1. */
  test('OTRO DÍA NO PISA: lo informado al registrarse no se reemplaza, y en un registro viejo no se escribe', () => {
    const cel = '3101230011';
    sql("insert into public.registros (codigo, cedula, nombre, telefono, huella) values ('', '1029384275', 'Bea', '" + cel + "', " +
        "'{\"ip\":\"181.50.1.2\",\"momento\":\"2026-10-01T15:00:00Z\"}')");
    const uno = comoCuenta(cel, "public.aparato_anotar('registro', " + declarado({ plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14' }) + ')');
    assert.equal(uno.en_registro, true, JSON.stringify(uno));
    /* El teléfono 2, en la misma fila: no la pisa, y dice por qué. */
    const dos = comoCuenta(cel, "public.aparato_anotar('registro', " + declarado({ plataforma: 'android', modelo: 'RMX3710', sistema_version: '13' }) + ')');
    assert.equal(dos.ok, true);
    assert.equal(dos.en_registro, false, 'el teléfono de después pisó el del registro: ' + JSON.stringify(dos));
    assert.equal(dos.registro, 'ya_lo_tenia');
    assert.equal(json("select huella -> 'aparato_telefono' from public.registros where telefono = '" + cel + "'").modelo, 'SM-A155M');
    /* Y no se pierde: queda en aparatos_vistos, con su hora. */
    assert.equal(sql("select count(*) from public.aparatos_vistos where celular = '" + cel + "' and declarado ->> 'modelo' = 'RMX3710'"), '1');

    /* Un registro de hace tres días, sin teléfono informado: lo de hoy no es
       «desde dónde se registró». */
    const cel2 = '3101230012';
    sql("insert into public.registros (codigo, cedula, nombre, telefono, huella, creado_en) values ('', '1029384276', 'Caro', '" + cel2 + "', " +
        "'{\"ip\":\"181.50.1.3\"}', now() - interval '3 days')");
    const tres = comoCuenta(cel2, "public.aparato_anotar('registro', " + declarado({ plataforma: 'android', modelo: 'SM-A155M' }) + ')');
    assert.equal(tres.en_registro, false, 'escribió el teléfono de hoy en un registro de hace tres días: ' + JSON.stringify(tres));
    assert.equal(tres.registro, 'de_otro_dia');
    assert.equal(sql("select huella ? 'aparato_telefono' from public.registros where telefono = '" + cel2 + "'"), 'f');
    assert.equal(sql("select count(*) from public.aparatos_vistos where celular = '" + cel2 + "'"), '1');
  });

  /* 20-oct-2026, revisión (F2) — la IP que agrega el proxy va AL FINAL de
     x-forwarded-for. Antes se guardaban los primeros 80 caracteres: quien
     rellenaba la cabecera desde su teléfono borraba la IP de verdad. */
  test('LA CADENA DE IPs: se guarda entera, y si es larguísima se queda su FINAL, desde una IP entera', () => {
    const cel = '3101230013';
    const relleno = Array.from({ length: 12 }, (_, i) => '10.0.0.' + (i + 1)).join(', ');
    const cadena = '181.50.1.2, ' + relleno + ', 200.1.2.3';
    assert.ok(cadena.length > 80);
    comoCuenta(cel, "public.aparato_anotar('solicitud', '{}'::jsonb)", { 'x-forwarded-for': cadena });
    assert.equal(sql("select ip from public.aparatos_vistos where celular = '" + cel + "'"), cadena,
      'la cadena se cortó y se perdió lo que agrega el proxy');
    /* Más de 400: el final, sin media IP al principio, y marcado con «…». */
    const larga = '181.50.1.2, ' + Array.from({ length: 60 }, (_, i) => '10.0.' + Math.floor(i / 250) + '.' + (i % 250 + 1)).join(', ') + ', 200.1.2.3';
    assert.ok(larga.length > 400);
    comoCuenta(cel, "public.aparato_anotar('aceptacion', '{}'::jsonb)", { 'x-forwarded-for': larga });
    const guardada = sql("select ip from public.aparatos_vistos where celular = '" + cel + "' and cuando = 'aceptacion'");
    assert.match(guardada, /^…,\s*10\.0\.0\.\d+, /, 'no empieza en una IP entera con la marca del corte: ' + guardada.slice(0, 40));
    assert.match(guardada, /, 200\.1\.2\.3$/, 'perdió la IP del final');
    assert.ok(guardada.length <= 403, 'guardó de más: ' + guardada.length);
  });

  test('sin registro (pedir o aceptar), anota igual y no toca ningún registro', () => {
    const cel = '3101230002';
    const j = comoCuenta(cel, "public.aparato_anotar('solicitud', " + declarado({ plataforma: 'ios', sistema_version: '26', navegador: 'Safari', sin_modelo: 'apple_no_lo_entrega' }) + ')');
    assert.equal(j.ok, true);
    assert.equal(j.en_registro, false);
    assert.equal(j.declarado.sin_modelo, 'apple_no_lo_entrega');
    /* Lo grande no entra, y lo que no es un objeto se toma como vacío. */
    assert.equal(comoCuenta(cel, "public.aparato_anotar('solicitud', " + declarado({ modelo: 'x'.repeat(3000) }) + ')').motivo, 'grande');
    assert.deepEqual(comoCuenta(cel, "public.aparato_anotar('solicitud', '[1,2]'::jsonb)").declarado, {});
    assert.equal(comoCuenta(cel, "public.aparato_anotar('otra_cosa', '{}'::jsonb)").motivo, 'cuando');
  });

  test('el tope: 20 por celular al día', () => {
    const cel = '3101230003';
    for (let i = 0; i < 20; i++) assert.equal(comoCuenta(cel, "public.aparato_anotar('solicitud', '{}'::jsonb)").ok, true);
    assert.equal(comoCuenta(cel, "public.aparato_anotar('solicitud', '{}'::jsonb)").motivo, 'tope');
    assert.equal(sql("select count(*) from public.aparatos_vistos where celular = '" + cel + "'"), '20');
    /* Otro celular no se ve frenado por este. */
    assert.equal(comoCuenta('3101230004', "public.aparato_anotar('solicitud', '{}'::jsonb)").ok, true);
  });

  test('aparatos_de: con la clave trae lo anotado y la constancia de la aceptación; sin clave, nada', () => {
    const cel = '3101230001';
    sql("insert into public.condiciones_aceptadas (solicitud_id, celular, huella) values (99, '" + cel + "', " +
        "'{\"ip\":\"181.50.1.9\",\"aparato\":\"" + UA_CONGELADA + "\"}')");
    const j = json('select public.aparatos_de(' + CLAVE + ", '+57 310 123 0001')");
    assert.equal(j.ok, true);
    const cuandos = j.aparatos.map(a => a.cuando + ':' + a.origen).sort();
    assert.deepEqual(cuandos, ['aceptacion:constancia', 'registro:telefono']);
    const reg = j.aparatos.find(a => a.cuando === 'registro');
    assert.equal(reg.declarado.modelo, 'SM-A155M');
    assert.equal(reg.ua, UA_CONGELADA);
    assert.equal(json('select public.aparatos_de(' + CLAVE + ", '123')").motivo, 'celular');
    let err = '';
    try { sql("select public.aparatos_de('otra-clave-que-no-es', '" + cel + "')"); } catch (e) { err = String(e.stderr || e.message); }
    assert.match(err, /clave de sincronizacion incorrecta/);
  });

  test('desde afuera, nadie: ni la tabla, ni anotar con la llave pública, ni leer con una sesión', () => {
    const negado = q => { let e = ''; try { sql(q); } catch (x) { e = String(x.stderr || x.message); } return e; };
    assert.match(negado('set role anon; select count(*) from public.aparatos_vistos'), /permission denied|permiso denegado/i);
    assert.match(negado('set role authenticated; select count(*) from public.aparatos_vistos'), /permission denied|permiso denegado/i);
    assert.match(negado("set role authenticated; insert into public.aparatos_vistos (celular, cuando) values ('3000000000', 'registro')"), /permission denied|permiso denegado/i);
    assert.match(negado("set role anon; select public.aparato_anotar('registro', '{}'::jsonb)"), /permission denied|permiso denegado/i);
    assert.match(negado('set role authenticated; select public.aparatos_de(' + CLAVE + ", '3101230001')"), /permission denied|permiso denegado/i);
    assert.match(negado('set role service_role; select count(*) from public.aparatos_vistos'), /permission denied|permiso denegado/i);
    /* Lo que sí: la sesión anota y la llave del CRM lee. */
    assert.equal(sql("select has_function_privilege('authenticated', 'public.aparato_anotar(text, jsonb)', 'execute')"), 't');
    assert.equal(sql("select has_function_privilege('anon', 'public.aparatos_de(text, text)', 'execute')"), 't');
  });
});
