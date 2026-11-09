/* ============================================================================
 * LA PROPUESTA, EN LA APP INSTALADA — 9 de noviembre de 2026
 *
 * EL CASO QUE LO DESTAPÓ. Una clienta nueva se registró en play/ y pidió un
 * crédito. Joan le mandó una contrapropuesta desde el CRM, y el CRM le dijo
 * que «en su app la ve con “Las condiciones de este crédito” y la acepta».
 * Ella abrió la app instalada (app/socio.html) y solo vio «Ya revisamos tu
 * registro · Nos falta un paso de nuestro lado». Escribió por el chat «estoy
 * esperando el desembolso»; Joan no vio ninguna aceptación, fue a su ficha y
 * registró un crédito desde cero, sin la propuesta.
 *
 * LA CAUSA: socio.html NUNCA preguntaba por la solicitud. Ver y aceptar una
 * propuesta solo existía en play/ (cargarMiSolicitud, tarjetaContrapropuesta,
 * aceptarContrapropuesta) y en PlataChat. Desde el 21-oct la app que se
 * instala es socio.html, así que quien pedía en play/ y después abría su app
 * se quedaba sin dónde contestar.
 *
 * QUÉ HACE ESTE ARCHIVO: la misma lógica de play/, portada sin reescribir
 * play/ (es la puerta pública y la de Google Play). Las MISMAS funciones de la
 * base, con los MISMOS parámetros, en el MISMO orden y con los MISMOS
 * respaldos para una base sin la migración:
 *   · mi_solicitud, para saber en qué va (pidió / hay propuesta / aceptó);
 *   · mis_cuentas_de_pago, una vez por solicitud y por cuenta, para ofrecer
 *     las cuentas que dio al registrarse («¿A dónde te consignamos?»);
 *   · aceptar_con_destino {p_id, p_vio, p_destino} y, si la base no la tiene
 *     (404), aceptar_condiciones {p_id, p_vio}; si tampoco esa (404), NO se
 *     acepta: «mejor una aceptación que espera que una sin constancia» (la
 *     regla de play/ desde el 8-oct, segunda vuelta).
 * p_vio sale de CalculadoraSolicitud.paraAceptar(condiciones(sol, {hoy})),
 * exactamente como en play/. Por eso la constancia que queda en la base
 * (condiciones_aceptadas y contrapropuesta.condiciones) es la misma venga de
 * donde venga, el CRM no avisa «aceptó SIN constancia» y descuadreDeConstancia
 * casa. Lo vigila pruebas/la-propuesta-en-la-app.test.js, que acepta la misma
 * propuesta en play/ y en socio.html y compara lo que viajó.
 *
 * UNA DIFERENCIA CON play/, A PROPÓSITO: sin app/calculadora-solicitud.js,
 * play/ acepta con aceptar_contrapropuesta, que no guarda lo que se leyó.
 * Aquí no: sin las condiciones no hay botón de aceptar, y se dice por qué.
 * (En la práctica no pasa: ese archivo va con ?v= y la guardia de la página
 * no arranca sin él.)
 *
 * LO QUE ESTE ARCHIVO NO DECIDE, y lo pone la página:
 *   · cómo se llama a la base (rpc), cómo se cuenta una escritura en camino
 *     (escritura: SE ACTUALIZA SOLA no recarga encima de una aceptación), de
 *     quién es la sesión (quien: el celular, que no cambia al renovar el
 *     token) y dónde se pinta (caja).
 *   · que una cuenta SIN JUNTAR no vea nada de la ficha de su número: eso lo
 *     garantiza la base. mi_solicitud lee «cedula = cel and
 *     solicitud_de_la_cuenta(cel, creada_en)» (base/20261007_una_puerta.sql,
 *     sección 7): si el celular es de una ficha y la cuenta no está junta,
 *     solo devuelve lo que se pidió DESPUÉS de abrir la cuenta; y desde
 *     20261007c sin `datos` ni `registro_id`. Por eso la página NO pregunta
 *     cuando mi_registro contesta 404: esa base todavía no tiene la reja, y
 *     mi_solicitud podría traer la solicitud de otra persona con ese número.
 *
 * EL CLIENTE NUNCA VE PORCENTAJES: las condiciones vienen en pesos
 * (CalculadoraSolicitud.condiciones) y aquí no se escribe ninguna tasa.
 * ==========================================================================*/
