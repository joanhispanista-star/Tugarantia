/* ============================================================================
 * LAS BASES DE PROSPECTOS — 9 de septiembre de 2026
 *
 * Joan: «quiero que el CRM pueda ser alimentado con bases de datos y tenga una
 * forma de recibir archivos de estos, y que me organice los clientes por nombre
 * y el celular. Estos son potenciales clientes que quiero consolidar y cada
 * cliente consolidado pertenecerá al asesor que lo gestionó».
 *
 * Un PROSPECTO no es un cliente: es un nombre y un celular de alguien que
 * todavía no se ha registrado. Le faltaba al sistema — el CRM tenía clientes
 * (ya suyos) y registrados (ya inscritos), pero nada antes de eso, y es
 * justamente lo que un asesor trabaja todo el día.
 *
 * ---------------------------------------------------------------------------
 * DE DÓNDE SALE UNA BASE, Y POR QUÉ ESTE ARCHIVO LO PREGUNTA
 *
 * Cada base que entra guarda su ORIGEN, y no es burocracia: la Ley 1581 exige
 * que los datos personales se traten con la autorización previa del titular, y
 * la 1266 es más dura todavía con los datos de crédito. El día que alguien
 * pregunte de dónde salió su teléfono, la respuesta tiene que existir y tiene
 * que estar escrita al lado del dato — no en la memoria de quien la cargó.
 *
 * Por eso `revisarBase` marca las columnas que huelen a información financiera
 * de otra empresa (saldo, días de mora, nombre de otra app) y devuelve un aviso.
 * No bloquea: avisa. Quien decide es Joan, pero decide sabiendo.
 *
 * ---------------------------------------------------------------------------
 * SIN LIBRERÍAS Y SIN CDN. Un .xlsx es un zip con XML adentro, y el navegador
 * ya sabe descomprimir (DecompressionStream). Meter una librería de un CDN en
 * el CRM sería meter código ajeno en la página que tiene TODA la cartera de
 * Joan en memoria — es la misma razón por la que ZXing y face-api viven dentro
 * del repositorio.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.BasesTuGarantia = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function texto(v) { return String(v == null ? '' : v).trim(); }
  function digitos(v) { return texto(v).replace(/\D/g, ''); }

  /* El celular colombiano: diez dígitos y empieza por 3. Se leen los ÚLTIMOS
     diez para que el 57 de adelante no deje a nadie afuera — es la misma regla
     que ya usa la identidad en puente.js. */
  function celularDe(v) {
    var d = digitos(v);
    if (d.length < 10) return '';
    var diez = d.slice(-10);
    return /^3\d{9}$/.test(diez) ? diez : '';
  }

  /* Nombre propio: se limpia lo que no es letra y se pasa a Mayúscula Inicial.
     Las bases llegan casi siempre EN MAYÚSCULA SOSTENIDA, y un WhatsApp que
     empieza «Hola JENNY PAOLA» se lee como un robot. */
  function nombreDe(v) {
    var s = texto(v).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return s.toLowerCase().split(' ').map(function (p) {
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : p;
    }).join(' ');
  }

  /* ------------------------------------------------------------------ CSV */
  function leerCSV(txt) {
    var s = String(txt || '').replace(/^﻿/, '');
    /* El separador se adivina de la primera línea: en Colombia Excel exporta
       con punto y coma más veces que con coma. */
    var linea1 = s.split(/\r?\n/)[0] || '';
    var sep = (linea1.split(';').length > linea1.split(',').length) ? ';' : ',';
    var filas = [], fila = [], campo = '', dentro = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (dentro) {
        if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') dentro = false;
        else campo += c;
      } else if (c === '"') dentro = true;
      else if (c === sep) { fila.push(campo); campo = ''; }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(function (f) { return f.some(function (x) { return texto(x); }); });
  }

  /* ----------------------------------------------------------------- XLSX
     El zip: se recorre el directorio central del final del archivo, que es lo
     único que hace falta para encontrar dos entradas por nombre. */
  function entradasZip(buf) {
    var d = new DataView(buf), n = buf.byteLength, fin = -1;
    for (var i = n - 22; i >= 0 && i > n - 66000; i--) {
      if (d.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('no parece un archivo de Excel');
    var cuantas = d.getUint16(fin + 10, true), off = d.getUint32(fin + 16, true), out = {};
    for (var k = 0; k < cuantas; k++) {
      if (d.getUint32(off, true) !== 0x02014b50) break;
      var metodo = d.getUint16(off + 10, true);
      var comprimido = d.getUint32(off + 20, true);
      var largoNombre = d.getUint16(off + 28, true);
      var extra = d.getUint16(off + 30, true), comentario = d.getUint16(off + 32, true);
      var local = d.getUint32(off + 42, true);
      var nombre = new TextDecoder().decode(new Uint8Array(buf, off + 46, largoNombre));
      out[nombre] = { metodo: metodo, comprimido: comprimido, local: local };
      off += 46 + largoNombre + extra + comentario;
    }
    return out;
  }
  function contenidoDe(buf, e) {
    var d = new DataView(buf);
    var largoNombre = d.getUint16(e.local + 26, true), extra = d.getUint16(e.local + 28, true);
    var desde = e.local + 30 + largoNombre + extra;
    var crudo = new Uint8Array(buf, desde, e.comprimido);
    if (e.metodo === 0) return Promise.resolve(new TextDecoder().decode(crudo));
    var flujo = new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flujo).text();
  }

  function desescapar(s) {
    return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); });
  }

  function leerXLSX(buf) {
    var zip = entradasZip(buf);
    var hojas = Object.keys(zip).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); }).sort();
    if (!hojas.length) throw new Error('el archivo no trae ninguna hoja');
    var compartidas = zip['xl/sharedStrings.xml'];
    return Promise.resolve()
      .then(function () { return compartidas ? contenidoDe(buf, compartidas) : ''; })
      .then(function (xmlSS) {
        var ss = [];
        var re = /<si>([\s\S]*?)<\/si>/g, m;
        while ((m = re.exec(xmlSS))) {
          var partes = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
          ss.push(desescapar(partes.map(function (p) { return p.replace(/<[^>]*>/g, ''); }).join('')));
        }
        return contenidoDe(buf, zip[hojas[0]]).then(function (xml) {
          var filas = [], reFila = /<row[^>]*>([\s\S]*?)<\/row>/g, f;
          while ((f = reFila.exec(xml))) {
            var celdas = {}, reC = /<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
            while ((c = reC.exec(f[1]))) {
              var dentro = c[3] || '';
              var v = (dentro.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
              var t = (dentro.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
              var val = '';
              if (/t="s"/.test(c[2]) && v != null) val = ss[Number(v)] || '';
              else if (t != null) val = desescapar(t);
              else if (v != null) val = v;
              celdas[c[1]] = texto(val);
            }
            /* Se guarda como arreglo por posición, igual que el CSV, para que
               el resto del archivo no tenga que saber de dónde vino la fila. */
            var letras = Object.keys(celdas);
            if (!letras.length) { filas.push([]); continue; }
            var max = letras.reduce(function (a, L) { return Math.max(a, col(L)); }, 0);
            var fila = new Array(max + 1).fill('');
            letras.forEach(function (L) { fila[col(L)] = celdas[L]; });
            filas.push(fila);
          }
          return filas.filter(function (x) { return x.some(function (y) { return texto(y); }); });
        });
      });
  }
  function col(letras) {
    var n = 0;
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  /* --------------------------------------------------------------------------
   * QUÉ COLUMNA ES CUÁL
   *
   * No se le pregunta a la persona: se mira el CONTENIDO. Un encabezado puede
   * estar en chino, o no estar, o mentir; los datos no. La columna del celular
   * es la que tiene más celulares válidos, y la del nombre la que tiene más
   * texto con letras que no es la del celular.
   * ------------------------------------------------------------------------ */
  function detectarColumnas(filas) {
    if (!filas || !filas.length) return { celular: -1, nombre: -1, encabezado: 0 };
    var anchas = filas.reduce(function (a, f) { return Math.max(a, f.length); }, 0);
    var cels = new Array(anchas).fill(0);
    /* Para el nombre no basta con «tiene letras»: una columna con el nombre de
       la app repetido 500 veces («PlataX») gana esa cuenta y se lleva el puesto.
       Un nombre de persona tiene DOS COSAS que un rótulo no tiene: varias
       palabras, y ser distinto en casi cada fila. Se puntúa por las dos.
       (Encontrado probando contra una base real, donde la columna elegida
       terminó siendo el nombre de la aplicación de origen.) */
    var conLetras = new Array(anchas).fill(0);
    var variasPalabras = new Array(anchas).fill(0);
    var distintos = []; for (var q = 0; q < anchas; q++) distintos.push({});
    filas.forEach(function (f) {
      for (var i = 0; i < anchas; i++) {
        var v = texto(f[i]);
        if (!v) continue;
        if (celularDe(v)) { cels[i]++; continue; }
        if (/^\d+$/.test(v) || v.length > 60) continue;
        if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(v)) continue;
        conLetras[i]++;
        distintos[i][v.toLowerCase()] = 1;
        if (v.split(/\s+/).filter(function (p) { return p.length > 1; }).length >= 2) variasPalabras[i]++;
      }
    });
    var celular = cels.indexOf(Math.max.apply(null, cels));
    if (cels[celular] === 0) celular = -1;
    var nombre = -1, mejor = 0;
    for (var i2 = 0; i2 < anchas; i2++) {
      if (i2 === celular || !conLetras[i2]) continue;
      var variedad = Object.keys(distintos[i2]).length / conLetras[i2];   // 1 = todos distintos
      var partido = variasPalabras[i2] / conLetras[i2];                   // 1 = todos con nombre y apellido
      var puntaje = conLetras[i2] * (0.35 + variedad) * (0.35 + partido);
      if (puntaje > mejor) { mejor = puntaje; nombre = i2; }
    }
    /* Las filas de arriba que NO traen celular son encabezados (una o dos: hay
       archivos con el encabezado en dos idiomas). */
    var encabezado = 0;
    while (encabezado < filas.length && encabezado < 5 &&
           !(celular >= 0 && celularDe(filas[encabezado][celular]))) encabezado++;
    return { celular: celular, nombre: nombre, encabezado: encabezado };
  }

  /* --------------------------------------------------------------------------
   * LA REVISIÓN, ANTES DE CARGAR NADA
   *
   * Devuelve lo que va a pasar SIN hacerlo: cuántos entran, cuántos venían
   * repetidos dentro del propio archivo, cuántos ya son clientes de Joan y
   * cuántas filas no traen un celular utilizable.
   * ------------------------------------------------------------------------ */
  var SENALES_FINANCIERAS = [
    'saldo', 'mora', 'deuda', 'cuota', 'interes', 'interés', 'prestamo', 'préstamo',
    'monto restante', 'dias de mora', 'días de mora', 'orden', 'appname', 'app name'
  ];

  function revisarBase(filas, cols, yaTengo) {
    var t = yaTengo || {};
    var prospectos = (t.prospectos || []).map(function (p) { return celularDe(p.celular); });
    var socios = [];
    (t.socios || []).forEach(function (s) {
      [s.telefono, s.telefono2, s.whatsappNumero].forEach(function (x) {
        var c = celularDe(x); if (c) socios.push(c);
      });
    });
    var vistos = {}, nuevos = [], repetidos = 0, yaClientes = 0, sinCelular = 0;
    for (var i = cols.encabezado; i < filas.length; i++) {
      var f = filas[i] || [];
      var cel = cols.celular >= 0 ? celularDe(f[cols.celular]) : '';
      if (!cel) {
        /* Segunda oportunidad: a veces el celular está en otra columna de esa
           fila suelta. Vale la pena, porque una base de 226 con 8 filas
           corridas es una base con 8 personas perdidas. */
        for (var j = 0; j < f.length && !cel; j++) cel = celularDe(f[j]);
      }
      if (!cel) { sinCelular++; continue; }
      if (vistos[cel]) { repetidos++; continue; }
      vistos[cel] = true;
      if (socios.indexOf(cel) >= 0) { yaClientes++; continue; }
      if (prospectos.indexOf(cel) >= 0) { repetidos++; continue; }
      nuevos.push({ nombre: cols.nombre >= 0 ? nombreDe(f[cols.nombre]) : '', celular: cel });
    }

    /* El aviso de datos ajenos: se mira el ENCABEZADO, que es donde una base
       exportada de otra empresa se delata. */
    var cabecera = filas.slice(0, Math.max(1, cols.encabezado)).flat()
      .map(function (x) { return texto(x).toLowerCase(); }).join(' | ');
    var senales = SENALES_FINANCIERAS.filter(function (s) { return cabecera.indexOf(s) >= 0; });

    return { nuevos: nuevos, repetidos: repetidos, yaClientes: yaClientes,
             sinCelular: sinCelular, senalesFinancieras: senales };
  }

  return {
    VERSION: '2026-09-09',
    celularDe: celularDe,
    nombreDe: nombreDe,
    leerCSV: leerCSV,
    leerXLSX: leerXLSX,
    detectarColumnas: detectarColumnas,
    revisarBase: revisarBase,
    SENALES_FINANCIERAS: SENALES_FINANCIERAS
  };
});
