'use strict';
/* ==========================================================================
 * EL LOTE DEL 27-OCT, JUNTO — 23-oct-2026
 *
 *   node --test pruebas/el-lote-del-27-junto.test.js
 *
 * publicar-27 junta seis ramas que nacieron por separado: l1-integrado,
 * abono-pactado, nube-sola, rostro-selfie, cuentas-pago y claves-clientes.
 * Cada una pasaba sus pruebas sola. Estas cuidan lo que solo se rompe al
 * juntarlas, y que git no ve porque no es un conflicto de líneas:
 *
 *   1. «CAMBIAR MI CONTRASEÑA» DE PLATACHAT Y LA RECARGA SOLA. claves-clientes
 *      nació de main, antes del lote 1, y su pantalla no decía cuál era
 *      (PANTALLA) ni contaba el cambio como escritura en camino. Con el lote 1
 *      la página se recarga sola en un momento seguro: con la contraseña a
 *      medias, o con el cambio volando, la recarga se lo llevaba.
 *   2. LOS CUATRO SQL DEL 22-OCT, EN EL ORDEN EN QUE SE CORREN. Chocaban de
 *      nombre de dos en dos (20261022_ y 20261022b_ en rostro-selfie y en
 *      cuentas-pago), y el orden alfabético ponía el del equipo —el que deja a
 *      todos afuera hasta que Joan pone cada clave— antes que el de las
 *      cuentas. Se renombraron; esta sección exige el orden y los corre todos,
 *      en ese orden y dos veces cada uno, en un PostgreSQL nuevo con TODAS las
 *      migraciones de base/ (con TG_PG_BIN).
 *
 *   TG_PG_BIN="C:/Program Files/PostgreSQL/17/bin" node --test pruebas/el-lote-del-27-junto.test.js
 * ======================================================================== */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { abrirPlataChat, asentar, RAIZ } = require('./banco-platachat.js');

const CEL_MARIA = '3001112233', CLAVE_MARIA = 'Maria.Secreta9';

async function mariaEnPlataChat() {
  const PC = abrirPlataChat();
  await asentar(10);
  await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
  assert.match(PC.token() || '', /^tok-Maria-/, 'María no entró');
  return PC;
}

/* ======================================================================== */
describe('1 · PlataChat: «Cambiar mi contraseña» con la recarga sola del lote 1', () => {

  test('control: Yo sin nada a medias es momento seguro (la lista blanca de siempre)', async () => {
    const PC = await mariaEnPlataChat();
    PC.ev("irA('yo')");
    assert.equal(PC.ev('PANTALLA'), 'yo');
    assert.equal(PC.ev('momentoSeguroPC()'), true);
  });

  test('la pantalla dice cuál es, y con la contraseña nueva a medias no se recarga encima', async () => {
    /* Antes: PANTALLA seguía diciendo 'yo' (la pestaña de donde vino), y Yo es
       momento seguro: la versión nueva recargaba con «Maria.Nue» escrito y la
       persona volvía a Yo sin saber qué pasó con su contraseña. */
    const PC = await mariaEnPlataChat();
    PC.ev("irA('yo'); pintarCambiarClave()");
    assert.equal(PC.ev('PANTALLA'), 'clave', 'la pantalla de la contraseña no dice cuál es');
    PC.ev("$('ccNueva').value = 'Maria.Nue'");
    assert.equal(PC.ev('momentoSeguroPC()'), false, 'la recarga sola se llevaría la contraseña a medio escribir');
  });

  test('el cambio volando frena la recarga aunque toque «Plata», y al llegar ella ve «Listo»', async () => {
    /* Antes: el PUT de la contraseña no contaba como escritura en camino. Con
       el cambio en el aire, tocar «Plata» (momento seguro) dejaba recargar: la
       contraseña quedaba cambiada o no, y ella nunca veía cuál. */
    const PC = await mariaEnPlataChat();
    PC.st.colgar = /\/auth\/v1\/user$/;
    PC.ev("irA('yo'); pintarCambiarClave(); $('ccNueva').value = 'Maria.Nueva2026'; " +
          "$('ccRepite').value = 'Maria.Nueva2026'; cambiarClave();");
    await asentar(10);
    assert.equal(PC.st.colgadas.length, 1, 'el cambio no salió a /auth/v1/user');
    PC.ev("irA('plata')");
    assert.equal(PC.ev('ocupadoPC()'), true, 'el cambio de contraseña en camino no cuenta como escritura');
    assert.equal(PC.ev('momentoSeguroPC()'), false, 'la recarga sola cortaría el cambio de contraseña');
    PC.suelta(0);
    await asentar(20);
    assert.equal(PC.ev('ocupadoPC()'), false, 'el cambio terminó y la página sigue creyéndolo en camino');
    assert.match(PC.elems.cuerpo.innerHTML, /Listo: tu contraseña quedó cambiada/);
    assert.equal(PC.ev('PANTALLA'), 'clave', '«Listo» se pinta y la página cree que sigue en Plata');
    PC.ev("irA('yo')");
    assert.equal(PC.ev('momentoSeguroPC()'), true, 'control: de vuelta en Yo, sin nada en camino, sí se puede');
  });
});

