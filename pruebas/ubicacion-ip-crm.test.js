/* ============================================================================
 * LA UBICACIÓN APROXIMADA EN EL CRM — panel/crm.html, ejecutado
 * 8 de octubre de 2026.
 *
 *   node --test pruebas/ubicacion-ip-crm.test.js
 *
 * Joan quitó la dirección obligatoria del registro y pidió que la ubicación
 * aproximada saliera sola, por la IP, y quedara anotada. Estas pruebas
 * arrancan el CRM de verdad (banco-panel.js) contra una nube y un ipwho.is de
 * mentira, y miran lo que pinta y lo que manda:
 *
 *   · sale escrita, con «aproximada» y «no es la dirección», en «👁 Ver
 *     datos», en la lista de Registrados, en la ficha y en el cruce;
 *   · queda anotada: en el registro (anotar_ubicacion_ip) y en la ficha, y
 *     lo anotado no se vuelve a preguntar;
 *   · lo que contesta el servicio no corre como código;
 *   · cuando no se puede, lo dice en un renglón, sin culpar a nadie.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const UbicacionIP = require('../app/ubicacion-ip.js');

const GEO = {
  '181.1.1.1': { ip: '181.1.1.1', success: true, city: 'Bogotá', region: 'Distrito Capital de Bogotá',
                 country: 'Colombia', country_code: 'CO', connection: { isp: 'COMCEL S.A.' } },
  '186.2.2.2': { ip: '186.2.2.2', success: true, city: 'Soacha', region: 'Cundinamarca',
                 country: 'Colombia', country_code: 'CO', connection: { isp: 'Telmex' } }
};
const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)) });

function nube(opciones) {
  const o = opciones || {};
  const llamadas = [];
  const red = (url, cfg) => {
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    llamadas.push({ url, cuerpo, cfg });
    if (url.startsWith('https://ipwho.is/')) {
      if (o.geoCae) return Promise.reject(new TypeError('Failed to fetch'));
      const ip = decodeURIComponent(url.slice('https://ipwho.is/'.length).split('?')[0]);
      return Promise.resolve(resp(200, (o.geo || GEO)[ip] || { ip, success: false, message: 'Reserved range' }));
    }
    const fn = url.split('/rpc/')[1];
    if (fn === 'anotar_ubicacion_ip') {
      if (o.sinFuncion) return Promise.resolve(resp(404, { message: 'Could not find the function' }));
      return Promise.resolve(resp(200, { ok: true, ubicacion_ip: Object.assign({}, cuerpo.p_ubicacion, { consultada: '2026-10-08' }) }));
    }
    if (fn === 'archivos_de_registro') return Promise.resolve(resp(200, { fotos: {}, huella: null }));
    if (fn === 'cuentas_de_registros') return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(200, null));
  };
  return { red, llamadas };
}

function crm(opciones) {
  const o = opciones || {};
  const n = nube(o);
  const P = abrirPanel({ red: n.red });
  /* En un navegador el CRM baja app/ubicacion-ip.js al primer registro con
     IP; el banco no tiene <script>, así que se le entrega ya cargado (salvo
     cuando se prueba que no llegó). */
  if (!o.sinModulo) P.ctx.UbicacionIP = UbicacionIP;
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.cargarCartera(o.cartera || { socios: [], prestamos: [] });
  P.n = n;
  P.geo = () => n.llamadas.filter(l => l.url.startsWith('https://ipwho.is/'));
  P.anotadas = () => n.llamadas.filter(l => /\/rpc\/anotar_ubicacion_ip$/.test(l.url));
  return P;
}
const registro = (extra) => Object.assign({ id: 9, nombre: 'Ana Prueba', cedula: '52000000', telefono: '3001234567',
  estado: 'nuevo', origen: 'abierto', creado_en: '2026-10-08T15:00:00Z',
  /* 8-oct-2026 (segunda vuelta): aceptó la política que nombra a ipwho.is; sin
     esto la IP no se consulta (autorizaUbicacion). */
  datos: { nombres: 'Ana', celular: '3001234567', autorizacion_version: '2026-10-08' },
  huella: { ip: '181.1.1.1, 10.0.0.1', aparato: 'Mozilla/5.0 (Linux; Android 13)', momento: '2026-10-08T15:01:00Z' } }, extra || {});
