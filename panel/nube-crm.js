/* ===========================================================================
 * NUBE-CRM — el CRM de Joan SUBE solo a la nube. No baja nada.
 * 1 de octubre de 2026. Etapa 1 de RECETA-NUBE-CRM.md (escrita el 15-sep).
 *
 * Joan, el 1-oct: «quiero ver este CRM desde mi celular». El celular
 * (panel/espejo.html) ya lee la nube; lo que faltaba es que la nube estuviera
 * al día sin que Joan tuviera que acordarse de abrir subir.html. Esto hace eso
 * y NADA MÁS: sube lo que la cartera tiene GUARDADO en el disco.
 *
 * MEDIDO ANTES DE ESCRIBIR UNA LÍNEA (paso 0 de la receta), con node 22, sobre
 * el respaldo de verdad de Joan del 1-oct-2026 (28 socios, 94 créditos, 0
 * respaldados, 699 asignaciones). Solo se midieron tamaños y tiempos:
 *   · la cartera tal como la escribe guardar() .......... 270.186 caracteres
 *     (sin fotos, 270.032: las fotos ya son tokens desde el 15-sep)
 *   · el espejo después de subirla entera ............... 176.416 caracteres
 *     (0,65 veces la cartera; juntos, 446.602 de los ~5 millones del cajón)
 *   · armarLote con el espejo VACÍO (la primera vez) ....... 4,9 ms (peor 12,2)
 *   · armarLote con el espejo LLENO (cada vuelta) .......... 8,2 ms (peor 15,9)
 *     y leyendo cartera y espejo del disco antes ........... 9,3 ms (peor 18,1)
 *   · la huella del sello sobre la cartera entera .......... 0,5 ms
 * La receta decía: si armarLote pasa de 300 ms, los 90 s de quietud suben a
 * 5 min. Está a una vigésima parte de eso aun suponiendo un portátil cinco
 * veces más lento que node, así que se quedan los 90 s.
 *
 * LO QUE ESTE ARCHIVO NO HACE, Y NO PUEDE HACER:
 *   · NO ESCRIBE NUNCA 'joan_socios_v1'. Ni para «arreglar» nada. La única que
 *     escribe la cartera es crm.html (guardar() e importar()) y traer.html. Si
 *     algún día alguien lo intenta desde acá, escribirTexto() lanza.
 *   · NO BAJA NADA. Bajar es lo único que pisa la cartera de Joan, y es la
 *     Etapa 2. Con esto solo, el peor fallo posible es que algo NO suba, nunca
 *     que algo se borre.
 *   · NO FABRICA BORRADOS. armarLote va SIEMPRE con marcarBorrados:false: una
 *     fila que falta en la cartera no se manda borrada. Lo único que se borra
 *     de la nube es lo que crm.html anotó en `DB.nubeBorrados` en el MISMO
 *     guardar() en que Joan borró (borrarCredito, borrarCliente), y si son más
 *     de tres fichas, ni eso sin su «sí» con los nombres delante.
 *   · NO SUBE fotos (sinFotos: pesan y la selfie es dato biométrico, Ley 1581),
 *     ni la papelera, ni config, ni plantillas, ni contactos. Solo las tres
 *     tablas y tres ajustes que solo suman (gestiones, asignaciones,
 *     actosComision). La barra de Ajustes lo dice.
 *
 * LAS LLAVES QUE SÍ ESCRIBE:
 *   joan_panel_espejo_pc   el espejo: la MISMA llave de subir.html. Dos puntos
 *                          de partida del diff en un computador se fabricarían
 *                          choques el uno al otro.
 *   joan_panel_choques     las dos versiones de cada choque (NUBE.agregarChoques)
 *   joan_crm_nube          lo suyo: congeladas, borrados confirmados, contadores
 *                          ya sembrados, última subida.
 *   joan_crm_sync_dueno    el latido de la pestaña que sube.
 *
 * DONDE ESTO SE APARTA DE LA RECETA, Y POR QUÉ (cada cosa medida en el código
 * del 1-oct, que no es el del 15-sep):
 *   1. nube.js ya se carga en crm.html desde el 15-sep (lo usa guardar()), así
 *      que crm.html solo suma <script src="nube-crm.js">.
 *   2. guardar() ya devolvía true/false desde el 15-sep. Lo que se le agrega
 *      es el sello, y en las DOS ramas que escriben (también guardarSinFotos).
 *   3. El sello lleva una HUELLA del texto además del largo. Con el largo solo,
 *      un cobro de 260.000 corregido a 240.000 por otra página tiene el mismo
 *      largo y pasa la puerta.
 *   4. guardar() INVALIDA EL ESPEJO cuando va a escribir encima de una cartera
 *      que escribió otro (otra pestaña, subir.html). La puerta del sello solo
 *      mira en cada vuelta; si la pestaña vieja guarda antes de la vuelta, la
 *      cartera retrocedida ya lleva su sello y la siguiente subida pisaría el
 *      cobro del celular con la revisión buena. Sin espejo, toca emparejar, y
 *      emparejar congela lo que difiere en vez de pisarlo.
 *   5. El sello se RECLAMA después del PIN, no al abrir. Una pestaña olvidada
 *      en la pantalla del PIN no puede quitarle el turno a la que trabaja.
 *   6. El freno cuenta FICHAS y usa el mayor entre 3 y el 5% (lo que la receta
 *      propone en «Lo que Joan tiene que decidir», punto 1). frenoDeBorrados de
 *      nube.js (23-sep) cuenta FILAS y frena por cualquiera de los dos topes:
 *      sirve para los borrados por resta de subir.html, pero con el espejo de
 *      Joan (122 filas) borrar UN cliente con seis créditos son 7 filas, un
 *      5,7%, y frenaría todo. Es el aviso que se aprende a apretar sin leer.
 *   7. emparejar() también adopta los tres ajustes cuando son IDÉNTICOS
 *      (espejoDeAdopcion solo mira las tres tablas). Si difieren, se congelan.
 *   8. El turno de pestaña sigue al sello: sube la pestaña cuyo sello está en
 *      el disco. El latido solo sirve para saber si esa pestaña sigue viva.
 *
 * LA SEGUNDA VUELTA (1-oct-2026, tras tres revisiones a la contra; cada cosa
 * con su prueba en pruebas/nube-crm-revision.test.js):
 *   9. Al volver un pedazo, antes de anotar el espejo se mira OTRA VEZ que la
 *      cartera sea la de esta pestaña y que el espejo siga sembrado.
 *  10. El espejo que dejó subir.html no se cree a ciegas: se empareja una vez
 *      por computador (estado.emparejadoEn), y la entrada heredada solo se
 *      queda si la nube no tiene nada que la ficha de acá no tenga.
 *  11. Un borrado que no alcanzó a subir antes de soltarse el espejo sale
 *      igual al emparejar (o queda en discusión si el celular la tocó).
 *  12. El borrado viaja SIN datos (Ley 1581); el nombre del freno va aparte.
 *  13. El choque contra lo que este mismo computador ya escribió (respuesta
 *      perdida, espejo que no cupo) se anota y no se congela.
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = { crear: fabrica }; return; }
  /* Sin nube.js no hay nada que hacer, y no se finge: NubeCRM no existe, y la
     RECETA E de crm.html lo dice en Ajustes a los 1,5 s. Un div vacío no puede
     parecer «todo bien». */
  if (!raiz || typeof raiz.NubeTuGarantia !== 'object' || !raiz.NubeTuGarantia) return;
  try { raiz.NubeCRM = fabrica({}); } catch (e) { /* idem: la RECETA E lo dice */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (entorno) {
  'use strict';

  var VERSION = '2026-10-01';
  var E = entorno || {};
  var G = (typeof globalThis !== 'undefined') ? globalThis : {};
  var N = E.nube || G.NubeTuGarantia;

  /* =========================================================================
   * CONSTANTES
   * =======================================================================*/
  /* Esta llave NO se escribe nunca desde acá. Está escrita para que
     escribirTexto() pueda negarse con nombre propio. */
  var LLAVE_CARTERA = 'joan_socios_v1';
  var LLAVE_ESPEJO = 'joan_panel_espejo_pc';
  var LLAVE_SELLO = 'joan_crm_sello';
  var LLAVE_ESTADO = 'joan_crm_nube';
  var LLAVE_DUENO = 'joan_crm_sync_dueno';
  var LLAVE_SESION = (N && N.LLAVE_SESION) || 'joan_panel_sesion';
  /* Firma lo mismo que subir.html: para el celular, las dos son «el computador»
     (ver base/20261001_panel_ultima_subida.sql). */
  var DISPOSITIVO = 'computador';
  /* Las únicas tres claves de ajuste que viajan en esta etapa: solo suman. Se
     miró crm.html el 1-oct: gestiones(), asignaciones() y actosComision se
     llenan con push. traerGestiones() sí reescribe en sitio una gestión que ya
     tenía (Object.assign con lo que trae la nube), pero lo que copia es lo del
     servidor, y en esta etapa nada baja: el control de revisiones basta. */
  var CLAVES_QUE_SUBEN = ['gestiones', 'asignaciones', 'actosComision'];
  var TABLAS = ['socios', 'creditos', 'respaldados'];
  var CAMPO_DB = { socios: 'socios', creditos: 'prestamos', respaldados: 'respaldados' };
  var QUIETUD_MS = 90000;
  /* 50 y no 200: cada pedazo confirmado se anota en el espejo antes de mandar el
     siguiente, y así la ventana «confirmado arriba, sin anotar abajo» es de
     décimas y no de segundos. */
  var POR_PEDAZO = 50;
  var LATIDO_MS = 10000;
  /* Una pestaña de fondo en Chrome corre sus relojes una vez por minuto. Con
     30 s, la pestaña que trabaja parecería muerta cada vez que Joan mira otra. */
  var VIVA_MS = 150000;
  var TOPE_FICHAS = 3, TOPE_PCT = 5;

  /* =========================================================================
   * UTILIDADES (sin dependencias, mismo estilo que nube.js)
   * =======================================================================*/
  function lista(v) { return Array.isArray(v) ? v : []; }
  function objeto(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function num(v) { return Number(v) || 0; }
  function texto(v) { return v == null ? '' : String(v); }
  function esc(s) {
    return texto(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }
  function ahora() { return E.ahora ? E.ahora() : Date.now(); }
  function iso() { return new Date(ahora()).toISOString(); }
  function programar(f, ms) { return E.programar ? E.programar(f, ms) : setTimeout(f, ms); }
  function desprogramar(t) { if (t == null) return; if (E.desprogramar) E.desprogramar(t); else clearTimeout(t); }
  function cadaRato(f, ms) { return E.cadaRato ? E.cadaRato(f, ms) : setInterval(f, ms); }
  function ventana() { return E.ventana || G; }
  function documento() { return E.documento || G.document || null; }
  function enLinea() {
    if (E.enLinea) return E.enLinea();
    try { return !(G.navigator && G.navigator.onLine === false); } catch (e) { return true; }
  }
  var red = E.red || {
    conectado: function () { return N.conectado(); },
    traer: function (d) { return N.traer(d); },
    empujar: function (disp, l) { return N.empujar(disp, l); },
    sembrarContador: function (k, v) { return N.sembrarContador(k, v); }
  };
  function conectado() { try { return !!red.conectado(); } catch (e) { return false; } }
  function agregarChoques(ch) { return (E.agregarChoques || N.agregarChoques)(ch); }

  /* ------------------------------------------------------------------ disco */
  function almacen() {
    if (E.almacen) return E.almacen;
    try { return G.localStorage || null; } catch (e) { return null; }
  }
  function leerTexto(llave) {
    var a = almacen(); if (!a) return null;
    try { return a.getItem(llave); } catch (e) { return null; }
  }
  function leerJSON(llave, porDefecto) {
    var t = leerTexto(llave); if (!t) return porDefecto;
    try { return JSON.parse(t); } catch (e) { return porDefecto; }
  }
  /* El cinturón: igual que escribirJSON de nube.js. Si alguien escribe acá la
     llave de la cartera, se cae su prueba y no la cartera de Joan. */
  function escribirTexto(llave, t) {
    if (llave === LLAVE_CARTERA) {
      throw new Error('nube-crm.js no escribe nunca ' + LLAVE_CARTERA + ': la cartera solo la escribe crm.html.');
    }
    var a = almacen(); if (!a) return false;
    try { a.setItem(llave, t); return true; } catch (e) { return false; }
  }

  /**
   * La cartera CRUDA del disco, no `DB`. `let DB` de crm.html no es propiedad
   * de window, y además lo que solo está en memoria todavía no es un hecho:
   * lo que sube es lo GUARDADO. Se rellenan los arreglos igual que leerDB() de
   * subir.html y no se corre ninguna migración: esta pieza es un mensajero.
   */
  function leerCarteraDelDisco() {
    var txt = leerTexto(LLAVE_CARTERA);
    if (txt === null) txt = '';
    var d;
    try { d = txt ? JSON.parse(txt) : {}; }
    catch (e) { return { txt: txt, db: null, error: 'La cartera guardada no se puede leer.' }; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      return { txt: txt, db: null, error: 'La cartera guardada no tiene la forma de una cartera.' };
    }
    d.socios = d.socios || d.clientes || [];
    d.prestamos = d.prestamos || [];
    d.respaldados = d.respaldados || [];
    d.contadores = Object.assign({ cliente: 0, credito: 0, respaldado: 0 }, objeto(d.contadores));
    return { txt: txt, db: d };
  }

  /* El espejo se RELEE del disco antes de cada diff y antes de cada escritura,
     y nunca se guarda en una variable entre dos llamadas de red: subir.html
     escribe la misma llave. */
  function leerEspejo() { return objeto(leerJSON(LLAVE_ESPEJO, null)); }
  function entrada(esp, t, id) {
    var tabla = objeto(objeto(esp)[t]);
    return Object.prototype.hasOwnProperty.call(tabla, id) ? objeto(tabla[id]) : null;
  }
  /* El espejo cuenta como sembrado si tiene ENTRADAS DE FILA. No se mira
     servidor_ahora: subir.html no lo escribe nunca, así que esa reja no abriría.
     `emparejado_en` cubre la cartera vacía: sin filas, emparejar no deja
     ninguna entrada y habría que emparejar en cada vuelta. */
  function espejoSembrado(esp) {
    for (var i = 0; i < TABLAS.length; i++) if (Object.keys(objeto(esp[TABLAS[i]])).length) return true;
    return !!esp.emparejado_en;
  }
  /* COMPRUEBA su propio setItem. El catch mudo de subir.html es razonable para
     una página que corre una vez; para un ciclo cada pocos minutos es una
     máquina de choques falsos: el pedazo sube, el espejo no avanza, y la vuelta
     siguiente choca contra filas que ya se escribieron bien. */
  function escribirEspejo(esp) {
    var t;
    try { t = JSON.stringify(esp); } catch (e) { return false; }
    return escribirTexto(LLAVE_ESPEJO, t);
  }

  function leerEstado() {
    var e = objeto(leerJSON(LLAVE_ESTADO, null));
    return {
      v: 1,
      congeladas: objeto(e.congeladas),
      borradosConfirmados: objeto(e.borradosConfirmados),
      contadoresConocidos: objeto(e.contadoresConocidos),
      ultimaSubida: e.ultimaSubida || null,
      ultimaVuelta: e.ultimaVuelta || null,
      emparejadoEn: e.emparejadoEn || null
    };
  }
  /* Las congeladas también viven en memoria: si el disco dijera «no cupo» al
     anotarlas, la fila no puede volver a salir en la vuelta siguiente y gotear
     otra copia del mismo choque en panel_choques (bigserial sin unique). */
  var _congeladasMem = {};
  function guardarEstado(est) {
    Object.keys(objeto(est.congeladas)).forEach(function (k) { _congeladasMem[k] = est.congeladas[k]; });
    try { return escribirTexto(LLAVE_ESTADO, JSON.stringify(est)); } catch (e) { return false; }
  }
  function congeladasDe(est) {
    var c = {};
    Object.keys(_congeladasMem).forEach(function (k) { c[k] = _congeladasMem[k]; });
    Object.keys(objeto(est.congeladas)).forEach(function (k) { c[k] = est.congeladas[k]; });
    return c;
  }

  /* =========================================================================
   * PARTE PURA — QUÉ SUBIR
   * =======================================================================*/

  /* Nombre para mostrar de una fila: socio por su nombre, crédito por el de su
     socio. Los códigos los arma el puente cuando está (los mismos que ve el
     socio en su app). */
  function codigo(t, f) {
    var P = E.puente || G.PuenteTuGarantia;
    try {
      if (P && t === 'socios' && P.codCliente) return P.codCliente(f);
      if (P && t === 'creditos' && P.codCredito) return P.codCredito(f);
      if (P && t === 'respaldados' && P.codRespaldado) return P.codRespaldado(f);
    } catch (e) { /* sin puente, el número a pelo */ }
    if (!f || f.numero == null) return '';
    return (t === 'socios' ? 'cliente #' : t === 'creditos' ? 'crédito #' : 'préstamo con garantía #') + f.numero;
  }
  function nombreDe(t, f) {
    var d = objeto(f);
    if (t === 'ajustes') return 'la lista de ' + ({ gestiones: 'gestiones', asignaciones: 'asignaciones del equipo', actosComision: 'actos de comisión' }[d.__clave] || d.__clave || 'ajustes');
    var quien = t === 'socios' ? texto(d.nombre) : texto(d.socioNombre);
    var cod = codigo(t, d);
    return (quien || 'sin nombre') + (cod ? ' · ' + cod : '');
  }

  /**
   * Los borrados que SÍ se pueden mandar: los que crm.html anotó en
   * `db.nubeBorrados` al borrar. Y aun de esos, solo los que:
   *   · NO están vivos en la cartera (una fila viva no se borra NUNCA, diga lo
   *     que diga una lista — así un respaldo importado con una lista vieja no
   *     puede matar una ficha que la cartera tiene);
   *   · están en el espejo y sin borrar (si la nube no la tiene, no hay nada
   *     que borrar; si ya está borrada, ya se hizo).
   *
   * 1-oct-2026 (segunda vuelta) — EL BORRADO VIAJA SIN DATOS. Antes se mandaba
   * el último dato conocido, como hacía armarLote, y la ficha que Joan borró
   * se quedaba ENTERA en panel_socios (cédula, teléfono, dirección) y bajaba a
   * cada celular en panel_traer. Ley 1581: lo que el dueño borra no se queda
   * guardado en otro sitio. El SQL ya acepta datos nulos en una fila borrada y
   * guarda '{}' (base/20260811_panel_nube.sql:395-401). Si Joan la devuelve
   * de la papelera, la subida siguiente la manda entera otra vez. El nombre
   * para el freno va en `datos`, FUERA de la fila: no viaja.
   */
  function borradosExplicitos(db, esp) {
    var d = objeto(db), vivas = {};
    TABLAS.forEach(function (t) {
      vivas[t] = {};
      lista(d[CAMPO_DB[t]]).forEach(function (f) { if (f && f.id != null) vivas[t][String(f.id)] = true; });
    });
    var out = [], vistos = {};
    lista(d.nubeBorrados).forEach(function (b) {
      if (!b || TABLAS.indexOf(b.tabla) < 0 || b.id == null || b.id === '') return;
      var t = b.tabla, id = String(b.id), k = t + '|' + id;
      if (vistos[k]) return;
      vistos[k] = true;
      if (vivas[t][id]) return;
      var ant = entrada(esp, t, id);
      if (!ant || ant.borrado) return;
      var datos = null;
      try { datos = JSON.parse(ant.json); } catch (e) { datos = null; }
      out.push({ tabla: t, datos: datos, fila: { id: id, datos: null, revision_base: num(ant.revision), borrado: true } });
    });
    return out;
  }

  /**
   * EL FRENO, la tercera defensa (la primera es marcarBorrados:false, la segunda
   * el sello). Cuenta FICHAS: un socio que se va con sus créditos es UNA ficha;
   * un crédito suelto, otra. Frena si son más que el mayor entre 3 y el 5% de
   * las fichas del espejo. Lo que frena son solo los borrados NUEVOS: lo demás
   * del lote sube igual, y lo que Joan ya confirmó, también.
   */
  function frenoPorFichas(borrados, esp, confirmados) {
    var conf = objeto(confirmados);
    var nuevos = [], dichos = [];
    lista(borrados).forEach(function (b) { (conf[b.tabla + '|' + b.fila.id] ? dichos : nuevos).push(b); });
    var seVan = {};
    nuevos.forEach(function (b) { if (b.tabla === 'socios') seVan[b.fila.id] = true; });
    var fichas = 0;
    nuevos.forEach(function (b) {
      if (b.tabla === 'socios') { fichas++; return; }
      var s = datosDeBorrado(b).socioId;
      if (!(s != null && seVan[String(s)])) fichas++;
    });
    var enEspejo = 0;
    var soc = objeto(objeto(esp).socios);
    Object.keys(soc).forEach(function (id) { if (!objeto(soc[id]).borrado) enEspejo++; });
    var tope = Math.max(TOPE_FICHAS, Math.ceil(enEspejo * TOPE_PCT / 100));
    var frena = fichas > tope;
    return {
      fichas: fichas, tope: tope, enEspejo: enEspejo, frena: frena,
      pasan: frena ? dichos : dichos.concat(nuevos),
      retenidos: frena ? nuevos : []
    };
  }

  /* Las frases del freno, con los NOMBRES: «Pedro Ruiz y sus 5 créditos». Un
     borrado de verdad se reconoce en un vistazo; uno fabricado por una cartera
     a medias no se confirma nunca, porque Joan no reconoce esos nombres. */
  /* El último dato conocido de un borrado, que ya no viaja en la fila: sirve
     para agrupar créditos bajo su socio y para decir los nombres. */
  function datosDeBorrado(b) { return objeto(b && (b.datos || (b.fila && b.fila.datos))); }
  function frasesDeBorrado(retenidos) {
    var socios = {}, sueltos = [];
    lista(retenidos).forEach(function (b) { if (b.tabla === 'socios') socios[b.fila.id] = { b: b, cr: 0, re: 0 }; });
    lista(retenidos).forEach(function (b) {
      if (b.tabla === 'socios') return;
      var s = datosDeBorrado(b).socioId;
      var g = s != null ? socios[String(s)] : null;
      if (g) { if (b.tabla === 'creditos') g.cr++; else g.re++; }
      else sueltos.push(b);
    });
    var out = [];
    Object.keys(socios).forEach(function (id) {
      var g = socios[id], extra = [];
      if (g.cr) extra.push(g.cr === 1 ? 'su crédito' : 'sus ' + g.cr + ' créditos');
      if (g.re) extra.push(g.re === 1 ? 'su préstamo con garantía' : 'sus ' + g.re + ' préstamos con garantía');
      out.push(nombreDe('socios', datosDeBorrado(g.b)) + (extra.length ? ' y ' + extra.join(' y ') : ''));
    });
    sueltos.forEach(function (b) {
      out.push((b.tabla === 'creditos' ? 'el crédito ' : 'el préstamo con garantía ') + nombreDe(b.tabla, datosDeBorrado(b)));
    });
    return out;
  }

  /* DETECTOR de números repetidos. No es pérdida —la identidad es el id, no el
     número— pero invisible se descubre meses después en un recibo con el
     número de otro. Mientras el CRM emita números sin preguntarle a la nube,
     esto es lo único que lo ve. */
  function numerosRepetidos(db) {
    var d = objeto(db), out = [];
    TABLAS.forEach(function (t) {
      var por = {};
      lista(d[CAMPO_DB[t]]).forEach(function (f) {
        if (!f || f.numero == null || f.numero === '' || num(f.numero) <= 0) return;
        (por[String(f.numero)] = por[String(f.numero)] || []).push(f);
      });
      Object.keys(por).forEach(function (n) {
        if (por[n].length < 2) return;
        out.push({ tabla: t, numero: n, codigo: codigo(t, por[n][0]),
                   nombres: por[n].map(function (f) { return t === 'socios' ? texto(f.nombre) : texto(f.socioNombre); }) });
      });
    });
    return out;
  }

  /**
   * El plan de una vuelta, sin red: en este orden, que es el de la receta
   * (paso 8, c a f).
   *   c. armarLote con marcarBorrados:false — un borrado nunca sale de una resta;
   *   d. los borrados explícitos de db.nubeBorrados;
   *   e. fuera toda fila congelada (choque abierto o difiere desde la siembra):
   *      así panel_choques deja de gotear y las demás siguen subiendo;
   *   f. el freno de borrados.
   */
  function planDeSubida(db, esp, congeladas, confirmados) {
    var cong = objeto(congeladas);
    var lote = N.armarLote(db, esp, { claves: CLAVES_QUE_SUBEN, marcarBorrados: false });
    var fuera = 0;
    function libre(t, id) { if (cong[t + '|' + id]) { fuera++; return false; } return true; }
    TABLAS.forEach(function (t) { lote[t] = lote[t].filter(function (f) { return libre(t, String(f.id)); }); });
    lote.ajustes = lote.ajustes.filter(function (a) { return libre('ajustes', String(a.clave)); });
    var borrados = borradosExplicitos(db, esp).filter(function (b) { return libre(b.tabla, b.fila.id); });
    var freno = frenoPorFichas(borrados, esp, confirmados);
    freno.pasan.forEach(function (b) { lote[b.tabla].push(b.fila); });
    return {
      lote: lote, retenidos: freno.retenidos, freno: freno,
      congeladasFuera: fuera, omitidas: lista(lote.omitidas), repetidos: numerosRepetidos(db)
    };
  }

  /**
   * La siembra: qué puede afirmar el espejo sin mentir. Las tres tablas las
   * decide NUBE.espejoDeAdopcion (Etapa 0, con sus pruebas); acá solo se suma
   * lo que esa función no mira: los tres ajustes que suben. Un ajuste se adopta
   * solo si es IDÉNTICO — una lista con un elemento de más en la nube no es la
   * misma lista, y adoptarla lo perdería en la subida siguiente.
   */
  function calcularEmparejo(db, paquete, espPrevio) {
    var r = N.espejoDeAdopcion(db, paquete, espPrevio);
    var d = objeto(db), p = objeto(paquete);
    var locales = {}, deLaNube = {};
    TABLAS.forEach(function (t) {
      locales[t] = {}; deLaNube[t] = {};
      lista(d[CAMPO_DB[t]]).forEach(function (f) { if (f && f.id != null) locales[t][String(f.id)] = f; });
      lista(p[t]).forEach(function (f) { if (f && f.id != null) deLaNube[t][String(f.id)] = f; });
    });

    /* 1-oct-2026 (segunda vuelta) — LA ENTRADA HEREDADA A LA REVISIÓN DE LA
       NUBE. Hasta el 1-oct, «Mandar lo mío encima» de subir.html movía el
       espejo a la revisión del servidor SIN escribir la cartera. Un espejo así,
       heredado en el computador de Joan, dice «conozco la revisión 5» de una
       ficha a la que le faltan los abonos de la revisión 5: si se le cree, la
       primera subida la manda contra la revisión buena y el servidor la acepta
       sin choque. Desde la cartera no se distingue de una edición honesta
       hecha después de la última ☁ Subir, salvo por una cosa: lo honesto solo
       AGREGA. Así que la entrada se queda solo si la nube no tiene nada que
       la ficha de acá no tenga (ni un abono, ni una gestión, ni un campo, ni
       un valor distinto); entonces subir no pierde nada. Si tiene algo, la
       entrada SALE: sin ella, ☁ Subir enseña las dos versiones en el paso 7
       en vez de contarla como «solo cambié yo» y mandarla igual. Una entrada
       con revisión VIEJA se queda como está: con ella la subida choca, que es
       lo que tiene que pasar. */
    r.heredadas = [];
    r.congelar = r.congelar.filter(function (x) {
      if (x.motivo !== 'difieren' || x.tabla === 'ajustes') return true;
      var e = entrada(r.espejo, x.tabla, x.id), f = deLaNube[x.tabla][x.id], loc = locales[x.tabla][x.id];
      if (!e || !f || !loc || e.borrado || num(e.revision) !== num(f.revision)) return true;
      if (nadaQueSumar(N.sinFotos(loc), f.datos)) { r.heredadas.push({ tabla: x.tabla, id: x.id }); return false; }
      delete r.espejo[x.tabla][x.id];
      return true;
    });

    /* 1-oct-2026 (segunda vuelta) — LOS BORRADOS QUE NO ALCANZARON A SUBIR.
       Joan borra un crédito y, antes de los 90 s, el espejo se suelta
       (importar, traer.html, otra pestaña). Al emparejar, esa fila está en la
       nube y no acá: la regla (f) la deja fuera del espejo, y sin entrada
       borradosExplicitos no la manda nunca. Quedaba viva para siempre en el
       celular, y ☁ Subir la ofrecía «para bajar sin discutir». El renglón de
       db.nubeBorrados dice que Joan la borró, así que se le da entrada para
       que el borrado salga: la del espejo previo si la había (si el celular la
       tocó después, choca), o la de la nube si lo último que la escribió fue
       un computador. Si lo último fue el celular, no se borra a ciegas
       encima de lo que cobró: queda en discusión. */
    var borradasAca = {};
    lista(d.nubeBorrados).forEach(function (b) {
      if (b && TABLAS.indexOf(b.tabla) >= 0 && b.id != null) borradasAca[b.tabla + '|' + String(b.id)] = true;
    });
    r.borrarAlla = [];
    r.soloAlla = r.soloAlla.filter(function (x) {
      if (!borradasAca[x.tabla + '|' + x.id]) return true;
      var ant = entrada(espPrevio, x.tabla, x.id), f = deLaNube[x.tabla][x.id];
      if (ant && !ant.borrado) {
        r.espejo[x.tabla][x.id] = { revision: num(ant.revision),
          json: typeof ant.json === 'string' ? ant.json : N.jsonCanonico(f && f.datos), borrado: false,
          actualizado_en: ant.actualizado_en || null, actualizado_por: ant.actualizado_por || null };
      } else if (f && f.actualizado_por === DISPOSITIVO) {
        r.espejo[x.tabla][x.id] = { revision: num(f.revision), json: N.jsonCanonico(f.datos), borrado: false,
          actualizado_en: f.actualizado_en || null, actualizado_por: f.actualizado_por || null };
      } else {
        r.congelar.push({ tabla: x.tabla, id: x.id, motivo: 'borrada-aca' });
        return false;
      }
      r.borrarAlla.push(x);
      return false;
    });

    var nube = {};
    lista(objeto(paquete).ajustes).forEach(function (a) { if (a && a.clave != null) nube[String(a.clave)] = a; });
    r.ajustesAdoptados = []; r.ajustesCongelados = [];
    CLAVES_QUE_SUBEN.forEach(function (k) {
      var a = nube[k];
      if (!a || objeto(db)[k] === undefined) return;   // sube como nuevo, o no lo pisa
      var suyo = N.jsonCanonico(a.datos);
      if (N.jsonCanonico(N.sinFotos(db[k])) === suyo) {
        r.espejo.ajustes[k] = { revision: num(a.revision), json: suyo, borrado: false,
                                actualizado_en: a.actualizado_en || null, actualizado_por: a.actualizado_por || null };
        r.ajustesAdoptados.push(k);
      } else {
        r.congelar.push({ tabla: 'ajustes', id: k, motivo: 'difieren' });
        r.ajustesCongelados.push(k);
      }
    });
    r.espejo.emparejado_en = iso();
    return r;
  }

  /* ¿La versión de la nube cabe ENTERA en la de acá? Se junta con la MISMA
     regla de subir.html (fusionarFila con las listas que solo suman) y se mira
     si la nube aportó algo: un elemento de lista, un campo que acá no está, o
     un valor distinto en un campo que los dos tienen. Los campos que solo
     tiene la de acá (los que cargar() agrega al abrir) no cuentan: subirlos no
     pisa nada. */
  function nadaQueSumar(mio, suyo) {
    var m = objeto(mio), s = objeto(suyo);
    var fu = N.fusionarFila(m, s, N.LISTAS_QUE_SUMAN);
    var pisa = fu.pisables.some(function (pz) { return Object.prototype.hasOwnProperty.call(s, pz.campo); });
    if (pisa) return false;
    return Object.keys(fu.fila).every(function (k) {
      if (Array.isArray(fu.fila[k])) return fu.fila[k].length === lista(m[k]).length;
      return Object.prototype.hasOwnProperty.call(m, k);
    });
  }

  /* Una congelada se suelta cuando su entrada del espejo cambió: alguien (hoy,
     subir.html) decidió el choque y movió el espejo. Si no se movió, sigue en
     discusión. */
  function soltarResueltas(est, esp) {
    var cambio = false;
    Object.keys(est.congeladas).forEach(function (k) {
      var c = objeto(est.congeladas[k]);
      var e = entrada(esp, c.tabla === 'ajustes' ? 'ajustes' : c.tabla, String(c.id));
      var resuelta = (c.revEspejo == null) ? !!e : (!e || num(e.revision) !== num(c.revEspejo));
      if (resuelta) { delete est.congeladas[k]; delete _congeladasMem[k]; cambio = true; }
    });
    return cambio;
  }

  /* --------------------------------------------------------- textos y horas */
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function hace(cuando, ahoraMs) {
    var t = Date.parse(cuando);
    if (!cuando || isNaN(t)) return '';
    var min = Math.floor((ahoraMs - t) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' min';
    if (min < 24 * 60) return 'hace ' + Math.floor(min / 60) + ' h';
    var d = new Date(t);
    return 'el ' + d.getDate() + '-' + MESES[d.getMonth()];
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function peso(c) {
    return c >= 1048576 ? (c / 1048576).toFixed(1).replace('.', ',') + ' MB'
         : Math.round(c / 1024).toLocaleString('es-CO') + ' KB';
  }

  /**
   * LA CINTA: dos renglones, con el mismo orden de palabras que pintarCinta de
   * espejo.html. Renglón 1, el estado; renglón 2, cuándo y qué hace un clic.
   * Tres tonos: calma (nada pendiente NI congelado), ojo (algo espera) y mal
   * (choques, sello roto, espejo que no cupo).
   *
   * Dice «tu cartera GUARDADA» y no «todo»: un formulario a medio llenar nunca
   * fue un hecho, y config, plantillas, fotos, papelera y contactos no viajan.
   */
  function textoCinta(r) {
    var x = objeto(r), u = objeto(x.ultimo), ya = num(x.ahora) || ahora();
    var pend = x.pendientes, cong = num(x.congeladas), ret = num(x.retenidos);
    var c = function (fase, clase, l1, l2) { return { fase: fase, clase: clase, l1: l1, l2: l2 }; };
    if (x.fase === 'apagado') return c('apagado', 'neutro', '', '');
    if (x.fase === 'sin-conectar') {
      var enlace = '<a href="subir.html" target="_blank" rel="noopener">☁ Subir</a>';
      /* 1-oct-2026 (segunda vuelta) — una sesión vencida o un «Salir» no
         vacían la nube: lo subido sigue allá. Lo que espera es lo nuevo. */
      if (x.subioAntes) {
        return c('sin-conectar', 'ojo', 'Sin conectar a la nube',
          (u.motivo ? esc(u.motivo) + ' · ' : '') +
          (x.ultimaSubida ? 'La nube tiene lo que subiste hasta ' + hace(x.ultimaSubida, ya) : 'La nube tiene lo que ya subiste') +
          '; lo nuevo espera a que entres otra vez en ' + enlace);
      }
      return c('sin-conectar', 'neutro', 'Sin conectar a la nube',
        (u.motivo ? esc(u.motivo) : 'Tu cartera vive solo en este computador') +
        ' · Conéctate una vez en ' + enlace);
    }
    if (x.fase === 'cartera-ilegible') {
      return c('cartera-ilegible', 'mal', 'No subo nada: no pude leer tu cartera guardada',
        'Exporta un respaldo desde Ajustes antes de tocar nada');
    }
    if (x.fase === 'sello-roto') {
      return c('sello-roto', 'mal', 'Otra pestaña escribió tu cartera',
        'O subir.html, traer.html o un respaldo importado. No subo nada hasta que la recargues · clic para recargar');
    }
    if (u.fase === 'espejo-no-cabe') {
      return c('espejo-no-cabe', 'mal', 'No me cupo el espejo de la nube',
        'Tu cartera pesa ' + peso(num(u.cartera)) + ' y el espejo ' + peso(num(u.espejo)) +
        '. Exporta un respaldo y libera espacio · lo ya subido está bien');
    }
    if (x.fase === 'otra-pestana') {
      return c('otra-pestana', 'neutro', 'Sube la otra pestaña del CRM',
        'Esta no sube, para no mezclar versiones · clic para subir desde esta');
    }
    /* 1-oct-2026 (segunda vuelta) — antes esto caía en «Sube la otra pestaña»
       aunque no hubiera otra: el sello no se pudo escribir porque el
       navegador está lleno. Se dice lo que pasó. */
    if (x.fase === 'sello-no-cabe') {
      return c('sello-no-cabe', 'mal', 'No subo: no pude anotar que esta pestaña es la que sube',
        'El navegador está lleno. Exporta un respaldo desde Ajustes y libera espacio · clic para reintentar');
    }
    if (x.fase === 'falta-emparejar') {
      /* «Es una vez» dejó de ser cierto: importar un respaldo o traer.html
         sueltan el espejo, y entonces hay que volver a comparar. */
      return c('falta-emparejar', 'ojo', 'Falta emparejar con la nube',
        'Antes de subir nada comparo tu cartera con lo que hay en la nube · clic para revisar');
    }
    if (u.fase === 'trayendo') return c('trayendo', 'calma', 'Comparando con la nube…', 'un momento');
    if (x.enVuelta || u.fase === 'subiendo') {
      return c('subiendo', 'calma', 'Subiendo' + (u.total ? ' ' + plural(u.total, 'cambio', 'cambios') : '') + '…',
        'unos segundos');
    }
    if (u.fase === 'otra-subiendo') {
      return c('otra-subiendo', 'neutro', 'La otra pestaña del CRM está subiendo', 'pruebo otra vez en unos segundos');
    }
    if (x.enLinea === false) {
      /* 1-oct-2026 (segunda vuelta) — sin señal también se dicen las fichas en
         discusión y los borrados que esperan el sí: lo uno no tapa lo otro. */
      var aparte = (cong ? ' · ' + plural(cong, 'ficha en discusión', 'fichas en discusión') : '') +
        (ret ? ' · ' + plural(ret, 'ficha borrada espera', 'fichas borradas esperan') + ' tu sí' : '');
      return c('sin-senal', cong ? 'mal' : (pend || ret) ? 'ojo' : 'neutro', 'Sin señal — todo queda guardado acá',
        (pend ? plural(pend, 'cambio espera', 'cambios esperan') + ' subir · suben solos cuando vuelva' : 'nada esperando subir') + aparte);
    }
    if (u.fase === 'error') {
      return c('error', 'ojo', 'No pude subir', esc(u.motivo || 'La nube no contestó.') + ' · clic para reintentar');
    }
    if (cong) {
      return c('congeladas', 'mal', plural(cong, 'ficha en discusión', 'fichas en discusión'),
        'No la' + (cong === 1 ? '' : 's') + ' subo hasta que decidas en ☁ Subir · ' +
        (pend ? plural(pend, 'cambio más espera', 'cambios más esperan') + ' subir' : 'lo demás sí sube'));
    }
    if (ret) {
      return c('borrados-esperan', 'ojo', plural(ret, 'ficha borrada espera', 'fichas borradas esperan') + ' tu sí',
        'clic para ver los nombres antes de borrarlos de la nube');
    }
    if (pend == null) return c('revisando', 'calma', 'Revisando…', '');
    if (pend > 0) {
      return c('pendientes', 'ojo', plural(pend, 'cambio esperando', 'cambios esperando') + ' subir',
        'suben solos tras 90 s de calma · clic para subir ya');
    }
    /* 1-oct-2026 (segunda vuelta) — una fila sin id no sube nunca: con ella,
       «tu cartera GUARDADA está en la nube» no es cierto. */
    if (num(x.omitidas)) {
      return c('omitidas', 'ojo', plural(num(x.omitidas), 'fila sin id no sube', 'filas sin id no suben'),
        'Lo demás está en la nube · hay que revisarlas en la ficha');
    }
    var cuando = x.ultimaSubida ? 'subida ' + hace(x.ultimaSubida, ya)
               : (x.ultimaVuelta ? 'revisada ' + hace(x.ultimaVuelta, ya) : '');
    return c('al-dia', 'calma', 'Tu cartera GUARDADA está en la nube',
      (cuando ? cuando + ' · ' : '') + 'clic para sincronizar ahora · v' + esc(x.version || VERSION));
  }

  /* =========================================================================
   * LA PUERTA DEL SELLO
   *
   * crm.html sella cada escritura de la cartera con {v, quien, largo, huella}.
   * Lo que separa una edición legítima de una cartera retrocedida es una sola
   * pregunta: ¿lo que hay en el disco es exactamente lo último que ESTA pestaña
   * escribió o leyó? Si no, esta pestaña no sabe qué tiene, y no manda nada.
   *   ok             el sello es mío y el texto es el mío
   *   sello-roto     el texto NO es el mío: alguien escribió la cartera
   *   otra-pestana   el texto es el mío, pero el sello lo tiene otra pestaña viva
   *   reclamable     el texto es el mío y nadie vivo tiene el sello
   * =======================================================================*/
  var cfg = {};
  function miSello() { try { return cfg.sello ? objeto(cfg.sello()) : null; } catch (e) { return null; } }
  function vivo(d) {
    var x = objeto(d);
    if (typeof x.latido !== 'number') return false;
    var dt = ahora() - x.latido;
    return dt < VIVA_MS && dt > -VIVA_MS;
  }
  function puertaDelSello(txt) {
    var mio = miSello();
    if (!mio || mio.largo == null) return { ok: false, fase: 'sello-roto' };
    var t = texto(txt);
    var coincide = t.length === mio.largo &&
      (mio.huella == null || !cfg.huella || cfg.huella(t) === mio.huella);
    if (!coincide) return { ok: false, fase: 'sello-roto' };
    var disco = leerJSON(LLAVE_SELLO, null);
    /* 1-oct-2026 (segunda vuelta) — basta con que el sello del disco sea de
       ESTA pestaña: el texto ya se comprobó arriba, letra por letra. Con el
       `v` además, un sello que no se pudo reescribir (navegador lleno) dejaba
       el del guardado anterior y la pestaña se negaba a sí misma el turno. */
    if (disco && disco.quien === mio.quien) return { ok: true };
    var dueno = objeto(leerJSON(LLAVE_DUENO, null));
    if (disco && disco.quien && disco.quien !== mio.quien && dueno.id === disco.quien && vivo(dueno)) {
      return { ok: false, fase: 'otra-pestana' };
    }
    return { ok: false, fase: 'reclamable' };
  }
  function pasarPuerta(txt) {
    var p = puertaDelSello(txt);
    if (!p.ok && p.fase === 'reclamable' && cfg.retomarSello) {
      try { cfg.retomarSello(); } catch (e) { /* si no se pudo, se queda como está */ }
      p = puertaDelSello(txt);
      /* El texto es el de esta pestaña y nadie vivo tiene el sello: si aun así
         no quedó, es que el navegador no lo dejó escribir. Antes esto decía
         «sube la otra pestaña» aunque no hubiera ninguna. */
      if (!p.ok && p.fase === 'reclamable') p = { ok: false, fase: 'sello-no-cabe' };
    }
    return p;
  }

  /* UN SOLO DUEÑO. Late solo la pestaña cuyo sello está en el disco. Lo que el
     latido protege es el traspaso: si la pestaña nueva reclama el sello mientras
     la vieja tiene un pedazo en el aire, la nueva espera a que aterrice en vez
     de mandar las mismas filas con la revisión de antes (choques falsos). */
  var _enVuelta = false;
  function latir(enVuelta) {
    var mio = miSello(); if (!mio || !mio.quien) return;
    var disco = leerJSON(LLAVE_SELLO, null);
    if (!disco || disco.quien !== mio.quien) {
      /* 1-oct-2026 (segunda vuelta) — esta pestaña perdió el sello a mitad de
         una subida: si el latido que queda en el disco es suyo y dice «en
         vuelta», la otra pestaña esperaría hasta 150 s a una subida que ya no
         existe. Se suelta. */
      try {
        var d = objeto(leerJSON(LLAVE_DUENO, null)), a = almacen();
        if (a && d.id === mio.quien) a.removeItem(LLAVE_DUENO);
      } catch (e) { /* nada */ }
      return;
    }
    escribirTexto(LLAVE_DUENO, JSON.stringify({ id: mio.quien, latido: ahora(), enVuelta: !!enVuelta }));
  }
  function otraSubiendo() {
    var mio = miSello() || {}, d = objeto(leerJSON(LLAVE_DUENO, null));
    return !!(d.id && d.id !== mio.quien && d.enVuelta && vivo(d));
  }

  /* =========================================================================
   * EL ESTADO DE ESTE MOMENTO (sin red)
   * =======================================================================*/
  var _apagado = false, _configurado = false;
  var _ultimo = null;    // lo que pasó en la última vuelta: {fase, motivo, ...}
  var _diag = null;

  function diagnostico() {
    if (_apagado) return { fase: 'apagado' };
    if (!conectado()) return { fase: 'sin-conectar' };
    var c = leerCarteraDelDisco();
    if (!c.db) return { fase: 'cartera-ilegible', motivo: c.error };
    var p = pasarPuerta(c.txt);
    if (!p.ok) return { fase: p.fase, cartera: c };
    var esp = leerEspejo();
    var est = leerEstado();
    /* 1-oct-2026 (segunda vuelta) — un espejo con filas NO basta: el que dejó
       subir.html antes del 1-oct pudo quedar por delante de la cartera
       («Mandar lo mío encima» movía el espejo sin escribirla). Este CRM
       empareja UNA vez por computador, y emparejar le pasa ese espejo a
       calcularEmparejo, que decide entrada por entrada si se le puede creer. */
    if (!espejoSembrado(esp) || !est.emparejadoEn) return { fase: 'falta-emparejar', cartera: c, espejo: esp };
    if (soltarResueltas(est, esp)) guardarEstado(est);
    var plan = planDeSubida(c.db, esp, congeladasDe(est), est.borradosConfirmados);
    return { fase: 'lista', cartera: c, espejo: esp, est: est, plan: plan };
  }

  function resumen() {
    var d = objeto(_diag), plan = d.plan || null, est = leerEstado();
    return {
      fase: _apagado ? 'apagado' : (d.fase || 'revisando'), ultimo: _ultimo, enVuelta: _enVuelta, enLinea: enLinea(),
      pendientes: plan ? N.tamanoLote(plan.lote) : null,
      /* En FICHAS, como el freno: un cliente con sus cinco créditos es uno. */
      retenidos: (plan && plan.retenidos.length) ? plan.freno.fichas : 0,
      congeladas: Object.keys(congeladasDe(est)).length,
      repetidos: plan ? plan.repetidos : [],
      omitidas: plan ? plan.omitidas.length : 0,
      /* Sin sesión, la nube igual puede tener todo lo de antes: decir «vive
         solo en este computador» sería mentir hacia el lado del susto. */
      subioAntes: d.fase === 'sin-conectar' ? (!!est.ultimaSubida || espejoSembrado(leerEspejo())) : false,
      ultimaSubida: est.ultimaSubida, ultimaVuelta: est.ultimaVuelta,
      version: VERSION, ahora: ahora()
    };
  }
  function estado() {
    var r = resumen();
    r.cinta = textoCinta(r);
    return r;
  }

  /* =========================================================================
   * LA VUELTA — la subida, en el orden exacto del paso 8 de la receta
   * =======================================================================*/
  var _reintento = null;
  function vuelta(porOrdenDeJoan) {
    if (_apagado || !_configurado || _enVuelta) return Promise.resolve(estado());
    if (!enLinea()) { _ultimo = null; _diag = diagnostico(); pintar(true); return Promise.resolve(estado()); }

    /* (a) las puertas: sesión, cartera legible, sello, espejo sembrado */
    var d = diagnostico();
    _diag = d;
    /* El motivo de «sin conectar» (la sesión venció) se conserva: es lo único
       que le dice a Joan por qué, y la vuelta siguiente no lo sabría. */
    if (d.fase !== 'lista') {
      if (_ultimo && _ultimo.fase !== 'espejo-no-cabe' && !(_ultimo.fase === 'sin-conectar' && d.fase === 'sin-conectar')) _ultimo = null;
      pintar(true); return Promise.resolve(estado());
    }
    /* ...y el turno: si la otra pestaña tiene un pedazo en el aire, se espera
       a que aterrice. UN reintento, no un bucle. */
    if (otraSubiendo()) {
      _ultimo = { fase: 'otra-subiendo' };
      if (_reintento == null) _reintento = programar(function () { _reintento = null; vuelta(false); }, 20000);
      pintar(true);
      return Promise.resolve(estado());
    }

    _enVuelta = true;
    latir(true);
    /* (b), (c), (d), (e) y (f) ya están en d.plan, sacados del disco hace un
       instante; (g) los pedazos de 50. */
    var plan = d.plan;
    var pedazos = N.partirLote(plan.lote, POR_PEDAZO);
    var total = N.tamanoLote(plan.lote);
    var resultado = { aplicados: 0, choques: 0, pedazos: pedazos.length, enviados: 0, completa: false };
    _ultimo = total ? { fase: 'subiendo', total: total } : null;
    pintar(false);

    var cadena = Promise.resolve(true);
    pedazos.forEach(function (pedazo) {
      cadena = cadena.then(function (seguir) {
        if (!seguir) return false;
        /* Antes de cada pedazo: ¿la cartera sigue siendo de esta pestaña? Si
           otra la escribió mientras subía, lo que queda no se manda. */
        var c = leerCarteraDelDisco();
        var p = c.db ? puertaDelSello(c.txt) : { ok: false, fase: 'cartera-ilegible' };
        if (!p.ok) { _diag = { fase: p.fase === 'reclamable' ? 'otra-pestana' : p.fase }; _ultimo = null; return false; }
        latir(true);
        return red.empujar(DISPOSITIVO, pedazo).then(function (resp) {
          var r = objeto(resp);
          /* Lo que entró, entró, pase lo que pase abajo: la cinta y el celular
             lo pueden decir. */
          if (num(r.aplicados) > 0) { var e3 = leerEstado(); e3.ultimaSubida = iso(); guardarEstado(e3); }
          /* 1-oct-2026 (segunda vuelta) — EL CHOQUE CONMIGO MISMO. Si la
             respuesta de la vuelta anterior se perdió en el camino, o el espejo
             no cupo después de que el pedazo entró, esta vuelta manda las
             mismas filas con la revisión de antes y el servidor contesta
             choque... contra lo que este computador escribió. Se reconoce por
             tres cosas juntas: lo de allá es letra por letra lo que mando, lo
             escribió un computador, y está exactamente una revisión por
             delante de la que mando. Eso no es una discusión: se anota en el
             espejo y no se congela. Antes salía «1 ficha en discusión» y ☁ Subir
             enseñaba dos lados idénticos. */
          var mandadas = {};
          TABLAS.forEach(function (t) { lista(pedazo[t]).forEach(function (f) { mandadas[t + '|' + f.id] = f; }); });
          lista(pedazo.ajustes).forEach(function (a) { mandadas['ajustes|' + a.clave] = a; });
          var yaEstaban = [];
          var choques = N.choquesDe(pedazo, r, DISPOSITIVO).filter(function (ch) {
            var f = mandadas[ch.tabla + '|' + ch.id];
            if (f && !f.borrado && ch.actualizado_por === DISPOSITIVO &&
                num(ch.revision_servidor) === num(f.revision_base) + 1 &&
                N.jsonCanonico(ch.suyo) === N.jsonCanonico(f.datos)) { yaEstaban.push({ ch: ch, f: f }); return false; }
            return true;
          });
          /* (h.1) las dos versiones de cada choque, a disco ANTES de pintar nada */
          if (choques.length) { try { agregarChoques(choques); } catch (e) { /* las congeladas igual frenan */ } }
          var espAntes = leerEspejo();
          /* 1-oct-2026 (segunda vuelta) — ¿LA CARTERA SIGUE SIENDO LA DE ANTES
             DEL VIAJE? Mientras el pedazo iba y volvía, otra pestaña, traer.html
             o importar() pudieron reemplazar la cartera y soltar el espejo. Si
             acá se escribiera el espejo igual, renacería con estas filas
             afirmando lo que ya no es la cartera, y la vuelta siguiente mandaría
             la cartera reemplazada CONTRA LA REVISIÓN BUENA: el cobro que acaba
             de subir moriría sin choque. Lo que subió está bien subido; lo que
             no se hace es anotarlo encima de una cartera que ya no es esta.
             Toca recargar o emparejar, y emparejar congela lo que difiere. */
          var cAhora = leerCarteraDelDisco();
          if (!espejoSembrado(espAntes) || !cAhora.db || !puertaDelSello(cAhora.txt).ok) {
            _ultimo = null;
            return false;
          }
          /* (h.2) congelar lo que chocó: no vuelve a salir en el lote */
          if (choques.length) {
            var est = leerEstado();
            choques.forEach(function (ch) {
              var e = entrada(espAntes, ch.tabla, ch.id);
              est.congeladas[ch.tabla + '|' + ch.id] = { tabla: ch.tabla, id: ch.id, motivo: 'choque',
                desde: iso(), revEspejo: e ? num(e.revision) : null };
            });
            guardarEstado(est);
          }
          /* (h.3) el espejo, RELEÍDO del disco, avanza solo con lo confirmado.
             Si no cabe, se para y se dice: lo que ya entró, entró. */
          var nuevo = N.espejoTrasEmpujar(espAntes, pedazo, r);
          yaEstaban.forEach(function (x) {
            if (!nuevo[x.ch.tabla]) return;
            nuevo[x.ch.tabla][x.ch.id] = { revision: num(x.ch.revision_servidor), json: N.jsonCanonico(x.f.datos),
              borrado: false, actualizado_en: x.ch.actualizado_en || null, actualizado_por: x.ch.actualizado_por || null };
          });
          if (!escribirEspejo(nuevo)) {
            var largoEsp = 0; try { largoEsp = JSON.stringify(nuevo).length; } catch (e2) { largoEsp = 0; }
            _ultimo = { fase: 'espejo-no-cabe', cartera: c.txt.length, espejo: largoEsp, cuando: iso() };
            return false;
          }
          resultado.aplicados += num(r.aplicados);
          resultado.choques += choques.length;
          resultado.enviados++;
          return true;
        });
      });
    });

    return cadena.then(function (todoBien) {
      resultado.completa = !!todoBien;
      if (!todoBien) return;
      /* (9) los contadores, tras una subida sin fallos: el celular no puede
         emitir el CL-0049 si el computador ya lo dio. El SQL usa greatest:
         nunca baja. Un fallo acá no es grave y no se grita: vuelve a probarse. */
      var db = d.cartera.db, est = leerEstado(), conocidos = est.contadoresConocidos;
      var cadenaC = Promise.resolve();
      ['cliente', 'credito', 'respaldado'].forEach(function (k) {
        var v = num(db.contadores && db.contadores[k]);
        if (v <= num(conocidos[k])) return;
        cadenaC = cadenaC.then(function () {
          return red.sembrarContador(k, v).then(function (s) { conocidos[k] = Math.max(v, num(s)); }, function () {});
        });
      });
      return cadenaC.then(function () {
        var e = leerEstado();
        e.contadoresConocidos = conocidos;
        e.ultimaVuelta = iso();
        /* Los confirmados que ya quedaron borrados en el espejo no hacen falta. */
        var esp = leerEspejo();
        Object.keys(e.borradosConfirmados).forEach(function (k) {
          var i = k.indexOf('|'), en = entrada(esp, k.slice(0, i), k.slice(i + 1));
          if (!en || en.borrado) delete e.borradosConfirmados[k];
        });
        guardarEstado(e);
        if (_ultimo && _ultimo.fase === 'subiendo') _ultimo = null;
      });
    }).then(null, function (e) {
      var m = (e && e.motivo) || (e && e.message) || 'No pude hablar con la nube.';
      if (e && e.sin_red) {
        _ultimo = null;                                         // la cinta dice «sin señal» sola
        /* 1-oct-2026 (segunda vuelta) — un wifi que falla con el navegador
           creyéndose en línea no dispara `online`: sin este reloj, la cinta
           decía «suben solos tras 90 s» y nada volvía a intentarlo. */
        if (_quietud == null && !_apagado) _quietud = programar(function () { _quietud = null; vuelta(false); }, QUIETUD_MS);
      }
      else if (!conectado()) _ultimo = { fase: 'sin-conectar', motivo: m };
      else _ultimo = { fase: 'error', motivo: m, cuando: iso() };
      if (porOrdenDeJoan && !(e && e.sin_red)) { /* lo dice la cinta, no un alert */ }
    }).then(function () {
      _enVuelta = false;
      latir(false);
      _diag = diagnostico();
      if (_ultimo && _ultimo.fase === 'sin-conectar') _diag = { fase: 'sin-conectar' };
      pintar(false);
      var r = estado();
      r.resultado = resultado;
      return r;
    });
  }

  /* =========================================================================
   * EMPAREJAR — la siembra, con el «sí» de Joan
   * =======================================================================*/
  var _paquete = null;
  function emparejar() {
    if (_apagado || !_configurado || _enVuelta) return Promise.resolve(estado());
    var d = diagnostico();
    _diag = d;
    if (d.fase !== 'falta-emparejar') { pintar(true); return Promise.resolve(estado()); }
    _ultimo = { fase: 'trayendo' };
    pintar(false);
    return red.traer(null).then(function (paquete) {
      _paquete = paquete;
      _ultimo = null;
      var r = calcularEmparejo(leerCarteraDelDisco().db, paquete, leerEspejo());
      mostrarEmparejo(r);
      pintar(true);
      return r;
    }, function (e) {
      _ultimo = { fase: 'error', motivo: (e && e.motivo) || 'No pude traer lo que hay en la nube.' };
      pintar(true);
      return estado();
    });
  }

  function confirmarEmparejar() {
    if (!_paquete || _enVuelta) return Promise.resolve(estado());
    var c = leerCarteraDelDisco();
    var p = c.db ? pasarPuerta(c.txt) : { ok: false };
    cerrarModal();
    if (!p.ok) { _paquete = null; _diag = diagnostico(); pintar(true); return Promise.resolve(estado()); }
    /* Se recalcula contra la cartera de ESTE instante: la adopción solo puede
       afirmar lo que es cierto ahora, no lo que lo era cuando se pintó. */
    var r = calcularEmparejo(c.db, _paquete, leerEspejo());
    _paquete = null;
    var est = leerEstado();
    r.congelar.forEach(function (x) {
      var e = entrada(r.espejo, x.tabla, x.id);
      est.congeladas[x.tabla + '|' + x.id] = { tabla: x.tabla, id: x.id, motivo: x.motivo,
        desde: iso(), revEspejo: e ? num(e.revision) : null };
    });
    /* Primero las congeladas, después el espejo: si el espejo no cabe, sobran
       unas congeladas (cuesta nada); al revés, sobraría un espejo que afirma
       filas en discusión (cuesta un cobro). */
    guardarEstado(est);
    if (!escribirEspejo(r.espejo)) {
      var largoEsp = 0; try { largoEsp = JSON.stringify(r.espejo).length; } catch (e2) { largoEsp = 0; }
      _ultimo = { fase: 'espejo-no-cabe', cartera: c.txt.length, espejo: largoEsp, cuando: iso() };
      _diag = diagnostico();
      pintar(false);
      return Promise.resolve(estado());
    }
    /* Y SOLO con el espejo escrito, «este computador ya emparejó»: es la marca
       que diagnostico() pide además de las filas (ver la entrada heredada). */
    var est2 = leerEstado();
    est2.emparejadoEn = iso();
    guardarEstado(est2);
    _ultimo = null;
    return vuelta(true);
  }

  /* =========================================================================
   * LO QUE SE VE
   * =======================================================================*/
  var ESTILO = '' +
    /* width y no flex-basis: en el teléfono la barra lateral pasa a fila que se
       envuelve, y ahí la cinta tiene que ocupar su propio renglón entero. */
    '.nube-cinta{margin-top:6px;width:100%;box-sizing:border-box;font-size:11px;border-radius:10px;padding:9px 10px;line-height:1.4;position:relative;z-index:2;cursor:pointer;' +
    'background:rgba(var(--papel-rgb),.08);color:rgba(var(--blanco-laca-rgb),.74);border-left:3px solid rgba(var(--blanco-laca-rgb),.35)}' +
    '.nube-cinta b{display:block;font-size:11.5px;margin-bottom:2px;color:var(--blanco-laca)}' +
    '.nube-cinta a{color:var(--amarillo);font-weight:700}' +
    '.nube-cinta.calma{border-left-color:rgba(var(--amarillo-rgb),.85)}' +
    '.nube-cinta.ojo{background:rgba(var(--amarillo-rgb),.13);color:var(--amarillo);border-left-color:var(--amarillo)}' +
    '.nube-cinta.ojo b{color:var(--amarillo)}' +
    '.nube-cinta.mal{background:color-mix(in srgb,var(--rojo-laca) 16%,transparent);border-left-color:var(--rojo-laca)}' +
    '.nube-cinta .rep{display:block;margin-top:4px;color:var(--amarillo)}' +
    '.nube-cinta:focus-visible{outline:2px solid var(--rojo-laca);outline-offset:2px}' +
    '.nube-barra{cursor:pointer}.nube-barra.mal{border-left:4px solid var(--rojo)}' +
    '.nube-barra .l2{margin-top:2px}.nube-barra .l3{margin-top:8px;font-size:12px;opacity:.85}' +
    '.nube-pila{margin:10px 0 0}.nube-pila h4{margin:0 0 4px;font-size:13px}' +
    '.nube-pila ul{margin:0;padding-left:18px;font-size:13px}';

  function ponerEstilo() {
    var doc = documento();
    try {
      if (!doc || !doc.head || !doc.createElement || doc.getElementById('nubeCrmEstilo')) return;
      var s = doc.createElement('style');
      s.id = 'nubeCrmEstilo';
      s.textContent = ESTILO;
      doc.head.appendChild(s);
    } catch (e) { /* sin estilo se lee igual */ }
  }

  /* Se inyecta sola en la barra lateral, debajo del horario: abajo, como la
     cinta del celular. Si la barra no está (un DOM a medias), no pasa nada:
     la de Ajustes sigue diciendo lo mismo. */
  function asegurarCinta() {
    var doc = documento();
    try {
      if (!doc || !doc.getElementById) return null;
      var c = doc.getElementById('nubeCinta');
      if (c && c.parentNode) return c;
      var h = doc.getElementById('horarioBox');
      if (!h || !h.parentNode || !doc.createElement) return null;
      c = doc.createElement('div');
      c.id = 'nubeCinta';
      c.className = 'nube-cinta';
      if (c.setAttribute) { c.setAttribute('role', 'button'); c.setAttribute('tabindex', '0'); c.setAttribute('aria-live', 'polite'); }
      c.onclick = function (ev) { if (ev && ev.target && ev.target.tagName === 'A') return; accion(); };
      c.onkeydown = function (ev) {
        if (ev && (ev.key === 'Enter' || ev.key === ' ')) { if (ev.preventDefault) ev.preventDefault(); accion(); }
      };
      if (h.nextSibling) h.parentNode.insertBefore(c, h.nextSibling); else h.parentNode.appendChild(c);
      return c;
    } catch (e) { return null; }
  }

  function lineaRepetidos(rep) {
    if (!rep || !rep.length) return '';
    var r = rep[0];
    return 'Número repetido: ' + esc(r.codigo || r.numero) + ' (' + esc(r.nombres.join(' y ')) + ')' +
      (rep.length > 1 ? ' y ' + (rep.length - 1) + ' más' : '') + '. No se pierde nada; corrígelo en una de las fichas.';
  }

  function pintar(recalcular) {
    if (!_configurado) return;
    if (recalcular && !_enVuelta) _diag = diagnostico();
    var r = resumen(), t = textoCinta(r);
    var rep = lineaRepetidos(r.repetidos);
    var cinta = asegurarCinta();
    try {
      if (cinta) {
        if (t.fase === 'apagado') { cinta.innerHTML = ''; cinta.className = 'nube-cinta'; }
        else {
          cinta.className = 'nube-cinta ' + t.clase;
          cinta.innerHTML = '<b>☁ ' + t.l1 + '</b>' + t.l2 + (rep ? '<span class="rep">' + rep + '</span>' : '');
        }
      }
    } catch (e) { /* la barra de Ajustes sigue */ }
    var barra = cfg.barra;
    try {
      if (barra) {
        if (t.fase === 'apagado') { barra.innerHTML = ''; return; }
        var tono = t.clase === 'mal' ? 'warn nube-barra mal' : t.clase === 'ojo' ? 'warn nube-barra' : t.clase === 'calma' ? 'ok nube-barra' : 'info nube-barra';
        barra.innerHTML = '<div class="alerta ' + tono + '" role="button" tabindex="0" onclick="if(event.target.tagName!==\'A\')NubeCRM.accion()">' +
          '<b>☁ ' + t.l1 + '</b><div class="l2">' + t.l2 + '</div>' +
          (rep ? '<div class="l2">' + rep + '</div>' : '') +
          (r.omitidas ? '<div class="l2">' + plural(r.omitidas, 'fila sin id no sube', 'filas sin id no suben') + ': hay que revisarlas.</div>' : '') +
          '<div class="l3">Sube sola: al entrar, tras 90 s sin cambios, al volver la señal y cuando tocas acá. ' +
          /* 1-oct-2026 (segunda vuelta) — decía «con ⬇ Traer o ☁ Subir». Traer
             NO junta: arma la cartera desde cero con lo de la nube, y en ESTE
             computador se llevaría las fotos, la papelera, la configuración y
             el lado de acá de cada ficha en discusión. Traer es para OTRO
             computador (Ajustes, punto 3). Lo que junta es ☁ Subir, paso 6. */
          '<b>Todavía no baja nada</b>: lo que hagas en el celular llega a este computador con ☁ Subir (paso 6, «Aplicar»), ' +
          'que lo junta con lo tuyo. ⬇ Traer es para OTRO computador: aquí reemplazaría tu cartera entera. ' +
          'No viajan las fotos (la selfie es dato biométrico, Ley 1581), la papelera, la configuración (tasa, PIN), ' +
          'las plantillas ni el registro de WhatsApp del equipo (contactos). Las gestiones de cada cliente, que son ' +
          'las que cuenta la Ley 2300, sí suben. · versión ' + esc(VERSION) + '</div></div>';
      }
    } catch (e) { /* nada más que hacer */ }
  }
  var _pintarPronto = null;
  function pintarPronto() {
    if (_pintarPronto != null) return;
    _pintarPronto = programar(function () { _pintarPronto = null; pintar(true); }, 400);
  }

  function nombreFilaEmparejo(db, paquete, t, id) {
    if (t === 'ajustes') return nombreDe('ajustes', { __clave: id });
    var f = null;
    lista(objeto(db)[CAMPO_DB[t]]).some(function (x) { if (x && String(x.id) === id) { f = x; return true; } return false; });
    if (!f) lista(objeto(paquete)[t]).some(function (x) { if (x && String(x.id) === id) { f = x.datos; return true; } return false; });
    return nombreDe(t, f);
  }
  function pila(titulo, explicacion, items, db, paquete, tope) {
    if (!items.length) return '';
    var max = tope || 15;
    var lis = items.slice(0, max).map(function (x) { return '<li>' + esc(nombreFilaEmparejo(db, paquete, x.tabla, x.id)) + '</li>'; }).join('');
    return '<div class="nube-pila"><h4>' + esc(titulo) + ' · ' + items.length + '</h4><div class="help">' + esc(explicacion) + '</div><ul>' +
      lis + (items.length > max ? '<li>y ' + (items.length - max) + ' más</li>' : '') + '</ul></div>';
  }
  /* Los CINCO montones, con nombres y números de cliente, no solo cifras.
     1-oct-2026 (segunda vuelta): y tres más, que salen de la entrada heredada
     y de los borrados que no alcanzaron a subir (ver calcularEmparejo). */
  function mostrarEmparejo(r) {
    var db = leerCarteraDelDisco().db, paq = _paquete;
    var difieren = r.congelar.filter(function (x) { return x.motivo === 'difieren'; });
    var borradas = r.congelar.filter(function (x) { return x.motivo === 'borrada-en-la-nube'; });
    var borradasAca = r.congelar.filter(function (x) { return x.motivo === 'borrada-aca'; });
    var adopt = r.adoptadas.concat(r.ajustesAdoptados.map(function (k) { return { tabla: 'ajustes', id: k }; }));
    var h = '<div class="help" style="margin-bottom:8px">Antes de subir nada, comparo tu cartera con lo que ya hay en la nube. ' +
      'Esto no cambia ni una ficha de este computador: solo decide desde dónde sube cada una.</div>' +
      pila('Iguales en los dos lados', 'Quedan emparejadas y suben con lo que cambies de aquí en adelante.', adopt, db, paq, 8) +
      pila('Con algo nuevo acá', 'Lo de la nube ya está entero en tu ficha; suben con lo que agregaste.', lista(r.heredadas), db, paq) +
      pila('Solo acá', 'Suben como nuevas.', r.soloAca, db, paq) +
      pila('Solo en la nube', 'No se tocan: bajarán a este computador cuando el CRM baje (todavía no baja). Mientras, se juntan con lo tuyo en ☁ Subir, paso 6.', r.soloAlla, db, paq) +
      pila('Borradas acá y vivas en la nube', 'Las borraste en este computador: se borran también en la nube (si son más de 3 fichas, antes te pido el sí con los nombres).', lista(r.borrarAlla), db, paq) +
      pila('Distintas', 'No las subo: se quedan en discusión hasta que decidas en ☁ Subir. Nada se pisa.', difieren, db, paq) +
      pila('Borradas en la nube y vivas acá', 'No las subo ni las borro: se quedan en discusión hasta que decidas.', borradas, db, paq) +
      pila('Borradas acá, pero el celular las cambió', 'No las borro de la nube encima de lo que hizo el celular: en ☁ Subir aparecen para bajar. Tráelas y, si de verdad sobran, bórralas otra vez.', borradasAca, db, paq) +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn btn-rojo" onclick="NubeCRM.confirmarEmparejar()">Sí, emparejar y subir</button>' +
      '<button class="btn btn-ghost" onclick="NubeCRM.cancelarEmparejar()">Ahora no</button></div>';
    var w = ventana();
    if (w && typeof w.openModal === 'function') { try { w.openModal('Emparejar este computador con la nube', h); return; } catch (e) { /* sigue abajo */ } }
    if (cfg.barra) { try { cfg.barra.innerHTML = '<div class="alerta info">' + h + '</div>'; } catch (e) { /* nada */ } }
  }
  function cerrarModal() {
    var w = ventana();
    try { if (w && typeof w.cerrarModal === 'function') w.cerrarModal(); } catch (e) { /* nada */ }
  }
  function cancelarEmparejar() { _paquete = null; cerrarModal(); pintar(true); }

  /* El freno pide el «sí» con los nombres delante. */
  function confirmarBorrados() {
    var d = diagnostico();
    _diag = d;
    if (d.fase !== 'lista' || !d.plan.retenidos.length) { pintar(false); return Promise.resolve(estado()); }
    var frases = frasesDeBorrado(d.plan.retenidos);
    var w = ventana();
    var si = false;
    try {
      si = !!(w && w.confirm && w.confirm('Voy a borrar de la nube:\n\n• ' + frases.join('\n• ') +
        /* «ya están en la papelera» no era cierto después de borrarlos para
           siempre o vaciar la papelera: el renglón de nubeBorrados queda. */
        '\n\nEn este computador ya los borraste. Si no reconoces alguno, toca Cancelar: no se borra nada ' +
        'y lo demás sigue subiendo.\n\n¿Los borro también de la nube?'));
    } catch (e) { si = false; }
    if (!si) { pintar(false); return Promise.resolve(estado()); }
    var est = leerEstado();
    d.plan.retenidos.forEach(function (b) { est.borradosConfirmados[b.tabla + '|' + b.fila.id] = iso(); });
    guardarEstado(est);
    return vuelta(true);
  }

  /* El clic en la cinta hace lo que la cinta dice que hace. */
  function accion() {
    if (_apagado || !_configurado) return Promise.resolve(estado());
    /* Se mira el disco OTRA VEZ antes de decidir: lo pintado pudo quedar viejo
       si otra página escribió y el aviso de `storage` no llegó. */
    if (!_enVuelta) _diag = diagnostico();
    /* El clic ES el reintento: lo que falló la vez pasada deja de taparle a la
       cinta lo que hay que hacer ahora (por ejemplo, volver a emparejar). */
    if (_ultimo && (_ultimo.fase === 'error' || _ultimo.fase === 'espejo-no-cabe')) _ultimo = null;
    var f = textoCinta(resumen()).fase;
    if (f === 'sin-conectar') { pintar(true); return Promise.resolve(estado()); }
    if (f === 'sello-roto') {
      try { if (cfg.recargar) cfg.recargar(); } catch (e) { /* la puerta lo vuelve a mirar */ }
      return vuelta(true);
    }
    if (f === 'otra-pestana') {
      /* «su botón pide el turno»: se reclama el sello SOLO si el texto del disco
         es el de esta pestaña; si no, la puerta lo verá. */
      try { if (cfg.retomarSello) cfg.retomarSello(); } catch (e) { /* idem */ }
      return vuelta(true);
    }
    if (f === 'falta-emparejar') return emparejar();
    if (f === 'borrados-esperan') return confirmarBorrados();
    return vuelta(true);
  }

  /* =========================================================================
   * CUÁNDO: (a) al entrar, una vez, después del PIN; (b) 90 s de quietud tras
   * el último algoCambio() — una operación larga llama a guardar() varias veces
   * y el reloj se reinicia, así que sube cuando la operación TERMINÓ; (c) al
   * volver la señal; (d) el clic, siempre.
   *
   * NO en visibilitychange→hidden: «oculta» no distingue «cambié de pestaña» de
   * «cerré el portátil», y una vuelta abierta ahí deja el servidor escrito y el
   * espejo sin anotar — una pila de choques falsos mañana, que es como se
   * aprende a ignorar el aviso rojo.
   * =======================================================================*/
  var _quietud = null, _primera = null, _latido = null, _reloj = null;
  function algoCambio() {
    if (_apagado || !_configurado) return;
    desprogramar(_quietud);
    _quietud = programar(function () { _quietud = null; vuelta(false); }, QUIETUD_MS);
    pintarPronto();
  }

  function escuchar() {
    var w = ventana();
    if (!w || typeof w.addEventListener !== 'function') return;
    w.addEventListener('online', function () { vuelta(false); });
    w.addEventListener('offline', function () { pintar(false); });
    /* Lo que otra pestaña escribe llega por `storage`. Solo se repinta: la
       puerta decide en cada vuelta. La sesión es la excepción: si Joan acaba
       de entrar en subir.html, esta pestaña prueba UNA vez sin que se lo pida. */
    w.addEventListener('storage', function (ev) {
      if (!ev || _apagado) return;
      if (ev.key === LLAVE_SESION && ev.newValue) { programar(function () { vuelta(false); }, 3000); return; }
      if (ev.key === LLAVE_SELLO || ev.key === LLAVE_ESPEJO || ev.key === LLAVE_CARTERA ||
          ev.key === LLAVE_ESTADO || ev.key === LLAVE_SESION) pintarPronto();
    });
    /* Soltar el latido al cerrar no es sincronizar: solo evita que la otra
       pestaña espere dos minutos a una que ya no existe. */
    w.addEventListener('pagehide', function () {
      try {
        var mio = miSello() || {}, d = objeto(leerJSON(LLAVE_DUENO, null));
        var a = almacen();
        if (a && d.id && d.id === mio.quien) a.removeItem(LLAVE_DUENO);
      } catch (e) { /* nada */ }
    });
  }

  /**
   * crm.html llama esto DENTRO de entrar(), después de render(), y nunca en
   * modo equipo. Recibe:
   *   barra        el div #nubeBarra de Ajustes
   *   ocupado      estoyOcupado(). En esta etapa NO frena la subida (lo que
   *                viaja ya está en disco); queda puesto para la Etapa 2.
   *   sello        () => lo último que esta pestaña selló {v, quien, largo, huella}
   *   huella       la MISMA función con la que crm.html sella
   *   retomarSello sella la cartera del disco como de esta pestaña, solo si el
   *                texto es el que esta pestaña conoce
   *   recargar     DB=cargar(); sello; if(_fechasMigradas) guardar(); render();
   */
  function configurar(c) {
    if (_apagado) return api;
    cfg = objeto(c);
    if (_configurado) { pintar(true); return api; }
    _configurado = true;
    /* Pasó el PIN: esta pestaña reclama el turno, si su cartera es la del disco. */
    try { if (cfg.retomarSello) cfg.retomarSello(); } catch (e) { /* la puerta lo verá */ }
    ponerEstilo();
    escuchar();
    _latido = cadaRato(function () { if (!_apagado) latir(_enVuelta); }, LATIDO_MS);
    _reloj = cadaRato(function () { if (!_apagado && !_enVuelta) pintar(true); }, 30000);
    latir(false);
    pintar(true);
    _primera = programar(function () { _primera = null; vuelta(false); }, 2000);
    return api;
  }

  /* modoEquipo() apaga esto con una línea suya. No es una lectura de
     CARTERA_EQUIPO hecha una vez al arrancar —eso vale null siempre en ese
     instante—: es un interruptor que se queda apagado. */
  function apagar() {
    _apagado = true;
    [_quietud, _primera, _reintento, _pintarPronto].forEach(desprogramar);
    _quietud = _primera = _reintento = _pintarPronto = null;
    try { if (_latido != null) clearInterval(_latido); if (_reloj != null) clearInterval(_reloj); } catch (e) { /* nada */ }
    try { var c = documento() && documento().getElementById('nubeCinta'); if (c && c.parentNode) c.parentNode.removeChild(c); } catch (e) { /* nada */ }
    try { if (cfg.barra) cfg.barra.innerHTML = ''; } catch (e) { /* nada */ }
  }

  var api = {
    VERSION: VERSION,
    configurar: configurar,
    algoCambio: algoCambio,
    emparejar: emparejar,
    confirmarEmparejar: confirmarEmparejar,
    cancelarEmparejar: cancelarEmparejar,
    vuelta: vuelta,
    estado: estado,
    accion: accion,
    apagar: apagar,
    /* Las piezas puras, para pruebas/nube-crm.test.js. No las llama crm.html. */
    _puro: {
      CLAVES_QUE_SUBEN: CLAVES_QUE_SUBEN, LLAVE_ESPEJO: LLAVE_ESPEJO, LLAVE_SELLO: LLAVE_SELLO,
      LLAVE_ESTADO: LLAVE_ESTADO, LLAVE_DUENO: LLAVE_DUENO,
      planDeSubida: planDeSubida, borradosExplicitos: borradosExplicitos, frenoPorFichas: frenoPorFichas,
      frasesDeBorrado: frasesDeBorrado, numerosRepetidos: numerosRepetidos, calcularEmparejo: calcularEmparejo,
      textoCinta: textoCinta, hace: hace, leerCarteraDelDisco: leerCarteraDelDisco, escribirTexto: escribirTexto
    }
  };
  return api;
});
