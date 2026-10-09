/* ============================================================================
 * LA UBICACIÓN APROXIMADA EN «🔎 REVISAR A TODOS» — panel/revision.html
 * 8 de octubre de 2026.
 *
 *   node --test pruebas/ubicacion-ip-revision.test.js
 *
 * La revisión arranca entera (banco-revision.js) contra una nube y un
 * ipwho.is de mentira. Lo que se cuida:
 *
 *   · cada tarjeta dice la ciudad aproximada de la IP con que se registró,
 *     con «aproximada» y «no es la dirección»;
 *   · queda anotada en el registro (anotar_ubicacion_ip) y lo anotado no se
 *     vuelve a preguntar — tampoco lo que el CRM ya consultó en este navegador;
 *   · la página sigue sin escribir NADA en el localStorage (es del CRM): lo
 *     suyo va a sessionStorage;
 *   · lo que contesta el servicio no corre, y lo que falla se dice sin
 *     tumbar la revisión.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirRevision } = require('./banco-revision.js');
const { asentar, hasta } = require('./esperar.js');
const RR = require('../app/revision-registro.js');
const UbicacionIP = require('../app/ubicacion-ip.js');

const PIN = '4321';
const CARTERA = { config: { pin: PIN }, socios: [], prestamos: [] };
const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const ANA = { id: 11, cedula: '1032000111', nombre: 'Ana Red', telefono: '3001110001', estado: 'nuevo',
  creado_en: '2026-10-08T15:00:00Z', origen: 'abierto', datos: { documento: '1032000111', celular: '3001110001', autorizacion_version: '2026-10-08' },
  huella: { ip: '181.1.1.1', aparato: 'Mozilla/5.0 (Linux; Android 13)', momento: '2026-10-08T15:00:40Z' } };
const BETO = { id: 12, cedula: '80222333', nombre: 'Beto Sin IP', telefono: '3002220002', estado: 'nuevo',
  creado_en: '2026-10-08T16:00:00Z', origen: 'abierto', datos: { documento: '80222333' },
  huella: { momento: '2026-10-08T16:00:40Z' } };
const GEO = { '181.1.1.1': { ip: '181.1.1.1', success: true, city: 'Bogotá', region: 'Distrito Capital de Bogotá',
  country: 'Colombia', country_code: 'CO', connection: { isp: 'COMCEL S.A.' } } };

function nube(opciones) {
  const o = opciones || {};
  const red = (url, cuerpo) => {
    if (url.startsWith('https://ipwho.is/')) {
      if (o.geoCae) return Promise.reject(new TypeError('Failed to fetch'));
      const ip = decodeURIComponent(url.slice('https://ipwho.is/'.length).split('?')[0]);
      return { status: 200, cuerpo: (o.geo || GEO)[ip] || { ip, success: false, message: 'Reserved range' } };
    }
    const fn = url.split('/rpc/')[1];
    if (fn === 'listar_registros') return { status: 200, cuerpo: cuerpo.p_estado === 'nuevo' ? (o.nuevos || [ANA, BETO]) : [] };
    if (fn === 'archivos_de_registro') return { status: 200, cuerpo: { fotos: {}, huella: null } };
    if (fn === 'anotar_ubicacion_ip') {
      if (o.sinFuncion) return { status: 404, cuerpo: { message: 'not found' } };
      return { status: 200, cuerpo: { ok: true, ubicacion_ip: Object.assign({}, cuerpo.p_ubicacion, { consultada: '2026-10-08' }) } };
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
  return red;
}
/* La pieza de las fotos, de mentira: aquí no hay fotos que mirar. */
const FOTOS = { fotoSegura: s => (RR.bytesDeFoto(s) === null ? '' : String(s)), imagenDe: () => Promise.reject(new Error('sin fotos')),
  medirImagen: () => null, leerCodigoDeImagen: () => Promise.resolve(null), cargarRostro: () => Promise.resolve({}),
  compararRostros: () => Promise.resolve({ sin_rostro: 'ambas' }) };

async function revisada(opciones) {
  const o = opciones || {};
  const e = abrirRevision(Object.assign({ cartera: CARTERA, red: nube(o), fotos: FOTOS }, o.banco || {}));
  if (o.antes) o.antes(e);
  e.entrar(PIN);
  await hasta(() => /Listo:/.test(e.progreso()) || /No pude traer|Nadie esperando/.test(e.resultado()), 400);
  await asentar();
  return e;
}
const tarjetaDe = (h, nombre) => { const i = h.indexOf(nombre); return h.slice(h.lastIndexOf('<article', i), h.indexOf('</article>', i)); };
const geo = e => e.llamadas.filter(l => l.url.startsWith('https://ipwho.is/'));
const anotadas = e => e.llamadas.filter(l => /\/rpc\/anotar_ubicacion_ip$/.test(l.url));

