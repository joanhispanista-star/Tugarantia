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
  /* 24-nov-2026 — en un celular que guarda una COPIA de la cartera (la trajo con
     traer.html): Joan ya tocó «Ver lo de hoy». Desde ahí ese celular abre siempre
     lo de la nube, hasta que toque «Volver a la copia de este celular». Es una
     preferencia de este aparato; no es la gaveta ni la toca. */
  var LLAVE_HOY = 'joan_crm_ver_hoy';

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
    var paraMirar = paqueteParaMirar(paquete);
    var r = N.aplicarPaquete(previa || null, paraMirar);
    /* 24-nov-2026 — EN EL CELULAR QUE MIRA, EN LOS AJUSTES MANDA LA NUBE, ENTERA.
       aplicarPaquete está hecho para un aparato que también escribe: al juntar
       una lista con identidad (equipo, asignaciones…) gana lo que ya había acá,
       campo por campo, y nunca quita a nadie. Aquí «lo que había» no es de este
       aparato: es la foto anterior de la nube. Con esa regla, una persona que
       el computador marcó como retirada seguía «activa» en el celular hasta la
       próxima traída completa, y nadie desaparecía. Cada ajuste que trae el
       paquete reemplaza al que había. */
    lista(objeto(paraMirar).ajustes).forEach(function (a) {
      if (a && a.clave != null && a.datos !== undefined && a.datos !== null) r.db[texto(a.clave)] = clonar(a.datos);
    });
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

  /* 24-nov-2026 — LAS PLANTILLAS Y EL EQUIPO, CON SU FECHA. Son del computador:
     el celular las ve como él las subió la última vez. Nacieron diciendo «no sube
     solo todavía: toca ☁ Subir», porque así era; desde ese mismo día el
     computador las sube solas (nube-crm.js, CLAVES_DEL_PC), con el CRM abierto
     allá. La fecha se queda: si el computador lleva días sin abrirse, o todavía
     corre una versión de antes, aquí se ve de cuándo son. Sale del paquete
     (actualizado_en de su ajuste): no es una frase fija. */
  var VISTAS_CON_FECHA = { plantillas: 'plantillas', equipo: 'equipo' };   // vista → clave del ajuste
  var FRASE_DE_VISTA = {
    plantillas: ['Estas plantillas son las que tu computador subió a la nube el {d}.',
                 'Estas plantillas son las de la última vez que tu computador las subió a la nube.'],
    equipo: ['Este equipo es el que tu computador subió a la nube el {d}.',
             'Este equipo es el de la última vez que tu computador lo subió a la nube.']
  };
  /** { clave: actualizado_en } de los ajustes con fecha. Una traída parcial sin
      esa fila deja la que había. */
  function fechasDeAjustes(paquete, previas) {
    var f = {}, p = objeto(previas);
    Object.keys(p).forEach(function (k) { f[k] = p[k]; });
    lista(objeto(paquete).ajustes).forEach(function (a) {
      if (a && a.clave != null && a.actualizado_en) f[texto(a.clave)] = texto(a.actualizado_en);
    });
    return f;
  }
  /** «18 de ago de 2026». */
  function fechaConAnio(ms) {
    var d = new Date(ms);
    if (isNaN(d)) return '';
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }
  /** Lo que dice la pestaña. Sin fecha conocida, también se dice. */
  function notaDeFecha(vista, fechas) {
    var clave = VISTAS_CON_FECHA[texto(vista)];
    if (!clave) return '';
    var iso = objeto(fechas)[clave], cuando = iso ? fechaConAnio(Date.parse(iso)) : '';
    var f = FRASE_DE_VISTA[texto(vista)];
    return (cuando ? f[0].replace('{d}', cuando) : f[1]) +
      ' Lo que cambies allá sube solo, con el CRM abierto en tu computador.';
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
  /* ------------------------------------------------------------ quién entra
     24-nov-2026 — Joan: «no quiero tener que ingresar con correo, por el momento
     solo quiero que sea ingresar con mi numero de celular y la contraseña».
     La cuenta de un celular es la MISMA de la app: Supabase la conoce por un
     correo armado del número (CuentaSocio.correoDeTelefono, app/cuenta.js), y
     quién es dueño lo decide el servidor (la tabla panel_duenos), no esta
     pantalla: un celular que no esté anotado ahí entra a Supabase y panel_traer
     le contesta «no autorizado». El correo de verdad sigue sirviendo (lleva @):
     es la salida mientras el celular no esté anotado.
     `cuenta` es el módulo de app/cuenta.js: una sola forma de armar ese correo. */
  function usuarioDeLaPuerta(valor, cuenta) {
    var v = texto(valor).trim();
    if (!v) return { error: 'Falta tu celular.' };
    if (v.indexOf('@') >= 0) return { correo: v, conCorreo: true };
    if (!cuenta || typeof cuenta.correoDeTelefono !== 'function') return { error: 'No pude leer el celular: recarga la página.' };
    var correo = cuenta.correoDeTelefono(v);
    if (!correo) return { error: 'Ese celular no parece completo: son diez dígitos.' };
    return { correo: correo, conCorreo: false };
  }
  /** El celular de una sesión abierta con celular, para dejarlo escrito en la
      puerta. De una sesión abierta con correo no sale nada: un correo no se
      pinta en un campo de celular. */
  function celularDeSesion(correo, cuenta) {
    try { return (cuenta && typeof cuenta.telefonoDeCorreo === 'function' && cuenta.telefonoDeCorreo(texto(correo))) || ''; } catch (e) { return ''; }
  }
  /** El servidor contestó que esa cuenta no es dueña del CRM: panel_traer lanza
      «no autorizado», y nube.js lo traduce a «…no está en la lista de dueños». */
  function noEsDueno(e) {
    var x = objeto(e), cuerpo = '';
    try { cuerpo = JSON.stringify(x.cuerpo || ''); } catch (e2) {}
    return /no autorizado|lista de dueños/i.test(texto(x.motivo) + ' ' + texto(x.message) + ' ' + cuerpo);
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
    ventas: 'Ventas vive de los prospectos, que no suben solos a la nube. ' + POR_AHORA_EN_EL_PC,
    bases: 'Las bases de prospectos viven en tu computador y no suben solas a la nube. ' + POR_AHORA_EN_EL_PC,
    cfg: 'Los ajustes son de cada aparato: el PIN, el respaldo y la conexión de tu computador no están en este celular.'
  };
  function tapaDe(vista) { return TAPAS[texto(vista)] || ''; }

  /* --------------------------------------------- lo que no se puede, no se ve
     24-nov-2026 — El filtro de toques frena lo que escribe, pero el botón seguía
     a la vista: «＋ Nuevo crédito» en rojo y a todo el ancho, «Pago» en cada
     crédito, «✎ Editar ficha». Un botón que se ve y contesta «aquí no» en cada
     toque es la pantalla prometiendo lo que el código no hace. La MISMA regla
     del filtro decide qué se esconde (codigoDeMirar): no hay una segunda lista
     que se pueda quedar vieja.
     Recibe lo que se sabe de un control y dice qué hacer con él:
       'esconder'  botones y enlaces que escriben, WhatsApp, subir archivos,
                   casillas que marcan algo
       'aquietar'  campos y listas cuyo cambio no se va a oír: se apagan, para
                   que no parezca que se escogió algo
       ''          se queda como está (lo que mira, lo que no tiene acción, y lo
                   que NO es un control: una fila o una tarjeta con onclick sigue
                   mostrando su dato, solo que el toque no hace nada). */
  function queHacerConElControl(c) {
    var x = objeto(c), etiqueta = texto(x.etiqueta).toUpperCase(), tipo = texto(x.tipo).toLowerCase();
    if (etiqueta === 'INPUT' && tipo === 'file') return 'esconder';
    if (x.conArchivo === true) return 'esconder';                       // la caja <label> de subir una foto
    if (x.href && enlaceQueEscribe(x.href)) return 'esconder';
    var boton = etiqueta === 'BUTTON' || etiqueta === 'A' || x.esBoton === true;
    if (boton && texto(x.onclick)) return codigoDeMirar(x.onclick) ? '' : 'esconder';
    if (etiqueta === 'INPUT' && (tipo === 'checkbox' || tipo === 'radio')) {
      var marca = texto(x.onchange) || texto(x.onclick);
      return marca && !codigoDeMirar(marca) ? 'esconder' : '';
    }
    if (etiqueta === 'INPUT' || etiqueta === 'SELECT' || etiqueta === 'TEXTAREA') {
      var cambia = [x.oninput, x.onchange].map(texto).filter(Boolean);
      return cambia.length && !cambia.every(codigoDeMirar) ? 'aquietar' : '';
    }
    return '';
  }

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
    fechasDeAjustes: fechasDeAjustes, fechaConAnio: fechaConAnio, notaDeFecha: notaDeFecha,
    celularBonito: celularBonito, chipsDeRegistro: chipsDeRegistro, tarjetaDeRegistro: tarjetaDeRegistro,
    listaDeRegistrados: listaDeRegistrados,
    GAVETA: GAVETA, LLAVE_HASTA: LLAVE_HASTA, CONEXION: CONEXION,
    CLAVES_QUE_PASAN: CLAVES_QUE_PASAN, CONFIG_QUE_NO_VIAJA: CONFIG_QUE_NO_VIAJA,
    CADA_MS: CADA_MS, AL_VOLVER_MS: AL_VOLVER_MS, MIRAR: MIRAR, TAPAS: TAPAS,
    NO_DESDE_AQUI: NO_DESDE_AQUI, NO_WHATSAPP: NO_WHATSAPP,
    esCelular: esCelular, gavetaConFichas: gavetaConFichas, quePuerta: quePuerta,
    paqueteParaMirar: paqueteParaMirar, armar: armar, contar: contar, ultimoCambio: ultimoCambio,
    horaCorta: horaCorta, cuandoFue: cuandoFue, haceCuanto: haceCuanto,
    usuarioDeLaPuerta: usuarioDeLaPuerta, celularDeSesion: celularDeSesion, noEsDueno: noEsDueno, textoFranja: textoFranja,
    accionDe: accionDe, esDeMirar: esDeMirar, codigoDeMirar: codigoDeMirar,
    enlaceQueEscribe: enlaceQueEscribe, tapaDe: tapaDe, motivoDeNoAbrir: motivoDeNoAbrir,
    queHacerConElControl: queHacerConElControl
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
    ganchos: null, reloj: null, relojFranja: null, aviso: null,
    vigia: null,          // el que avisa cuando crm.html pinta algo (el barrido)
    esperando: false,     // hay sesión guardada pero la primera traída falló: se reintenta
    veniaDeCopia: false,  // este celular guarda una copia y Joan escogió ver lo de hoy
    /* 📥 Registrados, mirando (ver más abajo). Solo en memoria. */
    reg: { estado: 'nada', filas: [], nuevos: 0, pedidosLeidos: true, leidoEn: 0, pedidoEn: 0, error: '', sinRed: false, enCurso: null }
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
    if (cercano(el, '.navbtn[data-v="registrados"]')) traerRegistrados(false);   // al abrir su pestaña, se vuelve a mirar
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

  /* --------------------------------------------- el barrido: esconder y aquietar
     Cada vez que crm.html pinta algo (una tabla, un cuadro), se mira lo recién
     pintado y se esconde lo que no se puede usar. Un vigía (MutationObserver)
     avisa ANTES de que el navegador lo dibuje, así que el botón no alcanza a
     verse. Lo que se esconde sigue frenado por el filtro de toques: esto es lo
     que se ve, la reja es aquello. */
  var QUE_SE_MIRA = '[onclick],[onchange],[oninput],a[href],input[type="file"]';
  function atributo(el, k) { try { return el.getAttribute(k); } catch (e) { return null; } }
  function barrerUno(el) {
    if (!el || !el.getAttribute || cercano(el, '[data-cr]')) return;
    var que = queHacerConElControl({
      etiqueta: el.tagName, tipo: atributo(el, 'type'),
      esBoton: !!(el.classList && el.classList.contains('btn')),
      onclick: atributo(el, 'onclick'), onchange: atributo(el, 'onchange'), oninput: atributo(el, 'oninput'),
      href: el.tagName === 'A' ? atributo(el, 'href') : ''
    });
    if (que === 'esconder') {
      el.classList.add('cr-no');
      /* La caja de subir una foto es el <label> que envuelve al campo. */
      if (el.tagName === 'INPUT' && atributo(el, 'type') === 'file') { var caja = cercano(el, 'label'); if (caja) caja.classList.add('cr-no'); }
    } else if (que === 'aquietar') {
      /* Un texto se deja LEER (readonly): apagado saldría gris, y las plantillas
         son justo para leerlas. Una lista o una fecha sí se apagan. */
      try {
        var deTexto = el.tagName === 'TEXTAREA' ||
          (el.tagName === 'INPUT' && !/^(checkbox|radio|range|color|date|time|month|week|datetime-local|file)$/i.test(atributo(el, 'type') || ''));
        if (deTexto) el.readOnly = true; else el.disabled = true;
        el.classList.add('cr-quieto');
      } catch (e) {}
    }
  }
  function barrer(raizDelBarrido) {
    if (!E.activo) return 0;
    var r = raizDelBarrido || D, n = 0;
    try {
      if (r.matches && r.matches(QUE_SE_MIRA)) { barrerUno(r); n++; }
      var todos = r.querySelectorAll ? r.querySelectorAll(QUE_SE_MIRA) : [];
      for (var i = 0; i < todos.length; i++) { barrerUno(todos[i]); n++; }
    } catch (e) { /* un navegador que no deja: el filtro de toques sigue ahí */ }
    return n;
  }
  function ponerVigiaDelBarrido() {
    if (E.vigia || typeof W.MutationObserver !== 'function') return;
    try {
      E.vigia = new W.MutationObserver(function (cambios) {
        if (!E.activo) return;
        for (var i = 0; i < cambios.length; i++) {
          var nuevos = cambios[i].addedNodes || [];
          for (var j = 0; j < nuevos.length; j++) if (nuevos[j] && nuevos[j].nodeType === 1) barrer(nuevos[j]);
        }
      });
      E.vigia.observe(D.body, { childList: true, subtree: true });
    } catch (e) { E.vigia = null; }
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
  /* 24-nov-2026 — LA MARCA YA NO VENCE. Joan: «como yo soy el dueño quiero que el
     CRM siempre este abierto en mi celular, como cuando tu abres whatsapp». Antes
     la entrada valía hasta la medianoche. La marca sigue existiendo porque dice
     OTRA cosa: que esta sesión de la nube la abrió ESTA puerta. Sin ella, la
     sesión que deja el Panel en el bolsillo abriría el CRM sola.
     Lo que cierra ahora: «Salir», o que el servidor diga que la sesión ya no vale. */
  function hayMarca() {
    var a = almacen();
    try { return !!(a && a.getItem(LLAVE_HASTA)); } catch (e) { return false; }
  }
  function ponerMarca() { var a = almacen(); try { if (a) a.setItem(LLAVE_HASTA, JSON.stringify({ desde: ahora(), siempre: true })); } catch (e) {} }
  function quitarHasta() { var a = almacen(); try { if (a) a.removeItem(LLAVE_HASTA); } catch (e) {} }
  function quiereVerHoy() { var a = almacen(); try { return !!(a && a.getItem(LLAVE_HOY)); } catch (e) { return false; } }
  function ponerQuiereVerHoy(si) {
    var a = almacen();
    try { if (!a) return; if (si) a.setItem(LLAVE_HOY, String(ahora())); else a.removeItem(LLAVE_HOY); } catch (e) {}
  }
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
      E.fechas = fechasDeAjustes(paq, desde ? E.fechas : null);
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
    return traer(todo).then(function (cambio) {
      if (cambio) E.pendiente = true;
      pintarSiSePuede();
      pintarFranja();
      ponerFechas();
      traerRegistrados(false);
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
      '.cr-franja button,.cr-franja a.cr-ir{min-height:36px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.34);' +
        'background:transparent;color:inherit;font:inherit;font-weight:700}' +
      '.cr-franja a.cr-ir{display:inline-flex;align-items:center;text-decoration:none}' +
      '.cr-aviso{position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:400;' +
        'padding:13px 15px;border-radius:12px;background:var(--laca);color:var(--papel);font-size:14px;line-height:1.4;' +
        'box-shadow:0 14px 40px -12px rgba(0,0,0,.55);opacity:0;transform:translateY(8px);pointer-events:none;' +
        'transition:opacity .18s,transform .18s}' +
      '.cr-aviso.on{opacity:1;transform:none}' +
      '.cr-tapa{margin:0 0 14px;padding:16px;border-radius:14px;background:var(--papel);border:1px solid var(--linea);' +
        'font-size:14.5px;line-height:1.5;color:var(--tinta)}' +
      '.cr-tapa b{display:block;margin-bottom:4px}' +
      '.cr-tapa.cr-lista{padding:0;border:0;background:none}' +
      /* «🔎 Revisar a todos» abre revision.html, que pregunta con la clave del computador:
         en el celular no tiene cómo. Es un enlace sin onclick, así que el barrido no lo ve. */
      'body.solo-mirar a[href="revision.html"]{display:none !important}' +
      '.cr-reg-cab{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 10px}' +
      '.cr-reg-cab b{font-size:16px}.cr-reg-cab span{flex:1 1 140px;font-size:12px;color:var(--gris)}' +
      '.cr-reg-mirar{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--linea);background:var(--papel);' +
        'color:var(--tinta);font:inherit;font-weight:700;font-size:13.5px}' +
      '.cr-reg{margin:0 0 10px;padding:14px;border-radius:14px;background:var(--papel);border:1px solid var(--linea)}' +
      '.cr-reg-nombre{display:block;font-size:15.5px;overflow-wrap:anywhere}' +
      '.cr-reg-cuando{margin-top:2px;font-size:12.5px;color:var(--gris)}' +
      '.cr-reg-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
      '.cr-reg-chips span{padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--ambar-tinte,#fbeedb);color:var(--ambar,#9a5b12)}' +
      '.cr-reg-fila{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;font-size:14px}' +
      '.cr-reg-fila span{color:var(--gris)}.cr-reg-fila i{font-style:normal;font-weight:400;color:var(--gris)}' +
      '.cr-reg-tel{display:inline-flex;align-items:center;min-height:44px;font-weight:700;color:var(--tinta)}' +
      '.cr-reg-mini{margin-top:6px;font-size:12.5px;color:var(--gris)}' +
      '.cr-reg-aviso{margin:0 0 10px;padding:12px 14px;border-radius:12px;font-size:13.5px;line-height:1.45;' +
        'background:var(--ambar-tinte,#fbeedb);color:var(--ambar,#9a5b12)}' +
      '.cr-reg-aviso.suave{background:var(--papel);color:var(--gris);border:1px solid var(--linea)}' +
      '.cr-reg-pie{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--gris)}.cr-reg-pie a{color:inherit;font-weight:700}' +
      '.cr-fecha{margin:0 0 12px;padding:10px 12px;border-radius:12px;border:1px dashed var(--linea);' +
        'font-size:12.5px;line-height:1.45;color:var(--gris)}' +
      /* Lo que la barra dice del computador (la subida sola, la sesión del PIN, «pregunto
         cada 45 segundos») no es cierto en un celular que mira: lo dice la franja. */
      'body.solo-mirar #nubeTodoCinta,body.solo-mirar #sesionCinta,body.solo-mirar .avisos-pie{display:none !important}' +
      /* La pestaña que no puede decir la verdad muestra su tapa y nada más. */
      'body.solo-mirar .view.cr-tapada > :not(.cr-tapa):not(.ph){display:none !important}' +
      /* …y su botón del menú lleva la marca «PC» (ponerTapas). */
      'body.solo-mirar .navbtn.cr-en-pc{opacity:.62}' +
      'body.solo-mirar .navbtn.cr-en-pc::after{content:"PC";margin-left:auto;padding:1px 6px;border-radius:999px;' +
        'border:1px solid currentColor;font-size:9.5px;font-weight:800;letter-spacing:.05em;line-height:1.3}' +
      /* Lo que no se puede, no se ve (el barrido). */
      'body.solo-mirar .cr-no{display:none !important}' +
      'body.solo-mirar .cr-quieto:disabled{opacity:.55}' +
      /* En un telefono la franja es fija arriba y cada pixel de alto se paga en
         todas las pantallas: el aviso y la hora a la izquierda, en dos renglones,
         y los botones a la derecha, a 44 px. Media 112 px; quedó en 68, y en 81 desde
         que entró «Cobrar» (24-nov): con tres controles el texto se parte en tres líneas. */
      '@media (max-width:880px){' +
        '.cr-franja{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:2px 6px;align-items:center;' +
          'margin:0 0 10px;padding:8px 8px 8px 12px;font-size:11.5px;line-height:1.35}' +
        '.cr-franja b{grid-column:1;grid-row:1;font-size:12.5px}' +
        '.cr-franja .cr-t{grid-column:1;grid-row:2;flex:none}' +
        '.cr-franja button,.cr-franja a.cr-ir{grid-row:1/3;min-height:44px;padding:0 10px}' +
        '.cr-franja .cr-tx{display:none}' +
        '.cr-franja #crActualizar{min-width:44px;padding:0;font-size:19px;line-height:1}' +
      '}' +
      '.cr-puerta{text-align:left}' +
      '.cr-puerta p{margin:0 0 12px;font-size:13.5px;line-height:1.5;color:var(--tinta)}' +
      '.cr-puerta label{display:block;margin:10px 0 4px;font-size:12px;font-weight:700;color:var(--gris)}' +
      '.gate-card .cr-puerta input{font-family:inherit;font-size:16px;letter-spacing:0;text-align:left;padding:12px}' +
      '.cr-puerta .cr-nota{margin:12px 0 0;font-size:12px;color:var(--gris)}' +
      '.gate-card .cr-copia{margin:14px 0 0;padding:14px;border:1px solid var(--linea);border-radius:12px}' +
      '#crFranjaCopia{grid-column:1/-1;margin:0;border-radius:0;z-index:60;padding-top:calc(9px + env(safe-area-inset-top,0px))}' +
      '.gate-card .cr-copia .cr-hoy{display:block;width:100%;min-height:48px;margin:0;padding:0 14px;border-radius:12px;' +
        'border:1.5px solid var(--tinta);background:transparent;color:var(--tinta);font:inherit;font-weight:700;font-size:15px}' +
      '.gate-card .cr-puerta .cr-otra{display:block;width:100%;min-height:44px;margin:8px 0 0;padding:0;border:0;background:none;' +
        'color:var(--gris);font:inherit;font-size:13px;font-weight:600;text-decoration:underline}' +
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
      /* 24-nov-2026 — «COBRAR» LLEVA AL PANEL EN EL BOLSILLO. Desde que «Soy Joan» trae
         al celular hasta aquí (panel/index.html), este CRM es lo primero que abre, y es
         solo para mirar: los botones de cobrar están escondidos. Sin este enlace, el
         sitio donde SÍ se registra un cobro en la calle quedaba sin camino. Es un
         enlace de verdad (href), no un onclick: alTocar lo deja pasar por data-cr. */
      caja.innerHTML = '<b>👁 Solo mirar</b><span class="cr-t" id="crFranjaT" aria-live="polite"></span>' +
        '<a class="cr-ir" id="crCobrar" href="espejo.html" title="Abre el Panel en el bolsillo, donde se registra un cobro">Cobrar</a>' +
        '<button type="button" id="crActualizar" aria-label="Actualizar"><span aria-hidden="true">↻</span><span class="cr-tx"> Actualizar</span></button>' +
        '<button type="button" id="crSalir">Salir</button>';
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
  function ponerFechas() {
    Object.keys(VISTAS_CON_FECHA).forEach(function (v) {
      var vista = $('v-' + v);
      if (!vista) return;
      var n = $('crFecha-' + v);
      if (!n) {
        n = D.createElement('div');
        n.id = 'crFecha-' + v;
        n.className = 'cr-fecha';
        n.setAttribute('data-cr', '1');
        var cabeza = vista.querySelector('.ph');
        if (cabeza && cabeza.nextSibling) vista.insertBefore(n, cabeza.nextSibling); else vista.insertBefore(n, vista.firstChild);
      }
      n.textContent = notaDeFecha(v, E.fechas);
    });
  }
  function ponerTapas() {
    ponerFechas();
    Object.keys(TAPAS).forEach(function (v) {
      /* 24-nov-2026 — y su botón del menú lo dice ANTES de tocarlo: una marca «PC».
         Seis pestañas que abren para decir «todavía no» sin avisar eran seis
         toques perdidos (y en la hoja de «Más» del teléfono van al final). */
      try { var boton = D.querySelector('.navbtn[data-v="' + v + '"]'); if (boton) boton.classList.add('cr-en-pc'); } catch (e) {}
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


  /* ------------------------------------------- 📥 Registrados, en el celular
     24-nov-2026 — Joan: «tanto para crm de pc como de celular… quiero que se vea
     la hora y fecha de registro». La pestaña estaba tapada: todo lo que pinta
     crm.html ahí (renderRegistros y sus vecinos) se pregunta con la CLAVE del
     computador, que el celular no tiene. Pero la base ya tiene una puerta para
     la SESIÓN del dueño, panel_registros (base/20261002_panel_registros.sql),
     la misma que usa el Panel en el bolsillo: trae quién se registró, cuándo,
     de dónde, si su cédula no cuadra y qué pidió. A PROPÓSITO no trae las fotos
     ni sus datos completos: eso se mira en el computador, y la pantalla lo dice.
     Se pinta AQUÍ, en una lista propia, y la vista sigue «tapada» para lo que
     pinta crm.html (que sin clave diría «Conéctala en Ajustes», y Ajustes no
     está en el celular). Nada de esto se guarda en el teléfono: vive en E.reg.
     Nunca se llama a una función de clave desde aquí: clave_ok cuenta los
     intentos de TODOS los aparatos y dejaría afuera al computador. */
  var LIMITE_REGISTRADOS = 100;
  function celularBonito(v) {
    var d = texto(v).replace(/\D/g, '').slice(-10);
    return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : '';
  }
  function enPesos(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  /* Las mismas píldoras, con las mismas palabras, del Panel en el bolsillo
     (tarjetaRegistro, panel/espejo.html): salen SOLO cuando dicen algo, y nunca
     en verde — un visto bueno junto a un nombre se lee como «la casa comprobó
     quién es», y eso no se comprueba. */
  function chipsDeRegistro(r) {
    var x = objeto(r), c = objeto(x.cotejo), out = [];
    if (c.menor) out.push('Su cédula dice que es menor de edad');
    if (c.documento_imposible) out.push('Marcó otro documento');
    if (c.estado === 'no_cuadra' && !c.menor && !c.documento_imposible) out.push('No cuadra con el código de su cédula');
    if (c.cedula_repetida) out.push('Cédula repetida');
    if (x.app === 'platachat') out.push('PlataChat');
    return out;
  }
  /** Una persona. `o`: {ahora, pedidosLeidos, cruce(r) → texto o ''}. */
  function tarjetaDeRegistro(r, o) {
    var x = objeto(r), op = objeto(o);
    var ms = Date.parse(texto(x.creado_en));
    var cuando = isNaN(ms) ? '' : cuandoFue(ms, op.ahora);
    var lugar = [x.ciudad, x.barrio].filter(Boolean).map(texto).join(' · ');
    var chips = chipsDeRegistro(x);
    var cruce = '';
    try { cruce = typeof op.cruce === 'function' ? texto(op.cruce(x)) : ''; } catch (e) { cruce = ''; }
    if (cruce) chips.push(cruce);
    var ped = x.pedido, pidio = '';
    if (ped && typeof ped === 'object') {
      /* «Pidió» es SOLO lo que la persona pidió: sin cifra suya, no se le pone una. */
      pidio = '<div class="cr-reg-fila"><span>Pidió</span><b>' + (Number(ped.monto) > 0 ? esc(enPesos(ped.monto)) : 'un crédito') +
        ' <i>· ' + (ped.producto === 'respaldado' ? 'con garantía' : 'quincenal') + '</i></b></div>' +
        (ped.nota ? '<div class="cr-reg-mini">«' + esc(ped.nota) + '»</div>' : '');
    } else if (op.pedidosLeidos !== false) {
      pidio = '<div class="cr-reg-mini">No le veo ninguna solicitud de crédito.</div>';
    }
    var cel = celularBonito(x.telefono), diez = cel.replace(/ /g, '');
    return '<div class="cr-reg">' +
      '<b class="cr-reg-nombre">' + esc(x.nombre || 'Sin nombre') + '</b>' +
      '<div class="cr-reg-cuando">' + (cuando ? 'Se registró ' + esc(cuando) : 'No sé cuándo se registró') + (lugar ? ' · ' + esc(lugar) : '') + '</div>' +
      (chips.length ? '<div class="cr-reg-chips">' + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
      pidio +
      (cel ? '<div class="cr-reg-fila"><span>Celular</span><a class="cr-reg-tel" href="tel:+57' + esc(diez) + '">' + esc(cel) + ' · Llamar</a></div>'
           : '<div class="cr-reg-mini">No dejó un celular de 10 dígitos.</div>') +
      '</div>';
  }
  /** Toda la lista, con su estado dicho. `reg` es E.reg; `o`: {ahora, cruce}. */
  function listaDeRegistrados(reg, o) {
    var g = objeto(reg), op = objeto(o), filas = lista(g.filas), n = filas.length;
    var mirar = '<button type="button" class="cr-reg-mirar" id="crRegMirar"' + (g.estado === 'cargando' ? ' disabled' : '') + '>↻ Volver a mirar</button>';
    var pie = '<p class="cr-reg-pie">Sus fotos, todos sus datos y la revisión se miran en tu computador (📥 Registrados). ' +
      'Para juntar su cuenta desde el celular, <a href="espejo.html">abre el Panel en el bolsillo</a>.</p>';
    if (g.estado === 'falta') {
      return '<div class="cr-reg-aviso"><b>Tu base todavía no tiene esta parte.</b> Corre base/20261002_panel_registros.sql en el ' +
        'SQL Editor de Supabase y vuelve a mirar.</div>' + mirar;
    }
    var aviso = '';
    if (g.estado === 'error') {
      aviso = '<div class="cr-reg-aviso"><b>' + (g.sinRed ? 'Sin señal: no pude mirar quién se registró.' : 'No pude mirar quién se registró.') + '</b> ' +
        (g.sinRed ? '' : esc(g.error || '') + ' ') + 'Eso <b>no</b> quiere decir que no haya nadie.' +
        (n ? ' Abajo va la lista de la última vez que contestó la nube.' : '') + '</div>';
    }
    if (!n && (g.estado === 'nada' || g.estado === 'cargando')) return '<div class="cr-reg-aviso suave">Mirando quién se registró…</div>';
    var total = Math.max(Number(g.nuevos) || 0, n);
    var cab = '<div class="cr-reg-cab"><b>' + (g.estado === 'error' && !n ? 'Registrados' : total === 1 ? '1 persona esperando' : total + ' personas esperando') + '</b>' +
      '<span>' + (g.leidoEn ? 'La nube contestó ' + esc(cuandoFue(g.leidoEn, op.ahora)) : '') + '</span>' + mirar + '</div>';
    if (!n) return cab + aviso + (g.estado === 'ok' ? '<div class="cr-reg-aviso suave">Nadie esperando: no hay registros nuevos.</div>' : '') + pie;
    return cab + aviso +
      (total > n ? '<div class="cr-reg-mini">Se ven los ' + n + ' más recientes de ' + total + '. Los demás, en el computador.</div>' : '') +
      filas.map(function (r) { return tarjetaDeRegistro(r, { ahora: op.ahora, pedidosLeidos: g.pedidosLeidos, cruce: op.cruce }); }).join('') + pie;
  }
  /* ¿Ya es cliente? La misma pregunta de la bandeja del computador
     (candidatosDeCruce, en el puente), contra la cartera que está en memoria. */
  function cruceConLaCartera(r) {
    var P = W.PuenteTuGarantia;
    if (!P || typeof P.candidatosDeCruce !== 'function' || !E.db) return '';
    var c = P.candidatosDeCruce(E.db, { cedula: r.cedula, telefono: r.telefono, nombre: r.nombre })[0];
    if (!c || !c.socio) return '';
    var cod = typeof P.codCliente === 'function' ? P.codCliente(c.socio) : texto(c.socio.nombre);
    if (c.fuerza >= 2) return 'Ya es tu cliente: ' + cod;
    if (c.fuerza === 1) return 'Mismo celular que ' + cod + ', otra cédula';
    return '';
  }
  function pintarRegistrados() {
    var vista = $('v-registrados');
    if (!vista) return;
    var c = $('crRegistrados');
    if (!c) {
      c = D.createElement('div');
      c.id = 'crRegistrados';
      c.className = 'cr-tapa cr-lista';      // cr-tapa: es lo único de la vista que se ve en el celular
      c.setAttribute('data-cr', '1');
      var cabeza = vista.querySelector('.ph');
      if (cabeza && cabeza.nextSibling) vista.insertBefore(c, cabeza.nextSibling); else vista.insertBefore(c, vista.firstChild);
      vista.classList.add('cr-tapada');
    }
    c.innerHTML = listaDeRegistrados(E.reg, { ahora: ahora(), cruce: cruceConLaCartera });
    var b = $('crRegMirar');
    if (b) b.addEventListener('click', function () { traerRegistrados(true); });
  }
  /* Pregunta con la SESIÓN del dueño. Un 404 es la base sin ese SQL; lo demás se
     dice tal cual y deja la lista que hubiera («no pude preguntar» no es «nadie»). */
  function traerRegistrados(forzar) {
    var reg = E.reg;
    if (!E.activo || !N || typeof N.rpc !== 'function') return Promise.resolve(false);
    if (reg.enCurso) return reg.enCurso;
    if (!forzar && reg.estado === 'ok' && ahora() - reg.pedidoEn < 60000) return Promise.resolve(false);
    if (reg.estado !== 'ok' || !reg.filas.length) reg.estado = 'cargando';
    pintarRegistrados();
    reg.enCurso = N.rpc('panel_registros', { p_estado: 'nuevo', p_limite: LIMITE_REGISTRADOS }).then(function (r) {
      var x = objeto(r);
      reg.filas = lista(x.registros);
      reg.nuevos = Number(x.nuevos) || reg.filas.length;
      reg.pedidosLeidos = x.pedidos_leidos !== false;
      var srv = Date.parse(texto(x.servidor_ahora));
      reg.leidoEn = isNaN(srv) ? ahora() : srv;
      reg.estado = 'ok'; reg.error = ''; reg.sinRed = false; reg.pedidoEn = ahora();
    }, function (e) {
      if (e && e.estado === 404) { reg.estado = 'falta'; reg.filas = []; return; }
      reg.estado = 'error'; reg.error = motivo(e); reg.sinRed = !!(e && e.sin_red);
    }).then(function () { reg.enCurso = null; pintarRegistrados(); return true; });
    return reg.enCurso;
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
  /* ------------------------------------------------- la puerta 'copia' */
  /* 24-nov-2026 — UN CELULAR QUE GUARDA UNA COPIA. Si alguna vez se trajo la
     cartera a este teléfono (traer.html), su PIN abre ESA copia: la de aquel día.
     No se actualiza sola, y nada en la pantalla lo decía. Ahora lo dice en la
     puerta y, si el CRM ya está abierto (el PIN se retoma solo 24 horas), en una
     franja arriba; y ofrece «Ver lo de hoy»: la cartera traída de la nube, para
     mirar, como en un celular sin copia. La copia no se toca ni se borra: las
     rejas de mirar ya le prohíben a todo el CRM escribir en la gaveta. */
  function pintarAvisoDeCopia() {
    if (E.puerta !== 'copia' || E.activo) return false;
    var tarjeta = D.querySelector('#gate .gate-card');
    if (!tarjeta || $('crCopia')) return false;
    ponerEstilos();
    var caja = D.createElement('div');
    caja.id = 'crCopia';
    caja.className = 'cr-puerta cr-copia';
    caja.setAttribute('data-cr', '1');
    caja.innerHTML =
      '<p><b>Este celular guarda una copia de tu cartera</b>, de cuando la trajiste. No se actualiza sola: ' +
      'con tu PIN ves esa copia.</p>' +
      '<button type="button" class="cr-hoy" id="crHoy">Ver lo de hoy</button>' +
      '<p class="cr-nota">Lo de hoy se trae de la nube con tu celular y tu contraseña, y es solo para mirar. ' +
      'La copia de este celular no se toca.</p>';
    var equipo = tarjeta.querySelector('.gate-link');
    tarjeta.insertBefore(caja, equipo || null);
    $('crHoy').addEventListener('click', verLoDeHoy);
    return false;        // la puerta sigue siendo la del PIN: crm.html pinta lo suyo
  }
  /* En la puerta: se cambia de puerta ahí mismo. Con el CRM ya abierto sobre la
     copia: se recarga, y al abrir la preferencia decide (alAbrir). */
  function verLoDeHoy() {
    ponerQuiereVerHoy(true);
    var adentro = false;
    try { var g = $('gate'); adentro = !!(g && g.style && g.style.display === 'none'); } catch (e) {}
    if (adentro) { try { W.location.reload(); } catch (e) {} return; }
    var c = $('crCopia');
    if (c && c.parentNode && c.parentNode.removeChild) c.parentNode.removeChild(c);
    E.puerta = 'correo'; E.veniaDeCopia = true;
    armarPuertaDeCorreo();
  }
  function volverALaCopia() {
    ponerQuiereVerHoy(false);
    try { W.location.reload(); } catch (e) {}
  }
  /* La franja de adentro: solo con el CRM abierto sobre la copia (la puerta
     escondida). Se revisa cuando la puerta se abre o se cierra. */
  function revisarFranjaDeCopia() {
    if (E.puerta !== 'copia' || E.activo) return false;
    var g = $('gate'), abierto = !!(g && g.style && g.style.display === 'none');
    var f = $('crFranjaCopia');
    if (!abierto) { if (f && f.parentNode && f.parentNode.removeChild) f.parentNode.removeChild(f); return false; }
    if (f) return true;
    /* ARRIBA DE TODO, no dentro de .main: la pantalla de siempre, en un teléfono,
       pone primero el menú entero (17 botones) y .main queda una pantalla más
       abajo. Ahí la franja existía y nadie la veía (foto del 24-nov). #app es la
       rejilla del CRM; la franja ocupa todas sus columnas. */
    var principal = $('app') || D.querySelector('.main');
    if (!principal) return false;
    ponerEstilos();
    f = D.createElement('div');
    f.id = 'crFranjaCopia';
    f.className = 'cr-franja';
    f.setAttribute('data-cr', '1');
    f.innerHTML = '<b>📱 Copia de este celular</b><span class="cr-t">Es de cuando la trajiste: no se actualiza sola.</span>' +
      '<button type="button" id="crHoyAdentro">Ver lo de hoy</button>';
    principal.insertBefore(f, principal.firstChild);
    $('crHoyAdentro').addEventListener('click', verLoDeHoy);
    return true;
  }
  function vigilarLaPuertaDeCopia() {
    var g = $('gate');
    try {
      if (g && typeof W.MutationObserver === 'function') {
        new W.MutationObserver(function () { revisarFranjaDeCopia(); }).observe(g, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    } catch (e) {}
    /* crm.html retoma el PIN guardado justo DESPUÉS de alAbrir: se mira al soltar. */
    try { W.setTimeout(revisarFranjaDeCopia, 0); } catch (e2) {}
  }

  function pintarPuerta() {
    if (E.puerta === 'copia') return pintarAvisoDeCopia();
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
      '<p><b>¿Eres Joan?</b> Entra con tu celular y tu contraseña.</p>' +
      '<label for="crCorreo" id="crRotulo">Celular</label>' +
      '<input id="crCorreo" name="username" type="tel" inputmode="tel" autocomplete="username" autocapitalize="none" spellcheck="false">' +
      '<label for="crClave">Contraseña</label>' +
      '<input id="crClave" name="password" type="password" autocomplete="current-password">' +
      '<button type="submit" id="crEntrar">Entrar</button>' +
      '<div class="gate-err" id="crErr" aria-live="polite"></div>' +
      '<button type="button" class="cr-otra" id="crReintentar" style="display:none">Reintentar</button>' +
      '<button type="button" class="cr-otra" id="crOtra">Entrar con correo</button>' +
      (E.veniaDeCopia ? '<button type="button" class="cr-otra" id="crVolverCopia">Volver a la copia de este celular</button>' : '') +
      '<p class="cr-nota">Queda abierto en este celular hasta que toques «Salir». ' +
      'No guarda tu cartera: la trae de la nube y, por ahora, solo se mira.</p>' +
      '<p class="cr-nota">¿Vas a registrar un cobro? <a id="crAlBolsillo" href="espejo.html">Abre el Panel en el bolsillo</a>.</p>';
    var equipo = tarjeta.querySelector('.gate-link');
    tarjeta.insertBefore(caja, equipo || null);
    caja.addEventListener('submit', function (ev) { ev.preventDefault(); entrarConCorreo(); });
    $('crOtra').addEventListener('click', alternarCorreo);
    $('crReintentar').addEventListener('click', function () { reintentar(true); });
    var vuelta0 = $('crVolverCopia');
    if (vuelta0) vuelta0.addEventListener('click', volverALaCopia);
    try { var s = N.sesion(); var cel = s ? celularDeSesion(s.correo, W.CuentaSocio) : ''; if (cel) $('crCorreo').value = cel; } catch (e) {}
    return true;
  }
  /* «Entrar con correo»: la salida mientras el celular no esté anotado como dueño.
     Cambia el teclado del campo, nada más: la regla de quién entra es la misma. */
  function alternarCorreo() {
    var campo = $('crCorreo'), rotulo = $('crRotulo'), boton = $('crOtra');
    if (!campo) return;
    var aCorreo = campo.type !== 'email';
    campo.type = aCorreo ? 'email' : 'tel';
    campo.setAttribute('inputmode', aCorreo ? 'email' : 'tel');
    campo.value = '';
    if (rotulo) rotulo.textContent = aCorreo ? 'Correo' : 'Celular';
    if (boton) boton.textContent = aCorreo ? 'Entrar con celular' : 'Entrar con correo';
  }
  function entrarConCorreo() {
    var quien = usuarioDeLaPuerta($('crCorreo').value, W.CuentaSocio), clave = $('crClave').value;
    if (quien.error) return decirEnPuerta(quien.error);
    if (!clave) return decirEnPuerta('Falta tu contraseña.');
    $('crEntrar').disabled = true;
    decirEnPuerta('Entrando…', 'aviso');
    ponerConexionDeFabrica();
    N.entrar(quien.correo, clave).then(function () {
      $('crClave').value = '';                // la contraseña no se queda en un campo abierto
      ponerMarca();
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
      /* La hoja del teléfono (crm-movil.js) se enciende también al empezar a mirar. */
      try { if (W.CrmMovil && typeof W.CrmMovil.revisar === 'function') W.CrmMovil.revisar(); } catch (e) {}
      ponerVigiaDelBarrido();
      E.ganchos.abrir();
      /* Lo que crm.html trae escrito desde el HTML (el «＋ Nuevo crédito» de cada
         encabezado) no se vuelve a pintar nunca: se barre una vez, aquí. */
      barrer(D);
      ponerTapas();
      pintarFranja();
      arrancarRelojes();
      traerRegistrados(true);
    }, function (e) {
      E.db = null;
      if (noEsDueno(e)) {
        /* Entró a Supabase, pero el servidor dice que esa cuenta no es dueña. No se
           deja una sesión viva detrás de la puerta del dueño. */
        quitarHasta();
        try { N.salir(); } catch (e2) {}
        return decirEnPuerta('Ese usuario entra, pero todavía no está autorizado como dueño del CRM. ' +
          'Falta anotarlo una vez en la base (panel_duenos).');
      }
      if (e && (e.estado === 401 || e.estado === 403 || /venció la sesión/i.test(motivo(e)))) {
        quitarHasta();
        return decirEnPuerta('La sesión de este celular ya no vale. Entra otra vez.');
      }
      /* Lo demás es la señal: la sesión sigue guardada y se reintenta sola. */
      E.esperando = true;
      var b = $('crReintentar'); if (b) b.style.display = '';
      decirEnPuerta(e && e.sin_red
        ? 'Sin señal: no pude traer tu cartera. Reintento solo cuando vuelva la señal.'
        : 'No pude traer tu cartera: ' + motivo(e));
    });
  }
  /* Con la sesión guardada y sin cartera en pantalla (falló la primera traída):
     volver a intentar cuando vuelva la señal, al volver a la página, o al tocar
     «Reintentar». Nunca pide la contraseña otra vez por un fallo de red. */
  function reintentar(aMano) {
    if (E.activo || E.trayendo || !E.esperando) return;
    var s = null;
    try { s = N.sesion(); } catch (e) {}
    if (!s || !s.access_token || !hayMarca()) { E.esperando = false; return; }
    if (!aMano && D.visibilityState === 'hidden') return;
    E.esperando = false;
    var b = $('crReintentar'); if (b) b.style.display = 'none';
    abrirDesdeLaNube();
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

  /** «Salir», o una sesión que el servidor ya no acepta. Cierra la sesión de la
      nube y recarga: de la cartera no queda nada, porque nunca estuvo en el disco.
      OJO: NUBE.salir cierra esa cuenta en TODOS los aparatos donde esté abierta. */
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
    /* 24-nov-2026 — con una copia en este celular: si Joan ya escogió «Ver lo de
       hoy», la puerta es la del correo (y el PIN guardado no abre: entrar() mira
       puertaDeCorreo); si no, la del PIN con su aviso, y la franja si ya está adentro. */
    if (E.puerta === 'copia' && quiereVerHoy()) { E.puerta = 'correo'; E.veniaDeCopia = true; }
    if (E.puerta === 'copia') { pintarAvisoDeCopia(); vigilarLaPuertaDeCopia(); return E.puerta; }
    if (E.puerta !== 'correo') return E.puerta;
    armarPuertaDeCorreo();
    return E.puerta;
  }
  function armarPuertaDeCorreo() {
    D.addEventListener('click', alTocar, true);
    D.addEventListener('change', alCambiar, true);
    D.addEventListener('input', alCambiar, true);
    D.addEventListener('pointerdown', alBajarElDedo, true);
    D.addEventListener('keydown', alBajarElDedo, true);
    pintarPuerta();
    var s = null;
    try { s = N.sesion(); } catch (e) {}
    /* Con la sesión que abrió ESTA puerta (tiene su marca), entra sola, sea de hoy
       o de hace un mes: Joan pidió que quede abierto. La sesión del Panel en el
       bolsillo no tiene marca: ni abre sola ni es nuestra para cerrarla. */
    if (s && s.access_token && hayMarca()) abrirDesdeLaNube();
    try {
      W.addEventListener('online', function () { reintentar(false); });
      D.addEventListener('visibilitychange', function () { reintentar(false); });
    } catch (e2) {}
  }

  var api = {
    alAbrir: alAbrir, activo: activo, paraCargar: paraCargar, alGuardar: alGuardar,
    puertaDeCorreo: puertaDeCorreo, pintarPuerta: pintarPuerta, salir: salir,
    alRepintar: function () { if (E.activo) { ponerTapas(); pintarFranja(); barrer(D); } },
    barrer: barrer, ponerFechas: ponerFechas, traerRegistrados: traerRegistrados,
    verLoDeHoy: verLoDeHoy, volverALaCopia: volverALaCopia, revisarFranjaDeCopia: revisarFranjaDeCopia,
    _estado: E
  };
  Object.keys(puro).forEach(function (k) { api[k] = puro[k]; });
  return api;
});
