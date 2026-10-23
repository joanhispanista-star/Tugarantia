/* ============================================================================
 * EL BANCO TOCADO SIN QUERER SE PUEDE SOLTAR — 22 de octubre de 2026
 *
 *   node --test pruebas/el-banco-se-puede-soltar.test.js
 *
 * La revisión adversaria del 22-oct: en el paso «¿Dónde te enviamos la plata?»
 * del registro, quien solo tiene Nequi abre «Banco» a buscarlo (no está: va
 * arriba, aparte) y toca uno. La primera opción del desplegable era «disabled
 * hidden», así que el navegador no lo dejaba volver a «ninguno», y
 * tocoElBanco le exigía una cuenta de banco entera: con su Nequi bueno se
 * quedaba trabado en el paso. Las únicas salidas eran inventar una cuenta
 * (basura que le llega a Joan, y que se le ofrece al aceptar) o «Empezar de
 * cero», que borra el registro entero, cédula escaneada incluida.
 *
 * Ahora la primera opción del registro es «Sin cuenta de banco», se puede
 * elegir, suelta la cuenta ENTERA (tipo y número también), y el error dice
 * por dónde se sale. Al aceptar («Otra cuenta» → «Cuenta de banco») sí hace
 * falta un banco, y ahí sigue «Toca para elegir».
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const CP = require('../app/cuentas-pago.js');
const B = require('./banco-registro.js');

describe('el registro: el banco tocado sin querer se puede soltar', () => {
  const LLAVES = CP.LLAVES_DEL_REGISTRO;
  function hastaLaCuenta() {
    const P = B.abrir();
    P.ev("REGISTRO.celular = '" + B.CEL_MARIA + "'; guardarBorrador(REGISTRO); pintarRegistro(indiceDe('cobro'));");
    assert.equal(B.pasoActual(P), 'cobro');
    return P;
  }
  const escribir = (P, k, v) => P.ev("$('f_" + k + "').value = " + JSON.stringify(v) + "; anotarCuenta($('f_" + k + "'));");
  const banco = (P, v) => P.ev("$('f_banco_codigo').value = " + JSON.stringify(v) + "; anotarBanco($('f_banco_codigo'));");
  const marcarMias = P => P.ev("$('f_cuentas_mias').checked = true; anotarCuenta($('f_cuentas_mias'));");
  const selectBanco = P => (/<select id="f_banco_codigo"[^>]*>([\s\S]*?)<\/select>/.exec(B.cuerpo(P)) || [, ''])[1];

  test('«Banco» empieza en «Sin cuenta de banco», y es una opción que se puede elegir', () => {
    const P = hastaLaCuenta();
    const s = selectBanco(P);
    const primera = (/^<option[^>]*>[^<]*<\/option>/.exec(s) || [''])[0];
    assert.equal(primera, '<option value="" selected>Sin cuenta de banco</option>');
    assert.equal(/disabled|hidden/.test(primera), false, 'la opción vacía no se puede volver a elegir en el navegador');
  });

  test('con su Nequi bueno, toca un banco y un número a medias, vuelve a «Sin cuenta de banco» y pasa', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    banco(P, '1-7');
    escribir(P, 'banco_tipo', 'Ahorros');
    escribir(P, 'banco_numero', '123');
    marcarMias(P);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.caja(P), /en «Banco» elige «Sin cuenta de banco»/, 'el error no dice por dónde se sale');
    banco(P, '');
    assert.equal(P.ev("$('f_banco_numero').value"), '', 'el número a medias se quedó en la casilla');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'referencias', B.texto(B.caja(P)));
    const bor = JSON.parse(P.almacen.play_registro_borrador);
    assert.equal(bor.nequi, B.CEL_MARIA);
    ['banco', 'banco_codigo', 'banco_tipo', 'banco_numero'].forEach(k => assert.ok(!bor[k], k + ' quedó en el borrador: le llega a Joan'));
  });

  test('«Otro» sin nombre, ir a «De qué vives» y volver: sigue pudiendo soltarlo', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    banco(P, 'otro');
    marcarMias(P);
    P.ev("pintarRegistro(indiceDe('ingresos')); pintarRegistro(indiceDe('cobro'));");
    assert.equal(P.ev('REGISTRO.banco_codigo'), 'otro');
    assert.match(selectBanco(P), /<option value="">Sin cuenta de banco<\/option>/);
    P.ev("mismoCelular('nequi')");
    marcarMias(P);
    banco(P, '');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'referencias', B.texto(B.caja(P)));
    LLAVES.filter(k => /^banco/.test(k)).forEach(k => assert.ok(!P.ev('REGISTRO.' + k), k));
  });

  test('sin banco y con un número suelto, el error no manda a elegir lo que ya está elegido: dice que lo borre', () => {
    /* «Sin cuenta de banco» ya está puesto; volver a tocarlo no dispara nada.
       La salida de verdad es borrar el número. */
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    escribir(P, 'banco_numero', '12');
    marcarMias(P);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.caja(P), /borra el número de cuenta/);
    assert.equal(/elige «Sin cuenta de banco»/.test(B.caja(P)), false, 'manda a elegir la opción que ya está puesta');
    escribir(P, 'banco_numero', '');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'referencias', B.texto(B.caja(P)));
  });

  test('al aceptar, «Otra cuenta» → «Cuenta de banco» sigue pidiendo un banco', () => {
    assert.match(CP.opcionesDeBancoHTML(''), /^<option value="" disabled hidden selected>Toca para elegir<\/option>/);
    assert.equal(CP.revisarDestino({ medio: 'banco', banco_codigo: '', banco_tipo: 'Ahorros', numero: '123456789', es_mia: true }).ok, false);
  });
});
