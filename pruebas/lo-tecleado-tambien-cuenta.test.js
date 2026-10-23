'use strict';
/* ==========================================================================
 * LO TECLEADO TAMBIÉN CUENTA — 21-oct-2026 (I1)
 *
 *   node --test pruebas/lo-tecleado-tambien-cuenta.test.js
 *
 * La verificación de f380a19 lo confirmó con el play/ real (y en main pasaba
 * desde el segundo 0): desde H1 el tope desbloquea y la respuesta que llega
 * tarde se adopta «si nadie hizo otra cosa». Pero escribir otro celular no
 * contaba como «otra cosa»: la generación solo sube con «Continuar», y no
 * salía otro viaje.
 *   · REGISTRO: María toca «Abrir mi cuenta» con señal floja; pasa el tope y
 *     le presta el teléfono a Pedro, que hace lo que la página le ofrece a
 *     otra persona: «Volver» hasta «Tu celular y tu contraseña» y escribe el
 *     suyo (la página ya le dice que el registro empieza de cero). Llegaba el
 *     signup de María: «Listo. Tu cuenta quedó creada», Pedro dentro de la
 *     cuenta nueva de María, y con la marca, dentro de su PlataChat.
 *   · PORTADA: Pedro toca «Entrar», pasa el tope, María escribe SU celular en
 *     la casilla. Llegaba la respuesta de Pedro y María quedaba en la cuenta
 *     de él.
 * Ahora la casilla que muestra otro número que el del toque —también uno a
 * medias— deja atrás el viaje en camino: su respuesta se descarta y su
 * sesión se cierra con scope=local. La casilla se escribe como la escribe el
 * teléfono: con su `oninput` (anotarCelular en el registro, tecleaTel en la
 * portada). Todas FALLAN con la página de f380a19, salvo las de «control».
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');
const U = require('../app/cuenta.js');

const logouts = ll => ll().filter(x => /\/auth\/v1\/logout/.test(x.url));

/* María llena su registro y toca «Abrir mi cuenta»; el signup se queda en
   camino y pasa el tope. */
async function mariaColgadaPasadoElTope(search) {
  const almacen = {}, sesion = {};
  const P = B.abrir({ almacen, sesion, search });
  const ll = B.nube(P);
  B.mariaHastaElPermiso(P, true);
  P.ev('window.__colgar = /auth\\/v1\\/signup/;');
  B.tocar(P, 'Abrir mi cuenta');
  await B.asentar(20);
  assert.equal(B.colgadas(P).length, 1, 'el signup de María no quedó en camino');
  B.pasa(P, 30000);
  assert.match(B.texto(B.caja(P)), /Seguimos esperando/, 'no salió el aviso del tope');
  P.ev('window.__colgar = null;');
  return { P, ll, almacen, sesion };
}
/* Pedro toca «Volver» hasta «Tu celular y tu contraseña». */
function volverHastaElCelular(P) {
  for (let n = 0; B.pasoActual(P) !== 'entrada' && n < 12; n++) {
    const v = B.boton(B.cuerpo(P), 'Volver');
    assert.ok(v, 'en «' + B.pasoActual(P) + '» no hay «Volver» (¿sigue apagado después del tope?)');
    P.ev(v);
  }
  assert.equal(B.pasoActual(P), 'entrada');
}
/* Escribe en la casilla del registro como el teclado: valor y oninput. */
const escribeEnElRegistro = (P, txt) => P.ev("$('rTel').value = " + JSON.stringify(txt) + "; anotarCelular($('rTel'));");
const escribeEnLaPortada = (P, txt) => P.ev("$('inTel').value = " + JSON.stringify(txt) + "; tecleaTel($('inTel'));");