/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de
   v139 en sw.js). Va primero: firma que llegó ESTE archivo. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PropuestaEnLaApp = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Las dos que solo leen: no frenan la recarga sola (igual que
     LECTURAS_QUE_NO_FRENAN en play/). Las aceptaciones sí: van por
     `escritura`. */
  var LECTURAS = ['mi_solicitud', 'mis_cuentas_de_pago'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function causaDe(e) {
    if (e && e.causa) return String(e.causa);
    /* La forma de play/ (Error('http 404')), por si alguien le pasa su rpc. */
    var m = String((e && e.message) || '');
    if (/\b404\b/.test(m)) return 'apagado';
    if (/\b401\b|\b403\b/.test(m)) return 'sesion';
    return 'red';
  }
  function propuestaDe(sol) {
    return (sol && sol.contrapropuesta && typeof sol.contrapropuesta === 'object') ? sol.contrapropuesta : null;
  }

  /**
   * Qué hay que mostrar de la solicitud que contestó mi_solicitud: 'espera'
   * (pidió y todavía no hay propuesta), 'propuesta' (está esperando su
   * respuesta), 'aceptada', o null (no hay nada abierto: atendida, descartada,
   * vencida, o ninguna). La misma lectura de cargarMiSolicitud en play/, con
   * una diferencia: play/ solo pinta la espera de lo pedido en play/
   * (pedido.origen), y aquí también la de lo pedido desde esta app
   * (solicitar_por_sesion, sin `pedido`): es lo mismo, «pediste $X».
   */
  function queMostrar(sol) {
    if (!sol || typeof sol !== 'object') return null;
    var cp = propuestaDe(sol);
    if (sol.estado === 'nueva' && !cp) return 'espera';
    if (cp && sol.estado === 'contrapropuesta') return 'propuesta';
    if (cp && sol.estado === 'aceptada') return 'aceptada';
    return null;
  }

  /** Lo pedido, como lo dice tarjetaSolicitudEnEspera de play/. */
  function loPedido(sol) {
    var p = (sol && sol.pedido && typeof sol.pedido === 'object') ? sol.pedido : {};
    var monto = Number(p.capital != null ? p.capital : (sol.pedido_monto || sol.capital)) || 0;
    var fecha = String(p.fecha_pago || sol.fecha_corte || '').slice(0, 10);
    return { monto: Math.round(monto), fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : '' };
  }

  /**
   * El controlador de la pantalla. `o`:
   *   CS, CP        CalculadoraSolicitud y CuentasPago (CP puede faltar);
   *   rpc(fn, cuerpo) → promesa; rechaza con {causa:'sesion'|'apagado'|'red'};
   *   escritura(p)  → p, contándola como escritura en camino;
   *   quien()       → de quién es la sesión (el celular); una respuesta que
   *                   llega cuando ya es otra se calla;
   *   caja()        → el elemento donde se pinta (o null si no está a la vista);
   *   porId(id)     → un elemento de la página;
   *   hoy()         → 'AAAA-MM-DD';
   *   alAceptar()   → después de una aceptación buena (el aparato);
   *   alCambiar()   → cada vez que cambia lo que se sabe (la página repinta
   *                   lo que dice al lado);
   *   textoVencida  → lo que se dice si la sesión ya no vale;
   *   volverAMirar  → el onclick del botón «Volver a mirar».
   */
  function crear(o) {
    o = o || {};
    var CS = o.CS || null, CP = o.CP || null;
    var hoy = function () { try { return o.hoy ? o.hoy() : (CS && CS.hoyISO ? CS.hoyISO() : ''); } catch (e) { return ''; } };
    var porId = function (id) { try { return o.porId ? o.porId(id) : null; } catch (e) { return null; } };
    var quien = function () { try { return String((o.quien && o.quien()) || ''); } catch (e) { return ''; } };
    var escritura = function (p) { return o.escritura ? o.escritura(p) : p; };

    /* Lo que contestó la base: 'sin_preguntar' | 'ok' | 'apagado' | 'error'
       | 'sesion'. `sol` es la de la última respuesta buena. `nota` es el
       aviso de arriba ('cambio', 'sin_destino'). */
    var st = { estado: 'sin_preguntar', sol: null, nota: '', de: '' };
    var turno = 0, aceptando = false;
    /* La propuesta que está en pantalla SIN aceptar (SOL_EN_PANTALLA de
       play/): la casilla, la cuenta elegida y «Acepto» son de ella. */
    var SOL = null;
    /* Por solicitud Y por propuesta (CS.llaveDeCasilla, llaveDeDestino): si
       Joan cambia la propuesta, la marca y la cuenta de la vieja no valen para
       la nueva. En memoria y nunca en el teléfono: la cuenta es un dato de
       pago, y la pestaña se lo lleva al cerrarse. */
    var LEIDAS = {}, DESTINOS = {}, CUENTAS = {};

    function avisarCambio() { if (o.alCambiar) { try { o.alCambiar(); } catch (e) { /* lo de al lado se queda */ } } }
    function pintar() {
      var c = null; try { c = o.caja ? o.caja() : null; } catch (e) { c = null; }
      if (c) c.innerHTML = html();
      avisarCambio();
    }

    /* ---------------------------------------------------------- leer */
    function cargar() {
      var t = ++turno, q = quien();
      var p;
      try { p = o.rpc('mi_solicitud'); } catch (e) { p = Promise.reject({ causa: 'red' }); }
      return Promise.resolve(p).then(function (j) {
        if (t !== turno || q !== quien()) return st;
        /* ok:false es «sin sesión» (celular_de_sesion null): no se sabe nada. */
        if (!j || j.ok !== true) { st.estado = 'error'; return st; }
        st.estado = 'ok'; st.sol = j.solicitud || null; st.de = q; st.nota = '';
        /* 23-oct-2026 (play/) — LA PROPUESTA QUE YA NO ESTÁ SE SUELTA: si la
           base dice que no hay una esperando, lo elegido deja de frenar la
           recarga sola. Solo con una respuesta de la base. */
        if (queMostrar(st.sol) !== 'propuesta') SOL = null;
        return st;
      }, function (e) {
        if (t !== turno || q !== quien()) return st;
        var c = causaDe(e);
        st.estado = c === 'apagado' ? 'apagado' : c === 'sesion' ? 'sesion' : 'error';
        return st;
      });
    }
    /** Lo que se sabe, para que la página diga lo de al lado. */
    function que() { return st.estado === 'ok' ? queMostrar(st.sol) : null; }

    /* ---------------------------------------------------------- pintar */
    function avisoArriba() {
      if (st.nota === 'cambio') {
        return '<div class="aviso ambar"><b>La propuesta cambió mientras la leías.</b> Esta es la nueva: léela antes de aceptar.</div>';
      }
      if (st.nota === 'sin_destino') {
        return '<div class="aviso ambar"><b>Tu aceptación quedó, pero no alcanzamos a guardar a qué cuenta te consignamos.</b> ' +
          'Te lo preguntamos por el chat de la app antes de enviarte la plata.</div>';
      }
      return '';
    }
    function html() {
      if (st.estado === 'apagado') {
        return '<div class="card"><p class="muted" style="margin:0">Todavía no podemos mostrarte aquí tus solicitudes de crédito ' +
          '(no es tu teléfono ni tu internet). Si pediste uno, te respondemos por el chat.</p></div>';
      }
      if (st.estado === 'error') {
        return '<div class="card"><div class="aviso ambar" style="margin-top:0">No pude ver si tienes una solicitud o una propuesta ' +
          'de crédito esperando. Revisa tu internet y vuelve a mirar.</div>' +
          (o.volverAMirar ? '<button class="btn sec sm" style="margin-top:var(--e3)" onclick="' + esc(o.volverAMirar) + '">Volver a mirar</button>' : '') +
          '</div>';
      }
      if (st.estado !== 'ok') return '';
      var sol = st.sol, q = queMostrar(sol);
      if (!q) return '';
      if (q === 'espera') return avisoArriba() + tarjetaEspera(sol);
      return avisoArriba() + tarjetaPropuesta(sol);
    }

    /* (a) PIDIÓ Y TODAVÍA NO HAY PROPUESTA. Sin promesas: ni una hora (la
       contesta una persona) ni un aviso al celular que no existe: la
       propuesta se ve aquí, al abrir la app. */
    function tarjetaEspera(sol) {
      var p = loPedido(sol);
      var P = CS && CS.pesos ? CS.pesos : function (n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); };
      var F = CS && CS.fechaLarga ? CS.fechaLarga : function (f) { return f; };
      return '<div class="card" id="pdaTarjeta"><div class="etq">Tu solicitud de crédito</div>' +
        '<p style="margin:var(--e2) 0 0">Pediste <b>' + esc(P(p.monto)) + '</b>' +
          (p.fecha ? ' para pagar el <b>' + esc(F(p.fecha)) + '</b>' : '') + ': lo estamos revisando.</p>' +
        '<p class="sub"><b>Todavía no es un crédito.</b> Te mandamos una propuesta con el costo exacto en pesos; ' +
          'cuando la tengamos, la ves aquí al abrir la app y la aceptas solo si te sirve.</p>' +
        (sol.pedido_nota ? '<p class="sub">Nos dijiste: «' + esc(sol.pedido_nota) + '»</p>' : '') +
      '</div>';
    }

    /* (b) y (c) — la propuesta, con «Las condiciones de este crédito», la
       cuenta, la casilla y «Acepto»; o, aceptada, a dónde se le consigna. Es
       tarjetaContrapropuesta de play/, con las mismas piezas. */
    function tarjetaPropuesta(sol) {
      var cp = propuestaDe(sol) || {};
      var aceptada = sol.estado === 'aceptada';
      var cond = null;
      try { cond = CS ? CS.condiciones(sol, { hoy: hoy() }) : null; } catch (e) { cond = null; }
      /* Aceptada se SUELTA (21-oct-2026, play/): ya no tiene casilla ni
         cuenta que frenen la recarga sola. */
      SOL = aceptada ? null : sol;
      var P = CS ? CS.pesos : function (n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); };
      var h = '<div class="card" id="pdaTarjeta">' +
        (aceptada ? '' : '<div class="aviso ambar" style="margin-top:0"><b>Te hicimos una propuesta.</b> Está esperando tu respuesta: léela con calma y decide.</div>') +
        '<div class="etq" style="margin-top:var(--e3)">' + (aceptada ? 'Tu crédito, aceptado' : 'Tu propuesta') + '</div>' +
        (cp.texto ? '<p class="sub">' + esc(cp.texto) + '</p>' : '') +
        (cond ? CS.condicionesHTML(cond) : '');
      if (aceptada) {
        /* Con la cuenta que eligió, si la base la guardó para ESTA propuesta
           (CP.destinoVigente); en pantalla solo el final del número. Sin
           fecha: el código no sabe cuándo gira Joan. */
        var dst = null; try { dst = CP ? CP.destinoVigente(sol) : null; } catch (e) { dst = null; }
        h += '<div class="aviso info"><b>Aceptaste: ' + esc(P(cp.capital)) + '.</b> ' +
          (dst
            ? 'Te la consignamos a <b>' + esc(CP.describirDestino(dst)) + '</b>, a tu nombre. Te avisamos <b>por el chat de la app</b> cuando la enviemos. '
            : 'Te avisamos <b>por el chat de la app</b> cuándo y por dónde recibes la plata. ') +
          'No tienes que hacer nada más por ahora.</div>';
        return h + '</div>';
      }
      if (!cond) {
        /* Sin las condiciones no se acepta: una aceptación sin constancia es
           justo lo que play/ dejó de hacer el 8-oct. */
        return h + '<div class="aviso ambar">No pude cargar las condiciones completas de tu propuesta. ' +
          'Vuelve a abrir la app con señal para leerlas y aceptarla; si te urge, escríbenos por el chat.</div></div>';
      }
      var marcada = !!LEIDAS[CS.llaveDeCasilla(sol)];
      h += (preguntaDestino(sol) ? '<div id="cajaDestino">' + eleccionDestinoHTML(sol) + '</div>' : '') +
        CS.casillaHTML('condLeidas', 'marcarCondiciones(this.checked)', marcada) +
        '<p class="sub" style="margin-top:var(--e3)">Si no te cuadra, no aceptes: no pasa nada y no pierdes nada.</p>' +
        /* APAGADO PERO NO MUDO (play/, 8-oct): se ve apagado, se puede tocar,
           y al tocarlo dice qué falta. */
        '<button class="btn arriba" id="btnAceptar" onclick="aceptarContrapropuesta(' + Number(sol.id) + ')"' +
          (marcada ? '' : ' aria-disabled="true" style="opacity:.55"') + '>' +
          'Acepto: recibo ' + esc(P(cp.capital)) + ' y devuelvo ' + esc(P(cp.total)) + '</button>' +
        '<div class="ayuda muted" id="faltaCasilla" style="font-size:13px;margin-top:var(--e2)' + (marcada ? ';display:none' : '') + '">' +
          'Para aceptar, marca primero la casilla de arriba.</div>' +
        '<div id="errAceptar" class="aviso ambar oculto"></div>';
      return h + '</div>';
    }

    /* ---------------------------------------------------------- la casilla */
    function marcar(si) {
      if (!CS || !SOL) return;
      LEIDAS[CS.llaveDeCasilla(SOL)] = !!si;
      var b = porId('btnAceptar');
      if (b && b.setAttribute) {
        if (si) { if (b.removeAttribute) b.removeAttribute('aria-disabled'); if (b.style) b.style.opacity = ''; }
        else { b.setAttribute('aria-disabled', 'true'); if (b.style) b.style.opacity = '.55'; }
      }
      var f = porId('faltaCasilla'); if (f && f.style) f.style.display = si ? 'none' : '';
      var err = porId('errAceptar'); if (err && si && err.classList) err.classList.add('oculto');
    }
    function casillaMarcada() {
      if (!SOL || !CS) return false;
      try { return !!LEIDAS[CS.llaveDeCasilla(SOL)]; } catch (e) { return true; }
    }

    /* ---------------------------------------------------------- la cuenta */
    function preguntaDestino(sol) { return !!(CP && CS && sol); }
    function llaveDeDestino(sol) {
      var cp = propuestaDe(sol) || {};
      return String(sol && sol.id) + '|' + String(cp.creada_en || '');
    }
    function destinoDe(sol) {
      var k = llaveDeDestino(sol);
      if (!DESTINOS[k]) DESTINOS[k] = { eleccion: null, otra: {}, error: '' };
      return DESTINOS[k];
    }
    /* Las cuentas del registro, por mis_cuentas_de_pago (que solo las da si
       el sello del registro casa con esta cuenta). Una vez por solicitud y
       por cuenta: si falla, queda «Escribe tu cuenta», que es lo honesto. */
    function llaveDeCuentas(sol) { return quien() + '|' + String(sol && sol.id); }
    function cuentasDelRegistro(sol) {
      var k = llaveDeCuentas(sol);
      if (CUENTAS[k]) return CUENTAS[k];
      var c = CUENTAS[k] = { estado: 'cargando', opciones: [] };
      var q = quien();
      var listo = function (cuentas) {
        if (q !== quien()) return;
        c.estado = 'ok';
        try { c.opciones = CP ? CP.opcionesDeDestino(cuentas || {}) : []; } catch (e) { c.opciones = []; }
        if (SOL && Number(SOL.id) === Number(sol.id)) repintarDestino();
      };
      var p;
      try { p = o.rpc('mis_cuentas_de_pago', { p_id: Number(sol.id) }); }
      catch (e) { c.estado = 'ok'; return c; }
      Promise.resolve(p).then(function (j) {
        listo(j && j.ok === true && j.cuentas && typeof j.cuentas === 'object' ? j.cuentas : {});
      }, function () { listo({}); });
      return c;
    }
    function opcionesDeDestinoDe(sol) {
      var c = (CP && sol) ? CUENTAS[llaveDeCuentas(sol)] : null;
      return (c && c.estado === 'ok') ? c.opciones : [];
    }
    function eleccionDestinoHTML(sol) {
      var d = destinoDe(sol), c = cuentasDelRegistro(sol);
      return CP.eleccionHTML({ opciones: opcionesDeDestinoDe(sol), cargando: c.estado === 'cargando', estado: d, prefijo: 'dst',
        alElegir: 'elegirDestino', alMedio: 'medioDestino', alEscribir: 'escribirDestino', error: d.error });
    }
    function repintarDestino() {
      var c = porId('cajaDestino');
      if (c && SOL && preguntaDestino(SOL)) c.innerHTML = eleccionDestinoHTML(SOL);
    }
    function elegir(v) {
      if (!SOL) return;
      var d = destinoDe(SOL); d.eleccion = String(v); d.error = '';
      repintarDestino();
    }
    function medio(m) {
      if (!SOL) return;
      var d = destinoDe(SOL);
      d.otra = { medio: String(m || ''), es_mia: !!(d.otra && d.otra.es_mia === true) };
      d.error = '';
      repintarDestino();
    }
    /* Mientras escribe NO se repinta (perdería el foco y el teclado); solo al
       cambiar de banco, porque «Otro» abre la casilla del nombre. */
    function escribir(campo, valor) {
      if (!SOL) return;
      var d = destinoDe(SOL);
      d.otra = d.otra || {};
      if (campo === 'es_mia') { d.otra.es_mia = valor === true; return; }
      d.otra[campo] = String(valor == null ? '' : valor);
      if (campo === 'banco_codigo') {
        var b = CP && CP.bancoPorCodigo(valor);
        d.otra.banco = (b && b.codigo !== 'otro') ? b.nombre : '';
        repintarDestino();
      }
    }
    /* 23-oct-2026 (play/) — LA CUENTA A MEDIO ELEGIR ES COMO LA CASILLA
       MARCADA: el radio, los select y «Es mía» no son texto, y la guarda de
       texto tecleado de app/actualizar.js no los ve. */
    function destinoAMedias() {
      if (!SOL) return false;
      var d = DESTINOS[llaveDeDestino(SOL)];
      if (!d) return false;
      if (d.eleccion != null && String(d.eleccion) !== '') return true;
      var x = d.otra || {};
      return Object.keys(x).some(function (k) { return x[k] === true || (typeof x[k] === 'string' && x[k].trim() !== ''); });
    }
    /** ¿Hay algo a medias que una recarga se llevaría? En CUALQUIER pantalla:
     *  SOL sigue puesta al cambiar de pestaña (solo «Salir» la suelta). */
    function aMedias() { return casillaMarcada() || destinoAMedias() || aceptando; }

    /* ---------------------------------------------------------- aceptar */
    function fallo(el, msg) {
      if (!el) return;
      el.textContent = msg;
      if (el.classList) { el.classList.add('ambar'); el.classList.remove('oculto'); }
    }
    function progreso(el, msg) {
      if (!el) return;
      el.textContent = msg;
      if (el.classList) { el.classList.remove('ambar'); el.classList.remove('oculto'); }
    }
    /* La misma secuencia de aceptarContrapropuesta (play/): la casilla, la
       cuenta, y aceptar_con_destino → (404) aceptar_condiciones → (404) no
       se acepta. La base compara monto, total, fecha y el sello de la
       propuesta: si Joan la cambió mientras leía, contesta 'cambio' y se
       muestra la nueva con la casilla sin marcar. */
    function aceptar(id) {
      var err = porId('errAceptar');
      var sol = (SOL && Number(SOL.id) === Number(id)) ? SOL : null;
      if (!CS || !sol) { fallo(err, 'Vuelve a abrir la app para ver tu propuesta y aceptarla.'); return; }
      if (!LEIDAS[CS.llaveDeCasilla(sol)]) { fallo(err, 'Marca la casilla «' + CS.TEXTO_CASILLA + '» para seguir.'); return; }
      if (aceptando) return;
      var cond = null;
      try { cond = CS.condiciones(sol, { hoy: hoy() }); } catch (e) { cond = null; }
      if (!cond) { fallo(err, 'No pude cargar las condiciones de tu propuesta. Vuelve a abrir la app con señal.'); return; }
      var destino = null;
      if (preguntaDestino(sol)) {
        var de = CP.destinoElegido(opcionesDeDestinoDe(sol), destinoDe(sol));
        if (!de.ok) {
          destinoDe(sol).error = de.motivo;
          repintarDestino();
          fallo(err, de.motivo);
          return;
        }
        destinoDe(sol).error = '';
        destino = de.destino;
      }
      progreso(err, 'Registrando…');
      var q = quien(), sinDestinoGuardado = false;
      var p_vio = CS.paraAceptar(cond);
      var llamar = function (fn, cuerpo) {
        var p;
        try { p = o.rpc(fn, cuerpo); } catch (e) { p = Promise.reject({ causa: 'red' }); }
        return escritura(Promise.resolve(p));
      };
      aceptando = true;
      (destino
        ? llamar('aceptar_con_destino', { p_id: Number(id), p_vio: p_vio, p_destino: destino })
            .catch(function (e) {
              if (causaDe(e) !== 'apagado') throw e;
              sinDestinoGuardado = true;
              return llamar('aceptar_condiciones', { p_id: Number(id), p_vio: p_vio });
            })
        : llamar('aceptar_condiciones', { p_id: Number(id), p_vio: p_vio }))
        .catch(function (e) {
          if (causaDe(e) === 'apagado') return { ok: false, motivo: 'sin_constancia' };
          throw e;
        })
        .then(function (j) {
          aceptando = false;
          if (q !== quien()) return;   // salió mientras contestaba: no se pinta en la cuenta de otro
          err = porId('errAceptar');
          if (j && j.motivo === 'destino') {
            fallo(err, 'No pudimos guardar esa cuenta. Revísala, o elige otra, y vuelve a tocar «Acepto».');
            return;
          }
          if (j && j.motivo === 'sin_constancia') {
            fallo(err, 'No pudimos registrar tu aceptación todavía (no es tu teléfono ni tu internet). ' +
              'Tu propuesta sigue aquí: vuelve a intentarlo más tarde, o escríbenos por el chat de la app y lo resolvemos.');
            return;
          }
          if (!j || j.ok !== true || !j.solicitud) {
            if (j && j.motivo === 'cambio') return recargar('cambio', q);
            fallo(err, 'No pudimos registrar tu aceptación. Vuelve a abrir la app: si la propuesta cambió, verás la nueva.');
            return;
          }
          if (o.alAceptar) { try { o.alAceptar(); } catch (e) { /* el aparato nunca tumba la aceptación */ } }
          st.estado = 'ok'; st.sol = j.solicitud; st.de = q;
          st.nota = sinDestinoGuardado ? 'sin_destino' : '';
          SOL = null;
          pintar();
        })
        .catch(function (e) {
          aceptando = false;
          if (q !== quien()) return;
          fallo(porId('errAceptar'), causaDe(e) === 'sesion' && o.textoVencida ? o.textoVencida
            : 'No pude conectarme. Revisa tu internet y vuelve a intentar.');
        });
    }
    function recargar(nota, q) {
      var p;
      try { p = o.rpc('mi_solicitud'); } catch (e) { p = Promise.reject({ causa: 'red' }); }
      return Promise.resolve(p).then(function (j) {
        if (q !== quien()) return;
        var sol = j && j.ok === true ? j.solicitud : null;
        if (!sol) { fallo(porId('errAceptar'), 'La propuesta cambió mientras la leías. Vuelve a abrir la app para ver la nueva.'); return; }
        st.estado = 'ok'; st.sol = sol; st.de = q; st.nota = nota;
        if (queMostrar(sol) !== 'propuesta') SOL = null;
        pintar();
      }, function () {
        if (q !== quien()) return;
        fallo(porId('errAceptar'), 'La propuesta cambió mientras la leías. Vuelve a abrir la app para ver la nueva.');
      });
    }

    /** «Salir»: nada de esta cuenta se queda para la siguiente. */
    function soltar() {
      turno++;
      st = { estado: 'sin_preguntar', sol: null, nota: '', de: '' };
      SOL = null; LEIDAS = {}; DESTINOS = {}; CUENTAS = {}; aceptando = false;
    }

    return {
      cargar: cargar, html: html, pintar: pintar, que: que,
      marcar: marcar, elegir: elegir, medio: medio, escribir: escribir, aceptar: aceptar,
      casillaMarcada: casillaMarcada, destinoAMedias: destinoAMedias, aMedias: aMedias,
      soltar: soltar,
      /* Para las pruebas y para quien quiera saber en qué va. */
      estado: function () { return { estado: st.estado, que: que(), id: st.sol && st.sol.id != null ? Number(st.sol.id) : null }; },
      enPantalla: function () { return SOL; }
    };
  }

  return {
    VERSION: '2026-11-09',
    LECTURAS: LECTURAS.slice(),
    queMostrar: queMostrar,
    loPedido: loPedido,
    crear: crear
  };
});
