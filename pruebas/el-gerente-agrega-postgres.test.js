/* ============================================================================
 * EL GERENTE AGREGA, CON UN POSTGRESQL DE VERDAD — 27-oct-2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/el-gerente-agrega-postgres.test.js
 *
 * Joan (26-oct): «quiero que william pueda agregar bases en archivo y que
 * también pueda agregar clientes de forma manual…». Esto corre TODAS las
 * migraciones de base/ en su orden (la de hoy al final) y llama las funciones
 * nuevas con sesiones de verdad (la clave de Joan puesta, 22d):
 *
 *   1. lo que agrega el gerente le sale en «Mi base» de inmediato, con su nota;
 *   2. «ya existe» no dice de quién, no crea la fila, y por eso no abre el
 *      registro, las fotos ni el chat de un tercero (CONTROL: la misma fila
 *      metida a mano sí los abre);
 *   3. cada lugar donde puede existir un celular cuenta (R1), también quien
 *      se está registrando AHORA (CONTROL: sin R1 el gerente lo vería);
 *   4. «ya es tuyo» con la MISMA regla de registro_en_mi_alcance, caso a caso;
 *   5–8. repetidos, inválidos, tandas grandes, el tope del día, el freno de
 *      los 50, las llamadas, el techo, el acuerdo y la autorización;
 *   9–10. a quién se lo puede dejar, y quién puede llamar;
 *   11–12. ningún texto del equipo se ejecuta, y la información adicional no
 *      guarda plata, cobros, documentos, otras personas ni datos sensibles;
 *   13–15. lo de Joan: la tarjeta, equipo_tiene, reasignar, «ya existían»,
 *      borrar a quien lo pide, y que su publicación no pisa nada;
 *   16. el archivo corre dos veces, y sin 22d se para sin tocar nada;
 *   21–24 (ronda 2). el cupo fila por fila, la tarjeta que cuadra con «Ver
 *      cuáles», la fecha de Bogotá y el borrado también en la copia del Panel.
 * Los números son de mentira.
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
const NOMBRE = '20261027_el_gerente_agrega.sql';
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = 'clave-de-prueba-larga-123';

const WILLIAN = '3000000000', LEIDY = '3000000002', RETIRADO = '3000000003', OTRO = '3000000009', MARTA = '3000000008';
const G_TOPE = '3000000011', G_FRENO = '3000000012', G_LLAM = '3000000013', G_TECHO = '3000000014';
/* 27-oct-2026, revisión — tres gerentes más, cada uno con su propio día limpio. */
const G_BUCLE = '3000000015', G_DIAS = '3000000016', G_AMANO = '3000000017';
/* 27-oct-2026, ronda 2 — dos más: el cupo fila por fila y la vuelta del freno. */
const G_PREF = '3000000018', G_VUELTA = '3000000019';
/* Celulares de prueba: 31 + dos dígitos de grupo + seis. */
const cel = (g, n) => '31' + String(g).padStart(2, '0') + String(n).padStart(6, '0');
/* 27-oct-2026, ronda 3 — la lista blanca de la información adicional. Estas
   tres constantes las lee también pruebas/agregar-prospectos.test.js (en JSON,
   una por línea): el CRM y extra_limpio tienen que guardar lo mismo. */
const EJEMPLO = { "Estado": "VENCIDO", "Valor": "350000", "Fecha": "45950", "EPS": "Sura", "Asesor": "CAMILA", "Observación": "YA PAGO", "Recomendado por": "María", "Barrio": "Kennedy", "Teléfono 2": "310 555 1234", "Empresa": "Panadería La 40", "Comentario": "debe 3 cuotas", "DIR": "CL 45 SUR 12 34", "Ubicación": "KR 7 45 10", "Ciudad": "Bogotá", "Ocupación o negocio": "panadería", "Cómo llegó": "feria de Kennedy", "Monto que pide": "500.000" };
const QUEDAN = { "Ciudad": "Bogotá", "Monto que pide": "$500.000", "Ocupación o negocio": "panadería", "Cómo llegó": "feria de Kennedy" };
/* Las direcciones del hallazgo de la ronda 3: ninguna se guarda, en ninguna de las cinco. */
const DIRECCIONES = ["CL 45 SUR 12 34", "KR 7 # 12-30", "KR 7 45 10", "Cll 45 N 12-30", "Diagonal 5 Bis 3-2", "AK 68 12 30", "Mz 4 Casa 12", "Mz B Cs 12", "Av Boyacá 12-30", "Transv. 5 # 3-2", "Cra 7 45-10", "KR 80 C 2-15", "Diagonal 5 sur 3-20", "Apto 301", "Calle 13", "Carrera 7", "vive en la Cra 5 # 10-20", "Cl 45 No. 12-30", "Calle 1 # 2-3"];

