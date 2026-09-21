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
  function medirTarjeta(gris, previa, w, h) {
    var g = gris || [], n = g.length;
    if (!n || !w || !h || w * h !== n || w < 16 || h < 8) {
      return { luz: 0, textura: 0, anillo: 0, nitidez: 0, movimiento: 999, ok: false, falla: 'sin_tarjeta' };
    }
    var x0 = Math.floor(w * 0.15), x1 = Math.ceil(w * 0.85);
    var y0 = Math.floor(h * 0.15), y1 = Math.ceil(h * 0.85);

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
      return texto ? { texto: String(texto) } : { error: 'ilegible' };
    } catch (e) {
      var nombre = (e && e.constructor && e.constructor.name) || (e && e.name) || '';
      if (Z.NotFoundException && e instanceof Z.NotFoundException) return { error: 'no_hay' };
      if (/NotFound/.test(nombre)) return { error: 'no_hay' };
      return { error: 'ilegible' };
    }
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
    delete r.rh;
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
    VERSION: '2026-09-21',
    PROPORCION: PROPORCION,
    HORAS_REGISTRO_VIVO: HORAS_REGISTRO_VIVO,
    TARJETA: TARJETA,
    GIROS_DE_RESCATE: GIROS_DE_RESCATE,
    grisDeImageData: grisDeImageData,
    medirTarjeta: medirTarjeta,
    textoDeTarjeta: textoDeTarjeta,
    rectanguloGuia: rectanguloGuia,
    decodificarLuminancias: decodificarLuminancias,
    cedulaDelTexto: cedulaDelTexto,
    fotosPertenecen: fotosPertenecen,
    checkpointFresco: checkpointFresco
  };
});
