'use strict';
/* ============================================================================
 * UN RESPALDO QUE ENTRA CON UNA SUBIDA EN EL AIRE — verificación del 14-nov-2026
 * (revisión de f8fedb5, «cliente por cliente» y las SUELTAS)
 *
 *   node --test pruebas/respaldo-con-subida-en-el-aire.test.js
 *
 * carteraReemplazada (la llama importar() de crm.html) olvida las huellas y las
 * SUELTAS: un respaldo suele ser viejo, y nada de él sube hasta que quede
 * emparejado con la nube. Pero si en ese momento iba en el aire la subida de
 * una ficha (subirUna, el toque; o subirSueltas, la vuelta con todos
 * esperando), su respuesta llega DESPUÉS, y anotar() escribía en el estado
 * recién vaciado la huella y la suelta de la cartera de ANTES. Con el respaldo
 * ya emparejado y esa ficha en discusión, subía la ficha VIEJA del respaldo
 * (sin el crédito que se le registró al juntar), porque una suelta no espera.
 *
 * Con el historiales-auto.js de verdad, el crm.html de verdad (su importar(),
 * su loteMigracion) y un NubeCRM de mentira que contesta lo que cada paso
 * necesita. La nube de los historiales puede RETENER su respuesta: así se
 * cruza el respaldo en medio, como en un navegador con la red lenta (o con
 * otra pestaña importando). Los nombres y números son de mentira.
 *   1. la subida de una ficha (la vuelta o el toque) que contesta tras importar;
 *   2. lo mismo con OTRA pestaña importando (por eso la cuenta va en el estado
 *      y no en memoria);
 *   3. lo mismo por soltar(): la cuenta que la nube junta mientras entra;
 *   4. cuándo puede pasar: en Ajustes (donde se importa) la vuelta no arranca;
 *   5. el botón de Avanzado, de antes: dejaba encendida la subida sola sobre
 *      el respaldo sin emparejar.
 * Contra f8fedb5 fallan todas menos el CONTROL y la 4.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const { RAIZ, cartera, credito } = require('./banco-nube-crm.js');

const FUENTE_HIST = fs.readFileSync(path.join(RAIZ, 'panel/historiales-auto.js'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 12); i++) await tick(); }

/* La nube: sincronizar_socios guarda cada lote al recibirlo (el servidor ya lo
   aplicó) y, con `retener`, guarda la RESPUESTA hasta soltarRespuestas(). Con
   `vincular` contesta vincular_cuenta_joan (también retenible). */
function nubeHistoriales() {
  const S = { lotes: [], llamadas: 0, retener: false, enEspera: [], vinculos: 0 };
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  const quizas = r => (S.retener ? new Promise(res => S.enEspera.push(() => res(r))) : Promise.resolve(r));
  S.red = (url, cfg) => {
    if (/\/rest\/v1\/rpc\/vincular_cuenta_joan$/.test(url)) {
      S.vinculos++;
      return quizas(resp(200, JSON.stringify({ ok: true, ya_estaba: false, celular: '3000000001', nombre: 'Socio 1' })));
    }
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) return Promise.reject(new Error('sin red en el banco'));
    S.llamadas++;
    const cuerpo = JSON.parse(cfg.body);
    S.lotes.push(cuerpo.p_lote);
    return quizas(resp(200, String(cuerpo.p_lote.length)));
  };
  S.soltarRespuestas = () => { const q = S.enEspera.splice(0); q.forEach(f => f()); return q.length; };
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
/* Igual que el montar() de cliente-por-cliente.test.js. o.almacen: el MISMO
   navegador (otra pestaña del CRM sobre el mismo localStorage); o.sinCargar:
   esa pestaña lee la cartera que ya está en el disco. */
function montar(o) {
  o = o || {};
  const srv = o.srv || nubeHistoriales();
  const P = abrirPanel({ red: (u, c) => srv.red(u, c), almacen: o.almacen });
  const t = relojes(P);
  if (!o.sinCargar) P.cargarCartera(o.cartera || cartera(3, 1));
  else P.ev('DB=cargar()');
  P.ev('_selloDesdeDisco(false)');
  P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
  if (o.estado) P.almacen['joan_crm_historiales'] = JSON.stringify(o.estado);
  P.elems.modal.classList.contains = () => false;
  P.ctx._libro = o.libro || { ok: true, motivo: 'al-dia' };
  P.ctx._porCliente = o.porCliente || null;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' } }; },
    libroAlDia: function () { return _libro; }, libroPorCliente: function () { return _porCliente; } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, srv, t };
}
const listo = m => m.P.ev('HistorialesAuto.listo()');
const cinta = m => m.P.ev('HistorialesAuto.estado()').cinta;
const estadoH = m => JSON.parse(m.P.almacen['joan_crm_historiales'] || '{}');
async function primera(m) { m.t.disparar(5000); await listo(m); await ticks(); }
const cedulasDesde = (m, i) => m.srv.lotes.slice(i).flat().map(x => x.cedula).sort();
const cambiar = (m, js) => m.P.ev(js + '; guardar()');

