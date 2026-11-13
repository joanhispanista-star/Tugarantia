'use strict';
/* La hora de Colombia antes de todo, como en chat-1-crm: la página lee día y
   hora locales, y la propuesta «a 30 días» tiene que caer el mismo día en un
   runner en UTC que en este Windows. */
process.env.TZ = 'America/Bogota';
/* ============================================================================
 * ESCRIBIRLE DESDE 📨 SOLICITUDES — 13 de noviembre de 2026 (v145)
 *
 *   node --test pruebas/escribirle-desde-solicitudes.test.js
 *
 * Joan: «quiero que desde la pestaña de solicitudes yo le pueda escribir al
 * cliente y no tenga que recurrir a WhatsApp».
 *
 * Con el CRM de verdad corriendo (banco-panel.js) y una nube de mentira que
 * anota cada llamada, se prueba:
 *   1. «💬 Escribirle» en cada tipo de fila (los cinco grupos, play/, PlataChat,
 *      sin juntar, junta, pegada con ficha), antes de los demás botones; la
 *      pegada sin cuenta dice «Sin chat» y deja WhatsApp; nada en modo #equipo.
 *   2. Abre la conversación de QUIEN PIDIÓ, la que dice la base (la llave de
 *      la solicitud): sin juntar, '0' + celular y nunca la ficha dueña del
 *      número; junta, la de su ficha; PlataChat, la suya con su nota. Encima
 *      de la pestaña, sin irse a 💬 Chat. Y en «Créditos nuevos», salvo que
 *      haya algo sin leer en otra.
 *   3. Después de «Mandarle esta propuesta», «💬 Avisarle por el chat» deja
 *      el mensaje ESCRITO, en pesos y sin %, y no sale nada hasta «Enviar».
 *   4. Lo que el cliente escribió y Joan no ha leído sale en su fila, del hilo
 *      de esa persona y no del de otra; y se repinta solo con la vuelta del chat.
 *   5. El mismo botón en «Lo que pidió» de la ficha y en el 🔔 del Tablero.
 *
 * chat.js habla con el fetch de NODE (se carga con require, fuera del banco):
 * cada prueba lo tapa con la misma nube y lo devuelve al terminar.
 * Todos los nombres, celulares y cédulas son inventados.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const AHORA = '2026-11-13T10:00:00-05:00';
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* Las fichas: Marta tiene su cuenta junta desde este computador; la dueña del
   3100000022 no (alguien abrió una cuenta con su número); Pego llegó pegado. */
const MARTA = { id: 'F1', nombre: 'Marta Inventada', cedula: '1000000011', telefono: '3100000011', whatsappIgual: true,
  cuentaJunta: { celular: '3100000011', registro_id: 11 } };
const DUENA = { id: 'F2', nombre: 'Duena Inventada', cedula: '1000000022', telefono: '3100000022', whatsappIgual: true };
const PEGO = { id: 'F3', nombre: 'Pego Inventado', cedula: '1000000033', telefono: '3100000033', whatsappIgual: true,
  cuentaJunta: { celular: '3100000033' } };

const sol = (id, extra) => Object.assign({ id, origen: 'nube', estado: 'nueva', app: 'tugarantia', capital: 300000,
  pedido_monto: 300000, producto: 'quincenal', registro_id: null, pedido: { origen: 'play', fecha_pago: '2026-11-28', dias: 15 },
  fecha_corte: '2026-11-28', creada_en: '2026-11-13T14:55:00Z' }, extra || {});
const CP = (fecha, extra) => Object.assign({ por: 'joan', capital: 300000, total: 360000, costo_pct: 20, dias: 15,
  fecha_pago: fecha, creada_en: '2026-11-12T15:00:00Z' }, extra || {});

const NUEVO = sol(501, { nombre: 'Nuevo Inventado', cedula: '3200000501', celular: '3200000501' });
const SIN_JUNTAR = sol(502, { nombre: 'Quien Dice Ser', cedula: '3100000022', celular: '3100000022', cuenta_sin_juntar: true });
const PLATA = sol(503, { app: 'platachat', nombre: 'Plata Inventada', cedula: '3200000503', celular: '3200000503', tasa: 0.2,
  pedido: { cortes: 1, automatica: 'nuevo' } });
