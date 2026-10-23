'use strict';
/* ============================================================================
 * «👤 ASIGNAR A…» DESDE CADA FICHA, Y «＋ AGREGAR PROSPECTO» — 23-oct-2026
 *
 *   node --test pruebas/asignar-desde-la-ficha.test.js
 *
 * Joan: «William tiene asignada una base, quiero que yo esté en esa base como
 * cliente y que me gestione a mí como si yo fuera un cliente, Joan Ruiz
 * 3103606348». Y después: «no aparece ninguna opción para agregar prospectos
 * nuevos y me agregué como cliente pero no hay forma de asignarle esta cuenta
 * a alguien de mi equipo, por ejemplo William».
 *
 * La forma existía (Equipo → «🔀 Repartir» → «Los que yo marque»), pero no
 * donde Joan la buscó. Lo que vigila este archivo, con el CRM corriendo en el
 * banco (pruebas/banco-panel.js) y una nube de mentiras que anota lo que se
 * publica:
 *   1. la ficha, cada fila de Clientes y de Bases y el cuadro de editar tienen
 *      «👤 Asignar a…», con los mismos gerentes y asesores que Repartir, y
 *      dicen a quién está asignado hoy;
 *   2. asignar publica al equipo en ese momento, trayendo antes, y el aviso
 *      dice lo que pasó (sin nube, lo dice: nunca «ya lo ven»);
 *   3. la lista solo suma, pero a la nube viaja UNA fila por persona y por
 *      día (reasignar el mismo día tumbaba la publicación entera: ver
 *      asignar-desde-la-ficha-postgres.test.js), y «Quitarle la asignación»
 *      también viaja;
 *   4. «＋ Agregar prospecto» con las reglas de una base: celular válido, sin
 *      duplicar, de dónde sale y si autorizó, y «Se lo asigno a» en el mismo
 *      paso;
 *   5. la pestaña Equipo lo dice, y cuenta los que cada uno lleva HOY.
 * Cada prueba falla contra f05f485 (crm-asignar antes de este cambio).
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const WILLIAN = '3000000000', LEIDY = '3000000002';

/* El CRM de Joan: él mismo como cliente (sin crédito), una prospecta de una
   base, y su equipo — WILLIAN gerente, LEIDY asesora de Willian, IDO retirado. */
