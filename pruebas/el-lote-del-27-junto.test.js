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
  /* 23-oct-2026 — 8: la 7 y la 8 dicen que la bandeja recibe la corrección
     de las cuentas del mismo registro (sección 1b). */
  '20261022c_las_cuentas_del_registro.sql': { es: l => /^\d+\|/.test(l), n: 8, bien: l => /\|t$/.test(l) },
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

/* ======================================================================== */
/* 3 · LA POLÍTICA, CON UNA SOLA FECHA PARA LOS DOS CAMBIOS.
   rostro-selfie (la foto de la cara: los ojos, el encuadre de respaldo, lo
   que se anota sin la selfie) y cuentas-pago (dónde recibes la plata) tocaron
   legal/privacidad.html y los dos dejaron la fecha y «Lo que cambió» para
   «una sola versión». Se publican juntos el 27-oct: una fecha, una lista. */
const POLITICA = () => fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8');
const sinEtiquetas = h => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const listaDel = (P, dia) => {
  const s = (P.match(/<section id="cambios">([\s\S]*?)<\/section>/) || [])[1] || '';
  const i = s.indexOf('Lo que cambió el ' + dia + ':');
  return i < 0 ? '' : sinEtiquetas(s.slice(i, s.indexOf('</div>', i)));
};

