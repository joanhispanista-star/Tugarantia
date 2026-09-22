'use strict';
/* ==========================================================================
 * EL CHAT CONTESTA DONDE LE ESCRIBIERON — 22 de septiembre de 2026
 *
 * Joan: «arregla el chat mal enrutado».
 *
 * QUÉ SE ROMPIÓ Y CÓMO. El 22-sep se encendió el chat de la app con sus tres
 * pestañas. Pero `chat_responder` —con la que Joan contesta— es de agosto y
 * hace `insert into mensajes (cedula, de, texto)` sin la columna `canal`, que
 * nació ese mismo día con `default 'servicio'`. Y la función que lee el cliente
 * filtra por canal. Resultado: quien preguntaba por su crédito en «Créditos
 * nuevos» veía su mensaje sin respuesta para siempre.
 *
 * Lo encendimos nosotros y lo rompimos nosotros. Este archivo existe para que
 * no vuelva a pasar, y vigila las dos mitades:
 *
 *   1. QUE LA CORRECCIÓN NO DEPENDA DE LA PANTALLA. El arreglo de fondo está en
 *      la base: sin canal, se contesta en el del último mensaje del cliente. Si
 *      un día alguien reescribe el Panel y se olvida del parámetro, tiene que
 *      seguir enrutando bien.
 *   2. QUE JOAN VEA POR DÓNDE LE ESCRIBIERON, con las mismas tres pestañas que
 *      ve el cliente, y que se abra donde hay algo sin leer.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CHAT = require('../app/chat.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922d_chat_por_canal.sql');

/* Saca funciones del CRM y las CORRE. Comprobar que el texto está escrito no
   es comprobar que hace lo que dice. */
function delCRM(nombres, extra) {
  const ctx = Object.assign({
    escHTML: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    CHAT, console, _chatCanal: 'servicio'
  }, extra || {});
  vm.createContext(ctx);
  nombres.forEach(n => {
    const i = CRM.indexOf('\nfunction ' + n + '(');
    assert.ok(i >= 0, 'no encontré ' + n + ' en el CRM');
    const resto = CRM.slice(i + 1);
    const fin = resto.search(/\n(function |const |let |\/\* )/);
    vm.runInContext(resto.slice(0, fin > 0 ? fin : 3000), ctx, { filename: n });
  });
  return ctx;
}