/* ======================================================================== */
const DEL_22 = [
  '20261022_la_foto_que_no_entra_se_dice.sql',      // rostro-selfie: no cambió de nombre (lo nombra la función que parcha)
  '20261022b_destino_del_desembolso.sql',            // cuentas-pago: antes 20261022_destino_del_desembolso.sql
  '20261022c_las_cuentas_del_registro.sql',          // cuentas-pago: antes 20261022b_las_cuentas_del_registro.sql
  '20261022d_el_equipo_con_la_clave_de_joan.sql'     // rostro-selfie: antes 20261022b_el_equipo_con_la_clave_de_joan.sql
];
const NOMBRES_VIEJOS = ['20261022_destino_del_desembolso', '20261022b_las_cuentas_del_registro',
  '20261022b_el_equipo_con_la_clave_de_joan'];
const MIGRACION = f => /^\d{8}.*\.sql$/.test(f);

describe('2 · Los cuatro SQL del 22-oct, en el orden en que Joan los corre', () => {

  test('el orden alfabético de base/ es el orden en que se corren, y el del equipo es el último', () => {
    /* Antes: 20261022_destino, 20261022_la_foto, 20261022b_el_equipo,
       20261022b_las_cuentas. El del equipo caía antes que el de las cuentas, y
       los dos «b» no decían cuál iba primero. */
    const base = fs.readdirSync(path.join(RAIZ, 'base')).filter(MIGRACION).sort();
    assert.deepEqual(base.filter(f => /^20261022/.test(f)), DEL_22,
      'los SQL del 22-oct no están en el orden en que se corren (la_foto, destino, cuentas, equipo)');
    assert.equal(base[base.length - 1], DEL_22[3],
      'hay una migración después de la del equipo: la del equipo deja a todos afuera y va al final');
  });

  test('nadie nombra los SQL por su nombre viejo (salvo para decir cómo se llamaban)', () => {
    const CARPETAS = ['app', 'base', 'panel', 'play', 'platachat', 'pruebas', 'legal', 'entrar', 'descargas', 'herramientas', 'android'];
    const TEXTO = /\.(js|html|md|sql|json|css|txt|ps1|yml)$/;
    const archivos = fs.readdirSync(RAIZ).filter(f => TEXTO.test(f));
    const recorrer = d => {
      if (!fs.existsSync(path.join(RAIZ, d))) return;
      fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true }).forEach(e => {
        const rel = d + '/' + e.name;
        if (e.isDirectory()) { if (rel !== 'app/lib') recorrer(rel); return; }
        if (TEXTO.test(e.name) && rel !== 'pruebas/el-lote-del-27-junto.test.js') archivos.push(rel);
      });
    };
    CARPETAS.forEach(recorrer);
    const viejos = [];
    archivos.forEach(f => fs.readFileSync(path.join(RAIZ, f), 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (NOMBRES_VIEJOS.some(v => l.indexOf(v) >= 0) && !/se llamaba/i.test(l)) viejos.push(f + ':' + (i + 1) + ': ' + l.trim());
    }));
    assert.deepEqual(viejos, [], 'todavía se nombran por su nombre viejo:\n' + viejos.join('\n'));
  });

  test('cada uno dice en su cabecera dónde va entre los cuatro', () => {
    DEL_22.forEach((f, i) => {
      const cabecera = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').split(/\r?\n/).slice(0, 40).join('\n');
      DEL_22.filter(o => o !== f).forEach(o =>
        assert.ok(cabecera.indexOf(o.slice(0, 13)) >= 0,
          f + ' no nombra a ' + o + ' en su cabecera: Joan corre el archivo leyendo solo eso'));
      if (i === DEL_22.length - 1) assert.match(cabecera, /ÚLTIMO/, 'la del equipo no dice que va al final');
    });
  });
});

