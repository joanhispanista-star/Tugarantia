'use strict';
/* ============================================================================
 * TODO SUBE SOLO — LA REVISIÓN — 22 de octubre de 2026
 *
 *   node --test pruebas/todo-sube-solo-revision.test.js
 *
 * La verificación de c0dda51 («todo lo que sube a la nube sube solo») dejó
 * tres hallazgos en pie. Cada bloque cierra uno POR CLASE, no solo el caso:
 *
 *   S1 · seguridad. Retirar, crear, editar o cambiarle el jefe a alguien del
 *        equipo no se publicaba: la huella de la publicación sola solo miraba
 *        asignaciones y gente, y retirar no cambia ninguna de las dos. Un
 *        retirado seguía viendo nombre, celular, saldo y fecha de pago de sus
 *        clientes. Debajo había dos más de la misma clase: publicar TRAE
 *        primero y la nube manda en estado y jefe, así que el retiro se
 *        deshacía justo antes de salir; y el jefe viajaba como id, que el
 *        servidor recorta a un celular que no existe.
 *   S2 · datos. La siembra sola borraba de la nube, sin preguntar, un crédito
 *        restaurado después del respaldo que se importó (con sus abonos).
 *   S3 · texto. Sin app/etapas.js no se puede publicar al equipo, y la línea
 *        «☁ Todo sube solo» seguía en calma.
 *
 * Lo que se mira es lo que pasa en la NUBE (una de mentira con las reglas del
 * SQL: equipo_publicar y mi_alcance), no lo que dice la pantalla. Cada prueba
 * de este archivo falla contra c0dda51.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const B = require('./banco-nube-crm.js');
const N = require('../panel/nube.js');

const RAIZ = path.join(__dirname, '..');
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const clon = v => JSON.parse(JSON.stringify(v));

const WILLIAN = '3000000000', PEDRO = '3000000001', OTRO = '3000000002', LUISA = '3000000009';

/* --------------------------------------------------------------------------
 * LA NUBE DEL EQUIPO, con las reglas del SQL de verdad:
 *   · equipo_publicar (base/20260919_asesor.sql): upsert por celular; el jefe
 *     se queda con los diez últimos DÍGITOS de lo que llegue;
 *   · equipo_traer (base/20260911_gerente_y_whatsapp.sql): devuelve estado y
 *     jefe de cada uno, que es lo que hace que un retiro sin publicar se
 *     deshaga al traer;
 *   · mi_alcance (base/20260922p_el_gerente_gestiona.sql): un gerente ACTIVO
 *     alcanza a quien le reporta; un activo se alcanza a sí mismo; un
 *     retirado, a nadie. Y mi_cartera corta al que no está activo.
 * La primera prueba comprueba que el SQL sigue diciendo eso: si cambia, esta
 * réplica tiene que cambiar con él.
 * ------------------------------------------------------------------------ */
function nubeEquipo() {
  const dig = s => String(s == null ? '' : s).replace(/\D/g, '');
  const S = { equipo: {}, asignaciones: {}, cartera: {}, publicaciones: [], orden: [], traerFalla: false };
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
      (a.p_gente || []).forEach(it => { if (it.id) S.cartera[it.id] = it; });
      return Promise.resolve({ ok: true, equipo: (a.p_equipo || []).length });
    }
    return Promise.resolve(null);
  };
  S.miAlcance = cel => {
    const yo = S.equipo[cel];
    if (yo && yo.estado === 'activo' && yo.rol === 'gerente') {
      return Object.values(S.equipo).filter(e => e.celular === cel || e.jefe === cel).map(e => e.celular).sort();
    }
    if (yo && yo.estado === 'activo') return [cel];
    return [];
  };
  /* «Mi base»: lo asignado a alguien de su alcance; nada si no está activo. */
  S.base = cel => {
    const yo = S.equipo[cel];
    if (!yo || yo.estado !== 'activo') return [];
    const mios = S.miAlcance(cel);
    return Object.values(S.asignaciones).filter(a => mios.includes(a.asesor)).map(a => a.persona_id).sort();
  };
  return S;
}

