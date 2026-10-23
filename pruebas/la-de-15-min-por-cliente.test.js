'use strict';
/* ============================================================================
 * LA DE 15 MIN, CLIENTE POR CLIENTE — 22 de octubre de 2026
 *
 *   node --test pruebas/la-de-15-min-por-cliente.test.js
 *
 * El hallazgo de la lente «nube» que sobrevivió a dos refutadores (sobre
 * fe35f8c): la publicación sola del equipo (cada 15 min) preguntaba si la
 * cartera estaba al día con la nube y era de TODO O NADA. Joan cobra un abono
 * de C1 desde el celular (queda en la nube; el computador no baja nada) y en
 * la tarde marca en el computador que C0 pagó todo: la vuelta veía «la nube
 * tiene 1 ficha más nueva» (la de C1) y no publicaba nada. El asesor le
 * seguía cobrando a C0 un crédito pagado, con «los montos son de hoy» encima.
 * Los refutadores midieron que era más ancho: lo mismo con UNA ficha en
 * discusión (un choque celular-computador), con un SALIR marcado en el
 * computador, y la línea de Equipo decía algo que no era cierto.
 *
 * Ahora se publica cliente por cliente: los de las fichas atrás no viajan (se
 * quedan con lo último que se publicó y su fecha), y todos los demás sí. Se
 * prueba con el NubeCRM de verdad, su servidor con las reglas del SQL
 * (banco-nube-crm) y crm.html de verdad (banco-panel). Base: los scripts de
 * los refutadores (pago-pc-no-llega.js y refuta-pago-misma-sesion.js).
 * Cada prueba de este archivo falla contra fe35f8c.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');
const N = require('../panel/nube.js');
const { crear } = require('../panel/nube-crm.js');

const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 30); i++) await tick(); }
const clon = v => JSON.parse(JSON.stringify(v));
const sinProto = v => JSON.parse(JSON.stringify(v));
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PEDRO = '3000000001', ANA = '3000000003';

/* La cartera de Joan: C0 (P0, 100.000), C1 (P1, 200.000) y C2 (P2, 300.000).
   Pedro lleva a C0 y a C1; Ana, a C2. */
function carteraTres() {
  const db = B.cartera(3, 1);
  db.prestamos.forEach(p => { p.fechaDesembolso = '2026-10-01'; p.cicloActual = '2026-10-30'; p.comprobantes = []; });
  db.equipo = [{ id: 'a1', nombre: 'PEDRO', rol: 'asesor', estado: 'activo', celular: PEDRO },
               { id: 'a2', nombre: 'ANA', rol: 'asesor', estado: 'activo', celular: ANA }];
  db.asignaciones = [{ id: 'A1', socio_id: 'C0', asesor_id: 'a1', desde: '2026-10-01' },
                     { id: 'A2', socio_id: 'C1', asesor_id: 'a1', desde: '2026-10-01' },
                     { id: 'A3', socio_id: 'C2', asesor_id: 'a2', desde: '2026-10-01' }];
  db.prospectos = []; db.gestiones = [];
  return db;
}
/* crm.html de verdad con esa cartera, preguntándole a un NubeCRM REAL. Lo que
   publica queda en _pub (los argumentos de equipo_publicar tal cual). */
function panelCon(C, db, almacenPrevio) {
  const P = abrirPanel();
  if (almacenPrevio) Object.keys(almacenPrevio).forEach(k => { if (/^tg_equipo/.test(k)) P.almacen[k] = almacenPrevio[k]; });
  P.cargarCartera(clon(db));
  P.ev('_selloDesdeDisco(false)');
  P.ctx._C = C;
  P.ev(`
    var _pub = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    estoyOcupado = function () { return false; };
    window.NubeCRM = _C;
    rpc = function (fn, args) {
      if (fn === 'equipo_traer') return Promise.resolve({ equipo: [
        { celular: '${PEDRO}', nombre: 'PEDRO', rol: 'asesor', estado: 'activo', jefe: null },
        { celular: '${ANA}', nombre: 'ANA', rol: 'asesor', estado: 'activo', jefe: null }], asignaciones: [], contactos: [] });
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') { _pub.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
  `);
  return P;
}
const fila = (pub, id) => (pub.p_gente || []).find(x => x.id === id);
const persona = (pub, cel) => (pub.p_equipo || []).find(x => x.celular === cel);
const sesionNueva = m => B.montar({ alm: m.alm, srv: m.srv, tab: m.tab });