function ponerRegistros(P, lista) { P.ctx.__regs = lista; P.ev('_registros=__regs'); }
/* El hueco que pintó la pantalla, y lo que quedó adentro después. */
function huecos(html) { return [...String(html).matchAll(/id="(ubicIP_\d+)"/g)].map(m => m[1]); }
const texto = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('«👁 Ver datos» de un registrado', () => {

  test('la ubicación sale sola, escrita como la pidió Joan, y ya no hay enlace a ipinfo', async () => {
    const P = crm();
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    const cuerpo = P.ev('document.getElementById("mBody").innerHTML');
    assert.ok(!/ipinfo\.io/.test(cuerpo), 'quedó el enlace a ipinfo.io que había que tocar uno por uno');
    assert.match(cuerpo, /181\.1\.1\.1/, 'la IP dejó de verse');
    const [id] = huecos(cuerpo);
    assert.ok(id, 'no dejó el hueco de la ubicación');
    await asentar(12);
    const t = texto(P.elems[id].innerHTML);
    assert.match(t, /Ubicación aproximada por internet: Bogotá \(no es la dirección\)/);
    assert.match(t, /Red: COMCEL S\.A\./);
    assert.match(t, /Consultada en ipwho\.is/);
  });

  test('se pregunta UNA vez y queda anotada en el registro de la nube', async () => {
    const P = crm();
    const r = registro();
    ponerRegistros(P, [r]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    assert.equal(P.geo().length, 1);
    assert.match(P.geo()[0].url, /^https:\/\/ipwho\.is\/181\.1\.1\.1\?lang=es/, 'no preguntó por la primera IP de la huella');
    const a = P.anotadas();
    assert.equal(a.length, 1, 'no la anotó en el registro');
    assert.equal(a[0].cuerpo.p_id, 9);
    assert.equal(a[0].cuerpo.p_clave, 'clave-de-prueba-larga');
    assert.equal(a[0].cuerpo.p_ubicacion.ip, '181.1.1.1');
    assert.equal(a[0].cuerpo.p_ubicacion.ciudad, 'Bogotá');
    assert.equal(P.ev('_registros[0].huella.ubicacion_ip.ciudad'), 'Bogotá', 'lo anotado no quedó en el registro en memoria');
    /* Volver a abrirlo: ni el servicio ni la nube otra vez. */
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    assert.equal(P.geo().length, 1, 'volvió a preguntarle al servicio por la misma IP');
    assert.equal(P.anotadas().length, 1, 'volvió a anotar lo que ya estaba anotado');
  });

  test('lo que ya trae el registro de la nube no se pregunta', async () => {
    const P = crm();
    const u = UbicacionIP.ubicacionDe(GEO['186.2.2.2'], '186.2.2.2', '2026-10-07');
    ponerRegistros(P, [registro({ huella: { ip: '186.2.2.2', ubicacion_ip: u } })]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.match(texto(P.elems[id].innerHTML), /Soacha, Cundinamarca \(no es la dirección\)/);
    assert.equal(P.geo().length, 0);
    assert.equal(P.anotadas().length, 0);
  });

  test('una ubicación anotada para OTRA IP no se le pega: se vuelve a preguntar', async () => {
    const P = crm();
    const vieja = UbicacionIP.ubicacionDe(GEO['186.2.2.2'], '186.2.2.2', '2026-10-07');
    ponerRegistros(P, [registro({ huella: { ip: '181.1.1.1', ubicacion_ip: vieja } })]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.match(texto(P.elems[id].innerHTML), /Bogotá/);
    assert.ok(!/Soacha/.test(P.elems[id].innerHTML), 'pintó la ciudad de la IP vieja');
    assert.equal(P.geo().length, 1);
  });

  test('lo que contesta el servicio no corre como código', async () => {
    const malo = { ip: '181.1.1.1', success: true, city: '<img src=x onerror=alert(1)>', region: '"><script>alert(2)</script>',
                   country: 'Colombia', country_code: 'CO', connection: { isp: '<b onmouseover=alert(3)>red</b>' } };
    const P = crm({ geo: { '181.1.1.1': malo } });
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    const h = P.elems[id].innerHTML;
    assert.ok(!/<img|<script|<b /i.test(h), 'una etiqueta que vino del servicio se pintó: ' + h);
    assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test('si la nube todavía no tiene la función, se dice dónde está el archivo', async () => {
    const P = crm({ sinFuncion: true });
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    await asentar(14);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    const t = texto(P.elems[id].innerHTML);
    assert.match(t, /Bogotá/, 'sin la función la ubicación dejó de verse');
    assert.match(t, /falta pegar base\/20261008_ubicacion_por_ip\.sql/);
    /* Y no se vuelve a intentar con cada registro: ya se sabe que falta. */
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    assert.equal(P.anotadas().length, 1);
  });

  test('sin conexión con el servicio: un renglón honesto, y nada anotado', async () => {
    const P = crm({ geoCae: true });
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.match(texto(P.elems[id].innerHTML), /No pude consultar la ubicación aproximada \(sin conexión con ipwho\.is\)/);
    assert.equal(P.anotadas().length, 0);
  });

  test('una IP de red privada no se pregunta, y se dice por qué no hay ciudad', async () => {
    const P = crm();
    ponerRegistros(P, [registro({ huella: { ip: '192.168.0.20' } })]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.match(texto(P.elems[id].innerHTML), /red privada/);
    assert.equal(P.geo().length, 0);
  });

  test('si no llegó app/ubicacion-ip.js, lo dice en vez de quedarse «buscando»', async () => {
    const P = crm({ sinModulo: true });
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.match(texto(P.elems[id].innerHTML), /No cargó app\/ubicacion-ip\.js/);
    assert.equal(P.geo().length, 0);
  });
});

describe('📥 Registrados, la lista', () => {

  test('cada uno con su ciudad aproximada, y el que no tiene IP sin renglón', async () => {
    const P = crm();
    ponerRegistros(P, [registro(), registro({ id: 10, nombre: 'Sin Huella', telefono: '3009998888', cedula: '1', huella: null })]);
    P.ev('renderRegistros()');
    const tabla = P.elems.tblRegistros.innerHTML;
    const ids = huecos(tabla);
    assert.equal(ids.length, 1, 'pintó hueco de ubicación para quien no tiene IP');
    await asentar(12);
    const t = texto(P.elems[ids[0]].innerHTML);
    assert.match(t, /📍 Bogotá · aprox\. por internet/);
    assert.match(P.elems[ids[0]].innerHTML, /title="Ubicación aproximada por internet: Bogotá \(no es la dirección\)"/);
    assert.equal(P.anotadas().length, 1, 'la lista no dejó anotada la ubicación');
  });

  test('fuera de Colombia se marca en ámbar, sin veredicto', async () => {
    const P = crm({ geo: { '181.1.1.1': { ip: '181.1.1.1', success: true, city: 'Miami', region: 'Florida',
      country: 'Estados Unidos', country_code: 'US' } } });
    ponerRegistros(P, [registro()]);
    P.ev('renderRegistros()');
    await asentar(12);
    const [id] = huecos(P.elems.tblRegistros.innerHTML);
    const h = P.elems[id].innerHTML;
    assert.match(h, /Miami, Florida, Estados Unidos/);
    assert.match(h, /chip mora[^>]*>🌎 Fuera de Colombia/);
    assert.ok(!/fraude|falso|miente|verificad/i.test(texto(h)));
  });
});

describe('la ficha y el cruce', () => {

  test('la ficha la muestra y la deja anotada en su huella', async () => {
    /* 8-oct-2026 (segunda vuelta): con la versión de la política que aceptó en
       su vinculación (viaja del registro a la ficha). */
    const P = crm({ cartera: { socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567',
      gestiones: [], vinculacion: { autorizacion_version: '2026-10-08' },
      huellaRegistro: { ip: '181.1.1.1', aparato: '', momento: '2026-10-08T15:01:00Z' } }], prestamos: [] } });
    P.ev('verCliente("C1")');
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.ok(id, 'la ficha no dejó el hueco de la ubicación');
    await asentar(12);
    assert.match(texto(P.elems[id].innerHTML), /Bogotá \(no es la dirección\)/);
    const s = JSON.parse(P.almacen.joan_socios_v1).socios[0];
    assert.equal(s.huellaRegistro.ubicacionIP.ciudad, 'Bogotá', 'no quedó anotada en la ficha');
    assert.equal(s.huellaRegistro.ubicacionIP.ip, '181.1.1.1');
    assert.equal(P.anotadas().length, 0, 'una ficha no es un registro: no se anota con anotar_ubicacion_ip');
    /* Otra vez: ya está en la ficha. */
    P.ev('verCliente("C1")');
    await asentar(12);
    assert.equal(P.geo().length, 1);
  });

  test('la mesa de cruce y «¿Es la misma persona?» la muestran', async () => {
    const P = crm({ cartera: { socios: [{ id: 'C1', numero: 1, nombre: 'Ana Prueba', cedula: '52000000',
      telefono: '3001234567', gestiones: [] }], prestamos: [] } });
    ponerRegistros(P, [registro()]);
    P.ev('mesaDeCruce(9,"C1")');
    let [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.ok(id, 'la mesa de cruce no tiene el renglón de la ubicación');
    await asentar(12);
    assert.match(texto(P.elems[id].innerHTML), /Ubicación aproximada por internet: Bogotá/);
    P.ev('abrirJuntarCuenta(9,"C1")');
    [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    assert.ok(id, '«¿Es la misma persona?» no tiene el renglón de la ubicación');
    await asentar(12);
    assert.match(texto(P.elems[id].innerHTML), /Bogotá/);
    assert.equal(P.geo().length, 1, 'el cruce volvió a preguntar por la misma IP');
  });
});

describe('lo que se guarda en este navegador', () => {

  test('la caché lleva la ubicación y la IP, nada del registro ni de las fotos', async () => {
    const P = crm();
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const c = P.almacen[UbicacionIP.LLAVE];
    assert.ok(c, 'no quedó en la caché del navegador');
    assert.ok(!/Ana|52000000|3001234567|base64/.test(c), 'la caché guardó datos del registro: ' + c);
  });

  test('la consulta sale del CRM sin cookies y sin decir desde qué página', async () => {
    const P = crm();
    ponerRegistros(P, [registro()]);
    P.ev('verDatosRegistro(9)');
    await asentar(12);
    const cfg = P.geo()[0].cfg || {};
    assert.equal(cfg.credentials, 'omit');
    assert.equal(cfg.referrerPolicy, 'no-referrer');
  });
});
