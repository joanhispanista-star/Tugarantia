/* ============================================================================
 * EL DATO DE PAGO NO VIAJA EN UN ENLACE DE WHATSAPP — 22 de octubre de 2026
 *
 *   node --test pruebas/el-pago-no-va-en-whatsapp.test.js
 *
 * app/socio.html, «Completa lo que te falta»: todo lo que el socio escribía se
 * mandaba con wa.me, DENTRO de la dirección, y ahí iba también «Tu Nequi o
 * llave». Una dirección queda en el historial del navegador y en el de
 * WhatsApp; un dato de pago no va ahí (regla del 22-oct, con las cuentas del
 * registro). Ahora esa fila dice que se escribe en el chat de la app, y si
 * algo lo dejó escrito, no sale en el mensaje.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');
const P = require('../app/puente.js');

async function laClienta() {
  const dia = '2026-10-22';
  const db = { socios: [{ id: 's1', numero: 1, nombre: 'Clienta Pago', cedula: '52111222', telefono: '3001112233',
                          whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }], prestamos: [], config: { negocio: 'Tu Garantía' } };
  const paquete = P.migrarSocio(db, db.socios[0], dia);
  const ahora = new Date(dia + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000, celular: '3001112233',
    paquete: { nombre: 'Clienta Pago', datos: paquete, actualizado_en: dia + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta');
  A.ev("autorizacionDada = function () { return { general: true, sensibles: true, version: '2026-10-19', fecha: '2026-10-22' }; };");
  return A;
}

describe('«Completa lo que te falta» y el dato de pago', () => {
  test('la fila de «Tu Nequi o llave» no tiene casilla: dice que va por el chat de la app', async () => {
    const A = await laClienta();
    assert.ok(A.ev("M.garantiaPorDatos(S.perfil).faltantes.some(function (d) { return d.id === 'pago'; })"), 'a la clienta no le falta el dato de pago: la prueba no miraría nada');
    A.ev('abrirPerfil()');
    const h = A.elem('cuerpo').innerHTML;
    assert.equal(/data-kyc="pago"/.test(h), false, 'se puede escribir el Nequi para mandarlo por WhatsApp');
    assert.match(h, /Escríbelo en el chat de la app: los datos de pago no van en este mensaje/);
  });

  test('si algo lo dejó escrito, el mensaje de WhatsApp sale sin él', async () => {
    const A = await laClienta();
    A.ev('abrirPerfil()');
    A.ev("NUEVOS = { pago: '3209998877', correo: 'clienta@correo.com' }; mandarPerfil();");
    const abiertos = A.ctx._abiertos || [];
    assert.equal(abiertos.length, 1, 'no abrió WhatsApp');
    assert.match(decodeURIComponent(abiertos[0]), /clienta@correo\.com/);
    assert.equal(/3209998877/.test(decodeURIComponent(abiertos[0])), false, 'el Nequi viajó dentro del enlace');
  });
});
