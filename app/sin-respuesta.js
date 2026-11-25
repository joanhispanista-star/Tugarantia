/* ============================================================================
 * «¿AÚN SIN RESPUESTA?» — 24 de noviembre de 2026
 *
 * LO QUE PIDIÓ JOAN: «quiero que pongas mi numero de telefono para garantia
 * como numero de contacto de servicio al cliente por ahora, en caso de que no
 * le den respuesta desde la aplicacion entonses que exista el boton que lo
 * redirija a mi whatsapp».
 *
 * LO QUE YA HABÍA DICHO, Y POR ESO ESTO ES ASÍ DE ESTRECHO: el 22-sep pidió lo
 * contrario («nada de compartir mi numero») y el WhatsApp del negocio se quitó
 * del registro (play/index.html, junto a olvide()). El número NO vuelve a estar
 * a la vista. Sale SOLO un botón, y SOLO cuando la persona escribió por el chat
 * y nadie de la casa le ha contestado en MINUTOS minutos.
 *
 * LA REGLA, CON SU PORQUÉ:
 *   · Lo que cuenta como respuesta es que conteste una PERSONA (Joan o su
 *     equipo). Una respuesta automática no es que le respondieron: si lo
 *     fuera, el botón no saldría nunca justo cuando más falta hace.
 *   · Se cuenta desde el PRIMER mensaje que quedó sin respuesta, no desde el
 *     último: insistir no vuelve a poner el reloj en cero.
 *   · En el enlace no viaja nada de la persona (ni nombre, ni celular, ni
 *     cédula, ni lo que escribió): solo una frase fija, que ella manda si quiere.
 *   · Sin número de la casa no hay botón: no se manda a un WhatsApp sin destino.
 *   · Es para ATENDER a quien ya escribió. Ese WhatsApp no se usa para ofrecer
 *     crédito ni para cobrar: lo prohíbe la política de WhatsApp y, para
 *     cobrar, manda el canal que el cliente escogió (Ley 2300).
 *
 * POR QUÉ UN ARCHIVO APARTE y no dentro de app/chat.js: chat.js lo cargan cinco
 * páginas y se pide sin versión desde antes de v138; cambiarlo obliga a darle
 * dirección nueva en las cinco. Aquí solo vive esta regla, y solo la piden las
 * dos pantallas donde escribe el cliente (app/socio.html y play/index.html).
 * Quién escribió cada mensaje (la persona, la casa, una máquina) lo sigue
 * diciendo chat.js: de ahí se toma, para que nunca digan cosas distintas.
 *
 * El número lo pone la página; aquí no hay ningún número.
 * ==========================================================================*/
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  var api = fabrica(function () {
    if (raiz && raiz.ChatTuGarantia) return raiz.ChatTuGarantia;
    try { return (typeof require === 'function') ? require('./chat.js') : null; } catch (e) { return null; }
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.SinRespuesta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (elChat) {
  'use strict';

  var MINUTOS = 15;
  var TEXTO = 'Hola, les escribí por el chat de la app de Tu Garantía y todavía no me han respondido.';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  /* De quién es un mensaje lo dice chat.js (AUTORES). Si chat.js no llegó, no
     se adivina: sin saber quién escribió, no hay espera que contar. */
  function esDeLaPersona(m) { var C = elChat(); return !!(C && C.ladoDe && C.ladoDe(m && m.de) === 'socio'); }
  function esDeUnaMaquina(m) { var C = elChat(); return !!(C && C.esAutomatico && C.esAutomatico(m)); }

  /** Desde cuándo espera la persona que le conteste alguien (ms), o 0 si no espera. */
  function esperandoDesde(mensajes) {
    var l = mensajes || [], desde = 0;
    if (!elChat()) return 0;
    for (var i = l.length - 1; i >= 0; i--) {
      var m = l[i];
      if (!m) continue;
      if (esDeLaPersona(m)) {
        var t = Date.parse(String(m.creado_en || ''));
        if (!isNaN(t)) desde = t;
        continue;
      }
      if (esDeUnaMaquina(m)) continue;    // contestó una máquina: sigue esperando a una persona
      break;                              // de aquí para atrás, ya le respondió alguien de la casa
    }
    return desde;
  }
  function minutosEsperando(mensajes, ahora) {
    var d = esperandoDesde(mensajes);
    if (!d) return 0;
    var a = (ahora === null || ahora === undefined) ? Date.now() : Number(ahora);
    return Math.max(0, Math.floor((a - d) / 60000));
  }

  /** El aviso con su botón, o '' si no toca. `o`: {whatsapp, ahora, minutos, texto}. */
  function html(mensajes, opciones) {
    var o = opciones || {};
    var n = String(o.whatsapp === null || o.whatsapp === undefined ? '' : o.whatsapp).replace(/\D/g, '');
    if (n.length < 10) return '';
    var tope = Number(o.minutos) > 0 ? Number(o.minutos) : MINUTOS;
    if (minutosEsperando(mensajes, o.ahora) < tope) return '';
    var destino = n.length === 10 ? '57' + n : n;
    return '<div class="sr-caja" id="srCaja" role="status">' +
      '<b>¿Aún sin respuesta?</b> Perdona la demora. Escríbenos por WhatsApp.' +
      '<a class="btn arriba sr-boton" id="srPorWhatsApp" target="_blank" rel="noopener" href="https://wa.me/' + esc(destino) +
        '?text=' + esc(encodeURIComponent(o.texto || TEXTO)) + '">Escribir por WhatsApp</a></div>';
  }

  /* El estilo viaja con el módulo: así no hay que tocar la hoja del chat, que
     también es de las cinco páginas. Usa los tokens de las dos pantallas. */
  var ESTILO = '.sr-caja{margin:12px 0;padding:12px 14px;border-radius:14px;border:1px solid var(--linea,#E6E0D8);' +
      'background:var(--papel,#fff);font-size:14px;line-height:1.45}' +
    '.sr-caja b{display:block;margin-bottom:2px}' +
    '.sr-caja .sr-boton{display:flex;align-items:center;justify-content:center;min-height:46px;margin-top:10px;text-decoration:none}';
  function ponerEstilo(d) {
    try {
      if (!d || !d.getElementById || d.getElementById('srEstilo')) return;
      var s = d.createElement('style'); s.id = 'srEstilo'; s.textContent = ESTILO;
      (d.head || d.documentElement).appendChild(s);
    } catch (e) { /* sin estilo el botón sigue sirviendo */ }
  }

  /** Lo pinta en `caja` (o lo quita). Solo toca el DOM si cambió. Devuelve lo pintado. */
  function pintar(caja, mensajes, opciones) {
    if (!caja) return '';
    var h = html(mensajes, opciones);
    if (caja.__sinRespuesta === h) return h;
    caja.__sinRespuesta = h;
    if (h) ponerEstilo(caja.ownerDocument || (typeof document !== 'undefined' ? document : null));
    caja.innerHTML = h;
    return h;
  }

  return {
    VERSION: '2026-11-24',
    MINUTOS: MINUTOS,
    TEXTO: TEXTO,
    esperandoDesde: esperandoDesde,
    minutosEsperando: minutosEsperando,
    html: html,
    pintar: pintar
  };
});
