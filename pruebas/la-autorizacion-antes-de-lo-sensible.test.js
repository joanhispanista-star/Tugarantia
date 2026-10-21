'use strict';
/* ==========================================================================
 * LA CONSTANCIA DE LA AUTORIZACIÓN, ANTES DE LO SENSIBLE — 21-oct-2026 (H4)
 *
 *   node --test pruebas/la-autorizacion-antes-de-lo-sensible.test.js
 *
 * La verificación de f1bcfde lo confirmó en el teléfono y en la base (y el
 * camino de la misma contraseña ya existía en main): Ana abrió su cuenta el
 * 10-sep escribiendo sus datos a mano, sin autorizar fotos; su cuenta guarda
 * {version 2026-08-11, sensibles:false}. El 21-oct vuelve, escanea su cédula,
 * se toma la selfie, da la ubicación y marca la casilla de datos sensibles.
 * El signup —la ÚNICA llamada que llevaba la autorización— contesta 422 «ya
 * existe» y GoTrue no toca la cuenta; la entrada y registro_archivos_guardar
 * no la llevan. La base acaba con su cédula, su cara y su ubicación, y la
 * única constancia dice sensibles:false y nombra a otro responsable (Ley
 * 1581, art. 6, 9 y 17-b). Lo mismo por «Entrar y terminar mi registro».
 *
 * Aquí: con el signup en 422 y la entrada buena, sale la constancia de ESTE
 * registro (PUT /auth/v1/user, data.autorizacion con sensibles:true, y el
 * historial sin borrar la vieja) ANTES de registro_archivos_guardar, por las
 * dos puertas; si no se puede guardar, no se sube nada y se dice la verdad; y
 * si la base rechaza por falta de autorización, la pantalla dice eso. La reja
 * de la base se prueba en la-autorizacion-antes-de-lo-sensible-postgres.test.js.
 * Todas FALLAN con la página de f1bcfde.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');
const U = require('../app/cuenta.js');

const VIEJA = { version: '2026-08-11', momento: '2026-09-10T15:00:00.000Z', general: true, sensibles: false };
const OTRA_CLAVE = 'LaDeMiCuenta.1';
const llamadasDe = P => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
const posicion = (ll, re, metodo) => ll.findIndex(x => re.test(x.url) && (!metodo || x.metodo === metodo));
const constancias = ll => ll.filter(x => /\/auth\/v1\/user/.test(x.url) && x.metodo === 'PUT');

/* María, que YA tenía cuenta (con la constancia vieja), hace su registro con
   la cédula, la selfie y la ubicación, y toca «Abrir mi cuenta». */