/* Desde app/socio.html (solicitar_por_sesion): sin celular, con la llave de su ficha. */
const DE_SOCIO = sol(504, { nombre: 'Marta Inventada', cedula: '1000000011', celular: null, pedido: null });
/* Desde play/ con la cuenta ya junta: la base la deja con su celular. */
const JUNTA_PLAY = sol(505, { nombre: 'Marta Inventada', cedula: '3100000011', celular: '3100000011' });
const ESPERANDO = sol(506, { nombre: 'Espera Inventada', cedula: '3200000506', celular: '3200000506', estado: 'contrapropuesta', contrapropuesta: CP('2026-11-28') });
const ACEPTO = sol(507, { nombre: 'Acepto Inventado', cedula: '3200000507', celular: '3200000507', estado: 'aceptada',
  contrapropuesta: CP('2026-11-28', { condiciones: { version: 'prueba', lineas: [] } }) });
const VENCIDA = sol(508, { nombre: 'Vencida Inventada', cedula: '3200000508', celular: '3200000508', estado: 'contrapropuesta', contrapropuesta: CP('2026-11-10') });
const PEGADA_FICHA = { origen: 'pegada', id: 'peg-1', nombre: 'Pego Inventado', cedula: '1000000033', capital: 200000, producto: 'quincenal', creada_en: '2026-11-13' };
const PEGADA_SOLA = { origen: 'pegada', id: 'peg-2', nombre: 'Sin Cuenta Inventado', cedula: '1099999999', capital: 200000, producto: 'quincenal', creada_en: '2026-11-13' };
const PEGADA_CEL = { origen: 'pegada', id: 'peg-3', nombre: 'Sin Cuenta Con Cel', cedula: '3209999999', capital: 200000, producto: 'quincenal', creada_en: '2026-11-13' };
const TODAS = [NUEVO, SIN_JUNTAR, PLATA, DE_SOCIO, JUNTA_PLAY, ESPERANDO, ACEPTO, VENCIDA, PEGADA_FICHA, PEGADA_SOLA, PEGADA_CEL];

/* Lo que contesta llave_de_sesion por celular, como la base: la ficha si la
   cuenta está junta, '0' + celular si el número es de una ficha sin juntar. */
const HILOS = { '3100000022': '03100000022', '3100000011': '1000000011' };

function nube(o) {
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    const r = o[fn];
    if (r !== undefined) return Promise.resolve(resp(200, typeof r === 'function' ? r(cuerpo) : r));
    if (/^listar_/.test(fn || '')) return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas, de: fn => vistas.filter(v => v.fn === fn) };
}
function montar(o) {
  o = o || {};
  const N = nube(Object.assign({
    chat_hilo_de_celular: c => ({ ok: true, hilo: (o.hilos || HILOS)[String(c.p_celular)] || String(c.p_celular) }),
    chat_de: [], chat_conversaciones: o.convs || [], chat_responder: 9001,
    /* La vuelta de traerSolicitudes trae de nuevo las de la nube, como la de verdad. */
    listar_solicitudes_abiertas: (o.solicitudes || TODAS).filter(s => s.origen === 'nube'),
    contrapropuesta_solicitud: { ok: true }, contrapropuesta_quincenal_a_cuotas: { ok: true }, contrapropuesta_a_cuotas: { ok: true }
  }, o.nube || {}));
  const P = abrirPanel({ red: N.red, ahora: AHORA });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera({ socios: o.socios || [MARTA, DUENA, PEGO], prestamos: [], config: { negocio: 'Tu Garantía' }, equipo: [] });
  if (o.convs) P.ev('_convs = ' + JSON.stringify(o.convs) + "; _convsEstado = 'ok'");
  P.ev('_solicitudes = ' + JSON.stringify(o.solicitudes || TODAS) + "; _solEstado = 'ok'; _solHora = '10:00'; renderBandeja()");
  const avisos = [];
  P.ctx.alert = m => avisos.push(String(m));
  const real = globalThis.fetch;
  globalThis.fetch = (u, c) => N.red(String(u), c);
  return { P, N, avisos, cerrar: () => { globalThis.fetch = real; } };
}
/* Cada prueba con su nube, y el fetch de Node devuelto pase lo que pase. */
const con = (o, fn) => async () => { const M = montar(o); try { await fn(M); } finally { M.cerrar(); } };
const bandeja = P => P.elems.bandeja.innerHTML;
const filaDe = (P, id) => {
  const h = bandeja(P);
  const fin = h.indexOf("descartarSolicitud('" + id + "')");
  assert.ok(fin > 0, 'no salió la fila de ' + id);
  return h.slice(h.lastIndexOf('<tr>', fin), h.indexOf('</tr>', fin));
};
const boton = id => "escribirleDesdeSolicitud('" + id + "')";
/* El banco crea cada elemento la primera vez que la página lo pide: sin cuadro abierto, no existe. */
const cuadro = P => (P.elems.mBody || {}).innerHTML || '';
const titulo = P => String((P.elems.mTitle || {}).textContent || '');
/* Toca el botón de la fila y deja que la nube conteste. */
async function tocar(P, id) { P.ev(boton(id)); await asentar(); }

