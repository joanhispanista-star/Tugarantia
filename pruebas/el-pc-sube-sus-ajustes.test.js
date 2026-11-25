'use strict';
/* ==========================================================================
 * EL COMPUTADOR SUBE SOLAS SU CONFIGURACIÓN, SUS PLANTILLAS Y SU EQUIPO
 * 24 de noviembre de 2026 — «la prueba del PC» del plan (RECETA-PLAN-UN-SOLO-CRM.md)
 *
 *   node --test pruebas/el-pc-sube-sus-ajustes.test.js
 *
 * Hasta hoy esas tres solo llegaban a la nube cuando Joan tocaba ☁ Subir a
 * mano, y el CRM del celular mostraba las de la última vez: podían ser de hace
 * meses. Ahora suben solas (panel/nube-crm.js, CLAVES_DEL_PC), con una regla
 * distinta a la de todo lo demás: EL COMPUTADOR MANDA. No se congelan nunca,
 * porque un ajuste congelado no es de ningún cliente y frena la publicación del
 * equipo y los historiales de TODOS. Ante un choque se toma la revisión del
 * servidor y se reintenta.
 *
 * Lo que aquí se cuida:
 *   1 · suben, y el PIN no;
 *   2 · al emparejar con una nube vieja y distinta: no se congelan, no chocan,
 *       y queda lo del computador;
 *   3 · un cambio en el computador sube solo;
 *   4 · si otro navegador escribió primero: no se congela, se reintenta, y
 *       PUBLICAR NO SE FRENA;
 *   5 · con tope: si alguien escribe a la vez sin parar, no se queda dando vueltas;
 *   6 · lo demás sigue igual: una lista que solo suma y difiere SÍ se congela.
 * El banco es el de nube-crm (un servidor con la misma regla de revisiones del SQL).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../panel/nube.js');
const B = require('./banco-nube-crm.js');
const { servidor, montar, sembrar, cartera, congeladas, espejoDisco, leerDisco } = B;

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const TRES = ['config', 'plantillas', 'equipo'];
const ticks = async (n) => { for (let i = 0; i < (n || 6); i++) await new Promise(r => setImmediate(r)); };
const sinProto = v => JSON.parse(JSON.stringify(v));

/* Una cartera con las tres cosas que manda el computador. */
function carteraConTodo() {
  const db = cartera(2, 1);
  db.config = { pin: '4821', negocio: 'Tu Garantía', tasaUsuraEA: 27.5, ultimoRespaldo: '2026-11-20T10:00:00Z' };
  db.plantillas = { cobro: 'Hola {nombre}', mora: 'Te esperamos' };
  db.equipo = [{ id: 'E1', nombre: 'Asesora De Mentira', rol: 'asesor', estado: 'activo' }];
  return db;
}
/* Lo que subió, ajuste por ajuste, en todos los lotes que recibió el servidor. */
const subidos = (srv, clave) => srv.lotes.flatMap(l => (l.ajustes || []).filter(a => a.clave === clave));
/* Corre el reintento que la vuelta dejó programado (el banco guarda los relojes sin dispararlos). */
async function correrReintento(m) {
  const r = m.timers.filter(t => t.ms === m.C._puro.ESPERA_DEL_PC_MS).pop();
  assert.ok(r, 'la vuelta no dejó programado el reintento');
  m.timers.splice(m.timers.indexOf(r), 1);
  r.f();
  await ticks(12);
}

