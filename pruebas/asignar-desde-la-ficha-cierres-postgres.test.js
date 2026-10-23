/* ============================================================================
 * «👤 ASIGNAR A…»: LOS DEFECTOS DE LA REVISIÓN, EN UN POSTGRESQL — 23-oct-2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/asignar-desde-la-ficha-cierres-postgres.test.js
 *
 * Lo mismo que pruebas/asignar-desde-la-ficha-cierres.test.js, pero preguntando
 * lo que de verdad importa: qué ve Willian. El CRM de Joan corre en el banco
 * con su rpc conectado a un PostgreSQL con TODAS las migraciones de base/, y lo
 * que ve cada gerente es mi_cartera() y ficha_de_mi_base() con su sesión.
 *
 *   1. Asignar a WILLIAN, quitárselo y devolvérselo el mismo día, y que OTRO
 *      computador de Joan —armado con «⬇ Traer»— publique: Willian lo sigue
 *      viendo (antes nube.js tiraba la tercera fila y ese computador le
 *      publicaba «nadie»).
 *   2. Con lo que dejó la versión de antes en la nube (la fila del día con el
 *      id de la SEGUNDA, porque la primera apuntaba a alguien sin celular), la
 *      publicación nueva entra (antes: 23505 en cada intento, y el equipo sin
 *      recibir nada más).
 *   3. El cuadro dice que quien lo recibe ve su cédula, su dirección, sus
 *      cuentas y sus fotos, y ficha_de_mi_base se las da (antes decía «nunca»).
 *   4. Quitárselo el día que ya ganó comisión con él: en tus cuentas cuenta
 *      desde mañana, y en la «Mi base» deja de salir YA, como dice el cuadro
 *      (la nube toma la de fecha más reciente).
 * Falla contra 79c776f. Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { abrirPanel } = require('./banco-panel.js');
const NUBE = require('../panel/nube.js');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8')
  .match(/const STUB = `([\s\S]*?)`;/)[1];
const CLAVE = 'clave-de-prueba-larga-123';
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const HOY = iso(new Date());
const dias = n => { const x = new Date(HOY + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
const MANANA = dias(1);
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const aca = v => JSON.parse(JSON.stringify(v));

const WILLIAN = '3000000000', LEIDY = '3000000002', OTRO = '3000000009';
const EQUIPO = [
  { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
  { id: 'a1', nombre: 'LEIDY', rol: 'asesor', estado: 'activo', celular: LEIDY, jefe: 'g1' },
  { id: 'g2', nombre: 'OTRO', rol: 'gerente', estado: 'activo', celular: OTRO }];

describe('«👤 Asignar a…»: los defectos de la revisión, en un PostgreSQL', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
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
  const ids = cel => (jsonComo(cel, 'public.mi_cartera()').gente || []).map(x => x.id).sort();

  const nube = (fn, args) => {
    try {
      if (fn === 'equipo_traer') return Promise.resolve(JSON.parse(sql("select public.equipo_traer('" + CLAVE + "')::text")));
      if (fn === 'gestiones_listar') return Promise.resolve(JSON.parse(sql("select public.gestiones_listar('" + CLAVE + "', null)::text") || '[]'));
      if (fn === 'equipo_publicar') return Promise.resolve(publicar(args));
      return Promise.resolve(null);
    } catch (e) {
      return Promise.reject({ motivo: String((e && (e.stderr || e.message)) || e).slice(0, 300) });
    }
  };
  function crmDeJoan(o) {
    const P = abrirPanel();
    P.cargarCartera(Object.assign({ socios: [], prestamos: [], prospectos: [], equipo: EQUIPO, asignaciones: [],
      gestiones: [], actosComision: [], config: { negocio: 'Tu Garantía' } }, o || {}));
    P.ctx._nube = nube;
    P.ev('_selloDesdeDisco(true)');   // como un navegador después del PIN
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
  async function asignar(P, tipo, id, aQuien, volver) {
    P.ev("asignarUno('" + tipo + "','" + id + "'" + (volver ? ",'" + volver + "'" : '') + ')');
    P.ev("document.getElementById('auDestino').value='" + aQuien + "'");
    const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','" + (volver || '') + "')");
    await ticks();
    return r;
  }
  async function quitar(P, tipo, id) {
    P.ev("asignarUno('" + tipo + "','" + id + "')");
    const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','',true)");
    await ticks();
    return r;
  }
  const cliente = (id, nombre, tel) => ({ id, numero: 1, nombre, telefono: tel, whatsappIgual: true });

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-cierres-'));
    puerto = 58800 + Math.floor(Math.random() * 380);
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
      archivo(copia, true);
      if (f === 'supabase.sql') sql("update public.config_privada set valor = '" + CLAVE + "' where clave = 'clave_sync'");
    });
    assert.notEqual(sql("select to_regclass('public.asignaciones_una_por_dia')"), '', 'no corrió base/20260922k_el_alcance_falla_cerrado.sql');
    assert.notEqual(sql("select to_regprocedure('public.ficha_de_mi_base(text)')"), '', 'no corrió base/20260915_ficha_y_calendario.sql');
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

  test('1 · WILLIAN → quitar → WILLIAN el mismo día, y el otro computador de Joan (armado con «⬇ Traer») publica: Willian lo sigue viendo', async () => {
    const A = crmDeJoan({ socios: [cliente('C1', 'Joan Ruiz', '3103606348')] });
    assert.equal(await asignar(A, 'cliente', 'C1', 'g1', 'ficha'), 'publicado');
    assert.equal(await quitar(A, 'cliente', 'C1'), 'publicado');
    assert.equal(await asignar(A, 'cliente', 'C1', 'g1', 'ficha'), 'publicado');
    assert.ok(ids(WILLIAN).includes('C1'), 'precondición: Willian lo ve');

    /* El otro computador: la lista sube como ajuste (armarLote) y baja con
       «⬇ Traer» (aplicarPaquete(null, paquete), traer.html). */
    const lista = aca(A.ev('asignaciones()'));
    const lote = NUBE.armarLote({ socios: [], prestamos: [], asignaciones: lista }, NUBE.espejoVacio(), { claves: ['asignaciones'], marcarBorrados: false });
    const traida = aca(NUBE.aplicarPaquete(null, NUBE.paqueteDeLote(lote)).db.asignaciones);
    assert.equal(traida.length, 3, '«⬇ Traer» perdió una fila: ' + JSON.stringify(traida));
    const B = crmDeJoan({ socios: [cliente('C1', 'Joan Ruiz', '3103606348')], asignaciones: traida });
    const r = await B.ev('publicarEquipoSolo({ porCambio: true })');
    assert.equal(r, 'publicado', 'el otro computador no publicó: ' + r);
    assert.ok(ids(WILLIAN).includes('C1'), 'el otro computador de Joan le quitó el cliente a Willian');
  });

  test('2 · con la fila del día que dejó la versión de antes (id de la segunda), asignar a Willian se publica y le llega', async () => {
    /* Así quedó la nube con f05f485: la primera del día (a SIN CEL) no viajó,
       la segunda (a WILLIAN) sí, con su propio id. */
    publicar({ p_asignaciones: [{ id: 'A200-0', persona_id: 'C2', asesor: WILLIAN, desde: HOY }],
      p_gente: [{ id: 'C2', tipo: 'cliente', celular: '3105550002', nombre: 'Rosa Vieja' }] });
    assert.ok(ids(WILLIAN).includes('C2'), 'precondición: Willian ve a Rosa');
    const P = crmDeJoan({
      socios: [cliente('C9', 'Pedro Nuevo', '3105550009'), cliente('C2', 'Rosa Vieja', '3105550002')],
      equipo: EQUIPO.concat([{ id: 'x1', nombre: 'SIN CEL', rol: 'asesor', estado: 'activo', celular: '' }]),
      asignaciones: [{ id: 'A100-0', socio_id: 'C2', asesor_id: 'x1', desde: HOY },
                     { id: 'A200-0', socio_id: 'C2', asesor_id: 'g1', desde: HOY }]
    });
    const r = await asignar(P, 'cliente', 'C9', 'g1', 'ficha');
    assert.equal(r, 'publicado', 'la publicación chocó: ' + ultimo(P));
    assert.ok(ids(WILLIAN).includes('C9'), 'Willian no recibió la asignación nueva');
    assert.ok(ids(WILLIAN).includes('C2'), 'Willian perdió a Rosa');
    assert.equal(sql("select count(*) from public.asignaciones where persona_id = 'C2'"), '1');
  });

  test('3 · el cuadro dice que ve su cédula, su dirección, sus cuentas y sus fotos, y ficha_de_mi_base se las da', async () => {
    sql("insert into public.registros (codigo, cedula, nombre, telefono, datos) values ('TG-C7', '79111222', 'Ana Registrada', '3105550007'," +
      " '{\"direccion\":\"Cra 7 # 45-10\",\"nequi\":\"3105550007\"}'::jsonb)");
    sql("insert into public.registro_archivos (celular, tipo, imagen) values ('3105550007', 'cedula_frente', 'data:image/jpeg;base64,QQ=='), ('3105550007', 'selfie', 'data:image/jpeg;base64,Qw==')");
    const P = crmDeJoan({ socios: [cliente('C7', 'Ana Registrada', '3105550007')] });
    P.ev("asignarUno('cliente','C7')");
    const dice = P.elems.mBody.innerHTML;
    assert.doesNotMatch(dice, /Nunca la cédula/);
    assert.match(dice, /en «🪪 Ver su ficha» ve también lo que dejó al registrarse: su cédula, su dirección, sus cuentas y sus fotos/);
    assert.equal(await asignar(P, 'cliente', 'C7', 'g1'), 'publicado');
    const f = jsonComo(WILLIAN, "public.ficha_de_mi_base('C7')");
    assert.equal(f.ok, true, JSON.stringify(f));
    assert.equal(f.registrado, true);
    assert.equal(f.cedula, '79111222', 'la ficha no trae la cédula que el cuadro dice');
    assert.match(JSON.stringify(f.datos), /Cra 7/, 'la ficha no trae la dirección');
    assert.ok(f.fotos && f.fotos.selfie && f.fotos.cedula_frente, 'la ficha no trae las fotos');
  });

  test('4 · quitárselo el día que ya ganó con él: lo de hoy sigue en su libro, y en su «Mi base» deja de salir YA', async () => {
    const P = crmDeJoan({
      socios: [cliente('C5', 'Pedro Pago', '3105550005')],
      prestamos: [{ id: 'K5', numero: 1, socioId: 'C5', socioNombre: 'Pedro Pago', telefono: '3105550005',
        capital: 300000, costoPct: 20, fechaDesembolso: dias(-10), cicloActual: HOY, cicloPago: HOY,
        comprobantes: [], pagado: true, fechaPagado: HOY, prorrogas: [], abonosCapital: [] }],
      asignaciones: [{ id: 'A5', socio_id: 'C5', asesor_id: 'g1', desde: dias(-13) }]
    });
    assert.equal(await P.ev('publicarEquipoSolo({ porCambio: true })'), 'publicado');
    assert.ok(ids(WILLIAN).includes('C5'), 'precondición: Willian lo ve');
    const pagoDeHoy = () => aca(P.ev("movimientosDeComision().filter(m => m.socio_id === 'C5' && m.tipo === 'pago').map(m => m.asesor_id + '@' + m.fecha)"));
    assert.deepEqual(pagoDeHoy(), ['g1@' + HOY]);

    assert.equal(await quitar(P, 'cliente', 'C5'), 'publicado');
    assert.deepEqual(pagoDeHoy(), ['g1@' + HOY], 'quitárselo le borró los 10.000 que ganó hoy');
    assert.ok(!ids(WILLIAN).includes('C5'), 'el cuadro dice que deja de salir en su «Mi base», y sigue saliendo');
    assert.equal(sql("select asesor || '@' || desde from public.asignaciones where persona_id = 'C5' order by desde desc limit 1"), '@' + MANANA);

    /* Y pasárselo a OTRO esa misma tarde: OTRO lo ve ya; lo de hoy, de Willian. */
    assert.equal(await asignar(P, 'cliente', 'C5', 'g2'), 'publicado');
    assert.ok(ids(OTRO).includes('C5'), 'OTRO no lo ve');
    assert.ok(!ids(WILLIAN).includes('C5'));
    assert.deepEqual(pagoDeHoy(), ['g1@' + HOY]);
  });
});
