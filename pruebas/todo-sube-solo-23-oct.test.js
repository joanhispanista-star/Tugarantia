'use strict';
/* ============================================================================
 * TODO SUBE SOLO — LO QUE SOBREVIVIÓ A LA REVISIÓN — 23 de octubre de 2026
 *
 *   node --test pruebas/todo-sube-solo-23-oct.test.js
 *
 * La verificación de 9772fcd dejó tres hallazgos vivos. Cada bloque cierra uno:
 *
 *   1 · seguridad. Editar a alguien del equipo deshacía el retiro que hizo el
 *       gerente desde su celular. La marca de «Joan cambió esto» protegía rol,
 *       estado y jefe aunque Joan solo hubiera corregido el nombre, y el cuadro
 *       muestra lo que hay en ESTE computador (viejo, si nada se trajo desde el
 *       retiro). El retirado volvía a «activo» y a ver su base.
 *   2 · plata. Los historiales se encendían solos con un respaldo viejo (le
 *       faltaba un crédito que solo estaba en la nube) o en un origen viejo
 *       emparejado hace semanas (el celular cobró después): «emparejada y sin
 *       discusión» no es «al día con la nube». El cliente veía su deuda sin
 *       ese crédito o sin ese abono.
 *   3 · revienta. Si el navegador no dejaba escribir el estado de la nube, el
 *       emparejo entraba en bucle trayendo la nube entera sin parar, con la
 *       cinta en calma diciendo «Emparejando…».
 *
 * Se mira lo que pasa en la NUBE (dobles con las reglas del SQL), no solo lo
 * que dice la pantalla. Cada prueba de este archivo falla contra 9772fcd.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');
const N = require('../panel/nube.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const FUENTE_HIST = LEER('panel/historiales-auto.js');
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const clon = v => JSON.parse(JSON.stringify(v));

const WILLIAN = '3000000000', PEDRO = '3000000001', OTRO = '3000000002';

/* --------------------------------------------------------------------------
 * LA NUBE DEL EQUIPO, con las reglas del SQL (la primera prueba comprueba que
 * el SQL sigue diciendo eso):
 *   · equipo_publicar: upsert por celular que PISA estado y jefe; el jefe se
 *     queda con los diez últimos dígitos; las asignaciones, por id;
 *   · equipo_traer: devuelve estado y jefe de cada uno;
 *   · asesor_retirar (20260922p): pasa los clientes al gerente con una fila
 *     de HOY (on conflict (persona_id, desde): si ya había una de hoy, la
 *     cambia en su sitio) y deja al asesor 'retirado';
 *   · mi_alcance: un gerente activo alcanza a quien le reporta; un activo, a
 *     sí mismo; un retirado, a nadie. Y la base del que no está activo es vacía.
 * ------------------------------------------------------------------------ */
