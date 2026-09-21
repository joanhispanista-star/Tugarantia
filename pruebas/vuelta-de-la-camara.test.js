/* ===========================================================================
 * LA RELANZADA DE ANDROID — 21 de septiembre de 2026
 *
 * Joan, con el arreglo del 17-sep YA PUBLICADO: «el cliente toma la foto de la
 * cédula y la página lo devuelve al primer paso y tiene que ingresar la
 * contraseña otra vez».
 *
 * POR QUÉ EL ARREGLO DEL 17 NO SIRVIÓ EN EL TELÉFONO, confirmado con el código
 * de Chromium: cuando la app de cámara tapa al navegador y Android lo mata por
 * memoria, la pestaña se restaura con su dirección (#registro incluido) pero
 * con un sessionStorage NUEVO — Android nunca lo restaura («Session Storage
 * doesn't support restore», kClearDiskStateOnOpen). El paso, la contraseña en
 * curso y la marca de las fotos vivían ahí. leerPaso() daba 0, y 0 es «Tu
 * celular y tu contraseña». En escritorio funcionaba, porque ahí sí hay un
 * servicio de sesión que lo restaura. Nadie lo probó en un Android.
 *
 * Y dos daños que nadie veía: las fotos ya tomadas no se subían NUNCA (la marca
 * murió; la caja decía «Listo»), y el signup salía con contraseña vacía.
 *
 * LA RELANZADA, EN EL BANCO: abrir la página otra vez con el MISMO localStorage,
 * un sessionStorage VACÍO, y con o sin el hash (los dos caminos de vuelta).
 * pruebas/foto-cedula-no-tumba.test.js prueba la recarga con sessionStorage
 * intacto; esta prueba es la que faltaba.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');

const PLAY = fs.readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Como quien acaba de poner su celular y su contraseña y va a tomar la foto. */
function aMitadDelRegistro() {
  const P = abrirPlay({ hash: '' });
  P.ev('pintarRegistro(0)');
  P.ev("$('rTel').value='3001112233'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x';");
  P.ev('siguientePaso()');
  return P;
}
/* Y esto es la relanzada: el mismo teléfono, el mismo localStorage, el
   sessionStorage vacío. `hash` es lo que Android alcanzó a restaurar. */
const relanzar = (P, hash) => abrirPlay({ almacen: P.almacen, sesion: {}, hash: hash || '' });
const paso = P => { const m = /Paso (\d+) de/.exec(P.elems.cuerpo.innerHTML); return m ? Number(m[1]) : null; };