function nadaDeMaria(P, ll, almacen, sesion, donde) {
  assert.notEqual(P.ev('VISTA'), 'listo', donde + ': se adoptó la cuenta de María («Listo. Tu cuenta quedó creada») con el celular de Pedro en la casilla');
  assert.equal(P.ev('SESION'), null, donde + ': la pestaña de Pedro quedó con la sesión de María');
  assert.equal(sesion.play_sesion, undefined, donde + ': la sesión de María quedó en la pestaña');
  assert.equal(almacen.platachat_sesion, undefined, donde + ': PlataChat recibió la sesión de María');
  assert.notEqual(P.ev('location.href'), '../platachat/index.html', donde + ': la pestaña se fue al PlataChat de María');
  assert.equal(/quedó creada|Ahora pide tu crédito/.test(B.texto(B.cuerpo(P))), false, donde + ': la pantalla de Pedro dice que su cuenta quedó creada');
  const cerradas = logouts(ll);
  assert.equal(cerradas.length, 1, donde + ': la sesión de María que llegó tarde no se cerró en el servidor');
  assert.match(cerradas[0].url, /scope=local/, donde + ': se cerró sin scope=local (le cerraría también otras sesiones)');
  assert.match(cerradas[0].auth, /573001112233/, donde + ': se cerró una sesión que no era la que llegó tarde');
}

describe('I1 — en el registro: pasado el tope, Pedro escribe su celular y la respuesta de María ya no es de aquí', () => {

  for (const [nombre, search] of [['Tu Garantía', ''], ['PlataChat', '?marca=platachat']]) {
    test('I1 — ' + nombre + ': Pedro vuelve a «Tu celular» y escribe el suyo; llega el signup de María: no se adopta y se cierra', async () => {
      const { P, ll, almacen, sesion } = await mariaColgadaPasadoElTope(search);
      volverHastaElCelular(P);
      escribeEnElRegistro(P, '310 999 8877');
      assert.equal(P.ev('REGISTRO.celular'), B.CEL_PEDRO);
      B.soltar(P, 0);
      await B.asentar(30);
      nadaDeMaria(P, ll, almacen, sesion, nombre);
      assert.equal(B.pasoActual(P), 'entrada', 'Pedro no sigue donde estaba');
      /* Y la cuenta de María sí existe: ella entra con su celular y su contraseña cuando quiera. */
      assert.ok(P.ev('!!window.__cuentas[' + JSON.stringify(B.CORREO_MARIA) + ']'));
    });
  }

  test('I1 — también con un número a medias: lo que se ve en la casilla ya no es el del toque', async () => {
    const { P, ll, almacen, sesion } = await mariaColgadaPasadoElTope('');
    volverHastaElCelular(P);
    escribeEnElRegistro(P, '310 99');
    assert.equal(P.ev('REGISTRO.celular'), B.CEL_MARIA, 'el borrador cambió con un número a medias');
    B.soltar(P, 0);
    await B.asentar(30);
    nadaDeMaria(P, ll, almacen, sesion, 'a medias');
  });

  test('I1 — volver a escribir el número de María no revive la respuesta vieja; volver a tocar sí termina (entra con la contraseña)', async () => {
    const { P, ll } = await mariaColgadaPasadoElTope('');
    volverHastaElCelular(P);
    escribeEnElRegistro(P, '310 999 8877');
    escribeEnElRegistro(P, U.telefonoBonito(B.CEL_MARIA));
    B.soltar(P, 0);
    await B.asentar(30);
    assert.equal(P.ev('SESION'), null, 'la respuesta vieja se adoptó porque la casilla volvió a decir lo mismo');
    assert.equal(logouts(ll).length, 1);
    /* María sigue: «Continuar» hasta el final y «Abrir mi cuenta» otra vez. */
    P.ev("$('rClave').value = ''; $('rClave2').value = ''; siguientePaso();");
    for (let n = 0; B.pasoActual(P) !== 'permiso' && n < 12; n++) {
      /* Las casillas de cada paso, con lo que ya había escrito (el borrador).
         22-oct-2026 — y la de «Son mías, a mi nombre» marcada, como la pinta
         la página (el banco no lee el `checked` del HTML). */
      P.ev("Object.keys(REGISTRO).forEach(function (k) { if (k !== 'celular') document.getElementById('f_' + k).value = String(REGISTRO[k]); });" +
           " document.getElementById('f_cuentas_mias').checked = REGISTRO.cuentas_mias === 'si'; siguientePaso();");
    }
    assert.equal(B.pasoActual(P), 'permiso', 'María no pudo volver al último paso: ' + B.texto(B.caja(P)));
    P.ev("$('autGeneral').checked = true; $('autSensible').checked = true;");
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no terminó al volver a tocar: ' + B.texto(B.caja(P)));
    assert.match(P.ev('SESION.access_token'), /573001112233/);
  });

  test('I1, control — pasado el tope, si nadie escribe nada, la respuesta llega y se adopta (H1 sigue en pie)', async () => {
    const { P, ll } = await mariaColgadaPasadoElTope('');
    B.soltar(P, 0);
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.match(P.ev('SESION.access_token'), /573001112233/);
    assert.equal(logouts(ll).length, 0);
  });
});

