'use strict';
/* ==========================================================================
 * «¿AÚN SIN RESPUESTA?»: DEL CHAT AL WHATSAPP DE SERVICIO AL CLIENTE
 * 24 de noviembre de 2026
 *
 *   node --test pruebas/sin-respuesta-whatsapp.test.js
 *
 * Joan: «quiero que pongas mi numero de telefono para garantia como numero de
 * contacto de servicio al cliente por ahora, en caso de que no le den respuesta
 * desde la aplicacion entonses que exista el boton que lo redirija a mi whatsapp».
 *
 * El 22-sep había pedido lo contrario («nada de compartir mi numero»). Lo que
 * aquí se cuida es justo esa frontera: el número no está a la vista; sale un
 * botón, y solo cuando la persona escribió y nadie de la casa le contestó.
 * La regla vive en app/sin-respuesta.js (archivo nuevo: app/chat.js no se toca).
 *
 * Los celulares de las pruebas son inventados.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SR = require('../app/sin-respuesta.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = s => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const SOCIO = LEER('app/socio.html'), PLAY = LEER('play/index.html'), MODULO = LEER('app/sin-respuesta.js');
const T0 = Date.parse('2026-11-24T15:00:00Z');
const a = min => new Date(T0 + min * 60000).toISOString();
const m = (de, min, extra) => Object.assign({ de, creado_en: a(min), texto: 'x' }, extra || {});
const en = min => T0 + min * 60000;
const WA = '3001112233';
const sale = (hilo, min, o) => SR.html(hilo, Object.assign({ whatsapp: WA, ahora: en(min) }, o || {}));

describe('la regla: cuándo sale el botón', () => {
  test('quince minutos sin que conteste nadie: ni un minuto antes', () => {
    const hilo = [m('socio', 0)];
    assert.equal(SR.MINUTOS, 15);
    assert.equal(sale(hilo, 14), '', 'salió antes de tiempo');
    assert.notEqual(sale(hilo, 15), '', 'a los 15 minutos no salió');
    assert.notEqual(sale(hilo, 600), '');
  });
  test('si nadie ha escrito, o lo último lo dijo una persona de la casa, no sale', () => {
    assert.equal(sale([], 999), '');
    assert.equal(sale(null, 999), '');
    assert.equal(sale([m('socio', 0), m('panel', 3)], 999), '', 'Joan ya le contestó');
    assert.equal(sale([m('socio', 0), m('equipo', 3)], 999), '', 'su asesor ya le contestó');
    assert.equal(sale([m('panel', 0)], 999), '', 'la casa escribió primero y la persona no ha dicho nada');
  });
  test('una respuesta AUTOMÁTICA no es que le respondieron: sigue esperando a una persona', () => {
    const hilo = [m('socio', 0), m('auto', 1, { regla: 'fuera de horario' }), m('agente', 2)];
    assert.equal(SR.minutosEsperando(hilo, en(20)), 20);
    assert.notEqual(sale(hilo, 20), '', 'una máquina contestó y el botón desapareció, justo cuando más falta hace');
  });
  test('se cuenta desde el PRIMER mensaje sin respuesta: insistir no vuelve a poner el reloj en cero', () => {
    const hilo = [m('socio', 0), m('socio', 10), m('socio', 14)];
    assert.equal(SR.minutosEsperando(hilo, en(16)), 16);
    assert.notEqual(sale(hilo, 16), '');
    /* Y después de una respuesta, el reloj es el de lo NUEVO que escribió. */
    const otro = [m('socio', 0), m('equipo', 5), m('socio', 100)];
    assert.equal(SR.minutosEsperando(otro, en(110)), 10);
    assert.equal(sale(otro, 110), '');
    assert.notEqual(sale(otro, 116), '');
  });
  test('una fecha ilegible no inventa una espera, y el reloj del teléfono atrasado no da minutos negativos', () => {
    assert.equal(SR.minutosEsperando([{ de: 'socio', creado_en: 'no es una fecha' }], en(999)), 0);
    assert.equal(SR.minutosEsperando([m('socio', 10)], en(0)), 0);
    assert.equal(sale([m('socio', 10)], 0), '');
  });
  test('quién escribió lo dice app/chat.js, no una lista propia: si allá entra un autor nuevo, aquí vale igual', () => {
    const codigo = sinComentarios(MODULO);
    assert.match(codigo, /C\.ladoDe\(m && m\.de\) === 'socio'/);
    assert.match(codigo, /C\.esAutomatico\(m\)/);
    assert.equal(/'panel'|'equipo'|'agente'|'auto'/.test(codigo), false, 'el módulo trae su propia lista de autores: se puede quedar vieja');
    /* Y chat.js NO se tocó: sigue sin saber nada de esto (lo cargan cinco páginas, sin versión). */
    assert.equal(/sinRespuesta|SinRespuesta|wa\.me/.test(LEER('app/chat.js')), false);
  });
});

