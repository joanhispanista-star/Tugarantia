'use strict';
/* ============================================================================
 * CLIENTE POR CLIENTE — 14 de noviembre de 2026
 *
 *   node --test pruebas/cliente-por-cliente.test.js
 *
 * Con 23 fichas en discusión (tocadas en el computador y en el celular), los
 * historiales no le subían a NADIE, y el toque de «Juntar y desembolsar» no
 * podía subir la ficha del cliente: Joan no pudo registrar el crédito que el
 * cliente ya había aceptado. Joan: «eso de subir a la nube manualmente
 * quítalo, quiero que sea automático».
 *
 * Lo que vigila este archivo (historiales-auto.js con el crm.html de verdad y
 * un NubeCRM de mentira que contesta lo que cada prueba necesita):
 *   1. con fichas en discusión suben solos los demás clientes; los de la
 *      discusión esperan, y la línea los cuenta sin decir «al día»;
 *   2. lo que no se puede atar a un cliente (un ajuste en discusión) sigue
 *      frenando a todos, como antes;
 *   3. subirUna sube SOLO la ficha del cliente que Joan está juntando, aunque
 *      esté en discusión, y con las demás puertas puestas.
 * Las pruebas de 1 y 3 fallan contra 952e5fc (v147, sin publicar), salvo
 * «cuando la discusión se resuelve», que vigila el final de siempre; las de 2
 * vigilan que lo de antes siga igual.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const { RAIZ, cartera } = require('./banco-nube-crm.js');

const FUENTE_HIST = fs.readFileSync(path.join(RAIZ, 'panel/historiales-auto.js'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 8); i++) await tick(); }
const plano = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '');

/* Una nube de sincronizar_socios que guarda cada lote. modo 'clave' contesta
   lo que contesta clave_ok con la clave equivocada. */