/* La mañana del hallazgo: emparejado, al día y publicado. Después el celular
   cobra un abono de C1 y, en el computador, Joan hace `enElPc` (por defecto,
   marcar P0 pagado) y la cartera sube sola. */
async function laTarde(enElPc) {
  const m = B.montar({ db: carteraTres() });
  await B.sembrar(m); await ticks();
  const P = panelCon(m.C, B.leerDisco(m.alm));
  assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado', 'precondición: la mañana publica');
  await ticks();
  assert.equal(fila(P.ctx._pub[0], 'C0').saldo, '120000', 'precondición: Pedro ve a C0 debiendo');

  m.srv.celular('creditos', 'P1', d => { d.abonosCapital = [{ fecha: '2026-10-20', monto: 50000 }]; });

  const db = B.leerDisco(m.alm);
  (enElPc || (d => { const p0 = d.prestamos.find(p => p.id === 'P0'); p0.pagado = true; p0.fechaPagado = '2026-10-22'; }))(db);
  m.tab.guardar(db);
  await m.C.vuelta(false); await ticks();
  return { m, P };
}

describe('1 · el hallazgo: lo que Joan marca en el computador le llega al asesor aunque el celular tenga algo de otro cliente', () => {

  test('C0 pagado en el computador y un abono de C1 en el celular: la de 15 min publica C0 sin deuda, no toca a C1, y lo dice', async () => {
    const { m, P } = await laTarde();
    assert.equal(m.srv.creditos.P0.datos.pagado, true, 'precondición: la nube tiene P0 pagado');

    /* 15 min después, en otra sesión de la pieza (el «sí» de 5 min ya venció). */
    const v = sesionNueva(m);
    const P2 = panelCon(v.C, B.leerDisco(m.alm), P.almacen);
    const r = await P2.ev('publicarEquipoSolo()');
    await ticks();
    assert.equal(r, 'publicado_en_parte', 'la vuelta de 15 min no publicó nada por UNA ficha de otro cliente');
    assert.equal(P2.ctx._pub.length, 1);
    const pub = P2.ctx._pub[0];
    const c0 = fila(pub, 'C0');
    assert.ok(c0, 'C0 no viajó: el asesor le sigue cobrando un crédito pagado');
    assert.equal(c0.saldo, '');
    assert.equal(c0.creditos, '');
    assert.equal(c0.etapa, 'PAGADO');
    assert.equal(fila(pub, 'C1'), undefined, 'C1 viajó con la cifra de este computador, que no tiene el abono del celular');
    assert.equal(fila(pub, 'C2').saldo, '360000', 'el cliente que nadie tocó no viajó');

    /* Las cuentas de quien lleva a C1 (Pedro) no viajan: se calcularían sin
       el abono. Las de Ana, que no lleva a nadie atrás, sí. */
    assert.equal(persona(pub, PEDRO), undefined, 'las cuentas de Pedro viajaron calculadas sin el abono de C1');
    assert.ok(persona(pub, ANA) && 'com_libre' in persona(pub, ANA), 'las cuentas de Ana no viajaron');

    /* La línea de Equipo dice quién quedó fuera, por qué y qué hacer. */
    const linea = plano(P2.elems.equipoPublicadoSolo.innerHTML);
    assert.match(linea, /menos 1 cliente/);
    assert.match(linea, /Socio 1/);
    assert.match(linea, /la nube tiene de ese cliente algo más nuevo/);
    assert.match(P2.elems.equipoPublicadoSolo.innerHTML, /☁ Subir<\/a> \(paso 6/);
    assert.doesNotMatch(linea, /no se publica sola/);
    const pieza = sinProto(P2.ev('piezaNubeEquipo(Date.now())'));
    assert.equal(pieza.normal, false, 'la ☁ común siguió diciendo que todo sube solo');
    assert.equal(pieza.clase, 'ojo');
    assert.match(pieza.l1, /1 cliente de tu equipo no se refresca/);

    /* Con alguien fuera la huella no se anota: la vuelta siguiente vuelve a
       mirar (no «sin cambios»). */
    const x = sinProto(P2.ev('leerPublicadoSolo()'));
    assert.equal(x.huella, '');
    assert.deepEqual(x.fuera, [{ id: 'C1', por: 'nube-mas-nueva' }]);
    assert.equal(await P2.ev('publicarEquipoSolo()'), 'publicado_en_parte', 'la vuelta siguiente dijo «sin cambios» con C1 fuera');
    assert.equal(P2.ctx._pub.length, 2);
  });

  test('una persona que Joan cambió y aún no subió (una marca) sí viaja, pero sin cuentas', async () => {
    const { m, P } = await laTarde();
    const v = sesionNueva(m);
    const P2 = panelCon(v.C, B.leerDisco(m.alm), P.almacen);
    P2.ev(`escribirEquipoPorPublicar({ a1: { t: 'marca-1', campos: { estado: 'activo' } } })`);
    assert.equal(await P2.ev('publicarEquipoSolo()'), 'publicado_en_parte');
    const pedro = persona(P2.ctx._pub[0], PEDRO);
    assert.ok(pedro, 'el cambio de Joan a Pedro no viajó');
    assert.equal('com_libre' in pedro, false, 'viajaron las cuentas de Pedro calculadas sin el abono de C1');
    assert.equal(P2.ev('JSON.stringify(leerEquipoPorPublicar())'), '{}', 'la marca no se soltó y eso que viajó');
  });
});

describe('2 · lo que los refutadores midieron más ancho', () => {

  test('UNA ficha en discusión (un choque entre el celular y el computador) tampoco frena a los demás', async () => {
    const { m, P } = await laTarde(d => {
      d.prestamos.find(p => p.id === 'P0').pagado = true;
      d.prestamos.find(p => p.id === 'P1').cicloActual = '2026-11-14';   // el computador también tocó P1
    });
    assert.ok(B.congeladas(m.alm)['creditos|P1'], 'precondición: P1 quedó en discusión');
    assert.equal(sinProto(m.C.libroAlDia()).motivo, 'en-discusion');
    const v = sesionNueva(m);
    const P2 = panelCon(v.C, B.leerDisco(m.alm), P.almacen);
    assert.equal(await P2.ev('publicarEquipoSolo()'), 'publicado_en_parte', 'una ficha en discusión frenó la cartera entera');
    const pub = P2.ctx._pub[0];
    assert.equal(fila(pub, 'C0').creditos, '', 'el pago de C0 no llegó');
    assert.equal(fila(pub, 'C1'), undefined, 'C1 viajó con la cifra en discusión');
    assert.deepEqual(sinProto(P2.ev('leerPublicadoSolo()')).fuera, [{ id: 'C1', por: 'en-discusion' }]);
    const linea = P2.elems.equipoPublicadoSolo.innerHTML;
    assert.match(plano(linea), /tiene una ficha en discusión con la nube/);
    assert.match(linea, /☁ Subir<\/a> \(paso 7\)/, 'no dice dónde se decide');
  });

  test('el SALIR que Joan marca en el computador llega: el de un cliente al día, y el de uno atrás (sin tocarle la plata)', async () => {
    const { m, P } = await laTarde(d => {
      d.socios.find(s => s.id === 'C0').noSMS = true;
      d.socios.find(s => s.id === 'C1').noSMS = true;
    });
    const v = sesionNueva(m);
    const P2 = panelCon(v.C, B.leerDisco(m.alm), P.almacen);
    assert.equal(await P2.ev('publicarEquipoSolo()'), 'publicado_en_parte');
    const pub = P2.ctx._pub[0];
    assert.equal(fila(pub, 'C0').no_sms, 'true', 'el SALIR de C0 no le llegó al asesor');
    const c1 = fila(pub, 'C1');
    assert.ok(c1, 'el SALIR de C1 no viajó porque su ficha está atrás');
    assert.equal(c1.no_sms, 'true');
    /* La plata vacía: el servidor la lee como «no lo sé» y conserva la última
       (coalesce). La de este computador no tiene el abono del celular. */
    assert.deepEqual([c1.saldo, c1.saldo_total, c1.fecha_pago, c1.creditos], ['', '', '', '']);
    assert.deepEqual(sinProto(P2.ev('leerPublicadoSolo()')).fuera, [{ id: 'C1', por: 'nube-mas-nueva', salir: true }]);
    assert.match(plano(P2.elems.equipoPublicadoSolo.innerHTML), /sí le publiqué el SALIR/);
  });

  test('si TODOS los clientes que viajan están atrás y nadie pidió SALIR, no publica nada, y la línea ya no dice «montos viejos»', async () => {
    const { m, P } = await laTarde(d => { d.asignaciones = d.asignaciones.filter(a => a.socio_id === 'C1'); });
    const v = sesionNueva(m);
    const P2 = panelCon(v.C, B.leerDisco(m.alm), P.almacen);
    assert.equal(await P2.ev('publicarEquipoSolo()'), 'cartera_no_al_dia');
    assert.equal(P2.ctx._pub.length, 0);
    const linea = plano(P2.elems.equipoPublicadoSolo.innerHTML);
    assert.match(linea, /la nube tiene 1 ficha más nueva que esta cartera/);
    assert.doesNotMatch(linea, /montos viejos/, 'la frase de fe35f8c: lo que tiene el gerente es más viejo todavía');
    assert.match(linea, /no lo incluye/);
  });
});

describe('3 · la MISMA sesión, con reloj: el permiso para los demás vale 5 min, no 15', () => {

  /* Un NubeCRM con un reloj que avanza de verdad y sus temporizadores a mano
     (refuta-pago-misma-sesion.js, de los refutadores). */
  function montarConReloj(db) {
    const reloj = { t: Date.UTC(2026, 9, 22, 18, 0, 0) };   // 13:00 en Bogotá
    const alm = B.almacenDoble();
    globalThis.localStorage = alm;
    const srv = B.servidor();
    const tab = B.pestana(alm, 'A');
    tab.guardar(db);
    const timers = [];
    const vent = { confirmar: true, confirmes: [], addEventListener() {}, confirm(t) { vent.confirmes.push(t); return true; }, openModal() {}, cerrarModal() {} };
    const C = crear({
      nube: N, almacen: alm, puente: require('../app/puente.js'),
      red: { conectado: () => true, traer: d => srv.traer(d), empujar: (d, l) => srv.empujar(d, l), sembrarContador: (k, v) => srv.sembrarContador(k, v) },
      ahora: () => reloj.t,
      programar: (f, ms) => { timers.push({ f, ms, vivo: true }); return timers.length; },
      desprogramar(id) { if (id && timers[id - 1]) timers[id - 1].vivo = false; }, cadaRato: () => 0,
      ventana: vent, documento: null, enLinea: () => true
    });
    C.configurar(Object.assign({ barra: { innerHTML: '' } }, tab.cfg));
    return { C, alm, srv, tab, timers, reloj };
  }
  async function correrTemporizadores(m) {
    for (const t of m.timers.filter(x => x.vivo)) { t.vivo = false; try { await t.f(); } catch (e) { /* lo dice la prueba */ } }
    await ticks(80);
  }
  /* Lo que hace guardar() de crm.html: escribe, avisa, y a los 90 s de quietud sube. */
  async function guardarYSubir(m, P) {
    m.tab.guardar(clon(P.ev('DB')));
    m.C.algoCambio();
    m.reloj.t += 95 * 1000;
    await correrTemporizadores(m);
  }

  test('un abono que el celular cobra DESPUÉS de la comparación no sale con la cifra vieja diez minutos más tarde', async () => {
    const P0 = abrirPanel(); P0.cargarCartera(carteraTres()); P0.ev('guardar()');
    const m = montarConReloj(clon(P0.ev('DB')));
    await m.C.emparejar(); await m.C.confirmarEmparejar(); await ticks();
    const P = panelCon(m.C, B.leerDisco(m.alm));
    P.ev('guardar()');
    await guardarYSubir(m, P);
    assert.equal(Object.keys(B.congeladas(m.alm)).length, 0, 'precondición: sin discusión');

    /* 13:00 — al día: publica todo. */
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    /* 13:20 — el celular cobra un abono de C1. */
    m.reloj.t += 20 * 60000;
    m.srv.celular('creditos', 'P1', d => { d.abonosCapital = [{ fecha: '2026-10-22', monto: 50000 }]; });
    /* 14:00 — Joan marca P0 pagado en crm.html y sube solo. */
    m.reloj.t += 40 * 60000;
    P.ev(`(function(){ var p = DB.prestamos.find(function(x){return x.id==='P0';}); p.pagado = true; p.fechaPagado = '2026-10-22'; guardar(); })()`);
    await guardarYSubir(m, P);
    assert.equal(m.srv.creditos.P0.datos.pagado, true, 'precondición: la nube tiene P0 pagado');

    /* 14:15 — la de 15 min: C0 sale pagado, C1 se queda fuera. */
    m.reloj.t += 14 * 60000;
    let n0 = P.ctx._pub.length;
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado_en_parte', 'en la misma sesión tampoco llegó el pago de C0');
    let pub = P.ctx._pub[n0];
    assert.equal(fila(pub, 'C0').creditos, '');
    assert.equal(fila(pub, 'C1'), undefined);
    assert.equal(fila(pub, 'C2').saldo, '360000');

    /* 14:17 — el celular cobra ahora en C2. 14:25 — otra vuelta (el reintento
       de Joan, o la de 15 min de otra pestaña): la comparación de las 14:15
       tiene 10 min. Para libroAlDia un «la nube tiene más» vale 15 min, y
       aquí es el permiso para publicar a C2: tiene que comparar otra vez. */
    m.reloj.t += 2 * 60000;
    m.srv.celular('creditos', 'P2', d => { d.abonosCapital = [{ fecha: '2026-10-22', monto: 100000 }]; });
    m.reloj.t += 8 * 60000;
    n0 = P.ctx._pub.length;
    assert.equal(await P.ev('reintentarEquipoYa()'), 'publicado_en_parte');
    pub = P.ctx._pub[n0];
    assert.equal(fila(pub, 'C2'), undefined, 'C2 salió con la cifra de antes del abono que el celular cobró a las 14:17');
    assert.equal(fila(pub, 'C1'), undefined);
    assert.equal(fila(pub, 'C0').creditos, '');
    assert.deepEqual(sinProto(P.ev('leerPublicadoSolo()')).fuera.map(f => f.id).sort(), ['C1', 'C2']);
    assert.equal(persona(pub, ANA), undefined, 'las cuentas de Ana viajaron sin el abono de C2');
  });
});

describe('4 · cuando Joan junta, vuelve a salir entero', () => {

  test('juntado lo del celular (espejo al día con la nube), la vuelta siguiente publica a todos y anota la huella', async () => {
    const { m, P } = await laTarde();
    const v = sesionNueva(m);
    const P2 = panelCon(v.C, B.leerDisco(m.alm), P.almacen);
    assert.equal(await P2.ev('publicarEquipoSolo()'), 'publicado_en_parte', 'precondición: C1 se quedó fuera');

    /* Lo que hace ☁ Subir, paso 6 («Aplicar»): la cartera toma la ficha de la
       nube y el espejo avanza a su revisión. */
    const allá = (await m.srv.traer()).creditos.find(f => f.id === 'P1');
    const db = B.leerDisco(m.alm);
    db.prestamos[db.prestamos.findIndex(p => p.id === 'P1')] = clon(allá.datos);
    m.tab.guardar(db);
    const esp = B.espejoDisco(m.alm);
    esp.creditos.P1 = { revision: allá.revision, json: N.jsonCanonico(allá.datos), borrado: false,
                        actualizado_en: allá.actualizado_en || null, actualizado_por: allá.actualizado_por || null };
    m.alm.setItem(B.ESPEJO, JSON.stringify(esp));

    const P3 = panelCon(v.C, B.leerDisco(m.alm), P2.almacen);
    assert.equal(await P3.ev('publicarEquipoSolo()'), 'publicado', 'juntado, siguió dejando a C1 fuera');
    const pub = P3.ctx._pub[0];
    assert.ok(fila(pub, 'C1'), 'C1 no viajó');
    assert.notEqual(fila(pub, 'C1').saldo, '240000', 'C1 viajó sin el abono que se juntó');
    assert.ok(persona(pub, PEDRO) && 'com_libre' in persona(pub, PEDRO), 'las cuentas de Pedro no volvieron a viajar');
    const x = sinProto(P3.ev('leerPublicadoSolo()'));
    assert.notEqual(x.huella, '', 'entera, la huella no se anotó');
    assert.equal(x.fuera, undefined);
    assert.match(plano(P3.elems.equipoPublicadoSolo.innerHTML), /se publica sola/);
    assert.equal(sinProto(P3.ev('piezaNubeEquipo(Date.now())')).normal, true);
    assert.equal(await P3.ev('publicarEquipoSolo()'), 'sin_cambios');
  });
});

describe('5 · lo que no se adivina', () => {

  test('la publicación pide la respuesta por cliente; sin saber de quién es lo que falta (o con un nube-crm.js viejo), no publica nada', async () => {
    const respuestas = [
      { ok: false, motivo: 'en-discusion', congeladas: 1, clientes: { C1: { enDiscusion: true } }, sinCliente: 1 },
      { ok: false, motivo: 'nube-mas-nueva', fichas: 1 }   // nube-crm.js de fe35f8c: sin `clientes`
    ];
    for (const resp of respuestas) {
      const P = panelCon(null, carteraTres());
      P.ctx._resp = resp;
      P.ev(`var _pedidas = []; window.NubeCRM = { estado: function () { return { fase: 'lista' }; },
        libroAlDiaEsperando: function (op) { _pedidas.push(op); return Promise.resolve(_resp); } };`);
      assert.equal(await P.ev('publicarEquipoSolo()'), 'cartera_no_al_dia');
      assert.equal(P.ctx._pub.length, 0, 'publicó sin saber de quién era lo que falta: ' + JSON.stringify(resp));
      assert.deepEqual(sinProto(P.ev('_pedidas')), [{ porCliente: true }], 'no pidió la respuesta cliente por cliente');
    }
  });

  test('NubeCRM: un ajuste en discusión le cambia la cuenta a todos, así que no se ata a ningún cliente', async () => {
    const m = B.montar({ db: carteraTres() });
    await B.sembrar(m); await ticks();
    const v = sesionNueva(m);
    assert.deepEqual(sinProto(await v.C.libroAlDiaEsperando({ porCliente: true })), { ok: true, motivo: 'al-dia' });
    const est = B.estadoDisco(m.alm);
    est.congeladas = Object.assign({}, est.congeladas, { 'ajustes|tasas': { tabla: 'ajustes', id: 'tasas', motivo: 'choque' } });
    m.alm.setItem(B.ESTADO, JSON.stringify(est));
    const r = sinProto(v.C.libroPorCliente());
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'en-discusion');
    assert.equal(r.sinCliente, 1);
    /* Y libroAlDia (la de los historiales) contesta lo de siempre. */
    assert.deepEqual(sinProto(v.C.libroAlDia()), { ok: false, motivo: 'en-discusion', congeladas: 1 });
  });
});

