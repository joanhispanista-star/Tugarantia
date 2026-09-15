/* ===========================================================================
 * ESPERAR A QUE LA PANTALLA TERMINE
 * 15-sep-2026.
 *
 * Por qué existe: dieciocho pruebas de este repositorio esperaban así —
 *
 *     return new Promise(r => setImmediate(r)).then(() => { ... })
 *
 * — es decir, UN solo tic. Alcanza cuando la pantalla resuelve su fetch en un
 * `.then()` y pinta. No alcanza si la cadena tiene un salto más, y entonces la
 * prueba falla A VECES: verde catorce corridas seguidas y roja la quince.
 *
 * Eso pasó hoy, y una prueba intermitente es peor que ninguna — enseña a mirar
 * el rojo y encogerse de hombros. Ya hubo otra hoy (el rayo) que sí escondía un
 * defecto real, y se habría perdido entre los falsos.
 *
 * `asentar()` drena varios tics en vez de uno. `hasta()` es mejor todavía:
 * espera a que la CONDICIÓN se cumpla y devuelve en cuanto pase, así que no
 * alarga las pruebas que ya iban rápido.
 * ========================================================================= */

/** Drena `veces` tics de macrotarea. Por defecto 8: de sobra para cualquier
    cadena de promesas razonable, y sigue siendo instantáneo. */
function asentar(veces) {
  var n = veces == null ? 8 : veces;
  var p = Promise.resolve();
  for (var i = 0; i < n; i++) {
    p = p.then(function () { return new Promise(function (r) { setImmediate(r); }); });
  }
  return p;
}

/**
 * Espera a que `condicion()` devuelva algo verdadero, mirando entre tic y tic.
 * Se rinde a los `max` tics y devuelve igual, para que sea la PRUEBA la que
 * diga qué faltaba —con su propio mensaje— y no un tiempo de espera agotado
 * que no explica nada.
 */
function hasta(condicion, max) {
  var n = max == null ? 40 : max;
  return new Promise(function (listo) {
    var i = 0;
    (function tic() {
      var ok = false;
      try { ok = !!condicion(); } catch (e) { ok = false; }
      if (ok || i++ >= n) return listo(ok);
      setImmediate(tic);
    }());
  });
}

module.exports = { asentar: asentar, hasta: hasta };
