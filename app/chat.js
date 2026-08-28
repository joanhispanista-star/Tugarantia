/* ============================================================================
 * EL CHAT — un solo archivo para la app del socio Y para el Panel
 * Fase 1. 28 de agosto de 2026.
 *
 * POR QUÉ ESTÁ EN app/ Y NO EN panel/, SI TAMBIÉN LO USA EL CRM
 *
 * Por lo mismo que motor.js y puente.js viven aquí: lo cargan las dos apps a
 * propósito, para que no haya dos verdades sobre la misma conversación. La
 * lección está escrita en espejo.html, que tuvo que copiarse `aplicarVars` y
 * dejó anotado en su propio comentario: «ES UNA SEGUNDA COPIA Y VA A DERIVAR».
 * Aquí no se copia nada: el que decide de qué lado va un mensaje, cómo se
 * escapa y qué se le muestra al cliente es este archivo, y solo este.
 *
 * QUÉ HAY ADENTRO
 *   · Las reglas de lectura: quién escribió, de qué lado va, si lo contestó
 *     una máquina, cómo se agrupa por día.
 *   · El HTML del hilo, que es idéntico en los dos lados salvo por cuál de las
 *     dos columnas es «yo».
 *   · Las seis llamadas a la nube, con una sola forma de armar el pedido.
 *
 * QUÉ NO HAY, A PROPÓSITO
 *   · Ninguna pantalla. Quién pinta y cuándo es de socio.html y de crm.html.
 *   · Ningún dato guardado. El chat no existe sin nube: son dos personas en
 *     dos teléfonos, y alguien tiene que guardar el mensaje en el medio.
 *
 * LA REGLA QUE NO SE ROMPE: EL TEXTO LO ESCRIBE UNA PERSONA.
 * Todo lo que venga de la base se pinta ESCAPADO. Si no, un socio escribe una
 * etiqueta y le corre en el navegador de Joan — que es el navegador donde vive
 * la cartera entera. Por eso `esc()` está aquí adentro y no se recibe de fuera:
 * quien use este archivo no puede olvidarse de pasarla.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ChatTuGarantia = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* El mismo tope que pone la base (`length(btrim(texto)) between 1 and 1000`).
     Está escrito acá para poder avisar ANTES de mandar: un mensaje que la base
     corta a mil deja al cliente creyendo que mandó el resto. */
  var LARGO_MAX = 1000;

  /* Los cuatro autores que admite la columna `de` desde 20260828b_chat.sql.
     `lado` es lo único que decide de qué lado de la pantalla va la burbuja:
     todo lo que no escribió el socio viene del negocio, lo haya escrito Joan o
     una regla. */
  var AUTORES = {
    socio:  { lado: 'socio',   quien: 'El cliente' },
    panel:  { lado: 'negocio', quien: 'Tú' },
    auto:   { lado: 'negocio', quien: 'Respuesta automática' },
    agente: { lado: 'negocio', quien: 'El asistente' }
  };

  function autorDe(de) { return AUTORES[String(de || '')] || AUTORES.panel; }
  function ladoDe(de) { return autorDe(de).lado; }

  /* Automático es lo que NO escribió una persona. Se mira el autor, no la
     regla: un mensaje de 'auto' sin regla anotada sigue siendo automático, y
     esconderlo sería justo la mentira que la fase 3 no puede permitirse. */
  function esAutomatico(m) {
    var de = String((m && m.de) || '');
    return de === 'auto' || de === 'agente';
  }

  /* ---------------------------------------------------------------------
     ESCAPAR. Cinco caracteres, los mismos que escapa el resto del proyecto.
     La comilla simple entra porque este HTML se arma con concatenación y
     acaba dentro de atributos.
     ------------------------------------------------------------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------------
     EL TEXTO QUE SE VA A MANDAR. Devuelve un motivo en palabras, no un
     código: lo que salga de aquí se le muestra al cliente tal cual.
     ------------------------------------------------------------------- */
  function limpiar(t) { return String(t === null || t === undefined ? '' : t).trim(); }

  function revisar(texto) {
    var t = limpiar(texto);
    if (!t) return { ok: false, motivo: 'Escribe algo antes de enviar.' };
    if (t.length > LARGO_MAX) {
      return {
        ok: false,
        motivo: 'Te pasaste por ' + (t.length - LARGO_MAX) + ' caracteres. ' +
                'El máximo son ' + LARGO_MAX + '.'
      };
    }
    return { ok: true, texto: t };
  }

  /* ---------------------------------------------------------------------
     FECHAS. Se arman con el reloj del aparato y en hora local, que es la que
     el cliente reconoce. `creado_en` viene de la base en UTC con zona.
     ------------------------------------------------------------------- */
  function aFecha(iso) {
    var d = new Date(String(iso || ''));
    return isNaN(d.getTime()) ? null : d;
  }
  function dosDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function hora(iso) {
    var d = aFecha(iso);
    if (!d) return '';
    var h = d.getHours(), ampm = h < 12 ? 'a.m.' : 'p.m.';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + dosDigitos(d.getMinutes()) + ' ' + ampm;
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /* Día en palabras, y con «Hoy» y «Ayer» porque es lo que se lee en una
     conversación. `hoyRef` se puede pasar para que las pruebas no dependan de
     qué día se corran. */
  function dia(iso, hoyRef) {
    var d = aFecha(iso);
    if (!d) return '';
    var hoy = hoyRef ? new Date(hoyRef) : new Date();
    var mismo = function (a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
    };
    if (mismo(d, hoy)) return 'Hoy';
    var ayer = new Date(hoy.getTime() - 86400000);
    if (mismo(d, ayer)) return 'Ayer';
    return d.getDate() + ' de ' + MESES[d.getMonth()] +
      (d.getFullYear() === hoy.getFullYear() ? '' : ' de ' + d.getFullYear());
  }

  /* Cuándo, en corto, para la lista de conversaciones: la hora si fue hoy, el
     día si no. En una bandeja lo que importa es «¿es de hoy?». */
  function cuandoCorto(iso, hoyRef) {
    var d = dia(iso, hoyRef);
    return d === 'Hoy' ? hora(iso) : d;
  }

  /* Agrupa en bloques por día, conservando el orden que trae la base (por id).
     No reordena: si algún día llegan desordenados, el problema está en la
     consulta y esconderlo aquí lo haría invisible. */
  function agruparPorDia(mensajes, hoyRef) {
    var out = [], actual = null;
    (mensajes || []).forEach(function (m) {
      var d = dia(m && m.creado_en, hoyRef);
      if (!actual || actual.dia !== d) { actual = { dia: d, mensajes: [] }; out.push(actual); }
      actual.mensajes.push(m);
    });
    return out;
  }

  /* ---------------------------------------------------------------------
     EL HILO, EN HTML. Igual en los dos lados salvo por quién es «yo».
       yo: 'socio'   → lo pinta la app del cliente
       yo: 'negocio' → lo pinta el Panel
     Las clases van con prefijo `ch-` y se definen en la hoja de cada página.
     ------------------------------------------------------------------- */
  function hiloHTML(mensajes, opciones) {
    var o = opciones || {};
    var yo = o.yo === 'socio' ? 'socio' : 'negocio';
    var lista = mensajes || [];

    if (!lista.length) {
      return '<div class="ch-vacio">' + esc(o.vacio || 'Todavía no hay mensajes.') + '</div>';
    }

    /* El «visto» solo se pinta en el ÚLTIMO mensaje propio, y solo si de
       verdad viene marcado. Ponerlo en todos convierte la conversación en una
       columna de garabatos, y ponerlo sin dato sería afirmar que lo leyeron. */
    var ultimoMio = -1;
    lista.forEach(function (m, i) { if (ladoDe(m.de) === yo) ultimoMio = i; });

    return agruparPorDia(lista, o.hoy).map(function (bloque) {
      return '<div class="ch-dia"><span>' + esc(bloque.dia) + '</span></div>' +
        bloque.mensajes.map(function (m) {
          var i = lista.indexOf(m);
          var mio = ladoDe(m.de) === yo;
          var auto = esAutomatico(m);
          var etiqueta = '';
          /* La marca de automático se pinta SIEMPRE que el mensaje lo sea, en
             los dos lados. El cliente tiene derecho a saber cuándo le contestó
             una máquina, y Joan tiene que poder distinguir lo que contestó él.
             Esta línea es la fase 3 entera resumida: si se quita, la promesa de
             «el cliente sabe cuándo habla con una máquina» se queda sin
             cumplir. */
          if (auto) {
            etiqueta = '<span class="ch-auto">' + esc(autorDe(m.de).quien) +
              (m.regla ? ' · ' + esc(m.regla) : '') + '</span>';
          }
          var visto = '';
          if (mio && i === ultimoMio && m.visto === true) {
            visto = '<span class="ch-visto">' + esc(o.textoVisto || 'Leído') + '</span>';
          }
          return '<div class="ch-msg ' + (mio ? 'ch-mio' : 'ch-suyo') +
            (auto ? ' ch-esauto' : '') + '">' +
            '<div class="ch-burbuja">' + etiqueta +
            '<div class="ch-texto">' + esc(m.texto) + '</div>' +
            '<div class="ch-pie">' + esc(hora(m.creado_en)) + visto + '</div>' +
            '</div></div>';
        }).join('');
    }).join('');
  }

  /* ---------------------------------------------------------------------
     LA LISTA DE CONVERSACIONES — solo la ve Joan.
     ------------------------------------------------------------------- */
  function listaHTML(conversaciones, opciones) {
    var o = opciones || {};
    var lista = conversaciones || [];
    if (!lista.length) {
      return '<div class="ch-vacio">' + esc(o.vacio || 'Nadie te ha escrito todavía.') + '</div>';
    }
    var alAbrir = o.alAbrir || 'abrirConversacion';
    return '<div class="ch-lista">' + lista.map(function (c) {
      var n = Number(c.sin_leer || 0);
      /* «Tú:» delante de lo último cuando el último en hablar fue el negocio.
         Sin eso, la bandeja no distingue «me escribió» de «le escribí», que es
         lo primero que se mira para saber a quién le falta respuesta. */
      var mio = ladoDe(c.ultimo_de) === 'negocio';
      var quien = mio ? (esAutomatico({ de: c.ultimo_de }) ? 'Automático: ' : 'Tú: ') : '';
      return '<button type="button" class="ch-conv' + (n ? ' ch-pend' : '') +
        '" onclick="' + esc(alAbrir) + '(\'' + esc(c.cedula) + '\')">' +
        '<span class="ch-conv-quien">' + esc(c.nombre || 'Socio') +
          (n ? '<span class="ch-sinleer">' + n + '</span>' : '') + '</span>' +
        '<span class="ch-conv-ultimo">' + esc(quien) + esc(c.ultimo || '') + '</span>' +
        '<span class="ch-conv-cuando">' + esc(cuandoCorto(c.ultimo_en, o.hoy)) + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function totalSinLeer(conversaciones) {
    return (conversaciones || []).reduce(function (t, c) {
      return t + (Number(c.sin_leer) || 0);
    }, 0);
  }

  /* ---------------------------------------------------------------------
     HABLAR CON LA NUBE. Una sola forma de armar el pedido, como rpc() en el
     Panel. `cfg.fetch` existe para poder probar esto sin red; en el navegador
     nadie lo pasa y usa el del propio navegador.
     ------------------------------------------------------------------- */
  function llamar(cfg, fn, cuerpo) {
    var c = cfg || {};
    if (!c.url || !c.anon) {
      return Promise.reject({ humano: 'Todavía no hay conexión con la nube.' });
    }
    var pedir = c.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!pedir) return Promise.reject({ humano: 'Este navegador no puede conectarse.' });

    return pedir(String(c.url).replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: c.anon,
        Authorization: 'Bearer ' + c.anon
      },
      body: JSON.stringify(cuerpo || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        /* El 404 tiene mensaje propio: significa que la migración no se
           aplicó, y eso se arregla corriendo el SQL, no reintentando. Ya pasó
           con play_solicitar, que estuvo llamada y sin existir desde el 11-ago
           dando un 404 mudo. */
        if (r.status === 404) {
          throw { humano: 'El chat todavía no está encendido en la base. ' +
                          'Falta correr base/20260828b_chat.sql.' };
        }
        if (!r.ok) {
          throw { humano: 'No pude conectarme. Revisa el internet y vuelve a intentar.',
                  detalle: t.slice(0, 200) };
        }
        try { return t === '' ? null : JSON.parse(t); } catch (e) { return null; }
      });
    });
  }

  /* --- lo que hace el socio --- */

  /* Devuelve el id del mensaje, o null. Y null significa lo mismo para «no
     existe», «código malo» y «frenado»: la base no delata cuál fue, y esta
     capa tampoco lo adivina. Quien llama traduce ese null a una sola frase. */
  function escribir(cfg, ident, codigo, texto) {
    var r = revisar(texto);
    if (!r.ok) return Promise.reject({ humano: r.motivo });
    return llamar(cfg, 'chat_escribir',
      { p_cedula: String(ident || ''), p_codigo: String(codigo || ''), p_texto: r.texto });
  }

  function leer(cfg, ident, codigo, desde) {
    return llamar(cfg, 'chat_leer',
      { p_cedula: String(ident || ''), p_codigo: String(codigo || ''), p_desde: Number(desde) || 0 });
  }

  /* --- lo que hace Joan. Todas piden su clave --- */

  function conversaciones(cfg) {
    return llamar(cfg, 'chat_conversaciones', { p_clave: (cfg || {}).clave || '' });
  }
  function conversacion(cfg, ident, desde) {
    return llamar(cfg, 'chat_de',
      { p_clave: (cfg || {}).clave || '', p_cedula: String(ident || ''), p_desde: Number(desde) || 0 });
  }
  function responder(cfg, ident, texto) {
    var r = revisar(texto);
    if (!r.ok) return Promise.reject({ humano: r.motivo });
    return llamar(cfg, 'chat_responder',
      { p_clave: (cfg || {}).clave || '', p_cedula: String(ident || ''), p_texto: r.texto });
  }
  /* Borra la conversación ENTERA. La política de datos se lo promete al socio
     y hay que poder cumplirlo; por eso existe y por eso no se puede deshacer. */
  function olvidar(cfg, ident) {
    return llamar(cfg, 'chat_olvidar',
      { p_clave: (cfg || {}).clave || '', p_cedula: String(ident || '') });
  }

  return {
    LARGO_MAX: LARGO_MAX,
    AUTORES: AUTORES,
    autorDe: autorDe,
    ladoDe: ladoDe,
    esAutomatico: esAutomatico,
    esc: esc,
    limpiar: limpiar,
    revisar: revisar,
    hora: hora,
    dia: dia,
    cuandoCorto: cuandoCorto,
    agruparPorDia: agruparPorDia,
    hiloHTML: hiloHTML,
    listaHTML: listaHTML,
    totalSinLeer: totalSinLeer,
    llamar: llamar,
    escribir: escribir,
    leer: leer,
    conversaciones: conversaciones,
    conversacion: conversacion,
    responder: responder,
    olvidar: olvidar
  };
});
