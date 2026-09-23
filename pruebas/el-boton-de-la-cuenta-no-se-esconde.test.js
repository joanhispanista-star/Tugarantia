'use strict';
/* ==========================================================================
 * EL BOTÓN DE LA CUENTA NO SE ESCONDE DE QUIEN LA NECESITA
 * 22 de septiembre de 2026
 *
 * `traerEquipo` marcaba a TODO el que bajaba de la nube con
 * `cuentaCreada: hoyISO()`. Era una suposición: que todo el que está en la nube
 * llegó por `asesor_crear`, que crea el puesto y LUEGO la cuenta.
 *
 * Ese segundo paso puede fallar —el propio CRM tiene una pantalla para ese
 * caso— y entonces el puesto existe sin cuenta. Y el botón «🔑 Crear cuenta»
 * solo se pinta cuando `!p.cuentaCreada`.
 *
 * O sea que la suposición escondía el botón EXACTAMENTE para quien lo
 * necesitaba: esa persona se quedaba sin poder entrar, y Joan sin forma de
 * arreglarlo desde el Panel.
 *
 * Salió al crear un asesor de prueba directo en la nube y mandar a Joan a
 * dárselo de alta: el botón no iba a estar.
 *
 * Lo correcto es no saberlo. Si ya tenía cuenta, el signup contesta «already
 * registered» y el CRM ya sabe qué hacer. Equivocarse enseñando un botón de
 * más no cuesta nada; escondiéndolo, sí.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

const traer = (() => {
  const i = CRM.indexOf('function traerEquipo');
  assert.ok(i > 0, 'no existe traerEquipo');
  return CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
})();

describe('traer del equipo no inventa que hay cuenta', () => {

  test('no se marca cuentaCreada al bajar a alguien', () => {
    assert.equal(/cuentaCreada: hoyISO\(\)/.test(traer), false,
      'vuelve a darse por hecho que quien está en la nube tiene cuenta: el botón ' +
      'de crearla se esconde justo para quien no la tiene');
  });

  test('y el botón sigue saliendo cuando no se sabe', () => {
    assert.match(CRM, /p\.celular && !p\.cuentaCreada/,
      'cambió la condición del botón: hay que revisar que siga apareciendo');
    assert.match(CRM, /Crear cuenta<\/button>/,
      'desapareció el botón de crear cuenta');
  });

  test('y si ya existía, el CRM sabe qué contestar', () => {
    /* Enseñar el botón de más es inofensivo PORQUE este camino existe. Si se
       quitara, el falso positivo pasaría a ser un error crudo. */
    assert.match(CRM, /pantallaCuentaExiste/,
      'sin ese camino, darle al botón sobre alguien que ya tiene cuenta revienta');
    assert.match(CRM, /registered\|already/,
      'no se reconoce la respuesta de «ya está registrado»');
  });
});
