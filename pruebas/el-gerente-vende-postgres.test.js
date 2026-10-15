'use strict';
/* ============================================================================
 * EL GERENTE VENDE, EN UN POSTGRESQL DE VERDAD — 15 de octubre de 2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/el-gerente-vende-postgres.test.js
 *
 * Joan: «quiero que [Willian] inicie vendiendo créditos y que pueda ver los
 * nuevos registros pero únicamente de los clientes que tenemos como
 * prospectos y no todos, solo los que yo le asigne, y que él pueda hacer la
 * venta y la cobranza».
 *
 * Lo que se vigila aquí es lo que una pantalla NO puede garantizar, porque lo
 * decide la base: QUÉ ve un gerente y qué no. Por eso se arman dos equipos
 * —el de Willian con LEIDY, y el de OTRO gerente— y cada prueba mira las dos
 * caras: que vea lo suyo, y que NO vea lo ajeno. Una prueba que solo mira lo
 * que sí aparece pasa igual con una función que lo devuelve todo.
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

const WILLIAN = '3000000000', LEIDY = '3000000002', OTRO = '3000000009';
/* Los prospectos: 1 de Willian, 2 de LEIDY (su asesora), 3 del otro equipo, 4
   fue de Willian pero Joan se lo pasó al otro equipo, 5 y 6 no están en
   ninguna base. */
const CEL = n => '310150000' + n;

