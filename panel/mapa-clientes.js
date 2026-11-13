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
 *     de panel/mapa/colombia-2026-11b.json (y el punto donde va el NOMBRE de
 *     cada municipio, que también es del mapa, no de nadie).
 *   · «1–2». Una zona con uno o dos clientes no dice cuántos: con tan pocos,
 *     la cifra exacta señala a una persona (y esta pantalla se puede mandar
 *     en un pantallazo). Vale para TODA cifra de personas de la pestaña:
 *     clientes, clientes que pagaron y lo que falta para conquistar (faltar
 *     «2» diría que hay exactamente uno que pagó). Ver cifra() y faltan().
 *     Y no basta con taparla en la zona: un total exacto la despejaba
 *     restando, y una lista ordenada por la cifra exacta la delataba por el
 *     orden. Ver visible(): todo total, color y orden sale de lo que se ve.
 *     Las etiquetas y el globito del 13-nov pasan por las mismas funciones.
 *   · CONQUISTA = 3 clientes con un crédito PAGADO ENTERO en el municipio. Un
 *     cierre con pérdida («Se lo perdoné» perdiendo capital) no cuenta, y
 *     tampoco un crédito abierto. La regla de pagado no se inventa aquí: es
 *     la del motor, `p.pagado && !PUENTE.cerroConPerdida(p)` (app/puente.js),
 *     la misma de «Créditos pagados» del grupo y de los referidos.
 *   · SOLO LEE. La pestaña no escribe la cartera ni llama a guardar(): recibe
 *     DB, cuenta y pinta. Tampoco usa localStorage para recordar la vista.
 *
 * 13-nov-2026 — «QUIERO QUE SE MEJORE EL MAPA YA QUE NO SE VEN LOS
 * MUNICIPIOS» (Joan). En las capturas: Cundinamarca en beige con bordes
 * blancos que no se veían, sin un solo nombre; el «1–2» en un azul casi
 * blanco; Bogotá como un hueco en blanco en medio de Cundinamarca, justo donde
 * están los clientes; y en «Conquistas» los municipios eran puntitos. Lo que
 * se hizo, y dónde:
 *   · LOS NOMBRES, en el mapa (etiquetas()): en un departamento abierto, el de
 *     cada municipio con clientes, siempre; en Colombia y en Conquistas, los
 *     que quepan sin taparse (colocarEtiquetas()). Los demás, en un globito
 *     al pasar el ratón o al tocar (mostrarGlobo()).
 *   · BORDES Y COLORES MEDIDOS (la hoja): cada borde contra su relleno a 3:1
 *     o más, y la escala con pasos que se distinguen; la prueba los mide.
 *   · LOS MUNICIPIOS CON CLIENTES MARCADOS en la vista de Colombia, con un
 *     contorno de dos tonos que no tapa el color del departamento.
 *   · LOS HUECOS (vistaDepto()): al abrir Cundinamarca, Bogotá se pinta en su
 *     sitio, con su nombre y su cifra, y se toca como los demás.
 *   · EL ZOOM (aplicar() y los oyentes de escuchar()): ＋ y －, la rueda, el
 *     pellizco, arrastrar y «Volver a ver todo». Cambia el viewBox; el texto
 *     mide lo mismo en pantalla porque su tamaño va en --k (unidades del mapa
 *     por píxel). La rueda NO roba el scroll de la página, ni el dedo el del
 *     celular: ver «LA RUEDA ES DE LA PÁGINA» y «EL DEDO ES DE LA PÁGINA».
 *   · EL BUSCADOR («Buscar municipio…»): lo encuentra, abre su departamento,
 *     lo centra y lo resalta (irAMunicipio()).
 *
 * El mapa (590 KB) NO va en la precarga del service worker: se pide la
 * primera vez que Joan abre la pestaña y queda en memoria mientras el CRM
 * esté abierto. El service worker lo guarda al pasar (caché-primero para lo
 * que no es html/js/css), así que la segunda vez sale de ahí. Por eso, cuando
 * el archivo cambia, cambia de NOMBRE (la «b» del 13-nov): con el mismo, el
 * service worker seguiría sirviendo el de antes.
 *
 * Sin librerías: SVG escrito a mano, una sola asignación de innerHTML por
 * pintada y oyentes en la caja (delegación). El zoom no vuelve a pintar:
 * mueve el viewBox y prende o apaga etiquetas.
 * ===========================================================================*/