/* Los relojes de la página, para disparar el reintento a mano. */
function relojes(P) {
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

/* El CRM de Joan con su equipo y la nube de arriba. El jefe de Pedro se
   guarda como ID, que es como lo deja traerEquipo (jefeLocal). */
function abrirConNube(o) {
  o = o || {};
  const P = abrirPanel(o.panel);
  P.cargarCartera({
    socios: [{ id: 's1', nombre: 'Ana Torres', telefono: '3001112233', whatsappIgual: true }],
    prestamos: [],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' }],
    equipo: o.equipo || [
      { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
      { id: 'g2', nombre: 'OTRO GERENTE', rol: 'gerente', estado: 'activo', celular: OTRO },
      { id: 'a1', nombre: 'PEDRO ASESOR', rol: 'asesor', estado: 'activo', celular: PEDRO, jefe: 'g1' }],
    asignaciones: o.asignaciones || [
      { id: 'A1', socio_id: 'p1', asesor_id: 'a1', desde: HOY },
      { id: 'A2', socio_id: 's1', asesor_id: 'g1', desde: HOY }],
    gestiones: [], config: { negocio: 'Tu Garantía' }
  });
  /* Como al entrar con el PIN: esta pestaña reconoce la cartera del disco como
     suya. Sin esto la vuelta de 15 min se para en «otra pestaña la cambió». */
  P.ev('_selloDesdeDisco(false)');
  const t = o.relojes ? relojes(P) : null;
  const nube = nubeEquipo();
  P.ctx._nube = nube;
  P.ev(`
    var _cuadros = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    window.NubeCRM = { estado: function () { return { fase: 'lista' }; } };
    rpc = function (fn, args) { return _nube.rpc(fn, args); };
  `);
  return { P, nube, t };
}
/* Lo que Joan deja escrito en el cuadro de editar/crear antes de Guardar. */
function formulario(P, f) {
  P.ctx._f = Object.assign({ nombre: '', tel: '', rol: 'asesor', jefe: '', estado: '' }, f);
  P.ev("document.getElementById('eqNombre').value=_f.nombre; document.getElementById('eqTel').value=_f.tel;" +
       "document.getElementById('eqRol').value=_f.rol; document.getElementById('eqJefe').value=_f.jefe;" +
       "document.getElementById('eqEstado').value=_f.estado;");
}
async function vueltaDeLaManana(P, nube) {
  const r = await P.ev('publicarEquipoSolo()');
  await ticks();
  assert.equal(r, 'publicado', 'la vuelta de 15 min de la mañana no publicó');
  assert.equal(nube.publicaciones.length, 1);
}

/* ======================================================================== */
describe('S1 · lo que Joan cambia del equipo llega a la nube en ese momento', () => {

  /* La réplica de la nube sigue al SQL de verdad. Va dentro de la prueba de
     RETIRAR y no aparte: sola pasaría también contra c0dda51, y cada prueba
     de este archivo tiene que fallar contra lo que se está arreglando. */
  function replicaFiel() {
    const asesor = fs.readFileSync(path.join(RAIZ, 'base', '20260919_asesor.sql'), 'utf8');
    assert.match(asesor, /nullif\(right\(public\.solo_digitos\(coalesce\(it->>'jefe', ''\)\), 10\), ''\)/,
      'equipo_publicar ya no recorta el jefe a diez dígitos: la réplica de esta prueba quedó vieja');
    assert.match(asesor, /estado = excluded\.estado, jefe = excluded\.jefe/);
    const traer = fs.readFileSync(path.join(RAIZ, 'base', '20260911_gerente_y_whatsapp.sql'), 'utf8');
    assert.match(traer, /'estado', estado,\s*'jefe', jefe/, 'equipo_traer dejó de devolver estado y jefe');
    const alcance = fs.readFileSync(path.join(RAIZ, 'base', '20260922p_el_gerente_gestiona.sql'), 'utf8');
    assert.match(alcance, /where celular = p_celular and estado = 'activo'\) = 'gerente'/);
    assert.match(alcance, /where celular = p_celular or jefe = p_celular\), array\[\]::text\[\]\)/);
    assert.match(alcance, /when exists \(select 1 from public\.equipo\s+where celular = p_celular and estado = 'activo'\)\s+then array\[p_celular\]/);
  }

  test('RETIRAR a alguien publica ya, aunque hoy ya se publicó: el retirado deja de ver su base al instante', async () => {
    replicaFiel();
    const { P, nube } = abrirConNube();
    await vueltaDeLaManana(P, nube);
    assert.deepEqual(nube.base(PEDRO), ['p1'], 'precondición: Pedro ve su base');
    /* Joan despide a Pedro: Editar → Estado «Retirado» → Guardar. */
    nube.orden.length = 0;
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: WILLIAN, estado: 'retirado' });
    const r = await P.ev("guardarPersona('a1')");
    await ticks();
    assert.equal(r, 'publicado', 'retirar a Pedro no se publicó (' + r + ')');
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'en la nube Pedro sigue activo');
    assert.deepEqual(nube.miAlcance(PEDRO), [], 'mi_alcance del retirado no quedó vacío');
    assert.deepEqual(nube.base(PEDRO), [], 'el retirado sigue viendo la base de sus clientes');
    /* La regla de dc57aab sigue: se trajo ANTES de publicar… */
    assert.ok(nube.orden.indexOf('equipo_traer') >= 0 && nube.orden.indexOf('equipo_traer') < nube.orden.indexOf('equipo_publicar'),
      'publicó sin traer antes: ' + nube.orden.join(','));
    /* …y traer (que devolvía a Pedro «activo») no deshizo el retiro de Joan. */
    assert.equal(P.ev("personaDeEquipo('a1').estado"), 'retirado', 'traer le devolvió el «activo» a Pedro en este computador');
    /* El gerente sí sigue alcanzando la cartera del que se fue: es quien la reparte. */
    assert.ok(nube.miAlcance(WILLIAN).includes(PEDRO), 'Willian dejó de alcanzar a Pedro');
    assert.deepEqual(nube.base(WILLIAN), ['p1', 's1']);
    assert.equal(P.ev('_cuadros.length'), 0, 'saltó un cuadro: ' + P.ev('_cuadros.join(" | ")'));
  });

  test('cuando la nube lo aceptó, vuelve a mandar ella: lo que el gerente hace después sí baja', async () => {
    const { P, nube } = abrirConNube();
    await vueltaDeLaManana(P, nube);
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: WILLIAN, estado: 'retirado' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.deepEqual(Object.keys(P.ev('leerEquipoPorPublicar()')), [], 'la marca de Joan no se soltó al publicar');
    /* Willian lo reactiva desde su celular (asesor_reactivar). */
    nube.equipo[PEDRO].estado = 'activo';
    await P.ev('traerEquipo(true)');
    assert.equal(P.ev("personaDeEquipo('a1').estado"), 'activo', 'la marca se quedó pegada: lo que hace el gerente ya no baja');
  });

  test('si no pudo traer, NO publica encima; la marca espera, y el reintento manda el retiro aunque la nube diga «activo»', async () => {
    const { P, nube, t } = abrirConNube({ relojes: true });
    await vueltaDeLaManana(P, nube);
    nube.traerFalla = true;
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: WILLIAN, estado: 'retirado' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'fallo');
    await ticks();
    assert.equal(nube.publicaciones.length, 1, 'publicó sin traer: le pisaría al gerente lo que hizo');
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /class="alerta mal"/, 'el fallo no salió en rojo en la línea de Equipo');
    assert.ok(t.hay(60000), 'no quedó el reintento');
    nube.traerFalla = false;
    t.disparar(60000); await ticks();
    assert.equal(nube.publicaciones.length, 2, 'el reintento no publicó');
    assert.equal(nube.equipo[PEDRO].estado, 'retirado', 'el reintento trajo «activo» y lo volvió a mandar');
    assert.deepEqual(nube.base(PEDRO), []);
  });

  test('CAMBIARLE EL JEFE publica ya, como celular: el gerente nuevo lo alcanza y el viejo deja de verlo', async () => {
    const { P, nube } = abrirConNube();
    await vueltaDeLaManana(P, nube);
    /* El jefe de Pedro vivía acá como id ('g1'): tiene que llegar como el celular de Willian. */
    assert.equal(nube.equipo[PEDRO].jefe, WILLIAN, 'el jefe viajó como id y el servidor lo recortó a «' + nube.equipo[PEDRO].jefe + '»');
    assert.deepEqual(nube.base(WILLIAN), ['p1', 's1'], 'Willian no ve la base de su asesor');
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: OTRO, estado: 'activo' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado', 'cambiar el jefe no se publicó');
    await ticks();
    assert.equal(nube.equipo[PEDRO].jefe, OTRO);
    assert.ok(nube.miAlcance(OTRO).includes(PEDRO), 'el gerente nuevo no alcanza a Pedro');
    assert.ok(!nube.miAlcance(WILLIAN).includes(PEDRO), 'el gerente viejo sigue alcanzando a Pedro');
    assert.deepEqual(nube.base(WILLIAN), ['s1'], 'Willian sigue viendo los clientes de Pedro');
    assert.deepEqual(nube.base(OTRO), ['p1']);
  });

  test('corregirle el nombre a un asesor no le quita el jefe: el cuadro lo trae marcado aunque acá viva como id', async () => {
    const { P, nube } = abrirConNube();
    await vueltaDeLaManana(P, nube);
    P.ev("editarPersona('a1')");
    const html = P.elems.mBody.innerHTML;
    const marcado = (html.match(/<option value="(\d*)" selected>/) || [])[1];
    assert.equal(marcado, WILLIAN, '«Reporta a» salió sin Willian marcado: guardar le quitaría el jefe');
    /* Joan solo corrige el nombre y guarda lo que el cuadro le muestra. */
    formulario(P, { nombre: 'PEDRO PÉREZ', tel: PEDRO, rol: 'asesor', jefe: marcado, estado: 'activo' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'publicado');
    await ticks();
    assert.equal(nube.equipo[PEDRO].nombre, 'PEDRO PÉREZ', 'el nombre nuevo no llegó');
    assert.equal(nube.equipo[PEDRO].jefe, WILLIAN, 'corregir el nombre le quitó el jefe a Pedro');
    assert.deepEqual(nube.base(WILLIAN), ['p1', 's1']);
  });

  test('CREAR a alguien sin clientes le da su puesto en ese momento, aunque hoy ya se publicó', async () => {
    const { P, nube } = abrirConNube();
    await vueltaDeLaManana(P, nube);
    formulario(P, { nombre: 'LUISA NUEVA', tel: LUISA, rol: 'asesor', jefe: WILLIAN, estado: '' });
    assert.equal(await P.ev('guardarPersona(null)'), 'publicado', 'crear a Luisa no se publicó');
    await ticks();
    assert.ok(nube.equipo[LUISA], 'Luisa no tiene puesto en la nube: no puede ni entrar');
    assert.equal(nube.equipo[LUISA].estado, 'activo');
    assert.equal(nube.equipo[LUISA].jefe, WILLIAN);
    assert.deepEqual(nube.miAlcance(LUISA), [LUISA]);
    assert.ok(nube.miAlcance(WILLIAN).includes(LUISA));
  });

  test('…y aunque nadie del equipo tenga NADA repartido todavía (la vuelta de 15 min también la publica)', async () => {
    const { P, nube } = abrirConNube({
      equipo: [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN }],
      asignaciones: [] });
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado', 'sin asignaciones la vuelta de 15 min no publica el equipo');
    await ticks();
    assert.ok(nube.equipo[WILLIAN], 'Willian no tiene puesto');
    formulario(P, { nombre: 'LUISA NUEVA', tel: LUISA, rol: 'asesor', jefe: WILLIAN, estado: '' });
    const r = await P.ev('guardarPersona(null)');
    await ticks();
    assert.equal(r, 'publicado', 'sin asignaciones, crear a Luisa dio «' + r + '»');
    assert.ok(nube.equipo[LUISA], 'Luisa no llegó a la nube');
    assert.doesNotMatch(String(P.ev("fraseTrasPublicar('publicado')")), /nadie del equipo tiene celular/);
  });

  test('la huella de la vuelta de 15 min mira también la lista del equipo', async () => {
    const { P, nube } = abrirConNube();
    await vueltaDeLaManana(P, nube);
    /* Un cambio que no pasó por guardarPersona (un respaldo, otra pestaña):
       sin asignaciones ni gente nuevas, igual es otra lista del equipo. */
    P.ev("personaDeEquipo('a1').nombre = 'PEDRO PÉREZ'; guardar();");
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado', 'la vuelta de 15 min se quedó en «sin cambios»');
    await ticks();
    assert.equal(nube.equipo[PEDRO].nombre, 'PEDRO PÉREZ');
    assert.equal(await P.ev('publicarEquipoSolo()'), 'sin_cambios', 'el atajo del mismo día dejó de existir para la vuelta');
  });
});

