'use strict';
/* ==========================================================================
 * EL OSCURO FORZADO NO SE COME LO CLARO — 23-oct-2026
 *
 *   node --test pruebas/oscuro-forzado.test.js
 *
 * Joan, el 23-oct, desde un Android: «volví a ver los muñecos de baja
 * calidad». La auditoría de ese día (scratchpad auditoria-23/sintesis.md)
 * encontró que los dibujos no habían cambiado, pero sí un hueco: un navegador
 * que OSCURECE LA PÁGINA POR SU CUENTA (Samsung Internet en modo oscuro lo
 * hace de fábrica; Chrome solo con una bandera) no mira nuestros tokens:
 * repinta los fondos. Medido en Chrome sin ventana con la bandera que lo imita:
 *
 *   · la placa «clara y fija» de los muñecos (.gente-esc, play/estilo.css) se
 *     volvía oscura, y con el motor viejo los muñecos salían como siluetas
 *     blancas sin cara;
 *   · la regla del 22-sep («donde se escribe, blanco con letra negra, en los
 *     dos modos», play/index.html) pasaba a #121212: el celular, la
 *     contraseña, el monto y la fecha, negro sobre negro otra vez;
 *   · lo mismo la casilla del monto libre de la calculadora (.cs .cs-libre).
 *
 * El blindaje es color-scheme:only light en las tres reglas. Tiene que ser
 * «only light»: con «light» a secas el navegador vuelve a forzar el oscuro.
 *
 * Y la regla del 22-sep no la vigilaba nadie (grep vacío en pruebas/): acá
 * se exige que siga en blanco #FFFFFF con letra #0C0A0B.
 *
 * Lo que esta prueba NO sabe: si Samsung Internet de verdad respeta
 * color-scheme. Eso se ve en un teléfono, no aquí.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Las declaraciones de UNA regla, sin espacios, para buscar «prop:valor». */
function declaraciones(cuerpo) {
  return cuerpo.replace(/\s+/g, '').toLowerCase();
}

/* «only light» y nada de «light» a secas: la segunda deja que el navegador
   vuelva a oscurecer. */
function exigeSoloClaro(cuerpo, quien) {
  const d = declaraciones(cuerpo);
  const valores = [...d.matchAll(/color-scheme:([^;}]+)/g)].map(m => m[1]);
  assert.ok(valores.length > 0, quien + ': no declara color-scheme; el oscuro forzado la repinta');
  for (const v of valores) {
    assert.equal(v, 'onlylight', quien + ': color-scheme:' + v + ' — tiene que ser «only light»; '
      + 'con «light» a secas el navegador que oscurece la página la vuelve a oscurecer');
  }
}

/* La regla cuyo selector contiene `marca`, en una hoja sin comentarios. */
function reglaCon(hoja, marca) {
  const limpia = sinComentarios(hoja);
  const i = limpia.indexOf(marca);
  assert.ok(i >= 0, 'no encontré la regla «' + marca + '»');
  const abre = limpia.indexOf('{', i);
  const cierra = limpia.indexOf('}', abre);
  return { selector: limpia.slice(i, abre), cuerpo: limpia.slice(abre + 1, cierra) };
}

describe('el oscuro forzado no se come lo claro (23-oct-2026)', () => {
  test('la placa de los muñecos (.gente-esc) es only light', () => {
    const hoja = leer('play/estilo.css');
    const r = reglaCon(hoja, '.gente-esc{');
    exigeSoloClaro(r.cuerpo, 'play/estilo.css .gente-esc');
  });

  test('la regla del 22-sep (donde se escribe) sigue blanca con letra negra y es only light', () => {
    const html = leer('play/index.html');
    /* La regla vive en línea, en el primer <style> de la página, y le gana a
       la de play/estilo.css por ir después. La que importa es la que pinta
       las casillas de teclear de blanco. */
    const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    const limpia = sinComentarios(estilos);
    const re = /(input\[type=text\][^{]*textarea)\s*\{([^}]*)\}/g;
    const reglas = [...limpia.matchAll(re)].filter(m => /background:\s*#FFFFFF/i.test(m[2]));
    assert.equal(reglas.length, 1, 'la regla del 22-sep tiene que estar UNA vez en play/index.html');
    const [, selector, cuerpo] = reglas[0];
    for (const tipo of ['text', 'tel', 'password', 'number', 'email', 'date']) {
      assert.ok(selector.includes('input[type=' + tipo + ']'), 'la regla del 22-sep perdió input[type=' + tipo + ']');
    }
    const d = declaraciones(cuerpo);
    assert.match(d, /(^|;)background:#ffffff(;|$)/, 'donde se escribe: fondo #FFFFFF (regla del 22-sep)');
    assert.match(d, /(^|;)color:#0c0a0b(;|$)/, 'donde se escribe: letra #0C0A0B (regla del 22-sep)');
    exigeSoloClaro(cuerpo, 'play/index.html, regla del 22-sep');
  });

  test('la casilla del monto libre de la calculadora (.cs .cs-libre) es only light', () => {
    /* La hoja de la calculadora va armada en cadenas de JS: se pegan los
       trozos (quitando «' +» y el salto) antes de buscar la regla. */
    const fuente = sinComentarios(leer('app/calculadora-solicitud.js'));
    const pegada = fuente.replace(/'\s*\+\s*'/g, '');
    const r = reglaCon(pegada, '.cs .cs-libre{');
    const d = declaraciones(r.cuerpo);
    assert.match(d, /background:#ffffff/, '.cs-libre: fondo blanco');
    assert.match(d, /color:#0c0a0b/, '.cs-libre: letra #0C0A0B');
    exigeSoloClaro(r.cuerpo, 'app/calculadora-solicitud.js .cs .cs-libre');
  });

  test('el ayudante caza «light» a secas (control: la prueba sí ve la diferencia)', () => {
    assert.throws(() => exigeSoloClaro('background:#fff;color-scheme:light', 'control'), /only light/);
    assert.throws(() => exigeSoloClaro('background:#fff', 'control'), /no declara/);
    assert.doesNotThrow(() => exigeSoloClaro('background:#fff;color-scheme: only light', 'control'));
  });
});
