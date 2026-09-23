'use strict';
/* ==========================================================================
 * LOS INDICADORES DEL ASESOR — 22 de septiembre de 2026
 *
 * Joan: «que pueda ver con claridad sus propios indicadores».
 *
 * Fase 2 del plan de los roles, y son tres cosas que ya existían a medias:
 *
 * 1. `indicadoresDe()` calculaba quince cifras desde el 15-sep… y **solo las
 *    usaba la vista del GERENTE**. El asesor veía sus números únicamente en la
 *    pantalla de su jefe.
 *
 * 2. La pestaña «Mi plata» explicaba las reglas de comisión perfectamente
 *    —cuánto por traer, cuánto por colocar, cuánto por cobrar, cuánto se
 *    descuenta por una mora de más de veinte días— y **no decía un solo peso
 *    de lo que él llevaba**. Para un comercial, ese es EL indicador.
 *
 * 3. `envios_asesor_hoy()` estaba escrita, concedida, y con un comentario que
 *    explicaba que existía «para que la pantalla lo pueda mostrar ANTES de que
 *    el asesor toque el botón, y no solo cuando ya se le negó»… y **no la
 *    llamaba nadie**.
 *
 * ---------------------------------------------------------------------------
 * Y UN ARREGLO QUE NO ERA DE ESTA FASE. Esta misma tarde se le cambió la FIRMA
 * a `registro_vivo_borrar` para que pidiera el testigo… y el cuerpo nunca lo
 * miró. La prueba que se hizo contra la base real dio «bien» POR LA RAZÓN
 * EQUIVOCADA: comprobaba que después del borrado ajeno se pudiera seguir
 * publicando, y eso pasa igual si la fila se borró — entonces `publicar` crea
 * una nueva y contesta `ok`. Probar que algo corre no es probar que haga lo
 * que dice.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922n_la_plata_del_asesor.sql')
  .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const funcion = nombre => {
  const i = CRM.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
};

describe('el asesor ve sus propios indicadores, no solo su jefe', () => {

  test('hay una tarjeta suya y REUSA la cuenta del gerente', () => {
    /* Si se escribiera otra cuenta, el día que se separen el asesor y su jefe
       estarían mirando cifras distintas de lo mismo — y discutiendo sobre cuál
       vale. Una sola función. */
    const f = funcion('tarjetaComoVasEq');
    assert.match(f, /indicadoresDe\(genteEquipo\(\)/,
      'la tarjeta del asesor calcula sus números por su cuenta en vez de reusar indicadoresDe');
  });

  test('y está puesta en «Hoy», que es lo que abre al llegar', () => {
    assert.match(funcion('vistaTableroEquipo'), /\$\{tarjetaComoVasEq\(\)\}/,
      'la tarjeta existe pero no se pinta en ninguna parte');
  });

  test('sus cifras se pueden tocar, igual que las del gerente', () => {
    /* Un indicador que no se puede abrir es un número que nadie usa: «21 sin
       tocar» tiene que llevar a esos 21. */
    const f = funcion('tarjetaComoVasEq');
    assert.match(f, /cifraEq\(i\.sinTocar, [^,]+, 'sintocar'/,
      'las cifras del asesor no llevan a su gente');
  });

  test('y un asesor filtra por SU celular, no por el de nadie', () => {
    const f = funcion('tarjetaComoVasEq');
    assert.match(f, /esGerenteEq\(\) \? '' : \(CARTERA_EQUIPO\.yo \|\| \{\}\)\.celular/,
      'el filtro no distingue asesor de gerente: uno de los dos vería la lista equivocada');
  });

  test('cuando no se pudo traer la agenda, lo dice en vez de mentir con un 0', () => {
    assert.match(funcion('tarjetaComoVasEq'), /No<\/b> quiere decir\s*que no tengas/,
      'las citas saldrían en «—» sin explicar que no es lo mismo que no tener');
  });
});

describe('«Mi plata» dice por fin cuánta plata', () => {

  test('la tarjeta del saldo existe y va ARRIBA de las reglas', () => {
    assert.ok(CRM.indexOf('function tarjetaMiSaldoEq') > 0, 'no hay tarjeta de saldo');
    const v = funcion('vistaPlataEq');
    assert.match(v, /tarjetaMiSaldoEq\(\)/, 'la tarjeta no se pinta');
    assert.ok(v.indexOf('tarjetaMiSaldoEq()') < v.indexOf('Por vender'),
      'lo que lleva ganado sale DEBAJO de la tabla de reglas: es al revés');
  });

  test('las tres bolsas van separadas, no sumadas en una', () => {
    /* Mezclarlas sería prometerle plata que todavía no es suya. */
    const f = funcion('tarjetaMiSaldoEq');
    assert.match(f, /puedes cobrar ya/, 'no se distingue lo libre');
    assert.match(f, /cuando te paguen/, 'no se distingue lo bloqueado, que es la mitad del diseño');
    assert.match(f, /descontado por mora/, 'no se ve lo que se fue por mora');
  });

  test('si el CRM todavía no lo publicó, lo dice — no escribe «$0»', () => {
    /* `null` NO es cero. Decirle «llevas $0» a quien lleva trescientos mil es
       peor que no decirle nada. */
    const f = funcion('tarjetaMiSaldoEq');
    assert.match(f, /yo\.com_ganado == null && yo\.com_libre == null/,
      'un truthy dejaría que un saldo legítimo de 0 se leyera como «no lo sé»');
    assert.match(f, /Todavía no sé cuánto llevas/);
  });

  test('y dice de cuándo son las cuentas', () => {
    /* Es una foto, igual que los saldos de los clientes. Un asesor que lee
       «llevas $320.000» de hace una semana y cuenta con esa plata es un
       problema que se arregla diciendo la fecha. */
    assert.match(funcion('tarjetaMiSaldoEq'), /com_al_dia_de/,
      'no se dice cuándo se calculó: el asesor contaría con una cifra vieja');
  });

  test('la deuda no se esconde en un número negativo', () => {
    /* Quitarle plata que ya está en su bolsillo no lo decide una fórmula. */
    assert.match(funcion('tarjetaMiSaldoEq'), /lo decide Joan/,
      'lo que un castigo no alcanzó a cubrir desaparece de la pantalla');
  });
});

