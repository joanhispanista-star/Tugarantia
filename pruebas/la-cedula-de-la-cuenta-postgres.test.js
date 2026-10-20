/* ============================================================================
 * LA CÉDULA ES LA DEL REGISTRO DE LA CUENTA, EN LA BASE — 20 de octubre de 2026
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/la-cedula-de-la-cuenta-postgres.test.js
 *
 * El teléfono lo controla quien lo tiene en la mano: la reja de verdad contra
 * la cédula de otra persona en la cuenta de uno tiene que estar en la base
 * (base/20261020_la_cedula_de_la_cuenta.sql). Esta prueba monta un PostgreSQL
 * con las migraciones de base/ en orden (el mismo andamio de Supabase que las
 * otras de PostgreSQL), corre el archivo nuevo DOS veces (idempotente) junto a
 * base/20261019_aparato_del_telefono.sql, y llama lo que la app llama:
 *
 *   · V1: con la sesión de Pedro, la lectura de María no entra, y las fotos de
 *     Pedro NO se reemplazan; tampoco si la última fila de Pedro dice el
 *     documento de María;
 *   · la propia persona sí sube, con su lectura y su cotejo; unas fotos sin
 *     código no pisan las que entraron con código; sin registro no se sabe;
 *   · V6: la cédula de María escrita con el celular de Pedro ya no le tumba
 *     el registro a María, y la misma persona no se duplica;
 *   · 20-oct-2026, buena fe (A1, A2): quien corrige su documento entra como
 *     fila nueva y su cédula pasa la reja; una fila escrita sin sesión con
 *     otro documento ya no le rechaza a la titular la suya, y cuando no se
 *     sabe cuál es el documento de la cuenta el motivo es «en_duda».
 *
 * Sin TG_PG_BIN se salta (la parte que lee el archivo corre siempre). Las dos
 * cédulas son de mentira: las de pruebas/la-persona-no-el-intento.test.js.
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
const NOMBRE = '20261020_la_cedula_de_la_cuenta.sql';
const APARATO = '20261019_aparato_del_telefono.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');

const CEL_PEDRO = '3109998877';
const CEL_MARIA = '3001112233';
const FOTO = q => "'data:image/jpeg;base64," + q + "'";
const LECTURA = (doc, nombres) => ({ documento: doc, nombres, apellidos: 'X', nacimiento: '1988-03-12', lectura: 'anchos_fijos' });

describe('el archivo de la migración', () => {
  test('no copia ninguna función: las lee vivas y las parcha con su huella', () => {
    assert.equal(/create\s+or\s+replace\s+function/i.test(SQL), false, 'copia el cuerpo de una función');
    assert.match(SQL, /pg_get_functiondef\(f\)/);
    ['b7e7ceeaa4f8434a1b70014dff4af9c8', 'f5157a717949e80c4558e53b0aaa43e6', '901e0c7ad038900db551700fa25965c9'].forEach(h =>
      assert.ok(SQL.indexOf("huella constant text := '" + h + "'") > 0, 'falta la huella ' + h));
    assert.match(SQL, /md5\(replace\(cuerpo, chr\(13\), ''\)\) <> huella/);
    /* Idempotente: cada parche mira si ya está antes de tocar nada. */
    assert.match(SQL, /position\('cedula_rechazada' in cuerpo\) > 0/);
    assert.match(SQL, /position\('cedula_repetida_al_registrarse' in cuerpo\) > 0/);
    assert.match(SQL, /add column if not exists documento/);
  });

  test('las huellas son las de los cuerpos que dejaron sus migraciones', () => {
    /* Si alguien cambia una de esas funciones en otra migración, esta prueba
       lo dice antes que el editor de Supabase. */
    const crypto = require('node:crypto');
    const cuerpo = (f, fn) => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/\r/g, '');
      const i = t.indexOf('create or replace function public.' + fn + '(');
      const a = t.indexOf('$$', i) + 2;
      return t.slice(a, t.indexOf('$$', a));
    };
    const md5 = s => crypto.createHash('md5').update(s).digest('hex');
    assert.equal(md5(cuerpo('20260922c_verificacion_cedula.sql', 'registro_archivos_guardar')), 'b7e7ceeaa4f8434a1b70014dff4af9c8');
    assert.equal(md5(cuerpo('20260909_una_sola_puerta.sql', 'registrar_abierto')), 'f5157a717949e80c4558e53b0aaa43e6');
    assert.equal(md5(cuerpo('20260921_platachat_app.sql', 'registrar_abierto_app')), '901e0c7ad038900db551700fa25965c9');
    /* Y ninguna migración posterior las reescribe. */
    const despues = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f) && f > '20260922c_verificacion_cedula.sql' && f !== NOMBRE)
      .map(f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8')).join('\n');
    assert.equal(/function public\.(registro_archivos_guardar|registrar_abierto|registrar_abierto_app)\s*\(/.test(despues), false);
  });
});