function abrir(o) {
  o = o || {};
  const P = abrirPanel(o.banco || {});
  P.cargarCartera(Object.assign({
    socios: [{ id: 'C1', numero: 1, nombre: 'Joan Ruiz', telefono: '3103606348', whatsappIgual: true }],
    prestamos: [],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo', base: 'septiembre.xlsx' }],
    equipo: [
      { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
      { id: 'a1', nombre: 'LEIDY', rol: 'asesor', estado: 'activo', celular: LEIDY, jefe: 'g1' },
      { id: 'a9', nombre: 'IDO', rol: 'asesor', estado: 'retirado', celular: '3000000009' }],
    asignaciones: [], gestiones: [], config: { negocio: 'Tu Garantía' }
  }, o.db || {}));
  P.ctx._sinNube = !!o.sinNube;
  P.ctx._traer = o.traer || {};
  P.ev(`
    var _enviados = [], _cuadros = [], _orden = [];
    sbListo = function () { return !_sinNube; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    window.NubeCRM = { estado: function () { return { fase: 'lista' }; },
      libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) {
      _orden.push(fn);
      if (fn === 'equipo_traer') return Promise.resolve(JSON.parse(JSON.stringify(_traer)));
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') { _enviados.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
  `);
  return P;
}
const cuadros = P => P.ev('_cuadros.slice()');
const ultimo = P => { const c = cuadros(P); return c[c.length - 1] || ''; };
/* Lo que sale del contexto de la página se clona: los arreglos de allá no son
   «iguales» a los de acá para deepStrictEqual, aunque digan lo mismo. */
const aca = v => JSON.parse(JSON.stringify(v));
const enviados = P => aca(P.ev('_enviados.slice()'));
const de = (P, id) => P.ev("COMIS.asesorDe(asignaciones(),'" + id + "','" + HOY + "')");
const cuerpo = P => P.elems.mBody.innerHTML || '';
/* Lo que hace Joan: abrir el cuadro, elegir y tocar «Asignar» (o «Quitarle»). */
async function asignar(P, tipo, id, aQuien, volver) {
  P.ev("asignarUno('" + tipo + "','" + id + "'" + (volver ? ",'" + volver + "'" : '') + ')');
  P.ev("document.getElementById('auDestino').value='" + aQuien + "'");
  const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','" + (volver || '') + "')");
  await ticks();
  return r;
}
async function quitar(P, tipo, id) {
  P.ev("asignarUno('" + tipo + "','" + id + "')");
  const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','',true)");
  await ticks();
  return r;
}
/* Las filas de asignación de esa persona que viajaron en una publicación. */
const filasDe = (pub, id) => (pub.p_asignaciones || []).filter(a => a.persona_id === id);

/* ======================================================================== */
describe('1 · «👤 Asignar a…» donde Joan lo busca, diciendo a quién está asignado hoy', () => {

  test('la ficha del cliente dice quién lo atiende y tiene el botón', () => {
    const P = abrir();
    P.ev("verCliente('C1')");
    let h = cuerpo(P);
    assert.match(h, /Quién de tu equipo lo atiende/, 'la ficha no dice quién lo atiende');
    assert.match(h, /Nadie de tu equipo: hoy solo lo ves tú/);
    assert.match(h, /onclick="asignarUno\('cliente','C1','ficha'\)"[^>]*>👤 Asignar a…<\/button>/, 'la ficha no tiene «👤 Asignar a…»');
    P.ev("asignaciones().push({ id: 'A0', socio_id: 'C1', asesor_id: 'g1', desde: '" + HOY + "' })");
    P.ev("verCliente('C1')");
    h = cuerpo(P);
    assert.match(h, /🧭 <b>WILLIAN<\/b> \(Gerente\)/, 'la ficha no dice que hoy lo atiende Willian');
  });

  test('cada fila de Clientes y de Bases tiene su «👤 Asignar a…», y la de Clientes dice quién lo atiende', () => {
    const P = abrir({ db: { asignaciones: [{ id: 'A0', socio_id: 'C1', asesor_id: 'g1', desde: HOY }] } });
    P.ev('renderClientes()');
    const cli = P.elems.tblClientes.innerHTML;
    assert.match(cli, /asignarUno\('cliente','C1'\)/, 'la fila del cliente no tiene «👤 Asignar a…»');
    assert.match(cli, /👤 Lo atiende WILLIAN/, 'la fila del cliente no dice quién lo atiende');
    P.ev('renderBases()');
    const pro = P.elems.tblProspectos.innerHTML;
    assert.match(pro, /asignarUno\('prospecto','p1'\)/, 'la fila del prospecto no tiene «👤 Asignar a…»');
  });

  test('el cuadro ofrece los mismos que Repartir —gerentes y asesores activos— y dice quién lo tiene hoy', () => {
    const P = abrir();
    P.ev("asignarUno('cliente','C1')");
    let h = cuerpo(P);
    const sel = (h.match(/<select id="auDestino">([\s\S]*?)<\/select>/) || [])[1];
    assert.ok(sel, 'el cuadro no tiene el desplegable «Se lo asigno a»');
    assert.match(sel, /optgroup label="🧭 Gerentes"[\s\S]*WILLIAN/);
    assert.match(sel, /optgroup label="🚶 Asesores"[\s\S]*LEIDY/);
    assert.doesNotMatch(sel, /IDO/, 'ofrece a un retirado');
    assert.doesNotMatch(h, /Quitarle la asignación/, 'ofrece quitar una asignación que no hay');
    assert.match(h, /Hoy lo atiende[\s\S]*Nadie de tu equipo/);
    /* 23-oct-2026 — decía «Nunca la cédula, la dirección ni las fotos», y no es
       verdad: su «🪪 Ver su ficha» las muestra (asignar-desde-la-ficha-cierres). */
    assert.match(h, /en «🪪 Ver su ficha» ve también lo que dejó al registrarse: su cédula, su dirección, sus cuentas y sus fotos/,
      'no dice lo que ve quien lo recibe antes de mandarlo');
    /* Las mismas opciones que «Se los asigno a» de Repartir. */
    P.ev("pantallaAsignar('clientes')");
    const rep = (P.elems.asDestinoCaja.innerHTML.match(/<select id="asDestino">([\s\S]*?)<\/select>/) || [])[1];
    assert.equal(sel, rep, 'el cuadro de la ficha y Repartir ofrecen listas distintas');

    P.ev("asignaciones().push({ id: 'A0', socio_id: 'C1', asesor_id: 'a1', desde: '" + HOY + "' })");
    P.ev("asignarUno('cliente','C1')");
    h = cuerpo(P);
    assert.match(h, /Hoy lo atiende[\s\S]*LEIDY/);
    assert.match(h, /<option value="a1" selected>LEIDY/, 'no viene marcada quien lo tiene hoy');
    assert.match(h, />Quitarle la asignación</, 'con dueño, no ofrece quitarle la asignación');
    assert.match(h, /cambia de dueño de hoy en adelante/);
  });
});

/* ======================================================================== */
describe('2 · asignar publica al equipo en ese momento, y lo dice sin mentir', () => {

  test('Joan se asigna a Willian desde su ficha: se publica trayendo antes, viaja sin crédito, y la ficha vuelve con Willian', async () => {
    const P = abrir();
    const r = await asignar(P, 'cliente', 'C1', 'g1', 'ficha');
    assert.equal(r, 'publicado', 'no se publicó: ' + r);
    assert.equal(de(P, 'C1'), 'g1');
    const orden = P.ev('_orden.slice()');
    assert.ok(orden.indexOf('equipo_traer') >= 0 && orden.indexOf('equipo_traer') < orden.indexOf('equipo_publicar'),
      'publicó sin traer antes lo que hizo el gerente: ' + orden.join(','));
    const pub = enviados(P);
    assert.equal(pub.length, 1);
    assert.deepEqual(filasDe(pub[0], 'C1').map(a => [a.asesor, a.desde]), [[WILLIAN, HOY]]);
    const yo = (pub[0].p_gente || []).find(x => x.id === 'C1');
    assert.ok(yo, 'el cliente asignado no viajó: Willian no lo vería en «Mi base»');
    assert.equal(yo.tipo, 'cliente');
    assert.equal(yo.nombre, 'Joan Ruiz');
    assert.equal(yo.celular, '3103606348');
    assert.equal(yo.etapa, 'CR', 'sin crédito es «Cliente registrado»');
    assert.equal(yo.saldo, '', 'sin crédito no viaja una cifra');
    assert.match(ultimo(P), /Joan Ruiz queda con WILLIAN/);
    assert.match(ultimo(P), /Ya se lo publiqué a tu equipo/);
    assert.match(P.elems.mTitle.textContent, /Joan Ruiz/, 'no volvió a la ficha de donde vino');
    assert.match(cuerpo(P), /🧭 <b>WILLIAN<\/b>/, 'la ficha no muestra el cambio');
  });

  test('sin la nube conectada, el cuadro lo avisa antes y el final no dice «ya lo ven»', async () => {
    const P = abrir({ sinNube: true });
    P.ev("asignarUno('cliente','C1')");
    assert.match(cuerpo(P), /class="alerta warn"[^>]*>Tu equipo todavía no lo ve: falta conectar la nube/, 'el cuadro no avisa antes');
    await asignar(P, 'cliente', 'C1', 'g1');
    assert.equal(de(P, 'C1'), 'g1', 'la asignación se anota igual en este computador');
    assert.equal(enviados(P).length, 0);
    assert.match(ultimo(P), /falta conectar la nube/);
    assert.doesNotMatch(cuadros(P).join(' '), /Ya se lo publiqué/, 'dijo que ya lo ven sin nube');
  });

  test('si no puede traer lo del equipo, no publica encima y lo dice en rojo', async () => {
    const P = abrir();
    P.ev("rpc = function (fn, args) { _orden.push(fn); if (fn === 'equipo_publicar') { _enviados.push(args); return Promise.resolve({ ok: true }); } return Promise.reject({ motivo: 'sin señal' }); }");
    await asignar(P, 'cliente', 'C1', 'g1');
    assert.equal(enviados(P).length, 0, 'publicó sin haber traído');
    assert.match(ultimo(P), /NO lo pude publicar a tu equipo/);
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /class="alerta mal"/);
  });

  test('a quien no tiene celular se le puede asignar, pero se dice que no puede entrar a verlo', async () => {
    const P = abrir({ db: { equipo: [
      { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
      { id: 'x1', nombre: 'SIN CEL', rol: 'asesor', estado: 'activo', celular: '' }] } });
    await asignar(P, 'cliente', 'C1', 'x1');
    assert.match(ultimo(P), /SIN CEL no tiene celular, y el celular es su usuario/);
  });
});

/* ======================================================================== */
describe('3 · la lista solo suma, a la nube viaja una fila por día, y «nadie» también viaja', () => {

  test('asignar, cambiar y quitarle la asignación el mismo día: tres filas aquí, UNA de hoy en cada publicación', async () => {
    const P = abrir();
    await asignar(P, 'cliente', 'C1', 'g1');
    await asignar(P, 'cliente', 'C1', 'a1');
    assert.equal(de(P, 'C1'), 'a1');
    await quitar(P, 'cliente', 'C1');
    assert.equal(de(P, 'C1'), '', 'quitarle la asignación no la quitó');
    assert.equal(P.ev("asignaciones().filter(a => a.socio_id === 'C1').length"), 3,
      'la lista dejó de sumar: cambiar una fila en su sitio la duplicaría al viajar entre aparatos (nube.js)');
    const pubs = enviados(P);
    assert.equal(pubs.length, 3);
    const hoyDe = pubs.map(p => filasDe(p, 'C1').filter(a => a.desde === HOY));
    hoyDe.forEach((f, i) => assert.equal(f.length, 1, 'la publicación ' + (i + 1) + ' mandó ' + f.length +
      ' filas de hoy para la misma persona: en la nube es UNA por día y la segunda tumba la publicación entera (23505)'));
    assert.deepEqual(hoyDe.map(f => f[0].asesor), [WILLIAN, LEIDY, ''], 'lo que viajó no es la última decisión de cada momento');
    assert.equal(new Set(hoyDe.map(f => f[0].id)).size, 1, 'el id de la fila de hoy cambió: la nube la tomaría como otra fila del mismo día');
    assert.match(ultimo(P), /Joan Ruiz ya no está asignado a nadie de tu equipo/);
  });

  test('lo que Repartir ya dejó (dos filas el mismo día) viaja como una: el id de la primera, el dueño de la última', () => {
    const P = abrir({ db: { asignaciones: [
      { id: 'A0', socio_id: 'C1', asesor_id: 'g1', desde: '2026-10-01' },
      { id: 'A1', socio_id: 'C1', asesor_id: 'g1', desde: HOY },
      { id: 'A2', socio_id: 'C1', asesor_id: 'a1', desde: HOY },
      { id: 'A3', socio_id: 'p1', asesor_id: 'a1', desde: HOY }] } });
    const asig = aca(P.ev('armarPublicacionEquipo().asig'));
    assert.deepEqual(asig.filter(a => a.persona_id === 'C1').map(a => [a.id, a.asesor, a.desde]),
      [['A0', WILLIAN, '2026-10-01'], ['A1', LEIDY, HOY]]);
    assert.deepEqual(asig.filter(a => a.persona_id === 'p1').map(a => a.id), ['A3']);
    assert.equal(de(P, 'C1'), 'a1', 'la regla de este computador y la de lo que viaja no dicen lo mismo');
  });

  test('una fila sin asesor que llega de la nube es de nadie: no se la da a quien no tiene celular', async () => {
    const P = abrir({
      db: { equipo: [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
                     { id: 'x1', nombre: 'SIN CEL', rol: 'asesor', estado: 'activo', celular: '' }] },
      traer: { equipo: [], contactos: [], asignaciones: [
        { id: 'N1', persona_id: 'p1', asesor: WILLIAN, desde: '2026-10-01' },
        { id: 'N2', persona_id: 'p1', asesor: '', desde: HOY }] }
    });
    await P.ev('traerEquipo(true)');
    assert.equal(P.ev("asignaciones().find(a => a.id === 'N2').asesor_id"), '', 'la fila sin asesor se la dio a alguien');
    assert.equal(de(P, 'p1'), '', 'quien la tenía la sigue teniendo en este computador');
  });
});

/* ======================================================================== */
describe('1 · el cuadro de editar y el de agregar cliente', () => {

  function formulario(P, f) {
    P.ctx._f = f;
    P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })");
  }

  test('muestra a quién está asignado, y guardar sin tocarlo no cambia nada (tampoco con un retirado)', async () => {
    const P = abrir({ db: { asignaciones: [{ id: 'A0', socio_id: 'C1', asesor_id: 'a9', desde: '2026-10-01' }] } });
    P.ev("editarCliente('C1')");
    const h = cuerpo(P);
    assert.match(h, /¿Quién de tu equipo lo atiende\?/, 'el cuadro de editar no tiene el campo');
    assert.match(h, /<option value="a9" selected>IDO \(retirado\)<\/option>/,
      'el retirado no sale marcado: el cuadro diría «Nadie» y guardar se lo quitaría');
    for (const valor of ['', 'a9']) {   // el banco no pinta selects ('') y un navegador manda el marcado ('a9')
      formulario(P, { fNombre: 'Joan Ruiz', fTel: '3103606348', fAsignarA: valor });
      P.ev("editarCliente('C1')");
      formulario(P, { fNombre: 'Joan Ruiz', fTel: '3103606348', fAsignarA: valor });
      await P.ev("guardarCliente('C1')");
      assert.equal(P.ev('asignaciones().length'), 1, 'guardar sin tocar el campo escribió una asignación (' + JSON.stringify(valor) + ')');
    }
    assert.equal(enviados(P).length, 0);
  });

  test('«— Nadie —» le quita la asignación, y otro nombre se la pasa; las dos se publican', async () => {
    const P = abrir({ db: { asignaciones: [{ id: 'A0', socio_id: 'C1', asesor_id: 'g1', desde: '2026-10-01' }] } });
    P.ev("editarCliente('C1')");
    formulario(P, { fNombre: 'Joan Ruiz', fTel: '3103606348', fAsignarA: 'nadie' });
    await P.ev("guardarCliente('C1')"); await ticks();
    assert.equal(de(P, 'C1'), '');
    assert.deepEqual(filasDe(enviados(P)[0], 'C1').map(a => a.asesor), [WILLIAN, ''], '«nadie» no viajó');
    P.ev("editarCliente('C1')");
    formulario(P, { fNombre: 'Joan Ruiz', fTel: '3103606348', fAsignarA: 'a1' });
    await P.ev("guardarCliente('C1')"); await ticks();
    assert.equal(de(P, 'C1'), 'a1');
    assert.equal(enviados(P).length, 2);
    assert.match(ultimo(P), /Joan Ruiz queda con LEIDY/);
  });

  test('«＋ Agregar cliente» con «Se lo asigno a» en el mismo paso: nace asignado y se publica', async () => {
    const P = abrir({ db: { socios: [] } });
    P.ev('editarCliente()');
    assert.match(cuerpo(P), /<option value="nadie" selected>— Nadie: lo atiendes tú —<\/option>/);
    formulario(P, { fNombre: 'Joan Ruiz', fTel: '3103606348', fAsignarA: 'g1' });
    await P.ev("guardarCliente('')"); await ticks();
    const id = P.ev('DB.socios[0].id');
    assert.equal(de(P, id), 'g1', 'el cliente nuevo no quedó con Willian');
    const yo = (enviados(P)[0].p_gente || []).find(x => x.id === id);
    assert.ok(yo && yo.tipo === 'cliente', 'el cliente nuevo no viajó a la base de Willian');
  });
});

