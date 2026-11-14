'use strict';
/* ============================================================================
 * VERIFICACIÓN (copia de trabajo, no va al repo) — 14-nov-2026
 *
 *   env -u TG_PG_BIN timeout 170 node --test pruebas/verificar-fila-sin-cedula.test.js
 *
 * El hallazgo: la reja de LA FILA QUE OTRA FICHA TODAVÍA OCUPA (planDeSubida y
 * subirUna, panel/historiales-auto.js de f8fedb5) solo mira el celular de las
 * fichas CON cédula. Una ficha SIN cédula cuyo celular es la llave con que otra
 * ficha vive en la nube viaja igual, y su upsert cae en ESA fila.
 *
 * Nombres y números de mentira. Se corre con el crm.html de verdad (banco-
 * panel.js) y historiales-auto.js de verdad. La NUBE es un MODELO en JS de
 * sincronizar_socios —base/20260914b_tres_canales.sql §5-bis con el parche de
 * base/20261007c_una_puerta_cierres.sql §4— y de mi_cuenta (20260914b §4). No
 * es Postgres: cada paso cita la línea del SQL que imita.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const { RAIZ, cartera } = require('./banco-nube-crm.js');
const { crear } = require('../panel/historiales-auto.js');
const UP = require('../panel/una-puerta.js');

const FUENTE_HIST = fs.readFileSync(path.join(RAIZ, 'panel/historiales-auto.js'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 8); i++) await tick(); }
const dig = v => String(v == null ? '' : v).replace(/\D/g, '');

/* ---------------------------------------------------------- la nube (modelo) */
function nubeSQL(filas, op) {
  const arreglada = !!(op && op.arreglada);
  const N = { filas: {}, cortes: [], reloj: 0 };
  (filas || []).forEach(f => { N.filas[f.cedula] = Object.assign({ actualizado_en: ++N.reloj }, f); });
  /* fila_vieja_es_de (20261007c 240-251): no hay fila, o su nombre casa. */
  const filaViejaEsDe = (cel, nombre) => !N.filas[cel] || UP.mismoNombre(N.filas[cel].nombre, nombre || 'Socio');
  N.sincronizar = lote => {
    let n = 0;
    for (const item of lote) {
      const cel = dig(item.telefono) || null;                       // 20260914b: cel := nullif(solo_digitos(telefono))
      const ident = dig(item.cedula) || cel;                        //            ident := coalesce(cédula, cel)
      if (!ident) continue;
      let vEn = null, vCel = null;                                  // v_en/v_cel se reinician en cada vuelta
      if (cel && cel !== ident) {                                   // if cel is not null and cel <> ident
        const vieja = N.filas[cel];                                 // select … into … where cedula = cel
        if (vieja) { vEn = vieja.auth_vinculada_en; vCel = vieja.auth_celular; }
        if (vEn != null && !filaViejaEsDe(cel, item.nombre)) {     // 20261007c 296-300: union_que_no_viaja
          N.cortes.push({ fila: cel, celular: vCel });
          vEn = null; vCel = null;
        }
        delete N.filas[cel];                                        // delete … where cedula = cel
      }
      /* LA RECETA (sin correr en Postgres): la fila de ESTA llave, junta y con
         el nombre de otra persona, no le presta su unión al que sube. */
      if (arreglada && N.filas[ident] && N.filas[ident].auth_vinculada_en != null &&
          !UP.mismoNombre(N.filas[ident].nombre, item.nombre || 'Socio')) {
        N.cortes.push({ fila: ident, celular: N.filas[ident].auth_celular });
        N.filas[ident].auth_vinculada_en = null; N.filas[ident].auth_celular = null;
      }
      const ex = N.filas[ident];
      if (!ex) {
        N.filas[ident] = { cedula: ident, celular: cel, nombre: item.nombre || 'Socio', datos: item.datos || {},
                           auth_vinculada_en: vEn, auth_celular: vCel, actualizado_en: ++N.reloj };
      } else {                                                      // on conflict (cedula) do update
        Object.assign(ex, { celular: cel, nombre: item.nombre || 'Socio', datos: item.datos || {},
          auth_vinculada_en: ex.auth_vinculada_en != null ? ex.auth_vinculada_en : vEn,   // coalesce(la de la fila, …)
          auth_celular: ex.auth_celular != null ? ex.auth_celular : vCel,
          actualizado_en: ++N.reloj });
      }
      n++;
    }
    return n;
  };
  /* mi_cuenta (20260914b 180-205): la fila junta con el celular de la sesión. */
  N.miCuenta = cel => {
    const f = Object.values(N.filas).filter(x => x.auth_vinculada_en != null && x.auth_celular === cel)
      .sort((a, b) => b.actualizado_en - a.actualizado_en)[0];
    return f ? { vinculada: true, nombre: f.nombre } : { vinculada: false };
  };
  return N;
}

