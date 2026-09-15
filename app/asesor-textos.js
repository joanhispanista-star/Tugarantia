/* ===========================================================================
 * LO QUE EL ASESOR LEE — Tu Garantía
 * 15 de septiembre de 2026.
 *
 * Joan lo pidió así: «que tenga mensajes motivacionales como, crece con
 * tugarantia y crea una base solida de clientes para que tengas una base solida
 * de ingresos» y «que le muestre la tabla de comisiones de ellos en ventas y
 * cobranzas con las reglas claras».
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTO ES UN MÓDULO Y NO TEXTO SUELTO EN LA PANTALLA
 *
 * Las cifras de la comisión NO se escriben acá. Se leen de app/comisiones.js,
 * que es donde viven de verdad y donde se calculan los pagos. Este archivo solo
 * las PONE EN PALABRAS.
 *
 * Si las cifras se escribieran dos veces, el día que Joan suba la comisión de
 * desembolso, la tabla que el asesor lee seguiría prometiendo la vieja — y un
 * asesor que trabaja contra una tabla equivocada no es un defecto de pantalla,
 * es una discusión de plata al fin de mes.
 *
 * Hay una prueba que compara, cifra por cifra, lo que dice esta tabla contra lo
 * que paga el motor.
 *
 * ---------------------------------------------------------------------------
 * LOS MENSAJES NO PROMETEN PLATA
 *
 * «Gana $2.000.000 al mes» sería una promesa de ingreso a alguien que trabaja a
 * comisión, y eso no se puede sostener: depende de cuánta gente pague. Los
 * mensajes hablan de lo que el asesor SÍ controla —a cuánta gente llama, a
 * cuántos les hace seguimiento— y de la cuenta que de verdad importa, que es que
 * una base que paga vale más que una base grande.
 * ========================================================================= */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(
    typeof require === 'function' ? require('./comisiones.js') : null);
  else raiz.AsesorTextos = fabrica(raiz.ComisionesTuGarantia);
}(typeof self !== 'undefined' ? self : this, function (COMIS) {
  'use strict';

  function cop(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  /**
   * La tabla de comisiones, en palabras, con las cifras que de verdad se pagan.
   *
   * @param [fechaISO]  para leer la tarifa vigente ese día (las tarifas tienen
   *                    fecha «desde»: una subida no toca lo ya ganado).
   */
  function tablaComisiones(fechaISO) {
    if (!COMIS || !COMIS.tarifaEn) return null;
    var t = COMIS.tarifaEn(fechaISO || '2026-09-09');

    return {
      vigente_desde: t.desde,
      /* VENTA: lo que se gana por traer y colocar. */
      venta: [
        { id: 'registro', titulo: 'Se registró por ti',
          monto: t.registro, bloqueado: true,
          cuando: 'Cuando la persona abre su cuenta y queda asignada a ti.',
          ojo: 'Se te anota de una, pero NO lo puedes cobrar hasta que esa persona pague su primer crédito.' },
        { id: 'desembolso', titulo: 'Le desembolsaron el primero',
          monto: t.desembolso, bloqueado: true,
          cuando: 'Cuando Joan le entrega la plata de su primer crédito.',
          ojo: 'Igual que el anterior: se ve desde el primer día, se cobra cuando el cliente paga.' },
        { id: 'recurrencia', titulo: 'Volvió a pedir',
          monto: t.recurrencia, bloqueado: false,
          cuando: 'Por cada crédito que ese mismo cliente tome después del primero.',
          ojo: 'Este no nace bloqueado: el cliente ya demostró que paga.' }
      ],
      /* COBRANZA: lo que se gana —y lo que se pierde— por que la plata vuelva. */
      cobranza: [
        { id: 'pago', titulo: 'Pagó su primer crédito',
          monto: t.pago, bloqueado: false,
          cuando: 'Cuando el cliente paga.',
          ojo: 'Y este es el que DESBLOQUEA los dos de arriba. Es la comisión más importante de todas: sin ella, las otras dos se quedan anotadas y no se pagan.' },
        { id: 'castigo', titulo: 'Se te fue a mora',
          monto: -Math.abs(t.castigo), bloqueado: false,
          cuando: 'Si un crédito tuyo llega a ' + t.dias_castigo + ' días sin pagar.',
          ojo: 'Se RESTA. No es un castigo por castigar: un crédito en mora le cuesta plata a la casa, y el seguimiento es justo tu trabajo.' }
      ],
      /* La frase que resume por qué el esquema está armado así. */
      la_regla_de_oro:
        'Traer clientes te anota comisiones. Que PAGUEN es lo que te las cobra. ' +
        'Por eso ' + cop(t.registro + t.desembolso) + ' de cada cliente nuevo se quedan ' +
        'esperando hasta que él pague: la casa y tú ganamos en el mismo momento, no antes.'
    };
  }

  /**
   * El punto de equilibrio, explicado.
   * Por debajo de cierto capital, un cliente nuevo le cuesta plata a la casa.
   * El asesor tiene que saberlo: le dice qué tamaño de crédito buscar.
   */
  function explicarEquilibrio(tasaCostoPct, fechaISO) {
    if (!COMIS || !COMIS.puntoDeEquilibrio) return null;
    var t = COMIS.tarifaEn(fechaISO || '2026-09-09');
    var minimo = COMIS.puntoDeEquilibrio(tasaCostoPct, t);
    if (!isFinite(minimo)) return null;
    return {
      minimo: minimo,
      cuesta: COMIS.primerCicloCuesta(t),
      texto: 'Tu primer ciclo con un cliente nuevo le cuesta ' + cop(COMIS.primerCicloCuesta(t)) +
        ' a la casa (' + cop(t.registro) + ' + ' + cop(t.desembolso) + ' + ' + cop(t.pago) + '). ' +
        'Con un costo del ' + tasaCostoPct + '%, ese cliente empieza a dejar ganancia desde ' +
        cop(minimo) + '. Por debajo de ahí la casa pierde, así que apunta a créditos de ' +
        cop(minimo) + ' para arriba.'
    };
  }

  /* ------------------------------------------------------------ los mensajes */

  /* Ninguno promete una cifra de ingreso. Todos hablan de lo que el asesor
     controla: a cuánta gente llama, a cuántos les hace seguimiento, y cuántos
     de los suyos pagan. */
  var MENSAJES = [
    { id: 'base_solida',
      texto: 'Crece con Tu Garantía: una base sólida de clientes es una base sólida de ingresos.',
      pie: 'No es cuántos traes. Es cuántos pagan.' },
    { id: 'el_que_paga',
      texto: 'El cliente que paga te paga dos veces: su comisión, y la que tenía bloqueada.',
      pie: 'Por eso el seguimiento vale más que la siguiente llamada en frío.' },
    { id: 'seguimiento',
      texto: 'Un cliente al que llamaste ayer no es lo mismo que uno al que llamaste hace un mes.',
      pie: 'Tu agenda es tu sueldo.' },
    { id: 'la_mora',
      texto: 'La mora no se arregla el día veinte. Se evita el día tres.',
      pie: 'Una llamada a tiempo cuesta un minuto.' },
    { id: 'confianza',
      texto: 'Aquí no vendemos plata: abrimos cupo a gente que va a volver.',
      pie: 'El que vuelve ya no hay que convencerlo.' },
    { id: 'tu_base',
      texto: 'Tu base es tuya. La construyes una llamada a la vez y te acompaña todos los meses.',
      pie: 'Empieza por los que ya te contestaron.' }
  ];

  /**
   * El mensaje del día. Rota por FECHA, no al azar: si cambiara en cada
   * repintado, la pantalla parecería inquieta y nadie lo leería. Con la fecha,
   * el asesor ve el mismo todo el día y uno nuevo mañana.
   */
  function mensajeDelDia(fechaISO) {
    var f = String(fechaISO || '').slice(0, 10).replace(/\D/g, '');
    var n = Number(f) || 0;
    return MENSAJES[n % MENSAJES.length];
  }

  return {
    MENSAJES: MENSAJES,
    mensajeDelDia: mensajeDelDia,
    tablaComisiones: tablaComisiones,
    explicarEquilibrio: explicarEquilibrio
  };
}));
