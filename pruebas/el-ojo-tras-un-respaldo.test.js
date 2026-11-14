'use strict';
/* ============================================================================
 * VERIFICACIÓN — «Tras importar un respaldo, el «Ojo» y la línea culpan al
 * celular, y juntar le devuelve al cliente una deuda que ya pagó».
 * 14 de noviembre de 2026, revisión de f8fedb5.
 *
 *   env -u TG_PG_BIN timeout 170 node --test pruebas/verificar-respaldo-ojo.test.js
 *
 * Todo de verdad salvo la red: el NubeCRM del banco (banco-nube-crm.js, con su
 * emparejo y su comparación contra un panel_empujar con las reglas del SQL),
 * crm.html con su importar() y su cuadro de «🔗 Juntar y desembolsar», y
 * historiales-auto.js. Los dos almacenes van aparte (el del NubeCRM y el de la
 * pestaña), con la MISMA cartera, como en todo-sube-solo-23-oct.test.js.
 *
 * La historia: Jorge pagó su crédito y su app lo ve pagado. Joan lo marcó EN
 * ESTE COMPUTADOR (el celular no tocó nada). Después importa un respaldo de
 * antes de ese pago, y Jorge acepta un crédito nuevo.
 * Las pruebas 2, 3 y 4 fallan contra f8fedb5 (el texto culpa al celular); la 1
 * vigila la precondición (que el NubeCRM de verdad deja esa ficha en discusión).
 * Nombres y números de mentira.
 * ==========================================================================*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');
const { asentar } = require('./esperar.js');

const FUENTE_HIST = fs.readFileSync(path.join(B.RAIZ, 'panel/historiales-auto.js'), 'utf8');
const clon = v => JSON.parse(JSON.stringify(v));
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const plano = h => String(h == null ? '' : h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const CLAVE = 'clave-de-prueba-bien-larga';
const CEL = '3001112222';
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
const CREADA = '2026-11-12T15:00:00Z';
const REG = { id: 41, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, origen: 'abierto', estado: 'nuevo',
  creado_en: '2026-11-08T14:55:00Z', datos: { nombres: 'Jorge', apellidos: 'Antiguo', celular: CEL } };
function aceptada() {
  const s = { id: 's1', nombre: 'Jorge Antiguo', cedula: CEL, celular: CEL, estado: 'aceptada', aceptada_en: '2026-11-13T13:38:00Z',
    app: 'tugarantia', origen: 'nube', cuenta_sin_juntar: true, registro_id: 41,
    capital: 1500000, pedido_monto: 1500000, producto: 'quincenal', fecha_corte: enDias(30),
    pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30), dias: 30 }, datos: {},
    contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30, costo_pct: 20,
                       texto: '', por: 'joan', creada_en: CREADA } };
  s.contrapropuesta.condiciones = { version: '2026-10-22', aceptadas_en: '2026-11-13T13:38:00Z',
    lineas: [{ clave: 'recibes', k: 'Recibes', v: '$1.200.000' }], tope_mora: null,
    base: { capital: 1200000, total: 1440000, fecha_pago: s.contrapropuesta.fecha_pago, creada_en: CREADA } };
  s.destino_desembolso = { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: CREADA };
  return s;
}
const CUENTA = { registro_id: 41, celular: CEL, cuenta: true, cuenta_creada_en: '2026-11-08T14:50:00Z' };

/* La cartera del respaldo: tres clientes con un crédito cada uno; C1 es Jorge
   (sin cédula, con su celular), y P1 es su crédito, todavía sin pagar. */
function carteraDelRespaldo() {
  const db = B.cartera(3, 1);
  Object.assign(db.socios[1], { nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, whatsappIgual: true,
    referencia: { nombre: '', telefono: '' } });
  db.prestamos[1].socioNombre = 'Jorge Antiguo';
  return db;
}

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

