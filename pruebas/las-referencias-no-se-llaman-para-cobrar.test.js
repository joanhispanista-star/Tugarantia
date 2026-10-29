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
