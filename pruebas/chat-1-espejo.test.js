/* ============================================================================
 * CHAT-1 EN EL CELULAR DE JOAN — panel/espejo.html, 26 de octubre de 2026
 *
 *   node --test pruebas/chat-1-espejo.test.js
 *
 * Joan, 23-oct: «quiero poder chatear con los del equipo, y también quiero
 * poder chatear con los clientes… un chat interno de la app Tu Garantía». En
 * el celular (el Panel en el bolsillo) el chat con clientes existía y el del
 * equipo no; el hilo abierto no se movía; y la conversación era una tarjeta
 * con el hilo de 46vh y la barra debajo. Son los puntos 1, 3 y 6 del plan
 * chat-1 (PLAN del chat, §5), la parte del espejo:
 *
 *   1. «Mensajes» se llama «Chat».
 *   3. La conversación abierta se mueve sola con app/chat-vivo.js: cada 8 s
 *      solo lo nuevo, pinta solo la caja del hilo, no toca el cuadro de texto,
 *      nunca escondida, y si falla un envío el texto sigue en el cuadro.
 *   6. Chat = Clientes · Equipo; lista → conversación a pantalla completa con
 *      ← y el gesto de atrás de Android; el hilo del equipo con texto y foto;
 *      «💬 Escribirle por la app» desde la ficha.
 *
 * Y un defecto viejo que salió al pasar: mandar una foto al cliente desde el
 * celular llamaba traerHilo(), que no existía, y la pantalla decía «No pude
 * mandarla» después de mandarla.
 *
 * Todo se prueba ARRANCANDO la página en su banco (pruebas/banco-espejo.js)
 * con una nube de mentira, y mirando lo que se PINTA: el cuerpo, #mHilo, el
 * globo de la barra, #mErr, el history. Ninguna prueba sale a la red ni suena.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&larr;/g, '←').replace(/\s+/g, ' ');
const CLAVE = 'clave-de-prueba-bien-larga';
const FOTO = 'data:image/png;base64,iVBORw0KGgo=';

/* Una respuesta de la nube, con la forma que chat.js lee (text()). */
const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))) });

/* La nube de mentira: por nombre de función, una respuesta fija o una función
   del cuerpo. Lo que no está, 404. Anota cada llamada. */
function nube(o) {
  const vistas = [];
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    if (o[fn] !== undefined) {
      const r = typeof o[fn] === 'function' ? o[fn](cuerpo) : o[fn];
      return Promise.resolve(r && r.status ? resp(r.status, r.cuerpo) : resp(200, r));
    }
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas, de: fn => vistas.filter(v => v.fn === fn) };
}

const CONVS = [
  { cedula: '52111222', nombre: 'Bruno Ficha', celular: '3003334444', ultimo: 'listo', ultimo_de: 'panel',
    ultimo_en: '2026-10-26T13:00:00Z', sin_leer: 0 },
  { cedula: '3001234567', nombre: '', nombre_registro: 'William Pérez', ultimo: 'hola', ultimo_de: 'socio',
    ultimo_en: '2026-10-26T14:00:00Z', sin_leer: 2 }
];
const EQUIPO = [
  { cedula: '3105550001', nombre: 'William Gerente', ultimo: 'jefe, ya cobré', ultimo_de: 'socio',
    ultimo_en: '2026-10-26T14:10:00Z', sin_leer: 1 },
  { cedula: '3105550002', nombre: 'Ana Asesora', ultimo: '', ultimo_de: null, ultimo_en: null, sin_leer: 0 }
];
const HILO = [{ id: 41, de: 'socio', texto: 'hola', creado_en: '2026-10-26T14:00:00Z', canal: 'servicio' }];
const HILO_EQUIPO = [
  { id: 7, de: 'panel', texto: 'William, ¿cobraste?', creado_en: '2026-10-26T14:00:00Z', visto: true },
  { id: 8, de: 'socio', texto: 'jefe, ya cobré', creado_en: '2026-10-26T14:10:00Z', foto: 5, miniatura: FOTO }
];

let n = 1;
const socio = (id, nombre, extra) => Object.assign({ id, numero: n++, nombre,
  cedula: '52' + String(n).padStart(6, '0'), telefono: '310' + String(1000000 + n),
  gestiones: [], ajusteGarantia: 0, referidoPor: '' }, extra || {});
