/* ============================================================================
 * LA PISTA DE LOS MUNDOS — 14 de noviembre de 2026
 *
 * LO QUE PIDIÓ JOAN: «quiero que la página del cliente tenga una pestaña con
 * una pista interactiva donde muestra el nivel, que se vea más gamificado y
 * que cada nivel tenga una apariencia más fina, como si cada nivel fuera un
 * mundo diferente». Y después, con los bocetos delante: «pule más el mundo».
 *
 * LO QUE ES: la pestaña «Pista» de app/socio.html. Abre en el mundo del
 * cliente —una isla que flota, con la pista encima— y lo pone en el punto
 * exacto de su garantía. Cada crédito pagado es una piedra en la pista; las
 * pagadas en la fecha llevan sello. Debajo: cuánto falta, sus pagos y los
 * nueve mundos; al tocar uno se abre una hoja con lo que lo abre.
 *
 * LO QUE NO SE PUEDE, y manda sobre todo lo de abajo:
 *   · ES CRÉDITO. Aquí nada invita a pedir: el mundo lo mueve PAGAR. La única
 *     vez que sale la palabra es para decirlo: «Pedir no suma: suma pagar».
 *   · NADA FINGIDO. El mundo es el nivel del motor (el tramo de la garantía,
 *     decisión de Joan del 2-sep-2026) y no se inventa otro. El avance sale de
 *     la garantía de hoy; las piedras, de los créditos pagados del paquete.
 *   · EL NIVEL NO CAMBIA EL CRÉDITO, y la hoja lo dice LEYENDO al motor (las
 *     prórrogas y `mueve_el_cupo` de proyeccionNiveles): el día que el motor
 *     cambie, el texto cambia solo en vez de quedarse prometiendo.
 *   · LA GARANTÍA NO ES PLATA DEL CLIENTE (términos §6, decisión del 21-oct):
 *     aquí se llama garantía, nunca plata ni ahorro, y no hay monedas.
 *   · NO MUESTRA A NADIE MÁS: ni invitados ni «Tu gente» (Ley 2300, regla del
 *     29-sep). Eso es de otra pantalla.
 *   · EL CLIENTE NO VE PORCENTAJES (8-sep): cuánto se vuelve garantía se dice
 *     en centavos, con el número que le pasa la página.
 *
 * LO QUE HAY QUE SABER DE LOS DATOS. El paquete trae la garantía de HOY y, por
 * crédito, la que dejó (`garantia`), cuándo se pagó y su corte. NO trae en qué
 * iba la garantía después de cada pago, así que ese punto se reconstruye hacia
 * atrás: la de hoy menos lo que dejaron los créditos posteriores (recorrido).
 * Es exacto mientras entre un pago y otro no haya cambiado nada más (un dato
 * del perfil, un invitado, un ajuste); si cambió, la piedra queda corrida unos
 * pesos. Por eso aquí NO se dice «llegaste a este mundo el día tal»: esa fecha
 * no viaja, y deducirla sería inventarla.
 *
 * «EN FECHA» es la regla del Historial, la misma línea: fecha_pagado <= corte.
 * Un crédito cerrado con pérdida (cerrado_con_perdida) no es una piedra.
 *
 * EL DIBUJO es SVG que este archivo arma como texto: sin imágenes, sin
 * filtros, sin WebGL y sin tocar el documento (por eso corre igual en el
 * banco de pruebas, que no tiene uno de verdad). El relieve sale de tres
 * cosas baratas:
 *   1. una sola proyección para el suelo, la pista y lo que va de pie, de
 *      modo que todo se encoge junto hacia el fondo;
 *   2. caras planas de un solo color para la roca, más claras del lado de la
 *      luz: el ojo las lee como volumen;
 *   3. tres capas (fondo, isla, frente): solo la del medio se mueve, y con
 *      transform, que el teléfono compone sin volver a pintar. Con «reducir
 *      movimiento» se queda quieta (app/pista-niveles.css).
 *
 * ESTE ARCHIVO NO DECIDE NADA DE PLATA y no escribe en ninguna parte: lee lo
 * que la página le pasa (vista) y devuelve HTML. Si no llega, la página no
 * ofrece la pestaña y todo lo demás sigue igual: por eso se pide SIN versión
 * en la dirección (un archivo nuevo no tiene copia vieja con la que
 * mezclarse). El día que cambie, le toca su ?v= como a los demás; ya firma.
 * ==========================================================================*/
