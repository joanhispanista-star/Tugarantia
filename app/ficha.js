/* ============================================================================
 * FICHA DEL SOCIO — leer el paquete de la nube, en UN solo sitio
 * 14 de septiembre de 2026.
 *
 * POR QUÉ NACE ESTE ARCHIVO
 *
 * El paquete que Joan publica (`datos` de socios_historial) lo abren ahora DOS
 * pantallas: app/socio.html, que lo trae con el código de acceso, y play/, que
 * lo trae con la sesión (mi_cuenta). Abrirlo no es copiar campos: hay reglas
 * dentro de ese gesto, y son reglas de plata.
 *
 *   · el nivel se DERIVA del total, nunca se lee del paquete (2-sep-2026: el
 *     g.nivel guardado era el piso de una promesa derogada);
 *   · la prestada sale POR RESTA (total − ganada) para que las dos partes sumen
 *     el total siempre, incluso si un ajuste se comió parte del cupón;
 *   · la comprometida se recorta contra la ganada, porque lo que respalda un
 *     préstamo es la ganada libre y nada más;
 *   · y el máximo respaldado sale de maximoRespaldado y de ninguna otra parte
 *     —nunca de un Math.min escrito a mano—, que es la REGLA DE ORO de motor.js.
 *
 * Escritas dos veces, el día que una cambie la otra se queda vieja y las dos
 * pantallas le dirán al mismo socio dos cupos distintos. Así que viven acá.
 *
 * ESTE ARCHIVO NO INVENTA NINGUNA CUENTA. Todo lo aritmético se lo pide a
 * motor.js; lo que hace es leer el paquete y llamar a quien sabe.
 * ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./motor.js'));
  else raiz.FichaSocio = fabrica(raiz.MotorReglas);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /**
   * Lee el paquete `datos` y devuelve la garantía del socio, ya desglosada, con
   * su nivel, su cupo quincenal y su máximo con garantía.
   *
   * @param {object} datos  el `datos` de socios_historial tal como llega
   * @returns {object} {g, gd, nivel, cupo, maxRespaldado, entrada,
   *                    creditos, respaldados, respaldadoActivo, activo}
   */
  function leer(datos) {
    var d = datos || {};
    var g = d.garantia || {};
    var creditos = (d.creditos || []).slice();
    var respaldados = (d.respaldados || []).slice();

    /* El nivel es el TRAMO de la garantía y se deriva del total con el motor de
       esta misma app. El g.nivel que venga guardado NO se mira: así la pantalla
       queda inmune a paquetes de otra versión, viejos o nuevos. */
    var nivel = M.nivelPorGarantia(num(g.total));

    var abiertos = respaldados.filter(function (r) { return !r.pagado; });
    var comprometidaCruda = num(g.comprometida != null ? g.comprometida
      : abiertos.reduce(function (t, r) { return t + num(r.saldo_capital); }, 0));
    var ganada = Math.max(0, num(g.acumulada));

    var gd = {
      cupon: num(g.cupon),
      referidos: num(g.referidos),
      /* Por resta, a propósito: las dos partes tienen que sumar el total
         SIEMPRE. Si se recalculara, habría dos verdades sobre la misma plata. */
      prestada: Math.max(0, num(g.total) - ganada),
      ganada: ganada,
      comprometida: Math.min(comprometidaCruda, ganada),
      total: num(g.total)
    };
    gd.ganada_libre = gd.ganada - gd.comprometida;
    gd.base_cupo = Math.max(0, gd.total - gd.comprometida);

    /* La entrada que entiende el motor. El cupón sale de los datos cargados y
       los referidos de los que YA pagaron: es la misma cuenta que hizo el
       Panel, no una segunda. */
    var entrada = {
      datos: (d.perfil && d.perfil.datos) || {},
      referidos: num(d.referidos && d.referidos.pagaron),
      acumulada: gd.ganada,
      ajuste: 0,
      comprometida: gd.comprometida
    };

    return {
      g: g,
      gd: gd,
      nivel: nivel,
      /* El cupo es la garantía uno a uno. Se le sigue pasando el nivel porque el
         motor lo valida —un nivel inventado tiene que reventar acá y no dos
         pantallas más allá—, no porque mueva el número. */
      cupo: M.calcularCupo(gd.base_cupo, nivel),
      /* REGLA DE ORO: de maximoRespaldado y de ninguna otra parte. Es la única
         que sabe que solo la ganada libre respalda un préstamo, nunca el cupón
         que le regalamos nosotros. */
      maxRespaldado: M.maximoRespaldado(entrada),
      entrada: entrada,
      creditos: creditos,
      respaldados: respaldados,
      respaldadoActivo: abiertos[0] || null,
      activo: creditos.filter(function (c) { return !c.pagado; })[0] || null,
      pagados: creditos.filter(function (c) { return c.pagado; })
    };
  }

  /**
   * La cuota que sigue de un préstamo con garantía activo, con su fecha.
   * Null si no hay préstamo o si ya está todo pagado.
   */
  function proximaCuota(respaldadoActivo) {
    if (!respaldadoActivo) return null;
    return (respaldadoActivo.cuotas || [])
      .filter(function (c) { return !c.pagado; })
      .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); })[0] || null;
  }

  return { VERSION: '2026-09-14', leer: leer, proximaCuota: proximaCuota };
});
