/* ============================================================================
 * LA UBICACIÓN APROXIMADA POR INTERNET — app/ubicacion-ip.js
 * 8 de octubre de 2026.
 *
 *   node --test pruebas/ubicacion-ip.test.js
 *
 * Joan: «no es necesario preguntar por la dirección, mejor con la dirección IP
 * validamos una ubicación aproximada y la dejamos anotada automáticamente».
 * Lo que estas pruebas cuidan, en orden de lo que más cuesta si se rompe:
 *
 *   1. LO QUE NO ES IP NO LLEGA A LA URL. La IP sale de la base, pero la
 *      dirección de la consulta la arma este módulo: una IP con basura sería
 *      una petición a donde la basura diga.
 *   2. LO QUE CONTESTA EL SERVICIO ES DE AFUERA: se limpia, se recorta, y una
 *      respuesta sobre OTRA IP no se toma.
 *   3. UNA VEZ POR IP: dos preguntas a la vez son una petición; lo guardado no
 *      se vuelve a preguntar; lo que falló por la red sí.
 *   4. LAS PALABRAS: siempre «aproximada» y «no es la dirección», y ningún
 *      fallo culpa a la persona.
 *   5. LA CAPA DE CORTESÍA: dos a la vez, pausa con el 429, sin cookies ni
 *      página de origen.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../app/ubicacion-ip.js');

const BOGOTA = { ip: '181.1.1.1', success: true, city: 'Bogotá', region: 'Distrito Capital de Bogotá',
  country: 'Colombia', country_code: 'CO', connection: { isp: 'COMCEL S.A.' } };
const SOACHA = { ip: '186.2.2.2', success: true, city: 'Soacha', region: 'Cundinamarca',
  country: 'Colombia', country_code: 'CO', connection: { org: 'Telmex Colombia' } };

const respuesta = (cuerpo, status) => ({ ok: (status || 200) < 300, status: status || 200,
  text: () => Promise.resolve(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });

function almacen() {
  const datos = {}, escrituras = [];
  return { datos, escrituras,
    getItem: k => (Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null),
    setItem: (k, v) => { escrituras.push(k); datos[k] = String(v); } };
}
/* Un servicio de mentira que contesta por IP y anota lo que le pidieron. */
function servicio(porIP, opciones) {
  const o = opciones || {};
  const pedidos = [];
  const fetch = (url, cfg) => {
    pedidos.push({ url, cfg });
    if (o.cae) return Promise.reject(new TypeError('Failed to fetch'));
    if (o.status) return Promise.resolve(respuesta({ success: false, message: 'Rate limit exceeded' }, o.status));
    const ip = decodeURIComponent(String(url).slice('https://ipwho.is/'.length).split('?')[0]);
    const r = porIP[ip];
    return Promise.resolve(respuesta(r || { ip, success: false, message: 'Reserved range' }));
  };
  return { fetch, pedidos };
}