/* ======================================================================== */
describe('1. «💬 Escribirle» en cada fila de 📨 Solicitudes', () => {

  test('cada tipo de fila lo trae, con el id de su solicitud, antes de los otros botones', con({}, ({ P }) => {
    /* Los cinco grupos están en la bandeja, para que «cada tipo» sea de verdad. */
    const grupos = TODAS.map(s => P.ev('grupoDeSolicitud(_solicitudes.find(x => String(x.id) === ' + JSON.stringify(String(s.id)) + '))'));
    ['nuevas', 'vencidas', 'aceptaron', 'esperando', 'pegadas'].forEach(g => assert.ok(grupos.includes(g), 'falta una fila del grupo ' + g));
    [501, 502, 503, 504, 505, 506, 507, 508, 'peg-1'].forEach(id => {
      const f = filaDe(P, id);
      assert.ok(f.indexOf(boton(id)) > 0, 'la fila ' + id + ' no trae «💬 Escribirle»: ' + plano(f));
      assert.match(f, /💬 Escribirle/);
      assert.ok(f.indexOf(boton(id)) < f.indexOf('verAparatosDeSolicitud'), 'en la fila ' + id + ' «💬 Escribirle» no va antes de 📱');
      const ficha = f.indexOf('👤 Su ficha');
      if (ficha > 0) assert.ok(f.indexOf(boton(id)) < ficha, 'en la fila ' + id + ' «💬 Escribirle» va después de «👤 Su ficha»');
    });
  }));

  test('la pegada sin cuenta dice «Sin chat» y deja WhatsApp; sin celular, dice dónde buscarlo', con({}, ({ P }) => {
    const conCel = filaDe(P, 'peg-3'), sinCel = filaDe(P, 'peg-2');
    [conCel, sinCel].forEach(f => {
      assert.doesNotMatch(f, /escribirleDesdeSolicitud/, 'ofrece un chat que no existe: ' + plano(f));
      assert.match(plano(f), /💬 Sin chat: llegó pegada de un WhatsApp, no por la app\./);
    });
    assert.match(conCel, /href="https:\/\/wa\.me\/573209999999\?text=Hola"[^>]*>📲 Escribirle por WhatsApp<\/a>/);
    assert.doesNotMatch(sinCel, /wa\.me/, 'sin celular no hay WhatsApp que abrir');
    assert.match(plano(sinCel), /Búscalo en el WhatsApp donde te llegó/);
  }));

  test('en modo #equipo no sale: la bandeja es de Joan', con({}, ({ P }) => {
    P.ev('CARTERA_EQUIPO = { yo: { celular: "3000000000" } }');
    assert.equal(P.ev('botonEscribirleSolicitud(_solicitudes[0])'), '');
  }));
});

