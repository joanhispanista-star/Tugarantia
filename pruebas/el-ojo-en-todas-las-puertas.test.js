'use strict';
/* 14-nov-2026 (segunda revisión de v147) — EL «OJO» EN TODAS LAS PUERTAS.
   El cuadro de «🔗 Juntar y desembolsar» dice, antes de juntar, que la app
   del cliente va a mostrar lo de este computador si su ficha está en
   discusión. Las otras puertas que suben y juntan lo callaban: la mesa de
   cruce (📥 Registrados), «🔗 Juntar su cuenta» con la comparación vencida y
   la clave nueva dada desde la ficha. Y tres textos prometían «se junta sola
   desde las HH:MM» aunque su ficha no hubiera subido, y el aviso del crédito
   registrado a quien ya tenía la cuenta junta callaba que su app todavía no
   lo muestra. El arnés es el de la revisión (crm.html de verdad,
   HistorialesAuto de mentira). Nombres y números de mentira. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 8); i++) await tick(); }
const plano = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '');

/* ---------------------------------------------------------------- banco B:
   crm.html de verdad con un HistorialesAuto de mentira (como juntar-y-desembolsar) */
const { crear: crearHistoriales } = require('../panel/historiales-auto.js');
const TEXTO_CINTA = crearHistoriales({})._puro.textoCinta;
const CLAVE = 'clave-de-prueba-bien-larga';
const CEL = '3001112222';
const planoB = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
const CREADA = '2026-11-12T15:00:00Z';
const JORGE = { id: 'C1', numero: 7, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [] };
const REG = { id: 41, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, origen: 'abierto', estado: 'nuevo',
  creado_en: '2026-11-08T14:55:00Z', datos: { nombres: 'Jorge', apellidos: 'Antiguo', celular: CEL } };
const SOL = o => Object.assign({ id: 's1', nombre: 'Jorge Antiguo', cedula: CEL, celular: CEL, estado: 'contrapropuesta',
  app: 'tugarantia', origen: 'nube', cuenta_sin_juntar: true, registro_id: 41,
  capital: 1500000, pedido_monto: 1500000, producto: 'quincenal', fecha_corte: enDias(30),
  pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30), dias: 30 }, datos: {},
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30, costo_pct: 20,
                     texto: '', por: 'joan', creada_en: CREADA } }, o || {});