describe('lo que no es IP no llega a la URL', () => {

  test('la primera de la lista, sin el prefijo ::ffff:', () => {
    assert.equal(U.normalizarIP(' 181.1.1.1, 10.0.0.1'), '181.1.1.1');
    assert.equal(U.normalizarIP('::ffff:181.1.1.1'), '181.1.1.1');
    assert.equal(U.normalizarIP('2800:E2:2780:E2F::1'), '2800:e2:2780:e2f::1');
  });

  test('basura, rutas y etiquetas no pasan', () => {
    ['181.1.1.1/../../x', '181.1.1.1?x=1', '<img src=x>', '999.1.1.1', '1.2.3', 'localhost',
     '181.1.1.1#a', 'javascript:alert(1)', '2800::e2::1', '12345::1', '', null, undefined, 42, {}]
      .forEach(v => assert.equal(U.normalizarIP(v), '', 'dejó pasar ' + JSON.stringify(v)));
  });

  test('la URL lleva solo la IP, en https, sin llave', () => {
    const url = U.urlConsulta('181.1.1.1');
    assert.match(url, /^https:\/\/ipwho\.is\/181\.1\.1\.1\?lang=es&fields=/);
    assert.ok(!/key|token|apikey/i.test(url), 'la consulta lleva una llave: no hay ninguna que poner');
    assert.equal(U.urlConsulta('2800:e2:2780:e2f::1').split('?')[0], 'https://ipwho.is/2800:e2:2780:e2f::1');
    assert.equal(U.urlConsulta('181.1.1.1/x'), '');
    assert.equal(U.urlConsulta('10.0.0.1'), '', 'una red privada no se pregunta: el servicio no la conoce');
  });

  test('las redes privadas se reconocen y no gastan una consulta', () => {
    ['10.0.0.1', '192.168.1.5', '172.16.0.1', '172.31.255.1', '127.0.0.1', '100.64.0.1', '100.127.1.1',
     '169.254.1.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1']
      .forEach(ip => assert.equal(U.esPrivada(U.normalizarIP(ip)), true, ip + ' no se reconoció como privada'));
    ['181.1.1.1', '186.2.2.2', '172.32.0.1', '100.128.0.1', '2800:e2:2780:e2f::1']
      .forEach(ip => assert.equal(U.esPrivada(U.normalizarIP(ip)), false, ip + ' se tomó por privada'));
    assert.deepEqual(U.ipConsultable('192.168.0.10'), { ip: '192.168.0.10', motivo: 'privada' });
    assert.deepEqual(U.ipConsultable(''), { ip: '', motivo: 'sin_ip' });
    assert.deepEqual(U.ipConsultable('nada'), { ip: '', motivo: 'invalida' });
  });
});

describe('lo que contesta el servicio es de afuera', () => {

  test('se toma campo por campo, con la fecha que pone quien consulta', () => {
    const u = U.ubicacionDe(BOGOTA, '181.1.1.1', '2026-10-08');
    assert.deepEqual(u, { ip: '181.1.1.1', ciudad: 'Bogotá', region: 'Distrito Capital de Bogotá', pais: 'Colombia',
      codigo_pais: 'CO', red: 'COMCEL S.A.', fuente: 'ipwho.is', consultada: '2026-10-08' });
  });

  test('una respuesta sobre OTRA IP no se toma', () => {
    assert.equal(U.ubicacionDe(Object.assign({}, BOGOTA, { ip: '8.8.8.8' }), '181.1.1.1', '2026-10-08'), null);
  });

  test('success false, vacío o sin lugar: nada', () => {
    assert.equal(U.ubicacionDe({ success: false, message: 'Reserved range' }, '181.1.1.1'), null);
    assert.equal(U.ubicacionDe({ success: true, ip: '181.1.1.1' }, '181.1.1.1'), null);
    assert.equal(U.ubicacionDe('{"success":true}', '181.1.1.1'), null);
    assert.equal(U.ubicacionDe(null, '181.1.1.1'), null);
  });

  test('sin caracteres de control, recortado, y el código de país solo si son dos letras', () => {
    const u = U.ubicacionDe({ ip: '181.1.1.1', success: true, city: 'Bo\u0000go\ntá\u2028', region: 'x'.repeat(500),
      country: 'Colombia', country_code: 'C0<' , connection: { isp: { malo: 1 } } }, '181.1.1.1', '2026-10-08');
    assert.equal(u.ciudad, 'Bo go tá');
    assert.equal(u.region.length, 80);
    assert.equal(u.codigo_pais, '');
    assert.equal(u.red, '', 'un objeto en el campo de la red se coló como texto');
  });

  test('lo guardado (nube, ficha, caché) vuelve a pasar por la reja y tiene que ser de ESA IP', () => {
    const u = U.ubicacionDe(BOGOTA, '181.1.1.1', '2026-10-08');
    assert.deepEqual(U.ubicacionValida(u, '181.1.1.1'), u);
    assert.equal(U.ubicacionValida(u, '181.9.9.9'), null, 'la ciudad de otra IP se le pegó a este registro');
    assert.equal(U.ubicacionValida(Object.assign({}, u, { fuente: 'mal"o' }), '181.1.1.1').fuente, 'ipwho.is');
    assert.equal(U.ubicacionValida('Bogotá', '181.1.1.1'), null);
  });
});

