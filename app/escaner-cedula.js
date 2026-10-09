/* ============================================================================
 * EL ESCÁNER DE LA CÉDULA — la parte que se puede probar sin cámara
 * 21 de septiembre de 2026.
 *
 * Joan: «al tomar la foto de la cédula la página lo devuelve al primer paso»,
 * «la foto es muy aburrida, quiero que parezca que la cámara escanea la
 * cédula», «la información debe poderse rellenar automáticamente».
 *
 * Las tres quejas tienen la misma raíz: la cédula se tomaba con la cámara DEL
 * SISTEMA (<input type=file capture>). Eso saca al cliente de la página, y en
 * Android eso significa que el navegador queda en segundo plano justo cuando
 * más memoria hace falta: el sistema lo mata, y al volver la pestaña se
 * restaura con su dirección pero con un sessionStorage NUEVO (Android nunca
 * lo restaura: Chromium fuerza kClearDiskStateOnOpen). Y el archivo que la
 * cámara devolvía murió con el proceso: la foto nunca llega.
 *
 * La salida es no salir: la cámara EN VIVO dentro de la página (getUserMedia,
 * como ya hace el paso del rostro), un marco con forma de cédula, y el código
 * de barras PDF417 del respaldo leído del video ANTES de disparar. La lectura
 * es la confirmación de que la foto sirve: un código desenfocado no se lee.
 * Y como se lee en vivo y de cerca, el autollenado —que hoy fallaba con la
 * foto lejana o movida— pasa a ser lo normal.
 *
 * ESTE ARCHIVO NO TOCA LA CÁMARA NI EL DOM. Trae lo que se puede decidir con
 * números: si el cuadro está quieto y con luz, dónde va el marco, cómo se
 * decodifica UNA vez sin bucles, y de quién son las fotos guardadas. Lo que
 * necesita un <video> vive en play/index.html y solo se verifica en un
 * teléfono. Lo que está acá se prueba con cuadros y códigos fabricados
 * (pruebas/escaner-cedula.test.js, con pruebas/fabrica-pdf417.js).
 *
 * MEDIDO ANTES DE ESCRIBIRLO (con el zxing.min.js del repo, sin navegador):
 *   · el lector PDF417 lee desde ~2 px por módulo nítido, 2,5 con el desenfoque
 *     normal de un celular, 3 para tener margen; y solo tolera 1-4° de
 *     inclinación, así que el marco tiene que ayudar a poner la cédula recta;
 *   · lee a 0° y 180°, NUNCA a 90°: si la cédula va de pie (teléfono vertical),
 *     el recorte se gira antes de decodificar;
 *   · `decodeFromImageUrl` de ZXing reintenta a 0 ms PARA SIEMPRE cuando el
 *     código se ve pero no se corrige (ChecksumException): 21 mapas de bits de
 *     10 MB en 300 ms, y la promesa nunca vuelve. Era el camino vivo hasta hoy.
 *     Acá se decodifica por la ruta pura: luminancias → binarizador → lector,
 *     UNA vez, y el que llama decide si vuelve a intentar.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.EscanerCedula = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* La tarjeta de la cédula: 85,6 × 54 mm (ISO/IEC 7810 ID-1). La proporción
     es lo único que se usa: el marco se dibuja con ella. */
  var ANCHO_MM = 85.6, ALTO_MM = 54;
  var PROPORCION = ANCHO_MM / ALTO_MM;

  /* Cuántas horas vale un registro a medias, y las fotos que le pertenecen.
     Antes las fotos eran «de esta pestaña» (sessionStorage), que en Android
     muere con la vuelta de la cámara: las fotos quedaban en el teléfono, la
     caja decía «Listo» y nunca subían. Ahora son «del celular X, tomadas a la
     hora Y». En un teléfono prestado, el siguiente se registra con OTRO
     celular, así que las fotos del anterior no se le pegan; y pasado un día
     tampoco, aunque sea el mismo. */
  var HORAS_REGISTRO_VIVO = 24;

  /* Los umbrales del encuadre, juntos y con nombre, porque son lo único que hay
     que calibrar mirando teléfonos de verdad. Si quedan estrictos, la persona
     se atasca con la cédula en la mano; si quedan flojos, se decodifica basura
     (que no pasa nada: el lector devuelve «no hay» y se sigue). Por eso el
     botón manual nunca desaparece. */
  var TARJETA = {
    LUZ_MIN: 32,          // más oscuro que esto es un bolsillo
    LUZ_MAX: 240,         // más claro es un reflejo o una ventana
    TEXTURA_MIN: 90,      // varianza del interior: una mesa lisa da casi cero
    VENTAJA_INTERIOR: 1.15, // la cédula tiene que tener MÁS detalle que lo de alrededor
    NITIDEZ_MIN: 9,       // gradiente medio del interior: borroso da poco
    MOVIMIENTO_MAX: 6,    // diferencia media entre dos cuadros seguidos
    CUADROS_FRENTE: 6,    // seguidos en verde antes de disparar el frente (~0,6 s)
    MS_ENTRE_LECTURAS: 250 // como mucho cuatro decodificaciones por segundo
  };

  function promedio(v, desde, hasta) {
    var t = 0, n = 0;
    for (var i = desde; i < hasta; i++) { t += v[i]; n++; }
    return n ? t / n : 0;
  }

  /**
   * Convierte los píxeles RGBA de un ImageData en luminancias 0..255.
   * Los pesos son los del propio ZXing (306, 601, 117 >> 10): así lo que mide
   * la puerta es lo mismo que ve el lector.
   */
  function grisDeImageData(data, w, h) {
    /* El gris nace en el MISMO mundo que los píxeles: en el banco de pruebas la
       página corre en un contexto aparte, y ZXing (que vive allá) pregunta
       `instanceof Uint8ClampedArray` — un arreglo de este lado no lo pasa y lo
       trataría como píxeles RGB. En el navegador es todo un mundo y da igual. */
    var Tipo = (data && data.constructor && data.constructor.name === 'Uint8ClampedArray')
      ? data.constructor : Uint8ClampedArray;
    var n = w * h, g = new Tipo(n);
    for (var i = 0, j = 0; j < n; i += 4, j++) {
      g[j] = (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
    }
    return g;
  }

  /**
   * Mide un cuadro chico en gris que contiene el marco Y un anillo alrededor.
   * El interior es el rectángulo central (del 15 % al 85 % de cada lado); el
   * anillo es lo demás. Una cédula dentro del marco mete su detalle —texto,
   * código de barras, foto— en el interior; una mesa, una mano o el piso, no.
   *
   * @param gris   luminancias 0..255 de un cuadro de w×h
   * @param previa el mismo arreglo del cuadro anterior, o null
   * @returns {luz, textura, anillo, nitidez, movimiento, ok, falla}
   *          `falla` dice QUÉ falta: 'poca_luz' | 'mucha_luz' | 'sin_tarjeta' |
   *          'borrosa' | 'movimiento' | ''
   */
  function medirTarjeta(gris, previa, w, h, interior) {
    var g = gris || [], n = g.length;
    if (!n || !w || !h || w * h !== n || w < 16 || h < 8) {
      return { luz: 0, textura: 0, anillo: 0, nitidez: 0, movimiento: 999, ok: false, falla: 'sin_tarjeta' };
    }
    var x0 = Math.floor(w * 0.15), x1 = Math.ceil(w * 0.85);
    var y0 = Math.floor(h * 0.15), y1 = Math.ceil(h * 0.85);
    /* 8-oct-2026 — DÓNDE ESTÁ DE VERDAD EL MARCO DENTRO DEL CUADRO CHICO.
       El 15-85 % supone que alrededor del marco cupo su anillo entero. Con el
       RESPALDO no cabe: el marco de pie ocupa el 84 % del alto y el 92 % del
       ancho del video, el anillo se recorta contra el borde del cuadro, y el
       «interior» del 15-85 % quedaba corrido: el anillo se llenaba de cédula
       y de su borde contra la mesa, salía con más detalle que el interior, y
       el escáner decía «Pon la cédula dentro del marco» con la cédula
       perfecta en el marco. Como el respaldo solo intentaba leer en verde, ni
       siquiera llegaba a intentarlo. Quien recorta sabe dónde quedó el marco
       y ahora lo dice (`interior`, en píxeles del cuadro chico). */
    if (interior && interior.x1 > interior.x0 && interior.y1 > interior.y0) {
      x0 = Math.max(0, Math.floor(interior.x0)); x1 = Math.min(w, Math.ceil(interior.x1));
      y0 = Math.max(0, Math.floor(interior.y0)); y1 = Math.min(h, Math.ceil(interior.y1));
    }

    var si = 0, si2 = 0, ni = 0, sa = 0, sa2 = 0, na = 0, grad = 0, ng = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var v = g[y * w + x];
        if (y >= y0 && y < y1 && x >= x0 && x < x1) {
          si += v; si2 += v * v; ni++;
          if (x + 1 < x1) { grad += Math.abs(g[y * w + x + 1] - v); ng++; }
        } else { sa += v; sa2 += v * v; na++; }
      }
    }
    var luz = ni ? si / ni : 0;
    var textura = ni ? (si2 / ni) - luz * luz : 0;
    var anillo = na ? (sa2 / na) - (sa / na) * (sa / na) : 0;
    var nitidez = ng ? grad / ng : 0;
    var base = { luz: luz, textura: textura, anillo: anillo, nitidez: nitidez, movimiento: 999, ok: false };

    if (luz < TARJETA.LUZ_MIN) { base.falla = 'poca_luz'; return base; }
    if (luz > TARJETA.LUZ_MAX) { base.falla = 'mucha_luz'; return base; }
    /* Poco detalle adentro, o tanto adentro como afuera: no hay cédula en el
       marco, hay una mesa o un cuarto entero. */
    if (textura < TARJETA.TEXTURA_MIN || textura < anillo * TARJETA.VENTAJA_INTERIOR) {
      base.falla = 'sin_tarjeta'; return base;
    }
    /* Hay algo, pero sin bordes: está desenfocada o muy lejos. */
    if (nitidez < TARJETA.NITIDEZ_MIN) { base.falla = 'borrosa'; return base; }
    /* Sin cuadro anterior no se puede decir si está quieta: todavía no se sabe. */
    if (!previa || previa.length !== n) { base.falla = 'movimiento'; return base; }
    var dif = 0;
    for (var i = 0; i < n; i++) dif += Math.abs(g[i] - previa[i]);
    base.movimiento = dif / n;
    if (base.movimiento > TARJETA.MOVIMIENTO_MAX) { base.falla = 'movimiento'; return base; }
    base.ok = true; base.falla = '';
    return base;
  }

  /* Lo que la persona lee. Cada frase dice qué hacer, no qué pasó. */
  var TEXTO_TARJETA = {
    poca_luz: 'Busca un sitio con más luz',
    mucha_luz: 'Hay un reflejo: inclínala un poco',
    sin_tarjeta: 'Pon la cédula dentro del marco',
    borrosa: 'Acércala un poco y espera el enfoque',
    movimiento: 'Quieta…',
    '': 'Leyendo…'
  };
  function textoDeTarjeta(m) {
    if (!m) return TEXTO_TARJETA.sin_tarjeta;
    return TEXTO_TARJETA[m.falla] !== undefined ? TEXTO_TARJETA[m.falla] : TEXTO_TARJETA.sin_tarjeta;
  }

  /**
   * Dónde va el marco de la cédula dentro de un cuadro de w×h.
   *
   * EL RESPALDO VA DE PIE en un teléfono vertical (su lado largo sobre el lado
   * largo del cuadro): así el código de barras ocupa ~85 % de 1920 px y sale a
   * 3-4 px por módulo; acostado apenas llegaría a 2 y el lector fallaría.
   * `vertical` le dice al que recorta que gire 90°, porque el lector no lee de
   * pie.
   *
   * EL FRENTE VA ACOSTADO, y no es un capricho: al girar el recorte 90° la
   * foto se guarda de lado, y según hacia dónde la persona apunte el borde de
   * arriba puede quedar cabeza abajo. Para el respaldo da igual (el lector
   * prueba 0° y 180°), pero el frente lo mira el CRM para comparar el rostro
   * con la selfie, y una cara al revés no se compara. Acostado no hay giro, no
   * hay ambigüedad, y para una cara no hacen falta 3 px por módulo.
   * `acostada` fuerza ese caso.
   *
   * 8-oct-2026 — «PARA EL RESPALDO DA IGUAL» ERA FALSO, y Joan lo vio en su
   * CRM: al LECTOR le da igual, a la FOTO no. La mitad de las veces el
   * respaldo se guardaba cabeza abajo. Ahora se endereza antes de guardarlo
   * (orientacionDelRespaldo, más abajo).
   */
  function rectanguloGuia(w, h, acostada) {
    var vertical = !acostada && h > w;
    var largo = (vertical ? h : w) * 0.84;
    var corto = largo / PROPORCION;
    var tope = (vertical ? w : h) * 0.92;
    if (corto > tope) { corto = tope; largo = corto * PROPORCION; }
    var rw = vertical ? corto : largo, rh = vertical ? largo : corto;
    return {
      x: Math.round((w - rw) / 2), y: Math.round((h - rh) / 2),
      w: Math.round(rw), h: Math.round(rh), vertical: vertical
    };
  }

  /* Los giros que se prueban cuando el código SE VE pero no se corrige
     (ChecksumException): el lector tolera 1-4°, así que ±2° y ±4° recuperan
     lo que un pulso normal inclina. Cuatro intentos y se acaba: el siguiente
     cuadro trae otra oportunidad, y pedirle a la persona que la enderece es
     más barato que barrer más grados. */
  var GIROS_DE_RESCATE = [2, -2, 4, -4];

  /**
   * Decodifica UNA vez unas luminancias con el ZXing vendorizado. No reintenta,
   * no crea <img>, no guarda lienzos: recibe el gris, devuelve el texto o el
   * motivo por el que no pudo, y libera todo al salir.
   *
   * @param Z   window.ZXing (o null: entonces 'sin_lector')
   * @returns {texto} | {error: 'sin_lector' | 'no_hay' | 'ilegible'}
   *          'no_hay'   = no se ve ningún código en el cuadro (siguiente cuadro)
   *          'ilegible' = hay uno pero no se pudo corregir (probar un giro, o
   *                       pedir que la enderece / la acerque)
   */
  function decodificarLuminancias(Z, gris, w, h) {
    if (!Z || !Z.RGBLuminanceSource || !Z.HybridBinarizer || !Z.BinaryBitmap || !Z.PDF417Reader) {
      return { error: 'sin_lector' };
    }
    if (!gris || !w || !h || gris.length !== w * h) return { error: 'no_hay' };
    try {
      var fuente = new Z.RGBLuminanceSource(gris, w, h);
      var mapa = new Z.BinaryBitmap(new Z.HybridBinarizer(fuente));
      var res = new Z.PDF417Reader().decode(mapa, null);
      var texto = res && (typeof res.getText === 'function' ? res.getText() : res.text);
      if (!texto) return { error: 'ilegible' };
      /* 8-oct-2026 — Y DÓNDE LO VIO. Las esquinas del código las da el lector
         en el marco «derecho» del código: si tuvo que voltear la imagen para
         leerla, las da volteadas. Eso es justo lo que sirve para saber si la
         foto del respaldo quedó cabeza abajo (orientacionDelRespaldo). Solo
         números: nada de esto sale del teléfono. */
      var salida = { texto: String(texto) };
      var pts = puntosDe(res);
      if (pts.length) salida.puntos = pts;
      return salida;
    } catch (e) {
      var nombre = (e && e.constructor && e.constructor.name) || (e && e.name) || '';
      if (Z.NotFoundException && e instanceof Z.NotFoundException) return { error: 'no_hay' };
      if (/NotFound/.test(nombre)) return { error: 'no_hay' };
      return { error: 'ilegible' };
    }
  }

  function puntosDe(res) {
    var crudos = [];
    try { crudos = (typeof res.getResultPoints === 'function' ? res.getResultPoints() : res.resultPoints) || []; }
    catch (e) { crudos = []; }
    var out = [];
    for (var i = 0; i < crudos.length; i++) {
      var p = crudos[i]; if (!p) continue;
      var x = typeof p.getX === 'function' ? p.getX() : p.x, y = typeof p.getY === 'function' ? p.getY() : p.y;
      if (isFinite(x) && isFinite(y)) out.push({ x: +x, y: +y });
    }
    return out;
  }

  /* ==========================================================================
   * EL RESPALDO SE GUARDA DERECHO — 8 de octubre de 2026
   *
   * Joan: «cuando la tomé, en el CRM se ve al revés».
   *
   * LA CAUSA. El respaldo se escanea DE PIE (el código de barras necesita el
   * lado largo del cuadro) y el recorte se gira 90° SIEMPRE HACIA EL MISMO
   * LADO antes de leerlo y de guardarlo. Pero una cédula se pone de pie
   * girándola a la derecha o a la izquierda, y nadie sabe cuál le tocaba: con
   * la mitad de las personas la foto quedaba cabeza abajo. El lector no se
   * entera porque el PDF417 se lee a 0° y a 180° (ver arriba), así que la
   * lectura salía bien y el defecto solo aparecía en el CRM.
   *
   * LA CURA no depende de cómo esté diseñada la cédula, que acá no se sabe
   * de memoria: depende del propio código de barras, que tiene un derecho. El
   * PDF417 empieza a la izquierda con una barra de 8 módulos pegada a la zona
   * blanca, y termina a la derecha con una barra de 7 seguida de un peine de
   * cuatro rayitas. Volteado, el peine queda afuera a la izquierda y la zona
   * blanca a la derecha. Dos formas de verlo:
   *
   *   · «lectura»: si el lector leyó, sus esquinas vienen en el marco derecho.
   *     Si en la imagen real el código está donde dicen las esquinas, la foto
   *     está derecha; si está en el lugar espejado, el lector la volteó para
   *     leerla, y la foto está cabeza abajo. Es la más segura.
   *   · «patrón»: si no leyó (que es justo el caso de Joan), se miran las dos
   *     barras gruesas de los extremos del código en la franja donde está, y
   *     de qué lado está el peine.
   *
   * Si ninguna de las dos está segura, NO se gira: dejar la foto como venía
   * es lo de siempre, y para eso el CRM tiene su «↻ Girar». Girar a ciegas
   * podría voltear una foto que estaba bien.
   *
   * Medido con códigos fabricados (pruebas/respaldo-derecho.test.js): acierta
   * con desenfoque de celular, ruido, 2-4° de inclinación y fondo oscuro a los
   * lados; y con una tarjeta sin código, una selfie o una pared, no opina.
   * ======================================================================== */

  /* Por fila: cuánto más cambia a lo ancho que a lo alto. Las barras del
     código son verticales, así que en su franja esto es muy grande; el texto
     y la huella cambian parecido en las dos direcciones. */
  function puntajeDeFilas(g, w, h) {
    var s = new Float64Array(h);
    for (var y = 0; y < h - 1; y++) {
      var dx = 0, dy = 0, b = y * w;
      for (var x = 0; x < w - 1; x++) {
        var v = g[b + x];
        dx += Math.abs(g[b + x + 1] - v);
        dy += Math.abs(g[b + w + x] - v);
      }
      s[y] = (dx - dy) / w;
    }
    if (h > 1) s[h - 1] = s[h - 2];
    return s;
  }
  function mediaEntre(s, a, b) {
    a = Math.max(0, Math.floor(a)); b = Math.min(s.length, Math.ceil(b));
    var t = 0;
    for (var i = a; i < b; i++) t += s[i];
    return b > a ? t / (b - a) : 0;
  }
  function suavizar(s, k) {
    var n = s.length, o = new Float64Array(n), r = Math.floor(k / 2);
    for (var i = 0; i < n; i++) {
      var t = 0, c = 0;
      for (var j = i - r; j <= i + r; j++) if (j >= 0 && j < n) { t += s[j]; c++; }
      o[i] = c ? t / c : 0;
    }
    return o;
  }
  /* La franja del código: la racha de filas más «de barras» de la imagen. */
  function franjaDelCodigo(s, h) {
    var ss = suavizar(s, Math.max(3, Math.round(h * 0.03)));
    var m = -1e9, ym = 0;
    for (var y = 0; y < h; y++) if (ss[y] > m) { m = ss[y]; ym = y; }
    if (m < ORIENTACION.FUERZA_MIN) return null;
    var u = m * 0.5, a = ym, b = ym;
    while (a > 0 && ss[a - 1] >= u) a--;
    while (b < h - 1 && ss[b + 1] >= u) b++;
    if (b - a + 1 < Math.max(6, h * 0.04)) return null;
    return { y0: a, y1: b + 1 };
  }
  function percentil(g, w, y0, y1, p) {
    var hist = new Uint32Array(256), n = 0;
    for (var y = y0; y < y1; y++) for (var x = 0; x < w; x += 2) { hist[g[y * w + x] | 0]++; n++; }
    var meta = n * p, acc = 0;
    for (var v = 0; v < 256; v++) { acc += hist[v]; if (acc >= meta) return v; }
    return 255;
  }
  /* Lo que opina UNA tajada horizontal de la franja: 0, 180 o null. */
  function votoDeTajada(g, w, y0, y1, blanco, negro) {
    var D = new Float64Array(w), rango = Math.max(1, blanco - negro), n = y1 - y0;
    for (var x = 0; x < w; x++) {
      var t = 0;
      for (var y = y0; y < y1; y++) { var d = (blanco - g[y * w + x]) / rango; t += d < 0 ? 0 : (d > 1 ? 1 : d); }
      D[x] = t / n;
    }
    /* Columnas negras en TODAS las filas de la tajada: las barras de inicio y
       de fin son iguales en cada fila del código; los datos no. */
    var corridas = [], ini = -1;
    for (var c = 0; c <= w; c++) {
      var on = c < w && D[c] >= 0.7;
      if (on && ini < 0) ini = c;
      if (!on && ini >= 0) { if (c - ini >= ORIENTACION.BARRA_MIN) corridas.push({ a: ini, b: c }); ini = -1; }
    }
    var mejor = null;
    for (var i = 0; i < corridas.length; i++) {
      for (var j = i + 1; j < corridas.length; j++) {
        var A = corridas[i], B = corridas[j], wa = A.b - A.a, wb = B.b - B.a, r = wa / wb;
        if (r < 0.6 || r > 1.65) continue;                     // 8 y 7 módulos: parecidas
        if (B.a - A.b < 0.35 * w) continue;                     // el código va de lado a lado
        if (A.a - wa < 0 || B.b + wb > w) continue;             // sin afuera no hay con qué comparar
        var cruces = 0;
        for (var k = A.b + 1; k < B.a; k++) if ((D[k] >= 0.5) !== (D[k - 1] >= 0.5)) cruces++;
        if (cruces < 20) continue;                              // entre las dos, datos: muchas barras
        var p = Math.min(wa, wb) * 1e5 + (B.a - A.b);           // las más gruesas, y las más separadas
        if (!mejor || p > mejor.p) mejor = { A: A, B: B, p: p };
      }
    }
    if (!mejor) return null;
    var A2 = mejor.A, B2 = mejor.B, la = A2.b - A2.a, lb = B2.b - B2.a;
    var afueraA = mediaEntre(D, A2.a - la, A2.a), afueraB = mediaEntre(D, B2.b, B2.b + lb);
    var Q = ORIENTACION;
    /* Derecho: zona blanca a la izquierda, peine a la derecha, y la barra de
       inicio (8) un poco más gruesa que la de fin (7). Volteado, al revés. */
    if (afueraA <= Q.BLANCO_MAX && afueraB >= Q.PEINE_MIN && afueraB <= Q.PEINE_MAX && la >= lb) return 0;
    if (afueraB <= Q.BLANCO_MAX && afueraA >= Q.PEINE_MIN && afueraA <= Q.PEINE_MAX && lb >= la) return 180;
    return null;
  }

  /* Promedio de cajas k×k: achica sin inventar bordes. */
  function achicar(g, w, h, k) {
    var nw = Math.floor(w / k), nh = Math.floor(h / k), o = new Uint8ClampedArray(nw * nh), kk = k * k;
    for (var y = 0; y < nh; y++) {
      for (var x = 0; x < nw; x++) {
        var t = 0;
        for (var j = 0; j < k; j++) { var b = (y * k + j) * w + x * k; for (var i = 0; i < k; i++) t += g[b + i]; }
        o[y * nw + x] = t / kk;
      }
    }
    return { g: o, w: nw, h: nh };
  }

  var ORIENTACION = {
    ANCHO_ANALISIS: 900,// la escala a la que se mide (ver orientacionDelRespaldo)
    FUERZA_MIN: 4,      // franja de barras: más cambio a lo ancho que a lo alto
    BARRA_MIN: 6,       // px: la barra de inicio a 2,5 px/módulo son 20
    BLANCO_MAX: 0.2,    // la zona blanca de afuera del inicio
    PEINE_MIN: 0.18,    // el peine de afuera del fin: 4 rayitas en 7 módulos
    PEINE_MAX: 0.55,
    TAJADAS: 4,
    VOTOS_MIN: 3,       // de 4, y ninguno en contra
    LECTURA_VENTAJA: 1.5
  };

  /**
   * ¿Hay que voltear la foto del respaldo para que quede derecha?
   *
   * @param gris   luminancias del recorte YA ACOSTADO (como lo ve el lector)
   * @param o      { puntos: las esquinas que devolvió decodificarLuminancias }
   * @returns {giro: 0|180, seguro: bool, por: 'lectura'|'patron'|''}
   *          Con `seguro` en false, `giro` es 0: no se toca la foto.
   */
  function orientacionDelRespaldo(gris, w, h, o) {
    var nada = { giro: 0, seguro: false, por: '' };
    if (!gris || !w || !h || gris.length !== w * h || w < 32 || h < 16) return nada;
    var pts = (o && o.puntos) || [];
    /* SE MIDE A UNA ESCALA FIJA (~900 px de ancho), no a la del recorte. Los
       umbrales son de cambio POR PÍXEL, y a resolución completa un código
       desenfocado reparte cada borde en varios píxeles: medido con el video
       fabricado de una cédula borrosa, a 1765 px no se decidía y a la mitad sí
       (y acertaba). De paso cuesta la cuarta parte. */
    var k = Math.max(1, Math.round(w / ORIENTACION.ANCHO_ANALISIS));
    if (k > 1) {
      var a = achicar(gris, w, h, k);
      gris = a.g; w = a.w; h = a.h;
      pts = pts.map(function (p) { return { x: p.x / k, y: p.y / k }; });
    }
    var s = puntajeDeFilas(gris, w, h);
    if (pts.length >= 2) {
      var y0 = Infinity, y1 = -Infinity;
      for (var i = 0; i < pts.length; i++) { y0 = Math.min(y0, pts[i].y); y1 = Math.max(y1, pts[i].y); }
      if (y1 - y0 >= 4) {
        var real = mediaEntre(s, y0, y1 + 1), espejo = mediaEntre(s, h - 1 - y1, h - y0);
        var V = ORIENTACION.LECTURA_VENTAJA, F = ORIENTACION.FUERZA_MIN;
        if (real >= V * espejo && real > F) return { giro: 0, seguro: true, por: 'lectura' };
        if (espejo >= V * real && espejo > F) return { giro: 180, seguro: true, por: 'lectura' };
      }
    }
    var f = franjaDelCodigo(s, h);
    if (!f) return nada;
    var blanco = percentil(gris, w, f.y0, f.y1, 0.9), negro = percentil(gris, w, f.y0, f.y1, 0.1);
    if (blanco - negro < 40) return nada;
    /* Tajadas finas: con la cédula inclinada 3°, promediar la franja entera
       corre las columnas varios módulos; en una tajada, menos de uno. */
    var m = Math.round((f.y1 - f.y0) * 0.1), a = f.y0 + m, b = f.y1 - m;
    var N = ORIENTACION.TAJADAS, alto = (b - a) / N, v0 = 0, v180 = 0;
    for (var k = 0; k < N; k++) {
      var t0 = Math.round(a + k * alto), t1 = Math.round(a + (k + 1) * alto);
      if (t1 - t0 < 2) continue;
      var v = votoDeTajada(gris, w, t0, t1, blanco, negro);
      if (v === 0) v0++; else if (v === 180) v180++;
    }
    if (v0 >= ORIENTACION.VOTOS_MIN && !v180) return { giro: 0, seguro: true, por: 'patron' };
    if (v180 >= ORIENTACION.VOTOS_MIN && !v0) return { giro: 180, seguro: true, por: 'patron' };
    return nada;
  }

  /**
   * La ventana del gris chico de la puerta: el marco más un anillo alrededor
   * (el 21,43 % de cada lado, para que el marco quede en el 15-85 %), recortada
   * contra el borde del video, y DÓNDE QUEDA EL MARCO dentro de ella una vez
   * recortada. 8-oct-2026 — antes la página daba por hecho el 15-85 %, y con
   * el respaldo (marco de pie: 84 % del alto, 92 % del ancho) el anillo nunca
   * cabe: ver medirTarjeta.
   * @returns {sx, sy, sw, sh, gw, gh, interior: {x0, x1, y0, y1}} o null
   */
  function ventanaDeGuia(g, vw, vh, alto) {
    if (!g || !vw || !vh) return null;
    var mx = g.w * 0.2143, my = g.h * 0.2143;   // m/(1+2m) = 0,15
    var sx = Math.max(0, g.x - mx), sy = Math.max(0, g.y - my);
    var sw = Math.min(vw - sx, g.w + 2 * mx), sh = Math.min(vh - sy, g.h + 2 * my);
    if (sw <= 0 || sh <= 0) return null;
    var gh = alto || 96, gw = Math.max(16, Math.round(gh * sw / sh));
    return {
      sx: sx, sy: sy, sw: sw, sh: sh, gw: gw, gh: gh,
      interior: { x0: (g.x - sx) * gw / sw, x1: (g.x + g.w - sx) * gw / sw,
                  y0: (g.y - sy) * gh / sh, y1: (g.y + g.h - sy) * gh / sh }
    };
  }

  /**
   * El recorte de la cédula con un poco de aire alrededor del marco.
   * 8-oct-2026 — quien acerca la cédula «para que se vea bien» la saca por los
   * bordes del marco, y un PDF417 sin su barra de inicio o de fin no se lee
   * NUNCA. Unos puntos de aire, sin salirse del cuadro, se lo perdonan.
   */
  function margenDeLectura(g, vw, vh, f) {
    if (!g || !vw || !vh) return g;
    var k = f == null ? 0.06 : f;
    var mx = Math.round(g.w * k), my = Math.round(g.h * k);
    var x = Math.max(0, g.x - mx), y = Math.max(0, g.y - my);
    var x1 = Math.min(vw, g.x + g.w + mx), y1 = Math.min(vh, g.y + g.h + my);
    return { x: x, y: y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y), vertical: g.vertical };
  }

  /* ==========================================================================
   * EL RESPALDO TAMBIÉN DISPARA SOLO — 8 de octubre de 2026
   *
   * Joan: «la primera foto sin problema, el teléfono solo enfocó y la tomó;
   * pero en la del respaldo algo pasó y me tocó tomarla a mí porque el celular
   * no escaneó».
   *
   * LA CAUSA. El frente disparaba con el ENCUADRE (seis cuadros quietos y
   * nítidos); el respaldo solo disparaba si el código de barras SE LEÍA. Y del
   * video no siempre se lee: la cámara entrega menos resolución de la pedida,
   * un reflejo en el plástico, la cédula unos grados torcida, o la persona la
   * acerca tanto que la barra de inicio queda fuera del recorte. Entonces el
   * escáner se quedaba en «Leyendo el código…» sin fin, y solo a los 20
   * segundos sugería el botón. Leer era requisito para disparar.
   *
   * AHORA LEER ES LO QUE SE INTENTA, NO LO QUE SE EXIGE. Con la cédula en el
   * marco, nítida y quieta, se le da al lector un rato para leer (y si lee,
   * se dispara en ese instante, con los datos). Si en ese rato no lee, se
   * toma la foto igual, en un cuadro nítido, y los datos se escriben en el
   * paso siguiente. La barra de progreso cuenta ESE rato, que es algo que de
   * verdad pasa — no una barra de adorno.
   * ======================================================================== */
  var RESPALDO = {
    MS_LEYENDO: 2500,     // cédula bien puesta: el lector tiene este rato
    LECTURAS_MIN: 3,      // ... y por lo menos estas oportunidades de leer
    MS_SIN_LECTOR: 6000,  // si el lector ni llegó (señal floja), no se espera más que esto
    NITIDEZ_RELATIVA: 0.85 // el disparo, en un cuadro casi tan nítido como el mejor visto
  };
  /**
   * @param e {estables, msVerde, lecturas, nitidez, mejorNitidez, vioCodigo}
   *          estables: cuadros seguidos en verde; msVerde: tiempo acumulado en
   *          verde de este lado; lecturas: intentos de lectura terminados;
   *          vioCodigo: si en ESTE lado ya se vio un código de barras (uno que
   *          el lector encontró sin poder leerlo, o el patrón de barras de
   *          orientacionDelRespaldo).
   * @returns {disparar: bool, avance: 0..1, voltear: bool}
   *
   * 8-oct-2026 (segunda vuelta) — SOLO DISPARA SI VIO UN CÓDIGO. La primera
   * versión miraba solo el rato, la quietud y la nitidez, y el FRENTE de la
   * cédula también es una tarjeta nítida y quieta: quien la ponía al revés en
   * el marco de pie quedaba con la foto del frente guardada como respaldo
   * («El código no se pudo leer»), y el paso siguiente («Ahora el frente»)
   * guardaba el otro lado. Fotos cambiadas, sin datos automáticos, y el CRM
   * comparando la selfie contra el lado del código de barras (lo encontró la
   * revisión del teléfono). Ahora, sin código a la vista, no se dispara: pasado
   * el rato se pide voltearla (`voltear`), y el botón de tomarla a mano sigue
   * ahí para la cédula nueva, que no trae código.
   */
  function decidirRespaldo(e) {
    var x = e || {};
    var ms = Math.max(0, +x.msVerde || 0), lect = Math.max(0, +x.lecturas || 0);
    var avance = Math.min(1, ms / RESPALDO.MS_LEYENDO);
    var tiempo = (ms >= RESPALDO.MS_LEYENDO && lect >= RESPALDO.LECTURAS_MIN) || ms >= RESPALDO.MS_SIN_LECTOR;
    var quieta = (+x.estables || 0) >= TARJETA.CUADROS_FRENTE;
    var nitida = !(+x.mejorNitidez > 0) || (+x.nitidez || 0) >= RESPALDO.NITIDEZ_RELATIVA * x.mejorNitidez;
    var codigo = x.vioCodigo === true;
    return { disparar: !!(tiempo && quieta && nitida && codigo), avance: avance,
             voltear: !!(tiempo && quieta && !codigo) };
  }

  /**
   * Convierte el texto del código de barras en la cédula, sin el tipo de sangre.
   * El RH viaja en el código, pero es dato de SALUD (sensible bajo la Ley 1581,
   * con finalidad propia) y no decide un peso: se tira acá, antes de que toque
   * el disco del teléfono o la red. `leer` es CuentaSocio.leerCedulaPDF417.
   */
  function cedulaDelTexto(leer, texto) {
    if (typeof leer !== 'function' || !texto) return null;
    var r = leer(texto);
    if (!r || !r.documento) return null;
    /* EL RH ES DATO DE SALUD (Ley 1581, art. 5) y no se usa para nada: muere
       aquí, antes de que nadie pueda guardarlo.
       22-sep-2026 — Y EL SEXO SE VA CON ÉL, por la misma razón y con menos
       excusa: viajaba en huella.cedula_leida desde que existe el escáner y no
       lo mira nadie — ni la ficha, ni el cotejo, ni hay casilla que lo declare.
       Un dato personal que se guarda «por si acaso» es un dato recogido de
       más. El día que haga falta, se quita esta línea y se dice para qué. */
    delete r.rh;
    delete r.sexo;
    return r;
  }

  /**
   * ¿Las fotos guardadas pertenecen a este registro?
   * Sí cuando se tomaron para el mismo celular y hace menos de un día.
   */
  function fotosPertenecen(fotos, celular, ahora) {
    if (!fotos || !fotos.de || !celular) return false;
    if (String(fotos.de.celular || '') !== String(celular)) return false;
    var t = Number(fotos.de.t) || 0;
    return t > 0 && (ahora - t) >= 0 && (ahora - t) < HORAS_REGISTRO_VIVO * 3600 * 1000;
  }

  /* ¿El registro a medias sigue vivo? Un checkpoint de hace más de un día no se
     retoma solo: la portada lo ofrece como borrador, pero no lo impone. */
  function checkpointFresco(cp, ahora) {
    if (!cp || typeof cp.paso !== 'number') return false;
    var t = Number(cp.t) || 0;
    return t > 0 && (ahora - t) < HORAS_REGISTRO_VIVO * 3600 * 1000;
  }

  return {
    VERSION: '2026-10-08',
    PROPORCION: PROPORCION,
    HORAS_REGISTRO_VIVO: HORAS_REGISTRO_VIVO,
    TARJETA: TARJETA,
    GIROS_DE_RESCATE: GIROS_DE_RESCATE,
    grisDeImageData: grisDeImageData,
    medirTarjeta: medirTarjeta,
    textoDeTarjeta: textoDeTarjeta,
    rectanguloGuia: rectanguloGuia,
    decodificarLuminancias: decodificarLuminancias,
    /* 8-oct-2026 — el respaldo derecho y el respaldo que dispara solo */
    ORIENTACION: ORIENTACION,
    orientacionDelRespaldo: orientacionDelRespaldo,
    margenDeLectura: margenDeLectura,
    ventanaDeGuia: ventanaDeGuia,
    RESPALDO: RESPALDO,
    decidirRespaldo: decidirRespaldo,
    cedulaDelTexto: cedulaDelTexto,
    fotosPertenecen: fotosPertenecen,
    checkpointFresco: checkpointFresco
  };
});
