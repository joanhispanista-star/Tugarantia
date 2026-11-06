'use strict';
/* ==========================================================================
 * EL CHAT DEL EQUIPO MANDA — 6 de noviembre de 2026
 *
 *   node --test pruebas/el-chat-del-equipo-manda.test.js
 *
 * Desde el 22-sep-2026 «Enviar» y «Mandar una foto», en el chat del gerente y
 * del asesor con Joan, reventaban con un ReferenceError: el código llamaba al
 * módulo por el nombre que tiene en play/index.html (CH), que en crm.html no
 * existe (ahí es CHAT). No se mandaba nada, el texto se quedaba en el cuadro y
 * la pantalla no decía nada. La receta del 30-oct le pedía a William escribir
 * por ahí.
 *
 * Había 50 pruebas sobre ese chat y ninguna lo notó, porque todas leen el texto
 * del archivo o llaman a las funciones de leer. Por eso aquí se hace lo que hace
 * el gerente: se pinta la pantalla, se saca del HTML lo que dice el onclick de
 * SU botón, se corre eso, y se mira qué le llegó a la nube.
 *
 * Es el banco del CRM (banco-panel.js), sin navegador. Lo mismo se corrió con
 * un dedo de verdad en Chrome sin ventana; en Safari real no se ha corrido.
 * Todas, salvo las que dicen «control», FALLAN con 76af475.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

const YO = { nombre: 'GERENTE PRUEBA', rol: 'gerente', celular: '3000000000' };
const SESION = {
  access_token: 'token-de-prueba', refresh_token: 'renovar-de-prueba', id: 'sesion-de-prueba', tel: '3000000000'
};

/* La nube de mentira: contesta lo que contesta la función de verdad
   (base/20260922r_el_chat_con_el_equipo.sql) y anota lo que le pidieron. */
function nubeDePrueba(respuestas) {
  const pedidos = [];
  const red = (url, cfg) => {
    const m = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(url);
    const fn = m ? m[1] : url;
    pedidos.push({ fn, cuerpo: cfg && cfg.body ? JSON.parse(cfg.body) : null, cfg });
    const r = (respuestas && respuestas[fn]) || { status: 200, j: { ok: true, mensajes: [] } };
    if (r.falla) return Promise.reject(new Error(r.falla));
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.j) });
  };
  return { red, pedidos, de: fn => pedidos.filter(p => p.fn === fn) };
}

/* Un gerente adentro, en su pantalla de Chat. */
function abrirChat(opciones, respuestas) {
  const N = nubeDePrueba(respuestas);
  const P = abrirPanel(Object.assign({ red: N.red }, opciones || {}));
  P.ev('SESION_EQUIPO = ' + JSON.stringify(SESION) + '; SESION_EQUIPO.expira_en = Date.now() + 3600000;' +
       ' SESION_EQUIPO.desde = Date.now(); SESION_EQUIPO.hasta = Date.now() + 86400000;');
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: YO, equipo: [], gente: [] }) + '; VISTA_EQUIPO = "jefe";');
  return { P, N };
}
/* Lo que hace el dedo: lee del HTML que pinta la pantalla qué corre ese botón,
   y lo corre. Si alguien le cambia el onclick, la prueba corre el nuevo. */
function tocarDePantalla(P, html, id) {
  const m = new RegExp('<button[^>]*\\bid="' + id + '"[^>]*\\bonclick="([^"]+)"').exec(html);
  assert.ok(m, 'la pantalla no tiene el botón ' + id);
  return P.ev(m[1].replace(/&quot;/g, '"'));
}

describe('«Enviar», tocado de verdad', () => {

  test('lo que escribió el gerente le llega a la nube por equipo_chat_escribir', async () => {
    const { P, N } = abrirChat();
    const html = P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = 'jefe, probando';
    tocarDePantalla(P, html, 'btnJefe');
    await asentar();
    const van = N.de('equipo_chat_escribir');
    assert.equal(van.length, 1, 'tocar Enviar no mandó nada a la nube');
    assert.deepEqual(van[0].cuerpo, { p_texto: 'jefe, probando' });
    assert.equal(van[0].cfg.headers.Authorization, 'Bearer token-de-prueba', 'salió sin su sesión');
  });

  test('al salir bien vacía el cuadro y vuelve a decir «Enviar»', async () => {
    const { P } = abrirChat();
    const html = P.ev('vistaJefeEq()');
    const txt = P.ctx.document.getElementById('txtJefe');
    txt.value = 'jefe, probando';
    tocarDePantalla(P, html, 'btnJefe');
    assert.equal(P.ctx.document.getElementById('btnJefe').textContent, 'Enviando…', 'no se nota que salió');
    await asentar();
    assert.equal(txt.value, '', 'el texto se quedó: parece que no salió');
    assert.equal(P.ctx.document.getElementById('btnJefe').textContent, 'Enviar');
    assert.equal(P.ctx.document.getElementById('btnJefe').disabled, false);
  });

  test('si la nube dice que no, se le dice al gerente y el texto no se pierde', async () => {
    const { P } = abrirChat(null, { equipo_chat_escribir: { status: 200, j: { ok: false, motivo: 'muchos' } } });
    const html = P.ev('vistaJefeEq()');
    const txt = P.ctx.document.getElementById('txtJefe');
    txt.value = 'jefe, probando';
    tocarDePantalla(P, html, 'btnJefe');
    await asentar();
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /Espera unos minutos/);
    assert.equal(txt.value, 'jefe, probando');
  });

  test('con la sesión vencida saca la puerta de entrar otra vez, y el texto no se pierde', async () => {
    const { P } = abrirChat(null, { equipo_chat_escribir: { status: 401, j: { code: 'PGRST301', message: 'JWT expired' } } });
    const html = P.ev('vistaJefeEq()');
    const txt = P.ctx.document.getElementById('txtJefe');
    txt.value = 'jefe, probando';
    const dijo = [];
    P.ctx.__anotar = q => dijo.push(q);
    P.ev('avisarFinDeSesion = q => __anotar(q)');
    tocarDePantalla(P, html, 'btnJefe');
    await asentar();
    assert.equal(dijo.length, 1, 'un JWT vencido se quedó en «No pude enviarlo»');
    assert.match(dijo[0], /NO salió/);
    assert.equal(txt.value, 'jefe, probando');
    assert.equal(P.ctx.document.getElementById('btnJefe').textContent, 'Enviar');
  });

  test('sin señal sigue diciendo que es la señal: no se confunde con la sesión', async () => {
    const { P } = abrirChat(null, { equipo_chat_escribir: { falla: 'sin red' } });
    const html = P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = 'jefe, probando';
    const dijo = [];
    P.ctx.__anotar = q => dijo.push(q);
    P.ev('avisarFinDeSesion = q => __anotar(q)');
    tocarDePantalla(P, html, 'btnJefe');
    await asentar();
    assert.equal(dijo.length, 0);
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /Revisa la señal/);
  });

  test('un mensaje vacío lo frena la pantalla con el motivo de chat.js, sin molestar a la nube', async () => {
    const { P, N } = abrirChat();
    const html = P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = '   ';
    tocarDePantalla(P, html, 'btnJefe');
    await asentar();
    assert.equal(N.de('equipo_chat_escribir').length, 0);
    assert.ok(P.ctx.document.getElementById('errJefe').textContent.length > 3, 'lo frenó sin decir por qué');
  });

  test('uno de más de 1000 caracteres también, con la cuenta de cuánto se pasó', async () => {
    const { P, N } = abrirChat();
    const html = P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = 'a'.repeat(1005);
    tocarDePantalla(P, html, 'btnJefe');
    await asentar();
    assert.equal(N.de('equipo_chat_escribir').length, 0);
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /Te pasaste por 5 caracteres/);
  });
});