/* La red de la pestaña: sincronizar_socios (los historiales) y lo del toque. */
function redDeLaPestana() {
  const S = { lotes: [], vistas: [] };
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  S.red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    let c = null; try { c = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { c = null; }
    S.vistas.push(fn);
    if (fn === 'sincronizar_socios') { S.lotes.push(c.p_lote); return Promise.resolve(resp(200, c.p_lote.length)); }
    if (fn === 'cuentas_de_registros') return Promise.resolve(resp(200, [CUENTA]));
    if (fn === 'vincular_cuenta_joan') return Promise.resolve(resp(200, { ok: true, ya_estaba: false, nombre: 'Jorge Antiguo', celular: CEL }));
    if (fn === 'listar_registros') return Promise.resolve(resp(200, []));
    if (fn === 'archivos_de_registro' || fn === 'registro_archivos') return Promise.resolve(resp(200, { ok: true, fotos: {}, huella: null }));
    if (fn === 'marcar_solicitud' || fn === 'marcar_registro') return Promise.resolve(resp(200, { ok: true }));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return S;
}

/* Lo último que la app de Jorge recibió (su paquete), y su crédito P1 en él.
   El paquete no lleva el id: P1 es el número 2 de la cartera, «CR-0002». */
function paqueteDeJorge(S) {
  const suyos = S.lotes.flat().filter(x => x.telefono === CEL);
  return suyos[suyos.length - 1];
}
function p1EnSuApp(S) {
  const ult = paqueteDeJorge(S);
  return ult ? (ult.datos.creditos || []).find(c => c.codigo === 'CR-0002') : undefined;
}

/* o.conGestion: además del pago, Joan anotó una gestión de cobranza después
   del respaldo (DB.gestiones, uno de los tres ajustes que suben). */
async function laHistoria(o) {
  o = o || {};
  /* 1. El computador de Joan, emparejado con la nube. Ahí exporta el respaldo. */
  const respaldo = carteraDelRespaldo();
  const m = B.montar({ db: clon(respaldo) });
  await B.sembrar(m); await ticks();

  /* 2. Después, Joan marca pagado el crédito de Jorge EN ESTE COMPUTADOR, y sube solo. */
  const hoy = B.leerDisco(m.alm);
  Object.assign(hoy.prestamos.find(p => p.id === 'P1'), { pagado: true, fechaPagado: '2026-10-15' });
  if (o.conGestion) hoy.gestiones.push({ id: 'G1', persona_id: 'C0', fecha: '2026-10-16', tipo: 'contesto', nota: 'promete el viernes' });
  /* o.otraEnDiscusion (el uso real de Joan: la subida nunca se encendió): el
     celular y este computador tocaron a la vez el crédito de C2, que choca y
     queda en discusión desde ANTES del respaldo. */
  if (o.otraEnDiscusion) {
    m.srv.celular('creditos', 'P2', d => { d.abonosCapital = [{ fecha: '2026-10-22', monto: 100000 }]; });
    hoy.prestamos.find(p => p.id === 'P2').abonos.push({ fecha: '2026-10-23', monto: 20000 });
  }
  assert.ok(m.tab.guardar(hoy));
  await m.C.vuelta(true); await ticks();
  assert.equal(m.srv.creditos.P1.datos.pagado, true, 'precondición: el pago está en la nube');
  assert.equal(m.srv.creditos.P1.actualizado_por, 'computador', 'precondición: lo subió el computador, no el celular');
  if (o.otraEnDiscusion) {
    assert.equal((B.congeladas(m.alm)['creditos|P2'] || {}).motivo, 'choque', 'precondición: la ficha de C2 quedó en discusión');
  }

  /* 3. La pestaña del CRM con esa cartera: los historiales le suben a Jorge su crédito pagado. */
  const S = redDeLaPestana();
  const P = abrirPanel({ red: S.red });
  const t = relojesPanel(P);
  P.cargarCartera(B.leerDisco(m.alm));
  P.ev('_selloDesdeDisco(false)');
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.elems.modal.classList.contains = () => false;
  P.ctx.open = () => {};
  P.ctx._C = m.C;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'x', l2: '' } }; },
    libroAlDia: function () { return _C.libroAlDia(); },
    libroPorCliente: function () { return _C.libroPorCliente(); },
    libroAlDiaEsperando: function (op) { return _C.libroAlDiaEsperando(op); } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  t.disparar(5000); await P.ev('HistorialesAuto.listo()'); await ticks();
  assert.equal(p1EnSuApp(S) && p1EnSuApp(S).pagado, true, 'precondición: la app de Jorge ve su crédito pagado');
  const habilitadoAntes = !!JSON.parse(P.almacen.joan_crm_historiales || '{}').habilitado;

  /* 4. Joan importa el respaldo (Ajustes → Importar): importar() de verdad. */
  P.ctx.confirm = () => true;
  P.ev('importar({target:{files:[{texto:' + JSON.stringify(JSON.stringify(respaldo)) + '}],value:""}})');
  /* …y el NubeCRM ve lo mismo: la cartera del respaldo, sin espejo. Se empareja solo. */
  assert.ok(m.tab.guardar(clon(respaldo)));
  m.alm.removeItem(B.ESPEJO);
  await m.C.vuelta(false); await ticks();
  assert.equal(m.C.estado().fase, 'lista', 'precondición: se emparejó sola');

  /* 5. La vuelta de los historiales después del respaldo. */
  await P.ev('HistorialesAuto.vuelta(false)'); await P.ev('HistorialesAuto.listo()'); await ticks();
  return { m, P, S, t, habilitadoAntes };
}

