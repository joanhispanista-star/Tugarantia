/* ============================================================================
 * EL TELÉFONO DE VERDAD, EN LAS PANTALLAS — 19 de octubre de 2026
 *
 *   node --test pruebas/aparato-pantallas.test.js
 *
 * Las páginas arrancadas de verdad con sus bancos:
 *   · el CRM de Joan (bloqueHuella) dice «Tipo de celular» con lo que informó
 *     el teléfono, o «el modelo no se supo»; nunca «Android 10 · K»;
 *   · la ficha del gerente ya no pinta el user-agent crudo (William veía
 *     «Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML»);
 *   · «📱 Desde qué celular pidió» pregunta a aparatos_de con la clave y pinta
 *     cada vez, y sin la migración dice cuál falta;
 *   · play/ anota al registrarse, al pedir y al aceptar, sin esperar y con
 *     keepalive; app/socio.html, al pedir.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirSocio } = require('./banco-socio.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
const ticks = async () => { for (let i = 0; i < 8; i++) await tick(); };

const CONGELADA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const INFORMADO = { plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14', navegador: 'Chrome',
                    navegador_version: '129', via: 'app_tu_garantia', momento: '2026-10-19T15:00:00Z' };

/* El CRM carga cuenta.js y aparato.js con <script src>; el banco del panel no
   trae ninguno de los dos (clave-del-equipo.test.js hace lo mismo). */
function panel(o) {
  const P = abrirPanel(o);
  if (!(o && o.sinModulos)) {
    P.ctx.CuentaSocio = require('../app/cuenta.js');
    P.ctx.Aparato = require('../app/aparato.js');
  }
  return P;
}
const huella = h => JSON.stringify(h);

/* ==========================================================================
 * 1. EL CRM DE JOAN
 * ======================================================================== */
describe('el CRM: «Tipo de celular»', () => {

  test('con lo que informó el teléfono: marca, modelo, versión, navegador y la app, con su nota', () => {
    const P = panel();
    const h = P.ev('bloqueHuella(' + huella({ ip: '181.50.1.2', aparato: CONGELADA, aparato_telefono: INFORMADO, momento: '2026-10-19T15:00:00Z' }) +
                   ', { registro: { id: 1, telefono: "300 111 2233" } })');
    assert.match(h, /<span class="k">Tipo de celular<\/span><span class="vv">Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía<div class="muted" style="font-size:12px">Lo informa el navegador del teléfono\.<\/div>/);
    assert.doesNotMatch(h, /Android 10|· K ·/, 'volvió a pintar la cadena congelada como el teléfono');
    /* Y el botón de cada vez que entró, con el celular en diez dígitos. */
    assert.match(h, /onclick="verAparatosDe\('3001112233','aparatos_\d+'\)">📱 Ver al registrarse, al pedir y al aceptar/);
  });

  test('un registro viejo, con la cadena congelada: «el modelo no se supo», y por qué', () => {
    const P = panel();
    const h = P.ev('bloqueHuella(' + huella({ ip: '181.50.1.2', aparato: CONGELADA }) + ', {})');
    assert.match(h, /Tipo de celular<\/span><span class="vv">Android · el modelo no se supo · Chrome 129/);
    assert.match(h, /anterior al 19-oct-2026/);
    assert.doesNotMatch(h, /Android 10|· K ·/);
  });

  test('un iPhone: «iPhone · iOS 26 · Safari» y que Apple no deja saber el modelo', () => {
    const P = panel();
    const h = P.ev('bloqueHuella(' + huella({ aparato: IPHONE26, aparato_telefono: { plataforma: 'ios', sistema_version: '26',
      navegador: 'Safari', sin_modelo: 'apple_no_lo_entrega', via: 'navegador' } }) + ', {})');
    assert.match(h, /iPhone · iOS 26 · Safari<div class="muted" style="font-size:12px">Apple no deja a una página saber el modelo exacto\./);
    assert.doesNotMatch(h, /iOS 18/);
  });

  test('si no llegaron los módulos, NO se pinta la cadena cruda', () => {
    const P = panel({ sinModulos: true });
    const h = P.ev('bloqueHuella(' + huella({ ip: '181.50.1.2', aparato: CONGELADA }) + ', {})');
    assert.doesNotMatch(h, /Mozilla\/5\.0|Android 10; K/, 'pintó el user-agent crudo: se lee como el teléfono y no lo es');
  });

  test('sin huella dice las tres causas, también la de no autorizar los datos sensibles', () => {
    const P = panel();
    assert.match(P.ev('bloqueHuella(null, {})'), /no autorizó los datos sensibles/);
  });

  test('lo informado viaja a la ficha del cliente por los tres caminos', () => {
    const P = panel();
    const r = JSON.parse(P.ev('JSON.stringify(huellaParaFicha(' + huella({ ip: '1.2.3.4', aparato: CONGELADA, momento: 'm', aparato_telefono: INFORMADO, gps: { lat: 1 } }) + '))'));
    assert.deepEqual(r, { ip: '1.2.3.4', aparato: CONGELADA, momento: 'm', aparato_telefono: INFORMADO });
    /* Los tres sitios que copiaban la huella a mano usan la misma función. */
    const CRM = leer('panel/crm.html');
    assert.equal((CRM.match(/[?=]huellaParaFicha\(h\)/g) || []).length, 3, 'no son los tres caminos los que la usan');
    assert.ok(CRM.indexOf("{ip:h.ip||'',aparato:h.aparato||'',momento:h.momento||''}:") < 0, 'volvió una copia a mano que no lleva el teléfono');
    /* Y la ficha del socio lo pinta. */
    const h = P.ev('bloqueHuella(Object.assign({}, ' + huella(r) + ', { gps: null }), { socio: { id: "s1", telefono: "3001112233" } })');
    assert.match(h, /Samsung SM-A155M · Android 14/);
  });
});

