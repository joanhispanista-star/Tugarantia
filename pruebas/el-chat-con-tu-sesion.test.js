/* ============================================================================
 * EL CHAT DEL PANEL EN EL BOLSILLO, CON LA SESIÓN DEL DUEÑO — 25-nov-2026 (v169)
 *
 *   node --test pruebas/el-chat-con-tu-sesion.test.js
 *
 * El chat del celular de Joan (panel/espejo.html: clientes y equipo) solo
 * funcionaba en un teléfono con la CLAVE del computador guardada. El de Joan
 * entra con su sesión y no la tiene: la pestaña decía «este teléfono todavía no
 * tiene la conexión y la clave». Los clientes escribían y nadie contestaba.
 *
 * panel/chat-de-sesion.js le presta la sesión al chat que YA existe: el mismo
 * pedido sale a la gemela `panel_…` (base/20261125b_el_chat_con_tu_sesion.sql),
 * sin la clave en el cuerpo. No hay pantalla nueva y app/chat.js no se toca.
 *
 * La base se prueba aparte, llamando en un PostgreSQL de verdad
 * (pruebas/el-chat-con-tu-sesion-postgres.test.js).
 * Los nombres y celulares son inventados.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CS = require('../panel/chat-de-sesion.js');
const CHAT = require('../app/chat.js');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = s => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&larr;/g, '←').replace(/\s+/g, ' ');
const ESPEJO = LEER('panel/espejo.html'), MODULO = LEER('panel/chat-de-sesion.js');

/* Una nube de mentira con la forma de NubeTuGarantia: anota cada rpc. */
function nubeDeSesion(o) {
  o = o || {};
  const vistas = [];
  return {
    vistas,
    config: () => (o.config === undefined ? { url: 'https://prueba.supabase.co', anon: 'anon', clave: '' } : o.config),
    conectado: () => o.conectado !== false,
    rpc(fn, cuerpo) {
      vistas.push({ fn, cuerpo });
      const r = o.rpc ? o.rpc(fn, cuerpo) : [];
      return r && typeof r.then === 'function' ? r : Promise.resolve(r);
    }
  };
}

