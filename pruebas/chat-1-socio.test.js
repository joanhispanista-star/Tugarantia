'use strict';
/* ==========================================================================
 * CHAT-1 EN LA APP INSTALADA — app/socio.html — 26 de octubre de 2026
 *
 *   node --test pruebas/chat-1-socio.test.js
 *
 * Joan, 23-oct: «quiero poder chatear con los clientes». Del lado del
 * cliente el chat de la app instalada era el más pobre de las tres (PLAN del
 * chat, §0): sin número, sin fotos, miraba la nube solo con la pestaña
 * abierta y escribía SIEMPRE en «servicio» (cada contestación de Joan en
 * «Cobranzas» contaba como contacto nuevo para la Ley 2300). Estas pruebas
 * ARRANCAN socio.html en su banco (banco-socio.js) con una nube de mentira y
 * miran LO QUE SE PINTA —#chNavN, #chHilo, #chErr, el cuadro de texto— y lo
 * que se le PIDE a la nube, porque así fue como se escapó vigilarJefeEq en el
 * CRM: existía, estaba bien escrita y nadie la llamaba.
 *
 * Cada bloque falla con c992a83 (chat-1 sin la parte del socio) y pasa hoy:
 *   1. La pestaña se llama «Chat»; el comentario del CSS dice la verdad
 *      nueva; la lámina no promete avisos; sw.js precarga el módulo y el
 *      CACHE no se tocó (lo sube la integración del 30-oct).
 *   2. «Chat (n)» en la barra, latiendo cada 20 s en TODA la app: a la
 *      vista cuenta; escondida cuenta cada minuto y NUNCA pide el hilo; al
 *      volver pregunta una vez; con la función sin correr (404) no insiste;
 *      al salir se borra y se para.
 *   3. La conversación abierta se mueve sola (ChatVivo.hilo, 8 s): solo lo
 *      nuevo desde el último id, sin tocar el cuadro de texto, nunca
 *      escondida, y muere al salir de la pestaña. Leer deja el número en
 *      cero, también contra una cuenta que llegue tarde.
 *   4. Contesta en el canal del último mensaje RECIBIDO; «servicio» si nadie
 *      le ha escrito. Un envío fallido deja el texto y lo dice al lado.
 *   5. Fotos: mandar (comprimida, por el canal de la respuesta, con el pie
 *      del cuadro, cada motivo con sus palabras) y abrir la grande.
 *   6. Sin app/chat-vivo.js la pestaña anda como antes: una carga, mandar, y
 *      el número una sola vez; ningún reloj.
 *   7. La cuenta sin juntar también tiene el hilo vivo.
 *
 * chat.js y chat-vivo.js corren DENTRO del banco (los <script src> de la
 * página), así que hablan con el fetch de mentira: nada sale a internet.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const AHORA = Date.parse('2026-10-26T15:00:00Z');
const CORREO = '573001112222@tugarantia.net';
const tokenDe = extra => Object.assign({ access_token: 'acceso-1', refresh_token: 'renovar-1',
  expires_at: Math.floor(AHORA / 1000) + 3600, user: { email: CORREO } }, extra || {});
const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
  socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
const msg = (id, de, texto, extra) => Object.assign({ id, de, texto, creado_en: '2026-10-26T10:00:00-05:00', visto: false }, extra || {});

/* La nube de mentira. `hilo` es lo que hay en cada canal (la prueba le mete
   mensajes entre latido y latido); `sinLeer` lo que contesta
   chat_sin_leer_sesion (un objeto, una función, o 404); `escribir`, `foto` y
   `fotoVer` lo que contestan esas tres. Anota cada llamada a una función. */
