'use strict';
/* ==========================================================================
 * EL ENLACE TIENE QUE ABRIR LA PORTADA — 22 de septiembre de 2026
 *
 * Joan, probando con una clienta de verdad: «en la prueba a sofia le aparece
 * desde el link te lleva directo a crear cuenta y no a la pagina de inicio,
 * creo que algo se rompio».
 *
 * NO LO ROMPIÓ NADA DE HOY. La causa llevaba ahí desde el 17-sep y es de las
 * que no se ven leyendo:
 *
 *   pintarRegistro(paso) llama a guardarPaso(PASO) SIEMPRE, incluido el paso 0.
 *
 * Así que bastaba con tocar «Abrir mi cuenta» UNA vez y cerrar para dejar un
 * checkpoint {paso:0} en localStorage. Y el arranque manda al formulario a todo
 * el que tenga un checkpoint fresco, sin mirar en qué paso iba. Durante las 24
 * horas siguientes, CADA visita al enlace caía en el formulario y la persona no
 * volvía a ver la portada. Se lee, con razón, como que el enlace está roto.
 *
 * Y es peor de lo que parece: la portada es donde está «¿Ya abriste tu cuenta?
 * Entra con tu celular y la contraseña». Quien ya tenía cuenta y volvía por el
 * enlace no encontraba por dónde entrar — lo mandaban a registrarse otra vez,
 * y al terminar le decían que ese número ya existe.
 *
 * LA REGLA QUE ESTE ARCHIVO GUARDA: un checkpoint en el paso 0 es «abrió el
 * formulario y no hizo nada». No hay nada que restaurar y no puede secuestrar
 * el enlace. Solo a partir del paso 1 —que es donde está la cámara, el caso
 * para el que se escribió todo esto— se devuelve a la persona a su paso.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');

/* Lo que se ve al abrir: la portada o el formulario. */
const esFormulario = P => /Paso \d+ de/.test(P.elems.cuerpo.innerHTML);
const esPortada = P => /¿Ya abriste tu cuenta\?/.test(P.elems.cuerpo.innerHTML);

/* Alguien que tocó «Abrir mi cuenta», vio el paso 1 y cerró sin escribir nada. */
function soloAbrioElFormulario() {
  const P = abrirPlay({ hash: '' });
  P.ev('pintarRegistro(0)');
  return P;
}

describe('un vistazo al formulario no secuestra el enlace', () => {

  test('EL CASO DE SOFÍA: abrir el formulario y volver por el enlace lleva a la PORTADA', () => {
    const antes = soloAbrioElFormulario();
    /* El mismo teléfono, el mismo localStorage, y el enlace tal como Joan lo
       reparte: sin nada detrás. */
    const P = abrirPlay({ almacen: antes.almacen, sesion: {}, hash: '' });
    assert.ok(esPortada(P),
      'el enlace vuelve a caer en el formulario. Quien solo miró una vez no puede ' +
      'volver a ver la portada en 24 horas, y ahí es donde está «¿Ya abriste tu cuenta?»');
    assert.ok(!esFormulario(P), 'abrió el formulario sin que nadie lo pidiera');
  });

  test('y el que SÍ iba a mitad vuelve a su paso, que es para lo que existe esto', () => {
    const P0 = abrirPlay({ hash: '' });
    P0.ev('pintarRegistro(0)');
    P0.ev("$('rTel').value='3001112233'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x';");
    P0.ev('siguientePaso()');
    /* La relanzada de Android: mismo localStorage, sessionStorage vacío. */
    const P = abrirPlay({ almacen: P0.almacen, sesion: {}, hash: '' });
    assert.ok(esFormulario(P),
      'se perdió el arreglo de la cámara: quien iba a mitad del registro tiene que ' +
      'volver a su paso, no a la portada');
    assert.match(P.elems.cuerpo.innerHTML, /Paso 2 de/,
      'volvió al formulario pero no a su paso');
  });

  test('el enlace CON #registro sigue abriendo el formulario', () => {
    /* Es el enlace que Joan reparte a propósito para que alguien se registre
       de una. Ese camino no se toca. */
    const P = abrirPlay({ hash: '#registro' });
    assert.ok(esFormulario(P), 'el enlace directo al registro dejó de funcionar');
  });

  test('sin nada guardado, la portada', () => {
    const P = abrirPlay({ hash: '' });
    assert.ok(esPortada(P));
  });

  test('lo tecleado en el paso 0 NO se pierde al mandar a la portada', () => {
    /* Es lo que hace que este arreglo no cueste nada: el borrador se guarda por
       tecla, así que la persona ve la portada, toca «Abrir mi cuenta» y
       encuentra su celular ya puesto. Si esto se rompiera, el arreglo sería
       peor que el fallo. */
    const antes = abrirPlay({ hash: '' });
    antes.ev('pintarRegistro(0)');
    antes.ev("anotarCelular({ value: '3001112233' })");

    const P = abrirPlay({ almacen: antes.almacen, sesion: {}, hash: '' });
    assert.ok(esPortada(P), 'no llevó a la portada');
    P.ev('pintarRegistro(0)');
    assert.equal(P.ev('REGISTRO.celular'), '3001112233',
      'se perdió el celular que la persona ya había escrito');
  });
});

describe('la regla, en el código', () => {

  const PLAY = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, '..', 'play', 'index.html'), 'utf8');

  test('hayPasoGuardado exige progreso de verdad', () => {
    const i = PLAY.indexOf('function hayPasoGuardado');
    const cuerpo = PLAY.slice(i, PLAY.indexOf('\n}', i));
    assert.match(cuerpo, /Number\(c\.paso\) > 0/,
      'volvió a contar el paso 0 como un registro interrumpido: eso secuestra el enlace');
  });

  test('y el paso se sigue guardando, que es lo que salva la cámara', () => {
    /* El arreglo NO es dejar de guardar el paso 0: es dejar de OBEDECERLO al
       arrancar. Si alguien «simplifica» quitando el guardarPaso, se rompe la
       vuelta de la cámara, que costó dos intentos arreglar. */
    assert.match(PLAY, /guardarPaso\(PASO\);/,
      'se dejó de guardar el paso: vuelve el fallo de la cámara del 21-sep');
  });
});