describe('las palabras', () => {

  test('la frase de Joan, con el departamento cuando no repite la ciudad', () => {
    assert.equal(U.frase(U.ubicacionDe(SOACHA, '186.2.2.2')), 'Ubicación aproximada por internet: Soacha, Cundinamarca (no es la dirección)');
    assert.equal(U.frase(U.ubicacionDe(BOGOTA, '181.1.1.1')), 'Ubicación aproximada por internet: Bogotá (no es la dirección)',
      'repitió «Distrito Capital de Bogotá» después de Bogotá');
  });

  test('fuera de Colombia se dice el país, y se marca', () => {
    const u = U.ubicacionDe({ ip: '8.8.8.8', success: true, city: 'Miami', region: 'Florida', country: 'Estados Unidos',
      country_code: 'US' }, '8.8.8.8');
    assert.equal(U.lugar(u), 'Miami, Florida, Estados Unidos');
    assert.equal(U.fueraDeColombia(u), true);
    assert.equal(U.fueraDeColombia(U.ubicacionDe(BOGOTA, '181.1.1.1')), false);
  });

  test('ningún renglón de fallo culpa a la persona ni promete de más', () => {
    ['sin_ip', 'invalida', 'privada', 'sin_datos', 'limite', 'servicio', 'sin_conexion', 'sin_red', 'sin_modulo', 'otro']
      .forEach(m => {
        const t = U.fraseFallo(m);
        assert.ok(t.length > 20, m + ' no dice nada');
        assert.ok(!/fals|mint|sospech|fraud|verific|direcci[oó]n real/i.test(t), m + ': «' + t + '»');
      });
  });
});