/* ======================================================================== */
/* El caso de la verificación: Joan borra P0 el 1-oct, exporta el respaldo el
   2, restaura P0 el 5 y le registra abonos desde el computador; el 22 importa
   el respaldo del 2. La nube tiene P0 VIVO con el abono, escrito por un
   computador; la cartera tiene P0 en la papelera y en nubeBorrados. */
function respaldoViejo() {
  const alm = B.almacenDoble();
  const srv = B.servidor();
  const viva = (datos, rev, cuando) => ({ datos: B.comoJsonb(N.sinFotos(datos)), revision: rev, borrado: false,
    actualizado_por: 'computador', actualizado_en: cuando });
  srv.socios.C0 = viva(B.socio(0), 1, '2026-10-01T10:00:00Z');
  srv.socios.C1 = viva(B.socio(1), 1, '2026-10-01T10:00:00Z');
  srv.creditos.P0 = viva(B.credito(0, 0, { abonos: [{ fecha: '2026-10-10', monto: 50000 }] }), 3, '2026-10-12T10:00:00Z');
  const db = B.cartera(2, 0);
  delete db.gestiones; delete db.asignaciones; delete db.actosComision;
  /* Una ficha que solo está en el respaldo: «lo demás» se tiene que emparejar igual. */
  db.socios.push(B.socio(9));
  db.papelera = [Object.assign(B.credito(0, 0), { borradoEn: '2026-10-01' })];
  db.nubeBorrados = [{ tabla: 'creditos', id: 'P0', cuando: '2026-10-01' }];
  const m = B.montar({ alm, srv, db });
  /* importar() suelta el espejo; el computador ya había emparejado antes. */
  alm.removeItem(B.ESPEJO);
  alm.setItem(B.ESTADO, JSON.stringify({ v: 1, congeladas: {}, borradosConfirmados: {}, contadoresConocidos: {},
    emparejadoEn: '2026-10-01T09:00:00Z' }));
  return m;
}
const borradosMandados = srv => srv.lotes.flatMap(l => (l.creditos || []).filter(f => f.borrado).map(f => f.id));