describe('3 · La política del 27-oct: una fecha y un «Lo que cambió» para los dos cambios', () => {

  test('una sola fecha, la del día que se publica, y su lista va primero', () => {
    const P = POLITICA();
    const fechas = [...P.matchAll(/Última actualización: ([^<\n]+)/g)].map(m => m[1].trim());
    assert.deepEqual(fechas, ['27 de octubre de 2026'], 'la política no tiene UNA fecha, la del 27-oct');
    const listas = [...sinEtiquetas(P).matchAll(/Lo que cambió el (\d{1,2} de \w+ de \d{4}):/g)].map(m => m[1]);
    assert.equal(listas[0], '27 de octubre de 2026', 'lo más nuevo va primero');
    assert.equal(listas.filter(l => l === '27 de octubre de 2026').length, 1, 'hay más de una lista del 27-oct');
    assert.match(sinEtiquetas(P), /Esta versión rige desde el 27 de octubre de 2026; la anterior rigió desde el 19 de octubre de 2026/);
  });

  test('la lista nombra los dos cambios en palabras simples, y cada uno con su punto', () => {
    const l = listaDel(POLITICA(), '27 de octubre de 2026');
    assert.ok(l, 'no hay lista del 27 de octubre de 2026');
    ['Nequi', 'Daviplata', 'llave Bre-B', 'cuenta de banco', 'al menos una'].forEach(p =>
      assert.ok(l.indexOf(p) >= 0, 'la lista no nombra «' + p + '» (dónde recibes la plata)'));
    ['foto de tu cara', 'ojos', 'no se guarda ni sale de tu celular', 'seguiste sin ella'].forEach(p =>
      assert.ok(l.indexOf(p) >= 0, 'la lista no dice «' + p + '» (la foto de tu cara)'));
    assert.match(l, /punto 2/);
    assert.match(l, /punto 3/);
    /* Sin palabras de la casa: es para el cliente. */
    assert.equal(/selfie_omitida|VERSION_|rostro-en-vivo|soloAMano|Bre-B \(/.test(l), false, 'la lista habla en código');
  });

  test('los dos cambios están en el cuerpo, como los dejó cada rama', () => {
    const P = POLITICA();
    const fila = [...P.matchAll(/<tr><td>([\s\S]*?)<\/tr>/g)].map(m => sinEtiquetas(m[1]))
      .find(t => t.indexOf('Dónde recibes la plata') >= 0) || '';
    assert.match(fila, /tu Nequi, tu Daviplata, tu llave Bre-B o tu cuenta de banco/, 'se perdió la fila de cuentas-pago');
    assert.match(fila, /Enviarte el dinero y recibir tus pagos\./, 'cambió para qué se usa: eso pediría otra autorización');
    assert.match(fila, /Sí, al menos una/);
    const cara = sinEtiquetas(P.slice(P.indexOf('<h3>La foto de tu cara, que se toma sola</h3>'), P.indexOf('<h3>La ubicación de tu celular</h3>')));
    assert.match(cara, /busca tu cara y tus ojos/, 'se perdió la sección de la foto de la cara de rostro-selfie');
    assert.match(cara, /solo anotamos que seguiste sin ella y en qué caso/);
  });

  test('VERSION_AUTORIZACION NO sube (los usos son los mismos): la decide Joan, y la lista lo dice', () => {
    /* Subirla le vuelve a pedir la autorización a cada cliente de
       app/socio.html al completar su perfil. La política (punto 10) promete
       pedirla de nuevo solo «si cambia para qué usamos tus datos», y la lista
       del 27 tiene que decir que no cambió, porque es lo que la deja quieta. */
    const U = require('../app/cuenta.js');
    assert.equal(U.VERSION_AUTORIZACION, '2026-10-19');
    const socio = (fs.readFileSync(path.join(RAIZ, 'app', 'socio.html'), 'utf8').match(/var VERSION_AUTORIZACION = '([\d-]+)'/) || [])[1];
    assert.equal(socio, '2026-10-19');
    assert.match(listaDel(POLITICA(), '27 de octubre de 2026'), /Para qué usamos tus datos no cambió/);
  });
});

/* ======================================================================== */
/* 4 · LO QUE SE GUARDA PARA USAR SIN RED (ARCHIVOS de sw.js).
   Seis ramas tocaron páginas precargadas y dos trajeron módulos nuevos
   (app/bancos-colombia.js y app/cuentas-pago.js), además de los cuatro del
   lote 1. Un <script src> que no está en la precarga deja a la app instalada
   sin esa pieza la primera vez que abre sin señal; una entrada que no existe
   es basura que nadie nota. CACHE sigue en v139: nunca se publicó. */
const precarga = () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const i = sw.indexOf('const ARCHIVOS = ['), j = sw.indexOf('].map(f => BASE + f)', i);
  assert.ok(i > 0 && j > i, 'sw.js perdió su lista ARCHIVOS');
  /* Sin comentarios de bloque; los de línea solo donde empieza uno de verdad
     (después de una coma o de un espacio), no el // de una dirección. */
  const cuerpo = sw.slice(i + 'const ARCHIVOS = ['.length, j).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s,])\/\/[^\n]*/g, '$1');
  return { sw, lista: [...cuerpo.matchAll(/'([^']*)'/g)].map(m => m[1]) };
};
/* La entrada como archivo: '' es la portada; 'play/' es su index.html. */
const comoArchivo = f => f === '' ? 'index.html' : f.replace(/\/$/, '/index.html');

