/* ============================================================================
 * EL CRM EN UN CELULAR, SOLO PARA MIRAR — 23 de noviembre de 2026 (etapa U1)
 *
 * Joan, el 23-nov: «quiero poder abrir el crm desde mi celular… tener toda la
 * informacion actualizada en mi telefono, no quiero subir nada a la nube de
 * forma manual… con un unico link». Y ese mismo día: «en el celular me aparece
 * que [un cliente] esta en mora pero el no esta en mora y hay muchas pestañas
 * que no me aparecen». Lo que abría su iPhone era el Panel en el bolsillo, que
 * es otra pantalla con su propia copia. El plan (RECETA-PLAN-UN-SOLO-CRM.md,
 * 6-nov, aprobado) es el MISMO crm.html en el celular.
 *
 * LA IDEA, Y NO SE NEGOCIA: EL CELULAR NUNCA GUARDA LA CARTERA EN LA GAVETA DEL
 * CRM (`joan_socios_v1`). Lo que puede perder un cobro es tener dos gavetas que
 * mandan y se escriben entre sí: pasó el 26-oct, y 23 fichas quedaron
 * «en discusión» casi un mes. Aquí la cartera llega de la nube (panel_traer,
 * con correo y contraseña), se arma en la MEMORIA de la página y se va al
 * cerrar. Sin gaveta no hay qué pisar, ni qué llenar, ni qué dejar en un
 * celular prestado.
 *
 * QUÉ HACE ESTE ARCHIVO
 *   1. La puerta: en un celular sin cartera, correo y contraseña en vez del PIN
 *      (el PIN es de la gaveta de cada navegador: ahí no hay ninguno que valga).
 *   2. Trae el paquete, lo filtra (paqueteParaMirar) y lo arma con
 *      NUBE.aplicarPaquete, que es la conversión que ya tiene pruebas.
 *   3. Tres rejas, de afuera hacia adentro, porque crm.html tiene más de 240
 *      acciones en sus botones y no se pueden vigilar una por una:
 *        a. el filtro de toques: una acción cuyo NOMBRE no está en la lista de
 *           mirar no corre, y se dice por qué. Una función nueva queda
 *           bloqueada por defecto;
 *        b. guardar() se niega (crm.html le pregunta a alGuardar) y la pantalla
 *           vuelve a lo que vino de la nube;
 *        c. la gaveta misma: mientras esto está activo, nadie puede escribir
 *           `joan_socios_v1` en este navegador, ni por un camino que nadie miró.
 *      Y window.open no abre WhatsApp: un mensaje de cobro mandado desde aquí
 *      no quedaría anotado en ninguna parte (Ley 2300: los contactos se cuentan).
 *   4. Vuelve a traer cada 5 minutos con la página a la vista y al volver a
 *      ella: la primera vez todo, después solo lo que cambió (p_desde).
 *
 * QUÉ NO HACE, Y LA PANTALLA LO DICE
 *   · No escribe: cobrar, crear y editar siguen en el computador (etapa U4).
 *   · No trae prospectos, bases ni papeleras: no suben solos desde el
 *     computador y lo de la nube puede ser de agosto. Sus pestañas lo dicen.
 *   · No trae el PIN de nadie: se le quita a `config` antes de armar.
 *   · No sabe si el computador tiene algo sin subir. Dice a qué hora miró y
 *     cuándo fue el último cambio que el computador subió, que es lo que sabe.
 *
 * EN UN COMPUTADOR ESTE ARCHIVO NO HACE NADA: la decisión es por el tipo de
 * aparato (esCelular), nunca por el ancho de la ventana. Un PC con la ventana
 * angosta sigue siendo el PC, con su gaveta y su PIN.
 *
 * La parte de arriba es PURA (sin pantalla, sin red, sin reloj propio) y se
 * prueba en Node: pruebas/crm-remoto.test.js.
 * ==========================================================================*/
