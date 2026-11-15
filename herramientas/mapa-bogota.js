#!/usr/bin/env node
/* ===========================================================================
 * MAPA-BOGOTA — arma panel/mapa/bogota-2026-11.json: Bogotá por dentro, para
 * la pestaña «🗺️ Mapa» del CRM (panel/mapa-clientes.js).
 * 14 de noviembre de 2026.
 *
 *   node herramientas/mapa-bogota.js \
 *     --localidades <loca.json>                 (Planeación: las 20 localidades)
 *     --sectores    <SECTOR.geojson>            (Catastro: los sectores catastrales)
 *     --barrios     <barriolegalizado.json>     (Planeación: los barrios legalizados)
 *     --formas      <geoBoundaries-COL-ADM2_simplified.geojson>
 *     [--mapa panel/mapa/colombia-2026-11b.json] [--salida panel/mapa/bogota-2026-11.json]
 *
 * Joan, el 14-nov: «mejorar el mapa del crm que se vea mucho más detallado».
 * Escogió, con los bocetos delante, Bogotá y la Sabana por localidades con las
 * calles de OpenStreetMap debajo. Este guion arma lo que esa vista necesita y
 * el mapa de Colombia no trae:
 *
 *   1. LAS 20 LOCALIDADES, con su forma y el punto donde va su nombre
 *      (Sumapaz, sin forma: cae fuera de la ventana), y el CONTORNO de la
 *      ciudad: la unión de las 19 que se ven.
 *   2. LOS VECINOS: los municipios de la Sabana que caben en la ventana, con
 *      su borde FINO. En el mapa de Colombia van redondeados a 231 m, que a
 *      escala de país no se nota; con las calles debajo, sí: el borde de
 *      Soacha cortaba las manzanas en línea recta.
 *   3. LA LISTA DE BARRIOS: de cada nombre de barrio, en qué localidad (o
 *      localidades) está. Con ella, panel/mapa-lugares.js saca la localidad
 *      del «Barrio» que el cliente escribió. Los barrios NO se dibujan.
 *   4. LA PROYECCIÓN en números, para que la pestaña sepa qué teselas de
 *      calles pedir para la ventana que se está mirando.
 *
 * Las descargas NO viven en el repo (pesan 39 MB entre las cuatro y no son
 * nuestras): se pasan por argumento. De dónde salen, con qué licencia y qué
 * se les hizo está en panel/mapa/FUENTES.md.
 *
 * TODO VA EN LAS UNIDADES DEL MAPA DE COLOMBIA (herramientas/mapa-colombia.js:
 * plate carrée a 4° N, 480 unidades por grado). No se confía en que así sea:
 * la caja de Colombia se vuelve a calcular con las formas de geoBoundaries y
 * tiene que dar la del mapa publicado; y cada vecino se casa con su municipio
 * porque el punto del nombre de ese municipio, tomado del mapa publicado, cae
 * dentro de su forma fina. Si algo no casa, el guion termina con error.
 *
 * Y NO SE ADIVINA, tampoco aquí: un nombre de barrio que está en dos
 * localidades («Lisboa», en Suba y en Usaquén) se guarda con las dos, y
 * mapa-lugares.js no escoge.
 *
 * Sin librerías.
 * ===========================================================================*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const G = require('./mapa-colombia.js');
const L = require('../panel/mapa-lugares.js');

/* ------------------------------------------------------------ lo que se decide aquí */
/* LA VENTANA: la ciudad y su primer anillo, de Madrid a La Calera y de Chía a
   Sibaté (42 por 60 km). Es la del boceto que Joan escogió el 14-nov. Con casi
   la proporción del mapa de Colombia, para que la pestaña no cambie de tamaño
   al entrar. NO hay una ventana más grande detrás para recorrer: la vista abre
   entera, y así en el celular el dedo sigue bajando la página (un mapa que
   abre ya ampliado se queda con el dedo). Lo que queda fuera se ve en su
   departamento. Sumapaz, que es páramo y empieza 7 km al sur del borde, no
   tiene forma aquí: va con su nombre y su cifra en una línea aparte. */
const CAJA = [2282, 3664, 182, 258.4];
/* LO MÁS CERCA: una ventana de 6 unidades (1,4 km). Ahí una calle se lee. */
const ANCHO_MINIMO = 6;
/* LAS LOCALIDADES se simplifican a 0,05 unidades (12 m) y se guardan con dos
   decimales: en la ventana más chica eso son 4 píxeles. Planeación trae La
   Candelaria con 13.201 puntos; quedan unos pocos cientos.
   LOS VECINOS, a 0,1 (23 m) y un decimal: geoBoundaries ya viene simplificado
   y no da para más. */