/* Las tablas del final de cada uno: qué renglones mirar y cuántos son. */
const TABLA_FINAL = {
  '20261022_la_foto_que_no_entra_se_dice.sql': { es: l => /\|[tf]$/.test(l), n: 6, bien: l => /\|t$/.test(l) },
  '20261022b_destino_del_desembolso.sql': { es: l => /^\d+\|/.test(l), n: 10, bien: l => /\|t$/.test(l) },
  '20261022c_las_cuentas_del_registro.sql': { es: l => /^\d+\|/.test(l), n: 6, bien: l => /\|t$/.test(l) },
  /* El del equipo: 1-4 son comprobaciones; de 11 en adelante, una fila por
     persona activa del equipo (en esta base no hay nadie). */
  '20261022d_el_equipo_con_la_clave_de_joan.sql': { es: l => /^[1-4]\|/.test(l), n: 4, bien: l => /^\d+\|[^|]*\|t\|/.test(l) }
};
/* Lo que el editor de Supabase le muestra a Joan: el SELECT del final, solo. */
const soloLaTabla = t => {
  const i = Math.max(t.lastIndexOf('¿QUEDÓ?'), t.lastIndexOf('LO QUE JOAN VE'));
  return t.slice(t.lastIndexOf('\n', i) + 1);
};

const BIN = process.env.TG_PG_BIN || '';
const exe = n => path.join(BIN, process.platform === 'win32' ? n + '.exe' : n);

