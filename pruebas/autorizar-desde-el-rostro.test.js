'use strict';
/* ==========================================================================
 * «PREFIERO ESCRIBIR MIS DATOS» YA NO SE LLEVA LA SELFIE SIN DECIRLO — 23-oct-2026
 *
 *   node --test pruebas/autorizar-desde-el-rostro.test.js
 *
 * Joan, 23-oct-2026: «un cliente de prueba se registró y hay cosas que se
 * rompieron en el registro, ya no aparece para tomar la foto de la selfie».
 *
 * Reproducido en Chrome sin ventana (registro-roto/t6-prefiero.js, sobre
 * publicar-27 y sobre lo publicado v138, igual en los dos): quien en «Tu
 * cédula» toca «Prefiero escribir mis datos» SIN haber tocado «Autorizo y
 * escaneo mi cédula» llega a «Tu rostro» y ve solo «No autorizaste las fotos
 * en el primer paso, así que este paso se salta»: ni cámara, ni «Tomar la
 * foto ahora», ni «Tomar una selfie», ni la ubicación. Es la decisión del
 * 19-oct (la autorización ES el botón del escaneo), no una regresión; lo que
 * faltaba es que la pantalla lo dijera y diera la salida:
 *
 *   1. en el primer paso, «Prefiero escribir mis datos» dice que también
 *      renuncia a la foto de la cara, y que se puede dar después;
 *   2. en «Tu rostro», sin el permiso, un botón para darlo AHÍ, sin volver al
 *      primer paso: «📷 Autorizo y tomo la foto de mi cara» enciende la
 *      cámara, la selfie se toma (sola o con el botón) y la ubicación se pide
 *      después, como siempre.
 *
 * Las de «control» pasan con 19c6264 y están para que el arreglo no toque lo
 * que ya andaba: con «Autorizo y escaneo» tocado, «Tu rostro» sigue igual.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

/* María escribe sus datos a mano (sin tocar «Autorizo») y pasa su celular. */
function mariaEscribeHastaElRostro(P) {
  B.tocar(P, 'Prefiero escribir mis datos');
  B.casillas(P, 'identidad', B.DATOS_MARIA);
  P.ev('siguientePaso()');
  B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
  assert.equal(B.pasoActual(P), 'rostro', 'María no llegó a «Tu rostro»: ' + B.texto(B.caja(P)));
}
const hayVideo = P => /id="camVideo"/.test(B.cuerpo(P));
const hayBotonAutorizo = P => /id="btnAutorizoRostro"/.test(B.cuerpo(P));
const textoCuerpo = P => B.texto(B.cuerpo(P));

describe('1 · El primer paso dice lo que se pierde al escribir', () => {

  test('debajo de «Prefiero escribir mis datos» se dice que tampoco se toma la foto de la cara, y que se puede dar después', () => {
    const P = B.abrir();
    assert.equal(B.pasoActual(P), 'documento');
    const h = B.cuerpo(P);
    assert.match(h, /id="btnEscribirDatos"/);
    /* Lo de siempre se queda (pruebas/la-cedula-primero.test.js lo vigila). */
    assert.match(h, /cédula de extranjería o pasaporte/);
    assert.match(B.texto(h), /ni de la cédula ni de tu cara/, 'no dice que escribir también renuncia a la selfie');
    assert.match(B.texto(h), /«Tu rostro»/, 'no dice dónde se pueden dar después');
  });
});