describe('el saldo se calcula donde están los datos y viaja hecho', () => {

  test('se publica desde el CRM, con el libro derivado UNA vez', () => {
    /* Si cada fila lo calculara por su cuenta, la suma de la pantalla y la que
       Joan paga podrían separarse — y eso ya pasó doce veces. */
    const f = funcion('publicarEquipoAhora');
    assert.match(f, /const movsCom = hayComisiones\(\) \? movimientosDeComision\(\) : null/,
      'el libro se deriva por fila, o no se deriva');
    assert.match(f, /com_bloqueado: String\(c\.bloqueado\)/,
      'no viaja lo bloqueado, que es la mitad del diseño de Joan');
  });

  test('viajan CINCO NÚMEROS, no el libro', () => {
    /* El libro son centenares de movimientos con `socio_id` adentro: mandarlo
       sería mandar la cartera otra vez por otra puerta. */
    const f = funcion('publicarEquipoAhora');
    assert.equal(/movimientos: /.test(f), false,
      'se está mandando el libro de movimientos: eso es la cartera por otra puerta');
  });

  test('y si comisiones.js no cargó, el publicar NO se cae', () => {
    /* Un <script src> puede no llegar por un service worker viejo. Sin la
       guarda, Joan se queda sin publicar. */
    assert.match(funcion('publicarEquipoAhora'), /hayComisiones\(\) \?/,
      'sin comisiones.js el publicar entero reventaría');
  });

  test('el servidor no las pisa con null', () => {
    assert.match(SQL, /coalesce\(excluded\.com_ganado,\s*equipo\.com_ganado\)/,
      'un publicar viejo dejaría a todo el equipo en cero sin que nadie se entere');
    assert.match(SQL, /FALLO 2 GRAVE: un publicar sin la plata la BORRO/);
  });

  test('un asesor NO ve la plata de un compañero', () => {
    assert.match(SQL, /FALLO 4 GRAVE: un asesor ve a otros/,
      'no se comprueba que la lista del equipo llegue vacía a un asesor');
  });

  test('pero el gerente sí ve la de los suyos: es lo que pidió Joan', () => {
    assert.match(SQL, /FALLO 5: el gerente no ve lo que lleva su asesor/);
  });
});

describe('el tope del día se dice ANTES de escribir el mensaje', () => {

  test('se llama a envios_asesor_hoy, que llevaba días escrita sin usarse', () => {
    assert.match(funcion('cuantosQuedanHoyEq'), /rpcEquipo\('envios_asesor_hoy'\)/);
    assert.match(funcion('mensajearEq'), /cuantosQuedanHoyEq\(\)/,
      'la función existe pero nadie la llama, que es como estaba antes');
  });

  test('y se lee lo que la función DEVUELVE, que es {hoy, tope}', () => {
    /* Leer `j.quedan` no daba un error: daba NaN, y la cifra no se pintaba
       nunca. El aviso habría seguido sin existir después de escribirlo. */
    const f = funcion('cuantosQuedanHoyEq');
    assert.match(f, /Number\(j\.tope\) - Number\(j\.hoy\)/,
      'se lee un campo que la función no devuelve: saldría NaN y no se vería nada');
  });

  test('si la nube no contesta, el envío sigue siendo posible', () => {
    /* Una cifra que no llega no puede impedir un envío que sí se puede hacer. */
    const f = funcion('cuantosQuedanHoyEq');
    assert.match(f, /\.catch\(function \(\)/, 'un fallo al pedir la cifra bloquearía el envío');
    assert.match(f, /if \(!caja\) return;/, 'reventaría si el asesor cierra el modal antes');
  });
});

describe('y el borrado del registro en vivo, arreglado de verdad', () => {

  test('ahora el cuerpo SÍ mira el testigo', () => {
    /* Esta tarde se le cambió la firma y el cuerpo siguió borrando por celular.
       El agujero quedó abierto y la prueba dijo que estaba cerrado. */
    assert.match(SQL, /where celular = cel\s*\n\s*and testigo = coalesce\(p_testigo, ''\)/,
      'registro_vivo_borrar vuelve a borrar sin mirar de quién es la fila');
  });

  test('y se comprueba MIRANDO LA FILA, no preguntándole a la función', () => {
    assert.match(SQL, /FALLO 6 GRAVE: un tercero borro el registro de otro sin el testigo/,
      'no se comprueba el caso que estuvo roto');
    assert.match(SQL, /FALLO 6b: con el testigo bueno NO se pudo borrar/,
      'un arreglo que cierra la puerta buena no es un arreglo');
  });

  test('el centinela lo vigila', () => {
    assert.match(SQL, /registro_vivo_borrar vuelve a borrar sin mirar/);
  });
});
