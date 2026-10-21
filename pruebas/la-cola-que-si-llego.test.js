'use strict';
/* ==========================================================================
 * LA COLA QUE SÍ LLEGÓ — 21-oct-2026 (I3)
 *
 *   node --test pruebas/la-cola-que-si-llego.test.js
 *
 * La verificación de f380a19 lo confirmó (y lo causó esa misma ronda, H2):
 * María abre su cuenta con fotos, la subida (registro_archivos_guardar) va
 * lenta, y ella toca «Salir» para prestar el teléfono. La base SÍ guarda su
 * cédula, su cara y su ubicación, pero H2 callaba la respuesta entera de una
 * sesión que ya salió, y con ella lo que no pinta nada: soltar la cola y
 * anotar que llegó. La copia se quedaba en el teléfono prestado, y al día
 * siguiente sanearColas la daba por «caducada»: su cuenta le decía «Las fotos
 * de tu registro no alcanzaron a subir… mándanosla por el chat de Servicio»,
 * que es falso y le pide volver a mandar un dato sensible.
 *
 * Ahora la contabilidad corre SIEMPRE con la respuesta, con el celular de la
 * cola (guardarCola, anotarSubida, guardarAvisoDeFotos), y solo lo que pinta
 * se calla si la sesión cambió. Nada de María se pinta en la cuenta de otro.
 * Todas FALLAN con la página de f380a19, salvo la de «control».
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

const aviso = P => B.texto(P.ev("(document.getElementById('avisoFotos') || {}).innerHTML || ''"));
const subidasCon = (P, re) => JSON.parse(P.ev('JSON.stringify(window.__llamadas.filter(function (x) { return /registro_archivos_guardar/.test(x.url) && ' +
  re + '.test(x.auth); }).length)'));

/* María termina su registro con la cédula, la selfie y la ubicación; la
   subida queda en camino. */
async function mariaSubiendo(almacen, sesion) {
  const P = B.abrir({ almacen, sesion });
  B.nube(P);
  B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
  B.mariaHastaElPermiso(P, true);
  P.ev('window.__colgar = /registro_archivos_guardar/;');
  B.tocar(P, 'Abrir mi cuenta');
  await B.asentar(20);
  assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
  assert.equal(B.colgadas(P).length, 1, 'la subida de las fotos no quedó en camino');
  P.ev('window.__colgar = null;');
  P.ev('pintarCuenta()');
  await B.asentar(10);
  return P;
}
/* Otro día en el mismo teléfono (`horas` después), María entra por la portada. */
async function mariaVuelve(almacen, cuentas, horas) {
  const D0 = Date, desfase = horas * 3600e3;
  class Luego extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + desfase); } static now() { return D0.now() + desfase; } }
  const Q = B.abrir({ almacen, sesion: {}, hash: '', Date: Luego });
  B.nube(Q);
  Q.ev('window.__cuentas = ' + cuentas + ';');
  await B.entrarComo(Q, B.CEL_MARIA, B.CLAVE_MARIA);
  assert.equal(Q.ev('VISTA'), 'cuenta');
  return Q;
}

