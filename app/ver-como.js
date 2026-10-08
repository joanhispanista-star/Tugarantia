/* ============================================================================
 * «👁 VER LA APP COMO LA VE ÉL», SIN CÓDIGOS — 7 de octubre de 2026.
 *
 * Hasta hoy el botón del CRM abría app/socio.html#p=<cédula>-<código>, y la
 * app buscaba al cliente en la cartera de este computador con esos dos datos.
 * Con los códigos apagados (decisión de Joan del 7-oct) ese camino se cae, y
 * dejarlo con la cédula sola sería una puerta: cualquiera que abra
 * socio.html#p=<cédula ajena> en el computador de Joan vería la cuenta.
 *
 * AHORA: el CRM —ya desbloqueado con el PIN— deja en el localStorage de este
 * mismo origen un pase de UN uso que vence en 60 segundos:
 *     joan_ver_como = { id, nonce, hasta }
 * y abre socio.html#v=<nonce>. La app acepta el pase solo si el nonce es el
 * mismo y no venció, lo BORRA al leerlo (no sirve dos veces, ni para recargar)
 * y busca al cliente en la cartera de este computador (joan_socios_v1) por el
 * id INTERNO de la ficha, no por cédula ni celular: dos fichas pueden
 * compartir celular (la pareja que comparte línea) y abrir la equivocada
 * delante de un cliente es peor que no abrir. Si no aparece exactamente una,
 * se niega.
 *
 * POR QUÉ NO SIRVE DESDE OTRO APARATO: el pase y la cartera viven en el
 * localStorage de ESTE navegador en ESTE origen. En el celular de un cliente
 * no hay ni pase ni cartera, y un #v= copiado no trae nada adentro: es una
 * contraseña de un uso que solo este computador conoce.
 *
 * SOLO LECTURA de la cartera: este archivo no escribe joan_socios_v1 nunca.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.VerComo = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LLAVE = 'joan_ver_como';
  var LLAVE_CARTERA = 'joan_socios_v1';
  var VIGENCIA_MS = 60000;

  /* 16 bytes de azar del navegador. Sin crypto (un navegador muy viejo) no
     hay pase: un nonce de Math.random se adivina y esto es una llave. */
  function nonceNuevo(azar) {
    var b = new Uint8Array(16);
    if (typeof azar === 'function') azar(b);
    else if (typeof crypto !== 'undefined' && crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else return null;
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  /** El CRM lo llama con el id de la ficha (s.id). Devuelve el nonce para
   *  armar #v=, o null si no se pudo (sin azar o sin disco). */
  function crear(almacen, socioId, ahoraMs, azar) {
    var id = String(socioId == null ? '' : socioId);
    if (!id || !almacen) return null;
    var nonce = nonceNuevo(azar);
    if (!nonce) return null;
    try {
      almacen.setItem(LLAVE, JSON.stringify({ id: id, nonce: nonce, hasta: Number(ahoraMs) + VIGENCIA_MS }));
    } catch (e) { return null; }
    return nonce;
  }

  /** socio.html lo llama con location.hash. Devuelve el id de la ficha si el
   *  pase es bueno; null si no. El pase se borra siempre que se mire con un
   *  #v=: bueno, vencido o ajeno. */
  function consumir(almacen, hash, ahoraMs) {
    var m = /[#&]v=([0-9a-f]{32})(?![0-9a-f])/.exec(String(hash || ''));
    if (!m || !almacen) return null;
    var pase = null;
    try { pase = JSON.parse(almacen.getItem(LLAVE) || 'null'); } catch (e) { pase = null; }
    try { almacen.removeItem(LLAVE); } catch (e) { /* nada */ }
    if (!pase || pase.nonce !== m[1]) return null;
    if (!(Number(pase.hasta) > Number(ahoraMs))) return null;
    return pase.id ? String(pase.id) : null;
  }

  /** La ficha de ese id en la cartera (ya normalizada por el puente).
   *  {socio} o {motivo:'ninguna'|'varias'}. */
  function buscar(db, socioId) {
    var id = String(socioId == null ? '' : socioId);
    var socios = (db && Array.isArray(db.socios)) ? db.socios : [];
    var hallados = id ? socios.filter(function (s) { return !!s && String(s.id) === id; }) : [];
    if (hallados.length === 1) return { socio: hallados[0] };
    return { motivo: hallados.length ? 'varias' : 'ninguna' };
  }

  return { LLAVE: LLAVE, LLAVE_CARTERA: LLAVE_CARTERA, VIGENCIA_MS: VIGENCIA_MS,
           crear: crear, consumir: consumir, buscar: buscar };
});
