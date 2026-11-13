/* ============================================================================
 * TUS EXTRACTOS — 13 de noviembre de 2026
 *
 *   env -u TG_PG_BIN node --test pruebas/los-extractos.test.js
 *
 * Joan: «quiero validar si el cliente no es empleado que pueda subir los
 * estractos bancarios». Lo que se prueba, cada cosa con la página o el módulo
 * de verdad (los bancos de Node: banco-play, banco-socio, banco-panel):
 *   1. a quién: el paso solo sale si la ocupación NO es «Empleado», y una
 *      ocupación nueva entra sola; a quien es empleado no le cambia ni un
 *      número de paso;
 *   2. la casilla nace sin marcar, el paso explica en palabras llanas qué se
 *      pide, y avisa ANTES de que la persona salga a su banco;
 *   3. sin permiso no sube nada; con él, sube con la sesión de la cuenta nueva;
 *   4. la cola sobrevive a salir a Nequi (una recarga, un día), y los archivos
 *      del registro siguen la regla de la cámara;
 *   5. con la base sin el SQL (404) el registro no se rompe: se dice y se sigue;
 *   6. la tarjeta de la app (el «después» de verdad): a quién, y retirar;
 *   7. el CRM los ve, con la clave de Joan, y el equipo no;
 *   8. ningún texto dice «verificado», ni pide la clave, ni muestra porcentajes;
 *   9. la política, los términos y la versión de la autorización cuadran, y la
 *      frase de los «perfiles» dice la verdad;
 *  10. el SQL: RLS, permisos con nombre, el cortacircuito y el reparto;
 *  11. lo que se declara (cumplimiento) y lo que se precarga (sw.js).
 * La base de verdad está en pruebas/los-extractos-postgres.test.js (escrita,
 * NO corrida: no se levanta un PostgreSQL con Joan en el PC).
 * Los celulares, nombres y documentos son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const EX = require('../app/extractos.js');
const XC = require('../panel/extractos-crm.js');
const U = require('../app/cuenta.js');
const B = require('./banco-registro.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirPanel } = require('./banco-panel.js');
const { idbDeMentira } = require('./idb-de-mentira.js');
const { asentar } = require('./esperar.js');

/* EL DÍA EN QUE EL LOTE SALE AL SITIO (la regla del 15-oct: la fecha es la de
   publicación). Si lote-v145 sale otro día, se cambia AQUÍ y esta prueba dice
   qué más mover: app/extractos.js (VERSION_AUTORIZACION y FECHA_EN_PALABRAS),
   la política y los términos. */
const PUBLICACION = '2026-11-19';
const PUBLICACION_EN_PALABRAS = '19 de noviembre de 2026';

const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const PDF64 = Buffer.from('%PDF-1.4\n% extracto de mentira\n%%EOF\n', 'binary').toString('base64');
const UN_PDF = { tipo: 'pdf', bytes: 38, base64: PDF64, sha256: 'x1' };
const PNG64 = Buffer.from('\x89PNG\r\n\x1a\n pantallazo de mentira', 'binary').toString('base64');
const UN_PNG = { tipo: 'png', bytes: 29, base64: PNG64, sha256: 'x-png' };
const exCaja = P => P.ev("(document.getElementById('exPaso') || {}).innerHTML || ''");
const avisoEx = P => plano(P.ev("(document.getElementById('avisoExtractos') || {}).innerHTML || ''"));
const ids = P => P.ev('PASOS.map(function (p) { return p.id; }).join()').split(',');

/* María, independiente, con su celular y sus datos. */
function independiente(opc, ocupacion) {
  const P = B.abrir(opc);
  P.ev('Object.assign(REGISTRO, ' + JSON.stringify(Object.assign({ celular: B.CEL_MARIA }, B.DATOS_MARIA, B.CONTACTO_MARIA, B.RESTO,
    { ocupacion: ocupacion === undefined ? 'Independiente' : ocupacion })) + '); guardarBorrador(REGISTRO);');
  P.ev('anotarCelularDelRegistro(' + JSON.stringify(B.CEL_MARIA) + ')');
  return P;
}
function enElPaso(opc) {
  const P = independiente(opc);
  P.ev("pintarRegistro(indiceDe('ingresos')); pintarRegistro(indiceDe('extractos'))");
  return P;
}
/* Lo que la persona escoge en el paso, dicho al guardadero como lo dice la pantalla. */
function escoger(P, archivos) {
  P.ev('(function () { var g = guardaderoExtractos(); var e = g.estado(REGISTRO.intento, REGISTRO.celular);' +
       ' e.aut = EX.armarAutorizacion(new Date().toISOString()); g.guardarEstado(e); })()');
  (archivos || []).forEach(a => P.ev('guardaderoExtractos().agregar(REGISTRO.intento, REGISTRO.celular, ' + JSON.stringify(a) + ')'));
}
/* María hasta «Tu autorización», independiente. */
function mariaIndependienteHastaElPermiso(P) {
  B.mariaHastaElPermiso(P, false);
  P.ev("REGISTRO.ocupacion = 'Independiente'; guardarBorrador(REGISTRO); pintarRegistro(indiceDe('permiso'));" +
       " $('autGeneral').checked = true; $('autSensible').checked = false;");
}

/* ======================================================================== */
describe('1 · a quién se le ofrece: a quien NO es empleado', () => {
  test('seOfrece: todo lo que no es «Empleado», con tildes, mayúsculas o una opción nueva', () => {
    ['Empleado', 'empleado', ' EMPLEADO ', 'Empleada', 'Empleado con nómina'].forEach(o => assert.equal(EX.seOfrece(o), false, o));
    ['Independiente', 'Pensionado', 'Otra', 'Desempleado', 'Estudiante', 'Independiente o informal', 'Desempleada']
      .forEach(o => assert.equal(EX.seOfrece(o), true, o));
    [undefined, null, '', '   '].forEach(o => assert.equal(EX.seOfrece(o), false, 'sin ocupación se ofreció: ' + o));
  });
  test('las opciones del registro (app/cuenta.js): todas menos «Empleado», sin una lista escrita a mano', () => {
    const c = U.CAMPOS.find(x => x.id === 'ocupacion');
    assert.ok(c && c.opciones.includes('Empleado'), 'la prueba no prueba nada: «Empleado» ya no es una opción');
    c.opciones.forEach(o => assert.equal(EX.seOfrece(o), o !== 'Empleado', o));
  });
  test('en play/: con «Empleado» no aparece y el registro sigue en 11 pasos; con «Independiente», después del fondo y antes de la plata', () => {
    const E = independiente({}, 'Empleado');
    E.ev("pintarRegistro(indiceDe('ingresos'))");
    assert.equal(ids(E).indexOf('extractos'), -1);
    assert.match(B.texto(B.cuerpo(E)), /Paso 7 de 11/);
    const P = independiente();
    P.ev("pintarRegistro(indiceDe('ingresos'))");
    const l = ids(P);
    assert.equal(l.indexOf('pension'), l.indexOf('ingresos') + 1, 'el fondo de pensiones dejó de ir justo después de «De qué vives»');
    assert.equal(l.indexOf('extractos'), l.indexOf('pension') + 1);
    assert.equal(l.indexOf('cobro'), l.indexOf('extractos') + 1);
    assert.equal(P.ev("PASOS[indiceDe('extractos')].titulo"), 'Tus extractos');
    assert.match(B.texto(B.cuerpo(P)), /Paso 7 de 12/);
  });
  test('el paso se pone y se quita cuando la persona escoge o cambia su ocupación en «De qué vives»', () => {
    const P = independiente({}, '');
    P.ev("pintarRegistro(indiceDe('ingresos'))");
    assert.equal(ids(P).indexOf('extractos'), -1, 'sin ocupación ya estaba');
    B.casillas(P, 'ingresos', { ocupacion: 'Independiente' });
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'pension');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'extractos', '«Continuar» desde el fondo no llevó a los extractos');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    /* «Volver» desde la plata vuelve a los extractos, y de ahí al fondo. */
    P.ev('pintarRegistro(PASO - 1)');
    assert.equal(B.pasoActual(P), 'extractos');
    /* Cambia a «Empleado»: el paso se va, y «Continuar» desde el fondo va a la plata. */
    P.ev("pintarRegistro(indiceDe('ingresos'))");
    B.casillas(P, 'ingresos', { ocupacion: 'Empleado' });
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'pension');
    assert.equal(ids(P).indexOf('extractos'), -1);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
  });
  test('ni en PlataChat ni sin su archivo', () => {
    const Q = independiente({ search: '?marca=platachat' });
    Q.ev("pintarRegistro(indiceDe('ingresos'))");
    assert.equal(ids(Q).indexOf('extractos'), -1, 'PlataChat también lo tiene');
    const R = independiente({ sinExtractos: true });
    R.ev("pintarRegistro(indiceDe('ingresos'))");
    assert.equal(ids(R).indexOf('extractos'), -1, 'sin app/extractos.js el paso igual aparece');
  });
  test('es opcional: «Abrir mi cuenta» nunca manda de vuelta a él (primerPasoQueFalta)', () => {
    const P = independiente();
    P.ev("pintarRegistro(indiceDe('ingresos'))");
    assert.notEqual(P.ev('PASOS[primerPasoQueFalta()] && PASOS[primerPasoQueFalta()].id'), 'extractos');
  });
});

