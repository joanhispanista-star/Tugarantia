/* ============================================================================
 * FALTA TU CÉDULA — 13 de noviembre de 2026
 *
 * LO QUE PIDIÓ JOAN: «el cliente no puso la cédula al momento de
 * registrarse; quiero que cuando él solicite el crédito, o incluso antes,
 * tenga un botón o una alerta que diga que no ha subido la cédula o que la
 * información está incompleta». El caso real: un registrado del 8-nov subió
 * solo la selfie y escribió el número del documento.
 *
 * LO QUE NO SE PUEDE, y manda sobre todo lo de abajo: la cédula NO es
 * obligatoria. Decisión de Joan del 3-nov, con el dato legal delante:
 * Decreto 1377 de 2013, art. 6 («Ninguna actividad podrá condicionarse a que
 * el Titular suministre datos personales sensibles»), y legal/privacidad.html
 * promete «Es opcional de verdad». Por eso esto AVISA y OFRECE subirla, y
 * nunca frena nada: ni una solicitud, ni una aceptación, ni la cuenta.
 * Siempre hay «Seguir sin ella» (o la tarjeta no está en el camino).
 *
 * QUÉ SABE Y DE DÓNDE:
 *   · la base dice qué fotos de SU registro llegaron (mis_fotos_del_registro,
 *     base/20261113_falta_tu_cedula.sql): solo true/false, nunca la imagen;
 *   · en la cuenta junta, la ficha de Joan también cuenta: si Joan pegó la
 *     cédula a mano (se la mandó por el chat o por WhatsApp), el paquete trae
 *     perfil.datos.foto_cedula_frente/_reverso en true y no se le pide;
 *   · si la base no tiene la función (404), no hay señal o la respuesta no
 *     tiene la forma esperada: NO hay tarjeta. La app no dice que falta algo
 *     que no sabe que falta.
 *   · Sin tarjeta también: el registro de antes de la cámara (antes del
 *     9-sep-2026 el registro no pedía fotos), el registro descartado, la
 *     cuenta sin registro (un cliente antiguo: su cédula la tiene Joan por
 *     otro lado), y las fotos que todavía esperan en la cola de play/ en este
 *     teléfono (van en camino: play/ ya dice qué pasa con ellas).
 *
 * CÓMO SE SUBE: por registro_archivos_guardar con la sesión de la cuenta, la
 * MISMA función de play/, con los MISMOS tipos (cedula_frente,
 * cedula_reverso) y la MISMA compresión (JPEG, lado mayor a 900, calidad 0,6:
 * los [[900, 0.6]] de tomarFoto en play/). La foto se toma con la cámara o se
 * elige de la galería (<input type=file accept=image/*> sin `capture`, como
 * la foto del chat: el teléfono deja escoger), y sube en cuanto está lista:
 * no se guarda en el teléfono ni un segundo más de lo necesario.
 *
 * SIN EL PERMISO DE DATOS SENSIBLES, PRIMERO EL PERMISO. La base rechaza la
 * cédula de una cuenta sin autorización con sensibles:true
 * ('sin_autorizacion', base/20261020_la_cedula_de_la_cuenta.sql, 2-bis). Si
 * en el registro dijo que no, el botón le pide ESE permiso, aparte, sin
 * marcar, con la frase de la casilla de play/ y la versión de app/cuenta.js
 * (armarAutorizacion). Se guarda en la cuenta como lo hace play/
 * (guardarLaConstancia): `autorizacion` es la nueva y `autorizaciones` el
 * historial, sin borrar ninguna. Sin la constancia guardada, no sube nada.
 *
 * LA CÉDULA QUE YA ENTRÓ CON SU CÓDIGO. Si un lado entró con la lectura del
 * código de barras, la reja de la base no deja que una foto sin lectura lo
 * reemplace ni lo acompañe (la devuelve en `descartados`). Entonces no se
 * ofrece un botón que no va a servir: se ofrece el chat de la app.
 *
 * ESTE ARCHIVO NO DECIDE, y lo pone la página: cómo se llama a la base
 * (rpc), con qué credenciales se habla con Supabase Auth, cómo se cuenta una
 * escritura en camino, de quién es la sesión (quien: el celular), dónde se
 * pinta (caja), qué dice la ficha, y cómo se va al chat. Así lo usan igual
 * app/socio.html y play/index.html. Los botones llaman a la página por su
 * nombre global (`nombre`, 'FLC' por defecto).
 *
 * El cliente nunca ve porcentajes: aquí no hay plata.
 * ==========================================================================*/
