'use strict';
/* ==========================================================================
 * UNA REFERENCIA \1 DENTRO DE UNA E'' DE POSTGRES ES UN ESCAPE OCTAL
 * 22 de septiembre de 2026
 *
 * Costó una migración entera. Se escribió esto:
 *
 *     nueva := regexp_replace(src, '(...)', ... || E'\n    \1', '');
 *
 * y dentro de una cadena `E''` la secuencia `\1` **no es la referencia al grupo
 * capturado**: es un escape OCTAL, o sea el byte 0x01. El reemplazo se comió el
 * texto que había capturado, los paréntesis quedaron descuadrados, y Postgres
 * contestó `42601: mismatched parentheses` señalando una línea que no era la
 * mala — cincuenta líneas más arriba.
 *
 * ---------------------------------------------------------------------------
 * HAY DOS FORMAS CORRECTAS, Y EL MISMO DÍA SE USARON LAS DOS
 *
 *   E'...\\1'        La doble barra dentro de la E produce el `\1` literal.
 *                    Es lo que hace 20260922h, y por eso esa sí se aplicó.
 *   E'...' || '\1'   La referencia FUERA, en una cadena normal.
 *
 * Y una incorrecta: `E'...\1'`. Esta prueba busca exactamente esa.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UNA PRUEBA Y NO UN COMENTARIO
 *
 * Porque el error no sale donde está. Una migración que se pega en el editor
 * de Supabase revienta con un mensaje que apunta a otro sitio, y quien la pegue
 * va a perder la tarde buscando ahí. Esta prueba lo caza en el repo, antes.
 *
 * Y mira lo que se EJECUTA, no la prosa: el comentario que explica este mismo
 * arreglo cita la línea mala, y un centinela que lea comentarios se caza a sí
 * mismo. Pasó tres veces en un solo día.
 * ======================================================================== */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'base');

/* Una cadena E'…' de Postgres, con las comillas dobladas admitidas dentro. */
const E_STRING = /E'(?:[^']|'')*'/g;
/* Una barra + dígito que NO venga precedida de otra barra: `\1` sí, `\\1` no. */
const REFERENCIA_CRUDA = /(?<!\\)\\[1-9]/;

test('ninguna migración mete una referencia \\N dentro de una E-string', () => {
  const archivos = fs.readdirSync(DIR).filter(f => /\.sql$/.test(f));
  assert.ok(archivos.length > 0, 'no hay migraciones: este barrido no mide nada');

  const malas = [];
  archivos.forEach(f => {
    const crudo = fs.readFileSync(path.join(DIR, f), 'utf8');
    const sinComentarios = crudo.replace(/--[^\n]*/g, '');
    (sinComentarios.match(E_STRING) || []).forEach(e => {
      if (REFERENCIA_CRUDA.test(e)) malas.push(f + ' → ' + e.slice(0, 60));
    });
  });

  assert.deepEqual(malas, [],
    'Dentro de una E\'\' de Postgres, \\1 es un escape OCTAL (el byte 0x01), no la ' +
    'referencia al grupo capturado. El reemplazo se come lo capturado y el error ' +
    'sale lejos de donde está. Usa E\'...\\\\1\' (doble barra) o saca la referencia ' +
    'de la E-string: E\'...\' || \'\\1\'.');
});

test('y la forma correcta con doble barra NO se acusa', () => {
  /* Un centinela que grita en falso es un centinela que alguien apaga. Se
     comprueba con las dos formas buenas y la mala, a mano. */
  const prueba = txt => {
    const malas = [];
    (txt.replace(/--[^\n]*/g, '').match(E_STRING) || []).forEach(e => {
      if (REFERENCIA_CRUDA.test(e)) malas.push(e);
    });
    return malas.length;
  };
  assert.equal(prueba("x := E'\\n  \\\\1';"), 0, 'acusa a la forma buena de doble barra');
  assert.equal(prueba("x := E'\\n  ' || '\\1';"), 0, 'acusa a la referencia sacada fuera');
  assert.equal(prueba("x := E'\\n  \\1';"), 1, 'NO caza la forma mala: el barrido no sirve');
});
