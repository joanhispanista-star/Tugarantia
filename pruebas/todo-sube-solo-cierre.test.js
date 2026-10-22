'use strict';
/* ============================================================================
 * TODO SUBE SOLO — EL CIERRE DE LA LENTE «NUBE» — 23 de octubre de 2026
 *
 *   node --test pruebas/todo-sube-solo-cierre.test.js
 *
 * La revisión de e782ba7 dejó tres hallazgos vivos. Cada bloque cierra uno:
 *
 *   1 · seguridad. Si lo traído de la nube aterrizaba con el cuadro «Editar»
 *       abierto (la publicación de otra persona, o el reintento de una que
 *       falló), el «Activo» viejo que seguía en el cuadro contaba como un
 *       cambio de Joan: corregir el nombre deshacía el retiro del gerente.
 *   2 · plata. La publicación sola del equipo (la de 15 min) salía con un
 *       respaldo viejo recién importado, porque se emparejaba solo y la puerta
 *       solo miraba 'lista': el gerente cobraba un crédito ya pagado.
 *   3 · texto. Tras emparejar con «la nube tiene otra cartera», los
 *       historiales llamaban «más nuevas» a las fichas de la cartera de prueba
 *       y mandaban a juntarlas con la de verdad.
 *
 * Se mira lo que pasa en la NUBE (dobles con las reglas del SQL), no solo lo
 * que dice la pantalla. Cada prueba de este archivo falla contra e782ba7.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');

const RAIZ = path.join(__dirname, '..');
const FUENTE_HIST = fs.readFileSync(path.join(RAIZ, 'panel/historiales-auto.js'), 'utf8');
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 20); i++) await tick(); }
const clon = v => JSON.parse(JSON.stringify(v));
const sinProto = v => JSON.parse(JSON.stringify(v));
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const WILLIAN = '3000000000', PEDRO = '3000000001', OTRO = '3000000002', ANA = '3000000003', TERCERO = '3000000004';

/* --------------------------------------------------------------------------
 * LA NUBE DEL EQUIPO, con las reglas del SQL (pruebas/todo-sube-solo-23-oct
 * comprueba que el SQL sigue diciendo eso): equipo_publicar PISA estado y
 * jefe por celular; equipo_traer los devuelve; asesor_retirar deja al asesor
 * 'retirado' y pasa sus clientes al gerente con una fila de HOY; mi_alcance
 * de un retirado es nadie.
 * ------------------------------------------------------------------------ */