/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de
   v139 en sw.js). Va primero: firma que llegó ESTE archivo. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.FaltaLaCedula = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* La compresión de play/ para la cédula (tomarFoto: [[900, 0.6]]).
     pruebas/falta-la-cedula.test.js las compara con las de play/. */
  var LADO_MAXIMO = 900, CALIDAD = 0.6;
  var FUNCION = 'mis_fotos_del_registro';
  var SUBIDA = 'registro_archivos_guardar';
  /* La de preguntar solo lee: no frena la recarga sola (play/ la pone en
     LECTURAS_QUE_NO_FRENAN). La subida sí, y va por `escritura`. */
  var LECTURAS = [FUNCION];
  /* «Ya la mandé por el chat»: solo en ESTE teléfono y para ESTA cuenta. Es una
     comodidad de quien mira, no un dato: si el teléfono no deja guardar, se
     recuerda mientras la página siga abierta. */
  var LLAVE_POR_CHAT = 'tg_cedula_por_chat_';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  /* La forma de app/sesion-socio.js ({causa}) y la de play/ (Error('http 404'),
     {sinSesion}), como causaDe en app/propuesta-en-la-app.js. */
  function causaDe(e) {
    if (e && e.causa) return String(e.causa);
    if (e && e.sinSesion) return 'sesion';
    var m = String((e && e.message) || '');
    if (/\b404\b/.test(m)) return 'apagado';
    if (/\b401\b|\b403\b/.test(m)) return 'sesion';
    return 'red';
  }

  /**
   * ¿Hay que avisar, y de qué? `j` es lo que contestó mis_fotos_del_registro;
   * `ficha`, en la cuenta junta, perfil.datos del paquete (lo que tiene la
   * ficha de Joan, sin la foto); `hechas`, lo que subió en esta visita.
   * Devuelve {mostrar:false, por} o {mostrar:true, faltan, pasaporte,
   * conCodigo, sensibles}. Cualquier forma inesperada es «no se sabe», y
   * entonces no se muestra nada.
   */
  function plan(j, ficha, hechas) {
    if (!j || typeof j !== 'object' || j.ok !== true || !j.fotos || typeof j.fotos !== 'object') {
      return { mostrar: false, por: 'no_se' };
    }
    var r = j.registro;
    if (!r || typeof r !== 'object') return { mostrar: false, por: 'sin_registro' };
    if (r.antes_de_la_camara === true) return { mostrar: false, por: 'antes_de_la_camara' };
    if (r.estado === 'descartado') return { mostrar: false, por: 'descartado' };
    var f = j.fotos, fi = (ficha && typeof ficha === 'object') ? ficha : {}, h = hechas || {};
    var tiene = function (k) { return f[k] === true || fi['foto_' + k] === true || h[k] === true; };
    var pasaporte = r.pasaporte === true;
    var faltan = pasaporte
      ? ((tiene('cedula_frente') || tiene('cedula_reverso')) ? [] : ['cedula_frente'])
      : ['cedula_frente', 'cedula_reverso'].filter(function (k) { return !tiene(k); });
    if (!faltan.length) return { mostrar: false, por: 'completa' };
    return { mostrar: true, faltan: faltan, pasaporte: pasaporte,
             conCodigo: j.cedula_con_codigo === true, sensibles: j.sensibles === true };
  }

  /** Lo que falta, en palabras, para «falta …». */
  function queFaltaTexto(p) {
    if (!p || !p.faltan) return '';
    if (p.pasaporte) return 'la foto de tu pasaporte (la página con tu foto)';
    if (p.faltan.length > 1) return 'la foto de tu cédula, por los dos lados';
    return p.faltan[0] === 'cedula_frente'
      ? 'la foto del frente de tu cédula (el lado con tu foto)'
      : 'la foto del respaldo de tu cédula (el lado del código de barras)';
  }
  function nombreDelLado(k, pasaporte) {
    if (pasaporte) return { titulo: 'Tu pasaporte', ayuda: 'la página con tu foto' };
    return k === 'cedula_frente'
      ? { titulo: 'El frente', ayuda: 'el lado con tu foto' }
      : { titulo: 'El respaldo', ayuda: 'el lado del código de barras' };
  }

  /**
   * Qué le pasó a UNA foto, según lo que contestó registro_archivos_guardar:
   * 'ok' | 'descartada' (la reja: hay una con código) | 'rechazada' (muy
   * grande o no era imagen) | 'freno' | 'lleno' (la rama registro-tope:
   * `en_espera`) | 'sin_autorizacion' | 'sesion' (ok:false sin motivo: la
   * base no vio sesión) | 'no_entro' (cualquier otra cosa).
   */
  function resultadoDe(j, tipo) {
    if (!j || typeof j !== 'object') return 'no_entro';
    if (j.ok === false) {
      if (j.motivo === 'sin_autorizacion') return 'sin_autorizacion';
      return j.motivo ? 'no_entro' : 'sesion';
    }
    if (j.ok !== true) return 'no_entro';
    var en = function (l) {
      return Array.isArray(l) && l.some(function (x) { return x === tipo || (x && typeof x === 'object' && x.tipo === tipo); });
    };
    if (en(j.guardados)) return 'ok';
    if (en(j.descartados)) return 'descartada';
    if (en(j.rechazadas)) return 'rechazada';
    var espera = Array.isArray(j.en_espera)
      ? j.en_espera.filter(function (x) { return x && x.tipo === tipo; })[0] : null;
    if (espera) return espera.motivo === 'freno' ? 'freno' : 'lleno';
    /* Una base de antes del 21-sep no traía `guardados`: se cae al número. */
    if (!Array.isArray(j.guardados) && Number(j.fotos) > 0) return 'ok';
    return 'no_entro';
  }

  var TEXTOS = {
    descartada: 'Esa foto no la pudimos guardar: ya tenemos tu cédula leída por su código de barras, ' +
      'y una foto sin ese código no la reemplaza. Mándala por el chat de la app.',
    rechazada: 'No pudimos usar esa foto. Tómala otra vez, con luz y de cerca, o elige otra de tu galería.',
    freno: 'Subiste fotos muchas veces seguidas. Espera unos minutos y vuelve a intentar.',
    lleno: 'Ahora mismo no podemos recibir fotos (no es tu teléfono ni tu internet). ' +
      'Vuelve a intentar más tarde, o mándala por el chat de la app.',
    no_entro: 'No pudimos guardar esa foto. Vuelve a intentar en un momento.',
    foto: 'No pude abrir esa foto. Tómala otra vez, o elige otra de tu galería.',
    red: 'No pude conectarme, y la foto no se guardó. Revisa tu internet y vuelve a intentar.',
    apagado: 'Todavía no podemos recibir fotos desde aquí (no es tu teléfono ni tu internet). ' +
      'Mándala por el chat de la app.',
    sesion: 'Se cerró tu sesión. Entra otra vez y vuelve a intentar.'
  };

  /**
   * La constancia que se guarda en la cuenta (PUT /auth/v1/user, data), como
   * guardarLaConstancia de play/: `autorizacion` es la de ahora y
   * `autorizaciones` el historial anterior más la de ahora, sin borrar
   * ninguna. La versión y la forma salen de app/cuenta.js (armarAutorizacion),
   * la misma de play/. `general` NO se afirma aquí: se copia de la que ya
   * tiene la cuenta (la dio al abrirla), porque en esta pantalla solo marcó la
   * de los datos sensibles.
   */
  function constancia(meta, U, momento) {
    var m = (meta && typeof meta === 'object') ? meta : {};
    var prev = (m.autorizacion && typeof m.autorizacion === 'object') ? m.autorizacion : null;
    var aut = U.armarAutorizacion(momento, true);
    aut.general = !!(prev && prev.general === true);
    var antes = Array.isArray(m.autorizaciones) ? m.autorizaciones.slice() : [];
    if (prev && !antes.some(function (x) { return x && x.momento === prev.momento; })) antes.push(prev);
    return { autorizacion: aut, autorizaciones: antes.concat([aut]) };
  }

  /* La compresión, en un navegador: la de comprimirVarias de play/ con un solo
     tamaño. Por createObjectURL y no como texto (9-sep-2026, play/: leer el
     archivo como base64 pesaba lo que tumbaba la pestaña). play/ le pasa la
     suya (comprimirImagen) en `comprimir`. */
  function comprimirEnElNavegador(file) {
    return new Promise(function (res, rej) {
      var url;
      try { url = URL.createObjectURL(file); } catch (e) { return rej(e); }
      var img = new Image();
      var soltar = function () {
        try { URL.revokeObjectURL(url); } catch (e) { /* nada */ }
        img.onload = img.onerror = null;
      };
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          if (!w || !h) throw new Error('imagen vacía');
          if (w > h && w > LADO_MAXIMO) { h = h * LADO_MAXIMO / w; w = LADO_MAXIMO; }
          else if (h >= w && h > LADO_MAXIMO) { w = w * LADO_MAXIMO / h; h = LADO_MAXIMO; }
          var c = document.createElement('canvas');
          c.width = Math.round(w); c.height = Math.round(h);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', CALIDAD);
          /* El lienzo se suelta a mano (en algunos Android se queda con la
             memoria del mapa de bits hasta la siguiente recolección). */
          c.width = c.height = 1;
          soltar();
          res(out);
        } catch (e) { soltar(); rej(e); }
      };
      img.onerror = function () { soltar(); rej(new Error('no pude abrir esa imagen')); };
      img.src = url;
    });
  }

  /**
   * El controlador de la tarjeta. `o`:
   *   U              app/cuenta.js (armarAutorizacion);
   *   rpc(fn, cuerpo) → promesa; rechaza con {causa} o como play/;
   *   credenciales() → promesa de {url, anon, token} (o null sin sesión);
   *   fetch          opcional; el de la ventana si no;
   *   escritura(p)   → p, contándola como escritura en camino;
   *   quien()        → el celular de la sesión; una respuesta que llega
   *                    cuando ya es otro se calla;
   *   caja()         → donde se pinta la tarjeta (#faltaCedula);
   *   porId(id)      → un elemento de la página;
   *   comprimir(f)   → opcional: promesa del data URL (la de play/);
   *   ficha()        → opcional: perfil.datos de la ficha (cuenta junta);
   *   enCamino()     → opcional: true si las fotos del registro esperan en la
   *                    cola de este teléfono;
   *   almacen()      → opcional: localStorage, para «Ya la mandé»;
   *   irAlChat()     → opcional: cómo se va al chat de la app;
   *   alCambiar()    → opcional: cada vez que cambia lo que se sabe;
   *   textoVencida   → lo que se dice si la sesión ya no vale;
   *   nombre         → el global con que la página expone el controlador.
   */
  function crear(o) {
    o = o || {};
    var NOMBRE = /^[A-Za-z_$][\w$]*$/.test(String(o.nombre || '')) ? String(o.nombre) : 'FLC';
    var porId = function (id) { try { return o.porId ? o.porId(id) : null; } catch (e) { return null; } };
    var quien = function () { try { return String((o.quien && o.quien()) || ''); } catch (e) { return ''; } };
    var escritura = function (p) { try { return o.escritura ? o.escritura(p) : p; } catch (e) { return p; } };
    var vencida = o.textoVencida || TEXTOS.sesion;

    /* Lo que contestó la base: 'sin_preguntar' | 'ok' | 'apagado' | 'error' |
       'sesion'. `de` es de quién es la respuesta. */
    var st = { estado: 'sin_preguntar', j: null, de: '' };
    /* La tarjeta: 'aviso' | 'permiso' | 'fotos' | 'listo'. `ctx` es dónde
       está pintada ('' en Inicio y en la cuenta sin juntar; 'antes_de_pedir'
       justo antes de mandar una solicitud). */
    var ui = nuevaUi();
    var HECHAS = {}, POR_CHAT = {}, turno = 0;
    function nuevaUi() {
      return { modo: 'aviso', ctx: '', permiso: false, guardando: false, error: '', subiendo: {}, notas: {}, hecho: '' };
    }

    function avisarCambio() { if (o.alCambiar) { try { o.alCambiar(); } catch (e) { /* lo de al lado se queda */ } } }
    function ficha() { try { return o.ficha ? o.ficha() : null; } catch (e) { return null; } }
    function enCamino() { try { return !!(o.enCamino && o.enCamino()); } catch (e) { return false; } }
    function almacen() { try { return o.almacen ? o.almacen() : null; } catch (e) { return null; } }

    function yaLaMandoPorChat() {
      var q = quien();
      if (!q) return false;
      if (POR_CHAT[q]) return true;
      var a = almacen();
      try { return !!(a && a.getItem(LLAVE_POR_CHAT + q) === '1'); } catch (e) { return false; }
    }
    function planActual() {
      if (st.estado !== 'ok' || st.de !== quien()) return { mostrar: false, por: 'no_se' };
      return plan(st.j, ficha(), HECHAS);
    }
    /** ¿Se avisa? Solo con una respuesta de la base, de ESTA cuenta. */
    function debeAvisar() {
      var p = planActual();
      return !!(p.mostrar && !yaLaMandoPorChat() && !enCamino());
    }

    /* ---------------------------------------------------------- leer */
    function cargar() {
      var t = ++turno, q = quien();
      var p;
      try { p = o.rpc(FUNCION, {}); } catch (e) { p = Promise.reject({ causa: 'red' }); }
      return Promise.resolve(p).then(function (j) {
        if (t !== turno || q !== quien()) return st;
        if (!j || j.ok !== true || !j.fotos || typeof j.fotos !== 'object') { st = { estado: 'error', j: null, de: q }; return st; }
        st = { estado: 'ok', j: j, de: q };
        return st;
      }, function (e) {
        if (t !== turno || q !== quien()) return st;
        var c = causaDe(e);
        st = { estado: c === 'apagado' ? 'apagado' : c === 'sesion' ? 'sesion' : 'error', j: null, de: q };
        return st;
      });
    }

    /* ---------------------------------------------------------- pintar */
    function boton(accion, texto, clase, extra) {
      return '<button type="button" class="btn ' + (clase || '') + '"' + (extra || '') +
        ' onclick="' + NOMBRE + '.' + accion + '">' + esc(texto) + '</button>';
    }
    function textoSubir(p) { return p.pasaporte ? 'Subir la foto de mi pasaporte' : 'Subir mi cédula'; }

    function tarjetaAviso(p) {
      var antes = ui.ctx === 'antes_de_pedir';
      return '<div class="card" id="flcTarjeta">' +
        (antes ? '<div class="etq">Antes de mandar tu solicitud</div>' : '') +
        '<div class="aviso ambar"' + (antes ? '' : ' style="margin-top:0"') + ' role="status"><b>Tu información está incompleta:</b> falta ' +
          esc(queFaltaTexto(p)) + '.</div>' +
        '<p class="sub">No es obligatoria: ' +
          (antes ? 'puedes mandar tu solicitud igual. ' : 'tu cuenta y tus solicitudes siguen igual sin ella. ') +
          'Con ella confirmamos más rápido que eres tú.</p>' +
        (p.conCodigo
          /* La reja de la base no dejaría guardar una foto sin código al lado
             de la que entró con él: el chat, que sí la recibe. */
          ? '<p class="sub">Como ya tenemos el otro lado leído por su código de barras, esta foto no la podemos ' +
            'guardar desde aquí: mándala por el chat de la app.</p>' +
            (o.irAlChat ? boton('alChat()', 'Mandarla por el chat', 'arriba') : '')
          : boton('abrir()', textoSubir(p), 'arriba')) +
        '<p class="sub" style="margin-top:var(--e3)">¿Ya nos la mandaste por el chat? Entonces no tienes que hacer nada.</p>' +
        boton('yaLaMande()', 'Ya la mandé por el chat', 'sec sm', ' style="margin-top:var(--e2)"') +
      '</div>';
    }

    /* EL PERMISO, APARTE Y SIN MARCAR. La frase en negrita es la de la casilla
       de play/ (pasoPermiso), letra por letra; lo de debajo cambia «se abre
       igual» por «sigue igual», porque la cuenta ya está abierta. */
    function tarjetaPermiso(p) {
      return '<div class="card" id="flcTarjeta">' +
        '<h3 class="tit">Antes de la foto, tu permiso</h3>' +
        '<p class="sub">La foto de tu ' + (p.pasaporte ? 'pasaporte' : 'cédula') + ' es un dato sensible, y para guardarla ' +
          'necesitamos tu permiso, aparte. Es opcional de verdad: si no lo das, tu cuenta y tus solicitudes siguen igual.</p>' +
        '<label class="permiso"><input type="checkbox" id="flcPermiso" onchange="' + NOMBRE + '.marcarPermiso(this.checked)"' +
          (ui.permiso ? ' checked' : '') + '><span>' +
          'Autorizo también la foto de mi cédula, la de mi rostro y mi ubicación.' +
          '<span class="muted">Esto es aparte y es opcional: tu cuenta sigue igual sin marcarlo. ' +
          'La ley no permite condicionarte el servicio a que lo des.</span></span></label>' +
        '<div class="ayuda" style="margin-top:var(--e3)"><a href="../legal/privacidad.html" target="_blank" rel="noopener">' +
          'Leer la política de datos</a></div>' +
        boton('guardarPermiso()', ui.guardando ? 'Guardando tu permiso…' : 'Doy mi permiso y sigo', 'arriba',
              ' id="flcGuardarPermiso"' + (ui.guardando ? ' disabled' : '')) +
        boton('cerrar()', 'Ahora no', 'sec sm', ' style="margin-top:var(--e3)"') +
        '<div id="flcError" class="aviso ambar' + (ui.error ? '' : ' oculto') + '" role="status">' + esc(ui.error) + '</div>' +
      '</div>';
    }

    function filaDelLado(k, p) {
      var n = nombreDelLado(k, p.pasaporte), id = 'flcFoto_' + k, sube = !!ui.subiendo[k], nota = ui.notas[k] || '';
      return '<div style="margin-top:var(--e4)">' +
        '<b>' + esc(n.titulo) + '</b> <span class="muted">(' + esc(n.ayuda) + ')</span>' +
        /* Sin `capture`, a propósito (como la foto del chat): el teléfono deja
           escoger entre la cámara y la galería. */
        '<input type="file" id="' + id + '" accept="image/*" class="oculto" onchange="' + NOMBRE + '.foto(this, \'' + k + '\')">' +
        '<button type="button" class="btn sm" id="flcBoton_' + k + '" style="margin-top:var(--e2)"' + (sube ? ' disabled' : '') +
          ' onclick="document.getElementById(&quot;' + id + '&quot;).click()">' +
          (sube ? 'Subiendo…' : '📷 Tomar o elegir la foto') + '</button>' +
        '<div id="flcNota_' + k + '" class="aviso ambar' + (nota ? '' : ' oculto') + '" role="status">' + esc(nota) + '</div>' +
      '</div>';
    }
    function tarjetaFotos(p) {
      return '<div class="card" id="flcTarjeta">' +
        '<h3 class="tit">' + (p.pasaporte ? 'La foto de tu pasaporte' : 'La foto de tu cédula') + '</h3>' +
        (ui.hecho ? '<div class="aviso info" style="margin-top:var(--e2)" role="status">' + esc(ui.hecho) + '</div>' : '') +
        '<p class="sub">Tómala con la cámara o elígela de tu galería. Que se lea bien: con luz, de cerca y sin reflejos.</p>' +
        p.faltan.map(function (k) { return filaDelLado(k, p); }).join('') +
        boton('cerrar()', 'Ahora no', 'sec sm', ' style="margin-top:var(--e4)"') +
      '</div>';
    }
    function tarjetaListo() {
      return '<div class="card" id="flcTarjeta"><div class="aviso info" style="margin-top:0" role="status">' +
        '<b>Listo: recibimos tu foto.</b> Gracias: con ella confirmamos más rápido que eres tú. No tienes que hacer nada más.</div>' +
        boton('entendido()', 'Entendido', 'sec sm', ' style="margin-top:var(--e3)"') +
      '</div>';
    }

    /** La tarjeta. `ctx` (opcional) dice dónde va: '' o 'antes_de_pedir'. */
    function html(ctx) {
      if (ctx !== undefined) ui.ctx = String(ctx || '');
      if (ui.modo === 'listo' && st.de === quien()) return tarjetaListo();
      if (!debeAvisar()) return '';
      var p = planActual();
      if (p.conCodigo) return tarjetaAviso(p);
      if (ui.modo === 'permiso') return tarjetaPermiso(p);
      if (ui.modo === 'fotos') return tarjetaFotos(p);
      return tarjetaAviso(p);
    }
    /** Una línea para la tarjeta de la propuesta: avisa, y aceptar sigue igual. */
    function lineaPropuesta() {
      if (!debeAvisar()) return '';
      var p = planActual();
      return '<div class="aviso ambar" role="status"><b>Falta ' + esc(queFaltaTexto(p)) + '.</b> ' +
        'No es obligatoria: puedes aceptar igual.' + (p.conCodigo ? ' Si quieres, mándala por el chat de la app.' : '') + '</div>' +
        (p.conCodigo ? '' : boton('abrir()', textoSubir(p), 'sec sm', ' style="margin-top:var(--e2)"'));
    }
    function pintar() {
      var c = null; try { c = o.caja ? o.caja() : null; } catch (e) { c = null; }
      if (c) c.innerHTML = html();
      var l = porId('flcEnPropuesta'); if (l) l.innerHTML = lineaPropuesta();
      avisarCambio();
    }
    /* Lo que dice UNA fila mientras sube, sin repintar la tarjeta (el botón de
       la otra foto no se mueve debajo del dedo). */
    function decirEnLaFila(k, texto, sube) {
      var n = porId('flcNota_' + k);
      if (n) {
        n.textContent = texto;
        if (n.classList) { if (texto) n.classList.remove('oculto'); else n.classList.add('oculto'); }
      }
      var b = porId('flcBoton_' + k);
      if (b) { b.disabled = !!sube; if (sube) b.textContent = 'Subiendo…'; }
    }

    /* ---------------------------------------------------------- lo que toca */
    function abrir() {
      if (!debeAvisar()) return;
      var p = planActual();
      if (p.conCodigo) return alChat();
      ui.modo = p.sensibles ? 'fotos' : 'permiso';
      ui.error = '';
      pintar();
      var c = null; try { c = o.caja ? o.caja() : null; } catch (e) { c = null; }
      try { if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* nada */ }
    }
    function cerrar() {
      if (ui.guardando) return;
      ui.modo = 'aviso'; ui.error = ''; ui.permiso = false;
      pintar();
    }
    function entendido() { ui.modo = 'aviso'; ui.hecho = ''; pintar(); }
    function alChat() { if (o.irAlChat) { try { o.irAlChat(); } catch (e) { /* se queda donde está */ } } }
    function yaLaMande() {
      var q = quien();
      if (!q) return;
      POR_CHAT[q] = true;
      var a = almacen();
      try { if (a) a.setItem(LLAVE_POR_CHAT + q, '1'); } catch (e) { /* modo privado: queda en memoria */ }
      ui = nuevaUi();
      pintar();
    }
    function marcarPermiso(si) {
      ui.permiso = !!si;
      if (si && ui.error) { ui.error = ''; var e = porId('flcError'); if (e && e.classList) e.classList.add('oculto'); }
    }

    /* PUT /auth/v1/user, como guardarLaConstancia de play/, pero antes un GET
       para no perder el historial: la sesión de esta app no guarda lo que
       dice la cuenta. Nunca rechaza: true, o {causa}. */
    function pedirAuth(cr, metodo, cuerpo) {
      var f = o.fetch || (typeof fetch === 'function' ? fetch : null);
      if (!f) return Promise.reject({ causa: 'red' });
      var p;
      try {
        p = f(String(cr.url).replace(/\/+$/, '') + '/auth/v1/user', {
          method: metodo,
          headers: { 'Content-Type': 'application/json', apikey: cr.anon, Authorization: 'Bearer ' + cr.token },
          body: cuerpo == null ? undefined : JSON.stringify(cuerpo)
        });
      } catch (e) { return Promise.reject({ causa: 'red' }); }
      return Promise.resolve(p).then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
          return { ok: !!r.ok, estado: r.status, j: j };
        });
      }, function () { return Promise.reject({ causa: 'red' }); });
    }
    function guardarPermiso() {
      if (ui.guardando) return;
      var e0 = porId('flcPermiso'); if (e0 && typeof e0.checked === 'boolean' && e0.checked) ui.permiso = true;
      if (!ui.permiso) { ui.error = 'Marca la casilla para seguir, o toca «Ahora no».'; pintar(); return; }
      if (!o.U || typeof o.U.armarAutorizacion !== 'function') {
        ui.error = 'No cargó una parte de la app. Cierra y vuelve a abrirla con internet.'; pintar(); return;
      }
      var q = quien();
      ui.guardando = true; ui.error = '';
      pintar();
      var cadena = Promise.resolve(o.credenciales ? o.credenciales() : null).then(function (cr) {
        if (!cr || !cr.token || !cr.url || !cr.anon) throw { causa: 'sesion' };
        return pedirAuth(cr, 'GET').then(function (r) {
          if (r.estado === 401 || r.estado === 403) throw { causa: 'sesion' };
          if (!r.ok || !r.j || typeof r.j !== 'object') throw { causa: 'rechazada' };
          var meta = (r.j.user_metadata && typeof r.j.user_metadata === 'object') ? r.j.user_metadata : {};
          var datos = constancia(meta, o.U, new Date().toISOString());
          return pedirAuth(cr, 'PUT', { data: datos }).then(function (r2) {
            if (r2.estado === 401 || r2.estado === 403) throw { causa: 'sesion' };
            if (!r2.ok) throw { causa: 'rechazada' };
            return true;
          });
        });
      });
      escritura(cadena).then(function () {
        ui.guardando = false;
        if (q !== quien()) return;
        if (st.j) st.j.sensibles = true;
        ui.modo = 'fotos'; ui.permiso = false; ui.error = '';
        pintar();
      }, function (e) {
        ui.guardando = false;
        if (q !== quien()) return;
        var c = e && e.causa;
        /* «No volvió» no es «no se guardó» (play/, I4): se dice lo que se sabe,
           y no se sube nada sin confirmarlo. */
        ui.error = c === 'sesion' ? vencida
          : c === 'rechazada' ? 'No pudimos guardar tu permiso. Vuelve a intentar en un momento.'
          : 'No pude confirmar que tu permiso quedó guardado (revisa tu internet). Vuelve a tocar el botón: ' +
            'no subimos ninguna foto sin él.';
        pintar();
      });
    }

    /* Una foto: se comprime, sube sola, y la fila dice qué pasó. */
    function foto(input, tipo) {
      var archivo = input && input.files && input.files[0];
      /* El campo se suelta ya: así la misma foto se puede volver a elegir, y el
         archivo de la cámara no se queda vivo. */
      try { input.value = ''; } catch (e) { /* nada */ }
      if (!archivo || ui.subiendo[tipo]) return;
      var p = planActual();
      if (!p.mostrar || p.faltan.indexOf(tipo) < 0) return;
      var q = quien();
      ui.subiendo[tipo] = true; ui.notas[tipo] = '';
      decirEnLaFila(tipo, '', true);
      var comprimir = o.comprimir || comprimirEnElNavegador;
      var cadena = Promise.resolve().then(function () { return comprimir(archivo); })
        .then(null, function () { throw { causa: 'foto' }; })
        .then(function (dato) {
          archivo = null;
          if (typeof dato !== 'string' || dato.indexOf('data:image/') !== 0) throw { causa: 'foto' };
          if (q !== quien()) throw { causa: 'otra' };
          var arch = {}; arch[tipo] = dato;
          /* Sin huella: ni ubicación ni lectura. La base anota sola la hora,
             la IP y el aparato, como en cualquier subida. */
          return o.rpc(SUBIDA, { p_archivos: arch, p_huella: {} });
        });
      escritura(cadena).then(function (j) {
        ui.subiendo[tipo] = false;
        if (q !== quien()) return;
        var r = resultadoDe(j, tipo);
        if (r === 'ok') {
          HECHAS[tipo] = true;
          var resto = planActual();
          if (!resto.mostrar) { ui.modo = 'listo'; ui.hecho = ''; }
          else ui.hecho = 'Recibimos ' + (tipo === 'cedula_frente' ? 'el frente' : 'el respaldo') + '. Falta el otro lado.';
          pintar();
          return;
        }
        if (r === 'sin_autorizacion') {
          if (st.j) st.j.sensibles = false;
          ui.modo = 'permiso'; ui.error = 'Para guardar la foto necesitamos primero tu permiso.';
          pintar();
          return;
        }
        ui.notas[tipo] = r === 'sesion' ? vencida : TEXTOS[r] || TEXTOS.no_entro;
        pintar();
      }, function (e) {
        ui.subiendo[tipo] = false;
        if (q !== quien()) return;
        var c = causaDe(e);
        if (c === 'otra') return;
        ui.notas[tipo] = c === 'sesion' ? vencida : TEXTOS[c] || TEXTOS.red;
        pintar();
      });
    }

    /** ¿Hay algo a medias que una recarga se llevaría? El permiso marcado sin
     *  guardar, una foto subiendo, y también el paso de las fotos abierto: con
     *  la cámara del sistema la página queda oculta, que es justo cuando SE
     *  ACTUALIZA SOLA recarga, y la foto se perdería al volver. «Ahora no» lo
     *  suelta. */
    function aMedias() {
      if (ui.guardando) return true;
      if (Object.keys(ui.subiendo).some(function (k) { return ui.subiendo[k]; })) return true;
      if (ui.modo === 'fotos' && debeAvisar()) return true;
      return ui.modo === 'permiso' && ui.permiso;
    }
    /** «Salir»: nada de esta cuenta se queda para la siguiente. */
    function soltar() {
      turno++;
      st = { estado: 'sin_preguntar', j: null, de: '' };
      ui = nuevaUi(); HECHAS = {}; POR_CHAT = {};
    }

    return {
      cargar: cargar, html: html, pintar: pintar, lineaPropuesta: lineaPropuesta, debeAvisar: debeAvisar,
      abrir: abrir, cerrar: cerrar, entendido: entendido, alChat: alChat, yaLaMande: yaLaMande,
      marcarPermiso: marcarPermiso, guardarPermiso: guardarPermiso, foto: foto,
      aMedias: aMedias, soltar: soltar,
      /* Para las pruebas y para quien quiera saber en qué va. */
      estado: function () { return { estado: st.estado, de: st.de, modo: ui.modo, plan: planActual() }; }
    };
  }

  return {
    VERSION: '2026-11-13',
    LADO_MAXIMO: LADO_MAXIMO, CALIDAD: CALIDAD,
    FUNCION: FUNCION, SUBIDA: SUBIDA, LECTURAS: LECTURAS.slice(),
    plan: plan, queFaltaTexto: queFaltaTexto, resultadoDe: resultadoDe, constancia: constancia,
    TEXTOS: TEXTOS,
    crear: crear
  };
});