function cartera() {
  n = 1;
  return { socios: [
    socio('s-bru', 'Bruno Ficha', { cedula: '52111222', telefono: '3003334444', whatsappIgual: true }),
    socio('s-sin', 'Sin Cédula Todavía', { cedula: '', telefono: '3001112222', whatsappIgual: true,
      cuentaJunta: { celular: '3001112222', fecha: '2026-10-10', registro_id: 9, por: 'crm' } })
  ], prestamos: [], respaldados: [] };
}

/* El celular de Joan, conectado y con su clave, con una nube por función. */
function celular(o) {
  o = o || {};
  const almacen = {};
  if (o.conectado !== false) {
    almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'anon', clave: CLAVE });
  }
  const N = nube(Object.assign({ chat_conversaciones: CONVS, equipo_chat_conversaciones: EQUIPO, chat_de: HILO,
    equipo_chat_de: HILO_EQUIPO }, o.nube));
  const e = abrirEspejo({ almacen, ui: o.ui, cartera: o.cartera, sin: o.sin,
    red: (url, cuerpo) => N.red(url, { body: JSON.stringify(cuerpo) })
      .then(r => r.text().then(t => ({ status: r.status, cuerpo: t }))) });
  return { e, N };
}
async function enChat(o) {
  const x = celular(o);
  await asentar();
  x.e.tocarPestania('mensajes'); x.e.correrPendientes(); await asentar();
  return x;
}
const globo = e => e.elems.globoMensajes;
const charla = e => /class="charla/.test(e.cuerpo());
const vivo = e => e.ev('_hiloVivo ? _hiloVivo.estado().vivo : null');
const sinFotoReal = e => e.ev('prepararFotoChat = function () { return Promise.resolve({ grande: '
  + JSON.stringify(FOTO) + ', chica: ' + JSON.stringify(FOTO) + ' }); };');

/* ========================================================================== */
describe('1. «Chat», la palabra de Joan', () => {

  test('la pestaña de la barra y el título dicen «Chat», y siguen llamándose «mensajes» por dentro', async () => {
    const { e } = await enChat();
    assert.deepEqual(e.pestanias.map(p => p.texto), ['Hoy', 'Clientes', 'Registrados', 'Chat', 'Más']);
    assert.equal(e.titulo(), 'Chat');
    /* data-v no cambia: la pestaña guardada en el teléfono (joan_panel_espejo_ui)
       la nombra así, y un nombre nuevo abriría el Panel en Hoy una vez. */
    assert.deepEqual(e.encendida(), ['mensajes']);
  });
});

