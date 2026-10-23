/* ============================================================================
 * «👤 ASIGNAR A…» DE PUNTA A PUNTA, CON UN POSTGRESQL DE VERDAD — 23-oct-2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/asignar-desde-la-ficha-postgres.test.js
 *
 * Joan: «William tiene asignada una base, quiero que yo esté en esa base como
 * cliente y que me gestione a mí como si yo fuera un cliente, Joan Ruiz
 * 3103606348». La pregunta que esto contesta no es si el botón existe
 * (pruebas/asignar-desde-la-ficha.test.js): es si Willian LO VE. Así que el
 * CRM de Joan corre en el banco (pruebas/banco-panel.js) con su rpc conectado
 * a un PostgreSQL con TODAS las migraciones de base/, en su orden: lo que
 * publica es lo que llega a equipo_publicar, lo que trae sale de equipo_traer,
 * y lo que ve Willian es mi_cartera() y ficha_de_mi_base() con su sesión. Y la
 * «Mi base» se pinta con el CRM del gerente (vistaBaseEquipo) con esa respuesta.
 *
 * Lo que vigila:
 *   · un cliente creado a mano con «＋ Agregar cliente», SIN crédito, asignado a
 *     Willian en el mismo cuadro, le sale en «Mi base» (lista y ficha) como
 *     «Cliente registrado», y al otro gerente no;
 *   · pasárselo a otro EL MISMO DÍA desde la ficha: la publicación no choca
 *     (antes: dos filas del mismo día, 23505 del índice
 *     asignaciones_una_por_dia, la publicación entera al piso y el reintento
 *     chocando para siempre — la prueba «control» lo muestra) y cambia de base;
 *   · «Quitarle la asignación» llega: nadie lo ve; y otro computador de Joan
 *     que trae el equipo no se lo da a nadie;
 *   · un prospecto agregado a mano y asignado a Willian le sale para vender;
 *   · «🔀 Repartir» reasignando el mismo día tampoco tumba ya la publicación
 *     (le pasaba igual: es la misma fila nueva del mismo día).
 * Falla contra f05f485 (crm-asignar antes de este cambio). Los números son de
 * mentira, salvo el de Joan, que es el que él dio para probar.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { abrirPanel } = require('./banco-panel.js');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = 'clave-de-prueba-larga-123';
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const aca = v => JSON.parse(JSON.stringify(v));

const WILLIAN = '3000000000', LEIDY = '3000000002', OTRO = '3000000009';
const JOAN = '3103606348';
const EQUIPO = [
  { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
  { id: 'a1', nombre: 'LEIDY', rol: 'asesor', estado: 'activo', celular: LEIDY, jefe: 'g1' },
  { id: 'g2', nombre: 'OTRO', rol: 'gerente', estado: 'activo', celular: OTRO }];

describe('«👤 Asignar a…» llega a la «Mi base» de verdad, en un PostgreSQL', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
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
  /* Como la sesión de esa cuenta, con un token emitido después de la clave de
     Joan (base/20261022d_el_equipo_con_la_clave_de_joan.sql). */
  const como = (cel, q) => sql(
    "select set_config('request.jwt.claims', '{\"sub\":\"' || " + uid(cel) + " || '\",\"email\":\"57" + cel + "@tugarantia.net\",\"role\":\"authenticated\",\"iat\":' ||" +
    " floor(extract(epoch from now()) + 5) || '}', false);" +
    ' select (' + q + ')::text').split(/\r?\n/).slice(1).join('\n');
  const jsonComo = (cel, q) => JSON.parse(como(cel, q));
  const cuenta = cel => sql(
    'delete from auth.users where id = ' + uid(cel) + ';' +
    ' insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, raw_user_meta_data) values (' + uid(cel) +
    ", '57" + cel + "@tugarantia.net', extensions.crypt('la-que-eligio', extensions.gen_salt('bf')), now(), now() - interval '60 seconds', '{}'::jsonb)");
  const jsonb = v => '$tgj$' + JSON.stringify(v == null ? [] : v) + '$tgj$::jsonb';
  const publicar = a => JSON.parse(sql('select public.equipo_publicar(' + "'" + CLAVE + "', " +
    jsonb(a.p_equipo) + ', ' + jsonb(a.p_asignaciones) + ', ' + jsonb(a.p_gente) + ')::text'));
  /* Lo que ve cada uno en «Mi base»: los ids de su lista. */
  const base = cel => (jsonComo(cel, 'public.mi_cartera()').gente || []);
  const ids = cel => base(cel).map(x => x.id).sort();

  /* La nube de Joan, para su CRM: las tres que usa al publicar, contra el
     PostgreSQL. Lo que falla vuelve como falla de red, con el texto de la base. */
  const publicaciones = [];
  const nube = (fn, args) => {
    try {
      if (fn === 'equipo_traer') return Promise.resolve(JSON.parse(sql("select public.equipo_traer('" + CLAVE + "')::text")));
      if (fn === 'gestiones_listar') return Promise.resolve(JSON.parse(sql("select public.gestiones_listar('" + CLAVE + "', null)::text") || '[]'));
      if (fn === 'equipo_publicar') { publicaciones.push(aca(args)); return Promise.resolve(publicar(args)); }
      return Promise.resolve(null);
    } catch (e) {
      return Promise.reject({ motivo: String((e && (e.stderr || e.message)) || e).slice(0, 300) });
    }
  };
  function crmDeJoan(o) {
    const P = abrirPanel();
    P.cargarCartera(Object.assign({ socios: [], prestamos: [], prospectos: [], equipo: EQUIPO, asignaciones: [],
      gestiones: [], config: { negocio: 'Tu Garantía' } }, o || {}));
    P.ctx._nube = nube;
    P.ev(`
      var _cuadros = [];
      sbListo = function () { return true; };
      sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
      confirm = function (m) { _cuadros.push(String(m)); return true; };
      alert = function (m) { _cuadros.push(String(m)); };
      estoyOcupado = function () { return false; };
      window.NubeCRM = { estado: function () { return { fase: 'lista' }; },
        libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
      rpc = function (fn, args) { return _nube(fn, args); };
    `);
    return P;
  }
  const ultimo = P => { const c = P.ev('_cuadros.slice()'); return c[c.length - 1] || ''; };
  const llenar = (P, f) => { P.ctx._f = f; P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })"); };
  async function asignar(P, tipo, id, aQuien, volver) {
    P.ev("asignarUno('" + tipo + "','" + id + "'" + (volver ? ",'" + volver + "'" : '') + ')');
    P.ev("document.getElementById('auDestino').value='" + aQuien + "'");
    const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','" + (volver || '') + "')");
    await ticks();
    return r;
  }

  let P, idJoan;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-asignar-'));
    puerto = 58400 + Math.floor(Math.random() * 380);
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
    /* TODAS, en el orden de base/ (el de RECETA-PUBLICAR-27-OCT). */
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = '" + CLAVE + "' where clave = 'clave_sync'");
    });
    /* Sin el índice de un día por persona, lo que sigue no prueba nada. */
    assert.notEqual(sql("select to_regclass('public.asignaciones_una_por_dia')"), '', 'no corrió base/20260922k_el_alcance_falla_cerrado.sql');
    assert.notEqual(sql("select to_regprocedure('public.celular_del_equipo_de_sesion()')"), '', 'no corrió el archivo del equipo (22d)');
    /* El equipo con su puesto (lo que el CRM de Joan publica al crear a cada
       uno), su cuenta y la clave de Joan puesta después. */
    publicar({ p_equipo: [{ celular: WILLIAN, nombre: 'WILLIAN', rol: 'gerente' },
      { celular: LEIDY, nombre: 'LEIDY', rol: 'asesor', jefe: WILLIAN }, { celular: OTRO, nombre: 'OTRO', rol: 'gerente' }] });
    [WILLIAN, LEIDY, OTRO].forEach((c, i) => {
      cuenta(c);
      assert.match(sql("select public.equipo_poner_clave('" + c + "', 'la-clave-de-joan-" + i + "')"), /^Listo/);
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('CONTROL: dos filas del mismo día para la misma persona —lo que Repartir mandaba al reasignar el mismo día— tumban equipo_publicar entera', () => {
    assert.throws(() => publicar({ p_asignaciones: [
      { id: 'X1', persona_id: 'PX', asesor: WILLIAN, desde: HOY },
      { id: 'X2', persona_id: 'PX', asesor: OTRO, desde: HOY }],
    p_gente: [{ id: 'PX', tipo: 'prospecto', celular: '3001119999', nombre: 'Control' }] }), /asignaciones_una_por_dia|duplicate key/,
    'la base ya aguanta dos filas del mismo día: el arreglo del CRM sobra o hay que mirarlo otra vez');
    assert.equal(sql("select count(*) from public.cartera where id = 'PX'"), '0', 'la publicación que chocó dejó algo escrito');
  });

  test('Joan se crea con «＋ Agregar cliente» y «Se lo asigno a: WILLIAN»: sin crédito, Willian lo ve en «Mi base» y en su ficha; el otro gerente no', async () => {
    P = crmDeJoan();
    P.ev('editarCliente()');
    llenar(P, { fNombre: 'Joan Ruiz', fTel: JOAN, fAsignarA: 'g1' });
    const r = await P.ev("guardarCliente('')");
    await ticks();
    assert.equal(r, 'publicado', 'no se publicó: ' + r + ' · ' + ultimo(P));
    assert.match(ultimo(P), /Joan Ruiz queda con WILLIAN[\s\S]*Ya se lo publiqué a tu equipo/);
    idJoan = P.ev('DB.socios[0].id');
    assert.equal(P.ev('DB.prestamos.length'), 0, 'precondición: sin crédito');

    const yo = base(WILLIAN).find(x => x.id === idJoan);
    assert.ok(yo, 'Willian no ve a Joan en «Mi base»: ' + JSON.stringify(base(WILLIAN)));
    assert.equal(yo.tipo, 'cliente');
    assert.equal(yo.nombre, 'Joan Ruiz');
    assert.equal(yo.celular, JOAN);
    assert.equal(yo.etapa, 'CR', 'sin crédito sale como «Cliente registrado»');
    assert.equal(yo.saldo, null, 'sin crédito no lleva una cifra inventada');
    assert.equal(yo.asesor, WILLIAN);
    const ficha = jsonComo(WILLIAN, "public.ficha_de_mi_base('" + idJoan + "')");
    assert.equal(ficha.ok, true, 'Willian no puede abrir la ficha de Joan: ' + JSON.stringify(ficha));
    assert.equal(ficha.nombre_base, 'Joan Ruiz');
    assert.deepEqual(ids(OTRO), [], 'el otro gerente ve a Joan');
    assert.equal(jsonComo(OTRO, "public.ficha_de_mi_base('" + idJoan + "')").ok, false);

    /* Y la pantalla de Willian: «Mi base», con lo que la nube le contestó. */
    const W = abrirPanel();
    W.ctx._mi = jsonComo(WILLIAN, 'public.mi_cartera()');
    W.ev('CARTERA_EQUIPO = _mi');
    const html = W.ev('vistaBaseEquipo()');
    assert.match(html, /<b>Joan Ruiz<\/b>/, 'la «Mi base» de Willian no pinta a Joan');
    assert.match(html, /Cobrar \(1\)/, 'Joan no cuenta como cliente en la «Mi base» de Willian');
  });

  test('el mismo día, desde la ficha, se lo pasa a OTRO: la publicación no choca y Joan cambia de base', async () => {
    const r = await asignar(P, 'cliente', idJoan, 'g2', 'ficha');
    assert.equal(r, 'publicado', 'la reasignación del mismo día no se publicó: ' + r + ' · ' + ultimo(P));
    assert.deepEqual(ids(OTRO), [idJoan], 'OTRO no lo ve');
    assert.ok(!ids(WILLIAN).includes(idJoan), 'Willian lo sigue viendo');
    assert.equal(sql("select count(*) from public.asignaciones where persona_id = '" + idJoan + "'"), '1', 'la nube no quedó con una sola del día');
    assert.equal(P.ev("asignaciones().filter(a => a.socio_id === '" + idJoan + "').length"), 2, 'el CRM dejó de sumar filas');
  });

  test('«Quitarle la asignación» llega: nadie lo ve; otro computador de Joan que trae el equipo no se lo da a nadie; y vuelve a Willian', async () => {
    P.ev("asignarUno('cliente','" + idJoan + "')");
    const r = await P.ev("confirmarAsignarUno('cliente','" + idJoan + "','',true)");
    await ticks();
    assert.equal(r, 'publicado', 'quitar no se publicó: ' + r);
    assert.ok(!ids(OTRO).includes(idJoan), 'OTRO lo sigue viendo después de quitárselo');
    assert.ok(!ids(WILLIAN).includes(idJoan));
    assert.equal(jsonComo(OTRO, "public.ficha_de_mi_base('" + idJoan + "')").ok, false, 'OTRO todavía abre su ficha');

    /* Otro computador de Joan, con alguien del equipo SIN celular: lo que trae
       de la nube no le da el cliente a esa persona. */
    const R = crmDeJoan({ socios: [{ id: idJoan, nombre: 'Joan Ruiz', telefono: JOAN, whatsappIgual: true }],
      equipo: EQUIPO.concat([{ id: 'x1', nombre: 'SIN CEL', rol: 'asesor', estado: 'activo', celular: '' }]) });
    await R.ev('traerEquipo(true)');
    assert.equal(R.ev("COMIS.asesorDe(asignaciones(),'" + idJoan + "','" + HOY + "')"), '', 'otro computador cree que alguien lo atiende');

    assert.equal(await asignar(P, 'cliente', idJoan, 'g1'), 'publicado');
    assert.deepEqual(ids(WILLIAN), [idJoan], 'volver a dárselo a Willian el mismo día no llegó');
  });

  test('un prospecto agregado a mano y asignado a Willian le sale para vender', async () => {
    P.ev('agregarProspecto()');
    llenar(P, { apNombre: 'PEDRO PÉREZ', apCel: '311 555 0001', apOrigen: 'me lo recomendó Nancy', apAutoriza: 'si', apAsignarA: 'g1' });
    const r = await P.ev('guardarProspectoSuelto()');
    await ticks();
    assert.equal(r, 'publicado', 'no se publicó: ' + r + ' · ' + ultimo(P));
    const pedro = base(WILLIAN).find(x => x.nombre === 'Pedro Pérez');
    assert.ok(pedro, 'Willian no ve al prospecto');
    assert.equal(pedro.tipo, 'prospecto');
    assert.equal(pedro.celular, '3115550001');
    assert.equal(pedro.etapa, 'PC');
    assert.ok(publicaciones.length >= 5, 'el CRM publicó menos veces de las que se le pidió');
  });

  test('«🔀 Repartir» sigue igual, y reasignar con él el mismo día ya no tumba la publicación', async () => {
    const S = crmDeJoan({ prospectos: [{ id: 'PR1', nombre: 'Rosa Repartida', celular: '3001112200', estado: 'nuevo' }] });
    const repartir = async aQuien => {
      S.ev("pantallaAsignar('potenciales')");
      S.ev("_todosMarcados = true; document.getElementById('asDestino').value = '" + aQuien + "'");
      const r = await S.ev('asignarMarcados()');
      await ticks();
      return r;
    };
    assert.equal(await repartir('g1'), 'publicado');
    assert.ok(ids(WILLIAN).includes('PR1'));
    const r = await repartir('g2');
    assert.equal(r, 'publicado', 'repartir otra vez el mismo día no se publicó (' + r + '): ' + ultimo(S));
    assert.match(ultimo(S), /Listo: 1 repartidos[\s\S]*Ya se lo publiqué/);
    assert.ok(ids(OTRO).includes('PR1'), 'OTRO no ve a quien le repartieron');
    assert.ok(!ids(WILLIAN).includes('PR1'), 'Willian sigue viendo a quien le quitaron');
  });
});