function nubeEquipo() {
  const dig = s => String(s == null ? '' : s).replace(/\D/g, '');
  const S = { equipo: {}, asignaciones: {}, publicaciones: [], orden: [], traerFalla: false };
  S.rpc = (fn, args) => {
    S.orden.push(fn);
    if (fn === 'equipo_traer' || fn === 'gestiones_listar') {
      if (S.traerFalla) return Promise.reject({ motivo: 'sin señal' });
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      return Promise.resolve({
        equipo: Object.values(S.equipo).map(e => ({ celular: e.celular, nombre: e.nombre, rol: e.rol,
          estado: e.estado, jefe: e.jefe, whatsapp: '' })),
        asignaciones: Object.values(S.asignaciones).map(a => ({ id: a.id, persona_id: a.persona_id, asesor: a.asesor, desde: a.desde })),
        contactos: []
      });
    }
    if (fn === 'equipo_publicar') {
      const a = clon(args);
      S.publicaciones.push(a);
      (a.p_equipo || []).forEach(it => {
        const cel = dig(it.celular).slice(-10);
        if (!cel) return;
        S.equipo[cel] = { celular: cel, nombre: String(it.nombre || 'Sin nombre'), rol: it.rol || 'asesor',
          estado: it.estado || 'activo', jefe: dig(it.jefe).slice(-10) || null };
      });
      (a.p_asignaciones || []).forEach(it => {
        if (!it.id) return;
        S.asignaciones[it.id] = { id: it.id, persona_id: it.persona_id || '', asesor: dig(it.asesor).slice(-10), desde: it.desde };
      });
      return Promise.resolve({ ok: true, equipo: (a.p_equipo || []).length });
    }
    return Promise.resolve(null);
  };
  /* asesor_retirar desde el celular del gerente. */
  S.retirar = (cel, pasarA) => {
    Object.values(S.asignaciones).filter(a => a.asesor === cel).forEach(a => {
      const mismaFecha = Object.values(S.asignaciones).find(x => x.persona_id === a.persona_id && x.desde === HOY);
      if (mismaFecha) mismaFecha.asesor = pasarA;
      else S.asignaciones['RE-' + a.persona_id] = { id: 'RE-' + a.persona_id, persona_id: a.persona_id, asesor: pasarA, desde: HOY };
    });
    S.equipo[cel].estado = 'retirado';
  };
  S.miAlcance = cel => {
    const yo = S.equipo[cel];
    if (yo && yo.estado === 'activo' && yo.rol === 'gerente') {
      return Object.values(S.equipo).filter(e => e.celular === cel || e.jefe === cel).map(e => e.celular).sort();
    }
    if (yo && yo.estado === 'activo') return [cel];
    return [];
  };
  S.base = cel => {
    const yo = S.equipo[cel];
    if (!yo || yo.estado !== 'activo') return [];
    const mios = S.miAlcance(cel);
    return Object.values(S.asignaciones).filter(a => mios.includes(a.asesor)).map(a => a.persona_id).sort();
  };
  return S;
}

function relojesPanel(P) {
  const cola = []; let n = 0;
  P.ctx.setTimeout = (f, ms) => { const id = ++n; cola.push({ id, f, ms }); return id; };
  P.ctx.clearTimeout = id => { const i = cola.findIndex(x => x.id === id); if (i >= 0) cola.splice(i, 1); };
  P.ctx.setInterval = (f, ms) => { const id = ++n; cola.push({ id, f, ms, intervalo: true }); return id; };
  P.ctx.clearInterval = P.ctx.clearTimeout;
  return {
    hay: ms => cola.some(x => x.ms === ms && !x.intervalo),
    disparar(ms) {
      const toca = cola.filter(x => x.ms === ms && !x.intervalo);
      toca.forEach(x => { cola.splice(cola.indexOf(x), 1); x.f(); });
      return toca.length;
    }
  };
}

/* El CRM de Joan con su equipo. El jefe de Pedro vive como ID (así lo deja
   traerEquipo). Pedro lleva a Marta (p1) desde hoy. */
