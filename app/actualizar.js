/* ============================================================================
 * SE ACTUALIZA SOLA, SIN QUE NADIE PIERDA NADA — 21 de octubre de 2026
 *
 * Joan: «que cuando tengamos actualizaciones el cliente pueda actualizar de
 * una forma automática».
 *
 * LO QUE PASABA, medido el 21-oct (la investigación de ese día, «actualizar»):
 *   · El navegador solo busca un sw.js nuevo cuando la página NAVEGA. Volver a
 *     la app que estaba en segundo plano —lo normal en Android— no es navegar:
 *     la página vieja se queda en memoria horas o días. Para ver lo nuevo había
 *     que cerrar la app del todo, y la pantalla no se lo decía a nadie.
 *   · Ninguna página llamaba registration.update(), ni escuchaba
 *     controllerchange, ni decía «hay una versión nueva».
 *
 * LO QUE HACE ESTE ARCHIVO. Es UNA pieza para play/, app/socio.html y
 * platachat/ (que recargan solas en un momento seguro) y para el CRM y el
 * espejo (que SOLO avisan):
 *   1. BUSCA: reg.update() al abrir, al volver a la app si pasaron más de 10
 *      min desde la última búsqueda, cada 30 min con la página a la vista, y
 *      cuando vuelve la señal.
 *   2. SABE SI ESTA PÁGINA ES VIEJA comparando su VERSION_SITIO ('v138') con
 *      la caché más nueva del service worker ('tugarantia-v139'). Sin esa
 *      comparación la primera apertura después de publicar recargaría de gana:
 *      el HTML ya llegó nuevo por la red, y el service worker nuevo toma la
 *      página segundos después. pruebas/se-actualiza-sola.test.js obliga a que
 *      el VERSION_SITIO de cada página sea el CACHE de sw.js: quien sube uno
 *      sube los otros, o la prueba no lo deja pasar.
 *   3. RECARGA SOLO EN UN MOMENTO SEGURO, y el momento lo decide CADA PÁGINA
 *      con una LISTA BLANCA (momentoSeguro): lo que no está en la lista no
 *      recarga. El registro en cualquier paso, una petición en camino, una
 *      propuesta con la casilla marcada, un chat o una contraseña a medias, el
 *      «Ver como» de Joan... nada de eso está. Y este archivo agrega dos
 *      guardas que valen para todas: texto tecleado a la vista y una cámara
 *      encendida.
 *      21-oct-2026 (verificación del lote 1, R2 y R3) — «una petición en
 *      camino» no puede depender de que cada pantalla se acuerde: la foto del
 *      comprobante salía, la persona tocaba «Plata» y la recarga la cortaba.
 *      Cada página CUENTA sus escrituras en camino (ESCRITURAS_EN_CAMINO:
 *      sube al salir, baja al contestar o fallar) y mientras haya una no es
 *      momento seguro en NINGUNA pantalla; play/ además guarda la subida de
 *      fotos que «Salir» deja viva (SUBIDA_SUELTA). Cuando la última
 *      termina, la página vuelve a preguntar con revisar(): sin la persona
 *      mirando recarga, y mirando solo cambia la franja.
 *      Aun en una pantalla segura, NO DEBAJO DEL DEDO: recarga cuando la app
 *      se va a segundo plano (la persona no la está mirando), justo al volver
 *      antes de tocar nada, o cuando la página vuelve al inicio por su cuenta
 *      (yaEsSeguro). Recargar mientras alguien lee su historial le movería la
 *      pantalla sin aviso, y eso también es perder algo.
 *   4. UNA RECARGA SOLA POR VERSIÓN Y POR PESTAÑA (sessionStorage). Si la CDN
 *      sigue sirviendo la página vieja justo después de publicar, la recarga
 *      devolvería la vieja, y otra vez, y otra: un bucle. Sin sessionStorage
 *      (algún modo privado) NUNCA recarga sola: solo ofrece el botón.
 *   5. NUNCA SIN SEÑAL. Sin señal tampoco se promete nada.
 *   6. SI NO ES MOMENTO, LO DICE, con una franja que no estorba: «Hay una
 *      versión nueva: se pone sola cuando termines y vuelvas al inicio». En
 *      las pantallas seguras (el inicio), el botón «Actualizar ahora».
 *   7. EL CRM Y EL ESPEJO NUNCA SE RECARGAN SOLOS: allá vive la cola de cobros
 *      sin señal y un estado enorme. Solo la franja con «Recargar».
 *   7b. 21-oct-2026 (verificación del lote 1, R5) — UN MODO QUE NUNCA TIENE
 *      MOMENTO SEGURO NO PROMETE «SE PONE SOLA». La página lo declara
 *      (nuncaEsSeguro: el «Ver como» de Joan en la app del socio, PlataChat
 *      con la calculadora movida) y la franja dice «Cuando no tengas nada a
 *      medias, toca “Actualizar ahora”», con el botón. Antes decía «se pone
 *      sola cuando termines y vuelvas al inicio» estando ya en el inicio, y
 *      no se ponía nunca.
 *   8. AL VOLVER DE UNA RECARGA SUYA la página lo sabe (controlador.vuelta):
 *      se salta la bienvenida de 2 s —la persona no pidió abrir la app— y
 *      vuelve a la pestaña donde estaba (`lugar`, que guarda solo el nombre de
 *      la pestaña: nada sensible cruza la recarga).
 *   9. 22-oct-2026 (verificación de 35f0687) — LA FRANJA VUELVE A MIRAR SOLA,
 *      DESDE AQUÍ. Se pintaba al publicar, al volver a la app o al llegar a
 *      una pantalla de la lista, y ahí se quedaba: la persona pasaba al
 *      registro, a «Cambiar mi contraseña» o al recado, y seguía leyendo «se
 *      pone sola cuando salgas de la app y vuelvas» con el botón, que ahí no
 *      pasa (y el botón recargaba a mitad del registro). Arreglarlo pantalla
 *      por pantalla (que cada función que pinta avise) era dejarlo a la
 *      memoria de quien escriba la próxima. Mientras hay una versión
 *      esperando, este archivo vuelve a decidir cada vez que:
 *        · la página cambia lo que muestra (un MutationObserver sobre el
 *          <body>: toda pantalla nueva es DOM nuevo, venga de un toque, de
 *          una respuesta o de un reloj);
 *        · la persona teclea, marca una casilla o toca (input, change,
 *          click): lo escrito y lo marcado no cambian el DOM;
 *        · empieza una escritura (la página llama volverAMirar() desde su
 *          escrituraEnCamino, el único sitio por donde salen) o termina (la
 *          página llama revisar(), como ya hacía).
 *      Volver a mirar NUNCA recarga debajo del dedo: es la misma decisión de
 *      siempre, y mirando solo cambia la franja.
 *  10. 22-oct-2026 — «ACTUALIZAR AHORA» NO CORTA NADA. Recargaba en el acto,
 *      con el pedido, la aceptación o el mensaje en el aire, porque el botón
 *      seguía a la vista de cuando la pantalla era segura. Ahora el toque
 *      vuelve a preguntar: si algo va en camino (o.ocupado: las escrituras
 *      que cuenta la página), espera a que termine y lo dice; si la pantalla
 *      ya no es de la lista de la página, no recarga y la franja dice lo de
 *      esa pantalla; si hay algo escrito a la vista o la cámara abierta, lo
 *      dice y pide confirmar («Actualizar igual» / «Ahora no»). Solo
 *      entonces recarga.
 *  11. 22-oct-2026 (verificación de e8f34eb) — LO QUE CONTESTÓ LA BASE SE VE
 *      ANTES DE ACTUALIZAR. El punto 10 esperaba a que terminara lo que iba
 *      en camino y, al terminar, recargaba solo: encima de la respuesta. Si
 *      la base decía que NO («La propuesta cambió mientras la leías», el tope
 *      de fotos del comprobante, «No pudimos recibir tu solicitud»), la
 *      página lo pintaba y unos milisegundos después la recarga se lo
 *      llevaba; lo último que la persona había leído era «primero tiene que
 *      terminar de enviarse», y quedaba creyendo que aceptó, pidió o mandó el
 *      comprobante. Pasaba en PlataChat con la calculadora movida y en el
 *      «Pedir» de Crédito de play/. Ahora, al terminar, NO recarga: suelta el
 *      pedido y la franja dice «Ya terminó lo que iba en camino: mira cómo
 *      quedó y toca “Actualizar ahora”», con el botón. Ese aviso se queda, y
 *      con él ninguna recarga sola (ni saliendo de la app y volviendo, que
 *      también es antes de verla), hasta que la persona toca la página (ya
 *      la vio), toca el botón, cierra la franja o pasa a una pantalla que no
 *      es de la lista (fuera del modo «nunca», donde ninguna lo es y el
 *      botón sigue). Decidir sin saber cómo terminó es lo único seguro:
 *      este archivo no lee respuestas, y no tiene por qué empezar a hacerlo.
 *
 * LO QUE NO PUEDE HACER, Y POR ESO NINGÚN TEXTO LO PROMETE:
 *   · Con la app CERRADA no corre nada: lo nuevo llega al abrirla, como antes.
 *   · En iPhone la app de la pantalla de inicio no comparte nada con Safari:
 *     abrir el sitio en Safari no la actualiza (WebKit, blog 10218).
 *   · El envoltorio del APK (nombre, icono, adónde abre) no cambia sin
 *     reinstalarlo: esto actualiza lo que la app MUESTRA, no la app.
 *
 * Se prueba en Node (pruebas/se-actualiza-sola.test.js): todo lo del
 * navegador entra por `entorno`, y `decidir` es pura.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Actualizar = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PREFIJO_CACHE = 'tugarantia-v';      // el de sw.js: const CACHE = 'tugarantia-vNNN'
  /* La versión por la que ESTA pestaña ya recargó sola: el tope del bucle. */
  var LLAVE_RECARGA = 'tg_recargada_por_version';
  /* Lo que la página pidió recordar al otro lado de la recarga. Dura poco
     (VUELTA_VIGENTE): una marca vieja no puede saltarle la bienvenida a
     alguien que abrió la app horas después. */
  var LLAVE_VUELTA = 'tg_vuelta_por_version';
  var MIN_ENTRE_BUSQUEDAS = 10 * 60 * 1000;   // al volver a la app
  var CADA = 30 * 60 * 1000;                  // con la página a la vista
  /* «Justo al volver, antes de tocar nada»: el rato en que recargar no le
     quita nada a nadie. Pasado esto, la persona ya está mirando. */
  var VENTANA_AL_VOLVER = 4000;
  var VUELTA_VIGENTE = 2 * 60 * 1000;
  /* 22-oct-2026 — mientras «Actualizar ahora» espera a que termine lo que va
     en camino, se vuelve a mirar cada tanto: una marca que la página suelta
     sin cambiar el DOM (CH.enviando, PIDIENDO) no puede dejar a la persona
     esperando para siempre con un texto que ya no es cierto. */
  var ESPERA_ENTRE_MIRADAS = 1000;
  var ID_FRANJA = 'tgVersionNueva';
  var ID_ESTILO = 'tgVersionNuevaEstilo';

  /* LOS TEXTOS, EN UN SOLO SITIO. Cada uno dice lo que de verdad va a pasar
     en el estado en que se muestra (ver decidir): «se pone sola» solo sale
     cuando este archivo SÍ va a recargar sola, y no sale nunca sin señal. */
  var TEXTOS = {
    alTerminar: 'Hay una versión nueva: se pone sola cuando termines y vuelvas al inicio.',
    alSalir: 'Hay una versión nueva: se pone sola cuando salgas de la app y vuelvas.',
    lista: 'Hay una versión nueva.',
    aMano: 'Hay una versión nueva. Cuando termines, vuelve al inicio y toca «Actualizar ahora».',
    /* 21-oct-2026 (R5) — el modo que NUNCA es seguro: ni «se pone sola» ni
       «vuelve al inicio» (el inicio tampoco lo es). El botón va siempre: la
       decisión es de la persona, que sabe si tiene algo a medias. */
    nuncaSola: 'Hay una versión nueva. Cuando no tengas nada a medias, toca «Actualizar ahora».',
    panel: 'Hay una versión nueva del panel. Recárgalo cuando no tengas nada a medias.',
    panelSinSenal: 'Hay una versión nueva del panel. Recárgalo cuando vuelva la señal y no tengas nada a medias.',
    /* 22-oct-2026 — lo que dice la franja DESPUÉS de tocar «Actualizar
       ahora», cuando todavía no recarga. Ninguno promete el resultado:
       «primero tiene que terminar» es lo que este archivo hace (no recarga
       mientras algo va en camino); con algo escrito o la cámara abierta
       pregunta, porque recargar se lo lleva. */
    esperando: 'Hay una versión nueva. Primero tiene que terminar de enviarse lo que va en camino.',
    /* 22-oct-2026 (verificación de e8f34eb) — y al terminar lo DICE en vez
       de recargar: «terminó», no «se envió», porque este archivo no sabe si
       la base dijo que sí o que no. Eso lo dice la página, y la persona lo
       tiene que poder leer antes de que se vaya con la recarga. */
    termino: 'Ya terminó lo que iba en camino: mira cómo quedó y toca «Actualizar ahora».',
    confirmarTexto: 'Tienes algo escrito sin enviar: si actualizas ahora, se borra.',
    confirmarCamara: 'La cámara está abierta: si actualizas ahora, se apaga y se pierde la foto que estás tomando.',
    boton: 'Actualizar ahora',
    botonIgual: 'Actualizar igual',
    ahoraNo: 'Ahora no',
    botonPanel: 'Recargar',
    cerrar: 'Cerrar este aviso'
  };

  /* --------------------------------------------------------- LO PURO */

  /* 'v138' → 138; 'tugarantia-v138' → 138; cualquier otra cosa → 0. */
  function numeroDeVersion(t) {
    var m = /^(?:tugarantia-)?v(\d{1,6})$/.exec(String(t == null ? '' : t).trim());
    return m ? Number(m[1]) : 0;
  }

  /* La versión más nueva entre las cachés del sitio ('v139'), o ''. Solo las
     propias: caches.keys() lista las de todo el dominio. */
  function versionDeCaches(claves) {
    var max = 0;
    (claves || []).forEach(function (k) {
      if (String(k).indexOf(PREFIJO_CACHE) !== 0) return;
      var n = numeroDeVersion(k);
      if (n > max) max = n;
    });
    return max ? 'v' + max : '';
  }

  /* «Versión 2026-10-21 · v138»: la fecha que Joan le pregunta al cliente por
     WhatsApp y el número de la caché, que es lo que de verdad dice si tiene
     lo último (las fechas son tres y a mano; el número es uno). */
  function sello(fecha, version) {
    return 'Versión ' + String(fecha || '') + (version ? ' · ' + String(version) : '');
  }

  /* LA DECISIÓN, sin navegador. `e`:
       pagina, nueva   'v138', 'v139' ('' si no se sabe)
       instalando      el service worker nuevo todavía no tomó el mando
       enLinea, soloAvisar, seguro
       nunca           21-oct-2026 (R5) — la página dice que en el modo en que
                       está NINGUNA pantalla es segura (gana sobre `seguro`)
       autoPosible     queda la recarga sola de esta versión en esta pestaña
       momento         'oculta' | 'volviendo' | 'transicion' | 'mirando'
     Devuelve { accion: 'nada' | 'recargar' | 'avisar', aviso: {texto, boton} | null }. */
  function decidir(e) {
    var pag = numeroDeVersion(e.pagina), nue = numeroDeVersion(e.nueva);
    /* Sin número propio no se compara nada: mejor no avisar que recargar de gana. */
    if (!pag || !(nue > pag) || e.instalando) return { accion: 'nada', aviso: null };
    if (e.soloAvisar) {
      return { accion: 'avisar', aviso: e.enLinea
        ? { texto: TEXTOS.panel, boton: TEXTOS.botonPanel }
        : { texto: TEXTOS.panelSinSenal, boton: null } };
    }
    /* Sin señal la recarga caería en lo guardado, que puede estar a medias
       (la precarga no revienta si un archivo falta). Y cualquier texto de
       «se pone sola» dependería de una señal que no hay: se calla. */
    if (!e.enLinea) return { accion: 'nada', aviso: null };
    /* 21-oct-2026 (R5) — un modo sin momento seguro no recarga ni promete:
       «se pone sola cuando… vuelvas al inicio» era falso, porque en ese modo
       el inicio tampoco es seguro. El botón, siempre. */
    if (e.nunca) return { accion: 'avisar', aviso: { texto: TEXTOS.nuncaSola, boton: TEXTOS.boton } };
    if (e.seguro && e.autoPosible && e.momento !== 'mirando') return { accion: 'recargar', aviso: null };
    if (e.seguro) return { accion: 'avisar', aviso: { texto: e.autoPosible ? TEXTOS.alSalir : TEXTOS.lista, boton: TEXTOS.boton } };
    return { accion: 'avisar', aviso: { texto: e.autoPosible ? TEXTOS.alTerminar : TEXTOS.aMano, boton: null } };
  }

  /* ¿Hay algo tecleado A LA VISTA? Una guarda para todas las páginas, además
     de su lista blanca: si alguien escribió algo, recargar se lo borra. Solo
     lo visible (getClientRects vacío = display:none), porque una página
     guarda pantallas enteras escondidas con lo de antes adentro. Los
     deslizadores y las fechas no cuentan: siempre traen valor, y lo suyo lo
     guarda la calculadora.
     21-oct-2026 (verificación del lote 1, R4) — NI LO QUE NADIE PUEDE
     ESCRIBIR. La tarjeta de instalar (app/instalar.js) pinta el enlace de la
     app en un <input readonly> con valor en Edge, Firefox, Opera, Xiaomi y
     dentro de Instagram o Facebook, y eso contaba como «algo tecleado»: la
     app del socio no se recargaba nunca en la entrada ni en el inicio, y la
     franja prometía lo contrario. Un campo de solo lectura o apagado no
     guarda nada que la persona haya escrito (la fecha de nacimiento leída en
     el registro de play/ es otro caso). Se mira la propiedad y el atributo:
     un banco de pruebas, o un navegador viejo, puede traer solo uno. */
  var TIPOS_DE_TEXTO = ['', 'text', 'tel', 'password', 'email', 'search', 'number', 'url'];
  function noSePuedeEscribir(el) {
    if (el.readOnly === true || el.disabled === true) return true;
    if (typeof el.hasAttribute === 'function' && (el.hasAttribute('readonly') || el.hasAttribute('disabled'))) return true;
    return false;
  }
  function hayTextoALaVista(doc) {
    try {
      if (!doc || typeof doc.querySelectorAll !== 'function') return false;
      var l = doc.querySelectorAll('input, textarea');
      for (var i = 0; i < l.length; i++) {
        var el = l[i];
        var tag = String(el.tagName || '').toLowerCase();
        var tipo = String((el.getAttribute && el.getAttribute('type')) || el.type || '').toLowerCase();
        if (tag !== 'textarea' && TIPOS_DE_TEXTO.indexOf(tipo) < 0) continue;
        if (noSePuedeEscribir(el)) continue;
        if (!String(el.value || '').trim()) continue;
        if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) continue;
        return true;
      }
    } catch (e) { return true; }   // si no se puede mirar, se supone que sí: no se recarga
    return false;
  }

  /* ¿Una cámara encendida? El escáner de la cédula y la selfie viven en un
     <video> con su stream: recargar ahí apaga la cámara a mitad de una foto. */
  function hayCamaraEncendida(doc) {
    try {
      if (!doc || typeof doc.querySelectorAll !== 'function') return false;
      var v = doc.querySelectorAll('video');
      for (var i = 0; i < v.length; i++) {
        var s = v[i].srcObject;
        if (s && s.active !== false) return true;
      }
    } catch (e) { return true; }
    return false;
  }

  /* --------------------------------------------------------- EL ENTORNO */

  function entornoDelNavegador() {
    var g = typeof globalThis !== 'undefined' ? globalThis : {};
    var w = typeof window !== 'undefined' ? window : g;
    function de(nombre) { try { return w[nombre]; } catch (e) { return undefined; } }
    return {
      window: w,
      document: de('document'),
      navigator: de('navigator'),
      caches: de('caches'),
      sessionStorage: (function () { try { return w.sessionStorage; } catch (e) { return null; } })(),
      location: de('location'),
      ahora: function () { return Date.now(); },
      setInterval: function (f, ms) { return w.setInterval ? w.setInterval(f, ms) : 0; },
      clearInterval: function (id) { if (w.clearInterval) w.clearInterval(id); },
      setTimeout: function (f, ms) { return w.setTimeout ? w.setTimeout(f, ms) : 0; },
      clearTimeout: function (id) { if (w.clearTimeout) w.clearTimeout(id); },
      /* 22-oct-2026 — con qué mirar que la pantalla cambió. Sin él (un
         navegador de antes de 2014) quedan los toques y las escrituras. */
      MutationObserver: de('MutationObserver')
    };
  }

  function sinNada() {}

  /* --------------------------------------------------------- EL CONTROLADOR

     o.version        VERSION_SITIO de la página ('v138')
     o.momentoSeguro  () => boolean — la lista blanca de la página; sin ella,
                      nunca es seguro
     o.nuncaEsSeguro  21-oct-2026 (R5) — () => boolean: true si en el modo en
                      que está la página NINGUNA pantalla es segura (ni
                      volviendo al inicio). Entonces no recarga sola y la
                      franja no promete «se pone sola»: ofrece el botón.
     o.ocupado        22-oct-2026 — () => boolean: true mientras la página
                      tiene algo EN CAMINO (sus escrituras contadas, un pedido,
                      el chat mandando). Con algo en camino nunca es momento
                      seguro, y «Actualizar ahora» espera a que termine. Sin
                      ella, nada se sabe en camino.
     o.soloAvisar     true en el CRM y el espejo: nunca recarga sola
     o.lugar          () => {tab: '...'} | null — lo que se recuerda al otro
                      lado de una recarga (solo nombres de pestaña)
     o.entorno        para las pruebas: window, document, navigator, caches,
                      sessionStorage, location, ahora, setInterval,
                      clearInterval, setTimeout, clearTimeout, MutationObserver

     Devuelve { vuelta, opciones, yaEsSeguro(), revisar(), volverAMirar(),
                buscar(), recargar(), estado(), detener() }. Nunca lanza: sin
     service worker (http://, file://, un navegador viejo, el banco de
     pruebas) es un controlador que no hace nada.
     volverAMirar() (22-oct-2026): «algo cambió aquí» (la página lo llama al
     EMPEZAR una escritura): vuelve a decidir la franja YA, sin esperar a las
     cachés, para que el botón no siga a la vista con algo saliendo. */
  function iniciar(o) {
    o = o || {};
    var ent = entornoDelNavegador();
    if (o.entorno) Object.keys(o.entorno).forEach(function (k) { ent[k] = o.entorno[k]; });
    var ss = ent.sessionStorage || null;
    var ahora = typeof ent.ahora === 'function' ? ent.ahora : function () { return Date.now(); };

    var ctl = {
      vuelta: null,
      opciones: { version: String(o.version || ''), soloAvisar: !!o.soloAvisar },
      yaEsSeguro: sinNada, revisar: sinNada, volverAMirar: sinNada, buscar: sinNada, recargar: sinNada, detener: sinNada,
      estado: function () { return { pagina: ctl.opciones.version, nueva: '', accion: 'nada', aviso: null }; }
    };

    /* LA VUELTA se lee siempre, haya o no service worker, y se borra al
       leerla: es de UNA recarga. */
    try {
      var crudo = ss ? ss.getItem(LLAVE_VUELTA) : null;
      if (crudo) {
        ss.removeItem(LLAVE_VUELTA);
        var v = JSON.parse(crudo);
        if (v && typeof v === 'object' && Math.abs(ahora() - Number(v.en)) <= VUELTA_VIGENTE) {
          var lugar = (v.lugar && typeof v.lugar === 'object' && typeof v.lugar.tab === 'string')
            ? { tab: v.lugar.tab.slice(0, 40) } : null;
          ctl.vuelta = { version: String(v.version || ''), lugar: lugar };
        }
      }
    } catch (e) { ctl.vuelta = null; }

    var nav = ent.navigator, sw = nav && nav.serviceWorker, doc = ent.document, loc = ent.location;
    if (!sw || !sw.ready || typeof sw.addEventListener !== 'function' ||
        !loc || !/^https?:$/.test(String(loc.protocol || ''))) return ctl;

    /* ¿Se puede recordar que ya se recargó? Si no, la recarga sola queda
       apagada: sin tope, una CDN vieja haría un bucle. */
    var conMemoria = false;
    try {
      if (ss) { ss.setItem('tg_prueba_memoria', '1'); ss.removeItem('tg_prueba_memoria'); conMemoria = true; }
    } catch (e) { conMemoria = false; }

    var reg = null, claves = null, ultimaBusqueda = 0, intervalo = 0, vivo = true;
    var volvioEn = ahora(), tocoDesdeQueVolvio = false;
    var ultima = { accion: 'nada', aviso: null, nueva: '' };
    var franja = null, cerradoTexto = '';
    var oyentes = [];
    /* 22-oct-2026 — «Actualizar ahora» ya no recarga en el acto: queda un
       PEDIDO de la persona que sigue en pie hasta que se cumple o lo suelta.
         ''           sin pedido
         'pendiente'  acaba de tocar; se decide ya (seguirElPedido)
         'esperando'  algo va en camino: no se recarga hasta que termine
         'confirmar'  hay algo escrito o la cámara abierta: se le preguntó
         'confirmado' dijo «Actualizar igual» */
    var pedido = '', relojEspera = 0;
    /* 22-oct-2026 (verificación de e8f34eb) — terminó lo que el pedido
       esperaba y la persona todavía no ha mirado cómo quedó (ver el punto 11
       de arriba). No es un pedido: no recarga nada. Es lo contrario: mientras
       esté en pie, nada recarga solo y la franja dice TEXTOS.termino. */
    var terminoSinVer = false;
    var observador = null, miradaPendiente = false;

    function oir(blanco, tipo, f, opc) {
      if (!blanco || typeof blanco.addEventListener !== 'function') return;
      try { blanco.addEventListener(tipo, f, opc); oyentes.push([blanco, tipo, f, opc]); } catch (e) {}
    }
    function enLinea() { return !(nav && nav.onLine === false); }
    function oculta() { return !!(doc && (doc.hidden === true || doc.visibilityState === 'hidden')); }
    function yaRecargoPor(version) {
      try { return !!ss && ss.getItem(LLAVE_RECARGA) === version; } catch (e) { return true; }
    }
    /* 22-oct-2026 — lo que va en camino también lo mira ESTE archivo, no solo
       la lista blanca de cada página: si una página nueva olvida contar sus
       escrituras en momentoSeguro, ocupado sigue frenando. Si la pregunta
       falla, se supone que sí: esperar de más no pierde nada. */
    function preguntarOcupado() {
      if (typeof o.ocupado !== 'function') return false;
      try { return !!o.ocupado(); } catch (e) { return true; }
    }
    function preguntarSeguro() {
      if (typeof o.momentoSeguro !== 'function') return false;
      var si = false;
      try { si = !!o.momentoSeguro(); } catch (e) { si = false; }
      return si && !preguntarOcupado() && !hayTextoALaVista(doc) && !hayCamaraEncendida(doc);
    }
    function hayVersionNueva() {
      return numeroDeVersion(versionDeCaches(claves)) > numeroDeVersion(ctl.opciones.version);
    }
    /* Si no se puede preguntar, NO es «nunca»: es la pregunta de siempre
       (momentoSeguro), que ya dice que no cuando falla. */
    function preguntarNunca() {
      if (typeof o.nuncaEsSeguro !== 'function') return false;
      try { return o.nuncaEsSeguro() === true; } catch (e) { return false; }
    }
    function momentoActual(pedido) {
      if (oculta()) return 'oculta';
      if (pedido === 'transicion') return 'transicion';
      if (!tocoDesdeQueVolvio && ahora() - volvioEn <= VENTANA_AL_VOLVER) return 'volviendo';
      return 'mirando';
    }

    /* ---- la franja ---- */
    function ponerEstilo() {
      if (!doc || !doc.createElement || (doc.getElementById && doc.getElementById(ID_ESTILO))) return;
      var st = doc.createElement('style');
      st.id = ID_ESTILO;
      /* Colores propios y no los tokens de cada página: la misma franja va en
         cuatro pieles distintas (la clara de play/, la oscura de PlataChat, la
         del socio y la del CRM) y tiene que leerse igual en todas. Arriba, y
         no abajo: abajo están la barra de pestañas y los botones de seguir. */
      /* 22-oct-2026 — la pregunta «¿Actualizar igual?» lleva dos botones: el
         texto pasa a su propio renglón (tg-vn-dos) para que en un teléfono de
         360 px no quede en una columna de tres letras, y la ✕ va al final
         (order) aunque «Ahora no» se arme después de ella. */
      st.textContent =
        '.tg-vn{position:fixed;left:0;right:0;top:0;z-index:1000;display:flex;flex-wrap:wrap;align-items:center;gap:10px;' +
        'padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top));background:#FFF4D6;color:#3D2C00;' +
        'border-bottom:1px solid #E8C66A;box-shadow:0 2px 10px rgba(0,0,0,.12);' +
        'font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
        '.tg-vn-texto{flex:1;min-width:0}' +
        '.tg-vn-dos .tg-vn-texto{flex-basis:100%}' +
        '.tg-vn-boton{flex:none;border:0;border-radius:999px;padding:8px 14px;background:#3D2C00;color:#FFF4D6;' +
        'font:inherit;font-weight:700;cursor:pointer}' +
        '.tg-vn-otro{flex:none;border:1px solid #3D2C00;border-radius:999px;padding:7px 13px;background:transparent;' +
        'color:#3D2C00;font:inherit;font-weight:600;cursor:pointer}' +
        '.tg-vn-cerrar{order:1;flex:none;border:0;background:transparent;color:inherit;font-size:20px;line-height:1;' +
        'padding:4px 8px;cursor:pointer}';
      (doc.head || doc.body).appendChild(st);
    }
    function armarFranja() {
      if (franja || !doc || !doc.createElement || !doc.body) return franja;
      ponerEstilo();
      var caja = doc.createElement('div');
      caja.id = ID_FRANJA; caja.className = 'tg-vn';
      if (caja.setAttribute) { caja.setAttribute('role', 'status'); caja.setAttribute('aria-live', 'polite'); }
      var texto = doc.createElement('span'); texto.className = 'tg-vn-texto';
      var boton = doc.createElement('button'); boton.type = 'button'; boton.className = 'tg-vn-boton';
      var cerrar = doc.createElement('button'); cerrar.type = 'button'; cerrar.className = 'tg-vn-cerrar';
      cerrar.textContent = '×';
      if (cerrar.setAttribute) cerrar.setAttribute('aria-label', TEXTOS.cerrar);
      /* «Ahora no», el cuarto: los tres primeros no cambian de lugar. */
      var otro = doc.createElement('button'); otro.type = 'button'; otro.className = 'tg-vn-otro';
      otro.style.display = 'none';
      caja.appendChild(texto); caja.appendChild(boton); caja.appendChild(cerrar); caja.appendChild(otro);
      boton.addEventListener('click', alTocarElBoton);
      otro.addEventListener('click', function () { pedido = ''; evaluar(); });
      /* Cerrar esconde ESE texto; si el estado cambia (llega a una pantalla
         segura y el texto es otro), la franja vuelve con lo nuevo que decir.
         22-oct-2026 — cerrarla con un pedido en curso lo suelta, y lo que
         queda cerrado es lo que la franja diría sin él: si no, al soltarlo
         volvería a salir con el texto de siempre, que nadie cerró.
         22-oct-2026 (verificación de e8f34eb) — lo mismo con «ya terminó»:
         quien lo cierra ya está mirando la pantalla. */
      cerrar.addEventListener('click', function () {
        if (pedido || terminoSinVer) {
          pedido = ''; terminoSinVer = false;
          var x = decisionAhora();
          cerradoTexto = x.d.aviso ? x.d.aviso.texto : '';
          ultima = { accion: x.d.accion === 'recargar' ? 'avisar' : x.d.accion, aviso: x.d.aviso, nueva: x.nueva, momento: x.e.momento };
        } else {
          cerradoTexto = texto.textContent;
        }
        caja.style.display = 'none';
      });
      doc.body.appendChild(caja);
      franja = { caja: caja, texto: texto, boton: boton, cerrar: cerrar, otro: otro };
      return franja;
    }
    /* ¿Este cambio del DOM es la franja misma? Pintarla no es «la pantalla
       cambió»: sin esto se miraría a sí misma sin fin. */
    function esDeLaFranja(r) {
      if (!franja || !r) return false;
      var n = r.target;
      if (n === doc.body && r.type === 'childList') {
        var todos = [];
        try { todos = Array.prototype.slice.call(r.addedNodes || []).concat(Array.prototype.slice.call(r.removedNodes || [])); } catch (e) { todos = []; }
        if (!todos.length) return false;
        for (var i = 0; i < todos.length; i++) if (todos[i] !== franja.caja) return false;
        return true;
      }
      for (var k = 0; n && k < 64; k++) { if (n === franja.caja) return true; n = n.parentNode; }
      return false;
    }
    /* Se esconde con style.display y no con el atributo hidden: una regla
       display:flex le gana a [hidden] y la franja seguiría ahí (ya pasó en
       este proyecto, «pruebas que no miran»). */
    /* La ✕ siempre: en el CRM Joan puede estar una hora en algo y la franja no
       puede taparle la cabecera todo ese rato; y al cliente cerrarla no le
       quita nada (la recarga sola sigue en pie al salir de la app).
       22-oct-2026 — y solo se escribe lo que cambia: ahora se pinta cada vez
       que la página cambia, y reescribir lo mismo es DOM nuevo para nadie
       (y un lector de pantalla que vuelve a leer el aviso). */
    function poner(obj, k, v) { if (obj && obj[k] !== v) obj[k] = v; }
    function pintar(aviso) {
      try {
        if (!aviso || aviso.texto === cerradoTexto) { if (franja) poner(franja.caja.style, 'display', 'none'); return; }
        var f = armarFranja(); if (!f) return;
        poner(f.caja, 'className', aviso.otro ? 'tg-vn tg-vn-dos' : 'tg-vn');
        poner(f.texto, 'textContent', aviso.texto);
        poner(f.boton, 'textContent', aviso.boton || '');
        poner(f.boton.style, 'display', aviso.boton ? '' : 'none');
        poner(f.otro, 'textContent', aviso.otro || '');
        poner(f.otro.style, 'display', aviso.otro ? '' : 'none');
        poner(f.caja.style, 'display', '');
      } catch (e) {}
    }

    /* ---- recargar ---- */
    function recargar(aMano) {
      var nueva = ultima.nueva || versionDeCaches(claves);
      try {
        if (ss) {
          ss.setItem(LLAVE_RECARGA, nueva);
          var lugar = null;
          try { lugar = typeof o.lugar === 'function' ? o.lugar() : null; } catch (e) { lugar = null; }
          ss.setItem(LLAVE_VUELTA, JSON.stringify({ version: nueva, lugar: lugar || null, en: ahora(), aMano: !!aMano }));
        }
      } catch (e) {}
      ultima = { accion: 'recargar', aviso: null, nueva: nueva };
      pedido = ''; terminoSinVer = false;
      try { loc.reload(); } catch (e) {}
    }

    /* ---- la decisión de AHORA, sin aplicarla ---- */
    function decisionAhora(cuando) {
      var nueva = versionDeCaches(claves);
      var nunca = !o.soloAvisar && preguntarNunca();
      var e = {
        pagina: ctl.opciones.version,
        nueva: nueva,
        instalando: !!(reg && (reg.installing || reg.waiting)),
        enLinea: enLinea(),
        soloAvisar: !!o.soloAvisar,
        nunca: nunca,
        seguro: (o.soloAvisar || nunca) ? false : preguntarSeguro(),
        autoPosible: conMemoria && !yaRecargoPor(nueva),
        momento: momentoActual(cuando)
      };
      return { d: decidir(e), e: e, nueva: nueva };
    }

    /* ---- evaluar: con las claves que se conocen ---- */
    function evaluar(cuando) {
      if (!vivo) return ultima;
      /* 22-oct-2026 — si la persona pidió actualizar, lo que manda es su
         pedido (esperar, preguntar o recargar), no la franja de siempre. */
      if (pedido) return seguirElPedido();
      var x = decisionAhora(cuando);
      /* 22-oct-2026 (verificación de e8f34eb) — terminó lo que el pedido
         esperaba y la persona no ha mirado: nada recarga solo (ni oculta, ni
         al volver, ni en una transición), y la franja lo dice mientras el
         botón sirva de algo. */
      if (terminoSinVer) {
        var t = queHacerConLoQueTermino(x);
        if (t === 'decirlo') {
          if (hayVersionNueva()) vigilarLaPagina();
          return mostrar({ texto: TEXTOS.termino, boton: TEXTOS.boton }, x.nueva);
        }
        if (t === 'aguardar') {
          /* Algo salió otra vez (un envío de fondo) o no hay señal: «ya
             terminó» sería mentira, así que se dice lo de siempre, pero sin
             recargar: la respuesta sigue sin ver. */
          if (hayVersionNueva()) vigilarLaPagina();
          ultima = { accion: x.d.accion === 'recargar' ? 'avisar' : x.d.accion, aviso: x.d.aviso, nueva: x.nueva, momento: x.e.momento };
          pintar(x.d.aviso);
          return ultima;
        }
        terminoSinVer = false;
      }
      ultima = { accion: x.d.accion, aviso: x.d.aviso, nueva: x.nueva, momento: x.e.momento };
      if (x.d.accion === 'recargar') { recargar(false); return ultima; }
      if (hayVersionNueva()) vigilarLaPagina();
      pintar(x.d.aviso);
      return ultima;
    }

    /* ---- revisar: pide las claves y evalúa con el estado de AHORA ----
       La respuesta de caches.keys() llega después; lo que se decide con ella
       se decide con la pantalla de ese momento (momentoSeguro se pregunta al
       evaluar, no al pedir). */
    function revisar(cuando) {
      var c = ent.caches;
      if (!c || typeof c.keys !== 'function') return Promise.resolve(evaluar(cuando));
      return Promise.resolve()
        .then(function () { return c.keys(); })
        .then(function (k) { claves = k || []; }, function () {})
        .then(function () { return evaluar(cuando); });
    }

    /* ---- «Actualizar ahora»: el pedido de la persona — 22-oct-2026 ----
       El botón se pintó cuando la pantalla era segura; al tocarlo puede ya no
       serlo (un pedido, una aceptación o un mensaje acaban de salir). Se
       vuelve a preguntar AL TOCAR, y la respuesta se cumple en orden:
         1. algo en camino → se espera, y la franja lo dice; al terminar NO
            se recarga (22-oct-2026, verificación de e8f34eb): la franja dice
            «ya terminó», con el botón, y la persona vuelve a decidir después
            de ver lo que contestó la base (el punto 11 de arriba);
         2. la pantalla ya no es de la lista de la página (salvo en un modo
            «nunca», donde ninguna lo es y la decisión es de la persona) → no
            se recarga: el pedido se suelta y la franja dice lo de siempre
            para ESA pantalla («cuando termines y vuelvas al inicio»);
         3. algo escrito a la vista o la cámara abierta → se pregunta;
         4. nada → recarga.
       Sin señal no se recarga (caería en lo guardado): se suelta el pedido y
       la franja vuelve a lo de siempre, que sin señal no promete nada. */
    function mostrar(aviso, nueva) {
      ultima = { accion: 'avisar', aviso: aviso, nueva: nueva, momento: momentoActual(), pedido: pedido };
      pintar(aviso);
      return ultima;
    }
    function alTocarElBoton() {
      if (o.soloAvisar) { recargar(true); return; }   // el CRM y el espejo: la franja ya le dice a Joan «cuando no tengas nada a medias»
      cerradoTexto = '';
      terminoSinVer = false;   // 22-oct-2026 — tocó el botón: ya miró, y decide
      pedido = pedido === 'confirmar' ? 'confirmado' : 'pendiente';
      seguirElPedido();
    }
    /* La lista blanca de la página sin las dos guardas de este archivo (lo
       tecleado y la cámara): esas se preguntan, no se callan. */
    function preguntarLista() {
      try { return typeof o.momentoSeguro === 'function' && !!o.momentoSeguro(); } catch (e) { return false; }
    }
    /* 22-oct-2026 (verificación de e8f34eb) — con «ya terminó» en pie, qué
       toca AHORA:
         'decirlo'   nada en camino, y el botón sirve (la pantalla es de la
                     lista, o el modo «nunca» deja la decisión a la persona);
         'aguardar'  algo salió otra vez, o no hay señal ni versión que
                     ofrecer: no se dice «ya terminó» (sería mentira) y
                     tampoco se recarga;
         'soltar'    la pantalla ya no es de la lista («Solicitud enviada»):
                     ahí no hay recarga sola que frenar, y la franja dice lo
                     de esa pantalla, como cualquier otra vez. */
    function queHacerConLoQueTermino(x) {
      if (x.d.accion === 'nada' || preguntarOcupado()) return 'aguardar';
      return (x.e.nunca || preguntarLista()) ? 'decirlo' : 'soltar';
    }
    function seguirElPedido() {
      if (!pedido || !vivo) return ultima;
      var nueva = versionDeCaches(claves);
      if (enLinea() && preguntarOcupado()) {
        /* Lo que confirmó era lo que había ANTES de que algo saliera: al
           terminar se vuelve a mirar y, si hace falta, a preguntar. */
        pedido = 'esperando';
        esperarUnRato();
        return mostrar({ texto: TEXTOS.esperando, boton: null }, nueva);
      }
      /* 22-oct-2026 (verificación de e8f34eb) — TERMINÓ LO QUE ESPERABA: no
         se recarga. Aquí se recargaba sin mirar cómo terminó, y si la base
         había dicho que no, la página lo pintaba y la recarga se lo llevaba.
         Se suelta el pedido y la franja dice «ya terminó», con el botón: la
         persona lee la respuesta y decide. También si se cayó la señal con
         algo esperando: lo que falló por eso es lo primero que tiene que ver
         cuando vuelva. */
      if (pedido === 'esperando') {
        pedido = '';
        terminoSinVer = true;
        return evaluar();
      }
      if (!enLinea()) { pedido = ''; return evaluar(); }
      var paginaSegura = preguntarLista();
      if (!paginaSegura && !preguntarNunca()) { pedido = ''; return evaluar(); }
      if (pedido !== 'confirmado') {
        var falta = hayCamaraEncendida(doc) ? TEXTOS.confirmarCamara
          : hayTextoALaVista(doc) ? TEXTOS.confirmarTexto : '';
        if (falta) {
          pedido = 'confirmar';
          return mostrar({ texto: falta, boton: TEXTOS.botonIgual, otro: TEXTOS.ahoraNo }, nueva);
        }
      }
      pedido = '';
      recargar(true);
      return ultima;
    }
    function esperarUnRato() {
      if (relojEspera || typeof ent.setTimeout !== 'function') return;
      try {
        relojEspera = ent.setTimeout(function () {
          relojEspera = 0;
          if (vivo && pedido === 'esperando') seguirElPedido();
        }, ESPERA_ENTRE_MIRADAS);
      } catch (e) { relojEspera = 0; }
    }

    /* ---- volver a mirar — 22-oct-2026 ----
       Mientras haya una versión esperando, la franja se decide otra vez cada
       vez que algo cambia (ver el punto 9 de arriba). Juntas en una sola
       mirada: una pantalla nueva son cientos de cambios del DOM, y basta con
       mirar una vez cuando la página terminó de pintar (una microtarea
       después: el oyente de la página ya corrió). */
    function mirarOtraVez() {
      if (!vivo || !claves || !hayVersionNueva()) return ultima;
      return evaluar();
    }
    function programarMirada() {
      if (miradaPendiente || !vivo) return;
      miradaPendiente = true;
      Promise.resolve().then(function () { miradaPendiente = false; mirarOtraVez(); });
    }
    /* El observador se conecta cuando hay versión nueva, no antes: mientras
       no la haya, la página no paga ni una llamada por cada cambio. Ni en el
       CRM ni en el espejo, cuyo texto no depende de la pantalla. */
    function vigilarLaPagina() {
      if (observador || o.soloAvisar || !doc || !doc.body) return;
      var MO = ent.MutationObserver;
      if (typeof MO !== 'function') return;
      try {
        observador = new MO(function (registros) {
          var l = registros || [];
          for (var i = 0; i < l.length; i++) {
            if (!esDeLaFranja(l[i])) { programarMirada(); return; }
          }
        });
        observador.observe(doc.body, { childList: true, subtree: true, attributes: true,
                                       attributeFilter: ['style', 'class', 'hidden'] });
      } catch (e) { observador = null; }
    }
    /* La página empezó algo (una escritura): se decide YA, con las claves que
       se conocen. No recarga: con algo en camino nunca es momento seguro. */
    function volverAMirar() {
      if (!vivo) return Promise.resolve(ultima);
      if (claves) return Promise.resolve(mirarOtraVez());
      return revisar();
    }

    /* Sin registro todavía (ready no ha contestado) o sin señal, no hay a
       quién preguntar; pero lo que ya se sabe se mira igual. */
    function buscar() {
      if (!vivo) return Promise.resolve(ultima);
      if (!reg || typeof reg.update !== 'function' || !enLinea()) return revisar();
      ultimaBusqueda = ahora();
      var p;
      try { p = reg.update(); } catch (e) { p = null; }
      return Promise.resolve(p).catch(sinNada).then(function () { return revisar(); });
    }

    function yaEsSeguro() {
      if (!vivo) return Promise.resolve(ultima);
      if (claves) return Promise.resolve(evaluar('transicion'));
      return revisar('transicion');
    }

    /* ---- los oyentes ---- */
    oir(sw, 'controllerchange', function () { revisar(); });
    oir(doc, 'visibilitychange', function () {
      if (oculta()) { evaluar(); return; }   // con lo que se sabe: al irse no hay tiempo de preguntar
      volvioEn = ahora(); tocoDesdeQueVolvio = false;
      if (ahora() - ultimaBusqueda > MIN_ENTRE_BUSQUEDAS) buscar(); else revisar();
    });
    oir(ent.window, 'online', function () { buscar(); });
    /* 22-oct-2026 (verificación de e8f34eb) — tocar o teclear en la PÁGINA
       suelta «ya terminó»: la persona está mirando lo que contestó la base,
       y desde ahí vale lo de siempre (con la app oculta, recarga sola). En
       la franja no: su botón y su ✕ deciden ellos. */
    function enLaFranja(ev) {
      if (!franja || !ev || !ev.target) return false;
      var n = ev.target;
      for (var k = 0; n && k < 64; k++) { if (n === franja.caja) return true; n = n.parentNode; }
      return false;
    }
    ['pointerdown', 'touchstart', 'keydown', 'input'].forEach(function (t) {
      oir(doc, t, function (ev) {
        tocoDesdeQueVolvio = true;
        if (terminoSinVer && !enLaFranja(ev)) terminoSinVer = false;
      }, { capture: true, passive: true });
    });
    /* 22-oct-2026 — lo que la persona hace también cambia la respuesta: lo
       tecleado y la casilla marcada no tocan el DOM, así que el observador no
       los ve. En burbuja y no en captura: así el oyente de la página (el
       onchange de la casilla, el onclick del botón) ya corrió cuando se mira.
       Los toques en la franja misma no cuentan: ya deciden ellos. */
    if (!o.soloAvisar) {
      ['click', 'input', 'change'].forEach(function (t) {
        oir(doc, t, function (ev) {
          if (enLaFranja(ev)) return;
          programarMirada();
        }, { passive: true });
      });
    }
    try {
      intervalo = ent.setInterval(function () { if (!oculta()) buscar(); }, CADA);
    } catch (e) { intervalo = 0; }

    Promise.resolve(sw.ready).then(function (r) {
      if (!vivo || !r) return;
      reg = r;
      return buscar();
    }).catch(sinNada);

    ctl.yaEsSeguro = yaEsSeguro;
    ctl.revisar = revisar;
    ctl.volverAMirar = volverAMirar;
    ctl.buscar = buscar;
    ctl.recargar = function () { recargar(true); };
    ctl.estado = function () {
      return { pagina: ctl.opciones.version, nueva: ultima.nueva || '', accion: ultima.accion,
               aviso: ultima.aviso, momento: ultima.momento || '', pedido: pedido, terminoSinVer: terminoSinVer };
    };
    ctl.detener = function () {
      vivo = false;
      oyentes.forEach(function (x) { try { x[0].removeEventListener(x[1], x[2], x[3]); } catch (e) {} });
      oyentes = [];
      try { if (intervalo) ent.clearInterval(intervalo); } catch (e) {}
      try { if (relojEspera && typeof ent.clearTimeout === 'function') ent.clearTimeout(relojEspera); } catch (e) {}
      relojEspera = 0;
      try { if (observador) observador.disconnect(); } catch (e) {}
      observador = null;
    };
    return ctl;
  }

  return {
    PREFIJO_CACHE: PREFIJO_CACHE,
    LLAVE_RECARGA: LLAVE_RECARGA,
    LLAVE_VUELTA: LLAVE_VUELTA,
    MIN_ENTRE_BUSQUEDAS: MIN_ENTRE_BUSQUEDAS,
    CADA: CADA,
    VENTANA_AL_VOLVER: VENTANA_AL_VOLVER,
    VUELTA_VIGENTE: VUELTA_VIGENTE,
    ESPERA_ENTRE_MIRADAS: ESPERA_ENTRE_MIRADAS,
    ID_FRANJA: ID_FRANJA,
    TEXTOS: TEXTOS,
    numeroDeVersion: numeroDeVersion,
    versionDeCaches: versionDeCaches,
    sello: sello,
    decidir: decidir,
    hayTextoALaVista: hayTextoALaVista,
    hayCamaraEncendida: hayCamaraEncendida,
    iniciar: iniciar
  };
});