/* ========================================================================== */
describe('6a. Clientes · Equipo en la misma pestaña', () => {

  test('entrar pide las dos listas y pinta «Clientes (2) · Equipo (1)» con los nombres de los dos lados', async () => {
    const { e, N } = await enChat();
    /* Una al abrir la app (el número de la barra) y otra al entrar: las DOS
       listas, las mismas veces. En el CRM el equipo era «Toca ↻». */
    assert.ok(N.de('chat_conversaciones').length >= 1);
    assert.equal(N.de('equipo_chat_conversaciones').length, N.de('chat_conversaciones').length,
      'el equipo no se pidió solo: en el CRM eso era «Toca ↻»');
    const h = plano(e.cuerpo());
    assert.match(h, /Clientes \(2\) · Equipo \(1\)/);
    assert.match(h, /William Pérez \(registrado, sin verificar\) · 3001234567/);
    assert.match(h, /William Gerente/);
    assert.match(h, /Ana Asesora/, 'el que no ha escrito tiene que salir: es con quien se empieza');
    /* Honestidad: el aviso con la app cerrada no existe, y se dice. */
    assert.match(h, /Con la app cerrada no te llega ningún aviso/);
    assert.doesNotMatch(h, /te avis(o|amos)/i);
  });

  test('el número de la barra suma clientes y equipo, y dice de quién es cada parte', async () => {
    const { e } = await enChat();
    assert.equal(globo(e).hidden, false);
    assert.match(globo(e).innerHTML, />?3</, 'el globo contaba solo clientes');
    assert.match(globo(e).innerHTML, /sin leer/);
    assert.match(globo(e).title, /2 de clientes y 1 de tu equipo/);
  });

  test('la tarjeta con algo sin leer sale primera: solo el equipo tiene → el equipo arriba', async () => {
    const sinLeer = CONVS.map(c => Object.assign({}, c, { sin_leer: 0 }));
    const { e } = await enChat({ nube: { chat_conversaciones: sinLeer } });
    /* La tarjeta, no el botón del segmento (cuyo data-id contiene el mismo texto). */
    const tarjeta = (h, id) => h.indexOf('class="card ap" id="' + id + '"');
    const h = e.cuerpo();
    assert.ok(tarjeta(h, 'mTarjetaEquipo') >= 0 && tarjeta(h, 'mTarjetaEquipo') < tarjeta(h, 'mTarjetaClientes'),
      'el equipo con algo sin leer quedó debajo');
    const { e: e2 } = await enChat();
    const h2 = e2.cuerpo();
    assert.ok(tarjeta(h2, 'mTarjetaClientes') >= 0 && tarjeta(h2, 'mTarjetaClientes') < tarjeta(h2, 'mTarjetaEquipo'),
      'con los dos (o ninguno), los clientes arriba');
  });

  test('sin la migración del equipo (404): la tarjeta nombra el archivo, el segmento dice (?) y el número cuenta solo clientes', async () => {
    const { e } = await enChat({ nube: { equipo_chat_conversaciones: undefined } });
    const h = plano(e.cuerpo());
    assert.match(h, /base\/20260922r_el_chat_con_el_equipo\.sql/);
    assert.match(h, /Equipo \(\?\)/);
    assert.match(globo(e).innerHTML, />?2</);
  });

  test('la vuelta de 45 s pide las dos listas, y con la clave rechazada en cualquiera se detiene', async () => {
    const { e, N } = await enChat();
    const antes = [N.de('chat_conversaciones').length, N.de('equipo_chat_conversaciones').length];
    e.ev('_msj.ultimaVez = 0;');
    assert.equal(e.ev('latidoMensajes()'), true);
    await asentar();
    assert.equal(N.de('chat_conversaciones').length, antes[0] + 1);
    assert.equal(N.de('equipo_chat_conversaciones').length, antes[1] + 1, 'la vuelta del reloj no mira al equipo');
    const { e: e2, N: N2 } = await enChat({ nube: { equipo_chat_conversaciones: { status: 400, cuerpo: { message: 'clave incorrecta' } } } });
    assert.equal(e2.ev('_msj.parado'), 'clave');
    const pedidas = N2.de('chat_conversaciones').length;
    e2.ev('_msj.ultimaVez = 0;');
    assert.equal(e2.ev('latidoMensajes()'), false, 'siguió preguntando con la clave mala: cada vuelta arma el freno para todos');
    await asentar();
    assert.equal(N2.de('chat_conversaciones').length, pedidas);
    assert.match(globo(e2).innerHTML, /^\?/);
  });

  test('sin nadie en el equipo lo dice, sin inventar un botón para crearlos aquí', async () => {
    const { e } = await enChat({ nube: { equipo_chat_conversaciones: [] } });
    assert.match(plano(e.cuerpo()), /Todavía no tienes a nadie en el equipo/);
  });
});

