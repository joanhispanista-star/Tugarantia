'use strict';
/* ============================================================================
 * TODO SUBE SOLO — 22 de octubre de 2026
 *
 *   node --test pruebas/todo-sube-solo.test.js
 *
 * Joan: «aparte está el botón de subir a la nube en mi crm, siento que es
 * innecesario, quiero que se pueda automatizar todo lo que se sube a la nube».
 *
 * Lo que se le prometió, y lo que vigila cada bloque:
 *   1. ningún botón de subir o publicar a la vista: los que quedan, en
 *      «Avanzado» plegado y con su porqué; y UNA línea común («☁ Todo sube
 *      solo · última vez hace N min») en Ajustes y en la barra lateral;
 *   2. nada pide «la primera vez»: el computador se empareja solo cuando es
 *      seguro (nube vacía, cartera vacía o el mismo libro) y los historiales
 *      arrancan solos cuando la cartera está comprobada; si la nube tiene OTRA
 *      cartera, se pregunta (eso es plata);
 *   3. repartir publica al equipo en ese momento;
 *   4. lo que falla, en ROJO con qué hacer, y reintento con espera que crece;
 *   5. LA REGLA QUE SE QUEDA: sin traer antes lo del equipo, no se publica
 *      encima (dc57aab);
 *   6. ningún texto pide tocar un botón que ya no está.
 * Cada prueba de este archivo falla contra 8323fc0 (lo publicado el 21-oct).
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const {
  RAIZ, ESPEJO, montar, cartera, estadoDisco, congeladas, sembrar
} = require('./banco-nube-crm.js');

const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = LEER('panel/crm.html');
const FUENTE_NUBE_CRM = LEER('panel/nube-crm.js');
const FUENTE_HIST = LEER('panel/historiales-auto.js');
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 8); i++) await tick(); }
/* Lo que el usuario ve: sin los comentarios que cuentan lo que decía antes. */
const sinComentarios = t => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/* ======================================================================== */
describe('1 · ni un botón de subir a la vista, y UNA línea común', () => {

  test('los botones de subir y publicar solo viven dentro de «Avanzado», plegado y con su porqué', () => {
    /* Se miran las etiquetas, no los scripts: se ponen en blanco los <script> y
       los comentarios conservando las posiciones. */
    const html = CRM.replace(/<script[\s\S]*?<\/script>/g, s => ' '.repeat(s.length))
                    .replace(/<!--[\s\S]*?-->/g, s => ' '.repeat(s.length));
    const ini = html.indexOf('<details class="nube-avanzado" id="nubeAvanzado">');
    assert.ok(ini > 0, 'no hay un «Avanzado» plegado en Ajustes');
    const fin = html.indexOf('</details>', ini);
    assert.ok(fin > ini);
    const botones = [/onclick="sincronizarSocios\(\)"/g, /onclick="publicarEquipo\(\)"/g, /<a class="btn[^"]*" href="subir\.html"/g];
    botones.forEach(re => {
      const vistos = [...html.matchAll(re)];
      assert.ok(vistos.length >= 1, re + ' desapareció: el caso raro se quedó sin salida');
      vistos.forEach(m => assert.ok(m.index > ini && m.index < fin,
        re + ' sigue a la vista fuera de «Avanzado» (posición ' + m.index + ')'));
    });
    assert.doesNotMatch(html.slice(ini, ini + 80), /\bopen\b/, '«Avanzado» viene abierto: los botones vuelven a estar a la vista');
    /* Cada uno con su porqué: el texto de al lado dice cuándo hace falta. */
    const av = html.slice(ini, fin);
    assert.match(av, /Solo hace falta si este computador no tiene la sesión de la nube/);
    assert.match(av, /Solo hace falta si este computador no está emparejado con la nube/);
    assert.match(av, /todavía no es automático/);
    /* La pestaña Equipo ya no lleva «☁ Publicar a la nube» en la cabecera. */
    const eq = html.slice(html.indexOf('id="v-equipo"'), html.indexOf('id="equipoPublicadoSolo"'));
    assert.doesNotMatch(eq, /publicarEquipo\(\)/, 'el botón de publicar sigue en la cabecera de Equipo');
  });

  test('la barra lateral y Ajustes tienen la línea común', () => {
    assert.match(CRM, /<div class="nube-todo" id="nubeTodoCinta"/);
    assert.match(CRM, /<div id="nubeTodoBarra"><\/div>/);
  });

  test('la barra lateral lleva UNA línea: las piezas no inyectan sus cintas', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    const insertados = [];
    P.ctx.document.getElementById('horarioBox').parentNode = { insertBefore(n) { insertados.push(n); }, appendChild(n) { insertados.push(n); } };
    P.ctx.document.createElement = () => ({ setAttribute() {}, style: {} });
    vm.runInContext(FUENTE_NUBE_CRM, P.ctx, { filename: 'nube-crm.js' });
    vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
    P.ev('document.getElementById("pinInput").value = DB.config.pin');
    P.ev('entrar()');
    assert.deepEqual(insertados.map(n => n.id), [], 'se inyectaron cintas propias en la barra lateral');
    assert.match(P.elems.nubeTodoCinta.innerHTML, /☁/, 'la línea común quedó vacía después del PIN');
  });
});