function nube(o) {
  o = o || {};
  const hilo = o.hilo || { servicio: [], cobranza: [], creditos: [] };
  const vistas = [];
  const respuesta = (r, cuerpo) => (typeof r === 'function' ? r(cuerpo) : r);
  const red = (url, cuerpo) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    if (fn) vistas.push({ fn, cuerpo });
    if (/grant_type=password$/.test(url)) {
      return cuerpo && cuerpo.password === 'clave' && cuerpo.email === CORREO
        ? { status: 200, cuerpo: tokenDe() }
        : { status: 400, cuerpo: { error: 'invalid_grant' } };
    }
    if (/grant_type=refresh_token$/.test(url)) return { status: 200, cuerpo: tokenDe({ access_token: 'acceso-2' }) };
    if (fn === 'mi_cuenta') {
      return o.miCuenta || { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-26T14:00:00Z' } };
    }
    if (fn === 'mi_registro') return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-10-26T14:55:00Z' } } };
    if (fn === 'chat_leer_sesion') {
      const lista = (hilo[cuerpo.p_canal] || []).filter(m => Number(m.id) > Number(cuerpo.p_desde || 0));
      return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: lista } };
    }
    if (fn === 'chat_sin_leer_sesion') {
      const r = respuesta(o.sinLeer, cuerpo);
      if (r === 404) return { status: 404, cuerpo: { message: 'no existe' } };
      if (r && typeof r.then === 'function') return r;
      return { status: 200, cuerpo: Object.assign({ ok: true, servicio: 0, cobranza: 0, creditos: 0 }, r || {}) };
    }
    if (fn === 'chat_escribir_sesion') return respuesta(o.escribir, cuerpo) || { status: 200, cuerpo: { ok: true, id: 50 } };
    if (fn === 'chat_foto_sesion') return respuesta(o.foto, cuerpo) || { status: 200, cuerpo: { ok: true, id: 60 } };
    if (fn === 'chat_foto_sesion_ver') return respuesta(o.fotoVer, cuerpo) || { status: 200, cuerpo: { ok: true, imagen: 'data:image/jpeg;base64,AAAA' } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
  return { o, red, vistas, hilo, de: fn => vistas.filter(v => v.fn === fn) };
}

/* La app con la cuenta de Adriana abierta en Inicio. `reloj(ms)` toca el
   setInterval vivo de esos milisegundos y espera a que se asiente. */
async function abrirCuenta(o) {
  o = o || {};
  const N = nube(o.nube);
  const A = abrirSocio({ red: N.red, ahora: AHORA, sin: o.sin });
  await asentar();
  A.elem('inCel').value = '3001112222'; A.elem('inClave').value = 'clave';
  A.ev('entrar()');
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la cuenta de prueba no abrió');
  assert.equal(A.ev('S.origen'), 'nube');
  const vivos = ms => A.intervalos.filter(i => i.ms === ms && i.vivo);
  const reloj = async ms => {
    const r = vivos(ms);
    assert.ok(r.length, 'no hay reloj vivo de ' + ms + ' ms: ' + A.intervalos.map(i => i.ms + (i.vivo ? '' : '†')).join(', '));
    r.forEach(i => i.fn());
    await asentar(16);
  };
  return { A, N, reloj, vivos };
}
const el = (A, id) => A.elem(id);

/* ========================================================================== */
describe('1. «Chat»: el nombre, el comentario del CSS, lo que no se promete, sw.js', () => {
  const SOCIO = leer('app/socio.html');
  const SW = leer('sw.js');

  test('la pestaña de la barra se llama Chat y lleva el sitio del número; los títulos de la lámina también', () => {
    assert.match(SOCIO, /<button data-t="chat">Chat<span id="chNavN"><\/span><\/button>/, 'la barra sigue diciendo «Mensajes», o no tiene dónde pintar el número');
    assert.doesNotMatch(SOCIO, />Mensajes<\/button>/);
    assert.doesNotMatch(SOCIO, /<h3 class="tit">Mensajes<\/h3>/, 'la lámina del chat sigue titulada «Mensajes»');
    assert.equal((SOCIO.match(/<h3 class="tit">Chat<\/h3>/g) || []).length, 2, 'las dos láminas (con nube y sin ella) se titulan «Chat»');
  });

  test('el comentario del CSS ya no justifica no tener número con un hecho que dejó de ser cierto el 19-oct', () => {
    assert.doesNotMatch(SOCIO, /NO hay globito de «sin leer»/, 'el comentario viejo sigue ahí');
    assert.match(SOCIO, /SÍ HAY NÚMERO EN LA PESTAÑA[\s\S]{0,400}chat_sin_leer_sesion/, 'el comentario nuevo no dice de dónde sale el número');
  });

  test('la lámina del chat no promete avisos ni tiempo real: con la app cerrada no llega nada', () => {
    const lamina = sinComentarios(SOCIO.slice(SOCIO.indexOf('function vistaChat()'), SOCIO.indexOf('function chatPintar()')));
    assert.ok(lamina.length > 500, 'no encontré la lámina del chat');
    assert.doesNotMatch(lamina, /te avis|tiempo real|al instante|notificaci/i, 'la lámina promete un aviso que el código no manda');
  });

  test('la página carga app/chat-vivo.js, sw.js lo precarga, y el CACHE sigue en v139 (lo sube la integración del 30-oct)', () => {
    assert.match(SOCIO, /<script src="chat-vivo\.js"><\/script>/);
    assert.match(SW, /'app\/chat-vivo\.js'/, 'un service worker sin el archivo en su lista lo serviría como página HTML (la lección de la v18)');
    assert.match(SW, /const CACHE = 'tugarantia-v139'/, 'chat-1 no sube el CACHE: lo hace quien integra el lote del 30-oct');
  });
});