const ACEPTADA = o => {
  const s = SOL(Object.assign({ estado: 'aceptada', aceptada_en: '2026-11-13T13:38:00Z' }, o || {}));
  s.contrapropuesta.condiciones = { version: '2026-10-22', aceptadas_en: '2026-11-13T13:38:00Z',
    lineas: [{ clave: 'recibes', k: 'Recibes', v: '$1.200.000' }], tope_mora: null,
    base: { capital: 1200000, total: 1440000, fecha_pago: s.contrapropuesta.fecha_pago, creada_en: CREADA } };
  s.destino_desembolso = { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: CREADA };
  return s;
};
const CUENTA = { registro_id: 41, celular: CEL, cuenta: true, cuenta_creada_en: '2026-11-08T14:50:00Z' };
function nube(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    let c = null; try { c = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { c = null; }
    vistas.push({ fn, c });
    if (o[fn] !== undefined) { const r = typeof o[fn] === 'function' ? o[fn](c) : o[fn]; return Promise.resolve(resp(200, r)); }
    if (fn === 'listar_registros') return Promise.resolve(resp(200, []));
    if (fn === 'archivos_de_registro' || fn === 'registro_archivos') return Promise.resolve(resp(200, { ok: true, fotos: {}, huella: null }));
    if (fn === 'marcar_solicitud' || fn === 'marcar_registro') return Promise.resolve(resp(200, { ok: true }));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas };
}
function montarB(o) {
  o = o || {};
  const N = nube(Object.assign({ cuentas_de_registros: [CUENTA],
    vincular_cuenta_joan: { ok: true, ya_estaba: false, nombre: 'Jorge Antiguo', celular: CEL } }, o.nube || {}));
  const P = abrirPanel({ red: o.envolverRed ? o.envolverRed(N.red) : N.red });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera({ socios: (o.socios || [JORGE]).map(x => JSON.parse(JSON.stringify(x))), prestamos: o.prestamos || [], config: { negocio: 'Tu Garantía' } });
  P.ctx.open = () => {};
  if (o.registros !== false) P.ev('_registros = ' + JSON.stringify(o.registros || [REG]));
  P.ev('_solicitudes = ' + JSON.stringify(o.solicitudes || [ACEPTADA()]));
  const preguntas = [];
  P.ctx.confirm = m => { preguntas.push(String(m)); return o.responde ? o.responde(String(m)) : true; };
  return { P, N, preguntas };
}
const llamadasA = (N, fn) => N.vistas.filter(v => v.fn === fn);
const avisos = P => (P.ctx._avisos || []).join('\n');
const creditos = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
function conHistoriales(P, op) {
  op = op || {};
  P.ev('window.__hist = ' + JSON.stringify({ conf: op.conf || {}, ultimo: op.ultimo || null, habilitado: op.habilitado !== false,
    alVolver: op.alVolver || {}, vueltas: 0, cinta: op.cinta || null }));
  P.ev(`window.HistorialesAuto = {
    configurado: function () { return true; },
    habilitado: function () { return !!window.__hist.habilitado; },
    llaveConfirmada: function (id) { return window.__hist.conf[id] || null; },
    estado: function () { return { ultimo: window.__hist.ultimo, cinta: window.__hist.cinta || { l1: 'Tus clientes ven lo de hace 2 h', l2: '' } }; },
    vuelta: function () { window.__hist.vueltas++; return Promise.resolve({}); },
    subirTodo: function () { return Promise.resolve({ ok: true, confirmados: [] }); },
    algoCambio: function () {}
  };`);
  P.ev('window.HistorialesAuto')._puro = { textoCinta: TEXTO_CINTA };
  P.ev('window.__hist.unas = []; window.__hist.sueltas = []; window.__hist.unaFallas = ' + JSON.stringify(op.unaFallas || []));
  P.ev(`window.HistorialesAuto.subirUna = function (id) {
    window.__hist.unas.push(id);
    var f = window.__hist.unaFallas.shift();
    if (f) return Promise.resolve({ ok: false, fase: f.fase, motivo: f.motivo || '' });
    var a = window.__hist.alVolver || {};
    if (a[id]) window.__hist.conf[id] = a[id];
    return Promise.resolve({ ok: true, total: 1, subidos: 1, confirmados: [id] });
  };
  window.HistorialesAuto.soltar = function (id) { window.__hist.sueltas.push(id); };`);
}
function conLibro(P, r) {
  P.ev('window.__libro = ' + JSON.stringify(r));
  P.ev(`window.NubeCRM = {
    libroAlDia: function () { return window.__libro; },
    libroAlDiaEsperando: function () { return Promise.resolve(window.__libro); }
  };`);
}
const conPorCliente = (P, r) => P.ev('NubeCRM.libroPorCliente = function () { return ' + JSON.stringify(r) + '; }');
function comparacionVencida(P, despues) {
  P.ev('window.__esperas = 0; window.__pc = { ok: false, motivo: "comparando" }; window.__pcDespues = ' + JSON.stringify(despues || null));
  P.ev(`NubeCRM.libroPorCliente = function () { return window.__pc; };
    NubeCRM.libroAlDiaEsperando = function () { window.__esperas++; if (window.__pcDespues) window.__pc = window.__pcDespues; return Promise.resolve(window.__libro); };`);
}
const llaveDe = P => String(P.ev('PUENTE.llaveEnLaNube(DB.socios[0])'));
const toqueDe = P => /juntarConUnToque\('([^']+)','([^']+)',(true|false)\)/.exec(P.elems.juntarBoton.innerHTML);
async function tocar(P, m) {
  P.ev('juntarConUnToque(' + JSON.stringify(m[1]) + ',' + JSON.stringify(m[2]) + ',' + m[3] + ')');
  await asentar(24);
}
const EN_DISCUSION_23 = { ok: false, motivo: 'en-discusion', congeladas: 23 };
const DISC_C1 = { ok: false, motivo: 'en-discusion', congeladas: 23, clientes: { C1: { enDiscusion: true } } };


describe('el «Ojo» en las otras puertas', () => {
  test('la mesa de cruce (📥 Registrados) dice el «Ojo» antes de «Es la misma persona», y la subida lo vuelve a mirar', async () => {
    const { P, N } = montarB();
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, DISC_C1);
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    assert.match(planoB(P.elems.juntarCuenta.innerHTML), /Ojo: su ficha no coincide con la de la nube/, 'la mesa calló el «Ojo»');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(_mesaOjo)')), { reg: '41', socio: 'C1', disc: 'en-discusion' });
    P.ev("aplicarCruce('41','C1')");
    await asentar(24);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__hist.unas)')), ['C1'], 'no subió su ficha');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
  });

  test('la mesa con la comparación vencida dice que no pudo comparar', async () => {
    const { P } = montarB();
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, EN_DISCUSION_23);
    comparacionVencida(P, DISC_C1);
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    assert.match(planoB(P.elems.juntarCuenta.innerHTML), /Ojo: no pude comparar su ficha con la nube/);
  });

  test('la mesa: si al tocar se sabe algo que la mesa no dijo, no sube ni junta, y lo dice', async () => {
    const { P, N } = montarB();
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, { ok: false, motivo: 'en-discusion', congeladas: 23, clientes: {} });
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    assert.doesNotMatch(planoB(P.elems.juntarCuenta.innerHTML), /Ojo/, 'precondición: la mesa no tenía nada que decir');
    conPorCliente(P, DISC_C1);
    P.ev("aplicarCruce('41','C1')");
    await asentar(24);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__hist.unas)')), [], 'subió lo que la mesa no le dijo');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó');
    assert.match(avisos(P), /acabo de ver algo que no te había dicho/);
  });

  test('«🔗 Juntar su cuenta» con la comparación vencida: el confirm dice que no pudo comparar', async () => {
    const J = Object.assign({}, JORGE, { cuentaPorJuntar: { registro_id: 41, desde: '2026-11-14', por: 'crm' } });
    const { P, preguntas } = montarB({ socios: [J] });
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.__hist.conf = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    conLibro(P, EN_DISCUSION_23);
    comparacionVencida(P, DISC_C1);
    P.ev("juntarPendienteAhora('C1')");
    await asentar(24);
    assert.equal(preguntas.length, 1);
    assert.match(preguntas[0], /Ojo: no pude comparar su ficha con la nube/, 'el confirm calló: ' + preguntas[0]);
  });

  test('«🔑 Clave nueva» desde la ficha (sin cuadro): el confirm dice el «Ojo», y la subida lo vuelve a mirar', async () => {
    const J = Object.assign({}, JORGE, { cuentaPorJuntar: { registro_id: 41, desde: '2026-11-14', por: 'crm', pideClave: true,
      motivo: 'La nube pide una clave nueva al número de su ficha.' } });
    const { P, preguntas } = montarB({ socios: [J], nube: { clave_temporal_joan: { ok: true, clave: 'PRUEBA-123' } } });
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, DISC_C1);
    assert.equal(P.ev('_modalJuntar'), null, 'precondición: no hay cuadro abierto');
    P.ev("claveNuevaYJuntar('41','C1',true)");
    await asentar(24);
    assert.equal(preguntas.length, 1);
    assert.match(preguntas[0], /Ojo: su ficha no coincide con la de la nube/, 'el confirm calló: ' + preguntas[0]);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__hist.unas)')), ['C1'], 'no subió su ficha');
  });
});

