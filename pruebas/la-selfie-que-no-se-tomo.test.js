'use strict';
/* ==========================================================================
 * LA SELFIE QUE NO SE TOMÓ SE DICE — 22-oct-2026
 *
 *   node --test pruebas/la-selfie-que-no-se-tomo.test.js
 *
 * Joan: «William se registró y se tomó la selfie pero no me aparece en mi
 * CRM: revisemos cuál es el bug y corrige para que no vuelva a pasar».
 *
 * La base guardó todo lo que recibió y el CRM mostraba todo lo que había: la
 * selfie NUNCA SALIÓ DEL TELÉFONO. Una sola subida, con las dos caras de la
 * cédula y el GPS, sin rechazo. «Tu rostro» lo dejó seguir sin foto y sin
 * avisarle (C1: el botón grande decía «Continuar»; C2: «Repetir la foto»
 * borraba la que tenía antes de tener la nueva), le pidió la ubicación al
 * seguir —y él creyó que la foto ya estaba— y al final su cuenta le dijo
 * «Listo: tus fotos llegaron».
 *
 * Lo que se prueba, en el teléfono:
 *   T1. sin la selfie, el botón grande dice «Seguir sin la foto», y el primer
 *       toque avisa (sin pedir la ubicación); el segundo, o «Seguir sin ella»,
 *       pasa y deja anotado QUÉ hizo (sin ninguna foto);
 *   T2. «Repetir la foto» no borra a ciegas: si sigue sin la nueva, se le
 *       ofrece «Usar mi foto anterior», y no se sube sola;
 *   T5. la pantalla final nombra lo que NO llegó, y la cuenta lo recuerda;
 *   B1. lo que la base dice que no guardó (`rechazadas`) no se reintenta a
 *       ciegas y se dice.
 * Todas FALLAN con la página de ab6b595 (y con la publicada, 8323fc0).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

const aviso = P => B.texto(P.ev("(document.getElementById('avisoFotos') || {}).innerHTML || ''"));
const subidas = P => JSON.parse(P.ev('JSON.stringify(window.__llamadas.filter(function (x) { return /registro_archivos_guardar/.test(x.url); }))'));

/* María con su cédula escaneada, hasta «Tu rostro», con el GPS listo para contestar. */
function mariaHastaElRostro(P) {
  B.escanear(P, B.MARIA, 'MARIA');
  B.casillas(P, 'identidad', { expedicion: B.DATOS_MARIA.expedicion });
  P.ev('siguientePaso()');
  B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
  assert.equal(B.pasoActual(P), 'rostro', 'María no llegó a «Tu rostro»: ' + B.texto(B.caja(P)));
  P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
}
/* Del paso de contacto al último, con las dos casillas marcadas. */
function hastaElPermiso(P) {
  assert.equal(B.pasoActual(P), 'contacto');
  B.casillas(P, 'contacto', B.CONTACTO_MARIA);
  ['correo', 'celular2'].forEach(k => P.ev("anotarCampo($('f_" + k + "'))"));
  P.ev('Object.assign(REGISTRO, ' + JSON.stringify(B.RESTO) + '); guardarBorrador(REGISTRO);');
  P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
}
const errReg = P => B.texto(P.elems.errReg ? P.elems.errReg.innerHTML : '');

