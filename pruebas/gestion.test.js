/* ============================================================================
 * LA GESTIÓN — 10 de septiembre de 2026
 *
 *   cd pruebas && node --test
 *
 * Joan: «que pueda tipificarlos para ver si contestan o si hay alguna novedad»
 * y «que el gerente pueda ver qué gestión le hace el asesor a cada uno de los
 * clientes potenciales o prospectos».
 *
 * LO QUE ESTE ARCHIVO CUIDA, y por qué cada cosa:
 *
 *  1. QUE EL MAPA ESTÉ ESCRITO UNA VEZ. «Gestión → estado del prospecto» vive
 *     en dos lados por necesidad: el asesor anota contra la nube (plpgsql) y
 *     Joan las trae a su computador (JavaScript). Los dos tienen que llegar al
 *     mismo estado, o el chip diría una cosa en el celular del asesor y otra en
 *     el computador de Joan, sin que ninguno de los dos pueda saber cuál miente.
 *
 *  2. QUE LA REJA ESTÉ EN EL SERVIDOR. gestion_anotar no puede recibir por
 *     parámetro el celular de quien firma: si lo recibiera, cualquiera podría
 *     firmar una gestión con el nombre de otro desde la consola del navegador,
 *     y el gerente estaría leyendo una llamada que nadie hizo. Un registro
 *     falso con apariencia de verdadero es peor que no tener registro.
 *
 *  3. QUE UNA GESTIÓN NO SE PIERDA. Publicar sobrescribe el estado de cada
 *     prospecto con el que hay en el computador de Joan. Si publica sin traer
 *     lo que anotaron sus asesores, el trabajo de una mañana se borra sin un
 *     error y sin un aviso.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260910_equipo_en_la_nube.sql');

describe('la gestión: lo que el asesor anota y el gerente lee', () => {

  test('EL MAPA «GESTIÓN → ESTADO» DICE LO MISMO EN EL SQL Y EN EL CRM', () => {
    /* El del CRM, leído de la constante. */
    const m = CRM.match(/const ESTADO_DE_GESTION = \{([\s\S]*?)\};/);
    assert.ok(m, 'no encontré ESTADO_DE_GESTION en crm.html');
    const js = {};
    [...m[1].matchAll(/(\w+)\s*:\s*'([\w]+)'/g)].forEach(x => { js[x[1]] = x[2]; });
    assert.ok(Object.keys(js).length >= 5, 'el mapa del CRM salió casi vacío: ' + JSON.stringify(js));

    /* El del SQL, leído del `case` de gestion_anotar. */
    const cuerpo = SQL.slice(SQL.indexOf('function public.gestion_anotar'));
    const c = cuerpo.match(/nuevo := case p_tipo([\s\S]*?)end;/);
    assert.ok(c, 'no encontré el case de gestion_anotar');
    const sql = {};
    [...c[1].matchAll(/when '(\w+)'\s*then\s*'(\w+)'/g)].forEach(x => { sql[x[1]] = x[2]; });

    assert.deepEqual(sql, js,
      'el SQL y el CRM no dejan al prospecto en el mismo estado.\n' +
      'nube: ' + JSON.stringify(sql) + '\nCRM:  ' + JSON.stringify(js));
  });

  test('cada estado al que lleva una gestión EXISTE en ESTADOS_PROSPECTO', () => {
    /* Si el mapa manda a un estado que la tabla de chips no conoce, el chip
       sale vacío y Joan ve una fila sin nada donde debería decir qué pasó. */
    const m = CRM.match(/const ESTADO_DE_GESTION = \{([\s\S]*?)\};/);
    const destinos = [...m[1].matchAll(/:\s*'([\w]+)'/g)].map(x => x[1]);
    const t = CRM.match(/const ESTADOS_PROSPECTO = \{([\s\S]*?)\n\};/);
    assert.ok(t, 'no encontré ESTADOS_PROSPECTO');
    const conocidos = [...t[1].matchAll(/^\s*(\w+):/gm)].map(x => x[1]);
    destinos.forEach(d => assert.ok(conocidos.indexOf(d) >= 0,
      'una gestión deja al prospecto en «' + d + '», que ESTADOS_PROSPECTO no conoce: ' +
      'el chip saldría en blanco'));
  });

  test('cada tipo del CRM lo entiende el SQL, y al revés', () => {
    const tipos = [...CRM.matchAll(/^\s{2}(\w+):\s*\{ et: '[^']*',\s*ic:/gm)].map(x => x[1]);
    assert.ok(tipos.length === 9, 'esperaba nueve tipos de gestión, encontré ' + tipos.length);
    /* Los que cambian el estado tienen que estar en el case del SQL; los de
       cobranza (promesa, ya_pago, novedad) a propósito NO. */
    const cuerpo = SQL.slice(SQL.indexOf('function public.gestion_anotar'));
    const enSQL = [...cuerpo.matchAll(/when '(\w+)'\s*then\s*'\w+'/g)].map(x => x[1]);
    enSQL.forEach(t => assert.ok(tipos.indexOf(t) >= 0,
      'el SQL trata el tipo «' + t + '», que el CRM no ofrece: nadie lo puede mandar'));
  });

  test('LA REJA ESTÁ EN EL SERVIDOR: gestion_anotar no recibe quién firma', () => {
    const firma = SQL.match(/create or replace function public\.gestion_anotar\(([\s\S]*?)\)/);
    assert.ok(firma, 'no encontré gestion_anotar');
    assert.ok(!/celular|asesor|p_quien/.test(firma[1]),
      'gestion_anotar recibe quién firma por parámetro (' + firma[1].trim() + '): ' +
      'cualquiera podría anotar en nombre de otro desde la consola del navegador');
    const cuerpo = SQL.slice(SQL.indexOf('function public.gestion_anotar'));
    assert.match(cuerpo.slice(0, 2000), /celular_de_sesion/,
      'gestion_anotar no saca de la sesión quién firma');
    assert.match(cuerpo.slice(0, 2500), /mi_alcance/,
      'gestion_anotar no comprueba que la persona sea de la base de quien anota');
  });

  test('mi_alcance no queda al alcance de un navegador', () => {
    /* Recibe un celular y contesta a quién ve esa persona: concedida a
       `authenticated`, sería un mapa del organigrama para cualquier asesor. */
    assert.match(SQL, /revoke all on function public\.mi_alcance\(text\) from public, anon, authenticated;/);
    assert.ok(!/grant\s+execute on function public\.mi_alcance/.test(SQL),
      'mi_alcance quedó concedida a alguien');
  });

  test('gestiones_listar pide la clave de Joan, como todo lo suyo', () => {
    const cuerpo = SQL.slice(SQL.indexOf('function public.gestiones_listar'));
    assert.match(cuerpo.slice(0, 900), /clave_ok\(p_clave\)/,
      'gestiones_listar no pide la clave: la llave pública leería lo que escriben los asesores');
  });

  test('PUBLICAR TRAE LAS GESTIONES ANTES, o el trabajo del asesor se borra', () => {
    /* equipo_publicar sobrescribe prospectos.estado con el del computador de
       Joan. Sin traer antes, veinte «no contesta» anotados desde un celular
       vuelven a «sin contactar» sin un error y sin un aviso. */
    const i = CRM.indexOf('function publicarEquipo(');
    assert.ok(i > 0, 'no encontré publicarEquipo');
    const cuerpo = CRM.slice(i, CRM.indexOf('function publicarEquipoAhora'));
    assert.match(cuerpo, /traerGestiones\(true\)/,
      'publicarEquipo no trae las gestiones antes de publicar');
    assert.ok(cuerpo.indexOf('traerGestiones') < cuerpo.indexOf('publicarEquipoAhora('),
      'las trae después de publicar, que es igual que no traerlas');
  });

  test('y si no puede traerlas, PREGUNTA antes de publicar', () => {
    const i = CRM.indexOf('function traerGestiones(');
    const cuerpo = CRM.slice(i, i + 3500);
    assert.match(cuerpo, /se puede perder/,
      'el fallo al traer se traga en silencio: Joan publicaría encima sin saberlo');
  });

  test('un prospecto que ya se registró no vuelve atrás por una gestión vieja', () => {
    const i = CRM.indexOf('function traerGestiones(');
    const cuerpo = CRM.slice(i, i + 3500);
    assert.match(cuerpo, /p\.estado !== 'registrado' && p\.estado !== 'cliente'/,
      'una gestión de «no contesta» le quitaría el «se registró» a alguien que ya se registró');
  });

  test('gestionesDe devuelve la más reciente de primeras', () => {
    const P = abrirPanel();
    P.cargarCartera({
      socios: [], prestamos: [], config: {},
      prospectos: [{ id: 'p1', celular: '3001112233', nombre: 'Marta', estado: 'nuevo' }],
      gestiones: [
        { id: '1', persona_id: 'p1', tipo: 'no_contesta', nota: '', cuando: '2026-09-08T10:00:00Z' },
        { id: '3', persona_id: 'p1', tipo: 'contesto', nota: 'ya', cuando: '2026-09-10T10:00:00Z' },
        { id: '2', persona_id: 'p1', tipo: 'volver', nota: '', cuando: '2026-09-09T10:00:00Z' },
        { id: '9', persona_id: 'otro', tipo: 'contesto', nota: '', cuando: '2026-09-11T10:00:00Z' }
      ]
    });
    const gs = P.ev("gestionesDe('p1')");
    assert.deepEqual(gs.map(g => g.id), ['3', '2', '1'],
      'no vienen de la más reciente a la más vieja: la primera es la que se pinta');
    assert.equal(P.ev("gestionesDe('p1').length"), 3, 'se coló la gestión de otra persona');
  });

  test('la etiqueta de una gestión desconocida no rompe la pantalla', () => {
    /* Un tipo que la nube conoce y esta versión del CRM todavía no —porque el
       asesor tiene el archivo nuevo y Joan el viejo— tiene que pintarse igual. */
    const P = abrirPanel();
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    const h = P.ev("etiquetaGestion({tipo:'inventado', cuando:'2026-09-10T10:00:00Z'})");
    assert.ok(h.indexOf('inventado') >= 0, 'no pinta nada para un tipo que no conoce: ' + h);
    assert.equal(P.ev('etiquetaGestion(null)').indexOf('sin gestionar') >= 0, true);
  });

  test('haceCuanto habla en cristiano', () => {
    const P = abrirPanel();
    P.cargarCartera({ socios: [], prestamos: [], config: {} });
    const hace = ms => P.ev('haceCuanto(new Date(Date.now()-' + ms + ').toISOString())');
    assert.equal(hace(5 * 60000), 'hace 5 min');
    assert.equal(hace(3 * 3600000), 'hace 3 h');
    assert.equal(hace(24 * 3600000), 'ayer');
    assert.equal(hace(5 * 24 * 3600000), 'hace 5 días');
    assert.equal(P.ev("haceCuanto('')"), '', 'una fecha rota tiene que salir vacía, no «NaN»');
  });

  test('las gestiones viajan a la nube con los demás ajustes', () => {
    /* Si no viajaran, el celular de Joan y su computador verían cosas
       distintas, y la fusión borraría las del que subiera de segundo. */
    const N = leer('panel/nube.js');
    assert.match(N, /'actosComision', 'gestiones'\]/,
      'gestiones no está en CLAVES_AJUSTES: no sube ni baja');
    assert.match(N, /gestiones: \['id'\]/,
      'gestiones no tiene identidad declarada: al fusionar se duplican o se pisan');
  });
});