/* Lo que contesta NubeCRM en cada momento. */
const TODOS_ESPERAN = { ok: false, motivo: 'en-discusion', congeladas: 23 };   // un ajuste en discusión: no se ata a nadie
const UN_AJUSTE = { ok: false, motivo: 'en-discusion', congeladas: 23, clientes: {}, sinCliente: 1 };
const RECIEN_IMPORTADO = { ok: false, motivo: 'falta-emparejar' };             // importar() suelta el espejo
const EMPAREJADO = { ok: false, motivo: 'en-discusion', congeladas: 2 };
const C1_EN_DISCUSION = { ok: false, motivo: 'en-discusion', congeladas: 2, clientes: { C1: { enDiscusion: true } } };

/* La cartera de hoy: a C1 se le registró un crédito al juntar su cuenta (P3).
   El respaldo es de antes: C1 sin ese crédito. */
function deHoy() { const c = cartera(3, 1); c.prestamos.push(credito(3, 1, { fechaDesembolso: '2026-11-14' })); c.contadores.credito = 4; return c; }
const RESPALDO = cartera(3, 1);
function importar(P, db) {
  P.ctx._libro = RECIEN_IMPORTADO; P.ctx._porCliente = RECIEN_IMPORTADO;
  P.ev('importar({target:{files:[{texto:' + JSON.stringify(JSON.stringify(db)) + '}],value:""}})');
}
/* Y el respaldo, ya emparejado: C1 no coincide con la nube (la nube tiene P3). */
async function emparejarConC1EnDiscusion(m) {
  m.P.ctx._libro = EMPAREJADO; m.P.ctx._porCliente = C1_EN_DISCUSION;
  const i = m.srv.lotes.length;
  await m.P.ev('HistorialesAuto.vuelta(true)'); await listo(m); await ticks();
  return i;
}
const fichaC1Desde = (m, i) => m.srv.lotes.slice(i).flat().find(x => x.cedula === '1000001') || null;
const TEXTO_RESPALDO = 'Importaste un respaldo: los historiales vuelven a subir solos en cuanto compruebe que es tu cartera de hoy';

/* La ficha de C1 ya es suelta (Joan juntó su cuenta) y hay un ajuste en
   discusión: esperan todos menos ella. Joan le cambia algo a C1 y, a los 90 s,
   la vuelta la sube sola (subirSueltas). */
async function sueltaSubiendoSola(m) {
  await primera(m);
  assert.equal(m.srv.llamadas, 0, 'precondición: con un ajuste en discusión esperan todos');
  assert.equal((await m.P.ev("HistorialesAuto.subirUna('C1')")).ok, true, 'precondición: Joan juntó a C1');
  assert.ok(estadoH(m).sueltas.C1, 'precondición: C1 quedó suelta');
  cambiar(m, "DB.socios[1].nombre = 'Socio 1 con su credito'");
  m.srv.retener = true;
  const n = m.srv.lotes.length;
  m.t.disparar(90000); await ticks();
  assert.equal(m.srv.enEspera.length, 1, 'precondición: la vuelta no mandó la suelta');
  assert.deepEqual(cedulasDesde(m, n), ['1000001'], 'precondición: subirSueltas mandó a otra');
}

