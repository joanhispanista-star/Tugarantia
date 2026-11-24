/* ============================================================================
 * «QUÉ DÍA TE PAGAN»: DIARIO, OTRO, Y LOS DÍAS DEL MES — 24-nov-2026
 *
 * Joan: «en la parte donde indica que dia paga y si el cliente selecciona otro
 * entonses que automaticamente el cliente seleccione la fecha o las fechas en un
 * calendario, tambien deja la opcion semanal o la opcion diaria ya que hay
 * clientes que trabajan en la informalidad al diario».
 *
 * Lo que se cuida aquí:
 *  1. Las cuatro opciones de antes NO cambian de nombre (hay registros guardados
 *     con ellas); «Semanal» ya estaba; entran «Diario» y «Otro».
 *  2. «Otro» solo no dice nada: pide al menos un día del mes.
 *  3. Los días viajan DENTRO del mismo campo («Otro: 5 y 20»). registrar_abierto
 *     guarda como mucho 40 pares y el registro ya manda 39: un campo nuevo sería
 *     el 41, que se bota callado.
 *  4. Tocar «Continuar» no borra los días marcados (la lista dice «Otro»; los
 *     días están en el calendario).
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../app/cuenta.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const CAMPO = U.camposDelGrupo('ingresos').filter(c => c.id === 'dia_pago')[0];
/* Un formulario completo: todos los campos obligatorios con un valor válido. */
function completo(extra) {
  const d = {};
  ['identidad', 'contacto', 'domicilio', 'ingresos', 'referencias'].forEach(g => U.camposDelGrupo(g).forEach(c => {
    if (!c.obligatorio) return;
    d[c.id] = c.tipo === 'opcion' ? c.opciones[0] : c.tipo === 'celular' ? '3001112233' : c.tipo === 'pesos' ? '1500000'
      : c.tipo === 'correo' ? 'persona@correo.com' : c.tipo === 'fecha' ? '2010-05-20' : c.tipo === 'numero' ? '52123456' : 'Texto';
  }));
  return Object.assign(d, extra || {});
}
const erroresDe = datos => U.revisarVinculacion(datos).errores.filter(e => e.id === 'dia_pago').map(e => e.motivo);

describe('el campo', () => {
  test('las cuatro de antes siguen con su nombre; entran «Diario» y «Otro»', () => {
    assert.deepEqual(CAMPO.opciones, ['Quincenal (15 y 30)', 'Mensual, fin de mes', 'Semanal', 'Diario', 'Otro', 'No es fijo']);
    assert.equal(CAMPO.conDias, 'Otro');
    assert.equal(CAMPO.obligatorio, true);
  });

  test('no nace un campo nuevo para los días: van dentro de dia_pago', () => {
    const ids = ['identidad', 'contacto', 'domicilio', 'ingresos', 'referencias'].flatMap(g => U.camposDelGrupo(g).map(c => c.id));
    assert.equal(ids.filter(i => /dia/.test(i)).join(), 'dia_pago');
  });

  test('el control: el formulario de esta prueba pasa completo con una opción de las de siempre', () => {
    const r = U.revisarVinculacion(completo({ dia_pago: 'Quincenal (15 y 30)' }));
    assert.deepEqual(r.faltan, [], 'no le falta nada');
    assert.deepEqual(r.errores, []);
  });
});

