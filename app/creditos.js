/* ============================================================================
 * CRÉDITOS PUBLICABLES — el catálogo de la app que va a Google Play
 * Etapa 1 del rediseño. 11 de agosto de 2026.
 *
 * ESTE ARCHIVO NO REEMPLAZA A motor.js. Son dos productos distintos y conviven:
 *
 *   motor.js      el crédito quincenal y el préstamo con garantía. Lo que Joan
 *                 opera hoy con sus clientes. Cobra 20% a 15 días. NO puede ir a
 *                 Google Play: la política de préstamos personales prohíbe los
 *                 créditos que se paguen completos en 60 días o menos.
 *   creditos.js   lo que sí puede ir. Plazo de 6 meses en cuotas mensuales, y
 *                 precio por debajo del techo de usura del mes.
 *
 * Están aparte a propósito y no mezclados: el día que alguien meta un producto
 * de 15 días en este catálogo, la app entera deja de ser publicable. Acá el
 * plazo mínimo es una regla del archivo, no una costumbre.
 *
 * ---------------------------------------------------------------------------
 * LAS TRES REGLAS QUE MANDAN, y por qué cada una
 *
 * 1. PLAZO MÍNIMO 90 DÍAS. La regla de Google es "más de 60 días" y es de
 *    PLAZO, no de precio: no hay tasa lo bastante baja que salve a un crédito
 *    de 15 días. Se toma 90 y no 61 para no vivir pegado a la raya: un mes de
 *    28 días y un desembolso a fin de mes acercan la cuenta más de lo que
 *    parece.
 *
 * 2. NUNCA POR ENCIMA DEL TECHO DE USURA DEL MES. En Colombia pasarse no es una
 *    multa: el artículo 305 del Código Penal lo castiga con 32 a 90 meses de
 *    prisión, y dice expresamente "cualquiera sea la forma utilizada para hacer
 *    constar la operación, ocultarla o disimularla". Por eso el tope vive en
 *    una TABLA CON FECHA (TOPES) y no en una constante: la Superfinanciera lo
 *    certifica cada mes y se mueve. Julio 2026 fue 28,79% y agosto 29,66%.
 *    Un producto puesto exacto en el techo de agosto queda ilegal en septiembre
 *    sin que nadie toque una línea.
 *
 * 3. NINGÚN CARGO APARTE. Ni plataforma, ni administración, ni estudio, ni
 *    seguro. El artículo 68 de la Ley 45 de 1990 los reputa intereses —"aun
 *    cuando las mismas se justifiquen por concepto de honorarios, comisiones u
 *    otros semejantes"— así que sumarlos aparte no baja la tasa, la sube y la
 *    esconde. Lo que se anuncia es lo que se cobra, y es UN solo número.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ LA TASA SE MIDE CON TIR Y NO CON LA FÓRMULA DE crm.html
 *
 * El Panel calcula la equivalente anual así: (1 + costo)^(365/días) − 1. Eso
 * supone que el socio paga TODO DE UNA VEZ al final, que es exactamente lo que
 * pasa con el quincenal — ahí la fórmula es correcta.
 *
 * En un crédito que se paga en cuotas NO es correcta, porque el socio va
 * devolviendo capital y sigue pagando costo calculado sobre el original. Medido
 * contra el préstamo con garantía de hoy:
 *
 *     6 meses al 5% mensual   →  la fórmula del Panel dice 70,2%
 *                             →  la TIR real es 153,3%    (subestima 2,2 veces)
 *
 * Un producto diseñado con esa fórmula creería estar en 29% estando en 56%. Por
 * eso acá la tasa se saca de la TIR del flujo real de cuotas, y por eso esa
 * cuenta está en este archivo y no copiada en una pantalla.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CreditosPublicables = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ----------------------------------------------------------- utilidades */
  function esNumero(v) { return typeof v === 'number' && isFinite(v); }
  function describir(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'un arreglo';
    return typeof v;
  }
  function numeroPositivo(v, nombre) {
    if (!esNumero(v) || v <= 0) {
      throw new TypeError(nombre + ': se esperaba un número mayor que cero, llegó ' + describir(v));
    }
    return v;
  }
  function fechaValida(iso, nombre) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new TypeError(nombre + ': se esperaba una fecha AAAA-MM-DD, llegó ' + describir(iso));
    }
    return iso;
  }

  /* ==========================================================================
   * EL TECHO DE USURA, CERTIFICADO MES A MES
   *
   * Cada fila es una certificación real de la Superintendencia Financiera. NO se
   * interpola, NO se extrapola y NO se hereda el mes anterior: si la fecha que
   * se pregunta cae fuera de lo certificado, topeVigente devuelve null y
   * simular() se niega a cotizar.
   *
   * ESO ES DELIBERADO Y ES LO MÁS IMPORTANTE DEL ARCHIVO. La alternativa —seguir
   * usando el último tope conocido— significa que el día que nadie actualice
   * esta tabla, el sistema empieza a cotizar contra un techo que ya no existe y
   * nadie se entera. Un crédito de más se puede rehacer; una cotización por
   * encima del techo, no: ya se firmó y ya es el artículo 305.
   *
   * Preferible una app que dice "no puedo cotizar hoy, actualiza el tope" a una
   * app que cotiza mal en silencio.
   *
   * PARA ACTUALIZAR: la Superfinanciera publica la resolución a fin de mes.
   * Se agrega una fila; no se toca ninguna anterior — son historia, y un crédito
   * viejo se juzga con el techo que regía el día que se desembolsó.
   * ======================================================================== */
  var TOPES = [
    /* consumo y ordinario = interés bancario corriente × 1,5 */
    { desde: '2026-07-01', hasta: '2026-07-31', consumo_ordinario: 0.2879, ibc: 0.1919, fuente: 'Resolución SFC julio 2026' },
    { desde: '2026-08-01', hasta: '2026-08-31', consumo_ordinario: 0.2966, ibc: 0.1977, fuente: 'Resolución 1139 de 2026' }
  ];

  /* El régimen de CONSUMO DE BAJO MONTO (que llega a 65,46%) NO está en esta
     tabla, y no es un olvido. El Decreto 1348 de 2016 lo reserva a entidades
     sobre las que la Superintendencia Financiera ejerce control y vigilancia, y
     solo para personas sin ningún producto crediticio previo en el sistema.
     Tu Garantía no es una entidad vigilada, así que ese techo no está
     disponible y ponerlo acá sería dejar cargada la posibilidad de usarlo.
     Si algún día hay licencia, se agrega la columna con su fecha. */

  /**
   * El techo vigente el día `iso`, o null si no hay certificación para esa
   * fecha. Null es una respuesta legítima y hay que manejarla, no ignorarla.
   */
  function topeVigente(iso) {
    fechaValida(iso, 'fecha');
    for (var i = 0; i < TOPES.length; i++) {
      if (iso >= TOPES[i].desde && iso <= TOPES[i].hasta) return TOPES[i];
    }
    return null;
  }

  /** Hasta cuándo alcanza la tabla. Para que el Panel pueda avisar ANTES. */
  function ultimoTopeCertificado() {
    return TOPES.length ? TOPES[TOPES.length - 1].hasta : null;
  }

  /* ==========================================================================
   * LA TASA, DE VERDAD
   * ======================================================================== */

  /**
   * TIR mensual de un flujo. flujo[0] es lo que recibe el socio (positivo) y el
   * resto son sus pagos (negativos), uno por mes.
   *
   * Bisección y no Newton: acá no importa la velocidad —son diez cuotas— y sí
   * importa que no se vaya a diverger nunca y devolver una tasa inventada.
   */
  function tirMensual(flujo) {
    if (!Array.isArray(flujo) || flujo.length < 2) {
      throw new TypeError('flujo: se esperaba un arreglo con al menos dos movimientos');
    }
    flujo.forEach(function (f, k) { if (!esNumero(f)) throw new TypeError('flujo[' + k + ']: no es un número'); });
    var lo = -0.9999, hi = 5;
    var vp = function (i) {
      return flujo.reduce(function (s, f, k) { return s + f / Math.pow(1 + i, k); }, 0);
    };
    /* vp crece con i (más descuento, menos pesan los pagos futuros). Si vp>0 la
       tasa se pasó. La primera versión de esta comparación estaba al revés y
       devolvía 217 mil millones por ciento: el tipo de número que hay que
       desconfiar antes que publicar. */
    for (var k = 0; k < 300; k++) {
      var m = (lo + hi) / 2;
      if (vp(m) > 0) hi = m; else lo = m;
    }
    return (lo + hi) / 2;
  }

  /** La efectiva anual que exige publicar Google Play, y que mide la usura. */
  function efectivoAnual(flujo) {
    return Math.pow(1 + tirMensual(flujo), 12) - 1;
  }

  /* ==========================================================================
   * EL CATÁLOGO
   *
   * El perfil decide CUÁNTO y QUÉ TAN RÁPIDO, no cuánto cuesta. Es una decisión
   * de producto y conviene que esté escrita: con un solo techo disponible
   * (29,66%), diferenciar el precio por perfil solo serviría para cobrarle más
   * al que menos historia tiene, que es el que menos puede pagarlo. Lo que gana
   * el que construye historial es cupo y aprobación inmediata.
   *
   * MARGEN_TECHO: se cotiza al 90% del techo del mes, no al 100%. El techo se
   * mueve —julio 28,79%, agosto 29,66%— y un producto puesto al ras queda
   * ilegal el primer mes que baje. El 10% aguanta una caída de tres meses
   * seguidos como la de este año.
   * ======================================================================== */

  var PLAZO_MINIMO_DIAS = 90;   // regla 1. No se toca sin releer el comentario de arriba.
  var PLAZO_MESES = 6;          // decisión de Joan, 11-ago-2026
  var MARGEN_TECHO = 0.90;

  var PERFILES = {
    preferente: {
      id: 'preferente',
      nombre: 'Preferente',
      color: 'verde',
      cupo_maximo: 2000000,
      aprobacion: 'inmediata',
      entra_por: 'invitacion',
      texto: 'Historial construido con nosotros. Pide y se desembolsa sin revisión.'
    },
    recurrente: {
      id: 'recurrente',
      nombre: 'Recurrente',
      color: 'ambar',
      cupo_maximo: 1000000,
      aprobacion: 'inmediata',
      entra_por: 'invitacion',
      texto: 'Ya tiene historial con nosotros. Pide y se desembolsa sin revisión.'
    },
    nuevo: {
      id: 'nuevo',
      nombre: 'Nuevo / por evaluar',
      color: 'rojo',
      /* CUPO CERO A PROPÓSITO, y no es un castigo: es lo que hace que la
         solicitud pase por Joan. El socio nuevo VE el catálogo con su costo real
         desde el primer momento —eso lo pidió Joan y es lo correcto— pero no
         puede desembolsar solo. */
      cupo_maximo: 0,
      aprobacion: 'manual',
      entra_por: 'registro_publico',
      texto: 'Todavía no lo conocemos. Puede pedir; lo revisamos y le respondemos.'
    }
  };

  var ORDEN_PERFILES = ['nuevo', 'recurrente', 'preferente'];

  function perfilValido(id) {
    return Object.prototype.hasOwnProperty.call(PERFILES, id);
  }
  function normalizarPerfil(id, nombre) {
    if (!perfilValido(id)) {
      throw new RangeError((nombre || 'perfil') + ' desconocido: ' + describir(id) +
        '. Los que hay son ' + ORDEN_PERFILES.join(', ') + '.');
    }
    return PERFILES[id];
  }

  /* ==========================================================================
   * SIMULAR
   * ======================================================================== */

  /**
   * El costo plano (sobre el capital original) más alto que cabe bajo un techo,
   * para un plazo dado en cuotas mensuales iguales.
   *
   * Se busca por bisección contra la TIR real, no con una fórmula cerrada: la
   * fórmula cerrada existe pero tendría que coincidir con tirMensual para
   * siempre, y dos cuentas del mismo número es como este proyecto se ha hecho
   * daño antes. Una sola cuenta, y la otra se deriva de ella.
   */
  function costoQueCabe(meses, techoEA) {
    var lo = 0, hi = 1;
    for (var k = 0; k < 200; k++) {
      var c = (lo + hi) / 2;
      if (eaDeCosto(meses, c) > techoEA) hi = c; else lo = c;
    }
    /* Hacia abajo siempre: redondear hacia arriba es pasarse del techo por un
       decimal, y del techo no se pasa ni por un decimal. */
    return Math.floor((lo + hi) / 2 * 10000) / 10000;
  }

  function eaDeCosto(meses, costoPlano) {
    var P = 1000000;                       // el capital no cambia la TIR; se usa uno cómodo
    var total = P * (1 + costoPlano);
    var cuota = total / meses;
    var flujo = [P];
    for (var i = 0; i < meses; i++) flujo.push(-cuota);
    return efectivoAnual(flujo);
  }

  /**
   * Un crédito completo: cuotas con fecha, total, y la efectiva anual real.
   *
   * @param {object} opciones {perfil, capital, fecha_desembolso, meses}
   * @returns {object} o lanza si el perfil no existe.
   *          `.puede` en false cuando no hay techo certificado para esa fecha o
   *          el capital no cabe en el cupo del perfil. Nunca cotiza a ciegas.
   */
  function simular(opciones) {
    var o = opciones || {};
    var perfil = normalizarPerfil(o.perfil, 'perfil');
    var capital = numeroPositivo(o.capital, 'capital');
    var fecha = fechaValida(o.fecha_desembolso, 'fecha_desembolso');
    var meses = o.meses === undefined ? PLAZO_MESES : o.meses;

    if (!esNumero(meses) || Math.floor(meses) !== meses || meses < 1) {
      throw new TypeError('meses: se esperaba un entero positivo, llegó ' + describir(o.meses));
    }
    /* La regla 1, aplicada acá y no en una pantalla: un producto que no cumpla
       el plazo mínimo no se puede ni simular. Si esto viviera en la interfaz,
       bastaría con llamar al motor desde otro sitio para saltárselo. */
    if (meses * 30 < PLAZO_MINIMO_DIAS) {
      throw new RangeError('plazo de ' + meses + ' mes(es): el mínimo publicable es ' +
        PLAZO_MINIMO_DIAS + ' días. Un crédito más corto vuelve la app entera no publicable ' +
        'en Google Play, y esa regla es de plazo, no de precio.');
    }

    var tope = topeVigente(fecha);
    if (!tope) {
      return {
        puede: false,
        motivo: 'sin_tope',
        mensaje: 'No hay techo de usura certificado para el ' + fecha + '. La tabla llega ' +
                 'hasta el ' + ultimoTopeCertificado() + '. Hay que agregar la certificación ' +
                 'del mes antes de poder cotizar.',
        perfil: perfil.id
      };
    }

    if (capital > perfil.cupo_maximo) {
      return {
        puede: false,
        motivo: perfil.cupo_maximo === 0 ? 'sin_cupo' : 'sobre_cupo',
        mensaje: perfil.cupo_maximo === 0
          ? 'Todavía no tiene cupo asignado: la solicitud pasa a revisión.'
          : 'El cupo de un socio ' + perfil.nombre.toLowerCase() + ' llega hasta ' +
            perfil.cupo_maximo.toLocaleString('es-CO') + '.',
        cupo_maximo: perfil.cupo_maximo,
        perfil: perfil.id,
        /* Aun sin cupo se devuelve la cotización, porque Joan pidió que el socio
           nuevo VEA el costo real desde el primer momento. Lo que no puede es
           desembolsar solo. */
        cotizacion: cotizar(capital, meses, fecha, tope)
      };
    }

    var c = cotizar(capital, meses, fecha, tope);
    c.puede = true;
    c.perfil = perfil.id;
    c.aprobacion = perfil.aprobacion;
    return c;
  }

  function cotizar(capital, meses, fecha, tope) {
    var techo = tope.consumo_ordinario * MARGEN_TECHO;
    var costoPlano = costoQueCabe(meses, techo);
    var costoTotal = Math.round(capital * costoPlano);
    var total = capital + costoTotal;

    /* La última cuota absorbe el resto, de capital Y de costo, para que la suma
       de las cuotas dé EXACTAMENTE el total prometido arriba. Ni un peso suelto:
       un peso de diferencia entre "total a pagar" y la suma de las cuotas es una
       discusión con un cliente delante, y la pierde quien la tenga que explicar. */
    var cuotaBase = Math.floor(total / meses);
    var cuotas = [], acumulado = 0;
    for (var i = 0; i < meses; i++) {
      var ultima = (i === meses - 1);
      var monto = ultima ? (total - acumulado) : cuotaBase;
      acumulado += monto;
      cuotas.push({ n: i + 1, fecha: sumarMeses(fecha, i + 1), total: monto });
    }

    var flujo = [capital].concat(cuotas.map(function (q) { return -q.total; }));
    var ea = efectivoAnual(flujo);

    return {
      capital: capital,
      meses: meses,
      fecha_desembolso: fecha,
      costo_plano: costoPlano,
      costo_total: costoTotal,
      total_a_pagar: total,
      cuotas: cuotas,
      cuota_tipica: cuotas[0].total,
      efectivo_anual: ea,
      /* Lo que hay que publicar en la ficha de Play y decir en la pantalla donde
         se pide. Viaja con la cotización para que nadie lo escriba a mano. */
      techo_del_mes: tope.consumo_ordinario,
      certificacion: tope.fuente,
      dias_minimos: PLAZO_MINIMO_DIAS
    };
  }

  /* Sumar meses sin la trampa de UTC ni la del día 31: el 31 de enero más un
     mes es el 28 (o 29) de febrero, no el 3 de marzo. */
  function sumarMeses(iso, n) {
    var p = iso.split('-');
    var a = Number(p[0]), m = Number(p[1]) - 1, d = Number(p[2]);
    var destino = new Date(a, m + n, 1);
    var ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
    destino.setDate(Math.min(d, ultimoDia));
    var mm = String(destino.getMonth() + 1).padStart(2, '0');
    var dd = String(destino.getDate()).padStart(2, '0');
    return destino.getFullYear() + '-' + mm + '-' + dd;
  }

  /* ==========================================================================
   * MIGRACIÓN — de dónde sale el perfil de los clientes que ya existen
   *
   * NO ASIGNA: SUGIERE. Joan dijo que el perfil lo pone él desde el panel y que
   * el socio no lo escoge; que lo pusiera este archivo sería lo mismo con otro
   * disfraz. Lo que hace es proponer, con el motivo escrito, para que aprobar
   * cincuenta fichas sea leer cincuenta renglones y no reconstruir cincuenta
   * historias.
   * ======================================================================== */

  var PAGOS_PARA_PREFERENTE = 5;
  var PAGOS_PARA_RECURRENTE = 1;

  /**
   * @param {object} resumen {pagados_a_tiempo, creditos_total, en_mora}
   */
  function perfilSugerido(resumen) {
    var r = resumen || {};
    var aTiempo = Number(r.pagados_a_tiempo) || 0;
    var total = Number(r.creditos_total) || 0;
    var enMora = !!r.en_mora;

    if (enMora) {
      return { perfil: 'nuevo', motivo: 'Tiene un crédito en mora hoy. Revisar antes de asignarle cupo.' };
    }
    if (aTiempo >= PAGOS_PARA_PREFERENTE) {
      return { perfil: 'preferente', motivo: aTiempo + ' créditos pagados en fecha.' };
    }
    if (aTiempo >= PAGOS_PARA_RECURRENTE) {
      return { perfil: 'recurrente', motivo: aTiempo + ' crédito(s) pagado(s) en fecha de ' + total + '.' };
    }
    return { perfil: 'nuevo', motivo: total ? 'Tiene ' + total + ' crédito(s) pero ninguno pagado en fecha todavía.'
                                            : 'Sin historial con nosotros.' };
  }

  /* Los campos que la ficha de un socio necesita para este producto, y que hoy
     no existen en el Panel. `undefined` significa "no migrado"; null y '' son
     valores legítimos, así que no sirven para distinguir. */
  function camposNuevosDelSocio() {
    return {
      perfil: null,               // lo asigna Joan. null = sin asignar, y sin asignar no hay cupo.
      perfilSugerido: null,       // lo propone perfilSugerido()
      perfilMotivo: '',           // por qué se sugirió, para que Joan lo lea
      perfilAsignadoEn: null,     // fecha
      perfilHistorial: [],        // {fecha, de, a, motivo} — su spec pide saber quién cambió qué
      telefonoUsuario: '',        // el teléfono con el que entra. Es el usuario.
      registradoEn: null,         // cuándo se registró solo, si fue por registro público
      autorizacionDatos: null     // {fecha, version} de la Ley 1581
    };
  }

  return {
    VERSION: '2026-08-11',

    /* las reglas, para que ninguna pantalla las repita */
    PLAZO_MINIMO_DIAS: PLAZO_MINIMO_DIAS,
    PLAZO_MESES: PLAZO_MESES,
    MARGEN_TECHO: MARGEN_TECHO,
    TOPES: TOPES,
    PERFILES: PERFILES,
    ORDEN_PERFILES: ORDEN_PERFILES,

    /* el techo */
    topeVigente: topeVigente,
    ultimoTopeCertificado: ultimoTopeCertificado,

    /* la tasa */
    tirMensual: tirMensual,
    efectivoAnual: efectivoAnual,
    eaDeCosto: eaDeCosto,
    costoQueCabe: costoQueCabe,

    /* el catálogo */
    perfilValido: perfilValido,
    normalizarPerfil: normalizarPerfil,
    simular: simular,
    sumarMeses: sumarMeses,

    /* la migración */
    perfilSugerido: perfilSugerido,
    camposNuevosDelSocio: camposNuevosDelSocio,
    PAGOS_PARA_PREFERENTE: PAGOS_PARA_PREFERENTE,
    PAGOS_PARA_RECURRENTE: PAGOS_PARA_RECURRENTE
  };
});
