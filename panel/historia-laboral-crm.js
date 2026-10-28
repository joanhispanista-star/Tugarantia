/* ============================================================================
 * LA HISTORIA LABORAL EN EL CRM DE JOAN — 28 de octubre de 2026
 *
 * Joan: «quiero que yo como dueño tenga acceso a esta información cuando
 * quiera». Lo que el cliente subió en «Tu fondo de pensiones» (el registro o
 * la app) se ve aquí: en 📥 Registrados («📄 Fondo de pensiones: Ver»), en
 * «👁 Ver datos» y en la ficha. SOLO en el CRM de Joan: todo pasa por su clave
 * de sincronización (pension_resumen, pension_de, pension_archivo, en
 * base/20261103_el_fondo_de_pensiones.sql), y el modo equipo no pinta nada.
 *
 * EL ARCHIVO LO ESCRIBIÓ UN DESCONOCIDO, y este CRM tiene en memoria la
 * cartera entera y la clave. Por eso:
 *   · se pide UNO, cuando Joan toca «📄 Ver», nunca en lote ni al pintar;
 *   · el tipo lo deciden sus primeros bytes, y tienen que coincidir con lo que
 *     dice la base: si no, no se abre (y se dice);
 *   · se arma un Blob con ese tipo FORZADO (application/pdf, image/…): nunca
 *     el que diga el dato, nunca text/html ni SVG;
 *   · el PDF se abre en OTRA pestaña con un enlace de un solo uso (blob:, se
 *     suelta al minuto), que Joan toca: lo dibuja el visor del navegador, sin
 *     about:blank ni document.write (la lección del 22-sep: una pestaña en
 *     blanco abierta desde aquí hereda el origen y podía leer la clave);
 *   · la imagen se ve en grande aquí mismo, asignada como propiedad de un
 *     <img>, nunca como texto de un atributo (la lección de fotoSegura).
 *
 * LO QUE NO HACE: no lee el PDF ni lo «verifica» (ningún fondo tiene cómo).
 * El bloque lo dice para que nadie lo tome por prueba.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.HistoriaLaboralCRM = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIPO_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function FP() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { return require('../app/fondos-pension.js'); } catch (e) { /* sigue */ }
    }
    return (typeof globalThis !== 'undefined' && globalThis.FondosPension) || null;
  }
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
  /* El tipo por los primeros bytes: la misma regla que la base y que la app
     (app/historia-laboral.js). Copia de seis líneas a propósito: el CRM no
     carga la pantalla del cliente. */
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

  /* ---------------------------------------------------------- las llamadas */
  /** Todos los que tienen algo, sin ningún archivo: {celular → persona}. */
  function resumen(rpc, clave) {
    return rpc('pension_resumen', { p_clave: clave }).then(function (j) {
      var m = {};
      ((j && j.personas) || []).forEach(function (p) { if (p && p.celular) m[diez(p.celular)] = p; });
      return m;
    });
  }
  function de(rpc, clave, celular) { return rpc('pension_de', { p_clave: clave, p_celular: diez(celular) }); }
  function borrar(rpc, clave, celular) { return rpc('pension_borrar', { p_clave: clave, p_celular: diez(celular) }); }

  /**
   * UN archivo, listo para abrir: {ok, tipo, blob, bytes} o {ok:false, motivo}.
   * `motivo`: 'no_existe' (lo borraron), 'no_coincide' (los bytes no son lo que
   * dice la base), 'roto'.
   */
  function traer(rpc, clave, id) {
    return rpc('pension_archivo', { p_clave: clave, p_id: Number(id) }).then(function (j) {
      if (!j || j.ok !== true) return { ok: false, motivo: (j && j.motivo) || 'no_existe' };
      var u8 = bytesDeBase64(j.base64);
      if (!u8 || !u8.length) return { ok: false, motivo: 'roto' };
      var t = tipoPorBytes(u8);
      if (!t || t !== j.tipo || !TIPO_MIME[t]) return { ok: false, motivo: 'no_coincide' };
      return { ok: true, tipo: t, bytes: u8.length, blob: new Blob([u8], { type: TIPO_MIME[t] }), creado_en: j.creado_en };
    });
  }

  /* ------------------------------------------------------------ lo que pinta */
  function nombresDeFondos(f) {
    var l = Array.isArray(f) ? f : [];
    if (!l.length) return 'No escogió fondo';
    if (l[0] === 'no_se') return 'No sabe en cuál está';
    if (l[0] === 'nunca') return 'Dice que nunca ha cotizado';
    var P = FP();
    return P ? P.nombres(l) : l.join(', ');
  }
  /** La línea de 📥 Registrados. Vacía si no autorizó nada. */
  function chip(p) {
    if (!p || !p.celular) return '';
    var n = (Number(p.pdf) || 0) + (Number(p.imagenes) || 0);
    if (p.revocada_en && !n) return '<div class="muted" style="margin-top:4px;font-size:12px">Retiró su autorización de la historia laboral el ' + esc(fecha(p.revocada_en)) + '</div>';
    if (!n) return '<div class="muted" style="margin-top:4px;font-size:12px">📄 Autorizó lo de su fondo (' + esc(nombresDeFondos(p.fondos)) + '), sin historia laboral todavía</div>';
    var que = [];
    if (Number(p.pdf)) que.push(p.pdf + ' PDF');
    if (Number(p.imagenes)) que.push(p.imagenes + (Number(p.imagenes) === 1 ? ' pantallazo' : ' pantallazos'));
    return '<div style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-pension-ver="' + esc(diez(p.celular)) + '" ' +
      'onclick="verPensionRegistro(this.getAttribute(\'data-pension-ver\'))">📄 Fondo de pensiones: Ver</button> ' +
      '<span class="muted" style="font-size:12px">' + esc(nombresDeFondos(p.fondos)) + ' · ' + esc(que.join(' y ')) +
      (p.ultimo ? ' · subido el ' + esc(fecha(p.ultimo)) : '') + '</span></div>';
  }
  /** El bloque de «👁 Ver datos», de la ficha y del «📄 Ver». `d` es lo de pension_de. */
  function bloque(d, opc) {
    var o = opc || {};
    var a = d && d.autorizacion;
    var tit = '<div class="sub-h">📄 Fondo de pensiones</div>';
    if (!a) return o.siVacio === false ? '' : tit + '<div class="muted">No nos dio su historia laboral (es opcional).</div>';
    var archivos = (d.archivos || []);
    var P = FP();
    var notas = (a.fondos || []).map(function (c) { var f = P && P.porCodigo(c); return f && f.notaCrm ? '<b>' + esc(f.nombre) + ':</b> ' + esc(f.notaCrm) : ''; })
      .filter(Boolean);
    var fila = function (k, v) { return '<div class="info-row"><span class="k">' + k + '</span><span class="vv">' + v + '</span></div>'; };
    return tit +
      fila('Dijo que está en', esc(nombresDeFondos(a.fondos))) +
      fila('Autorizó', 'el ' + esc(fecha(a.autorizada_en, true)) + ' <span class="muted">· texto del ' + esc(a.version) + '</span>') +
      (a.revocada_en ? fila('Retiró su autorización', 'el ' + esc(fecha(a.revocada_en, true))) : '') +
      (archivos.length ? archivos.map(function (x) {
        return '<div class="info-row"><span class="k">' + (x.tipo === 'pdf' ? '📄 PDF' : '🖼 Pantallazo') + ' · ' + esc(tamano(x.bytes)) +
          '<div class="muted" style="font-size:12px">subido el ' + esc(fecha(x.creado_en, true)) + '</div></span>' +
          '<span class="vv"><button class="btn btn-ghost btn-sm" data-pension-archivo="' + esc(x.id) + '" ' +
          'onclick="verArchivoPension(this.getAttribute(\'data-pension-archivo\'), this)">📄 Ver</button></span></div>';
      }).join('') : '<div class="muted" style="margin:6px 0">Todavía no ha subido su historia laboral.</div>') +
      '<div id="pensionAbrir" style="margin-top:8px"></div>' +
      '<div class="muted" style="font-size:12px;margin-top:8px">Lo trajo la persona: un PDF se edita en minutos y ningún fondo tiene cómo ' +
        'confirmarlo. Míralo como información, no como prueba. Si trae incapacidades o licencias, no las uses para decidir: son datos de salud.' +
        (notas.length ? '<br>' + notas.join('<br>') : '') + '</div>' +
      (o.conBorrar === false ? '' : '<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-pension-borrar="' + esc(diez(d.celular)) + '" ' +
        'onclick="borrarPensionDe(this.getAttribute(\'data-pension-borrar\'))">🗑 Borrar su historia laboral</button>');
  }

  /* ------------------------------------------------------------ abrir uno */
  var ULTIMA_URL = null;
  function soltarUrl(U) {
    if (ULTIMA_URL && U && U.revokeObjectURL) { try { U.revokeObjectURL(ULTIMA_URL); } catch (e) {} }
    ULTIMA_URL = null;
  }
  /**
   * Abre lo que trajo `traer`. PDF: deja en `caja` un enlace de un solo uso
   * para abrirlo en otra pestaña (lo toca Joan: un window.open después de
   * esperar a la red lo bloquea el navegador). Imagen: la muestra en grande
   * aquí mismo. `w` es la ventana (window), para las pruebas.
   */
  function abrir(r, caja, w) {
    var W = w || (typeof window !== 'undefined' ? window : null), d = W && W.document, U = W && W.URL;
    if (!r || !r.ok || !W || !U || !U.createObjectURL || !d) return false;
    soltarUrl(U);
    var url = U.createObjectURL(r.blob);
    ULTIMA_URL = url;
    /* Se suelta sola al minuto: el enlace sirve una vez. */
    W.setTimeout(function () { if (ULTIMA_URL === url) soltarUrl(U); }, 60000);
    if (r.tipo === 'pdf') {
      if (!caja) return false;
      caja.innerHTML = '';
      var a = d.createElement('a');
      a.className = 'btn btn-rojo btn-sm';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.href = url;                       // como propiedad: nunca texto de un atributo
      a.textContent = 'Abrir el PDF (' + tamano(r.bytes) + ') en otra pestaña ↗';
      a.setAttribute('data-pension-pdf', '1');
      caja.appendChild(a);
      var n = d.createElement('div');
      n.className = 'muted'; n.style.fontSize = '12px'; n.style.marginTop = '4px';
      n.textContent = 'El enlace sirve un minuto. Si te pide contraseña, suele ser el número de documento del registro.';
      caja.appendChild(n);
      return true;
    }
    var fondo = d.createElement('div');
    fondo.id = 'pensionImagen';
    fondo.setAttribute('role', 'dialog');
    fondo.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.86);display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;padding:16px;gap:12px';
    var img = d.createElement('img');
    img.alt = 'Historia laboral (pantallazo)';
    img.style.cssText = 'max-width:100%;max-height:82vh;object-fit:contain;background:#fff;border-radius:8px';
    img.src = url;                        // como propiedad: nunca texto de un atributo
    var b = d.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Cerrar';
    b.style.background = '#fff';
    var cerrar = function () { if (fondo.parentNode) fondo.parentNode.removeChild(fondo); soltarUrl(U); };
    b.onclick = cerrar;
    fondo.onclick = function (ev) { if (ev && ev.target === fondo) cerrar(); };
    fondo.appendChild(img); fondo.appendChild(b);
    (d.body || d.documentElement).appendChild(fondo);
    return true;
  }
  function motivoEnPalabras(m) {
    return m === 'no_existe' ? 'Ese archivo ya no está: la persona lo quitó o se borró.'
      : m === 'no_coincide' ? 'Ese archivo no es lo que dice ser (sus primeros bytes no son de un PDF ni de una imagen). No lo abro: trata este registro con cuidado.'
      : 'No pude leer ese archivo.';
  }

  return {
    VERSION: '2026-10-28',
    TIPO_MIME: TIPO_MIME,
    tipoPorBytes: tipoPorBytes,
    resumen: resumen,
    de: de,
    borrar: borrar,
    traer: traer,
    abrir: abrir,
    chip: chip,
    bloque: bloque,
    nombresDeFondos: nombresDeFondos,
    motivoEnPalabras: motivoEnPalabras
  };
});
