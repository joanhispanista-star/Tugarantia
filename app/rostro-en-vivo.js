/* ============================================================================
 * LA SELFIE QUE SE TOMA SOLA — 8 de octubre de 2026
 *
 * Joan: «al momento de tomar la foto selfie quiero que también se haga
 * automáticamente, quiero que el teléfono la enfoque y que se escanee, y
 * cuando esté centrada la cara y enfocada tome la foto automáticamente, y que
 * parezca más como reconocimiento facial».
 *
 * HASTA HOY EL TELÉFONO NO BUSCABA LA CARA. Medía un ENCUADRE (app/cuenta.js,
 * medirEncuadre): luz, detalle en el centro del óvalo y quietud. Un cartón con
 * una foto pasaba, y una cara a un lado del óvalo a veces no. Ahora busca la
 * cara de verdad, con el detector chico de face-api que ya vive en el sitio
 * (app/lib/rostro, el mismo archivo que usa el CRM), y dispara cuando hay UNA
 * sola cara, centrada, cerca, nítida y quieta unos cuadros seguidos.
 *
 * 22-oct-2026 — Y AHORA TAMBIÉN LOS OJOS, DE VERDAD. Joan: «que la foto de la
 * cara se tome automáticamente, y que parezca aún más que se escanea la cara y
 * los ojos». Con el modelo chico de los puntos de la cara (68 puntos, 77 KB)
 * se ubican los dos ojos y la página los DIBUJA mientras escanea. Nada de
 * ojos pintados «donde suelen estar» (se quitaron el 8-oct por eso): si el
 * modelo no los encontró, no se dibujan.
 *
 * LA FRONTERA, Y POR QUÉ ESTÁ AQUÍ Y NO EN LA PÁGINA:
 *   · Se cargan DOS modelos y nada más: el DETECTOR (dónde hay una cara: una
 *     caja y un puntaje) y, desde el 22-oct, el de los PUNTOS de la cara en su
 *     versión chica, del que se copian SOLO los doce puntos de los dos ojos.
 *     Los otros 56 (nariz, boca, mandíbula) mueren dentro de este archivo.
 *     El modelo que saca el VECTOR para comparar caras no se carga nunca en el
 *     teléfono: es del CRM, que compara la selfie con la cédula en el
 *     computador de quien revisa.
 *   · La caja y los ojos viven en la memoria del bucle y mueren con él. Este
 *     archivo no guarda, no manda y no le devuelve a nadie más que cajas, los
 *     ojos de la cara principal y números de encuadre. Nada se DECIDE con los
 *     ojos (ni «ojos abiertos» ni parpadeo: el modelo chico es impreciso en
 *     los párpados y trabaría a alguien): solo se dibujan. Lo único que sale
 *     del teléfono es la FOTO, como antes.
 *   · La página no carga esto hasta el paso del rostro, y ese paso solo existe
 *     con la autorización de datos sensibles marcada.
 *   La política (legal/privacidad.html, «La foto de tu cara, que se toma sola»)
 *   dice exactamente esto, y pruebas/selfie-automatica.test.js vigila que siga
 *   siendo cierto: si un día aquí se pide el modelo del vector, la prueba se
 *   cae.
 *
 * LO QUE SE PUEDE PROBAR SIN TELÉFONO está separado de lo que no: la decisión
 * (medirRostro, contarRacha, nitidezDe) son números que entran y salen; la
 * carga del detector necesita un navegador con WebGL y se prueba con un
 * face-api de mentira. Si el detector no llega (sin señal para bajar 1,3 MB,
 * un teléfono sin WebGL), la página vuelve al encuadre de siempre: la
 * persona no se queda atascada por un adorno. Si llegan el detector y no los
 * puntos, sigue con la caja, sin ojos dibujados.
 *
 * 26-oct-2026 — DOS SEGUNDOS EN VERDE, Y LA SILUETA. Joan, con el iPhone:
 * «aparece un óvalo pero no tiene forma de cara y te pide la app que te
 * centres en el óvalo lo cual nunca pasará, las caras tienen forma de huevo,
 * y tampoco se tomó la foto automáticamente, quiero que se vea escaneando y
 * que cuando se ponga verde se tome la foto automáticamente después de 2
 * segundos en color verde». Tres cosas cambian aquí (el dibujo de la silueta
 * vive en play/, dibujarMarco):
 *   · LA CUENTA ES DE TIEMPO EN VERDE, no de detecciones (contarVerde): la
 *     foto sale a los ROSTRO.MS_VERDE (2 s) de la primera detección verde, y
 *     lo que se muestra —el aro que se llena, el «2 · 1»— es exactamente lo
 *     que decide. Un parpadeo del detector (la caja tiembla y una detección
 *     sale «movimiento» entre dos buenas) no reinicia la cuenta; perder la
 *     cara sí. contarRacha se queda tal cual para una página vieja en caché.
 *   · EL CENTRO SE MIDE MÁS ABAJO (OVALO.dy): la caja del detector va de la
 *     frente al mentón y su centro cae al 62 % del alto de la cabeza, medido
 *     con el detector de verdad en Chrome sin ventana (scratchpad/lote-26/
 *     rostro-huevo/medicion.md). Con la cabeza centrada en la silueta el
 *     desvío daba 0,25 de 0,30: pasaba por un pelo, y una cabeza apenas 2 %
 *     más abajo decía «Centra tu cara» para siempre. Eso era lo que «nunca
 *     pasaba».
 *   · Los textos dicen «la silueta», que es lo que se dibuja.
 * ==========================================================================*/
