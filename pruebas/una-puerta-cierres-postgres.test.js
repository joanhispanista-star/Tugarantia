/* ============================================================================
 * LOS CIERRES DE LA PUERTA ÚNICA CONTRA UN POSTGRESQL DE VERDAD — opcional
 * 7 de octubre de 2026 (segunda vuelta).
 *
 *   TG_PG_BIN="C:\Program Files\PostgreSQL\17\bin" node --test pruebas/una-puerta-cierres-postgres.test.js
 *
 * Sin TG_PG_BIN se salta, como pruebas/una-puerta-postgres.test.js (de donde
 * toma el mismo andamio de Supabase: un solo sitio, para que los dos no se
 * separen). Con él arranca un PostgreSQL de tirar, corre TODAS las
 * migraciones de base/ en orden, y después 20261007_una_puerta.sql y
 * 20261007c_una_puerta_cierres.sql, cada uno DOS veces (idempotentes).
 *
 * Cada prueba es un ataque que las tres revisiones del 7-oct hicieron
 * funcionar contra la primera versión (scratchpad/ataque-pg.js y
 * rev/cruce-pg.test.js), puesto acá para que no vuelva:
 *
 *   A  quien abre una cuenta con el celular de alguien que se registró hace
 *      días recibía su registro entero (cédula, dirección, referencias);
 *   C  la cuenta que se adelantó con el número de un cliente quedaba junta
 *      con su ficha con un toque;
 *   D  juntar podía unir la cuenta con la fila de nube de OTRA persona;
 *   E  una subida mudaba la unión de una fila vieja a otra persona;
 *   F  la clave nueva reiniciaba la cuenta de un gerente;
 *   H  deshacer dejaba el chat en un hilo que esa cuenta no lee;
 *   S0 ninguna ficha con cédula podía subir (codigo_propio NULL);
 *   S6 la solicitud de una cuenta sin juntar no se distinguía.
 *
 * Con TG_SIN_CIERRES=1 NO corre 20261007c: así se ve que A, E, S0 y S6
 * fallan sin ese archivo (la prueba de que cada cierre es el que tapa).
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BIN = process.env.TG_PG_BIN || '';
const SIN_CIERRES = process.env.TG_SIN_CIERRES === '1';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
/* El andamio de Supabase (roles, auth.users, auth.jwt…) es el de la otra
   prueba de PostgreSQL: se lee de ahí y no se copia. */
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = "'clave-de-prueba-larga-123'";

