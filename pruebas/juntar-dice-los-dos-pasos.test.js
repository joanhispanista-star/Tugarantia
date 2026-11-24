/* ============================================================================
 * «¿ES LA MISMA PERSONA?» DICE ARRIBA CUANDO UN TOQUE NO BASTA — 24-nov-2026
 *
 * Joan, con su propia cuenta de prueba: «sigue sin permitir juntar las cuentas».
 * Sí se podía. La cuenta se había abierto un mes antes del registro, y para ese
 * caso la nube (vincular_interna) exige una clave nueva al número de la ficha y
 * una hora de espera. El botón y su porqué estaban al FINAL de la ventana; arriba
 * no se decía nada. Una regla que frena y no se ve parece un daño.
 *
 * Aquí se fija que el aviso salga arriba, que diga los dos pasos y la razón de
 * verdad, y que NO salga cuando un toque sí basta.
 * ==========================================================================*/
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

describe('crm.html · el aviso de los dos pasos', () => {
  const P = abrirPanel({});
  const aviso = (c, k) => P.ev('avisoDosPasosJuntar(' + JSON.stringify(c) + ',' + JSON.stringify(k) + ')');

  test('la cuenta se abrió antes del registro: lo dice, y dice los dos pasos', () => {
    const h = aviso({ cuenta: true, minutos_antes_del_registro: 41760 }, { dada: false });
    assert.match(h, /Esta cuenta no se junta con un solo toque\./);
    assert.match(h, /se abrió antes de este registro: mirando no se sabe quién ha tenido su contraseña/);
    assert.match(h, /<b>1\.<\/b> «🔑 Clave nueva al número de su ficha» \(el botón está al final de esta ventana\)/);
    assert.match(h, /<b>2\.<\/b> Esperar una hora/);
    assert.doesNotMatch(h, /recado/);
  });

  test('hay un recado de «Olvidé mi contraseña»: esa es la razón que dice', () => {
    const h = aviso({ cuenta: true, recado_abierto: true, minutos_antes_del_registro: 5 }, { dada: false });
    assert.match(h, /tiene un recado de «Olvidé mi contraseña» abierto/);
    assert.doesNotMatch(h, /se abrió antes de este registro/);
  });

  test('las dos razones a la vez: dice las dos', () => {
    const h = aviso({ cuenta: true, recado_abierto: true, minutos_antes_del_registro: 500 }, { dada: false });
    assert.match(h, /se abrió antes de este registro y además tiene un recado/);
  });

  test('con la clave nueva ya dada no repite los pasos: dice desde qué hora se puede', () => {
    const desde = new Date(2026, 10, 24, 16, 45, 0).toISOString();
    const h = aviso({ cuenta: true, minutos_antes_del_registro: 41760 }, { dada: true, desde, lista: false });
    assert.match(h, /Ya le diste la clave nueva: <b>se puede juntar desde las 16:45<\/b>/);
    assert.doesNotMatch(h, /<b>1\.<\/b>/);
  });

  test('las razones son las MISMAS dos que mira la nube', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'base', '20261007_una_puerta.sql'), 'utf8');
    assert.match(sql, /La cuenta de ese celular se abrió más de una hora antes del registro\./);
    assert.match(sql, /Hay un recado de «Olvidé mi contraseña» abierto con ese celular\./);
    const UP = require('../panel/una-puerta.js');
    assert.equal(UP.requiereClaveNueva({ cuenta: true, minutos_antes_del_registro: 61 }), true);
    assert.equal(UP.requiereClaveNueva({ cuenta: true, minutos_antes_del_registro: 59 }), false);
    assert.equal(UP.requiereClaveNueva({ cuenta: true, recado_abierto: true }), true);
  });
});

describe('crm.html · dónde sale el aviso', () => {
  test('su caja va ARRIBA de la ventana, antes de la ficha y del historial', () => {
    const modal = CRM.slice(CRM.indexOf("openModal('¿Es la misma persona?'"), CRM.indexOf('_modalJuntar={vez:++_vecesJuntar'));
    const caja = modal.indexOf('<div id="juntarPasos"></div>');
    assert.ok(caja > 0, 'la ventana trae la caja del aviso');
    assert.ok(caja < modal.indexOf('Si la juntas, la cuenta que se registró'), 'antes de la explicación');
    assert.ok(caja < modal.indexOf('id="juntarCuenta"') && caja < modal.indexOf('id="juntarBoton"'), 'antes de la cuenta y del botón');
  });

  test('se pinta solo cuando un toque no basta, y se borra cuando ya basta', () => {
    assert.match(CRM, /if\(cajaPasos\) cajaPasos\.innerHTML=pideClave\?avisoDosPasosJuntar\(c,k\):'';/);
    assert.match(CRM, /const cajaPasos=conBoton\?document\.getElementById\('juntarPasos'\):null;/, 'en la mesa de cruce (sin botón) no hay ventana corta');
  });
});