describe('la foto', () => {

  test('sale por equipo_foto_escribir con el texto que la acompaña', async () => {
    const { P, N } = abrirChat();
    P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = 'mire esta';
    P.ev("subirFotoJefe('data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BB', document.getElementById('errJefe'))");
    await asentar();
    const van = N.de('equipo_foto_escribir');
    assert.equal(van.length, 1, 'la foto no salió');
    assert.equal(van[0].cuerpo.p_texto, 'mire esta');
    assert.equal(van[0].cuerpo.p_imagen, 'data:image/jpeg;base64,AAAA');
  });

  test('con la sesión vencida no se queda en «Mandando la foto…» y saca la puerta', async () => {
    const { P } = abrirChat(null, { equipo_foto_escribir: { status: 401, j: { code: 'PGRST301', message: 'JWT expired' } } });
    P.ev('vistaJefeEq()');
    const dijo = [];
    P.ctx.__anotar = q => dijo.push(q);
    P.ev('avisarFinDeSesion = q => __anotar(q)');
    P.ev("subirFotoJefe('data:image/jpeg;base64,AAAA', '', document.getElementById('errJefe'))");
    await asentar();
    assert.equal(dijo.length, 1);
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /no salió/);
  });

  test('con un texto de más, lo dice y no se queda en «Mandando la foto…»', async () => {
    const { P, N } = abrirChat();
    P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = 'a'.repeat(1001);
    P.ev("subirFotoJefe('data:image/jpeg;base64,AAAA', '', document.getElementById('errJefe'))");
    await asentar();
    assert.equal(N.de('equipo_foto_escribir').length, 0);
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /muy largo/);
  });
});

describe('si app/chat.js no llegó, lo dice en vez de reventar', () => {

  test('«Enviar» pinta el aviso, no lanza y no manda nada', async () => {
    const { P, N } = abrirChat({ sinChat: true });
    const html = P.ev('vistaJefeEq()');
    P.ctx.document.getElementById('txtJefe').value = 'jefe, probando';
    assert.doesNotThrow(() => tocarDePantalla(P, html, 'btnJefe'));
    await asentar();
    assert.equal(N.de('equipo_chat_escribir').length, 0);
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /No cargó app\/chat\.js/);
    assert.equal(P.ctx.document.getElementById('txtJefe').value, 'jefe, probando', 'se perdió lo que escribió');
  });

  test('la foto, igual', () => {
    const { P, N } = abrirChat({ sinChat: true });
    assert.doesNotThrow(() => P.ev("subirFotoJefe('data:image/jpeg;base64,AAAA', '', document.getElementById('errJefe'))"));
    assert.equal(N.de('equipo_foto_escribir').length, 0);
    assert.match(P.ctx.document.getElementById('errJefe').textContent, /No cargó app\/chat\.js/);
  });
});

describe('que no vuelva', () => {

  test('en el código de crm.html nadie llama a un módulo que no existe aquí', () => {
    /* Los comentarios pueden contar la historia; el código no. El nombre de la
       variable del chat en esta página es CHAT, y se declara una sola vez. */
    const sinComentarios = CRM.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(sinComentarios, /[^\w.$]CH\.[A-Za-z_]/, 'volvió el nombre de play/ al CRM');
    assert.equal((CRM.match(/\bconst CHAT=window\.ChatTuGarantia;/g) || []).length, 1);
  });

  test('control: app/chat.js sigue dando lo que estas dos funciones le piden', () => {
    const C = require('../app/chat.js');
    assert.equal(typeof C.revisar, 'function');
    assert.equal(C.LARGO_MAX, 1000);
    assert.deepEqual(C.revisar(' hola '), { ok: true, texto: 'hola' });
  });
});
