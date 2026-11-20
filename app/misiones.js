/* ============================================================================
 * LAS MISIONES DE LA PISTA — 16 de noviembre de 2026
 *
 * LO QUE PIDIÓ JOAN: «quiero que sea una plataforma que ayude financieramente
 * a la gente… en los niveles vamos a motivar más el cliente como con misiones
 * dentro de la plataforma, invitar gente o hacer pagos anticipados… que se
 * sienta más interesante subir de nivel y que la gente se sienta más
 * identificada». Decidió el plan el 16-nov («Sí, las recomendadas») y aprobó
 * los bocetos ese mismo día («Sí, así»). El plan está en
 * PLAN-MISIONES-Y-NIVELES.md (notas de la sesión).
 *
 * LO QUE ES: dentro de la pestaña «Pista» (y solo ahí: decisión D7-A),
 *   · las misiones de la quincena: pagar en la fecha (★) y «Madrugador»,
 *     pagar 2 días o más antes del corte (★★ más, D2);
 *   · las de una vez: el perfil completo (★ con 5, con 10 y con los 13 datos
 *     que no son sensibles; ver abajo);
 *   · las rachas de pagos en fecha (3, 6 y 12) y la mejor racha;
 *   · cada 3 estrellas aparece una cosa en la isla del mundo donde se ganaron
 *     (las dibuja app/pista-niveles.js);
 *   · el título de cada mundo, el personaje que va por la pista (D6), la
 *     llegada a un mundo nuevo (una sola vez) con su tarjeta para WhatsApp, y
 *     el álbum «Tus islas».
 *
 * LO QUE NO SE PUEDE, y manda sobre todo lo de abajo:
 *   · LAS ESTRELLAS NO SON PLATA (D1-A). No se cambian por nada, no dan
 *     descuento, no suben el cupo y no mueven el nivel: el nivel es el tramo
 *     de la garantía y eso es contrato (términos §7). Si se pudieran cambiar
 *     serían un programa de premios (Ley 1480) y se parecerían al ahorro que
 *     ya se evitó con la garantía (decisión del 21-oct). Por eso aquí no hay
 *     monedas, ni cofres, ni «tu plata».
 *   · PEDIR NO DA ESTRELLAS. Ninguna misión se cumple pidiendo, pidiendo más o
 *     renovando. Y las de pago se cuentan POR QUINCENA (por corte), no por
 *     crédito: quien saca tres créditos con el mismo corte gana lo mismo que
 *     quien saca uno. Sin eso, pedir más seguido daría más estrellas.
 *   · NADA DE OTROS. Ni rankings, ni invitados, ni si pagaron (Ley 2300 y la
 *     regla del 29-sep). Ni rifas ni premios al azar (Ley 643).
 *   · LA MISIÓN DE INVITAR ESTÁ APAGADA (INVITA_ENCENDIDA) hasta que el
 *     abogado diga qué puede contar (D4, reunión del jue 26-nov).
 *   · LOS DATOS SENSIBLES NO DAN ESTRELLAS. La selfie con la cédula (dato
 *     biométrico) y la ubicación van con una autorización aparte, y la página
 *     ni siquiera se los pide a quien no la dio («pedir un dato que la persona
 *     acaba de negar es exactamente la presión que la ley prohíbe»). Una
 *     estrella por darlos sería esa presión: la misión cuenta los otros 13.
 *   · NADA FINGIDO. Todo sale del paquete que ya llega: fechas de pago y de
 *     corte, el perfil y la racha del motor. Lo único que se guarda en el
 *     teléfono es lo que el paquete no puede saber: el personaje, el último
 *     mundo que vio (para la llegada) y en qué isla cayó cada estrella de una
 *     vez. Si cambia de teléfono, lo vuelve a escoger; las estrellas de pago
 *     no se pierden, salen de su historia.
 *   · «ABONA AL CAPITAL» NO ESTÁ. El plan la traía, pero el paquete no trae la
 *     fecha de cada abono (solo la suma, `abonado`), y sin fecha no se puede
 *     saber si fue antes del corte. Cuando el puente la mande, entra.
 *
 * «EN FECHA» es la línea del Historial y de las piedras de la Pista
 * (PistaNiveles.enFecha): fecha_pagado <= corte. La racha es la del MOTOR
 * (paquete.garantia.racha), que es más exigente: aplazar o deber también la
 * corta. La mejor racha se reconstruye con esa misma regla y nunca da menos
 * que la del motor.
 *
 * DICIEMBRE (18-nov-2026, P7 de Joan: «Sí, lo recomendado»):
 *   · «DICIEMBRE PUNTUAL»: quien paga en la fecha TODOS sus cortes de
 *     diciembre gana un árbol de Navidad en la isla donde pagó el último, y se
 *     queda. Cuentan los créditos que ya tiene: a quien no tiene un corte en
 *     diciembre la tarjeta ni le sale, para que nadie pida un crédito por el
 *     árbol. No da estrellas ni nada más que el árbol. Se decide el 1 de
 *     enero (antes todavía puede salir otro corte de diciembre).
 *   · LA TARJETA DE NAVIDAD para WhatsApp: su isla, «¡Feliz Navidad!» y su
 *     nombre de pila. Sin montos ni nada del crédito. Sale solo en temporada
 *     (la decide app/temporada.js: del 20-nov al 7-ene); sin ese archivo, no
 *     sale.
 *
 * ESTE ARCHIVO NO ESCRIBE NADA EN LA BASE y no decide nada de plata: lee lo
 * que la página le pasa, devuelve HTML y guarda en el teléfono solo lo dicho.
 * Es un archivo NUEVO: se pide sin versión. Si no llega, la Pista se ve como
 * antes, sin misiones.
 * ==========================================================================*/
