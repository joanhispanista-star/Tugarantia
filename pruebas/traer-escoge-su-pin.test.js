'use strict';
/* ==========================================================================
 * TRAER EN UN COMPUTADOR: EL PIN DE ESTE APARATO SE ESCOGE ANTES DE TRAER
 * 25 de noviembre de 2026 (v167)
 *
 *   node --test pruebas/traer-escoge-su-pin.test.js
 *
 * Desde v143 el PIN no viaja por la nube. panel/traer.html, en un computador
 * nuevo, dejaba la cartera entera abriendo con el PIN de fábrica y decía
 * «cámbialo apenas entres». Era el punto que faltaba de la etapa U1
 * (RECETA-PLAN-UN-SOLO-CRM.md). Ahora la página no escribe hasta que se escoja
 * un PIN, y ese es el que queda guardado con la cartera.
 *
 * Todo lo de aquí es inventado: nombres, cédulas, celulares y PIN.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirTraer } = require('./banco-traer.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const TRAER = fs.readFileSync(path.join(RAIZ, 'panel', 'traer.html'), 'utf8').replace(/\r\n/g, '\n');
const CODIGO = TRAER.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const LLAVE = 'joan_socios_v1';
const PC = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 0, onLine: true };
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', maxTouchPoints: 5, onLine: true };
const PIN = '482915';

const SOCIO = { id: 'C1', numero: 1, nombre: 'Cliente Inventado', cedula: '52000000', telefono: '3000000301', gestiones: [] };
const CREDITO = { id: 'P1', socioId: 'C1', monto: 300000, total: 360000, fecha: '2026-11-01', fechaPago: '2026-11-15', estado: 'activo', gestiones: [] };
const FILA = (id, datos) => ({ id, datos, borrado: false, actualizado_en: '2026-11-05T15:00:00Z', actualizado_por: 'crm' });
const paquete = ajustes => ({ completo: true, servidor_ahora: '2026-11-06T15:00:00Z', contadores: { cliente: 1, credito: 1, respaldado: 0 },
  socios: [FILA('C1', SOCIO)], creditos: [FILA('P1', CREDITO)], respaldados: [], ajustes: ajustes || [] });
const SIN_PIN = { clave: 'config', datos: { negocio: 'Tu Garantía', tasaUsuraEA: 25 }, actualizado_en: '2026-11-08T20:15:00Z', actualizado_por: 'crm' };
const CON_PIN = { clave: 'config', datos: { pin: '4321', negocio: 'Tu Garantía' }, actualizado_en: '2026-08-18T20:15:00Z', actualizado_por: 'subir' };
const nube = paq => url => /grant_type=password/.test(url)
  ? { status: 200, cuerpo: { access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', expires_in: 3600, user: { id: 'u1', email: 'duena@prueba.test' } } }
  : /rpc\/panel_traer/.test(url) ? { status: 200, cuerpo: paq } : { status: 404, cuerpo: {} };

/* Hasta tener el respaldo hecho: lo único que falta para traer es lo que se esté probando. */
async function hastaElBoton(paq, o) {
  o = o || {};
  const T = abrirTraer({ red: nube(paq), navegador: o.navegador || PC, almacen: o.almacen, confirmar: o.confirmar });
  if (o.almacen && o.almacen[LLAVE] && T.puerta()) { T.elems.pin.value = JSON.parse(o.almacen[LLAVE]).config.pin; T.tocar('btnPuerta'); }
  T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada';
  T.tocar('btnEntrar');
  await asentar();
  T.tocar('btnMirar');
  await asentar();
  /* Con cartera, el respaldo baja un archivo de verdad (Blob y un <a>), que aquí no hay. */
  T.ev('E.respaldoHecho = true; refrescarBotones()');
  return T;
}
/* Teclear en las dos casillas, como un dedo: cambia el valor y avisa con «input». */
function teclear(T, a, b) {
  T.elems.pinNuevo.value = a; (T.elems.pinNuevo._oyentes.input || []).forEach(f => f({ target: T.elems.pinNuevo }));
  T.elems.pinNuevo2.value = b === undefined ? a : b; (T.elems.pinNuevo2._oyentes.input || []).forEach(f => f({ target: T.elems.pinNuevo2 }));
}
const caja = T => !T.elems.pinNuevoCaja.classList.contains('oculto');
const guardado = T => T.almacen[LLAVE] ? JSON.parse(T.almacen[LLAVE]) : null;
const pantalla = T => ['resumen3', 'msg5', 'resumen5', 'msg6', 'cuerpo1', 'porqueOff', 'avisoPinAntesDeTraer', 'avisoRespaldo']
  .map(id => T.elems[id] ? T.texto(id) + ' ' + (T.elems[id].innerHTML || '') : '').join(' | ');