/* ======================================================================== */
describe('4 · «＋ Agregar prospecto», uno suelto, con las reglas de una base', () => {

  function llenar(P, f) {
    P.ctx._f = Object.assign({ apNombre: 'PEDRO PÉREZ', apCel: '+57 311 555 0001', apOrigen: 'me lo recomendó Nancy',
      apAutoriza: 'no', apAsignarA: '' }, f);
    P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })");
  }

  test('el botón está en Bases, junto a Repartir y Cargar base, y el cuadro pide de dónde sale y si autorizó', () => {
    const bases = CRM.slice(CRM.indexOf('<section class="view" id="v-bases">'), CRM.indexOf('<section class="view" id="v-equipo">'));
    assert.match(bases, /onclick="agregarProspecto\(\)">＋ Agregar prospecto<\/button>/);
    assert.match(bases, /onclick="pantallaAsignar\('potenciales'\)">🔀 Repartir/);
    assert.match(bases, /onclick="cargarBase\(\)">⤒ Cargar base/);
    const P = abrir();
    P.ev('agregarProspecto()');
    const h = cuerpo(P);
    ['apNombre', 'apCel', 'apOrigen'].forEach(id => assert.match(h, new RegExp('id="' + id + '"')));
    assert.match(h, /<select id="apAutoriza"><option value="">— Elige una —<\/option>/, 'la autorización trae una respuesta por defecto');
    assert.match(h, /<select id="apAsignarA"><option value="">— Nadie por ahora —<\/option>[\s\S]*WILLIAN/);
  });

  test('no entra un celular que no es, ni quien ya es cliente o prospecto (y dice quién), ni sin origen, ni sin contestar la autorización', () => {
    const P = abrir();
    P.ev('agregarProspecto()');
    const casos = [
      [{ apCel: '12345' }, /no me cuadra/],
      [{ apCel: '310 360 6348' }, /ya es de un cliente tuyo: Joan Ruiz/],
      [{ apCel: '3001110001' }, /ya está en tus prospectos: Marta Q \(septiembre\.xlsx\)/],
      [{ apOrigen: '' }, /de dónde sale/],
      [{ apAutoriza: '' }, /autorizó que lo contactemos: sí o no/],
      [{ apNombre: '' }, /Falta el nombre/]
    ];
    casos.forEach(([f, re]) => {
      llenar(P, f);
      P.ev('guardarProspectoSuelto()');
      assert.match(ultimo(P), re);
      assert.equal(P.ev('prospectos().length'), 1, 'entró igual con ' + JSON.stringify(f));
    });
  });

  test('entra con el formato de las bases, su origen y su «no autorizó», asignado a Willian y publicado; sale arriba en Bases', async () => {
    const P = abrir();
    P.ev('agregarProspecto()');
    llenar(P, { apAsignarA: 'g1' });
    await P.ev('guardarProspectoSuelto()'); await ticks();
    const p = aca(P.ev('prospectos()[1]'));
    assert.equal(p.nombre, 'Pedro Pérez', 'el nombre no quedó como en las bases');
    assert.equal(p.celular, '3115550001', 'el celular no quedó como en las bases');
    assert.equal(p.estado, 'nuevo');
    assert.equal(p.base, 'A mano');
    assert.equal(p.origen, 'me lo recomendó Nancy');
    assert.equal(p.autorizaInvitacion, false);
    assert.equal(de(P, p.id), 'g1');
    const viajo = (enviados(P)[0].p_gente || []).find(x => x.id === p.id);
    assert.ok(viajo && viajo.tipo === 'prospecto', 'no le llegó a Willian');
    assert.match(ultimo(P), /Pedro Pérez entró a tus prospectos[\s\S]*no le llegan las invitaciones de Comercial[\s\S]*Pedro Pérez queda con WILLIAN[\s\S]*Ya se lo publiqué/);
    const r = P.ev('prospectosParaInvitar()');
    assert.ok(r.no.some(x => x.fila.id === p.id && /habeas data/.test(x.motivo)), 'sin autorización quedó para invitar');
    P.ev('renderBases()');
    const filas = P.elems.tblProspectos.innerHTML;
    assert.ok(filas.indexOf('Pedro Pérez') >= 0 && filas.indexOf('Pedro Pérez') < filas.indexOf('Marta Q'), 'el agregado a mano no sale arriba');
    assert.match(filas, /a mano · me lo recomendó Nancy/);
  });

  test('con «Sí» queda autorizado con la fecha, y sin asignar no publica nada', async () => {
    const P = abrir();
    P.ev('agregarProspecto()');
    llenar(P, { apAutoriza: 'si', apCel: '3115550002' });
    await P.ev('guardarProspectoSuelto()'); await ticks();
    const p = aca(P.ev('prospectos()[1]'));
    assert.equal(p.autorizaInvitacion, true);
    assert.equal(p.autorizaDesde, HOY);
    assert.ok(P.ev('prospectosParaInvitar()').puede.some(x => x.id === p.id), 'autorizado y no quedó para invitar');
    assert.equal(enviados(P).length, 0);
    assert.equal(de(P, p.id), '');
  });
});

