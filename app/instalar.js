/* ============================================================================
 * INSTALARLA SIN TIENDAS, PASO A PASO — 21 de octubre de 2026
 *
 * Joan: «que la app les explique cómo se hace paso a paso para que quede
 * guardada en el fondo de pantalla de los celulares de los clientes y que
 * tengan los permisos como una app normal». Y decidió el camino: Chrome
 * «Instalar», sin APK. UNA sola app instalable, app/socio.html; el APK de
 * descargas/ se queda para quien ya lo tiene y no se le ofrece a nadie nuevo.
 *
 * POR QUÉ socio.html Y NO play/. play/ guarda la sesión en sessionStorage a
 * propósito (se abre en teléfonos prestados, ver app/sesion-socio.js) y
 * Android no la devuelve al reabrir: instalada, pediría la contraseña cada
 * vez. Y las dos se llaman «Tu Garantía» con el mismo ícono: el cliente
 * quedaría con dos íconos iguales que no hacen lo mismo. Por eso play/ dejó
 * de ofrecerse (ver «DEJARLA EN EL CELULAR» en play/index.html).
 *
 * LO QUE HACE ESTE ARCHIVO, sin DOM y probado en node (pruebas/instalar.test.js):
 *   · dice en qué teléfono y en qué navegador está la persona —el lector del
 *     user-agent es UNO, app/cuenta.js— y si va dentro de Facebook, Instagram,
 *     TikTok, WhatsApp u otra app, donde no se puede instalar;
 *   · dice si ya está instalada: display-mode que no es «browser»,
 *     navigator.standalone del iPhone, o nuestra app de Android según
 *     app/aparato.js (viaDe);
 *   · da los pasos de cada caso con los nombres que tienen HOY los menús;
 *   · recuerda «Ahora no» siete días, en este teléfono;
 *   · y arma la tarjeta, escapada, con las clases de app/socio.html.
 *
 * LOS NOMBRES DE LOS MENÚS, MEDIDOS EL 21-oct-2026 (y por eso con fecha):
 *   · Chrome en Android cambió el menú con Chrome 150 (julio de 2026): ⋮ →
 *     «Instalar y crear acceso directo» → «Instalar». El Chrome de antes dice
 *     «Instalar app» o «Agregar a la pantalla principal». «Crear acceso
 *     directo» NO instala: deja un ícono con el logo de Chrome que abre Chrome.
 *   · iPhone con Safari (iOS 26): ··· → «Compartir» → «Agregar a Inicio» →
 *     «Abrir como app web» → «Agregar». El ⬆ directo solo está en algunos
 *     diseños de la barra.
 *   · iPhone con Chrome o Edge: ⬆ en la barra → «Agregar a Inicio». Se puede
 *     desde iOS 16.4; lo de «en Chrome no sale la opción» fue verdad hasta 2023.
 *   · Samsung Internet: ícono de instalar en la barra, o ≡ → «Añadir página
 *     a» → «Pantalla de inicio». Esas etiquetas en español NO están
 *     verificadas en un Galaxy: por eso la guía avisa que pueden variar.
 *
 * LO QUE NO PUEDE HACER, Y POR ESO LO DICE:
 *   · Instalar sola. El botón «Instalar la app» existe solo si Chrome avisó
 *     (beforeinstallprompt), y Chrome no avisa antes de 30 segundos y un
 *     toque, ni en iPhone, ni en Firefox, ni dentro de otra app. Sin aviso van
 *     los pasos a mano: nunca un botón que no abre nada.
 *   · Mandar avisos al celular. No hay emisor de push (sw.js no escucha
 *     'push'); la guía lo dice así y no pide el permiso, que se quemaría.
 *   · Que el iPhone recuerde la sesión de Safari: la app agregada a Inicio
 *     guarda sus datos aparte (WebKit, «por diseño»). Se dice que hay que
 *     entrar otra vez.
 *   · Darle a la página instalada más permisos que a la pestaña: la cámara y
 *     la ubicación son permisos del navegador por sitio, iguales instalada o
 *     no, y se piden en el momento de usarlos. Eso es lo que dice la frase de
 *     permisos, y nada más.
 *
 * 23-oct-2026 — «YA LA ABRISTE DESDE SU ÍCONO». Joan: «instalé Tu Garantía en
 * el teléfono y aún así sigue apareciendo la información de instálala en el
 * teléfono». Dentro de la app instalada la guía nunca salió (display-mode);
 * salía en la PESTAÑA de Chrome —la portada raíz, o socio.html abierta desde un
 * enlace—, porque una pestaña no tiene cómo saber que la app está instalada.
 * Lo que sí se puede saber, y se anota en este teléfono (LLAVE_INSTALADA):
 *   · que la página se abrió COMO APP (yaInstalada): se anota en cada apertura;
 *   · que Chrome dijo «appinstalled»;
 *   · que la persona tocó «Ya la tengo instalada» (en iPhone es lo único: el
 *     Safari no se entera de nada de lo que pasa en la app de Inicio).
 * Con la marca fresca, la guía se va y queda UNA línea: «ya la abriste desde
 * su ícono… ¿La borraste? Ver cómo instalarla». NUNCA dice «está instalada»:
 * la desinstalación no avisa a nadie, y una marca vieja mentiría. Por eso:
 *   · caduca a los 30 días de la última apertura como app;
 *   · beforeinstallprompt la borra: Chrome solo lo manda si NO está instalada.
 * Que la pestaña de Chrome vea la marca escrita por la app instalada depende de
 * que compartan almacenamiento en el mismo dominio (así lo documenta Chrome
 * para el WebAPK; no está verificado en el teléfono de Joan). Si no lo
 * comparten, la pestaña sigue mostrando la guía y el botón la quita.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.InstalarApp = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LLAVE_AHORA_NO = 'tg_instalar_ahora_no_v1';
  var DIAS_AHORA_NO = 7;
  var DIA = 86400000;
  /* 23-oct-2026 — la marca de «ya la abriste desde su ícono» (ver arriba).
     {visto: milisegundos, via: 'app' | 'appinstalled' | 'boton'}. */
  var LLAVE_INSTALADA = 'tg_app_instalada_v1';
  var DIAS_RECORDADA = 30;
  var VIAS = ['app', 'appinstalled', 'boton'];
  /* La app que se instala. Si la página corre fuera de http(s) —un archivo
     abierto con doble clic—, el enlace que se copia es este, el de verdad. */
  var DIRECCION = 'https://tugarantia.net/app/socio.html';

  var VARIANTES = ['android_chrome', 'android_samsung', 'android_otro', 'iphone_safari', 'iphone_otro', 'dentro_de_app'];
  var NOMBRE_DE_APP = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp', otra_app: '' };
  var NAVEGADOR = { 'Chrome': 'chrome', 'Samsung Internet': 'samsung', 'Safari': 'safari', 'Edge': 'edge', 'Firefox': 'firefox' };
  /* Lo que no es «browser». window-controls-overlay es de computador, pero si
     algún día llega a un teléfono, también es la app abierta. */
  var MODOS_APP = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];

  var INTRO = 'Queda con su ícono, abre a pantalla completa y se actualiza sola cada vez que la abres con internet. ' +
              'No es de la Play Store: se instala desde aquí, sin descargar archivos.';
  /* La frase de permisos. Sin «te avisamos al celular»: no hay emisor de push
     (ver arriba), y una prueba la vigila contra sw.js. La cámara es la del
     registro de play/ (cédula y selfie) y la ubicación la pide play/ una vez. */
  var PERMISOS = 'La cámara la pedimos solo para tu cédula y tu selfie, y la ubicación una vez al registrarte; ' +
                 'siempre en el momento, como cualquier app. Avisos al celular todavía no enviamos: ' +
                 'te escribimos por el chat de la app y por WhatsApp.';
  var BUSCALA = 'Si no la ves en tu pantalla, búscala en tus apps como «Tu Garantía».';

  /* El lector del user-agent y el de nuestra app de Android viven en
     app/cuenta.js y app/aparato.js. Se buscan al usarlos y no al cargar: así
     no importa en qué orden lleguen los <script src>. */
  function cuenta() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') return require('./cuenta.js');
    /* global CuentaSocio */
    return typeof CuentaSocio !== 'undefined' ? CuentaSocio : null;
  }
  function aparato() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { return require('./aparato.js'); } catch (e) { return null; }
    }
    /* global Aparato */
    return typeof Aparato !== 'undefined' ? Aparato : null;
  }
  function texto(v) { return v == null ? '' : String(v); }
  function esc(s) {
    return texto(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ==========================================================================
   * EN QUÉ TELÉFONO ESTÁ
   * ======================================================================== */

  /** {so: 'android'|'ios'|'computador'|'otro', navegador, dentroDe}.
   *  `extra.toques` es navigator.maxTouchPoints: un «Macintosh» con pantalla
   *  táctil es un iPad pidiendo la página de escritorio (igual que aparato.js). */
  function leerPlataforma(ua, extra) {
    var u = texto(ua);
    var x = extra || {};
    var C = cuenta();
    var L = (C && typeof C.leerUserAgent === 'function') ? C.leerUserAgent(u) : { plataforma: '', navegador: '', dentro_de: '' };
    var plat = L.plataforma || '';
    if (plat === 'mac' && Number(x.toques) > 1) plat = 'ipados';
    var so = plat === 'android' ? 'android'
           : (plat === 'ios' || plat === 'ipados') ? 'ios'
           : (plat === 'windows' || plat === 'mac' || plat === 'linux' || plat === 'chromeos') ? 'computador'
           : 'otro';
    /* WhatsApp no está en la lista de app/cuenta.js porque esa lista es la
       misma que valida la base (aparato_anotar): agregarla allá haría que la
       base tirara el dato. Aquí no viaja a ninguna parte, solo decide qué
       decir. Si su navegador de adentro no se anuncia, el «; wv)» de Android
       lo deja igual como «otra app». */
    var dentro = /\bWhatsApp\b/i.test(u) ? 'whatsapp' : texto(L.dentro_de);
    var nav = NAVEGADOR[L.navegador] || (L.navegador ? 'otro' : '');
    return { so: so, navegador: nav, dentroDe: dentro };
  }

  /**
   * ¿Ya está instalada y abierta como app? `entorno` = {navegador, matchMedia,
   * documento, almacen}. matchMedia va ENVUELTO por la página
   * (function (q) { return window.matchMedia(q); }): suelto, el navegador lo
   * rechaza con «Illegal invocation». Nunca lanza.
   */
  function yaInstalada(entorno) {
    var e = entorno || {};
    try {
      if (e.navegador && e.navegador.standalone === true) return true;   // iPhone, desde Inicio
      if (typeof e.matchMedia === 'function') {
        for (var i = 0; i < MODOS_APP.length; i++) {
          var r = e.matchMedia('(display-mode: ' + MODOS_APP[i] + ')');
          if (r && r.matches) return true;
        }
      }
    } catch (x) { /* sin matchMedia no se sabe; se sigue */ }
    try {
      /* Nuestro APK (una TWA) se anuncia por el referrer en la primera carga.
         viaDe ya sabe leerlo y recordarlo: no hay un segundo lector. */
      var A = aparato();
      if (A && typeof A.viaDe === 'function') {
        var v = A.viaDe({ documento: e.documento, almacen: e.almacen, navegador: e.navegador, matchMedia: e.matchMedia });
        if (v === 'app_tu_garantia' || v === 'app_platachat' || v === 'pagina_instalada') return true;
      }
    } catch (x) { /* sin aparato.js, lo de arriba basta */ }
    return false;
  }

  /* ==========================================================================
   * «AHORA NO», SIETE DÍAS
   * Un dato de este teléfono y nada más: ni viaja ni dice nada de la persona.
   * Con el almacenamiento bloqueado (modo privado, datos borrados) no lanza:
   * la página la esconde por esta vez y ya.
   * ======================================================================== */
  function pospuesta(almacen, ahora) {
    try {
      var j = JSON.parse((almacen && almacen.getItem && almacen.getItem(LLAVE_AHORA_NO)) || 'null');
      var hasta = j ? Number(j.hasta) : NaN;
      var t = Number(ahora);
      /* Un reloj que se atrasó (o una fecha escrita a mano) no la esconde para
         siempre: más de siete días por delante no es un «Ahora no» nuestro. */
      return isFinite(hasta) && isFinite(t) && t < hasta && hasta - t <= DIAS_AHORA_NO * DIA;
    } catch (x) { return false; }
  }
  function posponer(almacen, ahora) {
    try {
      if (!almacen || !almacen.setItem) return false;
      almacen.setItem(LLAVE_AHORA_NO, JSON.stringify({ hasta: Number(ahora) + DIAS_AHORA_NO * DIA }));
      return true;
    } catch (x) { return false; }
  }

  /* ==========================================================================
   * «YA LA ABRISTE DESDE SU ÍCONO», 30 DÍAS (23-oct-2026; ver la cabecera)
   * Igual que «Ahora no»: un dato de este teléfono, que no viaja, y que con el
   * almacenamiento bloqueado no lanza (la guía sale como antes).
   * ======================================================================== */

  /** {visto, via} si la marca está fresca; null si no hay, venció o no es nuestra. */
  function recordada(almacen, ahora) {
    try {
      var j = JSON.parse((almacen && almacen.getItem && almacen.getItem(LLAVE_INSTALADA)) || 'null');
      if (!j || typeof j !== 'object') return null;
      var visto = Number(j.visto), t = Number(ahora);
      if (!isFinite(visto) || !isFinite(t)) return null;
      /* Vencida: hace más de 30 días que nadie la abre como app, y pudo
         haberla borrado. Del futuro (más de un día por delante): no la
         escribimos nosotros, o el reloj saltó; no esconde la guía. */
      if (t - visto > DIAS_RECORDADA * DIA || visto - t > DIA) return null;
      return { visto: visto, via: VIAS.indexOf(j.via) >= 0 ? j.via : 'app' };
    } catch (x) { return null; }
  }
  function recordarInstalada(almacen, ahora, via) {
    try {
      if (!almacen || !almacen.setItem) return false;
      almacen.setItem(LLAVE_INSTALADA, JSON.stringify({ visto: Number(ahora), via: VIAS.indexOf(via) >= 0 ? via : 'app' }));
      return true;
    } catch (x) { return false; }
  }
  /** Chrome mandó beforeinstallprompt: NO está instalada (o la borraron). */
  function olvidarInstalada(almacen) {
    try {
      if (!almacen || !almacen.removeItem) return false;
      almacen.removeItem(LLAVE_INSTALADA);
      return true;
    } catch (x) { return false; }
  }
  /** Al abrir: si la página corre como app, se anota (o se refresca) la marca.
   *  Es lo que hace que la pestaña de Chrome, después, no la vuelva a ofrecer. */
  function anotarSiEsApp(entorno) {
    var e = entorno || {};
    if (!yaInstalada(e)) return false;
    return recordarInstalada(e.almacen, e.ahora != null ? Number(e.ahora) : Date.now(), 'app');
  }

  /* ==========================================================================
   * QUÉ LE TOCA
   * ======================================================================== */

  /**
   * {mostrar, motivo, variante, dentroDe, nombreApp, arriba, via}.
   * motivo, cuando no se muestra: 'instalada' | 'pospuesta' | 'computador' | 'otro'.
   * 23-oct-2026 — 'recordada': la marca de «ya la abriste desde su ícono» está
   * fresca. No se muestra la guía; quien la pinta pone UNA línea (tarjetaHTML)
   * con `via` y el enlace para ver la guía igual, por si la borró.
   * `arriba`: dentro de otra app el aviso va primero en Entrar y en la espera
   * (allí no se puede instalar y conviene saberlo antes de escribir nada); en
   * Inicio la página lo deja al final igual, nunca encima de la cuota.
   */
  function decidir(entorno) {
    var e = entorno || {};
    if (yaInstalada(e)) return { mostrar: false, motivo: 'instalada' };
    var nav = e.navegador || {};
    var p = leerPlataforma(nav.userAgent, { toques: nav.maxTouchPoints });
    var variante = '';
    if (p.dentroDe) variante = 'dentro_de_app';
    else if (p.so === 'android') variante = p.navegador === 'chrome' ? 'android_chrome' : p.navegador === 'samsung' ? 'android_samsung' : 'android_otro';
    else if (p.so === 'ios') variante = p.navegador === 'safari' ? 'iphone_safari' : 'iphone_otro';
    /* En un computador no se ofrece: lo que Joan pidió es el celular, y el
       computador que más abre esta app es el suyo («Ver la app como la ve él»). */
    if (!variante) return { mostrar: false, motivo: p.so };
    var ahora = e.ahora != null ? Number(e.ahora) : Date.now();
    if (pospuesta(e.almacen, ahora)) return { mostrar: false, motivo: 'pospuesta', variante: variante };
    var marca = recordada(e.almacen, ahora);
    if (marca) {
      return { mostrar: false, motivo: 'recordada', via: marca.via, variante: variante, dentroDe: p.dentroDe,
               nombreApp: p.dentroDe ? NOMBRE_DE_APP[p.dentroDe] || '' : '', arriba: false };
    }
    return { mostrar: true, motivo: '', variante: variante, dentroDe: p.dentroDe,
             nombreApp: p.dentroDe ? NOMBRE_DE_APP[p.dentroDe] || '' : '', arriba: variante === 'dentro_de_app' };
  }

  /**
   * Los textos de una variante. `opciones.conAviso`: Chrome mandó
   * beforeinstallprompt y hay diálogo que abrir (solo Android).
   * {titulo, intro, boton, antesDePasos, pasos: [], nota, permisos, copiar}
   * Todo es texto plano: lo escapa quien lo pinta (tarjetaHTML).
   */
  function guia(decision, opciones) {
    var d = decision || {};
    var o = opciones || {};
    var v = VARIANTES.indexOf(d.variante) >= 0 ? d.variante : 'android_otro';
    var android = v.indexOf('android_') === 0;
    var g = { titulo: 'Tenla en tu celular como una app', intro: INTRO, boton: '', antesDePasos: '',
              pasos: [], nota: '', permisos: PERMISOS, copiar: false };
    if (android && o.conAviso) {
      g.boton = 'Instalar la app';
      g.antesDePasos = 'Si el botón no abre nada, hazlo a mano:';
    }
    if (v === 'android_chrome') {
      g.pasos = [
        'Toca ⋮, arriba a la derecha.',
        'Elige «Instalar y crear acceso directo» y después «Instalar». En un Chrome más viejo dice «Instalar app» o «Agregar a la pantalla principal».',
        'No elijas «Crear acceso directo»: ese abre Chrome, no la app.',
        BUSCALA
      ];
    } else if (v === 'android_samsung') {
      g.pasos = [
        'Toca el ícono de instalar en la barra de direcciones, arriba.',
        'Si no está, abre el menú ≡, toca «Añadir página a» y después «Pantalla de inicio».',
        BUSCALA
      ];
      g.nota = 'Según la versión de Samsung Internet, los nombres pueden cambiar un poco.';
    } else if (v === 'android_otro') {
      g.pasos = [
        'Abre el menú de tu navegador (⋮ o ≡) y busca «Instalar» o «Agregar a la pantalla de inicio».',
        'Si no aparece, abre esta misma página en Chrome: es el que mejor la instala. Copia el enlace de abajo y pégalo en Chrome.',
        BUSCALA
      ];
      g.copiar = true;
    } else if (v === 'iphone_safari') {
      g.pasos = [
        'Toca ··· y luego «Compartir». Si ves el botón ⬆, tócalo directo.',
        'Baja y toca «Agregar a Inicio».',
        'Deja activado «Abrir como app web» y toca «Agregar».',
        'Ábrela desde el ícono y entra con tu celular y tu contraseña: tu celular la guarda aparte de Safari.'
      ];
    } else if (v === 'iphone_otro') {
      g.pasos = [
        'Toca ⬆ en la barra de direcciones y luego «Agregar a Inicio».',
        'Si no aparece, tu iPhone necesita iOS 16.4 o más nuevo; mientras tanto, ábrela en Safari y hazlo desde ahí.',
        'Ábrela desde el ícono y entra con tu celular y tu contraseña: tu celular la guarda aparte del navegador.'
      ];
    } else {
      var app = texto(d.nombreApp) || (d.dentroDe && NOMBRE_DE_APP[d.dentroDe]) || '';
      g.titulo = app ? 'Estás dentro de ' + app : 'Estás dentro de otra app';
      g.intro = 'Desde aquí no se puede instalar.';
      g.boton = ''; g.antesDePasos = '';
      g.pasos = [
        /* Meta no publica los nombres exactos de ese menú, y cambian: por eso
           dos nombres posibles y, si ninguno está, copiar el enlace. */
        'Toca ⋮ o ··· arriba y elige «Abrir en Chrome» o «Abrir en el navegador» (en iPhone, Safari).',
        'Si no aparece, toca «Copiar enlace» y pégalo en Chrome o en Safari.'
      ];
      /* Aquí no se habla de permisos: lo único que sirve es salir de esta app. */
      g.permisos = '';
      g.copiar = true;
    }
    return g;
  }

  /** La dirección de la app, PELADA: sin # ni ?. En el # pueden ir el pase de
   *  un uso del CRM (#v=) o un paquete de datos (#d=), y nada de eso puede
   *  terminar pegado en otra app ni en el portapapeles. */
  function enlace(loc) {
    try {
      var l = loc || {};
      var proto = texto(l.protocol);
      if (proto !== 'https:' && proto !== 'http:') return DIRECCION;
      var host = texto(l.host || l.hostname);
      if (!host) return DIRECCION;
      return proto + '//' + host + texto(l.pathname || '/');
    } catch (x) { return DIRECCION; }
  }

  /* ==========================================================================
   * LA TARJETA
   * Con las clases de app/socio.html (card, tit, sub, btn sec, muted y las de
   * «instalarla» de su hoja). Las acciones son nombres de funciones de la
   * página, constantes suyas; lo demás se escapa.
   * ======================================================================== */

  /* 23-oct-2026 — la línea que queda cuando la marca está fresca. Dice lo que
     se sabe (cómo se anotó) y nunca «está instalada»: borrarla no avisa. */
  var RECORDADA = {
    app: 'Ya la abriste desde su ícono en este teléfono.',
    appinstalled: 'La instalaste desde aquí en este teléfono.',
    boton: 'Nos dijiste que ya la tienes en este teléfono.'
  };
  var RECORDADA_ABRELA = 'Ábrela desde su ícono: búscala en tus apps como «Tu Garantía».';
  var RECORDADA_VER = '¿La borraste? Ver cómo instalarla';
  function textoRecordada(via) {
    return (RECORDADA[via] || RECORDADA.app) + ' ' + RECORDADA_ABRELA;
  }

  /**
   * `o`: {conAviso, estado: ''|'aceptada'|'instalada', copia: ''|'ok'|'fallo',
   *       enlace, verGuia, acciones: {instalar, ahoraNo, copiar, yaLaTengo, verGuia}}
   * 23-oct-2026 — con la decisión 'recordada' pinta UNA línea, salvo que la
   * persona haya pedido ver la guía (`verGuia`). «Ya la tengo instalada»
   * (acciones.yaLaTengo) va en la guía de los teléfonos, no dentro de otra app:
   * desde ahí no se pudo instalar.
   */
  function tarjetaHTML(decision, o) {
    o = o || {};
    var a = o.acciones || {};
    var dd = decision || {};
    if (dd.motivo === 'recordada' && !o.verGuia && !o.estado) {
      var r = '<div class="instalar-recordada"><p class="muted nota-instalar">' + esc(textoRecordada(dd.via));
      if (a.verGuia) r += ' <button class="enlace-boton" onclick="' + esc(a.verGuia) + '">' + esc(RECORDADA_VER) + '</button>';
      return r + '</p></div>';
    }
    if (o.estado === 'instalada') {
      return '<div class="card instalar"><h3 class="tit">Listo: ya quedó instalada</h3>' +
        '<p class="sub">Búscala en tu pantalla de inicio o entre tus apps como «Tu Garantía» y ábrela desde ahí. ' +
        'Si todavía no aparece, espera unos segundos.</p></div>';
    }
    if (o.estado === 'aceptada') {
      return '<div class="card instalar"><h3 class="tit">Se está instalando</h3>' +
        '<p class="sub">En unos segundos la vas a ver en tu pantalla de inicio o entre tus apps como «Tu Garantía».</p></div>';
    }
    var g = guia(decision, { conAviso: !!o.conAviso });
    var h = '<div class="card instalar">' +
      '<h3 class="tit">' + esc(g.titulo) + '</h3>' +
      '<p class="sub">' + esc(g.intro) + '</p>';
    if (g.boton && a.instalar) {
      h += '<button class="btn sec arriba" onclick="' + esc(a.instalar) + '">' + esc(g.boton) + '</button>';
    }
    if (g.antesDePasos) h += '<p class="sub">' + esc(g.antesDePasos) + '</p>';
    h += '<ol class="pasos-instalar">' + g.pasos.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>';
    if (g.nota) h += '<p class="muted nota-instalar">' + esc(g.nota) + '</p>';
    if (g.copiar) {
      var url = texto(o.enlace) || DIRECCION;
      /* El enlace se ve SIEMPRE, en una caja que se puede seleccionar: dentro
         de otra app el portapapeles suele estar bloqueado, y entonces lo único
         que sirve es mantener el dedo encima y copiarlo a mano. */
      h += '<input type="text" class="enlace-instalar" readonly aria-label="Enlace de la app" value="' + esc(url) + '">';
      if (a.copiar) h += '<button class="btn sec sm arriba" onclick="' + esc(a.copiar) + '">Copiar enlace</button>';
      if (o.copia === 'ok') {
        h += '<p class="sub" role="status">Copiado. Abre Chrome o Safari y pégalo en la barra de direcciones.</p>';
      } else if (o.copia === 'fallo') {
        h += '<p class="sub" role="status">No se pudo copiar solo. Mantén el dedo sobre el enlace y elige «Copiar».</p>';
      }
    }
    if (g.permisos) h += '<p class="muted nota-instalar">' + esc(g.permisos) + '</p>';
    /* 23-oct-2026 — «Ya la tengo instalada»: la única manera de que Safari se
       entere, y la salida para quien la instaló antes de esta versión. */
    if (a.yaLaTengo && dd.variante !== 'dentro_de_app') {
      h += '<button class="btn sec sm arriba" onclick="' + esc(a.yaLaTengo) + '">Ya la tengo instalada</button>';
    }
    if (a.ahoraNo) h += '<button class="btn sec sm arriba" onclick="' + esc(a.ahoraNo) + '">Ahora no</button>';
    return h + '</div>';
  }

  return {
    LLAVE_AHORA_NO: LLAVE_AHORA_NO,
    DIAS_AHORA_NO: DIAS_AHORA_NO,
    DIRECCION: DIRECCION,
    VARIANTES: VARIANTES.slice(),
    INTRO: INTRO,
    PERMISOS: PERMISOS,
    LLAVE_INSTALADA: LLAVE_INSTALADA,
    DIAS_RECORDADA: DIAS_RECORDADA,
    leerPlataforma: leerPlataforma,
    yaInstalada: yaInstalada,
    pospuesta: pospuesta,
    posponer: posponer,
    recordada: recordada,
    recordarInstalada: recordarInstalada,
    olvidarInstalada: olvidarInstalada,
    anotarSiEsApp: anotarSiEsApp,
    textoRecordada: textoRecordada,
    RECORDADA_VER: RECORDADA_VER,
    decidir: decidir,
    guia: guia,
    enlace: enlace,
    tarjetaHTML: tarjetaHTML
  };
});