/* ========================================================================== */
describe('6b. la conversación a pantalla completa, con ← y el gesto de atrás de Android', () => {

  test('abrir una conversación la pone a pantalla completa, con el nombre, el ←, y entra en el history', async () => {
    const { e, N } = await enChat();
    e.ev('abrirHilo("3001234567")'); await asentar();
    assert.ok(charla(e), 'la conversación sigue siendo una tarjeta con la barra debajo');
    assert.match(e.cuerpo(), /class="charla[^"]*"[^>]*role="dialog"/);
    assert.match(plano(e.cuerpo()), /William Pérez \(registrado, sin verificar\) · 3001234567/);
    assert.match(e.cuerpo(), /data-acc="chat-cerrar"[^>]*>\s*(&larr;|←)/);
    assert.equal(e.historia.estados.length, 1, 'sin pushState, «atrás» en Android cierra el Panel entero');
    assert.equal(N.de('chat_de')[0].cuerpo.p_cedula, '3001234567');
    assert.equal(N.de('chat_de')[0].cuerpo.p_desde, 0);
    assert.match(e.elems.mHilo.innerHTML, /hola/, 'el hilo no se pintó en su caja');
    assert.match(plano(e.cuerpo()), /Se actualiza sola cada 8 segundos/);
  });

  test('← vuelve a la lista, saca la conversación del history y para su reloj', async () => {
    const { e } = await enChat();
    e.ev('abrirHilo("3001234567")'); await asentar();
    assert.equal(vivo(e), true);
    e.tocar('chat-cerrar'); await asentar();
    assert.equal(charla(e), false);
    assert.equal(e.ev('_msj.ident'), null);
    assert.equal(e.historia.atras, 1, 'el ← no deshizo el pushState: el siguiente «atrás» de Android no haría nada');
    assert.equal(e.historia.estados.length, 0);
    assert.equal(vivo(e), null, 'el reloj del hilo siguió pidiendo (y marcando «Lo vio») con la conversación cerrada');
    /* Los 2 suyos quedaron vistos al abrirla: la lista dice «Clientes · Equipo (1)». */
    assert.match(plano(e.cuerpo()), /Clientes · Equipo \(1\)/, 'no volvió a la lista');
  });

  test('el gesto de atrás de Android (popstate) cierra la conversación sin volver a tocar el history', async () => {
    const { e } = await enChat();
    e.ev('abrirHilo("3001234567")'); await asentar();
    e.historia.back(); await asentar();        /* el gesto: el navegador saca el estado y avisa */
    assert.equal(charla(e), false, 'el gesto de atrás no cerró la conversación');
    assert.equal(e.ev('_msj.ident'), null);
    assert.equal(e.historia.atras, 1, 'la página llamó history.back() otra vez y se salió del Panel');
    assert.equal(vivo(e), null);
  });

  test('cambiar de pestaña con una conversación abierta la suelta: ni reloj ni estado colgado en el history', async () => {
    const { e } = await enChat();
    e.ev('abrirHilo("3001234567")'); await asentar();
    e.ev("ir('hoy')"); await asentar();
    assert.equal(e.ev('_msj.ident'), null);
    assert.equal(vivo(e), null);
    assert.equal(e.historia.estados.length, 0);
    assert.equal(charla(e), false);
  });
});

