/* ============================================================================
 * LAS ETAPAS DEL CLIENTE — 10 de septiembre de 2026
 *
 * Joan: «quiero que el rol de asesor pueda ver sus bases segmentadas como
 * potenciales clientes (PC) y que cuando se registren se conviertan en clientes
 * registrados (CR) y cuando sean clientes con crédito en clientes activos (CA)…
 * cuando lleguen al 5 día el cliente ingrese a la cartera D-3 para recibir
 * recordatorios hasta llegar a la cartera D-1 que es el día 7 un día antes del
 * día de pago que se llama D0… después está la cartera M1A que es de 1 a 5 días
 * en mora, aquí el asesor puede hacer descuento de intereses hasta el 80% y la
 * cartera M1B que es de 6 a 9 días… y la cartera M1-2 que es de 10 a 20 días de
 * mora. Esta es la última oportunidad antes de que el asesor tenga un descuento
 * de 10.000 pesos.»
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ SE CUENTA HACIA ATRÁS Y NO HACIA ADELANTE
 *
 * Joan describió «día 5 → D-3, día 7 → D-1, día 8 → D0». Esos números son de un
 * crédito de OCHO días —el del primer crédito del cliente nuevo—, no una regla
 * general: en un quincenal de quince, el D-3 cae en el día 12.
 *
 * Lo que no cambia nunca es la distancia AL DÍA DE PAGO. Así que D-3 es «tres
 * días antes del corte», y funciona igual para los dos productos y para
 * cualquiera que venga después. Si se contara desde el desembolso, cada cambio
 * de plazo obligaría a reescribir esta tabla — y el día que alguien olvidara
 * hacerlo, el asesor cobraría tarde sin que nadie se enterara.
 *
 * ---------------------------------------------------------------------------
 * EL CORTE SE LEE DE LA LÍNEA DE TIEMPO, NO DEL CAMPO DE HOY
 *
 * Una prórroga mueve el corte. Preguntar «¿en qué cartera está?» con el corte
 * de hoy contesta bien; preguntar «¿en qué cartera estaba el 20 de octubre?»
 * con el corte de hoy contesta MAL, y en silencio. Este archivo recibe SIEMPRE
 * la fecha por parámetro y se apoya en el puente, que ya sabe qué corte regía
 * en cada instante. Es la misma lección que costó once arreglos.
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTE ARCHIVO NO HACE: no decide, describe. No mueve plata, no aprueba
 * un descuento y no manda un mensaje. Devuelve en qué etapa está alguien y
 * hasta cuánto puede descontar quien lo atienda — la decisión de aplicarlo es
 * de otra pantalla, y el tope lo tiene que volver a comprobar quien escriba.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./puente.js'));
  else raiz.EtapasTuGarantia = fabrica(raiz.PuenteTuGarantia);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  function lista(v) { return Array.isArray(v) ? v : []; }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function dia(v) { return texto(v).slice(0, 10); }
  function diasEntre(a, b) {
    var x = new Date(dia(a) + 'T00:00:00'), y = new Date(dia(b) + 'T00:00:00');
    if (isNaN(x.getTime()) || isNaN(y.getTime())) return null;
    return Math.round((y - x) / 86400000);
  }

  /* --------------------------------------------------------------------------
   * LA TABLA. Cada etapa dice tres cosas: cómo se llama para el asesor, qué
   * tiene que hacer, y hasta cuánto puede descontar de intereses.
   *
   * `descuento` es el TOPE del asesor, no el de Joan. Joan puede perdonar el
   * 100% desde el 2-sep y eso no cambia; esto es cuánto puede soltar el asesor
   * sin preguntar. Está acá y no en la pantalla para que el asesor y el CRM
   * digan el mismo número — dos tablas con topes distintos es como se regala
   * plata sin que nadie lo note.
   * ------------------------------------------------------------------------ */
  var ETAPAS = {
    PC:    { et: 'PC',    nombre: 'Potencial cliente', color: 'gris',
             que: 'Todavía no se ha registrado. Contáctalo y ayúdalo a abrir su cuenta.', descuento: 0 },
    CR:    { et: 'CR',    nombre: 'Cliente registrado', color: 'azul',
             que: 'Ya abrió su cuenta y no ha pedido. Ayúdalo a pedir su primer crédito.', descuento: 0 },
    CA:    { et: 'CA',    nombre: 'Cliente activo', color: 'verde',
             que: 'Tiene crédito al día y todavía falta para el pago. Seguimiento normal.', descuento: 0 },
    'D-3': { et: 'D-3',   nombre: 'Recordatorio (3 días)', color: 'verde',
             que: 'Faltan tres días. Primer recordatorio, amable.', descuento: 0 },
    'D-2': { et: 'D-2',   nombre: 'Recordatorio (2 días)', color: 'verde',
             que: 'Faltan dos días. Confirma que tiene la plata lista.', descuento: 0 },
    'D-1': { et: 'D-1',   nombre: 'Víspera', color: 'ambar',
             que: 'Mañana paga. Confírmale el monto exacto y cómo paga.', descuento: 0 },
    D0:    { et: 'D0',    nombre: 'Día de pago', color: 'ambar',
             que: 'Hoy es el día. Se exige el pago.', descuento: 0 },
    M1A:   { et: 'M1A',   nombre: 'Mora 1 a 5 días', color: 'rojo',
             que: 'Primera mora. Puedes ofrecer hasta 80% de descuento en los intereses.', descuento: 80 },
    M1B:   { et: 'M1B',   nombre: 'Mora 6 a 9 días', color: 'rojo',
             que: 'Se está enfriando. Puedes ofrecer hasta el 100% de descuento en los intereses.', descuento: 100 },
    'M1-2': { et: 'M1-2', nombre: 'Mora 10 a 20 días', color: 'rojo',
             que: 'ÚLTIMA OPORTUNIDAD. Si llega a 20 días te descuentan $10.000.', descuento: 100 },
    M2:    { et: 'M2',    nombre: 'Mora de más de 20 días', color: 'rojo',
             que: 'Pasó los 20 días: el descuento de $10.000 ya se aplicó. Sigue cobrando.', descuento: 100 },
    PAGADO: { et: 'PAGADO', nombre: 'Pagó', color: 'verde',
             que: 'Cerró su crédito. Ofrécele el siguiente.', descuento: 0 }
  };

  var ORDEN = ['PC', 'CR', 'CA', 'D-3', 'D-2', 'D-1', 'D0', 'M1A', 'M1B', 'M1-2', 'M2', 'PAGADO'];

  /* --------------------------------------------------------------------------
   * ¿EN QUÉ CARTERA ESTÁ ESTE CRÉDITO, EL DÍA `hoy`?
   *
   * Devuelve la clave de ETAPAS. `null` si no hay corte con el que medir.
   * ------------------------------------------------------------------------ */
  function etapaDeCredito(p, hoyISO) {
    if (!p) return null;
    if (p.pagado) return 'PAGADO';
    var h = dia(hoyISO);
    if (!h) return null;
    /* El corte que REGÍA ese día, no el de hoy: una prórroga mueve el de hoy y
       la pregunta con fecha adentro se contestaría con el dato equivocado. */
    var corte = (P && typeof P.corteVigenteEn === 'function')
      ? dia(P.corteVigenteEn(p, h))
      : dia(p.cicloActual || p.cicloPago || p.fechaPago);
    if (!corte) return null;

    var d = diasEntre(corte, h);        // negativo antes del corte, positivo en mora
    if (d === null) return null;
    if (d < -3) return 'CA';
    if (d === -3) return 'D-3';
    if (d === -2) return 'D-2';
    if (d === -1) return 'D-1';
    if (d === 0) return 'D0';
    if (d <= 5) return 'M1A';
    if (d <= 9) return 'M1B';
    if (d <= 20) return 'M1-2';
    return 'M2';
  }

  /* --------------------------------------------------------------------------
   * LA ETAPA DE UNA PERSONA, sea prospecto o cliente
   *
   * @param quien  {tipo:'prospecto', ...} o {tipo:'socio', id, ...}
   * @param db     la cartera, para buscarle los créditos a un socio
   * @param hoyISO la fecha desde la que se pregunta (obligatoria)
   * ------------------------------------------------------------------------ */
  function etapaDe(quien, db, hoyISO) {
    var q = quien || {};
    var h = dia(hoyISO);

    /* Un prospecto que ya se registró deja de ser PC aunque siga en la lista:
       lo que manda es el hecho, no en qué tabla quedó guardado. */
    if (q.tipo === 'prospecto') {
      var e = texto(q.estado);
      if (e === 'cliente') return conCredito(q, db, h) || 'CR';
      if (e === 'registrado') return 'CR';
      return 'PC';
    }

    var conCred = conCredito(q, db, h);
    return conCred || 'CR';
  }

  /* El crédito que manda: el que está VIVO. Si hay varios (pasa), manda el que
     esté más atrás en la cobranza — es el que hay que atender hoy. Si no hay
     ninguno vivo pero sí pagados, la persona está al día. */
  function conCredito(q, db, h) {
    var suyos = lista(db && db.prestamos).filter(function (p) {
      return texto(p.socioId) === texto(q.id || q.socio_id);
    });
    if (!suyos.length) return null;
    var vivos = suyos.filter(function (p) { return !p.pagado; });
    if (!vivos.length) return 'PAGADO';
    var peor = null, peorPuesto = -1;
    vivos.forEach(function (p) {
      var e = etapaDeCredito(p, h);
      var puesto = ORDEN.indexOf(e);
      if (puesto > peorPuesto) { peorPuesto = puesto; peor = e; }
    });
    return peor;
  }

  /* Hasta cuánto puede descontar de intereses quien atiende, en esta etapa. */
  function descuentoMaximo(etapa) {
    var e = ETAPAS[etapa];
    return e ? e.descuento : 0;
  }

  /* Cuántos hay en cada cartera. Para el tablero del asesor y el del gerente:
     los dos tienen que contar IGUAL, y por eso cuentan acá. */
  function resumenDeCartera(gente, db, hoyISO) {
    var out = {};
    ORDEN.forEach(function (k) { out[k] = 0; });
    lista(gente).forEach(function (q) {
      var e = etapaDe(q, db, hoyISO);
      if (e && out[e] !== undefined) out[e]++;
    });
    return out;
  }

  /* Las que exigen que alguien haga algo HOY, en el orden en que hay que
     atenderlas: primero la que se va a perder. */
  var URGENTES = ['M1-2', 'M1B', 'M1A', 'D0', 'D-1'];

  return {
    VERSION: '2026-09-10',
    ETAPAS: ETAPAS,
    ORDEN: ORDEN,
    URGENTES: URGENTES,
    etapaDe: etapaDe,
    etapaDeCredito: etapaDeCredito,
    descuentoMaximo: descuentoMaximo,
    resumenDeCartera: resumenDeCartera
  };
});