describe('2 · «Tu rostro» sin el permiso: se puede dar ahí mismo', () => {

  test('sin el permiso no hay cámara (control) y SÍ el botón para autorizar, con su texto honesto', () => {
    const P = B.abrir();
    mariaEscribeHastaElRostro(P);
    assert.equal(P.ev('autorizoEsteIntento()'), false);
    assert.equal(hayVideo(P), false, 'sin permiso se encendió la cámara');
    /* La frase de siempre se queda: pruebas/la-cedula-primero.test.js y
       el-celular-nuevo-empieza-de-cero.test.js la vigilan. */
    assert.match(textoCuerpo(P), /No autorizaste las fotos en el primer paso, así que este paso se salta: tu cuenta se abre igual/);
    assert.ok(hayBotonAutorizo(P), '«Tu rostro» no ofrece autorizar ahí mismo: toca volver al primer paso');
    assert.match(B.cuerpo(P), /onclick="autorizarDesdeElRostro\(\)"[^>]*>📷 Autorizo y tomo la foto de mi cara</);
    const t = textoCuerpo(P);
    assert.match(t, /Autorizo la foto de mi rostro y mi ubicación/, 'el botón no dice QUÉ autoriza (la ubicación se pide después de la selfie)');
    assert.match(t, /sin tu permiso no tomamos ninguna foto/i);
    assert.match(t, /tu cuenta se abre igual/);
    assert.equal(P.ev('GPS_PEDIDO'), false, 'pidió la ubicación sin permiso');
    assert.match(B.cuerpo(P), />Continuar<\/button>/, 'sin la foto y sin permiso, el botón grande no es «Continuar»');
  });

  test('tocar «Autorizo y tomo la foto de mi cara» da el permiso de ESTE intento y enciende la cámara', () => {
    const P = B.abrir();
    mariaEscribeHastaElRostro(P);
    B.tocar(P, '📷 Autorizo y tomo la foto de mi cara');
    assert.equal(B.pasoActual(P), 'rostro', 'se fue del paso');
    assert.equal(P.ev('autorizoEsteIntento()'), true, 'el permiso no quedó');
    assert.equal(P.ev('String(FOTOS.sensibles_intento) === String(REGISTRO.intento)'), true, 'el permiso no es de este intento');
    assert.equal(P.ev('PERMISO_SOLTADO'), false);
    assert.equal(P.ev('sinPermisoEnTodoEsteRegistro()'), false, 'sigue marcado como «nunca autorizó»');
    assert.ok(hayVideo(P), 'no apareció la cámara de la selfie');
    assert.match(B.cuerpo(P), /id="btnCapturar"[^>]*>Tomar la foto ahora</);
    assert.match(B.cuerpo(P), /id="fot_selfie"/);
    assert.equal(hayBotonAutorizo(P), false, 'con el permiso dado sigue ofreciendo autorizar');
    assert.match(B.cuerpo(P), /id="btnSeguir"[^>]*>Seguir sin la foto</, 'el botón grande no dice lo que hace sin la foto');
    /* El escáner arranca como siempre: el temporizador de 50 ms de pintarRegistro. */
    B.pasa(P, 50);
    assert.equal(P.ev('ESCANER.activo'), true, 'el escáner de la cara no arrancó');
    /* Y el permiso sobrevive a la recarga: quedó en el borrador y en las fotos. */
    assert.equal(P.ev('JSON.parse(localStorage.getItem(LLAVE_FOTOS) || "{}").sensibles'), true, 'el permiso no se guardó en el teléfono');
  });

  test('con el permiso dado en «Tu rostro», la selfie se toma y después se pide la ubicación', () => {
    const P = B.abrir();
    mariaEscribeHastaElRostro(P);
    B.tocar(P, '📷 Autorizo y tomo la foto de mi cara');
    B.pasa(P, 50);
    P.ev('window.__gpsDe = { latitude: 4.711111, longitude: -74.072222, accuracy: 12 };');
    B.selfie(P, 'MARIA');
    assert.equal(P.ev("hayFotoLista('selfie')"), true, 'la selfie no quedó');
    assert.equal(P.ev("FOTOS.selfie"), 'data:image/jpeg;base64,CARA_MARIA');
    assert.equal(P.ev('GPS_PEDIDO'), true, 'la ubicación no se pidió después de la selfie');
    assert.equal(P.ev('!!FOTOS.gps'), true, 'la ubicación no quedó');
    /* El botón grande cambia de texto en el DOM (ponerTextoBotonRostro), no en el HTML pintado. */
    assert.equal(P.ev("$('btnSeguir').textContent"), 'Continuar', 'con la foto tomada el botón grande sigue diciendo «Seguir sin la foto»');
  });

  test('tras autorizar en «Tu rostro», volver a «Tu cédula» ofrece el escáner y ya no «Prefiero escribir» (una sola verdad sobre el permiso)', () => {
    const P = B.abrir();
    mariaEscribeHastaElRostro(P);
    B.tocar(P, '📷 Autorizo y tomo la foto de mi cara');
    P.ev("pintarRegistro(indiceDe('documento'))");
    const h = B.cuerpo(P);
    assert.doesNotMatch(h, /id="btnEscribirDatos"/, 'el primer paso sigue sin saber que ya autorizó');
    assert.doesNotMatch(h, /id="btnAutorizoEscaneo"/);
    assert.match(B.texto(h), /Diste tu permiso para las fotos de tu cédula, de tu rostro y tu ubicación/);
  });
});

describe('3 · Control: con «Autorizo y escaneo» tocado en el primer paso, «Tu rostro» sigue igual', () => {

  test('la cámara de la selfie sale sola y no hay botón de autorizar', () => {
    const P = B.abrir();
    B.escanear(P, B.MARIA, 'MARIA');
    B.casillas(P, 'identidad', { expedicion: B.DATOS_MARIA.expedicion });
    P.ev('siguientePaso()');
    B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.equal(B.pasoActual(P), 'rostro');
    assert.ok(hayVideo(P));
    assert.equal(hayBotonAutorizo(P), false);
    assert.doesNotMatch(textoCuerpo(P), /este paso se salta/);
  });

  test('quien no autoriza y toca «Continuar» sigue a «Cómo te contactamos» sin cámara ni ubicación, como siempre', () => {
    const P = B.abrir();
    mariaEscribeHastaElRostro(P);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto');
    assert.equal(P.ev('GPS_PEDIDO'), false);
    assert.equal(P.ev('autorizoEsteIntento()'), false);
  });
});