/* El cuadro de «🔗 Juntar y desembolsar» de Jorge, y el «Ojo» que pintó. */
async function abrirSuCuadro(P) {
  P.ev('_registros = ' + JSON.stringify([REG]));
  P.ev('_solicitudes = ' + JSON.stringify([aceptada()]));
  P.ev("juntarYDesembolsar('s1')");
  await asentar(40);
  assert.equal(P.elems.mTitle.textContent, '¿Es la misma persona?');
  const cuadro = plano(P.elems.juntarBoton.innerHTML);
  const ojo = String(P.ev('textoOjoFicha(suFichaEnDiscusion(DB.socios.find(x=>x.id==="C1")))'));
  assert.ok(ojo && cuadro.indexOf(plano(ojo)) >= 0, 'precondición: el cuadro de Jorge trae su «Ojo»: ' + cuadro);
  return { cuadro, ojo };
}
const CULPA_AL_CELULAR = /la tocaste aquí y en el celular|lo que anotaste en el celular|si la tocaste en el celular|\(lo del celular\)/;

test('1 · tras importar un respaldo, la ficha de Jorge queda «en discusión» por el respaldo (el celular no tocó nada)', async () => {
  const { m } = await laHistoria();
  const lib = JSON.parse(JSON.stringify(m.C.libroAlDia()));
  assert.deepEqual(lib, { ok: false, motivo: 'en-discusion', congeladas: 1 });
  const pc = JSON.parse(JSON.stringify(m.C.libroPorCliente()));
  assert.equal(pc.motivo, 'en-discusion');
  assert.deepEqual(Object.keys(pc.clientes), ['C1']);
  assert.equal(pc.clientes.C1.enDiscusion, true);
  const cong = B.congeladas(m.alm)['creditos|P1'];
  assert.equal(cong && cong.motivo, 'difieren', 'la discusión salió del emparejo con el respaldo');
});