/* ------------------------------------------------- el CRM de verdad, montado */
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
function montar(o) {
  const N = o.nube, S = { lotes: [] };
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  const red = (url, cfg) => {
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) return Promise.reject(new Error('sin red en el banco'));
    const cuerpo = JSON.parse(cfg.body);
    S.lotes.push(cuerpo.p_lote);
    return Promise.resolve(resp(200, String(N.sincronizar(cuerpo.p_lote))));
  };
  const P = abrirPanel({ red });
  const t = relojes(P);
  P.cargarCartera(o.cartera);
  P.ev('_selloDesdeDisco(false)');
  P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
  if (o.estado) P.almacen['joan_crm_historiales'] = JSON.stringify(o.estado);
  P.elems.modal.classList.contains = () => false;
  P.ctx._libro = o.libro;
  P.ctx._porCliente = o.porCliente || null;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'x', l2: '' } }; },
    libroAlDia: function () { return _libro; }, libroPorCliente: function () { return _porCliente; } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, S, t, N };
}
const listo = m => m.P.ev('HistorialesAuto.listo()');
async function primera(m) { m.t.disparar(5000); await listo(m); await ticks(); }
async function otraVuelta(m) { await m.P.ev('HistorialesAuto.vuelta(true)'); await listo(m); await ticks(); }
const llaves = m => m.S.lotes.flat().map(x => dig(x.cedula) || dig(x.telefono));

/* ------------------------------------------------------------ el escenario */
/* Socio 1 vivía en la nube con la llave 3000000002 (su celular de entonces,
   sin cédula) y su cuenta (la del 3000000002) está junta con ESA fila. Joan le
   cargó la cédula 1000001 y su celular nuevo 3000000009. Socio 2, sin cédula,
   tiene hoy el 3000000002 (la línea que compartían, o la que le quedó). */
function carteraCaraA() {
  const c = cartera(3, 1);
  c.socios[1].telefono = '3000000009';
  c.socios[2].cedula = '';
  c.socios[2].telefono = '3000000002';
  return c;
}
function carteraCaraB() {     // lo mismo, pero Socio 2 CON cédula
  const c = cartera(3, 1);
  c.socios[1].telefono = '3000000009';
  return c;
}
const ESTADO_C1_EN_R = { v: 1, socios: { C1: { h: 'vieja', c: '', g: '', k: '3000000002' } } };
const FILA_DE_SOCIO1 = () => nubeSQL([{ cedula: '3000000002', celular: '3000000002', nombre: 'Socio 1',
  datos: { de: 'Socio 1' }, auth_vinculada_en: '2026-11-01T15:00:00Z', auth_celular: '3000000002' }]);
const DISCUSION_C1 = { ok: false, motivo: 'en-discusion', congeladas: 2, clientes: { C1: { enDiscusion: true } } };
const UN_AJUSTE = { ok: false, motivo: 'en-discusion', congeladas: 1, clientes: {}, sinCliente: 1 };

