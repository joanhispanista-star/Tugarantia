/* ============================================================================
 * LOS EXTRACTOS EN EL CRM DE JOAN — 13 de noviembre de 2026
 *
 * Joan (13-nov): que el cliente que no es empleado pueda subir sus extractos
 * de Nequi, Daviplata o el banco, y que los vea SOLO él. Lo que el cliente
 * subió en «Tus extractos» (el registro o la app) se ve aquí:
 *   · en 📥 Registrados, en un bloque propio («📄 Extractos que subieron»),
 *     con «📄 Ver» por persona;
 *   · en 📨 Solicitudes, con el chip «📄 Subió extractos» en la fila;
 *   · en la ficha (la que viene de un registro), con el campo donde Joan anota
 *     su RESUMEN: cuánto le entra al mes, en pesos, y si es regular. El resumen
 *     se guarda EN LA FICHA (s.extractoResumen), con su cartera, y no en la
 *     base de los archivos: es lo que Joan concluyó, no lo que el cliente dio.
 * SOLO en el CRM de Joan: todo pasa por su clave de sincronización
 * (extracto_resumen, extracto_de, extracto_archivo, extracto_borrar, en
 * base/20261113c_los_extractos.sql), y el modo equipo no pinta nada.
 *
 * EL ARCHIVO LO ESCRIBIÓ UN DESCONOCIDO, y este CRM tiene en memoria la
 * cartera entera y la clave. Por eso (las reglas de la historia laboral,
 * panel/historia-laboral-crm.js, copiadas aquí y no compartidas: ese archivo
 * lo está cambiando otra rama, y este no puede depender de cómo quede):
 *   · se pide UNO, cuando Joan toca «📄 Ver», nunca en lote ni al pintar;
 *   · el tipo lo deciden sus primeros bytes, y tienen que coincidir con lo que
 *     dice la base: si no, no se abre (y se dice);
 *   · se arma un Blob con ese tipo FORZADO (application/pdf, image/…): nunca
 *     el que diga el dato, nunca text/html ni SVG;
 *   · el PDF se abre en OTRA pestaña con un enlace de un solo uso (blob:, se
 *     suelta al minuto), que Joan toca, sin about:blank ni document.write; y
 *     «⬇ Descargar» baja ese mismo Blob con un nombre que no dice de quién es;
 *   · la imagen se ve en grande aquí mismo, asignada como propiedad de un
 *     <img>, nunca como texto de un atributo.
 *
 * LO QUE NO HACE: no lee el extracto ni lo confirma con el banco. El bloque
 * lo dice para que nadie lo tome por prueba, y pide no anotar nombres de
 * terceros ni usar lo que diga de salud, religión o política: el resumen
 * tiene dos campos, la plata y si es regular, y nada más.
 * ==========================================================================*/

