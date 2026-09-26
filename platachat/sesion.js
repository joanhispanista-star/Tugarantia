/* ============================================================================
 * LA SESIÓN DE PLATACHAT — 14 de septiembre de 2026
 *
 * PlataChat entra con celular + contraseña (Supabase Auth, el mismo correo
 * sintético 57<celular>@tugarantia.net que ya usa play/), y desde ahí habla
 * con la base SIEMPRE con la sesión: `Authorization: Bearer <access_token>`.
 * Esto NO es lo que hace app/chat.js, que manda el anon como Bearer y por eso
 * no sirve para mi_cuenta, chat_leer_sesion ni nada que lea celular_de_sesion.
 *
 * POR QUÉ ESTÁ EN UN ARCHIVO APARTE Y SIN DOM
 * Para poder probarlo en Node con un fetch de mentira. La entrada de play/ vive
 * dentro de su HTML y por eso nadie la prueba: se descubrió en producción que
 * la conexión vacía dejaba la app muerta en todo teléfono nuevo. Acá el fetch
 * entra por `cfg.fetch` (o el del navegador si nadie lo pasa), y el
 * almacenamiento se busca al momento de usarlo, no al cargar el archivo.
 *
 * LA SESIÓN SE GUARDA A PROPÓSITO
 * Un chat que pide contraseña cada vez que se abre no se abre. Se guarda en
 * localStorage (bajo LLAVE) el access_token, el refresh_token y el celular —
 * NUNCA la contraseña, que se manda una sola vez y no se retiene en ninguna
 * variable de este archivo. «Salir» la borra (ver borrar), y si la nube dice
 * que el refresh ya no vale, la página la borra también: la base manda, la
 * sesión solo recuerda.
 *
 * QUÉ NO HAY, A PROPÓSITO
 *   · Ninguna pantalla, ningún texto pintado. Los `motivo` que salen de acá
 *     están escritos para el cliente, y la página los muestra tal cual.
 *   · Ningún «ese celular existe pero la contraseña no»: la entrada contesta
 *     lo mismo en todas las ramas malas, para no ser un oráculo de quién es
 *     cliente (la misma regla que play/index.html).
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('../app/cuenta.js'));
  } else {
    raiz.SesionPlataChat = fabrica(raiz.CuentaSocio);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cuenta) {
  'use strict';

  var LLAVE = 'platachat_sesion';
  var APP = 'platachat';

  /* Cuánto antes de que venza el token se refresca solo. Un minuto: un token
     que vence a mitad de un pedido daría 401 y obligaría a la segunda vuelta,
     que existe pero es la excepción, no el camino. */
  var MARGEN_VENCIMIENTO_S = 60;

  var SIN_RED = 'No pude conectarme. Revisa tu internet y vuelve a intentar.';
  var DATOS_MALOS = 'No pudimos entrar con esos datos. Revísalos y vuelve a intentar.';
  /* La nube CONTESTÓ, pero no pudo atender (5xx) o frenó (429). No es la señal
     del cliente ni sus datos: decirle «revisa tu internet» lo manda a mirar el
     wifi, y «revísalos» a cambiar una contraseña que estaba bien (hallazgo
     del 14-sep). Cada rama mala distingue las tres cosas. */
  var NUBE_CAIDA = 'La nube no pudo atender ahora mismo. Vuelve a intentar en un minuto.';
  function nubeCaida(estado) { return estado >= 500 || estado === 429; }
  function nubeRechazo(estado) { return 'La nube contestó con un error (' + estado + '). Vuelve a intentar en un momento.'; }

  function base(cfg) { return String((cfg && cfg.url) || '').replace(/\/+$/, ''); }
  function pedidor(cfg) {
    if (cfg && typeof cfg.fetch === 'function') return cfg.fetch;
    return typeof fetch === 'function' ? fetch : null;
  }
  function conectada(cfg) { return !!(cfg && cfg.url && cfg.anon && pedidor(cfg)); }

  /* El almacenamiento se busca CADA VEZ: en Node no existe al cargar el
     archivo y en el navegador puede estar bloqueado (modo privado). Sin
     almacén, la app funciona igual — solo no recuerda. */
  function almacen() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; }
    catch (e) { return null; }
  }

  function correoDe(celular) {
    return (Cuenta && Cuenta.correoDeTelefono) ? Cuenta.correoDeTelefono(celular) : null;
  }
  function normalizar(celular) {
    return (Cuenta && Cuenta.normalizarTelefono) ? Cuenta.normalizarTelefono(celular) : null;
  }

  /* Lee el cuerpo como texto y lo intenta como JSON: Supabase Auth contesta
     JSON siempre, pero un proxy caído contesta HTML, y un `r.json()` a secas
     reventaría con un error que no dice nada. */
  function leerCuerpo(r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = t === '' ? null : JSON.parse(t); } catch (e) { j = null; }
      return { ok: r.ok, estado: r.status, j: j, texto: t };
    });
  }

  /* Lo que se guarda de la respuesta de Auth. Se recorta a propósito: el
     `user` entero trae metadatos que nadie lee acá, y lo que se guarda en el
     teléfono debe ser lo mínimo que hace falta para volver a entrar. */
  function sesionDe(j, celular, extra) {
    var ahora = Math.floor(Date.now() / 1000);
    var meta = (j && j.user && j.user.user_metadata) || {};
    var s = {
      access_token: j.access_token,
      refresh_token: j.refresh_token || null,
      expires_at: Number(j.expires_at) || (ahora + (Number(j.expires_in) || 3600)),
      celular: celular,
      nombre: (extra && extra.nombre) || meta.nombre || '',
      guardadoEl: new Date().toISOString()
    };
    return s;
  }

  function vencida(sesion, ahoraS) {
    if (!sesion || !sesion.expires_at) return false;
    var ahora = ahoraS != null ? ahoraS : Math.floor(Date.now() / 1000);
    return Number(sesion.expires_at) - MARGEN_VENCIMIENTO_S <= ahora;
  }

  /* ------------------------------------------------------------------------
     ENTRAR. Devuelve siempre un objeto, nunca rechaza: la página no tiene que
     distinguir un catch de un {ok:false} — solo pinta el motivo.
     ---------------------------------------------------------------------- */
  function entrar(cfg, celular, clave) {
    var cel = normalizar(celular);
    if (!cel) return Promise.resolve({ ok: false, motivo: 'Escribe tu celular completo: son 10 números y empiezan por 3.' });
    if (!clave) return Promise.resolve({ ok: false, motivo: 'Escribe tu contraseña.' });
    if (!conectada(cfg)) return Promise.resolve({ ok: false, motivo: 'Todavía no hay conexión con la nube.', red: true });

    return pedidor(cfg)(base(cfg) + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anon },
      body: JSON.stringify({ email: correoDe(cel), password: String(clave) })
    }).then(leerCuerpo).then(function (r) {
      if (nubeCaida(r.estado)) return { ok: false, motivo: NUBE_CAIDA, estado: r.estado };
      if (!r.ok || !r.j || !r.j.access_token) return { ok: false, motivo: DATOS_MALOS };
      var s = sesionDe(r.j, cel);
      guardar(s);
      return { ok: true, sesion: s };
    }).catch(function () {
      return { ok: false, motivo: SIN_RED, red: true };
    });
  }

  /* ------------------------------------------------------------------------
     REGISTRAR. PRIMERO la bandeja de Joan (registrar_abierto_app, con el anon),
     DESPUÉS la cuenta en Auth — y el orden es la garantía, la misma lección de
     play/: si la bandeja falla no se crea nada y el cliente reintenta; si la
     cuenta falla después, el registro YA está en la bandeja y reintentar no lo
     duplica, porque la función es idempotente por celular.

     Es registrar_abierto_APP y no registrar_abierto: la vieja no sabe de qué
     app viene el registro, y una sobrecarga con otra firma dejaría a PostgREST
     sin saber cuál llamar. Función nueva, nombre nuevo (base/20260921).
     ---------------------------------------------------------------------- */
  function registrar(cfg, datos) {
    var d = datos || {};
    var cel = normalizar(d.celular);
    var nombre = String(d.nombre || '').replace(/\s+/g, ' ').trim();
    var cedula = String(d.cedula || '').replace(/\D/g, '');
    if (!cel) return Promise.resolve({ ok: false, motivo: 'Escribe tu celular completo: son 10 números y empiezan por 3.' });
    if (nombre.length < 3) return Promise.resolve({ ok: false, motivo: 'Escribe tu nombre como aparece en la cédula.' });
    if (cedula && cedula.length < 5) return Promise.resolve({ ok: false, motivo: 'Esa cédula está incompleta. Si no la quieres dar ahora, deja el campo vacío.' });
    var rc = Cuenta && Cuenta.revisarContrasena
      ? Cuenta.revisarContrasena(String(d.clave || ''), { telefono: cel, cedula: cedula })
      : { ok: !!d.clave, motivo: 'Escribe una contraseña.' };
    if (!rc.ok) return Promise.resolve({ ok: false, motivo: rc.motivo });
    if (!conectada(cfg)) return Promise.resolve({ ok: false, motivo: 'Todavía no hay conexión con la nube.', red: true });

    var pedir = pedidor(cfg);
    return pedir(base(cfg) + '/rest/v1/rpc/registrar_abierto_app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon },
      body: JSON.stringify({
        p_celular: cel, p_nombre: nombre.slice(0, 80), p_cedula: cedula,
        p_datos: { celular: cel, nombre: nombre, cedula: cedula, app: APP },
        p_app: APP
      })
    }).then(leerCuerpo).then(function (r) {
      if (r.estado === 404) {
        /* 404 en un RPC significa «la función no existe»: la migración no se
           corrió. Se arregla pegando el SQL, no reintentando — y se dice. */
        throw { humano: 'El registro de PlataChat todavía no está encendido en la base. ' +
                        'Falta correr base/20260921_platachat_app.sql.' };
      }
      if (nubeCaida(r.estado)) throw { humano: NUBE_CAIDA };
      if (!r.ok || !r.j || r.j.ok !== true) {
        throw { humano: 'No pudimos recibir tu registro. Revisa tu celular y tu nombre, ' +
                        'y vuelve a intentar en unos minutos.' };
      }
      return pedir(base(cfg) + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anon },
        body: JSON.stringify({
          email: correoDe(cel), password: String(d.clave),
          data: { telefono: cel, nombre: nombre, app: APP }
        })
      }).then(leerCuerpo);
    }).then(function (r) {
      if (!r.ok) {
        if (nubeCaida(r.estado)) return { ok: false, motivo: NUBE_CAIDA, estado: r.estado };
        var yaExiste = /registered|already/i.test(r.texto || '');
        return { ok: false, yaExiste: yaExiste, motivo: yaExiste
          ? 'Ya hay una cuenta con ese celular. Entra arriba con tu contraseña.'
          : 'No pudimos crear la cuenta. Vuelve a intentar en un momento.' };
      }
      if (r.j && r.j.access_token) {
        var s = sesionDe(r.j, cel, { nombre: nombre });
        guardar(s);
        return { ok: true, sesion: s };
      }
      /* Cuenta creada pero sin sesión en la respuesta (pasaría si alguien
         enciende «Confirm email» en Supabase): se intenta entrar con lo mismo,
         y si tampoco, se dice qué pasó en vez de un «error». */
      return entrar(cfg, cel, d.clave).then(function (e) {
        return e.ok ? e : { ok: false, motivo: 'La cuenta quedó creada pero no pudimos abrirla. ' +
                                               'Entra arriba con tu celular y tu contraseña.' };
      });
    }).catch(function (e) {
      return { ok: false, motivo: (e && e.humano) || SIN_RED, red: !(e && e.humano) };
    });
  }

  /* ------------------------------------------------------------------------
     REFRESCAR. Resuelve con la sesión nueva, o con null si la nube dice que
     ese refresh ya no vale (sesión cerrada desde otro lado, cuenta borrada).
     Rechaza SOLO por red: null y «sin red» son cosas distintas y la página
     hace cosas distintas con cada una — borrar la sesión, o mostrar lo último
     guardado.

     Muta la sesión que recibe además de devolverla: la página guarda una sola
     referencia (SES) y así no tiene que acordarse de reasignarla en cada sitio
     desde donde llama a rpc(). Se persiste acá mismo por la misma razón.
     ---------------------------------------------------------------------- */
  function refrescar(cfg, sesion) {
    if (!sesion || !sesion.refresh_token) return Promise.resolve(null);
    if (!conectada(cfg)) return Promise.reject({ humano: SIN_RED, red: true });
    return pedidor(cfg)(base(cfg) + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anon },
      body: JSON.stringify({ refresh_token: sesion.refresh_token })
    }).then(leerCuerpo, function () { throw { humano: SIN_RED, red: true }; })
      .then(function (r) {
        if (!r.ok || !r.j || !r.j.access_token) return null;
        var nueva = sesionDe(r.j, sesion.celular, { nombre: sesion.nombre });
        Object.keys(nueva).forEach(function (k) { sesion[k] = nueva[k]; });
        guardar(sesion);
        return sesion;
      });
  }

  /* ------------------------------------------------------------------------
     RPC CON SESIÓN. Una sola forma de armar el pedido para toda la página.
       · Sin token: rechaza {sinSesion:true} sin tocar la red.
       · Token vencido según el reloj: refresca ANTES de pedir.
       · 401 de la base: refresca UNA vez y repite. Si el refresh tampoco
         vale, rechaza {sinSesion:true} — la página vuelve a la puerta.
       · 404: la función no existe en la base; se dice cuál falta.
       · 5xx o 429: la nube no pudo atender; se dice eso, no «revisa tu
         internet». Y cualquier otro estado: la nube rechazó el pedido, con el
         número. Solo el fetch que rechaza lleva red:true — la página pinta
         «sin conexión» ÚNICAMENTE con esa marca.
     ---------------------------------------------------------------------- */
  function rpc(cfg, sesion, fn, cuerpo) {
    if (!sesion || !sesion.access_token) return Promise.reject({ sinSesion: true, humano: 'Entra de nuevo para seguir.' });
    if (!conectada(cfg)) return Promise.reject({ humano: 'Todavía no hay conexión con la nube.', red: true });
    var pedir = pedidor(cfg);

    function llamar() {
      return pedir(base(cfg) + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anon,
                   Authorization: 'Bearer ' + sesion.access_token },
        body: JSON.stringify(cuerpo || {})
      }).then(leerCuerpo, function () { throw { humano: SIN_RED, red: true }; });
    }
    function traducir(r) {
      if (r.ok) return r.j;
      if (r.estado === 404) {
        throw { humano: 'Esta parte todavía no está encendida en la base: falta la migración que crea ' + fn + '.',
                estado: 404, fn: fn };
      }
      throw { humano: nubeCaida(r.estado) ? NUBE_CAIDA : nubeRechazo(r.estado),
              estado: r.estado, detalle: String(r.texto || '').slice(0, 200), fn: fn };
    }
    function sinSesion() {
      throw { sinSesion: true, humano: 'Tu sesión venció. Entra de nuevo con tu celular y tu contraseña.' };
    }

    var antes = vencida(sesion) ? refrescar(cfg, sesion) : Promise.resolve(sesion);
    return antes.then(function (s) {
      if (s === null) sinSesion();
      return llamar();
    }).then(function (r) {
      if (r.estado !== 401) return traducir(r);
      return refrescar(cfg, sesion).then(function (s) {
        if (s === null) sinSesion();
        return llamar().then(function (r2) {
          if (r2.estado === 401) sinSesion();
          return traducir(r2);
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     LO QUE SE RECUERDA. Sin almacén (Node, modo privado, cuota llena) no
     revienta: guardar no hace nada y leer devuelve null.
     ---------------------------------------------------------------------- */
  function guardar(sesion) {
    var a = almacen(); if (!a || !sesion) return false;
    try { a.setItem(LLAVE, JSON.stringify(sesion)); return true; } catch (e) { return false; }
  }
  function leer() {
    var a = almacen(); if (!a) return null;
    try {
      var s = JSON.parse(a.getItem(LLAVE) || 'null');
      return (s && s.access_token) ? s : null;
    } catch (e) { return null; }
  }
  function borrar() {
    var a = almacen(); if (!a) return;
    try { a.removeItem(LLAVE); } catch (e) {}
  }

  return {
    LLAVE: LLAVE,
    APP: APP,
    NUBE_CAIDA: NUBE_CAIDA,
    MARGEN_VENCIMIENTO_S: MARGEN_VENCIMIENTO_S,
    entrar: entrar,
    registrar: registrar,
    refrescar: refrescar,
    rpc: rpc,
    guardar: guardar,
    leer: leer,
    borrar: borrar,
    correoDe: correoDe,
    vencida: vencida,
    sesionDe: sesionDe
  };
});
