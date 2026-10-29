/* ============================================================================
 * TU HISTORIA LABORAL: EL PASO DEL REGISTRO Y LA TARJETA DE LA APP
 * 28 de octubre de 2026
 *
 * Joan: «que el cliente autorice la verificación del fondo de pensiones, que
 * aparezca la lista… que lo podamos redirigir a la página del fondo… y que
 * este reporte se agregue automáticamente al registro del cliente». Y
 * después: «que esté la opción para subir el pdf… investiga si en vez de un pdf
 * el cliente pudiera simplemente enviar un pantallazo… o que simplemente desde
 * la app sea un pegar… y quiero que sea opcional en la mitad del proceso de
 * registro».
 *
 * Lo usan dos páginas con la MISMA pantalla, para que el texto de la
 * autorización no pueda decir una cosa en el registro y otra en la app:
 *   · play/ — el paso opcional «Tu fondo de pensiones», después de «De qué
 *     vives». Sin cuenta todavía no hay sesión, así que lo escogido espera EN
 *     EL TELÉFONO (guardadero) y sube con la sesión al abrir la cuenta
 *     (encolar + subirCola), como las fotos de la cédula.
 *   · app/socio.html — «Tu historia laboral» para quien lo dejó para después:
 *     ahí ya hay sesión y cada archivo sube en el momento.
 * Las reglas de la base están en base/20261103_el_fondo_de_pensiones.sql: el
 * teléfono se puede saltar todo lo de aquí, y la base lo vuelve a mirar.
 *
 * LAS TRES FORMAS, Y LO QUE DE VERDAD HACE CADA UNA:
 *   · 📄 Subir el PDF — el mejor: es el documento tal como lo mandó el fondo,
 *     con su texto. Se sube igual, sin tocarlo.
 *   · 🖼️ Subir pantallazos — hasta 5. Si pesan mucho se achican en el teléfono
 *     (el 🖼 lleva su selector de emoji, U+FE0F: sin él, muchos teléfonos lo
 *     dibujan como un signo gris de texto, y en los avisos se lee raro).
 *     (JPEG, hasta 2.000 px de lado: el texto se sigue leyendo) antes de subir.
 *     Y toda imagen, pese lo que pese, sale SIN sus metadatos (el EXIF trae
 *     dónde se tomó y el modelo del teléfono): ver «los metadatos de una
 *     imagen» (28-oct-2026, arreglo de los leves).
 *   · 📋 Pegar — para quien COPIÓ el pantallazo. Primero se intenta leer lo
 *     copiado (navigator.clipboard.read, que en iPhone muestra su botón
 *     «Pegar» y en Android puede pedir permiso); si el teléfono no deja o no
 *     lo tiene, aparece un recuadro donde se mantiene presionado → «Pegar».
 *     Si tampoco, se dice y se ofrece subir. Copiar un PDF casi ningún
 *     teléfono lo deja: «Pegar» es en la práctica para pantallazos.
 *     28-oct-2026 (arreglo, ronda 1) — LO PEGADO SE MUESTRA Y SE PREGUNTA
 *     ANTES DE GUARDARLO. Un toque en «Pegar» subía lo que hubiera en el
 *     portapapeles —la foto de un chat, un comprobante— sin enseñarlo, y la
 *     lista y el CRM lo llamaban «Pantallazo». Quien escoge un archivo lo ve
 *     en el selector del teléfono; quien pega no veía nada, y la política
 *     promete «solo recibimos los archivos que tú escojas». Ahora lo copiado
 *     se ve (la imagen, o el nombre y el tamaño del PDF) con «¿Es tu historia
 *     laboral?», y solo «Sí» lo guarda o lo sube. La lista también lo enseña:
 *     la miniatura de cada pantallazo y el nombre de cada archivo que se
 *     tengan en el teléfono (en la app, los que subió en esta visita: la base
 *     no devuelve el contenido, ver pension_mia).
 *
 * LO QUE NO HACE, Y POR ESO NINGÚN TEXTO LO DICE: no lee el documento, no lo
 * «verifica con el fondo» (ningún fondo tiene cómo), no pide nunca la clave
 * del fondo y no cambia la garantía. Lo mira Joan.
 *
 * DÓNDE ESPERA EN EL REGISTRO (el guardadero), Y POR QUÉ ASÍ:
 *   · Lo que la persona escogió —la autorización, sus fondos, qué página
 *     abrió— vive como el borrador (localStorage, por intento y celular): es
 *     lo que tiene que sobrevivir a salir al correo y volver, aunque la
 *     pestaña se vuelva a abrir. Se va con «Empezar de cero», con el cambio de
 *     celular y al abrir la cuenta (pasa a la cola).
 *   · Los ARCHIVOS viven en IndexedDB y no en localStorage: un PDF de 2 MB
 *     reventaría los ~5 MB que ya ocupan las fotos de la cédula, y con ellas
 *     todas las escrituras del registro. Siguen la regla de las fotos: atados
 *     al intento y al celular, se sueltan al salir del registro y caducan al
 *     día. Si el teléfono no tiene IndexedDB (modo privado viejo) esperan en
 *     la memoria de la página, y la pantalla lo dice.
 *   · Al abrir la cuenta pasan a la COLA de esa cuenta (su celular), y solo la
 *     sesión de esa cuenta los sube. Ningún otro registro la toca.
 *   · 28-oct-2026 (arreglo, ronda 1) — EL PASO MANDA A LA PERSONA AFUERA, Y
 *     AFUERA CORRE EL RELOJ DE LA CÁMARA. Al volver, la página se rige por la
 *     regla de las fotos (app/escaner-cedula.js, MINUTOS_VUELTA_DE_LA_CAMARA):
 *     si el teléfono la cerró y pasó más de ese rato, se borran la cédula, la
 *     selfie y lo escogido aquí, y el registro vuelve al paso 1. Visto en
 *     Chrome sin ventana: irse al correo como decía el paso y volver a los 15
 *     minutos era volver a escanear la cédula, y nada lo había dicho antes.
 *     La regla NO se afloja por esto (protege el teléfono prestado: la
 *     decisión del 20-oct); el aviso va ANTES de los botones que sacan de la
 *     página, con los minutos de la regla misma (minutosFuera), y ofrece el
 *     camino que no pierde nada: seguir con el registro y subirla después
 *     desde la cuenta.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.HistoriaLaboral = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* La versión del texto de la autorización: la fecha de la política que la
     describe (legal/privacidad.html, «Lo que cambió el 30 de octubre de
     2026»). Si la política sale otro día, se mueven las dos juntas: lo vigila
     pruebas/el-fondo-de-pensiones.test.js. NO es VERSION_AUTORIZACION de
     app/cuenta.js: esa es la general, y no sube (a nadie se le vuelve a pedir
     nada por esto).
     28-oct-2026 (segunda revisión, ronda 1) — decía 2026-11-03,
     el día del piloto que se había propuesto, y el lote sale el viernes 30
     (Joan, 28-oct en la noche: «publícalo con lo del viernes»). Del 30 al
     lunes 2 (festivo) la casilla habría firmado una versión que la misma
     política publicada decía que todavía no regía. La fecha es la de
     PUBLICACIÓN (la regla del 15-oct): si el lote se corre de día, se mueve
     aquí, en la casilla y en la política y los términos, y la prueba
     «el día en que el lote sale al sitio» dice qué más. */
  var VERSION_AUTORIZACION = '2026-10-30';

  /* Los topes son los de la base (pension_subir): aquí se miran antes para
     decirlo sin gastar la subida, y allá otra vez. */
  var LIMITES = {
    bytes: 3145728,            // 3 MB por archivo
    pdf: 2,                    // Colpensiones y un fondo privado
    imagenes: 5,
    totalBytes: 12582912,      // 12 MB por persona
    ladoImagen: 2000,          // px del lado largo de un pantallazo achicado
    calidad: 0.85,
    achicarDesde: 1048576      // un pantallazo de más de 1 MB se achica
  };
  var HORAS_ARCHIVOS = 24;     // lo que espera en el teléfono: como la cola de las fotos
  var DIAS_ESTADO = 7;         // lo escogido (sin archivos): como un borrador
  var LLAVE_ESTADO = 'play_pension';
  var BASE_DE_DATOS = 'tg_historia_laboral';

  /* La lista de fondos vive en app/fondos-pension.js. Se busca al usarla (y
     no al cargar) para que el orden de los <script> no importe. */
  function F() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { return require('./fondos-pension.js'); } catch (e) { /* sigue */ }
    }
    return (typeof globalThis !== 'undefined' && globalThis.FondosPension) || null;
  }

  /* 28-oct-2026 (arreglo, ronda 1) — Cuántos minutos puede estar la persona
     fuera de la página sin perder la cédula: los de la regla que lo decide al
     abrir (app/escaner-cedula.js, MINUTOS_VUELTA_DE_LA_CAMARA), leídos de
     allá para que el aviso no diga un número y la regla aplique otro. Con un
     escaner-cedula.js viejo sin el dato, 10: el de la regla desde el 20-oct. */
  function minutosFuera() {
    var E = null;
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { E = require('./escaner-cedula.js'); } catch (e) { /* sigue */ }
    }
    E = E || (typeof globalThis !== 'undefined' && globalThis.EscanerCedula) || null;
    var m = E ? Number(E.MINUTOS_VUELTA_DE_LA_CAMARA) : 0;
    return m > 0 ? m : 10;
  }
  function conMinutos(t) { return String(t).replace('{min}', String(minutosFuera())); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* ---------------------------------------------------------------- textos */
  var TEXTOS = {
    /* 28-oct-2026 (segunda revisión, ronda 1) — «y no cambia tu
       garantía», como ya lo decía la tarjeta de la cuenta (introCuenta). Los
       términos cambian con este lote (la historia laboral no sube la garantía
       prestada) y su punto 11 promete avisar dentro de la app antes de que
       rija. Ese cambio solo le toca a quien da su historia laboral, y para
       darla hay que pasar por aquí o por la tarjeta: las dos lo dicen arriba de
       la casilla, ANTES de que la dé. Lo vigila pruebas/el-fondo-de-pensiones.test.js. */
    intro: 'Opcional. Tu historia laboral es el documento de tu fondo de pensiones que dice dónde has trabajado y cuánto ' +
      'has cotizado. Si nos la das, la miramos al revisar tu solicitud, y no cambia tu garantía. Si no, tu registro sigue igual.',
    /* 28-oct-2026 (arreglo de los leves, P4) — decía «No cambia tu garantía:
       tu garantía sale de tus pagos», y para quien se acaba de registrar es
       falso: toda su garantía es la prestada por sus datos (legal/terminos.html,
       «La que te prestamos nosotros»). Lo verdadero es lo primero, solo. */
    introCuenta: 'Opcional. El documento de tu fondo de pensiones que dice dónde has trabajado y cuánto has cotizado. ' +
      'Si nos lo das, lo miramos al revisar tus solicitudes. No cambia tu garantía.',
    autorizacion: 'Autorizo a NEXECO S.A.S. (Tu Garantía) a recibir y guardar mi historia laboral y el nombre de mi fondo de pensiones.',
    /* Lo que la ley pide decir al pedirla (Ley 1581, arts. 9 y 12; Decreto
       1377, arts. 5 y 7): para qué, que es opcional, cuánto se guarda, quién
       la ve y cómo se retira. Cada frase es verdad en el código: la ve solo
       Joan (pension_archivo pide su clave), se guarda mientras haya cuenta (no
       caduca), se quita desde la app (pension_retirar) o por el chat
       (pension_borrar, desde el CRM). */
    /* 28-oct-2026 (arreglo de los leves, P5) — LAS INCAPACIDADES Y LICENCIAS,
       COMO DE VERDAD PASA. Decía solo «no se usan para nada», y el documento
       se guarda ENTERO (pension_archivos.datos, sin recorte ni fecha): si las
       trae, quedan guardadas con él, y guardar ya es tratar el dato (Ley 1581,
       art. 3 lit. g). Son datos de salud: sensibles, y nadie está obligado a
       darlos (art. 6 lit. a). Joan decidió no esperar al abogado para esto: el
       texto tiene que ser verdadero, no prometer que no se guardan. */
    autorizacionDetalle: 'Para revisar dónde trabajo y cuánto cotizo cuando evalúen mis solicitudes de crédito. Es opcional y ' +
      'aparte de la autorización general: sin ella todo sigue igual. Nunca me piden la clave de mi fondo. Se guarda mientras ' +
      'tenga cuenta en Tu Garantía; la ve solo quien dirige el negocio, no el resto del equipo. Puedo quitarla cuando quiera ' +
      'desde mi cuenta en la app, o pedir por el chat que la borren. Si el documento trae incapacidades o licencias, que son ' +
      'datos de salud, quedan guardadas con él, pero no se usan para nada; no estoy obligado a darlas, y en un pantallazo ' +
      'las puedo tapar.',
    preguntaFondo: '¿En qué fondo estás?',
    ayudaFondo: 'Si cotizas en Colpensiones y en un fondo privado, marca los dos.',
    afuera: 'Se abre en otra pestaña, en la página oficial. Nunca te pedimos la clave de tu fondo.',
    /* 28-oct-2026 (arreglo, ronda 1) — antes de los botones que sacan de la
       página, y no después: ver «EL PASO MANDA A LA PERSONA AFUERA» arriba.
       {min} son los minutos de la regla (minutosFuera). */
    antesDeIrte: 'Antes de irte: vuelve en menos de {min} minutos.',
    antesDeIrteDetalle: 'Si pasas más rato fuera y el teléfono cierra esta página, por seguridad se borran de él las ' +
      'fotos de tu cédula y de tu cara, y tendrás que volver a tomarlas.',
    volver: 'Cuando tengas tu historia laboral, vuelve a esta pestaña de Tu Garantía y súbela aquí. Si tarda en llegarte, ' +
      'no la esperes: sigue con tu registro y súbela después desde tu cuenta en la app.',
    /* 28-oct-2026 (arreglo de los leves, P1) — DÓNDE QUEDA EL «DESPUÉS». «Lo
       hago después» no lo decía en ninguna parte: la tarjeta está al fondo del
       Perfil de la cuenta de play/ (debajo de la contraseña) y en Inicio de la
       app instalada (app/socio.html). Lo dice el registro al tocarlo, y la
       pantalla de la cuenta recién abierta si saltó el paso. Sin enlace a la
       app: play/ no enlaza al quincenal (la frontera de Play). */
    dondeDespues: 'La subes cuando quieras desde tu cuenta: Perfil → «📄 Tu historia laboral» (en la app instalada, en Inicio).',
    subela: 'Cuando la tengas, súbela',
    ayudaFormas: 'El PDF es lo mejor: es el documento tal como te lo mandó tu fondo. Si no, pantallazos donde se lean tu ' +
      'nombre, tus semanas y tus empleadores.',
    /* 28-oct-2026 (arreglo de los leves, P11) — EL PASO DEL CORREO AL
       TELÉFONO, que es lo más difícil: Colpensiones, Porvenir y Protección la
       mandan al correo, y «📄 Subir el PDF» abre el selector de archivos, donde
       un adjunto que no se descargó no aparece (en iPhone hay que tocar
       «Guardar en Archivos»). Nada lo decía: quien no lo sabía salía a
       buscarlo con el reloj de la cámara corriendo, o mandaba pantallazos. */
    delCorreo: '¿Te llegó al correo? Ábrelo en este mismo teléfono, descarga el PDF (en iPhone: «Guardar en Archivos») y ' +
      'escógelo con «📄 Subir el PDF».',
    zonaPegar: 'Mantén presionado aquí y toca «Pegar»',
    /* Lo pegado, antes de guardarlo (ver «LO PEGADO SE MUESTRA» arriba). */
    pegadoPregunta: '¿Es tu historia laboral?',
    pegadoAyuda: 'Esto es lo que copiaste. No lo guardamos hasta que toques «Sí, guardarla».',
    pegadoAyudaCuenta: 'Esto es lo que copiaste. No lo subimos hasta que toques «Sí, subirla».',
    pegadoNo: 'Listo: no guardamos lo que copiaste.',
    /* 28-oct-2026 (arreglo de los leves, P10) — «Continuar» con la pregunta
       abierta: se le pregunta, en vez de seguir y perderlo callado. */
    pegadoPendiente: 'Antes de seguir: ¿lo que pegaste es tu historia laboral? Toca «Sí, guardarla» o «No, no es esta».',
    /* 28-oct-2026 (arreglo, ronda 1) — decía «Quedan guardados en este
       teléfono» a secas, y con la vuelta de la cámara no es verdad: si la
       persona sale más del rato y el teléfono cierra la página, se borran. */
    quedanAqui: 'Quedan en este teléfono y suben con tu registro cuando toques «Abrir mi cuenta». Si sales de esta página ' +
      'más de {min} minutos y el teléfono la cierra, se borran, como las fotos de tu cédula.',
    soloMemoria: 'Este teléfono no deja guardarlos: si la página se cierra antes de abrir tu cuenta, tendrás que escogerlos otra vez.',
    perdidos: 'Los archivos que habías escogido se borraron de este teléfono porque pasó un rato desde que saliste de la ' +
      'página: escógelos otra vez.'
  };

  var MOTIVOS = {
    tipo_no_permitido: 'Ese archivo no es un PDF ni una imagen (JPG, PNG o WEBP). Escoge el PDF que te mandó tu fondo, o un pantallazo.',
    muy_grande: 'Ese archivo pesa más de 3 MB. Si es un PDF, escoge el que te llegó al correo, sin pasarlo por otras apps; si no, súbela en pantallazos.',
    demasiados_pdf: 'Ya tienes 2 PDF: quita uno para subir otro.',
    demasiados_img: 'Ya tienes 5 pantallazos: quita uno para subir otro.',
    demasiados: 'Ya tienes el máximo de archivos: quita uno para subir otro.',
    sin_espacio: 'Entre todos tus archivos pasan de 12 MB: quita uno para subir otro.',
    repetido: 'Ese archivo ya está en tu lista.',
    vacio: 'Ese archivo está vacío.',
    no_es_archivo: 'No pudimos leer ese archivo. Prueba otra vez o escoge otro.',
    lectura: 'No pudimos leer ese archivo en este teléfono. Prueba con otro.',
    sin_autorizacion: 'Primero marca la autorización de arriba.',
    freno: 'Hiciste muchos cambios seguidos. Espera unos minutos y vuelve a intentar.',
    sin_sesion: 'Se cerró tu sesión. Entra otra vez y vuelve a intentar.',
    sesion: 'Se cerró tu sesión. Entra otra vez y vuelve a intentar.',
    sin_red: 'No hay conexión. Revisa tu internet y vuelve a intentar.',
    apagado: 'Esta parte todavía no está encendida en nuestro sistema. Inténtalo más tarde.',
    /* 28-oct-2026 (arreglo, ronda 2) — el cortacircuito de pension_subir:
       el espacio de las historias laborales se llenó (ver el encabezado de
       base/20261103_el_fondo_de_pensiones.sql). No es culpa de su archivo
       ni de su señal. Y no se le ofrece mandarla por el chat: allá no la
       cubren las reglas de esta (su autorización aparte, que la vea solo
       Joan, que se borre al retirarla). */
    lleno: 'Ahora mismo no podemos recibir más historias laborales. Es opcional: tu cuenta y tus solicitudes siguen igual. Inténtalo más tarde.',
    fondos: 'Esa combinación de fondos no la podemos guardar: marca uno, o Colpensiones y un fondo privado.',
    pegar_vacio: 'No encontramos un pantallazo copiado. Cópialo primero (en tu galería: Compartir → Copiar) y vuelve a tocar «📋 Pegar», o usa «🖼️ Subir pantallazos».',
    pegar_negado: 'Tu teléfono no nos dejó leer lo que copiaste. Mantén presionado el recuadro de abajo y toca «Pegar», o usa «🖼️ Subir pantallazos».',
    pegar_sin_api: 'Mantén presionado el recuadro de abajo y toca «Pegar».',
    pegar_texto: 'Lo que pegaste es texto, no una imagen ni un PDF. Copia el pantallazo, o usa «🖼️ Subir pantallazos».'
  };
  function motivoEnPalabras(m) { return MOTIVOS[m] || 'No pudimos guardar ese archivo. Vuelve a intentar.'; }

  /* ------------------------------------------------------------ los bytes */
  /** El tipo por los primeros bytes, como la base. null si no es uno de los cuatro. */
  function tipoPorBytes(u8) {
    var b = u8 || [];
    var es = function (i, l) { for (var k = 0; k < l.length; k++) if (b[i + k] !== l[k]) return false; return true; };
    if (b.length >= 5 && es(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';            // %PDF-
    if (b.length >= 3 && es(0, [0xff, 0xd8, 0xff])) return 'jpg';
    if (b.length >= 8 && es(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
    if (b.length >= 12 && es(0, [0x52, 0x49, 0x46, 0x46]) && es(8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
    return null;
  }
  var TIPO_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  function base64DeBytes(u8) {
    if (typeof Buffer !== 'undefined' && Buffer.from && typeof btoa === 'undefined') return Buffer.from(u8).toString('base64');
    var s = '', paso = 0x8000;
    for (var i = 0; i < u8.length; i += paso) s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8, i, i + paso));
    return btoa(s);
  }
  function bytesDeBase64(t) {
    var s = String(t || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined' && Buffer.from && typeof atob === 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /** 230 KB, 1,5 MB: como se dice en Colombia. */
  function tamanoEnPalabras(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' bytes';
    if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (Math.round(n / 104857.6) / 10).toString().replace('.', ',') + ' MB';
  }
  function nombreDeTipo(t) { return t === 'pdf' ? 'PDF' : 'Pantallazo'; }
  /** «1 PDF y 2 pantallazos». */
  function resumen(lista) {
    var l = lista || [], p = l.filter(function (a) { return a && a.tipo === 'pdf'; }).length, i = l.length - p, partes = [];
    if (p) partes.push(p + ' PDF');
    if (i) partes.push(i + (i === 1 ? ' pantallazo' : ' pantallazos'));
    return partes.join(' y ');
  }

  /**
   * ¿Cabe uno más de ese tipo y ese tamaño en la lista? Los topes de la base.
   * @returns {ok, motivo}
   */
  function revisarNuevo(lista, tipo, bytes, sha) {
    var l = lista || [];
    if (!tipo) return { ok: false, motivo: 'tipo_no_permitido' };
    if (!(bytes > 0)) return { ok: false, motivo: 'vacio' };
    if (bytes > LIMITES.bytes) return { ok: false, motivo: 'muy_grande' };
    if (sha && l.some(function (a) { return a && a.sha256 === sha; })) return { ok: false, motivo: 'repetido' };
    var pdf = l.filter(function (a) { return a && a.tipo === 'pdf'; }).length;
    if (tipo === 'pdf' && pdf >= LIMITES.pdf) return { ok: false, motivo: 'demasiados_pdf' };
    if (tipo !== 'pdf' && l.length - pdf >= LIMITES.imagenes) return { ok: false, motivo: 'demasiados_img' };
    var total = l.reduce(function (t, a) { return t + (Number(a && a.bytes) || 0); }, 0);
    if (total + bytes > LIMITES.totalBytes) return { ok: false, motivo: 'sin_espacio' };
    return { ok: true, motivo: '' };
  }

  function armarAutorizacion(momento) { return { version: VERSION_AUTORIZACION, momento: String(momento || '') }; }

  /* -------------------------------------------- los metadatos de una imagen */
  /* 28-oct-2026 (arreglo de los leves, P3) — TODA IMAGEN SALE SIN SUS
     METADATOS, PESE LO QUE PESE. Solo las de más de 1 MB pasaban por el lienzo
     (que no copia nada de eso): una foto de 1 MB o menos subía tal cual, con
     su EXIF, que trae las coordenadas de donde se tomó —casi siempre la casa—
     y el modelo del teléfono. Visto en Node con un JPEG de 200 KB con
     «GPSLatitude» y «SM-A146M»: los dos llegaban intactos a lo que se guarda.
     La política dice que la ubicación va con su propia autorización (punto
     3); esta habría sido otra, sin ella y sin decirlo.
     Se quitan aquí, byte a byte y sin volver a comprimir (el texto de un
     pantallazo se queda nítido), en el registro y en la cuenta:
       · JPEG: APP1 (EXIF y XMP), APP3 a APP13 y APP15 (IPTC, Photoshop, los
         de cada fabricante), el APP2 que no es el perfil de color (MPF: las
         otras fotos de una «foto en movimiento»), los comentarios, y todo lo
         que venga después del final de la imagen (ahí Samsung y Google pegan
         el video de la foto en movimiento y sus datos). Se quedan APP0
         (JFIF), el perfil de color (ICC) y APP14 (Adobe): sin ellos los
         colores pueden salir cambiados, y no dicen nada de nadie.
       · PNG: solo los bloques que dibujan la imagen y los de color y
         transparencia; fuera eXIf, tEXt, zTXt, iTXt, tIME y cualquier otro.
       · WEBP: fuera los bloques EXIF y «XMP », y sus marcas en VP8X.
     Si la imagen no se deja leer así, null: quien llama la pasa por el
     lienzo, y si tampoco se puede NO se guarda (nunca sale con lo que
     traía). El PDF no se toca: es el documento tal como lo mandó el fondo, y
     sus huellas técnicas son las que dicen si alguien lo volvió a guardar. */
  function empiezaCon(b, desde, t) {
    if (desde < 0 || desde + t.length > b.length) return false;
    for (var i = 0; i < t.length; i++) if (b[desde + i] !== t.charCodeAt(i)) return false;
    return true;
  }
  function unir(partes) {
    var n = 0, k = 0;
    partes.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n);
    partes.forEach(function (p) { out.set(p, k); k += p.length; });
    return out;
  }
  /* Un segmento de un JPEG que se va (m: su marcador; seg: desde su largo). */
  function seVaDelJpeg(m, seg) {
    if (m === 0xfe) return true;                           // COM: un comentario
    if (m < 0xe0 || m > 0xef) return false;               // no es un APPn: es la imagen
    if (m === 0xe0 || m === 0xee) return false;           // JFIF y Adobe
    if (m === 0xe2) return !empiezaCon(seg, 2, 'ICC_PROFILE\u0000');
    return true;
  }
  function limpiarJpeg(b) {
    var n = b.length, partes = [b.subarray(0, 2)], i = 2;
    if (n < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    while (i < n) {
      if (b[i] !== 0xff) return null;
      while (i < n && b[i] === 0xff) i++;                  // bytes de relleno
      if (i >= n) return null;
      var m = b[i++];
      if (m === 0xd9) { partes.push(new Uint8Array([0xff, 0xd9])); return unir(partes); }   // el final: lo de después se va
      if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { partes.push(new Uint8Array([0xff, m])); continue; }
      if (i + 2 > n) return null;
      var fin = i + ((b[i] << 8) | b[i + 1]);
      if (fin < i + 2 || fin > n) return null;
      if (m === 0xda) {
        /* Los datos de la imagen van hasta el siguiente marcador que no sea
           un byte relleno (FF 00) ni un reinicio (FF D0-D7). */
        var j = fin;
        while (j < n) {
          if (b[j] !== 0xff) { j++; continue; }
          var k = j + 1;
          while (k < n && b[k] === 0xff) k++;
          if (k >= n) return null;
          if (b[k] === 0x00 || (b[k] >= 0xd0 && b[k] <= 0xd7)) { j = k + 1; continue; }
          break;
        }
        partes.push(new Uint8Array([0xff, m]), b.subarray(i, j));
        i = j;
        continue;
      }
      var seg = b.subarray(i, fin);
      if (!seVaDelJpeg(m, seg)) partes.push(new Uint8Array([0xff, m]), seg);
      i = fin;
    }
    return null;                                           // sin final: no se deja leer
  }
  var PNG_QUEDAN = ['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'pHYs'];
  function limpiarPng(b) {
    var n = b.length, i = 8, partes = [b.subarray(0, 8)];
    while (i + 12 <= n) {
      var largo = b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
      var tipo = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      var fin = i + 12 + largo;
      if (fin > n) return null;
      if (PNG_QUEDAN.indexOf(tipo) >= 0) partes.push(b.subarray(i, fin));
      i = fin;
      if (tipo === 'IEND') return unir(partes);          // y lo de después se va
    }
    return null;
  }
  function limpiarWebp(b) {
    var u32 = function (p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 0x1000000; };
    if (b.length < 12) return null;
    var fin = Math.min(b.length, 8 + u32(4)), i = 12, trozos = [], total = 4;
    while (i + 8 <= fin) {
      var cc = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]), tam = u32(i + 4);
      var hasta = Math.min(fin, i + 8 + tam + (tam & 1));
      if (i + 8 + tam > fin) return null;
      if (cc !== 'EXIF' && cc !== 'XMP ') { trozos.push({ cc: cc, d: b.subarray(i, hasta) }); total += hasta - i; }
      i = hasta;
    }
    if (!trozos.length) return null;
    var out = new Uint8Array(8 + total), p = 12;
    out.set(b.subarray(0, 4), 0); out.set(b.subarray(8, 12), 8);
    out[4] = total & 0xff; out[5] = (total >>> 8) & 0xff; out[6] = (total >>> 16) & 0xff; out[7] = (total >>> 24) & 0xff;
    trozos.forEach(function (t) {
      out.set(t.d, p);
      if (t.cc === 'VP8X' && t.d.length > 8) out[p + 8] &= ~0x0c;   // sin las marcas de EXIF (0x08) y XMP (0x04)
      p += t.d.length;
    });
    return out;
  }
  /** Los bytes de la imagen sin sus metadatos; null si no se deja leer. */
  function limpiarMetadatos(u8, tipo) {
    try {
      if (tipo === 'jpg') return limpiarJpeg(u8);
      if (tipo === 'png') return limpiarPng(u8);
      if (tipo === 'webp') return limpiarWebp(u8);
    } catch (e) { /* null */ }
    return null;
  }
  /* La orientación que dice el EXIF de un JPEG (1 si no dice). Una foto de
     cámara puede venir de lado con «gírala al mostrarla» en el EXIF: quitarle
     el EXIF la dejaría de lado, así que esa va por el lienzo, que la dibuja
     derecha (y tampoco copia el EXIF). */
  function orientacionJpeg(b) {
    try {
      if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
      var i = 2;
      while (i + 4 <= b.length && b[i] === 0xff) {
        var m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xda || m === 0xd9) break;
        var largo = (b[i + 2] << 8) | b[i + 3];
        if (largo < 2) break;
        if (m === 0xe1 && empiezaCon(b, i + 4, 'Exif\u0000\u0000')) {
          var t = i + 10, le = b[t] === 0x49, tope = i + 2 + largo;
          var u16 = function (p) { return le ? (b[p] | (b[p + 1] << 8)) : ((b[p] << 8) | b[p + 1]); };
          var u32 = function (p) { return le ? (u16(p) + u16(p + 2) * 0x10000) : (u16(p) * 0x10000 + u16(p + 2)); };
          var ifd = t + u32(t + 4), cuantos = u16(ifd);
          for (var k = 0; k < cuantos && ifd + 2 + k * 12 + 12 <= tope; k++) {
            var e = ifd + 2 + k * 12;
            if (u16(e) === 0x0112) { var o = u16(e + 8); return (o >= 1 && o <= 8) ? o : 1; }
          }
          return 1;
        }
        i += 2 + largo;
      }
    } catch (e) { /* 1 */ }
    return 1;
  }

  /* ------------------------------------------ preparar un archivo escogido */
  function leerBytes(blob) {
    if (blob && typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    return new Promise(function (res, rej) {
      try {
        var fr = new FileReader();
        fr.onload = function () { res(new Uint8Array(fr.result)); };
        fr.onerror = function () { rej(new Error('lectura')); };
        fr.readAsArrayBuffer(blob);
      } catch (e) { rej(e); }
    });
  }
  function sha256Hex(u8) {
    try {
      var c = typeof crypto !== 'undefined' ? crypto : null;
      if (!c || !c.subtle || typeof c.subtle.digest !== 'function') return Promise.resolve('');
      return c.subtle.digest('SHA-256', u8).then(function (h) {
        return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      }, function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }
  /* Achicar un pantallazo: el lado largo a LIMITES.ladoImagen, en JPEG sobre
     blanco (un pantallazo no tiene transparencias, y el negro de un PNG
     transparente pasado a JPEG no se leería). Devuelve null si el teléfono no
     puede (sin lienzo, sin memoria): quien llama sube el original si cabe. */
  function achicar(blob) {
    var d = typeof document !== 'undefined' ? document : null;
    if (!d || typeof d.createElement !== 'function') return Promise.resolve(null);
    var cargar = (typeof createImageBitmap === 'function')
      ? createImageBitmap(blob)
      : new Promise(function (res, rej) {
          var U = (typeof URL !== 'undefined') ? URL : null;
          if (!U || !U.createObjectURL || typeof Image === 'undefined') return rej(new Error('sin imagen'));
          var url = U.createObjectURL(blob), img = new Image();
          img.onload = function () { res(img); setTimeout(function () { try { U.revokeObjectURL(url); } catch (e) {} }, 0); };
          img.onerror = function () { try { U.revokeObjectURL(url); } catch (e) {} rej(new Error('imagen')); };
          img.src = url;
        });
    return cargar.then(function (img) {
      var w = img.width, h = img.height;
      if (!(w > 0 && h > 0)) return null;
      var k = Math.min(1, LIMITES.ladoImagen / Math.max(w, h));
      var c = d.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var g = c.getContext && c.getContext('2d');
      if (!g) return null;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      try { if (img.close) img.close(); } catch (e) {}
      return new Promise(function (res) {
        if (c.toBlob) c.toBlob(function (b) { res(b || null); }, 'image/jpeg', LIMITES.calidad);
        else {
          try { res({ base64: c.toDataURL('image/jpeg', LIMITES.calidad).split(',')[1] }); } catch (e) { res(null); }
        }
      });
    }).then(function (r) {
      if (!r) return null;
      if (r.base64) return bytesDeBase64(r.base64);
      return leerBytes(r);
    }, function () { return null; });
  }
  /**
   * Del archivo que escogió (o pegó) a lo que sube: {tipo, bytes, base64,
   * sha256}. El tipo sale de sus primeros bytes, como en la base; lo que diga
   * el teléfono (el nombre, el tipo MIME) no cuenta. Un pantallazo de más de
   * 1 MB se achica; un PDF se sube tal cual. Toda imagen sale sin sus
   * metadatos (limpiarMetadatos), y la que no se deja limpiar no sale.
   * @returns Promise<{ok, archivo, motivo}>
   */
  function prepararArchivo(blob) {
    if (!blob) return Promise.resolve({ ok: false, motivo: 'vacio' });
    /* 28-oct-2026 (arreglo, ronda 1) — el nombre, SOLO para enseñárselo a la
       persona en su lista y al pegar («¿Es este?»): no sube (pension_subir
       recibe el archivo y nada más) ni decide el tipo. */
    var nombre = (blob && typeof blob.name === 'string') ? blob.name.slice(0, 120) : '';
    return leerBytes(blob).then(function (u8) {
      if (!u8 || !u8.length) return { ok: false, motivo: 'vacio' };
      var tipo = tipoPorBytes(u8);
      if (!tipo) return { ok: false, motivo: 'tipo_no_permitido' };
      if (tipo === 'pdf') {
        if (u8.length > LIMITES.bytes) return { ok: false, motivo: 'muy_grande' };
        return listo(tipo, u8);
      }
      /* 28-oct-2026 (arreglo de los leves, P3) — antes, la de 1 MB o menos
         subía tal cual, con su EXIF. Ahora sale limpia (limpiarMetadatos); por
         el lienzo van la pesada, la que viene de lado según su EXIF y la que
         no se deja limpiar byte a byte. Lo que sale del lienzo también se
         limpia: no debería traer nada, y así no depende del navegador. */
      var limpio = limpiarMetadatos(u8, tipo);
      var deLado = tipo === 'jpg' && orientacionJpeg(u8) > 1;
      if (limpio && !deLado && limpio.length <= LIMITES.achicarDesde) return listo(tipo, limpio);
      return achicar(blob).then(function (chico) {
        var t2 = chico && tipoPorBytes(chico);
        var c2 = t2 ? limpiarMetadatos(chico, t2) : null;
        if (c2 && (deLado || !limpio || c2.length < limpio.length) && c2.length <= LIMITES.bytes) return listo(t2, c2);
        if (limpio && limpio.length <= LIMITES.bytes) return listo(tipo, limpio);
        /* Sin lienzo y sin poder limpiarla, no se guarda: nunca con lo que traía. */
        return { ok: false, motivo: limpio ? 'muy_grande' : 'lectura' };
      });
    }, function () { return { ok: false, motivo: 'lectura' }; });
    function listo(tipo, u8) {
      return sha256Hex(u8).then(function (h) {
        return { ok: true, archivo: { tipo: tipo, bytes: u8.length, base64: base64DeBytes(u8), sha256: h, nombre: nombre } };
      });
    }
  }

  /* --------------------------------------------------------- el portapapeles */
  var TIPOS_PEGABLES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  /**
   * Lo copiado, con navigator.clipboard.read. En iPhone muestra su botón
   * «Pegar» y hay que tocarlo; en Android puede pedir permiso la primera vez.
   * @returns Promise<{ok, blobs, motivo}> — motivo: 'pegar_sin_api',
   *          'pegar_negado' o 'pegar_vacio'.
   */
  function leerPortapapeles(nav) {
    var n = nav || (typeof navigator !== 'undefined' ? navigator : null);
    if (!n || !n.clipboard || typeof n.clipboard.read !== 'function') return Promise.resolve({ ok: false, blobs: [], motivo: 'pegar_sin_api' });
    var p;
    try { p = n.clipboard.read(); } catch (e) { return Promise.resolve({ ok: false, blobs: [], motivo: 'pegar_negado' }); }
    return Promise.resolve(p).then(function (items) {
      var pedidos = [];
      (items || []).forEach(function (it) {
        var t = (it && it.types) || [];
        for (var i = 0; i < TIPOS_PEGABLES.length; i++) {
          if (Array.prototype.indexOf.call(t, TIPOS_PEGABLES[i]) >= 0) { pedidos.push(it.getType(TIPOS_PEGABLES[i])); break; }
        }
      });
      if (!pedidos.length) return { ok: false, blobs: [], motivo: 'pegar_vacio' };
      return Promise.all(pedidos).then(function (b) { return { ok: true, blobs: b.filter(Boolean), motivo: '' }; });
    }, function () { return { ok: false, blobs: [], motivo: 'pegar_negado' }; });
  }
  /** Los archivos de un evento «paste» (el recuadro de mantener presionado). */
  function blobsDePegar(ev) {
    var cd = ev && (ev.clipboardData || (typeof window !== 'undefined' && window.clipboardData));
    if (!cd) return { blobs: [], texto: false };
    var out = [];
    var items = cd.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it && it.kind === 'file' && TIPOS_PEGABLES.indexOf(String(it.type || '').toLowerCase()) >= 0) {
        var f = it.getAsFile && it.getAsFile();
        if (f) out.push(f);
      }
    }
    if (!out.length && cd.files && cd.files.length) {
      for (var j = 0; j < cd.files.length; j++) out.push(cd.files[j]);
    }
    var texto = false;
    try { texto = !out.length && !!(cd.getData && cd.getData('text')); } catch (e) {}
    return { blobs: out, texto: texto };
  }

  /* ------------------------------------------------ el guardadero del registro */
  /**
   * Lo del paso, en el teléfono, mientras no hay cuenta. `o`: {ls, idb, ahora}.
   * Ver la cabecera: lo escogido como el borrador; los archivos en IndexedDB,
   * atados al intento y al celular, caducan al día; la cola, por celular.
   */
  function guardadero(o) {
    o = o || {};
    var ls = o.ls || null, idb = o.idb || null;
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var MEM = {}, ESTADO_MEM = null, persistido = true, dbP = null;
    /* La GENERACIÓN: «Empezar de cero» la sube, y un archivo que se estaba
       guardando cuando la persona tocó «No soy yo» ya no se escribe (era de
       la anterior). */
    var GEN = 0;

    function abrir() {
      if (dbP) return dbP;
      dbP = new Promise(function (res) {
        if (!idb || typeof idb.open !== 'function') { persistido = false; return res(null); }
        /* 28-oct-2026 (arreglo de los leves) — el reloj de los 3 s se suelta
           al contestar: colgado, dejaba viva la página de pruebas tres
           segundos más, y no tiene nada que esperar. */
        var reloj = null, listo = false, fin = function (d) {
          if (listo) return; listo = true; if (!d) persistido = false;
          try { if (reloj) clearTimeout(reloj); } catch (e) {}
          res(d);
        };
        /* Safari a veces no contesta nunca el open: a los 3 s, la memoria. */
        try { reloj = setTimeout(function () { fin(null); }, 3000); } catch (e) {}
        try {
          var req = idb.open(BASE_DE_DATOS, 1);
          req.onupgradeneeded = function () { try { req.result.createObjectStore('lotes'); } catch (e) {} };
          req.onsuccess = function () { fin(req.result); };
          req.onerror = function () { fin(null); };
          req.onblocked = function () { fin(null); };
        } catch (e) { fin(null); }
      });
      return dbP;
    }
    function leer(llave) {
      return abrir().then(function (d) {
        if (!d) return MEM[llave] || null;
        return new Promise(function (res) {
          try {
            var r = d.transaction('lotes', 'readonly').objectStore('lotes').get(llave);
            r.onsuccess = function () { res(r.result || MEM[llave] || null); };
            r.onerror = function () { res(MEM[llave] || null); };
          } catch (e) { res(MEM[llave] || null); }
        });
      });
    }
    function escribir(llave, valor) {
      return abrir().then(function (d) {
        if (!d) { if (valor) MEM[llave] = valor; else delete MEM[llave]; return false; }
        return new Promise(function (res) {
          try {
            var tx = d.transaction('lotes', 'readwrite'), st = tx.objectStore('lotes');
            if (valor) st.put(valor, llave); else st['delete'](llave);
            tx.oncomplete = function () { delete MEM[llave]; res(true); };
            tx.onerror = tx.onabort = function () { persistido = false; if (valor) MEM[llave] = valor; else delete MEM[llave]; res(false); };
          } catch (e) { persistido = false; if (valor) MEM[llave] = valor; else delete MEM[llave]; res(false); }
        });
      });
    }
    function nuevo(intento, celular) {
      return { intento: String(intento || ''), celular: String(celular || ''), aut: null, fondos: [], pidio: {}, despues: false,
               archivos_n: 0, t: ahora() };
    }
    function leerEstadoCrudo() {
      var e = null;
      try { e = JSON.parse((ls && ls.getItem(LLAVE_ESTADO)) || 'null'); } catch (x) { e = null; }
      return (e && typeof e === 'object') ? e : ESTADO_MEM;
    }
    /* La cuenta de archivos, solo en lo escogido de ESTE registro: nunca crea
       uno nuevo (eso lo hace la pantalla, con la autorización). */
    function contar(intento, celular, n) {
      var e = leerEstadoCrudo();
      if (!vale(e, intento, celular, DIAS_ESTADO * 24)) return;
      e.archivos_n = n; g.guardarEstado(e);
    }
    function vale(x, intento, celular, horas) {
      return !!(x && intento && celular && x.intento === String(intento) && x.celular === String(celular) &&
                ahora() - Number(x.t) >= 0 && ahora() - Number(x.t) < horas * 3600e3);
    }
    var g = {
      /** Lo escogido en ESTE registro (intento y celular); si no, uno nuevo. */
      estado: function (intento, celular) {
        var e = leerEstadoCrudo();
        if (vale(e, intento, celular, DIAS_ESTADO * 24)) {
          e.fondos = Array.isArray(e.fondos) ? e.fondos : [];
          e.pidio = (e.pidio && typeof e.pidio === 'object') ? e.pidio : {};
          return e;
        }
        return nuevo(intento, celular);
      },
      guardarEstado: function (e) {
        if (!e) return;
        e.t = ahora();
        ESTADO_MEM = e;
        try { if (ls) ls.setItem(LLAVE_ESTADO, JSON.stringify(e)); } catch (x) { /* queda en ESTADO_MEM */ }
      },
      /* Cuántos archivos espera ESTE registro, sin esperar a IndexedDB: el
         arranque de play/ decide con esto, ANTES de pintar nada, si los suelta
         (la regla de las fotos: solo sobreviven a la vuelta de la cámara). */
      hayArchivosGuardados: function (intento, celular) {
        var e = leerEstadoCrudo();
        return !!(vale(e, intento, celular, HORAS_ARCHIVOS) && Number(e.archivos_n) > 0);
      },
      /** Los archivos de este registro. `perdidos`: los había y caducaron. */
      archivos: function (intento, celular) {
        return leer('reg').then(function (r) {
          if (!r) return { lista: [], perdidos: false };
          if (vale(r, intento, celular, HORAS_ARCHIVOS)) return { lista: Array.isArray(r.archivos) ? r.archivos : [], perdidos: false };
          var eranDeEste = !!(r.intento === String(intento) && r.celular === String(celular));
          return escribir('reg', null).then(function () { return { lista: [], perdidos: eranDeEste && !!(r.archivos && r.archivos.length) }; });
        });
      },
      agregar: function (intento, celular, a) {
        var gen = GEN;
        return g.archivos(intento, celular).then(function (r) {
          if (gen !== GEN) return { ok: false, motivo: 'repetido' };
          var rv = revisarNuevo(r.lista, a && a.tipo, a && a.bytes, a && a.sha256);
          if (!rv.ok) return rv;
          if (r.lista.some(function (x) { return x.base64 === a.base64; })) return { ok: false, motivo: 'repetido' };
          var item = { id: ahora().toString(36) + Math.random().toString(36).slice(2, 8), tipo: a.tipo, bytes: a.bytes,
                       base64: a.base64, sha256: a.sha256 || '', nombre: String(a.nombre || '').slice(0, 120), t: ahora() };
          var lista = r.lista.concat([item]);
          contar(intento, celular, lista.length);
          return escribir('reg', { intento: String(intento), celular: String(celular), t: ahora(), archivos: lista })
            .then(function () { return { ok: true, motivo: '', id: item.id }; });
        });
      },
      quitar: function (intento, celular, id) {
        var gen = GEN;
        return g.archivos(intento, celular).then(function (r) {
          if (gen !== GEN) return null;
          var lista = r.lista.filter(function (x) { return x.id !== id; });
          contar(intento, celular, lista.length);
          return escribir('reg', lista.length ? { intento: String(intento), celular: String(celular), t: ahora(), archivos: lista } : null);
        });
      },
      /** Al salir del registro (como las fotos): los archivos se van, lo escogido se queda. */
      soltarArchivos: function () {
        var e = leerEstadoCrudo();
        if (e && Number(e.archivos_n) > 0) { e.archivos_n = 0; g.guardarEstado(e); }
        return escribir('reg', null);
      },
      /** «Empezar de cero», otro celular: todo. */
      olvidar: function () {
        GEN++;
        ESTADO_MEM = null;
        try { if (ls) ls.removeItem(LLAVE_ESTADO); } catch (x) {}
        return g.soltarArchivos();
      },
      /**
       * «Abrir mi cuenta» salió bien: lo de ESTE registro pasa a la cola de
       * esa cuenta. Sin la autorización no se encola nada (y se suelta). Lo
       * escogido se lee YA, antes de cualquier espera: el registro en memoria
       * se cierra en la línea siguiente de quien llama.
       */
      encolar: function (intento, celular) {
        var e = g.estado(intento, celular);
        var aut = e.aut, fondos = (e.fondos || []).slice();
        return g.archivos(intento, celular).then(function (r) {
          if (!aut || !aut.version) return g.olvidar().then(function () { return false; });
          var cola = { celular: String(celular), t: ahora(), aut: aut, fondos: fondos, autorizada: false,
                       archivos: r.lista.map(function (a) { return { id: a.id, tipo: a.tipo, bytes: a.bytes, base64: a.base64, sha256: a.sha256 }; }) };
          return escribir('cola:' + celular, cola).then(function () { return g.olvidar(); }).then(function () { return true; });
        });
      },
      cola: function (cel) {
        if (!cel) return Promise.resolve(null);
        return leer('cola:' + cel).then(function (c) {
          if (!c) return null;
          if (c.celular === String(cel) && ahora() - Number(c.t) >= 0 && ahora() - Number(c.t) < HORAS_ARCHIVOS * 3600e3) return c;
          return escribir('cola:' + cel, null).then(function () { return null; });
        });
      },
      guardarCola: function (cel, c) { return escribir('cola:' + cel, c || null); },
      /**
       * 28-oct-2026 (arreglo de los leves, P7) — EL BARRIDO DE LO VENCIDO.
       * «Caducan al día» era perezoso: la cola de una cuenta ('cola:<celular>')
       * y los archivos de un registro ('reg') solo se miraban —y se borraban
       * si habían vencido— cuando ESA cuenta volvía a entrar en ESE teléfono,
       * o ese registro volvía a su paso. Si María no volvía al teléfono de
       * Beto, su historia laboral (empleadores, salarios, cédula) se quedaba
       * ahí para siempre, legible por cualquier página del mismo sitio. Lo
       * llaman play/ y app/socio.html al arrancar: borra TODA cola y todo
       * registro de más de HORAS_ARCHIVOS, sea de quien sea (es lo mismo que
       * hace sanearColas con las fotos), y lo escogido de más de DIAS_ESTADO.
       * `perdidos`: si lo vencido eran archivos de ESTE registro (intento y
       * celular), para que su paso lo diga como antes.
       * @returns Promise<{borrados, perdidos}>
       */
      barrer: function (intento, celular) {
        var e = leerEstadoCrudo();
        if (e && !(ahora() - Number(e.t) >= 0 && ahora() - Number(e.t) < DIAS_ESTADO * 24 * 3600e3)) {
          ESTADO_MEM = null;
          try { if (ls) ls.removeItem(LLAVE_ESTADO); } catch (x) {}
        }
        var res = { borrados: 0, perdidos: false };
        var vencido = function (k, v) {
          if (k !== 'reg' && String(k).indexOf('cola:') !== 0) return false;
          var ok = v && typeof v === 'object' && ahora() - Number(v.t) >= 0 && ahora() - Number(v.t) < HORAS_ARCHIVOS * 3600e3 &&
            (k === 'reg' || String(v.celular) === String(k).slice(5));
          if (ok) return false;
          if (k === 'reg' && v && intento && celular && v.intento === String(intento) && v.celular === String(celular) &&
              v.archivos && v.archivos.length) res.perdidos = true;
          res.borrados++;
          return true;
        };
        return abrir().then(function (d) {
          if (!d) { Object.keys(MEM).forEach(function (k) { if (vencido(k, MEM[k])) delete MEM[k]; }); return res; }
          return new Promise(function (fin) {
            try {
              var tx = d.transaction('lotes', 'readwrite'), cur = tx.objectStore('lotes').openCursor();
              cur.onsuccess = function () {
                var c = cur.result;
                if (!c) return;
                if (vencido(c.key, c.value)) c['delete']();
                c['continue']();
              };
              tx.oncomplete = function () { fin(res); };
              tx.onerror = tx.onabort = function () { fin(res); };
            } catch (x) { fin(res); }
          });
        });
      },
      /** ¿Lo escogido vive solo en la memoria de la página? */
      soloEnMemoria: function () { return abrir().then(function () { return !persistido; }); }
    };
    return g;
  }

  /* -------------------------------------------- la subida de la cola, con sesión */
  var RECHAZOS_FINALES = ['muy_grande', 'tipo_no_permitido', 'no_es_archivo', 'vacio', 'demasiados', 'sin_espacio'];
  /**
   * Sube la cola de UNA cuenta con su sesión. `llamar(fn, cuerpo)` es la
   * llamada de la página con el token de esa sesión (rechaza con {status} si
   * la base dice que no). Primero la autorización, después cada archivo, de
   * uno en uno: si la señal se cae a mitad, lo que ya subió no se repite (la
   * base tampoco duplica: mismo sha256).
   * @returns Promise<{estado, subidos, rechazados, total, pendientes}> —
   *   estado: 'nada' | 'ok' | 'apagado' | 'sesion' | 'freno' | 'lleno' | 'retirada' | 'sin_red'.
   * 28-oct-2026 (arreglo, ronda 2) — 'lleno' es el cortacircuito de la base
   * (el espacio de las historias laborales se llenó). NO es un rechazo final:
   * el archivo no tiene nada malo y la base puede volver a tener espacio, así
   * que se queda en la cola como con el freno. Antes caía en 'sin_red' y la
   * pantalla culpaba a la señal.
   * 28-oct-2026 (arreglo de los leves, P7) — 'retirada': la base dice que ya
   * no hay autorización vigente (la retiró desde otro teléfono, o pidió por
   * el chat que la borraran). ESE sí es final, y para toda la cola: se borra
   * del teléfono. Antes caía en 'sin_red' y, cada vez que entraba, la
   * pantalla le decía «no alcanzó a subir… Lo volvemos a intentar» con la
   * historia laboral de alguien que ya dijo que no.
   */
  function subirCola(g, cel, llamar) {
    return g.cola(cel).then(function (c) {
      if (!c) return { estado: 'nada', subidos: 0, rechazados: [], total: 0, pendientes: 0 };
      var res = { estado: 'ok', subidos: 0, rechazados: [], total: c.archivos.length, pendientes: 0 };
      var autorizar = c.autorizada ? Promise.resolve() :
        Promise.resolve(llamar('pension_autorizar', { p_fondos: c.fondos || [], p_version: c.aut.version, p_momento: c.aut.momento || null }))
          .then(function (j) {
            if (j && j.ok === false && j.motivo === 'fondos' && (c.fondos || []).length) {
              c.fondos = [];
              return llamar('pension_autorizar', { p_fondos: [], p_version: c.aut.version, p_momento: c.aut.momento || null });
            }
            return j;
          })
          .then(function (j) {
            if (j && j.ok === true) { c.autorizada = true; return g.guardarCola(cel, c); }
            throw { motivo: (j && j.motivo) || 'rechazo' };
          });
      return autorizar.then(function () {
        return c.archivos.slice().reduce(function (p, a) {
          return p.then(function () {
            return Promise.resolve(llamar('pension_subir', { p_archivo: a.base64 })).then(function (j) {
              var fuera = function () { c.archivos = c.archivos.filter(function (x) { return x.id !== a.id; }); return g.guardarCola(cel, c); };
              if (j && j.ok === true) { res.subidos++; return fuera(); }
              if (j && RECHAZOS_FINALES.indexOf(j.motivo) >= 0) { res.rechazados.push({ tipo: a.tipo, motivo: j.motivo }); return fuera(); }
              throw { motivo: (j && j.motivo) || 'rechazo' };
            });
          });
        }, Promise.resolve());
      }).then(function () {
        /* 28-oct-2026 (arreglo de los leves, P2) — y con qué fondos quedó (la
           base pudo no aceptarlos): el aviso dice lo que pasó con ellos. */
        res.fondos = (c.fondos || []).slice();
        return g.guardarCola(cel, null).then(function () { return res; });
      }, function (e) {
        var st = e && e.status, m = e && e.motivo;
        if (m === 'sin_autorizacion') {
          res.estado = 'retirada'; res.pendientes = 0;
          return g.guardarCola(cel, null).then(function () { return res; });
        }
        res.estado = st === 404 ? 'apagado'
          : (st === 401 || st === 403 || m === 'sin_sesion' || (e && e.sinSesion)) ? 'sesion'
          : m === 'freno' ? 'freno' : m === 'lleno' ? 'lleno' : 'sin_red';
        res.pendientes = c.archivos.length;
        return res;
      });
    });
  }
  /** Lo que la pantalla dice después de subir la cola (o '' si no hay nada que decir). */
  function avisoDeLaCola(r) {
    if (!r || r.estado === 'nada') return { clase: '', html: '' };
    var quedan = 'Lo volvemos a intentar cuando entres a tu cuenta en este teléfono, hasta mañana. Si no, súbela desde tu cuenta en la app.';
    if (r.estado === 'ok') {
      var malos = r.rechazados.length
        ? ' No entró ' + (r.rechazados.length === 1 ? 'un archivo' : r.rechazados.length + ' archivos') + ': ' +
          esc(motivoEnPalabras(r.rechazados[0].motivo === 'demasiados' ? 'demasiados' : r.rechazados[0].motivo)) : '';
      if (r.subidos) return { clase: 'verde', html: '<b>Tu historia laboral llegó</b> (' + esc(resumenDe(r.subidos, r)) + ').' + malos };
      if (r.rechazados.length) return { clase: 'ambar', html: '<b>Tu historia laboral no entró.</b>' + malos };
      return { clase: 'verde', html: guardamosSinArchivos(r.fondos) };
    }
    /* 28-oct-2026 (arreglo de los leves, P13) — sin «súbela desde tu cuenta»:
       con la base así, la tarjeta de la cuenta tampoco aparece. Y lo que de
       verdad pasa con lo que espera: se reintenta hasta mañana y se borra. */
    if (r.estado === 'apagado') return { clase: 'ambar', html: '<b>Tu historia laboral se quedó en este teléfono:</b> esta parte todavía no está encendida en nuestro sistema. ' +
      'Lo volvemos a intentar cuando entres a tu cuenta en este teléfono, hasta mañana; después se borra de este teléfono.' };
    if (r.estado === 'freno') return { clase: 'ambar', html: '<b>Tu historia laboral no alcanzó a subir</b> por demasiados intentos seguidos. ' + quedan };
    if (r.estado === 'lleno') return { clase: 'ambar', html: '<b>Tu historia laboral se quedó en este teléfono:</b> ahora mismo no podemos recibir más historias laborales. Es opcional: tu cuenta sigue igual. ' + quedan };
    /* 28-oct-2026 (arreglo de los leves, P7) — sin «Lo volvemos a intentar»: no se va a intentar. */
    if (r.estado === 'retirada') return { clase: 'ambar', html: '<b>No subimos tu historia laboral:</b> tu autorización ya no está vigente. La borramos de este teléfono.' };
    return { clase: 'ambar', html: '<b>Tu historia laboral no alcanzó a subir.</b> ' + quedan };
  }
  function resumenDe(n, r) { return n === r.total ? (n === 1 ? '1 archivo' : n + ' archivos') : n + ' de ' + r.total + ' archivos'; }
  /* 28-oct-2026 (arreglo de los leves, P2) — LO QUE SE GUARDÓ SIN ARCHIVOS,
     DICHO COMO FUE. Decía «Guardamos tu autorización y tu fondo» aunque no
     hubiera escogido fondo, y también a quien dijo «Nunca he cotizado», con
     «súbela desde tu cuenta» de remate: a quien nunca cotizó no hay historia
     laboral que pedirle. */
  function guardamosSinArchivos(fondos) {
    var f = fondos || [], FP = F();
    var despues = ' Cuando tengas tu historia laboral, súbela desde tu cuenta en la app.';
    if (f[0] === 'nunca') return '<b>Guardamos tu autorización y que nunca has cotizado.</b> No tienes que subirnos nada.';
    if (f[0] === 'no_se') return '<b>Guardamos tu autorización.</b> Cuando sepas en qué fondo estás y tengas tu historia laboral, súbela desde tu cuenta en la app.';
    if (!f.length || !FP) return '<b>Guardamos tu autorización.</b>' + despues;
    return '<b>Guardamos tu autorización y ' + (f.length > 1 ? 'tus fondos' : 'tu fondo') + ' (' + esc(FP.nombres(f)) + ').</b>' + despues;
  }

  /* ------------------------------------------------- la llamada con un token */
  /** Para la app (socio.html): {url, anon, token}. Rechaza con {status}. */
  function llamarConToken(cfg, fn, cuerpo, fetchFn) {
    var c = cfg || {}, pedir = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!c.url || !c.anon || !c.token || !pedir) return Promise.reject({ status: 0, sinSesion: !c.token });
    return pedir(String(c.url).replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.anon, Authorization: 'Bearer ' + c.token },
      body: JSON.stringify(cuerpo || {})
    }).then(function (r) {
      if (!r.ok) return Promise.reject({ status: r.status });
      return r.text().then(function (t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } });
    }, function () { return Promise.reject({ status: 0 }); });
  }

  /* ------------------------------------------------------------- la pantalla */
  var ESTILO = '.hl-fondos{display:flex;flex-wrap:wrap;gap:8px;margin-top:var(--e2)}' +
    '.hl-fondo{display:flex;align-items:center;gap:8px;margin:0;padding:10px 12px;border:1px solid var(--linea);border-radius:12px;' +
      'font-size:14px;font-weight:600;cursor:pointer;background:var(--papel)}' +
    '.hl-fondo:has(input:checked){border-color:var(--azul-texto);background:var(--azul-tinte)}' +
    '.hl-fondo input{width:20px;height:20px;margin:0;flex:none;accent-color:var(--rojo)}' +
    '.hl-como{margin-top:var(--e3);padding:var(--e3);border:1px solid var(--linea);border-radius:14px}' +
    '.hl-como ol{margin:var(--e2) 0 0;padding-left:20px;font-size:14px;line-height:1.5}' +
    '.hl-como .btn{margin-top:var(--e3);text-align:center;text-decoration:none}' +
    '.hl-formas{display:grid;gap:8px;margin-top:var(--e3)}' +
    '.hl-forma{position:relative;margin:0;text-align:center;cursor:pointer}' +
    '.hl-archivo{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden}' +
    '.hl-pegar{margin-top:var(--e3);min-height:84px;padding:14px;border:2px dashed var(--linea);border-radius:14px;' +
      'color:var(--gris);font-size:14px;text-align:center;-webkit-user-select:text;user-select:text;outline:none}' +
    '.hl-pegar:focus{border-color:var(--azul-texto)}' +
    '.hl-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--linea);font-size:14px}' +
    '.hl-item .btn{width:auto;flex:none;padding:8px 12px}' +
    '.hl-despues{margin-top:var(--e3)}' +
    /* 28-oct-2026 (arreglo, ronda 1) — lo pegado antes de guardarlo, y las
       miniaturas de la lista. */
    '.hl-que{display:flex;align-items:center;gap:10px;min-width:0}' +
    '.hl-que span{overflow-wrap:anywhere}' +
    '.hl-mini{width:44px;height:44px;flex:none;object-fit:cover;border:1px solid var(--linea);border-radius:8px;background:var(--papel)}' +
    '.hl-pegado{margin-top:var(--e3);padding:var(--e3);border:2px solid var(--azul-texto);border-radius:14px;background:var(--azul-tinte)}' +
    '.hl-vista{display:block;max-width:100%;max-height:320px;margin:var(--e2) auto 0;object-fit:contain;border:1px solid var(--linea);' +
      'border-radius:10px;background:var(--papel)}' +
    '.hl-pdf{margin-top:var(--e2);font-size:14px;font-weight:600;overflow-wrap:anywhere}';
  function ponerEstilo(d) {
    try {
      if (!d || !d.getElementById || d.getElementById('hlEstilo')) return;
      var s = d.createElement('style'); s.id = 'hlEstilo'; s.textContent = ESTILO;
      (d.head || d.documentElement).appendChild(s);
    } catch (e) {}
  }

  function horaCorta(iso, hoy) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var h = t.getHours(), m = t.getMinutes(), pm = h >= 12, h12 = h % 12 || 12;
    var hora = h12 + ':' + (m < 10 ? '0' : '') + m + (pm ? ' p. m.' : ' a. m.');
    var d = new Date(hoy || Date.now());
    var mismo = t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate();
    var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return (mismo ? 'hoy' : 'el ' + t.getDate() + '-' + meses[t.getMonth()]) + ' a las ' + hora;
  }
  function fechaCorta(iso) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return t.getDate() + '-' + meses[t.getMonth()];
  }

  /** La casilla de la autorización, SIN marcar salvo que ya la haya dado. */
  function autorizacionHTML(marcada) {
    return '<label class="permiso"><input type="checkbox" id="hlAut" data-hl="aut"' + (marcada ? ' checked' : '') + '><span>' +
      '<b>' + esc(TEXTOS.autorizacion) + '</b>' +
      '<span class="muted">' + esc(TEXTOS.autorizacionDetalle) + ' Versión del 30 de octubre de 2026 · ' +
      '<a href="../legal/privacidad.html#pension" target="_blank" rel="noopener">qué dice la política</a>.</span></span></label>';
  }
  function fondosHTML(fondos) {
    var FP = F(); if (!FP) return '';
    var marcados = fondos || [];
    var caja = function (f) {
      return '<label class="hl-fondo"><input type="checkbox" data-hl="fondo" value="' + esc(f.codigo) + '"' +
        (marcados.indexOf(f.codigo) >= 0 ? ' checked' : '') + '>' + esc(f.nombre) + '</label>';
    };
    return '<div class="grupo-tit">' + esc(TEXTOS.preguntaFondo) + '</div>' +
      '<div class="ayuda">' + esc(TEXTOS.ayudaFondo) + '</div>' +
      '<div class="hl-fondos">' + FP.FONDOS.map(caja).join('') + FP.OTRAS.map(caja).join('') + '</div>';
  }
  /* Por cada fondo marcado: sus pasos y el botón a su página OFICIAL. Es un
     <a target="_blank">: la página del fondo se abre en el navegador, nunca
     dentro de la app, y la dirección sale solo de la lista. */
  function comoHTML(fondos, pidio, ahoraMs, modo) {
    var FP = F(); if (!FP) return '';
    return antesDeIrteHTML(fondos, modo) + (fondos || []).map(function (c) {
      var f = FP.porCodigo(c); if (!f) return '';
      if (!f.regimen) {
        /* 28-oct-2026 (arreglo de los leves, P2) — en la cuenta, su texto de
           cuenta: «sigue con tu registro» no tiene sentido para quien ya lo
           terminó. */
        var texto = (modo !== 'registro' && f.textoCuenta) || f.texto;
        return '<div class="hl-como" data-hl-como="' + esc(c) + '"><div class="sub" style="margin:0">' + esc(texto) + '</div>' +
          (f.url ? '<a class="btn sec sm" href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">Abrir el RUAF ↗</a>' +
                   '<div class="ayuda">' + esc(f.dominio) + ', del Ministerio de Salud. Es para que lo mires tú.</div>' : '') + '</div>';
      }
      var url = FP.urlOficial(c);
      var abrio = pidio && pidio[c] ? '<div class="ayuda" data-hl-pidio="' + esc(c) + '">Abriste la página de ' + esc(f.nombre) + ' ' +
        esc(horaCorta(pidio[c], ahoraMs)) + '.</div>' : '<div class="ayuda" data-hl-pidio="' + esc(c) + '"></div>';
      return '<div class="hl-como" data-hl-como="' + esc(c) + '"><b>' + esc(f.nombre) + '</b>' +
        '<ol><li>Toca «Abrir la página de ' + esc(f.nombre) + '».</li>' + f.pasos.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>' +
        (f.nota ? '<div class="ayuda">' + esc(f.nota) + '</div>' : '') +
        (url ? '<a class="btn sec sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-hl="abrir" data-fondo="' + esc(c) + '">' +
                 'Abrir la página de ' + esc(f.nombre) + ' ↗</a>' +
               '<div class="ayuda">' + esc(f.dominio) + '. ' + esc(TEXTOS.afuera) + '</div>' : '') +
        abrio + '</div>';
    }).join('');
  }
  /* 28-oct-2026 (arreglo, ronda 1) — EL AVISO VA ANTES DE IRSE. Decía «Cuando
     te llegue el correo, vuelve a esta pestaña…» DEBAJO de los botones, y sin
     decir que pasados unos minutos fuera la página se lleva la cédula y la
     selfie (ver «EL PASO MANDA A LA PERSONA AFUERA» arriba). Ahora va encima
     del primer botón que saca de la página —el de un fondo o el del RUAF—,
     con los minutos de la regla. Solo en el registro: en la app ya hay
     cuenta, y nada se borra por salir. */
  function antesDeIrteHTML(fondos, modo) {
    var FP = F();
    if (!FP || modo !== 'registro') return '';
    var l = fondos || [];
    var sale = l.some(function (c) { var f = FP.porCodigo(c); return !!(f && (f.regimen ? FP.urlOficial(c) : f.url)); });
    if (!sale) return '';
    var deUnFondo = l.some(function (c) { return FP.esFondo(c) && !!FP.urlOficial(c); });
    return '<div class="aviso ambar" id="hlAntesDeIrte" role="note"><b>' + esc(conMinutos(TEXTOS.antesDeIrte)) + '</b> ' +
      esc(TEXTOS.antesDeIrteDetalle) + (deUnFondo ? ' ' + esc(TEXTOS.volver) : '') + '</div>';
  }
  function formasHTML(vm) {
    return '<div class="grupo-tit">' + esc(TEXTOS.subela) + '</div>' +
      '<div class="ayuda">' + esc(TEXTOS.ayudaFormas) + '</div>' +
      '<div class="ayuda" id="hlDelCorreo">' + esc(TEXTOS.delCorreo) + '</div>' +
      '<div class="hl-formas">' +
        '<label class="btn sec sm hl-forma" id="hlBotonPdf">📄 Subir el PDF' +
          '<input type="file" class="hl-archivo" accept="application/pdf,.pdf" data-hl="archivo"' + (vm.ocupado ? ' disabled' : '') + '></label>' +
        '<label class="btn sec sm hl-forma" id="hlBotonImg">🖼️ Subir pantallazos' +
          '<input type="file" class="hl-archivo" accept="image/png,image/jpeg,image/webp" multiple data-hl="archivo"' + (vm.ocupado ? ' disabled' : '') + '></label>' +
        '<button type="button" class="btn sec sm" id="hlBotonPegar" data-hl="pegar"' + (vm.ocupado ? ' disabled' : '') + '>📋 Pegar</button>' +
      '</div>' +
      '<div class="hl-pegar' + (vm.pegando ? '' : ' oculto') + '" id="hlPegar" contenteditable="true" data-hl="zona" role="textbox" ' +
        'aria-label="' + esc(TEXTOS.zonaPegar) + '" inputmode="none">' + esc(TEXTOS.zonaPegar) + '</div>' +
      pegadoHTML(vm);
  }
  /* 28-oct-2026 (arreglo, ronda 1) — LO PEGADO, ANTES DE GUARDARLO: la imagen
     (o el nombre y el tamaño del PDF) y «¿Es tu historia laboral?». La imagen
     NO va en el texto del atributo: el <img> lleva solo su clave, y ponerVistas
     le asigna el src como propiedad después de pintar (la lección de
     fotoSegura en el CRM), con el tipo que dijeron sus bytes. */
  function pegadoHTML(vm) {
    var p = vm.pegado;
    if (!p || !p.listos || !p.listos.length) return '';
    var cuenta = vm.modo !== 'registro', dis = vm.ocupado ? ' disabled' : '';
    return '<div class="hl-pegado" id="hlPegado" role="group" aria-label="Lo que copiaste"><b>' + esc(TEXTOS.pegadoPregunta) + '</b>' +
      '<div class="ayuda">' + esc(cuenta ? TEXTOS.pegadoAyudaCuenta : TEXTOS.pegadoAyuda) + '</div>' +
      p.listos.map(function (a, i) {
        return a.tipo === 'pdf'
          ? '<div class="hl-pdf">📄 ' + esc(nombreDeTipo('pdf')) + (a.nombre ? ' · ' + esc(a.nombre) : '') + ' · ' + esc(tamanoEnPalabras(a.bytes)) + '</div>'
          : '<img class="hl-vista" data-hl-mini="pegado:' + i + '" alt="Lo que copiaste">';
      }).join('') +
      '<div class="hl-formas">' +
        '<button type="button" class="btn sm" id="hlPegadoSi" data-hl="pegado-si"' + dis + '>' + (cuenta ? 'Sí, subirla' : 'Sí, guardarla') + '</button>' +
        '<button type="button" class="btn sec sm" id="hlPegadoNo" data-hl="pegado-no"' + dis + '>No, no es esta</button>' +
      '</div></div>';
  }
  /* Lo que se puede enseñar de un archivo de la lista: en el registro, todo
     (está en el teléfono); en la app, lo que se subió en esta visita
     (vm.vistas): la base no devuelve el contenido (pension_mia). */
  function vistaDe(vm, a) {
    var x = (a && a.base64) ? a : (vm.vistas && a && vm.vistas[String(a.id)]) || null;
    return { imagen: !!(x && x.base64 && x.tipo !== 'pdf' && TIPO_MIME[x.tipo]), nombre: (x && x.nombre) || '', x: x };
  }
  function listaHTML(vm) {
    var l = vm.archivos || [];
    if (!l.length) return '';
    return '<div class="hl-lista" id="hlLista" style="margin-top:var(--e3)">' + l.map(function (a) {
      var cuando = a.creado_en ? ' · subido el ' + fechaCorta(a.creado_en) : '';
      var v = vistaDe(vm, a);
      return '<div class="hl-item"><span class="hl-que">' +
        (v.imagen ? '<img class="hl-mini" data-hl-mini="lista:' + esc(a.id) + '" alt="">' : '') +
        '<span>' + (a.tipo === 'pdf' ? '📄 ' : '🖼️ ') + esc(nombreDeTipo(a.tipo)) + (v.nombre ? ' · ' + esc(v.nombre) : '') + ' · ' +
        esc(tamanoEnPalabras(a.bytes)) + esc(cuando) + '</span></span>' +
        '<button type="button" class="btn sec sm" data-hl="quitar" data-id="' + esc(a.id) + '"' + (vm.ocupado ? ' disabled' : '') + '>Quitar</button></div>';
    }).join('') + '</div>' +
    (vm.modo === 'registro' ? '<div class="ayuda">' + esc(vm.soloMemoria ? TEXTOS.soloMemoria : conMinutos(TEXTOS.quedanAqui)) + '</div>' : '');
  }
  /* La dirección de la imagen de una clave de ponerVistas: data: con el tipo
     MIME que dicen sus primeros bytes (jpg, png o webp), nunca otro. */
  function urlDeVista(vm, clave) {
    var k = String(clave || ''), i = k.indexOf(':'), que = k.slice(0, i), id = k.slice(i + 1), x = null;
    if (que === 'pegado') x = vm.pegado && vm.pegado.listos && vm.pegado.listos[Number(id)];
    else if (que === 'lista') {
      var a = (vm.archivos || []).filter(function (y) { return y && String(y.id) === id; })[0];
      x = a ? vistaDe(vm, a).x : null;
    }
    if (!x || !x.base64) return '';
    var t = tipoPorBytes(bytesDeBase64(String(x.base64).slice(0, 24)));
    if (!t || t === 'pdf' || t !== x.tipo) return '';
    return 'data:' + TIPO_MIME[t] + ';base64,' + x.base64;
  }
  function avisoHTML(vm) {
    return '<div class="aviso' + (vm.avisoClase ? ' ' + vm.avisoClase : '') + (vm.aviso ? '' : ' oculto') + '" id="hlAviso" role="status">' +
      esc(vm.aviso || '') + '</div>';
  }

  /** Lo de adentro del paso (o de la tarjeta), según el estado. */
  function pantallaHTML(vm) {
    var conAut = !!vm.aut;
    var r = (vm.modo === 'registro'
        ? '<p class="sub">' + esc(TEXTOS.intro) + '</p>' +
          '<button type="button" class="btn sec sm hl-despues" id="hlDespues" data-hl="despues">Lo hago después</button>'
        : '<p class="sub">' + esc(TEXTOS.introCuenta) + '</p>') +
      (vm.perdidos ? '<div class="aviso ambar" role="status">' + esc(TEXTOS.perdidos) + '</div>' : '') +
      autorizacionHTML(conAut);
    if (!conAut) return r + avisoHTML(vm);
    return r + fondosHTML(vm.fondos) + comoHTML(vm.fondos, vm.pidio, vm.ahora, vm.modo) +
      formasHTML(vm) + avisoHTML(vm) + listaHTML(vm);
  }

  /* ------------------------------------------------------ los toques, una vez */
  /**
   * El controlador común: pinta y escucha. `h` trae lo que cambia entre el
   * registro y la app: leer, autorizar, fondo, abrio, agregar, quitar,
   * despues, y el estado de inicio (vm).
   */
  function controlar(caja, vm, h) {
    var d = caja.ownerDocument || (typeof document !== 'undefined' ? document : null);
    ponerEstilo(d);
    /* Las imágenes (lo pegado y las miniaturas de la lista) se ponen después
       de pintar, como propiedad del <img>: ver pegadoHTML. */
    var ponerVistas = function () {
      if (!caja.querySelectorAll) return;
      Array.prototype.forEach.call(caja.querySelectorAll('img[data-hl-mini]') || [], function (im) {
        var u = urlDeVista(vm, im.getAttribute('data-hl-mini'));
        if (u) im.src = u;
      });
    };
    var pintar = function () {
      vm.ahora = h.ahora ? h.ahora() : Date.now();
      caja.innerHTML = pantallaHTML(vm);
      try { ponerVistas(); } catch (e) {}
      if (h.alPintar) { try { h.alPintar(); } catch (e) {} }
    };
    var decir = function (m, clase) { vm.aviso = m || ''; vm.avisoClase = clase || (m ? 'ambar' : ''); pintar(); };
    var trabajar = function (p) {
      vm.ocupado = true; pintar();
      var fin = function () { vm.ocupado = false; };
      return Promise.resolve(p).then(function (x) { fin(); return x; }, function (e) { fin(); throw e; });
    };
    /* Preparar, en orden (el tipo por sus bytes, el achique), SIN guardar
       nada todavía: {listos, malos}. */
    var prepararTodos = function (lista) {
      var listos = [], malos = [];
      return lista.reduce(function (p, b) {
        return p.then(function () {
          return prepararArchivo(b).then(function (r) { if (r.ok) listos.push(r.archivo); else malos.push(r.motivo); });
        });
      }, Promise.resolve()).then(function () { return { listos: listos, malos: malos }; });
    };
    /* Guardar (registro) o subir (app) lo ya preparado, de uno en uno, y
       volver a mirar la lista. Devuelve los motivos de lo que no entró. */
    var guardarTodos = function (listos, malos) {
      var m = (malos || []).slice();
      return listos.reduce(function (p, a) {
        return p.then(function () {
          return Promise.resolve(h.agregar(a)).then(function (x) { if (!x || x.ok !== true) m.push((x && x.motivo) || 'rechazo'); });
        });
      }, Promise.resolve()).then(function () { return h.leer(); }).then(function () { return m; });
    };
    var decirMalos = function (malos) {
      if (malos.length) decir(motivoEnPalabras(malos[0]) + (malos.length > 1 ? ' (y ' + (malos.length - 1) + ' más)' : ''));
      else decir('');
    };
    /* Lo que la persona ESCOGIÓ en el selector del teléfono (ahí lo vio): se
       prepara y se guarda de una vez. Se dice lo que pasó con cada uno.
       28-oct-2026 (arreglo de los leves, P10) — lo que estuviera pegado y sin
       contestar SE QUEDA esperando su «Sí» o su «No», a la vista. Se
       descartaba aquí sin decir nada: quien pegó y vio su imagen creía que
       había quedado, y se enteraba al abrir la cuenta por el número de
       archivos. Nada entra sin su «Sí», y nada se pierde sin su «No». */
    var agregarTodos = function (blobs) {
      var lista = Array.prototype.slice.call(blobs || []);
      if (!lista.length) return Promise.resolve();
      vm.aviso = lista.length > 1 ? 'Preparando tus ' + lista.length + ' archivos…' : 'Preparando tu archivo…'; vm.avisoClase = '';
      return trabajar(prepararTodos(lista).then(function (r) { return guardarTodos(r.listos, r.malos); }))
        .then(decirMalos, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
    };
    /* 28-oct-2026 (arreglo, ronda 1) — Lo PEGADO no se guarda: se prepara y
       se enseña (pegadoHTML), y espera el «Sí» de la persona (pegado-si). */
    var mostrarPegado = function (blobs) {
      var lista = Array.prototype.slice.call(blobs || []);
      if (!lista.length) return Promise.resolve();
      vm.pegando = false; vm.pegado = null;
      vm.aviso = 'Mirando lo que copiaste…'; vm.avisoClase = 'info';
      return trabajar(prepararTodos(lista)).then(function (r) {
        if (!r.listos.length) { decirMalos(r.malos.length ? r.malos : ['pegar_vacio']); return; }
        vm.pegado = r;
        decir('');
      }, function () { decir(motivoEnPalabras('lectura')); });
    };
    caja.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-hl]') : null;
      if (!t || !caja.contains(t)) return;
      var que = t.getAttribute('data-hl');
      if (que === 'despues') { if (h.despues) h.despues(); return; }
      if (que === 'abrir') {
        /* NO se repinta en este toque: un <a> que sale del documento antes de
           terminar su toque no abre nada. Solo se anota y se dice la hora. */
        var c = t.getAttribute('data-fondo');
        if (h.abrio) h.abrio(c);
        var n = caja.querySelector('[data-hl-pidio="' + c + '"]');
        var FP = F(), f = FP && FP.porCodigo(c);
        if (n && f && vm.pidio && vm.pidio[c]) n.textContent = 'Abriste la página de ' + f.nombre + ' ' + horaCorta(vm.pidio[c], Date.now()) + '.';
        return;
      }
      if (que === 'quitar') {
        var id = t.getAttribute('data-id');
        trabajar(Promise.resolve(h.quitar(id)).then(function () { return h.leer(); }))
          .then(function () { decir(''); }, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'pegar') {
        vm.pegado = null;
        decir('Mirando lo que copiaste…', 'info');
        leerPortapapeles().then(function (r) {
          if (r.ok && r.blobs.length) return mostrarPegado(r.blobs);
          vm.pegando = true;
          decir(motivoEnPalabras(r.motivo));
        });
        return;
      }
      /* La respuesta a «¿Es tu historia laboral?»: solo el «Sí» guarda. */
      if (que === 'pegado-si') {
        var p = vm.pegado; vm.pegado = null;
        if (!p || !p.listos || !p.listos.length) { decir(''); return; }
        vm.aviso = p.listos.length > 1 ? 'Guardando tus ' + p.listos.length + ' archivos…' : 'Guardando tu archivo…'; vm.avisoClase = '';
        trabajar(guardarTodos(p.listos, p.malos))
          .then(decirMalos, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'pegado-no') { vm.pegado = null; decir(TEXTOS.pegadoNo, 'info'); }
    });
    caja.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var que = t.getAttribute('data-hl');
      if (que === 'aut') {
        var si = !!t.checked;
        if (!si) vm.pegado = null;   // sin autorización no queda nada pegado esperando
        Promise.resolve(h.autorizar(si)).then(function (r) {
          if (r && r.ok === false) { decir(motivoEnPalabras(r.motivo)); return; }
          return Promise.resolve(h.leer()).then(function () { decir(''); });
        }, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'fondo') {
        Promise.resolve(h.fondo(t.value)).then(function (r) {
          if (r && r.ok === false) { decir(motivoEnPalabras(r.motivo)); return; }
          vm.aviso = ''; pintar();
        }, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'archivo') {
        var fs = Array.prototype.slice.call(t.files || []);
        try { t.value = ''; } catch (e) {}
        if (fs.length) agregarTodos(fs);
      }
    });
    /* El recuadro de mantener presionado → «Pegar». El evento trae el archivo;
       nada se escribe en el recuadro. Si el teléfono pega una <img> en vez de
       dar el archivo, se toma de ahí. Como el botón, se enseña y se pregunta
       (mostrarPegado): nada se guarda sin el «Sí». */
    caja.addEventListener('paste', function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !t.closest('[data-hl="zona"]')) return;
      var r = blobsDePegar(ev);
      try { ev.preventDefault(); } catch (e) {}
      if (r.blobs.length) mostrarPegado(r.blobs);
      else decir(motivoEnPalabras(r.texto ? 'pegar_texto' : 'pegar_vacio'));
    });
    caja.addEventListener('input', function (ev) {
      var z = ev.target && ev.target.closest ? ev.target.closest('[data-hl="zona"]') : null;
      if (!z) return;
      var img = z.querySelector && z.querySelector('img');
      var src = img && img.getAttribute('src');
      z.textContent = TEXTOS.zonaPegar;
      if (!src) return;
      var pedido = /^data:image\/(png|jpeg|webp);base64,/i.test(src)
        ? Promise.resolve(new Blob([bytesDeBase64(src)]))
        : (/^blob:/i.test(src) && typeof fetch === 'function') ? fetch(src).then(function (r) { return r.blob(); }) : null;
      if (!pedido) return decir(motivoEnPalabras('pegar_vacio'));
      pedido.then(function (b) { return mostrarPegado([b]); }, function () { decir(motivoEnPalabras('pegar_vacio')); });
    });
    return { pintar: pintar, decir: decir, vm: vm };
  }

  /* ------------------------------------------------- el paso del registro */
  /**
   * El paso «Tu fondo de pensiones». `o`: {guardadero, intento, celular,
   * despues(), ahora(), perdidos}. Todo lo escogido se guarda en el teléfono
   * en el momento (la pestaña se puede cerrar al irse al correo).
   */
  function pasoDelRegistro(caja, o) {
    var g = o.guardadero, intento = String(o.intento || ''), cel = String(o.celular || '');
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var e = g.estado(intento, cel);
    var vm = { modo: 'registro', aut: e.aut, fondos: e.fondos.slice(), pidio: Object.assign({}, e.pidio), archivos: [],
               aviso: '', avisoClase: '', pegando: false, pegado: null, ocupado: false, soloMemoria: false, perdidos: !!o.perdidos };
    /* Se relee antes de escribir: la cuenta de archivos (archivos_n) la lleva
       el guardadero, y un objeto viejo la pisaría. */
    var guardar = function () {
      var x = g.estado(intento, cel);
      x.aut = vm.aut; x.fondos = vm.fondos; x.pidio = vm.pidio; x.despues = !!e.despues;
      g.guardarEstado(x); e = x;
    };
    var h = {
      ahora: ahora,
      leer: function () {
        return g.archivos(intento, cel).then(function (r) {
          vm.archivos = r.lista; if (r.perdidos) vm.perdidos = true;
          return g.soloEnMemoria().then(function (m) { vm.soloMemoria = m; });
        });
      },
      autorizar: function (si) {
        if (si) vm.aut = armarAutorizacion(new Date(ahora()).toISOString());
        else { vm.aut = null; vm.fondos = []; vm.pidio = {}; }
        guardar();
        return si ? null : g.soltarArchivos();
      },
      fondo: function (c) {
        var FP = F(); if (!FP) return null;
        vm.fondos = FP.alternar(vm.fondos, c); guardar(); return null;
      },
      abrio: function (c) { vm.pidio[c] = new Date(ahora()).toISOString(); guardar(); },
      agregar: function (a) { return vm.aut ? g.agregar(intento, cel, a) : { ok: false, motivo: 'sin_autorizacion' }; },
      quitar: function (id) { return g.quitar(intento, cel, id); },
      despues: function () { e.despues = true; guardar(); if (o.despues) o.despues(); }
    };
    var ctl = controlar(caja, vm, h);
    /* 28-oct-2026 (arreglo de los leves, P10) — ¿se puede seguir? No con lo
       pegado esperando respuesta: «Continuar» lo dejaba atrás sin decir nada.
       Se dice debajo de la pregunta, y se lleva la pantalla hasta ella. La
       página lo pregunta antes de pasar de paso (siguientePaso, en play/). */
    ctl.puedeSeguir = function () {
      if (!(vm.pegado && vm.pegado.listos && vm.pegado.listos.length)) return true;
      ctl.decir(TEXTOS.pegadoPendiente, 'ambar');
      try {
        var d = caja.ownerDocument || (typeof document !== 'undefined' ? document : null);
        var p = d && d.getElementById ? d.getElementById('hlPegado') : null;
        if (p && p.scrollIntoView) p.scrollIntoView({ block: 'center' });
      } catch (e) {}
      return false;
    };
    ctl.pintar();
    h.leer().then(ctl.pintar, ctl.pintar);
    return ctl;
  }

  /* --------------------------------------------- la tarjeta de la app (socio) */
  /**
   * «Tu historia laboral» en la cuenta. `o`: {credenciales() → Promise<{url,
   * anon, token}>, fetch, escritura(p), ahora(), confirmar(texto)}.
   * Si la base todavía no tiene las funciones (404), la tarjeta no aparece:
   * no se ofrece lo que no va a funcionar.
   */
  function tarjetaDeCuenta(caja, o) {
    o = o || {};
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var escritura = typeof o.escritura === 'function' ? o.escritura : function (p) { return p; };
    var vm = { modo: 'cuenta', aut: null, fondos: [], pidio: {}, archivos: [], aviso: '', avisoClase: '', pegando: false,
               pegado: null, vistas: {}, ocupado: false, abierta: !!o.abierta, cargando: true };
    var llamar = function (fn, cuerpo, escribe) {
      var p = Promise.resolve(o.credenciales ? o.credenciales() : null).then(function (cfg) {
        return llamarConToken(cfg, fn, cuerpo, o.fetch);
      });
      return escribe ? escritura(p) : p;
    };
    var deError = function (e) {
      var st = e && e.status;
      return { ok: false, motivo: st === 404 ? 'apagado' : (st === 401 || st === 403 || (e && e.sinSesion)) ? 'sesion' : 'sin_red' };
    };
    var cuerpoCaja = null;
    /* Por id y no buscando dentro de la caja: hay una sola tarjeta por pantalla. */
    var porId = function (id) { var d = caja.ownerDocument || (typeof document !== 'undefined' ? document : null); return d && d.getElementById ? d.getElementById(id) : null; };
    var pintarTarjeta = function () {
      if (vm.apagado) { caja.innerHTML = ''; return; }
      var n = vm.archivos.length;
      var linea = vm.cargando ? 'Mirando lo que tienes guardado…'
        : n ? 'Ya nos diste ' + resumen(vm.archivos) + '.' : (vm.aut ? 'Ya nos diste tu autorización. Falta tu historia laboral.' : 'Todavía no nos la das.');
      caja.innerHTML = '<div class="card" id="hlTarjeta"><h3 class="tit">📄 Tu historia laboral <span class="muted" style="font-weight:400">· opcional</span></h3>' +
        '<p class="sub" id="hlLinea">' + esc(linea) + '</p>' +
        (vm.abierta ? '<div id="hlCuerpo"></div>' +
          /* Siempre en la tarjeta abierta, escondido sin autorización: quien la
             da aquí mismo tiene que ver YA cómo retirarla (pintarLinea lo
             muestra), no al volver a abrir la tarjeta. */
          '<button type="button" class="btn sec sm' + (vm.aut ? '' : ' oculto') + '" style="margin-top:var(--e4)" id="hlRetirar">' +
            'Retirar mi autorización y borrar mi historia laboral</button>'
          : (vm.cargando ? '' : '<button type="button" class="btn sec sm" style="margin-top:var(--e3)" id="hlAbrir">' + (n ? 'Ver o cambiar' : 'Subirla') + '</button>')) +
        '</div>';
      var b = porId('hlAbrir');
      if (b) b.addEventListener('click', function () { vm.abierta = true; pintarTarjeta(); });
      var r = porId('hlRetirar');
      if (r) r.addEventListener('click', retirar);
      cuerpoCaja = porId('hlCuerpo');
      if (cuerpoCaja) { ctl = controlar(cuerpoCaja, vm, h); ctl.pintar(); }
    };
    var leer = function () {
      return llamar('pension_mia', {}).then(function (j) {
        vm.cargando = false;
        if (!j || j.ok !== true) throw { motivo: (j && j.motivo) || 'sin_red' };
        var a = j.autorizacion;
        vm.aut = (a && !a.revocada_en) ? a : null;
        vm.fondos = vm.aut ? (a.fondos || []) : [];
        vm.archivos = j.archivos || [];
      }, function (e) { vm.cargando = false; var m = deError(e).motivo; if (m === 'apagado') vm.apagado = true; throw { motivo: m }; });
    };
    /* La casilla: esto SÍ es firmar, con la versión del texto que se ve. */
    var autorizarCon = function (fondos) {
      return llamar('pension_autorizar', { p_fondos: fondos, p_version: VERSION_AUTORIZACION,
                                          p_momento: new Date(ahora()).toISOString() }, true)
        .then(function (j) { return (j && j.ok === true) ? { ok: true } : { ok: false, motivo: (j && j.motivo) || 'sin_red' }; }, deError);
    };
    /* 28-oct-2026 (arreglo de los leves, P6) — CAMBIAR DE FONDO NO ES FIRMAR.
       Iba por autorizarCon, con la versión del texto del código: la base pisaba
       la versión y la hora de la constancia en cada toque de un fondo, y el
       día que el texto cambie habría anotado que la persona aceptó uno que
       nunca marcó. Sin versión, la base solo cambia el fondo (ver
       pension_autorizar en base/20261103_el_fondo_de_pensiones.sql). */
    var cambiarFondos = function (fondos) {
      return llamar('pension_autorizar', { p_fondos: fondos, p_version: null, p_momento: null }, true)
        .then(function (j) { return (j && j.ok === true) ? { ok: true } : { ok: false, motivo: (j && j.motivo) || 'sin_red' }; }, deError);
    };
    /* 28-oct-2026 (arreglo de los leves, P7) — retirar también borra lo que
       de esta cuenta esperaba en ESTE teléfono (la cola del registro que no
       alcanzó a subir): sin eso, al entrar se volvía a intentar subir la
       historia laboral de quien acababa de retirarla, y la pantalla decía «Lo
       volvemos a intentar». `o.guardadero` y `o.celular` los da la página. */
    var soltarLaCola = function () {
      var cel = typeof o.celular === 'function' ? o.celular() : o.celular;
      var p = (o.guardadero && cel) ? Promise.resolve(o.guardadero.guardarCola(String(cel), null)).then(null, function () {}) : Promise.resolve();
      return p.then(function () { if (o.alRetirar) { try { o.alRetirar(); } catch (e) {} } });
    };
    var retirar = function () {
      var preguntar = o.confirmar || function (t) { return typeof confirm === 'function' ? confirm(t) : true; };
      if (!preguntar('Vamos a borrar tu historia laboral y tu fondo, y a quitar tu autorización. ¿Seguimos?')) return;
      llamar('pension_retirar', {}, true).then(function () { vm.vistas = {}; vm.pegado = null; return soltarLaCola(); })
        .then(function () { return leer(); })
        .then(function () { vm.aviso = 'Listo: borramos tu historia laboral y quitamos tu autorización.'; vm.avisoClase = 'verde'; pintarTarjeta(); },
              function (e) { vm.aviso = motivoEnPalabras(deError(e).motivo || (e && e.motivo)); vm.avisoClase = 'ambar'; pintarTarjeta(); });
    };
    var ctl = null;
    var h = {
      ahora: ahora,
      leer: function () { return leer().then(function () { pintarLinea(); }); },
      autorizar: function (si) {
        if (si) return autorizarCon([]);
        /* Desmarcar en la cuenta es retirar: se pregunta, porque borra. */
        retirar();
        return { ok: true };
      },
      fondo: function (c) {
        var FP = F(); if (!FP) return null;
        var nuevos = FP.alternar(vm.fondos, c);
        return cambiarFondos(nuevos).then(function (r) { if (r.ok) vm.fondos = nuevos; return r; });
      },
      abrio: function (c) { vm.pidio[c] = new Date(ahora()).toISOString(); },
      agregar: function (a) {
        return llamar('pension_subir', { p_archivo: a.base64 }, true)
          .then(function (j) {
            if (!(j && j.ok === true)) return { ok: false, motivo: (j && j.motivo) || 'rechazo' };
            /* 28-oct-2026 (arreglo, ronda 1) — lo que acaba de subir se sigue
               viendo en su lista (miniatura, nombre) mientras esté aquí: la
               base no devuelve el contenido, y sin esto la lista solo decía
               «Pantallazo · 96 KB». */
            if (j.id != null) vm.vistas[String(j.id)] = { tipo: a.tipo, base64: a.tipo === 'pdf' ? '' : a.base64, nombre: a.nombre || '' };
            return { ok: true };
          }, deError);
      },
      quitar: function (id) { return llamar('pension_quitar', { p_id: Number(id) }, true); },
      alPintar: function () { pintarLinea(); }
    };
    var pintarLinea = function () {
      var l = porId('hlLinea'), n = vm.archivos.length;
      if (l) l.textContent = n ? 'Ya nos diste ' + resumen(vm.archivos) + '.' : (vm.aut ? 'Ya nos diste tu autorización. Falta tu historia laboral.' : 'Todavía no nos la das.');
      var r = porId('hlRetirar');
      if (r) r.classList[vm.aut ? 'remove' : 'add']('oculto');
    };
    ponerEstilo(caja.ownerDocument || (typeof document !== 'undefined' ? document : null));
    pintarTarjeta();
    leer().then(pintarTarjeta, function () {
      if (vm.apagado) { caja.innerHTML = ''; if (o.alApagado) o.alApagado(); return; }
      vm.aviso = 'No pude mirar tu historia laboral. Revisa tu internet y vuelve a abrir esta pantalla.'; vm.avisoClase = 'ambar';
      caja.innerHTML = '<div class="card"><h3 class="tit">📄 Tu historia laboral</h3><div class="aviso ambar" role="status">' + esc(vm.aviso) + '</div></div>';
    });
    return { vm: vm, recargar: function () { return leer().then(pintarTarjeta); } };
  }

  return {
    VERSION: '2026-10-28',
    VERSION_AUTORIZACION: VERSION_AUTORIZACION,
    LIMITES: LIMITES,
    HORAS_ARCHIVOS: HORAS_ARCHIVOS,
    DIAS_ESTADO: DIAS_ESTADO,
    LLAVE_ESTADO: LLAVE_ESTADO,
    minutosFuera: minutosFuera,
    TEXTOS: TEXTOS,
    MOTIVOS: MOTIVOS,
    TIPO_MIME: TIPO_MIME,
    motivoEnPalabras: motivoEnPalabras,
    tipoPorBytes: tipoPorBytes,
    base64DeBytes: base64DeBytes,
    bytesDeBase64: bytesDeBase64,
    tamanoEnPalabras: tamanoEnPalabras,
    nombreDeTipo: nombreDeTipo,
    resumen: resumen,
    revisarNuevo: revisarNuevo,
    armarAutorizacion: armarAutorizacion,
    limpiarMetadatos: limpiarMetadatos,
    orientacionJpeg: orientacionJpeg,
    prepararArchivo: prepararArchivo,
    leerPortapapeles: leerPortapapeles,
    blobsDePegar: blobsDePegar,
    guardadero: guardadero,
    subirCola: subirCola,
    avisoDeLaCola: avisoDeLaCola,
    llamarConToken: llamarConToken,
    autorizacionHTML: autorizacionHTML,
    pantallaHTML: pantallaHTML,
    pasoDelRegistro: pasoDelRegistro,
    tarjetaDeCuenta: tarjetaDeCuenta,
    horaCorta: horaCorta
  };
});
