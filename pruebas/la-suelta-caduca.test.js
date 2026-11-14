'use strict';
/* ============================================================================
 * VERIFICACIÓN DE UN HALLAZGO SOBRE f8fedb5 — «una suelta no vuelve a esperar
 * nunca» (historiales-auto.js, SUELTAS).
 *
 *   node --test pruebas/verificar-suelta-caduca.test.js
 *
 * Bloque 1, con el uso real de Joan: UN computador con el CRM, el celular con
 * espejo.html, una ficha en discusión (con 23 es lo mismo) y la subida sin
 * encender. NubeCRM DE VERDAD (banco-nube-crm: su servidor con las reglas del
 * SQL), crm.html de verdad (banco-panel), historiales-auto.js de verdad y una
 * nube de sincronizar_socios que guarda cada lote. La única costura: el
 * NubeCRM que ve crm.html es un pasamanos al de verdad (crm.html lo volvería a
 * configurar con el sello de SU almacén, que en el banco es otro objeto).
 *   día 1 · P2 (de C2) se tocó aquí y en el celular: queda en discusión.
 *           Joan junta a C1 (subirUna y soltar, lo que hace el toque).
 *         · esa noche cobra a C1 desde el celular: la nube tiene P1 pagado;
 *           este computador, no (eso solo llega con ☁ Subir, paso 6).
 *   día 2 · Joan pone el PIN. El paquete de C1 cambió solo (la mora viaja
 *           hecha, contada hasta hoy).
 * Con b970593 C1 espera como los demás y la línea lo cuenta. Con f8fedb5 sube
 * al poner el PIN, con la comparación todavía en camino, y después tampoco
 * espera: P1 sin pagar y un día más de mora, cada día, sin que la línea lo
 * cuente.
 *
 * Bloque 2: la ventana del arreglo (la suelta vale SUELTA_MS desde el toque),
 * con el NubeCRM de mentira de pruebas/cliente-por-cliente.test.js.
 * ==========================================================================*/
const { test, describe, mock } = require('node:test');
/* La hora es un dato: también para app/puente.js, que se carga fuera del
   contexto de la página y mira el Date de Node (ver la-de-15-min-por-cliente). */
const DIA1 = new Date('2026-11-14T10:00:00').getTime();
mock.timers.enable({ apis: ['Date'], now: DIA1 });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');

/* HIST_FUENTE: otro historiales-auto.js (por ejemplo el de b970593) para
   comparar, con el resto de f8fedb5. */
const FUENTE_HIST = fs.readFileSync(process.env.HIST_FUENTE || path.join(B.RAIZ, 'panel/historiales-auto.js'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 30); i++) await tick(); }
const clon = v => JSON.parse(JSON.stringify(v));
const plano = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '');
const HORA = 3600000;

function nubeHistoriales() {
  const S = { lotes: [], llamadas: 0 };
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  S.red = (url, cfg) => {
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) return Promise.reject(new Error('sin red en el banco'));
    S.llamadas++;
    const cuerpo = JSON.parse(cfg.body);
    S.lotes.push(cuerpo.p_lote);
    return Promise.resolve(resp(200, String(cuerpo.p_lote.length)));
  };
  return S;
}
function relojes(P) {
  const cola = []; let n = 0;
  P.ctx.setTimeout = (f, ms) => { const id = ++n; cola.push({ id, f, ms }); return id; };
  P.ctx.clearTimeout = id => { const i = cola.findIndex(x => x.id === id); if (i >= 0) cola.splice(i, 1); };
  P.ctx.setInterval = (f, ms) => { const id = ++n; cola.push({ id, f, ms, intervalo: true }); return id; };
  P.ctx.clearInterval = P.ctx.clearTimeout;
  return {
    disparar(ms) {
      const toca = cola.filter(x => x.ms === ms && !x.intervalo);
      toca.forEach(x => { cola.splice(cola.indexOf(x), 1); x.f(); });
      return toca.length;
    }
  };
}
const SB = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
const listo = P => P.ev('HistorialesAuto.listo()');
const cinta = P => P.ev('HistorialesAuto.estado()').cinta;
const cedulas = lotes => lotes.flat().map(x => x.cedula).sort();

/* crm.html de verdad sobre `almacen`, con un NubeCRM que le pasa las
   preguntas al de verdad (C), y la subida de historiales encendida con el PIN. */
function panelSobre(almacen, C, srvH) {
  const P = abrirPanel({ red: (u, c) => srvH.red(u, c), almacen });
  const t = relojes(P);
  P.cargarCartera(JSON.parse(almacen['joan_socios_v1']));
  P.ev('_selloDesdeDisco(false)');
  P.elems.modal.classList.contains = () => false;
  P.ctx._C = C;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' } }; },
    libroAlDia: function () { return _C.libroAlDia(); },
    libroPorCliente: function () { return _C.libroPorCliente(); },
    libroAlDiaEsperando: function (o) { return _C.libroAlDiaEsperando(o); } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, t };
}
/* Lo que hace crm.html cuando el NubeCRM se repinta tras su comparación
   (alPintarNube → HistorialesAuto.libroCambio). */
