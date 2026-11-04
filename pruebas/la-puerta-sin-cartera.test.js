/* ===========================================================================
 * LA PUERTA DEL CRM EN UN APARATO SIN CARTERA — E1, 4-nov-2026
 *
 *   node --test pruebas/la-puerta-sin-cartera.test.js
 *
 * Joan abrió el CRM en el iPhone y «no deja entrar»: el PIN es de CADA navegador
 * (config.pin en su localStorage), en un aparato nuevo la cartera está vacía y lo
 * único que abre es el de fábrica. Escribía su PIN de verdad y leía «PIN
 * incorrecto»; con 1234 entraba a un CRM en $0, que no se distingue de un negocio
 * sin clientes. Las dos pantallas mienten sobre lo mismo: ese aparato no tiene su
 * cartera, y ninguna lo dice.
 *
 * Ahora la puerta lo dice y manda al Panel en el bolsillo, que sí trabaja con lo
 * que hay en la nube. Se conserva «Tengo un respaldo para subir aquí», que es lo
 * único para lo que sirve el 1234, y el botón del equipo no se toca: en el celular
 * de un gerente no hay cartera de Joan, y por ahí entra.
 *
 * Y LO QUE NO SE PUEDE ROMPER: en el computador de Joan, con su cartera, esta puerta
 * no aparece nunca.
 *
 * También aquí: `#clave-nube=` se quitó. Nadie genera ese enlace, y dejaba pisar la
 * clave de sincronización antes de cualquier puerta.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const KEY = 'joan_socios_v1';
const HOY = '2026-11-03T15:00:00';
const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const conCartera = () => ({ socios: [{ id: 'C1', numero: 1, nombre: 'Cliente Inventada', gestiones: [] }], prestamos: [], respaldados: [],
  config: { pin: '482915' }, contadores: { cliente: 1, credito: 0, respaldado: 0 } });
const abrir = (cartera, extra) => abrirPanel(Object.assign({ tarjeta: true, ahora: HOY,
  almacen: cartera ? { [KEY]: JSON.stringify(cartera) } : {} }, extra || {}));
const puerta = P => ({ sinCartera: P.elems.gateSinCartera.hidden === false, conPin: P.elems.gateConPin.hidden === false });

describe('en un aparato sin cartera, la puerta lo dice', () => {
  test('sin nada guardado: dice dónde está la cartera, y no ofrece el PIN', () => {
    assert.deepEqual(puerta(abrir(null)), { sinCartera: true, conPin: false });
  });

  test('y lo dice con todas las letras, con el enlace al Panel y sin nombrar el 1234', () => {
    const i = CRM.indexOf('id="gateSinCartera"');
    assert.ok(i > 0, 'no está la tarjeta');
    const t = CRM.slice(i, CRM.indexOf('id="gateConPin"', i));
    assert.match(t, /Este aparato no tiene tu cartera/);
    assert.match(t, /Tu cartera completa está en tu computador/);
    assert.match(t, /href="espejo\.html"/);
    assert.match(t, /Tengo un respaldo para subir aquí/);
    assert.doesNotMatch(t, /1234/, 'la primera pantalla no le ofrece el PIN de fábrica a nadie');
  });

  test('una cartera vacía que alguien guardó entrando con 1234 cuenta como sin cartera', () => {
    const vacia = { socios: [], prestamos: [], respaldados: [], config: { pin: '1234' }, contadores: {} };
    assert.deepEqual(puerta(abrir(vacia)), { sinCartera: true, conPin: false });
  });

  test('«Tengo un respaldo» abre el PIN, dice qué hacer, y el 1234 sigue entrando', () => {
    const P = abrir(null);
    P.ev('tengoUnRespaldo()');
    assert.deepEqual(puerta(P), { sinCartera: false, conPin: true });
    assert.equal(P.elems.gateNotaRespaldo.hidden, false, 'no dice qué hacer con el PIN de fábrica');
    const t = CRM.slice(CRM.indexOf('id="gateNotaRespaldo"'), CRM.indexOf('id="gateNotaRespaldo"') + 400);
    assert.match(t, /1234/);
    assert.match(t, /Importar respaldo/);
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    assert.equal(P.ev('_crmAbierto'), true, 'el único camino para subir un respaldo quedó cerrado');
  });

  test('entrando por ahí y subiendo el respaldo, la cartera queda y la puerta vuelve a ser la de siempre', () => {
    const almacen = {};
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    P.ev('tengoUnRespaldo()');
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    P.ctx.__archivo = { target: { files: [{ texto: JSON.stringify(conCartera()) }], value: '' } };
    P.ev('importar(__archivo)');
    assert.equal(JSON.parse(almacen[KEY]).socios.length, 1);
    assert.equal(P.ev('_otraPestana'), null, 'su propia escritura la tomó por la de otra pestaña');
    const Q = abrirPanel({ tarjeta: true, ahora: HOY, almacen: { [KEY]: almacen[KEY] } });
    assert.deepEqual(puerta(Q), { sinCartera: false, conPin: true });
    assert.equal(Q.ev('DB.config.pin'), '482915');
  });

  test('el botón del equipo está en las dos puertas, y funciona desde esta', () => {
    const i = CRM.indexOf('<div class="gate-card">');
    const tarjeta = CRM.slice(i, CRM.indexOf('<div class="app" id="app"', i));
    const j = tarjeta.indexOf('onclick="soyDelEquipo()"');
    assert.ok(j > 0, 'se quitó el botón del equipo');
    const hastaAhi = tarjeta.slice(0, j).replace(/<!--[\s\S]*?-->/g, '');
    assert.equal((hastaAhi.match(/<div\b/g) || []).length - (hastaAhi.match(/<\/div>/g) || []).length, 1,
      'el botón del equipo quedó dentro de una de las dos mitades: alguna de las dos puertas se quedaría sin él');
    const P = abrir(null);
    P.ev('soyDelEquipo()');
    assert.match(P.elems['gate-card'].innerHTML, /eqTelIn/, 'la puerta del equipo no se pintó');
  });

  test('«← Soy Joan» vuelve a decir lo mismo, no a la tarjeta del PIN sin más', () => {
    const P = abrir(null);
    P.ev('soyDelEquipo()');
    P.ev('volverAPuertaDeJoan()');
    assert.deepEqual(puerta(P), { sinCartera: true, conPin: false });
  });

  test('#equipo abre directo la del equipo, como siempre', () => {
    const P = abrir(null, { hash: '#equipo' });
    assert.match(P.elems['gate-card'].innerHTML, /eqTelIn/);
  });

  test('una sesión guardada no abre un CRM en $0: la puerta sigue diciendo que aquí no hay cartera', () => {
    const almacen = {};
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    P.ev('tengoUnRespaldo()');
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    assert.ok(Object.keys(almacen).some(k => /sesion/i.test(k)), 'la prueba necesita una sesión guardada');
    const Q = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    Q.ev('retomarSesionAlAbrir()');
    assert.equal(Q.ev('_crmAbierto'), false, 'abrió un CRM en $0 con la sesión de ayer');
    assert.deepEqual(puerta(Q), { sinCartera: true, conPin: false });
  });
});

describe('en el computador de Joan, con su cartera, nada cambia', () => {
  test('la puerta es la del PIN de siempre', () => {
    const P = abrir(conCartera());
    assert.deepEqual(puerta(P), { sinCartera: false, conPin: true });
    assert.equal(P.elems.gateNotaRespaldo && P.elems.gateNotaRespaldo.hidden, true);
  });

  test('entra con su PIN, y no con 1234', () => {
    const P = abrir(conCartera());
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    assert.equal(P.ev('_crmAbierto'), false);
    P.ev("document.getElementById('pinInput').value = '482915'; entrar()");
    assert.equal(P.ev('_crmAbierto'), true);
  });

  test('una cartera con solo créditos, o solo prospectos, o solo papelera, también es una cartera', () => {
    [{ prestamos: [{ id: 'P1', socioId: 'X', capital: 1 }] }, { respaldados: [{ id: 'R1' }] }, { prospectos: [{ id: 'X1', celular: '3000000000' }] },
     { papeleraSocios: [{ socio: { id: 'C9' } }] }].forEach(d => {
      const P = abrir(Object.assign({ socios: [], prestamos: [], respaldados: [], config: { pin: '482915' } }, d));
      assert.deepEqual(puerta(P), { sinCartera: false, conPin: true }, 'le dijo a Joan que no tiene cartera: ' + JSON.stringify(d));
    });
  });

  test('sin clientes pero con un PIN propio: alguien configuró este aparato, se le pide su PIN', () => {
    const P = abrir({ socios: [], prestamos: [], config: { pin: '482915' } });
    assert.deepEqual(puerta(P), { sinCartera: false, conPin: true });
  });

  test('un disco que no se puede leer no es «no hay cartera»: la puerta de siempre, sin afirmar nada', () => {
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen: { [KEY]: '{esto no es json' } });
    assert.deepEqual(puerta(P), { sinCartera: false, conPin: true });
  });

  test('la sesión de 24 h se retoma como siempre', () => {
    const almacen = { [KEY]: JSON.stringify(conCartera()) };
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    P.ev("document.getElementById('pinInput').value = '482915'; entrar()");
    const Q = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    assert.equal(Q.ev('retomarSesionAlAbrir()'), 'dueno');
    assert.equal(Q.ev('_crmAbierto'), true);
  });

  test('el candado de la sesión sobre el CRM abierto sigue pidiendo el PIN', () => {
    const P = abrir(null);
    P.ev('tengoUnRespaldo()');
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    P.ev('_quiereSubirRespaldo = false; pintarPuertaSegunCartera()');
    assert.deepEqual(puerta(P), { sinCartera: false, conPin: true }, 'con el CRM abierto debajo, la puerta se quedó sin el PIN');
  });
});

describe('#clave-nube= se quitó', () => {
  test('el hash ya no escribe la clave de sincronización antes de cualquier puerta', () => {
    const P = abrirPanel({ hash: '#clave-nube=una-clave-inventada-123', ahora: HOY });
    assert.ok(!(P.almacen.joan_socios_sb || '').includes('una-clave-inventada-123'), 'la clave del hash se guardó sin pedirle nada a nadie');
    assert.ok(!(P.ctx._avisos || []).some(a => /clave de sincronización llegó/.test(a)));
  });

  test('tampoco en el código', () => {
    const codigo = CRM.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(codigo, /clave-nube=/);
  });
});
