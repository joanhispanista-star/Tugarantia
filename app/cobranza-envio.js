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
  /* EL AVISO DE SALIDA, EN UN SOLO SITIO.
     En Colombia la salida es OBLIGATORIA: la tabla de cobertura de Infobip dice
     «Opt Out mandatory: Yes» para el pais. No es cortesia, es condicion para que
     la operadora entregue el mensaje.

     Y coincide con la Ley 2300: el articulo 2 dice que el deudor elige por que
     canales se le puede contactar. Un mensaje que no deja salirse le niega esa
     eleccion.

     Vive aparte y se pega a cada plantilla en filasDeEnvio, no escrito catorce
     veces: catorce copias son catorce sitios donde puede faltar, y el dia que
     falte en una, esa es la que la operadora rechaza. */
  var SALIDA_SMS = ' Responde SALIR para no recibir mas.';
  /* Por voz no se puede «responder SALIR»: se dice a donde llamar. */
  var SALIDA_VOZ = ' Si no desea recibir mas mensajes, comuniquese al {telefono}.';

  /* Cortas, sin tildes y sin emoji, y con sitio para el aviso de salida: todo
     junto tiene que caber en UNA sola pieza de SMS.

     EMPIEZAN CON EL NOMBRE DE LA CASA, y eso no es estilo. En Colombia NO se
     pueden usar remitentes con letras —la tabla de cobertura de Infobip dice
     «Alphanumeric Senders Supported: LOCAL No, INTERNATIONAL No»—, asi que el
     cliente NO ve «Tu Garantia» como remitente: ve un codigo corto de numeros.
     Si el texto no dice quien escribe en las primeras palabras, el mensaje es
     un numero desconocido pidiendo plata, y se borra sin leer.

     Ninguna pregunta por que no pago (Ley 2300, art. 7) ni nombra a nadie mas
     que al deudor (art. 4). */
  var SMS = {
    venceHoy: 'Tu Garantia: {nombre}, hoy vence tu pago de {saldo}. ' +
              'Escribenos al {telefono}.',
    moraTemprana: 'Tu Garantia: {nombre}, tu pago de {saldo} quedo pendiente el ' +
              '{fecha_pago}. Escribenos al {telefono}.',
    mora: 'Tu Garantia: {nombre}, tu pago de {saldo} sigue pendiente. ' +
              'Escribenos al {telefono} y buscamos un acuerdo.',
    recordatorio1: 'Tu Garantia: {nombre}, te recordamos tu pago de {saldo} el ' +
              '{fecha_pago}. Escribenos al {telefono}.',
    recordatorio2: 'Tu Garantia: {nombre}, te recordamos tu pago de {saldo} el ' +
              '{fecha_pago}. Escribenos al {telefono}.',

    /* CUANDO DEBE VARIOS CREDITOS — pedido de Joan el 15-sep-2026: «que pueda
       seleccionar la informacion de lo que debe en total con todos los
       creditos».

       No es un lujo: la Ley 2300 obliga a UN contacto por persona, asi que a
       quien tiene tres creditos vencidos se le escribe UNA vez. Si ese unico
       mensaje habla de un solo credito, el cliente paga ese, cree que quedo al
       dia, y a la semana siguiente recibe otro cobro que no entiende. El
       mensaje tiene que decir la verdad completa o no sirve.

       Se dice cuantos son y cuanto suman, en ese orden: el numero explica la
       cifra, y sin el la cifra parece un error. */
    variasHoy: 'Tu Garantia: {nombre}, tus {cuantos} pagos pendientes suman ' +
              '{saldo}. Escribenos al {telefono}.',
    variasMora: 'Tu Garantia: {nombre}, tus {cuantos} pagos vencidos suman ' +
              '{saldo}. Escribenos al {telefono} y buscamos un acuerdo.',

    /* --- VENTA. No hablan de plata, y es la razon de que existan --- 15-sep-2026.
       El asesor puede mandarle un SMS a un PROSPECTO, que no debe nada. Con solo
       plantillas de cobro, al prospecto le salia «te recordamos tu pago de $0
       el .» — con el monto en cero y la fecha vacia. Lo cazo abrir el CRM en un
       navegador y mirar lo que de verdad se armaba.
       Un cobro de cero pesos a alguien que no debe nada no es un mensaje raro:
       es la casa quedando como que no sabe con quien habla. */
    presentacion: 'Tu Garantia: {nombre}, soy tu asesor. Te cuento como funciona ' +
              'nuestro credito: escribeme al {telefono}.',
    invitacion: 'Tu Garantia: {nombre}, pide tu credito desde el celular. ' +
              'Abre tu cuenta: {enlace}'
  };

  /* La voz va mas lenta y mas simple: la escucha una persona una sola vez y no
     puede volver atras. El monto en palabras y el nombre de la casa al frente. */
  var VOZ = {
    venceHoy: 'Hola {nombre}. Le saludamos de Tu Garantia. Le recordamos que hoy ' +
              'vence su pago de {saldo_hablado}. Si necesita mas plazo, escribanos ' +
              'al {telefono}.',
    moraTemprana: 'Hola {nombre}. Le saludamos de Tu Garantia. Su pago de {saldo_hablado} ' +
              'quedo pendiente el {fecha_pago}. Escribanos al {telefono} y lo organizamos.',
    mora: 'Hola {nombre}. Le saludamos de Tu Garantia. Su pago de {saldo_hablado} sigue ' +
              'pendiente. Queremos ayudarle a resolverlo. Escribanos al {telefono}.',
    recordatorio1: 'Hola {nombre}. Le saludamos de Tu Garantia. Le recordamos su pago de ' +
              '{saldo_hablado} el {fecha_pago}. Cualquier cosa, escribanos al {telefono}.',
    recordatorio2: 'Hola {nombre}. Le saludamos de Tu Garantia. Le recordamos su pago de ' +
              '{saldo_hablado} el {fecha_pago}. Cualquier cosa, escribanos al {telefono}.',
    variasHoy: 'Hola {nombre}. Le saludamos de Tu Garantia. Tiene {cuantos} pagos ' +
              'pendientes que suman {saldo_hablado}. Escribanos al {telefono} y lo organizamos.',
    variasMora: 'Hola {nombre}. Le saludamos de Tu Garantia. Tiene {cuantos} pagos ' +
              'vencidos que suman {saldo_hablado}. Escribanos al {telefono} y buscamos un acuerdo.',
    presentacion: 'Hola {nombre}. Le saludamos de Tu Garantia. Le llamamos para contarle ' +
              'como funciona nuestro credito. Puede escribirnos al {telefono}.',
    invitacion: 'Hola {nombre}. Le saludamos de Tu Garantia. Ya puede pedir su credito desde ' +
              'el celular. Escribanos al {telefono} y le contamos como.'
  };

  /* Que plantilla toca. Si el socio debe mas de un credito manda la de VARIOS:
     el mensaje unico que permite la ley tiene que hablar de todo lo que debe,
     no del primero de la lista. */
  function plantillaDe(caso) {
    var cuantos = Math.max(1, num(caso && caso.cuantos) || 1);
    var clave = texto(caso && caso.plantilla) || 'venceHoy';
    /* Las de VENTA no se convierten: un prospecto no tiene «tres pagos». */
    if (clave === 'presentacion' || clave === 'invitacion') return clave;
    if (cuantos > 1) {
      return (clave === 'mora' || clave === 'moraTemprana') ? 'variasMora' : 'variasHoy';
    }
    return clave;
  }

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
   * @param op     {telefono, sinSMS:[celular], plantillas:{sms,voz}}
   * @returns {{filas:Array, sinTelefono:Array, caros:Array}}
   */
  /* Los textos de la casa, pisados solo donde Joan escribio algo suyo. Un texto
     vacio NO cuenta como escrito: borrar el contenido de una plantilla en el
     editor tiene que devolver la de la casa, no dejar al cliente sin mensaje. */
  function mezclar(base, propias) {
    var r = {};
    Object.keys(base).forEach(function (k) { r[k] = base[k]; });
    Object.keys(propias || {}).forEach(function (k) {
      var v = texto(propias[k]).trim();
      if (v) r[k] = v;
    });
    return r;
  }

  function filasDeEnvio(casos, op) {
    var o = op || {};
    var tel = texto(o.telefono);
    /* 16-sep-2026 — LAS PLANTILLAS PROPIAS SE MEZCLAN, NO REEMPLAZAN.
       Esto decia `(o.plantillas && o.plantillas.sms) || SMS`, o sea que un mapa
       a medias reemplazaba los NUEVE textos de una. Y como el respaldo de abajo
       es `pSMS[clave] || pSMS.venceHoy`, si faltaba la clave Y faltaba venceHoy,
       al cliente le llegaba literalmente:
           «undefined Responde SALIR para no recibir mas.»
       Corrido antes de cambiarlo. Y se paga igual que cualquier otro SMS.
       Mezclando, lo que Joan escriba pisa solo lo que escribio; lo demas sigue
       siendo el texto de la casa, que ya esta medido y sin tildes. */
    var pSMS = mezclar(SMS, o.plantillas && o.plantillas.sms);
    var pVOZ = mezclar(VOZ, o.plantillas && o.plantillas.voz);

    var filas = [], sinTelefono = [], caros = [], salidos = [];

    /* QUIENES DIJERON «SALIR». El aviso de salida no sirve de nada si el que lo
       usa vuelve a entrar a la lista el mes siguiente: seria pedirle permiso a
       alguien y desoirlo por escrito. Se comparan los diez digitos, no el texto
       del campo, porque el mismo numero esta escrito de cinco formas distintas
       en una cartera vieja. */
    var fuera = {};
    (o.sinSMS || []).forEach(function (v) {
      var d = celular10(typeof v === 'string' ? v : (v && (v.celular || v.telefono)));
      if (d) fuera[d] = true;
    });

    (casos || []).forEach(function (c) {
      var cel = celular10(c.telefono);
      if (!cel) { sinTelefono.push(c); return; }
      if (fuera[cel]) { salidos.push(c); return; }

      var clave = plantillaDe(c);
      /* EL TOTAL MANDA CUANDO HAY VARIOS. `saldo_total` lo calcula quien arma
         los casos (el CRM, sumando los creditos del socio); si no viene, se usa
         el del credito, que es lo correcto cuando solo hay uno. */
      var cuantos = Math.max(1, num(c.cuantos) || 1);
      var monto = cuantos > 1 && c.saldo_total != null ? num(c.saldo_total) : num(c.saldo);
      var vars = {
        nombre: primerNombre(c.nombre),
        saldo: montoEscrito(monto),
        saldo_hablado: montoHablado(monto),
        fecha_pago: fechaCorta(c.fecha_pago),
        cuantos: String(cuantos),
        enlace: texto(o.enlace) || 'https://tugarantia.net/play/',
        telefono: tel
      };
      var sms = sinTildes(aplicar((pSMS[clave] || pSMS.venceHoy) + SALIDA_SMS, vars));
      var voz = aplicar((pVOZ[clave] || pVOZ.venceHoy) + SALIDA_VOZ, vars);
      var med = pedazosSMS(sms);
      if (med.pedazos > 1) caros.push({ caso: c, medida: med });

      filas.push({
        celular: cel,
        celular_57: '57' + cel,
        nombre: primerNombre(c.nombre),
        nombre_completo: sinTildes(c.nombre),
        monto: Math.round(monto),
        monto_texto: montoEscrito(monto),
        monto_hablado: montoHablado(monto),
        creditos: cuantos,
        fecha_pago: texto(c.fecha_pago).slice(0, 10),
        plantilla: clave,
        mensaje_sms: sms,
        mensaje_voz: voz,
        pedazos_sms: med.pedazos,
        /* 16-sep-2026 — DE QUIEN ES ESTA FILA. Hasta hoy la fila solo llevaba el
           celular, y el CRM tenia que volver a buscar al socio por telefono para
           cualquier cosa. Esa busqueda FALLA en silencio con quien tiene el
           WhatsApp en otro numero: el mensaje se manda a waNum(socio) pero la
           busqueda compara contra socio.telefono, no empareja, y el contacto no
           se anota. O sea que a esa persona la reja de la Ley 2300 la deja
           recibir otro mensaje la misma semana.
           El id no entra al CSV: COLUMNAS lo proyecta aparte, a proposito. */
        socio_id: texto(c.socioId),
        credito_id: texto(c.id)
      });
    });

    return { filas: filas, sinTelefono: sinTelefono, caros: caros, salidos: salidos };
  }

  /* ==========================================================================
   * QUIEN PIDIO NO RECIBIR — y por que no basta con mirar un numero
   *
   * La salida (opt-out) es obligatoria en Colombia: quien responde SALIR no
   * puede volver a recibir. El CRM marcaba al socio con `noSMS` y despues
   * armaba la lista de excluidos leyendo SOLO `socio.telefono`.
   *
   * El problema: el mensaje NO se manda a `telefono`, se manda a `waNum(socio)`,
   * que para quien tiene el WhatsApp en otro numero es `whatsappNumero`. Asi
   * que a esa persona se le seguia escribiendo despues de haber pedido salir,
   * porque el numero al que le llegaba nunca estuvo en la lista de excluidos.
   *
   * Se guardan LOS DOS numeros. Si alguno de los dos dijo basta, es la persona
   * la que dijo basta — no una de sus lineas.
   * ======================================================================== */
  function numerosQueSalieron(socios) {
    var fuera = [];
    (Array.isArray(socios) ? socios : []).forEach(function (s) {
      if (!s || !s.noSMS) return;
      [s.telefono, s.whatsappNumero].forEach(function (n) {
        var d = celular10(n);
        if (d && fuera.indexOf(d) < 0) fuera.push(d);
      });
    });
    return fuera;
  }

  /* ==========================================================================
   * LO QUE HAY QUE ANOTAR DESPUES DE MANDAR
   *
   * Una gestion por fila, emparejada por `socio_id` y NUNCA por telefono. El
   * CRM lo hacia por telefono y se tragaba en silencio a todo el que tuviera el
   * WhatsApp en otro numero (un `if (!s) return;` mudo): esos contactos no
   * quedaban escritos, y la reja de la semana no los contaba.
   *
   * No adivina nada ni decide a quien escribirle: traduce filas a renglones.
   * ======================================================================== */
  function gestionesDeEnvio(filas, canal, ahoraISO, hoy) {
    var c = canal === 'voz' ? 'voz' : 'sms';
    return (Array.isArray(filas) ? filas : []).map(function (f) {
      return {
        socio_id: texto(f && f.socio_id),
        gestion: {
          fecha: texto(hoy),
          hora: texto(ahoraISO),
          canal: c,
          plantilla: texto(f && f.plantilla),
          tipo: 'cobro',
          grupo: 'cobranzas',
          origen: 'crm'
        }
      };
    });
  }

  /* ------------------------------------------------------------- el CSV */

  var COLUMNAS = ['celular', 'celular_57', 'nombre', 'nombre_completo', 'monto',
                  'monto_texto', 'monto_hablado', 'creditos', 'fecha_pago', 'plantilla',
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
    SALIDA_SMS: SALIDA_SMS,
    SALIDA_VOZ: SALIDA_VOZ,
    aplicar: aplicar,
    plantillaDe: plantillaDe,
    primerNombre: primerNombre,
    fechaCorta: fechaCorta,
    /* el archivo */
    COLUMNAS: COLUMNAS,
    filasDeEnvio: filasDeEnvio,
    aCSV: aCSV,
    /* la salida y el rastro */
    numerosQueSalieron: numerosQueSalieron,
    gestionesDeEnvio: gestionesDeEnvio
  };
}));
