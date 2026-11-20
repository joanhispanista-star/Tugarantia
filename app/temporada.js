/* ============================================================================
 * LA TEMPORADA: NAVIDAD — 18 de noviembre de 2026
 *
 * LO QUE PIDIÓ JOAN (18-nov): «que tengamos en la plataforma un diseño de
 * temporada navideña hasta el 7 de enero». Vio tres bocetos (pantalla 18:
 * alumbrado, velitas y un moño) y escogió el alumbrado («Sí, lo recomendado»):
 * una guirnalda de focos colgando de la cabecera, en todas las pestañas, y
 * «¡Feliz Navidad!» junto al nivel. Es el alumbrado de diciembre en Colombia.
 *
 * CUÁNDO: del 20 de noviembre al 7 de enero, TODOS LOS AÑOS, en hora de
 * Colombia. Se apaga sola el vie 8-ene-2027 a las 00:00. El año siguiente
 * vuelve sola el 20-nov: no hay que publicar nada para tenerla, y para no
 * tenerla se quita este archivo.
 *
 * Al principio era del 1-dic. El 20-nov-2026, ya publicada y apagada (v154),
 * Joan pidió «sube lo de navidad desde ya». También escogió que los años
 * siguientes arranque el mismo día («Desde el 20-nov»). Se prendió con v155,
 * ese mismo viernes 20-nov.
 *
 * LA HORA ES LA DEL TELÉFONO, NO LA DEL SERVIDOR: así funciona sin señal, y lo
 * peor que hace un reloj mal puesto es prender la guirnalda un día antes o
 * apagarla un día después. Pero NO se usa la zona horaria del teléfono: un
 * teléfono en hora de Miami, o el de alguien que viajó, la prendería a las
 * 11 de la noche del 19. Se le restan 5 horas al instante y se lee en UTC,
 * que es la hora de Colombia todo el año (aquí no hay horario de verano).
 *
 * QUÉ HACE ESTE ARCHIVO: le pone la clase `tg-navidad` a <html> y, en la
 * página que tiene el chip del nivel (#uNivel: solo la app del cliente), pone
 * al lado el saludo. La guirnalda es toda de temporada.css. Se repasa cada vez
 * que la app vuelve a primer plano: un teléfono que deja la app abierta del 7
 * al 9 de enero no se queda con la guirnalda puesta.
 *
 * LO QUE NO HACE, y es a propósito:
 *   · NO PROMETE NADA. El único texto es «¡Feliz Navidad!». Ni regalos, ni
 *     bonos, ni descuentos, ni rifas o sorteos (Ley 643): la interfaz no dice
 *     lo que el código no hace. pruebas/temporada.test.js lo vigila.
 *   · No pide nada a la red ni guarda nada en el teléfono.
 *   · No toca la plata ni los datos. Si la hoja no llega, la página es la de
 *     siempre: es adorno. Y sin la hoja tampoco pone el saludo, que saldría
 *     suelto y sin su estilo. Este guion, desde que va con versión (20-nov),
 *     entra en «¿LLEGÓ LO QUE PEDÍ?»: si no llega, la app y play/ piden
 *     recargar, como con cualquier guion con versión. Ningún código depende
 *     de window.Temporada.
 *
 * PARA VERLA FUERA DE TEMPORADA en un teléfono de verdad: agregarle
 * ?temporada=navidad a la dirección (…/app/socio.html?temporada=navidad). Solo
 * vale para esa apertura y no cambia nada más.
 *
 * Salió nuevo y sin versión en la dirección (v154). Cambió por primera vez el
 * 20-nov (v155, la fecha), y desde entonces se pide con su ?v=, como los
 * demás. Ya firmaba su llegada.
 * ==========================================================================*/