describe('los cierres de la puerta única en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto;
  const sql = (consulta, db) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const archivo = (f, una) => execFileSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = q => JSON.parse(sql(q));
  const comoCuenta = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());
  const juntar = (reg, ficha, nombre, por) => json('select public.vincular_cuenta_joan(' + CLAVE + ', ' + reg + ", '" + ficha + "', '"
    + (por || 'crm') + "', '{}'::jsonb, " + (nombre == null ? 'null' : "'" + nombre + "'") + ')');
  const ultimoRegistro = () => sql('select max(id) from public.registros');

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-c-'));
    puerto = 55100 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^20261007/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      try { archivo(copia, true); } catch (e) { /* las que dependen de Supabase de verdad */ }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);
    archivo(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), true);
    if (!SIN_CIERRES) {
      archivo(path.join(RAIZ, 'base', '20261007c_una_puerta_cierres.sql'), true);
      archivo(path.join(RAIZ, 'base', '20261007c_una_puerta_cierres.sql'), true);   // dos veces: idempotente
    }
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('A · quien abre la cuenta con el celular de un registro ajeno NO recibe sus datos', () => {
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen, creado_en) values ('', '52999888', 'Victima Registrada', '3101112233', '{\"documento\":\"52999888\",\"direccion\":\"Cra 1 # 2-3\",\"ref1_celular\":\"3150000000\"}', 'abierto', now() - interval '2 days')");
    sql("insert into auth.users (email, created_at) values ('573101112233@tugarantia.net', now())");
    const a1 = comoCuenta('3101112233', 'public.solicitar_primer_credito()');
    assert.equal(a1.ok, true);
    assert.ok(!('datos' in a1.solicitud), 'le devolvió los datos del registro de otra persona: ' + JSON.stringify(a1.solicitud.datos));
    assert.ok(!('registro_id' in a1.solicitud));
    assert.notEqual(a1.solicitud.nombre, 'Victima Registrada', 'le devolvió el nombre de la otra persona');
    /* Y lo guardado tampoco lo trae: Joan no puede abrirle una ficha con la cédula de otro. */
    assert.equal(sql("select datos::text || '|' || coalesce(registro_id::text, 'null') from public.solicitudes where cedula = '3101112233'"), '{}|null');
    const a2 = comoCuenta('3101112233', 'public.mi_solicitud()');
    assert.ok(a2.solicitud && !('datos' in a2.solicitud) && !('registro_id' in a2.solicitud));
  });

  test('A · su PROPIO registro (hecho al abrir la cuenta) sí se guarda para Joan, y al cliente no se le devuelve', () => {
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen, creado_en) values ('', '1022333444', 'Rosa Propia', '3101119999', '{\"documento\":\"1022333444\"}', 'abierto', now() - interval '1 minute')");
    sql("insert into auth.users (email, created_at) values ('573101119999@tugarantia.net', now())");
    const r = comoCuenta('3101119999', 'public.solicitar_primer_credito()');
    assert.ok(!('datos' in r.solicitud));
    assert.equal(sql("select datos->>'documento' from public.solicitudes where cedula = '3101119999'"), '1022333444');
  });

  test('A · PlataChat tampoco le devuelve el registro ajeno', () => {
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen, creado_en) values ('', '1010101', 'Otra Victima', '3102223344', '{\"documento\":\"1010101\",\"barrio\":\"Kennedy\"}', 'abierto', now() - interval '5 days')");
    sql("insert into auth.users (email, created_at) values ('573102223344@tugarantia.net', now())");
    const b = comoCuenta('3102223344', 'public.solicitar_platachat(100000, null, 1)');
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.ok(!('datos' in b.solicitud), 'PlataChat devolvió el registro de otra persona');
    const m = comoCuenta('3102223344', 'public.mi_solicitud_platachat()');
    assert.ok(!('datos' in m.solicitud));
  });

  test('C · la cuenta que se adelantó con el número de un cliente no se junta con un toque; con clave nueva y una hora, sí', () => {
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('3103334455','3103334455','4455','Adriana Real','{\"garantia\":{\"total\":500000}}', now())");
    sql("insert into auth.users (email, created_at) values ('573103334455@tugarantia.net', now() - interval '3 days')");
    /* El registro de Adriana, de hace dos horas: la clave que Joan le dé tiene que ser de DESPUÉS. */
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen, creado_en) values ('', '', 'Adriana Real', '3103334455', 'abierto', now() - interval '2 hours')");
    const reg = ultimoRegistro();
    const c1 = juntar(reg, '3103334455', 'Adriana Real', 'crm');
    assert.equal(c1.ok, false, 'el toque juntó la ficha con una cuenta abierta 3 días antes del registro');
    assert.equal(c1.motivo, 'necesita_clave_nueva');
    assert.equal(comoCuenta('3103334455', 'public.mi_cuenta()').vinculada, false);
    assert.equal(juntar(reg, '3103334455', 'Adriana Real', 'aprobacion').motivo, 'pide_toque');
    /* Una clave nueva mandada al número de OTRA ficha no cuenta. */
    sql('select public.clave_temporal_joan(' + CLAVE + ", '3103334455', '79000999')");
    assert.equal(juntar(reg, '3103334455', 'Adriana Real').motivo, 'necesita_clave_nueva');
    /* La clave al número de ESTA ficha: recién dada, todavía no (el token del otro vale una hora). */
    const k = json('select public.clave_temporal_joan(' + CLAVE + ", '3103334455', '3103334455')");
    assert.equal(k.ok, true);
    const c2 = juntar(reg, '3103334455', 'Adriana Real');
    assert.equal(c2.motivo, 'clave_reciente');
    assert.ok(c2.se_puede_desde);
    sql("update public.claves_nuevas set creado_en = now() - interval '61 minutes' where celular = '3103334455' and ficha = '3103334455'");
    const c3 = juntar(reg, '3103334455', 'Adriana Real');
    assert.equal(c3.ok, true, JSON.stringify(c3));
    assert.equal(comoCuenta('3103334455', 'public.mi_cuenta()').vinculada, true);
  });

  test('C · desde el celular de Joan (panel) tampoco: la misma reja', () => {
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('3103335555','3103335555','5555','Marta Panel','{}', now())");
    sql("insert into auth.users (email, created_at) values ('573103335555@tugarantia.net', now() - interval '2 days')");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen) values ('', '', 'Marta Panel', '3103335555', 'abierto')");
    const reg = ultimoRegistro();
    const j = json("select public.vincular_interna(" + reg + ", '3103335555', 'celular', '{}'::jsonb, 'Marta Panel')");
    assert.equal(j.motivo, 'necesita_clave_nueva');
  });

  test('D · juntar no une la cuenta con la fila de nube de otra persona', () => {
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('3104445566','3104445566','5566','Beto Primero','{\"debe\":\"BETO 900000\"}', now() - interval '20 days')");
    sql("insert into auth.users (email, created_at) values ('573104445566@tugarantia.net', now())");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen) values ('', '', 'Ana Segunda', '3104445566', 'abierto')");
    const reg = ultimoRegistro();
    const d1 = juntar(reg, '3104445566', 'Ana Segunda');
    assert.equal(d1.motivo, 'otra_fila', JSON.stringify(d1));
    assert.equal(d1.nombre_en_la_nube, 'Beto Primero');
    assert.equal(juntar(reg, '3104445566', null).motivo, 'falta_nombre');
    assert.equal(comoCuenta('3104445566', 'public.mi_cuenta()').vinculada, false, 'la cuenta de Ana ve la deuda de Beto');
  });

  test('E · una subida no le muda la unión de una fila vieja a otra persona; a la misma persona sí', () => {
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en, auth_vinculada_en, auth_celular) values ('3105556677','3105556677','6677','Pedro Borrado','{}', now() - interval '30 days', now() - interval '30 days', '3105556677')");
    sql("insert into auth.users (email, created_at) values ('573105556677@tugarantia.net', now() - interval '31 days')");
    sql("insert into public.mensajes (cedula, de, texto, canal) values ('3105556677', 'socio', 'soy Pedro', 'servicio')");
    sql('select public.sincronizar_socios(' + CLAVE + ", '[{\"cedula\":\"63111222\",\"telefono\":\"3105556677\",\"nombre\":\"Lucia Otra\",\"codigo\":null,\"codigo_forzar\":false,\"datos\":{\"debe\":\"LUCIA 250000\"}}]'::jsonb)");
    assert.equal(comoCuenta('3105556677', 'public.mi_cuenta()').vinculada, false, 'la cuenta de Pedro ve la ficha de Lucía');
    assert.equal(sql("select count(*) from public.mensajes where cedula = '63111222' and texto = 'soy Pedro'"), '0', 'el chat de Pedro se fue a la ficha de Lucía');
    assert.equal(sql("select count(*) from public.vinculos where celular = '3105556677' and deshecho_por = 'subida'"), '1', 'no quedó anotado por qué se soltó');

    /* La misma persona que estrena cédula: la unión y el chat viajan, como siempre. */
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en, auth_vinculada_en, auth_celular) values ('3106661111','3106661111','1111','Luz Marina','{}', now(), now() - interval '2 days', '3106661111')");
    sql("insert into auth.users (email, created_at) values ('573106661111@tugarantia.net', now() - interval '3 days')");
    sql("insert into public.vinculos (cedula, celular, por, creado_en) values ('3106661111', '3106661111', 'crm', now() - interval '2 days')");
    sql("insert into public.mensajes (cedula, de, texto, canal) values ('3106661111', 'socio', 'soy Luz', 'servicio')");
    sql('select public.sincronizar_socios(' + CLAVE + ", '[{\"cedula\":\"1033444555\",\"telefono\":\"3106661111\",\"nombre\":\"Luz Marina Rojas\",\"codigo\":null,\"codigo_forzar\":false,\"datos\":{}}]'::jsonb)");
    const c = comoCuenta('3106661111', 'public.mi_cuenta()');
    assert.equal(c.vinculada, true, 'a la misma persona le quitó la unión');
    assert.equal(sql("select count(*) from public.mensajes where cedula = '1033444555' and texto = 'soy Luz'"), '1');
  });

  test('F · la clave nueva no toca la cuenta de un gerente ni la de Joan', () => {
    sql("insert into public.equipo (celular, nombre, rol, estado) values ('3106667788', 'Gerente G', 'gerente', 'activo')");
    sql("insert into auth.users (email, created_at) values ('573106667788@tugarantia.net', now() - interval '60 days')");
    assert.equal(json('select public.clave_temporal_joan(' + CLAVE + ", '3106667788')").motivo, 'equipo');
    sql("insert into auth.users (id, email, created_at) values ('11111111-1111-1111-1111-111111111111', '573106660000@tugarantia.net', now())");
    sql("insert into public.panel_duenos (uid, nota) values ('11111111-1111-1111-1111-111111111111', 'Joan')");
    assert.equal(json('select public.clave_temporal_joan(' + CLAVE + ", '3106660000')").motivo, 'equipo');
  });

  test('H · deshacer devuelve el chat al hilo que esa cuenta lee, aunque su número no sea de ninguna ficha', () => {
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('70111222','3209998877','8877','Marta Cambio','{}', now())");
    sql("insert into auth.users (email, created_at) values ('573107778899@tugarantia.net', now())");
    sql("insert into public.registros (codigo, cedula, nombre, telefono, origen) values ('', '70111222', 'Marta', '3107778899', 'abierto')");
    const reg = ultimoRegistro();
    assert.equal(juntar(reg, '70111222', 'Marta Cambio').ok, true);
    comoCuenta('3107778899', "public.chat_escribir_sesion('servicio', 'mensaje de Marta')");
    assert.equal(json('select public.desvincular_cuenta_joan(' + CLAVE + ", '70111222', 'prueba')").ok, true);
    assert.equal(sql("select public.llave_de_sesion('3107778899')"), '3107778899');
    const leidos = comoCuenta('3107778899', "public.chat_leer_sesion('servicio', 0)").mensajes.map(m => m.texto);
    assert.ok(leidos.includes('mensaje de Marta'), 'el cliente perdió su chat al deshacer: lee ' + JSON.stringify(leidos));
  });

  test('S0 · una ficha con cédula sube la primera vez, y vuelve a subir', () => {
    sql('select public.sincronizar_socios(' + CLAVE + ", '[{\"cedula\":\"1099999999\",\"telefono\":\"3009998887\",\"nombre\":\"Nueva\",\"codigo\":null,\"codigo_forzar\":false,\"datos\":{\"v\":1}}]'::jsonb)");
    sql('select public.sincronizar_socios(' + CLAVE + ", '[{\"cedula\":\"1099999999\",\"telefono\":\"3009998887\",\"nombre\":\"Nueva\",\"codigo\":null,\"codigo_forzar\":false,\"datos\":{\"v\":2}}]'::jsonb)");
    assert.equal(sql("select datos->>'v' from public.socios_historial where cedula = '1099999999'"), '2');
  });

  test('S6 · la solicitud de una cuenta sin juntar con el número de una ficha nace marcada; la de un nuevo, no', () => {
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('3108880000','3108880000','0000','Clara Antigua','{}', now())");
    sql("insert into auth.users (email, created_at) values ('573108880000@tugarantia.net', now())");
    comoCuenta('3108880000', 'public.solicitar_primer_credito()');
    assert.equal(sql("select cuenta_sin_juntar::text from public.solicitudes where cedula = '3108880000'"), 'true');
    sql("insert into auth.users (email, created_at) values ('573108881111@tugarantia.net', now())");
    comoCuenta('3108881111', 'public.solicitar_primer_credito()');
    assert.equal(sql("select cuenta_sin_juntar::text from public.solicitudes where cedula = '3108881111'"), 'false');
  });

  test('C13 · el que se registró ayer y abrió la cuenta hoy: la nube no le cuenta ese registro', () => {
    /* La reproducción de lo que la revisión dejó como PLAUSIBLE: registrar_abierto
       no inserta un segundo registro mientras haya uno «nuevo» de ese celular,
       así que el reintento del día siguiente abre la cuenta sin registro nuevo.
       mi_registro (a propósito) solo cuenta el registro hecho con la cuenta, así
       que contesta null; por eso app/sesion-socio.js ya no dice «tus datos no
       nos llegaron» (ver una-puerta-cierres-socio.test.js). */
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos, origen, creado_en) values ('', '', 'Reintento Ayer', '3109990001', '{}', 'abierto', now() - interval '1 day')");
    assert.equal(json("select public.registrar_abierto('3109990001', 'Reintento Ayer')").ok, true);
    assert.equal(sql("select count(*) from public.registros where telefono = '3109990001'"), '1', 'el reintento sí dejó un registro nuevo');
    sql("insert into auth.users (email, created_at) values ('573109990001@tugarantia.net', now())");
    assert.equal(comoCuenta('3109990001', 'public.mi_registro()').registro, null);
  });

  test('las dos comprobaciones salen todas en true', () => {
    const filas = f => execFileSync(exe('psql'), ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-F', '|',
      '-f', path.join(RAIZ, 'base', f)], { encoding: 'utf8' }).trim().split('\n');
    const d = filas('20261007d_cierres_comprobar.sql');
    assert.equal(d.length, 10);
    d.forEach(f => assert.equal(f.split('|')[2], 't', 'falló: ' + f));
    filas('20261007b_una_puerta_comprobar.sql').forEach(f => assert.equal(f.split('|')[2], 't', 'falló: ' + f));
  });
});