/* ======================================================================== */
describe('2. abre la conversación de quien pidió, encima de la pestaña', () => {

  test('registrado de play/: le pregunta a la nube por SU celular y abre ese hilo, sin salir de 📨 Solicitudes', con({}, async ({ P, N }) => {
    P.ev("irA('solicitudes'); var _irAs = []; var _irAReal = irA; irA = function (v) { _irAs.push(v); return _irAReal(v); };");
    await tocar(P, 501);
    assert.deepEqual(N.de('chat_hilo_de_celular').map(v => v.cuerpo), [{ p_clave: CLAVE, p_celular: '3200000501' }]);
    assert.equal(N.de('chat_de')[0].cuerpo.p_cedula, '3200000501');
    assert.equal(P.ev('_chatAbierta'), '3200000501');
    assert.equal(P.ev('_vistaCRM'), 'solicitudes', 'se fue de la pestaña');
    assert.equal(P.ev('_irAs.length'), 0, 'cambió de pestaña para abrir el chat: ' + P.ev('_irAs.join()'));
    const h = cuadro(P);
    assert.match(h, /id="chHilo"/, 'no trae el historial');
    assert.match(h, /<textarea id="chResp"/, 'no trae el cuadro para escribir');
    assert.match(h, /onclick="responderChat\(\)"/, 'no se puede mandar desde ahí');
    assert.match(titulo(P), /Nuevo Inventado \(registrado, sin verificar\)/);
    assert.match(plano(h), /No le llega aviso al celular: lo ve cuando abra la app, en Chat\./);
  }));

  test('cuenta sin juntar: el hilo aparte (\'0\' + celular), nunca el de la ficha dueña del número, y sin el nombre que escribió', con({}, async ({ P, N }) => {
    await tocar(P, 502);
    assert.equal(N.de('chat_hilo_de_celular')[0].cuerpo.p_celular, '3100000022');
    const pedidos = N.de('chat_de').map(v => v.cuerpo.p_cedula);
    assert.deepEqual([...new Set(pedidos)], ['03100000022']);
    assert.ok(!pedidos.includes('1000000022'), 'abrió el hilo de la ficha de otra persona');
    assert.doesNotMatch(titulo(P), /Quien Dice Ser/, 'el título le pone el nombre de quien no está verificado');
    assert.match(titulo(P), /sin juntar/);
  }));

  test('junta: desde socio.html (sin celular) abre la llave de su ficha sin preguntar; desde play/, la que diga la nube', con({}, async ({ P, N }) => {
    await tocar(P, 504);
    assert.equal(N.de('chat_hilo_de_celular').length, 0, 'preguntó por un celular que la solicitud no trae');
    assert.equal(P.ev('_chatAbierta'), '1000000011');
    assert.equal(titulo(P), 'Marta Inventada');
    P.ev('cerrarModal()');
    await tocar(P, 505);
    assert.equal(N.de('chat_hilo_de_celular')[0].cuerpo.p_celular, '3100000011');
    assert.equal(P.ev('_chatAbierta'), '1000000011', 'no abrió el hilo de su ficha, que es el que lee su cuenta junta');
    assert.equal(titulo(P), 'Marta Inventada');
  }));

  test('PlataChat: el hilo que dice la nube, con la nota de PlataChat («en Chats»)', con({}, async ({ P, N }) => {
    await tocar(P, 503);
    assert.equal(N.de('chat_hilo_de_celular')[0].cuerpo.p_celular, '3200000503');
    assert.equal(P.ev('_chatAbierta'), '3200000503');
    assert.match(plano(cuadro(P)), /No le llega aviso al celular: lo ve cuando abra PlataChat, en Chats\./);
  }));

  test('pegada con ficha: el hilo de su ficha, como «💬 Escribirle por la app» de la ficha', con({}, async ({ P, N }) => {
    await tocar(P, 'peg-1');
    assert.equal(N.de('chat_hilo_de_celular').length, 0);
    assert.equal(P.ev('_chatAbierta'), '1000000033');
    assert.equal(titulo(P), 'Pego Inventado');
  }));

  test('pegada sin cuenta: lo dice y no abre nada ni le pregunta nada a la nube', con({}, async ({ P, N, avisos }) => {
    const antes = N.vistas.length;
    await tocar(P, 'peg-2');
    assert.equal(N.vistas.length, antes, 'le preguntó a la nube por un chat que no existe');
    assert.equal(P.ev('_chatAbierta'), null);
    assert.doesNotMatch(cuadro(P), /chResp/);
    assert.match(avisos.join('\n'), /llegó pegada de un WhatsApp: no pasó por la app.*Escríbele por WhatsApp/);
  }));

  test('abre en «Créditos nuevos»; con algo sin leer en otra pestaña, abre esa', async () => {
    const A = montar();
    try {
      await tocar(A.P, 501);
      assert.equal(A.P.ev('_chatCanal'), 'creditos');
      assert.equal(A.N.de('chat_de')[0].cuerpo.p_canal, 'creditos');
    } finally { A.cerrar(); }
    const B = montar({ convs: [{ cedula: '3200000501', nombre: '', celular: '', sin_leer: 1, ultimo: 'hola', ultimo_de: 'socio',
      ultimo_en: '2026-11-13T14:00:00Z', ultimo_canal: 'servicio', sin_leer_canal: { servicio: 1 } }] });
    try {
      await tocar(B.P, 501);
      assert.equal(B.P.ev('_chatCanal'), 'servicio', 'escondió lo que el cliente escribió en Servicio');
    } finally { B.cerrar(); }
  });
});

