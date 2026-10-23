/* ============================================================================
 * EL ESCÁNER QUE ESCOGE LA FOTO MÁS NÍTIDA — 21 de octubre de 2026
 *
 * Joan, con su cédula amarilla en la mano: «que cuando esté enfocada la cédula
 * de forma horizontal la pantalla se ponga verde y tome la foto en el momento
 * que se vea mejor enfocada, y que al cambiar a la foto por el otro lado … no
 * me toque tomarla de forma vertical, quiero que las dos fotos de la cédula se
 * tomen horizontal y si no hay mucha iluminación … prender el flash».
 *
 * LO QUE LE PASABA, medido (la investigación del 21-oct, scratchpad
 * inv-escaner/): el marco del respaldo iba DE PIE para que el código de
 * barras llenara el lado largo del video. Llenar el 82 % del lado largo
 * obliga a poner la cédula a ~7,8 cm del lente, cerca o por debajo de la
 * distancia mínima de enfoque de muchas cámaras (la de un iPhone Pro, ~20 cm).
 * Y la puerta del escáner (un gris de 96 px) no ve el desenfoque: con σ = 2 px
 * su «nitidez» cae un 12 %, la de la foto un 72 %. Se ponía verde con un
 * código ilegible, nunca leía, y pedía voltearla con el lado correcto puesto.
 *
 * LO QUE CAMBIA (y por qué cada cosa vive donde vive):
 *   · LAS DOS CARAS ACOSTADAS (EscanerCedula.rectanguloGuia): a 13,6 cm la
 *     cámara enfoca. Lo que se pierde de píxeles por módulo se recupera
 *     pidiendo más resolución (pedidoDeCamara: 4K ideal).
 *   · LA PUERTA SIGUE SIENDO LA BARATA (hay tarjeta, con luz, quieta), pero en
 *     verde se mide la nitidez DE VERDAD, a la escala de la foto (480 px de
 *     ancho), y en una ventana de ~1 s se guarda el MEJOR cuadro. Ese es el
 *     que se dispara, no el sexto quieto (ventanaNueva … decidirVentana).
 *   · LA LINTERNA se prende sola con poca luz y se apaga si hace reflejo
 *     (decidirLinterna).
 *   · LA CÉDULA DIGITAL trae un QR, no el PDF417: un QR leído es prueba de que
 *     es el lado de atrás (buscarQr, clasificarCodigos). Su contenido NUNCA se
 *     devuelve: es biometría cifrada y no se guarda ni un byte.
 *
 * ESTE ARCHIVO NO TOCA LA CÁMARA NI EL DOM, igual que app/escaner-cedula.js:
 * aquí está lo que se decide con números y se prueba en Node
 * (pruebas/escaner-captura.test.js); lo que necesita un <video> vive en
 * play/index.html. Y nada de lo de aquí guarda estado: la página lleva la
 * ventana y se la pasa (en el banco de pruebas todos los bancos comparten
 * este módulo, y un estado escondido aquí envenenaría a los demás).
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.EscanerCaptura = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* LA VENTANA DEL MEJOR CUADRO. Los números juntos y con nombre, porque son
     los que hay que calibrar con teléfonos de verdad (como pasó con el
     NITIDEZ_MIN del CRM).

     PISO_NITIDEZ = 35, medido con nitidezDeGris sobre tres cédulas fabricadas
     a 907 px de ancho (la que ve un video de 1080) y desenfoque gaussiano σ en
     píxeles de ese video —la de la investigación del 21-oct (scratchpad
     inv-escaner/nitidez-escalas.js), y un respaldo con su PDF417 y un frente
     como los de pruebas/escaner-captura.test.js—:
                        σ   0     1     1,5   2     2,5   3
         investigación 480  219   148   101   62    37    22
                       640  184   92    54    31    16    9
         respaldo      480  90    58    41    28    18    13
                       640  74    38    21    13    8     5
         frente        480  130   75    43    22    11    5
                       640  103   54    28    13    6     3
     640 es la escala a la que el CRM mide la foto guardada, y llama «borrosa»
     a una cédula por debajo de 15 (RevisionRegistro, NITIDEZ_MIN.documento):
     eso es entre 24 y 37 a 480 px, según lo que la tarjeta tenga impreso. 35
     queda del lado exigente en casi todo, que es lo que hace falta porque la
     foto guardada pasa además por JPEG 0,6 y se ablanda. Y deja pasar σ ≈ 1,5
     en las tres: un celular enfocado da menos que eso. Es la ESCALA de la
     cédula, no la del video: con 4K la tarjeta tiene más píxeles, pero se
     mide igual a 480 de ancho. Son tarjetas fabricadas: se calibra con los
     primeros registros reales, como pasó con el NITIDEZ_MIN del CRM.

     MEDIDAS_VENTANA = 10: el bucle mira cada 100 ms, así que es ~1 s. En un
     teléfono que no da diez por segundo, la ventana se cierra igual a los
     1,5 s si ya tiene MEDIDAS_MIN. Se cuenta por medidas y no por reloj a
     propósito: el banco de pruebas no tiene reloj que avance solo, y una
     ventana por reloj no se podría probar con la página de verdad. */
  var CAPTURA = {
    ANCHO_MEDIDA: 480,     // la nitidez se mide con la cédula a este ancho
    MEDIDAS_VENTANA: 10,   // ~1 s a diez medidas por segundo
    MEDIDAS_MIN: 3,        // con menos que esto la ventana no decide nada
    MS_VENTANA_MAX: 1500,  // … y si el teléfono es lento, se cierra a 1,5 s
    PISO_NITIDEZ: 35,      // ver la tabla de arriba
    /* 23-oct-2026 — el piso del cuarto más nítido de los mosaicos (ver LA
       CALIDAD QUE JUZGA LA VENTANA, más abajo): con un PDF417 gastado o un
       frente liso, la mediana la deciden mosaicos que no ven el enfoque. */
    PISO_CUARTIL: 75,
    /* 23-oct-2026 — el respaldo que solo muestra la FRANJA de sus barras (un
       PDF417 tan gastado que el lector ni lo encuentra ni ve su patrón): el
       lector tiene este rato en verde para intentarlo antes de tomar la foto
       sin datos. El mismo que EscanerCedula.RESPALDO.MS_LEYENDO. */
    MS_SOLO_FRANJA: 2500,
    /* El mismo rato que EscanerCedula.RESPALDO.MS_SIN_LECTOR (la prueba los
       compara): si el lector todavía baja (señal floja), el respaldo no se
       dispara sin que nadie lo haya intentado leer, pero tampoco espera más. */
    MS_SIN_LECTOR: 6000,
    /* Un aviso que cierra una ventana («Aléjala…») se queda este rato en
       pantalla: si no, el letrero de la ventana siguiente lo pisaba en 100 ms
       y nadie alcanzaba a leerlo. */
    MS_AVISO: 1600
  };

  /* LA CÁMARA. 4K ideal: acostada, la cédula llena el 84 % del lado CORTO del
     video, y el PDF417 (unos 324-460 módulos de ancho) sale a 1,7-2,4 px por
     módulo con 1080 px, en el límite del lector (2-2,5; medido con
     pruebas/fabrica-pdf417.js). Con 1440 sale a 2,2-3,2 y con 2160 a 3,4-4,8.
     Nunca `min`: un mínimo que la cámara no cumple hace fallar getUserMedia
     (OverconstrainedError) y la persona caería a la cámara del sistema, que es
     justo lo que el escáner en vivo evita. Por eso se pide `ideal` y después
     se lee lo que de verdad dio (resolucionEfectiva).
     SI EN UN CELULAR BARATO EL VIDEO VA A SALTOS (4K calienta y la puerta lee
     el cuadro diez veces por segundo), este es el número que se baja: 2560. */
  var CAMARA = {
    ANCHO_IDEAL: 3840,
    ALTO_IDEAL: 2160,
    CORTO_MIN: 1440        // por debajo, leer el código acostada no está garantizado
  };

  /* LA LINTERNA. Con histéresis, para que no parpadee:
     · se PRENDE cuando la luz del interior del marco pasa MS_OSCURA por debajo
       de LUZ_PRENDER (la puerta deja de decir «poca luz» a 32: entre 32 y 70
       la cédula se ve, pero el sensor sube la ganancia y la foto sale con
       grano y movida), o cuando la cédula lleva MS_BORROSA quieta y en verde
       sin pasar el piso de nitidez con luz por debajo de LUZ_AYUDA (con poca
       luz el enfoque automático no engancha; con mucha, la linterna no lo
       arregla y sí hace reflejo);
     · la oscuridad solo vuelve a cero por encima de LUZ_PRENDER + BANDA: un
       cuarto que oscila alrededor de 70 no la deja a medio contar;
     · prendida, NO se apaga porque haya luz (la luz es ella): se apaga si hace
       REFLEJO (fracción de píxeles quemados del interior por encima de
       REFLEJO_MAX; la media no lo ve, un brillo en un punto no la mueve), o si
       la persona toca «Apagar la luz». En los dos casos no se vuelve a prender
       sola (la página lo lleva en `vetada`). */
  var LINTERNA = {
    LUZ_PRENDER: 70,
    BANDA: 15,
    MS_OSCURA: 1000,
    LUZ_AYUDA: 150,
    MS_BORROSA: 1500,
    REFLEJO_MAX: 0.04
  };

  /* Lo que la persona lee mientras la ventana decide. Cada frase dice qué
     hacer, no qué pasó, y ninguna promete lo que el código no hace. (Lo que
     se pide en cada cara al empezar vive en play/index.html, textoDelLado.) */
  var TEXTO = {
    MIDIENDO: 'Quieta… buscando la foto más nítida',
    LEYENDO: 'Quieta… leyendo el código',
    TOMANDO: 'Quieta… tomando la foto',
    ALEJALA: 'Aléjala un poco y espera el enfoque',
    BUSCA_LUZ: 'Busca más luz y espera el enfoque',
    SIN_CODIGO: 'No vemos código en ese lado: si es el frente, voltéala',
    REFLEJO: 'Hay un reflejo: inclínala un poco',
    LUZ_PRENDIDA: 'Prendimos la luz del celular: hay poca'
  };

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

  /* ==========================================================================
   * LA NITIDEZ A LA ESCALA DE LA FOTO
   *
   * Es la MISMA cuenta que RevisionRegistro.nitidezDeGris (app/revision-
   * registro.js) para un documento —la del CRM—, copiada y no cargada: ese
   * archivo son 1.600 líneas de reglas del CRM que play/ no necesita. La prueba
   * las compara número a número sobre las mismas imágenes; si una cambia y la
   * otra no, se cae.
   *
   * El porqué de la cuenta está allá (NITIDEZ_MIN): la varianza del laplaciano
   * crecía con el contraste al cuadrado y no veía el pulso de la mano. Aquí:
   * suavizado binomial 3×3; mosaicos de 32 px; en cada mosaico con algo que
   * enfocar (varianza ≥ 100), la segunda derivada en la dirección MÁS POBRE de
   * cuatro, menos el piso de grano de la imagen, dividida por el contraste del
   * mosaico; y la mediana. Medido en Node: ~3 ms a 480×303.
   * ======================================================================== */
  var MOSAICO = 32, MOSAICO_VARIANZA_MIN = 100, PISO_DE_GRANO = 0.1;

  function suavizarBinomial(gris, ancho, alto) {
    var t = new Float32Array(ancho * alto), o = new Float32Array(ancho * alto);
    var x, y, i, xa, xb, ya, yb;
    for (y = 0; y < alto; y++) {
      for (x = 0; x < ancho; x++) {
        i = y * ancho + x; xa = x > 0 ? i - 1 : i; xb = x < ancho - 1 ? i + 1 : i;
        t[i] = (gris[xa] + 2 * gris[i] + gris[xb]) / 4;
      }
    }
    for (y = 0; y < alto; y++) {
      for (x = 0; x < ancho; x++) {
        i = y * ancho + x; ya = y > 0 ? i - ancho : i; yb = y < alto - 1 ? i + ancho : i;
        o[i] = (t[ya] + 2 * t[i] + t[yb]) / 4;
      }
    }
    return o;
  }
  function mosaicosDe(g, ancho, alto) {
    var T = MOSAICO, out = [];
    var a = new Float64Array(4), a2 = new Float64Array(4), d = new Float64Array(4);
    for (var ty = 0; ty + T <= alto; ty += T) {
      for (var tx = 0; tx + T <= ancho; tx += T) {
        var s = 0, s2 = 0, n = 0, k;
        for (k = 0; k < 4; k++) { a[k] = 0; a2[k] = 0; }
        for (var y = ty + 1; y < ty + T - 1; y++) {
          for (var x = tx + 1; x < tx + T - 1; x++) {
            var i = y * ancho + x, v = g[i];
            s += v; s2 += v * v; n++;
            d[0] = g[i - 1] - 2 * v + g[i + 1];
            d[1] = g[i - ancho] - 2 * v + g[i + ancho];
            d[2] = (g[i - ancho - 1] - 2 * v + g[i + ancho + 1]) / 2;
            d[3] = (g[i - ancho + 1] - 2 * v + g[i + ancho - 1]) / 2;
            for (k = 0; k < 4; k++) { a[k] += d[k]; a2[k] += d[k] * d[k]; }
          }
        }
        if (!n) continue;
        var m = s / n, pobre = Infinity;
        for (k = 0; k < 4; k++) {
          var mk = a[k] / n, vk = Math.max(0, a2[k] / n - mk * mk);
          if (vk < pobre) pobre = vk;
        }
        out.push({ contraste: Math.max(0, s2 / n - m * m), pobre: pobre });
      }
    }
    return out;
  }
  function percentil(lista, p) {
    var o = lista.slice().sort(function (x, y) { return x - y; });
    return o.length ? o[Math.min(o.length - 1, Math.floor(o.length * p))] : 0;
  }
  /* Lo que vale cada mosaico con algo que enfocar (la cuenta de arriba), o
     null si no hay ninguno. La comparten nitidezDeGris y calidadDeGris: una
     sola cuenta, para que las dos no se puedan separar. */
  function valoresDeMosaicos(gris, ancho, alto) {
    ancho = Math.floor(num(ancho)); alto = Math.floor(num(alto));
    if (!gris || ancho < 3 || alto < 3 || gris.length < ancho * alto) return null;
    var g = suavizarBinomial(gris, ancho, alto);
    var todos = mosaicosDe(g, ancho, alto);
    var piso = percentil(todos.map(function (t) { return t.pobre; }), PISO_DE_GRANO);
    var aqui = todos.filter(function (t) { return t.contraste >= MOSAICO_VARIANZA_MIN; });
    if (!aqui.length) return null;
    return aqui.map(function (t) { return 1000 * Math.max(0, t.pobre - piso) / t.contraste; });
  }
  /**
   * @param gris  luminancias 0..255 de la cédula a ~480 px de ancho
   * @returns número ≥ 0 (0 si no hay ningún mosaico con algo que enfocar)
   */
  function nitidezDeGris(gris, ancho, alto) {
    var v = valoresDeMosaicos(gris, ancho, alto);
    return v ? percentil(v, 0.5) : 0;
  }

  /* ==========================================================================
   * LA CALIDAD QUE JUZGA LA VENTANA — 23 de octubre de 2026
   *
   * La mediana de nitidezDeGris es la del CRM y se queda como está (la prueba
   * las compara número a número). Pero como PISO de la foto tenía un defecto
   * medido el 23-oct (verificación del autollenado y la demo de ese día): la
   * mediana la decide la MITAD de los mosaicos, y en dos cédulas de la calle
   * esa mitad no dice nada del enfoque:
   *   · un PDF417 MUY GASTADO: sus mosaicos (un tercio de la tarjeta) salen
   *     lisos aunque la cámara esté enfocada, y arrastran la mediana a 29 con
   *     las letras perfectas (4K, σ 1,5 módulos): «Aléjala…» para siempre;
   *   · un FRENTE LISO (la demo del 23-oct): colores planos, el rectángulo de
   *     la foto y letras grandes. Los mosaicos de un solo borde recto miden
   *     casi 0 en la dirección del borde, estén nítidos o no, y son la mitad:
   *     la mediana daba 6 con la tarjeta enfocada.
   * En las dos, los mosaicos con letra (lo que de verdad se ve borroso cuando
   * la cámara no enfoca) están en el cuarto de arriba. Por eso la ventana
   * juzga con el MAYOR de la mediana y del percentil 75 llevado a la misma
   * escala: pasa el piso si la mediana llega a PISO_NITIDEZ (como siempre) o
   * si el cuarto más nítido llega a PISO_CUARTIL.
   *
   * SIN ACEPTAR FOTOS BORROSAS: un desenfoque de cámara baja TODOS los
   * mosaicos, también los de letra. Medido el 23-oct con las cédulas de
   * pruebas/cedula-ocr-*.pgm.gz (lisas, con textura, con el PDF417 legible,
   * borroso y gastado), la digital y las dos de la demo, en video 4K (la
   * tarjeta a 1.814 px: el doble de los 907 de la tabla de arriba) y 1080:
   *   · con una caja de 9 px a 4K (σ ≈ 1,3 px a 907) no pasa ningún frente,
   *     ni liso ni con textura, ni el respaldo gastado;
   *   · con una de 13 px (σ ≈ 1,9) no pasa ninguna cédula;
   *   · lo que cambia queda del lado que la tabla de arriba ya quería dejar
   *     pasar (σ ≤ 1,5): el frente con textura con una caja de 7 px (σ ≈ 1)
   *     da 37,6 donde la mediana daba 31,7.
   * Son tarjetas fabricadas: se recalibra con las primeras de verdad, como el
   * PISO_NITIDEZ.
   * ======================================================================== */
  function calidadDeGris(gris, ancho, alto) {
    var v = valoresDeMosaicos(gris, ancho, alto);
    if (!v) return 0;
    return Math.max(percentil(v, 0.5), percentil(v, 0.75) * CAPTURA.PISO_NITIDEZ / CAPTURA.PISO_CUARTIL);
  }

  /**
   * A qué tamaño se dibuja el recorte para medirlo: ANCHO_MEDIDA de ancho, o
   * el suyo si es más chico (agrandar no agrega nitidez, la inventa).
   * @returns {w, h} o null
   */
  function tamanoDeMedida(w, h) {
    w = num(w); h = num(h);
    if (!(w >= 16 && h >= 8)) return null;
    var mw = Math.min(CAPTURA.ANCHO_MEDIDA, Math.round(w));
    return { w: mw, h: Math.max(8, Math.round(mw * h / w)) };
  }

  /* ==========================================================================
   * LA VENTANA DEL MEJOR CUADRO
   *
   * Con la tarjeta en verde, cada medida entra a la ventana. La página dibuja
   * el recorte a resolución completa SOLO cuando el cuadro es el mejor visto
   * (esMejor), en UN lienzo reutilizado; ese es el que se lee y el que se
   * dispara. Así no se paga la resolución completa diez veces por segundo, y
   * la foto que se guarda es la más nítida y no la sexta quieta.
   *
   * La ventana es de UNA racha en verde: si la tarjeta se mueve, se tira
   * entera. Lo que se vio antes puede ser de la otra cara (la persona la
   * volteó), y la reja del frente y del respaldo depende de eso.
   * ======================================================================== */
  function ventanaNueva(ahora) {
    return { t0: num(ahora), medidas: 0, mejor: 0, nMejor: 0 };
  }
  /** ¿Este cuadro supera al mejor que ya está guardado? */
  function esMejor(v, nitidez) {
    var n = num(nitidez);
    return !!v && n > 0 && n > num(v.mejor);
  }
  /**
   * Anota una medida. `guardado`: la página SÍ dibujó este cuadro en el lienzo
   * del mejor (no lo dibuja mientras el lector nativo está leyendo el anterior:
   * la foto que se guarde tiene que ser la que se leyó). Solo lo guardado
   * cuenta como «el mejor», porque es lo que se va a disparar.
   */
  function anotarMedida(v, nitidez, guardado) {
    var b = v || ventanaNueva(0);
    var o = { t0: b.t0, medidas: num(b.medidas) + 1, mejor: num(b.mejor), nMejor: num(b.nMejor) };
    if (guardado && esMejor(b, nitidez)) { o.mejor = num(nitidez); o.nMejor = o.medidas; }
    return o;
  }
  function ventanaCerrada(v, ahora) {
    if (!v) return false;
    if (num(v.medidas) >= CAPTURA.MEDIDAS_VENTANA) return true;
    return num(v.medidas) >= CAPTURA.MEDIDAS_MIN && (num(ahora) - num(v.t0)) >= CAPTURA.MS_VENTANA_MAX;
  }
  function avanceDeVentana(v, ahora) {
    if (!v) return 0;
    var a = Math.max(num(v.medidas) / CAPTURA.MEDIDAS_VENTANA,
                     num(v.medidas) >= CAPTURA.MEDIDAS_MIN ? (num(ahora) - num(v.t0)) / CAPTURA.MS_VENTANA_MAX : 0);
    return Math.max(0, Math.min(1, a));
  }

  /**
   * ¿Qué se hace con la ventana?
   * @param v  la ventana (ventanaNueva + anotarMedida)
   * @param e  {lado: 'reverso'|'frente', ahora,
   *            vioCodigo: en ESTA racha se vio un código (PDF417 leído o
   *              encontrado sin leer, el patrón de sus barras, o un QR),
   *            limpias: miradas de esta racha que no vieron ninguno (frente),
   *            leyendo: el lector nativo está leyendo (asíncrono),
   *            lectorListo: ya bajó ZXing o hay detector nativo,
   *            msVerde: cuánto lleva este lado en verde,
   *            vioFranja: 23-oct-2026 — en ESTA racha se vio la franja de
   *              las barras en su sitio, sin código visto (el PDF417 gastado)}
   * @returns {estado, disparar, avance}
   *   'midiendo'   la ventana sigue abierta;
   *   'esperando'  cerrada y buena, pero falta algo que no tarda (el lector
   *                bajando, una lectura en vuelo, la primera mirada del frente);
   *   'disparar'   se toma la foto con el mejor cuadro;
   *   'alejala'    el mejor no pasó el piso: nada se toma, y se pide distancia
   *                (con la cédula acostada lo que desenfoca es tenerla cerca);
   *   'sin_codigo' respaldo nítido sin ningún código ni franja de barras: casi
   *                seguro es el frente;
   *   'con_codigo' frente nítido CON código: es el respaldo sin voltear.
   *   Los tres últimos cierran la ventana: la página empieza otra.
   */
  function decidirVentana(v, e) {
    var x = e || {}, ahora = num(x.ahora);
    var avance = avanceDeVentana(v, ahora);
    var r = function (estado) { return { estado: estado, disparar: estado === 'disparar', avance: avance }; };
    if (!v || !ventanaCerrada(v, ahora)) return r('midiendo');
    if (num(v.mejor) < CAPTURA.PISO_NITIDEZ) return r('alejala');
    var codigo = x.vioCodigo === true;
    if (x.lado === 'frente') {
      if (codigo) return r('con_codigo');
      return r(num(x.limpias) >= 1 ? 'disparar' : 'esperando');
    }
    /* El respaldo. Una lectura en vuelo puede traer la cédula: se espera. */
    if (x.leyendo) return r('esperando');
    if (!codigo) {
      /* Sin lector todavía no se puede decir «no hay código»: solo se miró el
         patrón de barras, y un QR no tiene patrón de barras. */
      if (!x.lectorListo && num(x.msVerde) < CAPTURA.MS_SIN_LECTOR) return r('esperando');
      /* 23-oct-2026 — LA FRANJA DE LAS BARRAS, SIN CÓDIGO VISTO. Un PDF417 muy
         gastado no lo encuentra el lector ni deja ver su patrón, pero sus
         barras siguen ahí: una franja de filas «de barras» en el tercio de
         abajo (o de arriba, al revés) de la tarjeta (EscanerCedula.
         franjaComoLaDelCodigo). Decirle «si es el frente, voltéala» a quien
         ya muestra el respaldo lo dejaba dando vueltas para siempre. Con la
         franja se le da al lector su rato y, si no lee, se toma la foto sin
         datos, como con un código visto sin leer. La franja NO prueba la
         amarilla para las letras (capturarDoc mira el recorte otra vez). */
      if (x.vioFranja === true) return r(num(x.msVerde) >= CAPTURA.MS_SOLO_FRANJA ? 'disparar' : 'esperando');
      return r('sin_codigo');
    }
    if (!x.lectorListo && num(x.msVerde) < CAPTURA.MS_SIN_LECTOR) return r('esperando');
    return r('disparar');
  }

  /* ==========================================================================
   * LA LINTERNA
   * ======================================================================== */
  /** La oscuridad acumulada, con la banda de histéresis. */
  function acumularOscura(ms, luz, dt) {
    var l = num(luz), d = Math.max(0, num(dt));
    if (l < LINTERNA.LUZ_PRENDER) return num(ms) + d;
    if (l > LINTERNA.LUZ_PRENDER + LINTERNA.BANDA) return 0;
    return num(ms);
  }
  /**
   * @param e {puede: la cámara anuncia torch (getCapabilities),
   *           autorizado: la persona tocó «Autorizo y escaneo» en este intento,
   *           prendida, vetada: la apagó la persona o un reflejo,
   *           luz, saturados (de EscanerCedula.medirTarjeta), msOscura, msBorrosa}
   * @returns {accion: 'prender'|'apagar'|'', motivo: 'poca_luz'|'borrosa'|'reflejo'|'',
   *           pedirLuz: bool}
   *   pedirLuz: hace falta luz y este teléfono no deja prenderla (el iPhone sin
   *   torch): la pantalla le pide a la persona que la busque.
   */
  function decidirLinterna(e) {
    var x = e || {}, nada = { accion: '', motivo: '', pedirLuz: false };
    /* Antes del toque de autorización la cámara no existe, y la linterna es de
       la cámara: nunca se prende sola en una página que nadie autorizó. */
    if (x.autorizado !== true) return nada;
    var reflejo = num(x.saturados) > LINTERNA.REFLEJO_MAX;
    if (x.prendida) return reflejo ? { accion: 'apagar', motivo: 'reflejo', pedirLuz: false } : nada;
    var oscura = num(x.msOscura) >= LINTERNA.MS_OSCURA;
    var borrosa = num(x.msBorrosa) >= LINTERNA.MS_BORROSA && num(x.luz) < LINTERNA.LUZ_AYUDA;
    if (!oscura && !borrosa) return nada;
    var motivo = oscura ? 'poca_luz' : 'borrosa';
    if (x.puede !== true) return { accion: '', motivo: motivo, pedirLuz: true };
    /* Con un reflejo a la vista, prenderla lo empeora; y la que se apagó por
       reflejo (o la apagó la persona) no vuelve sola. */
    if (x.vetada || reflejo) return nada;
    return { accion: 'prender', motivo: motivo, pedirLuz: false };
  }

  /* ==========================================================================
   * LA CÁMARA, LO QUE DIO, Y LOS CÓDIGOS
   * ======================================================================== */
  /** Lo que se le pide a getUserMedia. Ver CAMARA. */
  function pedidoDeCamara() {
    return { video: { facingMode: { ideal: 'environment' },
                      width: { ideal: CAMARA.ANCHO_IDEAL }, height: { ideal: CAMARA.ALTO_IDEAL } },
             audio: false };
  }
  /**
   * Lo que la cámara DE VERDAD entregó (track.getSettings()): «ideal» no es una
   * promesa, y un teléfono de 1080 da 1080 aunque se le pida 4K.
   * @returns {ancho, alto, corto, conocida, suficiente}
   */
  function resolucionEfectiva(s) {
    var w = Math.round(num(s && s.width)), h = Math.round(num(s && s.height));
    var corto = Math.min(w, h);
    return { ancho: w, alto: h, corto: corto, conocida: !!(w && h), suficiente: corto >= CAMARA.CORTO_MIN };
  }
  /**
   * Los formatos que se le piden al detector nativo, de los que dice tener.
   * El QR entra el 21-oct-2026: es lo único que distingue el lado de atrás de
   * la cédula digital, que no trae PDF417.
   */
  function formatosDelDetector(soportados) {
    var s = Array.isArray(soportados) ? soportados : [];
    return ['pdf417', 'qr_code'].filter(function (f) { return s.indexOf(f) >= 0; });
  }
  /**
   * Lo que devolvió el detector nativo, separado por formato.
   * @returns {pdf417: el texto del PDF417 o '', qr: bool}
   * SOLO el PDF417 se convierte en datos (lleva corrección de errores y es lo
   * único que puede contar como «la cédula leída»). Del QR se dice que estaba,
   * y nada más: en la cédula digital es biometría cifrada, y su texto no sale
   * de esta función ni para guardarse ni para mirarse.
   */
  function clasificarCodigos(codigos) {
    var out = { pdf417: '', qr: false };
    (Array.isArray(codigos) ? codigos : []).forEach(function (k) {
      if (!k) return;
      if (k.format === 'pdf417' && k.rawValue && !out.pdf417) out.pdf417 = String(k.rawValue);
      else if (k.format === 'qr_code') out.qr = true;
    });
    return out;
  }
  /**
   * ¿Hay un QR en estas luminancias? Con el ZXing del sitio, UNA vez, sin
   * reintentos (la misma regla que EscanerCedula.decodificarLuminancias).
   * Solo cuenta un QR LEÍDO: «encontré algo parecido a las tres esquinas pero
   * no lo pude leer» lo puede dar la letra del frente, y tomar el frente por
   * respaldo lo deja sin disparo. El texto se descarta aquí mismo.
   * @returns {hay: bool, sinLector: bool}
   */
  function buscarQr(Z, gris, w, h) {
    if (!Z || !Z.QRCodeReader || !Z.RGBLuminanceSource || !Z.HybridBinarizer || !Z.BinaryBitmap) {
      return { hay: false, sinLector: true };
    }
    if (!gris || !w || !h || gris.length !== w * h) return { hay: false, sinLector: false };
    try {
      var mapa = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(gris, w, h)));
      var r = new Z.QRCodeReader().decode(mapa, null);
      return { hay: !!r, sinLector: false };
    } catch (e) {
      return { hay: false, sinLector: false };
    }
  }

  /**
   * La franja que se le da al lector del PDF417, en filas del recorte a
   * resolución completa: la franja del código vista en el gris de la medida
   * (EscanerCedula.franjaDeBarras), con aire arriba y abajo para la inclinación
   * y la zona blanca. 21-oct-2026 — con video 4K el recorte entero son ~8 MB
   * de píxeles más su gris y los mapas de ZXing, cuatro veces por segundo: el
   * mismo tipo de pico que ya tumbó la pestaña (pruebas/foto-cedula-no-
   * tumba.test.js). La franja es un tercio de eso.
   * @param franja {y0, y1} en filas del gris de la medida (o null)
   * @returns {y0, y1} en filas del recorte, o null (se lee el recorte entero)
   */
  function bandaDeLectura(franja, altoMedida, altoRecorte) {
    var hm = num(altoMedida), hr = num(altoRecorte);
    if (!franja || !(hm > 0) || !(hr > 0)) return null;
    var k = hr / hm;
    var a = num(franja.y0) * k, b = num(franja.y1) * k;
    if (!(b > a)) return null;
    /* Media franja de aire, y nunca menos del 8 % del alto: la franja se mide
       a 480 px y con algo de desenfoque sale más angosta que el código; los
       giros de rescate (±4°) corren las filas hasta ~3,5 % del ancho. */
    var aire = Math.max((b - a) * 0.5, hr * 0.08);
    var y0 = Math.max(0, Math.floor(a - aire)), y1 = Math.min(hr, Math.ceil(b + aire));
    if (y1 - y0 < 8) return null;
    return { y0: y0, y1: y1 };
  }

  return {
    VERSION: '2026-10-21',
    CAPTURA: CAPTURA,
    CAMARA: CAMARA,
    LINTERNA: LINTERNA,
    TEXTO: TEXTO,
    nitidezDeGris: nitidezDeGris,
    calidadDeGris: calidadDeGris,
    tamanoDeMedida: tamanoDeMedida,
    ventanaNueva: ventanaNueva,
    esMejor: esMejor,
    anotarMedida: anotarMedida,
    ventanaCerrada: ventanaCerrada,
    avanceDeVentana: avanceDeVentana,
    decidirVentana: decidirVentana,
    acumularOscura: acumularOscura,
    decidirLinterna: decidirLinterna,
    pedidoDeCamara: pedidoDeCamara,
    resolucionEfectiva: resolucionEfectiva,
    formatosDelDetector: formatosDelDetector,
    clasificarCodigos: clasificarCodigos,
    buscarQr: buscarQr,
    bandaDeLectura: bandaDeLectura
  };
});
