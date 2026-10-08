/* ============================================================================
 * UNA PUERTA — lo que el CRM y el celular de Joan dicen al juntar una cuenta.
 * 7 de octubre de 2026.
 *
 * Joan decidió el 7-oct que el cliente ANTIGUO que se registra no ve su
 * historial hasta que Joan confirme, con UN toque y mirando la revisión
 * automática, que es la misma persona («¿Es la misma persona?»). Nunca solo:
 * la cédula y el celular son datos públicos, y quien registre el número de
 * Adriana no puede ver la deuda de Adriana (Ley 1581, SIC). La reja de verdad
 * está en la nube (base/20261007_una_puerta.sql: vincular_interna); esto son
 * las PALABRAS, en un solo sitio, para que panel/crm.html y panel/espejo.html
 * no digan cosas distintas del mismo toque.
 *
 * 7-oct-2026 (segunda vuelta, después de tres revisiones):
 *   · El toque YA NO PIDE «el WhatsApp con el código V-…»: play/ dejó de
 *     pedirle a nadie que lo mande el 8-sep (play/index.html, «se retiró
 *     verificarPorWhatsApp»); el código nace en el navegador del que se
 *     registra y viaja en sus datos, así que verlo no prueba nada. Lo único
 *     que prueba algo es llamar al número de la FICHA.
 *   · Cuando la cuenta se abrió antes que el registro, o hay un recado de
 *     contraseña abierto, la nube no junta con un toque: pide una clave nueva
 *     al número de la ficha y una hora de espera (claves_nuevas). Estas
 *     palabras lo explican y dicen desde qué hora.
 *   · La nube compara el nombre de la ficha con el de la fila (mismo_nombre):
 *     mismoNombre es la misma regla, para decirlo antes de preguntar.
 *
 * PURO: sin DOM, sin red, sin reloj propio (las fechas llegan de afuera). Los
 * textos que devuelve son TEXTO PLANO: quien los pinta los escapa.
 * Pruebas: pruebas/una-puerta-crm.test.js, pruebas/una-puerta-celular.test.js
 * y pruebas/una-puerta-cierres-crm.test.js.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.UnaPuerta = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* La espera después de una clave nueva: lo que dura un token de Supabase
     (una hora). Ver claves_nuevas en base/20261007_una_puerta.sql. */
  var ESPERA_CLAVE_MS = 3600000;

  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function bonito(cel) {
    var d = digitos(cel).slice(-10);
    return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : (d || '—');
  }
  function hora(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* LA MISMA REGLA QUE public.mismo_nombre (base/20261007_una_puerta.sql):
     sin tildes ni mayúsculas, espacios colapsados, y vale que uno sea el
     comienzo del otro palabra por palabra. Una prueba compara las dos. */
  function nombrePlano(t) {
    var de = 'áàäâéèëêíìïîóòöôúùüûñç', a = 'aaaaeeeeiiiioooouuuunc';
    return String(t == null ? '' : t).toLowerCase().split('').map(function (c) {
      var i = de.indexOf(c); return i >= 0 ? a[i] : c;
    }).join('').replace(/\s+/g, ' ').trim();
  }
  function mismoNombre(x, y) {
    var a = nombrePlano(x), b = nombrePlano(y);
    if (!a || !b) return false;
    return a === b || a.indexOf(b + ' ') === 0 || b.indexOf(a + ' ') === 0;
  }

  /* Lo que contesta vincular_interna cuando dice que no, en palabras de Joan
     y con lo que hay que hacer. Cada motivo es una causa distinta: decirle
     «no se pudo» a todo lo mandaría a reintentar lo que no se arregla
     reintentando. */
  function textoMotivo(j) {
    var m = j && j.motivo;
    if (m === 'sin_cuenta') {
      return 'Ese celular todavía no tiene cuenta en la app (se registró por la invitación vieja, o no terminó ' +
        'de registrarse). No hay qué juntar: cuando entre a la app con «Registrarme», vuelve a tocar.';
    }
    if (m === 'sin_historial_en_la_nube') {
      return 'El historial de esta ficha todavía no está en la nube, así que no hay con qué juntar la cuenta. ' +
        'Espera a que suba solo (la línea de Ajustes lo dice) o toca «☁ Subir historiales», y vuelve a tocar.';
    }
    if (m === 'sin_confirmar') {
      return 'Este computador todavía no subió el historial de esta ficha con su llave de hoy, o la ficha comparte ' +
        'celular o cédula con otra y por eso no sube. Juntar ahora podría unir la cuenta con la fila de otra persona. ' +
        'Toca «☁ Subir historiales» (si dice que no sube por compartir celular, arregla eso primero) y vuelve a tocar.';
    }
    if (m === 'otra_fila') {
      return 'En la nube, la fila de esa llave es de ' + (j.nombre_en_la_nube ? '«' + j.nombre_en_la_nube + '»' : 'otra persona') +
        ', no de esta ficha. Si le cambiaste el nombre hace poco, espera a que suba y vuelve a tocar; si no, es la fila ' +
        'vieja de otra persona con ese celular: juntarla le mostraría a esta cuenta lo de otro.';
    }
    if (m === 'falta_nombre') {
      return 'Esta pantalla es de una versión vieja y no mandó el nombre de la ficha. Recárgala con Ctrl+Shift+R y vuelve a tocar.';
    }
    if (m === 'ficha_con_otra_cuenta') {
      return 'Esta ficha ya está junta con OTRA cuenta' + (j.otro_termina_en ? ' (un celular que termina en ' + j.otro_termina_en + ')' : '') +
        '. Si esa unión fue un error, deshazla primero en «🔗 Cuentas juntas».';
    }
    if (m === 'telefono_con_otra_ficha') {
      return 'Ese celular ya está junto con OTRA ficha. Un teléfono solo puede ver una ficha: si es un familiar ' +
        'que comparte el celular, necesita registrarse con el suyo. Si fue un error, deshaz la otra unión primero.';
    }
    if (m === 'pide_toque' || m === 'necesita_clave_nueva') {
      var r = (j && Array.isArray(j.razones)) ? j.razones : [];
      return 'No la junté, porque hay algo para mirar: ' + (r.length ? r.join(' ') : 'la nube no dijo qué.') +
        ' Así se ve una cuenta que alguien abrió con el número de tu cliente, y mirando no se sabe quién tiene la ' +
        'contraseña. Para juntarla, en el computador, en su ficha: «🔑 Clave nueva al número de su ficha». Le cambia la contraseña y se la mandas por ' +
        'WhatsApp al número de la FICHA; una hora después (lo que tarda en vencer la sesión de quien estuviera adentro) ' +
        'se junta sola.';
    }
    if (m === 'clave_reciente') {
      var h = hora(j && j.se_puede_desde);
      return 'Ya le diste una clave nueva al número de su ficha. Se puede juntar' + (h ? ' desde las ' + h : ' en una hora') +
        ': hasta entonces, la sesión de quien estuviera adentro con ese número todavía vale. Se junta sola a esa hora.';
    }
    if (m === 'equipo') {
      return 'Ese celular es de alguien de tu equipo (o es tu propia cuenta del Panel). Esa contraseña no se cambia desde ' +
        'un recado: cámbiala tú en Supabase → Authentication, después de hablar con esa persona.';
    }
    if (m === 'sin_registro') return 'Ese registro ya no está en la bandeja de la nube. Trae de nuevo los registrados.';
    if (m === 'celular') return 'El registro no trae un celular de 10 dígitos que empiece por 3: no hay a qué cuenta juntar.';
    return 'La nube no la juntó y no dijo por qué. Vuelve a intentar en un momento.';
  }

  /* La frase que va JUNTO al botón, en las dos pantallas. Dice qué es una
     prueba y qué no: llamar al número de la FICHA —el que Joan ya tenía— es
     lo único; el código de verificación del registro lo genera el navegador
     del que se registra (no prueba nada) y un parecido de cédula o de
     celular tampoco. `celularFicha`: el número de la ficha. */
  function textoConfirmacion(verif, celular, celularFicha) {
    var fic = digitos(celularFicha).slice(-10);
    return 'Tócalo solo si llamaste al ' + (fic.length === 10 ? bonito(fic) + ' (el número de su ficha)' : 'número que tienes en su ficha') +
      ' y te confirmó que este registro es suyo. Que la cédula o el celular coincidan no lo prueba: son datos que ' +
      'cualquiera puede tener.';
  }

  /* ¿La nube va a pedir clave nueva para juntar esta cuenta? Las mismas dos
     señales que mira vincular_interna. */
  function requiereClaveNueva(c) {
    if (!c || !c.cuenta) return false;
    var min = Number(c.minutos_antes_del_registro);
    return !!c.recado_abierto || (c.minutos_antes_del_registro != null && isFinite(min) && min > 60);
  }

  /* La clave nueva que ya se dio, si sirve para juntar ESTA ficha: posterior
     al registro, al número de esta ficha. {dada, desde, lista}. */
  function claveNuevaPara(c, llaveFicha, ahoraMs) {
    var x = c || {};
    var en = Date.parse(x.clave_nueva_en || '');
    var reg = Date.parse(x.registro_creado_en || '');
    var deEsta = digitos(x.clave_nueva_ficha) && digitos(x.clave_nueva_ficha) === digitos(llaveFicha);
    if (isNaN(en) || !deEsta || (!isNaN(reg) && en <= reg)) return { dada: false, desde: null, lista: false };
    var desde = en + ESPERA_CLAVE_MS;
    return { dada: true, desde: new Date(desde).toISOString(), lista: Number(ahoraMs) >= desde };
  }

  /* Las señales de la cuenta, para mirarlas ANTES del toque. Cada una es
     {texto, ojo}: ojo = true va en ámbar. Ninguna decide sola. `cuenta` es un
     renglón de cuentas_de_registros; `socio` la ficha (para comparar el
     celular); `llaveFicha` la llave de la ficha en la nube (para saber si la
     unión que ya existe es con ESTA ficha). */
  function senales(cuenta, socio, celularesFicha, llaveFicha) {
    var c = cuenta || {}, out = [];
    if (!c.cuenta) {
      out.push({ ojo: true, texto: 'Ese celular no tiene cuenta en la app: no hay qué juntar todavía.' });
      return out;
    }
    var min = Number(c.minutos_antes_del_registro);
    if (isFinite(min) && c.minutos_antes_del_registro != null) {
      if (min > 60) {
        out.push({ ojo: true, texto: 'La cuenta se abrió ' + horas(min) + ' ANTES de este registro. Lo normal es que se abra segundos después: ' +
          'puede ser que alguien la abriera con este número antes que su dueño.' });
      } else {
        out.push({ ojo: false, texto: 'La cuenta se abrió con el registro (es lo normal).' });
      }
    }
    if (c.recado_abierto) {
      out.push({ ojo: true, texto: 'Hay un recado de «Olvidé mi contraseña» abierto con ese celular: alguien no ' +
        'pudo entrar a esa cuenta. Mira quién es antes de juntar.' });
    }
    if (c.junta_con) {
      /* 7-oct-2026 (segunda vuelta) — si la unión que ya existe es con ESTA
         ficha (Joan la juntó desde el celular), decir «con otra ficha» lo
         mandaba a deshacer lo que estaba bien. */
      if (llaveFicha && digitos(c.junta_con) === digitos(llaveFicha)) {
        out.push({ ojo: false, texto: 'Ya está junta con esta ficha (desde el celular): falta cruzar los datos del registro.' });
      } else {
        out.push({ ojo: true, texto: 'Ese celular ya está junto con otra ficha. Un teléfono solo ve una.' });
      }
    }
    var cel = digitos(c.celular).slice(-10);
    var suyos = (celularesFicha || []).map(function (x) { return digitos(x).slice(-10); }).filter(Boolean);
    if (cel && suyos.length && suyos.indexOf(cel) < 0) {
      out.push({ ojo: true, texto: 'El celular de la cuenta (' + bonito(cel) + ') NO es el de la ficha (' + bonito(suyos[0]) +
        '). Si se cambió de número, confírmalo llamando al de la ficha: la cédula sola no prueba nada.' });
    }
    if (requiereClaveNueva(c)) {
      out.push({ ojo: true, texto: 'Con esto, un toque no basta: la nube pide que antes le des una clave nueva al número de ' +
        'su ficha, y junta una hora después.' });
    }
    return out;
  }
  function horas(min) {
    if (min < 120) return Math.round(min) + ' minutos';
    if (min < 2880) return Math.round(min / 60) + ' horas';
    return Math.round(min / 1440) + ' días';
  }

  /* Lo que se guarda en la nube (vinculos.revision) de la revisión automática
     que Joan tenía a la vista al tocar: SOLO lo que no es biométrico (eso
     nunca sale del computador, app/revision-registro.js) y solo los textos.
     Es evidencia de qué se miró, no la revisión entera. */
  function revisionParaGuardar(rev, quien) {
    var r = rev || {};
    var lista = function (xs) {
      return (Array.isArray(xs) ? xs : []).filter(function (x) { return x && !x.biometrico; })
        .slice(0, 20).map(function (x) { return String(x.texto || '').slice(0, 200); });
    };
    return { quien: String(quien || ''), para_mirar: lista(r.para_mirar), neutros: lista(r.neutros).slice(0, 10),
             version: r.version || null };
  }

  /* El WhatsApp de la contraseña nueva. Dice CON QUÉ CELULAR se entra: la
     clave es de la cuenta del recado, y el WhatsApp va al número de la ficha;
     si los dos no son el mismo, «entra con tu celular» lo mandaba a escribir
     el número equivocado (7-oct-2026, segunda vuelta). Y que la cambie: una
     contraseña que viajó por un chat no debería quedarse. */
  function mensajeClaveNueva(nombre, clave, celular) {
    var n = String(nombre || '').trim().split(/\s+/)[0] || '';
    var cel = digitos(celular).slice(-10);
    return 'Hola' + (n ? ' ' + n : '') + ', tu contraseña nueva para entrar a Tu Garantía es ' + clave +
      '. Entra con ' + (cel.length === 10 ? 'el celular ' + bonito(cel) : 'tu celular') +
      ' y esa contraseña, y cámbiala por una tuya en «Cambiar mi contraseña».';
  }

  return {
    ESPERA_CLAVE_MS: ESPERA_CLAVE_MS,
    textoMotivo: textoMotivo, textoConfirmacion: textoConfirmacion, senales: senales,
    requiereClaveNueva: requiereClaveNueva, claveNuevaPara: claveNuevaPara,
    revisionParaGuardar: revisionParaGuardar, mensajeClaveNueva: mensajeClaveNueva, bonito: bonito,
    nombrePlano: nombrePlano, mismoNombre: mismoNombre
  };
});