/* ========================================================================== */
describe('2. «Chat (n)» en la barra, latiendo cada 20 s en toda la app', () => {

  test('al abrir la cuenta pregunta cuántos faltan por leer (sin tocar el hilo) y lo pinta en la barra', async () => {
    const { A, N } = await abrirCuenta({ nube: { sinLeer: { servicio: 1, creditos: 1 } } });
    assert.equal(A.ev('TAB'), 'inicio');
    assert.equal(N.de('chat_sin_leer_sesion').length, 1, 'no preguntó cuántos faltan por leer al abrir la cuenta');
    assert.equal(N.de('chat_leer_sesion').length, 0, 'leyó el hilo desde Inicio: eso lo marca «Lo vio» sin que nadie lo mire');
    assert.equal(el(A, 'chNavN').textContent, ' (2)', 'la barra no dice «Chat (2)»');
    assert.equal(N.de('chat_sin_leer_sesion')[0].cuerpo && Object.keys(N.de('chat_sin_leer_sesion')[0].cuerpo).length, 0);
  });

  test('cada 20 s vuelve a contar; cuando no queda nada, el número se va', async () => {
    const { A, N, reloj } = await abrirCuenta({ nube: { sinLeer: { cobranza: 3 } } });
    assert.equal(el(A, 'chNavN').textContent, ' (3)');
    N.o.sinLeer = { servicio: 0 };
    await reloj(20000);
    assert.equal(N.de('chat_sin_leer_sesion').length, 2, 'el reloj de 20 s no contó');
    assert.equal(el(A, 'chNavN').textContent, '', 'quedó un número viejo en la barra');
    N.o.sinLeer = { servicio: 4 };
    await reloj(20000);
    assert.equal(el(A, 'chNavN').textContent, ' (4)');
  });

  test('escondida cuenta cada minuto y NUNCA pide el hilo; al volver a la pestaña pregunta una vez', async () => {
    const { A, N, reloj } = await abrirCuenta({ nube: { sinLeer: { servicio: 1 }, hilo: { servicio: [msg(1, 'panel', 'hola')], cobranza: [], creditos: [] } } });
    A.ctx.document.hidden = true;
    const antes = N.de('chat_sin_leer_sesion').length;
    await reloj(20000);
    assert.equal(N.de('chat_sin_leer_sesion').length, antes, 'el reloj de la vista trabajó escondido');
    await reloj(60000);
    assert.equal(N.de('chat_sin_leer_sesion').length, antes + 1, 'escondida no contó cada minuto');
    assert.equal(N.de('chat_leer_sesion').length, 0, 'escondida pidió el hilo: lo marcaría «Lo vio» sin que nadie lo mire');
    A.ctx.document.hidden = false;
    A.dispararDoc('visibilitychange');
    await asentar(16);
    assert.equal(N.de('chat_sin_leer_sesion').length, antes + 2, 'al volver a la pestaña no preguntó');
  });

  test('si la base todavía no tiene la función (404), no se pinta número y no se insiste cada 20 s', async () => {
    const { A, N, reloj } = await abrirCuenta({ nube: { sinLeer: 404 } });
    assert.equal(el(A, 'chNavN').textContent, '', 'pintó un número sin saberlo');
    assert.equal(A.ev('SIN_LEER_APAGADO'), true);
    await reloj(20000);
    assert.equal(N.de('chat_sin_leer_sesion').length, 1, 'siguió preguntando por una función que no existe');
    assert.equal(A.avisos.length, 0, 'un 404 del contador no es un alert para el cliente');
  });

  test('«Salir» borra el número y para el reloj', async () => {
    const { A, N, vivos } = await abrirCuenta({ nube: { sinLeer: { servicio: 2 } } });
    assert.equal(el(A, 'chNavN').textContent, ' (2)');
    A.ev('salir()');
    await asentar(16);
    assert.equal(el(A, 'chNavN').textContent, '', 'el número de otra cuenta se quedó en la barra');
    assert.equal(vivos(20000).length, 0, 'el reloj de 20 s siguió vivo sin sesión');
    const n = N.de('chat_sin_leer_sesion').length;
    A.intervalos.filter(i => i.ms === 20000).forEach(i => i.fn());
    await asentar(16);
    assert.equal(N.de('chat_sin_leer_sesion').length, n, 'sin sesión siguió preguntando');
  });
});