/* 23-oct-2026 — LA FIRMA DE LLEGADA. Las páginas piden este archivo con la
   versión en la dirección (…?v=139) y, antes de arrancar su bloque grande,
   miran que haya firmado aquí. Sin la firma, lo que corrió no es este archivo:
   no llegó, o el service worker contestó otra cosa (el v138, sin señal,
   contesta index.html a lo que no guardó), o una caché dio el de antes, que
   no tiene esta línea. Entonces la página dice que se recargue en vez de
   escribir con piezas de dos versiones.
   Va PRIMERO a propósito: firma que llegó ESTE archivo. Si más abajo algo
   revienta en algún teléfono, eso no es mezclar versiones, y la página sigue
   como siempre (cada una se protege sola sin el módulo); con la firma al
   final, ese teléfono quedaría frenado en «recarga» para siempre. En Node no
   hay document y no hace nada. Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la
   nota de v139 en sw.js. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(raiz);
  else raiz.RostroEnVivo = fabrica(raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';

  /* Los umbrales, juntos y con nombre: son lo único que hay que calibrar
     mirando teléfonos de verdad. Estrictos, la persona se atasca con el
     celular en la cara; flojos, sale una foto lejana o movida. Por eso el
     botón manual nunca desaparece.
     22-oct-2026 — SE AFLOJAN TRES, porque Joan la tomaba siempre a mano. Se
     midió en Node con las funciones de verdad y una caja que tiembla como la
     del detector chico en una frontal barata (pruebas/
     la-selfie-se-toma-sola.test.js): con 4 cuadros, 12 % de cambio de tamaño y
     el 80 % de la mejor nitidez, a los 5 segundos se había disparado el 41 % de
     las veces; con estos, casi siempre antes de 2. La nitidez «relativa» era la
     que más tumbaba la racha, y medía el RUIDO del sensor más que el enfoque
     (el ruido la sube un 80 %; un desenfoque de radio 3 la baja un 16 %). */
  var ROSTRO = {
    PUNTAJE_MIN: 0.5,        // confianza del detector para contar una cara
    OTRA_CARA: 0.5,          // una segunda cara cuenta si mide la mitad de la principal o más
    CENTRO_TOL: 0.3,         // desvío del centro, en fracción de los radios del óvalo
    TAMANO_MIN: 0.4,         // alto de la cara / alto del óvalo: menos es «acércate»
    TAMANO_MAX: 1.0,         // más es «aléjate»
    MOVIMIENTO_MAX: 0.06,    // corrimiento entre dos detecciones, en fracción del óvalo
    CAMBIO_TAMANO_MAX: 0.20, // y cambio de tamaño (22-oct: era 0,12, menos que el temblor de la caja)
    NITIDEZ_MIN: 6,          // ver nitidezDe: una pared lisa da casi cero
    NITIDEZ_RELATIVA: 0.6,   // y no mucho peor que la mejor vista (22-oct: era 0,8)
    LUZ_MIN: 40,
    LUZ_MAX: 225,
    CUADROS: 3,              // detecciones buenas seguidas antes de disparar (22-oct: eran 4)
    /* 22-oct-2026 — y un mínimo de tiempo con la cara a la vista: con un
       teléfono rápido, tres detecciones son medio segundo y la persona no
       alcanza a VER que la está escaneando. La cuenta en pantalla sigue siendo
       la racha; esto solo evita que dispare antes de que se vea. */
    MS_ESCANEO_MIN: 900,
    /* 26-oct-2026 — LA CUENTA EN VERDE (contarVerde). MS_VERDE: cuánto tiene
       que llevar la cara en verde para disparar; es lo que Joan pidió («2
       segundos en color verde») y lo que el aro muestra. MS_PARPADEO: una
       detección no verde entre dos verdes se tolera si la verde siguiente
       llega en este rato desde la última verde; con el detector lento (2 por
       segundo, Safari o un Android barato) ni siquiera eso alcanza, así que
       además se tolera UNA detección no verde seguida (PARPADEOS_MAX) hasta
       MS_HUECO_MAX. MS_PERDIDA: sin ninguna cara más de esto, se reinicia
       (la persona se fue del cuadro; no es un parpadeo). Medido en Node con
       el temblor de una frontal barata (la-selfie-se-toma-sola.test.js). */
    MS_VERDE: 2000,
    MS_PARPADEO: 400,
    PARPADEOS_MAX: 1,
    MS_HUECO_MAX: 1200,
    MS_PERDIDA: 400,
    MS_ESPERA_DETECTOR: 8000,// si no llega en este rato, la página vuelve al encuadre
    /* 22-oct-2026 — si en este rato el detector no ha visto NI UNA cara, la
       página lo suelta y vuelve al encuadre (con la caja de la cámara del
       sistema a la vista). Pasó con un detector que contestaba siempre «no hay
       cara» y la persona se quedaba en «Pon tu cara dentro del óvalo» hasta
       tocar «Continuar» sin foto.
       23-oct-2026 — el rato se cuenta desde la PRIMERA vez que el detector mira
       la cámara (play/, detectarCara), no desde que cargó: el detector baja
       mientras el teléfono pregunta por el permiso, y quien tardaba 14 s en
       tocar «Permitir» llegaba con los 12 s ya vencidos, sin una sola mirada. */
    MS_SIN_CARA: 12000,
    /* 23-oct-2026 — y además, cuántas veces tiene que haber mirado sin ver
       ninguna. El reloj solo no basta: con la pantalla apagada o la página en
       segundo plano el reloj corre y el detector no mira, y al volver la
       página decía «el escáner no logra ver tu cara» habiéndola mirado una o
       dos veces. Con un teléfono normal (100-300 ms por mirada) son 1-3 s: el
       que manda sigue siendo MS_SIN_CARA. */
    MIRADAS_SIN_CARA: 8,
    ENTRADA: 224,            // lado con que el detector mira (más grande = más lento)
    ENTRADA_LENTA: 160,      // si el teléfono no da, se mira más chico
    PUNTAJE_OJOS: 0.7,       // con menos confianza en la cara, los ojos no se dibujan
    MS_OJOS_MAX: 400,        // mediana por detección con los ojos: más que esto, se apagan
    MS_LENTO: 700,           // y si sin ojos sigue más lenta que esto, se mira a ENTRADA_LENTA
    MUESTRAS_TIEMPO: 5       // detecciones que se miden antes de decidir lo de arriba
  };

  /* El marco que dibuja la página (play/index.html, dibujarMarco), en
     fracciones de la ZONA QUE SE VE (22-oct-2026: antes, del cuadro entero;
     ver zonaVisible en play/). Si allá cambia, acá también.
     26-oct-2026 — la página ya no dibuja un óvalo sino una silueta de cabeza
     (más ancha en la frente, angosta en el mentón) que cabe en este mismo
     rectángulo de 2·rx por 2·ry: las medidas (tamaño, desvío, movimiento) no
     cambian de significado. Y `dy`: el centro CONTRA EL QUE SE MIDE la caja
     de la cara va dy·ry más abajo que el de la silueta, porque la caja del
     detector no incluye el pelo (su centro cae al 62 % del alto de la cabeza,
     medido: ver la cabecera). Con la cabeza centrada en la silueta el desvío
     pasa de 0,25 a 0,03, y la ventana de ±CENTRO_TOL queda simétrica. */
  var OVALO = { cx: 0.5, cy: 0.5, rx: 0.32, ry: 0.36, dy: 0.22 };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /* La cara más grande con puntaje suficiente, tal como vino, o null. */
  function principal(caras) {
    var mejor = null;
    (caras || []).forEach(function (k) {
      if (!k || num(k.score, 0) < ROSTRO.PUNTAJE_MIN || !(k.w > 0) || !(k.h > 0)) return;
      if (!mejor || k.h > mejor.h) mejor = k;
    });
    return mejor;
  }
  /** La caja de la cara más grande con puntaje suficiente, o null. Solo la caja. */
  function caraPrincipal(caras) {
    var mejor = principal(caras);
    return mejor ? { x: +mejor.x, y: +mejor.y, w: +mejor.w, h: +mejor.h } : null;
  }

  /* 22-oct-2026 — los ojos, limpios: dos ojos de seis puntos [x, y], números
     entre 0 y 1, o null. Lo que no tenga esa forma exacta no se dibuja: un ojo
     a medias pintado sería otra medida que no se hizo. */
  function ojosLimpios(o) {
    if (!o || o.length !== 2) return null;
    var out = [];
    for (var i = 0; i < 2; i++) {
      var ojo = o[i];
      if (!ojo || ojo.length !== 6) return null;
      var pts = [];
      for (var j = 0; j < 6; j++) {
        var p = ojo[j], x = p && (p.x !== undefined ? p.x : p[0]), y = p && (p.y !== undefined ? p.y : p[1]);
        x = +x; y = +y;
        if (!isFinite(x) || !isFinite(y)) return null;
        pts.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
      }
      out.push(pts);
    }
    return out;
  }

  /**
   * ¿Se puede disparar con lo que vio el detector?
   *
   * @param caras  [{x, y, w, h, score, ojos?}] en fracciones de la zona que se ve (0..1)
   * @param ctx    {luz, nitidez, mejorNitidez, previa}
   *               luz: promedio del óvalo (0..255); nitidez: nitidezDe() de la
   *               cara; mejorNitidez: la mejor vista; previa: la `cara` de la
   *               medida anterior (para saber si se mueve)
   * @returns {ok, falla, cara, ojos, caras, tamano, desvio, movimiento}
   *          falla: 'sin_cara' | 'varias' | 'poca_luz' | 'mucha_luz' | 'lejos' |
   *                 'cerca' | 'descentrada' | 'borrosa' | 'movimiento' | ''
   *          ojos: los de la cara principal, SOLO para dibujarlos (null si no
   *          vinieron, si la cara está lejos o si el detector no está seguro).
   *          No deciden nada.
   */
  function medirRostro(caras, ctx) {
    var c = ctx || {};
    var luz = num(c.luz, 128);
    var r = { ok: false, falla: '', cara: null, ojos: null, caras: 0, tamano: 0, desvio: 0, movimiento: 0 };
    var prin = principal(caras);
    var cara = caraPrincipal(caras);
    if (!cara) {
      r.falla = luz < ROSTRO.LUZ_MIN ? 'poca_luz' : (luz > ROSTRO.LUZ_MAX ? 'mucha_luz' : 'sin_cara');
      return r;
    }
    r.cara = cara;
    /* Otra cara de tamaño parecido: alguien al lado o detrás. Una carita
       chiquita al fondo (un afiche, alguien lejos) no frena a nadie. */
    var cuantas = 0;
    (caras || []).forEach(function (k) {
      if (k && num(k.score, 0) >= ROSTRO.PUNTAJE_MIN && k.h >= ROSTRO.OTRA_CARA * cara.h) cuantas++;
    });
    r.caras = cuantas;
    if (cuantas > 1) { r.falla = 'varias'; return r; }
    if (luz < ROSTRO.LUZ_MIN) { r.falla = 'poca_luz'; return r; }
    if (luz > ROSTRO.LUZ_MAX) { r.falla = 'mucha_luz'; return r; }

    var fx = cara.x + cara.w / 2, fy = cara.y + cara.h / 2;
    r.tamano = cara.h / (2 * OVALO.ry);
    /* 26-oct-2026 — el centro de la caja se compara con el de la silueta
       corrido dy·ry hacia abajo (ver OVALO). */
    r.desvio = Math.max(Math.abs(fx - OVALO.cx) / OVALO.rx, Math.abs(fy - (OVALO.cy + OVALO.dy * OVALO.ry)) / OVALO.ry);
    /* Primero la distancia y después el centro: a quien está lejos, «céntrate»
       no le sirve todavía; al acercarse se centra casi solo. */
    if (r.tamano < ROSTRO.TAMANO_MIN) { r.falla = 'lejos'; return r; }
    /* 22-oct-2026 — de aquí en adelante la cara está cerca: sus ojos se pueden
       dibujar, si el detector está seguro de que es una cara. */
    if (num(prin.score, 0) >= ROSTRO.PUNTAJE_OJOS) r.ojos = ojosLimpios(prin.ojos);
    if (r.tamano > ROSTRO.TAMANO_MAX) { r.falla = 'cerca'; return r; }
    if (r.desvio > ROSTRO.CENTRO_TOL) { r.falla = 'descentrada'; return r; }

    var nit = num(c.nitidez, 0), mejor = num(c.mejorNitidez, 0);
    if (nit < ROSTRO.NITIDEZ_MIN || (mejor > 0 && nit < ROSTRO.NITIDEZ_RELATIVA * mejor)) {
      r.falla = 'borrosa'; return r;
    }
    /* Sin detección anterior no se sabe si está quieta: no es un fallo, es
       que todavía no se sabe. */
    var p = c.previa;
    if (!p || !(p.h > 0)) { r.falla = 'movimiento'; r.movimiento = 999; return r; }
    var px = p.x + p.w / 2, py = p.y + p.h / 2;
    r.movimiento = Math.max(Math.abs(fx - px) / (2 * OVALO.rx), Math.abs(fy - py) / (2 * OVALO.ry));
    var cambio = Math.abs(cara.h - p.h) / p.h;
    if (r.movimiento > ROSTRO.MOVIMIENTO_MAX || cambio > ROSTRO.CAMBIO_TAMANO_MAX) {
      r.falla = 'movimiento'; return r;
    }
    r.ok = true;
    return r;
  }

  /**
   * La racha: cuántas detecciones buenas seguidas, y si ya se dispara. Se cae
   * a cero con una sola mala — que es lo que la persona tiene que ver para
   * entender qué se le pide.
   *
   * 22-oct-2026 — con `o.ahora` (la hora de esta detección) y `o.desde` (desde
   * cuándo se ve ESTA cara, que esta misma función devuelve), además hace
   * falta que la cara lleve ROSTRO.MS_ESCANEO_MIN a la vista: que se vea que
   * la escanea. Es el tiempo con la cara en el óvalo, no en verde: medido con
   * una frontal barata, exigir 900 ms SEGUIDOS en verde tumbaba la racha casi
   * tanto como los umbrales de antes. Sin cara, se vuelve a contar desde
   * cero. Sin `o`, solo cuenta detecciones, como antes. `avance` es lo que
   * falta de las dos cosas.
   */
  function contarRacha(estables, medida, o) {
    var ok = !!(medida && medida.ok);
    var e = ok ? (Math.max(0, +estables || 0) + 1) : 0;
    var r = { estables: e, disparar: e >= ROSTRO.CUADROS, avance: Math.min(1, e / ROSTRO.CUADROS) };
    if (o && isFinite(+o.ahora)) {
      var ahora = +o.ahora;
      var hayCara = !!(medida && medida.cara);
      var desde = !hayCara ? 0 : ((isFinite(+o.desde) && +o.desde > 0) ? +o.desde : ahora);
      var ms = hayCara ? Math.max(0, ahora - desde) : 0;
      r.desde = desde;
      r.ms = ms;
      if (ROSTRO.MS_ESCANEO_MIN > 0) {
        r.disparar = r.disparar && ms >= ROSTRO.MS_ESCANEO_MIN;
        r.avance = Math.min(r.avance, ms / ROSTRO.MS_ESCANEO_MIN);
      }
    }
    return r;
  }

  /* 26-oct-2026 — un estado limpio de la cuenta en verde: solo tiempos y
     conteos; nunca dónde estaba la cara. */
  function estadoVerdeNuevo() {
    /* activa: la cuenta está andando. Es una bandera aparte de `desde`
       porque el instante 0 es una hora válida (las pruebas cuentan desde 0). */
    return { activa: 0, desde: 0, ultimoVerde: 0, ultimaCara: 0, parpadeos: 0, verdes: 0, miradas: 0 };
  }
  function estadoVerdeDe(e) {
    var n = estadoVerdeNuevo();
    if (!e || typeof e !== 'object') return n;
    Object.keys(n).forEach(function (k) { n[k] = Math.max(0, num(e[k], 0)); });
    return n;
  }

  /**
   * LA CUENTA DE DOS SEGUNDOS EN VERDE — 26-oct-2026. Sustituye a contarRacha
   * en play/ (que la sigue usando si este archivo le llegó viejo).
   *
   * Reglas, que son las que la persona ve en el aro:
   *   · empieza con la primera detección verde (medida.ok) y dispara en la
   *     primera verde que llegue a ROSTRO.MS_VERDE desde esa: nunca antes;
   *   · una detección no verde CON cara (la caja tembló: «movimiento», o el
   *     autofoco: «borrosa») es un parpadeo y no reinicia, si la verde
   *     siguiente llega en MS_PARPADEO desde la última verde, o si es una
   *     sola seguida (PARPADEOS_MAX) y llega antes de MS_HUECO_MAX;
   *   · sin ninguna cara más de MS_PERDIDA, o un hueco entre verdes mayor que
   *     MS_HUECO_MAX (el detector no estaba mirando), se reinicia;
   *   · el cuadro que dispara es verde: pasó la nitidez y la quietud.
   *
   * @param estado  lo que devolvió la llamada anterior en `estado` (null al empezar)
   * @param medida  lo que devolvió medirRostro para esta detección
   * @param ahora   la hora de esta detección, en ms
   * @returns {estado, enVerde, ms, avance, disparar, parpadeo}
   *          enVerde: la cuenta está andando; ms: cuánto lleva; avance: ms
   *          sobre MS_VERDE (0..1); parpadeo: esta detección no fue verde y se
   *          toleró.
   */
  function contarVerde(estado, medida, ahora) {
    var t = num(ahora, 0);
    var e = estadoVerdeDe(estado);
    var ok = !!(medida && medida.ok), hayCara = !!(medida && medida.cara);
    var parpadeo = false;
    var reiniciar = function () { e.activa = 0; e.desde = 0; e.ultimoVerde = 0; e.parpadeos = 0; e.verdes = 0; e.miradas = 0; };
    if (ok) {
      if (!e.activa || t - e.ultimoVerde > ROSTRO.MS_HUECO_MAX) { reiniciar(); e.activa = 1; e.desde = t; }
      e.ultimoVerde = t; e.parpadeos = 0; e.verdes++; e.miradas++;
    } else if (e.activa) {
      if (!hayCara && t - e.ultimaCara > ROSTRO.MS_PERDIDA) {
        reiniciar();
      } else {
        e.parpadeos++; e.miradas++;
        var hueco = t - e.ultimoVerde;
        if (hueco > ROSTRO.MS_HUECO_MAX || (e.parpadeos > ROSTRO.PARPADEOS_MAX && hueco > ROSTRO.MS_PARPADEO)) reiniciar();
        else parpadeo = true;
      }
    }
    if (hayCara) e.ultimaCara = t;
    var ms = e.activa ? Math.max(0, t - e.desde) : 0;
    return { estado: e, enVerde: !!e.activa, ms: ms, avance: Math.min(1, ms / ROSTRO.MS_VERDE),
             disparar: ok && ms >= ROSTRO.MS_VERDE, parpadeo: parpadeo };
  }

  /* Lo mismo, visto entre detecciones (para dibujar el aro a 80 ms aunque el
     detector conteste cada 300): cuánto lleva en verde AHORA. Si la última
     verde quedó más atrás que MS_HUECO_MAX, el detector no está mirando y el
     aro no puede seguir llenándose solo por el reloj. `segundos` es lo que
     falta, redondeado hacia arriba, para el «2 · 1» de la pantalla. */
  function avanceVerde(estado, ahora) {
    var e = estadoVerdeDe(estado), t = num(ahora, 0);
    var vivo = !!e.activa && t - e.ultimoVerde <= ROSTRO.MS_HUECO_MAX;
    var ms = vivo ? Math.max(0, t - e.desde) : 0;
    return { enVerde: vivo, ms: ms, avance: Math.min(1, ms / ROSTRO.MS_VERDE),
             segundos: vivo ? Math.max(1, Math.ceil((ROSTRO.MS_VERDE - ms) / 1000)) : 0 };
  }

  /**
   * Qué tan nítida está la cara: el cambio medio entre píxeles vecinos,
   * dividido por el contraste de la propia cara. Lo de dividir no es adorno:
   * con poca luz una cara NÍTIDA tiene gradientes chicos, y sin dividir se
   * leía como borrosa (el mismo error que el 2-oct se le quitó a la medida de
   * las fotos del CRM). Desenfocada o movida, el contraste se queda y los
   * bordes se ablandan: el número baja.
   *
   * @param gris  valores 0..255 de un cuadro de w×h (la cara, ya reducida)
   */
  function nitidezDe(gris, w, h) {
    var g = gris || [], n = g.length;
    if (!w || !h || w * h !== n || w < 4 || h < 4) return 0;
    var t = 0, k = 0, min = 255, max = 0, hist = new Uint32Array(256);
    for (var y = 0; y < h - 1; y++) {
      for (var x = 0; x < w - 1; x++) {
        var v = g[y * w + x];
        t += Math.abs(g[y * w + x + 1] - v) + Math.abs(g[(y + 1) * w + x] - v);
        k++;
      }
    }
    for (var i = 0; i < n; i++) { var q = g[i] | 0; hist[q < 0 ? 0 : (q > 255 ? 255 : q)]++; if (q < min) min = q; if (q > max) max = q; }
    /* Contraste robusto: del percentil 10 al 90, para que un brillo o un
       pelo negro no lo decidan solos. */
    var acc = 0, p10 = min, p90 = max, a = n * 0.1, b = n * 0.9, vistoA = false;
    for (var j = 0; j < 256; j++) {
      acc += hist[j];
      if (!vistoA && acc >= a) { p10 = j; vistoA = true; }
      if (acc >= b) { p90 = j; break; }
    }
    return k ? 100 * (t / k) / (p90 - p10 + 8) : 0;
  }

  /* La mejor nitidez vista, con memoria corta: se desinfla un poco en cada
     cuadro para que un destello raro no deje la vara imposible para siempre. */
  function mejorNitidez(mejor, nueva) {
    var m = num(mejor, 0) * 0.97;
    return Math.max(m, num(nueva, 0));
  }

  /* Lo que la persona lee. Cada frase dice qué hacer, no qué pasó. */
  var TEXTO = {
    sin_cara: 'Pon tu cara dentro del óvalo',
    varias: 'Que se vea solo tu cara',
    poca_luz: 'Busca un sitio con más luz',
    /* 8-oct-2026 (segunda vuelta) — decía «Demasiada luz atrás: date la
       vuelta», pero esto salta cuando la CARA está quemada (luz de frente o un
       flash). Una cara a contraluz se ve OSCURA y cae en poca_luz. */
    mucha_luz: 'Hay demasiada luz en tu cara: busca una luz más suave',
    lejos: 'Acércate un poco',
    cerca: 'Aléjate un poco',
    descentrada: 'Centra tu cara en el óvalo',
    borrosa: 'Quieto: estamos enfocando',
    movimiento: 'Quieto…',
    '': 'Quieto…'
  };
  function textoDeRostro(m) {
    if (!m) return TEXTO.sin_cara;
    return TEXTO[m.falla] !== undefined ? TEXTO[m.falla] : TEXTO.sin_cara;
  }

  /* De lo que devuelve face-api a cajas en fracciones del cuadro. Se copia
     SOLO la caja, el puntaje y —22-oct-2026— los doce puntos de los dos ojos,
     si vinieron: lo demás que traiga el objeto (los otros 56 puntos, y lo que
     sea) no sale de aquí. */
  function cajasDe(resultados, w, h) {
    var out = [];
    if (!w || !h) return out;
    (resultados || []).forEach(function (d) {
      var b = d && (d.box || (d.detection && d.detection.box));
      if (!b) return;
      var s = d.score != null ? d.score : (d.detection ? d.detection.score : 0);
      var k = { x: b.x / w, y: b.y / h, w: b.width / w, h: b.height / h, score: num(s, 0) };
      var o = ojosDe(d.landmarks, w, h);
      if (o) k.ojos = o;
      out.push(k);
    });
    return out;
  }
  /* Los dos ojos de los 68 puntos (36-41 y 42-47), en fracciones del cuadro.
     Solo eso se copia; si algo no cuadra, null y la cara sigue sin ojos. */
  function ojosDe(puntos, w, h) {
    if (!puntos || typeof puntos.getLeftEye !== 'function' || typeof puntos.getRightEye !== 'function') return null;
    try {
      var aFraccion = function (p) { return p ? [+p.x / w, +p.y / h] : [NaN, NaN]; };
      return ojosLimpios([(puntos.getLeftEye() || []).map(aFraccion), (puntos.getRightEye() || []).map(aFraccion)]);
    } catch (e) { return null; }
  }

  function mediana(a) {
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s.length ? s[s.length >> 1] : 0;
  }

  /**
   * Baja face-api, el modelo del detector y —22-oct-2026— el chico de los
   * puntos de la cara (solo para ubicar los ojos), desde el propio sitio.
   *
   * @param o {cargarScript(url, listo) → Promise, base: carpeta de app/lib/rostro,
   *           calentar: un lienzo vacío (opcional), ahora(): ms (opcional)}
   *          cargarScript es el de la página: así un fallo se puede
   *          reintentar y una carga en vuelo no se duplica.
   *          `calentar`: una detección sobre él ANTES de devolver el detector.
   *          La primera detección compila los programas de la tarjeta gráfica
   *          (2 o 3 segundos); hecha aquí, cae en «Preparando el escáner…» y
   *          no en el vigilante de la página, que la tomaba por un teléfono
   *          que no puede.
   * @returns Promise<{detectar(lienzo) → Promise<cajas>, liberar(), info()}>
   *          Se rechaza si face-api no llega, si el detector no carga, o si no
   *          hay aceleración gráfica (ver abajo): la página vuelve al encuadre.
   */
  function crearDetector(o) {
    var op = o || {};
    var cargar = op.cargarScript;
    var base = String(op.base || '../app/lib/rostro').replace(/\/+$/, '');
    var reloj = typeof op.ahora === 'function' ? op.ahora : function () { return Date.now(); };
    if (typeof cargar !== 'function') return Promise.reject(new Error('falta cargarScript'));
    /* 23-oct-2026 — y se le dice a cargarScript qué global se espera: el de
       play/ rechaza y OLVIDA la carga si `load` llegó sin él (index.html
       servido como .js por el service worker sin señal). Antes esa promesa
       quedaba resuelta y face-api no se volvía a pedir en toda la sesión: la
       comprobación de abajo lo veía, pero ya era tarde. */
    var llego = function () { var f = raiz.faceapi; return !!(f && f.nets && f.nets.tinyFaceDetector); };
    return Promise.resolve(cargar(base + '/face-api.js', llego)).then(function () {
      var fa = raiz.faceapi;
      if (!fa || !fa.nets || !fa.nets.tinyFaceDetector ||
          typeof fa.TinyFaceDetectorOptions !== 'function' || typeof fa.detectAllFaces !== 'function') {
        /* El service worker sin señal puede entregar otra cosa en vez del
           .js: el archivo «cargó» y el global no está. Eso es un fallo. */
        throw new Error('no cargó el detector de caras');
      }
      var red = fa.nets.tinyFaceDetector;
      var redOjos = fa.nets.faceLandmark68TinyNet || null;
      var motor = '';
      var listo = fa.tf && typeof fa.tf.ready === 'function' ? fa.tf.ready() : null;
      return Promise.resolve(listo).then(function () {
        /* 22-oct-2026 — SIN ACELERACIÓN GRÁFICA, NO. Cuando WebGL falla, la
           librería cae EN SILENCIO al procesador: medido en un i9, una pasada
           del detector son 1,4 s; en un Android barato, de 5 a 10, y con el
           hilo de la página tomado: la pantalla se congela y el vigilante ni
           siquiera alcanza a correr. Mejor el encuadre de siempre. */
        motor = fa.tf && typeof fa.tf.getBackend === 'function' ? String(fa.tf.getBackend() || '') : '';
        if (motor && !/^(webgl|webgpu)$/i.test(motor)) throw new Error('sin aceleración gráfica (' + motor + ')');
        return red.isLoaded ? null : red.loadFromUri(base);
      }).then(function () {
        var estado = { vivo: true, ojos: false, ojosApagados: false, entrada: ROSTRO.ENTRADA, tiempos: [] };
        var opciones = function () {
          return new fa.TinyFaceDetectorOptions({ inputSize: estado.entrada, scoreThreshold: ROSTRO.PUNTAJE_MIN * 0.8 });
        };
        var soltarOjos = function () {
          estado.ojos = false;
          if (redOjos && redOjos.isLoaded) { try { if (typeof redOjos.dispose === 'function') redOjos.dispose(); } catch (e) {} }
        };
        /* Lo que tarda cada detección decide si se pueden pagar los ojos: el
           teléfono que no da primero pierde el dibujo, y después mira más
           chico. Nunca al revés: la foto es lo que importa. */
        var anotar = function (ms, conOjos) {
          if (!isFinite(ms)) return;
          estado.tiempos.push(ms);
          if (estado.tiempos.length > 9) estado.tiempos.shift();
          if (estado.tiempos.length < ROSTRO.MUESTRAS_TIEMPO) return;
          var med = mediana(estado.tiempos);
          if (conOjos && med > ROSTRO.MS_OJOS_MAX) {
            estado.ojosApagados = true; soltarOjos(); estado.tiempos = [];
          } else if (!conOjos && med > ROSTRO.MS_LENTO && estado.entrada > ROSTRO.ENTRADA_LENTA) {
            estado.entrada = ROSTRO.ENTRADA_LENTA; estado.tiempos = [];
          }
        };
        var det = {
          detectar: function (lienzo) {
            if (!estado.vivo || !lienzo) return Promise.resolve([]);
            var w = lienzo.width || lienzo.videoWidth, h = lienzo.height || lienzo.videoHeight;
            var conOjos = estado.ojos;
            var t0 = reloj();
            var tarea = fa.detectAllFaces(lienzo, opciones());
            if (conOjos && tarea && typeof tarea.withFaceLandmarks === 'function') tarea = tarea.withFaceLandmarks(true);
            return Promise.resolve(tarea && typeof tarea.run === 'function' ? tarea.run() : tarea)
              .then(function (rs) {
                anotar(reloj() - t0, conOjos);
                return estado.vivo ? cajasDe(rs, w, h) : [];
              });
          },
          /* Suelta la memoria de los modelos (en el teléfono, memoria de la
             tarjeta gráfica) apenas se toma la foto: lo que viene después es
             la subida, y ahí hace falta. */
          liberar: function () {
            estado.vivo = false;
            try { if (typeof red.dispose === 'function') red.dispose(); } catch (e) {}
            soltarOjos();
          },
          /* Para quien mira de qué es capaz el teléfono: solo esto, sin nada
             de la cara. */
          info: function () { return { motor: motor, ojos: estado.ojos, entrada: estado.entrada }; }
        };
        /* Los puntos de los ojos se bajan DESPUÉS y sin frenar al detector: si
           no llegan (77 KB más con señal floja), la selfie se toma igual, solo
           que sin ojos dibujados. */
        if (redOjos && typeof redOjos.loadFromUri === 'function' && op.ojos !== false) {
          Promise.resolve(redOjos.isLoaded ? null : redOjos.loadFromUri(base)).then(function () {
            if (estado.vivo && !estado.ojosApagados) estado.ojos = true;
            else soltarOjos();
          }, function () { estado.ojos = false; });
        }
        if (!op.calentar) return det;
        return det.detectar(op.calentar).then(function () { estado.tiempos = []; return det; });
      });
    });
  }

  return {
    VERSION: '2026-10-26',
    ROSTRO: ROSTRO,
    OVALO: OVALO,
    caraPrincipal: caraPrincipal,
    medirRostro: medirRostro,
    contarRacha: contarRacha,
    contarVerde: contarVerde,
    avanceVerde: avanceVerde,
    nitidezDe: nitidezDe,
    mejorNitidez: mejorNitidez,
    textoDeRostro: textoDeRostro,
    cajasDe: cajasDe,
    ojosLimpios: ojosLimpios,
    crearDetector: crearDetector
  };
});
