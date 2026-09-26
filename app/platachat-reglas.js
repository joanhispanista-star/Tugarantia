/* ============================================================================
 * LAS REGLAS DE PLATACHAT — nació el 14 de septiembre de 2026; cada sección
 * lleva su fecha (la cabecera ya se había quedado vieja con las secciones 6
 * y 7 del 15-sep-2026, por eso la fecha vive en cada sección y no acá).
 *
 * PlataChat es la segunda marca de Tu Garantía: mismo motor (app/motor.js),
 * misma base, mismo CRM. Lo que cambia es que el crédito se negocia dentro
 * del chat y que el pago puede pasar por un proveedor que COBRA (TumiPay) en
 * vez de por Nequi a mano. Este archivo tiene las cuentas que el motor no sabe
 * hacer, porque el motor nació cuando cobrar no costaba nada:
 *
 *   1. EL REPARTO CON GASTOS REALES ............... repartir
 *   2. LO QUE COBRA EL PROVEEDOR .................. gastoTumiPay, gastoManual
 *   3. LA TASA SEGÚN EL CUPO ...................... tasaPorCupo
 *   4. LA ESCALERA CON EL GASTO ADENTRO ........... escalera, creditosHasta
 *   5. LA PILA DE PLATA Y LAS FRASES EN PESOS ..... monedas, garantiaEnPalabras
 *   6. LOS CORTES HASTA UNA FECHA ................. cortesDesde, cortesHasta
 *   7. QUIÉN PROPONE Y LA HORA LÍMITE EN PALABRAS . quienPropone, horaLimiteEnPalabras
 *
 * ---------------------------------------------------------------------------
 * EL REPARTO, EN ESTE ORDEN (PLAN-PLATACHAT.md §2.3, decisión 4a):
 *
 *   gastos tecnológicos = lo que DE VERDAD cobró el proveedor por este
 *                         movimiento (Nequi a mano: 0; TumiPay: payout +
 *                         payin + IVA si aplica)
 *   neto                = costo cobrado − gastos
 *   garantía del socio  = cuatro quintas partes del neto (0,80), pague cuando
 *                         pague. 23-sep-2026, decisión de Joan para Tu Garantía
 *                         y por lo tanto para PlataChat, que usa el mismo motor:
 *                         «de esas ganancias un 80% va para sumarle a la
 *                         garantía del cliente y el 20% para la empresa».
 *                         La mora NO entra aquí: va entera a la empresa, y
 *                         `costo` es siempre el costo pactado, nunca la mora.
 *   ganancia de la app  = la quinta parte que queda (el cupón de bienvenida
 *                         ya no se amortiza: sale de esta parte)
 *
 * POR QUÉ LOS GASTOS SALEN PRIMERO Y EN PESOS, NO COMO UN PORCENTAJE.
 * El «10 % de gastos tecnológicos» del reparto 75/10/15 de Tu Garantía no
 * cubre a TumiPay en el segmento de Joan: en un crédito de 100.000 al 20 %
 * TumiPay cobra 5.300, que es el 26,5 % del costo; en uno de 50.000, el 44 %.
 * Un porcentaje fijo mentiría por defecto en los créditos chicos y por exceso
 * en los grandes. El gasto es un hecho en pesos —lo que dijo Joan: «son gastos
 * tecnológicos y no cuentan como ganancias»— y se descuenta como tal, antes
 * de repartir. Es la doctrina de RECETA-COBRO.md: se reparte la plata que
 * ENTRÓ.
 *
 * POR QUÉ LA GARANTÍA SALE DEL NETO Y NO DEL COSTO ENTERO.
 * Si la garantía fuera cuatro quintas partes del costo entero, el crédito de
 * 100.000 al 20 % con TumiPay le dejaría a Joan −1.300 pesos, y el de 50.000,
 * −2.400 (recalculado el 26-sep-2026 con el 80/20; con el 75/25 de antes eran
 * −300 y −1.900, anexo A del plan, modelo C). Con la garantía sobre el neto
 * el crédito nunca queda en negativo y la exposición de Joan no crece por
 * culpa del proveedor. El precio es una promesa DISTINTA a la de Tu Garantía:
 * allá el socio se queda con «cuatro quintas partes del costo»; en PlataChat,
 * con «cuatro quintas partes de lo que queda después de los gastos del pago».
 * Hoy, con el proveedor manual y gasto cero, las dos promesas dan lo mismo
 * peso a peso, y hay una prueba que lo exige.
 * Hay que decirlo así en la app y en los términos, en pesos, nunca en
 * porcentaje: el centinela «el socio no ve porcentajes» de pruebas/motor.test.js
 * se extiende a platachat/. Por eso garantiaEnPalabras no escribe un solo %.
 *
 * POR QUÉ NUNCA SE LE COBRA AL CLIENTE APARTE (Ley 45 de 1990, art. 68).
 * La ley reputa INTERESES los cobros que se le hacen al deudor «aun cuando las
 * mismas se justifiquen por concepto de honorarios, comisiones u otros
 * semejantes». Un renglón «gastos tecnológicos» en la cuenta del cliente es
 * interés y entra en la usura. Así que el gasto sale del margen de Joan o no
 * sale: en este archivo no hay una sola función que toque lo que el cliente
 * paga —costo sigue siendo round(capital × tasa) como en el motor— y cuando
 * el gasto es MÁS que el costo (créditos chicos), el sobrante se llama
 * `descubierto` y lo pone Joan, no el cliente.
 *
 * CON PROVEEDOR MANUAL COINCIDE PESO A PESO CON EL MOTOR DE HOY.
 * Con gasto 0, neto = costo y garantía = round(0,75 × costo), que es exactamente
 * MotorReglas.acumularGarantia(costo, true). Y la escalera con gasto 0 y tasa
 * 0,20 reproduce la de Tu Garantía: 7 créditos para volver a pedir 100.000
 * después del primero al 35 % con la ficha mínima (cupón 20.000). Con TumiPay
 * son 11 (13 con IVA). pruebas/platachat-reglas.test.js comprueba las tres
 * cosas con el motor cargado, celda por celda contra el anexo A del plan.
 *
 * POR QUÉ LA ESCALERA NO SALE DE proyectarCrecimiento DEL MOTOR.
 * Esa función está clavada al 15 % del capital (0,20 × 0,75) en un solo
 * redondeo y no sabe de gastos: con TumiPay prometería entre 4 y 6 créditos
 * de menos, y eso es «la interfaz promete lo que el código no cumple». Acá
 * cada peldaño paga costo = round(capital × tasa), le resta el gasto real de
 * ESE crédito y suma round(0,75 × neto): dos redondeos, sí, pero son los dos
 * pesos que el cliente de verdad paga y de verdad le abonan.
 *
 * ---------------------------------------------------------------------------
 * LOS VALORES ESTÁN ESCRITOS AQUÍ, NO LEÍDOS DEL MOTOR, A PROPÓSITO.
 * FACTOR_GARANTIA, FACTOR_TARDE, TASA_ESTANDAR, TASA_NUEVO y TOPE_NUEVO son
 * copias de lo que hoy dice app/motor.js. Podrían leerse de allá, pero un
 * cambio de reparto en el motor NO debe arrastrar a PlataChat en silencio: la
 * promesa de PlataChat está escrita en pesos en sus términos y cambiarla es
 * una decisión de Joan en los dos lados, no un efecto secundario. La prueba
 * «las constantes son las del motor» revienta el día que se desincronicen, y
 * eso es lo que se quiere: un aviso, no un arrastre.
 *
 * TASA_SOBRE_CUPO (0,25) se exporta pero tasaPorCupo NO la cotiza: decisión
 * 7a del plan —por encima del cupo no se cotiza solo, lo revisa Joan— porque
 * esa fila reintroduce exposición por encima de la garantía. Queda a mano para
 * el CRM el día que Joan apruebe uno.
 *
 * ---------------------------------------------------------------------------
 * EL CONTRATO DE ESTE ARCHIVO, igual que comisiones.js, puente.js y tanda.js:
 * funciones PURAS. Sin almacenamiento del navegador, sin DOM, sin llamadas a
 * la red, y sin leer la hora del sistema —la fecha, cuando haga falta, entra
 * por parámetro. Es la lección del commit 36209a9: una función que lee el reloj
 * de pared contesta distinto según el día en que se le pregunte, y entonces no
 * se puede probar ni auditar. Cargable en Node (require) y en el navegador
 * (window.PlataChatReglas), como app/motor.js.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PlataChatReglas = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------ constantes */

  /* La pila de plata de la pestaña Plata: una moneda son 10.000 de garantía
     GANADA (no del cupón: el cupón no lo pagó el cliente, se muestra aparte) y
     un lingote son diez monedas. El primer crédito pagado en fecha deja dos
     monedas y un poquito (26.250 hoy; 22.106 con TumiPay). */
  var MONEDA = 10000;
  var LINGOTE = 100000;

  /* La política de nuevos que Joan fijó el 8-sep-2026 (POLITICA_NUEVOS_DEF en
     el motor): quien no tiene garantía pide hasta 100.000 y paga el 35 %. En
     PlataChat esta regla la va a firmar el reloj de una hora sin que un humano
     la mire (fase 1b), por eso lleva tope de capital. */
  var TASA_NUEVO = 0.35;
  var TOPE_NUEVO = 100000;

  /* El estándar de Tu Garantía (TASA_CREDITO), para todo crédito dentro del cupo. */
  var TASA_ESTANDAR = 0.20;

  /* Lo que costaría un crédito POR ENCIMA del cupo si Joan lo aprueba a mano.
     No se cotiza solo (ver tasaPorCupo). */
  var TASA_SOBRE_CUPO = 0.25;

  /* Del neto, cuánto es garantía. Son FACTOR_GARANTIA y FACTOR_GARANTIA_MORA
     del motor, y desde el 23-sep-2026 valen lo mismo: el 80 %, pague cuando
     pague (Joan retiró el bono por puntualidad). FACTOR_TARDE se conserva
     con su nombre porque repartir() lo recibe por la opción aTiempo y la
     página ya la pasa; el día que Joan vuelva a premiar la puntualidad, se
     cambia aquí y en el motor, y la prueba de las constantes lo vigila. Lo
     que castiga el atraso ahora es la mora, que NO suma garantía y nunca
     pasa por esta función. */
  var FACTOR_GARANTIA = 0.80;
  var FACTOR_TARDE = 0.80;

  /* Las cifras que Joan dio de TumiPay el 14-sep-2026: 2.800 por desembolsar
     (payout), 1,5 % + 700 por cada recaudo (payin). NO son públicas y TumiPay
     puede cambiarlas «con notificación»; el IVA del 19 % sobre la tarifa es lo
     que cobran todas las pasarelas comparables y TumiPay no ha dicho si lo
     cobra: por eso conIva es una opción y no un hecho. */
  var TARIFA_TUMIPAY = Object.freeze({
    payout_fijo: 2800,
    payin_pct: 0.015,
    payin_fijo: 700,
    iva: 0.19
  });

  /* ------------------------------------------------------------ validación
     Las mismas rejas del motor: un número que no es número es un error que se
     dice, no un cero silencioso. La lección de garantiaTotal(undefined) → 0
     que dejó cupos en cero sin que nadie supiera por qué. */

  function describir(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return 'la cadena "' + v + '"';
    if (typeof v === 'number') return String(v);
    return typeof v;
  }
  function esNumero(v) { return typeof v === 'number' && isFinite(v); }
  function numeroNoNegativo(v, nombre) {
    if (!esNumero(v)) throw new TypeError(nombre + ': se esperaba un número, llegó ' + describir(v));
    if (v < 0) throw new RangeError(nombre + ': no puede ser negativo (' + v + ')');
    return v;
  }
  function numeroPositivo(v, nombre) {
    numeroNoNegativo(v, nombre);
    if (v === 0) throw new RangeError(nombre + ': debe ser mayor que cero');
    return v;
  }
  function booleanoOpcional(v, nombre) {
    if (v !== undefined && typeof v !== 'boolean') {
      throw new TypeError(nombre + ': se esperaba true o false, llegó ' + describir(v));
    }
    return v;
  }

  /* Pesos para la pantalla: «$1.000», «$135.000», «−$300». Sin toLocaleString
     porque el arnés de vm de las pruebas y algún WebView viejo no traen los
     datos de es-CO, y una cifra pintada «$135000» en la app del cliente es
     una cifra que se lee mal. */
  function pesos(n) {
    var v = Math.round(esNumero(n) ? n : 0);
    var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '−$' : '$') + s;
  }

  /* ========================================================================
   * 1. EL REPARTO CON GASTOS REALES
   *
   * repartir(costo, gasto, {aTiempo}) → {costo, gasto, neto, garantia,
   *                                      ganancia, descubierto, factor, aTiempo}
   *
   * Invariante: garantia + ganancia + gasto === costo, siempre. Para que se
   * cumpla, el gasto que se devuelve es el que el costo ABSORBIÓ (topado al
   * costo); lo que el gasto excede vuelve aparte como `descubierto`, y eso lo
   * pone Joan de su bolsillo. Un neto negativo no existe: la garantía del
   * cliente nunca puede bajar por un pago que él hizo bien.
   *
   * Redondeo Math.round sobre la garantía, como acumularGarantia en el motor;
   * la ganancia es la resta, para que la suma cierre al peso.
   * ====================================================================== */
  function repartir(costo, gasto, opciones) {
    var c = numeroNoNegativo(costo, 'costo');
    var g = numeroNoNegativo(gasto == null ? 0 : gasto, 'gasto');
    var o = opciones || {};
    var aTiempo = booleanoOpcional(o.aTiempo, 'aTiempo') !== false;
    var absorbido = Math.min(g, c);
    var neto = c - absorbido;
    var factor = aTiempo ? FACTOR_GARANTIA : FACTOR_TARDE;
    var garantia = Math.round(neto * factor);
    return {
      costo: c,
      gasto: absorbido,
      neto: neto,
      garantia: garantia,
      ganancia: neto - garantia,
      descubierto: g - absorbido,
      factor: factor,
      aTiempo: aTiempo
    };
  }

  /* ========================================================================
   * 2. LO QUE COBRA EL PROVEEDOR
   *
   * gastoTumiPay(capital, costo, {conIva}) = payout + round(pct × recaudado)
   *   + payin_fijo, donde lo recaudado es capital + costo (el cliente devuelve
   *   todo en un solo pago). Con IVA se multiplica la SUMA por 1,19 y se
   *   redondea UNA vez, no cada tarifa por separado: así es como cuadra
   *   celda a celda con el anexo A (100.000 al 35 %: 5.525 → 6.575), y así lo
   *   tiene que hacer app/pagos-proveedor.js para dar el mismo peso.
   *
   * Supone UN solo recaudo. Una prórroga o un plan de pagos son varios
   * recaudos y cada uno paga su 700 + 1,5 %; eso lo modela pagos-proveedor
   * con `payins`. Acá está la cuenta simple que la calculadora necesita, y la
   * app dice que supone un solo pago.
   *
   * gastoManual() = 0: Nequi / transferencia a mano no cobra. Es el proveedor
   * con el que nace PlataChat (decisión 2a).
   * ====================================================================== */
  function gastoTumiPay(capital, costo, opciones) {
    var k = numeroNoNegativo(capital, 'capital');
    var c = numeroNoNegativo(costo, 'costo');
    var conIva = !!(opciones && opciones.conIva);
    var T = TARIFA_TUMIPAY;
    var sinIva = T.payout_fijo + Math.round(T.payin_pct * (k + c)) + T.payin_fijo;
    return conIva ? Math.round(sinIva * (1 + T.iva)) : sinIva;
  }

  function gastoManual() { return 0; }

  /* ========================================================================
   * 3. LA TASA SEGÚN EL CUPO (decisión 7a)
   *
   *   sin garantía (o cupo 0) y capital ≤ 100.000 → 0,35  'nuevo'
   *   sin garantía y capital > 100.000             → null  'tope_nuevo'
   *   capital ≤ cupo                               → 0,20  'dentro'
   *   capital > cupo                               → null  'sobre_cupo'
   *
   * `tasa: null` significa «no se cotiza solo»: la app no inventa un precio,
   * dice que lo revisa Joan. Hoy el motor no tiene tasa por cobertura (Joan la
   * derogó el 29-jul-2026: «el costo es siempre el 20 %»); lo único que existe
   * es la diferencia entre el primer crédito y el estándar, y eso es lo que
   * esta función contesta. `sinGarantia: true` manda aunque haya cupo (una
   * cuenta sin vincular tiene cupo 0 de todos modos).
   * ====================================================================== */
  function tasaPorCupo(capital, cupo, opciones) {
    var k = numeroPositivo(capital, 'capital');
    var q = numeroNoNegativo(cupo == null ? 0 : cupo, 'cupo');
    var sinGarantia = !!(opciones && opciones.sinGarantia) || q <= 0;
    if (sinGarantia) {
      return k <= TOPE_NUEVO
        ? { tasa: TASA_NUEVO, motivo: 'nuevo', tope: TOPE_NUEVO }
        : { tasa: null, motivo: 'tope_nuevo', tope: TOPE_NUEVO };
    }
    if (k <= q) return { tasa: TASA_ESTANDAR, motivo: 'dentro', tope: q };
    return { tasa: null, motivo: 'sobre_cupo', tope: q };
  }

  /* ========================================================================
   * 4. LA ESCALERA CON EL GASTO ADENTRO
   *
   * escalera(ganada, cupon, {meta, sobre, tasa, gasto, maxPasos, primero})
   *   → {pasos:[{n, capital, tasa, costo, gasto, suma, acumulada, cupo}],
   *      creditos, alcanzada, atascada, meta, sobre, cupo_inicial,
   *      ganada_inicial}
   *
   * Cada peldaño el cliente pide TODO su cupo (ganada + cupón: el piso de
   * 50.000 cede ante el cupo, como en la calculadora de hoy), paga en fecha
   * costo = round(capital × tasa), el proveedor cobra gasto(capital, costo) y
   * la garantía sube round(0,75 × (costo − gasto)). Termina cuando se alcanza
   * la meta, o en maxPasos (60: más de 60 créditos quincenales son más de dos
   * años; una meta que no llega en eso no se promete).
   *
   * `sobre` dice QUÉ se compara con la meta, porque en el motor hay dos
   * umbrales distintos: el cupo (ganada + cupón) decide cuánto se puede pedir
   * en el quincenal —«para pedir 200.000»—, y la garantía GANADA a secas decide
   * el préstamo con garantía (MONTO_MINIMO_RESPALDADO: un millón ganado, sin
   * contar el cupón). Por defecto 'cupo'; 'ganada' para la meta del millón.
   * Los 31 créditos (33 con IVA) del anexo A del plan son sobre la ganada.
   *
   * `primero` es el crédito de novato ({capital: 100.000, tasa: 0,35}): el
   * primer peldaño usa ese capital y esa tasa aunque el cupo sea cero. Sin él
   * y con cupo cero la escalera no arranca (capital 0 → costo 0), y lo dice.
   *
   * `creditos` es cuántos peldaños hacen falta (null si no llega); `atascada`
   * avisa cuando un peldaño dejó de sumar —el gasto se comió el costo— y el
   * siguiente sería idéntico: ahí no vale la pena seguir hasta 60, y es un
   * dato que la app debe decir («con estos gastos, créditos de este tamaño no
   * suben la garantía»).
   * ====================================================================== */
  function escalera(ganada, cupon, opciones) {
    var acumulada = numeroNoNegativo(ganada, 'ganada');
    var k = numeroNoNegativo(cupon == null ? 0 : cupon, 'cupon');
    var o = opciones || {};
    var meta = numeroPositivo(o.meta, 'meta');
    var sobre = o.sobre == null ? 'cupo' : o.sobre;
    if (sobre !== 'cupo' && sobre !== 'ganada') {
      throw new RangeError('sobre: se esperaba "cupo" o "ganada", llegó ' + describir(sobre));
    }
    var tasa = o.tasa == null ? TASA_ESTANDAR : numeroNoNegativo(o.tasa, 'tasa');
    var gasto = o.gasto == null ? gastoManual : o.gasto;
    if (typeof gasto !== 'function') {
      throw new TypeError('gasto: se esperaba una función (capital, costo) → pesos, llegó ' + describir(gasto));
    }
    var maxPasos = o.maxPasos == null ? 60 : numeroPositivo(o.maxPasos, 'maxPasos');
    var primero = o.primero || null;
    if (primero) {
      numeroPositivo(primero.capital, 'primero.capital');
      numeroNoNegativo(primero.tasa, 'primero.tasa');
    }

    var cupo = acumulada + k;
    var cupoInicial = cupo;
    var ganadaInicial = acumulada;
    var pasos = [];
    var llego = function () { return (sobre === 'ganada' ? acumulada : cupo) >= meta; };
    var alcanzada = llego();
    var atascada = false;

    while (!alcanzada && pasos.length < maxPasos) {
      var n = pasos.length + 1;
      var deNovato = n === 1 && primero;
      var capital = deNovato ? primero.capital : cupo;
      var t = deNovato ? primero.tasa : tasa;
      var costo = Math.round(capital * t);
      var gastoPaso = numeroNoNegativo(gasto(capital, costo), 'gasto(' + capital + ', ' + costo + ')');
      var rep = repartir(costo, gastoPaso);
      acumulada += rep.garantia;
      cupo = acumulada + k;
      pasos.push({
        n: n, capital: capital, tasa: t, costo: costo, gasto: gastoPaso,
        suma: rep.garantia, acumulada: acumulada, cupo: cupo
      });
      alcanzada = llego();
      /* Si este peldaño no sumó y el siguiente pediría el mismo capital, todos
         los que siguen serían iguales: no hay escalera. */
      if (!alcanzada && rep.garantia === 0 && capital === cupo) { atascada = true; break; }
    }

    return {
      pasos: pasos,
      creditos: alcanzada ? pasos.length : null,
      alcanzada: alcanzada,
      atascada: atascada,
      meta: meta,
      sobre: sobre,
      cupo_inicial: cupoInicial,
      ganada_inicial: ganadaInicial
    };
  }

  /* Cuántos créditos pagados en fecha, pidiendo cada vez el cupo, para llegar
     a `metaCupo`. null si no se llega en maxPasos o la escalera se atasca. */
  function creditosHasta(metaCupo, ganada, cupon, opciones) {
    var o = {};
    Object.keys(opciones || {}).forEach(function (k) { o[k] = opciones[k]; });
    o.meta = metaCupo;
    return escalera(ganada, cupon, o).creditos;
  }

  /* ========================================================================
   * 5. LA PILA DE PLATA Y LAS FRASES EN PESOS
   *
   * monedas(ganada) → {lingotes, monedas, media, total}: lo que la pestaña
   * Plata pinta. `media` es la moneda recortada (queda entre 5.000 y 9.999
   * sueltos). Esta función NO revienta con basura: recibe S.gd.ganada, que en
   * una cuenta recién creada o sin vincular puede venir undefined, y una
   * pantalla en blanco por un molde vacío sería castigar al que acaba de
   * llegar. Lo que no es número pinta el molde vacío, que es la verdad.
   * ====================================================================== */
  function monedas(ganada) {
    var g = Math.floor(esNumero(ganada) ? ganada : 0);
    if (g < 0) g = 0;
    return {
      lingotes: Math.floor(g / LINGOTE),
      monedas: Math.floor((g % LINGOTE) / MONEDA),
      media: (g % MONEDA) >= MONEDA / 2,
      total: g
    };
  }

  /* Lo que la app le dice al cliente de un reparto, en pesos y con palabras.
     Ni un porcentaje: el centinela «el socio no ve porcentajes» vigila la
     página, y esta es la única frase que explica el reparto. Si el gasto fue
     cero (proveedor manual) no se menciona: hablarle al cliente de gastos que
     no hubo es ruido. */
  function garantiaEnPalabras(rep) {
    var r = rep && typeof rep === 'object' ? rep : repartir(0, 0);
    if (!(r.costo > 0)) return 'Todavía no hay costo pagado: la garantía sube cuando pagas un crédito en fecha.';
    /* 26-sep-2026: con el 80/20 pagar tarde suma lo mismo por el costo; lo que
       no suma es la mora. Se dice, porque es justo lo que alguien que se
       atrasó querría saber. */
    var parte = r.aTiempo === false
      ? 'cuatro de cada cinco pesos del costo, igual que en fecha; lo que pagaste de mora no suma'
      : 'cuatro de cada cinco pesos';
    var frases = [];
    if (r.gasto > 0) {
      frases.push('De los ' + pesos(r.costo) + ' del costo, ' + pesos(r.gasto) + ' son gastos del pago.');
      frases.push('De los ' + pesos(r.neto) + ' que quedan, ' + pesos(r.garantia) + ' son tu garantía (' +
                  parte + ') y ' + pesos(r.ganancia) + ' quedan para PlataChat.');
    } else {
      frases.push('De los ' + pesos(r.costo) + ' del costo, ' + pesos(r.garantia) + ' son tu garantía (' +
                  parte + ') y ' + pesos(r.ganancia) + ' quedan para PlataChat.');
    }
    if (r.descubierto > 0) {
      frases.push('Los ' + pesos(r.descubierto) + ' que el costo no alcanza a cubrir los pone PlataChat, no tú.');
    }
    return frases.join(' ');
  }

  /* La frase de la meta lejana («Para pedir más, primero la garantía»), a
     partir de lo que devuelve escalera(). En pesos y en créditos, nunca en
     porcentaje. Supone un solo pago por crédito y lo dice. */
  function escaleraEnPalabras(resultado) {
    var r = resultado || {};
    var meta = esNumero(r.meta) ? r.meta : 0;
    var sobreGanada = r.sobre === 'ganada';
    var desde = sobreGanada
      ? (esNumero(r.ganada_inicial) ? r.ganada_inicial : 0)
      : (esNumero(r.cupo_inicial) ? r.cupo_inicial : 0);
    /* «de garantía» a secas cuando la meta es el cupo (ganada + cupón); «de
       garantía ganada» cuando es el millón del préstamo con garantía, que el
       cupón no cuenta. Decirlo igual sería prometer que los datos acercan al
       millón, y no. */
    var que = sobreGanada ? 'de garantía ganada' : 'de garantía';
    var fin = sobreGanada ? 'para llegar a ' + pesos(meta) + ' ganados' : 'para pedir ' + pesos(meta);
    if (r.alcanzada && !(r.pasos || []).length) {
      return sobreGanada
        ? 'Ya tienes ' + pesos(meta) + ' de garantía ganada.'
        : 'Ya puedes pedir ' + pesos(meta) + ': está dentro de tu cupo.';
    }
    var faltan = Math.max(0, meta - desde);
    if (r.alcanzada) {
      var n = r.creditos;
      return 'Te faltan ' + pesos(faltan) + ' ' + que + ' ' + fin + ': ' +
             n + (n === 1 ? ' crédito pagado' : ' créditos pagados') +
             ' en fecha, pidiendo cada vez todo tu cupo y pagando cada uno de una sola vez.';
    }
    if (r.atascada) {
      return 'Con los gastos del pago de hoy, créditos de este tamaño no suben tu garantía: ' +
             fin + ' hace falta pedir más o que baje el gasto.';
    }
    return 'Te faltan ' + pesos(faltan) + ' ' + que + ' ' + fin + ': ' +
           'son más de ' + (r.pasos || []).length + ' créditos, y eso no se promete.';
  }

  /* ========================================================================
   * 6. LOS CORTES HASTA UNA FECHA (15-sep-2026)
   *
   * cortesDesde(desembolsoISO, cantidad, motor) → [ISO, ISO, ...]
   * cortesHasta(desembolsoISO, pagoISO, motor, {maxCortes})
   *   → {cortes, fechas:[ISO...], fecha, dias, recortado}
   *
   * Joan pidió el 14-sep que en la calculadora el cliente «pueda seleccionar
   * los días y seleccionar las fechas de pago». La única regla de plazo que
   * existe hoy en el motor es el corte —el 15 y el último de cada mes,
   * corridos por domingos y festivos, con la ventana mínima de cinco días—
   * y la prórroga, que lleva el crédito al corte siguiente por el mismo
   * precio. Así que «elegir la fecha» es elegir CUÁNTOS cortes: el día que
   * el cliente marque salta al corte que lo cubre (el primero que no queda
   * antes de ese día) y cada corte de más es una prórroga. Estas dos
   * funciones solo cuentan cortes y días; el precio lo pone la pantalla con
   * la regla de la prórroga (costo × cortes), no acá.
   *
   * EL MOTOR ENTRA POR PARÁMETRO, a propósito. Este módulo no carga
   * motor.js: es puro y no tiene por qué arrastrar 2.800 líneas de
   * calendario; la página le pasa window.MotorReglas y las pruebas el
   * require. Lo que se le pide son las mismas tres cuentas con las que el
   * Panel corre una prórroga —calcularFechaCorte para el primer corte,
   * fechaCorteProrroga para cada uno de los siguientes, diasEntre para los
   * días—, para que la fecha que ve el cliente en PlataChat sea la que Joan
   * vería en el Panel al aplicarla. Y sin reloj: la fecha de desembolso entra
   * como texto AAAA-MM-DD, igual que la de pago. Comparar dos textos así con
   * `<` ordena bien porque el formato es de mayor a menor (año, mes, día).
   *
   * `maxCortes` es el tope que la pantalla saca del nivel (uno más las
   * prórrogas permitidas). Si la fecha pedida queda más allá, la cuenta se
   * detiene en el último corte permitido y lo dice con `recortado`, en vez
   * de prometer un plazo que el motor no daría.
   * ====================================================================== */
  function fechaTexto(v, nombre) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new TypeError(nombre + ': se esperaba una fecha AAAA-MM-DD, llegó ' + describir(v));
    }
    return v;
  }
  function enteroPositivo(v, nombre) {
    numeroPositivo(v, nombre);
    if (Math.floor(v) !== v) throw new RangeError(nombre + ': se esperaba un entero, llegó ' + v);
    return v;
  }
  function motorDeCortes(motor) {
    ['calcularFechaCorte', 'fechaCorteProrroga', 'aFechaLocal', 'diasEntre'].forEach(function (f) {
      if (!motor || typeof motor[f] !== 'function') {
        throw new TypeError('motor: se esperaba MotorReglas con ' + f + ', llegó ' + describir(motor));
      }
    });
    return motor;
  }

  function cortesDesde(desembolsoISO, cantidad, motor) {
    var d = fechaTexto(desembolsoISO, 'desembolsoISO');
    var n = enteroPositivo(cantidad, 'cantidad');
    var m = motorDeCortes(motor);
    var fechas = [m.calcularFechaCorte(d)];
    while (fechas.length < n) fechas.push(m.fechaCorteProrroga(fechas[fechas.length - 1]));
    return fechas;
  }

  function cortesHasta(desembolsoISO, pagoISO, motor, opciones) {
    var d = fechaTexto(desembolsoISO, 'desembolsoISO');
    var p = fechaTexto(pagoISO, 'pagoISO');
    var m = motorDeCortes(motor);
    var o = opciones || {};
    /* 60 cortes son dos años y medio: ninguna fecha razonable pasa de ahí, y
       un tope evita que una fecha absurda ('2099-…') recorra el calendario. */
    var max = o.maxCortes == null ? 60 : enteroPositivo(o.maxCortes, 'maxCortes');
    var fechas = [m.calcularFechaCorte(d)];
    var recortado = false;
    while (fechas[fechas.length - 1] < p) {
      if (fechas.length >= max) { recortado = true; break; }
      fechas.push(m.fechaCorteProrroga(fechas[fechas.length - 1]));
    }
    var fecha = fechas[fechas.length - 1];
    return {
      cortes: fechas.length,
      fechas: fechas,
      fecha: fecha,
      dias: m.diasEntre(m.aFechaLocal(d), m.aFechaLocal(fecha)),
      recortado: recortado
    };
  }

  /* ========================================================================
   * 7. QUIÉN PROPONE Y LA HORA LÍMITE EN PALABRAS (15-sep-2026, fase 1b)
   *
   * quienPropone(por) → {clave:'automatico'|'panel'|'equipo', titulo}
   * horaLimiteEnPalabras(isoLimite, isoAhora, zona) → 'antes de las 3:40 p. m.'
   *   | 'mañana antes de las 8:05 a. m.' | 'el 16 sep antes de las 8:05 a. m.'
   *
   * La negociación con reloj (base/20261005_platachat_solicitud.sql) deja en
   * solicitudes.contrapropuesta un `por` que dice quién la armó: 'joan' desde
   * el CRM, 'gerente:<celular>' desde contrapropuesta_gerente, y
   * 'automatica_1h' cuando venció la hora y contestó resolver_vencidas ('automatica'
   * a secas es la de solicitar_primer_credito, la app vieja). La tarjeta del
   * chat tiene que rotularla porque la promesa de la piel es «siempre sabes
   * cuándo te contestó una máquina» —punteada la automática, continua la de
   * una persona—, y esa decisión no puede quedar repartida entre la página y
   * las pruebas: vive acá, una vez.
   *
   * POR QUÉ LO DESCONOCIDO ES AUTOMÁTICO Y NO PERSONA. Un `por` que este
   * módulo no reconoce (vacío, null, un nombre nuevo) se rotula como
   * automático: decir «tu gerente te propone» de algo que quizá firmó una
   * máquina rompe la promesa de arriba; decir «automática» de algo que firmó
   * una persona solo la hace menos cálida. Ante la duda, el error barato.
   *
   * LA HORA SIN RELOJ DE PARED. El reloj de la solicitud lo pone la base
   * (responder_antes_de, en UTC) y la app lo dice en hora de Colombia; para
   * saber si es «hoy», «mañana» o «el 16 sep» hace falta un AHORA, y ese
   * ahora entra por parámetro (la página pasa el suyo), nunca del reloj de
   * pared: la regla del módulo, y la única forma de que la prueba
   * «hoy/mañana/otro día» dé lo mismo el día que se corra. Los instantes se
   * leen con Date.parse
   * (un ISO → milisegundos) y se formatean con Intl.DateTimeFormat y timeZone,
   * que sabe de zonas sin que este archivo cargue una tabla. La hora se arma a
   * mano —«3:40 p. m.», con espacios normales— y no con el formato es-CO del
   * navegador: un WebView viejo sin datos de es-CO diría «3:40 PM», y el
   * separador «p. m.» de ICU trae espacios que no se rompen y que una prueba
   * (o un copiar y pegar) no reconoce como espacios.
   * ====================================================================== */
  var ZONA_COLOMBIA = 'America/Bogota';
  var MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var UN_DIA_MS = 24 * 60 * 60 * 1000;

  function quienPropone(por) {
    var p = String(por == null ? '' : por).trim().toLowerCase();
    if (p.indexOf('gerente:') === 0) return { clave: 'equipo', titulo: 'Tu gerente te propone' };
    if (p === 'joan' || p === 'panel') return { clave: 'panel', titulo: 'PlataChat te propone' };
    return { clave: 'automatico', titulo: 'Propuesta automática' };
  }

  function instante(v, nombre) {
    var ms = typeof v === 'number' ? v : Date.parse(String(v == null ? '' : v));
    if (!esNumero(ms)) throw new TypeError(nombre + ': se esperaba una fecha y hora ISO, llegó ' + describir(v));
    return ms;
  }
  /* La fecha y la hora de un instante, vistas desde una zona. en-US con
     hourCycle h23 solo para que los NÚMEROS salgan como números (el idioma
     no se ve: los nombres los pone este archivo); `% 24` porque un motor
     viejo contesta «24» a la medianoche con ese ciclo. */
  function partesEnZona(ms, zona) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    var p = {};
    f.formatToParts(ms).forEach(function (x) { p[x.type] = x.value; });
    return {
      fecha: p.year + '-' + p.month + '-' + p.day,
      dia: Number(p.day), mes: Number(p.month),
      hora: Number(p.hour) % 24, minuto: Number(p.minute)
    };
  }
  function horaEnPalabras(h, m) {
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' a. m.' : ' p. m.');
  }

  function horaLimiteEnPalabras(isoLimite, isoAhora, zona) {
    var z = zona == null ? ZONA_COLOMBIA : zona;
    if (typeof z !== 'string' || !z) throw new TypeError('zona: se esperaba el nombre de una zona horaria, llegó ' + describir(zona));
    var lim = partesEnZona(instante(isoLimite, 'isoLimite'), z);
    var ahoraMs = instante(isoAhora, 'isoAhora');
    var hoy = partesEnZona(ahoraMs, z).fecha;
    /* «Mañana» es el día civil siguiente EN LA ZONA: se suma un día al
       instante y se vuelve a mirar el calendario de la zona, en vez de sumar
       1 al número del día (el 30 sep + 1 no es el 31 sep). */
    var manana = partesEnZona(ahoraMs + UN_DIA_MS, z).fecha;
    var hora = 'antes de las ' + horaEnPalabras(lim.hora, lim.minuto);
    if (lim.fecha === hoy) return hora;
    if (lim.fecha === manana) return 'mañana ' + hora;
    return 'el ' + lim.dia + ' ' + MES_CORTO[lim.mes - 1] + ' ' + hora;
  }

  return {
    MONEDA: MONEDA,
    LINGOTE: LINGOTE,
    TASA_NUEVO: TASA_NUEVO,
    TOPE_NUEVO: TOPE_NUEVO,
    TASA_ESTANDAR: TASA_ESTANDAR,
    TASA_SOBRE_CUPO: TASA_SOBRE_CUPO,
    FACTOR_GARANTIA: FACTOR_GARANTIA,
    FACTOR_TARDE: FACTOR_TARDE,
    TARIFA_TUMIPAY: TARIFA_TUMIPAY,

    repartir: repartir,
    gastoTumiPay: gastoTumiPay,
    gastoManual: gastoManual,
    tasaPorCupo: tasaPorCupo,
    escalera: escalera,
    creditosHasta: creditosHasta,
    monedas: monedas,
    cortesDesde: cortesDesde,
    cortesHasta: cortesHasta,
    quienPropone: quienPropone,
    horaLimiteEnPalabras: horaLimiteEnPalabras,

    pesos: pesos,
    garantiaEnPalabras: garantiaEnPalabras,
    escaleraEnPalabras: escaleraEnPalabras,
    frases: {
      pesos: pesos,
      garantiaEnPalabras: garantiaEnPalabras,
      escaleraEnPalabras: escaleraEnPalabras
    }
  };
});