describe('I1 — en la portada: pasado el tope, María escribe su celular y la respuesta de Pedro ya no es de aquí', () => {

  async function pedroColgadoEnLaPortada() {
    const almacen = {}, sesion = {};
    const P = B.abrir({ hash: '', almacen, sesion });
    const ll = B.nube(P);
    B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
    P.ev('pintarEntrar()');
    P.ev('window.__colgar = /grant_type=password/;');
    await B.entrarComo(P, B.CEL_PEDRO, B.CLAVE_PEDRO);
    assert.equal(B.colgadas(P).length, 1, 'el «Entrar» de Pedro no quedó en camino');
    P.ev('window.__colgar = null;');
    return { P, ll, almacen, sesion };
  }

  test('I1 — pasado el tope, María escribe su celular en la casilla; llega la sesión de Pedro: no se adopta y se cierra', async () => {
    const { P, ll, sesion } = await pedroColgadoEnLaPortada();
    B.pasa(P, 30000);
    assert.match(P.elems.errEntrar.textContent, /Seguimos esperando/);
    escribeEnLaPortada(P, U.telefonoBonito(B.CEL_MARIA));
    P.ev("$('inClave').value = 'Maria.Secreta9';");
    B.soltar(P, 0);
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'entrar', 'a María se le abrió la cuenta de Pedro');
    assert.equal(P.ev('SESION'), null);
    assert.equal(sesion.play_sesion, undefined);
    const cerradas = logouts(ll);
    assert.equal(cerradas.length, 1, 'la sesión de Pedro que llegó tarde no se cerró en el servidor');
    assert.match(cerradas[0].url, /scope=local/);
    assert.match(cerradas[0].auth, /573109998877/);
    assert.equal(/Seguimos esperando|Entrando/.test(P.elems.errEntrar.textContent), false,
      'el aviso sigue prometiendo que va a entrar sola con una respuesta que ya no se adopta');
    /* Y María entra a la suya con su «Entrar». */
    P.ev("$('inClave').value = " + JSON.stringify(B.CLAVE_MARIA) + '; entrar();');
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.match(P.ev('SESION.access_token'), /573001112233/);
  });

  test('I1 — antes del tope: escribir otro número suelta el «Entrar» en camino y enciende los botones ya', async () => {
    const { P, ll } = await pedroColgadoEnLaPortada();
    assert.equal(P.ev('viajando()'), true);
    escribeEnLaPortada(P, '300 111');
    assert.equal(P.ev('viajando()'), false, 'el «Entrar» de Pedro sigue apagando la portada con otro número en la casilla');
    B.soltar(P, 0);
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'entrar');
    assert.equal(P.ev('SESION'), null);
    assert.equal(logouts(ll).length, 1);
  });

  test('I1, control — escribir el MISMO número (la casilla lo reformatea) no suelta nada: la respuesta se adopta', async () => {
    const { P, ll } = await pedroColgadoEnLaPortada();
    B.pasa(P, 30000);
    escribeEnLaPortada(P, B.CEL_PEDRO);
    B.soltar(P, 0);
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.match(P.ev('SESION.access_token'), /573109998877/);
    assert.equal(logouts(ll).length, 0);
  });
});
