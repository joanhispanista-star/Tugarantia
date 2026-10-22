/* ===========================================================================
 * PUENTE — la única traducción entre el Panel de Joan y la app del socio.
 * 2 de agosto de 2026.
 *
 * El Panel (crm.html) y la app (socios/socio.html) se sirven del MISMO ORIGEN,
 * así que comparten localStorage. La app puede leer la cartera del Panel y
 * mostrarle al socio sus números de verdad, sin nube y sin enlaces.
 *
 * Este archivo existe por UNA razón: que la traducción sea una sola. Si la app
 * se hiciera su propia versión, el día que cambie el cálculo de la racha o del
 * cupón el enlace de WhatsApp y el modo panel mostrarían números distintos para
 * el mismo cliente. Acá hay una sola verdad, y de yapa se puede probar con node.
 *
 * REGLA DE ORO: acá NO hay ni puede haber un setItem ni un removeItem. Estas
 * funciones son puras: reciben el `db` y devuelven objetos nuevos. Los clientes
 * reales de Joan viven en ese localStorage y nada de acá los puede tocar.
 *
 * OJO CON LOS PORCENTAJES DE LOS BLOQUES FECHADOS: cada uno trae los factores
 * que regían el día en que se midió (90% en fecha y 45% tarde hasta el
 * 5-ago-2026; 75% y 37,5% desde entonces). Las reglas no cambiaron —factor completo contra la
 * mitad— y las cifras medidas se dejan como quedaron para no borrar la evidencia.
 *
 * Y lo que NO viaja al socio, por regla y no por olvido: fotos, ubicación,
 * teléfonos, la nota de riesgo, el motivo del ajuste, la papelera, las
 * gestiones, y todo el reparto 75/10/15 con el cupón amortizado y la ganancia
 * (contabilidad de Joan: contabilidadCupon y contabilidadCartera, que el
 * paquete del socio no toca ni de refilón).
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./motor.js'));
  else raiz.PuenteTuGarantia = fabrica(raiz.MotorReglas);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  var LLAVE_PANEL = 'joan_socios_v1';

  /* ------------------------------------------------------------ utilidades */
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function num(v) { return Number(v) || 0; }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }
  function diasEntre(a, b) {
    return Math.max(1, Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000));
  }

  /* ------------------------------------ ¿cuándo se pagó un crédito viejo? --
     3-ago-2026. Antes, a un crédito viejo ya pagado que no traía `fechaPagado`
     la migración le estampaba la fecha de HOY. Como esPuntual() compara
     fechaPagado <= cicloPago, ESO LEÍA COMO PAGADO TARDE todo crédito viejo
     pagado en fecha: garantía al 45% en vez del 90%, y el socio anclado en
     bronce. Un crédito de 200.000 pagado el 15-may daba 18.000 de garantía en
     vez de 36.000 — o sea, a los clientes más antiguos de Joan, los mejores,
     el historial les partía el cupo por la mitad.

     La fecha buena SÍ estaba en los datos y no se usaba. Se toma la mejor
     fuente disponible, en este orden:
       1. el último abono — es la plata que cerró el crédito, la fecha real;
       2. el corte al que se le cargó (cicloPago / cicloActual / fechaPago) —
          de un crédito viejo que quedó pagado y no dejó ninguna huella de
          atraso, lo honrado es leerlo como pagado en su fecha, no castigarlo;
       3. hoy, solo si de verdad no hay ninguna de las dos. Un crédito así no
          tiene ni abonos ni corte: no hay nada que deducir.
     Nunca inventa una fecha posterior a hoy. */
  function fechaFin(iso) {
    if (!iso) return '';
    var s = String(iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  function ultimoAbonoDe(p) {
    return lista(p && p.abonos).map(function (a) {
      return fechaFin(a && (a.fecha || a.fechaPago));
    }).filter(Boolean).sort().pop() || '';
  }
  /* 3-ago-2026, tercera pasada: el último abono solo sirve de fecha si de
     verdad CERRÓ el crédito (ver abonosCierranElCredito más abajo). Uno
     parcial no dice cuándo se pagó: dice cuándo se abonó. */
  function fechaPagadoDeducida(p, corte) {
    return (abonosCierranElCredito(p) ? ultimoAbonoDe(p) : '') || fechaFin(corte) || hoyISO();
  }

  /* ------------------- la fechaPagado FALSA que dejó el Panel viejo --------
     3-ago-2026, segunda pasada. Lo de arriba llega tarde justo para la
     población que venía a rescatar. El Panel VIEJO (el archivado del 17-jul)
     hacía `p.fechaPagado = isoLocal(new Date())` dentro de su propio cargar(),
     y el primer guardar() que vino después lo dejó grabado. O sea que esos
     créditos HOY traen `pagado:true` y una `fechaPagado` que NO es el día en
     que el cliente pagó: es el día en que Joan abrió el Panel. El arreglo de
     arriba no los toca, porque vive dentro de `if (p.pagado === undefined)` y
     además pregunta `if (!p.fechaPagado)`: las dos puertas están cerradas
     exactamente para ellos. Medido, seguían acreditando 18.000 en vez de
     36.000.

     EL CRITERIO — y vive acá, no en crm.html, para que haya uno solo:

         un crédito no se pudo pagar DESPUÉS del abono que LO CERRÓ.

     El abono que lo cerró es la plata que dejó el crédito en cero. Una
     `fechaPagado` posterior a esa fecha no es "sospechosa": es imposible. La
     única forma de que exista es que se la haya estampado algo que no era el
     pago. Entonces se descarta y se vuelve a deducir con fechaPagadoDeducida().

     ------------------------------------------------------------------------
     3-ago-2026, TERCERA pasada. La segunda dejó esto corriendo como REGLA
     PERMANENTE —en cada carga del Panel y sobre cada crédito pagado— y con eso
     el remedio salió peor que la enfermedad. Se arreglan dos cosas:

     (a) "el abono que lo cerró" no es cualquier abono. En el esquema viejo
         `abonos` guarda TAMBIÉN abonos parciales: por eso normalizar() deduce
         `pagado` sumándolos y comparando la SUMA contra `p.total`. Puede haber
         varios y ninguno cerrar nada.
         Medido: crédito de 200.000 al 20%, corte 15-may, UN abono parcial de
         100.000 el 15-may. Joan lo cobra hoy 3-ago (80 días de mora): 40.000
         de costo + 160.000 de recargo, 90.000 de garantía. Correcto. Cierra el
         Panel, lo vuelve a abrir, y la fecha se reescribía al 15-may: el
         crédito pasaba a PUNTUAL y la garantía saltaba a 180.000 — el doble,
         por un historial que no existe. Y estable: en la tercera carga ya no
         se movía, así que ni Joan ni el socio tenían cómo notarlo, y el cupo,
         el nivel y el máximo respaldado le subían contra plata inventada.
         Ahora el criterio solo se aplica si los abonos SUMAN el total, que es
         la única forma de saber que el último de verdad cerró el crédito.

     (b) esto es una MIGRACIÓN, no una regla. Corre UNA sola vez por crédito y
         deja constancia en `fechaPagadoMigrada` (el día en que corrió). Con la
         marca puesta no se vuelve a mirar nunca más.

     Las tres poblaciones, distinguidas por marcas explícitas y no por
     adivinanza:

       1. COBRADO POR ESTE SISTEMA — pagarTotal() estampa `cobroRegistrado:true`
          desde el 3-ago-2026. Esa fechaPagado la escribió un pago real, con la
          fecha que tecleó Joan. NO SE TOCA, tenga los abonos que tenga: el
          crédito viejo cobrado hoy es justamente el que se corrompía.
       2. YA MIGRADO — trae `fechaPagadoMigrada`. Ya se revisó; no se vuelve.
       3. LEGADO SIN MARCAR — todo lo demás, que es la población del 17-jul. Se
          le aplica el criterio UNA vez y se estampa la marca.

     Dentro del legado siguen saliendo bien las cuatro poblaciones de siempre:
       · viejo pagado EN FECHA, con abonos que suman el total → 17-jul > 15-may
         ⇒ falsa. Se corrige al 15-may y vuelve a ser puntual: 90%, que es lo
         que el socio se ganó.
       · viejo pagado TARDE de verdad → 17-jul > 20-may ⇒ falsa también, pero
         al corregirla queda el 20-may, que SIGUE siendo posterior al corte del
         15-may. Sigue leyéndose tarde y sigue dando 45%. El arreglo no regala
         puntualidad: devuelve la fecha real y deja que esPuntual() decida.
       · nuevo, en fecha o tarde → ni se lo mira. `abonos` es el esquema VIEJO;
         los créditos que abre el Panel de hoy traen `abonosCapital` y nunca
         `abonos`, así que no hay abono con qué comparar y la fecha que traen
         —que es la buena— queda intacta.
       · pagado sin ningún abono, o con abonos que NO cierran → no hay
         evidencia de nada y la fecha se respeta. Deducirla sería inventar
         garantía en vez de rescatarla.

     Lo único que este arreglo no puede rescatar es un crédito viejo que Joan
     ya cobró con el Panel de ayer, antes de que pagarTotal() estampara
     `cobroRegistrado`: no dejó marca y no hay cómo distinguirlo. Para esos
     manda (a): si los abonos no cierran el crédito, la fecha no se toca. */
  function totalAbonos(p) {
    return lista(p && p.abonos).reduce(function (s, a) { return s + num(a && a.monto); }, 0);
  }
  /* La MISMA pregunta con la que normalizar() deduce `pagado` más abajo, y a
     propósito: si un día cambia una, tiene que cambiar la otra. */
  function abonosCierranElCredito(p) {
    return !!(p && p.total && totalAbonos(p) >= num(p.total) - 0.5);
  }
  /* Pura: dice qué fechaPagado le corresponde, sin tocar nada. */
  function fechaPagadoCorregida(p) {
    if (!p || !p.pagado) return p ? p.fechaPagado : null;
    if (p.cobroRegistrado) return p.fechaPagado;      // 1. lo cobró este sistema
    if (p.fechaPagadoMigrada) return p.fechaPagado;   // 2. ya se migró una vez
    var corte = p.cicloPago || p.cicloActual;
    var actual = fechaFin(p.fechaPagado);
    if (!actual) return fechaPagadoDeducida(p, corte);
    if (!abonosCierranElCredito(p)) return p.fechaPagado;
    var ultimo = ultimoAbonoDe(p);
    return (ultimo && actual > ultimo) ? fechaPagadoDeducida(p, corte) : p.fechaPagado;
  }
  /* La migración: aplica el criterio y deja la constancia, para que la próxima
     carga ni se asome. Devuelve true si pasó por este crédito. Es lo único que
     tienen que llamar cargar() del Panel y normalizar() de la app. */
  function migrarFechaPagado(p) {
    if (!p || !p.pagado) return false;
    if (p.cobroRegistrado || p.fechaPagadoMigrada) return false;
    p.fechaPagado = fechaPagadoCorregida(p);
    p.fechaPagadoMigrada = hoyISO();
    return true;
  }

  /* --------------------------------------------------- lectura defensiva --
     La misma migración de cargar() del Panel, pero SIN escribir. Un respaldo
     viejo, un socio en null o un préstamo sin capital no pueden dejar al
     cliente sin ver su cuenta: se saltean y se sigue. */
  function normalizar(crudo) {
    var d = (crudo && typeof crudo === 'object') ? crudo : {};
    var db = {
      socios: lista(d.socios).length ? lista(d.socios) : lista(d.clientes),
      prestamos: lista(d.prestamos),
      respaldados: lista(d.respaldados),
      invitaciones: lista(d.invitaciones),
      /* `freno` es la casilla donde Ajustes del Panel enciende el tope por
         ingreso (5-ago-2026). Viene APAGADA y con la fracción de arranque del
         motor; si Joan no la toca, nada cambia. Los defaults viven en el motor,
         no escritos a mano acá. */
      config: Object.assign({
        negocio: 'Tu Garantía', whatsapp: '',
        freno: { activo: M.FRENO_INGRESO.activo,
                 fraccion_quincena: M.FRENO_INGRESO.fraccion_quincena }
      }, d.config || {}),
      contadores: Object.assign({ cliente: 0, credito: 0, respaldado: 0 }, d.contadores || {})
    };

    db.socios = db.socios.filter(Boolean).map(function (s) {
      if (s.gestiones === undefined) s.gestiones = [];
      if (!s.referencia) s.referencia = { nombre: '', telefono: '' };
      if (s.whatsappIgual === undefined) s.whatsappIgual = true;
      if (s.cedulaFrenteFoto === undefined) s.cedulaFrenteFoto = s.cedulaFoto || null;
      if (s.cedulaReversoFoto === undefined) s.cedulaReversoFoto = null;
      if (s.selfieFoto === undefined) s.selfieFoto = null;
      if (s.telefono2 === undefined) s.telefono2 = '';
      if (s.notaRiesgo === undefined) s.notaRiesgo = '';
      if (s.ubicacion === undefined) s.ubicacion = null;
      if (s.ajusteGarantia === undefined) s.ajusteGarantia = 0;
      if (s.ajusteMotivo === undefined) s.ajusteMotivo = '';
      if (s.migracionRevisada === undefined) s.migracionRevisada = null;
      if (s.codigoInvitacion === undefined) s.codigoInvitacion = null;
      /* El código con el que entra a la app, y cuándo se lo mandaron
         (10-ago-2026). Nacen VACÍOS a propósito y no se generan acá: un cliente
         sin código no entra, y eso es correcto —lo contrario sería que "sin
         código" fuera la contraseña de todos los que aún no lo tienen—. Los
         crea el Panel a pedido de Joan, que es quien después se los manda. */
      if (s.codigoAcceso === undefined) s.codigoAcceso = '';
      if (s.codigoEnviadoEn === undefined) s.codigoEnviadoEn = null;
      // Lo que el socio gana por quincena. Solo lo usa el freno por ingreso, que
      // está apagado: en cero el freno no puede topar nada (ver frenoDe).
      if (s.ingresoQuincenal === undefined) s.ingresoQuincenal = 0;
      return s;
    });

    db.prestamos = db.prestamos.filter(Boolean).map(function (p) {
      if (p.cicloActual === undefined) p.cicloActual = p.fechaPago;
      if (!Array.isArray(p.prorrogas)) p.prorrogas = [];
      if (!Array.isArray(p.abonosCapital)) p.abonosCapital = [];
      if (!Array.isArray(p.comprobantes)) p.comprobantes = [];
      if (p.costoPct === undefined || p.costoPct === null) p.costoPct = 20;
      if (p.pagado === undefined) {
        var ab = lista(p.abonos).reduce(function (s, a) { return s + num(a.monto); }, 0);
        p.pagado = !!(p.total && ab >= p.total - 0.5);
        if (p.pagado) {
          if (!p.cicloPago) p.cicloPago = p.cicloActual;
          if (!p.gananciaPago) p.gananciaPago = num(p.capital) * num(p.costoPct) / 100;
        }
      }
      /* Esta línea va FUERA del `if` de arriba a propósito: los créditos que el
         Panel viejo ya dejó con pagado:true son justamente los que traen la
         fechaPagado falsa, y adentro no se los alcanza nunca. Es la MISMA
         migración que corre el Panel —una sola vez por crédito y con
         constancia—, salvo que acá la marca se queda en memoria: este archivo
         no escribe en el localStorage de Joan ni puede. */
      if (p.pagado) migrarFechaPagado(p);
      return p;
    }).filter(function (p) { return p && p.capital != null; });

    db.respaldados = db.respaldados.filter(Boolean).map(function (r) {
      if (!Array.isArray(r.cuotas)) r.cuotas = [];
      if (r.pagado === undefined) {
        r.pagado = r.cuotas.length > 0 && r.cuotas.every(function (c) { return !!c.pagado; });
      }
      return r;
    });

    return db;
  }

  /* ------------------------------------------------ cuentas de un crédito */
  /* `capitalActual` y `cicloActual` son EL RESUMEN DE HOY, y nada más que eso.
     Sirven para pintar la pantalla del ciclo abierto. NINGUNA pregunta sobre el
     pasado se contesta con ellos: para eso están las funciones de la sección
     "LA LÍNEA DE TIEMPO", más abajo. Ver el comentario grande del 5-ago-2026. */
  function capitalActual(p) {
    return Math.max(0, num(p.capital) - lista(p.abonosCapital).reduce(function (s, a) { return s + num(a.monto); }, 0) -
                       capitalPerdonadoDe(p));
  }
  /* 22-oct-2026 — EL CAPITAL QUE JOAN PERDONÓ. Hasta hoy solo se perdonaban
     mora y costo; desde que Joan pacta el próximo pago (pactarProximoPago,
     más abajo) puede cobrar MENOS que el capital que queda, y esa diferencia
     es capital perdonado. Vive en `p.condonaciones` con `capital` —la lista
     que solo suma, como cualquier descuento— y desde ese día ya no se debe:
     si siguiera contando en capitalActual, el cliente debería 250.000 y su
     próximo pago diría 240.000, y la mora, la «capital en la calle» y el
     recibo dirían cada uno una cosa. Con `hasta`, solo lo perdonado hasta ese
     día (la línea de tiempo no le borra capital a un día que ya pasó). */
  function capitalPerdonadoDe(p, hasta) {
    var h = fechaFin(hasta);
    return lista(p && p.condonaciones).reduce(function (t, c) {
      var v = Math.max(0, Math.round(num(c && c.capital)));
      if (!v) return t;
      var f = fechaFin(c.fecha);
      return (!h || !f || f <= h) ? t + v : t;
    }, 0);
  }

  /* Los días calendario del MOTOR, no los de acá arriba: `diasEntre` de este
     archivo hace Math.max(1,…) para que la E.A. no divida por cero, y una
     cuenta de plata que use eso cobra un día que no existió. */
  function diasCal(desde, hasta) {
    try { return M.diasEntre(M.aFechaLocal(desde), M.aFechaLocal(hasta)); }
    catch (e) { return 0; }
  }
  function diaAntes(f) {
    try { return M.iso(M.sumarDias(M.aFechaLocal(f), -1)); } catch (e) { return ''; }
  }
  function diaDespues(f) {
    try { return M.iso(M.sumarDias(M.aFechaLocal(f), 1)); } catch (e) { return ''; }
  }

  /* ------------------------------------------------------ plan de pagos --
     4-ago-2026. Cuando al socio se le acaban las prórrogas, el §8 manda pasarlo
     a un plan de pagos: el capital repartido en 3 cortes al 5% sobre el saldo
     insoluto. El motor lo arma (construirPlanDePagos) y hasta hoy nadie lo
     registraba: la app del socio le prometía al cliente una salida que el Panel
     no tenía dónde anotar.

     El plan queda MATERIALIZADO en `p.planPagos.cuotas`, igual que las cuotas
     del préstamo con garantía: las fechas y los montos no se recalculan nunca
     después, así el calendario no se mueve solo. Mientras hay plan, el "ciclo"
     del crédito es la cuota que sigue: su capital, su costo y su fecha. Por eso
     el Panel no necesita una segunda pantalla de cobro. */
  function cuotasPlan(p) { return lista(p && p.planPagos && p.planPagos.cuotas); }
  function tienePlan(p) { return cuotasPlan(p).length > 0; }
  function cuotaPlanActual(p) {
    var pend = cuotasPlan(p).filter(function (c) { return !c.pagado; });
    return pend.length ? pend[0] : null;
  }
  /* El capital que TODAVÍA SE DEBE en este ciclo. Sin plan es el capital
     vigente; con plan es el de la cuota. Es lo que falta por entregar, así que
     acá sí manda el presente: al socio no se le cobra capital que ya devolvió.
     Lo que NO sale de acá es cuánto se CAUSÓ (ver K y moraDelCiclo). */
  function capitalDelCiclo(p) {
    var c = cuotaPlanActual(p);
    /* 16-oct-2026: menos lo que ya entró a capital en abonos a ESTA cuota. Sin
       abonos es el capital de la cuota, como siempre. */
    return c ? Math.max(0, num(c.capital) - pagadoDeCuota(p, c).capital) : capitalActual(p);
  }
  /* El costo del ciclo. Se CAUSÓ el día que el ciclo empezó, sobre el capital
     que se debía ESE día, y por eso no puede salir de `capitalActual`: un abono
     posterior lo borraba hacia atrás (200.000 a 20 días, abono de 199.999 → el
     costo de 40.000 quedaba en 0,2). Se reconstruye del historial; lo que el
     Panel haya congelado en el abono sirve de piso y nunca de techo. */
  function K(p, fecha) {
    var c = cuotaPlanActual(p);
    /* 16-oct-2026: con cuotas, el costo que FALTA de la que sigue, con sus
       abonos y —en el crédito a cuotas— la regla de la quincena que no ha
       empezado (costoAdeudadoDeCuota). Sin fecha, el de su quincena completa;
       con fecha, lo que cuesta cerrarla ese día. La fecha viene de quien
       pregunta: el reloj de este archivo no es el de la página que cobra. */
    if (c) return costoAdeudadoDeCuota(p, c, fecha);
    return Math.max(capitalBaseDelCiclo(p) * num(p && p.costoPct) / 100,
                    causadoDelCiclo(p).costo);
  }
  /* El porcentaje que rige ESTE ciclo, decimal, para que la etiqueta que ve el
     socio ("Costo (5%)") salga del mismo lado que el número y no de una
     suposición de la pantalla. Sigue exactamente la misma bifurcación que K. */
  function tasaDelCiclo(p) {
    var c = cuotaPlanActual(p);
    if (c) {
      /* 22-oct-2026 — el pago que pactó Joan lleva el % que de verdad sale de
         sus pesos, aunque sea cero (cobrar solo el capital, o perdonar parte):
         sin esto la etiqueta caía al 5% del plan del §8 al lado de un costo $0. */
      if (esPacto(p)) return Math.max(0, num(c.pct)) / 100;
      /* 16-oct-2026 — en el crédito a cuotas cada cuota trae su propio %: si la
         segunda va al 10%, la etiqueta no puede seguir diciendo el 20% de la
         primera al lado de un costo del 10%. */
      var t = num(c.pct) > 0 ? num(c.pct) / 100 : num(p.planPagos && p.planPagos.tasa_por_corte);
      return t > 0 ? t : M.TASA_PLAN_DE_PAGOS;
    }
    var pct = num(p && p.costoPct);
    return pct > 0 ? pct / 100 : M.TASA_CREDITO;
  }

  /* ==========================================================================
   * EL CRÉDITO QUE NACE A CUOTAS — 16-oct-2026.
   *
   * Joan pidió poder registrar un crédito ya partido en cuotas, con el % y la
   * fecha de cada una a su gusto (el caso: 650.000, cuota 1 de 455.000 el
   * 30-oct y cuota 2 de 390.000 el 15-nov). La forma ya existía: es el plan de
   * pagos materializado de arriba, que el Panel sabe cobrar cuota por cuota.
   * Lo que cambia es de dónde viene. El plan del §8 es un RESCATE —se le
   * acabaron las prórrogas, pagó una entrada—; este lo pacta Joan el día del
   * desembolso, y por eso lleva `planPagos.origen === 'alta'` y `entrada:null`.
   * Esa marca decide tres cosas que no pueden ser iguales en los dos:
   *
   *   · el NIVEL no lo trata como «necesitó plan» (tienePlanHasta): pagarlo en
   *     fecha cuenta como pagar en fecha. Sin eso, la racha del socio se rompía
   *     el mismo día del desembolso por una forma de pago que eligió Joan;
   *   · se puede SALDAR antes (liquidarSaldoPlan) y REPROGRAMAR las cuotas que
   *     no han vencido (reprogramarPlan): las dos son decisiones de Joan del
   *     16-oct, para este crédito y no para el rescate;
   *   · la app del cliente lo llama «crédito a cuotas» y no «plan de pagos».
   *
   * Y una que sí comparten: el ABONO A UNA CUOTA (abonoACuota). Joan decidió
   * que si trae una parte, la plata va primero a la mora, después al costo y
   * después al capital, y lo que falta sigue en ESA cuota y en su fecha, con
   * la mora corriendo solo sobre el capital que falta.
   *
   * DÓNDE VIVE EL ABONO, y por qué ahí. En `p.abonosCapital`, con `cuotaPlan`
   * (qué cuota) y `parcial:true`; `monto` es lo que fue a capital (puede ser
   * cero) y `moraPagada`/`costoPagado` el resto. Así capitalActual, la línea de
   * tiempo y la nube lo ven sin aprender nada nuevo: es una lista que solo suma
   * y que el computador y el celular juntan sin pisarse. Meterlo dentro de
   * `planPagos` lo habría vuelto un campo en discusión cada vez que los dos
   * aparatos difieren.
   * ========================================================================*/
  function esPlanDeAlta(p) { return tienePlan(p) && p.planPagos.origen === 'alta'; }

  /* Los abonos parciales de UNA cuota, en orden. */
  function abonosDeCuota(p, n) {
    return lista(p && p.abonosCapital).filter(function (a) {
      return !!a && a.parcial === true && num(a.cuotaPlan) === num(n);
    }).sort(function (x, y) {
      return String(fechaFin(x.fecha)).localeCompare(String(fechaFin(y.fecha)));
    });
  }
  /* El día del último abono a una cuota ('' si no tiene). Un cobro o un abono
     con fecha ANTERIOR no se acepta: la mora pendiente de una fecha descuenta
     solo lo abonado hasta esa fecha, así que anotar fuera de orden cobraba dos
     veces la mora de días que ya se habían pagado (revisión del 16-oct). */
  function ultimoAbonoDeCuota(p, c) {
    var abs = abonosDeCuota(p, c && c.n);
    return abs.length ? (fechaFin(abs[abs.length - 1].fecha) || '') : '';
  }
  /* El último HECHO del plan: el día del último abono a cualquier cuota o del
     último cierre. Ningún cobro, abono o «pagar todo» puede ir con una fecha
     anterior. La primera reja miraba solo los abonos de la misma cuota, y la
     segunda revisión (17-oct) lo encontró: con la cuota 1 cobrada el 2-nov, la
     cuota 2 anotada con fecha 29-oct pasaba por «quincena no empezada» y salía
     65.000 más barata, con una historia imposible (la 1 pagando mora hasta el
     2-nov y la 2 saldada antes del 31-oct). */
  function ultimoHechoDelPlan(p) {
    var u = '';
    lista(p && p.abonosCapital).forEach(function (a) {
      if (!a || a.cuotaPlan == null || a.cuotaPlan === '') return;
      var f = fechaFin(a.fecha);
      if (f && f > u) u = f;
    });
    cuotasPlan(p).forEach(function (c) {
      var f = (c && c.pagado) ? fechaFin(c.fechaPagado) : '';
      if (f && f > u) u = f;
    });
    return u;
  }
  function textoFueraDeOrden(ult, que) {
    return 'Este crédito ya tiene un pago anotado el ' + fechaTexto(ult) + ': ' + que + ' no puede ir con una ' +
      'fecha anterior. Anota los pagos en el orden en que llegaron.';
  }
  /* Lo que ya entró a una cuota en abonos parciales, partido en lo que fue a
     capital, a costo y a mora. Con `hasta`, solo lo que había entrado ese día:
     la mora pendiente de una fecha no puede descontar un abono posterior. */
  function pagadoDeCuota(p, c, hasta) {
    var h = fechaFin(hasta);
    var t = { capital: 0, costo: 0, mora: 0, recibido: 0, abonos: 0 };
    if (!c) return t;
    abonosDeCuota(p, c.n).forEach(function (a) {
      var f = fechaFin(a.fecha);
      if (h && f && f > h) return;
      t.capital += num(a.monto);
      t.costo += num(a.costoPagado);
      t.mora += num(a.moraPagada);
      t.recibido += num(a.recibido);
      t.abonos++;
    });
    return t;
  }

  /* --------------------------------------------- EL COSTO DE UNA CUOTA ----
     16-oct-2026, segunda vuelta (lo encontró la revisión adversaria). Joan
     decidió que al pagar todo antes «el interés de la siguiente quincena no se
     cobra porque no completó el tiempo». La primera versión cumplía eso SOLO
     en «pagar todo»: cobrar la última cuota el mismo día costaba 390.000 y
     pagar todo 325.000 por el MISMO cierre, y si el cliente traía los 325.000
     y Joan los anotaba, quedaban como abono y el crédito seguía abierto con
     mora. Dos caminos, dos precios: la forma exacta de los defectos que este
     repo ya pagó.

     LA REGLA ÚNICA, que es la de Joan dicha en general: el costo de cada
     cuota es su % sobre lo que de verdad se debe CUANDO EMPIEZA SU QUINCENA.
     El período de la cuota 1 empieza con el desembolso; el de cada siguiente,
     el día después de la fecha de la anterior. Por defecto eso es lo pactado
     (el saldo insoluto del calendario). Lo cambian solo dos cosas:
       · capital devuelto ANTES de que empiece (un abono adelantado, o una
         cuota cerrada antes): el % corre sobre lo que queda;
       · cerrar la cuota antes de que empiece: su quincena corre solo sobre
         el capital de las cuotas siguientes — cero si es la última, que es
         justo lo de Joan: pagar la última antes es pagar todo antes.
     Antes de que empiece, su costo todavía no se debe: un abono a esa cuota
     va entero a capital. Y una cuota del MEDIO que todavía no empieza no se
     cierra sola (cierreDeCuota lo niega): su quincena correría sobre el capital
     de las siguientes, y si esas también se adelantaban el mismo día, se
     cobraba por una plata que ya no se debía — el barrido lo encontró con tres
     cuotas: cerrar una por una salía 74.250 más caro que pagar todo. Para
     adelantar están el abono (a capital) y «pagar todo».
     Todo esto es SOLO para el crédito a cuotas. El plan del §8 conserva su
     cuenta de siempre (el costo materializado), porque su regla de pago
     anticipado no se decidió y no se inventa acá. */
  function indiceDeCuota(p, c) {
    var cs = cuotasPlan(p);
    for (var i = 0; i < cs.length; i++) if (cs[i] === c || (c && num(cs[i].n) === num(c.n))) return i;
    return -1;
  }
  /* El día DESPUÉS del cual corre la quincena de una cuota. */
  function inicioDeCuota(p, c) {
    var cs = cuotasPlan(p), i = indiceDeCuota(p, c);
    return i <= 0 ? (fechaFin(p && p.fechaDesembolso) || '') : (fechaFin(cs[i - 1] && cs[i - 1].fecha) || '');
  }
  function cuotaEmpezo(p, c, fecha) {
    if (!esPlanDeAlta(p)) return true;
    var i = indiceDeCuota(p, c), f = fechaFin(fecha);
    if (i <= 0 || !f) return true;
    var ini = inicioDeCuota(p, c);
    return !ini || f > ini;
  }
  function costoPactadoDeCuota(c) {
    return (c && c.costoPactado != null) ? num(c.costoPactado) : num(c && c.costo);
  }
  /* El costo de la quincena de una cuota con lo que se sabe hoy. `extra` es
     capital que se devolvería además, el mismo día (cerrarla antes). */
  function costoEfectivoDeCuota(p, c, extra) {
    var pactado = costoPactadoDeCuota(c);
    if (!esPlanDeAlta(p)) return num(c && c.costo);
    var cs = cuotasPlan(p), i = indiceDeCuota(p, c);
    /* La cuota 1 empieza con el desembolso: no hay «antes» que devolver. */
    if (i <= 0) return pactado;
    var ini = inicioDeCuota(p, c);
    var saldo = 0;
    for (var j = i; j < cs.length; j++) saldo += num(cs[j] && cs[j].capital);
    var devuelto = num(extra);
    lista(p.abonosCapital).forEach(function (a) {
      if (!a || a.cuotaPlan == null || a.cuotaPlan === '' || num(a.cuotaPlan) < num(c.n)) return;
      var f = fechaFin(a.fecha);
      if (f && ini && f <= ini) devuelto += num(a.monto);
    });
    if (devuelto <= 0) return pactado;
    var queda = saldo - devuelto;
    if (queda <= 0) return 0;
    var pct = num(c.pct) || Math.round(num(p.planPagos.tasa_por_corte) * 100);
    return M.calcularCosto(queda, pct / 100);
  }
  /* El costo que FALTA de la cuota en curso a una fecha.
       · sin fecha: el de su quincena completa (lo que la cuota cuesta);
       · `paraAbono`: lo que un abono tiene que cubrir antes de ir a capital —
         cero si la quincena todavía no empieza;
       · si no: lo que cuesta CERRARLA ese día. */
  function costoAdeudadoDeCuota(p, c, fecha, paraAbono) {
    var pag = pagadoDeCuota(p, c);
    if (!esPlanDeAlta(p)) return Math.max(0, num(c.costo) - pag.costo);
    var f = fechaFin(fecha);
    if (!f || cuotaEmpezo(p, c, f)) return Math.max(0, costoEfectivoDeCuota(p, c) - pag.costo);
    if (paraAbono) return 0;
    /* La última, cerrada antes de que empiece, es pagar todo antes: después
       de ella no se debe nada, así que su quincena no cuesta. Una del medio no
       se cierra antes (ver arriba): vale lo que valdrá en su fecha. */
    if (esUltimaPendiente(p, c)) return 0;
    return Math.max(0, costoEfectivoDeCuota(p, c) - pag.costo);
  }
  function esUltimaPendiente(p, c) {
    var cs = cuotasPlan(p), i = indiceDeCuota(p, c);
    for (var k = i + 1; k < cs.length; k++) if (cs[k] && !cs[k].pagado) return false;
    return true;
  }

  /* El recargo que CAUSÓ una cuota hasta una fecha: desde el día siguiente a su
     fecha, sobre el capital de la cuota que todavía se debía cada día —cada
     abono baja la base desde su día, igual que los abonos del quincenal—. */
  function moraCausadaDeCuota(p, c, hasta) {
    var corte = fechaFin(c && c.fecha), fin = fechaFin(hasta) || hoyISO();
    if (!c || c.pagado || !corte || fin <= corte) return 0;
    var om = opcionesDeMora(p, fin);
    var abs = abonosDeCuota(p, c.n);
    var base = num(c.capital) - abs.reduce(function (t, a) {
      var f = fechaFin(a.fecha);
      return (!f || f <= corte) ? t + num(a.monto) : t;
    }, 0);
    var cursor = corte, total = 0;
    abs.forEach(function (a) {
      var f = fechaFin(a.fecha);
      if (!f || f <= corte || f > fin) return;
      total += M.recargoPorMora(Math.max(0, base), diasCal(cursor, f), om);
      base -= num(a.monto);
      cursor = f;
    });
    return total + M.recargoPorMora(Math.max(0, base), diasCal(cursor, fin), om);
  }
  /* Y la que todavía FALTA: la causada menos la que ya entró en abonos. */
  function moraPendienteDeCuota(p, c, hasta) {
    var fin = fechaFin(hasta) || hoyISO();
    return Math.max(0, Math.round(moraCausadaDeCuota(p, c, fin)) - pagadoDeCuota(p, c, fin).mora);
  }

  /* Lo cobrado de UNA cuota, en pedazos con su fecha: cada abono parcial y, si
     ya se pagó, el resto que entró al cerrarla. Es LA partición: la usan la
     ganancia (costoCobradoPlan), la garantía (garantiaGanadaCuotaPlan), el
     reparto 80/20 (movimientosCobradosCredito) y la mora (movimientosConMora).
     Si una de ellas partiera distinto, la suma de las garantías del reparto
     dejaría de dar la garantía del socio por un peso de redondeo, y ese es el
     tipo de diferencia que nadie mira hasta que alguien la reclama.
     Una cuota sin abonos da un solo pedazo —su costo y su recargo, el día que
     se pagó—: exactamente lo que estas cuentas hacían antes. Una cuota pagada
     guarda en `costo` lo que de verdad costó (y lo pactado en `costoPactado`
     cuando difieren): ver cierreDeCuota. */
  function piezasDeCuota(p, c) {
    if (!c) return [];
    var piezas = abonosDeCuota(p, c.n).map(function (a) {
      return { fecha: fechaFin(a.fecha) || null, costo: num(a.costoPagado), mora: num(a.moraPagada), final: false };
    });
    if (c.pagado) {
      var cos = 0, mor = 0;
      piezas.forEach(function (x) { cos += x.costo; mor += x.mora; });
      piezas.push({ fecha: fechaFin(c.fechaPagado) || fechaFin(c.fecha) || null,
                    costo: Math.max(0, num(c.costo) - cos), mora: Math.max(0, num(c.recargo) - mor),
                    final: true });
    }
    return piezas;
  }
  /* ¿Ese pedazo entró en fecha? El que cierra la cuota mira el recargo de TODA
     la cuota (como siempre); un abono, el suyo. */
  function piezaEnFecha(c, x) {
    var corte = fechaFin(c && c.fecha);
    var sinMora = x.final ? num(c.recargo) === 0 : x.mora === 0;
    return sinMora && (!x.fecha || !corte || x.fecha <= corte);
  }

  /* Lo que falta de todas las cuotas sin pagar, sin mora, si sigue el
     calendario: lo que la app le muestra al cliente como «te queda por pagar». */
  function saldoDelPlan(p) {
    if (!p || p.pagado) return 0;
    return cuotasPlan(p).reduce(function (t, c) {
      if (!c || c.pagado) return t;
      var pag = pagadoDeCuota(p, c);
      return t + Math.max(0, num(c.capital) - pag.capital) + Math.max(0, costoEfectivoDeCuota(p, c) - pag.costo);
    }, 0);
  }
  /* El costo que todavía falta cobrar de las cuotas sin pagar. La «ganancia
     proyectada» del Panel sumaba el pactado entero, y después de un abono
     contaba dos veces el costo que ya había entrado (revisión del 16-oct). */
  function costoPendienteDelPlan(p) {
    if (!p || p.pagado) return 0;
    return cuotasPlan(p).reduce(function (t, c) {
      return (!c || c.pagado) ? t : t + Math.max(0, costoEfectivoDeCuota(p, c) - pagadoDeCuota(p, c).costo);
    }, 0);
  }

  /* La quincena del tablero a la que pertenece una fecha: el corte que la
     contiene, con la misma cuenta del ciclo actual del Panel
     (cicloActualGlobal). Una cuota del 30-oct es de la quincena del 31-oct, y
     la del 15-nov —domingo, con el 16 festivo— de la del 17-nov. */
  function quincenaDe(fecha) {
    try {
      return M.calcularFechaCorte(M.sumarDias(M.aFechaLocal(fechaFin(fecha)), -M.DIAS_VENTANA_MINIMA));
    } catch (e) { return ''; }
  }
  /* La ganancia del plan que se le cuenta a una quincena del tablero: cada
     cuota en la quincena que contiene SU fecha —igual que una prórroga va en la
     del corte que pagó (`pr.ciclo`)—, por pedazos, y la entrada del §8 en la de
     su ciclo. Hasta el 16-oct ninguna de las dos entraba: `gananciaDeQuincena`
     solo sumaba prórrogas y `gananciaPago`, y cobrarCuotaDelPlan deja ese
     campo en cero a propósito, así que un plan entero cobrado no aparecía en
     ninguna quincena. Vive acá porque el computador y el celular tienen cada
     uno su tablero, y en la primera versión ya contestaban distinto (el
     computador ponía la cuota en una fila propia «30 de oct» y el celular en
     la quincena del 31). */
  function cobradoDelPlanEnQuincena(p, q) {
    var h = fechaFin(q);
    if (!h) return 0;
    var t = cuotasPlan(p).reduce(function (s, c) {
      if (!c || quincenaDe(c.fecha) !== h) return s;
      return s + piezasDeCuota(p, c).reduce(function (u, x) { return u + x.costo + x.mora; }, 0);
    }, 0);
    var e = entradaPlan(p);
    if (e && quincenaDe(e.ciclo) === h) t += num(e.monto);
    return t;
  }

  /* Las cuotas que a esa fecha ya vencieron sin pagarse, cada una con lo que
     falta y su mora. La pantalla de cobro muestra la que sigue; esto es para
     que no se quede callada la de atrás (el 20-nov, sin haber pagado nada, la
     cuota 1 son 523.250 pero debe también la 2, vencida desde el 15). */
  function cuotasVencidas(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    if (!p || p.pagado) return [];
    return cuotasPlan(p).filter(function (c) {
      return !!c && !c.pagado && !!fechaFin(c.fecha) && fechaFin(c.fecha) < f;
    }).map(function (c) {
      var pag = pagadoDeCuota(p, c);
      var cap = Math.max(0, num(c.capital) - pag.capital);
      var cos = Math.max(0, costoEfectivoDeCuota(p, c) - pag.costo);
      var mor = moraPendienteDeCuota(p, c, f);
      return { n: num(c.n), fecha: fechaFin(c.fecha), capital: cap, costo: cos, mora: mor,
               total: cap + cos + mor, dias: diasCal(fechaFin(c.fecha), f) };
    });
  }
  /* Todo lo vencido de un crédito con cuotas a una fecha (0 si no hay nada
     vencido). Con más de una cuota vencida, la cola, el KPI de mora y el
     WhatsApp de mora contaban solo la primera. */
  function vencidoDelPlan(p, fecha) {
    return cuotasVencidas(p, fecha).reduce(function (t, v) { return t + v.total; }, 0);
  }
  /* LO QUE DEBE HOY de un crédito: todo lo vencido si hay cuotas vencidas, y si
     no, lo de su ciclo. Sin cuotas es exactamente liquidarCiclo. La usaban el
     computador (vencidoHoy) y nadie más: el celular seguía mandando por
     WhatsApp la mitad de la deuda con dos cuotas vencidas (revisión del 17-oct). */
  function aPagarHoy(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    if (!p || p.pagado) return 0;
    var v = tienePlan(p) ? vencidoDelPlan(p, f) : 0;
    return v > 0 ? v : liquidarCiclo(p, f).total_a_pagar;
  }
  /* LO QUE VALE LA CUOTA EN SU FECHA, para lo que se le anuncia al cliente con
     esa fecha (calendario, recordatorios, «vence el…»). Para casi todos es lo
     mismo que hoy; la diferencia es la última cuota antes de que empiece su
     quincena: hoy cerrarla vale 325.000, pero el 15-nov vale 390.000, y el
     calendario del computador le mandaba al cliente «tu pago de $325.000 es el
     15 de nov» (revisión del 17-oct). Vencida, lo de hoy. */
  function aPagarEnSuFecha(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    if (!p || p.pagado) return 0;
    var corte = corteDelCredito(p);
    return (corte && corte > f) ? liquidarCiclo(p, corte).total_a_pagar : aPagarHoy(p, f);
  }

  /**
   * El `planPagos` que se guarda, armado desde lo que devuelve
   * MotorReglas.construirPlanACuotas. Vive acá para que el computador y el
   * celular lo guarden con la MISMA forma: el plan del §8 la tiene escrita en
   * registrarPlanDePagos, y dos copias de una forma terminan difiriendo.
   */
  function planPagosDeAlta(plan) {
    return {
      creado: plan.fecha_desembolso, origen: 'alta', entrada: null,
      tasa_por_corte: plan.tasa_por_corte,
      total_capital: plan.total_capital, total_costo: plan.total_costo, total_a_pagar: plan.total_a_pagar,
      /* Cada cambio de fecha o de % después del alta queda anotado acá
         (reprogramarPlan): qué se movió y cuándo, para que Joan y el cliente
         puedan reconstruir por qué la cuota dice lo que dice. */
      cambios: [],
      cuotas: plan.cuotas.map(function (q) {
        return { n: q.numero, fecha: q.fecha_corte, pct: q.pct, capital: q.capital, costo: q.costo,
                 total: q.total, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 };
      })
    };
  }

  /* Lo que se escribe en una cuota al cerrarla, para que el computador y el
     celular escriban lo mismo. `costo` queda en lo que la cuota DE VERDAD
     costó (con sus abonos), y si eso no es lo pactado, lo pactado se guarda
     aparte en `costoPactado`: la ganancia, la garantía y el 80/20 leen `costo`
     y cuentan lo que entró. */
  function cambioDeCierre(p, c, f, costoFinal, moraFinal) {
    var pag = pagadoDeCuota(p, c);
    var costoTotal = pag.costo + costoFinal;
    var cambio = { n: num(c.n), pagado: true, fechaPagado: f, recargo: pag.mora + moraFinal };
    if (costoTotal !== costoPactadoDeCuota(c) || c.costoPactado != null) {
      cambio.costoPactado = costoPactadoDeCuota(c);
      cambio.costo = costoTotal;
      cambio.total = num(c.capital) + costoTotal;
    }
    if (!cuotaEmpezo(p, c, f)) cambio.saldadoAntes = true;
    return cambio;
  }
  /* La garantía TOTAL que deja una cuota al cerrarse, contando sus abonos:
     se cierra en una copia y se le pregunta a la misma cuenta de siempre. */
  function garantiaDelCierre(p, cambio, abono) {
    var copia = JSON.parse(JSON.stringify(p));
    var c = cuotasPlan(copia).filter(function (x) { return num(x.n) === num(cambio.n); })[0];
    if (!c) return 0;
    Object.assign(c, cambio);
    if (abono) { copia.abonosCapital = lista(copia.abonosCapital); copia.abonosCapital.push(abono); }
    return garantiaGanadaCuotaPlan(copia, c);
  }

  /**
   * COBRAR LA CUOTA QUE SIGUE, ENTERA — una sola cuenta para el computador y el
   * celular. Hasta la revisión del 16-oct cada pantalla escribía sus campos
   * por su lado, y con abonos de por medio bajaban el capital dos veces.
   *
   * No escribe: devuelve en `registros` lo que la pantalla guarda —la cuota
   * (Object.assign por n), el abono a capital (si queda capital), el corte de
   * la cuota siguiente o, si era la última, los campos del crédito pagado—.
   * No lanza nunca.
   */
  function cierreDeCuota(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    var r = { ok: false, motivo: null, detalle: '', n: null, de: 0, liq: null, total: 0, ultima: false,
              saldado_antes: false, registros: null };
    function no(motivo, detalle) { r.ok = false; r.motivo = motivo; r.detalle = detalle; r.registros = null; return r; }
    try {
      if (!p || typeof p !== 'object') return no('sin_credito', 'No encontré el crédito.');
      if (p.pagado) return no('pagado', 'Este crédito ya está pagado.');
      var c = cuotaPlanActual(p);
      if (!c) return no('sin_cuotas', 'Este crédito no tiene cuotas pendientes.');
      r.n = num(c.n); r.de = cuotasPlan(p).length;
      var ult = ultimoHechoDelPlan(p);
      if (ult && f < ult) return no('fecha_anterior', textoFueraDeOrden(ult, 'el cobro de la cuota ' + c.n));
      if (!cuotaEmpezo(p, c, f) && !esUltimaPendiente(p, c)) {
        return no('no_ha_empezado', 'La cuota ' + c.n + ' todavía no empieza: su quincena corre desde el día ' +
          'después del ' + fechaTexto(inicioDeCuota(p, c)) + '. Antes de eso no se cierra sola, porque lo que ' +
          'cuesta depende de cuánto siga debiendo cuando empiece. Si trae plata, anótala como abono a la cuota ' +
          '(va a capital) o usa «Pagó todo el crédito».');
      }
      var liq = liquidarCiclo(p, f);
      var cambio = cambioDeCierre(p, c, f, liq.costo, liq.recargo_mora);
      /* `recibido`: lo que entró ese día por esta cuota (capital, costo y
         recargo). No es parte de la identidad del abono; es lo que Joan coteja
         con el cliente si los dos aparatos cobraron distinto. */
      var abono = liq.capital > 0 ? { fecha: f, monto: liq.capital, cuotaPlan: num(c.n), recibido: liq.total_a_pagar } : null;
      cambio.garantiaGenerada = garantiaDelCierre(p, cambio, abono);
      var cs = cuotasPlan(p), i = indiceDeCuota(p, c);
      var sig = null;
      for (var k = i + 1; k < cs.length; k++) if (cs[k] && !cs[k].pagado) { sig = cs[k]; break; }
      r.liq = liq;
      r.total = liq.total_a_pagar;
      r.ultima = !sig;
      r.saldado_antes = !!cambio.saldadoAntes;
      r.registros = {
        cuota: cambio,
        abono: abono,
        cicloActual: sig ? fechaFin(sig.fecha) : null,
        credito: sig ? null : { pagado: true, fechaPagado: f, cicloPago: fechaFin(c.fecha), cobroRegistrado: true,
                                /* Toda la ganancia ya está contada cuota por cuota (y la
                                   entrada, en planPagos.entrada): dejar algo acá la
                                   contaría dos veces. */
                                gananciaPago: 0, recargoMora: 0 }
      };
      r.ok = true;
      return r;
    } catch (e) {
      return no('error', 'No pude hacer la cuenta de esta cuota (' + String((e && e.message) || e).slice(0, 120) +
        '). No registré nada.');
    }
  }

  /**
   * PAGAR TODO ANTES DE TIEMPO — la regla de Joan del 16-oct, con sus palabras:
   * «paga solo el interés del capital hasta esa quincena y el capital completo;
   * el interés de la siguiente quincena no se cobra porque no completó el
   * tiempo».
   *
   * Es la regla del costo de arriba aplicada a todas las cuotas a la vez: se
   * cobra el capital que falta, el costo de cada cuota cuya quincena YA
   * EMPEZÓ —la que corre y las vencidas— y la mora de las vencidas; las que no
   * han empezado no cuestan nada, porque al pagar todo ya no se debe nada
   * cuando empiezan. En el caso de Joan: todo el 30-oct son 780.000; todo el
   * 31-oct ya corre la quincena de la cuota 2 y entran sus 65.000, además de un
   * día de mora de la 1. Y es lo MISMO que cobrar cuota por cuota ese día
   * (cierreDeCuota): la revisión lo exige con un barrido.
   *
   * Solo para el crédito a cuotas: el plan del §8 sigue cobrándose cuota por
   * cuota (su regla de pago anticipado no se decidió).
   *
   * No escribe nada: devuelve lo que la pantalla tiene que guardar en
   * `registros` (cuotas por n, abonos, campos del crédito).
   *
   * @returns {object|null} null si no es un crédito a cuotas abierto. Con una
   *   fecha anterior a un abono ya anotado devuelve {rechazo} y no `registros`.
   */
  function liquidarSaldoPlan(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    if (!p || p.pagado || !esPlanDeAlta(p) || !cuotaPlanActual(p)) return null;
    var cs = cuotasPlan(p);
    var r = { fecha: f, corte: corteDelCredito(p) || null, capital: 0, costo: 0, mora: 0, total: 0,
              costo_que_no_se_cobra: 0, garantia: 0, filas: [], rechazo: null, registros: null };
    var ultimo = ultimoHechoDelPlan(p);
    var regCuotas = [], regAbonos = [];
    cs.forEach(function (c) {
      if (!c || c.pagado) return;
      var pag = pagadoDeCuota(p, c);
      var empezo = cuotaEmpezo(p, c, f);
      var cap = Math.max(0, num(c.capital) - pag.capital);
      var cuesta = Math.max(0, costoEfectivoDeCuota(p, c) - pag.costo);
      var cos = empezo ? cuesta : 0;
      var mor = moraPendienteDeCuota(p, c, f);
      var cambio = cambioDeCierre(p, c, f, cos, mor);
      var abono = cap > 0 ? { fecha: f, monto: cap, cuotaPlan: num(c.n), recibido: cap + cos + mor } : null;
      cambio.garantiaGenerada = garantiaDelCierre(p, cambio, abono);
      r.filas.push({ n: num(c.n), fecha: fechaFin(c.fecha), empezo: empezo, capital: cap, costo: cos,
                     costo_que_no_se_cobra: empezo ? 0 : cuesta, mora: mor, total: cap + cos + mor,
                     garantia: cambio.garantiaGenerada });
      r.capital += cap; r.costo += cos; r.mora += mor; r.garantia += cambio.garantiaGenerada;
      r.costo_que_no_se_cobra += empezo ? 0 : cuesta;
      regCuotas.push(cambio);
      if (abono) regAbonos.push(abono);
    });
    r.total = r.capital + r.costo + r.mora;
    if (ultimo && f < ultimo) {
      r.rechazo = textoFueraDeOrden(ultimo, 'pagar todo');
      return r;
    }
    r.registros = {
      cuotas: regCuotas,
      abonos: regAbonos,
      credito: { pagado: true, fechaPagado: f, cicloPago: r.corte, cobroRegistrado: true,
                 /* Toda la ganancia ya está contada cuota por cuota, como en el
                    cierre de una cuota: dejar algo acá la contaría dos veces. */
                 gananciaPago: 0, recargoMora: 0 }
    };
    return r;
  }

  /* Hasta qué día vale la cifra de pagar todo que se ve HOY. Mientras la cuota
     en curso no haya empezado, hasta el día en que empieza (la fecha de la
     anterior); si ya empezó y no ha vencido, hasta su fecha; vencida, solo hoy
     (la mora sube cada día). La app pintaba «hasta el 15-nov» una cifra que
     cambiaba el 31-oct. */
  function saldarValeHasta(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    var c = (p && !p.pagado && esPlanDeAlta(p)) ? cuotaPlanActual(p) : null;
    if (!c) return null;
    if (!cuotaEmpezo(p, c, f)) return inicioDeCuota(p, c) || f;
    var corte = fechaFin(c.fecha);
    return (corte && f <= corte) ? corte : f;
  }

  /**
   * UN ABONO A LA CUOTA QUE SIGUE — decisión de Joan del 16-oct: lo que entra
   * va primero a la mora, después al costo y después al capital, y lo que falta
   * sigue en esa misma cuota y en su fecha. Si la quincena de la cuota todavía
   * no empezó, su costo aún no se debe y el abono va entero a capital (ver «EL
   * COSTO DE UNA CUOTA»).
   *
   * No lanza nunca (como abonoConProrroga): un dato sucio dice que no pudo y
   * no registra nada. Si `ok`, `registros.abono` es lo que la pantalla empuja a
   * `p.abonosCapital`. Si con la plata completa la cuota, NO es un abono: se
   * dice, para que se cobre la cuota entera por su camino; y si salda el
   * crédito entero, se dice eso.
   *
   * El `id` existe por la nube: la identidad de un abono es fecha + monto +
   * cuota + id. No sale de contar los abonos de esta copia —dos aparatos
   * contarían lo mismo y la nube fundiría dos abonos distintos en uno—, sino
   * del reloj y del azar.
   */
  function abonoACuota(p, fecha, monto) {
    var f = fechaFin(fecha) || hoyISO();
    var x = Math.round(Number(monto));
    var r = { ok: false, motivo: null, detalle: '', fecha: f, monto: isFinite(x) ? x : 0,
              n: null, de: 0, fecha_cuota: null, empezo: true, pendiente: null, aplica: null, queda: null,
              garantia: 0, cierre: 0, saldo: null, en_su_fecha: null, registros: null };
    function no(motivo, detalle) { r.ok = false; r.motivo = motivo; r.detalle = detalle; r.registros = null; return r; }
    try {
      if (!p || typeof p !== 'object') return no('sin_credito', 'No encontré el crédito.');
      if (p.pagado) return no('pagado', 'Este crédito ya está pagado.');
      var c = cuotaPlanActual(p);
      if (!c) return no('sin_cuotas', 'Este crédito no tiene cuotas pendientes.');
      r.n = num(c.n); r.de = cuotasPlan(p).length; r.fecha_cuota = fechaFin(c.fecha) || null;
      r.empezo = cuotaEmpezo(p, c, f);
      var pag = pagadoDeCuota(p, c);
      var mora = moraPendienteDeCuota(p, c, f);
      var costo = costoAdeudadoDeCuota(p, c, f, true);
      var capital = Math.max(0, num(c.capital) - pag.capital);
      r.pendiente = { mora: mora, costo: costo, capital: capital, total: mora + costo + capital };
      r.cierre = liquidarCiclo(p, f).total_a_pagar;
      var sal = esPlanDeAlta(p) ? liquidarSaldoPlan(p, f) : null;
      r.saldo = sal ? sal.total : null;
      if (!isFinite(x) || x <= 0) return no('monto_invalido', 'Escribe cuánto entregó, en pesos.');
      var ult = ultimoHechoDelPlan(p);
      if (ult && f < ult) return no('fecha_anterior', textoFueraDeOrden(ult, 'este abono'));
      if (sal && x >= sal.total) {
        return no('salda_el_credito', 'Con ' + pesos(x) + ' salda el crédito entero (' + pesos(sal.total) +
          '): eso es «Pagó todo el crédito»' + (x > sal.total ? ', y sobran ' + pesos(x - sal.total) + '.' : '.'));
      }
      var seCierra = r.empezo || esUltimaPendiente(p, c);
      if (seCierra && x >= r.cierre) {
        return no('completa_la_cuota', 'Con ' + pesos(x) + ' completa la cuota ' + c.n + ' (' + pesos(r.cierre) +
          '): cóbrala completa' + (x > r.cierre ? ', y lo que sobra (' + pesos(x - r.cierre) +
          ') anótalo después como abono a la cuota siguiente.' : '.'));
      }
      if (!seCierra && x > mora + capital) {
        /* Una cuota del medio que todavía no empieza recibe hasta todo su
           capital; más no tiene adónde ir: la cuota no se cierra antes de
           empezar y la siguiente no recibe abonos hasta que esta se cierre. */
        return no('adelanta_de_mas', 'La cuota ' + c.n + ' todavía no empieza: puede recibir hasta ' +
          pesos(mora + capital) + ' (todo su capital), y lo que pase de ahí no tiene dónde quedar. Anota ' +
          pesos(mora + capital) + ' o usa «Pagó todo el crédito»' + (sal ? ' (' + pesos(sal.total) + ')' : '') + '.');
      }
      var aMora = Math.min(x, mora), aCosto = Math.min(x - aMora, costo), aCapital = x - aMora - aCosto;
      r.aplica = { mora: aMora, costo: aCosto, capital: aCapital };
      r.queda = { mora: mora - aMora, costo: costo - aCosto, capital: capital - aCapital,
                  total: mora + costo + capital - x };
      var corte = fechaFin(c.fecha);
      r.garantia = M.acumularGarantia(aCosto, M.cuentaComoPuntualParaGarantia({
                     pagado_en_fecha: aMora === 0 && (!corte || f <= corte),
                     credito_estuvo_en_mora: veniaDeMora(p, corte) })) +
                   M.garantiaDeMoraPagada(aMora, fechaDelCredito(p));
      var id = 'c' + c.n + '-' + f + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      r.registros = { abono: { fecha: f, monto: aCapital, cuotaPlan: num(c.n), parcial: true, recibido: x,
                               moraPagada: aMora, costoPagado: aCosto, id: id } };
      /* Lo que la cuota valdrá EN SU FECHA con este abono ya anotado. Antes de
         que empiece su quincena, `queda` es solo capital (el costo todavía no se
         debe), y la pantalla decía «quedan $225.000 para el 15-nov» de una cuota
         que ese día vale 270.000 (revisión del 17-oct). */
      var copia = JSON.parse(JSON.stringify(p));
      copia.abonosCapital = lista(copia.abonosCapital).concat([r.registros.abono]);
      var enSu = corte ? liquidarCiclo(copia, corte) : null;
      r.en_su_fecha = enSu ? { fecha: corte, total: enSu.total_a_pagar, capital: enSu.capital, costo: enSu.costo } : null;
      r.ok = true;
      return r;
    } catch (e) {
      return no('error', 'No pude hacer la cuenta de esta cuota (' + String((e && e.message) || e).slice(0, 120) +
        '). No registré nada.');
    }
  }

  /**
   * CAMBIAR LA FECHA O EL % DE UNA CUOTA DESPUÉS DEL ALTA — decisión de Joan
   * del 16-oct: solo cuotas que no han vencido ni se han pagado, y cada cambio
   * queda anotado.
   *
   * Por qué esas rejas: la fecha de una cuota es un HECHO de la línea de
   * tiempo (cambiosDeCorte la lee para saber qué corte regía cada día). Correr
   * una cuota ya vencida borraría su mora hacia atrás y lavaría el historial
   * —el mismo agujero que la prórroga tuvo hasta el 5-ago—. Con la cuota y la
   * fecha nueva las dos en hoy o después, ningún día pasado cambia de
   * respuesta: para todo día anterior a hoy, las dos fechas estaban en el
   * futuro. Por eso la nueva tampoco puede caer en el pasado.
   * Una cuota con abonos tampoco se toca: su costo ya está pagado en parte.
   *
   * El costo de cada cuota se rehace con el MOTOR (construirPlanACuotas) sobre
   * el calendario completo —con eso hereda todas sus rejas— y las cuotas ya
   * pagadas tienen que salir idénticas a lo pactado: si no, no se guarda nada.
   *
   * @param {Array<{n, fecha?, pct?}>} cambios
   * @param {string} [hoy]
   * @returns {{ok, motivo, detalle, planPagos, cicloActual, cambios, inhabiles}}
   */
  function reprogramarPlan(p, cambios, hoy) {
    var h = fechaFin(hoy) || hoyISO();
    var r = { ok: false, motivo: null, detalle: '', planPagos: null, cicloActual: null, cambios: [], inhabiles: [] };
    function no(motivo, detalle) { r.ok = false; r.motivo = motivo; r.detalle = detalle; r.planPagos = null; return r; }
    if (!p || p.pagado) return no('pagado', 'Este crédito ya está pagado.');
    if (!esPlanDeAlta(p)) return no('no_es_a_cuotas', 'Solo las cuotas de un crédito a cuotas se reprograman.');
    /* 22-oct-2026 — el pago que pactó Joan no se rehace con %: su costo va en
       pesos y el motor lo reconstruiría con un % entero (y exige dos cuotas).
       Tiene su propia puerta, con su tope y su anotación. */
    if (esPacto(p)) {
      return no('es_pacto', 'Este crédito tiene un próximo pago acordado: la fecha y el monto se cambian con ' +
        '«✏️ Ajustar el próximo pago».');
    }
    var cs = cuotasPlan(p), pedidos = {};
    lista(cambios).forEach(function (x) { if (x && x.n != null) pedidos[num(x.n)] = x; });
    var entrada = [], log = [];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], x = pedidos[num(c.n)];
      var deFecha = fechaFin(c.fecha), dePct = num(c.pct) || Math.round(num(p.planPagos.tasa_por_corte) * 100);
      var aFecha = (x && x.fecha) ? fechaFin(x.fecha) : deFecha;
      var aPct = (x && x.pct != null && x.pct !== '') ? Number(x.pct) : dePct;
      if (aFecha !== deFecha || aPct !== dePct) {
        if (c.pagado) return no('pagada', 'La cuota ' + c.n + ' ya está pagada: no se mueve.');
        if (abonosDeCuota(p, c.n).length) {
          return no('con_abonos', 'La cuota ' + c.n + ' ya tiene abonos: su costo está pagado en parte y no se ' +
            'puede rehacer. Cóbrale lo que falta.');
        }
        if (!deFecha || deFecha < h) {
          return no('vencida', 'La cuota ' + c.n + ' venció el ' + fechaTexto(deFecha) + ': moverla le borraría la ' +
            'mora hacia atrás. Cóbrala o anótale un abono.');
        }
        if (!aFecha || aFecha < h) return no('al_pasado', 'La fecha nueva de la cuota ' + c.n + ' ya pasó.');
        log.push({ n: num(c.n), de: { fecha: deFecha, pct: dePct, costo: num(c.costo) },
                   a: { fecha: aFecha, pct: aPct } });
      }
      entrada.push({ fecha: aFecha, pct: aPct, capital: num(c.capital) });
    }
    if (!log.length) return no('sin_cambios', 'No cambiaste nada.');
    var plan;
    try {
      plan = M.construirPlanACuotas(num(p.planPagos.total_capital) || num(p.capital), entrada,
                                    { fechaDesembolso: p.fechaDesembolso });
    } catch (e) {
      return no('invalido', String((e && e.message) || e));
    }
    for (var j = 0; j < cs.length; j++) {
      if (cs[j].pagado && costoPactadoDeCuota(cs[j]) !== plan.cuotas[j].costo) {
        return no('pagada_cambiaria', 'Ese cambio le movería el costo a la cuota ' + cs[j].n +
          ', que ya está pagada. No guardé nada.');
      }
    }
    var nuevas = cs.map(function (c, i) {
      var o = clonarCuota(c);
      if (c.pagado) return o;
      var q = plan.cuotas[i];
      o.fecha = q.fecha_corte; o.pct = q.pct; o.costo = q.costo; o.total = q.total;
      return o;
    });
    log.forEach(function (l) {
      l.fecha = h;
      l.a.costo = plan.cuotas[l.n - 1] ? plan.cuotas[l.n - 1].costo : null;
    });
    var pp = JSON.parse(JSON.stringify(p.planPagos));
    pp.cuotas = nuevas;
    pp.tasa_por_corte = plan.tasa_por_corte;
    pp.total_costo = plan.total_costo;
    pp.total_a_pagar = plan.total_a_pagar;
    pp.cambios = lista(pp.cambios).concat(log);
    r.ok = true;
    r.planPagos = pp;
    r.cambios = log;
    var sig = nuevas.filter(function (c) { return !c.pagado; })[0];
    r.cicloActual = sig ? sig.fecha : (p.cicloActual || null);
    /* Solo los días no hábiles que todavía están por venir: avisar del domingo
       de una cuota que venció la semana pasada es hablar en futuro de algo que
       ya pasó (revisión del 16-oct). */
    r.inhabiles = plan.inhabiles.filter(function (x) {
      var c = nuevas[x.numero - 1];
      return !!c && !c.pagado && x.fecha >= h;
    });
    return r;
  }
  function clonarCuota(c) { return JSON.parse(JSON.stringify(c)); }

  /* ==========================================================================
   * EL PRÓXIMO PAGO LO DECIDE JOAN — 22-oct-2026
   *
   * Pedido de Joan, con el caso delante: «un cliente debe 750.000 y abona
   * únicamente 500.000 y el resto lo deja para la siguiente quincena, ese
   * restante es de 250.000 más el adicional que se pague; el CRM puede tener
   * un cálculo propio pero la decisión final sea mía, quiero poder decidir
   * cuánto cobro si más o menos… incluso los días yo los pueda seleccionar».
   *
   * La cuenta del CRM sigue siendo la de siempre (la fecha que tiene el
   * crédito y su costo del ciclo) y se le muestra a Joan YA ESCRITA. Si él
   * pone otra fecha u otro monto, eso es un PACTO, y el pacto se guarda con
   * la forma que ya existe para «una fecha y un costo que puso Joan»: el plan
   * del crédito a cuotas del 16-oct, con UNA cuota y `planPagos.pacto`.
   * Por qué esa forma y no un campo nuevo en el crédito quincenal:
   *   · la fecha de una cuota NO se corre por domingo ni festivo, y la mora
   *     corre solo desde el día siguiente, sobre el capital que falte
   *     (moraCausadaDeCuota): es justo lo que Joan pidió;
   *   · el costo de la cuota va en PESOS (`costo`): 30.000 sobre 250.000 no
   *     tiene que caber en un % entero, y 33.333 tampoco;
   *   · el abono a la cuota, su cierre, la garantía por pedazos (el 80% de lo
   *     que de verdad entra), la cola de cobranza, «vencido hoy», el KPI de
   *     mora, el paquete de la app, el celular y la fusión de la nube por
   *     `planPagos` ya la entienden y ya tienen sus pruebas.
   * Un campo nuevo en el quincenal habría que enseñárselo a K, a la línea de
   * tiempo y a cada pantalla, una por una: la forma exacta de los defectos que
   * este archivo ya pagó (dos copias de una regla terminan diciendo dos cosas).
   *
   * LO QUE CAMBIA CON EL PACTO, dicho de frente: el crédito deja de
   * prorrogarse, como todo crédito a cuotas. Si el cliente vuelve a traer una
   * parte, se anota como abono a la cuota y, mientras no venza, Joan vuelve a
   * pactar el resto con esta misma función.
   *
   * LAS REJAS, decisiones de Joan:
   *   · TOPE: lo que se cobra por encima del capital que queda no pasa del
   *     TASA_CREDITO_MAXIMA (el 50% del 8-sep) de ESE capital. Vive acá y no
   *     en la pantalla: el computador y el celular preguntan lo mismo.
   *   · SIN PISO: cobrar MENOS que el capital que queda es PERDONAR capital.
   *     Pide motivo y queda en `p.condonaciones` con `capital`, como los
   *     descuentos de mora y costo. Desde ese día ya no se debe
   *     (capitalPerdonadoDe).
   *   · Un pago que YA VENCIÓ no se mueve: correr una fecha vencida le borra la
   *     mora hacia atrás (la razón de reprogramarPlan y de la prórroga del
   *     5-ago). Se dice y se ofrecen los caminos que ya existen.
   *   · La fecha, después de hoy y a no más de DIAS_ALTA_MAX días (lo mismo que
   *     el crédito a cuotas: más allá es otro producto, y un año mal tecleado
   *     no puede volverse un pacto). Domingo o festivo NO se corre: se avisa,
   *     con los días y la mora que le correrían si paga el primer día hábil.
   *
   * Cada pacto queda anotado en `planPagos.cambios` (quién, cuándo, cuánto y
   * lo que decía el CRM), igual que los cambios de reprogramarPlan.
   * ========================================================================*/
  function esPacto(p) {
    return esPlanDeAlta(p) && !!p.planPagos.pacto && typeof p.planPagos.pacto === 'object';
  }
  /* El % con dos decimales, SOLO para mostrarlo: la verdad es el costo en pesos. */
  function pctDe(costo, capital) {
    return capital > 0 ? Math.round(num(costo) / capital * 10000) / 100 : 0;
  }

  /**
   * Pactar (o volver a pactar) el próximo pago de un crédito abierto.
   *
   * @param {object} db      la cartera (para lo que te deja el cliente)
   * @param {object} p       el crédito, quincenal o con un pacto anterior
   * @param {object} pedido  {fecha, monto, motivo, quien}; lo que no venga es
   *                         lo que el crédito ya tiene (la cuenta del CRM)
   * @param {string} [hoy]   el día en que Joan decide
   * @returns {object} `sugerido` (la cuenta del CRM), lo pactado (fecha,
   *   monto, capital, costo, perdona, pct, tope), `inhabiles`, `ganancia` y
   *   `ganancia_cliente` con la decisión, y si `ok`, `registros` {planPagos,
   *   condonacion|null, cicloActual} y `credito` (cómo quedaría, para
   *   preguntarle cosas: nunca se guarda tal cual). No escribe ni lanza.
   */
  function pactarProximoPago(db, p, pedido, hoy) {
    var h = fechaFin(hoy) || hoyISO();
    var q = (pedido && typeof pedido === 'object') ? pedido : {};
    var r = {
      ok: false, motivo: null, detalle: '', caminos: [], hoy: h, base: null,
      sugerido: null, fecha: null, monto: 0, capital: 0, costo: 0, perdona: 0, pct: 0,
      tope: 0, monto_maximo: 0, inhabiles: [], cambia: false,
      ganancia: null, ganancia_cliente: null, credito: null, registros: null
    };
    function no(motivo, detalle, caminos) {
      r.ok = false; r.motivo = motivo; r.detalle = detalle; r.caminos = caminos || []; r.registros = null;
      return r;
    }
    try { return cuenta(); }
    catch (e) {
      return no('error', 'No pude hacer la cuenta de este crédito (' +
        String((e && e.message) || e).slice(0, 120) + '). No guardé nada.');
    }
    function cuenta() {
      if (!p || typeof p !== 'object') return no('sin_credito', 'No encontré el crédito.');
      if (p.pagado) return no('pagado', 'Este crédito ya está pagado: no tiene próximo pago.');
      var pacto = esPacto(p);
      if (tienePlan(p) && !pacto) {
        if (esPlanDeAlta(p)) {
          return no('a_cuotas', 'Este crédito es a cuotas: sus fechas y su % se cambian con «✏️ Cambiar fechas ' +
            'o %», cuota por cuota.', ['reprogramar']);
        }
        return no('plan_de_pagos', 'Este crédito está en plan de pagos (§8): sus cuotas no se mueven. ' +
          'Cóbrale la cuota que sigue.', ['cobro']);
      }
      var c = pacto ? cuotaPlanActual(p) : null;
      if (pacto && !c) return no('sin_cuotas', 'Este crédito no tiene un pago pendiente.');
      r.base = pacto ? 'pacto' : 'quincenal';
      var pag = c ? pagadoDeCuota(p, c) : null;
      /* El capital de ESE pago: con pacto, lo que falta de la cuota (que es
         todo lo que se debe: el pacto tiene una sola); sin pacto, el capital. */
      var capital = c ? Math.max(0, num(c.capital) - pag.capital) : capitalActual(p);
      r.capital = capital;
      if (capital <= 0) return no('capital_cero', 'Este crédito ya no debe capital: no hay próximo pago que mover.');
      var corte = corteDelCredito(p);
      if (!corte) return no('sin_fecha', 'Este crédito no tiene fecha de pago: no sé qué mover.');
      /* LA CUENTA DEL CRM: lo que el crédito cobra en su fecha si paga a
         tiempo —el capital y el costo de su ciclo, o lo ya pactado—. Es lo que
         se le muestra a Joan ya escrito, y lo que queda anotado como «lo que
         decía el CRM» si él decide otra cosa. */
      var enSu = liquidarCiclo(p, corte);
      r.sugerido = { fecha: corte, monto: Math.round(enSu.total_a_pagar), capital: Math.round(enSu.capital),
                     costo: Math.round(enSu.costo) };
      if (corte < h) {
        var atraso = diasCal(corte, h);
        return no('vencido', 'El pago del ' + fechaTexto(corte) + ' ya venció (' + atraso + ' día' +
          (atraso === 1 ? '' : 's') + ' de atraso): moverlo le borraría la mora hacia atrás, así que por acá no se ' +
          'mueve. ' + (pacto
            ? 'Cóbralo o anótale un abono (va primero a la mora, después al costo y después al capital).'
            : 'Cóbralo, regístrale una prórroga (o «Abonó y el resto pasa a la próxima quincena») o pacta un ' +
              'acuerdo.'), pacto ? ['cobro'] : ['cobro', 'prorroga', 'acuerdo']);
      }
      if (p.acuerdo) {
        return no('acuerdo', 'Este crédito tiene un acuerdo pactado para el ' + fechaTexto(p.acuerdo.pactadaPara) +
          ': cúmplelo o deshazlo antes de mover el pago.', ['acuerdo']);
      }

      var fecha = (q.fecha == null || q.fecha === '') ? r.sugerido.fecha : fechaFin(q.fecha);
      var valida = false;
      try { valida = !!fecha && M.iso(M.aFechaLocal(fecha)) === fecha; } catch (e) { valida = false; }
      if (!valida) return no('fecha_invalida', 'Escribe la fecha en que paga.');
      var monto = (q.monto == null || q.monto === '') ? r.sugerido.monto : Math.round(Number(q.monto));
      r.fecha = fecha;
      r.monto = isFinite(monto) ? monto : 0;
      r.tope = Math.floor(capital * M.TASA_CREDITO_MAXIMA);
      r.monto_maximo = capital + r.tope;
      if (!isFinite(monto) || monto <= 0) return no('monto_invalido', 'Escribe cuánto le cobras ese día, en pesos.');
      r.costo = Math.max(0, monto - capital);
      r.perdona = Math.max(0, capital - monto);
      r.pct = pctDe(r.costo, capital);
      r.cambia = fecha !== r.sugerido.fecha || monto !== r.sugerido.monto;
      /* Primero «no cambiaste nada»: es lo que la hoja muestra al abrirse, con
         las dos casillas en la cuenta del CRM, y no es un error. */
      if (!r.cambia) {
        return no('sin_cambios', 'Es lo mismo que ya tiene: ' + pesos(monto) + ' el ' + fechaTexto(fecha) + '.');
      }
      if (fecha <= h) {
        return no('al_pasado', 'El próximo pago tiene que ser después de hoy (' + fechaTexto(h) + ').');
      }
      if (diasCal(h, fecha) > M.DIAS_ALTA_MAX) {
        return no('muy_lejos', 'El ' + fechaTexto(fecha) + ' queda a ' + diasCal(h, fecha) + ' días: el pago se ' +
          'pacta a no más de ' + M.DIAS_ALTA_MAX + ' días (unos seis meses). ¿Está bien escrito el año?');
      }
      if (r.costo > r.tope) {
        /* Sin el % redondeado en la frase: 125.001 sobre 250.000 es «el 50%»
           redondeado, y decir «cobras el 50% y el techo es el 50%» no explica
           por qué no deja. Van los pesos, que son los que mandan. */
        return no('sobre_tope', 'Con ' + pesos(monto) + ' le cobras ' + pesos(r.costo) + ' por encima de los ' +
          pesos(capital) + ' de capital, y el techo es el ' + Math.round(M.TASA_CREDITO_MAXIMA * 100) +
          '% de ese capital: ' + pesos(r.tope) + '. Ese día le puedes cobrar hasta ' + pesos(r.monto_maximo) + '.');
      }
      var motivo = String(q.motivo == null ? '' : q.motivo).trim().slice(0, 120);

      var quien = String(q.quien || 'computador');
      var capCuota, costoCuota, pp, cuota;
      if (pacto) {
        /* Volver a pactar: la misma cuota, con lo que ya entró en abonos
           intacto. Su capital baja solo en lo que se perdona; su costo es lo
           que ya pagó en abonos más lo que se cobra ese día. */
        pp = JSON.parse(JSON.stringify(p.planPagos));
        cuota = pp.cuotas.filter(function (x) { return x && num(x.n) === num(c.n); })[0];
        capCuota = num(c.capital) - r.perdona;
        costoCuota = pag.costo + r.costo;
      } else {
        capCuota = capital - r.perdona;
        costoCuota = r.costo;
        cuota = { n: 1, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 };
        pp = { creado: h, origen: 'alta', entrada: null,
               /* `de`: la fecha que regía antes del pacto. Es la que la línea
                  de tiempo necesita para no confundir el corte original
                  (cambiosDeCorte). */
               pacto: { creado: h, de: corte, quien: quien },
               cambios: [], cuotas: [cuota] };
      }
      cuota.fecha = fecha;
      cuota.capital = capCuota;
      cuota.costo = costoCuota;
      cuota.total = capCuota + costoCuota;
      cuota.pct = pctDe(costoCuota, capCuota);
      pp.tasa_por_corte = cuota.pct / 100;
      pp.total_capital = capCuota;
      pp.total_costo = costoCuota;
      pp.total_a_pagar = capCuota + costoCuota;
      pp.cambios = lista(pp.cambios).concat([{
        n: num(cuota.n), fecha: h, pacto: true, quien: quien,
        de: { fecha: r.sugerido.fecha, total: r.sugerido.monto, capital: r.sugerido.capital, costo: r.sugerido.costo },
        a: { fecha: fecha, total: monto, capital: capital - r.perdona, costo: r.costo },
        perdona: r.perdona
      }]);
      var condonacion = r.perdona > 0
        ? { fecha: h, costo: 0, mora: 0, capital: r.perdona, motivo: motivo, quien: quien, sobre: 'pacto', para: fecha }
        : null;

      /* Cómo queda, para PREGUNTARLE —no para deducir— lo que va a cobrar.
         Si el puente no contesta exactamente lo que Joan escribió, no se
         guarda: la pantalla y el crédito estarían leyendo cosas distintas. */
      var despues = JSON.parse(JSON.stringify(p));
      despues.planPagos = pp;
      despues.cicloActual = fecha;
      if (condonacion) despues.condonaciones = lista(despues.condonaciones).concat([condonacion]);
      var enLaFecha = liquidarCiclo(despues, fecha);
      if (Math.round(enLaFecha.total_a_pagar) !== monto || capitalActual(despues) !== capital - r.perdona ||
          corteDelCredito(despues) !== fecha) {
        return no('no_cuadra', 'No cuadra: pactaste ' + pesos(monto) + ' y la cuenta de ese día da ' +
          pesos(enLaFecha.total_a_pagar) + '. No guardé nada.');
      }
      /* El domingo o el festivo se avisan con lo que costaría: la fecha se
         queda como la puso Joan (decisión del 16-oct para las cuotas). */
      try {
        if (!M.esDiaHabilDeCorte(fecha)) {
          var sig = M.iso(M.siguienteDiaHabilDeCorte(fecha));
          var v = cuotasVencidas(despues, sig).filter(function (x) { return num(x.n) === num(cuota.n); })[0];
          r.inhabiles = [{ numero: num(cuota.n), fecha: fecha, motivo: M.esFestivo(fecha) ? 'festivo' : 'domingo',
                           siguiente_habil: sig, dias: v ? v.dias : diasCal(fecha, sig), mora: v ? v.mora : 0 }];
        }
      } catch (e) { r.inhabiles = []; }

      var socio = lista(db && db.socios).filter(function (x) { return x && x.id === p.socioId; })[0];
      r.ganancia = gananciaDelCredito(despues);
      r.ganancia_cliente = gananciaDelCliente(db, socio, despues);
      r.credito = despues;
      /* El motivo se pide DESPUÉS de hacer la cuenta, a propósito: la hoja le
         muestra a Joan lo que le cuesta el perdón (en rojo si lo deja en
         pérdida) mientras le pide el porqué. Sin motivo no hay registros. */
      if (r.perdona > 0 && !motivo) {
        return no('falta_motivo', 'Con ' + pesos(monto) + ' le perdonas ' + pesos(r.perdona) + ' de capital: es ' +
          'plata que prestaste y no vuelve. Escribe el motivo; dentro de tres meses, un perdón sin motivo es un ' +
          'cuadre que no cuadra.');
      }
      r.ok = true;
      r.registros = { planPagos: pp, condonacion: condonacion, cicloActual: fecha };
      r.detalle = 'El próximo pago queda en ' + pesos(monto) + ' el ' + fechaTexto(fecha) + ' (' +
        pesos(capital - r.perdona) + ' de capital' + (r.costo ? ' + ' + pesos(r.costo) + ' de costo' : '') + ')' +
        (r.perdona ? ', y le perdonas ' + pesos(r.perdona) + ' de capital' : '') + '. ' +
        (pacto ? 'Antes era ' : 'El CRM decía ') + pesos(r.sugerido.monto) + ' el ' + fechaTexto(r.sugerido.fecha) + '.';
      return r;
    }
  }

  /* ==========================================================================
   * LO QUE TE DEJA UN CRÉDITO — 22-oct-2026
   *
   * Joan: «que el CRM únicamente me muestre cuánto gané y qué porcentaje de
   * ganancias da ese crédito, y que muestre los números en rojo cuando las
   * ganancias sean negativas; al final siempre mostrar cuánto le gano al
   * cliente con cada crédito o decisión».
   *
   * LA GANANCIA ES TODA LA PLATA QUE ENTRA POR ENCIMA DEL CAPITAL PRESTADO:
   * costos y mora ya cobrados (gananciaCobrada, la misma de la lista y del
   * tablero) + lo pactado que falta cobrar − el capital que se perdonó. El
   * 80% que se le vuelve garantía al cliente NO se resta: es CUPO —lo que le
   * puedes volver a prestar—, no plata que te sale del bolsillo ni una deuda.
   * Por eso el % es sobre el capital PRESTADO.
   *
   * «Pendiente» es solo lo PACTADO que todavía no entra: el costo del ciclo
   * que corre, el del pago que pactó Joan o el de las cuotas que faltan. La
   * mora que no se ha pagado no cuenta: no está pactada, y sumar como
   * ganancia una sanción que no ha entrado inflaría justo la cifra con la que
   * Joan decide. Es UNA cuenta para el computador, el celular y donde haga
   * falta: si cada pantalla sumara la suya, dirían dos ganancias del mismo
   * crédito.
   * ========================================================================*/
  function gananciaDelCredito(p) {
    var r = { capital: 0, cobrado: 0, pendiente: 0, perdonado: 0, ganancia: 0, pct: 0, pagado: false };
    if (!p || typeof p !== 'object') return r;
    r.capital = Math.round(num(p.capital));
    r.pagado = !!p.pagado;
    r.cobrado = Math.round(gananciaCobrada(p));
    r.perdonado = capitalPerdonadoDe(p);
    if (!p.pagado) {
      r.pendiente = tienePlan(p) ? Math.round(costoPendienteDelPlan(p))
        : (capitalActual(p) > 0 ? Math.round(K(p)) : 0);
    }
    r.ganancia = r.cobrado + r.pendiente - r.perdonado;
    r.pct = r.capital > 0 ? Math.round(r.ganancia / r.capital * 1000) / 10 : 0;
    return r;
  }
  /* Lo que te deja un cliente con TODOS sus créditos. `cambio` es un crédito
     como quedaría con la decisión que Joan tiene en pantalla: reemplaza al
     guardado con el mismo id (o entra como uno más si es nuevo), para que
     «con este cliente llevas» se lea con esa decisión y no con la de ayer. */
  function gananciaDelCliente(db, s, cambio) {
    var t = { creditos: 0, capital: 0, cobrado: 0, pendiente: 0, perdonado: 0, ganancia: 0, pct: 0 };
    if (!s) return t;
    var visto = false;
    function sumar(g) {
      t.creditos++; t.capital += g.capital; t.cobrado += g.cobrado; t.pendiente += g.pendiente;
      t.perdonado += g.perdonado; t.ganancia += g.ganancia;
    }
    lista(db && db.prestamos).forEach(function (p) {
      if (!p || p.socioId !== s.id) return;
      if (cambio && cambio.id === p.id) { visto = true; sumar(gananciaDelCredito(cambio)); return; }
      sumar(gananciaDelCredito(p));
    });
    if (cambio && !visto && cambio.socioId === s.id) sumar(gananciaDelCredito(cambio));
    t.pct = t.capital > 0 ? Math.round(t.ganancia / t.capital * 1000) / 10 : 0;
    return t;
  }

  /* ==========================================================================
   * LA LÍNEA DE TIEMPO DE UN CRÉDITO — 5-ago-2026.
   *
   * LA CAUSA DE SEIS RONDAS DE PARCHES, DICHA DE UNA VEZ:
   *
   *     las cuentas preguntaban por el PASADO y buscaban la respuesta en el
   *     PRESENTE.
   *
   *   · `estabaVencido(p, instante)` quiere saber si el crédito estaba en mora
   *     en una fecha pasada, y lo resolvía leyendo `p.cicloActual` — un campo
   *     que la prórroga y el plan de pagos MUEVEN AL FUTURO. Registrar una
   *     prórroga hoy hacía que `estabaVencido(p,'2026-06-01')` pasara de true a
   *     false: la mora se borraba hacia atrás, el instante desaparecía de la
   *     lista del nivel, y DEJAR la prórroga terminaba rindiendo 256.150 más de
   *     cupo que devolver el capital. La misma operación grababa `aTiempo:false`
   *     para la garantía y "no hubo mora" para el nivel, el mismo día y sobre el
   *     mismo crédito.
   *   · `K(p)` quiere saber cuánto costo se había CAUSADO, y lo resolvía leyendo
   *     `capitalActual(p)` — un campo que el abono BAJA. Abonar el capital menos
   *     un peso dejaba el costo del ciclo en cero.
   *
   * Un campo que se sobrescribe no puede contestar una pregunta sobre el
   * pasado. Da igual cuántos parches se le pongan encima: siempre va a haber
   * otra pregunta histórica que falle. Así que las preguntas del pasado se
   * contestan RECORRIENDO LOS HECHOS, que ya estaban todos guardados:
   *
   *     p.fechaDesembolso · p.prorrogas[] (fecha, ciclo viejo, ciclo nuevo)
   *     p.planPagos.entrada y sus cuotas · p.abonosCapital[] (fecha y monto)
   *     p.fechaPagado · p.cicloPago
   *
   * `cicloActual` y `capitalActual` quedan en lo que de verdad son: el resumen
   * de HOY, cómodo para pintar pantallas. Dejan de ser la fuente de la verdad
   * histórica.
   *
   * EL CONTRATO, para el que venga detrás: si tu pregunta lleva una fecha
   * adentro, la contesta una función de esta sección. No mires `cicloActual` ni
   * `capitalActual` para nada histórico.
   * ========================================================================*/

  /* Los cambios de corte que DE VERDAD ocurrieron, cada uno con el día en que
     ocurrió. Salen de los hechos: cada prórroga (de qué corte a cuál, y qué día
     se registró), el día en que se pactó el plan y cada cuota del plan que se
     fue pagando. */
  function cambiosDeCorte(p) {
    var cambios = [];
    lista(p && p.prorrogas).forEach(function (pr) {
      cambios.push({ desde: fechaFin(pr && pr.fecha),
                     de: fechaFin(pr && pr.ciclo),
                     a: fechaFin(pr && pr.nuevoCiclo) });
    });
    var e = entradaPlan(p), cuotas = cuotasPlan(p);
    if (cuotas.length) {
      /* 22-oct-2026 — el pacto de Joan guarda de qué fecha salió (`pacto.de`).
         Sin eso, un crédito sin prórrogas que se pactó no tenía `de` en
         ningún cambio, y corteOriginal tomaba la fecha pactada como si
         hubiera regido desde siempre. */
      var pac = (p.planPagos && p.planPagos.pacto && typeof p.planPagos.pacto === 'object') ? p.planPagos.pacto : null;
      cambios.push({ desde: fechaFin((e && e.fecha) || (p.planPagos && p.planPagos.creado)),
                     de: fechaFin(e && e.ciclo) || fechaFin(pac && pac.de),
                     a: fechaFin(cuotas[0] && cuotas[0].fecha) });
      for (var i = 0; i < cuotas.length - 1; i++) {
        if (!cuotas[i].pagado) continue;
        cambios.push({ desde: fechaFin(cuotas[i].fechaPagado) || fechaFin(cuotas[i].fecha),
                       de: fechaFin(cuotas[i].fecha),
                       a: fechaFin(cuotas[i + 1] && cuotas[i + 1].fecha) });
      }
    }
    return cambios.filter(function (c) { return c.desde || c.de || c.a; })
      .sort(function (x, y) { return String(x.desde).localeCompare(String(y.desde)); });
  }

  /* El corte ORIGINAL: el que le tocó al desembolsarse, antes de que nada lo
     moviera. La primera prórroga guarda de qué corte salió (`ciclo`), y el plan
     también; si no hubo ninguno de los dos, el corte de hoy nunca se movió. */
  function corteOriginal(p) {
    var cambios = cambiosDeCorte(p);
    for (var i = 0; i < cambios.length; i++) if (cambios[i].de) return cambios[i].de;
    return fechaFin(p && p.cicloPago) || fechaFin(p && p.cicloActual) ||
           fechaFin(p && p.fechaPago) || '';
  }

  /**
   * TODOS los cortes que este crédito tuvo, en orden, cada uno con el día DESDE
   * el que rigió. El primero rige desde siempre (`desde:''`).
   *
   * @returns {Array<{desde:string, corte:string}>}
   */
  function cortesDelCredito(p) {
    var cambios = cambiosDeCorte(p);
    var origen = corteOriginal(p);
    var hoyCorte = fechaFin(p && p.cicloActual);
    var linea = origen ? [{ desde: '', corte: origen }] : [];
    var actual = origen;
    cambios.forEach(function (c, i) {
      /* Una prórroga vieja puede no haber guardado a qué corte pasó. El dato
         igual está: es de dónde salió el cambio siguiente, y si es el último,
         el corte de hoy. */
      var destino = c.a || (cambios[i + 1] && cambios[i + 1].de) || hoyCorte || '';
      if (!destino || destino === actual) return;
      linea.push({ desde: c.desde || destino, corte: destino });
      actual = destino;
    });
    if (hoyCorte && hoyCorte !== actual) {
      // El resumen de hoy no cuadra con lo reconstruido: manda el resumen, pero
      // solo de la última fecha conocida en adelante. El pasado no se reescribe.
      var ultima = cambios.length ? cambios[cambios.length - 1].desde : '';
      linea.push({ desde: ultima || '', corte: hoyCorte });
    }
    return linea.length ? linea : [{ desde: '', corte: '' }];
  }

  /** El corte que REGÍA en una fecha dada. Nada de lo que pase después lo mueve. */
  function corteVigenteEn(p, instante) {
    var h = fechaFin(instante), linea = cortesDelCredito(p), corte = '';
    for (var i = 0; i < linea.length; i++) {
      if (!linea[i].desde || !h || linea[i].desde <= h) corte = linea[i].corte;
      else break;
    }
    return corte;
  }

  /** El día en que empezó el ciclo ABIERTO: el desembolso, o el del último
     cambio de corte. De acá sale sobre qué capital se causó el costo de hoy. */
  function inicioDelCiclo(p) {
    var linea = cortesDelCredito(p);
    var d = linea.length ? linea[linea.length - 1].desde : '';
    return d || fechaFin(p && p.fechaDesembolso) || '';
  }

  /** El capital que se debía en una fecha: el pedido menos los abonos hasta ese
     día. Un abono sin fecha se cuenta siempre (es un hecho de fecha perdida, y
     descontarlo es lo que ya hace `capitalActual`). */
  function capitalVigenteEn(p, fecha) {
    var hasta = fechaFin(fecha);
    var usado = lista(p && p.abonosCapital).reduce(function (s, a) {
      var f = fechaFin(a && a.fecha);
      return (!f || !hasta || f <= hasta) ? s + num(a && a.monto) : s;
    }, 0);
    /* 22-oct-2026 — y el capital que Joan perdonó hasta ese día, por la misma
       razón que capitalActual: perdonado, ya no se debe. */
    return Math.max(0, num(p && p.capital) - usado - capitalPerdonadoDe(p, hasta));
  }

  /** El capital sobre el que se causó el costo del ciclo abierto. */
  function capitalBaseDelCiclo(p) {
    return capitalVigenteEn(p, inicioDelCiclo(p));
  }

  /* Lo que el Panel congeló en el abono cuando lo registró (costo del ciclo y
     recargo corrido hasta ese día). Vale solo para el corte al que pertenece:
     cuando el ciclo se mueve, ese congelado ya se cobró con el corte viejo.
     Los abonos viejos no traen estos campos y devuelven `tiene:false`. */
  function causadoDelCiclo(p) {
    var ciclo = fechaFin(p && p.cicloActual);
    var c = { tiene: false, costo: 0, mora: 0, dias: 0, ciclo: ciclo };
    lista(p && p.abonosCapital).forEach(function (a) {
      if (!a || !ciclo || fechaFin(a.ciclo) !== ciclo) return;
      if (a.costoCausado == null && a.moraCausada == null) return;
      c.tiene = true;
      c.costo = Math.max(c.costo, num(a.costoCausado));
      c.mora = Math.max(c.mora, num(a.moraCausada));
      c.dias = Math.max(c.dias, num(a.diasMoraCausada));
    });
    return c;
  }

  /**
   * El recargo del 1% diario del ciclo abierto a una fecha, RECORRIDO DÍA A DÍA
   * sobre el capital que se debía cada día: los tramos anteriores a un abono
   * corren sobre el capital que HABÍA, y los posteriores sobre el que QUEDÓ.
   * Es justo en las dos direcciones — no se borra lo corrido, y tampoco se le
   * cobra mora al socio sobre plata que ya devolvió.
   */
  /**
   * EL TECHO DEL RECARGO DE UN CRÉDITO — 8 de octubre de 2026.
   *
   * Los créditos que nacen de una propuesta ACEPTADA con «Las condiciones de
   * este crédito» (app/calculadora-solicitud.js) le prometieron al cliente un
   * recargo por atraso de, como mucho, la tasa de mora más alta que permite la
   * ley, y que «si la ley baja ese tope, el recargo baja con él». El CRM, al
   * desembolsarlos, les pone `topeMoraEA` (el techo de usura del día en que se
   * aceptó). Aquí se cumple: la tasa diaria es la MENOR entre la del motor
   * (TASA_MORA_DIARIA), la de ese techo y —si la tabla de usura está cargada,
   * como en el CRM, que es el que cobra— la del techo del día en que se cobra.
   *
   * Los créditos sin `topeMoraEA` (todos los de antes) siguen exactamente
   * igual: devuelve null y el motor usa su tasa. Lo que se cobre a ESOS es una
   * decisión pendiente de Joan (RECETA-RETOMAR, «qué se cobra por mora»), no
   * de este archivo.
   *
   * @returns {number|null} la tasa DIARIA, o null si el crédito no tiene techo
   */
  function tasaMoraDe(p, fecha) {
    var ea = num(p && p.topeMoraEA);
    if (!(ea > 0)) return null;
    var C = (typeof globalThis !== 'undefined' && globalThis.CreditosPublicables) || null;
    var f = fechaFin(fecha) || hoyISO();
    if (C && typeof C.topeDeReferencia === 'function') {
      try {
        var hoy = C.topeDeReferencia(f);
        if (hoy && Number(hoy.tope) > 0) ea = Math.min(ea, Number(hoy.tope));
      } catch (e) { /* sin tabla para ese día: queda el techo de la aceptación */ }
    }
    /* Cinco decimales hacia abajo: la misma cuenta que publica la condición
       (calculadora-solicitud.js, topeDeMora). */
    var diaria = Math.floor((Math.pow(1 + ea, 1 / 365) - 1) * 1e5) / 1e5;
    return Math.min(M.TASA_MORA_DIARIA, diaria);
  }
  function opcionesDeMora(p, fecha) {
    var t = tasaMoraDe(p, fecha);
    return t === null ? undefined : { tasaDiaria: t };
  }

  function moraDelCiclo(p, hasta) {
    if (!p || p.pagado) return 0;
    var corte = corteDelCredito(p), fin = fechaFin(hasta) || hoyISO();
    if (!corte || fin <= corte) return 0;
    var om = opcionesDeMora(p, fin);
    var cuota = cuotaPlanActual(p);
    /* La de la cuota que sigue, con sus abonos (16-oct-2026). Sin abonos es la
       misma cuenta de siempre: el 1% sobre el capital de la cuota desde el día
       siguiente a su fecha. */
    if (cuota) return moraPendienteDeCuota(p, cuota, fin);

    var base = capitalVigenteEn(p, corte), cursor = corte, total = 0;
    lista(p.abonosCapital).map(function (a) {
      return { f: fechaFin(a && a.fecha), m: num(a && a.monto) };
    }).filter(function (a) {
      return a.f && a.f > corte && a.f <= fin;
    }).sort(function (x, y) {
      return x.f.localeCompare(y.f);
    }).forEach(function (a) {
      total += M.recargoPorMora(base, diasCal(cursor, a.f), om);
      base = Math.max(0, base - a.m);
      cursor = a.f;
    });
    total += M.recargoPorMora(base, diasCal(cursor, fin), om);

    /* Y lo que el Panel congeló manda como PISO: si un día se guardó un recargo
       mayor del que sale del recorrido, lo ya causado no se baja. */
    var c = causadoDelCiclo(p);
    if (c.tiene) {
      total = Math.max(total, M.recargoPorMoraDesde(c.mora, c.dias, capitalDelCiclo(p),
                                                    diasCal(corte, fin), om));
    }
    return total;
  }

  /**
   * LA CUENTA DEL CICLO, EN UN SOLO SITIO. El Panel y la app preguntan ESTO;
   * ninguno de los dos vuelve a sumar capital + costo + recargo por su cuenta,
   * que es lo que los tenía diciendo 80.001 y "$1" del mismo crédito el mismo
   * día.
   *
   * @param {object} p       el crédito del Panel
   * @param {string} [fecha] el día en que se cobra; por defecto hoy
   * @returns {{corte, fecha, capital, costo, tasa, dias_mora, recargo_mora,
   *            pago_a_tiempo, costo_total_pagado, total_a_pagar,
   *            garantia_generada, causado:{costo,mora,dias}}}
   */
  function liquidarCiclo(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    var corte = corteDelCredito(p);
    if (!p || p.pagado) {
      return { corte: corte || null, fecha: f, capital: 0, costo: 0, tasa: tasaDelCiclo(p),
        dias_mora: 0, recargo_mora: 0, pago_a_tiempo: true, costo_total_pagado: 0,
        total_a_pagar: 0, garantia_generada: 0, causado: { costo: 0, mora: 0, dias: 0 } };
    }
    var capital = capitalDelCiclo(p);
    var costo = Math.round(K(p, f));
    var mora = Math.round(moraDelCiclo(p, f));
    var dias = (corte && f > corte) ? diasCal(corte, f) : 0;
    /* 5-ago-2026 §4-bis — llegar en fecha y acreditar el factor completo dejaron
       de ser lo mismo. Si este crédito YA estuvo en mora, el corte que se está cumpliendo
       es uno que compró una prórroga: acredita a la mitad. `pago_a_tiempo` sigue
       siendo lo que dice —el pago llega dentro del corte— porque de él salen el
       recargo y las pantallas; el factor de la garantía es otra pregunta. */
    var vieneDeMora = veniaDeMora(p, corte);
    var acredita = M.cuentaComoPuntualParaGarantia({
      pagado_en_fecha: dias === 0, credito_estuvo_en_mora: vieneDeMora });
    return {
      corte: corte || null,
      fecha: f,
      capital: capital,
      costo: costo,
      tasa: tasaDelCiclo(p),
      dias_mora: dias,
      recargo_mora: mora,
      pago_a_tiempo: dias === 0,
      // Para que el Panel y la app puedan preguntarlo en vez de deducirlo: el
      // motor lo recibe como `credito.estuvo_en_mora` (§4-bis).
      estuvo_en_mora: vieneDeMora,
      acredita_en_fecha: acredita,
      costo_total_pagado: costo + mora,
      total_a_pagar: capital + costo + mora,
      /* 26-sep-2026: del COSTO, no de costo+mora. La mora es de la empresa en
         los créditos pedidos desde el 27-sep; en los de antes sigue dejando lo
         que dejaba (MotorReglas.garantiaDeMoraPagada). */
      garantia_generada: M.acumularGarantia(costo, acredita) + M.garantiaDeMoraPagada(mora, fechaDelCredito(p)),
      /* Lo ya causado a esta fecha, para que quien quiera liquidar en OTRO día
         se lo pase a MotorReglas.liquidarCredito como {recargoCausado,
         diasCausados} y no vuelva a recalcular el 1% desde cero. */
      causado: { costo: costo, mora: mora, dias: dias }
    };
  }

  /* Lo cobrado por las cuotas del plan que ya se pagaron (costo + recargo), y
     la entrada: lo que se cobró el día que se pactó (costo del ciclo y el
     recargo ya causado, que el plan tampoco borra). */
  function entradaPlan(p) { return (p && p.planPagos && p.planPagos.entrada) || null; }
  function costoCobradoPlan(p) {
    // Por pedazos (16-oct-2026): los abonos a una cuota que todavía no se cierra también entraron.
    return cuotasPlan(p).reduce(function (t, c) {
      return t + piezasDeCuota(p, c).reduce(function (s, x) { return s + x.costo + x.mora; }, 0);
    }, 0) + num(entradaPlan(p) && entradaPlan(p).monto);
  }
  /**
   * La garantía que dejó el plan de pagos: la entrada (que se acredita como una
   * prórroga, porque es lo mismo: costo del ciclo + el recargo ya causado) y
   * cada cuota ya pagada.
   *
   * 5-ago-2026 §4-bis — LA CUOTA DEL PLAN NO SE ACREDITA AL FACTOR COMPLETO. Un
   * plan de pagos existe justamente porque el crédito ya se atrasó y se le acabaron las
   * prórrogas: acreditarle a sus cuotas el factor del que nunca se atrasó era el
   * mismo regalo de la prórroga encadenada por otra puerta (medido: 374.000
   * pagados dejaban 564.300 de garantía contra los 492.300 de saldar 494.000).
   * La cuenta se rehace desde los HECHOS de la cuota —su costo, su recargo y el
   * día en que se pagó—, que es lo mismo que hace liquidarCiclo cuando el Panel
   * la cobra. Una cuota vieja que no guardó su costo conserva lo que se le
   * acreditó: sin el dato no hay nada que recalcular.
   */
  function garantiaGanadaCuotaPlan(p, c) {
    if (!c) return 0;
    if (c.pagado && c.costo == null) return num(c.garantiaGenerada);
    /* 26-sep-2026: el costo de la cuota, y su recargo solo si el crédito se
       pidió antes del 27-sep. Sumaba `acumularGarantia(c.recargo, false)`, que
       con el 80/20 acreditaba el 80% de la mora — contra la decisión de Joan de
       que la mora no genera garantía. Los créditos de antes siguen con su regla
       (punto 12 de los términos; MotorReglas.FECHA_MORA_SIN_GARANTIA).
       16-oct-2026 — y por PEDAZOS (piezasDeCuota): el costo que entró en un
       abono a la cuota deja su garantía el día que entró, aunque la cuota
       todavía no se cierre, porque ya es ganancia y el 80% de la ganancia es
       del socio. Una cuota sin abonos es un solo pedazo y da lo de siempre. */
    var corte = fechaFin(c.fecha), estuvo = veniaDeMora(p, corte), fechaCred = fechaDelCredito(p);
    return piezasDeCuota(p, c).reduce(function (t, x) {
      return t + M.acumularGarantia(x.costo, M.cuentaComoPuntualParaGarantia({
               pagado_en_fecha: piezaEnFecha(c, x), credito_estuvo_en_mora: estuvo })) +
             M.garantiaDeMoraPagada(x.mora, fechaCred);
    }, 0);
  }
  function garantiaGanadaPlan(p) {
    return cuotasPlan(p).reduce(function (t, c) {
      return t + garantiaGanadaCuotaPlan(p, c);
    }, 0) + (entradaPlan(p) ? garantiaGanadaProrroga(entradaPlan(p), p) : 0);
  }
  /* `pr.monto` es lo que el socio pagó por la prórroga. Desde el 3-ago-2026 el
     Panel le cobra el costo del ciclo MÁS el recargo de mora ya causado, y
     guarda el recargo aparte en `pr.mora` para no perder de vista de qué está
     hecho ese monto. Las prórrogas viejas no traen `mora`: son todas costo. */
  /* 26-sep-2026 — el día en que se PIDIÓ el crédito: es lo que decide si su
     mora deja garantía (MotorReglas.FECHA_MORA_SIN_GARANTIA; punto 12 de los
     términos). Sin fecha devuelve null, y el motor lo lee como crédito de antes:
     todo crédito que crean el Panel, el espejo o una solicitud la graba. */
  function fechaDelCredito(p) { return fechaFin(p && p.fechaDesembolso) || null; }
  function moraDeProrroga(pr) {
    return Math.min(Math.max(0, num(pr && pr.mora)), Math.max(0, num(pr && pr.monto)));
  }
  function costoDeProrroga(pr) { return Math.max(0, num(pr && pr.monto) - moraDeProrroga(pr)); }
  /* ¿Se registró esta prórroga EN FECHA? Es lo que decide el factor de su costo,
     y se congela el día en que se paga: nada de lo que pase después la mueve.
     El Panel lo graba en `aTiempo` desde el 4-ago-2026. Para todo lo anterior se
     deduce de lo único que quedó guardado: si la prórroga trajo recargo de mora,
     es porque el corte ya había pasado. Las prórrogas viejas no traen `mora`, así
     que se leen como puntuales y conservan el factor completo que ya se les
     acreditó —la garantía ya ganada no se borra nunca, ni hacia atrás. */
  function prorrogaFueATiempo(pr) {
    if (pr && typeof pr.aTiempo === 'boolean') return pr.aTiempo;
    return moraDeProrroga(pr) === 0;
  }
  /**
   * ¿Esta prórroga acredita al factor completo? (§4-bis del motor, 5-ago-2026)
   *
   * Llegar en fecha ya no alcanza: si el crédito YA estuvo en mora antes de esta
   * prórroga, el ciclo que se está pagando es el que la prórroga ANTERIOR le
   * compró, no una quincena limpia, y acredita a la mitad. Ahí estaba el negocio
   * de encadenar plazo: la primera prórroga ponía el reloj de mora en cero y la
   * segunda cobraba el factor completo del que nunca se atrasó.
   *
   * El crédito es OPCIONAL a propósito: sin él la respuesta es la de siempre (la
   * puntualidad congelada en el dato). Así el Panel —que hoy llama con la
   * prórroga sola— sigue funcionando sin tocarlo, y la garantía del socio, que
   * sale de garantiaGanadaCredito y sí tiene el crédito en la mano, ya sale con
   * la regla nueva. Cuando crm.html pase el crédito, las dos pantallas dirán
   * exactamente el mismo número otra vez.
   */
  function prorrogaAcreditaEnFecha(pr, credito) {
    return M.cuentaComoPuntualParaGarantia({
      pagado_en_fecha: prorrogaFueATiempo(pr),
      // El ciclo que esta prórroga está pagando es el que termina en `pr.ciclo`.
      credito_estuvo_en_mora: !!credito && veniaDeMora(credito, pr && pr.ciclo)
    });
  }
  /* La garantía que dejó UNA prórroga: el COSTO con el factor de puntualidad de
     la prórroga, y nada de la mora. Es la ÚNICA cuenta: el Panel la muestra en el
     confirm con esta misma función, así que Joan no puede ver un número y el
     socio otro.
     26-sep-2026 — sumaba también la mora «siempre a la mitad». Con el 80/20 eso
     acreditaba el 80% de la mora, y medido: una prórroga de 120.000 de costo y
     120.000 de mora dejaba 192.000 de garantía, contra 96.000 si ese mismo día se
     saldaba con la misma plata. Prorrogar rendía el DOBLE que pagar. La mora es
     una sanción, no un precio: decisión de Joan del 23-sep.
     Y en los créditos pedidos ANTES del 27-sep la mora de la prórroga sigue
     sumando lo que sumaba: la garantía se recalcula desde el historial, y sin
     esto la regla nueva les quitaba a los socios garantía ya ganada y les
     cambiaba las reglas a créditos ya entregados (decisión de Joan del 26-sep;
     ver MotorReglas.FECHA_MORA_SIN_GARANTIA). Sin el crédito no hay con qué
     saberlo, y se aplica la regla de hoy: cero. */
  function garantiaGanadaProrroga(pr, credito) {
    return M.acumularGarantia(costoDeProrroga(pr), prorrogaAcreditaEnFecha(pr, credito)) +
           (credito ? M.garantiaDeMoraPagada(moraDeProrroga(pr), fechaDelCredito(credito)) : 0);
  }
  function gananciaCobrada(p) {
    return lista(p.prorrogas).reduce(function (s, pr) { return s + num(pr.monto); }, 0) +
           costoCobradoPlan(p) +
           (p.pagado ? num(p.gananciaPago) : 0);
  }
  /* 22-oct-2026 — lo perdonado NO es capital recuperado: no volvió. Sin la
     resta, «Ingresos totales» del tablero y lo que la app le dice al cliente
     que ya pagó (`abonado`) contaban plata que nunca entró. */
  function capitalRecuperadoDe(p) {
    return Math.max(0, (p.pagado ? num(p.capital) : (num(p.capital) - capitalActual(p))) - capitalPerdonadoDe(p));
  }
  function esPuntual(p) { return !!(p.pagado && p.fechaPagado && p.cicloPago && p.fechaPagado <= p.cicloPago); }

  /* ------------------------------------- puntual PARA SUBIR DE NIVEL -------
     4-ago-2026 — LA PRÓRROGA LAVABA EL HISTORIAL.
     esPuntual() compara la fecha de pago contra el corte, y la prórroga corre
     el corte al FUTURO. O sea que el que prorrogaba y pagaba al día siguiente
     quedaba registrado como PAGADO EN FECHA por muy atrasado que estuviera.
     Medido: cinco créditos pagados 15 días tarde cada uno, lavados con
     prórroga, subían al socio de bronce (367.500 de cupo) a ORO (1.062.500).

     La regla la pone el motor (cuentaComoPuntual) y separa las dos cosas que la
     promesa del producto exige a la vez:
       · NO SE LE QUITA NADA — esPuntual() sigue mandando en la GARANTÍA, así
         que lo que pagó le suma igual, y el nivel no baja nunca.
       · NO SE LE REGALA NADA — el escalón de nivel es el premio del que pagó en
         fecha; un crédito que necesitó prórroga o plan de pagos no lo gana.
     Por eso son dos funciones y no una: acá abajo se decide el NIVEL, y solo
     el nivel. */
  /* Las prórrogas y el plan que YA EXISTÍAN en una fecha. `p.prorrogas` es la
     lista de HOY, y preguntarle por el pasado es exactamente el error que esta
     sección vino a cerrar: una prórroga registrada en julio no puede cambiar lo
     que el socio tenía en mayo. Sin fecha (dato viejo) se cuenta siempre, que es
     lo que ya hace capitalVigenteEn con los abonos. */
  function prorrogasHasta(p, hasta) {
    var h = fechaFin(hasta);
    return lista(p && p.prorrogas).filter(function (pr) {
      var f = fechaFin(pr && pr.fecha);
      return !h || !f || f <= h;
    });
  }
  function tienePlanHasta(p, hasta) {
    /* 16-oct-2026 — el crédito a cuotas NO es un plan de rescate: lo pactó Joan
       el día del desembolso, no lo necesitó el socio. Pagado en fecha cuenta
       como pagado en fecha; si se atrasa una cuota, estuvoEnMora lo ve por la
       línea de tiempo y por el recargo de esa cuota, igual que en cualquier
       crédito. Sin esto la racha se rompía el día del desembolso. */
    if (!tienePlan(p) || esPlanDeAlta(p)) return false;
    var h = fechaFin(hasta), e = entradaPlan(p);
    var f = fechaFin((e && e.fecha) || (p.planPagos && p.planPagos.creado));
    return !h || !f || f <= h;
  }
  /** @param {string} [hasta] el instante en que se pregunta; sin él, hoy. */
  function esPuntualParaNivel(p, hasta) {
    return M.cuentaComoPuntual({
      pagado_en_fecha: esPuntual(p),
      prorrogas_usadas: prorrogasHasta(p, hasta).length,
      plan_de_pagos: tienePlanHasta(p, hasta)
    });
  }

  /* ===================== EL NIVEL ES UN MÁXIMO HISTÓRICO ====================
     4-ago-2026 — EL NIVEL BAJABA POR USAR UNA PRÓRROGA PAGADA EN FECHA.

     El arreglo de esta misma mañana (esPuntualParaNivel) cerró bien un agujero
     —la prórroga lavaba el historial y hacía subir al moroso— y abrió el
     contrario: los tres contadores del nivel se recalculan desde CERO en cada
     carga, así que un crédito con prórroga resetea la racha y los meses sin
     mora, y el socio RETROCEDE.

     Medido: 10 créditos de 200.000 pagados todos en fecha → platino, cupo
     1.140.000. Se agrega el crédito 11 con UNA prórroga registrada a tiempo y
     pagado en el corte nuevo: aTiempo 10, racha 0, meses 1 → PLATA, cupo
     904.000. Pagó 40.000 de más y perdió 452.000 de cupo. Dos escalones abajo
     por un pago que hizo puntual. Eso rompe la promesa central del producto.

     El piso que debía impedirlo era `s.nivelSocio`, y ESE CAMPO NO LO ESCRIBE
     NADIE: ni el Panel, ni el puente, ni la app. Solo existía en una prueba que
     se lo ponía a mano. Un piso que hay que acordarse de escribir es un piso que
     no existe: por eso acá no se agrega ningún campo nuevo, se DERIVA.

     LA FORMA. Un nivel que "nunca baja" es, literalmente, el máximo de los
     niveles que el socio tuvo alguna vez. Y el historial ya contiene ese dato:
     se recorren los instantes en que su cuenta cambió —cada pago y cada fecha
     de corte, más hoy—, en cada uno se calculan los tres contadores TAL COMO
     ESTABAN ESE DÍA, y se deriva el nivel de ese día. El nivel de hoy es el más
     alto de todos. El último instante es siempre HOY con el historial completo,
     así que el nivel actual entra en la cuenta como uno más.

     Las dos mitades de la promesa, a la vez:
       · NO SE LE QUITA NADA — cada nivel de la lista es un nivel que el socio
         TUVO de verdad, en una fecha real y con los créditos que ya tenía. No se
         puede caer de él porque no se le está regalando: se le está recordando.
       · NO SE LE REGALA NADA — cada instante usa las mismas reglas de siempre
         (esPuntualParaNivel para pagos y racha), sobre un subconjunto de su
         historia y en una fecha pasada. Un crédito con prórroga NO cuenta en
         ningún instante: no puede hacer subir a nadie, solo puede dejar de
         hacerlo subir. Y como el máximo se toma sobre instantes anteriores, un
         crédito nuevo jamás mejora el pasado — únicamente el presente.

     ¿DE QUÉ FORMA ALGUIEN PUEDE SALIR GANANDO POR NO PAGAR, AHORA?
     Por una sola, y por eso va cerrada acá abajo: `meses_sin_mora` se medía
     desde el último atraso CURADO, sin mirar si el socio está atrasado AHORA.
     Un crédito abierto y vencido no reseteaba nada, así que el contador seguía
     corriendo durante la mora y los meses de atraso empujaban al socio hacia
     platino. Con el máximo histórico eso además quedaría clavado para siempre.
     Ahora, en cada instante, si había un crédito vencido y sin pagar los meses
     SIN MORA valen cero — que es lo que dice el nombre del contador. Lo que ya
     había ganado antes de atrasarse se lo queda igual: está en el máximo. */

  /* El corte que le rige HOY a un crédito. Es el resumen del presente y solo
     sirve para el presente: para cualquier fecha pasada se pregunta
     corteVigenteEn(p, instante), que recorre la línea de tiempo. */
  function corteDelCredito(p) {
    /* 16-oct-2026 — con cuotas, el corte ES la fecha de la cuota que sigue. Se
       deriva en vez de confiar en `cicloActual`, que es un resumen que hay que
       acordarse de mover: si una reprogramación lo dejara atrás, la mora
       correría desde una fecha que ya no es la de la cuota. */
    var c = (p && !p.pagado) ? cuotaPlanActual(p) : null;
    if (c && fechaFin(c.fecha)) return fechaFin(c.fecha);
    return fechaFin(p && p.cicloActual) || fechaFin(p && p.cicloPago) ||
           fechaFin(p && p.fechaPago) || '';
  }
  /**
   * ¿Estaba ESTE crédito vencido y sin pagar en la fecha `hasta`?
   *
   * CONTRATO: la respuesta NO CAMBIA NUNCA por algo que pase después. Una
   * prórroga registrada hoy mueve el corte de hoy en adelante y ni toca lo que
   * pasó en junio. Antes leía `p.cicloActual` y por eso la prórroga borraba la
   * mora hacia atrás — el agujero por el que dejar la deuda rendía más que
   * pagarla.
   *
   * En la fecha misma del corte todavía no hay mora: ese es el día de pagar, no
   * el primero de atraso. Un crédito pagado sin fecha de pago no se acusa.
   */
  function estabaVencido(p, hasta) {
    var h = fechaFin(hasta);
    if (!h) return false;
    var corte = corteVigenteEn(p, h);
    if (!corte || h <= corte) return false;
    if (!p.pagado) return true;
    var fp = fechaFin(p.fechaPagado);
    return !!fp && fp > h;
  }
  /* La mora que la LÍNEA DE TIEMPO alcanza a ver: el último día, hasta `hasta`,
     en que `estabaVencido` dice que sí. Una mora termina el día en que el corte
     se mueve o el día en que se paga —los dos son hechos guardados—, así que los
     únicos días que hay que probar son el día anterior a cada uno de esos hechos
     y `hasta` mismo. */
  function ultimoDiaDeMoraEnLaLinea(p, h) {
    var cand = [h];
    cortesDelCredito(p).forEach(function (t) { if (t.desde) cand.push(diaAntes(t.desde)); });
    if (p && p.pagado) {
      var fp = fechaFin(p.fechaPagado);
      if (fp) cand.push(diaAntes(fp));
    }
    cand = cand.filter(function (d) { return d && d <= h; }).sort();
    for (var i = cand.length - 1; i >= 0; i--) if (estabaVencido(p, cand[i])) return cand[i];
    return '';
  }

  /* Todo movimiento que pudo traer recargo de mora, con los dos hechos que
     importan: de qué corte venía (`ciclo`) y qué día lo curó (`fecha`). Es la
     misma lista para las dos preguntas —¿hubo mora? ¿cuándo terminó?—, así que
     se arma una sola vez y en un solo lugar. */
  function movimientosConMora(p) {
    var movs = lista(p && p.prorrogas).map(function (pr) {
      return { ciclo: fechaFin(pr && pr.ciclo), fecha: fechaFin(pr && pr.fecha),
               mora: moraDeProrroga(pr), aTiempo: pr && pr.aTiempo };
    });
    var e = entradaPlan(p);
    if (e) {
      movs.push({ ciclo: fechaFin(e.ciclo),
                  fecha: fechaFin(e.fecha) || fechaFin(p.planPagos && p.planPagos.creado),
                  mora: moraDeProrroga(e), aTiempo: e.aTiempo });
    }
    /* Una cuota del plan pagada con recargo también es mora cobrada. El recargo
       va con su `monto` porque moraDeProrroga lo topa contra el monto: sin él se
       leería como cero y la prueba se perdería. */
    cuotasPlan(p).forEach(function (q) {
      if (!q) return;
      if (!q.pagado) {
        /* 16-oct-2026: un abono a una cuota vencida que pagó mora también es
           prueba de que hubo mora, aunque la cuota siga abierta. */
        abonosDeCuota(p, q.n).forEach(function (a) {
          if (num(a.moraPagada) > 0) movs.push({ ciclo: fechaFin(q.fecha), fecha: fechaFin(a.fecha), mora: num(a.moraPagada) });
        });
        return;
      }
      movs.push({ ciclo: fechaFin(q.fecha), fecha: fechaFin(q.fechaPagado),
                  mora: moraDeProrroga({ mora: num(q.recargo),
                                         monto: num(q.costo) + num(q.recargo) }) });
    });
    /* Y el pago final del crédito: si el Panel le cobró recargo, hubo mora. Es
       el mismo hecho que los de arriba, guardado en otro campo.
       2-sep-2026 — `moraCausada` entra de respaldo: desde que existen los
       descuentos (espejo 14-ago, Panel 2-sep), `recargoMora` es la mora que
       ENTRÓ, y un perdón del 100% la deja en $0 borrando la única prueba de que
       hubo mora. La causada quedó guardada aparte justo para esto: perdonar la
       plata no puede lavar la historia. */
    if (p && p.pagado && (num(p.recargoMora) > 0 || num(p.moraCausada) > 0)) {
      movs.push({ ciclo: fechaFin(p.cicloPago), fecha: fechaFin(p.fechaPagado),
                  mora: num(p.recargoMora) > 0 ? num(p.recargoMora) : num(p.moraCausada) });
    }
    return movs.filter(function (m) { return m.mora > 0 || m.aTiempo === false; });
  }

  /**
   * EL PUNTO CIEGO DE UN DÍA, tapado donde tenía que estar tapado — 6-ago-2026.
   *
   * La línea de tiempo NO PUEDE VER el tramo vencido cuando el movimiento que lo
   * cura se registra el mismo día en que la mora arranca: el día del corte no es
   * mora y el día siguiente ya rige el corte nuevo, así que el tramo queda vacío
   * —aunque el socio haya pagado el 1% de ese día.
   *
   * Ese día existe y está guardado: si se cobró un recargo, hubo mora. El último
   * día en que la hubo es el anterior al que la curó, y nunca antes del primer
   * día de mora (`ciclo` + 1) — que es justo el caso de un solo día, donde los
   * dos son el mismo día y la línea de tiempo se queda con las manos vacías.
   *
   * @returns {string} '' si no hay ningún recargo cobrado hasta `hasta`.
   */
  function ultimoDiaDeMoraCobrada(p, hasta) {
    var h = fechaFin(hasta);
    if (!h) return '';
    var ultimo = '';
    movimientosConMora(p).forEach(function (m) {
      var primero = m.ciclo ? diaDespues(m.ciclo) : '';
      var curo = m.fecha ? diaAntes(m.fecha) : '';
      var dia = curo > primero ? curo : primero;
      if (dia && dia <= h && dia > ultimo) ultimo = dia;
    });
    return ultimo;
  }

  /**
   * El ÚLTIMO día, hasta `hasta`, en que este crédito estuvo en mora. '' si
   * nunca lo estuvo. ES LA ÚNICA VERDAD SOBRE LA MORA de este archivo: la usan
   * los tres consumidores (el factor de la garantía por el §4-bis, el estado
   * para el nivel y los hitos de meses_sin_mora), y por eso junta las DOS
   * pruebas que existen y se queda con la más reciente.
   *
   * Es lo que le faltaba a `meses_sin_mora` para significar lo que dice su
   * nombre: se medía desde el último atraso CURADO POR UN PAGO, así que una
   * mora de cuatro meses tapada con una prórroga no reseteaba nada y los meses
   * de atraso empujaban al socio hacia platino.
   *
   * 6-ago-2026 — Y LE FALTABA LA SEGUNDA PRUEBA. Hasta hoy había dos caminos:
   * el factor de la garantía preguntaba `estuvoEnMora() || moraYaCobrada()` y
   * los contadores del nivel solo `estuvoEnMora()`. O sea que el punto ciego de
   * un día estaba tapado para la garantía y abierto para el nivel: MEDIDO, con
   * 1 solo día de mora, prorrogar (42.000, y se queda los 200.000 de capital)
   * compraba PLATINO dos meses antes que pagar (los mismos 42.000 más devolver
   * el capital), y como el nivel no baja la ventaja era permanente. Con 2 días
   * de mora no pasaba: eso es lo que prueba que era un defecto y no una
   * política. Dos caminos que hay que acordarse de mantener iguales terminan
   * siempre así, y este proyecto ya lo pagó tres veces. Ahora hay uno.
   */
  function ultimoDiaDeMora(p, hasta) {
    var h = fechaFin(hasta);
    if (!h) return '';
    var enLaLinea = ultimoDiaDeMoraEnLaLinea(p, h);
    var cobrada = ultimoDiaDeMoraCobrada(p, h);
    return cobrada > enLaLinea ? cobrada : enLaLinea;
  }

  /* =================== LA REGLA ÚNICA DE LA MORA — 5-ago-2026 ===============
   * EL NIVEL PREMIABA AL QUE NO PAGA, Y ERA POR UNA LÍNEA.
   *
   * `contadoresDeNivel` calculaba la racha y los pagos a tiempo recorriendo
   * SOLO LOS CRÉDITOS PAGADOS. Un crédito vencido y sin pagar no está en esa
   * lista, así que no podía romper nada; uno pagado tarde sí. De ahí salía toda
   * la inversión del incentivo:
   *
   *   MEDIDO. Socio con 10 quincenas limpias y el crédito 11 de 200.000 vencido
   *   desde el 31-mar (127 días). Pagando los 494.000: racha 0. Dejando la
   *   prórroga y quedándose el capital (294.000): racha 10. Devolver 200.000 de
   *   capital no compraba un peso de garantía, de cupo ni de respaldo, y en la
   *   racha dejaba PEOR al que paga.
   *
   *   Y con esto el nivel entero se daba vuelta: 4 puntuales + el 5 vencido + 2
   *   puntuales después. Pagando el 5 (364.000) → a_tiempo 6, racha 2 → PLATA,
   *   cupo 619.600. Prorrogándolo (164.000) → a_tiempo 6, racha 6 → ORO, cupo
   *   774.500. Misma garantía: pagó 200.000 más y quedó un escalón abajo. Pasaba
   *   en 12 de 20 combinaciones barridas.
   *
   * EL GUARDIÁN QUE HABÍA ERA UN PARCHE POR REQUISITO. `enMora` apagaba solo
   * `meses_sin_mora` —requisito de platino— y no tocaba `racha` (requisito de
   * oro) ni `a_tiempo`. Tapaba uno de los tres y por eso dejaba dos abiertos.
   * Agregar dos guardianes más habría sido repetir el error.
   *
   * ASÍ QUE HAY UNA SOLA REGLA, ES ESTA, Y LOS TRES CONTADORES SALEN DE ELLA:
   * ¿cómo estaba ESTE crédito, para el nivel, en tal instante? Tres respuestas
   * posibles y nada más. El dato que faltaba ya existía —`estabaVencido` y
   * `ultimoDiaDeMora` recorren la línea de tiempo y no se mueven cuando se
   * registra una prórroga después—: los contadores simplemente nunca le
   * preguntaban por los créditos NO PAGADOS.
   *
   * 6-ago-2026 — Y LA MORA TENÍA QUE SER UNA SOLA VERDAD TAMBIÉN. La regla única
   * quedó bien pero se apoyaba en una mora que se preguntaba de dos formas: el
   * factor de la garantía sumaba la línea de tiempo MÁS los recargos ya cobrados,
   * y el nivel solo la línea de tiempo. El punto ciego de un día quedó tapado en
   * uno y abierto en el otro (ver ultimoDiaDeMora). Ahora las dos pruebas viven
   * dentro de `ultimoDiaDeMora` y los tres consumidores preguntan lo mismo: no
   * queda ningún camino que haya que acordarse de mantener igual.
   * ========================================================================*/

  /**
   * ¿Este crédito estuvo en mora en algún momento hasta `hasta`? La versión
   * "alguna vez" de `estabaVencido`, y la que necesita el nivel: una mora que
   * se tapó con una prórroga sigue habiendo existido. `ultimoDiaDeMora` es la
   * verdad única —línea de tiempo Y recargos cobrados—, así que devuelve '' solo
   * si nunca la hubo.
   */
  function estuvoEnMora(p, hasta) {
    return !!ultimoDiaDeMora(p, hasta);
  }

  /**
   * ¿Este crédito YA venía de una mora cuando arrancó el ciclo que termina en
   * `corte`? Es la pregunta del §4-bis del motor —la que decide si un pago
   * acredita completo o a la mitad— y se mide JUSTO ANTES de ese corte, no el día
   * del pago, por una razón que ya costó una ronda:
   *
   *   la puntualidad del propio ciclo la sigue decidiendo su dato CONGELADO
   *   (`pr.aTiempo`, el recargo de la cuota, esPuntual del pago final).
   *
   * Si esto mirara hasta el día del pago, estaría recalculando esa misma
   * puntualidad desde la línea de tiempo y le pasaría por encima al dato
   * guardado —justo lo que el 4-ago se decidió no hacer para no borrar garantía
   * ya acreditada. Acá se agrega SOLO lo que pasó antes: la mora de un ciclo
   * ANTERIOR, la que la prórroga tapó y el reloj de mora había puesto en cero.
   *
   * 6-ago-2026 — Y ES UNA SOLA PREGUNTA, no dos sumadas con un `||`: esa era la
   * forma del defecto. `estuvoEnMora` ya trae las dos pruebas adentro. El ciclo
   * PROPIO queda afuera solo, sin excepción escrita a mano, porque su mora no
   * puede haberse curado antes de su propio corte: su hito cae siempre después
   * del límite.
   */
  function veniaDeMora(p, corte) {
    return estuvoEnMora(p, diaAntes(fechaFin(corte)));
  }

  /**
   * EL ESTADO DE UN CRÉDITO PARA EL NIVEL en un instante. Es la regla única.
   *
   *   'gana'    pagado, en fecha, sin prórroga ni plan y sin haber estado nunca
   *             en mora: suma un pago a tiempo y suma a la racha.
   *   'rompe'   estuvo en mora, o pagó tarde, o necesitó prórroga o plan de
   *             pagos. No suma y ROMPE la racha, esté pagado o no: deber la
   *             plata no puede valer menos que haberla pagado tarde.
   *   'abierto' todavía no le llegó el corte y no le pasó nada: ni suma ni
   *             rompe. Un crédito recién desembolsado no le borra la racha a
   *             nadie.
   *
   * Que 'rompe' no se cure NUNCA es la mitad que faltaba: la prórroga mueve el
   * corte al futuro, así que sin el "alguna vez" el crédito volvía a 'abierto'
   * al día siguiente y la racha se recomponía sola. Lo que no se cura es el
   * escalón; la garantía ya ganada sigue intacta y el nivel sigue sin bajar
   * (nivelDelSocio toma el máximo histórico).
   */
  function estadoParaNivel(p, hasta) {
    var pagado = !!(p && p.pagado) && (fechaFin(p.fechaPagado) || hasta) <= hasta;
    if (estuvoEnMora(p, hasta)) return 'rompe';
    if (pagado) return esPuntualParaNivel(p, hasta) ? 'gana' : 'rompe';
    // Sin pagar y sin mora: si ya necesitó prórroga o plan, tampoco gana el
    // escalón —y no puede esperar a estar pagado para dejar de ganarlo, o
    // prorrogar volvería a rendir más que pagar mientras el crédito esté abierto.
    if (prorrogasHasta(p, hasta).length || tienePlanHasta(p, hasta)) return 'rompe';
    return 'abierto';
  }

  /* Los tres contadores del nivel TAL COMO ESTABAN en la fecha `hasta`, los tres
     derivados del estado de cada crédito y de nada más.
     `ps` son todos los créditos del socio ordenados por desembolso. */
  function contadoresDeNivel(ps, hasta) {
    var estados = ps.map(function (p) { return estadoParaNivel(p, hasta); });
    var aTiempo = 0;
    for (var i = 0; i < estados.length; i++) if (estados[i] === 'gana') aTiempo++;
    /* La racha: los últimos seguidos que ganaron. Los abiertos se saltan (no
       hay nada que juzgar todavía) y el primer 'rompe' la corta —el vencido sin
       pagar igual que el pagado tarde. */
    var racha = 0;
    for (var j = estados.length - 1; j >= 0; j--) {
      if (estados[j] === 'abierto') continue;
      if (estados[j] !== 'gana') break;
      racha++;
    }
    /* Desde cuándo lleva sin mora: desde el último hito de los créditos que
       rompieron. El hito es el último día en que el crédito estuvo vencido —una
       mora termina el día en que el corte se mueve o el día en que se paga— y,
       para el que no llegó a estar vencido pero tampoco ganó el escalón, el día
       en que se pagó. Si HOY hay uno en mora, `ultimoDiaDeMora` devuelve el
       propio `hasta` y los meses quedan en cero solos: no hace falta ningún
       guardián aparte, que es lo que antes tapaba un requisito y dejaba dos.

       6-ago-2026: el hito sale de `ultimoDiaDeMora`, que ahora es la MISMA
       verdad que usa el factor de la garantía —línea de tiempo y recargos ya
       cobrados—. Antes este contador solo veía la línea de tiempo, y por eso una
       mora de UN día tapada con una prórroga el mismo día no reseteaba nada: el
       reloj seguía corriendo y prorrogar compraba platino antes que pagar. */
    var hitos = [];
    ps.forEach(function (p, k) {
      var m = ultimoDiaDeMora(p, hasta);
      if (m) { hitos.push(m); return; }
      if (estados[k] === 'rompe' && p.pagado) {
        var f = fechaFin(p.fechaPagado);
        if (f && f <= hasta) hitos.push(f);
      }
    });
    hitos = hitos.filter(Boolean).sort();
    var desde = hitos.length ? hitos[hitos.length - 1]
              : (ps[0] ? (fechaFin(ps[0].fechaDesembolso) || hasta) : hasta);
    var meses = Math.max(0, Math.floor(diasEntre(desde, hasta) / 30));
    return { a_tiempo: aTiempo, racha: racha, meses_sin_mora: meses };
  }
  /* 2-sep-2026 — EL NIVEL ES EL TRAMO DE LA GARANTÍA, decisión de Joan.
     Muere el recorrido por instantes (el nivel ya no se acumula por historial
     de puntualidad) y muere el PISO: la promesa «nunca baja» quedó derogada
     ese mismo día — si la garantía baja, el nivel baja con ella. Aceptar un
     piso aquí resucitaría la promesa por la puerta de atrás, con los niveles
     viejos guardados en la nube ganando sin que nadie lo note.

     La regla de la casa se conserva: este paquete no puede lanzar NUNCA. Un
     total sucio se lee como cero y el socio arranca en hierro, no en error. */
  function nivelDelSocio(garantiaTotal) {
    return M.nivelPorGarantia(Math.max(0, num(garantiaTotal)));
  }

  /* --------------- la garantía que dejó un crédito, parte por parte --------
     3-ago-2026. Antes acá se hacía acumularGarantia(gananciaCobrada(p),
     esPuntual(p)): UN solo factor para todo lo cobrado del crédito. Como
     gananciaCobrada() incluye los costos de las prórrogas ya pagadas, una
     prórroga que el socio pagó puntualmente hace meses se le degradaba del factor
     completo a la mitad el día que el crédito terminaba pagándose tarde. Garantía
     ya ganada que desaparecía hacia atrás, que es exactamente lo contrario de lo que le
     promete el producto: "todo lo que pagues sigue sumando".

     El motor nunca dijo eso: la prórroga se cobra y se acredita el día que se
     paga, y lo que pase después con el crédito no la puede tocar (decisión D6).
     Cada prórroga lleva su propia cuenta, y el pago final la suya.

     4-ago-2026 — la SEGUNDA mitad del mismo arreglo. "Se acredita el día que se
     paga" no quería decir "se acredita siempre al factor completo": quería decir
     que el factor se congela ese día. Acá estaba congelado en `true` para todas, y con
     eso una prórroga registrada con veinte días de atraso dejaba MÁS garantía
     que saldar la deuda completa el mismo día. Medido, con los mismos 240.000 de
     costos: dejar la prórroga 162.000, saldar todo 108.000. 54.000 de regalo al
     que no paga, o sea 162.000 más de cupo en platino. Es el mismo agujero que
     el bono por puntualidad vino a cerrar, reabierto por otra puerta.

     Ahora cada prórroga usa su propio factor de puntualidad (§4), el mismo que
     usa cualquier otro pago, y lo ya ganado sigue intacto: las prórrogas viejas
     no traen recargo, se leen puntuales y conservan su factor completo. */
  function garantiaGanadaCredito(p) {
    return lista(p && p.prorrogas).reduce(function (t, pr) {
      return t + garantiaGanadaProrroga(pr, p);
    }, 0) +
      /* Cada cuota del plan de pagos lleva su propio factor, congelado el día
         que se cobró, por la misma razón que las prórrogas: lo ya ganado no se
         puede mover hacia atrás. */
      garantiaGanadaPlan(p) +
      /* 5-ago-2026 §4-bis — y el pago final tampoco. `esPuntual` compara la
         fecha de pago contra el corte, y la prórroga corre el corte al futuro:
         el que se atrasaba 127 días, prorrogaba y pagaba dentro del corte nuevo
         cobraba el factor completo del que nunca se atrasó. El factor mira las
         dos cosas: llegó en fecha Y el crédito no venía de una mora. */
      /* 23-sep-2026 — `gananciaPago` es lo que se cobro DE MAS, y ahi adentro
         viene la mora: en un credito de 200.000 con 40.000 de costo y 160.000
         de recargo, vale 200.000. La garantia sale solo del costo pactado, asi
         que la mora se resta antes. Sin esta resta, el que se atrasa acredita
         mas cupo que el que paga en fecha. */
      (p && p.pagado
        ? M.acumularGarantia(Math.max(0, num(p.gananciaPago) - num(p.recargoMora)),
            M.cuentaComoPuntualParaGarantia({
              pagado_en_fecha: esPuntual(p),
              credito_estuvo_en_mora: veniaDeMora(p, p.cicloPago)
            })) +
          /* 26-sep-2026 — la mora del pago final: cero en los créditos pedidos
             desde el 27-sep, y lo que siempre dejó en los de antes. Nunca más de
             lo que entró. */
          M.garantiaDeMoraPagada(Math.min(num(p.recargoMora), num(p.gananciaPago)), fechaDelCredito(p))
        : 0);
  }

  function codCliente(s) { return 'CL-' + String((s && s.numero) || 0).padStart(4, '0'); }
  function codCredito(p) { return 'CR-' + String((p && p.numero) || 0).padStart(4, '0'); }
  function codRespaldado(r) { return 'RG-' + String((r && r.numero) || 0).padStart(4, '0'); }

  /* ------------------------------------------- cuentas de un respaldado --
     El saldo de capital de las cuotas que todavía no pagó ES la garantía
     comprometida: mientras no lo termine, esa plata no respalda nada más. */
  function saldoCapitalRespaldado(r) {
    return lista(r && r.cuotas).reduce(function (t, c) {
      return t + (c.pagado ? 0 : num(c.capital));
    }, 0);
  }
  function garantiaGanadaRespaldado(r) {
    return lista(r && r.cuotas).reduce(function (t, c) {
      return t + (c.pagado ? num(c.garantiaGenerada) : 0);
    }, 0);
  }
  function respaldadosDe(db, s) {
    return lista(db && db.respaldados).filter(function (r) { return r.socioId === (s && s.id); });
  }

  /* La garantía GANADA de un socio: lo que le dejó cada peso de costo que ya
     pagó, en el quincenal y en el de garantía. El factor lo pone el MOTOR
     (0,80 en fecha y tarde en el quincenal desde el 23-sep; 0,20 y 0,10 en el
     otro; y la mora, solo en los créditos pedidos antes del 27-sep). Acá
     no se multiplica nada a mano y tampoco se deja de multiplicar: el costo
     COBRADO no es la garantía, y desde que FACTOR_GARANTIA dejó de ser 1,00 no
     hay forma de que coincidan. Es una sola cuenta para el paquete del socio y
     para la foto de la comunidad, que es lo que evita que el mismo cliente
     vea dos cifras distintas según por dónde entró. */
  function garantiaGanadaDe(db, s) {
    return lista(db && db.prestamos)
      .filter(function (p) { return p.socioId === (s && s.id); })
      .reduce(function (t, p) {
        return t + garantiaGanadaCredito(p);
      }, 0)
      + respaldadosDe(db, s).reduce(function (t, r) {
        return t + garantiaGanadaRespaldado(r);
      }, 0);
  }

  /* ==========================================================================
   * LA CONTABILIDAD DEL CUPÓN — 5-ago-2026, solo para el Panel.
   *
   * Con el reparto 75/10/15, el 15% de cada costo cobrado va devolviéndole a la
   * plataforma el cupón que le REGALÓ al socio para arrancar. Cuando ese cupón
   * queda saldado —el crédito 13 en la escalera normal— ese mismo 15% deja de
   * ser recuperación de capital y pasa a ser ganancia. El Panel necesita las
   * tres cifras: cuánto queda por recuperar, cuánto ya se recuperó y cuánto de
   * lo cobrado es ganancia libre.
   *
   * SE DERIVA DE LOS COSTOS COBRADOS, NO DE UN CONTADOR GUARDADO, y es la misma
   * decisión que ya se tomó dos veces en este archivo: el nivel es un máximo
   * histórico derivado y el costo del ciclo se reconstruye de los hechos. Un
   * contador guardado se desincroniza el día que Joan edita o borra un pago, y
   * desde ahí miente para siempre sin que nadie lo note.
   *
   * NADA DE ESTO VIAJA AL SOCIO. migrarSocio no lo llama ni lo puede llamar:
   * para el socio su garantía es el 75% y no existe ningún cupón que devolver.
   * ========================================================================*/

  /**
   * Los costos que un socio YA PAGÓ, uno por uno y en orden, con el factor de
   * puntualidad de cada uno. Es EXACTAMENTE la misma partición que hace
   * garantiaGanadaCredito —cada prórroga con su factor, el recargo siempre a la
   * mitad, cada cuota del plan por separado, el pago final aparte— así que la
   * suma de las garantías de estos movimientos da la garantía del socio. Si un
   * día una de las dos cambia, la otra tiene que cambiar con ella.
   *
   * @returns {Array<{fecha, tipo, monto, aTiempo, producto}>}
   */
  function movimientosCobradosCredito(p) {
    var movs = [];
    function empujar(fecha, tipo, monto, aTiempo, producto) {
      if (num(monto) <= 0) return;
      movs.push({ fecha: fechaFin(fecha) || null, tipo: tipo, monto: num(monto),
                  aTiempo: aTiempo !== false, producto: producto || 'quincenal',
                  // La mora de los créditos pedidos antes del 27-sep sigue dejando garantía.
                  fechaDelCredito: fechaDelCredito(p) });
    }
    lista(p && p.prorrogas).forEach(function (pr) {
      empujar(pr && pr.fecha, 'costo_prorroga', costoDeProrroga(pr), prorrogaAcreditaEnFecha(pr, p));
      empujar(pr && pr.fecha, 'recargo_mora', moraDeProrroga(pr), false);
    });
    var e = entradaPlan(p);
    if (e) {
      empujar(e.fecha, 'entrada_plan', costoDeProrroga(e), prorrogaAcreditaEnFecha(e, p));
      empujar(e.fecha, 'recargo_mora', moraDeProrroga(e), false);
    }
    cuotasPlan(p).forEach(function (c) {
      /* Una cuota vieja que no guardó su costo conserva la garantía que se le
         acreditó (garantiaGanadaCuotaPlan) pero no puede entrar al reparto: no
         se sabe de qué costo salió, y repartir un número inventado sería peor
         que no repartirlo. */
      if (!c || (c.pagado && c.costo == null)) return;
      /* 16-oct-2026 — por pedazos, con la MISMA partición que la garantía
         (piezasDeCuota): cada abono a la cuota el día que entró, y el resto el
         día que se cerró. */
      var estuvo = veniaDeMora(p, fechaFin(c.fecha));
      piezasDeCuota(p, c).forEach(function (x) {
        empujar(x.fecha, 'cuota_plan', x.costo,
          M.cuentaComoPuntualParaGarantia({ pagado_en_fecha: piezaEnFecha(c, x), credito_estuvo_en_mora: estuvo }));
        empujar(x.fecha, 'recargo_mora', x.mora, false);
      });
    });
    if (p && p.pagado) {
      /* El pago final se PARTE en costo y mora (26-sep-2026). Antes iba entero
         porque así lo acreditaba garantiaGanadaCredito; desde el 23-sep esa
         función le resta la mora, y con el movimiento entero eran estas dos
         cuentas las que no casaban. `gananciaPago` sigue siendo lo que se cobró
         de más; la mora que va adentro es `recargoMora`, topada a lo que entró. */
      var moraFinal = Math.min(Math.max(0, num(p.recargoMora)), Math.max(0, num(p.gananciaPago)));
      empujar(p.fechaPagado, 'pago_final', Math.max(0, num(p.gananciaPago)) - moraFinal,
        M.cuentaComoPuntualParaGarantia({
          pagado_en_fecha: esPuntual(p), credito_estuvo_en_mora: veniaDeMora(p, p.cicloPago) }));
      empujar(p.fechaPagado, 'recargo_mora', moraFinal, false);
    }
    return movs;
  }

  /* Las cuotas ya pagadas de un préstamo con garantía. Desde el 26-sep-2026
     costo y recargo van en DOS movimientos: el motor ya acredita la cuota del
     respaldado solo por su costo (liquidarCuotaRespaldada, 23-sep), y el recargo
     etiquetado `recargo_mora` entra entero a operativo en amortizarCupon. */
  function movimientosCobradosRespaldado(r) {
    var movs = [];
    lista(r && r.cuotas).forEach(function (c) {
      if (!c || !c.pagado) return;
      var fecha = fechaFin(c.fechaPagado) || fechaFin(c.fecha) || null;
      var aTiempo = num(c.recargo) === 0;
      var delCredito = fechaDelCredito(r);
      if (num(c.costo) > 0) movs.push({ fecha: fecha, tipo: 'cuota_respaldado', producto: 'respaldado',
                                        monto: num(c.costo), aTiempo: aTiempo, fechaDelCredito: delCredito });
      if (num(c.recargo) > 0) movs.push({ fecha: fecha, tipo: 'recargo_mora', producto: 'respaldado',
                                          monto: num(c.recargo), aTiempo: false, fechaDelCredito: delCredito });
    });
    return movs;
  }

  /** Todo lo que un socio pagó de costos, de los dos productos, cronológico.
     El orden IMPORTA: el 15% del movimiento que salda el cupón se parte en dos
     (una parte lo termina de saldar, el resto ya es ganancia). */
  function movimientosCobradosDe(db, s) {
    var movs = lista(db && db.prestamos)
      .filter(function (p) { return p.socioId === (s && s.id); })
      .reduce(function (t, p) { return t.concat(movimientosCobradosCredito(p)); }, [])
      .concat(respaldadosDe(db, s).reduce(function (t, r) {
        return t.concat(movimientosCobradosRespaldado(r));
      }, []));
    // Sin fecha van al final: son datos viejos y no pueden colarse antes de un
    // hecho fechado para adelantar la amortización.
    return movs.sort(function (a, b) {
      return String(a.fecha || '9999-12-31').localeCompare(String(b.fecha || '9999-12-31'));
    });
  }

  /**
   * La contabilidad del cupón de UN socio. Lo que el Panel pone en su ficha.
   *
   * El cupón que hay que recuperar es toda la garantía PRESTADA: el cupón por
   * los datos y los 5.000 de cada referido. Las dos son plata que puso la
   * plataforma para que el socio pudiera pedir sin haber pagado nada, y las dos
   * son exposición de Joan mientras no vuelvan.
   */
  function contabilidadCupon(db, s) {
    var g = M.desglosarGarantia(entradaGarantia(db, s));
    var c = M.amortizarCupon(movimientosCobradosDe(db, s), { cuponPrestado: g.prestada });
    c.socio_id = s && s.id;
    c.garantia_prestada = g.prestada;
    c.garantia_ganada = g.ganada;
    /* Lo que Joan tiene de verdad en riesgo por este socio: el cupón que todavía
       no volvió. Lo demás que el socio puede pedir está respaldado por costos
       que él ya pagó. */
    c.expuesto = c.cupon_pendiente;
    return c;
  }

  /** La misma cuenta para toda la cartera, socio por socio y sumada. El cupón
     NO se puede amortizar en una sola bolsa: cada socio tiene el suyo y el
     15% que paga solo devuelve el que se le regaló A ÉL. */
  function contabilidadCartera(db) {
    var porSocio = lista(db && db.socios).filter(Boolean).map(function (s) {
      return contabilidadCupon(db, s);
    });
    var t = {
      socios: porSocio.length,
      cupon_prestado: 0, cupon_recuperado: 0, cupon_pendiente: 0,
      cobrado: 0, garantia_socio: 0, operativo: 0,
      ganancia_libre: 0, ganancia_cupon: 0,
      socios_saldados: 0, por_socio: porSocio
    };
    porSocio.forEach(function (c) {
      t.cupon_prestado += c.cupon_prestado;
      t.cupon_recuperado += c.cupon_recuperado;
      t.cupon_pendiente += c.cupon_pendiente;
      t.cobrado += c.cobrado;
      t.garantia_socio += c.garantia_socio;
      t.operativo += c.operativo;
      t.ganancia_libre += c.ganancia_libre;
      t.ganancia_cupon += c.ganancia_cupon;
      if (c.saldado) t.socios_saldados += 1;
    });
    t.expuesto = t.cupon_pendiente;
    return t;
  }

  /* Los datos del cliente en las claves que entiende el motor (DATOS_KYC).
     De acá sale el cupón: cada dato cargado le presta más garantía. */
  function datosKycDe(s) {
    var r = (s && s.referencia) || {};
    return {
      nombre: s.nombre, cedula: s.cedula, celular: s.telefono,
      whatsapp: !!(s.whatsappIgual || s.whatsappNumero),
      correo: s.email, ciudad: [s.ciudad, s.barrio].filter(Boolean).join(' '),
      direccion: s.direccion, vivienda: [s.tipoVivienda, s.numeroVivienda].filter(Boolean).join(' '),
      pago: s.nequi || s.llave, celular2: s.telefono2,
      referencia: (r.nombre && r.telefono) ? (r.nombre + ' ' + r.telefono) : '',
      ubicacion: s.ubicacion,
      foto_cedula_frente: s.cedulaFrenteFoto, foto_cedula_reverso: s.cedulaReversoFoto,
      foto_selfie: s.selfieFoto
    };
  }

  /* Referidos: los que este cliente trajo. Solo suman los que ya pagaron.

     LA CLAVE SE LLAMA `pago` Y NO `pago_puntual` (6-ago-2026). Se llamaba
     `pago_puntual` y lo que se mira es `p.pagado`, sin abrir la fecha: prometía una
     puntualidad que nunca se midió, y el día que alguien colgara un premio de esa
     palabra iba a estar premiando otra cosa. La condición correcta es "pagó" —así
     se lo dice la app al socio— y el motor acepta las dos claves. */
  function referidosDe(db, s) {
    return lista(db && db.socios).filter(function (x) { return x.referidoPor === s.id; }).map(function (x) {
      return {
        nombre: x.nombre,
        pago: lista(db.prestamos).some(function (p) { return p.socioId === x.id && p.pagado; })
      };
    });
  }

  /* Cifras del grupo, para que cada socio vea que entró a algo colectivo.
     SOLO agregados: ni un nombre, ni un monto de nadie en particular. */
  function fotoComunidad(db) {
    var prestamos = lista(db && db.prestamos);
    var pagados = prestamos.filter(function (p) { return p.pagado; });
    var puntuales = pagados.filter(esPuntual).length;
    var garantia = lista(db && db.socios).reduce(function (t, s) {
      return t + garantiaGanadaDe(db, s);
    }, 0);
    return {
      socios: lista(db && db.socios).length,
      creditos_pagados: pagados.length,
      garantia_construida: garantia,
      prestado: prestamos.reduce(function (t, p) { return t + num(p.capital); }, 0),
      puntualidad: pagados.length ? Math.round(puntuales / pagados.length * 100) : null,
      desde: prestamos.length
        ? prestamos.map(function (p) { return p.fechaDesembolso; }).filter(Boolean).sort()[0]
        : null
    };
  }

  /* La entrada exacta que esperan desglosarGarantia, maximoRespaldado y
     cupoQuincenal. La arma el puente y no cada pantalla: el Panel la usa para el
     cupo y para el máximo del préstamo con garantía, y migrarSocio la usa para
     lo que ve el socio. Una sola cuenta, dos consumidores. */
  function entradaGarantia(db, s) {
    return {
      datos: datosKycDe(s),
      referidos: referidosDe(db, s),
      acumulada: garantiaGanadaDe(db, s),
      ajuste: Number(s && s.ajusteGarantia) || 0,
      comprometida: comprometidaDe(db, s),
      /* El tope de los referidos, si Joan lo movió desde Ajustes. Sin dato en el
         Panel viaja undefined y manda el del motor (M.TOPE_REFERIDOS), que es
         donde vive el valor por defecto: acá no se repite ningún número. */
      tope_referidos: topeReferidosDe(db)
    };
  }
  /* ==========================================================================
   * LA ENTRADA DEL CUPO — 6-ago-2026, y es entradaGarantia MÁS el capital
   * quincenal que está afuera.
   *
   * EL DEFECTO: `comprometida` solo contaba respaldados abiertos, así que
   * cupoDelSocio —y el cupo que la app le promete al socio— no descontaba el
   * capital quincenal vigente. Medido, con 100.000 afuera: cupo 20.000 y 120.000
   * en la calle; con dos prórrogas, cupo 50.000 y 150.000; con catorce créditos
   * pagados, cupo 260.000 y 360.000. Cada prórroga le subía el cupo sin que
   * devolviera un peso. Y para el préstamo con garantía sí se descontaba: el mismo
   * concepto con dos comportamientos.
   *
   * POR QUÉ SON DOS ENTRADAS Y NO UNA. La regla completa vive en el motor
   * (desglosarGarantia suma `comprometida` + `capital_quincenal`), pero el capital
   * quincenal solo puede entrar por UN canal a la vez o se resta dos veces. El
   * Panel ya lo mete a mano en `comprometida` para el lado del respaldado
   * (entradaRespaldoDe, con la inversa del motor), así que:
   *
   *   entradaGarantia  respaldados abiertos. La que consume el RESPALDADO y a la
   *                    que el Panel le suma el quincenal por su cuenta.
   *   entradaCupo      la anterior + `capital_quincenal`. La que consume el CUPO,
   *                    acá y en el paquete del socio.
   *
   * El día que crm.html pueda tocarse, entradaRespaldoDe se borra y las dos se
   * vuelven una: la de acá, para los dos productos.
   * ========================================================================*/
  function entradaCupo(db, s) {
    var e = entradaGarantia(db, s);
    e.capital_quincenal = capitalQuincenalDe(db, s);
    return e;
  }

  /* La mitad de Joan del tope de los referidos: vive en Ajustes, igual que el
     freno por ingreso. Si la clave no está —hoy no está: crm.html todavía no la
     escribe— devuelve undefined y el motor usa su propio valor. */
  function topeReferidosDe(db) {
    var c = db && db.config && db.config.topeReferidos;
    return (c && typeof c === 'object') ? c : undefined;
  }

  /**
   * EL FRENO POR INGRESO, LISTO PARA QUE EL PANEL LO ENCIENDA (5-ago-2026).
   *
   * Junta las dos mitades del dato: la configuración, que es de Joan y vive en
   * Ajustes (`db.config.freno`), y el ingreso quincenal, que es de cada socio.
   * Viene APAGADO —`activo:false`— y así se queda hasta que Joan lo prenda; y
   * aunque lo prenda, un socio sin ingreso declarado no se topa, porque topar
   * contra un dato que no tenemos sería bajarle el cupo por no haber contestado.
   */
  function frenoDe(db, s) {
    var c = (db && db.config && db.config.freno) || {};
    return {
      activo: c.activo === true,
      fraccion_quincena: num(c.fraccion_quincena) > 0
        ? num(c.fraccion_quincena) : M.FRENO_INGRESO.fraccion_quincena,
      ingreso_quincenal: Math.max(0, num(s && s.ingresoQuincenal))
    };
  }

  /** El cupo quincenal de un socio, con el freno ya consultado. Es la función
     que el Panel y la app tienen que preguntar: si cada uno arma la entrada y
     las opciones por su lado, el día que Joan encienda el freno una de las dos
     pantallas va a seguir mostrando el cupo viejo.

     Y va con entradaCupo, no con entradaGarantia: el cupo descuenta TODO el
     capital que está afuera, también el quincenal (ver entradaCupo). */
  function cupoDelSocio(db, s, nivel) {
    return M.cupoQuincenal(entradaCupo(db, s), nivel || 'hierro',
                           { freno: frenoDe(db, s) });
  }

  /* Lo que tiene metido en préstamos con garantía todavía abiertos.
     OJO: solo respaldados. El capital quincenal vigente lo dice
     capitalQuincenalDe, y quien pregunta por el CUPO tiene que contar los dos:
     para eso está entradaCupo. */
  function comprometidaDe(db, s) {
    return respaldadosDe(db, s).filter(function (r) { return !r.pagado; })
      .reduce(function (t, r) { return t + saldoCapitalRespaldado(r); }, 0);
  }

  /* Lo que tiene afuera en créditos QUINCENALES todavía abiertos: capital menos
     abonos, crédito por crédito. Es el mismo capitalActual que usa el Panel en
     cada pantalla, así que no hay una segunda forma de contar lo que está en la
     calle. */
  function capitalQuincenalDe(db, s) {
    return lista(db && db.prestamos)
      .filter(function (p) { return p.socioId === (s && s.id) && !p.pagado; })
      .reduce(function (t, p) { return t + Math.max(0, capitalActual(p)); }, 0);
  }

  /**
   * El paquete que consume la app del socio, tal cual lo espera abrir().
   * No puede lanzar NUNCA: todo Number(x)||0 y todo (arr||[]). Un capital en
   * cero se muestra como cero, no como error.
   *
   * 3-sep-2026 — `hasta` ES OPCIONAL Y POR DEFECTO ES HOY. Ni la app, ni el CRM,
   * ni el espejo lo pasan: para ellos no cambia nada. Existe porque esta era la
   * ÚNICA función del archivo que leía el reloj de pared sin dejar preguntar por
   * otro día, y eso VENCIÓ UN CENTINELA sin que nadie tocara una línea.
   *
   * Medido: «con DOS prórrogas más plan de pagos tampoco rinde más»
   * (pruebas/motor.test.js) pasó 29 días en verde y se puso roja la madrugada
   * del día 30. El socio del fixture curó su mora el 4-ago, y
   * `meses_sin_mora` es `floor(díasEntre(último día de mora, hoy) / 30)`: el
   * 2-sep valía 0 y el 3-sep valía 1. Ninguna cuenta de plata estaba mal —era
   * correcta los dos días—. Lo que estaba mal era PREGUNTARLA CONTRA EL
   * CALENDARIO. Y encima se curaba sola el 16-sep, cuando la primera cuota del
   * plan vencía y el socio volvía a estar en mora: una prueba que se pone roja
   * y verde por el almanaque no distingue una regresión de un martes, y una
   * suite crónicamente roja se ignora, que es peor que no tener centinela.
   *
   * La regla de este archivo ya era esta —si tu pregunta lleva una fecha
   * adentro, pásala en vez de deducirla— y justo aquí faltaba.
   *
   * 7-oct-2026 — `comunidad` ES OPCIONAL: las cifras del grupo YA CALCULADAS
   * (fotoComunidad(db)). Nadie más la pasa y para ellos no cambia nada. La
   * pasa el lote de historiales del CRM (loteMigracion), que arma el paquete
   * de TODOS los socios seguido: fotoComunidad recorre la cartera entera, así
   * que llamarla una vez por socio hacía el lote cuadrático. Medido con node
   * en el banco de pruebas: 300 socios y 900 créditos, 1.967 ms el lote, y
   * 1.713 de ellos eran fotoComunidad repetida 300 veces sobre la MISMA
   * cartera. Desde que los historiales suben solos (panel/historiales-auto.js)
   * ese lote se arma tras cada rato de calma, y dos segundos de pantalla
   * congelada cada vez no se le pueden pedir a Joan. Es el mismo número: se
   * calcula una vez en vez de trescientas.
   */
  function migrarSocio(db, s, hasta, comunidad) {
    var prestamos = lista(db && db.prestamos);
    var ps = prestamos.filter(function (p) { return p.socioId === s.id; })
      .sort(function (a, b) { return String(a.fechaDesembolso).localeCompare(String(b.fechaDesembolso)); });
    var resps = respaldadosDe(db, s);

    /* entradaCupo, no entradaGarantia: lo que la app le muestra al socio es su
       CUPO, y ese descuenta el capital que ya tiene afuera en los dos productos.
       Con entradaGarantia la app le prometía un número que el Panel no podía
       sostener, y Joan quedaba cobrando la contradicción. */
    var entrada = entradaCupo(db, s);
    var refs = entrada.referidos;

    var g = M.desglosarGarantia(entrada);
    var kyc = M.garantiaPorDatos(entrada.datos);

    /* Los tres contadores ya no deciden el nivel (2-sep-2026): siguen viajando
       porque las insignias de racha y el «N puntuales» del CRM los pintan. El
       NIVEL sale del TOTAL de la garantía — el mismo g.total que el socio ve
       como «tu garantía» —, y s.nivelSocio ya no se mira: era el piso de la
       promesa derogada. */
    var hoy = fechaFin(hasta) || hoyISO();
    var cont = contadoresDeNivel(ps, hoy);
    var aTiempo = cont.a_tiempo, racha = cont.racha, meses = cont.meses_sin_mora;
    var nivel = nivelDelSocio(g.total);

    return {
      // Para que las solicitudes y los datos que mande el cliente le lleguen a
      // Joan y no tenga que buscar el chat.
      negocio: { nombre: (db.config && db.config.negocio) || 'Tu Garantía',
                 whatsapp: digitos(db.config && db.config.whatsapp) },
      comunidad: comunidad || fotoComunidad(db),
      socio: { codigo: codCliente(s) },
      garantia: {
        /* `acumulada` viaja como la GANADA del motor (ya con el ajuste aplicado):
           es la que respalda el préstamo con garantía, y la app no puede volver a
           restarle nada. Los referidos van APARTE y no sumados acá adentro
           (6-ago-2026): si viajaran dentro de la ganada, la app le ofrecería un
           préstamo con garantía apoyado en referidos y el Panel se lo negaría.
           `comprometida` es TODO el capital afuera —respaldados y quincenales—,
           que es lo que el cupo tiene que descontar. */
        total: g.total, acumulada: g.ganada, cupon: g.cupon, referidos: g.referidos,
        nivel: nivel, pagados_a_tiempo: aTiempo, racha: racha, meses_sin_mora: meses,
        creditos_total: ps.length, comprometida: g.comprometida,
        // Las dos mitades, para que la app pueda decir de dónde sale el descuento.
        capital_quincenal: g.capital_quincenal, capital_afuera: g.capital_afuera
      },
      // Solo QUÉ dato tiene cargado, nunca su contenido: al cliente le alcanza
      // con ver el chulito, y así no viajan fotos, coordenadas ni teléfonos.
      perfil: {
        datos: kyc.completos.reduce(function (o, d) { o[d.id] = true; return o; }, {}),
        porcentaje: kyc.porcentaje,
        faltan: kyc.faltantes.map(function (d) { return { id: d.id, etiqueta: d.etiqueta, valor: d.valor }; })
      },
      /* 1-oct-2026 — LA LISTA VIAJA VACÍA, Y A PROPÓSITO. Llevaba el nombre de
         pila de cada invitado y si pagó: el teléfono del que invita recibía
         «ERICK pagó, MARIA no, CRISTIAN no» aunque la pantalla no lo pintara, y
         con un solo invitado el número ya decía «tu invitado no te ha pagado».
         Que pagó o no un tercero no es dato de quien lo invitó (Ley 2300 art. 4)
         y la política publicada promete «Ningún otro cliente puede ver los tuyos».
         `lista` se queda como [] y no se borra: las apps que ya están en los
         teléfonos la leen, y un campo que desaparece rompe una versión vieja.
         `total` y `pagaron` siguen porque los 5.000 de cupo por referido están
         en términos firmados y el cupo los necesita; esos esperan al abogado.
         El Panel saca la lista de referidosDe, que nunca sale de este equipo. */
      referidos: {
        total: refs.length,
        pagaron: refs.filter(function (r) { return r.pago; }).length,
        lista: []
      },
      /* 4-ago-2026 — LA APP LE MOSTRABA AL SOCIO EL CAPITAL ENTERO CON PLAN.
         `capital` viajaba como capitalActual(p) —todo el capital vigente—
         mientras `costo` ya venía de K(p), que con plan de pagos devuelve el de
         la CUOTA. Dos mitades de dos ciclos distintos en la misma línea. Y como
         la app calcula el 1% diario sobre ese `capital`, la mora salía sobre el
         capital entero: medido, el Panel cobraba 230.000 y la app mostraba
         630.000 del mismo crédito el mismo día; con 10 días de mora, 250.000
         contra 690.000.
         Lo que viaja ahora es el ciclo que se está cobrando, entero y de una
         sola fuente: capitalDelCiclo y K, las MISMAS dos funciones que usa el
         Panel (crm.html las llama línea por línea). `corte` ya apuntaba bien: el
         Panel deja cicloActual en la fecha de la cuota vigente.
         Y van dos datos más para que la app no tenga que deducir nada:
         `saldo_capital`, que es lo que le falta del crédito COMPLETO (la cuota
         no es la deuda), y `tasa`, el porcentaje que de verdad rige este ciclo
         —5% en plan de pagos, el pactado del crédito si no—, que la app pinta
         al lado del costo y hasta hoy adivinaba.

         UN CRÉDITO YA PAGADO NO TIENE CICLO VIGENTE, así que ahí las tres cifras
         son las de su historia: lo que PIDIÓ, lo que le COSTÓ en total (ciclo,
         prórrogas y cuotas del plan, que es de lo que está hecho `abonado`) y
         cero de saldo. Antes viajaba capitalActual, o sea capital menos abonos:
         un crédito de 600.000 terminado con plan de pagos aparecía en el
         historial del socio como un crédito de $0. */
      creditos: ps.slice().reverse().map(function (p) {
        /* 5-ago-2026 — LA MORA VIAJA HECHA, NO PARA QUE LA APP LA REHAGA.
           La app sumaba capital + costo + 1% × capital por su cuenta, y con un
           abono de por medio le daba otra cosa que al Panel: 200.000 a 20 días
           con 199.999 abonados, el Panel cobraba 80.001 y la app decía "Total
           para saldar hoy $1". Ahora la cuenta la hace liquidarCiclo, una sola
           vez y en un solo sitio, y acá viaja YA HECHA. */
        var liq = liquidarCiclo(p, hoy);
        return {
          codigo: codCredito(p),
          capital: p.pagado ? num(p.capital) : liq.capital,
          costo: Math.round(p.pagado ? gananciaCobrada(p) : liq.costo),
          saldo_capital: p.pagado ? 0 : capitalActual(p),
          tasa: tasaDelCiclo(p),
          desembolso: p.fechaDesembolso || null, corte: p.cicloActual || null,
          pagado: !!p.pagado, fecha_pagado: p.fechaPagado || null,
          abonado: Math.round(gananciaCobrada(p) + capitalRecuperadoDe(p)),
          garantia: garantiaGanadaCredito(p),
          prorrogas: lista(p.prorrogas).length,
          /* 29-ago-2026 — el acuerdo pactado viaja al socio. Sin esto, la app
             le dice «mora corriendo» a un cliente con pacto anotado en el
             Panel: dos verdades sobre la misma quincena. Solo la fecha y el
             monto congelado — lo que él necesita ver—; la mecánica de cumplir
             o incumplir es del Panel. */
          acuerdo: (p.acuerdo && !p.pagado)
            ? { fecha: p.acuerdo.pactadaPara, monto: num(p.acuerdo.monto) }
            : null,
          // Solo el conteo: al socio le alcanza con ver que va por la cuota 2 de 3.
          plan_cuotas: cuotasPlan(p).length,
          plan_cuotas_pagadas: cuotasPlan(p).filter(function (c) { return !!c.pagado; }).length,
          /* 16-oct-2026 — EL CRÉDITO A CUOTAS VIAJA CON SU CALENDARIO. Con solo
             el conteo, el cliente veía «455.000» como si fuera todo y no sabía
             que el 15-nov le tocan 390.000. Van fechas y PESOS, nunca el %: el
             cliente no ve porcentajes (centinela de motor.test.js), y un `pct`
             en el paquete es justo lo que se colaría sin que nadie lo note.
             `plan_origen` separa el crédito pactado a cuotas ('alta') del plan
             de rescate del §8 ('rescate'): son textos distintos en la app. */
          plan_origen: tienePlan(p) ? (esPlanDeAlta(p) ? 'alta' : 'rescate') : null,
          /* 22-oct-2026 — EL PRÓXIMO PAGO QUE ACORDÓ JOAN. Por dentro es un
             crédito a cuotas de una cuota, y por eso `plan_origen` sigue
             diciendo 'alta': una app vieja lo muestra como cuota 1 de 1 con su
             fecha y su valor, que es verdad, y le dice que no se prorroga y
             que puede abonar, que también lo es. La app nueva lee esto y lo
             llama por su nombre: la fecha y el valor que acordaron, sin hablar
             de un crédito a cuotas que nunca pidió. El valor es el del día
             acordado (sin la mora que corra después). */
          /* Y si lo fue alguna vez, también pagado: el historial no puede
             llamarlo «a cuotas, 1 de 1 cuotas pagadas». */
          pago_acordado: esPacto(p),
          pacto: (esPacto(p) && !p.pagado && cuotaPlanActual(p)) ? {
            fecha: fechaFin(cuotaPlanActual(p).fecha) || null,
            monto: Math.round(liquidarCiclo(p, fechaFin(cuotaPlanActual(p).fecha)).total_a_pagar),
            acordado: fechaFin(p.planPagos.pacto.creado) || null
          } : null,
          plan: tienePlan(p) ? cuotasPlan(p).map(function (c) {
            var pag = pagadoDeCuota(p, c);
            return { n: num(c.n), fecha: fechaFin(c.fecha) || null, total: num(c.total), pagado: !!c.pagado,
                     abonado: c.pagado ? 0 : pag.recibido,
                     falta: c.pagado ? 0 : Math.max(0, num(c.capital) - pag.capital) +
                                           Math.max(0, costoEfectivoDeCuota(p, c) - pag.costo),
                     /* La mora de HOY de cada cuota: con dos vencidas, la app solo
                        sabía la de la primera (revisión del 16-oct). */
                     mora: c.pagado ? 0 : moraPendienteDeCuota(p, c, hoy) };
          }) : [],
          saldo_plan: (tienePlan(p) && !p.pagado) ? saldoDelPlan(p) : 0,
          saldar_hoy: (esPlanDeAlta(p) && !p.pagado) ? ((liquidarSaldoPlan(p, hoy) || {}).total || 0) : null,
          /* Hasta qué día vale `saldar_hoy` (saldarValeHasta), y —si la cuota en
             curso todavía no empieza— cuánto vale esa cuota en su fecha: hoy
             cerrarla cuesta menos (su quincena no empezó) y la app tiene que
             decir las dos cosas, no una sola como si fuera la cuota. */
          saldar_hasta: (esPlanDeAlta(p) && !p.pagado) ? saldarValeHasta(p, hoy) : null,
          /* Si la quincena de la cuota en curso todavía no empieza, el día en
             que empieza. Una cuota del MEDIO no se puede cerrar antes de ese día
             (solo abonarle a capital), y la app le prometía «pagando el 15-nov o
             antes, tu cupo sube $96.000» a quien quería pagarla el 26-oct
             (revisión del 17-oct). */
          cuota_empieza: (esPlanDeAlta(p) && !p.pagado && cuotaPlanActual(p) &&
                          !cuotaEmpezo(p, cuotaPlanActual(p), hoy))
            ? diaDespues(inicioDeCuota(p, cuotaPlanActual(p))) : null,
          cuota_es_la_ultima: (tienePlan(p) && !p.pagado && cuotaPlanActual(p))
            ? esUltimaPendiente(p, cuotaPlanActual(p)) : null,
          cuota_en_su_fecha: (esPlanDeAlta(p) && !p.pagado && cuotaPlanActual(p) &&
                              !cuotaEmpezo(p, cuotaPlanActual(p), hoy))
            ? liquidarCiclo(p, fechaFin(cuotaPlanActual(p).fecha)).total_a_pagar : null,
          /* Y su costo en esa fecha. Un paquete de ese día abierto después de
             `saldar_hasta` —sin señal— no puede seguir liquidando con el costo
             de ese día, que es cero: desde el día siguiente corre la quincena
             (revisión del 17-oct: le faltaban 65.000 a la cifra). */
          costo_en_su_fecha: (esPlanDeAlta(p) && !p.pagado && cuotaPlanActual(p) &&
                              !cuotaEmpezo(p, cuotaPlanActual(p), hoy))
            ? liquidarCiclo(p, fechaFin(cuotaPlanActual(p).fecha)).costo : null,
          /* Lo que la app tiene que PINTAR, sin recalcular nada: el recargo de
             hoy, los días que lo causaron y el total para saldar. Y `causado`
             para el día que quiera liquidar en otra fecha: se lo pasa a
             MotorReglas.liquidarCredito como {recargoCausado, diasCausados}. */
          dias_mora: liq.dias_mora,
          mora: liq.recargo_mora,
          total_hoy: liq.total_a_pagar,
          causado: liq.causado,
          /* Y el dato del §4-bis, para que la app no lo deduzca: un crédito que
             ya estuvo en mora acredita a la mitad aunque pague dentro del corte que
             le compró la prórroga. Viaja para pasárselo al motor tal cual
             (`credito.estuvo_en_mora`). */
          estuvo_en_mora: liq.estuvo_en_mora
        };
      }),
      respaldados: resps.map(function (r) {
        return {
          codigo: codRespaldado(r), capital: num(r.capital),
          plazo_meses: num(r.plazoMeses) || lista(r.cuotas).length,
          cuota: lista(r.cuotas)[0] ? num(lista(r.cuotas)[0].total) : 0,
          saldo_capital: saldoCapitalRespaldado(r),
          pagado: !!r.pagado,
          cuotas: lista(r.cuotas).map(function (c) {
            return { n: num(c.n), fecha: c.fecha || null, total: num(c.total), pagado: !!c.pagado };
          })
        };
      }),
      resumen: {
        total_prestado: ps.reduce(function (t, p) { return t + num(p.capital); }, 0),
        primer_credito: ps.length ? (ps[0].fechaDesembolso || null) : null
      }
    };
  }

  /* Entrar cuesta el identificador (celular o cédula) + el código de acceso.
     Sin esos dos datos no se puede listar a nadie, ni siquiera en el equipo de
     Joan. Y nunca se dice "el número existe pero el código no": eso volvería
     la app un oráculo de cédulas y celulares.

     10-ago-2026 — ESTO ANTES PEDÍA LOS ÚLTIMOS 4 DEL CELULAR, y se cambió por
     lo que son: un secreto que no es secreto. Los cuatro últimos dígitos del
     celular de alguien circulan en cada grupo de WhatsApp del que esa persona
     hace parte, y la cédula en Colombia está en cada factura. Las dos juntas
     abrían la dirección de la casa, el segundo teléfono y la foto de la cédula.

     El código lo genera el Panel al azar (generarCodigoAcceso, en el motor) y
     se lo manda Joan por WhatsApp. Ver el comentario largo del motor para las
     cuentas de por qué son cinco caracteres y no cinco dígitos. */
  function codigoAccesoDe(s) {
    return (s && typeof s.codigoAcceso === 'string') ? s.codigoAcceso : '';
  }

  /* 20-ago-2026 — EL IDENTIFICADOR PUEDE SER LA CÉDULA O EL CELULAR. El primer
     cliente real que instaló el APK no pudo entrar: la puerta pedía cédula y su
     ficha no la tiene — como 11 de los 16 socios de ese día. El CRM conoce a la
     gente por su celular; pedir en la puerta un dato que el negocio no recoge
     era dejar a la mayoría afuera.

     Esto NO reabre la puerta del 10-ago: aquella usaba dos datos públicos como
     llave (cédula + últimos 4). Aquí el celular solo IDENTIFICA —es tan público
     como la cédula que ya se usaba— y el secreto sigue siendo el código. El
     celular se compara por los últimos 10 dígitos, para que el 57 de adelante
     no deje a nadie afuera. */
  function buscarSocio(db, identificador, codigo) {
    var ced = digitos(identificador);
    var cod = M.normalizarCodigoAcceso(String(codigo == null ? '' : codigo));
    if (ced.length < 5 || !cod) return null;
    var d10 = ced.slice(-10);
    var socios = lista(db && db.socios);
    for (var i = 0; i < socios.length; i++) {
      var s = socios[i];
      var porCedula = digitos(s.cedula) === ced;
      var porCelular = ced.length >= 10 && digitos(s.telefono).slice(-10) === d10;
      if (!porCedula && !porCelular) continue;
      /* Un cliente sin código todavía NO entra. Es a propósito: mientras Joan no
         le haya generado el suyo, dejarlo pasar con el campo vacío convertiría
         "sin código" en la contraseña de todos los que aún no lo tienen. */
      var suyo = M.normalizarCodigoAcceso(codigoAccesoDe(s));
      if (suyo && suyo === cod) return s;
    }
    return null;
  }

  /* 7-oct-2026 — LOS CÓDIGOS SE APAGARON (base/20261007_una_puerta.sql): el
     cliente entra con su celular y su contraseña. buscarSocio y
     sinCodigoAcceso se quedan porque las pruebas del motor los cubren y porque
     los datos de los códigos se conservan, pero ninguna pantalla los llama ya:
     la app no busca por código y el CRM no genera ni avisa de códigos.

     LA LLAVE DE LA FICHA EN LA NUBE, en un solo sitio. Es la que pone
     sincronizar_socios: los dígitos de la cédula o, si no hay, los del
     teléfono que manda el lote (el WhatsApp de la ficha: loteMigracion en
     crm.html). Juntar una cuenta (vincular_cuenta_joan / panel_vincular_cuenta)
     se la pide a la nube con esta llave, desde el computador y desde el
     celular: si cada pantalla la calculara a su manera, una juntaría la
     cuenta con una fila que no existe. pruebas/una-puerta-crm.test.js la
     compara con lo que sube el lote. */
  function llaveEnLaNube(s) {
    if (!s) return '';
    var tel = s.whatsappIgual ? s.telefono : (s.whatsappNumero || s.telefono);
    return digitos(s.cedula) || digitos(tel || s.telefono);
  }

  /* Los clientes a los que todavía hay que generarles el código. El Panel lo usa
     para el aviso de "te faltan N" y para el botón que los crea de una. */
  function sinCodigoAcceso(db) {
    return lista(db && db.socios).filter(function (s) {
      return !M.normalizarCodigoAcceso(codigoAccesoDe(s));
    });
  }

  /* ==========================================================================
   * LOS DESCUENTOS DADOS EN UNA QUINCENA — 4-sep-2026
   *
   * Desde el 2-sep Joan puede perdonar el 100% de la mora, y esa plata no
   * aparecía en NINGÚN informe: `p.condonaciones` se leía solo por socio —la
   * ficha del cliente— y nunca por quincena. Perdonar sin poder mirar cuánto
   * llevas perdonado es la forma más silenciosa de perder plata.
   *
   * POR QUÉ VIVE ACÁ Y NO EN crm.html. `espejo.html` ya reescribe por su cuenta
   * las tres cuentas de quincena del Panel, y su propio comentario lo declara
   * como la deuda que es. Una cuarta cuenta escrita dentro del CRM nacería
   * duplicada el día que el celular muestre la línea — que es exactamente la
   * enfermedad que este archivo existe para curar.
   *
   * LA FECHA DICE CUÁL MOVIMIENTO, NO CUÁL COLUMNA. Es la parte delicada, y
   * tiene tres trampas:
   *
   *   · `p.fechaPagado` es la respuesta EQUIVOCADA y falla EN SILENCIO. Un
   *     descuento dado en una prórroga ocurre con el crédito VIVO, y ese
   *     crédito puede pagarse tres quincenas después, o no pagarse nunca
   *     (`fechaPagado` en null). Usarla mueve el perdón a la quincena del
   *     cierre —lejos de la ganancia que rebajó— y lo hace desaparecer del
   *     informe en todo crédito abierto: justo la plata que el informe viene a
   *     mostrar, y sin un solo error en pantalla.
   *
   *   · `corteVigenteEn(p, c.fecha)` tampoco sirve para un perdón de prórroga.
   *     `cambiosDeCorte` escribe `desde: pr.fecha` y la comparación de
   *     `corteVigenteEn` es `desde <= h`: EL MISMO DÍA de la prórroga ya rige
   *     el corte NUEVO. El descuento se iría a la quincena siguiente mientras
   *     la ganancia que rebajó se queda en `pr.ciclo` — dos filas para un solo
   *     hecho, y la resta deja de cuadrar en las dos.
   *
   *   · Y hay que mirar `sobre` ANTES que la fecha, porque prorrogar por la
   *     mañana y cerrar el crédito por la tarde del mismo día es un caso real.
   *
   * La regla que queda: el movimiento se identifica por su fecha (con `sobre`
   * como desempate) y el CICLO de ese movimiento decide la quincena — el mismo
   * `pr.ciclo` / `p.cicloPago` con que `gananciaDeQuincena` imputa la ganancia.
   * Si las dos no usaran la misma llave, «ganancia menos descuentos» no
   * cuadraría en ninguna fila.
   * ========================================================================*/

  /* La quincena a la que pertenece UNA condonación, o '' si no se puede ubicar.
     Las entradas viejas no traen `sobre`: todas son de cierre, así que
     "ausente = cierre" es seguro hacia atrás. */
  function quincenaDeCondonacion(p, c) {
    var f = fechaFin(c && c.fecha);
    if (!f) return '';
    if (c.sobre === 'prorroga') {
      var pr = lista(p && p.prorrogas).filter(function (x) {
        return fechaFin(x && x.fecha) === f;
      })[0];
      if (pr && pr.ciclo) return fechaFin(pr.ciclo);
    }
    /* 22-oct-2026 — el perdón de capital de un pacto va con el pago que pactó
       (`para`), en la quincena que lo contiene: una fecha libre como el 6-nov
       no es fila de ningún tablero. */
    if (c.sobre === 'pacto' && fechaFin(c.para)) return quincenaDe(c.para) || '';
    if (p && p.pagado && fechaFin(p.fechaPagado) === f && p.cicloPago) {
      return fechaFin(p.cicloPago);
    }
    /* Último recurso. Si ese día hubiera habido un cambio de corte, alguna de
       las dos ramas de arriba habría apareado, así que acá sí es seguro. */
    return corteVigenteEn(p, f) || '';
  }

  /**
   * Lo perdonado en la quincena que cierra en `q`, partido por concepto.
   *
   * `clientes` son socios DISTINTOS: un cliente con dos créditos perdonados la
   * misma quincena es UN cliente, y contar entradas infla justo el número que
   * más duele mirar.
   *
   * @returns {{mora:number, costo:number, total:number, veces:number, clientes:number}}
   */
  function descuentosDeQuincena(db, q) {
    var corte = fechaFin(q);
    var vacio = { mora: 0, costo: 0, total: 0, veces: 0, clientes: 0 };
    /* Sin corte no se puede ubicar nada, y devolver ceros evita que el '' de
       una condonación sin fecha se aparee con un '' de quincena. */
    if (!corte) return vacio;
    var mora = 0, costo = 0, veces = 0, quienes = {};
    lista(db && db.prestamos).forEach(function (p) {
      lista(p && p.condonaciones).forEach(function (c) {
        /* 22-oct-2026 — el capital que Joan perdona al pactar el próximo pago
           (pactarProximoPago) no es un descuento de la GANANCIA de la quincena
           —el tablero dice «ya restados de la ganancia», y este no lo está—:
           es capital que no vuelve, y se ve en lo que te deja el crédito y el
           cliente (gananciaDelCredito). Contarlo acá sumaba un cliente y una
           vez a una quincena con descuento $0. */
        if (!num(c && c.mora) && !num(c && c.costo) && num(c && c.capital) > 0) return;
        if (quincenaDeCondonacion(p, c) !== corte) return;
        mora += num(c.mora);
        costo += num(c.costo);
        veces++;
        if (p.socioId) quienes[p.socioId] = true;
      });
    });
    return { mora: Math.round(mora), costo: Math.round(costo),
             total: Math.round(mora + costo), veces: veces,
             clientes: Object.keys(quienes).length };
  }

  /* ==========================================================================
   * EL COBRO CON MONTO REAL Y DESCUENTO — la ley, en un solo sitio (7-sep-2026)
   *
   * Nació el 14-ago en panel/espejo.html (cuentasDelCobro, repartoDelDescuento,
   * descuentosDelSocio) y la receta para el computador decía «pégala igual en
   * crm.html». Eso habría sido la copia número trece de este proyecto: dos
   * versiones de la misma cuenta que se separan el primer día que alguien toca
   * una. Acá vive UNA, y la prueban las mismas pruebas de siempre
   * (pruebas/cobro.test.js) más un contrato que exige que el espejo, mientras
   * conserve su copia, conteste peso a peso lo mismo que ésta.
   *
   * LA REGLA QUE ORDENA TODO EL BLOQUE, y de la que sale que el reparto siga
   * sumando 100% exacto:
   *
   *     repartirCosto() reparte LA PLATA QUE ENTRÓ.
   *
   * El descuento NO es un cuarto pedazo del reparto: es una línea aparte de la
   * contabilidad. Por eso p.gananciaPago conserva su significado de siempre —el
   * costo TOTAL que entró, costo cobrado + mora cobrada— y garantiaGanadaCredito,
   * gananciaCobrada, amortizarCupon y la app del socio siguen dando la respuesta
   * correcta sin enterarse de que hubo descuento.
   *
   * Si en cambio se acreditara el costo NOMINAL habiendo entrado menos, los tres
   * pedazos sumarían 100% DE UN NÚMERO EQUIVOCADO: el socio se llevaría cupo que
   * su plata no respalda —capital de Joan, retirable la quincena siguiente— y
   * `expuesto` bajaría de mentira. La exposición de Joan CRECERÍA. Prohibido.
   *
   * Acá no se calcula ni una garantía ni un porcentaje a mano: los dos repartos
   * —el nominal y el cobrado— los hace el motor, y la garantía es la que el
   * propio reparto devuelve. Restar dos respuestas del motor no es reimplementar
   * una regla; inventar una tercera sí lo sería.
   * ========================================================================*/

  /**
   * Las cuentas de UN cobro con lo que de verdad entró.
   * @param {object} db      la cartera (para el cupón pendiente del socio)
   * @param {object} p       el crédito
   * @param {object} liq     la liquidación del puente para la fecha del cobro
   * @param {object} [o]     {condonaCosto, condonaMora} en PESOS, topados acá
   */
  function cuentasDelCobro(db, p, liq, o) {
    o = o || {};
    var l = (liq && typeof liq === 'object') ? liq : {};
    var condMora = Math.max(0, Math.min(Math.round(num(o.condonaMora)), Math.round(num(l.recargo_mora))));
    var condCosto = Math.max(0, Math.min(Math.round(num(o.condonaCosto)), Math.round(num(l.costo))));
    var costoCobrado = Math.round(num(l.costo)) - condCosto;
    var moraCobrada = Math.round(num(l.recargo_mora)) - condMora;
    /* Lo que entra por concepto de COSTO. El capital no vive acá: no genera
       garantía ni se reparte, vuelve y ya. */
    var entro = costoCobrado + moraCobrada;

    /* El 15% del cupón deja de cobrarse cuando ese socio ya devolvió el suyo,
       así que el reparto necesita saber cuánto le falta. */
    var pendiente;
    try {
      var socio = lista(db && db.socios).filter(function (x) { return x && p && x.id === p.socioId; })[0];
      pendiente = socio ? contabilidadCupon(db, socio).cupon_pendiente : undefined;
    } catch (e) { pendiente = undefined; }
    /* 26-sep-2026 — COSTO Y MORA POR SEPARADO. Se repartía costo+mora en un solo
       número y la mora salía 80/20 como si fuera costo: la pantalla le prometía
       al socio garantía por la mora que después no se acreditaba, y al perdonar
       la mora decía que le costaba cupo a él y casi nada a Joan — al revés: la
       mora es toda de Joan. Ahora la mora entra entera a operativo (motor). */
    function repartir(costo, mora) {
      return M.repartirCosto(costo, { aTiempo: l.acredita_en_fecha !== false, producto: 'quincenal',
                                      cuponPendiente: pendiente, mora: mora,
                                      fechaDelCredito: fechaDelCredito(p) });
    }
    var nominal = repartir(Math.round(num(l.costo)), Math.round(num(l.recargo_mora)));
    var cobrado = repartir(costoCobrado, moraCobrada);

    return {
      condonado_costo: condCosto,
      condonado_mora: condMora,
      condonado_total: condCosto + condMora,
      costo_cobrado: costoCobrado,
      mora_cobrada: moraCobrada,
      /* Lo que se guarda en p.gananciaPago. Mismo significado de siempre. */
      ganancia_pago: entro,
      /* Lo que el socio tiene que entregar con este descuento aplicado. */
      total_a_recibir: Math.round(num(l.capital)) + entro,
      /* Los tres pedazos de la plata que ENTRÓ. Suman `entro` exacto por
         construcción del motor (operativo absorbe el redondeo). */
      reparto: cobrado,
      garantia: cobrado.garantia_socio,
      garantia_sin_descuento: nominal.garantia_socio,
      /* Lo que el descuento le cuesta a Joan: el pedazo del reparto que era
         suyo —operativo más el cupón que se iba a recuperar— y que ya no entra.
         El resto del descuento lo paga el socio en cupo que no recibe. Las dos
         cifras suman el descuento entero: no hay plata perdonada sin dueño. */
      de_tu_ganancia: (nominal.operativo + nominal.amortiza_cupon)
                    - (cobrado.operativo + cobrado.amortiza_cupon),
      de_su_cupo: nominal.garantia_socio - cobrado.garantia_socio
    };
  }

  /**
   * Dónde cae la plata perdonada. NO es una regla de negocio nueva: son dos
   * bolsas con dos dueños distintos —la mora perdonada es casi toda ganancia de
   * Joan; el costo perdonado es tres cuartas partes cupo del socio— y `sobre`
   * decide cuál se vacía PRIMERO. Lo que no quepa desborda a la otra, y la
   * pantalla lo dice. El capital no entra: perdonar capital es una pérdida, no
   * un descuento.
   * @returns {{excede:boolean, tope:number, costo:number, mora:number, hay_eleccion:boolean}}
   */
  function repartoDelDescuento(liq, falta, sobre) {
    var l = (liq && typeof liq === 'object') ? liq : {};
    var mora = Math.round(num(l.recargo_mora)), costo = Math.round(num(l.costo));
    var tope = mora + costo;
    var f = Math.round(num(falta));
    if (f > tope) return { excede: true, tope: tope, costo: 0, mora: 0, hay_eleccion: mora > 0 && costo > 0 };
    var deMora = 0, deCosto = 0;
    if (sobre === 'costo') { deCosto = Math.min(f, costo); deMora = f - deCosto; }
    else { deMora = Math.min(f, mora); deCosto = f - deMora; }
    return {
      excede: false, tope: tope, costo: deCosto, mora: deMora,
      /* Solo hay algo que elegir si el faltante cabe holgado en una sola bolsa:
         con mora 0 no hay nada que preguntar, y si ya desborda la mora, la
         elección solo cambia el orden. */
      hay_eleccion: mora > 0 && costo > 0 && f <= Math.max(mora, costo)
    };
  }

  /**
   * LAS CUENTAS DE UNA PRÓRROGA CON MONTO REAL — 8-sep-2026.
   *
   * Pedido de Joan: «el precio de la prórroga también quiero que sea ajustable».
   * Una prórroga son DOS movimientos con dos factores distintos (así los reparte
   * movimientosCobradosCredito): el costo del ciclo, con el factor de puntualidad
   * de la prórroga, y el recargo de mora, SIEMPRE a la mitad. Por eso no sirve
   * cuentasDelCobro tal cual —que reparte un solo monto con un solo factor— y
   * hay que repartir cada pedazo por su lado, nominal y cobrado, y restar.
   *
   * La garantía sale de la MISMA fórmula que garantiaGanadaProrroga aplica
   * después al movimiento guardado (hay una prueba que lo exige): lo que Joan
   * ve antes de confirmar es lo que el socio va a ver en su app.
   *
   * @param {object} db
   * @param {object} p        el crédito
   * @param {object} causado  {costo, mora, acredita_en_fecha} — lo que el motor
   *                          cotizó SIN perdón (costo_prorroga, recargo_mora)
   * @param {object} [o]      {condonaCosto, condonaMora} en PESOS, topados acá
   */
  function cuentasDeLaProrroga(db, p, causado, o) {
    o = o || {};
    var c = (causado && typeof causado === 'object') ? causado : {};
    var costo = Math.round(num(c.costo)), mora = Math.round(num(c.mora));
    var acredita = c.acredita_en_fecha !== false;
    var condMora = Math.max(0, Math.min(Math.round(num(o.condonaMora)), mora));
    var condCosto = Math.max(0, Math.min(Math.round(num(o.condonaCosto)), costo));
    var costoCobrado = costo - condCosto, moraCobrada = mora - condMora;

    var pendiente;
    try {
      var socio = lista(db && db.socios).filter(function (x) { return x && p && x.id === p.socioId; })[0];
      pendiente = socio ? contabilidadCupon(db, socio).cupon_pendiente : undefined;
    } catch (e) { pendiente = undefined; }
    /* 26-sep-2026: el costo con su factor y la mora ENTERA a operativo. Antes la
       mora se repartía «a la mitad» como un costo más, y la pantalla de prórroga
       prometía garantía por ella. */
    function reparto(monto, moraDelPedazo) {
      return M.repartirCosto(Math.max(0, monto), { aTiempo: acredita, producto: 'quincenal',
                                                   cuponPendiente: pendiente, mora: Math.max(0, moraDelPedazo),
                                                   fechaDelCredito: fechaDelCredito(p) });
    }
    var nom = reparto(costo, mora), cob = reparto(costoCobrado, moraCobrada);

    return {
      condonado_costo: condCosto,
      condonado_mora: condMora,
      condonado_total: condCosto + condMora,
      costo_cobrado: costoCobrado,
      mora_cobrada: moraCobrada,
      /* Lo que el socio paga por la prórroga: es lo que va a pr.monto. */
      monto: costoCobrado + moraCobrada,
      /* Del reparto, y no de acumularGarantia(costo): así lleva la misma cuenta
         de la mora vieja que el resto (cero en toda prórroga de hoy en adelante). */
      garantia: cob.garantia_socio,
      garantia_sin_descuento: nom.garantia_socio,
      /* Las dos cifras suman el descuento entero: no hay plata perdonada sin
         dueño en la pantalla. Perdonar MORA le cuesta todo a Joan y nada al cupo
         del socio, porque la mora nunca fue garantía. */
      de_tu_ganancia: (nom.operativo + nom.amortiza_cupon) - (cob.operativo + cob.amortiza_cupon),
      de_su_cupo: nom.garantia_socio - cob.garantia_socio,
      /* 3-oct-2026 — los tres pedazos de la plata que ENTRÓ por la prórroga, como
         ya los devuelve cuentasDelCobro. Los necesita abonoConProrroga (más
         abajo) para enseñarle a Joan el 80/20 antes de confirmar sin volver a
         armar el reparto por su cuenta: una segunda llamada al motor con las
         opciones copiadas a mano es como nacen dos verdades. */
      reparto: cob
    };
  }

  /* ==========================================================================
   * ABONO + PRÓRROGA EN UN SOLO PASO — 3-oct-2026
   *
   * Pedido de Joan, con una cliente real delante: «hizo un abono de 200.000 y
   * el resto de la deuda se financia para la siguiente quincena, pero el CRM no
   * tiene la función de abonos… quiero que yo tenga la posibilidad de hacerlo
   * manual».
   *
   * Hasta hoy eso eran DOS botones —«Queda debiendo» (abonarCapital) y la
   * prórroga (registrarProrroga)— y EL ORDEN EN QUE SE APRETABAN CAMBIABA LA
   * PLATA. Medido con el caso real (400.000 al 20%, corte 1-oct, paga el 3-oct):
   *
   *   · prórroga PRIMERO y abono después: abonarCapital anota el abono en el
   *     ciclo NUEVO (`ciclo: p.cicloActual`, que ya se movió) y le congela como
   *     costo causado el que acaba de cotizar el puente: 80.000, sacados de los
   *     400.000 de antes del abono. causadoDelCiclo lo toma de PISO y la
   *     quincena siguiente cobra 80.000 sobre un capital de 288.000.
   *   · abono PRIMERO y prórroga después: el abono se anota en el ciclo VIEJO
   *     (1-oct) y su congelado se queda allá —causadoDelCiclo solo mira el
   *     ciclo vigente—. El ciclo nuevo arranca el día de la prórroga
   *     (inicioDelCiclo) y capitalVigenteEn de ese día ya descuenta el abono
   *     del mismo día: 288.000 × 20% = 57.600. Es lo que Joan pidió: «el resto
   *     se financia».
   *
   * Por eso esta función FIJA el segundo orden y devuelve, ya armados,
   * EXACTAMENTE los registros que esos dos botones escribirían en ese orden
   * (pruebas/abono-con-prorroga.test.js corre el CRM de verdad y los compara
   * campo por campo). La pantalla solo los empuja a las listas que ya existen
   * —abonosCapital, prorrogas, condonaciones, comprobantes— en UN guardar():
   * los dos o ninguno. Sin campos nuevos: el historial, Cobranzas, el paquete
   * del socio (migrarSocio) y la nube (LISTAS_QUE_SUMAN) ya los entienden.
   *
   * EL ORDEN EN QUE SE APLICA LA PLATA, que es el de la ley de pagos de
   * siempre: primero el recargo de mora (menos lo que Joan perdone, con
   * motivo), después el costo del ciclo —esos dos son el PRECIO de la
   * prórroga, el mismo que cotiza MotorReglas.liquidarProrroga— y lo que sobre,
   * a capital. El corte nuevo lo pone el motor (fechaCorteProrroga), el mismo
   * de cualquier prórroga.
   *
   * LO QUE NO HACE, y por qué:
   *   · No perdona COSTO. Si la plata alcanza para el costo y sobra para
   *     capital, perdonarle costo sería cobrarle capital con plata que era
   *     precio. Si NO alcanza para la prórroga, se dice y se ofrecen los
   *     caminos que ya existen (prórroga con descuento, acuerdo, queda
   *     debiendo): esa hoja sí sabe perdonar costo.
   *   · No salda. Si la plata cubre el capital entero, es «Pagó todo» y se
   *     dice: un abono que deja el capital en cero no es una prórroga.
   *   · No inventa prórrogas. Pagado, en plan de pagos, capital en cero o sin
   *     prórrogas en su nivel: se dice por qué, y en el último caso se ofrece
   *     el plan de pagos del §8 que arma el motor, como hoy.
   *   · El abono NO deja garantía: no es costo (garantiaGanadaCredito no mira
   *     abonosCapital). La garantía y el 80/20 son los de la prórroga, ni un
   *     peso más, y la mora deja lo que diga la fecha del crédito
   *     (MotorReglas.garantiaDeMoraPagada, FECHA_MORA_SIN_GARANTIA).
   * ========================================================================*/

  /* El crédito en el idioma del motor: la MISMA traducción que creditoMotor()
     de crm.html y de espejo.html, campo por campo. Vive acá adentro y no
     exportada porque abonoConProrroga es su único cliente en el puente; el día
     que el CRM y el espejo dejen sus dos copias (el espejo ya lo anuncia), se
     exporta esta y se borran aquellas. La prueba compara los registros contra
     el CRM corriendo de verdad: si esta traducción se separa de la suya, se
     entera. */
  function creditoParaElMotor(db, p, fecha) {
    var s = lista(db && db.socios).filter(function (x) { return x && x.id === p.socioId; })[0];
    var nivel = 'hierro';
    if (s) { try { nivel = migrarSocio(db, s).garantia.nivel; } catch (e) { nivel = 'hierro'; } }
    return {
      id: p.id,
      capital: capitalActual(p),
      tasa_aplicada: (num(p.costoPct) || Math.round(M.TASA_CREDITO * 100)) / 100,
      costo: Math.round(K(p)),
      fecha_corte: corteDelCredito(p),
      fecha_desembolso: fechaDelCredito(p),
      estado: p.pagado ? 'pagado' : (tienePlan(p) ? 'plan_de_pagos' : 'en_corte'),
      prorrogas_usadas: lista(p.prorrogas).length,
      estuvo_en_mora: !!liquidarCiclo(p, fecha).estuvo_en_mora,
      nivel_socio: nivel
    };
  }
  /* La prórroga de ESE día, como la cotiza liqProrroga() del CRM: la mora que
     cobra es la YA CAUSADA (liquidarCiclo recorre los hechos) menos el perdón,
     con los mismos días, para que el motor no corra ni un día de más. */
  function prorrogaDelMotor(db, p, f, condonaMora) {
    if (!p || p.pagado || tienePlan(p) || capitalActual(p) <= 0) return null;
    var liq = liquidarCiclo(p, f);
    var cond = Math.min(Math.max(0, Math.round(num(condonaMora))), Math.round(liq.recargo_mora));
    try {
      return M.liquidarProrroga(creditoParaElMotor(db, p, f), f,
        { recargoCausado: liq.recargo_mora - cond, diasCausados: liq.dias_mora });
    } catch (e) { return null; }
  }
  /* Pesos a la colombiana sin depender del Intl del aparato: este texto lo leen
     el CRM y el celular, y un navegador viejo sin datos de idioma pintaría
     «400000» en uno y «400.000» en el otro. */
  function pesos(n) {
    var v = Math.round(num(n));
    return (v < 0 ? '-$' : '$') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  /* «15 de octubre de 2026», por la misma razón: el texto tiene que salir igual
     en los dos aparatos. */
  var MESES_TEXTO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaTexto(iso) {
    var s = fechaFin(iso);
    if (!s) return '';
    return Number(s.slice(8, 10)) + ' de ' + MESES_TEXTO[Number(s.slice(5, 7)) - 1] + ' de ' + s.slice(0, 4);
  }
  /* «a, b o c»: las salidas que se ofrecen se leen como una frase. */
  function unaU(partes) {
    return partes.length < 2 ? (partes[0] || '')
      : partes.slice(0, -1).join(', ') + ' o ' + partes[partes.length - 1];
  }
  /* Una copia del crédito con las listas copiadas: las cuentas de la línea de
     tiempo solo LEEN, así que alcanza con que las listas nuevas no sean las del
     crédito real. El crédito de Joan no se toca nunca (regla de oro de arriba). */
  function creditoCon(p, cambios) {
    var c = Object.assign({}, p, {
      abonosCapital: lista(p.abonosCapital).slice(),
      prorrogas: lista(p.prorrogas).slice(),
      condonaciones: lista(p.condonaciones).slice()
    });
    return Object.assign(c, cambios || {});
  }

  /**
   * Abono + prórroga: el cliente entrega `monto` el día `fecha`, se le paga la
   * prórroga con eso y lo que sobra baja el capital, que pasa a la quincena
   * siguiente.
   *
   * @param {object} db     la cartera (nivel del socio y cupón pendiente)
   * @param {object} p      el crédito
   * @param {string} fecha  'AAAA-MM-DD', el día en que pagó; por defecto hoy
   * @param {number} monto  lo que entregó, en pesos (lo teclea Joan)
   * @param {object} [o]    {condonaMora: pesos perdonados de la mora (el % lo
   *                        convierte la pantalla, como en el cobro), motivo
   *                        (obligatorio si hay perdón), quien ('computador'),
   *                        pacto: {fecha, monto, motivo} — el próximo pago que
   *                        decide Joan (22-oct-2026); lo que no venga es la
   *                        cuenta del CRM}
   * @returns {object} ver `r` abajo. Si `ok`, `registros` trae {abono|null,
   *          prorroga, condonacion|null, comprobante, cicloActual}; la pantalla
   *          los empuja tal cual, el comprobante solo si hay foto (con su
   *          `fecha` y su `foto`, como addComp).
   */
  function abonoConProrroga(db, p, fecha, monto, o) {
    o = (o && typeof o === 'object') ? o : {};
    var f = fechaFin(fecha) || hoyISO();
    var x = Math.round(Number(monto));
    var r = {
      ok: false, motivo: null, detalle: '', caminos: [],
      fecha: f, monto: isFinite(x) ? x : 0,
      capital_antes: 0, corte_antes: null,
      dias_mora: 0, a_tiempo: true,
      mora: 0, mora_condonada: 0, mora_cobrada: 0, costo: 0, precio_prorroga: 0,
      a_capital: 0, capital_despues: 0, total_para_saldar: 0, falta: 0, sobra: 0,
      corte_nuevo: null, costo_siguiente: 0, total_siguiente: 0,
      garantia: 0, reparto: null, de_tu_ganancia: 0, de_su_cupo: 0,
      nivel_socio: null, prorrogas_usadas: 0, prorrogas_permitidas: 0, prorrogas_restantes: 0,
      plan_de_pagos: null, hay_acuerdo: false, registros: null,
      /* 3-oct-2026 (revisión): el acuerdo respetado, la plata de más del mismo
         día de la prórroga, y lo que va a capital cuando se ofrece «Queda
         debiendo» (en el plan de pagos es lo que sobra de la entrada). */
      acuerdo: null, mora_condonada_acuerdo: 0, mismo_dia: null,
      a_capital_sugerido: null, entrada_plan: 0,
      /* 22-oct-2026: la cuenta del CRM para el próximo pago, lo que pactó Joan
         (si lo cambió) y lo que te deja el crédito y el cliente con esta
         decisión. */
      sugerido: null, pacto: null, proximo: null, ganancia: null, ganancia_cliente: null
    };
    function no(motivo, detalle, caminos) {
      r.ok = false; r.motivo = motivo; r.detalle = detalle; r.caminos = caminos || [];
      r.registros = null;
      return r;
    }
    /* La regla de la casa para este paquete: no lanza NUNCA. Un crédito con un
       dato sucio no puede tumbar la hoja de cobro; dice que no pudo y no
       registra nada. */
    try { return cuenta(); }
    catch (e) {
      return no('error', 'No pude hacer la cuenta de este crédito (' +
        String((e && e.message) || e).slice(0, 120) + '). No registré nada.');
    }
    function cuenta() {
      if (!p || typeof p !== 'object') return no('sin_credito', 'No encontré el crédito.');
      r.corte_antes = corteDelCredito(p) || null;
      r.hay_acuerdo = !!(p.acuerdo && !p.pagado);

      if (p.pagado) return no('pagado', 'Este crédito ya está pagado: no hay nada que prorrogar.');
      if (tienePlan(p)) {
        /* 22-oct-2026 — el próximo pago que pactó Joan (pactarProximoPago) es
           una cuota con su fecha y su monto: no se prorroga, pero mientras no
           venza él lo puede volver a pactar. Se dice con sus cifras. */
        if (esPacto(p)) {
          /* «Vivo» con la fecha de la hoja, no con el reloj de este archivo: el
             reloj del puente no es el de la página que cobra. */
          var cuotaP = cuotaPlanActual(p), fp = corteDelCredito(p);
          var vivo = !!fp && fp >= f;
          return no('pacto', 'Este crédito tiene un próximo pago acordado: ' +
            pesos(cuotaP ? liquidarCiclo(p, fp).total_a_pagar : 0) + ' el ' + fechaTexto(fp) + '. No se prorroga: ' +
            'cóbralo o, si trajo una parte, anótala como abono (va primero a la mora, después al costo y después ' +
            'al capital)' + (vivo ? '; y si el resto pasa a otra fecha, cámbiala con «✏️ Ajustar el próximo pago».'
                                  : '. Ese pago ya venció: su fecha ya no se mueve.'),
            vivo ? ['cuota_del_plan', 'ajustar'] : ['cuota_del_plan']);
        }
        if (esPlanDeAlta(p)) {
          return no('plan_de_pagos', 'Este crédito es a cuotas: no se prorroga. Cóbrale la cuota que sigue ' +
            'o, si trajo solo una parte, anótala como abono a la cuota.', ['cuota_del_plan']);
        }
        return no('plan_de_pagos', 'Este crédito está en plan de pagos: de ahí no se sale ' +
          'prorrogando. Cóbrale la cuota que sigue.', ['cuota_del_plan']);
      }
      r.capital_antes = capitalActual(p);
      if (r.capital_antes <= 0) {
        return no('capital_cero', 'Este crédito no admite prórroga: su capital quedó en cero.');
      }
      /* LA MISMA OPERACIÓN DOS VECES NO SE PUEDE. Después de aplicarla, el corte
         ya se movió y volver a calcular desde el crédito nuevo daría OTRA
         prórroga —la 2 de 2— con la misma plata: un doble clic le quemaría al
         socio su última prórroga y le cobraría dos veces el costo. Dos prórrogas
         el mismo día no compran nada que una no compre, así que si ese día ya hay
         una, se para acá. */
      var hoyYa = lista(p.prorrogas).filter(function (pr) { return fechaFin(pr && pr.fecha) === f; })[0];
      if (hoyYa) return yaRegistrado(hoyYa);

      /* 3-oct-2026 (revisión) — EL ACUERDO SE RESPETA. Si el crédito tiene un
         acuerdo pactado y paga a más tardar el día pactado, la prórroga cuesta
         lo que se le prometió por WhatsApp («ese valor te lo respetamos pagando
         ese día»): la mora congelada al pactar, no la causada hoy. Antes esta
         operación cobraba lo causado y decía «queda cumplido»: con un pacto del
         3-oct por 88.000 y el pago el 10-oct, cobraba 116.000. La diferencia es
         un perdón, y entra por el MISMO camino que el descuento de Joan
         (condonaMora, con su condonación anotada y su motivo): así el motor, la
         garantía y el 80/20 la ven igual que cualquier perdón. Si Joan perdona
         MÁS que el acuerdo, manda lo suyo. Tarde, el precio pactado venció y se
         cobra lo causado, como en cumplirAcuerdo. */
      var ac = r.hay_acuerdo ? p.acuerdo : null;
      var acPara = ac ? fechaFin(ac.pactadaPara) : '';
      var liqA = liquidarCiclo(p, f);
      var condAcuerdo = (acPara && f <= acPara)
        ? Math.max(0, Math.round(liqA.recargo_mora) - Math.round(num(ac.mora))) : 0;
      r.acuerdo = ac ? { para: acPara, pactado: fechaFin(ac.pactadoEl) || null, monto: Math.round(num(ac.monto)),
        mora: Math.round(num(ac.mora)), en_fecha: !!(acPara && f <= acPara), perdona: condAcuerdo } : null;
      var condPedida = Math.max(0, Math.round(num(o.condonaMora)));
      var condEfectiva = Math.max(condPedida, condAcuerdo);
      var r0 = prorrogaDelMotor(db, p, f, condEfectiva);
      if (!r0) return no('sin_prorroga', 'No pude liquidar la prórroga de este crédito.');
      r.nivel_socio = r0.nivel_socio;
      r.prorrogas_usadas = r0.prorrogas_usadas;
      r.prorrogas_permitidas = r0.prorrogas_permitidas;
      if (!r0.ok) {
        /* Como registrarProrroga: el plan SIN el descuento. La entrada del plan la
           arma otro flujo que no anota perdones, y una mora rebajada que nadie
           registró es plata que desaparece en silencio. */
        var sinDesc = prorrogaDelMotor(db, p, f, 0) || r0;
        r.plan_de_pagos = sinDesc.plan_de_pagos || null;
        r.entrada_plan = Math.round(num(sinDesc.total_a_pagar));
        var txtPlan = 'Ya usó sus ' + r0.prorrogas_permitidas +
          ' prórroga(s): es lo que da el nivel ' + r0.nivel_socio + '. No se puede pasar ' +
          'a la quincena siguiente con un abono; la salida es el plan de pagos (§8): el ' +
          'capital en ' + M.CUOTAS_PLAN_DE_PAGOS + ' cortes con un costo reducido del ' +
          Math.round(M.TASA_PLAN_DE_PAGOS * 100) + '%.';
        /* 3-oct-2026 (revisión) — LA PLATA QUE ENTREGÓ NO SE PUEDE PERDER. Con
           200.000 y una entrada del plan de 92.000, el plan solo anota la entrada,
           y después ya no se abona por fuera («está en plan de pagos»): los otros
           108.000 no tenían dónde quedar. El orden que sirve es abono PRIMERO
           —congela el costo y la mora del ciclo, así que la entrada no cambia— y
           plan DESPUÉS, que se arma sobre el capital que quedó. Se dice, con la
           cifra, y se ofrece «Queda debiendo» con ese monto y no con todo. */
        var sobraPlan = (isFinite(x) && x > r.entrada_plan) ? x - r.entrada_plan : 0;
        if (sobraPlan > 0 && sobraPlan >= r.capital_antes) {
          r.total_para_saldar = r.capital_antes + r.entrada_plan;
          return no('prorrogas_agotadas', txtPlan + ' Y con ' + pesos(x) + ' salda el crédito entero (' +
            pesos(r.total_para_saldar) + '): eso es «Pagó todo».', ['pago_total', 'plan_de_pagos']);
        }
        if (sobraPlan > 0) {
          r.a_capital_sugerido = sobraPlan;
          return no('prorrogas_agotadas', txtPlan + ' Con ' + pesos(x) + ': la entrada del plan es ' +
            pesos(r.entrada_plan) + ' y sobran ' + pesos(sobraPlan) + '. Anota PRIMERO esos ' +
            pesos(sobraPlan) + ' como abono a capital («Queda debiendo») y DESPUÉS registra el plan: ' +
            'la entrada sigue siendo ' + pesos(r.entrada_plan) + ' y el plan se arma sobre el capital ' +
            'que quede. Al revés no se puede: con el plan registrado ya no se abona por fuera.',
            ['queda_debiendo', 'plan_de_pagos']);
        }
        return no('prorrogas_agotadas', txtPlan, ['plan_de_pagos']);
      }

      var liq0 = liquidarCiclo(p, f);
      r.dias_mora = liq0.dias_mora;
      r.a_tiempo = !!r0.a_tiempo;
      r.mora = Math.round(liq0.recargo_mora);
      r.mora_condonada = Math.min(condEfectiva, r.mora);
      /* Lo que perdona el acuerdo y lo que perdona Joan, separados para la
         pantalla: el total es uno solo (el mayor), y si el del acuerdo manda, el
         motivo es el acuerdo. */
      r.mora_condonada_acuerdo = condAcuerdo >= condPedida ? Math.min(condAcuerdo, r.mora) : 0;
      r.mora_cobrada = r0.recargo_mora;
      r.costo = r0.costo_prorroga;
      r.precio_prorroga = r0.total_a_pagar;
      r.total_para_saldar = r.capital_antes + r.precio_prorroga;
      r.corte_nuevo = r0.fecha_corte_nueva;

      if (!isFinite(x) || x < 0) return no('monto_invalido', 'Escribe cuánto entregó, en pesos.');
      if (x < r.precio_prorroga) {
        /* No alcanza ni para la prórroga. No se inventa nada: se ofrecen los
           caminos que ya existen, y cada uno con su regla. */
        r.falta = r.precio_prorroga - x;
        var caminos = ['prorroga_con_descuento'];
        var frases = ['registrar la prórroga con descuento (le perdonas lo que falta, con su motivo)'];
        if (!r.hay_acuerdo) { caminos.push('acuerdo'); frases.push('pactarla para otro día'); }
        if (x > 0) {
          caminos.push('queda_debiendo');
          r.a_capital_sugerido = x;
          frases.push('anotar los ' + pesos(x) + ' como abono a capital (sigue debiendo el costo ' +
            'y la mora, y la mora sigue corriendo)');
        }
        return no('no_alcanza', 'Con ' + pesos(x) + ' no alcanza la prórroga: cuesta ' +
          pesos(r.precio_prorroga) + ' (' + pesos(r.costo) + ' del costo del ciclo' +
          (r.mora_cobrada ? ' + ' + pesos(r.mora_cobrada) + ' de mora' : '') + '). Faltan ' +
          pesos(r.falta) + '. Puedes ' + unaU(frases) + '.', caminos);
      }
      if (x - r.precio_prorroga >= r.capital_antes) {
        /* El abono nunca puede llevarse el capital entero: eso es saldar, y
           `a_capital` se queda en cero para que ninguna pantalla pinte un abono
           más grande que la deuda. */
        r.sobra = x - r.total_para_saldar;
        return no('paga_todo', 'Con ' + pesos(x) + ' salda el crédito entero: el total para ' +
          'saldar es ' + pesos(r.total_para_saldar) + (r.sobra > 0 ? ' y le sobran ' +
          pesos(r.sobra) : '') + '. Eso es «Pagó todo», no una prórroga.', ['pago_total']);
      }
      r.a_capital = x - r.precio_prorroga;
      var motivo = String(o.motivo == null ? '' : o.motivo).trim().slice(0, 120);
      /* El perdón del acuerdo trae su propio motivo: el pacto, con su fecha y
         el motivo del descuento que se escribió al pactar, si lo hubo. */
      if (!motivo && r.mora_condonada_acuerdo > 0) {
        motivo = ('acuerdo pactado' + (r.acuerdo.pactado ? ' el ' + fechaTexto(r.acuerdo.pactado) : '') +
          ': precio congelado' + (ac.motivoDescuento ? ' · ' + String(ac.motivoDescuento) : '')).slice(0, 120);
      }
      if (r.mora_condonada > 0 && !motivo) {
        return no('falta_motivo', 'Falta el motivo del descuento: dentro de tres meses, un ' +
          'descuento sin motivo es un cuadre que no cuadra.');
      }

      /* PRIMERO EL ABONO, en el ciclo VIEJO y con lo causado congelado: es
         exactamente lo que abonarCapital(id, fecha) escribe si se aprieta antes
         que la prórroga. Su congelado se queda en el ciclo viejo, que es donde se
         causó. */
      var abono = r.a_capital > 0 ? {
        fecha: f, monto: r.a_capital, ciclo: p.cicloActual,
        costoCausado: liq0.costo, moraCausada: liq0.recargo_mora, diasMoraCausada: liq0.dias_mora
      } : null;
      var conAbono = creditoCon(p, abono ? { abonosCapital: lista(p.abonosCapital).concat([abono]) } : null);

      /* DESPUÉS LA PRÓRROGA, cotizada sobre el crédito YA abonado, como la
         cotizaría registrarProrroga en ese momento. El precio no puede haber
         cambiado: el costo ya estaba causado y la mora corrida es la del capital
         que había. Si cambiara, la cuenta de arriba y la de abajo leyeron
         estados distintos, y eso no se registra: se avisa. */
      var liq1 = liquidarCiclo(conAbono, f);
      var r1 = prorrogaDelMotor(db, conAbono, f, r.mora_condonada);
      if (!r1 || !r1.ok || r1.total_a_pagar !== r.precio_prorroga ||
          r1.fecha_corte_nueva !== r.corte_nuevo) {
        return no('no_cuadra', 'No cuadra: la prórroga costaba ' + pesos(r.precio_prorroga) +
          ' antes del abono y ' + pesos(r1 ? r1.total_a_pagar : 0) + ' después. No registré nada.');
      }
      var prorroga = { fecha: r1.fecha, ciclo: r1.fecha_corte_anterior, monto: r1.total_a_pagar,
        mora: r1.recargo_mora, aTiempo: r1.a_tiempo, diasMora: r1.dias_mora,
        nuevoCiclo: r1.fecha_corte_nueva,
        costoCausado: Math.round(liq1.costo), moraCausada: Math.round(liq1.recargo_mora) };
      var condonacion = r.mora_condonada > 0 ? { fecha: r1.fecha, costo: 0, mora: r.mora_condonada,
        motivo: motivo, quien: String(o.quien || 'computador'), sobre: 'prorroga' } : null;

      /* El crédito como queda, para PREGUNTARLE —no para deducir— lo que va a
         deber: el costo del ciclo nuevo sale de K() sobre el capital que quedó. */
      var despues = creditoCon(conAbono, { cicloActual: r1.fecha_corte_nueva });
      despues.prorrogas.push(prorroga);
      if (condonacion) despues.condonaciones.push(condonacion);
      var liqN = liquidarCiclo(despues, r1.fecha_corte_nueva);
      r.capital_despues = capitalActual(despues);
      r.costo_siguiente = liqN.costo;
      r.total_siguiente = liqN.total_a_pagar;
      r.prorrogas_restantes = r1.prorrogas_restantes;

      /* La garantía y el 80/20, de la prórroga y solo de la prórroga. Tres
         respuestas que tienen que ser la misma: el motor al cotizar, el reparto
         que ve Joan y lo que el puente le va a acreditar al socio por el
         movimiento guardado. Si no lo son, no se registra. */
      var cp = cuentasDeLaProrroga(db, conAbono,
        { costo: r1.costo_prorroga, mora: Math.round(liq1.recargo_mora),
          acredita_en_fecha: r1.acredita_en_fecha },
        { condonaMora: r.mora_condonada });
      var acreditada = garantiaGanadaProrroga(prorroga, despues);
      if (cp.monto !== r1.total_a_pagar || cp.garantia !== r1.garantia_generada ||
          acreditada !== r1.garantia_generada) {
        return no('no_cuadra', 'No cuadra la garantía: el motor dice ' + pesos(r1.garantia_generada) +
          ' y el socio vería ' + pesos(acreditada) + '. No registré nada.');
      }
      r.garantia = r1.garantia_generada;
      r.reparto = cp.reparto;
      r.de_tu_ganancia = cp.de_tu_ganancia;
      r.de_su_cupo = cp.de_su_cupo;

      /* 22-oct-2026 — EL PRÓXIMO PAGO LO PUEDE DECIDIR JOAN. La cuenta de arriba
         (la quincena del motor y el costo del ciclo sobre lo que quedó) es la
         propuesta del CRM y va en `sugerido`; la pantalla la muestra ya escrita
         en las dos casillas. Si Joan escribe otra fecha u otro monto, ese pago
         se pacta sobre el crédito COMO QUEDA después del abono y la prórroga,
         con la misma función de «✏️ Ajustar el próximo pago»
         (pactarProximoPago): una sola regla, un solo tope. El acuerdo, si lo
         había, queda cumplido con esta misma operación, así que el pacto se
         pregunta sin él. Si el pacto no se puede, no se registra NADA: ni la
         prórroga ni el abono, porque Joan los confirmó junto con esa fecha. */
      r.sugerido = { fecha: r.corte_nuevo, monto: r.total_siguiente };
      var finalC = despues, pa = null;
      var pq = (o.pacto && typeof o.pacto === 'object') ? o.pacto : null;
      if (pq) {
        var pf = (pq.fecha == null || pq.fecha === '') ? r.corte_nuevo : fechaFin(pq.fecha);
        var pm = (pq.monto == null || pq.monto === '') ? r.total_siguiente : Math.round(Number(pq.monto));
        if (pf !== r.corte_nuevo || pm !== r.total_siguiente) {
          pa = pactarProximoPago(db, creditoCon(despues, { acuerdo: null }),
            { fecha: pf, monto: pm, motivo: pq.motivo, quien: o.quien || 'computador' }, f);
          r.pacto = pa;
          if (!pa.ok) return no('pacto_' + pa.motivo, pa.detalle);
          finalC = pa.credito;
          r.proximo = { fecha: pa.fecha, monto: pa.monto, capital: pa.capital - pa.perdona, costo: pa.costo,
                        perdona: pa.perdona, pct: pa.pct, inhabiles: pa.inhabiles };
        }
      }
      var socioR = lista(db && db.socios).filter(function (sx) { return sx && sx.id === p.socioId; })[0];
      r.ganancia = gananciaDelCredito(finalC);
      r.ganancia_cliente = gananciaDelCliente(db, socioR, finalC);

      r.ok = true;
      r.motivo = null;
      r.caminos = [];
      r.registros = {
        abono: abono,
        prorroga: prorroga,
        condonacion: condonacion,
        /* UNA foto es UNA transferencia: la de todo lo que entregó.
           3-oct-2026 (revisión) — con abono, el tipo es 'abonoProrroga' y la
           galería lo nombra «Abono + prórroga»: con 'prorroga' decía «Prórroga
           $200.000» al lado de una prórroga de $88.000. Sin abono es una
           prórroga a secas y se llama como siempre. */
        comprobante: { tipo: abono ? 'abonoProrroga' : 'prorroga', monto: x },
        cicloActual: r1.fecha_corte_nueva
      };
      /* Con pacto, dos registros más que la pantalla guarda en el MISMO
         guardar(): el plan de una cuota y, si perdona capital, su condonación.
         El corte que queda es el que pactó Joan. */
      if (pa) {
        r.registros.planPagos = pa.registros.planPagos;
        r.registros.condonacionPacto = pa.registros.condonacion;
        r.registros.cicloActual = pa.registros.cicloActual;
      }
      r.detalle = 'Entran ' + pesos(x) + ': ' +
        (r.mora ? pesos(r.mora_cobrada) + ' de mora' +
          (r.mora_condonada ? ' (' + pesos(r.mora_condonada) + ' perdonados' +
            (r.mora_condonada_acuerdo ? ' por el acuerdo: es el precio que se le prometió' : '') + ')' : '') +
          ', ' : '') +
        pesos(r.costo) + ' del costo del ciclo —con eso queda pagada la prórroga— y ' +
        (r.a_capital ? pesos(r.a_capital) + ' a capital' : 'nada a capital') + '. El capital ' +
        (r.a_capital ? 'baja de ' + pesos(r.capital_antes) + ' a ' + pesos(r.capital_despues) + ' y ' : '') +
        'pasa a la quincena del ' + fechaTexto(r.corte_nuevo) + ': ese día, si paga en fecha, son ' +
        pesos(r.total_siguiente) + ' (' + pesos(r.capital_despues) + ' de capital + ' +
        pesos(r.costo_siguiente) + ' de costo).' +
        (r.proximo ? ' Pero el próximo pago lo decidiste tú: ' + pesos(r.proximo.monto) + ' el ' +
          fechaTexto(r.proximo.fecha) + (r.proximo.perdona ? ', perdonándole ' + pesos(r.proximo.perdona) +
          ' de capital' : '') + '.' : '');
      return r;
    }

    /* 3-oct-2026 (revisión) — YA HAY UNA PRÓRROGA ESE DÍA, Y TRAJO MÁS PLATA.
       Esto decía «anótala como abono a capital» y ofrecía «Queda debiendo»,
       que es justo el orden que este archivo explica arriba que cobra de más:
       abonarCapital ancla el abono al ciclo NUEVO y le congela como piso el
       costo de 80.000 sacado de los 400.000 de antes. Medido: prórroga de
       88.000 el 3-oct y 112.000 más ese día → 368.000 el 15-oct en vez de
       345.600; y 200.000 + 50.000 el mismo día daba 295.600 contra 285.600 de
       una sola operación de 250.000.
       La plata del mismo día que abrió el ciclo es la MISMA entrega: va como
       si se hubiera anotado antes de la prórroga, en el ciclo VIEJO, igual que
       el abono de abonoConProrroga. Así el ciclo nuevo —que arrancó ese día—
       se cobra sobre el capital que quedó. Se devuelve el abono armado en
       `mismo_dia.abono` con el camino 'abono_mismo_dia', y NO con ok:true: es
       otro botón, con su propio confirm que dice lo que ya entró ese día, para
       que un doble clic sobre «Registrar» no meta la misma plata dos veces.
       Solo si esa prórroga es la que abrió el ciclo de hoy: si después el
       corte se movió otra vez, una fecha vieja reescribiría el costo de un
       ciclo ya causado, y eso no se hace. */
    function yaRegistrado(pr) {
      var corteDeEsa = fechaFin(pr.nuevoCiclo) || r.corte_antes;
      var aCapHoy = lista(p.abonosCapital).reduce(function (t, a) {
        return (a && !a.cuotaPlan && fechaFin(a.fecha) === f) ? t + Math.round(num(a.monto)) : t;
      }, 0);
      var prs = lista(p.prorrogas);
      var abre = prs[prs.length - 1] === pr && fechaFin(p.cicloActual) === fechaFin(pr.nuevoCiclo) &&
        inicioDelCiclo(p) === f;
      r.mismo_dia = { puede: abre, prorroga: Math.round(num(pr.monto)), a_capital_ya: aCapHoy,
        abono: null, capital_despues: 0, corte: corteDeEsa, costo_siguiente: 0, total_siguiente: 0 };
      var base = 'Este crédito ya tiene una prórroga registrada el ' + fechaTexto(f) + ' (pasó al ' +
        fechaTexto(corteDeEsa) + '): ese día ya entraron ' + pesos(num(pr.monto) + aCapHoy) + ' (' +
        pesos(pr.monto) + ' de la prórroga' + (aCapHoy ? ' y ' + pesos(aCapHoy) + ' a capital' : '') +
        '). No registro otra prórroga.';
      if (!abre) {
        return no('ya_registrado', base + ' Si trajo más plata otro día, anótala con la fecha de ese día.');
      }
      if (!isFinite(x) || x <= 0) {
        return no('ya_registrado', base + ' Si ese mismo día trajo MÁS plata aparte de esa, escribe ' +
          'cuánto más: la sumo a capital como parte de la misma entrega, y la quincena del ' +
          fechaTexto(corteDeEsa) + ' se cobra sobre el capital que quede.');
      }
      if (x >= r.capital_antes) {
        return no('ya_registrado', base + ' Y ' + pesos(x) + ' más cubren el capital que queda (' +
          pesos(r.capital_antes) + '): eso ya es «Pagó todo».', ['pago_total']);
      }
      var ab = { fecha: f, monto: x, ciclo: pr.ciclo,
        costoCausado: pr.costoCausado != null ? Math.round(num(pr.costoCausado)) : costoDeProrroga(pr),
        moraCausada: pr.moraCausada != null ? Math.round(num(pr.moraCausada)) : moraDeProrroga(pr),
        diasMoraCausada: Math.round(num(pr.diasMora)) };
      var despues = creditoCon(p, { abonosCapital: lista(p.abonosCapital).concat([ab]) });
      var liqN = liquidarCiclo(despues, corteDelCredito(despues));
      var md = r.mismo_dia;
      md.abono = ab;
      md.capital_despues = capitalActual(despues);
      md.costo_siguiente = Math.round(liqN.costo);
      md.total_siguiente = Math.round(liqN.total_a_pagar);
      return no('ya_registrado', base + ' Si ADEMÁS de eso trajo ' + pesos(x) + ' más, los sumo a capital ' +
        'como parte de la misma entrega: el capital baja de ' + pesos(r.capital_antes) + ' a ' +
        pesos(md.capital_despues) + ' y el ' + fechaTexto(corteDeEsa) + ', si paga a tiempo, son ' +
        pesos(md.total_siguiente) + ' (' + pesos(md.capital_despues) + ' de capital + ' +
        pesos(md.costo_siguiente) + ' de costo).', ['abono_mismo_dia']);
    }
  }

  /* 3-oct-2026 — EL RECIBO DEL ABONO + PRÓRROGA, leído de los HECHOS guardados
     y no de la cuenta de la hoja de cobro. El WhatsApp que le queda a la
     cliente se arma DESPUÉS de registrar —o mañana, si Joan reabre la
     gestión—, y para entonces la hoja ya no existe: lo único que no cambia es
     lo que quedó escrito. Es la lección del 4-ago (varsDePlantilla, crm.html):
     el mensaje de la prórroga dijo 120.000 de los 330.000 que entraron porque
     se recalculaba en vez de leerse. Vive acá y no en las dos pantallas porque
     el computador y el celular mandan el MISMO recibo.
       · entrego: la prórroga más los abonos a capital de ESE MISMO DÍA. Son
         los dos pedazos de la misma plata; si Joan los anotó por separado con
         los dos botones viejos, también fueron la misma entrega.
       · total_en_fecha: lo que paga el día del corte nuevo si paga a tiempo,
         preguntado a liquidarCiclo con el crédito como quedó, no restado a
         mano. Con el caso real del 3-oct: 200.000 entregados, 288.000 de
         capital y 345.600 el 15-oct.
     Pura y sin lanzar: un dato sucio deja el mensaje sin cifra, nunca la hoja
     de gestión rota. */
  function reciboAbonoConProrroga(p) {
    try {
      if (!p || typeof p !== 'object') return null;
      var prs = lista(p.prorrogas);
      var u = prs.length ? prs[prs.length - 1] : null;
      if (!u) return null;
      var dia = fechaFin(u.fecha);
      var aCapital = lista(p.abonosCapital).reduce(function (t, a) {
        return (a && !a.cuotaPlan && dia && fechaFin(a.fecha) === dia) ? t + Math.round(num(a.monto)) : t;
      }, 0);
      var corte = corteDelCredito(p) || null;
      var enFecha = corte ? liquidarCiclo(p, corte) : null;
      return {
        fecha: dia, prorroga: Math.round(num(u.monto)), a_capital: aCapital,
        entrego: Math.round(num(u.monto)) + aCapital,
        capital: capitalActual(p), corte: corte,
        costo_en_fecha: enFecha ? Math.round(num(enFecha.costo)) : 0,
        total_en_fecha: enFecha ? Math.round(num(enFecha.total_a_pagar)) : 0
      };
    } catch (e) { return null; }
  }

  /* Lo que un socio lleva perdonado, DERIVADO de sus créditos y nunca de un
     contador guardado: un contador se desincroniza el día que Joan edita un
     pago y desde ahí miente para siempre. */
  function descuentosDelSocio(db, s) {
    var t = { veces: 0, monto: 0, costo: 0, mora: 0 };
    if (!s) return t;
    /* 22-oct-2026 — el capital perdonado al pactar el próximo pago también es
       un descuento a este cliente, y entra en el monto: «ya lleva un descuento
       por $0» de un perdón de 10.000 es la ficha mintiendo. Va sin llave
       propia para no cambiarle la forma a quien ya la lee. */
    var capital = 0;
    lista(db && db.prestamos).forEach(function (p) {
      if (!p || p.socioId !== s.id) return;
      lista(p.condonaciones).forEach(function (c) {
        t.veces++;
        t.costo += num(c && c.costo);
        t.mora += num(c && c.mora);
        capital += Math.max(0, num(c && c.capital));
      });
    });
    t.monto = t.costo + t.mora + capital;
    return t;
  }


  /* ==========================================================================
   * EL CRUCE: ¿ESTE QUE SE REGISTRÓ YA ES CLIENTE? — 9 de septiembre de 2026
   *
   * Joan pidió una sola puerta: «que lleve a todos los clientes,
   * independientemente que sea nuevo o antiguo, y que yo desde el CRM pueda
   * cruzar la información con la que yo manualmente ingresé antes, y que no
   * quede como dos clientes duplicados».
   *
   * ESTO NO CRUZA A NADIE. Devuelve CANDIDATOS con el motivo del parecido, y
   * la mesa del Panel se los enseña a Joan para que él decida. Es deliberado:
   * juntar dos personas por error mezcla dos historiales de plata, y
   * separarlas después no existe. La máquina propone; la mano de Joan dispone.
   *
   * LA REGLA, en una frase: LA CÉDULA MANDA SOBRE EL CELULAR. Misma cédula es
   * la misma persona aunque el número haya cambiado. Mismo celular es la misma
   * persona SOLO si ninguna cédula lo contradice — el celular se hereda, se
   * presta y el operador lo recicla a los tres meses; la cédula no. Si las dos
   * fichas traen cédula y son distintas, son DOS personas, y el celular igual
   * es una duda que se muestra, nunca un cruce.
   *
   * Y hay un tercer motivo, el más flojo, que existe porque sin él Joan se
   * queda ciego justo en su caso: una ficha vieja SIN cédula y con el número
   * cambiado no aparea con nada, y él es el único que reconoce a esa persona.
   * Por eso el nombre también propone —marcado como flojo, y nunca solo.
   * ======================================================================== */

  /* Sin tildes, sin dobles espacios, en minúscula: «JOSÉ  RUÍZ» y «jose ruiz»
     son el mismo nombre escrito por dos manos distintas. */
  function nombrePlano(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Para comparar dos valores escritos por dos manos distintas. Deja letras y
     NÚMEROS: quitar los números volvería iguales «Calle 45» y «Calle 46», y
     —peor— dos celulares distintos. Quitar solo las tildes deja fuera a
     «Bogota» contra «Bogotá», que es el mismo dato mal tecleado y no una
     decisión que Joan deba tomar treinta veces al día. */
  function planoComparable(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /* Los celulares que una ficha conoce. Son tres campos distintos porque el
     cliente da uno para llamar, otro para WhatsApp y a veces el de la señora:
     mirar solo `telefono` deja fuera cruces que Joan reconocería de una. */
  function celularesDe(s) {
    return [s && s.telefono, s && s.telefono2, s && s.whatsappNumero]
      .map(function (t) { return digitos(t).slice(-10); })
      .filter(function (t) { return t.length === 10; });
  }

  /* Cuántas palabras de dos nombres coinciden. Dos apellidos iguales bastan
     para proponer; una sola palabra, no — «maría» la comparte medio país. */
  function palabrasEnComun(a, b) {
    var A = nombrePlano(a).split(' ').filter(function (p) { return p.length > 2; });
    var B = nombrePlano(b).split(' ').filter(function (p) { return p.length > 2; });
    var n = 0;
    for (var i = 0; i < A.length; i++) if (B.indexOf(A[i]) >= 0) n++;
    return n;
  }

  /**
   * Los clientes que PODRÍAN ser el que acaba de registrarse.
   *
   * @param db   la cartera del Panel
   * @param reg  la fila de la bandeja: {cedula, telefono, nombre, datos}
   * @returns    [{socio, motivo, fuerza, duda, porque}] de más fuerte a más flojo
   *             fuerza 3 cédula · 2 celular · 1 celular con duda · 0 nombre
   */
  function candidatosDeCruce(db, reg) {
    var r = reg || {};
    var d = (r.datos && typeof r.datos === 'object') ? r.datos : {};
    /* El registro identifica por celular; la cédula puede venir por dos vías
       (el campo de la bandeja o el documento que declaró en el formulario). */
    var cedReg = digitos(r.cedula || d.documento || '');
    var celReg = digitos(r.telefono || d.celular || '').slice(-10);
    var nomReg = [d.nombres, d.apellidos].filter(Boolean).join(' ') || r.nombre || '';
    var salida = [];

    lista(db && db.socios).forEach(function (s) {
      var cedSoc = digitos(s.cedula);
      var cels = celularesDe(s);
      var mismoCel = celReg.length === 10 && cels.indexOf(celReg) >= 0;
      var lasDosCedulas = cedReg.length >= 5 && cedSoc.length >= 5;

      if (lasDosCedulas && cedReg === cedSoc) {
        return salida.push({ socio: s, motivo: 'cedula', fuerza: 3, duda: false,
          porque: 'La misma cédula ' + cedSoc + (mismoCel ? ' y el mismo celular' : ', aunque el celular cambió') + '.' });
      }
      if (lasDosCedulas && cedReg !== cedSoc) {
        /* Cédulas distintas: son dos personas. Si además comparten celular hay
           que MOSTRARLO —puede ser la mamá, el hermano, o alguien usando la
           cédula ajena— pero jamás ofrecerlo como cruce. */
        if (mismoCel) {
          salida.push({ socio: s, motivo: 'celular_con_duda', fuerza: 1, duda: true,
            porque: 'Mismo celular, pero la cédula NO coincide (' + cedSoc + ' contra ' + cedReg + '). Son dos personas, o alguien está usando una cédula que no es suya.' });
        }
        return;
      }
      if (mismoCel) {
        return salida.push({ socio: s, motivo: 'celular', fuerza: 2, duda: false,
          porque: 'El mismo celular, y ' + (cedSoc ? 'el registro no trae cédula' : 'la ficha no tiene cédula') + ', así que nada lo contradice.' });
      }
      if (palabrasEnComun(nomReg, s.nombre) >= 2) {
        salida.push({ socio: s, motivo: 'nombre', fuerza: 0, duda: true,
          porque: 'Se parece el nombre, y nada más. Puede ser otra persona: mírale el historial antes de cruzar.' });
      }
    });

    /* De más fuerte a más flojo, y con el más reciente primero cuando empatan:
       si Joan tiene dos fichas parecidas, la que usó ayer es la que le suena. */
    return salida.sort(function (a, b) {
      return (b.fuerza - a.fuerza) || (Number(b.socio.numero) || 0) - (Number(a.socio.numero) || 0);
    });
  }

  /* --------------------------------------------------------------------------
   * LO QUE DECLARÓ, TRADUCIDO A CAMPOS DE FICHA
   *
   * UN SOLO MAPEO. Antes había dos que decían casi lo mismo (fichaDesdeRegistro
   * y socioDesdeDatos, las dos dentro de crm.html) y ya se habían separado: una
   * traducía `tipo_vivienda` con un `|| 'casa'` que convertía «Arriendo» en
   * «casa» sin un error, y eso vale 5.000 de garantía. Un campo que no vino NO
   * se inventa: se deja vacío y la mesa de cruce lo muestra vacío.
   * ------------------------------------------------------------------------ */
  function fichaDeclarada(reg) {
    var r = reg || {};
    var d = (r.datos && typeof r.datos === 'object') ? r.datos : {};
    var plata = function (v) {
      var n = Number(digitos(v));
      return n > 0 ? n : 0;
    };
    return {
      nombre: [d.nombres, d.apellidos].filter(Boolean).join(' ').trim() || String(r.nombre || '').trim(),
      cedula: digitos(r.cedula || d.documento || ''),
      telefono: digitos(r.telefono || d.celular || '').slice(-10),
      email: String(d.correo || '').trim(),
      direccion: String(d.direccion || '').trim(),
      ciudad: String(d.ciudad || '').trim(),
      barrio: String(d.barrio || '').trim(),
      /* Sin valor por defecto, a propósito: ver el comentario de arriba. */
      tipoVivienda: String(d.tipo_vivienda || '').trim().toLowerCase(),
      /* El formulario pregunta al MES; la ficha guarda por quincena. La cuenta
         vive acá y no en la pantalla para que las dos puertas la hagan igual. */
      ingresoQuincenal: plata(d.ingreso_mes) ? Math.round(plata(d.ingreso_mes) / 2) : 0,
      referencia: { nombre: String(d.ref1_nombre || '').trim(), telefono: digitos(d.ref1_celular || '').slice(-10) }
    };
  }

  /* --------------------------------------------------------------------------
   * LA MESA: CAMPO POR CAMPO, LO QUE YO TENÍA CONTRA LO QUE DECLARÓ
   *
   * `estado` es lo único que la pantalla necesita para decidir el color:
   *   · 'falta'    — yo no lo tengo y él lo trae: es lo que Joan viene a llenar
   *   · 'igual'    — dicen lo mismo; no hay nada que decidir
   *   · 'distinto' — los dos tienen y no coinciden: DECISIÓN, nunca automático
   *   · 'solo_mio' — yo lo tengo y él no lo declaró: no hay nada que decidir
   *   · 'nada'     — ninguno de los dos lo tiene
   *
   * `pesado` marca los campos de IDENTIDAD — no los de plata. La diferencia
   * costó un hallazgo: al medirlo contra el motor el 9-sep resultó que
   * completarle la ficha a un socio le SUBE LA GARANTÍA, y entonces ciudad,
   * barrio, vivienda y referencia mueven el cupo mientras el ingreso no lo
   * mueve. Cuáles valen plata depende de la cartera entera y de las reglas del
   * momento, así que esa pregunta se la hace el CRM al motor, ficha por ficha
   * (mueveElCupo en crm.html); acá no se adivina.
   *
   * Los de identidad, que sí son fijos:
   *   · cedula   — es la LLAVE del cliente en la nube. Cambiarla de vacía a
   *                llena muda la fila entera (ver base/20260909), y por eso la
   *                pantalla la confirma aparte.
   *   · telefono — es por donde entra a su app y por donde Joan le cobra.
   *   · ingresoQuincenal — decide el cupo, o sea, plata.
   * ------------------------------------------------------------------------ */
  var CAMPOS_DEL_CRUCE = [
    { campo: 'nombre', etiqueta: 'Nombre', pesado: false },
    { campo: 'cedula', etiqueta: 'Cédula', pesado: true },
    { campo: 'telefono', etiqueta: 'Celular', pesado: true },
    { campo: 'email', etiqueta: 'Correo', pesado: false },
    { campo: 'direccion', etiqueta: 'Dirección', pesado: false },
    { campo: 'ciudad', etiqueta: 'Ciudad', pesado: false },
    { campo: 'barrio', etiqueta: 'Barrio', pesado: false },
    { campo: 'tipoVivienda', etiqueta: 'Su vivienda es', pesado: false },
    { campo: 'ingresoQuincenal', etiqueta: 'Gana por quincena', pesado: true }
  ];

  function camposDelCruce(socio, reg) {
    var dec = fichaDeclarada(reg);
    var s = socio || {};
    var filas = CAMPOS_DEL_CRUCE.map(function (c) {
      var mio = s[c.campo], suyo = dec[c.campo];
      var hayMio = !(mio == null || mio === '' || mio === 0);
      var haySuyo = !(suyo == null || suyo === '' || suyo === 0);
      var estado = !hayMio && !haySuyo ? 'nada'
        : !hayMio ? 'falta'
        : !haySuyo ? 'solo_mio'
        : planoComparable(mio) === planoComparable(suyo) ? 'igual' : 'distinto';
      return { campo: c.campo, etiqueta: c.etiqueta, pesado: c.pesado,
               mio: hayMio ? mio : '', declarado: haySuyo ? suyo : '', estado: estado };
    });
    /* La referencia va aparte porque son dos datos en uno y la ficha la guarda
       anidada: aplanarla acá evitaría que la pantalla la sepa volver a armar. */
    var refMia = (s.referencia && s.referencia.nombre) ? s.referencia.nombre : '';
    filas.push({ campo: 'referencia', etiqueta: 'Referencia', pesado: false,
      mio: refMia ? refMia + (s.referencia.telefono ? ' · ' + s.referencia.telefono : '') : '',
      declarado: dec.referencia.nombre ? dec.referencia.nombre + (dec.referencia.telefono ? ' · ' + dec.referencia.telefono : '') : '',
      estado: !refMia && dec.referencia.nombre ? 'falta'
        : !dec.referencia.nombre ? 'solo_mio'
        : nombrePlano(refMia) === nombrePlano(dec.referencia.nombre) ? 'igual' : 'distinto' });
    return filas;
  }

  return {
    LLAVE_PANEL: LLAVE_PANEL,
    normalizar: normalizar,
    entradaGarantia: entradaGarantia,
    /* La entrada del CUPO: la de arriba más el capital quincenal afuera
       (6-ago-2026). Ver el comentario de entradaCupo para por qué son dos. */
    entradaCupo: entradaCupo,
    garantiaGanadaDe: garantiaGanadaDe,
    comprometidaDe: comprometidaDe,
    capitalQuincenalDe: capitalQuincenalDe,
    /* La contabilidad del cupón (5-ago-2026). SOLO para el Panel: no entra al
       paquete del socio por ningún lado. */
    movimientosCobradosCredito: movimientosCobradosCredito,
    movimientosCobradosRespaldado: movimientosCobradosRespaldado,
    movimientosCobradosDe: movimientosCobradosDe,
    contabilidadCupon: contabilidadCupon,
    contabilidadCartera: contabilidadCartera,
    // El freno por ingreso, apagado, para que el Panel lo pueda encender
    frenoDe: frenoDe,
    // El tope de los referidos, para que el Panel lo pueda mover (6-ago-2026)
    topeReferidosDe: topeReferidosDe,
    cupoDelSocio: cupoDelSocio,
    migrarSocio: migrarSocio,
    /* Lo perdonado por quincena (4-sep-2026). Vive en el puente y no en el CRM
       porque el espejo va a necesitar la misma cuenta el día que muestre la
       línea, y dos versiones de una cuenta terminan contestando distinto. */
    descuentosDeQuincena: descuentosDeQuincena,
    quincenaDeCondonacion: quincenaDeCondonacion,
    /* La ley del cobro con monto real (7-sep-2026): una sola copia, para el
       computador hoy y para el celular cuando deje la suya. */
    cuentasDelCobro: cuentasDelCobro,
    cuentasDeLaProrroga: cuentasDeLaProrroga,
    /* Abono + prórroga en un solo paso (3-oct-2026): una sola regla para el
       computador y el celular; las pantallas solo empujan sus registros. */
    abonoConProrroga: abonoConProrroga,
    /* Y su recibo, leído de lo guardado (3-oct-2026): el WhatsApp del
       computador y el del celular dicen las mismas cifras. */
    reciboAbonoConProrroga: reciboAbonoConProrroga,
    /* El próximo pago que decide Joan y lo que le deja cada crédito y cada
       cliente (22-oct-2026): una sola cuenta para el computador, el celular y
       la app. */
    pactarProximoPago: pactarProximoPago,
    esPacto: esPacto,
    gananciaDelCredito: gananciaDelCredito,
    gananciaDelCliente: gananciaDelCliente,
    capitalPerdonadoDe: capitalPerdonadoDe,
    repartoDelDescuento: repartoDelDescuento,
    descuentosDelSocio: descuentosDelSocio,
    buscarSocio: buscarSocio,
    /* El cruce del registro con la ficha vieja (9-sep-2026). Vive acá, junto a
       buscarSocio, porque las dos contestan la misma pregunta —quién es quién—
       y tenerlas separadas es como nacen los duplicados. */
    candidatosDeCruce: candidatosDeCruce,
    fichaDeclarada: fichaDeclarada,
    camposDelCruce: camposDelCruce,
    CAMPOS_DEL_CRUCE: CAMPOS_DEL_CRUCE,
    /* El código de acceso del cliente y quiénes todavía no tienen (10-ago-2026).
       Los dos viven acá y no en crm.html: el Panel tuvo doce copias de cuentas
       que el puente ya sabía hacer, y esta va a hacer falta también en la app. */
    codigoAccesoDe: codigoAccesoDe,
    sinCodigoAcceso: sinCodigoAcceso,
    llaveEnLaNube: llaveEnLaNube,
    datosKycDe: datosKycDe,
    referidosDe: referidosDe,
    fotoComunidad: fotoComunidad,
    esPuntual: esPuntual,
    esPuntualParaNivel: esPuntualParaNivel,
    corteDelCredito: corteDelCredito,
    // La línea de tiempo: TODA pregunta con una fecha adentro sale de acá.
    cambiosDeCorte: cambiosDeCorte,
    corteOriginal: corteOriginal,
    cortesDelCredito: cortesDelCredito,
    corteVigenteEn: corteVigenteEn,
    inicioDelCiclo: inicioDelCiclo,
    capitalVigenteEn: capitalVigenteEn,
    capitalBaseDelCiclo: capitalBaseDelCiclo,
    causadoDelCiclo: causadoDelCiclo,
    moraDelCiclo: moraDelCiclo,
    liquidarCiclo: liquidarCiclo,
    /* 8-oct-2026 — el techo del recargo de los créditos con condiciones aceptadas */
    tasaMoraDe: tasaMoraDe,
    ultimoDiaDeMora: ultimoDiaDeMora,
    estabaVencido: estabaVencido,
    // La regla única de la mora, y el estado que sale de ella (5-ago-2026).
    // `ultimoDiaDeMoraCobrada` y `veniaDeMora` van expuestas desde el 6-ago-2026:
    // son las dos mitades de esa verdad única y las pantallas tienen que poder
    // preguntarlas en vez de deducirlas.
    ultimoDiaDeMoraCobrada: ultimoDiaDeMoraCobrada,
    veniaDeMora: veniaDeMora,
    estuvoEnMora: estuvoEnMora,
    estadoParaNivel: estadoParaNivel,
    prorrogaAcreditaEnFecha: prorrogaAcreditaEnFecha,
    contadoresDeNivel: contadoresDeNivel,
    nivelDelSocio: nivelDelSocio,
    tasaDelCiclo: tasaDelCiclo,
    cuotasPlan: cuotasPlan,
    tienePlan: tienePlan,
    cuotaPlanActual: cuotaPlanActual,
    // El crédito a cuotas pactado al desembolsar (16-oct-2026)
    esPlanDeAlta: esPlanDeAlta,
    planPagosDeAlta: planPagosDeAlta,
    abonosDeCuota: abonosDeCuota,
    pagadoDeCuota: pagadoDeCuota,
    moraPendienteDeCuota: moraPendienteDeCuota,
    cuotasVencidas: cuotasVencidas,
    vencidoDelPlan: vencidoDelPlan,
    aPagarHoy: aPagarHoy,
    aPagarEnSuFecha: aPagarEnSuFecha,
    ultimoHechoDelPlan: ultimoHechoDelPlan,
    esUltimaPendiente: esUltimaPendiente,
    inicioDeCuota: inicioDeCuota,
    costoPendienteDelPlan: costoPendienteDelPlan,
    quincenaDe: quincenaDe,
    cobradoDelPlanEnQuincena: cobradoDelPlanEnQuincena,
    cierreDeCuota: cierreDeCuota,
    saldarValeHasta: saldarValeHasta,
    cuotaEmpezo: cuotaEmpezo,
    ultimoAbonoDeCuota: ultimoAbonoDeCuota,
    saldoDelPlan: saldoDelPlan,
    liquidarSaldoPlan: liquidarSaldoPlan,
    abonoACuota: abonoACuota,
    reprogramarPlan: reprogramarPlan,
    garantiaGanadaCuotaPlan: garantiaGanadaCuotaPlan,
    capitalDelCiclo: capitalDelCiclo,
    entradaPlan: entradaPlan,
    costoCobradoPlan: costoCobradoPlan,
    garantiaGanadaPlan: garantiaGanadaPlan,
    fechaPagadoDeducida: fechaPagadoDeducida,
    fechaPagadoCorregida: fechaPagadoCorregida,
    abonosCierranElCredito: abonosCierranElCredito,
    migrarFechaPagado: migrarFechaPagado,
    garantiaGanadaCredito: garantiaGanadaCredito,
    garantiaGanadaProrroga: garantiaGanadaProrroga,
    prorrogaFueATiempo: prorrogaFueATiempo,
    costoDeProrroga: costoDeProrroga,
    moraDeProrroga: moraDeProrroga,
    fechaDelCredito: fechaDelCredito,
    gananciaCobrada: gananciaCobrada,
    capitalActual: capitalActual,
    K: K,
    capitalRecuperadoDe: capitalRecuperadoDe,
    saldoCapitalRespaldado: saldoCapitalRespaldado,
    garantiaGanadaRespaldado: garantiaGanadaRespaldado,
    respaldadosDe: respaldadosDe,
    codCliente: codCliente,
    codCredito: codCredito,
    codRespaldado: codRespaldado
  };
});