const TOLERANCIA_LOCALIDADES = 0.05, DECIMALES_LOCALIDADES = 2;
const TOLERANCIA_VECINOS = 0.1, DECIMALES_VECINOS = 1;
/* Un vecino lleva nombre si en la ventana le cabe un círculo de este radio. */
const RADIO_PARA_NOMBRE = 2.5;

/* Los nombres con sus tildes: Planeación los trae en mayúscula y sin ellas. */
const NOMBRES = { '01': 'Usaquén', '02': 'Chapinero', '03': 'Santa Fe', '04': 'San Cristóbal', '05': 'Usme', '06': 'Tunjuelito',
  '07': 'Bosa', '08': 'Kennedy', '09': 'Fontibón', '10': 'Engativá', '11': 'Suba', '12': 'Barrios Unidos', '13': 'Teusaquillo',
  '14': 'Los Mártires', '15': 'Antonio Nariño', '16': 'Puente Aranda', '17': 'La Candelaria', '18': 'Rafael Uribe Uribe',
  '19': 'Ciudad Bolívar', '20': 'Sumapaz' };
const MUNICIPIO = '11001';

/* ------------------------------------------------------------ geometría */
function dentro(anillos, x, y) {
  let d = false;
  for (const r of anillos) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}
function cajaDeAnillos(anillos) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  anillos.forEach(r => r.forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }));
  return b;
}
/* Un anillo recortado a un rectángulo [x0, y0, x1, y1] (Sutherland-Hodgman).
   Sirve para buscar dónde va el nombre de una zona que la ventana corta. */