function abrirConNube(o) {
  o = o || {};
  const P = abrirPanel();
  P.cargarCartera({
    socios: [{ id: 's1', nombre: 'Ana Torres', telefono: '3001112233', whatsappIgual: true }],
    prestamos: [],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' }],
    equipo: o.equipo || [
      { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
      { id: 'g2', nombre: 'OTRO GERENTE', rol: 'gerente', estado: 'activo', celular: OTRO },
      { id: 'a1', nombre: 'PEDRO ASESOR', rol: 'asesor', estado: 'activo', celular: PEDRO, jefe: 'g1' }],
    asignaciones: [
      { id: 'A1', socio_id: 'p1', asesor_id: 'a1', desde: HOY },
      { id: 'A2', socio_id: 's1', asesor_id: 'g1', desde: HOY }],
    gestiones: [], config: { negocio: 'Tu Garantía' }
  });
  P.ev('_selloDesdeDisco(false)');
  const t = o.relojes ? relojesPanel(P) : null;
  const nube = nubeEquipo();
  P.ctx._nube = nube;
  P.ev(`
    var _cuadros = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    /* 23-oct-2026 — la de 15 min pregunta además si la cartera está al día
       con la nube (libroAlDiaEsperando): aquí lo está. */
    window.NubeCRM = { estado: function () { return { fase: 'lista' }; }, libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) { return _nube.rpc(fn, args); };
  `);
  return { P, nube, t };
}
/* Lo que Joan deja en el cuadro antes de Guardar. */
function formulario(P, f) {
  P.ctx._f = Object.assign({ nombre: '', tel: '', rol: 'asesor', jefe: '', estado: '' }, f);
  P.ev("document.getElementById('eqNombre').value=_f.nombre; document.getElementById('eqTel').value=_f.tel;" +
       "document.getElementById('eqRol').value=_f.rol; document.getElementById('eqJefe').value=_f.jefe;" +
       "document.getElementById('eqEstado').value=_f.estado;");
}
/* Lo que el cuadro de «Editar a …» trae marcado, tal cual lo vería Joan. */
function loQueMuestraElCuadro(P, id) {
  P.ev("editarPersona('" + id + "')");
  const html = P.elems.mBody.innerHTML;
  const jefe = html.match(/<select id="eqJefe">([\s\S]*?)<\/select>/)[1];
  const estado = html.match(/<select id="eqEstado">([\s\S]*?)<\/select>/)[1];
  return {
    jefe: (jefe.match(/<option value="(\d*)" selected>/) || [null, ''])[1],
    estado: (estado.match(/<option value="(\w+)" selected>/) || [null, ''])[1],
    html
  };
}
/* 9:00 — la vuelta de 15 min publica; 10:00 — Willian retira a Pedro desde su
   celular; y Joan abre «Editar a Pedro» antes de que su CRM lo traiga.
   27-oct-2026, ronda 2 — la vuelta sin cambios ahora SÍ trae lo del gerente
   (si no, Joan decidía con una vista vieja durante todo el día): por eso el
   retiro pasa justo DESPUÉS de esa vuelta, que es el hueco que queda. */
async function willianRetiraAPedro(P, nube) {
  assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado', 'la vuelta de la mañana no publicó');
  await ticks();
  assert.deepEqual(nube.base(PEDRO), ['p1'], 'precondición: Pedro ve su base');
  assert.equal(await P.ev('publicarEquipoSolo()'), 'sin_cambios');
  await ticks();
  nube.retirar(PEDRO, WILLIAN);
  assert.deepEqual(nube.base(PEDRO), [], 'precondición: el retiro del gerente le corta la base');
  assert.equal(P.ev("personaDeEquipo('a1').estado"), 'activo', 'precondición: este computador no se enteró del retiro');
}

/* ======================================================================== */
describe('1 · editar a alguien no deshace lo que el gerente hizo en lo que Joan no tocó', () => {

  test('Joan le corrige el nombre a Pedro (o guarda sin tocar nada) con el cuadro diciendo «Activo»: Pedro sigue retirado y sin base', async () => {
    /* La réplica sigue al SQL de verdad. */
    const asesor = LEER('base/20260919_asesor.sql');
    assert.match(asesor, /estado = excluded\.estado, jefe = excluded\.jefe/, 'equipo_publicar ya no pisa estado y jefe: la réplica quedó vieja');
    assert.match(LEER('base/20260911_gerente_y_whatsapp.sql'), /'estado', estado,\s*'jefe', jefe/, 'equipo_traer dejó de devolver estado y jefe');
    const gestiona = LEER('base/20260922p_el_gerente_gestiona.sql');
    assert.match(gestiona, /update public\.equipo set estado = 'retirado'/);
    assert.match(gestiona, /on conflict \(persona_id, desde\) do update/);

    for (const caso of [{ nombre: 'PEDRO PÉREZ', que: 'corregirle el nombre' }, { nombre: 'PEDRO ASESOR', que: 'guardar sin tocar nada' }]) {
      const { P, nube } = abrirConNube();
      await willianRetiraAPedro(P, nube);
      /* 11:00 — «Editar a Pedro»: el cuadro dice lo de este computador. */
      const cuadro = loQueMuestraElCuadro(P, 'a1');
      assert.equal(cuadro.estado, 'activo');
      assert.equal(cuadro.jefe, WILLIAN);
      formulario(P, { nombre: caso.nombre, tel: PEDRO, rol: 'asesor', jefe: cuadro.jefe, estado: cuadro.estado });
      const r = await P.ev("guardarPersona('a1')");
      await ticks();
      assert.equal(r, 'publicado', caso.que + ': no se publicó (' + r + ')');
      assert.equal(nube.equipo[PEDRO].nombre, caso.nombre, caso.que + ': lo que Joan sí escribió no llegó');
      assert.equal(nube.equipo[PEDRO].estado, 'retirado', caso.que + ' deshizo el retiro que hizo el gerente');
      assert.deepEqual(nube.miAlcance(PEDRO), [], caso.que + ': el retirado volvió a tener alcance');
      assert.deepEqual(nube.base(PEDRO), [], caso.que + ': el retirado volvió a ver la base de sus clientes');
      assert.equal(P.ev("personaDeEquipo('a1').estado"), 'retirado', caso.que + ': este computador no se enteró del retiro al traer');
      assert.deepEqual(Object.keys(P.ev('leerEquipoPorPublicar()')), [], caso.que + ': quedó una marca pegada');
      assert.equal(P.ev('_cuadros.length'), 0);
    }
  });

  test('lo que Joan SÍ cambió gana y lo que no tocó lo manda la nube: le cambia el jefe a Pedro y el retiro del gerente se queda', async () => {
    const { P, nube } = abrirConNube();
    await willianRetiraAPedro(P, nube);
    const cuadro = loQueMuestraElCuadro(P, 'a1');
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: OTRO, estado: cuadro.estado });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].jefe, OTRO, 'el jefe que Joan cambió no llegó');
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'cambiar el jefe le devolvió el «activo» al retirado');
    assert.deepEqual(nube.base(PEDRO), []);
  });

  test('con la publicación pendiente (no se pudo traer), lo que el gerente hace en otro campo tampoco se pisa al reintentar', async () => {
    const { P, nube, t } = abrirConNube({ relojes: true });
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await ticks();
    /* Joan pasa a Pedro al otro gerente, pero no hay señal para traer: no se publica. */
    nube.traerFalla = true;
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: OTRO, estado: 'activo' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'fallo');
    await ticks();
    /* Mientras, Willian retira a Pedro desde su celular. */
    nube.retirar(PEDRO, WILLIAN);
    nube.traerFalla = false;
    assert.ok(t.hay(60000), 'no quedó el reintento');
    t.disparar(60000); await ticks();
    assert.equal(nube.publicaciones.length, 2, 'el reintento no publicó');
    assert.equal(nube.equipo[PEDRO].jefe, OTRO, 'el reintento perdió el cambio de jefe de Joan');
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'el reintento le devolvió el «activo» que Joan nunca tocó');
    assert.deepEqual(nube.base(PEDRO), []);
  });

  test('si su jefe ya no está entre los gerentes activos, el cuadro lo trae marcado y guardar no se lo quita', async () => {
    const { P, nube } = abrirConNube({ equipo: [
      { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'retirado', celular: WILLIAN },
      { id: 'g2', nombre: 'OTRO GERENTE', rol: 'gerente', estado: 'activo', celular: OTRO },
      { id: 'a1', nombre: 'PEDRO ASESOR', rol: 'asesor', estado: 'activo', celular: PEDRO, jefe: 'g1' }] });
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].jefe, WILLIAN);
    const cuadro = loQueMuestraElCuadro(P, 'a1');
    assert.equal(cuadro.jefe, WILLIAN, '«Reporta a» salió en «Nadie»: guardar contaría como un cambio de jefe que Joan no hizo');
    assert.match(cuadro.html, /WILLIAN \(retirado\)/, 'no dice que ese jefe está retirado');
    formulario(P, { nombre: 'PEDRO PÉREZ', tel: PEDRO, rol: 'asesor', jefe: cuadro.jefe, estado: cuadro.estado });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].nombre, 'PEDRO PÉREZ');
    assert.equal(nube.equipo[PEDRO].jefe, WILLIAN, 'corregir el nombre le quitó el jefe a Pedro');
  });
});

