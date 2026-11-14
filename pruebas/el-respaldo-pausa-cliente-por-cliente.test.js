'use strict';
/* ============================================================================
 * VERIFICAR — TRAS IMPORTAR UN RESPALDO VIEJO, ¿LA SUBIDA CLIENTE POR CLIENTE
 * IGNORA LA PAUSA? — 14 de noviembre de 2026
 *
 *   env -u TG_PG_BIN timeout 170 node --test pruebas/verificar-respaldo-pausa.test.js
 *
 * Todo de verdad menos la red: crm.html (importar() incluido), historiales-auto.js
 * y el NubeCRM REAL del banco (nube-crm.js con un servidor que sigue las reglas
 * del SQL). El NubeCRM de mentira de crm.html le pregunta al real, como hace
 * crm.html con window.NubeCRM. Así lo que dice «en discusión» y «de qué
 * clientes es» sale del emparejo de verdad tras soltar el espejo, no de un
 * doble que lo afirma.
 *
 * Cada prueba afirma lo que DEBERÍA pasar. Nombres y números de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');

const FUENTE_HIST = fs.readFileSync(path.join(B.RAIZ, 'panel/historiales-auto.js'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const clon = v => JSON.parse(JSON.stringify(v));
const sinProto = v => JSON.parse(JSON.stringify(v));
const plano = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '');

function relojesPanel(P) {
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

/* crm.html + historiales-auto.js de verdad; window.NubeCRM le pasa las dos
   preguntas (libroAlDia y libroPorCliente) al NubeCRM real `C`. */
function historialesCon(C, cart) {
  const S = { lotes: [] };
  const resp = (s, t) => ({ ok: s >= 200 && s < 300, status: s, text: () => Promise.resolve(t) });
  const P = abrirPanel({ red: (u, c) => {
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(u)) return Promise.reject(new Error('sin red en el banco'));
    const cu = JSON.parse(c.body); S.lotes.push(cu.p_lote); return Promise.resolve(resp(200, String(cu.p_lote.length)));
  } });
  const t = relojesPanel(P);
  P.cargarCartera(cart);
  P.ev('_selloDesdeDisco(false)');
  P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
  P.elems.modal.classList.contains = () => false;
  P.ctx._C = C;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'x', l2: '' } }; },
    libroAlDia: function () { return _C.libroAlDia(); },
    libroPorCliente: function () { return _C.libroPorCliente(); },
    libroAlDiaEsperando: function (op) { return _C.libroAlDiaEsperando(op); } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, S, t };
}
const listo = h => h.P.ev('HistorialesAuto.listo()');
const cinta = h => h.P.ev('HistorialesAuto.estado()').cinta;
const estadoH = h => JSON.parse(h.P.almacen['joan_crm_historiales'] || '{}');
const delLote = (lotes, ced) => lotes.flat().filter(x => x.cedula === ced).pop();

/* La mañana: la cartera de HOY, emparejada con la nube, y los historiales ya
   subidos a todos con lo de hoy (la subida sola encendida). Después Joan
   importa `respaldo` (un archivo viejo): importar() de verdad en crm.html, y
   en el lado de nube-crm.js lo mismo que hace importar() (escribe la cartera y
   suelta el espejo), con el emparejo solo que viene después. Al final, el
   repintado de la nube avisa a los historiales (alPintarNube → libroCambio). */
async function trasImportar(hoy, respaldo) {
  const m = B.montar({ db: clon(hoy) });
  await B.sembrar(m); await ticks();
  assert.deepEqual(sinProto(m.C.libroAlDia()), { ok: true, motivo: 'al-dia' }, 'precondición: la cartera de hoy está al día');
  const h = historialesCon(m.C, clon(hoy));
  h.t.disparar(5000); await listo(h); await ticks();
  assert.ok(estadoH(h).habilitado, 'precondición: la subida sola quedó encendida con la cartera de hoy');
  const antes = h.S.lotes.length;

  /* Importar: primero el lado de nube-crm.js (cartera escrita, espejo suelto),
     para que ninguna vuelta de los historiales le pregunte a un NubeCRM que
     todavía cree tener la cartera de hoy. */
  m.tab.guardar(clon(respaldo));
  m.alm.removeItem(B.ESPEJO);
  h.P.ev('importar({target:{files:[{texto:' + JSON.stringify(JSON.stringify(respaldo)) + '}],value:""}})');
  assert.equal((estadoH(h).pausa || {}).motivo, 'respaldo', 'precondición: importar() pausó los historiales');
  /* El emparejo solo de nube-crm.js (su vuelta tras los 90 s). */
  await m.C.vuelta(false); await ticks();
  assert.equal(m.C.estado().fase, 'lista', 'precondición: nube-crm.js no se emparejó solo con el respaldo');
  /* El repintado de la nube (alPintarNube) avisa a los historiales. */
  h.P.ev('HistorialesAuto.libroCambio()');
  await listo(h); await ticks();
  return { m, h, antes };
}