describe('cuándo se pide', () => {
  test('nace oculto, y antes de mirar la nube no se pide nada', () => {
    const T = abrirTraer({ red: nube(paquete([SIN_PIN])), navegador: PC });
    assert.equal(caja(T), false, 'las casillas del PIN salen antes de saber si hacen falta');
    assert.match(TRAER, /<div id="pinNuevoCaja" class="oculto">/);
  });

  test('paquete sin PIN y aparato sin PIN suyo: sale, y el paso 3 lo anuncia sin prometer el 1234', async () => {
    for (const ajustes of [[SIN_PIN], []]) {
      const T = await hastaElBoton(paquete(ajustes));
      assert.equal(caja(T), true, 'no pidió escoger el PIN');
      assert.match(T.texto('resumen3'), /lo escoges tú en el paso 5 ?, antes de traer/);
      assert.doesNotMatch(T.texto('resumen3'), /PIN 1234|Cámbialo/, 'el paso 3 sigue dejando el aparato con el PIN de fábrica');
      assert.equal(T.elems.btnTraer.disabled, true, 'se puede traer sin escoger el PIN');
      assert.match(T.elems.porqueOff.textContent, /Falta escoger el PIN de este aparato/);
    }
  });

  test('si el paquete trae un PIN (de antes de v143), no se pide: manda ese, como antes', async () => {
    const T = await hastaElBoton(paquete([CON_PIN]));
    assert.equal(caja(T), false);
    assert.equal(T.elems.btnTraer.disabled, false);
    T.tocar('btnTraer'); await asentar();
    assert.equal(guardado(T).config.pin, '4321');
  });

  test('si el aparato ya tiene cartera y un PIN suyo, no se pide: conserva el suyo, como antes', async () => {
    const almacen = { [LLAVE]: JSON.stringify({ socios: [SOCIO], prestamos: [], config: { pin: '777111', negocio: 'Tu Garantía' } }) };
    const T = await hastaElBoton(paquete([SIN_PIN]), { almacen });
    assert.equal(caja(T), false);
    T.tocar('btnTraer'); await asentar();
    assert.equal(guardado(T).config.pin, '777111');
  });

  test('con cartera pero con el PIN de fábrica, SÍ se pide: ese aparato tampoco se queda con el 1234', async () => {
    const almacen = { [LLAVE]: JSON.stringify({ socios: [SOCIO], prestamos: [], config: { pin: '1234', negocio: 'Tu Garantía' } }) };
    const T = await hastaElBoton(paquete([SIN_PIN]), { almacen });
    assert.equal(caja(T), true);
    assert.equal(T.elems.btnTraer.disabled, true);
    teclear(T, PIN);
    T.tocar('btnTraer'); await asentar();
    assert.equal(guardado(T).config.pin, PIN);
  });

  test('en un celular no se pide nada: ahí la página no trae, y el paso 3 no habla del paso 5', async () => {
    const T = await hastaElBoton(paquete([SIN_PIN]), { navegador: IPHONE });
    assert.equal(caja(T), false, 'un celular pide escoger un PIN para algo que no va a hacer');
    assert.doesNotMatch(T.texto('resumen3'), /paso 5|PIN 1234/);
    assert.match(T.texto('resumen3'), /En un celular no hace falta: aquí no se trae la cartera/);
    assert.equal(T.elems.btnTraer.disabled, true);
  });

  test('si la página se niega a traer (paquete parcial), tampoco: no se pide un PIN para nada', async () => {
    const T = await hastaElBoton(Object.assign(paquete([SIN_PIN]), { completo: false }));
    assert.equal(caja(T), false);
    assert.equal(T.elems.btnTraer.disabled, true);
  });
});