/* ======================================================================== */
describe('3. «💬 Avisarle por el chat», después de mandar la propuesta', () => {
  const poner = (P, id, v) => P.ev("document.getElementById('" + id + "').value=" + JSON.stringify(String(v)));

  test('un solo pago: lo ofrece en el mismo paso, deja escrito el mensaje en pesos y sin %, y no sale nada hasta «Enviar»', con({}, async ({ P, N }) => {
    P.ev("editarContrapropuesta('501','unico')");
    poner(P, 'cpCap', 800000); poner(P, 'cpPct', 20); poner(P, 'cpDias', 30); poner(P, 'cpTexto', '');
    P.ev("guardarContrapropuesta('501')");
    await asentar();
    assert.equal(N.de('contrapropuesta_solicitud').length, 1);
    assert.equal(titulo(P), '✓ Propuesta enviada');
    assert.match(cuadro(P), /onclick="avisarPropuestaPorElChat\(\)">💬 Avisarle por el chat<\/button>/);
    assert.match(plano(cuadro(P)), /No sale nada solo/);
    assert.equal(N.de('chat_responder').length, 0, 'mandó algo sin que Joan lo tocara');

    P.ev('avisarPropuestaPorElChat()');
    await asentar();
    assert.equal(P.ev('_chatAbierta'), '3200000501');
    const texto = P.elems.chResp.value;
    assert.match(texto, /^Hola Nuevo, ya te enviamos la propuesta de tu crédito: recibes \$800\.000 y devuelves \$960\.000 el /);
    assert.match(texto, /Ábrela en la app para leer las condiciones y aceptarla/);
    assert.doesNotMatch(texto, /%/, 'el cliente nunca ve porcentajes');
    assert.equal(N.de('chat_responder').length, 0, 'el mensaje escrito se mandó solo');

    P.ev('responderChat()');
    await asentar();
    const env = N.de('chat_responder');
    assert.equal(env.length, 1);
    assert.deepEqual(env[0].cuerpo, { p_clave: CLAVE, p_cedula: '3200000501', p_texto: texto, p_canal: 'creditos' });
  }));

  test('a cuotas: cada cuota en pesos y con su fecha, sin %', con({}, async ({ P, N }) => {
    P.ev("editarContrapropuesta('501','quincenal')");
    poner(P, 'pqCap', 2000000); poner(P, 'pqN', 3);
    P.ev('filasQuincenalACuotas()');
    [['2026-11-30', 20], ['2026-12-15', 15], ['2027-01-15', 10]].forEach(([f, p], i) => {
      poner(P, 'pqF' + (i + 1), f); poner(P, 'pqP' + (i + 1), p); poner(P, 'pqK' + (i + 1), '');
    });
    P.ev('_pq.tocadas=true; previsualizarQuincenalACuotas()');
    P.ev("guardarQuincenalACuotas('501')");
    await asentar();
    const mandado = N.de('contrapropuesta_quincenal_a_cuotas');
    assert.equal(mandado.length, 1, 'no mandó la propuesta a cuotas');
    const c = mandado[0].cuerpo.p_cuerpo;
    P.ev('avisarPropuestaPorElChat()');
    await asentar();
    const texto = P.elems.chResp.value;
    assert.match(texto, /lo pagas en 3 cuotas: /);
    c.cuotas.forEach(q => assert.ok(texto.indexOf('$' + q.total.toLocaleString('es-CO') + ' el ' + P.ev('fmtFecha(' + JSON.stringify(q.fecha) + ')')) >= 0,
      'falta la cuota ' + q.numero + ': ' + texto));
    assert.ok(texto.indexOf('En total devuelves $' + c.total.toLocaleString('es-CO')) >= 0, texto);
    assert.doesNotMatch(texto, /%/);
    assert.equal(N.de('chat_responder').length, 0);
  }));

  test('con garantía (mensual): también lo ofrece, con cada cuota en pesos y sin %', con({}, async ({ P, N }) => {
    P.ev('entradaRespaldoDe = function () { return { datos: {}, referidos: 0, acumulada: 3000000, ajuste: 0, comprometida: 0 }; };');
    P.ev("editarContrapropuesta('501','cuotas')");
    poner(P, 'cqCap', 2000000); poner(P, 'cqMeses', 6);
    P.ev("guardarContrapropuestaCuotas('501')");
    await asentar();
    const mandado = N.de('contrapropuesta_a_cuotas');
    assert.equal(mandado.length, 1, 'no mandó la propuesta con garantía');
    assert.equal(titulo(P), '✓ Propuesta enviada');
    P.ev('avisarPropuestaPorElChat()');
    await asentar();
    const texto = P.elems.chResp.value, c = mandado[0].cuerpo.p_cuerpo;
    assert.match(texto, /lo pagas en 6 cuotas: /);
    c.cuotas.forEach(q => assert.ok(texto.indexOf('$' + q.total.toLocaleString('es-CO') + ' el ' + P.ev('fmtFecha(' + JSON.stringify(q.fecha) + ')')) >= 0,
      'falta la cuota ' + q.numero + ': ' + texto));
    assert.doesNotMatch(texto, /%/);
    assert.equal(N.de('chat_responder').length, 0);
  }));

  test('sin juntar: el saludo no lleva nombre (no sabemos si es la persona)', con({}, async ({ P }) => {
    P.ev("editarContrapropuesta('502','unico')");
    poner(P, 'cpCap', 300000); poner(P, 'cpPct', 20); poner(P, 'cpDias', 15);
    P.ev("guardarContrapropuesta('502')");
    await asentar();
    P.ev('avisarPropuestaPorElChat()');
    await asentar();
    assert.equal(P.ev('_chatAbierta'), '03100000022');
    assert.match(P.elems.chResp.value, /^Hola, ya te enviamos la propuesta/);
    assert.doesNotMatch(P.elems.chResp.value, /Quien|Dice|Duena/);
  }));

  test('si su app no la muestra (pidió desde socio.html), no lo manda a buscarla allá', con({}, async ({ P }) => {
    P.ev("editarContrapropuesta('504','unico')");
    poner(P, 'cpCap', 300000); poner(P, 'cpPct', 20); poner(P, 'cpDias', 15);
    P.ev("guardarContrapropuesta('504')");
    await asentar();
    assert.match(plano(cuadro(P)), /no la va a ver en su app/);
    assert.match(plano(cuadro(P)), /Confírmale las condiciones por el chat/);
    P.ev('avisarPropuestaPorElChat()');
    await asentar();
    const texto = P.elems.chResp.value;
    assert.match(texto, /^Hola Marta, te escribimos con la propuesta de tu crédito: recibes \$300\.000/);
    assert.match(texto, /Respóndenos por aquí/);
    assert.doesNotMatch(texto, /Ábrela/);
  }));

  test('si la nube no aceptó la propuesta, no se ofrece avisar', con({ nube: { contrapropuesta_solicitud: { ok: false, motivo: 'ya_aceptada' } } }, async ({ P, avisos }) => {
    P.ev("editarContrapropuesta('501','unico')");
    poner(P, 'cpCap', 300000); poner(P, 'cpPct', 20); poner(P, 'cpDias', 15);
    P.ev("guardarContrapropuesta('501')");
    await asentar();
    assert.notEqual(titulo(P), '✓ Propuesta enviada');
    assert.doesNotMatch(cuadro(P), /avisarPropuestaPorElChat/);
    assert.match(avisos.join('\n'), /La nube no aceptó la propuesta/);
  }));
});