function nubeEquipo() {
  const dig = s => String(s == null ? '' : s).replace(/\D/g, '');
  const S = { equipo: {}, asignaciones: {}, publicaciones: [], traerFalla: false };
  S.rpc = (fn, args) => {
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

/* El CRM de Joan con su equipo: Willian y otro gerente, Pedro (de Willian,
   lleva a Marta) y Ana (de Willian, lleva a Ana Torres). */
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
      { id: 'g3', nombre: 'TERCER GERENTE', rol: 'gerente', estado: 'activo', celular: TERCERO },
      { id: 'a1', nombre: 'PEDRO ASESOR', rol: 'asesor', estado: 'activo', celular: PEDRO, jefe: 'g1' },
      { id: 'a2', nombre: 'ANA ASESORA', rol: 'asesor', estado: 'activo', celular: ANA, jefe: 'g1' }],
    asignaciones: [
      { id: 'A1', socio_id: 'p1', asesor_id: 'a1', desde: HOY },
      { id: 'A2', socio_id: 's1', asesor_id: 'a2', desde: HOY }],
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
    window.NubeCRM = { estado: function () { return { fase: 'lista' }; },
      libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) { return _nube.rpc(fn, args); };
  `);
  return { P, nube, t };
}
function formulario(P, f) {
  P.ctx._f = Object.assign({ nombre: '', tel: '', rol: 'asesor', jefe: '', estado: '' }, f);
  P.ev("document.getElementById('eqNombre').value=_f.nombre; document.getElementById('eqTel').value=_f.tel;" +
       "document.getElementById('eqRol').value=_f.rol; document.getElementById('eqJefe').value=_f.jefe;" +
       "document.getElementById('eqEstado').value=_f.estado;");
}
/* Lo que el cuadro de «Editar a …» trae marcado, tal cual lo vería Joan. */
function loQueMuestraElCuadro(P, id) {
  P.ev("editarPersona('" + id + "')");
  return marcadoEnElCuadro(P);
}
function marcadoEnElCuadro(P) {
  const html = P.elems.mBody.innerHTML;
  const jefe = html.match(/<select id="eqJefe">([\s\S]*?)<\/select>/)[1];
  const estado = html.match(/<select id="eqEstado">([\s\S]*?)<\/select>/)[1];
  return {
    jefe: (jefe.match(/<option value="(\d*)" selected>/) || [null, ''])[1],
    estado: (estado.match(/<option value="(\w+)" selected>/) || [null, ''])[1]
  };
}

/* ======================================================================== */
describe('1 · lo que llega de la nube con el cuadro «Editar» abierto no se vuelve un cambio de Joan', () => {

  test('la traída de la publicación de OTRA persona aterriza con el cuadro de Pedro abierto: corregirle el nombre no deshace el retiro', async () => {
    const { P, nube } = abrirConNube();
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await ticks();
    /* 10:00 — Willian retira a Pedro desde su celular. */
    nube.retirar(PEDRO, WILLIAN);
    /* 11:00 — Joan le corrige el apellido a Ana (sale su publicación, que
       trae primero) y enseguida abre a Pedro: el cuadro dice «Activo». */
    formulario(P, { nombre: 'ANA ASESORA G.', tel: ANA, rol: 'asesor', jefe: WILLIAN, estado: 'activo' });
    const deAna = P.ev("guardarPersona('a2')");
    const cuadro = loQueMuestraElCuadro(P, 'a1');
    assert.equal(cuadro.estado, 'activo', 'precondición: el cuadro se abrió antes de que llegara el retiro');
    assert.equal(await deAna, 'publicado');
    await ticks();
    assert.equal(P.ev("personaDeEquipo('a1').estado"), 'retirado', 'precondición: la traída aterrizó con el cuadro abierto');
    /* Joan solo le corrige el nombre a Pedro y guarda. */
    formulario(P, { nombre: 'PEDRO PÉREZ', tel: PEDRO, rol: 'asesor', jefe: cuadro.jefe, estado: cuadro.estado });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].nombre, 'PEDRO PÉREZ', 'lo que Joan sí escribió no llegó');
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'el «Activo» viejo del cuadro deshizo el retiro del gerente');
    assert.deepEqual(nube.miAlcance(PEDRO), [], 'el retirado volvió a tener alcance');
    assert.equal(P.ev("personaDeEquipo('a1').estado"), 'retirado');
    assert.ok(!P.ev('personasDestino().map(p => p.id)').includes('a1'), 'Repartir lo ofrece otra vez');
    assert.deepEqual(Object.keys(P.ev('leerEquipoPorPublicar()')), [], 'quedó una marca protegiendo el «activo» viejo');
    assert.equal(P.ev('_cuadros.length'), 0, 'preguntó sin que Joan hubiera tocado lo que cambió la nube');
  });

  test('el REINTENTO de una publicación que falló trae con el cuadro abierto: tampoco', async () => {
    const { P, nube, t } = abrirConNube({ relojes: true });
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await ticks();
    /* Guardar a Ana sin señal: no se publica y queda un reintento a 1 min. */
    nube.traerFalla = true;
    formulario(P, { nombre: 'ANA ASESORA G.', tel: ANA, rol: 'asesor', jefe: WILLIAN, estado: 'activo' });
    assert.equal(await P.ev("guardarPersona('a2')"), 'fallo');
    await ticks();
    nube.traerFalla = false;
    nube.retirar(PEDRO, WILLIAN);
    const cuadro = loQueMuestraElCuadro(P, 'a1');
    assert.equal(cuadro.estado, 'activo');
    /* El reintento hereda porCambio: sale con Joan dentro del cuadro. */
    P.ev('estoyOcupado = function () { return true; }');
    assert.ok(t.hay(60000), 'no quedó el reintento');
    t.disparar(60000); await ticks();
    assert.equal(P.ev("personaDeEquipo('a1').estado"), 'retirado', 'precondición: el reintento trajo con el cuadro abierto');
    formulario(P, { nombre: 'PEDRO PÉREZ', tel: PEDRO, rol: 'asesor', jefe: cuadro.jefe, estado: cuadro.estado });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].nombre, 'PEDRO PÉREZ');
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'el reintento abrió la puerta y el «Activo» viejo deshizo el retiro');
    assert.deepEqual(nube.base(PEDRO), []);
  });

  test('lo que Joan SÍ toca gana, y lo que la nube cambió en otro campo se queda: retira a Pedro mientras le cambiaron el jefe', async () => {
    const { P, nube } = abrirConNube();
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await ticks();
    const cuadro = loQueMuestraElCuadro(P, 'a1');
    assert.equal(cuadro.jefe, WILLIAN);
    /* Mientras, en la nube a Pedro lo pasan al otro gerente, y una traída
       aterriza con el cuadro abierto. */
    nube.equipo[PEDRO].jefe = OTRO;
    await P.ev("traerEquipo('auto')"); await ticks();
    assert.equal(P.ev("celularDeJefe(personaDeEquipo('a1').jefe)"), OTRO, 'precondición: la traída aterrizó');
    /* Joan lo retira (cambia «Estado») y no toca «Reporta a». */
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: cuadro.jefe, estado: 'retirado' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'el retiro de Joan no llegó');
    assert.equal(nube.equipo[PEDRO].jefe, OTRO, 'el «Reporta a» viejo del cuadro pisó el jefe que puso la nube');
    assert.equal(P.ev('_cuadros.length'), 0, 'preguntó por un campo que Joan no tocó');
  });

  /* Joan le cambia el jefe a Pedro; mientras, la nube también se lo cambió. */
  async function choqueDeJefe(respuesta) {
    const { P, nube } = abrirConNube();
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await ticks();
    const cuadro = loQueMuestraElCuadro(P, 'a1');
    nube.equipo[PEDRO].jefe = OTRO;
    await P.ev("traerEquipo('auto')"); await ticks();
    P.ev('confirm = function (m) { _cuadros.push(String(m)); return ' + (respuesta ? 'true' : 'false') + '; }');
    formulario(P, { nombre: 'PEDRO PÉREZ', tel: PEDRO, rol: 'asesor', jefe: TERCERO, estado: cuadro.estado });
    const antes = nube.publicaciones.length;
    const r = await P.ev("guardarPersona('a1')");
    await ticks();
    return { P, nube, r, antes };
  }

  test('si la nube cambió lo MISMO que Joan tocó, se le dice antes de guardar con los tres valores; Cancelar no guarda ni publica nada', async () => {
    const { P, nube, r, antes } = await choqueDeJefe(false);
    assert.equal(P.ev('_cuadros.length'), 1, 'guardó sin decirle que la nube cambió lo mismo que tocó');
    const m = P.ev('_cuadros[0]');
    assert.match(m, /Mientras tenías abierto el cuadro de PEDRO ASESOR/);
    assert.match(m, /Reporta a: el cuadro decía «WILLIAN», ahora es «OTRO GERENTE» y tú pusiste «TERCER GERENTE»/);
    assert.doesNotMatch(m, /Estado:/, 'preguntó por el estado, que nadie cambió');
    assert.equal(r, 'cancelado');
    assert.equal(nube.publicaciones.length, antes, 'publicó con Cancelar');
    assert.equal(nube.equipo[PEDRO].jefe, OTRO);
    assert.equal(P.ev("personaDeEquipo('a1').nombre"), 'PEDRO ASESOR', 'guardó el nombre con Cancelar');
    assert.deepEqual(Object.keys(P.ev('leerEquipoPorPublicar()')), []);
    /* El cuadro, otra vez, con lo de ahora y con lo que Joan escribió. */
    assert.equal(marcadoEnElCuadro(P).jefe, OTRO, 'el cuadro no se abrió con lo de ahora');
    assert.equal(P.elems.eqNombre.value, 'PEDRO PÉREZ', 'se perdió el nombre que escribió');
  });

  test('… y con Aceptar queda lo de Joan', async () => {
    const { P, nube, r } = await choqueDeJefe(true);
    assert.equal(P.ev('_cuadros.length'), 1);
    assert.equal(r, 'publicado');
    assert.equal(nube.equipo[PEDRO].jefe, TERCERO);
    assert.equal(nube.equipo[PEDRO].nombre, 'PEDRO PÉREZ');
  });
});

/* ======================================================================== */
/* La cartera de Joan con su equipo: Socio 0 (C0) tiene un crédito abierto de
   100.000 (P0) y lo lleva Pedro. */
function carteraConEquipo() {
  const db = B.cartera(2, 1);
  db.prestamos.forEach(p => { p.fechaDesembolso = '2026-10-01'; p.cicloActual = '2026-10-30'; p.comprobantes = []; });
  db.equipo = [{ id: 'a1', nombre: 'PEDRO', rol: 'asesor', estado: 'activo', celular: PEDRO }];
  db.asignaciones = [{ id: 'A1', socio_id: 'C0', asesor_id: 'a1', desde: '2026-10-01' }];
  db.prospectos = []; db.gestiones = [];
  return db;
}
/* crm.html de verdad con esa cartera, preguntándole al NubeCRM REAL del banco. */
function panelCon(C, db) {
  const P = abrirPanel();
  P.cargarCartera(clon(db));
  P.ev('_selloDesdeDisco(false)');
  P.ctx._C = C;
  P.ev(`
    var _pub = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    estoyOcupado = function () { return false; };
    window.NubeCRM = _C;
    rpc = function (fn, args) {
      if (fn === 'equipo_traer') return Promise.resolve({ equipo: [{ celular: '${PEDRO}', nombre: 'PEDRO', rol: 'asesor', estado: 'activo', jefe: null }], asignaciones: [], contactos: [] });
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') { _pub.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
  `);
  return P;
}
function contarTraidas(srv) {
  const c = { n: 0 };
  const traer0 = srv.traer;
  srv.traer = d => { c.n++; return traer0(d); };
  return c;
}
const sesionNueva = m => B.montar({ alm: m.alm, srv: m.srv, tab: m.tab });

describe('2 · la publicación sola del equipo espera a que la cartera esté al día con la nube', () => {

  test('un respaldo viejo recién importado (un crédito que la nube ya tiene pagado sigue abierto): no publica, y la línea dice por qué', async () => {
    const respaldo = carteraConEquipo();               // el de la USB, del 1-oct
    const m = B.montar({ db: clon(respaldo) });
    await B.sembrar(m); await ticks();
    /* Socio 0 pagó P0; Joan lo marcó y subió solo. */
    const hoyDb = B.leerDisco(m.alm);
    const p0 = hoyDb.prestamos.find(p => p.id === 'P0');
    p0.pagado = true; p0.fechaPagado = '2026-10-15';
    m.tab.guardar(hoyDb);
    await m.C.vuelta(false); await ticks();
    assert.equal(m.srv.creditos.P0.datos.pagado, true, 'precondición: la nube lo tiene pagado');
    /* Importa el respaldo (importar() escribe la cartera y suelta el espejo) y
       la vuelta de 90 s lo empareja sola. */
    m.tab.guardar(clon(respaldo));
    m.alm.removeItem(B.ESPEJO);
    await m.C.vuelta(false); await ticks();
    assert.equal(m.C.estado().fase, 'lista', 'precondición: se emparejó sola');
    assert.equal(sinProto(m.C.libroAlDia()).motivo, 'en-discusion', 'precondición: P0 quedó en discusión');

    const P = panelCon(m.C, respaldo);
    const r = await P.ev('publicarEquipoSolo()');
    await ticks();
    assert.equal(P.ctx._pub.length, 0, 'publicó al gerente el saldo de un crédito que la nube tiene pagado');
    assert.equal(r, 'cartera_no_al_dia');
    const linea = P.elems.equipoPublicadoSolo.innerHTML;
    assert.match(linea, /no se publica sola/);
    assert.match(linea, /en discusión/);
    assert.match(linea, /☁ Subir<\/a> \(paso 7\)/, 'no dice dónde se decide');
    /* En la línea común va primero el rojo de la cartera (la ficha en
       discusión); el del equipo se cuenta como otro aviso y su pieza lo dice. */
    const comun = P.ev('pintarNubeTodo()');
    assert.notEqual(comun.clase, 'calma', 'la línea común siguió diciendo que todo sube solo');
    assert.ok(comun.problemas >= 2, 'el equipo no cuenta como aviso: ' + comun.l1 + ' · ' + comun.l2);
    const pieza = P.ev('piezaNubeEquipo(Date.now())');
    assert.equal(pieza.normal, false);
    assert.match(pieza.l1, /no se publica sola/);
    assert.match(pieza.l2, /en discusión/);
    /* Un acto de Joan sí sale: un retiro tiene que llegar ya. */
    assert.equal(await P.ev('publicarEquipoSolo({ porCambio: true })'), 'publicado');
  });

  test('un origen viejo al que el celular le cobró: espera la comparación (no lee «comparando» y sigue) y no publica; al día, sí, aunque la cartera esté subiendo', async () => {
    const m = B.montar({ db: carteraConEquipo() });
    await B.sembrar(m); await ticks();
    m.srv.celular('creditos', 'P0', d => { d.abonosCapital = [{ fecha: '2026-10-10', monto: 60000 }]; });
    const v = sesionNueva(m);
    await v.C.vuelta(false); await ticks();
    const P = panelCon(v.C, B.leerDisco(m.alm));
    const r = await P.ev('publicarEquipoSolo()');
    await ticks();
    assert.equal(P.ctx._pub.length, 0, 'publicó el saldo de P0 sin el abono que cobró el celular');
    assert.equal(r, 'cartera_no_al_dia');
    assert.equal(P.ev('_libroEquipo.motivo'), 'nube-mas-nueva', 'no esperó la comparación');
    assert.match(plano(P.elems.equipoPublicadoSolo.innerHTML), /la nube tiene 1 ficha más nueva que esta cartera/);
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /☁ Subir<\/a> \(paso 6/);

    /* El control: el mismo origen sin nada nuevo en la nube publica en esa
       misma vuelta, aunque la primera respuesta sea «comparando» y aunque la
       cartera esté subiendo justo entonces (espera a que termine). */
    const k = B.montar({ db: carteraConEquipo() });
    await B.sembrar(k); await ticks();
    const k2 = sesionNueva(k);
    const traidas = contarTraidas(k.srv);
    const db2 = B.leerDisco(k.alm);
    db2.socios[1].notaRiesgo = 'nota nueva';            // algo que subir: la vuelta se queda en el aire
    k.tab.guardar(db2);
    const Q = panelCon(k2.C, db2);
    const subiendo = k2.C.vuelta(false);
    const q = Q.ev('publicarEquipoSolo()');
    await subiendo;
    assert.equal(await q, 'publicado', 'con la cartera al día no publicó');
    assert.equal(Q.ctx._pub.length, 1);
    assert.equal(traidas.n, 1, 'no comparó con la nube una vez');
    assert.equal(Q.ev('_libroEquipo'), null);
  });
});

/* ======================================================================== */
/* Los historiales con crm.html de verdad, preguntándole al NubeCRM REAL. */
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
    libroAlDia: function () { return _C.libroAlDia(); } };`);
  vm.runInContext(FUENTE_HIST, P.ctx, { filename: 'historiales-auto.js' });
  P.ev('document.getElementById("pinInput").value = DB.config.pin');
  P.ev('entrar()');
  return { P, S, t };
}