describe('2b · Todas las migraciones de base/, en orden, en un PostgreSQL nuevo', { skip: !BIN && 'sin TG_PG_BIN no hay PostgreSQL a mano' }, () => {
  let dir, puerto, n = 0;
  const corridas = {};           // archivo del 22-oct → [vez 1, vez 2]
  const fallaronViejas = [];     // las de antes que no corren en una base nueva (dependen de Supabase de verdad)
  const psql = (args, db) => spawnSync(exe('psql'),
    ['-h', 'localhost', '-p', String(puerto), '-U', 'postgres', '-d', db || 'tg', '-At', '-v', 'ON_ERROR_STOP=1'].concat(args),
    { encoding: 'utf8', env: Object.assign({}, process.env, { PGCLIENTENCODING: 'UTF8' }) });
  const sql = (consulta, db) => {
    const f = path.join(dir, 'q' + (++n) + '.sql');
    fs.writeFileSync(f, consulta, 'utf8');
    const r = psql(['-f', f], db);
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };

  before(() => {
    const STUB = fs.readFileSync(path.join(__dirname, 'una-puerta-postgres.test.js'), 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pg-lote-27-'));
    puerto = 56800 + Math.floor(Math.random() * 380);
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'datos'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-o', '-p ' + puerto + ' -c listen_addresses=localhost -c shared_buffers=32MB',
      '-l', path.join(dir, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
    sql("create database tg template template0 encoding 'UTF8' locale_provider icu icu_locale 'es-CO' locale 'C'", 'postgres');
    fs.writeFileSync(path.join(dir, 'stub.sql'), STUB);
    psql(['-f', path.join(dir, 'stub.sql')]);
    /* Lo que Supabase trae y la réplica no (el mismo andamio de
       el-equipo-con-la-clave-de-joan-postgres). */
    sql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
         grant usage on schema public to service_role;
         alter default privileges in schema public grant execute on functions to service_role;
         alter table auth.users add column if not exists banned_until timestamptz;
         alter table auth.users add column if not exists email_confirmed_at timestamptz;`);
    /* TODAS, en el orden de sus nombres: el que Joan sigue. */
    ['supabase.sql'].concat(fs.readdirSync(path.join(RAIZ, 'base')).filter(MIGRACION).sort()).forEach(f => {
      const t = fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8').replace(/^\s*create extension if not exists pg_net[^;]*;/im, '');
      const copia = path.join(dir, f); fs.writeFileSync(copia, t);
      const del22 = DEL_22.indexOf(f) >= 0;
      for (let i = 0; i < (del22 ? 2 : 1); i++) {   // los del 22-oct, dos veces: idempotentes
        const r = psql(['-1', '-f', copia]);
        if (del22) (corridas[f] = corridas[f] || []).push(r);
        else if (r.status !== 0) fallaronViejas.push(f);
      }
      if (f === 'supabase.sql') sql("update public.config_privada set valor = 'clave-de-prueba-larga-123' where clave = 'clave_sync'");
    });
  });

  after(() => {
    try { execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'datos'), '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch (e) { /* nada */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  });

  DEL_22.forEach(f => {
    test(f + ': corre limpio dos veces, y su tabla sale toda en true las dos', () => {
      const r = corridas[f] || [];
      assert.equal(r.length, 2, f + ' no corrió dos veces');
      r.forEach((x, i) => {
        assert.equal(x.status, 0, f + ' no corrió limpio la vez ' + (i + 1) + ' (antes fallaron solas: ' +
          fallaronViejas.join(', ') + '):\n' + x.stderr);
        const filas = x.stdout.trim().split(/\r?\n/).filter(TABLA_FINAL[f].es);
        assert.equal(filas.length, TABLA_FINAL[f].n, f + ', vez ' + (i + 1) + ': la tabla no salió entera:\n' + x.stdout);
        assert.deepEqual(filas.filter(l => !TABLA_FINAL[f].bien(l)), [], f + ', vez ' + (i + 1) + ': algo salió en false');
      });
    });
  });

  test('la segunda vez la foto y el equipo dicen que ya estaban (no vuelven a parchar)', () => {
    assert.match(corridas[DEL_22[0]][1].stderr, /ya dice qué foto no entró: no se cambió nada/);
    assert.match(corridas[DEL_22[3]][0].stderr, /Cambiadas \d+ funciones del equipo/);
    assert.match(corridas[DEL_22[3]][1].stderr, /ya deciden quién eres con la clave de Joan: no se cambió nada/);
  });

  test('al final, con los cuatro puestos, las cuatro tablas siguen en true (ninguno le deshizo nada a otro)', () => {
    DEL_22.forEach(f => {
      const filas = sql(soloLaTabla(fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8'))).split(/\r?\n/).filter(TABLA_FINAL[f].es);
      assert.equal(filas.length, TABLA_FINAL[f].n, f + ': la tabla no salió entera');
      assert.deepEqual(filas.filter(l => !TABLA_FINAL[f].bien(l)), [], f + ': al final algo salió en false');
    });
  });
});
