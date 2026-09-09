/* ============================================================================
 * LAS COMISIONES DE LOS ASESORES — 9 de septiembre de 2026
 *
 * Joan: «los clientes que se registren ellos ganan 5000 pesos y si el cliente
 * pide el credito se pague 15000 pesos… esos 20.000 ganados se veran siempre en
 * su usuario de asesor pero siguen bloqueados hasta que el cliente pague, cuando
 * el cliente pague el asesor gana 10.000 adicionales y tiene la posibilidad de
 * desbloquear los 20000… y de ahi en adelante cada vez que el cliente pase de
 * nuevo por la plataforma se le pague al asesor 5000 pesos por la cobranza…
 * pero por cada cliente que despues de recibir su credito no pague en menos de
 * 20 dias de mora se descuenta 10.000 pesos al asesor que hizo la venta».
 *
 * ---------------------------------------------------------------------------
 * ESTA PLATA SALE DEL MARGEN DE JOAN Y NUNCA SE LE SUMA AL CLIENTE.
 *
 * No es una preferencia: la Ley 45 de 1990, artículo 68, reputa INTERESES los
 * cobros que se le hacen al deudor «aun cuando las mismas se justifiquen por
 * concepto de honorarios, comisiones u otros semejantes». Cargarle al cliente
 * la comisión del asesor lo mete en el cálculo de la usura. Por eso en este
 * archivo no hay una sola función que toque el precio de un crédito, y
 * pruebas/creditos.test.js ya tiene un centinela que prohíbe la palabra
 * «comisión» en lo que se le cotiza al cliente.
 *
 * ---------------------------------------------------------------------------
 * EL CONTRATO DE ESTE ARCHIVO, igual que puente.js y tanda.js:
 * funciones PURAS. Sin localStorage, sin fetch, sin document, y sin
 * `new Date()` adentro — la fecha entra SIEMPRE por parámetro. Es la lección
 * que costó el commit 36209a9: una función que lee el reloj de pared contesta
 * distinto según el día en que se le pregunte, y entonces no se puede probar ni
 * auditar.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UNA LISTA DE MOVIMIENTOS Y NO UN SALDO
 *
 * Un campo `saldoBloqueado` sería un campo «pisable»: la sincronización entre el
 * computador y el celular de Joan solo sabe fusionar LISTAS QUE SUMAN
 * (panel/nube.js), y «mandar lo mío encima» borraría lo que solo esté en el otro
 * aparato. Un saldo con estado ya costó caro una vez (`p.saldoAFavor`, que hubo
 * que escribir SIEMPRE, hasta en cero, para que una diferencia entre aparatos
 * fuera un choque visible y no una copia silenciosa).
 *
 * Así que cada peso es un HECHO FECHADO con su propio id, y el saldo es un
 * pliegue de esos hechos — la misma forma de `amortizarCupon` en motor.js y de
 * las condonaciones en nube.js.
 *
 * Y por eso mismo el libro se PUBLICA, no se recalcula: si Joan borra un
 * crédito, una comisión derivada desaparecería sola y en silencio. Un borrado
 * tiene que producir un movimiento `reverso` explícito que él vea.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./puente.js'));
  else raiz.ComisionesTuGarantia = fabrica(raiz.PuenteTuGarantia);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  /* ------------------------------------------------------------ utilidades */
  function lista(v) { return Array.isArray(v) ? v : []; }
  function num(v) { return Number(v) || 0; }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function dia(v) { return texto(v).slice(0, 10); }
  function sumar(fechaISO, dias) {
    var d = new Date(dia(fechaISO) + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ==========================================================================
   * LAS TARIFAS, CON FECHA DE VIGENCIA
   *
   * No es una constante: es una lista con `desde`. El día que Joan suba una
   * tarifa, lo YA GANADO tiene que quedarse con el valor del día en que se ganó
   * — si no, subir el pago de hoy le reescribiría hacia atrás lo que le debe a
   * cada asesor. Es la misma doctrina que la tabla de usura en creditos.js.
   *
   * Se ordena de más nueva a más vieja y se busca la primera que ya rija.
   * ======================================================================== */
  var TARIFAS = [
    {
      desde: '2026-09-09',
      registro: 5000,      // el cliente se registró por este asesor
      desembolso: 15000,   // y le desembolsaron su PRIMER crédito
      pago: 10000,         // y lo pagó
      recurrencia: 5000,   // por cada crédito POSTERIOR que cierre
      castigo: 10000,      // si un crédito llega a 20 días de mora
      dias_castigo: 20
    }
  ];

  function tarifaEn(fechaISO) {
    var f = dia(fechaISO);
    var ordenadas = TARIFAS.slice().sort(function (a, b) { return b.desde < a.desde ? -1 : 1; });
    for (var i = 0; i < ordenadas.length; i++) if (ordenadas[i].desde <= f) return ordenadas[i];
    return ordenadas[ordenadas.length - 1];
  }

  /* --------------------------------------------------------------------------
   * EL PUNTO DE EQUILIBRIO — la cuenta que decide si el esquema se sostiene
   *
   * El costo de un crédito quincenal es un porcentaje del capital. La comisión
   * del primer ciclo (registro + desembolso + pago) es una cifra FIJA. Por
   * debajo de cierto capital, cada cliente nuevo que trae un asesor le cuesta
   * plata a Joan.
   *
   * Esto no decide nada por su cuenta: devuelve el número para que la pantalla
   * lo enseñe y Joan decida. Lo que sí hace `derivarMovimientos` es negarse a
   * publicar una comisión que el propio crédito no alcanza a pagar, si se le
   * pide con `frenoDePlata`.
   * ------------------------------------------------------------------------ */
  function primerCicloCuesta(tarifa) {
    var t = tarifa || tarifaEn('2026-09-09');
    return num(t.registro) + num(t.desembolso) + num(t.pago);
  }
  function puntoDeEquilibrio(tasaCostoPct, tarifa) {
    var pct = num(tasaCostoPct);
    if (pct <= 0) return Infinity;
    return Math.ceil(primerCicloCuesta(tarifa) / (pct / 100));
  }

  /* ==========================================================================
   * LA FORMA DE UN MOVIMIENTO
   *
   * `id` desde el nacimiento, y no un índice: dos hechos iguales el mismo día
   * se funden en uno si no tienen id propio, y el segundo se pierde en la
   * sincronización. Eso ya pasó en este proyecto con dos abonos iguales.
   *
   * IDENTIDAD PARA LA FUSIÓN: tipo + asesor + socio + crédito + fecha.
   * El MONTO y el MOTIVO quedan FUERA a propósito. Meter un campo que cambia
   * dentro de la identidad de un hecho fue lo que duplicó una prórroga y
   * produjo ingreso fantasma, cupo regalado y una prórroga quemada de más.
   * ======================================================================== */
  var IDENTIDAD = ['tipo', 'asesor_id', 'socio_id', 'credito_id', 'fecha'];

  var TIPOS = ['registro', 'desembolso', 'pago', 'recurrencia', 'castigo_mora',
               'desbloqueo', 'perdon_castigo', 'reverso', 'ajuste'];

  /* Los que nacen BLOQUEADOS: el asesor los ve desde el primer día —Joan lo
     pidió así— pero no los puede cobrar hasta que el cliente pague. */
  var NACEN_BLOQUEADOS = ['registro', 'desembolso'];

  function mov(o) {
    return {
      id: texto(o.id),
      fecha: dia(o.fecha),
      asesor_id: texto(o.asesor_id),
      socio_id: texto(o.socio_id),
      credito_id: o.credito_id ? texto(o.credito_id) : null,
      tipo: texto(o.tipo),
      monto: Math.round(num(o.monto)),
      motivo: texto(o.motivo),
      quien: texto(o.quien) || 'sistema'
    };
  }

  /* --------------------------------------------------------------------------
   * QUIÉN ERA EL ASESOR EN UNA FECHA
   *
   * Las asignaciones son una lista que solo SUMA: {socio_id, asesor_id, desde}.
   * Reasignar no borra la anterior — la historia no se reescribe hacia atrás.
   * ------------------------------------------------------------------------ */
  function asesorDe(asignaciones, socioId, fechaISO) {
    var f = dia(fechaISO), s = texto(socioId), gana = null;
    lista(asignaciones).forEach(function (a) {
      if (texto(a.socio_id) !== s) return;
      if (dia(a.desde) > f) return;
      if (!gana || dia(a.desde) >= dia(gana.desde)) gana = a;
    });
    return gana ? texto(gana.asesor_id) : '';
  }

  /* --------------------------------------------------------------------------
   * LOS CRÉDITOS DE UN SOCIO, EN ORDEN DE VERDAD
   *
   * Por fecha de desembolso y, si empatan, por el número que emitió la base.
   * NUNCA por el orden del arreglo: ese depende de en qué aparato se guardó.
   * ------------------------------------------------------------------------ */
  function creditosDelSocio(prestamos, socioId) {
    var s = texto(socioId);
    return lista(prestamos).filter(function (p) { return texto(p.socioId) === s; })
      .sort(function (a, b) {
        var fa = dia(a.fechaDesembolso), fb = dia(b.fechaDesembolso);
        if (fa !== fb) return fa < fb ? -1 : 1;
        return num(a.numero) - num(b.numero);
      });
  }

  /* --------------------------------------------------------------------------
   * G5 · ¿LLEGÓ ESTE CRÉDITO A 20 DÍAS DE MORA, Y QUÉ DÍA?
   *
   * Se recorre la LÍNEA DE TIEMPO de cortes (puente.js: cortesDelCredito), no
   * el corte de hoy. La diferencia no es de estilo: una prórroga mueve el corte
   * de hoy y la mora de ayer se iría a cero — «una pregunta con fecha adentro
   * contestada con el campo de hoy» es el defecto que este proyecto ya arregló
   * once veces.
   *
   * Un tramo alcanza el castigo si pasaron `dias_castigo` corridos desde su
   * corte ANTES de que ese tramo terminara (por prórroga, por plan de pagos o
   * porque el crédito se pagó). Se devuelve el día veinte de ese tramo, no el
   * día en que alguien abrió la pantalla.
   *
   * LO QUE NO SE MIRA, y es deliberado:
   *   · `p.recargoMora` ni `p.condonaciones`: perdonarle la plata al cliente no
   *     puede lavar la historia. Si Joan también quiere perdonarle el castigo al
   *     asesor, eso es otro hecho fechado y con motivo (perdon_castigo).
   *   · Los abonos. `evaluarCastigo` del motor cancela el castigo del SOCIO con
   *     cualquier abono, hasta de un peso; copiar esa regla acá dejaría que mil
   *     pesos el día 19 borraran diez mil de descuento al asesor.
   * ------------------------------------------------------------------------ */
  function diaDelCastigo(p, hastaISO, diasCastigo) {
    if (!p || !P || typeof P.cortesDelCredito !== 'function') return '';
    var tope = num(diasCastigo) || 20;
    var hasta = dia(hastaISO);
    var fin = dia(p.pagado ? (p.fechaPagado || hasta) : hasta);
    if (!fin) return '';
    var tramos = P.cortesDelCredito(p).filter(function (t) { return t.corte; });
    for (var i = 0; i < tramos.length; i++) {
      var corte = dia(tramos[i].corte);
      if (!corte) continue;
      /* El tramo termina cuando empieza el siguiente, o cuando el crédito se
         cerró, o en la fecha de corte de la consulta. */
      var siguiente = tramos[i + 1] ? dia(tramos[i + 1].desde) : '';
      var finTramo = siguiente && siguiente < fin ? siguiente : fin;
      var dia20 = sumar(corte, tope);
      if (dia20 && dia20 <= finTramo) return dia20;
    }
    return '';
  }

  /* ==========================================================================
   * DERIVAR EL LIBRO
   *
   * @param d.socios        la cartera
   * @param d.prestamos     los créditos
   * @param d.registros     las filas de la bandeja, con asesor_id y creado_en
   * @param d.asignaciones  [{socio_id, asesor_id, desde}], append-only
   * @param d.hasta         la fecha de corte de la consulta (obligatoria)
   * @param d.frenoDePlata  si es true, no publica la comisión de desembolso de
   *                        un crédito cuyo costo no alcanza a pagar el primer
   *                        ciclo. Apagado por defecto: es una POLÍTICA de Joan,
   *                        no una ley del sistema.
   * ======================================================================== */
  function derivarMovimientos(d) {
    var e = d || {};
    var hasta = dia(e.hasta);
    if (!hasta) return [];
    var asign = lista(e.asignaciones);
    var out = [];
    var visto = {};
    function anotar(o) {
      var m = mov(o);
      if (!m.asesor_id || !m.fecha || m.fecha > hasta) return;
      var llave = IDENTIDAD.map(function (k) { return m[k]; }).join('|');
      if (visto[llave]) return;          // un hecho, un movimiento
      visto[llave] = true;
      out.push(m);
    }

    /* G1 · el registro. Un registro que Joan descartó no paga: pagar por traer
       a alguien que él rechazó sería pagar por el volumen y no por el cliente. */
    lista(e.registros).forEach(function (r) {
      if (texto(r.estado) === 'descartado') return;
      var f = dia(r.creado_en);
      var asesor = texto(r.asesor_id) || asesorDe(asign, r.socio_id, f);
      var t = tarifaEn(f);
      anotar({ id: 'registro:' + texto(r.id), fecha: f, asesor_id: asesor,
               socio_id: texto(r.socio_id), credito_id: null, tipo: 'registro',
               monto: t.registro, motivo: 'se registró por este asesor' });
    });

    lista(e.socios).forEach(function (s) {
      var creditos = creditosDelSocio(e.prestamos, s.id);
      if (!creditos.length) return;
      var primero = creditos[0];
      var fDes = dia(primero.fechaDesembolso);
      var t = tarifaEn(fDes);

      /* G2 · el desembolso. UNA VEZ POR CLIENTE, no por crédito: si fuera por
         crédito, el mismo cliente re-tomado diez veces pagaría diez bonos de
         adquisición. Es lo que separa las dos frases de Joan — 15.000 «si el
         cliente pide el crédito» y 5.000 «cada vez que pase de nuevo». */
      var asesorVenta = asesorDe(asign, s.id, fDes);
      var cabe = true;
      if (e.frenoDePlata) {
        /* El freno: lo que Joan gana con ese crédito es capital × costo. Si no
           alcanza para el primer ciclo, publicar la comisión sería pagarle al
           asesor más de lo que el crédito produce. */
        var gana = Math.round(num(primero.capital) * num(primero.costoPct) / 100);
        cabe = gana >= primerCicloCuesta(t);
      }
      if (cabe) {
        anotar({ id: 'desembolso:' + texto(primero.id), fecha: fDes, asesor_id: asesorVenta,
                 socio_id: texto(s.id), credito_id: texto(primero.id), tipo: 'desembolso',
                 monto: t.desembolso, motivo: 'primer crédito desembolsado' });
      }

      /* G3 · el pago del primer crédito. */
      if (primero.pagado && dia(primero.fechaPagado)) {
        var fPago = dia(primero.fechaPagado);
        anotar({ id: 'pago:' + texto(primero.id), fecha: fPago,
                 asesor_id: asesorDe(asign, s.id, fPago), socio_id: texto(s.id),
                 credito_id: texto(primero.id), tipo: 'pago',
                 monto: tarifaEn(fPago).pago, motivo: 'el cliente pagó su primer crédito' });
      }

      /* G4 · la recurrencia. De las cuatro lecturas posibles de «cada vez que
         pase de nuevo por la plataforma», esta es la única que se puede medir
         con lo que el sistema guarda hoy, está fechada, no se repite y es
         literalmente la cobranza: que CIERRE un crédito posterior al primero.
         Una prórroga NO cuenta — es el mismo crédito, y contarla convertiría en
         negocio del asesor que el cliente no salde.
         El asesor es el ASIGNADO EN ESA FECHA, no el que hizo la venta: esto se
         paga por cobrar, y quien cobró fue el de ahora. */
      creditos.slice(1).forEach(function (p) {
        if (!p.pagado || !dia(p.fechaPagado)) return;
        var f = dia(p.fechaPagado);
        anotar({ id: 'recurrencia:' + texto(p.id), fecha: f,
                 asesor_id: asesorDe(asign, s.id, f), socio_id: texto(s.id),
                 credito_id: texto(p.id), tipo: 'recurrencia',
                 monto: tarifaEn(f).recurrencia, motivo: 'cerró otro crédito' });
      });

      /* G5 · el castigo. Al asesor de LA VENTA, congelado: es lo que Joan dijo
         —«se descuenta al asesor que hizo la venta»— y es lo que hace que el
         incentivo apunte a vender bien y no solo a vender. */
      creditos.forEach(function (p) {
        var f = diaDelCastigo(p, hasta, tarifaEn(hasta).dias_castigo);
        if (!f) return;
        anotar({ id: 'castigo:' + texto(p.id), fecha: f, asesor_id: asesorVenta,
                 socio_id: texto(s.id), credito_id: texto(p.id), tipo: 'castigo_mora',
                 monto: -Math.abs(tarifaEn(f).castigo),
                 motivo: 'el crédito llegó a ' + tarifaEn(f).dias_castigo + ' días de mora' });
      });
    });

    /* Los hechos que escribe Joan a mano (desbloqueos, perdones, ajustes,
       reversos) no se derivan: entran tal cual y en su fecha. */
    lista(e.actos).forEach(function (a) { anotar(a); });

    return out.sort(function (a, b) {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      return a.id < b.id ? -1 : 1;   // orden estable: dos hechos del mismo día no bailan
    });
  }

  /* ==========================================================================
   * EL PLIEGUE — lo que el asesor ve y lo que Joan paga, de la MISMA llamada
   *
   * Que sean dos funciones distintas es como nacen las dos verdades. Este
   * proyecto ya tuvo doce copias de la misma cuenta y dos contestaban distinto.
   *
   * Las bolsas:
   *   · bloqueado — ganado y visible, pero todavía no cobrable
   *   · libre     — Joan se lo debe
   *   · pagado    — Joan ya se lo pagó
   *   · deuda     — castigos que no cupieron en lo que tenía. NO se descuenta
   *                 de lo ya pagado: quitarle plata que ya está en su bolsillo
   *                 no lo decide una fórmula. Sale a la vista para que Joan
   *                 decida, que es distinto de esconderlo en un número negativo.
   * ======================================================================== */
  function saldoDeAsesor(movimientos, asesorId, hastaISO) {
    var a = texto(asesorId), hasta = dia(hastaISO);
    var bloq = 0, libre = 0, pagado = 0, castigos = 0, deuda = 0;
    var porCliente = {};
    var linea = lista(movimientos)
      .filter(function (m) { return texto(m.asesor_id) === a && (!hasta || dia(m.fecha) <= hasta); })
      .sort(function (x, y) {
        if (dia(x.fecha) !== dia(y.fecha)) return dia(x.fecha) < dia(y.fecha) ? -1 : 1;
        return texto(x.id) < texto(y.id) ? -1 : 1;
      })
      .map(function (m) {
        var t = texto(m.tipo), monto = num(m.monto), s = texto(m.socio_id);
        porCliente[s] = porCliente[s] || { bloqueado: 0, pagado_el_cliente: false };

        if (NACEN_BLOQUEADOS.indexOf(t) >= 0) {
          bloq += monto; porCliente[s].bloqueado += monto;
        } else if (t === 'pago') {
          libre += monto; porCliente[s].pagado_el_cliente = true;
        } else if (t === 'recurrencia' || t === 'ajuste') {
          libre += monto;
        } else if (t === 'desbloqueo') {
          /* Mueve de bolsa lo de ESE cliente. No suma plata nueva. */
          var mueve = Math.min(porCliente[s].bloqueado, bloq);
          bloq -= mueve; libre += mueve; porCliente[s].bloqueado -= mueve;
        } else if (t === 'castigo_mora') {
          var falta = Math.abs(monto);
          castigos += falta;
          var deLibre = Math.min(libre, falta); libre -= deLibre; falta -= deLibre;
          var deBloq = Math.min(bloq, falta); bloq -= deBloq; falta -= deBloq;
          porCliente[s].bloqueado = Math.max(0, porCliente[s].bloqueado - deBloq);
          deuda += falta;          // lo que no cupo: a la vista, no escondido
        } else if (t === 'perdon_castigo') {
          var vuelve = Math.abs(monto);
          var deDeuda = Math.min(deuda, vuelve); deuda -= deDeuda; vuelve -= deDeuda;
          libre += vuelve; castigos -= Math.abs(monto);
        } else if (t === 'reverso') {
          var quita = Math.abs(monto);
          var q1 = Math.min(bloq, quita); bloq -= q1; quita -= q1;
          var q2 = Math.min(libre, quita); libre -= q2; quita -= q2;
          deuda += quita;
        } else if (t === 'liquidacion') {
          var paga = Math.min(libre, Math.abs(monto));
          libre -= paga; pagado += paga;
        }
        return {
          id: m.id, fecha: dia(m.fecha), tipo: t, monto: monto,
          socio_id: s, credito_id: m.credito_id || null, motivo: texto(m.motivo),
          bloqueado_despues: bloq, libre_despues: libre, deuda_despues: deuda
        };
      });

    return { asesor_id: a, hasta: hasta, bloqueado: bloq, libre: libre,
             pagado: pagado, castigos: castigos, deuda: deuda,
             total_ganado: bloq + libre + pagado, movimientos: linea };
  }

  /* --------------------------------------------------------------------------
   * ¿SE PUEDE DESBLOQUEAR LO DE ESTE CLIENTE?
   *
   * Joan dijo «tiene la posibilidad de desbloquear». La posibilidad tiene una
   * condición y la pantalla no puede prometerla sin ella: que el cliente haya
   * pagado. Esta función existe para que el botón se apague ANTES de que
   * alguien lo toque, en vez de fallar después — la interfaz no promete lo que
   * el código no hace.
   * ------------------------------------------------------------------------ */
  function puedeDesbloquear(movimientos, asesorId, socioId) {
    var a = texto(asesorId), s = texto(socioId);
    var suyos = lista(movimientos).filter(function (m) {
      return texto(m.asesor_id) === a && texto(m.socio_id) === s;
    });
    var pago = suyos.some(function (m) { return texto(m.tipo) === 'pago'; });
    var yaDesbloqueado = suyos.some(function (m) { return texto(m.tipo) === 'desbloqueo'; });
    var bloqueado = suyos.filter(function (m) { return NACEN_BLOQUEADOS.indexOf(texto(m.tipo)) >= 0; })
      .reduce(function (t, m) { return t + num(m.monto); }, 0);
    if (!bloqueado) return { puede: false, motivo: 'Este cliente no tiene nada bloqueado.', monto: 0 };
    if (yaDesbloqueado) return { puede: false, motivo: 'Ya se desbloqueó.', monto: 0 };
    if (!pago) return { puede: false, monto: bloqueado,
      motivo: 'El cliente todavía no ha pagado su primer crédito. Los ' +
              bloqueado.toLocaleString('es-CO') + ' se desbloquean cuando pague.' };
    return { puede: true, monto: bloqueado, motivo: '' };
  }

  return {
    VERSION: '2026-09-09',
    TARIFAS: TARIFAS,
    TIPOS: TIPOS,
    IDENTIDAD: IDENTIDAD,
    NACEN_BLOQUEADOS: NACEN_BLOQUEADOS,
    tarifaEn: tarifaEn,
    primerCicloCuesta: primerCicloCuesta,
    puntoDeEquilibrio: puntoDeEquilibrio,
    asesorDe: asesorDe,
    creditosDelSocio: creditosDelSocio,
    diaDelCastigo: diaDelCastigo,
    derivarMovimientos: derivarMovimientos,
    saldoDeAsesor: saldoDeAsesor,
    puedeDesbloquear: puedeDesbloquear
  };
});