describe('el botón: a dónde lleva y qué NO lleva', () => {
  const hilo = [m('socio', 0, { texto: 'mi cédula es 52000001 y mi Nequi 3105550108' })];
  test('abre WhatsApp con el número de la casa (con el 57), en otra pestaña', () => {
    const h = sale(hilo, 20);
    assert.match(h, /<a class="btn arriba sr-boton" id="srPorWhatsApp" target="_blank" rel="noopener" href="https:\/\/wa\.me\/573001112233\?text=/);
    assert.match(h, /¿Aún sin respuesta\?<\/b> Perdona la demora\. Escríbenos por WhatsApp\./);
    assert.match(sale(hilo, 20, { whatsapp: '+57 300 111 2233' }), /wa\.me\/573001112233\?/);
    assert.match(sale(hilo, 20, { whatsapp: '573001112233' }), /wa\.me\/573001112233\?/);
  });
  test('sin número de la casa no hay botón (no manda a un WhatsApp sin destino)', () => {
    ['', null, undefined, '12345', 'abc'].forEach(w => assert.equal(sale(hilo, 20, { whatsapp: w }), '', 'salió con «' + w + '»'));
  });
  test('en el enlace NO viaja nada de la persona: ni lo que escribió, ni su cédula, ni su celular', () => {
    const h = sale(hilo, 20);
    const texto = decodeURIComponent(/\?text=([^"]+)"/.exec(h)[1]);
    assert.equal(texto, SR.TEXTO);
    assert.equal(/52000001|3105550108|cédula|Nequi/i.test(h), false, 'un dato de la persona quedó en el enlace');
    assert.equal(/\d{6,}/.test(texto), false);
    assert.equal(/prest|cupo|crédito|cobr|deuda|mora/i.test(texto), false, 'el texto habla de crédito o de cobro: ese WhatsApp es para atender');
  });
  test('lo que llega como número se limpia: no se puede colar un enlace ni una etiqueta', () => {
    const h = sale(hilo, 20, { whatsapp: '3001112233"><script>alert(1)</script>' });
    assert.equal(/<script|alert\(|onerror/i.test(h), false, 'algo de lo que venía pegado al número llegó al HTML');
    assert.match(h, /href="https:\/\/wa\.me\/\d+\?text=/);
    const conTexto = sale(hilo, 20, { texto: 'Hola "><img src=x onerror=alert(1)>' });
    assert.equal(/<img|onerror=alert/.test(conTexto), false);
  });
  test('pintar: pone el aviso, lo quita cuando ya no toca, y no reescribe si no cambió', () => {
    let escrituras = 0, valor = '';
    const caja = { get innerHTML() { return valor; }, set innerHTML(v) { escrituras++; valor = v; }, ownerDocument: null };
    SR.pintar(caja, hilo, { whatsapp: WA, ahora: en(20) });
    assert.match(valor, /srPorWhatsApp/);
    SR.pintar(caja, hilo, { whatsapp: WA, ahora: en(21) });
    assert.equal(escrituras, 1, 'repintó sin que cambiara nada');
    SR.pintar(caja, hilo.concat([m('equipo', 22)]), { whatsapp: WA, ahora: en(23) });
    assert.equal(valor, '', 'ya le contestaron y el botón sigue ahí');
    assert.equal(SR.pintar(null, hilo, { whatsapp: WA, ahora: en(20) }), '');
  });
});

describe('las dos pantallas lo enganchan, y el número no queda a la vista', () => {
  const socio = sinComentarios(SOCIO), play = sinComentarios(PLAY);
  test('el archivo es nuevo y firma al llegar; las dos páginas lo piden con su versión, después de chat.js, y sw.js lo precarga', () => {
    const FIRMA = '(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();';
    const t = MODULO.replace(/\r\n/g, '\n').replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, '');
    assert.ok(t.startsWith(FIRMA), 'su primer código no es la firma');
    const v = (/<script src="sin-respuesta\.js\?v=(\d+)"><\/script>/.exec(SOCIO) || [])[1];
    assert.ok(v, 'app/socio.html no pide sin-respuesta.js con versión');
    assert.ok(PLAY.includes('<script src="../app/sin-respuesta.js?v=' + v + '"></script>'), 'play/ no lo pide con la misma versión');
    assert.ok(SOCIO.indexOf('<script src="sin-respuesta.js') > SOCIO.indexOf('<script src="chat.js"></script>'), 'en la app va antes de chat.js');
    assert.ok(PLAY.indexOf('<script src="../app/sin-respuesta.js') > PLAY.indexOf('<script src="../app/chat.js"></script>'), 'en el registro va antes de chat.js');
    assert.ok(LEER('sw.js').includes("'app/sin-respuesta.js?v=" + v + "'"), 'sw.js no lo precarga');
    ['panel/crm.html', 'panel/espejo.html', 'platachat/index.html'].forEach(p =>
      assert.equal(/sin-respuesta\.js/.test(LEER(p)), false, p + ' lo carga: ahí no escribe el cliente de Tu Garantía'));
  });
  test('la app: debajo del hilo, con el contacto oficial de siempre, y con su reloj', () => {
    assert.ok(socio.indexOf("'<div id=\"chSinRespuesta\"></div>' +") > socio.indexOf('id="chHilo"'), 'la caja del aviso no va después del hilo');
    assert.match(socio, /SinRespuesta\.pintar\(c, CH\.error \? \[\] : CH\.mensajes, \{ whatsapp: contactoOficial\(\)\.whatsapp, ahora: Date\.now\(\) \}\)/);
    assert.match(socio, /CH\.relojEspera = setInterval\(function \(\) \{ if \(mio === CH\) chatPintarEspera\(\); \}, 30000\);/, 'sin reloj, el aviso no sale nunca: cuando nadie contesta, nada repinta');
    assert.match(socio, /if \(CH && CH\.relojEspera\) \{ clearInterval\(CH\.relojEspera\);/, 'el reloj se queda andando al salir del chat');
    /* El contacto oficial no sale de un enlace: sigue siendo el de la página o el de la nube. */
    assert.match(socio, /var n = \(S && !S\.deEnlace && S\.negocio\) \? S\.negocio : null;/);
  });
  test('el registro: lo mismo, con el mismo número que la app, y no en PlataChat', () => {
    assert.ok(play.indexOf("'<div id=\"chSinRespuesta\"></div>' +") > play.indexOf('id="hilo" class="ch-hilo"'));
    assert.match(play, /var toca = MARCA !== 'platachat' && HILO\.estado === 'listo';\s+try \{ SinRespuesta\.pintar\(c, toca \? HILO\.mensajes : \[\], \{ whatsapp: WA_SERVICIO, ahora: Date\.now\(\) \}\); \}/);
    assert.match(play, /if \(!nuevos\.length\) \{ pintarEsperaDelChat\(\); return; \}/, 'en el latido sin mensajes nuevos el aviso no se mira');
    const dePlay = /var WA_SERVICIO = '(\d+)';/.exec(play), deLaApp = /var NEGOCIO_OFICIAL = \{ nombre: 'Tu Garantía', whatsapp: '(\d+)' \};/.exec(socio);
    assert.ok(dePlay && deLaApp, 'falta el número en una de las dos páginas');
    assert.equal(dePlay[1], deLaApp[1], 'el registro y la app mandan a WhatsApp distintos');
    assert.match(dePlay[1], /^57\d{10}$/);
  });
  test('el número NO está escrito a la vista: en cada página vive en un solo sitio, y el módulo no trae ninguno', () => {
    const numero = /var WA_SERVICIO = '(\d+)';/.exec(play)[1];
    const local = numero.slice(2);
    const suelto = () => new RegExp(local.slice(0, 3) + '[ .-]?' + local.slice(3, 6) + '[ .-]?' + local.slice(6), 'g');
    [['app/socio.html', socio], ['play/index.html', play]].forEach(([nombre, codigo]) => {
      assert.equal((codigo.match(suelto()) || []).length, 1, nombre + ': el número está escrito en más de un sitio');
    });
    assert.equal((MODULO.match(/\d{10,}/g) || []).length, 0, 'app/sin-respuesta.js trae un número escrito: el número lo pone la página');
    /* Y el HTML del aviso no lo pinta como texto: solo en el href. */
    const h = sale([m('socio', 0)], 20);
    assert.equal(h.replace(/href="[^"]*"/g, '').includes('3001112233'), false);
  });
});

describe('en el registro de verdad (play/)', () => {
  const B = require('./banco-registro.js');
  const caja = P => String(P.ev("(document.getElementById('chSinRespuesta') || {}).innerHTML || ''"));
  test('veinte minutos sin respuesta: sale el botón; si contesta una persona o el hilo falla, se quita', () => {
    const P = B.abrir();
    assert.equal(P.ev('MARCA'), 'tugarantia');
    P.ev("HILO = { canal: 'servicio', mensajes: [{ id: 1, de: 'socio', texto: 'hola', creado_en: new Date(Date.now() - 20 * 60000).toISOString() }], estado: 'listo' }; pintarEsperaDelChat();");
    const numero = /var WA_SERVICIO = '(\d+)';/.exec(PLAY)[1];
    assert.ok(caja(P).includes('href="https://wa.me/' + numero + '?text='), 'no sale el botón al WhatsApp de servicio: ' + caja(P).slice(0, 160));
    P.ev("HILO.mensajes.push({ id: 2, de: 'equipo', texto: 'hola', creado_en: new Date().toISOString() }); pintarEsperaDelChat();");
    assert.equal(caja(P), '', 'ya le contestaron y el botón sigue ahí');
    P.ev("HILO.mensajes.pop(); pintarEsperaDelChat();");
    assert.notEqual(caja(P), '');
    P.ev("HILO.estado = 'falla'; pintarEsperaDelChat();");
    assert.equal(caja(P), '', 'con el hilo en falla se quedó un botón de una conversación que no se ve');
  });
});