function recortar(anillo, c) {
  const lados = [
    [p => p[0] >= c[0], (a, b) => [c[0], a[1] + (b[1] - a[1]) * (c[0] - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= c[2], (a, b) => [c[2], a[1] + (b[1] - a[1]) * (c[2] - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= c[1], (a, b) => [a[0] + (b[0] - a[0]) * (c[1] - a[1]) / (b[1] - a[1]), c[1]]],
    [p => p[1] <= c[3], (a, b) => [a[0] + (b[0] - a[0]) * (c[3] - a[1]) / (b[1] - a[1]), c[3]]]
  ];
  let pts = anillo;
  for (const [esta, corte] of lados) {
    const r = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (esta(a)) { r.push(a); if (!esta(b)) r.push(corte(a, b)); } else if (esta(b)) r.push(corte(a, b));
    }
    pts = r;
    if (pts.length < 3) return [];
  }
  return pts;
}
/* Dónde va el nombre: el polo de inaccesibilidad de lo que la ventana deja
   ver de la zona. null si no se ve o no cabe. */
function puntoDelNombre(anillos, caja, radio) {
  const c = [caja[0], caja[1], caja[0] + caja[2], caja[1] + caja[3]];
  const vistos = anillos.map(r => recortar(r, c)).filter(r => r.length >= 3);
  if (!vistos.length) return null;
  const polo = G.poloDeInaccesibilidad(vistos, 0.2);
  if (!(polo.d >= (radio || 0))) return null;
  return [Math.round(polo.x * 10) / 10, Math.round(polo.y * 10) / 10];
}

/* LA PROYECCIÓN del mapa de Colombia, vuelta a calcular con sus mismas formas
   (la caja de tierra firme: sin San Andrés y Providencia, que van en un
   recuadro). Tiene que dar la caja del mapa publicado. */
function proyeccion(formasGeo, cajaPublicada) {
  let lonMin = Infinity, latMax = -Infinity, lonMax = -Infinity, latMin = Infinity;
  const recorrer = (c, f) => { if (typeof c[0] === 'number') f(c); else c.forEach(x => recorrer(x, f)); };
  formasGeo.forEach(ft => {
    let isla = true;
    recorrer(ft.geometry.coordinates, p => { if (p[0] > -80.5) isla = false; });
    if (isla) return;   // el archipiélago: todo al oeste de 80,5° O
    recorrer(ft.geometry.coordinates, ([lon, lat]) => {
      lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon); latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    });
  });
  const ancho = Math.ceil((lonMax - lonMin) * G.COS * G.ESCALA) + 2 * G.MARGEN;
  const alto = Math.ceil((latMax - latMin) * G.ESCALA) + 2 * G.MARGEN;
  if (cajaPublicada && (ancho !== cajaPublicada[0] || alto !== cajaPublicada[1])) {
    throw new Error('la proyección no casa con la del mapa publicado: aquí da ' + ancho + '×' + alto + ' y el mapa dice ' + cajaPublicada.join('×'));
  }
  /* x = m + (grados al este − ox) · kx;  y = m + (oy − grados al norte) · ky */
  return { ox: lonMin, oy: latMax, kx: G.COS * G.ESCALA, ky: G.ESCALA, m: G.MARGEN };
}
const aX = (P, lon) => P.m + (lon - P.ox) * P.kx;
const aY = (P, lat) => P.m + (P.oy - lat) * P.ky;

/* DE UNAS FORMAS, SUS CAMINOS. La topología (cada borde compartido, una sola
   vez) es la de mapa-colombia.js; cada borde se simplifica una vez y se
   redondea, y los dos vecinos lo usan igual: no quedan rendijas. Devuelve, por
   forma, sus anillos ya proyectados y su «d». */
function caminos(formas, P, tolerancia, decimales) {
  const topo = G.topologia(formas);
  const f = Math.pow(10, decimales), red = v => Math.round(v * f) / f;
  const px = topo.lon.map(lon => aX(P, lon)), py = topo.lat.map(lat => aY(P, lat));
  const arcos = topo.arcos.map(seq => {
    const xs = seq.map(p => px[p]), ys = seq.map(p => py[p]);
    let g;
    if (seq[0] === seq[seq.length - 1]) {
      /* Un borde cerrado (una isla, o un hueco como La Candelaria dentro de
         Santa Fe): se parte en su punto más lejano, y nunca queda en menos
         de cuatro puntos. */
      let k = 1, max = -1;
      for (let i = 1; i < seq.length - 1; i++) { const d = Math.hypot(xs[i] - xs[0], ys[i] - ys[0]); if (d > max) { max = d; k = i; } }
      g = new Uint8Array(seq.length);
      for (let t = tolerancia; ; t /= 2) {
        G.douglasPeucker(xs.slice(0, k + 1), ys.slice(0, k + 1), t).forEach((v, i) => { if (v) g[i] = 1; });
        G.douglasPeucker(xs.slice(k), ys.slice(k), t).forEach((v, i) => { if (v) g[k + i] = 1; });
        if (g.reduce((s, v) => s + v, 0) >= 4 || t < 0.001) break;
      }
    } else g = G.douglasPeucker(xs, ys, tolerancia);
    const r = [];
    seq.forEach((p, i) => {
      if (!g[i]) return;
      const q = [red(px[p]), red(py[p])], u = r[r.length - 1];
      if (!u || u[0] !== q[0] || u[1] !== q[1]) r.push(q);
    });
    return r;
  });
  const puntosDe = anillo => {
    const pts = [];
    anillo.forEach(({ a, rev }) => {
      const s = rev ? arcos[a].slice().reverse() : arcos[a];
      s.forEach((q, i) => { const u = pts[pts.length - 1]; if (i === 0 && u && u[0] === q[0] && u[1] === q[1]) return; pts.push(q); });
    });
    if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts.pop(); }
    return pts;
  };
  /* El «d»: M absoluto por anillo y el resto relativo, como en el mapa de
     Colombia, con el signo menos haciendo de separador. Los decimales llevan
     su cero delante («0.5»): así los lee cajaDe() de mapa-clientes.js. */
  const ruta = anillos => {
    let d = '';
    anillos.forEach(pts => {
      if (pts.length < 3) return;
      d += 'M' + pts[0][0] + ' ' + pts[0][1] + 'l';
      let ant = 'l';
      for (let i = 1; i < pts.length; i++) {
        for (const v of [red(pts[i][0] - pts[i - 1][0]), red(pts[i][1] - pts[i - 1][1])]) { d += (v < 0 || ant === 'l') ? String(v) : ' ' + v; ant = ''; }
      }
      d += 'z';
    });
    return d;
  };
  /* EL CONTORNO de varias juntas (`cuales`, por su posición): los bordes que
     son de una sola de ellas (los de adentro, que son de dos, se van),
     encadenados por sus extremos. Igual que los departamentos en
     mapa-colombia.js. */
  const contorno = cuales => {
    const refs = [];
    cuales.forEach(i => topo.refs[i].forEach(r => r.forEach(ref => refs.push(ref))));
    const usos = new Map();
    refs.forEach(ref => usos.set(ref.a, (usos.get(ref.a) || 0) + 1));
    const borde = refs.filter(ref => usos.get(ref.a) === 1);
    const ini = ref => { const q = topo.arcos[ref.a]; return ref.rev ? q[q.length - 1] : q[0]; };
    const fin = ref => { const q = topo.arcos[ref.a]; return ref.rev ? q[0] : q[q.length - 1]; };
    const desde = new Map();
    borde.forEach((ref, i) => { const k = ini(ref); if (!desde.has(k)) desde.set(k, []); desde.get(k).push(i); });
    const usado = new Uint8Array(borde.length), anillos = [];
    for (let i = 0; i < borde.length; i++) {
      if (usado[i]) continue;
      const anillo = []; let j = i;
      while (j >= 0 && !usado[j]) {
        usado[j] = 1; anillo.push(borde[j]);
        const sig = (desde.get(fin(borde[j])) || []).find(k => !usado[k]);
        j = sig === undefined ? -1 : sig;
      }
      anillos.push(anillo);
    }
    return ruta(anillos.map(puntosDe).map(sinIdaYVuelta));
  };
  /* Donde dos localidades no comparten vértices en la descarga (una rendija
     de centímetros en la punta del límite), cada una trae su arco «de
     afuera»; simplificados quedan iguales y el contorno entraba y salía por
     ahí: dos «bigotes», de 10 m entre Chapinero y Santa Fe y de 85 m entre
     Fontibón y Engativá, pintados con el trazo grueso de la ciudad. El ida y
     vuelta se quita (revisión del 14-nov). */
  const sinIdaYVuelta = pts => {
    const p = pts.slice(), igual = (a, b) => a[0] === b[0] && a[1] === b[1];
    let i = 1;
    while (i < p.length - 1) {
      if (igual(p[i - 1], p[i + 1])) { p.splice(i, 2); if (i > 1) i--; } else i++;
    }
    return p;
  };
  return {
    formas: formas.map((_, i) => {
      const anillos = topo.refs[i].map(puntosDe).filter(a => a.length >= 3);
      return { anillos, d: ruta(anillos) };
    }),
    contorno,
    puntos: arcos.reduce((t, a) => t + a.length, 0)
  };
}

/* ------------------------------------------------------------ las localidades */
/* El archivo de Planeación es JSON de Esri: cada entidad con `attributes` y
   `geometry.rings`, en grados (MAGNA-SIRGAS, que a esta escala es WGS84). */
function leerLocalidades(esri) {
  const r = (esri.features || []).map(f => ({ c: String(f.attributes.LocCodigo), geometry: { type: 'Polygon', coordinates: f.geometry.rings } }))
    .sort((a, b) => a.c.localeCompare(b.c));
  const codigos = r.map(l => l.c).join(' ');
  if (codigos !== Object.keys(NOMBRES).sort().join(' ')) throw new Error('las localidades no son las 20 que se esperan: ' + codigos);
  return r;
}

/* ------------------------------------------------------------ los vecinos */
/* Las formas de geoBoundaries que tocan la ventana, cada una casada con su
   municipio del mapa publicado: el punto del nombre de ese municipio (`p`, el
   más de adentro) cae dentro de la forma. Una forma con cero o con dos
   municipios adentro no se escribe: se termina con error. */
function vecinosDe(formasGeo, mapa, P, caja) {
  const c = [caja[0], caja[1], caja[0] + caja[2], caja[1] + caja[3]];
  const elegidas = [];
  formasGeo.forEach(ft => {
    const polis = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
    const anillos = polis.flat().map(r => r.map(([lon, lat]) => [aX(P, lon), aY(P, lat)]));
    const b = cajaDeAnillos(anillos);
    if (b[2] < c[0] || b[0] > c[2] || b[3] < c[1] || b[1] > c[3]) return;
    if (!anillos.some(r => recortar(r, c).length >= 3)) return;
    const suyos = mapa.municipios.filter(m => Array.isArray(m.p) && m.p[0] >= b[0] && m.p[0] <= b[2] && m.p[1] >= b[1] && m.p[1] <= b[3] && dentro(anillos, m.p[0], m.p[1]));
    if (suyos.length !== 1) {
      throw new Error('la forma «' + (ft.properties && ft.properties.shapeName) + '» tiene ' + suyos.length + ' municipios del mapa adentro (' + suyos.map(m => m.c).join(', ') + '): no se casa a ojo');
    }
    elegidas.push({ c: suyos[0].c, geometry: ft.geometry });
  });
  const repetidos = elegidas.map(e => e.c).filter((x, i, a) => a.indexOf(x) !== i);
  if (repetidos.length) throw new Error('dos formas se casaron con el mismo municipio: ' + repetidos.join(', '));
  return elegidas.sort((a, b) => a.c.localeCompare(b.c));
}

/* ------------------------------------------------------------ la lista de barrios */
/* LOS NOMBRES QUE SALEN DE UN NOMBRE OFICIAL. Planeación escribe «EL MIRADOR
   (LOS MOLINOS) II SECTOR», «BARRIO: NUEVO KENNEDY "EL DESCANSO"» o «ALQUERIA
   DE LA FRAGUA SECTOR EL PARAISO»; nadie escribe eso en un formulario. Salen:
   el nombre entero, lo de fuera y lo de dentro del paréntesis o las comillas,
   y lo de antes de « SECTOR ». Cada uno pasa por sinBogota() y llavesBarrio(),
   las mismas con las que mapa-lugares.js limpia lo que escribió el cliente:
   de «BOGOTA SUR - LA ESPERANZA» queda «sur la esperanza», que es lo que queda
   de ese mismo texto si lo escribe él.
   Lo de DENTRO solo es un nombre si lo parece (revisión del 14-nov): ahí
   Planeación también escribe direcciones y notas, y de «LA ESPERANZA (CALLE
   131A)», «PRADO VERANIEGO (MANZANA 0)», «LA FRAGUITA (ZONA INVADIDA)» o
   «BARRIO CANADA (ASD)» salían las llaves «calle», «manzana», «zona
   invadida» y «asd», que ubicaban a quien escribiera «Calle 80» o «asd».
   Lo que va delante del nombre se quita, y el nombre se queda: «(SECTOR EL
   LUCERO)» es «el lucero», «(HOY ALTOS DE JALISCO)» es «altos de jalisco» y
   «(ANTES EL PEDREGAL)», el nombre de antes, que la gente sigue diciendo. */
const DELANTE_DEL_NOMBRE = /^(sector|sectores|hoy|antes|barrio|urbanizacion) /;
const NO_ES_NOMBRE = /^(calle|cl|cll|carrera|cra|kr|avenida|av|diagonal|dg|transversal|tv|via|manzana|manzanas|mz|lote|lotes|lt|torre|bloque|interior|apto|km|parte|zona|etapa|anexo|ultima|ultimo|primer|primera|primero|segundo|segunda|tercer|tercera|tercero|cuarto|cuarta|sector|sectores|[ivxl]+|\d+\w?)( |$)/;
const deDentro = x => L.normalizar(x).replace(DELANTE_DEL_NOMBRE, '');
const pareceNombre = n => n.replace(/[^a-z]/g, '').length > 3 && !NO_ES_NOMBRE.test(n);
/* «ROCIO ( PARTE BAJA)»: lo de dentro no es un nombre, pero el nombre entero
   sí (revisión del 15-nov): sin él, «Rocío parte baja» era «rocio», que está
   también en Usaquén. */
const CALIFICA = /^parte (alta|baja|media|alto|bajo|medio)$/;
function nombresDeOficial(nombre) {
  const s = String(nombre == null ? '' : nombre).replace(/[“”«»]/g, '"').replace(/\balcald[ií]a\s+menor\b.*$/i, ' ');
  const adentro = [];
  const fuera = s.replace(/\(([^)]*)\)|"([^"]*)"/g, (m, a, b) => { adentro.push(a || b || ''); return ' '; });
  const dicen = adentro.map(deDentro).filter(pareceNombre);
  /* El nombre entero lleva lo de dentro solo si eso es un nombre: «BARRIO
     CANADA (ASD)» entero sería «barrio canada asd». */
  const enteroVale = adentro.every(x => pareceNombre(deDentro(x)) || CALIFICA.test(L.normalizar(x)));
  const partes = [enteroVale ? s.replace(/[()"]/g, ' ') : fuera];
  if (adentro.length) { partes.push(fuera); dicen.forEach(x => partes.push(x)); }
  const corte = /^(.+?)\s+sector\s+\S/i.exec(fuera);
  if (corte) partes.push(corte[1]);
  const llaves = [];
  /* Solo las puntas de cada parte (el nombre entero y sin la cola): un paso
     de en medio, como «santa cecilia sector» de «SANTA CECILIA SECTOR I»,
     es más vago que el nombre oficial y quedaría en una sola localidad
     (tercera vuelta del 15-nov). */
  partes.forEach(p => L.llavesBarrio(L.sinBogota(p), true).forEach(k => { if (llaves.indexOf(k) < 0) llaves.push(k); }));
  return llaves;
}
/* De [{ nombre, localidad }], la lista: llave → sus localidades. Y lo que la
   pestaña carga: las llaves agrupadas por su conjunto de localidades.
   Una llave que ES el nombre de una localidad y está en esa localidad se va
   (con el nombre de la localidad basta, y no la hace dudosa: hay un sector
   «Tunjuelito» que Catastro pone del lado de Usme). Si NO está en ella se
   queda: «Santa Fe» es también un barrio de Los Mártires, y eso sí es duda. */
function listaDeBarrios(entradas, localidades) {
  const idx = L.indiceBogota({ localidades });
  const de = new Map();
  entradas.forEach(e => {
    if (!idx.nombre[e.localidad]) return;
    nombresDeOficial(e.nombre).forEach(k => { if (!de.has(k)) de.set(k, new Set()); de.get(k).add(e.localidad); });
  });
  /* UN NOMBRE QUE TERMINA CON EL DE UNA LOCALIDAD Y ESTÁ EN OTRA. Catastro
     llama «El Paraíso Bosa» a un sector que cae entero en Kennedy, y «San
     Rafael Usme» a uno de San Cristóbal. Quien escribe «El Paraíso Bosa»
     puede estar diciendo ese nombre… o «El Paraíso», de Bosa, que también
     existe. El nombre dice una localidad y el mapa otra: se guarda con las
     dos, y la pestaña no escoge. Solo los que TERMINAN así, y con el nombre
     entero de la localidad: «Candelaria La Nueva» empieza como La Candelaria
     y es un nombre, no una localidad dicha (de esos se ocupa `delante`, en
     panel/mapa-lugares.js). */
  const finales = localidades.map(l => ({ c: l.c, n: L.normalizar(l.n) })).filter(l => idx.nombre[l.c]);
  de.forEach((codigos, k) => {
    finales.forEach(l => { if (k.length > l.n.length && k.slice(-(l.n.length + 1)) === ' ' + l.n) codigos.add(l.c); });
  });
  const grupos = new Map();
  let llaves = 0, repetidas = 0;
  [...de.keys()].sort().forEach(k => {
    const codigos = [...de.get(k)].sort();
    if (idx.porNombre[k] && codigos.indexOf(idx.porNombre[k]) >= 0) return;
    const g = codigos.join(' ');
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(k);
    llaves++; if (codigos.length > 1) repetidas++;
  });
  const barrios = {};
  [...grupos.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b)).forEach(g => { barrios[g] = grupos.get(g).join('|'); });
  return { barrios, llaves, repetidas };
}
/* Un punto de adentro de un polígono en grados: su centroide si cae dentro;
   si no (una C), el primero de una rejilla que caiga. */
function puntoDeAdentro(anillos) {
  let mayor = anillos[0], areaM = -1, c = null;
  anillos.forEach(r => {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const k = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k; }
    if (Math.abs(a) > areaM) { areaM = Math.abs(a); mayor = r; c = a ? [cx / (3 * a), cy / (3 * a)] : r[0]; }
  });
  if (dentro(anillos, c[0], c[1])) return c;
  const b = cajaDeAnillos([mayor]);
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
    const x = b[0] + (b[2] - b[0]) * i / 24, y = b[1] + (b[3] - b[1]) * j / 24;
    if (dentro(anillos, x, y)) return [x, y];
  }
  return c;
}
/* LAS LOCALIDADES DE UN SECTOR DE CATASTRO. Los sectores no dicen su
   localidad, y no la respetan: de 1.230, 38 tienen la décima parte o más de
   su suelo en OTRA («Las Aguas», dos tercios en La Candelaria y uno en Santa
   Fe; «Jorge Uribe Botero», mitad en Kennedy y mitad en Bosa). Hasta antes de
   publicarse, un sector era de la localidad donde caía UN punto suyo, y quien
   vive en la otra parte salía donde no vive. Ahora el sector se reparte en
   una rejilla de puntos y es de TODAS las localidades que tienen de él
   PARTE_QUE_CUENTA o más: su nombre queda repetido, y la pestaña no escoge.
   Menos de eso es el trazo de dos límites que no casan del todo (un río, una
   avenida). Un sector con más de la mitad fuera de las 20 no entra. */
