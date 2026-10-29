'use strict';
/* ==========================================================================
 * A LAS REFERENCIAS NO SE LES COBRA — 28 de octubre de 2026
 *
 *   node --test pruebas/las-referencias-no-se-llaman-para-cobrar.test.js
 *
 * La Ley 2300 de 2023, art. 4, prohíbe gestionar el cobro a través de las
 * referencias, sin excepción, y la política y los términos lo dicen desde su
 * versión del 8-oct: «A tus referencias no las llamamos para cobrarte». Pero
 * el código seguía mandándolo: el tramo M1 de TRAMOS_MORA (app/motor.js)
 * decía «gestión con referencias», y el CRM lo enseña en «Cartera por tramo ›
 * Qué toca hacer», el cuadro con que Joan decide a quién llamar y cómo. Lo
 * encontró la revisión del lote de la historia laboral (arreglador final, R1).
 *
 * Aquí se vigila que ningún texto del código vuelva a mandar a las
 * referencias. Con el código de antes, esto falla.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const M = require('../app/motor.js');

/* Mandar o sugerir contactar a una referencia: llamarla, escribirle, gestionar
   con ella, hablar con ella si no se ubica al cliente. «nunca» delante la
   vuelve la regla, no la orden. */
const MANDA_A_REFERENCIAS = /(gesti[oó]n|cobr\w*|llam\w*|contact\w*|habl\w*|escrib\w*)[^.;]{0,40}\breferencias?\b/i;

describe('la cartera por tramo no manda a las referencias', () => {
  test('el M1 dice qué toca con el cliente, y que nunca a sus referencias', () => {
    const m1 = M.TRAMOS_MORA.find(t => t.tramo === 'M1');
    assert.ok(m1, 'ya no hay tramo M1: revisa esta prueba');
    assert.equal(m1.accion, 'contacto directo con el cliente; nunca a sus referencias (Ley 2300, art. 4)');
  });

  test('ningún tramo manda a gestionar, llamar ni escribirle a las referencias', () => {
    const malos = M.TRAMOS_MORA.filter(t => MANDA_A_REFERENCIAS.test(String(t.accion).replace(/nunca a sus referencias/g, '')))
      .map(t => t.tramo + ': ' + t.accion);
    assert.deepEqual(malos, [], 'un tramo de mora manda a las referencias: la Ley 2300, art. 4, lo prohíbe');
  });

  test('«Qué toca hacer» del CRM sale de esos tramos, no de un texto propio', () => {
    /* El cuadro pinta t.accion de MotorReglas.TRAMOS_MORA: con el motor
       limpio, el CRM queda limpio. Si algún día se escribe a mano, esto avisa. */
    const crm = leer('panel/crm.html');
    const i = crm.indexOf('/* ---- Cartera por tramo de mora (§9) ---- */');
    assert.ok(i > 0, 'no encontré «Cartera por tramo» en el CRM');
    const bloque = crm.slice(i, crm.indexOf('/* ---- Niveles ----', i));
    assert.match(bloque, /MotorReglas\.TRAMOS_MORA/);
    assert.match(bloque, /<th>Qué toca hacer<\/th>/);
    assert.match(bloque, /\$\{escHTML\(t\.accion\)\}/);
    assert.equal(/referencias?/i.test(bloque.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'el cuadro escribe algo de las referencias por su cuenta');
  });
});

/* Los demás textos que la búsqueda de R1 encontró, todos restos de la promesa
   que la política quitó el 8-oct («se las contactaba si no logramos
   comunicarnos contigo»). Con el código de antes, cada uno falla. */
describe('ni el registro, ni la ficha de Play, ni la revisión del CRM sugieren llamar a las referencias', () => {
  const U = require('../app/cuenta.js');
  test('el «para qué» de las referencias (lo que declara la ficha de Play) es el de la política', () => {
    const refs = U.CAMPOS.filter(c => c.grupo === 'referencias' && /_nombre$/.test(c.id));
    assert.equal(refs.length, 2);
    refs.forEach(c => {
      assert.equal(/si no te ubicamos|el día que haga falta|podamos hablar/.test(c.porque), false, c.id + ': «' + c.porque + '»');
      assert.match(c.porque, /al evaluar tu solicitud/, c.id + ' no dice para qué es, como la política');
    });
    assert.match(U.CAMPOS.find(c => c.id === 'ref1_nombre').porque, /Nunca la llamamos para cobrarte/);
    const ficha = leer('PLAY-FICHA.md');
    assert.equal(/si no te ubicamos|el día que haga falta/.test(ficha), false,
      'PLAY-FICHA.md declara que se llama a las referencias: node herramientas/ficha-play.js <su fecha>');
  });
  test('el paso de las referencias no dice que «responden por ti»', () => {
    const titulo = U.GRUPOS.find(g => g.id === 'referencias').titulo;
    assert.equal(titulo, 'Quién te conoce');
    assert.match(leer('play/index.html'), /\{ id: 'referencias', titulo: 'Quién te conoce' \}/, 'play/ dice otra cosa en su lista de pasos');
    assert.equal(/responder por ti/i.test(leer('play/index.html') + leer('app/cuenta.js').replace(/\/\*[\s\S]*?\*\//g, '')), false);
  });
  test('las notas de la revisión del registro no dicen «si algún día hay que llamarla»', () => {
    const R = require('../app/revision-registro.js');
    const fuente = leer('app/revision-registro.js').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/hay que llamarla|llamar a la referencia/.test(fuente), false);
    /* Y lo que de verdad pinta, con una referencia que es el celular de otro
       registrado y otra que es el de un cliente (como en revision-registro.test.js). */
    const reg = { id: 101, origen: 'abierto', estado: 'nuevo', nombre: 'Ana Ruiz', cedula: '1029384274', telefono: '3001112233',
      creado_en: '2026-10-27T15:00:00+00:00',
      datos: { nombres: 'Ana', apellidos: 'Ruiz', documento: '1029384274', celular: '3001112233',
        ref1_nombre: 'Luis', ref1_parentesco: 'Hermano', ref1_celular: '3104445566',
        ref2_nombre: 'Marta', ref2_parentesco: 'Compañera', ref2_celular: '3157778899' } };
    const res = R.revisarRegistro(reg, {
      otros: [{ id: 202, estado: 'nuevo', nombre: 'Pedro Pérez', cedula: '52111222', telefono: '3104445566',
        creado_en: '2026-10-20T14:00:00+00:00', datos: { documento: '52111222', celular: '3104445566' } }],
      cartera: { socios: [{ numero: 40, cedula: '79000111', telefono: '3157778899' }] },
      hoy: '2026-10-28' });
    const notas = (res.neutros || []).filter(n => /^ref\d_/.test(n.clave)).map(n => n.texto);
    assert.equal(notas.length, 2, 'la prueba no prueba nada: no salieron las dos notas de las referencias');
    notas.forEach(t => assert.equal(MANDA_A_REFERENCIAS.test(t) || /llamarla/.test(t), false, '«' + t + '»'));
  });
});
