/* ============================================================================
 * PIDE LO QUE NECESITAS, Y LAS CONDICIONES DE LO QUE TE PROPONEMOS
 * 8 de octubre de 2026.
 *
 * Joan, con sus palabras: «cuando le di solicitar crédito no me dejó solicitar
 * lo que yo quería ni el plazo que quería, ni siquiera se ve una calculadora
 * con la que yo pueda interactuar. Recuerda que el cliente puede pedir lo que
 * quiera y yo soy el encargado de darle una contrapropuesta, y quiero que esta
 * misma calculadora se vea al inicio de la plataforma para que los clientes
 * nuevos, antes de registrarse, puedan interactuar».
 *
 * Y sobre los términos: «no quiero que se indique cuánto se paga ni que existe
 * la modalidad quincenal: eso lo defino yo desde el CRM —los días, el monto y lo
 * que paga en comisiones—, no todos los clientes piden el mismo servicio; y al
 * momento de la contrapropuesta que se le muestren los términos y condiciones
 * de ese crédito en específico».
 *
 * DOS MITADES DE LA MISMA CONVERSACIÓN, EN UN SOLO ARCHIVO:
 *
 *   1. LA CALCULADORA DEL PEDIDO. Cuánto y para cuándo, con el dedo. NO
 *      PUBLICA NINGÚN PRECIO, y no es timidez: el precio lo pone Joan cliente
 *      por cliente, y una cifra publicada aquí sería (a) una oferta que obliga
 *      —Ley 1480, art. 29: lo anunciado obliga— y que Joan no quiere hacer, y
 *      (b) un precio que habría que contrastar cada mes contra el techo de
 *      usura (art. 305 del Código Penal). Sin precio no hay nada que se pase.
 *      Lo que sí dice, con todas las letras: «el costo exacto te lo mandamos en
 *      la propuesta, antes de que aceptes nada».
 *
 *   2. LAS CONDICIONES DE ESA PROPUESTA. Cuando Joan contesta, el cliente lee
 *      en un solo bloque qué recibe, cuándo paga, cuánto en total, lo que
 *      cuesta, qué pasa si se atrasa, la garantía que le deja y cómo se paga, y
 *      marca «Leí y acepto las condiciones de este crédito» antes del botón. El
 *      texto que vio viaja con la aceptación (base/20261008_condiciones_
 *      aceptadas.sql) para que mañana nadie discuta qué se aceptó.
 *
 * Por qué juntas: la calculadora pregunta y las condiciones contestan, con las
 * mismas fechas en palabras y la misma forma de escribir los pesos. Dos
 * archivos se separarían con el primer arreglo.
 *
 * LO QUE NO HACE: no calcula costos ni tasas (eso es de motor.js y del CRM de
 * Joan, que son los que tienen la tabla de usura), no decide nada y no habla
 * con la nube. Las pantallas llaman a sus funciones de la base; esto solo arma
 * lo que se ve y lo que se manda.
 *
 * Lo usan: play/index.html (portada, pedido y propuesta), index.html (la
 * portada del sitio) y platachat/index.html (las condiciones de la propuesta).
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CalculadoraSolicitud = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* LOS PESOS, EN DOS FORMAS, Y CADA UNA EN SU SITIO (8-oct-2026, segunda
     vuelta). Joan pidió la suya —1,500.000, punto para los miles y coma para
     los millones— para lo que el cliente TECLEA («en la parte que pregunta mis
     ingresos»): la casilla de «¿Otra cifra?» la usa, y el que sabe hacerlo es
     cuenta.js. Lo que la pantalla MUESTRA (la cifra grande, los atajos, el
     resumen, el botón y las condiciones) va como en todo el resto del sitio,
     $1.500.000: la revisión del teléfono encontró las dos formas en la misma
     pantalla —«$1,000.000» en un atajo y «$3.000.000» en la tarjeta de abajo—
     y dos formas para la misma cifra se leen como dos cifras. */
  function cuenta() {
    if (typeof module === 'object' && module.exports) {
      try { return require('./cuenta.js'); } catch (e) { return null; }
    }
    return (typeof window !== 'undefined' && window.CuentaSocio) || null;
  }
  function motor() {
    if (typeof window !== 'undefined' && window.MotorReglas) return window.MotorReglas;
    if (typeof module === 'object' && module.exports) {
      try { return require('./motor.js'); } catch (e) { return null; }
    }
    return null;
  }
  /* La tabla de usura (app/creditos.js): de ahí sale el techo del recargo por
     atraso que dicen las condiciones. La busca primero en la página que la
     cargó (play/, PlataChat), que en el banco de pruebas no es este `window`. */
  function creditos() {
    var w = ventana();
    if (w && w.CreditosPublicables) return w.CreditosPublicables;
    if (typeof window !== 'undefined' && window.CreditosPublicables) return window.CreditosPublicables;
    if (typeof module === 'object' && module.exports) {
      try { return require('./creditos.js'); } catch (e) { return null; }
    }
    return null;
  }

  /* ==========================================================================
   * LOS LÍMITES DEL PEDIDO
   *
   * El piso es el de motor.js (MONTO_MINIMO): por debajo de 50.000 el trabajo
   * de desembolsar y cobrar se come el crédito. Va escrito y no leído porque
   * la portada del sitio (index.html) no carga el motor; una prueba compara
   * los dos números para que no se separen.
   *
   * El deslizador llega a 5.000.000 —MONTO_MAXIMO_CALCULADORA del motor, «lo
   * que el socio se puede pedir solo desde el teléfono»— y la casilla de
   * escribir llega a 20.000.000, que es lo más que Joan puede contraproponer
   * (contrapropuesta_solicitud). Pedir más que eso sería dejar una solicitud
   * que nadie puede contestar con una propuesta.
   *
   * El plazo va de 1 día a seis meses. Es una PETICIÓN, no un producto: Joan
   * contesta con lo que se pueda y la pantalla nunca dice que lo pedido está
   * concedido.
   * 8-oct-2026 (segunda vuelta) — HASTA 180 DÍAS, NO UN AÑO. Lo más largo que
   * el CRM de Joan sabe proponer es un solo pago a 60 días o cuotas a 6 meses
   * (contrapropuesta_solicitud y contrapropuesta_a_cuotas). Dejar pedir siete
   * a doce meses era ofrecer en pantalla algo que nadie puede contestar como
   * se pidió, sin decirlo. La base sigue aceptando hasta un año (no se toca
   * una función ya escrita): la reja que el cliente ve es esta.
   * ======================================================================== */
  var MONTO_MIN = 50000;
  var MONTO_MAX_DESLIZADOR = 5000000;
  var MONTO_MAX = 20000000;
  var DIAS_MIN = 1;
  var DIAS_MAX = 180;
  var LLAVE = 'tg_pedido_calc';
  var DIAS_GUARDADO = 7;   // un pedido de hace una semana ya no es lo que la persona quiere hoy
  var VERSION_CONDICIONES = '2026-10-08';

  /* Los montos del deslizador NO son un rango parejo, y es por el pulgar: de
     50.000 a 5.000.000 en pasos de 50.000 son cien posiciones, y la gente que
     pide 150.000 tendría que acertarle a un milímetro. Con pasos que crecen
     con la cifra, lo pequeño —que es lo que más se pide— ocupa la mitad de la
     barra. */
  var TRAMOS = [
    { hasta: 300000, paso: 10000 },
    { hasta: 1000000, paso: 25000 },
    { hasta: 2000000, paso: 50000 },
    { hasta: MONTO_MAX_DESLIZADOR, paso: 100000 }
  ];
  var MONTOS = (function () {
    var l = [MONTO_MIN], m = MONTO_MIN;
    TRAMOS.forEach(function (t) {
      while (m + t.paso <= t.hasta) { m += t.paso; l.push(m); }
    });
    return l;
  })();

  /* Los atajos: lo que la gente pide más, a un toque. */
  var ATAJOS_MONTO = [100000, 300000, 500000, 1000000];
  var ATAJOS_DIAS = [
    { dias: 8, texto: '8 días' }, { dias: 15, texto: '15 días' },
    { dias: 30, texto: '1 mes' }, { dias: 60, texto: '2 meses' },
    { dias: 90, texto: '3 meses' }, { dias: 180, texto: '6 meses' }
  ];

  /* ==========================================================================
   * LOS PESOS Y LAS FECHAS
   * ======================================================================== */
  function entero(v) { var n = Math.round(Number(v)); return isFinite(n) ? n : 0; }

  /** Lo que se MUESTRA: $1.500.000, como en todo el sitio. A mano y no con
   *  toLocaleString: un navegador viejo sin los datos del español escribe
   *  «1500000» o «1,500,000», y una cifra de plata no puede depender de eso. */
  function pesos(n) {
    var d = String(Math.max(0, entero(n)));
    return '$' + d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function soloPesos(n) { return pesos(n).slice(1); }
  /** Lo que se TECLEA: como lo pidió Joan (1,500.000), con la regla de cuenta.js. */
  function pesosEscritos(n) {
    var c = cuenta(), v = Math.max(0, entero(n));
    if (c && c.pesosConSeparadores) return c.pesosConSeparadores(String(v)) || '0';
    return soloPesos(v);
  }
  /**
   * La cifra que la persona escribió o pegó. `tipo` es el inputType del evento:
   * si PEGÓ (o el teclado la reemplazó entera), unos centavos al final
   * («$1.500.000,00») se quitan antes de juntar los dígitos —si no, la cifra
   * sale cien veces más grande: 150,000.000—. Mientras TECLEA no se quitan:
   * borrar el último cero de «1,500.000» deja «1,500.00», que no son centavos
   * sino 150.000 a medio escribir.
   */
  function leerPesos(texto, tipo) {
    var t = String(texto == null ? '' : texto);
    if (esPegado(tipo)) t = t.replace(/[.,]\d{1,2}\s*$/, '');
    var d = t.replace(/\D/g, '').slice(0, 9);
    return d ? Number(d) : 0;
  }
  function esPegado(tipo) {
    return /^insertFromPaste|^insertFromDrop|^insertReplacementText|^insertFromYank/.test(String(tipo || ''));
  }

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function isoDe(f) { return f.getFullYear() + '-' + dos(f.getMonth() + 1) + '-' + dos(f.getDate()); }
  function fechaDeISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    var f = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(f.getTime()) ? null : f;
  }
  /* El día de HOY del teléfono, no el de un servidor: es el que la persona
     tiene en la cabeza cuando dice «en ocho días». */
  function hoyISO() { return isoDe(new Date()); }
  function fechaEn(dias, hoy) {
    var f = fechaDeISO(hoy || hoyISO());
    if (!f) return '';
    f.setDate(f.getDate() + entero(dias));
    return isoDe(f);
  }
  function diasHasta(fechaISO, hoy) {
    var a = fechaDeISO(hoy || hoyISO()), b = fechaDeISO(fechaISO);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }

  var DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];
  /** «viernes 14 de noviembre de 2026». Con el día de la semana porque es lo
   *  que la gente cruza con el día en que le pagan. */
  function fechaLarga(iso) {
    var f = fechaDeISO(iso);
    if (!f) return String(iso || '');
    return DIAS_SEMANA[f.getDay()] + ' ' + f.getDate() + ' de ' + MESES[f.getMonth()] + ' de ' + f.getFullYear();
  }
  /** «en 8 días», «en 1 mes (31 días)», «mañana». */
  function plazoEnPalabras(dias) {
    var d = entero(dias);
    if (d <= 0) return 'hoy';
    if (d === 1) return 'mañana';
    if (d < 30) return 'en ' + d + ' días';
    var meses = Math.round(d / 30);
    if (Math.abs(d - meses * 30) <= 2) {
      return 'en ' + meses + (meses === 1 ? ' mes' : ' meses') + ' (' + d + ' días)';
    }
    return 'en ' + d + ' días';
  }

  /* ==========================================================================
   * EL PEDIDO
   * ======================================================================== */
  function normalizar(estado) {
    var e = estado || {};
    var monto = entero(e.monto);
    if (!(monto >= MONTO_MIN)) monto = monto > 0 ? MONTO_MIN : 300000;
    if (monto > MONTO_MAX) monto = MONTO_MAX;
    var dias = entero(e.dias);
    if (!(dias >= DIAS_MIN)) dias = 30;
    if (dias > DIAS_MAX) dias = DIAS_MAX;
    return { monto: monto, dias: dias };
  }
  /** La posición del deslizador más cercana a un monto. Un monto escrito que
   *  se sale de la barra (más de 5 millones, o 137.500) deja el deslizador en
   *  el punto más cercano: la cifra que manda es la escrita. */
  function indiceDeMonto(monto) {
    var m = entero(monto), mejor = 0;
    for (var i = 0; i < MONTOS.length; i++) {
      if (Math.abs(MONTOS[i] - m) < Math.abs(MONTOS[mejor] - m)) mejor = i;
    }
    return mejor;
  }
  function montoDeIndice(i) {
    var k = Math.max(0, Math.min(MONTOS.length - 1, entero(i)));
    return MONTOS[k];
  }

  /** «Pides $1,500.000 para pagar el sábado 14 de noviembre de 2026, en 37 días.»
   *  Con coma y no entre paréntesis: el plazo ya puede traer los suyos
   *  («en 1 mes (30 días)»), y dos paréntesis anidados no se leen. */
  function resumen(estado, hoy) {
    var e = normalizar(estado);
    var f = fechaEn(e.dias, hoy);
    return 'Pides ' + pesos(e.monto) + ' para pagar el ' + fechaLarga(f) + ', ' + plazoEnPalabras(e.dias) + '.';
  }

  /** Lo que se le manda a la base (solicitar_a_la_medida). La fecha viaja
   *  ENTERA, no los días: «en 8 días» leído mañana sería otra fecha, y lo que
   *  la persona escogió fue un día del calendario. */
  function pedidoParaEnviar(estado, hoy, nota) {
    var e = normalizar(estado);
    return {
      p_capital: e.monto,
      p_fecha_pago: fechaEn(e.dias, hoy),
      p_nota: String(nota == null ? '' : nota).replace(/\s+/g, ' ').trim().slice(0, 300) || null
    };
  }

  /* LO QUE SE ESCOGIÓ ANTES DE TENER CUENTA. La portada del sitio y la de play/
     son el mismo dominio, así que el pedido que alguien arma antes de
     registrarse lo encuentra el paso de pedir al terminar el registro. Es una
     comodidad y nada más: se guarda solo monto y días, nunca nada de la
     persona, y si no se puede leer se arranca de cero.
     8-oct-2026 (segunda vuelta) — SE GUARDA LA FECHA, NO LOS DÍAS. Guardaba
     «30 días» y lo leía días después como otros 30: quien escogió pagar el
     viernes 7 de noviembre en la portada terminaba el registro dos días
     después y la calculadora le proponía el domingo 9. Lo que se escogió fue
     un día del calendario (lo mismo que dice pedidoParaEnviar). Si esa fecha
     ya pasó, se arranca en el plazo de siempre. */
  function guardar(estado, ahoraMs, hoy) {
    var e = normalizar(estado);
    try {
      almacen().setItem(LLAVE, JSON.stringify({ monto: e.monto, fecha: fechaEn(e.dias, hoy),
                                                 dias: e.dias, t: ahoraMs || Date.now() }));
      return true;
    } catch (x) { return false; }
  }
  function leerGuardado(ahoraMs, hoy) {
    try {
      var g = JSON.parse(almacen().getItem(LLAVE) || 'null');
      if (!g || !(Number(g.monto) > 0)) return null;
      var edad = (ahoraMs || Date.now()) - Number(g.t || 0);
      if (!(edad >= 0) || edad > DIAS_GUARDADO * 86400000) return null;
      var dias = g.fecha ? diasHasta(g.fecha, hoy) : Number(g.dias);
      return normalizar({ monto: g.monto, dias: dias });
    } catch (x) { return null; }
  }
  function olvidarGuardado() { try { almacen().removeItem(LLAVE); } catch (x) {} }

  /* ==========================================================================
   * LA CALCULADORA EN PANTALLA
   *
   * Una sola por página, y por eso su estado vive aquí (ESTADO) y sus
   * manejadores son funciones de este módulo: la portada del sitio no tiene
   * por qué saber cómo se mueve un deslizador.
   *
   * NADA SE REPINTA BAJO EL DEDO: los controles se pintan una vez y lo que
   * cambia son textos sueltos por id. Este proyecto ya borró dos veces un campo
   * a mitad de escribir por repintar el contenedor que lo tenía adentro.
   * ======================================================================== */
  var ESTADO = normalizar({ monto: 300000, dias: 30 });
  var OPCIONES = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  /* LA PÁGINA QUE LO USA. En el navegador es `window` y no hace falta decir
     nada; la página lo dice igual (conectar(window)) porque en el banco de
     pruebas este archivo se carga desde Node y su `window` no es el de la
     página: sin esto, lo que guarda y lo que repinta se iría a otra parte y
     las pruebas no verían lo que ve el cliente. */
  var PAGINA = null;
  function conectar(w) { PAGINA = w || null; }
  function ventana() { return PAGINA || (typeof window !== 'undefined' ? window : null); }
  function almacen() {
    var w = ventana();
    try { if (w && w.localStorage) return w.localStorage; } catch (e) {}
    return (typeof localStorage !== 'undefined') ? localStorage : null;
  }
  function porId(id) {
    try {
      var w = ventana();
      var d = (w && w.document) || (typeof document !== 'undefined' ? document : null);
      return (d && d.getElementById) ? d.getElementById(id) : null;
    } catch (e) { return null; }
  }

  /* LA HOJA DE ESTILO VA CON LA CALCULADORA porque la usan tres páginas con
     tres hojas distintas, y las tres la ponen sobre laca. Colores con nombre de
     la casa: el amarillo es la cifra que la persona mueve —igual que en las
     calculadoras de siempre— y el rojo es el gesto de avanzar. */
  var CSS =
    '.cs{--cs-oro:#F5C542;--cs-luz:#FBF7F4;--cs-tenue:rgba(251,247,244,.68);--cs-linea:rgba(251,247,244,.18);' +
      'color:var(--cs-luz);font-family:inherit}' +
    '.cs .cs-etq{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--cs-oro)}' +
    '.cs .cs-preg{font-size:15px;font-weight:700;margin:18px 0 6px}' +
    '.cs .cs-cifra{font-size:42px;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:var(--cs-oro);' +
      'font-variant-numeric:tabular-nums;margin:4px 0 2px;overflow-wrap:anywhere}' +
    '.cs .cs-fila{display:flex;align-items:center;gap:10px}' +
    '.cs .cs-fila input[type=range]{flex:1 1 auto}' +
    '.cs .cs-mas{flex:none;width:48px;height:48px;border-radius:50%;border:1px solid var(--cs-linea);' +
      'background:rgba(251,247,244,.06);color:var(--cs-luz);font-size:24px;font-weight:700;line-height:1;cursor:pointer;font-family:inherit}' +
    '.cs .cs-mas:focus-visible,.cs .cs-chip:focus-visible{outline:2px solid var(--cs-oro);outline-offset:2px}' +
    '.cs input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:44px;background:transparent;margin:0}' +
    '.cs input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:8px;background:var(--cs-linea)}' +
    '.cs input[type=range]::-moz-range-track{height:8px;border-radius:8px;background:var(--cs-linea)}' +
    '.cs input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:34px;height:34px;' +
      'border-radius:50%;background:var(--cs-oro);border:3px solid #0C0A0B;margin-top:-13px;cursor:pointer;' +
      'box-shadow:0 0 16px rgba(245,197,66,.55)}' +
    '.cs input[type=range]::-moz-range-thumb{width:30px;height:30px;border-radius:50%;background:var(--cs-oro);' +
      'border:3px solid #0C0A0B;cursor:pointer}' +
    '.cs .cs-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '.cs .cs-chip{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--cs-linea);' +
      'background:rgba(251,247,244,.06);color:var(--cs-luz);font:inherit;font-size:14px;font-weight:600;cursor:pointer}' +
    '.cs .cs-chip.sel{border-color:var(--cs-oro);background:rgba(245,197,66,.16);color:var(--cs-oro)}' +
    '.cs .cs-libre{display:block;width:100%;margin-top:10px;min-height:48px;padding:10px 14px;border-radius:12px;' +
      'border:1px solid #D8D2CC;background:#FFFFFF;color:#0C0A0B;font:inherit;font-size:17px;box-sizing:border-box}' +
    '.cs .cs-libre-etq{display:block;font-size:13px;color:var(--cs-tenue);margin-top:12px}' +
    '.cs .cs-cuando{font-size:20px;font-weight:700;line-height:1.3;margin-top:4px}' +
    '.cs .cs-cuando small{display:block;font-size:14px;font-weight:500;color:var(--cs-tenue)}' +
    '.cs .cs-resumen{margin-top:18px;padding:14px 16px;border-radius:14px;border:1px solid rgba(245,197,66,.45);' +
      'background:rgba(245,197,66,.08);font-size:16px;line-height:1.45}' +
    '.cs .cs-costo{margin-top:10px;font-size:14px;color:var(--cs-tenue);line-height:1.5}' +
    '.cs .cs-boton{display:block;width:100%;margin-top:16px;min-height:52px;border:0;border-radius:14px;' +
      'background:#D81F26;color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer}' +
    '.cs .cs-boton:disabled{opacity:.5;cursor:not-allowed}' +
    '.cs .cs-error{margin-top:10px;font-size:14px;color:#FFD9A8}' +
    '.cs .cs-error:empty{display:none}' +
    '@media (prefers-reduced-motion:reduce){.cs *{transition:none!important;animation:none!important}}';

  /**
   * La calculadora entera.
   * @param estado   {monto, dias} — se normaliza.
   * @param opciones {titulo, boton, accion, conNota, hoy}
   *        boton: texto del botón ('' = sin botón); accion: el JavaScript que
   *        corre al tocarlo (lo pone la página: la portada guarda y abre el
   *        registro, la cuenta manda la solicitud).
   */
  function html(estado, opciones) {
    ESTADO = normalizar(estado || ESTADO);
    OPCIONES = opciones || {};
    var o = OPCIONES, e = ESTADO, hoy = o.hoy || hoyISO();
    var chipsMonto = ATAJOS_MONTO.map(function (m) {
      return '<button type="button" class="cs-chip' + (m === e.monto ? ' sel' : '') + '" data-monto="' + m + '" ' +
        'onclick="CalculadoraSolicitud.elegirMonto(' + m + ')">' + esc(pesos(m)) + '</button>';
    }).join('');
    var chipsDias = ATAJOS_DIAS.map(function (a) {
      return '<button type="button" class="cs-chip' + (a.dias === e.dias ? ' sel' : '') + '" data-dias="' + a.dias + '" ' +
        'onclick="CalculadoraSolicitud.elegirDias(' + a.dias + ')">' + esc(a.texto) + '</button>';
    }).join('');
    var f = fechaEn(e.dias, hoy);
    return '<style>' + CSS + '</style>' +
      '<div class="cs" id="csCaja">' +
        (o.titulo ? '<div class="cs-etq">' + esc(o.titulo) + '</div>' : '') +

        '<div class="cs-preg" id="csPregMonto">¿Cuánto necesitas?</div>' +
        '<div class="cs-cifra" id="csMontoTxt" aria-live="polite">' + esc(pesos(e.monto)) + '</div>' +
        '<div class="cs-fila">' +
          '<button type="button" class="cs-mas" aria-label="Menos" onclick="CalculadoraSolicitud.pasoMonto(-1)">−</button>' +
          '<input type="range" id="csMonto" min="0" max="' + (MONTOS.length - 1) + '" step="1" ' +
            'value="' + indiceDeMonto(e.monto) + '" aria-labelledby="csPregMonto" ' +
            'aria-valuetext="' + esc(pesos(e.monto)) + '" oninput="CalculadoraSolicitud.moverMonto(this.value)">' +
          '<button type="button" class="cs-mas" aria-label="Más" onclick="CalculadoraSolicitud.pasoMonto(1)">+</button>' +
        '</div>' +
        '<div class="cs-chips" id="csChipsMonto">' + chipsMonto + '</div>' +
        '<label class="cs-libre-etq" for="csMontoLibre">¿Otra cifra? Escríbela</label>' +
        '<input class="cs-libre" id="csMontoLibre" type="text" inputmode="numeric" autocomplete="off" ' +
          'placeholder="Por ejemplo 1,250.000" oninput="CalculadoraSolicitud.escribirMonto(this, event)" ' +
          'onchange="CalculadoraSolicitud.terminarMonto(this)">' +

        '<div class="cs-preg" id="csPregDias">¿Para cuándo lo pagas?</div>' +
        '<div class="cs-cuando" id="csCuando">' + esc(fechaLarga(f)) + '<small>' + esc(plazoEnPalabras(e.dias)) + '</small></div>' +
        '<input type="range" id="csDias" min="' + DIAS_MIN + '" max="' + DIAS_MAX + '" step="1" value="' + e.dias + '" ' +
          'aria-labelledby="csPregDias" aria-valuetext="' + esc(plazoEnPalabras(e.dias)) + '" ' +
          'oninput="CalculadoraSolicitud.moverDias(this.value)">' +
        '<div class="cs-chips" id="csChipsDias">' + chipsDias + '</div>' +
        '<label class="cs-libre-etq" for="csFecha">¿Un día exacto? Escógelo</label>' +
        '<input class="cs-libre" id="csFecha" type="date" min="' + fechaEn(DIAS_MIN, hoy) + '" max="' + fechaEn(DIAS_MAX, hoy) + '" ' +
          'value="' + f + '" onchange="CalculadoraSolicitud.escribirFecha(this)">' +

        (o.conNota
          ? '<label class="cs-libre-etq" for="csNota">¿Para qué lo necesitas? (opcional)</label>' +
            '<input class="cs-libre" id="csNota" type="text" maxlength="300" ' +
              'placeholder="Surtir el negocio, una deuda, una emergencia…">'
          : '') +

        '<div class="cs-resumen" id="csResumen" aria-live="polite">' + esc(resumen(e, hoy)) + '</div>' +
        /* LA FRASE QUE SOSTIENE TODO LO DE ARRIBA. Sin precio en pantalla,
           callarse por qué sería esconderlo; dicho así es la verdad: el costo
           existe, depende de cada caso, y se ve antes de aceptar. */
        '<div class="cs-costo">El costo exacto te lo mandamos en la propuesta, antes de que aceptes nada. ' +
          'Pedir no te compromete: si la propuesta no te sirve, no la aceptas.</div>' +
        (o.boton
          ? '<button type="button" class="cs-boton" id="csBoton" onclick="' + esc(o.accion || '') + '">' +
              esc(textoBoton(o.boton, e)) + '</button>'
          : '') +
        '<div class="cs-error" id="csError" role="status"></div>' +
      '</div>';
  }

  /* El botón puede llevar la cifra: «Pedir $300.000». {monto} se reemplaza. */
  function textoBoton(plantilla, e) {
    return String(plantilla || '').replace('{monto}', pesos(normalizar(e).monto));
  }

  /* Repinta los TEXTOS, nunca los controles. */
  function refrescar(salvo) {
    var e = ESTADO, hoy = OPCIONES.hoy || hoyISO(), f = fechaEn(e.dias, hoy);
    var t = porId('csMontoTxt'); if (t) t.textContent = pesos(e.monto);
    var r = porId('csMonto');
    if (r && salvo !== 'deslizador') {
      r.value = indiceDeMonto(e.monto);
    }
    if (r && r.setAttribute) r.setAttribute('aria-valuetext', pesos(e.monto));
    var c = porId('csCuando');
    if (c) c.innerHTML = esc(fechaLarga(f)) + '<small>' + esc(plazoEnPalabras(e.dias)) + '</small>';
    var d = porId('csDias');
    if (d && salvo !== 'dias') d.value = e.dias;
    if (d && d.setAttribute) d.setAttribute('aria-valuetext', plazoEnPalabras(e.dias));
    var fe = porId('csFecha'); if (fe && salvo !== 'fecha') fe.value = f;
    var s = porId('csResumen'); if (s) s.textContent = resumen(e, hoy);
    var b = porId('csBoton'); if (b && OPCIONES.boton) b.textContent = textoBoton(OPCIONES.boton, e);
    marcarChips('csChipsMonto', 'data-monto', e.monto);
    marcarChips('csChipsDias', 'data-dias', e.dias);
    var err = porId('csError'); if (err) err.textContent = '';
    if (typeof OPCIONES.alCambiar === 'function') { try { OPCIONES.alCambiar(e); } catch (x) {} }
  }
  function marcarChips(id, attr, valor) {
    var caja = porId(id);
    if (!caja || !caja.querySelectorAll) return;
    var l = caja.querySelectorAll('.cs-chip');
    for (var i = 0; i < l.length; i++) {
      var v = Number(l[i].getAttribute && l[i].getAttribute(attr));
      if (l[i].classList) l[i].classList.toggle('sel', v === valor);
    }
  }

  function moverMonto(indice) {
    ESTADO = normalizar({ monto: montoDeIndice(indice), dias: ESTADO.dias });
    var libre = porId('csMontoLibre'); if (libre) libre.value = '';
    MONTO_ANTES_DE_ESCRIBIR = null;
    refrescar('deslizador');
  }
  function pasoMonto(signo) {
    var i = indiceDeMonto(ESTADO.monto);
    /* Si la cifra escrita no es una del deslizador, el primer toque la lleva a
       la vecina en esa dirección, no salta una. */
    var actual = MONTOS[i];
    if (signo > 0 && actual <= ESTADO.monto) i++;
    else if (signo < 0 && actual >= ESTADO.monto) i--;
    ESTADO = normalizar({ monto: montoDeIndice(i), dias: ESTADO.dias });
    var libre = porId('csMontoLibre'); if (libre) libre.value = '';
    MONTO_ANTES_DE_ESCRIBIR = null;
    refrescar();
  }
  function elegirMonto(m) {
    ESTADO = normalizar({ monto: m, dias: ESTADO.dias });
    var libre = porId('csMontoLibre'); if (libre) libre.value = '';
    MONTO_ANTES_DE_ESCRIBIR = null;
    refrescar();
  }
  /* LA CIFRA ESCRITA, con los separadores de Joan mientras teclea.
     8-oct-2026 (segunda vuelta), lo que encontró la revisión en un teléfono:
       · quien teclea 1 → 15 → 1.500 camino a 150.000 veía «$50.000» y el
         aviso del mínimo en CADA tecla: la cifra que manda saltaba al piso
         debajo del dedo. Ahora, POR DEBAJO DEL MÍNIMO NO SE MUEVE NADA mientras
         escribe; el aviso sale al terminar (terminarMonto), si se quedó ahí;
       · al borrar la casilla quedaban «$50.000» y el aviso viejo, y «Pedir»
         mandaba 50.000: ahora vuelve la cifra que había antes de escribir;
       · el cursor saltaba al final (escribir un 2 en medio de 150.000 daba
         1,250.000 con el cursor al fondo): se cuenta cuántos dígitos había
         antes del cursor y se lo deja detrás de ese mismo dígito, como en la
         pregunta de ingresos (play/, anotarPesos);
       · pegar «$1.500.000,00» daba 150 millones (ver leerPesos). */
  var MONTO_ANTES_DE_ESCRIBIR = null;
  function escribirMonto(el, ev) {
    if (!el) return;
    var antes = String(el.value || '');
    var cursor = typeof el.selectionStart === 'number' ? el.selectionStart : antes.length;
    var digitosAntes = antes.slice(0, cursor).replace(/\D/g, '').length;
    var tipo = ev && ev.inputType;
    var n = leerPesos(antes, tipo);
    var hayDigitos = /\d/.test(antes);
    if (MONTO_ANTES_DE_ESCRIBIR === null) MONTO_ANTES_DE_ESCRIBIR = ESTADO.monto;
    var bonito = hayDigitos ? pesosEscritos(n) : '';
    if (bonito !== antes) {
      el.value = bonito;
      /* Pegado, el cursor va al final: lo de antes del cursor ya no existe. */
      var pos = esPegado(tipo) ? bonito.length : 0, vistos = 0;
      if (!esPegado(tipo)) {
        while (pos < bonito.length && vistos < digitosAntes) {
          if (/\d/.test(bonito.charAt(pos))) vistos++;
          pos++;
        }
      }
      try {
        var d = (ventana() && ventana().document) || null;
        if (el.setSelectionRange && (!d || d.activeElement === el)) el.setSelectionRange(pos, pos);
      } catch (x) {}
    }
    var err = porId('csError');
    if (!hayDigitos) {
      /* Borró la casilla: vuelve lo de antes, sin avisos viejos. */
      ESTADO = normalizar({ monto: MONTO_ANTES_DE_ESCRIBIR, dias: ESTADO.dias });
      MONTO_ANTES_DE_ESCRIBIR = null;
      refrescar();
      return;
    }
    if (n < MONTO_MIN) {
      /* A medio escribir: ni se toca la cifra que manda ni se regaña. */
      if (err) err.textContent = '';
      return;
    }
    ESTADO = normalizar({ monto: n, dias: ESTADO.dias });
    refrescar();
    if (err && n > MONTO_MAX) {
      err.textContent = 'Por aquí llegamos hasta ' + pesos(MONTO_MAX) + '. Si necesitas más, lo hablamos por el chat.';
    }
  }
  /* Al salir de la casilla. Si se quedó por debajo del mínimo, ahora sí se
     dice, y la cifra que manda pasa al mínimo —con la casilla diciendo lo
     mismo— para que el botón no pida una cifra y la casilla muestre otra. */
  function terminarMonto(el) {
    if (!el) return;
    var n = leerPesos(el.value);
    MONTO_ANTES_DE_ESCRIBIR = null;
    if (!n || n >= MONTO_MIN) return;
    ESTADO = normalizar({ monto: MONTO_MIN, dias: ESTADO.dias });
    el.value = pesosEscritos(MONTO_MIN);
    refrescar();
    var err = porId('csError');
    if (err) err.textContent = 'Lo mínimo que estudiamos es ' + pesos(MONTO_MIN) + '. Lo dejamos ahí; súbelo si quieres.';
  }
  function moverDias(v) {
    ESTADO = normalizar({ monto: ESTADO.monto, dias: v });
    refrescar('dias');
  }
  function elegirDias(d) {
    ESTADO = normalizar({ monto: ESTADO.monto, dias: d });
    refrescar();
  }
  function escribirFecha(el) {
    if (!el) return;
    var d = diasHasta(el.value, OPCIONES.hoy || hoyISO());
    if (d === null) return;
    ESTADO = normalizar({ monto: ESTADO.monto, dias: d });
    refrescar('fecha');
    var err = porId('csError');
    if (err && (d < DIAS_MIN || d > DIAS_MAX)) {
      err.textContent = 'Escoge un día entre mañana y dentro de seis meses.';
    }
  }
  function estado() { return { monto: ESTADO.monto, dias: ESTADO.dias }; }
  function poner(e) { ESTADO = normalizar(e); refrescar(); }
  function nota() { var n = porId('csNota'); return n ? String(n.value || '') : ''; }
  function error(texto) { var err = porId('csError'); if (err) err.textContent = String(texto || ''); }

  /* ==========================================================================
   * LAS CONDICIONES DE ESTE CRÉDITO
   *
   * Lo que Joan propuso, dicho entero y en pesos. Sale de la propuesta tal como
   * la guardó la base (contrapropuesta_de, contrapropuesta_a_cuotas o la de
   * PlataChat): aquí no se recalcula ninguna cifra que la base ya dijo, porque
   * lo que el cliente acepta es lo que la base le va a cobrar.
   *
   * La única cuenta propia es la garantía que deja, y no es propia: la hace el
   * motor (acumularGarantia / acumularGarantiaRespaldada), el mismo que la
   * suma el día que paga. PlataChat la manda hecha porque descuenta los gastos
   * del pago.
   *
   * SI TE ATRASAS, CON SU CIFRA EN PESOS — 8-oct-2026 (segunda vuelta).
   * La primera versión no ponía cifra («como explican los términos») y los
   * términos decían «está en las condiciones de tu crédito»: cada texto
   * señalaba al otro y el cliente aceptaba un recargo que no veía en ninguna
   * parte. Y la cifra del motor (TASA_MORA_DIARIA, 1% diario) no se puede
   * escribir: medida contra el techo de usura no cabe, y publicarla en una
   * oferta aceptada sería el artículo 305 con la prueba firmada.
   *
   * Lo que se escribe es el TECHO LEGAL de ese crédito: la tasa de mora más
   * alta que permite la ley (la de usura del mes, app/creditos.js), pasada a
   * pesos por día sobre lo que recibe. Y se CUMPLE: el CRM, al desembolsar lo
   * aceptado, le pone al crédito ese techo (topeMoraEA) y app/puente.js cobra
   * el recargo con el menor entre el 1% del motor, el techo del día de la
   * aceptación y el del día en que se cobra (tasaMoraDe). Si Joan decide
   * cobrar menos, se baja ahí; más, no se puede.
   *
   * En PESOS y sin porcentaje, como todo lo que lee el cliente; la tasa queda
   * en lo que viaja con la aceptación (tope_mora) para que el CRM la compare.
   * Y —palabra de Joan— se puede negociar, «estamos para dar soluciones». No
   * se promete ningún descuento en particular.
   * ======================================================================== */
  /** El techo del recargo por atraso de un crédito, o null si no hay tabla de
   *  usura a mano. `base` es sobre lo que corre: el capital (un solo pago) o
   *  la cuota (a cuotas, lo que hace liquidarCuotaRespaldada). Hacia ABAJO:
   *  la cifra que se publica nunca puede quedar por encima del techo. */
  function topeDeMora(base, hoy) {
    var C = creditos(), ref = null;
    try { ref = C && C.topeDeReferencia ? C.topeDeReferencia(hoy || hoyISO()) : null; } catch (e) { ref = null; }
    if (!ref || !(Number(ref.tope) > 0)) return null;
    var ea = Number(ref.tope);
    /* La tasa diaria, con cinco decimales y hacia abajo: es la MISMA cuenta de
       app/puente.js (tasaMoraDe), así lo que se publica y lo que se cobra no
       se separan. Y los pesos por día hacia ARRIBA: «hasta $X» tiene que ser
       verdad también el día que el redondeo del cobro sume un peso. */
    var diaria = Math.floor((Math.pow(1 + ea, 1 / 365) - 1) * 1e5) / 1e5;
    return { ea: ea, diaria: diaria, por_dia: Math.ceil(Math.max(0, entero(base)) * diaria - 1e-6), base: entero(base) };
  }
  function condiciones(sol, opciones) {
    var o = opciones || {};
    var cp = (sol && sol.contrapropuesta && typeof sol.contrapropuesta === 'object') ? sol.contrapropuesta : null;
    if (!cp) return null;
    var hoy = o.hoy || hoyISO();
    var capital = entero(cp.capital != null ? cp.capital : sol.capital);
    var costo = entero(cp.costo != null ? cp.costo : sol.costo);
    var total = entero(cp.total != null ? cp.total : capital + costo);
    var cuotas = Array.isArray(cp.cuotas) && cp.cuotas.length > 1 ? cp.cuotas : null;
    var fecha = String(cp.fecha_pago || (sol && sol.fecha_corte) || '').slice(0, 10);
    var lineas = [];
    var agregar = function (clave, k, v) { lineas.push({ clave: clave, k: k, v: v }); };

    agregar('recibes', 'Recibes', pesos(capital));
    if (cuotas) {
      agregar('pagas', 'Pagas', cuotas.length + ' cuotas, en estas fechas:');
      cuotas.forEach(function (q, i) {
        var t = q && q.total != null ? q.total : entero(q && q.capital) + entero(q && q.costo);
        agregar('cuota' + (i + 1), 'Cuota ' + (i + 1), pesos(t) + ' el ' + fechaLarga(q && q.fecha));
      });
    } else {
      var d = diasHasta(fecha, hoy);
      /* `detallePago` (8-oct-2026, segunda vuelta): lo que la página sabe del
         pago y este módulo no —en PlataChat, «dos quincenas» de una propuesta a
         dos cortes—. Antes iba en una fila suelta encima del bloque, que
         repetía todo lo demás. */
      agregar('pagas', 'Pagas', 'Un solo pago de ' + pesos(total) + ' el ' + fechaLarga(fecha) +
        (d !== null && d >= 0 ? ', ' + plazoEnPalabras(d) : '') +
        (o.detallePago ? ', ' + String(o.detallePago) : ''));
    }
    agregar('total', 'Total a pagar', pesos(total));
    agregar('costo', 'Lo que cuesta', pesos(costo) + ', ya sumado en el total. No hay cuotas de manejo, ' +
      'seguros, estudio de crédito ni otros cargos.');

    var gana = garantiaQueDeja(costo, !!cuotas, o);
    if (gana !== null) {
      agregar('garantia', 'La garantía que te deja', cuotas
        ? 'Si pagas cada cuota en su fecha, te suma ' + pesos(gana) + ' de garantía.'
        : 'Al pagarlo te suma ' + pesos(gana) + ' de garantía, en la fecha o después. La garantía no es plata ' +
          'que te devolvamos: es tu historial, y es lo que te deja pedir más.');
    }
    var baseMora = cuotas ? entero(cuotas[0] && (cuotas[0].total != null ? cuotas[0].total
                                   : entero(cuotas[0].capital) + entero(cuotas[0].costo))) : capital;
    var tope = topeDeMora(baseMora, hoy);
    agregar('atraso', 'Si te atrasas', (tope
      ? (cuotas
        ? 'Por cada día que una cuota pase de su fecha se suma un recargo de hasta ' + pesos(tope.por_dia) +
          ' (sobre una cuota de ' + pesos(tope.base) + ').'
        : 'Por cada día de atraso se suma un recargo de hasta ' + pesos(tope.por_dia) + ' sobre los ' +
          pesos(tope.base) + '; si abonas, baja con lo que quede.') +
        ' Es lo más que permite la ley por mora, y si la ley baja ese tope, el recargo baja con él.'
      : 'Por cada día de atraso se suma un recargo sobre lo que debas, nunca por encima de lo que permite la ley por mora.') +
      ' Ese recargo se puede negociar: si ves que no llegas a la fecha, escríbenos por el chat antes y buscamos ' +
      'juntos una salida —una prórroga, un plan de pagos o un acuerdo sobre el recargo—. Estamos para darte soluciones.');
    agregar('como', 'Cómo pagas', o.comoPagas ||
      'Por Nequi o transferencia, a la cuenta que te indiquemos por el chat de la app. Paga solo a cuentas ' +
      'que te demos por ese chat.');
    agregar('entrega', 'Cuándo recibes la plata', o.entrega ||
      'Aceptar no te entrega la plata: es tu visto bueno a estas condiciones. Te avisamos por el chat cuándo ' +
      'y por dónde la recibes, y ahí nace el crédito.');

    return {
      version: VERSION_CONDICIONES,
      solicitud: sol && sol.id != null ? Number(sol.id) : null,
      capital: capital, total: total, costo: costo, fecha_pago: fecha,
      /* Cuándo armó Joan ESTA propuesta: la base la compara al aceptar. Con
         solo el monto y el total, una propuesta con la misma plata y otra
         fecha se aceptaba como si fuera la que la persona leyó. */
      creada_en: String(cp.creada_en || ''),
      tope_mora: tope ? { ea: tope.ea, diaria: tope.diaria, por_dia: tope.por_dia, base: tope.base } : null,
      cuotas: cuotas ? cuotas.length : 1,
      lineas: lineas,
      texto: textoPlano(lineas)
    };
  }
  function garantiaQueDeja(costo, aCuotas, o) {
    if (o && o.garantia !== undefined) {
      var g = Number(o.garantia);
      return (o.garantia === null || !isFinite(g) || g < 0) ? null : Math.round(g);
    }
    var M = motor();
    try {
      if (aCuotas && M && M.acumularGarantiaRespaldada) return M.acumularGarantiaRespaldada(costo, true);
      if (!aCuotas && M && M.acumularGarantia) return M.acumularGarantia(costo, true);
    } catch (e) { return null; }
    return null;
  }
  function textoPlano(lineas) {
    return 'Las condiciones de este crédito\n' + lineas.map(function (l) { return '- ' + l.k + ': ' + l.v; }).join('\n');
  }

  var CSS_CONDICIONES =
    '.cond{margin-top:12px;border:1px solid rgba(128,118,112,.35);border-radius:14px;padding:12px 14px}' +
    '.cond .cond-tit{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}' +
    '.cond dl{margin:0}' +
    '.cond .cond-fila{display:grid;grid-template-columns:minmax(0,9.5em) minmax(0,1fr);gap:4px 12px;' +
      'padding:8px 0;border-top:1px solid rgba(128,118,112,.22)}' +
    '.cond .cond-fila:first-child{border-top:0}' +
    '.cond dt{font-size:13.5px;opacity:.75}' +
    '.cond dd{margin:0;font-size:14.5px;font-weight:600;line-height:1.45;overflow-wrap:anywhere}' +
    /* En el teléfono, el rótulo encima del valor: a dos columnas, «Lo que
       cuesta» dejaba la frase entera en una tira de tres palabras por renglón. */
    '@media (max-width:520px){.cond .cond-fila{grid-template-columns:1fr;gap:2px}}' +
    '.cond-acepto{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:15px;font-weight:600;cursor:pointer}' +
    '.cond-acepto input{width:24px;height:24px;flex:none;margin:1px 0 0}';

  function condicionesHTML(cond) {
    if (!cond) return '';
    return '<style>' + CSS_CONDICIONES + '</style>' +
      '<div class="cond" data-version="' + esc(cond.version) + '">' +
        '<div class="cond-tit">Las condiciones de este crédito</div>' +
        '<dl>' + cond.lineas.map(function (l) {
          return '<div class="cond-fila" data-clave="' + esc(l.clave) + '"><dt>' + esc(l.k) + '</dt><dd>' + esc(l.v) + '</dd></div>';
        }).join('') + '</dl>' +
      '</div>';
  }

  var TEXTO_CASILLA = 'Leí y acepto las condiciones de este crédito';

  /** La casilla, con el id y el manejador que ponga la página. */
  function casillaHTML(id, alCambiar, marcada) {
    return '<label class="cond-acepto" for="' + esc(id) + '"><input type="checkbox" id="' + esc(id) + '"' +
      (marcada ? ' checked' : '') + ' onchange="' + esc(alCambiar || '') + '"><span>' + esc(TEXTO_CASILLA) + '</span></label>';
  }

  /** Lo que viaja con la aceptación (aceptar_condiciones, p_vio): lo que la
   *  base compara con su propuesta —el monto, el total, la fecha de pago y
   *  CUÁNDO se armó la propuesta: si algo no casa, cambió mientras la persona
   *  leía y NO se acepta— y el texto que vio, con el techo del recargo. */
  function paraAceptar(cond) {
    if (!cond) return null;
    return {
      version: cond.version, capital: cond.capital, total: cond.total, fecha_pago: cond.fecha_pago,
      creada_en: cond.creada_en || '',
      tope_mora: cond.tope_mora || null,
      lineas: cond.lineas.map(function (l) { return { clave: l.clave, k: l.k, v: l.v }; }),
      texto: cond.texto
    };
  }

  /** La llave de «ya marcó la casilla»: la solicitud y CUÁNDO se armó su
   *  propuesta. Si Joan la cambia, la marca de la anterior no vale para la
   *  nueva: nadie acepta lo que no ha leído. */
  function llaveDeCasilla(sol) {
    var cp = (sol && sol.contrapropuesta) || {};
    return String(sol && sol.id) + '|' + String(cp.creada_en || '') + '|' + String(cp.total || '');
  }

  return {
    VERSION: '2026-10-08',
    VERSION_CONDICIONES: VERSION_CONDICIONES,
    MONTO_MIN: MONTO_MIN,
    MONTO_MAX_DESLIZADOR: MONTO_MAX_DESLIZADOR,
    MONTO_MAX: MONTO_MAX,
    DIAS_MIN: DIAS_MIN,
    DIAS_MAX: DIAS_MAX,
    LLAVE: LLAVE,
    MONTOS: MONTOS,
    ATAJOS_DIAS: ATAJOS_DIAS,
    TEXTO_CASILLA: TEXTO_CASILLA,

    /* pesos y fechas */
    pesos: pesos,
    soloPesos: soloPesos,
    pesosEscritos: pesosEscritos,
    leerPesos: leerPesos,
    topeDeMora: topeDeMora,
    hoyISO: hoyISO,
    fechaEn: fechaEn,
    diasHasta: diasHasta,
    fechaLarga: fechaLarga,
    plazoEnPalabras: plazoEnPalabras,

    /* el pedido */
    normalizar: normalizar,
    indiceDeMonto: indiceDeMonto,
    montoDeIndice: montoDeIndice,
    resumen: resumen,
    pedidoParaEnviar: pedidoParaEnviar,
    guardar: guardar,
    leerGuardado: leerGuardado,
    olvidarGuardado: olvidarGuardado,

    /* la calculadora en pantalla */
    conectar: conectar,
    html: html,
    refrescar: refrescar,
    moverMonto: moverMonto,
    pasoMonto: pasoMonto,
    elegirMonto: elegirMonto,
    escribirMonto: escribirMonto,
    terminarMonto: terminarMonto,
    moverDias: moverDias,
    elegirDias: elegirDias,
    escribirFecha: escribirFecha,
    estado: estado,
    poner: poner,
    nota: nota,
    error: error,

    /* las condiciones de la propuesta */
    condiciones: condiciones,
    condicionesHTML: condicionesHTML,
    casillaHTML: casillaHTML,
    paraAceptar: paraAceptar,
    llaveDeCasilla: llaveDeCasilla
  };
});