/* ======================================================================== */
describe('2 · el paso: lo que se pide, en palabras llanas, y la casilla sin marcar', () => {
  test('arriba «Lo hago después» y el aviso de los minutos de la cámara; la casilla nace SIN marcar; sin ella no hay botones de subir', async () => {
    const P = enElPaso();
    await asentar(10);
    assert.equal(B.pasoActual(P), 'extractos');
    const h = exCaja(P), t = plano(h);
    assert.ok(h.indexOf('Lo hago después') > 0 && h.indexOf('Lo hago después') < h.indexOf('id="exAut"'), '«Lo hago después» no está arriba de la casilla');
    assert.match(h, /<input type="checkbox" id="exAut" data-ex="aut">/, 'la autorización nació marcada');
    assert.ok(h.indexOf('id="exAntesDeIrte"') >= 0 && h.indexOf('id="exAntesDeIrte"') < h.indexOf('id="exAut"'),
      'el aviso de salir a la app del banco no va antes de la casilla');
    assert.match(t, new RegExp('vuelve en menos de ' + P.ev('EC.MINUTOS_VUELTA_DE_LA_CAMARA') + ' minutos'));
    assert.match(t, /toca «Lo hago después» y súbelos sin afán desde tu cuenta/);
    assert.match(t, /los últimos 3 meses de la cuenta donde te pagan o te llega la plata: Nequi, Daviplata o tu banco/);
    assert.match(t, /Se bajan desde la app de tu Nequi o de tu banco/);
    assert.match(t, /Nunca te pedimos la clave de tu Nequi, de Daviplata ni de tu banco/);
    assert.match(t, /no cambian tu garantía/i);
    assert.ok(h.search(/no cambian tu garantía/i) < h.indexOf('id="exAut"'), '«no cambian tu garantía» va después de la casilla');
    assert.equal(/data-ex="archivo"|data-ex="pegar"/.test(h), false, 'sin autorización ya ofrece subir');
  });
  test('con la casilla: PDF, pantallazos y «📋 Pegar», escogidos (no la cámara), sin SVG ni HTML', async () => {
    const P = enElPaso();
    escoger(P);
    P.ev("pintarRegistro(indiceDe('extractos'))");
    await asentar(10);
    const h = exCaja(P);
    assert.match(h, /id="exAut" data-ex="aut" checked/);
    ['📄 Subir el PDF', '🖼️ Subir pantallazos', '📋 Pegar'].forEach(b => assert.ok(h.indexOf(b) >= 0, 'falta ' + b));
    assert.equal(/capture=/.test(h), false);
    const accept = (h.match(/accept="[^"]*"/g) || []).join(' ');
    assert.match(accept, /application\/pdf/);
    assert.match(accept, /image\/png,image\/jpeg,image\/webp/);
    assert.equal(/svg|text\/html/.test(accept), false);
    assert.match(plano(h), /Si tu banco le puso clave al PDF, súbelo igual: nunca te pedimos esa clave/);
  });
  test('la casilla dice lo que la ley pide: para qué, opcional y aparte, quién los ve, cuánto se guardan, cómo se quitan, y los terceros', () => {
    const t = EX.TEXTOS.autorizacion + ' ' + EX.TEXTOS.autorizacionDetalle;
    ['NEXECO S.A.S.', 'extractos de mis cuentas', 'Para mirar cuánto me entra y con qué regularidad', 'Es opcional',
     'aparte de la autorización general', 'Nunca me piden la clave', 'Los mira una persona', 'ningún programa los lee ni los califica',
     'el resto del equipo no los ve', 'Se guardan mientras tenga cuenta', 'desde mi cuenta en la app', 'pedir por el chat que los borren',
     'nombres de otras personas', 'mi salud, mi religión o mi política no se usa para nada']
      .forEach(p => assert.ok(t.indexOf(p) >= 0, 'la autorización no dice «' + p + '»'));
    assert.equal(/checked/.test(EX.autorizacionHTML(false)), false, 'la casilla nace marcada');
    assert.match(EX.autorizacionHTML(true), /checked/);
  });
});

/* ======================================================================== */
describe('3 · sin permiso no sube nada; con él, con la sesión de ESA cuenta', () => {
  test('el guardadero: sin la autorización no guarda ningún archivo ni encola nada', async () => {
    const g = EX.guardadero({});
    const r = await g.agregar('i1', B.CEL_MARIA, UN_PDF);
    assert.equal(r.motivo, 'sin_autorizacion');
    assert.equal((await g.archivos('i1', B.CEL_MARIA)).lista.length, 0);
    assert.equal(await g.encolar('i1', B.CEL_MARIA), false);
    assert.equal(await g.cola(B.CEL_MARIA), null);
  });
  test('«Abrir mi cuenta» sin la casilla: ni la autorización ni ningún archivo salen a la base', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    mariaIndependienteHastaElPermiso(P);
    /* Un archivo puesto a la fuerza, sin autorización: tampoco entra. */
    P.ev('guardaderoExtractos().agregar(REGISTRO.intento, REGISTRO.celular, ' + JSON.stringify(UN_PDF) + ')');
    await asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    assert.deepEqual(llamadas().filter(x => /rpc\/extracto_(autorizar|subir)/.test(x.url)), []);
    /* Y la cuenta nueva le dice dónde quedan, porque saltó el paso. */
    assert.match(avisoEx(P), /Tus extractos son opcionales\. Los subes cuando quieras desde tu cuenta: Perfil → «📄 Tus extractos»/);
  });
  test('con la casilla y un PDF: primero la autorización (con su versión), después el archivo, con el token de la cuenta nueva', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    mariaIndependienteHastaElPermiso(P);
    escoger(P, [UN_PDF]);
    await asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(40);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    const l = llamadas();
    const aut = l.find(x => /rpc\/extracto_autorizar/.test(x.url)), sub = l.find(x => /rpc\/extracto_subir/.test(x.url));
    assert.ok(aut, 'la autorización no salió');
    assert.equal(aut.cuerpo.p_version, PUBLICACION);
    assert.match(aut.auth, /^Bearer tok-573001112233@tugarantia\.net-/, 'no salió con la sesión de la cuenta de María');
    assert.ok(sub, 'el PDF no salió');
    assert.equal(sub.cuerpo.p_archivo, PDF64);
    assert.ok(l.indexOf(aut) < l.indexOf(sub), 'el archivo salió antes que la autorización');
    assert.ok(l.findIndex(x => /auth\/v1\/signup/.test(x.url)) < l.indexOf(aut), 'salió antes de que existiera la cuenta');
    assert.match(avisoEx(P), /Tus extractos llegaron \(1 archivo\)/);
    /* Nada viaja en el registro ni en el signup. */
    const signup = l.find(x => /auth\/v1\/signup/.test(x.url));
    assert.equal(JSON.stringify(signup.cuerpo).indexOf(PDF64), -1, 'el extracto viajó en el signup');
  });
  test('quien al final dijo «Empleado» (cambió de idea) no sube nada aunque hubiera autorizado', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    mariaIndependienteHastaElPermiso(P);
    escoger(P, [UN_PDF]);
    P.ev("REGISTRO.ocupacion = 'Empleado'; guardarBorrador(REGISTRO); pintarRegistro(indiceDe('permiso'));" +
         " $('autGeneral').checked = true; $('autSensible').checked = false;");
    await asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(30);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.deepEqual(llamadas().filter(x => /rpc\/extracto_/.test(x.url) && !/extracto_mia/.test(x.url)), []);
  });
});