/* ========================================================================== */
describe('3. la conversación abierta se mueve sola', () => {

  test('al abrir Chat lee los tres canales desde 0 y arma el reloj de 8 s; leer deja el número en cero', async () => {
    const hilo = { servicio: [msg(1, 'panel', 'hola, ¿cómo vas?')], cobranza: [], creditos: [] };
    const { A, N, vivos } = await abrirCuenta({ nube: { sinLeer: { servicio: 1 }, hilo } });
    assert.equal(el(A, 'chNavN').textContent, ' (1)');
    A.ev("irA('chat')"); await asentar(16);
    const lecturas = N.de('chat_leer_sesion');
    assert.deepEqual(lecturas.map(l => l.cuerpo.p_canal).sort(), ['cobranza', 'creditos', 'servicio']);
    assert.ok(lecturas.every(l => l.cuerpo.p_desde === 0));
    assert.match(plano(el(A, 'chHilo').innerHTML), /hola, ¿cómo vas\?/);
    assert.ok(vivos(8000).length, 'no hay reloj de 8 s para el hilo abierto: ' + A.intervalos.map(i => i.ms).join(', '));
    assert.equal(el(A, 'chNavN').textContent, '', 'leyó el hilo y la barra sigue diciendo que falta uno');
  });

  test('cada 8 s pide SOLO lo nuevo desde el último id y lo pinta sin tocar el cuadro de texto; sin nada nuevo no repinta', async () => {
    const hilo = { servicio: [msg(1, 'panel', 'hola')], cobranza: [msg(2, 'auto', 'Recuerda tu cuota', { regla: 'recordatorio' })], creditos: [] };
    const { A, N, reloj } = await abrirCuenta({ nube: { hilo } });
    A.ev("irA('chat')"); await asentar(16);
    assert.match(plano(el(A, 'chHilo').innerHTML), /hola.*Recuerda tu cuota/);
    el(A, 'chTexto').value = 'estoy escribiendo…';
    hilo.servicio.push(msg(3, 'panel', '¿sigues ahí?'));
    await reloj(8000);
    const segunda = N.de('chat_leer_sesion').slice(3);
    assert.equal(segunda.length, 3, 'el reloj no pidió el hilo');
    assert.ok(segunda.every(l => l.cuerpo.p_desde === 2), 'pidió el hilo entero en vez de lo nuevo desde el id 2: ' + JSON.stringify(segunda.map(l => l.cuerpo)));
    assert.match(plano(el(A, 'chHilo').innerHTML), /hola.*Recuerda tu cuota.*¿sigues ahí\?/, 'lo nuevo no se pintó en su orden');
    assert.equal(el(A, 'chTexto').value, 'estoy escribiendo…', 'repintó el cuadro de texto: se llevó lo que el cliente escribía');
    el(A, 'chHilo').innerHTML = 'MARCA';
    await reloj(8000);
    assert.equal(el(A, 'chHilo').innerHTML, 'MARCA', 'repintó el hilo sin que llegara nada');
  });

  test('escondida NO pide el hilo; al salir de la pestaña el reloj muere y al volver a entrar arranca otro', async () => {
    const hilo = { servicio: [msg(1, 'panel', 'hola')], cobranza: [], creditos: [] };
    const { A, N, reloj, vivos } = await abrirCuenta({ nube: { hilo } });
    A.ev("irA('chat')"); await asentar(16);
    assert.equal(N.de('chat_leer_sesion').length, 3);
    A.ctx.document.hidden = true;
    await reloj(8000);
    assert.equal(N.de('chat_leer_sesion').length, 3, 'pidió el hilo con la app escondida: lo marca «Lo vio» sin que nadie lo mire');
    A.ctx.document.hidden = false;
    A.ev("irA('inicio')"); await asentar();
    assert.equal(vivos(8000).length, 0, 'salió de Chat y el reloj del hilo siguió vivo');
    A.intervalos.filter(i => i.ms === 8000).forEach(i => i.fn());
    await asentar(16);
    assert.equal(N.de('chat_leer_sesion').length, 3, 'desde Inicio siguió pidiendo el hilo');
    A.ev("irA('chat')"); await asentar(16);
    assert.equal(vivos(8000).length, 1, 'al volver a Chat no hay UN reloj vivo');
    assert.equal(N.de('chat_leer_sesion').length, 6);
  });

  test('una cuenta pedida ANTES de leer el hilo llega tarde y no vuelve a encender el número', async () => {
    let tarde = null;
    const hilo = { servicio: [msg(1, 'panel', 'hola')], cobranza: [], creditos: [] };
    const { A, N, reloj } = await abrirCuenta({ nube: { hilo, sinLeer: () => (tarde ? new Promise(r => { tarde.push(r); }) : { servicio: 1 }) } });
    assert.equal(el(A, 'chNavN').textContent, ' (1)');
    tarde = [];                       /* desde aquí la cuenta se queda en el aire */
    await reloj(20000);               /* se pide la cuenta… */
    assert.equal(tarde.length, 1);
    A.ev("irA('chat')"); await asentar(16);   /* …se lee el hilo (la base lo deja en cero)… */
    assert.equal(el(A, 'chNavN').textContent, '');
    tarde[0]({ status: 200, cuerpo: { ok: true, servicio: 1, cobranza: 0, creditos: 0 } });   /* …y la cuenta vieja llega */
    await asentar(16);
    assert.equal(el(A, 'chNavN').textContent, '', 'la cuenta vieja volvió a poner «(1)» sobre lo que la persona está mirando');
    assert.equal(N.de('chat_leer_sesion').length, 3);
  });
});