describe('qué PIN sirve', () => {
  const MALOS = [
    ['', undefined, /Falta escoger el PIN/],
    ['123', undefined, /de 4 a 6 números/],
    ['12a4', undefined, /de 4 a 6 números/],
    ['48 29', undefined, /de 4 a 6 números/],
    ['4829157', undefined, /de 4 a 6 números/],
    ['1234', undefined, /PIN de fábrica o su continuación/],
    ['12345', undefined, /PIN de fábrica o su continuación/],
    ['123456', undefined, /PIN de fábrica o su continuación/],
    ['0000', undefined, /mismo número repetido/],
    ['777777', undefined, /mismo número repetido/],
    [PIN, '', /otra vez en la segunda casilla/],
    [PIN, '482916', /no dicen lo mismo/]
  ];
  test('mientras no sirva, el botón sigue apagado y debajo dice por qué', async () => {
    const T = await hastaElBoton(paquete([SIN_PIN]));
    for (const [a, b, motivo] of MALOS) {
      teclear(T, a, b);
      assert.equal(T.elems.btnTraer.disabled, true, 'el botón se prendió con «' + a + '» / «' + b + '»');
      assert.match(T.elems.porqueOff.textContent, motivo, '«' + a + '»');
    }
    teclear(T, PIN);
    assert.equal(T.elems.btnTraer.disabled, false, 'con un PIN que sirve el botón no se prendió');
    assert.equal(T.elems.porqueOff.textContent, '');
  });

  test('y si alguien llama a traer sin pasar por el botón, la misma reja: no escribe', async () => {
    const T = await hastaElBoton(paquete([SIN_PIN]));
    for (const [a, b] of MALOS) {
      teclear(T, a, b);
      T.ev('traerYEscribir()'); await asentar();
      assert.equal(T.almacen[LLAVE], undefined, 'escribió la cartera con «' + a + '» / «' + b + '»');
      assert.match(T.texto('msg5'), /No escribí nada/);
    }
    assert.equal(T.confirmaciones.length, 0, 'preguntó «¿lo hago?» antes de tener el PIN');
  });

  test('cabe en Ajustes del CRM, que es donde después se cambia', () => {
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const largo = Number((/id="cfgPin" maxlength="(\d+)"/.exec(CRM) || [])[1]);
    assert.ok(largo >= 6, 'Ajustes del CRM ya no deja escribir un PIN de 6');
    assert.match(TRAER, /<input id="pinNuevo" type="password" inputmode="numeric" maxlength="6"/);
    assert.match(TRAER, /<input id="pinNuevo2" type="password" inputmode="numeric" maxlength="6"/);
    assert.match(CODIGO, /if\(!\/\^\\d\{4,6\}\$\/\.test\(a\)\)/);
  });
});

describe('qué queda guardado', () => {
  test('la cartera queda con el PIN escogido y con los demás ajustes de la nube; el de fábrica no abre', async () => {
    const T = await hastaElBoton(paquete([SIN_PIN]));
    teclear(T, PIN);
    T.tocar('btnTraer'); await asentar();
    assert.equal(T.texto('e5'), 'Traído');
    const g = guardado(T);
    assert.equal(g.config.pin, PIN);
    assert.equal(g.config.negocio, 'Tu Garantía');
    assert.equal(g.config.tasaUsuraEA, 25, 'escoger el PIN se llevó un ajuste de la nube');
    assert.equal(g.socios.length, 1);
    assert.match(T.texto('msg6'), /El CRM te va a pedir el PIN que acabas de escoger en esta página ?: los ajustes vinieron sin PIN/);
    assert.match(T.texto('msg6'), /Ajustes del CRM, «PIN de acceso»/);
    assert.doesNotMatch(T.texto('msg6'), /de fábrica \(1234\)|Cámbialo apenas entres/);
  });

  test('sin la fila de ajustes también: queda el PIN escogido, y lo dice', async () => {
    const T = await hastaElBoton(paquete([]));
    teclear(T, PIN);
    T.tocar('btnTraer'); await asentar();
    assert.equal(guardado(T).config.pin, PIN);
    assert.match(T.texto('msg6'), /PIN que acabas de escoger en esta página ?: los ajustes no vinieron/);
  });

  test('el PIN no se pinta en ninguna parte, no se queda en las casillas ni en la memoria de la página', async () => {
    const T = await hastaElBoton(paquete([SIN_PIN]));
    teclear(T, PIN);
    assert.equal(pantalla(T).includes(PIN), false, 'la pantalla pintó el PIN antes de traer');
    T.tocar('btnTraer'); await asentar();
    assert.equal(pantalla(T).includes(PIN), false, 'la pantalla pintó el PIN después de traer');
    assert.equal(T.confirmaciones.join(' ').includes(PIN), false, 'el «¿lo hago?» pintó el PIN');
    assert.equal(T.elems.pinNuevo.value, '');
    assert.equal(T.elems.pinNuevo2.value, '');
    assert.equal(caja(T), false, 'las casillas siguen a la vista después de traer');
    /* `crudo` es la cartera tal cual quedó en el cajón (de ahí sale el respaldo): ahí SÍ va el PIN,
       porque es donde vive. Lo que no puede pasar es que quede suelto en otra parte del estado. */
    const E = JSON.parse(T.ev('JSON.stringify(E, function (k, v) { return (k === "paquete" || k === "crudo") ? undefined : v; })'));
    assert.equal(JSON.stringify(E).includes(PIN), false, 'el PIN quedó guardado en el estado de la página');
    assert.match(TRAER, /<input id="pinNuevo" type="password"[^>]*autocomplete="new-password">/);
  });

  test('si dice que no en el «¿lo hago?», no se escribe nada y lo tecleado sigue ahí', async () => {
    const T = await hastaElBoton(paquete([SIN_PIN]), { confirmar: false });
    teclear(T, PIN);
    T.tocar('btnTraer'); await asentar();
    assert.equal(T.almacen[LLAVE], undefined);
    assert.equal(T.elems.pinNuevo.value, PIN);
    assert.equal(caja(T), true);
  });

  test('si el aparato cambió desde que se miró y quedaría con el de fábrica, se niega a escribir', async () => {
    /* Al mirar, el aparato tenía cartera y PIN propio: no se pidió PIN. Otra pestaña lo dejó
       con el de fábrica y esta no se enteró. La regla se decide otra vez al escribir. */
    const almacen = { [LLAVE]: JSON.stringify({ socios: [SOCIO], prestamos: [], config: { pin: '777111', negocio: 'Tu Garantía' } }) };
    const T = await hastaElBoton(paquete([SIN_PIN]), { almacen });
    assert.equal(caja(T), false, 'precondición: no se pidió PIN');
    const deOtraPestana = JSON.stringify({ socios: [SOCIO], prestamos: [], config: { pin: '1234', negocio: 'Tu Garantía' } });
    T.almacen[LLAVE] = deOtraPestana;
    T.tocar('btnTraer'); await asentar();
    assert.equal(T.almacen[LLAVE], deOtraPestana, 'escribió la cartera y la dejó abriendo con el PIN de fábrica');
    assert.match(T.texto('msg5'), /No escribí nada.*escoger el PIN de este aparato.*quedaría abriendo con el PIN de fábrica/);
    assert.equal(T.elems.btnTraer.disabled, false, 'se quedó sin poder reintentar');
  });
});