describe('S2 · emparejar sola nunca borra nada en la nube', () => {

  test('el crédito restaurado después del respaldo NO se borra allá: queda en discusión, y lo demás se empareja', async () => {
    const m = respaldoViejo();
    await m.C.vuelta(false);
    await ticks();
    assert.deepEqual(borradosMandados(m.srv), [], 'la siembra sola mandó un borrado que nadie confirmó');
    assert.equal(m.srv.creditos.P0.borrado, false, 'P0 quedó borrado en la nube');
    assert.deepEqual(m.srv.creditos.P0.datos.abonos, [{ fecha: '2026-10-10', monto: 50000 }], 'se perdieron los abonos de P0');
    assert.equal((B.congeladas(m.alm)['creditos|P0'] || {}).motivo, 'borrada-aca', 'P0 no quedó en discusión');
    assert.equal(m.vent.modal, null, 'un cuadro que salta solo se cierra sin leer');
    /* Lo demás sí: el socio que solo estaba en el respaldo subió. */
    assert.ok(m.srv.socios.C9, 'lo que no estaba en discusión no se emparejó');
    const e = B.estadoDisco(m.alm).ultimoEmparejo;
    assert.equal(e.como, 'solo');
    assert.equal(e.seBorranAlla, 0);
    assert.equal(e.borradasSinSi, 1);
    const c = m.C.estado().cinta;
    assert.equal(c.fase, 'congeladas', 'la cinta no dice que hay algo por decidir');
    assert.equal(c.clase, 'mal');
    assert.doesNotMatch(m.barra.innerHTML, /borrada acá que se borra allá/);
    assert.match(m.barra.innerHTML, /NO borré allá sin tu sí/, 'la barra no dice por qué P0 está en discusión');
    assert.match(m.barra.innerHTML, /nada se borra allá sin tu sí/);

    /* El «sí» de Joan, con los nombres delante, sigue borrando: es lo único que puede. */
    const j = respaldoViejo();
    await j.C.emparejar();
    assert.match(j.vent.modal.h, /Borradas acá y vivas en la nube · 1/);
    await j.C.confirmarEmparejar();
    await ticks();
    assert.equal(j.srv.creditos.P0.borrado, true, 'con el sí de Joan dejó de borrar');
  });

  test('el clic de Joan en «Emparejando…» tampoco es un sí: no ve nombres, así que no borra', async () => {
    const m = respaldoViejo();
    await m.C.accion();
    await ticks();
    assert.deepEqual(borradosMandados(m.srv), [], 'el clic en la cinta borró P0 sin enseñarle el nombre a Joan');
    assert.equal(m.srv.creditos.P0.borrado, false);
    assert.equal((B.congeladas(m.alm)['creditos|P0'] || {}).motivo, 'borrada-aca');
  });
});