function nubeHistoriales() {
  const S = { lotes: [], llamadas: 0, modo: 'ok' };
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  S.red = (url, cfg) => {
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) return Promise.reject(new Error('sin red en el banco'));
    S.llamadas++;
    const cuerpo = JSON.parse(cfg.body);
    if (S.modo === 'clave') return Promise.resolve(resp(400, '{"message":"clave de sincronización incorrecta"}'));
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
/* o.libro: lo que contesta NubeCRM.libroAlDia. o.porCliente: lo que contesta
   NubeCRM.libroPorCliente; si no viene, el NubeCRM no la tiene (uno viejo). */
function montar(o) {
  o = o || {};
  const srv = nubeHistoriales();
  const P = abrirPanel({ red: (u, c) => srv.red(u, c) });
  const t = relojes(P);
  P.cargarCartera(o.cartera || cartera(3, 1));
  P.ev('_selloDesdeDisco(false)');
  P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
  if (o.estado) P.almacen['joan_crm_historiales'] = JSON.stringify(o.estado);
  P.elems.modal.classList.contains = () => false;
  P.ctx._libro = o.libro || { ok: true, motivo: 'al-dia' };
  P.ctx._porCliente = o.porCliente || null;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' } }; },
    libroAlDia: function () { return _libro; }` +
    ('porCliente' in o ? ', libroPorCliente: function () { return _porCliente; }' : '') + ' };');
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, srv, t };
}
const listo = m => m.P.ev('HistorialesAuto.listo()');
const cinta = m => m.P.ev('HistorialesAuto.estado()').cinta;
const estadoH = m => JSON.parse(m.P.almacen['joan_crm_historiales'] || '{}');
async function primera(m) { m.t.disparar(5000); await listo(m); await ticks(); }
const subidos = m => m.srv.lotes.flat().map(x => x.cedula).sort();

const DISCUSION_C1 = { ok: false, motivo: 'en-discusion', congeladas: 2, clientes: { C1: { enDiscusion: true } } };
const UN_AJUSTE = { ok: false, motivo: 'en-discusion', congeladas: 1, clientes: {}, sinCliente: 1 };

describe('1 · con fichas en discusión suben los demás, cliente por cliente', () => {
  test('la primera vuelta sube a los dos que coinciden y deja esperando al de la discusión, sin encender la subida para siempre', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 2 }, porCliente: DISCUSION_C1 });
    await primera(m);
    assert.equal(m.srv.lotes.length, 1, 'no subió a nadie');
    assert.deepEqual(subidos(m), ['1000000', '1000002']);
    assert.ok(!estadoH(m).habilitado, 'encendió la subida para siempre con fichas en discusión');
    const c = cinta(m);
    assert.equal(c.clase, 'ojo', 'dijo «al día» en calma con un cliente esperando');
    assert.match(c.l1, /, menos 1 cliente$/);
    assert.match(plano(c.l2), /espera 1 cliente cuya ficha no coincide con la nube \(la tocaste aquí y en el celular\)/);
    assert.match(plano(c.l2), /si juntas su cuenta, su ficha sube igual/);
  });

  test('cuando la discusión se resuelve, la cartera queda comprobada y sube también el que esperaba', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 2 }, porCliente: DISCUSION_C1 });
    await primera(m);
    m.P.ctx._libro = { ok: true, motivo: 'al-dia' };
    await m.P.ev('HistorialesAuto.vuelta(false)');
    await listo(m); await ticks();
    assert.deepEqual(subidos(m), ['1000000', '1000001', '1000002']);
    assert.ok(estadoH(m).habilitado, 'no quedó encendida con la cartera ya comprobada');
    assert.doesNotMatch(cinta(m).l1, /menos/);
  });

  test('con la nube más nueva para un cliente (lo cobrado en el celular), ese espera y los demás suben', async () => {
    const m = montar({ libro: { ok: false, motivo: 'nube-mas-nueva', fichas: 1 },
      porCliente: { ok: false, motivo: 'nube-mas-nueva', fichas: 1, clientes: { C2: { masNueva: true } } } });
    await primera(m);
    assert.deepEqual(subidos(m), ['1000000', '1000001']);
    assert.match(plano(cinta(m).l2), /espera 1 cliente cuya ficha tiene algo más nuevo en la nube/);
  });

  test('mientras la comparación con la nube viene en camino, espera y lo dice (no «decide en ☁ Subir»); al volver, suben los demás', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 2 }, porCliente: { ok: false, motivo: 'comparando' } });
    await primera(m);
    assert.equal(m.srv.llamadas, 0);
    const c = cinta(m);
    assert.equal(c.fase, 'esperando-libro');
    assert.match(c.l2, /Estoy comparando tu cartera con lo que hay en la nube/);
    assert.doesNotMatch(c.l2, /paso 7/);
    m.P.ctx._porCliente = DISCUSION_C1;
    m.P.ev('HistorialesAuto.libroCambio()');
    await listo(m); await ticks();
    assert.deepEqual(subidos(m), ['1000000', '1000002'], 'no subieron los demás al volver la comparación');
  });
});

describe('2 · lo de antes, igual', () => {
  test('lo que no se puede atar a un cliente (un ajuste en discusión) sigue frenando a todos, y lo dice', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 1 }, porCliente: UN_AJUSTE });
    await primera(m);
    assert.equal(m.srv.llamadas, 0, 'subió con un ajuste en discusión');
    const c = cinta(m);
    assert.equal(c.fase, 'esperando-libro');
    assert.match(c.l2, /1 ficha de tu cartera en discusión/);
  });

  test('sin la pregunta cliente por cliente (un nube-crm.js viejo), espera como antes', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 2 } });
    await primera(m);
    assert.equal(m.srv.llamadas, 0);
    assert.equal(cinta(m).fase, 'esperando-libro');
  });
});

describe('3 · la ficha del cliente que Joan junta sube sola, aunque esté en discusión', () => {
  test('sube SOLO esa, sin encender la subida para siempre ni mover «tus clientes ven», y queda confirmada para juntar', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 1 }, porCliente: UN_AJUSTE });
    await primera(m);
    assert.equal(m.srv.llamadas, 0, 'precondición: la cartera está frenada');
    const r = await m.P.ev("HistorialesAuto.subirUna('C1')");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(m.srv.lotes.length, 1);
    assert.deepEqual(m.srv.lotes[0].map(x => x.cedula), ['1000001'], 'subió a otros con ella');
    assert.equal(m.P.ev("HistorialesAuto.llaveConfirmada('C1')"), '1000001');
    assert.equal(m.P.ev("HistorialesAuto.llaveConfirmada('C0')"), null);
    const e = estadoH(m);
    assert.ok(!e.habilitado, 'una sola ficha encendió la subida de todos');
    assert.ok(!e.ultimaSubida, 'una sola ficha movió la hora de «tus clientes ven»');
    assert.equal(cinta(m).fase, 'esperando-libro', 'la línea dejó de decir que la cartera espera');
  });

  test('con la cartera sin emparejar (un respaldo recién importado) no sube ni esa, y dice por qué', async () => {
    const m = montar({ libro: { ok: false, motivo: 'falta-emparejar' }, porCliente: { ok: false, motivo: 'falta-emparejar' } });
    await primera(m);
    const r = await m.P.ev("HistorialesAuto.subirUna('C1')");
    assert.equal(r.ok, false);
    assert.equal(r.fase, 'esperando-libro');
    assert.match(r.motivo, /emparejando tu cartera con la nube/);
    assert.equal(m.srv.llamadas, 0);
  });

  test('no se salta el freno de la clave: con la clave recién rechazada no gasta otro intento de todos', async () => {
    const m = montar({ libro: { ok: true, motivo: 'al-dia' } });
    m.srv.modo = 'clave';
    await primera(m);
    const n = m.srv.llamadas;
    assert.ok(n >= 1, 'precondición: la vuelta probó la clave');
    const r = await m.P.ev("HistorialesAuto.subirUna('C1')");
    assert.equal(r.ok, false);
    assert.equal(r.fase, 'clave');
    assert.equal(m.srv.llamadas, n, 'gastó otro intento con la clave mala');
  });

  test('una ficha con el mismo celular que otra no sube sola (la nube las tomaría por la misma persona)', async () => {
    const c = cartera(3, 1);
    c.socios[2].cedula = ''; c.socios[2].telefono = c.socios[1].telefono;
    c.socios[1].cedula = '';
    const m = montar({ cartera: c, libro: { ok: false, motivo: 'en-discusion', congeladas: 1 }, porCliente: UN_AJUSTE });
    await primera(m);
    const r = await m.P.ev("HistorialesAuto.subirUna('C1')");
    assert.equal(r.ok, false);
    assert.equal(r.fase, 'chocan');
    assert.match(r.motivo, /mismo celular o la misma cédula que otra ficha/);
    assert.equal(m.srv.llamadas, 0);
  });

  test('si su celular es todavía la llave con que OTRA ficha vive en la nube, no sube sola y nombra a la otra', async () => {
    const m = montar({ libro: { ok: false, motivo: 'en-discusion', congeladas: 1 }, porCliente: UN_AJUSTE,
      estado: { v: 1, socios: { C2: { h: 'vieja', c: '', g: '', k: '3000000001' } } } });
    await primera(m);
    const r = await m.P.ev("HistorialesAuto.subirUna('C1')");
    assert.equal(r.ok, false);
    assert.equal(r.fase, 'fila');
    assert.match(r.motivo, /Su celular es todavía la llave con que Socio 2 vive en la nube/);
    assert.equal(m.srv.llamadas, 0);
  });

  test('con la cartera ya comprobada, subirUna sube esa y la vuelta de siempre sigue igual para los demás', async () => {
    const m = montar({ libro: { ok: true, motivo: 'al-dia' } });
    await primera(m);
    assert.deepEqual(subidos(m), ['1000000', '1000001', '1000002']);
    const r = await m.P.ev("HistorialesAuto.subirUna('C0')");
    assert.equal(r.ok, true);
    assert.equal(m.srv.lotes.length, 2);
    assert.equal(cinta(m).fase, 'al-dia');
  });
});