describe('lo que la página ya no dice, y dónde va lo nuevo', () => {
  test('ninguna frase deja el aparato con el PIN de fábrica «para cambiarlo después»', () => {
    assert.doesNotMatch(CODIGO, /Cámbialo desde el CRM apenas entres|Cámbialo apenas entres/);
    assert.doesNotMatch(CODIGO, /va a arrancar con el <b>PIN/);
    assert.doesNotMatch(CODIGO, /PIN de fábrica \('\+esc\(PIN_DE_FABRICA\)/);
  });

  test('las casillas van en el HTML (no pintadas), encima del botón, y cada tecla vuelve a decidir', () => {
    const c5 = TRAER.indexOf('id="c5"'), aviso = TRAER.indexOf('id="avisoPinAntesDeTraer"'),
      cajaEn = TRAER.indexOf('id="pinNuevoCaja"'), uno = TRAER.indexOf('id="pinNuevo"'), dos = TRAER.indexOf('id="pinNuevo2"'), boton = TRAER.indexOf('id="btnTraer"');
    assert.ok(c5 < aviso && aviso < cajaEn && cajaEn < uno && uno < dos && dos < boton, 'las casillas del PIN no van entre el aviso y el botón del paso 5');
    assert.equal(/innerHTML\s*=[^;]*pinNuevo/.test(CODIGO), false, 'las casillas se pintan: repintar borraría lo que se va escribiendo');
    assert.match(CODIGO, /\['pinNuevo','pinNuevo2'\]\.forEach\(function\(id\)\{ \$\(id\)\.addEventListener\('input', refrescarBotones\); \}\);/);
    assert.match(TRAER, /<label for="pinNuevo">PIN nuevo \(de 4 a 6 números\)<\/label>/);
    assert.match(TRAER, /<label for="pinNuevo2">Escríbelo otra vez<\/label>/);
  });

  test('la reja está donde se escribe, no solo en el botón', () => {
    assert.match(CODIGO, /if\(nueva && pinQueQuedo === 'fabrica'\)\{\s+if\(!pinNuevo\)\{\s+return fallo\('escoger el PIN de este aparato',/);
    assert.match(CODIGO, /nueva\.config\.pin = pinNuevo;\s+pinQueQuedo = 'escogido';/);
    assert.ok(CODIGO.indexOf("pinQueQuedo = 'escogido';") < CODIGO.indexOf('localStorage.setItem(KEY, texto);'), 'el PIN se pone después de guardar');
  });
});