const PARTE_QUE_CUENTA = 0.1;
const REJILLA = 40, PUNTOS_MINIMOS = 60, REJILLA_MAXIMA = 320;
function repartoDeSector(anillos, locs) {
  const b = cajaDeAnillos(anillos);
  /* Un sector flaco y torcido deja pocos puntos de la rejilla adentro: se
     afina hasta tener con qué repartir. */
  for (let n = REJILLA; ; n *= 2) {
    const cuenta = {};
    let total = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = b[0] + (b[2] - b[0]) * (i + 0.5) / n, y = b[1] + (b[3] - b[1]) * (j + 0.5) / n;
      if (!dentro(anillos, x, y)) continue;
      total++;
      const l = locs.filter(q => x >= q.b[0] && x <= q.b[2] && y >= q.b[1] && y <= q.b[3] && dentro(q.anillos, x, y));
      if (l.length === 1) cuenta[l[0].c] = (cuenta[l[0].c] || 0) + 1;
    }
    if (total >= PUNTOS_MINIMOS || n >= REJILLA_MAXIMA) return { total, cuenta };
  }
}
function localidadesDeSector(anillos, locs) {
  const r = repartoDeSector(anillos, locs);
  if (!r.total) {
    /* Ni un punto de la rejilla más fina cayó adentro (una astilla): vale la
       regla vieja, la localidad de un punto suyo. */
    const p = puntoDeAdentro(anillos);
    const l = locs.filter(q => p[0] >= q.b[0] && p[0] <= q.b[2] && p[1] >= q.b[1] && p[1] <= q.b[3] && dentro(q.anillos, p[0], p[1]));
    return l.length === 1 ? [l[0].c] : [];
  }
  const codigos = Object.keys(r.cuenta);
  const adentro = codigos.reduce((s, c) => s + r.cuenta[c], 0);
  if (adentro * 2 < r.total) return [];
  const suyas = codigos.filter(c => r.cuenta[c] >= PARTE_QUE_CUENTA * r.total);
  return (suyas.length ? suyas : [codigos.sort((x, y) => r.cuenta[y] - r.cuenta[x] || x.localeCompare(y))[0]]).sort();
}
/* De las dos fuentes, [{ nombre, localidad }]: un sector de Catastro da una
   entrada por cada localidad suya; los barrios de Planeación traen la suya
   escrita. `fuera`, los sectores que no entran; `partidos`, los que quedan en
   más de una. */