describe('la pieza: la misma pregunta, por la puerta de la sesión', () => {
  test('sin sesión, sin conexión o sin nube no hay con qué preguntar: null, y quien llama dice por qué', () => {
    assert.equal(CS.cfg(null), null);
    assert.equal(CS.cfg({}), null);
    assert.equal(CS.cfg(nubeDeSesion({ conectado: false })), null);
    assert.equal(CS.cfg(nubeDeSesion({ config: { url: '', anon: '' } })), null);
    assert.equal(CS.cfg(nubeDeSesion({ config: null })), null);
    const c = CS.cfg(nubeDeSesion());
    assert.equal(c.url, 'https://prueba.supabase.co'); assert.equal(c.anon, 'anon');
    assert.equal(c.clave, '', 'inventó una clave'); assert.equal(c.porSesion, true); assert.equal(typeof c.fetch, 'function');
  });

  test('cada función del chat sale a su gemela panel_…, con el mismo cuerpo y SIN la clave', async () => {
    const N = nubeDeSesion({ rpc: fn => fn === 'panel_chat_responder' ? 77 : [{ cedula: '52000111', sin_leer: 1 }] });
    const cfg = CS.cfg(N);
    assert.deepEqual(await CHAT.conversaciones(cfg), [{ cedula: '52000111', sin_leer: 1 }]);
    await CHAT.conversacion(cfg, '52000111', 40, 'servicio');
    assert.equal(await CHAT.responder(cfg, '52000111', 'hola', 'servicio'), 77);
    await CHAT.llamar(cfg, 'equipo_chat_conversaciones', { p_clave: cfg.clave });
    await CHAT.llamar(cfg, 'equipo_chat_responder', { p_clave: 'una-que-alguien-pegó', p_celular: '3105550001', p_texto: 'hola' });
    assert.deepEqual(N.vistas.map(v => v.fn), ['panel_chat_conversaciones', 'panel_chat_de', 'panel_chat_responder', 'panel_equipo_chat_conversaciones', 'panel_equipo_chat_responder']);
    N.vistas.forEach(v => assert.equal('p_clave' in v.cuerpo, false, v.fn + ' mandó una clave'));
    assert.deepEqual(N.vistas[1].cuerpo, { p_cedula: '52000111', p_desde: 40, p_canal: 'servicio' });
    assert.deepEqual(N.vistas[2].cuerpo, { p_cedula: '52000111', p_texto: 'hola', p_canal: 'servicio' });
    assert.deepEqual(N.vistas[4].cuerpo, { p_celular: '3105550001', p_texto: 'hola' });
  });

  test('lo que no tiene gemela (borrar la conversación entera) se niega sin preguntarle nada a la nube', async () => {
    const N = nubeDeSesion();
    const cfg = CS.cfg(N);
    await assert.rejects(() => CHAT.llamar(cfg, 'chat_olvidar', { p_clave: '', p_cedula: '52000111' }), e => /hace falta el computador/.test(e.humano));
    await assert.rejects(() => CHAT.llamar(cfg, 'listar_registros', { p_clave: '' }), e => /hace falta el computador/.test(e.humano));
    await assert.rejects(() => CHAT.llamar(cfg, 'toString', {}), e => /hace falta el computador/.test(e.humano));
    assert.equal(N.vistas.length, 0, 'le preguntó a la nube por algo que no está en la lista');
  });

  test('cada fallo dice lo suyo: falta el SQL, sin señal, no es el dueño, la entrada vencida, el freno', async () => {
    const con = e => CHAT.conversaciones(CS.cfg(nubeDeSesion({ rpc: () => Promise.reject(e) }))).then(() => ({}), x => x);
    const falta = await con({ estado: 404, motivo: 'Supabase respondió 404', cuerpo: { code: 'PGRST202' } });
    assert.match(falta.humano, /Tu base todavía no tiene el chat con tu sesión\. Corre base\/20261125b_el_chat_con_tu_sesion\.sql/);
    assert.equal(/20260828b_chat/.test(falta.humano), false, 'mandó a correr el SQL del chat de agosto');
    assert.ok(fs.existsSync(path.join(RAIZ, 'base', CS.SQL)), 'el archivo que se nombra no existe');
    assert.match((await con({ motivo: 'Sin internet.', sin_red: true })).humano, /Sin señal: no pude hablar con la nube\./);
    assert.match((await con({ estado: 400, motivo: 'x', cuerpo: { message: 'no autorizado' } })).humano, /no es la del dueño/);
    assert.match((await con({ estado: 401, motivo: 'JWT expired' })).humano, /Tu entrada se venció/);
    const freno = await con({ estado: 400, motivo: 'x', cuerpo: { message: 'clave incorrecta' } });
    assert.match(freno.humano, /freno de la clave del computador/);
    assert.equal(freno.clave, undefined, 'con `clave: true` el Panel en el bolsillo dejaría de preguntar: aquí no hay clave que arreglar');
    assert.match((await con({ estado: 500, motivo: 'Supabase respondió 500' })).humano, /No pude hablar con la nube\. Supabase respondió 500/);
  });

  test('la lista de gemelas cubre TODO lo que el Panel en el bolsillo y chat.js piden con la clave, menos borrar', () => {
    const deChat = [...sinComentarios(LEER('app/chat.js')).matchAll(/llamar\(cfg, '([a-z_]+)',\s*(?:c\b|\{ p_clave)/g)].map(m => m[1]);
    const deEspejo = [...sinComentarios(ESPEJO).matchAll(/ChatTuGarantia\.llamar\(cfg, '([a-z_]+)'/g)].map(m => m[1]);
    const todas = [...new Set(deChat.concat(deEspejo))].filter(f => f !== 'chat_olvidar');
    assert.ok(todas.length >= 10, 'no encontré las llamadas: ' + todas.join());
    todas.forEach(f => assert.ok(CS.GEMELAS[f], '«' + f + '» se pide con la clave y no tiene gemela de sesión: con la sesión fallaría'));
    Object.entries(CS.GEMELAS).forEach(([f, g]) => assert.equal(g, 'panel_' + f));
    assert.equal(CS.GEMELAS.chat_olvidar, undefined);
  });
});

/* ---------------------------------------------------------------- en la pantalla */
const CONVS = [
  { cedula: '52111222', nombre: 'Bruno Ficha', celular: '3003334444', ultimo: 'listo', ultimo_de: 'panel', ultimo_en: '2026-11-25T13:00:00Z', sin_leer: 0 },
  { cedula: '3001234567', nombre: '', nombre_registro: 'William Pérez', ultimo: 'hola, ¿me ayudan?', ultimo_de: 'socio', ultimo_en: '2026-11-25T14:00:00Z', sin_leer: 2 }
];
const EQUIPO = [{ cedula: '3105550001', nombre: 'William Gerente', ultimo: 'jefe, ya cobré', ultimo_de: 'socio', ultimo_en: '2026-11-25T14:10:00Z', sin_leer: 1 }];
const HILO = [{ id: 41, de: 'socio', texto: 'hola, ¿me ayudan?', creado_en: '2026-11-25T14:00:00Z', canal: 'servicio' }];

/* El celular de Joan: con su sesión (o.sesion) y SIN la clave del computador, salvo que se pida. */
function celular(o) {
  o = o || {};
  const vistas = [];
  const contesta = Object.assign({ panel_chat_conversaciones: CONVS, panel_equipo_chat_conversaciones: EQUIPO, panel_chat_de: HILO,
    panel_equipo_chat_de: [], chat_conversaciones: CONVS, equipo_chat_conversaciones: EQUIPO, chat_de: HILO }, o.nube);
  const almacen = {};
  if (o.clave) almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: o.clave });
  const e = abrirEspejo({ almacen, sesion: o.sesion !== false && !o.clave, red: (url, cuerpo) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    if (!fn) return { status: 200, cuerpo: {} };
    vistas.push({ fn, cuerpo });
    if (contesta[fn] === undefined) return { status: 404, cuerpo: { code: 'PGRST202', message: 'no existe' } };
    const r = typeof contesta[fn] === 'function' ? contesta[fn](cuerpo) : contesta[fn];
    return r && r.status ? r : { status: 200, cuerpo: r };
  } });
  return { e, vistas, de: fn => vistas.filter(v => v.fn === fn) };
}
async function enChat(o) {
  const x = celular(o);
  await asentar();
  x.e.tocarPestania('mensajes'); x.e.correrPendientes(); await asentar(); await asentar();
  return x;
}

