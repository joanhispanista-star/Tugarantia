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
  var MAX_EXTRAS = 6;        // columnas extra por persona
  var MAX_VALOR = 120;       // caracteres por valor
  var MAX_CLAVE = 40;        // caracteres por nombre de columna
  var MAX_NOTA = 300;        // la «Información adicional» a mano

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
     traen palabras de cobro y (ronda 2) los que son una dirección escrita
     («Calle 1 # 2-3», «Cra 17 No. 7-7»), aunque vengan en otra columna. */
  var VALORES_QUE_NO_SE_GUARDAN = {
    sieteDigitos: /[0-9]{7,}/,
    soloCifras: /^[0-9.,$ ]{3,}$/,
    cobro: /((^|[^a-záéíóúñ])mora([^a-záéíóúñ]|$)|vencid|pag[oóa]|deud|cobr|saldo|abon|cuota|castig|embarg|promesa|no contesta|\$)/i,
    direccion: /(^|[^a-záéíóúñ])(calle|cll|cl|carrera|cra|kra|kr|cr|avenida|av|diagonal|dg|transversal|tv)\.?\s*[0-9]+[a-z]?.*(#|n[oº°]\.?\s*[0-9])/i
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
   * LAS COLUMNAS EXTRA DE UN ARCHIVO
   *
   * Devuelve { columnas: [{i, nombre, muestra, marcada:false}], descartadas:
   * [{i, nombre, motivo}] }. Las que se pueden guardar van SIN MARCAR (D7,
   * minimización): las marca quien sube, sabiendo qué es. Una columna se
   * descarta ENTERA si más de la mitad de sus valores caen en una regla de
   * arriba, y se dice por qué. Hasta 6.
   * ------------------------------------------------------------------------ */
  function columnasExtra(filas, cols) {
    filas = Array.isArray(filas) ? filas : [];
    cols = cols || {};
    var enc = Math.max(0, Number(cols.encabezado) || 0);
    var cabecera = enc > 0 ? (filas[enc - 1] || []) : [];
    var datos = filas.slice(enc);
    var ancho = filas.reduce(function (a, f) { return Math.max(a, (f || []).length); }, 0);
    var senales = (B && B.SENALES_FINANCIERAS) || [];
    var columnas = [], descartadas = [], usados = {};
    for (var i = 0; i < ancho; i++) {
      if (i === cols.celular || i === cols.nombre) continue;
      var nombre = limpiarTexto(cabecera[i], MAX_CLAVE) || ('Columna ' + letra(i));
      var valores = datos.map(function (f) { return texto((f || [])[i]); }).filter(Boolean);
      if (!valores.length) continue;
      var motivo = '';
      var fam = familiaDeClave(nombre);
      if (fam && fam !== 'cobranza') motivo = POR_QUE[fam];
      var mitad = valores.length / 2;
      if (!motivo) {
        var deCobro = valores.filter(function (v) { return VALORES_QUE_NO_SE_GUARDAN.cobro.test(v); });
        if (deCobro.length > mitad) {
          var ej = [];
          deCobro.forEach(function (v) { var u = v.toUpperCase().slice(0, 20); if (ej.indexOf(u) < 0 && ej.length < 2) ej.push(u); });
          motivo = 'trae estados de cobro: ' + ej.map(function (x) { return '«' + x + '»'; }).join(', ');
        }
      }
      if (!motivo && valores.filter(function (v) { return VALORES_QUE_NO_SE_GUARDAN.direccion.test(v); }).length > mitad) motivo = POR_QUE.direccion;
      if (!motivo && valores.filter(function (v) { return VALORES_QUE_NO_SE_GUARDAN.soloCifras.test(v); }).length > mitad) motivo = 'son solo números';
      if (!motivo && valores.filter(pareceDocumento).length > mitad) motivo = 'trae cédulas o teléfonos';
      if (!motivo && fam === 'cobranza') motivo = POR_QUE.cobranza;
      if (!motivo && senales.some(function (s) { return nombre.toLowerCase().indexOf(s) >= 0; })) motivo = 'es información financiera de otra empresa';
      if (!motivo && columnas.length >= MAX_EXTRAS) motivo = 'solo se guardan ' + MAX_EXTRAS;
      if (motivo) { descartadas.push({ i: i, nombre: nombre, motivo: motivo }); continue; }
      /* Dos columnas con el mismo encabezado no pueden pisarse en el objeto. */
      var clave = nombre, k = 2;
      while (usados[clave.toLowerCase()]) clave = nombre.slice(0, MAX_CLAVE - 3) + ' ' + (k++);
      usados[clave.toLowerCase()] = 1;
      var muestra = '';
      for (var j = 0; j < valores.length && !muestra; j++) muestra = limpiarValor(valores[j]);
      columnas.push({ i: i, nombre: clave, muestra: muestra.slice(0, 30), marcada: false });
    }
    return { columnas: columnas, descartadas: descartadas };
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

  /* { celular: {Barrio: 'Kennedy', …} } con SOLO las columnas elegidas. Gana la
     primera aparición, como en revisarBase. */
  function extrasPorCelular(filas, cols, elegidas) {
    filas = Array.isArray(filas) ? filas : [];
    cols = cols || {};
    var el = (elegidas || []).slice(0, MAX_EXTRAS);
    var out = {};
    if (!el.length) return out;
    for (var r = Math.max(0, Number(cols.encabezado) || 0); r < filas.length; r++) {
      var f = filas[r] || [];
      var cel = celularDeFila(f, cols);
      if (!cel || out[cel]) continue;
      var obj = {}, hay = false;
      el.forEach(function (c) {
        var v = limpiarValor(f[c.i]);
        if (v && !familiaDeClave(c.nombre)) { obj[limpiarTexto(c.nombre, MAX_CLAVE)] = v; hay = true; }
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
    PALABRAS_QUE_NO_SE_GUARDAN: PALABRAS_QUE_NO_SE_GUARDAN,
    VALORES_QUE_NO_SE_GUARDAN: VALORES_QUE_NO_SE_GUARDAN,
    FECHA_ESCRITA: FECHA_ESCRITA,
    columnasExtra: columnasExtra,
    extrasPorCelular: extrasPorCelular,
    celularDeFila: celularDeFila,
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