describe('3 · tras emparejar con «la nube tiene otra cartera», sus fichas no son «más nuevas»', () => {

  test('con el sí de Joan, la cartera queda al día, los historiales suben sin mandar a juntar nada, y lo de verdad más nuevo sí se cuenta', async () => {
    /* La nube: una cartera de prueba (ids CT… y PT…) que la de Joan no tiene. */
    const prueba = B.montar({ db: (() => {
      const d = B.cartera(3, 1);
      d.socios.forEach(s => { s.id = 'CT' + s.id; });
      d.prestamos.forEach(p => { p.id = 'PT' + p.id; p.socioId = 'CT' + p.socioId; });
      return d;
    })() });
    await B.sembrar(prueba); await ticks();
    /* El computador de Joan, con su cartera de verdad, contra esa nube. */
    const m = B.montar({ db: B.cartera(2, 1), srv: prueba.srv });
    await m.C.vuelta(false); await ticks();
    assert.equal(m.C.estado().cinta.fase, 'libro-distinto', 'precondición');
    /* Toca la cinta: los montones, con el aviso de «otra cartera». */
    await m.C.accion(); await ticks();
    const montones = m.vent.modal.h;
    assert.match(montones, /una de prueba/);
    m.C.confirmarEmparejar(); await ticks();
    assert.equal(m.C.estado().fase, 'lista');

    assert.deepEqual(sinProto(m.C.libroAlDia()), { ok: true, motivo: 'al-dia' },
      'llamó «más nuevas que esta cartera» a las fichas de la cartera de prueba');
    /* El montón que Joan vio antes del sí tampoco mandaba a juntarlas. */
    assert.match(montones, /Son de la otra cartera/, 'el montón «Solo en la nube» no dice que son de la otra cartera');
    assert.doesNotMatch(montones, /se juntan con lo tuyo/, 'el cuadro manda a juntar las fichas de la otra cartera con la de Joan');
    const est = B.estadoDisco(m.alm);
    assert.equal(est.ultimoEmparejo.deOtraCartera, 6);
    assert.equal(Object.keys(est.deOtraCartera).length, 6);
    assert.match(m.barra.innerHTML, /6 de la otra cartera, que siguen en la nube \(no se tocan ni se juntan con la tuya\)/);

    /* Los historiales de ese computador, la primera vez: suben, sin «más nuevas». */
    const h = historialesCon(m.C, B.leerDisco(m.alm));
    h.t.disparar(5000); await h.P.ev('HistorialesAuto.listo()'); await ticks();
    const c = h.P.ev('HistorialesAuto.estado()').cinta;
    assert.notEqual(c.fase, 'esperando-libro', c.l1 + ' · ' + c.l2);
    assert.doesNotMatch(c.l1 + ' ' + c.l2, /más nueva|paso 6/);
    assert.ok(h.S.lotes.length > 0, 'los historiales no subieron');
    const subidos = [].concat(...h.S.lotes).map(x => JSON.stringify(x)).join(' ');
    assert.doesNotMatch(subidos, /CT\d/, 'subieron clientes de la cartera de prueba');

    /* Mañana (otra sesión del CRM): lo sigue sabiendo. */
    const s = sesionNueva(m);
    s.C.libroAlDia(); await ticks();
    assert.deepEqual(sinProto(s.C.libroAlDia()), { ok: true, motivo: 'al-dia' }, 'al recargar, las volvió a contar');

    /* Y lo de verdad más nuevo (el celular cobró en P0, que sí es de Joan) se cuenta. */
    m.srv.celular('creditos', 'P0', d => { d.abonosCapital = [{ fecha: '2026-10-10', monto: 50000 }]; });
    const s2 = sesionNueva(m);
    s2.C.libroAlDia(); await ticks();
    assert.deepEqual(sinProto(s2.C.libroAlDia()), { ok: false, motivo: 'nube-mas-nueva', fichas: 1 });
  });
});
