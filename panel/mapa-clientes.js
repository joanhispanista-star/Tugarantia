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
 * 14-nov-2026 — «MEJORAR EL MAPA DEL CRM QUE SE VEA MUCHO MÁS DETALLADO»
 * (Joan). Con los bocetos delante escogió Bogotá y la Sabana por dentro, con
 * las calles debajo. Lo que se hizo, y dónde:
 *   · BOGOTÁ POR LOCALIDADES (vistaBogota()): la mitad de una cartera que
 *     nace en la Sabana caía en «Bogotá» como una sola mancha, pintada hasta
 *     el páramo de Sumapaz. Ahora se abre en sus 20 localidades, con sus
 *     vecinos (Soacha, Mosquera, Funza…) al lado. La localidad sale de
 *     «Ciudad» y «Barrio» de la ficha (panel/mapa-lugares.js): el barrio, que
 *     el registro pide obligatorio, estaba en cada ficha y el mapa no lo
 *     miraba. Sigue siendo ZONAS, NUNCA PUNTOS: el barrio no se pinta ni se
 *     cuenta, solo dice la localidad; y el GPS sigue sin leerse.
 *   · TOCAR BOGOTÁ ES ENTRAR, en el mapa o en una lista y en las dos vistas
 *     (el oyente de clic de escuchar()).
 *   · EL «1–2», UN PISO MÁS ABAJO: las localidades pasan por cifra() y
 *     faltan() como los municipios, y el total de Bogotá es ahora la suma de
 *     lo que se ve de sus partes (resumir()): exacto, dejaba despejar una
 *     localidad restando.
 *   · LAS CALLES (teselas() y ponerTeselas()): OpenStreetMap, en gris y
 *     debajo de las zonas, con su crédito a la vista y un botón para
 *     quitarlas. De la cartera no sale nada: cada tesela pide un pedazo de
 *     mapa, con lo que manda cualquier imagen (la IP, el navegador y el
 *     sitio de donde viene, que OpenStreetMap pide).
 *   · MÁS CERCA: en Bogotá el zoom llega a 1,4 km (E.min); lo demás, igual.
 *   · EL BUSCADOR también encuentra localidades y barrios (buscar()).
 *   · CONQUISTAS: una localidad se conquista como un municipio, y Bogotá
 *     sigue contando como UNO de los 1.122.
 *
 * Los mapas (Colombia, 590 KB, y desde el 14-nov Bogotá por dentro, 128 KB)
 * NO van en la precarga del service worker: se piden juntos la primera vez
 * que Joan abre la pestaña y quedan en memoria mientras el CRM esté abierto.
 * El service worker los guarda al pasar (caché-primero para lo que no es
 * html/js/css), así que la segunda vez salen de ahí. Por eso, cuando un
 * archivo cambia, cambia de NOMBRE (la «b» del 13-nov): con el mismo, el
 * service worker seguiría sirviendo el de antes.
 *
 * Sin librerías: SVG escrito a mano, una sola asignación de innerHTML por
 * pintada y oyentes en la caja (delegación). El zoom no vuelve a pintar:
 * mueve el viewBox y prende o apaga etiquetas.
 * ===========================================================================*/