/* ========================================================================== */
describe('3. la conversación se mueve sola (app/chat-vivo.js)', () => {

  const NUBE_VIVA = { chat_de: c => Number(c.p_desde) >= 41
    ? [{ id: 52, de: 'socio', texto: 'RESPUESTA NUEVA', creado_en: '2026-10-26T14:05:00Z' }]
    : HILO };

  test('arma el reloj de 8 s al abrir, y cada vuelta pide SOLO lo nuevo y pinta SOLO la caja del hilo', async () => {
    const { e, N } = await enChat({ nube: NUBE_VIVA });
    e.ev('window.__relojes = []; setInterval = function (f, ms) { window.__relojes.push(ms); return 9; };');
    e.ev('abrirHilo("3001234567")'); await asentar();
    assert.ok(e.json('window.__relojes').indexOf(8000) >= 0, 'no hay reloj de 8 s');
    /* Lo que Joan está escribiendo, y la lámina entera, quedan como están. */
    e.escribir('mResp', 'a medio escribir');
    e.elems.cuerpo.innerHTML = 'MARCA: la lámina no se repinta';
    e.ev('latidoHilo()'); await asentar();
    const pedidas = N.de('chat_de');
    assert.equal(pedidas[pedidas.length - 1].cuerpo.p_desde, 41, 'la vuelta volvió a bajar el hilo entero');
    assert.match(e.elems.mHilo.innerHTML, /RESPUESTA NUEVA/);
    assert.match(e.elems.mHilo.innerHTML, /hola/, 'lo que ya se veía se borró');
    assert.equal(e.elems.cuerpo.innerHTML, 'MARCA: la lámina no se repinta', 'repintó la lámina (ya se perdió dos veces lo que Joan escribía)');
    assert.equal(e.elems.mResp.value, 'a medio escribir');
  });

  test('lo que llega del cliente mientras Joan mira descuenta el número de la barra sin otra pregunta', async () => {
    const { e, N } = await enChat({ nube: NUBE_VIVA });
    assert.match(globo(e).innerHTML, />?3</);
    e.ev('abrirHilo("3001234567")'); await asentar();
    /* Abrirla marca vistos los 2 suyos en la base: queda el del equipo. */
    assert.match(globo(e).innerHTML, />?1</, 'el número de la barra no bajó al abrir la conversación');
    const antes = N.de('chat_conversaciones').length;
    e.ev('latidoHilo()'); await asentar();
    assert.match(globo(e).innerHTML, />?1</);
    assert.equal(N.de('chat_conversaciones').length, antes, 'volvió a pedir la lista para saber lo que ya sabe');
  });

  test('escondida NO pide: lo que se pide queda «Lo vio» sin que nadie lo vea', async () => {
    const { e, N } = await enChat({ nube: NUBE_VIVA });
    e.ev('abrirHilo("3001234567")'); await asentar();
    const antes = N.de('chat_de').length;
    e.ev('document.hidden = true; latidoHilo();'); await asentar();
    assert.equal(N.de('chat_de').length, antes, 'pidió el hilo con la app escondida');
    e.ev('document.hidden = false; latidoHilo();'); await asentar();
    assert.equal(N.de('chat_de').length, antes + 1);
  });

  test('sin app/chat-vivo.js (una copia vieja en la caché) abre una vez y lo dice, sin prometer que se mueve', async () => {
    const { e, N } = await enChat({ sin: ['../app/chat-vivo.js'] });
    e.ev('abrirHilo("3001234567")'); await asentar();
    assert.ok(charla(e));
    assert.match(e.elems.mHilo.innerHTML, /hola/);
    assert.equal(N.de('chat_de').length, 1);
    assert.doesNotMatch(plano(e.cuerpo()), /Se actualiza sola/);
    assert.match(plano(e.cuerpo()), /cierra y vuelve a abrir/);
  });
});

/* ========================================================================== */
describe('3b. enviar: si falla, el texto sigue en el cuadro y se dice al lado, no en un alert', () => {

  test('la nube se cae: el texto se queda, #mErr lo dice, ningún alert', async () => {
    const { e } = await enChat({ nube: { chat_responder: { status: 500, cuerpo: { message: 'caída' } } } });
    e.ev('abrirHilo("3001234567")'); await asentar();
    e.escribir('mResp', 'hola Bruno');
    e.ev('responderHilo()'); await asentar();
    assert.equal(e.elems.mResp.value, 'hola Bruno', 'se le borró lo que escribió');
    assert.match(e.elems.mErr.textContent, /El texto sigue en el cuadro/);
    assert.equal(e.elems.mErr.hidden, false);
    assert.deepEqual(e.avisos, [], 'salió un alert');
  });

  test('la base contesta null: lo mismo', async () => {
    const { e } = await enChat({ nube: { chat_responder: null } });
    e.ev('abrirHilo("3001234567")'); await asentar();
    e.escribir('mResp', 'hola Bruno');
    e.ev('responderHilo()'); await asentar();
    assert.equal(e.elems.mResp.value, 'hola Bruno');
    assert.match(e.elems.mErr.textContent, /No se pudo mandar/);
    assert.deepEqual(e.avisos, []);
  });

  test('si llegó, el cuadro queda vacío y se pide lo nuevo (no se pinta a mano)', async () => {
    const { e, N } = await enChat({ nube: { chat_responder: 77 } });
    e.ev('abrirHilo("3001234567")'); await asentar();
    const antes = N.de('chat_de').length;
    e.escribir('mResp', 'hola Bruno');
    e.ev('responderHilo()'); await asentar();
    assert.equal(N.de('chat_responder')[0].cuerpo.p_texto, 'hola Bruno');
    assert.equal(e.elems.mResp.value, '');
    assert.equal(e.ev('_msj.borrador'), '');
    assert.equal(e.elems.mErr.hidden, true);
    assert.equal(N.de('chat_de').length, antes + 1, 'no volvió a pedir el hilo después de mandar');
  });
});

