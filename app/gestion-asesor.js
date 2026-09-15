/* ===========================================================================
 * LA GESTIÓN DEL ASESOR — las reglas, fuera de la pantalla
 * 15 de septiembre de 2026.
 *
 * Joan pidió: «el role de asesor optimizalo para que pueda ver sus clientes y
 * les pueda dar gestion de whatsapp y sms y mensaje de voz».
 *
 * ---------------------------------------------------------------------------
 * LO PRIMERO QUE HAY QUE DECIR: EL ASESOR NO TENÍA FRENO
 *
 * El botón 📲 del modo equipo (contactarEq) abría WhatsApp sin mirar NADA: ni la
 * hora, ni si era domingo, ni si era festivo, ni cuántas veces se había tocado a
 * esa persona esa semana, ni por qué canal.
 *
 * El modo de Joan sí tiene ese freno desde hace semanas. El del equipo no lo
 * heredó nunca. Y la Ley 2300 de 2023 le aplica a Joan EN PERSONA (artículo 1
 * nombra a las personas naturales; el 4 lo repite): un asesor cobrando un
 * domingo a las nueve de la noche es una infracción de Joan, no del asesor.
 *
 * ---------------------------------------------------------------------------
 * LA DISTINCIÓN QUE HAY QUE HACER BIEN: VENDER NO ES COBRAR
 *
 * La Ley 2300 regula las GESTIONES DE COBRANZA. Llamar a un prospecto para
 * ofrecerle un crédito no es cobrar, y meterle los topes de cobranza sería
 * frenar la venta con una ley que no habla de ella.
 *
 * Así que el freno se aplica por ETAPA: las etapas de cartera (víspera, día de
 * pago, moras) son cobro; las de venta (potencial, registrado, pagó) no. Si un
 * día alguien agrega una etapa nueva, cae del lado seguro —cobro— a propósito:
 * equivocarse hacia el freno cuesta una llamada, equivocarse hacia el otro lado
 * cuesta una sanción.
 *
 * ---------------------------------------------------------------------------
 * LAS PLANTILLAS
 *
 * El asesor solo podía mandar «Hola Pedro 🙂». Literalmente eso, siempre. Y de
 * rebote, el registro de control que Joan pidió no valía nada: doscientos
 * contactos guardados con el mismo texto no dicen qué se le dijo a nadie.
 *
 * Acá están las plantillas por situación. Van por WhatsApp, donde las tildes y
 * los emoji son gratis — no se confundan con las de app/cobranza-envio.js, que
 * son para SMS y tienen que caber en 160 caracteres sin tildes.
 * ========================================================================= */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.GestionAsesor = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Las etapas que son COBRO. Todo lo demás —y lo que no se reconozca— también,
     por lo dicho arriba: del lado seguro. Las de VENTA se nombran una por una
     justo por eso: la lista corta es la de las excepciones. */
  var ETAPAS_DE_VENTA = ['PC', 'CR', 'PAGADO'];

  function esCobranza(etapa) {
    return ETAPAS_DE_VENTA.indexOf(String(etapa || '')) < 0;
  }

  /**
   * ¿Se puede contactar a esta persona AHORA?
   *
   * @param persona  {etapa, gestion:{cuando,canal}, celular}
   * @param opciones {ahora:Date, canal:'whatsapp'|'sms'|'voz', esFestivo:fn}
   * @returns {{puede, motivo, texto, es_cobranza}}
   *
   * Devuelve un MOTIVO y una frase, no un booleano: cada negativa tiene su
   * propia explicación y un booleano obliga a adivinarla en la pantalla.
   */
  function puedeContactar(persona, opciones) {
    var o = opciones || {};
    var p = persona || {};
    var cobro = esCobranza(p.etapa);

    if (!p.celular) {
      return { puede: false, motivo: 'sin_celular', es_cobranza: cobro,
               texto: 'Esta persona no tiene celular en su ficha.' };
    }

    /* VENDER NO TIENE VENTANA LEGAL. Se devuelve permitido y se dice que es
       venta, para que la pantalla no pinte un aviso de cobranza que no toca. */
    if (!cobro) return { puede: true, motivo: null, es_cobranza: false, texto: '' };

    var d = o.ahora || new Date();
    var dia = d.getDay();
    var hora = d.getHours() + d.getMinutes() / 60;

    var festivo = false;
    if (typeof o.esFestivo === 'function') {
      try { festivo = !!o.esFestivo(d); } catch (e) { festivo = false; }
    }
    if (festivo) {
      return { puede: false, motivo: 'festivo', es_cobranza: true,
               texto: 'Hoy es festivo. La Ley 2300 no deja cobrar en festivo.' };
    }
    if (dia === 0) {
      return { puede: false, motivo: 'domingo', es_cobranza: true,
               texto: 'Es domingo. La Ley 2300 no deja cobrar los domingos.' };
    }
    if (dia === 6 && !(hora >= 8 && hora < 15)) {
      return { puede: false, motivo: 'hora_sabado', es_cobranza: true,
               texto: 'Los sábados solo se puede cobrar de 8 de la mañana a 3 de la tarde.' };
    }
    if (dia !== 6 && !(hora >= 7 && hora < 19)) {
      return { puede: false, motivo: 'hora', es_cobranza: true,
               texto: 'De lunes a viernes solo se puede cobrar de 7 de la mañana a 7 de la noche.' };
    }

    /* EL TOPE POR PERSONA. Es por CONSUMIDOR y por SEMANA, y prohíbe además
       mezclar canales dentro de la misma semana (artículo 3). Acá solo se
       dispone del ÚLTIMO contacto —es lo que manda mi_cartera—, así que se
       comprueba lo que se puede comprobar y se dice con esas palabras. */
    var g = p.gestion || null;
    if (g && g.cuando) {
      var t = Date.parse(g.cuando);
      if (isFinite(t)) {
        var dias = (d.getTime() - t) / 86400000;
        if (dias < 1) {
          return { puede: false, motivo: 'hoy', es_cobranza: true,
                   texto: 'Ya lo contactaste hoy. La ley deja un contacto de cobro al día.' };
        }
        if (dias < 7) {
          var otroCanal = g.canal && o.canal && g.canal !== o.canal;
          return { puede: false, motivo: otroCanal ? 'otro_canal' : 'esta_semana',
                   es_cobranza: true,
                   texto: otroCanal
                     ? ('Esta semana ya se le escribió por ' + g.canal + '. Usar otro canal ' +
                        'en la misma semana es lo que prohíbe la Ley 2300.')
                     : ('Ya lo contactaste esta semana (hace ' + Math.floor(dias) +
                        (Math.floor(dias) === 1 ? ' día' : ' días') + '). La ley deja uno por semana.') };
        }
      }
    }

    return { puede: true, motivo: null, es_cobranza: true, texto: '' };
  }

  /* ---------------------------------------------------------- las plantillas */

  /* Por WhatsApp: acá las tildes y los emoji son gratis. Las de SMS viven en
     app/cobranza-envio.js y tienen otras reglas (160 caracteres, sin tildes).
     Tenerlas separadas NO es duplicar: son dos canales con dos costos. */
  var PLANTILLAS = {
    /* --- venta --- */
    presentacion: { grupo: 'Venta', et: 'Presentarme',
      texto: 'Hola {nombre}, soy {asesor} de Tu Garantía 🙂 Te escribo para contarte ' +
             'cómo funciona nuestro crédito. ¿Tienes un minuto?' },
    invitar_app: { grupo: 'Venta', et: 'Que abra su cuenta',
      texto: 'Hola {nombre} 🙂 Soy {asesor}, de Tu Garantía. Puedes abrir tu cuenta ' +
             'desde el celular en un par de minutos: {enlace}\n\nSi te enredas, ' +
             'me escribes y te acompaño.' },
    seguimiento: { grupo: 'Venta', et: 'Hacer seguimiento',
      texto: 'Hola {nombre}, soy {asesor} de Tu Garantía. ¿Pudiste pensar en lo que ' +
             'hablamos? Cualquier duda te la resuelvo por aquí.' },
    /* --- cobranza --- */
    recordar: { grupo: 'Cobranza', et: 'Recordarle el pago',
      texto: 'Hola {nombre} 🙂 Soy {asesor}, de Tu Garantía. Te recuerdo tu pago. ' +
             'Si necesitas organizarlo de otra forma, me cuentas y lo vemos.' },
    vence_hoy: { grupo: 'Cobranza', et: 'Le vence hoy',
      texto: 'Hola {nombre}, soy {asesor} de Tu Garantía. Hoy es tu fecha de pago. ' +
             'Si ya pagaste, no te preocupes por este mensaje. Si necesitas más ' +
             'plazo, escríbeme y lo organizamos.' },
    acuerdo: { grupo: 'Cobranza', et: 'Buscar un acuerdo',
      texto: 'Hola {nombre}, soy {asesor} de Tu Garantía. Tu pago quedó pendiente y ' +
             'quiero ayudarte a resolverlo. Cuéntame cómo estás y buscamos algo que ' +
             'te sirva.' },
    /* --- servicio --- */
    confirmar_pago: { grupo: 'Servicio', et: 'Confirmarle que pagó',
      /* Decía «¡Listo María! Ya quedó registrado tu pago» sin nombrar a nadie.
         Lo cazó la prueba: un mensaje de un número desconocido confirmando un
         pago que uno hizo es exactamente la forma de una estafa. */
      texto: '¡Listo {nombre}! Soy {asesor}, de Tu Garantía: ya quedó registrado ' +
             'tu pago. Gracias por cumplir 🙂 Cuando necesites, aquí estamos.' },
    reagendar: { grupo: 'Servicio', et: 'Reagendar',
      texto: 'Hola {nombre}, soy {asesor} de Tu Garantía. ¿Te queda mejor que ' +
             'hablemos más tarde? Dime a qué hora te llamo.' }
  };

  var ORDEN = ['presentacion', 'invitar_app', 'seguimiento',
               'recordar', 'vence_hoy', 'acuerdo',
               'confirmar_pago', 'reagendar'];

  /**
   * Cuál plantilla proponer para esta persona. Se PROPONE, no se impone: el
   * asesor la cambia y edita el texto antes de mandar.
   */
  function plantillaSugerida(etapa) {
    var e = String(etapa || '');
    if (e === 'PC') return 'presentacion';
    if (e === 'CR') return 'invitar_app';
    if (e === 'PAGADO') return 'confirmar_pago';
    if (e === 'D0') return 'vence_hoy';
    if (e === 'D-1' || e === 'D-2' || e === 'D-3') return 'recordar';
    if (e === 'CA') return 'seguimiento';
    return 'acuerdo';   // las moras
  }

  /** Las plantillas que tienen sentido para esta etapa, primero la sugerida. */
  function plantillasPara(etapa) {
    var sug = plantillaSugerida(etapa);
    var resto = ORDEN.filter(function (k) { return k !== sug; });
    return [sug].concat(resto);
  }

  function armar(clave, datos) {
    var p = PLANTILLAS[clave] || PLANTILLAS.presentacion;
    var d = datos || {};
    return String(p.texto).replace(/\{(\w+)\}/g, function (todo, k) {
      return Object.prototype.hasOwnProperty.call(d, k) ? String(d[k] == null ? '' : d[k]) : todo;
    });
  }

  return {
    ETAPAS_DE_VENTA: ETAPAS_DE_VENTA,
    esCobranza: esCobranza,
    puedeContactar: puedeContactar,
    PLANTILLAS: PLANTILLAS,
    ORDEN: ORDEN,
    plantillaSugerida: plantillaSugerida,
    plantillasPara: plantillasPara,
    armar: armar
  };
}));