describe('4 · La precarga de sw.js tiene todo lo nuevo del lote, y nada que no exista', () => {

  test('CACHE es tugarantia-v139 y cada entrada de ARCHIVOS existe', () => {
    const { sw, lista } = precarga();
    assert.match(sw, /const CACHE = 'tugarantia-v139';/);
    assert.ok(lista.length > 50, 'no leí la lista entera');
    const faltan = lista.map(comoArchivo).filter(f => !fs.existsSync(path.join(RAIZ, f)));
    assert.deepEqual(faltan, [], 'la precarga pide archivos que no existen');
  });

  test('lo nuevo de las seis ramas que las páginas cargan está en la precarga', () => {
    const lista = new Set(precarga().lista);
    ['app/actualizar.js', 'app/instalar.js', 'app/escaner-captura.js', 'app/ocr-cedula.js',
     'app/bancos-colombia.js', 'app/cuentas-pago.js', 'app/rostro-en-vivo.js', 'platachat/sesion.js']
      .forEach(f => assert.ok(lista.has(f), f + ' no está en la precarga de sw.js'));
  });

  test('cada <script src> y cada hoja o manifiesto de las páginas precargadas está en la precarga', () => {
    const lista = precarga().lista.map(comoArchivo);
    const en = new Set(lista);
    const faltan = [];
    lista.filter(f => /\.html$/.test(f)).forEach(pagina => {
      const t = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
      const refs = [...t.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1])
        .concat([...t.matchAll(/<link[^>]*>/g)].map(m => m[0])
          .filter(l => /rel="(stylesheet|manifest)"/.test(l)).map(l => (l.match(/href="([^"]+)"/) || [])[1]).filter(Boolean));
      refs.filter(r => !/^(https?:|data:|\/\/)/.test(r)).forEach(r => {
        const f = path.posix.normalize(path.posix.join(path.posix.dirname(pagina), r.split(/[?#]/)[0]));
        if (!en.has(f)) faltan.push(pagina + ' → ' + f);
      });
    });
    assert.deepEqual(faltan, [], 'una página precargada carga algo que no se guarda para usar sin red');
  });

  test('las librerías pesadas que solo usa quien se registra siguen FUERA (se bajan al llegar al paso)', () => {
    /* app/lib/ocr (~10 MB), app/lib/rostro (face-api y sus modelos) y ZXing:
       precargarlas le cobraría esos datos a cada socio que abre la app. La
       página las pide al llegar al paso (rel=prefetch) y la caché las guarda
       al pasar (la rama de abajo del fetch). Ver las notas de v139. */
    const fuera = precarga().lista.filter(f => /^app\/lib\//.test(f));
    assert.deepEqual(fuera, [], 'una librería pesada entró a la precarga: cada socio la pagaría');
  });
});

/* ======================================================================== */
/* 5 · LA CUENTA A MEDIO ELEGIR Y LA RECARGA SOLA — 23-oct-2026.
   cuentas-pago puso estado nuevo («¿A dónde te consignamos?», en memoria a
   propósito: es un dato de pago) en una pantalla que la lista blanca del lote
   1 ya daba por segura. En play/ la tarjeta va: condiciones, la cuenta, la
   casilla y el botón; María elegía la cuenta, todavía sin marcar la casilla,
   y salía a la app del banco a copiar el número: Crédito seguía siendo
   momento seguro, la página se recargaba al quedar oculta y lo elegido se
   perdía sin aviso. En PlataChat igual desde Plata o Yo (la tarjeta vive en
   Chats). La casilla marcada ya frenaba; la cuenta a medio elegir es lo mismo. */
const SESION_PLAY = JSON.stringify({ access_token: 'tok-prueba', refresh_token: 'ref', user: { email: '573001112233@tugarantia.net', created_at: '2026-10-20T10:00:00Z' } });
const PROPUESTA_PLAY = { id: 7, estado: 'contrapropuesta',
  contrapropuesta: { capital: 300000, costo: 30000, total: 330000, fecha_pago: '2026-11-20', texto: 'Te proponemos', creada_en: '2026-10-23T15:00:00Z' } };

describe('5 · La cuenta a medio elegir frena la recarga sola, como la casilla marcada', () => {
  const { abrirPlay } = require('./banco-play.js');
  function playConPropuesta(sol) {
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.ev('TAB'), 'credito');
    P.ev('tarjetaContrapropuesta(' + JSON.stringify(sol || PROPUESTA_PLAY) + ')');
    return P;
  }

  test('control: la propuesta en pantalla, sin nada elegido, sigue siendo momento seguro', () => {
    const P = playConPropuesta();
    assert.ok(P.ev('!!SOL_EN_PANTALLA'));
    assert.equal(P.ev('momentoSeguroPlay()'), true);
  });

  test('play/: con su Nequi del registro elegido (la casilla sin marcar) Crédito ya no es momento seguro', () => {
    const P = playConPropuesta();
    P.ev("elegirDestino('0')");
    assert.equal(P.ev('casillaDeLaPropuestaMarcada()'), false, 'la prueba no prueba el caso: la casilla está marcada');
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'la recarga sola se llevaría la cuenta elegida');
  });

  test('play/: con «Otra cuenta → banco → Bancolombia → Ahorros → Es mía» a medias (sin el número), tampoco', () => {
    const P = playConPropuesta();
    P.ev("elegirDestino('otra'); medioDestino('banco'); escribirDestino('banco_codigo', '1-7');" +
         " escribirDestino('banco_tipo', 'Ahorros'); escribirDestino('es_mia', true);");
    assert.equal(P.ev("$('dst_numero') ? $('dst_numero').value : ''"), '', 'la prueba no prueba el caso: hay texto escrito');
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'la recarga sola se llevaría medio, banco, tipo y «Es mía»');
  });

  test('play/: aceptada la propuesta, o si Joan la cambia, lo elegido para la vieja ya no frena nada', () => {
    const P = playConPropuesta();
    P.ev("elegirDestino('0')");
    assert.equal(P.ev('momentoSeguroPlay()'), false);
    /* Joan cambia la propuesta: otra llave, se vuelve a preguntar. */
    const nueva = JSON.parse(JSON.stringify(PROPUESTA_PLAY));
    nueva.contrapropuesta.creada_en = '2026-10-23T18:00:00Z';
    P.ev('tarjetaContrapropuesta(' + JSON.stringify(nueva) + ')');
    assert.equal(P.ev('momentoSeguroPlay()'), true, 'la cuenta elegida para una propuesta vieja frenaba la recarga para siempre');
    P.ev("elegirDestino('0')");
    const aceptada = Object.assign({}, nueva, { estado: 'aceptada' });
    P.ev('tarjetaContrapropuesta(' + JSON.stringify(aceptada) + ')');
    assert.equal(P.ev('momentoSeguroPlay()'), true, 'después de aceptar, Crédito no volvía a recargar nunca');
  });

  /* PlataChat, con la solicitud como la manda la base. */
  async function mariaConPropuesta() {
    const ahora = () => new Date().toISOString();
    const sol = { id: 41, app: 'platachat', estado: 'contrapropuesta', capital: 450000, cortes: 1,
      contrapropuesta: { capital: 450000, costo: 45000, total: 495000, fecha_pago: '2026-11-15', creada_en: '2026-10-23T15:00:00Z', por: 'auto' } };
    const PC = abrirPlataChat({ resp: {
      mi_solicitud_platachat: () => ({ ok: true, solicitud: sol, ahora: ahora() }),
      mis_cuentas_de_pago: () => ({ ok: true, cuentas: { nequi: CEL_MARIA, cuentas_mias: 'si' } }) } });
    await asentar(10);
    await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
    PC.ev("CANAL = 'creditos'; irA('chats')");
    await asentar(20);
    assert.equal(PC.ev('SOL && SOL.id'), 41);
    return PC;
  }

  test('PlataChat: control: la propuesta sin nada elegido deja Plata y Yo como momento seguro', async () => {
    const PC = await mariaConPropuesta();
    PC.ev("irA('plata')");
    assert.equal(PC.ev('momentoSeguroPC()'), true);
    PC.ev("irA('yo')");
    assert.equal(PC.ev('momentoSeguroPC()'), true);
  });

  test('PlataChat: elige su Nequi (o la mitad de «Otra cuenta») y pasa a Plata o a Yo: no se recarga encima', async () => {
    const PC = await mariaConPropuesta();
    PC.ev("elegirDestinoPC('0'); irA('plata')");
    assert.equal(PC.ev('PANTALLA'), 'plata');
    assert.equal(PC.ev('momentoSeguroPC()'), false, 'desde Plata la recarga sola se llevaría la cuenta elegida');
    PC.ev("irA('yo')");
    assert.equal(PC.ev('momentoSeguroPC()'), false, 'desde Yo, igual');
    const Q = await mariaConPropuesta();
    Q.ev("elegirDestinoPC('otra'); medioDestinoPC('banco'); escribirDestinoPC('banco_codigo', '1-7'); irA('plata')");
    assert.equal(Q.ev('momentoSeguroPC()'), false, 'la otra cuenta a medias se perdería');
  });
});