describe('los días del mes', () => {
  test('de texto a días y de días a texto, siempre en orden y sin repetir', () => {
    assert.deepEqual(U.diasDePago('Otro: 5, 12 y 20'), [5, 12, 20]);
    assert.deepEqual(U.diasDePago('Otro: 20 y 5'), [5, 20]);
    assert.deepEqual(U.diasDePago('Otro: 7'), [7]);
    assert.deepEqual(U.diasDePago('Otro: 0, 32, 7, 7, x'), [7], 'fuera del 1 al 31, repetidos o letras: no cuentan');
    assert.deepEqual(U.diasDePago('Otro'), []);
    assert.deepEqual(U.diasDePago('Quincenal (15 y 30)'), [], 'solo se leen días de «Otro»');
    assert.deepEqual(U.diasDePago(null), []);
    assert.equal(U.textoDeDias([20, 5, 12, 5]), 'Otro: 5, 12 y 20');
    assert.equal(U.textoDeDias([9]), 'Otro: 9');
    assert.equal(U.textoDeDias([15, 30]), 'Otro: 15 y 30');
    assert.equal(U.textoDeDias([]), 'Otro');
    assert.equal(U.textoDeDias(null), 'Otro');
    for (const t of ['Otro: 1', 'Otro: 1 y 31', 'Otro: 5, 10, 15, 20, 25 y 30']) assert.equal(U.textoDeDias(U.diasDePago(t)), t, 'ida y vuelta: ' + t);
  });

  test('tocar un día lo pone; tocarlo otra vez lo quita', () => {
    assert.equal(U.alternarDiaDePago('Otro', 5), 'Otro: 5');
    assert.equal(U.alternarDiaDePago('Otro: 5', 20), 'Otro: 5 y 20');
    assert.equal(U.alternarDiaDePago('Otro: 5 y 20', 5), 'Otro: 20');
    assert.equal(U.alternarDiaDePago('Otro: 20', 20), 'Otro');
    assert.equal(U.alternarDiaDePago('Otro: 5', 40), 'Otro: 5', 'un día que no existe no cambia nada');
  });

  test('todos los días marcados caben en lo que el servidor guarda por dato (200 letras)', () => {
    const todos = U.textoDeDias(Array.from({ length: 31 }, (_, i) => i + 1));
    assert.ok(todos.length <= 200, todos.length + ' letras');
    assert.equal(U.diasDePago(todos).length, 31);
  });
});

describe('lo que el formulario acepta', () => {
  test('«Diario», «Semanal» y «No es fijo» pasan tal cual', () => {
    for (const v of ['Diario', 'Semanal', 'No es fijo', 'Mensual, fin de mes']) assert.deepEqual(erroresDe(completo({ dia_pago: v })), [], v);
  });

  test('«Otro» solo NO pasa: pide marcar los días', () => {
    assert.deepEqual(erroresDe(completo({ dia_pago: 'Otro' })), ['Marca el día o los días del mes en que te pagan.']);
  });

  test('«Otro» con sus días pasa', () => {
    assert.deepEqual(erroresDe(completo({ dia_pago: 'Otro: 5 y 20' })), []);
    assert.deepEqual(erroresDe(completo({ dia_pago: 'Otro: 28' })), []);
    assert.equal(U.revisarVinculacion(completo({ dia_pago: 'Otro: 5 y 20' })).ok, true);
  });

  test('«Otro» con algo que no es el formato de la casa no pasa', () => {
    for (const v of ['Otro: 40', 'Otro: 20 y 5', 'Otro: cuando me paguen', 'Otro: 5, 5', 'Otro:5']) {
      assert.deepEqual(erroresDe(completo({ dia_pago: v })), ['Marca el día o los días del mes en que te pagan.'], v);
    }
  });

  test('una respuesta que no está en la lista sigue sin pasar', () => {
    assert.deepEqual(erroresDe(completo({ dia_pago: 'Cada mes' })), ['Escoge una de las opciones.']);
  });

  test('vacío sigue faltando: es obligatorio', () => {
    assert.ok(U.revisarVinculacion(completo({ dia_pago: '' })).faltan.some(f => f.id === 'dia_pago'));
  });
});

