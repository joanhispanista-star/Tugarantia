/* ===========================================================================
 * TU GENTE — quién le trae clientes a Joan, medido para Joan y SOLO para Joan.
 * 2 de octubre de 2026.
 *
 * Joan, el 1-oct: «que pueda ver los indicadores de referidos desde el CRM».
 * El plan (PLAN-CRM-OCTUBRE.md §3) pide, por cada cliente que invita: a cuántos
 * invitó, cuántos ya pidieron, cuántos CRÉDITOS pagó su gente, la garantía que
 * el motor le acreditó por ellos (con el tope a la vista) y una simulación de lo
 * que costaría el programa de referidos v3 si estuviera encendido.
 *
 * POR QUÉ ES UN MÓDULO Y NO UNAS LÍNEAS DENTRO DEL CELULAR
 * Lo va a pintar el Panel del bolsillo (panel/espejo.html) hoy y crm.html
 * después. Si cada pantalla contara a su manera, el mismo cliente tendría dos
 * cifras según el aparato, que es justo la enfermedad de las doce copias que
 * este proyecto lleva semanas quitándose. Y una cuenta que vive en una función
 * de pintar no se prueba nunca: esta se prueba con `node --test`.
 *
 * LO QUE NO SE REESCRIBE ACÁ, Y POR QUÉ
 * La garantía por referidos —5.000 por invitado que pagó, con el tope de la
 * garantía ganada— es una regla del MOTOR (garantiaPorReferidos,
 * topeGarantiaPorReferidos, desglosarGarantia) y la entrada la arma el PUENTE
 * (entradaGarantia, que ya trae el tope que Joan haya puesto en Ajustes). Este
 * archivo PREGUNTA esa cifra, no la calcula. Si mañana cambia la regla, esta
 * pantalla dice lo nuevo sin que nadie la toque.
 *
 * LA SIMULACIÓN NO ES UNA DEUDA
 * «Si el programa estuviera encendido»: créditos pagados por su gente × 2.000.
 * Es la regla 1 de la v3 de PLAN-REFERIDOS.md («2.000 fijos por crédito
 * pagado»), que Joan todavía no aprobó. Va SIN la «regla 1» de esa misma v3
 * (créditos vivos a la vez cuentan como uno) porque esa parte también está sin
 * aprobar y cambia la cifra; contarla acá sería decidir por él. Toda pantalla
 * que la muestre tiene que decir ROTULO_SIMULACION al lado: no se le debe nada
 * a nadie.
 *
 * Y CUENTA SOLO CRÉDITOS QUINCENALES. El préstamo con garantía se paga a cuotas
 * y la v3 no dice cuándo cuenta como «pagado completo». El motor tampoco lo
 * cuenta para la garantía por referidos (referidosDe mira `prestamos`). Si se
 * contara acá, la simulación y la garantía hablarían de créditos distintos.
 *
 * PARA QUIÉN ES — LA REGLA QUE NO SE NEGOCIA
 * Nada de lo que sale de acá llega a quien invita. Que un tercero pagó, pidió o
 * está en mora no es dato de quien lo invitó (Ley 2300 art. 4; ver también
 * migrarSocio en puente.js, que desde el 1-oct manda la lista de referidos
 * VACÍA al teléfono del cliente). Por eso:
 *   · este archivo no lo carga app/socio.html ni play/ (una prueba lo vigila);
 *   · no devuelve el NOMBRE de ningún invitado: solo cuentas. A Joan le basta
 *     con abrir la ficha; a cualquier otra pantalla que algún día lo cargue por
 *     error, no se le escapa a quién trajo cada uno.
 *
 * REGLA DE ORO, la misma de puente.js: acá no hay ni un setItem ni un fetch.
 * Recibe el db y devuelve objetos nuevos. No llama a P.normalizar() porque
 * normalizar RELLENA los objetos que recibe, y esto tiene que poder correr sobre
 * la cartera viva sin tocarla: espera el db como ya lo dejaron el espejo
 * (normalizarConservando) o el CRM (cargar).
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./motor.js'), require('./puente.js'));
  } else {
    raiz.GenteTuGarantia = fabrica(raiz.MotorReglas, raiz.PuenteTuGarantia);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, P) {
  'use strict';

  /* Los 2.000 de la v3. Escritos una sola vez, aquí; el día que Joan apruebe
     otra cifra se cambia en este renglón y en ningún otro. */
  var COMISION_SIMULADA = 2000;
  var ROTULO_SIMULACION = 'simulación, no se le debe nada';

  function lista(x) { return Array.isArray(x) ? x.filter(Boolean) : []; }
  function hoyLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function tieneReferente(s) {
    return !!s && s.referidoPor != null && s.referidoPor !== '';
  }

  /**
   * Los números de «Tu gente» para toda la cartera.
   *
   * @param db        la cartera como la deja el puente: {socios, prestamos, respaldados, config}
   * @param opciones  {hoy: 'AAAA-MM-DD'} para saber quién está en mora; por defecto hoy.
   * @returns {{padrinos: Array, totales: object, sin_motor: boolean}}
   *
   * Cada padrino: {id, nombre, codigo, invitados, pidieron, pagaron,
   *   creditos_pagados, invitados_en_mora, garantia_acreditada,
   *   garantia_sin_tope, tope_mordio, simulacion, se_refirio_a_si_mismo,
   *   cruzado, alertas:[texto]}
   */
  function tuGente(db, opciones) {
    var o = opciones || {};
    var hoy = o.hoy || hoyLocal();
    var socios = lista(db && db.socios);
    var prestamos = lista(db && db.prestamos);
    var respaldados = lista(db && db.respaldados);

    /* La pertenencia se compara con === y no con String(): es como compara
       referidosDe en el puente. Si acá se normalizara y allá no, un id guardado
       como número contaría como invitado en esta pantalla y no en la garantía,
       y las dos cifras de la misma tarjeta se contradirían. */
    function existe(id) {
      for (var i = 0; i < socios.length; i++) if (socios[i].id === id) return true;
      return false;
    }
    function creditosDe(id) { return prestamos.filter(function (p) { return p.socioId === id; }); }
    function respaldadosDe(id) { return respaldados.filter(function (r) { return r.socioId === id; }); }

    /* 1. Quién invitó a quién. Tres casos que NO son un invitado normal y que
       se cuentan aparte en vez de perderse:
         · el que figura como referido de sí mismo (un error de dedo o un
           intento de cobrarse a sí mismo): no es una invitación;
         · el que apunta a alguien que ya no está en la cartera (se borró la
           ficha del que invitó): sí llegó referido, pero no hay a quién
           sumárselo;
         · dos que se invitaron entre sí: se cuentan normal —puede ser real— y
           se avisa, porque es el patrón más barato de autorreferido. */
    var invitadosDe = {};
    var autorreferidos = [];
    var huerfanos = 0;
    var llegaron = 0;
    socios.forEach(function (x) {
      if (!tieneReferente(x)) return;
      if (x.referidoPor === x.id) { autorreferidos.push(x.id); return; }
      llegaron++;
      if (!existe(x.referidoPor)) { huerfanos++; return; }
      var k = String(x.referidoPor);
      (invitadosDe[k] = invitadosDe[k] || []).push(x);
    });

    var sinMotor = !(M && P && typeof M.desglosarGarantia === 'function' &&
                     typeof P.entradaGarantia === 'function');

    var padrinos = [];
    socios.forEach(function (s) {
      var inv = (invitadosDe[String(s.id)] || []).filter(function (x) { return x.referidoPor === s.id; });
      var aSiMismo = autorreferidos.indexOf(s.id) >= 0;
      if (!inv.length && !aSiMismo) return;

      var pidieron = 0, pagaron = 0, pagados = 0, enMora = 0, moraSinSaber = false;
      inv.forEach(function (x) {
        var cs = creditosDe(x.id);
        if (cs.length || respaldadosDe(x.id).length) pidieron++;
        var suyos = cs.filter(function (p) { return p.pagado; }).length;
        pagados += suyos;
        if (suyos) pagaron++;
        /* La mora la DECLARA el puente (estabaVencido), igual que en el resto
           del Panel. Si con un crédito sucio no puede contestar, no se cuenta
           como al día: se dice que no se supo. */
        try {
          if (cs.some(function (p) { return !p.pagado && P.estabaVencido(p, hoy); })) enMora++;
        } catch (e) { moraSinSaber = true; }
      });

      /* 2. La garantía que el motor YA le acredita por su gente, con el tope.
         Se pregunta al motor con la entrada que arma el puente; si el motor no
         puede (un dato sucio en la ficha), la cifra queda en null y la pantalla
         dice que no se pudo calcular — un cero sería afirmar algo falso. */
      var acreditada = null, sinTope = null;
      if (!sinMotor) {
        try {
          var d = M.desglosarGarantia(P.entradaGarantia(db, s));
          acreditada = d.referidos;
          sinTope = d.referidos_sin_tope;
        } catch (e) { acreditada = null; sinTope = null; }
      }

      var cruzado = tieneReferente(s) && inv.some(function (x) { return x.id === s.referidoPor; });
      var alertas = [];
      if (aSiMismo) {
        /* El motor NO sabe de autorreferidos: referidosDe le cuenta a él mismo
           como invitado, y en cuanto paga un crédito le suma los 5.000. Se dice
           con esas palabras porque la cifra de garantía de esta misma tarjeta
           ya lo trae adentro, y sin la frase no se entiende de dónde sale. */
        var yaPago = creditosDe(s.id).some(function (p) { return p.pagado; });
        alertas.push('Figura como referido de sí mismo. No cuenta como invitación ni entra en la ' +
          'simulación, ' + (yaPago
            ? 'pero el motor sí lo cuenta en su garantía por referidos porque ya pagó un crédito'
            : 'y hoy no le suma garantía porque no ha pagado ningún crédito; el día que pague, sí') +
          '. Corrígelo en su ficha, en «Referido por».');
      }
      if (cruzado) alertas.push('Se invitaron el uno al otro. Puede ser real; también es la forma más barata de autorreferirse.');
      if (moraSinSaber) alertas.push('No pude saber si alguno de su gente está en mora: un crédito tiene datos que no entiendo.');

      padrinos.push({
        id: s.id,
        nombre: s.nombre || '',
        codigo: (P && P.codCliente) ? P.codCliente(s) : '',
        invitados: inv.length,
        pidieron: pidieron,
        pagaron: pagaron,
        creditos_pagados: pagados,
        invitados_en_mora: enMora,
        garantia_acreditada: acreditada,
        garantia_sin_tope: sinTope,
        tope_mordio: acreditada != null && sinTope != null && acreditada < sinTope,
        simulacion: pagados * COMISION_SIMULADA,
        se_refirio_a_si_mismo: aSiMismo,
        cruzado: cruzado,
        alertas: alertas
      });
    });

    /* Primero quien más créditos le trajo pagados —eso es lo que le deja plata
       a Joan—, después quien más invitó, después por nombre. */
    padrinos.sort(function (a, b) {
      return (b.creditos_pagados - a.creditos_pagados) || (b.invitados - a.invitados) ||
        String(a.nombre).localeCompare(String(b.nombre), 'es');
    });

    var totales = {
      clientes: socios.length,
      llegaron_referidos: llegaron,
      pct_referidos: socios.length ? Math.round(llegaron * 100 / socios.length) : 0,
      padrinos: padrinos.filter(function (p) { return p.invitados > 0; }).length,
      pidieron: 0,
      creditos_pagados: 0,
      simulacion: 0,
      garantia_acreditada: 0,
      garantia_sin_calcular: 0,
      invitados_en_mora: 0,
      huerfanos: huerfanos,
      autorreferidos: autorreferidos.length,
      /* Cuántas FICHAS están en un cruce, no cuántos cruces: A↔B son dos. */
      en_cruce: padrinos.filter(function (p) { return p.cruzado; }).length
    };
    padrinos.forEach(function (p) {
      totales.pidieron += p.pidieron;
      totales.creditos_pagados += p.creditos_pagados;
      totales.simulacion += p.simulacion;
      totales.invitados_en_mora += p.invitados_en_mora;
      if (p.garantia_acreditada == null) totales.garantia_sin_calcular++;
      else totales.garantia_acreditada += p.garantia_acreditada;
    });

    return { padrinos: padrinos, totales: totales, sin_motor: sinMotor };
  }

  return {
    COMISION_SIMULADA: COMISION_SIMULADA,
    ROTULO_SIMULACION: ROTULO_SIMULACION,
    tuGente: tuGente
  };
});