describe('el gerente agrega, en un PostgreSQL', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const env = Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' });
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }).trim();
  };
  const falla = (consulta, db) => {
    try { sql(consulta, db); } catch (e) { return String(e.stderr || e.message); }
    return '';
  };
  const archivo = (f, db) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-1', '-f', f],
    { encoding: 'utf8', env });
  const uid = c => "md5('cuenta-" + c + "')::uuid";
  /* La sesión de esa cuenta, con un token emitido `iat` segundos después de
     ahora (después de la clave de Joan). Con iat negativo grande, de antes. */
  const como = (c, q, iat) => sql(
    "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(c) + " || '\",\"email\":\"57" + c + "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' ||" +
    ' floor(extract(epoch from now()) + ' + (iat == null ? 5 : iat) + ") || '}', false);" +
    ' select (' + q + ')::text').split(/\r?\n/).slice(1).join('\n');
  const jsonComo = (c, q, iat) => JSON.parse(como(c, q, iat));
  const cuenta = c => sql(
    'delete from auth.users where id = ' + uid(c) + ';' +
    ' insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data) values (' + uid(c) +
    ", '57" + c + "@tugarantia.net', extensions.crypt('la-que-eligio', extensions.gen_salt('bf')), now(), now() - interval '60 seconds', '{}'::jsonb)");
  const jsonb = v => '$tgj$' + JSON.stringify(v == null ? [] : v) + '$tgj$::jsonb';
  const publicar = a => JSON.parse(sql('select public.equipo_publicar(' + "'" + CLAVE + "', " +
    jsonb(a.p_equipo) + ', ' + jsonb(a.p_asignaciones) + ', ' + jsonb(a.p_gente) + ')::text'));
  const joan = (fn, args) => JSON.parse(sql('select public.' + fn + "('" + CLAVE + "'" + (args ? ', ' + args : '') + ')::text'));

  const lote = (filas, o) => Object.assign({ archivo: '', origen: 'feria del barrio Kennedy',
    autoriza: 'si', prueba: 'formularios firmados de la feria, en mi carpeta', filas }, o || {});
  const agregar = (g, l) => jsonComo(g, 'public.gerente_agregar_prospectos(' + jsonb(l) + ')');
  const base = g => (jsonComo(g, 'public.mi_cartera()').gente || []);
  const info = g => (jsonComo(g, 'public.mi_cartera_info()').info || {});
  const cuantas = q => Number(sql('select count(*) from ' + q));
  /* Una fila de cartera de Joan (o de quien sea) con su asignación. */
  const enCartera = (id, c, asesor) => sql(
    "insert into public.cartera (id, tipo, celular, nombre) values ('" + id + "', 'prospecto', '" + c + "', 'Alguien de Joan');" +
    (asesor != null ? " insert into public.asignaciones (id, persona_id, asesor, desde) values ('A-" + id + "', '" + id + "', '" + asesor + "', current_date);" : ''));

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-agrega-'));
    puerto = 59400 + Math.floor(Math.random() * 380);
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
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      const r = archivo(copia);
      if (f === NOMBRE) assert.equal(r.status, 0, 'la migración de hoy no corrió limpia: ' + r.stderr);
      if (f === 'supabase.sql') sql("update public.config_privada set valor = '" + CLAVE + "' where clave = 'clave_sync'");
    });
    assert.notEqual(sql("select to_regprocedure('public.gerente_agregar_prospectos(jsonb)')"), '', 'no corrió la migración de hoy');
    /* El equipo: WILLIAN con LEIDY (activa) y un asesor retirado; OTRO con
       MARTA; y cuatro gerentes más para los topes, que se cuentan por día. */
    publicar({ p_equipo: [
      { celular: WILLIAN, nombre: 'WILLIAN', rol: 'gerente' },
      { celular: LEIDY, nombre: 'LEIDY', rol: 'asesor', jefe: WILLIAN },
      { celular: RETIRADO, nombre: 'RAMIRO', rol: 'asesor', jefe: WILLIAN, estado: 'retirado' },
      { celular: OTRO, nombre: 'OTRO', rol: 'gerente' },
      { celular: MARTA, nombre: 'MARTA', rol: 'asesor', jefe: OTRO },
      { celular: G_TOPE, nombre: 'TOPE', rol: 'gerente' }, { celular: G_FRENO, nombre: 'FRENO', rol: 'gerente' },
      { celular: G_LLAM, nombre: 'LLAMADAS', rol: 'gerente' }, { celular: G_TECHO, nombre: 'TECHO', rol: 'gerente' },
      { celular: G_BUCLE, nombre: 'CAMILO', rol: 'gerente' }, { celular: G_DIAS, nombre: 'DIAS', rol: 'gerente' },
      { celular: G_AMANO, nombre: 'DIEGO', rol: 'gerente' },
      { celular: G_PREF, nombre: 'PREFIJO', rol: 'gerente' }, { celular: G_VUELTA, nombre: 'VUELTA', rol: 'gerente' }] });
    [WILLIAN, LEIDY, OTRO, MARTA, G_TOPE, G_FRENO, G_LLAM, G_TECHO, G_BUCLE, G_DIAS, G_AMANO, G_PREF, G_VUELTA].forEach((c, i) => {
      cuenta(c);
      assert.match(sql("select public.equipo_poner_clave('" + c + "', 'la-clave-de-joan-" + i + "')"), /^Listo/);
    });
    [WILLIAN, G_TOPE, G_FRENO, G_LLAM, G_TECHO, G_BUCLE, G_DIAS, G_AMANO, G_PREF, G_VUELTA].forEach(c =>
      sql("select public.equipo_acuerdo_firmado('" + c + "', '2026-10-28', 'carpeta de acuerdos, oficina')"));
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('1 · uno a mano entra a su «Mi base» de inmediato, con su nota y su prueba; a la asesora solo si se lo deja', () => {
    const r = agregar(WILLIAN, lote([{ nombre: 'Pedro Pérez', celular: '57 ' + cel(1, 1), nota: 'vende en la plaza, llamarlo después de las 3' }]));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.entraron, 1);
    assert.equal('ids' in r, false, 'la respuesta trae ids');
    const p = base(WILLIAN).find(x => x.celular === cel(1, 1));
    assert.ok(p, 'no le salió en «Mi base»');
    assert.match(p.id, /^GP\d/);
    assert.equal(p.tipo, 'prospecto');
    assert.equal(p.etapa, 'PC');
    assert.equal(p.asesor, WILLIAN);
    const i = info(WILLIAN)[p.id];
    assert.ok(i, 'mi_cartera_info no trae su información');
    assert.equal(i.nota, 'vende en la plaza, llamarlo después de las 3');
    assert.equal(i.prueba, 'formularios firmados de la feria, en mi carpeta');
    assert.equal(i.autoriza, true);
    assert.equal(i.canal, 'whatsapp');
    assert.equal(i.subido_por, 'WILLIAN');
    assert.ok(!base(LEIDY).some(x => x.celular === cel(1, 1)), 'LEIDY ve lo que WILLIAN se dejó');
    assert.ok(!(p.id in info(LEIDY)), 'LEIDY ve la información de lo que WILLIAN se dejó');
    const r2 = agregar(WILLIAN, lote([{ nombre: 'Ana Prospecto', celular: cel(1, 2), para: LEIDY }]));
    assert.equal(r2.entraron, 1);
    const a = base(LEIDY).find(x => x.celular === cel(1, 2));
    assert.ok(a, 'con «Se lo asigno a LEIDY», LEIDY no lo ve');
    assert.ok(info(LEIDY)[a.id], 'LEIDY no ve la información de lo que le dejaron');
    assert.ok(base(WILLIAN).some(x => x.celular === cel(1, 2)), 'el gerente dejó de ver a la de su asesora');
  });

  test('2 · «ya existe» de un tercero registrado: sin nombre, sin fila, y sin abrirle nada (CONTROL: la fila a mano sí lo abre)', () => {
    const c = cel(2, 1);
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos) values (null, '52111222', 'Tercera Persona', '" + c + "', '{\"nacimiento\":\"1990-01-01\"}');" +
        " insert into public.registro_archivos (celular, tipo, imagen) values ('" + c + "', 'selfie', 'data:image/jpeg;base64,AAAA')");
    const r = agregar(WILLIAN, lote([{ nombre: 'Le Cambio El Nombre', celular: c }]));
    assert.equal(r.ya_existen, 1, JSON.stringify(r));
    assert.equal(r.entraron, 0);
    assert.doesNotMatch(JSON.stringify(r), /Tercera|52111222|cliente|registr/i, 'la respuesta dice de quién es');
    assert.equal(cuantas("public.cartera where celular = '" + c + "'"), 0, 'creó la fila');
    assert.ok(!(jsonComo(WILLIAN, 'public.gerente_registros()').registros || []).some(x => x.telefono === c), 'gerente_registros le abre el registro');
    assert.equal(sql("select public.responsable_de('" + c + "')"), 'joan', 'los avisos de PlataChat le irían al gerente');
    /* CONTROL: la misma persona metida a mano en su base SÍ le abre todo. */
    enCartera('CTRL-2', c, WILLIAN);
    assert.ok((jsonComo(WILLIAN, 'public.gerente_registros()').registros || []).some(x => x.telefono === c),
      'CONTROL: con la fila, gerente_registros tendría que abrirlo (la prueba no mira)');
    assert.equal(jsonComo(WILLIAN, "public.ficha_de_mi_base('CTRL-2')").registrado, true, 'CONTROL: la ficha se abriría');
    assert.equal(sql("select public.responsable_de('" + c + "')"), WILLIAN);
    sql("delete from public.asignaciones where persona_id = 'CTRL-2'; delete from public.cartera where id = 'CTRL-2'");
  });

  test('3 · cada lugar donde puede existir un celular da «ya existe»; quien se está registrando AHORA también', () => {
    const casos = {
      'cartera de OTRO': c => enCartera('R1-OTRO', c, OTRO),
      'auth.users': c => cuenta(c),
      'solicitudes': c => sql("insert into public.solicitudes (cedula, nombre, capital, tasa, costo, total, celular) values ('1', 'S', 1, 1, 1, 1, '" + c + "')"),
      'socios_historial': c => sql("insert into public.socios_historial (cedula, tel4, nombre, datos, celular) values ('77" + c.slice(-6) + "', '" + c.slice(-4) + "', 'H', '{}', '" + c + "')"),
      'panel_socios telefono': c => sql("insert into public.panel_socios (id, datos) values ('PS-1', '{\"telefono\":\"" + c + "\",\"cedulaFrenteFoto\":\"data:image/jpeg;base64,AAAA\"}')"),
      'panel_socios telefono2': c => sql("insert into public.panel_socios (id, datos) values ('PS-2', '{\"telefono2\":\"57" + c + "\"}')"),
      'panel_socios whatsappNumero': c => sql("insert into public.panel_socios (id, datos) values ('PS-3', '{\"whatsappNumero\":\"+57 " + c + "\"}')"),
      "panel_ajustes 'prospectos'": c => sql("insert into public.panel_ajustes (clave, datos) values ('prospectos', '[{\"id\":\"P1\",\"celular\":\"" + c + "\"}]') on conflict (clave) do update set datos = excluded.datos"),
      'equipo': () => ({ cel: MARTA }),
      'joan_celulares': c => assert.equal(joan('equipo_publicar_celulares', jsonb([c])).guardados, 1),
      'registro_en_vivo vigente': c => sql("insert into public.registro_en_vivo (celular, nombre, avance, vence_en) values ('" + c + "', 'Vivo', '{\"documento\":\"1010\"}', now() + interval '1 hour')"),
      'registros_asignados (de OTRO)': c => sql("insert into public.registros_asignados (telefono, asesor) values ('" + c + "', '" + OTRO + "')")
    };
    let k = 0;
    Object.keys(casos).forEach(nombre => {
      let c = cel(3, ++k);
      const otro = casos[nombre](c);
      if (otro && otro.cel) c = otro.cel;
      const r = agregar(WILLIAN, lote([{ nombre: 'Prueba Fuente', celular: c }]));
      assert.equal(r.ya_existen, 1, nombre + ': no dio «ya existe»: ' + JSON.stringify(r));
      assert.equal(r.entraron, 0, nombre + ': entró');
    });
    /* Un registro en vivo VENCIDO ya no cuenta: entra. */
    const vencido = cel(3, 90);
    sql("insert into public.registro_en_vivo (celular, nombre, vence_en) values ('" + vencido + "', 'Viejo', now() - interval '1 hour')");
    assert.equal(agregar(WILLIAN, lote([{ nombre: 'Ya No Se Registra', celular: vencido }])).entraron, 1);
    /* CONTROL: con un registro en vivo vigente y SIN R1 (la fila a su nombre),
       registro_vivo_mirar le abriría lo que va escribiendo. */
    const vivo = cel(3, 11);
    enCartera('CTRL-3', vivo, WILLIAN);
    const m = jsonComo(WILLIAN, 'public.registro_vivo_mirar()');
    assert.ok((m.gente || []).some(x => x.celular === vivo && x.avance && x.avance.documento === '1010'),
      'CONTROL: con la fila, registro_vivo_mirar tendría que abrirle el documento (la prueba no mira)');
    sql("delete from public.asignaciones where persona_id = 'CTRL-3'; delete from public.cartera where id = 'CTRL-3'");
  });

  test('4 · «ya es tuyo» con la MISMA regla de registro_en_mi_alcance, en seis casos', () => {
    const casos = [
      ['asignado a mano a él', c => sql("insert into public.registros_asignados (telefono, asesor) values ('" + c + "', '" + WILLIAN + "')"), 'ya_en_tu_base'],
      ['asignado a mano a OTRO', c => sql("insert into public.registros_asignados (telefono, asesor) values ('" + c + "', '" + OTRO + "')"), 'ya_existen'],
      ['en su cartera', c => enCartera('AL-3', c, WILLIAN), 'ya_en_tu_base'],
      ['en la de LEIDY', c => enCartera('AL-4', c, LEIDY), 'ya_en_tu_base'],
      ['en la de OTRO', c => enCartera('AL-5', c, OTRO), 'ya_existen'],
      ['en cartera sin asignación', c => enCartera('AL-6', c, null), 'ya_existen']];
    casos.forEach(([nombre, poner, espera], i) => {
      const c = cel(4, i + 1);
      poner(c);
      const r = agregar(WILLIAN, lote([{ nombre: 'Alcance', celular: c }]));
      assert.equal(r[espera], 1, nombre + ': esperaba ' + espera + ' y dio ' + JSON.stringify(r));
      const alcance = sql("select coalesce(public.registro_en_mi_alcance('" + WILLIAN + "', '" + c + "'), '')");
      assert.equal(alcance !== '', espera === 'ya_en_tu_base', nombre + ': no coincide con registro_en_mi_alcance (' + alcance + ')');
    });
  });

  test('5 · repetidos, inválidos y tandas grandes; el tope del día no se gasta con lo tuyo ni con lo rechazado', () => {
    const r = agregar(G_TOPE, lote([{ celular: cel(5, 1) }, { celular: '57' + cel(5, 1) }, { celular: '12345' }, { celular: '6012345678' }, { celular: cel(5, 2) }]));
    assert.deepEqual([r.entraron, r.repetidas, r.invalidas], [2, 1, 2], JSON.stringify(r));
    const grande = Array.from({ length: 201 }, (_, i) => ({ celular: cel(6, i) }));
    assert.equal(agregar(G_TOPE, lote(grande)).motivo, 'tanda_grande');
    assert.equal(cuantas("public.cartera where celular like '3106%'"), 0, 'una tanda grande dejó gente');
    /* 2 + 200 + 98 = 300 justos. */
    assert.equal(agregar(G_TOPE, lote(Array.from({ length: 200 }, (_, i) => ({ celular: cel(7, i) })))).entraron, 200);
    assert.equal(agregar(G_TOPE, lote(Array.from({ length: 98 }, (_, i) => ({ celular: cel(8, i) })))).entraron, 98);
    const cupo = () => jsonComo(G_TOPE, 'public.gerente_carga_cupo()');
    assert.equal(cupo().usadas_hoy, 300);
    assert.equal(cupo().quedan_hoy, 0);
    const antes = cuantas("public.equipo_cargas where quien = '" + G_TOPE + "'");
    const t = agregar(G_TOPE, lote([{ celular: cel(9, 1) }]));
    assert.equal(t.motivo, 'tope');
    assert.equal('entraron' in t || 'ya_existen' in t, false, 'una tanda rechazada devuelve cuentas');
    assert.equal(cuantas("public.equipo_cargas where quien = '" + G_TOPE + "' and rechazo = 'tope'"), 1, 'la rechazada no dejó rastro');
    assert.equal(cuantas("public.equipo_cargas where quien = '" + G_TOPE + "'"), antes + 1);
    /* Lo que ya es suyo no gasta: los 200 otra vez salen como suyos. */
    const otra = agregar(G_TOPE, lote(Array.from({ length: 200 }, (_, i) => ({ celular: cel(7, i) }))));
    assert.equal(otra.ya_en_tu_base, 200, JSON.stringify(otra));
    assert.equal(cupo().usadas_hoy, 300, 'lo suyo o lo rechazado gastó cupo');
  });

  test('6 · el freno de los 50: para, guarda cuáles, Joan lo suelta, y se vuelve a parar', () => {
    for (let i = 0; i < 120; i++) enCartera('FR-' + i, cel(10, i), OTRO);
    const de = (desde, cuantos) => Array.from({ length: cuantos }, (_, i) => ({ celular: cel(10, desde + i) }));
    assert.equal(agregar(G_FRENO, lote(de(0, 30))).ya_existen, 30);
    const r = agregar(G_FRENO, lote(de(30, 21)));
    assert.deepEqual(r, { ok: false, motivo: 'en_revision' }, 'pasó de 50 y no paró, o devolvió cuentas');
    const carga = JSON.parse(sql("select to_jsonb(c)::text from public.equipo_cargas c where quien = '" + G_FRENO + "' and rechazo = 'tope_ya_existen'"));
    assert.equal(carga.ya_existen_cels.length, 21, 'no guardó cuáles consultó');
    assert.equal(sql("select accion from public.equipo_frenos where quien = '" + G_FRENO + "' order by id desc limit 1"), 'frenado');
    assert.equal(agregar(G_FRENO, lote([{ celular: cel(11, 1) }])).motivo, 'en_revision', 'parado, siguió subiendo');
    assert.equal(jsonComo(G_FRENO, 'public.gerente_carga_cupo()').motivo, 'en_revision');
    /* Joan ve cuáles y dónde estaban. */
    const cuales = joan('equipo_ya_existian', 'array[' + carga.id + ']::bigint[]');
    assert.equal(cuales.length, 21);
    assert.ok(cuales.every(x => x.donde === 'base de OTRO'), JSON.stringify(cuales.slice(0, 3)));
    assert.equal(joan('equipo_agregados').frenados.filter(f => f.quien === G_FRENO).length, 1);
    assert.equal(joan('equipo_soltar', "'" + G_FRENO + "'").ok, true);
    assert.equal(agregar(G_FRENO, lote([{ celular: cel(11, 1) }])).entraron, 1, 'soltado, no siguió');
    assert.equal(agregar(G_FRENO, lote(de(60, 50))).ya_existen, 50, 'la ventana no volvió a empezar al soltar');
    assert.equal(agregar(G_FRENO, lote(de(110, 1))).motivo, 'en_revision', 'con otros 51 no se volvió a parar');
  });

  test('7 · las llamadas del día (pasadas 100 no se escribe nada) y el techo de 3.000', () => {
    como(G_LLAM, "(select 1)");
    sql("select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(G_LLAM) + " || '\",\"email\":\"57" + G_LLAM +
        "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' || floor(extract(epoch from now()) + 5) || '}', false);" +
        " do $$ begin for i in 1..100 loop perform public.gerente_agregar_prospectos('{\"filas\":[]}'::jsonb); end loop; end $$;");
    assert.equal(cuantas("public.equipo_cargas where quien = '" + G_LLAM + "'"), 100);
    assert.equal(agregar(G_LLAM, lote([{ celular: cel(12, 1) }])).motivo, 'muchas_llamadas');
    assert.equal(cuantas("public.equipo_cargas where quien = '" + G_LLAM + "'"), 100, 'la llamada 101 escribió rastro');
    assert.equal(jsonComo(G_LLAM, 'public.gerente_carga_cupo()').motivo, 'muchas_llamadas');
    /* El techo: 2.999 suyos metidos a mano y una tanda de 2. 27-oct-2026,
       ronda 2: entra el que cabe (fila por fila) y la respuesta dice dónde se
       cortó; después ya no cabe nadie. */
    sql("insert into public.cartera_info (persona_id, origen, autoriza, canal, subido_por, carga_id) " +
        "select 'TECHO-' || g, 'x', true, 'whatsapp', '" + G_TECHO + "', 1 from generate_series(1, 2999) g");
    const t2 = agregar(G_TECHO, lote([{ celular: cel(13, 1) }, { celular: cel(13, 2) }]));
    assert.deepEqual([t2.ok, t2.entraron, t2.corto, t2.procesadas], [true, 1, 'techo_base', 1], JSON.stringify(t2));
    assert.equal(agregar(G_TECHO, lote([{ celular: cel(13, 2) }])).motivo, 'techo_base', 'pasó el techo de 3.000');
    assert.equal(jsonComo(G_TECHO, 'public.gerente_carga_cupo()').motivo, 'techo_base');
  });

  test('8 · sin acuerdo, sin «sí» o sin prueba no entra nadie', () => {
    const antes = cuantas('public.cartera');
    assert.equal(agregar(OTRO, lote([{ celular: cel(14, 1) }])).motivo, 'sin_acuerdo');
    assert.equal(jsonComo(OTRO, 'public.gerente_carga_cupo()').motivo, 'sin_acuerdo');
    assert.equal(agregar(WILLIAN, lote([{ celular: cel(14, 2) }], { autoriza: 'no' })).motivo, 'solo_con_si');
    assert.equal(agregar(WILLIAN, lote([{ celular: cel(14, 3) }], { autoriza: 'quizas' })).motivo, 'falta_autoriza');
    assert.equal(agregar(WILLIAN, lote([{ celular: cel(14, 4) }], { prueba: '' })).motivo, 'falta_prueba');
    assert.equal(agregar(WILLIAN, lote([{ celular: cel(14, 5) }], { origen: '  ' })).motivo, 'falta_origen');
    assert.equal(agregar(WILLIAN, lote([])).motivo, 'sin_filas');
    assert.equal(cuantas('public.cartera'), antes, 'algo de eso creó filas');
    /* Y la tabla misma no deja guardar lo del equipo sin autorización. */
    assert.match(falla("insert into public.cartera_info (persona_id, origen, autoriza, canal, subido_por, carga_id) values ('X', 'x', false, 'whatsapp', '" + WILLIAN + "', 1)"),
      /cartera_info_del_equipo_completa/);
  });

  test('9 · solo a sí mismo o a sus asesores activos: la de otro equipo o un retirado tumban la tanda entera', () => {
    [MARTA, RETIRADO].forEach(destino => {
      const r = agregar(WILLIAN, lote([{ celular: cel(15, 1), para: LEIDY }, { celular: cel(15, 2), para: destino }]));
      assert.equal(r.motivo, 'para_no_es_tuyo', destino + ': ' + JSON.stringify(r));
    });
    assert.equal(cuantas("public.cartera where celular in ('" + cel(15, 1) + "', '" + cel(15, 2) + "')"), 0, 'entró alguien de la tanda rechazada');
    const cupo = jsonComo(WILLIAN, 'public.gerente_carga_cupo()');
    assert.deepEqual(cupo.destinos.map(d => d.celular), [WILLIAN, LEIDY], 'los destinos no son él y su asesora activa');
    assert.equal(cupo.destinos[0].yo, true);
  });

  test('10 · una asesora, anon, o el gerente sin la clave de Joan: no', () => {
    assert.equal(agregar(LEIDY, lote([{ celular: cel(16, 1) }])).motivo, 'solo_gerente');
    assert.equal(jsonComo(LEIDY, 'public.gerente_carga_cupo()').ok, false);
    assert.match(falla("set role anon; select public.gerente_agregar_prospectos('{}'::jsonb)"), /permission denied/);
    assert.match(falla("set role anon; select public.mi_cartera_info()"), /permission denied/);
    assert.match(falla("set role authenticated; select public.equipo_agregados('" + CLAVE + "')"), /permission denied/);
    assert.match(falla("set role authenticated; select public.agregar_prospectos_de(null, '{}'::jsonb)"), /permission denied/);
    assert.match(falla("set role anon; select public.equipo_acuerdo_firmado('" + WILLIAN + "', current_date, 'xxxxxx')"), /permission denied/);
    const viejo = jsonComo(WILLIAN, 'public.gerente_agregar_prospectos(' + jsonb(lote([{ celular: cel(16, 2) }])) + ')', -7200);
    assert.equal(viejo.motivo, 'solo_gerente', 'una sesión de antes de la clave de Joan agregó');
    assert.equal(cuantas("public.cartera where celular like '3116%'"), 0);
  });

  test('11 · ningún texto del equipo se ejecuta: el nombre sin comillas, el archivo y el origen sin < > " \'', () => {
    const r = agregar(WILLIAN, lote([{ nombre: "x',fetch('//a'),'", celular: cel(17, 1), nota: 'nota <b>"rara"</b>' }],
      { archivo: 'feria"<img src=x>.xlsx', origen: "de la feria'); alert(1); //" }));
    assert.equal(r.entraron, 1, JSON.stringify(r));
    const fila = JSON.parse(sql("select to_jsonb(p)::text from public.cartera p where celular = '" + cel(17, 1) + "'"));
    assert.doesNotMatch(fila.nombre, /['"()/<>]/, 'el nombre guardado: ' + fila.nombre);
    const ci = JSON.parse(sql("select to_jsonb(ci)::text from public.cartera_info ci where persona_id = '" + fila.id + "'"));
    assert.doesNotMatch(ci.origen, /['"<>]/);
    assert.doesNotMatch(ci.nota, /['"<>]/);
    const c = JSON.parse(sql('select to_jsonb(c)::text from public.equipo_cargas c where id = ' + r.carga));
    assert.doesNotMatch(c.archivo, /['"<>]/, 'el archivo guardado: ' + c.archivo);
    /* Lo que llega de play/ también: el disparador en registros. */
    const reg = JSON.parse(sql("select public.registrar_abierto('" + cel(17, 2) + "', 'Ana'',fetch(''//x''),''', '', '{}'::jsonb)::text"));
    assert.equal(reg.ok, true, JSON.stringify(reg));
    const guardado = sql("select nombre from public.registros where telefono = '" + cel(17, 2) + "'");
    assert.match(guardado, /^Ana\s+fetch\s+x\s*$/, 'el nombre de play/ guardado: ' + guardado);
    assert.doesNotMatch(guardado, /['"(),\/]/);
    /* El rastro y el freno no se cambian ni se borran. */
    assert.match(falla('update public.equipo_cargas set entraron = 0'), /no se cambia ni se borra/);
    assert.match(falla('delete from public.equipo_cargas'), /no se cambia ni se borra/);
    assert.match(falla('delete from public.equipo_frenos'), /no se cambia ni se borra/);
  });

  /* 27-oct-2026, ronda 3 — UNA LISTA BLANCA: solo cinco claves exactas. Dos
     rondas seguidas se escapó la dirección («DIR», «Ubicación», «Barrio»,
     «CL 45 SUR 12 34») porque la regla adivinaba por el nombre qué era malo. */
  test('12 · la información adicional: solo las cinco de la lista blanca; ni direcciones, ni plata, ni cobros, ni documentos', () => {
    const limpio = JSON.parse(sql("select public.extra_limpio('" + JSON.stringify(EJEMPLO) + "'::jsonb)::text"));
    assert.deepEqual(limpio, QUEDAN, JSON.stringify(limpio));
    /* Cada dirección del hallazgo, puesta en las cinco a la vez: no queda nada. */
    const todas = JSON.parse(sql("select json_agg(public.extra_limpio(x) order by o)::text from jsonb_array_elements('" +
      JSON.stringify(DIRECCIONES.map(v => ({ 'Ciudad': v, 'Monto que pide': v, 'Ocupación o negocio': v, 'Cómo llegó': v, 'Observación': v }))) +
      "'::jsonb) with ordinality t(x, o)"));
    todas.forEach((o, k) => assert.deepEqual(o, {}, 'se guardó la dirección «' + DIRECCIONES[k] + '»: ' + JSON.stringify(o)));
    /* CONTROL: lo que no es una dirección sí se guarda (la prueba mira). */
    const bien = JSON.parse(sql("select public.extra_limpio('" + JSON.stringify({ 'Observación': 'vende en la calle del mercado',
      'Ocupación o negocio': 'tiene 2 hijos y una tienda', 'Ciudad': 'Soacha', 'Cómo llegó': 'vende manzanas en la feria' }) + "'::jsonb)::text"));
    assert.deepEqual(bien, { 'Observación': 'vende en la calle del mercado', 'Ocupación o negocio': 'tiene 2 hijos y una tienda',
      'Ciudad': 'Soacha', 'Cómo llegó': 'vende manzanas en la feria' }, JSON.stringify(bien));
    /* Cualquier otra clave se ignora; cada valor hasta 120; una ciudad sin números. */
    const otras = {}; for (let i = 0; i < 9; i++) otras['Dato ' + i] = 'v'.repeat(200);
    otras['Observación'] = 'v'.repeat(200); otras['Ciudad'] = 'Bogotá 110111';
    assert.deepEqual(JSON.parse(sql("select public.extra_limpio('" + JSON.stringify(otras) + "'::jsonb)::text")), { 'Observación': 'v'.repeat(120) });
    assert.equal(sql("select public.extra_limpio('[1,2]'::jsonb)::text"), '{}');
    /* «Monto que pide»: solo un monto redondo a mil; una cédula o un teléfono, no. */
    assert.deepEqual(JSON.parse(sql(`select public.extra_limpio('{"Monto que pide": 800000}'::jsonb)::text`)), { 'Monto que pide': '$800.000' });
    ['52345678', '3001234567', '1.000', '$ 1.200.000,00'].forEach((v, k) => assert.equal(
      sql(`select coalesce(public.extra_limpio('{"Monto que pide": "${v}"}'::jsonb)->>'Monto que pide', '')`), ['', '', '', '$1.200.000'][k], v));
    /* Y lo que manda el CRM pasa por ahí al guardar. */
    const r = agregar(WILLIAN, lote([{ nombre: 'Con Extra', celular: cel(18, 1),
      extra: { Ciudad: 'Bogotá', Barrio: 'Kennedy', DIR: 'CL 45 SUR 12 34', Saldo: '200000' } }]));
    assert.equal(r.entraron, 1);
    const p = base(WILLIAN).find(x => x.celular === cel(18, 1));
    assert.deepEqual(info(WILLIAN)[p.id].extra, { Ciudad: 'Bogotá' });
  });

  test('13 · lo de Joan: la tarjeta, equipo_tiene, reasignar y soltar', () => {
    const z = [cel(19, 1), cel(19, 2), cel(19, 3)];
    const r = agregar(WILLIAN, lote(z.map((c, i) => ({ nombre: 'Zeta ' + i, celular: c })), { archivo: 'feria-kennedy.xlsx' }));
    assert.equal(r.entraron, 3);
    const ag = joan('equipo_agregados');
    const fila = ag.cargas.find(x => x.archivo === 'feria-kennedy.xlsx');
    assert.ok(fila, 'la tarjeta no trae la carga');
    assert.equal(fila.quien_nombre, 'WILLIAN');
    assert.equal(fila.prueba, 'formularios firmados de la feria, en mi carpeta');
    assert.equal(fila.entraron, 3);
    assert.ok(ag.por_gerente.some(g => g.quien === WILLIAN && g.subidos > 0 && g.techo === 3000));
    assert.ok(ag.cargas.some(x => x.rechazo === 'para_no_es_tuyo'), 'las rechazadas no salen');
    assert.match(falla("select public.equipo_agregados('mala-clave-pero-larga')"), /clave de sincronización incorrecta/);
    /* gestion_antes_del_registro: nunca se registró (null), con gestión antes (true), sin gestión antes (false). */
    const ids = z.map(c => sql("select id from public.cartera where celular = '" + c + "'"));
    sql("insert into public.gestiones (persona_id, asesor, tipo, cuando) values ('" + ids[1] + "', '" + WILLIAN + "', 'no_contesta', now() - interval '2 days')");
    [z[1], z[2]].forEach(c => sql("insert into public.registros (cedula, nombre, telefono, creado_en) values ('1', 'Se Registro', '" + c + "', now() - interval '1 day')"));
    const t = joan('equipo_tiene', "array['" + z.join("','") + "', '" + cel(19, 9) + "']");
    assert.equal(t[z[0]].gestion_antes_del_registro, null);
    assert.equal(t[z[1]].gestion_antes_del_registro, true);
    assert.equal(t[z[2]].gestion_antes_del_registro, false);
    assert.equal(t[z[0]].subido_por_nombre, 'WILLIAN');
    assert.equal(t[z[0]].lo_trabaja_nombre, 'WILLIAN');
    assert.equal(cel(19, 9) in t, false, 'responde por lo que no es del equipo');
    const ag2 = joan('equipo_agregados').cargas.find(x => x.archivo === 'feria-kennedy.xlsx');
    assert.equal(ag2.registrados, 2);
    assert.equal(ag2.registrados_sin_gestion_previa, 1);
    /* La lista de la carga, y reasignar a la asesora de OTRO. */
    const lista = joan('equipo_agregados_de', 'array[' + fila.ids.join(',') + ']::bigint[], 0');
    assert.equal(lista.total, 3);
    assert.equal(lista.gente[1].gestion.tipo, 'no_contesta');
    const m = joan('equipo_reasignar', jsonb([ids[0], 'P-DE-JOAN']) + ", '" + MARTA + "'");
    assert.deepEqual([m.movidos, m.no_son_del_equipo], [1, 1]);
    assert.ok(base(MARTA).some(x => x.id === ids[0]), 'MARTA no lo ve');
    assert.ok(!base(WILLIAN).some(x => x.id === ids[0]), 'WILLIAN lo sigue viendo');
    /* El mismo día otra vez, y después a nadie: una sola fila por día, sin 23505. */
    joan('equipo_reasignar', jsonb([ids[0]]) + ", '" + LEIDY + "'");
    assert.equal(joan('equipo_reasignar', jsonb([ids[0]]) + ", ''").movidos, 1);
    assert.equal(cuantas("public.asignaciones where persona_id = '" + ids[0] + "' and desde = (now() at time zone 'America/Bogota')::date"), 1);
    assert.equal(sql("select coalesce(public.registro_en_mi_alcance('" + WILLIAN + "', '" + z[0] + "'), 'nadie')"), 'nadie');
    assert.equal(joan('equipo_reasignar', jsonb([ids[1]]) + ", '3009999999'").motivo, 'destino_no_sirve');
  });

  test('14 · borrar a quien lo pide: se va todo, no vuelve a entrar; un cliente no se borra', () => {
    const c = cel(20, 1);
    assert.equal(agregar(WILLIAN, lote([{ nombre: 'Me Borran', celular: c }])).entraron, 1);
    const gp = sql("select id from public.cartera where celular = '" + c + "'");
    publicar({ p_gente: [{ id: 'P-BORRAR', tipo: 'prospecto', celular: c, nombre: 'Me Borran' }],
      p_asignaciones: [{ id: 'A-BORRAR', persona_id: 'P-BORRAR', asesor: LEIDY, desde: '2026-10-20' }] });
    sql("insert into public.gestiones (persona_id, asesor, tipo) values ('" + gp + "', '" + WILLIAN + "', 'no_contesta');" +
        " insert into public.contactos (persona_id, quien, texto) values ('" + gp + "', '" + WILLIAN + "', 'hola')");
    assert.equal(joan('equipo_publicar_celulares', jsonb([c])).guardados, 1);
    assert.match(falla("select public.equipo_suprimir('" + CLAVE + "', '" + c + "', '')"), /^$/);   // sin «cómo lo pidió» no hace nada
    assert.equal(joan('equipo_suprimir', "'" + c + "', ''").motivo, 'falta_como');
    const s = joan('equipo_suprimir', "'" + c + "', 'por el chat de la app el 3-nov'");
    assert.deepEqual([s.ok, s.es_cliente, s.del_equipo, s.de_joan], [true, false, 1, 1]);
    assert.equal(cuantas("public.cartera where celular = '" + c + "'"), 0);
    assert.equal(cuantas("public.asignaciones where persona_id in ('" + gp + "', 'P-BORRAR')"), 0);
    assert.equal(cuantas("public.cartera_info where persona_id = '" + gp + "'"), 0);
    assert.equal(cuantas("public.gestiones where persona_id = '" + gp + "'"), 0);
    assert.equal(cuantas("public.contactos where persona_id = '" + gp + "'"), 0);
    assert.equal(cuantas("public.joan_celulares where celular = '" + c + "'"), 0);
    assert.equal(cuantas("public.no_contactar where cel_hash = public.cel_hash('" + c + "')"), 1);
    assert.equal(sql("select count(*) from public.no_contactar where cel_hash = '" + c + "'"), '0', 'guardó el número en claro');
    assert.equal(agregar(WILLIAN, lote([{ nombre: 'Me Borran', celular: c }])).ya_existen, 1, 'volvió a entrar');
    assert.equal(joan('equipo_publicar_celulares', jsonb([c])).saltados, 1);
    assert.equal(joan('equipo_tiene', "array['" + c + "']")[c].no_contactar, true);
    /* Un cliente: solo se anota; no se borra nada. */
    const cli = cel(20, 2);
    publicar({ p_gente: [{ id: 'S-CLIENTE', tipo: 'cliente', celular: cli, nombre: 'Cliente De Verdad' }] });
    const sc = joan('equipo_suprimir', "'" + cli + "', 'llamó a la oficina el 3-nov'");
    assert.equal(sc.es_cliente, true);
    assert.equal(cuantas("public.cartera where id = 'S-CLIENTE'"), 1, 'borró a un cliente');
    assert.equal(cuantas("public.no_contactar where cel_hash = public.cel_hash('" + cli + "')"), 1);
  });

  test('15 · la publicación de Joan no pisa lo del equipo, y su información solo se escribe al crear', () => {
    const gp = base(WILLIAN).find(x => x.celular === cel(1, 1));
    const antes = sql("select count(*) || '|' || string_agg(id, ',' order by id) from public.asignaciones where persona_id like 'GP%'");
    publicar({ p_equipo: [{ celular: WILLIAN, nombre: 'WILLIAN', rol: 'gerente' }],
      p_gente: [{ id: 'P-NUEVO', tipo: 'prospecto', celular: cel(21, 1), nombre: 'De Joan' }],
      p_asignaciones: [{ id: 'A-NUEVO', persona_id: 'P-NUEVO', asesor: WILLIAN, desde: '2026-10-26' }] });
    assert.equal(sql("select count(*) || '|' || string_agg(id, ',' order by id) from public.asignaciones where persona_id like 'GP%'"), antes);
    assert.equal(info(WILLIAN)[gp.id].nota, 'vende en la plaza, llamarlo después de las 3');
    const r = joan('equipo_publicar_info', jsonb([
      { id: gp.id, nota: 'esto no pisa', origen: 'otra' },
      { id: 'P-NUEVO', nota: 'llamar en la tarde', extra: { Ciudad: 'Chía', Barrio: 'Suba', Cedula: '1010101010', DIR: 'KR 7 45 10' }, origen: 'feria', autoriza: false },
      { id: 'NO-EXISTE', nota: 'x' }]));
    assert.deepEqual([r.guardadas, r.ya_tenian, r.sin_fila], [1, 1, 1]);
    assert.equal(info(WILLIAN)[gp.id].nota, 'vende en la plaza, llamarlo después de las 3', 'la de Joan pisó la del gerente');
    const deJoan = info(WILLIAN)['P-NUEVO'];
    assert.deepEqual([deJoan.nota, deJoan.subido_por, deJoan.autoriza], ['llamar en la tarde', 'Joan', false]);
    assert.deepEqual(deJoan.extra, { Ciudad: 'Chía' }, 'viajó algo fuera de la lista blanca (la cédula, el barrio o la dirección)');
  });

  /* 27-oct-2026, revisión — EL BUCLE DEL FRENO. CAMILO sube 60 que ya existen
     y 100 nuevos: se para. Joan mira y suelta. La pantalla le dice «vuelve a
     subir el mismo archivo», y antes eso lo volvía a parar sin que entrara
     nadie (los 60 iban primero y volvían a sumar 60). Y al día siguiente el
     mismo archivo le volvía a cobrar el cupo con ellos. */
  test('17 · después del freno, el mismo archivo ENTRA; y al día siguiente no vuelve a cobrar los que ya existían', () => {
    for (let i = 0; i < 60; i++) enCartera('BU-' + i, cel(30, i), OTRO);
    const archivo = Array.from({ length: 60 }, (_, i) => ({ celular: cel(30, i) }))
      .concat(Array.from({ length: 100 }, (_, i) => ({ celular: cel(31, i) })));
    assert.deepEqual(agregar(G_BUCLE, lote(archivo, { archivo: 'raro.csv' })), { ok: false, motivo: 'en_revision' });
    const f = joan('equipo_agregados').frenados.find(x => x.quien === G_BUCLE);
    assert.equal(f.ya_existen, 60);
    assert.equal(joan('equipo_ya_existian', 'array[' + f.cargas.join(',') + ']::bigint[]').length, 60, '«Ver cuáles» no trae los 60');
    assert.equal(joan('equipo_soltar', "'" + G_BUCLE + "'").ok, true);
    const otra = agregar(G_BUCLE, lote(archivo, { archivo: 'raro.csv' }));
    assert.equal(otra.ok, true, 'el mismo archivo lo volvió a parar: ' + JSON.stringify(otra));
    assert.deepEqual([otra.entraron, otra.ya_existen], [100, 60]);
    assert.equal(sql("select accion from public.equipo_frenos where quien = '" + G_BUCLE + "' order by id desc limit 1"), 'soltado');
    assert.equal(jsonComo(G_BUCLE, 'public.gerente_carga_cupo()').usadas_hoy, 100, 'los 60 que ya sabía gastaron cupo otra vez');
    /* «Mañana»: el rastro, un día atrás (el disparador no deja cambiarlo: se apaga solo para esto). */
    sql("alter table public.equipo_cargas disable trigger equipo_cargas_solo_agregar;" +
        " update public.equipo_cargas set cuando = cuando - interval '1 day' where quien = '" + G_BUCLE + "';" +
        " alter table public.equipo_cargas enable trigger equipo_cargas_solo_agregar;");
    const manana = agregar(G_BUCLE, lote(archivo, { archivo: 'raro.csv' }));
    assert.deepEqual([manana.ok, manana.entraron, manana.ya_en_tu_base, manana.ya_existen, manana.quedan_hoy], [true, 0, 100, 60, 300],
      'al día siguiente el mismo archivo cobra o para: ' + JSON.stringify(manana));
    /* CONTROL: un «ya existe» NUEVO sí cuenta, y con 50 nuevos más se para. */
    for (let i = 0; i < 51; i++) enCartera('BV-' + i, cel(32, i), OTRO);
    assert.equal(agregar(G_BUCLE, lote(Array.from({ length: 51 }, (_, i) => ({ celular: cel(32, i) })))).motivo, 'en_revision');
  });

  /* 27-oct-2026, revisión — EL FRENO NO SE REINICIA A MEDIANOCHE. Con la
     ventana del día, 50 «ya existe» diarios no lo paraban nunca. */
  test('18 · 25 «ya existe» antier y 25 ayer, sin que Joan mirara: hoy uno más lo para', () => {
    sql("insert into public.equipo_cargas (quien, cuando, origen, autoriza, prueba, recibidas, ya_existen, ya_existen_cels, ya_existen_nuevos) values " +
      "('" + G_DIAS + "', now() - interval '2 days', 'x', true, 'pruebita', 25, 25, array(select '3133' || lpad(g::text, 6, '0') from generate_series(1, 25) g), 25)," +
      "('" + G_DIAS + "', now() - interval '1 day', 'x', true, 'pruebita', 25, 25, array(select '3133' || lpad(g::text, 6, '0') from generate_series(26, 50) g), 25)");
    enCartera('DI-1', cel(34, 1), OTRO);
    assert.equal(agregar(G_DIAS, lote([{ celular: cel(34, 1) }])).motivo, 'en_revision', 'el freno se reinició a medianoche');
    assert.equal(jsonComo(G_DIAS, 'public.gerente_carga_cupo()').motivo, 'en_revision');
    assert.equal(joan('equipo_agregados').frenados.find(x => x.quien === G_DIAS).ya_existen, 51);
  });

  /* 27-oct-2026, revisión — LO DE A MANO DE UN DÍA ES UNA FILA: «cuáles» con
     todas sus tandas, y el origen de la que entró (no el del último intento). */
  test('19 · a mano: «cuáles» trae los de todas las tandas del día, y el origen es el de quien entró', () => {
    enCartera('AM-1', cel(35, 1), OTRO);
    enCartera('AM-2', cel(35, 2), OTRO);
    assert.equal(agregar(G_AMANO, lote([{ nombre: 'Pedro', celular: cel(35, 9) }],
      { origen: 'me lo recomendó un cliente', prueba: 'me lo dijo por WhatsApp el 30-oct y tengo el chat' })).entraron, 1);
    assert.equal(agregar(G_AMANO, lote([{ celular: cel(35, 1) }], { origen: 'prueba', prueba: 'chat del 30-oct' })).ya_existen, 1);
    assert.equal(agregar(G_AMANO, lote([{ celular: cel(35, 2) }], { origen: 'prueba', prueba: 'chat del 30-oct' })).ya_existen, 1);
    const fila = joan('equipo_agregados').cargas.find(c => c.quien === G_AMANO && c.archivo === '' && !c.rechazo);
    assert.equal(fila.tandas, 3);
    assert.equal(fila.ya_existen, 2);
    assert.deepEqual([fila.origen, fila.prueba, fila.origenes], ['me lo recomendó un cliente', 'me lo dijo por WhatsApp el 30-oct y tengo el chat', 1]);
    assert.deepEqual(joan('equipo_ya_existian', 'array[' + fila.ids.join(',') + ']::bigint[]').map(x => x.celular).sort(), [cel(35, 1), cel(35, 2)]);
    /* CONTROL: con la primera sola —lo que mandaba la pantalla— salía «Ninguno». */
    assert.deepEqual(joan('equipo_ya_existian', 'array[' + fila.id + ']::bigint[]'), []);
    /* Y «Ver», persona por persona. */
    const de = joan('equipo_agregados_de', 'array[' + fila.ids.join(',') + ']::bigint[], 0');
    assert.deepEqual([de.gente[0].origen, de.gente[0].prueba], ['me lo recomendó un cliente', 'me lo dijo por WhatsApp el 30-oct y tengo el chat']);
  });

  /* 27-oct-2026, revisión — LA AUTORIZACIÓN DE JOAN SE ACTUALIZA, y la fecha
     es la de carga: con «do nothing» la revocatoria no llegaba nunca, y con
     now() «🆕 Recién agregados» se llenaba con sus prospectos viejos. */
  test('20 · equipo_publicar_info: el «No» de después llega (y el «Sí»); un null no borra; lo del gerente no se toca; la fecha es la de carga', () => {
    publicar({ p_gente: [{ id: 'P-AUT', tipo: 'prospecto', celular: cel(36, 1), nombre: 'Rubén' },
                         { id: 'P-SINF', tipo: 'prospecto', celular: cel(36, 2), nombre: 'Sin Fecha' }],
      p_asignaciones: [{ id: 'A-AUT', persona_id: 'P-AUT', asesor: LEIDY, desde: '2026-10-20' },
                       { id: 'A-SINF', persona_id: 'P-SINF', asesor: LEIDY, desde: '2026-10-20' }] });
    const r1 = joan('equipo_publicar_info', jsonb([{ id: 'P-AUT', origen: 'pauta de Facebook, septiembre', autoriza: true, creado: '2026-09-26' },
      { id: 'P-SINF', origen: 'feria' }]));
    assert.deepEqual([r1.guardadas, r1.cambiadas], [2, 0]);
    assert.equal(info(LEIDY)['P-AUT'].autoriza, true);
    assert.match(String(info(LEIDY)['P-AUT'].subido_en), /^2026-09-26/, 'la fecha no es la de carga');
    assert.equal(info(LEIDY)['P-SINF'].subido_en, '-infinity', 'sin fecha, inventó una');
    const r2 = joan('equipo_publicar_info', jsonb([{ id: 'P-AUT', origen: 'otra', nota: 'no pisa', autoriza: false, creado: '2026-10-27' }]));
    assert.deepEqual([r2.guardadas, r2.cambiadas, r2.ya_tenian], [0, 1, 0]);
    const i = info(LEIDY)['P-AUT'];
    assert.deepEqual([i.autoriza, i.origen, i.nota], [false, 'pauta de Facebook, septiembre', ''], 'la revocatoria no llegó, o pisó lo demás');
    assert.match(String(i.subido_en), /^2026-09-26/);
    assert.equal(joan('equipo_publicar_info', jsonb([{ id: 'P-AUT', autoriza: null }])).ya_tenian, 1);
    assert.equal(info(LEIDY)['P-AUT'].autoriza, false, 'un null borró el «No»');
    assert.equal(joan('equipo_publicar_info', jsonb([{ id: 'P-AUT', autoriza: true }])).cambiadas, 1);
    assert.equal(info(LEIDY)['P-AUT'].autoriza, true, 'el «Sí» de después no llegó');
    /* Lo que subió el gerente no se toca: su «autorizó» es el de su carga. */
    const gp = base(WILLIAN).find(x => x.celular === cel(1, 1));
    assert.equal(joan('equipo_publicar_info', jsonb([{ id: gp.id, autoriza: false }])).ya_tenian, 1);
    assert.equal(info(WILLIAN)[gp.id].autoriza, true, 'Joan le cambió la autorización a lo del gerente');
  });

  /* 27-oct-2026, ronda 2 — EL CUPO, FILA POR FILA. El CRM mandaba solo las
     primeras «quedan_hoy» filas, y con un archivo grande esas eran siempre los
     mismos «ya existe» que ya había consultado: no gastaban, pero ocupaban el
     lugar de gente nueva (entraban 270, 228… 69 el día 14, con cupo sin usar).
     Ahora el CRM manda el archivo entero y aquí entra lo que cabe. */
  test('21 · el cupo fila por fila: lo ya consultado no ocupa el lugar de nadie, y una tanda entra hasta donde cabe', () => {
    for (let i = 0; i < 40; i++) enCartera('PF-' + i, cel(40, i), OTRO);
    const sabidos = Array.from({ length: 40 }, (_, i) => ({ celular: cel(40, i) }));
    const nuevos = (g, n) => Array.from({ length: n }, (_, i) => ({ celular: cel(g, i) }));
    assert.equal(agregar(G_PREF, lote(sabidos)).ya_existen, 40);
    const r2 = agregar(G_PREF, lote(sabidos.concat(nuevos(41, 160))));
    assert.deepEqual([r2.entraron, r2.ya_existen, r2.corto, r2.quedan_hoy], [160, 40, '', 100], JSON.stringify(r2));
    /* 40 que ya sabía (gratis) y 160 nuevos con 100 de cupo: entran 100 y se corta en la fila 141. */
    const r3 = agregar(G_PREF, lote(sabidos.concat(nuevos(42, 160))));
    assert.deepEqual([r3.ok, r3.entraron, r3.corto, r3.procesadas, r3.quedan_hoy], [true, 100, 'tope', 140, 0], JSON.stringify(r3));
    assert.equal(cuantas("public.cartera where celular like '3142%'"), 100, 'no entraron las primeras 100 nuevas');
    assert.equal(cuantas("public.cartera where celular = '" + cel(42, 99) + "'"), 1);
    assert.equal(cuantas("public.cartera where celular = '" + cel(42, 100) + "'"), 0, 'entró uno de después del corte');
    const carga = JSON.parse(sql("select to_jsonb(c)::text from public.equipo_cargas c where c.id = " + r3.carga));
    assert.equal(carga.recibidas, 140, 'el rastro dice que miró filas que no miró');
    assert.equal(jsonComo(G_PREF, 'public.gerente_carga_cupo()').quedan_hoy, 0);
    /* Sin cupo, una tanda que empieza con lo nuevo no entra ni devuelve cuentas. */
    const r4 = agregar(G_PREF, lote(nuevos(42, 160).slice(100)));
    assert.equal(r4.motivo, 'tope');
    assert.equal('entraron' in r4, false);
  });

  /* 27-oct-2026, ronda 2 — LOS NÚMEROS DE LA TARJETA CUADRAN CON «Ver cuáles».
     Se para, Joan suelta, el mismo archivo sube dos veces, y más adelante se
     para otra vez: la franja decía 51 y abría 111; la fila decía «Ya existían
     120» y abría 60. */
  test('22 · tras una vuelta del freno, la franja y la fila dicen lo mismo que «Ver cuáles»', () => {
    for (let i = 0; i < 60; i++) enCartera('VU-' + i, cel(43, i), OTRO);
    for (let i = 0; i < 51; i++) enCartera('VV-' + i, cel(44, i), OTRO);
    const feria = Array.from({ length: 60 }, (_, i) => ({ celular: cel(43, i) }))
      .concat(Array.from({ length: 20 }, (_, i) => ({ celular: cel(45, i) })));
    assert.equal(agregar(G_VUELTA, lote(feria, { archivo: 'feria.csv' })).motivo, 'en_revision');
    assert.equal(joan('equipo_soltar', "'" + G_VUELTA + "'").ok, true);
    assert.equal(agregar(G_VUELTA, lote(feria, { archivo: 'feria.csv' })).entraron, 20);
    assert.equal(agregar(G_VUELTA, lote(feria, { archivo: 'feria.csv' })).ya_en_tu_base, 20);
    assert.equal(agregar(G_VUELTA, lote(Array.from({ length: 51 }, (_, i) => ({ celular: cel(44, i) })), { archivo: 'otra.csv' })).motivo, 'en_revision');
    const ag = joan('equipo_agregados');
    const f = ag.frenados.find(x => x.quien === G_VUELTA);
    assert.equal(f.ya_existen, 51);
    const cuales = joan('equipo_ya_existian', 'array[' + f.cargas.join(',') + ']::bigint[], true');
    assert.equal(cuales.length, 51, '«Ver cuáles» de la franja trae los que Joan ya había revisado');
    assert.ok(cuales.every(x => x.celular.slice(0, 4) === '3144'));
    /* CONTROL: sin «solo los nuevos» salen también los 60 de la vuelta anterior (lo que abría antes). */
    assert.equal(joan('equipo_ya_existian', 'array[' + f.cargas.join(',') + ']::bigint[]').length, 111);
    const fila = ag.cargas.find(c => c.quien === G_VUELTA && c.archivo === 'feria.csv' && !c.rechazo);
    assert.deepEqual([fila.tandas, fila.entraron, fila.ya_existen], [2, 20, 60], JSON.stringify(fila));
    assert.equal(joan('equipo_ya_existian', 'array[' + fila.ids.join(',') + ']::bigint[]').length, 60);
  });

  /* 27-oct-2026, ronda 2 — LO QUE REPARTE EL GERENTE LLEVA LA FECHA DE BOGOTÁ.
     Con current_date (UTC en Supabase), lo que repartía a las 8 p. m. quedaba
     con la fecha de mañana y le ganaba a lo que Joan decidía ese día. Se corre
     con el reloj de la sesión en UTC+14 y en UTC−12: a cualquier hora, en una
     de las dos current_date no es la fecha de Bogotá. */
  test('23 · asignar_a, agregar y equipo_reasignar escriben la fecha de Bogotá, con cualquier zona horaria de la sesión', () => {
    const bog = sql("select (now() at time zone 'America/Bogota')::date::text");
    const claims = c => "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(c) + " || '\",\"email\":\"57" + c +
      "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' || floor(extract(epoch from now()) + 5) || '}', false);";
    const comoEn = (tz, c, q) => sql("select set_config('timezone', '" + tz + "', false); " + claims(c) + ' select (' + q + ')::text')
      .split(/\r?\n/).slice(2).join('\n');
    const c1 = cel(46, 1);
    const r = JSON.parse(comoEn('Etc/GMT-14', WILLIAN, 'public.gerente_agregar_prospectos(' + jsonb(lote([{ nombre: 'Fecha Bogota', celular: c1 }])) + ')'));
    assert.equal(r.entraron, 1, JSON.stringify(r));
    const pid = sql("select id from public.cartera where celular = '" + c1 + "'");
    const fechas = () => sql("select string_agg(desde::text || '>' || asesor, ',' order by desde, id) from public.asignaciones where persona_id = '" + pid + "'");
    assert.equal(fechas(), bog + '>' + WILLIAN, 'agregar escribió la fecha de la sesión');
    const lista = "'" + JSON.stringify([pid]) + "'::jsonb";
    const a1 = JSON.parse(comoEn('Etc/GMT+12', WILLIAN, 'public.asignar_a(' + lista + ", '" + LEIDY + "')"));
    assert.equal(a1.ok, true, JSON.stringify(a1));
    assert.equal(fechas(), bog + '>' + LEIDY, 'asignar_a (UTC−12) escribió otra fecha');
    const a2 = JSON.parse(comoEn('Etc/GMT-14', WILLIAN, 'public.asignar_a(' + lista + ", '" + WILLIAN + "')"));
    assert.equal(a2.ok, true, JSON.stringify(a2));
    assert.equal(fechas(), bog + '>' + WILLIAN, 'asignar_a (UTC+14) escribió otra fecha');
    sql("select set_config('timezone', 'Etc/GMT-14', false); select public.equipo_reasignar('" + CLAVE + "', " + lista + ", '" + LEIDY + "')");
    assert.equal(fechas(), bog + '>' + LEIDY, 'equipo_reasignar escribió la fecha de la sesión');
    assert.equal(sql("select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in " +
      "('asignar_a', 'asesor_retirar', 'agregar_prospectos_de', 'equipo_reasignar') and prosrc ~ 'current_date'"), '0');
  });

  /* 27-oct-2026, ronda 2 — BORRAR A QUIEN LO PIDE, TAMBIÉN DE LA COPIA DEL
     PANEL. panel_ajustes 'prospectos' (la que deja «⬆ Subir») seguía con Gloria
     y su nota, y «⬇ Traer» la devolvía al CRM de Joan. */
  test('24 · borrar a quien lo pide la quita de la copia del Panel y de sus choques, y no vuelve aunque otro aparato la suba', () => {
    const g = cel(47, 1), otra = cel(47, 2);
    const lista = jsonb([{ id: 'P1729000000000-0', celular: g, nombre: 'Gloria Pérez', nota: 'vende arepas, tiene 3 hijos' },
      { id: 'P1729000000000-1', celular: otra, nombre: 'Otra Persona' }]);
    sql("insert into public.panel_ajustes (clave, datos) values ('prospectos', " + lista + ") on conflict (clave) do update set datos = excluded.datos");
    sql("insert into public.panel_choques (tabla, fila_id, mio, suyo) values ('ajustes', 'prospectos', jsonb_build_object('clave', 'prospectos', 'datos', " + lista +
        "), jsonb_build_object('revision', 3, 'datos', " + lista + "))");
    const enPanel = () => sql("select coalesce(string_agg(e->>'celular', ',' order by e->>'celular'), '') from public.panel_ajustes pa " +
      "cross join lateral jsonb_array_elements(pa.datos) e where pa.clave = 'prospectos'");
    assert.equal(enPanel(), g + ',' + otra);
    const s = joan('equipo_suprimir', "'" + g + "', 'por el chat de la app el 3-nov'");
    assert.equal(s.ok, true);
    assert.equal(enPanel(), otra, 'Gloria sigue en la copia del Panel en la nube');
    assert.equal(sql("select count(*) from public.panel_choques where tabla = 'ajustes' and fila_id = 'prospectos' and (mio::text ~ '" + g + "' or suyo::text ~ '" + g + "')"), '0',
      'Gloria sigue en las copias de los choques');
    assert.equal(sql("select count(*) from public.panel_choques where tabla = 'ajustes' and fila_id = 'prospectos' and mio::text ~ '" + otra + "'"), '1', 'se llevó a los demás');
    /* Otro aparato de Joan (el celular) todavía la tiene y vuelve a subir su lista: la nube no la guarda. */
    sql("update public.panel_ajustes set datos = " + lista + ", revision = revision + 1 where clave = 'prospectos'");
    assert.equal(enPanel(), otra, 'otro aparato la volvió a subir');
    sql("insert into public.panel_choques (tabla, fila_id, mio, suyo) values ('ajustes', 'prospectos', jsonb_build_object('datos', " + lista + "), '{}'::jsonb)");
    assert.equal(sql("select count(*) from public.panel_choques where mio::text ~ '" + g + "'"), '0', 'un choque nuevo la guardó');
    /* CONTROL: sin nadie en no_contactar con su número, la lista no se toca. */
    assert.equal(sql("select jsonb_array_length(public.prospectos_sin_suprimidos(" + jsonb([{ celular: cel(47, 9) }, { celular: otra }]) + "))"), '2');
  });

  /* 27-oct-2026, ronda 3 — DOS HALLAZGOS DE «BORRAR A ALGUIEN QUE LO PIDIÓ»:
     (a) con la copia real del Panel de Joan (18.190 prospectos, 3,2 MB) y 8
     choques, equipo_suprimir pasaba de los 3 s de la llave anon y se caía
     ENTERO (reescribía todos los choques, aunque la persona no estuviera); y
     (b) dejaba en la copia del Panel sus gestiones, con su nota. Aquí, como en
     Supabase: anon con statement_timeout de 3 s. */
  test('25 · borrar cabe en una llamada (por partes) con la copia real del Panel y 8 choques; toca solo lo de ESA persona; y se lleva sus gestiones', () => {
    const N = 18190, sup = cel(48, 1), nada = cel(48, 9);
    const lista = Array.from({ length: N }, (_, i) => ({ id: 'P1729' + String(i).padStart(8, '0') + '-' + i, nombre: 'Persona Numero ' + i,
      celular: '31' + String(80000000 + i), estado: 'nuevo', base: 'feria-' + (i % 7) + '.xlsx', cargadoEn: '2026-09-26', autorizaInvitacion: true }));
    lista.push({ id: 'P-SUP-25', nombre: 'Pidio Borrar', celular: sup, estado: 'nuevo', nota: 'vende arepas en la 45' });
    const ges = Array.from({ length: 3000 }, (_, i) => ({ id: 'loc-' + i, persona_id: lista[i].id, tipo: 'no_contesta', nota: 'nota ' + i,
      cuando: '2026-10-20T15:00:00Z', quien: 'Joan' }));
    ges.push({ id: 'g-sup-25', persona_id: 'P-SUP-25', tipo: 'no_interesa', nota: 'dice que no la llamen más; vive con la mamá',
      cuando: '2026-10-20T15:00:00Z', quien: 'Joan' });
    const fP = path.join(dir, 'prosp-25.json'), fG = path.join(dir, 'ges-25.json');
    fs.writeFileSync(fP, JSON.stringify(lista)); fs.writeFileSync(fG, JSON.stringify(ges));
    const leer = f => "pg_read_file('" + f.split(path.sep).join('/') + "')::jsonb";
    sql("delete from public.panel_choques where tabla = 'ajustes' and fila_id in ('prospectos', 'gestiones');" +
        " insert into public.panel_ajustes (clave, datos) values ('prospectos', " + leer(fP) + ") on conflict (clave) do update set datos = excluded.datos;" +
        " insert into public.panel_ajustes (clave, datos) values ('gestiones', " + leer(fG) + ") on conflict (clave) do update set datos = excluded.datos;" +
        " insert into public.panel_choques (tabla, fila_id, mio, suyo) select 'ajustes', 'prospectos', jsonb_build_object('clave', 'prospectos', 'datos', datos)," +
        "   jsonb_build_object('revision', 2, 'datos', datos) from public.panel_ajustes, generate_series(1, 8) where clave = 'prospectos';" +
        " insert into public.panel_choques (tabla, fila_id, mio, suyo) select 'ajustes', 'gestiones', jsonb_build_object('clave', 'gestiones', 'datos', datos)," +
        "   jsonb_build_object('revision', 2, 'datos', datos) from public.panel_ajustes, generate_series(1, 2) where clave = 'gestiones';");
    const comoAnon = c => {
      const t0 = Date.now();
      const out = sql("set role anon; set statement_timeout = '3s'; select public.equipo_suprimir('" + CLAVE + "', '" + c + "', 'por el chat de la app el 3-nov')::text")
        .split(/\r?\n/).pop();
      return { ms: Date.now() - t0, r: JSON.parse(out) };
    };
    const huellas = () => sql("select string_agg(id || ':' || xmin::text, ',' order by id) from public.panel_choques where tabla = 'ajustes'") +
      '|' + sql("select xmin::text from public.panel_ajustes where clave = 'prospectos'");
    /* CONTROL de «toca solo lo de esa persona»: un número que no está en
       ninguna copia no reescribe ni la copia del Panel ni ningún choque. */
    const antes = huellas();
    const c0 = comoAnon(nada);
    assert.equal(c0.r.ok, true, JSON.stringify(c0.r));
    assert.equal(huellas(), antes, 'con un número que no estaba, reescribió la copia del Panel o los choques');
    /* La persona está en la copia del Panel y en los 8 choques: cada llamada
       cabe (si no, sql() revienta con «canceling statement due to statement
       timeout»), y se repite hasta que no quede ninguna copia. */
    let r = null, vueltas = 0;
    do { r = comoAnon(sup); vueltas++; } while (r.r.copias_pendientes > 0 && vueltas < 20);
    assert.equal(r.r.copias_pendientes, 0, 'después de ' + vueltas + ' llamadas siguen quedando copias');
    assert.ok(vueltas < 20);
    const enLista = (donde, campo, valor) => Number(sql("select count(*) from " + donde + " cross join lateral jsonb_array_elements(x) e where e->>'" + campo + "' = '" + valor + "'"));
    assert.equal(enLista("(select datos x from public.panel_ajustes where clave = 'prospectos') t", 'celular', sup), 0, 'sigue en la copia del Panel');
    assert.equal(enLista("(select mio->'datos' x from public.panel_choques where fila_id = 'prospectos' union all select suyo->'datos' from public.panel_choques where fila_id = 'prospectos') t", 'celular', sup), 0,
      'sigue en los choques viejos');
    assert.equal(enLista("(select datos x from public.panel_ajustes where clave = 'gestiones') t", 'persona_id', 'P-SUP-25'), 0,
      'su gestión (con su nota) sigue en la copia del Panel');
    assert.equal(enLista("(select mio->'datos' x from public.panel_choques where fila_id = 'gestiones' union all select suyo->'datos' from public.panel_choques where fila_id = 'gestiones') t", 'persona_id', 'P-SUP-25'), 0,
      'su gestión sigue en los choques de gestiones');
    /* A los demás no se les tocó nada. */
    assert.equal(sql("select jsonb_array_length(datos) from public.panel_ajustes where clave = 'prospectos'"), String(N));
    assert.equal(sql("select jsonb_array_length(datos) from public.panel_ajustes where clave = 'gestiones'"), '3000');
    assert.equal(sql("select string_agg(distinct jsonb_array_length(mio->'datos')::text, ',') from public.panel_choques where fila_id = 'prospectos'"), String(N));
    /* Su número no queda en claro: solo la huella y sus códigos. */
    assert.equal(sql("select ids::text from public.no_contactar where cel_hash = public.cel_hash('" + sup + "')"), '{P-SUP-25}');
    assert.equal(sql("select count(*) from public.no_contactar where cel_hash = '" + sup + "' or como ~ '" + sup + "'"), '0');
    /* Otro aparato de Joan sube otra vez sus gestiones con la de ella, o choca: la nube no la guarda. */
    sql("update public.panel_ajustes set datos = " + leer(fG) + " where clave = 'gestiones'");
    assert.equal(enLista("(select datos x from public.panel_ajustes where clave = 'gestiones') t", 'persona_id', 'P-SUP-25'), 0, 'otro aparato la volvió a subir');
    sql("insert into public.panel_choques (tabla, fila_id, mio, suyo) values ('ajustes', 'gestiones', jsonb_build_object('datos', " + leer(fG) + "), '{}'::jsonb)");
    assert.equal(enLista("(select mio->'datos' x from public.panel_choques where fila_id = 'gestiones') t", 'persona_id', 'P-SUP-25'), 0, 'un choque nuevo la guardó');
    /* Llamarla otra vez no cambia nada (y sigue cabiendo). */
    const otra = comoAnon(sup);
    assert.deepEqual([otra.r.ok, otra.r.copias_pendientes], [true, 0]);
    sql("delete from public.panel_choques where tabla = 'ajustes' and fila_id in ('prospectos', 'gestiones');" +
        " update public.panel_ajustes set datos = '[]'::jsonb where clave in ('prospectos', 'gestiones')");
  });

  test('16 · el archivo corre dos veces con sus 12 en true; sin 22d se para y no toca nada', () => {
    const f = path.join(dir, 'otra-vez.sql');
    fs.writeFileSync(f, fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8'));
    const r = archivo(f);
    assert.equal(r.status, 0, r.stderr);
    const filas = r.stdout.split(/\r?\n/).filter(l => /^\d+\|/.test(l));
    const comprobaciones = filas.filter(l => Number(l.split('|')[0]) <= 12);
    assert.equal(comprobaciones.length, 12);
    comprobaciones.forEach(l => assert.equal(l.split('|')[2], 't', 'no salió en true: ' + l));
    const gerentes = filas.filter(l => Number(l.split('|')[0]) > 20);
    assert.ok(gerentes.some(l => /Puede subir gente: OTRO/.test(l) && l.split('|')[2] === 'f' && /equipo_acuerdo_firmado/.test(l)),
      'la fila de OTRO no dice qué le falta');
    assert.ok(gerentes.some(l => /Puede subir gente: WILLIAN/.test(l) && l.split('|')[2] === 't'));
    /* Una base sin 22d: copia de esta, sin lo de hoy y sin la función del equipo. */
    sql('create database tg2 template tg', 'postgres');
    sql(`drop table public.cartera_info, public.equipo_cargas, public.equipo_frenos, public.equipo_acuerdos,
           public.no_contactar, public.joan_celulares;
         drop function public.gerente_agregar_prospectos(jsonb);
         drop function public.celular_del_equipo_de_sesion();`, 'tg2');
    const sin = archivo(f, 'tg2');
    assert.notEqual(sin.status, 0, 'sin 22d corrió');
    assert.match(sin.stderr, /Primero corre base\/20261022d_el_equipo_con_la_clave_de_joan\.sql/);
    assert.equal(sql("select to_regclass('public.cartera_info') is null and to_regprocedure('public.gerente_agregar_prospectos(jsonb)') is null", 'tg2'), 't',
      'sin 22d dejó algo creado');
  });
});