/* ======================================================================== */
describe('S3 · sin app/etapas.js la línea y la pestaña Equipo lo dicen en rojo', () => {
  const hace = min => new Date(Date.now() - min * 60000).toISOString();
  function conPiezasBien(o) {
    const r = abrirConNube({ panel: o && o.sinEtapas ? { sinEtapas: true } : undefined });
    r.P.ctx._c = { cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tu cartera GUARDADA está en la nube', l2: '' }, ultimaSubida: hace(2) };
    r.P.ctx._h = { cinta: { fase: 'al-dia', clase: 'calma', l1: 'Tus clientes ven lo de hace 3 min', l2: '' }, ultimaSubida: hace(3) };
    r.P.ev(`
      window.NubeCRM = { estado: function () { return Object.assign({ fase: 'lista' }, _c); }, accion: function () {} };
      window.HistorialesAuto = { estado: function () { return _h; }, accion: function () {} };
    `);
    return r;
  }

  test('la línea común sale en ROJO, de la pieza del equipo y con qué hacer, aunque nunca se haya intentado publicar', async () => {
    /* El control: el MISMO montaje con el archivo cargado (y la vuelta de la
       mañana hecha) está en calma, así que el rojo de abajo es por
       app/etapas.js y no por el banco. */
    const control = conPiezasBien().P;
    await control.ev('publicarEquipoSolo()'); await ticks();
    const bien = control.ev('pintarNubeTodo()');
    assert.equal(bien.clase, 'calma', bien.l1 + ' · ' + bien.l2);
    assert.match(bien.l1, /Todo sube solo/);
    assert.doesNotMatch(control.elems.equipoPublicadoSolo.innerHTML, /alerta mal/);

    const { P } = conPiezasBien({ sinEtapas: true });
    const r = P.ev('pintarNubeTodo()');
    assert.equal(r.clase, 'mal', 'dijo «' + r.l1 + '» sin poder publicar al equipo');
    assert.equal(r.quien, 'equipo');
    assert.match(r.l1, /no cargó app\/etapas\.js/);
    assert.match(r.l2, /Ctrl\+Shift\+R/);
    assert.doesNotMatch(r.l1 + r.l2, /Todo sube solo/);
    assert.equal(P.elems.nubeTodoCinta.className, 'nube-todo mal');
  });

  test('la vuelta de 15 min y un reparto no publican, y la pestaña Equipo lo dice en rojo (no «Última: …» en calma)', async () => {
    const { P, nube } = conPiezasBien({ sinEtapas: true });
    /* Lo último bueno fue hace tres días, antes de que el archivo dejara de llegar. */
    P.ev("anotarPublicadoSolo({ ok: true, huella: 'x', dia: '2026-10-19', cuando: new Date(Date.now() - 3 * 86400000).toISOString() });");
    assert.equal(await P.ev('publicarEquipoSolo()'), 'no_se_pudo_armar');
    assert.equal(await P.ev('publicarEquipoSolo({ porCambio: true })'), 'no_se_pudo_armar');
    assert.equal(nube.publicaciones.length, 0);
    const linea = P.elems.equipoPublicadoSolo.innerHTML;
    assert.match(linea, /class="alerta mal"/, 'la línea de Equipo siguió en calma');
    assert.match(linea, /app\/etapas\.js/);
    assert.match(linea, /Ctrl\+Shift\+R/);
    assert.doesNotMatch(linea, /se publica sola/);
    const r = P.ev('pintarNubeTodo()');
    assert.equal(r.clase, 'mal');
    assert.match(r.l2, /lo publicado el \d+-[a-z]{3}/, 'no dice desde cuándo ve tu equipo lo mismo');
    /* Editar a alguien tampoco calla: la línea de Equipo, que es la que guardarPersona promete. */
    P.elems.equipoPublicadoSolo.innerHTML = '';
    formulario(P, { nombre: 'PEDRO ASESOR', tel: PEDRO, rol: 'asesor', jefe: WILLIAN, estado: 'retirado' });
    assert.equal(await P.ev("guardarPersona('a1')"), 'no_se_pudo_armar');
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /class="alerta mal"/, 'retirar a alguien falló callado');
  });
});