describe('la relanzada de Android (sessionStorage vacío)', () => {

  test('EL CASO DE JOAN: sin sessionStorage y sin dirección, vuelve al paso de la cédula', () => {
    const P = aMitadDelRegistro();
    assert.equal(paso(P), 2, 'el caso de prueba no llegó al paso de la cédula');
    const Q = relanzar(P, '');
    assert.equal(Q.ev('VISTA'), 'registro', 'lo sacó del registro: es el defecto que Joan reportó');
    assert.equal(paso(Q), 2, 'volvió al registro pero no al paso donde iba');
    assert.equal(/Ya abriste tu cuenta/.test(Q.elems.cuerpo.innerHTML), false, 'le pide celular y contraseña otra vez');
    assert.match(Q.elems.errReg.innerHTML, /La página se volvió a abrir/, 'no le explica qué pasó');
  });

  test('con #registro pero sin sessionStorage: paso 2, NO «Crea tu contraseña»', () => {
    /* Era, palabra por palabra, la pantalla que Joan describía: la dirección
       decía «registro» pero el número de paso vivía en la pestaña. */
    const P = aMitadDelRegistro();
    const Q = relanzar(P, '#registro');
    assert.equal(paso(Q), 2);
    assert.equal(/Crea tu contraseña/.test(Q.elems.cuerpo.innerHTML), false);
  });

  test('el paso vive en localStorage y ya no en sessionStorage', () => {
    const P = aMitadDelRegistro();
    assert.equal(P.sesion.play_registro_paso, undefined, 'el paso sigue en sessionStorage, que Android no restaura');
    const cp = JSON.parse(P.almacen.play_registro_paso || 'null');
    assert.ok(cp && cp.paso === 1 && cp.t > 0, 'el checkpoint no está en localStorage con su hora');
    assert.equal(/sessionStorage\.setItem\(LLAVE_PASO/.test(PLAY), false, 'volvió a escribirse el paso en sessionStorage');
  });

  test('la contraseña sigue SIN tocar localStorage: la regla no se aflojó', () => {
    const P = aMitadDelRegistro();
    assert.equal(/Perro\.2026x/.test(JSON.stringify(P.almacen)), false, 'la contraseña acabó en localStorage');
    assert.equal(P.sesion.play_clave_en_curso, 'Perro.2026x');
  });

  test('un registro de hace dos días no se retoma solo', () => {
    const P = aMitadDelRegistro();
    P.almacen.play_registro_paso = JSON.stringify({ paso: 1, t: Date.now() - 50 * 3600e3 });
    const Q = relanzar(P, '');
    assert.equal(Q.ev('VISTA'), 'entrar', 'un borrador viejo se impuso a quien abre la página');
  });

  test('quien volvió a la portada a propósito NO cae en el registro al relanzar', () => {
    const P = aMitadDelRegistro();
    P.ev('pintarRegistro(0)'); P.ev('pintarEntrar()');
    assert.equal(relanzar(P, '').ev('VISTA'), 'entrar');
  });
});

describe('la contraseña, después de la relanzada', () => {

  function alFinal(P) {
    /* Con la relanzada se fue la clave en curso; el cliente llega al paso 9. */
    P.ev('pintarRegistro(8)');
    P.ev("fetch = function (u) { (window.__llamadas = window.__llamadas || []).push(String(u)); return Promise.reject(new Error('corte')); };");
    P.ev("$('autGeneral').checked = true;");
    return P;
  }

  test('el paso 9 la pide una sola vez, con un ojo, y NUNCA manda una vacía', () => {
    const Q = alFinal(relanzar(aMitadDelRegistro(), '#registro'));
    assert.equal(Q.ev('CLAVE_EN_MEMORIA'), '', 'el caso de prueba no perdió la contraseña');
    const h = Q.elems.cuerpo.innerHTML;
    assert.match(h, /id="rClaveFin"/, 'el paso 9 no pide la contraseña que la relanzada se llevó');
    assert.match(h, /no se guarda en el teléfono/, 'no explica por qué la vuelve a pedir');
    Q.ev('siguientePaso()');
    assert.match(Q.ev("$('errReg').textContent"), /contraseña/i, 'sin contraseña no dijo nada');
    assert.equal(Q.ev('(window.__llamadas || []).length'), 0, 'mandó el registro sin contraseña: antes salía password ""');
    Q.ev("$('rClaveFin').value = 'Perro.2026x'; $('rClaveFin2').value = 'Perro.2026x';");
    Q.ev('siguientePaso()');
    assert.equal(Q.ev('CLAVE_EN_MEMORIA'), 'Perro.2026x', 'no tomó la contraseña del paso 9');
    assert.equal(Q.sesion.play_clave_en_curso, 'Perro.2026x');
    assert.equal(/Perro\.2026x/.test(JSON.stringify(Q.almacen)), false, 'la contraseña acabó en localStorage');
  });

  test('las dos distintas no pasan', () => {
    const Q = alFinal(relanzar(aMitadDelRegistro(), '#registro'));
    Q.ev("$('rClaveFin').value = 'Perro.2026x'; $('rClaveFin2').value = 'Gato.2026x';");
    Q.ev('siguientePaso()');
    assert.match(Q.ev("$('errReg').textContent"), /no son iguales/);
    assert.equal(Q.ev('CLAVE_EN_MEMORIA'), '');
  });

  test('con la contraseña en memoria, el paso 9 NO la vuelve a pedir', () => {
    const P = aMitadDelRegistro();
    P.ev('pintarRegistro(8)');
    assert.equal(/id="rClaveFin"/.test(P.elems.cuerpo.innerHTML), false, 'pide la contraseña que ya tiene');
  });

  test('la reja de enviarRegistro está, por si otro camino llega sin contraseña', () => {
    assert.match(PLAY, /function enviarRegistro[\s\S]{0,900}if \(!CLAVE_EN_MEMORIA\)/, 'enviarRegistro mandaría password "" si alguien llega sin clave');
  });
});

describe('las fotos, después de la relanzada', () => {

  function conFotos(P, celular) {
    P.ev("FOTOS = { sensibles: true, cedula_frente: 'data:image/jpeg;base64,AAA', de: { celular: '" + celular + "', t: Date.now() } }; guardarFotos();");
  }
  function cuentaDe(Q, celular) {
    Q.ev("SESION = { access_token: 'tok', user: { email: '57" + celular + "@tugarantia.net' } };");
    Q.ev('rpcSesion = function (fn, c) { window.__subio = c; return Promise.resolve({ ok: true }); };');
  }

  test('SÍ suben tras la relanzada cuando la cuenta es del mismo celular', () => {
    /* Antes no: la marca vivía en la pestaña, la caja decía «Listo», y
       registro_archivos_guardar no se llamaba nunca. */
    const P = aMitadDelRegistro(); conFotos(P, '3001112233');
    const Q = relanzar(P, '#registro'); cuentaDe(Q, '3001112233');
    Q.ev('subirArchivosRegistro()');
    const subio = Q.ev('window.__subio');
    assert.ok(subio && subio.p_archivos && subio.p_archivos.cedula_frente, 'las fotos de la cédula no se subieron: el CRM recibe el registro sin cédula, en silencio');
    assert.equal(subio.p_archivos.de, undefined, 'la marca de dueño viajó a la nube');
  });

  test('NO suben a la cuenta de otro celular (el siguiente en un teléfono prestado)', () => {
    const P = aMitadDelRegistro(); conFotos(P, '3001112233');
    const Q = relanzar(P, ''); cuentaDe(Q, '3009999999');
    Q.ev('subirArchivosRegistro()');
    assert.equal(Q.ev('window.__subio'), undefined, 'subió a esta cuenta la cédula de otra persona');
  });

  test('ni las de ayer, aunque sea el mismo celular', () => {
    const P = aMitadDelRegistro();
    P.ev("FOTOS = { sensibles: true, cedula_frente: 'data:x', de: { celular: '3001112233', t: Date.now() - 30 * 3600e3 } }; guardarFotos();");
    const Q = relanzar(P, ''); cuentaDe(Q, '3001112233');
    Q.ev('subirArchivosRegistro()');
    assert.equal(Q.ev('window.__subio'), undefined);
  });

  test('si en el paso 1 cambia el celular, las fotos del anterior no se le pegan', () => {
    const P = aMitadDelRegistro(); conFotos(P, '3001112233');
    P.ev('pintarRegistro(0)');
    P.ev("$('rTel').value='3009999999'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x';");
    P.ev('siguientePaso()');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'la cédula del celular anterior siguió pegada al nuevo');
    assert.equal(P.ev('FOTOS.sensibles'), true, 'se perdió el consentimiento al cambiar el celular');
  });

  test('el aviso de la relanzada nombra las fotos si ya había', () => {
    const P = aMitadDelRegistro(); conFotos(P, '3001112233');
    const Q = relanzar(P, '');
    assert.match(Q.elems.errReg.innerHTML, /las fotos que ya habías tomado/);
  });
});

