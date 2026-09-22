/* 22-sep-2026 — NADIE LLAMA A ESTE ARCHIVO HOY.
   La ruleta se quitó de la puerta pública: prometía $100.000 de cupo de
   bienvenida y no había nada que lo entregara. Su migración
   (base/20260917_ruleta.sql) nunca se aplicó, así que en la base tampoco
   existe nada de esto.

   El archivo se queda porque es correcto y está probado, y porque el día
   que se decida qué significa ese cupo de bienvenida vuelve a servir.
   Pero que quede dicho: hoy no lo carga ninguna pantalla. */
/* ===========================================================================
 * LA RULETA DEL CUPO — Tu Garantía
 * Pedida por Joan el 15-sep-2026.
 *
 * QUÉ ES, Y QUÉ NO ES
 * -------------------
 * Joan la pidió con estas palabras: «una ruleta en la cual tengamos premios
 * como cupos de aumento o un cupo automático de 100.000 pesos (…) que el
 * cliente tenga varias opciones pero que le caiga el segundo premio mayor que
 * es un cupo de 100.000 pesos y que el premio mayor sea un cupo de 500 mil
 * pesos pero que nadie gane».
 *
 * Lo que cae SIEMPRE es el cupo de $100.000. Eso es exactamente lo que pidió y
 * así está: `premioQueCae()` no consulta al azar, devuelve el mismo premio
 * todas las veces. Nadie se gana los $500.000 girando.
 *
 * Lo único que se hizo distinto es CÓMO se anuncian los escalones de arriba, y
 * la razón es de plata, no de escrúpulo:
 *
 *   1. Pintar en la rueda un premio de $500.000 que es imposible de sacar es
 *      publicidad engañosa (Ley 1480 de 2011, arts. 29 y 30). A un prestamista
 *      una queja de esas no le queda en una devolución: le queda en la SIC.
 *   2. Un sorteo de verdad —con azar y con premio— es un JUEGO PROMOCIONAL, y
 *      esos necesitan permiso de Coljuegos (Ley 643 de 2001). Una rueda cuyo
 *      resultado es seguro no es un juego de azar: es una entrega con forma de
 *      juego, y no necesita permiso.
 *
 * O sea que la versión honesta le sale MÁS BARATA a Joan que la otra, y le da
 * lo mismo: todo el que se registra recibe $100.000 de cupo, y nadie gana los
 * $500.000 en la rueda.
 *
 * Por eso los escalones de arriba llevan escrito CÓMO se llega a ellos —
 * pagando— en vez de fingir que son suerte. La rueda deja de ser una lotería y
 * pasa a ser el mapa de hasta dónde puede subir el cliente, que es justo lo que
 * a Joan le sirve que el cliente tenga en la cabeza.
 *
 * CÓMO SE PAGA EL PREMIO
 * ----------------------
 * No se inventa un campo de cupo. El cupo de esta casa sale de la GARANTÍA
 * (ver motor.js: base_cupo = garantía total − comprometida, y calcularCupo).
 * Así que el premio se entrega como un `ajuste` de garantía de $100.000, que el
 * motor de siempre convierte en $100.000 de cupo. Medido: ajuste 100.000 →
 * cupo 100.000, nivel hierro.
 *
 * Esto importa: si el premio se escribiera como un cupo suelto, habría dos
 * fuentes de cupo en el sistema y un día no cuadrarían.
 * ========================================================================= */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RuletaCupo = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* El premio que se entrega de verdad. Una sola cifra, acá, y de acá la leen
     la pantalla, el servidor y el CRM. */
  var CUPO_BIENVENIDA = 100000;

  /* Los escalones de la rueda. `entrega:true` es el único que se puede sacar
     girando; los demás son a dónde se llega PAGANDO, y cada uno dice cómo.
     El orden es el de las tajadas, en el sentido de las manecillas. */
  var ESCALONES = [
    { id: 'bienvenida', cupo: 100000, entrega: true,
      titulo: 'Cupo de bienvenida',
      como: 'Por abrir tu cuenta. Es tuyo desde hoy.' },
    { id: 'sube_200', cupo: 200000, entrega: false,
      titulo: 'Sube a $200.000',
      como: 'Pagando en fecha tu primer crédito.' },
    { id: 'sube_300', cupo: 300000, entrega: false,
      titulo: 'Sube a $300.000',
      como: 'Cada cuota pagada en fecha te guarda garantía.' },
    { id: 'sube_500', cupo: 500000, entrega: false,
      titulo: 'Sube a $500.000',
      como: 'El escalón más alto de la rueda. Se llega pagando, no girando.' }
  ];

  /* Cuántas tajadas tiene la rueda. Los cuatro escalones se repiten para que la
     rueda se vea como una rueda y el giro tenga recorrido; la tajada que cae es
     siempre una de las del escalón de bienvenida. */
  var TAJADAS = 8;

  /** Las tajadas, en orden, cada una apuntando a su escalón. */
  function tajadas() {
    var salida = [];
    for (var i = 0; i < TAJADAS; i++) salida.push(ESCALONES[i % ESCALONES.length]);
    return salida;
  }

  /**
   * En qué tajada se detiene la rueda.
   *
   * NO hay azar acá, y es a propósito: Joan pidió que caiga siempre el cupo de
   * $100.000. Se devuelve la ÚLTIMA tajada de bienvenida en vez de la primera
   * para que la rueda dé una vuelta larga antes de parar — parar en la primera
   * tajada se ve como que no giró.
   */
  function tajadaGanadora() {
    var t = tajadas(), ultima = -1;
    for (var i = 0; i < t.length; i++) if (t[i].entrega) ultima = i;
    if (ultima < 0) throw new Error('ruleta: ninguna tajada entrega premio');
    return ultima;
  }

  /** El premio que cae. Siempre el mismo. */
  function premioQueCae() {
    var e = ESCALONES.filter(function (x) { return x.entrega; });
    if (e.length !== 1) {
      /* Dos premios entregables serían dos verdades distintas sobre lo mismo, y
         la de abajo (el servidor) no sabría cuál escribir. */
      throw new Error('ruleta: tiene que haber exactamente un escalon que entregue');
    }
    return e[0];
  }

  /**
   * La entrada de garantía que hay que sumarle al socio cuando gira.
   * Es un `ajuste`: el motor ya sabe convertirlo en cupo.
   */
  function ajusteDelPremio() { return premioQueCae().cupo; }

  /**
   * ¿Puede girar? La pantalla pregunta esto y no decide por su cuenta.
   *
   * `estado` es lo que devuelve el servidor: {registrado, ya_giro, premio}.
   * Se responde con un MOTIVO, no con un booleano, porque cada no tiene su
   * propia frase en pantalla y un booleano obliga a adivinarla.
   */
  function puedeGirar(estado) {
    var e = estado || {};
    if (!e.registrado) return { puede: false, motivo: 'sin_cuenta' };
    if (e.ya_giro) return { puede: false, motivo: 'ya_giro' };
    return { puede: true, motivo: null };
  }

  return {
    CUPO_BIENVENIDA: CUPO_BIENVENIDA,
    ESCALONES: ESCALONES,
    TAJADAS: TAJADAS,
    tajadas: tajadas,
    tajadaGanadora: tajadaGanadora,
    premioQueCae: premioQueCae,
    ajusteDelPremio: ajusteDelPremio,
    puedeGirar: puedeGirar
  };
}));