/* La firma de llegada: el CRM pide este archivo con la versión en la
   dirección (…?v=145). Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./mapa-lugares.js'));
  else raiz.MapaClientes = fabrica(raiz.MapaLugares);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (L) {
  'use strict';

  var URL_MAPA = 'mapa/colombia-2026-11b.json';
  var META = 3;   // clientes con un crédito pagado entero para conquistar un municipio
  var CREDITOS = 'Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)';

  /* EL ZOOM. Cada ＋ o － acerca o aleja 1,6 veces. Lo más cerca que se
     llega es una ventana de 100 unidades del mapa (unos 23 km): más adentro,
     el borde simplificado (redondeado a enteros) ya se ve en escalones. */
  var PASO = 1.6;
  var ANCHO_MIN = 100;
  /* LAS ETIQUETAS miden TAM píxeles en pantalla con cualquier zoom. El ancho
     se estima (0,6 de la letra por carácter, que es lo que ocupa Inter en
     negrita) porque medirlo de verdad obligaría a pintar dos veces. */
  var TAM = 12;

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
    /* `dudosos`: por municipio, cuántos sin ubicar escribieron un nombre que
       puede ser ese (nombre repetido: «Mosquera» a secas es de Cundinamarca o
       de Nariño). Sin eso, quien buscaba Mosquera leía «sin clientes» aunque
       hubiera clientes que escribieron Mosquera. */
    var porMuni = {}, porDepto = {}, sinUbicar = [], ubicados = 0, dudosos = {};
    lista(db && db.socios).forEach(function (s) {
      var l = L.lugarDeCliente(s, idx);
      if (l.estado !== 'ubicado') {
        if (l.estado === 'ambiguo') lista(l.opciones).forEach(function (c) { dudosos[c] = (dudosos[c] || 0) + 1; });
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
    return { idx: idx, porMuni: porMuni, porDepto: porDepto, sinUbicar: sinUbicar, dudosos: dudosos, ubicados: ubicados, rango: rango,
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
   * LA GEOMETRÍA QUE HACE FALTA AQUÍ: la caja de un municipio (para centrarlo
   * al buscarlo) y el paso entre la pantalla y el mapa (para el zoom).
   * ---------------------------------------------------------------------- */
  /* La caja de un «d» del mapa: M absoluto por anillo y el resto relativo. */
  function cajaDe(d) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (String(d || '').match(/M[^M]*/g) || []).forEach(function (parte) {
      var n = (parte.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      var x = n[0], y = n[1];
      for (var i = 0; i + 1 < n.length; i += 2) {
        if (i) { x += n[i]; y += n[i + 1]; }
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      }
    });
    return b[0] === Infinity ? null : b;
  }
  /* Dónde va el nombre: el `p` del mapa (el polo de inaccesibilidad, ver
     herramientas/mapa-colombia.js); sin él, el centro de la caja. */
  function puntoDe(m) {
    if (m && Array.isArray(m.p) && m.p.length === 2) return m.p;
    var b = cajaDe(m && m.d);
    return b ? [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)] : [0, 0];
  }
  /* Unidades del mapa por píxel. El <svg> va con preserveAspectRatio meet: el
     dibujo cabe entero y centrado, así que manda el lado más apretado. */
  function escalaDe(vb, r) { return Math.max(vb[2] / r.width, vb[3] / r.height); }
  /* Del punto de la pantalla (clientX, clientY) al del mapa, y al revés. */
  function aMapa(vb, r, cx, cy) {
    var s = escalaDe(vb, r);
    return [vb[0] + (cx - r.left - (r.width - vb[2] / s) / 2) * s, vb[1] + (cy - r.top - (r.height - vb[3] / s) / 2) * s];
  }
  function aPantalla(vb, r, x, y) {
    var s = escalaDe(vb, r);
    return [r.left + (r.width - vb[2] / s) / 2 + (x - vb[0]) / s, r.top + (r.height - vb[3] / s) / 2 + (y - vb[1]) / s];
  }
  /* La ventana nunca sale del mapa ni lo achica (no hay «más lejos que
     todo»), y guarda siempre la proporción de la de base: el <svg> mide su
     alto por la del viewBox, y otra proporción lo haría saltar de tamaño. */
  function anchoMinimo(base) { return Math.min(ANCHO_MIN, base[2]); }
  function limitar(vb, base) {
    if (vb[2] >= base[2]) return base.slice();
    var w = Math.max(vb[2], anchoMinimo(base));
    var h = w * base[3] / base[2];
    var cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
    var x = Math.min(Math.max(cx - w / 2, base[0]), base[0] + base[2] - w);
    var y = Math.min(Math.max(cy - h / 2, base[1]), base[1] + base[3] - h);
    return [x, y, w, h];
  }
  function mismaVentana(a, b) {
    for (var i = 0; i < 4; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
    return true;
  }
  /* Acercar `factor` veces dejando quieto el punto del mapa `p`. */
  function acercar(vb, base, factor, p) {
    var w = Math.min(Math.max(vb[2] / factor, anchoMinimo(base)), base[2]);
    var f = vb[2] / w;
    var punto = p || [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
    return limitar([punto[0] - (punto[0] - vb[0]) / f, punto[1] - (punto[1] - vb[1]) / f, w, w * base[3] / base[2]], base);
  }

  /* LAS ETIQUETAS QUE CABEN. `ets` va en orden de prioridad (lo que más
     clientes muestra primero: el orden sale de lo VISIBLE, como las listas).
     Cada una ocupa su ancho y alto en píxeles, que en el mapa son `s` veces
     eso. Una etiqueta «siempre» (las de un departamento abierto) se pone
     aunque choque: prueba primero en su sitio, después encima y debajo, y si
     no hay hueco se queda en su sitio. Las demás solo salen si no tapan a una
     ya puesta. Lo que queda fuera de la ventana no cuenta. Y la que se sale
     por un lado de la ventana (su punto adentro, el texto afuera) se corre
     hacia adentro (`dx`): sin eso, en Cundinamarca se leía «irardot 1–2». */
  function colocarEtiquetas(ets, vb, s) {
    var puestas = [], r = [];
    var choca = function (b) {
      for (var i = 0; i < puestas.length; i++) {
        var o = puestas[i];
        if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
      }
      return false;
    };
    lista(ets).forEach(function (e) {
      var w = e.w * s, h = e.h * s;
      var x0 = e.x - w / 2, x1 = e.x + w / 2;
      if (x1 < vb[0] || x0 > vb[0] + vb[2] || e.y + h < vb[1] || e.y - h > vb[1] + vb[3]) {
        r.push({ ver: !!e.siempre, dy: 0, dx: 0 });
        return;
      }
      var dx = 0;
      if (w < vb[2] && e.x >= vb[0] && e.x <= vb[0] + vb[2]) {
        if (x0 < vb[0]) dx = vb[0] - x0;
        else if (x1 > vb[0] + vb[2]) dx = vb[0] + vb[2] - x1;
      }
      x0 += dx; x1 += dx;
      var opciones = e.siempre ? [0, -h, h] : [0];
      for (var i = 0; i < opciones.length; i++) {
        var b = [x0, e.y + opciones[i] - h / 2, x1, e.y + opciones[i] + h / 2];
        if (!choca(b)) { puestas.push(b); r.push({ ver: true, dy: opciones[i], dx: dx }); return; }
      }
      if (e.siempre) { puestas.push([x0, e.y - h / 2, x1, e.y + h / 2]); r.push({ ver: true, dy: 0, dx: dx }); return; }
      r.push({ ver: false, dy: 0, dx: 0 });
    });
    return r;
  }
  function anchoEtiqueta(texto) { return Math.ceil(String(texto).length * TAM * 0.6) + 8; }

  /* ------------------------------------------------------------------------
   * LA PANTALLA
   * ---------------------------------------------------------------------- */
  var E = { mapa: null, pidiendo: null, error: '', vista: 'deptos', depto: null, o: null, res: null,
    /* Lo del zoom y las etiquetas de la vista pintada (se rehace en cada pintar()). */
    z: null, vb0: null, ets: [], dedos: {}, gesto: null, cuadro: 0,
    /* La rueda: si el ratón se movió de verdad sobre el mapa después del
       último scroll de la página (ver «LA RUEDA ES DE LA PÁGINA»). */
    ratonListo: false, ultimoScroll: 0, ultimoZoom: 0, trasArrastre: 0,
    sug: [], sugSel: -1, globo: null, porCodigo: null, normas: null, observador: null, ultPos: null,
    reloj: function () { return Date.now(); } };

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
      E.mapa = m; E.error = ''; E.porCodigo = null; E.normas = null;
      return m;
    }).catch(function (e) { E.error = (e && e.message) || String(e); throw e; })
      .then(function (m) { E.pidiendo = null; return m; }, function (e) { E.pidiendo = null; throw e; });
    return E.pidiendo;
  }
  function muni(c) {
    if (!E.porCodigo) {
      E.porCodigo = {};
      lista(E.mapa && E.mapa.municipios).forEach(function (m) { E.porCodigo[m.c] = m; });
    }
    return E.porCodigo[c] || null;
  }
  function depto(c) { return lista(E.mapa && E.mapa.departamentos).filter(function (x) { return x.c === c; })[0] || null; }

  /* opciones: { caja, db, puente, abrirFicha(id), pedir(url), doc } */
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

  function q(sel) {
    var caja = E.o && E.o.caja;
    return caja && typeof caja.querySelector === 'function' ? caja.querySelector(sel) : null;
  }
  function clase(el, nombre, si) {
    if (!el || !el.classList) return;
    if (si) el.classList.add(nombre); else el.classList.remove(nombre);
  }
  function medir(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    var r = el.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r : null;
  }
  function svgDe(t) { return t && typeof t.closest === 'function' ? t.closest('svg.mapa-svg') : null; }
  function zonaDe(t) {
    var z = t && typeof t.closest === 'function' ? t.closest('[data-mapa="muni"],[data-mapa="depto"]') : null;
    return z && z.tagName && String(z.tagName).toLowerCase() === 'path' ? z : null;
  }

  function escuchar(caja) {
    if (caja._mapaOye) return;
    caja._mapaOye = true;
    caja.addEventListener('click', function (ev) {
      /* Lo que termina un arrastre no es un toque: soltar el ratón encima de
         Cundinamarca después de mover el mapa no la abre. */
      if (E.trasArrastre && E.reloj() - E.trasArrastre < 600 && svgDe(ev.target)) { E.trasArrastre = 0; return; }
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-mapa]') : null;
      var enBuscador = ev.target && ev.target.closest ? ev.target.closest('.mapa-busca') : null;
      if (!enBuscador) cerrarSugerencias();
      if (!t || !caja.contains(t)) return;
      var a = t.getAttribute('data-mapa');
      if (a === 'reintentar') { abrir(E.o); return; }
      if (a === 'vista') { E.vista = t.getAttribute('data-v') === 'conquistas' ? 'conquistas' : 'deptos'; E.depto = null; pintar(); return; }
      if (a === 'depto') { E.vista = 'deptos'; E.depto = t.getAttribute('data-c'); pintar(); verMapa(); return; }
      if (a === 'pais') { E.depto = null; pintar(); verMapa(); return; }
      if (a === 'zoom') { zoomBoton(t.getAttribute('data-z')); return; }
      if (a === 'buscado') { irAMunicipio(t.getAttribute('data-c')); return; }
      if (a === 'muni') {
        var c = t.getAttribute('data-c');
        contar(c); marcar(c);
        /* Tocado en el mapa: el globito donde tocó. Desde la lista: sobre el
           nombre del municipio en el mapa, si está a la vista. */
        if (zonaDe(t) && typeof ev.clientX === 'number') mostrarGlobo(c, false, ev.clientX, ev.clientY); else globoEn(c);
        verLinea();
        return;
      }
      if (a === 'ficha') { var id = t.getAttribute('data-id'); if (E.o && typeof E.o.abrirFicha === 'function') E.o.abrirFicha(id); }
    });
    /* En el computador basta pasar el ratón: la línea de abajo dice qué es, y
       el globito, al lado del ratón. */
    caja.addEventListener('mouseover', function (ev) {
      var t = zonaDe(ev.target);
      if (!t) return;
      var esDepto = t.getAttribute('data-mapa') === 'depto';
      contar(t.getAttribute('data-c'), esDepto);
      if (!E.gesto && typeof ev.clientX === 'number') mostrarGlobo(t.getAttribute('data-c'), esDepto, ev.clientX, ev.clientY);
    });
    caja.addEventListener('mouseleave', function () { ocultarGlobo(); E.ratonListo = false; });
    caja.addEventListener('pointerdown', alApretar);
    caja.addEventListener('pointermove', alMover);
    caja.addEventListener('pointerup', alSoltar);
    caja.addEventListener('pointercancel', alSoltar);
    caja.addEventListener('wheel', alRodar, { passive: false });
    caja.addEventListener('input', function (ev) { if (esBuscador(ev.target)) sugerir(ev.target.value); });
    caja.addEventListener('keydown', function (ev) { if (esBuscador(ev.target)) teclaBuscador(ev); });
    /* El scroll de la página, en captura para verlo venga de donde venga
       (scroll no burbujea). Solo anota la hora. */
    var doc = E.o && E.o.doc ? E.o.doc : (typeof document !== 'undefined' ? document : null);
    if (doc && typeof doc.addEventListener === 'function' && !doc._mapaScroll) {
      doc._mapaScroll = true;
      doc.addEventListener('scroll', function () { E.ultimoScroll = E.reloj(); E.ratonListo = false; }, { capture: true, passive: true });
    }
  }

  /* ------------------------------------------------------------------------
   * EL ZOOM
   * ---------------------------------------------------------------------- */
  function ampliado() { return !!(E.z && E.z.vb[2] < E.z.base[2] - 0.5); }
  function prepararZoom() {
    var svg = q('svg.mapa-svg');
    E.dedos = {}; E.gesto = null; E.globo = null;
    E.z = E.vb0 ? { base: E.vb0.slice(), vb: E.vb0.slice(), s: E.vb0[2] / 600,
      svg: svg && typeof svg.setAttribute === 'function' ? svg : null, els: null } : null;
    /* Si el mapa cambia de ancho (el celular se gira, la ventana se achica),
       un píxel ya no mide lo mismo: --k y las etiquetas se rehacen. */
    if (E.observador) { E.observador.disconnect(); E.observador = null; }
    if (E.z && E.z.svg && typeof ResizeObserver === 'function') {
      E.observador = new ResizeObserver(function () { pedirCuadro(); });
      E.observador.observe(E.z.svg);
    }
    aplicar();
  }
  /* Lo único que hace el zoom: mover la ventana, decirle al texto cuánto mide
     un píxel (--k) y volver a ver qué etiquetas caben. No vuelve a pintar. */
  function aplicar() {
    var z = E.z;
    if (!z || !z.svg) return;
    z.svg.setAttribute('viewBox', z.vb.map(function (v) { return Math.round(v * 10) / 10; }).join(' '));
    var r = medir(z.svg);
    z.s = r ? escalaDe(z.vb, r) : z.vb[2] / 600;
    if (z.svg.style && typeof z.svg.style.setProperty === 'function') z.svg.style.setProperty('--k', String(Math.round(z.s * 1000) / 1000));
    var amp = ampliado();
    /* EL DEDO ES DE LA PÁGINA. Sin ampliar, el mapa deja pasar el dedo
       vertical (touch-action: pan-y, en la hoja): el celular baja la página
       aunque el dedo empiece encima del mapa, y el pellizco sí es del mapa.
       Ampliado, un dedo lo arrastra; «Volver a ver todo» lo suelta. */
    clase(z.svg, 'ampliado', amp);
    var todo = q('[data-z="todo"]'), menos = q('[data-z="menos"]'), mas = q('[data-z="mas"]');
    if (todo) todo.disabled = !amp;
    if (menos) menos.disabled = !amp;
    if (mas) mas.disabled = z.vb[2] <= anchoMinimo(z.base) + 0.5;
    colocar();
  }
  function colocar() {
    var z = E.z;
    if (!z || !z.svg || !E.ets.length) return;
    if (!z.els) z.els = typeof z.svg.querySelectorAll === 'function' ? z.svg.querySelectorAll('text.mapa-et') : [];
    var r = colocarEtiquetas(E.ets, z.vb, z.s);
    for (var i = 0; i < r.length && i < z.els.length; i++) {
      var e = E.ets[i], el = z.els[i];
      if (r[i].ver !== e.ver) { clase(el, 'oculta', !r[i].ver); e.ver = r[i].ver; }
      if (r[i].dy !== e.dy && typeof el.setAttribute === 'function') {
        el.setAttribute('y', String(Math.round((e.y + r[i].dy) * 10) / 10)); e.dy = r[i].dy;
      }
      if ((r[i].dx || 0) !== (e.dx || 0) && typeof el.setAttribute === 'function') {
        el.setAttribute('x', String(Math.round((e.x + r[i].dx) * 10) / 10)); e.dx = r[i].dx;
      }
    }
  }
  /* En un gesto llegan muchos movimientos por cuadro: se aplica uno. */
  function pedirCuadro() {
    if (typeof requestAnimationFrame !== 'function') { aplicar(); return; }
    if (E.cuadro) return;
    E.cuadro = requestAnimationFrame(function () { E.cuadro = 0; aplicar(); });
  }
  function zoomBoton(cual) {
    var z = E.z;
    if (!z) return;
    ocultarGlobo();
    if (cual === 'todo') z.vb = z.base.slice();
    else z.vb = acercar(z.vb, z.base, cual === 'menos' ? 1 / PASO : PASO);
    aplicar();
  }

  /* LA RUEDA ES DE LA PÁGINA. Una rueda que hace zoom cada vez que el mapa
     pasa debajo del ratón se roba el scroll: Joan baja por la pestaña, el
     mapa llega al ratón y la página se frena. Por eso la rueda solo acerca
     cuando el ratón se MOVIÓ sobre el mapa después del último scroll (ver
     alMover; un movimiento que llega pegado al scroll es el que inventa el
     navegador, no la mano), o con Ctrl (y el pellizco del trackpad, que llega
     como Ctrl + rueda). Y en el tope —todo el mapa a la vista y la rueda
     alejando, o lo más cerca y acercando— la rueda vuelve a ser de la página,
     salvo justo después de un zoom (la inercia del trackpad). */
  function alRodar(ev) {
    var z = E.z, svg = svgDe(ev.target);
    if (!z || !z.svg || !svg) return;
    if (!ev.ctrlKey && !E.ratonListo) return;
    var r = medir(z.svg);
    var unidad = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? 800 : 1;
    var factor = Math.pow(ev.ctrlKey ? 1.01 : 1.0015, -(Number(ev.deltaY) || 0) * unidad);
    var nuevo = acercar(z.vb, z.base, factor, r && typeof ev.clientX === 'number' ? aMapa(z.vb, r, ev.clientX, ev.clientY) : null);
    var ahora = E.reloj();
    if (mismaVentana(nuevo, z.vb)) {
      /* Con Ctrl, la rueda de la página sería el zoom de TODA la página. */
      if ((ev.ctrlKey || ahora - E.ultimoZoom < 400) && typeof ev.preventDefault === 'function') ev.preventDefault();
      return;
    }
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    E.ultimoZoom = ahora;
    z.vb = nuevo;
    ocultarGlobo();
    pedirCuadro();
  }

  /* ARRASTRAR Y PELLIZCAR, con eventos de puntero (ratón, dedo y lápiz por
     el mismo camino). Un ratón arrastra siempre; un dedo solo con el mapa
     ampliado (si no, es la página: ver «EL DEDO ES DE LA PÁGINA»); dos dedos
     pellizcan siempre. */
  function umbral(tipo) { return tipo === 'mouse' ? 5 : 8; }
  function alApretar(ev) {
    var z = E.z;
    if (!z || !z.svg || !svgDe(ev.target)) return;
    if (ev.pointerType === 'mouse' && ev.button) return;
    E.dedos[ev.pointerId] = { x: ev.clientX, y: ev.clientY, tipo: ev.pointerType };
    empezarGesto();
  }
  function empezarGesto() {
    var ids = Object.keys(E.dedos);
    if (!ids.length || !E.z) { E.gesto = null; return; }
    E.gesto = { vb: E.z.vb.slice(), r: medir(E.z.svg), movido: !!(E.gesto && E.gesto.movido),
      ini: ids.slice(0, 2).map(function (id) { return { id: id, x: E.dedos[id].x, y: E.dedos[id].y }; }) };
  }
  function alMover(ev) {
    var d = E.dedos[ev.pointerId];
    /* Un ratón que se soltó fuera de la caja antes de ser arrastre (sin
       captura, ese pointerup no llega aquí): sin botones, ya no arrastra. */
    if (d && ev.pointerType === 'mouse' && !ev.buttons) { alSoltar({ pointerId: ev.pointerId, type: 'pointercancel' }); d = null; }
    if (!d) {
      if (ev.pointerType === 'mouse') pasarRaton(ev);
      return;
    }
    d.x = ev.clientX; d.y = ev.clientY;
    var g = E.gesto, z = E.z;
    if (!g || !z || !g.r) return;
    var nuevo = null;
    if (g.ini.length >= 2 && E.dedos[g.ini[0].id] && E.dedos[g.ini[1].id]) {
      var a0 = g.ini[0], b0 = g.ini[1], a = E.dedos[a0.id], b = E.dedos[b0.id];
      var d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      var m0 = [(a0.x + b0.x) / 2, (a0.y + b0.y) / 2], m1 = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      nuevo = acercar(g.vb, z.base, d1 / d0, aMapa(g.vb, g.r, m0[0], m0[1]));
      var s1 = escalaDe(nuevo, g.r);
      nuevo = limitar([nuevo[0] - (m1[0] - m0[0]) * s1, nuevo[1] - (m1[1] - m0[1]) * s1, nuevo[2], nuevo[3]], z.base);
    } else if (g.ini.length === 1) {
      var p0 = g.ini[0], dx = d.x - p0.x, dy = d.y - p0.y;
      if (!g.movido && Math.hypot(dx, dy) < umbral(d.tipo)) return;
      if (d.tipo !== 'mouse' && !ampliado()) return;
      var s = escalaDe(g.vb, g.r);
      nuevo = limitar([g.vb[0] - dx * s, g.vb[1] - dy * s, g.vb[2], g.vb[3]], z.base);
    }
    if (!nuevo) return;
    if (!g.movido) {
      g.movido = true;
      ocultarGlobo();
      /* El ratón se captura SOLO cuando ya es un arrastre: capturado desde que
         aprieta, el clic de un toque normal le llegaría al <svg> y no a la
         zona tocada. */
      try { if (z.svg.setPointerCapture) z.svg.setPointerCapture(ev.pointerId); } catch (e) { /* el navegador no lo deja: da igual */ }
    }
    if (ev.cancelable && typeof ev.preventDefault === 'function') ev.preventDefault();
    z.vb = nuevo;
    pedirCuadro();
  }
  function alSoltar(ev) {
    if (!E.dedos[ev.pointerId]) return;
    delete E.dedos[ev.pointerId];
    var movido = E.gesto && E.gesto.movido;
    if (movido && ev.type !== 'pointercancel') E.trasArrastre = E.reloj();
    if (Object.keys(E.dedos).length) empezarGesto(); else E.gesto = null;
    if (movido) aplicar();
  }
  /* El ratón sin apretar: arma la rueda y lleva el globito. Que se movió lo
     dice movementX/Y; si el navegador no lo trae, que cambió de sitio en la
     pantalla (el movimiento que el navegador inventa al pasar el mapa por
     debajo deja el ratón donde estaba). */
  function pasarRaton(ev) {
    var dentro = !!svgDe(ev.target);
    var antes = E.ultPos;
    E.ultPos = [ev.clientX, ev.clientY];
    if (!dentro) { E.ratonListo = false; ocultarGlobo(); return; }
    var movio = typeof ev.movementX === 'number' ? !!(ev.movementX || ev.movementY)
      : !!(antes && (antes[0] !== ev.clientX || antes[1] !== ev.clientY));
    if (movio && E.reloj() - E.ultimoScroll > 400) E.ratonListo = true;
    var t = zonaDe(ev.target);
    if (!t) { ocultarGlobo(); return; }
    if (E.globo === t.getAttribute('data-c')) moverGlobo(ev.clientX, ev.clientY);
  }

  /* ------------------------------------------------------------------------
   * EL GLOBITO: el nombre y la cifra de la zona, junto al ratón o al dedo.
   * Dice lo mismo que la línea de abajo (textoMuni, textoDepto), así que el
   * «1–2» vale igual aquí.
   * ---------------------------------------------------------------------- */
  function globoHtml(c, esDepto) {
    var texto = esDepto ? textoDepto(c) : textoMuni(c);
    var i = texto.indexOf(' · ');
    return i < 0 ? '<b>' + esc(texto) + '</b>' : '<b>' + esc(texto.slice(0, i)) + '</b>' + esc(texto.slice(i));
  }
  function mostrarGlobo(c, esDepto, cx, cy) {
    var g = q('.mapa-globo');
    if (!g || !c) return;
    g.innerHTML = globoHtml(c, esDepto);
    E.globo = c;
    if (!moverGlobo(cx, cy)) { ocultarGlobo(); return; }
    g.hidden = false;
  }
  function moverGlobo(cx, cy) {
    var g = q('.mapa-globo'), lr = medir(q('.mapa-lienzo'));
    if (!g || !lr || typeof cx !== 'number') return false;
    var x = Math.min(Math.max(cx - lr.left, 90), Math.max(90, lr.width - 90)), y = cy - lr.top;
    if (g.style) { g.style.left = Math.round(x) + 'px'; g.style.top = Math.round(y) + 'px'; }
    /* Pegado arriba no cabe encima del dedo: va debajo. */
    clase(g, 'abajo', y < 64);
    return true;
  }
  function ocultarGlobo() {
    var g = q('.mapa-globo');
    E.globo = null;
    if (g && !g.hidden) g.hidden = true;
  }
  /* El globito sobre el nombre de un municipio (desde la lista o el buscador). */
  function globoEn(c) {
    var z = E.z, m = muni(c);
    var r = z && medir(z.svg);
    if (!r || !m) return;
    var p = puntoDe(m), s = aPantalla(z.vb, r, p[0], p[1]);
    if (s[0] < r.left || s[0] > r.left + r.width || s[1] < r.top || s[1] > r.top + r.height) { ocultarGlobo(); return; }
    mostrarGlobo(c, false, s[0], s[1]);
  }

  /* LO QUE SE VE AL TOCAR. En el celular la lista va DEBAJO del mapa: Joan
     tocaba «Pitalito» en la lista y lo único que cambiaba era la línea de
     información, que quedaba fuera de la pantalla (el revisor la midió 64 px
     por encima del borde). Una función que no se ve no existe. Ahora el
     municipio tocado se marca en el mapa (un borde que se ve aunque mida un
     punto), y si la línea que lo dice no está en pantalla, la pantalla va
     hasta ella; al cambiar de departamento, hasta el mapa. En el computador
     todo eso ya se ve y no se mueve nada. */
  function marcar(c) {
    var caja = E.o && E.o.caja;
    if (!caja || typeof caja.querySelector !== 'function') return;
    var antes = caja.querySelector('path.mapa-sel');
    if (antes && antes.classList) antes.classList.remove('mapa-sel');
    var p = /^\d+$/.test(c || '') ? caja.querySelector('path[data-mapa="muni"][data-c="' + c + '"]') : null;
    if (!p || !p.classList) return;
    p.classList.add('mapa-sel');
    /* Al final de su grupo: si no, los vecinos pintados después le tapan el
       borde. Los nombres van en otro grupo, después, y siguen encima. */
    if (p.parentNode && typeof p.parentNode.appendChild === 'function') p.parentNode.appendChild(p);
  }
  function llevar(sel, donde, hace) {
    var el = E.o && E.o.caja && typeof E.o.caja.querySelector === 'function' && E.o.caja.querySelector(sel);
    if (!el || typeof el.getBoundingClientRect !== 'function' || typeof el.scrollIntoView !== 'function') return;
    var alto = typeof innerHeight === 'number' ? innerHeight : 0;
    if (!alto || !hace(el.getBoundingClientRect(), alto)) return;
    try { el.scrollIntoView({ block: donde, behavior: 'smooth' }); } catch (e) { el.scrollIntoView(donde === 'start'); }
  }
  /* La línea, si no se ve entera: abajo de la pantalla, con el mapa encima. */
  function verLinea() { llevar('.mapa-info', 'end', function (r, alto) { return r.top < 0 || r.bottom > alto; }); }
  /* El mapa, solo si su borde de arriba quedó por encima: en el computador
     el mapa mide casi la pantalla y no se puede mover a cada clic. */
  function verMapa() { llevar('.mapa-lienzo', 'start', function (r) { return r.top < 0; }); }

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
    /* Lo que no se pudo ubicar y puede ser de aquí, dicho: «sin clientes» a
       secas sería falso (ver dudosos en resumir). Con «1–2», como toda cifra. */
    var dud = (E.res.dudosos || {})[c] || 0;
    var duda = dud ? ' · ' + cifra(dud) + ' sin ubicar (nombre repetido, abajo)' : '';
    if (!m) return base + (dud ? ' · ninguno ubicado' : ' · sin clientes') + duda;
    if (E.vista === 'conquistas') {
      return base + ' · ' + clientes(m.clientes) + ' · ' + (m.pagaron >= META ? '🏁 conquistado' : faltan(m.pagaron) + ' para conquistarlo') + duda;
    }
    return base + ' · ' + clientes(m.clientes) + duda;
  }
  function nombreDepto(c) {
    var d = depto(c);
    return d ? (d.corto || d.n) : c;
  }
  /* El departamento que va al lado del nombre de un municipio. Bogotá es un
     departamento de un solo municipio, y salía «Bogotá, D.C. Bogotá D.C.»:
     ahí el nombre ya lo dice todo. */
  function deptoDeMuni(c) {
    var d = depto(c.slice(0, 2));
    if (!d) return c.slice(0, 2);
    return d.m === 1 ? '' : (d.corto || d.n);
  }

  /* ------------------------------------------------------------------------
   * EL BUSCADOR
   * ---------------------------------------------------------------------- */
  function esBuscador(t) { return !!(t && /(^| )mapa-buscar( |$)/.test(String(t.className || ''))); }
  /* Primero lo que EMPIEZA por lo escrito, después lo que tiene una palabra
     que empieza así, después lo que lo contiene; dentro, lo que más clientes
     muestra (lo visible) y el abecedario. Los apodos de mapa-lugares.js
     («Fusa», «Bta», «Kennedy») cuentan como si empezaran así. */
  function buscar(texto) {
    var n = L.normalizar(texto);
    if (!n || !E.mapa || !E.res) return [];
    if (!E.normas) E.normas = E.mapa.municipios.map(function (m) { return { c: m.c, n: L.normalizar(m.n) }; });
    var apodos = {};
    lista(E.res.idx.porNombre[n]).forEach(function (c) { apodos[c] = true; });
    var hallados = [];
    E.normas.forEach(function (x) {
      var nivel = apodos[x.c] || x.n.indexOf(n) === 0 ? 0 : x.n.indexOf(' ' + n) >= 0 ? 1 : x.n.indexOf(n) >= 0 ? 2 : -1;
      if (nivel >= 0) hallados.push({ c: x.c, nivel: nivel });
    });
    var cuantos = function (c) { return medio(visible((E.res.porMuni[c] || {}).clientes)); };
    hallados.sort(function (a, b) {
      return a.nivel - b.nivel || cuantos(b.c) - cuantos(a.c) || porNombre(muni(a.c).n, muni(b.c).n) || porNombre(a.c, b.c);
    });
    return hallados.slice(0, 8).map(function (x) { return x.c; });
  }
  function sugerir(texto) {
    E.sug = buscar(texto); E.sugSel = -1;
    pintarSugerencias(String(texto || '').trim() !== '');
  }
  function pintarSugerencias(escribio) {
    var caja = q('.mapa-sug');
    if (!caja) return;
    if (!E.sug.length) {
      caja.innerHTML = escribio ? '<p class="mapa-sug-nada">No encuentro un municipio con ese nombre.</p>' : '';
      caja.hidden = !escribio;
      return;
    }
    caja.innerHTML = E.sug.map(function (c, i) {
      var m = E.res.porMuni[c], dep = deptoDeMuni(c), dud = (E.res.dudosos || {})[c] || 0;
      return '<button type="button" class="mapa-sug-f' + (i === E.sugSel ? ' on' : '') + '" role="option" aria-selected="' + (i === E.sugSel) +
        '" data-mapa="buscado" data-c="' + esc(c) + '"><span>' + esc(muni(c).n) + (dep ? ' <small>' + esc(dep) + '</small>' : '') +
        '</span><b>' + (m ? esc(cifra(m.clientes)) : dud ? '<i>' + esc(cifra(dud)) + ' sin ubicar</i>' : '<i>sin clientes</i>') + '</b></button>';
    }).join('');
    caja.hidden = false;
  }
  function cerrarSugerencias() {
    E.sug = []; E.sugSel = -1;
    var caja = q('.mapa-sug');
    if (caja && !caja.hidden) { caja.innerHTML = ''; caja.hidden = true; }
  }
  function teclaBuscador(ev) {
    var k = ev.key;
    if (k === 'Enter') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (E.sug.length) irAMunicipio(E.sug[E.sugSel >= 0 ? E.sugSel : 0]);
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      if (!E.sug.length) return;
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (k === 'ArrowDown') E.sugSel = (E.sugSel + 1) % E.sug.length;
      else E.sugSel = E.sugSel <= 0 ? E.sug.length - 1 : E.sugSel - 1;
      pintarSugerencias(true);
    } else if (k === 'Escape') cerrarSugerencias();
  }
  /* En qué departamento se ve mejor un municipio: el abierto si es suyo o es
     uno de sus huecos; Bogotá (departamento de uno solo), dentro de
     Cundinamarca; los demás, en el suyo. */
  function deptoParaVer(c) {
    var propio = c.slice(0, 2);
    var abierto = E.depto && depto(E.depto);
    if (abierto && (abierto.c === propio || lista(abierto.h).indexOf(c) >= 0)) return abierto.c;
    var d = depto(propio);
    if (d && d.m === 1) {
      var anfitrion = lista(E.mapa.departamentos).filter(function (x) { return lista(x.h).indexOf(c) >= 0; })[0];
      if (anfitrion) return anfitrion.c;
    }
    return propio;
  }
  function irAMunicipio(c) {
    var m = muni(c);
    if (!m || !E.res) return false;
    cerrarSugerencias();
    if (E.vista !== 'conquistas') {
      var d = deptoParaVer(c);
      if (E.depto !== d) { E.depto = d; pintar(); }
    }
    var entrada = q('.mapa-buscar');
    if (entrada) entrada.value = m.n;
    enfocar(c);
    marcar(c); contar(c); globoEn(c);
    verMapa();
    return true;
  }
  /* Centrado y con aire: la ventana mide tres veces el municipio. */
  function enfocar(c) {
    var z = E.z, m = muni(c), b = m && cajaDe(m.d);
    if (!z || !b) return;
    var aspecto = z.base[3] / z.base[2];
    var w = Math.max(b[2] - b[0], (b[3] - b[1]) / aspecto) * 3;
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    z.vb = limitar([cx - w / 2, cy - w * aspecto / 2, w, w * aspecto], z.base);
    aplicar();
  }

  /* ------------------------------------------------------------------------
   * PINTAR
   * ---------------------------------------------------------------------- */
  function pintar() {
    var o = E.o, caja = o && o.caja;
    if (!caja || !E.mapa) return;
    var t0 = Date.now();
    E.res = resumir(o.db, E.mapa, o.puente);
    E.ets = []; E.vb0 = null; E.sug = []; E.sugSel = -1;
    var h = cabeza();
    if (E.vista === 'conquistas') h += vistaConquistas();
    else if (E.depto) h += vistaDepto(E.depto);
    else h += vistaPais();
    h += sinUbicar() + '<p class="mapa-creditos">' + esc(CREDITOS) + '. Zonas, nunca puntos: cada cliente cae en el municipio que escribió en «Ciudad»; el mapa no usa el GPS del registro.</p>';
    caja.innerHTML = h;
    prepararZoom();
    E.ms = Date.now() - t0;
  }

  function cabeza() {
    var b = function (v, t) {
      var on = E.vista === v;
      return '<button type="button" class="mapa-vista' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-mapa="vista" data-v="' + v + '">' + t + '</button>';
    };
    return '<div class="mapa-vistas" role="group" aria-label="Qué mostrar">' + b('deptos', 'Departamentos') + b('conquistas', '🏁 Conquistas') + '</div>';
  }

  /* La barra de encima del mapa: volver (en un departamento), el buscador y
     el zoom. Los botones de zoom arrancan como si el mapa estuviera entero;
     aplicar() los pone al día. */
  function barra(volver) {
    return '<div class="mapa-barra">' + (volver ? '<button type="button" class="btn btn-ghost btn-sm mapa-volver" data-mapa="pais">← Toda Colombia</button>' : '') +
      '<div class="mapa-busca"><input type="search" class="mapa-buscar" placeholder="Buscar municipio…" aria-label="Buscar municipio" autocomplete="off" enterkeyhint="search">' +
      '<div class="mapa-sug" role="listbox" aria-label="Municipios" hidden></div></div>' +
      '<div class="mapa-zoom" role="group" aria-label="Zoom del mapa">' +
      '<button type="button" class="mapa-zb" data-mapa="zoom" data-z="mas" aria-label="Acercar" title="Acercar">＋</button>' +
      '<button type="button" class="mapa-zb" data-mapa="zoom" data-z="menos" aria-label="Alejar" title="Alejar" disabled>－</button>' +
      '<button type="button" class="mapa-zb mapa-todo" data-mapa="zoom" data-z="todo" disabled>Volver a ver todo</button></div></div>';
  }

  /* Un <svg> con la caja que se pida y los caminos ya armados. --k arranca
     con un cálculo a ojo (600 px de ancho) y aplicar() lo corrige con la
     medida de verdad antes de que se vea. */
  function svg(caja, cuerpo, clase, etiqueta) {
    E.vb0 = caja.slice();
    return '<svg class="mapa-svg ' + clase + '" viewBox="' + caja.join(' ') + '" role="img" aria-label="' + esc(etiqueta) +
      '" preserveAspectRatio="xMidYMid meet" style="--k:' + Math.round(caja[2] / 600 * 1000) / 1000 + '">' + cuerpo + '</svg>';
  }
  function recuadro(r) {
    if (!r) return '';
    return '<rect class="mapa-recuadro" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>' +
      /* El nombre, en el mar entre las dos islas (Providencia arriba, San
         Andrés abajo): fuera del recuadro se montaba sobre el cabo Tiburón. */
      '<text class="mapa-recuadro-t" x="' + Math.round(r.x + r.w / 2) + '" y="' + Math.round(r.y + r.h / 2 - 40) + '" text-anchor="middle">San Andrés</text>' +
      '<text class="mapa-recuadro-t" x="' + Math.round(r.x + r.w / 2) + '" y="' + Math.round(r.y + r.h / 2 + 110) + '" text-anchor="middle">y Providencia</text>';
  }
  function leyenda(clase, extra) {
    return '<div class="mapa-leyenda">' + TRAMOS.map(function (t, i) {
      return '<span><i class="' + clase + ' t' + i + '"></i>' + t + '</span>';
    }).join('') + (extra || '') + '</div>';
  }
  /* Lo de encima del mapa que no es el mapa: el globito (escondido hasta que
     se pasa el ratón o se toca) y la línea de información. */
  function globoYLinea(texto) {
    return '<div class="mapa-globo" aria-hidden="true" hidden></div><div class="mapa-info" aria-live="polite">' + esc(texto) + '</div>';
  }

  /* LAS ETIQUETAS: el nombre y la cifra de cada municipio con clientes, en su
     punto. Van en un grupo aparte, después de las zonas (encima) y sin
     recibir el ratón (el toque es de la zona de debajo). Las «siempre» salen
     prendidas; las otras, apagadas hasta que colocarEtiquetas() diga que
     caben. `filas` llega en orden de prioridad. */
  function etiquetas(filas, siempre) {
    E.ets = filas.map(function (f) {
      return { c: f.c, x: f.x, y: f.y, w: anchoEtiqueta(f.nombre + ' ' + f.cifra), h: Math.round(TAM * 1.3), siempre: siempre, ver: siempre, dy: 0, dx: 0 };
    });
    return '<g class="mapa-ets" aria-hidden="true">' + filas.map(function (f) {
      return '<text class="mapa-et' + (siempre ? ' siempre' : ' oculta') + (f.clase ? ' ' + f.clase : '') + '" x="' + f.x + '" y="' + f.y +
        '" dy="0.35em" data-c="' + esc(f.c) + '">' + esc(f.nombre) + ' <tspan class="mapa-et-k">' + esc(f.cifra) + '</tspan></text>';
    }).join('') + '</g>';
  }
  function fila(c, extra) {
    var m = muni(c), p = puntoDe(m);
    return Object.assign({ c: c, x: p[0], y: p[1], nombre: m ? m.n : c, cifra: cifra(E.res.porMuni[c].clientes) }, extra || {});
  }
  /* Los municipios con clientes, con lo que más muestra primero. */
  function conClientesEnOrden(codigos) {
    var r = E.res;
    return codigos.filter(function (c) { return r.porMuni[c] && muni(c); }).sort(function (a, b) {
      return medio(visible(r.porMuni[b].clientes)) - medio(visible(r.porMuni[a].clientes)) || porNombre(muni(a).n, muni(b).n) || porNombre(a, b);
    });
  }

  /* Un total en rango se explica al lado: si no, «5–7 clientes» parecería
     un error de la cuenta. */
  function notaRango(r) {
    if (!r || r.min === r.max) return '';
    return '<p class="muted mapa-nota">Va en rango porque las zonas con 1 o 2 clientes no dicen su cifra: con el total exacto, restando se sabría.</p>';
  }

  /* COLOMBIA. Los departamentos van coloreados por sus clientes y, encima,
     cada MUNICIPIO con clientes marcado con un contorno de dos tonos (un
     trazo oscuro sobre uno claro): se ve sobre cualquier color de la escala
     y deja ver el del departamento por dentro. */
  function vistaPais() {
    var m = E.mapa, r = E.res;
    var caminos = m.departamentos.map(function (d) {
      return '<path class="mapa-z t' + tramoRango((r.porDepto[d.c] || {}).rango) + '" data-mapa="depto" data-c="' + esc(d.c) + '" d="' + d.d + '"><title>' + esc(textoDepto(d.c)) + '</title></path>';
    }).join('');
    var con = conClientesEnOrden(Object.keys(r.porMuni));
    var marcas = con.map(function (c) { return '<path class="mapa-marca-f" d="' + muni(c).d + '"/>'; }).join('') +
      con.map(function (c) {
        return '<path class="mapa-marca" data-mapa="muni" data-c="' + esc(c) + '" d="' + muni(c).d + '"><title>' + esc(textoMuni(c)) + '</title></path>';
      }).join('');
    var filas = m.departamentos.filter(function (d) { return r.porDepto[d.c]; })
      .sort(function (a, b) { return medio(r.porDepto[b.c].rango) - medio(r.porDepto[a.c].rango) || porNombre(a.corto || a.n, b.corto || b.n); })
      .map(function (d) {
        return '<li><button type="button" class="mapa-fila" data-mapa="depto" data-c="' + esc(d.c) + '"><span>' + esc(d.corto || d.n) +
          '</span><b>' + cifraRango(r.porDepto[d.c].rango) + '</b></button></li>';
      }).join('');
    var sinClientes = m.departamentos.length - Object.keys(r.porDepto).length;
    return '<div class="mapa-cuerpo"><div class="mapa-lienzo">' + barra(false) +
      svg([0, 0].concat(m.caja), recuadro(m.recuadro) + '<g class="mapa-zonas">' + caminos + '</g><g class="mapa-marcas">' + marcas + '</g>' +
        etiquetas(con.map(function (c) { return fila(c); }), false),
      'mapa-papel', 'Colombia por departamentos, coloreada por número de clientes, con los municipios que tienen clientes marcados') +
      globoYLinea('Toca un departamento para ver sus municipios.' + (con.length ? ' Los municipios con clientes van marcados con borde negro.' : '')) +
      leyenda('mapa-z', con.length ? '<span><i class="mapa-marca-i"></i>Municipio con clientes</span>' : '') + '</div>' +
      '<div class="mapa-lado"><div class="mapa-total"><b>' + cifraRango(r.rango) + '</b> de tus clientes están en el mapa' +
      (r.total - r.ubicados ? ' · ' + (r.total - r.ubicados).toLocaleString('es-CO') + ' sin ubicar (abajo)' : '') + '</div>' + notaRango(r.rango) +
      (filas ? '<ol class="mapa-lista">' + filas + '</ol>' : '<p class="muted">Todavía no hay clientes con una ciudad que se pueda ubicar.</p>') +
      (sinClientes ? '<p class="muted">' + sinClientes + ' departamento' + (sinClientes === 1 ? '' : 's') + ' sin clientes.</p>' : '') +
      '</div></div>';
  }

  /* UN DEPARTAMENTO ABIERTO: sus municipios y sus HUECOS (los de otro
     departamento que, vistos desde este, son una muesca: Bogotá en
     Cundinamarca; el mapa los trae en `h`, ver herramientas/mapa-colombia.js).
     Un hueco se pinta y se toca como los demás, con su nombre y su cifra,
     pero no suma en el total del departamento: tiene su propia lista abajo. */
  function vistaDepto(c) {
    var m = E.mapa, r = E.res;
    var d = depto(c);
    if (!d) { E.depto = null; return vistaPais(); }
    var huecos = lista(d.h).filter(function (x) { return muni(x); });
    var b = d.b.slice();
    huecos.forEach(function (x) {
      var hb = cajaDe(muni(x).d);
      if (hb) { b[0] = Math.min(b[0], hb[0]); b[1] = Math.min(b[1], hb[1]); b[2] = Math.max(b[2], hb[2]); b[3] = Math.max(b[3], hb[3]); }
    });
    var ancho = b[2] - b[0], alto = b[3] - b[1], pad = Math.max(ancho, alto) * 0.04;
    var caja = [b[0] - pad, b[1] - pad, ancho + 2 * pad, alto + 2 * pad].map(function (x) { return Math.round(x); });
    var munis = m.municipios.filter(function (x) { return x.c.slice(0, 2) === c || huecos.indexOf(x.c) >= 0; });
    var caminos = munis.map(function (x) {
      var k = (r.porMuni[x.c] || {}).clientes || 0;
      return '<path class="mapa-z t' + tramo(k) + (huecos.indexOf(x.c) >= 0 ? ' mapa-hueco' : '') + '" data-mapa="muni" data-c="' + esc(x.c) + '" d="' + x.d + '"><title>' + esc(textoMuni(x.c)) + '</title></path>';
    }).join('') + '<path class="mapa-borde" d="' + d.d + '"/>';
    var nombres = etiquetas(conClientesEnOrden(munis.map(function (x) { return x.c; })).map(function (x) { return fila(x); }), true);
    var con = munis.filter(function (x) { return x.c.slice(0, 2) === c && r.porMuni[x.c]; })
      .sort(function (a, b2) { return medio(visible(r.porMuni[b2.c].clientes)) - medio(visible(r.porMuni[a.c].clientes)) || porNombre(a.n, b2.n) || porNombre(a.c, b2.c); });
    var rangoD = (r.porDepto[c] || {}).rango;
    var filas = con.map(function (x) {
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x.c) + '"><span>' + esc(x.n) + '</span><b>' + cifra(r.porMuni[x.c].clientes) + '</b></button></li>';
    }).join('');
    var otros = huecos.filter(function (x) { return r.porMuni[x]; }).map(function (x) {
      var dep = deptoDeMuni(x);
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x) + '"><span>' + esc(muni(x).n) +
        (dep ? ' <small>' + esc(dep) + '</small>' : '') + '</span><b>' + cifra(r.porMuni[x].clientes) + '</b></button></li>';
    }).join('');
    return '<div class="mapa-cuerpo"><div class="mapa-lienzo">' + barra(true) +
      svg(caja, '<g class="mapa-zonas">' + caminos + '</g>' + nombres, 'mapa-papel', d.n + ' por municipios, coloreado por número de clientes') +
      globoYLinea(textoDepto(c) + ' · toca un municipio.') + leyenda('mapa-z') + '</div>' +
      '<div class="mapa-lado"><h3 class="mapa-h">' + esc(d.n) + '</h3><div class="mapa-total"><b>' + cifraRango(rangoD) +
      '</b> clientes · ' + con.length + ' de ' + d.m + ' municipios con clientes</div>' + notaRango(rangoD) +
      (filas ? '<ol class="mapa-lista">' + filas + '</ol>' : '<p class="muted">Ningún cliente ubicado aquí.</p>') +
      (otros ? '<h3 class="mapa-h">También en este mapa</h3><p class="muted mapa-nota-otros">Se ven en su sitio, pero son de otro departamento: no suman en el total de arriba.</p>' +
        '<ol class="mapa-lista mapa-otros">' + otros + '</ol>' : '') + '</div></div>';
  }

  function vistaConquistas() {
    var m = E.mapa, r = E.res, q2 = conquistas(r, m);
    var estado = {};
    q2.conquistados.forEach(function (x) { estado[x.c] = 'conq'; });
    q2.porConquistar.forEach(function (x) { estado[x.c] = 'con'; });
    /* Lo conquistado se pinta al FINAL, con su borde amarillo (ver la hoja): a
       escala de país un municipio puede medir un punto, y pintado antes que
       sus vecinos le tapaban medio borde. En las capturas del 9-nov Soacha y
       Bucaramanga, conquistados, casi no se veían. Lo que tiene clientes va
       después de lo vacío por lo mismo. */
    var capa = { vacio: 0, con: 1, conq: 2 };
    var caminos = m.municipios.slice().sort(function (a, b) {
      return capa[estado[a.c] || 'vacio'] - capa[estado[b.c] || 'vacio'];
    }).map(function (x) {
      return '<path class="mapa-q ' + (estado[x.c] || 'vacio') + '" data-mapa="muni" data-c="' + esc(x.c) + '" d="' + x.d + '"><title>' + esc(textoMuni(x.c)) + '</title></path>';
    }).join('') + m.departamentos.map(function (d) { return '<path class="mapa-borde" d="' + d.d + '"/>'; }).join('');
    /* Los nombres, en el orden de las listas: lo conquistado primero. */
    var nombres = etiquetas(q2.conquistados.concat(q2.porConquistar).filter(function (x) { return muni(x.c); }).map(function (x) {
      return fila(x.c, x.pagaron >= META ? { clase: 'conq' } : null);
    }), false);
    var filaQ = function (x) {
      var dep = deptoDeMuni(x.c);
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x.c) + '"><span>' + esc(r.idx.nombre[x.c] || x.c) +
        (dep ? ' <small>' + esc(dep) + '</small>' : '') + '</span><b>' + (x.pagaron >= META ? '🏁' : esc(faltan(x.pagaron))) + '</b></button></li>';
    };
    var aviso = r.reglaDePago ? '' : '<div class="alerta warn">Este computador tiene una versión vieja de app/puente.js y no sé distinguir un crédito pagado de uno cerrado con pérdida: no cuento ninguna conquista. Recárgalo con Ctrl+Shift+R.</div>';
    return aviso + '<div class="mapa-cuerpo"><div class="mapa-lienzo mapa-laca">' + barra(false) +
      svg([0, 0].concat(m.caja), recuadro(m.recuadro) + '<g class="mapa-zonas">' + caminos + '</g>' + nombres, 'mapa-oscuro', 'Colombia por municipios: conquistados, con clientes y sin clientes') +
      globoYLinea('Un municipio se conquista con ' + META + ' clientes que pagaron un crédito entero. Un cierre con pérdida no cuenta.') +
      '<div class="mapa-leyenda mapa-leyenda-q"><span><i class="mapa-q conq"></i>Conquistado</span><span><i class="mapa-q con"></i>Con clientes</span><span><i class="mapa-q vacio"></i>Sin clientes</span></div></div>' +
      '<div class="mapa-lado"><div class="mapa-kpis">' +
      '<div><b>' + q2.conquistados.length.toLocaleString('es-CO') + '</b><span>conquistados</span></div>' +
      '<div><b>' + q2.conClientes.toLocaleString('es-CO') + '</b><span>con clientes</span></div>' +
      '<div><b>' + q2.total.toLocaleString('es-CO') + '</b><span>municipios</span></div></div>' +
      (q2.conquistados.length ? '<h3 class="mapa-h">🏁 Conquistados</h3><ol class="mapa-lista">' + q2.conquistados.map(filaQ).join('') + '</ol>' : '') +
      (q2.porConquistar.length ? '<h3 class="mapa-h">Por conquistar</h3><ol class="mapa-lista">' + q2.porConquistar.map(filaQ).join('') + '</ol>'
        : (q2.conquistados.length ? '' : '<p class="muted">Todavía no hay clientes con una ciudad que se pueda ubicar.</p>')) +
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
    /* Lo puro del zoom, las etiquetas y el buscador, para las pruebas. */
    colocarEtiquetas: colocarEtiquetas,
    acercar: acercar,
    limitar: limitar,
    aMapa: aMapa,
    cajaDe: cajaDe,
    buscar: buscar,
    _estado: E
  };
});