/* ======================================================================== */
/* Los historiales con crm.html de verdad, preguntándole al NubeCRM REAL del
   banco (el de la cartera) si la cartera está al día. */
function historialesCon(C, cart, estadoHist) {
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
  /* Por omisión, como lo deja importar(): pausados por el respaldo. Con
     `null`, la primera vez en este computador. */
  if (estadoHist === undefined) estadoHist = { v: 1, socios: {}, habilitado: null, pausa: { motivo: 'respaldo', en: '2026-10-22T10:00:00.000Z' } };
  if (estadoHist) P.almacen['joan_crm_historiales'] = JSON.stringify(estadoHist);
  P.elems.modal.classList.contains = () => false;
  P.ctx._C = C;
  P.ev(`window.NubeCRM = { configurar: function () {}, apagar: function () {}, algoCambio: function () {}, accion: function () {},
    estado: function () { return { fase: 'lista', cinta: { fase: 'al-dia', clase: 'calma', l1: 'x', l2: '' } }; },
    libroAlDia: function () { return _C.libroAlDia(); } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, S, t };
}
const sinProto = v => JSON.parse(JSON.stringify(v));
function contarTraidas(srv) {
  const c = { n: 0, falla: null };
  const traer0 = srv.traer;
  srv.traer = d => { c.n++; if (c.falla) return Promise.reject(c.falla); return traer0(d); };
  return c;
}
/* Una sesión nueva del CRM en el mismo navegador: misma cartera, mismo espejo,
   misma pestaña (su sello), NubeCRM recién creado. */
const sesionNueva = m => B.montar({ alm: m.alm, srv: m.srv, tab: m.tab });

describe('2 · los historiales no se encienden solos con una cartera que la nube ya dejó atrás', () => {

  test('un respaldo viejo al que le falta un crédito nuevo: no suben, y la línea dice qué falta; con el crédito bajado, sí', async () => {
    /* El computador de Joan, emparejado: 2 clientes con un crédito cada uno. */
    const db = B.cartera(2, 1);
    const m = B.montar({ db: clon(db) });
    await B.sembrar(m); await ticks();
    /* Después le presta otra vez a Socio 0 (P2) y sube solo. El respaldo de la USB es de antes. */
    const p2 = B.credito(2, 0, { capital: 700000, fechaDesembolso: '2026-10-18', cicloActual: '2026-10-30' });
    m.srv.creditos.P2 = { datos: B.comoJsonb(N.sinFotos(p2)), revision: 1, borrado: false,
      actualizado_por: 'computador', actualizado_en: '2026-10-18T12:00:00Z' };
    /* Importa el respaldo: importar() escribe la cartera y suelta el espejo. */
    m.tab.guardar(clon(db));
    m.alm.removeItem(B.ESPEJO);
    await m.C.vuelta(false); await ticks();
    assert.equal(m.C.estado().fase, 'lista', 'no se emparejó sola');
    assert.equal(B.estadoDisco(m.alm).ultimoEmparejo.soloEnLaNube, 1);
    assert.deepEqual(sinProto(m.C.libroAlDia()), { ok: false, motivo: 'nube-mas-nueva', fichas: 1 },
      'dijo que el respaldo es la cartera de hoy con un crédito de 700.000 que solo está en la nube');

    const h = historialesCon(m.C, B.leerDisco(m.alm));
    h.t.disparar(5000); await h.P.ev('HistorialesAuto.listo()'); await ticks();
    assert.equal(h.S.lotes.length, 0, 'subió el historial de Socio 0 sin su crédito nuevo');
    const est = JSON.parse(h.P.almacen['joan_crm_historiales']);
    assert.ok(!est.habilitado, 'se encendió sola');
    const c = h.P.ev('HistorialesAuto.estado()').cinta;
    assert.equal(c.fase, 'esperando-libro');
    assert.match(c.l2, /La nube tiene 1 ficha más nueva que esta cartera/);
    assert.match(c.l2, /☁ Subir<\/a> \(paso 6/, 'no dice dónde se juntan');

    /* Joan baja P2 (☁ Subir, paso 6): la cartera la tiene y el espejo conoce su revisión. */
    const conP2 = B.leerDisco(m.alm); conP2.prestamos.push(p2);
    m.tab.guardar(conP2);
    const esp = B.espejoDisco(m.alm);
    esp.creditos.P2 = { revision: 1, json: N.jsonCanonico(m.srv.creditos.P2.datos), borrado: false,
      actualizado_por: 'computador', actualizado_en: '2026-10-18T12:00:00Z' };
    m.alm.setItem(B.ESPEJO, JSON.stringify(esp));
    const s = sesionNueva(m);
    assert.deepEqual(sinProto(s.C.libroAlDia()), { ok: false, motivo: 'comparando' });
    await ticks();
    assert.deepEqual(sinProto(s.C.libroAlDia()), { ok: true, motivo: 'al-dia' }, 'con todo bajado, no quedó al día');
  });

  test('un origen viejo emparejado hace semanas, sin nada que subir: compara con la nube y ve el abono del celular', async () => {
    const m = B.montar({ db: B.cartera(3, 1) });
    await B.sembrar(m); await ticks();
    /* Desde entonces el celular cobró en P0. */
    m.srv.celular('creditos', 'P0', d => { d.abonosCapital = [{ fecha: '2026-10-10', monto: 300000 }]; });
    const traidas = contarTraidas(m.srv);
    const v = sesionNueva(m);
    await v.C.vuelta(false); await ticks();
    assert.equal(v.C.estado().fase, 'lista');
    assert.equal(v.C.estado().congeladas, 0, 'precondición: nada choca, porque nada sube');
    assert.deepEqual(sinProto(v.C.libroAlDia()), { ok: false, motivo: 'comparando' },
      'dijo «al día» sin haber mirado la nube en esta sesión');
    await ticks();
    assert.deepEqual(sinProto(v.C.libroAlDia()), { ok: false, motivo: 'nube-mas-nueva', fichas: 1 });
    /* Esperando, no se trae la nube entera cada vez que se pregunta. */
    const n = traidas.n;
    for (let i = 0; i < 5; i++) v.C.libroAlDia();
    await ticks();
    assert.equal(traidas.n, n, 'volvió a traer la nube entera sin que el espejo se moviera');

    /* Los historiales de ese origen, la primera vez: esperan, y la línea dice
       qué esperan. Cuando vuelve la comparación (crm.html le avisa con
       libroCambio al repintar la nube), dice lo que se encontró. */
    const w = sesionNueva(m);
    const h = historialesCon(w.C, B.leerDisco(m.alm), null);
    h.t.disparar(5000); await h.P.ev('HistorialesAuto.listo()');
    const linea = () => h.P.ev('HistorialesAuto.estado()').cinta;
    assert.equal(linea().fase, 'esperando-libro', 'se encendió sola sin mirar la nube');
    assert.match(linea().l2, /comparando tu cartera con lo que hay en la nube/);
    await ticks();
    h.P.ev('HistorialesAuto.libroCambio()');
    assert.match(linea().l2, /La nube tiene 1 ficha más nueva que esta cartera/, 'la línea se quedó diciendo «comparando»');
    assert.equal(h.S.lotes.length, 0, 'subió el crédito sin el abono del celular');

    /* El control: el mismo origen sin nada nuevo en la nube sí queda al día. */
    const k = B.montar({ db: B.cartera(3, 1) });
    await B.sembrar(k); await ticks();
    const k2 = sesionNueva(k);
    await k2.C.vuelta(false);
    k2.C.libroAlDia(); await ticks();
    assert.deepEqual(sinProto(k2.C.libroAlDia()), { ok: true, motivo: 'al-dia' });
  });

  test('si no puede comparar, no dice «al día»: lo dice con la espera, y no golpea a la nube en cada pregunta', async () => {
    const m = B.montar({ db: B.cartera(2, 1) });
    await B.sembrar(m); await ticks();
    const traidas = contarTraidas(m.srv);
    traidas.falla = { motivo: 'sin señal' };
    const v = sesionNueva(m);
    assert.deepEqual(sinProto(v.C.libroAlDia()), { ok: false, motivo: 'comparando' });
    await ticks();
    assert.deepEqual(sinProto(v.C.libroAlDia()), { ok: false, motivo: 'sin-comparar', espera: 60000, detalle: 'sin señal' });
    for (let i = 0; i < 5; i++) v.C.libroAlDia();
    await ticks();
    assert.equal(traidas.n, 1, 'reintentó sin esperar');
  });
});

/* ======================================================================== */
describe('3 · si el navegador no deja anotar el emparejo, se para y lo dice', () => {

  /* Una traída de más se corta a la fuerza en 20: sin el arreglo, la vuelta
     no termina nunca y la prueba se colgaría en vez de fallar. */
  function conTope(srv) {
    const c = { n: 0 };
    const traer0 = srv.traer;
    srv.traer = d => { c.n++; if (c.n > 20) return new Promise(() => {}); return traer0(d); };
    return c;
  }

  test('la vuelta sola trae UNA vez, pinta en rojo, y ni las vueltas ni los relojes la vuelven a traer; el clic prueba otra vez', async () => {
    const m = B.montar({ db: B.cartera(3, 1) });
    const traidas = conTope(m.srv);
    m.alm.llenas[B.ESTADO] = true;
    m.C.vuelta(false);
    await ticks(300);
    assert.equal(traidas.n, 1, 'trajo la nube entera ' + traidas.n + ' veces en UNA vuelta');
    let c = m.C.estado().cinta;
    assert.equal(c.fase, 'estado-no-cabe');
    assert.equal(c.clase, 'mal', 'el fallo no salió en rojo');
    assert.match(c.l1, /navegador está lleno/);
    assert.match(c.l2, /libera espacio/);
    assert.doesNotMatch(c.l1 + c.l2, /Emparejando/, 'dice que empareja cuando está parado');
    assert.equal(m.srv.lotes.length, 0, 'subió sin haber anotado el emparejo');
    assert.deepEqual(sinProto(m.C.libroAlDia()), { ok: false, motivo: 'navegador-lleno' });
    /* Las vueltas de 90 s, el arranque y los relojes no la vuelven a traer. */
    for (let i = 0; i < 3; i++) m.C.vuelta(false);
    m.timers.splice(0).forEach(x => x.f());
    await ticks(300);
    assert.equal(traidas.n, 1, 'una vuelta sola volvió a traer la nube entera');
    /* El clic de Joan es el reintento: UNA traída, y se para igual. */
    m.C.accion(); await ticks(300);
    assert.equal(traidas.n, 2);
    assert.equal(m.C.estado().cinta.fase, 'estado-no-cabe');
    /* Con espacio, el clic empareja y sube. */
    m.alm.llenas[B.ESTADO] = false;
    m.C.accion(); await ticks(300);
    assert.equal(traidas.n, 3);
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
    assert.equal(Object.keys(m.srv.socios).length, 3);
  });

  test('con el «sí» de Joan en el cuadro, lo mismo: se para tras una traída', async () => {
    const m = B.montar({ db: B.cartera(3, 1) });
    const traidas = conTope(m.srv);
    m.alm.llenas[B.ESTADO] = true;
    await m.C.emparejar();
    assert.ok(m.vent.modal, 'no enseñó los montones');
    m.C.confirmarEmparejar();
    await ticks(300);
    assert.equal(traidas.n, 1, 'el sí de Joan trajo la nube entera ' + traidas.n + ' veces');
    assert.equal(m.C.estado().cinta.fase, 'estado-no-cabe');
    assert.equal(m.C.estado().cinta.clase, 'mal');
  });
});
