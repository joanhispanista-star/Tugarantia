/* ============================================================================
 * LO QUE SE VE EN LA CÉDULA SE LLENA SOLO — 21 de octubre de 2026
 *
 * Joan: «que los datos no solo sean por medio del código de barras, quiero
 * que sea directamente de la información visible en las fotos de la cédula»,
 * y «si la información es visible en la cédula no quiero que nada se
 * diligencie a mano, quiero que sea lo más eficiente posible para el cliente
 * al momento de registrarse». Eligió «Todo desde la foto».
 *
 * QUÉ HACE: después de que el escáner dispara cada lado, lee las LETRAS
 * IMPRESAS (OCR, con Tesseract.js copiado en app/lib/ocr/) en unas pocas
 * franjas del recorte de la cédula amarilla:
 *   · frente  → el número (NUIP), los apellidos y los nombres;
 *   · respaldo → la fecha de nacimiento y la FECHA DE EXPEDICIÓN, que el
 *     código de barras no trae y era el único dato de identidad que se
 *     tecleaba siempre.
 * La página llena con eso las casillas VACÍAS que la persona no tocó, y la
 * persona confirma con un toque («Están bien») o corrige.
 *
 * LA FRONTERA, Y POR QUÉ ESTÁ AQUÍ (lo explicó la investigación del 21-oct,
 * result.ocr punto 1, y se le explicó a Joan):
 *   · Lo leído por OCR NO ES «la cédula leída». El PDF417 trae su propia
 *     corrección de errores; las letras de una foto no. Un dígito mal leído,
 *     metido en FOTOS.cedula_leida, tumbaría las fotos de la persona en la
 *     base ('otro_documento'), dejaría el número equivocado como dueño de sus
 *     fotos PARA SIEMPRE (base/20261020_la_cedula_de_la_cuenta.sql), borraría
 *     su registro por «otra persona» y se saltaría el «¿Es tuya?». Por eso lo
 *     leído vive aparte (la página lo guarda en FOTOS.cedula_vista, con
 *     fuente 'ocr') y este archivo NUNCA devuelve nada con forma de
 *     cedula_leida: devuelve campos sueltos para casillas.
 *   · Cuando el PDF417 se leyó, MANDA el PDF417 (número, nombres,
 *     nacimiento) y esto solo completa la expedición. Si el número impreso
 *     no es el del código, gana el código y queda una señal para Joan
 *     (`numero_distinto`), que nunca se le muestra a nadie como «verificado».
 *   · El RH, el sexo y la estatura NO pasan por el OCR: solo se recortan las
 *     franjas que hacen falta (ZONAS) —que son las de la AMARILLA: la página
 *     solo pide recortes con la amarilla PROBADA (21-oct-2026, verificación
 *     del lote 1: en el frente de la digital el bloque cae sobre el RH; ver
 *     «QUÉ CÉDULA ES EL RESPALDO GUARDADO» en play/index.html)—, y de lo
 *     que salga de cada franja solo se queda lo que tiene forma de fecha, de
 *     número o de nombre. Nada de eso se guarda (decisión del 22-sep,
 *     EC.cedulaDelTexto). El lugar de
 *     expedición se lee de pasada en la franja de la fecha y se tira: no se
 *     pide.
 *   · El texto crudo del OCR no sale de aquí: ni a la página, ni al disco, ni
 *     a la red. Solo salen campos ya validados.
 *
 * LA MEMORIA, que es la causa del rediseño del escáner (escaner-cedula.js,
 * 9-15): Tesseract es un motor WebAssembly de varios megas con su modelo. NO
 * corre en vivo junto a la cámara y ZXing: la página recorta las franjas en
 * el momento del disparo (unos cientos de KB, recortarDeLienzo) y las lee
 * cuando la cámara ya se apagó. El motor se crea para leer y se TERMINA al
 * acabar (terminar), y también al salir del registro.
 *
 * NADA SALE A TERCEROS: el motor, el núcleo y el modelo del español se bajan
 * del propio sitio (app/lib/ocr/, ver ORIGEN.md). Tesseract.js, si no se le
 * dicen las rutas, los baja de un CDN; por eso las tres rutas van SIEMPRE
 * (rutas) y pruebas/ocr-cedula.test.js se cae si aparece otro origen.
 *
 * CÓMO ESTÁ PARTIDO: lo que decide con texto y números (leer una fecha
 * impresa, un número, un nombre; el consenso; las validaciones; qué casillas
 * se llenan) es puro y se prueba con lecturas de OCR con ruido. Recortar y
 * preparar las franjas es aritmética sobre grises, también pura. Lo único que
 * necesita el motor es leerRecorte, que se prueba de punta a punta en Node
 * con el Tesseract.js copiado y una cédula fabricada.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(raiz);
  else raiz.OcrCedula = fabrica(raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';

  var VERSION = '2026-10-21';

  /* EscanerCedula trae revisarExpedicion y mismoDocumento: las MISMAS reglas
     que la página usa al tocar «Continuar». En el navegador es un global (lo
     carga play/ antes que esto); en Node se pide. */
  function ec() {
    if (raiz && raiz.EscanerCedula) return raiz.EscanerCedula;
    try { if (typeof require === 'function') return require('./escaner-cedula.js'); } catch (e) {}
    return null;
  }

  /* ==========================================================================
   * DÓNDE VIVE EL MOTOR — siempre en el propio sitio.
   * Las rutas son relativas a la carpeta app/. La página las da desde play/
   * ('../app/'), y Tesseract.js las resuelve contra la dirección de la página.
   * ======================================================================== */
  var RUTAS = {
    libreria: 'lib/ocr/tesseract.min.js',
    worker: 'lib/ocr/worker.min.js',
    /* Dos núcleos: el de SIMD (todo Android con Chrome de 2021 en adelante,
       iPhone desde iOS 16.4) y el de siempre, para el resto. Se escoge aquí
       y no en el worker porque el worker, con una carpeta, escoge también
       el de «relaxed SIMD», que serían otros 3,9 MB en el repo. */
    nucleoSimd: 'lib/ocr/tesseract-core-simd-lstm.wasm.js',
    nucleo: 'lib/ocr/tesseract-core-lstm.wasm.js',
    idioma: 'lib/ocr'   // ahí está spa.traineddata.gz (el español, solo LSTM)
  };
  /* El módulo más chico que solo valida si el navegador tiene SIMD. Son los
     mismos bytes que usa wasm-feature-detect dentro de worker.min.js. */
  var BYTES_SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
  function haySimd() {
    try {
      return typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function' &&
        WebAssembly.validate(new Uint8Array(BYTES_SIMD));
    } catch (e) { return false; }
  }
  /**
   * Las rutas completas, desde la carpeta app/ vista desde la página.
   * @param base  '../app/' desde play/; 'app/' desde la raíz.
   * @param simd  opcional: forzar (pruebas); si no viene, se pregunta.
   */
  function rutas(base, simd) {
    var b = String(base == null ? '' : base);
    if (b && b.charAt(b.length - 1) !== '/') b += '/';
    var s = simd === undefined ? haySimd() : !!simd;
    return {
      libreria: b + RUTAS.libreria,
      workerPath: b + RUTAS.worker,
      corePath: b + (s ? RUTAS.nucleoSimd : RUTAS.nucleo),
      langPath: b + RUTAS.idioma
    };
  }

  /* ==========================================================================
   * LAS FRANJAS DE LA CÉDULA AMARILLA — en fracciones de la tarjeta DERECHA
   * (acostada, el texto horizontal), del borde de la tarjeta, no del recorte.
   *
   * ESTO ES LO QUE HAY QUE CALIBRAR CON UNA CÉDULA DE VERDAD, y está dicho en
   * RECETA-OCR-CEDULA.md: las medidas salen del diseño público de la cédula
   * amarilla (frente: foto a la izquierda —como pide el escáner—, y a la
   * derecha NÚMERO, apellidos y nombres, cada valor ENCIMA de su rótulo;
   * respaldo: arriba la fecha de nacimiento, luego el lugar, luego la fila de
   * estatura, RH y sexo, luego la fecha y el lugar de expedición, y abajo el
   * código de barras), no de una tarjeta medida. Por eso:
   *   · las franjas tienen aire (la persona no pone la cédula exacta en el
   *     marco) y quien las lee busca la FORMA del dato (una fecha, un número,
   *     un nombre bajo su rótulo), no una posición exacta;
   *   · en el respaldo son DOS franjas finas y no un bloque: la fila del RH,
   *     el sexo y la estatura queda en medio y no se recorta nunca;
   *   · si una franja cae mal, no se lee nada y la casilla queda vacía: nunca
   *     se adivina.
   * `lista`: los caracteres que el motor puede contestar en esa franja.
   * `psm`: cómo la mira Tesseract (6 = un bloque de texto parejo).
   * ======================================================================== */
  var LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÑ';
  var DIGITOS = '0123456789';
  var ZONAS = {
    frente: [
      /* El bloque de texto de la derecha, sin el encabezado de arriba ni la
         firma de abajo. En el frente no hay datos de salud: lo que no sea
         número ni nombre se tira al leerlo. */
      { id: 'bloque', campos: ['documento', 'apellidos', 'nombres'],
        x0: 0.30, y0: 0.17, x1: 0.99, y1: 0.80, lista: LETRAS + DIGITOS + '. ', psm: 6 }
    ],
    reverso: [
      { id: 'nacimiento', campos: ['nacimiento'],
        x0: 0.01, y0: 0.02, x1: 0.68, y1: 0.17, lista: LETRAS + DIGITOS + '-. ', psm: 6 },
      { id: 'expedicion', campos: ['expedicion'],
        x0: 0.01, y0: 0.45, x1: 0.68, y1: 0.61, lista: LETRAS + DIGITOS + '-. ', psm: 6 }
    ]
  };
  /* Lo único que este archivo puede devolver, por lado. Una lista BLANCA: lo
     que no está aquí (el RH, el sexo, la estatura, los lugares) no existe
     para quien llama, aunque el motor lo haya visto. */
  var CAMPOS = { frente: ['documento', 'apellidos', 'nombres'], reverso: ['nacimiento', 'expedicion'] };

  /* El ancho al que se lleva la tarjeta antes de leer. A ese tamaño las
     letras de la cédula quedan de 30-45 px de alto, que es donde el modelo
     LSTM lee mejor; más grande solo cuesta tiempo. */
  var ANCHO_LECTURA = 1400;

  /* ==========================================================================
   * EL TEXTO: de lo que contesta el motor a un dato, o a nada.
   * ======================================================================== */
  var MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  /* Mayúsculas sin tildes, CON la Ñ: la cédula imprime así, y un modelo de
     español a veces devuelve una tilde que la tarjeta no tiene. */
  function mayus(t) {
    var s = String(t == null ? '' : t).toUpperCase().replace(/Ñ/g, '\u0001');
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s.replace(/\u0001/g, 'Ñ');
  }

  /* Las confusiones de siempre del OCR, en las dos direcciones. Solo se
     aplican donde el contexto ya dice qué se espera: en un número, una O es
     un cero; en un mes, un cero es una O. */
  var A_DIGITO = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', '|': '1', '!': '1', T: '1', Z: '2', S: '5', B: '8', G: '6' };
  var A_LETRA = { '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '8': 'B', '|': 'I' };
  function comoDigito(c) { return /[0-9]/.test(c) ? c : (A_DIGITO[c] || ''); }

  /**
   * El número de documento de un texto («NUMERO 52.123.456», con ruido).
   * Prefiere el que va después del rótulo NUMERO/NUIP; si no hay rótulo, el
   * más largo que tenga forma de cédula. Solo dígitos, sin los ceros de la
   * izquierda (como EC.normalizarDocumento), o '' si nada cuadra.
   */
  function normalizarNumero(texto) {
    var lineas = mayus(texto).split(/\n+/);
    var conRotulo = [], sinRotulo = [];
    lineas.forEach(function (l) {
      var m = /N[UV]M[EF]R[O0Q]|NUIP/.exec(l);
      var desde = m ? m.index + m[0].length : 0;
      var cands = candidatosNumero(l.slice(desde));
      (m ? conRotulo : sinRotulo).push.apply(m ? conRotulo : sinRotulo, cands);
    });
    var lista = conRotulo.length ? conRotulo : sinRotulo;
    var mejor = '';
    lista.forEach(function (c) { if (c.length > mejor.length) mejor = c; });
    return mejor;
  }
  function candidatosNumero(l) {
    var out = [];
    /* Rachas de caracteres que pueden ser dígitos, con puntos o espacios de
       separador de miles en medio. */
    var re = /[0-9OQDUILTZSBG|!][0-9OQDUILTZSBG|!., ]{3,18}/g, m;
    while ((m = re.exec(l))) {
      var crudo = m[0].replace(/[ .,]+$/, '');
      var reales = (crudo.match(/[0-9]/g) || []).length;
      var utiles = crudo.replace(/[., ]/g, '');
      /* Con puntos, tienen que ser de miles: «52.123.456», «1.020.304.050». */
      var conPuntos = /[.,]/.test(crudo);
      var grupos = crudo.replace(/ /g, '').split(/[.,]/);
      var deMiles = conPuntos && grupos.length >= 2 && grupos[0].length >= 1 && grupos[0].length <= 3 &&
        grupos.slice(1).every(function (g) { return g.length === 3; });
      if (conPuntos && !deMiles) continue;
      /* Una palabra como «SOLIS» son cinco «dígitos» posibles y ninguno de
         verdad: sin al menos dos tercios de dígitos reales no es un número.
         Con puntos de miles bien puestos alcanza con menos («1.O2O.3O4.O5O»):
         ninguna palabra viene partida de a tres. */
      if (!utiles.length || reales / utiles.length < (deMiles ? 0.4 : 0.66)) continue;
      var d = '';
      for (var i = 0; i < utiles.length; i++) d += comoDigito(utiles.charAt(i));
      if (d.length !== utiles.length) continue;
      d = d.replace(/^0+/, '');
      if (/^\d{5,10}$/.test(d)) out.push(d);
    }
    return out;
  }

  /* Las palabras impresas en la tarjeta que no son de nadie. */
  var NO_SON_NOMBRE = ['REPUBLICA', 'COLOMBIA', 'IDENTIFICACION', 'PERSONAL', 'CEDULA', 'CIUDADANIA',
    'NUMERO', 'NUIP', 'APELLIDOS', 'APELLIDO', 'NOMBRES', 'NOMBRE', 'FIRMA', 'REGISTRADOR', 'REGISTRADURIA',
    'NACIONAL', 'ESTADO', 'CIVIL', 'FECHA', 'LUGAR', 'NACIMIENTO', 'EXPEDICION'];
  var PARTICULAS = ['DE', 'LA', 'LE', 'EL', 'LO', 'DA', 'DI', 'DO', 'DU'];
  function esPalabraDeLaTarjeta(p) {
    for (var i = 0; i < NO_SON_NOMBRE.length; i++) {
      if (parecida(p, NO_SON_NOMBRE[i])) return true;
    }
    return false;
  }
  /* «APELLID0S», «NOMBRFS»: un carácter de diferencia en una palabra de 6 o
     más todavía es el rótulo. En palabras cortas no: «NUIP» y «NUÑEZ» no. */
  function parecida(a, b) {
    if (a === b) return true;
    if (b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
    return distancia(a, b) <= 1;
  }
  function distancia(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
    }
    return d[m][n];
  }

  /**
   * Un nombre (o unos apellidos) de una línea con ruido. Mayúsculas, sin
   * rótulos ni palabras del encabezado, sin letras sueltas (manchas del
   * holograma), con 0/1/5/8 vueltos letras dentro de palabras que ya son de
   * letras. '' si no queda nada creíble.
   */
  function normalizarNombre(texto) {
    var palabras = mayus(texto).replace(/[^A-ZÑ0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    var buenas = [];
    palabras.forEach(function (p) {
      var letras = (p.match(/[A-ZÑ]/g) || []).length;
      if (letras / p.length < 0.6) return;   // «1.65», «O+»: no es un nombre
      var q = '';
      for (var i = 0; i < p.length; i++) { var c = p.charAt(i); q += /[0-9]/.test(c) ? (A_LETRA[c] || '') : c; }
      if (!/^[A-ZÑ]+$/.test(q)) return;
      /* De dos letras, solo las partículas de los nombres («MARIA DE LOS
         ANGELES», «DE LA CRUZ»). «LL», «TE», «II» son lo que deja el
         holograma pegado al final de la línea. */
      if (q.length < 2 || (q.length === 2 && PARTICULAS.indexOf(q) < 0)) return;
      if (esPalabraDeLaTarjeta(q)) return;
      buenas.push(q);
    });
    /* Por lo menos una palabra de tres letras: dos letras sueltas («LL»,
       «TE») son lo que deja el holograma, no un apellido. */
    if (!buenas.length || buenas.length > 5 || !buenas.some(function (p) { return p.length >= 3; })) return '';
    var r = buenas.join(' ');
    return r.length >= 3 && r.length <= 60 ? r : '';
  }

  /* ¿La línea es un rótulo? Devuelve 'apellidos', 'nombres' o ''. */
  function rotuloDe(linea) {
    var ps = mayus(linea).replace(/[^A-ZÑ0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i].replace(/0/g, 'O');
      if (parecida(p, 'APELLIDOS') || parecida(p, 'APELLIDO')) return 'apellidos';
      if (parecida(p, 'NOMBRES') || p === 'NOMBRE') return 'nombres';
    }
    return '';
  }

  /**
   * El frente: número, apellidos y nombres de lo que contestó el motor para
   * el bloque de la derecha. El valor va ENCIMA de su rótulo en la cédula
   * amarilla; si el rótulo quedó en la misma línea, se toma lo que lo
   * acompaña, y si no se ve ningún rótulo, el orden: después del número, los
   * apellidos y luego los nombres.
   * @returns {documento, apellidos, nombres} con '' en lo que no se leyó.
   */
  function parsearFrente(texto) {
    var lineas = String(texto == null ? '' : texto).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var salida = { documento: normalizarNumero(texto), apellidos: '', nombres: '' };
    var usadas = {};
    var valorJunto = function (i) {
      /* El rótulo pegado al valor en la misma línea: «PEREZ GOMEZ APELLIDOS». */
      var v = normalizarNombre(lineas[i]);
      return v;
    };
    var nombreCerca = function (i) {
      for (var k = i - 1; k >= Math.max(0, i - 2); k--) {
        if (usadas[k] || rotuloDe(lineas[k]) || candidatosNumero(mayus(lineas[k])).length) continue;
        var v = normalizarNombre(lineas[k]);
        if (v) { usadas[k] = true; return v; }
      }
      return '';
    };
    lineas.forEach(function (l, i) {
      var r = rotuloDe(l);
      if (!r || salida[r]) return;
      var v = valorJunto(i) || nombreCerca(i);
      if (v) salida[r] = v;
    });
    if (!salida.apellidos || !salida.nombres) {
      /* Sin rótulos a la vista: el orden de la tarjeta. */
      var iNum = -1;
      lineas.forEach(function (l, i) { if (iNum < 0 && candidatosNumero(mayus(l)).length) iNum = i; });
      var resto = [];
      lineas.forEach(function (l, i) {
        if (i <= iNum || usadas[i] || rotuloDe(l)) return;
        var v = normalizarNombre(l);
        if (v) resto.push(v);
      });
      if (!salida.apellidos && !salida.nombres && resto.length >= 2) {
        salida.apellidos = resto[0]; salida.nombres = resto[1];
      }
    }
    /* Los dos iguales es una franja que leyó dos veces la misma línea: no se
       sabe cuál es cuál, y adivinar sería escribirle a alguien su nombre en
       la casilla de los apellidos. */
    if (salida.apellidos && salida.apellidos === salida.nombres) { salida.apellidos = ''; salida.nombres = ''; }
    return salida;
  }

  function diasDelMes(mes, anio) {
    return [31, (anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  }
  /* El mes en letras de la cédula. Primero se vuelven letras los dígitos que
     se confunden con letras («0CT», «AG0», «D1C», «A8R»), y si no cuadra
     exacto, el ÚNICO mes a una letra de distancia: «MAX» queda a una de MAR y
     de MAY y no se adivina. */
  function mesDe(t) {
    var s = '';
    for (var i = 0; i < t.length; i++) { var c = t.charAt(i); s += A_LETRA[c] || c; }
    var k = MESES.indexOf(s);
    if (k >= 0) return k + 1;
    var cerca = [];
    MESES.forEach(function (m, j) { if (distancia(m, s) === 1) cerca.push(j); });
    return cerca.length === 1 ? cerca[0] + 1 : 0;
  }
  /**
   * Una fecha impresa como en la cédula: DD-MMM-AAAA con el mes en letras
   * («24-OCT-1986»), con el ruido de siempre: «24-0CT-1986», «2O-ABR-2OO3»,
   * «15 MAR 1985», «15.MAR.1985», «15MAR1985». 'AAAA-MM-DD' o ''.
   * Si hay varias en el texto, la primera que sea una fecha de verdad.
   */
  function leerFechaImpresa(texto) {
    var s = mayus(texto).replace(/[–—_~=]/g, '-');
    var D = '[0-9OQDUILTZSBG|]';
    var re = new RegExp('(' + D + '{1,2})\\s*[-. ]?\\s*([A-Z0-9|]{3})\\s*[-. ]?\\s*(' + D + '{4})', 'g');
    var m;
    while ((m = re.exec(s))) {
      /* Sin lookbehind (Safari viejo no lo entiende y tumbaría el archivo):
         el día no puede venir pegado a otra palabra («NACIMIENTO15» sí vale,
         «AB12» no se toma como el día 12). */
      var antes = m.index > 0 ? s.charAt(m.index - 1) : ' ';
      var despues = s.charAt(m.index + m[0].length) || ' ';
      if (/[0-9]/.test(antes) || /[0-9]/.test(despues)) { re.lastIndex = m.index + 1; continue; }
      var dd = '', aa = '', i;
      for (i = 0; i < m[1].length; i++) dd += comoDigito(m[1].charAt(i));
      for (i = 0; i < m[3].length; i++) aa += comoDigito(m[3].charAt(i));
      var mes = mesDe(m[2]);
      if (dd.length !== m[1].length || aa.length !== 4 || !mes) { re.lastIndex = m.index + 1; continue; }
      var dia = Number(dd), anio = Number(aa);
      if (anio < 1900 || anio > 2100 || dia < 1 || dia > diasDelMes(mes, anio)) { re.lastIndex = m.index + 1; continue; }
      return anio + '-' + (mes < 10 ? '0' : '') + mes + '-' + (dia < 10 ? '0' : '') + dia;
    }
    return '';
  }

  /**
   * CONSENSO: un valor vale solo si por lo menos dos lecturas DISTINTAS de la
   * misma franja dijeron exactamente eso. Una sola lectura, o dos que no se
   * ponen de acuerdo, es '' — la casilla queda vacía y la persona escribe.
   */
  function consenso(valores) {
    var cuenta = {}, mejor = '', n = 0;
    (valores || []).forEach(function (v) {
      if (!v) return;
      cuenta[v] = (cuenta[v] || 0) + 1;
      if (cuenta[v] > n) { n = cuenta[v]; mejor = v; }
    });
    return n >= 2 ? mejor : '';
  }

  function hoyISO(d) {
    var x = d instanceof Date ? d : new Date();
    var m = x.getMonth() + 1, dd = x.getDate();
    return x.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function sumarAnios(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (Number(m[1]) + n) + '-' + m[2] + '-' + m[3] : '';
  }

  /**
   * Las validaciones, después del consenso: lo que no es creíble se tira.
   * @param campos {documento, apellidos, nombres, nacimiento, expedicion}
   * @param ctx    {hoy: 'AAAA-MM-DD', nacimientoLeido: el del PDF417 o ''}
   * @returns los mismos campos, con '' en lo que no pasó.
   */
  function validar(campos, ctx) {
    var c = {}, x = campos || {}, o = ctx || {};
    var hoy = /^\d{4}-\d{2}-\d{2}$/.test(o.hoy || '') ? o.hoy : hoyISO();
    c.documento = /^\d{5,10}$/.test(String(x.documento || '')) ? String(x.documento) : '';
    c.apellidos = String(x.apellidos || '');
    c.nombres = String(x.nombres || '');
    if (c.apellidos && c.apellidos === c.nombres) { c.apellidos = ''; c.nombres = ''; }

    /* La de nacimiento leída por OCR solo sirve para comprobar la de
       expedición: tiene que ser de alguien con 18 años cumplidos. */
    var nac = String(x.nacimiento || '');
    if (nac && !(nac >= '1900-01-01' && nac <= sumarAnios(hoy, -18))) nac = '';
    var exp = String(x.expedicion || '');
    /* La misma fecha en las dos franjas es una franja que cayó en la línea
       de la otra: no se sabe cuál es cuál. */
    if (nac && exp && nac === exp) { nac = ''; exp = ''; }
    if (exp) {
      /* Hay cédulas amarillas con la expedición ORIGINAL de los años 80 (el
         duplicado conserva la fecha): no se exige que sea de 2000 en adelante. */
      if (exp < '1930-01-01' || exp > hoy) exp = '';
    }
    /* Manda el nacimiento del código de barras si lo hay; si no, el leído. */
    var nacRef = /^\d{4}-\d{2}-\d{2}$/.test(o.nacimientoLeido || '') ? o.nacimientoLeido : nac;
    var E = ec();
    if (exp && E && E.revisarExpedicion) {
      if (!E.revisarExpedicion(exp, nacRef, hoy, 'Cédula de ciudadanía').ok) exp = '';
    } else if (exp && nacRef && exp < sumarAnios(nacRef, 18)) exp = '';
    c.nacimiento = nac;
    c.expedicion = exp;
    return c;
  }

  /* ==========================================================================
   * QUÉ CASILLAS SE LLENAN — la regla que la página aplica al terminar.
   * ======================================================================== */
  var CAMPOS_FORMULARIO = ['documento', 'apellidos', 'nombres', 'expedicion'];
  var CEDULA_DE_CIUDADANIA = 'Cédula de ciudadanía';
  /**
   * @param e {vista: campos validados del OCR,
   *           leida: FOTOS.cedula_leida de ESTE registro (PDF417) o null,
   *           registro: lo que hay escrito,
   *           tocados: {campo: true} lo que la persona tocó en esta página}
   * @returns {llenar: {campo: valor}, numero_distinto: true|false|undefined}
   *   · Con PDF417: solo la expedición. El número, los nombres y el
   *     nacimiento son del código, que corrige sus errores.
   *   · Sin PDF417: el número, los apellidos, los nombres y la expedición, y
   *     el tipo «Cédula de ciudadanía» (lo dice la tarjeta) si está vacío.
   *   · Nunca una casilla que tiene algo, ni una que la persona tocó (aunque
   *     la haya dejado vacía: borrar también es decidir).
   *   · Nunca con otro tipo de documento escogido: si la persona dijo que lo
   *     suyo es un pasaporte, la letra de una cédula no le llena nada.
   */
  function planDeLlenado(e) {
    var x = e || {}, v = x.vista || {}, reg = x.registro || {}, toc = x.tocados || {};
    var leida = x.leida && x.leida.documento ? x.leida : null;
    var plan = { llenar: {} };
    var E = ec();
    if (leida && v.documento) {
      plan.numero_distinto = !(E && E.mismoDocumento ? E.mismoDocumento(v.documento, leida.documento)
        : String(v.documento).replace(/^0+/, '') === String(leida.documento).replace(/\D/g, '').replace(/^0+/, ''));
    }
    var tipo = String(reg.tipo_doc || '');
    if (tipo && tipo !== CEDULA_DE_CIUDADANIA) return plan;
    var vacia = function (c) { return !toc[c] && (reg[c] === undefined || reg[c] === null || String(reg[c]).trim() === ''); };
    var candidatos = leida ? ['expedicion'] : CAMPOS_FORMULARIO;
    candidatos.forEach(function (c) { if (v[c] && vacia(c)) plan.llenar[c] = v[c]; });
    if (plan.llenar.documento && vacia('tipo_doc')) plan.llenar.tipo_doc = CEDULA_DE_CIUDADANIA;
    return plan;
  }

  /* ==========================================================================
   * LAS IMÁGENES: recortar, enderezar y preparar las franjas. Aritmética
   * sobre grises (0..255), sin lienzo, para que lo mismo corra en Node.
   * ======================================================================== */

  /* El rectángulo de una franja dentro de la imagen, sabiendo dónde está la
     tarjeta (`guia`, en píxeles de la imagen) y si la imagen está cabeza
     abajo (`giro` 180): entonces la franja está en el lugar espejado, y se
     endereza después de recortarla. */
  function rectDeZona(z, guia, giro, W, H) {
    var x0 = z.x0, x1 = z.x1, y0 = z.y0, y1 = z.y1;
    if (((+giro || 0) % 360 + 360) % 360 === 180) { var a = 1 - x1, b = 1 - y1; x1 = 1 - x0; y1 = 1 - y0; x0 = a; y0 = b; }
    var gx = guia ? guia.x : 0, gy = guia ? guia.y : 0, gw = guia ? guia.w : W, gh = guia ? guia.h : H;
    var rx = Math.max(0, Math.floor(gx + x0 * gw)), ry = Math.max(0, Math.floor(gy + y0 * gh));
    var rx1 = Math.min(W, Math.ceil(gx + x1 * gw)), ry1 = Math.min(H, Math.ceil(gy + y1 * gh));
    return { x: rx, y: ry, w: Math.max(0, rx1 - rx), h: Math.max(0, ry1 - ry) };
  }
  function recortarGris(g, W, r) {
    var o = new Uint8ClampedArray(r.w * r.h);
    for (var y = 0; y < r.h; y++) {
      var b = (r.y + y) * W + r.x;
      for (var x = 0; x < r.w; x++) o[y * r.w + x] = g[b + x];
    }
    return o;
  }
  function girar180(g) {
    var n = g.length, o = new Uint8ClampedArray(n);
    for (var i = 0; i < n; i++) o[i] = g[n - 1 - i];
    return o;
  }
  /* Luminancia con los pesos de ZXing (los mismos de EC.grisDeImageData). */
  function grisDeRGBA(d, n) {
    var g = new Uint8ClampedArray(n);
    for (var i = 0, j = 0; j < n; i += 4, j++) g[j] = (d[i] * 306 + d[i + 1] * 601 + d[i + 2] * 117) >> 10;
    return g;
  }

  /**
   * Las franjas de un lado, recortadas de unas luminancias. Es lo que se
   * guarda en memoria entre el disparo y la lectura: unos cientos de KB.
   * @param lado   'frente' | 'reverso'
   * @param gris   luminancias de la imagen (el recorte del escáner)
   * @param o      {giro: 0|180, guia: {x,y,w,h} dónde va la tarjeta en la imagen}
   * @returns {lado, ancho, zonas: [{id, campos, lista, psm, gris, w, h}],
   *           alterna: lo mismo girado 180° (solo el frente), o null}
   */
  function recortarDeGris(lado, gris, W, H, o) {
    var x = o || {}, zs = ZONAS[lado];
    if (!zs || !gris || !W || !H || gris.length !== W * H) return null;
    var guia = x.guia && x.guia.w > 0 && x.guia.h > 0 ? x.guia : { x: 0, y: 0, w: W, h: H };
    var una = function (giro) {
      return zs.map(function (z) {
        var r = rectDeZona(z, guia, giro, W, H);
        if (r.w < 8 || r.h < 8) return null;
        var g = recortarGris(gris, W, r);
        if (giro === 180) g = girar180(g);
        return { id: z.id, campos: z.campos.slice(), lista: z.lista, psm: z.psm, gris: g, w: r.w, h: r.h };
      }).filter(Boolean);
    };
    var giro = ((+x.giro || 0) % 360 + 360) % 360 === 180 ? 180 : 0;
    return { lado: lado, ancho: guia.w, zonas: una(giro),
             /* El frente no tiene con qué saber si quedó al revés (el respaldo
                sí: su código de barras). Si derecho no sale nada, se prueba
                girado: cuesta una lectura más, y solo cuando la primera falló. */
             alterna: lado === 'frente' ? una(giro === 180 ? 0 : 180) : null };
  }
  /**
   * Lo mismo, desde el lienzo del escáner, pidiéndole al lienzo SOLO las
   * franjas (getImageData de cada una): el respaldo completo nunca se
   * convierte en texto, y la fila del RH ni siquiera se copia.
   */
  function recortarDeLienzo(lado, lienzo, o) {
    var x = o || {}, zs = ZONAS[lado];
    if (!zs || !lienzo || !lienzo.width || !lienzo.height) return null;
    var cx = lienzo.getContext && lienzo.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    var W = lienzo.width, H = lienzo.height;
    var guia = x.guia && x.guia.w > 0 && x.guia.h > 0 ? x.guia : { x: 0, y: 0, w: W, h: H };
    var una = function (giro) {
      return zs.map(function (z) {
        var r = rectDeZona(z, guia, giro, W, H);
        if (r.w < 8 || r.h < 8) return null;
        var d;
        try { d = cx.getImageData(r.x, r.y, r.w, r.h).data; } catch (e) { return null; }
        var g = grisDeRGBA(d, r.w * r.h);
        if (giro === 180) g = girar180(g);
        return { id: z.id, campos: z.campos.slice(), lista: z.lista, psm: z.psm, gris: g, w: r.w, h: r.h };
      }).filter(Boolean);
    };
    var giro = ((+x.giro || 0) % 360 + 360) % 360 === 180 ? 180 : 0;
    return { lado: lado, ancho: guia.w, zonas: una(giro), alterna: lado === 'frente' ? una(giro === 180 ? 0 : 180) : null };
  }

  /* Escala bilineal: lleva la franja al tamaño en que el modelo lee mejor. */
  function escalar(g, w, h, k) {
    var nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    var o = new Uint8ClampedArray(nw * nh);
    for (var y = 0; y < nh; y++) {
      var sy = Math.min(h - 1, (y + 0.5) / k - 0.5), y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(h - 1, y0 + 1), fy = Math.max(0, sy - y0);
      for (var x = 0; x < nw; x++) {
        var sx = Math.min(w - 1, (x + 0.5) / k - 0.5), x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(w - 1, x0 + 1), fx = Math.max(0, sx - x0);
        var a = g[y0 * w + x0], b = g[y0 * w + x1], c = g[y1 * w + x0], d = g[y1 * w + x1];
        o[y * nw + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      }
    }
    return { gris: o, w: nw, h: nh };
  }
  /* Estira el contraste entre los percentiles 2 y 98: el fondo amarillo con
     hologramas queda casi blanco y la tinta casi negra, sin decidir todavía
     qué es tinta. */
  function estirar(g) {
    var hist = new Uint32Array(256), n = g.length, i;
    for (i = 0; i < n; i++) hist[g[i]]++;
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
    var o = new Uint8ClampedArray(n), r = Math.max(1, hi - lo);
    for (i = 0; i < n; i++) o[i] = (g[i] - lo) * 255 / r;
    return o;
  }
  /* Umbral local (media de la vecindad menos una constante), con la imagen
     integral: el respaldo tiene zonas más oscuras que otras por el
     holograma, y un umbral único se come las letras de la parte oscura. */
  function binarizarLocal(g, w, h, radio, c) {
    var I = new Float64Array((w + 1) * (h + 1)), x, y;
    for (y = 0; y < h; y++) {
      var fila = 0;
      for (x = 0; x < w; x++) { fila += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + fila; }
    }
    var o = new Uint8ClampedArray(w * h);
    for (y = 0; y < h; y++) {
      var ya = Math.max(0, y - radio), yb = Math.min(h, y + radio + 1);
      for (x = 0; x < w; x++) {
        var xa = Math.max(0, x - radio), xb = Math.min(w, x + radio + 1);
        var s = I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa];
        var media = s / ((yb - ya) * (xb - xa));
        o[y * w + x] = g[y * w + x] < media - c ? 0 : 255;
      }
    }
    return o;
  }
  /**
   * Las tres maneras de mirar una franja. El consenso pide que dos DISTINTAS
   * digan lo mismo: un error que sale de una forma de preparar la imagen no
   * suele repetirse en la otra.
   *   A: escalada y con el contraste estirado (lo que haría una persona);
   *   B: lo mismo, binarizada con umbral local (aguanta el holograma);
   *   C: otra escala, solo si A y B no se pusieron de acuerdo.
   */
  function preparar(z, anchoTarjeta, variante) {
    var k = Math.max(1, Math.min(3, ANCHO_LECTURA / Math.max(1, anchoTarjeta || z.w)));
    if (variante === 'C') k = Math.max(1, Math.min(3, k * 1.35));
    var e = escalar(z.gris, z.w, z.h, k);
    var g = estirar(e.gris);
    if (variante === 'B') g = binarizarLocal(g, e.w, e.h, Math.max(8, Math.round(e.h / 6)), 12);
    return { gris: g, w: e.w, h: e.h };
  }
  /* PGM binario (P5): el formato de imagen más simple que existe. Tesseract
     lo lee sin decodificar nada, y armarlo no cuesta ni un lienzo ni un
     toBlob en el teléfono. */
  function aPGM(g, w, h) {
    var cab = 'P5\n' + w + ' ' + h + '\n255\n', n = cab.length;
    var o = new Uint8Array(n + w * h);
    for (var i = 0; i < n; i++) o[i] = cab.charCodeAt(i);
    o.set(g, n);
    return o;
  }

  /* ==========================================================================
   * EL MOTOR — Tesseract.js, copiado en app/lib/ocr/.
   * ======================================================================== */
  /**
   * Crea el lector. `T` es window.Tesseract (lo baja la página de RUTAS); `r`,
   * lo que devuelve rutas(). Devuelve {leer(pgm, {lista, psm}) → texto,
   * terminar()}. Las tres rutas van SIEMPRE: sin ellas, Tesseract.js baja el
   * motor y el idioma de un CDN.
   */
  function crearLector(T, r) {
    if (!T || typeof T.createWorker !== 'function') return Promise.reject(new Error('sin_motor'));
    if (!r || !r.workerPath || !r.corePath || !r.langPath) return Promise.reject(new Error('sin_rutas'));
    var parametros = '';
    return T.createWorker('spa', 1 /* LSTM_ONLY: el modelo «best_int» no trae el motor viejo */, {
      workerPath: r.workerPath, corePath: r.corePath, langPath: r.langPath,
      /* Sin blob: el worker es un archivo del propio sitio, y así lo ve igual
         el navegador y la prueba de Node. */
      workerBlobURL: false,
      /* Sin IndexedDB: el modelo no se copia aparte en el teléfono; lo guarda
         la caché del navegador como cualquier archivo del sitio. */
      cacheMethod: 'none', gzip: true,
      logger: function () {}, errorHandler: function () {}
    }, {
      /* Sin diccionarios: los nombres propios y las fechas no son palabras
         del español, y el diccionario «corregiría» un apellido raro. */
      load_system_dawg: '0', load_freq_dawg: '0',
      /* Y sin el diario de Tesseract en la consola del teléfono («Image too
         small to scale!!» por cada mancha del holograma): no le sirve a nadie. */
      debug_file: '/dev/null'
    }).then(function (w) {
      return {
        leer: function (pgm, o) {
          var p = (o && o.lista || '') + '|' + (o && o.psm || '');
          var listo = p === parametros ? Promise.resolve()
            : w.setParameters({ tessedit_char_whitelist: (o && o.lista) || '', tessedit_pageseg_mode: String((o && o.psm) || 6) })
              .then(function () { parametros = p; });
          return listo.then(function () { return w.recognize(pgm); })
            .then(function (res) { return String((res && res.data && res.data.text) || ''); });
        },
        terminar: function () { try { return Promise.resolve(w.terminate()).catch(function () {}); } catch (e) { return Promise.resolve(); } }
      };
    });
  }

  /* De una lectura de una franja, los campos de esa franja. */
  function camposDeTexto(z, texto) {
    if (z.id === 'bloque') return parsearFrente(texto);
    var c = {};
    z.campos.forEach(function (k) { c[k] = leerFechaImpresa(texto); });
    return c;
  }
  function vacio(c) { return !Object.keys(c).some(function (k) { return !!c[k]; }); }

  /**
   * Lee las franjas de un lado con el lector y devuelve SOLO campos ya con
   * consenso y validados. El texto crudo no sale de aquí.
   * @param lector  el de crearLector (o uno de mentira en las pruebas)
   * @param recorte el de recortarDeGris / recortarDeLienzo
   * @param ctx     {hoy, nacimientoLeido} para validar
   * @returns Promise<{lado, campos: {…}, ms, lecturas}>
   */
  function leerRecorte(lector, recorte, ctx) {
    var t0 = Date.now();
    if (!lector || !recorte || !recorte.zonas) return Promise.resolve({ lado: recorte && recorte.lado, campos: {}, ms: 0, lecturas: 0 });
    var lecturas = 0;
    var leerZonas = function (zonas) {
      var votos = {};
      var cadena = Promise.resolve();
      zonas.forEach(function (z) {
        var mirar = function (variante) {
          var p = preparar(z, recorte.ancho, variante);
          lecturas++;
          return lector.leer(aPGM(p.gris, p.w, p.h), { lista: z.lista, psm: z.psm }).then(function (t) {
            var c = camposDeTexto(z, t);
            z.campos.forEach(function (k) { (votos[k] = votos[k] || []).push(c[k] || ''); });
          }, function () {});
        };
        cadena = cadena.then(function () { return mirar('A'); }).then(function () { return mirar('B'); })
          .then(function () {
            var falta = z.campos.some(function (k) { return !consenso(votos[k]) && (votos[k] || []).some(Boolean); });
            if (falta) return mirar('C');
          });
      });
      return cadena.then(function () {
        var c = {};
        CAMPOS[recorte.lado].forEach(function (k) { c[k] = consenso(votos[k]); });
        return c;
      });
    };
    return leerZonas(recorte.zonas).then(function (c) {
      if (!vacio(c) || !recorte.alterna || !recorte.alterna.length) return c;
      return leerZonas(recorte.alterna);
    }).then(function (c) {
      var v = validar(c, ctx);
      var solo = {};
      CAMPOS[recorte.lado].forEach(function (k) { if (v[k]) solo[k] = v[k]; });
      return { lado: recorte.lado, campos: solo, ms: Date.now() - t0, lecturas: lecturas };
    });
  }

  /**
   * EL ENGANCHE EN UNA LLAMADA, para quien ya tiene la cámara apagada y el
   * lector creado: recorta las franjas de `lado` del lienzo y las lee.
   * play/ NO lo usa así a propósito: recorta en el disparo (recortarDeLienzo)
   * y lee después, porque entre un lado y el otro la cámara sigue encendida y
   * el lienzo del escáner se reutiliza para el frente. Ver RECETA-OCR-CEDULA.md.
   * @param o {giro, guia, hoy, nacimientoLeido}
   * @returns Promise<{lado, campos, ms, lecturas}>
   */
  function leerLado(lector, lado, lienzo, o) {
    var x = o || {};
    var r = recortarDeLienzo(lado, lienzo, { giro: x.giro, guia: x.guia });
    if (!r) return Promise.resolve({ lado: lado, campos: {}, ms: 0, lecturas: 0 });
    return leerRecorte(lector, r, { hoy: x.hoy, nacimientoLeido: x.nacimientoLeido });
  }

  return {
    VERSION: VERSION,
    RUTAS: RUTAS,
    ZONAS: ZONAS,
    CAMPOS: CAMPOS,
    MESES: MESES,
    ANCHO_LECTURA: ANCHO_LECTURA,
    rutas: rutas,
    haySimd: haySimd,
    /* el texto */
    normalizarNumero: normalizarNumero,
    normalizarNombre: normalizarNombre,
    parsearFrente: parsearFrente,
    leerFechaImpresa: leerFechaImpresa,
    consenso: consenso,
    validar: validar,
    planDeLlenado: planDeLlenado,
    /* las imágenes */
    rectDeZona: rectDeZona,
    recortarDeGris: recortarDeGris,
    recortarDeLienzo: recortarDeLienzo,
    preparar: preparar,
    aPGM: aPGM,
    /* el motor */
    crearLector: crearLector,
    leerRecorte: leerRecorte,
    leerLado: leerLado
  };
});