describe('una vez por IP', () => {

  test('dos preguntas a la vez por la misma IP son UNA petición', async () => {
    const s = servicio({ '181.1.1.1': BOGOTA });
    const C = U.crearConsultor({ fetch: s.fetch, hoy: () => '2026-10-08' });
    const [a, b] = await Promise.all([C.consultar('181.1.1.1'), C.consultar('181.1.1.1, 10.0.0.1')]);
    assert.equal(s.pedidos.length, 1);
    assert.equal(a.ok, true); assert.equal(b.ok, true);
    assert.equal(a.ubicacion.ciudad, 'Bogotá');
  });

  test('lo consultado se guarda en el almacén y otra página no vuelve a preguntar', async () => {
    const s = servicio({ '181.1.1.1': BOGOTA });
    const a = almacen();
    await U.crearConsultor({ fetch: s.fetch, almacen: a }).consultar('181.1.1.1');
    const r = await U.crearConsultor({ fetch: s.fetch, almacen: a }).consultar('181.1.1.1');
    assert.equal(s.pedidos.length, 1, 'con la IP ya guardada se le volvió a preguntar al servicio');
    assert.equal(r.de, 'cache');
    assert.ok(!/data:image|base64/.test(a.datos[U.LLAVE]));
  });

  test('las «lecturas» se leen y no se escriben (la revisión no toca el localStorage del CRM)', async () => {
    const s = servicio({ '181.1.1.1': BOGOTA, '186.2.2.2': SOACHA });
    const delCRM = almacen(), pestania = almacen();
    await U.crearConsultor({ fetch: s.fetch, almacen: delCRM }).consultar('181.1.1.1');
    delCRM.escrituras.length = 0;
    const C = U.crearConsultor({ fetch: s.fetch, almacen: pestania, lecturas: [delCRM] });
    const r1 = await C.consultar('181.1.1.1');
    await C.consultar('186.2.2.2');
    assert.equal(r1.de, 'cache', 'no leyó la caché que el CRM ya tenía');
    assert.equal(s.pedidos.length, 2);
    assert.deepEqual(delCRM.escrituras, [], 'escribió en un almacén que solo tenía que leer');
    assert.ok(pestania.datos[U.LLAVE].includes('Soacha'));
  });

  test('lo que falló por la red NO se guarda: la próxima vez se vuelve a intentar', async () => {
    const a = almacen();
    const caido = servicio({}, { cae: true });
    const r = await U.crearConsultor({ fetch: caido.fetch, almacen: a }).consultar('181.1.1.1');
    assert.deepEqual(r, { ok: false, motivo: 'sin_conexion' });
    assert.equal(a.datos[U.LLAVE], undefined);
    const bien = servicio({ '181.1.1.1': BOGOTA });
    assert.equal((await U.crearConsultor({ fetch: bien.fetch, almacen: a }).consultar('181.1.1.1')).ok, true);
  });

  test('«Reserved range» no se repregunta en la misma sesión; una IP privada ni se pregunta', async () => {
    const s = servicio({});
    const C = U.crearConsultor({ fetch: s.fetch });
    assert.equal((await C.consultar('181.7.7.7')).motivo, 'privada');
    assert.equal((await C.consultar('181.7.7.7')).motivo, 'privada');
    assert.equal(s.pedidos.length, 1);
    assert.equal((await C.consultar('192.168.1.1')).motivo, 'privada');
    assert.equal(s.pedidos.length, 1, 'se gastó una consulta en una red privada');
  });

  test('un servicio que contesta 500 o basura: «servicio», sin inventar', async () => {
    const C = U.crearConsultor({ fetch: () => Promise.resolve(respuesta('<html>caído</html>')) });
    assert.deepEqual(await C.consultar('181.1.1.1'), { ok: false, motivo: 'servicio' });
    const C2 = U.crearConsultor({ fetch: () => Promise.resolve(respuesta({}, 500)) });
    assert.deepEqual(await C2.consultar('181.1.1.1'), { ok: false, motivo: 'servicio' });
  });

  test('la caché no crece sin fin: se olvidan las más viejas', async () => {
    const a = almacen();
    let reloj = 0;
    const porIP = {};
    for (let i = 0; i < U.MAX_ENTRADAS + 5; i++) porIP['181.1.' + Math.floor(i / 250) + '.' + (i % 250 + 1)] = null;
    const ips = Object.keys(porIP);
    const fetch = url => {
      const ip = String(url).slice('https://ipwho.is/'.length).split('?')[0];
      return Promise.resolve(respuesta(Object.assign({}, BOGOTA, { ip })));
    };
    const C = U.crearConsultor({ fetch, almacen: a, ahora: () => ++reloj });
    for (const ip of ips) await C.consultar(ip);
    const guardadas = Object.keys(JSON.parse(a.datos[U.LLAVE]).ips);
    assert.equal(guardadas.length, U.MAX_ENTRADAS);
    assert.ok(!guardadas.includes(ips[0]), 'se quedó la más vieja');
    assert.ok(guardadas.includes(ips[ips.length - 1]), 'se perdió la más nueva');
  });
});