/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas). */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  var T = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = T;
  else { raiz.Temporada = T; T.arrancar(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HORAS_COLOMBIA = -5;          // UTC−5 todo el año
  var PRIMER_DIA_NOVIEMBRE = 20;    // «desde ya» (Joan, 20-nov-2026), todos los años
  var ULTIMO_DIA_ENERO = 7;         // «hasta el 7 de enero», inclusive
  var CLASE = 'tg-navidad';
  var SALUDO = '¡Feliz Navidad!';

  /* El día en Colombia de un instante (milisegundos desde 1970). */
  function enColombia(ms) {
    var x = new Date(ms + HORAS_COLOMBIA * 3600000);
    return { anio: x.getUTCFullYear(), mes: x.getUTCMonth() + 1, dia: x.getUTCDate() };
  }
  /* ¿Ese instante cae en la temporada? Del 20 de noviembre a fin de mes,
     diciembre entero y del 1 al 7 de enero. */
  function navidad(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return false;
    var c = enColombia(ms);
    return (c.mes === 11 && c.dia >= PRIMER_DIA_NOVIEMBRE) || c.mes === 12 ||
      (c.mes === 1 && c.dia <= ULTIMO_DIA_ENERO);
  }
  /* ?temporada=navidad: para verla antes de tiempo (ver arriba). */
  function forzada(busqueda) {
    return /[?&]temporada=navidad(?:&|$)/.test(String(busqueda || ''));
  }
  function activa(ms, busqueda) {
    return forzada(busqueda) || navidad(ms == null ? Date.now() : ms);
  }

  /* ¿Llegó temporada.css? Su marca es --tg-temporada en :root. Sin la hoja la
     clase no pinta nada (bien), pero el saludo saldría suelto: no se pone. */
  function hojaLlego(doc) {
    try {
      var v = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      if (!v || typeof v.getComputedStyle !== 'function') return false;
      return String(v.getComputedStyle(doc.documentElement).getPropertyValue('--tg-temporada') || '').trim() !== '';
    } catch (e) { return false; }
  }

  /* Prende o apaga la temporada en un documento. Se puede llamar las veces que
     sea: no repite los saludos ni deja uno puesto fuera de temporada. */
  function aplicar(doc, si) {
    if (!doc || !doc.documentElement) return false;
    var html = doc.documentElement, puesto = doc.querySelector('.tg-saludo'), enHola = doc.querySelector('.tg-saludo-hola');
    if (si) html.classList.add(CLASE); else html.classList.remove(CLASE);
    if (!si) {
      if (puesto && puesto.parentNode) puesto.parentNode.removeChild(puesto);
      if (enHola && enHola.parentNode) enHola.parentNode.removeChild(enHola);
      return false;
    }
    var chip = doc.getElementById('uNivel');
    if (chip && chip.parentNode && !puesto && hojaLlego(doc)) {
      var s = doc.createElement('span');
      s.className = 'tg-saludo';
      s.textContent = SALUDO;
      chip.parentNode.insertBefore(s, chip.nextSibling);
    }
    /* 18-nov (2), «Pino y oro»: el mismo saludo en la bienvenida (#hola), debajo
       del lema. Va como texto de verdad y no como content: de la hoja, para que
       viva en un solo sitio (SALUDO). Solo la app del cliente tiene bienvenida:
       en play/ y en la portada no hay lema, y aquí no pasa nada. */
    var lema = doc.querySelector('#hola .lema');
    if (lema && lema.parentNode && !enHola && hojaLlego(doc)) {
      var h = doc.createElement('span');
      h.className = 'tg-saludo-hola';
      h.textContent = SALUDO;
      lema.parentNode.insertBefore(h, lema.nextSibling);
    }
    return true;
  }

  function revisar() {
    try { return aplicar(document, activa(Date.now(), location.search)); } catch (e) { return false; }
  }
  /* Todo dentro de un try: esto es adorno y NUNCA puede frenar la página que lo
     carga. Los bancos de pruebas de la portada y de play/ arrancan las páginas
     con un documento a medias (sin addEventListener) y lo demostraron el
     18-nov: sin el try, este archivo tumbaba los guiones que venían después. */
  function arrancar() {
    if (typeof document === 'undefined') return;
    try {
      revisar();
      if (typeof document.addEventListener !== 'function') return;
      /* Desde el final del <body> el chip ya existe; si algún día este archivo
         se pide más arriba, el saludo espera a que la página termine de leerse. */
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', revisar);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) revisar(); });
    } catch (e) { /* la página sigue como siempre */ }
  }

  return {
    VERSION: '2026-11-20',
    CLASE: CLASE, SALUDO: SALUDO, HORAS_COLOMBIA: HORAS_COLOMBIA,
    PRIMER_DIA_NOVIEMBRE: PRIMER_DIA_NOVIEMBRE, ULTIMO_DIA_ENERO: ULTIMO_DIA_ENERO,
    enColombia: enColombia, navidad: navidad, forzada: forzada, activa: activa,
    aplicar: aplicar, revisar: revisar, arrancar: arrancar
  };
});
