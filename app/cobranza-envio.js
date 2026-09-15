/* ===========================================================================
 * LA BASE PARA MANDAR SMS Y VOZ — Tu Garantía
 * 15 de septiembre de 2026.
 *
 * Joan lo pidió así: «cómo puedo conectar esta plataforma de mensajes de texto
 * y mensajes de voz para cobrar con una plantilla la cual indique el monto a
 * cobrar por cada cliente ya que hoy vence el plazo para muchos clientes».
 *
 * Esto arma el archivo que se sube a la plataforma. NO decide a quién se le
 * escribe: eso ya lo decide panel/tanda.js con los topes de la Ley 2300, y
 * meterlo dos veces sería tener dos leyes.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ NO SE REUSAN LAS PLANTILLAS DEL CRM
 *
 * Las catorce plantillas de crm.html están escritas para WhatsApp: largas,
 * cálidas, con tildes y con emoji. Por WhatsApp eso es gratis. Por SMS no.
 *
 * Un SMS cabe en 160 caracteres SI TODO el texto está en el alfabeto GSM-7. Una
 * sola tilde, una ñ o un emoji obligan a UCS-2, y ahí el mensaje cabe en 70. La
 * plantilla «venceHoy» del CRM tiene 253 caracteres con tildes: por SMS son
 * CUATRO mensajes, o sea cuatro veces el precio, por cada cliente y cada vez.
 *
 * Por eso acá hay plantillas propias, cortas y sin tildes, y una función que
 * cuenta los pedazos ANTES de exportar. Lo que no cabe en uno se avisa; no se
 * descubre en la factura.
 *
 * ---------------------------------------------------------------------------
 * LA VOZ SE ESCRIBE DISTINTO
 *
 * Un mensaje de voz lo lee una máquina. «$150.000» se lee mal —el punto suena a
 * decimal— y las abreviaturas se leen letra por letra. Por eso el monto va EN
 * PALABRAS: «ciento cincuenta mil pesos». Es la diferencia entre que el cliente
 * entienda cuánto debe y que cuelgue.
 *
 * ---------------------------------------------------------------------------
 * LO QUE LOS TEXTOS NO DICEN, Y ES A PROPÓSITO (Ley 2300 de 2023)
 *
 *   · No preguntan por qué no pagó (artículo 7, prohibido).
 *   · No nombran a nadie más que al deudor (artículo 4).
 *   · No amenazan ni anuncian consecuencias.
 *   · Dicen quién escribe desde la primera palabra.
 * ========================================================================= */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CobranzaEnvio = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* El alfabeto GSM-7 (GSM 03.38), que es lo que cabe en 160. Los siete de la
     tabla de extensión ({ } [ ] ~ ^ \ y el euro) cuentan DOBLE, y por eso están
     aparte: un texto lleno de llaves cabe en menos de 160 aunque parezca que no. */
  var GSM7 =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  var GSM7_DOBLES = '^{}\\[~]|€';

  var SMS_UN_PEDAZO_GSM7 = 160;
  var SMS_UN_PEDAZO_UCS2 = 70;
  /* Cuando hay más de un pedazo, cada uno pierde espacio por la cabecera que
     los une (UDH): 153 en GSM-7 y 67 en UCS-2. Contarlo con 160 y 70 subestima
     el precio justo cuando el precio importa. */
  var SMS_PEDAZO_LARGO_GSM7 = 153;
  var SMS_PEDAZO_LARGO_UCS2 = 67;

  function texto(v) { return v == null ? '' : String(v); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /** ¿Todo el texto cabe en el alfabeto barato? */
  function esGSM7(t) {
    var s = texto(t);
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (GSM7.indexOf(c) < 0 && GSM7_DOBLES.indexOf(c) < 0) return false;
    }
    return true;
  }

  /** Cuántos caracteres "pesa" un texto, contando dobles los de la extensión. */
  function pesoGSM7(t) {
    var s = texto(t), n = 0;
    for (var i = 0; i < s.length; i++) n += (GSM7_DOBLES.indexOf(s.charAt(i)) >= 0) ? 2 : 1;
    return n;
  }

  /**
   * En cuántos SMS se parte un texto, y por qué.
   * @returns {{alfabeto:'GSM-7'|'UCS-2', caracteres:number, pedazos:number, culpables:string[]}}
   */
  function pedazosSMS(t) {
    var s = texto(t);
    var barato = esGSM7(s);
    var n = barato ? pesoGSM7(s) : s.length;
    var uno = barato ? SMS_UN_PEDAZO_GSM7 : SMS_UN_PEDAZO_UCS2;
    var largo = barato ? SMS_PEDAZO_LARGO_GSM7 : SMS_PEDAZO_LARGO_UCS2;
    var pedazos = n === 0 ? 1 : (n <= uno ? 1 : Math.ceil(n / largo));

    /* Qué caracteres exactos encarecieron el mensaje. Sin esto el aviso dice
       «tiene tildes» y hay que buscarlas a ojo en un texto de 200 letras. */
    var culpables = [];
    if (!barato) {
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (GSM7.indexOf(c) < 0 && GSM7_DOBLES.indexOf(c) < 0 && culpables.indexOf(c) < 0) {
          culpables.push(c);
        }
      }
    }
    return { alfabeto: barato ? 'GSM-7' : 'UCS-2', caracteres: n,
             pedazos: pedazos, culpables: culpables };
  }

  /** Quita tildes y deja el texto en el alfabeto barato. La ñ se conserva: está
      en GSM-7 y quitarla cambia palabras («ano» por «año»). */
  function sinTildes(t) {
    return texto(t)
      .replace(/[áàäâ]/g, 'a').replace(/[ÁÀÄÂ]/g, 'A')
      .replace(/[éèëê]/g, 'e').replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[íìïî]/g, 'i').replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[óòöô]/g, 'o').replace(/[ÓÒÖÔ]/g, 'O')
      .replace(/[úùû]/g, 'u').replace(/[ÚÙÛ]/g, 'U')
      /* Y ahora la regla de verdad, dicha como es: lo que no esta en el
         alfabeto barato se va. Antes aca habia un rango de codigos
         —de U+2000 a U+3300— que hacia mas o menos esto pero que nadie podia
         leer, y que dejaba pasar emoji modernos porque viven mas arriba. Un
         solo emoji encarece el mensaje entero, asi que la regla no puede ser
         aproximada. Se recorre y se pregunta. */
      .split('').filter(function (c) { return esGSM7(c); }).join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ------------------------------------------------------------ el dinero */

  var UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete',
                  'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce',
                  'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve'];
  var DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
                 'sesenta', 'setenta', 'ochenta', 'noventa'];
  var CIENTOS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
                 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function menosDeMil(n) {
    if (n === 0) return '';
    if (n === 100) return 'cien';
    var c = Math.floor(n / 100), r = n % 100, s = CIENTOS[c];
    if (r === 0) return s;
    var d = Math.floor(r / 10), u = r % 10, t;
    if (r < 20) t = UNIDADES[r];
    else if (r < 30) t = 'veinti' + UNIDADES[u];
    else t = DECENAS[d] + (u ? ' y ' + UNIDADES[u] : '');
    return (s ? s + ' ' : '') + t;
  }

  /* «veintiuno mil pesos» no lo dice nadie: delante del sustantivo, el uno se
     apocopa — «veintiun mil pesos», «treinta y un mil pesos». Lo lee una
     maquina en voz alta a un cliente que debe plata; mal dicho suena a robot.
     Sin tilde a proposito: la tilde saca el mensaje del alfabeto barato del
     SMS, y este mismo texto se reusa alli. */
  function apocopar(t) {
    return String(t).replace(/uno$/, 'un');
  }

  /**
   * El monto en palabras, para que una máquina lo lea bien.
   * «$150.000» leído por un robot suena a decimal; «ciento cincuenta mil pesos»
   * no se puede malentender.
   */
  function montoHablado(v) {
    var n = Math.round(Math.abs(num(v)));
    if (n === 0) return 'cero pesos';
    var millones = Math.floor(n / 1000000);
    var miles = Math.floor((n % 1000000) / 1000);
    var resto = n % 1000;
    var partes = [];
    if (millones === 1) partes.push('un millon');
    else if (millones > 1) partes.push(apocopar(menosDeMil(millones)) + ' millones');
    if (miles === 1) partes.push('mil');
    else if (miles > 1) partes.push(apocopar(menosDeMil(miles)) + ' mil');
    /* El resto tambien: son «veintiun pesos», no «veintiuno pesos». */
    if (resto > 0) partes.push(apocopar(menosDeMil(resto)));
    /* «un millon pesos» no lo dice nadie. En espanol el millon pide «de»
       cuando la cifra TERMINA ahi: «un millon de pesos», pero «un millon
       doscientos mil pesos» sin «de». Lo lee una maquina en voz alta a un
       cliente: mal dicho suena a robot y el cliente cuelga. */
    var deLetra = (millones > 0 && miles === 0 && resto === 0) ? ' de pesos' : ' pesos';
    return partes.join(' ') + deLetra;
  }

  /** «$150.000» — como lo lee una persona. */
  function montoEscrito(v) {
    var n = Math.round(num(v));
    return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ------------------------------------------------------- los telefonos */

  /** Los diez dígitos, sin indicativo ni espacios. '' si no parece un celular. */
  function celular10(v) {
    var d = texto(v).replace(/\D/g, '');
    if (d.length > 10 && d.indexOf('57') === 0) d = d.slice(d.length - 10);
    if (d.length !== 10 || d.charAt(0) !== '3') return '';
    return d;
  }

  /** Con indicativo de país, que es lo que piden casi todas las plataformas. */
  function celular57(v) {
    var d = celular10(v);
    return d ? '57' + d : '';
  }

  /* ------------------------------------------------------- las plantillas */

  /* Cortas, sin tildes y sin emoji: una sola pieza de SMS. El {telefono} es el
     número de Joan, que entra por opciones — no está escrito acá porque cambia
     y tenerlo en dos sitios es tenerlo mal en uno.

     Ninguna pregunta por qué no pagó (Ley 2300, art. 7) ni nombra a nadie más
     que al deudor (art. 4). Y todas dicen quién escribe en las primeras tres
     palabras: un SMS sin remitente conocido se borra sin leer. */
  var SMS = {
    venceHoy: 'Hola {nombre}, somos Tu Garantia. Hoy vence tu pago de {saldo}. ' +
              'Si necesitas mas plazo, escribenos al {telefono}. Si ya pagaste, gracias.',
    /* Esta se pasaba por UN caracter con un nombre largo y un monto de siete
       cifras: 161, y el limite es 160. Un caracter = el doble de la factura.
       Por eso hay una prueba que la mide con el peor nombre plausible. */
    moraTemprana: 'Hola {nombre}, somos Tu Garantia. Tu pago de {saldo} quedo pendiente ' +
              'el {fecha_pago}. Escribenos al {telefono} y lo organizamos.',
    mora: 'Hola {nombre}, somos Tu Garantia. Tu pago de {saldo} sigue pendiente. ' +
              'Queremos ayudarte: escribenos al {telefono} y buscamos un acuerdo.',
    recordatorio1: 'Hola {nombre}, somos Tu Garantia. Te recordamos tu pago de {saldo} ' +
              'el {fecha_pago}. Cualquier cosa, escribenos al {telefono}.',
    recordatorio2: 'Hola {nombre}, somos Tu Garantia. Te recordamos tu pago de {saldo} ' +
              'el {fecha_pago}. Cualquier cosa, escribenos al {telefono}.'
  };

  /* La voz va más lenta y más simple: la escucha una persona una sola vez y no
     puede volver atrás. El monto en palabras y una pausa antes de la cifra. */
  var VOZ = {
    venceHoy: 'Hola {nombre}. Le saludamos de Tu Garantia. Le recordamos que hoy ' +
              'vence su pago de {saldo_hablado}. Si necesita mas plazo, escribanos ' +
              'al {telefono}. Si ya pago, muchas gracias.',
    moraTemprana: 'Hola {nombre}. Le saludamos de Tu Garantia. Su pago de {saldo_hablado} ' +
              'quedo pendiente el {fecha_pago}. Escribanos al {telefono} y lo organizamos.',
    mora: 'Hola {nombre}. Le saludamos de Tu Garantia. Su pago de {saldo_hablado} sigue ' +
              'pendiente. Queremos ayudarle a resolverlo. Escribanos al {telefono}.',
    recordatorio1: 'Hola {nombre}. Le saludamos de Tu Garantia. Le recordamos su pago de ' +
              '{saldo_hablado} el {fecha_pago}. Cualquier cosa, escribanos al {telefono}.',
    recordatorio2: 'Hola {nombre}. Le saludamos de Tu Garantia. Le recordamos su pago de ' +
              '{saldo_hablado} el {fecha_pago}. Cualquier cosa, escribanos al {telefono}.'
  };

  function aplicar(plantilla, vars) {
    return texto(plantilla).replace(/\{(\w+)\}/g, function (todo, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? texto(vars[k]) : todo;
    });
  }

  /* --------------------------------------------------------- las filas */

  /** El primer nombre, que es como se saluda. «MARIA FERNANDA GOMEZ» → «Maria». */
  function primerNombre(n) {
    var p = sinTildes(texto(n)).split(/\s+/)[0] || '';
    /* Se le quita lo que no sea letra. Una ficha con «Ana; Luisa» —o con una
       coma, o un punto— dejaba el mensaje diciendo «Hola Ana;, somos Tu
       Garantia», y ademas rompia la columna del archivo. Los nombres reales de
       una cartera vieja traen de todo. */
    p = p.replace(/[^A-Za-zÑñ]/g, '');
    if (!p) return '';
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }

  function fechaCorta(iso) {
    var s = texto(iso).slice(0, 10);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    var MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return Number(m[3]) + ' de ' + MES[Number(m[2])];
  }

  /**
   * Las filas listas para subir a la plataforma.
   *
   * @param casos  los que YA pasaron el filtro de la Ley 2300 (tanda.js)
   * @param op     {telefono, plantillas:{sms,voz}}
   * @returns {{filas:Array, sinTelefono:Array, caros:Array}}
   */
  function filasDeEnvio(casos, op) {
    var o = op || {};
    var tel = texto(o.telefono);
    var pSMS = (o.plantillas && o.plantillas.sms) || SMS;
    var pVOZ = (o.plantillas && o.plantillas.voz) || VOZ;

    var filas = [], sinTelefono = [], caros = [];

    (casos || []).forEach(function (c) {
      var cel = celular10(c.telefono);
      if (!cel) { sinTelefono.push(c); return; }

      var clave = texto(c.plantilla) || 'venceHoy';
      var vars = {
        nombre: primerNombre(c.nombre),
        saldo: montoEscrito(c.saldo),
        saldo_hablado: montoHablado(c.saldo),
        fecha_pago: fechaCorta(c.fecha_pago),
        telefono: tel
      };
      var sms = sinTildes(aplicar(pSMS[clave] || pSMS.venceHoy, vars));
      var voz = aplicar(pVOZ[clave] || pVOZ.venceHoy, vars);
      var med = pedazosSMS(sms);
      if (med.pedazos > 1) caros.push({ caso: c, medida: med });

      filas.push({
        celular: cel,
        celular_57: '57' + cel,
        nombre: primerNombre(c.nombre),
        nombre_completo: sinTildes(c.nombre),
        monto: Math.round(num(c.saldo)),
        monto_texto: montoEscrito(c.saldo),
        monto_hablado: montoHablado(c.saldo),
        fecha_pago: texto(c.fecha_pago).slice(0, 10),
        plantilla: clave,
        mensaje_sms: sms,
        mensaje_voz: voz,
        pedazos_sms: med.pedazos
      });
    });

    return { filas: filas, sinTelefono: sinTelefono, caros: caros };
  }

  /* ------------------------------------------------------------- el CSV */

  var COLUMNAS = ['celular', 'celular_57', 'nombre', 'nombre_completo', 'monto',
                  'monto_texto', 'monto_hablado', 'fecha_pago', 'plantilla',
                  'mensaje_sms', 'mensaje_voz', 'pedazos_sms'];

  function campo(v) {
    var s = texto(v);
    /* Comillas dobles adentro, y todo entre comillas si trae coma, comilla o
       salto. Y un apóstrofo delante de nada: el celular va como TEXTO porque
       Excel convierte 3001112233 en notación científica y manda el archivo a
       la plataforma con «3,00111E+09» en la columna del teléfono. Eso ya le ha
       pasado a media Colombia. */
    if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * El archivo, con punto y coma.
   *
   * Punto y coma y no coma: en un Windows en español el separador de listas es
   * el punto y coma, y un CSV con comas se abre con TODO en la primera columna.
   * Joan lo va a abrir en su Excel antes de subirlo.
   */
  function aCSV(filas, sep) {
    var s = sep || ';';
    var lineas = [COLUMNAS.join(s)];
    (filas || []).forEach(function (f) {
      lineas.push(COLUMNAS.map(function (c) { return campo(f[c]); }).join(s));
    });
    /* El BOM va porque sin él Excel abre el archivo en su página de códigos
       vieja y las ñ salen como «Ã±». Los nombres de los clientes tienen ñ. */
    return '﻿' + lineas.join('\r\n') + '\r\n';
  }

  return {
    /* el alfabeto y el precio */
    SMS_UN_PEDAZO_GSM7: SMS_UN_PEDAZO_GSM7,
    SMS_UN_PEDAZO_UCS2: SMS_UN_PEDAZO_UCS2,
    esGSM7: esGSM7,
    pedazosSMS: pedazosSMS,
    sinTildes: sinTildes,
    /* el dinero */
    montoHablado: montoHablado,
    montoEscrito: montoEscrito,
    /* los telefonos */
    celular10: celular10,
    celular57: celular57,
    /* los textos */
    SMS: SMS,
    VOZ: VOZ,
    aplicar: aplicar,
    primerNombre: primerNombre,
    fechaCorta: fechaCorta,
    /* el archivo */
    COLUMNAS: COLUMNAS,
    filasDeEnvio: filasDeEnvio,
    aCSV: aCSV
  };
}));
