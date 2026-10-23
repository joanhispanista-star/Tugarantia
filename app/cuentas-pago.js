/* ============================================================================
 * DÓNDE RECIBE LA PLATA EL CLIENTE — 22 de octubre de 2026
 *
 * Joan: «al momento de que el cliente se registra no se le pregunta sobre la
 * información bancaria; quiero que esté la opción de cuenta bancaria y que
 * estén plataformas digitales y que deje las opciones de Nequi, Daviplata, y
 * un espacio para la llave de Bre-B […] Y al momento de que el cliente acepte
 * la contrapropuesta, que se le pregunte nuevamente a qué cuenta desea que le
 * consignen; recomendemos que sea por billeteras digitales ya que es más
 * rápido».
 *
 * Las reglas viven aquí, puras y sin pantalla, porque las usan tres páginas:
 * el registro (play/, paso «¿Dónde te enviamos la plata?»), la aceptación de
 * la propuesta (play/ y platachat/) y el CRM de Joan («Consignar a: …»). Si
 * cada una validara por su lado, el teléfono aceptaría una llave que el CRM no
 * sabe leer. Y la base repite las mismas reglas
 * (base/20261022b_destino_del_desembolso.sql, destino_desembolso_limpio): el
 * teléfono lo controla quien lo tiene en la mano.
 *
 * LO QUE ESTE ARCHIVO NO HACE, Y POR ESO NADIE PUEDE DECIRLO EN PANTALLA:
 *   · No comprueba que la cuenta sea del cliente. Nadie fuera de las
 *     entidades de Bre-B puede consultar una llave (no hay API pública). La
 *     única verificación es la del banco de quien paga: antes de confirmar le
 *     muestra el nombre del titular enmascarado («AnXXXa PXXez»). Joan lo
 *     compara con la cédula al girar. Por eso la casilla «Son mías, a mi
 *     nombre»: es la palabra del cliente, y se guarda como tal.
 *   · No sabe si una llave Bre-B sigue viva: el dueño la puede cambiar,
 *     portar o cancelar. Se guarda para ESTE crédito, no como dato eterno.
 *
 * LOS FORMATOS DE LA LLAVE BRE-B son los del Banco de la República (Circular
 * DSP-465, numeral 3.4.2 y Cuadro 1, tal como los reproduce el proyecto
 * PR-DSP-008 del 2-oct-2026, y coinciden con la página de Nequi):
 *   · celular: 10 números, empieza por 3;
 *   · documento: hasta 18 letras o números, sin guiones, espacios ni puntos;
 *   · correo: hasta 30 caracteres antes de la @ y 61 después (QUÉ caracteres
 *     se permiten no está publicado: se revisa la forma y nada más);
 *   · alfanumérica: @ y de 5 a 20 letras o números, sin tildes ni ñ. LA DA EL
 *     BANCO, no la inventa el cliente: la pantalla dice «cópiala tal cual».
 * Lo que NUNCA se escribe en pantalla: «registra tu llave» ni un enlace para
 * «recibir un pago Bre-B». Es, palabra por palabra, el lenguaje del fraude
 * que el Banco de la República y Nequi tienen alertado.
 *
 * LA CUENTA DE BANCO: el banco de la lista (app/bancos-colombia.js) o «Otro»
 * con su nombre escrito, el tipo (ahorros o corriente) y el número, solo
 * números, de 6 a 20. No hay regla por banco: no hay una fuente que las
 * publique, y una inventada rechazaría cuentas buenas.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./bancos-colombia.js'));
  } else {
    /* Si app/bancos-colombia.js no llegó (una caché vieja sin señal), la lista
       de bancos sale vacía y queda solo «Otro»: la persona escribe el nombre. */
    raiz.CuentasPago = fabrica(raiz.BancosColombia || null);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';

  /* Las billeteras y la llave primero: llegan en segundos (Bre-B mide 20
     segundos de punta a punta, todos los días y a toda hora). Una cuenta de
     banco por número va por otro carril y puede tardar más; cuánto, depende
     del banco de quien gira, y por eso no se promete una hora. */
  var MEDIOS = [
    { id: 'nequi', nombre: 'Nequi', rapido: true },
    { id: 'daviplata', nombre: 'Daviplata', rapido: true },
    { id: 'breb', nombre: 'Llave Bre-B', rapido: true },
    { id: 'banco', nombre: 'Cuenta de banco', rapido: false }
  ];
  var TIPOS_DE_CUENTA = ['Ahorros', 'Corriente'];

  /* Lo que viaja en los datos del registro (p_datos de registrar_abierto),
     planos porque la base solo guarda pares de texto. Ocho llaves: con los 26
     campos del formulario, la verificación y la versión de la política son
     36 de las 40 que la base acepta (pruebas/cuentas-pago.test.js lo cuenta);
     37 con el sello de abajo (LLAVE_SELLO, que no es un dato de pago). */
  var LLAVES_DEL_REGISTRO = ['nequi', 'daviplata', 'llave_breb', 'banco', 'banco_codigo',
                             'banco_tipo', 'banco_numero', 'cuentas_mias'];

  /* 22-oct-2026 — EL SELLO DEL REGISTRO. Al aceptar, la pantalla no puede leer
     las cuentas de la solicitud: mi_solicitud le quita `datos` desde el 7-oct
     (base/20261007c_una_puerta_cierres.sql), y a propósito, porque esos datos
     los escribió una puerta SIN sesión (registrar_abierto) y pueden ser de otra
     persona (el riesgo D2 de base/20261020_la_cedula_de_la_cuenta.sql: quien
     sabe el celular de María escribe primero su fila, con SU Nequi). Ofrecerle
     a María «Nequi ···1234 · Recomendado» con el Nequi de otro sería mandar la
     plata adonde ella no la pidió.
     Por eso un sello: 32 letras al azar que nacen en ESTE teléfono al pasar el
     paso, viajan en los datos del registro (a la bandeja) Y en la cuenta (el
     signup, dentro de `vinculacion`; no es un dato de pago, sinDatosDePago lo
     deja pasar). base/20261022c_las_cuentas_del_registro.sql
     (mis_cuentas_de_pago) devuelve las cuentas solo si el sello de la
     solicitud es el de la cuenta que pregunta: es decir, si la fila la
     escribió el mismo registro que abrió esa cuenta. El de un tercero no lo
     trae, y entonces se pregunta «Escribe tu cuenta», como si no hubiera
     ninguna. Sin crypto (un navegador muy viejo) no hay sello, y pasa lo
     mismo: nunca se inventa uno adivinable. */
  var LLAVE_SELLO = 'cuentas_sello';
  function selloNuevo() {
    var c = (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') ? crypto : null;
    if (!c) return '';
    var b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  var TEXTO_RAPIDO = 'Recomendado · llega más rápido';
  var TEXTO_LENTO = 'Puede tardar más';
  var TEXTO_A_TU_NOMBRE = 'Solo consignamos a cuentas a tu nombre.';
  var TEXTO_SON_MIAS = 'Son mías, a mi nombre';
  var TEXTO_ES_MIA = 'Es mía, a mi nombre';
  /* 22-oct-2026 — la salida del desplegable «Banco» en el registro (ver
     opcionesDeBancoHTML). */
  var TEXTO_SIN_BANCO = 'Sin cuenta de banco';

  function texto(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function medio(id) {
    for (var i = 0; i < MEDIOS.length; i++) if (MEDIOS[i].id === id) return MEDIOS[i];
    return null;
  }

  /* ---------------------------------------------------------------- celular
     Nequi y Daviplata son un número de celular. Se perdona el +57, los
     espacios y los guiones, como en el resto de la app. */
  function celularDe(t) {
    var d = String(t == null ? '' : t).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return /^3\d{9}$/.test(d) ? d : '';
  }
  function revisarCelular(nombre, t) {
    if (!texto(t)) return { ok: false, vacio: true, motivo: 'Escribe el celular de tu ' + nombre + '.' };
    var n = celularDe(t);
    if (!n) return { ok: false, motivo: 'Revisa el celular de tu ' + nombre + ': son 10 números y empiezan por 3.' };
    return { ok: true, numero: n };
  }

  /* --------------------------------------------------------- la llave Bre-B */
  function revisarLlaveBreb(t) {
    var s = texto(t);
    if (!s) return { ok: false, vacio: true, motivo: 'Escribe tu llave Bre-B.' };
    if (s.charAt(0) === '@') {
      if (/^@[A-Za-z0-9]{5,20}$/.test(s)) return { ok: true, llave: s, clase: 'alfanumerica' };
      return { ok: false, motivo: 'Las llaves que empiezan con @ llevan de 5 a 20 letras o números después de la @, ' +
        'sin espacios, tildes ni ñ. Cópiala tal cual de la app de tu banco o billetera.' };
    }
    if (s.indexOf('@') > 0) {
      var p = s.split('@');
      if (p.length === 2 && !/\s/.test(s) && p[0].length >= 1 && p[0].length <= 30 &&
          p[1].length >= 3 && p[1].length <= 61 && p[1].indexOf('.') > 0) {
        return { ok: true, llave: s, clase: 'correo' };
      }
      return { ok: false, motivo: 'Esa llave de correo no parece completa: revisa la @ y lo que va después, como nombre@gmail.com.' };
    }
    /* Celular o documento. La llave no lleva espacios, puntos ni guiones: si
       la persona los escribió (como se dicta una cédula), se quitan. El +57 se
       quita solo si viene con el «+»: sin él, doce números pueden ser un
       documento. */
    var c = s.replace(/[\s.\-]/g, '');
    if (/^\+573\d{9}$/.test(c)) c = c.slice(3);
    if (/^[A-Za-z0-9]{1,18}$/.test(c)) return { ok: true, llave: c, clase: /^3\d{9}$/.test(c) ? 'celular' : 'documento' };
    return { ok: false, motivo: 'Tu llave puede ser tu celular (10 números que empiezan por 3), tu número de documento, ' +
      'tu correo o una llave que empieza con @. Escríbela tal como te la muestra tu banco.' };
  }

  /* ------------------------------------------------------ la cuenta de banco */
  function revisarNumeroDeCuenta(t) {
    var s = String(t == null ? '' : t).replace(/[\s.\-]/g, '');
    if (!s) return { ok: false, vacio: true, motivo: 'Escribe el número de tu cuenta.' };
    if (!/^\d+$/.test(s)) return { ok: false, motivo: 'El número de la cuenta lleva solo números.' };
    if (s.length < 6 || s.length > 20) return { ok: false, motivo: 'Revisa el número de tu cuenta: tiene entre 6 y 20 números.' };
    return { ok: true, numero: s };
  }
  function bancos() {
    var l = (B && B.paraElegir) ? B.paraElegir() : [];
    if (!l.length || l[l.length - 1].codigo !== 'otro') l.push({ nombre: 'Otro', codigo: 'otro' });
    return l;
  }
  function bancoPorCodigo(codigo) {
    var c = texto(codigo), l = bancos();
    for (var i = 0; i < l.length; i++) if (l[i].codigo === c) return l[i];
    return null;
  }
  /** El banco ya resuelto: el de la lista por su código, o «Otro» con el
   *  nombre escrito. {ok, banco, banco_codigo, motivo}. */
  function revisarBanco(codigo, nombreEscrito) {
    var b = bancoPorCodigo(codigo);
    if (!b) return { ok: false, vacio: !texto(codigo), motivo: 'Elige tu banco de la lista.' };
    if (b.codigo !== 'otro') return { ok: true, banco: b.nombre, banco_codigo: b.codigo };
    var n = texto(nombreEscrito).replace(/\s+/g, ' ').slice(0, 60);
    if (n.length < 2) return { ok: false, motivo: 'Escribe el nombre de tu banco o cooperativa.' };
    return { ok: true, banco: n, banco_codigo: 'otro' };
  }
  function revisarCuentaDeBanco(d) {
    var e = {};
    var b = revisarBanco(d.banco_codigo, d.banco);
    if (!b.ok) e.banco = b.motivo;
    if (TIPOS_DE_CUENTA.indexOf(texto(d.banco_tipo)) === -1) e.banco_tipo = 'Elige si tu cuenta es de ahorros o corriente.';
    var n = revisarNumeroDeCuenta(d.banco_numero);
    if (!n.ok) e.banco_numero = n.motivo;
    if (Object.keys(e).length) return { ok: false, errores: e };
    return { ok: true, banco: b.banco, banco_codigo: b.banco_codigo, banco_tipo: texto(d.banco_tipo), numero: n.numero };
  }

  /* ============================================================ EL REGISTRO */

  /** ¿Empezó a llenar la cuenta de banco? El banco o el número bastan para
   *  exigir lo demás. El tipo solo no: es un desplegable que se toca sin
   *  querer, y por él no se le pide una cuenta a quien dio su Nequi. */
  function tocoElBanco(d) {
    return !!(texto(d.banco_codigo) || texto(d.banco_numero));
  }

  /**
   * Lo que dio en el paso «¿Dónde te enviamos la plata?». Puede dar varias a la
   * vez; al menos una tiene que estar completa, y todas a su nombre.
   * @returns {object} {ok, cuantas, errores:[{id, motivo}]}
   */
  function revisarCuentasDelRegistro(datos) {
    var d = datos || {}, errores = [], cuantas = 0;
    if (texto(d.nequi)) {
      var n = revisarCelular('Nequi', d.nequi);
      if (n.ok) cuantas++; else errores.push({ id: 'nequi', motivo: n.motivo });
    }
    if (texto(d.daviplata)) {
      var v = revisarCelular('Daviplata', d.daviplata);
      if (v.ok) cuantas++; else errores.push({ id: 'daviplata', motivo: v.motivo });
    }
    if (texto(d.llave_breb)) {
      var l = revisarLlaveBreb(d.llave_breb);
      if (l.ok) cuantas++; else errores.push({ id: 'llave_breb', motivo: l.motivo });
    }
    if (tocoElBanco(d)) {
      var b = revisarCuentaDeBanco(d);
      if (b.ok) cuantas++;
      else {
        /* 22-oct-2026 — Y SE DICE POR DÓNDE SE SALE. Quien solo tiene Nequi
           abre «Banco» a buscarlo (no está: va arriba, aparte) y toca uno; sin
           esta frase leía «Elige si tu cuenta es de ahorros o corriente» de
           una cuenta que no tiene, y no sabía que podía soltarla. Si el
           banco ya está en «Sin cuenta de banco» y lo que quedó es un número,
           volver a elegirlo no hace nada (el desplegable no cambia): ahí la
           salida es borrar el número, y eso es lo que se dice. */
        var salida = texto(d.banco_codigo)
          ? ' Si no vas a dar cuenta de banco, en «Banco» elige «' + TEXTO_SIN_BANCO + '».'
          : ' Si no vas a dar cuenta de banco, borra el número de cuenta.';
        var primero = true;
        Object.keys(b.errores).forEach(function (k) {
          errores.push({ id: k, motivo: b.errores[k] + (primero ? salida : '') });
          primero = false;
        });
      }
    }
    if (!errores.length && !cuantas) {
      errores.push({ id: 'cuentas', motivo: 'Danos al menos una: tu Nequi, tu Daviplata, tu llave Bre-B o una cuenta de banco.' });
    }
    if (!errores.length && d.cuentas_mias !== 'si') {
      errores.push({ id: 'cuentas_mias', motivo: 'Marca la casilla «' + TEXTO_SON_MIAS + '»: solo consignamos a cuentas tuyas.' });
    }
    return { ok: errores.length === 0, cuantas: cuantas, errores: errores };
  }

  /** Las ocho llaves, ya limpias, para guardar en el borrador y mandar. Lo que
   *  está vacío o mal no se escribe: el paso no deja pasar con algo mal, y un
   *  dato a medias no le sirve a nadie en el CRM. */
  function cuentasLimpias(datos) {
    var d = datos || {}, out = {};
    var n = celularDe(d.nequi); if (n) out.nequi = n;
    var v = celularDe(d.daviplata); if (v) out.daviplata = v;
    var l = revisarLlaveBreb(d.llave_breb); if (l.ok) out.llave_breb = l.llave;
    if (tocoElBanco(d)) {
      var b = revisarCuentaDeBanco(d);
      if (b.ok) {
        out.banco = b.banco; out.banco_codigo = b.banco_codigo;
        out.banco_tipo = b.banco_tipo; out.banco_numero = b.numero;
      }
    }
    if (d.cuentas_mias === 'si') out.cuentas_mias = 'si';
    return out;
  }

  /** Una copia SIN los datos de pago. Es lo que viaja en la cuenta (el signup):
   *  lo que va ahí termina dentro de la sesión, y la sesión se guarda en el
   *  teléfono. Los datos de pago van solo a la bandeja (la tabla de registros).
   *  23-oct-2026 — esa bandeja ya no es solo de Joan: de SUS clientes la lee
   *  también su equipo (ficha_de_mi_base, gerente_registros), porque Joan
   *  decidió «pueden ver todo, está autorizado». Al teléfono, igual, no van. */
  function sinDatosDePago(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (LLAVES_DEL_REGISTRO.indexOf(k) === -1) out[k] = obj[k];
    });
    return out;
  }

  /* ========================================================= LA ACEPTACIÓN */

  /**
   * Las formas que dio al registrarse, en el orden en que se recomiendan:
   * billeteras y llave primero, la cuenta de banco después. Solo si dijo que
   * son suyas: sin esa casilla no se le ofrecen.
   * 22-oct-2026 — `datos` son las `cuentas` que contesta mis_cuentas_de_pago
   * (ver LLAVE_SELLO), NO solicitud.datos: ese campo la base no se lo manda al
   * teléfono desde el 7-oct, y leerlo dejaba esta lista siempre vacía.
   */
  function opcionesDeDestino(datos) {
    var d = datos || {}, out = [];
    if (d.cuentas_mias !== 'si') return out;
    var n = celularDe(d.nequi); if (n) out.push({ medio: 'nequi', numero: n, es_mia: true });
    var v = celularDe(d.daviplata); if (v) out.push({ medio: 'daviplata', numero: v, es_mia: true });
    var l = revisarLlaveBreb(d.llave_breb); if (texto(d.llave_breb) && l.ok) out.push({ medio: 'breb', llave: l.llave, es_mia: true });
    if (tocoElBanco(d)) {
      var b = revisarCuentaDeBanco(d);
      if (b.ok) out.push({ medio: 'banco', banco: b.banco, banco_codigo: b.banco_codigo, banco_tipo: b.banco_tipo, numero: b.numero, es_mia: true });
    }
    return out;
  }

  /**
   * El destino que viaja con la aceptación (aceptar_con_destino, p_destino).
   * Las mismas reglas que destino_desembolso_limpio en la base.
   * @returns {object} {ok, destino, motivo}
   */
  function revisarDestino(x) {
    var d = x || {};
    var m = medio(d.medio);
    if (!m) return { ok: false, motivo: 'Elige por dónde quieres recibir la plata.' };
    var limpio;
    if (m.id === 'nequi' || m.id === 'daviplata') {
      var c = revisarCelular(m.nombre, d.numero);
      if (!c.ok) return { ok: false, motivo: c.motivo };
      limpio = { medio: m.id, numero: c.numero };
    } else if (m.id === 'breb') {
      var l = revisarLlaveBreb(d.llave);
      if (!l.ok) return { ok: false, motivo: l.motivo };
      limpio = { medio: 'breb', llave: l.llave };
    } else {
      var b = revisarCuentaDeBanco({ banco_codigo: d.banco_codigo, banco: d.banco, banco_tipo: d.banco_tipo, banco_numero: d.numero });
      if (!b.ok) {
        var k = Object.keys(b.errores);
        return { ok: false, motivo: b.errores[k[0]] };
      }
      limpio = { medio: 'banco', banco: b.banco, banco_codigo: b.banco_codigo, banco_tipo: b.banco_tipo, numero: b.numero };
    }
    if (d.es_mia !== true) return { ok: false, motivo: 'Marca la casilla «' + TEXTO_ES_MIA + '»: solo consignamos a cuentas tuyas.' };
    limpio.es_mia = true;
    return { ok: true, destino: limpio };
  }

  /* ============================================================ EN PALABRAS */

  function ultimos(t, n) {
    var s = String(t == null ? '' : t);
    return s.length > (n || 4) ? '···' + s.slice(-(n || 4)) : s;
  }
  function celularBonito(n) {
    var c = celularDe(n);
    return c ? c.slice(0, 3) + ' ' + c.slice(3, 6) + ' ' + c.slice(6) : String(n || '');
  }
  /** «Nequi ···2233» o, con `completo`, «Nequi 300 111 2233». El completo es
   *  para Joan, que va a consignar; en la pantalla del cliente basta el final. */
  function describirDestino(x, completo) {
    var d = x || {};
    if (d.medio === 'nequi' || d.medio === 'daviplata') {
      return medio(d.medio).nombre + ' ' + (completo ? celularBonito(d.numero) : ultimos(d.numero));
    }
    if (d.medio === 'breb') return 'Llave Bre-B ' + (completo ? String(d.llave || '') : ultimos(d.llave));
    if (d.medio === 'banco') {
      return String(d.banco || 'Banco') + ' · ' + String(d.banco_tipo || '').toLowerCase() + ' ' +
        (completo ? String(d.numero || '') : ultimos(d.numero));
    }
    return '';
  }
  /** Lo que Joan pega en su app para consignar: el número o la llave, solos. */
  function numeroDe(x) {
    var d = x || {};
    return String(d.medio === 'breb' ? (d.llave || '') : (d.numero || ''));
  }
  function esRapido(x) { var m = medio(x && x.medio); return !!(m && m.rapido); }

  /* ============================================== LA PREGUNTA, AL ACEPTAR
     La pintan play/ y platachat/ con sus propias hojas (las clases cp-*), y
     los manejadores son de cada página: el estado de la elección vive allá,
     fuera del DOM, porque PlataChat repinta la tarjeta con su latido.
     `cfg`: { opciones, estado: {eleccion, otra:{…}}, prefijo, alElegir,
     alMedio, alEscribir, error } */
  /* 22-oct-2026 — `sinCuenta`: EL REGISTRO TIENE POR DÓNDE SALIR. Con la
     primera opción «disabled hidden», quien tocaba un banco no podía volver a
     «ninguno» (el navegador no deja elegir una opción apagada), y tocoElBanco
     le exigía una cuenta entera: con su Nequi bueno, se quedaba trabado en el
     paso, o inventaba una cuenta (basura que le llega a Joan) o borraba todo
     el registro, cédula incluida. En el registro la cuenta de banco es
     opcional, así que la primera opción se puede elegir y lo dice: «Sin cuenta
     de banco». Al aceptar («Otra cuenta» → «Cuenta de banco») sí hace falta un
     banco, y queda «Toca para elegir». */
  function opcionesDeBancoHTML(seleccionado, sinCuenta) {
    var sel = texto(seleccionado);
    return (sinCuenta
        ? '<option value=""' + (sel ? '' : ' selected') + '>' + esc(TEXTO_SIN_BANCO) + '</option>'
        : '<option value="" disabled hidden' + (sel ? '' : ' selected') + '>Toca para elegir</option>') +
      bancos().map(function (b) {
        return '<option value="' + esc(b.codigo) + '"' + (sel === b.codigo ? ' selected' : '') + '>' + esc(b.nombre) + '</option>';
      }).join('');
  }
  function opcionesDeTipoHTML(seleccionado) {
    var sel = texto(seleccionado);
    return '<option value="" disabled hidden' + (sel ? '' : ' selected') + '>Toca para elegir</option>' +
      TIPOS_DE_CUENTA.map(function (t) {
        return '<option value="' + esc(t) + '"' + (sel === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
  }
  function etiquetaDeRapidez(x) {
    return esRapido(x)
      ? '<span class="cp-etq cp-rapido">' + esc(TEXTO_RAPIDO) + '</span>'
      : '<span class="cp-etq">' + esc(TEXTO_LENTO) + '</span>';
  }
  function llamada(fn, args) { return esc(fn + '(' + args.map(function (a) { return JSON.stringify(a); }).join(', ') + ')'); }

  function eleccionHTML(cfg) {
    var c = cfg || {}, op = c.opciones || [], est = c.estado || {}, otra = est.otra || {};
    var px = c.prefijo || 'cp', nombre = px + '_eleccion';
    var elegida = est.eleccion == null ? '' : String(est.eleccion);
    var fila = function (valor, cuerpo) {
      var marcada = elegida === valor;
      return '<label class="cp-opcion' + (marcada ? ' cp-sel' : '') + '">' +
        '<input type="radio" name="' + esc(nombre) + '" value="' + esc(valor) + '"' + (marcada ? ' checked' : '') +
        ' onchange="' + llamada(c.alElegir, [valor]) + '"><span class="cp-txt">' + cuerpo + '</span></label>';
    };
    var h = '<div class="cp-elegir" id="' + esc(px) + '_caja">' +
      '<div class="cp-tit">¿A dónde te consignamos?</div>' +
      '<div class="cp-sub">' + esc(TEXTO_A_TU_NOMBRE) + ' Te recomendamos Nequi, Daviplata o tu llave Bre-B: llegan más rápido.</div>';
    /* 22-oct-2026 — `cargando`: mientras llegan las cuentas del registro
       (mis_cuentas_de_pago) no se pinta ninguna opción. Si se pintara
       «Escribe tu cuenta» y a los dos segundos la lista, la persona que ya
       había tocado y empezado a escribir vería cambiar las opciones bajo el
       dedo. */
    if (c.cargando) {
      h += '<div class="cp-sub cp-cargando">Buscando las cuentas que nos diste…</div>';
      if (c.error) h += '<div class="cp-error">' + esc(c.error) + '</div>';
      return h + '</div>';
    }
    op.forEach(function (o, i) {
      h += fila(String(i), '<b>' + esc(describirDestino(o, false)) + '</b>' + etiquetaDeRapidez(o));
    });
    h += fila('otra', '<b>' + (op.length ? 'Otra cuenta a tu nombre' : 'Escribe tu cuenta') + '</b>');
    if (elegida === 'otra') h += otraHTML(c, px, otra);
    if (c.error) h += '<div class="cp-error">' + esc(c.error) + '</div>';
    return h + '</div>';
  }
  function otraHTML(c, px, o) {
    var m = texto(o.medio);
    var escribe = function (campo) { return ' oninput="' + llamada(c.alEscribir, [campo]).replace(/\)$/, ', this.value)') + '"'; };
    var h = '<div class="cp-otra"><label for="' + esc(px) + '_medio">Por dónde</label>' +
      '<select id="' + esc(px) + '_medio" onchange="' + esc(c.alMedio + '(this.value)') + '">' +
      '<option value="" disabled hidden' + (m ? '' : ' selected') + '>Toca para elegir</option>' +
      MEDIOS.map(function (x) {
        return '<option value="' + x.id + '"' + (m === x.id ? ' selected' : '') + '>' + esc(x.nombre) +
          (x.rapido ? ' · recomendado' : '') + '</option>';
      }).join('') + '</select>';
    if (m === 'nequi' || m === 'daviplata') {
      h += '<label for="' + esc(px) + '_numero">El celular de tu ' + esc(medio(m).nombre) + '</label>' +
        '<input id="' + esc(px) + '_numero" type="tel" inputmode="numeric" autocomplete="off" placeholder="300 111 2233"' +
        escribe('numero') + ' value="' + esc(o.numero || '') + '">';
    } else if (m === 'breb') {
      h += '<label for="' + esc(px) + '_llave">Tu llave Bre-B</label>' +
        '<input id="' + esc(px) + '_llave" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"' +
        ' placeholder="Tu celular, documento, correo o @llave"' + escribe('llave') + ' value="' + esc(o.llave || '') + '">' +
        '<div class="cp-ayuda">Escríbela tal como te la muestra la app de tu banco o billetera.</div>';
    } else if (m === 'banco') {
      h += '<label for="' + esc(px) + '_banco">Banco</label>' +
        '<select id="' + esc(px) + '_banco" onchange="' + esc(c.alEscribir + "('banco_codigo', this.value)") + '">' +
        opcionesDeBancoHTML(o.banco_codigo) + '</select>' +
        (o.banco_codigo === 'otro'
          ? '<label for="' + esc(px) + '_banco_otro">Nombre de tu banco o cooperativa</label>' +
            '<input id="' + esc(px) + '_banco_otro" type="text" maxlength="60" autocomplete="off"' + escribe('banco') +
            ' value="' + esc(o.banco || '') + '">'
          : '') +
        '<label for="' + esc(px) + '_tipo">Tipo de cuenta</label>' +
        '<select id="' + esc(px) + '_tipo" onchange="' + esc(c.alEscribir + "('banco_tipo', this.value)") + '">' +
        opcionesDeTipoHTML(o.banco_tipo) + '</select>' +
        '<label for="' + esc(px) + '_cuenta">Número de cuenta</label>' +
        '<input id="' + esc(px) + '_cuenta" type="text" inputmode="numeric" autocomplete="off"' + escribe('numero') +
        ' value="' + esc(o.numero || '') + '">';
    }
    if (m) {
      h += '<label class="cp-mia" for="' + esc(px) + '_mia"><input type="checkbox" id="' + esc(px) + '_mia"' +
        (o.es_mia === true ? ' checked' : '') + ' onchange="' + esc(c.alEscribir + "('es_mia', this.checked)") + '">' +
        '<span>' + esc(TEXTO_ES_MIA) + '</span></label>';
    }
    return h + '</div>';
  }

  /**
   * La cuenta que eligió para la propuesta que tiene HOY (solicitud.
   * destino_desembolso), o null. La base la sella con la propuesta aceptada
   * (`propuesta` = contrapropuesta.creada_en): si Joan volvió a proponer, la
   * de la vieja no es la de la nueva, y decir «Consignar a: …» con ella sería
   * mandar la plata a donde el cliente no la pidió esta vez.
   */
  function destinoVigente(sol) {
    var d = sol && sol.destino_desembolso;
    if (!d || typeof d !== 'object' || !medio(d.medio)) return null;
    var cp = (sol.contrapropuesta && typeof sol.contrapropuesta === 'object') ? sol.contrapropuesta : {};
    if (d.propuesta != null && String(d.propuesta) !== String(cp.creada_en || '')) return null;
    return d;
  }

  /** De lo que hay en pantalla al destino que se manda. {ok, destino, motivo} */
  function destinoElegido(opciones, estado) {
    var est = estado || {}, op = opciones || [];
    var e = est.eleccion == null ? '' : String(est.eleccion);
    if (e === '') return { ok: false, motivo: 'Elige a dónde te consignamos para seguir.' };
    if (e === 'otra') return revisarDestino(est.otra || {});
    var o = op[Number(e)];
    if (!o) return { ok: false, motivo: 'Elige a dónde te consignamos para seguir.' };
    return revisarDestino(o);
  }

  return {
    MEDIOS: MEDIOS.map(function (m) { return Object.assign({}, m); }),
    TIPOS_DE_CUENTA: TIPOS_DE_CUENTA.slice(),
    LLAVES_DEL_REGISTRO: LLAVES_DEL_REGISTRO.slice(),
    LLAVE_SELLO: LLAVE_SELLO,
    selloNuevo: selloNuevo,
    TEXTO_SIN_BANCO: TEXTO_SIN_BANCO,
    TEXTO_RAPIDO: TEXTO_RAPIDO,
    TEXTO_LENTO: TEXTO_LENTO,
    TEXTO_A_TU_NOMBRE: TEXTO_A_TU_NOMBRE,
    TEXTO_SON_MIAS: TEXTO_SON_MIAS,
    TEXTO_ES_MIA: TEXTO_ES_MIA,
    celularDe: celularDe,
    revisarLlaveBreb: revisarLlaveBreb,
    revisarNumeroDeCuenta: revisarNumeroDeCuenta,
    bancos: bancos,
    bancoPorCodigo: bancoPorCodigo,
    revisarCuentasDelRegistro: revisarCuentasDelRegistro,
    cuentasLimpias: cuentasLimpias,
    sinDatosDePago: sinDatosDePago,
    opcionesDeDestino: opcionesDeDestino,
    revisarDestino: revisarDestino,
    destinoElegido: destinoElegido,
    destinoVigente: destinoVigente,
    describirDestino: describirDestino,
    numeroDe: numeroDe,
    esRapido: esRapido,
    opcionesDeBancoHTML: opcionesDeBancoHTML,
    opcionesDeTipoHTML: opcionesDeTipoHTML,
    eleccionHTML: eleccionHTML
  };
});