async function vuelveLaComparacion(P) {
  await ticks();
  P.ev('HistorialesAuto.libroCambio()');
  await listo(P); await ticks();
}

describe('1 · con el uso real: la suelta de ayer y lo que se cobró anoche en el celular', () => {
  test('al día siguiente C1 espera como los demás (la nube tiene su pago) y la línea la cuenta', async () => {
    mock.timers.setTime(DIA1);
    /* Día 1. Emparejado, y P2 (de C2) tocado en el celular y aquí: en discusión. */
    const m = B.montar({ db: B.cartera(3, 1) });
    await B.sembrar(m); await ticks();
    m.srv.celular('creditos', 'P2', d => { d.cicloActual = '2026-11-30'; });
    const d1 = B.leerDisco(m.alm); d1.prestamos.find(p => p.id === 'P2').cicloActual = '2026-11-29'; m.tab.guardar(d1);
    await m.C.vuelta(false); await ticks();
    assert.ok(B.congeladas(m.alm)['creditos|P2'], 'precondición: P2 quedó en discusión');
    assert.equal(clon(m.C.libroAlDia()).motivo, 'en-discusion', 'precondición: la cartera no está comprobada');

    const ALM = { joan_socios_v1: JSON.stringify(B.leerDisco(m.alm)), joan_socios_sb: SB };
    const srv1 = nubeHistoriales();
    const a = panelSobre(ALM, m.C, srv1);
    a.t.disparar(5000); await listo(a.P); await vuelveLaComparacion(a.P);
    assert.ok(!cedulas(srv1.lotes).includes('1000002'), 'precondición: C2 (en discusión) no subió');
    /* El toque: su ficha (subirUna) y, juntada la cuenta, soltar. */
    await a.P.ev("HistorialesAuto.subirUna('C1')");
    const haySoltar = a.P.ev("typeof HistorialesAuto.soltar === 'function'");
    if (haySoltar) {
      a.P.ev("HistorialesAuto.soltar('C1')");
      assert.ok(JSON.parse(ALM.joan_crm_historiales).sueltas.C1, 'precondición: C1 quedó suelta');
    }
    assert.ok(cedulas(srv1.lotes).includes('1000001'), 'precondición: el día 1 su app ya tiene lo de este computador');

    /* Esa noche: Joan cobra a C1 desde el celular. */
    mock.timers.setTime(new Date('2026-11-14T21:00:00').getTime());
    m.srv.celular('creditos', 'P1', d => { d.pagado = true; d.fechaPagado = '2026-11-14'; });

    /* Día 2: el PIN (otra sesión del NubeCRM y de la página; mismo navegador). */
    mock.timers.setTime(new Date('2026-11-15T08:00:00').getTime());
    const v = B.montar({ alm: m.alm, srv: m.srv, tab: m.tab });
    const ALM2 = { joan_socios_v1: ALM.joan_socios_v1, joan_socios_sb: SB, joan_crm_historiales: ALM.joan_crm_historiales };
    const srv2 = nubeHistoriales();
    const b = panelSobre(ALM2, v.C, srv2);
    assert.equal(clon(v.C.libroPorCliente()).motivo, 'comparando', 'precondición: al poner el PIN la comparación de esta sesión no ha llegado');
    b.t.disparar(5000); await listo(b.P);
    const alPIN = cedulas(srv2.lotes);
    await vuelveLaComparacion(b.P);
    const pc = clon(v.C.libroPorCliente());
    assert.ok(pc.clientes && pc.clientes.C1 && pc.clientes.C1.masNueva, 'precondición: la comparación dice que la nube tiene algo más nuevo de C1: ' + JSON.stringify(pc));
    assert.equal(m.srv.creditos.P1.datos.pagado, true, 'precondición: la nube tiene P1 pagado');

    const problemas = [];
    const c1 = srv2.lotes.flat().filter(x => x.cedula === '1000001');
    const deC1 = c1.length ? c1[c1.length - 1].datos.creditos[0] : null;
    if (c1.length) {
      problemas.push('subió a C1 ' + c1.length + ' vez/veces con lo de este computador encima de lo que la nube tiene de él' +
        (alPIN.includes('1000001') ? ' (la primera al poner el PIN, con la comparación todavía en camino)' : '') +
        ': pagado=' + deC1.pagado + ', ' + deC1.dias_mora + ' días de mora, total para saldar hoy ' + deC1.total_hoy +
        ', y el cliente pagó anoche');
    }
    const l1 = cinta(b.P).l1;
    if (!/, menos 2 clientes$/.test(l1)) problemas.push('la línea no cuenta a C1, que tiene algo más nuevo en la nube: «' + plano(l1) + '»');
    /* Y al otro día, lo mismo: el paquete vuelve a cambiar solo (la mora). */
    mock.timers.setTime(new Date('2026-11-16T08:00:00').getTime());
    const n2 = srv2.lotes.length;
    await b.P.ev('HistorialesAuto.vuelta(false)'); await listo(b.P); await vuelveLaComparacion(b.P);
    if (cedulas(srv2.lotes.slice(n2)).includes('1000001')) problemas.push('y al día siguiente volvió a subir a C1 (otro día de mora sobre lo que ya pagó)');
    assert.deepEqual(problemas, []);
  });
});

