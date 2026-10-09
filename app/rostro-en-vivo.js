/* ============================================================================
 * LA SELFIE QUE SE TOMA SOLA — 8 de octubre de 2026
 *
 * Joan: «al momento de tomar la foto selfie quiero que también se haga
 * automáticamente, quiero que el teléfono la enfoque y que se escanee, y
 * cuando esté centrada la cara y enfocada tome la foto automáticamente, y que
 * parezca más como reconocimiento facial».
 *
 * HASTA HOY EL TELÉFONO NO BUSCABA LA CARA. Medía un ENCUADRE (app/cuenta.js,
 * medirEncuadre): luz, detalle en el centro del óvalo y quietud. Un cartón con
 * una foto pasaba, y una cara a un lado del óvalo a veces no. Ahora busca la
 * cara de verdad, con el detector chico de face-api que ya vive en el sitio
 * (app/lib/rostro, el mismo archivo que usa el CRM), y dispara cuando hay UNA
 * sola cara, centrada, cerca, nítida y quieta unos cuadros seguidos.
 *
 * LA FRONTERA, Y POR QUÉ ESTÁ AQUÍ Y NO EN LA PÁGINA:
 *   · Solo se carga el DETECTOR (dónde hay una cara: una caja y un puntaje).
 *     Nada de los otros dos modelos de la carpeta —el de los puntos de la cara
 *     y el que saca el vector para comparar—: esos son del CRM, que compara la
 *     selfie con la cédula en el computador de quien revisa.
 *   · La caja vive en la memoria del bucle y muere con él. Este archivo no
 *     guarda, no manda y no le devuelve a nadie más que cajas y números de
 *     encuadre. Lo único que sale del teléfono es la FOTO, como antes.
 *   · La página no carga esto hasta el paso del rostro, y ese paso solo existe
 *     con la autorización de datos sensibles marcada.
 *   La política (legal/privacidad.html, «La foto de tu cara, que se toma sola»)
 *   dice exactamente esto, y pruebas/selfie-automatica.test.js vigila que siga
 *   siendo cierto: si un día aquí se pide otro modelo, la prueba se cae.
 *
 * LO QUE SE PUEDE PROBAR SIN TELÉFONO está separado de lo que no: la decisión
 * (medirRostro, contarRacha, nitidezDe) son números que entran y salen; la
 * carga del detector necesita un navegador con WebGL y se prueba con un
 * face-api de mentira. Si el detector no llega (sin señal para bajar 1,3 MB,
 * un teléfono sin WebGL), la página vuelve al encuadre de siempre: la
 * persona no se queda atascada por un adorno.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(raiz);
  else raiz.RostroEnVivo = fabrica(raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';

  /* Los umbrales, juntos y con nombre: son lo único que hay que calibrar
     mirando teléfonos de verdad. Estrictos, la persona se atasca con el
     celular en la cara; flojos, sale una foto lejana o movida. Por eso el
     botón manual nunca desaparece. */
  var ROSTRO = {
    PUNTAJE_MIN: 0.5,        // confianza del detector para contar una cara
    OTRA_CARA: 0.5,          // una segunda cara cuenta si mide la mitad de la principal o más
    CENTRO_TOL: 0.3,         // desvío del centro, en fracción de los radios del óvalo
    TAMANO_MIN: 0.4,         // alto de la cara / alto del óvalo: menos es «acércate»
    TAMANO_MAX: 1.0,         // más es «aléjate»
    MOVIMIENTO_MAX: 0.06,    // corrimiento entre dos detecciones, en fracción del óvalo
    CAMBIO_TAMANO_MAX: 0.12, // y cambio de tamaño (acercándose o alejándose)
    NITIDEZ_MIN: 6,          // ver nitidezDe: una pared lisa da casi cero
    NITIDEZ_RELATIVA: 0.8,   // y casi tan nítida como la mejor que se ha visto
    LUZ_MIN: 40,
    LUZ_MAX: 225,
    CUADROS: 4,              // detecciones buenas seguidas antes de disparar
    MS_ESPERA_DETECTOR: 8000,// si no llega en este rato, la página vuelve al encuadre
    ENTRADA: 224             // lado con que el detector mira (más grande = más lento)
  };

  /* El óvalo que dibuja la página (play/index.html, dibujarMarco), en
     fracciones del cuadro. Si allá cambia, acá también. */
  var OVALO = { cx: 0.5, cy: 0.5, rx: 0.32, ry: 0.36 };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /** La cara más grande con puntaje suficiente, o null. */
  function caraPrincipal(caras) {
    var mejor = null;
    (caras || []).forEach(function (k) {
      if (!k || num(k.score, 0) < ROSTRO.PUNTAJE_MIN || !(k.w > 0) || !(k.h > 0)) return;
      if (!mejor || k.h > mejor.h) mejor = k;
    });
    return mejor ? { x: +mejor.x, y: +mejor.y, w: +mejor.w, h: +mejor.h } : null;
  }

  /**
   * ¿Se puede disparar con lo que vio el detector?
   *
   * @param caras  [{x, y, w, h, score}] en fracciones del cuadro (0..1)
   * @param ctx    {luz, nitidez, mejorNitidez, previa}
   *               luz: promedio del óvalo (0..255); nitidez: nitidezDe() de la
   *               cara; mejorNitidez: la mejor vista; previa: la `cara` de la
   *               medida anterior (para saber si se mueve)
   * @returns {ok, falla, cara, caras, tamano, desvio, movimiento}
   *          falla: 'sin_cara' | 'varias' | 'poca_luz' | 'mucha_luz' | 'lejos' |
   *                 'cerca' | 'descentrada' | 'borrosa' | 'movimiento' | ''
   *          Solo números y una caja: aquí no hay nada más que la cara pueda dar.
   */
  function medirRostro(caras, ctx) {
    var c = ctx || {};
    var luz = num(c.luz, 128);
    var r = { ok: false, falla: '', cara: null, caras: 0, tamano: 0, desvio: 0, movimiento: 0 };
    var cara = caraPrincipal(caras);
    if (!cara) {
      r.falla = luz < ROSTRO.LUZ_MIN ? 'poca_luz' : (luz > ROSTRO.LUZ_MAX ? 'mucha_luz' : 'sin_cara');
      return r;
    }
    r.cara = cara;
    /* Otra cara de tamaño parecido: alguien al lado o detrás. Una carita
       chiquita al fondo (un afiche, alguien lejos) no frena a nadie. */
    var cuantas = 0;
    (caras || []).forEach(function (k) {
      if (k && num(k.score, 0) >= ROSTRO.PUNTAJE_MIN && k.h >= ROSTRO.OTRA_CARA * cara.h) cuantas++;
    });
    r.caras = cuantas;
    if (cuantas > 1) { r.falla = 'varias'; return r; }
    if (luz < ROSTRO.LUZ_MIN) { r.falla = 'poca_luz'; return r; }
    if (luz > ROSTRO.LUZ_MAX) { r.falla = 'mucha_luz'; return r; }

    var fx = cara.x + cara.w / 2, fy = cara.y + cara.h / 2;
    r.tamano = cara.h / (2 * OVALO.ry);
    r.desvio = Math.max(Math.abs(fx - OVALO.cx) / OVALO.rx, Math.abs(fy - OVALO.cy) / OVALO.ry);
    /* Primero la distancia y después el centro: a quien está lejos, «céntrate»
       no le sirve todavía; al acercarse se centra casi solo. */
    if (r.tamano < ROSTRO.TAMANO_MIN) { r.falla = 'lejos'; return r; }
    if (r.tamano > ROSTRO.TAMANO_MAX) { r.falla = 'cerca'; return r; }
    if (r.desvio > ROSTRO.CENTRO_TOL) { r.falla = 'descentrada'; return r; }

    var nit = num(c.nitidez, 0), mejor = num(c.mejorNitidez, 0);
    if (nit < ROSTRO.NITIDEZ_MIN || (mejor > 0 && nit < ROSTRO.NITIDEZ_RELATIVA * mejor)) {
      r.falla = 'borrosa'; return r;
    }
    /* Sin detección anterior no se sabe si está quieta: no es un fallo, es
       que todavía no se sabe. */
    var p = c.previa;
    if (!p || !(p.h > 0)) { r.falla = 'movimiento'; r.movimiento = 999; return r; }
    var px = p.x + p.w / 2, py = p.y + p.h / 2;
    r.movimiento = Math.max(Math.abs(fx - px) / (2 * OVALO.rx), Math.abs(fy - py) / (2 * OVALO.ry));
    var cambio = Math.abs(cara.h - p.h) / p.h;
    if (r.movimiento > ROSTRO.MOVIMIENTO_MAX || cambio > ROSTRO.CAMBIO_TAMANO_MAX) {
      r.falla = 'movimiento'; return r;
    }
    r.ok = true;
    return r;
  }

  /**
   * La racha: cuántas detecciones buenas seguidas, y si ya se dispara. Se cae
   * a cero con una sola mala — que es lo que la persona tiene que ver para
   * entender qué se le pide.
   */
  function contarRacha(estables, medida) {
    var e = medida && medida.ok ? (Math.max(0, +estables || 0) + 1) : 0;
    return { estables: e, disparar: e >= ROSTRO.CUADROS, avance: Math.min(1, e / ROSTRO.CUADROS) };
  }

  /**
   * Qué tan nítida está la cara: el cambio medio entre píxeles vecinos,
   * dividido por el contraste de la propia cara. Lo de dividir no es adorno:
   * con poca luz una cara NÍTIDA tiene gradientes chicos, y sin dividir se
   * leía como borrosa (el mismo error que el 2-oct se le quitó a la medida de
   * las fotos del CRM). Desenfocada o movida, el contraste se queda y los
   * bordes se ablandan: el número baja.
   *
   * @param gris  valores 0..255 de un cuadro de w×h (la cara, ya reducida)
   */
  function nitidezDe(gris, w, h) {
    var g = gris || [], n = g.length;
    if (!w || !h || w * h !== n || w < 4 || h < 4) return 0;
    var t = 0, k = 0, min = 255, max = 0, hist = new Uint32Array(256);
    for (var y = 0; y < h - 1; y++) {
      for (var x = 0; x < w - 1; x++) {
        var v = g[y * w + x];
        t += Math.abs(g[y * w + x + 1] - v) + Math.abs(g[(y + 1) * w + x] - v);
        k++;
      }
    }
    for (var i = 0; i < n; i++) { var q = g[i] | 0; hist[q < 0 ? 0 : (q > 255 ? 255 : q)]++; if (q < min) min = q; if (q > max) max = q; }
    /* Contraste robusto: del percentil 10 al 90, para que un brillo o un
       pelo negro no lo decidan solos. */
    var acc = 0, p10 = min, p90 = max, a = n * 0.1, b = n * 0.9, vistoA = false;
    for (var j = 0; j < 256; j++) {
      acc += hist[j];
      if (!vistoA && acc >= a) { p10 = j; vistoA = true; }
      if (acc >= b) { p90 = j; break; }
    }
    return k ? 100 * (t / k) / (p90 - p10 + 8) : 0;
  }

  /* La mejor nitidez vista, con memoria corta: se desinfla un poco en cada
     cuadro para que un destello raro no deje la vara imposible para siempre. */
  function mejorNitidez(mejor, nueva) {
    var m = num(mejor, 0) * 0.97;
    return Math.max(m, num(nueva, 0));
  }

  /* Lo que la persona lee. Cada frase dice qué hacer, no qué pasó. */
  var TEXTO = {
    sin_cara: 'Pon tu cara dentro del óvalo',
    varias: 'Que se vea solo tu cara',
    poca_luz: 'Busca un sitio con más luz',
    /* 8-oct-2026 (segunda vuelta) — decía «Demasiada luz atrás: date la
       vuelta», pero esto salta cuando la CARA está quemada (luz de frente o un
       flash). Una cara a contraluz se ve OSCURA y cae en poca_luz. */
    mucha_luz: 'Hay demasiada luz en tu cara: busca una luz más suave',
    lejos: 'Acércate un poco',
    cerca: 'Aléjate un poco',
    descentrada: 'Centra tu cara en el óvalo',
    borrosa: 'Quieto: estamos enfocando',
    movimiento: 'Quieto…',
    '': 'Quieto…'
  };
  function textoDeRostro(m) {
    if (!m) return TEXTO.sin_cara;
    return TEXTO[m.falla] !== undefined ? TEXTO[m.falla] : TEXTO.sin_cara;
  }

  /* De lo que devuelve face-api a cajas en fracciones del cuadro. Se copia
     SOLO la caja y el puntaje: lo demás que traiga el objeto no sale de aquí. */
  function cajasDe(resultados, w, h) {
    var out = [];
    if (!w || !h) return out;
    (resultados || []).forEach(function (d) {
      var b = d && (d.box || (d.detection && d.detection.box));
      if (!b) return;
      var s = d.score != null ? d.score : (d.detection ? d.detection.score : 0);
      out.push({ x: b.x / w, y: b.y / h, w: b.width / w, h: b.height / h, score: num(s, 0) });
    });
    return out;
  }

  /**
   * Baja face-api y SOLO el modelo del detector, desde el propio sitio.
   *
   * @param o {cargarScript(url) → Promise, base: carpeta de app/lib/rostro}
   *          cargarScript es el de la página: así un fallo se puede
   *          reintentar y una carga en vuelo no se duplica.
   * @returns Promise<{detectar(lienzo) → Promise<cajas>, liberar()}>
   */
  function crearDetector(o) {
    var op = o || {};
    var cargar = op.cargarScript;
    var base = String(op.base || '../app/lib/rostro').replace(/\/+$/, '');
    if (typeof cargar !== 'function') return Promise.reject(new Error('falta cargarScript'));
    return Promise.resolve(cargar(base + '/face-api.js')).then(function () {
      var fa = raiz.faceapi;
      if (!fa || !fa.nets || !fa.nets.tinyFaceDetector ||
          typeof fa.TinyFaceDetectorOptions !== 'function' || typeof fa.detectAllFaces !== 'function') {
        /* El service worker sin señal puede entregar otra cosa en vez del
           .js: el archivo «cargó» y el global no está. Eso es un fallo. */
        throw new Error('no cargó el detector de caras');
      }
      var red = fa.nets.tinyFaceDetector;
      var listo = fa.tf && typeof fa.tf.ready === 'function' ? fa.tf.ready() : null;
      return Promise.resolve(listo).then(function () {
        return red.isLoaded ? null : red.loadFromUri(base);
      }).then(function () {
        var opciones = new fa.TinyFaceDetectorOptions({ inputSize: ROSTRO.ENTRADA, scoreThreshold: ROSTRO.PUNTAJE_MIN * 0.8 });
        var vivo = true;
        return {
          detectar: function (lienzo) {
            if (!vivo || !lienzo) return Promise.resolve([]);
            var w = lienzo.width || lienzo.videoWidth, h = lienzo.height || lienzo.videoHeight;
            var tarea = fa.detectAllFaces(lienzo, opciones);
            return Promise.resolve(tarea && typeof tarea.run === 'function' ? tarea.run() : tarea)
              .then(function (rs) { return vivo ? cajasDe(rs, w, h) : []; });
          },
          /* Suelta la memoria del modelo (en el teléfono, memoria de la
             tarjeta gráfica) apenas se toma la foto: lo que viene después es
             la subida, y ahí hace falta. */
          liberar: function () {
            vivo = false;
            try { if (typeof red.dispose === 'function') red.dispose(); } catch (e) {}
          }
        };
      });
    });
  }

  return {
    VERSION: '2026-10-08',
    ROSTRO: ROSTRO,
    OVALO: OVALO,
    caraPrincipal: caraPrincipal,
    medirRostro: medirRostro,
    contarRacha: contarRacha,
    nitidezDe: nitidezDe,
    mejorNitidez: mejorNitidez,
    textoDeRostro: textoDeRostro,
    cajasDe: cajasDe,
    crearDetector: crearDetector
  };
});