describe('6 · la pantalla del asesor dice la fecha de la fila que no se refrescó', () => {

  test('con el resto de hoy, la fila de hace tres días lo dice ella misma; la de hoy, no', () => {
    const P = abrirPanel();
    const a = new Date(); a.setHours(12, 0, 0, 0);
    const hoy = a.toISOString();
    const b = new Date(a.getTime() - 3 * 86400000);
    const hace3 = b.toISOString();
    const gente = [
      { id: 'C0', tipo: 'cliente', nombre: 'Socio 0', saldo: 120000, saldo_total: 120000, fecha_pago: '2026-10-30', creditos: 1, al_dia_de: hoy },
      { id: 'C1', tipo: 'cliente', nombre: 'Socio 1', saldo: 240000, saldo_total: 240000, fecha_pago: '2026-10-30', creditos: 1, al_dia_de: hace3 }
    ];
    P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: { nombre: 'PEDRO', rol: 'asesor', celular: PEDRO }, equipo: [], gente }));
    const l0 = P.ev('lineaPlataEq(genteEquipo()[0])');
    const l1 = P.ev('lineaPlataEq(genteEquipo()[1])');
    assert.doesNotMatch(l0, /cifra del/);
    assert.match(l1, /cifra del/, 'la fila de hace tres días salió debajo de «los montos son de hoy» sin decir nada');
    assert.match(l1, /confirma antes de cobrar/);
    /* El aviso de arriba sigue diciendo el día de la más nueva. */
    assert.match(P.ev('avisoAlDiaDeEq()'), /de hoy/);
  });
});