/* ========================================================================== */
describe('6c. el hilo del equipo: texto y foto, con el mismo pintor', () => {

  test('se abre con equipo_chat_de, pinta texto y foto, dice quién lo lee, y no ofrece WhatsApp', async () => {
    const { e, N } = await enChat();
    e.ev('abrirHiloEquipo("3105550001")'); await asentar();
    assert.ok(charla(e));
    assert.equal(N.de('equipo_chat_de')[0].cuerpo.p_celular, '3105550001');
    assert.equal(N.de('equipo_chat_de')[0].cuerpo.p_desde, 0);
    assert.match(plano(e.cuerpo()), /William Gerente/);
    assert.match(plano(e.cuerpo()), /Esto lo lee solo William Gerente\. Sus compañeros no lo ven\./);
    assert.match(e.elems.mHilo.innerHTML, /jefe, ya cobré/);
    assert.match(e.elems.mHilo.innerHTML, /class="ch-foto"[^>]*onclick="verFotoEquipo\(5\)"/, 'la foto del equipo no se pinta, o se abre con el visor de los clientes');
    assert.doesNotMatch(e.cuerpo(), /wa\.me/);
    assert.equal(e.historia.estados.length, 1);
    assert.equal(vivo(e), true);
    /* Lo suyo quedó visto al abrir: el número de la barra solo cuenta a los clientes. */
    assert.match(globo(e).innerHTML, />?2</);
  });

  test('escribir va por equipo_chat_responder; un «no» de la base deja el texto y dice el motivo', async () => {
    const { e, N } = await enChat({ nube: { equipo_chat_responder: { ok: false, motivo: 'Ya mandaste 30 en 15 minutos.' } } });
    e.ev('abrirHiloEquipo("3105550001")'); await asentar();
    e.escribir('mResp', 'William, pásame el recibo');
    e.ev('responderHilo()'); await asentar();
    assert.equal(N.de('equipo_chat_responder')[0].cuerpo.p_celular, '3105550001');
    assert.equal(N.de('equipo_chat_responder')[0].cuerpo.p_texto, 'William, pásame el recibo');
    assert.equal(e.elems.mResp.value, 'William, pásame el recibo');
    assert.match(e.elems.mErr.textContent, /Ya mandaste 30 en 15 minutos/);
    assert.equal(N.de('chat_responder').length, 0, 'le escribió al equipo por la función de los clientes');
  });

  test('un «sí» de la base vacía el cuadro y pide lo nuevo', async () => {
    const { e, N } = await enChat({ nube: { equipo_chat_responder: { ok: true } } });
    e.ev('abrirHiloEquipo("3105550001")'); await asentar();
    const antes = N.de('equipo_chat_de').length;
    e.escribir('mResp', 'listo');
    e.ev('responderHilo()'); await asentar();
    assert.equal(e.elems.mResp.value, '');
    assert.equal(N.de('equipo_chat_de').length, antes + 1);
  });

  test('la foto al equipo va por equipo_foto_responder con su miniatura, y se dice que llegó', async () => {
    const { e, N } = await enChat({ nube: { equipo_foto_responder: { ok: true } } });
    e.ev('abrirHiloEquipo("3105550001")'); await asentar();
    sinFotoReal(e);
    e.ev('mandarFotoCliente({ files: [{ type: "image/jpeg" }], value: "x" })'); await asentar();
    const f = N.de('equipo_foto_responder');
    assert.equal(f.length, 1, 'la foto no fue por la función del equipo');
    assert.equal(f[0].cuerpo.p_celular, '3105550001');
    assert.equal(f[0].cuerpo.p_imagen, FOTO);
    assert.equal(f[0].cuerpo.p_miniatura, FOTO);
    assert.equal(N.de('chat_foto_responder').length, 0);
    assert.match(e.elems.mFotoEstado.textContent, /Mandada/);
  });

  test('ver la foto grande del equipo pide equipo_foto_panel y la enseña como propiedad, no como atributo', async () => {
    const { e, N } = await enChat({ nube: { equipo_foto_panel: { ok: true, imagen: FOTO } } });
    e.ev('abrirHiloEquipo("3105550001")'); await asentar();
    e.ev('verFotoEquipo(5)'); await asentar();
    assert.equal(N.de('equipo_foto_panel')[0].cuerpo.p_id, 5);
    assert.ok(Object.values(e.elems).some(x => x.src === FOTO), 'la foto no se asignó a ninguna imagen');
    assert.deepEqual(e.avisos, []);
  });
});