/* ======================================================================== */
describe('4 · la cola sobrevive a salir a Nequi; los archivos del registro siguen la regla de la cámara', () => {
  test('la cola de la cuenta: sobrevive a que la página se cierre y se vuelva a abrir (otro guardadero, el mismo teléfono), hasta el día siguiente', async () => {
    const idb = idbDeMentira();
    const ls = { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; } };
    let reloj = Date.parse('2026-11-19T15:00:00Z');
    const g = EX.guardadero({ ls, idb, ahora: () => reloj });
    const e = g.estado('i1', B.CEL_MARIA); e.aut = EX.armarAutorizacion('x'); g.guardarEstado(e);
    assert.equal((await g.agregar('i1', B.CEL_MARIA, UN_PDF)).ok, true);
    assert.equal(await g.encolar('i1', B.CEL_MARIA), true);
    /* Se fue 40 minutos a la app de Nequi y el teléfono cerró la página. */
    reloj += 40 * 60e3;
    const g2 = EX.guardadero({ ls, idb, ahora: () => reloj });
    await g2.soltarArchivos();   // lo que hace el arranque con la regla de la cámara: no toca la cola
    await g2.barrer();
    const c = await g2.cola(B.CEL_MARIA);
    assert.ok(c, 'la cola no sobrevivió a salir a Nequi');
    assert.equal(c.archivos.length, 1);
    assert.equal(c.aut.version, PUBLICACION);
    /* Y sube con la sesión al volver, de uno en uno, y se vacía. */
    const pedidas = [];
    const r = await EX.subirCola(g2, B.CEL_MARIA, (fn, cuerpo) => { pedidas.push(fn); return Promise.resolve({ ok: true, id: 1 }); });
    assert.deepEqual(pedidas, ['extracto_autorizar', 'extracto_subir']);
    assert.equal(r.subidos, 1);
    assert.equal(await g2.cola(B.CEL_MARIA), null);
    /* Pasado el día, lo que no subió se va del teléfono (el prestado no se queda con los extractos de María). */
    const g3 = EX.guardadero({ ls, idb, ahora: () => reloj });
    const e3 = g3.estado('i2', B.CEL_MARIA); e3.aut = EX.armarAutorizacion('x'); g3.guardarEstado(e3);
    await g3.agregar('i2', B.CEL_MARIA, UN_PNG); await g3.encolar('i2', B.CEL_MARIA);
    reloj += 25 * 3600e3;
    const g4 = EX.guardadero({ ls, idb, ahora: () => reloj });
    assert.equal(await g4.cola(B.CEL_MARIA), null, 'la cola vencida se quedó en el teléfono');
  });
  test('en play/: al volver de Nequi dentro del rato de la cámara los archivos siguen; pasado el rato se sueltan y el paso lo dice', async () => {
    const corre = async minutos => {
      const almacen = {}, sesion = {}, indexedDB = idbDeMentira();
      const P = enElPaso({ almacen, sesion, indexedDB });
      escoger(P, [UN_PDF]);
      await asentar(10);
      assert.equal(P.ev('guardaderoExtractos().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), true);
      const D0 = Date, d = minutos * 60e3;
      class Luego extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + d); } static now() { return D0.now() + d; } }
      const Q = B.abrir({ almacen, sesion, indexedDB, Date: Luego });
      await asentar(20);
      return Q;
    };
    const pronto = await corre(2);
    assert.equal(pronto.ev('EXTRACTOS_PERDIDOS'), false, 'soltó los extractos de quien volvió en dos minutos');
    assert.equal(pronto.ev('guardaderoExtractos().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), true);
    const tarde = await corre(25);
    assert.equal(tarde.ev('guardaderoExtractos().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), false);
    if (B.pasoActual(tarde) === 'extractos') assert.match(plano(exCaja(tarde)), /se borraron de este teléfono/);
  });
  test('«Lo hago después» dice dónde queda el después y lo que va a pasar con lo escogido', async () => {
    const P = enElPaso();
    escoger(P, [UN_PDF]);
    await asentar(5);
    P.ev("pintarRegistro(indiceDe('extractos'))");
    P.ev('extractosDespues()');
    await asentar(5);
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.texto(B.cuerpo(P)), /Tu autorización de los extractos y 1 archivo se guardan con tu registro cuando toques «Abrir mi cuenta»/);
    const Q = enElPaso();
    Q.ev('extractosDespues()');
    await asentar(5);
    assert.match(B.texto(B.cuerpo(Q)), /Dejaste tus extractos para después\. Los subes cuando quieras desde tu cuenta: Perfil → «📄 Tus extractos»/);
  });
  test('«Empezar de cero» se lleva lo escogido; salir a la portada suelta los archivos y deja la autorización', async () => {
    const P = enElPaso();
    escoger(P, [UN_PDF]);
    await asentar(5);
    P.ev('pintarEntrar()');
    await asentar(5);
    P.ev('guardaderoExtractos().archivos(REGISTRO.intento, REGISTRO.celular).then(function (r) { window.__n = r.lista.length; })');
    await asentar(5);
    assert.equal(P.ev('window.__n'), 0, 'los archivos se quedaron al salir del registro');
    assert.ok(P.ev('!!guardaderoExtractos().estado(REGISTRO.intento, REGISTRO.celular).aut'));
    P.ev('empezarDeNuevo()');
    await asentar(5);
    assert.equal(P.ev("localStorage.getItem('play_extractos')"), null, 'lo escogido por la persona anterior se quedó');
  });
});

/* ======================================================================== */
describe('5 · con la base sin el SQL (404), el registro no se rompe: se dice y se sigue', () => {
  const con404 = P => P.ev("(function () { var f = fetch; fetch = function (u, op) { if (/rpc\\/extracto_/.test(String(u))) {" +
    " window.__llamadas.push({ url: String(u) }); return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); }," +
    " text: function () { return Promise.resolve('{}'); } }); } return f(u, op); }; })()");
  test('la pregunta a la base quita el paso; quien estaba en él pasa al siguiente y se le dice por qué', async () => {
    const P = independiente();
    B.nube(P);
    con404(P);
    P.ev("pintarRegistro(indiceDe('ingresos')); pintarRegistro(indiceDe('extractos'))");
    await asentar(20);
    assert.equal(ids(P).indexOf('extractos'), -1, 'con la base sin las funciones, el paso sigue');
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.texto(B.cuerpo(P)), /Los extractos todavía no se pueden subir: esta parte no está encendida en nuestro sistema\. Es opcional: sigue con tu registro\./);
    assert.equal(P.ev('EX_APAGADO_PLAY'), true);
  });
  test('si la subida al abrir la cuenta contesta 404, la cuenta se abre igual y se dice qué pasó con sus extractos', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    P.ev('EXTRACTOS_PROBADA = true;');   // la base no se preguntó antes (la pestaña venía de antes del lote)
    mariaIndependienteHastaElPermiso(P);
    escoger(P, [UN_PDF]);
    con404(P);
    await asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(40);
    assert.equal(P.ev('VISTA'), 'listo', 'el 404 de los extractos frenó el registro: ' + B.texto(B.caja(P)));
    assert.ok(llamadas().some(x => /rpc\/extracto_autorizar/.test(x.url)));
    assert.match(avisoEx(P), /Tus extractos se quedaron en este teléfono: esta parte todavía no está encendida en nuestro sistema\..*Tu cuenta quedó igual\./);
    assert.equal(/Subirlos desde tu Perfil/.test(avisoEx(P)), false, 'manda a una tarjeta que con la base así no aparece');
  });
});