/* ======================================================================== */
describe('1 · lo que dice la línea común', () => {
  const hace = min => new Date(Date.now() - min * 60000).toISOString();
  function conPiezas(o) {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    P.ctx._accion = null;
    P.ctx._cartera = o.cartera;
    P.ctx._hist = o.hist;
    P.ev(`
      window.NubeCRM = { estado: function () { return _cartera; }, accion: function () { _accion = 'cartera'; } };
      window.HistorialesAuto = { estado: function () { return _hist; }, accion: function () { _accion = 'historiales'; } };
    `);
    return P;
  }
  const bien = { cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' } };
  const histBien = { cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tus clientes ven lo de hace 5 min', l2: 'nada esperando subir' } };

  test('todo bien: «☁ Todo sube solo · última vez hace N min», con lo de cada una debajo', () => {
    const P = conPiezas({ cartera: Object.assign({ ultimaSubida: hace(3) }, bien),
                          hist: Object.assign({ ultimaSubida: hace(5) }, histBien) });
    const r = P.ev('pintarNubeTodo()');
    assert.equal(r.l1, '☁ Todo sube solo · última vez hace 3 min');
    assert.match(r.l2, /cartera subida hace 3 min/);
    assert.match(r.l2, /tus clientes ven lo de hace 5 min/);
    assert.equal(r.clase, 'calma');
    assert.match(P.elems.nubeTodoCinta.innerHTML, /Todo sube solo · última vez hace 3 min/);
    assert.equal(P.elems.nubeTodoCinta.className, 'nube-todo calma');
    assert.match(P.elems.nubeTodoBarra.innerHTML, /alerta ok/);
  });

  test('una falla tapa el «todo bien»: en ROJO, con qué hacer, y el clic va a la pieza que falla', () => {
    const P = conPiezas({
      cartera: { cinta: { fase: 'error', clase: 'mal', l1: 'No pude subir', l2: 'La nube respondió 503 · pruebo otra vez en 1 min · clic para reintentar ya' }, ultimaSubida: hace(1) },
      hist: Object.assign({ ultimaSubida: hace(1) }, histBien) });
    const r = P.ev('pintarNubeTodo()');
    assert.equal(r.clase, 'mal');
    assert.equal(r.l1, '☁ Tu cartera · No pude subir');
    assert.match(r.l2, /pruebo otra vez en 1 min/);
    assert.doesNotMatch(r.l1 + r.l2, /Todo sube solo/, 'dijo «todo sube solo» con la cartera fallando');
    assert.match(P.elems.nubeTodoBarra.innerHTML, /class="alerta mal/);
    assert.equal(P.elems.nubeTodoCinta.className, 'nube-todo mal');
    P.ev('accionNubeTodo()');
    assert.equal(P.ctx._accion, 'cartera', 'el clic no fue a la pieza que falla');
  });

  test('una pieza que no cargó, o en una fase que nadie nombró, no pasa por «todo bien»', () => {
    const P = conPiezas({ cartera: bien, hist: histBien });
    P.ev('window.NubeCRM = undefined;');
    let r = P.ev('pintarNubeTodo()');
    assert.equal(r.clase, 'mal');
    assert.match(r.l1, /no cargó la subida a la nube/);
    const Q = conPiezas({ cartera: { cinta: { fase: 'algo-nuevo', clase: 'calma', l1: 'x', l2: 'y' } }, hist: histBien });
    r = Q.ev('pintarNubeTodo()');
    assert.equal(r.fase, 'aviso', 'una fase desconocida se pintó como «todo bien»');
  });

  test('el equipo que no se pudo publicar sale en la línea común, en rojo y diciendo que no se pisó nada', () => {
    const P = conPiezas({ cartera: Object.assign({ ultimaSubida: hace(1) }, bien), hist: Object.assign({ ultimaSubida: hace(1) }, histBien) });
    P.ev(`
      DB.equipo = [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: '3000000000' }];
      DB.asignaciones = [{ id: 'A1', socio_id: 'C0', asesor_id: 'g1', desde: '${HOY}' }];
      sbListo = function () { return true; };
      anotarPublicadoSolo({ ok: false, huella: '', dia: '${HOY}', cuando: new Date().toISOString(), error: 'sin señal', espera: 120000 });
    `);
    const r = P.ev('pintarNubeTodo()');
    assert.equal(r.quien, 'equipo');
    assert.equal(r.clase, 'mal');
    assert.match(r.l1, /no pude publicar la cartera de tu equipo/);
    assert.match(r.l2, /No publiqué encima/);
    assert.match(r.l2, /pruebo otra vez en 2 min/);
  });

  test('en modo equipo la línea se borra: nada de lo de Joan sube desde ahí', () => {
    const P = conPiezas({ cartera: bien, hist: histBien });
    P.ev('pintarNubeTodo()');
    P.ev("CARTERA_EQUIPO = { ok: true, yo: { rol: 'gerente', celular: '3000000000', nombre: 'W' }, gente: [] };");
    assert.equal(P.ev('pintarNubeTodo()'), null);
    assert.equal(P.elems.nubeTodoCinta.innerHTML, '');
    assert.equal(P.elems.nubeTodoBarra.innerHTML, '');
  });
});

/* ======================================================================== */
describe('2 · el computador se empareja solo cuando es seguro', () => {

  test('la nube vacía: la vuelta empareja sola y sube, sin cuadro y sin preguntar', async () => {
    const m = montar({ db: cartera(4, 1) });
    await m.C.vuelta(false);
    assert.equal(m.vent.modal, null, 'abrió el cuadro de emparejar');
    assert.deepEqual(m.vent.confirmes, [], 'preguntó');
    assert.equal(Object.keys(m.srv.socios).length, 4, 'no subió la cartera');
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
    const e = estadoDisco(m.alm).ultimoEmparejo;
    assert.equal(e.como, 'solo');
    assert.equal(e.nuevas, 8, 'no anotó qué hizo');
    assert.match(m.barra.innerHTML, /Emparejada sola hace un momento: 8 nuevas que subieron/, 'la barra no dice qué pasó');
  });

  test('el mismo libro con una ficha distinta: se empareja sola, la distinta queda en discusión y nada se pisa', async () => {
    const m = montar({ db: cartera(3, 1) });
    await sembrar(m);
    /* El celular cobra en P0, y en el computador se suelta el espejo (como al
       importar un respaldo o traer): la cartera de acá no tiene ese cobro. */
    m.srv.celular('creditos', 'P0', d => { d.montoRecibido = 55555; });
    m.alm.removeItem(ESPEJO);
    await m.C.vuelta(false);
    assert.equal(m.srv.creditos.P0.datos.montoRecibido, 55555, 'el cobro del celular se pisó');
    assert.ok(congeladas(m.alm)['creditos|P0'], 'P0 no quedó en discusión');
    const c = m.C.estado().cinta;
    assert.equal(c.fase, 'congeladas');
    assert.equal(c.clase, 'mal');
    assert.match(c.l2, /<a href="subir\.html"[^>]*>☁ Subir<\/a> \(paso 7/, 'no lleva hasta donde se decide');
    assert.deepEqual(m.C.libroAlDia(), { ok: false, motivo: 'en-discusion', congeladas: 1 });
    assert.equal(m.vent.modal, null);
  });

  test('la nube con OTRA cartera: no sube nada, no abre cuadro solo, se pinta en rojo; el clic enseña las dos', async () => {
    const ajena = cartera(3, 1);
    ajena.socios.forEach(s => { s.id = 'Z' + s.id; });
    ajena.prestamos.forEach(p => { p.id = 'Z' + p.id; p.socioId = 'Z' + p.socioId; });
    const otra = montar({ db: ajena });
    await sembrar(otra);
    const srv = otra.srv;
    let traidas = 0;
    const traer0 = srv.traer;
    srv.traer = d => { traidas++; return traer0(d); };
    const antes = srv.lotes.length;
    const m = montar({ db: cartera(2, 1), srv });
    await m.C.vuelta(false);
    assert.equal(srv.lotes.length, antes, 'subió fichas de esta cartera encima de otra');
    assert.equal(m.vent.modal, null, 'un cuadro que salta solo se cierra sin leer');
    const c = m.C.estado().cinta;
    assert.equal(c.fase, 'libro-distinto');
    assert.equal(c.clase, 'mal');
    assert.match(c.l1, /La nube tiene otra cartera/);
    assert.deepEqual(m.C.libroAlDia(), { ok: false, motivo: 'libro-distinto' });
    /* Con la cartera igual, la vuelta sola no vuelve a traer. */
    await m.C.vuelta(false);
    assert.equal(traidas, 1, 'volvió a traer la nube entera sin que nada cambiara');
    /* El clic enseña los montones, y con el sí de Joan, empareja. */
    await m.C.accion();
    assert.ok(m.vent.modal, 'el clic no enseñó las dos carteras');
    assert.match(m.vent.modal.h, /La nube tiene otra cartera/);
    await m.C.confirmarEmparejar();
    assert.ok(srv.socios.C0, 'con el sí de Joan no subió');
    assert.equal(estadoDisco(m.alm).ultimoEmparejo.como, 'joan');
  });

  test('mismoLibro: nube vacía, cartera vacía, mismo libro y libro distinto', () => {
    const { crear } = require('../panel/nube-crm.js');
    const N = require('../panel/nube.js');
    const C = crear({ nube: N, almacen: { getItem: () => null, setItem() {}, removeItem() {} } });
    const ml = C._puro.mismoLibro;
    const db = { socios: [{ id: 'C1' }], prestamos: [{ id: 'P1' }], respaldados: [] };
    assert.equal(ml(db, { socios: [], creditos: [], respaldados: [] }).motivo, 'nube-vacia');
    assert.equal(ml(db, { socios: [{ id: 'X', borrado: true }] }).motivo, 'nube-vacia', 'una nube con solo borrados está vacía');
    assert.equal(ml({ socios: [], prestamos: [] }, { socios: [{ id: 'X' }] }).motivo, 'cartera-vacia');
    assert.equal(ml(db, { socios: [{ id: 'X' }, { id: 'C1' }] }).motivo, 'mismo-libro');
    const d = ml(db, { socios: [{ id: 'X' }], creditos: [{ id: 'Y' }] });
    assert.equal(d.motivo, 'libro-distinto');
    assert.equal(d.seguro, false);
  });
});

/* ======================================================================== */
describe('4 · lo que falla en la subida de la cartera: rojo y espera que crece', () => {

  test('rojo con qué hacer; mientras corre la espera no se golpea a la nube; 1, 2 min y vuelve a 1 tras un éxito', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const original = m.srv.empujar;
    let llamadas = 0;
    m.srv.empujar = () => { llamadas++; return Promise.reject({ motivo: 'La nube respondió 503' }); };
    const cambiar = tel => { const db = m.tab.leer(); db.socios[0].telefono = tel; m.tab.guardar(db); };
    cambiar('3001112233');
    m.timers.length = 0;
    await m.C.vuelta(false);
    let c = m.C.estado().cinta;
    assert.equal(c.fase, 'error');
    assert.equal(c.clase, 'mal', 'un fallo se pintó en ámbar, como «hay cambios esperando»');
    assert.match(c.l2, /La nube respondió 503/);
    assert.match(c.l2, /pruebo otra vez en 1 min/);
    assert.match(c.l2, /revisa el internet/);
    const r1 = m.timers.find(t => t.ms === 60000);
    assert.ok(r1, 'no quedó el reintento de 1 min');
    /* Una vuelta que se dispara sola mientras corre la espera no llama. */
    await m.C.vuelta(false);
    assert.equal(llamadas, 1, 'golpeó a la nube durante la espera');
    r1.f(); await ticks();
    assert.equal(llamadas, 2);
    assert.match(m.C.estado().cinta.l2, /pruebo otra vez en 2 min/, 'la espera no creció');
    const r2 = m.timers.find(t => t.ms === 120000);
    assert.ok(r2);
    m.srv.empujar = original;
    r2.f(); await ticks();
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
    /* Tras un éxito, la espera vuelve a empezar en 1 min. */
    m.srv.empujar = () => Promise.reject({ motivo: 'otra vez' });
    cambiar('3009998877');
    m.timers.length = 0;
    await m.C.vuelta(true);
    assert.match(m.C.estado().cinta.l2, /pruebo otra vez en 1 min/);
  });
});

/* ======================================================================== */
/* Los historiales con crm.html de verdad y una nube de sincronizar_socios. La
   cartera la «comprueba» un NubeCRM de mentira: lo que se prueba aquí es qué
   hace la pieza de los historiales con esa respuesta. */
function nubeHistoriales() {
  const S = { lotes: [], llamadas: 0, modo: 'ok' };
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  S.red = (url, cfg) => {
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) return Promise.reject(new Error('sin red en el banco'));
    S.llamadas++;
    const cuerpo = JSON.parse(cfg.body);
    S.lotes.push(cuerpo.p_lote);
    if (S.modo === '500') return Promise.resolve(resp(500, '{"message":"se cayó la base"}'));
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
    cola,
    hay: ms => cola.some(x => x.ms === ms && !x.intervalo),
    disparar(ms) {
      const toca = cola.filter(x => x.ms === ms && !x.intervalo);
      toca.forEach(x => { cola.splice(cola.indexOf(x), 1); x.f(); });
      return toca.length;
    }
  };
}
function montarHistoriales(o) {
  o = o || {};
  const srv = nubeHistoriales();
  const P = abrirPanel({ red: (u, c) => srv.red(u, c) });
  const t = relojes(P);
  P.cargarCartera(cartera(o.n || 3, 1));
  P.ev('_selloDesdeDisco(false)');
  P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
  if (o.estado) P.almacen['joan_crm_historiales'] = o.estado;
  P.elems.modal.classList.contains = () => false;
  P.ctx._preguntas = [];
  P.ctx.confirm = m => { P.ctx._preguntas.push(String(m)); return true; };
  P.ctx._libro = o.libro || { ok: true, motivo: 'emparejada' };
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' } }; },
    libroAlDia: function () { return _libro; } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, srv, t };
}
const listoH = m => m.P.ev('HistorialesAuto.listo()');
const cintaH = m => m.P.ev('HistorialesAuto.estado()').cinta;
const estadoH = m => JSON.parse(m.P.almacen['joan_crm_historiales'] || '{}');
async function primeraH(m) { m.t.disparar(5000); await listoH(m); await ticks(); }

describe('2 · los historiales arrancan solos cuando la cartera está comprobada', () => {

  test('primera vez en el computador, cartera emparejada y sin discusión: suben todos solos, sin botón ni cuadro', async () => {
    const m = montarHistoriales();
    await primeraH(m);
    assert.equal(m.srv.lotes.length, 1, 'no subió sola la primera vez');
    assert.equal(m.srv.lotes[0].length, 3);
    assert.equal(estadoH(m).habilitadoPor, 'solo');
    assert.equal(cintaH(m).fase, 'al-dia');
    assert.deepEqual(m.P.ctx._preguntas, [], 'preguntó');
    assert.deepEqual(m.P.ctx._avisos || [], [], 'saltó un alert');
  });

  test('con fichas en discusión espera y dice qué espera; cuando se resuelven, arranca sola', async () => {
    const m = montarHistoriales({ libro: { ok: false, motivo: 'en-discusion', congeladas: 2 } });
    await primeraH(m);
    assert.equal(m.srv.llamadas, 0, 'subió con la cartera en discusión');
    const c = cintaH(m);
    assert.equal(c.fase, 'esperando-libro');
    assert.match(c.l2, /2 fichas de tu cartera en discusión/);
    assert.match(c.l2, /suben solos/);
    assert.doesNotMatch(c.l1 + c.l2, /Toca/, 'pide tocar algo');
    m.P.ctx._libro = { ok: true, motivo: 'emparejada' };
    m.P.ev('HistorialesAuto.libroCambio()');
    await listoH(m); await ticks();
    assert.equal(m.srv.lotes.length, 1, 'no arrancó cuando la cartera quedó comprobada');
    assert.equal(m.srv.lotes[0].length, 3);
  });

  test('sin sesión de la nube lo dice con dónde entrar, sin decir «toca ☁ Subir historiales»', async () => {
    const m = montarHistoriales({ libro: { ok: false, motivo: 'sin-conectar' } });
    await primeraH(m);
    const c = cintaH(m);
    assert.equal(c.fase, 'esperando-libro');
    assert.match(c.l2, /conectado a la nube con tu correo/);
    assert.match(c.l2, /href="subir\.html"/);
  });

  test('importar un respaldo pausa, y se reanuda sola en cuanto el respaldo queda emparejado sin discusión', async () => {
    const m = montarHistoriales({ estado: JSON.stringify({ v: 1, socios: {}, habilitado: '2026-10-06T12:00:00.000Z' }) });
    await primeraH(m);
    const n = m.srv.lotes.length;
    m.P.ctx._libro = { ok: false, motivo: 'falta-emparejar' };
    const viejo = JSON.parse(m.P.almacen['joan_socios_v1']); viejo.socios[0].nombre = 'Del Respaldo';
    m.P.ev('importar({target:{files:[{texto:' + JSON.stringify(JSON.stringify(viejo)) + '}],value:""}})');
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.lotes.length, n, 'el respaldo subió antes de comprobarlo');
    assert.match(cintaH(m).l1, /Importaste un respaldo: los historiales vuelven a subir solos/);
    m.P.ctx._libro = { ok: true, motivo: 'emparejada' };
    m.P.ev('HistorialesAuto.libroCambio()');
    await listoH(m); await ticks();
    assert.ok(m.srv.lotes.flat().some(x => x.nombre === 'Del Respaldo'), 'no se reanudó sola');
  });

  test('un fallo de la nube: rojo, y la espera crece (3 y después 6 min)', async () => {
    const m = montarHistoriales();
    await primeraH(m);
    m.srv.modo = '500';
    m.P.ev('DB.socios[0].nombre="Ana Dos"; guardar()');
    m.t.disparar(90000); await listoH(m); await ticks();
    let c = cintaH(m);
    assert.equal(c.fase, 'error');
    assert.equal(c.clase, 'mal', 'el fallo se pintó en ámbar');
    assert.match(c.l2, /pruebo otra vez en 3 min/);
    assert.ok(m.t.hay(180000));
    m.t.disparar(180000); await listoH(m); await ticks();
    c = cintaH(m);
    assert.match(c.l2, /pruebo otra vez en 6 min/, 'la espera no creció');
    assert.ok(m.t.hay(360000));
  });
});

