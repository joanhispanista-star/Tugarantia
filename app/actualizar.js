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
 *   8. AL VOLVER DE UNA RECARGA SUYA la página lo sabe (controlador.vuelta):
 *      se salta la bienvenida de 2 s —la persona no pidió abrir la app— y
 *      vuelve a la pestaña donde estaba (`lugar`, que guarda solo el nombre de
 *      la pestaña: nada sensible cruza la recarga).
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
    panel: 'Hay una versión nueva del panel. Recárgalo cuando no tengas nada a medias.',
    panelSinSenal: 'Hay una versión nueva del panel. Recárgalo cuando vuelva la señal y no tengas nada a medias.',
    boton: 'Actualizar ahora',
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
    if (e.seguro && e.autoPosible && e.momento !== 'mirando') return { accion: 'recargar', aviso: null };
    if (e.seguro) return { accion: 'avisar', aviso: { texto: e.autoPosible ? TEXTOS.alSalir : TEXTOS.lista, boton: TEXTOS.boton } };
    return { accion: 'avisar', aviso: { texto: e.autoPosible ? TEXTOS.alTerminar : TEXTOS.aMano, boton: null } };
  }

  /* ¿Hay algo tecleado A LA VISTA? Una guarda para todas las páginas, además
     de su lista blanca: si alguien escribió algo, recargar se lo borra. Solo
     lo visible (getClientRects vacío = display:none), porque una página
     guarda pantallas enteras escondidas con lo de antes adentro. Los
     deslizadores y las fechas no cuentan: siempre traen valor, y lo suyo lo
     guarda la calculadora. */
  var TIPOS_DE_TEXTO = ['', 'text', 'tel', 'password', 'email', 'search', 'number', 'url'];
  function hayTextoALaVista(doc) {
    try {
      if (!doc || typeof doc.querySelectorAll !== 'function') return false;
      var l = doc.querySelectorAll('input, textarea');
      for (var i = 0; i < l.length; i++) {
        var el = l[i];
        var tag = String(el.tagName || '').toLowerCase();
        var tipo = String((el.getAttribute && el.getAttribute('type')) || el.type || '').toLowerCase();
        if (tag !== 'textarea' && TIPOS_DE_TEXTO.indexOf(tipo) < 0) continue;
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
      clearInterval: function (id) { if (w.clearInterval) w.clearInterval(id); }
    };
  }

  function sinNada() {}

  /* --------------------------------------------------------- EL CONTROLADOR

     o.version        VERSION_SITIO de la página ('v138')
     o.momentoSeguro  () => boolean — la lista blanca de la página; sin ella,
                      nunca es seguro
     o.soloAvisar     true en el CRM y el espejo: nunca recarga sola
     o.lugar          () => {tab: '...'} | null — lo que se recuerda al otro
                      lado de una recarga (solo nombres de pestaña)
     o.entorno        para las pruebas: window, document, navigator, caches,
                      sessionStorage, location, ahora, setInterval, clearInterval

     Devuelve { vuelta, opciones, yaEsSeguro(), revisar(), buscar(),
                recargar(), estado(), detener() }. Nunca lanza: sin service
     worker (http://, file://, un navegador viejo, el banco de pruebas) es un
     controlador que no hace nada. */
  function iniciar(o) {
    o = o || {};
    var ent = entornoDelNavegador();
    if (o.entorno) Object.keys(o.entorno).forEach(function (k) { ent[k] = o.entorno[k]; });
    var ss = ent.sessionStorage || null;
    var ahora = typeof ent.ahora === 'function' ? ent.ahora : function () { return Date.now(); };

    var ctl = {
      vuelta: null,
      opciones: { version: String(o.version || ''), soloAvisar: !!o.soloAvisar },
      yaEsSeguro: sinNada, revisar: sinNada, buscar: sinNada, recargar: sinNada, detener: sinNada,
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

    function oir(blanco, tipo, f, opc) {
      if (!blanco || typeof blanco.addEventListener !== 'function') return;
      try { blanco.addEventListener(tipo, f, opc); oyentes.push([blanco, tipo, f, opc]); } catch (e) {}
    }
    function enLinea() { return !(nav && nav.onLine === false); }
    function oculta() { return !!(doc && (doc.hidden === true || doc.visibilityState === 'hidden')); }
    function yaRecargoPor(version) {
      try { return !!ss && ss.getItem(LLAVE_RECARGA) === version; } catch (e) { return true; }
    }
    function preguntarSeguro() {
      if (typeof o.momentoSeguro !== 'function') return false;
      var si = false;
      try { si = !!o.momentoSeguro(); } catch (e) { si = false; }
      return si && !hayTextoALaVista(doc) && !hayCamaraEncendida(doc);
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
      st.textContent =
        '.tg-vn{position:fixed;left:0;right:0;top:0;z-index:1000;display:flex;align-items:center;gap:10px;' +
        'padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top));background:#FFF4D6;color:#3D2C00;' +
        'border-bottom:1px solid #E8C66A;box-shadow:0 2px 10px rgba(0,0,0,.12);' +
        'font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
        '.tg-vn-texto{flex:1;min-width:0}' +
        '.tg-vn-boton{flex:none;border:0;border-radius:999px;padding:8px 14px;background:#3D2C00;color:#FFF4D6;' +
        'font:inherit;font-weight:700;cursor:pointer}' +
        '.tg-vn-cerrar{flex:none;border:0;background:transparent;color:inherit;font-size:20px;line-height:1;' +
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
      caja.appendChild(texto); caja.appendChild(boton); caja.appendChild(cerrar);
      boton.addEventListener('click', function () { recargar(true); });
      /* Cerrar esconde ESE texto; si el estado cambia (llega a una pantalla
         segura y el texto es otro), la franja vuelve con lo nuevo que decir. */
      cerrar.addEventListener('click', function () { cerradoTexto = texto.textContent; caja.style.display = 'none'; });
      doc.body.appendChild(caja);
      franja = { caja: caja, texto: texto, boton: boton, cerrar: cerrar };
      return franja;
    }
    /* Se esconde con style.display y no con el atributo hidden: una regla
       display:flex le gana a [hidden] y la franja seguiría ahí (ya pasó en
       este proyecto, «pruebas que no miran»). */
    /* La ✕ siempre: en el CRM Joan puede estar una hora en algo y la franja no
       puede taparle la cabecera todo ese rato; y al cliente cerrarla no le
       quita nada (la recarga sola sigue en pie al salir de la app). */
    function pintar(aviso) {
      try {
        if (!aviso || aviso.texto === cerradoTexto) { if (franja) franja.caja.style.display = 'none'; return; }
        var f = armarFranja(); if (!f) return;
        f.texto.textContent = aviso.texto;
        f.boton.textContent = aviso.boton || '';
        f.boton.style.display = aviso.boton ? '' : 'none';
        f.caja.style.display = '';
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
      try { loc.reload(); } catch (e) {}
    }

    /* ---- evaluar: con las claves que se conocen ---- */
    function evaluar(pedido) {
      if (!vivo) return ultima;
      var nueva = versionDeCaches(claves);
      var e = {
        pagina: ctl.opciones.version,
        nueva: nueva,
        instalando: !!(reg && (reg.installing || reg.waiting)),
        enLinea: enLinea(),
        soloAvisar: !!o.soloAvisar,
        seguro: o.soloAvisar ? false : preguntarSeguro(),
        autoPosible: conMemoria && !yaRecargoPor(nueva),
        momento: momentoActual(pedido)
      };
      var d = decidir(e);
      ultima = { accion: d.accion, aviso: d.aviso, nueva: nueva, momento: e.momento };
      if (d.accion === 'recargar') { recargar(false); return ultima; }
      pintar(d.aviso);
      return ultima;
    }

    /* ---- revisar: pide las claves y evalúa con el estado de AHORA ----
       La respuesta de caches.keys() llega después; lo que se decide con ella
       se decide con la pantalla de ese momento (momentoSeguro se pregunta al
       evaluar, no al pedir). */
    function revisar(pedido) {
      var c = ent.caches;
      if (!c || typeof c.keys !== 'function') return Promise.resolve(evaluar(pedido));
      return Promise.resolve()
        .then(function () { return c.keys(); })
        .then(function (k) { claves = k || []; }, function () {})
        .then(function () { return evaluar(pedido); });
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
    ['pointerdown', 'touchstart', 'keydown', 'input'].forEach(function (t) {
      oir(doc, t, function () { tocoDesdeQueVolvio = true; }, { capture: true, passive: true });
    });
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
    ctl.buscar = buscar;
    ctl.recargar = function () { recargar(true); };
    ctl.estado = function () {
      return { pagina: ctl.opciones.version, nueva: ultima.nueva || '', accion: ultima.accion,
               aviso: ultima.aviso, momento: ultima.momento || '' };
    };
    ctl.detener = function () {
      vivo = false;
      oyentes.forEach(function (x) { try { x[0].removeEventListener(x[1], x[2], x[3]); } catch (e) {} });
      oyentes = [];
      try { if (intervalo) ent.clearInterval(intervalo); } catch (e) {}
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
