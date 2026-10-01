/* ============================================================================
 * EL REGISTRO DE PLATACHAT ES EL DE play/, CON LA MARCA — 1 de octubre de 2026.
 *
 *   node --test            (desde la raíz; descubre pruebas/*.test.js)
 *
 * Joan: «el registro del cliente [de PlataChat] quiero que sea como el de
 * garantía, muy moderno, y que parezca que se escanea la cara y la cédula».
 *
 * No se copió: PlataChat manda a play/?marca=platachat#registro, que es el
 * mismo registro con las dos cámaras en vivo, con la piel de PlataChat y la
 * etiqueta de la app. Estas pruebas corren play/index.html DE VERDAD
 * (banco-play.js) en los dos modos, y vigilan las dos cosas que importan:
 *
 *   1. Con la marca, el registro llega a PlataChat entero: la bandeja con la
 *      etiqueta, la cuenta, las fotos ANTES de irse, y la sesión pasada en el
 *      formato de platachat/sesion.js.
 *   2. Sin la marca, play/ es exactamente lo de siempre. Esta es la puerta
 *      pública de Tu Garantía, con clientes de verdad.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const SESION_JS = leer('platachat/sesion.js');
const CON_MARCA = '?marca=platachat';

/* Un registro completo: cada campo obligatorio con un valor válido de su tipo,
   sacado del propio cuenta.js (no una lista escrita aquí que se quede vieja). */
function llenarRegistro(P) {
  P.ev(`U.camposObligatorios().forEach(function (c) {
    REGISTRO[c.id] = c.tipo === 'celular' ? (c.id === 'celular' ? '3001112233' : '3009998877')
      : c.tipo === 'opcion' ? c.opciones[0]
      : c.tipo === 'pesos' ? '2000000'
      : c.tipo === 'fecha' ? '2010-01-01'
      : c.tipo === 'numero' ? '1010101010'
      : 'Prueba';
  });
  REGISTRO.nombres = 'Ana'; REGISTRO.apellidos = 'Pérez';
  CLAVE_EN_MEMORIA = 'Perro.2026x';`);
}

/* La nube de mentira: anota cada llamada y contesta por ruta. */
function nube(P, respuestas) {
  P.ev(`window.__llamadas = [];
    fetch = function (u, o) {
      var cuerpo = null; try { cuerpo = JSON.parse(o && o.body); } catch (e) {}
      window.__llamadas.push({ url: String(u), cuerpo: cuerpo, cab: (o && o.headers) || {} });
      var r = window.__respuesta(String(u));
      var estado = r.__estado || 200;
      return Promise.resolve({ ok: estado < 400, status: estado,
        json: function () { return Promise.resolve(r); },
        text: function () { return Promise.resolve(JSON.stringify(r)); } });
    };`);
  P.ctxRespuesta = respuestas;
  P.ev('window.__respuesta = ' + respuestas.toString() + ';');
  return () => JSON.parse(P.ev('JSON.stringify(window.__llamadas)'));
}

const BIEN = function (u) {
  if (/registrar_abierto/.test(u)) return { ok: true };
  if (/auth\/v1\/signup/.test(u)) return { access_token: 'tok-nuevo', refresh_token: 'ref-nuevo', expires_in: 3600,
    user: { email: '573001112233@tugarantia.net', user_metadata: {} } };
  if (/registro_archivos_guardar/.test(u)) return { ok: true, guardados: ['cedula_frente', 'cedula_reverso', 'selfie'] };
  return { ok: true };
};

/* platachat/sesion.js dentro de la página, como lo dejaría cargarScript: el
   banco no tiene un <script> que dispare onload. */
function conSesionJs(P) {
  P.ev(SESION_JS);
  P.ev("SCRIPTS['../platachat/sesion.js'] = Promise.resolve();");
}
const respiro = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };

