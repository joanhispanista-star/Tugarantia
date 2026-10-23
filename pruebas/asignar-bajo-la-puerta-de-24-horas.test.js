'use strict';
/* ============================================================================
 * «👤 ASIGNAR A…» Y LA SESIÓN DE 24 HORAS, JUNTAS — 23-oct-2026
 *
 *   node --test pruebas/asignar-bajo-la-puerta-de-24-horas.test.js
 *
 * Dos ramas del mismo día que llegan juntas al lote del 27-oct:
 *   · crm-asignar (6aa7977): «👤 Asignar a…» en cada ficha y fila, «＋ Agregar
 *     prospecto» suelto y el buscador de Bases;
 *   · crm-sesion (ba18b2c): la sesión de 24 h, la puerta que sale ENCIMA del
 *     CRM abierto (a las 24 h o con «Salir ahora») y lo deja fuera del
 *     teclado, y que al volver a entrar devuelve todo como estaba.
 * Nacieron de commits distintos y git las juntó sin un solo choque de texto,
 * así que ninguna de las dos se probó con la otra. Lo que vigila este archivo
 * es justo donde se tocan: los cuadros de asignar son lo que Joan deja a medio
 * llenar (eligió a Willian y no ha tocado «Asignar»), y la puerta promete
 * «Lo que tenías en pantalla sigue ahí».
 *   1. Con «👤 Asignar a…» abierto, se cumplen las 24 h: el Enter en
 *      «Asignar» no pasa (no se anota ni se publica nada a nombre de una
 *      sesión vencida), la puerta tapa el cuadro, y con el PIN vuelve tal cual
 *      —Willian sigue elegido— y asignar publica una vez.
 *   2. Con «＋ Agregar prospecto» a medio llenar, «Salir ahora»: escribir en el
 *      buscador de Bases no pasa; con el PIN, lo escrito sigue y el prospecto
 *      entra asignado y publicado.
 * Las dos fallan con cada rama sola (a la una le falta la puerta; a la otra,
 * los cuadros) y pasan con las dos fusionadas.
 *
 * El navegador es el banco del CRM (banco-panel.js, con `tarjeta: true` para
 * la puerta), el reloj es de mentira (reloj.js) y la nube, la de mentiras de
 * asignar-desde-la-ficha.test.js: anota lo que se publica.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { relojFijo } = require('./reloj.js');
const { asentar } = require('./esperar.js');

const PIN = '4821';
const WILLIAN = '3000000000';
/* Viernes 23-oct-2026, hora local, como la-sesion-dura-24-horas. */
const ENTRA = '2026-10-23T10:30:00';
const VEINTICUATRO_Y_UN_MIN = '2026-10-24T10:31:00';

/* El CRM de Joan: él mismo como cliente, una prospecta, y su equipo. Con PIN:
   la puerta es la del PIN. */