/* ========================================================================== */
describe('4. contesta en el canal del último mensaje recibido', () => {

  test('con un cobro recibido contesta en «cobranza», y cuando contestan en «créditos», en créditos', async () => {
    const hilo = { servicio: [msg(1, 'socio', 'hola')], cobranza: [msg(2, 'auto', 'Recuerda tu cuota')], creditos: [] };
    const { A, N, reloj } = await abrirCuenta({ nube: { hilo } });
    A.ev("irA('chat')"); await asentar(16);
    el(A, 'chTexto').value = 'ya pagué, mando el comprobante';
    A.ev('chatEnviar()'); await asentar(16);
    assert.equal(N.de('chat_escribir_sesion').length, 1, 'no mandó');
    assert.equal(N.de('chat_escribir_sesion')[0].cuerpo.p_canal, 'cobranza', 'contestó un cobro en «servicio»: la respuesta de Joan contaría como contacto nuevo (Ley 2300)');
    assert.equal(N.de('chat_escribir_sesion')[0].cuerpo.p_texto, 'ya pagué, mando el comprobante');
    assert.equal(el(A, 'chTexto').value, '', 'la nube dijo que sí y el cuadro no se vació');
    assert.equal(N.de('chat_leer_sesion').length, 6, 'después de mandar no volvió a preguntar: lo que se ve tiene que ser lo que quedó guardado');
    assert.ok(N.de('chat_leer_sesion').slice(3).every(l => l.cuerpo.p_desde === 2));
    hilo.creditos.push(msg(3, 'equipo', '¿cuánto necesitas?'));
    await reloj(8000);
    assert.match(plano(el(A, 'chHilo').innerHTML), /cuánto necesitas/);
    el(A, 'chTexto').value = 'unos 300 mil';
    A.ev('chatEnviar()'); await asentar(16);
    assert.equal(N.de('chat_escribir_sesion')[1].cuerpo.p_canal, 'creditos');
  });

  test('si nadie le ha escrito (o solo escribió él), va a «servicio»', async () => {
    const hilo = { servicio: [msg(1, 'socio', 'hola')], cobranza: [], creditos: [] };
    const { A, N } = await abrirCuenta({ nube: { hilo } });
    A.ev("irA('chat')"); await asentar(16);
    el(A, 'chTexto').value = '¿me pueden ayudar?';
    A.ev('chatEnviar()'); await asentar(16);
    assert.equal(N.de('chat_escribir_sesion')[0].cuerpo.p_canal, 'servicio');
  });

  test('un envío que la nube rechaza o que se cae deja el texto en el cuadro y lo dice al lado, sin alert', async () => {
    const hilo = { servicio: [msg(1, 'panel', 'hola')], cobranza: [], creditos: [] };
    const { A, N } = await abrirCuenta({ nube: { hilo, escribir: { status: 200, cuerpo: { ok: false, motivo: 'demasiados mensajes seguidos' } } } });
    A.ev("irA('chat')"); await asentar(16);
    el(A, 'chTexto').value = 'otra vez';
    A.ev('chatEnviar()'); await asentar(16);
    assert.equal(el(A, 'chTexto').value, 'otra vez', 'la nube dijo que no y el texto se perdió');
    assert.ok(!el(A, 'chErr').classList.contains('oculto'), 'no se dijo nada');
    assert.match(el(A, 'chErr').textContent, /demasiados mensajes seguidos/);
    assert.match(el(A, 'chErr').textContent, /El texto sigue en el cuadro/);
    assert.equal(A.avisos.length, 0, 'lo dijo con un alert en vez de al lado del cuadro');
    N.o.escribir = { status: 500, cuerpo: { message: 'caída' } };
    A.ev('chatEnviar()'); await asentar(16);
    assert.equal(el(A, 'chTexto').value, 'otra vez');
    assert.match(el(A, 'chErr').textContent, /El texto sigue en el cuadro/);
    assert.equal(A.ev('CH.enviando'), false, 'se quedó «enviando» para siempre');
  });
});

