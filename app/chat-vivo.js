/* ============================================================================
 * EL CHAT QUE SE MUEVE SOLO — app/chat-vivo.js
 * chat-1. 26 de octubre de 2026.
 *
 * POR QUÉ EXISTE
 *
 * El chat de Tu Garantía ya existía de punta a punta (app/chat.js, las
 * funciones de la base) y Joan lo pidió otra vez el 23-oct («agrega el chat que
 * ya tenemos creado en Plaza»). No pedía otro chat: pedía que ESTE se viera.
 * Tres cosas lo hacían parecer muerto, y las tres son de reloj, no de base:
 *
 *   1. la conversación abierta no se movía: si el cliente contestaba con el
 *      cuadro abierto, Joan no lo veía hasta cerrarlo y volverlo a abrir;
 *   2. el equipo no aparecía solo en el CRM, y con el CRM en otra pestaña no
 *      se preguntaba nada, aunque la pantalla prometía un globo;
 *   3. cada pantalla (CRM, celular de Joan, app del cliente) tenía su propio
 *      reloj escrito a mano, con sus propias trampas.
 *
 * Aquí viven los dos relojes y la forma de juntar mensajes, UNA vez, para que
 * crm.html, espejo.html y socio.html no los escriban tres veces (la lección de
 * espejo.html con `aplicarVars`: «ES UNA SEGUNDA COPIA Y VA A DERIVAR»).
 *
 * LAS TRAMPAS QUE ESTE ARCHIVO SUJETA, y por qué cada una
 *
 *   · LO QUE SE PIDE MARCA «VISTO». chat_de, equipo_chat_de, chat_leer_sesion
 *     y equipo_chat_leer marcan como visto lo que devuelven (equipo_chat_leer
 *     marca TODO, sin mirar p_desde). Por eso el hilo abierto se pide SOLO con
 *     la pestaña a la vista: pedirlo escondido pondría «Lo vio» en algo que
 *     nadie vio. La lista, en cambio, no marca nada, y escondida sigue cada
 *     minuto. Es la diferencia entera entre hilo() y lista().
 *   · LA CLAVE MALA ARMA EL FRENO. Todas las funciones de Joan pasan por
 *     clave_ok: con la clave equivocada cada vuelta es un intento fallido, y
 *     diez en un cuarto de hora dejan afuera también a la clave buena. Si el
 *     error viene marcado `clave: true` (así lo marca app/chat.js), los dos
 *     relojes SE DETIENEN y no vuelven solos: los reanuda un ↻ que salga bien.
 *   · REPINTAR LA LÁMINA BORRA LO QUE JOAN ESTÁ ESCRIBIENDO. Ya pasó dos veces.
 *     hilo() le entrega a la página la lista junta y la página pinta SOLO la
 *     caja del hilo; el cuadro de texto no se toca nunca desde aquí.
 *   · SI JOAN ESTÁ LEYENDO ARRIBA, NO SE LE ARRASTRA LA PANTALLA. Antes de
 *     pintar se mira si la caja estaba al final (a 140 px o menos, el mismo
 *     umbral de Plaza); solo entonces se baja. Lo que acaba de mandar uno
 *     mismo sí baja siempre: lo quiere ver.
 *   · SOLO LO NUEVO, Y JUNTAR POR id. Se pide desde el último id que se tiene
 *     (p_desde) y se junta sin repetir. Es lo que play/ ya hacía con
 *     ultimoIdDe; se sube aquí para que lo hagan las tres pantallas igual.
 *     Si algún día un hilo se pagina: `order by desc` y voltear, nunca
 *     `asc limit` (Plaza perdió mensajes así el 31-jul).
 *   · EL RELOJ CON LA PESTAÑA ESCONDIDA. Chrome despierta las pestañas de
 *     atrás como mucho una vez por minuto, así que el reloj escondido es de
 *     60 s y no de menos: uno de 15 s escondido NO corre cada 15 s, corre
 *     cuando Chrome quiere. Por eso lista() arma DOS relojes, uno de 45 s que
 *     solo trabaja a la vista y uno de 60 s que solo trabaja escondido, en vez
 *     de uno solo contando vueltas. Android congela la pestaña entera: en el
 *     celular no hay aviso sin Telegram o push, y ninguna pantalla lo promete.
 *   · LA CUOTA DE SALIDA. chat_conversaciones devuelve el último texto de cada
 *     hilo; con 50 conversaciones son ~50 KB por vuelta. Cada 45 s a la vista
 *     más una por minuto escondido caben en el plan gratis; cada 15 s no
 *     (ver PLAN del chat, §9). Por eso 45 s no baja hasta que la base tenga
 *     una función barata de «¿hay algo nuevo?» (chat-2).
 *
 * QUÉ HAY ADENTRO
 *   · juntar(viejos, nuevos): junta por id, dice si cambió algo y cuál es el
 *     último id. Función pura.
 *   · hilo(opciones): el reloj de 8 s de UNA conversación abierta.
 *   · lista(opciones): los dos relojes de la bandeja (45 s a la vista, 60 s
 *     escondida).
 *   · timbre(opciones): un toque corto cuando SUBE el número, con interruptor
 *     guardado en el navegador. En las pruebas no suena nada: sin AudioContext
 *     no hay sonido, y las pruebas le pasan uno falso.
 *   · titulo(base, n): «(3) Tu Garantía · Panel» para la pestaña del navegador.
 *
 * QUÉ NO HAY, A PROPÓSITO
 *   · Ninguna llamada a la nube: cada página le pasa su `pedir`, con su clave
 *     o su sesión. Este archivo no sabe qué función se llama ni con qué.
 *   · Ningún HTML: la página pinta con app/chat.js, como siempre.
 *   · Ningún dato guardado, salvo el interruptor del sonido.
 *
 * ---------------------------------------------------------------------------
 * EL CONTRATO, para espejo.html y socio.html (y para el CRM, que es el primero)
 *
 *   var v = ChatVivo.hilo({
 *     pedir:   function (desde) { ... },  // Promise<Array|null>: los mensajes
 *                                         // con id > desde. null = «la base
 *                                         // dijo que no»: no se pinta nada.
 *                                         // Un rechazo con {clave:true} para
 *                                         // el reloj para siempre.
 *     pintar:  function (mensajes, info) { ... }, // pinta SOLO la caja del
 *                                         // hilo. info = {agregados, primera}
 *     caja:    function () { return document.getElementById('chHilo'); },
 *                                         // la caja que se desplaza. Si
 *                                         // devuelve null después de la
 *                                         // primera carga, el cuadro se
 *                                         // cerró: el reloj se para solo.
 *     esMio:   function (m) { return ChatTuGarantia.ladoDe(m.de) === 'negocio'; },
 *                                         // opcional: lo mío baja siempre
 *     cada:    8000,                      // opcional
 *     estaOculta: function () { return document.hidden; },  // opcional
 *     alLlegar: function (nuevos) { ... }, // opcional: llegaron mensajes
 *                                         // nuevos DESPUÉS de la primera carga
 *     alFallar: function (e, info) { ... }, // opcional: el pedido falló
 *     alParar:  function (motivo) { ... }  // opcional: 'clave' | 'cerrada' |
 *                                         // lo que le pase la página a parar()
 *   });
 *   v.cargar()   → primera carga (desde 0) + arranca el reloj. Promise<bool>.
 *   v.arrancar({mensajes, ultimo}) → arranca con un hilo que la página YA
 *                  trajo entera, sin volver a pedirlo (el asesor, traerJefeEq).
 *   v.latir()    → una vuelta ahora (después de mandar algo). Promise<bool>:
 *                  true si preguntó. No pregunta escondida ni con otra en
 *                  camino (si había una en camino, repite al terminar).
 *   v.parar(m)   → se detiene; al cerrar el cuadro, al cambiar de canal.
 *   v.estado()   → {vivo, parado, ultimo, mensajes, cargado}
 *
 *   var r = ChatVivo.lista({
 *     pedir: function (escondida) { ... },  // Promise. escondida=true: pedir
 *                                           // SOLO las listas, nunca un hilo.
 *     aLaVista: 45000, escondida: 60000,    // opcionales
 *     estaOculta: function () { return document.hidden; }  // opcional
 *   });
 *   r.arrancar() · r.parar('clave') · r.reanudar() · r.latir() · r.estado()
 *   Al volver a la pestaña pide una vez (como Plaza: lo que se perdió no se
 *   reenvía solo).
 *
 *   var t = ChatVivo.timbre({ crear: AudioContext, almacen: localStorage });
 *   t.sonar() → true si sonó · t.apagado() · t.poner(true|false)
 *   No suena dos veces en 1,5 s (`minimoMs`; `ahora` inyecta el reloj).
 *   `crear` es el constructor (AudioContext) o una función que devuelve uno;
 *   la página lo pasa desde SU ventana, porque este archivo puede estar
 *   cargado en otro reino (el banco de pruebas lo carga con require).
 *
 *   ChatVivo.titulo('Tu Garantía · Panel', 3) → '(3) Tu Garantía · Panel'
 *
 *   Los relojes se inyectan con `reloj: {setInterval, clearInterval}` y el
 *   documento con `documento`, para que las pruebas los manejen; en el
 *   navegador nadie los pasa.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ChatVivo = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HILO_CADA_MS = 8000;
  var LISTA_A_LA_VISTA_MS = 45000;
  var LISTA_ESCONDIDA_MS = 60000;
  var UMBRAL_ABAJO_PX = 140;

  /* ---------------------------------------------------------------------
     JUNTAR POR id. Puro: no toca lo que recibe.
     ------------------------------------------------------------------- */
  function ultimoIdDe(lista) {
    return (lista || []).reduce(function (a, m) { return Math.max(a, Number(m && m.id) || 0); }, 0);
  }

  function juntar(viejos, nuevos) {
    var lista = (viejos || []).slice();
    var ids = {};
    lista.forEach(function (m) { if (m) ids[String(m.id)] = true; });
    var agregados = [];
    (nuevos || []).forEach(function (m) {
      if (!m || m.id === undefined || m.id === null) return;
      var k = String(m.id);
      if (ids[k]) return;              /* ya estaba: la base lo mandó dos veces */
      ids[k] = true;
      lista.push(m);
      agregados.push(m);
    });
    /* Por id y no por orden de llegada: es el orden que tienen todas las
       consultas del chat (order by m.id), y un mensaje que llegue tarde con
       un id menor se mete en su sitio en vez de al final. */
    if (agregados.length) lista.sort(function (a, b) { return (Number(a.id) || 0) - (Number(b.id) || 0); });
    return { lista: lista, agregados: agregados, ultimo: ultimoIdDe(lista), cambio: agregados.length > 0 };
  }

  /* ¿La caja está al final (o casi)? Sin medidas —el banco de pruebas, una
     caja que todavía no se pintó— se cuenta como «al final», que es lo que
     pasa al abrir. */
  function estaAbajo(caja, umbral) {
    if (!caja) return true;
    var sh = Number(caja.scrollHeight), st = Number(caja.scrollTop), ch = Number(caja.clientHeight);
    if (!isFinite(sh) || !isFinite(st) || !isFinite(ch)) return true;
    return sh - st - ch <= (umbral == null ? UMBRAL_ABAJO_PX : Number(umbral));
  }
  function bajar(caja) {
    if (!caja) return;
    try { caja.scrollTop = caja.scrollHeight; } catch (e) { /* una caja de mentira */ }
  }

  function titulo(base, n) {
    var k = Math.max(0, Math.floor(Number(n) || 0));
    return k > 0 ? '(' + (k > 99 ? '99+' : k) + ') ' + String(base || '') : String(base || '');
  }

  /* Los relojes y el documento, inyectables. */
  function aparato(o) {
    var r = (o && o.reloj) || {};
    return {
      poner: r.setInterval || (typeof setInterval === 'function' ? setInterval : null),
      quitar: r.clearInterval || (typeof clearInterval === 'function' ? clearInterval : function () {}),
      doc: (o && o.documento) || (typeof document !== 'undefined' ? document : null)
    };
  }

  /* ---------------------------------------------------------------------
     EL HILO ABIERTO — cada 8 s, solo a la vista, solo lo nuevo.
     ------------------------------------------------------------------- */
  function hilo(o) {
    o = o || {};
    var A = aparato(o);
    var cada = Number(o.cada) || HILO_CADA_MS;
    var oculta = o.estaOculta || function () { return !!(A.doc && A.doc.hidden); };
    var h = { vivo: false, parado: null, ultimo: 0, mensajes: [], cargado: false, enCurso: 0, pendiente: false };
    var reloj = null, escuchando = false;

    function caja() { try { return o.caja ? o.caja() : null; } catch (e) { return null; } }

    function parar(motivo) {
      var estaba = h.vivo;
      h.vivo = false; h.parado = motivo || null; h.pendiente = false;
      if (reloj !== null) { try { A.quitar(reloj); } catch (e) {} reloj = null; }
      if (escuchando && A.doc && A.doc.removeEventListener) {
        try { A.doc.removeEventListener('visibilitychange', alVolver); } catch (e) {}
      }
      escuchando = false;
      if (estaba && o.alParar) { try { o.alParar(motivo || null); } catch (e) {} }
    }

    function alVolver() { if (A.doc && !A.doc.hidden) latir(); }

    /* `semilla` ({mensajes, ultimo}): arrancar con un hilo que la página YA
       trajo entera (el asesor con traerJefeEq), sin volver a pedirlo. */
    function arrancar(semilla) {
      if (h.vivo) return;
      if (semilla && Array.isArray(semilla.mensajes)) {
        h.mensajes = semilla.mensajes.slice();
        h.ultimo = Number(semilla.ultimo) || ultimoIdDe(h.mensajes);
        h.cargado = true;
      }
      h.vivo = true; h.parado = null;
      if (A.poner) reloj = A.poner(function () { latir(); }, cada);
      if (o.escuchar !== false && A.doc && A.doc.addEventListener) {
        try { A.doc.addEventListener('visibilitychange', alVolver); escuchando = true; } catch (e) {}
      }
    }

    function latir() {
      if (!h.vivo) return Promise.resolve(false);
      /* Escondida no se pide NUNCA: lo que se pida queda «visto». */
      if (oculta()) return Promise.resolve(false);
      if (h.enCurso > 0) { h.pendiente = true; return Promise.resolve(false); }
      /* Si la caja ya no está, cerraron el cuadro: el reloj no tiene a quién
         pintarle y se para solo (y deja de marcar visto lo que nadie mira). */
      if (h.cargado && o.caja && caja() === null) { parar('cerrada'); return Promise.resolve(false); }
      h.enCurso++;
      var desde = h.ultimo;
      return Promise.resolve().then(function () { return o.pedir(desde); }).then(function (nuevos) {
        h.enCurso--;
        if (!h.vivo) return false;
        var primera = !h.cargado;
        if (nuevos === null || nuevos === undefined) { otraVez(); return false; }
        var r = juntar(h.mensajes, Array.isArray(nuevos) ? nuevos : []);
        h.cargado = true;
        if (!r.cambio && !primera) { otraVez(); return true; }
        var c = caja();
        var abajo = primera || estaAbajo(c, o.umbral);
        var mio = r.agregados.some(function (m) { try { return !!(o.esMio && o.esMio(m)); } catch (e) { return false; } });
        h.mensajes = r.lista; h.ultimo = r.ultimo;
        if (o.pintar) o.pintar(h.mensajes, { agregados: r.agregados, primera: primera });
        if (abajo || mio) bajar(caja());
        if (!primera && r.agregados.length && o.alLlegar) { try { o.alLlegar(r.agregados); } catch (e) {} }
        otraVez();
        return true;
      }, function (e) {
        h.enCurso--;
        if (e && e.clave) parar('clave');
        if (o.alFallar) { try { o.alFallar(e, { primera: !h.cargado }); } catch (e2) {} }
        otraVez();
        return false;
      });
    }
    /* Si mientras preguntaba alguien pidió otra vuelta (acaba de mandar algo),
       se repite al terminar en vez de esperar al próximo tic. */
    function otraVez() { if (h.pendiente && h.vivo) { h.pendiente = false; latir(); } }

    function cargar() { arrancar(); return latir(); }

    return { arrancar: arrancar, cargar: cargar, latir: latir, parar: parar,
             estado: function () { return h; } };
  }

  /* ---------------------------------------------------------------------
     LA BANDEJA — 45 s a la vista, 60 s escondida, y una vez al volver.
     ------------------------------------------------------------------- */
  function lista(o) {
    o = o || {};
    var A = aparato(o);
    var aLaVista = Number(o.aLaVista) || LISTA_A_LA_VISTA_MS;
    var escondida = Number(o.escondida) || LISTA_ESCONDIDA_MS;
    var oculta = o.estaOculta || function () { return !!(A.doc && A.doc.hidden); };
    var s = { vivo: false, parado: null, enCurso: 0, vueltas: { aLaVista: 0, escondida: 0, alVolver: 0 } };
    var relojVista = null, relojEscondida = null, escuchando = false;

    function pedir(esc) {
      if (!s.vivo || s.enCurso > 0) return Promise.resolve(false);
      s.enCurso++;
      return Promise.resolve().then(function () { return o.pedir(!!esc); }).then(function () {
        s.enCurso--; return true;
      }, function (e) {
        s.enCurso--;
        if (e && e.clave) parar('clave');
        return false;
      });
    }
    function ticVista() { if (oculta()) return Promise.resolve(false); s.vueltas.aLaVista++; return pedir(false); }
    function ticEscondida() { if (!oculta()) return Promise.resolve(false); s.vueltas.escondida++; return pedir(true); }
    function alVolver() { if (A.doc && !A.doc.hidden && s.vivo) { s.vueltas.alVolver++; pedir(false); } }

    function arrancar() {
      if (s.vivo) return;
      s.vivo = true; s.parado = null;
      if (A.poner) {
        relojVista = A.poner(ticVista, aLaVista);
        relojEscondida = A.poner(ticEscondida, escondida);
      }
      if (o.escuchar !== false && A.doc && A.doc.addEventListener) {
        try { A.doc.addEventListener('visibilitychange', alVolver); escuchando = true; } catch (e) {}
      }
    }
    function parar(motivo) {
      s.vivo = false; s.parado = motivo || null;
      [relojVista, relojEscondida].forEach(function (r) { if (r !== null) { try { A.quitar(r); } catch (e) {} } });
      relojVista = relojEscondida = null;
      if (escuchando && A.doc && A.doc.removeEventListener) {
        try { A.doc.removeEventListener('visibilitychange', alVolver); } catch (e) {}
      }
      escuchando = false;
    }
    /* Después de un ↻ que salió bien: la clave vuelve a servir. */
    function reanudar() { if (!s.vivo) arrancar(); }

    return { arrancar: arrancar, parar: parar, reanudar: reanudar,
             latir: function (esc) { return pedir(esc === undefined ? oculta() : esc); },
             estado: function () { return s; } };
  }

  /* ---------------------------------------------------------------------
     EL TIMBRE — un toque corto, solo cuando el número SUBE (eso lo decide la
     página: aquí solo se suena). Sin archivo de audio: un oscilador de
     880 Hz durante 0,2 s, que no hay que precargar ni pesa en el service
     worker. Chrome deja sonar desde un reloj si la página ya tuvo un toque
     de la persona (Joan escribió su PIN), también con la pestaña atrás.
     ------------------------------------------------------------------- */
  function timbre(o) {
    o = o || {};
    var LLAVE = o.llave || 'joan_chat_sonido';
    var almacen = o.almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    /* Un toque por vez, no dos: las listas de clientes y de equipo llegan en
       la misma vuelta con milisegundos de diferencia, y cada una sube su
       número. Dos toques seguidos por un solo «llegó algo» se oyen como un
       fallo. 1,5 s es menos que cualquier vuelta y más que esa diferencia.
       `ahora` se inyecta para las pruebas; en el navegador es el reloj. */
    var MINIMO_MS = o.minimoMs == null ? 1500 : Number(o.minimoMs);
    var ahora = o.ahora || function () { return Date.now(); };
    var ultimo = 0;
    var contexto = null;

    function apagado() {
      try { return !!(almacen && almacen.getItem(LLAVE) === 'apagado'); } catch (e) { return false; }
    }
    function poner(off) {
      try { if (almacen) almacen.setItem(LLAVE, off ? 'apagado' : 'encendido'); } catch (e) {}
    }
    function sonar() {
      if (apagado()) return false;
      var t0 = Number(ahora()) || 0;
      if (ultimo && t0 - ultimo < MINIMO_MS) return false;
      var Crear = o.crear
        || (typeof AudioContext !== 'undefined' ? AudioContext
          : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null));
      if (!Crear) return false;
      try {
        if (!contexto) contexto = new Crear();
        if (contexto.state === 'suspended' && contexto.resume) { try { contexto.resume(); } catch (e) {} }
        var osc = contexto.createOscillator(), gan = contexto.createGain();
        var t = Number(contexto.currentTime) || 0;
        osc.type = 'sine';
        osc.frequency.value = 880;
        gan.gain.value = 0.0001;
        osc.connect(gan); gan.connect(contexto.destination);
        if (gan.gain.exponentialRampToValueAtTime) {
          gan.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
          gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        }
        osc.start(t); osc.stop(t + 0.2);
        ultimo = t0;
        return true;
      } catch (e) { return false; }
    }
    return { sonar: sonar, apagado: apagado, poner: poner };
  }

  return {
    HILO_CADA_MS: HILO_CADA_MS,
    LISTA_A_LA_VISTA_MS: LISTA_A_LA_VISTA_MS,
    LISTA_ESCONDIDA_MS: LISTA_ESCONDIDA_MS,
    UMBRAL_ABAJO_PX: UMBRAL_ABAJO_PX,
    ultimoIdDe: ultimoIdDe,
    juntar: juntar,
    estaAbajo: estaAbajo,
    titulo: titulo,
    hilo: hilo,
    lista: lista,
    timbre: timbre
  };
});