const CARTERA = {
  socios: [{ id: 'C1', numero: 1, nombre: 'Joan Ruiz', telefono: '3103606348', whatsappIgual: true }],
  prestamos: [],
  prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo', base: 'septiembre.xlsx' }],
  equipo: [
    { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
    { id: 'a1', nombre: 'LEIDY', rol: 'asesor', estado: 'activo', celular: '3000000002', jefe: 'g1' }],
  asignaciones: [], gestiones: [], config: { negocio: 'Tu Garantía', pin: PIN }
};

const aca = v => JSON.parse(JSON.stringify(v));
const puertaEncima = P => !!(P.elems.gate && P.elems.gate.style.display !== 'none');
const hora = (P, iso) => { P.ctx.Date = relojFijo(iso); };
const evento = (tipo, target, key) => {
  const e = { type: tipo, key: key || '', target: target || null, frenado: false };
  e.preventDefault = () => { e.frenado = true; };
  e.stopPropagation = () => {};
  e.stopImmediatePropagation = () => {};
  return e;
};
const despachar = (P, fn, e) => { P.ctx.__e = e; P.ev(fn + '(__e)'); return e; };
const enviados = P => aca(P.ev('_enviados.slice()'));
const filasDe = (pub, id) => (pub.p_asignaciones || []).filter(a => a.persona_id === id);

/* Joan abre su CRM y entra con el PIN. La nube de mentiras va DESPUÉS de
   entrar: entrar() arranca las piezas de la nube de verdad (que en el banco no
   están), y lo que se prueba aquí es lo que pasa después. */
function abrirYEntrar() {
  const P = abrirPanel({ ahora: ENTRA, tarjeta: true });
  P.cargarCartera(CARTERA);
  P.ctx.scrollTo = () => {};
  P.recargas = 0;
  P.ctx.location.reload = () => { P.recargas++; };
  entrarConPin(P);
  assert.ok(!puertaEncima(P), 'el caso de prueba no llegó a entrar con el PIN');
  P.ev(`
    var _enviados = [], _cuadros = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    window.NubeCRM = { estado: function () { return { fase: 'lista' }; },
      libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) {
      if (fn === 'equipo_traer') return Promise.resolve({});
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') { _enviados.push(JSON.parse(JSON.stringify(args))); return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
  `);
  return P;
}
function entrarConPin(P) {
  P.ctx.document.getElementById('pinInput').value = PIN;
  P.ev('entrar()');
}
/* Lo de debajo de la puerta, fuera del teclado y del lector de pantalla. */
function tapado(P, id) {
  const n = P.ctx.document.getElementById(id);
  return n.inert === true && (n._attrs || {})['aria-hidden'] === 'true';
}

/* ======================================================================== */
describe('«👤 Asignar a…» y «＋ Agregar prospecto» bajo la puerta de la sesión de 24 h', () => {

  test('1 · con «👤 Asignar a…» abierto se cumplen las 24 h: «Asignar» no pasa, y con el PIN vuelve con Willian elegido y publica una vez', async () => {
    const P = abrirYEntrar();
    const $ = id => P.ctx.document.getElementById(id);
    P.ev("asignarUno('cliente','C1','ficha')");
    $('auDestino').value = 'g1';
    const cuadro = P.elems.mBody.innerHTML;
    assert.match(cuadro, /confirmarAsignarUno\('cliente','C1','ficha'\)/, 'el caso de prueba no abrió el cuadro de asignar');

    /* Joan vuelve al otro día y oprime Enter sobre «Asignar». Un keydown
       frenado no dispara el clic del botón: el navegador no lo activa. */
    hora(P, VEINTICUATRO_Y_UN_MIN);
    const enter = despachar(P, 'alTocarConSesion', evento('keydown', $('botonAsignar'), 'Enter'));
    if (!enter.frenado) await P.ev("confirmarAsignarUno('cliente','C1','ficha')");
    await asentar();
    assert.ok(enter.frenado, 'pasadas las 24 h, el Enter en «Asignar» pasó');
    assert.ok(puertaEncima(P), 'pasadas las 24 h, la puerta no salió encima del cuadro de asignar');
    assert.ok(tapado(P, 'modal'), 'el cuadro de asignar sigue al alcance del teclado debajo de la puerta');
    assert.ok(tapado(P, 'app'), 'el CRM sigue al alcance del teclado debajo de la puerta');
    assert.equal(P.ev('asignaciones().length'), 0, 'se anotó una asignación con la sesión vencida');
    assert.equal(enviados(P).length, 0, 'se le publicó al equipo con la sesión vencida');

    /* Con el PIN la puerta se va, y el cuadro es el mismo: Willian elegido. */
    entrarConPin(P);
    assert.ok(!puertaEncima(P), 'con el PIN la puerta no se fue');
    assert.notEqual(P.ctx.document.getElementById('modal').inert, true, 'con el PIN el cuadro se quedó sin teclado');
    assert.equal(P.elems.mBody.innerHTML, cuadro, 'con el PIN el cuadro de asignar no es el que Joan dejó');
    assert.equal($('auDestino').value, 'g1', 'con el PIN se perdió a quién había elegido Joan');
    assert.equal(P.recargas, 0, 'volver a entrar recargó la página: lo de pantalla se perdió');

    const otra = despachar(P, 'alTocarConSesion', evento('keydown', $('botonAsignar'), 'Enter'));
    assert.equal(otra.frenado, false, 'con la sesión nueva, el Enter en «Asignar» sigue frenado');
    const r = await P.ev("confirmarAsignarUno('cliente','C1','ficha')");
    await asentar();
    assert.equal(r, 'publicado', 'asignar después de volver a entrar no publicó: ' + r);
    const pub = enviados(P);
    assert.equal(pub.length, 1, 'se publicó ' + pub.length + ' veces');
    assert.deepEqual(filasDe(pub[0], 'C1').map(a => [a.asesor, a.desde]), [[WILLIAN, '2026-10-24']],
      'la asignación no viajó a Willian con la fecha del día en que Joan la hizo');
  });

  test('2 · con «＋ Agregar prospecto» a medio llenar, «Salir ahora»: el buscador de Bases no se usa debajo, y con el PIN lo escrito sigue y entra', async () => {
    const P = abrirYEntrar();
    const $ = id => P.ctx.document.getElementById(id);
    P.ev("irA('bases')");
    P.ev('agregarProspecto()');
    const escrito = { apNombre: 'pedro pérez', apCel: '311 555 0001', apOrigen: 'me lo recomendó Nancy',
      apAutoriza: 'no', apAsignarA: 'g1' };
    Object.keys(escrito).forEach(k => { $(k).value = escrito[k]; });

    P.ev('salirAhora()');
    assert.ok(puertaEncima(P), '«Salir ahora» no puso la puerta encima');
    assert.equal(P.recargas, 0, '«Salir ahora» de Joan recargó: lo escrito en el cuadro se perdió');
    assert.ok(tapado(P, 'modal'), 'el cuadro de agregar prospecto sigue al alcance del teclado debajo de la puerta');
    /* El buscador de Bases es nuevo: tiene que vivir DENTRO de #app, que es lo
       que la puerta deja inert. Fuera de él (colgado del body, por ejemplo)
       solo lo cubriría la red de abajo. */
    const crm = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    const app = crm.slice(crm.indexOf('<div class="app" id="app"'), crm.indexOf('</main>'));
    assert.match(app, /<input id="buscaBases"/, 'el buscador de Bases no está dentro de #app: la puerta no lo deja inert');
    /* Donde no hay `inert`, la red es frenarDebajoDeLaPuerta: lo que no está
       dentro de la puerta no pasa. */
    $('gate').contains = n => n === $('pinInput') || n === $('pinBtn');
    const tecla = despachar(P, 'alTocarConSesion', evento('keydown', $('buscaBases'), 'a'));
    assert.ok(tecla.frenado, 'con la puerta encima se puede escribir en el buscador de Bases');
    const enter = despachar(P, 'alTocarConSesion', evento('keydown', $('botonAgregar'), 'Enter'));
    assert.ok(enter.frenado, 'con la puerta encima, el Enter en «Agregar» pasó');
    assert.equal(P.ev('prospectos().length'), 1, 'entró un prospecto con la sesión cerrada');

    entrarConPin(P);
    assert.ok(!puertaEncima(P), 'con el PIN la puerta no se fue');
    Object.keys(escrito).forEach(k => assert.equal($(k).value, escrito[k], 'con el PIN se perdió lo escrito en ' + k));
    await P.ev('guardarProspectoSuelto()');
    await asentar();
    const p = aca(P.ev('prospectos()[1]'));
    assert.ok(p && p.celular === '3115550001', 'el prospecto no entró después de volver a entrar');
    assert.equal(P.ev("COMIS.asesorDe(asignaciones(),'" + p.id + "','2026-10-23')"), 'g1', 'no quedó asignado a Willian');
    const pub = enviados(P);
    assert.equal(pub.length, 1, 'se publicó ' + pub.length + ' veces');
    assert.ok((pub[0].p_gente || []).some(x => x.id === p.id && x.tipo === 'prospecto'), 'el prospecto no le llegó a Willian');
  });

  /* 23-oct-2026 — ESCAPE EN EL CAMPO DEL PIN CERRABA EL CUADRO DE DEBAJO.
     La puerta sale sin aviso (a las 24 h, al siguiente toque) y lo primero
     que uno hace con algo que se le atraviesa es oprimir Escape. Esa tecla
     sale del campo del PIN, que es DE la puerta: frenarDebajoDeLaPuerta la
     deja pasar (tiene que: es donde Joan escribe), y el oyente del modal la
     tomaba y cerraba «👤 Asignar a…» con Willian elegido mientras la puerta
     decía «Lo que tenías en pantalla sigue ahí». La tecla pasa aquí por los
     oyentes de verdad del documento, en su orden: captura y después burbuja. */
  test('3 · Escape en el campo del PIN no cierra el cuadro de debajo; con la sesión abierta, Escape lo cierra como siempre', () => {
    const P = abrirYEntrar();
    const $ = id => P.ctx.document.getElementById(id);
    /* El modal del banco no sabe si está abierto: se le da una clase de verdad. */
    let abierto = false;
    $('modal').classList = { add: c => { if (c === 'on') abierto = true; }, remove: c => { if (c === 'on') abierto = false; },
      toggle() {}, contains: c => c === 'on' && abierto };
    const oprimir = (target, key) => {
      const e = evento('keydown', target, key);
      let parado = false;
      e.stopPropagation = () => { parado = true; };
      e.stopImmediatePropagation = () => { parado = true; };
      const oyentes = (P.ctx._oyentesDoc || []).filter(o => o.tipo === 'keydown');
      assert.ok(oyentes.length >= 2, 'el banco no anotó los oyentes de teclado del documento');
      for (const fase of [true, false]) {
        for (const o of oyentes.filter(x => x.captura === fase)) { if (parado) return e; o.fn(e); }
      }
      return e;
    };

    P.ev("asignarUno('cliente','C1','ficha')");
    $('auDestino').value = 'g1';
    assert.ok(abierto, 'el caso de prueba no abrió el cuadro de asignar');
    hora(P, VEINTICUATRO_Y_UN_MIN);
    P.ev('vigilarSesion()');
    assert.ok(puertaEncima(P), 'a las 24 h la puerta no salió');
    $('gate').contains = n => n === $('pinInput') || n === $('pinBtn');

    const esc = oprimir($('pinInput'), 'Escape');
    assert.equal(esc.frenado, false, 'frenó una tecla del propio campo del PIN');
    assert.ok(abierto, 'Escape en el campo del PIN cerró el cuadro de asignar que estaba debajo de la puerta');
    oprimir(P.ctx.document.body, 'Escape');
    assert.ok(abierto, 'Escape con el foco en la página cerró el cuadro de asignar que estaba debajo de la puerta');

    entrarConPin(P);
    assert.ok(!puertaEncima(P));
    assert.equal($('auDestino').value, 'g1', 'con el PIN se perdió a quién había elegido Joan');
    /* Control: sin puerta, Escape cierra el cuadro como siempre. */
    oprimir($('auDestino'), 'Escape');
    assert.equal(abierto, false, 'con la sesión abierta, Escape ya no cierra el cuadro');
  });
});