describe('1 · suben solas, y el PIN no', () => {
  test('la lista de lo que manda el computador es config, plantillas y equipo, y las tres están entre las que suben', () => {
    const m = montar({ db: carteraConTodo() });
    assert.deepEqual(sinProto(m.C._puro.CLAVES_DEL_PC), TRES);
    TRES.forEach(k => assert.ok(m.C._puro.CLAVES_QUE_SUBEN.indexOf(k) >= 0, k + ' no está entre las que suben'));
    ['gestiones', 'asignaciones', 'actosComision'].forEach(k => assert.ok(m.C._puro.CLAVES_QUE_SUBEN.indexOf(k) >= 0, k + ' dejó de subir'));
  });
  test('con la nube vacía: la primera subida las lleva; config va sin el PIN y sin la fecha del respaldo', async () => {
    const m = montar({ db: carteraConTodo() });
    const r = await sembrar(m);
    assert.equal(r.resultado.completa, true);
    assert.deepEqual(sinProto(m.srv.ajustes.plantillas.datos), { cobro: 'Hola {nombre}', mora: 'Te esperamos' });
    assert.equal(m.srv.ajustes.equipo.datos[0].nombre, 'Asesora De Mentira');
    const c = m.srv.ajustes.config.datos;
    assert.equal(c.tasaUsuraEA, 27.5);
    assert.equal(c.pin, undefined, 'el PIN subió a la nube');
    assert.equal(c.ultimoRespaldo, undefined, 'la fecha del respaldo, que es de este aparato, subió');
    assert.equal(/4821/.test(JSON.stringify(m.srv.lotes)), false, 'el PIN viajó en algún lote');
    /* Y en el computador el PIN sigue donde estaba. */
    assert.equal(leerDisco(m.alm).config.pin, '4821');
    assert.equal(m.srv.choquesTabla, 0);
    TRES.forEach(k => assert.equal(congeladas(m.alm)['ajustes|' + k], undefined));
  });
});

