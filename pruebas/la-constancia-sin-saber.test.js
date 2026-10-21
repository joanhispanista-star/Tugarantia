'use strict';
/* ==========================================================================
 * LA CONSTANCIA SIN SABER — 21-oct-2026 (I4)
 *
 *   node --test pruebas/la-constancia-sin-saber.test.js
 *
 * La verificación de f380a19 lo confirmó (y es código de esa ronda, H4):
 * María ya tenía cuenta, se registra otra vez con su cédula y la misma
 * contraseña, con mala señal. La entrada abre su cuenta y sale el PUT
 * /auth/v1/user con la autorización de ESTE registro: LLEGA, la cuenta la
 * guarda, y la vuelta se cae. guardarLaConstancia resolvía false igual que
 * cuando el servidor dice que no, y la pantalla afirmaba «no pudimos guardar
 * la autorización que nos diste»: falso, sobre la constancia de la Ley 1581,
 * justo lo que el aviso del tope (H1) se cuida de no hacer («todavía no
 * sabemos si…»).
 * Ahora son tres estados: 'guardada', 'rechazada' (el servidor dijo que no) y
 * 'sin_saber' (la petición no volvió). Con 'sin_saber' se dice solo lo que se
 * sabe, y se hace lo mismo que con el no: no se adopta la sesión ni se sube
 * nada. Volver a tocar termina, sin una segunda constancia. Las dos primeras
 * FALLAN con la página de f380a19; la de «control» cuida que el «no» del
 * servidor se siga diciendo como un no.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

const VIEJA = { version: '2026-08-11', momento: '2026-09-10T15:00:00.000Z', general: true, sensibles: false };
const llamadasDe = P => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
const constancias = ll => ll.filter(x => /\/auth\/v1\/user/.test(x.url) && x.metodo === 'PUT');

/* María, que ya tenía cuenta con la constancia vieja, toca «Abrir mi cuenta»;
   `corte` dice qué se pierde del primer PUT: 'vuelta' (llega y la cuenta la
   guarda, la respuesta no vuelve) o 'ida' (no llega). */
async function laVueltaSeCae(corte) {
  const P = B.abrir();
  B.nube(P);
  B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, { telefono: B.CEL_MARIA, autorizacion: VIEJA });
  P.ev(`window.__corte = ${JSON.stringify(corte)}; var __laNube = fetch;
    fetch = function (u, op) {
      if (window.__corte && /auth\\/v1\\/user/.test(String(u)) && op && op.method === 'PUT') {
        var c = window.__corte; window.__corte = null;
        if (c === 'ida') return Promise.reject(new TypeError('Failed to fetch'));
        return __laNube(u, op).then(function () { throw new TypeError('Failed to fetch'); });
      }
      return __laNube(u, op);
    };`);
  B.mariaHastaElPermiso(P, true);
  B.tocar(P, 'Abrir mi cuenta');
  await B.asentar(30);
  return P;
}
const metaDeMaria = P => JSON.parse(P.ev('JSON.stringify(window.__cuentas[' + JSON.stringify(B.CORREO_MARIA) + '].meta)'));

describe('I4 — si no se sabe si la constancia quedó, la pantalla no dice que no quedó', () => {

  test('I4 — la constancia llega y la vuelta se cae: «no pudimos confirmar», nada sube, la sesión no se queda; y volver a tocar termina sin otra constancia', async () => {
    const P = await laVueltaSeCae('vuelta');
    assert.equal(metaDeMaria(P).autorizacion.sensibles, true, 'la prueba no armó el caso: la cuenta no guardó la constancia');
    const dice = B.texto(B.caja(P));
    assert.match(dice, /No pudimos confirmar que quedó guardada la autorización/, 'no dice lo que se sabe: ' + dice);
    assert.equal(/no pudimos guardar la autorización/i.test(dice), false, 'afirma que no se guardó una constancia que sí está en la cuenta: ' + dice);
    assert.match(dice, /no subimos nada/);
    assert.match(dice, /Revisa tu internet y vuelve a tocar «Abrir mi cuenta»/);
    const ll = llamadasDe(P);
    assert.equal(ll.filter(x => /registro_archivos_guardar/.test(x.url)).length, 0, 'subió lo sensible sin confirmar la constancia');
    assert.equal(P.almacen.play_fotos_cola, undefined, 'encoló lo sensible sin confirmar la constancia');
    assert.equal(P.ev('SESION'), null);
    assert.ok(ll.some(x => /auth\/v1\/logout\?scope=local/.test(x.url)), 'la sesión que no se adoptó quedó abierta en el servidor');
    assert.equal(P.ev('VISTA'), 'registro');
    /* Con señal: termina, y la constancia que ya estaba no se pide otra vez. */
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'no terminó al volver a tocar: ' + B.texto(B.caja(P)));
    assert.equal(constancias(llamadasDe(P)).length, 1, 'se guardó la constancia dos veces');
    assert.equal(metaDeMaria(P).autorizaciones.length, 2, 'el historial de la constancia se duplicó');
  });

  test('I4 — y si la petición ni siquiera llegó, se dice lo mismo (no se sabe), y al volver a tocar la constancia sí se guarda', async () => {
    const P = await laVueltaSeCae('ida');
    assert.equal(metaDeMaria(P).autorizacion.sensibles, false);
    const dice = B.texto(B.caja(P));
    assert.match(dice, /No pudimos confirmar que quedó guardada la autorización/);
    assert.equal(/no pudimos guardar la autorización/i.test(dice), false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.equal(metaDeMaria(P).autorizacion.sensibles, true);
  });

  test('I4, control — cuando el servidor contesta que no, se sigue diciendo que no se pudo guardar', async () => {
    const P = B.abrir();
    B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, { autorizacion: VIEJA });
    P.ev('window.__constanciaFalla = true;');
    B.mariaHastaElPermiso(P, true);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    const dice = B.texto(B.caja(P));
    assert.match(dice, /no pudimos guardar la autorización/);
    assert.equal(/No pudimos confirmar/.test(dice), false);
    assert.equal(P.ev('SESION'), null);
  });
});