describe('cara (a): la ficha SIN cédula cae en la fila (y la unión) de otra', () => {
  test('pura: con Socio 1 esperando (o.fuera), planDeSubida no deja viajar a Socio 2', () => {
    const H = crear({});
    const lote = [
      { socioId: 'C1', cedula: '1000001', telefono: '3000000009', nombre: 'Socio 1', datos: { a: 1 } },
      { socioId: 'C2', cedula: '', telefono: '3000000002', nombre: 'Socio 2', datos: { a: 2 } }
    ];
    const p = H._puro.planDeSubida(lote, ESTADO_C1_EN_R.socios, { fuera: { C1: true } });
    assert.deepEqual(p.enviar.map(e => e.id), [], 'Socio 2 viaja con la llave 3000000002, la fila donde vive Socio 1');
    assert.ok(p.chocan.some(c => c.id === 'C2' && c.motivo === 'fila'));
  });

  test('la vuelta real (23 en discusión, subida sin encender): la cuenta de Socio 1 no ve la ficha de Socio 2', async () => {
    const m = montar({ cartera: carteraCaraA(), estado: ESTADO_C1_EN_R, nube: FILA_DE_SOCIO1(),
      libro: { ok: false, motivo: 'en-discusion', congeladas: 2 }, porCliente: DISCUSION_C1 });
    await primera(m);
    assert.ok(m.S.lotes.length >= 1, 'precondición: la vuelta subió a los demás (cliente por cliente)');
    const ve = m.N.miCuenta('3000000002');
    assert.equal(ve.nombre, 'Socio 1', 'la cuenta de Socio 1 ve ahora la ficha de ' + ve.nombre + ' (su nombre, su deuda, su historial); subió: ' + llaves(m).join(','));
    assert.ok(!llaves(m).includes('3000000002'), 'subió un paquete con la llave 3000000002: ' + llaves(m).join(','));
    const c = m.P.ev('HistorialesAuto.estado()');
    assert.equal(c.plan.chocan, 1, 'la línea no cuenta a la que espera por la fila');
  });

  test('subirUna(Socio 2) (Joan la junta o le da clave nueva): no sube sobre la fila de Socio 1, y dice por qué', async () => {
    const m = montar({ cartera: carteraCaraA(), estado: ESTADO_C1_EN_R, nube: FILA_DE_SOCIO1(),
      libro: { ok: false, motivo: 'en-discusion', congeladas: 1 }, porCliente: UN_AJUSTE });
    await primera(m);
    assert.equal(m.S.lotes.length, 0, 'precondición: con un ajuste en discusión no sube nadie en la vuelta');
    const r = await m.P.ev("HistorialesAuto.subirUna('C2')");
    assert.equal(r.ok, false, 'subió: ' + JSON.stringify(r));
    assert.equal(r.fase, 'fila');
    assert.match(r.motivo, /Su celular es todavía la llave con que Socio 1 vive en la nube/);
    assert.equal(m.N.miCuenta('3000000002').nombre, 'Socio 1');
  });

  test('con la cartera ya comprobada (todos viajan, dos vueltas): la cuenta de Socio 1 no termina viendo a Socio 2',
    { todo: 'la reja solo sabe de la fila mientras Socio 1 no suba: lo cierra la nube (ver el arreglo)' }, async () => {
    const m = montar({ cartera: carteraCaraA(), estado: ESTADO_C1_EN_R, nube: FILA_DE_SOCIO1(),
      libro: { ok: true, motivo: 'al-dia' } });
    await primera(m);
    await otraVuelta(m);
    assert.equal(m.N.miCuenta('3000000002').nombre, 'Socio 1', 'la cuenta de Socio 1 ve la ficha de Socio 2');
  });

  test('sin la huella de Socio 1 en este computador (un respaldo importado la borra): igual',
    { todo: 'la reja no puede saber de una fila que este computador no anotó: lo cierra la nube' }, async () => {
    const m = montar({ cartera: carteraCaraA(), nube: FILA_DE_SOCIO1(),
      libro: { ok: false, motivo: 'en-discusion', congeladas: 2 }, porCliente: DISCUSION_C1 });
    await primera(m);
    assert.equal(m.N.miCuenta('3000000002').nombre, 'Socio 1', 'la cuenta de Socio 1 ve la ficha de Socio 2');
  });
});

