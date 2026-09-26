/* ============================================================================
 * EL PROVEEDOR DE PAGOS DE PLATACHAT — 14 de septiembre de 2026
 *
 * La pieza intercambiable del plan (PLAN-PLATACHAT.md §2.4 punto 2 y §4.2):
 * PlataChat no sabe CÓMO se mueve la plata; le pregunta a este archivo. Hoy la
 * respuesta es «a mano»; mañana puede ser TumiPay. Lo que no cambia es que el
 * reparto (app/platachat-reglas.js) lee de aquí el gasto REAL de cada
 * movimiento, sea cual sea el proveedor, y lo descuenta ANTES de calcular la
 * garantía del cliente: gastos primero, del neto tres cuartas partes para su
 * garantía y una cuarta para la app (§2.3, decisión 4a de Joan).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ HOY ES «MANUAL» Y EL GASTO ES CERO
 *
 * Joan desembolsa por Nequi y el cliente devuelve por Nequi o transferencia.
 * Eso le toma dos minutos y no cuesta un peso. En su segmento —créditos de
 * 100.000— automatizarlo con TumiPay costaría entre cinco y seis pesos de cada
 * cien prestados (plan §2.2): 20 créditos al mes serían unos 106.000 pesos
 * mensuales por ahorrarse unos 100 minutos de Nequi. Con esa cuenta, encender
 * TumiPay solo se paga sola cuando una hora de Joan valga más de 64.000 pesos.
 * Por eso nace `manual` y `PROVEEDOR_ACTIVO` se queda ahí (decisión 2a).
 *
 * ---------------------------------------------------------------------------
 * QUIÉN ES TUMIPAY Y POR QUÉ SE ENCIENDE SOLO CON CONTRATO FIRMADO (FASE 3)
 *
 * TUMIPAY S.A.S. (NIT 901.228.648-0) es la única pasarela colombiana que acepta
 * prestamistas a la vista —PayU, Wompi y ePayco lo prohíben o lo restringen—,
 * así que si algún día hay proveedor automático, es este. Pero al 14-sep-2026:
 *
 *   · NO es vigilada: ni SEDPE ni inscrita en el Registro de Adquirentes No
 *     Vigilados, y la Superfinanciera dice por concepto que no inspecciona
 *     pasarelas.
 *   · Sus tarifas NO son públicas. Las que Joan tiene de palabra —1,5 % más 700
 *     por cada recaudo (payin) y 2.800 por cada giro (payout)— no aparecen en
 *     ningún documento suyo, sus términos las declaran modificables «en
 *     cualquier momento», y NO se sabe si llevan IVA del 19 % (todas las
 *     pasarelas comparables lo cobran sobre la comisión). Por eso las funciones
 *     de este archivo reciben `conIva` como opción en vez de decidirlo solas.
 *   · La plata de los comercios reposa DENTRO de TumiPay («current wallet
 *     balance»), sin que ningún texto público diga quién la custodia, con
 *     retiros de hasta 15 días hábiles y bloqueos «sin previo aviso».
 *
 * Antes de escribir una sola línea que mueva plata por ahí, Joan tiene que
 * tener por escrito: tarifa con o sin IVA, qué retienen, si trasladan el
 * 4×1000, el certificado de existencia y representación, dónde reposan los
 * fondos y una cláusula de que el giro «crédito digital» está permitido en su
 * cuenta (plan §2.4 punto 3). Mientras eso no exista, `desembolsar` y
 * `recaudar` para tumipay contestan {ok:false, motivo} y NO fingen: la
 * interfaz no promete lo que el código no hace.
 *
 * ---------------------------------------------------------------------------
 * LAS DOS REGLAS DE LA CASA QUE ESTE ARCHIVO PROTEGE
 *
 * 1. NUNCA CUSTODIAR FONDOS. PlataChat no guarda saldo de nadie: ni del
 *    cliente ni de Joan. Aquí no hay «billetera», ni «saldo», ni «cargar
 *    balance». Cuando entre TumiPay, la plata que repose en SU billetera es un
 *    riesgo del contrato, no una función de esta app. Custodiar exige licencia
 *    SEDPE y vigilancia de la Superfinanciera.
 *
 * 2. NUNCA COBRARLE EL GASTO AL CLIENTE. La Ley 45 de 1990, artículo 68,
 *    reputa INTERESES todo cobro que se le haga al deudor «aun cuando las
 *    mismas se justifiquen por concepto de honorarios, comisiones u otros
 *    semejantes». Un renglón «gastos de pago» en la cuenta del cliente es
 *    interés y entra en el cálculo de la usura. Por eso en este archivo no
 *    hay una sola función que toque el precio de un crédito: el gasto sale del
 *    costo que Joan cobra (y baja la garantía que el cliente gana, en pesos,
 *    dicho en la app), jamás se le suma a lo que paga. Misma doctrina que
 *    app/comisiones.js.
 *
 * ---------------------------------------------------------------------------
 * EL CONTRATO DE ESTE ARCHIVO, igual que motor.js, puente.js y comisiones.js:
 * funciones PURAS. Sin fetch, sin credenciales, sin localStorage, sin document
 * y sin `new Date()` — ni siquiera los métodos «de proveedor» hacen red: hoy
 * devuelven promesas ya resueltas para que la página pueda esperarlas igual
 * que esperará las de verdad en la fase 3, sin cambiar una línea del llamador.
 *
 * Dos decisiones de cálculo que conviene saber antes de comparar cifras:
 *
 *   · Un crédito que se devuelve en VARIOS recaudos (prórroga, plan de pagos)
 *     paga el fijo de 700 en cada uno y el 1,5 % sobre lo que trae CADA uno;
 *     el giro de 2.800 se descuenta una sola vez. `gastoCredito` reparte lo
 *     recaudado en `payins` partes iguales; cuando el CRM tenga los movimientos
 *     reales, que sume `gastoMovimiento` movimiento a movimiento, que es como
 *     llega la factura.
 *   · El IVA se aplica UNA vez sobre el total del crédito, redondeado, para
 *     coincidir peso a peso con PlataChatReglas.gastoTumiPay (que hace
 *     «×1,19 redondeado»). Movimiento a movimiento puede diferir en un peso por
 *     el redondeo; es aceptable y está probado.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PagosProveedor = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '2026-09-14';

  /* Se queda en 'manual' hasta que Joan firme con TumiPay (decisión 2a). No se
     cambia por variable de entorno ni por parámetro: el día que cambie tiene
     que ser un commit que se vea. */
  var PROVEEDOR_ACTIVO = 'manual';

  var PROVEEDORES = {
    manual: {
      nombre: 'Nequi / transferencia a mano',
      automatico: false,
      /* Sin contrato que firmar: es Joan con su celular. */
      listo: true
    },
    tumipay: {
      nombre: 'TumiPay',
      automatico: true,
      /* Se vuelve true en la fase 3, con el contrato y las credenciales en la
         Edge Function (nunca en este archivo: todo lo del cliente es público). */
      listo: false
    }
  };

  /* Las tarifas con las que Joan cuenta, de palabra, al 14-sep-2026. Misma
     tabla que PlataChatReglas.TARIFA_TUMIPAY; la prueba vigila que no se
     separen. Fracciones sobre 1 (0.015 = 1,5 %), pesos en enteros. */
  var TARIFAS = {
    manual:  { payout_fijo: 0,    payin_pct: 0,     payin_fijo: 0,   iva: 0 },
    tumipay: { payout_fijo: 2800, payin_pct: 0.015, payin_fijo: 700, iva: 0.19 }
  };

  var TIPOS_MOVIMIENTO = ['payin', 'payout'];

  var MOTIVO_TUMIPAY_APAGADO =
    'TumiPay no está configurado: falta el contrato y las credenciales (fase 3)';

  /* ------------------------------------------------------------ utilidades */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function nombres() { return Object.keys(PROVEEDORES); }

  /* En pesos con punto de miles, sin depender del locale del aparato: un
     toLocaleString sin ICU en un Android viejo pinta «5525» y el texto deja de
     coincidir con el de la prueba. */
  function pesos(n) {
    var v = Math.round(Math.abs(num(n)));
    var s = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (num(n) < 0 ? '-$' : '$') + s;
  }

  function proveedorValido(nombre) {
    return Object.prototype.hasOwnProperty.call(PROVEEDORES, texto(nombre));
  }

  /* Un proveedor mal escrito no puede degradar en silencio a «gasto cero»: eso
     sería regalar la garantía calculada con un gasto que sí existió. Se
     revienta con nombre y lista, y la prueba lo exige. */
  function exigir(nombre) {
    var p = texto(nombre);
    if (!proveedorValido(p)) {
      throw new Error('Proveedor de pagos desconocido: «' + p + '». Los que existen: ' +
                      nombres().join(', ') + '.');
    }
    return p;
  }

  function esManual(proveedor) { return exigir(proveedor) === 'manual'; }

  /* ==========================================================================
   * TARIFAS: una copia, nunca la tabla. Quien la reciba puede tocarla sin
   * cambiarle el precio al siguiente que pregunte.
   * ======================================================================== */
  function tarifas(proveedor) {
    var t = TARIFAS[exigir(proveedor)];
    return { payout_fijo: t.payout_fijo, payin_pct: t.payin_pct,
             payin_fijo: t.payin_fijo, iva: t.iva };
  }

  function conIvaSi(bruto, tarifa, conIva) {
    return conIva ? Math.round(bruto * (1 + tarifa.iva)) : bruto;
  }

  /* ==========================================================================
   * EL GASTO DE UN MOVIMIENTO
   *
   * payout = el giro al cliente (desembolso): fijo por giro.
   * payin  = un recaudo del cliente: fracción de lo que trae más un fijo.
   *
   * Un movimiento de cero pesos no existe y por tanto no cuesta: así una
   * pantalla que todavía no sabe el monto no pinta «700» de la nada.
   * ======================================================================== */
  function gastoMovimiento(proveedor, tipo, monto, opciones) {
    var t = tarifas(proveedor);
    var tp = texto(tipo);
    if (TIPOS_MOVIMIENTO.indexOf(tp) < 0) {
      throw new Error('Tipo de movimiento desconocido: «' + tp + '». Solo ' +
                      TIPOS_MOVIMIENTO.join(' | ') + '.');
    }
    var m = num(monto);
    if (m <= 0) return 0;
    var o = opciones || {};
    var bruto = tp === 'payout'
      ? t.payout_fijo
      : Math.round(t.payin_pct * m) + t.payin_fijo;
    return conIvaSi(bruto, t, !!o.conIva);
  }

  /* ==========================================================================
   * EL GASTO DE UN CRÉDITO ENTERO: un giro más los recaudos de capital + costo
   *
   * payins = en cuántos recaudos devuelve el cliente. 1 por defecto (paga todo
   * en fecha); 0 significa «desembolsado y todavía sin cobrar» —el giro ya se
   * pagó aunque no haya entrado un peso—; más de 1, prórroga o plan de pagos.
   * ======================================================================== */
  function gastoCredito(proveedor, capital, costo, opciones) {
    var t = tarifas(proveedor);
    var o = opciones || {};
    var cap = Math.max(0, num(capital));
    var cos = Math.max(0, num(costo));
    var n = o.payins === undefined || o.payins === null ? 1 : Math.floor(num(o.payins));
    if (n < 0) n = 1;

    var bruto = cap > 0 ? t.payout_fijo : 0;
    var recaudado = cap + cos;
    if (n > 0 && recaudado > 0) {
      var parte = recaudado / n;
      for (var i = 0; i < n; i++) bruto += Math.round(t.payin_pct * parte) + t.payin_fijo;
    }
    return conIvaSi(bruto, t, !!o.conIva);
  }

  /* ==========================================================================
   * MOVER LA PLATA
   *
   * Promesas ya resueltas, sin red. Para `manual` devuelven las instrucciones
   * de lo que Joan (o el cliente) hace con el celular; para `tumipay`, la
   * verdad: no está configurado. Un proveedor desconocido tampoco revienta la
   * promesa —el llamador ya está en un flujo asíncrono y merece un {ok:false}
   * que pueda pintar—.
   * ======================================================================== */
  function ordenDe(orden) {
    var o = orden || {};
    return { monto: Math.max(0, num(o.monto)), destino: texto(o.destino),
             referencia: texto(o.referencia) };
  }

  function respuestaApagada(p) {
    if (!proveedorValido(p)) {
      return { ok: false, proveedor: texto(p),
               motivo: 'Proveedor de pagos desconocido: «' + texto(p) + '».' };
    }
    return { ok: false, proveedor: p, motivo: MOTIVO_TUMIPAY_APAGADO };
  }

  function desembolsar(proveedor, orden) {
    var p = texto(proveedor);
    if (p !== 'manual') return Promise.resolve(respuestaApagada(p));
    var o = ordenDe(orden);
    return Promise.resolve({
      ok: true, manual: true, proveedor: 'manual', gasto: 0,
      instrucciones: 'Gira ' + pesos(o.monto) + ' por Nequi o transferencia' +
        (o.destino ? ' a ' + o.destino : ' al cliente') +
        (o.referencia ? ' (' + o.referencia + ')' : '') +
        ' y anota el desembolso en el CRM. Gasto del movimiento: ' + pesos(0) + '.'
    });
  }

  function recaudar(proveedor, orden) {
    var p = texto(proveedor);
    if (p !== 'manual') return Promise.resolve(respuestaApagada(p));
    var o = ordenDe(orden);
    return Promise.resolve({
      ok: true, manual: true, proveedor: 'manual', gasto: 0,
      instrucciones: 'El cliente paga ' + pesos(o.monto) + ' por Nequi o transferencia' +
        (o.referencia ? ' (' + o.referencia + ')' : '') +
        ' y manda el comprobante por el chat; anótalo en el CRM. Gasto del movimiento: ' +
        pesos(0) + '.'
    });
  }

  /* ==========================================================================
   * LO QUE SE LE DICE AL CLIENTE
   *
   * En pesos y con palabras, nunca con un número seguido de «%»: es la regla
   * del centinela «el socio no ve porcentajes» (pruebas/motor.test.js) y de
   * platachat/. El 1,5 % se dice «quince pesos por cada mil». Si vienen capital
   * y costo, se le da además la cifra de SU crédito, que es lo que entiende.
   * ======================================================================== */
  function descripcionParaElCliente(proveedor, opciones) {
    var p = exigir(proveedor);
    var o = opciones || {};
    if (p === 'manual') return 'Sin gastos de pago: recibes y pagas por Nequi o transferencia';

    var t = tarifas(p);
    var conIva = !!o.conIva;
    var giro = conIvaSi(t.payout_fijo, t, conIva);
    var fijo = conIvaSi(t.payin_fijo, t, conIva);
    var porMil = conIvaSi(Math.round(t.payin_pct * 1000), t, conIva);
    var s = 'Pagar por ' + PROVEEDORES[p].nombre + ' tiene un gasto: ' + pesos(giro) +
      ' cuando recibes tu plata y, cuando la devuelves, ' + pesos(fijo) + ' más ' +
      pesos(porMil) + ' por cada ' + pesos(1000) + '.' +
      ' No se te cobra aparte: sale del costo del crédito antes de calcular tu garantía.';
    var cap = num(o.capital), cos = num(o.costo);
    if (cap > 0 && cos >= 0) {
      var g = gastoCredito(p, cap, cos, { conIva: conIva, payins: o.payins });
      s += ' Para un crédito de ' + pesos(cap) + ' que devuelves en ' + pesos(cap + cos) +
           ', el gasto es ' + pesos(g) + '.';
    }
    return s;
  }

  return {
    VERSION: VERSION,
    PROVEEDOR_ACTIVO: PROVEEDOR_ACTIVO,
    PROVEEDORES: PROVEEDORES,
    TARIFAS: TARIFAS,
    TIPOS_MOVIMIENTO: TIPOS_MOVIMIENTO,
    MOTIVO_TUMIPAY_APAGADO: MOTIVO_TUMIPAY_APAGADO,
    proveedorValido: proveedorValido,
    esManual: esManual,
    tarifas: tarifas,
    gastoMovimiento: gastoMovimiento,
    gastoCredito: gastoCredito,
    desembolsar: desembolsar,
    recaudar: recaudar,
    descripcionParaElCliente: descripcionParaElCliente,
    pesos: pesos
  };
});