describe('I3 — la subida que llega después de «Salir» suelta la cola de su dueña y no pinta nada en la cuenta de otro', () => {

  test('I3 — María sale sola: la base guarda sus fotos, el teléfono suelta la copia y anota que llegaron', async () => {
    const almacen = {}, sesion = {};
    const P = await mariaSubiendo(almacen, sesion);
    assert.match(aviso(P), /Subiendo las fotos de tu registro/);
    P.ev('salirDeCuenta()');
    await B.asentar(5);
    B.soltar(P, 0);
    await B.asentar(20);
    assert.equal(P.ev('colaDe(' + JSON.stringify(B.CEL_MARIA) + ')'), null,
      'la cédula, la cara y la ubicación de María se quedaron en el teléfono prestado después de llegar a la base');
    assert.equal(/CARA_MARIA|RESPALDO_MARIA|FRENTE_MARIA|4\.711111/.test(JSON.stringify(almacen)), false,
      'algo sensible de María sigue en el almacén del teléfono');
    const nota = JSON.parse(P.ev('JSON.stringify(leerSubida())'));
    assert.ok(nota, 'no quedó nota de la subida');
    assert.equal(nota.estado, 'ok');
    assert.equal(nota.celular, B.CEL_MARIA, 'la nota no es del celular de la cola');
    /* Y al día siguiente su cuenta no le dice que no subieron. */
    const cuentas = P.ev('JSON.stringify(window.__cuentas)');
    const Q = await mariaVuelve(almacen, cuentas, 25);
    assert.equal(/no alcanzaron a subir|mándanosla/.test(aviso(Q)), false,
      'a las 25 h la cuenta de María dice que sus fotos no subieron, y sí subieron: ' + aviso(Q));
    assert.equal(subidasCon(Q, '/573001112233/'), 0, 'se volvieron a subir fotos que ya habían llegado');
  });

  test('I3 — Pedro ya entró cuando llega: la cola de María se suelta, y en la pantalla de Pedro no aparece nada de ella', async () => {
    const almacen = {}, sesion = {};
    const P = await mariaSubiendo(almacen, sesion);
    P.ev('salirDeCuenta()');
    await B.entrarComo(P, B.CEL_PEDRO, B.CLAVE_PEDRO);
    assert.equal(P.ev('VISTA'), 'cuenta', 'Pedro no entró');
    const antes = aviso(P);
    const n0 = P.ev('window.__llamadas.length');
    B.soltar(P, 0);
    await B.asentar(20);
    assert.equal(P.ev('colaDe(' + JSON.stringify(B.CEL_MARIA) + ')'), null, 'la cola de María no se soltó');
    assert.equal(aviso(P), antes, 'la respuesta de la subida de María repintó el aviso de fotos de la cuenta de Pedro');
    assert.equal(/tus fotos llegaron|Subiendo/.test(aviso(P)), false, 'a Pedro se le habla de las fotos de María: ' + aviso(P));
    assert.equal(P.ev('window.__llamadas.slice(' + n0 + ').filter(function (x) { return /573109998877/.test(x.auth) && /rpc/.test(x.url); }).length'), 0,
      'la respuesta de María llamó a la base con el token de Pedro');
    assert.equal(P.ev('SUBIDA_EN_CURSO'), null);
  });

  test('I3 — si la base dice que faltó una, la cola de María se queda con lo que falta (y nada se pinta en la de Pedro)', async () => {
    const almacen = {}, sesion = {};
    const P = await mariaSubiendo(almacen, sesion);
    P.ev('salirDeCuenta()');
    await B.entrarComo(P, B.CEL_PEDRO, B.CLAVE_PEDRO);
    B.soltar(P, 0, { ok: true, guardados: ['cedula_reverso', 'selfie'] });
    await B.asentar(20);
    const queda = JSON.parse(P.ev('JSON.stringify(Object.keys(colaDe(' + JSON.stringify(B.CEL_MARIA) + ') || {}))'));
    assert.ok(queda.indexOf('selfie') < 0 && queda.indexOf('cedula_reverso') < 0, 'lo que ya entró sigue en la cola: ' + queda);
    const nota = JSON.parse(P.ev('JSON.stringify(leerSubida())'));
    assert.equal(nota.estado, 'parcial');
    assert.equal(nota.celular, B.CEL_MARIA);
    assert.equal(/tus fotos|Subiendo/.test(aviso(P)), false);
  });

  test('I3, control — si la respuesta llega antes de «Salir», la cuenta de María lo dice como siempre', async () => {
    const almacen = {}, sesion = {};
    const P = await mariaSubiendo(almacen, sesion);
    B.soltar(P, 0);
    await B.asentar(20);
    assert.equal(P.ev('colaDe(' + JSON.stringify(B.CEL_MARIA) + ')'), null);
    assert.match(aviso(P), /tus fotos llegaron/);
  });
});