describe('el gerente vende: lo que ve y lo que puede, en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-q', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8' });
  const json = q => JSON.parse(sql(q));
  const como = (cel, q) => JSON.parse(sql(
    "select set_config('request.jwt.claims', '{\"email\":\"57" + cel + "@tugarantia.net\"}', false); select (" + q + ")::text").split('\n').pop());
  const fechaEn = dias => sql("select to_char(public.hoy_bogota() + " + dias + ", 'YYYY-MM-DD')");
  const telefonos = r => (r.registros || []).map(x => String(x.telefono)).sort();

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-gerente-'));
    puerto = 55000 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && !/^2026100[78]/.test(f) && !/^20261015/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    ['20261007_una_puerta.sql', '20261007c_una_puerta_cierres.sql', '20261008_condiciones_aceptadas.sql']
      .forEach(f => {
        const r = archivo(path.join(RAIZ, 'base', f), true);
        assert.equal(r.status, 0, f + ' no corrió en el banco: ' + r.stderr);
      });

    /* El archivo nuevo, DOS veces: tiene que ser idempotente. */
    [1, 2].forEach(() => {
      const r = archivo(path.join(RAIZ, 'base', '20261015_el_gerente_vende.sql'), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia: ' + r.stderr);
    });

    sql(`
      insert into public.equipo (celular, nombre, rol, estado, jefe) values
        ('${WILLIAN}', 'WILLIAN', 'gerente', 'activo', null),
        ('${LEIDY}',   'LEIDY',   'asesor',  'activo', '${WILLIAN}'),
        ('${OTRO}',    'OTRO',    'gerente', 'activo', null);
      insert into public.cartera (id, tipo, celular, nombre) values
        ('P1', 'prospecto', '${CEL(1)}', 'Uno'), ('P2', 'prospecto', '${CEL(2)}', 'Dos'),
        ('P3', 'prospecto', '${CEL(3)}', 'Tres'), ('P4', 'prospecto', '${CEL(4)}', 'Cuatro');
      insert into public.asignaciones (id, persona_id, asesor, desde) values
        ('A1',  'P1', '${WILLIAN}', current_date - 5),
        ('A2',  'P2', '${LEIDY}',   current_date - 5),
        ('A3',  'P3', '${OTRO}',    current_date - 5),
        ('A4a', 'P4', '${WILLIAN}', current_date - 10),
        ('A4b', 'P4', '${OTRO}',    current_date - 2);
      insert into public.registros (cedula, nombre, telefono, datos, estado, origen) values
        ('1010', 'Uno Registrado',    '${CEL(1)}', '{"documento":"1010"}', 'nuevo', 'abierto'),
        ('2020', 'Dos Registrado',    '${CEL(2)}', '{}', 'nuevo', 'abierto'),
        ('3030', 'Tres Registrado',   '${CEL(3)}', '{}', 'nuevo', 'abierto'),
        ('4040', 'Cuatro Registrado', '${CEL(4)}', '{}', 'nuevo', 'abierto'),
        ('5050', 'Cinco Registrado',  '${CEL(5)}', '{}', 'nuevo', 'abierto'),
        ('6060', 'Seis Registrado',   '${CEL(6)}', '{}', 'nuevo', 'abierto');
      insert into public.registro_archivos (celular, tipo, imagen) values
        ('${CEL(1)}', 'selfie', 'data:image/jpeg;base64,AAAA'),
        ('${CEL(3)}', 'selfie', 'data:image/jpeg;base64,BBBB');
      insert into auth.users (email, created_at) values
        ('57${CEL(1)}@tugarantia.net', now()), ('57${CEL(3)}@tugarantia.net', now());
    `);
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('VE SOLO LO DE SU ALCANCE: su base, la de su asesora, y nada del otro equipo', () => {
    const r = como(WILLIAN, 'public.gerente_registros()');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(telefonos(r), [CEL(1), CEL(2)],
      'Willian ve registros que no son de su base, o le falta uno de LEIDY');
    const uno = r.registros.find(x => x.telefono === CEL(1));
    assert.equal(uno.por, 'base');
    assert.equal(uno.asesor_nombre, 'WILLIAN');
    assert.equal(uno.datos.documento, '1010', 'Joan decidió que vea el registro completo');
    assert.ok(!('codigo' in uno), 'el código de invitación no le sirve a nadie');
    assert.equal(r.registros.find(x => x.telefono === CEL(2)).asesor_nombre, 'LEIDY');
    /* El 4 FUE de Willian: lo que manda es la última asignación. */
    assert.ok(!telefonos(r).includes(CEL(4)), 've a alguien que Joan ya le pasó a otro equipo');

    /* Y el otro gerente ve lo suyo, no lo de Willian. */
    assert.deepEqual(telefonos(como(OTRO, 'public.gerente_registros()')), [CEL(3), CEL(4)]);
  });

  test('LO QUE JOAN LE ASIGNA A MANO aparece, y al quitárselo desaparece', () => {
    const a = json('select public.registro_asignar(' + CLAVE + ", '" + CEL(6) + "', '" + WILLIAN + "')");
    assert.equal(a.ok, true, JSON.stringify(a));
    let r = como(WILLIAN, 'public.gerente_registros()');
    assert.deepEqual(telefonos(r), [CEL(1), CEL(2), CEL(6)]);
    assert.equal(r.registros.find(x => x.telefono === CEL(6)).por, 'asignado');

    /* Asignárselo a otro lo mueve: una sola asignación viva por celular. */
    json('select public.registro_asignar(' + CLAVE + ", '" + CEL(6) + "', '" + OTRO + "')");
    assert.ok(!telefonos(como(WILLIAN, 'public.gerente_registros()')).includes(CEL(6)));
    assert.equal(sql("select count(*) from public.registros_asignados where telefono = '" + CEL(6) + "' and activo"), '1');

    /* Vacío lo quita, y la historia se queda. */
    assert.equal(json('select public.registro_asignar(' + CLAVE + ", '" + CEL(6) + "', '')").ok, true);
    assert.ok(!telefonos(como(OTRO, 'public.gerente_registros()')).includes(CEL(6)));
    assert.equal(sql("select count(*) from public.registros_asignados where telefono = '" + CEL(6) + "'"), '2');

    /* A alguien que no es del equipo, no; y sin la clave, nada. */
    assert.equal(json('select public.registro_asignar(' + CLAVE + ", '" + CEL(6) + "', '3009998887')").ok, false);
    assert.throws(() => sql("select public.registro_asignar('clave-mala', '" + CEL(6) + "', '" + WILLIAN + "')"), /clave/);
  });

  test('UN ASESOR, UN CLIENTE Y LA LLAVE PÚBLICA NO VEN NADA', () => {
    assert.equal(como(LEIDY, 'public.gerente_registros()').motivo, 'solo_gerente',
      'Joan pidió esto para su gerente, no para los asesores');
    assert.equal(como(CEL(1), 'public.gerente_registros()').motivo, 'solo_gerente');
    sql("select set_config('request.jwt.claims', '', false)");
    assert.equal(json('select public.gerente_registros()').motivo, 'solo_gerente');
    ['public.gerente_registros()', 'public.gerente_archivos(text)',
     'public.gerente_proponer(bigint, bigint, integer, integer, text)'].forEach(f =>
      assert.equal(sql("select has_function_privilege('anon', '" + f + "', 'execute')"), 'f',
        f + ' se puede llamar con la llave pública'));
    ['public.registro_en_mi_alcance(text, text)', 'public.gerente_de_sesion()'].forEach(f =>
      assert.equal(sql("select has_function_privilege('authenticated', '" + f + "', 'execute')"), 'f',
        f + ' se puede llamar desde afuera: cualquiera preguntaría de quién es un celular'));
  });

  test('LAS FOTOS: las suyas sí y quedan anotadas; las ajenas no y no se anota nada', () => {
    const antes = Number(sql('select count(*) from public.vistas_de_datos'));
    const f = como(WILLIAN, "public.gerente_archivos('" + CEL(1) + "')");
    assert.equal(f.ok, true, JSON.stringify(f));
    assert.equal(f.fotos.selfie, 'data:image/jpeg;base64,AAAA');
    assert.equal(sql("select quien || '|' || que || '|' || de from public.vistas_de_datos order by id desc limit 1"),
      WILLIAN + '|fotos_registro|' + CEL(1), 'las fotos se entregaron sin dejar rastro');

    const ajena = como(WILLIAN, "public.gerente_archivos('" + CEL(3) + "')");
    assert.equal(ajena.ok, false);
    assert.equal(ajena.motivo, 'no_es_tuyo');
    assert.ok(!('fotos' in ajena), 'devolvió fotos de otro equipo');
    assert.equal(Number(sql('select count(*) from public.vistas_de_datos')), antes + 1,
      'se anotó una vista que no pasó');

    assert.equal(como(LEIDY, "public.gerente_archivos('" + CEL(2) + "')").motivo, 'solo_gerente');
  });

  test('EL RASTRO NO SE BORRA NI SE CAMBIA', () => {
    assert.throws(() => sql('delete from public.vistas_de_datos'), /no se cambia ni se borra/);
    assert.throws(() => sql("update public.vistas_de_datos set quien = 'x'"), /no se cambia ni se borra/);
  });

  test('LA VENTA: cerrada sin topes, dentro de los topes sí, fuera no, y lo ajeno nunca', () => {
    const s = como(CEL(1), "public.solicitar_a_la_medida(400000, '" + fechaEn(20) + "'::date, null)").solicitud;
    assert.ok(s && s.id, 'el cliente no pudo pedir');
    const proponer = (cel, id, cap, pct, dias) =>
      como(cel, 'public.gerente_proponer(' + id + ', ' + cap + ', ' + pct + ', ' + dias + ", 'Te podemos dar esto')");

    sql('delete from public.topes_equipo');
    assert.equal(proponer(WILLIAN, s.id, 250000, 20, 15).motivo, 'sin_topes',
      'sin topes de Joan el gerente pudo proponer: tiene que estar cerrado por defecto');

    const t = json('select public.topes_equipo_guardar(' + CLAVE + ', 500000, 10, 20, 30)');
    assert.equal(t.ok, true, JSON.stringify(t));
    assert.equal(proponer(WILLIAN, s.id, 600000, 20, 15).motivo, 'fuera_de_topes', 'pasó el monto máximo');
    assert.equal(proponer(WILLIAN, s.id, 250000, 25, 15).motivo, 'fuera_de_topes', 'pasó el costo máximo');
    assert.equal(proponer(WILLIAN, s.id, 250000, 5, 15).motivo, 'fuera_de_topes', 'bajó del costo mínimo');
    assert.equal(proponer(WILLIAN, s.id, 250000, 20, 45).motivo, 'fuera_de_topes', 'pasó los días máximos');
    assert.equal(proponer(OTRO, s.id, 250000, 20, 15).motivo, 'no_es_tuyo', 'otro gerente le vendió al cliente de Willian');
    assert.equal(proponer(LEIDY, s.id, 250000, 20, 15).motivo, 'solo_gerente');

    const bien = proponer(WILLIAN, s.id, 250000, 20, 15);
    assert.equal(bien.ok, true, JSON.stringify(bien));
    const cp = bien.solicitud.contrapropuesta;
    assert.equal(cp.por, 'gerente:' + WILLIAN, 'la propuesta no dice que la hizo el gerente');
    assert.equal(cp.por_nombre, 'WILLIAN');
    assert.equal(Number(cp.total), 300000);
    assert.equal(bien.solicitud.estado, 'contrapropuesta');
    assert.ok(!('datos' in bien.solicitud) && !('responsable' in bien.solicitud));

    /* Y el cliente la acepta con sus condiciones, igual que una de Joan. Esto
       es lo que importa: una propuesta con otra forma no la reconocería
       aceptar_condiciones. */
    const vio = "'" + JSON.stringify({ version: '2026-10-08', capital: 250000, total: Number(cp.total),
      fecha_pago: cp.fecha_pago, creada_en: cp.creada_en,
      texto: 'Las condiciones de este crédito\n- Recibes: $250.000\n- Total a pagar: $300.000',
      lineas: [{ clave: 'recibes', k: 'Recibes', v: '$250.000' }] }) + "'::jsonb";
    const acepta = como(CEL(1), 'public.aceptar_condiciones(' + s.id + ', ' + vio + ')');
    assert.equal(acepta.ok, true, 'el cliente no pudo aceptar la propuesta del gerente: ' + JSON.stringify(acepta));
    assert.equal(acepta.solicitud.estado, 'aceptada');

    /* Aceptada es de Joan: el gerente ya no la toca. */
    assert.equal(proponer(WILLIAN, s.id, 200000, 20, 15).motivo, 'no_esta_abierta',
      'el gerente pudo cambiarle la propuesta a un cliente que ya la firmó');

    /* Un cliente del otro equipo. */
    const ajena = como(CEL(3), "public.solicitar_a_la_medida(300000, '" + fechaEn(15) + "'::date, null)").solicitud;
    assert.equal(proponer(WILLIAN, ajena.id, 250000, 20, 15).motivo, 'no_es_tuyo');

    /* Capital 0 apaga los topes. */
    assert.equal(json('select public.topes_equipo_guardar(' + CLAVE + ', 0, 1, 1, 1)').ok, true);
    assert.equal(json('select public.topes_equipo_leer(' + CLAVE + ')').topes, null);
    json('select public.topes_equipo_guardar(' + CLAVE + ', 500000, 10, 20, 30)');
  });

  test('la lista del gerente trae las solicitudes de cada uno y los topes', () => {
    const r = como(WILLIAN, 'public.gerente_registros()');
    const uno = r.registros.find(x => x.telefono === CEL(1));
    assert.ok(uno.solicitudes.length >= 1, 'no trae la solicitud del cliente');
    assert.ok(!('datos' in uno.solicitudes[0]), 'la solicitud trae el paquete repetido');
    assert.deepEqual([r.topes.capital_max, r.topes.costo_min, r.topes.costo_max, r.topes.dias_max].map(Number),
      [500000, 10, 20, 30], 'la pantalla no puede decir los topes si no le llegan');
  });

  test('JOAN VE QUIÉN VE CADA REGISTRO', () => {
    json('select public.registro_asignar(' + CLAVE + ", '" + CEL(5) + "', '" + LEIDY + "')");
    const r = json('select public.registros_quien_ve(' + CLAVE + ')').registros;
    const de = t => r.find(x => x.telefono === t);
    assert.equal(de(CEL(1)).gerente_nombre, 'WILLIAN');
    assert.equal(de(CEL(2)).asesor_nombre, 'LEIDY');
    assert.equal(de(CEL(2)).gerente_nombre, 'WILLIAN', 'el de una asesora lo ve su gerente');
    assert.equal(de(CEL(4)).gerente_nombre, 'OTRO', 'manda la última asignación');
    assert.equal(de(CEL(5)).por, 'asignado');
    assert.equal(de(CEL(6)), undefined, 'uno sin nadie aparece como si alguien lo viera');
    assert.throws(() => sql("select public.registros_quien_ve('clave-mala')"), /clave/);
  });

  test('LA ASIGNACIÓN A MANO MANDA SOBRE LA BASE: nunca dos gerentes con el mismo cliente', () => {
    /* El 3 es de la base de OTRO. Si Joan se lo pasa a mano a Willian, lo ve y
       lo atiende SOLO Willian. Sin esta regla lo veían los dos, y los dos le
       podían proponer al mismo cliente. */
    json('select public.registro_asignar(' + CLAVE + ", '" + CEL(3) + "', '" + WILLIAN + "')");
    const w = como(WILLIAN, 'public.gerente_registros()');
    assert.ok(telefonos(w).includes(CEL(3)), 'Joan se lo asignó y Willian no lo ve');
    assert.equal(w.registros.find(x => x.telefono === CEL(3)).por, 'asignado');
    assert.ok(!telefonos(como(OTRO, 'public.gerente_registros()')).includes(CEL(3)),
      'el otro gerente lo sigue viendo: dos gerentes con el mismo cliente');
    assert.equal(como(WILLIAN, "public.gerente_archivos('" + CEL(3) + "')").ok, true);
    assert.equal(como(OTRO, "public.gerente_archivos('" + CEL(3) + "')").motivo, 'no_es_tuyo');
    const q = json('select public.registros_quien_ve(' + CLAVE + ')').registros.find(x => x.telefono === CEL(3));
    assert.equal(q.gerente_nombre, 'WILLIAN', 'la bandeja de Joan diría que lo ve otro');

    /* Al quitarlo, vuelve a la base de donde venía. */
    json('select public.registro_asignar(' + CLAVE + ", '" + CEL(3) + "', '')");
    assert.ok(telefonos(como(OTRO, 'public.gerente_registros()')).includes(CEL(3)));
    assert.ok(!telefonos(como(WILLIAN, 'public.gerente_registros()')).includes(CEL(3)));
  });

  test('REPARTIR EL MISMO DÍA YA NO FALLA', () => {
    /* Antes: la segunda asignación del día chocaba con asignaciones_una_por_dia
       y la llamada entera reventaba con 23505. */
    const a = como(WILLIAN, `public.asignar_a('["P1"]'::jsonb, '${LEIDY}')`);
    assert.equal(a.ok, true, JSON.stringify(a));
    const b = como(WILLIAN, `public.asignar_a('["P1"]'::jsonb, '${WILLIAN}')`);
    assert.equal(b.ok, true, 'reasignar el mismo día volvió a fallar: ' + JSON.stringify(b));
    assert.equal(sql("select count(*) || '|' || max(asesor) from public.asignaciones where persona_id = 'P1' and desde = current_date"),
      '1|' + WILLIAN, 'quedaron dos dueños el mismo día, o no quedó el último');
  });

  test('LA COMPROBACIÓN PARA JOAN SALE TODA EN TRUE', () => {
    const filas = sql(fs.readFileSync(path.join(RAIZ, 'base', '20261015b_el_gerente_vende_comprobar.sql'), 'utf8'))
      .split('\n').filter(Boolean).map(l => l.split('|'));
    assert.equal(filas.length, 9);
    filas.forEach(f => assert.equal(f[2], 't', 'la fila ' + f[0] + ' («' + f[1] + '») sale false: ' + f[3]));
  });
});