/* ======================================================================== */
describe('6 · la tarjeta de la app: el «Lo hago después» de verdad', () => {
  const AHORA = Date.parse('2026-11-19T15:00:00Z');
  const SESION = JSON.stringify({ access_token: 'token-de-ana', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222' });
  function nube(o) {
    o = o || {};
    const mia = { ok: true, ocupacion: o.ocupacion === undefined ? 'Independiente' : o.ocupacion, autorizacion: o.autorizacion || null, archivos: o.archivos || [] };
    return (url, cuerpo) => {
      if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: false } };
      if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-11-19T14:55:00Z' } } };
      if (/rpc\/chat_/.test(url)) return { status: 200, cuerpo: { ok: true, mensajes: [], servicio: 0, cobranza: 0, creditos: 0, total: 0 } };
      if (/rpc\/pension_mia$/.test(url)) return { status: 200, cuerpo: { ok: true, autorizacion: null, archivos: [] } };
      if (/rpc\/extracto_/.test(url) && o.apagado) return { status: 404, cuerpo: { message: 'no existe' } };
      if (/rpc\/extracto_mia$/.test(url)) return { status: 200, cuerpo: mia };
      if (/rpc\/extracto_autorizar$/.test(url)) {
        mia.autorizacion = { version: cuerpo.p_version, recibida_en: '2026-11-19T15:00:00Z', revocada_en: null };
        return { status: 200, cuerpo: { ok: true, version: cuerpo.p_version } };
      }
      if (/rpc\/extracto_subir$/.test(url)) {
        if (!mia.autorizacion || mia.autorizacion.revocada_en) return { status: 200, cuerpo: { ok: false, motivo: 'sin_autorizacion' } };
        const id = 900 + mia.archivos.length, n = Buffer.from(cuerpo.p_archivo, 'base64').length;
        mia.archivos.push({ id, tipo: 'pdf', bytes: n, creado_en: '2026-11-19T15:01:00Z' });
        return { status: 200, cuerpo: { ok: true, id, tipo: 'pdf', bytes: n } };
      }
      if (/rpc\/extracto_retirar$/.test(url)) {
        const n = mia.archivos.length; mia.archivos = [];
        if (mia.autorizacion) mia.autorizacion.revocada_en = '2026-11-19T15:05:00Z';
        return { status: 200, cuerpo: { ok: true, borrados: n } };
      }
      return { status: 404, cuerpo: {} };
    };
  }
  const ex = A => A.llamadas.filter(l => /rpc\/extracto_/.test(l.url));
  test('a quien no es empleado: «Sube tus extractos», pedido con SU sesión', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube() });
    await asentar(30);
    assert.match(A.elem('entrarCuerpo').innerHTML, /<div id="exCuenta"><\/div>/);
    const t = plano(A.elem('exCuenta').innerHTML);
    assert.match(t, /📄 Sube tus extractos · opcional/);
    assert.match(t, /Todavía no nos los das\./);
    assert.match(A.elem('exCuenta').innerHTML, /id="exAbrir"[^>]*>Subirlos</);
    assert.equal(ex(A)[0].url.replace(/^.*rpc\//, ''), 'extracto_mia');
    assert.equal(ex(A)[0].cab.Authorization, 'Bearer token-de-ana');
  });
  test('a quien es empleado y no ha dado nada, no; a quien es empleado y ya dio algo, sí (lo suyo lo ve y lo quita siempre)', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ ocupacion: 'Empleado' }) });
    await asentar(30);
    assert.equal(A.elem('exCuenta').innerHTML, '', 'a un empleado se le ofreció');
    const B2 = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ ocupacion: 'Empleado',
      autorizacion: { version: PUBLICACION, recibida_en: '2026-11-19T15:00:00Z', revocada_en: null },
      archivos: [{ id: 7, tipo: 'pdf', bytes: 2048, creado_en: '2026-11-19T15:01:00Z' }] }) });
    await asentar(30);
    assert.match(plano(B2.elem('exCuenta').innerHTML), /📄 Tus extractos · opcional.*Ya nos diste 1 PDF\./);
  });
  test('con la base sin las funciones (404), la tarjeta no aparece', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ apagado: true }) });
    await asentar(30);
    assert.equal(A.elem('exCuenta').innerHTML, '');
    assert.equal(A.ev('EX_APAGADO'), true);
  });
  test('abierta: la casilla SIN marcar; al marcarla firma con la versión de hoy; «Retirar» borra todo, preguntando antes', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube() });
    await asentar(30);
    A.elem('exAbrir')._oyentes.click[0]();
    await asentar(5);
    const h = A.elem('exCuerpo').innerHTML;
    assert.match(h, /<input type="checkbox" id="exAut" data-ex="aut">/, 'la autorización nació marcada');
    assert.equal(/Lo hago después/.test(h), false, 'en la app no hay «después»: ya es el después');
    assert.equal(/exAntesDeIrte/.test(h), false, 'en la cuenta nada se borra por salir: el aviso de la cámara sobra');
    /* El banco guarda el mismo nodo entre repintadas (en el navegador es uno nuevo cada vez):
       los oyentes se acumulan, y el que vale es el último, el de la tarjeta pintada ahora. */
    const ultimo = () => { const l = A.elem('exCuerpo')._oyentes.change; return l[l.length - 1]; };
    ultimo()({ target: { getAttribute: k => (k === 'data-ex' ? 'aut' : null), checked: true } });
    await asentar(20);
    const aut = ex(A).find(l => /extracto_autorizar$/.test(l.url));
    assert.ok(aut, 'marcar la casilla no guardó la autorización');
    assert.equal(aut.cuerpo.p_version, PUBLICACION);
    assert.equal(aut.cab.Authorization, 'Bearer token-de-ana');
    /* Un PDF escogido con el selector del teléfono sube en el momento, con su sesión. */
    const pdf = new Blob([Buffer.from('%PDF-1.4\n% extracto de mentira\n%%EOF\n', 'binary')]);
    ultimo()({ target: { getAttribute: k => (k === 'data-ex' ? 'archivo' : null), files: [pdf] } });
    await asentar(40);
    const sub = ex(A).find(l => /extracto_subir$/.test(l.url));
    assert.ok(sub, 'el PDF escogido no subió');
    assert.equal(sub.cuerpo.p_archivo, PDF64);
    assert.equal(sub.cab.Authorization, 'Bearer token-de-ana');
    assert.match(plano(A.elem('exTarjeta') ? A.elem('exLinea').textContent : ''), /Ya nos diste 1 PDF\./);
    A.ev('confirm = function () { return true; }');
    A.elem('exRetirar')._oyentes.click[0]();
    await asentar(20);
    assert.ok(ex(A).some(l => /extracto_retirar$/.test(l.url)), 'retirar no llamó a la base');
  });
});