describe('2 · al emparejar con una nube vieja y distinta', () => {
  async function nubeDeAgosto() {
    const srv = servidor();
    const vieja = carteraConTodo();
    vieja.config = { pin: '0000', negocio: 'Tu Garantía', tasaUsuraEA: 25.0 };            // subida antes de v143: todavía con PIN
    vieja.plantillas = { cobro: 'Texto de agosto' };
    vieja.equipo = [{ id: 'E9', nombre: 'Asesor Que Ya No Está', rol: 'asesor', estado: 'activo' }];
    /* Como la dejó ☁ Subir a mano aquel día: las tres con su revisión 1. */
    await srv.empujar('computador', { socios: [], creditos: [], respaldados: [],
      ajustes: TRES.map(k => ({ clave: k, datos: vieja[k], revision_base: null })) });
    srv.lotes.length = 0;
    return srv;
  }
  test('no se congelan, no chocan en el servidor, y queda lo del computador', async () => {
    const srv = await nubeDeAgosto();
    const m = montar({ srv, db: carteraConTodo() });
    const r = await sembrar(m);
    assert.equal(r.resultado.completa, true);
    TRES.forEach(k => assert.equal(congeladas(m.alm)['ajustes|' + k], undefined, k + ' quedó en discusión: eso frena la publicación de todos'));
    assert.equal(srv.choquesTabla, 0, 'subió contra una revisión que no era: el servidor anotó un choque');
    assert.equal(srv.ajustes.config.datos.tasaUsuraEA, 27.5, 'la tasa de la nube sigue siendo la de agosto');
    assert.equal(srv.ajustes.config.datos.pin, undefined, 'el PIN viejo se quedó en la nube');
    assert.deepEqual(sinProto(srv.ajustes.plantillas.datos), { cobro: 'Hola {nombre}', mora: 'Te esperamos' });
    assert.deepEqual(srv.ajustes.equipo.datos.map(p => p.id), ['E1'], 'el equipo de la nube no es el del computador');
    TRES.forEach(k => assert.equal(srv.ajustes[k].revision, 2, k + ' no subió con la revisión que tenía la nube'));
    /* Y el espejo quedó diciendo lo que hay: la vuelta siguiente no manda nada. */
    const antes = srv.lotes.length;
    await m.C.vuelta(true); await ticks();
    assert.equal(srv.lotes.length, antes, 'volvió a subir lo que ya estaba arriba');
  });
  test('si lo único distinto de config es el PIN de este aparato, es LA MISMA: se adopta y no se sube', async () => {
    const srv = servidor();
    const db = carteraConTodo();
    await srv.empujar('computador', { socios: [], creditos: [], respaldados: [],
      ajustes: [{ clave: 'config', datos: N.configQueViaja(db.config), revision_base: null }] });
    srv.lotes.length = 0;
    const m = montar({ srv, db });
    await sembrar(m);
    assert.equal(subidos(srv, 'config').length, 0, 'config subió otra vez siendo la misma');
    assert.equal(srv.ajustes.config.revision, 1);
    assert.equal(congeladas(m.alm)['ajustes|config'], undefined, 'config quedó en discusión solo por el PIN del aparato');
    assert.equal(espejoDisco(m.alm).ajustes.config.revision, 1);
  });
  test('lo puro: calcularEmparejo las separa de las que se discuten', () => {
    const m = montar({ db: carteraConTodo() });
    const db = carteraConTodo();
    db.asignaciones = [{ socio_id: 'C0', asesor_id: 'E1', desde: '2026-09-01' }];
    const paquete = { completo: true, socios: [], creditos: [], respaldados: [], ajustes: [
      { clave: 'plantillas', datos: { cobro: 'otra' }, revision: 7 },
      { clave: 'asignaciones', datos: [{ socio_id: 'C5', asesor_id: 'E2', desde: '2026-10-01' }], revision: 3 }] };
    const r = m.C._puro.calcularEmparejo(db, paquete, N.espejoVacio());
    assert.deepEqual(sinProto(r.ajustesDelPc), ['plantillas']);
    assert.equal(r.espejo.ajustes.plantillas.revision, 7);
    assert.equal(r.espejo.ajustes.plantillas.json, N.jsonCanonico({ cobro: 'otra' }), 'el espejo tiene que decir lo que la NUBE tiene, para que lo de acá suba');
    assert.ok(sinProto(r.congelar).some(x => x.tabla === 'ajustes' && x.id === 'asignaciones'), 'una lista que solo suma y difiere dejó de congelarse');
    assert.equal(sinProto(r.congelar).some(x => x.id === 'plantillas'), false);
    /* Y `config` se compara como VIAJA: si lo único distinto es el PIN de este aparato, es la misma
       (va con las adoptadas, no con las que hay que subir). */
    const igualSalvoElPin = { completo: true, socios: [], creditos: [], respaldados: [], ajustes: [
      { clave: 'config', datos: N.configQueViaja(db.config), revision: 4 }] };
    const r2 = m.C._puro.calcularEmparejo(db, igualSalvoElPin, N.espejoVacio());
    assert.deepEqual(sinProto(r2.ajustesAdoptados), ['config'], 'el PIN del aparato hizo que config pareciera distinta');
    assert.deepEqual(sinProto(r2.ajustesDelPc), []);
  });
});

describe('3 · un cambio en el computador sube solo', () => {
  test('cambiar una plantilla, la tasa o el equipo: sube en la vuelta siguiente, solo lo que cambió', async () => {
    const m = montar({ db: carteraConTodo() });
    await sembrar(m);
    const db = leerDisco(m.alm);
    db.plantillas.cobro = 'Hola {nombre}, te escribo de Tu Garantía';
    m.tab.guardar(db);
    const antes = m.srv.lotes.length;
    await m.C.vuelta(true); await ticks();
    const lote = m.srv.lotes.slice(antes).flatMap(l => l.ajustes || []);
    assert.deepEqual(lote.map(a => a.clave), ['plantillas'], 'subió algo que no cambió, o no subió la plantilla');
    assert.equal(m.srv.ajustes.plantillas.datos.cobro, 'Hola {nombre}, te escribo de Tu Garantía');
    assert.equal(m.srv.choquesTabla, 0);
  });
  test('cambiar solo el PIN no sube nada: es de este aparato', async () => {
    const m = montar({ db: carteraConTodo() });
    await sembrar(m);
    const db = leerDisco(m.alm);
    db.config.pin = '7777';
    m.tab.guardar(db);
    const antes = m.srv.lotes.length;
    await m.C.vuelta(true); await ticks();
    assert.equal(m.srv.lotes.slice(antes).flatMap(l => l.ajustes || []).length, 0, 'cambiar el PIN mandó config a la nube');
    assert.equal(/7777/.test(JSON.stringify(m.srv.lotes)), false);
  });
});