/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de
   v139 en sw.js). Va primero: firma que llegó ESTE archivo. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ExtractosCRM = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIPO_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  /* Las respuestas posibles a «¿le entra con regularidad?», en el orden en que
     se ofrecen. '' es «todavía no lo sé». */
  var REGULAR = [
    { v: 'si', t: 'Sí: le entra cada mes (o cada quincena)' },
    { v: 'irregular', t: 'Irregular: unos meses sí y otros no, o montos que cambian mucho' },
    { v: 'no_se_sabe', t: 'No se puede saber con lo que subió' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function diez(t) { return String(t == null ? '' : t).replace(/\D/g, '').slice(-10); }
  function fecha(iso, conHora) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var s = t.getDate() + '-' + MESES[t.getMonth()] + '-' + t.getFullYear();
    if (!conHora) return s;
    var h = t.getHours(), m = t.getMinutes();
    return s + ' ' + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h >= 12 ? ' p. m.' : ' a. m.');
  }
  function tamano(n) {
    n = Number(n) || 0;
    if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (Math.round(n / 104857.6) / 10).toString().replace('.', ',') + ' MB';
  }
  /* Como COP() del CRM: '$1.500.000'. */
  function pesos(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function bonito(t) { var d = diez(t); return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d; }
  function mb(n) { return (Math.round((Number(n) || 0) / 104857.6) / 10).toString().replace('.', ','); }
  /* El tipo por los primeros bytes: la misma regla que la base y que la app. */
  function tipoPorBytes(b) {
    var es = function (i, l) { for (var k = 0; k < l.length; k++) if (b[i + k] !== l[k]) return false; return true; };
    if (b.length >= 5 && es(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
    if (b.length >= 3 && es(0, [0xff, 0xd8, 0xff])) return 'jpg';
    if (b.length >= 8 && es(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
    if (b.length >= 12 && es(0, [0x52, 0x49, 0x46, 0x46]) && es(8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
    return null;
  }
  function bytesDeBase64(t) {
    var s = String(t || '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
    if (typeof atob !== 'function') {
      return (typeof Buffer !== 'undefined') ? new Uint8Array(Buffer.from(s, 'base64')) : null;
    }
    var bin = atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  /* 24-nov-2026 — QUÉ PLATAFORMAS DIJO QUE USA. La lista de app/extractos.js
     (PLATAFORMAS) y de base/20261124_plataformas_del_extracto.sql: una prueba
     compara las tres. Aquí solo se LEE: es lo que la persona marcó, no algo
     que un banco confirme. */
  var PLATAFORMAS = [
    { id: 'nequi', nombre: 'Nequi' },
    { id: 'daviplata', nombre: 'Daviplata' },
    { id: 'nubank', nombre: 'Nubank' },
    { id: 'lulo', nombre: 'Lulo Bank' },
    { id: 'bancolombia', nombre: 'Bancolombia' },
    { id: 'otra', nombre: 'Otro banco' }
  ];
  /** «Nequi, Daviplata y Otro banco», de lo que guarda la base ('nequi,daviplata,otra'). Lo que no es de la lista no sale. */
  function plataformasEnPalabras(v) {
    var dichas = (Array.isArray(v) ? v : String(v == null ? '' : v).split(','))
      .map(function (x) { return String(x == null ? '' : x).toLowerCase().replace(/[^a-z]/g, ''); });
    var n = PLATAFORMAS.filter(function (p) { return dichas.indexOf(p.id) >= 0; }).map(function (p) { return p.nombre; });
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : (n[0] || '');
  }
  /* «todavía no tiene»: así dice rpc (panel/crm.html) un 404, la base sin ese SQL. */
  function faltaEnLaBase(e) { return /todavía no tiene/.test(String((e && e.motivo) || '')); }
  function cuantos(p) { return (Number(p && p.pdf) || 0) + (Number(p && p.imagenes) || 0); }
  function queSubio(p) {
    var que = [];
    if (Number(p.pdf)) que.push(p.pdf + ' PDF');
    if (Number(p.imagenes)) que.push(p.imagenes + (Number(p.imagenes) === 1 ? ' pantallazo' : ' pantallazos'));
    return que.join(' y ');
  }

  /* ---------------------------------------------------------- las llamadas */
  /** Todos los que tienen algo, sin ningún archivo: {porCelular, espacio: {ocupado, tope} | null}. */
  function resumen(rpc, clave) {
    return rpc('extracto_resumen', { p_clave: clave }).then(function (j) {
      var m = {}, e = j && j.espacio;
      ((j && j.personas) || []).forEach(function (p) { if (p && p.celular) m[diez(p.celular)] = p; });
      var r = { porCelular: m, espacio: (e && Number(e.tope) > 0) ? { ocupado: Number(e.ocupado) || 0, tope: Number(e.tope) } : null };
      /* Las plataformas de todos, de un solo viaje, y solo si hay alguien. Si
         no se pueden traer, la lista sale igual sin ellas: el «📄 Ver» de cada
         persona las pide otra vez y ahí sí se dice por qué no están. */
      if (!Object.keys(m).length) return r;
      return Promise.resolve(rpc('extracto_plataformas_de', { p_clave: clave })).then(function (x) {
        ((x && x.personas) || []).forEach(function (p) {
          var k = p && diez(p.celular);
          if (k && m[k]) m[k].plataformas = String(p.plataformas || '');
        });
        return r;
      }, function () { return r; });
    });
  }
  /* Lo de UNA persona, con las plataformas que marcó (d.plataformas). Si no se
     pudieron preguntar, d.plataformasEstado dice por qué ('falta': la base sin
     base/20261124_plataformas_del_extracto.sql; 'error'), y bloque() lo dice:
     no poder preguntar no es «no marcó ninguna». */
  function de(rpc, clave, celular) {
    return rpc('extracto_de', { p_clave: clave, p_celular: diez(celular) }).then(function (d) {
      var a = d && d.autorizacion;
      if (!a || a.revocada_en) return d;
      return Promise.resolve(rpc('extracto_plataformas_de', { p_clave: clave, p_celular: diez(celular) })).then(function (x) {
        d.plataformas = String((x && x.plataformas) || ''); d.plataformasEstado = 'ok';
        return d;
      }, function (e) { d.plataformasEstado = faltaEnLaBase(e) ? 'falta' : 'error'; return d; });
    });
  }
  function borrar(rpc, clave, celular) { return rpc('extracto_borrar', { p_clave: clave, p_celular: diez(celular) }); }
  /**
   * UN archivo, listo para abrir: {ok, tipo, blob, bytes} o {ok:false, motivo}.
   * `motivo`: 'no_existe' (lo quitaron), 'no_coincide' (los bytes no son lo que
   * dice la base), 'roto'.
   */
  function traer(rpc, clave, id) {
    return rpc('extracto_archivo', { p_clave: clave, p_id: Number(id) }).then(function (j) {
      if (!j || j.ok !== true) return { ok: false, motivo: (j && j.motivo) || 'no_existe' };
      var u8 = bytesDeBase64(j.base64);
      if (!u8 || !u8.length) return { ok: false, motivo: 'roto' };
      var t = tipoPorBytes(u8);
      if (!t || t !== j.tipo || !TIPO_MIME[t]) return { ok: false, motivo: 'no_coincide' };
      return { ok: true, id: j.id, tipo: t, bytes: u8.length, blob: new Blob([u8], { type: TIPO_MIME[t] }), creado_en: j.creado_en };
    });
  }

  /* ------------------------------------------------------------ lo que pinta */
  /** El chip de 📨 Solicitudes: solo si subió algo. Abre lo suyo en un cuadro. */
  function chipSolicitud(p) {
    if (!p || !p.celular || !cuantos(p)) return '';
    return '<div style="margin-top:4px"><button class="btn btn-ghost btn-sm" data-extractos-ver="' + esc(diez(p.celular)) + '" ' +
      'onclick="verExtractosDe(this.getAttribute(\'data-extractos-ver\'))" title="Lo que subió en «Tus extractos»: ' + esc(queSubio(p)) +
      '. Solo lo ves tú.">📄 Subió extractos</button></div>';
  }
  /**
   * EL CORTACIRCUITO, A LA VISTA DE JOAN: una línea desde el 80 % del tope de
   * extracto_subir. Por debajo, nada.
   */
  function avisoEspacio(e) {
    var ocupado = Number(e && e.ocupado) || 0, tope = Number(e && e.tope) || 0;
    if (!(tope > 0) || ocupado < tope * 0.8) return '';
    var lleno = ocupado >= tope, pct = Math.min(100, Math.round(ocupado * 100 / tope));
    var cuanto = mb(ocupado) + ' MB de ' + mb(tope) + ' MB';
    return '<div class="alerta ' + (lleno ? 'mal' : 'warn') + '" style="margin:10px 14px 0" data-extractos-espacio="' + (lleno ? 'lleno' : 'casi') + '">' +
      (lleno ? '⛔ <b>El espacio de los extractos está lleno</b> (' + cuanto + '): nadie puede subir los suyos hasta que lo liberes; el registro sigue igual.'
             : '⚠️ <b>El espacio de los extractos va en ' + pct + ' %</b> (' + cuanto + '): cuando se llene, nadie podrá subir los suyos.') +
      ' Para liberarlo, borra los que ya no sirvan (📄 Ver → 🗑) y corre «vacuum full public.extracto_archivos;» en el SQL Editor de Supabase.</div>';
  }
  /**
   * El bloque propio de 📥 Registrados: quien subió extractos (primero) y quien
   * autorizó sin subir todavía. `o`: {estado: 'sin_preguntar'|'cargando'|'ok'|
   * 'error'|'falta', espacio, nombreDe(celular)}. Vacío si no hay nada que
   * decir (nadie, o todavía sin preguntar).
   */
  function bloqueRegistros(porCelular, o) {
    o = o || {};
    var tit = '<div class="card" id="extractosRegistros"><div class="card-h"><h3>📄 Extractos que subieron</h3>' +
      '<span class="tag">De quien quiso darlos, empleado o no: Nequi, Daviplata o el banco. Solo los ves tú; se guardan mientras tengan cuenta.</span></div>';
    if (o.estado === 'falta') return tit + '<div class="muted" style="padding:0 14px 12px">Tu base todavía no tiene esta parte: corre base/20261113c_los_extractos.sql en el SQL Editor. Mientras tanto el registro no ofrece el paso.</div></div>';
    if (o.estado === 'error') return tit + '<div class="alerta warn" style="margin:0 14px 12px">No pude preguntar por los extractos. Eso <b>no</b> quiere decir que nadie haya subido: toca «↻ Traer de la nube».</div></div>';
    var todos = Object.keys(porCelular || {}).map(function (k) { return porCelular[k]; }).filter(function (p) { return p && p.celular; });
    var con = todos.filter(function (p) { return cuantos(p) > 0; })
      .sort(function (a, b) { return String(b.ultimo || '').localeCompare(String(a.ultimo || '')); });
    var sin = todos.filter(function (p) { return !cuantos(p) && !p.revocada_en; });
    var espacio = avisoEspacio(o.espacio);
    if (!con.length && !sin.length) return espacio ? tit + espacio + '</div>' : '';
    var nombreDe = typeof o.nombreDe === 'function' ? o.nombreDe : function () { return ''; };
    var quien = function (p) { var n = ''; try { n = nombreDe(diez(p.celular)) || ''; } catch (e) { n = ''; } return (n ? esc(n) + ' · ' : '') + esc(bonito(p.celular)); };
    var usa = function (p, antes, despues) { var t = plataformasEnPalabras(p.plataformas); return t ? antes + esc(t) + despues : ''; };
    return tit + espacio + '<div style="padding:0 14px 12px">' +
      con.map(function (p) {
        return '<div class="info-row"><span class="k">' + quien(p) + '</span><span class="vv"><button class="btn btn-ghost btn-sm" ' +
          'data-extractos-ver="' + esc(diez(p.celular)) + '" onclick="verExtractosDe(this.getAttribute(\'data-extractos-ver\'))">📄 Ver</button> ' +
          '<span class="muted" style="font-size:12px">' + esc(queSubio(p)) + (p.ultimo ? ' · subido el ' + esc(fecha(p.ultimo)) : '') +
          usa(p, ' · dice que usa ', '') + '</span></span></div>';
      }).join('') +
      (sin.length ? '<div class="muted" style="margin-top:8px;font-size:12px">Autorizaron y todavía no suben nada: ' +
        sin.map(function (p) { return quien(p) + usa(p, ' (dice que usa ', ')'); }).join(', ') + '. Lo pueden subir desde su cuenta.</div>' : '') +
      '</div></div>';
  }

  /* --------------------------------------------------------- el resumen */
  /**
   * Lo que Joan anota, limpio: {mensual: entero en pesos | null, regular: uno
   * de REGULAR o ''}. La plata se escribe como se quiera (1.500.000, 1,500.000,
   * $ 1500000): cuentan los dígitos. Nada más se guarda: ni nombres de nadie,
   * ni notas sueltas donde quepan.
   */
  function normalizarResumen(r) {
    var x = r || {};
    var d = String(x.mensual == null ? '' : x.mensual).replace(/\D/g, '');
    var mensual = d ? Math.min(Number(d), 1000000000) : null;
    var regular = REGULAR.some(function (o) { return o.v === x.regular; }) ? x.regular : '';
    return { mensual: mensual, regular: regular };
  }
  function regularEnPalabras(v) {
    var o = REGULAR.filter(function (x) { return x.v === v; })[0];
    return o ? o.t : '';
  }
  /** La línea de lo ya anotado: «Le entran $1.200.000 al mes · Irregular… (lo anotaste el 13-nov-2026)». */
  function lineaResumen(r) {
    if (!r || (r.mensual == null && !r.regular)) return '';
    var partes = [];
    if (r.mensual != null) partes.push('le entran ' + pesos(r.mensual) + ' al mes');
    if (r.regular) partes.push(regularEnPalabras(r.regular));
    var t = partes.join(' · ');
    return t.charAt(0).toUpperCase() + t.slice(1) + (r.anotado_en ? ' (lo anotaste el ' + fecha(r.anotado_en) + ')' : '');
  }
  /** El formulario de la ficha, con lo ya anotado puesto. `socioId` es el de la ficha. */
  function resumenHTML(r, socioId) {
    var x = r || {};
    var sel = function (v) { return x.regular === v ? ' selected' : ''; };
    return '<div class="sub-h">Tu resumen de sus extractos</div>' +
      (lineaResumen(x) ? '<div class="info-row"><span class="k">Lo que anotaste</span><span class="vv" id="extractoResumenLinea">' + esc(lineaResumen(x)) + '</span></div>' : '') +
      '<div class="field"><label for="exMensual">Cuánto le entra al mes, en pesos <span class="muted">(el promedio de lo que ves)</span></label>' +
        '<input id="exMensual" inputmode="numeric" autocomplete="off" placeholder="Ej: 1.200.000" value="' + esc(x.mensual != null ? Math.round(x.mensual).toLocaleString('es-CO') : '') + '"></div>' +
      '<div class="field"><label for="exRegular">¿Le entra con regularidad?</label><select id="exRegular">' +
        '<option value=""' + sel('') + '>Todavía no lo sé</option>' +
        REGULAR.map(function (o) { return '<option value="' + o.v + '"' + sel(o.v) + '>' + esc(o.t) + '</option>'; }).join('') +
      '</select></div>' +
      '<button class="btn btn-ghost btn-sm" data-extractos-resumen="' + esc(socioId) + '" ' +
        'onclick="guardarResumenExtractos(this.getAttribute(\'data-extractos-resumen\'))">💾 Guardar el resumen en la ficha</button>' +
      /* 13-nov-2026 (remate) — quitarlo. La política promete que, si la persona
         pide por el chat que se borren sus extractos, «borramos también lo que
         anotamos de ellos»; y sin este botón no había cómo: «Guardar» rechaza
         los dos campos vacíos y «🗑 Borrar sus extractos» solo sale mientras
         queda su autorización en la base. Solo aparece si hay algo anotado. */
      (lineaResumen(x) ? ' <button class="btn btn-ghost btn-sm" data-extractos-quitar="' + esc(socioId) + '" ' +
        'onclick="quitarResumenExtractos(this.getAttribute(\'data-extractos-quitar\'))">🗑 Quitar el resumen</button>' : '') +
      '<div class="muted" style="font-size:12px;margin-top:6px">Se guarda en esta ficha, con tu cartera: tu equipo no lo ve en su app. ' +
        'Solo la plata y si es regular: no anotes nombres de quien le manda o a quien le paga.</div>';
  }

  /**
   * 13-nov-2026 (remate) — lo que dice «🚫 Borrar a alguien que lo pidió» de
   * sus extractos, después de borrarlos. `r`: {archivos, autorizaciones} si la
   * base los borró, {falta: true} si la base todavía no tiene esta parte (y
   * entonces no puede haber ninguno), {error} si no se pudo, o null si este
   * CRM no pudo ni preguntar (la parte de los extractos no cargó o la nube no
   * está conectada). `resumenes`: en cuántas fichas se quitó lo que Joan anotó
   * de ellos. Dice lo que pasó y, sobre todo, lo que NO: un «Listo» que calla
   * los extractos de quien pidió que lo borraran es justo lo que no puede ser.
   */
  function lineaSuprimir(r, resumenes) {
    var n = Number(resumenes) || 0;
    var resumen = n ? (n === 1 ? 'tu resumen de ellos en su ficha' : 'tu resumen de ellos en sus ' + n + ' fichas') : '';
    var arch = r ? (Number(r.archivos) || 0) : 0, aut = r ? (Number(r.autorizaciones) || 0) : 0;
    if (!r) {
      return '\n\nSus extractos, si los subió, NO se borraron: este CRM no pudo preguntar por ellos (la nube no está conectada o no ' +
        'cargó esa parte). Recarga y vuelve a tocar «🚫 Borrar a alguien que lo pidió» con el mismo celular.' +
        (resumen ? ' Sí quité ' + resumen + '.' : '');
    }
    if (r.error) {
      return '\n\nSus extractos NO se borraron (' + r.error + '): bórralos desde 📥 Registrados → 📄 Extractos que subieron → ' +
        '🗑 Borrar sus extractos.' + (resumen ? ' Sí quité ' + resumen + '.' : '');
    }
    if (arch || aut) {
      return '\n\nTambién borré sus extractos: ' + arch + ' archivo(s)' + (aut ? ' y su autorización' : '') +
        (resumen ? ', y ' + resumen : '') + '.';
    }
    return resumen ? '\n\nNo tenía extractos en la nube; quité ' + resumen + '.' : '';
  }

  /**
   * El bloque de la ficha y del «📄 Ver». `d` es lo de extracto_de. `opc`:
   * {siVacio (false en la ficha: quien no dio nada no ocupa sitio), ficha:
   * {id, resumen} (con eso, el formulario del resumen), conBorrar}.
   */
  function bloque(d, opc) {
    var o = opc || {};
    var a = d && d.autorizacion;
    var fichaR = o.ficha && o.ficha.resumen;
    var tit = '<div class="sub-h">📄 Extractos</div>';
    if (!a && !(fichaR && lineaResumen(fichaR))) return o.siVacio === false ? '' : tit + '<div class="muted">No nos dio extractos (es opcional).</div>';
    var archivos = (d && d.archivos) || [];
    var fila = function (k, v) { return '<div class="info-row"><span class="k">' + k + '</span><span class="vv">' + v + '</span></div>'; };
    return tit +
      (a ? fila('Autorizó', 'el ' + esc(fecha(a.autorizada_en, true)) + ' <span class="muted">· texto del ' + esc(a.version) + '</span>') : '') +
      (a && a.revocada_en ? fila('Retiró su autorización', 'el ' + esc(fecha(a.revocada_en, true))) : '') +
      /* 24-nov-2026 — lo que marcó en «¿Cuáles usas?». Si no marcó nada, no
         ocupa sitio; si no se pudo preguntar, se dice. */
      (plataformasEnPalabras(d && d.plataformas) ? fila('Dice que usa', esc(plataformasEnPalabras(d.plataformas)) +
          ' <span class="muted">· lo marcó la persona</span>') : '') +
      (d && d.plataformasEstado === 'falta' ? '<div class="muted" style="font-size:12px;margin:4px 0">Qué plataformas usa: tu base todavía no ' +
          'tiene esa parte. Corre base/20261124_plataformas_del_extracto.sql en el SQL Editor.</div>' : '') +
      (d && d.plataformasEstado === 'error' ? '<div class="muted" style="font-size:12px;margin:4px 0">No pude preguntar qué plataformas ' +
          'dijo que usa. Eso <b>no</b> quiere decir que no marcó ninguna.</div>' : '') +
      (archivos.length ? archivos.map(function (x) {
        return '<div class="info-row"><span class="k">' + (x.tipo === 'pdf' ? '📄 PDF' : '🖼️ Pantallazo') + ' · ' + esc(tamano(x.bytes)) +
          '<div class="muted" style="font-size:12px">subido el ' + esc(fecha(x.creado_en, true)) + '</div></span>' +
          '<span class="vv"><button class="btn btn-ghost btn-sm" data-extractos-archivo="' + esc(x.id) + '" ' +
          'onclick="verArchivoExtracto(this.getAttribute(\'data-extractos-archivo\'))">📄 Ver y descargar</button></span></div>';
      }).join('') : (a ? '<div class="muted" style="margin:6px 0">Todavía no ha subido sus extractos.</div>' : '')) +
      '<div id="extractoAbrir" style="margin-top:8px"></div>' +
      '<div class="muted" style="font-size:12px;margin-top:8px">Lo trajo la persona: un PDF o un pantallazo se editan en minutos y el banco no ' +
        'nos lo confirma. Míralo como información, no como prueba; si puedes, compáralo con la cuenta a la que le desembolsas. Trae nombres de ' +
        'otras personas: no los anotes ni los uses. Si deja ver algo de su salud, su religión o su política, no lo uses para decidir. Si el ' +
        'PDF pide contraseña, suele ser el número de documento del registro; si no abre, pídele pantallazos por el chat (nunca la clave de su banco).</div>' +
      (o.ficha && o.ficha.id != null ? resumenHTML(fichaR, o.ficha.id)
        : '<div class="muted" style="font-size:12px;margin-top:6px">Tu resumen (cuánto le entra y si es regular) se anota en su ficha, cuando la tenga.</div>') +
      (o.conBorrar === false || !a ? '' : '<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-extractos-borrar="' + esc(diez(d.celular)) + '" ' +
        'onclick="borrarExtractosDe(this.getAttribute(\'data-extractos-borrar\'))">🗑 Borrar sus extractos</button>');
  }

  /* ------------------------------------------------------------ abrir uno */
  var ULTIMA_URL = null;
  function soltarUrl(U) {
    if (ULTIMA_URL && U && U.revokeObjectURL) { try { U.revokeObjectURL(ULTIMA_URL); } catch (e) {} }
    ULTIMA_URL = null;
  }
  /* El nombre de la descarga: el tipo y el número del archivo, sin el celular
     ni el nombre de nadie (una carpeta de Descargas la ve cualquiera que use
     el computador). */
  function nombreDeDescarga(r) { return 'extracto-' + String(r.id || 'archivo').replace(/[^\w-]/g, '') + '.' + (r.tipo === 'jpg' ? 'jpg' : r.tipo); }
  function enlace(d, url, texto, descargar, nombre) {
    var a = d.createElement('a');
    a.className = descargar ? 'btn btn-ghost btn-sm' : 'btn btn-rojo btn-sm';
    a.href = url;                         // como propiedad: nunca texto de un atributo
    if (descargar) a.download = nombre; else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.textContent = texto;
    a.setAttribute(descargar ? 'data-extracto-descargar' : 'data-extracto-pdf', '1');
    return a;
  }
  /**
   * Abre lo que trajo `traer`. PDF: deja en `caja` un enlace de un solo uso
   * para abrirlo en otra pestaña (lo toca Joan: un window.open después de
   * esperar a la red lo bloquea el navegador) y otro para descargarlo. Imagen:
   * la muestra en grande aquí mismo, con su «⬇ Descargar». `w` es la ventana.
   */
  function abrir(r, caja, w) {
    var W = w || (typeof window !== 'undefined' ? window : null), d = W && W.document, U = W && W.URL;
    if (!r || !r.ok || !W || !U || !U.createObjectURL || !d) return false;
    soltarUrl(U);
    var url = U.createObjectURL(r.blob);
    ULTIMA_URL = url;
    W.setTimeout(function () { if (ULTIMA_URL === url) soltarUrl(U); }, 60000);
    if (r.tipo === 'pdf') {
      if (!caja) return false;
      caja.innerHTML = '';
      caja.appendChild(enlace(d, url, 'Abrir el PDF (' + tamano(r.bytes) + ') en otra pestaña ↗', false));
      caja.appendChild(enlace(d, url, '⬇ Descargar', true, nombreDeDescarga(r)));
      var n = d.createElement('div');
      n.className = 'muted'; n.style.fontSize = '12px'; n.style.marginTop = '4px';
      n.textContent = 'Los enlaces sirven un minuto. Si te pide contraseña, suele ser el número de documento del registro.';
      caja.appendChild(n);
      return true;
    }
    var fondo = d.createElement('div');
    fondo.id = 'extractoImagen';
    fondo.setAttribute('role', 'dialog');
    fondo.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.86);display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;padding:16px;gap:12px';
    var img = d.createElement('img');
    img.alt = 'Extracto (pantallazo)';
    img.style.cssText = 'max-width:100%;max-height:78vh;object-fit:contain;background:#fff;border-radius:8px';
    img.src = url;                        // como propiedad: nunca texto de un atributo
    var baja = enlace(d, url, '⬇ Descargar', true, nombreDeDescarga(r));
    baja.style.background = '#fff';
    var b = d.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Cerrar';
    b.style.background = '#fff';
    var cerrar = function () { if (fondo.parentNode) fondo.parentNode.removeChild(fondo); soltarUrl(U); };
    b.onclick = cerrar;
    fondo.onclick = function (ev) { if (ev && ev.target === fondo) cerrar(); };
    fondo.appendChild(img); fondo.appendChild(baja); fondo.appendChild(b);
    (d.body || d.documentElement).appendChild(fondo);
    return true;
  }
  function motivoEnPalabras(m) {
    return m === 'no_existe' ? 'Ese archivo ya no está: la persona lo quitó o se borró.'
      : m === 'no_coincide' ? 'Ese archivo no es lo que dice ser (sus primeros bytes no son de un PDF ni de una imagen). No lo abro: trata este registro con cuidado.'
      : 'No pude leer ese archivo.';
  }

  return {
    VERSION: '2026-11-13',
    TIPO_MIME: TIPO_MIME,
    REGULAR: REGULAR,
    PLATAFORMAS: PLATAFORMAS,
    plataformasEnPalabras: plataformasEnPalabras,
    tipoPorBytes: tipoPorBytes,
    resumen: resumen,
    de: de,
    borrar: borrar,
    traer: traer,
    abrir: abrir,
    chipSolicitud: chipSolicitud,
    avisoEspacio: avisoEspacio,
    bloqueRegistros: bloqueRegistros,
    normalizarResumen: normalizarResumen,
    lineaResumen: lineaResumen,
    resumenHTML: resumenHTML,
    lineaSuprimir: lineaSuprimir,
    bloque: bloque,
    motivoEnPalabras: motivoEnPalabras
  };
});