describe('T1 — sin la selfie, el «Continuar» de «Tu rostro» avisa una vez', () => {

  test('el botón grande dice «Seguir sin la foto», y el primer toque avisa sin pedir la ubicación', () => {
    const P = B.abrir();
    mariaHastaElRostro(P);
    assert.match(B.cuerpo(P), /id="btnSeguir"[^>]*>Seguir sin la foto</, 'el botón grande dice «Continuar» sin la foto: así se la saltó William');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'rostro', 'el primer «Continuar» sin la foto pasó sin avisar');
    const dice = errReg(P);
    assert.match(dice, /Todavía no tenemos la foto de tu cara/);
    assert.match(dice, /tu cuenta se abre igual/);
    assert.ok(B.boton(P.elems.errReg.innerHTML, 'Tomar la foto ahora'), 'el aviso no ofrece tomarla');
    assert.ok(B.boton(P.elems.errReg.innerHTML, 'Seguir sin ella'), 'el aviso no ofrece seguir sin ella');
    assert.equal(B.boton(P.elems.errReg.innerHTML, 'Usar mi foto anterior'), null, 'ofrece una foto anterior que no existe');
    assert.equal(P.ev('!!FOTOS.gps'), false, 'el toque que avisa pidió la ubicación: así creyó William que la foto ya estaba');
  });

  test('«Seguir sin ella» pasa, pide la ubicación y deja anotado QUÉ hizo (sin ninguna foto)', () => {
    const P = B.abrir();
    mariaHastaElRostro(P);
    P.ev('siguientePaso()');
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Seguir sin ella'));
    assert.equal(B.pasoActual(P), 'contacto');
    assert.equal(P.ev('!!FOTOS.gps'), true, 'al seguir sin la selfie no se pidió la ubicación que autorizó');
    const m = JSON.parse(P.ev('JSON.stringify(FOTOS.selfie_omitida)'));
    assert.equal(m.motivo, 'siguio_sin_ella');
    assert.deepEqual(Object.keys(m).sort(), ['motivo', 't'], 'la marca lleva algo más que el motivo y la hora');
  });

  test('el segundo «Continuar» también pasa (como el lado de la cédula que falta)', () => {
    const P = B.abrir();
    mariaHastaElRostro(P);
    P.ev('siguientePaso()'); P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto');
  });

  test('con la selfie tomada, el botón vuelve a «Continuar» y pasa de una', () => {
    const P = B.abrir();
    mariaHastaElRostro(P);
    P.ev('siguientePaso()');   // el aviso
    B.selfie(P, 'MARIA');
    assert.equal(P.ev("$('btnSeguir').textContent"), 'Continuar', 'con la foto tomada el botón sigue diciendo «Seguir sin la foto»');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto');
    assert.equal(P.ev('FOTOS.selfie_omitida'), undefined, 'quedó anotado que siguió sin la foto que sí tomó');
  });

  test('sin la autorización de las fotos no se avisa nada: el paso se salta como siempre', () => {
    const P = B.abrir();
    B.tocar(P, 'Prefiero escribir mis datos');
    B.casillas(P, 'identidad', B.DATOS_MARIA);
    P.ev('siguientePaso()');
    B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.equal(B.pasoActual(P), 'rostro');
    assert.equal(/Seguir sin la foto/.test(B.cuerpo(P)), false, 'sin permiso de fotos no hay foto que saltarse');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto');
  });
});

describe('T2 — «Repetir la foto» no borra a ciegas', () => {

  test('repitió y siguió sin la nueva: se le ofrece la anterior, y vuelve solo si la elige', () => {
    const P = B.abrir();
    mariaHastaElRostro(P);
    B.selfie(P, 'MARIA');
    P.ev('repetirRostro()');
    assert.equal(P.ev('FOTOS.selfie'), undefined, '«Repetir» dejó la anterior como si fuera la nueva');
    assert.equal(P.ev("$('btnSeguir').textContent"), 'Seguir sin la foto');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'rostro', 'siguió sin foto después de «Repetir» sin avisarle (C2)');
    assert.match(errReg(P), /Tocaste «Repetir la foto» y la nueva no se ha tomado/);
    const usar = B.boton(P.elems.errReg.innerHTML, 'Usar mi foto anterior');
    assert.ok(usar, 'no le ofrece la foto que ya tenía');
    /* La anterior vive solo en la memoria de la página: nada en el teléfono. */
    assert.equal(/CARA_MARIA/.test(JSON.stringify(P.almacen)), false, 'la foto que «Repetir» quitó se quedó guardada en el teléfono');
    P.ev(usar);
    assert.equal(P.ev('FOTOS.selfie'), 'data:image/jpeg;base64,CARA_MARIA');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto');
  });

  test('repitió y eligió seguir sin ella: la anterior NO se sube, y el motivo lo dice', () => {
    const P = B.abrir();
    mariaHastaElRostro(P);
    B.selfie(P, 'MARIA');
    P.ev('repetirRostro()');
    P.ev('siguientePaso()');
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Seguir sin ella'));
    assert.equal(B.pasoActual(P), 'contacto');
    assert.equal(P.ev('FOTOS.selfie'), undefined, '«Seguir sin ella» subió la foto que la persona quiso repetir');
    assert.equal(P.ev('FOTOS.selfie_omitida.motivo'), 'repitio_y_siguio');
  });
});

