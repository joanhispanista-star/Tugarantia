/* ============================================================================
 * LOS PLAZOS, EN LA GUÍA DE INSTALAR — 23-oct-2026
 *
 *   node --test pruebas/plazos-en-la-guia.test.js
 *
 * Joan: «al momento de mostrar cómo instalar explica que sí hay créditos a
 * meses pero que también tenemos la opción de créditos quincenales o
 * semanales».
 *
 * La frase decidida dice solo lo que existe en motor.js y en el CRM:
 *   «Hay créditos a meses, en cuotas de hasta 6 meses, y también cortos, en un
 *    solo pago: a la quincena o a 8 días.»
 *
 * Lo que cuidan estas pruebas:
 *   1. La frase va en la guía de cada teléfono (app/instalar.js) y en la
 *      sección #instalar de la portada (index.html), igual en las dos.
 *   2. Dentro de otra app no va: ahí lo único que sirve es salir.
 *   3. NUNCA «semanal»: no hay crédito ni cuota semanal en ninguna parte, y lo
 *      anunciado obliga (Ley 1480, art. 29). Tampoco cifras de precio ni
 *      «desde $…» (la propuesta a cuotas exige $1.000.000).
 *   4. Lo que la frase afirma sigue siendo verdad en el motor: las cuotas
 *      llegan hasta 6 meses y el corte es el 15 y el último.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = t => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const plano = h => sinComentarios(String(h)).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const FRASE = 'Hay créditos a meses, en cuotas de hasta 6 meses, y también cortos, en un solo pago: a la quincena o a 8 días.';
const PROHIBIDO = /seman|desde \$|\d\s*%|inter[eé]s|cuota de \$|te prestamos/i;
const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  instagram: 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android (33/13; 450dpi; 1080x2208; samsung; SM-A135M; a13; exynos850; es_US; 640000000)'
};

describe('los plazos en la guía de instalar (23-oct-2026)', () => {

  test('app/instalar.js dice la frase decidida, tal cual', () => {
    const IA = require('../app/instalar.js');
    assert.equal(IA.PLAZOS, FRASE);
    assert.ok(!PROHIBIDO.test(IA.PLAZOS), 'la frase de los plazos dice: ' + (IA.PLAZOS.match(PROHIBIDO) || [])[0]);
  });

  test('va en la guía de cada teléfono y se pinta; dentro de otra app no', () => {
    const IA = require('../app/instalar.js');
    for (const v of ['android_chrome', 'android_samsung', 'android_otro', 'iphone_safari', 'iphone_otro']) {
      const g = IA.guia({ variante: v });
      assert.equal(g.plazos, FRASE, v + ' no dice los plazos');
      assert.ok(plano(IA.tarjetaHTML({ mostrar: true, variante: v }, {})).indexOf(FRASE) >= 0, v + ': la tarjeta no pinta los plazos');
    }
    assert.equal(IA.guia({ variante: 'dentro_de_app', dentroDe: 'instagram' }).plazos, '');
  });

  test('ninguna guía dice «semanal» ni publica precio', () => {
    const IA = require('../app/instalar.js');
    for (const v of IA.VARIANTES) {
      const t = plano(IA.tarjetaHTML({ mostrar: true, variante: v }, { conAviso: true, acciones: { instalar: 'x()', ahoraNo: 'y()', copiar: 'z()', yaLaTengo: 'w()' } }));
      assert.ok(!PROHIBIDO.test(t), v + ' dice: ' + (t.match(PROHIBIDO) || [])[0]);
    }
  });

  test('la portada (index.html) dice la misma frase en #instalar, y no «semanal» ni lo de antes', () => {
    const W = leer('index.html');
    const s = W.slice(W.indexOf('id="instalar"'), W.indexOf('</section>', W.indexOf('id="instalar"')));
    const t = plano(s);
    assert.ok(t.indexOf(FRASE) >= 0, 'la portada no dice los plazos en #instalar');
    assert.ok(!/seman/i.test(plano(W)), 'la portada habla de semanas');
    assert.ok(!/muchos de los nuestros son así de cortos/.test(t), 'quedó la frase de antes');
    /* Sigue diciendo por qué no está en la tienda. */
    assert.match(t, /Google no admite apps de créditos que se paguen en menos de 60 días/);
  });

  test('en la app, la tarjeta de instalar de Entrar dice los plazos', async () => {
    const A = abrirSocio({ ahora: Date.parse('2026-10-23T15:00:00Z'), navegador: { userAgent: UA.chromeAndroid } });
    await asentar();
    assert.ok(plano(A.elem('entrarCuerpo').innerHTML).indexOf(FRASE) >= 0, 'la guía de la app no dice los plazos');
    const B = abrirSocio({ ahora: Date.parse('2026-10-23T15:00:00Z'), navegador: { userAgent: UA.instagram } });
    await asentar();
    assert.ok(plano(B.elem('entrarCuerpo').innerHTML).indexOf(FRASE) < 0, 'dentro de Instagram no hacen falta los plazos');
  });

  test('lo que la frase afirma sigue siendo verdad en el motor', () => {
    const M = require('../app/motor.js');
    /* «cuotas de hasta 6 meses»: el préstamo con garantía llega a 6 meses. */
    assert.equal(M.PLAZO_RESPALDADO_MAX, 6, 'el motor ya no llega a 6 meses: la guía miente');
    /* «a la quincena»: los cortes son el 15 y el último del mes. */
    const fuente = leer('app/motor.js');
    assert.ok(!/seman/i.test(sinComentarios(fuente)), 'el motor ya tiene algo semanal: revisar la frase');
    /* «8 días»: la calculadora del pedido deja pedir 8 días. */
    const CS = leer('app/calculadora-solicitud.js');
    assert.match(CS, /dias:\s*8\b/, 'la calculadora ya no ofrece 8 días');
  });
});