describe('cara (b): la ficha CON cédula cuya mudanza lee la fila vieja de otra', () => {
  test('pura: si la otra viaja pero con OTRO celular, su mudanza no libera la fila: la ficha espera', () => {
    const H = crear({});
    const lote = [
      { socioId: 'C1', cedula: '1000001', telefono: '3000000009', nombre: 'Socio 1', datos: { a: 1 } },
      { socioId: 'C2', cedula: '1000002', telefono: '3000000002', nombre: 'Socio 2', datos: { a: 2 } }
    ];
    const p = H._puro.planDeSubida(lote, ESTADO_C1_EN_R.socios, {});
    assert.deepEqual(p.enviar.map(e => e.id), ['C1'], 'Socio 2 viaja y en la nube le corta la unión a Socio 1');
  });

  test('pura: si la otra viaja con ESE celular (su mudanza sí lee la fila), va antes aunque las dos estrenen llave', () => {
    const H = crear({});
    const lote = [
      { socioId: 'X', cedula: '1000003', telefono: '3000000002', nombre: 'Equis Uno', datos: { a: 1 } },
      { socioId: 'Y', cedula: '1000001', telefono: '3000000002', nombre: 'Ye Dos', datos: { a: 2 } }
    ];
    const regs = { X: { h: 'v', c: '', g: '', k: '3000000005' }, Y: { h: 'v', c: '', g: '', k: '3000000002' } };
    const orden = H._puro.planDeSubida(lote, regs, {}).enviar.map(e => e.id);
    assert.ok(orden.indexOf('Y') >= 0, 'Y no viajó: ' + orden.join(' -> '));
    assert.ok(orden.indexOf('X') < 0 || orden.indexOf('Y') < orden.indexOf('X'), 'X lee la fila de Y antes de que Y la mude: ' + orden.join(' -> '));
  });

  test('la vuelta real con todos viajando: a Socio 1 no se le corta la unión en la primera vuelta', async () => {
    const m = montar({ cartera: carteraCaraB(), estado: ESTADO_C1_EN_R, nube: FILA_DE_SOCIO1(),
      libro: { ok: true, motivo: 'al-dia' } });
    await primera(m);
    assert.deepEqual(m.N.cortes, [], 'la subida le cortó la unión a la cuenta de Socio 1');
  });

  test('y en la vuelta siguiente tampoco', { todo: 'la mudanza de Socio 1 no lee su fila vieja (where cedula = cel de hoy): lo cierra la nube' }, async () => {
    const m = montar({ cartera: carteraCaraB(), estado: ESTADO_C1_EN_R, nube: FILA_DE_SOCIO1(),
      libro: { ok: true, motivo: 'al-dia' } });
    await primera(m);
    await otraVuelta(m);
    assert.deepEqual(m.N.cortes, [], 'la subida le cortó la unión a la cuenta de Socio 1');
  });
});

/* Lo que queda abierto con el cliente arreglado, contra el MODELO de la receta
   de la nube (no es Postgres: dice lo que la receta tiene que hacer). */
const FILA_DE_SOCIO1_ARREGLADA = () => nubeSQL([{ cedula: '3000000002', celular: '3000000002', nombre: 'Socio 1',
  datos: { de: 'Socio 1' }, auth_vinculada_en: '2026-11-01T15:00:00Z', auth_celular: '3000000002' }], { arreglada: true });
describe('con la receta de la nube (modelo): la cuenta de Socio 1 nunca ve a Socio 2', () => {
  test('todos viajan, dos vueltas: la unión se suelta (y queda anotada) en vez de mostrarle otra ficha', async () => {
    const m = montar({ cartera: carteraCaraA(), estado: ESTADO_C1_EN_R, nube: FILA_DE_SOCIO1_ARREGLADA(),
      libro: { ok: true, motivo: 'al-dia' } });
    await primera(m);
    await otraVuelta(m);
    assert.ok(llaves(m).includes('3000000002'), 'precondición: en la segunda vuelta Socio 2 sí subió');
    assert.deepEqual(m.N.miCuenta('3000000002'), { vinculada: false });
    assert.deepEqual(m.N.cortes, [{ fila: '3000000002', celular: '3000000002' }]);
  });
  test('sin la huella de Socio 1 en este computador: igual', async () => {
    const m = montar({ cartera: carteraCaraA(), nube: FILA_DE_SOCIO1_ARREGLADA(),
      libro: { ok: false, motivo: 'en-discusion', congeladas: 2 }, porCliente: DISCUSION_C1 });
    await primera(m);
    assert.deepEqual(m.N.miCuenta('3000000002'), { vinculada: false });
    assert.equal(m.N.cortes.length, 1);
  });
});
