/* ===========================================================================
 * MAPA-LUGARES — de la ciudad que escribió el cliente, su municipio.
 * 9 de noviembre de 2026.
 *
 * Joan pidió ver en el CRM dónde están sus clientes (la pestaña «🗺️ Mapa»,
 * panel/mapa-clientes.js). Lo único que hay para eso es el campo «Ciudad» de
 * la ficha: texto libre que viene del registro (app/cuenta.js, el campo
 * `ciudad`, obligatorio) o que Joan tecleó a mano. Llega de todas las formas:
 * «Bogota», «Bogotá D.C.», «bogota dc», «Soacha Cundinamarca», «Kennedy»,
 * «Cúcuta» (que en la tabla del DANE es «San José de Cúcuta»).
 *
 * LO QUE ESTE ARCHIVO SE NIEGA A HACER, por decisión de Joan del 9-nov:
 *   · NUNCA usa el GPS del registro (s.ubicacion) ni ninguna coordenada del
 *     cliente, ni la ciudad que adivina la IP. El mapa es de ZONAS: lo más
 *     fino que se sabe de una persona es su municipio, y eso sale de lo que
 *     ella misma escribió. Ni siquiera recibe esos campos: lugarDeCliente lee
 *     solo `ciudad` y `departamento` (pruebas/mapa-clientes.test.js lo vigila).
 *   · NO ADIVINA. Si el nombre existe en varios departamentos («Mosquera»
 *     está en Cundinamarca y en Nariño; «Armenia», en Quindío y en Antioquia)
 *     y nadie dijo cuál, queda «Sin ubicar (nombre repetido)». Ponerlo en el
 *     más grande sería pintar en el mapa un cliente donde a lo mejor no está,
 *     y la pestaña dice que se corrige en la ficha: «Mosquera, Cundinamarca».
 *
 * 14-nov-2026 — BOGOTÁ POR DENTRO: de «Ciudad» y «Barrio», la localidad
 * (localidadDeCliente, más abajo, con sus propias reglas de no adivinar).
 *
 * Puro: no lee ni escribe el localStorage, no toca el DOM. La lista de
 * municipios no vive aquí: la trae el mapa (panel/mapa/colombia-2026-11.json,
 * con los códigos DIVIPOLA del DANE), y indice() la convierte en un buscador.
 * ===========================================================================*/
