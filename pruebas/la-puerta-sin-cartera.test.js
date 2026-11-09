/* ===========================================================================
 * LA PUERTA DEL CRM EN UN APARATO SIN CARTERA — E1, 4-nov-2026; junta el 9-nov
 *
 *   node --test pruebas/la-puerta-sin-cartera.test.js
 *
 * Joan abrió el CRM en el iPhone y «no deja entrar»: el PIN es de CADA navegador
 * (config.pin en su localStorage), en un aparato nuevo la cartera está vacía y lo
 * único que abre es el de fábrica.
 *
 * Esta rama (plata-e1) y main contestaron lo mismo, cada una a su manera. Al juntar
 * el 9-nov ganó la de main: la puerta del PIN sigue a la vista y debajo sale «¿Eres
 * Joan? Este aparato todavía no tiene tu cartera» con «Traer mi cartera» (la prueba
 * de esa salida es entrar-desde-otro-celular.test.js). De esta rama quedan dos cosas,
 * y son las que se prueban aquí:
 *   · una sesión guardada no abre sola un CRM en $0 en un aparato sin cartera: se
 *     queda la puerta, con la salida de main;
 *   · `#clave-nube=` se quitó. Nadie genera ese enlace, y dejaba pisar la clave de
 *     sincronización antes de cualquier puerta.
 *
 * Y LO QUE NO SE PUEDE ROMPER: en el computador de Joan, con su cartera, la puerta es
 * la de siempre y la sesión de 24 h se retoma como siempre.
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
const salidaALaVista = P => P.elems.salidaPuerta.style.display !== 'none';

describe('la puerta que quedó al juntar es la de main', () => {
  test('la puerta de esta rama se fue entera: ni su HTML ni sus funciones', () => {
    assert.doesNotMatch(CRM, /id="gateSinCartera"|id="gateConPin"|id="gateNotaRespaldo"/);
    const codigo = CRM.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(codigo, /pintarPuertaSegunCartera|tengoUnRespaldo|_quiereSubirRespaldo/);
  });

  test('sin nada guardado: el PIN sigue ahí y debajo la salida de main', () => {
    const P = abrir(null);
    assert.equal(salidaALaVista(P), true);
    assert.match(P.elems.salidaPuertaTexto.textContent, /^¿Eres Joan\? Este aparato todavía no tiene tu cartera/);
  });
});

describe('una sesión guardada no abre un CRM en $0', () => {
  test('en un aparato sin cartera, la sesión de un 1234 de ayer no entra sola: se queda la puerta con su salida', () => {
    const almacen = {};
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    assert.equal(P.ev('_crmAbierto'), true, 'la prueba necesita haber entrado con el de fábrica');
    assert.ok(Object.keys(almacen).some(k => /sesion/i.test(k)), 'la prueba necesita una sesión guardada');
    const Q = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    Q.ev('retomarSesionAlAbrir()');
    assert.equal(Q.ev('_crmAbierto'), false, 'abrió un CRM en $0 con la sesión de ayer');
    assert.equal(salidaALaVista(Q), true);
  });
});

describe('en el computador de Joan, con su cartera, nada cambia', () => {
  test('la puerta es la del PIN de siempre, sin salida', () => {
    assert.equal(salidaALaVista(abrir(conCartera())), false);
  });

  test('entra con su PIN, y no con 1234', () => {
    const P = abrir(conCartera());
    P.ev("document.getElementById('pinInput').value = '1234'; entrar()");
    assert.equal(P.ev('_crmAbierto'), false);
    P.ev("document.getElementById('pinInput').value = '482915'; entrar()");
    assert.equal(P.ev('_crmAbierto'), true);
  });

  test('la sesión de 24 h se retoma como siempre', () => {
    const almacen = { [KEY]: JSON.stringify(conCartera()) };
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    P.ev("document.getElementById('pinInput').value = '482915'; entrar()");
    const Q = abrirPanel({ tarjeta: true, ahora: HOY, almacen });
    assert.equal(Q.ev('retomarSesionAlAbrir()'), 'dueno');
    assert.equal(Q.ev('_crmAbierto'), true);
  });

  test('una cartera con solo créditos, o solo prospectos, o solo papelera, también es una cartera', () => {
    [{ prestamos: [{ id: 'P1', socioId: 'X', capital: 1 }] }, { respaldados: [{ id: 'R1' }] }, { prospectos: [{ id: 'X1', celular: '3000000000' }] },
     { papeleraSocios: [{ socio: { id: 'C9' } }] }].forEach(d => {
      const P = abrir(Object.assign({ socios: [], prestamos: [], respaldados: [], config: { pin: '1234' } }, d));
      assert.equal(P.ev('carteraVaciaAqui()'), false, 'le negaría su sesión a una cartera: ' + JSON.stringify(d));
    });
  });

  test('sin clientes pero con un PIN propio: alguien configuró este aparato, su sesión se retoma', () => {
    assert.equal(abrir({ socios: [], prestamos: [], config: { pin: '482915' } }).ev('carteraVaciaAqui()'), false);
  });

  test('un disco que no se puede leer no es «no hay cartera»: no se afirma nada', () => {
    const P = abrirPanel({ tarjeta: true, ahora: HOY, almacen: { [KEY]: '{esto no es json' } });
    assert.equal(P.ev('carteraVaciaAqui()'), false);
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