test('2 · tras importar un respaldo, la línea de Ajustes no le echa la culpa al celular', async () => {
  const { P } = await laHistoria();
  const est = JSON.parse(P.almacen.joan_crm_historiales || '{}');
  assert.equal(est.pausa && est.pausa.motivo, 'respaldo', 'precondición: la pausa del respaldo sigue puesta');
  const c = P.ev('HistorialesAuto.estado()').cinta;
  const l = plano(c.l1 + ' · ' + c.l2);
  /* Con la pausa del respaldo esperan todos, no solo Jorge (el-respaldo-pausa-
     cliente-por-cliente.test.js): la línea es la de «Importaste un respaldo»,
     con la ficha en discusión, y no la de los que esperan cliente por cliente. */
  assert.match(l, /Hay 1 ficha de tu cartera en discusión/, 'precondición: la ficha de Jorge está en discusión: ' + l);
  assert.doesNotMatch(l, CULPA_AL_CELULAR, 'la línea culpa al celular de lo que trajo el respaldo: ' + l);
  assert.match(l, /^Importaste un respaldo/, 'la línea no dice que entró un respaldo: ' + l);
});

test('3 · tras importar un respaldo, el «Ojo» del cuadro de Jorge dice la causa; el toque sube lo del respaldo y lo deja suelto', async () => {
  const { P, S, t } = await laHistoria();
  const { ojo } = await abrirSuCuadro(P);

  /* Lo que pasa si Joan toca, como hoy. */
  const toque = /juntarConUnToque\('([^']+)','([^']+)',(true|false)\)/.exec(P.elems.juntarBoton.innerHTML);
  assert.ok(toque, 'el cuadro no ofreció el toque');
  P.ev('juntarConUnToque(' + JSON.stringify(toque[1]) + ',' + JSON.stringify(toque[2]) + ',' + toque[3] + ')');
  await asentar(40);
  const p1 = p1EnSuApp(S);
  const est = JSON.parse(P.almacen.joan_crm_historiales || '{}');
  const hechos = { p1Pagado: p1 && p1.pagado, suelta: !!(est.sueltas && est.sueltas.C1), pausa: est.pausa && est.pausa.motivo,
    juntadas: S.vistas.filter(f => f === 'vincular_cuenta_joan').length,
    creditos: JSON.parse(P.ev('JSON.stringify(DB.prestamos.filter(p=>p.socioId==="C1").length)')) };
  assert.equal(hechos.p1Pagado, false, 'precondición: la app de Jorge vuelve a ver como deuda el crédito que pagó: ' + JSON.stringify(hechos));
  assert.equal(hechos.suelta, true, 'precondición: queda suelta');
  assert.equal(hechos.pausa, 'respaldo', 'precondición: la pausa del respaldo sigue puesta');
  assert.equal(hechos.juntadas, 1, 'precondición: juntó por la nube');
  assert.equal(hechos.creditos, 2, 'precondición: registró el crédito que aceptó');
  /* Y el crédito que se acaba de registrar sube a los 90 s, sobre lo del respaldo. */
  const antes = S.lotes.length;
  t.disparar(90000); await P.ev('HistorialesAuto.listo()'); await ticks();
  assert.ok(S.lotes.length > antes, 'precondición: la suelta volvió a subir');
  assert.equal((paqueteDeJorge(S).datos.creditos || []).length, 2);
  assert.equal(p1EnSuApp(S).pagado, false);
  /* Lo que tiene que haber dicho el cuadro ANTES de ese toque. */
  assert.doesNotMatch(ojo, CULPA_AL_CELULAR, 'el «Ojo» culpa al celular de lo que trajo el respaldo: ' + ojo);
  assert.match(ojo, /respaldo/, 'el «Ojo» no dice que su ficha de aquí viene del respaldo que importaste: ' + ojo);
});