/* ==========================================================================
 * 2. LA FICHA DEL GERENTE
 * ======================================================================== */
describe('la ficha del gerente', () => {

  test('ya no pinta los primeros 60 caracteres del user-agent', () => {
    const P = panel();
    const h = P.ev('fichaHTML({ nombre: "Ana", registrado_en: "2026-10-01", cedula: "1", celular: "3001112233", datos: {}, fotos: {}, ' +
                   'huella: ' + huella({ aparato: CONGELADA, momento: '2026-10-01T10:00:00Z' }) + ' })');
    assert.doesNotMatch(h, /Mozilla\/5\.0|KHTML|Android 10; K/, 'William sigue viendo la cadena cruda');
    assert.match(h, /Tipo de celular<\/span><span class="vv">Android · el modelo no se supo · Chrome 129/);
  });

  test('y con lo informado, lo mismo que ve Joan', () => {
    const P = panel();
    const h = P.ev('fichaHTML({ nombre: "Ana", datos: {}, fotos: {}, huella: ' + huella({ aparato: CONGELADA, aparato_telefono: INFORMADO }) + ' })');
    assert.match(h, /Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía/);
    assert.match(h, /Lo informa el navegador del teléfono\./);
  });
});

/* ==========================================================================
 * 3. CADA VEZ QUE ENTRÓ (aparatos_de)
 * ======================================================================== */
