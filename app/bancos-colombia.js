/* ============================================================================
 * LOS BANCOS Y BILLETERAS DONDE UNA PERSONA PUEDE RECIBIR PLATA EN COLOMBIA
 * Consultado el 22 de octubre de 2026.
 *
 * Joan (22-oct-2026): «si es cuenta bancaria, que le permita seleccionar el
 * banco y que aparezcan todos los bancos disponibles para que el cliente
 * seleccione». Esta es esa lista, y vive en su propio archivo para que se
 * pueda poner al día sin tocar nada más: cambia la lista, cambia la fecha de
 * abajo, y el registro, la aceptación y el CRM la leen igual.
 *
 * DE DÓNDE SALE (cada entidad está en alguna de estas, con su código):
 *   · Superfinanciera, establecimientos bancarios (xls), corte 25-sep-2026.
 *   · Superfinanciera, compañías de financiamiento (xls), corte 24-sep-2026.
 *   · Superfinanciera, cooperativas financieras (xls), corte 23-jun-2026.
 *   · Superfinanciera, SEDPE (xls), corte 22-jul-2026.
 *   · Superfinanciera, entidades con más de 1,5 millones de depósitos a la
 *     vista activos (1er semestre de 2026): son las de arriba de la lista.
 *   · Banco de la República, participantes de Bre-B (actualizada el
 *     27-jul-2026).
 *   https://www.superfinanciera.gov.co/publicaciones/13067/
 *   https://banrep.gov.co/es/bre-b/preguntas-frecuentes/participantes
 *
 * POR QUÉ SE GUARDA EL CÓDIGO DE LA SUPERFINANCIERA Y NO SOLO EL NOMBRE. Los
 * nombres comerciales cambian: Scotiabank Colpatria es Davibank desde el
 * 1-dic-2025, y Nequi dejó de ser una billetera de Bancolombia para ser su
 * propia compañía de financiamiento (4-130) el 1-sep-2026. El código dice a
 * qué entidad se le consigna aunque mañana cambie el nombre. El primer número
 * es el tipo de entidad: 1 banco, 4 compañía de financiamiento, 32
 * cooperativa financiera, 128 SEDPE.
 *
 * NEQUI Y DAVIPLATA ESTÁN, PERO NO SALEN EN EL DESPLEGABLE DE BANCOS: tienen
 * su propia opción en el registro y en la aceptación (se llenan con el
 * celular), y ofrecerlas dos veces haría que alguien escriba su Nequi como
 * «cuenta de ahorros». Daviplata no tiene código propio: es un depósito de
 * bajo monto de Davivienda (1-39), con su marca aparte.
 *
 * LO QUE QUEDÓ FUERA, Y POR QUÉ: unas 180 cooperativas de ahorro y crédito
 * que no vigila la Superfinanciera (las cubre «Otro»), los procesadores de
 * pago (PayU, Wompi, Kushki…: no son cuentas de persona), las entidades que
 * solo atienden empresas (Iris) y las que todavía no operan (Revolut, 2027).
 *
 * EL ORDEN: arriba las más usadas (las de más de 1,5 millones de depósitos,
 * más Nequi y Daviplata, que en ese corte contaban dentro de Bancolombia y
 * Davivienda). Ninguna fuente las ordena entre sí: ese orden es criterio de
 * quien armó la lista. El resto, alfabético, y «Otro» al final.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.BancosColombia = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONSULTADO = '2026-10-22';

  /* `billetera: true` = tiene su propia opción (se llena con el celular) y no
     sale en el desplegable de bancos. `codigo` = tipo-código de la
     Superfinanciera. */
  var ENTIDADES = [
    { nombre: 'Nequi', codigo: '4-130', billetera: true },
    { nombre: 'Bancolombia', codigo: '1-7' },
    { nombre: 'Daviplata', codigo: '1-39', billetera: true },
    { nombre: 'Davivienda', codigo: '1-39' },
    { nombre: 'Banco de Bogotá', codigo: '1-1' },
    { nombre: 'Nu', codigo: '4-128' },
    { nombre: 'BBVA', codigo: '1-13' },
    { nombre: 'Banco Caja Social', codigo: '1-30' },
    { nombre: 'Dale!', codigo: '128-3' },
    { nombre: 'Movii', codigo: '128-1' },
    { nombre: 'AV Villas', codigo: '1-49' },
    { nombre: 'Ban100', codigo: '1-51' },
    { nombre: 'Bancamía', codigo: '1-52' },
    { nombre: 'Banco Agrario', codigo: '1-43' },
    { nombre: 'Banco Contactar', codigo: '1-68' },
    { nombre: 'Banco Coopcentral', codigo: '1-58' },
    { nombre: 'Banco de Occidente', codigo: '1-23' },
    { nombre: 'Banco Falabella', codigo: '1-56' },
    { nombre: 'Banco Finandina', codigo: '1-55' },
    { nombre: 'Banco GNB Sudameris', codigo: '1-12' },
    { nombre: 'Banco Mundo Mujer', codigo: '1-60' },
    { nombre: 'Banco Pichincha (Pibank)', codigo: '1-57' },
    { nombre: 'Banco Popular', codigo: '1-2' },
    { nombre: 'Banco Serfinanza', codigo: '1-63' },
    { nombre: 'Banco Unión', codigo: '1-67' },
    { nombre: 'Banco W', codigo: '1-53' },
    { nombre: 'Bancoomeva', codigo: '1-54' },
    { nombre: 'Bold', codigo: '4-127' },
    { nombre: 'Coink', codigo: '128-5' },
    { nombre: 'Coltefinanciera', codigo: '4-46' },
    { nombre: 'Confiar', codigo: '32-5' },
    { nombre: 'Cooperativa Financiera de Antioquia (CFA)', codigo: '32-1' },
    { nombre: 'Cotrafa', codigo: '32-4' },
    { nombre: 'Crezcamos', codigo: '4-118' },
    { nombre: 'Davibank (antes Scotiabank Colpatria)', codigo: '1-42' },
    { nombre: 'Ding (Tecnipagos)', codigo: '128-4' },
    { nombre: 'Global66', codigo: '128-6' },
    { nombre: 'Itaú', codigo: '1-6' },
    { nombre: 'JFK Cooperativa Financiera', codigo: '32-2' },
    { nombre: 'Lulo Bank', codigo: '1-65' },
    { nombre: 'Mercado Pago', codigo: '4-126' },
    { nombre: 'Powwi', codigo: '128-2' },
    { nombre: 'RappiPay', codigo: '4-124' },
    { nombre: 'Ualá', codigo: '4-123' }
  ];

  /* «Otro» va aparte y siempre al final: con él la persona escribe el nombre
     de su cooperativa, que no está en la lista. */
  var OTRO = { nombre: 'Otro', codigo: 'otro' };

  /** Los de la lista de bancos: sin las billeteras, con «Otro» al final. */
  function paraElegir() {
    return ENTIDADES.filter(function (e) { return !e.billetera; })
      .map(function (e) { return { nombre: e.nombre, codigo: e.codigo }; })
      .concat([{ nombre: OTRO.nombre, codigo: OTRO.codigo }]);
  }

  /** El banco por su código, entre los que se pueden elegir. null si no está. */
  function porCodigo(codigo) {
    var c = String(codigo == null ? '' : codigo).trim();
    var l = paraElegir();
    for (var i = 0; i < l.length; i++) if (l[i].codigo === c) return l[i];
    return null;
  }

  return {
    CONSULTADO: CONSULTADO,
    ENTIDADES: ENTIDADES.map(function (e) { return Object.assign({}, e); }),
    OTRO: Object.assign({}, OTRO),
    paraElegir: paraElegir,
    porCodigo: porCodigo
  };
});