describe('1 · la respuesta que llega después de importar no suelta la ficha en la cartera importada', () => {
  test('subirSueltas (la vuelta) en el aire: el respaldo queda sin sueltas, la línea dice «Importaste un respaldo» y, ya emparejado, la ficha vieja de C1 espera', async () => {
    const m = montar({ cartera: deHoy(), libro: TODOS_ESPERAN, porCliente: UN_AJUSTE });
    await sueltaSubiendoSola(m);
    importar(m.P, RESPALDO);
    assert.deepEqual(estadoH(m).sueltas || {}, {}, 'precondición: carteraReemplazada vació las sueltas');
    m.srv.retener = false;
    m.srv.soltarRespuestas(); await listo(m); await ticks();
    assert.deepEqual(estadoH(m).sueltas || {}, {}, 'la respuesta de la cartera de antes volvió a soltar a C1 en el respaldo');
    assert.deepEqual(estadoH(m).socios || {}, {}, 'la respuesta de la cartera de antes dejó su huella en el respaldo');
    assert.equal(cinta(m).l1, TEXTO_RESPALDO, 'la línea dejó de decir que entró un respaldo');
    const i = await emparejarConC1EnDiscusion(m);
    assert.equal(fichaC1Desde(m, i), null, 'subió la ficha VIEJA de C1 (la del respaldo) estando en discusión');
    /* Con la pausa del respaldo esperan TODOS, no solo C1 (el-respaldo-pausa-
       cliente-por-cliente.test.js): los que coinciden no suben con las cifras
       del grupo del respaldo hasta que la cartera quede comprobada. */
    assert.deepEqual(cedulasDesde(m, i), [], 'con la pausa del respaldo subieron los que coinciden');
  });

  test('subirUna (el toque) en el aire: lo mismo', async () => {
    const m = montar({ cartera: deHoy(), libro: EMPAREJADO, porCliente: C1_EN_DISCUSION });
    await primera(m);
    assert.deepEqual(cedulasDesde(m, 0), ['1000000', '1000002'], 'precondición: C1 espera, los demás suben');
    m.srv.retener = true;
    const p = m.P.ev("HistorialesAuto.subirUna('C1')");
    await ticks();
    assert.equal(m.srv.enEspera.length, 1, 'precondición: subirUna no mandó su ficha');
    importar(m.P, RESPALDO);
    m.srv.retener = false;
    m.srv.soltarRespuestas(); await p; await listo(m); await ticks();
    assert.deepEqual(estadoH(m).sueltas || {}, {}, 'la respuesta de la cartera de antes volvió a soltar a C1 en el respaldo');
    assert.equal(m.P.ev("HistorialesAuto.llaveConfirmada('C1')"), null, 'quedó «confirmada» una ficha del respaldo que no subió');
    assert.equal(cinta(m).l1, TEXTO_RESPALDO, 'la línea dejó de decir que entró un respaldo');
    const i = await emparejarConC1EnDiscusion(m);
    assert.equal(fichaC1Desde(m, i), null, 'subió la ficha VIEJA de C1 (la del respaldo) estando en discusión');
  });

  test('CONTROL: la misma subida con la respuesta ANTES de importar: el respaldo las olvida y C1 espera', async () => {
    const m = montar({ cartera: deHoy(), libro: TODOS_ESPERAN, porCliente: UN_AJUSTE });
    await sueltaSubiendoSola(m);
    m.srv.retener = false;
    m.srv.soltarRespuestas(); await listo(m); await ticks();
    assert.ok(estadoH(m).sueltas.C1);
    importar(m.P, RESPALDO);
    assert.deepEqual(estadoH(m).sueltas || {}, {});
    assert.equal(cinta(m).l1, TEXTO_RESPALDO);
    const i = await emparejarConC1EnDiscusion(m);
    assert.equal(fichaC1Desde(m, i), null);
    assert.deepEqual(cedulasDesde(m, i), [], 'con la pausa del respaldo esperan todos');
  });

  test('lo que le llegaba a la app de C1: su ficha del RESPALDO, sin el crédito que se le registró al juntar', async () => {
    /* Contra f8fedb5 sube la de C1 con 1 crédito (la de hoy tiene 2): el que
       aceptó y se le registró desaparece de su app hasta que Joan decida en
       ☁ Subir. */
    const m = montar({ cartera: deHoy(), libro: TODOS_ESPERAN, porCliente: UN_AJUSTE });
    await sueltaSubiendoSola(m);
    importar(m.P, RESPALDO);
    m.srv.retener = false;
    m.srv.soltarRespuestas(); await listo(m); await ticks();
    const i = await emparejarConC1EnDiscusion(m);
    const c1 = fichaC1Desde(m, i);
    assert.equal(c1, null, c1 ? 'subió la ficha del respaldo de C1 («' + c1.nombre + '», ' + c1.datos.creditos.length +
      ' crédito; la de hoy tiene 2) estando en discusión' : '');
  });
});

describe('2 · otra pestaña del CRM importa mientras esta sube (el mismo navegador)', () => {
  test('la respuesta de esta pestaña no suelta a C1 en el estado que la otra acaba de vaciar', async () => {
    const m = montar({ cartera: deHoy(), libro: TODOS_ESPERAN, porCliente: UN_AJUSTE });
    await sueltaSubiendoSola(m);
    /* La otra pestaña: el mismo localStorage, su propio CRM y su propia pieza. */
    const otra = montar({ almacen: m.P.almacen, sinCargar: true, libro: TODOS_ESPERAN, porCliente: UN_AJUSTE, srv: nubeHistoriales() });
    importar(otra.P, RESPALDO);
    assert.deepEqual(estadoH(m).sueltas || {}, {}, 'precondición: la otra pestaña vació las sueltas');
    m.srv.retener = false;
    m.srv.soltarRespuestas(); await listo(m); await ticks();
    assert.deepEqual(estadoH(m).sueltas || {}, {}, 'la respuesta de esta pestaña soltó a C1 en el respaldo de la otra');
    assert.deepEqual(estadoH(m).socios || {}, {}, 'la respuesta de esta pestaña dejó su huella en el respaldo de la otra');
  });
});