describe('«📱 Desde qué celular pidió»', () => {
  const CFG = JSON.stringify({ url: 'https://x.supabase.co', anon: 'llave', clave: 'clave-de-prueba-larga-123' });

  function conNube(contesta) {
    const pedidos = [];
    const P = panel({ red: (url, cfg) => {
      pedidos.push({ url, cuerpo: JSON.parse(cfg.body) });
      const r = contesta(url);
      return Promise.resolve({ ok: r.status === 200, status: r.status, text: () => Promise.resolve(JSON.stringify(r.cuerpo)) });
    } });
    P.almacen.joan_socios_sb = CFG;
    return { P, pedidos };
  }

  test('pregunta con la clave y el celular, y pinta cada vez con su momento', async () => {
    const { P, pedidos } = conNube(() => ({ status: 200, cuerpo: { ok: true, aparatos: [
      { cuando: 'solicitud', momento: '2026-10-19T15:00:00+00:00', ip: '181.50.1.2', ua: CONGELADA, origen: 'telefono', declarado: INFORMADO },
      { cuando: 'registro', momento: '2026-10-18T15:00:00+00:00', ip: '181.50.1.2', ua: CONGELADA, origen: 'telefono', declarado: {} }
    ] } }));
    await P.ev('verAparatosDe("3001112233", "cajaAparatos")');
    assert.equal(pedidos.length, 1);
    assert.match(pedidos[0].url, /\/rest\/v1\/rpc\/aparatos_de$/);
    assert.deepEqual(pedidos[0].cuerpo, { p_clave: 'clave-de-prueba-larga-123', p_celular: '3001112233' });
    const h = P.elems.cajaAparatos.innerHTML;
    assert.ok(h.indexOf('Al pedir') < h.indexOf('Al registrarse'), 'no va de la más nueva a la más vieja');
    assert.match(h, /Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía/);
    assert.match(h, /Android · el modelo no se supo · Chrome 129/);
  });

  test('sin la migración del 19-oct lo dice con el nombre del archivo, no «supabase.sql»', async () => {
    const { P } = conNube(() => ({ status: 404, cuerpo: {} }));
    await P.ev('verAparatosDe("3001112233", "cajaAparatos")');
    assert.match(P.elems.cajaAparatos.innerHTML, /20261019_aparato_del_telefono\.sql/);
  });

  test('sin nada anotado, lo dice y dice desde cuándo se anota', async () => {
    const { P } = conNube(() => ({ status: 200, cuerpo: { ok: true, aparatos: [] } }));
    await P.ev('verAparatosDe("3001112233", "cajaAparatos")');
    assert.match(P.elems.cajaAparatos.innerHTML, /Se anota desde el 19-oct-2026/);
  });

  test('desde la bandeja de solicitudes: el botón 📱 y su ventana', async () => {
    const { P, pedidos } = conNube(() => ({ status: 200, cuerpo: { ok: true, aparatos: [] } }));
    P.ev('_solicitudes = [{ id: 7, nombre: "Ana", cedula: "3001112233", estado: "nueva" }]');
    await P.ev('verAparatosDeSolicitud(7)');
    assert.equal(pedidos[0].cuerpo.p_celular, '3001112233');
    assert.match(P.elems.mBody.innerHTML, /Es lo que el teléfono dice de sí mismo/);
    assert.match(leer('panel/crm.html'), /onclick="verAparatosDeSolicitud\('\$\{s\.id\}'\)" title="Desde qué celular pidió/);
    /* Una cédula de verdad no es un celular: no se pregunta por ella. */
    assert.equal(P.ev('celularDeSolicitud({ cedula: "1029384274" })'), '');
  });
});

/* ==========================================================================
 * 4. EL TELÉFONO LO MANDA (play/ y app/socio.html)
 * ======================================================================== */
describe('play/: anota sin esperar', () => {
  const capturar = 'window.__l = []; fetch = function (u, o) { window.__l.push({ u: String(u), o: o, c: JSON.parse(o.body || "{}") });' +
    ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(window.__r || { ok: true }); } }); };';
  const llamadas = P => JSON.parse(P.ev('JSON.stringify(window.__l.map(function (x) { return { u: x.u, c: x.c, keepalive: x.o.keepalive, auth: x.o.headers.Authorization }; }))'));

  test('anotarAparato manda lo que sabe con la sesión y keepalive; sin sesión, nada', async () => {
    const P = abrirPlay({});
    P.ev(capturar);
    P.ev('SESION = null; anotarAparato("registro")');
    await ticks();
    assert.equal(llamadas(P).length, 0, 'anotó sin sesión');
    P.ev('SESION = { access_token: "tok-1" }; anotarAparato("registro")');
    await ticks();
    const l = llamadas(P);
    assert.equal(l.length, 1);
    assert.match(l[0].u, /\/rest\/v1\/rpc\/aparato_anotar$/);
    assert.equal(l[0].c.p_cuando, 'registro');
    assert.equal(typeof l[0].c.p_declarado, 'object');
    assert.equal(l[0].keepalive, true, 'sin keepalive, en PlataChat la página se va y la llamada se cancela');
    assert.equal(l[0].auth, 'Bearer tok-1');
  });

  test('si app/aparato.js no llegó, no se cae nada', async () => {
    const P = abrirPlay({ sinAparato: true });
    assert.deepEqual(P.fallos, []);
    P.ev(capturar);
    P.ev('SESION = { access_token: "t" }; anotarAparato("registro")');
    await ticks();
    assert.equal(llamadas(P).length, 0);
  });

  test('al pedir: después de que la base recibió la solicitud, y solo entonces', async () => {
    const P = abrirPlay({});
    P.ev(capturar);
    P.ev('window.__r = { ok: true, solicitud: { id: 7, estado: "nueva", contrapropuesta: null, pedido: { origen: "play", capital: 300000, fecha_pago: "2026-11-20", dias: 30 } } };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarCuenta(); irA("credito");');
    await ticks();
    P.ev('window.__l = []; enviarPedido();');
    await ticks();
    const l = llamadas(P).map(x => x.u.replace(/^.*\/rpc\//, '') + (x.c.p_cuando ? ':' + x.c.p_cuando : ''));
    assert.deepEqual(l.filter(x => /solicitar_a_la_medida|aparato_anotar/.test(x)), ['solicitar_a_la_medida', 'aparato_anotar:solicitud']);
    /* Si la base la rechaza, no se anota nada. */
    P.ev('window.__l = []; window.__r = { ok: false, motivo: "minimo" }; PIDIENDO = false; enviarPedido();');
    await ticks();
    assert.ok(!llamadas(P).some(x => /aparato_anotar/.test(x.u)), 'anotó una solicitud que la base no recibió');
  });

  /* 22-oct-2026 — la aceptación lleva la cuenta a dónde consignar
     (aceptar_con_destino): se elige antes de tocar «Acepto». */
  test('al aceptar: después de aceptar_con_destino', async () => {
    const PROPUESTA = { id: 9, estado: 'contrapropuesta',
      contrapropuesta: { capital: 1500000, costo: 300000, total: 1800000, fecha_pago: '2026-11-14', dias: 37,
                         costo_pct: 20, texto: 'Te propongo esto', por: 'joan', creada_en: '2026-10-08T15:00:00Z' } };
    const P = abrirPlay({});
    P.ev(capturar);
    P.ev('window.__r = { ok: true, solicitud: ' + JSON.stringify(Object.assign({}, PROPUESTA, { estado: 'aceptada' })) + ' };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(PROPUESTA) + ');');
    P.ev("window.__l = []; marcarCondiciones(true); elegirDestino('otra'); medioDestino('nequi');" +
         " escribirDestino('numero', '300 111 2233'); escribirDestino('es_mia', true); aceptarContrapropuesta(9);");
    await ticks();
    const l = llamadas(P).map(x => x.u.replace(/^.*\/rpc\//, '') + (x.c.p_cuando ? ':' + x.c.p_cuando : ''));
    assert.deepEqual(l.filter(x => /aceptar_con|aparato_anotar/.test(x)), ['aceptar_con_destino', 'aparato_anotar:aceptacion']);
  });

  test('al registrarse: en los dos caminos que abren la cuenta, ANTES de pintar (PlataChat se va de la página)', () => {
    const PLAY = leer('play/index.html');
    /* 21-oct-2026 — la marca, con la sangría que sea: desde H4 el final del
       «ya tenías cuenta» va dentro de la promesa de la constancia, un nivel
       más adentro. Lo que se mira es lo mismo: la línea de antes anota. */
    const caminos = [
      ['enviarRegistro', /pintarRegistrado\(\);\r\n\s*subidaEnSegundoPlano\(\);   \/\/ si falla/],
      ['entrarConLaClaveDelRegistro', /pintarRegistrado\(\);\r\n\s*subidaEnSegundoPlano\(\);   \/\/ sus fotos/]
    ];
    caminos.forEach(([nombre, marca]) => {
      const t = PLAY.replace(/\r?\n/g, '\r\n');
      const m = marca.exec(t);
      const i = m ? m.index : -1;
      assert.ok(i > 0, 'no encontré el final de ' + nombre);
      const antes = t.slice(Math.max(0, i - 400), i);
      /* La línea de justo antes de pintarRegistrado() es la que anota. */
      assert.match(antes, /anotarAparato\('registro'\);[^\n]*\r\n\s*$/,
        nombre + ': no anota el aparato justo antes de pintarRegistrado()');
    });
    /* Y la app se recuerda al abrir, con el referrer de la primera carga. */
    assert.match(PLAY, /APARATO\.recordarApp\(document, localStorage\)/);
  });
});

describe('app/socio.html: anota al pedir', () => {
  const AHORA = Date.parse('2026-10-19T15:00:00Z');

  test('anotarAparatoSocio va por conSesion con su token; sin sesión no manda nada', async () => {
    const S = abrirSocio({ ahora: AHORA, red: () => ({ status: 200, cuerpo: { ok: true } }) });
    S.ev('SESION = null; anotarAparatoSocio("solicitud")');
    await ticks();
    assert.ok(!S.llamadas.some(x => /aparato_anotar/.test(x.url)), 'anotó sin sesión');
    S.ev('SESION = ' + JSON.stringify({ access_token: 'acceso-1', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112233' }) +
         '; anotarAparatoSocio("solicitud")');
    await ticks();
    const l = S.llamadas.filter(x => /rpc\/aparato_anotar$/.test(x.url));
    assert.equal(l.length, 1);
    assert.equal(l[0].cuerpo.p_cuando, 'solicitud');
    assert.equal(l[0].cab.Authorization, 'Bearer acceso-1');
  });

  test('mandarSolicitud anota solo cuando la base recibió la solicitud', () => {
    const SOCIO = leer('app/socio.html');
    const i = SOCIO.indexOf("'solicitar_por_sesion'");
    const tramo = SOCIO.slice(i, SOCIO.indexOf('var texto =', i));
    assert.match(tramo, /\.then\(function \(j\) \{[\s\S]*if \(j && j\.ok === true\) anotarAparatoSocio\('solicitud'\);[\s\S]*\}\)\.catch\(function \(\) \{\}\);/);
    /* 23-oct-2026 — cuenta.js se pide con la versión en la dirección (ver sw.js, v139). */
    assert.match(SOCIO, /<script src="cuenta\.js\?v=\d+"><\/script>[\s\S]*<script src="aparato\.js"><\/script>/);
  });
});