/* La firma de llegada, como cada .js que una página pide con ?v= (ver «¿LLEGÓ
   LO QUE PEDÍ?» y la nota de v139 en sw.js). En Node no hay document. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./nube.js'), null);
  else raiz.CrmRemoto = fabrica(raiz.NubeTuGarantia, raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (N, W) {
  'use strict';

  /* ======================================================================
   * LO PURO
   * ====================================================================*/

  /* La gaveta del CRM. Se nombra aquí para PROTEGERLA, nunca para escribirla. */
  var GAVETA = 'joan_socios_v1';
  /* Hasta cuándo vale la entrada en este celular: un instante, nada más. */
  var LLAVE_HASTA = 'joan_crm_remoto';

  /* La conexión de fábrica: la misma decisión del 18-ago en traer.html y
     espejo.html. La llave es pública por diseño; lo secreto es la contraseña.
     pruebas/crm-remoto.test.js comprueba que las tres páginas dicen lo mismo. */
  var CONEXION = {
    url: 'https://wnsioekvjspwtghbodbg.supabase.co',
    anon: 'sb_publishable_uWFyReBljFSh7l0KYkWmmg_Swo4SOxj'
  };

  /* Los ajustes que SÍ pasan al celular. Los tres últimos los sube el
     computador desde el 1-oct; config, plantillas y equipo, desde esta etapa
     (nube-crm.js). Prospectos, bases y papeleras NO: nadie los sube solos, y
     18.190 prospectos no caben en la memoria de un teléfono viejo. */
  var CLAVES_QUE_PASAN = ['config', 'plantillas', 'equipo', 'asignaciones', 'gestiones', 'actosComision'];
  /* Lo de `config` que es de un aparato y no del negocio. El PIN del computador
     no tiene nada que hacer en un teléfono: aquí no abre nada. */
  var CONFIG_QUE_NO_VIAJA = ['pin', 'ultimoRespaldo'];

  var CADA_MS = 5 * 60 * 1000;        // con la página a la vista
  var AL_VOLVER_MS = 60 * 1000;       // al volver a la página, si pasó más de esto

  function lista(v) { return Array.isArray(v) ? v : []; }
  function objeto(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function clonar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function texto(v) { return v == null ? '' : String(v); }

  /** ¿Es un teléfono o una tableta? Por lo que el aparato dice de sí mismo. El
      iPad se presenta como Macintosh desde iPadOS 13: lo delata que se toca. */
  function esCelular(nav) {
    var n = objeto(nav), ua = texto(n.userAgent);
    if (/iPhone|iPod|iPad|Android|Windows Phone/i.test(ua)) return true;
    return /Macintosh/i.test(ua) && Number(n.maxTouchPoints) > 1;
  }

  /** ¿Lo guardado en la gaveta es una cartera con gente? `crudo` es el texto
      tal cual; algo que no se deja leer cuenta como «hay algo» (no se le pasa
      por encima a un disco dañado: crm.html lo dice en su puerta). */
  function gavetaConFichas(crudo) {
    if (!crudo) return false;
    var d;
    try { d = JSON.parse(crudo); } catch (e) { return true; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return true;
    return ['socios', 'clientes', 'prestamos', 'respaldados'].some(function (k) { return lista(d[k]).length > 0; });
  }

  /**
   * Qué puerta le toca a este aparato.
   *   'pin'    el computador, siempre; y cualquier aparato por la puerta del equipo
   *   'correo' un celular sin cartera: correo y contraseña, y se mira desde la nube
   *   'copia'  un celular que ya trajo la cartera con traer.html: su PIN la sigue
   *            abriendo, pero esa copia no es la que manda, y se ofrece ver lo de hoy
   */
  function quePuerta(o) {
    var x = objeto(o);
    if (!x.celular || x.equipo) return 'pin';
    return x.conFichas ? 'copia' : 'correo';
  }

  /** El paquete de panel_traer, con solo lo que un celular puede mirar. No toca
      el que recibe. */
  function paqueteParaMirar(paquete) {
    var p = clonar(objeto(paquete));
    p.ajustes = lista(p.ajustes).filter(function (a) {
      return a && CLAVES_QUE_PASAN.indexOf(texto(a.clave)) >= 0;
    }).map(function (a) {
      if (texto(a.clave) !== 'config') return a;
      var c = objeto(a.datos);
      CONFIG_QUE_NO_VIAJA.forEach(function (k) { delete c[k]; });
      a.datos = c;
      return a;
    });
    return p;
  }

  /** Arma (o pone al día) la cartera en memoria. `previa` es la que ya había, o
      null la primera vez. Devuelve una NUEVA: la previa no se toca. */
  function armar(previa, paquete) {
    var r = N.aplicarPaquete(previa || null, paqueteParaMirar(paquete));
    /* aplicarPaquete conserva de `previa` lo que es de este aparato; aquí no
       hay nada de este aparato que conservar. */
    CONFIG_QUE_NO_VIAJA.forEach(function (k) { if (r.db.config) delete r.db.config[k]; });
    return r;
  }

  /** Lo que trae un paquete, contado: para no abrir nunca un CRM en $0 creyendo
      que es la cartera («no hay nada» y «no me ha llegado» se ven igual). */
  function contar(db) {
    var d = objeto(db);
    return { socios: lista(d.socios).length, creditos: lista(d.prestamos).length, respaldados: lista(d.respaldados).length };
  }

  /** El último cambio que trae el paquete y quién lo subió. Con una traída
      parcial sin filas, se queda el que había. */
  function ultimoCambio(paquete, previo) {
    var p = objeto(paquete), mejor = previo && previo.cuando ? { cuando: previo.cuando, quien: texto(previo.quien) } : null;
    ['socios', 'creditos', 'respaldados', 'ajustes'].forEach(function (t) {
      lista(p[t]).forEach(function (f) {
        if (!f || !f.actualizado_en) return;
        /* De los ajustes solo cuentan los que este celular mira: la papelera de
           agosto no dice nada de hoy. */
        if (t === 'ajustes' && CLAVES_QUE_PASAN.indexOf(texto(f.clave)) < 0) return;
        if (!mejor || Date.parse(f.actualizado_en) > Date.parse(mejor.cuando)) {
          mejor = { cuando: f.actualizado_en, quien: texto(f.actualizado_por) };
        }
      });
    });
    return mejor;
  }

  function dosCifras(n) { return String(n).padStart(2, '0'); }
  /** «9:21 a. m.», a la hora de Colombia de quien mira (la del aparato). */
  function horaCorta(ms) {
    var d = new Date(ms);
    if (isNaN(d)) return '';
    var h = d.getHours(), m = d.getMinutes();
    return ((h % 12) || 12) + ':' + dosCifras(m) + (h < 12 ? ' a. m.' : ' p. m.');
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  /** «hoy, 9:21 a. m.», «ayer, 6:40 p. m.» o «el 18 de nov, 3:05 p. m.». */
  function cuandoFue(ms, ahora) {
    var d = new Date(ms), a = new Date(ahora);
    if (isNaN(d) || isNaN(a)) return '';
    var dia0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    var hora = horaCorta(ms);
    if (ms >= dia0) return 'hoy, ' + hora;
    if (ms >= dia0 - 86400000) return 'ayer, ' + hora;
    return 'el ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ', ' + hora;
  }
  /** «hace un momento», «hace 4 min», «hace 2 h». */
  function haceCuanto(desde, ahora) {
    var s = Math.max(0, Math.round((ahora - desde) / 1000));
    if (s < 90) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + (Math.round(s / 86400) === 1 ? ' día' : ' días');
  }
  /** La medianoche que viene, en el reloj del aparato. */
  function medianocheQueViene(ahora) {
    var a = new Date(ahora);
    return new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1).getTime();
  }

  /** Lo que dice la franja. Solo afirma lo que se midió: a qué hora se miró la
      nube y cuál fue el último cambio que llegó de otro aparato. */
  function textoFranja(e, ahora) {
    var x = objeto(e), partes = [];
    if (x.fallo) {
      partes.push(x.sinRed ? 'Sin señal' : 'No pude mirar la nube');
      if (x.miradoEn) partes.push('son datos de las ' + horaCorta(x.miradoEn));
    } else if (x.miradoEn) {
      partes.push('Mirado en la nube ' + haceCuanto(x.miradoEn, ahora));
    }
    if (x.ultimo && x.ultimo.cuando) {
      var quien = /celular/i.test(texto(x.ultimo.quien)) ? 'desde un celular' : 'de tu computador';
      partes.push('último cambio ' + quien + ': ' + cuandoFue(Date.parse(x.ultimo.cuando), ahora));
    }
    return partes.join(' · ');
  }

  /* ------------------------------------------------------ el filtro de toques
     Una acción pasa SOLO si su nombre está aquí. Es la lista de lo que mira:
     abrir una ficha, cambiar de pestaña, mover el calendario, cerrar un cuadro.
     Lo que no está, no corre: cobrar, crear, editar, borrar, asignar, mandar,
     exportar, subir fotos. Una función nueva en crm.html queda bloqueada hasta
     que alguien la lea y decida ponerla aquí. */
  var MIRAR = [
    'cerrarModal', 'irA', 'irATarjetaChat', 'irHoyCal', 'moverMes', 'alternarOjo',
    'verCliente', 'verCredito', 'verRespaldado', 'verPersona', 'verDia', 'verPasoVentas',
    'verCondicionesAceptadas', 'verBaseDe', 'irGrupoBase', 'irAsesorBase',
    'abrirDesdeBusqueda', 'pintarBusqueda', 'teclasBusqueda',
    'renderCobranzas', 'renderClientes', 'renderCred', 'renderSocios', 'renderCiclos',
    'renderCalendario', 'renderRespaldados', 'renderEquipo',
    'elegirEstrategia', 'soloLosPrimeros', 'revisarCartera', 'verCargaDelEquipo',
    'soyDelEquipo', 'volverAPuertaDeJoan'
  ];
  var MIRAR_SET = {};
  MIRAR.forEach(function (k) { MIRAR_SET[k] = true; });

  /** El nombre de la función que llama un onclick="…" (la primera). Vacío si
      no se entiende: lo que no se entiende no pasa. */
  function accionDe(codigo) {
    var t = texto(codigo).replace(/^\s*(?:return\s+)?/, '');
    /* «event.stopPropagation(); verCliente('x')»: lo primero no es la acción. */
    t = t.replace(/^(?:event\.(?:stopPropagation|preventDefault)\(\)\s*;?\s*)+/, '');
    /* «if(event.target.tagName!=='A')accionNubeTodo()» */
    t = t.replace(/^if\s*\((?:[^()]|\([^()]*\))*\)\s*/, '');
    var m = /^([A-Za-z_$][\w$]*)\s*\(/.exec(t);
    return m ? m[1] : '';
  }
  function esDeMirar(nombre) { return !!nombre && MIRAR_SET[nombre] === true; }
  /** Todas las llamadas de un atributo tienen que ser de mirar: «irA('cred');
      nuevoCredito()» no pasa por empezar con irA. */
  function codigoDeMirar(codigo) {
    var t = texto(codigo), nombres = [], m, re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = re.exec(t))) { if (['if', 'return', 'function'].indexOf(m[2]) < 0) nombres.push(m[2]); }
    if (!nombres.length) return false;
    return nombres.every(esDeMirar);
  }

  /** Un enlace que escribe hacia afuera: WhatsApp y SMS. Llamar (tel:) no se
      bloquea: es lo que Joan haría con el teléfono en la mano de todos modos. */
  function enlaceQueEscribe(href) {
    return /^(https?:)?\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\b|^whatsapp:|^sms:/i.test(texto(href).trim());
  }

  /* Las pestañas que en el celular todavía no pueden decir la verdad, y por
     qué. No se esconden del menú: Joan las busca ahí, y una función que no se
     encuentra no existe; se abren y dicen dónde están. */
  var POR_AHORA_EN_EL_PC = 'Por ahora esto se mira en tu computador.';
  var TAPAS = {
    solicitudes: 'Las solicitudes llegan con la clave del computador, que este celular no tiene. ' + POR_AHORA_EN_EL_PC,
    mensajes: 'El chat llega con la clave del computador, que este celular no tiene. ' + POR_AHORA_EN_EL_PC,
    registrados: 'Los registrados y sus fotos llegan con la clave del computador, que este celular no tiene. ' + POR_AHORA_EN_EL_PC,
    ventas: 'Ventas vive de los prospectos, que no suben solos a la nube. ' + POR_AHORA_EN_EL_PC,
    bases: 'Las bases de prospectos viven en tu computador y no suben solas a la nube. ' + POR_AHORA_EN_EL_PC,
    cfg: 'Los ajustes son de cada aparato: el PIN, el respaldo y la conexión de tu computador no están en este celular.'
  };
  function tapaDe(vista) { return TAPAS[texto(vista)] || ''; }

  var NO_DESDE_AQUI = 'Desde el celular, por ahora, solo se mira. Esto se hace en tu computador.';
  var NO_WHATSAPP = 'Desde aquí no se escribe por WhatsApp: no quedaría anotado. Se hace en tu computador.';

  /** Lo que dice la puerta cuando la nube contesta pero no hay cartera que
      mostrar, o cuando no contesta. Nunca se abre un CRM vacío. */
  function motivoDeNoAbrir(cuenta) {
    var c = objeto(cuenta);
    if (c.socios || c.creditos || c.respaldados) return '';
    return 'La nube contestó, pero no trae ninguna ficha. No abro un CRM vacío: mira en tu computador que diga «Todo sube solo».';
  }

  var puro = {
    GAVETA: GAVETA, LLAVE_HASTA: LLAVE_HASTA, CONEXION: CONEXION,
    CLAVES_QUE_PASAN: CLAVES_QUE_PASAN, CONFIG_QUE_NO_VIAJA: CONFIG_QUE_NO_VIAJA,
    CADA_MS: CADA_MS, AL_VOLVER_MS: AL_VOLVER_MS, MIRAR: MIRAR, TAPAS: TAPAS,
    NO_DESDE_AQUI: NO_DESDE_AQUI, NO_WHATSAPP: NO_WHATSAPP,
    esCelular: esCelular, gavetaConFichas: gavetaConFichas, quePuerta: quePuerta,
    paqueteParaMirar: paqueteParaMirar, armar: armar, contar: contar, ultimoCambio: ultimoCambio,
    horaCorta: horaCorta, cuandoFue: cuandoFue, haceCuanto: haceCuanto,
    medianocheQueViene: medianocheQueViene, textoFranja: textoFranja,
    accionDe: accionDe, esDeMirar: esDeMirar, codigoDeMirar: codigoDeMirar,
    enlaceQueEscribe: enlaceQueEscribe, tapaDe: tapaDe, motivoDeNoAbrir: motivoDeNoAbrir
  };
  if (!W) return puro;                 // en Node, hasta aquí

  /* ======================================================================
   * LO QUE TOCA LA PANTALLA
   * ====================================================================*/
  var D = W.document;
  var E = {
    puerta: 'pin',        // lo que decidió quePuerta al abrir
    activo: false,        // el CRM está abierto mirando desde la nube
    db: null,             // la cartera, SOLO aquí
    desde: null,          // servidor_ahora de la última traída: de ahí en adelante
    ultimo: null,         // { cuando, quien } del último cambio que llegó
    miradoEn: 0,          // cuándo contestó la nube por última vez
    fallo: '', sinRed: false,
    trayendo: false,
    pendiente: false,     // llegó algo y Joan tenía un cuadro abierto: se pinta al soltar
    foto: null,           // DB como texto, justo antes del último toque
    devolviendo: false,   // true mientras se repone la pantalla: sus guardar() no hablan
    ganchos: null, reloj: null, relojFranja: null, aviso: null
  };

  function almacen() { try { return W.localStorage; } catch (e) { return null; } }
  function leerGaveta() { var a = almacen(); try { return a ? a.getItem(GAVETA) : null; } catch (e) { return null; } }
  function esc(s) { return texto(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function $(id) { return D.getElementById(id); }
  function ahora() { return Date.now(); }

  /* ------------------------------------------------- la reja de la gaveta
     Mientras el CRM mira desde la nube, este navegador no puede escribir la
     gaveta del CRM por NINGÚN camino: guardar(), importar un respaldo, cargar
     una base o una función que nadie leyó. Lanza, igual que un navegador sin
     espacio: todo el que escribe esa llave ya sabe qué hacer cuando no entra. */
  var _rejaPuesta = false;
  function ponerRejaDeLaGaveta() {
    if (_rejaPuesta) return;
    try {
      var proto = W.Storage && W.Storage.prototype;
      if (!proto || typeof proto.setItem !== 'function') return;
      var deVerdad = proto.setItem;
      proto.setItem = function (llave, valor) {
        if (E.activo && String(llave) === GAVETA) {
          var e = new Error('Este celular solo mira: la cartera no se guarda aquí.');
          e.name = 'SoloMirar';
          throw e;
        }
        return deVerdad.call(this, llave, valor);
      };
      _rejaPuesta = true;
    } catch (e) { /* un navegador que no deja: quedan las otras dos rejas */ }
  }
  /* WhatsApp no se abre desde aquí aunque la acción que lo pide sea de mirar. */
  var _abrirPuesto = false;
  function ponerRejaDeAbrir() {
    if (_abrirPuesto || typeof W.open !== 'function') return;
    var deVerdad = W.open;
    try {
      W.open = function (url) {
        if (E.activo && enlaceQueEscribe(url)) { decir(NO_WHATSAPP); return null; }
        return deVerdad.apply(W, arguments);
      };
      _abrirPuesto = true;
    } catch (e) { /* idem */ }
  }

  /* ----------------------------------------------------------- los avisos */
  function decir(t) {
    try {
      if (!E.aviso) {
        E.aviso = D.createElement('div');
        E.aviso.className = 'cr-aviso';
        E.aviso.setAttribute('role', 'status');
        E.aviso.setAttribute('data-cr', '1');
        D.body.appendChild(E.aviso);
      }
      E.aviso.textContent = t;
      E.aviso.classList.add('on');
      W.clearTimeout(E.aviso._t);
      E.aviso._t = W.setTimeout(function () { E.aviso.classList.remove('on'); }, 3800);
    } catch (e) { /* sin aviso no se rompe nada: la acción ya no corrió */ }
  }

  /* ------------------------------------------------------- el filtro de toques */
  function cercano(el, sel) { try { return el && el.closest ? el.closest(sel) : null; } catch (e) { return null; } }
  function frenar(ev, t) {
    try { ev.preventDefault(); ev.stopImmediatePropagation(); } catch (e) {}
    decir(t || NO_DESDE_AQUI);
  }
  function alTocar(ev) {
    if (!E.activo) return;
    var el = ev.target;
    if (cercano(el, '[data-cr]')) return;                       // lo nuestro: la franja y su «Salir»
    var a = cercano(el, 'a[href]');
    if (a && enlaceQueEscribe(a.getAttribute('href'))) return frenar(ev, NO_WHATSAPP);
    var f = cercano(el, 'input[type="file"]');
    if (f) return frenar(ev);                                   // fotos y respaldos: ni se abre el selector
    var lab = cercano(el, 'label');
    if (lab && lab.querySelector && lab.querySelector('input[type="file"]')) return frenar(ev);
    var con = cercano(el, '[onclick]');
    if (con && !codigoDeMirar(con.getAttribute('onclick'))) return frenar(ev);
  }
  /* Los onchange y oninput también son acciones (importar, subirFoto…). Frenar
     el evento en la bajada evita que llegue al control; la casilla que ya se
     marcó se devuelve, para que la pantalla no diga algo que no pasó. */
  function alCambiar(ev) {
    if (!E.activo) return;
    var el = ev.target;
    if (!el || !el.getAttribute || cercano(el, '[data-cr]')) return;
    var codigo = el.getAttribute(ev.type === 'input' ? 'oninput' : 'onchange');
    if (!codigo || codigoDeMirar(codigo)) return;
    try { ev.stopImmediatePropagation(); } catch (e) {}
    try { if (el.type === 'checkbox' || el.type === 'radio') el.checked = !el.checked; else if (el.type === 'file') el.value = ''; } catch (e2) {}
    if (ev.type === 'change') decir(NO_DESDE_AQUI);
  }
  /* La foto de la cartera justo ANTES de cada toque: contra ella se mide si una
     acción cambió algo (alGuardar). Se toma en la bajada, antes que nadie. */
  function alBajarElDedo() {
    if (!E.activo || E.devolviendo || !E.ganchos) return;
    try { E.foto = JSON.stringify(E.ganchos.db()); } catch (e) { E.foto = null; }
  }

  /* ---------------------------------------------- lo que le pregunta crm.html */
  function activo() { return E.activo === true; }
  /** Para cargar(): una copia de lo que vino de la nube. cargar() le pone sus
      valores por defecto encima, igual que a lo que lee de la gaveta. */
  function paraCargar() { return clonar(E.db) || {}; }
  /**
   * guardar() en un celular que solo mira. No guarda nunca. Si quien llama es
   * una pintada ('de-fondo') o no cambió nada desde el último toque, calla: no
   * hay nada de Joan que se haya perdido. Si cambió algo, lo dice y devuelve la
   * pantalla a lo que vino de la nube, para que no quede a la vista un cobro
   * que no existe.
   */
  function alGuardar(deFondo) {
    if (E.devolviendo || deFondo) return false;
    var cambio = true;
    try { cambio = E.foto == null || JSON.stringify(E.ganchos.db()) !== E.foto; } catch (e) { cambio = true; }
    if (!cambio) return false;
    decir(NO_DESDE_AQUI);
    devolver();
    return false;
  }
  /* Se repone DESPUÉS de que termine quien llamó: sigue trabajando con sus
     referencias, y cambiarle DB a mitad de una acción la deja a medias. */
  function devolver() {
    if (E.devolviendo) return;
    E.devolviendo = true;
    W.setTimeout(function () {
      try { E.ganchos.repintar(true); } catch (e) { /* la próxima traída lo vuelve a intentar */ }
      E.devolviendo = false;
      E.foto = null;
    }, 0);
  }

  /* -------------------------------------------------------------- la nube */
  function ponerConexionDeFabrica() {
    try {
      var c = N.config();
      if (!c || !c.url || !c.anon) N.guardarConfig({ url: CONEXION.url, anon: CONEXION.anon });
    } catch (e) { /* sin sitio donde guardarla, entrar lo dirá */ }
  }
  function leerHasta() {
    var a = almacen();
    try { var o = JSON.parse((a && a.getItem(LLAVE_HASTA)) || 'null'); return o && Number(o.hasta) ? Number(o.hasta) : 0; } catch (e) { return 0; }
  }
  function ponerHasta(ms) { var a = almacen(); try { if (a) a.setItem(LLAVE_HASTA, JSON.stringify({ hasta: ms })); } catch (e) {} }
  function quitarHasta() { var a = almacen(); try { if (a) a.removeItem(LLAVE_HASTA); } catch (e) {} }
  function motivo(e) { return (e && e.motivo) || (e && e.message) || 'No pude hablar con la nube.'; }

  /** Trae y arma. `todo` = desde cero (la primera vez, y «Actualizar»). */
  function traer(todo) {
    if (E.trayendo) return Promise.resolve(false);
    E.trayendo = true;
    var desde = todo ? null : E.desde;
    return N.traer(desde).then(function (paq) {
      var r = armar(desde ? E.db : null, paq);
      var antes = E.db ? JSON.stringify(E.db) : '';
      E.db = r.db;
      E.desde = (paq && paq.servidor_ahora) || E.desde;
      E.ultimo = ultimoCambio(paq, desde ? E.ultimo : null);
      E.miradoEn = ahora(); E.fallo = ''; E.sinRed = false;
      return JSON.stringify(E.db) !== antes;
    }).then(function (cambio) { E.trayendo = false; return cambio; }, function (e) {
      E.trayendo = false;
      E.fallo = motivo(e); E.sinRed = !!(e && e.sin_red);
      throw e;
    });
  }
  /* Una vuelta del reloj: trae lo nuevo y, si llegó algo, lo pinta cuando Joan
     no tenga un cuadro abierto ni esté escribiendo. */
  function vuelta(todo) {
    if (!E.activo) return Promise.resolve();
    if (ahora() >= leerHasta()) { salir(true); return Promise.resolve(); }
    return traer(todo).then(function (cambio) {
      if (cambio) E.pendiente = true;
      pintarSiSePuede();
      pintarFranja();
    }, function (e) {
      /* La sesión que ya no vale no se arregla sola: a la puerta, y se dice. */
      if (e && (e.estado === 401 || e.estado === 403 || /venció la sesión/i.test(motivo(e)))) return salir(true);
      pintarFranja();
    });
  }
  function pintarSiSePuede() {
    if (!E.pendiente || !E.activo || !E.ganchos) return;
    var ocupado = true;
    try { ocupado = !!E.ganchos.ocupado(); } catch (e) { ocupado = true; }
    if (ocupado) return;
    E.pendiente = false;
    E.devolviendo = true;
    try { E.ganchos.repintar(false); } catch (e) { E.pendiente = true; }
    E.devolviendo = false;
    E.foto = null;
  }

  /* ------------------------------------------------------------ la franja */
  function ponerEstilos() {
    if ($('crEstilos')) return;
    var s = D.createElement('style');
    s.id = 'crEstilos';
    s.textContent =
      '.cr-franja{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;' +
        'margin:0 0 12px;padding:9px 12px;border-radius:12px;background:var(--laca);color:var(--papel);font-size:12.5px;line-height:1.4}' +
      '.cr-franja b{font-weight:800;letter-spacing:.01em}' +
      '.cr-franja .cr-t{flex:1 1 200px;min-width:0;opacity:.86}' +
      '.cr-franja.mal{background:var(--rojo)}' +
      '.cr-franja button{min-height:36px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.34);' +
        'background:transparent;color:inherit;font:inherit;font-weight:700}' +
      '.cr-aviso{position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:400;' +
        'padding:13px 15px;border-radius:12px;background:var(--laca);color:var(--papel);font-size:14px;line-height:1.4;' +
        'box-shadow:0 14px 40px -12px rgba(0,0,0,.55);opacity:0;transform:translateY(8px);pointer-events:none;' +
        'transition:opacity .18s,transform .18s}' +
      '.cr-aviso.on{opacity:1;transform:none}' +
      '.cr-tapa{margin:0 0 14px;padding:16px;border-radius:14px;background:var(--papel);border:1px solid var(--linea);' +
        'font-size:14.5px;line-height:1.5;color:var(--tinta)}' +
      '.cr-tapa b{display:block;margin-bottom:4px}' +
      /* Lo que la barra dice del computador (la subida sola, la sesión del PIN, «pregunto
         cada 45 segundos») no es cierto en un celular que mira: lo dice la franja. */
      'body.solo-mirar #nubeTodoCinta,body.solo-mirar #sesionCinta,body.solo-mirar .avisos-pie{display:none !important}' +
      /* La pestaña que no puede decir la verdad muestra su tapa y nada más. */
      'body.solo-mirar .view.cr-tapada > :not(.cr-tapa):not(.ph){display:none !important}' +
      '.cr-puerta{text-align:left}' +
      '.cr-puerta p{margin:0 0 12px;font-size:13.5px;line-height:1.5;color:var(--tinta)}' +
      '.cr-puerta label{display:block;margin:10px 0 4px;font-size:12px;font-weight:700;color:var(--gris)}' +
      '.gate-card .cr-puerta input{font-family:inherit;font-size:16px;letter-spacing:0;text-align:left;padding:12px}' +
      '.cr-puerta .cr-nota{margin:12px 0 0;font-size:12px;color:var(--gris)}' +
      '@media (prefers-reduced-motion:reduce){.cr-aviso{transition:none}}';
    D.head.appendChild(s);
  }
  function pintarFranja() {
    if (!E.activo) return;
    var caja = $('crFranja');
    if (!caja) {
      var principal = D.querySelector('.main');
      if (!principal) return;
      caja = D.createElement('div');
      caja.id = 'crFranja';
      caja.className = 'cr-franja';
      caja.setAttribute('data-cr', '1');
      caja.innerHTML = '<b>👁 Solo mirar</b><span class="cr-t" id="crFranjaT" aria-live="polite"></span>' +
        '<button type="button" id="crActualizar">Actualizar</button><button type="button" id="crSalir">Salir</button>';
      principal.insertBefore(caja, principal.firstChild);
      $('crActualizar').addEventListener('click', function () {
        $('crFranjaT').textContent = 'Mirando la nube…';
        vuelta(true);
      });
      $('crSalir').addEventListener('click', function () { salir(false); });
    }
    caja.classList.toggle('mal', !!E.fallo);
    $('crFranjaT').textContent = textoFranja(E, ahora());
  }
  /* Las tapas: al entrar y cada vez que crm.html repinta (las vistas no se
     rehacen, así que con ponerlas una vez basta; se revisa por si acaso). */
  function ponerTapas() {
    Object.keys(TAPAS).forEach(function (v) {
      var vista = $('v-' + v);
      if (!vista || vista.querySelector('.cr-tapa')) return;
      var t = D.createElement('div');
      t.className = 'cr-tapa';
      t.setAttribute('data-cr', '1');
      t.innerHTML = '<b>En el celular, todavía no</b>' + esc(TAPAS[v]);
      var cabeza = vista.querySelector('.ph');
      if (cabeza && cabeza.nextSibling) vista.insertBefore(t, cabeza.nextSibling); else vista.insertBefore(t, vista.firstChild);
      vista.classList.add('cr-tapada');
    });
  }

  /* ------------------------------------------------------------ la puerta */
  function puertaDeCorreo() { return E.puerta === 'correo' && !E.activo; }
  function decirEnPuerta(t, tono) {
    var e = $('crErr');
    if (!e) return;
    e.className = 'gate-err' + (tono ? ' ' + tono : '');
    e.textContent = t || '';
  }
  /* La tarjeta del PIN sigue ahí debajo, escondida: «← Soy Joan» la repone con
     innerHTML y crm.html vuelve a llamar aquí (pintarSalidaDeLaPuerta). */
  function pintarPuerta() {
    if (!puertaDeCorreo()) return false;
    var tarjeta = D.querySelector('#gate .gate-card');
    if (!tarjeta) return false;
    ponerEstilos();
    ['pinBtn', 'pinErr', 'salidaPuerta'].forEach(function (id) { var x = $(id); if (x) x.style.display = 'none'; });
    var pin = $('pinInput');
    if (pin && pin.parentNode) pin.parentNode.style.display = 'none';
    if ($('crPuerta')) return true;
    var caja = D.createElement('form');
    caja.id = 'crPuerta';
    caja.className = 'cr-puerta';
    caja.setAttribute('data-cr', '1');
    caja.setAttribute('autocomplete', 'on');
    caja.innerHTML =
      '<p><b>¿Eres Joan?</b> Entra con tu correo y tu contraseña de la nube. No es tu PIN: el PIN vive en tu computador.</p>' +
      '<label for="crCorreo">Correo</label>' +
      '<input id="crCorreo" name="username" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false">' +
      '<label for="crClave">Contraseña</label>' +
      '<input id="crClave" name="password" type="password" autocomplete="current-password">' +
      '<button type="submit" id="crEntrar">Entrar a mirar</button>' +
      '<div class="gate-err" id="crErr" aria-live="polite"></div>' +
      '<p class="cr-nota">Este celular no guarda tu cartera: la trae de la nube cada vez y, por ahora, solo se mira. ' +
      'La entrada vale hasta la medianoche.</p>';
    var equipo = tarjeta.querySelector('.gate-link');
    tarjeta.insertBefore(caja, equipo || null);
    caja.addEventListener('submit', function (ev) { ev.preventDefault(); entrarConCorreo(); });
    try { var s = N.sesion(); if (s && s.correo) $('crCorreo').value = s.correo; } catch (e) {}
    return true;
  }
  function entrarConCorreo() {
    var correo = texto($('crCorreo').value).trim(), clave = $('crClave').value;
    if (!correo || !clave) return decirEnPuerta('Falta tu correo o tu contraseña.');
    $('crEntrar').disabled = true;
    decirEnPuerta('Entrando…', 'aviso');
    ponerConexionDeFabrica();
    N.entrar(correo, clave).then(function () {
      $('crClave').value = '';                // la contraseña no se queda en un campo abierto
      ponerHasta(medianocheQueViene(ahora()));
      return abrirDesdeLaNube();
    }, function (e) {
      decirEnPuerta('No pude entrar: ' + motivo(e));
    }).then(function () { var b = $('crEntrar'); if (b) b.disabled = false; });
  }
  /* Con la sesión ya abierta: trae todo y abre. Si no llega nada, NO abre. */
  function abrirDesdeLaNube() {
    decirEnPuerta('Trayendo tu cartera de la nube…', 'aviso');
    return traer(true).then(function () {
      var no = motivoDeNoAbrir(contar(E.db));
      if (no) { E.db = null; return decirEnPuerta(no); }
      ponerRejaDeLaGaveta();
      ponerRejaDeAbrir();
      ponerEstilos();
      E.activo = true;
      try { D.body.classList.add('solo-mirar'); } catch (e) {}
      E.ganchos.abrir();
      ponerTapas();
      pintarFranja();
      arrancarRelojes();
    }, function (e) {
      E.db = null;
      decirEnPuerta('No pude traer tu cartera: ' + motivo(e));
    });
  }
  function arrancarRelojes() {
    if (E.reloj) return;
    E.reloj = W.setInterval(function () {
      if (D.visibilityState === 'hidden') return;      // en el bolsillo no gasta datos
      if (ahora() - E.miradoEn >= CADA_MS) vuelta(false); else pintarSiSePuede();
    }, 5000);
    E.relojFranja = W.setInterval(pintarFranja, 30000);
    D.addEventListener('visibilitychange', function () {
      if (D.visibilityState !== 'hidden' && ahora() - E.miradoEn >= AL_VOLVER_MS) vuelta(false);
    });
    W.addEventListener('online', function () { vuelta(false); });
  }

  /** «Salir», y la medianoche. Cierra la sesión de la nube en este aparato y
      recarga: de la cartera no queda nada, porque nunca estuvo en el disco. */
  function salir(porVencida) {
    E.activo = false; E.db = null;
    quitarHasta();
    var fin = function () { try { W.location.reload(); } catch (e) {} };
    try { N.salir().then(fin, fin); } catch (e) { fin(); }
    return porVencida;
  }

  /**
   * Al abrir crm.html. Decide la puerta y, si la entrada de hoy sigue valiendo,
   * entra sola. `ganchos` es lo que crm.html presta:
   *   db()            la DB que está pintada
   *   abrir()         quita la puerta y pinta, con la cartera de paraCargar()
   *   repintar(aviso) vuelve a cargar de paraCargar() y pinta
   *   ocupado()       hay un cuadro abierto o un campo con el cursor
   *   equipo()        la página se abrió por la puerta del equipo
   */
  function alAbrir(ganchos) {
    E.ganchos = ganchos;
    var equipo = false;
    try { equipo = !!ganchos.equipo(); } catch (e) {}
    E.puerta = quePuerta({ celular: esCelular(W.navigator), conFichas: gavetaConFichas(leerGaveta()), equipo: equipo });
    if (E.puerta !== 'correo') return E.puerta;
    D.addEventListener('click', alTocar, true);
    D.addEventListener('change', alCambiar, true);
    D.addEventListener('input', alCambiar, true);
    D.addEventListener('pointerdown', alBajarElDedo, true);
    D.addEventListener('keydown', alBajarElDedo, true);
    pintarPuerta();
    var s = null;
    try { s = N.sesion(); } catch (e) {}
    if (s && s.access_token) {
      if (ahora() < leerHasta()) abrirDesdeLaNube();
      /* Una entrada de ayer no abre sola: se cierra de verdad, para que en un
         celular prestado no quede una sesión viva detrás de una puerta. Solo si
         esa entrada la abrió esta puerta (tiene su marca): la sesión del Panel
         en el bolsillo no es nuestra para cerrarla. */
      else if (leerHasta()) { quitarHasta(); try { N.salir(); } catch (e) {} }
    }
    return E.puerta;
  }

  var api = {
    alAbrir: alAbrir, activo: activo, paraCargar: paraCargar, alGuardar: alGuardar,
    puertaDeCorreo: puertaDeCorreo, pintarPuerta: pintarPuerta, salir: salir,
    alRepintar: function () { if (E.activo) { ponerTapas(); pintarFranja(); } },
    _estado: E
  };
  Object.keys(puro).forEach(function (k) { api[k] = puro[k]; });
  return api;
});