/* ======================================================================== */
/* El equipo, con el mismo montaje que la-cartera-se-publica-sola.test.js y una
   nube que puede fallar al traer. */
function abrirEquipo(o) {
  o = Object.assign({ fase: 'lista' }, o || {});
  const P = abrirPanel();
  P.cargarCartera({
    socios: [{ id: 's1', nombre: 'Ana Torres', telefono: '3001112233', whatsappIgual: true },
             { id: 's2', nombre: 'Beto Ruiz', telefono: '3001112244', whatsappIgual: true }],
    prestamos: [],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' }],
    equipo: [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: '3000000000' }],
    asignaciones: [{ id: 'A1', socio_id: 's1', asesor_id: 'g1', desde: HOY }],
    gestiones: [], config: { negocio: 'Tu Garantía' }
  });
  const t = relojes(P);
  P.ctx._traerFalla = !!o.traerFalla;
  P.ev(`
    var _enviados = [], _cuadros = [], _orden = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    /* 23-oct-2026 — la de 15 min pregunta además si la cartera está al día
       con la nube (libroAlDiaEsperando): aquí lo está. */
    window.NubeCRM = { estado: function () { return { fase: ${JSON.stringify(o.fase)} }; }, libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) {
      _orden.push(fn);
      if (fn === 'equipo_traer' || fn === 'gestiones_listar') {
        return _traerFalla ? Promise.reject({ motivo: 'sin señal' }) : Promise.resolve(fn === 'gestiones_listar' ? [] : {});
      }
      if (fn === 'equipo_publicar') { _enviados.push(args); return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
  `);
  return { P, t };
}
function prepararReparto(P) {
  P.ev("_modoAsignar='primeros'; _grupoAsignar='clientes'; _asignables=[{id:'s2',nombre:'Beto Ruiz',asesor:''}];" +
       "document.getElementById('asCuantos').value='1'; document.getElementById('asDestino').value='g1';");
}