describe('en el Panel en el bolsillo, con la sesión y sin la clave', () => {
  test('la pestaña Chat trae clientes y equipo por la sesión, sin mandar ninguna clave', async () => {
    const { e, vistas, de } = await enChat();
    const t = plano(e.cuerpo());
    assert.match(t, /William Pérez/, 'no pinta la conversación del cliente: ' + t.slice(0, 300));
    assert.match(t, /William Gerente/, 'no pinta la del equipo');
    assert.equal(/todavía no has entrado|clave de sincronización/.test(t), false, 'sigue diciendo que no puede mirar');
    assert.equal(de('panel_chat_conversaciones').length >= 1 && de('panel_equipo_chat_conversaciones').length >= 1, true, JSON.stringify(vistas.map(v => v.fn)));
    assert.equal(vistas.filter(v => /^(chat_|equipo_chat|equipo_foto)/.test(v.fn)).length, 0, 'llamó a una función de clave: ' + JSON.stringify(vistas.map(v => v.fn)));
    vistas.filter(v => /^panel_(chat|equipo)/.test(v.fn)).forEach(v => assert.equal(v.cuerpo && 'p_clave' in v.cuerpo, false, v.fn + ' mandó una clave'));
  });

  test('abrir una conversación y contestar: el hilo y la respuesta salen por la sesión, y lo escrito queda en el hilo', async () => {
    const mandados = [];
    const { e, de } = await enChat({ nube: { panel_chat_responder: c => { mandados.push(c); return 99; } } });
    e.ev('abrirHilo("3001234567")'); await asentar(); await asentar();
    assert.match(plano(e.cuerpo()), /hola, ¿me ayudan\?/, 'no abrió el hilo: ' + plano(e.cuerpo()).slice(0, 300));
    assert.equal(de('panel_chat_de')[0].cuerpo.p_cedula, '3001234567');
    e.escribir('mResp', 'Hola William, ya te miro');
    e.ev('responderHilo()'); await asentar(); await asentar();
    assert.equal(mandados.length, 1, 'no salió la respuesta');
    assert.equal(mandados[0].p_cedula, '3001234567'); assert.equal(mandados[0].p_texto, 'Hola William, ya te miro');
    assert.equal('p_clave' in mandados[0], false);
    assert.equal(e.elems.mResp.value, '', 'lo mandó y el cuadro sigue lleno');
    assert.equal(e.elems.mErr.hidden, true, 'salió un error al mandar: ' + e.elems.mErr.textContent);
  });

  test('con la base sin el SQL (404) dice cuál archivo correr, no «revisa el internet» ni el SQL de agosto', async () => {
    const { e } = await enChat({ nube: { panel_chat_conversaciones: { status: 404, cuerpo: { code: 'PGRST202' } }, panel_equipo_chat_conversaciones: { status: 404, cuerpo: { code: 'PGRST202' } } } });
    const t = plano(e.cuerpo());
    assert.match(t, /Tu base todavía no tiene el chat con tu sesión\. Corre base\/20261125b_el_chat_con_tu_sesion\.sql/, t.slice(0, 400));
    assert.equal(/20260828b_chat|Revisa el internet/.test(t), false);
  });

  test('sin haber entrado: lo dice, con el botón para entrar, y no le pregunta nada a la nube', async () => {
    const { e, vistas } = await enChat({ sesion: false });
    const h = e.cuerpo();
    assert.match(plano(h), /El chat vive en la nube\. En este teléfono todavía no has entrado/);
    assert.match(plano(h), /No quiere decir que no te hayan escrito: quiere decir que no puedo mirar\./);
    assert.match(h, /<button class="btn arriba" type="button" data-acc="conexion">Entrar con mi correo<\/button>/);
    assert.equal(/clave de sincronización/.test(plano(h)), false, 'sigue pidiendo una clave que ya no hace falta');
    assert.equal(vistas.filter(v => /chat/.test(v.fn)).length, 0);
  });

  test('CONTROL · el teléfono que YA tiene la clave no cambia en nada: sigue por las funciones de siempre', async () => {
    const { e, vistas, de } = await enChat({ clave: 'clave-de-prueba-bien-larga' });
    assert.match(plano(e.cuerpo()), /William Pérez/);
    assert.equal(de('chat_conversaciones')[0].cuerpo.p_clave, 'clave-de-prueba-bien-larga');
    assert.equal(vistas.filter(v => /^panel_(chat|equipo)/.test(v.fn)).length, 0, 'con la clave puesta se fue por la sesión');
  });
});