/* ========================================================================== */
describe('5. fotos: mandar y ver', () => {
  const FOTO = 'data:image/jpeg;base64,AAAA', MINI = 'data:image/jpeg;base64,BBBB';
  const conFotoLista = A => A.ev('CHAT.prepararFoto = function () { return Promise.resolve({ grande: "' + FOTO + '", chica: "' + MINI + '" }); }');

  test('la lámina tiene «📷 Mandar una foto», y manda la foto comprimida por el canal de la respuesta con el pie del cuadro', async () => {
    const hilo = { servicio: [], cobranza: [msg(2, 'panel', 'mándame el comprobante')], creditos: [] };
    const { A, N } = await abrirCuenta({ nube: { hilo } });
    A.ev("irA('chat')"); await asentar(16);
    const h = el(A, 'cuerpo').innerHTML;
    assert.match(h, /id="chFoto"[^>]*accept="image\/\*"/, 'el cliente no tiene por dónde mandar una foto');
    assert.match(plano(h), /📷 Mandar una foto/);
    assert.match(plano(h), /Solo fotos: un video no cabe/);
    conFotoLista(A);
    el(A, 'chTexto').value = 'ahí va';
    A.ev('chatMandarFoto({ files: [{ type: "image/jpeg", name: "c.jpg" }], value: "x" })');
    await asentar(16);
    const f = N.de('chat_foto_sesion');
    assert.equal(f.length, 1, 'no llegó a chat_foto_sesion');
    assert.deepEqual(f[0].cuerpo, { p_canal: 'cobranza', p_imagen: FOTO, p_miniatura: MINI, p_texto: 'ahí va' });
    assert.equal(el(A, 'chTexto').value, '', 'mandó y el pie se quedó en el cuadro');
    assert.ok(el(A, 'chErr').classList.contains('oculto'));
    assert.equal(N.de('chat_leer_sesion').length, 6, 'después de la foto no volvió a preguntar el hilo');
    assert.equal(A.ev('CH.enviando'), false);
  });

  test('cada motivo de la base se dice con sus palabras, el pie no se pierde, y un video se ataja antes de subir', async () => {
    const { A, N } = await abrirCuenta({ nube: { foto: { status: 200, cuerpo: { ok: false, motivo: 'tope' } } } });
    A.ev("irA('chat')"); await asentar(16);
    conFotoLista(A);
    el(A, 'chTexto').value = 'el pie';
    A.ev('chatMandarFoto({ files: [{ type: "image/jpeg" }], value: "x" })'); await asentar(16);
    assert.match(el(A, 'chErr').textContent, /máximo de fotos de este mes/);
    assert.equal(el(A, 'chTexto').value, 'el pie');
    assert.equal(A.avisos.length, 0);
    A.ev('CHAT.prepararFoto = function () { return Promise.reject({ motivo: "es_video" }); }');
    A.ev('chatMandarFoto({ files: [{ type: "video/mp4" }], value: "x" })'); await asentar(16);
    assert.match(el(A, 'chErr').textContent, /Un video no cabe/);
    assert.equal(N.de('chat_foto_sesion').length, 1, 'el video se intentó subir');
    assert.equal(A.ev('CH.enviando'), false);
  });

  test('la miniatura de una foto recibida se puede tocar: pide la grande por su id y la enseña aquí mismo', async () => {
    const hilo = { servicio: [msg(7, 'panel', 'mira', { foto: 7, miniatura: MINI })], cobranza: [], creditos: [] };
    const { A, N } = await abrirCuenta({ nube: { hilo } });
    A.ev("irA('chat')"); await asentar(16);
    assert.match(el(A, 'chHilo').innerHTML, /onclick="chatVerFoto\(7\)"/, 'la miniatura sigue apagada: una foto que no se puede abrir es una función muda');
    A.ev('chatMostrarFoto = function (img) { window.__foto = img; }');
    A.ev('chatVerFoto(7)'); await asentar(16);
    assert.equal(N.de('chat_foto_sesion_ver').length, 1);
    assert.equal(N.de('chat_foto_sesion_ver')[0].cuerpo.p_id, 7);
    assert.equal(A.ev('window.__foto'), FOTO);
  });
});

