/* ===========================================================================
 * MAPA-CLIENTES — la pestaña «🗺️ Mapa» del CRM.
 * 9 de noviembre de 2026.
 *
 * Joan, el 9-nov, escogió entre las maquetas: la opción 1, «Departamentos»
 * (Colombia pintada por cuántos clientes hay en cada departamento; al tocar
 * uno, sus municipios) MÁS la opción 3, «Conquistas» (los municipios donde ya
 * hay tres clientes que pagaron un crédito entero).
 *
 * LAS CUATRO REGLAS DE ESA DECISIÓN, y dónde se cumplen aquí:
 *   · ZONAS, NUNCA PUNTOS. Lo más fino es el municipio, y sale de la ciudad
 *     que escribió el cliente (panel/mapa-lugares.js). No se usa el GPS del
 *     registro ni ninguna coordenada de un cliente: las únicas coordenadas
 *     de esta pestaña son las de los límites oficiales, ya proyectadas dentro
 *     de panel/mapa/colombia-2026-11.json.
 *   · «1–2». Una zona con uno o dos clientes no dice cuántos: con tan pocos,
 *     la cifra exacta señala a una persona (y esta pantalla se puede mandar
 *     en un pantallazo). Vale para TODA cifra de personas de la pestaña:
 *     clientes, clientes que pagaron y lo que falta para conquistar (faltar
 *     «2» diría que hay exactamente uno que pagó). Ver cifra() y faltan().
 *     Y no basta con taparla en la zona: un total exacto la despejaba
 *     restando, y una lista ordenada por la cifra exacta la delataba por el
 *     orden. Ver visible(): todo total, color y orden sale de lo que se ve.
 *   · CONQUISTA = 3 clientes con un crédito PAGADO ENTERO en el municipio. Un
 *     cierre con pérdida («Se lo perdoné» perdiendo capital) no cuenta, y
 *     tampoco un crédito abierto. La regla de pagado no se inventa aquí: es
 *     la del motor, `p.pagado && !PUENTE.cerroConPerdida(p)` (app/puente.js),
 *     la misma de «Créditos pagados» del grupo y de los referidos.
 *   · SOLO LEE. La pestaña no escribe la cartera ni llama a guardar(): recibe
 *     DB, cuenta y pinta. Tampoco usa localStorage para recordar la vista.
 *
 * El mapa (570 KB) NO va en la precarga del service worker: se pide la
 * primera vez que Joan abre la pestaña y queda en memoria mientras el CRM
 * esté abierto. El service worker lo guarda al pasar (caché-primero para lo
 * que no es html/js/css), así que la segunda vez sale de ahí.
 *
 * Sin librerías: SVG escrito a mano, una sola asignación de innerHTML por
 * pintada y un solo oyente por caja (delegación).
 * ===========================================================================*/