/* ======================================================================== */
describe('5 · la pestaña Equipo lo dice, y cuenta los que cada uno lleva HOY', () => {

  test('una línea dice que también se asigna desde cada ficha, y «🔀 Repartir» sigue ahí', () => {
    const eq = CRM.slice(CRM.indexOf('<section class="view" id="v-equipo">'), CRM.indexOf('<section class="view" id="v-clientes">'));
    assert.match(eq, /onclick="pantallaAsignar\('clientes'\)">🔀 Repartir<\/button>/);
    assert.match(eq.replace(/<!--[\s\S]*?-->/g, ''), /id="equipoAsignarUno"[^>]*>[^<]*«👤 Asignar a…» en su ficha/);
  });

  test('a quien le quitan un cliente deja de contarlo', async () => {
    const P = abrir();
    await asignar(P, 'cliente', 'C1', 'g1');
    P.ev('renderEquipo()');
    const fila = () => (P.elems.tblEquipo.innerHTML.match(/<b>WILLIAN<\/b>[\s\S]*?<td class="num">(\d+)<\/td>/) || [])[1];
    assert.equal(fila(), '1');
    await quitar(P, 'cliente', 'C1');
    P.ev('renderEquipo()');
    assert.equal(fila(), '0', 'Willian sigue contando un cliente que ya no ve');
  });

  test('duenosDeHoy dice lo mismo que COMIS.asesorDe, persona por persona', () => {
    const P = abrir({ db: { asignaciones: [
      { id: '1', socio_id: 'x', asesor_id: 'g1', desde: '2026-09-01' },
      { id: '2', socio_id: 'x', asesor_id: 'a1', desde: '2026-09-01' },   // empate: gana la última
      { id: '3', socio_id: 'y', asesor_id: 'g1', desde: '2026-09-01' },
      { id: '4', socio_id: 'y', asesor_id: 'a1', desde: '2999-01-01' },   // futura: no cuenta
      { id: '5', socio_id: 'z', asesor_id: 'g1', desde: '2026-09-02' },
      { id: '6', socio_id: 'z', asesor_id: '', desde: HOY },              // quitada hoy
      { id: '7', socio_id: 'w', asesor_id: 'a1', desde: HOY },
      { id: '8', socio_id: 'w', asesor_id: 'g1', desde: '2026-01-01' }] } });   // más vieja, después en la lista
    const d = aca(P.ev('duenosDeHoy()'));
    ['x', 'y', 'z', 'w'].forEach(id => assert.equal(d[id], de(P, id), 'no coinciden para ' + id));
    assert.deepEqual(d, { x: 'a1', y: 'g1', z: '', w: 'a1' });
  });
});

/* ======================================================================== */
describe('sin app/comisiones.js la ficha y la lista no se caen, ni dicen «nadie»', () => {
  test('dicen que no saben', () => {
    const P = abrir({ banco: { sinComisiones: true } });
    P.ev("verCliente('C1')");
    assert.match(cuerpo(P), /No cargó app\/comisiones\.js: no puedo decir quién lo atiende/);
    assert.doesNotMatch(cuerpo(P), /Nadie de tu equipo/);
    P.ev('renderClientes()');
    assert.match(P.elems.tblClientes.innerHTML, /Joan Ruiz/);
    P.ev("asignarUno('cliente','C1')");
    assert.match(ultimo(P), /No cargó app\/comisiones\.js/);
  });
});