test('4 · con una gestión anotada después del respaldo (esperan todos), la línea ya nombra el respaldo, y el «Ojo» también tiene que nombrarlo', async () => {
  const { m, P } = await laHistoria({ conGestion: true });
  const pc = JSON.parse(JSON.stringify(m.C.libroPorCliente()));
  assert.equal(pc.sinCliente, 1, 'precondición: el ajuste de las gestiones quedó en discusión');
  const c = P.ev('HistorialesAuto.estado()').cinta;
  assert.equal(c.fase, 'esperando-libro', 'precondición: esperan todos');
  assert.match(c.l1, /Importaste un respaldo/, 'control: en este caso la línea sí lo dice');
  const { ojo } = await abrirSuCuadro(P);
  assert.doesNotMatch(ojo, CULPA_AL_CELULAR, 'el «Ojo» culpa al celular de lo que trajo el respaldo: ' + ojo);
  assert.match(ojo, /respaldo/, 'el «Ojo» no dice que su ficha de aquí viene del respaldo que importaste: ' + ojo);
});

test('5 · control: sin respaldo, el «Ojo» y la línea siguen diciendo lo de siempre', async () => {
  const { P } = await laHistoria();
  /* La pausa se quita como la quita la cartera comprobada: sin respaldo de por medio. */
  const est = JSON.parse(P.almacen.joan_crm_historiales);
  est.pausa = null;
  P.almacen.joan_crm_historiales = JSON.stringify(est);
  await P.ev('HistorialesAuto.vuelta(false)'); await P.ev('HistorialesAuto.listo()'); await ticks();
  const l = plano(P.ev('HistorialesAuto.estado()').cinta.l2);
  assert.match(l, /espera 1 cliente cuya ficha no coincide con la nube \(la tocaste aquí y en el celular\)/);
  const { ojo } = await abrirSuCuadro(P);
  assert.match(ojo, /^Ojo: su ficha no coincide con la de la nube \(la tocaste aquí y en el celular\)\. Su app va a mostrar lo de este computador/);
});

test('6 · el uso real de Joan (la subida nunca se encendió, otra ficha ya en discusión): el pago le llegó a Jorge cliente por cliente; tras el respaldo, el «Ojo» dice la causa y el toque le devuelve la deuda', async () => {
  const { m, P, S, habilitadoAntes } = await laHistoria({ otraEnDiscusion: true });
  assert.equal(habilitadoAntes, false, 'precondición: la subida nunca se encendió (antes del respaldo)');
  const est0 = JSON.parse(P.almacen.joan_crm_historiales || '{}');
  assert.equal(est0.pausa && est0.pausa.motivo, 'respaldo', 'precondición: la pausa del respaldo');
  const pc = JSON.parse(JSON.stringify(m.C.libroPorCliente()));
  assert.ok(pc.clientes && pc.clientes.C1 && pc.clientes.C1.enDiscusion, 'precondición: Jorge quedó en discusión por el respaldo: ' + JSON.stringify(pc));
  assert.equal((B.congeladas(m.alm)['creditos|P1'] || {}).motivo, 'difieren', 'precondición: la de Jorge sale del emparejo con el respaldo');
  const { ojo } = await abrirSuCuadro(P);
  const toque = /juntarConUnToque\('([^']+)','([^']+)',(true|false)\)/.exec(P.elems.juntarBoton.innerHTML);
  assert.ok(toque, 'el cuadro no ofreció el toque');
  P.ev('juntarConUnToque(' + JSON.stringify(toque[1]) + ',' + JSON.stringify(toque[2]) + ',' + toque[3] + ')');
  await asentar(40);
  assert.equal(S.vistas.filter(f => f === 'vincular_cuenta_joan').length, 1, 'precondición: juntó por la nube');
  assert.equal(p1EnSuApp(S).pagado, false, 'precondición: la app de Jorge vuelve a ver como deuda el crédito que pagó');
  assert.doesNotMatch(ojo, CULPA_AL_CELULAR, 'el «Ojo» culpa al celular de lo que trajo el respaldo: ' + ojo);
  assert.match(ojo, /respaldo/, 'el «Ojo» no dice que su ficha de aquí viene del respaldo que importaste: ' + ojo);
});