describe('T5 — la pantalla final nombra lo que no llegó', () => {

  async function mariaSinSelfie(resp) {
    const P = B.abrir();
    B.nube(P);
    if (resp) P.ev('window.__resp = [[/registro_archivos_guardar/, ' + JSON.stringify(resp) + ']];');
    mariaHastaElRostro(P);
    P.ev('siguientePaso()');
    P.ev('seguirSinSelfie()');
    hastaElPermiso(P);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    return P;
  }

  test('sin la foto de su cara: «Tu cédula llegó, pero no se tomó la foto de tu cara», nunca «tus fotos llegaron»', async () => {
    const P = await mariaSinSelfie();
    const s = subidas(P);
    assert.equal(s.length, 1);
    assert.equal(s[0].cuerpo.p_archivos.selfie, undefined);
    assert.ok(s[0].cuerpo.p_archivos.cedula_frente && s[0].cuerpo.p_archivos.cedula_reverso);
    assert.deepEqual(s[0].cuerpo.p_huella.selfie_omitida, { motivo: 'siguio_sin_ella' },
      'la subida no lleva qué hizo (para que el CRM no tenga que adivinar)');
    const dice = aviso(P);
    assert.equal(/tus fotos llegaron/.test(dice), false, 'le dijo «tus fotos llegaron» sin la foto de su cara: es lo que vio William');
    assert.match(dice, /Tu cédula llegó, pero no se tomó la foto de tu cara/);
    assert.match(dice, /chat de Servicio/);
    /* Y su cuenta lo recuerda hasta que lo lea. */
    P.ev('pintarCuenta()');
    await B.asentar(10);
    assert.match(aviso(P), /no se tomó la foto de tu cara/, 'la cuenta se olvidó de que falta la foto de su cara');
    assert.ok(B.boton(P.ev("document.getElementById('avisoFotos').innerHTML"), 'Entendido'));
    P.ev('entendidoAvisoDeFotos()');
    assert.equal(aviso(P), '');
  });

  test('con todas sus fotos sigue diciendo «Listo: tus fotos llegaron»', async () => {
    const P = B.abrir();
    B.nube(P);
    B.mariaHastaElPermiso(P, true);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(20);
    assert.match(aviso(P), /Listo: tus fotos llegaron/);
    assert.equal(subidas(P)[0].cuerpo.p_huella.selfie_omitida, undefined, 'la subida dice que siguió sin la foto que sí tomó');
  });

  test('B1 — la base dice que NO guardó la selfie: no se reintenta a ciegas y se dice', async () => {
    const P = B.abrir();
    B.nube(P);
    P.ev("window.__resp = [[/registro_archivos_guardar/, { ok: true, fotos: 2, guardados: ['cedula_frente', 'cedula_reverso'], descartados: [], " +
      "rechazadas: [{ tipo: 'selfie', motivo: 'muy_grande' }] }]];");
    B.mariaHastaElPermiso(P, true);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(20);
    assert.equal(P.ev('colaDe(' + JSON.stringify(B.CEL_MARIA) + ')'), null,
      'la selfie que la base rechazó se quedó en la cola para reintentarla cada vez que entra, sin decir nada');
    const dice = aviso(P);
    assert.equal(/tus fotos llegaron/.test(dice), false);
    assert.match(dice, /la foto de tu cara no la pudimos guardar/);
    const nota = JSON.parse(P.ev('JSON.stringify(leerSubida())'));
    assert.deepEqual(nota.rechazadas, ['selfie']);
  });

  test('la base de antes (sin `rechazadas`) que no guarda la selfie: se queda en la cola y se reintenta, como siempre', async () => {
    const P = B.abrir();
    B.nube(P);
    P.ev("window.__resp = [[/registro_archivos_guardar/, { ok: true, fotos: 2, guardados: ['cedula_frente', 'cedula_reverso'], descartados: [] }]];");
    B.mariaHastaElPermiso(P, true);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(20);
    const cola = JSON.parse(P.ev('JSON.stringify(colaDe(' + JSON.stringify(B.CEL_MARIA) + '))'));
    assert.ok(cola && cola.selfie, 'la selfie que no entró se perdió del teléfono sin que la base dijera por qué');
    assert.match(aviso(P), /no alcanzaron a subir/);
  });
});
