'use strict';
/* ==========================================================================
 * TRAER.HTML EN UN CELULAR YA NO ESCRIBE LA CARTERA — 24 de noviembre de 2026
 *
 *   node --test pruebas/traer-en-un-celular.test.js
 *
 * Es el punto de la etapa U1 que tenía que salir con el CRM del celular
 * (RECETA-PLAN-UN-SOLO-CRM.md): desde v143 la nube no trae el PIN, así que
 * traer la cartera a un teléfono la dejaba guardada ahí, abriendo con el PIN de
 * fábrica; y desde v162 no hace falta, porque crm.html se abre en el celular y
 * la muestra al día sin guardarla.
 *
 * Corre el traer.html de verdad (banco-traer.js), con una nube de mentira.
 * Los nombres, celulares y correos son inventados.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirTraer } = require('./banco-traer.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const TRAER = LEER('panel/traer.html');
const LLAVE = 'joan_socios_v1';
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', maxTouchPoints: 5, onLine: true };
const IPAD = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', maxTouchPoints: 5, onLine: true };
const PC = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 0, onLine: true };

const SOCIO = { id: 'C1', numero: 1, nombre: 'Cliente Inventado', cedula: '52000000', telefono: '3000000301', gestiones: [] };
const CREDITO = { id: 'P1', socioId: 'C1', monto: 300000, total: 360000, fecha: '2026-11-01', fechaPago: '2026-11-15', estado: 'activo', gestiones: [] };
const FILA = (id, datos) => ({ id, datos, borrado: false, actualizado_en: '2026-11-05T15:00:00Z', actualizado_por: 'crm' });
const PAQUETE = { completo: true, servidor_ahora: '2026-11-06T15:00:00Z', contadores: { cliente: 1, credito: 1, respaldado: 0 },
  socios: [FILA('C1', SOCIO)], creditos: [FILA('P1', CREDITO)], respaldados: [], ajustes: [] };
const nube = url => /grant_type=password/.test(url)
  ? { status: 200, cuerpo: { access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', expires_in: 3600, user: { id: 'u1', email: 'duena@prueba.test' } } }
  : /rpc\/panel_traer/.test(url) ? { status: 200, cuerpo: PAQUETE } : { status: 404, cuerpo: {} };
async function hastaTraer(navegador, almacen, pin) {
  const T = abrirTraer({ red: nube, navegador, almacen });
  T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada';
  T.tocar('btnEntrar');
  await asentar();
  T.tocar('btnMirar');
  await asentar();
  T.tocar('btnRespaldo');
  /* El banco no deja tocar un botón apagado («un dedo no lo dispara»): en un celular
     «Traer» queda apagado, y eso es justo lo que se quiere. Solo se toca si está prendido. */
  /* 25-nov-2026 (v167) — `pin`: en un computador, con un paquete sin PIN, se escoge antes de traer. */
  if (pin) ['pinNuevo', 'pinNuevo2'].forEach(id => { T.elems[id].value = pin; (T.elems[id]._oyentes.input || []).forEach(f => f({ target: T.elems[id] })); });
  if (!T.elems.btnTraer.disabled) T.tocar('btnTraer');
  await asentar();
  return T;
}
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('traer.html en un celular', () => {
  test('lo dice arriba de todo, antes de pedir nada, con el camino al CRM y al Panel en el bolsillo', () => {
    const T = abrirTraer({ red: nube, navegador: IPHONE });
    const h = T.elems.enCelular.innerHTML;
    assert.match(plano(h), /En un celular ya no se trae la cartera/);
    assert.match(plano(h), /Quedaría guardada en el teléfono, abriendo con el PIN de fábrica/);
    /* Dos botones, no enlaces dentro del párrafo: a 390 px esos miden 19 px de alto. */
    assert.match(h, /<a class="btn negro" id="irAlCrm" href="crm\.html">Abrir el CRM<\/a>/);
    assert.match(h, /<a class="btn sec sm" id="irAlBolsillo" href="espejo\.html">Registrar un cobro: Panel en el bolsillo<\/a>/);
    assert.ok(TRAER.indexOf('id="enCelular"') < TRAER.indexOf('id="btnEntrar"'), 'el aviso va después del botón de entrar');
    assert.equal(T.elems.btnTraer.disabled, true);
    assert.match(T.elems.porqueOff.textContent, /En un celular no se trae: abre el CRM/);
  });

  test('aunque recorra todos los pasos, NO escribe la cartera en el teléfono', async () => {
    const T = await hastaTraer(IPHONE);
    assert.equal(T.almacen[LLAVE], undefined, 'la cartera quedó guardada en el celular');
    assert.equal(T.elems.btnTraer.disabled, true, 'el botón de traer se prendió en un celular');
    assert.match(T.elems.porqueOff.textContent, /En un celular no se trae/);
    /* Y si alguien llama la función a mano (un botón viejo en caché), tampoco. */
    T.ev('traerYEscribir()');
    await asentar();
    assert.equal(T.almacen[LLAVE], undefined);
    assert.match(plano(T.elems.msg5.innerHTML), /No escribí nada.*En un celular esta página ya no trae la cartera/);
  });

  test('un iPad (que se presenta como Macintosh, pero se toca) tampoco', async () => {
    const T = await hastaTraer(IPAD);
    assert.equal(T.almacen[LLAVE], undefined);
  });

  test('el celular que YA tenía una copia: no se la pisa, y la página le sigue dejando mirar y bajar su respaldo', async () => {
    const copia = JSON.stringify({ socios: [{ id: 'V1', nombre: 'Ficha Vieja De Mentira' }], prestamos: [], respaldados: [], contadores: {}, config: { pin: '9090' } });
    const T = abrirTraer({ red: nube, navegador: IPHONE, almacen: { [LLAVE]: copia } });
    assert.match(plano(T.elems.enCelular.innerHTML), /En un celular ya no se trae la cartera/);
    assert.equal(T.almacen[LLAVE], copia, 'abrir la página tocó la copia');
    T.ev('traerYEscribir()');
    await asentar();
    assert.equal(T.almacen[LLAVE], copia, 'la copia del celular se pisó');
  });

  /* 25-nov-2026 (v167) — decía «todo sigue igual». Sigue trayendo, pero ya no deja la cartera con
     el PIN de fábrica: escoge uno antes (pruebas/traer-escoge-su-pin.test.js). */
  test('en un computador sigue trayendo: sin aviso de celular, con el PIN que se escoge antes', async () => {
    const T = await hastaTraer(PC, undefined, '482915');
    assert.equal(T.elems.enCelular.innerHTML || '', '');
    assert.ok(T.almacen[LLAVE], 'el computador dejó de poder traer su cartera');
    assert.equal(JSON.parse(T.almacen[LLAVE]).socios.length, 1);
    assert.equal(JSON.parse(T.almacen[LLAVE]).config.pin, '482915');
  });

  test('«¿es un celular?» se contesta igual que en el CRM y en la puerta del panel', () => {
    const R = require('../panel/crm-remoto.js');
    const cuerpo = src => /function esCelular\(\)\s*\{([\s\S]*?)\n\s*\}/.exec(src.replace(/\r\n/g, '\n'));
    const deTraer = cuerpo(TRAER), dePuerta = cuerpo(LEER('panel/index.html'));
    assert.ok(deTraer && dePuerta, 'falta esCelular en traer.html o en panel/index.html');
    const con = (f, nav) => vm.runInNewContext('(function () {' + f[1] + '})()', { navigator: nav });
    [['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', 5], ['Mozilla/5.0 (iPad; CPU OS 12_0)', 5], ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5],
     ['Mozilla/5.0 (Windows Phone 10.0)', 1], ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5], ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0],
     ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 10], ['Mozilla/5.0 (X11; Linux x86_64)', 0], ['node', undefined], ['', 0]]
      .forEach(([userAgent, maxTouchPoints]) => {
        const nav = { userAgent, maxTouchPoints };
        assert.equal(con(deTraer, nav), R.esCelular(nav), 'traer.html y el CRM no dicen lo mismo de: ' + userAgent);
        assert.equal(con(dePuerta, nav), R.esCelular(nav), 'la puerta y el CRM no dicen lo mismo de: ' + userAgent);
      });
  });

  test('la regla va PRIMERO entre las razones para no escribir: no depende de lo que conteste la nube', () => {
    const f = TRAER.replace(/\r\n/g, '\n');
    assert.match(f, /function razonParaNoEscribir\(\)\{\n  if\(esCelular\(\)\) return MOTIVO_CELULAR;\n  var m = E\.lectura;/);
    assert.match(f, /var no = razonParaNoEscribir\(\);\n  if\(no\)\{ pinta\('msg5','ambar','<b class="tit">No escribí nada<\/b>'\+no\); return; \}/,
      'traerYEscribir ya no pregunta la razón antes de escribir');
  });
});