/* ======================================================================== */
describe('7 · el CRM los ve, con la clave de Joan; el equipo no', () => {
  const CLAVE = 'clave-de-prueba-larga-123';
  const CEL = '3001113344';
  const PERSONA = { celular: CEL, version: PUBLICACION, autorizada_en: '2026-11-19T15:00:00Z', revocada_en: null, pdf: 2, imagenes: 1, ultimo: '2026-11-19T15:10:00Z' };
  function conNube(P, o) {
    o = o || {};
    P.ev("localStorage.setItem('tg_sb_cfg', JSON.stringify({ url: 'https://nube.de.mentira', anon: 'anon', clave: '" + CLAVE + "' }));");
    P.ev("sbCfg = function () { return { url: 'https://nube.de.mentira', anon: 'anon', clave: '" + CLAVE + "' }; };");
    P.ctx.__respuestas = o;
    P.ev(`window.__rpc = []; fetch = function (u, op) {
      var fn = String(u).replace(/^.*rpc\\//, ''), c = {}; try { c = JSON.parse(op.body); } catch (e) {}
      window.__rpc.push({ fn: fn, c: c });
      var r = window.__respuestas[fn];
      var st = r === undefined ? 404 : 200;
      var t = r === undefined ? '' : JSON.stringify(r);
      return Promise.resolve({ ok: st === 200, status: st, text: function () { return Promise.resolve(t); }, json: function () { return Promise.resolve(r); } });
    };`);
  }
  const rpcs = P => JSON.parse(P.ev('JSON.stringify(window.__rpc)'));
  test('📥 Registrados: un bloque propio con quien subió, pedido con la clave de Joan', async () => {
    const P = abrirPanel({});
    conNube(P, { extracto_resumen: { ok: true, espacio: { ocupado: 1000, tope: 52428800 }, personas: [PERSONA] } });
    P.ev('_registros = [{ id: 1, nombre: "Ana De Mentira", telefono: "' + CEL + '", datos: {}, estado: "nuevo" }]; renderRegistros();');
    await asentar(20);
    const r = rpcs(P).find(x => x.fn === 'extracto_resumen');
    assert.ok(r, 'no preguntó por los extractos');
    assert.equal(r.c.p_clave, CLAVE);
    const t = plano(P.elems.regExtractos.innerHTML);
    assert.match(t, /📄 Extractos que subieron/);
    assert.match(t, /Ana De Mentira · 300 111 3344/);
    assert.match(t, /2 PDF y 1 pantallazo/);
    assert.match(P.elems.regExtractos.innerHTML, /onclick="verExtractosDe\(this\.getAttribute\('data-extractos-ver'\)\)"/);
  });
  test('📨 Solicitudes: el chip «📄 Subió extractos» en la celda del nombre, sin tocar el resto de la fila', async () => {
    const P = abrirPanel({});
    conNube(P, { extracto_resumen: { ok: true, espacio: null, personas: [PERSONA] } });
    await P.ev('traerExtractos()');
    const s = { id: 's1', nombre: 'Ana', telefono: CEL, estado: 'nueva', capital: 100000, tasa: 0.2, origen: 'app' };
    P.ev('telDeSolicitud = function () { return "' + CEL + '"; };');
    const fila = P.ev('filaDeSolicitud(' + JSON.stringify(s) + ')');
    assert.match(fila, /📄 Subió extractos/);
    assert.ok(fila.indexOf('📄 Subió extractos') < fila.indexOf('</td>'), 'el chip no va en la primera celda');
    /* Quien no subió nada: sin chip. */
    P.ev('telDeSolicitud = function () { return "3009998877"; };');
    assert.equal(/Subió extractos/.test(P.ev('filaDeSolicitud(' + JSON.stringify(s) + ')')), false);
  });
  test('la ficha (que viene de un registro): los archivos con «📄 Ver y descargar», y el resumen de Joan se guarda EN LA FICHA', async () => {
    const P = abrirPanel({});
    conNube(P, { extracto_de: { ok: true, celular: CEL, autorizacion: { version: PUBLICACION, autorizada_en: '2026-11-19T15:00:00Z', revocada_en: null },
      archivos: [{ id: 41, tipo: 'pdf', bytes: 120000, sha256: 'h', creado_en: '2026-11-19T15:10:00Z' }] } });
    P.cargarCartera({ socios: [{ id: 'C1', nombre: 'Ana De Mentira', telefono: CEL, origen: 'registro_abierto' }], prestamos: [] });
    P.ev('verCliente("C1")');
    await asentar(20);
    const pedida = rpcs(P).find(x => x.fn === 'extracto_de');
    assert.ok(pedida, 'la ficha no preguntó por sus extractos');
    assert.equal(pedida.c.p_celular, CEL);
    const h = P.elems.fichaExtractos.innerHTML;
    assert.match(h, /📄 Ver y descargar/);
    assert.match(h, /id="exMensual"/);
    assert.match(h, /id="exRegular"/);
    P.ev("document.getElementById('exMensual').value = '1.250.000'; document.getElementById('exRegular').value = 'irregular';");
    P.ev('guardarResumenExtractos("C1")');
    const s = JSON.parse(P.ev('JSON.stringify(DB.socios.find(function (x) { return x.id === "C1"; }).extractoResumen)'));
    assert.equal(s.mensual, 1250000);
    assert.equal(s.regular, 'irregular');
    assert.ok(s.anotado_en);
    assert.deepEqual(Object.keys(s).sort(), ['anotado_en', 'mensual', 'regular'], 'el resumen guarda algo más que la plata y la regularidad');
    /* Y la ficha hecha a mano (sin registro) no pregunta por un celular que puede ser de otro. */
    const Q = abrirPanel({});
    conNube(Q, {});
    Q.cargarCartera({ socios: [{ id: 'C2', nombre: 'Beto', telefono: CEL }], prestamos: [] });
    Q.ev('verCliente("C2")');
    await asentar(20);
    assert.equal(rpcs(Q).filter(x => x.fn === 'extracto_de').length, 0, 'buscó los extractos de un celular en una ficha que no viene de un registro');
  });
  test('el modo equipo no pinta nada ni pregunta nada', async () => {
    const P = abrirPanel({});
    conNube(P, { extracto_resumen: { ok: true, espacio: null, personas: [PERSONA] } });
    P.ev('CARTERA_EQUIPO = { ok: true, gente: [] };');
    P.ev('_registros = [{ id: 1, nombre: "Ana", telefono: "' + CEL + '", datos: {}, estado: "nuevo" }]; renderRegistros();');
    await asentar(20);
    assert.equal(rpcs(P).filter(x => /^extracto_/.test(x.fn)).length, 0, 'el modo equipo preguntó por los extractos');
    assert.equal(P.elems.regExtractos.innerHTML, '');
    assert.equal(P.ev('extractosCRM()'), null);
  });
  test('abrir uno: el tipo lo deciden sus bytes y tiene que coincidir con la base; si no, no se abre', async () => {
    const rpc = r => () => Promise.resolve(r);
    const ok = await XC.traer(rpc({ ok: true, id: 41, tipo: 'pdf', base64: PDF64 }), 'c', 41);
    assert.equal(ok.ok, true);
    assert.equal(ok.blob.type, 'application/pdf');
    const malo = await XC.traer(rpc({ ok: true, id: 42, tipo: 'pdf', base64: Buffer.from('<svg></svg>').toString('base64') }), 'c', 42);
    assert.deepEqual([malo.ok, malo.motivo], [false, 'no_coincide']);
  });
  /* 13-nov-2026 (remate) — «🚫 Borrar a alguien que lo pidió» llamaba a
     equipo_suprimir y a pension_borrar, nunca a extracto_borrar, y su «Listo»
     no nombraba los extractos: quien pidió que lo borraran seguía con ellos. */
  const RESUMEN = { mensual: 1250000, regular: 'irregular', anotado_en: '2026-11-19T16:00:00Z' };
  const conAlertas = P => P.ev("confirm = function () { return true; }; window.__alertas = []; alert = function (m) { window.__alertas.push(String(m)); };");
  const alertas = P => JSON.parse(P.ev('JSON.stringify(window.__alertas)'));
  const resumenDe = (P, id) => P.ev('JSON.stringify((DB.socios.find(function (x) { return x.id === "' + id + '"; }) || {}).extractoResumen || null)');
  function suprimir(P) {
    P.ev('suprimirDesdeBases()');
    P.ev("document.getElementById('supCel').value = '" + CEL + "'; document.getElementById('supComo').value = 'por el chat de la app el 19-nov';");
    P.ev('confirmarSuprimir()');
  }
  test('🚫 Borrar a alguien que lo pidió: también borra sus extractos y tu resumen en TODA ficha con ese celular, y el «Listo» lo dice', async () => {
    const P = abrirPanel({});
    conNube(P, { equipo_suprimir: { ok: true, es_cliente: false, copias_pendientes: 0, del_equipo: 0, de_joan: 1 },
                 pension_borrar: { ok: true, archivos: 0, autorizaciones: 0 },
                 extracto_borrar: { ok: true, celular: CEL, archivos: 2, autorizaciones: 1 },
                 equipo_agregados: {} });
    /* La del registro, una hecha a mano con el mismo celular, y la de otra persona. Ninguna abierta. */
    P.cargarCartera({ socios: [
      { id: 'C1', nombre: 'Ana De Mentira', telefono: CEL, origen: 'registro_abierto', extractoResumen: RESUMEN },
      { id: 'C2', nombre: 'Ana (a mano)', telefono: '57 ' + CEL, extractoResumen: RESUMEN },
      { id: 'C3', nombre: 'Beto Inventado', telefono: '3009998877', extractoResumen: RESUMEN }], prestamos: [] });
    conAlertas(P);
    suprimir(P);
    assert.match(plano(P.elems.mBody.innerHTML), /Y sus extractos, si los subió, también, con tu resumen de ellos en cualquier ficha con ese celular/);
    await asentar(40);
    const b = rpcs(P).filter(x => x.fn === 'extracto_borrar');
    assert.equal(b.length, 1, 'no borró sus extractos');
    assert.deepEqual([b[0].c.p_clave, b[0].c.p_celular], [CLAVE, CEL]);
    const listo = alertas(P).filter(a => /^Listo/.test(a));
    assert.equal(listo.length, 1, 'el «Listo» salió ' + listo.length + ' veces');
    assert.match(listo[0], /También borré sus extractos: 2 archivo\(s\) y su autorización, y tu resumen de ellos en sus 2 fichas\./);
    assert.equal(resumenDe(P, 'C1'), 'null', 'el resumen de la ficha del registro se quedó');
    assert.equal(resumenDe(P, 'C2'), 'null', 'el resumen de la ficha hecha a mano se quedó');
    assert.notEqual(resumenDe(P, 'C3'), 'null', 'borró el resumen de otra persona');
  });
  test('🚫 si la nube no deja borrar sus extractos, el «Listo» dice que NO y dónde hacerlo; y si es cliente, también se van', async () => {
    const P = abrirPanel({});
    conNube(P, { equipo_suprimir: { ok: true, es_cliente: true, copias_pendientes: 0 },
                 pension_borrar: { ok: true, archivos: 0, autorizaciones: 0 },
                 extracto_borrar: { ok: false, motivo: 'celular' }, equipo_agregados: {} });
    P.cargarCartera({ socios: [{ id: 'C1', nombre: 'Ana De Mentira', telefono: CEL, origen: 'registro_abierto', extractoResumen: RESUMEN }], prestamos: [] });
    conAlertas(P);
    suprimir(P);
    await asentar(40);
    const a = alertas(P);
    assert.equal(a.length, 1);
    assert.match(a[0], /^Es cliente/);
    assert.match(a[0], /Sus extractos NO se borraron \(celular\): bórralos desde 📥 Registrados → 📄 Extractos que subieron → 🗑 Borrar sus extractos\. Sí quité tu resumen de ellos en su ficha\./);
    assert.equal(resumenDe(P, 'C1'), 'null');
    /* Y lo que se dice en cada caso, sin callar ninguno. */
    assert.equal(XC.lineaSuprimir({ falta: true }, 0), '');
    assert.match(XC.lineaSuprimir(null, 0), /NO se borraron: este CRM no pudo preguntar por ellos/);
    assert.match(XC.lineaSuprimir({ archivos: 0, autorizaciones: 0 }, 1), /No tenía extractos en la nube; quité tu resumen de ellos en su ficha\./);
  });
  test('«🗑 Borrar sus extractos» se lleva el resumen de toda ficha con ese celular, y la ficha tiene «🗑 Quitar el resumen»', async () => {
    const P = abrirPanel({});
    conNube(P, { extracto_borrar: { ok: true, celular: CEL, archivos: 1, autorizaciones: 1 }, extracto_resumen: { ok: true, espacio: null, personas: [] } });
    P.cargarCartera({ socios: [
      { id: 'C1', nombre: 'Ana De Mentira', telefono: CEL, origen: 'registro_abierto', extractoResumen: RESUMEN },
      { id: 'C3', nombre: 'Beto Inventado', telefono: '3009998877', extractoResumen: RESUMEN }], prestamos: [] });
    conAlertas(P);
    P.ev('borrarExtractosDe("' + CEL + '")');   // desde 📥 Registrados, sin ninguna ficha abierta
    await asentar(20);
    assert.equal(resumenDe(P, 'C1'), 'null', 'el resumen se quedó porque su ficha no estaba abierta');
    assert.notEqual(resumenDe(P, 'C3'), 'null');
    assert.match(alertas(P)[0], /^Listo: borré 1 archivo\(s\) de sus extractos y su autorización, y tu resumen de ellos en su ficha\.$/);
    /* El botón: solo con algo anotado, y quita solo el resumen. */
    assert.match(XC.resumenHTML(RESUMEN, 'C3'), /data-extractos-quitar="C3"[^>]*onclick="quitarResumenExtractos\(this\.getAttribute\('data-extractos-quitar'\)\)">🗑 Quitar el resumen</);
    assert.equal(/Quitar el resumen/.test(XC.resumenHTML(null, 'C3')), false);
    P.ev('quitarResumenExtractos("C3")');
    assert.equal(resumenDe(P, 'C3'), 'null');
    assert.equal(rpcs(P).filter(x => x.fn === 'extracto_borrar').length, 1, 'quitar el resumen tocó la nube');
  });
  test('la base: lo de Joan solo con su clave (anon), lo del cliente solo con su sesión; ninguna del equipo', () => {
    const t = leer('base/20261113c_los_extractos.sql').replace(/--[^\n]*/g, '');
    ['extracto_resumen(text)', 'extracto_de(text, text)', 'extracto_archivo(text, bigint)', 'extracto_borrar(text, text)'].forEach(f => {
      assert.match(t, new RegExp('grant execute on function public\\.' + f.replace(/[()]/g, '\\$&') + '\\s+to anon;'), f);
      assert.equal(new RegExp('grant execute on function public\\.' + f.replace(/[()]/g, '\\$&') + '\\s+to authenticated').test(t), false, f);
    });
    ['extracto_autorizar(text, text)', 'extracto_subir(text)', 'extracto_mia()', 'extracto_quitar(bigint)', 'extracto_retirar()'].forEach(f => {
      assert.match(t, new RegExp('grant execute on function public\\.' + f.replace(/[()]/g, '\\$&') + '\\s+to authenticated;'), f);
      assert.equal(new RegExp('grant execute on function public\\.' + f.replace(/[()]/g, '\\$&') + '\\s+to anon').test(t), false, f);
    });
    const joan = t.split(/create or replace function public\.extracto_(resumen|de|archivo|borrar)\(/).slice(1).filter((x, i) => i % 2 === 1);
    joan.forEach(f => assert.match(f.slice(0, f.indexOf('end\n$$;')), /if not public\.clave_ok\(p_clave\) then/, 'una función de Joan no pide su clave'));
    assert.equal(/gerente|celular_del_equipo_de_sesion\(\)\s*[^'i]/.test(t.split('end $$;').slice(1).join('')), false, 'una función de los extractos mira al equipo');
  });
});

/* ======================================================================== */
describe('8 · ningún texto dice «verificado», ni pide la clave, ni muestra porcentajes', () => {
  const pantallas = () => {
    const vm = (modo, aut) => ({ modo, aut, archivos: aut ? [{ id: 'a', tipo: 'pdf', bytes: 1000 }] : [] });
    return [EX.pantallaHTML(vm('registro', null)), EX.pantallaHTML(vm('registro', { version: PUBLICACION })),
            EX.pantallaHTML(vm('cuenta', null)), EX.pantallaHTML(vm('cuenta', { version: PUBLICACION }))].map(plano).join(' ') + ' ' +
      JSON.stringify([EX.TEXTOS, EX.MOTIVOS]) + ' ' + EX.pistaDespues({}) + ' ' + EX.pistaDespues({ aut: { version: 'x' }, n: 2 }) + ' ' +
      ['ok', 'apagado', 'freno', 'lleno', 'retirada', 'sin_red'].map(e => EX.avisoDeLaCola({ estado: e, subidos: 1, total: 1, rechazados: [] }).html).join(' ');
  };
  test('nunca «verificado» ni «verificamos», ni que se borra a los 30 días, ni que sube la garantía', () => {
    const t = pantallas();
    assert.equal(/verific/i.test(t), false, 'una pantalla habla de verificar');
    assert.equal(/30 d[ií]as/.test(t), false);
    assert.equal(/sube tu garant|suma garant|más garant/i.test(t), false);
    const crm = XC.bloque({ celular: '3001113344', autorizacion: { version: PUBLICACION, autorizada_en: '2026-11-19T15:00:00Z' }, archivos: [] },
      { ficha: { id: 'C1', resumen: null } }) + XC.bloqueRegistros({}, { estado: 'error' });
    assert.equal(/verific/i.test(plano(crm)), false, 'el CRM habla de verificar');
  });
  test('la clave solo se nombra para decir que NUNCA se pide; ningún campo la recibe', () => {
    const t = pantallas();
    const frases = t.split(/(?<=[.])\s+/).filter(f => /clave/i.test(f));
    assert.ok(frases.length >= 2, 'la prueba no prueba nada: ninguna frase habla de la clave');
    frases.forEach(f => assert.match(f, /\b(Nunca|nunca|no)\b/, 'una frase habla de la clave sin decir que no se pide: ' + f));
    const h = EX.pantallaHTML({ modo: 'registro', aut: { version: PUBLICACION }, archivos: [] });
    assert.equal(/type="password"|data-ex="clave"|name="clave"/.test(h), false, 'el paso tiene un campo de clave');
  });
  test('el cliente nunca ve un porcentaje', () => {
    assert.equal(/%/.test(pantallas()), false, 'una pantalla del cliente muestra un porcentaje');
  });
});

/* ======================================================================== */
describe('9 · la política, los términos y la versión de la autorización cuadran', () => {
  const visible = h => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const isoDe = t => { const m = String(t).match(/(\d{1,2}) de (\w+) de (\d{4})/); return m ? m[3] + '-' + String(MESES.indexOf(m[2]) + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
  const P = visible(leer('legal/privacidad.html')), T = visible(leer('legal/terminos.html'));
  test('la versión es el día en que sale el lote, la casilla lo dice, y no es la de la autorización general', () => {
    assert.equal(EX.VERSION_AUTORIZACION, PUBLICACION);
    assert.equal(isoDe(EX.FECHA_EN_PALABRAS), PUBLICACION);
    assert.notEqual(EX.VERSION_AUTORIZACION, U.VERSION_AUTORIZACION);
    assert.match(visible(EX.autorizacionHTML(false)), new RegExp('Versión del ' + PUBLICACION_EN_PALABRAS));
    assert.match(EX.autorizacionHTML(false), /privacidad\.html#extractos/);
    assert.match(leer('legal/privacidad.html'), /<h3 id="extractos">/, 'la política no tiene la sección a la que apunta la casilla');
  });
  test('la política y los términos dicen ese día arriba, en su primer «Lo que cambió» y en «rige desde»; ninguna fecha es posterior', () => {
    const fechas = { 'la política, «Última actualización»': (P.match(/Última actualización: (\d{1,2} de \w+ de \d{4})/) || [])[1],
                     'la política, su primer «Lo que cambió»': (P.match(/Lo que cambió el (\d{1,2} de \w+ de \d{4}):/) || [])[1],
                     'la política, «Esta versión rige desde»': (P.match(/Esta versión rige desde el (\d{1,2} de \w+ de \d{4})/) || [])[1],
                     'los términos, «Última actualización»': (T.match(/Última actualización: (\d{1,2} de \w+ de \d{4})/) || [])[1],
                     'los términos, su primer «Lo que cambió»': (T.match(/Lo que cambió el (\d{1,2} de \w+ de \d{4}):/) || [])[1] };
    Object.keys(fechas).forEach(k => assert.equal(isoDe(fechas[k]), PUBLICACION, k + ' dice «' + fechas[k] + '»'));
    [['legal/privacidad.html', P], ['legal/terminos.html', T]].forEach(([f, d]) =>
      [...d.matchAll(/(?:Última actualización:|Lo que cambió el|rige desde el|rigió desde el) (\d{1,2} de \w+ de \d{4})/g)].forEach(m =>
        assert.ok(isoDe(m[1]) <= PUBLICACION, f + ' tiene una versión del ' + m[1] + ', después del día en que sale el lote')));
    assert.match(P, /la anterior rigió desde el 29 de octubre de 2026/);
  });
  test('su «Lo que cambió» dice que para qué se usan los datos no cambió para quien no la da (la general no sube)', () => {
    const l = P.split('Lo que cambió el ' + PUBLICACION_EN_PALABRAS + ':')[1].split('Lo que cambió el')[0];
    assert.match(l, /Para qué usamos tus datos no cambió para quien no da esa autorización/);
    assert.match(l, /extractos/);
    assert.match(l, /PlataChat no los pide/);
    assert.equal(U.VERSION_AUTORIZACION, '2026-10-19', 'la general subió: a cada cliente se le volvería a pedir');
  });
  test('la sección «extractos» dice qué se guarda, para qué, quién lo ve, cuánto tiempo y cómo se quita', () => {
    const s = visible(leer('legal/privacidad.html').split('<h3 id="extractos">')[1].split('</section>')[0]);
    ['Darlos es opcional', 'últimos 3 meses', 'Nequi', 'Daviplata', 'si no eres empleado', 'PlataChat no te los pide',
     'Los mira una persona: ningún programa los lee ni los califica', 'no cambian tu garantía', 'nunca viene marcada',
     'Nunca te pedimos la clave de tu Nequi, de Daviplata ni de tu banco', 'ni entramos a tu cuenta', 'nombres de otras personas',
     'tu salud, tu religión o tu política', 'Lo que anotamos de ellos', 'cuánto te entra al mes', 'ningún nombre de nadie',
     'solo quien dirige el negocio', 'mientras tengas cuenta', 'desde tu cuenta en la app', 'por el chat', 'se borran si se borra tu cuenta']
      .forEach(p => assert.ok(s.toLowerCase().indexOf(p.toLowerCase()) >= 0, 'la sección no dice «' + p + '»'));
    assert.equal(/no se guardan|no las guardamos/.test(s), false);
  });
  /* 13-nov-2026 (remate) — la primera versión de esta prueba FIJABA la frase
     falsa «ningún programa te pone una calificación de riesgo»: el Panel pone
     solo un «Riesgo (sugerido)» (riesgoCliente) y PlataChat contesta sola una
     solicitud vencida (resolver_vencidas). Ahora la prueba amarra el texto al
     código: si el código las tiene, la política las nombra; si alguien las
     quita, la prueba dice qué quitar de la política. */
  test('«no hacemos perfiles» dice la verdad: decide una persona, y nombra lo que se calcula solo (la garantía, la señal de riesgo del Panel y la propuesta sola de PlataChat)', () => {
    const para = visible(leer('legal/privacidad.html').split('<section id="para">')[1].split('</section>')[0]);
    assert.equal(/no los usamos para hacer perfiles/.test(para), false, 'sigue la frase de antes');
    assert.equal(/ningún programa te pone una calificación de riesgo/.test(visible(leer('legal/privacidad.html'))), false,
      'la política dice que ningún programa califica, y riesgoCliente lo hace');
    assert.match(para, /Quien decide si te prestamos es una persona, quien dirige el negocio/);
    assert.match(para, /Hay tres cosas que se calculan solas/);
    /* La señal de riesgo: existe en el CRM, con estas cuatro palabras y solo con prórrogas y mora. */
    const crm = leer('panel/crm.html');
    const i = crm.indexOf('function riesgoCliente(s){');
    assert.ok(i > 0, 'riesgoCliente ya no existe: quita «Una señal de riesgo» del punto 4 y de «Lo que cambió»');
    const riesgo = crm.slice(i, crm.indexOf('\n}', i));
    ['Nuevo', 'Bajo', 'Medio', 'Alto'].forEach(t => assert.match(riesgo, new RegExp("txt:'" + t + "'")));
    assert.deepEqual([...new Set(riesgo.match(/[A-Za-z]+(?=\()/g))].sort(),
      ['diasMora', 'estadoPrestamo', 'filter', 'if', 'riesgoCliente', 'some', 'totalProrrogasCliente'],
      'riesgoCliente mira algo más que las prórrogas y la mora: la política dice que no');
    assert.match(para, /Una señal de riesgo que el sistema con que manejamos el negocio le muestra a quien decide: nuevo, bajo, medio o alto, hecha solo con tus prórrogas y tus atrasos/);
    assert.match(para, /no decide sola, no cambia tu garantía ni tu cupo/);
    /* La propuesta sola de PlataChat: existe en la base, y aceptarla no desembolsa. */
    assert.match(leer('base/20261005_platachat_solicitud.sql'), /create or replace function public\.resolver_vencidas\(\)/);
    assert.match(para, /En PlataChat, la propuesta que sale sola si nadie contesta tu solicitud antes de la hora que te muestra la app/);
    assert.match(para, /Aceptarla no te entrega la plata: el desembolso lo hace una persona/);
    /* Y lo de «ningún programa» se queda donde es verdad. */
    assert.match(para, /Ninguna de esas tres cuentas lee tu historia laboral ni tus extractos: esos los mira una persona, y ningún programa los lee ni los califica/);
    assert.equal(/extracto|pension|historia/i.test(riesgo), false, 'la señal de riesgo lee la historia laboral o los extractos');
    assert.match(para, /Solo si nos das esa otra autorización aparte: mirar tus extractos/);
    /* «Lo que cambió» dice lo mismo, no la frase de antes. */
    const cambio = P.split('Lo que cambió el ' + PUBLICACION_EN_PALABRAS + ':')[1].split('Lo que cambió el')[0];
    assert.match(cambio, /te contamos las tres cosas que se calculan solas: tu garantía, una señal de riesgo hecha solo con tus prórrogas y tus atrasos, que no decide sola, y en PlataChat la propuesta que sale sola/);
  });
  test('los términos: los extractos tampoco suben la garantía prestada, y la app lo dice antes de que los dé', () => {
    assert.match(T, /Los extractos de tus cuentas, si nos los das, tampoco la cambian/);
    assert.match(T, /Lo que cambió el 19 de noviembre de 2026: Los extractos de tus cuentas \(Nequi, Daviplata o banco\), que en Tu Garantía \(PlataChat no los pide\) puedes darnos si no eres empleado, tampoco suben la garantía que te prestamos/);
    const datosKyc = leer('app/puente.js');
    assert.equal(/extracto/i.test(datosKyc.slice(datosKyc.indexOf('function datosKycDe'), datosKyc.indexOf('function datosKycDe') + 3000)), false,
      'los extractos entraron en la garantía prestada y los textos dicen que no');
  });
});

/* ======================================================================== */
describe('10 · el SQL: lo que se puede comprobar leyéndolo', () => {
  const SQL = leer('base/20261113c_los_extractos.sql');
  const codigo = SQL.replace(/--[^\n]*/g, '');
  test('va al final, y se para en su paso 0 si falta lo de antes', () => {
    const base = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort();
    assert.equal(base[base.length - 1], '20261113c_los_extractos.sql');
    const paso0 = codigo.slice(0, codigo.indexOf('end $$;') + 7);
    assert.match(paso0, /to_regprocedure\('public\.celular_del_equipo_de_sesion\(\)'\) is null[\s\S]*?raise exception/);
    assert.ok(codigo.indexOf('do $$') < codigo.search(/create (table|or replace function|index|trigger)/));
  });
  test('las tablas con RLS, cerradas y SIN políticas: nada se escribe sin pasar por las funciones', () => {
    ['extracto_autorizaciones', 'extracto_archivos'].forEach(t => {
      assert.match(codigo, new RegExp('alter table public\\.' + t + ' enable row level security;'));
      assert.match(codigo, new RegExp('revoke all on table public\\.' + t + ' from public, anon, authenticated;'));
    });
    assert.equal(/create policy/i.test(codigo), false, 'tiene una política: el cliente podría escribir directo');
    const fns = codigo.split(/create or replace function/i).slice(1);
    assert.equal(fns.length, 10);
    fns.forEach(f => {
      assert.match(f, /security definer/);
      assert.match(f, /set search_path = public/);
    });
  });
  test('no reescribe ninguna función que ya viva, ni nombra las tablas de la historia laboral dentro de una función', () => {
    const nombres = [...codigo.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
    nombres.forEach(n => assert.match(n, /^extracto_/, 'reescribe ' + n));
    const cuerpos = [...SQL.matchAll(/as \$\$([\s\S]*?)\$\$;/g)].map(m => m[1]).join('\n');
    assert.equal(/pension_archivos|pension_autorizaciones/.test(cuerpos), false, 'la comprobación 6 de 20261103 saldría en false');
  });
  test('el cortacircuito: 50 MB, después de «ya estaba» y antes de escribir; el resumen de Joan dice el mismo tope', () => {
    const subir = codigo.split(/create or replace function public\.extracto_subir/)[1].split(/create or replace function/)[0];
    const corte = subir.indexOf("if pg_total_relation_size('public.extracto_archivos') > 50 * 1024 * 1024 then");
    assert.ok(corte > 0);
    assert.match(subir.slice(corte), /^[^;]*then\s*return jsonb_build_object\('ok', false, 'motivo', 'lleno'\);/);
    assert.ok(corte < subir.indexOf('insert into public.extracto_archivos'));
    assert.ok(corte > subir.indexOf("'ya_estaba', true"));
    const resumen = codigo.split(/create or replace function public\.extracto_resumen/)[1].split(/create or replace function/)[0];
    assert.match(resumen, /'tope', 50 \* 1024 \* 1024/);
    /* Los topes por persona, los mismos de la pantalla. */
    assert.match(subir, /n_pdf >= 3\) or \(tipo <> 'pdf' and n_img >= 5\)/);
    assert.match(subir, /> 12582912/);
    assert.equal(EX.LIMITES.pdf, 3); assert.equal(EX.LIMITES.imagenes, 5); assert.equal(EX.LIMITES.totalBytes, 12582912);
  });
  test('el reparto de los 500 MB del encabezado es el de las migraciones, y la cuenta da', () => {
    const filas = [...SQL.matchAll(/^--\s+·\s+(\w+)\s+(\d+) MB\s+\((\d{8}[a-z]?|este archivo)/gm)].map(m => ({ tabla: m[1], mb: Number(m[2]), de: m[3] }));
    assert.deepEqual(filas.map(f => f.tabla).sort(),
      ['chat_fotos', 'extracto_archivos', 'fotos_equipo', 'pension_archivos', 'registro_archivos', 'registro_en_vivo']);
    const suma = filas.reduce((s, f) => s + f.mb, 0);
    assert.match(SQL, new RegExp('^--\\s+' + suma + ' MB de fotos; quedan ~' + (500 - suma) + ' MB', 'm'), 'la cuenta del reparto no da');
    filas.forEach(f => {
      const tope = "pg_total_relation_size('public." + f.tabla + "') > " + f.mb + ' * 1024 * 1024';
      const cual = f.de === 'este archivo' ? ['20261113c_los_extractos.sql']
        : fs.readdirSync(path.join(RAIZ, 'base')).filter(x => x.startsWith(f.de));
      /* registro_archivos vive en la rama registro-tope (20261028) hasta que se junte. */
      if (!cual.length && f.tabla === 'registro_archivos') return;
      assert.ok(cual.length, f.tabla + ': no existe la migración ' + f.de);
      assert.ok(cual.some(x => leer('base/' + x).replace(/''/g, "'").indexOf(tope) >= 0), f.tabla + ': el reparto dice ' + f.mb + ' MB y ' + cual.join(', ') + ' no lo pone');
    });
  });
  test('los permisos en dos tiempos, con nombre: revoke a public, anon y authenticated de las diez', () => {
    const revokes = [...codigo.matchAll(/revoke all on function public\.(extracto_\w+)\([^)]*\)\s+from public, anon, authenticated;/g)].map(m => m[1]);
    assert.equal(new Set(revokes).size, 10);
  });
  test('se borra con la cuenta (el disparador), y termina en la tabla que Joan ve; comprobar_… existe y solo mira', () => {
    assert.match(codigo, /create trigger extracto_al_borrar_la_cuenta after delete on auth\.users/);
    assert.match(codigo, /select 1 as n, '[^']+' as comprobacion,[\s\S]*order by 1;\s*$/);
    assert.equal((SQL.match(/^select \d+,/gm) || []).length + 1, 12);
    assert.match(codigo, /bool_and\(coalesce\(ok, false\)\) from extracto_prueba/);
    const C = leer('base/comprobar_20261113c_los_extractos.sql');
    assert.equal((C.match(/^select \d/gm) || []).length, 9);
    assert.equal(/\b(insert\s+into|update\s+public|delete\s+from|create\s|drop\s|alter\s|grant\s|revoke\s)/i.test(C.replace(/--[^\n]*/g, '')), false, 'comprobar cambia algo');
  });
});

/* ======================================================================== */
describe('11 · lo que se declara y lo que se precarga', () => {
  test('cumplimiento: los extractos declarados como información financiera, y se borran con la cuenta', () => {
    delete require.cache[require.resolve('../app/cumplimiento.js')];
    const K = require('../app/cumplimiento.js');
    const d = K.datosQueRecoge().find(x => x.id === 'extractos');
    assert.ok(d, 'los extractos no están en lo que se declara');
    assert.equal(d.categoria, 'Información financiera · Otra información financiera');
    assert.equal(d.obligatorio, false);
    assert.ok(K.datosQueRecoge().some(x => x.id === 'extractos_pantallazos'));
    assert.ok(K.BORRADO.se_borra.some(x => /extractos/.test(x)), 'el borrado de la cuenta no nombra los extractos');
  });
  test('«Tu autorización» de play/ y la ficha de Play dicen que los extractos son archivos que la persona escoge, y nunca la clave', () => {
    const P = B.abrir();
    B.mariaHastaElPermiso(P, false);
    assert.match(B.texto(B.cuerpo(P)), /Con tus extractos, igual: solo los que tú escojas, y nunca la clave de tu cuenta\./);
    assert.match(leer('PLAY-FICHA.md'), /Con tus extractos, igual: solo los que tú escojas, y nunca la clave de tu cuenta\./);
  });
  test('?v=145 en cada página que pide lo nuevo o lo cambiado, y la misma dirección en la precarga; CACHE no baja y la nota no trae número propio', () => {
    const SW = leer('sw.js');
    ['app/extractos.js?v=145', 'panel/extractos-crm.js?v=145', 'app/cumplimiento.js?v=145'].forEach(f =>
      assert.ok(SW.indexOf("'" + f + "'") >= 0, 'sw.js no precarga ' + f));
    assert.match(leer('play/index.html'), /<script src="\.\.\/app\/extractos\.js\?v=145"><\/script>/);
    assert.match(leer('app/socio.html'), /<script src="extractos\.js\?v=145"><\/script>/);
    assert.match(leer('panel/crm.html'), /<script src="extractos-crm\.js\?v=145"><\/script>/);
    assert.match(leer('play/borrar-cuenta.html'), /cumplimiento\.js\?v=145/);
    assert.equal(/cumplimiento\.js\?v=141/.test(leer('play/index.html') + leer('play/borrar-cuenta.html') + SW), false);
    /* La nota de los extractos va al final de las notas, sin número propio. */
    const nota = SW.lastIndexOf('TUS EXTRACTOS (rama v145-extractos');
    assert.ok(nota > 0 && nota < SW.indexOf("const CACHE = 'tugarantia-v"), 'la nota no está antes del CACHE');
    assert.ok(nota > SW.indexOf('13-nov-2026, v144'), 'la nota no va después de la de v144');
    /* 13-nov-2026 (remate) — decía «CACHE es v144», y eso se ponía en rojo justo
       al juntar con lote-v145, que es quien la sube a v145: el paso que sigue.
       Lo que de verdad importa de esta rama es que no la BAJE y que su nota no
       se invente un número propio (el número es el del lote con que sale). */
    const cache = Number((SW.match(/const CACHE = 'tugarantia-v(\d+)';/) || [])[1]);
    assert.ok(cache >= 144, 'CACHE bajó de v144: dice v' + cache);
    const cabeza = SW.slice(SW.lastIndexOf('/*', nota), nota);
    assert.equal(/\d{4}, v\d{3}\b/.test(cabeza), false, 'la nota de los extractos se puso número propio: «' + cabeza.trim() + '»');
  });
  test('los dos .js nuevos firman al llegar, primero que todo', () => {
    const FIRMA = '(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();';
    ['app/extractos.js', 'panel/extractos-crm.js'].forEach(f => {
      const t = leer(f).replace(/\r\n/g, '\n').replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, '');
      assert.ok(t.startsWith(FIRMA), f + ': su primer código no es la firma');
    });
  });
});
