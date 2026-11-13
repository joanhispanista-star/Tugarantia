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
 * Puro: no lee ni escribe el localStorage, no toca el DOM. La lista de
 * municipios no vive aquí: la trae el mapa (panel/mapa/colombia-2026-11.json,
 * con los códigos DIVIPOLA del DANE), y indice() la convierte en un buscador.
 * ===========================================================================*/
/* La firma de llegada: el CRM pide este archivo con la versión en la dirección
   (…?v=143). Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de v139 en
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
       llega aquí: casó entero arriba). */
    if (/ colombia$/.test(t)) {
      r = ubicar(crudo.replace(/[\s,;\-–()]*colombia[\s)]*$/i, ''), textoDepto, idx);
      if (r.estado !== 'desconocido') return Object.assign(r, { texto: crudo });
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
    DEPTOS_ALIAS: DEPTOS_ALIAS
  };
});
