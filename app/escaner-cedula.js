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
 *   · lee a 0° y 180°, NUNCA a 90°: una foto de pie (la de la galería) se
 *     prueba girada antes de decodificar. 21-oct-2026 — el recorte del video
 *     ya no: las dos caras se escanean acostadas (ver rectanguloGuia).
 *     26-oct-2026 — la cédula vuelve a ir DE PIE en el marco, pero el
 *     recorte sigue llegando acostado: la página gira al copiar del video
 *     (ver EL MARCO DE PIE, EL RECORTE ACOSTADO);
 *   · `decodeFromImageUrl` de ZXing reintenta a 0 ms PARA SIEMPRE cuando el
 *     código se ve pero no se corrige (ChecksumException): 21 mapas de bits de
 *     10 MB en 300 ms, y la promesa nunca vuelve. Era el camino vivo hasta hoy.
 *     Acá se decodifica por la ruta pura: luminancias → binarizador → lector,
 *     UNA vez, y el que llama decide si vuelve a intentar.
 * ==========================================================================*/
/* 23-oct-2026 — LA FIRMA DE LLEGADA. Las páginas piden este archivo con la
   versión en la dirección (…?v=139) y, antes de arrancar su bloque grande,
   miran que haya firmado aquí. Sin la firma, lo que corrió no es este archivo:
   no llegó, o el service worker contestó otra cosa (el v138, sin señal,
   contesta index.html a lo que no guardó), o una caché dio el de antes, que
   no tiene esta línea. Entonces la página dice que se recargue en vez de
   escribir con piezas de dos versiones.
   Va PRIMERO a propósito: firma que llegó ESTE archivo. Si más abajo algo
   revienta en algún teléfono, eso no es mezclar versiones, y la página sigue
   como siempre (cada una se protege sola sin el módulo); con la firma al
   final, ese teléfono quedaría frenado en «recarga» para siempre. En Node no
   hay document y no hace nada. Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la
   nota de v139 en sw.js. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

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

  /* 19-oct-2026 — CUÁNTO VALEN LAS FOTOS QUE TODAVÍA NO TIENEN DUEÑO.
     Joan: «que lo primero que aparezca al momento de que un cliente se
     registre sea el escanear la cédula». Con la cédula primero, las fotos se
     toman ANTES de que exista el celular, y el celular era el dueño: sin él,
     fotosPertenecen decía que no, la caja no decía «Listo» y la subida no las
     mandaba nunca (reproducido en el banco el 19-oct).
     Mientras no hay celular, el dueño es el INTENTO: un identificador al azar
     que vive en el borrador del registro y que «empezar de cero» cambia. Y
     vale poco rato a propósito: en un teléfono prestado, la cédula escaneada
     de una persona no puede quedarle a la siguiente que abra el enlace. Una
     hora alcanza para escanear, revisar los datos y escribir el celular; a
     partir de ahí las fotos ya tienen dueño y valen el día de siempre. Pasada
     la hora sin celular, no se ven listas ni suben, y al abrir la cuenta se
     pregunta «¿Eres …?» antes de usarlas (play/, identidadEnDuda). */
  var MINUTOS_SIN_DUENO = 60;

  /* 20-oct-2026, revisión — CUÁNTO TIEMPO UNA PÁGINA QUE VUELVE SOLA ES DE LA
     MISMA PERSONA. La relanzada de Android (la cámara del sistema tumba la
     pestaña y la vuelve a abrir) pasa en uno o dos minutos: ahí el registro se
     retoma sin preguntar, porque preguntar en el peor momento del embudo es
     perder gente. Pasado este rato, la página que vuelve sola puede ser de
     otro (el teléfono prestado, F11 de la revisión: Beto abrió el enlace 30
     minutos después de Ana y cayó en «Revisa tus datos» con lo de ella), y se
     pregunta «¿Es tuyo?» sin enseñar nada de lo anterior (restosEnDuda). */
  var MINUTOS_VUELTA_DE_LA_CAMARA = 10;

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
    /* 23-oct-2026 — EL FRENTE, CUANDO LA VENTANA LO JUZGA. Un frente liso
       (colores planos, la foto y letras grandes: la demo del 23-oct) daba 8,5
       aquí, bajo 9, y nunca se ponía en verde, enfocado o no: este gradiente
       medio a 96 px casi no ve el desenfoque (medido: de 8,9 enfocado a 7,8
       con una caja de 13 px a 4K) y sí ve cuánta tinta tiene la tarjeta. Con
       la ventana del mejor cuadro (EscanerCaptura, a 480 px) el que juzga si
       la foto está nítida es ella, y la puerta del frente solo pregunta si
       hay una tarjeta con bordes. Sin ventana (un navegador que no deja
       medir) la puerta sigue siendo el único juez, y vale NITIDEZ_MIN. */
    NITIDEZ_MIN_FRENTE: 5,
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
   * @returns {luz, textura, anillo, nitidez, movimiento, saturados, ok, falla}
   *          `falla` dice QUÉ falta: 'poca_luz' | 'mucha_luz' | 'sin_tarjeta' |
   *          'borrosa' | 'movimiento' | ''
   *          `saturados` (21-oct-2026): la fracción del interior quemada (≥ 250).
   *          No decide el verde: la lee la linterna (EscanerCaptura.decidirLinterna).
   * @param op     23-oct-2026 — opcional: {nitidezMin} en vez de
   *               TARJETA.NITIDEZ_MIN (el frente juzgado por la ventana:
   *               TARJETA.NITIDEZ_MIN_FRENTE). Sin él, todo como siempre.
   */
  function medirTarjeta(gris, previa, w, h, interior, op) {
    var g = gris || [], n = g.length;
    if (!n || !w || !h || w * h !== n || w < 16 || h < 8) {
      return { luz: 0, textura: 0, anillo: 0, nitidez: 0, movimiento: 999, saturados: 0, ok: false, falla: 'sin_tarjeta' };
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

    var si = 0, si2 = 0, ni = 0, sa = 0, sa2 = 0, na = 0, grad = 0, ng = 0, quemados = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var v = g[y * w + x];
        if (y >= y0 && y < y1 && x >= x0 && x < x1) {
          si += v; si2 += v * v; ni++;
          /* 21-oct-2026 — EL REFLEJO SE CUENTA, NO SE PROMEDIA. La linterna sobre
             el plástico de la cédula hace un brillo en un punto que la media
             (LUZ_MAX) no ve: un 5 % del interior quemado apenas la mueve, y ese
             5 % puede ser justo el código de barras o la fecha. */
          if (v >= 250) quemados++;
          if (x + 1 < x1) { grad += Math.abs(g[y * w + x + 1] - v); ng++; }
        } else { sa += v; sa2 += v * v; na++; }
      }
    }
    var luz = ni ? si / ni : 0;
    var textura = ni ? (si2 / ni) - luz * luz : 0;
    var anillo = na ? (sa2 / na) - (sa / na) * (sa / na) : 0;
    var nitidez = ng ? grad / ng : 0;
    var base = { luz: luz, textura: textura, anillo: anillo, nitidez: nitidez, movimiento: 999,
                 saturados: ni ? quemados / ni : 0, ok: false };

    if (luz < TARJETA.LUZ_MIN) { base.falla = 'poca_luz'; return base; }
    if (luz > TARJETA.LUZ_MAX) { base.falla = 'mucha_luz'; return base; }
    /* Poco detalle adentro, o tanto adentro como afuera: no hay cédula en el
       marco, hay una mesa o un cuarto entero. */
    if (textura < TARJETA.TEXTURA_MIN || textura < anillo * TARJETA.VENTAJA_INTERIOR) {
      base.falla = 'sin_tarjeta'; return base;
    }
    /* Hay algo, pero sin bordes: está desenfocada o muy lejos. */
    var nitidezMin = (op && isFinite(op.nitidezMin) && op.nitidezMin >= 0) ? +op.nitidezMin : TARJETA.NITIDEZ_MIN;
    if (nitidez < nitidezMin) { base.falla = 'borrosa'; return base; }
    /* Sin cuadro anterior no se puede decir si está quieta: todavía no se sabe. */
    if (!previa || previa.length !== n) { base.falla = 'movimiento'; return base; }
    var dif = 0;
    for (var i = 0; i < n; i++) dif += Math.abs(g[i] - previa[i]);
    base.movimiento = dif / n;
    if (base.movimiento > TARJETA.MOVIMIENTO_MAX) { base.falla = 'movimiento'; return base; }
    base.ok = true; base.falla = '';
    return base;
  }

  /* Lo que la persona lee. Cada frase dice qué hacer, no qué pasó.
     21-oct-2026 — `borrosa` decía «Acércala un poco»: con el marco de pie lo
     probable era tenerla lejos. Acostada, lo probable es lo contrario —quien
     llena el marco la pega al lente y la cámara no enfoca, que fue lo de
     Joan—, y desde 96 px no se sabe cuál de las dos es. Se dicen las dos.
     26-oct-2026 — `sin_tarjeta` dice DE PIE: el marco volvió a ser vertical
     (rectanguloGuia) y quien la acuesta por costumbre no la llena nunca. */
  var TEXTO_TARJETA = {
    poca_luz: 'Busca un sitio con más luz',
    mucha_luz: 'Hay un reflejo: inclínala un poco',
    sin_tarjeta: 'Pon la cédula DE PIE dentro del marco',
    borrosa: 'Aléjala o acércala un poco y espera el enfoque',
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
   * (Hasta el 21-oct-2026; ver el final de este comentario.)
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
   *
   * 21-oct-2026 — LAS DOS CARAS VAN ACOSTADAS, Y YA NO HAY MARCO DE PIE.
   * Joan: «no me toque tomarla de forma vertical, quiero que las dos fotos de
   * la cédula se tomen horizontal». Y no era solo comodidad: el marco de pie
   * llenaba el 82 % del lado largo del video, lo que obliga a poner la cédula
   * a ~7,8 cm del lente (lente típico de 26 mm equivalentes; cuenta en
   * scratchpad inv-escaner/geometria.js), cerca o por debajo de la distancia
   * mínima de enfoque de muchas cámaras. Acostada, a lo ancho del mismo video,
   * va a ~13,6 cm y la cámara enfoca. Lo que se pierde de píxeles por módulo
   * del código lo recupera la resolución que ahora se pide (EscanerCaptura,
   * CAMARA: 4K ideal). De paso desaparecen el giro de 90° del recorte y el
   * riesgo de guardar la foto de lado.
   * `acostada` queda en la firma por compatibilidad (una página vieja la
   * manda) y ya no cambia nada; `vertical` sale siempre en false para quien
   * todavía la lea.
   *
   * 26-oct-2026 — LA CÉDULA VUELVE A IR DE PIE, PERO A UNA DISTANCIA QUE
   * ENFOCA. Joan, probando el 26-oct en el iPhone: «me pide escanear de esta
   * forma horizontal lo cual me hace alejarme más de la cédula para que se
   * vea toda, no entiendo porque hay que tomar la foto con ese escáner
   * horizontal en una pantalla vertical». Tenía razón en lo de la distancia,
   * y el 21-oct tenía razón lo contrario: las dos cosas caben. El 8-oct el
   * marco de pie llenaba el 84 % del lado LARGO DEL VIDEO, y por eso había
   * que acercarla a 7,7 cm; hoy la cédula de pie llena el 78 % del alto de la
   * CAJA. La caja (.escaner-doc) es 4:5 y recorta arriba y abajo el video
   * 9:16 (object-fit: cover): muestra el 70 % de su alto, así que el 78 % de
   * la caja es el 55 % del lado largo del video, no el 84 %.
   *
   * LA CUENTA (la misma del 21-oct, scratchpad inv-escaner/geometria.js:
   * lente de 26 mm equivalentes; el lado largo del video 16:9 cubre 34,6 mm
   * equivalentes y el corto 9/16 de eso, 19,5 mm):
   *   distancia = (85,6 mm / fracción del campo / 2) / (semicampo / 26)
   *   · 8-oct, de pie al 84 % del largo del video:   85,6/0,84/2 / (17,3/26) =  7,7 cm
   *   · 21-oct, acostada al 84 % del ancho del video: 85,6/0,84/2 / ( 9,7/26) = 13,6 cm
   *   · hoy, de pie al 78 % del alto de la caja
   *     (= 0,78 × 0,70 = 0,55 del largo del video): 85,6/0,55/2 / (17,3/26) = 11,7 cm
   * A 11,7 cm enfoca casi cualquier cámara (el mínimo típico son 8-10 cm) y
   * la cédula sale MÁS GRANDE que acostada: su lado largo ocupa 0,55 × 3840 =
   * 2106 px en 4K contra 0,84 × 2160 = 1814 (1,16 veces por lado, 1,35 en
   * área), y el código de barras gana esos píxeles. No a 7,7 cm: ahí la
   * cámara no enfoca, y eso fue lo que dejó sin leer la amarilla de Joan.
   *
   * `dePie` (el cuarto parámetro) es lo que lo pide, y solo la página de hoy
   * lo manda. Sin él —una página vieja en la caché con este archivo nuevo—
   * el marco sale acostado como el 21-oct, porque esa página no gira nada y
   * un marco de pie le dejaría el recorte de través. La página de hoy con un
   * archivo viejo recibe `vertical: false` y trabaja acostada, como el
   * 21-oct (play/index.html, EL MARCO DE PIE, EL RECORTE ACOSTADO).
   *
   * Con `vertical: true` el lado corto va a lo ancho (w < h). TODO lo que
   * está detrás del marco sigue trabajando ACOSTADO —la puerta, la ventana
   * del mejor cuadro, el lector, las franjas de las letras, la foto—: la
   * página gira 90° al copiar del video (rectAcostado, abajo), así que esos
   * consumidores reciben exactamente la geometría del 21-oct.
   */
  var MARCO = {
    DE_PIE_ALTO: 0.78,        // de la caja: ~11,7 cm (la cuenta de arriba)
    DE_PIE_ANCHO_MAX: 0.92,   // por si la caja fuera más angosta que 4:5
    ACOSTADA_ANCHO: 0.84,     // el 21-oct: ~13,6 cm
    ACOSTADA_ALTO_MAX: 0.92
  };
  function rectanguloGuia(w, h, acostada, dePie) {
    if (dePie === true && h > w) {
      var alto = h * MARCO.DE_PIE_ALTO, ancho = alto / PROPORCION, topeAncho = w * MARCO.DE_PIE_ANCHO_MAX;
      if (ancho > topeAncho) { ancho = topeAncho; alto = ancho * PROPORCION; }
      return {
        x: Math.round((w - ancho) / 2), y: Math.round((h - alto) / 2),
        w: Math.round(ancho), h: Math.round(alto), vertical: true
      };
    }
    var largo = w * MARCO.ACOSTADA_ANCHO;
    var corto = largo / PROPORCION;
    var tope = h * MARCO.ACOSTADA_ALTO_MAX;
    if (corto > tope) { corto = tope; largo = corto * PROPORCION; }
    return {
      x: Math.round((w - largo) / 2), y: Math.round((h - corto) / 2),
      w: Math.round(largo), h: Math.round(corto), vertical: false
    };
  }

  /* ==========================================================================
   * EL MARCO DE PIE, EL RECORTE ACOSTADO — 26 de octubre de 2026
   *
   * La cédula se pone DE PIE en el video (rectanguloGuia con `dePie`), pero
   * nada de lo que mira píxeles sabe de tarjetas de pie: medirTarjeta espera
   * la cédula a lo ancho, el lector PDF417 no lee a 90°, las franjas de las
   * letras (app/ocr-cedula.js) son fracciones de la tarjeta acostada, y la
   * foto se guarda acostada. En vez de enseñarle a cada uno a girar, se gira
   * UNA vez, en la fuente: la página copia del video al lienzo girando 90° en
   * contra del reloj (el lado derecho del video pasa a ser el de arriba), y
   * estas dos cuentas dicen dónde cae cualquier rectángulo del video en ese
   * video ACOSTADO (de vh × vw) y de vuelta. Son solo aritmética, para que se
   * prueben sin cámara.
   *
   * Los 180° que quedan —la cédula de pie se pone con la cabeza a la
   * izquierda o a la derecha, y con este giro la de cabeza a la DERECHA sale
   * derecha— los resuelve quien ya sabía: el respaldo, su código
   * (orientacionDelRespaldo); el frente, las letras (OcrCedula.leerRecorte,
   * `giro`), que enderezan la foto guardada antes de que suba.
   * ======================================================================== */
  /**
   * Un rectángulo del video de pie (vw × vh), en el video acostado (vh × vw).
   * @returns {x, y, w, h, vertical: false} o null si falta algo
   */
  function rectAcostado(r, vw, vh) {
    if (!r || !(vw > 0) || !(vh > 0) || !isFinite(r.x) || !isFinite(r.y)) return null;
    return { x: r.y, y: vw - r.x - r.w, w: r.h, h: r.w, vertical: false };
  }
  /** La vuelta: un rectángulo del video acostado, en el video de pie. */
  function rectDePie(r, vw, vh) {
    if (!r || !(vw > 0) || !(vh > 0) || !isFinite(r.x) || !isFinite(r.y)) return null;
    return { x: vw - r.y - r.h, y: r.x, w: r.h, h: r.w };
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
     y la huella cambian parecido en las dos direcciones.
     23-oct-2026 — `xa`, `xb` (opcionales): solo esas columnas. Ver LAS
     COLUMNAS Y EL PISO DE LA TARJETA, abajo. Sin ellas, todo el ancho, como
     siempre. */
  function puntajeDeFilas(g, w, h, xa, xb) {
    var a = (isFinite(xa) && xa > 0) ? Math.floor(xa) : 0;
    var z = (isFinite(xb) && xb < w) ? Math.ceil(xb) : w;
    if (z - a < 8) { a = 0; z = w; }
    var s = new Float64Array(h), n = z - a;
    for (var y = 0; y < h - 1; y++) {
      var dx = 0, dy = 0, b = y * w;
      for (var x = a; x < z - 1; x++) {
        var v = g[b + x];
        dx += Math.abs(g[b + x + 1] - v);
        dy += Math.abs(g[b + w + x] - v);
      }
      s[y] = (dx - dy) / n;
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
  /* La franja del código: la racha de filas más «de barras» de la imagen.
     22-oct-2026 — con `enLaTarjeta` ({dentro}: las filas del marco, o null)
     la racha más fuerte que no es DE LA TARJETA se descarta y se busca la
     siguiente. Ver LA FRANJA ES DE LA TARJETA, abajo. Lo usan las dos que
     miran una imagen con aire alrededor de la cédula: franjaDeBarras (el gris
     de la medida) y orientacionDelRespaldo (el recorte, o la banda que se
     lee). */
  function franjaDelCodigo(s, h, enLaTarjeta) {
    var ss = suavizar(s, Math.max(3, Math.round(h * 0.03)));
    var vetada = enLaTarjeta ? new Uint8Array(h) : null;
    /* 23-oct-2026 — la mitad del pico se cuenta desde el PISO de la tarjeta,
       no desde cero. Ver LAS COLUMNAS Y EL PISO DE LA TARJETA, abajo. Sin las
       filas del marco no hay piso que medir: 0, como siempre. */
    var piso = (enLaTarjeta && enLaTarjeta.dentro) ? pisoDeLaTarjeta(ss, h, enLaTarjeta.dentro) : 0;
    for (var intento = 0; intento < FRANJA.INTENTOS; intento++) {
      var m = -1e9, ym = -1;
      for (var y = 0; y < h; y++) if ((!vetada || !vetada[y]) && ss[y] > m) { m = ss[y]; ym = y; }
      if (ym < 0 || m - piso < ORIENTACION.FUERZA_MIN) return null;
      var u = piso + (m - piso) * 0.5, a = ym, b = ym;
      /* La racha se extiende también por lo ya descartado: una que se pega a
         la mesa de rayas llega con ella hasta el borde, y se descarta igual.
         Así no sobrevive el «hombro» de la mesa (las filas de la tarjeta
         pegadas a ella, que el suavizado tiñe de rayas). */
      while (a > 0 && ss[a - 1] >= u) a--;
      while (b < h - 1 && ss[b + 1] >= u) b++;
      var f = { y0: a, y1: b + 1 };
      if (!vetada || franjaEnLaTarjeta(f, h, enLaTarjeta.dentro)) {
        if (b - a + 1 < Math.max(6, h * 0.04)) return null;
        return f;
      }
      for (var k = a; k <= b; k++) vetada[k] = 1;
    }
    return null;
  }
  /* ==========================================================================
   * LA FRANJA ES DE LA TARJETA — 22 de octubre de 2026
   *
   * La verificación de 522cf1f (lente «lote», confirmada por dos
   * refutadores) encontró al FRENTE guardado como respaldo. La persona
   * muestra primero el frente (el escáner pide primero el respaldo: el error
   * del 19-oct), con la cédula sobre un mantel, un individual o un tapete de
   * rayas finas. El gris de la medida trae un 6 % de aire alrededor del marco
   * (margenDeLectura), y con la cédula al 85-95 % del marco se ve todavía más
   * mesa. Esas rayas, más o menos perpendiculares al lado largo, son filas
   * «de barras» de verdad: la franja más fuerte salía EN LA MESA, en el
   * tercio de arriba o de abajo, y franjaComoLaDelCodigo la tomaba por el
   * PDF417 gastado. A los 2,5 s el frente se guardaba como respaldo, el
   * registro pasaba solo a «Revisa tus datos», y el respaldo (el PDF417, la
   * expedición, la huella) no se guardaba nunca. Alcance medido: contraste
   * de ±20 a ±60 grises, rayas de 1,2 a 3,1 mm, de 0° a 8° (15° con la
   * tarjeta al 95 %), con ruido, de onda seno o cuadrada. En TODAS esas
   * franjas la racha tocaba el borde del gris (filas 0-44 o 276-303 de 303).
   *
   * Los mismos refutadores hallaron dos caminos más con las mismas rayas: el
   * patrón del PDF417 (orientacionDelRespaldo) «votaba» en las rayas del
   * aire, eso es «vio el código», y el frente se tomaba como respaldo al
   * segundo (y «Tomar la foto ahora» lo marcaba como la amarilla); y en el
   * paso del FRENTE, el frente sobre rayas oía «Ese es el lado del código de
   * barras» y no había cómo tomarlo solo.
   *
   * LA CURA, en tres lugares:
   *   · franjaComoLaDelCodigo exige que la franja esté DENTRO de la tarjeta:
   *     sin tocar el borde del gris y dentro de las filas del marco
   *     (`dentro`; la página las da, y sin ellas se suponen las del 6 % de
   *     aire). Las franjas de los respaldos de verdad caen entre el 10 y el
   *     35 % o entre el 63 y el 90 % del alto; el marco va del 5,4 al 94,6 %.
   *   · franjaDeBarras ya no devuelve la mesa: la descarta y busca la
   *     siguiente racha. Con un respaldo de verdad sobre las rayas, la
   *     siguiente es la del código, y el lector lee donde está el código (con
   *     la mesa, al código borroso le daba las filas de la mesa y nunca lo
   *     veía). Con un frente, no queda ninguna: null, como en mesa lisa.
   *   · orientacionDelRespaldo mide el patrón solo en una franja que no toca
   *     el borde de lo que mira (el recorte, o la banda que se lee).
   * Lo que cuesta: un código cuya franja sí toca el borde (la cédula más
   * grande que el marco y corrida) no da franja. Entonces se lee el recorte
   * entero, como sin franja, y sin código visto se dice «voltéala»: la salida
   * de antes de que la franja fuera prueba (522cf1f), con «Tomar la foto
   * ahora». Nada se guarda mal. Y el respaldo MUY gastado (σ 1,5 módulos)
   * sobre rayas, que a veces se tomaba por la franja de la MESA —acertando
   * por la razón equivocada—, ahora se toma como en mesa lisa: cuando la
   * franja de su código gana (con el fabricado, a veces la empata un renglón
   * de arriba de la tarjeta también en mesa lisa; eso no es de las rayas).
   * ======================================================================== */
  var FRANJA = {
    /* Cuántas rachas se descartan antes de rendirse: la mesa de arriba, la de
       abajo, los «hombros» de cada una, y la del código. Medido con 600
       escenas al azar (frentes y respaldos sobre rayas de ±20 a ±80, 1,2 a
       3 mm, 0 a 15°): nunca hicieron falta más de 5. Con 12 sobra, y cada
       vuelta solo descarta lo que no es de la tarjeta: más vueltas no le dan
       a un frente nada que no tuviera en mesa lisa. */
    INTENTOS: 12,
    AIRE_MEDIDA: 0.06   // el aire de margenDeLectura en el gris de la medida (medirNitidezDoc)
  };
  /* Las filas del marco dentro del gris de la medida si la página no las da:
     el 6 % de aire de cada lado sobre el 112 % del marco. */
  function dentroPorDefecto(h) {
    var m = FRANJA.AIRE_MEDIDA / (1 + 2 * FRANJA.AIRE_MEDIDA);
    return { y0: h * m, y1: h * (1 - m) };
  }
  /* ¿La racha {y0, y1} está en la tarjeta? No toca el borde del gris (lo que
     llega al borde es lo que rodea la tarjeta: la mesa sigue más allá) y, si
     se sabe dónde está el marco, no se sale de sus filas. */
  function franjaEnLaTarjeta(f, h, dentro) {
    if (!f || !(f.y0 > 0) || !(f.y1 < h)) return false;
    if (dentro && isFinite(dentro.y0) && isFinite(dentro.y1) && dentro.y1 > dentro.y0) {
      if (f.y0 < Math.floor(dentro.y0) || f.y1 > Math.ceil(dentro.y1)) return false;
    }
    return true;
  }
  /* 21-oct-2026 — LA MISMA FRANJA, PARA QUIEN LEE. Con video 4K el recorte
     entero de la cédula son ~8 MB de píxeles; la página la busca en el gris
     chico con que mide la nitidez (480 px) y le da al lector solo esas filas
     (EscanerCaptura.bandaDeLectura). null: no se ve una franja de barras.
     22-oct-2026 — solo una franja DE LA TARJETA (ver LA FRANJA ES DE LA
     TARJETA): `dentro`, opcional, son las filas del marco en este gris. Sin
     él no se supone ninguna: quien llama con una tarjeta sin aire (las
     pruebas) no tiene marco.
     23-oct-2026 — con `dentro.x0`/`dentro.x1` (las columnas del marco), cada
     fila se mide solo entre ellas. Ver LAS COLUMNAS Y EL PISO DE LA
     TARJETA. */
  function franjaDeBarras(gris, w, h, dentro) {
    if (!gris || !w || !h || gris.length !== w * h || w < 32 || h < 16) return null;
    var c = columnasDeLaTarjeta(dentro, w);
    return franjaDelCodigo(puntajeDeFilas(gris, w, h, c.xa, c.xb), h, { dentro: dentro || null });
  }
  /* ==========================================================================
   * LAS COLUMNAS Y EL PISO DE LA TARJETA — 23 de octubre de 2026
   *
   * La verificación de a21746b (dos refutadores no la pudieron tumbar) volvió
   * a encontrar el FRENTE guardado como respaldo, sobre una tela de rayas
   * finas de contraste alto (±58 grises o más, 1,2 a 1,54 mm, la tarjeta al
   * 85-90 % del marco). a21746b ya descartaba las FILAS de la mesa, arriba y
   * abajo. Pero cada fila de la TARJETA lleva también, a izquierda y derecha,
   * el aire rayado: el 6 % de margenDeLectura más lo que la tarjeta no llena.
   * Esas columnas suben todas las filas de la tarjeta a un piso (medido: 7,8
   * a ±60; las filas de la mesa dan 42), y encima de ese piso un renglón del
   * frente («NUMERO 52.123.456», en el tercio de arriba) pasaba de la mitad
   * del pico en 16 filas seguidas: una racha del 5,3 % del alto, en su sitio.
   * franjaComoLaDelCodigo la aceptaba, eso es «vioFranja», y a los 2,6 s el
   * frente quedaba en cedula_reverso; en su paso se guardaba otra vez el MISMO
   * cuadro y el registro pasaba solo a «Revisa tus datos» sin el respaldo
   * (el PDF417, la expedición, la huella).
   *
   * LA CURA, en dos capas, cada una suficiente sola en lo medido:
   *   · LAS COLUMNAS: con las del marco (la página las da en medida.dentro),
   *     cada fila se mide solo entre ellas, sin el 6 % de aire. Queda lo que
   *     la tarjeta no llena del marco, y por eso la segunda capa.
   *   · EL PISO: la mitad del pico se cuenta desde el piso de las filas del
   *     marco (su 30 %: las de fondo de la tarjeta, debajo del código y de los
   *     renglones), no desde cero. Un piso que las rayas suben por igual en
   *     todas las filas ya no ensancha un renglón. Nunca baja de 0: sobre una
   *     mesa lisa el fondo de la tarjeta da negativo (las rayas de seguridad
   *     son horizontales; medido de -0,4 a -2 con seis tarjetas, cuatro frentes y
   *     dos respaldos), y ahí
   *     todo queda como estaba.
   * Se probó también medir solo el centro del marco (el 70 % de en medio): el
   * PDF417 gastado perdía su franja hasta en mesa lisa, porque lo que más se
   * le ve son sus barras de inicio y de fin, en las orillas. Se descartó.
   *
   * Medido con la cédula nítida de pruebas/fabricar-cedula-nitida.py y la de
   * fabricar-cedula-ocr.py: las 23 escenas de la verificación que iban por la
   * franja, ninguna (cada capa sola, tampoco); 450 frentes al azar sobre rayas
   * de ±50 a ±105, 1 a 2,2 mm, 0 a 15°, la tarjeta al 80-94 %: 26 con
   * a21746b, 0 con esto. Los respaldos sobre esas rayas siguen dando la
   * franja de su código (60 de 60).
   * ======================================================================== */
  var PISO = { PERCENTIL: 0.3 };
  function pisoDeLaTarjeta(ss, h, dentro) {
    var a = Math.max(0, Math.ceil(dentro.y0)), b = Math.min(h, Math.floor(dentro.y1));
    if (!(b - a >= 8)) return 0;
    var v = Array.prototype.slice.call(ss, a, b).sort(function (p, q) { return p - q; });
    return Math.max(0, v[Math.floor((v.length - 1) * PISO.PERCENTIL)]);
  }
  /* Las columnas del marco en el gris, o todo el ancho si no se saben. */
  function columnasDeLaTarjeta(dentro, w) {
    if (!dentro || !isFinite(dentro.x0) || !isFinite(dentro.x1) || !(dentro.x1 > dentro.x0)) return { xa: 0, xb: w };
    var x0 = Math.max(0, dentro.x0), x1 = Math.min(w, dentro.x1);
    if (!(x1 - x0 > 16)) return { xa: 0, xb: w };
    return { xa: x0, xb: x1 };
  }
  /* 23-oct-2026 — ¿ESA FRANJA ES LA DEL PDF417 DE LA AMARILLA? La página la
     usaba solo como atajo (dónde leer); desde hoy también es lo único que
     queda de un código MUY gastado, que el lector no encuentra y cuyo patrón
     no se ve (EscanerCaptura.decidirVentana, vioFranja). Para que el frente
     no pase por respaldo, se le pide lo que tiene el código de la amarilla y
     no tiene un renglón de letra: estar en el TERCIO de abajo de la tarjeta
     (o en el de arriba, con la cédula al revés) y ocupar al menos el 5 % de
     su alto. Medido el 23-oct con las cédulas fabricadas y las de la demo: la
     franja de un respaldo (legible, borroso o gastado) cae entre el 69 y el
     90 % del alto; en ningún frente, ni en el respaldo de la digital (QR y
     zona de lectura mecánica), apareció una franja. Un código más gastado
     todavía (σ 2 módulos) tampoco deja franja con la cámara enfocada: ahí
     sigue la salida de siempre, «Tomar la foto ahora».
     23-oct-2026 (tarde) — LA FRANJA YA NO TOMA LA FOTO: solo calla el
     «voltéala» e invita a tocar «Tomar la foto ahora» (decidirVentana,
     'solo_franja'). Un frente sobre una tela de cuadros escoceses (rayas
     finas cuyo contraste cambia por bandas) dejaba una racha aceptada AQUÍ,
     en la tela entre el borde de la tarjeta y el del marco: a los 2,6 s el
     frente quedaba como respaldo y el respaldo no se guardaba nunca. Lo que
     esta función dice sigue sirviendo, pero ya no basta para disparar.
     22-oct-2026 — y DENTRO de la tarjeta: una franja en la mesa de rayas que
     rodea la cédula hacía pasar el frente por respaldo (ver LA FRANJA ES DE
     LA TARJETA). Este es el guardián final: aunque una franja de la mesa
     llegue hasta aquí por otro camino, no prueba nada.
     @param f      {y0, y1} de franjaDeBarras, en filas del gris de la medida
     @param alto   el alto de ese gris
     @param dentro {y0, y1}: las filas del marco en ese gris (opcional: sin
                   él, las del 6 % de aire de medirNitidezDoc) */
  function franjaComoLaDelCodigo(f, alto, dentro) {
    var h = +alto || 0;
    if (!f || !(h > 0) || !(f.y1 > f.y0)) return false;
    if (!franjaEnLaTarjeta(f, h, dentro || dentroPorDefecto(h))) return false;
    if ((f.y1 - f.y0) < h * 0.05) return false;
    var centro = (f.y0 + f.y1) / 2 / h;
    return centro >= 2 / 3 || centro <= 1 / 3;
  }
  function percentil(g, w, y0, y1, p) {
    var hist = new Uint32Array(256), n = 0;
    for (var y = y0; y < y1; y++) for (var x = 0; x < w; x += 2) { hist[g[y * w + x] | 0]++; n++; }
    var meta = n * p, acc = 0;
    for (var v = 0; v < 256; v++) { acc += hist[v]; if (acc >= meta) return v; }
    return 255;
  }
  /* Lo que opina UNA tajada horizontal de la franja: 0, 180 o null.
     23-oct-2026 — `afuera` (opcional): los perfiles de las filas de arriba y
     de abajo de la franja (perfilesDeAfuera). Una columna negra que sigue
     negra en ellos es una raya de la mesa, no una barra del código: no entra
     en la cuenta. Ver LA BARRA ES DEL CÓDIGO. */
  function votoDeTajada(g, w, y0, y1, blanco, negro, afuera) {
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
      if (!on && ini >= 0) {
        if (c - ini >= ORIENTACION.BARRA_MIN && !sigueAfuera(afuera, ini, c, w)) corridas.push({ a: ini, b: c });
        ini = -1;
      }
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

  /* ==========================================================================
   * LA BARRA ES DEL CÓDIGO — 23 de octubre de 2026
   *
   * La verificación de a21746b (dos refutadores) encontró otra vez el FRENTE
   * guardado como respaldo sobre rayas finas de contraste alto (±64 a ±80,
   * 1,3 a 1,54 mm, la tarjeta al 86-90 %), ahora por el patrón. a21746b ya
   * le quitaba al patrón las FILAS de la mesa; las COLUMNAS no. Cada tajada
   * va de lado a lado de lo que se mira, y a izquierda y derecha de la
   * tarjeta queda el aire rayado. Medido con el frente fabricado (±70,
   * 1,54 mm, la tarjeta al 90 %) en la banda de un renglón del centro, que
   * la página le daba al lector: en tres tajadas de cuatro, la barra «de
   * inicio» y la «de fin» eran las dos rayas de más afuera (columnas 10-17 y
   * 994-1001 de 1016), el claro de cada raya pasaba por la zona blanca o por
   * el peine, y entre las dos el frente ponía los veinte cruces. Tres votos:
   * «vio el código», y el frente quedaba en cedula_reverso al segundo; en el
   * paso del frente, el mismo frente oía «Ese es el lado del código de
   * barras» y no se tomaba solo.
   *
   * LA CURA: una barra del código empieza y acaba con el código; una raya de
   * la mesa sigue arriba y abajo. Así que, antes de contar una columna negra
   * como barra, se mira si sigue negra en unas filas por ENCIMA y por DEBAJO
   * de la franja (dejando un cuarto de su alto de por medio, que el borde de
   * la franja es borroso). Si sigue en las dos, es mesa y no entra. Con un
   * código de verdad, encima está la tarjeta (letras, nada tan negro y tan
   * ancho como la barra de inicio), y debajo, el margen de la tarjeta o la
   * mesa: nunca las dos negras. La ventana donde se busca es dos veces y
   * media el ancho de la barra: una raya inclinada 15° se corre menos que
   * eso entre la tajada y las filas de afuera.
   *
   * De paso el código de verdad sobre rayas se orienta MEJOR: antes una raya
   * más gruesa que su barra de inicio le ganaba el puesto («las más
   * gruesas»), y el patrón no decidía. Medido con 60 respaldos al azar
   * (rayas de 0 a ±100, de 1 a 3,2 mm, desenfocados hasta σ 3): con a21746b
   * el patrón se orientaba en 30, con esto en 53, y nunca al revés. En los
   * frentes: las 14 escenas de la verificación y sus vecinas que votaban
   * (en la banda o en el recorte entero), ninguna, también con la franja de
   * antes; y en 80 frentes al azar sobre rayas de ±50 a ±105, uno votaba con
   * a21746b y ninguno con esto.
   * ======================================================================== */
  var AFUERA = {
    SEPARACION: 0.25,  // del alto de la franja: lo que se deja entre ella y lo que se mira afuera
    ALTO: 0.25,        // del alto de la franja: cuántas filas se miran afuera (mínimo 3)
    NEGRO: 0.6         // un tramo de 0,6 barras con esto de negro es «la barra sigue»
  };
  /* El perfil (cuánto negro por columna, 0..1) de unas filas encima y debajo
     de la franja. Las que no caben en la imagen no se miran. */
  function perfilesDeAfuera(g, w, h, f, blanco, negro) {
    var fh = f.y1 - f.y0, sep = Math.max(2, Math.round(fh * AFUERA.SEPARACION)), alto = Math.max(3, Math.round(fh * AFUERA.ALTO));
    var rango = Math.max(1, blanco - negro), out = [];
    var tramos = [[f.y0 - sep - alto, f.y0 - sep], [f.y1 + sep, f.y1 + sep + alto]];
    for (var i = 0; i < tramos.length; i++) {
      var y0 = Math.max(0, tramos[i][0]), y1 = Math.min(h, tramos[i][1]);
      if (y1 - y0 < 2) continue;
      var P = new Float64Array(w);
      for (var x = 0; x < w; x++) {
        var t = 0;
        for (var y = y0; y < y1; y++) { var d = (blanco - g[y * w + x]) / rango; t += d < 0 ? 0 : (d > 1 ? 1 : d); }
        P[x] = t / (y1 - y0);
      }
      out.push(P);
    }
    return out;
  }
  /* ¿La columna negra [a, b) sigue negra afuera de la franja? En TODOS los
     perfiles que hay (arriba y abajo; si solo cupo uno, en ese). */
  function sigueAfuera(afuera, a, b, w) {
    if (!afuera || !afuera.length) return false;
    var L = b - a, k = Math.max(2, Math.round(L * 0.6));
    var x0 = Math.max(0, a - Math.round(L * 0.75)), x1 = Math.min(w, b + Math.round(L * 0.75));
    for (var i = 0; i < afuera.length; i++) {
      var P = afuera[i], hay = false, t = 0;
      for (var x = x0; x < x1 && !hay; x++) {
        t += P[x];
        if (x - x0 >= k) t -= P[x - k];
        if (x - x0 >= k - 1 && t / k >= AFUERA.NEGRO) hay = true;
      }
      if (!hay) return false;
    }
    return true;
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
    /* 22-oct-2026 — el patrón se busca en una franja DE LA TARJETA (ver LA
       FRANJA ES DE LA TARJETA). Sin esto, el lector que lee el recorte entero
       medía el patrón en la mesa de rayas del aire: rayas de 3 mm a ±60, con
       la cédula corrida, «votaban» por un PDF417 derecho, eso es «vio el
       código», y el FRENTE se tomaba como respaldo al segundo. Aquí no hay
       marco que dar (es el recorte, o la banda que se lee): solo el borde. */
    var f = franjaDelCodigo(s, h, { dentro: null });
    if (!f) return nada;
    var blanco = percentil(gris, w, f.y0, f.y1, 0.9), negro = percentil(gris, w, f.y0, f.y1, 0.1);
    if (blanco - negro < 40) return nada;
    /* 23-oct-2026 — y las barras, del código: ver LA BARRA ES DEL CÓDIGO. */
    var afuera = perfilesDeAfuera(gris, w, h, f, blanco, negro);
    /* Tajadas finas: con la cédula inclinada 3°, promediar la franja entera
       corre las columnas varios módulos; en una tajada, menos de uno. */
    var m = Math.round((f.y1 - f.y0) * 0.1), a = f.y0 + m, b = f.y1 - m;
    var N = ORIENTACION.TAJADAS, alto = (b - a) / N, v0 = 0, v180 = 0;
    for (var k = 0; k < N; k++) {
      var t0 = Math.round(a + k * alto), t1 = Math.round(a + (k + 1) * alto);
      if (t1 - t0 < 2) continue;
      var v = votoDeTajada(gris, w, t0, t1, blanco, negro, afuera);
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
   * cabe: ver medirTarjeta. 21-oct-2026 — con las dos caras acostadas pasa lo
   * mismo a los lados (el marco llena el 84 % del ancho del video), así que el
   * interior sigue viniendo de aquí y no del 15-85 %.
   * 26-oct-2026 — con el marco de pie la página llama con el marco y el video
   * ACOSTADOS (rectAcostado): el marco llena el 55 % del largo y el 62 % del
   * corto, el anillo vuelve a caber entero y el interior queda en el 15-85 %;
   * se sigue pasando igual, que es lo que vale con cualquier marco.
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

  /* ==========================================================================
   * EL FRENTE NO ES EL RESPALDO — 19 de octubre de 2026
   *
   * Joan: «él tomó la foto de la cédula por los dos lados pero en mi panel
   * solo se ve un lado».
   *
   * LA CAUSA, reproducida con la página de verdad y una cédula fabricada: al
   * leer el respaldo el letrero dice «Ahora el frente, acostado…», y desde ahí
   * el frente se disparaba con seis cuadros quietos y NADA MÁS. Quien acuesta
   * la cédula antes de voltearla y la deja quieta medio segundo guarda el
   * respaldo como frente: en el teléfono ve dos ✓, en la nube quedan dos
   * filas, y en el CRM salen dos miniaturas del mismo lado. La reja contraria
   * existía desde el 8-oct (decidirRespaldo no dispara sin código a la vista);
   * para el frente no había ninguna, y el propio lector de la página leía el
   * código de barras en ese «frente».
   *
   * LA CURA es la misma reja, al revés: el frente solo se guarda si NO se ve
   * un código de barras. El escáner mira el recorte con la tarjeta en verde
   * (el lector si ya bajó; si no, el patrón de las barras) y solo dispara con
   * la tarjeta quieta, sin código a la vista y con al menos una mirada limpia
   * en esta racha: sin esa mirada, seis cuadros quietos podían llegar antes de
   * haber mirado nada. Y al guardar se mira una última vez (guardarFrente).
   *
   * EL RIESGO es el contrario: un frente de verdad que el lector confunda con
   * un PDF417 no se dispararía nunca. Con 120 frentes fabricados no pasó
   * ninguno, pero son de mentira; por eso un segundo toque A MANO en «Tomar la
   * foto ahora», dentro de unos segundos, la guarda igual.
   * ======================================================================== */
  var FRENTE = {
    MS_ENTRE_MIRADAS: 500,   // como mucho dos miradas por segundo, y solo en verde
    MS_GUARDAR_IGUAL: 10000, // el segundo toque a mano vale si llega dentro de este rato
    /* 20-oct-2026, revisión (F9) — Y NO ANTES DE ESTE RATO. Sin piso, un doble
       toque (dos toques a 0-150 ms, o el dedo que rebota) contaba como
       «insistir»: el respaldo quedaba guardado como frente, la pantalla decía
       «La guardamos como el frente, como pediste» y a los 1,5 s pasaba sola a
       «Revisa tus datos». Insistir es ver el aviso y volver a tocar; eso no se
       hace en menos de un segundo y medio. */
    MS_SEGUNDO_TOQUE: 1500
  };
  /**
   * ¿Se dispara el frente? La gemela de decidirRespaldo.
   * @param e {estables, vioCodigo, limpias}
   *          estables: cuadros seguidos en verde; vioCodigo: en ESTA racha se
   *          vio un código de barras (leído, encontrado sin leer o su patrón);
   *          limpias: miradas de esta racha que no vieron ninguno. `limpias` es
   *          opcional: si no viene, no se exige mirada.
   * @returns {disparar: bool, voltear: bool}
   *          voltear: lo que está en el marco es el lado del código; se le pide
   *          a la persona que la voltee en vez de guardarlo.
   */
  function decidirFrente(e) {
    var x = e || {};
    var quieta = (+x.estables || 0) >= TARJETA.CUADROS_FRENTE;
    var codigo = x.vioCodigo === true;
    var mirada = x.limpias === undefined || (+x.limpias || 0) >= 1;
    return { disparar: !!(quieta && mirada && !codigo), voltear: codigo };
  }
  /**
   * La última reja, al guardar: ¿esta foto se guarda como frente?
   * @param e {conCodigo, aMano, msDesdeRechazo, avisoMostrado}
   *          conCodigo: en la foto se ve un código de barras;
   *          aMano: la pidió la persona («Tomar la foto ahora»), no el bucle;
   *          msDesdeRechazo: cuánto hace que se rechazó una toma A MANO por lo
   *          mismo (null si no hubo);
   *          avisoMostrado: ese primer rechazo SÍ le mostró a la persona el
   *          aviso de «vuelve a tocar» (20-oct-2026, F9).
   * @returns {guardar: bool, forzada: bool}
   *          forzada: se guarda aunque se vio un código, porque la persona
   *          insistió. La revisión del computador lo vuelve a mirar.
   */
  function guardarFrente(e) {
    var x = e || {};
    if (x.conCodigo !== true) return { guardar: true, forzada: false };
    var ms = x.msDesdeRechazo;
    /* 20-oct-2026, revisión — insistir es haber VISTO el aviso y volver a
       tocar después de leerlo: ni un doble toque (piso de MS_SEGUNDO_TOQUE)
       ni un primer toque que no dijo nada en pantalla. */
    var insiste = x.aMano === true && x.avisoMostrado === true && typeof ms === 'number' && isFinite(ms) &&
      ms >= FRENTE.MS_SEGUNDO_TOQUE && ms <= FRENTE.MS_GUARDAR_IGUAL;
    return { guardar: insiste, forzada: insiste };
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
   * Con dueño (fotos.de.celular): sí cuando se tomaron para el mismo celular y
   * hace menos de un día — la regla de siempre, y la única que vale para SUBIR.
   * Sin dueño todavía (19-oct-2026, la cédula va primero): sí cuando son del
   * mismo intento de registro y de hace menos de MINUTOS_SIN_DUENO. El celular
   * que llegue no cuenta para estas: todavía no son de nadie, son de este
   * intento. `intento` es opcional: sin él, una foto sin dueño no es de nadie.
   */
  function fotosPertenecen(fotos, celular, ahora, intento) {
    if (!fotos || !fotos.de) return false;
    var t = Number(fotos.de.t) || 0;
    if (!(t > 0 && (ahora - t) >= 0)) return false;
    var dueno = String(fotos.de.celular || '');
    if (dueno) {
      if (!celular || dueno !== String(celular)) return false;
      return (ahora - t) < HORAS_REGISTRO_VIVO * 3600 * 1000;
    }
    if (!intento || !fotos.de.intento || String(fotos.de.intento) !== String(intento)) return false;
    return (ahora - t) < MINUTOS_SIN_DUENO * 60 * 1000;
  }

  /**
   * La fecha de expedición que la persona escribe a mano — 19-oct-2026.
   * No viene en el código de barras (cuenta.js, leerCedulaPDF417), así que es
   * el único dato de la identidad que siempre se teclea, y el más fácil de
   * equivocar: se confunde con la de nacimiento, o se escribe el año de hoy.
   * @param expedicion 'AAAA-MM-DD', lo que dejó la casilla de fecha.
   * @param nacimiento 'AAAA-MM-DD' leído de la cédula, o '' si no se leyó.
   * @param hoy        'AAAA-MM-DD' del teléfono.
   * @param tipoDoc    el tipo de documento del formulario.
   * @returns {ok, motivo}
   * Vacía no es asunto de esta función: es obligatoria y eso lo dice
   * CuentaSocio.revisarVinculacion. Lo de los 18 años solo con la cédula de
   * ciudadanía y la fecha de nacimiento LEÍDA: la cédula se expide desde los
   * 18, pero un pasaporte no, y una fecha de nacimiento que nadie leyó no
   * sirve para rechazar nada.
   */
  function revisarExpedicion(expedicion, nacimiento, hoy, tipoDoc) {
    var e = String(expedicion == null ? '' : expedicion).trim();
    if (!e) return { ok: true, motivo: '' };
    var forma = /^(\d{4})-(\d{2})-(\d{2})$/;
    var m = forma.exec(e);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) {
      return { ok: false, motivo: 'Esa fecha de expedición no se entiende. Escríbela como aparece en tu cédula.' };
    }
    var h = String(hoy || '');
    if (forma.test(h) && e > h) {
      return { ok: false, motivo: 'La fecha de expedición no puede ser después de hoy. Revísala en tu cédula.' };
    }
    var n = forma.exec(String(nacimiento || ''));
    var esCedula = !tipoDoc || tipoDoc === 'Cédula de ciudadanía';
    if (n && esCedula) {
      /* Se compara como texto, y funciona: AAAA-MM-DD ordena igual que la
         fecha. Un 29 de febrero da un «límite» que no existe (2006-02-29),
         pero en el orden de texto cae justo entre el 28 y el 1 de marzo, que
         es lo correcto. */
      var limite = (Number(n[1]) + 18) + '-' + n[2] + '-' + n[3];
      if (e < limite) {
        return { ok: false, motivo: 'La cédula se expide desde los 18 años, y esa fecha es de antes. ' +
          'Revísala en tu cédula: está en el respaldo, donde dice «FECHA Y LUGAR DE EXPEDICIÓN».' };
      }
    }
    return { ok: true, motivo: '' };
  }

  /* ¿El registro a medias sigue vivo? Un checkpoint de hace más de un día no se
     retoma solo: la portada lo ofrece como borrador, pero no lo impone. */
  function checkpointFresco(cp, ahora) {
    if (!cp || typeof cp.paso !== 'number') return false;
    var t = Number(cp.t) || 0;
    return t > 0 && (ahora - t) < HORAS_REGISTRO_VIVO * 3600 * 1000;
  }

  /* ==========================================================================
   * LA CÉDULA ES DE QUIEN DICE SU DOCUMENTO — 20 de octubre de 2026, revisión
   *
   * La revisión adversaria del registro con la cédula primero (F4, F6, F11,
   * F15) encontró la misma raíz en cuatro caminos: las fotos y la lectura de
   * la cédula se ataban al INTENTO (este registro, en este teléfono) y no a la
   * PERSONA. En un teléfono prestado, María escanea, se va, y Pedro abre el
   * registro en el mismo intento: la cédula de María subía a la cuenta de
   * Pedro aunque él escribiera su nombre y su documento.
   *
   * La persona la define el NÚMERO que trae el código de barras, que el PDF417
   * no se inventa (lleva su propia corrección de errores). Así que la regla
   * dura es: la cédula leída solo viaja con un registro cuyo documento escrito
   * es ese mismo número. Se compara normalizado —solo dígitos y sin los ceros
   * de la izquierda, que el código trae y nadie teclea («0052123456» es
   * «52.123.456»)—.
   * ======================================================================== */
  function normalizarDocumento(d) {
    return String(d == null ? '' : d).replace(/\D/g, '').replace(/^0+/, '');
  }
  /** ¿Son el mismo documento? Vacío contra lo que sea es «no se sabe»: false. */
  function mismoDocumento(a, b) {
    var x = normalizarDocumento(a), y = normalizarDocumento(b);
    return !!(x && y && x === y);
  }

  /**
   * ¿Lo que quedó de un registro a medias en el teléfono puede ser de OTRA
   * persona? Entonces se pregunta «¿Es tuyo?» ANTES de pintar nada de ello
   * (play/, pintarPreguntaRestos). 20-oct-2026, revisión (F4, F7, F11).
   * @param e {hayRestos, t, ahora, retomando}
   *          hayRestos: hay datos escritos o fotos de ese registro;
   *          t: la última vez que alguien tocó ese registro (ms), 0 si no se sabe;
   *          retomando: la página volvió sola a un paso guardado (la relanzada
   *          de la cámara); false si la persona entra por la portada o el enlace.
   * @returns bool
   * Entrando por la portada o por el enlace, SIEMPRE que haya restos: quien
   * toca «Abrir mi cuenta» en un teléfono que ya tiene un registro a medias
   * puede ser cualquiera (F4: María toca «Volver» hasta la portada y presta el
   * teléfono; Pedro toca «Abrir mi cuenta» y veía la cédula de María). Al
   * retomar solo, se pregunta si pasó el rato de la cámara o cambió el día:
   * dentro de ese rato es la misma persona volviendo de la cámara.
   */
  function restosEnDuda(e) {
    var x = e || {};
    if (!x.hayRestos) return false;
    if (!x.retomando) return true;
    var t = Number(x.t) || 0, ahora = Number(x.ahora) || 0;
    if (!dentroDeLaVueltaDeLaCamara(t, ahora)) return true;
    var a = new Date(t), b = new Date(ahora);
    return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
  }
  /**
   * ¿Volvió dentro del rato que toma ir a la cámara del sistema y volver?
   * 20-oct-2026, buena fe (A7) — aparte de restosEnDuda, y SIN la regla del
   * cambio de día: esta es la que decide si lo sensible se SUELTA al abrir
   * (play/, el arranque). Quien toma la foto a las 23:59 y vuelve a las 00:01
   * estuvo fuera dos minutos; el cambio de día sigue decidiendo si se pregunta
   * «¿Es tuyo?», que no borra nada.
   * @param t     la última vez que alguien tocó el registro o la página se fue (ms)
   * @param ahora (ms)
   */
  function dentroDeLaVueltaDeLaCamara(t, ahora) {
    t = Number(t) || 0; ahora = Number(ahora) || 0;
    return t > 0 && ahora - t >= 0 && ahora - t < MINUTOS_VUELTA_DE_LA_CAMARA * 60 * 1000;
  }

  return {
    VERSION: '2026-10-26',
    PROPORCION: PROPORCION,
    /* 26-oct-2026 — el marco de pie, el recorte acostado */
    MARCO: MARCO,
    rectAcostado: rectAcostado,
    rectDePie: rectDePie,
    HORAS_REGISTRO_VIVO: HORAS_REGISTRO_VIVO,
    /* 19-oct-2026 — la cédula va primero: fotos sin dueño y la expedición */
    MINUTOS_SIN_DUENO: MINUTOS_SIN_DUENO,
    /* 20-oct-2026, revisión — la cédula es de quien dice su documento, y lo
       que queda en el teléfono no se le enseña a otro */
    MINUTOS_VUELTA_DE_LA_CAMARA: MINUTOS_VUELTA_DE_LA_CAMARA,
    normalizarDocumento: normalizarDocumento,
    mismoDocumento: mismoDocumento,
    restosEnDuda: restosEnDuda,
    /* 20-oct-2026, buena fe — el rato de la cámara, sin el cambio de día */
    dentroDeLaVueltaDeLaCamara: dentroDeLaVueltaDeLaCamara,
    revisarExpedicion: revisarExpedicion,
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
    /* 21-oct-2026 — leer el PDF417 solo de su franja (video 4K) */
    franjaDeBarras: franjaDeBarras,
    franjaComoLaDelCodigo: franjaComoLaDelCodigo,
    margenDeLectura: margenDeLectura,
    ventanaDeGuia: ventanaDeGuia,
    RESPALDO: RESPALDO,
    decidirRespaldo: decidirRespaldo,
    /* 19-oct-2026 — el frente no se guarda si se ve el código de barras */
    FRENTE: FRENTE,
    decidirFrente: decidirFrente,
    guardarFrente: guardarFrente,
    cedulaDelTexto: cedulaDelTexto,
    fotosPertenecen: fotosPertenecen,
    checkpointFresco: checkpointFresco
  };
});