/* La firma de llegada: el CRM pide este archivo con la versión en la dirección
   (…?v=152). Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de v139 en
   sw.js. En Node no hay document y no hace nada. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.MapaLugares = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------------
   * NORMALIZAR: sin tildes, en minúscula, sin puntuación ni espacios de más.
   * «D.C.», «D. C.», «dc» y «Distrito Capital» se van: «Bogotá, D.C.» y
   * «bogota dc» tienen que dar la misma llave. La ñ pasa a n por el mismo
   * camino que las tildes (NFD), en los dos lados: «Nariño» y «Narino» casan.
   * ---------------------------------------------------------------------- */
  /* Abreviaturas que se escriben de verdad en un formulario de celular. Solo
     palabras enteras: «sta» es Santa, pero «stamaria» no se toca. */
  var ABREVIATURAS = { sta: 'santa', sto: 'santo', sn: 'san', pto: 'puerto', cdad: 'ciudad' };
  /* «colombia» NO está aquí: hay un municipio Colombia (Huila) y dos Puerto
     Colombia. El país al final se quita en ubicar(), no al normalizar. */
  var SOBRAN = { dc: 1, mpio: 1 };

  function normalizar(texto) {
    var s = String(texto == null ? '' : texto);
    if (typeof s.normalize === 'function') s = s.normalize('NFD');
    s = s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    /* Las siglas de los distritos: «Cartagena D.T. y C.», «Santa Marta
       D.T.C.H.», «Barranquilla D.E.I.P.». Son el título, no el nombre. */
    s = s.replace(/(^| )(d t y c|dt y c|dtyc|d t c h|dtch|d e i p|deip)( |$)/g, ' ').trim();
    if (!s) return '';
    var t = s.split(' '), r = [];
    for (var i = 0; i < t.length; i++) {
      var w = t[i];
      if (SOBRAN[w]) continue;
      /* «d c» suelto (de «D. C.») y «distrito capital». */
      if (w === 'd' && t[i + 1] === 'c') { i++; continue; }
      if (w === 'distrito' && t[i + 1] === 'capital') { i++; continue; }
      if (w === 'municipio' && r.length === 0) { if (t[i + 1] === 'de') i++; continue; }
      r.push(ABREVIATURAS[w] || w);
    }
    return r.join(' ');
  }
  function compacto(n) { return String(n || '').replace(/ /g, ''); }

  /* ------------------------------------------------------------------------
   * LOS DEPARTAMENTOS, con lo que la gente escribe en vez del nombre oficial.
   * El código es el DIVIPOLA del DANE (dos cifras): el mismo del mapa.
   * ---------------------------------------------------------------------- */
  var DEPTOS_ALIAS = {
    '05': ['antioquia', 'ant'],
    '08': ['atlantico'],
    '11': ['bogota', 'santa fe de bogota', 'santafe de bogota'],
    '13': ['bolivar'],
    '15': ['boyaca'],
    '17': ['caldas'],
    '18': ['caqueta'],
    '19': ['cauca'],
    '20': ['cesar'],
    '23': ['cordoba'],
    '25': ['cundinamarca', 'cund', 'cundi'],
    '27': ['choco'],
    '41': ['huila'],
    '44': ['la guajira', 'guajira'],
    '47': ['magdalena'],
    '50': ['meta'],
    '52': ['narino'],
    '54': ['norte de santander', 'norte santander', 'n de santander', 'nte de santander', 'n santander', 'nte santander'],
    '63': ['quindio'],
    '66': ['risaralda'],
    '68': ['santander', 'stder'],
    '70': ['sucre'],
    '73': ['tolima'],
    '76': ['valle del cauca', 'valle'],
    '81': ['arauca'],
    '85': ['casanare'],
    '86': ['putumayo'],
    '88': ['archipielago de san andres providencia y santa catalina', 'san andres y providencia',
           'san andres providencia y santa catalina', 'archipielago de san andres'],
    '91': ['amazonas'],
    '94': ['guainia'],
    '95': ['guaviare'],
    '97': ['vaupes'],
    '99': ['vichada']
  };

  /* ------------------------------------------------------------------------
   * LOS NOMBRES DE TODOS LOS DÍAS, por código. Cada uno está mirado a mano
   * contra la tabla del DANE: es el nombre corto que usa la gente para un
   * municipio cuyo nombre oficial es otro. Uno que pudiera ser de dos sitios
   * no entra aquí como si fuera de uno: va en REPETIDOS.
   * ---------------------------------------------------------------------- */
  var ALIAS = {
    'bta': ['11001'], 'bgta': ['11001'], 'bog': ['11001'],
    'santa fe de bogota': ['11001'], 'santafe de bogota': ['11001'],
    'cucuta': ['54001'],
    'tumaco': ['52835'],
    'buga': ['76111'],
    'ubate': ['25843'], 'villa de ubate': ['25843'],
    'cartagena': ['13001'],
    'mompox': ['13468'], 'santa cruz de mompox': ['13468'],
    'tolu': ['70820'], 'toluviejo': ['70823'], 'tolu viejo': ['70823'],
    'mariquita': ['73443'],
    'guican': ['15332'],
    'piendamo': ['19548'], 'tunia': ['19548'],
    'purisima': ['23586'],
    'carmen de bolivar': ['13244'],
    'carmen de viboral': ['05148'],
    'santa fe de antioquia': ['05042'], 'santafe de antioquia': ['05042'],
    'santiago de cali': ['76001'],
    'bquilla': ['08001'], 'b quilla': ['08001'],
    'bga': ['68001'],
    'vcio': ['50001'], 'villavo': ['50001'],
    /* 10-nov, del barrido del revisor. «San Andrés» a secas sigue repetido
       (también hay uno en Santander); con «Isla» ya no. «Barranca» NO entra:
       la gente dice así a Barrancabermeja, pero también existen Barrancas
       (La Guajira) y Barranca de Upía (Meta), y aquí no se adivina. */
    'san juan de pasto': ['52001'],
    'san andres isla': ['88001'], 'san andres islas': ['88001'],
    'fusa': ['25290'],
    'zipa': ['25899']
  };

  /* LAS LOCALIDADES DE BOGOTÁ. Quien vive en Kennedy escribe «Kennedy» en
     «Ciudad», y no hay en Colombia otro municipio con ese nombre. Las que SÍ
     se llaman como un municipio de otro departamento (Ciudad Bolívar, en
     Antioquia; San Cristóbal, en Bolívar; «Santa Fe», que puede ser Santa Fe
     de Antioquia) no se resuelven solas: se suman como una opción más y el
     nombre queda repetido. */
  var LOCALIDADES_BOGOTA = ['usaquen', 'chapinero', 'usme', 'tunjuelito', 'bosa', 'kennedy',
    'fontibon', 'engativa', 'suba', 'barrios unidos', 'teusaquillo', 'los martires', 'martires',
    'antonio narino', 'puente aranda', 'la candelaria', 'rafael uribe uribe', 'rafael uribe', 'sumapaz'];
  var REPETIDOS = {
    'ciudad bolivar': ['11001'],
    'san cristobal': ['11001'],
    'santa fe': ['11001', '05042']
  };

  /* ------------------------------------------------------------------------
   * EL BUSCADOR, a partir de la lista de municipios del mapa:
   *   [{ c: '25754', n: 'Soacha' }, …]   (el departamento son las dos
   *   primeras cifras del código)
   * ---------------------------------------------------------------------- */
  function agregar(m, llave, codigo) {
    if (!llave) return;
    var l = m[llave] || (m[llave] = []);
    if (l.indexOf(codigo) < 0) l.push(codigo);
  }
  function indice(municipios, departamentos) {
    var porNombre = {}, porCompacto = {}, nombre = {}, deptos = {}, nombreDepto = {};
    (municipios || []).forEach(function (m) {
      var c = String(m.c);
      nombre[c] = m.n;
      var n = normalizar(m.n);
      agregar(porNombre, n, c);
      agregar(porCompacto, compacto(n), c);
      /* «Piendamó - Tunía», «Mirití - Paraná»: la gente escribe una mitad. */
      if (/ - /.test(m.n)) m.n.split(/ - /).forEach(function (p) { agregar(porNombre, normalizar(p), c); });
    });
    Object.keys(ALIAS).forEach(function (a) {
      ALIAS[a].forEach(function (c) { if (nombre[c]) { agregar(porNombre, a, c); agregar(porCompacto, compacto(a), c); } });
    });
    LOCALIDADES_BOGOTA.forEach(function (a) { if (nombre['11001']) agregar(porNombre, a, '11001'); });
    Object.keys(REPETIDOS).forEach(function (a) {
      REPETIDOS[a].forEach(function (c) { if (nombre[c]) agregar(porNombre, a, c); });
    });
    Object.keys(DEPTOS_ALIAS).forEach(function (d) {
      DEPTOS_ALIAS[d].forEach(function (a) { deptos[a] = d; });
    });
    (departamentos || []).forEach(function (d) {
      nombreDepto[d.c] = d.corto || d.n;
      var n = normalizar(d.n);
      if (n && !deptos[n]) deptos[n] = d.c;
    });
    return { porNombre: porNombre, porCompacto: porCompacto, nombre: nombre, deptos: deptos, nombreDepto: nombreDepto };
  }

  function candidatos(idx, texto) {
    if (!texto) return [];
    return (idx.porNombre[texto] || idx.porCompacto[compacto(texto)] || []).slice();
  }
  function deptoDe(idx, texto) {
    var n = normalizar(texto);
    return n && idx.deptos[n] ? idx.deptos[n] : null;
  }
  /* Bogotá es su propio departamento (11), pero mucha gente escribe
     «Bogotá, Cundinamarca». Esa pista no saca a Bogotá. */
  function enDepto(codigo, depto) {
    var d = codigo.slice(0, 2);
    return d === depto || (depto === '25' && d === '11');
  }

  /* Con los candidatos y la pista del departamento (o sin ella), el veredicto. */
  function veredicto(idx, cands, depto, texto, via) {
    var base = { texto: texto };
    if (!cands.length) return null;
    if (depto) {
      var en = cands.filter(function (c) { return enDepto(c, depto); });
      if (!en.length) {
        return Object.assign(base, { estado: 'otro-depto', depto: depto, opciones: cands,
          motivo: 'esa ciudad no está en ' + (idx.nombreDepto[depto] || 'ese departamento') });
      }
      cands = en;
    }
    if (cands.length === 1) {
      return Object.assign(base, { estado: 'ubicado', codigo: cands[0], depto: cands[0].slice(0, 2), via: via });
    }
    return Object.assign(base, { estado: 'ambiguo', opciones: cands, motivo: 'nombre repetido' });
  }

  /* ------------------------------------------------------------------------
   * UBICAR: el texto de «Ciudad» (y, si lo hay, el de un departamento aparte).
   *
   * El orden importa: primero el texto ENTERO como ciudad («Santander de
   * Quilichao» no es «Quilichao, Santander»); después, partido por comas,
   * guiones y paréntesis («Mosquera, Cundinamarca», «Bogotá - Kennedy»); y al
   * final, sin separador, el departamento pegado al final («Soacha
   * Cundinamarca», «Mosquera Cund.»).
   * ---------------------------------------------------------------------- */
  function ubicar(textoCiudad, textoDepto, idx) {
    var crudo = String(textoCiudad == null ? '' : textoCiudad).trim();
    var t = normalizar(crudo);
    var pista = textoDepto ? deptoDe(idx, textoDepto) : null;
    /* «D.C.» o «Distrito Capital» solos se quedan sin nada al normalizar,
       pero la ficha SÍ tiene texto: la pantalla no puede decir «sin ciudad». */
    if (!t) return crudo ? { estado: 'desconocido', texto: crudo, motivo: 'no reconozco esa ciudad' }
      : { estado: 'vacio', texto: crudo, motivo: 'sin ciudad' };

    /* «Colombia» a secas es el país o el municipio del Huila: no se escoge. */
    if (t === 'colombia' && !pista) {
      return { estado: 'ambiguo', texto: crudo, opciones: candidatos(idx, t), motivo: 'puede ser el país o Colombia (Huila)' };
    }
    var r = veredicto(idx, candidatos(idx, t), pista, crudo, 'nombre');
    if (r) return r;
    /* «Bogotá Colombia»: el país al final sobra (pero «Puerto Colombia» no
       llega aquí: casó entero arriba). Con lo que venga detrás del país y
       al normalizar se va (un punto, una coma, «D.C.», «Distrito Capital»,
       un emoji): «Bogotá, Colombia.» es «Bogotá». Y solo se vuelve a mirar
       si quitarlo acortó el texto: antes, con ese punto la expresión no
       quitaba nada, ubicar se llamaba a sí mismo sin fin, y UNA ficha así
       dejaba la pestaña del mapa sin dibujar para todos (venía del 9-nov;
       lo encontró una revisión del 16-nov). */
    if (/ colombia$/.test(t)) {
      var sinPais = crudo.replace(/[\s,;\-–()]*colombia(?:[^a-z0-9]|d\.?\s*c\b|distrito\s+capital)*$/i, '');
      if (sinPais !== crudo) {
        r = ubicar(sinPais, textoDepto, idx);
        if (r.estado !== 'desconocido') return Object.assign(r, { texto: crudo });
      }
    }

    /* Partido: cada trozo es o un departamento (pista) o una ciudad. */
    var trozos = crudo.split(/[,;()\/\-–]+/).map(normalizar).filter(Boolean);
    /* «…, Colombia» al final es el país. Si llegó hasta aquí es porque lo de
       antes no casó solo («Medelin, Colombia», «Huila, Colombia»), y ese
       «Colombia» no puede hacer de municipio: los mandaba todos al Colombia
       del Huila. «Colombia, Huila» (el municipio primero) sí sigue casando. */
    if (trozos.length > 1 && trozos[trozos.length - 1] === 'colombia') trozos.pop();
    if (trozos.length > 1) {
      var pistaTrozo = pista;
      trozos.forEach(function (p) { if (!pistaTrozo && idx.deptos[p] && !candidatos(idx, p).length) pistaTrozo = idx.deptos[p]; });
      /* Un trozo que es a la vez ciudad y departamento («Arauca», «Bolívar»)
         solo hace de departamento si hay OTRO trozo que sea la ciudad. */
      for (var i = 0; i < trozos.length; i++) {
        var p = trozos[i];
        var cands = candidatos(idx, p);
        if (!cands.length) continue;
        var otroDepto = pistaTrozo;
        if (!otroDepto) {
          for (var j = 0; j < trozos.length; j++) if (j !== i && idx.deptos[trozos[j]]) { otroDepto = idx.deptos[trozos[j]]; break; }
        }
        r = veredicto(idx, cands, otroDepto, crudo, 'nombre y departamento');
        if (r) return r;
      }
    }

    /* El departamento pegado al final, sin coma: se prueba el más largo
       primero («norte de santander» antes que «santander»). */
    var palabras = t.split(' ');
    for (var k = Math.min(palabras.length - 1, 8); k >= 1; k--) {
      var cola = palabras.slice(palabras.length - k).join(' ');
      if (!idx.deptos[cola]) continue;
      var cabeza = palabras.slice(0, palabras.length - k).join(' ');
      r = veredicto(idx, candidatos(idx, cabeza), pista || idx.deptos[cola], crudo, 'nombre y departamento');
      if (r) return r;
    }
    return { estado: 'desconocido', texto: crudo, motivo: 'no reconozco esa ciudad' };
  }

  /* ------------------------------------------------------------------------
   * DE UNA FICHA, su lugar. Lee la ciudad de la ficha (la que Joan pudo
   * corregir) y, si está vacía, la que el cliente escribió en el registro
   * (s.vinculacion). Un departamento aparte solo si alguien lo escribió.
   * NO recibe ni mira s.ubicacion (el GPS), la huella del aparato, ni la
   * ciudad por IP: ver arriba.
   * ---------------------------------------------------------------------- */
  function lugarDeCliente(s, idx) {
    var x = s || {};
    var v = (x.vinculacion && typeof x.vinculacion === 'object') ? x.vinculacion : {};
    var ciudad = String(x.ciudad || '').trim() || String(v.ciudad || '').trim();
    var depto = String(x.departamento || '').trim() || String(v.departamento || '').trim();
    return ubicar(ciudad, depto, idx);
  }

  /* ========================================================================
   * 14-nov-2026 — BOGOTÁ POR DENTRO: DE LO QUE ESCRIBIÓ EL CLIENTE, SU
   * LOCALIDAD.
   *
   * Joan: «mejorar el mapa del crm que se vea mucho más detallado». En una
   * cartera que nace en la Sabana, la mitad de los clientes caía en «Bogotá»
   * como una sola mancha. El dato para abrirla ya estaba en cada ficha y el
   * mapa no lo miraba: el «Barrio», que el registro pide obligatorio
   * (app/cuenta.js). De ahí sale la localidad (Kennedy, Bosa, Suba…: son 20).
   *
   * Sigue siendo ZONAS, NUNCA PUNTOS: lo más fino que se dice de una persona
   * es su localidad. La más chica de la ciudad, La Candelaria, anda por los
   * veinte mil habitantes; Sumapaz, que es campo y va sin forma en el mapa,
   * tiene unos pocos miles en un territorio más grande que toda la ciudad
   * construida, y su cifra pasa por el mismo «1–2». El barrio
   * NO se pinta ni se cuenta: solo sirve para saber la localidad. Y sigue sin
   * leerse el GPS, la IP ni la dirección: localidadDeCliente lee «Ciudad» y
   * «Barrio», nada más (pruebas/mapa-bogota.test.js lo vigila).
   *
   * Y SIGUE SIN ADIVINAR. La localidad sale de tres cosas que el cliente sí
   * escribió, en este orden:
   *   1. El barrio, si está en la lista oficial y en UNA sola localidad
   *      («Patio Bonito» → Kennedy). La lista (unos 2.800 nombres) viaja en
   *      panel/mapa/bogota-2026-11.json y sale de Catastro y de Planeación
   *      de Bogotá: ver panel/mapa/FUENTES.md.
   *   2. El nombre de la localidad, si lo escribió en «Ciudad» («Kennedy»,
   *      «Bogotá - Suba») o pegado al barrio («Bosa Recreo», «Lisboa, Suba»).
   *   3. Si las dos cosas están, tienen que casar.
   * Lo demás queda «sin localidad», y la pestaña dice por qué:
   *   · «Lisboa» está en Suba y en Usaquén → repetido: no se escoge.
   *   · «Santa Fe» es una localidad y también un barrio de Los Mártires.
   *   · Ciudad «Kennedy» con barrio «Bosa Centro» → no casa.
   *   · «sur», «cerca al portal» → no es un barrio.
   *   · «hospital», «octubre», «Bolívar» → un PEDAZO de un nombre de la
   *     lista («Hospital San Carlos», «Doce de Octubre») no es ese nombre.
   *   · «Avenida Suba», «Torre 5» → es una dirección, no un barrio.
   *   · «Candelaria Nueva» → empieza como La Candelaria, y hay un barrio de
   *     Ciudad Bolívar que empieza igual: no se escoge.
   *   · «II etapa», «Manzana 5», «Calle 80» → no nombran nada.
   *   · «cerca a Suba», «entre Bosa y Kennedy» → dicen cerca de dónde, no dónde.
   *   · «Santafé» es «Santa Fe», y «Buena Vista», «Buenavista»: junto o
   *     separado, lo mismo.
   *   · «El Rincón» → es de Suba, y «El Rincón de Bosa», de Bosa: repetido.
   *   · «Soacha - Compartir» → el barrio nombra otro municipio.
   *   · «Bogotá, Colombia», «Bogotá Cundinamarca», «Sabana de Bogotá» → la
   *     ciudad, el país o la región, no un barrio.
   * Un cliente sin localidad sigue contando en Bogotá: no se pierde. Un
   * repetido se arregla escribiendo la localidad al lado con una coma
   * («Lisboa, Suba») o en «Ciudad» («Bogotá - Suba»). Uno que no casa, no:
   * la localidad escrita no le gana a la lista, ni en «Ciudad» ni en
   * «Barrio» («Patio Bonito, Bosa» no casa: Patio Bonito es de Kennedy). Se
   * corrige lo que esté mal.
   * ====================================================================== */
  /* Lo que va DELANTE del nombre y no es el nombre («Barrio El Tesoro», «Urb.
     Gran Yomasa», «B/ Lucero»). «Ciudad» no está: «Ciudad Jardín» y «Ciudad
     Montes» se llaman así. */
  var TIPOS_BARRIO = { barrio: 1, b: 1, br: 1, bo: 1, urbanizacion: 1, urb: 1, desarrollo: 1, conjunto: 1, conj: 1,
    residencial: 1, ciudadela: 1, parcelacion: 1, predio: 1, posesion: 1, incorporacion: 1, asentamiento: 1,
    sector: 1, vereda: 1, agrupacion: 1 };
  /* Lo que va DETRÁS y tampoco: Catastro parte «Patio Bonito» en «Patio Bonito
     II» y «III», y la gente escribe «Patio Bonito 2do sector». */
  var COLAS_BARRIO = { sector: 1, etapa: 1, urbano: 1, rural: 1, primer: 1, primera: 1, primero: 1, segundo: 1, segunda: 1,
    tercer: 1, tercera: 1, tercero: 1, cuarto: 1, cuarta: 1, ultima: 1, ultimo: 1, unica: 1, sectores: 1, etapas: 1 };
  var ROMANO = /^(x{1,3}(ix|iv|v?i{0,3})|ix|iv|v?i{1,3}|v)$/;
  var CIFRA = /^\d+(er|ro|ra|do|da|to|ta|o|a)?$/;
  /* Una llave recortada que quedó en una palabra suelta no es un barrio:
     «Villa II» no puede hacer que «Villa» a secas caiga en una localidad. */
  var VAGAS = { bogota: 1, sur: 1, norte: 1, centro: 1, oriente: 1, occidente: 1, oriental: 1, occidental: 1, central: 1,
    alto: 1, alta: 1, bajo: 1, baja: 1, altos: 1, nuevo: 1, nueva: 1, villa: 1, villas: 1, san: 1, santa: 1, santo: 1,
    el: 1, la: 1, los: 1, las: 1, de: 1, del: 1, y: 1,
    /* Las de una dirección, que la gente escribe en «Barrio» («Torre 5»,
       «Casa 3», «Manzana 12»), y unas pocas que son el principio de un
       nombre y solas no dicen nada («Pueblo Viejo», «Banco Central»). */
    casa: 1, casas: 1, torre: 1, bloque: 1, manzana: 1, lote: 1, apartamento: 1, apto: 1, interior: 1, piso: 1, edificio: 1,
    local: 1, finca: 1, pueblo: 1, estacion: 1, parte: 1, banco: 1, camino: 1 };
  var ARTICULOS = ['el', 'la', 'los', 'las'];
  /* Lo que parte un barrio en pedazos sin cambiarle el nombre. */
  var APELLIDOS_DE_SITIO = { alto: 1, alta: 1, bajo: 1, baja: 1, medio: 1, media: 1, central: 1, centro: 1, norte: 1, sur: 1,
    oriental: 1, occidental: 1, oriente: 1, occidente: 1, nuevo: 1, nueva: 1, viejo: 1, vieja: 1, antiguo: 1, antigua: 1 };
  /* Las fechas: Catastro escribe «Siete de Agosto» y «Veinte de Julio», y la
     gente «7 de agosto» y «20 de julio». Las dos puntas quedan en cifras. */
  var NUMEROS = { primero: '1', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8',
    nueve: '9', diez: '10', once: '11', doce: '12', trece: '13', catorce: '14', quince: '15', dieciseis: '16',
    diecisiete: '17', dieciocho: '18', diecinueve: '19', veinte: '20', veintiuno: '21', veintidos: '22', veintitres: '23',
    veinticuatro: '24', veinticinco: '25', veintiseis: '26', veintisiete: '27', veintiocho: '28', veintinueve: '29',
    treinta: '30' };
  var MESES = { enero: 1, febrero: 1, marzo: 1, abril: 1, mayo: 1, junio: 1, julio: 1, agosto: 1, septiembre: 1,
    setiembre: 1, octubre: 1, noviembre: 1, diciembre: 1 };
  /* Los nombres de Bogotá en «Ciudad»: se quitan antes de buscar la localidad.
     Sin esto, «Santa Fe de Bogotá» diría que el cliente vive en Santa Fe. */
  var NOMBRES_DE_BOGOTA = ['santa fe de bogota', 'santafe de bogota', 'bogota', 'bgta', 'bta', 'bog'];
  /* Cómo más se le dice a una localidad (el nombre oficial llega con el mapa). */
  var ALIAS_LOCALIDAD = { '03': ['santafe'], '08': ['ciudad kennedy'], '14': ['martires'], '17': ['candelaria'],
    '18': ['rafael uribe'] };
  /* Las palabras de una VÍA. Un texto que trae una («Avenida Suba», «Cll 80
     con Av Suba», «Vía a Usme») es una dirección, y en una dirección el
     nombre de una localidad es el de la calle, no el de donde vive: la
     avenida Suba cruza Barrios Unidos antes de llegar a Suba. (AK, AC, KR,
     CL, DG y TV: así las escribe la nomenclatura de Bogotá.) */
  var VIAS = { avenida: 1, av: 1, avda: 1, avd: 1, ak: 1, ac: 1, calle: 1, cl: 1, cll: 1, clle: 1, carrera: 1, cra: 1, kra: 1,
    kr: 1, cr: 1, crr: 1, diagonal: 1, diag: 1, dg: 1, transversal: 1, transv: 1, trans: 1, tv: 1, autopista: 1, autop: 1,
    via: 1, carretera: 1, troncal: 1, variante: 1, circunvalar: 1, salida: 1, km: 1, kilometro: 1, calles: 1, carreras: 1 };
  /* Lo que va delante de un nombre y lo vuelve otro barrio del mismo
     apellido: «Gran Britalia», «Nuevo Corinto», «Nueva Colombia». */
  var PREFIJOS_DE_SITIO = { gran: 1, nuevo: 1, nueva: 1 };
  /* Las otras palabras de una dirección. «Torre» y «Casa» no están: «La Torre»
     y «Casa Blanca» son barrios (esas van en VAGAS, que solo mira una llave de
     una palabra). Con su número detrás sí se quitan, en llavesBarrio. Estas
     tampoco terminan un nombre: «La Esperanza Calle 131A» y «Buenavista
     Manzana 7» son «La Esperanza» y «Buenavista», que están en varias
     localidades. */
  var NOMENCLATURA = { manzana: 1, manzanas: 1, mz: 1, mzn: 1, mzna: 1, lote: 1, lotes: 1, lt: 1, bloque: 1, bloques: 1,
    bl: 1, apartamento: 1, apto: 1, ap: 1, interior: 1, int: 1, piso: 1, edificio: 1, zona: 1, numero: 1, no: 1, nro: 1,
    seccion: 1, secciones: 1, predio: 1, predios: 1, parte: 1 };
  /* Lo que no puede quedar al final de un nombre recortado («Portal de»). */
  var CONECTORES = { de: 1, del: 1, y: 1, con: 1, en: 1, entre: 1 };
  /* Lo que dice CERCA de dónde, no dónde: «cerca a Suba», «entre Bosa y
     Kennedy», «límite con Usme». Un texto así no pone a nadie en una
     localidad por llevar su nombre. */
  var CERCANIAS = { cerca: 1, cercano: 1, cercana: 1, cercania: 1, cercanias: 1, entre: 1, antes: 1, despues: 1,
    saliendo: 1, limite: 1, limites: 1, frente: 1, junto: 1, lado: 1, alrededor: 1, alrededores: 1, aledano: 1,
    pegado: 1, detras: 1, atras: 1, hacia: 1, por: 1 };
  /* El país y el departamento escritos en «Barrio» («Bogotá, Colombia»,
     «Bogotá Cundinamarca»). Los dos son también barrios de la lista (en
     Barrios Unidos y en Puente Aranda), pero quien los escribe solos está
     diciendo la ciudad, no el barrio: no se sabe, y no se escoge. */
  var NO_DICEN_BARRIO = { colombia: 1, cundinamarca: 1 };
  /* «Sabana de Bogotá», «Portal de Bogotá»: lo que va antes de «de Bogotá» es
     un pedazo de otro nombre, no un barrio (sin esto, «Sabana» casaba con «La
     Sabana», de Los Mártires). «Santa Fe de Bogotá» es la ciudad, y sinBogota
     ya lo quita entero. */
  function colgadoDeBogota(texto) {
    var n = ' ' + normalizar(texto) + ' ';
    n = n.split(' santa fe de bogota ').join(' ').split(' santafe de bogota ').join(' ');
    return / (de|del|en) (bogota|bgta|bta|bog) /.test(n);
  }
  /* Una llave que trae una palabra de vía es una dirección. */
  function traeVia(n) { return String(n || '').split(' ').some(function (w) { return !!VIAS[w]; }); }
  function cerca(n) { return String(n || '').split(' ').some(function (w) { return !!CERCANIAS[w]; }); }
  /* Una llave hecha SOLO de palabras que no nombran nada: «II etapa»,
     «Primer sector», «Parte media», «Calle 13 A», «Torre 3», «Manzana C».
     Catastro trae varias así (lo que va entre paréntesis en un nombre
     oficial) y la gente las escribe en «Barrio». No son un barrio. Hace
     falta al menos una que nunca nombra (un número, «etapa», «calle»,
     «manzana»…): «Casa Nueva» y «Torre Alta» pueden ser un nombre. */
  function nombraNada(x) {
    return !!(COLAS_BARRIO[x] || ROMANO.test(x) || CIFRA.test(x) || /^[a-z]$/.test(x) || VIAS[x] || NOMENCLATURA[x] || TIPOS_BARRIO[x]);
  }
  function generica(k) {
    var w = String(k || '').split(' ').filter(Boolean);
    if (!w.length) return true;
    return w.some(nombraNada) && w.every(function (x) {
      return nombraNada(x) || !!APELLIDOS_DE_SITIO[x] || x === 'casa' || x === 'torre' || x === 'local';
    });
  }
  /* Una llave de UNA palabra que es vaga o de vía no es un barrio: «Torre 5»
     no es «La Torre» (Ciudad Bolívar), «Calle 62» no es nada, y «Pueblo» no
     es «Pueblo Viejo». Con más palabras sí puede serlo: «La Torre», «Casa
     Blanca» y «Casa Nueva» siguen en la lista, salvo que sean genéricas.
     «Autopista Sur» salió: escrito en «Barrio» no se distingue de una
     dirección. */
  function vaga(k) { return !!(VAGAS[k] || VIAS[k]) || generica(k); }

  /* LAS LLAVES DE UN NOMBRE DE BARRIO, el oficial o el que escribió el
     cliente (las dos puntas pasan por aquí: así casan): primero entera,
     después sin la cola. Sin lo de delante en los dos casos. */
  function llavesBarrio(texto, soloPuntas) {
    var t = normalizar(texto).split(' ').filter(Boolean);
    t.forEach(function (w, i) { if (NUMEROS[w] && t[i + 1] === 'de' && MESES[t[i + 2]]) t[i] = NUMEROS[w]; });
    var quito = '';
    while (t.length > 1 && TIPOS_BARRIO[t[0]]) quito = t.shift();
    /* «Sector II Altamar»: quitado el «sector», su número sobra. Solo detrás
       de «sector»: «20 de Julio» y «Barrio 7 de Agosto» empiezan por un
       número que sí es el nombre. */
    if (quito === 'sector' && t.length > 1 && (ROMANO.test(t[0]) || CIFRA.test(t[0]))) t.shift();
    if (!t.length || (t.length === 1 && (TIPOS_BARRIO[t[0]] || t[0].length < 3))) return [];
    var entera = t.join(' ');
    var r = vaga(entera) ? [] : [entera];
    /* La cola: «II», «2do sector», «Manzana B lote 12», «Calle 131A»,
       «parte alta». Primero lo que es de la dirección, después lo que es
       cola del nombre, y CADA PASO es una llave, de la más larga a la más
       corta: la primera que casa gana (deLlaves). De un tirón, «Tunjuelito
       Rural Manzana 4» perdía también el «rural» y quedaba «tunjuelito», que
       es OTRA localidad (Tunjuelito Rural es de Usme); con solo la llave de
       la dirección y la última, «Tunjuelito Rural parte alta» y «Tunjuelito
       Rural II» seguían cayendo ahí (revisión del 15-nov, segunda y tercera
       vuelta). La lista oficial se arma solo con las puntas (`soloPuntas`):
       un paso de en medio de un nombre oficial («Santa Cecilia sector», sin
       su número) es más vago que el nombre, y quedaba en UNA localidad
       aunque «Santa Cecilia» esté en cuatro. */
    var esDireccion = function (w) { return CIFRA.test(w) || /^[a-z]$/.test(w) || VIAS[w] || NOMENCLATURA[w] || CONECTORES[w]; };
    var c = t.slice(), pasos = [];
    while (c.length > 1 && esDireccion(c[c.length - 1])) {
      /* Una «I», «V» o «X» suelta puede ser la letra de la dirección o el
         número del barrio: «Páramo Urbano I Manzana 4» es Páramo Urbano I,
         de Usaquén, y sin ella caía en «Páramo Urbano», de Chapinero
         (tercera vuelta). El paso con ella también es una llave; detrás de
         otro número no («Tibaque II I» no es «Tibaque III»). */
      if (/^[ivx]$/.test(c[c.length - 1]) && !ROMANO.test(c[c.length - 2])) pasos.push(c.join(' '));
      c.pop();
      /* «Patio Bonito casa 5», «Timiza torre 2 apto 402»: la casa o la torre
         con lo de la dirección detrás es de la dirección. Sin quitarla, el
         barrio no se veía y ganaba la localidad escrita: «Patio Bonito casa
         5, Bosa» salía en Bosa, y «Patio Bonito, Bosa» no casa (cuarta vuelta
         del 15-nov). Detrás de un artículo no: «La Torre 2» y «Villa de la
         Torre 2» son esos barrios. El paso de en medio también es una llave:
         «La Concordia 1 casa 5» es «La Concordia 1», no «La Concordia». */
      if (c.length >= 2 && (c[c.length - 1] === 'casa' || c[c.length - 1] === 'torre') && ARTICULOS.indexOf(c[c.length - 2]) < 0) {
        c.pop();
        pasos.push(c.join(' '));
      }
    }
    pasos.push(c.join(' '));
    var deLaDireccion = pasos.slice();
    while (c.length > 1) {
      var w = c[c.length - 1];
      /* «Rocío (parte baja)», «Marco Fidel Suárez IV "Parte Alta"»: así los
         escribe Planeación, y quien vive ahí escribe el nombre sin signos. */
      if (c.length > 2 && PARTE_DE[w] && c[c.length - 2] === 'parte') c.splice(-2, 2);
      else if (COLAS_BARRIO[w] || ROMANO.test(w) || esDireccion(w)) c.pop();
      else break;
      pasos.push(c.join(' '));
    }
    /* Lo que queda al quitar la DIRECCIÓN, si es «Cundinamarca» o «Colombia»,
       no es un barrio (ver NO_DICEN_BARRIO): «Cundinamarca casa 5» es la
       ciudad y la dirección, y caía en Puente Aranda (quinta vuelta del
       15-nov). Con la cola de un nombre sí vale, como antes: «Colombia II»
       no es el país. Y entero también: el barrio Cundinamarca de la lista
       sigue con su llave (quien escribe «Cundinamarca» solo no dice cuál, ver
       localidadesDeTexto). */
    (soloPuntas ? pasos.slice(-1) : pasos).forEach(function (k) {
      if (k !== entera && r.indexOf(k) < 0 && !vaga(k) && (k.indexOf(' ') > 0 || k.length >= 5) &&
        !(NO_DICEN_BARRIO[k] && deLaDireccion.indexOf(k) >= 0)) r.push(k);
    });
    /* La dirección DELANTE del barrio: «Mz 4 Lt 12 Patio Bonito», «Casa 5
       Patio Bonito», «Torre 3 Apto 402 Timiza». Sin quitarla el barrio no se
       veía y ganaba la localidad escrita, como con la dirección detrás
       (quinta vuelta del 15-nov). Se quita UN par (la palabra y su número) y
       lo que queda se lee otra vez entero, con su cola y lo que tenga
       delante: así «Mz 4 Lote 95A Anexo Soratama» es el barrio oficial «Lote
       95A Anexo Soratama», no «Anexo Soratama». Sus llaves van al final, las
       últimas en contar: si lo escrito, entero o sin la cola, es un nombre de
       la lista, ese gana. Lo que queda tampoco vale si es la ciudad («Casa 5
       Cundinamarca»). Solo al leer la ficha: en la lista oficial no cambia
       nada. */
    if (!soloPuntas && t.length > 2 && (NOMENCLATURA[t[0]] || t[0] === 'casa' || t[0] === 'torre') && (CIFRA.test(t[1]) || /^[a-z]$/.test(t[1]))) {
      llavesBarrio(t.slice(2).join(' ')).forEach(function (k, i) {
        if (r.indexOf(k) < 0 && !(i === 0 && NO_DICEN_BARRIO[k])) r.push(k);
      });
    }
    return r;
  }
  var PARTE_DE = { alta: 1, baja: 1, media: 1, alto: 1, bajo: 1, medio: 1 };
  /* Las otras maneras de decir el mismo nombre: «Porvenir» es «El Porvenir»,
     «La Castilla» es «Castilla», y «El Tunal» es «Ciudad Tunal». */
  function otrasFormas(llave) {
    var p = llave.split(' '), resto = p.slice(1).join(' ');
    if (p.length > 1 && ARTICULOS.indexOf(p[0]) >= 0) return [resto, 'ciudad ' + resto];
    if (p.length > 1 && p[0] === 'ciudad') return [resto].concat(ARTICULOS.map(function (a) { return a + ' ' + resto; }));
    return ARTICULOS.map(function (a) { return a + ' ' + llave; }).concat(['ciudad ' + llave]);
  }
  /* Un texto sin los nombres de Bogotá («Bogotá Suba» es Suba; «Santa Fe de
     Bogotá» no dice ninguna localidad). */
  function sinBogota(texto) {
    var n = ' ' + normalizar(texto) + ' ';
    NOMBRES_DE_BOGOTA.forEach(function (b) { n = n.split(' ' + b + ' ').join(' '); });
    return n.trim();
  }

  /* El buscador de Bogotá, a partir de su archivo: las localidades por nombre
     y la lista de barrios, que viaja agrupada por la o las localidades donde
     está cada nombre ({ "08": "patio bonito|timiza", "01 11": "lisboa" }). */
  function indiceBogota(bog) {
    var nombre = {}, porNombre = Object.create(null), barrios = Object.create(null);
    ((bog && bog.localidades) || []).forEach(function (l) { nombre[l.c] = l.n; porNombre[normalizar(l.n)] = l.c; });
    Object.keys(ALIAS_LOCALIDAD).forEach(function (c) {
      if (nombre[c]) ALIAS_LOCALIDAD[c].forEach(function (a) { porNombre[a] = c; });
    });
    var grupos = (bog && bog.barrios) || {};
    Object.keys(grupos).forEach(function (g) {
      var codigos = g.split(' ').filter(function (c) { return nombre[c]; });
      if (codigos.length) String(grupos[g]).split('|').forEach(function (k) { if (k) barrios[k] = codigos; });
    });
    /* De más largo a más corto: «rafael uribe uribe» antes que «rafael uribe». */
    var largos = Object.keys(porNombre).sort(function (a, b) { return b.length - a.length || (a < b ? -1 : a > b ? 1 : 0); });
    /* LAS FAMILIAS. De cada nombre de la lista, sus primeras palabras.
       `familia` guarda en qué localidades hay un barrio que es ese principio
       MÁS UN APELLIDO DE SITIO («lucero» → los de «Lucero Alto», «Lucero
       Bajo», «Lucero del Sur»): son partes del mismo barrio, y quien vive en
       una escribe «Lucero». «Rincón de Santa Inés» no es de la familia de
       «Rincón»: es otro nombre.
       La familia solo SUMA duda a un nombre que ya está en la lista: no
       ubica a nadie por sí sola (revisión del 14-nov). Medido quitando de la
       lista cada uno de los 1.000 nombres urbanos de Catastro, lo que solo
       casaba por su familia contestaba una localidad unas 50 veces y se
       equivocaba en una de cada cuatro («Sosiego» caía en Rafael Uribe Uribe
       por «Sosiego Sur»; «La Floresta», en Kennedy por «Floresta del Sur»).
       «Perdomo» y «Niza» a secas se pierden: quedan sin localidad, y se
       arreglan como todo («Perdomo, Ciudad Bolívar»).
       Aquí hubo, hasta antes de publicarse, un índice más: en qué localidades
       hay un barrio que LLEVA un trozo en cualquier parte («hospital» →
       «Hospital San Carlos»). Se quitó: medido contra la lista, ubicaba 363
       palabras sueltas que no son barrios («hospital», «octubre»,
       «Venezuela», «carretera») y más de cuatro mil trozos («zona 10», «de
       Dios»), y de 258 barrios conocidos no ubicaba ni uno más. Era adivinar. */
    var familia = Object.create(null);
    Object.keys(barrios).forEach(function (k) {
      var w = k.split(' '), codigos = barrios[k];
      for (var b = 1; b < w.length; b++) {
        if (APELLIDOS_DE_SITIO[w[b]] || (w[b] === 'del' && APELLIDOS_DE_SITIO[w[b + 1]])) {
          var f = w.slice(0, b).join(' ');
          familia[f] = sumar(familia[f] || [], codigos);
        }
      }
    });
    /* Y AL REVÉS, lo que va DELANTE: «Gran Britalia» es de Kennedy, y quien
       vive ahí escribe «Britalia», que en la lista es un barrio de Suba.
       `conPrefijo` guarda en qué localidades hay un «Gran…», un «Nuevo…» o
       una «Nueva…» de cada nombre. Solo ENSANCHA un nombre que ya es algo
       (ver deNombre): «Britalia» queda repetido entre Suba y Kennedy. No
       hace barrio a «Milenio» porque exista «Nuevo Milenio». */
    var conPrefijo = Object.create(null);
    Object.keys(barrios).forEach(function (k) {
      var w = k.split(' ');
      if (w.length < 2 || !PREFIJOS_DE_SITIO[w[0]]) return;
      var base = w.slice(1).join(' ');
      conPrefijo[base] = sumar(conPrefijo[base] || [], barrios[k]);
    });
    /* LOS QUE EMPIEZAN COMO UNA LOCALIDAD Y NO SON DE ELLA. «Candelaria La
       Nueva» es de Ciudad Bolívar; «Chapinero Occidental», de Teusaquillo;
       «San Cristóbal Norte», de Usaquén. Por cada nombre de localidad, en
       qué localidades hay barrios de la lista que EMPIEZAN con él: si alguna
       es otra, ese principio no prueba la localidad (localidadesDeTexto,
       paso 2). Los que TERMINAN con el nombre de una localidad y Catastro
       pone en otra («El Paraíso Bosa», en Kennedy) ya vienen en la lista con
       las dos: ver listaDeBarrios en herramientas/mapa-bogota.js. */
    var delante = Object.create(null);
    largos.forEach(function (loc) { delante[loc] = []; });
    Object.keys(barrios).forEach(function (k) {
      largos.forEach(function (loc) { if (k.indexOf(loc + ' ') === 0) sumar(delante[loc], barrios[k]); });
    });
    /* EL MISMO NOMBRE, JUNTO O SEPARADO. La lista trae «Vista Hermosa» en
       Kennedy y Ciudad Bolívar y «Vistahermosa» solo en Ciudad Bolívar;
       «Santa Fe» es la localidad y un barrio de Bosa y de Los Mártires, y
       «Santafé» casaba solo con la localidad. Según donde se pusiera el
       espacio, el cliente salía repetido o ubicado. `mismasLetras` junta los
       nombres que se escriben con las mismas letras, de la lista y de las
       localidades (el buscador de municipios hace lo mismo con porCompacto),
       y deNombre los recorre todos. */
    var mismasLetras = Object.create(null);
    Object.keys(barrios).concat(Object.keys(porNombre)).forEach(function (k) {
      var p = compacto(k), l = mismasLetras[p] || (mismasLetras[p] = []);
      if (l.indexOf(k) < 0) l.push(k);
    });
    /* «X DE <LOCALIDAD>» Y «X <LOCALIDAD>»: «El Rincón de Bosa», «San Diego
       Bosa», «Santa Teresa de Suba», «Puerta del Sol Engativá». El apellido
       es el nombre de una localidad: es el mismo «El Rincón», dicho con su
       localidad, y quien vive ahí escribe «El Rincón», que en la lista es de
       Suba. `conLocalidad` guarda dónde están; como conPrefijo, solo ENSANCHA
       un nombre que ya es algo (ver deNombre). «Rincón de Santa Inés» no
       cuenta: Santa Inés no es una localidad, y eso sí es otro nombre. */
    var conLocalidad = Object.create(null);
    Object.keys(barrios).forEach(function (k) {
      for (var i = 0; i < largos.length; i++) {
        var loc = largos[i];
        if (k.length <= loc.length + 1 || k.slice(-(loc.length + 1)) !== ' ' + loc) continue;
        var base = k.slice(0, -(loc.length + 1)).replace(/ (de|del|en)$/, '');
        if (base) conLocalidad[base] = sumar(sumar(conLocalidad[base] || [], barrios[k]), [porNombre[loc]]);
        break;                                     // de más largo a más corto: el primero que casa
      }
    });
    /* LOS PEDAZOS DE LOS NOMBRES: cada tramo de palabras seguidas de un
       nombre de la lista que no es el nombre entero («prado» y «veraniego»,
       de «Prado Veraniego»; «madrid», de «Madrid II»; «cota», de «El
       Horizonte Vía a Cota Salitre»). Un municipio que es un pedazo puede
       ser lo que alguien deja de un barrio de aquí, y no se lee nunca al
       principio de un texto (ver municipioAlPrincipio). */
    var pedazos = Object.create(null);
    Object.keys(barrios).forEach(function (k) {
      var w = k.split(' ');
      for (var i = 0; i < w.length; i++) {
        for (var j = i + 1; j <= w.length; j++) if (j - i < w.length) pedazos[w.slice(i, j).join(' ')] = 1;
      }
    });
    return { municipio: String((bog && bog.municipio) || ''), nombre: nombre, porNombre: porNombre, largos: largos, barrios: barrios,
      familia: familia, conPrefijo: conPrefijo, delante: delante, mismasLetras: mismasLetras, conLocalidad: conLocalidad,
      pedazos: pedazos };
  }

  function sumar(a, b) { (b || []).forEach(function (c) { if (a.indexOf(c) < 0) a.push(c); }); return a; }
  function cruzar(a, b) { return a.filter(function (c) { return b.indexOf(c) >= 0; }); }
  function trocear(texto) {
    return String(texto == null ? '' : texto).split(/[,;()\/\-–—:]+/).map(function (p) { return p.trim(); }).filter(Boolean);
  }

  /* LO QUE PUEDE SER UN NOMBRE: un barrio de la lista, el nombre de una
     localidad, o las dos cosas («Santa Fe»: entonces son dos opciones y no
     se escoge). TODO lo que ese nombre puede ser se SUMA, no se escoge lo
     primero que case:
       · sus otras formas: «Porvenir» puede ser cualquiera de los «El
         Porvenir», y los dos textos tienen que dar lo mismo;
       · su familia: «Lucero» a secas casaba con «El Lucero», de San
         Cristóbal, cuando «Lucero Alto», «Bajo» y «Medio» son de Ciudad
         Bolívar. Con la familia sumada queda repetido, que es la verdad;
       · lo que se escribe con las mismas letras: «Santafé» es «Santa Fe»,
         y «Buena Vista», «Buenavista»;
       · y su «Gran…» y su «Nuevo…» («Britalia» es de Suba y «Gran
         Britalia» de Kennedy) y su «… de <Localidad>» («El Rincón» es de
         Suba y «El Rincón de Bosa», de Bosa).
     Todo eso SUMA a un nombre que está en la lista (él, sus otras formas o
     sus mismas letras). Lo que solo se parece a uno de la lista no es nada:
     «Modelo» no está, y que exista «Modelo Sur» no dice dónde vive (ver la
     nota de `familia`).
     El nombre de una localidad no suma familia: «Chapinero» es Chapinero,
     aunque «Chapinero Occidental» sea de Teusaquillo. */
  function deNombre(idxB, k) {
    /* Las formas del nombre: él, lo que se escribe con sus mismas letras
       («buena vista» y «buenavista») y las otras formas de cada uno («el
       porvenir» y «porvenir»). Es localidad si alguna con sus mismas letras
       lo es («Sancristobal» es San Cristóbal). */
    var mismas = (idxB.mismasLetras && idxB.mismasLetras[compacto(k)]) || [];
    var esLocalidad = !!idxB.porNombre[k] || mismas.some(function (v) { return !!idxB.porNombre[v]; });
    var formas = [k];
    mismas.forEach(function (v) { if (formas.indexOf(v) < 0) formas.push(v); });
    formas.slice().forEach(function (v) { otrasFormas(v).forEach(function (o) { if (formas.indexOf(o) < 0) formas.push(o); }); });
    var r = [];
    formas.forEach(function (v) { sumar(r, idxB.barrios[v]); });
    if (esLocalidad) formas.forEach(function (v) { if (idxB.porNombre[v]) sumar(r, [idxB.porNombre[v]]); });
    if (!r.length || esLocalidad) return r;
    formas.forEach(function (v) {
      sumar(r, idxB.familia[v]);
      sumar(r, idxB.conPrefijo[v]);
      sumar(r, idxB.conLocalidad && idxB.conLocalidad[v]);
    });
    return r;
  }
  /* Primero el nombre entero; si no está, sin la cola. */
  function deLlaves(idxB, llaves) {
    var r = [];
    for (var i = 0; i < llaves.length && !r.length; i++) r = deNombre(idxB, llaves[i]);
    return r;
  }
  /* La localidad pegada al principio y al final de una llave: [la de
     delante, la de detrás], con su nombre tal como va en `largos`, o ''. */
  function pegadas(idxB, n) {
    var ini = '', fin = '';
    idxB.largos.forEach(function (loc) {            // de más largo a más corto: gana el más largo
      if (!ini && n.indexOf(loc + ' ') === 0) ini = loc;
      if (!fin && n.length > loc.length && n.slice(-(loc.length + 1)) === ' ' + loc) fin = loc;
    });
    return [ini, fin];
  }

  /* LO QUE DICE UN TEXTO de barrio: una lista de COSAS DICHAS, cada una con
     las localidades donde puede ser (el que llama las cruza todas), o null si
     no dice nada que se reconozca. Con `soloLista`, nada más que el paso 1. */
  function localidadesDeTexto(idxB, texto, soloLista) {
    var llaves = llavesBarrio(sinBogota(texto));
    if (!llaves.length || NO_DICEN_BARRIO[llaves[0]] || colgadoDeBogota(texto)) return null;
    /* 1. Es un nombre de la lista, o el de una localidad. Y nada más: un
          PEDAZO de un nombre de la lista no es ese nombre (ver indiceBogota). */
    var r = deLlaves(idxB, llaves);
    if (r.length) return [r];
    if (soloLista) return null;
    /* 2. La localidad escrita al principio o al final, pegada a otra cosa
          («Bosa Recreo», «Lisboa Suba», «Altos de Suba»): la localidad la
          dijo él. Va DESPUÉS de la lista a propósito: «San Cristóbal Norte»
          es un barrio de Usaquén, y por la lista sale bien. Con dos candados,
          porque el nombre de una localidad dentro de un texto más largo no
          siempre es la localidad:
            a) En una dirección no se mira (ver VIAS), ni en lo que dice
               cerca de dónde («cerca a Suba», «entre Bosa y Kennedy»: ver
               CERCANIAS).
            b) Vale sola si lo demás es un barrio de la lista que ESTÁ en
               ella («Lisboa Suba»: Lisboa está en Suba). Si no, puede ser
               parte de un nombre, y se le suman: las localidades de un
               barrio que se llame como ella («Santa Fe» es también un barrio
               de Los Mártires) y, si va DELANTE, las de los barrios de la
               lista que empiezan igual. Si con eso son varias, no se escoge:
               «Candelaria Nueva» no es La Candelaria, y «Chapinero Alto»
               puede ser como «Chapinero Occidental», que es de Teusaquillo.
            c) Lo demás TAMBIÉN cuenta, como con una coma (revisión del
               15-nov): «Patio Bonito Bosa» es lo mismo que «Patio Bonito,
               Bosa», y Patio Bonito es de Kennedy: no casa. Antes ganaba la
               localidad escrita, y el mismo texto daba Bosa o «no casa»
               según llevara coma. «Suba Compartir» tampoco casa:
               «Compartir» está en la lista solo en Ciudad Bolívar. Con «de»
               delante («Portal de Suba», «Altos de Suba») la localidad es la
               del nombre que escribió: lo demás no la contradice.
            d) Dos localidades escritas («Teusaquillo La Candelaria») que
               solo casan en una TERCERA no son esa tercera: no casan.
            e) Y si lo demás dice algo, la localidad va SOLA: lo de b) (sus
               barrios homónimos y los que empiezan igual) es para cuando lo
               demás no dice nada. Ensancharla y después cruzarla con lo
               demás escogía esa otra localidad: «La Esperanza San Cristóbal»
               caía en Usaquén, que tiene un barrio «San Cristóbal» y una «La
               Esperanza» (tercera vuelta del 15-nov). */
    var n = llaves[0];
    if (traeVia(n) || cerca(n)) return null;
    var p = pegadas(idxB, n), ini = p[0], fin = p[1];
    /* f) La del final puede ir antes de la cola («Engativá Pueblo Usaquén
          sector»): se busca también en las llaves sin la cola. Pero si esa
          localidad, con su cola y con lo que tenga delante, es un nombre de
          la lista que NO está en ella, no la escribió: «Casa 12, Tunjuelito
          Rural» es el barrio de Usme, y «Casa 12, San Rafael Usme Rural I»,
          uno de San Cristóbal (cuarta vuelta del 15-nov: caían en Tunjuelito
          y en Usme). Si el nombre de la lista SÍ está en ella, vale: «Lote 5
          Centro Engativá sector» es de Engativá. */
    for (var j = 1; !fin && j < llaves.length; j++) {
      var pj = pegadas(idxB, llaves[j]);
      if (!pj[1] || pj[0] !== ini) continue;
      var ws = llaves[0].split(' '), hastaLoc = llaves[j].split(' ').length - pj[1].split(' ').length;
      var cf0 = idxB.porNombre[pj[1]], otra = false;
      for (var a = 0; a <= hastaLoc && !otra; a++) {
        otra = llavesBarrio(ws.slice(a).join(' ')).some(function (k) {
          var d = deNombre(idxB, k);
          return d.length > 0 && d.indexOf(cf0) < 0;
        });
      }
      if (otra) break;
      fin = pj[1]; n = llaves[j];
    }
    if (!ini && !fin) return null;
    var desde = ini ? ini.length + 1 : 0, hasta = fin ? n.length - fin.length - 1 : n.length;
    var resto = hasta > desde ? n.slice(desde, hasta) : '';
    /* g) Con una delante y otra detrás, lo de en medio puede ir con la de
          delante y ser un nombre de la lista: «Bosa Centro Santa Fe» es el
          barrio «Bosa Centro» y Santa Fe. Es lo mismo que con una coma: la
          localidad sola, cruzada con ese barrio (tercera vuelta del 15-nov:
          caía en Bosa). Con la de detrás no hace falta: «Teusaquillo Altos
          de Suba» lo resuelve el «de», y un barrido de 635.000 textos no
          encontró uno solo que cambiara mirándolo. */
    if (ini && fin) {
      /* También lo que sigue a la de delante, con su cola o sin ella:
         «Teusaquillo Suba Urbano II» es Teusaquillo y el barrio «Suba
         Urbano». */
      for (var q = 0; q < llaves.length; q++) {
        var trasIni = llaves[q].indexOf(ini + ' ') === 0 ? deNombre(idxB, llaves[q].slice(ini.length + 1)) : [];
        if (trasIni.length) return [[idxB.porNombre[ini]], trasIni];
      }
    }
    if (ini && fin && resto) {
      var conIni = deNombre(idxB, ini + ' ' + resto);
      if (conIni.length) return [conIni, [idxB.porNombre[fin]]];
    }
    var deResto = resto ? deLlaves(idxB, llavesBarrio(resto)) : [];
    var cuenta = deResto.length > 0 && !(fin && / (de|del)$/.test(' ' + resto));
    var dichas = [];
    [ini, fin].forEach(function (loc, i) {
      if (!loc) return;
      var c = idxB.porNombre[loc];
      dichas.push(cuenta || deResto.indexOf(c) >= 0 ? [c] : sumar(sumar([c], deNombre(idxB, loc)), i ? [] : idxB.delante[loc]));
    });
    if (ini && fin) {
      var ci = idxB.porNombre[ini], cf = idxB.porNombre[fin], x = cruzar(dichas[0], dichas[1]);
      if (x.indexOf(ci) < 0 && x.indexOf(cf) < 0) return [[ci], [cf]];
    }
    if (cuenta) dichas.push(deResto);
    return dichas;
  }
  /* El trozo ES una localidad y nada más («Kennedy», «Localidad de Suba»,
     «Loc. Bosa»): su nombre tal como va en porNombre, o ''. */
  function localidadExacta(idxB, texto) {
    var n = sinBogota(texto).replace(/^(localidad|loc)( de)? /, '');
    return idxB.porNombre[n] ? n : '';
  }
  /* La localidad que nombra «Ciudad», si nombra alguna: «Kennedy», «Bogotá -
     Suba», «Suba (Bogotá)». Cada trozo, quitado el nombre de Bogotá, tiene
     que ser EXACTAMENTE una localidad. El departamento o el país pegados
     detrás no la cambian: «Kennedy Cundinamarca», «Engativá Cund», «Bosa
     Colombia». Sin esto no se leía, decidía el barrio solo, y «Kennedy
     Cundinamarca» + «Compartir» caía en Ciudad Bolívar en vez de chocar
     (sexta vuelta del 15-nov). Solo en «Ciudad»: en «Barrio», «Cundinamarca»
     y «Colombia» son también barrios de la lista. */
  var DETRAS_DE_LA_CIUDAD = /( (cundinamarca|cundi|cund|colombia))+$/;
  function localidadesDeCiudad(idxB, textoCiudad) {
    var r = [];
    trocear(textoCiudad).forEach(function (t) {
      var n = localidadExacta(idxB, t) || localidadExacta(idxB, sinBogota(t).replace(DETRAS_DE_LA_CIUDAD, ''));
      if (n) r.push([idxB.porNombre[n]]);
    });
    return r;
  }
  /* LO QUE DICE «Barrio», en este orden:
       a) Entero y por la lista: «B/ Patio Bonito» y «Santa Fe (Bosa)» son UN
          nombre aunque traigan un signo. Si además trae una localidad como
          trozo aparte, esa lo estrecha («El Paraíso, Bosa»: la lista tiene
          «El Paraíso Bosa» en Bosa y en Kennedy, y él dijo Bosa), pero no le
          lleva la contraria: «San Cristóbal - Norte» sigue siendo el barrio
          de Usaquén.
       b) Con un signo en medio y un trozo que ES una localidad («Narnia,
          Kennedy», «Ciudad Bolívar - Lucero Alto»): esa es, sin la duda de
          si es parte de un nombre. Es el arreglo que enseña la pestaña para
          un repetido («Lisboa, Suba»). Pero seis localidades se llaman
          también como un barrio de OTRA («Santa Fe» es un barrio de Bosa y
          de Los Mártires; «Sumapaz», de Kennedy y de Ciudad Bolívar): una de
          esas, al lado de un trozo que no dice nada, puede ser el barrio
          (revisión del 15-nov: «Sumapaz, Torre 3» caía en el páramo). Con
          «Localidad de…», o con otro trozo que SÍ dice algo, es la
          localidad, sola: ese trozo la confirma («Las Cruces, Santa Fe») o no
          casa («La Esperanza, San Cristóbal»: ensanchada y cruzada, caía en
          Usaquén, que tiene un barrio «San Cristóbal»; tercera vuelta). Dos
          trozos así tienen que casar en una de las dos: «Santa Fe
          (Mártires)» es el barrio Santa Fe de Los Mártires; «Kennedy /
          Bosa» no casa, y «Santa Fe, Antonio Nariño» tampoco, aunque los
          dos nombres sean barrios de Bosa: eso sería una TERCERA que no
          escribió. Y los otros trozos cuentan como cualquier cosa escrita:
          un barrio de la lista la estrecha («Lisboa, Suba»: Lisboa está en
          Suba y en Usaquén) o le lleva la contraria («Patio Bonito, Bosa»:
          Patio Bonito es de Kennedy, y es lo mismo que escribir Bosa en
          «Ciudad» y Patio Bonito en «Barrio»: no casa). Hasta antes de
          publicarse, la localidad escrita ganaba.
       c) Entero, con la localidad pegada (localidadesDeTexto).
       d) Si entero no dice nada, trozo por trozo («Patio Bonito / Tintal»).
          En una dirección, los trozos solo valen por la lista: el guion de
          «Cll 139 # 94-20 Suba» no puede dejar un «20 Suba» que diga Suba. */
  function localidadesDeBarrio(idxB, barrio) {
    var llavesEntero = llavesBarrio(sinBogota(barrio));
    var entero = NO_DICEN_BARRIO[llavesEntero[0]] || colgadoDeBogota(barrio) ? [] : deLlaves(idxB, llavesEntero);
    var trozos = trocear(barrio), exactos = [], otros = [], r = [];
    if (trozos.length > 1) {
      trozos.forEach(function (t) {
        var n = localidadExacta(idxB, t);
        if (n) exactos.push({ n: n, c: idxB.porNombre[n], dijo: /^(localidad|loc)( de)? /.test(sinBogota(t)) });
        else otros.push(t);
      });
    }
    if (entero.length) {
      var estrecho = entero;
      exactos.forEach(function (e) { estrecho = cruzar(estrecho, deNombre(idxB, e.n)); });
      return [estrecho.length ? estrecho : entero];
    }
    if (exactos.length) {
      var deOtros = [];
      otros.forEach(function (t) { (localidadesDeTexto(idxB, t) || []).forEach(function (c) { deOtros.push(c); }); });
      if (exactos.length > 1) {
        var todos = exactos.map(function (e) { return deNombre(idxB, e.n); }), x = todos[0];
        todos.slice(1).forEach(function (t) { x = cruzar(x, t); });
        if (exactos.some(function (e) { return x.indexOf(e.c) >= 0; })) todos.forEach(function (t) { r.push(t); });
        else exactos.forEach(function (e) { r.push([e.c]); });
      } else {
        var e = exactos[0];
        r.push(e.dijo || deOtros.length ? [e.c] : sumar([e.c], deNombre(idxB, e.n)));
      }
      deOtros.forEach(function (c) { r.push(c); });
      return r;
    }
    var dichas = localidadesDeTexto(idxB, barrio);
    if (dichas) return dichas;
    var deCalle = traeVia(llavesBarrio(sinBogota(barrio))[0]);
    trozos.forEach(function (t) { (localidadesDeTexto(idxB, t, deCalle) || []).forEach(function (c) { r.push(c); }); });
    return r;
  }

  /* EL ÚLTIMO CANDADO (tercera vuelta del 15-nov): las localidades que el
     cliente escribió con su nombre. Si escribió alguna, ubicarlo en OTRA es
     escoger por él, y tres revisiones seguidas encontraron caminos distintos
     para llegar ahí (un barrio que se llama como la localidad, los que
     empiezan igual, una cola detrás). Este candado los cierra a todos: no
     casa. Cuenta «Ciudad», el trozo de «Barrio» que ES una localidad, y la
     que va pegada al principio o al final de un trozo mientras ese trozo (o
     lo que queda al quitarle la cola) no sea un nombre de la lista: «San
     Cristóbal Norte» es un barrio de Usaquén, y «Altos de Suba», uno de
     Suba. En una dirección o en lo que dice cerca de dónde no se mira, como
     en localidadesDeTexto. */
  function localidadesEscritas(idxB, textoCiudad, barrio) {
    var r = [];
    localidadesDeCiudad(idxB, textoCiudad).forEach(function (c) { sumar(r, c); });
    if (!barrio || deLlaves(idxB, llavesBarrio(sinBogota(barrio))).length) return r;
    trocear(barrio).forEach(function (t) {
      var n = localidadExacta(idxB, t);
      if (n) { sumar(r, [idxB.porNombre[n]]); return; }
      var ks = llavesBarrio(sinBogota(t));
      for (var i = 0; i < ks.length; i++) {
        if (traeVia(ks[i]) || cerca(ks[i]) || deNombre(idxB, ks[i]).length) break;
        pegadas(idxB, ks[i]).forEach(function (loc) { if (loc) sumar(r, [idxB.porNombre[loc]]); });
      }
    });
    return r;
  }

  /* EL BARRIO NOMBRA OTRO MUNICIPIO: «Soacha - Compartir», «Chía - 20 de
     Julio», «Mosquera, Villa Nueva». La ciudad dice Bogotá, pero el barrio
     dice otra cosa, y su otro trozo casaba con un barrio de Bogotá del mismo
     nombre (hay un Compartir en Ciudad Bolívar). Un trozo que no es una
     localidad ni un barrio de la lista y que `idx` (el buscador de
     municipios) da por otro municipio deja al cliente sin localidad, con ese
     motivo. Un trozo que sí es un barrio de la lista no se mira: «Marsella»,
     «Madrid» y «Venecia» son barrios de Bogotá y municipios. «Colombia»
     tampoco: es el país.
     Con `contra` (lo que dice el barrio, para cuando el texto es «Ciudad» o
     la ciudad del registro), el trozo que es un barrio de la lista solo se
     salta si el barrio escrito casa con él: «Bogotá - Madrid» + «Madrid» es
     el barrio Madrid, de Rafael Uribe Uribe; «Bogotá - Madrid» + «Compartir»
     nombra el municipio, y «Compartir» caía en Ciudad Bolívar (quinta
     vuelta del 15-nov). Es una función, para no leer el barrio si no hace
     falta. Y el departamento pegado al final se quita, como en ubicar:
     «Soacha Cundinamarca» es Soacha, y «Ciudad Bolívar Antioquia» es el de
     Antioquia. Si el departamento no es el suyo («Soacha Boyacá»), el
     municipio sigue siendo ese: no es Bogotá; salvo que se llame como una
     localidad: «Candelaria Boyacá» es La Candelaria y el barrio Boyacá.
     Con un departamento que no es el suyo, el nombre que es también un
     barrio de aquí sigue la regla del barrio: «Restrepo Santander» +
     «Policarpa» es el barrio Restrepo, de Antonio Nariño, no el Restrepo del
     Meta (sexta vuelta del 15-nov: la quinta lo volvía otro municipio).
     Y la dirección pegada se quita, delante o detrás, y el país detrás: «Casa
     5 Soacha», «Soacha casa 5», «Mz 4 Lt 12 Mosquera», «Soacha
     Cundinamarca Colombia» nombran Soacha y Mosquera, y el cliente caía en
     Ciudad Bolívar o en Kennedy (sexta vuelta). Lo que queda no se mira si
     es una localidad («Casa 3 Candelaria») o el país («Colombia torre 2»
     no es el municipio del Huila), y si es un barrio de la lista sigue la
     regla del barrio: «Madrid casa 5» y «Cabrera Colombia» (Cabrera es de
     Chapinero) siguen siendo el barrio.
     Devuelve { nombre, barrio } (barrio: si el trozo es también un barrio
     de aquí), o null. */
  function municipioAjeno(idxB, idx, barrio, contra) {
    var trozos = trocear(barrio), dice;
    /* ¿Lo que dice el barrio deja que este nombre sea el barrio de aquí? */
    var esElBarrio = function (d) {
      if (!d.length) return false;
      if (dice === undefined) dice = contra ? contra() : [];
      return !dice.length || cruzar(d, dice).length > 0;
    };
    var deTexto = function (v) {
      var c = candidatos(idx, v), ps = v.split(' ');
      for (var q = ps.length - 1; !c.length && q >= 1; q--) {
        var dq = idx.deptos[ps.slice(q).join(' ')];
        if (!dq) continue;
        var base = ps.slice(0, q).join(' '), cq = candidatos(idx, base);
        c = cq.filter(function (x) { return enDepto(x, dq); });
        /* «Colombia Bogotá» en «Ciudad» es el país y la ciudad, como
           «Colombia - Bogotá», y no Colombia, el municipio del Huila (venía
           de v150; lo encontró la tercera revisión del 16-nov). */
        if (!c.length && base !== 'colombia' && !localidadExacta(idxB, base) && !esElBarrio(deLlaves(idxB, llavesBarrio(sinBogota(base))))) c = cq;
      }
      return c;
    };
    for (var i = 0; i < trozos.length; i++) {
      var t = trozos[i], n = normalizar(t);
      if (!n || n === 'colombia' || localidadExacta(idxB, t)) continue;
      var dB = deLlaves(idxB, llavesBarrio(sinBogota(t)));
      if (esElBarrio(dB)) continue;
      var c = deTexto(n), sd = sinDireccionNiPais(n);
      if (!c.length && sd !== n && sd !== 'colombia' && !localidadExacta(idxB, sd) &&
        !esElBarrio(deLlaves(idxB, llavesBarrio(sinBogota(sd))))) c = deTexto(sd);
      if (c.length && c.indexOf(idxB.municipio) < 0) return { nombre: (idx.nombre && idx.nombre[c[0]]) || t, barrio: dB.length > 0 };
    }
    /* LA SEGUNDA MIRADA (v152): si ningún trozo nombra un municipio entero,
       el municipio al PRINCIPIO de un trozo, con algo más detrás: «Soacha
       Ciudad Verde, Compartir» o «Bogotá - Soacha sur» (ver
       municipioAlPrincipio). Va después de todo lo de arriba para que lo que
       v151 ya leía no cambie. Y no se lee:
       · si el texto nombra una localidad en cualquier parte: «Soacha sur,
         Bosa», «Soacha sur, Kennedy 8», «Funza trabajo, vivo en Kennedy»
         dicen la localidad, y no se escoge (lo escrito aparte manda; ver
         nombraLocalidad);
       · en un trozo de más de 12 palabras: eso ya no es «municipio y
         barrio», es una frase (y la cuenta de abajo crecía con el cubo del
         largo: 400 palabras eran 3 segundos por ficha, en cada repintado);
       · si dos trozos leen municipios distintos: no se sabe cuál.
       La localidad se busca al final, solo si algo se leyó: casi ningún
       texto llega ahí, y buscarla en todos hacía el barrido de 622.350
       textos un 15 % más lento (66 s contra 56 de v151; así, 56). */
    var leidos = [];
    for (var j = 0; j < trozos.length; j++) {
      var nj = sinDireccionNiPais(normalizar(trozos[j]));
      if (!nj || nj === 'colombia' || nj.split(' ').length > 12) continue;
      var lj = municipioAlPrincipio(idxB, idx, nj, esElBarrio);
      if (lj) leidos.push(lj);
    }
    if (!leidos.length || leidos.some(function (l) { return l.codigos.join() !== leidos[0].codigos.join(); }) ||
      nombraLocalidad(idxB, barrio)) return null;
    return { nombre: (idx.nombre && idx.nombre[leidos[0].codigos[0]]) || leidos[0].p, alPrincipio: true,
      barrio: deLlaves(idxB, llavesBarrio(leidos[0].p)).length > 0 };
  }
  /* EL MUNICIPIO AL PRINCIPIO de un texto ya normalizado («soacha ciudad
     verde», «soacha sur», «mosquera centro»), con algo más detrás que no
     es otro sitio. De más largo a más corto, y el primer nombre de
     municipio que aparece decide: si no vale, no se lee nada (no se prueba
     uno más corto: «San Mateo» no se vuelve «San»). Vale solo si:
     · es de CUNDINAMARCA. Quien escribió «Bogotá» y vive en otro municipio
       vive casi siempre en uno que la rodea, y los conjuntos de Bogotá se
       llaman como ciudades de otras partes («Toledo», «Málaga»): fuera de
       Cundinamarca la lectura adivinaba. Ninguna localidad es de allá
       («Ciudad Bolívar» y «Santa Fe» son de Antioquia, «Candelaria» del
       Atlántico y del Valle), ni «El Paso», de «El Paso Ancho» (Cesar);
     · no es un barrio de aquí que el barrio escrito deja ser (la regla de
       esElBarrio), ni un PEDAZO de un nombre de la lista (ver pedazos en
       indiceBogota): «Madrid» es el principio de «Madrid II», «Cota» el
       final de «El Horizonte Vía a Cota Salitre», «Nariño» el de «Antonio
       Nariño». Así se quedan como en v151 20 de los 116 municipios de
       Cundinamarca (medido el 17-nov);
     · lo de detrás PARECE UN NOMBRE DE SITIO (ver pareceNombre): «Ciudad
       Verde», «sur», «León XIII» sí; «y Bosa», «al ladito», «ya no», «a 10
       min», «trabajo» no;
     · y lo de detrás no nombra OTRO municipio en ninguna parte: «San Mateo
       Soacha», «Soacha San Mateo», «Soacha Mosquera». Un municipio en cada
       punta no se escoge. (La localidad, en cualquier parte, la mira antes
       municipioAjeno.)
     Lo que queda fuera se queda como en v151 (por ejemplo «Calle 5 # 3-20
     Soacha Ciudad Verde», con la dirección delante, o «Cundinamarca Soacha
     Ciudad Verde»). La lectura al FINAL del texto («Compartir Soacha») no
     se hace: la tercera revisión del 16-nov encontró que depende de listas
     de palabras que nunca acaban («Portal de Toledo», «cerquita a Soacha»,
     «trabajando en Funza»). Devuelve { codigos, p } o null. */
  function municipioAlPrincipio(idxB, idx, n, esElBarrio) {
    var t = n.split(' '), cund = idx.deptos.cundinamarca;
    if (!cund) return null;
    for (var k = t.length - 1; k >= 1; k--) {
      var p = t.slice(0, k).join(' '), c = propio(idx.porNombre, p);
      if (!c || !c.length) continue;
      var resto = t.slice(k);
      if (idxB.pedazos[p] || esElBarrio(deLlaves(idxB, llavesBarrio(p)))) return null;
      c = c.filter(function (x) { return x.slice(0, 2) === cund; });
      if (!c.length || !pareceNombre(resto)) return null;
      for (var i = 0; i < resto.length; i++) {
        for (var e = i + 1; e <= resto.length; e++) {
          var cv = propio(idx.porNombre, resto.slice(i, e).join(' '));
          if (cv && !cruzar(cv, c).length) return null;
        }
      }
      return { codigos: c, p: p };
    }
    return null;
  }
  /* Lo que una tabla trae de suyo, no lo que hereda: «constructor» o
     «toString» escritos en un barrio no son el nombre de un municipio
     (idx.porNombre es un objeto corriente; lo vio la revisión del 17-nov). */
  function propio(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  function conjunto(palabras) {
    var o = Object.create(null);
    palabras.split(' ').forEach(function (w) { o[w] = 1; });
    return o;
  }
  /* ¿PARECE UN NOMBRE DE SITIO lo que va detrás del municipio? No, si trae:
     · una palabra GRAMATICAL: preposiciones (menos «de» y «del», que van en
       los nombres: «Bosques de San Mateo»), conjunciones, pronombres y
       posesivos, «no», «ya», «ahora»... Es una lista CERRADA: el idioma no
       tiene más. Y frena casi todo lo que la tercera revisión del 16-nov
       encontró en la lectura al final: «Soacha, cerquita a Bosa» se frena
       por el «a», sin saber qué es «cerquita». «y», «x», «con», «o» juntan
       dos sitios: «Soacha y Bosa» es un cruce o una duda;
     · un verbo de vivir, trabajar o estudiar, o «era» y «fue»: «Soacha ya
       no vivo», «Mosquera trabajo»;
     · una distancia («10 min», «2 cuadras», «200 mts»);
     · una cercanía (CERCANIAS), también en diminutivo: «cerquita»,
       «cerquitica», «ladito», «pegadito», «juntico», «frentecito».
     «El», «la», «los» y «las» sí valen: «Soacha La Despensa». Lo encontró
     la revisión del 17-nov: «Bosa San Bernardino (Soacha al ladito)»,
     «Soacha ya no, Patio Bonito» y «Patio Bonito (Mosquera a 10 min)»
     salían de Bogotá. */
  var NO_ES_NOMBRE = conjunto('a al ante con contra desde en hacia hasta para pa pal por sin sobre tras segun ' +
    'y e o u x ni pero que porque aunque pues ' +
    'yo mi mis tu tus su sus me te se le les nos ella ellas ellos usted ' +
    'no ya si tambien tampoco ahora antes despues luego aqui aca alla alli ahi lejos muy mas casi ' +
    'vivo vive viven vivia vivimos vivi trabajo trabaja trabajan trabajando laboro labora estudio estudia ' +
    'queda quedo naci nacio era fue soy es esta ' +
    'min mins minuto minutos cuadra cuadras metro metros mts hora horas');
  function pareceNombre(palabras) {
    return !palabras.some(function (w) {
      if (NO_ES_NOMBRE[w] || propio(CERCANIAS, w)) return true;
      var m = /^(.+?)(it|ic|itic|cit)[oa]$/.exec(w), base = m ? m[1].replace(/qu$/, 'c') : '';
      return !!base && [base, base + 'o', base + 'a'].some(function (x) { return !!propio(CERCANIAS, x); });
    });
  }
  /* ¿El texto nombra una localidad en alguna parte? «Kennedy 8», «Localidad
     7 Bosa», «vivo en Bosa», «Bosa Recreo», «Chapinero rural»: tramos de
     hasta tres palabras de cada trozo («Rafael Uribe Uribe» es el nombre
     más largo). La revisión del 17-nov: el candado solo miraba la localidad
     exacta, y «Soacha sur, Kennedy 8» salía de Kennedy. */
  function nombraLocalidad(idxB, texto) {
    var t = trocear(texto);
    for (var i = 0; i < t.length; i++) {
      var w = normalizar(t[i]).split(' ');
      for (var a = 0; a < w.length; a++) {
        for (var b = a + 1; b <= Math.min(w.length, a + 3); b++) if (localidadExacta(idxB, w.slice(a, b).join(' '))) return true;
      }
    }
    return false;
  }
  /* Un texto ya normalizado sin la dirección pegada, delante («casa 5
     soacha», «mz 4 lt 12 mosquera») o detrás («soacha casa 5», «chia calle
     5»), ni el país detrás. Solo eso: la cola de un nombre («II»,
     «sector») se queda, y lo que es una sola palabra también. */
  function sinDireccionNiPais(n) {
    var t = n.split(' ');
    while (t.length > 2 && (NOMENCLATURA[t[0]] || t[0] === 'casa' || t[0] === 'torre') && (CIFRA.test(t[1]) || /^[a-z]$/.test(t[1]))) t.splice(0, 2);
    while (t.length > 1) {
      var w = t[t.length - 1];
      if (!(w === 'colombia' || CIFRA.test(w) || /^[a-z]$/.test(w) || VIAS[w] || NOMENCLATURA[w] || CONECTORES[w])) break;
      t.pop();
      if (t.length >= 2 && (t[t.length - 1] === 'casa' || t[t.length - 1] === 'torre') && ARTICULOS.indexOf(t[t.length - 2]) < 0) t.pop();
    }
    return t.join(' ');
  }
  /* Todas las localidades que dice un barrio, juntas (para `contra`). */
  function loQueDiceBarrio(idxB, barrio) {
    var u = [];
    if (barrio) localidadesDeBarrio(idxB, barrio).forEach(function (c) { sumar(u, c); });
    return u;
  }

  /* DE «Ciudad» Y «Barrio», LA LOCALIDAD. Cada cosa que el cliente escribió y
     se reconoce da un conjunto de localidades posibles; la respuesta es lo
     que queda al cruzarlos todos. Una sola: ubicado. Varias: repetido.
     Ninguna: lo escrito no casa. Nada reconocido: no es un barrio (o no hay).
     `idx`, el buscador de municipios, es opcional: con él, un barrio que
     nombra otro municipio no se busca en Bogotá (ver municipioAjeno). */
  function localidadDe(textoCiudad, textoBarrio, idxB, idx, otrosDichos, ciudadDelRegistro) {
    var barrio = String(textoBarrio == null ? '' : textoBarrio).trim();
    var ajeno = barrio && idx ? municipioAjeno(idxB, idx, barrio) : null;
    /* Leído solo al principio del barrio (v152), «Ciudad» manda: si nombra
       una localidad en alguna parte («Bogotá - Kennedy», «Kennedy 8») o su
       propio municipio, lo del barrio no se escoge (con el municipio de
       «Ciudad» decide el de abajo; con la localidad, lo de v151). Lo
       escrito aparte no se pisa. Con el barrio del registro, su ciudad
       también («Bogotá - Kennedy 8» + «Mosquera centro»): se lee con la de
       la ficha cuando la del registro no es exactamente una localidad (ver
       localidadDeCliente), y sin esto la localidad del registro no la veía
       nadie. */
    if (ajeno && ajeno.alPrincipio && (nombraLocalidad(idxB, textoCiudad) || nombraLocalidad(idxB, ciudadDelRegistro) ||
      municipioAjeno(idxB, idx, textoCiudad, function () { return loQueDiceBarrio(idxB, barrio); }))) ajeno = null;
    if (ajeno) return { estado: 'otro-municipio', municipio: ajeno.nombre, texto: barrio, motivo: 'el barrio nombra otro municipio' };
    /* «Bogotá - Soacha» en «Ciudad»: el buscador de municipios toma el
       primer trozo y lo pone en Bogotá, pero el texto nombra también Soacha,
       y «Compartir» es el barrio de Soacha, no el de Ciudad Bolívar (cuarta
       vuelta del 15-nov). Es lo mismo que «Soacha - Compartir» en «Barrio».
       «Bogotá, Cundinamarca», «Bogotá, Colombia» y «Bogotá - Kennedy» no
       nombran otro municipio. */
    var ajenoC = idx ? municipioAjeno(idxB, idx, textoCiudad, function () { return loQueDiceBarrio(idxB, barrio); }) : null;
    /* Y al revés: leído solo al principio de «Ciudad» («Bogotá - Soacha
       sur»), un barrio que nombra una localidad («Bosa», «Piamonte, Bosa»)
       manda. */
    if (ajenoC && ajenoC.alPrincipio && barrio && nombraLocalidad(idxB, barrio)) ajenoC = null;
    if (ajenoC) {
      return { estado: 'otro-municipio', municipio: ajenoC.nombre, en: 'ciudad', tambienBarrio: ajenoC.barrio, texto: barrio,
        motivo: 'la ciudad nombra también otro municipio' };
    }
    var conjuntos = localidadesDeCiudad(idxB, textoCiudad);
    var deCiudad = conjuntos.length;
    if (barrio) localidadesDeBarrio(idxB, barrio).forEach(function (c) { conjuntos.push(c); });
    (otrosDichos || []).forEach(function (c) { conjuntos.push(c); });
    if (!conjuntos.length) {
      return barrio ? { estado: 'desconocido', texto: barrio, motivo: 'no reconozco ese barrio' }
        : { estado: 'vacio', texto: '', motivo: 'sin barrio' };
    }
    var r = conjuntos[0].slice(), todas = [];
    conjuntos.forEach(function (c, i) { sumar(todas, c); if (i) r = cruzar(r, c); });
    if (r.length === 1) {
      var escritas = localidadesEscritas(idxB, textoCiudad, barrio);
      if (escritas.length && escritas.indexOf(r[0]) < 0) {
        return { estado: 'choque', opciones: sumar(escritas.slice(), r), texto: barrio, motivo: 'lo escrito apunta a localidades distintas' };
      }
      return { estado: 'ubicado', codigo: r[0], texto: barrio,
        via: conjuntos.length === deCiudad ? 'ciudad' : deCiudad ? 'ciudad y barrio' : 'barrio' };
    }
    if (r.length > 1) {
      var h = homonimaEscrita(idxB, localidadesEscritas(idxB, textoCiudad, barrio), r);
      if (h) return { estado: 'ambiguo', opciones: r, texto: barrio, homonima: h.codigo, homonimaEn: h.en, motivo: 'la localidad escrita es también un barrio de otra' };
      return { estado: 'ambiguo', opciones: r, texto: barrio, motivo: 'ese barrio está en varias localidades' };
    }
    return { estado: 'choque', opciones: todas, texto: barrio, motivo: 'lo escrito apunta a localidades distintas' };
  }
  /* La localidad que el cliente escribió y que también es un barrio de OTRA
     de las opciones: «Centro histórico, La Candelaria» (La Candelaria es
     también un barrio de Suba), «Torre 3, Rafael Uribe». La duda no es del
     barrio, es del nombre de la localidad, y la pestaña lo dice así (cuarta
     vuelta del 15-nov: decía «ese barrio está en varias localidades» y
     aconsejaba escribir la localidad al lado, que ya estaba). Devuelve
     { codigo, en: [las otras] } o null. */
  function homonimaEscrita(idxB, escritas, opciones) {
    for (var i = 0; i < escritas.length; i++) {
      var c = escritas[i], en = [];
      if (opciones.indexOf(c) < 0) continue;
      Object.keys(idxB.porNombre).forEach(function (k) {
        if (idxB.porNombre[k] !== c) return;
        deNombre(idxB, k).forEach(function (o) { if (o !== c && opciones.indexOf(o) >= 0 && en.indexOf(o) < 0) en.push(o); });
      });
      if (en.length) return { codigo: c, en: en };
    }
    return null;
  }
  /* De una ficha: la ciudad y el barrio de la ficha (los que Joan pudo
     corregir) y, si están vacíos, los del registro. Nada más. */
  function localidadDeCliente(s, idxB, idx) {
    var x = s || {};
    var v = (x.vinculacion && typeof x.vinculacion === 'object') ? x.vinculacion : {};
    var deFicha = String(x.ciudad || '').trim(), deRegistro = String(v.ciudad || '').trim();
    var ciudad = deFicha || deRegistro;
    var barrio = String(x.barrio || '').trim();
    /* El barrio del registro se escribió para la ciudad del registro. Si la
       ficha dice Bogotá y el registro Soacha, «Compartir» es el de Soacha, no
       el de Ciudad Bolívar: no se usa. Se usa solo si algo prueba que es de
       aquí (ver leerRegistro), y se lee con la ciudad del registro si esa
       dice una localidad y la de la ficha no: registro «Suba» + «Patio
       Bonito» no es Kennedy, no casa, aunque la ficha diga «Bogotá». */
    if (!barrio && String(v.barrio || '').trim()) {
      var leido = leerRegistro(deFicha, deRegistro, String(v.departamento || '').trim(), idxB, idx, String(v.barrio || '').trim());
      if (!leido) return Object.assign(localidadDe(ciudad, '', idxB, idx), { registro: deRegistro });
      barrio = String(v.barrio || '').trim();
      if (deFicha && !localidadesDeCiudad(idxB, deFicha).length && localidadesDeCiudad(idxB, deRegistro).length) ciudad = deRegistro;
      return localidadDe(ciudad, barrio, idxB, idx, leido.dichos, deRegistro);
    }
    return localidadDe(ciudad, barrio, idxB, idx);
  }
  /* ¿El barrio del registro es de aquí? Solo si algo lo prueba: la ciudad
     del registro es la de la ficha, o Bogotá, o una localidad, o el
     buscador de municipios la da por Bogotá, o es una errata de «Bogotá»
     («Bogtá», revisión del 15-nov), o es un barrio de la lista («Engativá
     Pueblo»), que entonces cuenta como una cosa dicha más («Engativá
     Pueblo» + «Compartir» no casa). Lo que el buscador da por otro
     municipio se tira, aunque además se llame como una localidad o como un
     barrio de aquí: «Candelaria, Valle» y «Ciudad Bolívar, Antioquia» son
     de allá (tercera vuelta: prestaban su barrio a La Candelaria y a Ciudad
     Bolívar). «Candelaria» a secas, que son dos municipios y una
     localidad, se queda como localidad. Y lo que no reconoce también se
     tira: no reconocerlo no prueba que sea Bogotá (tercera vuelta: «Soacha
     Ciudad Verde» + «Compartir» caía en Ciudad Bolívar). Un departamento
     se tira primero, aunque se llame como un barrio de aquí: «Santander»,
     «Quindío» y «Magdalena» son barrios de Bogotá, y prestaban el barrio
     de Bucaramanga (cuarta vuelta). Y lo que nombra también otro
     municipio, aunque empiece por Bogotá: «Bogotá - Soacha» es como
     «Soacha». Devuelve { dichos } si se usa, o null. */
  function leerRegistro(deFicha, deRegistro, depto, idxB, idx, barrioReg) {
    var si = { dichos: [] };
    if (!deFicha || !deRegistro || normalizar(deFicha) === normalizar(deRegistro) || !sinBogota(deRegistro)) return si;
    var dep = idx && idx.deptos[normalizar(deRegistro)];
    if (dep && dep !== String(idxB.municipio).slice(0, 2)) return null;
    var aj = idx && municipioAjeno(idxB, idx, deRegistro, function () { return loQueDiceBarrio(idxB, barrioReg); });
    /* Leído solo al principio («Bogotá - Soacha sur»), un barrio que nombra
       una localidad («Bosa», «Piamonte, Bosa») manda, como en la ficha (ver
       localidadDe). */
    if (aj && !(aj.alPrincipio && nombraLocalidad(idxB, barrioReg))) return null;
    var u = idx ? ubicar(deRegistro, depto, idx) : {}, cs = u.codigo ? [u.codigo] : (u.opciones || []);
    if (u.codigo && u.codigo !== idxB.municipio) return null;
    if (cs.indexOf(idxB.municipio) >= 0 || localidadesDeCiudad(idxB, deRegistro).length) return si;
    /* Sin el buscador de municipios, «Madrid» podría ser el barrio o el
       municipio, y «Bota» una errata de Bogotá o de Cota: no se sabe, y se
       tira. Lo mismo un nombre de varios municipios y ninguno Bogotá
       («Armenia»). */
    if (!idx || cs.length) return null;
    if (casiBogota(deRegistro, idx)) return si;
    var dichos = localidadesDeTexto(idxB, deRegistro);
    return dichos && dichos.length ? { dichos: dichos } : null;
  }
  /* «Bogtá», «Bogata», «Bogotaa», «Bogot D.C.», «Bogtoa»: a una letra de
     «bogota» (dos cambiadas de sitio cuentan como una). Se mira después
     del buscador de municipios: lo que ese reconoce no es una errata. A dos
     letras ya no: «Bonita» está a dos. Y tampoco cuenta si otro municipio
     queda igual de cerca: «Sogota» está a una de Bogotá y a una de Socotá.
     Eso no es una errata de Bogotá: es no saber, y se tira (tercera vuelta
     del 15-nov). */
  function casiBogota(texto, idx) {
    var n = normalizar(texto).replace(/\b(d ?c|distrito capital)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (n.length < 4 || n.indexOf(' ') >= 0 || distancia(n, 'bogota') > 1) return false;
    return !Object.keys(idx.porNombre).some(function (k) {
      return idx.porNombre[k].indexOf('11001') < 0 && Math.abs(k.length - n.length) <= 1 && distancia(n, k) <= 1;
    });
  }
  /* Letras de más, de menos, cambiadas, y dos vecinas trocadas, cada cosa
     un paso. */
  function distancia(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  /* «1–2» en vez de 1 o 2: con tan pocos, la cifra exacta dice quién es. */
  function cifraDiscreta(n) {
    var k = Number(n) || 0;
    if (k === 1 || k === 2) return '1–2';
    return k.toLocaleString('es-CO');
  }

  return {
    normalizar: normalizar,
    indice: indice,
    ubicar: ubicar,
    lugarDeCliente: lugarDeCliente,
    cifraDiscreta: cifraDiscreta,
    DEPTOS_ALIAS: DEPTOS_ALIAS,
    /* Bogotá por dentro (14-nov-2026). llavesBarrio, sinBogota y VAGAS
       también las usa herramientas/mapa-bogota.js para armar la lista: las
       dos puntas hablan el mismo idioma. */
    indiceBogota: indiceBogota,
    localidadDe: localidadDe,
    localidadDeCliente: localidadDeCliente,
    llavesBarrio: llavesBarrio,
    sinBogota: sinBogota,
    VAGAS: VAGAS,
    esVaga: vaga
  };
});