/* ========================================================================== */
describe('6. sin app/chat-vivo.js (una copia vieja en la caché), el chat anda como antes', () => {

  test('una carga al abrir, otra después de mandar, el número una sola vez; ningún reloj', async () => {
    const hilo = { servicio: [msg(1, 'panel', 'hola')], cobranza: [], creditos: [] };
    const { A, N, vivos } = await abrirCuenta({ sin: ['chat-vivo.js'], nube: { hilo, sinLeer: { servicio: 1 } } });
    assert.equal(A.ev('typeof VIVO'), 'undefined');
    assert.equal(el(A, 'chNavN').textContent, ' (1)', 'sin el módulo tampoco preguntó una vez');
    assert.equal(vivos(20000).length, 0);
    A.ev("irA('chat')"); await asentar(16);
    assert.equal(N.de('chat_leer_sesion').length, 3);
    assert.match(plano(el(A, 'chHilo').innerHTML), /hola/);
    assert.equal(el(A, 'chNavN').textContent, '');
    assert.equal(vivos(8000).length, 0);
    el(A, 'chTexto').value = 'gracias';
    A.ev('chatEnviar()'); await asentar(16);
    assert.equal(N.de('chat_escribir_sesion').length, 1);
    assert.equal(N.de('chat_leer_sesion').length, 6, 'después de mandar no volvió a cargar');
    assert.equal(el(A, 'chTexto').value, '');
  });
});

/* ========================================================================== */
describe('7. la cuenta sin juntar también tiene el hilo vivo', () => {

  test('ve su registro y su chat, y el chat se mueve solo', async () => {
    const hilo = { servicio: [msg(1, 'panel', 'ya te juntamos')], cobranza: [], creditos: [] };
    const N = nube({ hilo, miCuenta: { status: 200, cuerpo: { ok: true, vinculada: false } } });
    const A = abrirSocio({ red: N.red, ahora: AHORA });
    await asentar();
    A.elem('inCel').value = '3001112222'; A.elem('inClave').value = 'clave';
    A.ev('entrar()'); await asentar(16);
    assert.ok(!A.visible('pCuenta'));
    assert.match(el(A, 'entrarCuerpo').innerHTML, /id="chHilo"/);
    assert.match(plano(el(A, 'chHilo').innerHTML), /ya te juntamos/);
    const vivo = A.intervalos.filter(i => i.ms === 8000 && i.vivo);
    assert.equal(vivo.length, 1, 'el hilo de la cuenta sin juntar no se mueve solo');
    hilo.servicio.push(msg(2, 'panel', 'entra otra vez y ves tu cuenta'));
    vivo[0].fn(); await asentar(16);
    assert.match(plano(el(A, 'chHilo').innerHTML), /entra otra vez/);
  });
});