describe('3 y 5 · repartir publica al equipo en ese momento, trayendo primero', () => {

  test('repartir publica ya —aunque el computador no esté emparejado—, trae antes, y el aviso dice que ya lo ven', async () => {
    const { P } = abrirEquipo({ fase: 'falta-emparejar' });
    prepararReparto(P);
    await P.ev('asignarMarcados()');
    await ticks();
    assert.equal(P.ev('_enviados.length'), 1, 'repartir no publicó');
    const orden = P.ev('_orden');
    assert.ok(orden.indexOf('equipo_traer') >= 0 && orden.indexOf('equipo_traer') < orden.indexOf('equipo_publicar'),
      'publicó sin traer antes lo que hizo el gerente: ' + orden.join(','));
    const cuadros = P.ev('_cuadros');
    assert.match(cuadros[0], /se publica a tu equipo en ese momento/, 'la pregunta no dice que va a viajar');
    assert.match(cuadros[0], /Nunca la cédula, la dirección ni las fotos/);
    const fin = cuadros[cuadros.length - 1];
    assert.match(fin, /Listo: 1 repartidos/);
    assert.match(fin, /Ya se lo publiqué a tu equipo/);
    assert.doesNotMatch(cuadros.join(' '), /Acuérdate/, 'sigue pidiendo que se acuerde de publicar');
    assert.equal(P.ev('leerPublicadoSolo().ok'), true);
  });

  test('si no puede traer lo del equipo, NO publica encima: lo dice, en rojo, y reintenta solo con espera que crece', async () => {
    const { P, t } = abrirEquipo({ traerFalla: true });
    prepararReparto(P);
    await P.ev('asignarMarcados()');
    await ticks();
    assert.equal(P.ev('_enviados.length'), 0, 'publicó sin haber traído: le borraría al gerente lo que hizo');
    const cuadros = P.ev('_cuadros');
    const fin = cuadros[cuadros.length - 1];
    assert.match(fin, /NO lo pude publicar a tu equipo/);
    assert.match(fin, /No publiqué encima/);
    assert.doesNotMatch(fin, /Ya se lo publiqué/);
    assert.equal(P.ev('leerPublicadoSolo().ok'), false);
    assert.equal(P.ev('leerPublicadoSolo().espera'), 60000);
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /class="alerta mal"/, 'el fallo no salió en rojo');
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /Pruebo otra vez sola en 1 min/);
    assert.ok(t.hay(60000), 'no quedó el reintento');
    /* La vuelta de 15 min no se adelanta al reintento puesto. */
    assert.equal(await P.ev('publicarEquipoSolo()'), 'esperando_reintento');
    /* Se cumple la espera y sigue sin poder traer: la siguiente es de 2 min. */
    t.disparar(60000); await ticks();
    assert.equal(P.ev('_enviados.length'), 0);
    assert.equal(P.ev('leerPublicadoSolo().espera'), 120000, 'la espera no creció');
    assert.ok(t.hay(120000));
    /* Vuelve la señal: el reintento publica, y la cuenta de fallos se reinicia. */
    P.ev('_traerFalla = false');
    t.disparar(120000); await ticks();
    assert.equal(P.ev('_enviados.length'), 1, 'el reintento no publicó al volver la señal');
    assert.equal(P.ev('leerPublicadoSolo().ok'), true);
    assert.equal(P.ev('_fallosEquipo'), 0);
  });

  test('crear o editar a alguien del equipo también publica, sin cuadro', async () => {
    const { P } = abrirEquipo();
    P.ev("document.getElementById('eqNombre').value='WILLIAN QUINTERO'; document.getElementById('eqTel').value='3000000000';" +
         "document.getElementById('eqRol').value='gerente'; document.getElementById('eqEstado').value='activo'; document.getElementById('eqJefe').value='';");
    await P.ev("guardarPersona('g1')");
    await ticks();
    assert.equal(P.ev('_enviados.length'), 1, 'editar a la persona no publicó');
    assert.equal(P.ev('_cuadros.length'), 0, 'saltó un cuadro: ' + P.ev('_cuadros.join(" | ")'));
  });
});