async function yaTeniaCuenta(claveDeSuCuenta, opc) {
  const P = B.abrir(opc);
  B.nube(P);
  B.cuentaDe(P, B.CORREO_MARIA, claveDeSuCuenta, { telefono: B.CEL_MARIA, autorizacion: VIEJA });
  B.mariaHastaElPermiso(P, true);
  B.tocar(P, 'Abrir mi cuenta');
  await B.asentar(20);
  return P;
}
function laConstanciaVaAntes(P, puerta) {
  const ll = llamadasDe(P);
  const c = constancias(ll);
  assert.equal(c.length, 1, puerta + ': no salió la constancia de la autorización de este registro (PUT /auth/v1/user)');
  const a = c[0].cuerpo && c[0].cuerpo.data;
  assert.ok(a && a.autorizacion, puerta + ': la constancia no lleva la autorización');
  assert.equal(a.autorizacion.sensibles, true, puerta + ': la constancia no dice que autorizó los datos sensibles');
  assert.equal(a.autorizacion.general, true);
  assert.equal(a.autorizacion.version, U.VERSION_AUTORIZACION, puerta + ': la constancia no es la de la política de hoy');
  assert.deepEqual(a.autorizaciones.slice(0, 1), [VIEJA], puerta + ': la constancia borró la autorización anterior');
  assert.deepEqual(a.autorizaciones[a.autorizaciones.length - 1], a.autorizacion);
  assert.match(c[0].auth, /^Bearer tok-573001112233@tugarantia\.net/, puerta + ': la constancia no salió con la sesión que acaba de entrar');
  const iC = posicion(ll, /\/auth\/v1\/user/, 'PUT'), iS = posicion(ll, /registro_archivos_guardar/);
  assert.ok(iS > iC, puerta + ': la cédula subió ANTES de guardar la constancia (o no subió): ' +
    ll.map(x => x.url.replace(/.*\/(rpc|v1)\//, '') + (x.metodo === 'PUT' ? ':PUT' : '')).join(', '));
  const s = ll[iS].cuerpo;
  assert.ok(s.p_archivos.cedula_reverso && s.p_archivos.selfie && s.p_huella.gps, puerta + ': no subió lo que autorizó');
  /* Y la cuenta quedó con las dos, la vieja y la de hoy. */
  const meta = JSON.parse(P.ev('JSON.stringify(window.__cuentas[' + JSON.stringify(B.CORREO_MARIA) + '].meta)'));
  assert.equal(meta.autorizacion.sensibles, true);
  assert.equal(meta.autorizaciones.length, 2);
  assert.equal(P.ev('VISTA'), 'listo');
}

describe('H4 — «ya tenías cuenta»: la constancia de este registro se guarda antes de subir lo sensible', () => {

  test('H4 — con la misma contraseña (el signup dice 422 y la entrada abre): la constancia sale antes de registro_archivos_guardar', async () => {
    const P = await yaTeniaCuenta(B.CLAVE_MARIA);
    laConstanciaVaAntes(P, 'la misma contraseña');
  });

  test('H4 — con «Entrar y terminar mi registro»: la autorización sale de las casillas del paso de autorización, antes de subir', async () => {
    const P = await yaTeniaCuenta(OTRA_CLAVE);
    assert.match(B.texto(B.caja(P)), /esa contraseña no es la suya/);
    assert.equal(constancias(llamadasDe(P)).length, 0, 'se guardó una constancia con una entrada que no abrió nada');
    P.ev("$('rClaveCuenta').value = " + JSON.stringify(OTRA_CLAVE) + ';');
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Entrar y terminar mi registro'));
    await B.asentar(20);
    laConstanciaVaAntes(P, '«Entrar y terminar mi registro»');
  });

  test('H4 — «Entrar y terminar» sin la casilla general no entra; sin la de datos sensibles, la constancia lo dice y no sube nada sensible', async () => {
    const P = await yaTeniaCuenta(OTRA_CLAVE);
    P.ev("$('rClaveCuenta').value = " + JSON.stringify(OTRA_CLAVE) + "; $('autGeneral').checked = false;");
    const n0 = llamadasDe(P).length;
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Entrar y terminar mi registro'));
    await B.asentar(20);
    assert.equal(llamadasDe(P).slice(n0).filter(x => /auth\/v1\/token/.test(x.url)).length, 0, 'entró sin la autorización general');
    assert.match(P.elems.ayudaClaveCuenta.textContent, /Autorizo el tratamiento de mis datos personales/);
    P.ev("$('autGeneral').checked = true; $('autSensible').checked = false;");
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Entrar y terminar mi registro'));
    await B.asentar(20);
    const c = constancias(llamadasDe(P));
    assert.equal(c.length, 1);
    assert.equal(c[0].cuerpo.data.autorizacion.sensibles, false, 'la constancia dice que autorizó lo que desmarcó');
    const subidas = llamadasDe(P).filter(x => /registro_archivos_guardar/.test(x.url));
    assert.equal(subidas.length, 0, 'subió la cédula, la cara o la ubicación sin la casilla de datos sensibles');
    assert.equal(P.ev('VISTA'), 'listo');
  });

  test('H4 — si la constancia no se puede guardar, no se sube ni se encola nada sensible, la sesión no se queda, y se dice la verdad', async () => {
    const P = B.abrir();
    B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, { autorizacion: VIEJA });
    P.ev('window.__constanciaFalla = true;');
    B.mariaHastaElPermiso(P, true);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(20);
    const ll = llamadasDe(P);
    assert.equal(constancias(ll).length, 1, 'no intentó guardar la constancia');
    assert.equal(ll.filter(x => /registro_archivos_guardar/.test(x.url)).length, 0, 'subió lo sensible sin constancia');
    assert.equal(P.almacen.play_fotos_cola, undefined, 'encoló lo sensible sin constancia');
    assert.equal(P.ev('SESION'), null, 'se quedó con la sesión sin haber guardado la constancia');
    assert.equal(P.sesion.play_sesion, undefined);
    const dice = B.texto(B.caja(P));
    assert.match(dice, /no pudimos guardar la autorización/);
    assert.match(dice, /no subimos nada/);
    assert.equal(/Listo|quedó abierta/.test(dice), false);
    assert.ok(ll.some(x => /auth\/v1\/logout\?scope=local/.test(x.url)), 'la sesión que no se adoptó quedó abierta en el servidor');
    assert.equal(P.ev('VISTA'), 'registro');
    assert.ok(P.ev('hayContenidoEnFotos()'), 'se perdieron las fotos del registro: no hay con qué volver a intentar');
    /* Con señal, volver a tocar «Abrir mi cuenta» sí termina, con su constancia. */
    P.ev('window.__constanciaFalla = false;');
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'listo');
    const despues = llamadasDe(P);
    assert.ok(posicion(despues, /registro_archivos_guardar/) > despues.map(x => x.metodo).lastIndexOf('PUT'));
  });
});

describe('H4 — la base dice que la cuenta no tiene la autorización', () => {

  test('H4 — «sin_autorizacion» de registro_archivos_guardar se dice tal cual: no se reintenta para siempre ni se culpa a la señal', async () => {
    const lote = { sensibles: true, selfie: 'data:image/jpeg;base64,CARA_ANA',
      de: { celular: B.CEL_MARIA, intento: 'reg-viejo', t: Date.now() - 60000, documento: '52123456' } };
    const P = B.abrir({ hash: '', almacen: { play_fotos_cola: JSON.stringify({ [B.CEL_MARIA]: lote }) } });
    B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, { autorizacion: VIEJA });
    P.ev('window.__resp = [[/registro_archivos_guardar/, { ok: false, motivo: "sin_autorizacion" }]];');
    await B.entrarComo(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.equal(P.ev('VISTA'), 'cuenta');
    const aviso = B.texto(P.elems.avisoFotos.innerHTML);
    assert.match(aviso, /no quedó guardado tu permiso/, 'la cuenta no dice por qué no subieron: ' + aviso);
    assert.equal(/Subirlas ahora|internet|señal/.test(aviso), false, 'ofrece reintentar lo que la base no va a aceptar nunca');
    assert.equal(JSON.parse(P.almacen.play_fotos_cola || '{}')[B.CEL_MARIA], undefined, 'la cara se quedó en el teléfono');
  });
});