function entradasDeBarrios(sectores, legalizados, localidadesGeo) {
  const locs = localidadesGeo.map(l => ({ c: l.c, anillos: l.geometry.coordinates, b: cajaDeAnillos(l.geometry.coordinates) }));
  const r = [], fuera = [], partidos = [];
  (sectores.features || []).forEach(f => {
    const polis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const suyas = localidadesDeSector(polis.flat(), locs);
    if (!suyas.length) fuera.push(f.properties.SCANOMBRE);
    if (suyas.length > 1) partidos.push(f.properties.SCANOMBRE);
    suyas.forEach(c => r.push({ nombre: f.properties.SCANOMBRE, localidad: c, de: 'catastro' }));
  });
  (legalizados.features || []).forEach(f => {
    r.push({ nombre: f.attributes.NOMBRE, localidad: String(f.attributes.CODIGO_LOCALIDAD || ''), de: 'planeacion' });
  });
  return { entradas: r, fuera, partidos };
}

/* ------------------------------------------------------------ todo junto */
function construir(fuentes) {
  const mapa = fuentes.mapa;
  const P = proyeccion(fuentes.formas.features, mapa.caja);
  /* Las localidades. */
  const locGeo = leerLocalidades(fuentes.localidades);
  const cl = caminos(locGeo, P, TOLERANCIA_LOCALIDADES, DECIMALES_LOCALIDADES);
  /* La que no se ve en la ventana va sin forma ni punto: solo su nombre. */
  const localidades = locGeo.map((l, i) => {
    const p = puntoDelNombre(cl.formas[i].anillos, CAJA, 0);
    return p ? { c: l.c, n: NOMBRES[l.c], p, d: cl.formas[i].d } : { c: l.c, n: NOMBRES[l.c] };
  });
  if (localidades.filter(l => l.d).length < 19) throw new Error('la ventana deja fuera más localidades que Sumapaz');
  /* Los vecinos (y Bogotá, que es el fondo: lo que asoma donde los dos
     límites oficiales, el del DANE y el de Planeación, no casan). */
  const vecGeo = vecinosDe(fuentes.formas.features, mapa, P, CAJA);
  const cv = caminos(vecGeo, P, TOLERANCIA_VECINOS, DECIMALES_VECINOS);
  let fondo = '';
  const vecinos = [];
  vecGeo.forEach((v, i) => {
    if (v.c === MUNICIPIO) { fondo = cv.formas[i].d; return; }
    const p = puntoDelNombre(cv.formas[i].anillos, CAJA, RADIO_PARA_NOMBRE);
    vecinos.push(p ? { c: v.c, p, d: cv.formas[i].d } : { c: v.c, d: cv.formas[i].d });
  });
  if (!fondo) throw new Error('Bogotá no está entre las formas de la ventana');
  /* La lista de barrios. */
  const eb = entradasDeBarrios(fuentes.sectores, fuentes.barrios, locGeo);
  const lista = listaDeBarrios(eb.entradas, localidades);
  const json = {
    version: '2026-11',
    nota: 'Generado por herramientas/mapa-bogota.js. Ver panel/mapa/FUENTES.md.',
    creditos: 'Localidades y barrios de Bogotá: Secretaría Distrital de Planeación y Catastro Distrital (CC BY 4.0)',
    municipio: MUNICIPIO,
    proy: P,
    caja: CAJA,
    minimo: ANCHO_MINIMO,
    fondo,
    /* De las que se ven: con Sumapaz, el contorno daría 60 km de vuelta por
       un páramo que la ventana no muestra (y 15 KB que nadie vería). */
    contorno: cl.contorno(localidades.map((l, i) => (l.d ? i : -1)).filter(i => i >= 0)),
    localidades,
    vecinos,
    barrios: lista.barrios
  };
  return { json, resumen: { sinForma: localidades.filter(l => !l.d).map(l => l.n), puntosLocalidades: cl.puntos, puntosVecinos: cv.puntos, vecinos: vecinos.length, conNombre: vecinos.filter(v => v.p).length,
    entradas: eb.entradas.length, fuera: eb.fuera, partidos: eb.partidos, llaves: lista.llaves, repetidas: lista.repetidas } };
}