describe('«se junta sola desde las HH:MM», solo si su ficha subió', () => {
  test('la clave nueva cuya ficha no subió: la ficha y «🔗 Juntar su cuenta» dicen «se puede juntar», no «se junta sola»', async () => {
    const { P } = montarB({ nube: { clave_temporal_joan: { ok: true, clave: 'PRUEBA-123' } } });
    conHistoriales(P, { conf: {}, habilitado: false, unaFallas: [{ fase: 'sin-senal' }] });
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, DISC_C1);
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("claveNuevaYJuntar('41','C1',false)");
    await asentar(24);
    assert.equal(P.ev("HistorialesAuto.llaveConfirmada('C1')"), null, 'precondición: no subió');
    P.ev("verCliente('C1')");
    const ficha = planoB(P.elems.mBody.innerHTML);
    assert.match(ficha, /se puede juntar desde las \d\d:\d\d; si a esa hora no se juntó sola, toca «🔗 Juntar su cuenta»/, ficha);
    assert.doesNotMatch(ficha, /su cuenta se junta sola desde las/);
    P.ev("juntarPendienteAhora('C1')");
    assert.match(avisos(P), /Su ficha todavía no subió a la nube desde este computador: si a esa hora no se juntó sola, vuelve a tocar aquí\./);
    assert.doesNotMatch(avisos(P), /A esa hora se junta sola/);
  });

  test('CONTROL: con su ficha arriba, la ficha sí dice «se junta sola desde las HH:MM»', async () => {
    const J = Object.assign({}, JORGE, { cuentaPorJuntar: { registro_id: 41, desde: '2026-11-14', por: 'crm',
      noAntesDe: new Date(Date.now() + 3600000).toISOString() } });
    const { P } = montarB({ socios: [J] });
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.__hist.conf = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("verCliente('C1')");
    assert.match(planoB(P.elems.mBody.innerHTML), /su cuenta se junta sola desde las \d\d:\d\d con este computador abierto/);
  });
});

describe('el crédito registrado a quien ya tenía la cuenta junta', () => {
  const JUNTO = Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-10-01', registro_id: 41, por: 'crm' } });
  test('con su ficha en discusión y sin soltar: el aviso dice que su app todavía no lo muestra', async () => {
    const { P } = montarB({ socios: [JUNTO] });
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.HistorialesAuto.esSuelta = function () { return false; }');
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, DISC_C1);
    const t = P.ev('notaSuAppTrasCredito(DB.socios[0])');
    assert.match(t, /Su app todavía no lo muestra: su ficha es de las que esperan \(no coincide con la de la nube\): le llega cuando elijas en ☁ Subir \(paso 7\)/);
  });
  test('si su ficha es suelta (la juntaste hoy), o no está en discusión, no dice nada', async () => {
    const { P } = montarB({ socios: [JUNTO] });
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, DISC_C1);
    P.ev('window.HistorialesAuto.esSuelta = function () { return true; }');
    assert.equal(P.ev('notaSuAppTrasCredito(DB.socios[0])'), '');
    P.ev('window.HistorialesAuto.esSuelta = function () { return false; }');
    conPorCliente(P, { ok: false, motivo: 'en-discusion', congeladas: 23, clientes: {} });
    assert.equal(P.ev('notaSuAppTrasCredito(DB.socios[0])'), '');
  });
});