/* ======================================================================== */
describe('4. lo que escribió y no has leído, en su fila', () => {
  const conv = (cedula, n) => ({ cedula, nombre: '', celular: '', sin_leer: n, ultimo: 'hola', ultimo_de: 'socio',
    ultimo_en: '2026-11-13T14:00:00Z', ultimo_canal: 'creditos', sin_leer_canal: { creditos: n } });

  test('cada fila cuenta el hilo de SU persona: el sin juntar no hereda lo de la ficha dueña del número', con({
    convs: [conv('03100000022', 2), conv('1000000022', 5), conv('3200000501', 1), conv('1000000011', 3)]
  }, ({ P }) => {
    assert.match(plano(filaDe(P, 502)), /💬 Escribirle · 2 sin leer/);
    assert.doesNotMatch(plano(filaDe(P, 502)), /5 sin leer/, 'le pintó lo de la ficha de otra persona');
    assert.match(plano(filaDe(P, 501)), /💬 Escribirle · 1 sin leer/);
    assert.match(plano(filaDe(P, 504)), /💬 Escribirle · 3 sin leer/);
    assert.match(plano(filaDe(P, 505)), /💬 Escribirle · 3 sin leer/, 'la de play/ con la cuenta junta aquí no cuenta el hilo de su ficha');
    assert.doesNotMatch(plano(filaDe(P, 503)), /sin leer/, 'inventó un número donde no hay mensajes');
  }));

  test('se repinta solo con la vuelta del chat, y después de abrirla sigue el hilo que dijo la nube', async () => {
    let lista = [];
    const M = montar({ nube: { chat_conversaciones: () => lista }, hilos: { '3200000501': '1000000099' } });
    try {
      assert.doesNotMatch(plano(filaDe(M.P, 501)), /sin leer/);
      lista = [{ cedula: '3200000501', nombre: '', celular: '', sin_leer: 2, ultimo: 'hola', ultimo_de: 'socio',
        ultimo_en: '2026-11-13T14:00:00Z', ultimo_canal: 'creditos', sin_leer_canal: { creditos: 2 } }];
      M.P.ev('traerConversaciones()');
      await asentar();
      assert.match(plano(filaDe(M.P, 501)), /💬 Escribirle · 2 sin leer/, 'la fila no se enteró de lo que llegó');
      /* La nube dice que ese celular lee en otro hilo (lo juntaron desde el celular de Joan). */
      lista = lista.concat([{ cedula: '1000000099', nombre: '', celular: '', sin_leer: 4, ultimo: 'hola', ultimo_de: 'socio',
        ultimo_en: '2026-11-13T14:10:00Z', ultimo_canal: 'creditos', sin_leer_canal: { creditos: 4 } }]);
      await tocar(M.P, 501);
      assert.equal(M.P.ev('_chatAbierta'), '1000000099');
      M.P.ev('renderBandeja()');
      assert.match(plano(filaDe(M.P, 501)), /💬 Escribirle · 4 sin leer/, 'la fila sigue contando el hilo viejo');
    } finally { M.cerrar(); }
  });
});