describe('la base enruta bien aunque la pantalla se olvide', () => {

  test('sin canal, se contesta en el del ÚLTIMO mensaje DEL CLIENTE', () => {
    const f = SQL.slice(SQL.indexOf('function public.chat_responder'),
                        SQL.indexOf('function public.chat_de'));
    assert.match(f, /select m\.canal into v_canal/,
      'chat_responder dejó de buscar el canal del cliente');
    assert.match(f, /m\.de = 'socio'/,
      'busca el último mensaje de CUALQUIERA: si Joan escribió el último, se ' +
      'contestaría a sí mismo en su propio canal');
    assert.match(f, /order by m\.id desc/,
      'no toma el ÚLTIMO mensaje');
    /* Y el canal entra en el insert, que es lo que faltaba. */
    assert.match(f, /insert into public\.mensajes \(cedula, de, texto, canal\)/,
      'la respuesta vuelve a guardarse sin canal: es el defecto entero');
  });

  test('un canal inventado no se guarda: cae en el del cliente', () => {
    const f = SQL.slice(SQL.indexOf('function public.chat_responder'),
                        SQL.indexOf('function public.chat_de'));
    assert.match(f, /p_canal in \('servicio', 'cobranza', 'creditos'\)/,
      'no se valida el canal, así que un typo crearía una pestaña fantasma que ' +
      'nadie puede leer');
  });

  test('la vieja de tres argumentos se suelta', () => {
    /* Con las dos puestas, PostgREST no sabe a cuál llamar. Es el mismo paso
       que hubo que dar con play_solicitar esta mañana. */
    assert.match(SQL, /drop function if exists public\.chat_responder\(text, text, text\)/);
    assert.match(SQL, /drop function if exists public\.chat_de\(text, text, bigint\)/);
    assert.match(SQL, /pronargs = 3/,
      'no se comprueba que la vieja se fue de verdad');
  });

  test('un drop se lleva los grants, y se reponen', () => {
    /* Ese descuido exacto dejó el chat abierto para los clientes y cerrado para
       el Panel en agosto. */
    assert.match(SQL, /grant\s+execute on function public\.chat_responder\(text, text, text, text\)\s+to anon/);
    assert.match(SQL, /grant\s+execute on function public\.chat_de\(text, text, bigint, text\)\s+to anon/);
    assert.match(SQL, /perdio el permiso del Panel/,
      'no se comprueba que los permisos sobrevivieran al drop');
  });

  test('leer un canal NO marca como vistos los otros', () => {
    const f = SQL.slice(SQL.indexOf('function public.chat_de'),
                        SQL.indexOf('function public.chat_conversaciones'));
    assert.match(f, /set visto = true[\s\S]{0,200}v_canal is null or canal = v_canal/,
      'sigue marcando los tres canales al leer uno: el contador diría cero con ' +
      'mensajes sin contestar en otra pestaña');
    assert.match(f, /'canal', m\.canal/,
      'chat_de no devuelve el canal, así que Joan sigue sin saber por dónde le escribieron');
  });

  test('la bandeja dice en QUÉ canal falta, no solo cuántos', () => {
    assert.match(SQL, /sin_leer_canal/,
      'con tres pestañas, «2 sin leer» no alcanza: hay que decir en cuál');
    assert.match(SQL, /ultimo_canal/,
      'no se sabe por dónde escribió de último, que es donde hay que contestarle');
  });

  test('se comprueba LLAMANDO, y sin dejar a Joan fuera de su CRM', () => {
    assert.match(SQL, /public\.chat_responder\(v_clave/,
      'la migración no llama a la función que acaba de crear');
    /* La variable NO se puede llamar `clave`: config_privada tiene una columna
       con ese nombre y el where sería ambiguo (42702). Es el defecto de
       `huella`, que costó trece días de fotos. */
    assert.equal(/select\s+valor\s+into\s+clave\b/.test(SQL), false,
      'volvió la variable llamada «clave» contra la columna «clave»: ambigüedad 42702');
    assert.match(SQL, /where cp\.clave = 'clave_sync'/,
      'la columna no va calificada');
  });
});

describe('app/chat.js manda el canal solo cuando lo hay', () => {

  test('los tres canales viven en un solo sitio', () => {
    assert.deepEqual(CHAT.CANALES.map(x => x[0]), ['servicio', 'cobranza', 'creditos'],
      'los canales del Panel dejaron de ser los mismos que los de la app');
    assert.equal(CHAT.nombreCanal('cobranza'), 'Cobranzas');
    /* Un canal desconocido no revienta ni inventa un nombre. */
    assert.equal(CHAT.nombreCanal('lo-que-sea'), 'Servicio al cliente');
  });

  test('responder y conversacion aceptan canal, y es opcional', () => {
    const src = leer('app/chat.js');
    assert.match(src, /function responder\(cfg, ident, texto, canal\)/);
    assert.match(src, /function conversacion\(cfg, ident, desde, canal\)/);
    /* Opcional A PROPÓSITO: sin él la base enruta igual, así que una pantalla
       vieja sigue funcionando y encima acierta. */
    assert.match(src, /if \(canal\) c\.p_canal = String\(canal\)/,
      'el canal se manda siempre, incluso vacío: eso pisaría el acierto de la base');
  });
});

describe('el Panel abre donde hay algo sin leer', () => {

  const entrada = c => delCRM(['canalDeEntrada']).canalDeEntrada(c);

  test('abre en el canal que tiene pendientes, no en uno fijo', () => {
    assert.equal(entrada({ ultimo_canal: 'servicio',
      sin_leer_canal: { servicio: 0, cobranza: 2, creditos: 0 } }), 'cobranza',
      'abrir siempre en «Servicio» es exactamente cómo se pierde de vista lo de Cobranzas');
  });

  test('sin pendientes, abre donde escribió de último', () => {
    assert.equal(entrada({ ultimo_canal: 'creditos',
      sin_leer_canal: { servicio: 0, cobranza: 0, creditos: 0 } }), 'creditos');
  });

  test('sin nada, no revienta', () => {
    assert.equal(entrada({}), 'servicio');
    assert.equal(entrada(null), 'servicio');
  });

  test('las pestañas del Panel son las mismas del cliente, y dicen cuántos faltan', () => {
    const ctx = delCRM(['pestanasCanal'], { _chatCanal: 'cobranza' });
    const h = ctx.pestanasCanal({ sin_leer_canal: { servicio: 1, cobranza: 0, creditos: 3 } });
    CHAT.CANALES.forEach(x => assert.ok(h.indexOf(x[1]) >= 0, 'falta la pestaña ' + x[1]));
    assert.match(h, />Créditos nuevos<\/b>?\s*<b>\(3\)<\/b>|Créditos nuevos[\s\S]{0,30}\(3\)/,
      'la pestaña no dice cuántos mensajes sin leer tiene');
    /* Y la abierta se distingue de las otras. */
    assert.match(h, /btn-negro[^>]*>Cobranzas|Cobranzas/, 'no se ve cuál está abierta');
  });

  test('el Panel responde EN la pestaña que tiene abierta', () => {
    assert.match(CRM, /CHAT\.responder\(sbCfg\(\),_chatAbierta,r\.texto,_chatCanal\)/,
      'el Panel volvió a responder sin decir el canal');
    assert.match(CRM, /CHAT\.conversacion\(sbCfg\(\),_chatAbierta,_chatUltimo,_chatCanal\)/,
      'el Panel lee los tres hilos mezclados otra vez');
  });

  test('cambiar de pestaña limpia el hilo antes de traer el otro', () => {
    /* Sin esto, los mensajes del canal viejo se quedan pintados debajo de los
       del nuevo y Joan contesta mirando una conversación que no existe. */
    const i = CRM.indexOf('function cambiarCanalChat');
    const t = CRM.slice(i, i + 700);
    assert.match(t, /_chatMsgs=\[\];\s*_chatUltimo=0/,
      'al cambiar de pestaña no se limpia lo que ya estaba pintado');
  });
});
