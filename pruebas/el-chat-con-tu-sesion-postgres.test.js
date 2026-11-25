/* ============================================================================
 * EL CHAT, CON LA SESIÓN DEL DUEÑO, CONTRA UN POSTGRESQL DE VERDAD — 25-nov-2026
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/el-chat-con-tu-sesion-postgres.test.js
 *
 * base/20261125b_el_chat_con_tu_sesion.sql crea once gemelas `panel_…` de las
 * funciones del chat de Joan: preguntan panel_es_dueno() y llaman a la función
 * de siempre con la clave que la base ya guarda. No copian ningún cuerpo.
 * Sin TG_PG_BIN la parte de PostgreSQL se salta; la que lee el archivo corre
 * siempre. Con él: todas las migraciones de base/ en orden, el archivo DOS
 * veces, y se LLAMAN las gemelas como las va a llamar el celular:
 *   · sin sesión, con sesión de otro y con la llave pública: no, ninguna;
 *   · con la sesión del dueño contestan LO MISMO que la función de siempre con
 *     la clave: la lista, el hilo (que queda «visto»), responder, el equipo;
 *   · la prueba que trae el archivo no manda mensajes ni marca nada leído;
 *   · borrar una conversación entera no quedó abierta por esta puerta.
 * Los nombres, celulares y cédulas son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const CS = require('../panel/chat-de-sesion.js');

const BIN = process.env.TG_PG_BIN || '';
const RAIZ = path.join(__dirname, '..');
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);
const NOMBRE = '20261125b_el_chat_con_tu_sesion.sql';
const SQL = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const sinComentarios = t => t.replace(/--[^\n]*/g, '');
const CLAVE = "'clave-de-prueba-larga-123'";
const DUENO = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';

describe('el archivo de la migración', () => {
  const t = sinComentarios(SQL);
  const creadas = [...t.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi)].map(m => m[1]);

  test('crea once funciones nuevas, las mismas que pide el celular, y no toca nada de lo que ya vive', () => {
    assert.equal(creadas.length, 11);
    assert.deepEqual(creadas.slice().sort(), Object.values(CS.GEMELAS).sort(), 'el SQL y panel/chat-de-sesion.js no nombran las mismas gemelas');
    creadas.forEach(f => assert.match(f, /^panel_/, f + ' no es una función nueva de panel_'));
    assert.equal(/\b(alter\s+table|drop\s+function|create\s+table\s+(if\s+not\s+exists\s+)?public\.|update\s+public\.|delete\s+from|insert\s+into\s+public\.)/i.test(t), false,
      'el archivo cambia algo más que sus funciones');
    assert.equal(CS.SQL, NOMBRE, 'el celular nombra otro archivo cuando falta');
  });

  test('cada gemela pregunta por el dueño ANTES que nada y llama a la de siempre con la clave de la base, sin copiar su cuerpo', () => {
    Object.entries(CS.GEMELAS).forEach(([deSiempre, gemela]) => {
      const i = t.indexOf('create or replace function public.' + gemela + '(');
      assert.ok(i >= 0, 'falta ' + gemela);
      const cabeza = t.slice(i, t.indexOf('as $$', i));
      assert.match(cabeza, /security definer/, gemela);
      assert.match(cabeza, /set search_path = public/, gemela);
      assert.equal(/p_clave/.test(cabeza), false, gemela + ' pide una clave: el celular no la tiene');
      const cuerpo = t.slice(t.indexOf('as $$', i) + 5, t.indexOf('$$;', t.indexOf('as $$', i))).trim();
      const lineas = cuerpo.split('\n').map(l => l.trim()).filter(Boolean);
      assert.equal(lineas[0], 'begin');
      assert.equal(lineas[1], "if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;", gemela + ': algo corre antes de preguntar quién es');
      assert.match(cuerpo, new RegExp('return public\\.' + deSiempre + "\\(\\(select valor from public\\.config_privada where clave = 'clave_sync'\\)"), gemela + ' no llama a ' + deSiempre + ' con la clave de la base');
      assert.ok(lineas.length <= 5, gemela + ' hace algo más que preguntar y llamar: ' + lineas.length + ' líneas');
    });
  });

  test('la clave no sale de la base: ninguna función la devuelve, y borrar la conversación no tiene gemela', () => {
    assert.equal(/returns\s+text/i.test(t), false, 'una función devuelve texto: podría ser la clave');
    assert.equal(/return\s+\(?\s*select\s+valor/i.test(t), false, 'una función devuelve la clave');
    assert.equal(/chat_olvidar\s*\(/.test(t.replace(/to_regprocedure\('public\.panel_chat_olvidar\(text\)'\)/g, '')), false, 'borrar una conversación quedó abierta por la sesión');
    assert.equal('chat_olvidar' in CS.GEMELAS, false);
  });

  test('se para en su paso 0 si falta algo, pregunta por la FIRMA exacta de cada función de siempre, y solo se abre con sesión', () => {
    const paso0 = t.slice(0, t.indexOf('end $$;') + 7);
    assert.match(paso0, /to_regprocedure\('public\.celular_del_equipo_de_sesion\(\)'\) is null[\s\S]*?raise exception/);
    assert.match(paso0, /to_regprocedure\('public\.panel_es_dueno\(\)'\) is null[\s\S]*?raise exception/);
    Object.keys(CS.GEMELAS).forEach(f => assert.match(paso0, new RegExp("'public\\." + f + "\\(text[a-z,]*\\)'"), 'el paso 0 no pregunta por ' + f));
    assert.ok(t.indexOf('do $$') < t.search(/create (temporary table|or replace function)/));
    assert.equal((t.match(/revoke all on function public\.panel_\w+\([^)]*\)\s+from public, anon, authenticated;/g) || []).length, 11);
    assert.equal((t.match(/grant execute on function public\.panel_\w+\([^)]*\)\s+to authenticated;/g) || []).length, 11);
    assert.equal(/grant[^;]*\banon\b/.test(t), false, 'algo quedó abierto a la llave pública');
    assert.match(t, /notify pgrst, 'reload schema';/);
  });
});