/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de
   v139 en sw.js). Va primero: firma que llegó ESTE archivo. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PistaNiveles = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* El motor: en la página ya está cargado (MotorReglas); en una prueba que
     pida este archivo a secas, se trae del lado. Se busca al usarlo, no al
     cargar: este archivo no depende del orden de los <script>. */
  var _motor = null;
  function motor() {
    if (_motor) return _motor;
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    _motor = g.MotorReglas || (typeof module === 'object' && module.exports && typeof require === 'function' ? require('./motor.js') : null);
    return _motor;
  }

  /* Las misiones (app/misiones.js, 16-nov-2026): si llegaron, la pista las
     pinta; si no, se ve como antes. Se buscan al pintar, no al cargar. */
  function misiones() {
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return g.Misiones || null;
  }

  var uid = 0;
  function nuevoId(p) { uid++; return 'pn' + p + uid; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; });
  }
  function COP(n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); }
  var MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  /* «15 oct», y con el año si no es el de la última piedra: una fila de pagos
     que cruza de diciembre a enero no puede dejar dudas de cuál es cuál. */
  function fechaCorta(iso, anioDeReferencia) {
    var p = String(iso || '').slice(0, 10).split('-');
    if (p.length < 3 || !MES3[Number(p[1]) - 1]) return '';
    return Number(p[2]) + ' ' + MES3[Number(p[1]) - 1] + (anioDeReferencia && p[0] !== String(anioDeReferencia) ? ' ' + p[0] : '');
  }
  /* Un azar que siempre da lo mismo con la misma semilla: cada mundo se
     dibuja igual todas las veces (y una prueba puede comparar dos dibujos). */
  function semilla(n) { var x = n >>> 0 || 1; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  function r1(n) { return Math.round(n * 10) / 10; }

  /* Cada nivel del motor es un mundo. Las llaves son las de M.NIVELES, una por
     una (una prueba lo exige: un nivel sin mundo reventaría la pestaña de
     quien llegue a él). El NOMBRE del nivel no vive aquí: lo da el motor
     (nombreNivel), que es de Joan desde el 2-sep-2026. El lema sí: es el
     paisaje del mundo, dicho en dos palabras (los vio y los aprobó el 14-nov).
     18-nov-2026 — EL ÚLTIMO YA NO SE ESCONDE. Iba velado (medalla gris,
     niebla y un «?» hasta llegar). Joan: «quiero que las pistas se vean todas
     incluso la ultima, para que el cliente vea hasta que nivel puede llegar».
     Escogió el boceto 18-A: «Todos los mundos», con las ocho medallas de antes
     en órbita y una corona con una gema de cada mundo. El nombre del nivel
     sigue siendo el del motor. */
  var MUNDOS = {
    'hierro':             { clase: 'pn-m-hierro',   lema: 'La forja' },
    'aluminio':           { clase: 'pn-m-aluminio', lema: 'El cielo' },
    'bronce':             { clase: 'pn-m-bronce',   lema: 'El templo' },
    'plata':              { clase: 'pn-m-plata',    lema: 'La luna' },
    'oro':                { clase: 'pn-m-oro',      lema: 'El sol' },
    'platino':            { clase: 'pn-m-platino',  lema: 'La aurora' },
    'diamante':           { clase: 'pn-m-diamante', lema: 'La cueva de cristal' },
    'materia oscura pro': { clase: 'pn-m-materia',  lema: 'La galaxia' },
    'misterio':           { clase: 'pn-m-misterio', lema: 'Todos los mundos' }
  };

  /* La paleta de cada mundo: son materiales, como el oro de la marca, y no se
     usan para nada fuera de su mundo. cielo = [arriba, medio, horizonte]. */
  var PALETA = {
    'hierro': { cielo: ['#0B0808', '#26130D', '#7A2E10'], luz: '#FF7A2E', lejos: '#3B231A', medio: '#21140E', suelo: ['#241612', '#0C0807'],
      pista: '#2E2826', borde: '#B9B1AA', kerb: ['#E8641F', '#1C1715'], chispa: '#FFB15C' },
    'aluminio': { cielo: ['#0C1A2E', '#30507A', '#F2C9A8'], luz: '#FFE2C2', lejos: '#9FB6D0', medio: '#C9D7E6', suelo: ['#DCE6F1', '#9FB2C7'],
      /* la pista va oscura sobre las nubes: el amarillo de lo recorrido no se
         lee sobre blanco (es la misma razón de la ley de la paleta) */
      pista: '#36414C', borde: '#FFFFFF', kerb: ['#FFFFFF', '#6E9BD6'], chispa: '#FFFFFF' },
    'bronce': { cielo: ['#140B07', '#4D2513', '#E08A42'], luz: '#FFC27A', lejos: '#6A3A1F', medio: '#2C170C', suelo: ['#5A3519', '#1A0E07'],
      pista: '#4B2D18', borde: '#F6D2A8', kerb: ['#6FB3A2', '#F1C79B'], chispa: '#F6D2A8' },
    'plata': { cielo: ['#05080F', '#121A2C', '#33415E'], luz: '#F4F7FC', lejos: '#222B40', medio: '#151C2C', suelo: ['#1B2438', '#080B13'],
      pista: '#2B3446', borde: '#FFFFFF', kerb: ['#E4E8EC', '#7F8891'], chispa: '#DCE7FF' },
    'oro': { cielo: ['#1A1003', '#7A4A0C', '#FFC85A'], luz: '#FFF4CF', lejos: '#B9802A', medio: '#7A4F0E', suelo: ['#8A5A12', '#2A1A03'],
      pista: '#5E3D0B', borde: '#FFF3C9', kerb: ['#FFF3C9', '#B97A12'], chispa: '#FFE7A3' },
    'platino': { cielo: ['#03080B', '#0B2229', '#1F4A50'], luz: '#7DF2C9', lejos: '#7FA5AE', medio: '#3E626B', suelo: ['#9FC7D1', '#3B5E67'],
      pista: '#41606A', borde: '#FBFCFB', kerb: ['#FBFCFB', '#7FD9E8'], chispa: '#FFFFFF' },
    'diamante': { cielo: ['#030A10', '#082030', '#0F3A52'], luz: '#8FE6FF', lejos: '#1E5A78', medio: '#123F57', suelo: ['#0E2A3A', '#03090D'],
      pista: '#123446', borde: '#D9F5FF', kerb: ['#D9F5FF', '#F2B8FF'], chispa: '#FFFFFF' },
    'materia oscura pro': { cielo: ['#04020A', '#140A33', '#3A1678'], luz: '#B48CFF', lejos: '#2A1460', medio: '#1A0C3E', suelo: ['#160B33', '#05020D'],
      pista: '#1E1240', borde: '#DCD0FF', kerb: ['#FF8AD8', '#6E4DF2'], chispa: '#FFFFFF' },
    /* 18-nov: el último, destapado (boceto 18-A). Noche violeta con la luz
       tibia de todos los mundos; antes era una paleta gris de niebla. */
    'misterio': { cielo: ['#05030D', '#1B0F3A', '#4B2466'], luz: '#FFE7C2', lejos: '#2A1B4A', medio: '#1D1238', suelo: ['#2B1D4D', '#0B0618'],
      pista: '#2A1E46', borde: '#FFF3DE', kerb: ['#FFF3DE', '#FF9BD2'], chispa: '#FFFFFF' }
  };

  /* El grabado de cada medalla, en una caja de 100 × 100. */
  var GLIFOS = {
    'hierro': '<path d="M22 40 H66 L82 35 C80 44 73 48 66 48 H61 V56 H67 V64 H33 V56 H39 V48 H30 C25 48 22 45 22 40 Z"/>',
    'aluminio': '<path d="M20 53 L82 28 L62 76 L50 58 Z"/><path d="M50 58 L82 28" fill="none" stroke-width="3"/>',
    'bronce': '<path d="M28 28 H72 V35 H28 Z M33 37 H67 V40 H33 Z M31 64 H69 V72 H31 Z"/><path d="M39 41 V63 M46 41 V63 M54 41 V63 M61 41 V63" fill="none" stroke-width="4"/>',
    'plata': '<path d="M60 23 A28 28 0 1 0 60 77 A22 22 0 1 1 60 23 Z"/><circle cx="70" cy="40" r="2.6"/><circle cx="76" cy="55" r="1.8"/>',
    'oro': '<circle cx="50" cy="50" r="13"/><path d="M50 22 V31 M50 69 V78 M22 50 H31 M69 50 H78 M30 30 L36 36 M64 64 L70 70 M70 30 L64 36 M36 64 L30 70" fill="none" stroke-width="4.5" stroke-linecap="round"/>',
    'platino': '<path d="M18 62 C30 40 42 58 52 40 C60 26 72 44 82 30" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M18 74 C30 54 42 70 52 54 C60 42 72 58 82 46" fill="none" stroke-width="3" stroke-linecap="round" opacity=".7"/>',
    'diamante': '<path d="M28 42 L40 28 H60 L72 42 L50 74 Z"/><path d="M28 42 H72 M40 28 L45 42 L50 74 L55 42 L60 28" fill="none" stroke-width="2.4"/>',
    'materia oscura pro': '<circle cx="50" cy="50" r="7"/><path d="M57 46 C68 36 80 50 70 61 C61 71 42 71 33 61 M43 54 C32 64 20 50 30 39 C39 29 58 29 67 39" fill="none" stroke-width="4.2" stroke-linecap="round"/><circle cx="76" cy="30" r="2.2"/><circle cx="25" cy="72" r="1.8"/>',
    /* una estrella de ocho puntas: una por cada mundo que hubo antes (era un «?») */
    'misterio': '<path d="M50 14 L56 38 L76 24 L62 44 L86 50 L62 56 L76 76 L56 62 L50 86 L44 62 L24 76 L38 56 L14 50 L38 44 L24 24 L44 38 Z"/>'
  };

  /* Los metales de cada medalla: los MISMOS de app/pista-niveles.css (.pn-m-*,
     de --pn-m1 a --pn-m5). Allá pintan las medallas de la página; aquí hacen
     falta para las ocho que orbitan el último mundo, que salen también en la
     imagen para compartir, y una imagen no ve la hoja de estilos: misiones.js
     resuelve las variables con UN solo mundo, y las ocho habrían salido del
     color del último. Una prueba compara las dos tablas. */
  var METAL = {
    'hierro':             ['#E9E4DE', '#B9B1AA', '#857D76', '#514A45', '#24201E'],
    'aluminio':           ['#FFFFFF', '#DCE3EA', '#AAB6C2', '#6F7C89', '#36414C'],
    'bronce':             ['#FBDDB8', '#E2A86F', '#B97A41', '#7A4A22', '#3F230D'],
    'plata':              ['#FFFFFF', '#E6EAEE', '#BBC2C9', '#7F8891', '#3E454C'],
    'oro':                ['#FFF6D6', '#F8D677', '#E2A93A', '#A86E14', '#5E3C05'],
    'platino':            ['#FFFFFF', '#E6EBE9', '#BEC6C3', '#858D8A', '#3F4644'],
    'diamante':           ['#FFFFFF', '#DCF6FF', '#93D6F0', '#3F93B8', '#173F55'],
    'materia oscura pro': ['#E4DAFF', '#A991FF', '#6E4DF2', '#3A2496', '#150A36'],
    'misterio':           ['#FFF8EA', '#F6C9E6', '#B49CFF', '#5A3FA6', '#1A1036']
  };

  /* La pista de cada mundo, en el plano del suelo (u de 0 a 300, v de 25 a
     155). La salida y la meta están en (150,150), que en perspectiva queda
     AL FONDO: el circuito viene hacia quien mira. Una vuelta = un mundo. */
  var CIRCUITOS = {
    'hierro':   'M150,150 H240 A60,60 0 0 0 240,30 H60 A60,60 0 0 0 60,150 Z',
    'aluminio': 'M150,150 H240 A60,60 0 0 0 240,30 H192 C174,30 170,56 150,56 C130,56 126,30 108,30 H60 A60,60 0 0 0 60,150 Z',
    'bronce':   'M150,150 H232 C292,150 292,30 232,30 C196,30 186,72 150,72 C114,72 104,30 68,30 C8,30 8,150 68,150 Z',
    'plata':    'M150,150 H252 C290,150 290,104 252,104 H186 C164,104 164,72 186,72 H252 C292,72 292,30 252,30 H62 C8,30 8,150 62,150 Z',
    'oro':      'M150,152 H252 C274,152 282,134 270,117 L182,31 C166,15 134,15 118,31 L30,117 C18,134 26,152 48,152 Z',
    'platino':  'M150,150 C212,150 228,122 262,122 C302,122 302,40 262,40 C228,40 212,68 150,68 C88,68 72,40 38,40 C-2,40 -2,122 38,122 C72,122 88,150 150,150 Z',
    'diamante': 'M150,154 L272,96 C281,92 281,84 272,80 L158,27 C153,25 147,25 142,27 L28,80 C19,84 19,92 28,96 Z',
    'materia oscura pro': 'M150,152 C244,152 302,124 302,90 C302,56 244,28 150,28 C56,28 -2,56 -2,90 C-2,124 56,152 150,152 Z',
    'misterio': 'M150,150 H240 A60,60 0 0 0 240,30 H60 A60,60 0 0 0 60,150 Z'
  };


  /* ======================= LA MEDALLA ======================= */
  function gradMetal(id, inverso) {
    return '<linearGradient id="' + id + '" x1="' + (inverso ? 1 : 0) + '" y1="' + (inverso ? 1 : 0) +
      '" x2="' + (inverso ? 0 : 1) + '" y2="' + (inverso ? 0 : 1) + '">' +
      '<stop offset="0" style="stop-color:var(--pn-m1)"/><stop offset=".3" style="stop-color:var(--pn-m2)"/>' +
      '<stop offset=".55" style="stop-color:var(--pn-m3)"/><stop offset=".82" style="stop-color:var(--pn-m4)"/>' +
      '<stop offset="1" style="stop-color:var(--pn-m5)"/></linearGradient>';
  }
  /* Canto estriado, cara con el bisel al revés, grabado hundido y un brillo
     arriba a la izquierda: se lee como una moneda y no como un botón. */
  function medalla(nivel, tam) {
    var a = nuevoId('ma'), b = nuevoId('mb'), c = nuevoId('mc');
    var g = GLIFOS[nivel], estrias = '', fina = !tam;   // solo la grande del encabezado lleva el canto estriado
    for (var i = 0; fina && i < 48; i++) {
      var ang = i / 48 * Math.PI * 2, x1 = 50 + Math.cos(ang) * 44.5, y1 = 50 + Math.sin(ang) * 44.5, x2 = 50 + Math.cos(ang) * 48, y2 = 50 + Math.sin(ang) * 48;
      estrias += 'M' + r1(x1) + ' ' + r1(y1) + 'L' + r1(x2) + ' ' + r1(y2);
    }
    return '<svg class="pn-medalla ' + (tam || '') + ' ' + MUNDOS[nivel].clase + '" viewBox="0 0 100 104" aria-hidden="true">' +
      '<defs>' + gradMetal(a) + gradMetal(b, true) +
      '<radialGradient id="' + c + '" cx=".32" cy=".26" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse cx="50" cy="99" rx="34" ry="4.5" fill="#000" opacity=".35"/>' +
      '<circle cx="50" cy="50" r="48" fill="url(#' + a + ')"/>' +
      (fina ? '<path d="' + estrias + '" style="stroke:var(--pn-m5)" stroke-opacity=".35" stroke-width="1.1"/>' : '') +
      '<circle cx="50" cy="50" r="41" fill="url(#' + b + ')"/>' +
      '<circle cx="50" cy="50" r="41" fill="none" style="stroke:var(--pn-m1)" stroke-opacity=".6" stroke-width="1.2"/>' +
      '<circle cx="50" cy="50" r="43.6" fill="none" style="stroke:var(--pn-m5)" stroke-opacity=".55" stroke-width="1"/>' +
      '<g transform="translate(.9 1)" style="fill:var(--pn-m1);stroke:var(--pn-m1)" opacity=".75" stroke-width="0">' + g + '</g>' +
      '<g style="fill:var(--pn-m5);stroke:var(--pn-m5)" stroke-width="0">' + g + '</g>' +
      '<ellipse cx="38" cy="30" rx="30" ry="17" transform="rotate(-28 38 30)" fill="url(#' + c + ')" opacity=".55"/>' +
      '</svg>';
  }
  /* Una medalla DENTRO de otro dibujo (las ocho que orbitan el último mundo):
     el <svg> pasa a <g>, centrada en (x, y), de `tam` de ancho y con los
     metales escritos (METAL) en vez de las variables de la hoja. */
  function medallaEn(nivel, x, y, tam) {
    var k = tam / 100, m = METAL[nivel];
    var g = medalla(nivel, 'pn-orbita').replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>')
      .replace(/var\(--pn-m([1-5])\)/g, function (t, i) { return m[i - 1]; });
    return '<g transform="translate(' + r1(x - 50 * k) + ' ' + r1(y - 52 * k) + ') scale(' + k.toFixed(3) + ')">' + g + '</g>';
  }

  /* ======================= EL PAISAJE ======================= */
  /* Un perfil de montaña de lado a lado. `picos` alterna cumbres y valles. */
  function perfil(W, base, alto, pasos, azar, modo) {
    var pts = [], i;
    for (i = 0; i <= pasos; i++) {
      var x = (i / pasos) * W, r = azar();
      var y = modo === 'picos' ? base - alto * (i % 2 ? 0.55 + 0.45 * r : 0.08 + 0.3 * r) : base - alto * (0.3 + 0.7 * r);
      pts.push([x, y]);
    }
    var d = 'M-2,' + (base + 600) + ' L-2,' + r1(pts[0][1]);
    if (modo === 'suave') {
      for (i = 1; i < pts.length; i++) {
        var mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2;
        d += ' Q' + r1(pts[i - 1][0]) + ',' + r1(pts[i - 1][1]) + ' ' + r1(mx) + ',' + r1(my);
      }
      d += ' L' + (W + 2) + ',' + r1(pts[pts.length - 1][1]);
    } else {
      for (i = 0; i < pts.length; i++) d += ' L' + r1(pts[i][0]) + ',' + r1(pts[i][1]);
    }
    return d + ' L' + (W + 2) + ',' + (base + 600) + ' Z';
  }
  function grad(id, x2, y2, paradas) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '">' + paradas.map(function (p) {
      return '<stop offset="' + p[0] + '" stop-color="' + p[1] + '"' + (p[2] != null ? ' stop-opacity="' + p[2] + '"' : '') + '/>';
    }).join('') + '</linearGradient>';
  }
  function rgrad(id, cx, cy, r, paradas) {
    return '<radialGradient id="' + id + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '">' + paradas.map(function (p) {
      return '<stop offset="' + p[0] + '" stop-color="' + p[1] + '"' + (p[2] != null ? ' stop-opacity="' + p[2] + '"' : '') + '/>';
    }).join('') + '</radialGradient>';
  }
  function estrellas(W, H, n, azar, color, maxY) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var x = azar() * W, y = azar() * (maxY || H), r = 0.35 + azar() * 1.1;
      s += '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r) + '" fill="' + color + '" opacity="' + (0.25 + azar() * 0.6).toFixed(2) + '"/>';
    }
    return s;
  }

  /* El horizonte de cada escena, en proporción del alto. */
  function horizonte(H, r) { return Math.round(H * (r || 0.44)); }

  /* El paisaje de un mundo, sin la pista. Devuelve {defs, cuerpo, frente}:
     el frente (chispas, brillos) va encima del circuito. */
  function paisaje(nivel, W, H, rHz) {
    var P = PALETA[nivel], hz = horizonte(H, rHz), az = semilla(nivel.length * 131 + 7);
    var id = function (n) { return nuevoId(n); };
    var gC = id('cie'), gS = id('sue'), gL = id('luz'), gH = id('bru');
    var defs = grad(gC, 0, 1, [[0, P.cielo[0]], [0.55, P.cielo[1]], [1, P.cielo[2]]]) +
      grad(gS, 0, 1, [[0, P.suelo[0]], [1, P.suelo[1]]]) +
      grad(gH, 0, 1, [[0, P.cielo[2], 0], [1, P.cielo[2], 0.55]]);
    var c = '<rect width="' + W + '" height="' + (hz + 2) + '" fill="url(#' + gC + ')"/>';
    var frente = '';
    var i, x, y;

    if (nivel === 'hierro') {
      defs += rgrad(gL, '.5', '1', '.75', [[0, P.luz, 0.75], [0.5, P.luz, 0.18], [1, P.luz, 0]]);
      c += '<ellipse cx="' + W * 0.5 + '" cy="' + hz + '" rx="' + W * 0.7 + '" ry="' + H * 0.32 + '" fill="url(#' + gL + ')"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.24, 9, az, 'picos') + '" fill="' + P.lejos + '"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.12, 14, az, 'picos') + '" fill="' + P.medio + '"/>';
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      /* las grietas de lava en el suelo, en perspectiva hacia el horizonte */
      for (i = 0; i < 7; i++) {
        x = W * (0.05 + az() * 0.9);
        var d = 'M' + r1(x) + ',' + (hz + 3) + ' L' + r1(W / 2 + (x - W / 2) * 2.4 + (az() - 0.5) * 40) + ',' + (H + 4);
        c += '<path d="' + d + '" stroke="' + P.luz + '" stroke-width="' + (0.6 + az() * 1.2).toFixed(1) + '" opacity=".35" fill="none"/>';
      }
      for (i = 0; i < 22; i++) {
        x = az() * W; y = az() * H * 0.95;
        frente += '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + (0.5 + az() * 1.4).toFixed(1) + '" fill="' + P.chispa + '" opacity="' + (0.35 + az() * 0.55).toFixed(2) + '"/>';
      }
    } else if (nivel === 'aluminio') {
      defs += rgrad(gL, '.2', '1', '.6', [[0, P.luz, 0.95], [0.6, P.luz, 0.15], [1, P.luz, 0]]);
      c += estrellas(W, hz * 0.5, 14, az, '#FFFFFF', hz * 0.45);
      c += '<ellipse cx="' + W * 0.2 + '" cy="' + hz + '" rx="' + W * 0.65 + '" ry="' + H * 0.3 + '" fill="url(#' + gL + ')"/>';
      /* el piso de nubes: tres bancos, del lejano al cercano */
      [[P.lejos, hz - H * 0.02, 12, 16], [P.medio, hz + H * 0.06, 9, 26], ['#E6EEF7', hz + H * 0.16, 7, 38]].forEach(function (b) {
        var s2 = '';
        for (var k = 0; k <= b[2]; k++) {
          var cx = (k / b[2]) * W + (az() - 0.5) * 20, r = b[3] * (0.75 + az() * 0.6);
          s2 += '<circle cx="' + r1(cx) + '" cy="' + r1(b[1]) + '" r="' + r1(r) + '"/>';
        }
        c += '<g fill="' + b[0] + '">' + s2 + '<rect x="-2" y="' + r1(b[1]) + '" width="' + (W + 4) + '" height="' + (H - b[1] + 4) + '"/></g>';
      });
      c += '<rect y="' + (hz + H * 0.2) + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')" opacity=".9"/>';
      frente += '<path d="M' + W * 0.55 + ',' + H * 0.2 + ' C' + W * 0.7 + ',' + H * 0.12 + ' ' + W * 0.85 + ',' + H * 0.14 + ' ' + W * 1.02 + ',' + H * 0.06 + '" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="1.2" fill="none"/>';
    } else if (nivel === 'bronce') {
      defs += rgrad(gL, '.5', '.5', '.5', [[0, '#FFE2B0', 1], [0.35, P.luz, 0.9], [1, P.luz, 0]]);
      var sx = W * 0.68, sy = hz - H * 0.06, sr = H * 0.16;
      c += '<circle cx="' + sx + '" cy="' + sy + '" r="' + sr * 2.4 + '" fill="url(#' + gL + ')" opacity=".55"/>';
      c += '<circle cx="' + sx + '" cy="' + sy + '" r="' + sr + '" fill="#FFD9A0"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.14, 6, az, 'suave') + '" fill="' + P.lejos + '"/>';
      /* el templo: frontón, cornisa, seis columnas y tres escalones */
      var tx = W * 0.6, tw = W * 0.34, th = H * 0.2, ty = hz + 2 - th;
      var col = '', n = 6, cw = tw / (n * 2 - 1);
      for (i = 0; i < n; i++) col += '<rect x="' + r1(tx + i * cw * 2) + '" y="' + r1(ty + th * 0.18) + '" width="' + r1(cw) + '" height="' + r1(th * 0.72) + '"/>';
      c += '<g fill="' + P.medio + '">' + col +
        '<path d="M' + r1(tx - cw * 0.6) + ',' + r1(ty + th * 0.18) + ' L' + r1(tx + tw / 2) + ',' + r1(ty - th * 0.22) + ' L' + r1(tx + tw + cw * 0.6) + ',' + r1(ty + th * 0.18) + ' Z"/>' +
        '<rect x="' + r1(tx - cw * 0.8) + '" y="' + r1(ty + th * 0.86) + '" width="' + r1(tw + cw * 1.6) + '" height="' + r1(th * 0.07) + '"/>' +
        '<rect x="' + r1(tx - cw * 1.4) + '" y="' + r1(ty + th * 0.93) + '" width="' + r1(tw + cw * 2.8) + '" height="' + r1(th * 0.08) + '"/></g>';
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      c += '<path d="' + perfil(W, hz + H * 0.08, H * 0.05, 5, az, 'suave') + '" fill="' + P.suelo[0] + '" opacity=".7"/>';
      for (i = 0; i < 18; i++) frente += '<circle cx="' + r1(az() * W) + '" cy="' + r1(az() * H) + '" r="' + (0.4 + az() * 0.9).toFixed(1) + '" fill="' + P.chispa + '" opacity="' + (0.2 + az() * 0.4).toFixed(2) + '"/>';
    } else if (nivel === 'plata') {
      defs += rgrad(gL, '.5', '.5', '.5', [[0, P.luz, 0.45], [1, P.luz, 0]]);
      var mx = W * 0.74, my = hz * 0.42, mr = H * 0.1;
      c += estrellas(W, hz, 46, az, '#FFFFFF', hz * 0.95);
      c += '<circle cx="' + mx + '" cy="' + my + '" r="' + mr * 3.2 + '" fill="url(#' + gL + ')"/>';
      c += '<circle cx="' + mx + '" cy="' + my + '" r="' + mr + '" fill="#F2F5FA"/>';
      c += '<circle cx="' + (mx - mr * 0.3) + '" cy="' + (my - mr * 0.2) + '" r="' + mr * 0.22 + '" fill="#D5DCE6"/><circle cx="' + (mx + mr * 0.35) + '" cy="' + (my + mr * 0.3) + '" r="' + mr * 0.14 + '" fill="#D9E0EA"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.2, 8, az, 'picos') + '" fill="' + P.lejos + '"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.09, 12, az, 'suave') + '" fill="' + P.medio + '"/>';
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      /* el reflejo de la luna en el lago */
      for (i = 0; i < 9; i++) {
        var ry = hz + 4 + i * (H - hz) * 0.05, rw = mr * (1.6 - i * 0.12) * (0.7 + az() * 0.6);
        c += '<rect x="' + r1(mx - rw / 2) + '" y="' + r1(ry) + '" width="' + r1(rw) + '" height="1.4" rx=".7" fill="#DCE7FF" opacity="' + (0.5 - i * 0.045).toFixed(2) + '"/>';
      }
      /* pinos a los lados, de silueta */
      var pinos = '';
      [[0.02, 1], [0.08, 0.8], [0.9, 0.9], [0.97, 1.1]].forEach(function (p) {
        var px = W * p[0], ph = H * 0.2 * p[1], pb = hz + H * 0.06;
        pinos += '<path d="M' + r1(px) + ',' + r1(pb - ph) + ' L' + r1(px + ph * 0.28) + ',' + r1(pb) + ' L' + r1(px - ph * 0.28) + ',' + r1(pb) + ' Z"/>';
      });
      c += '<g fill="#070A12">' + pinos + '</g>';
    } else if (nivel === 'oro') {
      defs += rgrad(gL, '.5', '.5', '.5', [[0, '#FFFBEA', 1], [0.25, P.luz, 0.9], [0.6, P.luz, 0.2], [1, P.luz, 0]]);
      var ox = W * 0.5, oy = hz - H * 0.02;
      for (i = 0; i < 14; i++) {
        var an = Math.PI * (1 + (i + 0.5) / 14), L = W;
        c += '<path d="M' + ox + ',' + oy + ' L' + r1(ox + Math.cos(an - 0.035) * L) + ',' + r1(oy + Math.sin(an - 0.035) * L) + ' L' + r1(ox + Math.cos(an + 0.035) * L) + ',' + r1(oy + Math.sin(an + 0.035) * L) + ' Z" fill="#FFE7A3" opacity=".09"/>';
      }
      c += '<circle cx="' + ox + '" cy="' + oy + '" r="' + H * 0.36 + '" fill="url(#' + gL + ')"/>';
      c += '<circle cx="' + ox + '" cy="' + oy + '" r="' + H * 0.085 + '" fill="#FFFBEA"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.1, 5, az, 'suave') + '" fill="' + P.lejos + '"/>';
      c += '<path d="' + perfil(W, hz + 4, H * 0.05, 7, az, 'suave') + '" fill="' + P.medio + '"/>';
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      c += '<rect y="' + (hz - 2) + '" width="' + W + '" height="' + (H * 0.06) + '" fill="url(#' + gH + ')" opacity=".9"/>';
      for (i = 0; i < 16; i++) frente += '<circle cx="' + r1(az() * W) + '" cy="' + r1(az() * H) + '" r="' + (0.4 + az()).toFixed(1) + '" fill="' + P.chispa + '" opacity="' + (0.25 + az() * 0.4).toFixed(2) + '"/>';
    } else if (nivel === 'platino') {
      c += estrellas(W, hz, 40, az, '#FFFFFF', hz * 0.9);
      /* la aurora: tres cortinas, cada una con su velo suave y sus rayos
         verticales, que es lo que hace que se lea como aurora y no como nube */
      [['#7DF2C9', 0.1, 0.8, 0.22], ['#4FD1E8', 0.17, 0.55, 0.15], ['#B6A8FF', 0.05, 0.38, 0.12]].forEach(function (a) {
        var gA = id('aur'), gR = id('aur');
        defs += grad(gA, 0, 1, [[0, a[0], 0], [0.3, a[0], a[2] * 0.7], [1, a[0], 0]]) +
          grad(gR, 0, 1, [[0, a[0], 0], [0.2, a[0], a[2] * 0.5], [1, a[0], 0]]);
        var base = H * a[1], largo = H * a[3], fs = az() * 6.28, fr = 1.5 + az() * 1.5;
        var yT = function (x) { return base + Math.sin(x / W * Math.PI * fr + fs) * H * 0.05 + Math.sin(x / W * Math.PI * 7 + fs * 2) * H * 0.012; };
        var d2 = 'M-4,' + r1(yT(-4)), x2;
        for (x2 = 0; x2 <= W + 4; x2 += 8) d2 += ' L' + x2 + ',' + r1(yT(x2));
        for (x2 = W + 4; x2 >= -4; x2 -= 8) d2 += ' L' + x2 + ',' + r1(yT(x2) + largo);
        c += '<path d="' + d2 + ' Z" fill="url(#' + gA + ')"/>';
        var rayos = '';
        for (x2 = 0; x2 <= W; x2 += 2.6) rayos += 'M' + r1(x2) + ',' + r1(yT(x2)) + ' v' + r1(largo * (0.45 + az() * 0.6));
        c += '<path d="' + rayos + '" stroke="url(#' + gR + ')" stroke-width="1.1" fill="none"/>';
      });
      c += '<path d="' + perfil(W, hz + 2, H * 0.17, 7, az, 'picos') + '" fill="' + P.lejos + '"/>';
      c += '<path d="' + perfil(W, hz + 2, H * 0.08, 10, az, 'picos') + '" fill="' + P.medio + '"/>';
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      for (i = 0; i < 8; i++) {
        x = az() * W; y = hz + 6 + az() * (H - hz - 10);
        c += '<path d="M' + r1(x) + ',' + r1(y) + ' l' + r1(10 + az() * 18) + ',' + r1((az() - 0.5) * 4) + ' l' + r1(6 + az() * 10) + ',' + r1(3 + az() * 3) + '" stroke="#FFFFFF" stroke-opacity=".35" stroke-width=".8" fill="none"/>';
      }
      for (i = 0; i < 24; i++) frente += '<circle cx="' + r1(az() * W) + '" cy="' + r1(az() * H) + '" r="' + (0.4 + az() * 0.9).toFixed(1) + '" fill="#FFFFFF" opacity="' + (0.3 + az() * 0.5).toFixed(2) + '"/>';
    } else if (nivel === 'diamante') {
      defs += rgrad(gL, '.5', '.5', '.5', [[0, P.luz, 0.55], [1, P.luz, 0]]);
      c += '<ellipse cx="' + W * 0.5 + '" cy="' + hz * 0.95 + '" rx="' + W * 0.6 + '" ry="' + H * 0.32 + '" fill="url(#' + gL + ')"/>';
      /* Un cristal: prisma de seis caras visto de lado, con su punta, y
         ladeado. Los primeros eran rectángulos con techo y se leían como
         edificios; lo que dice «cristal» es la punta facetada y la inclinación. */
      var cristal = function (cx, base, w, h, ang, t4) {
        var m = w / 2, i2 = m * 0.42, sh = h - w * 0.95, shs = sh - w * 0.12;
        var pts = function (arr) { return arr.map(function (p) { return r1(p[0]) + ',' + r1(p[1]); }).join(' '); };
        return '<g transform="translate(' + r1(cx) + ' ' + r1(base) + ') rotate(' + r1(ang) + ')">' +
          '<polygon points="' + pts([[-m, 0], [-m, -shs], [-i2, -sh], [-i2, 0]]) + '" fill="' + t4[0] + '"/>' +
          '<polygon points="' + pts([[-i2, 0], [-i2, -sh], [i2, -sh], [i2, 0]]) + '" fill="' + t4[1] + '"/>' +
          '<polygon points="' + pts([[i2, 0], [i2, -sh], [m, -shs], [m, 0]]) + '" fill="' + t4[2] + '"/>' +
          '<polygon points="' + pts([[-m, -shs], [0, -h], [-i2, -sh]]) + '" fill="' + t4[1] + '"/>' +
          '<polygon points="' + pts([[-i2, -sh], [0, -h], [i2, -sh]]) + '" fill="' + t4[2] + '"/>' +
          '<polygon points="' + pts([[i2, -sh], [0, -h], [m, -shs]]) + '" fill="' + t4[3] + '"/>' +
          '<path d="M' + r1(-i2) + ',0 V' + r1(-sh) + ' L0,' + r1(-h) + '" stroke="#FFFFFF" stroke-opacity=".5" stroke-width=".7" fill="none"/></g>';
      };
      var hondo = ['#0E3348', '#1C5674', '#2E7FA6', '#7CCDEB'], claro = ['#2E7FA6', '#5FB7DA', '#A6E3F7', '#EAFBFF'], rosa = ['#4A2F66', '#8A5FB0', '#CFA0EA', '#F7E2FF'];
      /* un racimo: varios cristales que nacen del mismo punto y se abren */
      var racimo = function (cx, base, esc2, tonos, n) {
        var s = '';
        for (var k = 0; k < n; k++) {
          var off = k - (n - 1) / 2;
          s += cristal(cx + off * esc2 * 0.15, base, esc2 * (0.2 + az() * 0.07), esc2 * (1 - Math.abs(off) * 0.22) * (0.85 + az() * 0.3), off * 15 + (az() - 0.5) * 8, tonos);
        }
        return s;
      };
      c += racimo(W * 0.12, hz + 2, H * 0.2, hondo, 4) + racimo(W * 0.4, hz + 2, H * 0.13, hondo, 3) +
        racimo(W * 0.66, hz + 2, H * 0.27, hondo, 5) + racimo(W * 0.92, hz + 2, H * 0.17, hondo, 3) +
        racimo(W * 0.27, hz + 2, H * 0.1, claro, 3) + racimo(W * 0.8, hz + 2, H * 0.09, rosa, 3);
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      /* el techo de la cueva: cristales que cuelgan */
      for (i = 0; i < 10; i++) c += cristal(W * (i + 0.5) / 10 + (az() - 0.5) * 18, -3, 8 + az() * 10, H * (0.05 + az() * 0.11), 180 + (az() - 0.5) * 24, hondo);
      c += racimo(W * 0.02, H + 6, H * 0.42, claro, 3) + racimo(W * 0.98, H + 6, H * 0.5, hondo, 4);
      for (i = 0; i < 12; i++) {
        x = az() * W; y = az() * H * 0.9; var s4 = 1.5 + az() * 2.5;
        frente += '<path d="M' + r1(x) + ',' + r1(y - s4) + ' L' + r1(x + s4 * 0.25) + ',' + r1(y) + ' L' + r1(x) + ',' + r1(y + s4) + ' L' + r1(x - s4 * 0.25) + ',' + r1(y) + ' Z M' + r1(x - s4) + ',' + r1(y) + ' L' + r1(x) + ',' + r1(y - s4 * 0.25) + ' L' + r1(x + s4) + ',' + r1(y) + ' L' + r1(x) + ',' + r1(y + s4 * 0.25) + ' Z" fill="#FFFFFF" opacity="' + (0.4 + az() * 0.5).toFixed(2) + '"/>';
      }
    } else if (nivel === 'materia oscura pro') {
      var gN1 = id('neb'), gN2 = id('neb'), gG = id('gal');
      defs += rgrad(gN1, '.5', '.5', '.5', [[0, '#6E4DF2', 0.55], [1, '#6E4DF2', 0]]) + rgrad(gN2, '.5', '.5', '.5', [[0, '#FF8AD8', 0.35], [1, '#FF8AD8', 0]]) +
        rgrad(gG, '.5', '.5', '.5', [[0, '#FFFFFF', 1], [0.12, '#E9DFFF', 0.9], [0.4, '#A48BFF', 0.35], [1, '#A48BFF', 0]]);
      c += '<ellipse cx="' + W * 0.25 + '" cy="' + H * 0.2 + '" rx="' + W * 0.5 + '" ry="' + H * 0.25 + '" fill="url(#' + gN1 + ')"/>';
      c += '<ellipse cx="' + W * 0.8 + '" cy="' + H * 0.35 + '" rx="' + W * 0.4 + '" ry="' + H * 0.18 + '" fill="url(#' + gN2 + ')"/>';
      c += estrellas(W, H, 80, az, '#FFFFFF', hz);
      var gx = W * 0.72, gy = H * 0.2;
      c += '<g transform="rotate(-20 ' + gx + ' ' + gy + ')"><ellipse cx="' + gx + '" cy="' + gy + '" rx="' + W * 0.17 + '" ry="' + H * 0.06 + '" fill="url(#' + gG + ')"/>' +
        '<path d="M' + (gx - W * 0.15) + ',' + gy + ' C' + (gx - W * 0.08) + ',' + (gy - H * 0.07) + ' ' + (gx + W * 0.06) + ',' + (gy - H * 0.05) + ' ' + gx + ',' + gy + ' C' + (gx - W * 0.06) + ',' + (gy + H * 0.05) + ' ' + (gx + W * 0.08) + ',' + (gy + H * 0.07) + ' ' + (gx + W * 0.15) + ',' + gy + '" stroke="#E9DFFF" stroke-opacity=".5" stroke-width="1.2" fill="none"/></g>';
      c += '<rect y="' + hz + '" width="' + W + '" height="' + (H - hz) + '" fill="url(#' + gS + ')"/>';
      /* la rejilla del plano, que se apaga hacia el horizonte */
      for (i = 1; i <= 7; i++) {
        y = hz + (H - hz) * Math.pow(i / 7, 1.8);
        c += '<path d="M0,' + r1(y) + ' H' + W + '" stroke="#A48BFF" stroke-opacity="' + (0.06 + i * 0.03).toFixed(2) + '" stroke-width=".8"/>';
      }
      for (i = -8; i <= 8; i++) c += '<path d="M' + r1(W / 2 + i * 6) + ',' + hz + ' L' + r1(W / 2 + i * W * 0.16) + ',' + H + '" stroke="#A48BFF" stroke-opacity=".12" stroke-width=".8"/>';
    } else {
      /* TODOS LOS MUNDOS (boceto 18-A, 18-nov-2026). Era niebla gris y un «?»;
         ahora el último mundo se ve desde el primer día. Cielo de estrellas
         de arriba abajo (la isla flota: no hay suelo) y, detrás de la isla,
         las ocho medallas de los mundos de antes, en órbita y en su orden. */
      defs += rgrad(gL, '.5', '.5', '.5', [[0, P.luz, 0.55], [1, P.luz, 0]]);
      c = '<rect width="' + W + '" height="' + H + '" fill="url(#' + gC + ')"/>';
      c += estrellas(W, H, 70, az, '#FFFFFF', H * 0.7);
      var ocx = W / 2, ocy = H * 0.36, orx = W * 0.43, ory = H * 0.2, otam = Math.min(W * 0.085, H * 0.15);
      c += '<ellipse cx="' + r1(ocx) + '" cy="' + r1(ocy + H * 0.08) + '" rx="' + r1(W * 0.3) + '" ry="' + r1(H * 0.3) + '" fill="url(#' + gL + ')"/>';
      c += '<ellipse cx="' + r1(ocx) + '" cy="' + r1(ocy) + '" rx="' + r1(orx) + '" ry="' + r1(ory) + '" fill="none" stroke="' + P.luz + '" stroke-opacity=".35" stroke-width="1" stroke-dasharray="2 5"/>';
      var antes = Object.keys(MUNDOS).filter(function (n) { return n !== nivel; });
      antes.forEach(function (n, k) {
        var an2 = (196 + k * (148 / Math.max(1, antes.length - 1))) * Math.PI / 180;
        c += medallaEn(n, ocx + orx * Math.cos(an2), ocy + ory * Math.sin(an2), otam);
      });
      for (i = 0; i < 12; i++) frente += '<circle cx="' + r1(az() * W) + '" cy="' + r1(az() * H) + '" r="' + (0.4 + az() * 0.9).toFixed(1) + '" fill="' + P.chispa + '" opacity="' + (0.25 + az() * 0.45).toFixed(2) + '"/>';
    }
    return { defs: defs, cuerpo: c, frente: frente, hz: hz };
  }

  /* ======================= LA PROYECCIÓN ======================= */
  /* Un plano inclinado mirado desde arriba y de frente: la misma cuenta que
     hace el navegador con rotateX y perspective, escrita a mano para poder
     poner encima, de pie, el marcador y la meta. */
  function proyectar(u, v, alto) {
    /* PROF estira el fondo: los trazados miden 300 × 130 y, vistos de lado,
       quedarían como una cinta; así el circuito tiene cuerpo. */
    var th = 47 * Math.PI / 180, p = 330, PROF = 1.5;
    var x = u - 150, t = (v - 90) * PROF, z = t * Math.sin(th), k = p / (p + z);
    return [x * k, -t * Math.cos(th) * k - (alto || 0) * k, k];
  }


  /* ======================= EL MUNDO COMO ISLA ======================= */
  /* ---------- color: mezclar dos tonos es todo lo que hace falta ---------- */
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mezcla(a, b, t) {
    var A = rgb(a), B = rgb(b); t = Math.max(0, Math.min(1, t));
    return '#' + [0, 1, 2].map(function (i) { var v = Math.round(A[i] + (B[i] - A[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function pt(q) { return r1(q[0]) + ',' + r1(q[1]); }
  /* El borde del mismo color de la cara tapa la rendija que deja el
     suavizado entre dos polígonos vecinos. */
  function cara(pts, color, extra) {
    return '<polygon points="' + pts.map(pt).join(' ') + '" fill="' + color + '" stroke="' + color + '"' + (extra || '') + '/>';
  }

  /* ---------- cada mundo, como isla ----------
     forma: roca (borde irregular y panza de piedra) · placa (cubierta de
     metal, casco liso) · gema (tallada, con facetas) · disco (vidrio negro).
     suelo [lejos, cerca] · canto y roca [claro, hondo] · lado: de dónde viene
     la luz (-1 izquierda, 1 derecha), que es donde está el sol del paisaje. */
  var ISLA = {
    'hierro': { forma: 'roca', lados: 52, ruido: 0.05, mella: 0.16, faceta: 0.1, q2: 0.4, q3: 0.74, alto: 7, hondo: 66, lado: -1,
      suelo: ['#5A453D', '#261914'], canto: ['#8E6C5A', '#35241D'], roca: ['#6E4F40', '#120B09'], filo: '#FFB070', halo: '#FF6A1F', haloOp: 0.6, monu: [106, 92], islotes: [[0.1, 0.8, 0.14], [0.91, 0.66, 0.1]] },
    'aluminio': { forma: 'placa', lados: 72, ruido: 0, mella: 0, faceta: 0, q2: 0.3, q3: 0.6, alto: 11, hondo: 54, lado: -1,
      suelo: ['#D3DCE6', '#93A4B7'], canto: ['#C6D1DD', '#4E5C6B'], roca: ['#A9B7C6', '#1F2A36'], filo: '#FFFFFF', halo: '#BFE0FF', haloOp: 0.5, monu: [104, 102],
      islotes: [[0.1, 0.8, 0.14], [0.91, 0.66, 0.1]] },
    'bronce': { forma: 'roca', lados: 52, ruido: 0.05, mella: 0.15, faceta: 0.09, q2: 0.4, q3: 0.74, alto: 8, hondo: 66, lado: 1,
      suelo: ['#DDA060', '#8A5426'], canto: ['#F8D4A2', '#A66A36'], roca: ['#C48246', '#2E1808'], filo: '#FFE6C0', halo: '#FF9A3C', haloOp: 0.4, monu: [98, 100], islotes: [[0.1, 0.78, 0.14]] },
    'plata': { forma: 'roca', lados: 52, ruido: 0.045, mella: 0.15, faceta: 0.08, q2: 0.4, q3: 0.74, alto: 7, hondo: 66, lado: 1,
      suelo: ['#BEC6D1', '#667080'], canto: ['#F6F9FC', '#8B95A3'], roca: ['#A8B1BE', '#1E232D'], filo: '#FFFFFF', halo: '#BFD0F0', haloOp: 0.32, monu: [96, 92], islotes: [[0.09, 0.82, 0.13]] },
    'oro': { forma: 'roca', lados: 52, ruido: 0.05, mella: 0.15, faceta: 0.09, q2: 0.4, q3: 0.74, alto: 8, hondo: 66, lado: -1,
      suelo: ['#F9D878', '#B8811C'], canto: ['#FFF4C8', '#CC962C'], roca: ['#E2AE44', '#402705'], filo: '#FFF9E0', halo: '#FFD060', haloOp: 0.45, monu: [124, 100], islotes: [[0.09, 0.84, 0.12], [0.92, 0.8, 0.09]] },
    'platino': { forma: 'roca', lados: 52, ruido: 0.05, mella: 0.17, faceta: 0.12, q2: 0.4, q3: 0.74, alto: 8, hondo: 68, lado: -1,
      suelo: ['#F8FDFE', '#BCDDE5'], canto: ['#FFFFFF', '#CDE9F0'], roca: ['#D8F1F7', '#28525E'], filo: '#FFFFFF', halo: '#7DF2C9', haloOp: 0.4, monu: [118, 104], islotes: [[0.09, 0.86, 0.12], [0.92, 0.82, 0.09]] },
    'diamante': { forma: 'gema', lados: 14, exp: 2.2, ruido: 0, mella: 0, faceta: 0.2, q2: 0.52, q3: 0.9, alto: 5, hondo: 86, lado: -1,
      suelo: ['#2E86AE', '#0F374E'], canto: ['#E4FAFF', '#4FA5C8'], roca: ['#B9ECFB', '#0B2C40'], filo: '#FFFFFF', halo: '#8FE6FF', haloOp: 0.55, monu: [118, 90] },
    'materia oscura pro': { forma: 'disco', lados: 64, exp: 2.2, ruido: 0, mella: 0.3, faceta: 0.12, q2: 0.42, q3: 0.78, alto: 6, hondo: 72, lado: 1,
      suelo: ['#2C1C66', '#0D0722'], canto: ['#4A34A8', '#120930'], roca: ['#38277A', '#05020C'], filo: '#E4DAFF', halo: '#B48CFF', haloOp: 0.5, monu: [112, 90], islotes: [[0.09, 0.78, 0.1], [0.93, 0.9, 0.07]] },
    'misterio': { forma: 'roca', lados: 52, ruido: 0.05, mella: 0.15, faceta: 0.06, q2: 0.4, q3: 0.74, alto: 7, hondo: 66, lado: -1,
      /* 18-nov: de gris a perla y lila (boceto 18-A) */
      suelo: ['#EFE4FF', '#A993E0'], canto: ['#E2D4FF', '#6C58A8'], roca: ['#8D78C9', '#1E1440'], filo: '#FFFFFF', halo: '#FFD7F0', haloOp: 0.5, monu: [150, 96] }
  };

  /* El borde de la isla, en el plano del suelo: una superelipse (un óvalo
     de esquinas llenas) que deja la pista adentro con margen. El ruido la
     vuelve costa; las formas hechas a máquina no lo llevan. */
  function contorno(nivel) {
    var c = ISLA[nivel], N = c.lados, az = semilla(nivel.length * 53 + 5), A = 194, B = 103, e = c.exp || 2.7;
    var f1 = az() * 6.283, f2 = az() * 6.283, pts = [];
    for (var i = 0; i < N; i++) {
      var th = (i + 0.5) / N * 6.2832, cs = Math.cos(th), sn = Math.sin(th);
      var r = Math.pow(Math.pow(Math.abs(cs) / A, e) + Math.pow(Math.abs(sn) / B, e), -1 / e);
      var w = c.ruido ? 1 + c.ruido * (Math.sin(3 * th + f1) * 0.45 + Math.sin(5 * th + f2) * 0.3 + (az() - 0.5) * 0.5) : 1;
      pts.push([150 + cs * r * w, 90 + sn * r * w]);
    }
    return pts;
  }

  /* El lienzo: la escala y el sitio de la isla dentro de su caja. De aquí
     salen TODAS las coordenadas (isla, pista, monumento, marcador). */
  function lienzo(nivel, caja) {
    var c = ISLA[nivel], borde = contorno(nivel);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    borde.forEach(function (p) {
      var q = proyectar(p[0], p[1], 0);
      minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
    });
    var abajo = maxY + c.hondo;
    var s = Math.min(caja.w / (maxX - minX), caja.h / (abajo - minY));
    var ox = caja.x + (caja.w - (maxX - minX) * s) / 2 - minX * s, oy = caja.y + caja.h - abajo * s;
    function P(u, v, alto) { var q = proyectar(u, v, alto); return [ox + q[0] * s, oy + q[1] * s, q[2] * s]; }
    return { s: s, borde: borde, P: P, g: function (u, v) { return pt(P(u, v, 0)); } };
  }
  /* Un círculo en el suelo, ya en perspectiva (el fondo va estirado 1,5). */
  function disco(L, u0, v0, R, n) {
    var pts = []; n = n || 22;
    for (var i = 0; i < n; i++) { var a = i / n * 6.2832; pts.push(L.g(u0 + Math.cos(a) * R, v0 + Math.sin(a) * R / 1.5)); }
    return pts;
  }
  /* Una grieta: una línea que camina torcida por el suelo. */
  function grieta(L, az, u, v, pasos, largo) {
    var d = 'M' + L.g(u, v), ang = az() * 6.283;
    for (var j = 0; j < pasos; j++) { ang += (az() - 0.5) * 1.7; u += Math.cos(ang) * largo * (0.6 + az() * 0.8); v += Math.sin(ang) * largo * 0.6 * (0.6 + az() * 0.8); d += ' L' + L.g(u, v); }
    return d;
  }
  function onda(L, v, amp, fase, paso) {
    var d = '';
    for (var u = -50; u <= 350; u += paso || 14) d += (d ? ' L' : 'M') + L.g(u, v + Math.sin(u * 0.045 + fase) * amp);
    return d;
  }

  /* ---------- el suelo de cada mundo: lo que lo hace de ese material ---------- */
  var TEXTURA = {
    'hierro': function (L, az) {
      var s = '', i;
      for (i = 0; i < 6; i++) s += '<polygon points="' + disco(L, az() * 300, 20 + az() * 150, 14 + az() * 22, 9).join(' ') + '" fill="#120B09" opacity=".22"/>';
      for (i = 0; i < 9; i++) {
        var d = grieta(L, az, 10 + az() * 280, 15 + az() * 150, 5, 15);
        s += '<path d="' + d + '" fill="none" stroke="#FF5A14" stroke-opacity=".3" stroke-width="' + r1(3.4 * L.s) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="#FFC27A" stroke-opacity=".95" stroke-width="' + r1(0.95 * L.s) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      }
      return s;
    },
    'aluminio': function (L, az) {
      var s = '', u, v;
      /* el reflejo de la chapa: una franja de luz que la cruza en diagonal */
      s += '<polygon points="' + [L.g(-40, 200), L.g(40, 200), L.g(190, -20), L.g(110, -20)].join(' ') + '" fill="#FFFFFF" opacity=".5"/>' +
        '<polygon points="' + [L.g(120, 200), L.g(150, 200), L.g(300, -20), L.g(270, -20)].join(' ') + '" fill="#FFFFFF" opacity=".28"/>';
      for (u = -50; u <= 350; u += 40) s += '<path d="M' + L.g(u, -20) + ' L' + L.g(u, 200) + '" stroke="#6F7C89" stroke-opacity=".3" stroke-width=".8"/>';
      for (v = -15; v <= 200; v += 27) s += '<path d="M' + L.g(-60, v) + ' L' + L.g(360, v) + '" stroke="#6F7C89" stroke-opacity=".3" stroke-width=".8"/>';
      for (u = -50; u <= 350; u += 40) for (v = -15; v <= 200; v += 27) {
        var q = L.P(u + 4, v + 3, 0);
        s += '<circle cx="' + r1(q[0]) + '" cy="' + r1(q[1]) + '" r="' + r1(0.9 * q[2]) + '" fill="#7F90A3" opacity=".7"/>';
      }
      return s;
    },
    'bronce': function (L, az, c) {
      var s = '', i;
      for (i = 0; i < 9; i++) s += '<path d="' + onda(L, 2 + i * 22, 3, az() * 6, 14) + '" fill="none" stroke="#FFE6C0" stroke-opacity=".22" stroke-width="' + r1(1.1 * L.s) + '"/>';
      /* la plaza de losas alrededor del templete */
      s += '<polygon points="' + disco(L, c.monu[0], c.monu[1], 40).join(' ') + '" fill="#F8D4A2" opacity=".38"/>' +
        '<polygon points="' + disco(L, c.monu[0], c.monu[1], 40).join(' ') + '" fill="none" stroke="#7A4A22" stroke-opacity=".45" stroke-width="1"/>' +
        '<polygon points="' + disco(L, c.monu[0], c.monu[1], 27).join(' ') + '" fill="none" stroke="#7A4A22" stroke-opacity=".3" stroke-width=".8"/>';
      for (i = 0; i < 12; i++) { var a = i / 12 * 6.2832; s += '<path d="M' + L.g(c.monu[0] + Math.cos(a) * 27, c.monu[1] + Math.sin(a) * 18) + ' L' + L.g(c.monu[0] + Math.cos(a) * 40, c.monu[1] + Math.sin(a) * 26.7) + '" stroke="#7A4A22" stroke-opacity=".3" stroke-width=".8"/>'; }
      return s;
    },
    'plata': function (L, az) {
      var s = '', i;
      for (i = 0; i < 12; i++) {
        var u = az() * 300, v = 10 + az() * 165, R = 7 + az() * 13, d = disco(L, u, v, R, 18);
        s += '<polygon points="' + d.join(' ') + '" fill="#2E3440" opacity=".3"/>' +
          '<path d="M' + d.slice(1, 9).join(' L') + '" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="' + r1(1.1 * L.s) + '" stroke-linecap="round"/>' +
          '<path d="M' + d.slice(10, 18).join(' L') + '" fill="none" stroke="#1E232D" stroke-opacity=".35" stroke-width="' + r1(1.1 * L.s) + '" stroke-linecap="round"/>';
      }
      return s;
    },
    'oro': function (L, az) {
      var s = '', i;
      for (i = 0; i < 11; i++) s += '<path d="' + onda(L, -2 + i * 19, 4.5, az() * 6, 12) + '" fill="none" stroke="' + (i % 2 ? '#FFF6D0' : '#9A6A10') + '" stroke-opacity="' + (i % 2 ? '.45' : '.22') + '" stroke-width="' + r1(1.3 * L.s) + '"/>';
      for (i = 0; i < 26; i++) { var q = L.P(az() * 300, az() * 180, 0); s += '<circle cx="' + r1(q[0]) + '" cy="' + r1(q[1]) + '" r="' + r1((0.5 + az() * 0.9) * q[2]) + '" fill="#FFFBEA" opacity="' + (0.4 + az() * 0.5).toFixed(2) + '"/>'; }
      return s;
    },
    'platino': function (L, az) {
      var s = '', i;
      for (i = 0; i < 7; i++) s += '<polygon points="' + disco(L, az() * 300, 10 + az() * 165, 22 + az() * 30, 12).join(' ') + '" fill="#FFFFFF" opacity=".55"/>';
      for (i = 0; i < 8; i++) s += '<path d="' + grieta(L, az, 10 + az() * 280, 15 + az() * 150, 4, 16) + '" fill="none" stroke="#5FA9BC" stroke-opacity=".5" stroke-width="' + r1(0.8 * L.s) + '" stroke-linejoin="round"/>';
      return s;
    },
    'diamante': function (L, az, c) {
      /* la isla es una gema: arriba se le ve la mesa y la corona talladas */
      var B = L.borde, n = B.length, s = '', i;
      var mesa = B.map(function (p) { return [150 + (p[0] - 150) * 0.6, 90 + (p[1] - 90) * 0.6]; });
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        s += '<polygon points="' + [L.g(B[i][0], B[i][1]), L.g(B[j][0], B[j][1]), L.g(mesa[j][0], mesa[j][1]), L.g(mesa[i][0], mesa[i][1])].join(' ') + '" fill="#FFFFFF" opacity="' + (i % 2 ? '.16' : '.04') + '"/>';
        s += '<path d="M' + L.g(B[i][0], B[i][1]) + ' L' + L.g(mesa[i][0], mesa[i][1]) + '" stroke="#FFFFFF" stroke-opacity=".4" stroke-width=".8"/>';
      }
      s += '<polygon points="' + mesa.map(function (p) { return L.g(p[0], p[1]); }).join(' ') + '" fill="#8FE6FF" fill-opacity=".1" stroke="#FFFFFF" stroke-opacity=".5" stroke-width=".9"/>';
      return s;
    },
    'materia oscura pro': function (L, az) {
      var s = '', u, v, B = L.borde;
      for (u = -60; u <= 360; u += 30) s += '<path d="M' + L.g(u, -30) + ' L' + L.g(u, 210) + '" stroke="#A48BFF" stroke-opacity=".3" stroke-width=".8"/>';
      for (v = -20; v <= 205; v += 20) s += '<path d="M' + L.g(-70, v) + ' L' + L.g(370, v) + '" stroke="#A48BFF" stroke-opacity=".3" stroke-width=".8"/>';
      /* un aro de neón por dentro del borde */
      s += '<polygon points="' + B.map(function (p) { return L.g(150 + (p[0] - 150) * 0.955, 90 + (p[1] - 90) * 0.955); }).join(' ') + '" fill="none" stroke="#FF8AD8" stroke-opacity=".3" stroke-width="' + r1(3.4 * L.s) + '"/>' +
        '<polygon points="' + B.map(function (p) { return L.g(150 + (p[0] - 150) * 0.955, 90 + (p[1] - 90) * 0.955); }).join(' ') + '" fill="none" stroke="#FFC6EC" stroke-opacity=".95" stroke-width="' + r1(1 * L.s) + '"/>';
      return s;
    },
    /* motas de luz de los ocho mundos de antes, regadas por la cubierta */
    'misterio': function (L, az) {
      var s = '', luces = Object.keys(PALETA).filter(function (n) { return n !== 'misterio'; }).map(function (n) { return PALETA[n].luz; });
      for (var i = 0; i < 24; i++) {
        var q = L.P(30 + az() * 240, 20 + az() * 145, 0);
        s += '<circle cx="' + r1(q[0]) + '" cy="' + r1(q[1]) + '" r="' + r1((0.9 + az() * 1.1) * q[2]) + '" fill="' + luces[i % luces.length] + '" opacity=".6"/>';
      }
      return s;
    }
  };

  /* ---------- la isla: canto, panza y suelo ---------- */
  function isla(nivel, L) {
    var c = ISLA[nivel], az = semilla(nivel.length * 97 + 13), N = L.borde.length, s = L.s, j;
    var T = L.borde.map(function (p) { return L.P(p[0], p[1], 0); });
    var iL = 0, iR = 0, iF = 0, iB = 0;
    T.forEach(function (q, k) {
      if (q[0] < T[iL][0]) iL = k; if (q[0] > T[iR][0]) iR = k;
      if (q[1] > T[iF][1]) iF = k; if (q[1] < T[iB][1]) iB = k;
    });
    /* la cadena del frente: del punto más a la izquierda al más a la derecha,
       pasando por el lado de acá. Es la única pared que se ve desde arriba. */
    var cad = [], k = iL;
    for (;;) { cad.push(k); if (k === iR) break; k = (k + 1) % N; }
    var m = cad.length - 1;
    /* La panza NO es geometría de verdad: bien calculada, la cámara (que mira
       desde arriba) no la vería. Se dibuja en pantalla, tirando cada punto del
       canto hacia una quilla que cuelga bajo el frente; x cede despacio y la
       altura rápido, para que el costado caiga primero y luego se cierre. */
    var K = [(T[iL][0] + T[iR][0]) / 2 + (c.desvio || 0) * s, T[iF][1] + c.hondo * s];
    function hacia(q, t) { return [q[0] + (K[0] - q[0]) * Math.pow(t, 1.7), q[1] + (K[1] - q[1]) * Math.pow(t, 0.85)]; }
    var R0 = cad.map(function (i) { return T[i]; });
    var R1 = R0.map(function (q) { return [q[0], q[1] + c.alto * q[2]]; });
    var R2 = R1.map(function (q) { return hacia(q, c.q2 * (1 + c.mella * (az() - 0.5) * 2)); });
    var R3 = R1.map(function (q) { return hacia(q, Math.min(0.97, c.q3 * (1 + c.mella * (az() - 0.5) * 2))); });
    /* cuánta luz le da a la cara j: la cadena va de mirar a la izquierda (0)
       a mirar a la derecha (m), pasando por mirar de frente */
    function luz(jj) { var a = Math.PI * (jj + 0.5) / m; return 0.14 + 0.86 * Math.max(0, -0.75 * c.lado * Math.cos(a) + 0.66 * Math.sin(a)); }

    var gH = nuevoId('ih'), gT = nuevoId('it'), cl = nuevoId('ic'), gF = nuevoId('if'), gB = nuevoId('ib');
    var ancho = T[iR][0] - T[iL][0];
    var defs = rgrad(gH, '.5', '.5', '.5', [[0, c.halo, c.haloOp], [0.55, c.halo, c.haloOp * 0.3], [1, c.halo, 0]]) +
      '<linearGradient id="' + gT + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + r1(T[iB][1]) + '" x2="0" y2="' + r1(T[iF][1]) + '"><stop offset="0" stop-color="' + c.suelo[0] + '"/><stop offset="1" stop-color="' + c.suelo[1] + '"/></linearGradient>' +
      '<clipPath id="' + cl + '"><polygon points="' + T.map(pt).join(' ') + '"/></clipPath>' +
      rgrad(gF, '.5', '.5', '.5', [[0, '#7FE9FF', 0.95], [0.4, '#7FE9FF', 0.4], [1, '#7FE9FF', 0]]) +
      rgrad(gB, '.5', '.5', '.5', [[0, '#FFFFFF', 0.34], [1, '#FFFFFF', 0]]);

    /* el resplandor que la despega del fondo */
    var bajo = '<ellipse cx="' + r1(K[0]) + '" cy="' + r1(T[iF][1] - 4 * s) + '" rx="' + r1(ancho * 0.62) + '" ry="' + r1(ancho * 0.36) + '" fill="url(#' + gH + ')"/>';
    /* el contorno entero de la panza, en el tono hondo: es lo que asoma por
       las rendijas entre caras, así que se lee como arista */
    var fondoP = [].concat(R0, [R1[m], R2[m]], c.forma === 'gema' ? [] : [R3[m]], c.forma === 'placa' ? [] : [K], c.forma === 'gema' ? [] : [R3[0]], [R2[0], R1[0]]);
    bajo += '<polygon points="' + fondoP.map(pt).join(' ') + '" fill="' + c.roca[1] + '"/>';
    var t0 = '', t1 = '', t2 = '', t3 = '';
    for (j = 0; j < m; j++) {
      var b = luz(j), v1 = (az() - 0.5) * c.faceta, v2 = (az() - 0.5) * c.faceta, v3 = (az() - 0.5) * c.faceta;
      t0 += cara([R0[j], R0[j + 1], R1[j + 1], R1[j]], mezcla(c.canto[1], c.canto[0], b));
      if (c.forma === 'gema') {
        /* tallada: una cara clara y la siguiente honda, como un brillante */
        t1 += cara([R1[j], R1[j + 1], R2[j + 1], R2[j]], mezcla(c.roca[1], c.roca[0], b * 0.8 + (j % 2 ? 0.22 : -0.1) + v1));
        t2 += cara([R2[j], R2[j + 1], K], mezcla(c.roca[1], c.roca[0], b * 0.55 + (j % 2 ? -0.08 : 0.2) + v2));
      } else {
        t1 += cara([R1[j], R1[j + 1], R2[j + 1], R2[j]], mezcla(c.roca[1], c.roca[0], b * 0.92 + v1));
        t2 += cara([R2[j], R2[j + 1], R3[j + 1], R3[j]], mezcla(c.roca[1], c.roca[0], b * 0.6 + v2));
        if (c.forma !== 'placa') t3 += cara([R3[j], R3[j + 1], K], mezcla(c.roca[1], c.roca[0], b * 0.34 + v3));
      }
    }
    if (c.forma === 'placa') t3 = '<polygon points="' + R3.map(pt).join(' ') + '" fill="' + mezcla(c.roca[1], '#000000', 0.35) + '"/>';
    var G = '<g stroke-width=".7" stroke-linejoin="round">';   // lo comparten todas las caras: ver cara()
    bajo += G + t3 + t2 + t1 + '</g>';

    /* lo que cada mundo lleva en la panza */
    var det = '', d, i, q;
    if (nivel === 'hierro') {
      for (j = 2; j < m - 1; j += 3 + Math.floor(az() * 3)) {
        d = 'M' + pt(R1[j]) + ' L' + pt(R2[j]) + ' L' + pt(R3[j]);
        det += '<path d="' + d + '" fill="none" stroke="#FF5A14" stroke-opacity=".32" stroke-width="' + r1(3.2 * s) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="#FFC27A" stroke-width="' + r1(0.95 * s) + '" stroke-linecap="round" stroke-linejoin="round"/>';
        var gota = (5 + az() * 13) * s;
        det += '<path d="M' + pt(R3[j]) + ' v' + r1(gota) + '" stroke="#FF8A3C" stroke-width="' + r1(1 * s) + '" stroke-linecap="round"/>' +
          '<circle cx="' + r1(R3[j][0]) + '" cy="' + r1(R3[j][1] + gota + 2.2 * s) + '" r="' + r1(1.5 * s) + '" fill="#FFC27A"/>';
      }
    } else if (nivel === 'aluminio') {
      /* ventanas en la banda, una tira de luz bajo ella y tres toberas */
      for (j = 1; j < m - 1; j += 2) {
        var a1 = [R0[j][0] + (R0[j + 1][0] - R0[j][0]) * 0.18, R0[j][1] + (R1[j][1] - R0[j][1]) * 0.34], b1 = [R0[j][0] + (R0[j + 1][0] - R0[j][0]) * 0.82, R0[j + 1][1] + (R1[j + 1][1] - R0[j + 1][1]) * 0.34];
        var a2 = [a1[0], R0[j][1] + (R1[j][1] - R0[j][1]) * 0.68], b2 = [b1[0], R0[j + 1][1] + (R1[j + 1][1] - R0[j + 1][1]) * 0.68];
        det += '<polygon points="' + [a1, b1, b2, a2].map(pt).join(' ') + '" fill="#1F2A35"/>' +
          '<polygon points="' + [a1, [a1[0] + (b1[0] - a1[0]) * 0.45, a1[1] + (b1[1] - a1[1]) * 0.45], [a2[0] + (b2[0] - a2[0]) * 0.25, a2[1] + (b2[1] - a2[1]) * 0.25], a2].map(pt).join(' ') + '" fill="#9CCBFF" opacity=".85"/>';
      }
      det += '<path d="M' + R1.map(pt).join(' L') + '" fill="none" stroke="#9CCBFF" stroke-opacity=".35" stroke-width="' + r1(3.6 * s) + '"/>' +
        '<path d="M' + R1.map(pt).join(' L') + '" fill="none" stroke="#E6F3FF" stroke-width="' + r1(1.1 * s) + '"/>';
      [0.24, 0.5, 0.76].forEach(function (w) {
        var p = R3[Math.round(m * w)];
        det += '<ellipse cx="' + r1(p[0]) + '" cy="' + r1(p[1] + 15 * s) + '" rx="' + r1(11 * s) + '" ry="' + r1(22 * s) + '" fill="url(#' + gF + ')"/>' +
          '<ellipse cx="' + r1(p[0]) + '" cy="' + r1(p[1] + 1 * s) + '" rx="' + r1(9 * s) + '" ry="' + r1(3.2 * s) + '" fill="#1F2A35"/>' +
          '<ellipse cx="' + r1(p[0]) + '" cy="' + r1(p[1] + 1.6 * s) + '" rx="' + r1(6 * s) + '" ry="' + r1(1.9 * s) + '" fill="#DFF6FF"/>';
      });
    } else if (nivel === 'bronce' || nivel === 'oro') {
      /* las vetas de la arenisca: dos líneas que dan la vuelta a media altura */
      [0.35, 0.72].forEach(function (f) {
        det += '<path d="M' + R1.map(function (p, x) { return pt([p[0] + (R2[x][0] - p[0]) * f, p[1] + (R2[x][1] - p[1]) * f]); }).join(' L') + '" fill="none" stroke="' + c.roca[1] + '" stroke-opacity=".3" stroke-width="' + r1(1.1 * s) + '" stroke-linejoin="round"/>';
      });
      det += '<path d="M' + R2.map(function (p, x) { return pt([p[0] + (R3[x][0] - p[0]) * 0.5, p[1] + (R3[x][1] - p[1]) * 0.5]); }).join(' L') + '" fill="none" stroke="' + c.filo + '" stroke-opacity=".14" stroke-width="' + r1(1 * s) + '" stroke-linejoin="round"/>';
    } else if (nivel === 'platino') {
      /* carámbanos colgando del canto de nieve */
      for (j = 1; j < m; j++) {
        var lg = (3 + az() * 11) * s, an = (1 + az() * 1.1) * s;
        det += '<polygon points="' + [[R1[j][0] - an, R1[j][1] - 0.5], [R1[j][0] + an, R1[j][1] - 0.5], [R1[j][0], R1[j][1] + lg]].map(pt).join(' ') + '" fill="#FFFFFF" opacity=".92"/>';
      }
    } else if (nivel === 'diamante') {
      for (j = 0; j <= m; j++) det += '<path d="M' + pt(R1[j]) + ' L' + pt(R2[j]) + ' L' + pt(K) + '" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width=".7" stroke-linejoin="round"/>';
      det += '<path d="M' + R2.map(pt).join(' L') + '" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width=".7"/>' +
        '<path d="M' + R1.map(pt).join(' L') + '" fill="none" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="' + r1(1.1 * s) + '"/>';
    } else if (nivel === 'materia oscura pro') {
      for (j = 2; j < m - 1; j += 2 + Math.floor(az() * 3)) {
        d = 'M' + pt(R1[j]) + ' L' + pt(R2[j]) + ' L' + pt(R3[j]);
        det += '<path d="' + d + '" fill="none" stroke="#B48CFF" stroke-opacity=".3" stroke-width="' + r1(3 * s) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="' + (j % 3 ? '#E4DAFF' : '#FFB0E6') + '" stroke-opacity=".9" stroke-width="' + r1(0.8 * s) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      }
      det += '<path d="M' + R1.map(pt).join(' L') + '" fill="none" stroke="#FF8AD8" stroke-opacity=".35" stroke-width="' + r1(3.4 * s) + '"/>' +
        '<path d="M' + R1.map(pt).join(' L') + '" fill="none" stroke="#FFD3F1" stroke-width="' + r1(1 * s) + '"/>';
      /* escombros que orbitan a los lados */
      [[-0.06, 0.5, 9], [-0.02, 0.86, 5], [1.05, 0.42, 7], [1.01, 0.8, 11]].forEach(function (e) {
        var x = T[iL][0] + ancho * e[0], y = T[iL][1] + (K[1] - T[iL][1]) * e[1], z = e[2] * s;
        det += '<polygon points="' + [[x - z, y], [x - z * 0.2, y - z * 0.8], [x + z, y - z * 0.2], [x + z * 0.5, y + z * 0.7], [x - z * 0.5, y + z * 0.6]].map(pt).join(' ') + '" fill="#1A0F3E"/>' +
          '<polygon points="' + [[x - z, y], [x - z * 0.2, y - z * 0.8], [x + z, y - z * 0.2]].map(pt).join(' ') + '" fill="#4A34A8"/>';
      });
    }
    bajo += det + G + t0 + '</g>';

    var techo = '<polygon points="' + T.map(pt).join(' ') + '" fill="url(#' + gT + ')"/>' +
      '<g clip-path="url(#' + cl + ')">' + TEXTURA[nivel](L, semilla(nivel.length * 211 + 3), c) +
      /* un brillo ancho del lado de donde viene la luz: le da curva al suelo */
      '<ellipse cx="' + r1(T[iL][0] + ancho * (c.lado < 0 ? 0.3 : 0.7)) + '" cy="' + r1(T[iB][1] + (T[iF][1] - T[iB][1]) * 0.36) + '" rx="' + r1(ancho * 0.42) + '" ry="' + r1(ancho * 0.2) + '" fill="url(#' + gB + ')"/></g>';
    /* el filo: la luz que corre por el borde de acá, y un hilo por el de allá */
    techo += '<path d="M' + R0.map(pt).join(' L') + '" fill="none" stroke="' + c.filo + '" stroke-opacity=".85" stroke-width="' + r1(1.3 * s) + '" stroke-linejoin="round"/>' +
      '<polygon points="' + T.map(pt).join(' ') + '" fill="none" stroke="' + c.filo + '" stroke-opacity=".28" stroke-width=".8"/>';
    return { defs: defs, bajo: bajo, techo: techo, K: K, T: T, ancho: ancho, izq: T[iL], frente: T[iF], fondo: T[iB] };
  }

  /* ---------- la pista, ya sobre la isla ---------- */
  var FUENTE = '-apple-system,Segoe UI,Roboto,system-ui,sans-serif';
  /* el ancho de la calzada y de cada piano, en unidades de suelo: también los
     mide `sitios` para que nada de lo construido quede encima */
  var ANCHO_PISTA = 19, KERB_PISTA = 3.2;
  /* EL AZUL DEL ELIXIR, para lo que se dibuja dentro de un SVG (23-nov-2026).
     Son los mismos tokens --elixir-* de app/socio.html: dentro de un atributo
     de trazo no se puede escribir var(), y una prueba compara las dos tablas
     para que no se separen. */
  var ELIXIR = { hondo: '#0A2783', medio: '#1D5BE3', vivo: '#3A9BFF', claro: '#8FD8FF', luz: '#DDF7FF', noche: '#040817' };
  var MAX_LLAMAS = 7;
  /* Una llama de pie, en unidades de suelo: la lengua de afuera en el azul
     vivo, la de adentro en el claro y el corazón casi blanco. */
  var LLAMA = '<path d="M0,0.4 C-3.6,-1.6 -3.2,-6.2 -0.7,-11.4 C-0.2,-8.6 2.9,-7.4 3.3,-3.6 C3.6,-1.2 2.2,0.4 0,0.4 Z" fill="' + ELIXIR.vivo + '" fill-opacity=".9"/>' +
    '<path d="M0,0 C-2.2,-1.4 -2,-4.6 -0.4,-7.6 C0,-5.9 1.9,-5 2.1,-2.6 C2.2,-1 1.3,0 0,0 Z" fill="' + ELIXIR.claro + '"/>' +
    '<path d="M0,-0.5 C-1,-1.2 -0.9,-2.8 -0.1,-4.2 C0.1,-3.3 0.9,-2.8 0.9,-1.7 C0.9,-1 0.5,-0.5 0,-0.5 Z" fill="' + ELIXIR.luz + '"/>';
  /* El carrito: de lado, mirando a la derecha (el repaso lo voltea según para
     dónde vaya la pista), con las ruedas en el suelo (0,0) y su llama azul
     detrás. El amarillo es el del marcador: es el mismo socio, rodando. */
  var CARRITO = '<ellipse cx="0" cy="0.8" rx="11" ry="2.8" fill="#000" opacity=".42"/>' +
    '<path d="M-9.4,-4.6 C-13,-6.6 -15.4,-3.8 -19,-4.4 C-15.6,-2.6 -13.4,-0.9 -9.4,-2.2 Z" fill="' + ELIXIR.vivo + '"/>' +
    '<path d="M-9.4,-4.1 C-11.8,-5 -13,-3.6 -15,-3.8 C-13,-2.8 -11.8,-2 -9.4,-2.6 Z" fill="' + ELIXIR.luz + '"/>' +
    '<path d="M-9.4,-2 L-9.4,-6.2 Q-9.4,-8.2 -7.4,-8.2 L-2.4,-8.2 L0.8,-11.8 L6,-11.8 Q7.7,-11.8 8.2,-10.2 L9.6,-6.6 Q10.4,-6.2 10.4,-5 L10.4,-2 Z" fill="#F5C542" stroke="#0C0A0B" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<path d="M1.5,-10.8 L5.7,-10.8 L7.1,-7.4 L-0.9,-7.4 Z" fill="#0C0A0B" fill-opacity=".86"/>' +
    '<path d="M-9.4,-4.9 H10.4" stroke="#0C0A0B" stroke-opacity=".45" stroke-width=".9"/>' +
    '<circle cx="-5.2" cy="-1.7" r="2.7" fill="#0C0A0B" stroke="#FBF7F4" stroke-width=".8"/><circle cx="-5.2" cy="-1.7" r=".9" fill="#FBF7F4"/>' +
    '<circle cx="5.6" cy="-1.7" r="2.7" fill="#0C0A0B" stroke="#FBF7F4" stroke-width=".8"/><circle cx="5.6" cy="-1.7" r=".9" fill="#FBF7F4"/>' +
    '<circle cx="9.9" cy="-4.5" r=".95" fill="#FFF6D6"/>';
  function pista(nivel, L, o) {
    var P = PALETA[nivel], N = 160, ANCHO = ANCHO_PISTA, KERB = KERB_PISTA, s = L.s, i;
    var c = muestras(CIRCUITOS[nivel], N);
    var nor = c.map(function (p, x) {
      var a = c[(x - 1 + N) % N], b = c[(x + 1) % N], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.sqrt(tx * tx + ty * ty) || 1;
      return [-ty / l, tx / l];
    });
    function borde(off) { return c.map(function (p, x) { return L.P(p[0] + nor[x][0] * off, p[1] + nor[x][1] * off, 0); }); }
    var ext = borde(ANCHO / 2), int = borde(-ANCHO / 2), extK = borde(ANCHO / 2 + KERB), intK = borde(-ANCHO / 2 - KERB);
    var centro = c.map(function (p) { return L.P(p[0], p[1], 0); });
    function lazo(arr) { return 'M' + arr.map(pt).join(' L') + ' Z'; }
    function linea(arr) { return 'M' + arr.map(pt).join(' L'); }
    /* Cada trazo se escribe UNA vez, en <defs>, y lo de abajo lo reutiliza con
       <use>: la sombra, el canto, la calzada, sus bordes y el eje son los
       mismos cuatro dibujos pintados de otra manera. Repetirlos pesaba más
       del doble, y eso en un teléfono barato es tiempo. */
    var id = { losa: nuevoId('l'), calz: nuevoId('z'), eje: nuevoId('e'), pian: nuevoId('k'), hecho: nuevoId('r') };
    var defs = '<path id="' + id.losa + '" d="' + lazo(extK) + ' ' + lazo(intK) + '"/>' +
      '<path id="' + id.calz + '" d="' + lazo(ext) + ' ' + lazo(int) + '"/>' +
      '<path id="' + id.eje + '" d="' + lazo(centro) + '"/>' +
      '<path id="' + id.pian + '" d="' + lazo(borde(ANCHO / 2 + KERB / 2)) + ' ' + lazo(borde(-ANCHO / 2 - KERB / 2)) + '"/>';
    function usa(cual, atributos) { return '<use href="#' + cual + '" ' + atributos + '/>'; }
    var h = '';
    /* la losa: una sombra debajo y un canto, para que la pista tenga grosor */
    h += usa(id.losa, 'fill="#000" opacity=".4" fill-rule="evenodd" transform="translate(0 ' + r1(4.2 * s) + ')"');
    h += usa(id.losa, 'fill="' + mezcla(P.pista, '#000000', 0.45) + '" fill-rule="evenodd" transform="translate(0 ' + r1(1.6 * s) + ')"');
    /* los pianos: una franja de un color y, encima, la misma a rayas del otro */
    var op = o.velado ? ' opacity=".5"' : '', grueso = r1(KERB * s * 1.1), raya = r1(8 * s);
    h += usa(id.pian, 'fill="none" stroke="' + P.kerb[1] + '" stroke-width="' + grueso + '"' + op);
    h += usa(id.pian, 'fill="none" stroke="' + P.kerb[0] + '" stroke-width="' + grueso + '" stroke-dasharray="' + raya + ' ' + raya + '"' + op);
    h += usa(id.calz, 'fill="' + P.pista + '" fill-rule="evenodd"');
    /* el carril gastado: un tono más claro por el medio, que es por donde se rueda */
    h += usa(id.eje, 'fill="none" stroke="#FFFFFF" stroke-opacity=".07" stroke-width="' + r1(11 * s) + '" stroke-linejoin="round"');
    h += usa(id.calz, 'fill="none" stroke="' + P.borde + '" stroke-opacity=".8" stroke-width="' + r1(0.9 * s) + '"');
    h += usa(id.eje, 'fill="none" stroke="' + P.borde + '" stroke-opacity=".4" stroke-width="' + r1(0.8 * s) + '" stroke-dasharray="' + r1(4 * s) + ' ' + r1(5 * s) + '"');
    /* la línea de salida y meta, a cuadros */
    for (var a = 0; a < 6; a++) for (var b2 = 0; b2 < 2; b2++) {
      var mz = function (ii, tt) { return [ext[ii][0] + (int[ii][0] - ext[ii][0]) * tt, ext[ii][1] + (int[ii][1] - ext[ii][1]) * tt]; };
      h += '<polygon points="' + [mz(b2, a / 6), mz(b2, (a + 1) / 6), mz(b2 + 1, (a + 1) / 6), mz(b2 + 1, a / 6)].map(pt).join(' ') + '" fill="' + ((a + b2) % 2 ? '#0C0A0B' : '#FFFFFF') + '"/>';
    }
    /* LO RECORRIDO ES UNA ESTELA AZUL (23-nov-2026). Joan: «que se vea como una
       llamita azul por donde paso». Era el amarillo de lo construido; ahora es
       el azul del elixir —el mismo de la barra de la garantía, porque es la
       misma cosa: lo que lleva hecho— con el corazón casi blanco, como una
       llama. Sigue sin filtros: el resplandor son trazos anchos y tenues, que
       en un teléfono barato no obligan a repintar la isla mientras flota. El
       trazado va marcado (data-hecho) porque el repaso lo va alargando
       detrás del carrito (ver EL REPASO). */
    var hastaI = (o.f != null && o.f > 0) ? Math.max(2, Math.round(N * o.f)) : 0;
    if (hastaI) {
      defs += '<path data-hecho="1" id="' + id.hecho + '" d="' + linea(centro.slice(0, hastaI + 1)) + '"/>';
      var punta = 'fill="none" stroke-linecap="round" stroke-linejoin="round" ';
      h += '<g>' +
           usa(id.hecho, punta + 'stroke="' + ELIXIR.vivo + '" stroke-opacity=".16" stroke-width="' + r1(18 * s) + '"') +
           usa(id.hecho, punta + 'stroke="' + ELIXIR.vivo + '" stroke-opacity=".34" stroke-width="' + r1(9 * s) + '"') +
           usa(id.hecho, punta + 'stroke="' + ELIXIR.noche + '" stroke-opacity=".6" stroke-width="' + r1(5.2 * s) + '"') +
           usa(id.hecho, punta + 'stroke="' + ELIXIR.claro + '" stroke-width="' + r1(3.3 * s) + '"') +
           usa(id.hecho, punta + 'stroke="' + ELIXIR.luz + '" stroke-opacity=".9" stroke-width="' + r1(1.1 * s) + '"') + '</g>';
    }
    /* los pagos: una piedra por crédito pagado, con sello si fue en fecha. Cada
       una va en su grupo: el repaso las enciende una por una. */
    (o.piedras || []).forEach(function (pi) {
      var q = centro[Math.min(N - 1, Math.round(N * pi.f))], rx = 6.8 * q[2], ry = rx * 0.66;
      h += '<g class="pn-piedra">' +
        '<ellipse cx="' + r1(q[0]) + '" cy="' + r1(q[1] + 1.2 * q[2]) + '" rx="' + r1(rx) + '" ry="' + r1(ry) + '" fill="#000" opacity=".45"/>' +
        '<ellipse cx="' + r1(q[0]) + '" cy="' + r1(q[1]) + '" rx="' + r1(rx) + '" ry="' + r1(ry) + '" fill="' + (pi.sello ? '#F5C542' : '#0C0A0B') + '" stroke="' + (pi.sello ? '#0C0A0B' : '#F5C542') + '" stroke-width="' + r1(1.3 * s) + '"/>' +
        (pi.sello ? '<path d="M' + r1(q[0] - rx * 0.45) + ',' + r1(q[1]) + ' l' + r1(rx * 0.3) + ',' + r1(ry * 0.4) + ' l' + r1(rx * 0.55) + ',' + r1(-ry * 0.75) + '" fill="none" stroke="#0C0A0B" stroke-width="' + r1(1.3 * s) + '" stroke-linecap="round" stroke-linejoin="round"/>' : '') +
        '</g>';
    });
    /* EL CARRITO del repaso (23-nov-2026). Va en el suelo, antes de lo que está
       de pie: así lo de adelante lo tapa y él no tapa nada de atrás. Nace
       apagado (la hoja de estilos lo enciende solo mientras dura el repaso) y
       el repaso lo mueve cambiándole el transform, que es lo único que cambia. */
    if (o.carro) {
      h += '<g class="pn-carro" transform="translate(' + r1(centro[0][0]) + ' ' + r1(centro[0][1]) + ') scale(' + centro[0][2].toFixed(3) + ')">' + CARRITO + '</g>';
      /* y su nombre encima, en una placa aparte: el carrito se voltea según
         para dónde vaya, y un letrero volteado no se lee */
      if (o.nombre) {
        var cn = String(o.nombre), cw = Math.max(30, cn.length * 6.3 + 16);
        h += '<g class="pn-carro-n" transform="translate(' + r1(centro[0][0]) + ' ' + r1(centro[0][1] - 30) + ')">' +
          '<path d="M-3.4,-1 L0,3.6 L3.4,-1 Z" fill="#0C0A0B"/>' +
          '<rect x="' + r1(-cw / 2) + '" y="-17" width="' + r1(cw) + '" height="17" rx="8.5" fill="#0C0A0B" fill-opacity=".92" stroke="#F5C542" stroke-width="1.1"/>' +
          '<text x="0" y="-5.1" text-anchor="middle" font-family="' + FUENTE + '" font-size="10.6" font-weight="800" letter-spacing=".2" fill="#FBF7F4">' + esc(cn) + '</text></g>';
      }
    }

    var cosas = [];
    /* LAS LLAMITAS: de trecho en trecho sobre lo recorrido, de pie como todo lo
       demás (lo de adelante las tapa). Pocas, a propósito: son siete como
       mucho, y cada una late con su propia animación de opacidad y de alto. */
    if (hastaI) {
      var cada = Math.max(9, Math.ceil(hastaI / MAX_LLAMAS));
      for (var ll = Math.round(cada / 2), kl = 0; ll < hastaI - 2 && kl < MAX_LLAMAS; ll += cada, kl++) {
        var ql = centro[ll];
        cosas.push({ v: c[ll][1] + 0.02, svg: '<g class="pn-llama-s" data-i="' + ll + '" transform="translate(' + r1(ql[0]) + ' ' + r1(ql[1]) + ') scale(' + (ql[2] * 2.1).toFixed(3) + ')">' +
          '<g class="pn-llama' + (kl % 3 ? ' pn-l' + (kl % 3) : '') + '">' + LLAMA + '</g></g>' });
      }
    }
    /* la meta: un pórtico de pie sobre la salida, con su letrero */
    var uA = c[0][0] + nor[0][0] * (ANCHO / 2 + KERB + 1), vA = c[0][1] + nor[0][1] * (ANCHO / 2 + KERB + 1);
    var uB = c[0][0] - nor[0][0] * (ANCHO / 2 + KERB + 1), vB = c[0][1] - nor[0][1] * (ANCHO / 2 + KERB + 1);
    var pa = L.P(uA, vA, 0), pb = L.P(uB, vB, 0), ta = L.P(uA, vA, 26), tb = L.P(uB, vB, 26), ba = L.P(uA, vA, 19.5), bb = L.P(uB, vB, 19.5);
    var g = '<path d="M' + pt(pa) + ' L' + pt(ta) + ' M' + pt(pb) + ' L' + pt(tb) + '" stroke="#E8E2DC" stroke-width="' + r1(1.8 * s) + '" stroke-linecap="round"/>' +
      '<polygon points="' + [ta, tb, bb, ba].map(pt).join(' ') + '" fill="#0C0A0B" stroke="' + P.borde + '" stroke-opacity=".85" stroke-width="' + r1(0.8 * s) + '"/>';
    for (i = 0; i < 6; i++) {
      var f0 = i / 6, f1 = (i + 1) / 6, yy = i % 2 ? 0.5 : 0;
      var e1 = [ta[0] + (tb[0] - ta[0]) * f0, ta[1] + (ba[1] - ta[1]) * yy + (tb[1] - ta[1]) * f0], e2 = [ta[0] + (tb[0] - ta[0]) * f1, ta[1] + (ba[1] - ta[1]) * yy + (tb[1] - ta[1]) * f1];
      var alto = (ba[1] - ta[1]) * 0.5;
      g += '<polygon points="' + [e1, e2, [e2[0], e2[1] + alto], [e1[0], e1[1] + alto]].map(pt).join(' ') + '" fill="#FFFFFF" opacity=".9"/>';
    }
    if (o.meta) {
      var mx = (ta[0] + tb[0]) / 2, my = Math.min(ta[1], tb[1]) - 5 * s, tw = o.meta.length * 5 + 16;
      g += '<path d="M' + r1(mx) + ',' + r1(my + 3) + ' v' + r1(4 * s) + '" stroke="#FBF7F4" stroke-opacity=".5" stroke-width="1"/>' +
        '<rect x="' + r1(mx - tw / 2) + '" y="' + r1(my - 13) + '" width="' + r1(tw) + '" height="16" rx="8" fill="#0C0A0B" fill-opacity=".88" stroke="#FBF7F4" stroke-opacity=".4"/>' +
        '<text x="' + r1(mx) + '" y="' + r1(my - 1.9) + '" text-anchor="middle" font-family="' + FUENTE + '" font-size="8.6" font-weight="800" letter-spacing=".8" fill="#FBF7F4">' + esc(o.meta.toUpperCase()) + '</text>';
    }
    cosas.push({ v: c[0][1], svg: g });
    /* el socio: un pin de pie, con su sombra y un pulso en el suelo */
    if (o.f != null && !o.sinMarcador) {
      var im = Math.min(N - 1, Math.round(N * o.f)), q0 = centro[im], rr = (o.personaje ? 15 : 12.5) * q0[2], cab = L.P(c[im][0], c[im][1], o.personaje ? 33 : 30);
      /* EL FARO de «aquí estás» (boceto 14-A, 18-nov): una columna de luz que
         sube del marcador, como en el mapa de un juego. Va detrás del pin. */
      var idF = nuevoId('fa'), idB = nuevoId('fb'), tope = L.P(c[im][0], c[im][1], 120), bw = rr * 0.9;
      defs += '<linearGradient id="' + idF + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFE7A3" stop-opacity=".9"/>' +
        '<stop offset=".35" stop-color="#F5C542" stop-opacity=".4"/><stop offset="1" stop-color="#F5C542" stop-opacity="0"/></linearGradient>' +
        rgrad(idB, '.5', '.5', '.5', [[0, '#FFE7A3', 0.85], [1, '#F5C542', 0]]);
      var faro = '<ellipse cx="' + r1(q0[0]) + '" cy="' + r1(q0[1]) + '" rx="' + r1(rr * 2.4) + '" ry="' + r1(rr) + '" fill="url(#' + idB + ')"/>' +
        '<rect x="' + r1(q0[0] - bw * 1.6) + '" y="' + r1(tope[1]) + '" width="' + r1(bw * 3.2) + '" height="' + r1(Math.max(0, q0[1] - tope[1])) + '" fill="url(#' + idF + ')" opacity=".5"/>' +
        '<rect x="' + r1(q0[0] - bw / 2) + '" y="' + r1(tope[1]) + '" width="' + r1(bw) + '" height="' + r1(Math.max(0, q0[1] - tope[1])) + '" fill="url(#' + idF + ')"/>';
      /* SU NOMBRE, NO UNA LETRA (23-nov-2026). Joan: «que no sea una letra si no
         el nombre de la persona para que sea claro». Una placa encima del pin,
         con la letra de los letreros de la pista. Va a un tamaño fijo, como el
         letrero de la meta: achicada con la distancia no se leería. No se sale
         del dibujo por los lados (o._W es el ancho del lienzo, que pone
         `mundo`). Dentro del pin va su personaje si lo escogió y, si no, una
         figura: la inicial se va. Quien llame sin `nombre` (y con `letra`)
         sigue viendo la inicial. */
      var placa = '';
      if (o.nombre) {
        var nom = String(o.nombre), pw = Math.max(30, nom.length * 6.3 + 16), px = cab[0], py = cab[1] - rr - 8;
        if (o._W) px = Math.max(pw / 2 + 4, Math.min(o._W - pw / 2 - 4, px));
        placa = '<path d="M' + r1(cab[0] - 3.4) + ',' + r1(py - 1) + ' L' + r1(cab[0]) + ',' + r1(py + 3.6) + ' L' + r1(cab[0] + 3.4) + ',' + r1(py - 1) + ' Z" fill="#0C0A0B"/>' +
          '<rect x="' + r1(px - pw / 2) + '" y="' + r1(py - 17) + '" width="' + r1(pw) + '" height="17" rx="8.5" fill="#0C0A0B" fill-opacity=".92" stroke="#F5C542" stroke-width="1.1"/>' +
          '<text x="' + r1(px) + '" y="' + r1(py - 5.1) + '" text-anchor="middle" font-family="' + FUENTE + '" font-size="10.6" font-weight="800" letter-spacing=".2" fill="#FBF7F4">' + esc(nom) + '</text>';
      }
      var figura = '<circle cx="' + r1(cab[0]) + '" cy="' + r1(cab[1] - rr * 0.26) + '" r="' + r1(rr * 0.3) + '" fill="#0C0A0B"/>' +
        '<path d="M' + r1(cab[0] - rr * 0.56) + ',' + r1(cab[1] + rr * 0.62) + ' a' + r1(rr * 0.56) + ',' + r1(rr * 0.52) + ' 0 0 1 ' + r1(rr * 1.12) + ',0 Z" fill="#0C0A0B"/>';
      cosas.push({ v: c[im][1] - 0.01, svg: '<g>' + faro +
        '<ellipse cx="' + r1(q0[0]) + '" cy="' + r1(q0[1]) + '" rx="' + r1(rr * 0.95) + '" ry="' + r1(rr * 0.4) + '" fill="#000" opacity=".5"/>' +
        '<ellipse class="pn-pulso" cx="' + r1(q0[0]) + '" cy="' + r1(q0[1]) + '" rx="' + r1(rr * 1.5) + '" ry="' + r1(rr * 0.62) + '" fill="none" stroke="#F5C542" stroke-width="' + r1(1.5 * s) + '"/>' +
        '<path d="M' + pt(q0) + ' L' + r1(cab[0]) + ',' + r1(cab[1] + rr) + '" stroke="#0C0A0B" stroke-opacity=".55" stroke-width="' + r1(4.4 * s) + '" stroke-linecap="round"/>' +
        '<path d="M' + pt(q0) + ' L' + r1(cab[0]) + ',' + r1(cab[1] + rr) + '" stroke="#F5C542" stroke-width="' + r1(2.4 * s) + '" stroke-linecap="round"/>' +
        '<circle cx="' + r1(cab[0]) + '" cy="' + r1(cab[1]) + '" r="' + r1(rr * 1.5) + '" fill="#F5C542" opacity=".2"/>' +
        '<circle cx="' + r1(cab[0]) + '" cy="' + r1(cab[1]) + '" r="' + r1(rr) + '" fill="#F5C542" stroke="#0C0A0B" stroke-width="' + r1(1.9 * s) + '"/>' +
        '<path d="M' + r1(cab[0] - rr * 0.62) + ',' + r1(cab[1] - rr * 0.35) + ' A' + r1(rr * 0.72) + ',' + r1(rr * 0.72) + ' 0 0 1 ' + r1(cab[0] + rr * 0.1) + ',' + r1(cab[1] - rr * 0.72) + '" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="' + r1(1.2 * s) + '" stroke-linecap="round"/>' +
        (o.personaje
          /* el personaje que escogió (moto, bici…), en vez de la inicial: un
             ícono de 24 × 24 de trazo, que le pasa app/misiones.js */
          ? '<g transform="translate(' + r1(cab[0] - rr * 0.78) + ' ' + r1(cab[1] - rr * 0.78) + ') scale(' + (rr * 1.56 / 24).toFixed(3) + ')" style="color:#0C0A0B" fill="none" stroke="#0C0A0B" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + o.personaje + '</g>'
          : o.nombre ? figura
          : '<text x="' + r1(cab[0]) + '" y="' + r1(cab[1] + 0.5) + '" text-anchor="middle" dominant-baseline="central" font-family="' + FUENTE + '" font-size="' + r1(rr * 1.08) + '" font-weight="800" fill="#0C0A0B">' + esc(o.letra || '') + '</text>') +
        placa + '</g>' });
    }
    return { defs: defs, base: h, cosas: cosas };
  }

  /* ---------- lo que va de pie: el monumento y lo del fondo ----------
     Cada dibujo se escribe en unidades de suelo alrededor de (0,0), con la
     altura hacia arriba (y negativa), y `dePie` lo planta y lo encoge según
     lo lejos que esté. */
  function dePie(L, u, v, svg, agranda) {
    var q = L.P(u, v, 0);
    return { v: v, svg: '<g transform="translate(' + r1(q[0]) + ' ' + r1(q[1]) + ') scale(' + (q[2] * (agranda || 1)).toFixed(3) + ')">' + svg + '</g>' };
  }
  function sombra(rx) { return '<ellipse cx="0" cy="0" rx="' + (rx || 15) + '" ry="' + r1((rx || 15) * 0.34) + '" fill="#000" opacity=".4"/>'; }
  /* una aguja de cristal o de hielo: prisma con punta, ladeado */
  function aguja(x, w, h, ang, t) {
    var m = w / 2, i2 = m * 0.42, sh = h - w * 0.95, shs = sh - w * 0.12;
    function p(a) { return a.map(function (z) { return r1(z[0]) + ',' + r1(z[1]); }).join(' '); }
    return '<g transform="translate(' + x + ' 0) rotate(' + ang + ')">' +
      '<polygon points="' + p([[-m, 0], [-m, -shs], [-i2, -sh], [-i2, 0]]) + '" fill="' + t[0] + '"/>' +
      '<polygon points="' + p([[-i2, 0], [-i2, -sh], [i2, -sh], [i2, 0]]) + '" fill="' + t[1] + '"/>' +
      '<polygon points="' + p([[i2, 0], [i2, -sh], [m, -shs], [m, 0]]) + '" fill="' + t[2] + '"/>' +
      '<polygon points="' + p([[-m, -shs], [0, -h], [-i2, -sh]]) + '" fill="' + t[1] + '"/>' +
      '<polygon points="' + p([[-i2, -sh], [0, -h], [i2, -sh]]) + '" fill="' + t[2] + '"/>' +
      '<polygon points="' + p([[i2, -sh], [0, -h], [m, -shs]]) + '" fill="' + t[3] + '"/>' +
      '<path d="M' + r1(-i2) + ',0 V' + r1(-sh) + ' L0,' + r1(-h) + '" stroke="#FFFFFF" stroke-opacity=".6" stroke-width=".5" fill="none"/></g>';
  }
  function estrella(x, y, z) { return '<path d="M' + x + ',' + (y - z) + ' L' + (x + z * 0.22) + ',' + (y - z * 0.22) + ' L' + (x + z) + ',' + y + ' L' + (x + z * 0.22) + ',' + (y + z * 0.22) + ' L' + x + ',' + (y + z) + ' L' + (x - z * 0.22) + ',' + (y + z * 0.22) + ' L' + (x - z) + ',' + y + ' L' + (x - z * 0.22) + ',' + (y - z * 0.22) + ' Z" fill="#FFFFFF"/>'; }

  /* El monumento de cada mundo es el emblema de su medalla, hecho cosa. */
  var MONUMENTO = {
    'hierro': function (id) {
      return sombra(17) + '<circle cx="1" cy="-16" r="27" fill="url(#' + id.halo + ')"/>' +
        '<path d="M-13,0 V-8 H11 V0 Z" fill="#2A1D18"/><path d="M-13,-8 L-9,-11.5 H15 L11,-8 Z" fill="#7A5A4A"/><path d="M11,0 L15,-3.5 V-11.5 L11,-8 Z" fill="#160E0B"/>' +
        '<g transform="translate(-25 -43) scale(.5)"><path d="M22 40 H66 L82 35 C80 44 73 48 66 48 H61 V56 H67 V64 H33 V56 H39 V48 H30 C25 48 22 45 22 40 Z" fill="url(#' + id.metal + ')"/>' +
        '<path d="M23 40.8 H66 L81 36" fill="none" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="1.8"/></g>' +
        '<rect x="-8" y="-25.8" width="13" height="2.8" rx="1" fill="#FFD9A0"/><rect x="-8" y="-25.8" width="13" height="2.8" rx="1" fill="#FF6A1F" opacity=".55"/>' +
        '<circle cx="-12" cy="-30" r=".8" fill="#FFC27A"/><circle cx="8" cy="-33" r=".7" fill="#FFC27A"/><circle cx="-3" cy="-37" r=".6" fill="#FFC27A"/><circle cx="12" cy="-27" r=".6" fill="#FFC27A"/>';
    },
    'aluminio': function () {
      return sombra(13) + '<ellipse cx="0" cy="0" rx="5.5" ry="1.9" fill="#8FA0B2"/><ellipse cx="0" cy="-.7" rx="5.5" ry="1.9" fill="#E6ECF2"/>' +
        '<path d="M0,-.7 V-23" stroke="#7F90A3" stroke-width="1.8"/><path d="M-.5,-.7 V-23" stroke="#FFFFFF" stroke-width=".7"/>' +
        '<g transform="translate(-27 -62) scale(.54) rotate(-7 51 52)">' +
        '<path d="M20 53 L50 58 L46 68 Z" fill="#7F90A3"/><path d="M20 53 L82 28 L50 58 Z" fill="#FFFFFF"/><path d="M82 28 L62 76 L50 58 Z" fill="#B4C0CD"/>' +
        '<path d="M50 58 L82 28" stroke="#5E6C7A" stroke-width="1.4" fill="none"/><path d="M20 53 L82 28" stroke="#FFFFFF" stroke-width="1.2" fill="none"/></g>';
    },
    'bronce': function () {
      var col = '', xs = [-12.5, -5.5, 2.5, 9.5];
      xs.forEach(function (x) { col += '<rect x="' + x + '" y="-23" width="3" height="15.5" fill="#B3743E"/><rect x="' + (x + 1.3) + '" y="-23" width="1.7" height="15.5" fill="#F8D4A2"/><rect x="' + (x - 0.6) + '" y="-23.6" width="4.2" height="1.3" fill="#F8D4A2"/>'; });
      return sombra(21) +
        '<path d="M-19,0 H19 V-3 H-19 Z" fill="#8A5426"/><path d="M-19,-3 H19 L17,-5 H-17 Z" fill="#F8D4A2"/><path d="M-17,-5 H17 V-7.5 H-17 Z" fill="#A66A36"/><path d="M-17,-7.5 H17 L15.5,-8.6 H-15.5 Z" fill="#F0C08A"/>' +
        '<rect x="-13" y="-23" width="26" height="15" fill="#3F230D"/><path d="M-2.4,-8.6 V-14 A2.4,2.4 0 0 1 2.4,-14 V-8.6 Z" fill="#FFB55C"/><path d="M-1.2,-8.6 V-13 A1.2,1.6 0 0 1 1.2,-13 V-8.6 Z" fill="#FFF3C9"/>' + col +
        '<path d="M-16,-23.6 H16 V-26.6 H-16 Z" fill="#F0C08A"/><path d="M-16,-25 H16" stroke="#A66A36" stroke-width=".6"/>' +
        '<path d="M-17.5,-26.6 L0,-35 L17.5,-26.6 Z" fill="#E2A86F"/><path d="M-12.5,-27.4 L0,-33.4 L12.5,-27.4 Z" fill="#9A6234"/><circle cx="0" cy="-29.6" r="1.5" fill="#6FB3A2"/>' +
        '<path d="M-17.5,-26.6 L0,-35 L17.5,-26.6" fill="none" stroke="#FFE6C0" stroke-width=".7"/>';
    },
    'plata': function (id) {
      return sombra(12) + '<circle cx="0" cy="-25" r="24" fill="url(#' + id.halo + ')"/>' +
        '<path d="M-6.5,0 L-4.5,-12 H4.5 L6.5,0 Z" fill="#59616E"/><path d="M0,0 V-12 H4.5 L6.5,0 Z" fill="#C6CDD6"/><path d="M-5.2,-12 H5.2 L4,-13.6 H-4 Z" fill="#F4F7FB"/>' +
        '<g transform="translate(-20.6 -47) scale(.44)"><path d="M60 23 A28 28 0 1 0 60 77 A22 22 0 1 1 60 23 Z" fill="url(#' + id.metal + ')"/>' +
        '<path d="M60 23 A28 28 0 0 0 33 44" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/></g>' +
        estrella(9, -34, 2.6) + estrella(13, -23, 1.6);
    },
    'oro': function (id) {
      var ray = '';
      for (var i = 0; i < 12; i++) { var a = i / 12 * 6.2832; ray += 'M' + r1(Math.cos(a) * 8.6) + ',' + r1(-39 + Math.sin(a) * 8.6) + ' L' + r1(Math.cos(a) * (i % 2 ? 11.4 : 13.4)) + ',' + r1(-39 + Math.sin(a) * (i % 2 ? 11.4 : 13.4)); }
      return sombra(12) + '<circle cx="0" cy="-36" r="27" fill="url(#' + id.halo + ')"/>' +
        '<path d="M-8,0 H8 V-3 H-8 Z" fill="#9A6A10"/><path d="M-8,-3 H8 L6.5,-4.4 H-6.5 Z" fill="#FFF4C8"/>' +
        '<path d="M-4.6,-4.4 L-2.6,-28 L0,-32 L0,-4.4 Z" fill="#FFF4C8"/><path d="M4.6,-4.4 L2.6,-28 L0,-32 L0,-4.4 Z" fill="#B8811C"/>' +
        '<path d="' + ray + '" stroke="#FFF3C9" stroke-width="1.3" stroke-linecap="round"/>' +
        '<circle cx="0" cy="-39" r="6.6" fill="#FFFBEA"/><circle cx="0" cy="-39" r="6.6" fill="none" stroke="#F7D271" stroke-width="1.1"/><circle cx="-1.6" cy="-40.6" r="2.4" fill="#FFFFFF"/>';
    },
    'platino': function (id) {
      var t = ['#6FB7CB', '#C3EAF3', '#FFFFFF', '#FFFFFF'];
      return sombra(15) + '<circle cx="0" cy="-18" r="26" fill="url(#' + id.halo + ')"/>' +
        aguja(-8, 7.5, 24, -17, t) + aguja(8.5, 7, 20, 15, t) + aguja(0, 9.5, 37, -3, t) + aguja(-3, 5, 13, 24, t) +
        '<ellipse cx="0" cy="0" rx="12" ry="3.2" fill="#FFFFFF"/>' + estrella(2, -40, 2.2);
    },
    'diamante': function (id) {
      return sombra(11) + '<circle cx="0" cy="-25" r="27" fill="url(#' + id.halo + ')"/>' +
        '<path d="M-7,0 L-5,-6 L5,-6 L7,0 Z" fill="#0E3348"/><path d="M-5,-6 L5,-6 L3.4,-7.6 L-3.4,-7.6 Z" fill="#2E7FA6"/>' +
        '<path d="M-7,-38 H7 L13,-31 H-13 Z" fill="#E4FAFF"/><path d="M-7,-38 L-13,-31 L-4.5,-31 Z" fill="#93D6F0"/><path d="M7,-38 L13,-31 L4.5,-31 Z" fill="#FFFFFF"/>' +
        '<path d="M-13,-31 L0,-12.5 L-4.5,-31 Z" fill="#3F93B8"/><path d="M-4.5,-31 L0,-12.5 L4.5,-31 Z" fill="#B9ECFB"/><path d="M4.5,-31 L0,-12.5 L13,-31 Z" fill="#5FB7DA"/>' +
        '<path d="M-7,-38 H7 L13,-31 L0,-12.5 L-13,-31 Z M-13,-31 H13 M-7,-38 L-4.5,-31 L0,-12.5 L4.5,-31 L7,-38" fill="none" stroke="#FFFFFF" stroke-opacity=".8" stroke-width=".6" stroke-linejoin="round"/>' +
        estrella(-12, -40, 3) + estrella(14, -24, 2);
    },
    'materia oscura pro': function (id) {
      return sombra(12) + '<circle cx="0" cy="-25" r="30" fill="url(#' + id.halo + ')"/>' +
        '<g transform="rotate(-16 0 -25)"><path d="M-19,-25 A19,5.6 0 0 1 19,-25" fill="none" stroke="#FF8AD8" stroke-opacity=".75" stroke-width="2.4"/>' +
        '<path d="M-25,-25 A25,7.4 0 0 1 25,-25" fill="none" stroke="#A48BFF" stroke-opacity=".5" stroke-width="1"/></g>' +
        '<circle cx="0" cy="-25" r="12" fill="none" stroke="#B48CFF" stroke-opacity=".4" stroke-width="2.4"/>' +
        '<circle cx="0" cy="-25" r="10" fill="#05020C"/><circle cx="0" cy="-25" r="10" fill="none" stroke="#E4DAFF" stroke-width=".9"/>' +
        '<g transform="rotate(-16 0 -25)"><path d="M-19,-25 A19,5.6 0 0 0 19,-25" fill="none" stroke="#FFD3F1" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M-25,-25 A25,7.4 0 0 0 25,-25" fill="none" stroke="#DCD0FF" stroke-opacity=".8" stroke-width="1" stroke-linecap="round"/></g>' +
        estrella(-15, -39, 1.8) + estrella(16, -12, 1.5);
    },
    /* 18-nov: una corona con una gema del color de cada mundo de antes (era un «?») */
    'misterio': function () {
      var s = sombra(20) + '<circle cx="0" cy="-26" r="30" fill="#FFE7C2" opacity=".2"/>' +
        /* del metal del mundo Oro (METAL.oro), no del amarillo de la página */
        '<path d="M-19,-5 L-23,-34 L-11,-21 L0,-42 L11,-21 L23,-34 L19,-5 Z" fill="#F8D677" stroke="#FFF6D6" stroke-width="1.1"/>' +
        '<path d="M-19,-5 L-23,-34 L-11,-21 L0,-42 L0,-5 Z" fill="#FFF6D6" opacity=".45"/>' +
        '<rect x="-20" y="-10" width="40" height="7" rx="2" fill="#A86E14"/>';
      Object.keys(PALETA).filter(function (n) { return n !== 'misterio'; }).forEach(function (n, i) {
        s += '<circle cx="' + r1(-16.6 + i * 4.75) + '" cy="-6.5" r="1.9" fill="' + PALETA[n].luz + '" stroke="#FFFFFF" stroke-width=".5"/>';
      });
      return s + estrella(0, -44, 2.6) + estrella(-23, -36, 1.9) + estrella(23, -36, 1.9);
    }
  };

  /* Lo del fondo de la isla: poca cosa, lejos, que le rompe el borde contra
     el cielo. [u, v, dibujo] */
  function chimenea(h) {
    return '<path d="M-4.2,0 L-3,-' + h + ' H3 L4.2,0 Z" fill="#150E0B"/><path d="M-4.2,0 L-3,-' + h + ' H-.6 L-1,0 Z" fill="#5C4236"/>' +
      '<ellipse cx="0" cy="-' + h + '" rx="3" ry="1" fill="#FF9A4A"/>' +
      '<circle cx="1.5" cy="-' + (h + 5) + '" r="3.2" fill="#2A1C17" opacity=".7"/><circle cx="4" cy="-' + (h + 11) + '" r="4.6" fill="#2A1C17" opacity=".5"/><circle cx="8" cy="-' + (h + 19) + '" r="6" fill="#2A1C17" opacity=".3"/>';
  }
  function pino(h) { var w = h * 0.36; return '<path d="M0,-' + h + ' L' + r1(w * 0.62) + ',-' + r1(h * 0.5) + ' H' + r1(w * 0.3) + ' L' + r1(w) + ',0 H-' + r1(w) + ' L-' + r1(w * 0.3) + ',-' + r1(h * 0.5) + ' H-' + r1(w * 0.62) + ' Z" fill="#111827"/><path d="M0,-' + h + ' L' + r1(w * 0.62) + ',-' + r1(h * 0.5) + ' H' + r1(w * 0.3) + ' L' + r1(w) + ',0 H0 Z" fill="#33405C"/>'; }
  function palma(tr, ho) {
    var f = '';
    [[-11, -3], [-8, -9], [0, -12], [8, -9], [11, -3]].forEach(function (e) { f += '<path d="M1.5,-17 Q' + (1.5 + e[0] * 0.5) + ',' + (-17 + e[1] * 1.1 - 2) + ' ' + (1.5 + e[0]) + ',' + (-17 + e[1] * 0.2 + 4) + '" fill="none" stroke="' + ho + '" stroke-width="1.7" stroke-linecap="round"/>'; });
    return '<path d="M0,0 C1.4,-6 -1,-11 1.5,-17" stroke="' + tr + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' + f;
  }
  var HONDO = ['#0E3348', '#1C5674', '#2E7FA6', '#7CCDEB'], CLARO = ['#2E7FA6', '#5FB7DA', '#A6E3F7', '#EAFBFF'];
  var ADORNOS = {
    'hierro': [[36, 171, chimenea(23)], [52, 175, chimenea(15)],
      /* la fragua: una casa baja con la boca del horno encendida */
      [262, 171, '<path d="M-11,0 V-9 L0,-16 L11,-9 V0 Z" fill="#150E0B"/><path d="M-11,0 V-9 L0,-16 V0 Z" fill="#4A352C"/><path d="M-3.2,0 V-5.5 A3.2,3.2 0 0 1 3.2,-5.5 V0 Z" fill="#FF9A4A"/><path d="M-1.6,0 V-4.6 A1.6,2 0 0 1 1.6,-4.6 V0 Z" fill="#FFE0A8"/>']],
    'aluminio': [
      [262, 171, '<path d="M-2.2,0 L-1.5,-18 H1.5 L2.2,0 Z" fill="#A9B5C1"/><path d="M-2.2,0 L-1.5,-18 H0 V0 Z" fill="#FFFFFF"/><path d="M-6,-18 L-5,-24.5 H5 L6,-18 Z" fill="#36414C"/><path d="M-5.2,-19 L-4.5,-23.5 H4.5 L5.2,-19 Z" fill="#9CCBFF"/><path d="M-1.4,-19 L-1.2,-23.5 M2,-19 L1.8,-23.5" stroke="#36414C" stroke-width=".6"/><path d="M-5.6,-24.5 H5.6 L4,-26.2 H-4 Z" fill="#FFFFFF"/><path d="M0,-26.2 V-32" stroke="#FFFFFF" stroke-width=".8"/><circle cx="0" cy="-32.6" r="1.3" fill="#9CCBFF"/>'],
      [38, 171, '<path d="M0,0 V-18" stroke="#FFFFFF" stroke-width="1"/><path d="M0,-18 L10,-16.4 V-13.6 L0,-13 Z" fill="#FFFFFF"/><path d="M3.3,-17.5 L6.6,-17 V-13.4 L3.3,-13.2 Z" fill="#6E9BD6"/>'],
      [54, 175, '<path d="M-7,0 V-5 A7,5 0 0 1 7,-5 V0 Z" fill="#8FA0B2"/><path d="M-7,0 V-5 A7,5 0 0 1 0,-10 V0 Z" fill="#F4F7FA"/><path d="M-2.4,0 V-4 H2.4 V0 Z" fill="#36414C"/>']],
    'bronce': [
      [32, 170, '<rect x="-1.6" y="-17" width="3.2" height="17" fill="#B3743E"/><rect x="0" y="-17" width="1.6" height="17" fill="#F8D4A2"/><rect x="-2.4" y="-18.3" width="4.8" height="1.5" fill="#F8D4A2"/>'],
      [43, 173, '<rect x="-1.6" y="-11" width="3.2" height="11" fill="#B3743E"/><rect x="0" y="-11" width="1.6" height="11" fill="#F8D4A2"/><path d="M-2.2,-11 L1.8,-12.6 L2.2,-11 Z" fill="#F8D4A2"/>'],
      [54, 175, '<rect x="-1.6" y="-6" width="3.2" height="6" fill="#B3743E"/><rect x="0" y="-6" width="1.6" height="6" fill="#F8D4A2"/>'],
      [264, 171, palma('#5E3A1A', '#3F7566')], [250, 175, '<g transform="scale(.7)">' + palma('#5E3A1A', '#4E8A78') + '</g>']],
    'plata': [[34, 171, pino(21)], [48, 175, pino(14)], [266, 171, pino(19)], [252, 175, pino(12)]],
    'oro': [
      [38, 171, '<path d="M-13,0 L0,-12 L5,0 Z" fill="#FFF4C8"/><path d="M5,0 L0,-12 L13,0 Z" fill="#B8811C"/>'],
      [56, 175, '<path d="M-9,0 L0,-8 L3.4,0 Z" fill="#FFF4C8"/><path d="M3.4,0 L0,-8 L9,0 Z" fill="#B8811C"/>'],
      [264, 171, palma('#7A4F0E', '#8A6A14')]],
    'platino': [
      [36, 171, '<path d="M-12,0 L-5,-15 L0,-8 L5,-21 L12,0 Z" fill="#BFE8F2"/><path d="M5,-21 L12,0 H3 Z" fill="#5FA9BC"/><path d="M-5,-15 L0,-8 L-3,0 H-12 Z" fill="#FFFFFF"/>'],
      [262, 172, '<path d="M-10,0 L-3,-17 L2,-9 L6,-13 L10,0 Z" fill="#BFE8F2"/><path d="M6,-13 L10,0 H4 Z" fill="#5FA9BC"/><path d="M-3,-17 L2,-9 L-1,0 H-10 Z" fill="#FFFFFF"/>']],
    'diamante': [
      [36, 171, aguja(-5, 5.5, 15, -16, HONDO) + aguja(4, 5, 12, 14, HONDO) + aguja(0, 6.5, 21, -2, CLARO)],
      [262, 171, aguja(-6, 6, 17, -18, HONDO) + aguja(6, 6, 15, 16, CLARO) + aguja(0, 7.5, 27, 3, HONDO) + aguja(-2, 4, 10, 30, CLARO)]],
    'materia oscura pro': [
      [32, 170, '<ellipse cx="0" cy="-1" rx="4" ry="1.3" fill="#B48CFF" opacity=".7"/><path d="M-2.4,-4 V-23 H2.4 V-4 Z" fill="#0A0518"/><path d="M-2.4,-4 V-23 H-.7 V-4 Z" fill="#6E4DF2"/>'],
      [50, 175, '<ellipse cx="0" cy="-1" rx="3" ry="1" fill="#B48CFF" opacity=".7"/><path d="M-1.8,-3 V-15 H1.8 V-3 Z" fill="#0A0518"/><path d="M-1.8,-3 V-15 H-.5 V-3 Z" fill="#6E4DF2"/>'],
      [262, 171, '<ellipse cx="0" cy="-1" rx="4.4" ry="1.4" fill="#FF8AD8" opacity=".7"/><path d="M-2.6,-5 V-28 H2.6 V-5 Z" fill="#0A0518"/><path d="M-2.6,-5 V-28 H-.8 V-5 Z" fill="#A48BFF"/>']],
    'misterio': []
  };

  /* ---------- lo que construyen las estrellas (misiones, 16-nov-2026) ----------
     Cada 3 estrellas de las misiones aparece una cosa en la isla del mundo
     donde se ganaron (app/misiones.js decide cuántas; aquí solo se dibujan).
     Son cosas de barrio, no de plata: nada de monedas, cofres ni billetes, por
     la misma regla de la garantía (decisión del 21-oct). Se dibujan como los
     adornos: en unidades de suelo, de pie sobre (0,0). El orden lo aprobó Joan
     en los bocetos del 16-nov (bandera, árbol, banca, farol, puesto de
     mercado); después se repiten, hasta MAX_COSAS por isla. */
  var COSAS = {
    bandera: '<g transform="scale(.62) translate(-9 -37)"><ellipse cx="9" cy="37" rx="7" ry="2.2" fill="#000" opacity=".28"/><path d="M8 37V5" stroke="#F3EBDD" stroke-width="2" stroke-linecap="round"/><path d="M9 6c5 1.2 9-1.4 15 .6v10c-6-2-10 .6-15-.6z" fill="#F5C542"/><path d="M9 6c5 1.2 9-1.4 15 .6v3c-6-2-10 .6-15-.6z" fill="#fff" opacity=".22"/><path d="m16.4 9.2.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z" fill="#3A2A12"/><circle cx="8" cy="4.6" r="1.6" fill="#F5C542"/></g>',
    arbol: '<g transform="scale(.56) translate(-17 -41)"><ellipse cx="17" cy="41" rx="10" ry="2.6" fill="#000" opacity=".28"/><rect x="15" y="27" width="4" height="14" rx="1.5" fill="#6B4A2F"/><circle cx="17" cy="18" r="11" fill="#3E6B48"/><circle cx="11.5" cy="22" r="7" fill="#355E3F"/><circle cx="22.5" cy="21.5" r="7.5" fill="#46774F"/><circle cx="14" cy="13" r="5" fill="#6E9E68" opacity=".75"/></g>',
    banca: '<g transform="scale(.5) translate(-20 -27)"><ellipse cx="20" cy="27" rx="15" ry="2.4" fill="#000" opacity=".28"/><path d="M5 15h30v4H5z" fill="#9A6A45"/><path d="M5 15h30v1.4H5z" fill="#C08A5E"/><path d="M6 8h28v4H6z" fill="#8A5C3B"/><path d="M8 19v7M32 19v7M9 12v3M31 12v3" stroke="#3E2A1C" stroke-width="2"/></g>',
    /* la luz del farol son dos círculos tenues y no un degradado: un id de
       degradado repetido en la página (la isla grande y las del álbum) se
       pinta con el primero que encuentre, y ese puede estar oculto */
    farol: '<g transform="scale(.5) translate(-15 -47)"><circle cx="15" cy="11" r="12" fill="#FFE7A3" opacity=".16"/><circle cx="15" cy="11" r="7.5" fill="#FFE7A3" opacity=".22"/><ellipse cx="15" cy="47" rx="6" ry="2" fill="#000" opacity=".28"/><path d="M15 46V16" stroke="#2B2B2E" stroke-width="2.4"/><path d="M10 15h10l-1.5-8h-7z" fill="#FFE7A3" stroke="#2B2B2E" stroke-width="1.6"/><path d="M9 7h12l-6-4z" fill="#2B2B2E"/></g>',
    puesto: '<g transform="scale(.52) translate(-22 -37)"><ellipse cx="22" cy="37" rx="17" ry="2.6" fill="#000" opacity=".28"/><path d="M8 20h28v15H8z" fill="#B98B5E"/><path d="M8 20h28v3H8z" fill="#D9AE7E"/><path d="M6 10h32l-2 10H8z" fill="#F3EBDD"/><path d="M10 10h6l-1 10h-5zM22 10h6l1 10h-6zM34 10h4l-2 10h-3z" fill="#C0392B"/><path d="M9 20v15M35 20v15" stroke="#5A3D26" stroke-width="2"/><circle cx="15" cy="27" r="2.6" fill="#E8833A"/><circle cx="21" cy="27.5" r="2.6" fill="#7BB661"/><circle cx="27" cy="27" r="2.6" fill="#D94A3A"/></g>'
  };
  /* El árbol de Navidad de «Diciembre puntual» (18-nov-2026, app/misiones.js):
     no es de los que construyen las estrellas, así que no va en ORDEN_COSAS.
     Del alto de las cosas (CAJA_COSA), con la estrella arriba y cuatro bolas
     de los colores del alumbrado de la app. */
  var ARBOL_NAVIDAD = '<g transform="scale(.6) translate(-17 -40)"><ellipse cx="17" cy="40" rx="10" ry="2.6" fill="#000" opacity=".28"/>' +
    '<rect x="15" y="33" width="4" height="7" rx="1" fill="#6B4A2F"/>' +
    '<path d="M17 6 L27.5 19 H22.5 L30.5 33 H3.5 L11.5 19 H6.5 Z" fill="#2E7D4F"/><path d="M17 6 L6.5 19 H11.5 L3.5 33 H17 Z" fill="#3F9A63"/>' +
    '<circle cx="12" cy="27.5" r="1.8" fill="#E5484D"/><circle cx="22.5" cy="29" r="1.8" fill="#F5C542"/><circle cx="19.5" cy="20.5" r="1.6" fill="#4FA3FF"/><circle cx="13.5" cy="17" r="1.4" fill="#F5C542"/><circle cx="21" cy="14" r="1.2" fill="#E5484D"/>' +
    '<path d="m17 1.2 1.3 2.7 3 .4-2.2 2 .6 2.9L17 7.8l-2.7 1.4.6-2.9-2.2-2 3-.4z" fill="#F5C542" stroke="#FFF3C9" stroke-width=".5"/></g>';
  var ORDEN_COSAS = ['bandera', 'arbol', 'banca', 'farol', 'puesto', 'arbol', 'farol', 'banca', 'arbol', 'puesto', 'farol', 'arbol'];
  var MAX_COSAS = ORDEN_COSAS.length, AGRANDA_COSA = 1.7;
  /* Lo que ocupa una cosa de pie (la más ancha y la más alta mandan), en
     unidades de suelo antes de agrandarla. */
  var CAJA_COSA = { medio: 8.6, alto: 23 };
  /* Lo que ocupan el monumento y los adornos, medido con holgura sobre sus
     dibujos (el más grande manda: el avión de Aluminio sube a 62). */
  var CAJA_MONU = { medio: 27, alto: 50 }, CAJA_ADORNO = { medio: 13, alto: 28 };

  /* DÓNDE VA CADA COSA. No hay una tabla escrita a mano por mundo: se calcula
     con la misma proyección, una vez por mundo, y se guarda. Se mide en la
     pantalla y no en el suelo, porque lo que no puede pasar es que se VEA
     encima de algo: una cosa de pie delante de la pista la tapa aunque en el
     suelo esté lejos. Las reglas, en orden:
       1. de pie en la cubierta, con margen del borde (el 84 % del contorno),
          y no tan al fondo que se meta debajo del rótulo del mundo;
       2. su silueta no toca la pista ni sus pianos (ahí van las piedras y el
          marcador), ni el pórtico de la meta con su letrero, ni el monumento,
          ni los adornos del mundo;
       3. ninguna tapa a otra;
       4. de las que quedan, se escoge la más despejada y después, una a una,
          la más lejos de las ya escogidas: así se reparten por la isla en vez
          de amontonarse en el primer hueco.
     Como la escala del lienzo es la misma a lo ancho y a lo alto, lo que se
     mide con `proyectar` vale para cualquier tamaño de pantalla. */
  var SITIOS = {};
  function dentro(pts, x, y) {
    var adentro = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) adentro = !adentro;
    }
    return adentro;
  }
  function cajaDePie(u, v, caja, agranda) {
    var q = proyectar(u, v, 0), k = q[2], m = caja.medio * agranda * k;
    return [q[0] - m, q[1] - caja.alto * agranda * k, q[0] + m, q[1] + 2 * k];
  }
  function chocan(a, b, margen) {
    return a[0] - margen < b[2] && b[0] - margen < a[2] && a[1] - margen < b[3] && b[1] - margen < a[3];
  }
  function sitios(nivel) {
    if (SITIOS[nivel]) return SITIOS[nivel];
    var N = 160, MEDIO = ANCHO_PISTA / 2 + KERB_PISTA, c = muestras(CIRCUITOS[nivel], N), isl = ISLA[nivel];
    var cubierta = contorno(nivel).map(function (p) { return [150 + (p[0] - 150) * 0.84, 90 + (p[1] - 90) * 0.84]; });
    /* la calzada, como nube de puntos en la pantalla: cinco a lo ancho de cada
       muestra. Los pianos del borde sí se pueden tapar un poco (un árbol al
       lado de la carretera); la calzada no, que ahí van las piedras y el
       marcador. Y la cosa no puede estar PARADA en la pista: eso se mide en
       el suelo (lejos). */
    var pista = [], i;
    for (i = 0; i < N; i++) {
      var a = c[(i - 1 + N) % N], b = c[(i + 1) % N], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.sqrt(tx * tx + ty * ty) || 1;
      [-ANCHO_PISTA / 2, -ANCHO_PISTA / 4, 0, ANCHO_PISTA / 4, ANCHO_PISTA / 2].forEach(function (o) {
        pista.push(proyectar(c[i][0] - ty / l * o, c[i][1] + tx / l * o, 0));
      });
    }
    /* el pórtico de la meta (26 de alto) y, encima, su letrero */
    var n0 = [-(c[1][1] - c[N - 1][1]), c[1][0] - c[N - 1][0]], l0 = Math.sqrt(n0[0] * n0[0] + n0[1] * n0[1]) || 1;
    var porti = [];
    [1, -1].forEach(function (lado) {
      var u = c[0][0] + n0[0] / l0 * (MEDIO + 1) * lado, v = c[0][1] + n0[1] / l0 * (MEDIO + 1) * lado;
      porti.push(proyectar(u, v, 0), proyectar(u, v, 48));
    });
    function lejos(u, v) {
      var d = Infinity;
      for (var z = 0; z < N; z++) d = Math.min(d, Math.pow(c[z][0] - u, 2) + Math.pow(c[z][1] - v, 2));
      return Math.sqrt(d);
    }
    var bloqueos = [[Math.min(porti[0][0], porti[2][0]) - 6, Math.min(porti[1][1], porti[3][1]) - 6,
                     Math.max(porti[0][0], porti[2][0]) + 6, Math.max(porti[0][1], porti[2][1]) + 2]];
    bloqueos.push(cajaDePie(isl.monu[0], isl.monu[1], CAJA_MONU, 1.35));
    (ADORNOS[nivel] || []).forEach(function (ad) { bloqueos.push(cajaDePie(ad[0], ad[1], CAJA_ADORNO, 1.4)); });

    var cand = [];
    for (var v = 4; v <= 166; v += 4) for (var u = -40; u <= 340; u += 5) {
      if (!dentro(cubierta, u, v) || lejos(u, v) < MEDIO + 4) continue;
      var bx = cajaDePie(u, v, CAJA_COSA, AGRANDA_COSA), malo = false, holgura = Infinity, q = proyectar(u, v, 0);
      for (var k = 0; k < bloqueos.length && !malo; k++) if (chocan(bx, bloqueos[k], 1)) malo = true;
      for (var p = 0; p < pista.length && !malo; p++) {
        var t = pista[p];
        if (t[0] > bx[0] - 1.5 && t[0] < bx[2] + 1.5 && t[1] > bx[1] - 1.5 && t[1] < bx[3] + 1.5) malo = true;
        else holgura = Math.min(holgura, Math.sqrt(Math.pow(t[0] - q[0], 2) + Math.pow(t[1] - q[1], 2)));
      }
      if (!malo) cand.push({ u: u, v: v, x: q[0], y: q[1], caja: bx, holgura: holgura });
    }
    var hechos = [];
    while (hechos.length < MAX_COSAS) {
      var mejor = null, nota = -1;
      for (var j = 0; j < cand.length; j++) {
        var cj = cand[j], libre = true, lejos = Infinity;
        for (var h = 0; h < hechos.length && libre; h++) {
          if (chocan(cj.caja, hechos[h].caja, 1.5)) libre = false;
          else lejos = Math.min(lejos, Math.sqrt(Math.pow(cj.x - hechos[h].x, 2) + Math.pow(cj.y - hechos[h].y, 2)));
        }
        if (!libre) continue;
        var n = hechos.length ? lejos : cj.holgura;
        if (n > nota) { nota = n; mejor = cj; }
      }
      if (!mejor) break;
      hechos.push(mejor);
    }
    SITIOS[nivel] = hechos.map(function (x) { return [x.u, x.v]; });

    /* lo que hace falta para buscar el sitio del árbol, si alguna vez hace falta */
    DATOS_SITIOS[nivel] = { c: c, N: N, MEDIO: MEDIO, pista: pista, bloqueos: bloqueos, hechos: hechos, cubierta: cubierta };
    return SITIOS[nivel];
  }
  var DATOS_SITIOS = {}, SITIO_ARBOL = {};
  /* EL SITIO DEL ÁRBOL de «Diciembre puntual» (18-nov-2026). No entra en la
     cuenta de las cosas: es un logro aparte y se queda. Tampoco puede tapar
     una cosa ni quitarle el sitio a una que viene, y ninguna isla tiene un
     sitio de sobra (de 6 a 11, medido). Así que va en el BORDE de la
     cubierta, en el anillo que las cosas dejan libre (ellas guardan margen
     del borde, regla 1), por delante, sin tocar la pista, el pórtico, el
     monumento, los adornos ni los sitios de las cosas. De los que quedan, el
     más despejado. Se busca solo para la isla que lo lleva, y una vez: hacerlo
     junto con los sitios casi triplicaba lo que tarda abrir la Pista (de 68 a
     197 ms las nueve islas, en un computador), y casi nadie lo tiene. */
  function sitioArbol(nivel) {
    if (SITIO_ARBOL[nivel] !== undefined) return SITIO_ARBOL[nivel];
    sitios(nivel);
    var z = DATOS_SITIOS[nivel];
    if (!z) return null;
    function aLaPista(u, v) {
      var d = Infinity;
      for (var k = 0; k < z.N; k++) d = Math.min(d, Math.pow(z.c[k][0] - u, 2) + Math.pow(z.c[k][1] - v, 2));
      return Math.sqrt(d);
    }
    var borde = contorno(nivel).map(function (p) { return [150 + (p[0] - 150) * 0.97, 90 + (p[1] - 90) * 0.97]; });
    var arbol = null, nota = -1;
    for (var v = -30; v <= 90; v += 3) for (var u = -50; u <= 350; u += 4) {
      if (!dentro(borde, u, v) || dentro(z.cubierta, u, v) || aLaPista(u, v) < z.MEDIO + 4) continue;
      var b = cajaDePie(u, v, CAJA_COSA, AGRANDA_COSA), q = proyectar(u, v, 0), mal = false, holgura = Infinity, k;
      for (k = 0; k < z.bloqueos.length && !mal; k++) if (chocan(b, z.bloqueos[k], 1)) mal = true;
      for (k = 0; k < z.hechos.length && !mal; k++) {
        if (chocan(b, z.hechos[k].caja, 1.5)) mal = true;
        else holgura = Math.min(holgura, Math.sqrt(Math.pow(q[0] - z.hechos[k].x, 2) + Math.pow(q[1] - z.hechos[k].y, 2)));
      }
      for (k = 0; k < z.pista.length && !mal; k++) {
        var t = z.pista[k];
        if (t[0] > b[0] - 1.5 && t[0] < b[2] + 1.5 && t[1] > b[1] - 1.5 && t[1] < b[3] + 1.5) mal = true;
        else holgura = Math.min(holgura, Math.sqrt(Math.pow(t[0] - q[0], 2) + Math.pow(t[1] - q[1], 2)));
      }
      if (!mal && holgura > nota) { nota = holgura; arbol = [u, v]; }
    }
    SITIO_ARBOL[nivel] = arbol;
    return arbol;
  }
  /* Las cosas de una isla, listas para ponerlas de pie. `cuantas` son las
     hechas; `sigue`, la que viene (se pinta apagada, como promesa). */
  function cosasDe(nivel, L, cuantas, sigue) {
    var lugares = sitios(nivel), out = [], n = Math.min(Math.max(0, cuantas | 0), lugares.length, MAX_COSAS);
    for (var i = 0; i < n; i++) out.push(dePie(L, lugares[i][0], lugares[i][1], COSAS[ORDEN_COSAS[i]], AGRANDA_COSA));
    if (sigue && n < lugares.length) {
      var x = dePie(L, lugares[n][0], lugares[n][1], COSAS[ORDEN_COSAS[n]], AGRANDA_COSA);
      x.svg = '<g class="pn-sigue" opacity=".34">' + x.svg + '</g>';
      out.push(x);
    }
    return out;
  }

  /* ---------- el mundo entero: tres capas ---------- */
  function capa(clase, W, H, defs, cuerpo) {
    return '<svg class="pn-capa ' + clase + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice"><defs>' + defs + '</defs>' + cuerpo + '</svg>';
  }
  function mundo(nivel, W, H, opciones) {
    var o = opciones || {}, c = ISLA[nivel];
    var fondo = paisaje(nivel, W, H, o.horizonte != null ? o.horizonte : 0.46);
    var arriba = H * (o.cielo != null ? o.cielo : 0.4);
    var L = lienzo(nivel, { x: 5, y: arriba, w: W - 10, h: H - arriba - (o.margenAbajo != null ? o.margenAbajo : 6) });
    o._W = W;   // para que la placa del nombre no se salga del dibujo (ver `pista`)
    var isl = isla(nivel, L), pis = pista(nivel, L, o);
    var id = { halo: nuevoId('mh'), metal: nuevoId('mm'), vin: nuevoId('mv'), som: nuevoId('ms'), nub: nuevoId('mb') };
    var cosas = pis.cosas.concat(ADORNOS[nivel].map(function (a) { return dePie(L, a[0], a[1], a[2], 1.4); }));
    cosas.push(dePie(L, c.monu[0], c.monu[1], MONUMENTO[nivel](id), 1.35));
    /* lo que construyeron sus estrellas (app/misiones.js dice cuántas) */
    if (o.cosas) cosas = cosas.concat(cosasDe(nivel, L, o.cosas, o.sigue));
    /* el árbol de «Diciembre puntual»: misiones.js dice si lo ganó y en qué isla */
    if (o.navidad) { var sa = sitioArbol(nivel); if (sa) cosas.push(dePie(L, sa[0], sa[1], ARBOL_NAVIDAD, AGRANDA_COSA)); }
    /* de lo más lejano a lo más cercano: lo de adelante tapa lo de atrás */
    cosas.sort(function (a, b) { return b.v - a.v; });
    var defsI = isl.defs + pis.defs + rgrad(id.halo, '.5', '.5', '.5', [[0, c.halo, 0.6], [1, c.halo, 0]]) +
      '<linearGradient id="' + id.metal + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--pn-m1)"/><stop offset=".45" style="stop-color:var(--pn-m3)"/><stop offset="1" style="stop-color:var(--pn-m5)"/></linearGradient>';
    /* la sombra que la isla le hace a lo que tiene debajo */
    var som = '<ellipse cx="' + r1(isl.K[0]) + '" cy="' + r1(Math.min(H - 5, isl.K[1] + 3)) + '" rx="' + r1(isl.ancho * 0.36) + '" ry="' + r1(isl.ancho * 0.045) + '" fill="url(#' + id.som + ')"/>';
    /* Islotes a lo lejos, teñidos del color del cielo: dan distancia y
       cuentan que este no es el único mundo. Van por encima del borde
       lejano de la isla (e[1] es fracción de esa altura). */
    var Pc = PALETA[nivel].cielo, bruma = mezcla(Pc[1], Pc[2], 0.55), lejos = '';
    (o.sinIslotes ? [] : c.islotes || []).forEach(function (e) {
      var x = W * e[0], y = isl.fondo[1] * e[1], w = W * e[2];
      var panza = [[x - w / 2, y], [x - w * 0.33, y + w * 0.15], [x - w * 0.12, y + w * 0.3], [x + w * 0.04, y + w * 0.36], [x + w * 0.24, y + w * 0.19], [x + w / 2, y]];
      lejos += '<polygon points="' + panza.map(pt).join(' ') + '" fill="' + mezcla(c.roca[1], bruma, 0.56) + '"/>' +
        '<polygon points="' + [panza[0], panza[1], panza[2], [x - w * 0.04, y]].map(pt).join(' ') + '" fill="' + mezcla(c.roca[0], bruma, 0.6) + '"/>' +
        '<ellipse cx="' + r1(x) + '" cy="' + r1(y) + '" rx="' + r1(w / 2) + '" ry="' + r1(w * 0.085) + '" fill="' + mezcla(c.suelo[0], bruma, 0.5) + '"/>' +
        '<ellipse cx="' + r1(x - w * 0.1) + '" cy="' + r1(y - w * 0.012) + '" rx="' + r1(w * 0.27) + '" ry="' + r1(w * 0.04) + '" fill="' + mezcla(c.filo, bruma, 0.4) + '" opacity=".75"/>';
    });
    /* (18-nov-2026: aquí iba la niebla que tapaba el último mundo; se fue con
       el «?», porque ahora ese mundo se ve como todos) */
    var frente = fondo.frente;
    var defsF = '';
    if (nivel === 'aluminio') {
      /* nubes que pasan por delante del casco: lo que dice «está arriba».
         Cada una son tres óvalos que se apagan hacia el borde. */
      defsF = rgrad(id.nub, '.5', '.5', '.5', [[0, '#FFFFFF', 0.95], [0.6, '#FFFFFF', 0.7], [1, '#FFFFFF', 0]]);
      [[-0.01, 0.95, 0.17], [1.0, 0.92, 0.18], [0.5, 1.04, 0.3]].forEach(function (nb) {
        [[0, 0, 1], [-0.55, 0.12, 0.62], [0.5, 0.1, 0.7]].forEach(function (k) {
          frente += '<ellipse cx="' + r1(W * (nb[0] + nb[2] * k[0])) + '" cy="' + r1(H * nb[1] + W * nb[2] * k[1]) + '" rx="' + r1(W * nb[2] * k[2]) + '" ry="' + r1(W * nb[2] * k[2] * 0.36) + '" fill="url(#' + id.nub + ')"/>';
        });
      });
    }
    frente += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id.vin + ')"/>';
    var luz = o.sinLuz ? { defs: '', rayos: '', motas: '' } : luzYVida(nivel, W, H);
    return '<div class="pn-capas ' + MUNDOS[nivel].clase + '" style="padding-top:' + (H / W * 100).toFixed(3) + '%" aria-hidden="true">' +
      capa('pn-fondo', W, H, fondo.defs + luz.defs + rgrad(id.som, '.5', '.5', '.5', [[0, '#000000', 0.5], [1, '#000000', 0]]), fondo.cuerpo + luz.rayos + lejos + som) +
      capa('pn-isla', W, H, defsI,
        isl.bajo + isl.techo + pis.base + cosas.map(function (x) { return x.svg; }).join('')) +
      (luz.motas ? capa('pn-motas', W, H, '', luz.motas) : '') +
      capa('pn-frente', W, H, defsF + rgrad(id.vin, '.5', '.56', '.78', [[0, '#000000', 0], [0.62, '#000000', 0], [1, '#000000', 0.5]]), frente) +
      '</div>';
  }

  /* POR DÓNDE VA LA PISTA EN LA PANTALLA: los 160 puntos del eje de la calzada
     de un mundo, ya proyectados ([x, y, escala]), con las MISMAS cuentas de
     `mundo` y de `pista`. Lo usa el repaso para llevar el carrito; no dibuja
     nada. Si `mundo` cambia cómo arma el lienzo, esto cambia con él (una
     prueba compara un punto con el del dibujo). */
  function rutaDe(nivel, W, H, opciones) {
    var o = opciones || {}, arriba = H * (o.cielo != null ? o.cielo : 0.4);
    var L = lienzo(nivel, { x: 5, y: arriba, w: W - 10, h: H - arriba - (o.margenAbajo != null ? o.margenAbajo : 6) });
    return muestras(CIRCUITOS[nivel], 160).map(function (p) { return L.P(p[0], p[1], 0); });
  }

  /* LUZ Y VIDA (boceto 14-A del 17-nov, que Joan escogió el 18-nov con «mejora
     los graficos tambien»). Lo que hacía el boceto, hecho para un teléfono
     barato:
       · los rayos del mundo entran de arriba y van QUIETOS en el fondo,
         detrás de la isla: se pintan una vez;
       · las motas de luz son una capa aparte (.pn-motas) que se mueve ENTERA,
         una sola animación que el teléfono compone. El boceto animaba 72
         círculos uno por uno, con desenfoque, y eso repinta en cada cuadro;
         aquí son 20, y las «lejanas» son más grandes y más tenues en vez de
         borrosas;
       · no hay `saturate` ni mezcla de capas sobre la escena: los dos obligan
         a repintarla entera mientras la isla flota.
     Con «reducir movimiento» las motas se quedan quietas (la hoja de estilos). */
  function luzYVida(nivel, W, H) {
    var P = PALETA[nivel], az = semilla(nivel.length * 977 + 3), S = [W * 0.72, -H * 0.1], largo = H * 1.35, i;
    var idR = nuevoId('ry'), idS = nuevoId('so');
    var defs = '<radialGradient id="' + idR + '" gradientUnits="userSpaceOnUse" cx="' + r1(S[0]) + '" cy="' + r1(S[1]) + '" r="' + r1(largo) + '">' +
      '<stop offset="0" stop-color="' + P.luz + '" stop-opacity=".7"/><stop offset=".55" stop-color="' + P.luz + '" stop-opacity=".22"/>' +
      '<stop offset="1" stop-color="' + P.luz + '" stop-opacity="0"/></radialGradient>' +
      rgrad(idS, '.5', '.5', '.5', [[0, P.luz, 0.38], [1, P.luz, 0]]);
    var rayos = '<circle cx="' + r1(S[0]) + '" cy="' + r1(S[1] + H * 0.1) + '" r="' + r1(H * 0.42) + '" fill="url(#' + idS + ')"/>';
    for (i = 0; i < 7; i++) {
      var a = (98 + i * 8.5 + az() * 3) * Math.PI / 180, w = (3 + (i % 3) * 2) * Math.PI / 180;
      rayos += '<polygon points="' + r1(S[0]) + ',' + r1(S[1]) + ' ' + r1(S[0] + largo * Math.cos(a - w)) + ',' + r1(S[1] + largo * Math.sin(a - w)) + ' ' +
        r1(S[0] + largo * Math.cos(a + w)) + ',' + r1(S[1] + largo * Math.sin(a + w)) + '" fill="url(#' + idR + ')" opacity="' + (0.45 + az() * 0.3).toFixed(2) + '"/>';
    }
    var motas = '';
    for (i = 0; i < 20; i++) {
      var x = W * (0.04 + az() * 0.92), y = H * (0.14 + az() * 0.8), r = W * (0.0026 + az() * 0.0075), lejos = az() < 0.35;
      motas += '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(lejos ? r * 2.2 : r) + '" fill="' + P.chispa + '" opacity="' +
        (lejos ? 0.16 + az() * 0.14 : 0.55 + az() * 0.4).toFixed(2) + '"/>';
    }
    /* y unos pocos destellos en cruz, como sobre lo que brilla */
    for (i = 0; i < 6; i++) {
      var dx = W * (0.12 + az() * 0.76), dy = H * (0.3 + az() * 0.5), dz = W * (0.006 + az() * 0.009);
      motas += '<path d="M' + r1(dx) + ' ' + r1(dy - dz * 2.4) + ' L' + r1(dx + dz * 0.35) + ' ' + r1(dy - dz * 0.35) + ' L' + r1(dx + dz * 2.4) + ' ' + r1(dy) +
        ' L' + r1(dx + dz * 0.35) + ' ' + r1(dy + dz * 0.35) + ' L' + r1(dx) + ' ' + r1(dy + dz * 2.4) + ' L' + r1(dx - dz * 0.35) + ' ' + r1(dy + dz * 0.35) +
        ' L' + r1(dx - dz * 2.4) + ' ' + r1(dy) + ' L' + r1(dx - dz * 0.35) + ' ' + r1(dy - dz * 0.35) + ' Z" fill="#FFFFFF" opacity="' + (0.5 + az() * 0.4).toFixed(2) + '"/>';
    }
    return { defs: defs, rayos: rayos, motas: motas };
  }


  /* ======================= MEDIR UN TRAZADO, SIN NAVEGADOR =======================
     El navegador sabe medir un trazado (getPointAtLength), pero pide un
     documento de verdad, y este archivo tiene que correr también donde no lo
     hay: el banco de pruebas arranca la página con uno de mentira. Los
     circuitos solo usan M, H, V, L, C, A y Z en absoluto, y eso se mide aquí.
     Devuelve n puntos repartidos parejo a lo largo de la vuelta. Se hace una
     vez por mundo y se guarda. */
  var MEDIDAS = {};
  function arco(pts, x0, y0, rx, ry, giro, grande, barrido, x1, y1) {
    var fi = giro * Math.PI / 180, cf = Math.cos(fi), sf = Math.sin(fi);
    var dx = (x0 - x1) / 2, dy = (y0 - y1) / 2, xp = cf * dx + sf * dy, yp = -sf * dx + cf * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var l = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
    var arriba = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, abajo = rx * rx * yp * yp + ry * ry * xp * xp;
    var co = (grande === barrido ? -1 : 1) * Math.sqrt(Math.max(0, arriba / (abajo || 1)));
    var cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
    var cx = cf * cxp - sf * cyp + (x0 + x1) / 2, cy = sf * cxp + cf * cyp + (y0 + y1) / 2;
    function ang(ux, uy, vx, vy) { return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); }
    var t0 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    var dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!barrido && dt > 0) dt -= 2 * Math.PI; else if (barrido && dt < 0) dt += 2 * Math.PI;
    for (var k = 1; k <= 28; k++) {
      var t = t0 + dt * k / 28, c = Math.cos(t), s = Math.sin(t);
      pts.push([cf * rx * c - sf * ry * s + cx, sf * rx * c + cf * ry * s + cy]);
    }
  }
  function muestras(d, n) {
    var clave = n + '|' + d;
    if (MEDIDAS[clave]) return MEDIDAS[clave];
    var tk = String(d).match(/[MHVLCAZ]|-?\d*\.?\d+/g) || [], i = 0, x = 0, y = 0, x0 = 0, y0 = 0, pts = [], cmd = '', k;
    function num() { return parseFloat(tk[i++]); }
    while (i < tk.length) {
      if (/^[MHVLCAZ]$/.test(tk[i])) cmd = tk[i++];
      if (cmd === 'M') { x = num(); y = num(); x0 = x; y0 = y; pts.push([x, y]); cmd = 'L'; }
      else if (cmd === 'L') { x = num(); y = num(); pts.push([x, y]); }
      else if (cmd === 'H') { x = num(); pts.push([x, y]); }
      else if (cmd === 'V') { y = num(); pts.push([x, y]); }
      else if (cmd === 'C') {
        var a = num(), b = num(), c = num(), e = num(), f = num(), g = num();
        for (k = 1; k <= 28; k++) {
          var u = k / 28, v = 1 - u;
          pts.push([v * v * v * x + 3 * v * v * u * a + 3 * v * u * u * c + u * u * u * f,
                    v * v * v * y + 3 * v * v * u * b + 3 * v * u * u * e + u * u * u * g]);
        }
        x = f; y = g;
      } else if (cmd === 'A') {
        var rx = num(), ry = num(), giro = num(), grande = num(), barrido = num(), x1 = num(), y1 = num();
        arco(pts, x, y, rx, ry, giro, !!grande, !!barrido, x1, y1);
        x = x1; y = y1;
      } else if (cmd === 'Z') { x = x0; y = y0; pts.push([x, y]); cmd = ''; }
      else i++;   // algo que no se conoce: se salta en vez de quedarse dando vueltas
    }
    var largo = [0];
    for (k = 1; k < pts.length; k++) largo.push(largo[k - 1] + Math.sqrt(Math.pow(pts[k][0] - pts[k - 1][0], 2) + Math.pow(pts[k][1] - pts[k - 1][1], 2)));
    var total = largo[largo.length - 1], out = [], j = 1;
    for (var s = 0; s < n; s++) {
      var meta = total * s / n;
      while (j < largo.length - 1 && largo[j] < meta) j++;
      var p0 = pts[j - 1] || pts[0], p1 = pts[j] || pts[0], tramo = (largo[j] - largo[j - 1]) || 1, w = (meta - largo[j - 1]) / tramo;
      out.push([p0[0] + (p1[0] - p0[0]) * w, p0[1] + (p1[1] - p0[1]) * w]);
    }
    MEDIDAS[clave] = out;
    return out;
  }

  /* ======================= LOS DATOS: TODO DEL MOTOR Y DE LA HISTORIA ======================= */
  /* Los tramos los da el MOTOR, no una tabla de aquí: si mañana hay un nivel
     más o cambia un umbral, la pista lo dice sola. */
  function filas() { return motor().proyeccionNiveles(0, null); }
  /* Dónde está parado: su mundo, el que sigue, cuánto lleva de la vuelta
     (0 a 1) y cuánto le falta. Una sola entrada: la garantía de hoy. */
  function donde(garantia) {
    var m = motor(), f = filas(), g = Math.max(0, Number(garantia) || 0), nivel = m.nivelPorGarantia(g), i = 0;
    for (var k = 0; k < f.length; k++) if (f[k].nivel === nivel) i = k;
    var a = f[i], sig = f[i + 1] || null;
    return { filas: f, i: i, nivel: nivel, actual: a, sig: sig, garantia: g,
      fraccion: fraccionEn(a, g), faltan: sig ? Math.max(0, sig.desde - g) : 0 };
  }
  /* El último mundo no tiene techo: ahí la vuelta no avanza, y se dice. */
  function fraccionEn(fila, g) {
    if (!fila || fila.hasta == null) return 0;
    return Math.max(0, Math.min(1, (g - fila.desde) / (fila.hasta - fila.desde)));
  }
  /* «Pagado en fecha»: la MISMA línea del Historial y de las insignias de
     app/socio.html. Si allá cambia, aquí también: dos pantallas de la misma
     app no pueden contar distinto el mismo pago. */
  function enFecha(c) { return !!(c && c.fecha_pagado && c.corte && c.fecha_pagado <= c.corte); }
  /* Los créditos pagados, del más viejo al más nuevo, cada uno con la garantía
     en que quedó la cuenta al pagarlo, reconstruida HACIA ATRÁS desde la de
     hoy (ver «lo que hay que saber de los datos», arriba). El crédito abierto
     se descuenta primero: lo que dejaron sus prórrogas fue lo último en
     entrar. Uno cerrado con pérdida no es una piedra, pero lo que alcanzó a
     dejar también se descuenta. */
  function recorrido(garantiaHoy, creditos) {
    var m = motor();
    var lista = (creditos || []).map(function (c, i) { return { c: c || {}, i: i }; }).sort(function (a, b) {
      var ap = a.c.pagado ? 1 : 0, bp = b.c.pagado ? 1 : 0;
      if (ap !== bp) return ap - bp;
      var fa = String(a.c.fecha_pagado || ''), fb = String(b.c.fecha_pagado || '');
      if (fa !== fb) return fa < fb ? 1 : -1;
      return a.i - b.i;
    });
    var g = Math.max(0, Number(garantiaHoy) || 0), out = [];
    lista.forEach(function (x) {
      var c = x.c, dejo = Math.max(0, Number(c.garantia) || 0);
      if (c.pagado && !c.cerrado_con_perdida) {
        var quedo = Math.max(0, g);
        out.push({ codigo: c.codigo || '', fecha: c.fecha_pagado || null, en_fecha: enFecha(c),
                   dejo: dejo, quedo: quedo, nivel: m.nivelPorGarantia(quedo) });
      }
      g -= dejo;
    });
    return out.reverse();
  }
  /* «dos veces», no «2 prórrogas»: las mismas palabras de vecesTexto en la página. */
  function veces(n) {
    var k = Math.max(0, Math.round(Number(n) || 0));
    return k === 1 ? 'una vez' : (k === 2 ? 'dos veces' : k + ' veces');
  }
  /* QUÉ CAMBIA AL LLEGAR A UN MUNDO. No se afirma: se LEE del motor, comparando
     la fila de hoy con la de allá. Hoy la respuesta es «nada del crédito» (las
     prórrogas son las mismas y el cupo no depende del nivel), pero si el motor
     vuelve a mover algo por nivel, esta frase lo dice en vez de callarlo. */
  function queCambia(hoy, alla) {
    var base = 'Tu mundo y el nombre de tu nivel.';
    if (!hoy || !alla) return base;
    var p0 = Number(hoy.prorrogas), p1 = Number(alla.prorrogas), mueve = !!alla.mueve_el_cupo;
    if (p0 === p1 && !mueve) {
      return base + ' Tu crédito no: puedes aplazar hasta ' + veces(p1) + ' por crédito, igual que hoy, y tu cupo no depende del nivel.';
    }
    var extra = [];
    if (p0 !== p1) extra.push('podrás aplazar hasta ' + veces(p1) + ' por crédito (hoy, hasta ' + veces(p0) + ')');
    if (mueve) extra.push('tu cupo cambia con el nivel');
    return base + ' Y además ' + extra.join(', y ') + '.';
  }
  /* «$400 mil», «$1,6 M»: para el renglón chico bajo cada medalla. */
  function corto(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1000000) return '$' + String(Math.round(n / 100000) / 10).replace('.', ',') + ' M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + ' mil';
    return '$' + n;
  }
  function inicial(nombre) { return String(nombre || '').replace(/^\s+/, '').charAt(0).toUpperCase(); }
  /* «Camila», de «Camila Rojas»: como la saluda la app. Largo, se corta: la placa
     de la pista no puede tapar el mundo. */
  function primerNombre(nombre) {
    var n = String(nombre || '').replace(/^\s+/, '').split(/\s+/)[0] || '';
    n = n.charAt(0).toUpperCase() + n.slice(1);
    return n.length > 12 ? n.slice(0, 11) + '…' : n;
  }
  function mayuscula(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function centavosDe(d) {
    var c = Number(d && d.centavos);
    if (!(c > 0)) c = Number(motor().FACTOR_GARANTIA || 0) * 100;
    return c > 0 ? Math.round(c) : 0;
  }

  /* ======================= LA PANTALLA ======================= */
  var ULTIMO = null, ABIERTA = null, VUELVE_A = null, MI = null, AL_CERRAR = null, HERO = null, REC = [];
  var MAX_SELLOS = 4;   // los que caben legibles en una fila de 360 px
  function documento() { return typeof document !== 'undefined' ? document : null; }
  /* El dibujo se arma para el ancho de ESTE teléfono: en uno de 360 la escena
     es alta (el mundo manda); en una pantalla ancha se topa, para que la isla
     no empuje todo lo demás fuera de la vista. */
  function anchoPantalla() {
    var w = 360;
    try { if (typeof window !== 'undefined' && window.innerWidth > 0) w = window.innerWidth; } catch (e) { /* 360 */ }
    return Math.max(280, Math.min(488, Math.round(w) - 32));
  }
  /* ¿Llegó la hoja de estilos? Sin ella este HTML se vería como un montón de
     dibujos sueltos, así que se pregunta por una variable que solo ella pone.
     Donde no hay con qué preguntar (el banco de pruebas), se da por llegada. */
  function cssLlego() {
    try {
      var d = documento();
      if (!d || !d.documentElement || typeof getComputedStyle !== 'function') return true;
      return String(getComputedStyle(d.documentElement).getPropertyValue('--pn-listo') || '').trim() !== '';
    } catch (e) { return true; }
  }
  function piedraSvg(sello) {
    return '<svg viewBox="0 0 30 30" aria-hidden="true">' +
      (sello ? '<circle cx="15" cy="15" r="14" style="fill:none;stroke:var(--amarillo)" stroke-opacity=".35" stroke-width="1.5"/>' : '') +
      '<circle cx="15" cy="15" r="11" style="fill:' + (sello ? 'var(--amarillo)' : 'var(--laca)') + ';stroke:' + (sello ? 'var(--laca)' : 'var(--amarillo)') + '" stroke-width="2"/>' +
      (sello ? '<path d="M10 15.4 l3.4 3.4 l6.8 -7.4" style="fill:none;stroke:var(--laca)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' : '') + '</svg>';
  }

  /* El mundo en grande. La frase de «te faltan» es la de Inicio, que la
     página pasa hecha (textoProximoNivel): una sola frase para las dos
     pantallas. Si no llega, se arma aquí con las mismas palabras. */
  function heroe(e, d, aqui, mi) {
    var m = motor(), W = anchoPantalla(), H = Math.round(Math.min(W * 1.22, 440));
    var nombre = m.nombreNivel(e.nivel), mu = MUNDOS[e.nivel];
    var op = { cielo: 0.3, margenAbajo: 30, f: e.fraccion, nombre: primerNombre(d.nombre), letra: inicial(d.nombre),
      piedras: aqui.map(function (p) { return { f: fraccionEn(e.actual, p.quedo), sello: p.en_fecha }; }) };
    if (e.sig) op.meta = 'Meta · ' + e.sig.nombre;
    /* lo que construyeron sus estrellas y su personaje (app/misiones.js) */
    if (mi) {
      op.cosas = mi.isla.cosas; op.sigue = mi.isla.sigue;
      /* el árbol de «Diciembre puntual», si lo ganó en esta isla (18-nov) */
      op.navidad = !!(mi.navidad_en && mi.navidad_en[e.nivel]);
      /* En un teléfono de 320 px «Aquí estás» ya baja a su propio renglón, y el
         chip del título suma otro: caía encima del letrero «Meta · Plata» de la
         isla (foto del 16-nov). Ahí el lienzo crece y la isla baja del mismo
         tamaño, en vez de esconder algo: subir solo el cielo la achicaba y el
         letrero seguía debajo del chip. */
      if (W < 320) { H += 36; op.cielo = 0.37; }
      if (mi.personaje && misiones().ICONOS[mi.personaje]) op.personaje = misiones().ICONOS[mi.personaje];
    }
    var pct = (e.fraccion * 100).toFixed(1);
    var frase = d.frase || (e.sig
      ? 'Te faltan <b>' + esc(COP(e.faltan)) + '</b> de garantía para pasar a <b>' + esc(e.sig.nombre) + '</b>.'
      : 'Estás en el nivel más alto.');
    /* lo que el repaso necesita para volver a pintar esta misma escena, y las
       de los mundos de antes, del mismo tamaño (ver EL REPASO) */
    HERO = { e: e, W: W, H: H, op: op };
    return '<div class="laca pn-hero ' + mu.clase + '" id="pnHero">' +
      '<div class="pn-lienzo"><div id="pnEscena">' + mundo(e.nivel, W, H, op) + '</div>' +
        /* «Aquí estás» va en el mismo renglón de «Mundo 2 de 9» y, si no cabe,
           baja sola al siguiente: puesta fija en la esquina se montaba sobre
           el rótulo en un teléfono de 320 px, y sobre un nombre largo en todos. */
        '<div class="pn-cabeza">' + medalla(e.nivel) +
          '<div class="pn-titulos"><div class="pn-arriba"><span class="pn-etq">Mundo ' + (e.i + 1) + ' de ' + e.filas.length + '</span>' +
          '<span class="pn-estado">Aquí estás</span></div>' +
          '<h2' + (nombre.length > 10 ? ' class="pn-largo"' : '') + '>' + esc(nombre) + '</h2>' +
          '<div class="pn-lema">' + esc(mu.lema) + '</div>' + (mi ? misiones().chip(mi) : '') + '</div></div>' +
        (mi ? misiones().pildora(mi) : '') +
        /* «Saltar» el repaso: escondido hasta que corre. Va al final del
           lienzo para que lo primero que se lea de la tarjeta siga siendo el
           mundo. */
        '<button type="button" class="pn-rp-saltar" id="pnSaltar" onclick="PistaNiveles.saltar()">Saltar</button></div>' +
      /* El rótulo del repaso va AQUÍ, en el pie y encima de «te faltan» (que se
         esconde mientras tanto): puesto sobre el mundo tapaba media pista, y
         lo de abajo hablaba del mundo de hoy mientras se veía uno de antes. */
      '<div class="pn-pie"><div class="pn-rp" id="pnRp" aria-live="polite"></div><div class="pn-grande">' + frase + '</div>' +
        (e.sig
          ? '<div class="pn-progreso">' + medalla(e.nivel, 'pn-chica') +
            '<div class="pn-riel"><i style="width:' + pct + '%"></i><b style="left:' + pct + '%"></b></div>' +
            '<span class="pn-cerrado">' + medalla(e.sig.nivel, 'pn-chica') + '</span></div>' +
            '<div class="pn-cifras"><span>' + COP(e.actual.desde) + '</span><span>vas en <b>' + COP(e.garantia) + '</b></span><span>' + COP(e.sig.desde) + '</span></div>'
          : '<div class="pn-cifras"><span>Empieza en ' + COP(e.actual.desde) + '</span><span>vas en <b>' + COP(e.garantia) + '</b></span></div>') +
      '</div></div>';
  }
  /* CÓMO SUBIR MÁS RÁPIDO (18-nov-2026). Joan: «indica como puedes subir de
     nivel mas rapido». Son las TRES cosas que de verdad suben la garantía, con
     las cifras del motor y las de este cliente, y ninguna es pedir más (es
     crédito: subir no se gana pidiendo). Tres cuidados:
       · LOS DATOS SENSIBLES no se cuentan entre «los que te faltan»: la selfie
         (biométrico) y la ubicación piden cada uno su autorización aparte, y
         un botón que empuja a darlos por un premio no es un consentimiento
         libre (Ley 1581). Se dice cuánto suman, sin botón.
       · PAGAR TARDE ya no quita garantía (23-sep: en fecha y tarde valen lo
         mismo), pero el recargo por mora no suma nada (27-sep). Se dice así,
         sin asustar y sin premiar el atraso.
       · INVITAR le suma al que invita solo cuando el invitado paga, y no pasa
         de la garantía que el que invita se ganó pagando (TOPE_REFERIDOS). Se
         dice el tope. No se muestra a nadie más (Ley 2300). */
  var SENSIBLES = ['foto_selfie', 'ubicacion'];
  function comoSubir(d) {
    var m = motor(), cents = centavosDe(d), filas = [], datos = null, M = misiones();
    if (d.perfil && typeof m.garantiaPorDatos === 'function') {
      try { datos = m.garantiaPorDatos(d.perfil); } catch (x) { datos = null; }
    }
    if (datos) {
      var sens = (M && M.SENSIBLES) || SENSIBLES;
      var comunes = datos.faltantes.filter(function (x) { return sens.indexOf(x.id) < 0; });
      var delicados = datos.faltantes.filter(function (x) { return sens.indexOf(x.id) >= 0; });
      var suma = function (l) { return l.reduce(function (t, x) { return t + (Number(x.valor) || 0); }, 0); };
      if (comunes.length) {
        filas.push('<p><b>Completa tus datos.</b> Te ' + (comunes.length === 1 ? 'falta 1 y vale' : 'faltan ' + comunes.length + ' y valen') +
          ' <b class="pn-c">' + COP(suma(comunes)) + '</b> de garantía, una sola vez.</p>' +
          (delicados.length ? '<p class="pn-nota-s">' + esc(mayuscula(delicados.map(function (x) { return x.id === 'foto_selfie' ? 'la selfie' : 'tu ubicación'; }).join(' y '))) +
            ' ' + (delicados.length === 1 ? 'suma' : 'suman') + ' ' + COP(suma(delicados)) + ' más, ' + (delicados.length === 1 ? 'con su' : 'cada una con su') + ' autorización aparte.</p>' : '') +
          (typeof d.alCompletarPerfil === 'function' ? '<button type="button" class="btn sm sec pn-boton" id="pnDatos" onclick="PistaNiveles.completarDatos()">Completar mis datos</button>' : ''));
      }
    }
    filas.push('<p><b>Paga cada crédito, y mejor en la fecha.</b> ' +
      (cents > 0 ? 'De cada $1.000 de costo que pagas, <b class="pn-c">' + COP(cents * 10) + '</b> se vuelven garantía. ' : 'Cada peso de costo que pagas suma garantía. ') +
      'Pagar tarde no te la quita, pero el recargo por atraso no suma nada.</p>');
    var porUno = Number(m.GARANTIA_POR_REFERIDO) || 0;
    if (porUno > 0) {
      var tope = !(m.TOPE_REFERIDOS && m.TOPE_REFERIDOS.hasta_la_ganada === false);
      filas.push('<p><b>Invita a alguien de confianza.</b> <b class="pn-c">' + COP(porUno) + '</b> de garantía por cada persona, cuando pague su crédito' +
        (tope ? ', y hasta la garantía que tú ya te ganaste pagando' : '') + '.</p>' +
        (typeof d.alInvitar === 'function' ? '<button type="button" class="btn sm sec pn-boton" id="pnInvitar" onclick="PistaNiveles.invitar()">Invitar a alguien</button>' : ''));
    }
    return '<div class="etq">Cómo subir más rápido</div><ol class="pn-sube">' + filas.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ol>' +
      '<p class="pn-pie-s">Pedir más no te sube: te sube lo que pagas.</p>';
  }
  /* Lo que mueve: PAGAR. Y los pagos de este mundo, cada uno con su piedra.
     (18-nov: el párrafo de arriba pasó a ser «Cómo subir más rápido».) */
  /* 23-nov-2026 — aquí iban también «Tus pagos en <mundo>», los últimos cuatro
     del mundo de hoy. Se fueron a «Tu recorrido» (tarjetaRecorrido), que los
     trae TODOS y en el mundo donde se hicieron: dos listas de los mismos pagos
     en la misma pantalla era justo lo que Joan pidió juntar. */
  function tarjetaMueve(e, d) {
    return '<div class="card">' + comoSubir(d) + '</div>';
  }

  /* ======================= TU RECORRIDO: EL HISTORIAL, POR MUNDO =======================
     23-nov-2026. Joan: «que desde la pista se vea el historial que tiene y en
     que pista estaba ese historial». Es la lista de `recorrido` (los créditos
     pagados, con la garantía en que quedó la cuenta al pagar cada uno,
     reconstruida hacia atrás), agrupada por el mundo en que cayó cada pago:
     el de hoy abierto y arriba, los de antes plegados debajo.
       · Cada pago dice su fecha, si fue en la fecha (la piedra con sello), lo
         que le sumó a la garantía y en cuánto quedó. En PESOS: el cliente no ve
         porcentajes.
       · La garantía se nombra como lo que es. Ni plata, ni ahorro, ni saldo:
         es lo que le deja pedir más, y lo construyó pagando.
       · No hay ninguna frase que invite a pedir: aquí solo se ve lo pagado.
       · Los créditos abiertos no salen: no son un pago todavía, y lo que falta
         de ellos está en Inicio.
     Va sobre laca, como todo lo que es del socio: ahí vive el amarillo. */
  var MAX_FILAS_REC = 6;   // por mundo, a la vista; los de antes van plegados
  function filaRecorrido(p, n, anio) {
    return '<li class="pn-rec-f' + (p.en_fecha ? ' pn-si' : '') + '">' +
      '<span class="pn-rec-p">' + piedraSvg(p.en_fecha) + '</span>' +
      '<span class="pn-rec-t"><b>Pago ' + n + '</b><i>' + esc(fechaCorta(p.fecha, anio) || '—') + (p.en_fecha ? ' · en la fecha' : '') + '</i></span>' +
      '<span class="pn-rec-v"><b>+' + COP(p.dejo) + '</b><i>quedaste en ' + COP(p.quedo) + '</i></span></li>';
  }
  function tarjetaRecorrido(e, rec) {
    var cab = '<div class="card laca pn-rec" id="pnRecorrido"><div class="pn-rec-cab"><div class="etq">Tu recorrido</div>';
    if (!rec.length) {
      return cab + '</div><p class="pn-vacio">Todavía no hay ningún pago. Aquí va a quedar cada crédito que pagues, con lo que le sumó a tu garantía; con sello, si lo pagas en la fecha.</p></div>';
    }
    var anio = String(rec[rec.length - 1].fecha || '').slice(0, 4), h = cab +
      '<button type="button" class="pn-rec-ver" id="pnVerRecorrido" onclick="PistaNiveles.repasar(true)">▶ Verlo en la pista</button></div>' +
      '<p class="pn-vacio">Cada pago, en el mundo donde lo hiciste, y lo que le sumó a tu garantía.</p>';
    /* del mundo de hoy hacia atrás; dentro de cada mundo, el pago más nuevo arriba */
    for (var k = e.i; k >= 0; k--) {
      var fila = e.filas[k], suyos = [];
      rec.forEach(function (p, n) { if (p.nivel === fila.nivel) suyos.push({ p: p, n: n + 1 }); });
      if (!suyos.length) continue;
      suyos.reverse();
      var enF = suyos.filter(function (x) { return x.p.en_fecha; }).length;
      var titulo = medalla(fila.nivel, 'pn-chica') + '<span class="pn-rec-mt"><b>' + esc(fila.nombre) + '</b><i>' +
        (k === e.i ? 'aquí estás' : 'ya lo pasaste') + ' · ' + suyos.length + ' pago' + (suyos.length !== 1 ? 's' : '') +
        ', ' + enF + ' en la fecha</i></span>';
      var ver = suyos.slice(0, MAX_FILAS_REC), antes = suyos.slice(MAX_FILAS_REC);
      var lista = '<ol class="pn-rec-l">' + ver.map(function (x) { return filaRecorrido(x.p, x.n, anio); }).join('') + '</ol>' +
        (antes.length
          ? '<details class="pn-rec-mas"><summary>' + (antes.length === 1 ? 'Ver el pago de antes en ' : 'Ver los ' + antes.length + ' de antes en ') + esc(fila.nombre) + '</summary><ol class="pn-rec-l">' +
            antes.map(function (x) { return filaRecorrido(x.p, x.n, anio); }).join('') + '</ol></details>'
          : '');
      h += k === e.i
        ? '<div class="pn-rec-m ' + MUNDOS[fila.nivel].clase + '"><div class="pn-rec-s">' + titulo + '</div>' + lista + '</div>'
        : '<details class="pn-rec-m ' + MUNDOS[fila.nivel].clase + '"><summary class="pn-rec-s">' + titulo + '</summary>' + lista + '</details>';
    }
    var g0 = Math.max(0, rec[0].quedo - rec[0].dejo);
    return h + '<p class="pn-rec-pie">' + (g0 > 0 ? 'Arrancaste en ' + COP(g0) + '. ' : '') +
      'Hoy vas en <b>' + COP(e.garantia) + '</b>: lo construiste pagando. Pagar en la fecha le pone sello a la piedra.</p></div>';
  }

  /* ======================= EL REPASO: EL CARRITO RECORRE LA HISTORIA =======================
     23-nov-2026. Joan: «cada vez que entre la persona a la pista se vea una
     animacion de un pequeño carrito pasando por la pista como mostrando el
     historial y que en cada parada sea un pago y pare por un segundo mostrando
     ese pago con lo que le sumo de garantia… que le de esperanza».

     El carrito sale del mundo donde arrancó, para en cada pago y cruza la meta
     de cada mundo hasta llegar a donde está hoy. La estela azul se va
     alargando detrás, y cada piedra se enciende cuando pasa.

     LO QUE SE CUIDA:
       · EL PLAN ES UNA CUENTA APARTE (planRepaso), sin pantalla: qué mundos,
         qué pagos y dónde para. Así se prueba sin navegador, y lo que mueve el
         carrito no decide nada.
       · NO SE ALARGA: para un segundo en los últimos MAX_PARADAS pagos; por los
         de antes pasa encendiéndolos sin detenerse, y los mundos donde no para
         los recorre más rápido. Con cuarenta pagos dura unos segundos más que
         con ocho, no cinco veces más, y siempre hay «Saltar».
       · SOLO AL ENTRAR a la pestaña desde otra (lo dice la página en `montar`),
         no cada vez que la pestaña se repinta por dentro. Y nunca encima de la
         llegada a un mundo, que es otra hoja.
       · CON «MENOS MOVIMIENTO» NO CORRE: se ve la pista ya recorrida, como
         siempre. Tampoco donde no hay con qué animar (el banco de pruebas).
       · EN UN TELÉFONO BARATO: por cuadro cambia un transform y el trazado de
         la estela, dentro de la capa de la isla, que ya se repinta por el
         pulso del marcador. Sin filtros. Los tiempos van por el reloj del
         navegador, no por cuadros: en un teléfono lento se ve a saltos, pero
         dura lo mismo.
       · AL SALIR de la pestaña se detiene (la página llama a `detener`), y si
         la pantalla se repintó por debajo, se da cuenta sola y no toca nada.
       · LAS PALABRAS: lo que sumó cada pago a su garantía, en pesos. No invita
         a pedir, no promete nada y no llama a la garantía plata ni ahorro. */
  var MAX_PARADAS = 8, MS_PARADA = 1000, MS_FRENO = 260, MS_VUELTA = 2200, MS_VUELTA_RAPIDA = 1200, MS_CAMBIO = 900, MS_LLEGADA = 2600, MS_ARRANQUE = 350;
  /* El carrito va más grande que su tamaño «real» sobre la pista: a escala no
     se vería en un teléfono, y es el protagonista del repaso. */
  var ESCALA_CARRO = 2.3;
  function planRepaso(e, rec) {
    rec = rec || [];
    if (!e || !e.filas || !rec.length) return { mundos: [], pagos: 0, paradas: 0, arranca: 0 };
    var f = e.filas, g0 = Math.max(0, rec[0].quedo - rec[0].dejo), n0 = motor().nivelPorGarantia(g0), i0 = 0, k;
    for (k = 0; k < f.length; k++) if (f[k].nivel === n0) i0 = k;
    if (i0 > e.i) i0 = e.i;   // un ajuste pudo bajarla: nunca se arranca más arriba de donde está hoy
    var desdeParada = Math.max(0, rec.length - MAX_PARADAS), mundos = [];
    for (k = i0; k <= e.i; k++) {
      var fila = f[k], hoy = k === e.i, pagos = [];
      rec.forEach(function (p, n) {
        if (p.nivel !== fila.nivel) return;
        pagos.push({ n: n + 1, f: fraccionEn(fila, p.quedo), dejo: p.dejo, quedo: p.quedo, fecha: p.fecha,
                     en_fecha: !!p.en_fecha, para: n >= desdeParada });
      });
      /* un mundo donde no para en ningún pago se recorre más rápido: son los
         de más atrás de una historia larga */
      mundos.push({ nivel: fila.nivel, nombre: fila.nombre, i: k, de: f.length,
        rapido: !pagos.some(function (x) { return x.para; }),
        desde: k === i0 ? fraccionEn(fila, g0) : 0, hasta: hoy ? e.fraccion : 1, hoy: hoy,
        sigue: f[k + 1] ? f[k + 1].nombre : null, pagos: pagos });
    }
    return { mundos: mundos, pagos: rec.length, paradas: rec.length - desdeParada, arranca: g0,
             anio: String(rec[rec.length - 1].fecha || '').slice(0, 4) };
  }
  /* Lo que tarda un tramo: proporcional a lo que recorre. Para llegar a una
     PARADA nunca menos de MS_FRENO (un salto seco no se ve); por un pago donde
     no para, pasa de largo sin perder tiempo. */
  function msTramo(w, df, frena) {
    var ms = Math.round((w && w.rapido ? MS_VUELTA_RAPIDA : MS_VUELTA) * Math.max(0, df));
    return frena ? Math.max(MS_FRENO, ms) : ms;
  }
  /* Cuánto dura, en milisegundos: para la prueba que cuida que no se alargue. */
  function duracionRepaso(plan) {
    var ms = 0;
    (plan.mundos || []).forEach(function (w) {
      var f = w.desde;
      ms += MS_ARRANQUE;
      w.pagos.forEach(function (p) { var a = Math.max(f, p.f); ms += msTramo(w, a - f, p.para) + (p.para ? MS_PARADA : 0); f = a; });
      ms += msTramo(w, w.hasta - f, true) + (w.hoy ? 0 : MS_CAMBIO);
    });
    return ms + MS_LLEGADA;
  }
  /* Los rótulos del repaso. Texto de aquí, con las cifras del plan. */
  function rotuloMundo(w) {
    return '<div class="pn-rp-m ' + MUNDOS[w.nivel].clase + '">' + medalla(w.nivel, 'pn-chica') +
      '<span>Mundo ' + (w.i + 1) + ' de ' + w.de + '</span><b>' + esc(w.nombre) + '</b></div>';
  }
  function rotuloPago(w, p, plan) {
    return rotuloMundo(w) + '<div class="pn-rp-p"><b>+' + COP(p.dejo) + '</b><span>a tu garantía</span>' +
      '<i>Pago ' + p.n + ' de ' + plan.pagos + ' · ' + esc(fechaCorta(p.fecha, plan.anio) || '') + (p.en_fecha ? ' · en la fecha' : '') + '</i></div>';
  }
  function rotuloCruce(w) {
    return rotuloMundo(w) + '<div class="pn-rp-p pn-rp-cruce"><b>¡Pasaste a ' + esc(w.sigue || '') + '!</b></div>';
  }
  function rotuloLlegada(e) {
    return '<div class="pn-rp-p pn-rp-fin"><b>' + COP(e.garantia) + '</b><span>de garantía hoy</span>' +
      '<i>La construiste pago a pago' + (e.sig ? ', y sigues hacia ' + esc(e.sig.nombre) : '') + '.</i></div>';
  }

  var RP = null;   // el repaso en curso, o null
  function reduceMovimiento() {
    try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (x) { return false; }
  }
  function reloj() { return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : 0; }
  /* ¿Siguen en la pantalla las cajas con las que arrancó? Si la pestaña se
     repintó (otra pestaña, una sesión que venció), no: y entonces no se toca
     nada, porque lo que hay ahora es de otra pintada. */
  function sigueAhi(r) {
    var d = documento();
    return !!(r && r.vivo && d && d.getElementById('pnEscena') === r.esc);
  }
  function escenaDe(w) {
    var H0 = HERO, op = { cielo: H0.op.cielo, margenAbajo: H0.op.margenAbajo, f: Math.max(w.hasta, 0.02), nombre: H0.op.nombre,
      carro: true, sinMarcador: true,
      piedras: w.pagos.map(function (p) { return { f: p.f, sello: p.en_fecha }; }) };
    if (w.sigue) op.meta = 'Meta · ' + w.sigue;
    if (w.hoy) { op.cosas = H0.op.cosas; op.sigue = H0.op.sigue; op.navidad = H0.op.navidad; }
    return op;
  }
  /* El carrito y la punta de la estela en la fracción f (0 a 1) de la vuelta. */
  function ponerEn(r, f) {
    var N = r.ruta.length, x = Math.max(0, Math.min(N, f * N)), i = Math.min(N - 1, Math.floor(x)), t = x - i;
    var a = r.ruta[i], b = r.ruta[(i + 1) % N];
    var px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, k = (a[2] + (b[2] - a[2]) * t) * ESCALA_CARRO;
    if (Math.abs(b[0] - a[0]) > 0.05) r.mira = b[0] >= a[0] ? 1 : -1;
    if (r.carro) r.carro.setAttribute('transform', 'translate(' + r1(px) + ' ' + r1(py) + ') scale(' + (r.mira * k).toFixed(3) + ' ' + k.toFixed(3) + ')');
    /* la placa del nombre va encima del carrito, derecha y sin salirse del dibujo */
    if (r.placa) {
      var medio = r.anchoPlaca / 2 + 4, nx = Math.max(medio, Math.min(HERO.W - medio, px));
      r.placa.setAttribute('transform', 'translate(' + r1(nx) + ' ' + r1(py - 13 * k - 6) + ')');
    }
    if (r.hecho) {
      var pts = [];
      for (var j = 0; j <= i; j++) pts.push(r1(r.ruta[j][0]) + ',' + r1(r.ruta[j][1]));
      pts.push(r1(px) + ',' + r1(py));
      if (pts.length < 2) pts.push(pts[0]);
      r.hecho.setAttribute('d', 'M' + pts.join(' L'));
    }
    /* las llamitas se encienden cuando el carrito ya pasó por su sitio */
    while (r.il < r.llamas.length && Number(r.llamas[r.il].getAttribute('data-i')) <= i) { r.llamas[r.il].setAttribute('class', 'pn-llama-s pn-ya'); r.il++; }
    r.f = f;
  }
  function correr(r, hasta, frena, alLlegar) {
    var desde = r.f, ms = msTramo(r.w, hasta - desde, frena), t0 = reloj();
    if (hasta <= desde || ms < 1) { if (hasta > desde) ponerEn(r, hasta); return alLlegar(); }
    (function cuadro() {
      if (!sigueAhi(r)) return;
      var u = Math.min(1, (reloj() - t0) / ms), suave = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      ponerEn(r, desde + (hasta - desde) * suave);
      if (u < 1) r.raf = requestAnimationFrame(cuadro); else alLlegar();
    })();
  }
  function espera(r, ms, sigue) { r.timer = setTimeout(function () { if (sigueAhi(r)) sigue(); }, ms); }
  function mundoDelRepaso(r) {
    r.im++;
    if (r.im >= r.plan.mundos.length) return llegada(r);
    var w = r.plan.mundos[r.im], H0 = HERO, op = escenaDe(w);
    r.esc.innerHTML = mundo(w.nivel, H0.W, H0.H, op);
    r.ruta = rutaDe(w.nivel, H0.W, H0.H, op);
    r.carro = r.esc.querySelector('.pn-carro'); r.hecho = r.esc.querySelector('[data-hecho]');
    r.placa = r.esc.querySelector('.pn-carro-n');
    r.anchoPlaca = Math.max(30, String(op.nombre || '').length * 6.3 + 16);
    r.piedras = r.esc.querySelectorAll('.pn-piedra'); r.llamas = r.esc.querySelectorAll('.pn-llama-s');
    r.il = 0; r.mira = 1; r.w = w; r.ip = 0;
    r.rp.innerHTML = rotuloMundo(w);
    ponerEn(r, w.desde);
    espera(r, MS_ARRANQUE, function () { pagoDelRepaso(r); });
  }
  function pagoDelRepaso(r) {
    var w = r.w;
    if (r.ip >= w.pagos.length) {
      return correr(r, w.hasta, true, function () {
        if (w.hoy) return llegada(r);
        r.rp.innerHTML = rotuloCruce(w);
        espera(r, MS_CAMBIO, function () { mundoDelRepaso(r); });
      });
    }
    var p = w.pagos[r.ip], k = r.ip;
    correr(r, Math.max(r.f, p.f), p.para, function () {
      if (r.piedras[k]) r.piedras[k].setAttribute('class', 'pn-piedra pn-ya');
      r.rp.innerHTML = rotuloPago(w, p, r.plan);
      r.ip++;
      /* donde no para, sigue de largo: la piedra se enciende y el rótulo
         cambia mientras pasa */
      if (p.para) espera(r, MS_PARADA, function () { pagoDelRepaso(r); }); else pagoDelRepaso(r);
    });
  }
  /* El final, llegue como llegue (corriendo o con «Saltar»): la escena de hoy,
     entera y quieta, como la pinta `heroe`. */
  function llegada(r, sinRotulo) {
    if (!r || !r.vivo) return;
    r.vivo = false;
    try { if (r.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(r.raf); } catch (x) { /* nada */ }
    clearTimeout(r.timer);
    var d = documento(), H0 = HERO;
    if (RP === r) RP = null;
    if (!d || !H0 || d.getElementById('pnEscena') !== r.esc) return;
    r.esc.innerHTML = mundo(H0.e.nivel, H0.W, H0.H, H0.op);
    r.hero.classList.remove('pn-repasando');
    if (sinRotulo) { r.rp.innerHTML = ''; return; }
    r.rp.innerHTML = rotuloLlegada(H0.e);
    r.hero.classList.add('pn-llego');
    setTimeout(function () {
      var dd = documento();
      if (!dd || dd.getElementById('pnEscena') !== r.esc || RP) return;
      r.hero.classList.remove('pn-llego'); r.rp.innerHTML = '';
    }, MS_LLEGADA);
  }
  /* Arranca el repaso. `aMano` es el botón «Verlo en la pista»: sube la página
     para que el mundo quede a la vista. Devuelve si arrancó. */
  function repasar(aMano) {
    var d = documento(), H0 = HERO;
    if (!d || !H0 || ABIERTA || reduceMovimiento()) return false;
    if (typeof requestAnimationFrame !== 'function' || typeof setTimeout !== 'function') return false;
    var plan = planRepaso(H0.e, REC);
    if (!plan.pagos || !plan.mundos.length) return false;
    var hero = d.getElementById('pnHero'), esc0 = d.getElementById('pnEscena'), rp = d.getElementById('pnRp');
    if (!hero || !esc0 || !rp || typeof esc0.querySelector !== 'function' || !hero.classList) return false;
    detener();
    if (aMano) { try { window.scrollTo(0, 0); } catch (x) { /* sin ventana no se sube */ } }
    RP = { plan: plan, im: -1, hero: hero, esc: esc0, rp: rp, vivo: true, f: 0, raf: 0, timer: 0, il: 0, llamas: [], piedras: [], mira: 1 };
    hero.classList.remove('pn-llego');
    hero.classList.add('pn-repasando');
    mundoDelRepaso(RP);
    /* un instante después: la página sube al tope al cambiar de pestaña, y
       esto va cuando ya subió */
    setTimeout(function () { acomodar(hero); }, 40);
    return true;
  }
  /* QUE EL RÓTULO SE VEA. El mundo es alto, y en un teléfono el rótulo de cada
     pago quedaba debajo de la barra de pestañas: se veía el carrito parar y no
     se leía por qué. Si el pie del mundo cae debajo de la barra, la página
     baja lo justo para que quede encima. Nunca sube, y en una pantalla donde
     ya cabe no hace nada. `nav` es la barra de la página; si no está, se mide
     contra el borde de la pantalla. */
  function acomodar(hero) {
    try {
      var d = documento(), alto = window.innerHeight || 0;
      if (!d || !alto || !hero || typeof hero.getBoundingClientRect !== 'function') return;
      var nav = d.getElementById('nav'), piso = alto - (nav && nav.offsetHeight ? nav.offsetHeight : 0) - 8;
      var baja = hero.getBoundingClientRect().bottom - piso;
      if (baja > 1) window.scrollBy(0, Math.round(baja));
    } catch (x) { /* sin ventana no se acomoda */ }
  }
  /* «Saltar»: al final, sin rótulo. */
  function saltar() { if (RP) llegada(RP, true); return true; }
  /* Lo llama la página al salir de la pestaña: se para sin tocar lo que haya. */
  function detener() {
    var r = RP; RP = null;
    if (!r) return;
    r.vivo = false;
    try { if (r.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(r.raf); } catch (x) { /* nada */ }
    clearTimeout(r.timer);
  }
  /* LO QUE ABRE CADA MUNDO (18-nov-2026). Joan: «para que el cliente vea hasta
     que nivel puede llegar y los beneficios». Solo lo que el motor YA hace, y
     leído del motor: el cupo es la garantía uno a uno hasta el techo
     (CUPO_MAXIMO), y el primer mundo arranca con el cupón de los datos
     (CUPON_KYC_MAXIMO). Nada de tasas más bajas ni regalos por nivel: el
     motor no los da. El boceto decía «y préstamo con garantía» en Oro; no va,
     porque ese préstamo no lo abre un mundo sino la garantía GANADA (el hito
     de abajo): un cliente puede estar en Oro sin haberla. */
  function abre(f) {
    var m = motor(), techo = Number(m.CUPO_MAXIMO) || 0;
    if (!(f.desde > 0)) return 'Tu cupo arranca con tus datos: hasta ' + COP(m.CUPON_KYC_MAXIMO);
    if (techo > 0 && f.desde >= techo) return 'Tu cupo llega al techo: ' + pegado(corto(techo));
    return 'Cupo desde ' + pegado(corto(f.desde));
  }
  /* «$400 mil» no se parte en dos renglones (en 320 px quedaba «mil» solo
     abajo). Es el carácter de espacio duro y no la entidad: corto() también
     escribe dentro de las imágenes, y un SVG suelto no conoce &nbsp;. Por eso
     va solo aquí, en lo que es HTML. */
  function pegado(s) { return String(s).replace(/ (mil|M)$/, '\u00A0$1'); }
  var CANDADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
  /* EL HITO DEL MILLÓN. Joan: «despues del primer millon en garantia inician
     beneficios como creditos a cuotas». En el motor eso ya existe: el préstamo
     con garantía, de MONTO_MINIMO_RESPALDADO para arriba, que solo respalda la
     garantía GANADA (la que se ganó pagando; el cupón de los datos y los
     referidos no cuentan). No es un mundo: va como hito entre el mundo donde
     se puede alcanzar y el siguiente. El ejemplo sale de
     simularPrestamoRespaldado, la misma cuenta de la calculadora, y se dice
     en pesos: el cliente no ve porcentajes (8-sep). Nada aquí invita a
     pedirlo: ni botón ni cifra de cuánto podría sacar. */
  function hitoMillon(d) {
    var m = motor(), min = Number(m.MONTO_MINIMO_RESPALDADO) || 0, ej = null;
    if (!(min > 0) || typeof m.simularPrestamoRespaldado !== 'function') return '';
    try { ej = m.simularPrestamoRespaldado(min, 4); } catch (x) { ej = null; }
    var h = '<div class="pn-hito"><div class="pn-hito-k">' + CANDADO + 'Con ' + COP(min) + ' de garantía ganada</div>' +
      '<p><b>Préstamo con garantía:</b> a cuotas mensuales fijas, de ' + m.PLAZO_RESPALDADO_MIN + ' a ' + m.PLAZO_RESPALDADO_MAX + ' meses.' +
      (ej ? ' Por ' + COP(min) + ' a 4 meses: cuotas de ' + COP(ej.cuota_fija) + ' y ' + COP(ej.costo_total) + ' de costo en total.' : '') + '</p>';
    var ganada = Number(d.ganada);
    if (d.ganada != null && isFinite(ganada)) {
      var libre = Number(d.respaldoLibre), sabeLibre = d.respaldoLibre != null && isFinite(libre), estado;
      if (sabeLibre && libre >= min) estado = 'Ya lo tienes abierto.';
      else if (ganada >= min) estado = 'Ya llegaste.' + (sabeLibre ? ' Hoy parte de tu garantía ganada respalda lo que debes; al pagarlo, se libera.' : '');
      else estado = 'Llevas <b>' + COP(ganada) + '</b> de garantía ganada. Te faltan ' + COP(min - ganada) + '.';
      h += '<div class="pn-hito-riel"><i style="width:' + Math.max(0, Math.min(100, ganada / min * 100)).toFixed(1) + '%"></i></div>' +
        '<div class="pn-hito-va">' + estado + '</div>';
    }
    return h + '</div>';
  }
  /* LOS NUEVE MUNDOS, Y LO QUE ABRE CADA UNO (18-nov-2026: era una tira de
     medallas que había que deslizar, con el último velado). Todos a la vista,
     con su título y lo que abren. De lo que viene solo se dice cuánto falta
     para el SIGUIENTE: un «te faltan doce millones» no acerca a nadie, y a
     alguien lo empuja a pedir para llegar. Cada fila abre la hoja del mundo. */
  function tarjetaMundos(e, d) {
    var M = misiones(), T = (M && M.TITULOS) || {}, n = e.filas.length, min = Number(motor().MONTO_MINIMO_RESPALDADO) || 0, hito = false;
    var h = '<div class="card pn-mapa"><div class="etq">Los ' + n + ' mundos, y lo que abre cada uno</div>';
    e.filas.forEach(function (f, i) {
      if (!hito && min > 0 && f.desde > min) { h += hitoMillon(d || {}); hito = true; }
      var est = i < e.i ? 'paso' : i === e.i ? 'aqui' : i === e.i + 1 ? 'sigue' : 'delante';
      var der = est === 'paso' ? '✓ pasaste' : est === 'aqui' ? 'aquí estás' : est === 'sigue' ? 'faltan<br>' + COP(e.faltan) : '';   // exacto: es la misma cifra de arriba
      h += '<button type="button" class="pn-fm pn-' + est + '" id="pnMundo' + i + '" onclick="PistaNiveles.abrir(\'' + f.nivel + '\')">' +
        '<span class="pn-fm-med">' + medalla(f.nivel, 'pn-media') + '</span>' +
        '<span class="pn-fm-txt"><span class="pn-fm-nom">' + esc(f.nombre) + ' <span class="pn-fm-lema">· ' + esc(MUNDOS[f.nivel].lema) + '</span></span>' +
          '<span class="pn-fm-abre">' + esc(abre(f)) + '</span>' +
          (T[f.nivel] ? '<span class="pn-fm-tit">Título: ' + esc(T[f.nivel]) + '</span>' : '') + '</span>' +
        '<span class="pn-fm-der">' + der + '</span></button>';
    });
    if (!hito) h += hitoMillon(d || {});
    /* «Atrasarte no te baja», y no «nadie baja»: la promesa de que el nivel
       nunca baja quedó derogada el 2-sep (si un ajuste baja la garantía, el
       nivel baja con ella). Lo que sí es cierto es lo de la mora. */
    return h + '<p class="pn-pie-s">Atrasarte no te baja de mundo: te sube lo que pagas.</p></div>';
  }

  /* LO QUE LA PÁGINA LLAMA. d = { nombre, garantia, creditos, frase, centavos },
     y desde el 18-nov también: ganada y respaldoLibre (el hito del millón),
     alInvitar y alCompletarPerfil (los botones de «Cómo subir más rápido»).
     Devuelve el HTML de la pestaña; no toca el documento. */
  function vista(d) {
    d = d || {};
    detener();   // si venía un repaso de la pintada anterior, se queda ahí
    ULTIMO = d; ABIERTA = null; VUELVE_A = null; MI = null; AL_CERRAR = null; HERO = null; REC = [];
    if (!motor()) return '';
    if (!cssLlego()) {
      return '<div class="card"><p class="muted" style="margin:0">La pista no terminó de bajar. Con señal, cierra la app y vuelve a abrirla.</p></div>';
    }
    var e = donde(d.garantia), rec = recorrido(e.garantia, d.creditos);
    var aqui = rec.filter(function (p) { return p.nivel === e.nivel; });
    /* Las misiones van DENTRO de la pista (decisión D7-A del 16-nov): las de
       la quincena bajo la isla, y las de una vez, la racha y el álbum bajo
       los pagos. Si su archivo no llegó, todo sigue como antes. */
    var M = misiones(), mi = null;
    try { mi = M ? M.paraLaPista(d, e, rec) : null; } catch (x) { mi = null; }
    MI = mi; REC = rec;
    /* En temporada, «Diciembre puntual» y la tarjeta de Navidad van debajo de
       las misiones de la quincena (18-nov); cada una decide si sale. */
    var temporada = mi ? (typeof M.tarjetaDiciembre === 'function' ? M.tarjetaDiciembre(mi) : '') +
      (typeof M.tarjetaNavidad === 'function' ? M.tarjetaNavidad(mi) : '') : '';
    /* 23-nov-2026 — «Tu recorrido» va pegado al mundo: es el historial de esa
       misma pista, y lo que el carrito acaba de contar. */
    return heroe(e, d, aqui, mi) + tarjetaRecorrido(e, rec) + (mi ? M.tarjetaQuincena(mi) : '') + temporada + tarjetaMueve(e, d) +
      (mi ? M.tarjetaUnaVez(mi) + M.tarjetaRachas(mi) + M.tarjetaIslas(mi) : '') + tarjetaMundos(e, d);
  }

  /* La hoja de un mundo. Del que SIGUE se dice cuánto falta; de los de más
     allá solo dónde empiezan: un «te faltan doce millones» no acerca a nadie,
     y a alguien lo empuja a pedir para llegar. */
  function hoja(nivel) {
    var d = ULTIMO || {}, e = donde(d.garantia), i = -1;
    e.filas.forEach(function (f, k) { if (f.nivel === nivel) i = k; });
    if (i < 0 || !MUNDOS[nivel]) return '';
    var f = e.filas[i], mu = MUNDOS[nivel], cents = centavosDe(d);
    var est = i < e.i ? 'paso' : i === e.i ? 'aqui' : i === e.i + 1 ? 'sigue' : 'delante';
    var rotulo = { paso: 'ya lo pasaste', aqui: 'aquí estás', sigue: 'el que sigue', delante: 'por delante' }[est];
    var W = Math.min(520, anchoPantalla() + 32);
    var h = '<div class="pn-velo" onclick="PistaNiveles.cerrar()"></div>' +
      '<div class="pn-hoja" role="dialog" aria-modal="true" aria-labelledby="pnHojaTit">' +
      '<div class="pn-lienzo-h ' + mu.clase + '">' +
        mundo(nivel, W, 176, { horizonte: 0.5, cielo: 0.1, margenAbajo: 12, sinIslotes: true, velado: est === 'sigue' || est === 'delante' }) +
        '<div class="pn-asa"></div></div>' +
      '<div class="pn-cuerpo-h"><span class="pn-borde-medalla">' + medalla(nivel, 'pn-grande-m') + '</span>' +
      '<div class="pn-titulo-h"><div class="etq">Mundo ' + (i + 1) + ' de ' + e.filas.length + ' · ' + rotulo + '</div>' +
      '<h3 id="pnHojaTit">' + esc(f.nombre) + '</h3><div class="pn-lema-h">' + esc(mu.lema) + '</div></div>';
    var tramo = f.hasta != null
      ? 'de ' + COP(f.desde) + ' a ' + COP(f.hasta) + ' de garantía'
      : 'de ' + COP(f.desde) + ' de garantía en adelante';
    if (est === 'sigue') {
      h += '<div class="pn-bloque pn-dos"><div><div class="pn-k">Te faltan</div><div class="pn-falta oro-tinta">' + COP(e.faltan) + '</div>' +
        '<div class="muted pn-nota">de garantía</div></div>' +
        '<div><div class="pn-k">Empieza en</div><div class="pn-falta2">' + COP(f.desde) + '</div>' +
        '<div class="muted pn-nota">tú vas en ' + COP(e.garantia) + '</div></div></div>';
    } else if (est === 'delante') {
      h += '<div class="pn-bloque"><div class="pn-k">Empieza en</div><div class="pn-falta2">' + COP(f.desde) + '</div>' +
        '<div class="muted pn-nota">de garantía. Tú vas en ' + COP(e.garantia) + '.</div></div>';
    } else if (est === 'aqui') {
      h += '<div class="pn-bloque"><div class="pn-k">Tu mundo de hoy</div><p>Va ' + tramo + '. Tú vas en <b>' + COP(e.garantia) + '</b>.</p></div>';
    } else {
      h += '<div class="pn-bloque"><div class="pn-k">Ya lo pasaste</div><p>Iba ' + tramo + '. Tú vas en <b>' + COP(e.garantia) + '</b>.</p></div>';
    }
    /* lo que abre (18-nov): la misma frase de la tarjeta de los mundos, y el título */
    var T = (misiones() && misiones().TITULOS) || {};
    h += '<div class="pn-bloque"><div class="pn-k">' + (i === e.filas.length - 1 ? 'Lo que hay allá' : 'Lo que abre') + '</div><p>' + esc(abre(f)) + '.' +
      (T[nivel] ? ' Título: <b>' + esc(T[nivel]) + '</b>.' : '') + '</p></div>';
    if (est !== 'paso') {
      h += '<div class="pn-bloque"><div class="pn-k">' + (est === 'aqui' ? 'Qué te hace avanzar' : 'Qué te acerca') + '</div><p>Pagar. ' +
        (cents > 0 ? 'De cada peso de costo que pagas, ' + cents + ' centavos se vuelven garantía. ' : '') + 'Pedir no suma.</p></div>';
    }
    if (est === 'sigue' || est === 'delante') {
      h += '<div class="pn-bloque"><div class="pn-k">Qué cambia al llegar</div><p>' + esc(queCambia(e.actual, f)) + '</p></div>';
    }
    return h + '<button type="button" class="btn sec pn-cerrar" id="pnCerrar" onclick="PistaNiveles.cerrar()">Cerrar</button></div></div>';
  }
  /* Abrir y cerrar la hoja. Se pinta en #pnHoja, una caja que la página tiene
     puesta FUERA del panel de la pestaña: ese panel entra con una animación
     que usa transform, y mientras dura, lo «fijo» de adentro se ancla al panel
     y no a la pantalla (la hoja abierta en ese instante aparecía al final de
     la página). Al cerrar, el foco vuelve a la medalla que la abrió.
     NO se frena el deslizamiento del fondo con un estilo en <body>: si la
     sesión vence con la hoja abierta, la pantalla de entrar quedaba sin poder
     deslizarse. El velo ya recibe los toques y la hoja no le pasa su
     deslizamiento al fondo (overscroll-behavior, en la hoja de estilos). */
  function abrir(nivel) {
    if (!ULTIMO) return false;
    return abrirCon(hoja(nivel), nivel);
  }
  /* Cualquier hoja o pantalla encima de la pista va por aquí, en #pnHoja: la
     de un mundo, la del personaje y la llegada (app/misiones.js). `alCerrar`
     corre al cerrarla, de la manera que sea (botón, velo o Escape). */
  function abrirCon(html, cual, alCerrar) {
    var d = documento(), caja = d && d.getElementById('pnHoja');
    if (!caja || !html) return false;
    caja.innerHTML = html;
    ABIERTA = cual;
    AL_CERRAR = typeof alCerrar === 'function' ? alCerrar : null;
    try {
      VUELVE_A = d.activeElement && d.activeElement.id ? d.activeElement.id : null;
      /* sin correr la página: la hoja ya está a la vista, abajo */
      var b = d.getElementById('pnCerrar'); if (b && b.focus) b.focus({ preventScroll: true });
    } catch (e) { /* sin foco no deja de abrirse */ }
    return true;
  }
  function cerrar() {
    var d = documento(), caja = d && d.getElementById('pnHoja');
    if (caja) caja.innerHTML = '';
    ABIERTA = null;
    var despues = AL_CERRAR; AL_CERRAR = null;
    try {
      var v = VUELVE_A && d.getElementById(VUELVE_A); if (v && v.focus) v.focus({ preventScroll: true });
    } catch (e) { /* nada */ }
    VUELVE_A = null;
    if (despues) despues();
  }
  /* Los botones de «Cómo subir más rápido» (18-nov) llaman a la página: la
     Pista no sabe abrir el perfil ni WhatsApp, y no tiene por qué saber. */
  function completarDatos() { var d = ULTIMO; if (d && typeof d.alCompletarPerfil === 'function') { d.alCompletarPerfil(); return true; } return false; }
  function invitar() { var d = ULTIMO; if (d && typeof d.alInvitar === 'function') { d.alInvitar(); return true; } return false; }
  /* Lo que la página llama DESPUÉS de pintar la pestaña: las misiones anotan
     lo suyo en el teléfono y, si llegó a un mundo nuevo, sale la llegada. */
  /* 23-nov-2026 — y si la página dice que el cliente viene ENTRANDO a la
     pestaña (`o.entrando`), arranca el repaso del carrito. Después de las
     misiones: si salió la llegada a un mundo, esa hoja manda y el repaso no
     corre encima (lo puede ver después con «Verlo en la pista»). */
  function montar(o) {
    var M = misiones(), r = (M && MI) ? M.montar(MI) : null;
    if (o && o.entrando) { try { repasar(false); } catch (x) { detener(); } }
    return r;
  }
  /* Escape cierra la hoja, como cualquier ventana. Un solo oyente, puesto al
     cargar; donde no hay documento (una prueba que pide el archivo a secas),
     no se pone. */
  (function () {
    var d = documento();
    if (!d || typeof d.addEventListener !== 'function') return;
    d.addEventListener('keydown', function (e) {
      if (ABIERTA && e && (e.key === 'Escape' || e.keyCode === 27)) cerrar();
    });
  })();

  return {
    VERSION: '2026-11-23',
    vista: vista, abrir: abrir, cerrar: cerrar, abrirCon: abrirCon, montar: montar,
    /* 23-nov-2026: el recorrido por mundo y el repaso del carrito */
    repasar: repasar, saltar: saltar, detener: detener, repasando: function () { return !!RP; },
    planRepaso: planRepaso, duracionRepaso: duracionRepaso, rutaDe: rutaDe, primerNombre: primerNombre,
    tarjetaRecorrido: tarjetaRecorrido, ELIXIR: ELIXIR, MAX_PARADAS: MAX_PARADAS, MAX_LLAMAS: MAX_LLAMAS,
    MAX_FILAS_REC: MAX_FILAS_REC, MS_PARADA: MS_PARADA,
    completarDatos: completarDatos, invitar: invitar,
    /* Para las pruebas, y para quien quiera saber en qué va. */
    hoja: hoja, donde: donde, recorrido: recorrido, queCambia: queCambia, enFecha: enFecha,
    muestras: muestras, mundo: mundo, medalla: medalla,
    abierta: function () { return ABIERTA; },
    MUNDOS: MUNDOS, PALETA: PALETA, ISLA: ISLA, CIRCUITOS: CIRCUITOS, GLIFOS: GLIFOS,
    MONUMENTO: MONUMENTO, ADORNOS: ADORNOS, TEXTURA: TEXTURA, MAX_SELLOS: MAX_SELLOS,
    /* lo que construyen las estrellas de las misiones (app/misiones.js) */
    COSAS: COSAS, ORDEN_COSAS: ORDEN_COSAS, MAX_COSAS: MAX_COSAS, sitios: sitios,
    /* 18-nov: la Pista completa (lo que abre cada mundo, cómo subir, el último
       mundo a la vista, luz y vida, y el árbol de «Diciembre puntual») */
    abre: abre, hitoMillon: hitoMillon, comoSubir: comoSubir, METAL: METAL, medallaEn: medallaEn,
    luzYVida: luzYVida, sitioArbol: sitioArbol, ARBOL_NAVIDAD: ARBOL_NAVIDAD
  };
});