describe('la cédula de la cuenta, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
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
  /* Como la app: con la sesión de esa cuenta. */
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false);" +
    ' select (' + q + ')::text').split('\n').pop());
  const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
  const subir = (cel, archivos, huella) => comoCuenta(cel,
    'public.registro_archivos_guardar(' + jb(archivos) + ', ' + jb(huella || {}) + ')');
  const fotoDe = (cel, tipo) => sql("select imagen || '|' || coalesce(documento, '') from public.registro_archivos where celular = '" + cel + "' and tipo = '" + tipo + "'");
  const registro = (cel, doc, extra) => sql("insert into public.registros (codigo, cedula, nombre, telefono, datos" + (extra ? ', creado_en' : '') + ") values ('', '" + doc +
    "', 'Prueba', '" + cel + "', " + jb({ documento: doc }) + (extra ? ', ' + extra : '') + ')');

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-cedula-'));
    puerto = 56800 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && f !== NOMBRE && f !== APARATO).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    ['20261007_una_puerta.sql', '20261007c_una_puerta_cierres.sql', '20261008_condiciones_aceptadas.sql', APARATO].forEach(f => {
      const r = archivo(path.join(RAIZ, 'base', f), true);
      assert.equal(r.status, 0, f + ' no corrió en el banco: ' + r.stderr);
    });
    /* El archivo nuevo, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      if (i === 1) assert.match(r.stderr, /Listo: la cédula ya no se cuela en la cuenta de otro/, r.stderr);
      else assert.match(r.stderr, /ya rechaza la cédula de otro documento: no se cambió nada/, r.stderr);
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('la autocomprobación corre los tres caminos y no deja nada suyo', () => {
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /1 sin-sesion; 2 sin-registro-no; 3 sin-lectura-no-pisa;/, r.stderr);
    assert.equal(sql("select count(*) from public.registro_archivos where celular = '3009990820'"), '0');
  });

  test('V1 — CON LA SESIÓN DE PEDRO, LA LECTURA DE MARÍA NO ENTRA, Y LAS FOTOS DE PEDRO NO SE REEMPLAZAN', () => {
    registro(CEL_PEDRO, '79111222');
    /* Pedro subió las suyas, con su lectura. */
    const suyas = subir(CEL_PEDRO, { cedula_frente: 'data:image/jpeg;base64,FRENTEPEDRO', cedula_reverso: 'data:image/jpeg;base64,RESPALDOPEDRO' },
      { cedula_leida: LECTURA('0079111222', 'PEDRO LUIS') });
    assert.equal(suyas.ok, true, JSON.stringify(suyas));
    assert.equal(fotoDe(CEL_PEDRO, 'cedula_frente'), 'data:image/jpeg;base64,FRENTEPEDRO|79111222');
    /* El lote de María, con la sesión de Pedro. */
    const r = subir(CEL_PEDRO, { cedula_frente: 'data:image/jpeg;base64,FRENTEMARIA', cedula_reverso: 'data:image/jpeg;base64,RESPALDOMARIA',
      selfie: 'data:image/jpeg;base64,CARA' }, { cedula_leida: LECTURA('0052123456', 'MARIA JOSE'), gps: { lat: 4.6, lng: -74.1 } });
    assert.deepEqual(r, { ok: false, motivo: 'otro_documento' });
    assert.equal(fotoDe(CEL_PEDRO, 'cedula_frente'), 'data:image/jpeg;base64,FRENTEPEDRO|79111222', 'las fotos de Pedro quedaron reemplazadas por las de María');
    assert.equal(fotoDe(CEL_PEDRO, 'cedula_reverso'), 'data:image/jpeg;base64,RESPALDOPEDRO|79111222');
    assert.equal(sql("select count(*) from public.registro_archivos where celular = '" + CEL_PEDRO + "' and tipo = 'selfie'"), '0',
      'la selfie de esa llamada entró');
    const h = json("select huella from public.registros where telefono = '" + CEL_PEDRO + "'");
    assert.equal(h.cedula_leida.documento, '0079111222', 'la lectura de María quedó en la huella de Pedro');
    assert.equal(h.gps, undefined, 'el GPS de esa llamada entró');
    assert.equal(h.cedula_rechazada.motivo, 'otro_documento', 'Joan no tiene cómo saber que pasó');
    assert.equal(/52123456|MARIA/.test(JSON.stringify(h)), false, 'quedó un dato de María en la huella de Pedro');
  });

  test('V1 — …ni aunque la última fila de Pedro diga el documento de María: sus fotos con código no se pisan', () => {
    /* Pedro abre un registro nuevo escribiendo el documento de María. */
    registro(CEL_PEDRO, '52123456', "now() + interval '1 minute'");
    const r = subir(CEL_PEDRO, { cedula_frente: 'data:image/jpeg;base64,FRENTEMARIA' }, { cedula_leida: LECTURA('52123456', 'MARIA JOSE') });
    assert.deepEqual(r, { ok: false, motivo: 'otro_documento' });
    assert.equal(fotoDe(CEL_PEDRO, 'cedula_frente'), 'data:image/jpeg;base64,FRENTEPEDRO|79111222');
  });

  test('LA PROPIA PERSONA SÍ SUBE, con su lectura y su cotejo; y la vuelve a subir si repite', () => {
    registro(CEL_MARIA, '52123456');
    const r = subir(CEL_MARIA, { cedula_frente: FOTO('F1').slice(1, -1), cedula_reverso: FOTO('R1').slice(1, -1) },
      { cedula_leida: LECTURA('0052123456', 'X') });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.guardados.sort(), ['cedula_frente', 'cedula_reverso']);
    assert.deepEqual(r.descartados, []);
    assert.equal(fotoDe(CEL_MARIA, 'cedula_reverso'), 'data:image/jpeg;base64,R1|52123456');
    const h = json("select huella from public.registros where telefono = '" + CEL_MARIA + "'");
    assert.equal(h.cotejo.documento, 'igual', 'el cotejo dejó de correr');
    /* Repite el respaldo (salió borroso): el mismo documento sí lo reemplaza. */
    const otra = subir(CEL_MARIA, { cedula_reverso: FOTO('R2').slice(1, -1) }, { cedula_leida: LECTURA('52123456', 'X') });
    assert.equal(otra.ok, true);
    assert.equal(fotoDe(CEL_MARIA, 'cedula_reverso'), 'data:image/jpeg;base64,R2|52123456');
  });

  test('UNAS FOTOS SIN CÓDIGO NO PISAN LAS QUE ENTRARON CON CÓDIGO (V2 en la base): vuelven en «descartados», y la selfie entra', () => {
    const r = subir(CEL_MARIA, { cedula_frente: FOTO('SINCODIGO').slice(1, -1), selfie: FOTO('CARA').slice(1, -1) }, {});
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.descartados, ['cedula_frente']);
    assert.deepEqual(r.guardados, ['selfie']);
    assert.equal(fotoDe(CEL_MARIA, 'cedula_frente'), 'data:image/jpeg;base64,F1|52123456');
  });

  test('…y a una cuenta sin fotos con código, entran como siempre (sin documento)', () => {
    const cel = '3201112233';
    registro(cel, '1029384756');
    const r = subir(cel, { cedula_frente: FOTO('GRIS').slice(1, -1) }, {});
    assert.equal(r.ok, true);
    assert.deepEqual(r.guardados, ['cedula_frente']);
    assert.equal(fotoDe(cel, 'cedula_frente'), 'data:image/jpeg;base64,GRIS|');
  });

  test('SIN REGISTRO CON QUÉ COMPARAR, NO SE SABE: la lectura no entra (ni sus fotos)', () => {
    const cel = '3201112299';
    const r = subir(cel, { cedula_reverso: FOTO('R').slice(1, -1) }, { cedula_leida: LECTURA('52123456', 'X') });
    assert.deepEqual(r, { ok: false, motivo: 'sin_documento' });
    assert.equal(sql("select count(*) from public.registro_archivos where celular = '" + cel + "'"), '0');
    /* Y un documento vacío en la lectura tampoco es «el mismo». */
    registro(cel, '');
    const v = subir(cel, { cedula_reverso: FOTO('R').slice(1, -1) }, { cedula_leida: LECTURA('', 'X') });
    assert.equal(v.motivo, 'sin_documento');
  });

  test('CONVIVE CON EL TELÉFONO DE VERDAD (20261019): la subida no se lleva lo que informó el teléfono', () => {
    const cel = '3201112244';
    registro(cel, '1029384700');
    const a = comoCuenta(cel, "public.aparato_anotar('registro', '{\"plataforma\":\"android\",\"modelo\":\"SM-A155M\"}'::jsonb)");
    assert.equal(a.en_registro, true, JSON.stringify(a));
    const r = subir(cel, { cedula_reverso: FOTO('R').slice(1, -1) }, { cedula_leida: LECTURA('1029384700', 'X') });
    assert.equal(r.ok, true);
    const h = json("select huella from public.registros where telefono = '" + cel + "'");
    assert.equal(h.aparato_telefono.modelo, 'SM-A155M', 'la subida borró el teléfono informado');
    assert.equal(h.cedula_leida.documento, '1029384700');
  });

  test('V6 — LA CÉDULA DE MARÍA ESCRITA CON EL CELULAR DE PEDRO YA NO LE TUMBA EL REGISTRO A MARÍA', () => {
    const doc = '1018447274', celP = '3156667788', celM = '3157778899';
    const r1 = json("select public.registrar_abierto('" + celP + "', 'Pedro Gómez', '" + doc + "', '{}'::jsonb)");
    assert.equal(r1.ok, true);
    const r2 = json("select public.registrar_abierto('" + celM + "', 'María Rodríguez', '" + doc + "', '{}'::jsonb)");
    assert.equal(r2.ok, true);
    assert.equal(sql("select count(*) from public.registros where telefono = '" + celM + "'"), '1',
      'el registro de María no entró a la bandeja: la cédula escrita por otro se lo tumbó');
    const h = json("select huella from public.registros where telefono = '" + celM + "'");
    assert.ok(h && h.cedula_repetida_al_registrarse, 'no quedó marcado que esa cédula ya estaba con otro celular');
    /* La fila de Pedro no se tocó, y no se marcó a sí misma. */
    assert.equal(sql("select coalesce(huella::text, '') from public.registros where telefono = '" + celP + "'"), '');
    /* La misma persona que se vuelve a registrar con su celular no se duplica. */
    json("select public.registrar_abierto('" + celM + "', 'María Rodríguez', '" + doc + "', '{}'::jsonb)");
    assert.equal(sql("select count(*) from public.registros where telefono = '" + celM + "'"), '1', 'el doble toque duplicó la fila');
  });

  test('V6 — …y lo mismo por la puerta de PlataChat, con su etiqueta', () => {
    const doc = '1018447275', celP = '3156667700', celM = '3157778800';
    json("select public.registrar_abierto_app('" + celP + "', 'Pedro Gómez', '" + doc + "', '{}'::jsonb, 'platachat')");
    json("select public.registrar_abierto_app('" + celM + "', 'María Rodríguez', '" + doc + "', '{}'::jsonb, 'platachat')");
    assert.equal(sql("select count(*) || '|' || min(app) from public.registros where telefono = '" + celM + "'"), '1|platachat');
    assert.ok(json("select huella from public.registros where telefono = '" + celM + "'").cedula_repetida_al_registrarse);
  });

  /* 20-oct-2026, buena fe — la verificación del rediseño confirmó que el
     atacante ya no cruza cédulas, pero que la persona de buena fe perdía su
     propia cédula en la base (A1, A2 de la verificación). Las tres fallan con
     la migración de la mañana (5724dd5). */
  test('A2 — QUIEN CORRIGE SU DOCUMENTO NO PIERDE SU CÉDULA: la corrección entra como fila nueva, marcada y sin pisar la vieja, y la reja acepta su lectura', () => {
    const cel = '3201110001';
    /* La primera vez tecleó mal su documento (la bandeja entró; la cuenta no). */
    const r1 = json("select public.registrar_abierto('" + cel + "', 'María Rodríguez', '52123465', '{\"documento\":\"52123465\"}'::jsonb)");
    assert.equal(r1.ok, true);
    /* Escanea su cédula, el documento queda bien, y vuelve a tocar «Abrir mi cuenta». */
    const r2 = json("select public.registrar_abierto('" + cel + "', 'María Rodríguez', '52123456', '{\"documento\":\"52123456\"}'::jsonb)");
    assert.equal(r2.ok, true);
    assert.equal(sql("select string_agg(cedula, ',' order by id) from public.registros where telefono = '" + cel + "'"), '52123465,52123456',
      'la corrección no entró a la bandeja: la reja va a comparar su cédula con la fila vieja');
    assert.equal(sql("select coalesce(huella::text, '') || '|' || (datos ->> 'documento') from public.registros where telefono = '" + cel + "' and cedula = '52123465'"),
      '|52123465', 'la fila vieja se tocó');
    assert.ok(json("select huella from public.registros where telefono = '" + cel + "' and cedula = '52123456'").otro_documento_mismo_celular,
      'la corrección no quedó marcada para Joan');
    /* El doble toque sigue sin duplicar. */
    json("select public.registrar_abierto('" + cel + "', 'María Rodríguez', '52123456', '{\"documento\":\"52123456\"}'::jsonb)");
    assert.equal(sql("select count(*) from public.registros where telefono = '" + cel + "'"), '2', 'el doble toque duplicó la fila');
    /* Y su cédula, con su lectura, entra. */
    const r = subir(cel, { cedula_frente: 'data:image/jpeg;base64,FRENTEMARIA', cedula_reverso: 'data:image/jpeg;base64,RESPALDOMARIA' },
      { cedula_leida: LECTURA('0052123456', 'MARIA JOSE') });
    assert.equal(r.ok, true, 'la reja le rechazó a María su propia cédula: ' + JSON.stringify(r));
    assert.deepEqual(r.guardados.sort(), ['cedula_frente', 'cedula_reverso']);
    assert.equal(fotoDe(cel, 'cedula_reverso'), 'data:image/jpeg;base64,RESPALDOMARIA|52123456');
    assert.equal(json("select huella from public.registros where telefono = '" + cel + "' and cedula = '52123456'").cotejo.documento, 'igual');
  });

  test('A2 — …y lo mismo por la puerta de PlataChat: la corrección entra con su etiqueta, y el doble toque no duplica', () => {
    const cel = '3201110004';
    json("select public.registrar_abierto_app('" + cel + "', 'María Rodríguez', '1022334465', '{}'::jsonb, 'platachat')");
    json("select public.registrar_abierto_app('" + cel + "', 'María Rodríguez', '1022334456', '{}'::jsonb, 'platachat')");
    json("select public.registrar_abierto_app('" + cel + "', 'María Rodríguez', '1022334456', '{}'::jsonb, 'platachat')");
    assert.equal(sql("select string_agg(cedula || ':' || app, ',' order by id) from public.registros where telefono = '" + cel + "'"),
      '1022334465:platachat,1022334456:platachat', 'la corrección no entró, o el doble toque la duplicó');
    assert.equal(sql("select coalesce(huella::text, '') from public.registros where telefono = '" + cel + "' and cedula = '1022334465'"), '');
    assert.ok(json("select huella from public.registros where telefono = '" + cel + "' and cedula = '1022334456'").otro_documento_mismo_celular);
  });

  test('A1 — SIN SESIÓN, UNA FILA CON OTRO DOCUMENTO Y EL CELULAR DE LA TITULAR YA NO LE RECHAZA SU CÉDULA, y la lectura va a SU fila', () => {
    const cel = '3201110002';
    registro(cel, '1029384711');                                  // su registro, que Joan ya atendió
    sql("update public.registros set estado = 'atendido' where telefono = '" + cel + "'");
    /* Cualquiera, sin sesión, con ese celular y otro documento: la fila entra y es la última. */
    const a = json("select public.registrar_abierto('" + cel + "', 'Otro Nombre', '1234567890', '{}'::jsonb)");
    assert.equal(a.ok, true);
    assert.equal(sql("select count(*) from public.registros where telefono = '" + cel + "'"), '2');
    const r = subir(cel, { cedula_reverso: 'data:image/jpeg;base64,SUYA' }, { cedula_leida: LECTURA('1029384711', 'LA TITULAR') });
    assert.equal(r.ok, true, 'una fila escrita sin sesión le rechazó a la titular su propia cédula: ' + JSON.stringify(r));
    assert.equal(fotoDe(cel, 'cedula_reverso'), 'data:image/jpeg;base64,SUYA|1029384711');
    const suya = json("select huella from public.registros where telefono = '" + cel + "' and cedula = '1029384711'");
    assert.equal(suya.cotejo.documento, 'igual', 'el cotejo miró la fila del otro');
    const otra = sql("select coalesce(huella::text, '') from public.registros where telefono = '" + cel + "' and cedula = '1234567890'");
    assert.equal(/LA TITULAR|1029384711|cedula_leida|cedula_rechazada/.test(otra), false, 'la lectura de la titular quedó en la fila que escribió otro: ' + otra);
  });

  test('A1 — SI LOS REGISTROS DEL CELULAR DICEN DOCUMENTOS DISTINTOS y la lectura no es de ninguno, «en_duda» (no se afirma «otro documento»), y nada entra', () => {
    const cel = '3201110003';
    registro(cel, '1029384722');
    registro(cel, '1029384733', "now() + interval '1 minute'");
    const r = subir(cel, { cedula_reverso: 'data:image/jpeg;base64,X', selfie: 'data:image/jpeg;base64,C' },
      { cedula_leida: LECTURA('52123456', 'X'), gps: { lat: 4.6, lng: -74.1 } });
    assert.deepEqual(r, { ok: false, motivo: 'en_duda' });
    assert.equal(sql("select count(*) from public.registro_archivos where celular = '" + cel + "'"), '0', 'algo de esa llamada entró');
    /* Un registro que Joan DESCARTÓ no sirve para aceptar una cédula. */
    sql("update public.registros set estado = 'descartado', cedula = '52123456', datos = '{\"documento\":\"52123456\"}'::jsonb" +
        " where telefono = '" + cel + "' and cedula = '1029384733'");
    assert.deepEqual(subir(cel, { cedula_reverso: 'data:image/jpeg;base64,X' }, { cedula_leida: LECTURA('52123456', 'X') }),
      { ok: false, motivo: 'otro_documento' });
  });

  test('los permisos no cambiaron: la subida solo con sesión; el registro abierto sin ella', () => {
    assert.equal(sql("select has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')"), 'f');
    assert.equal(sql("select has_function_privilege('authenticated', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')"), 't');
    assert.equal(sql("select has_function_privilege('anon', 'public.registrar_abierto(text, text, text, jsonb)', 'execute')"), 't');
    assert.equal(sql("select has_function_privilege('anon', 'public.registrar_abierto_app(text, text, text, jsonb, text)', 'execute')"), 't');
  });
});