/* -------------------------------------------------------------------------
 * 2 · LA VENTANA. NubeCRM de mentira (el de cliente-por-cliente.test.js).
 * -----------------------------------------------------------------------*/
function montar(o) {
  o = o || {};
  const srv = nubeHistoriales();
  const P = abrirPanel({ red: (u, c) => srv.red(u, c) });
  const t = relojes(P);
  P.cargarCartera(o.cartera || B.cartera(3, 1));
  P.ev('_selloDesdeDisco(false)');
  P.almacen['joan_socios_sb'] = SB;
  if (o.estado) P.almacen['joan_crm_historiales'] = JSON.stringify(o.estado);
  P.elems.modal.classList.contains = () => false;
  P.ctx._libro = o.libro;
  P.ctx._porCliente = o.porCliente;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' } }; },
    libroAlDia: function () { return _libro; }, libroPorCliente: function () { return _porCliente; } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, srv, t };
}
const cambiar = (m, js) => m.P.ev(js + '; guardar()');
async function trasQuietud(m) { m.t.disparar(90000); await listo(m.P); await ticks(); }
const subidosDesde = (m, i) => cedulas(m.srv.lotes.slice(i));
const DISCUSION_C1 = { ok: false, motivo: 'en-discusion', congeladas: 2, clientes: { C1: { enDiscusion: true } } };
const UN_AJUSTE = { ok: false, motivo: 'en-discusion', congeladas: 1, clientes: {}, sinCliente: 1 };
const LIBRO = { ok: false, motivo: 'en-discusion', congeladas: 2 };

describe('2 · la ventana de la suelta', () => {
  test('dentro de la ventana (11 h después de juntarla) lo que se le anota sigue subiendo, aunque esté en discusión', async () => {
    mock.timers.setTime(DIA1);
    const m = montar({ libro: LIBRO, porCliente: DISCUSION_C1 });
    m.t.disparar(5000); await listo(m.P); await ticks();
    assert.equal((await m.P.ev("HistorialesAuto.subirUna('C1')")).ok, true);
    mock.timers.setTime(DIA1 + 11 * HORA);
    const i = m.srv.lotes.length;
    cambiar(m, "DB.socios[1].nombre = 'Socio 1 con su crédito nuevo'");
    await trasQuietud(m);
    assert.deepEqual(subidosDesde(m, i), ['1000001'], 'el crédito registrado tras juntar no le llegó a su app');
  });

  test('pasada la ventana, la suelta en discusión vuelve a esperar y la línea la cuenta', async () => {
    mock.timers.setTime(DIA1);
    const m = montar({ libro: LIBRO, porCliente: DISCUSION_C1 });
    m.t.disparar(5000); await listo(m.P); await ticks();
    assert.equal((await m.P.ev("HistorialesAuto.subirUna('C1')")).ok, true);
    mock.timers.setTime(DIA1 + 13 * HORA);
    const i = m.srv.lotes.length;
    cambiar(m, "DB.socios[1].nombre = 'Socio 1 tocado al otro día'");
    await trasQuietud(m);
    assert.deepEqual(subidosDesde(m, i), [], 'una suelta de ayer subió encima de su discusión');
    assert.match(cinta(m.P).l1, /, menos 1 cliente$/, 'la línea no la cuenta');
  });

  test('con todos esperando (un ajuste), la suelta vencida no sube sola ni la línea dice «sube igual»; juntarla otra vez la renueva', async () => {
    mock.timers.setTime(DIA1);
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 1 }, porCliente: UN_AJUSTE });
    m.t.disparar(5000); await listo(m.P); await ticks();
    assert.equal((await m.P.ev("HistorialesAuto.subirUna('C1')")).ok, true);
    mock.timers.setTime(DIA1 + 13 * HORA);
    let i = m.srv.lotes.length;
    cambiar(m, "DB.socios[1].nombre = 'Socio 1 tocado al otro día'");
    await trasQuietud(m);
    assert.deepEqual(subidosDesde(m, i), [], 'la suelta de ayer subió sola con todos esperando');
    assert.doesNotMatch(plano(cinta(m.P).l2), /que juntaste sube igual/, 'dice «sube igual» de una suelta vencida');
    /* Joan vuelve a juntar su cuenta (crm.html llama a soltar): sube otra vez. */
    m.P.ev("HistorialesAuto.soltar('C1')");
    i = m.srv.lotes.length;
    cambiar(m, "DB.socios[1].nombre = 'Socio 1 juntado otra vez'");
    await trasQuietud(m);
    assert.deepEqual(subidosDesde(m, i), ['1000001'], 'juntarla otra vez no la soltó');
    assert.match(plano(cinta(m.P).l2), /la ficha del cliente que juntaste sube igual/);
  });
});
