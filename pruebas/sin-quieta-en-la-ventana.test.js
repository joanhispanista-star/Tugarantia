'use strict';
/* ==========================================================================
 * LO QUE DICE EL ESCÁNER DE LA CÉDULA, AL DÍA CON EL LOTE — 26 de octubre de 2026
 *
 * Joan: «no se estabiliza el celular y nunca se queda quieto». Desde
 * lectura-sin-temblor la puerta acepta el temblor de una mano, así que ningún
 * letrero puede pedir «Quieta…»: se pide «Sostenla…» (sin tilde: «sostén» +
 * «la» es llana y termina en vocal, como «ponla» o «tenla»).
 *
 * Primero se tradujeron en la página con una función (b0a618b) porque se
 * creyó que app/escaner-captura.js ya estaba publicado. No lo estaba: es
 * nuevo en v139, ningún teléfono lo tiene en la caché, y los letreros se
 * cambiaron donde viven. Esta prueba sujeta:
 *   1. los letreros de la ventana (ECAP.TEXTO) y de la puerta (EC) no dicen
 *      «Quieta…» ni «Sosténla»;
 *   2. ninguna cadena de la página, de escaner-cedula.js ni de
 *      escaner-captura.js los vuelve a decir;
 *   3. la nota de la cédula gris también le dice la verdad a la amarilla con
 *      el código gastado (la verificación final la vio salir para ella: sus
 *      datos SÍ se leen de las letras);
 *   4. las letras no cruzan un rótulo visto para tomar la FIRMA como nombres
 *      (la verificación final, sobre 4835cc1), y el caso del iPhone que
 *      motivó 4835cc1 (el rótulo «APELLIDOS» perdido) sigue llenando.
 * ========================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const ECAP = require('../app/escaner-captura.js');
const EC = require('../app/escaner-cedula.js');
const O = require('../app/ocr-cedula.js');

test('los letreros de la ventana dicen «Sostenla…», no «Quieta…»', () => {
  const T = ECAP.TEXTO || {};
  ['MIDIENDO', 'LEYENDO', 'TOMANDO'].forEach(k => {
    assert.match(String(T[k]), /^Sostenla… /, 'ECAP.TEXTO.' + k + ' dice: ' + T[k]);
  });
  Object.keys(T).forEach(k => assert.doesNotMatch(String(T[k]), /Quieta…|Sosténla/, 'ECAP.TEXTO.' + k + ': ' + T[k]));
});

test('la puerta dice «Sostenla ahí…» cuando se mueve', () => {
  assert.equal(EC.textoDeTarjeta({ falla: 'movimiento', ok: false }), 'Sostenla ahí…');
});

test('ninguna cadena del escáner pide «Quieta…» ni escribe «Sosténla»', () => {
  ['play/index.html', 'app/escaner-cedula.js', 'app/escaner-captura.js'].forEach(f => {
    // Sin comentarios: los comentarios cuentan la historia y pueden citar «Quieta…».
    const codigo = leer(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
    const malas = codigo.split('\n').filter(l => /['"`][^'"`]*(Quieta…|Sosténla)/.test(l));
    assert.deepEqual(malas, [], f);
  });
});

test('la nota de la cédula gris también le dice la verdad a la amarilla', () => {
  const play = leer('play/index.html');
  const m = play.match(/var TEXTO_CEDULA_NUEVA = ([\s\S]*?);\n/);
  assert.ok(m, 'play/index.html ya no tiene TEXTO_CEDULA_NUEVA');
  // eslint-disable-next-line no-new-func
  const t = new Function('return ' + m[1])();
  assert.match(t, /gris y de plástico/);
  assert.match(t, /escribes tus datos/, 'para la gris sigue siendo verdad: sus datos se escriben');
  assert.match(t, /Si es la amarilla/);
  assert.match(t, /letras/, 'a la amarilla: sus datos se leen de las letras');
});

test('con los dos rótulos a la vista y un valor perdido, las letras no toman la firma', () => {
  const r = O.parsearFrente('REPUBLICA DE COLOMBIA\nNUMERO 52.123.456\nRODRIGUEZ PEREZ\nAPELLIDOS\nNOMBRES\nMaria R');
  assert.equal(r.apellidos, 'RODRIGUEZ PEREZ');
  assert.equal(r.nombres, '', 'tomó la firma como nombres: ' + r.nombres);
  const r2 = O.parsearFrente('NUMERO 52.123.456\nAPELLIDOS\nMARIA JOSE\nNOMBRES');
  assert.equal(r2.apellidos, '', 'con «APELLIDOS» visto y su valor perdido no se adivina: ' + r2.apellidos);
});

test('control: con el rótulo «APELLIDOS» perdido, el valor de al lado sigue llenando (4835cc1)', () => {
  assert.deepEqual(O.parsearFrente('CEDULA DE CIUDADANIA\nNUMERO 52.123.456\nRODRIGUEZ PEREZ\nMARIA JOSE\nNOMBRES\n'),
    { documento: '52123456', apellidos: 'RODRIGUEZ PEREZ', nombres: 'MARIA JOSE' });
});
