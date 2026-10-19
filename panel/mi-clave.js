/* ============================================================================
 * MI CONTRASEÑA — que alguien del equipo cambie la suya desde su Panel.
 * 19 de octubre de 2026.
 *
 * Joan: «William no puede cambiar la contraseña para ingresar al panel de
 * control». No podía porque no había dónde: el menú del equipo tenía once
 * entradas y ninguna era de contraseña, y la puerta del equipo no tenía salida
 * para quien la olvida. La clave se la había puesto Joan (claveSugerida, tipo
 * «abcd-2345») y su gerente no tenía cómo cambiarla por una suya, así que Joan
 * seguía conociendo la clave de su gerente.
 *
 * CÓMO SE CAMBIA, y por qué en dos pasos:
 *   1. POST /auth/v1/token con la contraseña DE AHORA. Prueba que es él, y no
 *      alguien que encontró el Panel abierto en un computador ajeno. Y deja una
 *      sesión recién hecha: con «Secure password change» encendido en
 *      Supabase, una sesión de más de un día no puede cambiar la contraseña
 *      sin un código que iría a un buzón que no existe (57…@tugarantia.net).
 *   2. PUT /auth/v1/user {password} con ESA sesión. Solo la contraseña: el
 *      correo es la identidad de la cuenta y la base niega cambiarlo
 *      (20260914), igual que en la app del cliente.
 * Al cambiarla, Supabase cierra TODAS las demás sesiones de la cuenta
 * (UpdatePassword → LogoutAllExceptMe). La que quedó viva es la del paso 1:
 * por eso se devuelve, y el Panel la guarda en vez de la vieja. Sin eso, la
 * siguiente acción después del «Listo» diría «tu sesión se venció».
 *
 * LO QUE ESTO NO ABRE: ningún hueco nuevo. Pide la contraseña de ahora y usa
 * la sesión de la propia persona, sin la clave de sincronización de Joan
 * (20261007c cerró que con esa clave se cambie la contraseña del equipo). No
 * hay migración: nada de esto toca la base.
 *
 * ES UNA SOLA CUENTA. La cuenta del Panel de alguien del equipo es la misma
 * de su app de cliente (el correo sale del celular, app/cuenta.js), así que
 * cambiarla aquí la cambia allá. La pantalla lo dice, para que nadie crea que
 * tiene dos.
 *
 * PURO: sin DOM y sin red propia (el fetch llega de afuera, como en
 * gerente-vende.js). Los textos son TEXTO PLANO: quien los pinta los escapa.
 * Las reglas de la contraseña y la traducción de los «no» de Supabase son las
 * de app/cuenta.js (revisarContrasena, traducirErrorAuth): las mismas de la
 * app del cliente, porque es la misma cuenta.
 * Pruebas: pruebas/mi-clave-equipo.test.js.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  /* CuentaSocio se busca AL USARLO y no al cargar: así el orden de los
     <script src> de crm.html no puede dejar este archivo sin reglas. */
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(function () { return require('../app/cuenta.js'); });
  } else {
    raiz.MiClave = fabrica(function () { return raiz.CuentaSocio; });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cuenta) {
  'use strict';

  var TEXTOS = {
    /* «con ese celular» y no «tu app de cliente» a secas: no todos en el
       equipo la usan, pero la cuenta es la misma igual. */
    misma_cuenta: 'Es una sola cuenta, la de tu celular: esta contraseña es también la de la app de cliente de ' +
      'Tu Garantía con ese celular. Si la cambias aquí, también cambia allá.',
    sin_cuenta_js: 'No cargó app/cuenta.js. Recarga la página con señal.',
    sin_celular: 'No encuentro tu celular en esta sesión. Toca «Salir» y vuelve a entrar.',
    falta_vieja: 'Escribe tu contraseña de ahora: así sabemos que eres tú.',
    distintas: 'Las dos nuevas no quedaron iguales. Escríbelas otra vez, sin afán.',
    igual_a_la_vieja: 'La nueva es igual a la que ya tienes. Escoge una distinta.',
    /* La red se cayó DESPUÉS de mandar la nueva: no se sabe si quedó. Decir
       «no se cambió» sería mentir la mitad de las veces. */
    incierto: 'Se cortó la conexión justo al guardar, y no supe si quedó cambiada. Prueba a entrar con la nueva; ' +
      'si no sirve, la de antes sigue valiendo.',
    listo: 'Listo: tu contraseña quedó cambiada.',
    /* «en menos de una hora»: Supabase borra las otras sesiones al instante,
       pero un token ya entregado vale hasta que vence, y dura una hora (la
       misma cuenta de UnaPuerta.ESPERA_CLAVE_MS). */
    despues: 'Desde ahora entras con la nueva, aquí y en la app de cliente. Aquí sigues adentro; en los otros ' +
      'teléfonos o apps donde estuvieras adentro con este celular, la sesión se cierra sola en menos de una hora ' +
      'y te pide la nueva.',
    joan: 'Joan no conoce tu contraseña nueva. Si la olvidas, pídele que te ponga otra.'
  };

  function no(motivo, texto, extra) {
    var r = { ok: false, motivo: motivo, texto: texto || TEXTOS[motivo] || '' };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    return r;
  }

  /* La respuesta de Supabase, leída sin romperse: un cuerpo vacío o que no es
     JSON (un 502 de una puerta intermedia) no es «sin red». */
  function leer(r) {
    var cuerpo = (r && typeof r.text === 'function') ? r.text().then(function (t) {
      try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
    }) : (r && typeof r.json === 'function') ? r.json().catch(function () { return null; }) : Promise.resolve(null);
    return cuerpo.then(function (j) { return { ok: !!(r && r.ok), estado: r ? r.status : 0, j: j }; },
                       function () { return { ok: !!(r && r.ok), estado: r ? r.status : 0, j: null }; });
  }

  /**
   * Cambiar la contraseña propia.
   * @param {object} o {url, anon, celular, vieja, nueva, repite, fetch}
   * @returns {Promise<object>} nunca rechaza:
   *   {ok: true, sesion}            — `sesion` es la respuesta de /token (la
   *                                   única que sigue viva): hay que guardarla.
   *   {ok: false, motivo, texto, sesion?} — `texto` es para la persona. Trae
   *                                   `sesion` solo cuando no se sabe si quedó
   *                                   (motivo 'incierto'): esa sesión es buena
   *                                   pase lo que pase, la vieja quizá ya no.
   */
  function cambiarMiClave(o) {
    var x = o || {};
    var U = cuenta();
    if (!U || !U.revisarContrasena || !U.correoDeTelefono) return Promise.resolve(no('sin_cuenta_js'));
    var tel = U.normalizarTelefono(x.celular);
    if (!tel) return Promise.resolve(no('sin_celular'));
    /* Sin recortar espacios, igual que la puerta del equipo y la app del
       cliente: si aquí se recortaran y allá no, la clave guardada no sería la
       que la persona teclea al entrar. */
    var vieja = String(x.vieja == null ? '' : x.vieja);
    var nueva = String(x.nueva == null ? '' : x.nueva);
    var repite = String(x.repite == null ? '' : x.repite);
    if (!vieja) return Promise.resolve(no('falta_vieja'));
    var revisa = U.revisarContrasena(nueva, { telefono: tel });
    if (!revisa.ok) return Promise.resolve(no('regla', revisa.motivo));
    if (nueva !== repite) return Promise.resolve(no('distintas'));
    if (nueva === vieja) return Promise.resolve(no('igual_a_la_vieja'));

    var pedir = x.fetch;
    var base = String(x.url || '').replace(/\/+$/, '') + '/auth/v1';
    var red = function () { return no('red', U.traducirErrorAuth ? U.traducirErrorAuth(null, 0) : ''); };
    if (typeof pedir !== 'function' || !x.url || !x.anon) return Promise.resolve(red());
    var cab = function (token) {
      var h = { 'Content-Type': 'application/json', apikey: x.anon };
      if (token) h.Authorization = 'Bearer ' + token;
      return h;
    };
    var traducir = function (j, estado) {
      return U.traducirErrorAuth ? U.traducirErrorAuth(j, estado) : 'No pude cambiar tu contraseña.';
    };

    /* Paso 1: ¿es él? */
    return Promise.resolve().then(function () {
      return pedir(base + '/token?grant_type=password', {
        method: 'POST', headers: cab(),
        body: JSON.stringify({ email: U.correoDeTelefono(tel), password: vieja })
      });
    }).then(leer, function () { return null; }).then(function (t) {
      if (!t) return red();
      if (!t.ok || !t.j || !t.j.access_token) return no('auth', traducir(t.j, t.estado), { paso: 'token' });
      var fresca = t.j;
      /* Paso 2: la nueva, con la sesión recién hecha. */
      return Promise.resolve().then(function () {
        return pedir(base + '/user', {
          method: 'PUT', headers: cab(fresca.access_token),
          body: JSON.stringify({ password: nueva })
        });
      }).then(leer, function () { return null; }).then(function (u) {
        if (!u) return no('incierto', null, { sesion: fresca });
        if (u.ok) return { ok: true, sesion: fresca, texto: TEXTOS.listo };
        /* No se cambió: la sesión de prueba se cierra, y SOLO esa (scope=local).
           Sin scope, Supabase cierra todas las de la cuenta, y con ellas la
           del Panel que sigue abierto. */
        try {
          Promise.resolve(pedir(base + '/logout?scope=local', { method: 'POST', headers: cab(fresca.access_token) }))
            .catch(function () {});
        } catch (e) { /* nada: vence sola en una hora */ }
        return no('auth', traducir(u.j, u.estado), { paso: 'cambio' });
      });
    });
  }

  return { TEXTOS: TEXTOS, cambiarMiClave: cambiarMiClave };
});
