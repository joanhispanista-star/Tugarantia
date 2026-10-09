/* ============================================================================
 * LA REVISIÓN DE UN REGISTRO — 2 de octubre de 2026
 *
 * Joan, el 1-oct: «cuando un cliente se registre y tome la foto mal o envíe
 * información errónea como WhatsApp falso, todo quiero que se pueda
 * automatizar». El plan es PLAN-CRM-OCTUBRE.md §2 (no se publica).
 *
 * QUÉ HACE. Pasa un registro de la bandeja (public.registros) por nueve reglas
 * y devuelve DOS listas: «Para mirar, y por qué» (ámbar) y unas notas neutras.
 * No decide nada, no bloquea a nadie y no le cambia el estado a ninguna fila.
 * Joan mira y Joan decide.
 *
 * ---------------------------------------------------------------------------
 * LO QUE NO HACE, Y POR QUÉ ESTÁ ESCRITO ACÁ ARRIBA
 *
 *   · NADA SALE «VERIFICADO». No se consulta la Registraduría ni ninguna
 *     central; no hay nada que verificar con lo que hay. Y nunca hay un
 *     «aprobado» ni un «confiable»: cuando las reglas no encuentran nada, la
 *     frase es exactamente esa, «Las reglas no encontraron nada». Un registro
 *     limpio puede ser de un impostor cuidadoso. Una prueba lo vigila.
 *
 *   · EL COTEJO SOLO INFORMA CUANDO NO CUADRA. La app RELLENA el formulario
 *     con lo que lee del código de barras (ver la cabecera de
 *     base/20260922c_verificacion_cedula.sql), así que «coincide» es un
 *     espejo. Y «sin_codigo» es la MAYORÍA de los registros y no dice nada de
 *     la persona: va a las notas neutras y NUNCA a «para mirar». Otra prueba
 *     lo vigila, porque es la tentación obvia.
 *
 *   · NO PUEDE SABER SI UN NÚMERO TIENE WHATSAPP. No hay forma oficial y
 *     gratis de preguntarlo (plan §2). Lo que sí ve: que el número tenga forma
 *     de celular colombiano y que no esté ya en otra ficha con otra cédula. Lo
 *     dice en una nota cada vez, para que nadie lea un silencio como «el
 *     WhatsApp es real».
 *
 * ---------------------------------------------------------------------------
 * LOS DATOS BIOMÉTRICOS (Ley 1581)
 *
 * Este archivo NUNCA ve una foto. Recibe NÚMEROS ya medidos (tamaño, nitidez,
 * brillo; la distancia entre rostros) que mide la página del computador de
 * Joan, y solo de los registros que TIENEN fotos —que solo existen si la
 * persona marcó la casilla aparte de datos sensibles en play/—.
 *
 * Lo que sale de comparar ROSTROS va marcado `biometrico: true`, y
 * sinBiometria() lo quita: eso no viaja a la nube ni al celular, nunca. La
 * nitidez de una foto no es un dato del rostro: «foto borrosa» sí puede llegar
 * al celular, que es lo que promete el plan (§4: «verás la razón… y lo
 * resuelves con las fotos en el computador»).
 *
 * ---------------------------------------------------------------------------
 * TODO LO QUE ESCRIBIÓ QUIEN SE REGISTRÓ ES DE LA CALLE
 *
 * public.registros se llena desde una puerta abierta con la llave pública
 * (registrar_abierto, base/20260824_registro_abierto.sql). Así que: ningún
 * campo se da por bien formado, nada lanza aunque `datos` sea un arreglo o una
 * cadena, y lo poco que se repite en los textos pasa por eco(), que le quita
 * los caracteres de marcado y de control. Los textos que salen de aquí son
 * TEXTO PLANO: quien los pinte los escapa igual (escHTML). eco() es el
 * cinturón, escHTML los tirantes.
 *
 * ---------------------------------------------------------------------------
 * PURO, A PROPÓSITO
 *
 * Ni DOM, ni red, ni almacenamiento, ni reloj: «hoy» llega de afuera
 * (contexto.hoy). Así corre igual en node (las pruebas), en el computador
 * (panel/revision.html, que viene en la etapa 2) y en el celular
 * (panel/espejo.html), y el mismo registro da siempre la misma revisión.
 * No modifica nada de lo que recibe: las pruebas lo corren sobre objetos
 * congelados.
 *
 * ---------------------------------------------------------------------------
 * DE DÓNDE SALE CADA CAMPO (leído en el código, no supuesto)
 *
 *   La fila     base/supabase.sql:127-136 — id, codigo, cedula, nombre,
 *               telefono, datos, estado ('nuevo'|'atendido'|'descartado'),
 *               creado_en. Lo de la calle llega desinfectado en `datos`:
 *               pares de texto, valor recortado a 200
 *               (20260824_registro_abierto.sql:89-97).
 *   datos.*     Los ids de CAMPOS en app/cuenta.js:200-268 — documento,
 *               tipo_doc, expedicion, celular, celular2, ref1_celular,
 *               ref2_celular… (play/ manda REGISTRO entero como p_datos,
 *               play/index.html:1458-1463). `nacimiento` todavía no se pide,
 *               pero play/ ya lo nombra (play/index.html:1007-1008) y el plan
 *               lo agrega (decisión 4): si llega, se usa.
 *   huella      20260908b_registro_archivos.sql:31 y
 *               20260921_arreglo_huella.sql:104-114 — ip (la cabecera
 *               x-forwarded-for: puede traer varias, vale la primera, igual
 *               que bloqueHuella en panel/crm.html:7702), aparato (el
 *               user-agent), momento, gps, cedula_leida {documento, nombres,
 *               apellidos, sexo, nacimiento, lectura}.
 *   El cotejo   huella.cotejo_foto, o si no huella.cotejo (el mismo orden de
 *               chipDeCotejo, panel/crm.html:7587). Su forma:
 *               cedula_cotejar, 20260922c_verificacion_cedula.sql:250-260
 *               (estado, documento, nombre, edad, tipo_doc, lectura, visto),
 *               más nivel y momento (:407) y lo de cedula_repetida (:306-309:
 *               repetida, otros_registros, ya_es_socio_con_otro_celular).
 *   El celular  base/20261002_panel_registros.sql:117-137 le manda al teléfono
 *               una fila RECORTADA: sin datos ni huella, con el cotejo
 *               aplanado en {estado, nivel, menor, documento_imposible,
 *               cedula_repetida}. Esta revisión entiende las dos formas.
 *   La cartera  DB.socios del Panel: cedula, numero (de ahí CL-0012, como
 *               codCliente en app/puente.js:1176) y los tres celulares que
 *               mira celularesDe (app/puente.js:2125-2128): telefono,
 *               telefono2, whatsappNumero. Y `celular`, que es como se llama
 *               en la nube (socios_historial).
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RevisionRegistro = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '2026-10-02';

  /* El peso solo ordena la lista: lo más grave arriba. No suma ni decide. */
  var FUERTE = 3, MEDIO = 2, BAJO = 1;

  /* ==========================================================================
   * LOS UMBRALES, juntos y con nombre, como ENCUADRE en app/cuenta.js: son lo
   * único de esto que hay que calibrar mirando registros de verdad.
   *
   * LAS FOTOS SE MIDEN SIEMPRE AL MISMO TAMAÑO (640 px de lado mayor), porque
   * la nitidez depende de la escala: la misma foto reducida a la mitad da un
   * número más alto. medirFoto() reduce sola; quien la llame le pasa la foto
   * entera.
   *
   * LADO_MIN. La app guarda la cédula a 900 px de lado mayor COMO MUCHO
   * (play/index.html:2684-2697: fotoDeLienzo solo achica, nunca agranda; una
   * cámara de 640×480 da un frente de ~300 px) y la selfie a 720 (:3006-3010). 480 px a lo
   * ancho de una cédula de 85,6 mm son ~5,6 px por milímetro: la letra chica
   * del documento (~1,5 mm) queda en ~8 px de alto, el borde de lo legible.
   * La selfie: el detector de rostros del CRM trabaja a 416 px
   * (compararRostro, panel/crm.html:8000), y con menos de 320 la cara dentro
   * del óvalo queda tan chica que no tiene con qué.
   *
   * NITIDEZ_MIN — LA MEDIDA SE CAMBIÓ EL 2-OCT-2026 (noche). La primera era
   * la varianza del laplaciano de la foto entera, y una revisión adversaria
   * le encontró dos defectos con imágenes sintéticas, los dos reproducidos:
   *   · crecía con el CONTRASTE AL CUADRADO: una cédula nítida fotografiada
   *     de noche (o una vieja, desteñida) medía 18-23 y salía «borrosa»;
   *   · la dominaban los bordes que SOBREVIVEN: con el pulso de la mano la
   *     foto se corre en una dirección y los bordes paralelos al trazo quedan
   *     nítidos; una tarjeta corrida 25 px de lado, ilegible, medía 84 y
   *     pasaba, y el código de barras del reverso tapaba cualquier desenfoque.
   * LA MEDIDA DE AHORA (nitidezDeGris). La foto se parte en mosaicos de 32 px.
   * En cada mosaico con algo que enfocar (varianza ≥ 100, o sea más de 10
   * niveles de gris de desvío), se mide la segunda derivada en CUATRO
   * direcciones (horizontal, vertical y las dos diagonales), se toma la
   * dirección MÁS POBRE —la del trazo de la mano— y se divide por el
   * contraste del propio mosaico, así que ni la luz ni el desteñido mueven el
   * número. Antes se resta el piso de grano de la foto (el décimo percentil
   * de esa misma cuenta en todos los mosaicos), para que el ruido del sensor
   * de la poca luz no se haga pasar por nitidez. La cédula toma la MEDIANA de
   * los mosaicos; la selfie, el percentil 90 de cada dirección dentro del
   * óvalo y la más pobre de las cuatro, porque una cara es lisa casi entera
   * y lo que se enfoca son los ojos, las cejas y el pelo (nitidezDeGris
   * explica por qué así). Sigue habiendo antes un suavizado binomial de 3×3:
   * medido sin él, un gris liso con grano dio más «nitidez» que una cara
   * nítida.
   * Medido el 2-oct-2026 sobre las imágenes SINTÉTICAS de las pruebas
   * (pruebas/imagenes-de-mentira.js) y sobre cédulas y selfies sintéticas en
   * JPEG 0,6/0,7, afiladas como lo hace un teléfono:
   *     cédula nítida 101-103 · de noche 69-110 · desteñida 93 · σ1 58 ·
   *     σ1,5 33 · σ2 18 (se lee) · σ3 4 · corrida 9 px 15-26 (se lee) ·
   *     15 px 8-13 · 25 px 3-9 (ilegibles) · caja de 7 px 10, y 10 con grano
   *     selfie nítida 214-249 · de noche 28 · σ1 100 · σ1,5 22 · σ2 11 ·
   *     corrida 5 px 73-103 · 9 px 19-41 · 15 px 8-20 · 25 px 4-13 · caja
   *     de 7 px 8, y 13 con grano
   * 15 para la cédula y 20 para la selfie dejan pasar lo que se lee (o donde
   * la cara se distingue) y avisan desde lo que ya no. SON PROVISIONALES: salen de imágenes de mentira, no
   * de cédulas. La página muestra el número medido junto al mínimo justamente
   * para que Joan los corrija con los primeros veinte registros de verdad.
   *
   * BRILLO. La media del gris (0-255). La cédula, de la foto entera: 45 por
   * abajo (una cédula amarilla bien iluminada da ~150-200, y por debajo de 45
   * la letra negra ya no se separa del fondo) y 235 por arriba (la cédula
   * nueva es casi blanca, así que el tope tiene que dejarla pasar bien
   * expuesta). LA SELFIE, solo del centro (el óvalo) y con los mismos topes
   * del encuadre de la app, LUZ_MIN 32 y LUZ_MAX 238 (app/cuenta.js:523-524):
   * medida en la foto entera, una selfie de noche que la app aceptó (la cara
   * a 50, el fondo a 15) salía «oscura», que es juzgar una foto con la regla
   * de otra.
   * SATURADOS: la fracción de píxeles en 250 o más, también solo del centro
   * en la selfie: una ventana detrás de la persona no es un reflejo. Un
   * reflejo del flash que quema la cuarta parte de la tarjeta tapa algún dato;
   * en la selfie, quema parte de la cara.
   *
   * SELFIE_CENTRO. La selfie se mide en el centro, donde está el óvalo que la
   * app le dibuja a la persona (rx = 0,32 del ancho, ry = 0,36 del alto:
   * play/index.html:2960): el fondo nítido no puede tapar una cara movida.
   *
   * ROSTRO_DISTANCIA. El mismo 0,60 que ya usa el CRM (panel/crm.html:8006),
   * que es el corte habitual del modelo de face-api. Una ayuda, no un
   * veredicto: la foto de la cédula es chica y vieja.
   *
   * LA RED. Una familia comparte el wifi, y los operadores móviles meten a
   * miles de personas detrás de una misma IP (CGNAT). Por eso uno o dos
   * registros más desde la misma red no dicen nada; se avisa desde 3 más
   * (cuatro en total) dentro de 7 días, que ya no es una casa sino alguien
   * registrando gente. EL APARATO solo, aún menos: desde 2023 Chrome en
   * Android se anuncia «Android 10; K» en TODOS los teléfonos, así que miles
   * de aparatos distintos dicen exactamente lo mismo. Solo cuenta si el
   * anuncio trae el modelo y la versión del sistema («Build/»), y aun así con
   * el mismo tope de 3. OJO (corregido el 2-oct-2026): la app de Android NO
   * lo manda. Es una TWA (android/twa-manifest.json), o sea Chrome, con el
   * mismo «Android 10; K» de todos. «Build/» lo mandan los navegadores
   * metidos dentro de Facebook, Instagram o TikTok, y lo mandan IGUAL todos
   * los teléfonos del mismo modelo y la misma versión: una familia con dos
   * Samsung iguales en el mismo wifi se ve como «un solo teléfono».
   * La misma red Y el mismo aparato específico se parece a UN teléfono
   * registrando a varios, desde 2 más; pero por lo de arriba pesa 1, como las
   * otras dos: es una pista para ordenar, no una sospecha fuerte.
   * ======================================================================== */
  var UMBRALES = congelar({
    LADO_MEDIDA: 640,
    LADO_MIN: { documento: 480, selfie: 320 },
    NITIDEZ_MIN: { documento: 15, selfie: 20 },
    /* Qué percentil de los mosaicos es «la nitidez» de la foto: ver arriba. */
    NITIDEZ_PERCENTIL: { documento: 0.5, selfie: 0.9 },
    MOSAICO: 32,
    MOSAICO_VARIANZA_MIN: 100,
    PISO_DE_GRANO: 0.1,
    BRILLO_MIN: { documento: 45, selfie: 32 },
    BRILLO_MAX: { documento: 235, selfie: 238 },
    SATURADO_NIVEL: 250,
    SATURADOS_MAX: 0.25,
    SELFIE_CENTRO: { ancho: 0.64, alto: 0.72 },
    ROSTRO_DISTANCIA: 0.6,
    RED_DIAS: 7,
    RED_OTROS: 3,
    APARATO_OTROS: 3,
    RED_Y_APARATO_OTROS: 2,
    /* El mismo mínimo de cedula_repetida en la base
       (20260922c_verificacion_cedula.sql:294): con menos dígitos, dos
       personas distintas casarían por casualidad. */
    CEDULA_MIN_DIGITOS: 5,
    MAYORIA: 18
  });

  /* Lo que se dice de WhatsApp, siempre igual y en un solo sitio. */
  var AVISO_WHATSAPP = 'Estas reglas no pueden saber si el número tiene WhatsApp ni si es de la persona: eso solo lo dice escribirle.';

  function congelar(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] && typeof o[k] === 'object') congelar(o[k]);
    });
    return Object.freeze(o);
  }

  /* ==========================================================================
   * LEER SIN CREERSE NADA
   * ======================================================================== */

  var tiene = Object.prototype.hasOwnProperty;
  function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  /* Solo propiedades PROPIAS: un `datos` con «constructor» o «__proto__» de
     llave no puede hacer que se lea algo heredado. */
  function campo(o, k) { return (esObjeto(o) && tiene.call(o, k)) ? o[k] : undefined; }
  /* Un objeto que llegue donde se esperaba texto se lee como vacío, no como
     «[object Object]». */
  function texto(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && isFinite(v)) return String(v);
    return '';
  }
  function digitos(v) { return texto(v).replace(/\D/g, ''); }
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && v.trim() !== '') { var n = Number(v); return isFinite(n) ? n : NaN; }
    return NaN;
  }
  function unicos(lista) {
    var out = [];
    lista.forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function hayComun(a, b) {
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return true;
    return false;
  }

  /* Lo poco que se repite de lo escrito por la persona. Fuera los caracteres de
     control, los invisibles que dan vuelta el texto (U+202E y familia, con los
     que «gpj.exe» se lee «exe.jpg») y todo lo que sirve para armar marcado. */
  function eco(v, max) {
    var s = texto(v)
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
      .replace(/[<>"'`&\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    var m = max || 60;
    return s.length > m ? s.slice(0, m - 1) + '…' : s;
  }

  /* El celular para COMPARAR: los últimos diez dígitos, como hace la base
     (right(solo_digitos(...), 10)). Así 573001112233 y 300 111 2233 son el
     mismo número. */
  function celularDiez(v) {
    var d = digitos(v);
    return d.length >= 10 ? d.slice(-10) : '';
  }
  /* El celular VÁLIDO: la misma regla de normalizarTelefono (app/cuenta.js:96)
     — diez dígitos que empiezan por 3, perdonando el 57 de adelante. */
  function celularValido(v) {
    var d = digitos(v);
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return d.length === 10 && d.charAt(0) === '3';
  }
  /* La cédula para comparar: sin puntos ni ceros a la izquierda, como
     cedula_repetida en la base. 1.029.384.756 y 1029384756 son la misma
     (8-oct-2026: un número inventado; aquí estaba uno de verdad). */
  function cedulaNorm(v) {
    var d = digitos(v).replace(/^0+/, '');
    return d.length >= UMBRALES.CEDULA_MIN_DIGITOS ? d : '';
  }

  /* ---------------------------------------------------------------- fechas */

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function bisiesto(a) { return a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0); }
  function diasDelMes(a, m) { return [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function armarFecha(a, m, d) {
    if (!(a >= 1900 && a <= 2999) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= diasDelMes(a, m))) return null;
    return { a: a, m: m, d: d, dia: Date.UTC(a, m - 1, d) / 86400000 };
  }
  /* Una fecha escrita. El calendario de play/ manda AAAA-MM-DD, pero la base no
     valida el formato (lo dijo la revisión del plan), así que se aceptan
     también las dos formas en que se escribe a mano en Colombia —día primero—
     y se rechaza todo lo que no sea un día que exista: 30 de febrero no. */
  function fechaDeTexto(v) {
    var s = texto(v).trim(), x;
    if ((x = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:T[\d:.]*(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s))) {
      return armarFecha(+x[1], +x[2], +x[3]);
    }
    if ((x = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) return armarFecha(+x[3], +x[2], +x[1]);
    return null;
  }
  /* Un instante de la base (creado_en, timestamptz). PostgREST lo manda en
     ISO; se perdona además el formato con espacio de la consola de SQL. */
  function instante(v) {
    var s = texto(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return NaN;
    if (s.length === 10) s += 'T00:00:00-05:00';
    s = s.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T').replace(/([+-]\d{2})$/, '$1:00');
    var ms = Date.parse(s);
    return isFinite(ms) ? ms : NaN;
  }
  /* El día en Colombia, que es UTC-5 todo el año (no hay horario de verano).
     Sin esto, quien se registra a las 8 de la noche saldría registrado «al día
     siguiente». */
  var BOGOTA_MS = 5 * 3600000;
  function fechaDeInstante(ms) {
    var d = new Date(ms - BOGOTA_MS);
    return armarFecha(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function fmtFecha(f, conAno) { return f.d + '-' + MESES[f.m - 1] + (conAno ? '-' + f.a : ''); }
  function edadEn(nac, hoy) {
    var e = hoy.a - nac.a;
    if (hoy.m < nac.m || (hoy.m === nac.m && hoy.d < nac.d)) e--;
    return e;
  }
  /* El día en que cumple `anos`. Quien nació un 29 de febrero los cumple el 1
     de marzo en los años que no son bisiestos: la misma cuenta de edadEn. */
  function cumpleEn(nac, anos) {
    var a = nac.a + anos;
    return armarFecha(a, nac.m, nac.d) || armarFecha(a, 3, 1);
  }
  function unir(lista) {
    if (lista.length <= 1) return lista.join('');
    return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
  }
  function decimal(n, k) { return n.toFixed(k).replace('.', ','); }

  /* ==========================================================================
   * LAS DOS FORMAS DE UNA FILA, EN UNA SOLA
   * ======================================================================== */

  /* La primera dirección de x-forwarded-for, la misma que pinta la ficha
     (bloqueHuella, panel/crm.html:7702), y solo si parece una IP. OJO, porque
     esto decide cuánto vale la regla de la red: esa primera dirección la
     puede escribir quien manda la petición (los proxies agregan la suya a la
     DERECHA), y la base guarda la cabecera recortada a 80 caracteres. O sea
     que la regla atrapa al descuidado, no al que sabe — y por eso pesa poco. */
  function primeraIP(v) {
    var s = texto(v).split(',')[0].trim().toLowerCase().replace(/^::ffff:/, '');
    return /^[0-9a-f:.]{3,45}$/.test(s) ? s : '';
  }

  function normalizarRegistro(r) {
    var o = esObjeto(r) ? r : {};
    /* Un `datos` vacío es «no hubo formulario», no «dejó todo en blanco»: la
       columna nace con '{}' (base/supabase.sql:133) y los de invitación no
       llenan nada. Sin esto, la revisión decía «No dejó celulares de
       referencias» a gente a la que nunca se le pidieron (2-oct-2026). */
    var datos = (esObjeto(campo(o, 'datos')) && Object.keys(o.datos).length) ? o.datos : null;
    var huella = esObjeto(campo(o, 'huella')) ? o.huella : null;
    /* El cotejo de la FOTO manda sobre el del registro: el del registro cree lo
       que el teléfono dijo haber leído; el de la foto lo leyó el navegador de
       Joan de la imagen que guarda el servidor. */
    var cotejos = [campo(huella, 'cotejo_foto'), campo(huella, 'cotejo'), campo(o, 'cotejo')].filter(esObjeto);
    var cotejo = cotejos[0] || null;   // el tercero es la forma aplanada del celular

    var cedFila = cedulaNorm(campo(o, 'cedula'));
    var cedForm = cedulaNorm(campo(datos, 'documento'));
    var propios = unicos([celularDiez(campo(o, 'telefono')), celularDiez(campo(datos, 'celular'))]);
    var segundo = celularDiez(campo(datos, 'celular2'));
    return {
      fila: o,
      id: texto(campo(o, 'id')),
      estado: texto(campo(o, 'estado')),
      creado: instante(campo(o, 'creado_en')),
      cedFila: cedFila,
      cedForm: cedForm,
      cedulas: unicos([cedFila, cedForm]),
      propios: propios,
      todos: unicos(propios.concat([segundo])),
      datos: datos,
      huella: huella,
      cotejo: cotejo,
      cotejos: cotejos,
      leida: huella && esObjeto(campo(huella, 'cedula_leida')) ? huella.cedula_leida : null,
      ip: huella ? primeraIP(campo(huella, 'ip')) : '',
      aparato: huella ? texto(campo(huella, 'aparato')).trim().slice(0, 300) : ''
    };
  }

  function normalizarCartera(c) {
    var socios = Array.isArray(c) ? c : (esObjeto(c) && Array.isArray(campo(c, 'socios'))) ? c.socios : null;
    if (!socios) return null;
    return socios.filter(esObjeto).map(function (s) {
      var n = numero(campo(s, 'numero'));
      var num = n > 0 ? String(Math.floor(n)) : '';
      while (num && num.length < 4) num = '0' + num;
      return {
        codigo: num ? 'CL-' + num : 'un cliente sin número',
        cedula: cedulaNorm(campo(s, 'cedula')),
        celulares: unicos(['telefono', 'telefono2', 'whatsappNumero', 'celular'].map(function (k) {
          return celularDiez(campo(s, k));
        }))
      };
    });
  }

  /* «el registro del 28-sep», y si no fue este año, con el año. Se nombra por
     la FECHA y no por el nombre de la otra persona: es lo que Joan necesita
     para encontrarla en la bandeja, y no repite datos de un tercero. */
  function cuandoRegistro(o, hoy) {
    var f = isFinite(o.creado) ? fechaDeInstante(o.creado) : null;
    var base = f ? 'el registro del ' + fmtFecha(f, !hoy || f.a !== hoy.a) : 'otro registro (sin fecha)';
    return base + (o.estado === 'descartado' ? ' (descartado)' : o.estado === 'atendido' ? ' (ya atendido)' : '');
  }
  function cuandoVarios(lista, hoy) {
    return unir(lista.map(function (o) { return cuandoRegistro(o, hoy); }));
  }

  /* ==========================================================================
   * LAS REGLAS
   *
   * Cada una recibe el contexto y un `anota` con cuatro verbos: mirar, neutro,
   * sinDatos y parcial. Una regla sin sus datos NO adivina: llama a sinDatos
   * con el porqué, para que la pantalla diga «esto se revisa en el
   * computador» o «este registro no lo trae» en vez de callarse — un silencio
   * se lee como «todo bien», y aquí no se miró.
   * ======================================================================== */

  /* ---- 1. LAS FOTOS: tamaño, nitidez y luz ---- */
  var FOTOS = [
    { k: 'frente', alterna: 'cedula_frente', nombre: 'la foto del frente de la cédula', tipo: 'documento' },
    { k: 'reverso', alterna: 'cedula_reverso', nombre: 'la foto del reverso de la cédula', tipo: 'documento' },
    { k: 'selfie', alterna: 'selfie', nombre: 'la selfie', tipo: 'selfie' }
  ];
  function mayuscula(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function reglaFotos(ctx, anota) {
    var f = ctx.fotos;
    if (!esObjeto(f)) {
      /* 2-oct-2026 — ya no dice «solo las de quien autorizó las fotos»: el
         servidor guarda las fotos por celular y no mira la casilla. Lo que la
         página del computador sí asegura es medir solo las que subió este
         registro (ver mirarFotos en panel/revision.html). */
      return anota.sinDatos(ctx.donde === 'celular'
        ? 'Las fotos se miden en el computador.'
        : 'Las fotos no se midieron: se miden en el computador, y solo las que subió este mismo registro.');
    }
    var hay = FOTOS.filter(function (x) { return esObjeto(campo(f, x.k)) || esObjeto(campo(f, x.alterna)); });
    if (!hay.length) return anota.sinDatos('No hay fotos de este registro: no autorizó las fotos o no llegaron.');

    var faltan = FOTOS.filter(function (x) { return hay.indexOf(x) < 0; });
    if (faltan.length) {
      anota.neutro('fotos_incompletas', 'Hay fotos, pero falta ' + unir(faltan.map(function (x) { return x.nombre; })) + '.');
    }

    hay.forEach(function (x) {
      var m = esObjeto(campo(f, x.k)) ? f[x.k] : f[x.alterna];
      var Nombre = mayuscula(x.nombre);
      var ancho = numero(campo(m, 'ancho')), alto = numero(campo(m, 'alto'));
      if (ancho > 0 && alto > 0) {
        var lado = Math.max(ancho, alto), min = UMBRALES.LADO_MIN[x.tipo];
        if (lado < min) {
          /* 2-oct-2026 — «hasta»: la app solo achica (fotoDeLienzo), así que
             una cámara de 640×480 da un frente de ~300 px salido de la app
             tal cual. Decir «no salió de la cámara del registro» era falso. */
          anota.mirar('foto_chica_' + x.k, BAJO,
            Nombre + ' es muy chica (' + Math.round(ancho) + '×' + Math.round(alto) + ' px; mínimo ' + min + ' de lado mayor)',
            'La app la guarda de hasta ' + (x.tipo === 'selfie' ? 720 : 900) + ' px, y más chica si la cámara del teléfono '
            + 'es pobre: puede que no se lea. Si hace falta, pídele que la repita.');
        }
      }
      var selfie = x.tipo === 'selfie';
      var nit = numero(campo(m, 'nitidez')), nmin = UMBRALES.NITIDEZ_MIN[x.tipo];
      if (nit >= 0 && nit < nmin) {
        anota.mirar('foto_borrosa_' + x.k, MEDIO,
          Nombre + ' está borrosa (nitidez ' + decimal(nit, 0) + ', mínimo ' + nmin + ')',
          'Mírala: si no se leen los datos' + (selfie ? ' o no se distingue la cara' : '')
          + ', pídele que la repita con el teléfono quieto y buena luz. El mínimo es provisional.');
      }
      /* 2-oct-2026 — la selfie con SU regla: brillo y reflejo medidos en el
         centro (medirFoto) y los topes del encuadre de la app; y las frases
         hablan de la cara, no de «los datos» ni de «el número o el nombre». */
      var bri = numero(campo(m, 'brillo'));
      var bmin = UMBRALES.BRILLO_MIN[x.tipo], bmax = UMBRALES.BRILLO_MAX[x.tipo];
      var oscura = bri >= 0 && bri < bmin;
      var clara = bri > bmax;
      if (oscura) {
        anota.mirar('foto_oscura_' + x.k, MEDIO,
          Nombre + ' está oscura (brillo ' + decimal(bri, 0) + ' de 255, mínimo ' + bmin + ')',
          selfie ? 'Con tan poca luz la cara no se distingue bien. Mírala: si no se ve, pídele que la repita con luz.'
                 : 'Con tan poca luz los datos se confunden con el fondo. Si no se leen, pídele que la repita con luz.');
      } else if (clara) {
        anota.mirar('foto_quemada_' + x.k, MEDIO,
          Nombre + ' está quemada de luz (brillo ' + decimal(bri, 0) + ' de 255, máximo ' + bmax + ')',
          (selfie ? 'Con tanta luz se borran los rasgos de la cara.' : 'Con tanta luz se borran los datos.')
          + ' Si no se ' + (selfie ? 've' : 'leen') + ', pídele que la repita sin el flash o lejos de la ventana.');
      }
      var sat = numero(campo(m, 'saturados'));
      if (!clara && sat > UMBRALES.SATURADOS_MAX && sat <= 1) {
        if (selfie) {
          anota.mirar('foto_reflejo_' + x.k, BAJO,
            'La selfie tiene una parte quemada de luz en el centro (' + Math.round(sat * 100) + '% en blanco puro)',
            'Puede tapar parte de la cara. Mírala.');
        } else {
          anota.mirar('foto_reflejo_' + x.k, MEDIO,
            Nombre + ' tiene un reflejo que tapa una parte (' + Math.round(sat * 100) + '% de la foto en blanco puro)',
            'Un reflejo del flash o de una lámpara puede tapar el número o el nombre. Míralo en la foto.');
        }
      }
    });
  }

  /* ---- 2. EL ROSTRO CONTRA LA CÉDULA (solo en el computador) ---- */
  function reglaRostro(ctx, anota) {
    var r = ctx.rostro;
    if (!esObjeto(r)) {
      return anota.sinDatos(ctx.donde === 'celular'
        ? 'El parecido de los rostros se calcula solo en el computador.'
        : 'El parecido de los rostros no se calculó. Se calcula en el computador, si hay selfie y foto del frente.');
    }
    var sin = texto(campo(r, 'sin_rostro'));
    var d = numero(campo(r, 'distancia'));
    if (!sin && !(d >= 0)) return anota.sinDatos('La comparación de rostros no dio un número.');
    if (sin === 'selfie' || sin === 'ambas') {
      anota.mirar('rostro_sin_cara', BAJO, 'En la selfie el programa no encontró un rostro',
        'Puede ser la luz o el ángulo, o puede que la foto no sea de una cara. Mírala tú.', { biometrico: true });
    }
    if (sin === 'cedula' || sin === 'ambas') {
      anota.neutro('rostro_sin_cara_cedula',
        'El programa no encontró el rostro en la foto del frente. Pasa con fotos de cédula chicas o con reflejo.',
        { biometrico: true });
    }
    if (d >= 0) {
      if (d >= UMBRALES.ROSTRO_DISTANCIA) {
        anota.mirar('rostro_poco_parecido', MEDIO,
          'La selfie y la foto de la cédula se parecen poco (distancia ' + decimal(d, 2) + '; por debajo de '
          + decimal(UMBRALES.ROSTRO_DISTANCIA, 2) + ' suele ser la misma persona)',
          'Es una ayuda, no un veredicto: la foto de la cédula es chica y vieja, y la cara cambia con los años. Míralas tú.',
          { biometrico: true });
      } else {
        anota.neutro('rostro_sin_diferencia',
          'El programa de rostros no encontró una diferencia grande (distancia ' + decimal(d, 2)
          + '). No dice que sea la misma persona: es una ayuda.', { biometrico: true });
      }
    }
  }

  /* ---- 3. EL COTEJO CON EL CÓDIGO DE BARRAS ---- */
  var TEXTO_NIVEL = {
    foto: 'Leído de la foto guardada en el servidor.',
    app: 'Según la lectura que mandó el teléfono al registrarse; la de la foto guardada vale más.'
  };
  function reglaCotejo(ctx, anota) {
    var c = ctx.cotejo;
    if (!c) return anota.sinDatos('No hay cotejo guardado: no llegó lectura del código de barras ni se leyó la foto del reverso.');
    var estado = texto(campo(c, 'estado'));
    var nivel = TEXTO_NIVEL[texto(campo(c, 'nivel'))] || '';
    var v = esObjeto(campo(c, 'visto')) ? c.visto : {};
    /* La lectura «tokens» es el lector de RESPALDO de app/cuenta.js: adivina
       dónde parten nombres y apellidos, y toma como número el primer grupo de
       5 a 10 dígitos que encuentra, que puede ser un serial. */
    var respaldo = texto(campo(c, 'lectura')) === 'tokens';
    if (estado === 'sin_codigo') {
      /* LA MAYORÍA, Y NO DICE NADA. Ocho sitios del registro borran la lectura
         y la subida tiene tres rejas: «no llegó» no es «escribió a mano».
         2-oct-2026: salvo cuando SÍ llegó y lo que falló fue el cotejo en la
         base (registro_archivos_guardar guarda entonces sin_codigo con la nota
         «el cotejo fallo: …»). Sigue neutro —no dice nada de la persona—,
         pero no puede decir que no llegó, y el botón de la ficha lo rehace. */
      if (/^el cotejo fall/i.test(texto(campo(c, 'nota')))) {
        return anota.neutro('cotejo_sin_codigo',
          'Llegó la lectura, pero el cotejo falló en la base: no se comparó con lo escrito. '
          + 'No dice nada de la persona: en la ficha, «🔢 Leer el código de barras de la foto» lo vuelve a intentar.');
      }
      return anota.neutro('cotejo_sin_codigo',
        'No llegó lectura del código de barras. No quiere decir que escribiera a mano ni que algo esté mal.');
    }
    if (estado === 'intacto') {
      /* 2-oct-2026 — el cotejo sabe que lo escrito es IGUAL al código; no sabe
         quién lo tecleó ni de quién es la cédula fotografiada. */
      return anota.neutro('cotejo_intacto',
        'Lo escrito es igual a lo que trae el código de barras de la cédula fotografiada. Eso no dice de quién es la cédula.');
    }
    if (estado === 'retocado') {
      /* 2-oct-2026 — «retocado» NO es siempre un retoque. cedula_cotejar
         (20260922c_verificacion_cedula.sql:205-215) también lo pone cuando el
         nombre es OTRO pero el lector fue el de respaldo, que no sabe partir
         nombres: no hay alarma, pero tampoco es «compatible con la misma
         persona». Y con `documento: 'sin_escribir'` lo que pasa es que no
         quedó número escrito con qué comparar. */
      if (texto(campo(c, 'nombre')) === 'otro') {
        var nc0 = eco(campo(v, 'nombre_codigo'), 80), ne0 = eco(campo(v, 'nombre_escrito'), 80);
        anota.mirar('cotejo_nombre_lector', BAJO, 'El nombre escrito no es el del código de barras',
          (nc0 && ne0 ? 'El código decía «' + nc0 + '» y quedó escrito «' + ne0 + '». ' : '')
          + 'El lector no estaba seguro de dónde parten nombres y apellidos: compáralo en la foto. ' + nivel);
        return;
      }
      if (texto(campo(c, 'documento')) === 'sin_escribir') {
        return anota.neutro('cotejo_sin_escribir',
          'El código de barras trajo un número de cédula, pero en el formulario no quedó escrito ningún número con qué compararlo.');
      }
      return anota.neutro('cotejo_retocado',
        'Después de que el código de barras llenara el formulario, cambió algo de forma compatible con la misma persona (una tilde, un apellido que no escribió).');
    }
    if (estado !== 'no_cuadra') return anota.sinDatos('El cotejo trae un estado que estas reglas no conocen.');

    var razones = 0;
    if (texto(campo(c, 'documento')) === 'cambiado' || digitos(campo(v, 'documento_codigo'))) {
      razones++;
      var dc = eco(digitos(campo(v, 'documento_codigo')), 15), de = eco(digitos(campo(v, 'documento_escrito')), 15);
      /* Con el lector de respaldo el «número del código» puede ser un serial:
         pesa 2 y lo dice (2-oct-2026). */
      anota.mirar('cotejo_documento', respaldo ? MEDIO : FUERTE, 'El número de cédula escrito no es el del código de barras',
        (dc && de ? 'El código decía ' + dc + ' y quedó escrito ' + de + '. ' : '')
        + (respaldo
          ? 'Lo leyó el lector de respaldo, que puede tomar otro número de la tarjeta por el de la cédula: compáralo en la foto. '
          : 'Pudo leerse mal un dígito, pero el número cambiado a mano es lo que más vale mirar. ') + nivel);
    }
    if (texto(campo(c, 'nombre')) === 'otro') {
      razones++;
      var nc = eco(campo(v, 'nombre_codigo'), 80), ne = eco(campo(v, 'nombre_escrito'), 80);
      anota.mirar('cotejo_nombre', MEDIO, 'El nombre escrito no es el del código de barras',
        (nc && ne ? 'El código decía «' + nc + '» y quedó escrito «' + ne + '». ' : '') + nivel);
    }
    if (texto(campo(c, 'tipo_doc')) === 'incoherente' || campo(c, 'documento_imposible') === true) {
      razones++;
      var td = eco(campo(v, 'tipo_doc_escrito'), 40);
      anota.mirar('cotejo_tipo_doc', MEDIO,
        'Marcó ' + (td ? '«' + td + '»' : 'otro documento') + ', pero se leyó el código de barras de una cédula colombiana',
        'Ese código de barras solo existe en la cédula de ciudadanía. Una de las dos cosas está mal. ' + nivel);
    }
    /* La edad la cuenta su propia regla, con su propio peso. */
    var ed = campo(c, 'edad');
    if (ed === 'MENOR' || campo(c, 'menor') === true || (typeof ed === 'number' && ed >= 0 && ed < UMBRALES.MAYORIA)) razones++;
    if (!razones) {
      anota.mirar('cotejo_no_cuadra', MEDIO, 'Lo escrito contradice el código de barras de la cédula',
        ctx.donde === 'celular' ? 'El detalle está en la ficha del computador.' : nivel);
    }
  }

  /* ---- 4. LA EDAD ----
     Aquí sí se miran TODOS los cotejos (el recién hecho, el de la foto, el
     del registro): el cotejo manda el de más arriba, pero que la persona sea
     menor lo puede saber cualquiera de ellos, y uno recién hecho que no leyó
     la fecha no borra lo que leyó otro. */
  function todosLosCotejos(ctx) {
    return unicos([ctx.cotejo].concat(ctx.reg.cotejos)).filter(esObjeto);
  }
  function nacimientoDelCodigo(ctx) {
    var cs = todosLosCotejos(ctx);
    for (var i = 0; i < cs.length; i++) {
      var f = fechaDeTexto(campo(campo(cs[i], 'visto'), 'nacimiento'));
      if (f) return f;
    }
    return fechaDeTexto(campo(ctx.reg.leida, 'nacimiento'));
  }
  function reglaEdad(ctx, anota) {
    var reg = ctx.reg, hoy = ctx.hoy;
    var menorCotejo = false, mayorCotejo = false, anosCotejo = NaN;
    todosLosCotejos(ctx).forEach(function (c) {
      var e = campo(c, 'edad');
      if (e === 'MENOR' || campo(c, 'menor') === true || (typeof e === 'number' && e >= 0 && e < UMBRALES.MAYORIA)) {
        menorCotejo = true;
        var a = numero(campo(campo(c, 'visto'), 'anos'));
        if (!(a >= 0) && typeof e === 'number') a = e;
        if (a >= 0 && !(anosCotejo >= 0)) anosCotejo = a;
      } else if (e === 'mayor' || (typeof e === 'number' && e >= UMBRALES.MAYORIA)) {
        mayorCotejo = true;
      }
    });

    /* El nacimiento del CÓDIGO (lo leyó la app del respaldo) y el DECLARADO (si
       algún día play/ lo pide). Una fecha que todavía no llega no es una fecha
       de nacimiento: se ignora, como hace cedula_cotejar. */
    var nacCodigo = nacimientoDelCodigo(ctx);
    var nacDecl = fechaDeTexto(campo(reg.datos, 'nacimiento'));
    if (hoy && nacCodigo && nacCodigo.dia > hoy.dia) nacCodigo = null;
    if (hoy && nacDecl && nacDecl.dia > hoy.dia) nacDecl = null;

    var corrio = menorCotejo || mayorCotejo || (hoy && (nacCodigo || nacDecl));
    if (!corrio) {
      return anota.sinDatos((nacCodigo || nacDecl) && !hoy
        ? 'Falta la fecha de hoy para calcular la edad.'
        : 'Sin fecha de nacimiento: sale del código de barras de la cédula, y de este registro no hay lectura.');
    }

    var edadHoy = (hoy && nacCodigo) ? edadEn(nacCodigo, hoy) : NaN;
    var DETALLE = 'Un menor no se puede obligar: el contrato sería nulo (arts. 1502 y 1504 del Código Civil).';
    if (edadHoy < UMBRALES.MAYORIA || (menorCotejo && !(edadHoy >= UMBRALES.MAYORIA))) {
      /* 2-oct-2026 — sin fecha de nacimiento (el celular solo recibe la
         bandera `menor`) no se sabe si cumplió 18 desde el cotejo: se dice
         CUÁNDO lo decía la cédula, en vez de afirmarlo hoy. */
      var anos = edadHoy >= 0 ? edadHoy : anosCotejo;
      anota.mirar('menor_de_edad', FUERTE,
        (edadHoy >= 0 ? 'La cédula dice que es menor de edad' : 'Cuando se cotejó, la cédula decía que era menor de edad')
        + (anos >= 0 ? ' (' + Math.floor(anos) + ' años)' : ''), DETALLE);
    } else if (menorCotejo) {
      /* Al registrarse era menor y desde entonces cumplió 18: hoy podría firmar,
         pero se registró cuando no podía, y eso también se mira. La frase no
         dice que el contrato «vale»: eso no lo decide una regla. */
      anota.mirar('menor_al_registrarse', MEDIO,
        'Al registrarse, la cédula decía que era menor de edad; hoy ya cumplió 18',
        'Desde hoy la edad ya no impide firmar. Lo que declaró antes de los 18 conviene repasarlo con la persona.');
    }
    if (hoy && nacDecl && edadEn(nacDecl, hoy) < UMBRALES.MAYORIA && !(edadHoy < UMBRALES.MAYORIA)) {
      anota.mirar('menor_declarado', FUERTE, 'La fecha de nacimiento que escribió es de un menor de edad', DETALLE);
    }
    if (nacCodigo && nacDecl && nacCodigo.dia !== nacDecl.dia) {
      anota.mirar('nacimiento_distinto', MEDIO, 'La fecha de nacimiento que escribió no es la del código de barras',
        'El código dice ' + fmtFecha(nacCodigo, true) + ' y escribió ' + fmtFecha(nacDecl, true) + '.');
    }
  }

  /* ---- 5. LA CÉDULA REPETIDA ---- */
  function reglaCedula(ctx, anota) {
    var reg = ctx.reg;
    if (!reg.cedulas.length) return anota.sinDatos('El registro no trae número de cédula.');
    /* La bandera de la base puede venir en cualquiera de los cotejos (en el
       celular se llama cedula_repetida). */
    var c = todosLosCotejos(ctx).filter(function (x) {
      return campo(x, 'repetida') === true || campo(x, 'cedula_repetida') === true;
    })[0] || null;

    /* registrar_abierto guarda p_cedula en la columna y p_datos en datos; play/
       manda en los dos el mismo REGISTRO.documento. Si dicen cosas distintas,
       la petición no salió de la app. */
    var dosNumeros = reg.cedFila && reg.cedForm && reg.cedFila !== reg.cedForm;
    var bandera = !!c;
    var sinCon = ctx.otros === null && ctx.cartera === null && !bandera;
    if (sinCon && !dosNumeros) return anota.sinDatos('No hay otros registros ni cartera con qué comparar la cédula.');
    if (dosNumeros) {
      anota.mirar('cedula_dos_numeros', MEDIO, 'La cédula de la bandeja no es la que quedó en el formulario',
        'En la bandeja dice ' + reg.cedFila + ' y en el formulario ' + reg.cedForm + '. La app manda las dos iguales: esto no salió de ella.');
    }
    if (sinCon) return anota.parcial('No hay otros registros ni cartera con qué comparar la cédula.');

    /* Una ficha vieja sin celular no tiene «otro celular»: tiene la misma
       cédula y nada que la contradiga, que para el puente es la misma persona
       (LA CÉDULA MANDA SOBRE EL CELULAR, app/puente.js:2090). */
    var clienteOtroCel = [], clienteMismoCel = [], clienteSinCel = [];
    (ctx.cartera || []).forEach(function (s) {
      if (!s.cedula || reg.cedulas.indexOf(s.cedula) < 0) return;
      if (!s.celulares.length) clienteSinCel.push(s.codigo);
      else (hayComun(reg.propios, s.celulares) ? clienteMismoCel : clienteOtroCel).push(s.codigo);
    });
    var esCliente = clienteOtroCel.length + clienteMismoCel.length + clienteSinCel.length > 0;

    var conOtroCel = [], conMismoCel = [];
    (ctx.otros || []).forEach(function (o) {
      if (!hayComun(reg.cedulas, o.cedulas)) return;
      (hayComun(reg.propios, o.propios) ? conMismoCel : conOtroCel).push(o);
    });
    var conOtroCelAMano = conOtroCel.length > 0;   // antes de quitar lo repetido: para la bandera de abajo
    /* 2-oct-2026 — UN HECHO, UNA LÍNEA. El cliente que cambió de número sale
       a la vez en su registro ya ATENDIDO (otro celular) y en la cartera:
       eran dos cosas para mirar, una de peso 3, por algo inofensivo. Si la
       cartera ya lo cuenta, el registro atendido sobra; y uno atendido que la
       cartera no muestra pesa 2: Joan ya lo vio una vez. Uno NUEVO o
       DESCARTADO con la misma cédula y otro celular sigue pesando 3: es la
       forma de la cédula ajena. */
    if (esCliente) conOtroCel = conOtroCel.filter(function (o) { return o.estado !== 'atendido'; });
    if (conOtroCel.length) {
      var todosAtendidos = conOtroCel.every(function (o) { return o.estado === 'atendido'; });
      anota.mirar('cedula_en_otro_registro', todosAtendidos ? MEDIO : FUERTE,
        'La misma cédula está en ' + cuandoVarios(conOtroCel, ctx.hoy) + ', con otro celular',
        'Puede haber cambiado de número, o alguien está usando una cédula ajena: la foto del respaldo de un tercero '
        + 'circula por WhatsApp más de lo que parece. Pregúntale por el otro número.');
    }
    /* 2-oct-2026 — EL QUE YA DESCARTASTE VUELVE. Misma cédula y mismo celular
       que un registro descartado era una nota neutra, doblada: quedaba en
       «Sin nada que mirar». Joan lo descartó por algo; eso se mira. */
    var descartados = conMismoCel.filter(function (o) { return o.estado === 'descartado'; });
    if (descartados.length) {
      anota.mirar('ya_descartado', MEDIO,
        'Ya descartaste un registro con la misma cédula y el mismo celular: ' + cuandoVarios(descartados, ctx.hoy),
        'Antes de atenderlo, mira por qué lo descartaste.');
    }
    var mismos = conMismoCel.filter(function (o) { return o.estado !== 'descartado'; });
    if (mismos.length) {
      anota.neutro('cedula_ya_registrada',
        'Ya se había registrado con la misma cédula y el mismo celular: ' + cuandoVarios(mismos, ctx.hoy) + '.');
    }
    if (clienteSinCel.length) {
      anota.neutro('cedula_ya_cliente_sin_celular',
        'Ya es cliente: ' + unir(clienteSinCel) + ' tiene la misma cédula, y su ficha no tiene celular con qué comparar. Crúzalo en vez de abrirle otra ficha.');
    }
    if (clienteOtroCel.length) {
      anota.mirar('cedula_de_cliente', MEDIO,
        'La cédula es la de tu cliente ' + unir(clienteOtroCel) + ', que tiene otro celular',
        'Puede ser tu cliente con un número nuevo, o alguien con su cédula. Antes de cruzarlos, confírmalo con el número que ya tenías.');
    }
    if (clienteMismoCel.length) {
      anota.neutro('cedula_ya_cliente',
        'Ya es cliente: ' + unir(clienteMismoCel) + ' tiene la misma cédula y el mismo celular. Crúzalo en vez de abrirle otra ficha.');
    }

    /* La bandera la calculó la base CUANDO SE COTEJÓ (al registrarse, o
       después, cuando la página del computador vuelve a leer la foto) contra
       TODO: registros de cualquier estado y la cartera de la nube. Las listas
       de aquí pueden ser más cortas —la bandeja solo trae los nuevos—: si la
       base vio algo que estas listas no muestran, se dice igual.
       2-oct-2026 — cada mitad de la bandera se dice SOLO si lo de aquí no la
       cuenta ya, y con el porqué de SU fuente:
         · «otros registros»: si a mano hay un registro con esta cédula y otro
           celular, o un cliente con otro celular, ya salió arriba;
         · «ficha de cliente»: la base compara solo socios_historial.celular,
           que es el teléfono principal (app/puente.js:1384), y una ficha SIN
           celular le cuenta como «otro» (''<>celular es verdad en SQL). Si la
           cartera de aquí tiene un cliente con esta cédula —con este
           celular, sin celular o con otro—, la regla de arriba ya lo dijo
           mejor, y repetirlo en ámbar al lado de «el mismo celular» se
           contradecía. */
    if (bandera) {
      var otrosN = numero(campo(c, 'otros_registros'));
      var esSocio = campo(c, 'ya_es_socio_con_otro_celular') === true;
      var donde = [], porque = [];
      if (otrosN > 0 && !conOtroCelAMano && !clienteOtroCel.length) {
        donde.push((otrosN === 1 ? 'otro registro' : Math.floor(otrosN) + ' registros más') + ' con otro celular');
        porque.push('La lista que hay a mano no lo muestra: puede estar en un registro ya atendido o descartado. Búscalo por la cédula en 📥 Registrados.');
      }
      if (esSocio && !esCliente) {
        donde.push('una ficha de cliente con otro celular o sin celular');
        porque.push('Tu cartera de este navegador no tiene a ese cliente; la base lo vio en la copia de la nube. Búscalo por la cédula en Clientes.');
      }
      if (!(otrosN > 0) && !esSocio && !conOtroCelAMano && !clienteOtroCel.length) {
        donde.push('otra ficha con otro celular');
        porque.push('La lista que hay a mano no lo muestra. Búscalo por la cédula.');
      }
      if (donde.length) {
        anota.mirar('cedula_repetida_al_registrarse', MEDIO,
          'Cuando se cotejó, la base encontró esta cédula en ' + unir(donde), porque.join(' '));
      }
    }
  }

  /* ---- 6. EL CELULAR ---- */
  function reglaCelular(ctx, anota) {
    var reg = ctx.reg, d = reg.datos;
    var crudo = texto(campo(reg.fila, 'telefono')) || texto(campo(d, 'celular'));
    if (!celularValido(crudo)) {
      var dg = eco(digitos(crudo), 15);
      anota.mirar('celular_forma', MEDIO,
        dg ? 'El celular ' + dg + ' no tiene forma de celular colombiano (10 dígitos que empiezan por 3)'
           : 'El registro no trae celular',
        /* 2-oct-2026 — no dice «no le llega WhatsApp»: un +58 lo tiene, y
           estas reglas no saben de WhatsApp (AVISO_WHATSAPP). Lo que sí se
           sabe es que la app no deja pasar esa forma. */
        'No tiene forma de celular colombiano, y la app no deja pasar eso: este registro no salió de la app tal cual.');
    }
    var telFila = celularDiez(campo(reg.fila, 'telefono')), telForm = celularDiez(campo(d, 'celular'));
    if (telFila && telForm && telFila !== telForm) {
      anota.mirar('celular_dos_numeros', MEDIO, 'El celular del formulario no es el de la cuenta',
        'La app manda el mismo número en los dos sitios: esto no salió de ella.');
    }
    var c2 = texto(campo(d, 'celular2'));
    if (c2.trim() && !celularValido(c2)) {
      anota.mirar('celular2_forma', BAJO, 'El otro celular que dejó no tiene forma de celular colombiano',
        'Es opcional; si lo va a usar para ubicarlo, pídeselo otra vez.');
    }

    if (ctx.otros === null && ctx.cartera === null) {
      anota.parcial('Sin otros registros ni cartera: solo se revisó la forma del número.');
    } else if (reg.propios.length) {
      var conOtraCed = [], sinCed = [];
      (ctx.otros || []).forEach(function (o) {
        if (!hayComun(reg.propios, o.todos)) return;
        if (reg.cedulas.length && o.cedulas.length) {
          /* Misma cédula: es la misma persona, y eso ya lo dice la regla de la
             cédula. Aquí solo cuenta el caso de dos personas en un número. */
          if (!hayComun(reg.cedulas, o.cedulas)) conOtraCed.push(o);
        } else {
          sinCed.push(o);
        }
      });
      var clienteOtraCed = [], clienteSinCed = [], cedulasDeClientes = [];
      (ctx.cartera || []).forEach(function (s) {
        if (!hayComun(reg.propios, s.celulares)) return;
        if (reg.cedulas.length && s.cedula) {
          if (reg.cedulas.indexOf(s.cedula) < 0) { clienteOtraCed.push(s.codigo); cedulasDeClientes.push(s.cedula); }
        } else {
          clienteSinCed.push(s.codigo);
        }
      });
      /* 2-oct-2026 — UN HECHO, UNA LÍNEA: la hija con el celular de la mamá
         salía dos veces, por el registro ATENDIDO de la mamá y por la mamá en
         la cartera. Si el cliente ya lo cuenta, su registro atendido sobra. */
      conOtraCed = conOtraCed.filter(function (o) {
        return !(o.estado === 'atendido' && hayComun(o.cedulas, cedulasDeClientes));
      });
      if (conOtraCed.length) {
        anota.mirar('celular_en_otro_registro', MEDIO,
          'El mismo celular está en ' + cuandoVarios(conOtraCed, ctx.hoy) + ', con otra cédula',
          'Puede ser un familiar que le prestó el teléfono, o alguien registrando a varias personas con un solo número.');
      }
      /* Lo descartado que vuelve se mira (ver la regla de la cédula). */
      var sinCedDescartados = sinCed.filter(function (o) { return o.estado === 'descartado'; });
      var sinCedOtros = sinCed.filter(function (o) { return o.estado !== 'descartado'; });
      if (sinCedDescartados.length) {
        anota.mirar('ya_descartado_celular', MEDIO,
          'Ya descartaste un registro con este mismo celular: ' + cuandoVarios(sinCedDescartados, ctx.hoy),
          'No hay cédula de los dos lados para saber si es la misma persona. Antes de atenderlo, mira por qué lo descartaste.');
      }
      if (sinCedOtros.length) {
        anota.neutro('celular_ya_registrado',
          'El mismo celular aparece en ' + cuandoVarios(sinCedOtros, ctx.hoy) + '; sin cédula de los dos lados para saber si es la misma persona.');
      }
      if (clienteOtraCed.length) {
        anota.mirar('celular_de_cliente', MEDIO,
          'El celular es el de tu cliente ' + unir(clienteOtraCed) + ', que tiene otra cédula',
          'Puede ser de la familia de tu cliente, o un número que el operador volvió a asignar. Son dos personas: no los cruces.');
      }
      if (clienteSinCed.length) {
        anota.neutro('celular_de_cliente_sin_cedula',
          'El celular es el de ' + unir(clienteSinCed) + '; no hay cédula de los dos lados para comparar. Si es la misma persona, crúzalo.');
      }
    }
    anota.neutro('whatsapp_desconocido', AVISO_WHATSAPP);
  }

  /* ---- 7. LAS REFERENCIAS ---- */
  function reglaReferencias(ctx, anota) {
    var reg = ctx.reg, d = reg.datos;
    if (!d) {
      return anota.sinDatos(ctx.donde === 'celular'
        ? 'Las referencias se revisan en el computador: el celular no las recibe.'
        : 'Este registro no trae formulario (los de invitación solo traen nombre, cédula y celular).');
    }
    var refs = [1, 2].map(function (i) {
      var crudo = texto(campo(d, 'ref' + i + '_celular'));
      return { i: i, crudo: crudo, cel: celularDiez(crudo), valido: celularValido(crudo) };
    }).filter(function (r) { return r.crudo.trim() !== ''; });
    if (!refs.length) return anota.sinDatos('No dejó celulares de referencias.');

    refs.forEach(function (r) {
      if (!r.valido) {
        anota.mirar('ref' + r.i + '_forma', BAJO,
          'El celular de la referencia ' + r.i + ' no tiene forma de celular colombiano',
          'La app no deja pasar eso. Sin un número que conteste, la referencia no sirve.');
        return;
      }
      if (reg.todos.indexOf(r.cel) >= 0) {
        r.propio = true;
        anota.mirar('ref' + r.i + '_propio', MEDIO, 'La referencia ' + r.i + ' tiene su mismo celular',
          'Una referencia con el número de la misma persona no sirve de referencia. Pídele otra.');
        return;
      }
      /* 2-oct-2026 — NOTAS, NO SOSPECHAS. Las dos frases decían «no es una
         falta» y aun así ponían la tarjeta en ámbar; y el referido que trae
         un cliente lo pone casi siempre de referencia, así que se habrían
         puesto ámbar todos. Tampoco dicen «al llamar»: la política de
         privacidad promete llamar a las referencias solo si no se logra
         hablar con la persona. */
      var regs = (ctx.otros || []).filter(function (o) { return o.todos.indexOf(r.cel) >= 0; });
      if (regs.length) {
        anota.neutro('ref' + r.i + '_otro_registrado',
          'El celular de la referencia ' + r.i + ' es el celular de otro registrado (' + cuandoVarios(regs, ctx.hoy) + '). '
          + 'No es una falta: puede ser quien lo trajo o un familiar que también se registró; es para que lo sepas si algún día hay que llamarla.');
      }
      var clientes = (ctx.cartera || []).filter(function (s) { return s.celulares.indexOf(r.cel) >= 0; })
        .map(function (s) { return s.codigo; });
      if (clientes.length) {
        anota.neutro('ref' + r.i + '_cliente',
          'El celular de la referencia ' + r.i + ' es el de tu cliente ' + unir(clientes)
          + '. No es una falta: es alguien que ya conoces, para que lo sepas si algún día hay que llamarla.');
      }
    });
    /* Las dos con su propio celular ya salieron dos veces: «las dos iguales»
       sería la tercera línea del mismo hecho. */
    if (refs.length === 2 && refs[0].valido && refs[1].valido && refs[0].cel === refs[1].cel && !(refs[0].propio && refs[1].propio)) {
      anota.mirar('refs_iguales', MEDIO, 'Las dos referencias tienen el mismo celular',
        'Dos referencias con un solo número son una. Pídele otra.');
    }
  }

  /* ---- 8. LA FECHA DE EXPEDICIÓN ----
     El único campo de identidad que la persona escribe de verdad a mano —no
     viaja en el código de barras (20260922c_verificacion_cedula.sql:47-50)—,
     o sea el único que un impostor tiene que inventarse. Y la base no le
     valida ni el formato. */
  function esCedulaDeCiudadania(tipo) {
    var t = texto(tipo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return !t.trim() || t.indexOf('CEDULA DE CIUDADANIA') >= 0;
  }
  function reglaExpedicion(ctx, anota) {
    var reg = ctx.reg, d = reg.datos, hoy = ctx.hoy;
    if (!d) {
      return anota.sinDatos(ctx.donde === 'celular'
        ? 'La fecha de expedición se revisa en el computador: el celular no la recibe.'
        : 'Este registro no trae formulario (los de invitación solo traen nombre, cédula y celular).');
    }
    var crudo = texto(campo(d, 'expedicion')).trim();
    if (!crudo) return anota.sinDatos('No escribió fecha de expedición.');
    var f = fechaDeTexto(crudo);
    if (!f) {
      anota.mirar('expedicion_no_es_fecha', BAJO,
        'La fecha de expedición «' + eco(crudo, 30) + '» no es una fecha',
        'La app la pide con un calendario: esto llegó por otro camino o el teléfono no tenía calendario. '
        + 'Pregúntasela: es el dato que piden las centrales de riesgo.');
      return;
    }
    if (!hoy) {
      anota.parcial('Falta la fecha de hoy: no se pudo mirar si la fecha de expedición ya pasó.');
    } else if (f.dia > hoy.dia) {
      anota.mirar('expedicion_futura', MEDIO,
        'La cédula aparece expedida el ' + fmtFecha(f, true) + ', una fecha que todavía no llega',
        'Puede ser un error al escribirla. Pregúntasela: es el único dato de la cédula que no sale del código de barras.');
    }
    var nac = nacimientoDelCodigo(ctx) || fechaDeTexto(campo(d, 'nacimiento'));
    if (nac && hoy && nac.dia > hoy.dia) nac = null;   // un nacimiento que no ha llegado no sirve de vara
    /* Solo la cédula de ciudadanía exige los 18 (art. 98 de la Constitución);
       un pasaporte o una cédula de extranjería se pueden sacar antes. */
    if (nac && esCedulaDeCiudadania(campo(d, 'tipo_doc'))) {
      var cumple = cumpleEn(nac, UMBRALES.MAYORIA);
      if (cumple && f.dia < cumple.dia) {
        anota.mirar('expedicion_antes_de_18', MEDIO,
          'La cédula aparece expedida el ' + fmtFecha(f, true) + ', antes de que cumpliera 18 (nació el ' + fmtFecha(nac, true) + ')',
          'La cédula de ciudadanía se expide desde los 18 años. Puede ser un error al escribir la fecha; pregúntasela.');
      }
    }
  }

  /* ---- 9. LA RED Y EL APARATO ---- */
  function aparatoEspecifico(ua) { return /Build\//.test(ua); }
  function reglaRed(ctx, anota) {
    var reg = ctx.reg;
    if (!reg.huella) {
      return anota.sinDatos(ctx.donde === 'celular'
        ? 'La red y el aparato se revisan en el computador: el celular no los recibe.'
        : 'Sin huella de red y aparato: solo queda si subió fotos o la lectura de la cédula (desde el 8-sep-2026).');
    }
    var especifico = aparatoEspecifico(reg.aparato);
    if (!reg.ip && !especifico) return anota.sinDatos('La huella no trae una IP con qué comparar.');
    if (ctx.otros === null) return anota.sinDatos('No hay otros registros con qué comparar la red.');

    var ventana = UMBRALES.RED_DIAS * 86400000;
    var cerca = ctx.otros.filter(function (o) {
      if (!isFinite(reg.creado)) return true;
      return isFinite(o.creado) && Math.abs(o.creado - reg.creado) <= ventana;
    });
    var red = reg.ip ? cerca.filter(function (o) { return o.ip === reg.ip; }) : [];
    var aparato = especifico ? cerca.filter(function (o) { return o.aparato === reg.aparato; }) : [];
    var ambos = red.filter(function (o) { return aparato.indexOf(o) >= 0; });
    var semana = 'en ' + UMBRALES.RED_DIAS + ' días';

    if (ambos.length >= UMBRALES.RED_Y_APARATO_OTROS) {
      /* Peso 1 desde el 2-oct-2026: «Build/» lo dicen igual todos los
         teléfonos del mismo modelo (ver LA RED arriba). */
      anota.mirar('red_y_aparato', BAJO,
        'Se registró desde la misma red y un teléfono que se anuncia igual que ' + ambos.length + ' registros más ' + semana,
        'Fueron ' + cuandoVarios(ambos, ctx.hoy) + '. Puede ser una sola persona registrando a varias; una familia que '
        + 'comparte el wifi suele usar teléfonos distintos.');
      return;
    }
    if (red.length >= UMBRALES.RED_OTROS) {
      anota.mirar('misma_red', BAJO,
        'Se registró desde la misma red (IP) que ' + red.length + ' registros más ' + semana,
        'Fueron ' + cuandoVarios(red, ctx.hoy) + '. Una familia comparte el wifi y los operadores ponen a mucha gente '
        + 'detrás de una misma IP; por eso solo se avisa desde ' + (UMBRALES.RED_OTROS + 1) + ' registros ' + semana + '.');
    }
    if (aparato.length >= UMBRALES.APARATO_OTROS) {
      anota.mirar('mismo_aparato', BAJO,
        'Desde un teléfono que se anuncia exactamente igual se registraron ' + aparato.length + ' personas más ' + semana,
        'Fueron ' + cuandoVarios(aparato, ctx.hoy) + '. Lo que se compara es lo que el navegador dice de sí mismo, '
        + 'y teléfonos iguales lo dicen igual: es una pista, no una prueba.');
    }
  }

  /* El orden de esta lista es el orden en que salen los empates de peso. */
  var REGLAS = [
    { clave: 'edad', nombre: 'La edad', correr: reglaEdad },
    { clave: 'cotejo', nombre: 'El cotejo con el código de barras', correr: reglaCotejo },
    { clave: 'cedula', nombre: 'La cédula repetida', correr: reglaCedula },
    { clave: 'celular', nombre: 'El celular', correr: reglaCelular },
    { clave: 'referencias', nombre: 'Las referencias', correr: reglaReferencias },
    { clave: 'expedicion', nombre: 'La fecha de expedición', correr: reglaExpedicion },
    { clave: 'fotos', nombre: 'Las fotos', correr: reglaFotos },
    { clave: 'rostro', nombre: 'El rostro contra la cédula', correr: reglaRostro },
    { clave: 'red', nombre: 'La red y el aparato', correr: reglaRed }
  ];

  /* ==========================================================================
   * LA REVISIÓN
   * ======================================================================== */

  function resumir(res) {
    var n = res.para_mirar.length;
    if (n) {
      return { estado: 'para_mirar', titulo: 'Para mirar, y por qué',
               frase: n === 1 ? 'Hay 1 cosa para mirar.' : 'Hay ' + n + ' cosas para mirar.' };
    }
    /* Ni «aprobado» ni «confiable»: que las reglas no encuentren nada no dice
       quién es la persona. Y si alguna regla no tuvo con qué, se dice. */
    var sinMirar = res.reglas_sin_datos.filter(function (x) { return !x.parcial; }).length;
    return { estado: 'sin_nada', titulo: 'Sin nada que mirar',
             frase: 'Las reglas no encontraron nada.'
               + (sinMirar ? ' ' + (sinMirar === 1 ? 'Una no tuvo' : sinMirar + ' no tuvieron') + ' con qué revisar.' : '') };
  }

  function revisarNormalizado(reg, otros, cartera, c) {
    var ctx = {
      reg: reg,
      otros: otros,
      cartera: cartera,
      hoy: fechaDeTexto(campo(c, 'hoy')),
      donde: campo(c, 'donde') === 'celular' ? 'celular' : 'computador',
      fotos: campo(c, 'fotos'),
      rostro: campo(c, 'rostro'),
      cotejo: esObjeto(campo(c, 'cotejo')) ? c.cotejo : reg.cotejo
    };
    var res = { version: VERSION, para_mirar: [], neutros: [], reglas_corridas: [], reglas_sin_datos: [] };
    var orden = 0;

    REGLAS.forEach(function (R, r) {
      var acc = { mirar: [], neutros: [], sin: null, parcial: null };
      var anota = {
        mirar: function (clave, peso, txt, detalle, extra) {
          var it = { clave: clave, regla: R.clave, peso: peso, texto: txt, detalle: detalle || '' };
          if (extra && extra.biometrico) it.biometrico = true;
          acc.mirar.push({ it: it, r: r, n: orden++ });
        },
        neutro: function (clave, txt, extra) {
          var it = { clave: clave, regla: R.clave, texto: txt };
          if (extra && extra.biometrico) it.biometrico = true;
          acc.neutros.push(it);
        },
        /* Sin datos es ANTES de anotar nada: si una regla anotara y después dijera
           que no tenía con qué, lo anotado se perdería sin ruido. Mejor que
           reviente y lo diga (lo caza la prueba de lo raro). */
        sinDatos: function (txt) {
          if (acc.mirar.length || acc.neutros.length) throw new Error('la regla ' + R.clave + ' dijo «sin datos» después de anotar');
          acc.sin = txt;
        },
        parcial: function (txt) { acc.parcial = txt; }
      };
      try {
        R.correr(ctx, anota);
      } catch (e) {
        /* No se traga: una regla que revienta lo DICE, con la regla y el
           motivo, en vez de callarse y dejar que el silencio se lea como «no
           encontró nada». Las pruebas exigen que esto no pase con ningún
           registro, por raro que venga. */
        acc = { mirar: [], neutros: [], parcial: null, fallo: true,
                sin: 'Esta regla no pudo leer este registro (' + eco(e && e.message, 80) + '). Míralo a mano.' };
      }
      if (acc.sin !== null) {
        var s = { clave: R.clave, texto: acc.sin };
        if (acc.fallo) s.fallo = true;
        res.reglas_sin_datos.push(s);
        return;
      }
      res.reglas_corridas.push(R.clave);
      if (acc.parcial) res.reglas_sin_datos.push({ clave: R.clave, texto: acc.parcial, parcial: true });
      acc.mirar.forEach(function (x) { res.para_mirar.push(x); });
      acc.neutros.forEach(function (x) { res.neutros.push(x); });
    });

    res.para_mirar = res.para_mirar
      .sort(function (a, b) { return (b.it.peso - a.it.peso) || (a.r - b.r) || (a.n - b.n); })
      .map(function (x) { return x.it; });
    res.peso_max = res.para_mirar.length ? res.para_mirar[0].peso : 0;
    res.resumen = resumir(res);
    return res;
  }

  function normalizarOtros(lista, propio, idPropio) {
    if (!Array.isArray(lista)) return null;
    var out = [];
    lista.forEach(function (o) {
      if (o === propio) return;
      var n = normalizarRegistro(o);
      if (idPropio && n.id === idPropio) return;
      out.push(n);
    });
    return out;
  }

  /**
   * Revisa UN registro.
   *
   * @param registro  la fila de la bandeja: la de listar_registros (entera, con
   *                  datos y huella) o la de panel_registros (la del celular).
   * @param contexto  {
   *   otros:   [filas de la bandeja] o null. La propia se descarta sola (por
   *            identidad o por id). null = no hay con qué comparar.
   *   cartera: {socios:[…]} o el arreglo de socios, o null.
   *            (`prestamos` se acepta y no se usa: ninguna regla lo necesita.)
   *   fotos:   {frente, reverso, selfie} con lo que devuelve medirFoto, o null.
   *            También acepta cedula_frente / cedula_reverso.
   *   rostro:  {distancia} o {sin_rostro: 'selfie'|'cedula'|'ambas'}, o null.
   *   cotejo:  un cotejo recién hecho en el computador; manda sobre el guardado.
   *   hoy:     'AAAA-MM-DD'. Lo pone quien llama: este archivo no mira el reloj.
   *   donde:   'computador' (por defecto) o 'celular': solo cambia cómo se
   *            explica lo que no se pudo revisar.
   * }
   * @returns {
   *   version, resumen:{estado:'para_mirar'|'sin_nada', titulo, frase},
   *   para_mirar:[{clave, regla, peso 1-3, texto, detalle, biometrico?}]  de lo más grave a lo menos,
   *   neutros:[{clave, regla, texto, biometrico?}],
   *   reglas_corridas:['edad', …],
   *   reglas_sin_datos:[{clave, texto, parcial?, fallo?}],
   *   peso_max
   * }
   * Todos los textos son TEXTO PLANO: se escapan al pintarlos.
   */
  function revisarRegistro(registro, contexto) {
    var c = esObjeto(contexto) ? contexto : {};
    var reg = normalizarRegistro(registro);
    return revisarNormalizado(reg, normalizarOtros(campo(c, 'otros'), registro, reg.id),
                              normalizarCartera(campo(c, 'cartera')), c);
  }

  /**
   * Revisa una bandeja entera: cada uno contra todos los demás de la lista.
   * Normaliza cada fila UNA vez (con 200 filas son 40.000 cruces, no 40.000
   * normalizaciones).
   *
   * @param contexto  {cartera, hoy, donde, porId: {<id>: {fotos, rostro, cotejo}},
   *                   ademas: [filas contra las que se compara pero que no se
   *                   revisan — los atendidos y descartados: la bandeja solo
   *                   trae los nuevos, y la cédula repetida suele estar ahí]}
   * @returns [{id, resultado}] en el orden de la lista
   */
  function revisarLista(registros, contexto) {
    var c = esObjeto(contexto) ? contexto : {};
    var lista = Array.isArray(registros) ? registros : [];
    var norm = lista.map(normalizarRegistro);
    var ademas = Array.isArray(campo(c, 'ademas')) ? c.ademas.map(normalizarRegistro) : [];
    var cartera = normalizarCartera(campo(c, 'cartera'));
    var porId = esObjeto(campo(c, 'porId')) ? c.porId : {};
    return norm.map(function (reg, i) {
      var otros = norm.filter(function (o, j) { return j !== i && !(reg.id && o.id === reg.id); })
        .concat(ademas.filter(function (o) { return !(reg.id && o.id === reg.id); }));
      var extra = (reg.id && esObjeto(campo(porId, reg.id))) ? porId[reg.id] : {};
      var ctx = {
        hoy: campo(c, 'hoy'), donde: campo(c, 'donde'),
        fotos: campo(extra, 'fotos'), rostro: campo(extra, 'rostro'), cotejo: campo(extra, 'cotejo')
      };
      return { id: reg.id, resultado: revisarNormalizado(reg, otros, cartera, ctx) };
    });
  }

  /**
   * La revisión SIN lo que salió de comparar rostros, para lo que vaya a la
   * nube o al celular. Copia nueva: no toca la que recibe.
   */
  function sinBiometria(res) {
    if (!esObjeto(res)) return res;
    var limpio = function (x) { return !(x && x.biometrico); };
    var copia = {
      version: res.version,
      para_mirar: (res.para_mirar || []).filter(limpio).map(function (x) { return Object.assign({}, x); }),
      neutros: (res.neutros || []).filter(limpio).map(function (x) { return Object.assign({}, x); }),
      reglas_corridas: (res.reglas_corridas || []).filter(function (k) { return k !== 'rostro'; }),
      reglas_sin_datos: (res.reglas_sin_datos || []).filter(function (x) { return x.clave !== 'rostro'; })
        .map(function (x) { return Object.assign({}, x); })
    };
    copia.peso_max = copia.para_mirar.length ? copia.para_mirar[0].peso : 0;
    copia.resumen = resumir(copia);
    return copia;
  }

  /* ==========================================================================
   * MEDIR UNA FOTO — lo usa la página del computador. Puro: recibe los
   * píxeles en gris y devuelve números. Nunca guarda la foto ni la manda a
   * ningún lado.
   * ======================================================================== */

  /* RGBA → gris 0..255, con los pesos de ZXing (306, 601, 117 >> 10), los
     mismos de grisDeImageData en app/escaner-cedula.js: lo que se mide es lo
     mismo que ve el lector del código de barras. */
  function grisDeRGBA(data, ancho, alto) {
    var n = ancho * alto, g = new Uint8Array(n);
    for (var i = 0, j = 0; j < n; i += 4, j++) {
      g[j] = (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
    }
    return g;
  }

  /* Reduce por promedio de área hasta que el lado mayor sea `lado`. Nunca
     agranda: agrandar inventa píxeles y bajaría la nitidez de una foto chica
     que ya tiene su propio aviso. */
  function reducir(gris, ancho, alto, lado) {
    var f = Math.max(ancho, alto) / lado;
    if (!(f > 1)) {
      var copia = new Float32Array(ancho * alto);
      for (var k = 0; k < copia.length; k++) copia[k] = gris[k];
      return { gris: copia, ancho: ancho, alto: alto };
    }
    var na = Math.max(1, Math.round(ancho / f)), nh = Math.max(1, Math.round(alto / f));
    var out = new Float32Array(na * nh);
    for (var y = 0; y < nh; y++) {
      var y0 = Math.floor(y * alto / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * alto / nh));
      for (var x = 0; x < na; x++) {
        var x0 = Math.floor(x * ancho / na), x1 = Math.max(x0 + 1, Math.floor((x + 1) * ancho / na));
        var s = 0, c = 0;
        for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) { s += gris[yy * ancho + xx]; c++; }
        out[y * na + x] = s / c;
      }
    }
    return { gris: out, ancho: na, alto: nh };
  }

  /* Suavizado binomial 3×3 ([1 2 1]/4 en cada eje), con el borde repetido. Es
     lo que separa la nitidez del ruido del sensor: ver NITIDEZ_MIN. */
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

  /**
   * La varianza del laplaciano de 4 vecinos (0 1 0 / 1 −4 1 / 0 1 0) sobre los
   * píxeles interiores. Un borde nítido da un laplaciano grande; una foto
   * movida reparte el borde en varios píxeles y lo achica.
   * Desde el 2-oct-2026 NO es la nitidez de la foto (crecía con el contraste
   * al cuadrado y no veía el pulso de la mano: ver NITIDEZ_MIN); queda como
   * pieza pública para quien quiera la cuenta clásica.
   *
   * @param recorte  {x, y, ancho, alto} opcional: mide solo esa zona.
   * @returns número ≥ 0; 0 si la zona no tiene interior (menos de 3×3).
   */
  function varianzaLaplaciano(gris, ancho, alto, recorte) {
    var rx = 0, ry = 0, rw = ancho, rh = alto;
    if (recorte) {
      rx = Math.max(0, Math.floor(recorte.x || 0)); ry = Math.max(0, Math.floor(recorte.y || 0));
      rw = Math.min(ancho - rx, Math.floor(recorte.ancho || 0)); rh = Math.min(alto - ry, Math.floor(recorte.alto || 0));
    }
    var s = 0, s2 = 0, n = 0;
    for (var y = Math.max(1, ry); y < Math.min(alto - 1, ry + rh); y++) {
      for (var x = Math.max(1, rx); x < Math.min(ancho - 1, rx + rw); x++) {
        var i = y * ancho + x;
        var v = gris[i - ancho] + gris[i + ancho] + gris[i - 1] + gris[i + 1] - 4 * gris[i];
        s += v; s2 += v * v; n++;
      }
    }
    if (!n) return 0;
    var m = s / n;
    return Math.max(0, s2 / n - m * m);
  }

  /* Un recorte {x, y, ancho, alto} dentro de la foto, o la foto entera. */
  function zona(ancho, alto, recorte) {
    if (!recorte) return { x: 0, y: 0, ancho: ancho, alto: alto };
    var x = Math.max(0, Math.floor(recorte.x || 0)), y = Math.max(0, Math.floor(recorte.y || 0));
    return { x: x, y: y, ancho: Math.max(0, Math.min(ancho - x, Math.floor(recorte.ancho || 0))),
             alto: Math.max(0, Math.min(alto - y, Math.floor(recorte.alto || 0))) };
  }

  /* Los mosaicos de una zona: por cada uno, su contraste (la varianza del
     gris) y la varianza de la segunda derivada en la dirección MÁS POBRE de
     cuatro (horizontal, vertical y las dos diagonales). Se mide en el
     interior del mosaico, así que nunca se sale de la foto. */
  function mosaicosDe(g, ancho, alto, z) {
    var T = UMBRALES.MOSAICO, out = [];
    var a = new Float64Array(4), a2 = new Float64Array(4), d = new Float64Array(4);
    for (var ty = z.y; ty + T <= z.y + z.alto; ty += T) {
      for (var tx = z.x; tx + T <= z.x + z.ancho; tx += T) {
        var s = 0, s2 = 0, n = 0, k;
        for (k = 0; k < 4; k++) { a[k] = 0; a2[k] = 0; }
        for (var y = ty + 1; y < ty + T - 1; y++) {
          for (var x = tx + 1; x < tx + T - 1; x++) {
            var i = y * ancho + x, v = g[i];
            s += v; s2 += v * v; n++;
            d[0] = g[i - 1] - 2 * v + g[i + 1];
            d[1] = g[i - ancho] - 2 * v + g[i + ancho];
            /* En diagonal los vecinos están a √2: dividir por 2 deja la
               segunda derivada en la misma escala que las otras dos. */
            d[2] = (g[i - ancho - 1] - 2 * v + g[i + ancho + 1]) / 2;
            d[3] = (g[i - ancho + 1] - 2 * v + g[i + ancho - 1]) / 2;
            for (k = 0; k < 4; k++) { a[k] += d[k]; a2[k] += d[k] * d[k]; }
          }
        }
        if (!n) continue;
        var m = s / n, dirs = [], pobre = Infinity;
        for (k = 0; k < 4; k++) {
          var mk = a[k] / n, vk = Math.max(0, a2[k] / n - mk * mk);
          dirs.push(vk); if (vk < pobre) pobre = vk;
        }
        out.push({ contraste: Math.max(0, s2 / n - m * m), dirs: dirs, pobre: pobre });
      }
    }
    return out;
  }
  function percentil(lista, p) {
    var o = lista.slice().sort(function (x, y) { return x - y; });
    return o.length ? o[Math.min(o.length - 1, Math.floor(o.length * p))] : 0;
  }

  /**
   * La nitidez que comparan los umbrales (2-oct-2026; la cuenta y el porqué
   * están en NITIDEZ_MIN, arriba): suavizado binomial 3×3; mosaicos de 32
   * px; en cada mosaico con algo que enfocar, la segunda derivada menos el
   * piso de grano de la foto, dividida por el contraste del mosaico.
   *   · La cédula (porDireccion falso): la dirección más pobre de CADA
   *     mosaico, y de esos, el percentil `p`. La letra tiene trazos en todas
   *     las direcciones, así que casi todo mosaico dice algo.
   *   · La selfie (porDireccion verdadero): el percentil `p` de cada
   *     dirección por separado, y la más pobre de las cuatro. Una cara tiene
   *     pocos mosaicos con detalle en dos direcciones; así, el pulso de la
   *     mano, que se lleva una dirección entera, baja el número aunque algún
   *     mosaico conserve detalle de casualidad.
   *
   * @param recorte  {x, y, ancho, alto} opcional: mide solo esa zona (el
   *                 piso de grano se saca siempre de la foto entera).
   * @param p        el percentil, 0..1 (por defecto la mediana).
   * @returns número ≥ 0; 0 si no hay ningún mosaico con algo que enfocar.
   */
  function nitidezDeGris(gris, ancho, alto, recorte, p, porDireccion) {
    var g = suavizarBinomial(gris, ancho, alto);
    var q = typeof p === 'number' && p >= 0 && p <= 1 ? p : 0.5;
    var todos = mosaicosDe(g, ancho, alto, zona(ancho, alto, null));
    var piso = percentil(todos.map(function (t) { return t.pobre; }), UMBRALES.PISO_DE_GRANO);
    var aqui = (recorte ? mosaicosDe(g, ancho, alto, zona(ancho, alto, recorte)) : todos)
      .filter(function (t) { return t.contraste >= UMBRALES.MOSAICO_VARIANZA_MIN; });
    if (!aqui.length) return 0;
    var razon = function (v, t) { return 1000 * Math.max(0, v - piso) / t.contraste; };
    if (!porDireccion) return percentil(aqui.map(function (t) { return razon(t.pobre, t); }), q);
    var min = Infinity;
    for (var k = 0; k < 4; k++) {
      var pk = percentil(aqui.map(function (t) { return razon(t.dirs[k], t); }), q);
      if (pk < min) min = pk;
    }
    return min;
  }

  /**
   * Mide una foto ya pasada a gris (grisDeRGBA sobre el ImageData del lienzo).
   *
   * @param opciones {tipo: 'documento'|'selfie', bytes}
   * @returns {ancho, alto, bytes, nitidez, brillo, saturados, medida:{ancho, alto}}
   *          o null si los píxeles no cuadran con el tamaño.
   */
  function medirFoto(gris, ancho, alto, opciones) {
    var o = esObjeto(opciones) ? opciones : {};
    ancho = Math.floor(numero(ancho)); alto = Math.floor(numero(alto));
    if (!(ancho >= 1 && alto >= 1) || !gris || !(gris.length >= ancho * alto)) return null;
    var r = reducir(gris, ancho, alto, UMBRALES.LADO_MEDIDA);
    var g = r.gris, tipo = o.tipo === 'selfie' ? 'selfie' : 'documento';
    var recorte = null;
    if (tipo === 'selfie') {
      var cw = Math.round(r.ancho * UMBRALES.SELFIE_CENTRO.ancho), ch = Math.round(r.alto * UMBRALES.SELFIE_CENTRO.alto);
      recorte = { x: Math.floor((r.ancho - cw) / 2), y: Math.floor((r.alto - ch) / 2), ancho: cw, alto: ch };
    }
    /* Brillo y reflejo: la cédula en la foto entera; la selfie en el centro,
       donde la app midió la luz antes de tomarla (2-oct-2026). */
    var z = zona(r.ancho, r.alto, recorte), suma = 0, quemados = 0, n = 0;
    for (var y = z.y; y < z.y + z.alto; y++) {
      for (var x = z.x; x < z.x + z.ancho; x++) {
        var v = g[y * r.ancho + x];
        suma += v; n++; if (v >= UMBRALES.SATURADO_NIVEL) quemados++;
      }
    }
    if (!n) n = 1;
    var bytes = numero(o.bytes);
    return {
      ancho: ancho,
      alto: alto,
      bytes: bytes >= 0 ? Math.round(bytes) : null,
      nitidez: Math.round(nitidezDeGris(g, r.ancho, r.alto, recorte, UMBRALES.NITIDEZ_PERCENTIL[tipo], tipo === 'selfie') * 10) / 10,
      brillo: Math.round(suma / n * 10) / 10,
      saturados: Math.round(quemados / n * 1000) / 1000,
      medida: { ancho: r.ancho, alto: r.alto }
    };
  }

  /* Cuánto pesa una foto que llegó como data: URL, con la MISMA reja de
     fotoSegura en panel/crm.html:1495: solo base64 limpio de los formatos que
     produce una cámara. Lo demás devuelve null, y una foto que no pasa esta
     reja no se mide ni se pinta. */
  function bytesDeFoto(src) {
    var s = texto(src);
    var m = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+\/]+={0,2})$/.exec(s);
    if (!m) return null;
    var b = m[1], relleno = /==$/.test(b) ? 2 : /=$/.test(b) ? 1 : 0;
    return Math.floor(b.length * 3 / 4) - relleno;
  }

  return {
    VERSION: VERSION,
    UMBRALES: UMBRALES,
    AVISO_WHATSAPP: AVISO_WHATSAPP,
    REGLAS: REGLAS.map(function (R) { return { clave: R.clave, nombre: R.nombre }; }),

    revisarRegistro: revisarRegistro,
    revisarLista: revisarLista,
    sinBiometria: sinBiometria,

    /* medir fotos (en el computador) */
    grisDeRGBA: grisDeRGBA,
    varianzaLaplaciano: varianzaLaplaciano,
    nitidezDeGris: nitidezDeGris,
    medirFoto: medirFoto,
    bytesDeFoto: bytesDeFoto,

    /* las piezas, para las pruebas y para quien pinte */
    celularValido: celularValido,
    cedulaNorm: cedulaNorm,
    fechaDeTexto: fechaDeTexto
  };
});