describe('la cortesía con el servicio', () => {

  test('sin cookies y sin decir desde qué página se pregunta', async () => {
    const s = servicio({ '181.1.1.1': BOGOTA });
    await U.crearConsultor({ fetch: s.fetch }).consultar('181.1.1.1');
    assert.equal(s.pedidos[0].cfg.method, 'GET');
    assert.equal(s.pedidos[0].cfg.credentials, 'omit');
    assert.equal(s.pedidos[0].cfg.referrerPolicy, 'no-referrer');
    assert.equal(s.pedidos[0].cfg.body, undefined, 'la consulta llevó un cuerpo');
  });

  test('dos a la vez, nunca más', async () => {
    let abiertas = 0, maximo = 0;
    const soltar = [];
    const fetch = url => {
      abiertas++; maximo = Math.max(maximo, abiertas);
      const ip = String(url).slice('https://ipwho.is/'.length).split('?')[0];
      return new Promise(res => soltar.push(() => { abiertas--; res(respuesta(Object.assign({}, BOGOTA, { ip }))); }));
    };
    const C = U.crearConsultor({ fetch });
    let hechas = 0;
    const ips = ['181.1.1.1', '181.1.1.2', '181.1.1.3', '181.1.1.4', '181.1.1.5'];
    const todas = ips.map(ip => C.consultar(ip).then(x => { hechas++; return x; }));
    /* La petición sale en el siguiente turno (dentro de una promesa): se va
       soltando de a una hasta que contestaron todas. */
    for (let i = 0; i < 200 && hechas < ips.length; i++) {
      await new Promise(r => setImmediate(r));
      const s = soltar.shift(); if (s) s();
    }
    const r = await Promise.all(todas);
    assert.equal(maximo, 2, 'se abrieron ' + maximo + ' consultas a la vez');
    assert.ok(r.every(x => x.ok));
  });

  test('un 429 pone una pausa: las siguientes no golpean', async () => {
    const s = servicio({}, { status: 429 });
    let t = 1000;
    const C = U.crearConsultor({ fetch: s.fetch, ahora: () => t });
    assert.equal((await C.consultar('181.1.1.1')).motivo, 'limite');
    assert.equal((await C.consultar('181.1.1.2')).motivo, 'limite');
    assert.equal(s.pedidos.length, 1, 'siguió preguntando después del 429');
    t += 16 * 60 * 1000;
    await C.consultar('181.1.1.3');
    assert.equal(s.pedidos.length, 2, 'pasada la pausa no volvió a intentar');
  });

  test('sin función de red: lo dice, no revienta', async () => {
    assert.deepEqual(await U.crearConsultor({}).consultar('181.1.1.1'), { ok: false, motivo: 'sin_red' });
  });
});

describe('dónde vive y dónde NO', () => {
  const fs = require('node:fs'), path = require('node:path');
  const RAIZ = path.join(__dirname, '..');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

  test('nada que use el CLIENTE carga el módulo ni llama al servicio: se consulta solo desde lo de Joan', () => {
    ['play/index.html', 'app/socio.html', 'platachat/index.html', 'index.html', 'app/cuenta.js']
      .filter(f => fs.existsSync(path.join(RAIZ, f)))
      .forEach(f => {
        /* Lo que CARGA o LLAMA, no la prosa: un comentario o un texto legal
           que cuente que la ubicación sale de ipwho.is está bien. */
        const t = leer(f);
        assert.ok(!/src=["'][^"']*ubicacion-ip\.js|https:\/\/ipwho\.is\/|UbicacionIP\./.test(t),
          f + ' consulta la ubicación desde el teléfono del cliente');
      });
  });

  test('el CRM y la revisión sí, y el CRM ya no manda a Joan a ipinfo.io', () => {
    assert.match(leer('panel/revision.html'), /<script src="\.\.\/app\/ubicacion-ip\.js"><\/script>/);
    const crm = leer('panel/crm.html');
    assert.match(crm, /URL_UBICACION_IP='\.\.\/app\/ubicacion-ip\.js'/);
    assert.ok(!/href="https:\/\/ipinfo\.io/.test(crm), 'quedó el enlace viejo a ipinfo.io');
  });

  test('el módulo dice qué servicio usa y dónde se leyeron sus condiciones', () => {
    assert.equal(U.FUENTE.nombre, 'ipwho.is');
    assert.equal(U.FUENTE.condiciones, 'https://ipwhois.io/pricing');
    const t = leer('app/ubicacion-ip.js');
    assert.match(t, /Commercial use allowed/);
    assert.match(t, /internal business purposes/);
  });
});
