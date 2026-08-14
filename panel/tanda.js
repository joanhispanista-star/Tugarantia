/* ===========================================================================
 * LA TANDA — a quién se le puede escribir AHORA, y a quién no, y por qué.
 * 14 de agosto de 2026.
 *
 * QUÉ ES ESTO Y QUÉ NO ES.
 * Joan pidió "poder enviar masivamente mensajes por WhatsApp". Esto NO es eso, y
 * el archivo entero está escrito para no fingir que lo es. WhatsApp no deja
 * enviar en masa de forma personalizada sin la Cloud API de Meta (SIM aparte,
 * verificación de negocio, plantillas a aprobación y un servidor con un token
 * secreto que este sitio estático no tiene). Lo que sí se puede hacer hoy, sin
 * trámite y sin arriesgar el número donde vive toda su cartera, es esto: el
 * sistema decide A QUIÉN, CON QUÉ TEXTO y SI LA LEY LO PERMITE; Joan abre el
 * chat y toca enviar, uno por uno.
 *
 * Lo masivo es el TRABAJO PREVIO. El envío sigue siendo de a uno, y la pantalla
 * lo dice con esas palabras y con la cuenta de cuántos minutos le va a tomar.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE Y NO ESTÁ TODO DENTRO DE espejo.html.
 * Porque lo que decide acá adentro es si un contacto CUMPLE LA LEY 2300, y eso
 * tiene que poderse probar con `node --test` sin abrir un navegador. Una regla
 * legal metida en una función de pintar no se prueba nunca.
 *
 * REGLA DE ORO, LA MISMA DE puente.js: acá no hay ni un setItem, ni un fetch, ni
 * un document. Funciones puras: reciben datos y devuelven objetos nuevos.
 *
 * LO QUE ESTE ARCHIVO NO CALCULA, POR REGLA DE LA CASA.
 * Ni un peso. No sabe cuánto debe nadie, ni cuántos días de mora lleva, ni qué
 * dice la plantilla. Todo eso se lo pasa quien llama, y quien llama se lo
 * pregunta al puente y al motor. Este proyecto llegó a tener doce copias de la
 * misma cuenta y dos contestaban distinto al mismo cliente: acá no nace la
 * trece.
 *
 * LO QUE SÍ ES NUEVO Y VIVE SOLO ACÁ: el TOPE SEMANAL de la Ley 2300, que no
 * estaba implementado en ninguna parte del repositorio (crm.html:976 y
 * espejo.html:619 solo tienen el tope diario). No es una regla duplicada: es una
 * regla que faltaba.
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TandaTuGarantia = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* =========================================================================
   * LO QUE DICE LA LEY, CON NÚMEROS, EN UN SOLO SITIO
   * =======================================================================*/

  /* Ley 2300 de 2023, artículo 3: «Una vez establecido un contacto directo con
     el consumidor, este no podrá ser contactado por parte de gestores de
     cobranza mediante varios canales dentro de una misma semana ni en más de
     una ocasión durante el mismo día.»

     DE AHÍ SALEN DOS REGLAS Y EL CÓDIGO SOLO TENÍA UNA.

     1) TOPE DIARIO — máximo un contacto al día. Ya estaba (contactadoHoy).
     2) TOPE SEMANAL — y acá está la trampa: la ley NO dice «un contacto por
        semana». Dice que no se puede usar VARIOS CANALES en la misma semana. La
        doctrina especializada (Ciclo de Riesgo, Colcob, Externado) lo lee como
        «un solo canal por semana»; otros comentaristas lo leen como «un solo
        contacto por semana». No hay concepto de la SIC que zanje la duda.

     QUÉ SE IMPLEMENTA Y POR QUÉ LA LECTURA ESTRICTA.
     Un contacto de cobranza por persona por semana, sin mezclar canales. Cumple
     las DOS lecturas a la vez, y la pregunta que resuelve los casos raros de
     esta casa —«¿esto hace que la exposición de Joan CREZCA?»— contesta que sí
     en cuanto se elige la lectura laxa: la sanción la impone la SIC y empieza
     con UNA queja de un socio molesto, no con una auditoría.

     ES POR PERSONA, NO POR CRÉDITO. El artículo habla del «consumidor». Si un
     socio tiene dos créditos con Joan, sigue siendo un contacto al día y uno a
     la semana EN TOTAL. El código ya lo hacía bien por accidente: las gestiones
     cuelgan del socio (s.gestiones), no del préstamo. Acá se hace a propósito:
     todas las funciones de tope reciben un SOCIO. */
  var DIAS_SEMANA = 7;

  /* VENTANA MÓVIL DE 7 DÍAS, no semana calendario. Tampoco está definido en la
     ley cuál de las dos es. La móvil es la más restrictiva —escribir el domingo
     y el lunes son dos semanas calendario pero un solo día de diferencia—, así
     que es la que se implementa. */
  var SEMANA_ES_VENTANA_MOVIL = true;

  /* Ritmo. No es la ley: es la política de spam de WhatsApp, que se aplica sola
     y sin avisar. Por encima de unos 60 chats por hora la cuenta entra en
     restricción, y la escalada es bajar el límite → restricción temporal →
     baneo permanente. El número que se juega es EL NÚMERO DE TRABAJO de Joan,
     donde están los chats de toda la cartera y los comprobantes de pago: si lo
     pierde, pierde la prueba de las conversaciones, no solo el chat.
     40 es bien por debajo del umbral conocido, a propósito. */
  var TOPE_CHATS_HORA = 40;

  /* Cuánto tarda de verdad una persona: abrir la tarjeta, leer el monto, tocar
     «Abrir WhatsApp», saltar de app, revisar el texto, enviar, volver atrás.
     Entre 25 y 40 segundos cuando todo sale bien. NO incluye el rato que se
     queda conversando con los cuatro o cinco que contestan al instante, y por
     eso la pantalla dice las dos cosas por separado en vez de dar un número
     redondo que después no se cumple. */
  var SEGUNDOS_MIN = 25;
  var SEGUNDOS_MAX = 40;

  /* =========================================================================
   * UTILIDADES MÍNIMAS (mismo estilo que puente.js: sin dependencias)
   * =======================================================================*/
  function lista(v) { return Array.isArray(v) ? v : []; }
  function objeto(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function texto(v) { return v == null ? '' : String(v); }
  function num(v) { return Number(v) || 0; }

  /* Resta de fechas ISO en días. Se hace con UTC a mediodía y no con `new
     Date(iso)` a secas: una fecha ISO corta la interpreta el navegador como
     medianoche UTC, y en Colombia (UTC-5) eso es el día anterior a las 7pm. Ya
     nos costó un día entero de diferencia en otro sitio del proyecto. */
  function aDia(iso) {
    var t = texto(iso).slice(0, 10).split('-');
    if (t.length !== 3) return null;
    var d = Date.UTC(Number(t[0]), Number(t[1]) - 1, Number(t[2]), 12, 0, 0);
    return isNaN(d) ? null : d;
  }
  function diasEntre(isoA, isoB) {
    var a = aDia(isoA), b = aDia(isoB);
    if (a == null || b == null) return null;
    return Math.round((b - a) / 86400000);
  }

  /* =========================================================================
   * 1 · LOS TOPES DE CONTACTO
   *
   * Todo sale de UNA primitiva —los contactos dentro de una ventana de días—
   * para que el tope diario y el semanal no puedan contestar cosas distintas.
   * =======================================================================*/

  /**
   * Las gestiones del socio que caen dentro de los últimos `dias` días
   * contando `hasta` como el día de hoy. `dias=1` es «hoy»; `dias=7` es la
   * ventana de la semana.
   *
   * DOS DATOS ROTOS Y DOS TRATOS DISTINTOS, a propósito:
   *
   *   · Gestión SIN FECHA: se ignora. No hay con qué ubicarla, y contarla como
   *     contacto bloquearía a ese socio para siempre sin poder decirle a Joan
   *     por qué ni cuándo se libera.
   *   · Gestión con fecha FUTURA: cuenta, pero COMO SI FUERA HOY. Una fecha
   *     futura es un reloj mal puesto o un dedazo, no una licencia para
   *     escribir otra vez, así que no se descarta. Y se acerca a hoy en vez de
   *     respetarse porque un dedazo de año (2027 en vez de 2026) dejaría al
   *     socio bloqueado doce meses, con un aviso diciendo «hace -400 días» que
   *     no significa nada. Bloquear hoy y esta semana es lo conservador con
   *     techo; bloquear un año es un defecto disfrazado de prudencia.
   */
  function contactosEnVentana(socio, hasta, dias) {
    var n = Math.max(1, Math.round(num(dias) || 1));
    return lista(objeto(socio).gestiones).filter(function (g) {
      var d = diasEntre(texto(objeto(g).fecha), hasta);
      if (d == null) return false;
      if (d < 0) d = 0;                 // futura: se trata como de hoy
      return d < n;
    });
  }

  /** Tope diario de la Ley 2300: máximo un contacto al día. */
  function contactadoHoy(socio, hoy) {
    return contactosEnVentana(socio, hoy, 1).length > 0;
  }

  /**
   * Tope semanal. Devuelve el contacto que bloquea, no un booleano: la pantalla
   * tiene que poder decir CUÁNDO fue y POR QUÉ CANAL, porque «no puedes» sin
   * motivo es un número en el que Joan no confía y termina abriendo WhatsApp
   * por fuera de la tanda.
   * @returns {{si:boolean, gestion:object|null, dias:number|null}}
   */
  function contactadoEstaSemana(socio, hoy) {
    var g = contactosEnVentana(socio, hoy, DIAS_SEMANA);
    if (!g.length) return { si: false, gestion: null, dias: null };
    /* El MÁS RECIENTE, que es el que manda cuándo se libera. */
    var ultimo = g.slice().sort(function (a, b) {
      return texto(a.fecha) < texto(b.fecha) ? 1 : texto(a.fecha) > texto(b.fecha) ? -1 : 0;
    })[0];
    /* El mismo techo de contactosEnVentana: una gestión con fecha futura vale
       como de hoy, y no como «hace -6 días», que en pantalla no dice nada. */
    var d = diasEntre(texto(ultimo.fecha), hoy);
    return { si: true, gestion: ultimo, dias: (d == null || d < 0) ? 0 : d };
  }

  /**
   * El canal ya usado esta semana, si hay uno. Es la lectura literal del
   * artículo 3: lo prohibido es MEZCLAR canales dentro de la misma semana.
   * Con la regla estricta que implementa este archivo esto queda como
   * información —el semanal ya bloqueó— pero se calcula igual porque es lo que
   * permite escribir en pantalla «esta semana ya le escribiste por WhatsApp» en
   * vez de un «no puedes» pelado.
   */
  /**
   * ¿Ya se le escribió HOY desde este mismo grupo?
   *
   * Existe por la tanda de servicio, que se salta los topes de la Ley 2300 con
   * razón (agradecer un pago no es cobranza) pero que sin esto se convierte en
   * una máquina de agradecer dos veces: como nada la excluye, la persona sigue
   * en la lista después de escribirle y vuelve a salir la próxima vez que Joan
   * abra el grupo. Dos «gracias por tu pago» seguidos no infringen ninguna ley
   * y quedan igual de mal.
   */
  function contactadoEnGrupoHoy(socio, hoy, grupo) {
    if (!texto(grupo)) return false;
    return contactosEnVentana(socio, hoy, 1).some(function (g) {
      return texto(objeto(g).grupo) === texto(grupo);
    });
  }

  function canalUsadoEstaSemana(socio, hoy) {
    var g = contactosEnVentana(socio, hoy, DIAS_SEMANA);
    for (var i = 0; i < g.length; i++) {
      if (texto(g[i].canal)) return texto(g[i].canal);
    }
    return '';
  }

  /**
   * Cuántos chats se abrieron en los últimos 60 minutos, en TODA la cartera.
   * Es la guarda contra el baneo de WhatsApp, no contra la ley.
   *
   * Solo cuenta las gestiones que traen `hora`. Las que no la traen son las que
   * escribió el computador (crm.html:1673 guarda fecha y canal, sin hora) y no
   * hay forma de ubicarlas dentro del día: contarlas todas como «hace un
   * momento» frenaría la tanda con gestiones de la mañana. Se dice en el
   * informe y se cuenta lo que sí se puede contar.
   */
  function chatsEnLaUltimaHora(socios, ahora) {
    var t = (ahora instanceof Date) ? ahora.getTime() : new Date(ahora).getTime();
    if (isNaN(t)) return 0;
    var n = 0;
    lista(socios).forEach(function (s) {
      lista(objeto(s).gestiones).forEach(function (g) {
        var h = objeto(g).hora;
        if (!h) return;
        var m = new Date(h).getTime();
        if (isNaN(m)) return;
        if (t - m >= 0 && t - m < 3600000) n++;
      });
    });
    return n;
  }

  /* =========================================================================
   * 2 · LOS GRUPOS
   *
   * Cada grupo es una lista distinta con una plantilla distinta y una regla
   * distinta. COBRO y PUBLICIDAD no comparten ni la lista ni la ley:
   *
   *   · COBRO      lo gobierna la Ley 2300. Horario obligatorio, uno al día,
   *                uno a la semana. NO necesita autorización comercial: es la
   *                relación del crédito. Lista: quien debe.
   *   · PUBLICIDAD la gobierna el habeas data (Ley 1581 y la SIC). Necesita
   *                autorización previa, expresa e informada POR ESA FINALIDAD,
   *                y un «no me escriba más» que se respete. Lista: quien
   *                autorizó Y NO DEBE NADA.
   *
   * Y LA REGLA QUE MÁS IMPORTA DE LAS DOS: A NADIE EN MORA SE LE MANDA
   * PUBLICIDAD. Ofrecerle un crédito nuevo a quien está atrasado es cobranza
   * disfrazada, es lo que un juez leería como presión, y contesta que sí a la
   * pregunta que resuelve los casos raros: hace CRECER la exposición de Joan.
   * Está mal por las dos vías. Por eso `sinDeuda` es parte de la definición del
   * grupo y no una casilla que se pueda desmarcar.
   * =======================================================================*/

  var GRUPOS = [
    { clave: 'hoy', tipo: 'cobro', titulo: 'Vencen hoy',
      ayuda: 'La tanda que más plata mueve. Es la primera de la mañana.',
      plantilla: 'venceHoy' },

    { clave: 'mora-temprana', tipo: 'cobro', titulo: 'Mora de 1 a 5 días',
      ayuda: 'Casi todos son olvidos. Tono de recordatorio, no de cobro duro: acá se recupera casi todo.',
      plantilla: 'moraTemprana' },

    { clave: 'mora', tipo: 'cobro', titulo: 'Mora de 6 días o más',
      ayuda: 'Acá se ofrece prórroga o plan con el monto que da el puente. Es el grupo donde el tope semanal muerde de verdad, porque es a quien uno quiere escribirle todos los días.',
      plantilla: 'mora' },

    { clave: 'proximos', tipo: 'cobro', titulo: 'Vencen en 1 o 2 días',
      ayuda: 'El grupo más rentable y el que nadie hace: evitar la mora sale más barato que cobrarla. Es aviso de servicio, no requerimiento.',
      plantilla: null },   // recordatorio1 / recordatorio2 según los días

    { clave: 'pagaron-ayer', tipo: 'servicio', titulo: 'Pagaron ayer',
      ayuda: 'Agradecer y dejar constancia. No es cobranza, así que no gasta el cupo de la Ley 2300 ' +
             '(art. 8: confirmación de operaciones). Pero SÍ queda anotado, y para el cliente eres tú ' +
             'escribiéndole otra vez: mañana la tanda de cobro lo va a ver contactado.',
      plantilla: 'recibo' },

    /* Los cuatro de publicidad se declaran para poder EXPLICARLOS en pantalla,
       no para poder usarlos. Ver bloqueoDePublicidad(): hoy los cuatro están
       bloqueados y no por una casilla sin marcar, sino porque la política
       publicada no autoriza esa finalidad. */
    { clave: 'con-cupo', tipo: 'publicidad', titulo: 'Al día y con cupo libre',
      ayuda: 'Gente que ya pagó bien y puede volver a tomar. Es la única tanda comercial con sentido real.',
      sinDeuda: true },
    { clave: 'reactivar', tipo: 'publicidad', titulo: 'Terminaron hace más de 15 días',
      ayuda: 'Reactivación.', sinDeuda: true },
    { clave: 'respaldan', tipo: 'publicidad', titulo: 'Socios que respaldan a alguien',
      ayuda: 'Para contarles su garantía ganada y su nivel.', sinDeuda: true },
    { clave: 'invitaciones', tipo: 'publicidad', titulo: 'Invitaciones emitidas sin usar',
      ayuda: 'Tiene que dejar de insistir después de la segunda vez.', sinDeuda: true }
  ];

  function grupoPorClave(clave) {
    for (var i = 0; i < GRUPOS.length; i++) if (GRUPOS[i].clave === clave) return GRUPOS[i];
    return null;
  }
  function gruposDeTipo(tipo) {
    return GRUPOS.filter(function (g) { return g.tipo === tipo; });
  }

  /* =========================================================================
   * 3 · POR QUÉ ALGUIEN SE QUEDA FUERA
   *
   * El orden importa y no es estético: se devuelve UN motivo por persona, el
   * primero que aplique, y el primero tiene que ser el que Joan no puede
   * arreglar. Decirle «no tiene teléfono» a alguien que además está fuera de
   * horario lo manda a editar una ficha que igual no va a poder usar hoy.
   * =======================================================================*/

  var MOTIVOS = {
    horario:   'fuera del horario de cobranza (Ley 2300)',
    hoy:       'ya lo contactaste hoy (máximo uno al día, Ley 2300)',
    semana:    'ya lo contactaste esta semana (Ley 2300)',
    yaEnGrupo: 'ya le escribiste hoy desde esta misma tanda',
    sinTel:    'no tiene teléfono en la ficha',
    sinAutorizacion: 'no ha autorizado recibir publicidad',
    baja:      'pidió no recibir más publicidad'
  };

  /**
   * @param caso  {socio, telefono, ...} — lo arma quien llama con el puente.
   * @param ctx   {hoy, horario:{ok,motivo}, tipo:'cobro'|'servicio'|'publicidad'}
   * @returns {{clave:string, texto:string, detalle:string}|null}  null = puede escribirle.
   */
  function motivoDeExclusion(caso, ctx) {
    var c = objeto(caso), x = objeto(ctx);
    var hoy = texto(x.hoy);
    var s = objeto(c.socio);

    /* 1. EL HORARIO ES DE TODOS, NO DE UNO. Fuera de horario no hay tanda de
       contacto: ni de cobro ni de publicidad. El artículo 5 de la Ley 2300
       extiende los horarios del artículo 3 a los mensajes publicitarios y
       comerciales, así que la misma compuerta gobierna las dos. */
    var hor = objeto(x.horario);
    if (hor.ok === false) {
      return { clave: 'horario', texto: MOTIVOS.horario, detalle: texto(hor.motivo) };
    }

    /* 2. Los topes. Se saltan SOLO en la tanda de servicio («pagaron ayer»),
       porque agradecer un pago no es una gestión de cobranza y el artículo 8
       exceptúa expresamente la confirmación de operaciones. Aun así, esa tanda
       ANOTA la gestión (ver espejo.html): para el cliente es Joan escribiéndole
       otra vez, y lo que se anota hoy es lo que frena la tanda de cobro de
       mañana. La excepción es de entrada, nunca de registro. */
    if (x.tipo === 'servicio') {
      /* La excepción del artículo 8 la exime de los topes, no de la sensatez:
         dos «gracias por tu pago» el mismo día quedan igual de mal que dos
         cobros. Y a diferencia del cobro, acá nada más la sacaría de la lista. */
      if (contactadoEnGrupoHoy(s, hoy, x.grupo)) {
        return { clave: 'yaEnGrupo', texto: MOTIVOS.yaEnGrupo, detalle: '' };
      }
    } else {
      if (contactadoHoy(s, hoy)) {
        return { clave: 'hoy', texto: MOTIVOS.hoy, detalle: '' };
      }
      var sem = contactadoEstaSemana(s, hoy);
      if (sem.si) {
        var canal = texto(objeto(sem.gestion).canal) || 'otro canal';
        return {
          clave: 'semana', texto: MOTIVOS.semana,
          detalle: 'hace ' + sem.dias + ' día(s), por ' + canal +
            '. Se libera en ' + (DIAS_SEMANA - sem.dias) + ' día(s).'
        };
      }
    }

    /* 3. Sin teléfono no hay chat. Es el único motivo que Joan puede arreglar
       ahí mismo, y por eso va con la ficha a un toque. */
    if (!texto(c.telefono)) {
      return { clave: 'sinTel', texto: MOTIVOS.sinTel, detalle: '' };
    }

    /* 4. Publicidad: la autorización. Hoy esto no se llega a evaluar nunca
       porque la tanda entera está bloqueada más arriba (bloqueoDePublicidad),
       pero la regla queda escrita acá para que el día que se desbloquee no haya
       que inventarla con prisa. Por defecto es NO: el consentimiento del
       habeas data no se presume. */
    if (x.tipo === 'publicidad') {
      var aut = objeto(s.autorizaPublicidad);
      if (aut.baja) return { clave: 'baja', texto: MOTIVOS.baja, detalle: texto(aut.baja) };
      if (aut.valor !== true) return { clave: 'sinAutorizacion', texto: MOTIVOS.sinAutorizacion, detalle: '' };
    }

    return null;
  }

  /* =========================================================================
   * 4 · ARMAR LA TANDA
   * =======================================================================*/

  /**
   * Parte los casos en los que se puede tocar ahora y los que no, con el motivo
   * contado por separado.
   *
   * NO CONGELA LA LISTA, y esa es la decisión de diseño más importante del
   * archivo: la tanda se RECALCULA cada vez que se abre. Guardar la lista de
   * pendientes parece más cómodo hasta el día en que guarda a alguien que pagó
   * anoche y Joan le cobra a un cliente que está al día, con el cliente
   * leyéndolo. Lo que se guarda es por dónde iba (ver espejo.html), no a quién
   * le faltaba.
   *
   * @param casos [{id, socioId, socio, telefono, prioridad, orden, ...}]
   * @param ctx   {hoy, horario, tipo, saltados:[socioId]}
   */
  function armarTanda(casos, ctx) {
    var x = objeto(ctx);
    var saltados = {};
    lista(x.saltados).forEach(function (s) {
      var k = texto(objeto(s).socioId || s);
      if (k) saltados[k] = objeto(s).motivo || 'saltado';
    });

    /* PASO 1 — ORDENAR. Por prioridad y después por la fecha de corte, igual
       que la cola del computador (crm.html:1220 renderCola). Estable. */
    var ordenados = lista(casos).map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) {
        var pa = num(a.c.prioridad), pb = num(b.c.prioridad);
        if (pa !== pb) return pa - pb;
        var oa = texto(a.c.orden), ob = texto(b.c.orden);
        if (oa !== ob) return oa < ob ? -1 : 1;
        return a.i - b.i;
      })
      .map(function (x2) { return x2.c; });

    /* PASO 2 — UNA PERSONA, UNA VEZ, Y ANTES DE FILTRAR NADA.
       El tope de la Ley 2300 es por CONSUMIDOR: un socio con dos créditos
       vencidos es un contacto, no dos. Se deduplica antes del filtro legal y no
       después, y eso no es una preferencia de estilo — es lo que hace que TODOS
       los números de esta pantalla cuenten personas. Si se dedujera después,
       «a 3 ya los contactaste hoy» podría estar contando a la misma señora tres
       veces y la caja de arriba dejaría de cuadrar. Y una caja que no cuadra se
       deja de mirar.
       Se queda el crédito MÁS URGENTE (el orden ya se aplicó) y el caso que
       sobrevive lleva escrito cuántos más tiene esa persona: el mensaje habla
       de UN crédito, y eso la pantalla lo tiene que decir en vez de dejar que
       Joan lo descubra con el cliente al teléfono. */
    var porSocio = {}, unicos = [];
    ordenados.forEach(function (c) {
      var k = texto(objeto(c).socioId);
      if (k && Object.prototype.hasOwnProperty.call(porSocio, k)) {
        unicos[porSocio[k]].otrosDelMismoSocio++;
        return;
      }
      var copia = {};
      Object.keys(objeto(c)).forEach(function (kk) { copia[kk] = c[kk]; });
      copia.otrosDelMismoSocio = 0;
      if (k) porSocio[k] = unicos.length;
      unicos.push(copia);
    });

    /* PASO 3 — EL FILTRO LEGAL. */
    var listos = [], fuera = [], porMotivo = {};
    unicos.forEach(function (c) {
      var m = motivoDeExclusion(c, x);
      if (m) {
        fuera.push({ caso: c, motivo: m });
        if (!porMotivo[m.clave]) porMotivo[m.clave] = { clave: m.clave, texto: m.texto, casos: [] };
        porMotivo[m.clave].casos.push(c);
        return;
      }
      listos.push(c);
    });

    /* PASO 4 — LOS SALTADOS NO SALEN DE LA TANDA: VAN AL FINAL. Saltar es
       «ahora no», no «nunca»; sacarlos de la lista los haría desaparecer sin
       que Joan decidiera nada, y al final del día no sabría a quién le faltó. */
    var pendientes = [], alFinal = [];
    listos.forEach(function (c) {
      var k = texto(c.socioId);
      if (k && Object.prototype.hasOwnProperty.call(saltados, k)) {
        alFinal.push({ caso: c, motivo: saltados[k] });
      } else {
        pendientes.push(c);
      }
    });

    return {
      tipo: texto(x.tipo) || 'cobro',
      pendientes: pendientes,
      saltados: alFinal,
      fuera: fuera,
      porMotivo: Object.keys(porMotivo).map(function (k) { return porMotivo[k]; }),
      /* PERSONAS, no créditos: es lo que hace que puedes + fuera + saltados dé
         exactamente este número. Los créditos de más van en
         `creditosAgrupados`, porque tampoco se pueden callar. */
      total: unicos.length,
      creditosAgrupados: lista(casos).length - unicos.length
    };
  }

  /**
   * Los números que van ARRIBA, antes de empezar. Nunca adjetivos: si la caja
   * dijera «unos cuantos» o «la mayoría», Joan entraría a ciegas y volvería a
   * hacer lo que hace hoy, que es abrir WhatsApp y bajar por la lista.
   */
  function resumenDeTanda(t) {
    var r = objeto(t);
    var n = lista(r.pendientes).length;
    return {
      total: num(r.total),
      creditosAgrupados: num(r.creditosAgrupados),
      puedes: n,
      saltados: lista(r.saltados).length,
      fuera: lista(r.fuera).length,
      porMotivo: lista(r.porMotivo).map(function (m) {
        return { clave: m.clave, texto: m.texto, cuantos: lista(m.casos).length };
      }),
      minutos: minutosDeEnvio(n)
    };
  }

  /**
   * Cuánto le va a tomar, en minutos, SOLO el envío. El rato de conversación con
   * los que contestan no se suma acá y se dice aparte: son cosas distintas y
   * meterlas en el mismo número es lo que hace que la cuenta no se cumpla nunca.
   */
  function minutosDeEnvio(cuantos) {
    var n = Math.max(0, Math.round(num(cuantos)));
    return {
      min: Math.max(n ? 1 : 0, Math.round(n * SEGUNDOS_MIN / 60)),
      max: Math.max(n ? 1 : 0, Math.round(n * SEGUNDOS_MAX / 60))
    };
  }

  /**
   * Si hay que parar por ritmo, y cuánto. Devuelve null cuando se puede seguir.
   * Es una advertencia, no un bloqueo: la ley no lo prohíbe, y frenar a Joan con
   * el cliente delante por una política de WhatsApp sería peor que el riesgo.
   */
  function avisoDeRitmo(socios, ahora) {
    var n = chatsEnLaUltimaHora(socios, ahora);
    if (n < TOPE_CHATS_HORA) return null;
    return {
      chats: n, tope: TOPE_CHATS_HORA,
      texto: 'Llevas ' + n + ' chats en la última hora. WhatsApp restringe las cuentas que ' +
        'pasan de ese ritmo, y el número en riesgo es el que tiene toda tu cartera. ' +
        'Espera unos 20 minutos antes de seguir.'
    };
  }

  /* =========================================================================
   * 5 · LA PUBLICIDAD ESTÁ BLOQUEADA, Y NO ES UN OLVIDO
   *
   * Joan pidió esto explícitamente: «poder enviar masivamente mensajes por
   * whatsapp con publicidad o informacion de cobro». La parte de cobro se
   * entrega. La de publicidad NO se puede entregar hoy sin mentir, y esta
   * función existe para decir por qué con nombres y artículos, no para
   * esconderla.
   *
   * Son CUATRO faltas, y ninguna se arregla con código:
   *
   * 1. LA AUTORIZACIÓN NO EXISTE Y NO SE PUEDE PRESUMIR.
   *    legal/privacidad.html:179-183 lista para qué se usan los datos y
   *    legal/privacidad.html:185 cierra la lista con «Para nada más.». La única
   *    línea que se acerca (privacidad.html:181) está acotada a «tus pagos, tus
   *    vencimientos y lo que llevas construido»: es transaccional, no
   *    promocional. legal/terminos.html:355-356 dice lo mismo.
   *    El Decreto 1377 de 2013, artículo 5, obliga a pedir una NUEVA
   *    autorización cuando cambia la FINALIDAD. Publicidad es una finalidad
   *    nueva: hace falta una autorización aparte y específica, y los socios que
   *    ya firmaron tienen que volver a autorizar. Publicar una política nueva
   *    no basta.
   *    Marcar una casilla en la ficha HOY no arreglaría nada: sería una
   *    autorización para una finalidad que el documento publicado no declara.
   *    Por eso no se construyó la casilla — construirla sería la interfaz
   *    prometiendo una legalidad que no existe.
   *
   * 2. NO HAY MECANISMO DE BAJA. El artículo 5 de la Ley 2300 exige un medio
   *    «ágil, sencillo y eficiente» para cancelar la recepción en cualquier
   *    momento. En WhatsApp es, como mínimo, una línea al pie («Responde BAJA»)
   *    y un campo que registre la baja y bloquee el envío. No existe.
   *
   * 3. NO SE HA CONSULTADO EL RNE. El Registro Nacional de Excluidos lo opera
   *    la CRC desde el 10 de abril de 2024 y la consulta es gratuita y
   *    obligatoria para todo productor o proveedor antes de contactar con fines
   *    comerciales. Joan es proveedor de un servicio: le aplica. Eso no se
   *    resuelve desde acá, y si lo investigan la carga de probar que consultó es
   *    suya.
   *
   * 4. LA POLÍTICA NO IDENTIFICA AL RESPONSABLE. privacidad.html:127-130 y :239
   *    siguen con [NOMBRE COMPLETO O RAZÓN SOCIAL], [CÉDULA O NIT], [DIRECCIÓN],
   *    [CORREO], [CELULAR] sin llenar. Sin responsable identificado no hay
   *    política válida ni canal para ejercer derechos, y eso solo ya incumple la
   *    Ley 1581 — antes incluso de hablar de publicidad.
   *
   * EL PRECEDENTE, PARA QUE NO SUENE A TEORÍA: la SIC sancionó a Movistar por
   * contactar usuarios repetidamente con fines comerciales por SMS, WhatsApp y
   * llamadas sin autorización previa, expresa e informada. Unos $670 millones.
   * Es exactamente la conducta que este botón automatizaría. El tope legal son
   * 2.000 SMLMV — con el salario de 2026, $3.501.810.000.
   * Y no empieza con una auditoría: empieza con UNA queja, gratis y en línea,
   * de un socio molesto. Un botón de envío masivo multiplica por toda la
   * cartera el número de mensajes que pueden molestar a alguien.
   *
   * ADVERTENCIA QUE JOAN NO PIDIÓ Y NECESITA: un «informativo» que además ofrece
   * un producto ES publicidad. Poner «pide tu nuevo crédito» al pie de un
   * recordatorio de pago convierte ese mensaje en comercial y le quita el
   * paraguas de la excepción del artículo 8. Por eso las dos tandas están
   * físicamente separadas en la pantalla y no se pueden mezclar.
   * =======================================================================*/

  var FALTA_PUBLICIDAD = [
    { clave: 'autorizacion',
      titulo: 'Nadie ha autorizado recibir publicidad',
      texto: 'La política publicada lista para qué se usan los datos y cierra con «Para nada más». ' +
             'Publicidad no está en esa lista. El Decreto 1377 de 2013 (art. 5) exige una autorización ' +
             'NUEVA cuando cambia la finalidad: hay que pedírsela otra vez a cada socio, aparte, y guardarla con fecha.',
      quien: 'Joan, con un abogado' },
    { clave: 'baja',
      titulo: 'No hay forma de darse de baja',
      texto: 'La Ley 2300 (art. 5) exige un mecanismo ágil para cancelar la recepción en cualquier momento. ' +
             'Hace falta la línea «Responde BAJA» al pie y un campo que la registre y bloquee el envío.',
      quien: 'se construye cuando exista lo anterior' },
    { clave: 'rne',
      titulo: 'No se ha consultado el Registro Nacional de Excluidos',
      texto: 'Lo opera la CRC desde abril de 2024, la consulta es gratuita y es obligatoria antes de ' +
             'contactar con fines comerciales. No se puede consultar desde esta pantalla, y si lo investigan ' +
             'la carga de probar que se consultó es de Joan.',
      quien: 'Joan, en la plataforma de la CRC' },
    { clave: 'responsable',
      titulo: 'La política de privacidad no dice quién es el responsable',
      texto: 'legal/privacidad.html todavía tiene [NOMBRE COMPLETO O RAZÓN SOCIAL], [CÉDULA O NIT], ' +
             '[DIRECCIÓN], [CORREO] y [CELULAR] sin llenar. Sin responsable identificado no hay política ' +
             'válida ni canal para ejercer derechos: eso solo ya incumple la Ley 1581.',
      quien: 'Joan, hoy mismo' }
  ];

  /**
   * El estado de la tanda de publicidad. Hoy devuelve siempre bloqueada, y con
   * `autorizados` en 0 sobre el total real de socios: un cero incómodo pero
   * verdadero. Cuando exista la autorización, esta función deja de contar cero
   * sola — no hace falta tocarla para «desbloquear», hace falta que el dato
   * exista.
   */
  function bloqueoDePublicidad(socios) {
    var todos = lista(socios);
    var autorizados = todos.filter(function (s) {
      var a = objeto(objeto(s).autorizaPublicidad);
      return a.valor === true && !a.baja;
    }).length;
    return {
      bloqueada: true,
      autorizados: autorizados,
      total: todos.length,
      falta: FALTA_PUBLICIDAD,
      /* La frase que va en pantalla, escrita acá para que sea la misma en el
         celular y en el computador el día que crm.html reciba la receta. */
      resumen: 'La tanda de publicidad está apagada. No es un error ni una función a medias: ' +
        'mandar publicidad necesita una autorización que hoy ningún socio ha dado, y ' +
        'la política publicada no la pide.'
    };
  }

  /* =========================================================================
   * 6 · LO QUE ESTA PANTALLA NO PUEDE DECIR, ESCRITO COMO DATO
   *
   * Está acá y no suelto en el HTML por la lección del 5-ago-2026: el día que el
   * factor de garantía bajó de 90 a 75, ocho pantallas siguieron diciendo 90
   * porque el número estaba tecleado a mano. Un texto que promete algo es tan
   * peligroso como un número: si algún día la tanda SÍ enviara sola, esta lista
   * tiene que cambiar en un solo sitio.
   * =======================================================================*/
  var LO_QUE_NO_HACE = [
    'No envía nada. Abre el chat con el texto puesto y tú tocas enviar, uno por uno.',
    'No sabe si enviaste. Por eso anota «abrí el chat», no «mandé el mensaje».',
    'No sabe si lo leyeron ni si contestaron.',
    'No cobra ni registra pagos: eso sigue en la pantalla de cobro.',
    'No contacta referencias. La Ley 2300 (art. 4) lo prohíbe en todos los casos, y nombra expresamente a las personas naturales.'
  ];

  return {
    /* la ley, en números */
    DIAS_SEMANA: DIAS_SEMANA,
    SEMANA_ES_VENTANA_MOVIL: SEMANA_ES_VENTANA_MOVIL,
    TOPE_CHATS_HORA: TOPE_CHATS_HORA,
    SEGUNDOS_MIN: SEGUNDOS_MIN,
    SEGUNDOS_MAX: SEGUNDOS_MAX,
    MOTIVOS: MOTIVOS,
    LO_QUE_NO_HACE: LO_QUE_NO_HACE,
    FALTA_PUBLICIDAD: FALTA_PUBLICIDAD,
    GRUPOS: GRUPOS,
    /* los topes */
    contactosEnVentana: contactosEnVentana,
    contactadoHoy: contactadoHoy,
    contactadoEstaSemana: contactadoEstaSemana,
    contactadoEnGrupoHoy: contactadoEnGrupoHoy,
    canalUsadoEstaSemana: canalUsadoEstaSemana,
    chatsEnLaUltimaHora: chatsEnLaUltimaHora,
    avisoDeRitmo: avisoDeRitmo,
    /* los grupos */
    grupoPorClave: grupoPorClave,
    gruposDeTipo: gruposDeTipo,
    /* la tanda */
    motivoDeExclusion: motivoDeExclusion,
    armarTanda: armarTanda,
    resumenDeTanda: resumenDeTanda,
    minutosDeEnvio: minutosDeEnvio,
    /* publicidad */
    bloqueoDePublicidad: bloqueoDePublicidad
  };
});
