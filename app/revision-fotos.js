/* ============================================================================
 * LAS FOTOS DE UN REGISTRO, MIRADAS EN EL COMPUTADOR — 2 de octubre de 2026
 *
 * Hasta hoy el rostro y el código de barras se miraban con dos botones de la
 * ficha del CRM (compararRostro y cotejarConLaFoto, en panel/crm.html), y cada
 * uno llevaba su propia copia de cómo cargar la librería, cómo girar la foto y
 * qué opciones darle al detector. Joan pidió automatizar la revisión
 * (PLAN-CRM-OCTUBRE.md §2) y la página nueva, panel/revision.html, necesita
 * EXACTAMENTE lo mismo. Dos copias de lo mismo es una que se queda atrás: por
 * eso vive aquí, y los dos botones del CRM y la revisión llaman a esto.
 *
 * QUÉ HAY AQUÍ, Y NADA MÁS:
 *   · cargar face-api y ZXing DEL PROPIO SITIO (app/lib), nunca de un CDN: el
 *     CRM tiene la cartera entera en memoria y un script ajeno podría leerla;
 *   · la distancia entre el rostro de la selfie y el de la foto de la cédula;
 *   · volver a leer el PDF417 de la foto del reverso, con los mismos giros de
 *     rescate que usa la app;
 *   · medir tamaño, nitidez y brillo de una foto con la función PURA del motor
 *     (app/revision-registro.js: grisDeRGBA + medirFoto). Los umbrales y la
 *     cuenta viven allá, una sola vez; aquí solo se pasa la foto a píxeles.
 *
 * QUÉ NO HAY, A PROPÓSITO:
 *   · La regla del cotejo. Lo leído se le manda a la base (verificar_registro_
 *     foto) y la compara cedula_cotejar, allá y en ningún otro sitio.
 *   · Un veredicto sobre el rostro. Sale un número (la distancia) y si quedó
 *     por debajo del corte del motor. «Es la misma persona» no lo dice nadie.
 *
 * DATOS BIOMÉTRICOS (Ley 1581). Todo esto corre en el navegador del computador
 * de Joan. El descriptor del rostro (128 números) no sale de la función que lo
 * calcula: lo único que se devuelve es la distancia. Nada de aquí habla con la
 * red salvo para bajar las librerías del propio sitio.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(raiz);
  else raiz.RevisionFotos = fabrica(raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';

  /* De dónde bajar las librerías si quien llama no lo dice: al lado de este
     archivo. Se mira document.currentScript MIENTRAS el archivo se ejecuta,
     que es el único momento en que dice algo; así sirve igual desde panel/ que
     desde cualquier otra carpeta. El CRM pasa sus propias direcciones
     (URL_FACE_CRM, URL_ZXING_CRM…) y esas mandan. */
  var AQUI = (function () {
    try {
      var s = raiz.document && raiz.document.currentScript;
      if (s && s.src) return new URL('.', s.src).href;
    } catch (e) { /* sin URL o sin documento: el respaldo de abajo */ }
    return '../app/';
  })();

  /* El motor de reglas: de él salen el corte del rostro y la medida de las
     fotos. Sin él no se inventa nada: se dice que falta. */
  function motor() {
    var RR = raiz.RevisionRegistro;
    if (!RR && typeof require === 'function') {
      try { RR = require('./revision-registro.js'); } catch (e) { RR = null; }
    }
    if (!RR || !RR.UMBRALES) throw new Error('falta app/revision-registro.js');
    return RR;
  }

  /* ==========================================================================
   * CARGAR UN SCRIPT, UNA SOLA VEZ
   *
   * La versión que vivía en el CRM (cargarScriptCRM) daba por cargado un script
   * apenas veía su etiqueta, aunque todavía estuviera bajando: dos toques
   * seguidos y el segundo seguía sin librería. Aquí se guarda la PROMESA, y se
   * mira el global que el archivo publica, que es lo que de verdad importa: si
   * el service worker, sin señal, entrega index.html en lugar del .js, el
   * navegador dispara `load` igual y el global no aparece. Eso es un fallo y
   * se dice, en vez de seguir con una librería que no está.
   * ======================================================================== */
  var _cargas = {};
  function cargarScript(url, global) {
    if (global && raiz[global]) return Promise.resolve();
    if (_cargas[url]) return _cargas[url];
    var d = raiz.document;
    if (!d || !d.createElement) return Promise.reject(new Error('sin documento para cargar ' + url));
    var p = new Promise(function (res, rej) {
      var s = d.createElement('script');
      s.onload = function () {
        if (global && !raiz[global]) rej(new Error('no cargó ' + url));
        else res();
      };
      s.onerror = function () { rej(new Error('no cargó ' + url)); };
      s.src = url;
      (d.head || d.body).appendChild(s);
    });
    _cargas[url] = p;
    /* Un fallo no se queda guardado: el siguiente intento vuelve a pedirlo. */
    p.catch(function () { if (_cargas[url] === p) delete _cargas[url]; });
    return p;
  }

  /* ==========================================================================
   * EL ROSTRO
   * ======================================================================== */

  /* Las mismas opciones que usaba el botón del CRM desde el 8-sep: 416 px de
     entrada y un umbral de 0,4 para dar por encontrada una cara. */
  var OPCIONES_DETECTOR = { inputSize: 416, scoreThreshold: 0.4 };
  var REDES = ['tinyFaceDetector', 'faceLandmark68TinyNet', 'faceRecognitionNet'];

  var _rostro = null;
  /**
   * Baja face-api (@vladmandic/face-api 1.7.13, app/lib/ORIGEN.md) y sus tres
   * modelos. Una sola vez por página; si falla, el siguiente intento vuelve a
   * empezar.
   * @param opciones {face, modelos}  direcciones; por defecto, app/lib/rostro
   * @returns Promise<faceapi>
   */
  function cargarRostro(opciones) {
    var o = opciones || {};
    if (_rostro) return _rostro;
    var urlFace = o.face || AQUI + 'lib/rostro/face-api.js';
    var urlModelos = o.modelos || AQUI + 'lib/rostro';
    var p = cargarScript(urlFace, 'faceapi').then(function () {
      var fa = raiz.faceapi;
      return Promise.all(REDES.map(function (n) {
        var red = fa.nets && fa.nets[n];
        if (!red) throw new Error('face-api no trae ' + n);
        return red.isLoaded ? null : red.loadFromUri(urlModelos);
      })).then(function () { return fa; });
    });
    _rostro = p;
    p.catch(function () { if (_rostro === p) _rostro = null; });
    return p;
  }

  function descriptorDe(fa, img) {
    var opc = new fa.TinyFaceDetectorOptions(OPCIONES_DETECTOR);
    return fa.detectSingleFace(img, opc).withFaceLandmarks(true).withFaceDescriptor();
  }

  /* El «parecido» en porcentaje que pinta la ficha del CRM. Es la misma
     distancia dicha de otra forma, no una probabilidad. */
  function parecidoDeDistancia(d) {
    return Math.round(Math.max(0, Math.min(1, 1 - d / 1.2)) * 100);
  }

  /**
   * Compara el rostro de dos fotos ya cargadas (<img> o <canvas>).
   *
   * @returns Promise de
   *   {distancia, parecido, umbral, debajo}   si encontró las dos caras, o
   *   {sin_rostro: 'selfie'|'cedula'|'ambas'} si no.
   * Las dos formas son las que entiende el motor en `contexto.rostro`.
   * `debajo` dice si la distancia quedó por debajo del corte del motor
   * (UMBRALES.ROSTRO_DISTANCIA): una ayuda, no una identificación.
   */
  function compararRostros(imgSelfie, imgCedula, opciones) {
    var RR;
    try { RR = motor(); } catch (e) { return Promise.reject(e); }
    if (!imgSelfie || !imgCedula) return Promise.reject(new Error('no tengo las dos fotos a la vista'));
    try { noEsDemasiado(imgSelfie); noEsDemasiado(imgCedula); } catch (e) { return Promise.reject(e); }
    return cargarRostro(opciones).then(function (fa) {
      return Promise.all([descriptorDe(fa, imgSelfie), descriptorDe(fa, imgCedula)]).then(function (par) {
        var a = par[0], b = par[1];
        if (!a || !b) return { sin_rostro: (!a && !b) ? 'ambas' : (!a ? 'selfie' : 'cedula') };
        var d = Number(fa.euclideanDistance(a.descriptor, b.descriptor));
        if (!isFinite(d) || d < 0) throw new Error('la comparación no dio un número');
        var umbral = RR.UMBRALES.ROSTRO_DISTANCIA;
        return { distancia: d, parecido: parecidoDeDistancia(d), umbral: umbral, debajo: d < umbral };
      });
    });
  }

  /* ==========================================================================
   * EL CÓDIGO DE BARRAS DEL REVERSO
   * ======================================================================== */

  /**
   * Baja ZXing (app/lib/zxing.min.js), el escáner de la app
   * (app/escaner-cedula.js) y el lector del PDF417 (app/cuenta.js). En el CRM
   * cuenta.js ya está cargado y no se vuelve a pedir.
   * @param opciones {zxing, escaner, cuenta}  direcciones
   */
  function cargarLector(opciones) {
    var o = opciones || {};
    return Promise.all([
      cargarScript(o.zxing || AQUI + 'lib/zxing.min.js', 'ZXing'),
      cargarScript(o.escaner || AQUI + 'escaner-cedula.js', 'EscanerCedula'),
      cargarScript(o.cuenta || AQUI + 'cuenta.js', 'CuentaSocio')
    ]).then(function () {
      var EC = raiz.EscanerCedula, U = raiz.CuentaSocio, Z = raiz.ZXing;
      if (!EC || !U || !Z) throw new Error('no cargó el lector');
      return { EC: EC, U: U, Z: Z };
    });
  }

  /* Una foto más grande que FOTO_MAX no se dibuja (ver imagenDe): ni aquí ni
     en el detector de rostros. Vale también para los botones de la ficha del
     CRM, que le pasan un <img> ya pintado y no pasan por imagenDe. */
  function noEsDemasiado(img) {
    var w = Number(img && (img.naturalWidth || img.width)) || 0, h = Number(img && (img.naturalHeight || img.height)) || 0;
    if (w > FOTO_MAX.LADO || h > FOTO_MAX.LADO || w * h > FOTO_MAX.PIXELES) {
      var e = new Error('la foto mide ' + w + '×' + h + ' px');
      e.grande = { ancho: w, alto: h };
      throw e;
    }
  }

  /* La foto en un lienzo de su tamaño natural. */
  function lienzoDe(img) {
    noEsDemasiado(img);
    var d = raiz.document;
    var c = d.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    if (!c.width || !c.height) throw new Error('la foto no terminó de cargar');
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /* Los mismos giros de rescate que usa la app: el respaldo se fotografía de
     pie tan a menudo como acostado, y el lector solo lee acostado. Los de 2 y
     4 grados son para la foto tomada un poco torcida. */
  var GIROS = [0, 90, 180, 270, 2, -2, 4, -4];
  function girar(c, g) {
    var norma = ((g % 360) + 360) % 360;
    var recto = (norma > 45 && norma < 135) || (norma > 225 && norma < 315);
    var g2 = raiz.document.createElement('canvas');
    g2.width = recto ? c.height : c.width;
    g2.height = recto ? c.width : c.height;
    var x = g2.getContext('2d');
    x.translate(g2.width / 2, g2.height / 2);
    x.rotate(norma * Math.PI / 180);
    x.drawImage(c, -c.width / 2, -c.height / 2);
    return g2;
  }

  /**
   * Vuelve a leer el código de barras de la foto del reverso.
   * @returns Promise de la cédula leída ({documento, nombres, apellidos, …},
   *          lo que arma EscanerCedula.cedulaDelTexto) o null si no se pudo
   *          leer. null NO dice nada de los datos: la foto puede estar movida,
   *          con brillo, o ser una cédula nueva de plástico, que no lleva PDF417.
   */
  function leerCodigoDeImagen(img, opciones) {
    if (!img) return Promise.reject(new Error('no tengo la foto del respaldo a la vista'));
    try { noEsDemasiado(img); } catch (e) { return Promise.reject(e); }
    /* 2-oct-2026 — el error de CARGAR el lector va marcado (`carga`), para que
       quien llama lo distinga del de UNA foto: la revisión dejaba de leer el
       código de todos los que seguían porque una sola foto fallaba. */
    return cargarLector(opciones).then(null, function (e) {
      var x = e instanceof Error ? e : new Error(String(e && e.message || e || 'no cargó el lector'));
      x.carga = true;
      throw x;
    }).then(function (L) {
      var c = lienzoDe(img);
      for (var i = 0; i < GIROS.length; i++) {
        var lienzo = GIROS[i] ? girar(c, GIROS[i]) : c;
        var d = lienzo.getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, lienzo.width, lienzo.height).data;
        var r = L.EC.decodificarLuminancias(L.Z, L.EC.grisDeImageData(d, lienzo.width, lienzo.height),
          lienzo.width, lienzo.height);
        if (r && r.texto) {
          var ced = L.EC.cedulaDelTexto(L.U.leerCedulaPDF417, r.texto);
          if (ced) return ced;
        }
      }
      return null;
    });
  }

  /* ==========================================================================
   * MEDIR UNA FOTO
   * ======================================================================== */

  /**
   * Tamaño, nitidez, brillo y reflejo de una foto ya cargada. La cuenta es la
   * del motor (medirFoto): se le pasa la foto ENTERA, porque él reduce a su
   * medida y así la nitidez se compara siempre a la misma escala.
   * @param tipo  'documento' | 'selfie'
   * @param bytes lo que pesa (RevisionRegistro.bytesDeFoto del data: URL)
   * @returns lo que devuelve medirFoto, o null
   */
  function medirImagen(img, tipo, bytes) {
    var RR = motor();
    var c = lienzoDe(img);
    var d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    return RR.medirFoto(RR.grisDeRGBA(d, c.width, c.height), c.width, c.height,
      { tipo: tipo === 'selfie' ? 'selfie' : 'documento', bytes: bytes });
  }

  /* ==========================================================================
   * ABRIR UNA FOTO QUE LLEGÓ DE LA CALLE
   *
   * Las fotos del registro las escribe cualquiera desde play/. Solo pasa lo
   * que pasa la reja del motor (bytesDeFoto: base64 limpio de los formatos que
   * produce una cámara, la misma de fotoSegura en el CRM). Lo demás no se abre.
   * ======================================================================== */
  function fotoSegura(src) {
    var RR = motor();
    return RR.bytesDeFoto(src) === null ? '' : String(src);
  }

  /* EL TAMAÑO DE LO QUE SE ABRE (2-oct-2026). La reja de arriba mira los
     BYTES, y una foto chica en bytes puede ser enorme en píxeles: un PNG de
     16000×16000 de un solo color cabe en 330.000 caracteres y pasa la reja
     de la base (600.000). Al dibujarlo, cada copia en píxeles pesa casi 1 GB,
     y el reverso se gira ocho veces: el navegador se queda sin memoria o la
     pestaña se cae. Y como la bandeja viene de la más nueva a la más vieja,
     una sola de esas, subida por cualquiera desde play/, tumbaba la revisión
     de TODOS cada vez. La app guarda las fotos de hasta 900 px (la selfie,
     720): 2000 de lado y 4 megapíxeles es más del doble de cualquier foto
     suya. Lo que pasa de ahí no se dibuja: se rechaza con sus medidas, para
     que la página lo diga. */
  var FOTO_MAX = { LADO: 2000, PIXELES: 4000000 };

  /** @returns Promise<HTMLImageElement> ya cargada, y del tamaño de una foto. */
  function imagenDe(src) {
    var limpia;
    try { limpia = fotoSegura(src); } catch (e) { return Promise.reject(e); }
    if (!limpia) return Promise.reject(new Error('no es una foto'));
    var Img = raiz.Image;
    if (typeof Img !== 'function') return Promise.reject(new Error('este navegador no abre imágenes'));
    return new Promise(function (res, rej) {
      var img = new Img();
      img.onload = function () {
        var w = Number(img.naturalWidth) || 0, h = Number(img.naturalHeight) || 0;
        if (w > FOTO_MAX.LADO || h > FOTO_MAX.LADO || w * h > FOTO_MAX.PIXELES) {
          var e = new Error('la foto mide ' + w + '×' + h + ' px');
          e.grande = { ancho: w, alto: h };
          /* Se suelta: que el navegador no la siga guardando decodificada. */
          try { img.onload = img.onerror = null; img.src = ''; } catch (x) { /* nada que soltar */ }
          rej(e);
          return;
        }
        res(img);
      };
      img.onerror = function () { rej(new Error('la foto no se pudo abrir')); };
      img.src = limpia;
    });
  }

  return {
    cargarScript: cargarScript,
    cargarRostro: cargarRostro,
    compararRostros: compararRostros,
    parecidoDeDistancia: parecidoDeDistancia,
    cargarLector: cargarLector,
    leerCodigoDeImagen: leerCodigoDeImagen,
    medirImagen: medirImagen,
    fotoSegura: fotoSegura,
    imagenDe: imagenDe,
    GIROS: GIROS.slice(),
    FOTO_MAX: { LADO: FOTO_MAX.LADO, PIXELES: FOTO_MAX.PIXELES },
    OPCIONES_DETECTOR: { inputSize: OPCIONES_DETECTOR.inputSize, scoreThreshold: OPCIONES_DETECTOR.scoreThreshold }
  };
});