describe('cómo llega a la página, y lo que NO se tocó', () => {
  test('el archivo firma al llegar; espejo.html lo pide con su versión, después de nube.js y de chat.js, y sw.js lo precarga', () => {
    const FIRMA = '(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();';
    const t = MODULO.replace(/\r\n/g, '\n').replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, '');
    assert.ok(t.startsWith(FIRMA), 'su primer código no es la firma');
    const v = (/<script src="chat-de-sesion\.js\?v=(\d+)"><\/script>/.exec(ESPEJO) || [])[1];
    assert.ok(v, 'espejo.html no pide chat-de-sesion.js con versión');
    const en = s => ESPEJO.indexOf(s);
    assert.ok(en('<script src="chat-de-sesion.js') > en('<script src="../app/chat.js"></script>') && en('<script src="chat-de-sesion.js') > en('<script src="nube.js'), 'va antes de lo que usa');
    assert.ok(LEER('sw.js').includes("'panel/chat-de-sesion.js?v=" + v + "'"), 'sw.js no lo precarga');
  });

  test('chatCfg: primero la clave (como siempre) y, sin ella, la sesión; app/chat.js no sabe nada de esto', () => {
    const codigo = sinComentarios(ESPEJO);
    assert.match(codigo, /function chatCfg\(\) \{\s+var c = \(NUBE && NUBE\.config\) \? NUBE\.config\(\) : null;\s+if \(c && c\.url && c\.anon && c\.clave\) return c;\s+try \{ return \(window\.ChatDeSesion && NUBE\) \? ChatDeSesion\.cfg\(NUBE\) : null; \} catch \(e\) \{ return null; \}\s+\}/);
    assert.equal(/panel_chat|ChatDeSesion|chat-de-sesion/.test(LEER('app/chat.js')), false, 'app/chat.js cambió: lo cargan cinco páginas sin versión');
    /* La pieza no trae ninguna clave ni la pide: la lee la base, adentro. */
    assert.equal(/config_privada|clave_sync/.test(sinComentarios(MODULO)), false);
    assert.match(sinComentarios(MODULO), /delete cuerpo\.p_clave;/);
  });

  test('en el CRM del celular, la pestaña Chat dice dónde se contesta y lleva allá', () => {
    const R = require('../panel/crm-remoto.js');
    assert.match(R.TAPAS.mensajes, /El chat se lee y se contesta en el Panel en el bolsillo/);
    assert.equal(/clave del computador/.test(R.TAPAS.mensajes), false, 'sigue diciendo que el chat necesita la clave del computador');
    const codigo = sinComentarios(LEER('panel/crm-remoto.js'));
    assert.deepEqual(JSON.parse(JSON.stringify(R.TAPAS_CON_SALIDA.mensajes)), { titulo: 'El chat está en el Panel en el bolsillo', a: 'espejo.html', boton: 'Abrir el Panel en el bolsillo' });
    assert.match(codigo, /'<a class="cr-ir cr-ir-chat" href="' \+ esc\(salida\.a\) \+ '">' \+ esc\(salida\.boton\) \+ '<\/a>'/);
    /* Su botón del menú ya no dice «PC»: no es cierto que solo se pueda en el computador. */
    assert.match(codigo, /if \(boton && !salida\) boton\.classList\.add\('cr-en-pc'\);/);
    assert.ok(fs.existsSync(path.join(RAIZ, 'panel', R.TAPAS_CON_SALIDA.mensajes.a)), 'el enlace no lleva a ninguna parte');
  });
});
