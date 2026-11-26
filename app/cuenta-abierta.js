/* ============================================================================
 * LA CUENTA QUEDA ABIERTA EN ESTE TELÉFONO — 26 de noviembre de 2026
 *
 * LO QUE PASABA. Joan mandó una foto del último paso del registro: «Ya tienes
 * una cuenta con este celular, pero esa contraseña no es la suya». Y dijo:
 * «parece que la app les pide contraseña y ya despues no pueden ingresar… es
 * muy problematico y complejo para el cliente… quiero que sea sencillo ingresar
 * y registrarse como en cualquier otra app y que quede guardado el usuario y
 * contraseña en el telefono del cliente para que siempre este abierta y sea
 * facil solicitar o volver a ingresar, que exista algun boton de guardar».
 *
 * La causa no era un daño: play/ guardaba la sesión en sessionStorage A
 * PROPÓSITO (17-sep, pensando en teléfonos prestados). Al cerrar el navegador
 * la cuenta se cerraba; el cliente volvía, no recordaba la contraseña, tocaba
 * «Abrir mi cuenta», llenaba los nueve pasos otra vez y al final se estrellaba
 * contra esa pantalla. La app instalada (app/socio.html) ya se quedaba abierta
 * desde el 20-ago; la página por donde TODOS entran, no.
 *
 * LO QUE HACE ESTE ARCHIVO. Sin pantalla, para poder probarlo en node:
 *   · guarda la sesión de play/ en localStorage (el token y el de renovar, como
 *     hace la librería de Supabase y como ya hace la app instalada), con la
 *     hora en que vence;
 *   · la RENUEVA cuando vence, con las mismas reglas que costó aprender en
 *     app/sesion-socio.js: un 429 o un corte NO son «sesión muerta», y si otra
 *     pestaña ya la renovó se usa la de ella en vez de cerrar la cuenta;
 *   · recuerda si la persona quiere que quede abierta (por defecto SÍ; la
 *     casilla «Dejar mi cuenta abierta en este teléfono» es el botón de guardar
 *     que pidió Joan, y desmarcarla es la salida para el teléfono prestado);
 *   · recuerda el celular de la última cuenta abierta aquí, para que la
 *     entrada lo traiga puesto;
 *   · y le pasa el celular y la contraseña al LLAVERO DEL TELÉFONO (el gestor
 *     de contraseñas de Chrome o de Android) cuando existe.
 *
 * LA CONTRASEÑA NO SE GUARDA AQUÍ. Ni en localStorage ni en ninguna parte de
 * este sitio: lo que mantiene la cuenta abierta es la sesión. La contraseña se
 * le ofrece al llavero del teléfono, que la guarda cifrada y es de la persona:
 * así la tiene «guardada en el teléfono» sin que una página la pueda leer.
 *
 * «SALIR» LO BORRA TODO: la sesión, la preferencia no (es del teléfono), y el
 * celular recordado sí (en un teléfono prestado, el número del anterior no se
 * le muestra al siguiente).
 * ==========================================================================*/
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.CuentaAbierta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LLAVE = 'play_cuenta_abierta';          // la sesión, tal como la entrega Supabase, más `expira_en`
  var LLAVE_PREFERENCIA = 'play_dejar_abierta';   // '0' = no la dejes abierta aquí. Sin nada: sí.
  var LLAVE_CELULAR = 'play_celular_recordado';
  /* Se renueva un minuto antes de que venza: un token que vence en el aire
     convierte una consulta buena en un 401. */
  var MARGEN_MS = 60000;

  function texto(v) { return v === null || v === undefined ? '' : String(v); }
  function base(cfg) { return texto(cfg && cfg.url).replace(/\/+$/, ''); }
  function pedirDe(cfg) { return (cfg && cfg.fetch) || (typeof fetch === 'function' ? fetch : null); }
  function ahoraDe(cfg) { return (cfg && typeof cfg.ahora === 'function') ? cfg.ahora() : Date.now(); }

  /* ----------------------------------------------------------- la sesión */
  /** La sesión de Supabase con la hora en que vence (ms). No cambia la que recibe. */
  function sellar(j, ms) {
    if (!j || !j.access_token) return null;
    var s = {};
    Object.keys(j).forEach(function (k) { s[k] = j[k]; });
    var ahora = Number(ms) || Date.now();
    s.expira_en = Number(j.expires_at) ? Number(j.expires_at) * 1000
      : (Number(j.expira_en) > 0 ? Number(j.expira_en) : ahora + (Number(j.expires_in) || 3600) * 1000);
    return s;
  }
  function vigente(s, ms) { return !!(s && s.access_token && Number(s.expira_en) - MARGEN_MS > (Number(ms) || Date.now())); }
  /* Sin `expira_en` no se sabe: se trata como vencida y se renueva antes de usarla. */

  /* -------------------------------------------------- la preferencia */
  /** ¿La persona quiere que su cuenta quede abierta en este teléfono? Sí, salvo que haya dicho que no. */
  function quiere(almacen) {
    try { return !almacen || almacen.getItem(LLAVE_PREFERENCIA) !== '0'; } catch (e) { return true; }
  }
  function decir(almacen, si) {
    try {
      if (!almacen) return;
      if (si) almacen.removeItem(LLAVE_PREFERENCIA); else almacen.setItem(LLAVE_PREFERENCIA, '0');
      /* Quien dice que no, no deja nada: ni la sesión que hubiera, ni su número. */
      if (!si) { almacen.removeItem(LLAVE); almacen.removeItem(LLAVE_CELULAR); }
    } catch (e) { /* un almacén que no deja escribir no puede frenar la entrada */ }
  }

  /* -------------------------------------------------------- guardar */
  /** Guarda la sesión SOLO si la persona quiere. Devuelve si quedó guardada. */
  function guardar(almacen, s, ms) {
    if (!almacen || !s || !s.access_token || !s.refresh_token) return false;
    if (!quiere(almacen)) return false;
    try { almacen.setItem(LLAVE, JSON.stringify(sellar(s, ms))); return true; } catch (e) { return false; }
  }
  /** La sesión guardada, o null. Sin token de renovar no sirve para volver: se bota. */
  function leer(almacen) {
    try {
      if (!almacen) return null;
      if (!quiere(almacen)) { almacen.removeItem(LLAVE); return null; }
      var s = JSON.parse(almacen.getItem(LLAVE) || 'null');
      if (s && s.access_token && s.refresh_token) return s;
      if (s) almacen.removeItem(LLAVE);
      return null;
    } catch (e) { return null; }
  }
  function borrar(almacen) { try { if (almacen) almacen.removeItem(LLAVE); } catch (e) { /* nada */ } }
  /** EL RELEVO. El eslabón `refrescoViejo` ya se gastó al renovar: si lo guardado en el
   *  teléfono es ESE, se cambia por el nuevo, aunque la pantalla que lo pidió ya sea otra.
   *  Si es de otra cadena (otra persona, u otra entrada), no se toca. */
  function relevar(almacen, refrescoViejo, nueva, ms) {
    try {
      var g = leer(almacen);
      if (!g || !refrescoViejo || g.refresh_token !== refrescoViejo) return false;
      return guardar(almacen, nueva, ms);
    } catch (e) { return false; }
  }

  /* ----------------------------------------------- el celular recordado */
  function soloDiez(v) {
    var d = texto(v).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return (d.length === 10 && d.charAt(0) === '3') ? d : '';
  }
  function celular(almacen) {
    try { return (almacen && quiere(almacen)) ? soloDiez(almacen.getItem(LLAVE_CELULAR)) : ''; } catch (e) { return ''; }
  }
  function recordarCelular(almacen, cel) {
    var d = soloDiez(cel);
    try { if (almacen && d && quiere(almacen)) almacen.setItem(LLAVE_CELULAR, d); } catch (e) { /* nada */ }
    return d;
  }
  function olvidarCelular(almacen) { try { if (almacen) almacen.removeItem(LLAVE_CELULAR); } catch (e) { /* nada */ } }

  /* --------------------------------------------------------- renovar */
  /* Una sola renovación a la vez por token: el token de renovar se usa UNA vez,
     y dos pedidos con el mismo dejan al segundo con un «ya no sirve» falso. */
  var EN_CURSO = {};

  function pedirRenovar(cfg, s) {
    var pedir = pedirDe(cfg);
    if (!base(cfg) || !cfg.anon || !pedir) return Promise.reject({ causa: 'red' });
    if (!s || !s.refresh_token) return Promise.reject({ causa: 'sesion' });
    return pedir(base(cfg) + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anon },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) {
      /* El cuerpo, como venga: un navegador trae text() y json(); se lee con lo que haya. */
      var cuerpo = (r && typeof r.text === 'function')
        ? r.text().then(function (t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } })
        : (r && typeof r.json === 'function' ? r.json().then(null, function () { return null; }) : Promise.resolve(null));
      return cuerpo.then(function (j) {
        if (r.ok && j && j.access_token) {
          var n = sellar(j, ahoraDe(cfg));
          /* Supabase devuelve la cuenta con la sesión nueva; si algún día no, se conserva la que había. */
          if (!n.user && s.user) n.user = s.user;
          return n;
        }
        /* «Muchos intentos» y un corte NO son «sesión muerta» (la lección del 24-nov en
           app/sesion-socio.js): el token de renovar sigue siendo bueno. */
        if (r.status >= 500 || r.status === 429 || r.status === 408) throw { causa: 'red', estado: r.status };
        throw { causa: 'sesion', estado: r.status };
      });
    }, function () { throw { causa: 'red' }; });
  }

  /**
   * Renueva la sesión. Resuelve la nueva (sellada); rechaza {causa:'sesion'} si de
   * verdad murió, o {causa:'red'} si no se pudo preguntar (y entonces NO se cierra nada).
   * `cfg.releer()` devuelve lo guardado en el teléfono: si otra pestaña ya la renovó,
   * se sigue con esa en vez de dar la cuenta por cerrada.
   */
  function renovar(cfg, s) {
    var llave = texto(s && s.refresh_token);
    if (!llave) return Promise.reject({ causa: 'sesion' });
    if (EN_CURSO[llave]) return EN_CURSO[llave];
    /* ANTES de gastar el token de renovar se mira lo guardado. Ese token sirve UNA vez, y
       Supabase cierra la cuenta en todas partes si le llega uno de dos vueltas atrás: si otra
       pestaña (o la app instalada, que le devuelve a play/ lo que renueva) ya dejó una sesión
       más nueva de ESTA misma cuenta, se sigue con esa en vez de quemar la vieja. */
    var deAhora = s;
    if (cfg && typeof cfg.releer === 'function') {
      var guardada = null;
      try { guardada = cfg.releer(); } catch (e0) { guardada = null; }
      if (guardada && guardada.access_token && guardada.refresh_token &&
          guardada.refresh_token !== s.refresh_token && mismaPersona(guardada, s) &&
          venceEn(guardada) > venceEn(s)) {   // solo hacia adelante: nunca una más vieja que la viva
        if (vigente(guardada, ahoraDe(cfg))) return Promise.resolve(guardada);
        deAhora = guardada;
      }
    }
    var p = pedirRenovar(cfg, deAhora).then(null, function (e) {
      if (!e || e.causa !== 'sesion' || !cfg || typeof cfg.releer !== 'function') throw e;
      var otra = null;
      try { otra = cfg.releer(); } catch (e2) { otra = null; }
      if (!otra || !otra.access_token || !otra.refresh_token || otra.refresh_token === deAhora.refresh_token ||
          !mismaPersona(otra, s)) throw e;
      if (vigente(otra, ahoraDe(cfg))) return otra;
      return pedirRenovar(cfg, otra);
    });
    EN_CURSO[llave] = p;
    var soltar = function () { if (EN_CURSO[llave] === p) delete EN_CURSO[llave]; };
    p.then(soltar, soltar);
    return p;
  }

  /** Cuándo vence (ms), con el sello de aquí o con el de Supabase (`expires_at`, en segundos).
   *  Sin ninguno, 0: una sesión recién llegada que aún no se selló. */
  function venceEn(s) {
    if (!s) return 0;
    return Number(s.expira_en) > 0 ? Number(s.expira_en) : (Number(s.expires_at) > 0 ? Number(s.expires_at) * 1000 : 0);
  }

  /** ¿Las dos sesiones son de la misma cuenta? Sin con qué comparar, no: en un teléfono
   *  que usan dos personas, la sesión guardada de una nunca reemplaza la viva de la otra. */
  function mismaPersona(a, b) {
    var ua = (a && a.user) || {}, ub = (b && b.user) || {};
    if (ua.id && ub.id) return String(ua.id) === String(ub.id);
    if (ua.email && ub.email) return String(ua.email).toLowerCase() === String(ub.email).toLowerCase();
    return false;
  }

  /** La misma sesión si todavía sirve; si no, la renovada. */
  function alDia(cfg, s) {
    if (!s || !s.access_token) return Promise.reject({ causa: 'sesion' });
    return vigente(s, ahoraDe(cfg)) ? Promise.resolve(s) : renovar(cfg, s);
  }

  /** Pone lo de `nueva` DENTRO del objeto vivo, sin cambiarlo por otro: la página
   *  compara la sesión por identidad para saber de quién es cada respuesta. */
  function copiarEn(viva, nueva) {
    if (!viva || !nueva || viva === nueva) return viva;
    Object.keys(nueva).forEach(function (k) { viva[k] = nueva[k]; });
    return viva;
  }

  /* ------------------------------------------- el llavero del teléfono */
  /**
   * Le ofrece al gestor de contraseñas del teléfono guardar el celular y la
   * contraseña (Chrome y Android: sale su propio «¿Guardar contraseña?»).
   * Nunca rechaza y nunca frena la entrada: donde no existe, no hace nada
   * (en iPhone lo ofrece Safari por su cuenta al enviar el formulario).
   */
  function guardarEnElLlavero(ventana, cel, clave, nombre) {
    try {
      var w = ventana || (typeof window !== 'undefined' ? window : null);
      var d = soloDiez(cel);
      if (!w || !d || !clave || !w.PasswordCredential || !w.navigator || !w.navigator.credentials ||
          typeof w.navigator.credentials.store !== 'function') return Promise.resolve(false);
      var c = new w.PasswordCredential({ id: d, password: texto(clave), name: texto(nombre) || 'Tu Garantía' });
      return Promise.resolve(w.navigator.credentials.store(c)).then(function () { return true; }, function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  return {
    VERSION: '2026-11-26',
    LLAVE: LLAVE, LLAVE_PREFERENCIA: LLAVE_PREFERENCIA, LLAVE_CELULAR: LLAVE_CELULAR, MARGEN_MS: MARGEN_MS,
    sellar: sellar, vigente: vigente,
    quiere: quiere, decir: decir,
    guardar: guardar, leer: leer, borrar: borrar, relevar: relevar,
    celular: celular, recordarCelular: recordarCelular, olvidarCelular: olvidarCelular,
    renovar: renovar, alDia: alDia, copiarEn: copiarEn, mismaPersona: mismaPersona,
    guardarEnElLlavero: guardarEnElLlavero
  };
});