describe('3 · la misma puerta por soltar(): la cuenta que la nube junta mientras entra el respaldo', () => {
  test('juntarCuentaEnLaNube en el aire (el toque, o juntarCuentasPendientes cada 45 s): su respuesta no suelta a C1 en el respaldo', async () => {
    /* C1 ya había subido desde este computador (su huella está) y ahora está en discusión. */
    const m = montar({ cartera: deHoy(), libro: EMPAREJADO, porCliente: C1_EN_DISCUSION,
      estado: { v: 1, socios: { C1: { h: 'vieja', c: '', g: '', k: '1000001' } } } });
    await primera(m);
    assert.deepEqual(cedulasDesde(m, 0), ['1000000', '1000002'], 'precondición: C1 espera');
    m.srv.retener = true;
    const p = m.P.ev("(function(){ const s=DB.socios.find(x=>x.id==='C1'); return juntarCuentaEnLaNube({id:41}, s, PUENTE.llaveEnLaNube(s), 'crm', {}); })()");
    await ticks();
    assert.equal(m.srv.vinculos, 1, 'precondición: la nube no recibió el juntar');
    importar(m.P, RESPALDO);
    m.srv.retener = false;
    m.srv.soltarRespuestas(); const r = await p; await ticks();
    assert.equal(r.ok, true, 'precondición: la nube juntó');
    assert.deepEqual(estadoH(m).sueltas || {}, {}, 'el juntar de la cartera de antes soltó a C1 en el respaldo');
    const i = await emparejarConC1EnDiscusion(m);
    assert.equal(fichaC1Desde(m, i), null, 'subió la ficha VIEJA de C1 (la del respaldo) estando en discusión');
  });
});

describe('4 · cuándo puede pasar (lo que dice la ventana de la carrera)', () => {
  /* importar() vive en Ajustes (v-cfg), y en Ajustes estoyOcupado() dice que sí:
     la vuelta de los 90 s (y la de 30 min, y la de `online`) NO arranca ahí. La
     subida tiene que haber salido antes de entrar a Ajustes (o con el clic en la
     línea, que lleva a Ajustes y sube ya) y su respuesta tardar más que ir al
     botón y escoger el archivo. */
  test('en Ajustes la vuelta de los 90 s no manda nada; el clic en la línea sí, y deja a Joan en Ajustes', async () => {
    const m = montar({ cartera: deHoy(), libro: TODOS_ESPERAN, porCliente: UN_AJUSTE });
    await primera(m);
    assert.equal((await m.P.ev("HistorialesAuto.subirUna('C1')")).ok, true);
    cambiar(m, "DB.socios[1].nombre = 'Socio 1 con su credito'");
    let vista = 'v-cfg';
    m.P.ctx.document.querySelector = sel => (sel === '.view.on' ? { id: vista } : null);
    m.P.ctx.irA = v => { vista = 'v-' + v; };
    m.srv.retener = true;
    const n = m.srv.llamadas;
    m.t.disparar(90000); await ticks();
    assert.equal(m.srv.llamadas, n, 'la vuelta de los 90 s subió con Joan en Ajustes');
    vista = 'v-socios';
    m.P.ev('HistorialesAuto.accion()'); await ticks();
    assert.equal(m.srv.llamadas, n + 1, 'el clic en la línea no subió la suelta');
    m.srv.retener = false; m.srv.soltarRespuestas(); await listo(m); await ticks();
  });
});

describe('5 · lo mismo cierra el botón de Avanzado (de antes: el respaldo entra mientras sube en pedazos)', () => {
  test('subirTodo con un respaldo que entra entre pedazos: no deja encendida la subida sola sobre el respaldo', async () => {
    /* 30 clientes = 2 pedazos de la nube. El botón y «⬆ Importar respaldo» están
       en la misma pantalla (Ajustes). */
    const m = montar({ cartera: cartera(30, 0), libro: TODOS_ESPERAN, porCliente: UN_AJUSTE });
    await primera(m);
    assert.equal(m.srv.llamadas, 0, 'precondición: esperan todos');
    m.srv.retener = true;
    const p = m.P.ev('HistorialesAuto.subirTodo()');
    await ticks();
    assert.equal(m.srv.enEspera.length, 1, 'precondición: no salió el primer pedazo');
    importar(m.P, cartera(30, 0));
    m.srv.retener = false;
    m.srv.soltarRespuestas(); const r = await p; await listo(m); await ticks();
    const e = estadoH(m);
    assert.ok(!e.habilitado, 'el botón dejó encendida la subida sola sobre el respaldo recién importado (sin emparejar): ' + JSON.stringify({ r: r.fase, por: e.habilitadoPor }));
    assert.equal(cinta(m).l1, TEXTO_RESPALDO);
  });
});