/* La firma de llegada: el CRM pide este archivo con la versión en la
   dirección (…?v=143). Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./mapa-lugares.js'));
  else raiz.MapaClientes = fabrica(raiz.MapaLugares);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (L) {
  'use strict';

  var URL_MAPA = 'mapa/colombia-2026-11.json';
  var META = 3;   // clientes con un crédito pagado entero para conquistar un municipio
  var CREDITOS = 'Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)';

  function lista(v) { return Array.isArray(v) ? v : []; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* ------------------------------------------------------------------------
   * LO PURO: de la cartera y el mapa, las cuentas por zona.
   * ---------------------------------------------------------------------- */
  /* La regla del motor, sin copiarla: si el puente que llegó no la trae, no
     se cuenta ninguna conquista en vez de contar mal (un cierre con $0 sería
     un «pagó»). */
  function pagoEntero(puente) {
    var perdida = puente && typeof puente.cerroConPerdida === 'function' ? puente.cerroConPerdida : null;
    return function (p) { return !!(perdida && p && p.pagado && !perdida(p)); };
  }

  /* LO QUE SE VE DE UNA CIFRA DE PERSONAS, como rango [mín, máx].
     Tapar la cifra en la zona no basta. Con el total del departamento exacto,
     restando se despejaba la zona tapada: «Huila 5 · Neiva 3 · Pitalito 1–2»
     dice que Pitalito tiene 2. Y con las listas ordenadas por la cifra exacta,
     dos «1–2» fuera del abecedario decían cuál tenía 2 y cuál 1 (el revisor lo
     sacó de los pantallazos del 9-nov). Por eso, en esta pestaña, todo lo que
     se muestra, se colorea o se ordena sale de lo VISIBLE de cada municipio:
     exacto con 0 o con 3 o más, y [1, 2] con 1 o 2. Un total es la suma de
     esos rangos: si dentro hay alguna zona «1–2» sale en rango («Huila
     5–7»), y no dice nada que las zonas no digan ya. Las cifras exactas se
     quedan en resumir() para la cuenta de la conquista y no salen de ahí. */
  function visible(n) {
    var k = Number(n) || 0;
    return k === 1 || k === 2 ? { min: 1, max: 2 } : { min: k, max: k };
  }
  function cifraRango(r) {
    var x = r || { min: 0, max: 0 };
    if (x.min === x.max) return cifra(x.min);
    return x.min.toLocaleString('es-CO') + '–' + x.max.toLocaleString('es-CO');
  }
  /* Para ordenar y colorear: el punto medio del rango, que solo depende de lo
     que se ve (con 1 o con 2 da 1,5 en los dos casos). */
  function medio(r) { var x = r || { min: 0, max: 0 }; return (x.min + x.max) / 2; }
  function porNombre(a, b) { return String(a).localeCompare(String(b), 'es'); }

  function resumir(db, mapa, puente) {
    var idx = L.indice(mapa.municipios, mapa.departamentos);
    var pago = pagoEntero(puente);
    var pagaron = {};
    lista(db && db.prestamos).forEach(function (p) { if (pago(p)) pagaron[p.socioId] = true; });
    var porMuni = {}, porDepto = {}, sinUbicar = [], ubicados = 0;
    lista(db && db.socios).forEach(function (s) {
      var l = L.lugarDeCliente(s, idx);
      if (l.estado !== 'ubicado') {
        sinUbicar.push({ id: s.id, numero: s.numero, nombre: s.nombre, texto: l.texto, estado: l.estado,
          motivo: l.motivo, opciones: (l.opciones || []).map(function (c) {
            return (idx.nombre[c] || c) + ' (' + (idx.nombreDepto[c.slice(0, 2)] || c.slice(0, 2)) + ')';
          }) });
        return;
      }
      ubicados++;
      var m = porMuni[l.codigo] || (porMuni[l.codigo] = { clientes: 0, pagaron: 0 });
      var d = porDepto[l.depto] || (porDepto[l.depto] = { clientes: 0, pagaron: 0, rango: { min: 0, max: 0 } });
      m.clientes++; d.clientes++;
      if (pagaron[s.id]) { m.pagaron++; d.pagaron++; }
    });
    /* Los totales que se muestran: la suma de lo visible de cada municipio. */
    var rango = { min: 0, max: 0 };
    Object.keys(porMuni).forEach(function (c) {
      var v = visible(porMuni[c].clientes), d = porDepto[c.slice(0, 2)];
      d.rango.min += v.min; d.rango.max += v.max;
      rango.min += v.min; rango.max += v.max;
    });
    return { idx: idx, porMuni: porMuni, porDepto: porDepto, sinUbicar: sinUbicar, ubicados: ubicados, rango: rango,
      total: lista(db && db.socios).length, reglaDePago: !!(puente && typeof puente.cerroConPerdida === 'function') };
  }

  function conquistas(res, mapa) {
    var conquistados = [], porConquistar = [];
    Object.keys(res.porMuni).forEach(function (c) {
      var m = res.porMuni[c];
      var fila = { c: c, clientes: m.clientes, pagaron: m.pagaron };
      if (m.pagaron >= META) conquistados.push(fila); else porConquistar.push(fila);
    });
    /* El orden, solo con lo que se ve: primero lo más cerca de conquistarse
       («faltan 1–2» antes que «faltan 3»), después los que más clientes
       muestran y, en empate, el abecedario. Nunca la cifra exacta: con ella,
       el «faltan 1–2» de 2 pagados quedaba encima del de 1. */
    var clase = function (p) { return p >= META ? 2 : p > 0 ? 1 : 0; };
    var nombre = function (c) { return (res.idx && res.idx.nombre[c]) || c; };
    var orden = function (a, b) {
      return (clase(b.pagaron) - clase(a.pagaron)) || (medio(visible(b.clientes)) - medio(visible(a.clientes))) ||
        porNombre(nombre(a.c), nombre(b.c)) || porNombre(a.c, b.c);
    };
    conquistados.sort(orden); porConquistar.sort(orden);
    return { conquistados: conquistados, porConquistar: porConquistar,
      conClientes: Object.keys(res.porMuni).length, total: lista(mapa.municipios).length };
  }

  /* Toda cifra de PERSONAS de la pestaña pasa por aquí. */
  function cifra(n) { return L.cifraDiscreta(n); }
  function clientes(n) { return cifra(n) + ' clientes'; }
  /* Lo que falta para conquistar, sin revelar cuántos pagaron: si pagaron 1
     o 2, «faltan 1–2». Con 0, «faltan 3» (cero no señala a nadie). */
  function faltan(pagaron) {
    var p = Number(pagaron) || 0;
    if (p >= META) return '';
    if (p === 0) return 'faltan ' + META;
    return 'faltan 1–2';
  }
  /* Los tramos del color. 1 y 2 caen juntos: el color tampoco los separa. */
  function tramo(n) {
    var k = Number(n) || 0;
    return k <= 0 ? 0 : k <= 2 ? 1 : k <= 9 ? 2 : k <= 29 ? 3 : k <= 99 ? 4 : 5;
  }
  /* El de un total en rango: por su punto medio, no por la cifra exacta (un
     departamento con dos zonas «1–2» tiene 2, 3 o 4: el color no lo dice). */
  function tramoRango(r) { return tramo(medio(r)); }
  var TRAMOS = ['Sin clientes', '1–2', '3 a 9', '10 a 29', '30 a 99', '100 o más'];

  /* ------------------------------------------------------------------------
   * LA PANTALLA
   * ---------------------------------------------------------------------- */
  var E = { mapa: null, pidiendo: null, error: '', vista: 'deptos', depto: null, o: null, res: null };

  function traerMapa(pedir) {
    if (E.mapa) return Promise.resolve(E.mapa);
    if (E.pidiendo) return E.pidiendo;
    var f = pedir || (typeof fetch === 'function' ? function (u) { return fetch(u); } : null);
    if (!f) return Promise.reject(new Error('este navegador no puede pedir el mapa'));
    E.pidiendo = Promise.resolve(f(URL_MAPA)).then(function (r) {
      if (!r || !r.ok) throw new Error('el servidor contestó ' + (r ? r.status : 'nada'));
      return r.json();
    }).then(function (m) {
      if (!m || !lista(m.municipios).length || !lista(m.departamentos).length || !lista(m.caja).length) {
        throw new Error('llegó un archivo que no es el mapa');
      }
      E.mapa = m; E.error = '';
      return m;
    }).catch(function (e) { E.error = (e && e.message) || String(e); throw e; })
      .then(function (m) { E.pidiendo = null; return m; }, function (e) { E.pidiendo = null; throw e; });
    return E.pidiendo;
  }

  /* opciones: { caja, db, puente, abrirFicha(id), pedir(url) } */
  function abrir(opciones) {
    E.o = opciones || {};
    var caja = E.o.caja;
    if (!caja) return Promise.resolve(false);
    escuchar(caja);
    if (E.mapa) { pintar(); return Promise.resolve(true); }
    caja.innerHTML = '<div class="mapa-cargando" role="status">Bajando el mapa de Colombia…</div>';
    return traerMapa(E.o.pedir).then(function () { pintar(); return true; }, function () {
      caja.innerHTML = '<div class="alerta warn">No pude bajar el mapa (' + esc(E.error) + '). ' +
        'Si estás sin señal, se baja la primera vez que lo abras con internet; después queda guardado. ' +
        '<button class="btn btn-ghost btn-sm" data-mapa="reintentar">↻ Reintentar</button></div>';
      return false;
    });
  }

  function escuchar(caja) {
    if (caja._mapaOye) return;
    caja._mapaOye = true;
    caja.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-mapa]') : null;
      if (!t || !caja.contains(t)) return;
      var a = t.getAttribute('data-mapa');
      if (a === 'reintentar') { abrir(E.o); return; }
      if (a === 'vista') { E.vista = t.getAttribute('data-v') === 'conquistas' ? 'conquistas' : 'deptos'; E.depto = null; pintar(); return; }
      if (a === 'depto') { E.vista = 'deptos'; E.depto = t.getAttribute('data-c'); pintar(); return; }
      if (a === 'pais') { E.depto = null; pintar(); return; }
      if (a === 'muni') { contar(t.getAttribute('data-c')); return; }
      if (a === 'ficha') { var id = t.getAttribute('data-id'); if (E.o && typeof E.o.abrirFicha === 'function') E.o.abrirFicha(id); }
    });
    /* En el computador basta pasar el ratón: la línea de abajo dice qué es. */
    caja.addEventListener('mouseover', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-mapa="muni"],[data-mapa="depto"]') : null;
      if (t && t.tagName && t.tagName.toLowerCase() === 'path') contar(t.getAttribute('data-c'), t.getAttribute('data-mapa') === 'depto');
    });
  }

  /* La línea que dice qué es la zona tocada. */
  function contar(c, esDepto) {
    var info = E.o && E.o.caja && E.o.caja.querySelector('.mapa-info');
    if (!info || !E.res) return;
    info.textContent = esDepto || (c && c.length === 2) ? textoDepto(c) : textoMuni(c);
  }
  function textoDepto(c) {
    var d = E.res.porDepto[c];
    return nombreDepto(c) + ' · ' + (d && d.clientes ? cifraRango(d.rango) + ' clientes' : 'sin clientes');
  }
  function textoMuni(c) {
    var m = E.res.porMuni[c];
    var dep = deptoDeMuni(c);
    var base = (E.res.idx.nombre[c] || c) + (dep ? ' (' + dep + ')' : '');
    if (!m) return base + ' · sin clientes';
    if (E.vista === 'conquistas') {
      return base + ' · ' + clientes(m.clientes) + ' · ' + (m.pagaron >= META ? '🏁 conquistado' : faltan(m.pagaron) + ' para conquistarlo');
    }
    return base + ' · ' + clientes(m.clientes);
  }
  function nombreDepto(c) {
    var d = lista(E.mapa && E.mapa.departamentos).filter(function (x) { return x.c === c; })[0];
    return d ? (d.corto || d.n) : c;
  }
  /* El departamento que va al lado del nombre de un municipio. Bogotá es un
     departamento de un solo municipio, y salía «Bogotá, D.C. Bogotá D.C.»:
     ahí el nombre ya lo dice todo. */
  function deptoDeMuni(c) {
    var d = lista(E.mapa && E.mapa.departamentos).filter(function (x) { return x.c === c.slice(0, 2); })[0];
    if (!d) return c.slice(0, 2);
    return d.m === 1 ? '' : (d.corto || d.n);
  }

  function pintar() {
    var o = E.o, caja = o && o.caja;
    if (!caja || !E.mapa) return;
    var t0 = Date.now();
    E.res = resumir(o.db, E.mapa, o.puente);
    var h = cabeza();
    if (E.vista === 'conquistas') h += vistaConquistas();
    else if (E.depto) h += vistaDepto(E.depto);
    else h += vistaPais();
    h += sinUbicar() + '<p class="mapa-creditos">' + esc(CREDITOS) + '. Zonas, nunca puntos: cada cliente cae en el municipio que escribió en «Ciudad»; el mapa no usa el GPS del registro.</p>';
    caja.innerHTML = h;
    E.ms = Date.now() - t0;
  }

  function cabeza() {
    var b = function (v, t) {
      var on = E.vista === v;
      return '<button type="button" class="mapa-vista' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-mapa="vista" data-v="' + v + '">' + t + '</button>';
    };
    return '<div class="mapa-vistas" role="group" aria-label="Qué mostrar">' + b('deptos', 'Departamentos') + b('conquistas', '🏁 Conquistas') + '</div>';
  }

  /* Un <svg> con la caja que se pida y los caminos ya armados. */
  function svg(caja, cuerpo, clase, etiqueta) {
    return '<svg class="mapa-svg ' + clase + '" viewBox="' + caja.join(' ') + '" role="img" aria-label="' + esc(etiqueta) +
      '" preserveAspectRatio="xMidYMid meet">' + cuerpo + '</svg>';
  }
  function recuadro(r) {
    if (!r) return '';
    return '<rect class="mapa-recuadro" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>' +
      /* El nombre, en el mar entre las dos islas (Providencia arriba, San
         Andrés abajo): fuera del recuadro se montaba sobre el cabo Tiburón. */
      '<text class="mapa-recuadro-t" x="' + Math.round(r.x + r.w / 2) + '" y="' + Math.round(r.y + r.h / 2 - 40) + '" text-anchor="middle">San Andrés</text>' +
      '<text class="mapa-recuadro-t" x="' + Math.round(r.x + r.w / 2) + '" y="' + Math.round(r.y + r.h / 2 + 110) + '" text-anchor="middle">y Providencia</text>';
  }
  function leyenda(clase) {
    return '<div class="mapa-leyenda">' + TRAMOS.map(function (t, i) {
      return '<span><i class="' + clase + ' t' + i + '"></i>' + t + '</span>';
    }).join('') + '</div>';
  }

  /* Un total en rango se explica al lado: si no, «5–7 clientes» parecería
     un error de la cuenta. */
  function notaRango(r) {
    if (!r || r.min === r.max) return '';
    return '<p class="muted mapa-nota">Va en rango porque las zonas con 1 o 2 clientes no dicen su cifra: con el total exacto, restando se sabría.</p>';
  }

  function vistaPais() {
    var m = E.mapa, r = E.res;
    var caminos = m.departamentos.map(function (d) {
      return '<path class="mapa-z t' + tramoRango((r.porDepto[d.c] || {}).rango) + '" data-mapa="depto" data-c="' + esc(d.c) + '" d="' + d.d + '"><title>' + esc(textoDepto(d.c)) + '</title></path>';
    }).join('');
    var filas = m.departamentos.filter(function (d) { return r.porDepto[d.c]; })
      .sort(function (a, b) { return medio(r.porDepto[b.c].rango) - medio(r.porDepto[a.c].rango) || porNombre(a.corto || a.n, b.corto || b.n); })
      .map(function (d) {
        return '<li><button type="button" class="mapa-fila" data-mapa="depto" data-c="' + esc(d.c) + '"><span>' + esc(d.corto || d.n) +
          '</span><b>' + cifraRango(r.porDepto[d.c].rango) + '</b></button></li>';
      }).join('');
    var sinClientes = m.departamentos.length - Object.keys(r.porDepto).length;
    return '<div class="mapa-cuerpo"><div class="mapa-lienzo">' +
      svg([0, 0].concat(m.caja), recuadro(m.recuadro) + caminos, 'mapa-papel', 'Colombia por departamentos, coloreada por número de clientes') +
      '<div class="mapa-info" aria-live="polite">Toca un departamento para ver sus municipios.</div>' + leyenda('mapa-z') + '</div>' +
      '<div class="mapa-lado"><div class="mapa-total"><b>' + cifraRango(r.rango) + '</b> de tus clientes están en el mapa' +
      (r.total - r.ubicados ? ' · ' + (r.total - r.ubicados).toLocaleString('es-CO') + ' sin ubicar (abajo)' : '') + '</div>' + notaRango(r.rango) +
      (filas ? '<ol class="mapa-lista">' + filas + '</ol>' : '<p class="muted">Todavía no hay clientes con una ciudad que se pueda ubicar.</p>') +
      (sinClientes ? '<p class="muted">' + sinClientes + ' departamento' + (sinClientes === 1 ? '' : 's') + ' sin clientes.</p>' : '') +
      '</div></div>';
  }

  function vistaDepto(c) {
    var m = E.mapa, r = E.res;
    var d = m.departamentos.filter(function (x) { return x.c === c; })[0];
    if (!d) { E.depto = null; return vistaPais(); }
    var b = d.b, ancho = b[2] - b[0], alto = b[3] - b[1], pad = Math.max(ancho, alto) * 0.04;
    var caja = [b[0] - pad, b[1] - pad, ancho + 2 * pad, alto + 2 * pad].map(function (x) { return Math.round(x); });
    var munis = m.municipios.filter(function (x) { return x.c.slice(0, 2) === c; });
    var caminos = munis.map(function (x) {
      var k = (r.porMuni[x.c] || {}).clientes || 0;
      return '<path class="mapa-z t' + tramo(k) + '" data-mapa="muni" data-c="' + esc(x.c) + '" d="' + x.d + '"><title>' + esc(textoMuni(x.c)) + '</title></path>';
    }).join('') + '<path class="mapa-borde" d="' + d.d + '"/>';
    var con = munis.filter(function (x) { return r.porMuni[x.c]; })
      .sort(function (a, b2) { return medio(visible(r.porMuni[b2.c].clientes)) - medio(visible(r.porMuni[a.c].clientes)) || porNombre(a.n, b2.n) || porNombre(a.c, b2.c); });
    var rangoD = (r.porDepto[c] || {}).rango;
    var filas = con.map(function (x) {
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x.c) + '"><span>' + esc(x.n) + '</span><b>' + cifra(r.porMuni[x.c].clientes) + '</b></button></li>';
    }).join('');
    return '<div class="mapa-cuerpo"><div class="mapa-lienzo">' +
      '<button type="button" class="btn btn-ghost btn-sm mapa-volver" data-mapa="pais">← Toda Colombia</button>' +
      svg(caja, caminos, 'mapa-papel', d.n + ' por municipios, coloreado por número de clientes') +
      '<div class="mapa-info" aria-live="polite">' + esc(textoDepto(c)) + ' · toca un municipio.</div>' + leyenda('mapa-z') + '</div>' +
      '<div class="mapa-lado"><h3 class="mapa-h">' + esc(d.n) + '</h3><div class="mapa-total"><b>' + cifraRango(rangoD) +
      '</b> clientes · ' + con.length + ' de ' + d.m + ' municipios con clientes</div>' + notaRango(rangoD) +
      (filas ? '<ol class="mapa-lista">' + filas + '</ol>' : '<p class="muted">Ningún cliente ubicado aquí.</p>') + '</div></div>';
  }

  function vistaConquistas() {
    var m = E.mapa, r = E.res, q = conquistas(r, m);
    var estado = {};
    q.conquistados.forEach(function (x) { estado[x.c] = 'conq'; });
    q.porConquistar.forEach(function (x) { estado[x.c] = 'con'; });
    var caminos = m.municipios.map(function (x) {
      return '<path class="mapa-q ' + (estado[x.c] || 'vacio') + '" data-mapa="muni" data-c="' + esc(x.c) + '" d="' + x.d + '"><title>' + esc(textoMuni(x.c)) + '</title></path>';
    }).join('') + m.departamentos.map(function (d) { return '<path class="mapa-borde" d="' + d.d + '"/>'; }).join('');
    var fila = function (x) {
      var dep = deptoDeMuni(x.c);
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x.c) + '"><span>' + esc(r.idx.nombre[x.c] || x.c) +
        (dep ? ' <small>' + esc(dep) + '</small>' : '') + '</span><b>' + (x.pagaron >= META ? '🏁' : esc(faltan(x.pagaron))) + '</b></button></li>';
    };
    var aviso = r.reglaDePago ? '' : '<div class="alerta warn">Este computador tiene una versión vieja de app/puente.js y no sé distinguir un crédito pagado de uno cerrado con pérdida: no cuento ninguna conquista. Recárgalo con Ctrl+Shift+R.</div>';
    return aviso + '<div class="mapa-cuerpo"><div class="mapa-lienzo mapa-laca">' +
      svg([0, 0].concat(m.caja), recuadro(m.recuadro) + caminos, 'mapa-oscuro', 'Colombia por municipios: conquistados, con clientes y sin clientes') +
      '<div class="mapa-info" aria-live="polite">Un municipio se conquista con ' + META + ' clientes que pagaron un crédito entero. Un cierre con pérdida no cuenta.</div>' +
      '<div class="mapa-leyenda mapa-leyenda-q"><span><i class="mapa-q conq"></i>Conquistado</span><span><i class="mapa-q con"></i>Con clientes</span><span><i class="mapa-q vacio"></i>Sin clientes</span></div></div>' +
      '<div class="mapa-lado"><div class="mapa-kpis">' +
      '<div><b>' + q.conquistados.length.toLocaleString('es-CO') + '</b><span>conquistados</span></div>' +
      '<div><b>' + q.conClientes.toLocaleString('es-CO') + '</b><span>con clientes</span></div>' +
      '<div><b>' + q.total.toLocaleString('es-CO') + '</b><span>municipios</span></div></div>' +
      (q.conquistados.length ? '<h3 class="mapa-h">🏁 Conquistados</h3><ol class="mapa-lista">' + q.conquistados.map(fila).join('') + '</ol>' : '') +
      (q.porConquistar.length ? '<h3 class="mapa-h">Por conquistar</h3><ol class="mapa-lista">' + q.porConquistar.map(fila).join('') + '</ol>'
        : (q.conquistados.length ? '' : '<p class="muted">Todavía no hay clientes con una ciudad que se pueda ubicar.</p>')) +
      '</div></div>';
  }

  /* Los que no se pudieron ubicar: con su número, lo que escribieron, por qué
     no, y el botón a su ficha para que Joan lo corrija (la pestaña no lo
     corrige sola: solo lee). Cerrado de entrada: son nombres de personas. */
  function sinUbicar() {
    var l = E.res.sinUbicar;
    if (!l.length) return '';
    var filas = l.slice().sort(function (a, b) { return (Number(a.numero) || 0) - (Number(b.numero) || 0); }).map(function (x) {
      var porque = x.estado === 'vacio' ? 'Sin ciudad en la ficha.'
        /* Con una sola opción no es un nombre repetido: es «Colombia», que
           también es el país. Lo dice su motivo. */
        : x.estado === 'ambiguo' ? (x.opciones.length > 1 ? 'Sin ubicar (nombre repetido): ' + x.opciones.join(' o ') + '.'
          : 'Sin ubicar: ' + (x.motivo || 'nombre repetido') + '.')
        : x.estado === 'otro-depto' ? 'La ciudad no está en el departamento que escribió (' + x.opciones.join(' o ') + ').'
        : 'No reconozco esa ciudad.';
      return '<li><div><b>' + (x.numero != null && x.numero !== '' ? '#' + esc(x.numero) + ' ' : '') + esc(x.nombre || 'Sin nombre') + '</b>' +
        (x.texto ? ' · escribió «' + esc(x.texto) + '»' : '') + '<div class="muted">' + esc(porque) + '</div></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-mapa="ficha" data-id="' + esc(x.id) + '">Abrir ficha</button></li>';
    }).join('');
    return '<details class="mapa-sin"><summary>⚠️ ' + l.length.toLocaleString('es-CO') + ' cliente' + (l.length === 1 ? '' : 's') +
      ' sin ubicar — no salen en el mapa</summary><p class="muted">Corrige «Ciudad» en la ficha. Si el nombre está en dos departamentos, escríbelo con el suyo: «Mosquera, Cundinamarca».</p><ol>' + filas + '</ol></details>';
  }

  return {
    URL_MAPA: URL_MAPA,
    META: META,
    CREDITOS: CREDITOS,
    resumir: resumir,
    conquistas: conquistas,
    pagoEntero: pagoEntero,
    cifra: cifra,
    visible: visible,
    cifraRango: cifraRango,
    faltan: faltan,
    tramo: tramo,
    abrir: abrir,
    _estado: E
  };
});