describe('play/index.html · el calendario', () => {
  const pintado = P => P.ev("pasoCampos('ingresos')");

  test('la lista trae las seis opciones y el calendario nace cerrado', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.dia_pago = ''");
    const h = pintado(P);
    for (const o of CAMPO.opciones) assert.ok(h.includes('<option value="' + o + '"'), 'falta la opción ' + o);
    assert.match(h, /<div class="dias-mes" id="dias_dia_pago" hidden>/);
    assert.equal((h.match(/class="dia-mes"/g) || []).length, 31, 'los 31 días, ninguno marcado');
    assert.match(h, /Marca el día o los días del mes en que te pagan\./);
  });

  test('con «Otro: 5 y 20» guardado, la lista dice «Otro», el calendario sale abierto y los dos días van marcados', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.dia_pago = 'Otro: 5 y 20'");
    const h = pintado(P);
    assert.match(h, /<option value="Otro" selected>Otro<\/option>/);
    assert.match(h, /<div class="dias-mes" id="dias_dia_pago">/, 'sin hidden');
    const marcados = [...h.matchAll(/class="dia-mes on" aria-pressed="true" onclick="marcarDiaDePago\('dia_pago',(\d+),this\)"/g)].map(m => Number(m[1]));
    assert.deepEqual(marcados, [5, 20]);
  });

  test('con una opción de las de siempre, esa sale escogida y el calendario cerrado', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.dia_pago = 'Semanal'");
    const h = pintado(P);
    assert.match(h, /<option value="Semanal" selected>/);
    assert.doesNotMatch(h, /<option value="Otro" selected>/);
    assert.match(h, /id="dias_dia_pago" hidden>/);
  });

  test('marcar días arma el valor y lo deja en el borrador; desmarcar lo quita', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.dia_pago = 'Otro'");
    P.ev("marcarDiaDePago('dia_pago', 20, null); marcarDiaDePago('dia_pago', 5, null)");
    assert.equal(P.ev('REGISTRO.dia_pago'), 'Otro: 5 y 20');
    P.ev("marcarDiaDePago('dia_pago', 20, null)");
    assert.equal(P.ev('REGISTRO.dia_pago'), 'Otro: 5');
  });

  test('escoger «Otro» en la lista abre el calendario; escoger otra lo cierra y deja ese valor', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.dia_pago = ''");
    P.ev("document.getElementById('dias_dia_pago').hidden = true");
    P.ev("anotarCampo({ id: 'f_dia_pago', tagName: 'SELECT', value: 'Otro' })");
    assert.equal(P.ev("document.getElementById('dias_dia_pago').hidden"), false);
    assert.equal(P.ev('REGISTRO.dia_pago'), 'Otro');
    P.ev("marcarDiaDePago('dia_pago', 12, null)");
    P.ev("anotarCampo({ id: 'f_dia_pago', tagName: 'SELECT', value: 'Otro' })");
    assert.equal(P.ev('REGISTRO.dia_pago'), 'Otro: 12', 'volver a tocar «Otro» no borra lo marcado');
    P.ev("anotarCampo({ id: 'f_dia_pago', tagName: 'SELECT', value: 'Diario' })");
    assert.equal(P.ev("document.getElementById('dias_dia_pago').hidden"), true);
    assert.equal(P.ev('REGISTRO.dia_pago'), 'Diario');
  });

  test('«Continuar» NO borra los días: la lista dice «Otro» y el valor conserva «Otro: 5 y 20»', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    assert.match(fuente, /if \(c\.conDias && el && el\.value === c\.conDias\) \{ REGISTRO\[c\.id\] = U\.textoDeDias\(U\.diasDePago\(REGISTRO\[c\.id\]\)\); return; \}/);
  });
});

describe('play/estilo.css · los días se tocan con el dedo', () => {
  const CSS = fs.readFileSync(path.join(RAIZ, 'play', 'estilo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  test('cada día mide 44 px, van siete por fila y el marcado no depende solo de un borde', () => {
    assert.match(CSS, /\.dia-mes\{min-height:44px/);
    assert.match(CSS, /\.dias-mes-g\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
    assert.match(CSS, /\.dia-mes\.on\{background:var\(--laca\);border-color:var\(--laca\);color:var\(--blanco-laca\)\}/);
    assert.match(CSS, /\.dias-mes\[hidden\]\{display:none\}/, 'hidden pierde contra display:grid si no se dice');
  });
});
