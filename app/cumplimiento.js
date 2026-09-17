/* ============================================================================
 * CUMPLIMIENTO — lo que habría que declararle a Google Play, derivado y no escrito
 * Etapa 7 del rediseño. 11 de agosto de 2026.
 * (18-ago-2026: Play quedó descartado como canal — ver android/LEEME.md. El
 * mapa de qué recoge la app y para qué vale por sí solo y se queda; la consola
 * de Play solo existiría si la tienda se retoma.)
 *
 * POR QUÉ ESTE ARCHIVO EXISTE, Y NO ES UN DOCUMENTO
 *
 * Google Play pide dos cosas por escrito: la DIVULGACIÓN del crédito (plazo
 * mínimo y máximo, TAE máxima y un ejemplo del costo total) y el formulario de
 * SEGURIDAD DE LOS DATOS (qué recoge la app, para qué, y si se comparte).
 *
 * Las dos se contestan una vez, en la consola, a mano. Y las dos se vuelven
 * mentira sola en cuanto la app cambia: se agrega un campo al formulario, o se
 * mueve la tasa, y la declaración se queda como estaba. Nadie la vuelve a mirar.
 *
 * Eso no es un descuido teórico: una declaración de Data Safety que no coincide
 * con lo que la app hace es motivo de SUSPENSIÓN, y es de las pocas cosas que
 * Google verifica de oficio comparando el formulario con el comportamiento real.
 *
 * Así que acá no se escriben las respuestas: se DERIVAN. La lista de datos sale
 * de CAMPOS en cuenta.js, y la divulgación sale de simular() en creditos.js. Si
 * alguien agrega un campo y no le pone su fila de Data Safety, la prueba se cae.
 * Lo que se pegaría en la consola de Play se genera desde acá.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./cuenta.js'), require('./creditos.js'),
                             require('./motor.js'));
  } else {
    /* El motor puede no estar: play/borrar-cuenta.html carga este archivo sin
       él. divulgacionRespaldado contesta {puede:false} en ese caso. */
    raiz.Cumplimiento = fabrica(raiz.CuentaSocio, raiz.CreditosPublicables,
                                raiz.MotorReglas);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U, C, M) {
  'use strict';

  /* ==========================================================================
   * SEGURIDAD DE LOS DATOS
   *
   * Cada campo del formulario se mapea a una de las categorías que usa Google.
   * El mapa es lo único escrito a mano acá, y es lo mínimo: la LISTA de campos
   * no se repite, se lee de cuenta.js.
   *
   * Las tres respuestas que Google hace por cada dato, y las nuestras:
   *   ¿se recoge?      sí, todos. Ninguno se infiere ni se toma sin pedirlo.
   *   ¿se comparte?    NO, ninguno. No hay analítica, no hay publicidad, no hay
   *                    terceros. Contestar "no" acá y luego meter un SDK de
   *                    medición es exactamente la incoherencia que suspende.
   *   ¿es obligatorio? sale de `obligatorio` en cuenta.js. No se copia.
   * ======================================================================== */

  var CATEGORIA = {
    nombres: 'Información personal · Nombre',
    apellidos: 'Información personal · Nombre',
    tipo_doc: 'Información personal · Otros documentos de identificación',
    documento: 'Información personal · Otros documentos de identificación',
    expedicion: 'Información personal · Otros documentos de identificación',
    celular: 'Información personal · Número de teléfono',
    celular2: 'Información personal · Número de teléfono',
    correo: 'Información personal · Dirección de correo electrónico',
    ciudad: 'Información personal · Dirección',
    barrio: 'Información personal · Dirección',
    direccion: 'Información personal · Dirección',
    tipo_vivienda: 'Información financiera · Otra información financiera',
    anos_direccion: 'Información personal · Dirección',
    ocupacion: 'Información financiera · Otra información financiera',
    empresa: 'Información personal · Otra información',
    cargo: 'Información personal · Otra información',
    antiguedad: 'Información financiera · Otra información financiera',
    ingreso_mes: 'Información financiera · Otra información financiera',
    gastos_mes: 'Información financiera · Otra información financiera',
    dia_pago: 'Información financiera · Otra información financiera',
    ref1_nombre: 'Información personal · Nombre',
    ref1_parentesco: 'Información personal · Otra información',
    ref1_celular: 'Información personal · Número de teléfono',
    ref2_nombre: 'Información personal · Nombre',
    ref2_parentesco: 'Información personal · Otra información',
    ref2_celular: 'Información personal · Número de teléfono'
  };

  /* Lo que la app recoge y NO viene del formulario. Va aparte porque no hay de
     dónde derivarlo, y por eso mismo es lo que se olvida declarar. */
  var FUERA_DEL_FORMULARIO = [
    { id: 'contrasena', etiqueta: 'Tu contraseña',
      categoria: 'Información personal · Credenciales de usuario',
      obligatorio: true, proposito: 'Para que solo tú puedas entrar a tu cuenta.',
      nota: 'No la guarda la app: la guarda el servicio de autenticación, cifrada. Nadie la puede leer, tampoco nosotros.' },
    { id: 'foto_cedula', etiqueta: 'Foto de tu cédula',
      categoria: 'Información personal · Otros documentos de identificación',
      obligatorio: false, proposito: 'Confirmar que la cédula es tuya y que nadie pide crédito con tu nombre.',
      nota: 'Opcional y con su propia autorización, aparte de la general.' },
    { id: 'foto_rostro', etiqueta: 'Foto de tu rostro',
      categoria: 'Fotos y videos · Fotos',
      obligatorio: false, proposito: 'Confirmar que la cédula es tuya.',
      nota: 'Se guarda la FOTO y nada más. No se genera ni se almacena ninguna plantilla biométrica: el óvalo de la pantalla es un asistente de encuadre, no un verificador de identidad.' },
    /* 9-sep-2026 — las dos que entraron con el registro verificado del 8-sep y
       no se habían declarado. Sin estas filas, la ficha de Google decía que la
       app no recoge ubicación mientras la pedía en pantalla. */
    { id: 'ubicacion', etiqueta: 'Dónde estás al registrarte',
      categoria: 'Ubicación · Ubicación aproximada',
      obligatorio: false, proposito: 'Confirmar que quien se registra está donde dice estar.',
      nota: 'Se pide UNA vez, con su propia autorización aparte, y solo si la das. La app no te sigue: no hay ubicación en segundo plano ni cuando está cerrada.' },
    { id: 'datos_tecnicos', etiqueta: 'Tu dirección IP y tu aparato',
      categoria: 'Información de la app y rendimiento · Otros datos de la app',
      obligatorio: true, proposito: 'Reconocer un registro hecho desde el mismo aparato que otro, y detectar suplantación.',
      nota: 'No los manda el teléfono —se falsifican en un segundo—: los lee el servidor de la propia petición. La IP dice la ciudad aproximada de la red, no tu casa.' },
    { id: 'historial_credito', etiqueta: 'Tus créditos y tus pagos',
      categoria: 'Información financiera · Historial de compras',
      obligatorio: true, proposito: 'Es tu historial: lo que pediste, lo que pagaste y cuándo.',
      nota: 'Lo genera el uso del servicio, no lo escribe el socio.' }
  ];

  /**
   * La tabla completa para el formulario de Data Safety. Se deriva; no se
   * escribe. Cada fila trae lo que Google pregunta, en el mismo orden.
   */
  function datosQueRecoge() {
    var delFormulario = U.CAMPOS.map(function (c) {
      return {
        id: c.id,
        etiqueta: c.etiqueta,
        categoria: CATEGORIA[c.id] || null,
        obligatorio: c.obligatorio,
        proposito: c.porque,
        compartido: false,
        nota: ''
      };
    });
    var extra = FUERA_DEL_FORMULARIO.map(function (d) {
      return {
        id: d.id, etiqueta: d.etiqueta, categoria: d.categoria,
        obligatorio: d.obligatorio, proposito: d.proposito,
        compartido: false, nota: d.nota
      };
    });
    return delFormulario.concat(extra);
  }

  /** Los campos que quedaron sin categoría. Si hay alguno, la declaración miente. */
  function datosSinCategoria() {
    return datosQueRecoge().filter(function (d) { return !d.categoria; });
  }

  /** Agrupado como lo pide la consola: por categoría, con sus datos adentro. */
  function porCategoria() {
    var mapa = {};
    datosQueRecoge().forEach(function (d) {
      if (!mapa[d.categoria]) mapa[d.categoria] = [];
      mapa[d.categoria].push(d);
    });
    return Object.keys(mapa).sort().map(function (k) {
      return { categoria: k, datos: mapa[k] };
    });
  }

  /* Lo que la app NO recoge, y que Google pregunta expresamente. Decirlo en
     positivo sirve para dos cosas: llenar el formulario sin dudar, y que quede
     escrito qué habría que revisar si algún día alguien mete una librería. */
  /* 9-sep-2026 — SE CAYERON DOS FILAS DE ESTA LISTA, y las dos por el mismo
     motivo: dejaron de ser verdad el 8-sep y nadie lo notó.
     · «Ubicación»: el registro pide el GPS desde el 8-sep. No se quita el dato,
       se DECLARA (fila 'ubicacion' de FUERA_DEL_FORMULARIO).
     · «Información de salud»: el código de barras de la cédula trae el RH y
       subía dentro de la huella. Ese sí se quitó de raíz (play/index.html:
       delete r.rh), así que la app vuelve a no recogerlo — pero la línea no
       vuelve a esta lista hasta que haya un centinela que lo vigile.
     Una lista de «esto NO lo recojo» que se queda vieja es peor que no tenerla:
     se publica tal cual en la ficha de Google. */
  var NO_RECOGE = [
    'Contactos',
    'Mensajes SMS o de otras apps',
    'Registro de llamadas',
    'Archivos, música o fotos de la galería',
    'Actividad de navegación',
    'Identificadores de publicidad',
    'Rendimiento de la app o registros de fallos',
    'Datos de terceros comprados o inferidos'
  ];

  /* ==========================================================================
   * LA DIVULGACIÓN DEL CRÉDITO
   *
   * Google exige: plazo mínimo y máximo, TAE máxima, y un ejemplo representativo
   * del costo total incluyendo capital y TODOS los cargos. Tiene que ir en la
   * ficha de la tienda Y dentro de la app, en el mismo sitio donde se pide.
   *
   * Sale de simular(), o sea del mismo cálculo que ve el socio. Si se escribiera
   * a mano, el día que cambie el techo la ficha diría una cosa y la app otra —y
   * Google compara justamente eso.
   * ======================================================================== */

  var CAPITAL_EJEMPLO = 500000;

  /**
   * @param {string} fechaISO el día para el que se cotiza (el techo cambia cada mes)
   * @returns {object} o {puede:false} si no hay techo certificado para esa fecha.
   */
  /* Los plazos que la app OFRECE de verdad, derivados y no escritos: el mínimo
     sale del piso legal que se impuso el producto (90 días, para no vivir
     pegado a los 60 de Google) y el máximo del plazo del producto. Si mañana
     alguno cambia en creditos.js, esta divulgación cambia sola. */
  function plazosOfrecidos() {
    var min = Math.ceil(C.PLAZO_MINIMO_DIAS / 30), max = C.PLAZO_MESES, out = [];
    for (var m = min; m <= max; m++) out.push(m);
    return out.length ? out : [max];
  }

  /**
   * @param fechaISO
   * @param [muestra]  {capital, meses} — el credito que el cliente tiene EN
   *   PANTALLA. Si viene, el ejemplo del texto es ESE.
   *
   * 15-sep-2026 — POR QUE EL EJEMPLO SIGUE AL DESLIZADOR.
   * Joan lo vio y tenia razon: con el deslizador en ocho millones, la pantalla
   * decia «En total vas a pagar $8.513.600» y tres centimetros mas abajo, en la
   * letra obligatoria, «Ejemplo: por $500.000 (...) un total de $532.100».
   * Dos juegos de cifras juntos y nada que diga cual es el suyo.
   *
   * El ejemplo fijo no estaba MAL —un ejemplo representativo es justo lo que
   * piden Google y la norma— pero estar bien y entenderse no son lo mismo. Un
   * cliente que lee dos totales distintos no concluye «uno es un ejemplo»:
   * concluye que le estan escondiendo algo.
   *
   * Lo que NO cambia es la tasa maxima: esa sigue siendo la del PRODUCTO
   * (la peor de todos los plazos), no la de este credito. Publicar la de su
   * cotizacion como «maxima» seria anunciar una tasa menor que la mayor que se
   * cobra — que es exactamente lo que el comentario de abajo vino a impedir.
   */
  function divulgacion(fechaISO, muestra) {
    /* 9-sep-2026 — LA TASA MÁXIMA SE BUSCA, NO SE SUPONE.
       El redondeo de la cuota mueve la tasa efectiva de un plazo a otro, y no
       en línea recta: medido con 500.000, la más alta está en CINCO meses
       (23,9947%) y no en seis (23,9788%). Mientras la app ofreció un solo
       plazo daba lo mismo; desde que ofrece de 3 a 6, publicar la de seis como
       «máxima» sería anunciar una tasa menor que la mayor que se cobra. */
    var plazos = plazosOfrecidos();
    var cotizaciones = [], i, rr, cc;
    for (i = 0; i < plazos.length; i++) {
      rr = C.simular({ perfil: 'preferente', capital: CAPITAL_EJEMPLO,
                       fecha_desembolso: fechaISO, meses: plazos[i] });
      cc = rr.puede ? rr : rr.cotizacion;
      if (cc) cotizaciones.push(cc);
    }
    var m = muestra || {};
    var r = null, c = null;
    /* Si lo que trae la pantalla no se puede cotizar, se cae al ejemplo de
       siempre, que siempre cotiza. Y va en try porque C.simular LANZA con un
       capital invalido en vez de contestar {puede:false} — un cero, un negativo
       o un campo a medias mientras alguien escribe. Sin el try, la letra
       OBLIGATORIA se lleva por delante la pantalla entera: es el mismo tipo de
       fallo que el 16-sep dejo la puerta publica en cero letras. */
    if (m.capital != null) {
      try {
        r = C.simular({ perfil: 'preferente', capital: m.capital,
                        fecha_desembolso: fechaISO,
                        meses: m.meses != null ? m.meses : undefined });
        c = r.puede ? r : r.cotizacion;
      } catch (e) { c = null; }
    }
    if (!c) {
      r = C.simular({ perfil: 'preferente', capital: CAPITAL_EJEMPLO,
                      fecha_desembolso: fechaISO });
      c = r.puede ? r : r.cotizacion;
    }
    if (!c || !cotizaciones.length) return { puede: false, motivo: r.motivo, mensaje: r.mensaje };
    /* La más cara del rango, que es la que hay que publicar. */
    var peor = cotizaciones[0];
    for (i = 1; i < cotizaciones.length; i++) {
      if (cotizaciones[i].efectivo_anual > peor.efectivo_anual) peor = cotizaciones[i];
    }
    var mesMin = plazos[0], mesMax = plazos[plazos.length - 1];

    var pct = function (x) { return (x * 100).toFixed(2).replace('.', ',') + '%'; };
    var cop = function (n) { return '$' + Math.round(n).toLocaleString('es-CO'); };

    return {
      puede: true,
      plazo_minimo_meses: mesMin,
      plazo_maximo_meses: mesMax,
      /* La TAE máxima es la del producto, no la del techo: publicar el techo
         sería anunciar una tasa que no cobramos, y eso es lo contrario de la
         transparencia que pide la norma. Y es la MAYOR de los plazos que se
         ofrecen — ver el comentario de arriba. */
      tae_maxima: peor.efectivo_anual,
      tae_plazo: peor.meses,
      ejemplo: {
        capital: c.capital,
        meses: c.meses,
        cuota: c.cuota_tipica,
        costo_total: c.costo_total,
        total_a_pagar: c.total_a_pagar
      },
      /* El texto exacto, armado acá y no en tres pantallas. Es el que va en la
         ficha de Play, en la pantalla de pedir y en el contrato: los tres tienen
         que decir el MISMO número, y la única forma de garantizarlo es que salgan
         de la misma función. */
      texto: 'Crédito de libre inversión en cuotas mensuales. ' +
        (mesMin === mesMax
          ? 'Plazo mínimo y máximo: ' + mesMax + ' meses. '
          : 'Plazo mínimo: ' + mesMin + ' meses. Plazo máximo: ' + mesMax + ' meses. ') +
        'Tasa efectiva anual máxima: ' + pct(peor.efectivo_anual) + '. ' +
        'Ejemplo: por ' + cop(c.capital) + ' a ' + c.meses + ' meses pagas ' +
        c.meses + ' cuotas de ' + cop(c.cuota_tipica) + ', para un total de ' +
        cop(c.total_a_pagar) + ' (' + cop(c.capital) + ' de capital y ' +
        cop(c.costo_total) + ' de costo). Sin cuotas de manejo, sin seguros y ' +
        'sin cargos adicionales: el costo mostrado es el costo total.' +
        /* 4-sep-2026 — SIN CERTIFICACIÓN NO SE ESCRIBE NINGÚN NÚMERO.
           La tabla de topes se vence el último día de cada mes por diseño. Desde
           el 1-sep la cotización sobrevive a eso a propósito (la tasa fija no
           sale del techo, así que la app no se queda muda), pero esta frase se
           quedó escribiéndose igual: `techo_del_mes` llegaba null y
           `pct(null)` daba «0,00%». O sea que el 1 de octubre la divulgación
           OBLIGATORIA iba a publicar «Tasa máxima legal vigente en Colombia:
           0,00%» — una afirmación falsa, en el único texto de la app que existe
           precisamente para no afirmar nada falso.
           Se calla la frase, no el precio. Lo demás del texto sigue siendo
           cierto y es lo que la norma pide del producto. */
        (c.techo_del_mes
          ? ' Tasa máxima legal vigente en Colombia: ' + pct(c.techo_del_mes) + '.'
          : ''),
      techo_del_mes: c.techo_del_mes,
      certificacion: c.certificacion
    };
  }

  /* ------------------------------------------------------------------------
   * LA DIVULGACIÓN DEL PRÉSTAMO CON GARANTÍA — 14-sep-2026
   *
   * Misma forma que la de arriba y por las mismas razones; lo único que cambia
   * es el producto. Va aparte y no como una rama de aquella porque los dos
   * precios son distintos y publicar el de uno al lado del otro fue justamente
   * el defecto que la trajo: la calculadora del crédito con garantía imprimía
   * 26,82% y debajo «Tasa efectiva anual máxima: 23,99%».
   *
   * @param fechaISO
   * @param [muestra]  {capital, meses} — el crédito que el cliente tiene EN
   *   PANTALLA. Si viene y se puede cotizar, el ejemplo del texto es ESE.
   *
   * 17-sep-2026 — EL EJEMPLO SIGUE AL DESLIZADOR, COMO EL DEL OTRO PRODUCTO.
   * Esta función nació con el ejemplo clavado en el mínimo —un millón a seis
   * meses— y eso convive con una calculadora que se repinta ENTERA en cada
   * movimiento del dedo. Medido sobre las 124 combinaciones de monto y plazo
   * que el deslizador permite: en 123 la tarjeta enseñaba un total y la letra
   * de abajo anunciaba otro. Con el deslizador en dos millones a tres meses,
   * «En total vas a pagar $2.080.528» y tres centímetros más abajo «para un
   * total de $1.071.154».
   *
   * Es el MISMO defecto que Joan encontró el 15-sep en la calculadora de
   * arriba, y se arregla por el mismo camino porque la razón es la misma: quien
   * lee dos totales distintos no concluye «uno es un ejemplo», concluye que le
   * están escondiendo algo. Y tanto el artículo 305 como la ficha de Google
   * piden que el ejemplo publicado sea el del crédito que se está cotizando.
   *
   * LO QUE NO SE MUEVE, y es la mitad que protege de la tentación contraria: la
   * TASA MÁXIMA sigue siendo la del PRODUCTO —la peor de todos los plazos— y el
   * «Desde $1.000.000» sigue siendo el mínimo de verdad. Publicar la tasa de su
   * cotización como «máxima» sería anunciar una tasa menor que la mayor que se
   * cobra, que es justo lo que el comentario de la otra divulgación impide.
   *
   * EL MÍNIMO DEL PRODUCTO SIGUE SIENDO EL EJEMPLO DE RESERVA, cuando no hay
   * muestra o la que hay no se puede cotizar: es el crédito más chico que de
   * verdad se puede pedir, así que nadie puede leer el ejemplo y pedir menos
   * esperando lo mismo.
   * --------------------------------------------------------------------- */
  function divulgacionRespaldado(fechaISO, muestra) {
    if (!M || !M.simularPrestamoRespaldado) {
      return { puede: false, motivo: 'sin_motor',
               mensaje: 'No puedo cotizar el préstamo con garantía sin el motor de reglas.' };
    }
    /* El techo del mes es el mismo para los dos productos: lo certifica la
       Superfinanciera, no el producto. */
    var techo = C.topeVigente(fechaISO);
    var vacia = { datos: {}, referidos: 0, acumulada: 0, ajuste: 0, comprometida: 0 };
    var min = Math.ceil(C.PLAZO_MINIMO_DIAS / 30);
    var max = M.PLAZO_RESPALDADO_MAX;
    if (min > max) return { puede: false, motivo: 'sin_plazos' };

    var capital = M.MONTO_MINIMO_RESPALDADO;
    var peorEA = 0, ejemplo = null, m, r, ea;
    for (m = min; m <= max; m++) {
      r = M.simularPrestamoRespaldado(capital, m, vacia, { fechaDesembolso: fechaISO });
      ea = eaDeCuotas(r, fechaISO);
      /* Una tasa que no se pudo calcular no se promedia ni se ignora: sin ella
         no se sabe cuál es el máximo, y el máximo es lo que se publica. */
      if (ea == null) return { puede: false, motivo: 'sin_tasa' };
      if (ea > peorEA) peorEA = ea;
      if (m === max) ejemplo = r;   // el ejemplo va al plazo más largo, que es el que se ofrece
    }
    if (!ejemplo) return { puede: false, motivo: 'sin_cotizacion' };

    /* Y NO SE ANUNCIA UN PRODUCTO CUYO MÁXIMO SE PASA DEL TECHO. La divulgación
       publica la tasa MÁS ALTA de los plazos que se ofrecen; si esa se pasa, lo
       que hay que hacer no es publicarla con una nota: es no ofrecer el producto
       ese día. El artículo 305 no distingue entre anunciar y cobrar.
       Sin techo certificado no se prohíbe —se calla la frase, no el precio, que
       es la decisión del 4-sep— porque no hay contra qué comparar. */
    /* 15-sep-2026 — `techo &&` era la misma reja con fecha de apertura: desde el
       dia en que la tabla se vence, techo es null y la condicion no se evalua
       nunca. Ahora se compara contra el ultimo techo conocido. La frase de la
       «tasa maxima legal» sigue callandose cuando no esta vigente —esa es la
       decision del 4-sep y no cambia—, pero el PRODUCTO deja de anunciarse si
       se pasa, vigente o no. Callar una frase y publicar un precio ilegal no
       son la misma decision. */
    var ref = C.topeDeReferencia ? C.topeDeReferencia(fechaISO) : null;
    if (ref && peorEA > ref.tope) {
      return { puede: false, motivo: 'sobre_el_techo',
               tae_maxima: peorEA, techo_del_mes: ref.tope,
               techo_vigente: ref.vigente };
    }

    /* Y AHORA SÍ, EL EJEMPLO SE CAMBIA POR EL SUYO. Va DESPUÉS del guardián del
       techo a propósito: lo primero que hay que decidir es si el producto se
       puede anunciar hoy, y esa decisión es del producto entero —de su peor
       plazo—, no del crédito que uno esté mirando. Meterlo antes haría que la
       reja dependiera del deslizador.

       SE COTIZA CON EL MISMO MOTOR Y LOS MISMOS ARGUMENTOS QUE LA PANTALLA, que
       es lo único que garantiza que el total de la letra sea idéntico al de la
       tarjeta. Bastan el capital y el plazo, y conviene saber por qué: en este
       producto la cuota y el total salen SOLO de esos dos: la garantía ganada
       mueve el cupo y la fecha de arranque mueve el calendario, pero ninguna de
       las dos mueve las cifras. Por eso no hay que pasear el estado de la
       pantalla por acá — y por eso esto no puede desincronizarse.

       Va en try porque simularPrestamoRespaldado LANZA con un capital o un
       plazo inválidos en vez de contestar: un cero, un negativo, un campo a
       medias mientras alguien escribe. Sin el try, la letra OBLIGATORIA se
       lleva por delante la pantalla entera. Es la misma reja que la de arriba.

       Y POR DEBAJO DEL MÍNIMO NO SE CAMBIA: dos renglones antes el texto dice
       «Desde $1.000.000», y poner ahí un ejemplo de $300.000 sería esa misma
       frase contradiciéndose sola. Se queda el del mínimo, que es la verdad. */
    var s = muestra || {};
    if (s.capital != null) {
      try {
        var suyo = M.simularPrestamoRespaldado(s.capital,
          s.meses != null ? s.meses : max, vacia, { fechaDesembolso: fechaISO });
        if (suyo && suyo.cumple_minimo) ejemplo = suyo;
      } catch (e) { /* se queda el del mínimo, que siempre cotiza */ }
    }

    var pct = function (x) { return (x * 100).toFixed(2).replace('.', ',') + '%'; };
    var cop = function (n) { return '$' + Math.round(n).toLocaleString('es-CO'); };

    return {
      puede: true,
      plazo_minimo_meses: min,
      plazo_maximo_meses: max,
      monto_minimo: capital,
      tae_maxima: peorEA,
      ejemplo: {
        capital: ejemplo.capital, meses: ejemplo.plazo_meses,
        cuota: ejemplo.cuota_fija, costo_total: ejemplo.costo_total,
        total_a_pagar: ejemplo.total_a_pagar
      },
      texto: 'Préstamo con garantía, en cuotas mensuales iguales. Desde ' +
        cop(capital) + '. ' +
        (min === max ? 'Plazo mínimo y máximo: ' + max + ' meses. '
                     : 'Plazo mínimo: ' + min + ' meses. Plazo máximo: ' + max + ' meses. ') +
        'Tasa efectiva anual máxima: ' + pct(peorEA) + '. ' +
        'Ejemplo: por ' + cop(ejemplo.capital) + ' a ' + ejemplo.plazo_meses +
        ' meses pagas ' + ejemplo.plazo_meses + ' cuotas de ' + cop(ejemplo.cuota_fija) +
        ', para un total de ' + cop(ejemplo.total_a_pagar) + ' (' + cop(ejemplo.capital) +
        ' de capital y ' + cop(ejemplo.costo_total) + ' de costo). El costo se cobra ' +
        'sobre el saldo que debes, así que baja cada mes. Sin cuotas de manejo, sin ' +
        'seguros y sin cargos adicionales: el costo mostrado es el costo total.' +
        /* Sin certificación no se escribe ningún número: es la misma nota del
           4-sep que evitó publicar «tasa máxima legal: 0,00%». */
        (techo ? ' Tasa máxima legal vigente en Colombia: ' +
                 pct(techo.consumo_ordinario) + '.' : ''),
      techo_del_mes: techo ? techo.consumo_ordinario : null,
      certificacion: techo ? techo.fuente : null
    };
  }

  /* La efectiva anual del FLUJO REAL de una cotización con garantía: lo que se
     recibe y lo que se devuelve, cuota por cuota Y EN SU FECHA.
     16-sep-2026: esto usaba C.efectivoAnual, que supone treinta días parejos
     entre cuotas. Las de este producto caen en los cortes —el 15 y el fin de
     mes— así que con desembolso el 10 la primera cae a veinte días. La plata
     vuelve antes y la tasa de verdad es más alta: hasta 33,07% donde esta
     función devolvía 26,82%. La divulgación obligatoria publicaba esa cifra
     como «tasa efectiva anual máxima», o sea que el texto que existe para no
     afirmar nada falso estaba afirmando un máximo por debajo del real. */
  function eaDeCuotas(r, fechaISO) {
    return C.efectivoAnualPorFechas(fechaISO, r.capital,
      r.cuotas.map(function (q) { return { fecha: q.fecha_corte, total: q.total }; }));
  }

  /* ==========================================================================
   * EL BORRADO DE LA CUENTA
   *
   * Play lo exige desde 2023: tiene que poderse pedir DESDE la app y también
   * desde una dirección web pública, sin instalar nada. La URL va en la ficha.
   *
   * Y hay que decir qué se borra y qué NO, porque no todo se puede: un crédito
   * pagado es un soporte contable y la ley obliga a conservarlo. Prometer que se
   * borra todo y no hacerlo es peor que decir la verdad desde el principio.
   * ======================================================================== */

  var BORRADO = {
    url_publica: 'https://tugarantia.net/play/borrar-cuenta.html',
    se_borra: [
      'Tu cuenta y tu contraseña: dejas de poder entrar.',
      'Tu celular, tu correo y tu dirección.',
      'Los datos de tu empleo y tus ingresos.',
      'Tus referencias personales.',
      'Las fotos de tu cédula y tu selfie, si las diste.'
    ],
    se_conserva: [
      { que: 'Los créditos que ya te desembolsamos y sus pagos',
        cuanto: 'mientras exista la obligación y el tiempo que exige la ley comercial',
        porque: 'Es el soporte contable de una operación de crédito. Ni tú ni nosotros lo podemos borrar mientras la ley lo exija.' },
      { que: 'La constancia de tu autorización de datos',
        cuanto: 'el mismo tiempo',
        porque: 'Es la prueba de que nos diste permiso. Borrarla nos dejaría sin cómo demostrarlo.' }
    ],
    plazo_dias: 15,
    como: [
      'Desde la app: Mi cuenta → Borrar mi cuenta.',
      'Sin la app: entra a la dirección de arriba y llena el formulario.',
      'O escríbenos por WhatsApp y lo hacemos nosotros.'
    ]
  };

  return {
    VERSION: '2026-08-11',

    /* seguridad de los datos */
    CATEGORIA: CATEGORIA,
    FUERA_DEL_FORMULARIO: FUERA_DEL_FORMULARIO,
    NO_RECOGE: NO_RECOGE,
    datosQueRecoge: datosQueRecoge,
    datosSinCategoria: datosSinCategoria,
    porCategoria: porCategoria,

    /* divulgación del crédito */
    CAPITAL_EJEMPLO: CAPITAL_EJEMPLO,
    divulgacion: divulgacion,
    divulgacionRespaldado: divulgacionRespaldado,

    /* borrado de cuenta */
    BORRADO: BORRADO
  };
});