/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas). */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Misiones = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* El motor y la pista: en la página ya están cargados; en una prueba que
     pida este archivo a secas, se traen del lado. Se buscan al usarlos. */
  function global() { return typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}); }
  function del(nombre, archivo) {
    var g = global();
    if (g[nombre]) return g[nombre];
    return (typeof module === 'object' && module.exports && typeof require === 'function') ? require(archivo) : null;
  }
  function motor() { return del('MotorReglas', './motor.js'); }
  function pista() { return del('PistaNiveles', './pista-niveles.js'); }
  function documento() { return typeof document !== 'undefined' ? document : null; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; });
  }
  function COP(n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); }

  /* ======================= LAS REGLAS, EN UN SOLO SITIO ======================= */
  var CADA = 3;                 // estrellas por cosa de la isla (bocetos del 16-nov)
  var DIAS_MADRUGADOR = 2;      // D2: 2 días o más antes del corte
  var METAS_RACHA = [3, 6, 12];
  var PERFIL_METAS = [5, 10, 13];
  /* D4: lo que cuenta al invitar lo decide el abogado (jue 26-nov). Hasta
     entonces la misión NO se muestra; encenderla es cambiar esto y su prueba. */
  var INVITA_ENCENDIDA = false;
  /* La selfie (biométrico) y la ubicación: autorización aparte, sin estrellas. */
  var SENSIBLES = ['foto_selfie', 'ubicacion'];

  /* Un título por mundo, que no cambia con el género (los vio Joan en los
     bocetos del 16-nov). 18-nov-2026: el del último ya no se esconde hasta
     llegar, igual que su mundo (Joan: «que las pistas se vean todas incluso
     la ultima»). `alcanzado` se sigue recibiendo para no romper a quien lo pasa. */
  var TITULOS = {
    'hierro': 'Aprendiz de la forja',
    'aluminio': 'Piloto del cielo',
    'bronce': 'Guía del templo',
    'plata': 'Astronauta de la luna',
    'oro': 'Centinela del sol',
    'platino': 'Testigo de la aurora',
    'diamante': 'Artista del cristal',
    'materia oscura pro': 'Comandante de la galaxia',
    'misterio': 'Leyenda'
  };
  function titulo(nivel) {
    return TITULOS[nivel] || '';
  }
  var PERSONAJES = [['moto', 'Moto'], ['bici', 'Bici'], ['carro', 'Carro'], ['bus', 'Bus'], ['pie', 'A pie']];
  function esPersonaje(p) { for (var i = 0; i < PERSONAJES.length; i++) if (PERSONAJES[i][0] === p) return true; return false; }
  var NOMBRE_COSA = { bandera: 'una bandera', arbol: 'un árbol', banca: 'una banca', farol: 'un farol', puesto: 'un puesto de mercado' };

  /* ---------- íconos (24 × 24, de trazo; los mismos del boceto) ---------- */
  var IC = {
    moto: '<circle cx="5.5" cy="16.8" r="3.2"/><circle cx="18.5" cy="16.8" r="3.2"/><path d="M4.2 13.4 9.2 11h5.4l2.4 2.6h-3.8l-1.6 3.2H8.4z" fill="currentColor"/><path d="M18.5 16.8 16.4 9.2h2.6M8.6 9.6h3.8"/><circle cx="12.2" cy="5.6" r="1.7" fill="currentColor" stroke="none"/><path d="M11.8 7.6 10.8 10.4"/>',
    bici: '<circle cx="5.5" cy="16.5" r="3.6"/><circle cx="18.5" cy="16.5" r="3.6"/><path d="M5.5 16.5 10 9.5l5 7H5.5M10 9.5h5.5l3 7M15.5 9.5l-.8-2.6h2.3M10 9.5 9.2 7.4h2.2"/>',
    carro: '<path d="M3 15.5v-3l2.6-4.2h10.6l3.6 4.2H21v3z"/><path d="M6.6 8.4 5.6 12h13.6"/><circle cx="7.2" cy="16.4" r="2.1"/><circle cx="16.8" cy="16.4" r="2.1"/>',
    bus: '<rect x="3.5" y="4.5" width="17" height="12" rx="2.2"/><path d="M3.5 10h17M8.2 4.5V10M13.6 4.5V10"/><circle cx="7.6" cy="17.8" r="1.7"/><circle cx="16.4" cy="17.8" r="1.7"/>',
    pie: '<circle cx="12.5" cy="4.6" r="2"/><path d="M12.2 7.4 11 13.4l-3 6.6M11 13.4l3.2 6.6M12 9.2l-3.6 2.6M12 9.2l3.8 1.9"/>',
    estrella: '<path d="m12 3.2 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>',
    check: '<path d="m5.5 12.5 4.2 4.2 8.8-9.4"/>',
    candado: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    gente: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"/><circle cx="16.8" cy="9" r="2.4"/><path d="M15.6 13.9c2.6-.4 4.4 1.2 5 4.6"/>',
    perfil: '<rect x="4" y="4.5" width="16" height="15" rx="2.4"/><circle cx="12" cy="10" r="2.6"/><path d="M7.5 17c.8-2.2 2.4-3.3 4.5-3.3s3.7 1.1 4.5 3.3"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    fuego: '<path d="M12 21c-3.8 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.3 3.6-8.3 1.6 1.3 2.3 3 2.4 4.6 1-1.4 1.4-3.2 1.2-5.6 3.1 2 5.8 5.5 5.8 9.3 0 3.6-2.7 6.2-6.5 6.2z"/>',
    mas: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2.4"/><path d="M12 8v8M8 12h8"/>',
    arbol: '<path d="M12 3.5 7.2 10h3L6 16.5h12L13.8 10h3z"/><path d="M12 16.5V20.5"/>',
    whatsapp: '<path d="M4.5 19.5 5.6 16A7.6 7.6 0 1 1 8.3 18.4z"/><path d="M9.3 8.9c.2 2.6 2.8 5.3 5.6 5.8l1.1-1.3-1.8-.9-.8.8c-1.2-.5-2.2-1.5-2.7-2.7l.8-.8-.9-1.8z"/>'
  };
  function ico(nombre, clase) {
    return '<svg class="mi-ico ' + (clase || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[nombre] || '') + '</svg>';
  }
  /* ★★ con su número para quien no ve: «2 estrellas» */
  function estrellas(k, clase) {
    var s = ''; for (var i = 0; i < k; i++) s += '★';
    return '<span class="' + (clase || 'mi-est') + '" aria-label="' + k + (k === 1 ? ' estrella' : ' estrellas') + '">' + s + '</span>';
  }

  /* ======================= LAS FECHAS (sin hora: días de calendario) ======================= */
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function aDia(iso) {
    var p = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!p) return null;
    return Math.round(Date.UTC(+p[1], +p[2] - 1, +p[3]) / 86400000);
  }
  function deDia(n) { var x = new Date(n * 86400000); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); }
  function sumarDias(iso, k) { var n = aDia(iso); return n == null ? null : deDia(n + k); }
  function partes(iso) { var n = aDia(iso); if (n == null) return null; var x = new Date(n * 86400000); return { dia: x.getUTCDay(), d: x.getUTCDate(), m: x.getUTCMonth() }; }
  /* «lunes 30 de noviembre» */
  function fechaLarga(iso) { var p = partes(iso); return p ? DIAS[p.dia] + ' ' + p.d + ' de ' + MESES[p.m] : ''; }
  /* «sábado 28» */
  function diaYNumero(iso) { var p = partes(iso); return p ? DIAS[p.dia] + ' ' + p.d : ''; }
  /* «lun 30 nov» */
  function fechaChip(iso) { var p = partes(iso); return p ? DIAS[p.dia].slice(0, 3) + ' ' + p.d + ' ' + MESES[p.m].slice(0, 3) : ''; }
  /* «15 nov» */
  function fechaCorta(iso) { var p = partes(iso); return p ? p.d + ' ' + MESES[p.m].slice(0, 3) : ''; }
  /* «15 de diciembre» */
  function diaDeMes(iso) { var p = partes(iso); return p ? p.d + ' de ' + MESES[p.m] : ''; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function hoyLocal() { var x = new Date(); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
  function dia10(iso) { return iso ? String(iso).slice(0, 10) : null; }

  /* ======================= LO QUE SE GUARDA EN EL TELÉFONO ======================= */
  /* Por cuenta (cédula o código), para que dos personas en el mismo teléfono
     no se mezclen. Si no se puede guardar (navegación privada), todo sigue:
     solo que no hay llegada (si no, saldría cada vez) y el personaje no se
     recuerda. */
  function llave(cuenta) { return 'tg_misiones_' + String(cuenta || 'anon').replace(/[^\w-]/g, ''); }
  function almacen() { try { var g = global(); return g.localStorage || null; } catch (e) { return null; } }
  function vacia() { return { personaje: null, mundo: null, unaVez: {} }; }
  function leer(cuenta) {
    try {
      var a = almacen(); if (!a) return vacia();
      var x = JSON.parse(a.getItem(llave(cuenta)) || 'null');
      if (!x || typeof x !== 'object') return vacia();
      return { personaje: esPersonaje(x.personaje) ? x.personaje : null, mundo: typeof x.mundo === 'string' ? x.mundo : null,
        unaVez: (x.unaVez && typeof x.unaVez === 'object') ? x.unaVez : {} };
    } catch (e) { return vacia(); }
  }
  function guardar(cuenta, mem) {
    try {
      var a = almacen(); if (!a) return false;
      a.setItem(llave(cuenta), JSON.stringify({ v: 1, personaje: mem.personaje || null, mundo: mem.mundo || null, unaVez: mem.unaVez || {} }));
      return true;
    } catch (e) { return false; }
  }

  /* ======================= EL CÁLCULO ======================= */
  /* Un crédito a cuotas (o con un pago acordado, que por dentro es lo mismo)
     no tiene «madrugador»: su corte se mueve con cada cuota. */
  function tienePlan(c) { return !!(c && (Number(c.plan_cuotas) > 0 || (c.plan && c.plan.length) || c.pago_acordado)); }
  function ultimaCuota(c) {
    var f = (c && c.plan || []).map(function (q) { return dia10(q && q.fecha); }).filter(Boolean).sort();
    return f.length ? f[f.length - 1] : null;
  }
  function enFecha(c) { var P = pista(); return P ? P.enFecha(c) : !!(c && c.fecha_pagado && c.corte && c.fecha_pagado <= c.corte); }

  /* LAS QUINCENAS. Las estrellas de pago van por CORTE, no por crédito (ver
     arriba: pedir más seguido no puede dar más). Una quincena cuenta cuando
     TODO lo de ese corte está pagado: si un crédito sigue abierto, todavía no
     se sabe, y una estrella que aparece y después se va es peor que una que
     tarda. Cae en el mundo donde se pagó el último crédito de ese corte (el
     de su piedra en la pista). */
  function quincenas(creditos, rec) {
    var nivelDe = {};
    (rec || []).forEach(function (p) { if (p && p.codigo) nivelDe[p.codigo] = p.nivel; });
    var por = {}, orden = [];
    (creditos || []).forEach(function (c, i) {
      if (!c) return;
      var k = dia10(c.corte) || ('sin-corte-' + i);
      if (!por[k]) { por[k] = { corte: dia10(c.corte), creditos: [] }; orden.push(k); }
      por[k].creditos.push(c);
    });
    return orden.map(function (k) {
      var g = por[k], cs = g.creditos;
      var cerrada = cs.every(function (c) { return !!c.pagado; });
      var perdida = cs.some(function (c) { return !!c.cerrado_con_perdida; });
      var fecha = cerrada && !perdida && !!g.corte && cs.every(enFecha);
      var limite = g.corte ? sumarDias(g.corte, -DIAS_MADRUGADOR) : null;
      var madrugador = fecha && cs.every(function (c) { return !tienePlan(c) && dia10(c.fecha_pagado) <= limite; });
      var ult = cs.slice().sort(function (a, b) { return String(b.fecha_pagado || '').localeCompare(String(a.fecha_pagado || '')); })[0];
      return { corte: g.corte, cerrada: cerrada, en_fecha: fecha, madrugador: madrugador, perdida: perdida,
        estrellas: fecha ? (madrugador ? 3 : 1) : 0, nivel: (ult && nivelDe[ult.codigo]) || null, creditos: cs.length };
    });
  }

  /* La misión de esta quincena: la del crédito abierto que vence primero. */
  function abierta(creditos, hoy) {
    var abiertos = (creditos || []).filter(function (c) { return c && !c.pagado; });
    if (!abiertos.length) return null;
    var c = abiertos.slice().sort(function (a, b) { return String(a.corte || '9999').localeCompare(String(b.corte || '9999')); })[0];
    var plan = tienePlan(c), limite = plan ? (ultimaCuota(c) || dia10(c.corte)) : dia10(c.corte);
    if (!limite) return { sin_fecha: true };
    var madrugador = plan ? null : sumarDias(limite, -DIAS_MADRUGADOR);
    return { corte: limite, plan: plan, madrugador: madrugador,
      paso_la_fecha: hoy > limite, paso_madrugador: madrugador ? hoy > madrugador : true };
  }

  /* LA RACHA. La de hoy es la del motor, sin discusión. La mejor se
     reconstruye con la regla del motor (estadoParaNivel en app/puente.js):
     gana el pagado en fecha sin prórroga, sin plan de RESCATE y sin haber
     estado en mora (el crédito pactado a cuotas desde el desembolso no corta:
     tienePlanHasta, 16-oct); lo abierto que no ha vencido ni se aplazó no
     cuenta; todo lo demás corta. Nunca da menos que la de hoy. */
  function rachas(creditos, rachaMotor, hoy) {
    var lista = (creditos || []).filter(Boolean).slice().sort(function (a, b) {
      return String(a.desembolso || '').localeCompare(String(b.desembolso || ''));
    });
    var mejor = 0, corrida = 0;
    lista.forEach(function (c) {
      var limpio = !(Number(c.prorrogas) > 0) && c.plan_origen !== 'rescate' && !c.estuvo_en_mora;
      var estado;
      if (c.pagado) estado = (!c.cerrado_con_perdida && limpio && enFecha(c)) ? 'gana' : 'rompe';
      else estado = (!limpio || (c.corte && hoy > dia10(c.corte))) ? 'rompe' : 'abierto';
      if (estado === 'abierto') return;
      if (estado === 'gana') { corrida++; mejor = Math.max(mejor, corrida); } else corrida = 0;
    });
    var actual = Math.max(0, Math.round(Number(rachaMotor) || 0));
    mejor = Math.max(mejor, actual);
    var siguiente = null;
    for (var i = 0; i < METAS_RACHA.length; i++) if (mejor < METAS_RACHA[i]) { siguiente = METAS_RACHA[i]; break; }
    return { actual: actual, mejor: mejor, reconstruida: corrida, siguiente: siguiente,
      faltan: siguiente ? Math.max(0, siguiente - actual) : 0,
      metas: METAS_RACHA.map(function (m) { return { n: m, hecha: mejor >= m }; }) };
  }

  /* El perfil: cuántos de los datos que no son sensibles tiene. */
  function perfil(datos) {
    var m = motor(), lista = (m && m.DATOS_KYC || []).filter(function (x) { return SENSIBLES.indexOf(x.id) < 0; });
    var tiene = 0;
    lista.forEach(function (x) { if (datos && datos[x.id]) tiene++; });
    var hechas = PERFIL_METAS.filter(function (n) { return tiene >= n; }).length;
    var meta = null;
    for (var i = 0; i < PERFIL_METAS.length; i++) if (tiene < PERFIL_METAS[i]) { meta = PERFIL_METAS[i]; break; }
    return { tiene: tiene, de: lista.length, estrellas: hechas, maximo: PERFIL_METAS.length, meta: meta };
  }

  /* DICIEMBRE PUNTUAL (ver arriba). Por año: sus quincenas con corte en
     diciembre. Se LOGRA si hay al menos una y todas quedaron cerradas y en la
     fecha (la misma regla de las estrellas), y se decide el 1 de enero: hasta
     el 16 de diciembre un crédito nuevo puede traer otro corte de diciembre.
     El árbol cae en el mundo del ÚLTIMO corte (donde se pagó, como su piedra)
     y se queda: sale de la historia de pagos, no del teléfono, así que
     tampoco se pierde al cambiar de teléfono.
     La tarjeta sale del 1 de diciembre al 7 de enero, solo a quien tiene algún
     corte en diciembre. Desde 2026: es cuando empezó la misión, y un árbol por
     un diciembre en el que nadie la había visto sería fingido. */
  var DICIEMBRE_DESDE = 2026;
  var ULTIMO_DIA_ENERO = 7;      // como la temporada: «hasta el 7 de enero»
  function diciembre(qs, hoy, nivelHoy) {
    var por = {}, navidadEn = {}, actual = null;
    (qs || []).forEach(function (q) {
      if (!q || !q.corte || q.corte.slice(5, 7) !== '12' || +q.corte.slice(0, 4) < DICIEMBRE_DESDE) return;
      (por[q.corte.slice(0, 4)] = por[q.corte.slice(0, 4)] || []).push(q);
    });
    Object.keys(por).sort().forEach(function (y) {
      var lista = por[y].slice().sort(function (a, b) { return a.corte < b.corte ? -1 : 1; });
      var enero = (+y + 1) + '-01-01', hasta = (+y + 1) + '-01-' + pad(ULTIMO_DIA_ENERO);
      var decidido = hoy >= enero;
      var logrado = lista.every(function (q) { return q.cerrada && q.en_fecha; });
      var donde = lista[lista.length - 1].nivel || nivelHoy || null;
      if (decidido && logrado && donde) navidadEn[donde] = true;
      if (hoy >= y + '-12-01' && hoy <= hasta) {
        actual = { anio: +y, decidido: decidido, logrado: decidido && logrado && !!donde, nivel: donde,
          cortes: lista.map(function (q) {
            var estado = (q.cerrada && q.en_fecha) ? 'hecha' : (!q.cerrada && hoy <= q.corte) ? 'abierta'
              : q.perdida ? 'cerrado' : q.cerrada ? 'tarde' : 'vencida';
            return { corte: q.corte, estado: estado };
          }) };
        actual.se_paso = actual.cortes.some(function (c) { return c.estado !== 'hecha' && c.estado !== 'abierta'; });
      }
    });
    return { actual: actual, navidad_en: navidadEn };
  }

  /* TODO JUNTO. d es lo que la página le pasa a la Pista; e y rec, lo que la
     Pista ya calculó (dónde está y sus piedras). No escribe nada: lo que haya
     que guardar va en `asignar` y lo guarda montar(). */
  function calcular(d, e, rec) {
    d = d || {};
    var P = pista(), m = motor();
    if (!P || !m) return null;
    e = e || P.donde(d.garantia);
    rec = rec || P.recorrido(e.garantia, d.creditos);
    var hoy = dia10(d.hoy) || hoyLocal(), mem = leer(d.cuenta);
    var qs = quincenas(d.creditos, rec);
    var porMundo = {};
    e.filas.forEach(function (f) { porMundo[f.nivel] = { pagos: 0, una_vez: 0, quincenas: 0 }; });
    qs.forEach(function (q) {
      if (q.estrellas && q.nivel && porMundo[q.nivel]) { porMundo[q.nivel].pagos += q.estrellas; porMundo[q.nivel].quincenas++; }
    });
    var pf = perfil(d.perfil), asignar = {};
    for (var i = 1; i <= pf.estrellas; i++) {
      var k = 'perfil-' + i, w = mem.unaVez[k];
      if (!w || !porMundo[w]) { w = e.nivel; asignar[k] = w; }
      porMundo[w].una_vez++;
    }
    Object.keys(porMundo).forEach(function (n) {
      var x = porMundo[n];
      x.total = x.pagos + x.una_vez;
      x.lugares = P.sitios(n).length;
      x.cosas = Math.min(x.lugares, Math.floor(x.total / CADA));
    });
    var aqui = porMundo[e.nivel];
    var pasadas = qs.filter(function (q) { return q.cerrada && q.corte; }).sort(function (a, b) { return a.corte < b.corte ? 1 : -1; });
    var dic = diciembre(qs, hoy, e.nivel);
    return {
      d: d, e: e, rec: rec, hoy: hoy, mem: mem, asignar: asignar, cuenta: d.cuenta || null,
      quincenas: qs, por_mundo: porMundo, aqui: aqui,
      isla: { cosas: aqui.cosas, sigue: aqui.cosas < aqui.lugares },
      abierta: abierta(d.creditos, hoy), pasada: pasadas[0] || null,
      perfil: pf, racha: rachas(d.creditos, d.racha, hoy),
      personaje: mem.personaje, titulo: titulo(e.nivel, true),
      diciembre: dic.actual, navidad_en: dic.navidad_en
    };
  }

  /* ======================= LO QUE SE PINTA ======================= */
  function fila(estado, icono, tituloFila, sub, premio, extra) {
    return '<div class="mi-fila ' + estado + '"><span class="mi-punto">' + ico(estado === 'hecha' ? 'check' : icono) + '</span>' +
      '<span class="mi-txt"><b>' + tituloFila + '</b><small>' + sub + '</small>' + (extra || '') + '</span>' +
      '<span class="mi-premio">' + premio + '</span></div>';
  }
  /* Lo que va en el encabezado de la isla: el título con el personaje (se
     toca para cambiarlo) y las estrellas de esta isla. */
  function chip(mi) {
    return '<button type="button" class="mi-titulo" id="miTitulo" onclick="Misiones.abrirPersonaje()" aria-label="' +
      esc('Tu título: ' + mi.titulo + '. Toca para escoger tu personaje') + '">' +
      ico(mi.personaje || 'mas') + '<span>' + esc(mi.titulo) + '</span><i aria-hidden="true">›</i></button>';
  }
  function pildora(mi) {
    var x = mi.aqui, nombre = motor().nombreNivel(mi.e.nivel), resto;
    if (x.cosas >= x.lugares) resto = 'tu isla está completa';
    else {
      var faltan = CADA - (x.total % CADA), cosa = NOMBRE_COSA[pista().ORDEN_COSAS[x.cosas]] || 'algo nuevo';
      resto = (faltan === 1 ? '1 más' : faltan + ' más') + ' y aparece ' + cosa;
    }
    return '<div class="mi-pildora">' + ico('estrella') + '<b>' + x.total + '</b><span>en ' + esc(nombre) + ' · ' + esc(resto) + '</span></div>';
  }

  /* Tus misiones de esta quincena */
  function tarjetaQuincena(mi) {
    var a = mi.abierta, h = '<div class="card mi-card" id="miQuincena"><div class="mi-cab"><div class="etq">Tus misiones de esta quincena</div>' +
      (a && a.corte ? '<span class="mi-corte">corte: ' + esc(fechaChip(a.corte)) + '</span>' : '') + '</div>';
    if (!a) {
      h += '<p class="mi-nota mi-sin">No tienes un crédito por pagar, así que esta quincena no hay misión de pago. Las de una vez siguen abiertas.</p>';
    } else if (a.sin_fecha) {
      h += '<p class="mi-nota mi-sin">Tu crédito no tiene fecha de corte a la vista; cuando la tenga, aquí sale tu misión.</p>';
    } else if (a.plan) {
      h += a.paso_la_fecha
        ? fila('cerrada', 'estrella', 'Paga en la fecha', 'La última cuota era el ' + esc(fechaLarga(a.corte)) + '. La próxima quincena empieza de cero.', estrellas(1))
        : fila('abierta', 'estrella', 'Paga en la fecha', 'Tu crédito va a cuotas: cuenta si lo terminas de pagar a más tardar el ' + esc(fechaLarga(a.corte)) + '.', estrellas(1));
    } else {
      h += a.paso_la_fecha
        ? fila('cerrada', 'estrella', 'Paga en la fecha', 'La fecha era el ' + esc(fechaLarga(a.corte)) + '. La próxima quincena empieza de cero.', estrellas(1))
        : fila('abierta', 'estrella', 'Paga en la fecha', 'Tienes hasta el ' + esc(fechaLarga(a.corte)) + '.', estrellas(1));
      h += a.paso_madrugador
        ? fila('cerrada', 'reloj', 'Madrugador', 'Era hasta el ' + esc(diaYNumero(a.madrugador)) + (a.paso_la_fecha ? '.' : '. Todavía puedes pagar en la fecha.'), estrellas(2))
        : fila('abierta', 'reloj', 'Madrugador', 'Paga a más tardar el ' + esc(diaYNumero(a.madrugador)) + ': dos días antes del corte.', estrellas(2));
    }
    var p = mi.pasada;
    if (p) {
      var dijo = p.madrugador ? 'en la fecha y madrugador. <b>+3 ★</b>'
        : p.en_fecha ? 'en la fecha. <b>+1 ★</b>'
        : 'se pagó después del corte. La siguiente empezó de cero.';
      h += '<div class="mi-pasada">' + ico(p.en_fecha ? 'check' : 'reloj') + '<span>La quincena del ' + esc(fechaCorta(p.corte)) + ': ' + dijo + '</span></div>';
    }
    return h + '</div>';
  }

  /* Misiones de una vez */
  function tarjetaUnaVez(mi) {
    var pf = mi.perfil, van = pf.estrellas, quedan = pf.maximo - van, sub;
    if (!pf.meta) sub = 'Completo: tienes los ' + pf.de + ' datos.';
    else {
      var faltan = pf.meta - pf.tiene, cual = ['la primera', 'la segunda', 'la tercera'][van] || 'otra';
      sub = pf.tiene + ' de ' + pf.de + ' datos. ' + (faltan === 1 ? '1 más' : faltan + ' más') + ' y ganas ' + cual + ' estrella de esta misión.';
    }
    var premio = (van ? estrellas(van, 'mi-van') : '') + (quedan ? estrellas(quedan, 'mi-est mi-por') : '');
    var boton = (pf.meta && mi.d && typeof mi.d.alCompletarPerfil === 'function')
      ? '<button type="button" class="btn sm sec mi-ir" onclick="Misiones.completarPerfil()">Completar mis datos</button>' : '';
    var h = '<div class="card mi-card" id="miUnaVez"><div class="etq">Misiones de una vez</div>' +
      fila(pf.meta ? 'abierta' : 'hecha', 'perfil', 'Tu perfil, completo', esc(sub), premio, boton);
    if (INVITA_ENCENDIDA) {
      h += fila('abierta', 'gente', 'Invita a alguien', 'Cuenta cuando la persona que invitaste pague su primer crédito.', estrellas(2));
    }
    return h + '<p class="mi-nota">La selfie y tu ubicación no cuentan para las estrellas: son aparte y siempre opcionales.</p>' +
      '<p class="mi-nota">Las estrellas no son plata: no se cambian por nada y no suben tu cupo. Construyen tu isla.</p></div>';
  }

  /* Tu racha de pagos en fecha */
  function tarjetaRachas(mi) {
    var r = mi.racha, grande, chico;
    if (!r.actual && !r.mejor) {
      grande = 'Todavía sin racha';
      chico = 'Empieza con tu próximo pago en la fecha.';
    } else {
      grande = r.actual === 1 ? '1 pago en fecha' : r.actual + ' pagos en fecha';
      chico = (r.actual === r.mejor ? 'Seguidos: es tu mejor racha.' : 'Seguidos. Tu mejor racha: ' + r.mejor + '.') +
        (r.siguiente ? ' ' + (r.faltan === 1 ? 'Con 1 más en la fecha' : 'Con ' + r.faltan + ' más en la fecha') + ' ganas la de ' + r.siguiente + '.' : '');
    }
    var medallas = r.metas.map(function (m) {
      var est = m.hecha ? 'hecha' : (m.n === r.siguiente ? 'sigue' : '');
      var pie = m.hecha ? 'lograda' : (m.n === r.siguiente ? (r.faltan === 1 ? 'falta 1' : 'faltan ' + r.faltan) : 'seguidos');
      return '<span class="mi-racha ' + est + '"><i>' + m.n + '</i><small>' + pie + '</small></span>';
    }).join('');
    return '<div class="card mi-card" id="miRachas"><div class="etq">Tu racha de pagos en fecha</div>' +
      '<div class="mi-rachas-top"><span class="mi-fuego">' + ico('fuego') + '</span><div><b class="mi-n">' + esc(grande) + '</b><small>' + esc(chico) + '</small></div></div>' +
      '<div class="mi-rachas">' + medallas + '</div>' +
      '<p class="mi-nota">Pagar tarde o aplazar empieza la racha de nuevo. Tu mejor racha no se borra.</p></div>';
  }

  /* DICIEMBRE PUNTUAL, la tarjeta (sale del 1-dic al 7-ene, solo a quien
     tiene un corte en diciembre: ver diciembre()). */
  function tarjetaDiciembre(mi) {
    var x = mi && mi.diciembre;
    if (!x) return '';
    var h = '<div class="card mi-card mi-dic" id="miDiciembre"><div class="etq">Diciembre puntual</div>';
    if (x.decidido) {
      if (x.logrado) {
        return h + '<div class="mi-pasada">' + ico('arbol') + '<span><b>¡Lo lograste!</b> Pagaste en la fecha tus cortes de diciembre. El árbol ya está en tu isla de ' +
          esc(motor().nombreNivel(x.nivel)) + ', y se queda.</span></div></div>';
      }
      return h + '<p class="mi-nota mi-sin">Esta vez no se dio. El próximo diciembre vuelve.</p></div>';
    }
    /* Si ya se pasó una fecha, la promesa de arriba sobra: solo las filas y que vuelve. */
    if (!x.se_paso) h += '<p class="mi-nota mi-nota-arriba">Si pagas en la fecha tus cortes de diciembre, el 1 de enero a tu isla le sale un árbol de Navidad, y se queda.</p>';
    h += x.cortes.map(function (c) {
      var sub = c.estado === 'hecha' ? 'Pagado en la fecha.' : c.estado === 'abierta' ? 'Tienes hasta el ' + esc(fechaLarga(c.corte)) + '.'
        : c.estado === 'tarde' ? 'Se pagó después del corte.' : c.estado === 'cerrado' ? 'Cerrado.' : 'La fecha ya pasó.';
      return fila(c.estado === 'hecha' ? 'hecha' : c.estado === 'abierta' ? 'abierta' : 'cerrada', 'arbol', 'Corte del ' + esc(diaDeMes(c.corte)), sub, '');
    }).join('');
    return h + '<p class="mi-nota">' + (x.se_paso ? 'Este diciembre el árbol no sale. El próximo diciembre vuelve.'
      : 'Cuentan los créditos que ya tienes: no hace falta pedir otro.') + '</p></div>';
  }

  /* LA TARJETA DE NAVIDAD. ¿Es temporada? La decide app/temporada.js (del
     20-nov al 7-ene en hora de Colombia, o ?temporada=navidad para verla
     antes); sin ese archivo no hay tarjeta, como no hay guirnalda. d.temporada
     es para las pruebas. */
  function enTemporada(mi) {
    var d = (mi && mi.d) || {};
    if (d.temporada != null) return !!d.temporada;
    try {
      var g = global(), T = g.Temporada;
      if (!T || typeof T.activa !== 'function') return false;
      return !!T.activa(Date.now(), g.location ? g.location.search : '');
    } catch (x) { return false; }
  }
  /* La guirnalda: el mismo tramo de temporada.css (110 de ancho, cuatro focos
     con el brillo dibujado, sin filtros), repetido y centrado. Sirve para la
     tarjeta y para la imagen. */
  var FOCOS = [[22, 22.9, '#E5484D'], [44, 27.1, '#2EAD5B'], [66, 27.1, '#F5C542'], [88, 22.9, '#4FA3FF']];
  function guirnalda(ancho, tramo, pre) {
    var k = tramo / 110, defs = '', uno = '<path d="M0 6Q55 32 110 6" fill="none" stroke="#2B2B2B" stroke-width="1.4"/>';
    FOCOS.forEach(function (f, i) {
      defs += '<radialGradient id="' + pre + i + '"><stop offset="0" stop-color="' + f[2] + '" stop-opacity=".55"/><stop offset="1" stop-color="' + f[2] + '" stop-opacity="0"/></radialGradient>';
      uno += '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="9" fill="url(#' + pre + i + ')"/>' +
        '<rect x="' + (f[0] - 2) + '" y="' + r1(f[1] - 8.6) + '" width="4" height="3.4" rx=".8" fill="#6B6B6B"/>' +
        '<ellipse cx="' + f[0] + '" cy="' + f[1] + '" rx="3.6" ry="5.6" fill="' + f[2] + '"/>' +
        '<ellipse cx="' + r1(f[0] - 1.1) + '" cy="' + r1(f[1] - 1.6) + '" rx="1" ry="1.8" fill="#FFFFFF" fill-opacity=".55"/>';
    });
    var n = Math.ceil(ancho / tramo), x0 = (ancho - n * tramo) / 2, cuerpo = '';
    for (var i = 0; i < n; i++) cuerpo += '<g transform="translate(' + r1(x0 + i * tramo) + ' 0) scale(' + k.toFixed(3) + ')">' + uno + '</g>';
    return { defs: defs, cuerpo: cuerpo };
  }
  function tarjetaNavidad(mi) {
    if (!mi || !enTemporada(mi)) return '';
    var gu = guirnalda(660, 110, 'miGc');
    return '<div class="card laca mi-card mi-navidad" id="miNavidad">' +
      '<svg class="mi-guirnalda" viewBox="0 0 660 40" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><defs>' + gu.defs + '</defs>' + gu.cuerpo + '</svg>' +
      '<div class="etq">Tu tarjeta de Navidad</div><p class="mi-saludo">¡Feliz Navidad!</p>' +
      '<p class="mi-nota mi-nota-arriba">Una tarjeta con tu isla, para mandarla por WhatsApp.</p>' +
      '<button type="button" class="btn sec mi-wa" id="miNavidadBtn" onclick="Misiones.compartirNavidad()">' + ico('whatsapp') + ' Mandar mi tarjeta</button>' +
      '<p class="mi-ll-lleva">La imagen lleva tu isla, tu nombre y el saludo. No lleva montos ni nada de tu crédito.</p></div>';
  }

  /* TUS ISLAS: cada mundo que pasaste, con lo que construiste ahí. Sale desde
     que pasó al menos uno (en el primero no hay nada que mirar atrás).
     En la pestaña va como LISTA y las islas se dibujan solo al abrir el
     álbum: cada isla chica pesa unos 42 KB de dibujo, y alguien en Oro
     cargaría cinco cada vez que abre la Pista (medido el 16-nov). */
  /* «★ 2 · 0 cosas» se leía como un fracaso: sin cosas, solo las estrellas. */
  function cuenta(x) { return '★ ' + x.total + (x.cosas ? ' · ' + (x.cosas === 1 ? '1 cosa' : x.cosas + ' cosas') : ''); }
  function tarjetaIslas(mi) {
    var e = mi.e, P = pista();
    if (e.i < 1) return '';
    var filas = '';
    for (var i = 0; i <= e.i; i++) {
      var f = e.filas[i], x = mi.por_mundo[f.nivel] || { total: 0, cosas: 0 };
      filas += '<li class="' + (i === e.i ? 'aqui' : 'paso') + '">' + P.medalla(f.nivel, 'pn-chica') +
        '<span><b>' + esc(f.nombre) + '</b><small>' + esc(i === e.i ? 'Aquí estás' : titulo(f.nivel, true)) + '</small></span>' +
        '<em>' + esc(cuenta(x)) + '</em></li>';
    }
    return '<div class="card mi-card" id="miIslas"><div class="etq">Tus islas</div>' +
      '<p class="mi-nota mi-al-intro">Cada mundo que pasaste, con lo que construiste ahí.</p><ul class="mi-lista-islas">' + filas + '</ul>' +
      '<button type="button" class="btn sec mi-ver-islas" id="miVerIslas" onclick="Misiones.abrirIslas()">Ver mis islas</button></div>';
  }
  function hojaIslas(mi) {
    var e = mi.e, P = pista();
    function caja(f, clase, pie, est) {
      var x = mi.por_mundo[f.nivel] || { total: 0, cosas: 0 };
      var dib = clase === 'luego' ? '<div class="mi-al-velo">' + ico('candado') + '</div>'
        /* sinLuz (18-nov): las motas son una capa que se mueve, y aquí puede
           haber nueve islas a la vez; en un teléfono barato, nueve animaciones */
        : P.mundo(f.nivel, 156, 112, { cielo: 0.14, margenAbajo: 6, horizonte: 0.5, sinIslotes: true, sinLuz: true, cosas: x.cosas, navidad: arbolEn(mi, f.nivel) });
      return '<div class="mi-al ' + clase + '"><div class="mi-al-dib">' + dib + '</div><b>' + esc(f.nombre) + '</b><small>' + esc(pie) + '</small>' +
        (est ? '<small class="mi-al-st">' + esc(cuenta(x)) + '</small>' : '') + '</div>';
    }
    var h = '<div class="pn-velo" onclick="Misiones.listo()"></div>' +
      '<div class="pn-hoja mi-hoja" role="dialog" aria-modal="true" aria-labelledby="miIslasTit"><div class="pn-cuerpo-h">' +
      '<div class="etq" id="miIslasTit">Tus islas</div><p class="mi-nota mi-nota-arriba">Cada mundo que pasaste, con lo que construiste ahí.</p><div class="mi-albumes">';
    for (var i = 0; i < e.i; i++) h += caja(e.filas[i], 'paso', titulo(e.filas[i].nivel, true), true);
    h += caja(e.filas[e.i], 'aqui', 'Aquí estás', true);
    if (e.sig) h += caja(e.sig, 'luego', 'Se abre con ' + COP(e.sig.desde) + ' de garantía', false);
    var mas = e.filas.length - e.i - 2;
    /* (18-nov: aquí decía «El último se descubre al llegar»; ya no se esconde) */
    h += '</div>' + (mas > 0 ? '<p class="mi-nota">Y ' + (mas === 1 ? '1 mundo más.' : mas + ' mundos más.') + '</p>' : '');
    return h + '<button type="button" class="btn sec mi-listo" id="pnCerrar" onclick="Misiones.listo()">Cerrar</button></div></div>';
  }
  function abrirIslas() {
    if (!ULTIMO || !pista()) return false;
    return pista().abrirCon(hojaIslas(ULTIMO), 'islas');
  }

  /* La hoja del personaje y los títulos */
  var ELEGIDO = null, ULTIMO = null;
  function hojaPersonaje(mi) {
    var e = mi.e;
    var ops = PERSONAJES.map(function (o) {
      return '<button type="button" class="mi-op' + (mi.personaje === o[0] ? ' sel' : '') + '" id="miOp-' + o[0] + '" aria-pressed="' + (mi.personaje === o[0]) + '" onclick="Misiones.elegir(\'' + o[0] + '\')">' +
        ico(o[0]) + '<span>' + o[1] + '</span></button>';
    }).join('');
    var tit = e.filas.map(function (f, i) {
      var est = i < e.i ? 'paso' : i === e.i ? 'aqui' : 'luego';
      return '<li class="' + est + '"><span>' + esc(f.nombre) + '</span><b>' + esc(titulo(f.nivel, i <= e.i)) + '</b></li>';
    }).join('');
    return '<div class="pn-velo" onclick="Misiones.listo()"></div>' +
      '<div class="pn-hoja mi-hoja" role="dialog" aria-modal="true" aria-labelledby="miHojaTit"><div class="pn-cuerpo-h">' +
      '<div class="etq" id="miHojaTit">Tu personaje en la pista</div>' +
      '<p class="mi-nota mi-nota-arriba">Con qué recorres tu pista. Se guarda en este teléfono.</p><div class="mi-ops">' + ops + '</div>' +
      '<div class="etq mi-sep">Tu título</div><p class="mi-tit-grande">' + esc(mi.titulo) + '</p>' +
      '<p class="mi-nota">Cada mundo trae el suyo. Los que ya pasaste quedan en tu álbum.</p><ul class="mi-titulos">' + tit + '</ul>' +
      '<button type="button" class="btn mi-listo" id="pnCerrar" onclick="Misiones.listo()">Listo</button></div></div>';
  }
  function abrirPersonaje() {
    if (!ULTIMO || !pista()) return false;
    ELEGIDO = ULTIMO.personaje;
    return pista().abrirCon(hojaPersonaje(ULTIMO), 'personaje', function () { cambioDePersonaje(); });
  }
  function elegir(p) {
    if (!ULTIMO || !esPersonaje(p)) return false;
    ELEGIDO = p;
    var d = documento();
    PERSONAJES.forEach(function (o) {
      var b = d && d.getElementById('miOp-' + o[0]);
      if (b) { b.classList.toggle('sel', o[0] === p); b.setAttribute('aria-pressed', String(o[0] === p)); }
    });
    return true;
  }
  /* Al cerrar la hoja (Listo, el velo o Escape): si escogió otro, se guarda y
     se repinta la pista para que lo vea andando. */
  function cambioDePersonaje() {
    if (!ULTIMO || !ELEGIDO || ELEGIDO === ULTIMO.personaje) return;
    var mem = leer(ULTIMO.cuenta); mem.personaje = ELEGIDO; guardar(ULTIMO.cuenta, mem);
    ULTIMO.personaje = ELEGIDO;
    if (ULTIMO.d && typeof ULTIMO.d.repintar === 'function') ULTIMO.d.repintar();
  }
  function listo() { if (pista()) pista().cerrar(); }
  function completarPerfil() {
    if (ULTIMO && ULTIMO.d && typeof ULTIMO.d.alCompletarPerfil === 'function') ULTIMO.d.alCompletarPerfil();
  }

  /* ---------- la llegada a un mundo ---------- */
  function filaDe(e, nivel) { for (var i = 0; i < e.filas.length; i++) if (e.filas[i].nivel === nivel) return e.filas[i]; return null; }
  function pantallaLlegada(mi, desde) {
    var P = pista(), m = motor(), e = mi.e, nivel = e.nivel, nombre = m.nombreNivel(nivel), mu = P.MUNDOS[nivel], cielo = P.PALETA[nivel].cielo;
    var W = 360;
    try { if (global().innerWidth > 0) W = Math.min(488, Math.round(global().innerWidth)); } catch (x) { /* 360 */ }
    var dib = P.mundo(nivel, W, Math.round(W * 0.9), { cielo: 0.22, margenAbajo: 10, horizonte: 0.42, cosas: mi.aqui.cosas, navidad: arbolEn(mi, nivel) });
    var antes = filaDe(e, desde);
    return '<div class="mi-llegada ' + mu.clase + '" role="dialog" aria-modal="true" aria-labelledby="miLlegoTit" style="background:radial-gradient(120% 70% at 50% 30%,' +
      cielo[1] + ' 0%,' + cielo[0] + ' 60%,#07080C 100%)"><div class="mi-chispas"></div>' +
      '<div class="mi-ll-arriba"><div class="etq">Mundo ' + (e.i + 1) + ' de ' + e.filas.length + '</div><div class="mi-ll-sub">Llegaste a</div>' +
      '<h1 id="miLlegoTit">' + esc(nombre) + '</h1><div class="mi-ll-lema">' + esc(mu.lema) + '</div></div>' +
      '<div class="mi-ll-mundo">' + dib + '</div>' +
      '<div class="mi-ll-medalla">' + P.medalla(nivel) + '</div>' +
      '<div class="mi-ll-abajo"><div class="mi-ll-tit">Tu título nuevo<b>' + esc(titulo(nivel, true)) + '</b></div>' +
      '<div class="mi-ll-cambia"><div class="etq">Lo que cambia</div><p>' + esc(P.queCambia(antes, e.actual)) + '</p></div>' +
      (antes ? '<p class="mi-ll-album">Tu isla de ' + esc(antes.nombre) + ' queda en «Tus islas», con todo lo que construiste ahí.</p>' : '') +
      '<button type="button" class="btn mi-wa" id="miCompartir" onclick="Misiones.compartir()">' + ico('whatsapp') + ' Compartir mi llegada</button>' +
      '<p class="mi-ll-lleva">La imagen lleva tu mundo, tu nombre y tu título. No lleva montos ni cupo.</p>' +
      '<button type="button" class="btn sec mi-sec" id="pnCerrar" onclick="Misiones.listo()">Ver mi pista</button></div></div>';
  }
  function mostrarLlegada(mi, desde) {
    if (!pista() || !pista().abrirCon(pantallaLlegada(mi, desde), 'llegada')) return false;
    IMAGEN = null;
    prepararImagen(mi).then(function (f) { IMAGEN = f; }, function () { IMAGEN = null; });
    return true;
  }

  /* LO QUE SE GUARDA AL ABRIR LA PISTA, y la llegada. La primera vez con esta
     versión el mundo de hoy se anota CALLADO: nadie ve un «Llegaste» falso
     por un mundo al que llegó hace meses. Después, si el mundo de hoy va
     delante del último visto, sale la llegada una vez. Si no se pudo guardar,
     no sale (saldría cada vez que abra). */
  function montar(mi) {
    mi = mi || ULTIMO;
    if (!mi) return null;
    var mem = leer(mi.cuenta), cambio = false, orden = mi.e.filas.map(function (f) { return f.nivel; });
    Object.keys(mi.asignar || {}).forEach(function (k) { if (!mem.unaVez[k]) { mem.unaVez[k] = mi.asignar[k]; cambio = true; } });
    var i = orden.indexOf(mi.e.nivel), j = mem.mundo ? orden.indexOf(mem.mundo) : -1, desde = null;
    if (j < 0) { mem.mundo = mi.e.nivel; cambio = true; }
    else if (i > j) { desde = mem.mundo; mem.mundo = mi.e.nivel; cambio = true; }
    else if (i < j) { mem.mundo = mi.e.nivel; cambio = true; }
    var ok = cambio ? guardar(mi.cuenta, mem) : true;
    if (enTemporada(mi)) programarNavidad(mi);
    if (desde && ok) { mostrarLlegada(mi, desde); return desde; }
    return null;
  }
  /* La imagen de Navidad se arma ANTES del toque (el teléfono solo deja
     compartir dentro de él, y armarla tarda), pero no al abrir la Pista: un
     rato después y cuando el teléfono está quieto, para no trabar la primera
     pintada en uno barato. Una vez por isla y nombre: repintar no la rehace. */
  var NAVIDAD = null;
  function programarNavidad(mi) {
    var g = global();
    if (!documento() || typeof g.setTimeout !== 'function') return;
    var clave = [mi.e.nivel, mi.aqui.cosas, arbolEn(mi, mi.e.nivel), primerNombre(mi.d && mi.d.nombre)].join('|');
    if (NAVIDAD && NAVIDAD.clave === clave) return;
    var esta = NAVIDAD = { clave: clave, archivo: null };
    var hacer = function () {
      prepararNavidad(mi).then(function (f) { esta.archivo = f; }, function () { /* se comparte el texto */ });
    };
    g.setTimeout(function () {
      try { if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(hacer, { timeout: 3000 }); else hacer(); } catch (x) { /* nada */ }
    }, 1200);
  }

  /* ---------- la tarjeta para WhatsApp ----------
     Una IMAGEN armada aquí mismo (SVG → canvas → PNG): el mundo, el nombre
     de pila y el título. Nada de montos, cupo ni créditos. Solo sale si el
     cliente toca «Compartir»; se prepara al abrir la llegada porque el
     teléfono solo deja compartir dentro del toque, y armarla tarda. */
  var IMAGEN = null;
  /* ¿Ganó el árbol de «Diciembre puntual» en esa isla? */
  function arbolEn(mi, nivel) { return !!(mi && mi.navidad_en && mi.navidad_en[nivel]); }
  /* Las capas de un dibujo de la Pista, puestas en la imagen a la altura y. */
  function capasDe(dib, y) {
    return (dib.match(/<svg[\s\S]*?<\/svg>/g) || []).map(function (s) {
      return s.replace(/^<svg /, '<svg x="0" y="' + y + '" width="1080" height="860" ');
    }).join('');
  }
  function sinVariables(svg, colorDe) {
    return svg.replace(/var\((--[\w-]+)\)/g, function (todo, n) { return (colorDe && colorDe(n)) || '#888888'; });
  }
  function primerNombre(n) { return String(n || '').replace(/^\s+/, '').split(/\s+/)[0] || ''; }
  /* El SVG de la tarjeta, sin variables de CSS (una imagen no las ve): se
     reemplazan por el color que tienen en la página. */
  function tarjetaSvg(mi, colorDe) {
    var P = pista(), m = motor(), nivel = mi.e.nivel, nombre = m.nombreNivel(nivel), mu = P.MUNDOS[nivel], cielo = P.PALETA[nivel].cielo;
    var capas = capasDe(P.mundo(nivel, 1080, 860, { cielo: 0.16, margenAbajo: 24, horizonte: 0.42, cosas: mi.aqui.cosas, navidad: arbolEn(mi, nivel) }), 120);
    var med = P.medalla(nivel).replace(/^<svg /, '<svg x="90" y="1010" width="150" height="150" ');
    var quien = primerNombre(mi.d && mi.d.nombre), tit = titulo(nivel, true);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">' +
      '<defs><linearGradient id="miF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + cielo[0] + '"/><stop offset=".55" stop-color="' + cielo[1] + '"/><stop offset="1" stop-color="#07080C"/></linearGradient></defs>' +
      '<rect width="1080" height="1350" fill="url(#miF)"/>' + capas +
      '<rect y="980" width="1080" height="370" fill="#07080C" fill-opacity=".72"/>' + med +
      '<text x="270" y="1052" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="34" fill="#FBF7F4" fill-opacity=".8">Llegué a</text>' +
      '<text x="268" y="1118" font-family="Georgia,serif" font-size="64" font-weight="700" fill="#FFFFFF">' + esc(nombre + ' · ' + mu.lema) + '</text>' +
      '<text x="270" y="1170" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="34" font-weight="700" fill="#F5C542">' + esc((quien ? quien + ' · ' : '') + tit) + '</text>' +
      '<text x="90" y="1290" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="30" font-weight="700" letter-spacing="4" fill="#FBF7F4" fill-opacity=".85">TU GARANTÍA · TUGARANTIA.NET</text></svg>';
    return sinVariables(svg, colorDe);
  }
  /* LA IMAGEN DE NAVIDAD, del mismo tamaño que la de la llegada: la guirnalda
     arriba, su isla (con el árbol si lo ganó ahí), el saludo y su nombre de
     pila. Ni montos, ni cupo, ni el nombre del nivel. */
  function navidadSvg(mi, colorDe) {
    var P = pista(), nivel = mi.e.nivel, cielo = P.PALETA[nivel].cielo, gu = guirnalda(1080, 270, 'miGi');
    var capas = capasDe(P.mundo(nivel, 1080, 860, { cielo: 0.16, margenAbajo: 24, horizonte: 0.42, cosas: mi.aqui.cosas, navidad: arbolEn(mi, nivel) }), 150);
    var quien = primerNombre(mi.d && mi.d.nombre);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">' +
      '<defs><linearGradient id="miFn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + cielo[0] + '"/><stop offset=".55" stop-color="' + cielo[1] + '"/><stop offset="1" stop-color="#07080C"/></linearGradient>' + gu.defs + '</defs>' +
      '<rect width="1080" height="1350" fill="url(#miFn)"/>' + capas +
      '<rect y="1000" width="1080" height="350" fill="#07080C" fill-opacity=".74"/>' + gu.cuerpo +
      '<text x="540" y="1116" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="104" font-weight="700" fill="#F5C542">¡Feliz Navidad!</text>' +
      (quien ? '<text x="540" y="1186" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="40" fill="#FBF7F4" fill-opacity=".88">' + esc('De parte de ' + quien) + '</text>' : '') +
      '<text x="540" y="1292" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="30" font-weight="700" letter-spacing="4" fill="#FBF7F4" fill-opacity=".85">TU GARANTÍA · TUGARANTIA.NET</text></svg>';
    return sinVariables(svg, colorDe);
  }
  function prepararImagen(mi) {
    return aImagen(mi, function (colorDe) { return tarjetaSvg(mi, colorDe); }, 'llegue-a-' + mi.e.nivel.replace(/\s+/g, '-') + '.png');
  }
  function prepararNavidad(mi) {
    return aImagen(mi, function (colorDe) { return navidadSvg(mi, colorDe); }, 'feliz-navidad.png');
  }
  /* SVG → canvas → PNG. Los colores de las variables salen de una muestra con
     la clase del mundo, que es de donde los toma el dibujo en la página. */
  function aImagen(mi, armar, archivo) {
    return new Promise(function (bien, mal) {
      try {
        var d = documento();
        if (!d || typeof Image === 'undefined') return mal(new Error('sin documento'));
        var muestra = d.createElement('div');
        muestra.className = pista().MUNDOS[mi.e.nivel].clase;
        muestra.style.display = 'none';
        d.body.appendChild(muestra);
        var cs = getComputedStyle(muestra);
        var svg = armar(function (n) { return String(cs.getPropertyValue(n) || '').trim(); });
        d.body.removeChild(muestra);
        var img = new Image();
        img.onload = function () {
          try {
            var c = d.createElement('canvas'); c.width = 1080; c.height = 1350;
            c.getContext('2d').drawImage(img, 0, 0, 1080, 1350);
            c.toBlob(function (b) {
              if (!b) return mal(new Error('sin imagen'));
              try { bien(new File([b], archivo, { type: 'image/png' })); } catch (x) { mal(x); }
            }, 'image/png');
          } catch (x) { mal(x); }
        };
        img.onerror = function () { mal(new Error('no se pudo armar')); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (x) { mal(x); }
    });
  }
  function textoCompartir(mi) { return '¡Llegué a ' + motor().nombreNivel(mi.e.nivel) + ' en Tu Garantía! https://tugarantia.net'; }
  /* Con la imagen si el teléfono deja compartir archivos; si no, solo el
     texto; y si no hay con qué compartir (un computador), WhatsApp web. */
  function compartir() {
    var mi = ULTIMO; if (!mi) return false;
    return compartirCon(IMAGEN, textoCompartir(mi));
  }
  /* El texto de la de Navidad no dice nada del cliente: el saludo y la casa. */
  function textoNavidad() { return '¡Feliz Navidad! https://tugarantia.net'; }
  function compartirNavidad() {
    if (!ULTIMO) return false;
    return compartirCon(NAVIDAD && NAVIDAD.archivo, textoNavidad());
  }
  function compartirCon(imagen, texto) {
    var g = global(), n = g.navigator || {};
    try {
      if (imagen && n.canShare && n.canShare({ files: [imagen] })) { n.share({ files: [imagen], text: texto }).catch(function () {}); return 'imagen'; }
      if (n.share) { n.share({ text: texto }).catch(function () {}); return 'texto'; }
    } catch (x) { /* abajo */ }
    try { g.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener'); } catch (x) { /* nada */ }
    return 'enlace';
  }

  /* ======================= LO QUE USA LA PISTA ======================= */
  /* La Pista llama a esto al pintarse: guarda el estado para los botones. */
  /* ¿Llegó misiones.css? Sin ella las tarjetas saldrían como texto suelto:
     mejor la Pista como antes. Donde no hay con qué preguntar (el banco de
     pruebas), se da por llegada. */
  function cssLlego() {
    try {
      var d = documento();
      if (!d || !d.documentElement || typeof getComputedStyle !== 'function') return true;
      return String(getComputedStyle(d.documentElement).getPropertyValue('--mi-listo') || '').trim() !== '';
    } catch (e) { return true; }
  }
  function paraLaPista(d, e, rec) {
    if (!cssLlego()) { ULTIMO = null; return null; }
    var mi = calcular(d, e, rec);
    ULTIMO = mi;
    return mi;
  }

  return {
    VERSION: '2026-11-18',
    INVITA_ENCENDIDA: INVITA_ENCENDIDA, CADA: CADA, DIAS_MADRUGADOR: DIAS_MADRUGADOR,
    METAS_RACHA: METAS_RACHA, PERFIL_METAS: PERFIL_METAS, SENSIBLES: SENSIBLES,
    TITULOS: TITULOS, PERSONAJES: PERSONAJES, ICONOS: IC,
    calcular: calcular, paraLaPista: paraLaPista, montar: montar,
    quincenas: quincenas, abierta: abierta, rachas: rachas, perfil: perfil, titulo: titulo,
    chip: chip, pildora: pildora,
    tarjetaQuincena: tarjetaQuincena, tarjetaUnaVez: tarjetaUnaVez, tarjetaRachas: tarjetaRachas, tarjetaIslas: tarjetaIslas, hojaIslas: hojaIslas,
    DICIEMBRE_DESDE: DICIEMBRE_DESDE, ULTIMO_DIA_ENERO: ULTIMO_DIA_ENERO, diciembre: diciembre, tarjetaDiciembre: tarjetaDiciembre,
    enTemporada: enTemporada, tarjetaNavidad: tarjetaNavidad, navidadSvg: navidadSvg, guirnalda: guirnalda,
    textoNavidad: textoNavidad, compartirNavidad: compartirNavidad,
    hojaPersonaje: hojaPersonaje, pantallaLlegada: pantallaLlegada, tarjetaSvg: tarjetaSvg, textoCompartir: textoCompartir,
    abrirPersonaje: abrirPersonaje, abrirIslas: abrirIslas, elegir: elegir, listo: listo, completarPerfil: completarPerfil,
    mostrarLlegada: mostrarLlegada, compartir: compartir,
    leer: leer, guardar: guardar, llave: llave,
    fechaLarga: fechaLarga, sumarDias: sumarDias,
    ultimo: function () { return ULTIMO; }
  };
});
