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
 *   · 📋 Pegar — para quien COPIÓ el pantallazo. Primero se intenta leer lo
 *     copiado (navigator.clipboard.read, que en iPhone muestra su botón
 *     «Pegar» y en Android puede pedir permiso); si el teléfono no deja o no
 *     lo tiene, aparece un recuadro donde se mantiene presionado → «Pegar».
 *     Si tampoco, se dice y se ofrece subir. Copiar un PDF casi ningún
 *     teléfono lo deja: «Pegar» es en la práctica para pantallazos.
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
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.HistoriaLaboral = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* La versión del texto de la autorización: la fecha de la política que la
     describe (legal/privacidad.html, «Lo que cambió el 3 de noviembre de
     2026»). Si la política sale otro día, se mueven las dos juntas: lo vigila
     pruebas/el-fondo-de-pensiones.test.js. NO es VERSION_AUTORIZACION de
     app/cuenta.js: esa es la general, y no sube (a nadie se le vuelve a pedir
     nada por esto). */
  var VERSION_AUTORIZACION = '2026-11-03';

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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* ---------------------------------------------------------------- textos */
  var TEXTOS = {
    intro: 'Opcional. Tu historia laboral es el documento de tu fondo de pensiones que dice dónde has trabajado y cuánto ' +
      'has cotizado. Si nos la das, la miramos al revisar tu solicitud. Si no, tu registro sigue igual.',
    introCuenta: 'Opcional. El documento de tu fondo de pensiones que dice dónde has trabajado y cuánto has cotizado. ' +
      'Si nos lo das, lo miramos al revisar tus solicitudes. No cambia tu garantía: tu garantía sale de tus pagos.',
    autorizacion: 'Autorizo a NEXECO S.A.S. (Tu Garantía) a recibir y guardar mi historia laboral y el nombre de mi fondo de pensiones.',
    /* Lo que la ley pide decir al pedirla (Ley 1581, arts. 9 y 12; Decreto
       1377, arts. 5 y 7): para qué, que es opcional, cuánto se guarda, quién
       la ve y cómo se retira. Cada frase es verdad en el código: la ve solo
       Joan (pension_archivo pide su clave), se guarda mientras haya cuenta (no
       caduca), se quita desde la app (pension_retirar) o por el chat
       (pension_borrar, desde el CRM). */
    autorizacionDetalle: 'Para revisar dónde trabajo y cuánto cotizo cuando evalúen mis solicitudes de crédito. Es opcional y ' +
      'aparte de la autorización general: sin ella todo sigue igual. Nunca me piden la clave de mi fondo. Se guarda mientras ' +
      'tenga cuenta en Tu Garantía; la ve solo quien dirige el negocio, no el resto del equipo. Puedo quitarla cuando quiera ' +
      'desde mi cuenta en la app, o pedir por el chat que la borren. Si el documento trae incapacidades o licencias, no se ' +
      'usan para nada.',
    preguntaFondo: '¿En qué fondo estás?',
    ayudaFondo: 'Si cotizas en Colpensiones y en un fondo privado, marca los dos.',
    afuera: 'Se abre en otra pestaña, en la página oficial. Nunca te pedimos la clave de tu fondo.',
    volver: 'Cuando te llegue el correo, vuelve a esta pestaña de Tu Garantía y súbela aquí. Si tarda, sigue con tu ' +
      'registro: la puedes subir después desde tu cuenta en la app.',
    subela: 'Cuando la tengas, súbela',
    ayudaFormas: 'El PDF es lo mejor: es el documento tal como te lo mandó tu fondo. Si no, pantallazos donde se lean tu ' +
      'nombre, tus semanas y tus empleadores.',
    zonaPegar: 'Mantén presionado aquí y toca «Pegar»',
    quedanAqui: 'Quedan guardados en este teléfono y suben con tu registro cuando toques «Abrir mi cuenta».',
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
   * 1 MB se achica; un PDF se sube tal cual.
   * @returns Promise<{ok, archivo, motivo}>
   */
  function prepararArchivo(blob) {
    if (!blob) return Promise.resolve({ ok: false, motivo: 'vacio' });
    return leerBytes(blob).then(function (u8) {
      if (!u8 || !u8.length) return { ok: false, motivo: 'vacio' };
      var tipo = tipoPorBytes(u8);
      if (!tipo) return { ok: false, motivo: 'tipo_no_permitido' };
      if (tipo === 'pdf') {
        if (u8.length > LIMITES.bytes) return { ok: false, motivo: 'muy_grande' };
        return listo(tipo, u8);
      }
      if (u8.length <= LIMITES.achicarDesde) return listo(tipo, u8);
      return achicar(blob).then(function (chico) {
        var t2 = chico && tipoPorBytes(chico);
        if (chico && t2 && chico.length < u8.length) return listo(t2, chico);
        if (u8.length <= LIMITES.bytes) return listo(tipo, u8);
        return { ok: false, motivo: 'muy_grande' };
      });
    }, function () { return { ok: false, motivo: 'lectura' }; });
    function listo(tipo, u8) {
      return sha256Hex(u8).then(function (h) {
        return { ok: true, archivo: { tipo: tipo, bytes: u8.length, base64: base64DeBytes(u8), sha256: h } };
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
        var listo = false, fin = function (d) { if (listo) return; listo = true; if (!d) persistido = false; res(d); };
        /* Safari a veces no contesta nunca el open: a los 3 s, la memoria. */
        try { setTimeout(function () { fin(null); }, 3000); } catch (e) {}
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
                       base64: a.base64, sha256: a.sha256 || '', t: ahora() };
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
   *   estado: 'nada' | 'ok' | 'apagado' | 'sesion' | 'freno' | 'sin_red'.
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
        return g.guardarCola(cel, null).then(function () { return res; });
      }, function (e) {
        var st = e && e.status, m = e && e.motivo;
        res.estado = st === 404 ? 'apagado'
          : (st === 401 || st === 403 || m === 'sin_sesion' || (e && e.sinSesion)) ? 'sesion'
          : m === 'freno' ? 'freno' : 'sin_red';
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
      return { clase: 'verde', html: '<b>Guardamos tu autorización y tu fondo.</b> Cuando tengas tu historia laboral, súbela desde tu cuenta en la app.' };
    }
    if (r.estado === 'apagado') return { clase: 'ambar', html: '<b>Tu historia laboral se quedó en este teléfono:</b> esta parte todavía no está encendida en nuestro sistema. ' + quedan };
    if (r.estado === 'freno') return { clase: 'ambar', html: '<b>Tu historia laboral no alcanzó a subir</b> por demasiados intentos seguidos. ' + quedan };
    return { clase: 'ambar', html: '<b>Tu historia laboral no alcanzó a subir.</b> ' + quedan };
  }
  function resumenDe(n, r) { return n === r.total ? (n === 1 ? '1 archivo' : n + ' archivos') : n + ' de ' + r.total + ' archivos'; }

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
    '.hl-despues{margin-top:var(--e3)}';
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
      '<span class="muted">' + esc(TEXTOS.autorizacionDetalle) + ' Versión del 3 de noviembre de 2026 · ' +
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
    return (fondos || []).map(function (c) {
      var f = FP.porCodigo(c); if (!f) return '';
      if (!f.regimen) {
        return '<div class="hl-como" data-hl-como="' + esc(c) + '"><div class="sub" style="margin:0">' + esc(f.texto) + '</div>' +
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
    }).join('') + ((fondos || []).some(function (c) { return FP.esFondo(c) && FP.porCodigo(c).como === 'correo'; }) && modo === 'registro'
      ? '<div class="ayuda" style="margin-top:var(--e3)">' + esc(TEXTOS.volver) + '</div>' : '');
  }
  function formasHTML(vm) {
    return '<div class="grupo-tit">' + esc(TEXTOS.subela) + '</div>' +
      '<div class="ayuda">' + esc(TEXTOS.ayudaFormas) + '</div>' +
      '<div class="hl-formas">' +
        '<label class="btn sec sm hl-forma" id="hlBotonPdf">📄 Subir el PDF' +
          '<input type="file" class="hl-archivo" accept="application/pdf,.pdf" data-hl="archivo"' + (vm.ocupado ? ' disabled' : '') + '></label>' +
        '<label class="btn sec sm hl-forma" id="hlBotonImg">🖼️ Subir pantallazos' +
          '<input type="file" class="hl-archivo" accept="image/png,image/jpeg,image/webp" multiple data-hl="archivo"' + (vm.ocupado ? ' disabled' : '') + '></label>' +
        '<button type="button" class="btn sec sm" id="hlBotonPegar" data-hl="pegar"' + (vm.ocupado ? ' disabled' : '') + '>📋 Pegar</button>' +
      '</div>' +
      '<div class="hl-pegar' + (vm.pegando ? '' : ' oculto') + '" id="hlPegar" contenteditable="true" data-hl="zona" role="textbox" ' +
        'aria-label="' + esc(TEXTOS.zonaPegar) + '" inputmode="none">' + esc(TEXTOS.zonaPegar) + '</div>';
  }
  function listaHTML(vm) {
    var l = vm.archivos || [];
    if (!l.length) return '';
    return '<div class="hl-lista" id="hlLista" style="margin-top:var(--e3)">' + l.map(function (a) {
      var cuando = a.creado_en ? ' · subido el ' + fechaCorta(a.creado_en) : '';
      return '<div class="hl-item"><span>' + (a.tipo === 'pdf' ? '📄 ' : '🖼️ ') + esc(nombreDeTipo(a.tipo)) + ' · ' +
        esc(tamanoEnPalabras(a.bytes)) + esc(cuando) + '</span>' +
        '<button type="button" class="btn sec sm" data-hl="quitar" data-id="' + esc(a.id) + '"' + (vm.ocupado ? ' disabled' : '') + '>Quitar</button></div>';
    }).join('') + '</div>' +
    (vm.modo === 'registro' ? '<div class="ayuda">' + esc(vm.soloMemoria ? TEXTOS.soloMemoria : TEXTOS.quedanAqui) + '</div>' : '');
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
    var pintar = function () {
      vm.ahora = h.ahora ? h.ahora() : Date.now();
      caja.innerHTML = pantallaHTML(vm);
      if (h.alPintar) { try { h.alPintar(); } catch (e) {} }
    };
    var decir = function (m, clase) { vm.aviso = m || ''; vm.avisoClase = clase || (m ? 'ambar' : ''); pintar(); };
    var trabajar = function (p) {
      vm.ocupado = true; pintar();
      var fin = function () { vm.ocupado = false; };
      return Promise.resolve(p).then(function (x) { fin(); return x; }, function (e) { fin(); throw e; });
    };
    /* Los archivos de una vez, en orden: preparar (el tipo por sus bytes, el
       achique) y guardar o subir. Se dice lo que pasó con cada uno. */
    var agregarTodos = function (blobs) {
      var lista = Array.prototype.slice.call(blobs || []);
      if (!lista.length) return Promise.resolve();
      vm.aviso = lista.length > 1 ? 'Preparando tus ' + lista.length + ' archivos…' : 'Preparando tu archivo…'; vm.avisoClase = '';
      var malos = [];
      return trabajar(lista.reduce(function (p, b) {
        return p.then(function () {
          return prepararArchivo(b).then(function (r) {
            if (!r.ok) { malos.push(r.motivo); return; }
            return Promise.resolve(h.agregar(r.archivo)).then(function (x) { if (!x || x.ok !== true) malos.push((x && x.motivo) || 'rechazo'); });
          });
        });
      }, Promise.resolve()).then(function () { return h.leer(); }))
        .then(function () {
          if (malos.length) decir(motivoEnPalabras(malos[0]) + (malos.length > 1 ? ' (y ' + (malos.length - 1) + ' más)' : ''));
          else decir('');
        }, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
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
        decir('Mirando lo que copiaste…', 'info');
        leerPortapapeles().then(function (r) {
          if (r.ok && r.blobs.length) { vm.pegando = false; return agregarTodos(r.blobs); }
          vm.pegando = true;
          decir(motivoEnPalabras(r.motivo));
        });
      }
    });
    caja.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var que = t.getAttribute('data-hl');
      if (que === 'aut') {
        var si = !!t.checked;
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
       dar el archivo, se toma de ahí. */
    caja.addEventListener('paste', function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !t.closest('[data-hl="zona"]')) return;
      var r = blobsDePegar(ev);
      try { ev.preventDefault(); } catch (e) {}
      if (r.blobs.length) { vm.pegando = false; agregarTodos(r.blobs); }
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
      pedido.then(function (b) { vm.pegando = false; return agregarTodos([b]); }, function () { decir(motivoEnPalabras('pegar_vacio')); });
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
               aviso: '', avisoClase: '', pegando: false, ocupado: false, soloMemoria: false, perdidos: !!o.perdidos };
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
               ocupado: false, abierta: !!o.abierta, cargando: true };
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
          (vm.aut ? '<button type="button" class="btn sec sm" style="margin-top:var(--e4)" id="hlRetirar">Retirar mi autorización y borrar mi historia laboral</button>' : '')
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
    var autorizarCon = function (fondos) {
      return llamar('pension_autorizar', { p_fondos: fondos, p_version: VERSION_AUTORIZACION,
                                          p_momento: new Date(ahora()).toISOString() }, true)
        .then(function (j) { return (j && j.ok === true) ? { ok: true } : { ok: false, motivo: (j && j.motivo) || 'sin_red' }; }, deError);
    };
    var retirar = function () {
      var preguntar = o.confirmar || function (t) { return typeof confirm === 'function' ? confirm(t) : true; };
      if (!preguntar('Vamos a borrar tu historia laboral y tu fondo, y a quitar tu autorización. ¿Seguimos?')) return;
      llamar('pension_retirar', {}, true).then(function () { return leer(); })
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
        return autorizarCon(nuevos).then(function (r) { if (r.ok) vm.fondos = nuevos; return r; });
      },
      abrio: function (c) { vm.pidio[c] = new Date(ahora()).toISOString(); },
      agregar: function (a) {
        return llamar('pension_subir', { p_archivo: a.base64 }, true)
          .then(function (j) { return (j && j.ok === true) ? { ok: true } : { ok: false, motivo: (j && j.motivo) || 'rechazo' }; }, deError);
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
