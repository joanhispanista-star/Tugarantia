/* ============================================================================
 * EL CRM EN UN TELÉFONO: LA BARRA DE ABAJO Y «MÁS» — 24 de noviembre de 2026
 *
 * Joan, el 23-nov: «hay muchas pestañas que no me aparecen desde el celular…
 * modificalo». El CRM tiene 17 pestañas en una barra lateral pensada para un
 * monitor: en un teléfono esa barra medía 1.342 px de alto ANTES del contenido.
 * La hoja panel/crm-movil.css deja abajo, fijas, las cuatro de todos los días
 * (Tablero, Créditos, Clientes, Cobranzas). Las otras trece necesitan un botón
 * que las abra encima de lo que se está viendo, y abrir y cerrar algo pide
 * guardar un estado: eso no se puede con solo estilos. Es este archivo.
 *
 * QUÉ HACE, Y NADA MÁS
 *   1. Decide si la hoja del teléfono se enciende: el aparato es un celular o
 *      una tableta (CrmRemoto.esCelular: por el tipo de aparato, NUNCA por el
 *      ancho de la ventana), el menú que hay en la página es el de Joan, Y el
 *      CRM no está abierto sobre una copia guardada en este aparato.
 *      La hoja llega apagada (<link media="not all">) y aquí se le pone
 *      media="screen". En un computador este archivo no hace NADA.
 *
 *      LO DE LA COPIA, Y POR QUÉ: un celular que alguna vez trajo la cartera
 *      (traer.html) la tiene en su gaveta y entra con su PIN a un CRM que SÍ
 *      escribe, sobre una copia que no es la que manda. Esa pantalla es fea a
 *      propósito de nadie, pero su fealdad protege: con botones grandes y
 *      «＋ Nuevo crédito» a todo el ancho invitaría a cobrar ahí. Mientras la
 *      puerta de ese celular no diga la verdad sobre su copia, la hoja solo
 *      se enciende donde no hay copia o donde el CRM está mirando la nube.
 *   2. Mete las trece pestañas que no van en la barra dentro de una caja
 *      (#masHoja) y pone el botón «Más» y su velo. Son los MISMOS botones de
 *      crm.html, movidos de sitio: conservan su oyente (irA) y su número de
 *      pendientes. No se copia ni se inventa ninguna pestaña.
 *   3. Abre y cierra la hoja: «Más», el velo, la ×, Escape, y al escoger una
 *      pestaña. «Buscar» lleva al buscador de arriba.
 *
 * QUÉ NO HACE
 *   · No decide qué se puede mirar o escribir: eso es de crm-remoto.js. Este
 *     archivo no lee la cartera, no guarda nada y no sale a la red.
 *   · No toca el menú del gerente ni el del asesor. modoEquipo() le cambia el
 *     contenido a .side; aquí un vigía lo nota y APAGA la hoja: sus pantallas
 *     no se han mirado con ella. Quedan como estaban.
 *
 * Si este archivo no arma la hoja (un navegador raro, un error), las trece
 * pestañas no se pierden: la hoja de estilos las deja arriba de la página.
 *
 * La parte de arriba es PURA y se prueba en Node: pruebas/crm-movil.test.js.
 * ==========================================================================*/
