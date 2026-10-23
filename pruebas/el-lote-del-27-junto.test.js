'use strict';
/* ==========================================================================
 * EL LOTE DEL 27-OCT, JUNTO — 23-oct-2026
 *
 *   node --test pruebas/el-lote-del-27-junto.test.js
 *
 * publicar-27 junta seis ramas que nacieron por separado: l1-integrado,
 * abono-pactado, nube-sola, rostro-selfie, cuentas-pago y claves-clientes.
 * Cada una pasaba sus pruebas sola. Estas cuidan lo que solo se rompe al
 * juntarlas, y que git no ve porque no es un conflicto de líneas:
 *
 *   1. «CAMBIAR MI CONTRASEÑA» DE PLATACHAT Y LA RECARGA SOLA. claves-clientes
 *      nació de main, antes del lote 1, y su pantalla no decía cuál era
 *      (PANTALLA) ni contaba el cambio como escritura en camino. Con el lote 1
 *      la página se recarga sola en un momento seguro: con la contraseña a
 *      medias, o con el cambio volando, la recarga se lo llevaba.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlataChat, asentar } = require('./banco-platachat.js');

const CEL_MARIA = '3001112233', CLAVE_MARIA = 'Maria.Secreta9';

async function mariaEnPlataChat() {
  const PC = abrirPlataChat();
  await asentar(10);
  await PC.entrarComo(CEL_MARIA, CLAVE_MARIA);
  assert.match(PC.token() || '', /^tok-Maria-/, 'María no entró');
  return PC;
}

/* ======================================================================== */
describe('1 · PlataChat: «Cambiar mi contraseña» con la recarga sola del lote 1', () => {

  test('control: Yo sin nada a medias es momento seguro (la lista blanca de siempre)', async () => {
    const PC = await mariaEnPlataChat();
    PC.ev("irA('yo')");
    assert.equal(PC.ev('PANTALLA'), 'yo');
    assert.equal(PC.ev('momentoSeguroPC()'), true);
  });

  test('la pantalla dice cuál es, y con la contraseña nueva a medias no se recarga encima', async () => {
    /* Antes: PANTALLA seguía diciendo 'yo' (la pestaña de donde vino), y Yo es
       momento seguro: la versión nueva recargaba con «Maria.Nue» escrito y la
       persona volvía a Yo sin saber qué pasó con su contraseña. */
    const PC = await mariaEnPlataChat();
    PC.ev("irA('yo'); pintarCambiarClave()");
    assert.equal(PC.ev('PANTALLA'), 'clave', 'la pantalla de la contraseña no dice cuál es');
    PC.ev("$('ccNueva').value = 'Maria.Nue'");
    assert.equal(PC.ev('momentoSeguroPC()'), false, 'la recarga sola se llevaría la contraseña a medio escribir');
  });

  test('el cambio volando frena la recarga aunque toque «Plata», y al llegar ella ve «Listo»', async () => {
    /* Antes: el PUT de la contraseña no contaba como escritura en camino. Con
       el cambio en el aire, tocar «Plata» (momento seguro) dejaba recargar: la
       contraseña quedaba cambiada o no, y ella nunca veía cuál. */
    const PC = await mariaEnPlataChat();
    PC.st.colgar = /\/auth\/v1\/user$/;
    PC.ev("irA('yo'); pintarCambiarClave(); $('ccNueva').value = 'Maria.Nueva2026'; " +
          "$('ccRepite').value = 'Maria.Nueva2026'; cambiarClave();");
    await asentar(10);
    assert.equal(PC.st.colgadas.length, 1, 'el cambio no salió a /auth/v1/user');
    PC.ev("irA('plata')");
    assert.equal(PC.ev('ocupadoPC()'), true, 'el cambio de contraseña en camino no cuenta como escritura');
    assert.equal(PC.ev('momentoSeguroPC()'), false, 'la recarga sola cortaría el cambio de contraseña');
    PC.suelta(0);
    await asentar(20);
    assert.equal(PC.ev('ocupadoPC()'), false, 'el cambio terminó y la página sigue creyéndolo en camino');
    assert.match(PC.elems.cuerpo.innerHTML, /Listo: tu contraseña quedó cambiada/);
    assert.equal(PC.ev('PANTALLA'), 'clave', '«Listo» se pinta y la página cree que sigue en Plata');
    PC.ev("irA('yo')");
    assert.equal(PC.ev('momentoSeguroPC()'), true, 'control: de vuelta en Yo, sin nada en camino, sí se puede');
  });
});