describe('4 · si otro navegador escribió primero: no se congela, se reintenta, y publicar no se frena', () => {
  async function conChoque() {
    const m = montar({ db: carteraConTodo() });
    await sembrar(m);
    /* Alguien hizo ☁ Subir desde otro navegador: la nube va una revisión por delante. */
    m.srv.ajustes.plantillas.datos = { cobro: 'Lo que subió el otro navegador' };
    m.srv.ajustes.plantillas.revision++;
    m.srv.ajustes.plantillas.actualizado_por = 'computador';
    const db = leerDisco(m.alm);
    db.plantillas.cobro = 'Lo que Joan acaba de escribir aquí';
    m.tab.guardar(db);
    const r = await m.C.vuelta(true); await ticks();
    return { m, r };
  }
  test('el choque no deja nada en discusión ni en la lista de ☁ Subir, y la vuelta sigue completa', async () => {
    const { m, r } = await conChoque();
    assert.equal(r.resultado.completa, true, 'un choque en las plantillas cortó la vuelta');
    assert.equal(r.resultado.choques, 0, 'se contó como una discusión');
    assert.equal(r.resultado.delPc, 1);
    assert.equal(congeladas(m.alm)['ajustes|plantillas'], undefined, 'las plantillas quedaron congeladas');
    assert.equal(N.leerChoques().some(c => c.tabla === 'ajustes'), false, 'el choque fue a la lista de ☁ Subir, paso 7');
    /* El espejo quedó con la revisión del servidor y con LO DEL SERVIDOR: lo de acá todavía no está arriba. */
    const e = espejoDisco(m.alm).ajustes.plantillas;
    assert.equal(e.revision, m.srv.ajustes.plantillas.revision);
    assert.equal(e.json, N.jsonCanonico({ cobro: 'Lo que subió el otro navegador' }));
  });
  test('PUBLICAR NO SE FRENA: el libro por cliente sigue al día, sin ningún «sin cliente»', async () => {
    const { m } = await conChoque();
    const porCliente = sinProto(m.C.libroPorCliente());
    assert.equal(Number(porCliente.sinCliente) || 0, 0, 'un ajuste del computador dejó a todos los clientes esperando');
    assert.notEqual(porCliente.motivo, 'en-discusion');
    assert.notEqual(sinProto(m.C.libroAlDia()).motivo, 'en-discusion');
  });
  test('el reintento sale enseguida (2 s, no los 90 de siempre) y deja arriba lo del computador', async () => {
    const { m } = await conChoque();
    await correrReintento(m);
    assert.equal(m.srv.ajustes.plantillas.datos.cobro, 'Lo que Joan acaba de escribir aquí', 'el computador no ganó');
    assert.equal(congeladas(m.alm)['ajustes|plantillas'], undefined);
    assert.equal(espejoDisco(m.alm).ajustes.plantillas.json, N.jsonCanonico(leerDisco(m.alm).plantillas));
    /* Y ahí para: no quedó otro reintento esperando. */
    assert.equal(m.timers.filter(t => t.ms === m.C._puro.ESPERA_DEL_PC_MS).length, 0, 'siguió reintentando después de haber subido');
  });
  test('un espejo sin esa entrada (un PC emparejado antes de hoy) hace lo mismo: choca una vez y sube', async () => {
    const m = montar({ db: carteraConTodo() });
    await sembrar(m);
    const esp = espejoDisco(m.alm);
    delete esp.ajustes.equipo;
    m.alm.setItem(B.ESPEJO, JSON.stringify(esp));
    const db = leerDisco(m.alm);
    db.equipo.push({ id: 'E2', nombre: 'Asesor Nuevo De Mentira', rol: 'asesor', estado: 'activo' });
    m.tab.guardar(db);
    const r = await m.C.vuelta(true); await ticks();
    assert.equal(r.resultado.delPc, 1);
    assert.equal(congeladas(m.alm)['ajustes|equipo'], undefined);
    await correrReintento(m);
    assert.deepEqual(m.srv.ajustes.equipo.datos.map(p => p.id), ['E1', 'E2']);
  });
});