describe('la cuenta recién creada, después de la relanzada', () => {

  test('la portada dice que ya quedó creada, con el celular puesto — no un formulario vacío', () => {
    /* Antes: «Paso 1 de 9» vacío (el borrador ya se había borrado), nueve pasos
       otra vez, y al final «ya hay una cuenta con ese celular». */
    const P = abrirPlay({ hash: '' });
    P.ev("anotarCuentaCreada('3001112233'); pintarRegistrado();");
    assert.equal(P.hash(), '', 'la pantalla de «cuenta creada» dejó puesta la dirección del registro');
    const Q = relanzar(P, '');
    assert.equal(Q.ev('VISTA'), 'entrar');
    assert.match(Q.ev("$('errEntrar').innerHTML"), /ya quedó creada/, 'no le dice que su cuenta ya existe');
    assert.equal(Q.ev("$('inTel').value"), '300 111 2233', 'el celular no quedó puesto');
    /* Y al entrar, la marca se suelta: no se lo vuelve a decir cada vez. */
    Q.ev("pintarCuenta({ access_token: 'tok', user: { id: 'u1' } })");
    assert.equal(Q.almacen.play_cuenta_creada, undefined);
  });

  test('la propuesta también suelta la dirección del registro', () => {
    assert.match(PLAY, /function pintarSolicitud\(sol\) \{[\s\S]{0,120}marcarVista\(''\)/);
  });
});

describe('lo que se escribe en el paso 1', () => {
  test('el celular se anota por tecla, no solo al tocar «Continuar»', () => {
    /* La página promete «con lo que ya habías escrito»; el celular no entraba
       en esa promesa. */
    const P = abrirPlay({ hash: '' });
    P.ev("pintarRegistro(0); $('rTel').value = '3001112233'; anotarCelular($('rTel'));");
    assert.match(P.almacen.play_registro_borrador || '', /3001112233/, 'el celular tecleado no llegó al borrador');
    assert.match(PLAY, /id="rTel"[^>]*oninput="anotarCelular\(this\)"/, 'rTel dejó de anotarse por tecla');
  });
});