/* ======================================================================== */
describe('6 · ningún texto pide tocar un botón que ya no está', () => {

  test('crm.html, historiales-auto.js y nube-crm.js', () => {
    const crm = sinComentarios(CRM);
    [/Acuérdate de (<b>)?«?☁ Publicar/, /Toca ☁ Subir historiales una vez/, /Toca “☁ Subir historiales” una vez/,
     /Ajustes → «Sí, emparejar y subir»/, /pulse «Publicar a la nube»/, /usa «Publicar equipo»/,
     /que vuelva a publicar\./, /Joan tiene que volver a <b>publicar el equipo<\/b>/, /Estos tres botones lo arreglan/,
     /si en este computador ya tocaste «☁ Subir historiales»/, /Ya puedes tocar “Subir historiales”/]
      .forEach(re => assert.doesNotMatch(crm, re, 'crm.html todavía dice ' + re));
    const hist = sinComentarios(FUENTE_HIST);
    assert.doesNotMatch(hist, /Toca ☁ Subir historiales una vez/);
    assert.doesNotMatch(hist, /desde la primera vez que tocas «☁ Subir historiales»/);
    assert.doesNotMatch(sinComentarios(FUENTE_NUBE_CRM), /clic para revisar'\);/, 'la cinta sigue pidiendo revisar para emparejar');
  });

  test('traer.html y espejo.html', () => {
    assert.doesNotMatch(sinComentarios(LEER('panel/traer.html')), /lo emparejes una vez/);
    const esp = sinComentarios(LEER('panel/espejo.html'));
    /* Las plantillas NO suben solas: el celular dice dónde se suben ahora. */
    assert.match(esp, /viaja cuando subes las plantillas: en el computador, Ajustes → Avanzado → ☁ Subir; no suben solas/);
    assert.match(esp, /la cartera sube sola, las plantillas no/);
  });
});