describe('la marca se decide en el <head> y solo con ?marca=platachat', () => {

  test('con la marca: MARCA es platachat, y el arranque va directo al registro', () => {
    const P = abrirPlay({ search: CON_MARCA });
    assert.deepEqual(P.fallos, [], 'la página reventó al cargar con la marca');
    assert.equal(P.ev('window.MARCA_PLATACHAT'), true);
    assert.equal(P.ev('MARCA'), 'platachat');
    /* Sin #registro y sin nada guardado, play/ abriría su portada (Tu
       Garantía). Con la marca, quien viene de «Abrir mi cuenta» cae en el paso 1. */
    assert.equal(P.ev('VISTA'), 'registro', 'con la marca abrió la portada de Tu Garantía');
    assert.match(P.elems.cuerpo.innerHTML, /Paso 1 de/);
  });

  test('sin la marca: play/ no se entera (MARCA tugarantia, portada de siempre)', () => {
    const P = abrirPlay({});
    assert.deepEqual(P.fallos, []);
    assert.equal(P.ev('typeof window.MARCA_PLATACHAT'), 'undefined');
    assert.equal(P.ev('MARCA'), 'tugarantia');
    assert.equal(P.ev('VISTA'), 'entrar');
    /* Y una marca parecida no la enciende: se reconoce la palabra entera. */
    assert.equal(abrirPlay({ search: '?marca=platachatx' }).ev('MARCA'), 'tugarantia');
    assert.equal(abrirPlay({ search: '?xmarca=platachat' }).ev('MARCA'), 'tugarantia');
  });

  test('el <head> pone la piel de PlataChat ANTES que el script grande, y solo con la marca', () => {
    const PLAY = leer('play/index.html');
    const head = PLAY.slice(0, PLAY.indexOf('</head>'));
    assert.match(head, /l\.href = '\.\.\/platachat\/piel-registro\.css';/, 'la piel no se carga desde el <head>');
    assert.match(head, /classList\.add\('marca-platachat'\)/);
    assert.match(head, /\/\(\^\|\[\?&\]\)marca=platachat\(&\|\$\)\//);
    assert.ok(fs.existsSync(path.join(RAIZ, 'platachat', 'piel-registro.css')));
  });
});

describe('el registro con la marca, de punta a punta', () => {

  test('«Volver» en el paso 1 regresa a PlataChat, no a la portada de Tu Garantía', () => {
    const P = abrirPlay({ search: CON_MARCA });
    assert.match(P.elems.cuerpo.innerHTML, /onclick="volverAPlataChat\(\)">Volver</);
    P.ev('volverAPlataChat()');
    assert.equal(P.ev('location.href'), '../platachat/index.html');
    /* Sin la marca, el de siempre. */
    const Q = abrirPlay({ hash: '#registro' });
    assert.match(Q.elems.cuerpo.innerHTML, /onclick="pintarEntrar\(\)">Volver</);
  });

  test('sin acompañamiento, aunque en el teléfono haya quedado encendido de play/', () => {
    const P = abrirPlay({ search: CON_MARCA, almacen: { tg_acompana: '1' } });
    P.ev("REGISTRO.celular = '3001112233'");
    assert.equal(P.ev('tarjetaAcompanar()'), '', 'ofreció el acompañamiento de un asesor en PlataChat');
    const llamadas = nube(P, BIEN);
    P.ev('publicarAvance()');
    assert.equal(llamadas().length, 0, 'publicó el avance del registro de PlataChat');
    /* En play/ sigue igual. */
    const Q = abrirPlay({ almacen: { tg_acompana: '1' } });
    Q.ev("REGISTRO.celular = '3001112233'");
    assert.ok(Q.ev('tarjetaAcompanar()').length > 0);
  });

  test('la autorización dice que los datos los trata Tu Garantía, solo con la marca', () => {
    const P = abrirPlay({ search: CON_MARCA });
    assert.match(P.ev('pasoPermiso()'), /PlataChat es un nombre comercial de Tu Garantía/);
    assert.ok(!/PlataChat/.test(abrirPlay({}).ev('pasoPermiso()')), 'le habló de PlataChat a un cliente de Tu Garantía');
  });

  test('ABRE LA CUENTA: bandeja CON ETIQUETA, después la cuenta, y la sesión pasa a PlataChat', async () => {
    const P = abrirPlay({ search: CON_MARCA });
    conSesionJs(P);
    llenarRegistro(P);
    const llamadas = nube(P, BIEN);
    P.ev('pintarRegistro(PASOS.length - 1); enviarRegistro(false)');
    await respiro();
    const ll = llamadas();
    const bandeja = ll.findIndex(x => /registrar_abierto/.test(x.url));
    const cuenta = ll.findIndex(x => /auth\/v1\/signup/.test(x.url));
    assert.ok(bandeja >= 0 && cuenta > bandeja, 'el orden no es bandeja → cuenta');
    assert.match(ll[bandeja].url, /\/rest\/v1\/rpc\/registrar_abierto_app$/, 'con la marca fue a la bandeja sin etiqueta');
    assert.equal(ll[bandeja].cuerpo.p_app, 'platachat');
    assert.equal(ll[bandeja].cuerpo.p_celular, '3001112233');
    assert.equal(ll[bandeja].cab.Authorization, 'Bearer ' + P.ev('CFG.anon'), 'la bandeja va con la llave pública');
    /* La sesión, en el formato de PlataChat y con la llave de PlataChat. */
    const s = JSON.parse(P.almacen.platachat_sesion || 'null');
    assert.ok(s, 'no le pasó la sesión a PlataChat');
    assert.equal(s.access_token, 'tok-nuevo');
    assert.equal(s.refresh_token, 'ref-nuevo');
    assert.equal(s.celular, '3001112233');
    assert.equal(s.nombre, 'Ana Pérez');
    assert.ok(Number(s.expires_at) > 0);
    /* Y lo manda allá, sin pasar por la oferta del primer crédito de play/. */
    assert.equal(P.ev('location.href'), '../platachat/index.html');
    assert.ok(!ll.some(x => /solicitar_primer_credito/.test(x.url)), 'le ofreció el primer crédito de play/');
    assert.match(P.elems.titulo.textContent, /Tu cuenta de PlataChat quedó abierta/);
  });

  test('LAS FOTOS SUBEN ANTES DE IRSE, una sola vez; si no suben, no se va callado', async () => {
    const P = abrirPlay({ search: CON_MARCA });
    conSesionJs(P);
    llenarRegistro(P);
    P.ev("FOTOS.sensibles = true; FOTOS.cedula_frente = 'data:image/jpeg;base64,AAAA'; marcarDuenoDeLasFotos();");
    const llamadas = nube(P, function (u) {
      if (/registro_archivos_guardar/.test(u)) return { ok: false };
      if (/auth\/v1\/signup/.test(u)) return { access_token: 'tok', refresh_token: 'ref', expires_in: 3600,
        user: { email: '573001112233@tugarantia.net' } };
      return { ok: true };
    });
    P.ev('pintarRegistro(PASOS.length - 1); enviarRegistro(true)');
    await respiro();
    const subidas = llamadas().filter(x => /registro_archivos_guardar/.test(x.url));
    assert.equal(subidas.length, 1, 'las fotos se mandaron ' + subidas.length + ' veces (la subida en segundo plano corrió también)');
    assert.equal(subidas[0].cab.Authorization, 'Bearer tok', 'la subida no fue con la sesión recién creada');
    /* La base las rechazó: NO se va a PlataChat como si nada. */
    assert.notEqual(P.ev('location.href'), '../platachat/index.html', 'se fue a PlataChat con las fotos sin subir');
    assert.match(P.elems.pcSubida.textContent, /tus fotos no alcanzaron a subir/);
    assert.match(P.elems.pcAcciones.innerHTML, /Volver a intentar subirlas/);
    assert.match(P.elems.pcAcciones.innerHTML, /Entrar a PlataChat sin ellas/);
    /* Y al reintentar con la base bien, sube y se va. */
    P.ev("window.__respuesta = function (u) { return /registro_archivos_guardar/.test(u) ? { ok: true, guardados: ['cedula_frente'] } : { ok: true }; }");
    P.ev('terminarEnPlataChat()');
    await respiro();
    assert.equal(P.ev('location.href'), '../platachat/index.html');
    assert.ok(JSON.parse(P.almacen.platachat_sesion).access_token === 'tok');
  });

  test('sin la migración de PlataChat (404), lo dice: no culpa al internet y NO crea la cuenta', async () => {
    const P = abrirPlay({ search: CON_MARCA });
    llenarRegistro(P);
    const llamadas = nube(P, u => (/registrar_abierto_app/.test(u) ? { __estado: 404 } : { ok: true }));
    P.ev('pintarRegistro(PASOS.length - 1); enviarRegistro(false)');
    await respiro();
    assert.ok(!llamadas().some(x => /auth\/v1\/signup/.test(x.url)), 'creó la cuenta sin que la bandeja la recibiera');
    const t = P.elems.errReg.textContent;
    assert.match(t, /El registro de PlataChat todavía no está encendido/);
    assert.ok(!/internet/.test(t), 'culpó al internet de un 404 que es de la base');
  });

  test('quien ya tiene sesión de play/ en esta pestaña entra a PlataChat con ella', async () => {
    const sesion = { play_sesion: JSON.stringify({ access_token: 'tok-viejo', refresh_token: 'r', expires_in: 3600,
      user: { email: '573001112233@tugarantia.net' } }) };
    const P = abrirPlay({ search: CON_MARCA, sesion });
    conSesionJs(P);
    /* El arranque ya corrió con la sesión; con sesion.js recién cargado, se
       vuelve a pedir lo mismo que hizo el arranque. */
    P.ev("entrarAPlataChat(celularDeSesion(), '')");
    await respiro();
    assert.equal(JSON.parse(P.almacen.platachat_sesion).access_token, 'tok-viejo');
    assert.equal(P.ev('location.href'), '../platachat/index.html');
    assert.notEqual(P.ev('VISTA'), 'cuenta', 'abrió la cuenta de Tu Garantía');
  });
});

describe('play/ SIN la marca sigue siendo exactamente play/', () => {

  test('la bandeja es registrar_abierto, sin etiqueta, y NO se toca la sesión de PlataChat', async () => {
    const P = abrirPlay({ hash: '#registro' });
    llenarRegistro(P);
    const llamadas = nube(P, BIEN);
    P.ev('pintarRegistro(PASOS.length - 1); enviarRegistro(false)');
    await respiro();
    const ll = llamadas();
    const b = ll.find(x => /rpc\/registrar_abierto/.test(x.url));
    assert.ok(b, 'no fue a la bandeja');
    assert.match(b.url, /\/rest\/v1\/rpc\/registrar_abierto$/);
    assert.equal(b.cuerpo.p_app, undefined, 'a un registro de Tu Garantía le puso etiqueta');
    assert.deepEqual(Object.keys(b.cuerpo).sort(), ['p_cedula', 'p_celular', 'p_datos', 'p_nombre']);
    assert.equal(P.almacen.platachat_sesion, undefined, 'le escribió una sesión a PlataChat');
    assert.notEqual(P.ev('location.href'), '../platachat/index.html');
    assert.match(P.elems.titulo.textContent, /Tu cuenta quedó abierta/);
  });
});

describe('la piel y la puerta', () => {

  test('la piel solo cambia VALORES de tokens que play/estilo.css ya usa', () => {
    const piel = leer('platachat/piel-registro.css');
    const play = leer('play/estilo.css');
    const sinComentarios = piel.replace(/\/\*[\s\S]*?\*\//g, '');
    /* Ninguna regla de clases o elementos: solo :root.marca-platachat. Si
       redefiniera reglas, serían dos hojas para la misma pantalla. */
    const selectores = [...sinComentarios.matchAll(/([^{}@]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
    selectores.forEach(sel => assert.match(sel, /^(:root\.marca-platachat|\(prefers-color-scheme:dark\)|media)/,
      'la piel redefine una regla, no un token: ' + sel));
    /* Y cada token que toca existe en play/: si play/ lo renombra, esto se cae
       en vez de pintar el registro de PlataChat con el rojo de Tu Garantía. */
    const tokens = [...new Set([...sinComentarios.matchAll(/(--[a-z-]+)\s*:/g)].map(m => m[1]))];
    assert.ok(tokens.length >= 8);
    tokens.forEach(t => assert.ok(new RegExp(t.replace(/-/g, '\\-') + '\\s*:').test(play), 'play/estilo.css no tiene ' + t));
    /* Los dos oscuros están (sin ellos, el claro de aquí le gana al oscuro de allá). */
    assert.match(sinComentarios, /:root\.marca-platachat:not\(\[data-theme="light"\]\)/);
    assert.match(sinComentarios, /:root\.marca-platachat\[data-theme="dark"\]/);
  });

  test('«Abrir mi cuenta» de PlataChat lleva a este registro', () => {
    assert.match(leer('platachat/index.html'), /var URL_REGISTRO = '\.\.\/play\/index\.html\?marca=platachat#registro';/);
  });
});