describe('5 · con tope: si alguien escribe a la vez sin parar, no se queda dando vueltas', () => {
  test('a lo más tres reintentos seguidos; después espera al próximo cambio, y sigue sin congelar', async () => {
    const m = montar({ db: carteraConTodo() });
    await sembrar(m);
    /* Un servidor en el que otro aparato se adelanta SIEMPRE: cada vez que el computador va a subir, ya cambió. */
    const empujar = m.srv.empujar;
    m.srv.empujar = function (disp, lote) {
      if ((lote.ajustes || []).some(a => a.clave === 'plantillas')) { m.srv.ajustes.plantillas.revision++; }
      return empujar.call(m.srv, disp, lote);
    };
    const db = leerDisco(m.alm);
    db.plantillas.cobro = 'Lo de acá';
    m.tab.guardar(db);
    await m.C.vuelta(true); await ticks();
    let reintentos = 0;
    while (m.timers.some(t => t.ms === m.C._puro.ESPERA_DEL_PC_MS) && reintentos < 10) { await correrReintento(m); reintentos++; }
    assert.equal(reintentos, m.C._puro.REINTENTOS_DEL_PC, 'no respetó el tope de reintentos seguidos');
    assert.equal(congeladas(m.alm)['ajustes|plantillas'], undefined, 'al rendirse, congeló');
    /* Cuando el otro deja de escribir, el próximo intento sube. */
    m.srv.empujar = empujar;
    await m.C.vuelta(true); await ticks();
    assert.equal(m.srv.ajustes.plantillas.datos.cobro, 'Lo de acá');
  });
});

describe('6 · lo demás sigue igual', () => {
  test('una lista que solo suma (asignaciones) y difiere al emparejar SÍ se congela: no es del computador solo', async () => {
    const srv = servidor();
    const db = carteraConTodo();
    await srv.empujar('computador', N.armarLote(db, N.espejoVacio(), { claves: ['asignaciones'], marcarBorrados: false }));
    srv.ajustes.asignaciones.datos = srv.ajustes.asignaciones.datos.concat([{ socio_id: 'C9', asesor_id: 'E2', desde: '2026-10-01' }]);
    srv.ajustes.asignaciones.revision++;
    const m = montar({ srv, db });
    await sembrar(m);
    assert.ok(congeladas(m.alm)['ajustes|asignaciones'], 'la lista del celular se habría pisado');
    assert.equal(srv.ajustes.asignaciones.datos.length, 2);
  });
  test('un choque en una FICHA sigue yendo a discusión, como siempre', async () => {
    const m = montar({ db: carteraConTodo() });
    await sembrar(m);
    m.srv.celular('socios', 'C0', d => { d.telefono2 = '3009990000'; });
    const db = leerDisco(m.alm);
    db.socios[0].notaRiesgo = 'cambio de acá';
    m.tab.guardar(db);
    const r = await m.C.vuelta(true); await ticks();
    assert.equal(r.resultado.choques, 1);
    assert.ok(congeladas(m.alm)['socios|C0']);
  });
  test('los textos ya no dicen que las plantillas no suben solas', () => {
    const cinta = LEER('panel/nube-crm.js');
    assert.match(cinta, /La configuración \(la tasa, sin el PIN\), las plantillas y el equipo sí suben solos/);
    assert.equal(/la configuración \(tasa, PIN\), ' \+\s+'las plantillas ni/.test(cinta), false);
    const espejo = LEER('panel/espejo.html').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.equal(/no suben solas|las plantillas no\)/.test(espejo), false, 'el Panel en el bolsillo sigue diciendo que las plantillas no suben solas');
    assert.match(espejo, /suben solas cuando abres el CRM allá/);
  });
});