/* ========================================================================== */
describe('la foto al cliente desde el celular (defecto viejo): después de mandarla no dice que falló', () => {

  test('mandada → «Mandada», y el hilo vuelve a pedirse; antes llamaba a traerHilo(), que no existía', async () => {
    const { e, N } = await enChat({ nube: { chat_foto_responder: { ok: true } } });
    e.ev('abrirHilo("3001234567")'); await asentar();
    const antes = N.de('chat_de').length;
    sinFotoReal(e);
    e.ev('mandarFotoCliente({ files: [{ type: "image/jpeg" }], value: "x" })'); await asentar();
    assert.equal(N.de('chat_foto_responder')[0].cuerpo.p_cedula, '3001234567');
    assert.match(e.elems.mFotoEstado.textContent, /Mandada/);
    assert.doesNotMatch(e.elems.mFotoEstado.textContent, /No pude/);
    assert.equal(N.de('chat_de').length, antes + 1);
  });
});

/* ========================================================================== */
describe('6d. «💬 Escribirle por la app» desde la ficha del celular', () => {

  test('la ficha tiene el botón, dice que no le llega aviso, y el WhatsApp ya no se llama «el chat»', async () => {
    const { e } = celular({ cartera: cartera() });
    await asentar();
    e.tocar('verficha', { id: 's-bru' });
    const h = e.cuerpo();
    assert.match(h, /data-acc="chat-ficha" data-id="s-bru"[^>]*>💬 Escribirle por la app/);
    assert.match(plano(h), /No le llega aviso al celular: lo ve cuando abra la app, en Chat\./);
    assert.doesNotMatch(plano(h), /Abrir el chat/, 'con la pestaña «Chat», el enlace de WhatsApp no puede llamarse «el chat»');
    assert.match(plano(h), /Abrir WhatsApp/);
  });

  test('tocarlo abre la conversación en el hilo DE LA FICHA (su llave en la nube), encima de la ficha, y ← vuelve a la ficha', async () => {
    const { e, N } = celular({ cartera: cartera() });
    await asentar();
    e.tocar('verficha', { id: 's-bru' });
    e.tocar('chat-ficha', { id: 's-bru' }); await asentar();
    assert.ok(charla(e));
    assert.equal(N.de('chat_de')[0].cuerpo.p_cedula, '52111222', 'no es la llave de la ficha en la nube (llaveEnLaNube)');
    assert.match(plano(e.cuerpo()), /Bruno Ficha/);
    assert.match(plano(e.cuerpo()), /lo lee cuando su cuenta de la app esté junta con ella/,
      'la ficha sin cuenta junta no dice que el mensaje espera a que se junte');
    assert.equal(e.ev('VISTA'), 'ficha');
    e.tocar('chat-cerrar'); await asentar();
    assert.equal(charla(e), false);
    assert.equal(e.ev('VISTA'), 'ficha');
    assert.match(plano(e.cuerpo()), /Bruno Ficha/);
    /* Con la cuenta junta no se dice lo de juntar, y la llave es el celular. */
    e.tocar('verficha', { id: 's-sin' });
    e.tocar('chat-ficha', { id: 's-sin' }); await asentar();
    assert.equal(N.de('chat_de')[1].cuerpo.p_cedula, '3001112222');
    assert.doesNotMatch(plano(e.cuerpo()), /esté junta con ella/);
  });

  test('sin la conexión y la clave no se abre nada, y se dice por qué', async () => {
    const { e } = celular({ cartera: cartera(), conectado: false });
    await asentar();
    e.tocar('verficha', { id: 's-bru' });
    e.tocar('chat-ficha', { id: 's-bru' }); await asentar();
    assert.equal(charla(e), false);
    assert.equal(e.avisos.length, 1);
    assert.match(e.avisos[0], /clave de sincronización/);
  });
});
