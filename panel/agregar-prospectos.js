/* ============================================================================
 * AGREGAR PROSPECTOS — 27 de octubre de 2026 («el gerente agrega»)
 *
 * Joan (26-oct): «quiero que william pueda agregar bases en archivo y que
 * también pueda agregar clientes de forma manual y mi rol también… y podamos
 * poner el nombre y el teléfono u otra información adicional».
 *
 * Las reglas PURAS de agregar gente: qué columnas extra de un archivo se
 * pueden guardar y cuáles no (y por qué), cómo se limpia el nombre, la nota y
 * cada valor, cómo se parte un archivo en tandas y cómo se reparte parejo.
 * Sin DOM y sin red: lo usan el CRM de Joan y la pantalla del gerente, y las
 * pruebas lo cargan con require.
 *
 * Va en un archivo NUEVO y no dentro de app/bases.js a propósito: bases.js
 * tiene su centinela (revisarBase devuelve solo nombre y celular) y está
 * publicado; tocarlo obligaría a subir su versión en cada página que lo carga.
 * Este usa BasesTuGarantia (celularDe, nombreDe y SENALES_FINANCIERAS) sin
 * copiarlo.
 *
 * LA REGLA DE LO QUE NO SE GUARDA ES LA MISMA DEL SERVIDOR (extra_limpio, en
 * base/20261027_el_gerente_agrega.sql): el CRM ni siquiera ofrece esas
 * columnas, y si alguien las manda a mano, el servidor las descarta igual.
 * Las razones: la Ley 1581 (datos de terceros, datos sensibles del art. 5) y
 * que un reporte de cobranza de otra empresa no se convierta en una base de
 * Tu Garantía con su «YA PAGO» y su «VENCIDO» pegados a cada persona.
 *
 * 27-oct-2026, ronda 3 — LO QUE VIAJA ES UNA LISTA BLANCA. Dos rondas
 * seguidas se escapó la dirección: primero con una columna «Dirección», después
 * con «DIR», «Ubicación», «Barrio» o un valor como «CL 45 SUR 12 34», porque la
 * regla adivinaba por el NOMBRE qué era peligroso, y cada base nombra sus
 * columnas a su manera. Ahora es al revés: solo se ofrecen (y el servidor solo
 * guarda) cinco datos con nombre fijo —Ciudad, Monto que pide, Ocupación o
 * negocio, Cómo llegó y Observación— y lo demás no se guarda nunca, se llame
 * como se llame. Las listas de abajo (lo que no se guarda) se quedan como
 * segundo candado y para decir POR QUÉ no se guarda una columna.
 *
 * 27-oct-2026, ronda 4 — Y QUÉ COLUMNA LLENA CADA DATO TAMPOCO SE ADIVINA. La
 * lista blanca seguía reconociendo la columna por PEDAZOS de su nombre:
 * «Ubicación del negocio» o «Lugar de trabajo» entraban como «Ocupación o
 * negocio», «Barrio / Ciudad» o «Municipio / Vereda» como «Ciudad», y «Medio
 * de pago» como «Cómo llegó». Ahora el encabezado se casa contra una lista
 * EXACTA de nombres (sin mayúsculas, tildes ni signos): una columna que se
 * llame de otra manera no se ofrece. Y lo que sí viaja son TEXTOS LIBRES que
 * vienen del archivo: las pantallas lo dicen así, porque ninguna regla puede
 * saber que «vive en la vereda El Rosal» es una dirección.
 *
 * La firma de abajo va PRIMERO: dice que llegó ESTE archivo (la página se
 * pide con ?v=…). Ver «¿LLEGÓ LO QUE PEDÍ?» en panel/crm.html.
 * ==========================================================================*/
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../app/bases.js'));
  else raiz.AgregarProspectos = fabrica(raiz.BasesTuGarantia);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';

  var TOPE_TANDA = 200;      // filas por llamada (el servidor rechaza más: tanda_grande)
  var MAX_VALOR = 120;       // caracteres por valor
  var MAX_CLAVE = 40;        // caracteres por nombre de columna
  var MAX_NOTA = 300;        // la «Información adicional» a mano

  /* 27-oct-2026, ronda 3 — LAS ÚNICAS COLUMNAS QUE SE GUARDAN Y VIAJAN AL
     EQUIPO, con su nombre fijo (`clave`: así se guardan, y extra_limpio solo
     acepta estas cinco claves EXACTAS). `admite`: las familias de abajo que
     no la tumban («Monto que pide» lleva «monto»; «Ciudad de residencia» lleva
     «residencia»): los valores igual pasan por su regla. «Barrio» no está a
     propósito: con el barrio y el nombre ya se encuentra la casa, y el equipo
     contacta por WhatsApp.
     27-oct-2026, ronda 4 — `nombres`: los encabezados EXACTOS que traen ese
     dato, escritos como los deja normalEncabezado (sin mayúsculas, tildes ni
     signos: «¿Cómo llegó?» es «como llego»). Antes era un patrón que casaba
     con pedazos, y «Ciudad / Barrio» entraba como «Ciudad» justo debajo de la
     frase que dice que el barrio no viaja. Si una base trae otro nombre que
     sí es uno de estos datos, se agrega aquí, a mano y con su prueba. */
  var COLUMNAS_QUE_VIAJAN = [
    { clave: 'Ciudad', admite: ['direccion'],
      nombres: ['ciudad', 'municipio', 'ciudad o municipio', 'municipio o ciudad', 'ciudad municipio', 'municipio ciudad',
        'ciudad de residencia', 'municipio de residencia'] },
    { clave: 'Monto que pide', admite: ['plata', 'cobranza'],
      nombres: ['monto que pide', 'monto solicitado', 'monto a solicitar', 'monto que solicita', 'monto que necesita', 'monto requerido',
        'monto deseado', 'valor solicitado', 'valor que solicita', 'valor que pide', 'valor requerido', 'cuanto pide', 'cuanto solicita',
        'cuanto necesita', 'cuanto quiere', 'cuanto dinero necesita'] },
    { clave: 'Ocupación o negocio', admite: [],
      nombres: ['ocupacion', 'ocupacion o negocio', 'oficio', 'profesion', 'profesion u oficio', 'actividad', 'actividad economica',
        'a que se dedica', 'en que trabaja', 'trabajo', 'empleo', 'negocio', 'tipo de negocio', 'nombre del negocio', 'empresa', 'que vende'] },
    { clave: 'Cómo llegó', admite: [],
      nombres: ['como llego', 'como nos conocio', 'como se entero', 'como nos encontro', 'como supo de nosotros', 'medio', 'canal',
        'fuente', 'origen', 'campana'] },
    { clave: 'Observación', admite: [],
      nombres: ['observacion', 'observaciones', 'obs', 'nota', 'notas', 'comentario', 'comentarios'] }
  ];
  var CLAVES_QUE_VIAJAN = COLUMNAS_QUE_VIAJAN.map(function (c) { return c.clave; });
  var MAX_EXTRAS = CLAVES_QUE_VIAJAN.length;
  var NO_VIAJA = 'no es de lo que viaja';

  /* Las claves que NO se guardan, por familia (sin importar mayúsculas). Las
     cortas (eps, nit, app) solo como palabra entera: «Apellido» no es «app». */
  var PALABRAS_QUE_NO_SE_GUARDAN = {
    plata: /(saldo|mora|deuda|cuota|inter[eé]s|pr[eé]stamo|monto|capital|cr[eé]dito|cupo|pago|abono|vencim)/i,
    documento: /(c[eé]dula|documento|identificaci|pasaporte|(^|[^a-záéíóúñ])nit([^a-záéíóúñ]|$))/i,
    salud: /((^|[^a-záéíóúñ])eps([^a-záéíóúñ]|$)|salud|diagn|enfermedad|discapacid|m[eé]dic)/i,
    sensible: /(religi|pol[ií]tic|partido|sindica|etni|raza|orientaci|sexual)/i,
    biometrico: /(huella|foto|biom)/i,
    persona: /(referencia|codeudor|fiador|c[oó]nyuge|familiar|asesor|cobrador|gestor|vendedor|recomend|referid)/i,
    banco: /(clave|contrase|tarjeta|cuenta|banco|salario|ingreso)/i,
    /* 27-oct-2026, revisión — sin «observaci»: «Observaciones» es justo la
       columna donde una base de feria trae la información adicional («vende
       arepas en la esquina»), y lo que traiga de cobro ya lo descarta la regla
       de VALORES («YA PAGO», «VENCIDO»). Se descartaba diciendo «es de
       cobranza», y eso era falso. */
    cobranza: /(valor|estado|gesti[oó]n|resultado|tipific|orden|plataforma|(^|[^a-záéíóúñ])app([^a-záéíóúñ]|$))/i,
    /* 27-oct-2026, ronda 2 — LA DIRECCIÓN NO VIAJA. Desde el 22-sep, lo que
       Joan acepta al publicar dice «Sigue sin viajar: cédula, dirección, fotos
       y referencias», y una columna «Dirección» marcada llegaba al celular del
       asesor. Joan decidió que el equipo contacta por WhatsApp, no en la casa. */
    direccion: /(direcci|domicilio|residencia)/i
  };
  var POR_QUE = {
    plata: 'es plata o deuda', documento: 'es un documento', salud: 'es un dato de salud',
    sensible: 'es un dato sensible', biometrico: 'es un dato biométrico', persona: 'es otra persona',
    /* Por el NOMBRE no se sabe qué trae: se dice lo que suele traer. */
    banco: 'es una clave o un dato del banco', cobranza: 'suele traer datos de cobranza',
    direccion: 'es una dirección: no viaja al equipo'
  };
  /* Los VALORES que no se guardan: cédulas y teléfonos de otros (7 dígitos o
     más seguidos), montos, fechas de Excel y códigos (solo cifras), los que
     traen palabras de cobro y (ronda 2) los que son una dirección escrita,
     aunque vengan en otra columna.
     27-oct-2026, ronda 3 — la dirección colombiana se escribe de mil maneras
     y casi nunca con «#»: «CL 45 SUR 12 34», «KR 7 45 10», «Cll 45 N 12-30»,
     «AK 68 12 30», «Diagonal 5 Bis 3-2», «Mz 4 Casa 12», «Mz B Cs 12», «Apto
     301», «Av Boyacá 12-30». La regla de ronda 2 exigía un «#» o un «No.» y
     las dejaba pasar todas. Ahora basta la palabra de la vía o del inmueble
     seguida de un número (o «Mz» seguida de una letra), o «# 12-30». Se pasa
     de prudente a propósito: «vende en su casa 3 días» también se queda sin
     guardar, y eso no le quita nada a nadie. La MISMA regla vive en extra_limpio.
     27-oct-2026, ronda 4 — también el puesto donde trabaja, que es otra forma
     de encontrarlo: «CC Gran Estación local 2-115», «Corabastos bodega 23»,
     «puesto 40», «oficina 301». */
  var VALORES_QUE_NO_SE_GUARDAN = {
    sieteDigitos: /[0-9]{7,}/,
    soloCifras: /^[0-9.,$ ]{3,}$/,
    cobro: /((^|[^a-záéíóúñ])mora([^a-záéíóúñ]|$)|vencid|pag[oóa]|deud|cobr|saldo|abon|cuota|castig|embarg|promesa|no contesta|\$)/i,
    direccion: /(^|[^a-záéíóúñ])(calle|cll|clle|cl|carrera|cra|crr|kra|kr|cr|avenida|avda|av|ak|ac|diagonal|diag|dg|transversal|transv|trans|tv|tr|circular|cir|manzana|mza|mz|casa|cs|apartamento|apto|apt|ap|torre|interior|int|bloque|blq|bl|lote|lt|piso|km|kil[oó]metro|edificio|edif|conjunto|urbanizaci[oó]n|urb|local|bodega|puesto|oficina)\.?\s*(#|n[oº°]\.?)?\s*[0-9]|(^|[^a-záéíóúñ])(avenida|avda|av|autopista|calle|carrera)\.?\s+([a-záéíóúñ]+\s+){1,3}[0-9]|(^|[^a-záéíóúñ])(mza|mz)(\.\s*|\s+)[a-z]([^a-záéíóúñ]|$)|#\s*[0-9]+\s*-\s*[0-9]|(^|[^a-záéíóúñ])n[oº°]\.?\s*[0-9]+\s*-\s*[0-9]/i
  };
  /* 27-oct-2026, revisión — una fecha escrita («2026-10-01», «01/10/2026»)
     tiene 8 cifras, pero no es una cédula ni un teléfono: la de los 7 dígitos
     la tumbaba diciendo «trae cédulas o teléfonos». La MISMA excepción vive en
     extra_limpio. (La fecha que Excel guarda como número, 45950, sigue
     descartada: «son solo números».) */
  var FECHA_ESCRITA = /^([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})$/;
  function pareceDocumento(v) {
    var t = texto(v);
    return !FECHA_ESCRITA.test(t) && VALORES_QUE_NO_SE_GUARDAN.sieteDigitos.test(t.replace(/[ .-]/g, ''));
  }

  function texto(v) { return String(v == null ? '' : v).trim(); }

  /* La MISMA limpieza de texto_del_equipo en el servidor. */
  function limpiarTexto(v, n) {
    return texto(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>"'`\\]/g, '')
      .replace(/ {2,}/g, ' ').trim().slice(0, n).trim();
  }
  /* Un valor de una columna extra, o '' si no se guarda. */
  function limpiarValor(v) {
    var t = limpiarTexto(v, MAX_VALOR);
    if (!t) return '';
    if (pareceDocumento(t)) return '';
    if (VALORES_QUE_NO_SE_GUARDAN.soloCifras.test(t)) return '';
    if (VALORES_QUE_NO_SE_GUARDAN.cobro.test(t)) return '';
    if (VALORES_QUE_NO_SE_GUARDAN.direccion.test(t)) return '';
    return t;
  }
  /* 27-oct-2026, ronda 3 — «Monto que pide»: solo un monto en pesos, redondo
     a mil y de 10.000 a 99.999.000 («500.000», «$ 1.200.000», 500000 de
     Excel). Es la única columna que guarda cifras: una cédula o un teléfono no
     terminan en 000 (y uno de 10 dígitos no cabe). Se guarda escrito igual
     siempre: «$500.000». La MISMA regla vive en extra_limpio. */
  function montoQuePide(v) {
    var t = limpiarTexto(v, MAX_VALOR);
    if (!/^\$?\s*[0-9][0-9., ]*$/.test(t)) return '';
    var d = t.replace(/[.,]00$/, '').replace(/[^0-9]/g, '').replace(/^0+/, '');
    if (d.length < 5 || d.length > 8 || Number(d) % 1000) return '';
    return '$' + d.replace(/\B(?=([0-9]{3})+$)/g, '.');
  }
  function esClaveQueViaja(k) { return CLAVES_QUE_VIAJAN.indexOf(String(k == null ? '' : k)) >= 0; }
  /* El valor de UNA de las cinco, o '' si no se guarda (ni viaja). */
  function limpiarValorDe(clave, v) {
    if (!esClaveQueViaja(clave)) return '';
    if (clave === 'Monto que pide') return montoQuePide(v);
    var t = limpiarValor(v);
    /* Una ciudad no lleva números: con números ya es una dirección o un código. */
    if (clave === 'Ciudad' && /[0-9]/.test(t)) return '';
    return t;
  }
  /* 27-oct-2026, ronda 4 — el encabezado sin mayúsculas, tildes ni signos, con
     un solo espacio: «  ¿Cómo  llegó? » es «como llego» y «Ciudad / Barrio» es
     «ciudad barrio» (que no está en ninguna lista). */
  function normalEncabezado(t) {
    return texto(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /* La columna del archivo que trae uno de los cinco datos, o null: solo si
     su nombre es EXACTAMENTE uno de la lista. */
  function queViajaDe(encabezado) {
    var t = normalEncabezado(encabezado);
    for (var k = 0; k < COLUMNAS_QUE_VIAJAN.length; k++) if (COLUMNAS_QUE_VIAJAN[k].nombres.indexOf(t) >= 0) return COLUMNAS_QUE_VIAJAN[k];
    return null;
  }
  /* El nombre: el nombreDe de bases.js (Mayúscula Inicial, solo letras) SIN la
     comilla, para que ninguna pantalla lo pueda ejecutar (R11). */
  function limpiarNombre(v) {
    return B.nombreDe(String(v == null ? '' : v).replace(/'/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  function limpiarNota(v) { return limpiarTexto(v, MAX_NOTA); }
  /* Una clave que el servidor sí acepta, o '' (la misma regla de extra_limpio). */
  function familiaDeClave(k) {
    var t = texto(k);
    for (var f in PALABRAS_QUE_NO_SE_GUARDAN) if (PALABRAS_QUE_NO_SE_GUARDAN[f].test(t)) return f;
    return '';
  }

  function letra(i) {
    var s = '', n = i + 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  /* --------------------------------------------------------------------------
   * EL NOMBRE, POR SU ENCABEZADO — 27 de octubre de 2026 (madrugada)
   *
   * La verificación lo vio con el archivo típico de una feria:
   * «Nombre;Celular;Barrio donde vive;Negocio». bases.js (detectarColumnas)
   * elige la columna del nombre por sus VALORES —varias palabras y casi todas
   * distintas—, y un barrio de dos palabras («Kennedy Timiza», «Patio
   * Bonito») o una dirección («Calle 45 sur # 12-34») puntúan igual o mejor
   * que «Ana Gómez». Ganaba el barrio: a LEIDY le llegaba una persona llamada
   * «Kennedy Timiza», el 📲 decía «Hola Kennedy», y el previo ponía «Nombre»
   * entre lo que no se guarda. Pasaba también en el «⤒ Cargar base» de Joan,
   * desde antes de este lote.
   *
   * La regla, sin tocar bases.js (publicado, con su ?v=): si el encabezado
   * tiene una columna que se llama EXACTAMENTE como un nombre de persona, esa
   * es el nombre, diga lo que diga el puntaje. Si no la tiene y la que eligió
   * el puntaje se llama como un lugar, un negocio o una nota, no hay nombre:
   * mejor una ficha con el celular solo que con un nombre inventado (la misma
   * regla del 17-sep en bases.js).
   * ------------------------------------------------------------------------ */
  var ENCABEZADOS_DE_NOMBRE = ['nombre', 'nombres', 'nombre completo', 'nombres completos',
    'nombre y apellido', 'nombre y apellidos', 'nombres y apellido', 'nombres y apellidos',
    'apellidos y nombres', 'apellido y nombre', 'nombre del cliente', 'nombre cliente', 'cliente', 'titular'];
  var ENCABEZADO_QUE_NO_ES_NOMBRE = /direcci|barrio|residen|ciudad|municipi|ubicaci|localidad|sector|domicil|vereda|calle|negocio|empresa|ocupaci|oficio|nota|observ|coment|asesor|vendedor|fuente|origen|correo|email/;
  function columnasConNombre(filas) {
    var cols = B.detectarColumnas(filas);
    var enc = Math.max(0, Number(cols.encabezado) || 0);
    if (!enc) return cols;
    var cab = (filas[enc - 1] || []).map(normalEncabezado);
    for (var i = 0; i < cab.length; i++) {
      if (i !== cols.celular && ENCABEZADOS_DE_NOMBRE.indexOf(cab[i]) >= 0) {
        return { celular: cols.celular, nombre: i, encabezado: cols.encabezado };
      }
    }
    if (cols.nombre >= 0 && ENCABEZADO_QUE_NO_ES_NOMBRE.test(cab[cols.nombre] || '')) {
      return { celular: cols.celular, nombre: -1, encabezado: cols.encabezado };
    }
    return cols;
  }

  /* --------------------------------------------------------------------------
   * LAS COLUMNAS EXTRA DE UN ARCHIVO
   *
   * Devuelve { columnas: [{i, nombre, columna, muestra, marcada:false}],
   * descartadas: [{i, nombre, motivo}] }. `nombre` es la clave FIJA con que
   * se guarda (una de las cinco de COLUMNAS_QUE_VIAJAN) y `columna`, cómo se
   * llama en el archivo. Las que se pueden guardar van SIN MARCAR (D7,
   * minimización): las marca quien sube, sabiendo qué es. Todas las demás
   * columnas se descartan, y se dice por qué. Una de las cinco también se
   * descarta ENTERA si más de la mitad de sus valores no se pueden guardar.
   * ------------------------------------------------------------------------ */
  function columnasExtra(filas, cols) {
    filas = Array.isArray(filas) ? filas : [];
    cols = cols || {};
    var enc = Math.max(0, Number(cols.encabezado) || 0);
    var cabecera = enc > 0 ? (filas[enc - 1] || []) : [];
    var datos = filas.slice(enc);
    var ancho = filas.reduce(function (a, f) { return Math.max(a, (f || []).length); }, 0);
    var senales = (B && B.SENALES_FINANCIERAS) || [];
    var columnas = [], descartadas = [], tomadas = {};
    for (var i = 0; i < ancho; i++) {
      if (i === cols.celular || i === cols.nombre) continue;
      var nombre = limpiarTexto(cabecera[i], MAX_CLAVE) || ('Columna ' + letra(i));
      var valores = datos.map(function (f) { return texto((f || [])[i]); }).filter(Boolean);
      if (!valores.length) continue;
      var viaja = queViajaDe(nombre);
      var fam = familiaDeClave(nombre);
      var motivo = '';
      if (!viaja) motivo = fam ? POR_QUE[fam] : NO_VIAJA;
      else if (fam && viaja.admite.indexOf(fam) < 0) motivo = POR_QUE[fam];
      else if (tomadas[viaja.clave]) motivo = 'ya va «' + viaja.clave + '» de la columna «' + tomadas[viaja.clave] + '»';
      else if (senales.some(function (s) { return nombre.toLowerCase().indexOf(s) >= 0; })) motivo = 'es información financiera de otra empresa';
      else motivo = motivoPorValores(viaja.clave, valores);
      if (motivo) { descartadas.push({ i: i, nombre: nombre, motivo: motivo }); continue; }
      tomadas[viaja.clave] = nombre;
      var muestra = '';
      for (var j = 0; j < valores.length && !muestra; j++) muestra = limpiarValorDe(viaja.clave, valores[j]);
      columnas.push({ i: i, nombre: viaja.clave, columna: nombre, muestra: muestra.slice(0, 30), marcada: false });
    }
    return { columnas: columnas, descartadas: descartadas };
  }
  /* Por qué una de las cinco no sirve, si más de la mitad de sus valores no
     se pueden guardar ('' si sirve). Se dice lo más concreto que se sabe. */
  function motivoPorValores(clave, valores) {
    var mitad = valores.length / 2;
    var malos = valores.filter(function (v) { return !limpiarValorDe(clave, v); });
    if (malos.length <= mitad) return '';
    if (clave === 'Monto que pide') return 'no son montos en pesos';
    var V = VALORES_QUE_NO_SE_GUARDAN;
    var deCobro = malos.filter(function (v) { return V.cobro.test(v); });
    if (deCobro.length > mitad) {
      var ej = [];
      deCobro.forEach(function (v) { var u = v.toUpperCase().slice(0, 20); if (ej.indexOf(u) < 0 && ej.length < 2) ej.push(u); });
      return 'trae estados de cobro: ' + ej.map(function (x) { return '«' + x + '»'; }).join(', ');
    }
    if (malos.filter(function (v) { return V.direccion.test(v); }).length > mitad) return 'trae direcciones: no viajan al equipo';
    if (malos.filter(function (v) { return V.soloCifras.test(v); }).length > mitad) return 'son solo números';
    if (malos.filter(pareceDocumento).length > mitad) return 'trae cédulas o teléfonos';
    return clave === 'Ciudad' ? 'no son nombres de ciudades' : 'casi nada se puede guardar';
  }

  /* El celular de una fila con la MISMA regla de revisarBase (incluida su
     segunda oportunidad en otra columna), para que la información adicional
     caiga en la misma persona que bases.js dejó entrar. */
  function celularDeFila(f, cols) {
    f = f || [];
    var cel = cols.celular >= 0 ? B.celularDe(f[cols.celular]) : '';
    for (var j = 0; j < f.length && !cel; j++) cel = B.celularDe(f[j]);
    return cel;
  }

  /* { celular: {Ciudad: 'Bogotá', …} } con SOLO las columnas elegidas, y solo
     si son de las cinco (una columna con otro nombre no se guarda aunque la
     pasen). Gana la primera aparición, como en revisarBase. */
  function extrasPorCelular(filas, cols, elegidas) {
    filas = Array.isArray(filas) ? filas : [];
    cols = cols || {};
    var el = (elegidas || []).filter(function (c) { return c && esClaveQueViaja(c.nombre); }).slice(0, MAX_EXTRAS);
    var out = {};
    if (!el.length) return out;
    for (var r = Math.max(0, Number(cols.encabezado) || 0); r < filas.length; r++) {
      var f = filas[r] || [];
      var cel = celularDeFila(f, cols);
      if (!cel || out[cel]) continue;
      var obj = {}, hay = false;
      el.forEach(function (c) {
        var v = limpiarValorDe(c.nombre, f[c.i]);
        if (v && !(c.nombre in obj)) { obj[c.nombre] = v; hay = true; }
      });
      out[cel] = hay ? obj : null;
    }
    Object.keys(out).forEach(function (k) { if (!out[k]) delete out[k]; });
    return out;
  }

  function enTandas(lista, n) {
    var t = Math.max(1, Number(n) || TOPE_TANDA), out = [];
    for (var i = 0; i < (lista || []).length; i += t) out.push(lista.slice(i, i + t));
    return out;
  }
  function primerasN(lista, n) { return (lista || []).slice(0, Math.max(0, Number(n) || 0)); }
  /* En el orden del archivo, uno a cada asesor en turno. */
  function repartirParejo(lista, asesores) {
    var a = (asesores || []).filter(function (x) { return x && x.celular; });
    if (!a.length) return (lista || []).slice();
    return (lista || []).map(function (p, i) {
      var c = {}; for (var k in p) c[k] = p[k];
      c.para = a[i % a.length].celular;
      return c;
    });
  }

  /* El resumen de una subida, en palabras. NUNCA un nombre, un código, «es
     cliente» ni de quién es un número que ya existía: son datos de otras
     personas. */
  function textoResultado(r) {
    r = r || {};
    var n = function (x) { return Number(x) || 0; };
    var miles = function (x) { return n(x).toLocaleString('es-CO'); };
    var l = [];
    /* 27-oct-2026, revisión — con 0 no es un «Listo»: debajo de «Paré…» salía
       en verde «Listo. Entraron 0 a tu base». */
    l.push(!n(r.entraron) ? 'No entró nadie a tu base.'
      : n(r.entraron) === 1 ? 'Listo. Entró 1 a tu base.' : 'Listo. Entraron ' + miles(r.entraron) + ' a tu base.');
    /* «Solo la primera vez»: el servidor no vuelve a cobrar un «ya existe»
       que este gerente ya había consultado (ya_existen_nuevos). */
    if (n(r.ya_existen)) l.push('Ya existían en Tu Garantía: ' + miles(r.ya_existen) +
      '. No te digo de quién: son datos de otras personas. Cuentan para el tope del día solo la primera vez que los subes.');
    if (n(r.ya_en_tu_base)) l.push('Ya eran tuyos: ' + miles(r.ya_en_tu_base));
    if (n(r.repetidas) + n(r.invalidas)) l.push('Repetidas o sin celular: ' + miles(n(r.repetidas) + n(r.invalidas)));
    return l;
  }

  return {
    VERSION: '2026-10-27',
    TOPE_TANDA: TOPE_TANDA,
    MAX_EXTRAS: MAX_EXTRAS,
    MAX_NOTA: MAX_NOTA,
    COLUMNAS_QUE_VIAJAN: COLUMNAS_QUE_VIAJAN,
    CLAVES_QUE_VIAJAN: CLAVES_QUE_VIAJAN,
    PALABRAS_QUE_NO_SE_GUARDAN: PALABRAS_QUE_NO_SE_GUARDAN,
    VALORES_QUE_NO_SE_GUARDAN: VALORES_QUE_NO_SE_GUARDAN,
    FECHA_ESCRITA: FECHA_ESCRITA,
    columnasExtra: columnasExtra,
    columnasConNombre: columnasConNombre,
    ENCABEZADOS_DE_NOMBRE: ENCABEZADOS_DE_NOMBRE,
    extrasPorCelular: extrasPorCelular,
    celularDeFila: celularDeFila,
    esClaveQueViaja: esClaveQueViaja,
    queViajaDe: queViajaDe,
    normalEncabezado: normalEncabezado,
    limpiarValorDe: limpiarValorDe,
    montoQuePide: montoQuePide,
    limpiarValor: limpiarValor,
    limpiarNombre: limpiarNombre,
    limpiarNota: limpiarNota,
    limpiarTexto: limpiarTexto,
    familiaDeClave: familiaDeClave,
    enTandas: enTandas,
    primerasN: primerasN,
    repartirParejo: repartirParejo,
    textoResultado: textoResultado
  };
});
