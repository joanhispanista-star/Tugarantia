/* ============================================================================
 * LA CALCULADORA DEL PEDIDO, EN LA APP QUE SE INSTALA — 23-oct-2026
 *
 *   node --test pruebas/la-calculadora-en-la-app.test.js
 *
 * Joan: «quiero que cuando se instale se pueda ver la calculadora, no sé por
 * qué desapareció, esa es una parte para enganchar al cliente mostrándole
 * cuánto puede pedir».
 *
 * Desapareció el 21-oct (95f5d1b): la app instalada dejó de ser play/ —cuya
 * portada abre con la calculadora— y pasó a ser app/socio.html, que abría en
 * Entrar y nunca cargó app/calculadora-solicitud.js. Y el manifiesto prometía
 * «calcula un crédito antes de pedirlo» con un atajo #calc que nadie leía
 * desde el 4-ago.
 *
 * Lo que cuidan estas pruebas:
 *   1. Sin sesión, la PRIMERA tarjeta de Entrar es la calculadora del pedido
 *      (la misma de play/ y de index.html), antes del celular y la contraseña.
 *   2. El MISMO traspaso que index.html: lo movido se guarda en este teléfono
 *      con la llave del módulo y el botón abre ../play/#registro.
 *   3. Si el módulo no llegó, queda el enlace al registro.
 *   4. Se carga con la misma dirección versionada que precarga sw.js.
 *   5. El atajo #calc del manifiesto lleva a la pestaña Calculadora, y la
 *      descripción del manifiesto dice la verdad.
 *   6. No dice «cuánto puedes pedir»: el cupo lo decide Joan.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = h => String(h).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const CS = require('../app/calculadora-solicitud.js');

const AHORA = Date.parse('2026-10-23T15:00:00Z');
const DIA = 86400000;
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36';

async function entrar(o) {
  const A = abrirSocio(Object.assign({ ahora: AHORA, navegador: { userAgent: UA } }, o));
  await asentar();
  return A;
}
const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
  socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
const SESION_CON_PAQUETE = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + 30 * DIA, celular: '3001112222',
  paquete: { nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-20T10:00:00Z', origen: 'nube', cedula: '3001112222' } });
async function conCuenta(o) {
  const A = abrirSocio(Object.assign({ ahora: AHORA, navegador: { userAgent: UA } }, o,
    { local: Object.assign({ socio_cuenta: SESION_CON_PAQUETE }, (o && o.local) || {}) }));
  await asentar(16);
  return A;
}

describe('app/socio.html: la calculadora del pedido es lo primero de Entrar', () => {

  test('sin sesión, la primera tarjeta es la calculadora, antes del celular y la contraseña', async () => {
    const A = await entrar();
    const h = A.elem('entrarCuerpo').innerHTML;
    const i = h.indexOf('id="calcEntrar"');
    assert.ok(i >= 0, 'Entrar no tiene la calculadora del pedido');
    assert.ok(i < h.indexOf('id="inCel"'), 'la calculadora no va primero');
    assert.match(h, /class="cs" id="csCaja"/, 'no es la calculadora de app/calculadora-solicitud.js');
    const t = plano(h);
    assert.match(t, /Dinos cuánto necesitas y para cuándo/);
    assert.match(t, /¿Cuánto necesitas\?/);
    assert.match(t, /¿Para cuándo lo pagas\?/);
    assert.match(h, /onclick="pedirDesdeLaApp\(\)"[^>]*>Abrir mi cuenta y pedirlo/);
  });

  test('no promete un cupo: «cuánto necesitas», nunca «cuánto puedes pedir» ni «te prestamos»', async () => {
    const A = await entrar();
    const h = A.elem('entrarCuerpo').innerHTML;
    const calc = h.slice(h.indexOf('id="calcEntrar"'), h.indexOf('id="inCel"'));
    assert.ok(!/cuánto puedes pedir|te prestamos|aprobado|preaprobado/i.test(plano(calc)), plano(calc));
  });

  test('el botón guarda lo movido con la llave del módulo y abre el registro de play/', async () => {
    const A = await entrar();
    A.ev('CalculadoraSolicitud.elegirMonto(500000)');
    A.ev('pedirDesdeLaApp()');
    assert.equal(A.loc.href, '../play/#registro', 'no abrió el registro de play/');
    const g = JSON.parse(A.local.d[CS.LLAVE] || 'null');
    assert.ok(g, 'no guardó lo movido: play/ no lo encontraría puesto');
    assert.equal(Number(g.monto), 500000);
  });

  test('lo que la persona ya había movido (en la portada o en play/) aparece puesto', async () => {
    const A = await entrar({ local: { [CS.LLAVE]: JSON.stringify({ monto: 800000, fecha: '2026-11-07', dias: 15, t: AHORA - DIA }) } });
    const t = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(t, /\$800\.000/);
  });

  test('si el módulo no llegó, queda el enlace al registro y la entrada', async () => {
    const A = await entrar();
    A.ev('window.CalculadoraSolicitud = null; pintarEntrar();');
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.match(h, /id="calcEntrar"/);
    assert.match(h, /href="\.\.\/play\/#registro">Abrir mi cuenta y pedirlo/);
    assert.match(h, /id="inCel"/);
  });

  test('dentro de la app instalada también sale (era el reclamo de Joan)', async () => {
    const A = await entrar({ matchMedia: q => ({ matches: q === '(display-mode: standalone)' }) });
    assert.match(A.elem('entrarCuerpo').innerHTML, /id="calcEntrar"/);
  });
});

describe('la calculadora en la app: carga, precarga y manifiesto', () => {

  test('socio.html la carga con la misma dirección que precarga sw.js, y creditos.js con ella', () => {
    const html = leer('app/socio.html');
    const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
    const calc = srcs.find(s => /^calculadora-solicitud\.js/.test(s));
    assert.ok(calc, 'socio.html no carga app/calculadora-solicitud.js');
    assert.ok(srcs.indexOf('creditos.js') >= 0, 'socio.html no carga app/creditos.js: la calculadora no daría el estimado');
    const SW = leer('sw.js');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS'), SW.indexOf('].map(f => BASE + f)'));
    assert.ok(lista.indexOf("'app/" + calc + "'") >= 0, 'app/' + calc + ' no es la dirección que precarga sw.js');
    assert.ok(lista.indexOf("'app/creditos.js'") >= 0);
    /* Y la misma que piden index.html y play/: una sola dirección por archivo. */
    assert.ok(leer('index.html').indexOf('src="app/' + calc + '"') >= 0, 'index.html pide otra versión');
  });

  test('el atajo «Calculadora» del manifiesto (#calc) lleva a la pestaña Calculadora', async () => {
    const A = await conCuenta({ hash: '#calc' });
    assert.ok(A.visible('pCuenta'), 'no abrió la cuenta');
    assert.equal(A.ev('TAB'), 'calc', 'el atajo #calc abrió otra pestaña');
    assert.equal(A.loc.hash, '', 'el # se quedó: una recarga volvería a saltar');
    const B = await conCuenta({});
    assert.equal(B.ev('TAB'), 'inicio');
  });

  test('el manifiesto: cada atajo se atiende, la descripción no promete de más, el id no se tocó', () => {
    const m = JSON.parse(leer('app/app.webmanifest'));
    assert.equal(m.id, '/TuGarantia/app/socio.html', 'el id de la instalación cambió: las instaladas se rompen');
    assert.ok(!/calcula un crédito antes de pedirlo/.test(m.description), 'la descripción vieja prometía lo que no había');
    const html = leer('app/socio.html');
    for (const a of m.shortcuts || []) {
      const hash = (String(a.url).split('#')[1] || '');
      if (!hash) continue;
      assert.ok(html.indexOf("/^#" + hash + "$/") >= 0, 'nadie lee el atajo #' + hash + ' en socio.html');
    }
  });
});
