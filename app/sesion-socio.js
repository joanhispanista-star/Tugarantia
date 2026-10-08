/* ============================================================================
 * LA SESIÓN DEL SOCIO — celular y contraseña. 7 de octubre de 2026.
 *
 * Joan, el 7-oct: «¿Por qué cada cliente necesita un código? Eso ya no
 * debería existir. Quiero que todos se registren igual y que el CRM detecte si
 * es un cliente antiguo o nuevo.»
 *
 * Desde hoy app/socio.html tiene UNA puerta: «Entrar» con celular y contraseña
 * —la misma cuenta de Supabase Auth que crea play/ al registrarse— y
 * «Registrarme». Este archivo es todo lo que esa puerta habla con la nube, sin
 * DOM, para poder probarlo en node (pruebas/una-puerta-socio.test.js).
 *
 * LO QUE LA PUERTA SABE Y LO QUE NO
 *   · Supabase contesta lo MISMO para «ese celular no tiene cuenta» y para «la
 *     contraseña no es»: y está bien, distinguirlo sería un oráculo de quién es
 *     cliente. La pantalla dice las dos salidas en una frase (TEXTOS.datos).
 *   · Tener cuenta NO es ver el historial. mi_cuenta() lo devuelve solo si Joan
 *     juntó esa cuenta con la ficha (base/20261007_una_puerta.sql); si no, la
 *     respuesta es «vinculada: false» y la pantalla lo explica con el estado
 *     real del registro (mi_registro), no con un «lo estamos revisando» de
 *     cajón.
 *
 * DÓNDE SE GUARDA LA SESIÓN, Y POR QUÉ EN localStorage
 *   Joan pidió el 20-ago que la app «se quede abierta, como cualquier app de
 *   verdad: nadie teclea su clave cada mañana». Por eso la sesión (el token y
 *   el token de renovar) vive en localStorage —es lo que hace la librería de
 *   Supabase por defecto— y «Salir» la borra y le avisa al servidor. play/ usa
 *   sessionStorage a propósito (es la puerta de registro, se abre en
 *   teléfonos prestados); si este navegador trae una sesión de play/ en la
 *   misma pestaña, se usa para no pedir entrar dos veces.
 *   Con la sesión va el último paquete que contestó la nube: abrir la app en
 *   el bus sin datos es el caso normal, y se ven los números de la última vez
 *   CON su fecha.
 *
 * LA SESIÓN DE CÓDIGO DE ANTES SE BORRA AL ARRANCAR (LLAVE_VIEJA). Si se
 * quedara, la app vieja la leería, la nube le contestaría 401 (la función del
 * código ya no es de la llave pública), lo tomaría por «sin red» y mostraría
 * para siempre el paquete guardado como si fuera de hoy.
 * 7-oct-2026 (segunda vuelta) — PERO SE AVISA. Borrarla en silencio dejaba al
 * cliente que tenía la app «abierta» frente a un formulario de contraseña que
 * nunca tuvo (los de antes del 24-ago nunca se registraron). teniaSesionVieja
 * se lee ANTES de borrar, y la pantalla le dice qué cambió y qué hacer
 * (TEXTOS.cambioDePuerta).
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./cuenta.js'));
  } else {
    raiz.SesionSocio = fabrica(raiz.CuentaSocio);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U) {
  'use strict';

  var LLAVE = 'socio_cuenta';
  var LLAVE_VIEJA = 'socio_sesion';
  var LLAVE_PLAY = 'play_sesion';
  /* Se renueva un minuto antes de que venza: un token que vence en el aire
     convierte una consulta buena en un 401. */
  var MARGEN_MS = 60000;

  /* Lo que ve el cliente, en un solo sitio. Las pruebas leen estos textos: si
     alguien escribe «tu código» acá, se cae una prueba antes que un cliente. */
  var TEXTOS = {
    datos: 'Esos datos no nos abren una cuenta. Si no te has registrado, toca «Registrarme»; ' +
      'si olvidaste la contraseña, toca «Olvidé mi contraseña».',
    red: 'No pude conectarme. Revisa que tengas internet y vuelve a intentar.',
    muchos: 'Hubo muchos intentos seguidos desde este teléfono. Espera unos minutos y vuelve a probar.',
    vencida: 'Tu sesión se venció. Entra otra vez con tu celular y tu contraseña.',
    apagado: 'Esta parte todavía no está encendida en la nube. No es tu teléfono ni tu internet: ' +
      'escríbenos por WhatsApp y te contamos.',
    celular: 'Nos falta tu celular completo: son 10 números y empiezan por 3.',
    clave: 'Nos falta tu contraseña.',
    /* 7-oct-2026 (segunda vuelta) — para quien tenía la app abierta con el
       código de antes. No promete el historial en el acto: aparece cuando
       revisamos que sea él (textoSinJuntar). */
    cambioDePuerta: 'Cambiamos cómo se entra: ya no se usa el código. Si ya te registraste, entra con tu celular y tu ' +
      'contraseña. Si nunca te registraste, toca «Registrarme»: tu historial no se pierde, lo juntamos con tu cuenta ' +
      'cuando revisemos que eres tú.'
  };

  function base(cfg) { return String((cfg && cfg.url) || '').replace(/\/+$/, ''); }
  function red(cfg) { return (cfg && cfg.fetch) || (typeof fetch === 'function' ? fetch : null); }
  function ahora(cfg) { return (cfg && cfg.ahora) ? cfg.ahora() : Date.now(); }

  /* El celular de la sesión sale del correo interno con la MISMA forma que
     exige el servidor (celular_de_sesion): si no la cumple, no hay celular. */
  function celularDeCorreo(correo) {
    var m = /^57([0-9]{10})@tugarantia\.net$/.exec(String(correo || '').trim().toLowerCase());
    return m ? m[1] : '';
  }

  /* De lo que contesta /auth/v1/token a lo que se guarda. */
  function armar(j, ms) {
    if (!j || !j.access_token) return null;
    var expira = Number(j.expires_at) ? Number(j.expires_at) * 1000
      : (Number(j.expira_en) || (ms + (Number(j.expires_in) || 3600) * 1000));
    return {
      access_token: String(j.access_token),
      refresh_token: String(j.refresh_token || ''),
      expira_en: expira,
      celular: celularDeCorreo(j.user && j.user.email) || String(j.celular || '')
    };
  }

  function vigente(s, ms) { return !!(s && s.access_token && Number(s.expira_en) - MARGEN_MS > ms); }

  /* ------------------------------------------------------------- guardar */
  function leer(almacen) {
    try {
      var s = JSON.parse((almacen && almacen.getItem(LLAVE)) || 'null');
      return (s && s.access_token) ? s : null;
    } catch (e) { return null; }
  }
  function guardar(almacen, s) {
    if (!almacen || !s || !s.access_token) return false;
    try { almacen.setItem(LLAVE, JSON.stringify(s)); return true; } catch (e) { return false; }
  }
  function borrar(almacen) { try { if (almacen) almacen.removeItem(LLAVE); } catch (e) { /* nada */ } }
  function borrarVieja(almacen) { try { if (almacen) almacen.removeItem(LLAVE_VIEJA); } catch (e) { /* nada */ } }
  /* ¿Había una sesión de código de antes? Se pregunta ANTES de borrarla. */
  function teniaSesionVieja(almacen) {
    try { return !!(almacen && almacen.getItem(LLAVE_VIEJA)); } catch (e) { return false; }
  }

  /* La sesión que dejó play/ en esta pestaña (sessionStorage, mismo origen).
     Viene con la forma de Supabase; se traduce a la de acá. */
  function deSesionDePlay(almacenSesion, ms) {
    try {
      var j = JSON.parse((almacenSesion && almacenSesion.getItem(LLAVE_PLAY)) || 'null');
      return armar(j, ms || Date.now());
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------- la red */
  function auth(cfg, ruta, metodo, cuerpo, token) {
    var pedir = red(cfg);
    if (!base(cfg) || !cfg.anon || !pedir) return Promise.reject({ causa: 'red' });
    var cab = { 'Content-Type': 'application/json', apikey: cfg.anon };
    if (token) cab.Authorization = 'Bearer ' + token;
    return pedir(base(cfg) + '/auth/v1/' + ruta, {
      method: metodo, headers: cab, body: cuerpo == null ? undefined : JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        return { ok: r.ok, estado: r.status, j: j };
      });
    }, function () { return Promise.reject({ causa: 'red' }); });
  }

  /** Entrar. Nunca rechaza: contesta {ok, sesion} o {ok:false, motivo}. */
  function entrar(cfg, celular, clave) {
    var tel = U && U.normalizarTelefono ? U.normalizarTelefono(celular) : null;
    if (!tel) return Promise.resolve({ ok: false, motivo: 'celular' });
    if (!clave) return Promise.resolve({ ok: false, motivo: 'clave' });
    return auth(cfg, 'token?grant_type=password', 'POST',
      { email: U.correoDeTelefono(tel), password: String(clave) })
      .then(function (r) {
        if (r.ok) {
          var s = armar(r.j, ahora(cfg));
          return s ? { ok: true, sesion: s } : { ok: false, motivo: 'red' };
        }
        if (r.estado === 429) return { ok: false, motivo: 'muchos' };
        if (r.estado >= 500) return { ok: false, motivo: 'red' };
        /* 400 «Invalid login credentials»: no se dice cuál de los dos falló. */
        return { ok: false, motivo: 'datos' };
      }, function () { return { ok: false, motivo: 'red' }; });
  }

  /** Renueva con el refresh_token. Rechaza {causa:'sesion'} si ya no sirve. */
  function refrescar(cfg, s) {
    if (!s || !s.refresh_token) return Promise.reject({ causa: 'sesion' });
    return auth(cfg, 'token?grant_type=refresh_token', 'POST', { refresh_token: s.refresh_token })
      .then(function (r) {
        if (r.ok) {
          var n = armar(r.j, ahora(cfg));
          if (n) { if (!n.celular) n.celular = s.celular; return n; }
        }
        if (r.estado >= 500) return Promise.reject({ causa: 'red' });
        return Promise.reject({ causa: 'sesion' });
      });
  }

  /** Una función de la base con la sesión del socio. Rechaza con {causa}:
   *  'sesion' (401/403: hay que volver a entrar), 'apagado' (404: falta
   *  correr una migración), 'red'. */
  function rpc(cfg, s, fn, cuerpo) {
    var pedir = red(cfg);
    if (!base(cfg) || !cfg.anon || !pedir) return Promise.reject({ causa: 'red' });
    if (!s || !s.access_token) return Promise.reject({ causa: 'sesion' });
    return pedir(base(cfg) + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anon,
                 Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify(cuerpo || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        if (r.status === 401 || r.status === 403) throw { causa: 'sesion', estado: r.status };
        if (r.status === 404) throw { causa: 'apagado', estado: 404 };
        if (!r.ok) throw { causa: 'red', estado: r.status };
        try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
      });
    }, function () { throw { causa: 'red' }; });
  }

  /** Lo mismo, pero renovando la sesión si hace falta (antes, si está por
   *  vencer; y una vez más si la base contesta 401). `alRenovar(nueva)` es
   *  quien la guarda: este archivo no decide dónde. */
  function conSesion(cfg, s, fn, cuerpo, alRenovar) {
    var actual = s, renovada = false;
    /* Una sola renovación por llamada: si el token de renovar ya no sirve,
       insistir no lo arregla y gasta el tope de intentos de Supabase. */
    var renovar = function () {
      renovada = true;
      return refrescar(cfg, actual).then(function (n) {
        actual = n;
        if (typeof alRenovar === 'function') { try { alRenovar(n); } catch (e) { /* nada */ } }
        return n;
      });
    };
    var primero = vigente(actual, ahora(cfg)) ? Promise.resolve(actual) : renovar();
    return primero.then(function (x) { return rpc(cfg, x, fn, cuerpo); })
      .catch(function (e) {
        if (!e || e.causa !== 'sesion' || renovada) throw e;
        return renovar().then(function (x) { return rpc(cfg, x, fn, cuerpo); });
      });
  }

  /** ¿Qué ve esta cuenta? {estado:'junta', paquete} o {estado:'sin_juntar'}. */
  function miCuenta(cfg, s, alRenovar) {
    return conSesion(cfg, s, 'mi_cuenta', {}, alRenovar).then(function (j) {
      if (!j || j.ok !== true) throw { causa: 'red' };
      if (!j.vinculada) return { estado: 'sin_juntar' };
      return { estado: 'junta', paquete: {
        nombre: j.nombre || 'Socio', datos: j.datos || {}, actualizado_en: j.actualizado_en || null } };
    });
  }

  /** El estado del registro de esta cuenta, para decir la verdad mientras no
   *  está junta: 'nuevo' | 'atendido' | 'descartado' | 'sin_registro' |
   *  'apagado' (la función todavía no está en la nube: 404) | 'no_se' (no se
   *  pudo preguntar).
   *  7-oct-2026 (segunda vuelta) — 'apagado' va aparte de 'no_se' porque
   *  cambia lo que la pantalla puede abrir: sin base/20261007_una_puerta.sql,
   *  el hilo de chat de una cuenta sin juntar todavía es el de la ficha de su
   *  número (llave_de_sesion), y abrírselo sería mostrarle la conversación de
   *  cobranza de otra persona. */
  function miRegistro(cfg, s, alRenovar) {
    return conSesion(cfg, s, 'mi_registro', {}, alRenovar).then(function (j) {
      if (!j || j.ok !== true) return 'no_se';
      if (!j.registro) return 'sin_registro';
      var e = String(j.registro.estado || '');
      return (e === 'nuevo' || e === 'atendido' || e === 'descartado') ? e : 'no_se';
    }, function (e) {
      if (e && e.causa === 'sesion') throw e;
      if (e && e.causa === 'apagado') return 'apagado';
      return 'no_se';
    });
  }

  /** Lo que la pantalla de la cuenta sin juntar dice, según el registro. Es
   *  texto plano: quien lo pinte lo escapa. El último renglón es una promesa
   *  que el servidor cumple: vincular_interna deja el aviso en su chat. */
  function textoSinJuntar(estado) {
    var aviso = 'Te avisamos por este chat cuando esté.';
    if (estado === 'nuevo') {
      return { titulo: 'Tu registro llegó y lo estamos revisando',
        texto: 'Tu cuenta está abierta. Si ya eras cliente, juntamos tu historial con esta cuenta a mano, ' +
          'para que nadie más pueda ver tus datos con tu número. Si eres nuevo, aquí te aparece tu cuenta ' +
          'cuando aprobemos tu registro. ' + aviso };
    }
    if (estado === 'atendido') {
      return { titulo: 'Ya revisamos tu registro',
        texto: 'Nos falta un paso de nuestro lado: juntar esta cuenta con tu ficha. ' + aviso };
    }
    if (estado === 'descartado') {
      return { titulo: 'Revisamos tu registro',
        texto: 'Por ahora no pudimos abrirte la cuenta con nosotros. Si quieres saber por qué, escríbenos por este chat.' };
    }
    /* 7-oct-2026 (segunda vuelta) — no «tus datos no nos llegaron»: la nube
       solo cuenta el registro hecho junto con esta cuenta (a una hora de
       abrirla: mi_registro), y quien se registró un día y abrió la cuenta al
       siguiente —el signup falló y lo reintentó— sí nos dejó su registro. Se
       dice lo que se sabe sin decir de quién es lo que hay con ese número. */
    if (estado === 'sin_registro') {
      return { titulo: 'Tu cuenta está abierta',
        texto: 'No encontramos un registro hecho junto con esta cuenta. Si te registraste antes, en otro intento, ' +
          'escríbenos por este chat y lo buscamos contigo.' };
    }
    if (estado === 'apagado') {
      return { titulo: 'Tu cuenta está abierta',
        texto: 'Estamos terminando de encender esta parte de la app: por ahora no puedes ver tu historial ni ' +
          'escribirnos desde aquí. No es tu teléfono ni tu internet. Escríbenos por WhatsApp y vuelve a mirar en un rato.' };
    }
    return { titulo: 'Tu cuenta está abierta',
      texto: 'Todavía no está junta con tu historial: lo revisamos a mano, para que nadie más pueda ver tus ' +
        'datos con tu número. ' + aviso };
  }

  /** Cambiar la contraseña. Se manda SOLO la contraseña: el correo es la
   *  identidad de la cuenta y la base niega cambiarlo (20260914). */
  function cambiarClave(cfg, s, nueva, alRenovar) {
    var revisa = U && U.revisarContrasena ? U.revisarContrasena(nueva, { telefono: s && s.celular }) : { ok: true };
    if (!revisa.ok) return Promise.resolve({ ok: false, motivo: revisa.motivo });
    var hacer = function (x) {
      return auth(cfg, 'user', 'PUT', { password: String(nueva) }, x.access_token).then(function (r) {
        if (r.ok) return { ok: true };
        if (r.estado === 401 || r.estado === 403) return Promise.reject({ causa: 'sesion' });
        return { ok: false, motivo: (r.j && (r.j.msg || r.j.error_description)) ||
          'No pude cambiar tu contraseña. Vuelve a intentar en un momento.' };
      });
    };
    var listo = vigente(s, ahora(cfg)) ? Promise.resolve(s)
      : refrescar(cfg, s).then(function (n) { if (typeof alRenovar === 'function') alRenovar(n); return n; });
    return listo.then(hacer).catch(function (e) {
      return { ok: false, motivo: e && e.causa === 'sesion' ? TEXTOS.vencida : TEXTOS.red };
    });
  }

  /** «Olvidé mi contraseña»: deja un recado con la llave pública (la ÚNICA
   *  llamada sin sesión de esta puerta, porque el que olvidó la contraseña es
   *  justo el que no puede abrir sesión). Nunca por el chat: el chat pide
   *  sesión (regla de la casa del 22-sep). */
  function pedirAyuda(cfg, celular, nota) {
    var tel = U && U.normalizarTelefono ? U.normalizarTelefono(celular) : null;
    if (!tel) return Promise.resolve({ ok: false, motivo: 'celular' });
    var pedir = red(cfg);
    if (!base(cfg) || !cfg.anon || !pedir) return Promise.resolve({ ok: false, motivo: 'red' });
    return pedir(base(cfg) + '/rest/v1/rpc/pedir_ayuda_clave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon },
      body: JSON.stringify({ p_celular: tel, p_nota: String(nota || '').slice(0, 300) })
    }).then(function (r) {
      if (r.status === 404) return { ok: false, motivo: 'apagado' };
      if (!r.ok) return { ok: false, motivo: 'red' };
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
        if (j && j.ok === true) return { ok: true };
        return { ok: false, motivo: (j && j.motivo) || 'red' };
      });
    }, function () { return { ok: false, motivo: 'red' }; });
  }

  /** Salir: se le avisa al servidor (si no, el token sigue vivo hasta que
   *  venza) y no se espera la respuesta: quedarse adentro porque falló la red
   *  sería lo peor de los dos mundos.
   *  7-oct-2026 (segunda vuelta) — scope=local: sin él, Supabase cierra TODAS
   *  las sesiones de la cuenta (es su valor por defecto), así que salir en un
   *  teléfono sacaba también a PlataChat y a play/ en los otros. */
  function avisarSalida(cfg, s) {
    if (!s || !s.access_token) return;
    try { auth(cfg, 'logout?scope=local', 'POST', null, s.access_token).catch(function () {}); } catch (e) { /* nada */ }
  }

  return {
    LLAVE: LLAVE, LLAVE_VIEJA: LLAVE_VIEJA, LLAVE_PLAY: LLAVE_PLAY, TEXTOS: TEXTOS,
    celularDeCorreo: celularDeCorreo, armar: armar, vigente: vigente,
    leer: leer, guardar: guardar, borrar: borrar, borrarVieja: borrarVieja, teniaSesionVieja: teniaSesionVieja,
    deSesionDePlay: deSesionDePlay,
    entrar: entrar, refrescar: refrescar, rpc: rpc, conSesion: conSesion,
    miCuenta: miCuenta, miRegistro: miRegistro, textoSinJuntar: textoSinJuntar,
    cambiarClave: cambiarClave, pedirAyuda: pedirAyuda, avisarSalida: avisarSalida
  };
});