describe('las gemelas del chat en un PostgreSQL de verdad', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const entorno = Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' });
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    return execFileSync(exe('psql'),
      ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1', '-f', f],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: entorno }).trim();
  };
  const archivo = (f, una) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', 'tg', '-At', '-v', 'ON_ERROR_STOP=1'].concat(una ? ['-1'] : []).concat(['-f', f]),
    { encoding: 'utf8', env: entorno });
  /* Como la llama el celular: con el papel `authenticated` y el `sub` de la sesión. */
  const como = (uid, q, papel) => sql(
    "select set_config('request.jwt.claims', '" + (uid ? '{"sub":"' + uid + '","role":"authenticated"}' : '') + "', false);" +
    'set role ' + (papel || 'authenticated') + '; select (' + q + ')::text').split('\n').pop();
  const dueno = q => como(DUENO, q);
  const conClave = q => sql('select (' + q + ')::text');
  const fallo = f => { try { f(); return ''; } catch (e) { return String(e.stderr || e.message); } };
  const filasDeLaTabla = r => r.stdout.trim().split(/\r?\n/).filter(l => /\|(bien|FALLA|no corrió)/.test(l));
  const cuenta = () => sql("select (select count(*) from public.mensajes) || '/' || (select count(*) from public.mensajes where visto) || '/' || (select count(*) from public.mensajes_equipo)");
  const LLAMADAS = [
    'public.panel_chat_conversaciones()', "public.panel_chat_de('52000111', 0, null)", "public.panel_chat_responder('52000111', 'hola', null)",
    "public.panel_chat_hilo_de_celular('3991110009')", 'public.panel_chat_foto_panel(1)', "public.panel_chat_foto_responder('52000111', 'x', null, null, null)",
    'public.panel_equipo_chat_conversaciones()', "public.panel_equipo_chat_de('3106667788', 0)", "public.panel_equipo_chat_responder('3106667788', 'hola')",
    'public.panel_equipo_foto_panel(1)', "public.panel_equipo_foto_responder('3106667788', 'x', null, null)"];

  before(() => {
    const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-chat-ses-'));
    puerto = 56880 + Math.floor(Math.random() * 300);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost -c shared_buffers=32MB',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    archivo(path.join(dir, 'stub.sql'));
    const migs = ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /^\d{8}.*\.sql$/.test(f) && f !== NOMBRE).sort());
    migs.forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      archivo(copia, true);   // las que dependen de Supabase de verdad fallan solas
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
    /* Una conversación de cliente y una persona del equipo, para que haya qué leer. */
    sql("insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en) values ('52000111', '3991110001', '0001', 'Ana Con Ficha', '{}', now());" +
        "insert into public.mensajes (cedula, de, texto, canal) values ('52000111', 'socio', 'Hola, ¿me ayudan?', 'servicio'), ('3991110009', 'socio', 'Pedí 300.000', 'creditos');" +
        "insert into public.equipo (celular, nombre, rol, estado) values ('3106667788', 'Gerente De Mentira', 'gerente', 'activo');");
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  test('corre limpia en una base SIN dueño todavía: la prueba con sesión no corre, y lo dice', () => {
    assert.equal(sql('select count(*) from public.panel_duenos'), '0');
    const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
    assert.equal(r.status, 0, 'la migración no corrió limpia: ' + r.stderr);
    assert.doesNotMatch(r.stderr, /FALLA/, r.stderr);
    assert.match(r.stderr, /Todavía no hay ningún dueño en panel_duenos/);
    const filas = filasDeLaTabla(r);
    assert.equal(filas.length, 7, 'la tabla final no salió entera: ' + r.stdout);
    assert.equal(filas.filter(l => /\|bien$/.test(l)).length, 5, r.stdout);
    assert.equal(sql('select count(*) from public.panel_duenos'), '0', 'la migración dejó un dueño de mentira');
  });

  test('con un dueño, DOS veces más: todo en «bien», y la prueba del archivo no manda mensajes ni marca nada leído', () => {
    sql("insert into auth.users (id, email) values ('" + DUENO + "', 'duena@prueba.test'), ('" + OTRO + "', 'otro@prueba.test');" +
        "insert into public.panel_duenos (uid, nota) values ('" + DUENO + "', 'de prueba');");
    const antes = cuenta();
    [1, 2].forEach(i => {
      const r = archivo(path.join(RAIZ, 'base', NOMBRE), true);
      assert.equal(r.status, 0, 'la migración no corrió limpia la vez ' + i + ': ' + r.stderr);
      assert.doesNotMatch(r.stderr, /FALLA/, r.stderr);
      const filas = filasDeLaTabla(r);
      assert.equal(filas.length, 7, 'la tabla final no salió entera: ' + r.stdout);
      filas.forEach(l => assert.match(l, /\|bien$/, 'una comprobación no salió bien: ' + l));
    });
    assert.equal(cuenta(), antes, 'correr el archivo mandó un mensaje o marcó algo como leído (mensajes/vistos/equipo)');
  });

  test('sin sesión, con la sesión de otro y con la llave pública: ninguna de las once contesta', () => {
    const antes = cuenta();
    LLAMADAS.forEach(q => {
      assert.match(fallo(() => como('', q)), /no autorizado/, q + ' contestó sin sesión');
      assert.match(fallo(() => como(OTRO, q)), /no autorizado/, q + ' le contestó a quien no es dueño');
      assert.match(fallo(() => como(DUENO, q, 'anon')), /permission denied|permiso denegado/i, q + ' se dejó llamar con la llave pública');
    });
    assert.equal(cuenta(), antes, 'un intento negado dejó rastro');
    assert.equal(sql("select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^panel_(chat|equipo_chat|equipo_foto)_' and has_function_privilege('anon', p.oid, 'execute')"), '0');
  });

  test('la lista de conversaciones es LA MISMA que da la función de siempre con la clave', () => {
    const deSiempre = JSON.parse(conClave('public.chat_conversaciones(' + CLAVE + ')'));
    const gemela = JSON.parse(dueno('public.panel_chat_conversaciones()'));
    assert.deepEqual(gemela, deSiempre);
    assert.ok(JSON.stringify(gemela).includes('Hola, ¿me ayudan?') || JSON.stringify(gemela).includes('52000111'), 'la lista no trae la conversación sembrada: ' + JSON.stringify(gemela).slice(0, 200));
    assert.deepEqual(JSON.parse(dueno('public.panel_equipo_chat_conversaciones()')), JSON.parse(conClave('public.equipo_chat_conversaciones(' + CLAVE + ')')));
    assert.deepEqual(JSON.parse(dueno("public.panel_chat_hilo_de_celular('3991110009')")), JSON.parse(conClave('public.chat_hilo_de_celular(' + CLAVE + ", '3991110009')")));
  });

  test('leer el hilo trae sus mensajes y los deja «vistos», igual que desde el computador', () => {
    assert.equal(sql("select count(*) from public.mensajes where cedula = '52000111' and de = 'socio' and visto"), '0', 'precondición: nadie lo ha leído');
    const hilo = JSON.parse(dueno("public.panel_chat_de('52000111', 0, null)"));
    assert.ok(JSON.stringify(hilo).includes('Hola, ¿me ayudan?'), 'el hilo no trae el mensaje del cliente: ' + JSON.stringify(hilo).slice(0, 200));
    assert.equal(sql("select count(*) from public.mensajes where cedula = '52000111' and de = 'socio' and visto"), '1', 'leerlo desde el celular no lo dejó «visto»');
    /* Y lo que devuelve tiene la misma forma que la de siempre (ya leído, las dos dicen lo mismo). */
    assert.deepEqual(JSON.parse(dueno("public.panel_chat_de('52000111', 0, null)")), JSON.parse(conClave('public.chat_de(' + CLAVE + ", '52000111', 0, null)")));
  });

  test('responder desde el celular queda en el hilo como lo que dice la casa, en el canal del último mensaje del cliente', () => {
    const id = Number(dueno("public.panel_chat_responder('52000111', 'Hola Ana, ya te miro', null)"));
    assert.ok(id > 0, 'no devolvió el id del mensaje');
    const m = JSON.parse(sql('select to_jsonb(x)::text from public.mensajes x where x.id = ' + id));
    assert.equal(m.cedula, '52000111'); assert.equal(m.de, 'panel'); assert.equal(m.texto, 'Hola Ana, ya te miro'); assert.equal(m.canal, 'servicio');
    /* Lo que la de siempre no acepta, la gemela tampoco (un texto vacío no se guarda). */
    const antes = cuenta();
    const vacio = dueno("public.panel_chat_responder('52000111', '   ', null)");
    assert.equal(cuenta(), antes, 'un mensaje vacío quedó guardado: «' + vacio + '»');
  });

  test('el equipo: escribirle a alguien del equipo y leer su hilo, por la misma puerta', () => {
    const r = JSON.parse(dueno("public.panel_equipo_chat_responder('3106667788', 'Buen día, ¿cómo van los cobros?')"));
    assert.equal(r.ok, true, JSON.stringify(r));
    const hilo = dueno("public.panel_equipo_chat_de('3106667788', 0)");
    assert.ok(hilo.includes('¿cómo van los cobros?'), hilo.slice(0, 200));
    assert.deepEqual(JSON.parse(hilo), JSON.parse(conClave('public.equipo_chat_de(' + CLAVE + ", '3106667788', 0)")));
    /* A quien no es del equipo, lo mismo que dice la de siempre. */
    assert.deepEqual(JSON.parse(dueno("public.panel_equipo_chat_responder('3001234567', 'hola')")), JSON.parse(conClave('public.equipo_chat_responder(' + CLAVE + ", '3001234567', 'hola')")));
  });

  test('las fotos: pedir una que no existe y mandar algo que no es foto contesta lo mismo que la de siempre', () => {
    assert.deepEqual(JSON.parse(dueno('public.panel_chat_foto_panel(999999)')), JSON.parse(conClave('public.chat_foto_panel(' + CLAVE + ', 999999)')));
    assert.deepEqual(JSON.parse(dueno('public.panel_equipo_foto_panel(999999)')), JSON.parse(conClave('public.equipo_foto_panel(' + CLAVE + ', 999999)')));
    const antes = cuenta();
    assert.deepEqual(JSON.parse(dueno("public.panel_chat_foto_responder('52000111', 'esto no es una imagen', null, null, null)")),
      JSON.parse(conClave('public.chat_foto_responder(' + CLAVE + ", '52000111', 'esto no es una imagen', null, null, null)")));
    assert.deepEqual(JSON.parse(dueno("public.panel_equipo_foto_responder('3106667788', 'esto no es una imagen', null, null)")),
      JSON.parse(conClave('public.equipo_foto_responder(' + CLAVE + ", '3106667788', 'esto no es una imagen', null, null)")));
    assert.equal(cuenta(), antes, 'algo que no es una foto quedó guardado');
  });

  test('con el freno de la clave puesto (alguien tanteando), el celular recibe el mismo «no» que el computador, y nada más', () => {
    for (let i = 0; i < 12; i++) fallo(() => conClave("public.chat_conversaciones('una-clave-inventada-" + i + "')"));
    assert.match(fallo(() => conClave('public.chat_conversaciones(' + CLAVE + ')')), /clave incorrecta/, 'precondición: el freno no quedó puesto');
    assert.match(fallo(() => dueno('public.panel_chat_conversaciones()')), /clave incorrecta/);
    /* Y el celular lo dice con sus palabras, no como «arregla tu clave». */
    const dicho = CS.fallo({ estado: 400, cuerpo: { message: 'clave incorrecta' }, motivo: 'Supabase respondió 400' });
    assert.match(dicho.humano, /freno de la clave del computador/);
    assert.equal(dicho.clave, undefined, 'con `clave: true` el Panel en el bolsillo dejaría de preguntar para siempre');
    sql("select setval('public.freno_clave', 1)");   // se quita el freno para no dejar la base de la prueba trabada
    assert.ok(JSON.parse(dueno('public.panel_chat_conversaciones()')), 'sin el freno vuelve a contestar');
  });
});