/* La firma de llegada: el CRM pide este archivo con la versión en la
   dirección (…?v=150). Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./mapa-lugares.js'));
  else raiz.MapaClientes = fabrica(raiz.MapaLugares);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (L) {
  'use strict';

  var URL_MAPA = 'mapa/colombia-2026-11b.json';
  /* 14-nov-2026 — Bogotá por dentro: sus 20 localidades, los vecinos de la
     Sabana con el borde fino y la lista de barrios. Lo arma
     herramientas/mapa-bogota.js; ver panel/mapa/FUENTES.md. */
  var URL_BOGOTA = 'mapa/bogota-2026-11.json';
  var META = 3;   // clientes con un crédito pagado entero para conquistar un municipio
  var CREDITOS = 'Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)';
  /* LAS CALLES (14-nov-2026): las teselas de OpenStreetMap, debajo de las
     zonas de Bogotá. Las pide el navegador de quien mira, una por una, y en su
     dirección solo van tres números: el zoom y la casilla (z/x/y) de la
     VENTANA que se está viendo. De un cliente no sale nada: ni su barrio, ni
     su localidad, ni cuántos hay (ver teselas(), que solo recibe la ventana).
     Las condiciones de OpenStreetMap (operations.osmfoundation.org/policies/
     tiles), y dónde se cumplen:
       · el crédito a la vista, sobre el mapa y con su enlace: .mapa-osm;
       · solo lo que se está mirando, nada de bajar por adelantado ni para
         usar sin señal: ponerTeselas() pide las de la ventana y ya (y el
         service worker no las guarda: deja pasar lo que no es de este sitio);
       · la caché es la del navegador, con los encabezados que ellos mandan.
     Es un servidor gratis y sin garantía: si no contesta, el mapa sigue igual
     sin calles, y lo dice. */
  var URL_TESELAS = 'https://tile.openstreetmap.org/';
  var URL_OSM = 'https://www.openstreetmap.org/copyright';
  var CREDITOS_OSM = '© colaboradores de OpenStreetMap';
  /* Entre qué zooms se piden, y cuántas como mucho de una vez: una ventana
     del CRM son unas doce, y un monitor grande (o el navegador alejado) pide
     más. Entonces se baja un zoom, cuatro veces menos y un poco más
     borrosas, antes que quedarse sin calles sin decirlo; nunca más de
     TESELAS_MAX. Si ni en Z_MIN caben, es un error de cuenta, y antes que
     pedirle cien imágenes a un servidor ajeno no se pide ninguna. */
  var Z_MIN = 6, Z_MAX = 17, TESELAS_MAX = 36;

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

  /* El buscador de Bogotá se arma una vez por archivo, no en cada pintada:
     son unos 2.800 nombres de barrio con sus familias. */
  var INDICE_BOGOTA = { de: null, idx: null };
  function indiceDeBogota(bogota) {
    if (!bogota || !lista(bogota.localidades).length) return null;
    /* Se anota DESPUÉS de armarlo. Antes se anotaba primero, y si
       L.indiceBogota reventaba (un mapa-lugares.js viejo con este archivo
       nuevo: la revisión de v150 lo reprodujo), la pintada siguiente
       encontraba «ya armado» un índice que no existía y seguía como si no
       hubiera Bogotá por dentro: con su total EXACTO, que es lo que el «1–2»
       de las localidades no deja ver. */
    if (INDICE_BOGOTA.de !== bogota) { var nuevo = L.indiceBogota(bogota); INDICE_BOGOTA.de = bogota; INDICE_BOGOTA.idx = nuevo; }
    return INDICE_BOGOTA.idx;
  }

  /* `bogota` es el archivo de Bogotá (o nada: entonces Bogotá es un municipio
     más, como antes del 14-nov). Con él, cada cliente de Bogotá cae además
     en su LOCALIDAD, por lo que escribió en «Ciudad» y «Barrio»
     (L.localidadDeCliente), o queda «sin localidad», que sigue siendo Bogotá.

     Y EL TOTAL DE BOGOTÁ PASA A SER LA SUMA DE LO QUE SE VE DE SUS PARTES
     (`rangos`), como el de un departamento. No es un adorno: con «Bogotá 9»
     exacto en una pantalla y «Kennedy 4, Suba 3, Bosa 1–2» en otra, restando
     sale que Bosa tiene 2. Es la misma resta que el revisor del 9-nov hizo
     con los departamentos, un piso más abajo. Por eso todo lo que la pestaña
     muestra, colorea u ordena de un municipio sale de `rangos`, no de su
     cifra: para los demás municipios es lo de siempre (exacto, o «1–2»). */
  function resumir(db, mapa, puente, bogota) {
    var idx = L.indice(mapa.municipios, mapa.departamentos);
    var idxB = indiceDeBogota(bogota);
    var porLoc = {}, sinLoc = [], dudososLoc = {};
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
      if (idxB && l.codigo === idxB.municipio) {
        var q = L.localidadDeCliente(s, idxB, idx);
        if (q.estado === 'ubicado') {
          var k = porLoc[q.codigo] || (porLoc[q.codigo] = { clientes: 0, pagaron: 0 });
          k.clientes++;
          if (pagaron[s.id]) k.pagaron++;
        } else {
          sinLoc.push({ id: s.id, numero: s.numero, nombre: s.nombre, texto: q.texto, estado: q.estado, municipio: q.municipio || '',
            pago: !!pagaron[s.id], registro: q.registro || '', en: q.en || '', tambienBarrio: !!q.tambienBarrio,
            homonima: q.homonima ? idxB.nombre[q.homonima] || q.homonima : '',
            homonimaEn: lista(q.homonimaEn).map(function (c) { return idxB.nombre[c] || c; }),
            opciones: lista(q.opciones).map(function (c) { return idxB.nombre[c] || c; }) });
          /* Como `dudosos` un piso más abajo: la localidad que puede ser la de
             un sin localidad no dice «sin clientes». */
          if (q.estado === 'ambiguo' || q.estado === 'choque') {
            lista(q.opciones).forEach(function (c) { dudososLoc[c] = (dudososLoc[c] || 0) + 1; });
          }
        }
      }
    });
    /* Lo que se ve de cada municipio. El que tiene partes, la suma de lo que
       se ve de ellas (los sin localidad son una parte más). */
    var rangos = {};
    Object.keys(porMuni).forEach(function (c) { rangos[c] = visible(porMuni[c].clientes); });
    if (idxB && porMuni[idxB.municipio]) {
      var rb = visible(sinLoc.length);
      Object.keys(porLoc).forEach(function (c) { var v = visible(porLoc[c].clientes); rb = { min: rb.min + v.min, max: rb.max + v.max }; });
      rangos[idxB.municipio] = rb;
    }
    /* Y lo mismo con los que PAGARON: si Bogotá se conquistara con su cifra
       exacta, «Conquistas» de Colombia y «Conquistas» de Bogotá se restarían
       (Bogotá «faltan 1–2» con dos localidades de «faltan 1–2» dice que en
       cada una pagó exactamente 1). Ver conquistaDe(). */
    var pagos = {};
    Object.keys(porMuni).forEach(function (c) { pagos[c] = visible(porMuni[c].pagaron); });
    if (idxB && porMuni[idxB.municipio]) {
      var pb = visible(sinLoc.filter(function (x) { return x.pago; }).length);
      Object.keys(porLoc).forEach(function (c) { var v = visible(porLoc[c].pagaron); pb = { min: pb.min + v.min, max: pb.max + v.max }; });
      pagos[idxB.municipio] = pb;
    }
    /* Los totales que se muestran: la suma de lo visible de cada municipio. */
    var rango = { min: 0, max: 0 };
    Object.keys(porMuni).forEach(function (c) {
      var v = rangos[c], d = porDepto[c.slice(0, 2)];
      d.rango.min += v.min; d.rango.max += v.max;
      rango.min += v.min; rango.max += v.max;
    });
    return { idx: idx, porMuni: porMuni, porDepto: porDepto, sinUbicar: sinUbicar, dudosos: dudosos, ubicados: ubicados, rango: rango,
      rangos: rangos, pagos: pagos, bogota: idxB ? { idx: idxB, porLoc: porLoc, sinLoc: sinLoc, dudososLoc: dudososLoc } : null,
      total: lista(db && db.socios).length, reglaDePago: !!(puente && typeof puente.cerroConPerdida === 'function') };
  }

  /* Si un municipio está conquistado, de lo que se VE de los que pagaron:
     'si' (seguro que 3 o más), 'no3' (nadie), 'no12' (1–2) o 'duda'. La duda
     solo le pasa a Bogotá, cuando sus partes suman entre 2 y 4 (dos con
     «faltan 1–2» y ninguna conquistada): decir «conquistado» o «faltan 1–2»
     delataría cuántos pagaron en cada una, así que dice «falta 1 o ninguno»,
     se pinta «con clientes» y no se cuenta entre los conquistados. */
  function conquistaDe(res, c) {
    var r = (res.pagos && res.pagos[c]) || visible((res.porMuni[c] || {}).pagaron);
    return r.min >= META ? 'si' : r.max === 0 ? 'no3' : r.max < META ? 'no12' : 'duda';
  }
  function textoFaltan(q) { return q === 'no3' ? 'faltan ' + META : q === 'no12' ? 'faltan 1–2' : 'falta 1 o ninguno'; }
  function conquistas(res, mapa) {
    var conquistados = [], porConquistar = [];
    Object.keys(res.porMuni).forEach(function (c) {
      var m = res.porMuni[c];
      var fila = { c: c, clientes: m.clientes, pagaron: m.pagaron, q: conquistaDe(res, c) };
      if (fila.q === 'si') conquistados.push(fila); else porConquistar.push(fila);
    });
    /* El orden, solo con lo que se ve: primero lo más cerca de conquistarse
       («faltan 1–2» antes que «faltan 3»), después los que más clientes
       muestran y, en empate, el abecedario. Nunca la cifra exacta: con ella,
       el «faltan 1–2» de 2 pagados quedaba encima del de 1. */
    var clase = function (q) { return q === 'si' ? 3 : q === 'duda' ? 2 : q === 'no12' ? 1 : 0; };
    var nombre = function (c) { return (res.idx && res.idx.nombre[c]) || c; };
    var seVe = function (x) { return medio((res.rangos && res.rangos[x.c]) || visible(x.clientes)); };
    var orden = function (a, b) {
      return (clase(b.q) - clase(a.q)) || (seVe(b) - seVe(a)) ||
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
  /* `min`: lo más cerca que deja la vista (14-nov: Bogotá, con sus bordes
     finos y las calles, deja llegar a 6 unidades; las demás siguen en 100). */
  function anchoMinimo(base, min) { return Math.min(min > 0 ? min : ANCHO_MIN, base[2]); }
  function limitar(vb, base, min) {
    if (vb[2] >= base[2]) return base.slice();
    var w = Math.max(vb[2], anchoMinimo(base, min));
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
  function acercar(vb, base, factor, p, min) {
    var w = Math.min(Math.max(vb[2] / factor, anchoMinimo(base, min)), base[2]);
    var f = vb[2] / w;
    var punto = p || [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
    return limitar([punto[0] - (punto[0] - vb[0]) / f, punto[1] - (punto[1] - vb[1]) / f, w, w * base[3] / base[2]], base, min);
  }

  /* LAS TESELAS QUE CUBREN UNA VENTANA DEL MAPA (ver «LAS CALLES», arriba).
     Recibe la ventana [x, y, ancho, alto] en unidades del mapa, cuántas
     unidades mide un píxel y la proyección del archivo de Bogotá. NADA MÁS: de
     aquí salen las direcciones que se le piden a OpenStreetMap, y a esta
     función no le llega ni un dato de la cartera.
     El zoom es el que deja una tesela (256 px) más o menos a su tamaño. Cada
     una se pone con sus esquinas exactas en el mapa: el mundo de las teselas
     es Mercator y el de este mapa no, pero dentro de una tesela la diferencia
     es de menos de un píxel, y así dos vecinas quedan pegadas. */
  function teselas(ventana, s, proy) {
    if (!proy || !(proy.kx > 0) || !(proy.ky > 0) || !(s > 0) || !(ventana[2] > 0) || !(ventana[3] > 0)) return [];
    var z = Math.round(Math.log(360 * proy.kx / (256 * s)) / Math.LN2);
    z = Math.max(Z_MIN, Math.min(Z_MAX, z));
    /* Un número que no es número no baja nunca hasta Z_MIN: sin esto, una
       proyección rota colgaba la pestaña en el bucle de abajo. */
    if (!(z >= Z_MIN)) return [];
    var n = Math.pow(2, z), c0, c1, h0, h1;
    /* Del mapa a grados (al este y al norte), y de grados a casilla. */
    var este = function (x) { return proy.ox + (x - proy.m) / proy.kx; };
    var norte = function (y) { return proy.oy - (y - proy.m) / proy.ky; };
    var columna = function (g) { return Math.floor((g + 180) / 360 * n); };
    var hilera = function (g) { var rad = g * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n); };
    var esteDe = function (c) { return c / n * 360 - 180; };
    var norteDe = function (h) { var k = Math.PI - 2 * Math.PI * h / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))); };
    for (;;) {
      n = Math.pow(2, z);
      c0 = columna(este(ventana[0])); c1 = columna(este(ventana[0] + ventana[2]));
      h0 = hilera(norte(ventana[1])); h1 = hilera(norte(ventana[1] + ventana[3]));
      if ((c1 - c0 + 1) * (h1 - h0 + 1) <= TESELAS_MAX) break;
      if (z <= Z_MIN) return [];
      z--;
    }
    var r = [];
    for (var c = c0; c <= c1; c++) {
      for (var h = h0; h <= h1; h++) {
        var x0 = proy.m + (esteDe(c) - proy.ox) * proy.kx, x1 = proy.m + (esteDe(c + 1) - proy.ox) * proy.kx;
        var y0 = proy.m + (proy.oy - norteDe(h)) * proy.ky, y1 = proy.m + (proy.oy - norteDe(h + 1)) * proy.ky;
        r.push({ z: z, x: c, y: h, mx: x0, my: y0, mw: x1 - x0, mh: y1 - y0 });
      }
    }
    return r;
  }
  function urlDeTesela(t) { return URL_TESELAS + t.z + '/' + t.x + '/' + t.y + '.png'; }

  /* LAS ETIQUETAS QUE CABEN. `ets` va en orden de prioridad (lo que más
     clientes muestra primero: el orden sale de lo VISIBLE, como las listas).
     Cada una ocupa su ancho y alto en píxeles, que en el mapa son `s` veces
     eso. Una etiqueta «siempre» (las de un departamento abierto) se pone
     aunque choque: prueba primero en su sitio, después encima y debajo (uno y
     dos renglones: con uno solo, Girardot corrido hacia adentro quedaba encima
     de «Fusagasugá 4» en Cundinamarca a 390), y si
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
      var opciones = e.siempre ? [0, -h, h, -2 * h, 2 * h] : [0];
      for (var i = 0; i < opciones.length; i++) {
        var b = [x0, e.y + opciones[i] - h / 2, x1, e.y + opciones[i] + h / 2];
        if (!choca(b)) { puestas.push(b); r.push({ ver: true, dy: opciones[i], dx: dx }); return; }
      }
      /* La que `cede` (las de Bogotá: con 150 clientes, quince fijas en el
         centro se montaban) se apaga; vuelve al acercar. Van de más a menos
         clientes, así que cede la que menos muestra. */
      if (e.siempre && !e.cede) { puestas.push([x0, e.y - h / 2, x1, e.y + h / 2]); r.push({ ver: true, dy: 0, dx: dx }); return; }
      r.push({ ver: false, dy: 0, dx: 0 });
    });
    return r;
  }
  function anchoEtiqueta(texto) { return Math.ceil(String(texto).length * TAM * 0.6) + 8; }

  /* ------------------------------------------------------------------------
   * LA PANTALLA
   * ---------------------------------------------------------------------- */
  var E = { mapa: null, bogota: null, pidiendo: null, error: '', vista: 'deptos', depto: null, o: null, res: null,
    /* Lo del zoom y las etiquetas de la vista pintada (se rehace en cada pintar()). */
    z: null, vb0: null, ets: [], dedos: {}, gesto: null, cuadro: 0,
    /* 14-nov — lo de la vista de Bogotá: sus zonas (la forma fina y el punto
       del nombre de cada localidad y cada vecino), lo más cerca que deja el
       zoom de la vista pintada, si las calles están puestas (no se guarda:
       cada vez que se abre el CRM vuelven puestas) y la cuenta de las teselas
       que llegaron y las que no. */
    zonas: null, min: ANCHO_MIN, calles: true, tes: { reloj: 0, bien: 0, mal: 0 },
    /* La rueda: si el ratón se movió de verdad sobre el mapa después del
       último scroll de la página (ver «LA RUEDA ES DE LA PÁGINA»). */
    ratonListo: false, ultimoScroll: 0, ultimoZoom: 0, trasArrastre: 0,
    sug: [], sugSel: -1, globo: null, porCodigo: null, normas: null, observador: null, ultPos: null,
    reloj: function () { return Date.now(); } };

  /* SON DOS ARCHIVOS Y VAN JUNTOS (14-nov): Colombia y Bogotá por dentro. Si
     falta cualquiera no hay mapa, y el aviso de abrir() ofrece reintentar. No
     se pinta «con lo que llegó»: sin el de Bogotá su total saldría exacto y
     con él, en rango, y dos pantallas distintas de la misma cartera son justo
     lo que deja despejar una cifra restando (ver resumir()). */
  function traerMapa(pedir) {
    if (E.mapa && E.bogota) return Promise.resolve(E.mapa);
    if (E.pidiendo) return E.pidiendo;
    var f = pedir || (typeof fetch === 'function' ? function (u) { return fetch(u); } : null);
    if (!f) return Promise.reject(new Error('este navegador no puede pedir el mapa'));
    var uno = function (u) {
      return Promise.resolve(f(u)).then(function (r) {
        if (!r || !r.ok) throw new Error('el servidor contestó ' + (r ? r.status : 'nada'));
        return r.json();
      });
    };
    E.pidiendo = Promise.all([uno(URL_MAPA), uno(URL_BOGOTA)]).then(function (dos) {
      var m = dos[0], b = dos[1];
      if (!m || !lista(m.municipios).length || !lista(m.departamentos).length || !lista(m.caja).length) {
        throw new Error('llegó un archivo que no es el mapa');
      }
      if (!b || !lista(b.localidades).length || lista(b.caja).length !== 4 || !b.proy || !b.municipio) {
        throw new Error('llegó un archivo que no es el mapa de Bogotá');
      }
      E.mapa = m; E.bogota = b; E.error = ''; E.porCodigo = null; E.normas = null;
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

  /* Lo que pintar() lance no se queda callado. Con versiones mezcladas (un
     mapa-lugares.js viejo con este archivo nuevo, en la revisión de v150) la
     promesa de abrir() se rechazaba sin que nadie la atendiera y la pestaña
     se quedaba en «Bajando el mapa de Colombia…» para siempre. */
  function pintarOAvisar(caja) {
    try { pintar(); return true; } catch (e) {
      caja.innerHTML = '<div class="alerta warn">El mapa no se pudo dibujar (' + esc((e && e.message) || String(e)) + '). ' +
        'Recarga el CRM con Ctrl+Shift+R; si sigue igual, Ajustes → 🧹 Soltar la copia guardada.</div>';
      return false;
    }
  }

  /* opciones: { caja, db, puente, abrirFicha(id), pedir(url), doc } */
  function abrir(opciones) {
    E.o = opciones || {};
    var caja = E.o.caja;
    if (!caja) return Promise.resolve(false);
    escuchar(caja);
    if (E.mapa && E.bogota) return Promise.resolve(pintarOAvisar(caja));
    caja.innerHTML = '<div class="mapa-cargando" role="status">Bajando el mapa de Colombia…</div>';
    return traerMapa(E.o.pedir).then(function () { return pintarOAvisar(caja); }, function () {
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
    var z = t && typeof t.closest === 'function' ? t.closest('[data-mapa="muni"],[data-mapa="depto"],[data-mapa="loc"]') : null;
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
      /* Bogotá por dentro está en las dos vistas: cambiar de vista no saca de ella. */
      if (a === 'vista') { E.vista = t.getAttribute('data-v') === 'conquistas' ? 'conquistas' : 'deptos'; E.depto = enBogota() ? E.depto : null; pintar(); return; }
      if (a === 'depto') { E.vista = 'deptos'; E.depto = t.getAttribute('data-c'); pintar(); verMapa(); return; }
      if (a === 'pais') { E.depto = null; pintar(); verMapa(); return; }
      if (a === 'zoom') { zoomBoton(t.getAttribute('data-z')); return; }
      if (a === 'buscado') { irABuscado(t.getAttribute('data-c')); return; }
      if (a === 'calles') { alternarCalles(); return; }
      if (a === 'muni' || a === 'loc') {
        var c = t.getAttribute('data-c');
        /* BOGOTÁ TIENE ADENTRO: tocarla es entrar, en el mapa o en una lista y
           en las dos vistas, como tocar un departamento lo abre. Si solo se
           marcara, sus localidades serían una función que nadie encuentra. */
        if (a === 'muni' && tieneAdentro(c) && !enBogota()) { E.depto = deptoBogota(); pintar(); verMapa(); return; }
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
    if (E.tes.reloj && typeof clearTimeout === 'function') clearTimeout(E.tes.reloj);
    E.tes = { reloj: 0, bien: 0, mal: 0 };
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
    /* A la décima de unidad, salvo muy cerca (solo Bogotá baja de 100
       unidades): ahí una décima son varios píxeles y el mapa temblaría al
       arrastrarlo. Lo mismo --k: a tres decimales, muy cerca, la letra saltaba. */
    var fino = z.vb[2] < ANCHO_MIN ? 1000 : 10;
    z.svg.setAttribute('viewBox', z.vb.map(function (v) { return Math.round(v * fino) / fino; }).join(' '));
    var r = medir(z.svg);
    z.s = r ? escalaDe(z.vb, r) : z.vb[2] / 600;
    if (z.svg.style && typeof z.svg.style.setProperty === 'function') z.svg.style.setProperty('--k', String(Math.round(z.s * 100000) / 100000));
    var amp = ampliado();
    /* EL DEDO ES DE LA PÁGINA. Sin ampliar, el mapa deja pasar el dedo
       vertical (touch-action: pan-y, en la hoja): el celular baja la página
       aunque el dedo empiece encima del mapa, y el pellizco sí es del mapa.
       Ampliado, un dedo lo arrastra; «Volver a ver todo» lo suelta. */
    clase(z.svg, 'ampliado', amp);
    var todo = q('[data-z="todo"]'), menos = q('[data-z="menos"]'), mas = q('[data-z="mas"]');
    if (todo) todo.disabled = !amp;
    if (menos) menos.disabled = !amp;
    if (mas) mas.disabled = z.vb[2] <= anchoMinimo(z.base, E.min) + Math.min(0.5, E.min / 20);
    colocar();
    pedirTeselas();
  }
  function colocar() {
    var z = E.z;
    if (!z || !z.svg || !E.ets.length) return;
    if (!z.els) z.els = typeof z.svg.querySelectorAll === 'function' ? z.svg.querySelectorAll('text.mapa-et') : [];
    var r = colocarEtiquetas(E.ets, z.vb, z.s);
    /* Como el viewBox (aplicar): muy cerca, una décima son varios píxeles y la
       etiqueta pegada al borde saltaba al arrastrar. */
    var fino = z.vb[2] < ANCHO_MIN ? 1000 : 10;
    for (var i = 0; i < r.length && i < z.els.length; i++) {
      var e = E.ets[i], el = z.els[i];
      if (r[i].ver !== e.ver) { clase(el, 'oculta', !r[i].ver); e.ver = r[i].ver; }
      if (r[i].dy !== e.dy && typeof el.setAttribute === 'function') {
        el.setAttribute('y', String(Math.round((e.y + r[i].dy) * fino) / fino)); e.dy = r[i].dy;
      }
      if ((r[i].dx || 0) !== (e.dx || 0) && typeof el.setAttribute === 'function') {
        el.setAttribute('x', String(Math.round((e.x + r[i].dx) * fino) / fino)); e.dx = r[i].dx;
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
    else z.vb = acercar(z.vb, z.base, cual === 'menos' ? 1 / PASO : PASO, null, E.min);
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
    var nuevo = acercar(z.vb, z.base, factor, r && typeof ev.clientX === 'number' ? aMapa(z.vb, r, ev.clientX, ev.clientY) : null, E.min);
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
      nuevo = acercar(g.vb, z.base, d1 / d0, aMapa(g.vb, g.r, m0[0], m0[1]), E.min);
      var s1 = escalaDe(nuevo, g.r);
      nuevo = limitar([nuevo[0] - (m1[0] - m0[0]) * s1, nuevo[1] - (m1[1] - m0[1]) * s1, nuevo[2], nuevo[3]], z.base, E.min);
    } else if (g.ini.length === 1) {
      var p0 = g.ini[0], dx = d.x - p0.x, dy = d.y - p0.y;
      if (!g.movido && Math.hypot(dx, dy) < umbral(d.tipo)) return;
      if (d.tipo !== 'mouse' && !ampliado()) return;
      var s = escalaDe(g.vb, g.r);
      nuevo = limitar([g.vb[0] - dx * s, g.vb[1] - dy * s, g.vb[2], g.vb[3]], z.base, E.min);
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
    var texto = esDepto ? textoDepto(c) : esLoc(c) ? textoLoc(c) : textoMuni(c);
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
    var z = E.z, m = formaDe(c);
    var r = z && medir(z.svg);
    /* Sumapaz no tiene forma en la ventana: no hay dónde ponerlo, y el de
       la zona anterior diría otra cosa. */
    if (!r || !m) { ocultarGlobo(); return; }
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
    var p = esLoc(c) ? caja.querySelector('path[data-mapa="loc"][data-c="' + c + '"]')
      : /^\d+$/.test(c || '') ? caja.querySelector('path[data-mapa="muni"][data-c="' + c + '"]') : null;
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
    info.textContent = esLoc(c) ? textoLoc(c) : esDepto || (c && c.length === 2) ? textoDepto(c) : textoMuni(c);
  }
  /* Lo que se ve de un municipio (ver resumir(): Bogotá, la suma de lo que se
     ve de sus localidades), y la frase que lo dice. */
  function rangoDe(c) { return (E.res && E.res.rangos && E.res.rangos[c]) || { min: 0, max: 0 }; }
  function clientesDe(c) { return cifraRango(rangoDe(c)) + ' clientes'; }
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
      var q = conquistaDe(E.res, c);
      return base + ' · ' + clientesDe(c) + ' · ' + (q === 'si' ? '🏁 conquistado' : textoFaltan(q) + ' para conquistarlo') + duda;
    }
    return base + ' · ' + clientesDe(c) + duda;
  }
  /* Una localidad: su nombre, lo que se ve de su cifra y, en Conquistas, lo
     que le falta. Con las mismas funciones que un municipio: «1–2» y
     «faltan 1–2» valen igual un piso más abajo. */
  function textoLoc(c) {
    var b = E.res && E.res.bogota, cc = String(c).slice(1);
    var k = b && b.porLoc[cc];
    var base = nombreLoc(cc) + ' (Bogotá)';
    /* Sin ubicados, «sin clientes» a secas sería falso si un sin localidad
       puede ser de aquí (como en textoMuni). Con ubicados, su cifra es cierta. */
    var dud = (b && b.dudososLoc && b.dudososLoc[cc]) || 0;
    if (!k) return base + (dud ? ' · ninguno ubicado · ' + cifra(dud) + ' sin localidad pueden ser de aquí (abajo)' : ' · sin clientes');
    if (E.vista === 'conquistas') {
      return base + ' · ' + clientes(k.clientes) + ' · ' + (k.pagaron >= META ? '🏁 conquistada' : faltan(k.pagaron) + ' para conquistarla');
    }
    return base + ' · ' + clientes(k.clientes);
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
     («Fusa», «Bta», «Kennedy») cuentan como si empezaran así.
     14-nov — también las LOCALIDADES de Bogotá, por su nombre («L08» es
     Kennedy), y los BARRIOS: si lo escrito es un barrio, sale la localidad
     donde queda («L08|b»). Para el barrio no hay otra lista ni otra regla: se
     le pregunta a L.localidadDe(), lo mismo que decide dónde cae cada ficha.
     Así el buscador nunca contesta distinto de lo que el mapa hace, y un
     barrio que está en dos localidades sale con las dos. */
  function buscar(texto) {
    var n = L.normalizar(texto);
    if (!n || !E.mapa || !E.res) return [];
    if (!E.normas) E.normas = E.mapa.municipios.map(function (m) { return { c: m.c, n: L.normalizar(m.n) }; });
    var apodos = {};
    lista(E.res.idx.porNombre[n]).forEach(function (c) { apodos[c] = true; });
    var rb = E.res.bogota;
    /* «Suba» era un apodo de Bogotá (mapa-lugares.js: quien vive en Suba la
       escribe en «Ciudad»). Ahora Suba sale ella misma, y Bogotá encima de
       ella, con sus clientes de todas las localidades, la tapaba. */
    if (rb && rb.idx.porNombre[n]) delete apodos[rb.idx.municipio];
    var hallados = [];
    var nivelDe = function (nombre, apodo) {
      return apodo || nombre.indexOf(n) === 0 ? 0 : nombre.indexOf(' ' + n) >= 0 ? 1 : nombre.indexOf(n) >= 0 ? 2 : -1;
    };
    E.normas.forEach(function (x) {
      var nivel = nivelDe(x.n, apodos[x.c]);
      if (nivel >= 0) hallados.push({ c: x.c, nivel: nivel });
    });
    if (rb) {
      lista(E.bogota && E.bogota.localidades).forEach(function (l) {
        var nivel = nivelDe(L.normalizar(l.n), false);
        if (nivel >= 0) hallados.push({ c: 'L' + l.c, nivel: nivel });
      });
    }
    var cuantos = function (c) { return esLoc(c) ? medio(visible(((rb && rb.porLoc[c.slice(1)]) || {}).clientes)) : medio(rangoDe(c)); };
    var nombre = function (c) { return esLoc(c) ? nombreLoc(c.slice(1)) : muni(c).n; };
    hallados.sort(function (a, b) {
      return a.nivel - b.nivel || cuantos(b.c) - cuantos(a.c) || porNombre(nombre(a.c), nombre(b.c)) || porNombre(a.c, b.c);
    });
    var r = hallados.map(function (x) { return x.c; });
    var deBarrio = [];
    if (rb) {
      var q2 = L.localidadDe('', texto, rb.idx, E.res.idx);
      (q2.estado === 'ubicado' ? [q2.codigo] : q2.estado === 'ambiguo' ? lista(q2.opciones) : []).forEach(function (cc) {
        if (r.indexOf('L' + cc) < 0) deBarrio.push('L' + cc + '|b');
      });
    }
    deBarrio = deBarrio.slice(0, 4);
    return r.slice(0, 8 - deBarrio.length).concat(deBarrio);
  }
  function sugerir(texto) {
    E.sug = buscar(texto); E.sugSel = -1;
    pintarSugerencias(String(texto || '').trim() !== '');
  }
  function pintarSugerencias(escribio) {
    var caja = q('.mapa-sug');
    if (!caja) return;
    if (!E.sug.length) {
      caja.innerHTML = escribio ? '<p class="mapa-sug-nada">No encuentro un municipio con ese nombre, ni una localidad o un barrio de Bogotá.</p>' : '';
      caja.hidden = !escribio;
      return;
    }
    caja.innerHTML = E.sug.map(function (c, i) {
      var cabeza = '<button type="button" class="mapa-sug-f' + (i === E.sugSel ? ' on' : '') + '" role="option" aria-selected="' + (i === E.sugSel) +
        '" data-mapa="buscado" data-c="' + esc(c) + '"><span>';
      if (esLoc(c.slice(0, 3))) {
        var cc = c.slice(1, 3), k = E.res.bogota && E.res.bogota.porLoc[cc];
        var dudL = (E.res.bogota && E.res.bogota.dudososLoc && E.res.bogota.dudososLoc[cc]) || 0;
        return cabeza + esc(nombreLoc(cc)) + ' <small>' + (c.length > 3 ? 'Bogotá · ahí queda ese barrio' : 'localidad de Bogotá') +
          '</small></span><b>' + (k ? esc(cifra(k.clientes)) : dudL ? '<i>' + esc(cifra(dudL)) + ' sin localidad</i>' : '<i>sin clientes</i>') + '</b></button>';
      }
      var m = E.res.porMuni[c], dep = deptoDeMuni(c), dud = (E.res.dudosos || {})[c] || 0;
      return cabeza + esc(muni(c).n) + (dep ? ' <small>' + esc(dep) + '</small>' : '') +
        '</span><b>' + (m ? esc(cifraRango(rangoDe(c))) : dud ? '<i>' + esc(cifra(dud)) + ' sin ubicar</i>' : '<i>sin clientes</i>') + '</b></button>';
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
      if (E.sug.length) irABuscado(E.sug[E.sugSel >= 0 ? E.sugSel : 0]);
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
    /* Bogotá se ve por dentro; y con Bogotá abierta, sus vecinos de la Sabana
       se ven ahí mismo (con el borde fino), sin saltar a Cundinamarca. */
    if (tieneAdentro(c)) return deptoBogota();
    if (enBogota() && E.zonas && E.zonas[c]) return E.depto;
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
    if (E.vista !== 'conquistas' || tieneAdentro(c)) {
      var d = deptoParaVer(c);
      if (E.depto !== d) { E.depto = d; pintar(); }
    } else if (enBogota() && !(E.zonas && E.zonas[c])) {
      /* Conquistas con Bogotá abierta: lo que no es de la Sabana no está
         dibujado. Se busca en el mapa de Colombia, como desde Conquistas. */
      E.depto = null; pintar();
    }
    var entrada = q('.mapa-buscar');
    if (entrada) entrada.value = m.n;
    enfocar(c);
    marcar(c); contar(c); globoEn(c);
    verMapa();
    return true;
  }
  /* Lo buscado: un municipio, o una localidad de Bogotá («L08», o «L08|b» si
     se llegó por el nombre de un barrio). */
  function irABuscado(c) {
    var m = /^(L\d\d)/.exec(String(c == null ? '' : c));
    return m ? irALocalidad(m[1]) : irAMunicipio(c);
  }
  function irALocalidad(c) {
    if (!E.bogota || !E.res) return false;
    cerrarSugerencias();
    if (!enBogota()) { E.depto = deptoBogota(); pintar(); }
    if (formaDe(c)) enfocar(c);
    marcar(c); contar(c); globoEn(c);
    verMapa();
    return true;
  }
  /* Centrado y con aire: la ventana mide tres veces el municipio. */
  function enfocar(c) {
    var z = E.z, m = formaDe(c), b = m && cajaDe(m.d);
    if (!z || !b) return;
    var aspecto = z.base[3] / z.base[2];
    var w = Math.max(b[2] - b[0], (b[3] - b[1]) / aspecto) * 3;
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    z.vb = limitar([cx - w / 2, cy - w * aspecto / 2, w, w * aspecto], z.base, E.min);
    aplicar();
  }

  /* ------------------------------------------------------------------------
   * PINTAR
   * ---------------------------------------------------------------------- */
  function pintar() {
    var o = E.o, caja = o && o.caja;
    if (!caja || !E.mapa) return;
    var t0 = Date.now();
    E.res = resumir(o.db, E.mapa, o.puente, E.bogota);
    E.ets = []; E.vb0 = null; E.sug = []; E.sugSel = -1; E.zonas = null; E.min = ANCHO_MIN;
    var h = cabeza();
    var bog = enBogota();
    if (bog) h += vistaBogota();
    else if (E.vista === 'conquistas') h += vistaConquistas();
    else if (E.depto) h += vistaDepto(E.depto);
    else h += vistaPais();
    h += sinUbicar() + (bog ? sinLocalidad() : '') + '<p class="mapa-creditos">' + esc(CREDITOS) +
      (bog ? ' · ' + esc(E.bogota.creditos || '') + (E.vista !== 'conquistas' ? ' · Calles: ' + esc(CREDITOS_OSM) + ' (ODbL)' : '') : '') +
      '. Zonas, nunca puntos: cada cliente cae en el municipio que escribió en «Ciudad»' +
      (bog ? ' y, en Bogotá, en la localidad de su «Barrio»' : '') + '; el mapa no usa el GPS del registro.</p>';
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
  function barra(volver, extra) {
    return '<div class="mapa-barra">' + (volver ? '<button type="button" class="btn btn-ghost btn-sm mapa-volver" data-mapa="pais">← Toda Colombia</button>' : '') +
      '<div class="mapa-busca"><input type="search" class="mapa-buscar" placeholder="Buscar municipio, localidad o barrio…" aria-label="Buscar municipio, localidad o barrio" autocomplete="off" enterkeyhint="search">' +
      '<div class="mapa-sug" role="listbox" aria-label="Municipios y localidades" hidden></div></div>' +
      '<div class="mapa-zoom" role="group" aria-label="Zoom del mapa">' + (extra || '') +
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
  /* 14-nov — una fila puede traer su propio `siempre` (en Bogotá solo van
     siempre las zonas con 3 clientes o más: veinte localidades con su «1–2»
     no caben juntas en el centro) y venir sin cifra: el nombre a secas de una
     zona sin clientes, que solo sale si le queda sitio. */
  function etiquetas(filas, siempre) {
    var fijo = function (f) { return f.siempre === undefined ? siempre : !!f.siempre; };
    E.ets = filas.map(function (f) {
      return { c: f.c, x: f.x, y: f.y, w: anchoEtiqueta(f.nombre + (f.cifra ? ' ' + f.cifra : '')), h: Math.round(TAM * 1.3), siempre: fijo(f), cede: !!f.cede, ver: fijo(f), dy: 0, dx: 0 };
    });
    return '<g class="mapa-ets" aria-hidden="true">' + filas.map(function (f) {
      return '<text class="mapa-et' + (fijo(f) ? ' siempre' : ' oculta') + (f.clase ? ' ' + f.clase : '') + '" x="' + f.x + '" y="' + f.y +
        '" dy="0.35em" data-c="' + esc(f.c) + '">' + esc(f.nombre) + (f.cifra ? ' <tspan class="mapa-et-k">' + esc(f.cifra) + '</tspan>' : '') + '</text>';
    }).join('') + '</g>';
  }
  function fila(c, extra) {
    var m = muni(c), p = puntoDe(m);
    return Object.assign({ c: c, x: p[0], y: p[1], nombre: m ? m.n : c, cifra: cifraRango(rangoDe(c)) }, extra || {});
  }
  /* Los municipios con clientes, con lo que más muestra primero. */
  function conClientesEnOrden(codigos) {
    var r = E.res;
    return codigos.filter(function (c) { return r.porMuni[c] && muni(c); }).sort(function (a, b) {
      return medio(r.rangos[b]) - medio(r.rangos[a]) || porNombre(muni(a).n, muni(b).n) || porNombre(a, b);
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
      globoYLinea('Toca un departamento para ver sus municipios.' + (con.length ? ' Los municipios con clientes van marcados con borde negro.' : '') +
        ' Bogotá se abre por localidades.') +
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
      return '<path class="mapa-z t' + tramoRango(r.rangos[x.c]) + (huecos.indexOf(x.c) >= 0 ? ' mapa-hueco' : '') + '" data-mapa="muni" data-c="' + esc(x.c) + '" d="' + x.d + '"><title>' + esc(textoMuni(x.c)) + '</title></path>';
    }).join('') + '<path class="mapa-borde" d="' + d.d + '"/>';
    var nombres = etiquetas(conClientesEnOrden(munis.map(function (x) { return x.c; })).map(function (x) { return fila(x); }), true);
    var con = munis.filter(function (x) { return x.c.slice(0, 2) === c && r.porMuni[x.c]; })
      .sort(function (a, b2) { return medio(r.rangos[b2.c]) - medio(r.rangos[a.c]) || porNombre(a.n, b2.n) || porNombre(a.c, b2.c); });
    var rangoD = (r.porDepto[c] || {}).rango;
    var filas = con.map(function (x) {
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x.c) + '"><span>' + esc(x.n) + '</span><b>' + cifraRango(r.rangos[x.c]) + '</b></button></li>';
    }).join('');
    var otros = huecos.filter(function (x) { return r.porMuni[x]; }).map(function (x) {
      var dep = deptoDeMuni(x);
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x) + '"><span>' + esc(muni(x).n) +
        (dep ? ' <small>' + esc(dep) + '</small>' : '') + '</span><b>' + cifraRango(r.rangos[x]) + '</b></button></li>';
    }).join('');
    return '<div class="mapa-cuerpo"><div class="mapa-lienzo">' + barra(true) +
      svg(caja, '<g class="mapa-zonas">' + caminos + '</g>' + nombres, 'mapa-papel', d.n + ' por municipios, coloreado por número de clientes') +
      globoYLinea(textoDepto(c) + ' · toca un municipio.' + (huecos.some(tieneAdentro) ? ' Bogotá se abre por localidades.' : '')) + leyenda('mapa-z') + '</div>' +
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
      return fila(x.c, x.q === 'si' ? { clase: 'conq' } : null);
    }), false);
    var filaQ = function (x) {
      var dep = deptoDeMuni(x.c);
      return '<li><button type="button" class="mapa-fila" data-mapa="muni" data-c="' + esc(x.c) + '"><span>' + esc(r.idx.nombre[x.c] || x.c) +
        (dep ? ' <small>' + esc(dep) + '</small>' : '') + '</span><b>' + (x.q === 'si' ? '🏁' : esc(textoFaltan(x.q))) + '</b></button></li>';
    };
    var aviso = r.reglaDePago ? '' : '<div class="alerta warn">Este computador tiene una versión vieja de app/puente.js y no sé distinguir un crédito pagado de uno cerrado con pérdida: no cuento ninguna conquista. Recárgalo con Ctrl+Shift+R.</div>';
    return aviso + '<div class="mapa-cuerpo"><div class="mapa-lienzo mapa-laca">' + barra(false) +
      svg([0, 0].concat(m.caja), recuadro(m.recuadro) + '<g class="mapa-zonas">' + caminos + '</g>' + nombres, 'mapa-oscuro', 'Colombia por municipios: conquistados, con clientes y sin clientes') +
      globoYLinea('Un municipio se conquista con ' + META + ' clientes que pagaron un crédito entero. Un cierre con pérdida no cuenta. Bogotá se abre por localidades.') +
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

  /* ------------------------------------------------------------------------
   * 14-nov-2026 — BOGOTÁ POR DENTRO
   * ---------------------------------------------------------------------- */
  /* Bogotá es el municipio que tiene adentro (su archivo dice cuál), y se
     abre como el departamento de un solo municipio que es: E.depto = '11'. */
  function deptoBogota() { return E.bogota ? String(E.bogota.municipio).slice(0, 2) : ''; }
  function enBogota() { return !!(E.bogota && E.depto && E.depto === deptoBogota()); }
  function tieneAdentro(c) { return !!(E.bogota && c === String(E.bogota.municipio)); }
  /* Una localidad va con «L» delante de su código («L08», Kennedy): los dos
     dígitos solos son el código de un departamento. */
  function esLoc(c) { return /^L\d\d$/.test(String(c == null ? '' : c)); }
  function nombreLoc(cc) {
    var b = E.res && E.res.bogota;
    return (b && b.idx.nombre[cc]) || cc;
  }
  /* La forma y el punto del nombre de una zona: en la vista de Bogotá, los
     finos de su archivo (localidades y vecinos); si no, los del mapa. */
  function formaDe(c) { return (E.zonas && E.zonas[c]) || muni(c); }

  /* BOGOTÁ Y LA SABANA. Tres capas, de abajo arriba:
       · los VECINOS (Soacha, Mosquera, Funza…), con el borde fino del archivo
         de Bogotá, coloreados y tocables como en un departamento abierto;
       · el FONDO: Bogotá según el DANE, en «sin clientes». Solo asoma donde
         el límite del DANE y el de Planeación no casan: sin él, esas rendijas
         serían el blanco del papel;
       · las LOCALIDADES y, encima, el CONTORNO de la ciudad: la unión de las
         19 que se ven, que trae el archivo. (Primero fue un trazo grueso de cada
         localidad pintado debajo de los rellenos; se transparentaba, porque
         los azules de la escala llevan alfa, y entre Suba y Usaquén salía
         una raya gorda.)
     En Departamentos van en azul, por lo que se ve de su cifra, y debajo
     pueden ir las calles (ver «LAS CALLES»). En Conquistas, en laca: una
     localidad se conquista igual que un municipio, y Bogotá sigue contando
     como UNO de los 1.122 (decisión del 14-nov: la cifra de Colombia no
     salta por abrir Bogotá).
     Las etiquetas: siempre, las zonas con 3 clientes o más; las de «1–2» y
     los nombres de las vacías, si caben (al acercar caben más). Lo que no
     tiene forma en la ventana (Sumapaz, que queda 30 km al sur) va en una
     línea debajo, para que su cifra no se pierda. */
  function vistaBogota() {
    var B = E.bogota, r = E.res, rb = r.bogota || { porLoc: {}, sinLoc: [] }, q2 = E.vista === 'conquistas';
    var NADIE = { clientes: 0, pagaron: 0 };
    E.zonas = {};
    E.min = Number(B.minimo) > 0 ? Number(B.minimo) : ANCHO_MIN;
    var estado = function (k) { return k.pagaron >= META ? 'conq' : k.clientes ? 'con' : 'vacio'; };
    var capa = { vacio: 0, con: 1, conq: 2 };
    /* En Conquistas lo conquistado se pinta al final, como en Colombia. */
    var porCapa = function (a, b) { return q2 ? capa[estado(a.k)] - capa[estado(b.k)] : 0; };
    var claseDe = function (k) { return q2 ? 'mapa-q ' + estado(k) : 'mapa-z t' + tramo(k.clientes); };
    var vecinos = lista(B.vecinos).filter(function (v) { return v.d && muni(v.c); }).map(function (v) {
      var p = Array.isArray(v.p) ? v.p : null;
      E.zonas[v.c] = { d: v.d, p: p };
      return { c: v.c, n: muni(v.c).n, k: r.porMuni[v.c] || NADIE, p: p, d: v.d };
    });
    var locs = lista(B.localidades).map(function (l) {
      var c = 'L' + l.c, p = Array.isArray(l.p) ? l.p : null;
      if (l.d) E.zonas[c] = { d: l.d, p: p };
      return { c: c, n: l.n, k: rb.porLoc[l.c] || NADIE, p: l.d ? p : null, d: l.d || '' };
    });
    var dibujadas = locs.filter(function (l) { return l.d; });
    var zonasV = vecinos.slice().sort(porCapa).map(function (v) {
      return '<path class="' + claseDe(v.k) + '" data-mapa="muni" data-c="' + esc(v.c) + '" d="' + v.d + '"><title>' + esc(textoMuni(v.c)) + '</title></path>';
    }).join('');
    var zonasL = dibujadas.slice().sort(porCapa).map(function (l) {
      return '<path class="' + claseDe(l.k) + ' mapa-loc" data-mapa="loc" data-c="' + l.c + '" d="' + l.d + '"><title>' + esc(textoLoc(l.c)) + '</title></path>';
    }).join('');

    /* Los nombres. El orden y el «siempre» salen de lo que se VE de cada
       cifra (3 o más es exacto; 1 y 2 son lo mismo), nunca de la cifra: va
       siempre la zona cuya cifra se dice entera. */
    var seDiceEntera = function (n) { var v = visible(n); return n > 0 && v.min === v.max; };
    var porLoQueSeVe = function (a, b) {
      return medio(visible(b.k.clientes)) - medio(visible(a.k.clientes)) || porNombre(a.n, b.n) || porNombre(a.c, b.c);
    };
    var todas = locs.concat(vecinos).filter(function (z) { return z.p; });
    var conGente = todas.filter(function (z) { return z.k.clientes; }).sort(porLoQueSeVe);
    var nombres = etiquetas(conGente.map(function (z) {
      return { c: z.c, x: z.p[0], y: z.p[1], nombre: z.n, cifra: cifra(z.k.clientes), siempre: seDiceEntera(z.k.clientes), cede: true,
        clase: q2 && z.k.pagaron >= META ? 'conq' : '' };
    }).concat(todas.filter(function (z) { return !z.k.clientes; }).map(function (z) {
      return { c: z.c, x: z.p[0], y: z.p[1], nombre: z.n, cifra: '', siempre: false, clase: 'mapa-et-sec' };
    })), false);

    /* Las listas del lado. */
    var conLoc = locs.filter(function (l) { return l.k.clientes; }).sort(porLoQueSeVe);
    var conVec = vecinos.filter(function (v) { return v.k.clientes; }).sort(porLoQueSeVe);
    var filaZ = function (z, derecha) {
      return '<li><button type="button" class="mapa-fila" data-mapa="' + (esLoc(z.c) ? 'loc' : 'muni') + '" data-c="' + esc(z.c) + '"><span>' + esc(z.n) +
        '</span><b>' + derecha + '</b></button></li>';
    };
    var rangoB = rangoDe(B.municipio), total = lista(B.localidades).length;
    var sinLoc = rb.sinLoc.length;
    var notaSinLoc = sinLoc ? '<p class="mapa-sinloc"><b>' + cifra(sinLoc) + '</b> clientes de Bogotá no tienen localidad: no tienen barrio (o el del registro es de otra ciudad), su barrio no está en la lista o está en varias localidades, la localidad que escribieron se llama también como un barrio de otra, lo escrito apunta a localidades distintas o nombra otro municipio. Siguen contando en Bogotá. Están abajo, cada uno con su ficha.</p>' : '';
    var fuera = locs.filter(function (l) { return !l.d; }).map(function (l) {
      /* Como textoLoc: sin ubicados, «sin clientes» a secas sería falso si un
         sin localidad puede ser de aquí. */
      var dud = (rb.dudososLoc && rb.dudososLoc[String(l.c).slice(1)]) || 0;
      return '<button type="button" class="mapa-enlace" data-mapa="loc" data-c="' + l.c + '">' + esc(l.n) + ' · ' +
        (l.k.clientes ? (q2 && l.k.pagaron >= META ? '🏁 ' : '') + clientes(l.k.clientes)
          : dud ? 'ninguno ubicado · ' + cifra(dud) + ' sin localidad pueden ser de aquí' : 'sin clientes') + '</button>';
    }).join(', ');
    var lineaFuera = fuera ? '<p class="mapa-fuera">Más al sur, fuera de esta ventana: ' + fuera + '</p>' : '';
    var lado;
    if (q2) {
      var claseQ = function (z) { return z.k.pagaron >= META ? 2 : z.k.pagaron > 0 ? 1 : 0; };
      var ordenQ = function (a, b) { return claseQ(b) - claseQ(a) || porLoQueSeVe(a, b); };
      var filaQ = function (z) { return filaZ(z, z.k.pagaron >= META ? '🏁' : esc(faltan(z.k.pagaron))); };
      var hechas = conLoc.filter(function (l) { return l.k.pagaron >= META; }).sort(ordenQ);
      var faltanL = conLoc.filter(function (l) { return l.k.pagaron < META; }).sort(ordenQ);
      lado = '<div class="mapa-lado"><div class="mapa-kpis">' +
        '<div><b>' + hechas.length.toLocaleString('es-CO') + '</b><span>' + (hechas.length === 1 ? 'conquistada' : 'conquistadas') + '</span></div>' +
        '<div><b>' + conLoc.length.toLocaleString('es-CO') + '</b><span>con clientes</span></div>' +
        '<div><b>' + total.toLocaleString('es-CO') + '</b><span>localidades</span></div></div>' +
        (hechas.length ? '<h3 class="mapa-h">🏁 Localidades conquistadas</h3><ol class="mapa-lista">' + hechas.map(filaQ).join('') + '</ol>' : '') +
        (faltanL.length ? '<h3 class="mapa-h">Por conquistar</h3><ol class="mapa-lista">' + faltanL.map(filaQ).join('') + '</ol>'
          : (hechas.length ? '' : '<p class="muted">Todavía no hay clientes de Bogotá con una localidad que se pueda ubicar.</p>')) +
        notaSinLoc +
        (conVec.length ? '<h3 class="mapa-h">Alrededor, en la Sabana</h3><ol class="mapa-lista mapa-otros">' + conVec.slice().sort(ordenQ).map(filaQ).join('') + '</ol>' : '') +
        '</div>';
    } else {
      lado = '<div class="mapa-lado"><h3 class="mapa-h">Bogotá, localidad por localidad</h3><div class="mapa-total"><b>' + cifraRango(rangoB) +
        '</b> clientes · ' + conLoc.length + ' de ' + total + ' localidades con clientes</div>' + notaRango(rangoB) +
        (conLoc.length ? '<ol class="mapa-lista">' + conLoc.map(function (l) { return filaZ(l, cifra(l.k.clientes)); }).join('') + '</ol>'
          : '<p class="muted">Ningún cliente de Bogotá con una localidad que se pueda ubicar.</p>') +
        notaSinLoc +
        (conVec.length ? '<h3 class="mapa-h">Alrededor, en la Sabana</h3><p class="muted mapa-nota-otros">Son otros municipios: no suman en el total de Bogotá.</p>' +
          '<ol class="mapa-lista mapa-otros">' + conVec.map(function (v) { return filaZ(v, cifraRango(rangoDe(v.c))); }).join('') + '</ol>' : '') +
        '</div>';
    }

    /* El dibujo. Las calles van DEBAJO de todo, en gris (el filtro les quita
       el color: verdes y naranjas debajo de un azul que significa algo se
       leerían como otra escala). El grupo va aunque estén quitadas: el botón
       las pone y las quita sin volver a pintar. */
    var calles = !q2 && E.calles;
    var debajo = q2 ? '' : '<defs><filter id="mapa-gris" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="0.84" intercept="0.14"/>' +
      '<feFuncG type="linear" slope="0.84" intercept="0.14"/><feFuncB type="linear" slope="0.84" intercept="0.14"/></feComponentTransfer></filter></defs>' +
      '<g class="mapa-teselas" filter="url(#mapa-gris)" aria-hidden="true"></g>';
    var cuerpo = debajo + '<g class="mapa-zonas">' + zonasV + (B.fondo ? '<path class="mapa-fondo" d="' + B.fondo + '"/>' : '') + '</g>' +
      '<g class="mapa-zonas">' + zonasL + '</g>' + (B.contorno ? '<path class="mapa-borde mapa-ciudad" d="' + B.contorno + '"/>' : '') + nombres;
    var botonCalles = q2 ? '' : '<button type="button" class="mapa-zb mapa-todo mapa-calles-b' + (E.calles ? ' on' : '') + '" data-mapa="calles" aria-pressed="' + !!E.calles +
      '" title="Poner o quitar las calles de OpenStreetMap debajo del mapa">Calles</button>';
    /* El crédito de OpenStreetMap, SOBRE el mapa y a la vista mientras haya
       calles: es su condición de uso, no un detalle del pie. */
    var osm = q2 ? '' : '<div class="mapa-osm"' + (calles ? '' : ' hidden') + '>© <a href="' + URL_OSM + '" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a></div>' +
      '<div class="mapa-osm-aviso" role="status" hidden>Las calles no cargaron (¿sin señal?). El mapa sigue igual sin ellas.</div>';
    var texto = q2 ? 'Una localidad se conquista con ' + META + ' clientes que pagaron un crédito entero. Un cierre con pérdida no cuenta.'
      : 'Bogotá, D.C. · ' + (r.porMuni[B.municipio] ? clientesDe(B.municipio) : 'sin clientes') + ' · toca una localidad o un municipio vecino.';
    var pie = q2 ? '<div class="mapa-leyenda mapa-leyenda-q"><span><i class="mapa-q conq"></i>Conquistada</span><span><i class="mapa-q con"></i>Con clientes</span><span><i class="mapa-q vacio"></i>Sin clientes</span></div>'
      : leyenda('mapa-z');
    return '<div class="mapa-cuerpo"><div class="mapa-lienzo' + (q2 ? ' mapa-laca' : calles ? ' mapa-calles' : '') + '">' + barra(true, botonCalles) +
      '<div class="mapa-marco">' + svg(lista(B.caja).slice(0, 4), cuerpo, q2 ? 'mapa-oscuro' : 'mapa-papel',
        'Bogotá por localidades y sus municipios vecinos, ' + (q2 ? 'conquistados, con clientes y sin clientes' : 'coloreados por número de clientes')) + osm + '</div>' +
      globoYLinea(texto) + pie + lineaFuera + '</div>' + lado + '</div>';
  }

  /* Los clientes de Bogotá sin localidad: con su número, el barrio que
     escribieron, por qué no, y el botón a su ficha (la pestaña no corrige:
     solo lee). Cerrado de entrada, como los sin ubicar: son nombres. */
  /* «Usaquén, Usme, Bosa o Suba»: con comas, y la conjunción solo al final. */
  function enumerar(nombres, conjuncion) {
    var n = lista(nombres);
    return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + conjuncion + n[n.length - 1];
  }
  function sinLocalidad() {
    var rb = E.res && E.res.bogota, l = rb ? rb.sinLoc : [];
    if (!l.length) return '';
    var filas = l.slice().sort(function (a, b) { return (Number(a.numero) || 0) - (Number(b.numero) || 0); }).map(function (x) {
      var porque = x.estado === 'vacio' ? 'Sin barrio en la ficha' + (x.registro ? ' (el del registro es de ' + x.registro + ')' : '') + '.'
        : x.estado === 'ambiguo' && x.homonima ? 'La localidad «' + x.homonima + '» se llama también como un barrio de ' + enumerar(x.homonimaEn, ' y ') +
          ', y lo demás no dice cuál es: pon en «Ciudad» «Bogotá - ' + x.homonima + '».'
        : x.estado === 'ambiguo' ? 'Ese barrio está en varias localidades: ' + enumerar(x.opciones, ' o ') + '.'
        : x.estado === 'choque' ? 'Lo escrito apunta a localidades distintas: ' + enumerar(x.opciones, ' y ') + '.'
        : x.estado === 'otro-municipio' && x.en === 'ciudad' ? '«Ciudad» nombra también otro municipio (' + x.municipio + '): deja en «Ciudad» solo el municipio donde vive.' +
          (x.tambienBarrio ? ' Si es un barrio de aquí que se llama igual, va en «Barrio».' : '')
        : x.estado === 'otro-municipio' ? 'El barrio nombra otro municipio (' + x.municipio + '): si vive allá, corrige «Ciudad».'
        : 'No reconozco ese barrio.';
      return '<li><div><b>' + (x.numero != null && x.numero !== '' ? '#' + esc(x.numero) + ' ' : '') + esc(x.nombre || 'Sin nombre') + '</b>' +
        (x.texto ? ' · barrio «' + esc(x.texto) + '»' : '') + '<div class="muted">' + esc(porque) + '</div></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-mapa="ficha" data-id="' + esc(x.id) + '">Abrir ficha</button></li>';
    }).join('');
    return '<details class="mapa-sin mapa-sin-loc"><summary>⚠️ ' + cifra(l.length) + ' clientes de Bogotá sin localidad — cuentan en Bogotá, no en una localidad</summary><p class="muted">Corrige la ficha. Si el barrio está en dos localidades, escribe la suya al lado («Lisboa, Suba») o ponla en «Ciudad» detrás de Bogotá: «Bogotá - Suba». Sola no: Santa Fe, San Cristóbal y Ciudad Bolívar son también municipios de otros departamentos.</p><ol>' + filas + '</ol></details>';
  }

  /* ------------------------------------------------------------------------
   * LAS CALLES, en la página (la cuenta está en teselas(), arriba)
   * ---------------------------------------------------------------------- */
  function callesPuestas() { return !!(E.calles && enBogota() && E.vista !== 'conquistas'); }
  /* Se piden cuando el mapa se queda quieto: en un arrastre llegan sesenta
     ventanas por segundo, y pedirle las teselas de cada una a un servidor
     ajeno es justo el uso que sus condiciones no quieren. Mientras tanto las
     que ya están se mueven con el mapa. */
  function pedirTeselas() {
    if (!callesPuestas() || typeof setTimeout !== 'function') return;
    if (E.tes.reloj) clearTimeout(E.tes.reloj);
    E.tes.reloj = setTimeout(function () { E.tes.reloj = 0; ponerTeselas(); }, 160);
  }
  function ponerTeselas() {
    var z = E.z, B = E.bogota;
    if (!z || !z.svg || !B || !callesPuestas() || typeof z.svg.querySelector !== 'function') return;
    var g = z.svg.querySelector('g.mapa-teselas'), doc = z.svg.ownerDocument, r = medir(z.svg);
    if (!g || !doc || typeof doc.createElementNS !== 'function' || !r) return;
    /* Lo que se ve del mapa: la ventana y, si el <svg> es más ancho que ella,
       las franjas de los lados (ahí también se ve mapa). */
    var a = aMapa(z.vb, r, r.left, r.top), b = aMapa(z.vb, r, r.left + r.width, r.top + r.height);
    var quiero = {};
    teselas([a[0], a[1], b[0] - a[0], b[1] - a[1]], z.s, B.proy).forEach(function (t) { quiero[t.z + '/' + t.x + '/' + t.y] = t; });
    /* `_vieja`: la marca de lo que sobra. Si antes de los 700 ms el mapa
       vuelve a una ventana que la necesita (acercar y «Volver a ver todo»,
       arrastrar y volver), se desmarca y el temporizador ya no se la lleva:
       sin eso el mapa se quedaba sin calles con el botón puesto. */
    var viejas = [];
    [].slice.call(g.querySelectorAll('image')).forEach(function (im) {
      var k = im.getAttribute('data-t');
      if (quiero[k]) { delete quiero[k]; im._vieja = false; } else { im._vieja = true; viejas.push(im); }
    });
    var quitar = function (im) { if (im.parentNode) im.parentNode.removeChild(im); };
    var nuevas = Object.keys(quiero);
    nuevas.forEach(function (k) {
      var t = quiero[k], im = doc.createElementNS('http://www.w3.org/2000/svg', 'image');
      /* Medio píxel de más: entre dos teselas vecinas no queda una raya. */
      var mas = z.s / 2;
      im.setAttribute('data-t', k);
      im.setAttribute('x', String(t.mx)); im.setAttribute('y', String(t.my));
      im.setAttribute('width', String(t.mw + mas)); im.setAttribute('height', String(t.mh + mas));
      im.setAttribute('preserveAspectRatio', 'none');
      im.addEventListener('load', function () { E.tes.bien++; avisoDeCalles(); });
      im.addEventListener('error', function () { E.tes.mal++; quitar(im); avisoDeCalles(); });
      im.setAttribute('href', urlDeTesela(t));
      g.appendChild(im);
    });
    /* Las de otro zoom se quedan un momento debajo de las nuevas: sin eso, a
       cada paso de zoom el mapa parpadea en blanco mientras llegan. */
    if (viejas.length) {
      if (nuevas.length && typeof setTimeout === 'function') {
        setTimeout(function () { viejas.forEach(function (im) { if (im._vieja) quitar(im); }); }, 700);
      }
      else viejas.forEach(quitar);
    }
  }
  /* Si ninguna llegó, se dice: un mapa «con calles» sin calles parece roto. */
  function avisoDeCalles() {
    var el = q('.mapa-osm-aviso');
    if (el) el.hidden = !(callesPuestas() && E.tes.mal > 0 && E.tes.bien === 0);
  }
  /* El botón «Calles». No vuelve a pintar (se perdería el zoom): cambia la
     clase del lienzo —con calles, los colores van transparentes— y pone o
     quita las teselas. */
  function alternarCalles() {
    E.calles = !E.calles;
    var puestas = callesPuestas();
    var boton = q('[data-mapa="calles"]'), osm = q('.mapa-osm'), g = q('g.mapa-teselas');
    clase(q('.mapa-lienzo'), 'mapa-calles', puestas);
    clase(boton, 'on', E.calles);
    if (boton && typeof boton.setAttribute === 'function') boton.setAttribute('aria-pressed', String(!!E.calles));
    if (osm) osm.hidden = !puestas;
    if (!puestas && g && typeof g.removeChild === 'function') { while (g.firstChild) g.removeChild(g.firstChild); }
    E.tes.bien = 0; E.tes.mal = 0;
    avisoDeCalles();
    pedirTeselas();
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
    URL_BOGOTA: URL_BOGOTA,
    URL_TESELAS: URL_TESELAS,
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
    /* 14-nov: la cuenta de las calles, pura, para las pruebas. */
    teselas: teselas,
    urlDeTesela: urlDeTesela,
    _estado: E
  };
});
