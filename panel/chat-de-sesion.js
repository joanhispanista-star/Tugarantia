/* ============================================================================
 * EL CHAT, CON LA SESIÓN DEL DUEÑO — 25 de noviembre de 2026
 *
 * EL PROBLEMA. El chat del Panel en el bolsillo (panel/espejo.html: clientes y
 * equipo, con su lista, su hilo, sus fotos y su número de sin leer) existe
 * entero desde el 26-oct, pero solo funciona en un teléfono que tenga guardada
 * la CLAVE DE SINCRONIZACIÓN del computador. En el celular de Joan, que entra
 * con su correo o su celular y su contraseña, la pestaña decía «este teléfono
 * todavía no tiene la conexión y la clave». Resultado: los clientes escriben,
 * Joan anda en la calle, y nadie contesta (de ahí salió el botón «¿Aún sin
 * respuesta?» del 24-nov, que es un parche).
 *
 * LO QUE HACE ESTE ARCHIVO. Le presta la sesión del dueño al chat que YA
 * existe. app/chat.js arma cada pedido con `llamar(cfg, fn, cuerpo)` y acepta
 * un `cfg.fetch` propio; aquí se arma ese `cfg`: el mismo pedido sale por la
 * puerta de la sesión (NubeTuGarantia.rpc), a la gemela `panel_…` de cada
 * función (base/20261125b_el_chat_con_tu_sesion.sql), y SIN la clave en el
 * cuerpo. No hay pantalla nueva ni una segunda forma de pintar el chat.
 *
 * POR QUÉ ASÍ Y NO TOCANDO app/chat.js: lo cargan cinco páginas y se pide sin
 * versión; cambiarlo obliga a darle dirección nueva en las cinco (pasó el
 * 24-nov). Y la rama `cadenas`, sin publicar, también lo toca.
 *
 * LO QUE NO SE PUEDE DESDE AQUÍ, a propósito: borrar una conversación entera
 * (chat_olvidar) sigue siendo del computador. Lo que no está en GEMELAS se
 * niega con su frase, sin preguntarle nada a la nube.
 *
 * La clave del computador no pasa por este teléfono en ningún momento: la
 * gemela la lee adentro de la base después de comprobar quién pregunta.
 * ==========================================================================*/
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.ChatDeSesion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SQL = '20261125b_el_chat_con_tu_sesion.sql';

  /* Cada función del chat que el Panel en el bolsillo llama con la clave, y su
     gemela de sesión. Una prueba compara esta lista con el SQL y con lo que
     espejo.html y chat.js llaman de verdad. */
  var GEMELAS = {
    chat_conversaciones: 'panel_chat_conversaciones',
    chat_de: 'panel_chat_de',
    chat_responder: 'panel_chat_responder',
    chat_hilo_de_celular: 'panel_chat_hilo_de_celular',
    chat_foto_panel: 'panel_chat_foto_panel',
    chat_foto_responder: 'panel_chat_foto_responder',
    equipo_chat_conversaciones: 'panel_equipo_chat_conversaciones',
    equipo_chat_de: 'panel_equipo_chat_de',
    equipo_chat_responder: 'panel_equipo_chat_responder',
    equipo_foto_panel: 'panel_equipo_foto_panel',
    equipo_foto_responder: 'panel_equipo_foto_responder'
  };

  function texto(v) { return v === null || v === undefined ? '' : String(v); }

  /* Lo que ChatTuGarantia.llamar espera de un fetch: ok, status y text(). */
  function respuesta(estado, cuerpo) {
    var t = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo === undefined ? null : cuerpo);
    return { ok: estado >= 200 && estado < 300, status: estado, text: function () { return Promise.resolve(t); } };
  }

  /* Cada fallo dice lo suyo. Si esto cayera en las frases de chat.js, un 404
     mandaría a Joan a correr el SQL del chat de agosto (que ya corrió), y un
     «clave incorrecta» a arreglar una clave que este teléfono no tiene. */
  function fallo(e) {
    var x = e || {}, st = Number(x.estado) || 0;
    var dicho = texto((x.cuerpo && typeof x.cuerpo === 'object') ? x.cuerpo.message : x.cuerpo) + ' ' + texto(x.motivo);
    if (x.sin_red) return { humano: 'Sin señal: no pude hablar con la nube.', sin_red: true };
    if (st === 404) {
      return { humano: 'Tu base todavía no tiene el chat con tu sesión. Corre base/' + SQL +
        ' en el SQL Editor de Supabase y vuelve a mirar.', falta: true };
    }
    if (/no autorizado/i.test(dicho)) return { humano: 'Esta cuenta no es la del dueño: el chat no se le abre.' };
    if (st === 401 || st === 403) return { humano: 'Tu entrada se venció. Sal y vuelve a entrar con tu contraseña.', sesion: true };
    if (/clave( de sincronizaci[óo]n)? incorrecta/i.test(dicho)) {
      /* La gemela le pasa a la función de siempre la clave buena; si aun así dice
         que no, es el freno de intentos (alguien tanteando la clave) o una base
         sin clave. No es algo que se arregle en este teléfono. */
      return { humano: 'La nube tiene puesto el freno de la clave del computador (demasiados intentos fallidos), ' +
        'o la base todavía no tiene clave. Vuelve a mirar en 15 minutos.' };
    }
    return { humano: 'No pude hablar con la nube. ' + texto(x.motivo).slice(0, 160) };
  }

  /** El `fetch` para ChatTuGarantia.llamar: la misma pregunta, por la sesión. */
  function pedirCon(nube) {
    return function (url, opciones) {
      var fn = texto(url).split('/rest/v1/rpc/')[1] || '';
      fn = fn.split('?')[0];
      if (!Object.prototype.hasOwnProperty.call(GEMELAS, fn)) {
        return Promise.reject({ humano: 'Eso no se hace desde este teléfono: hace falta el computador.' });
      }
      var cuerpo = {};
      try { cuerpo = JSON.parse((opciones && opciones.body) || '{}') || {}; } catch (e) { cuerpo = {}; }
      delete cuerpo.p_clave;      // aquí no hay clave, y no viaja ni vacía
      return nube.rpc(GEMELAS[fn], cuerpo).then(function (r) { return respuesta(200, r); }, function (e) { throw fallo(e); });
    };
  }

  /**
   * La conexión del chat para quien entró con su sesión y no tiene la clave.
   * null si no hay sesión o no hay con qué preguntar: quien llama decide qué decir.
   */
  function cfg(nube) {
    if (!nube || typeof nube.rpc !== 'function' || typeof nube.config !== 'function' || typeof nube.conectado !== 'function') return null;
    var hay = false;
    try { hay = !!nube.conectado(); } catch (e) { hay = false; }
    if (!hay) return null;
    var c = nube.config() || {};
    if (!c.url || !c.anon) return null;
    return { url: c.url, anon: c.anon, clave: '', porSesion: true, fetch: pedirCon(nube) };
  }

  return { VERSION: '2026-11-25', SQL: SQL, GEMELAS: GEMELAS, cfg: cfg, pedirCon: pedirCon, fallo: fallo };
});