function main() {
  const a = G.argumentos(process.argv.slice(2));
  if (!a.localidades || !a.sectores || !a.barrios || !a.formas) {
    console.error('uso: node herramientas/mapa-bogota.js --localidades <loca.json> --sectores <SECTOR.geojson> --barrios <barriolegalizado.json> ' +
      '--formas <geojson de geoBoundaries> [--mapa <colombia-…json>] [--salida <json>]');
    process.exit(2);
  }
  const leer = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const salida = a.salida || path.join(__dirname, '..', 'panel', 'mapa', 'bogota-2026-11.json');
  const r = construir({ localidades: leer(a.localidades), sectores: leer(a.sectores), barrios: leer(a.barrios), formas: leer(a.formas),
    mapa: leer(a.mapa || path.join(__dirname, '..', 'panel', 'mapa', 'colombia-2026-11b.json')) });
  const texto = JSON.stringify(r.json);
  fs.writeFileSync(salida, texto);
  const s = r.resumen;
  console.log('localidades: 20 ·', s.puntosLocalidades, 'puntos · vecinos:', s.vecinos, '(' + s.conNombre + ' con nombre) ·', s.puntosVecinos, 'puntos');
  console.log('barrios:', s.entradas, 'nombres oficiales →', s.llaves, 'llaves ·', s.repetidas, 'en más de una localidad · sectores fuera de las 20:', s.fuera.join(', ') || 'ninguno');
  console.log('sectores de Catastro sobre el límite de dos localidades (quedan con las dos):', s.partidos.length);
  console.log('proyección:', JSON.stringify(r.json.proy), '· caja:', r.json.caja.join(' '), '· sin forma en la ventana:', s.sinForma.join(', ') || 'ninguna');
  console.log('escrito', path.relative(process.cwd(), salida), '·', (Buffer.byteLength(texto) / 1024).toFixed(1), 'KB');
}

if (require.main === module) main();
module.exports = { construir, proyeccion, caminos, recortar, puntoDelNombre, vecinosDe, nombresDeOficial, listaDeBarrios, entradasDeBarrios,
  localidadesDeSector, puntoDeAdentro, leerLocalidades, CAJA, ANCHO_MINIMO, NOMBRES, PARTE_QUE_CUENTA };