describe('tras importar un respaldo viejo (cartera comprobada antes)', () => {

  test('la discusión sale atada a UN cliente: el emparejo de verdad deja esperando solo a C1', async () => {
    const hoy = B.cartera(3, 1); hoy.prestamos[1].pagado = true; hoy.prestamos[1].fechaPagado = '2026-10-15';
    const respaldo = clon(hoy); respaldo.prestamos[1].pagado = false; respaldo.prestamos[1].fechaPagado = null;
    const { m } = await trasImportar(hoy, respaldo);
    const lib = sinProto(m.C.libroAlDia());
    assert.equal(lib.motivo, 'en-discusion', JSON.stringify(lib));
    const pc = sinProto(m.C.libroPorCliente());
    assert.equal(pc.motivo, 'en-discusion', JSON.stringify(pc));
    assert.deepEqual(Object.keys(pc.clientes || {}), ['C1'], JSON.stringify(pc));
    assert.ok(!pc.sinCliente, 'algo sin cliente: frenaría a todos ' + JSON.stringify(pc));
  });

  test('los que coinciden NO suben con las cifras del grupo del respaldo (créditos pagados 1 → 0)', async () => {
    const hoy = B.cartera(3, 1); hoy.prestamos[1].pagado = true; hoy.prestamos[1].fechaPagado = '2026-10-15';
    const respaldo = clon(hoy); respaldo.prestamos[1].pagado = false; respaldo.prestamos[1].fechaPagado = null;
    const { h, antes } = await trasImportar(hoy, respaldo);
    const deHoy = delLote(h.S.lotes.slice(0, antes), '1000000');
    assert.equal(deHoy.datos.comunidad.creditos_pagados, 1, 'precondición: los clientes ven 1 crédito pagado del grupo');
    const despues = h.S.lotes.slice(antes).flat();
    const regresan = despues.filter(x => x.datos.comunidad.creditos_pagados !== 1)
      .map(x => x.cedula + ': ' + x.datos.comunidad.creditos_pagados);
    assert.deepEqual(regresan, [],
      'con la pausa del respaldo puesta, subieron clientes con las cifras del grupo del respaldo: ' + regresan.join(', '));
  });

  test('plata: quien trajo a un cliente que el respaldo no tiene no sube con la garantía de antes de ese referido', async () => {
    /* Hoy: C3 llegó traído por C0 y ya pagó su crédito (los 5.000 de C0, que
       caben porque C0 ya se ganó garantía pagando en fecha). El respaldo es de
       antes de que llegara C3. */
    const hoy = B.cartera(4, 1);
    hoy.socios[3].referidoPor = 'C0';
    Object.assign(hoy.prestamos[0], { pagado: true, fechaPagado: '2026-10-10', gananciaPago: 40000, recargoMora: 0, cicloPago: '2026-10-15' });
    hoy.prestamos[3].pagado = true; hoy.prestamos[3].fechaPagado = '2026-10-15';
    const respaldo = clon(hoy);
    respaldo.socios = respaldo.socios.filter(s => s.id !== 'C3');
    respaldo.prestamos = respaldo.prestamos.filter(p => p.socioId !== 'C3');
    const { m, h, antes } = await trasImportar(hoy, respaldo);
    const pc = sinProto(m.C.libroPorCliente());
    assert.deepEqual(Object.keys(pc.clientes || {}).sort(), ['C3'], 'precondición: ' + JSON.stringify(pc));
    const deHoy = delLote(h.S.lotes.slice(0, antes), '1000000');
    assert.equal(deHoy.datos.referidos.pagaron, 1, 'precondición: C0 ve su referido pagado');
    assert.equal(deHoy.datos.garantia.referidos, 5000, 'precondición: y sus 5.000 de garantía por él');
    const c0 = delLote(h.S.lotes.slice(antes), '1000000');
    assert.ok(!c0 || (c0.datos.referidos.pagaron === 1 && c0.datos.garantia.total === deHoy.datos.garantia.total),
      'C0 subió con el respaldo: referidos que pagaron ' + deHoy.datos.referidos.pagaron + ' → ' +
      (c0 && c0.datos.referidos.pagaron) + ', garantía ' + deHoy.datos.garantia.total + ' → ' + (c0 && c0.datos.garantia.total));
  });

  test('hasta dónde llega: si el respaldo también es más viejo en un ajuste (una gestión anotada después), esperan todos, con o sin el arreglo', async () => {
    const hoy = B.cartera(3, 1); hoy.prestamos[1].pagado = true; hoy.prestamos[1].fechaPagado = '2026-10-15';
    hoy.gestiones = [{ id: 'loc-1', persona_id: 'C2', tipo: 'promesa', nota: '', cuando: '2026-10-15T15:00:00Z', quien: 'Joan' }];
    const respaldo = clon(hoy); respaldo.prestamos[1].pagado = false; respaldo.prestamos[1].fechaPagado = null;
    respaldo.gestiones = [];
    const { m, h, antes } = await trasImportar(hoy, respaldo);
    const pc = sinProto(m.C.libroPorCliente());
    assert.ok(pc.sinCliente, 'precondición: el ajuste en discusión no se ata a ningún cliente ' + JSON.stringify(pc));
    assert.equal(h.S.lotes.length, antes, 'subió alguien con un ajuste en discusión');
    assert.equal(cinta(h).fase, 'esperando-libro');
  });

  test('con la pausa del respaldo, la línea dice que espera el respaldo (no «tus clientes ven…, menos 1»), y la ficha que Joan junta sube igual', async () => {
    const hoy = B.cartera(3, 1); hoy.prestamos[1].pagado = true; hoy.prestamos[1].fechaPagado = '2026-10-15';
    const respaldo = clon(hoy); respaldo.prestamos[1].pagado = false; respaldo.prestamos[1].fechaPagado = null;
    const { h, antes } = await trasImportar(hoy, respaldo);
    const c = cinta(h);
    assert.equal(c.fase, 'esperando-libro', 'la línea no dice que espera: ' + c.l1);
    assert.match(c.l1, /Importaste un respaldo/);
    const r = await h.P.ev("HistorialesAuto.subirUna('C0')");
    assert.equal(r.ok, true, 'la ficha que Joan junta no subió: ' + JSON.stringify(r));
    assert.deepEqual(h.S.lotes.slice(antes).flat().map(x => x.cedula), ['1000000']);
  });

  test('la pausa no se queda pegada: decidida la discusión (lo de la nube baja a la cartera), suben todos con lo de hoy y se enciende', async () => {
    const hoy = B.cartera(3, 1); hoy.prestamos[1].pagado = true; hoy.prestamos[1].fechaPagado = '2026-10-15';
    const respaldo = clon(hoy); respaldo.prestamos[1].pagado = false; respaldo.prestamos[1].fechaPagado = null;
    const { m, h, antes } = await trasImportar(hoy, respaldo);
    /* ☁ Subir, paso 7, «lo de la nube»: la cartera queda con P1 pagado, el
       espejo conoce su revisión y la ficha sale de la discusión. */
    const conP1 = B.leerDisco(m.alm); conP1.prestamos[1].pagado = true; conP1.prestamos[1].fechaPagado = '2026-10-15';
    m.tab.guardar(conP1);
    const esp = B.espejoDisco(m.alm), srvP1 = m.srv.creditos.P1;
    esp.creditos.P1 = { revision: srvP1.revision, json: require('../panel/nube.js').jsonCanonico(srvP1.datos), borrado: false,
      actualizado_por: srvP1.actualizado_por, actualizado_en: srvP1.actualizado_en };
    m.alm.setItem(B.ESPEJO, JSON.stringify(esp));
    const est = B.estadoDisco(m.alm); delete est.congeladas['creditos|P1']; m.alm.setItem(B.ESTADO, JSON.stringify(est));
    const s = B.montar({ alm: m.alm, srv: m.srv, tab: m.tab });
    s.C.libroAlDia(); await ticks();
    assert.deepEqual(sinProto(s.C.libroAlDia()), { ok: true, motivo: 'al-dia' }, 'precondición: decidida, la cartera queda al día');
    h.P.ctx._C = s.C;
    h.P.ev('DB.prestamos[1].pagado = true; DB.prestamos[1].fechaPagado = "2026-10-15"; guardar()');
    h.P.ev('HistorialesAuto.libroCambio()');
    /* El guardar() arma los 90 s de quietud: la vuelta sale con ellos. */
    h.t.disparar(90000);
    await listo(h); await ticks();
    const despues = h.S.lotes.slice(antes).flat();
    assert.deepEqual(despues.map(x => x.cedula).sort(), ['1000000', '1000001', '1000002'], 'no se reanudó sola');
    assert.ok(despues.every(x => x.datos.comunidad.creditos_pagados === 1));
    assert.ok(estadoH(h).habilitado, 'no se encendió');
    assert.equal(estadoH(h).pausa, null, 'la pausa siguió puesta');
  });
});