/* ======================================================================== */
describe('5. el mismo botón en la ficha y en el 🔔 del Tablero', () => {

  test('«Lo que pidió» de la ficha: cierra la ficha y abre su chat', con({}, ({ P }) => {
    const h = P.ev("loQuePidioHTML(DB.socios.find(x => x.id === 'F1'))");
    assert.match(h, /onclick="cerrarModal\(\);escribirleDesdeSolicitud\('504'\)"[^>]*>💬 Escribirle/);
    assert.match(h, /onclick="cerrarModal\(\);escribirleDesdeSolicitud\('505'\)"/);
  }));

  test('el 🔔 del Tablero: una y varias', con({ solicitudes: [NUEVO] }, ({ P }) => {
    P.ev('guardarSolicitudesVistas([]); pintarAvisoSolicitudesNuevas()');
    assert.match(P.elems.avisoSolicitudesNuevas.innerHTML, /escribirleDesdeSolicitud\('501'\)/);
    P.ev('_solicitudes = ' + JSON.stringify([NUEVO, PLATA]) + '; pintarAvisoSolicitudesNuevas()');
    const h = P.elems.avisoSolicitudesNuevas.innerHTML;
    assert.match(h, /2 solicitudes nuevas/);
    assert.match(h, /escribirleDesdeSolicitud\('501'\)/);
    assert.match(h, /escribirleDesdeSolicitud\('503'\)/);
  }));
});