/* La firma de llegada, como cada .js que una página pide con ?v= (ver «¿LLEGÓ
   LO QUE PEDÍ?» y la nota de v139 en sw.js). En Node no hay document. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./crm-remoto.js'), null);
  else raiz.CrmMovil = fabrica(raiz.CrmRemoto, raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R, W) {
  'use strict';

  /* ======================================================================
   * LO PURO
   * ====================================================================*/

  /* Las que se quedan fijas abajo, en su orden. La MISMA lista está escrita en
     panel/crm-movil.css (el selector de la barra): la prueba compara las dos.
     Solicitudes no va aquí aunque el boceto del 23-nov la traía: el quinto
     puesto es de «Más», y su número de pendientes se ve como un punto rojo
     sobre ese botón. */
  var EN_LA_BARRA = ['dash', 'cred', 'clientes', 'cobranzas'];
  var MEDIA_ENCENDIDA = 'screen';
  var MEDIA_APAGADA = 'not all';

  function enLaBarra(vista) { return EN_LA_BARRA.indexOf(String(vista)) >= 0; }

  /** De todas las pestañas del menú (sus data-v, en orden), las que van a la
      hoja de «Más». Ninguna se pierde: lo que no está en la barra, va adentro. */
  function paraLaHoja(vistas) {
    return (Array.isArray(vistas) ? vistas : []).filter(function (v) { return !!v && !enLaBarra(v); });
  }

  /** La hoja del teléfono se enciende con las TRES cosas: el aparato es un
      celular o una tableta; el menú es el de Joan; y el CRM está mirando la
      nube (solo mirar) o en este aparato no hay una copia guardada de la
      cartera. Sobre una copia local, que se abre con PIN y escribe, NO. */
  function seEnciende(o) {
    var x = o || {};
    return x.celular === true && x.menuDeJoan === true && (x.mirando === true || x.copia !== true);
  }

  var puro = {
    EN_LA_BARRA: EN_LA_BARRA, MEDIA_ENCENDIDA: MEDIA_ENCENDIDA, MEDIA_APAGADA: MEDIA_APAGADA,
    enLaBarra: enLaBarra, paraLaHoja: paraLaHoja, seEnciende: seEnciende
  };
  if (!W) return puro;                 // en Node, hasta aquí

  /* ======================================================================
   * LO QUE TOCA LA PANTALLA
   * ====================================================================*/
  var D = W.document;
  var E = { celular: false, encendida: false, abierto: false, vigia: null };

  function $(id) { return D.getElementById(id); }
  function lado() { try { return D.querySelector('.side'); } catch (e) { return null; } }
  function cercano(el, sel) { try { return el && el.closest ? el.closest(sel) : null; } catch (e) { return null; } }
  function hijosDe(caja) { try { return Array.prototype.slice.call(caja.children || []); } catch (e) { return []; } }
  function vistaDe(boton) { try { return (boton.dataset && boton.dataset.v) || boton.getAttribute('data-v') || ''; } catch (e) { return ''; } }
  function esPestana(el) { try { return !!(el && el.classList && el.classList.contains('navbtn') && vistaDe(el)); } catch (e) { return false; } }

  /** El menú de Joan trae sus pestañas con data-v. El del equipo (modoEquipo)
      trae onclick="irEquipo(…)" y ningún data-v. */
  function menuDeJoan(caja) {
    if (!caja) return false;
    return hijosDe(caja).some(function (x) { return esPestana(x) && vistaDe(x) === 'dash'; });
  }

  /* --------------------------------------------------------- abrir y cerrar */
  function pintarEstado() {
    try { D.documentElement.classList.toggle('mas-abierto', E.abierto); } catch (e) {}
    var b = $('masBtn');
    if (b) b.setAttribute('aria-expanded', E.abierto ? 'true' : 'false');
  }
  function cerrar() { if (!E.abierto) return; E.abierto = false; pintarEstado(); }
  function abrir() { if (E.abierto || !E.encendida) return; E.abierto = true; pintarEstado(); }
  function alternar() { if (E.abierto) cerrar(); else abrir(); }

  /** «Buscar»: el buscador es uno solo y vive arriba de la página. La hoja no
      trae otro: lleva a ese y le pone el cursor. */
  function irAlBuscador() {
    cerrar();
    try { W.scrollTo(0, 0); } catch (e) {}
    try { var campo = $('buscaGlobal'); if (campo && campo.focus) campo.focus(); } catch (e2) {}
  }

  /* ------------------------------------------------------- armar la hoja */
  function crear(etiqueta, clase, id) {
    var x = D.createElement(etiqueta);
    if (clase) x.className = clase;
    if (id) x.id = id;
    return x;
  }
  function armar(caja) {
    var hoja = $('masHoja');
    if (!hoja || hoja.parentNode !== caja) {
      hoja = crear('div', 'mas-hoja', 'masHoja');
      hoja.setAttribute('role', 'dialog');
      hoja.setAttribute('aria-label', 'Las demás pestañas');
      var cabeza = crear('div', 'mas-cabeza');
      var titulo = crear('span'); titulo.textContent = 'Las demás pestañas';
      var equis = crear('button', 'mas-cerrar', 'masCerrar');
      equis.type = 'button'; equis.textContent = '×'; equis.setAttribute('aria-label', 'Cerrar');
      cabeza.appendChild(titulo); cabeza.appendChild(equis);
      var buscar = crear('button', 'mas-buscar', 'masBuscar');
      buscar.type = 'button'; buscar.textContent = '🔍 Buscar por nombre o celular';
      hoja.appendChild(cabeza); hoja.appendChild(buscar);
      /* Un solo oyente para la hoja: la ×, «Buscar», y cualquier pestaña. El
         oyente de cada pestaña (irA) ya corrió cuando el toque sube hasta aquí. */
      hoja.addEventListener('click', function (ev) {
        var t = ev && ev.target;
        if (cercano(t, '.mas-buscar')) return irAlBuscador();
        if (cercano(t, '.mas-cerrar') || cercano(t, '.navbtn')) cerrar();
      });

      var velo = crear('div', 'mas-velo', 'masVelo');
      velo.addEventListener('click', cerrar);

      /* SIN la clase .navbtn, a propósito: crm.html le cuelga irA(b.dataset.v) a
         todo .navbtn que encuentre al arrancar, y este botón no es una pestaña. */
      var boton = crear('button', 'mas-btn', 'masBtn');
      boton.type = 'button';
      boton.setAttribute('aria-controls', 'masHoja');
      boton.setAttribute('aria-expanded', 'false');
      boton.innerHTML = '<span class="ic" aria-hidden="true">☰</span> Más';
      boton.addEventListener('click', alternar);

      /* Después de la última pestaña de la barra: si la pantalla pasa de 880 px
         (el teléfono acostado), la caja no es caja y sus botones siguen ahí, en
         la barra lateral, debajo de los cuatro primeros. */
      var ultima = null;
      hijosDe(caja).forEach(function (x) { if (esPestana(x)) ultima = x; });
      caja.insertBefore(hoja, ultima ? ultima.nextSibling : null);
      caja.appendChild(velo);
      caja.appendChild(boton);
    }
    /* Las pestañas que no van en la barra, adentro y en su orden. Se revisa
       cada vez: lo que ya está adentro no es hijo directo y no se vuelve a mover. */
    hijosDe(caja).forEach(function (x) {
      if (esPestana(x) && !enLaBarra(vistaDe(x))) hoja.appendChild(x);
    });
  }

  /* -------------------------------------------------- encender o apagar */
  /** ¿Hay en ESTE aparato una copia de la cartera? La misma pregunta, con la
      misma función, que decide la puerta en crm-remoto.js. Si el navegador no
      deja leer, no hay copia que abrir. */
  function hayCopia() {
    try { return !!R.gavetaConFichas(W.localStorage.getItem(R.GAVETA)); } catch (e) { return false; }
  }
  function mirando() {
    try { return !!(W.CrmRemoto && typeof W.CrmRemoto.activo === 'function' && W.CrmRemoto.activo()); } catch (e) { return false; }
  }
  function revisar() {
    var caja = lado();
    /* «Tablero» nunca se mueve de .side (va en la barra): con la hoja ya armada
       sigue siendo la señal de que el menú es el de Joan. */
    var si = seEnciende({ celular: E.celular, menuDeJoan: menuDeJoan(caja), copia: hayCopia(), mirando: mirando() });
    try {
      var hoja = $('hojaMovil'), medio = si ? MEDIA_ENCENDIDA : MEDIA_APAGADA;
      if (hoja && hoja.getAttribute('media') !== medio) hoja.setAttribute('media', medio);
    } catch (e) {}
    try { D.documentElement.classList.toggle('tg-celular', si); } catch (e2) {}
    E.encendida = si;
    if (si) { try { armar(caja); } catch (e3) { /* sin hoja de «Más», las trece quedan arriba de la página */ } }
    else { E.abierto = false; pintarEstado(); }
    return si;
  }

  function empezar() {
    E.celular = !!(R && typeof R.esCelular === 'function' && R.esCelular(W.navigator));
    if (!E.celular) return false;          // un computador: ni hoja, ni botón, ni vigía
    revisar();
    /* modoEquipo() le reemplaza el contenido a .side: el vigía lo nota y apaga. */
    try {
      var caja = lado();
      if (caja && typeof W.MutationObserver === 'function') {
        E.vigia = new W.MutationObserver(function () { revisar(); });
        E.vigia.observe(caja, { childList: true });
      }
    } catch (e) {}
    /* Cualquier pestaña de la barra cierra la hoja: se escogió otra cosa. */
    try {
      var c2 = lado();
      if (c2) c2.addEventListener('click', function (ev) { if (E.abierto && cercano(ev && ev.target, '.navbtn')) cerrar(); });
    } catch (e2) {}
    D.addEventListener('keydown', function (ev) { if (E.abierto && ev && ev.key === 'Escape') cerrar(); });
    return true;
  }

  var api = { empezar: empezar, revisar: revisar, abrir: abrir, cerrar: cerrar,
    abierto: function () { return E.abierto; }, encendida: function () { return E.encendida; }, _estado: E };
  Object.keys(puro).forEach(function (k) { api[k] = puro[k]; });

  try { empezar(); } catch (e) { /* sin esta pieza el CRM es el de siempre */ }
  return api;
});