describe('la tarjeta dice de dónde es la red', () => {

  test('la ciudad aproximada, con las palabras de Joan, y el que no tiene IP sin renglón', async () => {
    const e = await revisada();
    const ana = textoPlano(tarjetaDe(e.resultado(), 'Ana Red'));
    assert.match(ana, /📍 Ubicación aproximada por internet: Bogotá \(no es la dirección\)/);
    assert.match(ana, /red: COMCEL S\.A\./);
    assert.ok(!/Ubicación aproximada/.test(textoPlano(tarjetaDe(e.resultado(), 'Beto Sin IP'))),
      'pintó una ubicación para quien no tiene IP');
    assert.equal(geo(e).length, 1, 'preguntó por quien no tiene IP');
  });

  test('queda anotada en el registro, y nada del rostro viaja con ella', async () => {
    const e = await revisada();
    const a = anotadas(e);
    assert.equal(a.length, 1);
    assert.equal(a[0].cuerpo.p_id, 11);
    assert.equal(a[0].cuerpo.p_ubicacion.ciudad, 'Bogotá');
    assert.deepEqual(Object.keys(a[0].cuerpo.p_ubicacion).sort(),
      ['ciudad', 'codigo_pais', 'consultada', 'fuente', 'ip', 'pais', 'red', 'region']);
    assert.ok(!/rostro|distancia|parecido|nitidez/.test(a[0].crudo));
  });

  test('NADA al localStorage (es del CRM); lo suyo va a sessionStorage', async () => {
    const e = await revisada();
    assert.deepEqual(e.escrituras.filter(x => x.donde === 'local'), []);
    assert.match(e.sesion[UbicacionIP.LLAVE] || '', /Bogotá/);
  });

  test('lo anotado en el registro no se pregunta', async () => {
    const u = UbicacionIP.ubicacionDe(GEO['181.1.1.1'], '181.1.1.1', '2026-10-07');
    const ana = Object.assign({}, ANA, { huella: Object.assign({}, ANA.huella, { ubicacion_ip: u }) });
    const e = await revisada({ nuevos: [ana] });
    assert.match(textoPlano(e.resultado()), /Bogotá \(no es la dirección\)/);
    assert.equal(geo(e).length, 0);
    assert.equal(anotadas(e).length, 0);
  });

  test('lo que el CRM ya consultó en este navegador se lee, sin escribirle', async () => {
    const u = UbicacionIP.ubicacionDe(GEO['181.1.1.1'], '181.1.1.1', '2026-10-07');
    /* 8-oct-2026 (segunda vuelta): con una hora de AHORA. Desde hoy lo guardado
       en el navegador vence a los 90 días (VIDA_CACHE_MS), y `t: 1` es 1970. */
    const e = await revisada({ antes: x => { x.local[UbicacionIP.LLAVE] = JSON.stringify({ v: 1, ips: { '181.1.1.1': { u, t: Date.now() } } }); } });
    assert.equal(geo(e).length, 0, 'volvió a preguntar lo que el CRM ya sabía');
    assert.match(textoPlano(e.resultado()), /Bogotá/);
    assert.deepEqual(e.escrituras.filter(x => x.donde === 'local'), []);
  });
});

describe('lo que falla se dice, y la revisión sigue', () => {

  test('sin conexión con el servicio: el renglón lo dice y la revisión termina', async () => {
    const e = await revisada({ geoCae: true });
    assert.match(e.progreso(), /Listo:/);
    assert.match(textoPlano(tarjetaDe(e.resultado(), 'Ana Red')), /No pude consultar la ubicación aproximada \(sin conexión con ipwho\.is\)/);
    assert.equal(anotadas(e).length, 0);
  });

  test('si la base no tiene la función: se ve igual y un aviso dice qué pegar', async () => {
    const e = await revisada({ sinFuncion: true });
    assert.match(textoPlano(e.resultado()), /Bogotá/);
    assert.match(textoPlano(e.avisos()), /base\/20261008_ubicacion_por_ip\.sql/);
  });

  test('lo que contesta el servicio no corre', async () => {
    const e = await revisada({ geo: { '181.1.1.1': { ip: '181.1.1.1', success: true, city: '<img src=x onerror=alert(1)>',
      country: 'Colombia', country_code: 'CO', connection: { isp: '<script>alert(2)</script>' } } } });
    const h = e.resultado();
    assert.ok(!/<img|<script/i.test(h), 'una etiqueta del servicio se pintó');
    assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test('fuera de Colombia, en ámbar y sin veredicto', async () => {
    const e = await revisada({ geo: { '181.1.1.1': { ip: '181.1.1.1', success: true, city: 'Madrid', region: 'Madrid',
      country: 'España', country_code: 'ES' } } });
    const t = tarjetaDe(e.resultado(), 'Ana Red');
    assert.match(t, /Madrid, España/);
    assert.match(t, /chip mora[^>]*>🌎 Fuera de Colombia/);
    assert.equal(/verific|aprobad|confiable|coincide|✓|✔|✅/i.test(e.resultado() + e.avisos()), false);
  });

  test('si no llegó app/ubicacion-ip.js: un aviso, y las reglas corren igual', async () => {
    const e = await revisada({ banco: { sin: ['../app/ubicacion-ip.js'] } });
    assert.match(textoPlano(e.avisos()), /No cargó app\/ubicacion-ip\.js/);
    assert.equal(geo(e).length, 0);
    assert.match(e.progreso(), /Listo:/);
  });
});
