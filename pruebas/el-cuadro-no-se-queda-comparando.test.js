'use strict';
/* 14-nov-2026 (segunda revisión de v147) — EL CUADRO NO SE QUEDA COMPARANDO.
   Con la comparación con la nube vencida, el cuadro de «🔗 Juntar y
   desembolsar» la espera y vuelve a preguntar por la cuenta. Si esa segunda
   pregunta fallaba (un momento sin señal) o ya no traía el registro, la caja
   lo decía pero el botón se quedaba para siempre en «☁ Comparando su ficha con
   la nube…», sin botón ni Cerrar. Ahora deja Cerrar (quitarEsperaDelBoton).
   El arnés es el de la revisión (crm.html de verdad, HistorialesAuto de
   mentira, como juntar-y-desembolsar). Nombres y números de mentira. */
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


describe('el cuadro no se queda en «Comparando…» si la segunda pregunta a la nube falla', () => {
  test('la segunda pregunta por la cuenta falla (sin señal): la caja lo dice y el botón deja Cerrar', async () => {
    let n = 0;
    const { P } = montarB({ envolverRed: red => (url, cfg) => {
      if (/cuentas_de_registros$/.test(url) && ++n === 2) return Promise.reject(new Error('se cortó el wifi'));
      return red(url, cfg);
    } });
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, EN_DISCUSION_23);
    comparacionVencida(P, DISC_C1);
    P.ev("juntarYDesembolsar('s1')");
    await asentar(40);
    assert.equal(n, 2, 'precondición: volvió a preguntar por la cuenta tras la espera');
    assert.equal(P.ev('window.__esperas'), 1, 'precondición: esperó la comparación');
    assert.match(planoB(P.elems.juntarCuenta.innerHTML), /No pude preguntar por la cuenta/);
    const b = P.elems.juntarBoton.innerHTML;
    assert.doesNotMatch(planoB(b), /Comparando su ficha con la nube/, 'el botón se quedó en «Comparando…»: ' + planoB(b));
    assert.match(b, /onclick="cerrarModal\(\)"[^>]*>Cerrar</, 'sin Cerrar: ' + b);
    assert.doesNotMatch(b, /juntarConUnToque|claveNuevaYJuntar/, 'ofreció juntar sin saber la cuenta');
  });

  test('en la segunda pregunta la nube ya no encuentra el registro: lo mismo', async () => {
    let n = 0;
    const { P } = montarB({ nube: { cuentas_de_registros: () => (++n === 1 ? [CUENTA] : []) } });
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, EN_DISCUSION_23);
    comparacionVencida(P, DISC_C1);
    P.ev("juntarYDesembolsar('s1')");
    await asentar(40);
    assert.equal(n, 2, 'precondición: volvió a preguntar por la cuenta tras la espera');
    assert.match(planoB(P.elems.juntarCuenta.innerHTML), /La nube no encontró ese registro/);
    const b = P.elems.juntarBoton.innerHTML;
    assert.doesNotMatch(planoB(b), /Comparando su ficha con la nube/, 'el botón se quedó en «Comparando…»: ' + planoB(b));
    assert.match(b, /onclick="cerrarModal\(\)"[^>]*>Cerrar</, 'sin Cerrar: ' + b);
  });

  test('CONTROL: si la segunda pregunta contesta bien, el cuadro ofrece juntar (con el «Ojo»)', async () => {
    const { P } = montarB();
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, EN_DISCUSION_23);
    comparacionVencida(P, DISC_C1);
    P.ev("juntarYDesembolsar('s1')");
    await asentar(40);
    const b = P.elems.juntarBoton.innerHTML;
    assert.match(b, /juntarConUnToque/, 'no ofreció el toque: ' + planoB(b));
    assert.match(planoB(b), /Ojo: su ficha no coincide con la de la nube/);
  });
});
