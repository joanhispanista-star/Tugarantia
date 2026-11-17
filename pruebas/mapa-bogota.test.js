'use strict';
/* ==========================================================================
 * BOGOTÁ POR DENTRO — 14-nov-2026
 *
 *   node --test pruebas/mapa-bogota.test.js
 *
 * Joan: «mejorar el mapa del crm que se vea mucho más detallado». Con los
 * bocetos delante escogió Bogotá y la Sabana por localidades, con las calles
 * de OpenStreetMap debajo. Lo que esta prueba amarra:
 *
 *   · LA LOCALIDAD SALE DE LO QUE EL CLIENTE ESCRIBIÓ («Ciudad» y «Barrio») Y
 *     NO SE ADIVINA: un barrio que está en dos localidades queda sin
 *     localidad, y sigue contando en Bogotá;
 *   · SIGUE SIENDO ZONAS, NUNCA PUNTOS: ni GPS, ni IP, ni dirección; el
 *     barrio no se pinta ni se cuenta;
 *   · EL «1–2» VALE UN PISO MÁS ABAJO, y el total de Bogotá no deja despejar
 *     una localidad restando;
 *   · LAS CALLES: lo único que sale del navegador es qué ventana del mapa se
 *     mira (z/x/y), nunca nada de la cartera; van solo en Bogotá, con el
 *     crédito de OpenStreetMap a la vista, y se pueden quitar;
 *   · Bogotá sigue contando como UNO de los 1.122 municipios en Conquistas.
 *
 * Las descargas (Planeación, Catastro, geoBoundaries) no viven en el repo: la
 * herramienta se prueba con juguetes, y su resultado de verdad en el JSON
 * publicado (panel/mapa/bogota-2026-11.json).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
const RUTA_BOGOTA = path.join(RAIZ, 'panel', 'mapa', 'bogota-2026-11.json');
const MAPA = JSON.parse(fs.readFileSync(path.join(RAIZ, 'panel', 'mapa', 'colombia-2026-11b.json'), 'utf8'));
const BOGOTA = JSON.parse(fs.readFileSync(RUTA_BOGOTA, 'utf8'));
const L = require('../panel/mapa-lugares.js');
const P = require('../app/puente.js');
const H = require('../herramientas/mapa-bogota.js');
const IDX = L.indice(MAPA.municipios, MAPA.departamentos);
const IB = L.indiceBogota(BOGOTA);
const nombreLoc = c => IB.nombre[c];

function fresco() {
  delete require.cache[require.resolve('../panel/mapa-clientes.js')];
  return require('../panel/mapa-clientes.js');
}
const pedirMapa = u => Promise.resolve({ ok: true, json: () => Promise.resolve(/bogota-/.test(String(u)) ? BOGOTA : MAPA) });
const espera = ms => new Promise(r => setTimeout(r, ms));

/* Una cartera de mentira: [ciudad, barrio, estado del crédito]. */
const credito = (id, socioId, extra) => Object.assign({ id, socioId, capital: 300000, monto: 300000,
  fechaDesembolso: '2026-09-01', cicloPago: '2026-09-15' }, extra);
const pagado = (id, s) => credito(id, s, { pagado: true, fechaPagado: '2026-09-15', capitalPerdido: 0, montoRecibido: 360000, gananciaPago: 60000 });
const conPerdida = (id, s) => credito(id, s, { pagado: true, fechaPagado: '2026-10-20', capitalPerdido: 300000, montoRecibido: 0, gananciaPago: 0 });
function cartera(filas) {
  const socios = [], prestamos = [];
  filas.forEach(([ciudad, barrio, estado], i) => {
    const id = 's' + (i + 1);
    socios.push({ id, numero: i + 1, nombre: 'Persona ' + id, ciudad, barrio });
    if (estado === 'pagado') prestamos.push(pagado('p' + (i + 1), id));
    if (estado === 'perdida') prestamos.push(conPerdida('p' + (i + 1), id));
    if (estado === 'abierto') prestamos.push(credito('p' + (i + 1), id, { pagado: false }));
  });
  return { socios, prestamos };
}
const veces = (n, fila) => Array.from({ length: n }, () => fila);

/* Los anillos de un «d» (M absoluto, lo demás relativo, con decimales). */
function anillos(d) {
  return (String(d).match(/M[^Mz]*/g) || []).map(p => {
    const n = p.match(/-?\d+(\.\d+)?/g).map(Number);
    let x = n[0], y = n[1]; const r = [[x, y]];
    for (let i = 2; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; r.push([x, y]); }
    return r;
  });
}
function dentro(x, y, as) {
  let s = false;
  for (const r of as) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) s = !s;
  }
  return s;
}
const area = as => Math.abs(as.reduce((t, r) => t + r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2, 0));
/* Del mundo al mapa, con la proyección que trae el archivo. */
const aX = lon => BOGOTA.proy.m + (lon - BOGOTA.proy.ox) * BOGOTA.proy.kx;
const aY = lat => BOGOTA.proy.m + (BOGOTA.proy.oy - lat) * BOGOTA.proy.ky;

/* Un DOM de mentira con lo que toca la vista de Bogotá: el <svg> medido, el
   lienzo (con sus clases), el globito, la línea, el buscador, los botones, los
   <path> que marcar() pide (municipios y localidades) y el grupo de las
   teselas, que anota las imágenes que se le crean. */
function montaje(ancho, alto) {
  const anota = () => { const s = new Set(); return { add: x => s.add(x), remove: x => s.delete(x), contains: x => s.has(x) }; };
  const M = { textos: [], caminos: {}, creadas: [] };
  M.caja = { innerHTML: '', oy: {}, addEventListener(t, f) { this.oy[t] = f; }, contains: () => true };
  M.g = { hijos: [], querySelectorAll: () => M.g.hijos.slice(),
    appendChild(n) { n.parentNode = M.g; M.g.hijos.push(n); },
    removeChild(n) { M.g.hijos = M.g.hijos.filter(x => x !== n); n.parentNode = null; },
    get firstChild() { return M.g.hijos[0] || null; } };
  const hayTeselas = () => M.caja.innerHTML.includes('<g class="mapa-teselas"');
  M.svg = { tagName: 'svg', attrs: {}, k: null, classList: anota(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    style: { setProperty(k, v) { if (k === '--k') M.svg.k = Number(v); } },
    getBoundingClientRect: () => ({ left: 100, top: 50, width: ancho, height: alto, right: 100 + ancho, bottom: 50 + alto }),
    setPointerCapture() {},
    ownerDocument: { createElementNS: (ns, tag) => {
      const n = { tagName: tag, attrs: {}, oy: {}, parentNode: null,
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, addEventListener(t, f) { this.oy[t] = f; } };
      M.creadas.push(n);
      return n;
    } },
    querySelector: sel => (sel === 'g.mapa-teselas' && hayTeselas() ? M.g : null),
    querySelectorAll: () => {
      const n = (M.caja.innerHTML.match(/<text class="mapa-et/g) || []).length;
      M.textos = Array.from({ length: n }, () => ({ classList: anota(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
      return M.textos;
    } };
  M.lienzo = { classList: anota(), getBoundingClientRect: () => ({ left: 90, top: 40, width: ancho + 20, height: alto + 120 }) };
  M.globo = { innerHTML: '', hidden: true, style: {}, classList: anota() };
  M.info = { textContent: '' };
  M.sug = { innerHTML: '', hidden: true };
  M.entrada = { className: 'mapa-buscar', value: '' };
  M.botones = { mas: { disabled: false }, menos: { disabled: true }, todo: { disabled: true } };
  M.osm = { hidden: false }; M.aviso = { hidden: true };
  M.botonCalles = { classList: anota(), attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } };
  M.caja.querySelector = sel => {
    const fijo = { 'svg.mapa-svg': M.svg, '.mapa-lienzo': M.lienzo, '.mapa-globo': M.globo, '.mapa-info': M.info,
      '.mapa-sug': M.sug, '.mapa-buscar': M.entrada, '[data-z="mas"]': M.botones.mas, '[data-z="menos"]': M.botones.menos,
      '[data-z="todo"]': M.botones.todo, '.mapa-osm': M.osm, '.mapa-osm-aviso': M.aviso, '[data-mapa="calles"]': M.botonCalles }[sel];
    if (fijo) return fijo;
    if (sel === 'g.mapa-teselas') return hayTeselas() ? M.g : null;
    const m = /^path\[data-mapa="(muni|loc)"\]\[data-c="(\w+)"\]$/.exec(sel);
    if (m) {
      if (!M.caja.innerHTML.includes('data-mapa="' + m[1] + '" data-c="' + m[2] + '"')) return null;
      return M.caminos[m[2]] || (M.caminos[m[2]] = { classList: anota(), parentNode: { appendChild() {} } });
    }
    if (sel === 'path.mapa-sel') return Object.values(M.caminos).find(p => p.classList.contains('mapa-sel')) || null;
    return null;
  };
  M.doc = { oy: {}, addEventListener(t, f) { this.oy[t] = f; } };
  M.zona = (c, accion) => {
    const p = { tagName: 'path', getAttribute: k => ({ 'data-mapa': accion || 'muni', 'data-c': c }[k]) };
    return { closest: sel => (sel === 'svg.mapa-svg' ? M.svg : sel === '.mapa-busca' ? null : p) };
  };
  /* LA ZONA COMO ES EN UN NAVEGADOR (revisión del 14-nov): el blanco del
     evento ES el <path>, y closest() mira de verdad el selector que le pasan,
     subiendo por path → svg.mapa-svg → caja. Con M.zona, closest() devuelve
     el <path> pida lo que se pida, y la rama «tocado en el mapa» no corría. */
  M.zonaFiel = (c, accion) => {
    const casa = (el, sel) => sel.split(',').some(x => {
      x = x.trim();
      let m = /^\[([\w-]+)="([^"]*)"\]$/.exec(x); if (m) return el.attrs[m[1]] === m[2];
      m = /^\[([\w-]+)\]$/.exec(x); if (m) return el.attrs[m[1]] !== undefined;
      m = /^(\w+)\.([\w-]+)$/.exec(x); if (m) return el.tagName === m[1] && el.clases.includes(m[2]);
      m = /^\.([\w-]+)$/.exec(x); if (m) return el.clases.includes(m[1]);
      throw new Error('el blanco fiel no sabe leer el selector «' + x + '»');
    });
    const nodo = (tagName, attrs, clases, padre) => {
      const el = { tagName, attrs, clases, parentNode: padre, getAttribute: k => attrs[k],
        closest(sel) { for (let x = el; x; x = x.parentNode) if (casa(x, sel)) return x.espejo || x; return null; } };
      return el;
    };
    const svgN = nodo('svg', {}, ['mapa-svg'], nodo('div', {}, ['mapa-caja'], null));
    svgN.espejo = M.svg;
    return nodo('path', { 'data-mapa': accion || 'muni', 'data-c': c }, ['mapa-z'], svgN);
  };
  M.boton = attrs => {
    const b = { tagName: 'BUTTON', getAttribute: k => attrs[k] };
    return { closest: sel => (sel === '[data-mapa]' ? b : null) };
  };
  M.clic = (target, extra) => M.caja.oy.click(Object.assign({ target }, extra));
  M.direcciones = () => M.g.hijos.map(n => n.attrs.href).sort();
  return M;
}
async function abrirCon(db, estado, ancho, alto) {
  const MC = fresco();
  const M = montaje(ancho || 514, alto || 648);
  Object.assign(MC._estado, estado);
  let ahora = 100000;
  MC._estado.reloj = () => ahora;
  M.pasa = ms => { ahora += ms; };
  /* abrir() ya no revienta cuando pintar() revienta: lo dice en la caja. Aquí
     tiene que haber mapa, y si no, que se vea por qué. */
  assert.equal(await MC.abrir({ caja: M.caja, db, puente: P, pedir: pedirMapa, doc: M.doc }), true, M.caja.innerHTML.slice(0, 300));
  return { MC, M, E: MC._estado };
}
const enBogota = db => abrirCon(db, { depto: '11' });
/* Las etiquetas de un HTML: código, nombre, cifra (o nada) y si va siempre. */
const etiquetasDe = html => [...html.matchAll(/<text class="mapa-et( siempre| oculta)([^"]*)"[^>]*data-c="(\w+)">([^<]+?)(?: <tspan class="mapa-et-k">([^<]+)<\/tspan>)?<\/text>/g)]
  .map(m => ({ c: m[3], nombre: m[4], cifra: m[5] || '', siempre: m[1] === ' siempre', clase: m[2].trim() }));
/* Las filas de la lista que viene después de un título. */
const lista = (html, titulo) => {
  const i = html.indexOf(titulo);
  if (i < 0) return null;
  const ol = html.slice(html.indexOf('<ol', i), html.indexOf('</ol>', i));
  return [...ol.matchAll(/data-c="(\w+)"><span>([^<]+)<\/span><b>([^<]*)<\/b>/g)].map(m => [m[2], m[3]]);
};

/* ==========================================================================
 * 1 · El archivo de Bogotá
 * ======================================================================== */
describe('1 · el archivo: 20 localidades, los vecinos de la Sabana y la lista de barrios', () => {

  test('las 20 localidades con su código y su nombre con tildes; Sumapaz, sin forma en la ventana', () => {
    assert.deepEqual(BOGOTA.localidades.map(l => l.c), Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')));
    const por = Object.fromEntries(BOGOTA.localidades.map(l => [l.c, l.n]));
    assert.deepEqual([por['01'], por['08'], por['10'], por['14'], por['17'], por['19']],
      ['Usaquén', 'Kennedy', 'Engativá', 'Los Mártires', 'La Candelaria', 'Ciudad Bolívar']);
    const sinForma = BOGOTA.localidades.filter(l => !l.d);
    assert.deepEqual(sinForma.map(l => l.n), ['Sumapaz'], 'solo el páramo queda fuera de la ventana');
    assert.ok(sinForma.every(l => !l.p), 'lo que no se dibuja no trae punto para un nombre');
    assert.equal(BOGOTA.municipio, '11001');
  });

  test('el nombre de cada localidad va DENTRO de ella y dentro de la ventana', () => {
    const [x0, y0, w, h] = BOGOTA.caja;
    const mal = BOGOTA.localidades.filter(l => l.d).filter(l => {
      const [x, y] = l.p;
      return !(dentro(x, y, anillos(l.d)) && x > x0 && x < x0 + w && y > y0 && y < y0 + h);
    }).map(l => l.n);
    assert.deepEqual(mal, []);
  });

  /* Planeación trae los bordes compartidos con los MISMOS vértices; la
     herramienta simplifica cada borde una vez. Si lo hiciera por localidad,
     entre dos vecinas quedarían rendijas o se montarían: el área lo delata. */
  test('entre dos localidades no hay rendija ni se montan: juntas miden lo que mide su contorno', () => {
    const suma = BOGOTA.localidades.filter(l => l.d).reduce((t, l) => {
      const as = anillos(l.d).map(r => area([r]));
      /* Santa Fe tiene un hueco: La Candelaria. */
      return t + Math.max(...as) - as.filter(a => a !== Math.max(...as)).reduce((s, a) => s + a, 0);
    }, 0);
    const borde = anillos(BOGOTA.contorno);
    assert.equal(borde.length, 1, 'el contorno de la ciudad es una sola pieza');
    const ciudad = area(borde);
    assert.ok(Math.abs(suma - ciudad) / ciudad < 1e-6, 'las localidades suman ' + suma.toFixed(2) + ' y el contorno mide ' + ciudad.toFixed(2));
    /* Y el contorno está hecho de puntos de las localidades, no de otros. */
    const puntos = new Set(BOGOTA.localidades.filter(l => l.d).flatMap(l => anillos(l.d).flat().map(p => p.map(v => v.toFixed(2)).join(','))));
    assert.ok(borde[0].every(p => puntos.has(p.map(v => v.toFixed(2)).join(','))));
  });

  /* Que el archivo va en las MISMAS unidades del mapa de Colombia no se da por
     hecho: cada vecino se reconoce porque el punto del nombre de su municipio,
     tomado del otro archivo, cae dentro de su forma fina. */
  /* Revisión del 14-nov: donde dos localidades no compartían vértices en la
     descarga, el contorno entraba y salía por un borde de adentro (10 m entre
     Chapinero y Santa Fe, 85 m entre Fontibón y Engativá). */
  test('el contorno no entra y sale por un borde de adentro: ningún tramo va de ida y vuelta', () => {
    const igual = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
    const idaYVuelta = [];
    for (const r of anillos(BOGOTA.contorno)) {
      for (let i = 1; i + 1 < r.length; i++) if (igual(r[i - 1], r[i + 1])) idaYVuelta.push(r[i].map(v => v.toFixed(2)).join(' '));
    }
    assert.deepEqual(idaYVuelta, []);
  });

  test('los vecinos son municipios de verdad, en las mismas unidades del mapa de Colombia', () => {
    const municipios = Object.fromEntries(MAPA.municipios.map(m => [m.c, m]));
    const codigos = BOGOTA.vecinos.map(v => v.c);
    assert.equal(new Set(codigos).size, codigos.length, 'un vecino repetido');
    assert.ok(codigos.length >= 20 && codigos.length <= 40, 'vecinos: ' + codigos.length);
    assert.ok(!codigos.includes('11001'), 'Bogotá no es vecina de sí misma: es el fondo');
    for (const c of ['25754', '25473', '25286', '25430', '25175', '25740']) assert.ok(codigos.includes(c), 'falta ' + c + ' (Soacha, Mosquera, Funza, Madrid, Chía, Sibaté)');
    const fuera = BOGOTA.vecinos.filter(v => !municipios[v.c] || !dentro(municipios[v.c].p[0], municipios[v.c].p[1], anillos(v.d))).map(v => v.c);
    assert.deepEqual(fuera, [], 'el punto del municipio (del mapa de Colombia) no cae en su forma fina');
    const sinPunto = BOGOTA.vecinos.filter(v => v.p && !dentro(v.p[0], v.p[1], anillos(v.d))).map(v => v.c);
    assert.deepEqual(sinPunto, [], 'el nombre de un vecino caería fuera de él');
    /* El fondo es Bogotá según el DANE: el punto de Bogotá del otro mapa cae adentro. */
    assert.ok(dentro(municipios['11001'].p[0], municipios['11001'].p[1], anillos(BOGOTA.fondo)));
  });

  /* Trece sitios que cualquiera conoce, con su latitud y longitud de un mapa
     cualquiera. Si la proyección del archivo (la que después dice qué calles
     pedir) estuviera corrida, alguno caería en la localidad de al lado. */
  test('trece sitios conocidos caen en su localidad o en su municipio', () => {
    const SITIOS = [['Plaza de Bolívar', 4.5981, -74.0760, 'La Candelaria'], ['Monserrate', 4.6058, -74.0565, 'Santa Fe'],
      ['Aeropuerto El Dorado', 4.7016, -74.1469, 'Fontibón'], ['Plaza de Usaquén', 4.6950, -74.0303, 'Usaquén'],
      ['Plaza de Suba', 4.7410, -74.0840, 'Suba'], ['Plaza de Bosa', 4.6180, -74.1900, 'Bosa'], ['Corabastos', 4.6316, -74.1560, 'Kennedy'],
      ['Portal Tunal', 4.5770, -74.1300, 'Tunjuelito'], ['Plaza de Fontibón', 4.6730, -74.1460, 'Fontibón'], ['Plaza de Usme', 4.4720, -74.1260, 'Usme'],
      ['Parque de Soacha', 4.5870, -74.2170, 'Soacha'], ['Parque de Mosquera', 4.7060, -74.2300, 'Mosquera'], ['Parque de Chía', 4.8620, -74.0590, 'Chía']];
    const nombreMuni = Object.fromEntries(MAPA.municipios.map(m => [m.c, m.n]));
    for (const [sitio, lat, lon, donde] of SITIOS) {
      const x = aX(lon), y = aY(lat);
      const cae = BOGOTA.localidades.filter(l => l.d && dentro(x, y, anillos(l.d))).map(l => l.n)
        .concat(BOGOTA.vecinos.filter(v => dentro(x, y, anillos(v.d))).map(v => nombreMuni[v.c]));
      assert.deepEqual(cae, [donde], sitio);
    }
  });

  test('la lista de barrios: cada nombre con localidades que existen, limpio, y sin palabras sueltas', () => {
    const codigos = new Set(BOGOTA.localidades.map(l => l.c));
    let llaves = 0, repetidas = 0;
    for (const [grupo, texto] of Object.entries(BOGOTA.barrios)) {
      const cs = grupo.split(' ');
      assert.ok(cs.every(c => codigos.has(c)), 'el grupo «' + grupo + '» nombra una localidad que no existe');
      assert.deepEqual(cs, cs.slice().sort(), 'el grupo «' + grupo + '» no va en orden');
      for (const k of texto.split('|')) {
        llaves++; if (cs.length > 1) repetidas++;
        assert.match(k, /^[a-z0-9]+( [a-z0-9]+)*$/, 'la llave «' + k + '» no está limpia');
        assert.ok(!L.esVaga(k), '«' + k + '» es una palabra suelta: haría caer textos vagos en una localidad');
        assert.ok(!/^bogota( |$)/.test(k), '«' + k + '» empieza por el nombre de la ciudad: lo que escribe el cliente llega sin él');
        /* Una llave que es el nombre de una localidad solo se queda si el barrio está en OTRA. */
        if (IB.porNombre[k]) assert.ok(!cs.includes(IB.porNombre[k]), '«' + k + '» ya es el nombre de su localidad');
      }
    }
    assert.ok(llaves > 2500 && llaves < 3200, 'llaves: ' + llaves);
    assert.ok(repetidas > 100, 'nombres en más de una localidad: ' + repetidas);
    assert.deepEqual(IB.barrios['patio bonito'], ['08']);
    assert.deepEqual(IB.barrios['lisboa'], ['01', '11'], 'Lisboa está en Usaquén y en Suba');
    for (const k of ['calle', 'manzana', 'estacion', 'torre', 'casa']) assert.ok(!IB.barrios[k], '«' + k + '» no es un barrio: es un pedazo de una dirección');
  });

  /* Los sectores de Catastro no respetan las localidades. Con la regla de
     antes (la localidad de UN punto del sector), «Las Aguas» era entera de La
     Candelaria y «Corredor Férreo del Sur» de Ciudad Bolívar, donde tiene el
     7 % de su suelo. */
  test('un barrio que cae sobre el límite de dos localidades viene con las dos; uno que apenas lo roza, con la suya', () => {
    assert.deepEqual(IB.barrios['las aguas'], ['03', '17'], 'Las Aguas: dos tercios en La Candelaria y uno en Santa Fe');
    assert.deepEqual(IB.barrios['jorge uribe botero'], ['07', '08'], 'mitad en Kennedy y mitad en Bosa');
    assert.deepEqual(IB.barrios['meissen'], ['06', '19']);
    assert.deepEqual(IB.barrios['corredor ferreo del sur'], ['07', '08', '16']);
    assert.deepEqual(IB.barrios['gran britalia'], ['08'], 'menos de la décima parte en Bosa: es el trazo del límite, no medio barrio');
    assert.deepEqual(IB.barrios['la picota'], ['18']);
    /* Y el nombre que termina con el de una localidad y Catastro pone en otra. */
    assert.deepEqual(IB.barrios['el paraiso bosa'], ['07', '08'], 'cae entero en Kennedy y se llama «…Bosa»: no se escoge');
    assert.deepEqual(IB.barrios['san rafael usme'], ['04', '05']);
    assert.deepEqual(IB.barrios['candelaria la nueva'], ['19'], 'EMPEZAR como una localidad no la añade: es un nombre');
  });

  test('pesa menos de 160 KB, trae sus créditos y FUENTES.md dice de dónde sale', () => {
    const bytes = fs.statSync(RUTA_BOGOTA).size;
    assert.ok(bytes < 160 * 1000, 'el archivo de Bogotá pesa ' + bytes + ' bytes');
    assert.match(BOGOTA.creditos, /Planeación/); assert.match(BOGOTA.creditos, /Catastro/); assert.match(BOGOTA.creditos, /CC BY 4\.0/);
    const f = leer('panel/mapa/FUENTES.md');
    for (const x of ['bogota-2026-11.json', 'datosabiertos.bogota.gov.co', 'Sector Catastral', 'Barrio legalizado', 'Localidad. Bogotá D.C',
      'CC BY 4.0', '14-nov-2026', 'herramientas/mapa-bogota.js', 'OpenStreetMap', 'ODbL']) {
      assert.ok(f.includes(x), 'FUENTES.md no dice ' + x);
    }
  });
});

/* ==========================================================================
 * 1b · La herramienta, con juguetes
 * ======================================================================== */
describe('1b · la herramienta que arma el archivo', () => {
  const cuadro = (x, y, lado) => [[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]];
  const forma = (c, anillo) => ({ c, geometry: { type: 'Polygon', coordinates: [anillo] } });
  /* Una proyección de juguete: una unidad por grado, sin margen. */
  const PJ = { ox: 0, oy: 10, kx: 1, ky: 1, m: 0 };

  test('de un nombre oficial salen los nombres que la gente escribe', () => {
    assert.deepEqual(H.nombresDeOficial('PATIO BONITO II'), ['patio bonito ii', 'patio bonito']);
    assert.ok(H.nombresDeOficial('EL MIRADOR (LOS MOLINOS) II SECTOR').includes('el mirador'));
    assert.ok(H.nombresDeOficial('EL MIRADOR (LOS MOLINOS) II SECTOR').includes('los molinos'));
    assert.ok(H.nombresDeOficial('BARRIO: NUEVO KENNEDY "EL DESCANSO"').includes('nuevo kennedy'));
    assert.ok(H.nombresDeOficial('ALQUERIA DE LA FRAGUA SECTOR EL PARAISO').includes('alqueria de la fragua'));
    assert.ok(H.nombresDeOficial('EL QUINDIO II ALCALDIA MENOR: SAN CRISTOBAL').includes('el quindio'));
    assert.ok(H.nombresDeOficial('URBANIZACION GRAN YOMASA').includes('gran yomasa'));
    assert.deepEqual(H.nombresDeOficial('SIETE DE AGOSTO'), ['7 de agosto'], 'las fechas, en cifras');
    /* «Bogotá sector Tequendama»: «bogota» a secas no puede ser una llave. Y el
       nombre de la ciudad se quita, como se le quita a lo que escribe el
       cliente: si no, «Bogotá Sur La Esperanza» no casaría consigo mismo. */
    assert.deepEqual(H.nombresDeOficial('BOGOTA SECTOR TEQUENDAMA'), ['tequendama']);
    assert.deepEqual(H.nombresDeOficial('BOGOTA SUR - LA ESPERANZA'), ['sur la esperanza']);
    assert.deepEqual(H.nombresDeOficial('CALLE 125 Nº 94A-08 (FINCA EL CARMEN)').filter(k => L.esVaga(k)), [], 'de una dirección no sale «calle» a secas');
    assert.deepEqual(H.nombresDeOficial('VILLA II'), ['villa ii'], '«villa» a secas no es un barrio');
    /* Revisión del 14-nov: dentro del paréntesis Planeación también escribe
       direcciones y notas. De ahí salían «calle», «manzana», «zona invadida»
       y «asd», que ubicaban a quien escribiera eso en «Barrio». */
    assert.deepEqual(H.nombresDeOficial('LA ESPERANZA (CALLE 131A)'), ['la esperanza']);
    assert.deepEqual(H.nombresDeOficial('LA FRAGUITA (ZONA INVADIDA)'), ['la fraguita']);
    assert.deepEqual(H.nombresDeOficial('VILLA GLADYS (SEGUNDO SECTOR)'), ['villa gladys']);
    /* «parte media» califica al barrio: el nombre entero también es llave (revisión del 15-nov). */
    assert.deepEqual(H.nombresDeOficial('MARCO FIDEL SUAREZ IV "PARTE MEDIA"'), ['marco fidel suarez iv parte media', 'marco fidel suarez', 'marco fidel suarez iv']);
    assert.deepEqual(H.nombresDeOficial('ROCIO ( PARTE BAJA)'), ['rocio parte baja', 'rocio']);
    assert.deepEqual(H.nombresDeOficial('LA FRAGUITA (ZONA INVADIDA)'), ['la fraguita']);
    assert.ok(!H.nombresDeOficial('BARRIO CANADA (ASD) SECTOR LA GUIRA II SEC').some(k => / ?asd ?/.test(k)), '«asd» no es un nombre');
    /* Lo que va delante del nombre se quita, y el nombre se queda. */
    assert.ok(H.nombresDeOficial('BELLAVISTA (SECTOR EL LUCERO)').includes('el lucero'));
    assert.ok(H.nombresDeOficial('SAN LUIS (HOY ALTOS DE JALISCO)').includes('altos de jalisco'));
    assert.ok(H.nombresDeOficial('YOPAL (ANTES EL PEDREGAL)').includes('el pedregal'), 'el nombre de antes, que la gente sigue diciendo');
  });

  test('la lista: un nombre en dos localidades se guarda con las dos; el de una localidad, solo si el barrio está en otra', () => {
    const locs = [{ c: '03', n: 'Santa Fe' }, { c: '06', n: 'Tunjuelito' }, { c: '08', n: 'Kennedy' }, { c: '11', n: 'Suba' }, { c: '14', n: 'Los Mártires' }];
    const r = H.listaDeBarrios([
      { nombre: 'PATIO BONITO II', localidad: '08' }, { nombre: 'PATIO BONITO III', localidad: '08' },
      { nombre: 'LISBOA', localidad: '11' }, { nombre: 'LISBOA', localidad: '08' },
      { nombre: 'TUNJUELITO', localidad: '06' }, { nombre: 'SANTA FE', localidad: '14' },
      { nombre: 'FANTASMA', localidad: '99' }], locs);
    assert.equal(r.barrios['08'], 'patio bonito|patio bonito ii|patio bonito iii');
    assert.equal(r.barrios['08 11'], 'lisboa');
    assert.equal(r.barrios['14'], 'santa fe', '«Santa Fe» es también un barrio de Los Mártires: eso sí es duda, y se guarda');
    assert.ok(!Object.values(r.barrios).join('|').split('|').includes('tunjuelito'), '«Tunjuelito» en Tunjuelito sobra: es el nombre de la localidad');
    assert.ok(!JSON.stringify(r.barrios).includes('fantasma'), 'un barrio de una localidad que no existe no entra');
    assert.equal(r.repetidas, 1);
  });

  test('un nombre oficial que TERMINA con el de una localidad y está en otra se guarda con las dos', () => {
    const locs = [{ c: '07', n: 'Bosa' }, { c: '08', n: 'Kennedy' }, { c: '17', n: 'La Candelaria' }, { c: '19', n: 'Ciudad Bolívar' }];
    const r = H.listaDeBarrios([
      { nombre: 'EL PARAISO BOSA', localidad: '08' }, { nombre: 'SANTA FE BOSA', localidad: '07' },
      { nombre: 'CANDELARIA LA NUEVA', localidad: '19' }, { nombre: 'VILLA CANDELARIA', localidad: '19' }], locs);
    assert.equal(r.barrios['07 08'], 'el paraiso bosa', 'Catastro lo pone en Kennedy y se llama «…Bosa»');
    assert.equal(r.barrios['07'], 'santa fe bosa', 'el que termina con SU localidad queda como estaba');
    assert.equal(r.barrios['19'], 'candelaria la nueva|villa candelaria', 'empezar como una localidad, o terminar con su apodo, no la añade');
    assert.equal(r.repetidas, 1);
  });

  /* Dos localidades de juguete, una al lado de la otra: la 07 de x=0 a 10 y la
     08 de x=10 a 20. Un sector es un rectángulo de alto 4. */
  test('un sector de Catastro es de TODAS las localidades donde tiene la décima parte o más de su suelo', () => {
    const rect = (x0, x1) => [[x0, 2], [x1, 2], [x1, 6], [x0, 6], [x0, 2]];
    const sector = (nombre, x0, x1) => ({ properties: { SCANOMBRE: nombre }, geometry: { type: 'Polygon', coordinates: [rect(x0, x1)] } });
    const locs = [forma('07', cuadro(0, 0, 10)), forma('08', cuadro(10, 0, 10))];
    const r = H.entradasDeBarrios({ features: [sector('ENTERO', 2, 6), sector('MITAD', 8, 12), sector('ROZA', 0.5, 10.5), sector('QUINTA', 2, 12),
      sector('ASOMA', 14, 26), sector('AFUERA', 17, 27),
      { properties: { SCANOMBRE: 'EN DOS PEDAZOS' }, geometry: { type: 'MultiPolygon', coordinates: [[rect(1, 3)], [rect(15, 17)]] } }] },
      { features: [{ attributes: { NOMBRE: 'LEGALIZADO', CODIGO_LOCALIDAD: '08' } }] }, locs);
    const de = nombre => r.entradas.filter(e => e.nombre === nombre).map(e => e.localidad).sort();
    assert.deepEqual(de('ENTERO'), ['07']);
    assert.deepEqual(de('MITAD'), ['07', '08'], 'la regla de antes (un punto) lo dejaba en una sola');
    assert.deepEqual(de('ROZA'), ['07'], 'el 5 % en la otra es el trazo del límite');
    assert.deepEqual(de('QUINTA'), ['07', '08'], 'el 20 % en la otra ya es medio barrio');
    assert.deepEqual(de('ASOMA'), ['08'], 'la mitad fuera de la ciudad todavía entra, con la que tiene');
    assert.deepEqual(de('AFUERA'), [], 'más de la mitad fuera de las 20: no entra');
    assert.deepEqual(de('EN DOS PEDAZOS'), ['07', '08']);
    assert.deepEqual(de('LEGALIZADO'), ['08'], 'el de Planeación trae su localidad escrita');
    assert.deepEqual(r.fuera, ['AFUERA']);
    assert.deepEqual(r.partidos.slice().sort(), ['EN DOS PEDAZOS', 'MITAD', 'QUINTA']);
    assert.equal(H.PARTE_QUE_CUENTA, 0.1);
  });

  test('dos formas vecinas quedan pegadas (el borde se simplifica una vez) y su contorno es el de las dos juntas', () => {
    /* Dos cuadrados de 4 con el lado común lleno de puntos casi en línea. */
    const comun = [[4, 0], [4.01, 1], [3.99, 2], [4.01, 3], [4, 4]];
    const a = [[0, 0], ...comun, [0, 4], [0, 0]];
    const b = [[4, 0], [8, 0], [8, 4], ...comun.slice().reverse()];
    const r = H.caminos([forma('a', a), forma('b', b)], PJ, 0.05, 2);
    const pa = anillos(r.formas[0].d)[0], pb = anillos(r.formas[1].d)[0];
    assert.ok(pa.length < a.length - 1, 'no simplificó');
    const llave = p => p.map(v => v.toFixed(2)).join(',');
    const deB = new Set(pb.map(llave));
    const compartidos = pa.filter(p => Math.abs(p[0] - 4) < 0.1).map(llave);
    assert.ok(compartidos.length >= 2 && compartidos.every(k => deB.has(k)), 'el borde común no es el mismo en las dos: quedaría una rendija');
    assert.ok(Math.abs(area([pa]) + area([pb]) - 32) < 1e-9, 'se montan o dejan hueco');
    const borde = anillos(r.contorno([0, 1]));
    assert.equal(borde.length, 1);
    assert.ok(Math.abs(area(borde) - 32) < 1e-9, 'el contorno no es el de las dos juntas');
    assert.ok(borde[0].every(p => Math.abs(p[0] - 4) > 0.1 || p[1] < 0.01 || p[1] > 3.99 || Math.abs(p[1] - 6) < 0.01 || Math.abs(p[1] - 10) < 0.01),
      'el borde de adentro se coló en el contorno');
  });

  test('el nombre de una zona que la ventana corta va en la parte que se ve; si no se ve, no hay punto', () => {
    const zona = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
    assert.deepEqual(H.puntoDelNombre(zona, [0, 0, 20, 20], 0), [5, 5]);
    const p = H.puntoDelNombre(zona, [8, 0, 20, 20], 0);
    assert.ok(p[0] > 8 && p[0] < 10, 'cortada por la izquierda de la ventana, el nombre va en la franja que queda: ' + p);
    assert.equal(H.puntoDelNombre(zona, [30, 30, 5, 5], 0), null);
    assert.equal(H.puntoDelNombre(zona, [9.5, 0, 20, 20], 2), null, 'en medio punto de ancho no cabe un nombre');
    assert.deepEqual(H.recortar([[0, 0], [10, 0], [10, 10], [0, 10]], [5, 5, 20, 20]), [[10, 5], [10, 10], [5, 10], [5, 5]]);
  });

  test('si la proyección no da la caja del mapa publicado, no se escribe nada', () => {
    const formas = [forma('x', cuadro(-75, 4, 1)).geometry].map(g => ({ geometry: g }));
    assert.throws(() => H.proyeccion(formas, [5905, 8093]), /no casa con la del mapa publicado/);
    const p = H.proyeccion(formas, null);
    assert.equal(p.ox, -75); assert.equal(p.oy, 5); assert.equal(p.ky, 480);
    /* Las islas (al oeste de 80,5° O) no mueven la caja: van en el recuadro. */
    const conIsla = formas.concat([{ geometry: forma('isla', cuadro(-81.7, 12.5, 0.1)).geometry }]);
    assert.deepEqual(H.proyeccion(conIsla, null), p);
  });

  test('un vecino sin su municipio adentro, o con dos, no se casa a ojo', () => {
    const mapa = { municipios: [{ c: '25001', p: [2, 8] }, { c: '25002', p: [3, 8] }] };
    const f = [{ properties: { shapeName: 'Dos adentro' }, geometry: forma('x', cuadro(0, 0, 5)).geometry }];
    assert.throws(() => H.vecinosDe(f, mapa, PJ, [0, 0, 10, 10]), /tiene 2 municipios del mapa adentro/);
    assert.throws(() => H.vecinosDe(f, { municipios: [] }, PJ, [0, 0, 10, 10]), /tiene 0 municipios/);
    assert.deepEqual(H.vecinosDe(f, { municipios: [mapa.municipios[0]] }, PJ, [0, 0, 10, 10]).map(v => v.c), ['25001']);
    assert.deepEqual(H.vecinosDe(f, { municipios: [mapa.municipios[0]] }, PJ, [50, 50, 10, 10]), [], 'lo que no toca la ventana no entra');
  });
});

/* ==========================================================================
 * 2 · De «Ciudad» y «Barrio», la localidad
 * ======================================================================== */
describe('2 · la localidad sale de lo que escribió el cliente, y no se adivina', () => {
  const loc = (ciudad, barrio) => L.localidadDe(ciudad, barrio, IB);
  const es = (ciudad, barrio, nombre, que) => {
    const r = loc(ciudad, barrio);
    assert.equal(r.estado, 'ubicado', (que || barrio) + ' → ' + r.estado + ' ' + JSON.stringify((r.opciones || []).map(nombreLoc)));
    assert.equal(nombreLoc(r.codigo), nombre, que || barrio);
  };

  test('el barrio, de todas las formas en que se escribe', () => {
    for (const b of ['Patio Bonito', 'patio bonito', 'PATIO BONITO', 'Barrio Patio Bonito', 'B/ Patio Bonito', 'Patio Bonito II',
      'Patio Bonito 2do sector', 'Patio Bonito segunda etapa', 'Urb. Patio Bonito']) es('Bogotá', b, 'Kennedy');
    es('Bogotá', 'Timiza', 'Kennedy'); es('Bogotá', 'Castilla', 'Kennedy'); es('Bogotá', 'Corabastos', 'Kennedy');
    es('Bogotá', 'Tibabuyes', 'Suba'); es('Bogotá', 'San Bernardino', 'Bosa'); es('Bogotá', 'Santa Librada', 'Usme');
    es('Bogotá', 'Quiroga', 'Rafael Uribe Uribe'); es('Bogotá', 'Venecia', 'Tunjuelito'); es('Bogotá', 'Las Ferias', 'Engativá');
    es('Bogotá', 'Toberín', 'Usaquén'); es('Bogotá', 'Restrepo', 'Antonio Nariño'); es('Bogotá', 'Las Cruces', 'Santa Fe');
    es('Bogotá', 'Arborizadora Alta', 'Ciudad Bolívar'); es('Bogotá', 'Modelia', 'Fontibón');
  });

  test('las fechas, con cifras o con letras; y el artículo o el «Ciudad» que la gente se come', () => {
    es('Bogotá', '20 de Julio', 'San Cristóbal'); es('Bogotá', 'Veinte de Julio', 'San Cristóbal'); es('Bogotá', 'Barrio 20 de julio', 'San Cristóbal');
    es('Bogotá', '7 de agosto', 'Barrios Unidos'); es('Bogotá', 'Siete de Agosto', 'Barrios Unidos');
    es('Bogotá', '12 de octubre', 'Barrios Unidos'); es('Bogotá', 'Primero de Mayo', 'San Cristóbal');
    assert.deepEqual(loc('Bogotá', 'Rincón').opciones.slice().sort(), loc('Bogotá', 'El Rincón').opciones.slice().sort(), '«Rincón» es «El Rincón»');
    es('Bogotá', 'Codito', 'Usaquén', '«Codito» es «El Codito»');
    es('Bogotá', 'Montes', 'Puente Aranda', '«Montes» es «Ciudad Montes»');
    assert.deepEqual(L.llavesBarrio('20 de Julio'), ['20 de julio'], 'el número de delante es el nombre');
    assert.deepEqual(L.llavesBarrio('Sector II Altamar'), ['altamar'], 'detrás de «sector», el número sobra');
    assert.deepEqual(L.llavesBarrio('Timiza A'), ['timiza a', 'timiza']);
    assert.deepEqual(L.llavesBarrio('sur'), [], '«sur» no es un barrio');
  });

  test('la localidad escrita: en «Ciudad», pegada al barrio, o sola en el barrio', () => {
    es('Kennedy', '', 'Kennedy', 'Ciudad «Kennedy» sin barrio');
    assert.equal(loc('Kennedy', '').via, 'ciudad');
    es('Bogotá - Suba', '', 'Suba'); es('Suba (Bogotá)', '', 'Suba'); es('Bogotá, Kennedy', 'Timiza', 'Kennedy');
    es('Bogotá', 'Bosa Recreo', 'Bosa'); es('Bogotá', 'Suba Rincón', 'Suba'); es('Bogotá', 'Altos de Suba', 'Suba');
    es('Bogotá', 'Ciudad Bolívar - Lucero Alto', 'Ciudad Bolívar'); es('Bogotá', 'Engativá Pueblo', 'Engativá');
    es('Bogotá', 'Kennedy', 'Kennedy'); es('Bogotá', 'Usme', 'Usme'); es('Bogotá', 'Mártires', 'Los Mártires'); es('Bogotá', 'Ciudad Kennedy', 'Kennedy');
    es('Bogotá', 'Bogotá Suba', 'Suba');
    /* El nombre de una localidad no se vuelve dudoso por los barrios que empiezan igual. */
    es('Bogotá', 'Chapinero', 'Chapinero'); es('Bogotá', 'Tunjuelito', 'Tunjuelito');
    /* «San Cristóbal Norte» es un barrio de Usaquén: la lista manda sobre el nombre de la localidad. */
    es('Bogotá', 'San Cristóbal Norte', 'Usaquén');
  });

  test('un barrio que está en dos localidades NO se adivina; con la suya escrita, sí', () => {
    const lisboa = loc('Bogotá', 'Lisboa');
    assert.equal(lisboa.estado, 'ambiguo');
    assert.deepEqual(lisboa.opciones.map(nombreLoc).sort(), ['Suba', 'Usaquén']);
    es('Bogotá', 'Lisboa, Suba', 'Suba'); es('Bogotá', 'Lisboa - Usaquén', 'Usaquén'); es('Bogotá', 'Lisboa Suba', 'Suba');
    es('Bogotá - Suba', 'Lisboa', 'Suba', 'la localidad en «Ciudad» desempata');
    assert.equal(loc('Bogotá - Suba', 'Lisboa').via, 'ciudad y barrio');
    for (const b of ['La Aurora', 'El Porvenir', 'Las Margaritas', 'San Antonio', 'La Paz']) assert.equal(loc('Bogotá', b).estado, 'ambiguo', b);
    /* Con el artículo o sin él, lo mismo: si no, «Porvenir» caería donde no cae «El Porvenir». */
    assert.deepEqual(loc('Bogotá', 'Porvenir').opciones.slice().sort(), loc('Bogotá', 'El Porvenir').opciones.slice().sort());
  });

  /* «Lucero» a secas casaba con «El Lucero», de San Cristóbal; «Lucero Alto»,
     «Bajo» y «Medio», donde vive casi todo el que escribe «Lucero», son de
     Ciudad Bolívar. «El Rincón» es de Suba, y «El Rincón de Bosa» y «El
     Rincón de San Cristóbal» son el mismo nombre dicho con su localidad:
     repetido (la revisión antes de publicar). Y al revés: «Rincón de
     Galicia» o «Rincón de Modelia» son otros nombres, y no suman. */
  test('la familia de un barrio cuenta («Lucero» puede ser Lucero Alto); otro nombre que empieza igual, no', () => {
    const lucero = loc('Bogotá', 'Lucero');
    assert.equal(lucero.estado, 'ambiguo');
    assert.ok(lucero.opciones.map(nombreLoc).includes('Ciudad Bolívar'), 'Lucero Alto, Bajo y Medio son de Ciudad Bolívar');
    es('Bogotá', 'Lucero Alto', 'Ciudad Bolívar');
    const rincon = loc('Bogotá', 'El Rincón');
    assert.equal(rincon.estado, 'ambiguo');
    assert.deepEqual(rincon.opciones.map(nombreLoc).sort(), ['Bosa', 'San Cristóbal', 'Suba']);
    assert.ok(Object.keys(IB.barrios).some(k => /^rincon de /.test(k) && !IB.barrios[k].includes('11')), 'precondición: hay un «Rincón de…» fuera de Suba');
    es('Bogotá', 'El Rincón, Suba', 'Suba', 'y se arregla como todo repetido');
  });

  test('«Santa Fe» es una localidad y un barrio de otra: no se escoge; y «Santa Fe de Bogotá» no es Santa Fe', () => {
    const r = loc('Bogotá', 'Santa Fe');
    assert.equal(r.estado, 'ambiguo');
    assert.ok(r.opciones.map(nombreLoc).includes('Santa Fe') && r.opciones.map(nombreLoc).includes('Los Mártires'));
    es('Los Mártires', 'Santa Fe', 'Los Mártires');
    assert.equal(loc('Santa Fe de Bogotá', '').estado, 'vacio', 'la ciudad «Santa Fe de Bogotá» puso al cliente en la localidad Santa Fe');
    assert.equal(loc('Bogotá', 'Santa Fe de Bogotá').estado, 'desconocido');
    assert.equal(loc('Bogotá', 'Bogotá').estado, 'desconocido');
  });

  test('lo que no casa, lo vago y lo vacío quedan sin localidad, cada uno con su porqué', () => {
    const choque = loc('Kennedy', 'Bosa Centro');
    assert.equal(choque.estado, 'choque');
    assert.deepEqual(choque.opciones.map(nombreLoc).sort(), ['Bosa', 'Kennedy']);
    for (const b of ['sur', 'cerca al portal', 'Centro', 'al lado de la iglesia', 'Narnia', 'Kenedy']) assert.equal(loc('Bogotá', b).estado, 'desconocido', b);
    /* Revisión del 14-nov: estos ubicaban, por llaves sacadas de lo de dentro
       de un paréntesis oficial («(ASD)», «(CALLE 131A)», «(MANZANA 0)»…). */
    for (const b of ['asd', 'zona invadida', 'Calle 80', 'calle 72 # 10-34', 'Manzana 5', 'parte media', 'segundo sector', 'II etapa', 'ultima etapa']) {
      assert.equal(loc('Bogotá', b).estado, 'desconocido', b);
    }
    /* Revisión del 15-nov: la cola sale en dos tiempos. «Tunjuelito Rural»
       es de Usme; de un tirón, con la manzana se iba también el «rural» y
       quedaba la localidad Tunjuelito. */
    assert.ok(L.llavesBarrio('Tunjuelito Rural Manzana 4').includes('tunjuelito rural'));
    es('Bogotá', 'Tunjuelito Rural Manzana 4', 'Usme'); es('Bogotá', 'Tunjuelito Rural', 'Usme');
    /* «parte alta», «parte baja» y «parte media» son cola: así escribe
       Planeación «ROCIO ( PARTE BAJA)», y quien vive ahí, sin paréntesis. */
    es('Bogotá', 'Rocío parte baja', 'Santa Fe');
    es('Bogotá', 'Marco Fidel Suárez IV parte alta', 'Rafael Uribe Uribe');
    assert.equal(loc('Bogotá', '').estado, 'vacio');
    assert.equal(loc('Bogotá', '   ').estado, 'vacio');
    assert.equal(loc('Bogotá', null).estado, 'vacio');
    /* «Perdomo» a secas solo se PARECE a uno de la lista: no ubica (ver el
       '«X de <Localidad>»' de abajo). Con su localidad, sí. */
    assert.equal(loc('Bogotá', 'Perdomo').estado, 'desconocido');
    es('Bogotá', 'Perdomo, Ciudad Bolívar', 'Ciudad Bolívar');
  });

  /* Hasta antes de publicarse, un texto que iba DENTRO de un nombre de la
     lista caía donde estuviera ese nombre: «hospital» en Rafael Uribe Uribe
     (por «Hospital San Carlos»), «octubre» en Barrios Unidos (por «Doce de
     Octubre»), «zona 10» en Engativá. Medido contra la lista: 363 palabras
     sueltas y más de cuatro mil trozos. */
  test('un PEDAZO de un nombre de la lista no es ese nombre', () => {
    const llaves = Object.keys(IB.barrios);
    for (const b of ['hospital', 'octubre', 'venezuela', 'medellin', 'carretera', 'puerto', 'familia', 'zona 10', 'de dios', 'Bolívar', 'parque',
      'escuela', 'puente', 'Ismael']) {
      const n = L.normalizar(b);
      assert.ok(llaves.some(k => k !== n && (' ' + k + ' ').includes(' ' + n + ' ')), 'precondición: «' + b + '» va dentro de un nombre de la lista');
      assert.equal(loc('Bogotá', b).estado, 'desconocido', '«' + b + '» cayó en una localidad por ir dentro de otro nombre');
    }
    assert.ok(!('contiene' in IB), 'volvió el índice de «lo lleva en cualquier parte»');
  });

  /* La gente escribe direcciones en «Barrio». La avenida Suba cruza Barrios
     Unidos antes de llegar a Suba, y «Torre 5» no es el barrio «La Torre». */
  test('una dirección no es un barrio: ni la calle que se llama como una localidad, ni «Torre 5»', () => {
    for (const b of ['Avenida Suba', 'Av Suba', 'Av. Suba con 100', 'Calle 80 con Av Suba', 'Vía a Usme', 'Salida a Usme', 'Transversal de Suba',
      'Autopista Sur Bosa', 'Cra 91 Suba', 'Cll 139 # 94-20 Suba', 'AK 68 Kennedy', 'Calle 62', 'Torre 5', 'Casa 3', 'Manzana 12', 'Pueblo', 'Banco']) {
      assert.equal(loc('Bogotá', b).estado, 'desconocido', b);
    }
    /* Con más palabras sí es el nombre de un barrio. */
    es('Bogotá', 'La Torre', 'Ciudad Bolívar'); es('Bogotá', 'Pueblo Viejo', 'Fontibón'); es('Bogotá', 'Banco Central', 'Teusaquillo');
    assert.deepEqual(L.llavesBarrio('Torre 5'), [], '«Torre 5» no nombra nada');
    assert.deepEqual(L.llavesBarrio('Calle 62'), []);
    /* Y lo que viene al lado de la calle se sigue leyendo: el barrio por la lista, la localidad en su trozo. */
    es('Bogotá', 'Av. Suba - Tibabuyes', 'Suba'); es('Bogotá', 'Suba - Av. Suba con 127', 'Suba');
  });

  /* La revisión antes de publicar (14-nov), con textos de todos los días en «Barrio». */
  test('lo que no nombra un barrio no ubica a nadie: el formulario, lo que queda cerca, el país, «de Bogotá»', () => {
    for (const b of ['II etapa', 'Primer sector', 'Segundo sector', 'Parte media', 'Última etapa', '2do sector', 'V sector',
      'Manzana C', 'Calle 80 # 90-12', 'Lote 8', 'Zona 4', 'Carrera 41', 'Hospital', 'Terminal', 'Sur occidental',
      'cerca a Suba', 'entre Bosa y Kennedy', 'límite Bosa Kennedy', 'antes de Usme',
      'Colombia', 'Bogotá, Colombia', 'Cundinamarca', 'Bogotá (Cundinamarca)', 'Sabana de Bogotá', 'Portal de Bogotá']) {
      assert.equal(loc('Bogotá', b).estado, 'desconocido', b);
    }
    /* Lo que sí nombra algo, al lado, se sigue leyendo. */
    es('Kennedy', 'Manzana 5', 'Kennedy'); es('Bogotá', 'Patio Bonito - Calle 38', 'Kennedy');
    es('Bogotá', 'Colombia, Barrios Unidos', 'Barrios Unidos'); es('Barrios Unidos', 'Colombia', 'Barrios Unidos');
    es('Bogotá', 'Kennedy - cerca al éxito', 'Kennedy');
    /* La dirección al final no deja una llave que no es el nombre: queda el nombre, que está en varias localidades. */
    for (const [b, k] of [['La Esperanza calle 45', 'la esperanza'], ['El Paraíso manzana B lote 12', 'el paraiso'], ['Buenavista manzana 7', 'buenavista']]) {
      assert.ok(L.llavesBarrio(b).includes(k), b + ' → ' + JSON.stringify(L.llavesBarrio(b)));
      assert.equal(loc('Bogotá', b).estado, 'ambiguo', b);
    }
  });

  test('el mismo nombre, junto o separado, dice lo mismo', () => {
    const igual = (a, b) => {
      const x = loc('Bogotá', a), y = loc('Bogotá', b);
      assert.equal(x.estado, y.estado, a + ' / ' + b);
      assert.deepEqual((x.opciones || [x.codigo]).slice().sort(), (y.opciones || [y.codigo]).slice().sort(), a + ' / ' + b);
    };
    igual('Santafé', 'Santa Fe'); igual('Barrio Santafé', 'Santa Fe'); igual('Vistahermosa', 'Vista Hermosa');
    igual('Casaloma', 'Casa Loma'); igual('Monte Carlo', 'Montecarlo'); igual('Buena Vista', 'Buenavista');
    assert.equal(loc('Bogotá', 'Santafé').estado, 'ambiguo', '«Santa Fe» es también un barrio de Bosa y de Los Mártires');
    es('Los Mártires', 'Santafé', 'Los Mártires');
  });

  /* Revisión del 14-nov, medida: quitando de la lista cada uno de los 1.000
     nombres urbanos de Catastro, lo que solo casaba por su FAMILIA («Sosiego»
     por «Sosiego Sur», «La Floresta» por «Floresta del Sur») contestaba una
     localidad unas 50 veces y se equivocaba en una de cada cuatro. Ahora la
     familia solo suma duda a lo que ya está en la lista. */
  test('«X de <Localidad>» hace dudoso a «X»; lo que solo se PARECE a un nombre de la lista no ubica a nadie', () => {
    for (const [b, con] of [['San Diego', 'Bosa'], ['Santa Teresa', 'Suba'], ['Puerta del Sol', 'Engativá'], ['Britalia', 'Kennedy']]) {
      const r = loc('Bogotá', b);
      assert.equal(r.estado, 'ambiguo', b);
      assert.ok(r.opciones.map(nombreLoc).includes(con), b + ' también puede ser de ' + con);
    }
    for (const b of ['Federmán', 'Hospital', 'Venezuela', 'Medellín', 'Modelo', 'El Modelo', 'Nariño', 'Perdomo', 'Niza', 'Sosiego',
      'La Floresta', 'El Tunal']) {
      assert.equal(loc('Bogotá', b).estado, 'desconocido', b);
    }
    /* Lo que está en la lista, sí, y su familia lo ensancha. */
    es('Bogotá', 'Toberín', 'Usaquén'); es('Bogotá', 'Nicolás de Federmán', 'Teusaquillo');
    assert.ok(loc('Bogotá', 'Lucero').opciones.map(nombreLoc).includes('Ciudad Bolívar'), 'Lucero Alto, Bajo y Medio');
  });

  test('un barrio que nombra otro municipio no se busca en Bogotá (con el buscador de municipios)', () => {
    const conIdx = (c, b) => L.localidadDe(c, b, IB, IDX);
    for (const b of ['Soacha - Compartir', 'Compartir (Soacha)', 'Soacha - Ricaurte', 'Cajicá - Capellanía', 'Chía - 20 de Julio',
      'Mosquera, Villa Nueva', 'Medellín, Laureles', 'Kennedy, Soacha', 'Medellín']) {
      assert.equal(conIdx('Bogotá', b).estado, 'otro-municipio', b);
    }
    assert.equal(conIdx('Bogotá', 'Soacha - Compartir').municipio, 'Soacha');
    /* Un barrio de Bogotá que se llama como un municipio sigue siendo el barrio; «Colombia» es el país. */
    for (const [b, l] of [['Marsella', 'Kennedy'], ['Marsella, Kennedy', 'Kennedy'], ['Venecia', 'Tunjuelito'], ['Restrepo', 'Antonio Nariño'],
      ['Lisboa, Suba', 'Suba'], ['Kennedy, Colombia', 'Kennedy']]) {
      const r = conIdx('Bogotá', b);
      assert.equal(r.estado, 'ubicado', b + ' → ' + r.estado);
      assert.equal(nombreLoc(r.codigo), l, b);
    }
    /* Sin el buscador, lo de siempre. */
    assert.notEqual(loc('Bogotá', 'Soacha - Compartir').estado, 'otro-municipio');
  });

  test('la localidad pegada delante no se escoge si un barrio de OTRA empieza igual', () => {
    const cand = loc('Bogotá', 'Candelaria Nueva');
    assert.equal(cand.estado, 'ambiguo', '«Candelaria La Nueva» es de Ciudad Bolívar');
    assert.ok(cand.opciones.map(nombreLoc).includes('Ciudad Bolívar') && cand.opciones.map(nombreLoc).includes('La Candelaria'));
    es('Bogotá', 'Candelaria La Nueva', 'Ciudad Bolívar', 'el nombre entero, por la lista');
    assert.deepEqual(loc('Bogotá', 'Chapinero Alto').opciones.map(nombreLoc).sort(), ['Chapinero', 'Teusaquillo'], '«Chapinero Occidental» es de Teusaquillo');
    assert.notEqual(loc('Bogotá', 'Santa Fe Real').estado, 'ubicado');
    assert.equal(loc('Bogotá', 'San Cristóbal Narnia').estado, 'ambiguo', '«San Cristóbal Norte» es de Usaquén');
    /* Se arreglan como todos: con la localidad en su trozo. */
    es('Bogotá', 'Chapinero Alto, Chapinero', 'Chapinero'); es('Bogotá', 'Candelaria Nueva, Ciudad Bolívar', 'Ciudad Bolívar');
    /* Las que no tienen quién empiece igual en otra parte valen solas, delante o detrás. */
    es('Bogotá', 'Suba Narnia', 'Suba'); es('Bogotá', 'Narnia Bosa', 'Bosa'); es('Bogotá', 'Kennedy Hospital', 'Kennedy');
  });

  /* Revisión del 15-nov: «Patio Bonito, Bosa» no casaba y «Patio Bonito
     Bosa» quedaba en Bosa. Es lo mismo escrito sin coma. */
  test('pegada o con coma, lo demás cuenta igual: si es un barrio de OTRA localidad, no casa; si es de ella, la confirma', () => {
    assert.ok(IB.barrios['compartir'] && !IB.barrios['compartir'].includes('11'), 'precondición: la lista tiene «Compartir» fuera de Suba');
    for (const [pegada, conComa] of [['Suba Compartir', 'Suba, Compartir'], ['Patio Bonito Bosa', 'Patio Bonito, Bosa'],
      ['Bosa Patio Bonito', 'Bosa, Patio Bonito'], ['Timiza Suba', 'Timiza, Suba']]) {
      assert.equal(loc('Bogotá', pegada).estado, 'choque', pegada);
      assert.equal(loc('Bogotá', conComa).estado, 'choque', conComa);
    }
    es('Bogotá', 'Lisboa Suba', 'Suba'); es('Bogotá', 'Portal de Suba', 'Suba'); es('Bogotá', 'Usme Pueblo', 'Usme');
    /* «Santa Fe» pegada es dudosa (es también un barrio de Los Mártires); con un barrio de Santa Fe al lado, no. */
    es('Bogotá', 'Las Cruces Santa Fe', 'Santa Fe'); es('Bogotá', 'Santa Fe Las Cruces', 'Santa Fe');
    assert.equal(loc('Bogotá', 'Narnia Santa Fe').estado, 'ambiguo');
  });

  /* «Si el barrio está en dos localidades, escribe la suya al lado ("Lisboa,
     Suba") o ponla en "Ciudad" detrás de Bogotá: "Bogotá - Suba"», dice la
     pestaña. Escribirla al lado vale con un barrio repetido y con uno que no
     está en la lista, sin la duda de si la localidad es parte de un nombre,
     salvo con las seis localidades que se llaman también como un barrio: con
     esas, la fila dice que la ponga en «Ciudad» (secciones 10 y 11). Lo que no
     hace es ganarle a la lista: «Patio Bonito, Bosa» no casa, igual que Bosa
     en «Ciudad» con Patio Bonito en «Barrio» (hasta la revisión antes de
     publicar, la localidad escrita ganaba). */
  test('con un signo en medio, el trozo que ES una localidad lo es; la lista lo estrecha o le lleva la contraria', () => {
    es('Bogotá', 'Narnia, Kennedy', 'Kennedy'); es('Bogotá', 'Narnia - Tunjuelito', 'Tunjuelito');
    es('Bogotá', 'Lisboa, Suba', 'Suba');
    for (const b of ['Patio Bonito, Bosa', 'Lisboa, Kennedy', 'Villa Nueva, Bosa', 'Lucero, Suba', 'Tibabuyes, Usme']) {
      assert.equal(loc('Bogotá', b).estado, 'choque', b);
    }
    assert.equal(loc('Bosa', 'Patio Bonito').estado, 'choque', 'lo mismo, con la localidad en «Ciudad»');
    assert.equal(loc('Bogotá', 'Kennedy, Bosa Centro').estado, loc('Bogotá', 'Bosa Centro, Kennedy').estado, 'el orden no cambia nada');
    es('Bogotá', 'Kennedy - cerca al éxito', 'Kennedy'); es('Bogotá', 'Lisboa, Localidad de Suba', 'Suba');
    es('Bogotá - Localidad de Kennedy', '', 'Kennedy'); es('Localidad Suba', 'Lisboa', 'Suba');
    /* Dos localidades en sus trozos tienen que casar. */
    es('Bogotá', 'Santa Fe (Mártires)', 'Los Mártires', 'el barrio Santa Fe es de Los Mártires');
    assert.equal(loc('Bogotá', 'Kennedy / Bosa').estado, 'choque');
    assert.equal(loc('Bogotá', 'Bosa Recreo, Kennedy').estado, 'choque', 'el otro trozo también nombra una localidad');
    /* Un nombre entero de la lista manda, y la localidad en su trozo solo lo estrecha. */
    es('Bogotá', 'San Cristóbal - Norte', 'Usaquén'); es('Bogotá', 'Chapinero - Occidental', 'Teusaquillo');
    assert.deepEqual(loc('Bogotá', 'El Paraíso Bosa').opciones.map(nombreLoc).sort(), ['Bosa', 'Kennedy']);
    es('Bogotá', 'El Paraíso, Bosa', 'Bosa');
  });

  /* Revisión del 15-nov: seis localidades se llaman también como un barrio
     de OTRA. Con un trozo que no dice nada al lado, el cliente caía en la
     localidad («Sumapaz, Torre 3»: en el páramo); con dos que solo casaban en
     una tercera, en esa tercera («Santa Fe, Antonio Nariño»: en Bosa). */
  test('la localidad que también es un barrio de otra vale sola solo si algo la confirma; dos que no casan no dan una tercera', () => {
    assert.ok(IB.barrios['santa fe'] && IB.barrios['sumapaz'], 'precondición: «Santa Fe» y «Sumapaz» son también barrios de la lista');
    for (const b of ['Santa Fe - Centro', 'Sumapaz, Torre 3', 'Narnia, Santa Fe', 'Antonio Nariño, Casa 5', 'La Candelaria - Conjunto']) {
      const r = loc('Bogotá', b);
      assert.notEqual(r.estado, 'ubicado', b + ' → ' + (r.codigo && nombreLoc(r.codigo)));
    }
    es('Bogotá', 'Las Cruces, Santa Fe', 'Santa Fe', 'Las Cruces está en Santa Fe: la confirma');
    /* La confirma también un barrio que está en ella Y en otra donde hay un
       barrio con su nombre: «Santa Inés» está en Santa Fe y en Bosa, y Bosa
       tiene un barrio «Santa Fe». Cruzar a secas daría «Santa Fe o Bosa»;
       pegada, ya daba Santa Fe, y con coma o sin ella tiene que dar lo mismo. */
    assert.ok(IB.barrios['santa ines'].includes('03') && IB.barrios['santa ines'].includes('07') && IB.barrios['santa fe'].includes('07'),
      'precondición: «Santa Inés» en Santa Fe y en Bosa; un barrio «Santa Fe» en Bosa');
    for (const b of ['Santa Inés, Santa Fe', 'Santa Inés Santa Fe']) es('Bogotá', b, 'Santa Fe', b);
    for (const b of ['Las Vegas, Sumapaz', 'Las Vegas Sumapaz']) es('Bogotá', b, 'Sumapaz', b);
    es('Bogotá', 'Narnia, Localidad de Santa Fe', 'Santa Fe', '«Localidad de…» no es un barrio');
    es('Bogotá', 'Santa Fe, Los Mártires', 'Los Mártires', 'el arreglo que enseña la pestaña');
    for (const b of ['Santa Fe, Antonio Nariño', 'Santa Fe - Antonio Nariño', 'Santa Fe (Antonio Nariño)', 'Santa Fe Antonio Nariño',
      'Teusaquillo La Candelaria', 'Candelaria Sumapaz']) {
      const r = loc('Bogotá', b);
      assert.equal(r.estado, 'choque', b + ' → ' + r.estado + ' ' + (r.opciones || []).map(nombreLoc));
    }
    /* Barrido: dos localidades, con su nombre, nunca caen en una tercera. */
    const nombres = Object.keys(IB.porNombre), terceras = [];
    for (const a of nombres) for (const b of nombres) {
      if (a === b) continue;
      for (const t of [a + ', ' + b, a + ' ' + b]) {
        const r = loc('Bogotá', t);
        if (r.estado === 'ubicado' && r.codigo !== IB.porNombre[a] && r.codigo !== IB.porNombre[b]) terceras.push(t + ' → ' + nombreLoc(r.codigo));
      }
    }
    assert.deepEqual(terceras, []);
  });

  test('un barrio sobre el límite de dos localidades queda repetido, y se arregla como los demás', () => {
    for (const [b, dos] of [['Las Aguas', ['La Candelaria', 'Santa Fe']], ['Jorge Uribe Botero', ['Bosa', 'Kennedy']], ['Meissen', ['Ciudad Bolívar', 'Tunjuelito']]]) {
      const r = loc('Bogotá', b);
      assert.equal(r.estado, 'ambiguo', b);
      assert.deepEqual(r.opciones.map(nombreLoc).sort(), dos, b);
    }
    es('Bogotá', 'Las Aguas, La Candelaria', 'La Candelaria'); es('Bogotá - Santa Fe', 'Las Aguas', 'Santa Fe');
    es('Bogotá', 'Gran Britalia', 'Kennedy', 'menos de la décima parte en Bosa');
  });

  /* «Gran Britalia» es de Kennedy, y quien vive ahí escribe «Britalia», que
     en la lista es un barrio de Suba. */
  test('un nombre que ya es un barrio también puede ser su «Gran…» o su «Nuevo…»: queda repetido', () => {
    assert.deepEqual(loc('Bogotá', 'Britalia').opciones.map(nombreLoc).sort(), ['Kennedy', 'Suba']);
    es('Bogotá', 'Britalia Norte', 'Suba'); es('Bogotá', 'Gran Britalia', 'Kennedy');
    assert.equal(loc('Bogotá', 'Milenio').estado, 'desconocido', '«Nuevo Milenio» no hace barrio a «Milenio»');
    es('Bogotá', 'Nuevo Milenio', 'Engativá');
  });

  test('de la ficha: primero el barrio de la ficha (el que Joan corrigió), si no el del registro', () => {
    assert.equal(nombreLoc(L.localidadDeCliente({ ciudad: 'Bogotá', barrio: 'Timiza', vinculacion: { barrio: 'Tibabuyes' } }, IB).codigo), 'Kennedy');
    assert.equal(nombreLoc(L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { barrio: 'Tibabuyes' } }, IB).codigo), 'Suba');
    assert.equal(nombreLoc(L.localidadDeCliente({ ciudad: '', vinculacion: { ciudad: 'Kennedy', barrio: '' } }, IB).codigo), 'Kennedy');
    assert.equal(L.localidadDeCliente(null, IB).estado, 'vacio');
  });

  /* Revisión del 14-nov: con la ficha en «Bogotá» sin barrio y el registro en
     Soacha / «Compartir», el cliente salía UBICADO en Ciudad Bolívar por un
     barrio que se escribió para otro municipio. */
  /* Revisión del 15-nov: el registro de una localidad se lee con ella, y un
     barrio del registro se tira solo si su ciudad es OTRO municipio. */
  test('el barrio del registro se lee con la ciudad del registro; se tira solo si es de otro municipio, y se dice', () => {
    const cli = (ficha, reg) => L.localidadDeCliente(Object.assign({ barrio: '' }, ficha, { vinculacion: reg }), IB, IDX);
    for (const ficha of [{ ciudad: '' }, { ciudad: 'Bogotá' }, { ciudad: 'Bogotá D.C.' }]) {
      assert.equal(cli(ficha, { ciudad: 'Suba', barrio: 'Patio Bonito' }).estado, 'choque', JSON.stringify(ficha));
    }
    assert.equal(nombreLoc(cli({ ciudad: 'Kennedy' }, { ciudad: 'Suba', barrio: 'Patio Bonito' }).codigo), 'Kennedy', 'la ciudad que corrigió Joan manda');
    assert.equal(nombreLoc(cli({ ciudad: 'Bogotá' }, { ciudad: 'Bogtá', barrio: 'Timiza' }).codigo), 'Kennedy', 'una errata no es otra ciudad');
    assert.equal(nombreLoc(cli({ ciudad: 'Bogotá' }, { ciudad: 'Engativá Pueblo', barrio: 'Engativá Centro' }).codigo), 'Engativá');
    /* Una localidad que se llama como un municipio de fuera («Candelaria»:
       hay una en el Atlántico y otra en el Valle) es la localidad: el barrio
       no se tira. */
    const u = L.ubicar('Candelaria', '', IDX), cs = u.codigo ? [u.codigo] : (u.opciones || []);
    assert.ok(cs.length && !cs.includes(IB.municipio), 'precondición: «Candelaria» a secas es solo de fuera de Bogotá');
    assert.equal(nombreLoc(cli({ ciudad: 'Bogotá' }, { ciudad: 'Candelaria', barrio: 'Egipto' }).codigo), 'La Candelaria');
    for (const reg of [{ ciudad: 'Soacha', barrio: 'Compartir' }, { ciudad: 'Mosquera', barrio: 'Porvenir' }, { ciudad: 'Cundinamarca', barrio: 'Timiza' }]) {
      const r = cli({ ciudad: 'Bogotá' }, reg);
      assert.equal(r.estado, 'vacio', reg.ciudad);
      assert.equal(r.registro, reg.ciudad, 'la pestaña tiene que poder decir por qué');
    }
  });

  test('el barrio del registro solo vale si el registro también es de Bogotá: «Compartir» de Soacha no es Ciudad Bolívar', () => {
    const de = (ficha, registro) => L.localidadDeCliente(Object.assign({ ciudad: 'Bogotá', barrio: '' }, ficha, { vinculacion: registro }), IB, IDX);
    assert.equal(nombreLoc(L.localidadDe('Bogotá', 'Compartir', IB).codigo), 'Ciudad Bolívar', 'precondición: «Compartir» también es de Bogotá');
    for (const [ciudad, barrio] of [['Soacha', 'Compartir'], ['Medellín', 'Castilla'], ['Barranquilla', 'El Prado'], ['Soacha', 'Ciudadela Sucre']]) {
      assert.equal(de({}, { ciudad, barrio }).estado, 'vacio', ciudad + ' / ' + barrio);
    }
    for (const ciudad of ['Bogotá', 'Bogota D.C.', 'Kennedy', 'Bogotá, Cundinamarca', 'BOGOTA', '']) {
      assert.equal(nombreLoc(de({}, { ciudad, barrio: 'Timiza' }).codigo), 'Kennedy', 'registro en «' + ciudad + '»');
    }
    /* Sin el buscador de municipios, «Bogotá, Cundinamarca» no se reconoce: no ubica (no adivina). */
    assert.equal(L.localidadDeCliente({ ciudad: 'Bogotá', vinculacion: { ciudad: 'Bogotá, Cundinamarca', barrio: 'Timiza' } }, IB).estado, 'vacio');
    /* El barrio de la ficha manda, venga de donde venga el registro. */
    assert.equal(nombreLoc(de({ barrio: 'Timiza' }, { ciudad: 'Soacha', barrio: 'Compartir' }).codigo), 'Kennedy');
    /* Y la ficha sin ciudad toma las dos cosas del registro. */
    assert.equal(nombreLoc(L.localidadDeCliente({ vinculacion: { ciudad: 'Bogotá', barrio: 'Tibabuyes' } }, IB, IDX).codigo), 'Suba');
  });
});

/* ==========================================================================
 * 3 · Zonas, nunca puntos
 * ======================================================================== */
describe('3 · ni GPS, ni IP, ni dirección: solo «Ciudad» y «Barrio»', () => {
  const ficha = { id: 's1', ciudad: 'Bogotá', barrio: '', direccion: 'Calle 38 Sur # 86-20, Patio Bonito', departamento: '',
    ubicacion: { lat: 4.6316, lng: -74.156, acc: 12 }, huellaRegistro: { ip: '190.0.0.1', gps: { lat: 4.63, lng: -74.15 } },
    vinculacion: { ciudad: 'Bogotá', barrio: '', direccion: 'Carrera 80 con 38 sur, Kennedy', ubicacion_ip: { ciudad: 'Bogotá', region: 'Kennedy' }, lat: 4.63, lng: -74.15 } };

  test('con el GPS en Kennedy y la dirección en Patio Bonito, sin barrio queda sin localidad', () => {
    assert.equal(L.localidadDeCliente(ficha, IB).estado, 'vacio');
    assert.equal(L.localidadDeCliente(Object.assign({}, ficha, { barrio: 'Lisboa' }), IB).estado, 'ambiguo', 'el GPS desempató un barrio repetido');
  });

  /* No por lo que el código DICE, sino por lo que LEE: una ficha que anota cada
     campo que se le pide. */
  test('de la ficha no se lee nada más que ciudad, departamento, barrio y lo mismo del registro', () => {
    const leidos = new Set();
    const espia = (o, pref) => new Proxy(o, { get(t, k) {
      if (typeof k === 'string') leidos.add(pref + k);
      const v = t[k];
      return v && typeof v === 'object' ? espia(v, pref + String(k) + '.') : v;
    } });
    const MC = fresco();
    const db = { socios: [espia(Object.assign({ numero: 1, nombre: 'Persona s1' }, ficha, { barrio: 'Timiza' }), '')], prestamos: [] };
    const r = MC.resumir(db, MAPA, P, BOGOTA);
    assert.equal(r.bogota.porLoc['08'].clientes, 1, 'precondición: el cliente cayó en Kennedy');
    const permitidos = ['id', 'numero', 'nombre', 'ciudad', 'departamento', 'barrio', 'vinculacion', 'vinculacion.ciudad', 'vinculacion.departamento', 'vinculacion.barrio'];
    assert.deepEqual([...leidos].filter(k => !permitidos.includes(k)), [], 'el mapa leyó de la ficha algo que no es la ciudad ni el barrio');
  });

  test('los dos archivos no nombran la dirección, y siguen sin nombrar coordenadas', () => {
    for (const f of ['panel/mapa-lugares.js', 'panel/mapa-clientes.js']) {
      const codigo = sinComentarios(leer(f));
      for (const x of ['direccion', 'ubicacion', '.lat', '.lng', 'latitud', 'longitud', 'geolocation', 'coords', 'huella']) {
        assert.ok(!codigo.includes(x), f + ' menciona «' + x + '» fuera de un comentario');
      }
    }
  });

  test('el barrio no se pinta ni se cuenta: en la pantalla no sale el de ningún cliente', async () => {
    const db = cartera([['Bogotá', 'Timiza', 'pagado'], ['Bogotá', 'Timiza', ''], ['Bogotá', 'Timiza', ''], ['Bogotá', 'Tibabuyes', '']]);
    const { M } = await enBogota(db);
    assert.match(M.caja.innerHTML, /<span>Kennedy<\/span><b>3<\/b>/);
    assert.doesNotMatch(M.caja.innerHTML, /Timiza|Tibabuyes/i, 'el barrio de un cliente ubicado salió en la pantalla');
  });
});

/* ==========================================================================
 * 4 · Las cuentas: cada cliente en su localidad, y el «1–2» un piso más abajo
 * ======================================================================== */
describe('4 · las cuentas de Bogotá', () => {
  const MC = fresco();
  const BASE = [...veces(4, ['Bogotá', 'Patio Bonito', 'pagado']), ...veces(3, ['Kennedy', '', '']),
    ['Bogotá', 'Tibabuyes', 'pagado'], ['Bogotá', 'Suba Rincón', ''], ['Bogotá', 'Lisboa', 'pagado'], ['Bogotá', 'sur', ''], ['Bogotá', '', ''],
    ['Soacha', 'Compartir', ''], ['Medellín', 'Robledo', '']];

  test('cada cliente de Bogotá cae en su localidad, o queda sin localidad sin dejar de ser de Bogotá', () => {
    const r = MC.resumir(cartera(BASE), MAPA, P, BOGOTA);
    assert.equal(r.porMuni['11001'].clientes, 12);
    assert.deepEqual(r.bogota.porLoc, { '08': { clientes: 7, pagaron: 4 }, '11': { clientes: 2, pagaron: 1 } });
    assert.deepEqual(r.bogota.sinLoc.map(x => [x.numero, x.texto, x.estado]), [[10, 'Lisboa', 'ambiguo'], [11, 'sur', 'desconocido'], [12, '', 'vacio']]);
    assert.deepEqual(r.bogota.sinLoc[0].opciones.slice().sort(), ['Suba', 'Usaquén'], 'las opciones, con su nombre');
    assert.equal(Object.values(r.bogota.porLoc).reduce((t, k) => t + k.clientes, 0) + r.bogota.sinLoc.length, r.porMuni['11001'].clientes, 'se perdió un cliente');
    /* Los de fuera de Bogotá no entran en esta cuenta, tengan el barrio que tengan. */
    assert.equal(r.porMuni['25754'].clientes, 1);
  });

  test('sin el archivo de Bogotá, Bogotá es un municipio más (como antes del 14-nov)', () => {
    const r = MC.resumir(cartera(BASE), MAPA, P);
    assert.equal(r.bogota, null);
    assert.deepEqual(r.rangos['11001'], { min: 12, max: 12 });
  });

  /* «Bogotá 9» exacto en una pantalla y «Kennedy 4, Suba 3, Bosa 1–2» en otra:
     restando, Bosa tiene 2. Es la resta que el revisor del 9-nov hizo con los
     departamentos, un piso más abajo. */
  test('el total de Bogotá es la suma de lo que se VE de sus partes: con un «1–2» adentro, va en rango', () => {
    const r = MC.resumir(cartera(BASE), MAPA, P, BOGOTA);
    // Kennedy 7 + Suba [1,2] + sin localidad 3 = 11–12 (el exacto es 12).
    assert.deepEqual(r.rangos['11001'], { min: 11, max: 12 });
    assert.deepEqual(r.porDepto['11'].rango, { min: 11, max: 12 }, 'el departamento de Bogotá suma lo mismo');
    // Colombia: Bogotá 11–12 + Soacha [1,2] + Medellín [1,2] = 13–16.
    assert.deepEqual(r.rango, { min: 13, max: 16 });
    /* Los sin localidad son una parte más: con uno o dos, también «1–2». */
    const r2 = MC.resumir(cartera([...veces(3, ['Kennedy', '', '']), ['Bogotá', 'sur', '']]), MAPA, P, BOGOTA);
    assert.deepEqual(r2.rangos['11001'], { min: 4, max: 5 });
    /* Y todos exactos: exacto. */
    const r3 = MC.resumir(cartera([...veces(3, ['Kennedy', '', '']), ...veces(3, ['Suba', '', ''])]), MAPA, P, BOGOTA);
    assert.deepEqual(r3.rangos['11001'], { min: 6, max: 6 });
  });

  test('una localidad se conquista con 3 que pagaron entero; Bogotá sigue siendo UNO de los 1.122', () => {
    const db = cartera([...veces(3, ['Kennedy', '', 'pagado']), ...veces(2, ['Suba', '', 'pagado']), ['Suba', '', 'perdida'], ['Bosa', '', 'abierto']]);
    const r = MC.resumir(db, MAPA, P, BOGOTA);
    assert.deepEqual(r.bogota.porLoc, { '08': { clientes: 3, pagaron: 3 }, '11': { clientes: 3, pagaron: 2 }, '07': { clientes: 1, pagaron: 0 } });
    const q = MC.conquistas(r, MAPA);
    assert.deepEqual(q.conquistados.map(x => x.c), ['11001'], 'Bogotá, una vez');
    assert.equal(q.total, 1122, 'abrir Bogotá no le suma municipios a Colombia');
    assert.equal(q.conClientes, 1);
  });

  /* Revisión del 14-nov: Bogotá se conquistaba con su cifra EXACTA de pagados.
     Con Kennedy y Suba en «faltan 1–2», «Bogotá faltan 1–2» decía que en cada
     una pagó exactamente 1, y «conquistado», que en una pagaron 2. */
  test('Bogotá se conquista con lo que se VE de los que pagaron en sus partes; si no alcanza, «falta 1 o ninguno»', async () => {
    const q = filas => MC.conquistas(MC.resumir(cartera(filas), MAPA, P, BOGOTA), MAPA);
    const bogota = r => r.conquistados.concat(r.porConquistar).find(x => x.c === '11001');
    const A = [['Kennedy', '', 'pagado'], ['Kennedy', '', ''], ['Kennedy', '', ''], ['Suba', '', 'pagado'], ['Suba', '', ''], ['Suba', '', '']];
    const B = [['Kennedy', '', 'pagado'], ['Kennedy', '', 'pagado'], ['Kennedy', '', ''], ['Suba', '', 'pagado'], ['Suba', '', ''], ['Suba', '', '']];
    assert.equal(bogota(q(A)).q, 'duda'); assert.equal(bogota(q(B)).q, 'duda');
    assert.deepEqual(q(B).conquistados, [], 'con 3 pagados (2 + 1) tampoco se cuenta: lo que se ve no lo asegura');
    /* Uno que pagó sin localidad y otro en Kennedy: 2 de verdad, 2 a 4 a la vista. */
    assert.equal(bogota(q([['Kennedy', '', 'pagado'], ['Bogotá', 'sur', 'pagado']])).q, 'duda');
    /* Cuando lo que se ve basta, se dice. */
    assert.equal(bogota(q([...veces(3, ['Kennedy', '', 'pagado']), ['Suba', '', 'pagado']])).q, 'si', '3 + 1–2: seguro');
    assert.equal(bogota(q([...veces(3, ['Kennedy', '', 'pagado']), ...veces(3, ['Suba', '', 'pagado'])])).q, 'si');
    assert.equal(bogota(q([...veces(2, ['Kennedy', '', 'pagado']), ['Suba', '', '']])).q, 'no12', 'una sola parte con 1–2: «faltan 1–2»');
    assert.equal(bogota(q([['Kennedy', '', ''], ['Suba', '', '']])).q, 'no3');
    /* Sin el archivo de Bogotá, Bogotá es un municipio sin partes: su cifra, como antes. */
    assert.equal(MC.conquistas(MC.resumir(cartera(B), MAPA, P), MAPA).conquistados.length, 1);
    /* Y en la pantalla de Colombia, A y B (iguales por dentro) se ven iguales. */
    const verQ = async filas => (await abrirCon(cartera(filas), { vista: 'conquistas' })).M.caja.innerHTML;
    const ha = await verQ(A), hb = await verQ(B);
    assert.equal(ha, hb, 'Conquistas de Colombia cambia según cuántos pagaron dentro de un «faltan 1–2»');
    assert.match(ha, /<title>Bogotá, D\.C\. · 6 clientes · falta 1 o ninguno para conquistarlo<\/title>/);
    assert.match(ha, /<path class="mapa-q con" data-mapa="muni" data-c="11001"/, 'se pinta «con clientes», no conquistado');
    assert.deepEqual(lista(ha, 'Por conquistar'), [['Bogotá, D.C.', 'falta 1 o ninguno']]);
  });
});

/* ==========================================================================
 * 5 · La pantalla
 * ======================================================================== */
describe('5 · Bogotá y la Sabana, en la pestaña', () => {
  const DB = cartera([...veces(4, ['Bogotá', 'Patio Bonito', 'pagado']), ...veces(3, ['Kennedy', '', '']),
    ...veces(3, ['Suba', '', 'pagado']), ['Bogotá', 'Bosa Centro', 'pagado'], ['Bosa', '', 'pagado'], ['Bogotá', 'Quiroga', ''],
    ['Bogotá', 'Lisboa', ''], ['Bogotá', 'sur', ''], ['Bogotá', '', ''], ['Kennedy', 'Bosa Centro', ''],
    ...veces(4, ['Soacha', 'Compartir', 'pagado']), ['Funza', '', ''], ['Medellín', '', '']]);

  test('los dos archivos se piden juntos; si falta el de Bogotá no hay mapa a medias, y se puede reintentar', async () => {
    const MC = fresco();
    const pedidos = [];
    const caja = { innerHTML: '', addEventListener() {}, querySelector: () => null, contains: () => true };
    const sinBogota = u => { pedidos.push(u); return /bogota-/.test(u) ? Promise.resolve({ ok: false, status: 404 }) : pedirMapa(u); };
    assert.equal(await MC.abrir({ caja, db: DB, puente: P, pedir: sinBogota }), false);
    assert.deepEqual(pedidos.slice().sort(), ['mapa/bogota-2026-11.json', 'mapa/colombia-2026-11b.json']);
    assert.match(caja.innerHTML, /No pude bajar el mapa \(el servidor contestó 404\)/);
    assert.match(caja.innerHTML, /data-mapa="reintentar"/);
    assert.doesNotMatch(caja.innerHTML, /<svg/, 'pintó un mapa a medias');
    /* Un archivo que no es el de Bogotá (un service worker que contesta otra cosa). */
    const MC2 = fresco();
    assert.equal(await MC2.abrir({ caja, db: DB, puente: P, pedir: () => pedirMapa('colombia') }), false);
    assert.match(caja.innerHTML, /llegó un archivo que no es el mapa de Bogotá/);
    /* Y con los dos, sí. */
    assert.equal(await MC2.abrir({ caja, db: DB, puente: P, pedir: pedirMapa }), true);
    assert.match(caja.innerHTML, /<svg class="mapa-svg/);
    assert.equal(MC.URL_BOGOTA, 'mapa/bogota-2026-11.json');
  });

  /* La revisión antes de publicar: el reintento de arriba usa un `pedir` de
     mentira que no pasa por el service worker. Este pasa por sw.js de verdad,
     cuya rama caché-primero guardaba CUALQUIER respuesta: un 503 en la primera
     bajada quedaba servido hasta la versión siguiente, sin volver a la red. */
  test('un tropiezo del servidor con el archivo de Bogotá no se queda guardado en el service worker: «↻ Reintentar» lo vuelve a pedir', async () => {
    const ORIGEN = 'https://tugarantia.net/';
    const urlDe = q => (typeof q === 'string' ? new URL(q, ORIGEN).href : q.url);
    const guardado = new Map();
    const cache = {
      match: async q => { const v = guardado.get(urlDe(q)); return v ? new Response(v.cuerpo, { status: v.status }) : undefined; },
      put: async (q, res) => { guardado.set(urlDe(q), { status: res.status, cuerpo: Buffer.from(await res.arrayBuffer()) }); }
    };
    const caches = { open: async () => cache, match: q => cache.match(q), keys: async () => [], delete: async () => true };
    let tropieza = true;
    const alServidor = [];
    const servidor = async q => {
      const ruta = new URL(urlDe(q)).pathname;
      alServidor.push(ruta);
      if (/bogota-/.test(ruta)) {
        return tropieza ? new Response('<html><body><h1>503 Service Unavailable</h1></body></html>', { status: 503 })
          : new Response(JSON.stringify(BOGOTA));
      }
      return new Response(JSON.stringify(MAPA));
    };
    const oyentes = {};
    const self = { location: new URL(ORIGEN + 'sw.js'), addEventListener: (t, f) => { oyentes[t] = f; },
      skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } };
    vm.runInContext(leer('sw.js'), vm.createContext({ self, caches, fetch: servidor, Request, Response, URL, Promise, Set, Map, console }),
      { filename: 'sw.js' });
    /* Lo que recibe la página: lo que conteste el service worker, o la red si lo deja pasar. */
    const pedir = u => {
      const req = new Request(new URL(u, ORIGEN + 'panel/crm.html').href);
      let p = null;
      oyentes.fetch({ request: req, respondWith: x => { p = x; } });
      return p || servidor(req);
    };
    const deBogota = () => alServidor.filter(r => /bogota-/.test(r)).length;
    const caja = { innerHTML: '', addEventListener() {}, querySelector: () => null, contains: () => true };
    const MC = fresco();
    const o = { caja, db: DB, puente: P, pedir };
    assert.equal(await MC.abrir(o), false);
    assert.match(caja.innerHTML, /No pude bajar el mapa \(el servidor contestó 503\)/);
    await espera(5);   // lo que el service worker guarda va por detrás de la respuesta
    tropieza = false;
    assert.equal(await MC.abrir(o), true, '«↻ Reintentar» recibió el error guardado: ' + caja.innerHTML.slice(0, 140));
    assert.match(caja.innerHTML, /<svg class="mapa-svg/);
    assert.equal(deBogota(), 2, 'el reintento no llegó al servidor');
    /* Lo que sí llegó bien se guarda, como siempre: recargar el CRM ya no va al servidor. */
    await espera(5);
    assert.equal(await fresco().abrir({ caja, db: DB, puente: P, pedir }), true);
    assert.equal(deBogota(), 2, 'lo que llegó bien no quedó guardado');
    assert.equal(guardado.get(ORIGEN + 'panel/mapa/bogota-2026-11.json').status, 200);
  });

  /* La misma revisión, con versiones mezcladas (un mapa-lugares.js viejo con
     el mapa-clientes.js nuevo): la pestaña se quedaba en «Bajando…» y, al
     segundo toque, pintaba Bogotá con su total EXACTO y sin localidades. */
  test('si dibujar revienta, la pestaña lo dice, y la segunda vez no pinta Bogotá sin sus localidades', async () => {
    const original = L.indiceBogota;
    L.indiceBogota = () => { throw new TypeError('L.indiceBogota is not a function'); };
    try {
      const MC = fresco();
      const caja = { innerHTML: '', addEventListener() {}, querySelector: () => null, contains: () => true };
      const o = { caja, db: DB, puente: P, pedir: pedirMapa };
      assert.equal(await MC.abrir(o), false);
      assert.match(caja.innerHTML, /El mapa no se pudo dibujar \(L\.indiceBogota is not a function\)\. Recarga el CRM con Ctrl\+Shift\+R/);
      assert.doesNotMatch(caja.innerHTML, /Bajando el mapa/);
      assert.equal(await MC.abrir(o), false, 'la segunda vez encontró «ya armado» un índice que nunca se armó');
      assert.doesNotMatch(caja.innerHTML, /<svg/);
    } finally {
      L.indiceBogota = original;
    }
  });

  test('tocar Bogotá es entrar: en el mapa de Colombia, en la lista, dentro de Cundinamarca y en Conquistas', async () => {
    const { M, E } = await abrirCon(DB);
    assert.match(M.info.textContent || M.caja.innerHTML, /Bogotá se abre por localidades/);
    M.clic(M.zona('11001'), { clientX: 300, clientY: 300 });
    assert.equal(E.depto, '11', 'tocar la marca de Bogotá en Colombia no la abrió');
    assert.match(M.caja.innerHTML, /Bogotá, localidad por localidad/);
    M.clic(M.boton({ 'data-mapa': 'pais' }));
    assert.equal(E.depto, null, '«← Toda Colombia» no volvió');
    M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '11' }));
    assert.equal(E.depto, '11', 'la fila «Bogotá D.C.» de la lista no la abrió');
    M.clic(M.boton({ 'data-mapa': 'pais' })); M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '25' }));
    assert.match(M.caja.innerHTML, /Cundinamarca · [\d–]+ clientes · toca un municipio\. Bogotá se abre por localidades\./);
    M.clic(M.boton({ 'data-mapa': 'muni', 'data-c': '11001' }));
    assert.equal(E.depto, '11', 'la fila de Bogotá en «También en este mapa» no la abrió');
    /* En Conquistas también, y sin salirse de Conquistas. */
    M.clic(M.boton({ 'data-mapa': 'pais' })); M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' }));
    assert.equal(E.depto, null);
    M.clic(M.boton({ 'data-mapa': 'muni', 'data-c': '11001' }));
    assert.equal(E.depto, '11'); assert.equal(E.vista, 'conquistas');
    assert.match(M.caja.innerHTML, /Localidades conquistadas/);
    /* Cambiar de vista estando dentro no saca de Bogotá. */
    M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'deptos' }));
    assert.equal(E.depto, '11'); assert.equal(E.vista, 'deptos');
    /* Un municipio cualquiera se sigue marcando, no se «abre». */
    M.clic(M.zona('25754'), { clientX: 300, clientY: 300 });
    assert.equal(E.depto, '11');
    assert.equal(M.info.textContent, 'Soacha (Cundinamarca) · 4 clientes');
  });

  test('un cliente de Bogotá con el barrio de otro municipio sale sin localidad, y la pestaña dice cuál', async () => {
    const { M } = await enBogota(cartera([['Bogotá', 'Soacha - Compartir', ''], ['Bogotá', 'Patio Bonito', '']]));
    assert.match(M.caja.innerHTML, /· barrio «Soacha - Compartir»<div class="muted">El barrio nombra otro municipio \(Soacha\): si vive allá, corrige «Ciudad»\.<\/div>/);
  });

  test('la vista: 19 localidades y sus vecinos con su color, el contorno encima y el fondo debajo', async () => {
    const { M, E } = await enBogota(DB);
    const h = M.caja.innerHTML;
    const locs = [...h.matchAll(/<path class="mapa-z t(\d) mapa-loc" data-mapa="loc" data-c="(L\d\d)"/g)].map(m => [m[2], m[1]]);
    assert.equal(locs.length, 19, 'las 19 localidades que caben en la ventana');
    const tramo = Object.fromEntries(locs);
    // Kennedy 7 → «3 a 9» (t2); Suba 3 → t2; Bosa 2 y Rafael Uribe 1 → «1–2» (t1); Usaquén 0 → t0.
    assert.deepEqual([tramo.L08, tramo.L11, tramo.L07, tramo.L18, tramo.L01], ['2', '2', '1', '1', '0']);
    assert.ok(!h.includes('data-c="L20"><title>'), 'Sumapaz no tiene forma en la ventana');
    const vecinos = [...h.matchAll(/<path class="mapa-z t(\d)" data-mapa="muni" data-c="(\d{5})"/g)].map(m => m[2]);
    assert.equal(vecinos.length, BOGOTA.vecinos.length);
    assert.match(h, /<path class="mapa-z t2" data-mapa="muni" data-c="25754"/, 'Soacha, con 4');
    assert.match(h, /<path class="mapa-z t1" data-mapa="muni" data-c="25286"/, 'Funza, con «1–2»');
    assert.ok(!vecinos.includes('11001'), 'Bogotá no va de zona: va por localidades');
    /* El orden de las capas: vecinos, fondo, localidades, contorno, nombres. */
    const i = k => h.indexOf(k);
    assert.ok(i('data-c="25754"') < i('class="mapa-fondo"') && i('class="mapa-fondo"') < i('data-mapa="loc"') &&
      i('data-mapa="loc"') < i('class="mapa-borde mapa-ciudad"') && i('class="mapa-borde mapa-ciudad"') < i('class="mapa-ets"'), 'las capas van en otro orden');
    assert.deepEqual(E.z.base, BOGOTA.caja, 'la ventana es la del archivo');
    assert.match(h, /<title>Kennedy \(Bogotá\) · 7 clientes<\/title>/);
    /* «Lisboa» (Usaquén o Suba) puede ser de Usaquén: «sin clientes» sería falso. */
    assert.match(h, /<title>Usaquén \(Bogotá\) · ninguno ubicado · 1–2 sin localidad pueden ser de aquí \(abajo\)<\/title>/);
    assert.match(h, /<title>Teusaquillo \(Bogotá\) · sin clientes<\/title>/);
  });

  test('los nombres: siempre, las zonas con 3 o más; las de «1–2» y las vacías, solo si caben', async () => {
    const { M, E } = await enBogota(DB);
    const ets = etiquetasDe(M.caja.innerHTML);
    const de = n => ets.find(e => e.nombre === n);
    assert.deepEqual([de('Kennedy').cifra, de('Suba').cifra, de('Soacha').cifra], ['7', '3', '4']);
    assert.ok(de('Kennedy').siempre && de('Suba').siempre && de('Soacha').siempre);
    assert.deepEqual([de('Bosa').cifra, de('Rafael Uribe Uribe').cifra, de('Funza').cifra], ['1–2', '1–2', '1–2']);
    assert.ok(!de('Bosa').siempre && !de('Funza').siempre, 'una zona de «1–2» iba siempre: veinte así no caben en el centro');
    assert.deepEqual([de('Usaquén').cifra, de('Usaquén').clase, de('Usaquén').siempre], ['', 'mapa-et-sec', false], 'la vacía: su nombre a secas, en segundo plano');
    assert.ok(!de('Sumapaz'), 'Sumapaz no tiene dónde llevar su nombre');
    /* Primero las que tienen clientes, por lo que se ve; después las vacías. */
    const primeraVacia = ets.findIndex(e => !e.cifra);
    assert.ok(ets.slice(0, primeraVacia).every(e => e.cifra) && ets.slice(primeraVacia).every(e => !e.cifra));
    assert.deepEqual(ets.slice(0, 3).map(e => e.nombre), ['Kennedy', 'Soacha', 'Suba'], 'por lo que se ve (7, 4, 3)');
    assert.ok(E.ets.filter(e => e.siempre).every(e => e.ver));
  });

  /* Revisión del 14-nov: con unos 150 clientes en Bogotá, quince etiquetas
     fijas se imprimían una encima de otra en el centro. */
  test('con 3 o más en cada localidad, las etiquetas fijas que no caben ceden: ninguna encima de otra', async () => {
    const filas = [];
    Object.keys(IB.nombre).filter(c => c !== '20').forEach(c => filas.push(...veces(3, ['Bogotá - ' + IB.nombre[c], '', ''])));
    const { E } = await abrirCon(cartera(filas), { depto: '11' }, 302, 429);
    const s = E.z.s, caja = e => [e.x + e.dx - e.w * s / 2, e.y + e.dy - e.h * s / 2, e.x + e.dx + e.w * s / 2, e.y + e.dy + e.h * s / 2];
    const vistas = E.ets.filter(e => e.ver), montadas = [];
    for (let i = 0; i < vistas.length; i++) {
      for (let j = i + 1; j < vistas.length; j++) {
        const a = caja(vistas[i]), b = caja(vistas[j]);
        if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) montadas.push(vistas[i].c + ' × ' + vistas[j].c);
      }
    }
    assert.deepEqual(montadas, []);
    const fijas = E.ets.filter(e => e.siempre);
    assert.equal(fijas.length, 19);
    assert.ok(fijas.some(e => !e.ver), 'la prueba no prueba nada: todas cabían');
    assert.ok(fijas[0].ver, 'la que más muestra no cede');
  });

  test('las listas del lado, los sin localidad con su porqué y su ficha, y Sumapaz en su línea', async () => {
    const abiertas = [];
    const MC = fresco();
    const M = montaje(514, 648);
    MC._estado.depto = '11';
    await MC.abrir({ caja: M.caja, db: DB, puente: P, pedir: pedirMapa, doc: M.doc, abrirFicha: id => abiertas.push(id) });
    const h = M.caja.innerHTML;
    // Bogotá: Kennedy 7 + Suba 3 + Bosa [1,2] + Rafael Uribe [1,2] + sin localidad 4 = 16–18.
    assert.match(h, /<h3 class="mapa-h">Bogotá, localidad por localidad<\/h3><div class="mapa-total"><b>16–18<\/b> clientes · 4 de 20 localidades con clientes<\/div>/);
    assert.match(h, /Va en rango porque/);
    assert.deepEqual(lista(h, 'Bogotá, localidad por localidad'), [['Kennedy', '7'], ['Suba', '3'], ['Bosa', '1–2'], ['Rafael Uribe Uribe', '1–2']]);
    assert.deepEqual(lista(h, 'Alrededor, en la Sabana'), [['Soacha', '4'], ['Funza', '1–2']]);
    assert.match(h, /<p class="mapa-sinloc"><b>4<\/b> clientes de Bogotá no tienen localidad/);
    const sin = h.slice(h.indexOf('<details class="mapa-sin mapa-sin-loc">'), h.indexOf('</details>', h.indexOf('mapa-sin-loc')));
    assert.match(sin, /<summary>⚠️ 4 clientes de Bogotá sin localidad/);
    assert.match(sin, /#14 Persona s14<\/b> · barrio «Lisboa»<div class="muted">Ese barrio está en varias localidades: (Usaquén o Suba|Suba o Usaquén)\.<\/div>/);
    assert.match(sin, /#15 Persona s15<\/b> · barrio «sur»<div class="muted">No reconozco ese barrio\.<\/div>/);
    assert.match(sin, /#16 Persona s16<\/b><div class="muted">Sin barrio en la ficha\.<\/div>/);
    assert.match(sin, /#17 Persona s17<\/b> · barrio «Bosa Centro»<div class="muted">Lo escrito apunta a localidades distintas: (Kennedy y Bosa|Bosa y Kennedy)\.<\/div>/);
    assert.match(sin, /«Lisboa, Suba»/, 'no dice cómo se corrige');
    M.clic(M.boton({ 'data-mapa': 'ficha', 'data-id': 's14' }));
    assert.deepEqual(abiertas, ['s14']);
    assert.match(h, /<p class="mapa-fuera">Más al sur, fuera de esta ventana: <button type="button" class="mapa-enlace" data-mapa="loc" data-c="L20">Sumapaz · sin clientes<\/button><\/p>/);
    assert.match(h, /Localidades y barrios de Bogotá: Secretaría Distrital de Planeación y Catastro Distrital \(CC BY 4\.0\)/);
    assert.match(h, /en Bogotá, en la localidad de su «Barrio»/);
  });

  test('un barrio que está en tres localidades o más: se enumeran con comas, y la «o» solo al final', async () => {
    const { M } = await enBogota(cartera([['Bogotá', 'El Porvenir', '']]));
    const h = M.caja.innerHTML;
    assert.match(h, /Ese barrio está en varias localidades: ([^,.]+, ){2,}[^,.]+ o [^,.]+\.</);
    assert.doesNotMatch(h, /varias localidades: [^.<]* o [^.<]* o /, 'una ristra de «o»: «Usme o Bosa o Engativá o…»');
  });

  test('tocar una localidad (en el mapa o en la lista) dice cuál es y la marca', async () => {
    const { M, E } = await enBogota(DB);
    M.clic(M.zona('L08', 'loc'), { clientX: 320, clientY: 330 });
    assert.equal(M.info.textContent, 'Kennedy (Bogotá) · 7 clientes');
    assert.equal(M.globo.innerHTML, '<b>Kennedy (Bogotá)</b> · 7 clientes');
    assert.equal(M.globo.hidden, false);
    assert.ok(M.caminos.L08.classList.contains('mapa-sel'), 'Kennedy no quedó marcada');
    M.clic(M.boton({ 'data-mapa': 'loc', 'data-c': 'L07' }));
    assert.equal(M.info.textContent, 'Bosa (Bogotá) · 1–2 clientes');
    assert.ok(M.caminos.L07.classList.contains('mapa-sel') && !M.caminos.L08.classList.contains('mapa-sel'));
    M.caja.oy.mouseover({ target: M.zona('L01', 'loc'), clientX: 300, clientY: 300 });
    assert.equal(M.info.textContent, 'Usaquén (Bogotá) · ninguno ubicado · 1–2 sin localidad pueden ser de aquí (abajo)');
    M.clic(M.boton({ 'data-mapa': 'loc', 'data-c': 'L20' }));
    assert.equal(M.info.textContent, 'Sumapaz (Bogotá) · sin clientes', 'la línea de Sumapaz no contesta');
    assert.equal(M.globo.hidden, true, 'Sumapaz no tiene forma: el globito de la zona anterior se quedó puesto');
    assert.equal(E.depto, '11');
  });

  test('en Conquistas: la localidad conquistada al final y en amarillo, lo que falta con «1–2», y las tarjetas cuentan localidades', async () => {
    const { M } = await abrirCon(DB, { depto: '11', vista: 'conquistas' });
    const h = M.caja.innerHTML;
    const capas = [...h.matchAll(/<path class="mapa-q (\w+) mapa-loc" data-mapa="loc" data-c="(L\d\d)"/g)].map(m => m[1] + ' ' + m[2]);
    assert.equal(capas.length, 19);
    // Kennedy: 4 pagaron (conquistada). Suba: 3 pagaron (conquistada). Bosa: 2 pagaron. Rafael Uribe: 0.
    assert.deepEqual(capas.slice(-2).sort(), ['conq L08', 'conq L11'], 'lo conquistado se pinta al final, encima de sus vecinas');
    assert.ok(capas.indexOf('con L07') > capas.indexOf('vacio L01'), 'lo que tiene clientes, después de lo vacío');
    assert.match(h, /<path class="mapa-q conq" data-mapa="muni" data-c="25754"/, 'Soacha, conquistado, también aquí');
    assert.match(h, /<div><b>2<\/b><span>conquistadas<\/span><\/div><div><b>4<\/b><span>con clientes<\/span><\/div><div><b>20<\/b><span>localidades<\/span><\/div>/);
    assert.deepEqual(lista(h, '🏁 Localidades conquistadas'), [['Kennedy', '🏁'], ['Suba', '🏁']]);
    assert.deepEqual(lista(h, 'Por conquistar'), [['Bosa', 'faltan 1–2'], ['Rafael Uribe Uribe', 'faltan 3']]);
    assert.deepEqual(lista(h, 'Alrededor, en la Sabana'), [['Soacha', '🏁'], ['Funza', 'faltan 3']]);
    assert.match(h, /<title>Bosa \(Bogotá\) · 1–2 clientes · faltan 1–2 para conquistarla<\/title>/);
    assert.match(h, /<title>Kennedy \(Bogotá\) · 7 clientes · 🏁 conquistada<\/title>/);
    assert.ok(etiquetasDe(h).find(e => e.nombre === 'Kennedy').clase.includes('conq'));
    assert.match(h, /mapa-lienzo mapa-laca/); assert.match(h, /class="mapa-svg mapa-oscuro"/);
    assert.doesNotMatch(h, /mapa-teselas|data-mapa="calles"|class="mapa-osm"/, 'las calles no van en Conquistas');
    /* Con una sola conquistada, en singular. */
    const una = await abrirCon(cartera(veces(3, ['Kennedy', '', 'pagado'])), { depto: '11', vista: 'conquistas' });
    assert.match(una.M.caja.innerHTML, /<div><b>1<\/b><span>conquistada<\/span><\/div>/);
  });

  test('el zoom llega a 1,4 km en Bogotá (6 unidades) y sigue en 100 fuera; muy cerca, la ventana no se redondea a décimas', async () => {
    const { M, E } = await enBogota(DB);
    assert.equal(E.min, 6);
    assert.equal(M.svg.classList.contains('ampliado'), false, 'la vista abre entera: en el celular el dedo sigue bajando la página');
    for (let i = 0; i < 40; i++) M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    assert.equal(E.z.vb[2], 6, 'hasta 6 unidades y no más');
    assert.equal(M.botones.mas.disabled, true);
    assert.equal(M.svg.attrs.viewBox, E.z.vb.map(v => Math.round(v * 1000) / 1000).join(' '), 'a la décima, a esta distancia el mapa tiembla');
    assert.ok(M.svg.k > 0 && M.svg.k < 0.02, '--k: ' + M.svg.k);
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'todo' }));
    assert.deepEqual(E.z.vb, BOGOTA.caja);
    /* Fuera de Bogotá, el tope de siempre. */
    M.clic(M.boton({ 'data-mapa': 'pais' }));
    assert.equal(E.min, 100);
    for (let i = 0; i < 40; i++) M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    assert.equal(E.z.vb[2], 100);
    const MC = fresco();
    assert.equal(MC.acercar([0, 0, 200, 200], [0, 0, 1000, 1000], 100)[2], 100, 'sin tope propio, el de siempre');
    assert.equal(MC.acercar([0, 0, 200, 200], [0, 0, 1000, 1000], 100, null, 6)[2], 6);
    assert.equal(MC.limitar([10, 10, 2, 2], [0, 0, 1000, 1000], 6)[2], 6);
  });

  test('el buscador: una localidad por su nombre, un barrio por la localidad donde queda, y el repetido con las dos', async () => {
    const { MC, M, E } = await abrirCon(DB);
    assert.equal(MC.buscar('kenn')[0], 'L08', 'la localidad, por su nombre');
    assert.deepEqual(MC.buscar('patio bonito'), ['L08|b'], 'el barrio lleva a su localidad');
    assert.deepEqual(MC.buscar('lisboa').sort(), ['L01|b', 'L11|b'], 'el barrio repetido, con sus dos localidades');
    assert.deepEqual(MC.buscar('cerca al portal'), []);
    assert.deepEqual(MC.buscar('suba').slice(0, 2), ['L11', '25769'], 'Suba (3 clientes) antes que Subachoque');
    /* Lo de siempre sigue igual. */
    assert.equal(MC.buscar('soach')[0], '25754');
    M.entrada.value = 'patio bonito'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /data-mapa="buscado" data-c="L08\|b"><span>Kennedy <small>Bogotá · ahí queda ese barrio<\/small><\/span><b>7<\/b>/);
    M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
    assert.equal(E.depto, '11', 'no abrió Bogotá');
    assert.ok(E.z.vb[2] < E.z.base[2], 'no se acercó a Kennedy');
    const p = BOGOTA.localidades.find(l => l.c === '08').p, vb = E.z.vb;
    assert.ok(p[0] > vb[0] && p[0] < vb[0] + vb[2] && p[1] > vb[1] && p[1] < vb[1] + vb[3], 'Kennedy quedó fuera de la ventana');
    assert.ok(M.caminos.L08.classList.contains('mapa-sel'));
    assert.equal(M.info.textContent, 'Kennedy (Bogotá) · 7 clientes');
    M.entrada.value = 'usaq'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /data-c="L01"><span>Usaquén <small>localidad de Bogotá<\/small><\/span><b><i>1–2 sin localidad<\/i><\/b>/);
    M.entrada.value = 'bos'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /data-c="L07"><span>Bosa <small>localidad de Bogotá<\/small><\/span><b>1–2<\/b>/);
    M.entrada.value = 'Narnia'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /No encuentro un municipio con ese nombre, ni una localidad o un barrio de Bogotá\./);
    /* Con Bogotá abierta, un vecino se busca sin saltar a Cundinamarca. */
    M.clic(M.boton({ 'data-mapa': 'buscado', 'data-c': '25754' }));
    assert.equal(E.depto, '11', 'buscar Soacha desde Bogotá saltó a Cundinamarca');
    assert.equal(M.info.textContent, 'Soacha (Cundinamarca) · 4 clientes');
    /* En Conquistas, una localidad se abre sin salirse de Conquistas. */
    M.clic(M.boton({ 'data-mapa': 'pais' })); M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' }));
    M.clic(M.boton({ 'data-mapa': 'buscado', 'data-c': 'L11' }));
    assert.equal(E.vista, 'conquistas'); assert.equal(E.depto, '11');
    assert.equal(M.info.textContent, 'Suba (Bogotá) · 3 clientes · 🏁 conquistada');
  });

  /* Revisión del 14-nov: en Conquistas con Bogotá abierta, «Medellín» y
     Enter cambiaba la línea de abajo y el mapa se quedaba en Bogotá. */
  test('desde Bogotá en Conquistas, un municipio de fuera se busca en el mapa de Colombia; un vecino, ahí mismo', async () => {
    const { M, E } = await abrirCon(DB, { depto: '11', vista: 'conquistas' });
    M.entrada.value = 'Soacha'; M.caja.oy.input({ target: M.entrada });
    M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
    assert.equal(E.depto, '11', 'Soacha está dibujado en la Sabana: no se sale de Bogotá');
    assert.ok(M.caminos['25754'] && M.caminos['25754'].classList.contains('mapa-sel'));
    M.entrada.value = 'Medellín'; M.caja.oy.input({ target: M.entrada });
    M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
    assert.equal(E.depto, null, 'se quedó en Bogotá');
    assert.equal(E.vista, 'conquistas');
    assert.match(M.caja.innerHTML, /<path class="mapa-q \w+" data-mapa="muni" data-c="05001"/, 'Medellín no está dibujado');
    assert.ok(M.caminos['05001'].classList.contains('mapa-sel'), 'Medellín no quedó marcado');
    assert.match(M.info.textContent, /^Medellín \(Antioquia\) · /);
  });

  test('en Colombia y en Cundinamarca, Bogotá lleva lo que se ve de sus partes: nunca su cifra exacta', async () => {
    const { M } = await abrirCon(DB);
    assert.match(M.caja.innerHTML, /<span>Bogotá D\.C\.<\/span><b>16–18<\/b>/);
    assert.match(M.caja.innerHTML, /<title>Bogotá, D\.C\. · 16–18 clientes<\/title>/);
    assert.ok(etiquetasDe(M.caja.innerHTML).some(e => e.c === '11001' && e.cifra === '16–18'));
    M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '25' }));
    assert.match(M.caja.innerHTML, /data-mapa="muni" data-c="11001"><span>Bogotá, D\.C\.<\/span><b>16–18<\/b>/);
    assert.match(M.caja.innerHTML, /<path class="mapa-z t3 mapa-hueco" data-mapa="muni" data-c="11001"/, 'el color, por el punto medio de lo que se ve (17: «10 a 29»)');
    M.entrada.value = 'bogo'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /data-c="11001"><span>Bogotá, D\.C\.<\/span><b>16–18<\/b>/);
  });

  /* Lo mismo que la sección 5 de mapa-clientes.test.js, un piso más abajo: dos
     carteras que se VEN igual (cada «1–2» con la otra cifra, los que pagaron
     repartidos distinto sin cambiar lo que se ve) pintan la misma pantalla. */
  test('dos carteras que se ven iguales pintan la MISMA pantalla, por dentro de Bogotá también', async () => {
    const A = cartera([...veces(3, ['Kennedy', '', '']), ['Bosa', '', 'pagado'], ...veces(2, ['Suba', '', 'pagado']),
      ['Bogotá', 'sur', ''], ['Funza', '', ''], ...veces(2, ['Chía', '', ''])]);
    const B = cartera([...veces(3, ['Kennedy', '', '']), ...veces(2, ['Bosa', '', 'pagado']), ['Suba', '', 'pagado'],
      ...veces(2, ['Bogotá', 'sur', '']), ...veces(2, ['Funza', '', '']), ['Chía', '', '']]);
    async function todo(db) {
      const { M } = await abrirCon(db);
      const v = { pais: M.caja.innerHTML };
      M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '25' })); v.cundinamarca = M.caja.innerHTML;
      M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '11' })); v.bogota = M.caja.innerHTML;
      for (const c of ['L07', 'L08', 'L11', 'L20']) { M.clic(M.boton({ 'data-mapa': 'loc', 'data-c': c })); v['info ' + c] = M.info.textContent; }
      M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' })); v.bogotaQ = M.caja.innerHTML;
      for (const c of ['L07', 'L11']) { M.clic(M.boton({ 'data-mapa': 'loc', 'data-c': c })); v['infoQ ' + c] = M.info.textContent; }
      M.clic(M.boton({ 'data-mapa': 'pais' })); v.conquistas = M.caja.innerHTML;
      for (const q of ['bosa', 'bogo', 'suba']) { M.entrada.value = q; M.caja.oy.input({ target: M.entrada }); v['sug ' + q] = M.sug.innerHTML; }
      return v;
    }
    /* Los nombres y números de las personas no son «lo que se ve de una cifra»:
       van en las listas cerradas de abajo, que se quitan para comparar. */
    const limpio = h => String(h).replace(/<details class="mapa-sin[\s\S]*?<\/details>/g, '');
    const a = await todo(A), b = await todo(B);
    assert.equal(Object.keys(a).length, 14);
    for (const k of Object.keys(a)) {
      const x = limpio(a[k]), y = limpio(b[k]);
      if (x === y) continue;
      let i = 0; while (i < x.length && x[i] === y[i]) i++;
      assert.fail(k + ': la pantalla cambia según la cifra exacta. Una dice «…' + x.slice(Math.max(0, i - 90), i + 50) + '…» y la otra «…' + y.slice(Math.max(0, i - 90), i + 50) + '…»');
    }
    /* Y en ninguna sale un «1» o un «2» de personas. */
    for (const [k, h] of Object.entries(a)) {
      assert.doesNotMatch(limpio(h).replace(/las zonas con 1 o 2 clientes/g, '').replace(/<div class="mapa-kpis">[\s\S]*?<\/div><\/div>/, ''),
        /(^|[^–\d])[12]( clientes|<\/tspan>|<\/b>)/, k);
    }
  });

  test('rápido: 2.000 clientes de Bogotá con su barrio, la vista en menos de 1 s', async () => {
    const barrios = ['Patio Bonito', 'Tibabuyes', 'Lisboa', 'Quiroga', 'Venecia', 'sur', 'Bosa Centro', 'Las Ferias', '', 'Toberín'];
    const db = cartera(Array.from({ length: 2000 }, (_, i) => ['Bogotá', barrios[i % barrios.length], i % 2 ? 'pagado' : '']));
    const { MC, M, E } = await enBogota(db);
    for (const vista of ['deptos', 'conquistas']) {
      E.vista = vista;
      const t = Date.now();
      await MC.abrir({ caja: M.caja, db, puente: P, doc: M.doc });
      assert.ok(Date.now() - t < 1000, vista + ' tardó ' + (Date.now() - t) + ' ms');
    }
    assert.equal(E.res.bogota.porLoc['08'].clientes, 200);
  });
});

/* ==========================================================================
 * 6 · Las calles
 * ======================================================================== */
describe('6 · las calles de OpenStreetMap, debajo de las zonas de Bogotá', () => {
  const DB = cartera([...veces(4, ['Kennedy', '', 'pagado']), ['Bogotá', 'Tibabuyes', ''], ['Soacha', '', '']]);
  const VENTANA = BOGOTA.caja, S = BOGOTA.caja[2] / 514;

  test('las teselas de la ventana: el zoom que les toca, pegadas una a otra, y la cubren entera', () => {
    const MC = fresco();
    const t = MC.teselas(VENTANA, S, BOGOTA.proy);
    assert.equal(t.length, 12);
    assert.ok(t.every(x => x.z === 11), 'a 514 px de ancho, la ventana de Bogotá es el zoom 11');
    assert.deepEqual([...new Set(t.map(x => x.x))], [601, 602, 603]);
    assert.deepEqual([...new Set(t.map(x => x.y))], [996, 997, 998, 999]);
    /* Una tesela mide en pantalla más o menos sus 256 px. */
    assert.ok(Math.abs(t[0].mw / S - 256) < 64, 'una tesela mide ' + (t[0].mw / S).toFixed(0) + ' px');
    /* Pegadas: donde acaba una empieza la siguiente. */
    const en = (x, y) => t.find(k => k.x === x && k.y === y);
    assert.ok(Math.abs(en(601, 996).mx + en(601, 996).mw - en(602, 996).mx) < 1e-9);
    assert.ok(Math.abs(en(601, 996).my + en(601, 996).mh - en(601, 997).my) < 1e-9);
    /* Cubren la ventana. */
    const x0 = Math.min(...t.map(k => k.mx)), y0 = Math.min(...t.map(k => k.my)), x1 = Math.max(...t.map(k => k.mx + k.mw)), y1 = Math.max(...t.map(k => k.my + k.mh));
    assert.ok(x0 <= VENTANA[0] && y0 <= VENTANA[1] && x1 >= VENTANA[0] + VENTANA[2] && y1 >= VENTANA[1] + VENTANA[3], 'queda un borde sin calles');
    /* Y la cubren esté donde esté: corrida de a pocos por toda la ciudad, a
       ninguna ventana le falta un borde (una casilla mal redondeada lo deja
       sin calles media vez sí y media no). */
    for (let i = 0; i < 24; i++) {
      const v = [2290 + i * 5.3, 3680 + i * 7.1, 40, 56], k = MC.teselas(v, 40 / 514, BOGOTA.proy);
      assert.ok(k.length > 0 && k.length <= 20, 'ventana ' + i + ': ' + k.length + ' teselas');
      assert.ok(Math.min(...k.map(q => q.mx)) <= v[0] && Math.min(...k.map(q => q.my)) <= v[1] &&
        Math.max(...k.map(q => q.mx + q.mw)) >= v[0] + v[2] && Math.max(...k.map(q => q.my + q.mh)) >= v[1] + v[3], 'a la ventana ' + i + ' le queda un borde sin calles');
    }
    /* Más cerca, más zoom y parecidas en número; y nunca más allá de lo que hay. */
    const cerca = MC.teselas([2360, 3790, 6, 8.5], 6 / 514, BOGOTA.proy);
    assert.ok(cerca.every(x => x.z === 16) && cerca.length <= 16, 'cerca: ' + cerca.length + ' en z' + (cerca[0] || {}).z);
    assert.ok(MC.teselas([2360, 3790, 0.5, 0.7], 0.5 / 514, BOGOTA.proy).every(x => x.z === 17), 'el zoom no pasa de 17');
  });

  /* La Plaza de Bolívar (4,5981° N, 74,0760° O) está en la tesela 15/9641/15965
     de cualquier mapa del mundo. Si la cuenta de aquí dijera otra, las calles
     saldrían corridas respecto de las localidades. */
  test('la tesela de la Plaza de Bolívar es la que es, y cae en La Candelaria', () => {
    const MC = fresco();
    const x = aX(-74.0760), y = aY(4.5981);
    const s = 360 * BOGOTA.proy.kx / (256 * Math.pow(2, 15));   // un píxel de una tesela de zoom 15
    const t = MC.teselas([x - 0.01, y - 0.01, 0.02, 0.02], s, BOGOTA.proy);
    assert.deepEqual(t.map(k => [k.z, k.x, k.y]), [[15, 9641, 15965]]);
    assert.ok(x > t[0].mx && x < t[0].mx + t[0].mw && y > t[0].my && y < t[0].my + t[0].mh, 'la plaza no cae dentro de su tesela');
    assert.equal(MC.urlDeTesela(t[0]), 'https://tile.openstreetmap.org/15/9641/15965.png');
    assert.ok(dentro(x, y, anillos(BOGOTA.localidades.find(l => l.c === '17').d)));
  });

  /* Revisión del 14-nov: en un monitor grande (o con el navegador alejado) la
     ventana pedía más de 36, no se pedía ninguna y Bogotá se quedaba sin calles
     con el botón puesto y sin decirlo. */
  test('nunca más de 36 teselas: si la ventana pide más, un zoom menos que la cubra; si ni así, ninguna', () => {
    const MC = fresco();
    const una = MC.teselas([2300, 3700, 1, 1], 0.05, BOGOTA.proy)[0];
    /* Justo en el tope (seis por seis), en su zoom. */
    const justas = MC.teselas([una.mx + 0.01, una.my + 0.01, una.mw * 6 - 0.02, una.mh * 6 - 0.02], 0.05, BOGOTA.proy);
    assert.equal(justas.length, 36);
    assert.ok(justas.every(t => t.z === una.z));
    const cubre = (ts, v) => Math.min(...ts.map(t => t.mx)) <= v[0] && Math.max(...ts.map(t => t.mx + t.mw)) >= v[0] + v[2] &&
      Math.min(...ts.map(t => t.my)) <= v[1] && Math.max(...ts.map(t => t.my + t.mh)) >= v[1] + v[3];
    /* Una columna más: un zoom menos. Media Sabana a zoom de barrio (1.400 de
       una vez): los que hagan falta. Siempre cubriendo la ventana. */
    const siete = [una.mx + 0.01, una.my + 0.01, una.mw * 7 - 0.02, una.mh * 6 - 0.02];
    assert.equal(MC.teselas(siete, 0.05, BOGOTA.proy)[0].z, una.z - 1);
    for (const v of [siete, [2200, 3600, 400, 400]]) {
      const ts = MC.teselas(v, 0.05, BOGOTA.proy);
      assert.ok(ts.length > 0 && ts.length <= 36, String(ts.length));
      assert.ok(ts.every(t => t.z === ts[0].z) && ts[0].z < una.z, 'todas de un zoom menor');
      assert.ok(cubre(ts, v), 'y cubren la ventana entera');
    }
    /* Medio continente a zoom de calle: ni en el zoom 6 caben. Ninguna (y se
       cuenta antes de armar la lista: no se queda colgada). */
    assert.deepEqual(MC.teselas([-20000, -20000, 50000, 40000], 0.05, BOGOTA.proy), []);
    assert.deepEqual(MC.teselas(VENTANA, 0, BOGOTA.proy), []);
    assert.deepEqual(MC.teselas(VENTANA, S, null), []);
    assert.deepEqual(MC.teselas([0, 0, 0, 0], S, BOGOTA.proy), []);
  });

  /* LA REGLA: de la cartera no sale nada. La dirección de una tesela se arma
     con la ventana y nada más; y con dos carteras distintas (una vacía) se
     piden exactamente las mismas. */
  test('lo que se le pide a OpenStreetMap es la ventana que se mira: z/x/y y nada de la cartera', async () => {
    const MC = fresco();
    assert.equal(MC.teselas.length, 3, 'teselas() recibe la ventana, la escala y la proyección: nada más');
    assert.equal(MC.urlDeTesela.length, 1);
    const con = await enBogota(DB);
    await espera(220);
    const vacia = await enBogota({ socios: [], prestamos: [] });
    await espera(220);
    assert.equal(con.M.direcciones().length, 12);
    assert.deepEqual(con.M.direcciones(), vacia.M.direcciones(), 'las teselas pedidas cambian con la cartera');
    for (const u of con.M.direcciones()) assert.match(u, /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/, u);
    /* Tocar una localidad con clientes, buscar un barrio: la lista de teselas solo cambia si cambia la ventana. */
    con.M.clic(con.M.zona('L08', 'loc'), { clientX: 320, clientY: 330 });
    await espera(220);
    assert.deepEqual(con.M.direcciones(), vacia.M.direcciones(), 'tocar una localidad pidió teselas');
    /* Y en el código no hay otra dirección de fuera que esas dos de OpenStreetMap. */
    const codigo = sinComentarios(leer('panel/mapa-clientes.js')) + sinComentarios(leer('panel/mapa-lugares.js'));
    const fuera = [...new Set([...codigo.matchAll(/https?:\/\/[^'"\s)]+/g)].map(m => m[0]))].sort();
    assert.deepEqual(fuera, ['http://www.w3.org/2000/svg', 'https://tile.openstreetmap.org/', 'https://www.openstreetmap.org/copyright']);
  });

  test('solo en Bogotá y en Departamentos: ni Colombia, ni un departamento, ni Conquistas piden calles', async () => {
    for (const [que, estado] of [['Colombia', {}], ['Cundinamarca', { depto: '25' }], ['Conquistas', { vista: 'conquistas' }], ['Bogotá en Conquistas', { depto: '11', vista: 'conquistas' }]]) {
      const { M } = await abrirCon(DB, estado);
      await espera(220);
      assert.equal(M.creadas.length, 0, que + ' pidió ' + M.creadas.length + ' teselas');
      assert.doesNotMatch(M.caja.innerHTML, /mapa-teselas/, que);
    }
    /* Al salir de Bogotá, las que estaban pendientes no se piden. */
    const { M } = await enBogota(DB);
    M.clic(M.boton({ 'data-mapa': 'pais' }));
    await espera(220);
    assert.equal(M.creadas.length, 0, 'salió de Bogotá antes de que se pidieran, y se pidieron igual');
  });

  test('se piden cuando el mapa se queda quieto, no en cada cuadro de un zoom', async () => {
    const { M } = await enBogota(DB);
    for (let i = 0; i < 4; i++) M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    assert.equal(M.creadas.length, 0, 'pidió teselas a mitad del gesto');
    await espera(220);
    assert.ok(M.creadas.length > 0 && M.creadas.length <= 16, 'una sola tanda: ' + M.creadas.length);
    assert.equal(new Set(M.creadas.map(n => n.attrs['data-t'].split('/')[0])).size, 1, 'un solo zoom');
    /* Cada una, con sus medidas en el mapa y sin deformarse a su manera. */
    const n = M.creadas[0];
    assert.equal(n.tagName, 'image'); assert.equal(n.attrs.preserveAspectRatio, 'none');
    assert.ok(Number(n.attrs.width) > 0 && Number(n.attrs.height) > 0 && Number.isFinite(Number(n.attrs.x)) && Number.isFinite(Number(n.attrs.y)));
    /* Volver a quedarse en la misma ventana no las pide otra vez. */
    const antes = M.creadas.length;
    M.clic(M.zona('L08', 'loc'), { clientX: 300, clientY: 300 });
    await espera(220);
    assert.equal(M.creadas.length, antes, 'pidió otra vez las que ya tenía');
  });

  /* Revisión del 14-nov: las de otro zoom se quitan a los 700 ms; si antes de
     eso el mapa volvía a necesitarlas, el temporizador se las llevaba igual y
     el mapa se quedaba sin calles con el botón puesto. */
  test('acercar y volver en menos de 700 ms no deja el mapa sin calles', async () => {
    const { M } = await enBogota(DB);
    await espera(220);
    const alAbrir = M.direcciones();
    assert.ok(alAbrir.length > 0);
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' })); M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    await espera(220);
    assert.notDeepEqual(M.direcciones(), alAbrir, 'precondición: acercar pide otras');
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'todo' }));
    await espera(220);
    await espera(800);
    assert.deepEqual(M.direcciones(), alAbrir, 'el temporizador se llevó las que volvieron a hacer falta');
  });

  test('el crédito de OpenStreetMap va sobre el mapa mientras haya calles, y el botón las quita y las pone', async () => {
    const { M, E } = await enBogota(DB);
    const h = M.caja.innerHTML;
    assert.match(h, /<div class="mapa-marco"><svg class="mapa-svg mapa-papel"[\s\S]*<\/svg><div class="mapa-osm">© <a href="https:\/\/www\.openstreetmap\.org\/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap<\/a><\/div>/,
      'el crédito no va pegado al mapa, a la vista');
    assert.match(h, /Calles: © colaboradores de OpenStreetMap \(ODbL\)/, 'y en el pie');
    assert.match(h, /<div class="mapa-lienzo mapa-calles">/);
    assert.match(h, /<button type="button" class="mapa-zb mapa-todo mapa-calles-b on" data-mapa="calles" aria-pressed="true"/);
    assert.match(h, /<g class="mapa-teselas" filter="url\(#mapa-gris\)"/, 'las calles van en gris: en color pelean con la escala');
    assert.ok(h.indexOf('class="mapa-teselas"') < h.indexOf('class="mapa-zonas"'), 'las calles van DEBAJO de las zonas');
    await espera(220);
    assert.equal(M.g.hijos.length, 12);
    /* Quitarlas: fuera las teselas, el crédito y la transparencia. */
    M.lienzo.classList.add('mapa-calles');
    M.clic(M.boton({ 'data-mapa': 'calles' }));
    assert.equal(E.calles, false);
    assert.equal(M.g.hijos.length, 0, 'las teselas se quedaron');
    assert.equal(M.osm.hidden, true, 'el crédito se quedó sin calles debajo');
    assert.equal(M.lienzo.classList.contains('mapa-calles'), false);
    assert.equal(M.botonCalles.attrs['aria-pressed'], 'false');
    await espera(220);
    assert.equal(M.g.hijos.length, 0, 'quitadas, se volvieron a pedir');
    /* Quitadas se quedan al volver a pintar (cambiar de vista y volver)… */
    M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' })); M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'deptos' }));
    assert.match(M.caja.innerHTML, /<div class="mapa-lienzo">/);
    assert.match(M.caja.innerHTML, /<div class="mapa-osm" hidden>/);
    assert.match(M.caja.innerHTML, /mapa-calles-b" data-mapa="calles" aria-pressed="false"/);
    /* …y el botón las vuelve a poner. */
    M.clic(M.boton({ 'data-mapa': 'calles' }));
    assert.equal(E.calles, true); assert.equal(M.osm.hidden, false); assert.ok(M.lienzo.classList.contains('mapa-calles'));
    await espera(220);
    assert.equal(M.g.hijos.length, 12);
    /* Quitadas con una tanda pendiente (un zoom recién hecho): no llegan después. */
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    M.clic(M.boton({ 'data-mapa': 'calles' }));
    await espera(220);
    assert.equal(M.g.hijos.length, 0, 'las calles se quitaron y la tanda que venía en camino las volvió a poner');
    /* No se guarda en ninguna parte: un CRM recién abierto las trae puestas. */
    assert.equal(fresco()._estado.calles, true);
  });

  test('si las teselas no llegan, el mapa sigue y lo dice; si alguna llegó, no molesta', async () => {
    const { M, E } = await enBogota(DB);
    await espera(220);
    assert.equal(M.aviso.hidden, true);
    const [a, b] = M.g.hijos;
    a.oy.error();
    assert.equal(M.aviso.hidden, false, 'ninguna llegó y no se dijo');
    assert.ok(!M.g.hijos.includes(a), 'la que no llegó se quedó puesta');
    assert.match(M.caja.innerHTML, /<div class="mapa-osm-aviso" role="status" hidden>Las calles no cargaron \(¿sin señal\?\)\. El mapa sigue igual sin ellas\.<\/div>/);
    b.oy.load();
    assert.equal(M.aviso.hidden, true, 'con una que llegó, el aviso sobra');
    assert.deepEqual([E.tes.bien, E.tes.mal], [1, 1]);
  });

  /* Las condiciones de OpenStreetMap prohíben guardar teselas para usarlas
     sin señal. El service worker no intercepta lo que no es de este sitio. */
  test('el service worker no guarda las teselas ni las precarga', () => {
    const sw = leer('sw.js');
    assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/, 'el service worker ya no deja pasar lo de otro sitio');
    const codigo = sinComentarios(sw);
    assert.ok(!codigo.includes('openstreetmap'), 'sw.js nombra openstreetmap fuera de un comentario');
  });
});

/* ==========================================================================
 * 7 · La hoja
 * ======================================================================== */
describe('7 · la hoja de Bogotá, medida con los tokens de crm.html', () => {
  const CRM = leer('panel/crm.html');
  const i = CRM.indexOf(':root{');
  const VARS = Object.fromEntries([...CRM.slice(i, CRM.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+):([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const HOJA = leer('panel/mapa-clientes.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const REGLAS = {};
  for (const m of HOJA.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!(sel in REGLAS)) REGLAS[sel] = Object.fromEntries(m[2].split(';').map(d => d.split(':')).filter(d => d.length >= 2).map(d => [d[0].trim(), d.slice(1).join(':').trim()]));
  }
  const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
  function color(valor, sobre, vars) {
    const v = String(valor).trim(), V = vars || VARS;
    let m = /^var\(--([\w-]+)\)$/.exec(v);
    if (m) return color(V[m[1]], sobre, V);
    m = /^rgba\(var\(--([\w-]+)\),\s*([\d.]+)\)$/.exec(v);
    if (m) { const c = V[m[1]].split(',').map(Number), a = Number(m[2]); return c.map((x, k) => a * x + (1 - a) * sobre[k]); }
    if (/^#[0-9a-f]{6}$/i.test(v)) return hex(v);
    throw new Error('no sé leer el color «' + v + '»');
  }
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const Y = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const contraste = (a, b) => { const x = Y(a), y = Y(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const PAPEL = color('var(--papel)');

  test('con calles, la escala va transparente pero sigue en orden, y «sin clientes» deja ver el mapa', () => {
    const calles = REGLAS['.mapa-lienzo.mapa-calles'];
    assert.ok(calles, 'la hoja no tiene la regla de las calles');
    const alfa = t => Number(/rgba\(var\(--[\w-]+\),\s*([\d.]+)\)/.exec(calles['--mapa-t' + t])[1]);
    assert.ok(alfa(0) <= 0.05, '«sin clientes» tapa las calles: ' + alfa(0));
    for (let t = 2; t <= 5; t++) assert.ok(alfa(t) - alfa(t - 1) >= 0.1, 't' + (t - 1) + '→t' + t + ' no se distinguen: ' + alfa(t - 1) + ' → ' + alfa(t));
    assert.ok(alfa(5) <= 0.8, 'el tramo más oscuro tapa las calles: ' + alfa(5));
    /* Sobre un mapa de calles en gris claro (el del filtro, más o menos #D8D8D8),
       cada paso sigue siendo más oscuro que el anterior. */
    const GRIS = [216, 216, 216];
    const Ls = [0, 1, 2, 3, 4, 5].map(t => Y(color(calles['--mapa-t' + t], GRIS)));
    for (let t = 1; t <= 5; t++) assert.ok(Ls[t] < Ls[t - 1], 'sobre las calles, t' + t + ' no es más oscuro que t' + (t - 1));
    /* La leyenda y las zonas usan las MISMAS variables: al cambiar con las calles, cambian juntas. */
    for (let t = 0; t <= 5; t++) {
      assert.equal(REGLAS['.mapa-z.t' + t].fill, 'var(--mapa-t' + t + ')');
      assert.equal(REGLAS['.mapa-leyenda .mapa-z.t' + t].background, 'var(--mapa-t' + t + ')');
    }
    /* Y los bordes, a laca entera: es lo único que se separa de un fondo que ya no es liso. */
    assert.equal(calles['--mapa-raya-sobre-claro'], 'var(--laca)');
    assert.equal(calles['--mapa-raya-sobre-oscuro'], 'var(--laca)');
  });

  test('el nombre de una zona vacía se lee (4,5:1) y con calles se esconde; el crédito de las calles también se lee', () => {
    const halo = color(REGLAS['.mapa-et'].stroke, PAPEL);
    assert.ok(contraste(color(REGLAS['.mapa-et.mapa-et-sec'].fill, halo), halo) >= 4.5);
    assert.equal(REGLAS['.mapa-calles .mapa-et.mapa-et-sec'].display, 'none', 'con calles, el nombre del pueblo ya lo trae el mapa de calles');
    const osm = REGLAS['.mapa-osm,.mapa-osm-aviso'];
    const fondo = color(osm.background, PAPEL);
    assert.ok(contraste(color(osm.color, fondo), fondo) >= 4.5, 'el crédito de OpenStreetMap');
    assert.ok(contraste(color(REGLAS['.mapa-osm a'].color, fondo), fondo) >= 4.5, 'su enlace');
    assert.equal(osm.position, 'absolute', 'el crédito va sobre el mapa');
    assert.equal(REGLAS['.mapa-marco'].position, 'relative');
    assert.equal(REGLAS['.mapa-osm[hidden],.mapa-osm-aviso[hidden]'].display, 'none', 'un display propio le gana al atributo hidden');
  });

  test('el contorno de la ciudad va más grueso que el borde de una localidad, en las dos vistas', () => {
    const fino = parseFloat(REGLAS['.mapa-z']['stroke-width']);
    assert.ok(parseFloat(REGLAS['.mapa-papel .mapa-borde.mapa-ciudad']['stroke-width']) >= 2 * fino);
    assert.ok(parseFloat(REGLAS['.mapa-oscuro .mapa-borde.mapa-ciudad']['stroke-width']) >= 2 * parseFloat(REGLAS['.mapa-q']['stroke-width']));
    assert.equal(REGLAS['.mapa-fondo']['pointer-events'], 'none', 'el fondo se llevaría los toques de las rendijas');
    assert.doesNotMatch(HOJA, /#[0-9a-f]{3,8}\b/i, 'un hex suelto');
  });
});

/* 8 · LO QUE NINGUNA PRUEBA MIRABA. La revisión del 14-nov, antes de publicar,
   hizo 51 mutaciones nuevas del código del mapa (cambiar una cosa y ver si
   alguna prueba se cae): 36 pasaban sin que nada se cayera. El código de
   hoy hace bien todo esto; lo que faltaba era quien lo vigilara. Cada prueba
   de aquí tira al menos una de esas 36. */
describe('8 · lo que ninguna prueba miraba', () => {
  const locDe = (ciudad, barrio) => L.localidadDe(ciudad, barrio, IB);
  const entrar = (M, x) => { M.entrada.value = x; M.caja.oy.input({ target: M.entrada }); };
  const enter = M => M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
  const enBogotaCon = (db, extra, ancho, alto) => abrirCon(db, Object.assign({ depto: '11' }, extra), ancho, alto);
  const limpio = h => String(h).replace(/<details class="mapa-sin[\s\S]*?<\/details>/g, '');

  /* Dos carteras que se ven igual pintan lo mismo en estas pantallas (sin las listas con nombre). */
  async function iguales(A, Bc, pantallas) {
    const ver = async db => {
      const { MC, M, E } = await abrirCon(db);
      const v = { pais: limpio(M.caja.innerHTML) };
      M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '25' })); v.cundinamarca = limpio(M.caja.innerHTML);
      M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '11' })); v.bogota = limpio(M.caja.innerHTML); v.resumen = (/<summary>[^<]*sin localidad[^<]*/.exec(M.caja.innerHTML) || [''])[0];
      M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' })); v.bogotaQ = limpio(M.caja.innerHTML);
      M.clic(M.boton({ 'data-mapa': 'pais' })); v.conquistas = limpio(M.caja.innerHTML);
      v.sugUs = MC.buscar('us').join(' ');
      void E;
      return v;
    };
    const a = await ver(A), b = await ver(Bc);
    for (const k of pantallas || Object.keys(a)) assert.equal(a[k], b[k], 'la pantalla «' + k + '» cambia con la cifra exacta');
    return a;
  }
  
  test('Sumapaz con 1 y con 2 se ve igual, y dice «1–2»', async () => {
    const a = await iguales(cartera([...veces(3, ['Kennedy', '', '']), ['Sumapaz', '', '']]), cartera([...veces(3, ['Kennedy', '', '']), ...veces(2, ['Sumapaz', '', ''])]));
    assert.match(a.bogota, /data-c="L20">Sumapaz · 1–2 clientes<\/button>/);
  });

  test('el <summary> de los sin localidad dice «1–2» con 1 y con 2', async () => {
    const a = await iguales(cartera([...veces(3, ['Kennedy', '', '']), ['Bogotá', 'sur', '']]), cartera([...veces(3, ['Kennedy', '', '']), ...veces(2, ['Bogotá', 'sur', ''])]), ['resumen', 'bogota']);
    assert.match(a.resumen, /1–2 clientes de Bogotá sin localidad/);
  });

  test('el buscador no ordena dos localidades de «1–2» por su cifra', async () => {
    await iguales(cartera([['Usaquén', '', ''], ...veces(2, ['Usme', '', ''])]), cartera([...veces(2, ['Usaquén', '', '']), ['Usme', '', '']]), ['sugUs']);
  });

  test('Bogotá «4–5» frente a otro municipio con 5: el mismo orden con 4 que con 5', async () => {
    const con = bosa => cartera([...veces(3, ['Kennedy', '', 'pagado']), ...veces(bosa, ['Bosa', '', '']), ...veces(5, ['Soacha', '', 'pagado'])]);
    await iguales(con(1), con(2), ['pais', 'conquistas']);
  });

  test('Bogotá «9–10»: el mismo color en Cundinamarca con 9 que con 10', async () => {
    const con = bosa => cartera([...veces(8, ['Kennedy', '', '']), ...veces(bosa, ['Bosa', '', ''])]);
    await iguales(con(1), con(2), ['cundinamarca', 'pais']);
  });

  test('el nombre oficial entero manda sobre el recortado («Bochica II» es de Engativá)', async () => {
    assert.deepEqual(IB.barrios['bochica ii'], ['10'], 'precondición'); assert.ok(IB.barrios['bochica'].length > 1, 'precondición');
    const r = locDe('Bogotá', 'Bochica II'); assert.equal(r.estado, 'ubicado'); assert.equal(nombreLoc(r.codigo), 'Engativá');
  });

  test('un trozo de menos de 5 letras que va dentro de un nombre no es un barrio', async () => {
    for (const b of ['Dios', 'Mary', 'Palo', 'manz', 'cra']) assert.equal(locDe('Bogotá', b).estado, 'desconocido', b);
  });

  test('quitada la cola, una palabra de menos de 5 letras no es un barrio', async () => {
    assert.deepEqual(L.llavesBarrio('Real 2'), ['real 2']); assert.deepEqual(L.llavesBarrio('Toma II'), ['toma ii']);
    for (const b of ['Real 2', 'Toma II']) assert.equal(locDe('Bogotá', b).estado, 'desconocido', b);
  });

  test('los apodos de localidad: «Candelaria», «Santafé», «Rafael Uribe»', async () => {
    assert.equal(nombreLoc(locDe('Candelaria', '').codigo), 'La Candelaria'); assert.equal(nombreLoc(locDe('Santafé', '').codigo), 'Santa Fe'); assert.equal(nombreLoc(locDe('Rafael Uribe', '').codigo), 'Rafael Uribe Uribe');
    /* Y en «Barrio», donde además son el nombre de un barrio de OTRA localidad: no se escoge. */
    for (const b of ['Candelaria', 'Rafael Uribe']) assert.equal(locDe('Bogotá', b).estado, 'ambiguo', b);
  });

  test('la «Ciudad» de la ficha (la que Joan corrigió) manda sobre la del registro', async () => {
    const r = L.localidadDeCliente({ ciudad: 'Suba', barrio: '', vinculacion: { ciudad: 'Kennedy', barrio: '' } }, IB);
    assert.equal(nombreLoc(r.codigo), 'Suba');
  });

  test('con un closest() que mira el selector, pasar el ratón por una localidad dice cuál es', async () => {
    const { M } = await enBogotaCon(cartera(veces(7, ['Kennedy', '', ''])));
    M.caja.oy.mouseover({ target: M.zonaFiel('L08', 'loc'), clientX: 300, clientY: 300 });
    assert.equal(M.info.textContent, 'Kennedy (Bogotá) · 7 clientes');
  });

  test('con el <path> como blanco, tocar una localidad pone SU globito donde se tocó', async () => {
    const { M } = await enBogotaCon(cartera([...veces(7, ['Kennedy', '', '']), ...veces(4, ['Soacha', '', ''])]));
    M.clic(M.zonaFiel('L08', 'loc'), { clientX: 320, clientY: 330 });
    assert.equal(M.globo.innerHTML, '<b>Kennedy (Bogotá)</b> · 7 clientes');
    assert.deepEqual([M.globo.style.left, M.globo.style.top], ['230px', '290px'], 'el globito no va donde se tocó (320 − 90, 330 − 40)');
    M.clic(M.zonaFiel('25754'), { clientX: 200, clientY: 500 });
    assert.equal(M.globo.innerHTML, '<b>Soacha (Cundinamarca)</b> · 4 clientes');
  });

  test('en Conquistas, buscar Bogotá la abre (tocar Bogotá es entrar, también desde el buscador)', async () => {
    const { M, E } = await abrirCon(cartera(veces(3, ['Kennedy', '', 'pagado'])), { vista: 'conquistas' });
    entrar(M, 'bogota'); enter(M);
    assert.equal(E.depto, '11'); assert.equal(E.vista, 'conquistas'); assert.match(M.caja.innerHTML, /Localidades conquistadas/);
  });

  test('dentro de Bogotá, escoger una localidad cierra las sugerencias y saca su globito', async () => {
    const { M } = await enBogotaCon(cartera(veces(7, ['Kennedy', '', ''])));
    entrar(M, 'patio bonito'); assert.equal(M.sug.hidden, false, 'precondición');
    enter(M);
    assert.equal(M.sug.hidden, true, 'las sugerencias se quedaron abiertas'); assert.equal(M.sug.innerHTML, '');
    assert.equal(M.globo.hidden, false, 'no salió el globito'); assert.equal(M.globo.innerHTML, '<b>Kennedy (Bogotá)</b> · 7 clientes');
  });

  test('quitar y poner las calles: el botón cambia de aspecto y el aviso no sale sin fallos', async () => {
    const { M } = await enBogotaCon(cartera(veces(4, ['Kennedy', '', ''])));
    await espera(220);
    M.botonCalles.classList.add('on');
    M.clic(M.boton({ 'data-mapa': 'calles' }));
    assert.equal(M.botonCalles.classList.contains('on'), false, 'el botón sigue «puesto»');
    M.clic(M.boton({ 'data-mapa': 'calles' }));
    assert.equal(M.botonCalles.classList.contains('on'), true);
    assert.equal(M.aviso.hidden, true, 'dice que las calles no cargaron sin que ninguna haya fallado');
  });

  test('con el <svg> más ancho que la ventana, las calles cubren también las franjas de los lados', async () => {
    const { MC, M, E } = await enBogotaCon(cartera(veces(4, ['Kennedy', '', ''])), null, 1100, 648);
    await espera(220);
    const r = M.svg.getBoundingClientRect();
    const izq = MC.aMapa(E.z.vb, r, r.left, r.top)[0], der = MC.aMapa(E.z.vb, r, r.left + r.width, r.top)[0];
    assert.ok(izq < BOGOTA.caja[0] - 50 && der > BOGOTA.caja[0] + BOGOTA.caja[2] + 50, 'precondición: hay franjas');
    assert.ok(Math.min(...M.g.hijos.map(n => Number(n.attrs.x))) <= izq && Math.max(...M.g.hijos.map(n => Number(n.attrs.x) + Number(n.attrs.width))) >= der, 'quedan franjas sin calles');
  });

  test('cada <image> va donde dice teselas(), con su tamaño (medio píxel de más como mucho)', async () => {
    const { MC, M, E } = await enBogotaCon(cartera(veces(4, ['Kennedy', '', ''])));
    await espera(220);
    const r = M.svg.getBoundingClientRect();
    const a = MC.aMapa(E.z.vb, r, r.left, r.top), b = MC.aMapa(E.z.vb, r, r.left + r.width, r.top + r.height);
    const cuenta = Object.fromEntries(MC.teselas([a[0], a[1], b[0] - a[0], b[1] - a[1]], E.z.s, BOGOTA.proy).map(t => [t.z + '/' + t.x + '/' + t.y, t]));
    assert.equal(M.g.hijos.length, Object.keys(cuenta).length);
    for (const im of M.g.hijos) {
      const t = cuenta[im.attrs['data-t']];
      assert.ok(t, im.attrs['data-t']);
      assert.ok(Math.abs(Number(im.attrs.x) - t.mx) < 1e-6 && Math.abs(Number(im.attrs.y) - t.my) < 1e-6, 'la tesela ' + im.attrs['data-t'] + ' no va en su sitio');
      const mw = Number(im.attrs.width) - t.mw, mh = Number(im.attrs.height) - t.mh;
      assert.ok(mw >= 0 && mw <= E.z.s && mh >= 0 && mh <= E.z.s, 'la tesela ' + im.attrs['data-t'] + ' no mide lo suyo');
    }
  });

  test('el filtro #mapa-gris existe y quita el color', async () => {
    const { M } = await enBogotaCon(cartera(veces(4, ['Kennedy', '', ''])));
    assert.match(M.caja.innerHTML, /<filter id="mapa-gris"[^>]*><feColorMatrix type="saturate" values="0"\/>/);
  });

  test('una localidad no sale dos veces en el buscador (ni «como barrio»)', async () => {
    const { MC } = await abrirCon(cartera(veces(3, ['Suba', '', ''])));
    for (const q of ['suba', 'kennedy', 'usme', 'bosa']) {
      const r = MC.buscar(q), locs = r.map(x => x.slice(0, 3)).filter(x => /^L\d\d$/.test(x));
      assert.equal(new Set(locs).size, locs.length, '«' + q + '» → ' + r.join(' '));
    }
  });

  test('lo que escribió el cliente (barrio, nombre) sale escapado en la lista de sin localidad', async () => {
    const db = cartera([['Bogotá', '<img src=x onerror="alert(1)">', '']]);
    db.socios[0].nombre = 'Ana <b onmouseover="alert(1)">Pérez</b>'; db.socios[0].id = 's"><script>1</script>';
    const { M } = await enBogotaCon(db);
    assert.doesNotMatch(M.caja.innerHTML, /<img src=x|<b onmouseover|<script>/);
    assert.match(M.caja.innerHTML, /barrio «&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;»/);
  });

  test('en Conquistas de Bogotá: la nota de los sin localidad, y Sumapaz conquistada con su bandera', async () => {
    const db = cartera([...veces(3, ['Sumapaz', '', 'pagado']), ...veces(4, ['Bogotá', 'sur', ''])]);
    const { M } = await enBogotaCon(db, { vista: 'conquistas' });
    assert.match(M.caja.innerHTML, /<p class="mapa-sinloc"><b>4<\/b> clientes de Bogotá no tienen localidad/);
    assert.match(M.caja.innerHTML, /data-c="L20">Sumapaz · 🏁 3 clientes<\/button>/);
  });

  test('la hoja, medida también en la vista oscura y en el aviso', async () => {
    const CRM = leer('panel/crm.html');
    const i = CRM.indexOf(':root{');
    const VARS = Object.fromEntries([...CRM.slice(i, CRM.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+):([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    const color = (valor, sobre) => {
      const v = String(valor).trim();
      let m = /^var\(--([\w-]+)\)$/.exec(v); if (m) return color(VARS[m[1]], sobre);
      m = /^rgba\(var\(--([\w-]+)\),\s*([\d.]+)\)$/.exec(v);
      if (m) { const c = VARS[m[1]].split(',').map(Number), a = Number(m[2]); return c.map((x, k) => a * x + (1 - a) * sobre[k]); }
      if (/^#[0-9a-f]{6}$/i.test(v)) return [1, 3, 5].map(k => parseInt(v.slice(k, k + 2), 16));
      throw new Error('no sé leer el color «' + v + '»');
    };
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const Y = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const contraste = (a, b) => { const x = Y(a), y = Y(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hoja = leer('panel/mapa-clientes.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const decl = (sel, prop) => { let r = null; for (const m of hoja.matchAll(/([^{}]+)\{([^{}]*)\}/g)) { if (m[1].trim() !== sel) continue; for (const d of m[2].split(';')) { const k = d.indexOf(':'); if (k > 0 && d.slice(0, k).trim() === prop) r = d.slice(k + 1).trim(); } } return r; };
    const PAPEL = color('var(--papel)'), LACA = color('var(--laca)');
    const borde = color(decl('.mapa-oscuro .mapa-borde.mapa-ciudad', 'stroke'), LACA);
    assert.ok(contraste(borde, color('var(--laca-3)', LACA)) >= 3, 'el contorno de la ciudad en Conquistas no se separa de «sin clientes»');
    const fAviso = color(decl('.mapa-osm-aviso', 'background'), PAPEL);
    assert.ok(contraste(color(decl('.mapa-osm-aviso', 'color'), fAviso), fAviso) >= 4.5, 'el aviso de que las calles no cargaron no se lee');
    const sec = color(decl('.mapa-oscuro .mapa-et.mapa-et-sec', 'fill'), LACA).map((x, k) => Number(decl('.mapa-oscuro .mapa-et.mapa-et-sec', 'opacity')) * x + (1 - Number(decl('.mapa-oscuro .mapa-et.mapa-et-sec', 'opacity'))) * LACA[k]);
    assert.ok(contraste(sec, LACA) >= 4.5, 'el nombre de una zona vacía en Conquistas no se lee');
    const enlace = decl('.mapa-laca .mapa-enlace', 'color');
    assert.ok(enlace && contraste(color(enlace, LACA), LACA) >= 4.5, 'el enlace de Sumapaz en Conquistas no se lee');
  });

  test('la herramienta: cada sector de Catastro, en la localidad que lo contiene (también una C)', async () => {
    const fuera = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], hueco = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    const locs = [{ c: '01', geometry: { type: 'Polygon', coordinates: [fuera, hueco] } }, { c: '02', geometry: { type: 'Polygon', coordinates: [hueco] } }];
    const sectores = { features: [
      { properties: { SCANOMBRE: 'EL RECODO' }, geometry: { type: 'Polygon', coordinates: [[[2, 2], [8, 2], [8, 3], [3, 3], [3, 7], [8, 7], [8, 8], [2, 8], [2, 2]]] } },
      { properties: { SCANOMBRE: 'EL HUECO' }, geometry: { type: 'Polygon', coordinates: [[[4.5, 4.5], [5.5, 4.5], [5.5, 5.5], [4.5, 5.5], [4.5, 4.5]]] } },
      { properties: { SCANOMBRE: 'LEJOS' }, geometry: { type: 'Polygon', coordinates: [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]] } }] };
    const r = H.entradasDeBarrios(sectores, { features: [{ attributes: { NOMBRE: 'LEGALIZADO', CODIGO_LOCALIDAD: '02' } }] }, locs);
    assert.deepEqual(r.entradas.map(e => [e.nombre, e.localidad]), [['EL RECODO', '01'], ['EL HUECO', '02'], ['LEGALIZADO', '02']]);
    assert.deepEqual(r.fuera, ['LEJOS']);
    /* Con la rejilla, el punto de adentro solo decide las astillas: se prueba
       directo. El centroide de la C cae en su hueco, fuera de ella. */
    const C = sectores.features[0].geometry.coordinates, p = H.puntoDeAdentro(C);
    assert.ok(dentro(p[0], p[1], C), 'el punto de adentro de la C cae fuera de la C: ' + p);
  });

  test('la herramienta: los caminos salen con los decimales que se piden', async () => {
    const r = H.caminos([{ c: 'a', geometry: { type: 'Polygon', coordinates: [[[0.13, 0.27], [4.44, 0.31], [4.38, 4.56], [0.19, 4.62], [0.13, 0.27]]] } }], { ox: 0, oy: 10, kx: 1, ky: 1, m: 0 }, 0.001, 2);
    assert.equal(r.formas[0].d, 'M0.13 9.73l4.31-0.04-0.06-4.25-4.19-0.06z');
  });

  test('al MOVER el mapa (no al tocar una zona), ninguna tesela que ya está se pide otra vez', async () => {
    const { M } = await enBogotaCon(cartera(veces(4, ['Kennedy', '', ''])));
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    await espera(900);
    const t = M.zona('L08', 'loc');
    M.caja.oy.pointerdown({ target: t, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 350, clientY: 350 });
    M.caja.oy.pointermove({ target: t, pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 340, clientY: 350, cancelable: true, preventDefault() {} });
    M.caja.oy.pointerup({ target: t, pointerId: 1, pointerType: 'mouse', type: 'pointerup', clientX: 340, clientY: 350 });
    await espera(900);
    const llaves = M.creadas.map(n => n.attrs['data-t']);
    assert.ok(llaves.length > 6, 'precondición: el mapa se movió y entró una columna');
    assert.equal(new Set(llaves).size, llaves.length, 'se pidió dos veces la misma tesela');
  });

  /* Revisión del 15-nov: lo que la segunda revisión arregló en pantalla. */
  test('una proyección rota no cuelga la pestaña: sin escala o con un zoom que no es número, ninguna tesela', async () => {
    /* En otro hilo: si se cuelga, se corta a los 10 s y la prueba lo dice
       (en este, un bucle sin fin no deja ni que salte el tiempo). */
    const { Worker } = require('node:worker_threads');
    const cuerpo = `
      const { parentPort, workerData } = require('node:worker_threads');
      const MC = require(workerData.mc), p = require(workerData.bogota).proy, v = [2300, 3700, 1, 1];
      const con = x => Object.assign({}, p, x);
      const rotas = [con({ kx: 0 }), con({ kx: -p.kx }), con({ kx: NaN }), con({ ky: 0 }), con({ ky: -p.ky }), con({ ky: NaN })];
      parentPort.postMessage(JSON.stringify(rotas.map(r => MC.teselas(v, 0.05, r)).concat([MC.teselas(v, Infinity, con({ kx: Infinity }))])));`;
    const r = await new Promise((ok, mal) => {
      const w = new Worker(cuerpo, { eval: true, workerData: { mc: require.resolve('../panel/mapa-clientes.js'), bogota: RUTA_BOGOTA } });
      const t = setTimeout(() => { w.terminate(); ok('se colgó'); }, 10000);
      w.once('message', m => { clearTimeout(t); w.terminate(); ok(JSON.parse(m)); });
      w.once('error', e => { clearTimeout(t); mal(e); });
    });
    assert.deepEqual(r, [[], [], [], [], [], [], []]);
  });

  test('el buscador lee un barrio como se lee la ficha: «Soacha - Compartir» no lleva a Ciudad Bolívar', async () => {
    const { MC } = await enBogotaCon(cartera([['Bogotá', 'Timiza', '']]));
    assert.ok(MC.buscar('compartir').includes('L19|b'), 'precondición: «Compartir» a secas lleva a Ciudad Bolívar');
    assert.equal(L.localidadDe('', 'Soacha - Compartir', IB, IDX).estado, 'otro-municipio', 'precondición: en una ficha, nombra Soacha');
    assert.deepEqual(MC.buscar('soacha - compartir').filter(c => /^L/.test(c)), []);
  });

  test('Sumapaz, fuera de la ventana y sin ubicados, dice cuántos «sin localidad» pueden ser de ahí', async () => {
    assert.deepEqual(IB.barrios['las vegas'], ['08', '20'], 'precondición: «Las Vegas» está en Kennedy y en Sumapaz');
    const { M } = await enBogotaCon(cartera([['Bogotá', 'Las Vegas', ''], ['Bogotá', 'Timiza', '']]));
    assert.match(M.caja.innerHTML, /data-c="L20">Sumapaz · ninguno ubicado · 1–2 sin localidad pueden ser de aquí<\/button>/);
  });

  test('el sin barrio cuyo barrio del registro es de otro municipio dice de cuál', async () => {
    const db = cartera([['Bogotá', '', ''], ['Bogotá', '', ''], ['Bogotá', 'Timiza', '']]);
    db.socios[0].vinculacion = { ciudad: 'Soacha', barrio: 'Compartir' };
    const { M } = await enBogotaCon(db);
    const sin = M.caja.innerHTML.slice(M.caja.innerHTML.indexOf('mapa-sin-loc'));
    assert.match(sin, /#1 Persona s1<\/b><div class="muted">Sin barrio en la ficha \(el del registro es de Soacha\)\.<\/div>/);
    assert.match(sin, /#2 Persona s2<\/b><div class="muted">Sin barrio en la ficha\.<\/div>/);
  });

  test('solo lee: con clientes de BOGOTÁ (ubicados, repetidos y sin barrio), la cartera queda igual', async () => {
    const db = cartera([['Bogotá', 'Timiza', 'pagado'], ['Bogotá', 'Lisboa', ''], ['Bogotá', '', ''], ['Kennedy', 'Bosa Centro', ''], ['Soacha', '', '']]);
    const antes = JSON.stringify(db);
    const { M } = await enBogotaCon(db);
    M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' })); entrar(M, 'timiza'); enter(M);
    assert.equal(JSON.stringify(db), antes, 'la pestaña le cambió algo a la cartera');
  });
});

/* 9 · LA TERCERA VUELTA. Una tercera revisión del 15-nov, antes de
   publicar, encontró que los arreglos de la segunda habían abierto puertas
   nuevas: la localidad escrita, ensanchada con los barrios que se llaman
   como ella y cruzada después con el barrio, caía en OTRA («La Esperanza,
   San Cristóbal» salía en Usaquén); el registro con una ciudad que no se
   reconoce («Soacha Compartir», «Soacah») dejaba pasar su barrio como si
   fuera de Bogotá; y el JSON traía llaves a medio recortar («santa cecilia
   sector») que escogían una de cuatro. Cada prueba de aquí tira al menos
   una mutación de esos arreglos. */
describe('9 · la tercera vuelta: lo escrito no se ensancha hasta caer en otra localidad', () => {
  const locDe = barrio => L.localidadDe('Bogotá', barrio, IB, IDX);
  const ver = r => r.estado === 'ubicado' ? nombreLoc(r.codigo) : r.estado;
  const codigo = nombre => IB.porNombre[L.normalizar(nombre)];
  const deRegistro = (ciudad, barrio, idx) => L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { ciudad, barrio } }, IB, idx === undefined ? IDX : idx);

  test('un barrio de otra localidad junto a la que escribió el cliente: no casa, y nunca cae en una tercera', () => {
    assert.ok(!IB.barrios['la esperanza'].includes(codigo('San Cristóbal')), 'precondición: no hay «La Esperanza» en San Cristóbal');
    for (const k of ['laureles', 'alameda', 'bonanza']) assert.deepEqual(IB.barrios[k], [codigo('Engativá')], 'precondición: «' + k + '» es de Engativá');
    assert.deepEqual(IB.barrios['armenia'], [codigo('Teusaquillo')], 'precondición');
    for (const [b, escrita] of [['La Esperanza, San Cristóbal', 'San Cristóbal'], ['Laureles, Santa Fe', 'Santa Fe'], ['Teusaquillo Alameda', 'Teusaquillo'],
      ['Bonanza, Sumapaz', 'Sumapaz'], ['Alameda, La Candelaria', 'La Candelaria'], ['Chapinero Armenia', 'Chapinero']]) {
      const r = locDe(b);
      assert.equal(r.estado, 'choque', b);
      assert.ok(r.opciones.includes(codigo(escrita)), b + ': entre las opciones va la que escribió');
    }
  });

  test('lo que no casa da como opciones lo que se escribió, no los barrios que se llaman como la localidad', () => {
    /* Las opciones cuentan: la pestaña las suma a «pueden ser de aquí» de
       cada localidad. «Santa Fe 1 de Mayo» puede ser de Santa Fe o de San
       Cristóbal (allá está «1 de Mayo»), no de Bosa ni de Los Mártires por
       tener un barrio «Santa Fe». */
    assert.deepEqual(IB.barrios['1 de mayo'], [codigo('San Cristóbal')], 'precondición');
    assert.deepEqual(IB.barrios['santa fe'], [codigo('Bosa'), codigo('Los Mártires')], 'precondición');
    for (const b of ['Santa Fe 1 de Mayo', '1 de Mayo Santa Fe', 'Santa Fe 1 de Mayo II']) {
      const r = locDe(b);
      assert.equal(r.estado, 'choque', b);
      assert.deepEqual(r.opciones.slice().sort(), [codigo('Santa Fe'), codigo('San Cristóbal')].sort(), b);
    }
  });

  test('dos localidades escritas que no casan dan esas dos como opciones', () => {
    /* «Santa Fe» y «Antonio Nariño» son también barrios de Bosa: cruzadas
       así, caían allá (segunda revisión), y hoy el último candado lo
       pararía igual; lo que queda por vigilar es que Bosa no se cuele en
       las opciones. */
    const r = locDe('Santa Fe, Antonio Nariño');
    assert.equal(r.estado, 'choque');
    assert.deepEqual(r.opciones.slice().sort(), [codigo('Santa Fe'), codigo('Antonio Nariño')].sort());
  });

  test('un barrio de la lista que empieza por una localidad no cuenta como esa localidad escrita', () => {
    /* «San Cristóbal Norte» es un barrio de Usaquén: el último candado no
       debe leer ahí la localidad San Cristóbal. */
    assert.deepEqual(IB.barrios['san cristobal norte'], [codigo('Usaquén')], 'precondición');
    for (const b of ['Torre 3, San Cristóbal Norte', 'San Cristóbal Norte - Mz 4']) assert.equal(ver(locDe(b)), 'Usaquén', b);
  });

  test('con una localidad delante y otra detrás, el barrio de en medio va con una de las dos', () => {
    for (const [b, opciones] of [['Teusaquillo Altos de Suba', ['Teusaquillo', 'Suba']], ['Bosa Centro Santa Fe', ['Bosa', 'Santa Fe']],
      ['Teusaquillo Suba Urbano II', ['Teusaquillo', 'Suba']], ['Engativá Pueblo Usaquén sector', ['Engativá', 'Usaquén']]]) {
      const r = locDe(b);
      assert.equal(r.estado, 'choque', b);
      assert.deepEqual(r.opciones.slice().sort(), opciones.map(codigo).sort(), b);
    }
  });

  test('«Tunjuelito Rural» con su cola sigue siendo de Usme, no de Tunjuelito', () => {
    assert.deepEqual(IB.barrios['tunjuelito rural'], [codigo('Usme')], 'precondición');
    assert.deepEqual(L.llavesBarrio('Tunjuelito Rural parte alta'), ['tunjuelito rural parte alta', 'tunjuelito rural', 'tunjuelito']);
    for (const b of ['Tunjuelito Rural', 'Tunjuelito Rural parte alta', 'Tunjuelito Rural (parte baja)', 'Tunjuelito Rural - parte media', 'Tunjuelito Rural II',
      'Tunjuelito Rural sector 2', 'Tunjuelito Rural 2do sector']) assert.equal(ver(locDe(b)), 'Usme', b);
  });

  test('una «I» suelta al final puede ser el número del barrio: «Páramo Urbano I Manzana 4» es de Usaquén', () => {
    assert.deepEqual(IB.barrios['paramo urbano i'], [codigo('Usaquén')], 'precondición');
    assert.deepEqual(IB.barrios['paramo urbano'], [codigo('Chapinero')], 'precondición');
    for (const b of ['Páramo Urbano I Manzana 4', 'Páramo Urbano I', 'Páramo Urbano I Mz 4']) assert.equal(ver(locDe(b)), 'Usaquén', b);
    for (const b of ['Páramo Urbano', 'Páramo Urbano Manzana 4']) assert.equal(ver(locDe(b)), 'Chapinero', b);
    /* Detrás de otro número, la letra suelta es de la dirección: «Tibaque II I» no se lee «Tibaque III». */
    assert.deepEqual(IB.barrios['tibaque ii'], [codigo('Usme')], 'precondición'); assert.deepEqual(IB.barrios['tibaque iii'], [codigo('San Cristóbal')], 'precondición');
    assert.equal(ver(locDe('Tibaque II I Manzana 4')), 'Usme');
  });

  test('las llaves del JSON son el nombre entero o su punta, nunca uno a medio recortar', () => {
    assert.deepEqual(H.nombresDeOficial('SANTA CECILIA SECTOR I'), ['santa cecilia sector i', 'santa cecilia']);
    for (const k of ['santa cecilia sector', 'puerta al llano sector', 'salitre sector', 'bilbao primer sector', 'paramo rural', 'marco fidel suarez parte alta'])
      assert.equal(IB.barrios[k], undefined, k);
    for (const b of ['Santa Cecilia sector', 'Santa Cecilia sector 2', 'Puerta al Llano sector 3', 'Salitre sector 4']) assert.equal(locDe(b).estado, 'ambiguo', b);
  });

  test('un barrio de la lista y una localidad escrita (1 de cada 5 llaves × 20 localidades × 4 formas): nunca en otra localidad', () => {
    /* La excepción es la llave que trae otra localidad en su nombre: «Santa
       Fe, Bosa 37» es el barrio «Bosa 37», que es de Bosa. Y la llave de una
       calle cae en su localidad aunque el cliente escriba otra, si no fuera
       por el último candado: «Autopista Muzú, Suba Manzana 4» caía en Puente
       Aranda (Suba, de cuatro letras, se perdía con la cola). */
    assert.deepEqual(IB.barrios['autopista muzu'], [codigo('Puente Aranda')], 'precondición');
    assert.notEqual(ver(locDe('Autopista Muzú, Suba Manzana 4')), 'Puente Aranda');
    const nombres = Object.keys(IB.porNombre);
    const laNombra = (k, c) => nombres.some(n => IB.porNombre[n] === c && (' ' + k + ' ').indexOf(' ' + n + ' ') >= 0);
    const formas = [(k, l) => k + ', ' + l + ' manzana 4', (k, l) => l + ', ' + k, (k, l) => l + ' ' + k + ' ii', (k, l) => k + ' - ' + l];
    const fuera = [];
    let n = 0;
    Object.keys(IB.barrios).sort().forEach((k, i) => {
      if (i % 5) return;
      for (const c of Object.keys(IB.nombre)) for (const f of formas) {
        const t = f(k, IB.nombre[c]), r = L.localidadDe('Bogotá', t, IB);
        n++;
        if (r.estado === 'ubicado' && r.codigo !== c && !laNombra(k, r.codigo)) fuera.push(t + ' → ' + nombreLoc(r.codigo));
      }
    });
    assert.ok(n > 40000, 'precondición: ' + n + ' textos');
    assert.deepEqual(fuera.slice(0, 5), [], fuera.length + ' textos caen en una localidad que el cliente no escribió');
  });

  test('el registro con una ciudad que no se reconoce no presta su barrio, y la ficha dice de dónde era', () => {
    assert.equal(ver(L.localidadDe('', 'Compartir', IB, IDX)), 'Ciudad Bolívar', 'precondición: «Compartir» a secas es de Ciudad Bolívar');
    for (const [c, b] of [['Soacha Compartir', 'Compartir'], ['Soacah', 'Compartir'], ['Ciudad Verde', 'Compartir'], ['Faca', 'Villa Nueva'], ['Kenedy', 'Compartir'],
      ['Cundinamarca', 'Timiza'], ['Tota', 'Timiza']]) {
      const r = deRegistro(c, b);
      assert.equal(r.estado, 'vacio', c + ' + ' + b); assert.equal(r.registro, c);
    }
  });

  test('el registro que el buscador da por otro municipio se tira, aunque se llame como una localidad', () => {
    assert.deepEqual(IB.barrios['egipto'], [codigo('La Candelaria')], 'precondición');
    assert.deepEqual(IB.barrios['lucero alto'], [codigo('Ciudad Bolívar')], 'precondición');
    for (const [c, b] of [['Candelaria, Valle', 'Egipto'], ['Ciudad Bolívar, Antioquia', 'Lucero Alto'], ['Santa Fe de Antioquia', 'Las Cruces'], ['Armenia', 'La Soledad']]) {
      const r = deRegistro(c, b);
      assert.equal(r.estado, 'vacio', c + ' + ' + b); assert.equal(r.registro, c);
    }
    /* A secas, «Candelaria» son dos municipios y una localidad, y «Ciudad
       Bolívar», uno y una: valen como la localidad. */
    assert.equal(ver(deRegistro('Candelaria', 'Egipto')), 'La Candelaria');
    assert.equal(ver(deRegistro('Ciudad Bolívar', 'Lucero Alto')), 'Ciudad Bolívar');
  });

  test('el registro que es un barrio de la lista cuenta como una cosa dicha más', () => {
    assert.deepEqual(IB.barrios['engativa pueblo'], [codigo('Engativá')], 'precondición');
    assert.equal(deRegistro('Engativá Pueblo', 'Compartir').estado, 'choque');
    assert.equal(ver(deRegistro('Engativá Pueblo', 'Engativá Centro')), 'Engativá');
    /* Sin el buscador de municipios no se sabe si «Engativá Pueblo» es un
       barrio o un pueblo: se tira. */
    assert.equal(deRegistro('Engativá Pueblo', 'Engativá Centro', null).estado, 'vacio');
  });

  test('en el registro, Bogotá con su departamento o con una errata es Bogotá; una errata igual de cerca de otro municipio, no', () => {
    assert.equal(ver(deRegistro('Bogotá, Cundinamarca', 'Timiza')), 'Kennedy');
    /* A una letra, o con dos vecinas trocadas («Bogtoa»). */
    for (const c of ['Bogata', 'Bogot D.C.', 'Bgota', 'Bogtoa', 'Vogota']) assert.equal(ver(deRegistro(c, 'Timiza')), 'Kennedy', c);
    /* «Bonita», «Bota» y «Bojata» están a dos letras; «Sogota» y «Bocota»,
       a una de Bogotá y a una de Socotá. */
    for (const c of ['Bonita', 'Bota', 'Bojata', 'Sogota', 'Bocota']) assert.equal(deRegistro(c, 'Timiza').estado, 'vacio', c);
    assert.equal(deRegistro('Bogtá', 'Timiza', null).estado, 'vacio', 'sin el buscador de municipios, una errata no se sabe de qué es');
  });

  test('la nota de los sin localidad nombra todas las razones: también lo escrito que no casa y el otro municipio', async () => {
    const db = cartera([['Bogotá', 'Teusaquillo Alameda', ''], ['Bogotá', 'Timiza', '']]);
    const { M } = await abrirCon(db, { depto: '11' });
    assert.match(M.caja.innerHTML, /no tienen barrio \(o el del registro es de otra ciudad\), su barrio no está en la lista o está en varias localidades, la localidad que escribieron se llama también como un barrio de otra, lo escrito apunta a localidades distintas o nombra otro municipio\./);
  });
});

describe('10 · la cuarta vuelta: la casa del barrio, el registro que nombra otro sitio y lo que dice la pestaña', () => {
  const locDe = barrio => L.localidadDe('Bogotá', barrio, IB, IDX);
  const ver = r => r.estado === 'ubicado' ? nombreLoc(r.codigo) : r.estado;
  const codigo = nombre => IB.porNombre[L.normalizar(nombre)];
  const deRegistro = (ciudad, barrio) => L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { ciudad, barrio } }, IB, IDX);

  test('la localidad al final de un barrio de OTRA, quitada la cola, no es esa localidad: «Casa 12, Tunjuelito Rural» es de Usme', () => {
    assert.deepEqual(IB.barrios['tunjuelito rural'], [codigo('Usme')], 'precondición');
    assert.deepEqual(IB.barrios['san rafael usme rural i'], [codigo('San Cristóbal')], 'precondición');
    for (const b of ['Casa 12, Tunjuelito Rural', 'Finca 2, Vereda Tunjuelito Rural', 'Finca 3, Tunjuelito Rural']) assert.equal(ver(locDe(b)), 'Usme', b);
    for (const b of ['Lote 5 Tunjuelito Rural', 'Mz 4 Tunjuelito Rural', 'Casa 12, Tunjuelito Rural sector']) assert.notEqual(ver(locDe(b)), 'Tunjuelito', b);
    /* Con lo que tiene delante, también: «San Rafael Usme Rural I» es de San Cristóbal. */
    assert.equal(ver(locDe('Casa 12, San Rafael Usme Rural I')), 'San Cristóbal');
    /* Y con algo delante que no es una dirección que se quite («Finca 3», «Lote» sin número), también se
       mira desde el principio: no es Usme. */
    for (const b of ['Finca 3 San Rafael Usme Rural I', 'Lote San Rafael Usme Rural I']) assert.notEqual(ver(locDe(b)), 'Usme', b);
    assert.equal(ver(deRegistro('Bogotá', 'Finca 3, Tunjuelito Rural')), 'Usme', 'por el registro, igual');
    /* Si el barrio de la lista SÍ es de esa localidad, la del final vale. */
    assert.equal(ver(locDe('Lote 5 Centro Engativá sector')), 'Engativá');
  });

  test('«casa 5» o «torre 2» detrás del barrio son de la dirección: el barrio se sigue viendo', () => {
    assert.deepEqual(IB.barrios['patio bonito'], [codigo('Kennedy')], 'precondición');
    assert.deepEqual(IB.barrios['timiza'], [codigo('Kennedy')], 'precondición');
    assert.ok(L.llavesBarrio('Patio Bonito casa 5').includes('patio bonito'));
    for (const b of ['Patio Bonito casa 5, Bosa', 'Timiza torre 2, Bosa', 'Bosa, Patio Bonito casa 5', 'Patio Bonito torre 3 apto 402, Bosa']) {
      assert.equal(locDe(b).estado, 'choque', b + ': como «Patio Bonito, Bosa»');
    }
    assert.equal(L.localidadDe('Bosa', 'Patio Bonito casa 5', IB, IDX).estado, 'choque', 'con la localidad en «Ciudad», igual');
    assert.equal(ver(locDe('Patio Bonito torre 3')), 'Kennedy');
    /* Detrás de un artículo, la torre es el nombre; y el paso de en medio también es una llave. */
    assert.equal(ver(locDe('La Torre 2')), 'Ciudad Bolívar');
    for (const [b, igual] of [['La Torre 2', 'La Torre'], ['Villa de la Torre 2', 'Villa de la Torre'], ['La Concordia 1 casa 5', 'La Concordia 1']]) {
      assert.equal(ver(locDe(b)), ver(locDe(igual)), b);
    }
    assert.notEqual(ver(locDe('La Concordia 1')), ver(locDe('La Concordia')), 'precondición: sin el «1» es otro barrio');
    assert.equal(locDe('La Concordia 1 casa 5, La Candelaria').estado, 'choque');
  });

  test('el registro con un departamento que se llama como un barrio de aquí, o que nombra otro municipio, no presta su barrio', () => {
    assert.deepEqual(IB.barrios['santander'], [codigo('Antonio Nariño')], 'precondición: «Santander» es también un barrio de Bogotá');
    assert.ok(IB.barrios['quindio'] && IB.barrios['la magdalena'], 'precondición: «Quindío» y «La Magdalena» también');
    for (const [c, b] of [['Santander', 'Centro'], ['Santander', 'Cabecera del Llano'], ['SANTANDER', 'Real de Minas'], ['Quindío', 'Centro'],
      ['Magdalena', 'Centro'], ['Bogotá - Soacha', 'Compartir'], ['Bogotá, Chía', 'Compartir'], ['Bogotá (Soacha)', 'Compartir']]) {
      const r = deRegistro(c, b);
      assert.equal(r.estado, 'vacio', c + ' + ' + b);
      assert.equal(r.registro, c, c + ': la ficha dice de dónde era');
    }
    /* Bogotá con su departamento o con una localidad sí es Bogotá. */
    for (const c of ['Bogotá, Cundinamarca', 'Bogotá, D.C.', 'Bogotá D.C.', 'Bogotá - Kennedy']) assert.equal(ver(deRegistro(c, 'Timiza')), 'Kennedy', c);
  });

  test('«Ciudad» que nombra también otro municipio («Bogotá - Soacha») no busca el barrio en Bogotá', () => {
    for (const [c, b] of [['Bogotá - Soacha', 'Compartir'], ['Bogotá, Soacha', 'Ciudadela Sucre'], ['Bogotá / Chía', 'Compartir']]) {
      const r = L.localidadDe(c, b, IB, IDX);
      assert.equal(r.estado, 'otro-municipio', c + ' + ' + b);
      assert.equal(r.en, 'ciudad', c);
    }
    assert.equal(L.localidadDe('Bogotá - Soacha', 'Compartir', IB, IDX).municipio, 'Soacha');
    for (const c of ['Bogotá - Kennedy', 'Bogotá D.C.', 'Bogotá, Colombia', 'Bogotá, Cundinamarca', 'Santa Fe de Bogotá']) {
      assert.equal(ver(L.localidadDe(c, 'Timiza', IB, IDX)), 'Kennedy', c);
    }
  });

  test('la localidad escrita que se llama también como un barrio: la duda es del nombre, y el consejo sirve', () => {
    for (const [h, otras] of [['Santa Fe', ['Bosa', 'Los Mártires']], ['La Candelaria', ['Suba']], ['San Cristóbal', ['Usaquén']],
      ['Antonio Nariño', ['Bosa']], ['Sumapaz', ['Kennedy', 'Ciudad Bolívar']], ['Rafael Uribe', ['Barrios Unidos']]]) {
      const r = locDe('Narnia, ' + h);
      assert.equal(r.estado, 'ambiguo', h);
      assert.equal(r.homonima, codigo(h), h);
      assert.deepEqual(r.homonimaEn.map(nombreLoc).sort(), otras.slice().sort(), h);
      /* Lo que dice la pestaña que haga: «Bogotá - <la localidad>» en «Ciudad». Por el camino
         entero del mapa: primero el municipio, después la localidad. */
      const ciudad = 'Bogotá - ' + nombreLoc(codigo(h));
      assert.equal(L.lugarDeCliente({ ciudad }, IDX).codigo, IB.municipio, ciudad);
      assert.equal(ver(L.localidadDeCliente({ ciudad, barrio: 'Narnia, ' + h }, IB, IDX)), nombreLoc(codigo(h)), ciudad);
    }
    assert.equal(locDe('Centro histórico, La Candelaria').homonima, codigo('La Candelaria'));
    assert.equal(locDe('Lisboa').homonima, undefined, 'un barrio repetido de verdad sigue diciendo eso');
    /* Escrita dos veces, la localidad puede quedar fuera de las opciones: «Acacias, Sumapaz, Sumapaz»
       es Kennedy o Ciudad Bolívar. Entonces la duda no es su nombre, y ponerla en «Ciudad» no lo
       arreglaría (daría que no casa): no se dice. */
    const dos = locDe('Acacias, Sumapaz, Sumapaz');
    assert.equal(dos.estado, 'ambiguo');
    assert.ok(!dos.opciones.includes(codigo('Sumapaz')), 'precondición');
    assert.equal(dos.homonima, undefined);
    assert.equal(L.localidadDe('Bogotá - Sumapaz', 'Acacias, Sumapaz, Sumapaz', IB, IDX).estado, 'choque', 'el consejo no serviría');
    /* Y las otras son las que están entre las opciones: «La Paz, Santa Fe, Santa Fe» puede ser de Santa Fe o
       de Bosa, no de Los Mártires. */
    const paz = locDe('La Paz, Santa Fe, Santa Fe');
    assert.deepEqual(paz.opciones.map(nombreLoc).sort(), ['Bosa', 'Santa Fe']);
    assert.deepEqual(paz.homonimaEn.map(nombreLoc), ['Bosa']);
  });

  test('en la pestaña, cada porqué dice la causa de verdad, y el consejo de arriba también vale para esos', async () => {
    const db = cartera([['Bogotá', 'Centro histórico, La Candelaria', ''], ['Bogotá - Soacha', 'Compartir', ''], ['Bogotá', 'Patio Bonito casa 5, Bosa', '']]);
    const { M } = await abrirCon(db, { depto: '11' });
    const h = M.caja.innerHTML;
    const sin = h.slice(h.indexOf('<details class="mapa-sin mapa-sin-loc">'), h.indexOf('</details>', h.indexOf('mapa-sin-loc')));
    assert.match(sin, /#1 Persona s1<\/b> · barrio «Centro histórico, La Candelaria»<div class="muted">La localidad «La Candelaria» se llama también como un barrio de Suba, y lo demás no dice cuál es: pon en «Ciudad» «Bogotá - La Candelaria»\.<\/div>/);
    assert.match(sin, /#2 Persona s2<\/b> · barrio «Compartir»<div class="muted">«Ciudad» nombra también otro municipio \(Soacha\): deja en «Ciudad» solo el municipio donde vive\.<\/div>/);
    assert.match(sin, /#3 Persona s3<\/b> · barrio «Patio Bonito casa 5, Bosa»<div class="muted">Lo escrito apunta a localidades distintas: (Bosa y Kennedy|Kennedy y Bosa)\.<\/div>/);
    assert.match(sin, /escribe la suya al lado \(«Lisboa, Suba»\) o ponla en «Ciudad» detrás de Bogotá: «Bogotá - Suba»\. Sola no: Santa Fe, San Cristóbal y Ciudad Bolívar son también municipios de otros departamentos\.<\/p>/);
  });
});

describe('11 · la quinta vuelta: la ciudad dentro del barrio, la dirección delante y un consejo que deja en Bogotá', () => {
  const locDe = barrio => L.localidadDe('Bogotá', barrio, IB, IDX);
  const ver = r => r.estado === 'ubicado' ? nombreLoc(r.codigo) : r.estado;
  const codigo = nombre => IB.porNombre[L.normalizar(nombre)];
  const deRegistro = (ciudad, barrio) => L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { ciudad, barrio } }, IB, IDX);

  test('«Cundinamarca» o «Colombia» que quedan al quitar la dirección no son el barrio de ese nombre', () => {
    assert.deepEqual(IB.barrios['cundinamarca'], [codigo('Puente Aranda')], 'precondición: es también un barrio de Puente Aranda');
    assert.ok(IB.barrios['colombia'], 'precondición');
    for (const b of ['Cundinamarca casa 5', 'Cundinamarca, casa 5', 'Bogotá Cundinamarca torre 4 apto 301', 'Colombia torre 2',
      'Casa 5 Cundinamarca', 'Torre 2 Colombia']) {
      assert.equal(locDe(b).estado, 'desconocido', b);
    }
    assert.equal(ver(L.localidadDe('Suba', 'Bogotá Cundinamarca casa 5', IB, IDX)), 'Suba', 'ya no choca con Puente Aranda');
    assert.equal(ver(locDe('Mz 4 Colombia, Engativá')), 'Engativá');
    assert.equal(ver(locDe('Timiza, Cundinamarca casa 5')), 'Kennedy');
    /* Con la cola de un nombre sí vale, como antes: «Colombia II» no es el país. Con coma o sin ella. */
    for (const b of ['Cundinamarca II', 'Casa 12, Cundinamarca II', 'Casa 12 Cundinamarca II']) assert.equal(ver(locDe(b)), 'Puente Aranda', b);
    assert.equal(locDe('Colombia II').estado, 'ambiguo');
    assert.equal(locDe('Usaquén Colombia II').estado, 'choque', 'la localidad escrita no gana por quitarle la llave al barrio');
  });

  test('la dirección DELANTE del barrio también se quita: «Mz 4 Lt 12 Patio Bonito, Bosa» no casa, como «Patio Bonito, Bosa»', () => {
    assert.deepEqual(IB.barrios['patio bonito'], [codigo('Kennedy')], 'precondición');
    for (const b of ['Mz 4 Lt 12 Patio Bonito, Bosa', 'Casa 5 Patio Bonito, Bosa', 'Torre 3 Apto 402 Timiza, Bosa',
      'Mz 4 Barrio Patio Bonito, Bosa', 'Mz 4 Patio Bonito Bosa']) {
      assert.equal(locDe(b).estado, 'choque', b);
    }
    assert.equal(L.localidadDe('Bosa', 'Mz 4 Patio Bonito', IB, IDX).estado, 'choque', 'con la localidad en «Ciudad», igual');
    for (const b of ['Mz 4 Lt 12 Patio Bonito', 'Casa 5 Patio Bonito', 'Torre 3 Apto 402 Timiza']) assert.equal(ver(locDe(b)), 'Kennedy', b);
    assert.deepEqual(L.llavesBarrio('Mz 4 Lt 12 Patio Bonito'), ['mz 4 lt 12 patio bonito', 'lt 12 patio bonito', 'patio bonito'],
      'lo de delante cuenta de último, un par cada vez');
    /* Un par cada vez, y lo que queda se lee entero: «Lote 95A» y «Lote N 2» son parte del nombre oficial. */
    assert.deepEqual(IB.barrios['lote 95a anexo soratama'], [codigo('Usaquén')], 'precondición');
    assert.equal(ver(locDe('Mz 4 Lote 95A Anexo Soratama')), 'Usaquén');
    assert.equal(ver(locDe('Mz 4 Lote N 2 de la Manzana de la Parcelación')), ver(locDe('Lote N 2 de la Manzana de la Parcelación')));
    assert.equal(locDe('Mz 4 Lote N 2 de la Manzana de la Parcelación, Engativá').estado, 'choque', 'como sin la dirección');
    assert.deepEqual(L.llavesBarrio('Mz 4 Lt 12 Patio Bonito', true), ['mz 4 lt 12 patio bonito'], 'la lista oficial no cambia');
    /* «Casa Blanca» empieza por «casa» sin número: es el nombre, y no se le quita («Casa Blanca Suba» no es «Suba»). */
    assert.deepEqual(L.llavesBarrio('Casa Blanca 2'), ['casa blanca 2', 'casa blanca']);
    assert.deepEqual(L.llavesBarrio('Casa Blanca Suba'), ['casa blanca suba']);
    /* Y lo que la cuarta vuelta dejaba sin saberse ya se sabe: es de Usme. */
    for (const b of ['Lote 5 Tunjuelito Rural', 'Mz 4 Tunjuelito Rural', 'Casa 12, Tunjuelito Rural sector']) assert.equal(ver(locDe(b)), 'Usme', b);
  });

  test('en «Ciudad», el municipio con su departamento pegado es otro municipio: «Bogotá - Soacha Cundinamarca»', () => {
    for (const c of ['Bogotá - Soacha Cundinamarca', 'Bogotá, Soacha Cund.']) {
      const r = L.localidadDe(c, 'Compartir', IB, IDX);
      assert.equal(r.estado, 'otro-municipio', c);
      assert.equal(r.municipio, 'Soacha', c);
      assert.equal(r.en, 'ciudad', c);
      const g = deRegistro(c, 'Compartir');
      assert.equal(g.estado, 'vacio', c + ', en el registro');
      assert.equal(g.registro, c, c + ': la ficha dice de dónde era');
    }
    /* El departamento dice cuál de los que se llaman igual: «Ciudad Bolívar Antioquia» no es la localidad.
       Y uno que no es el suyo («Soacha Boyacá», mal escrito) no lo vuelve Bogotá. */
    for (const [c, m] of [['Bogotá - Ciudad Bolívar Antioquia', 'Ciudad Bolívar'], ['Bogotá - Soacha Boyacá', 'Soacha']]) {
      const r = L.localidadDe(c, 'Compartir', IB, IDX);
      assert.equal(r.estado, 'otro-municipio', c);
      assert.equal(r.municipio, m, c);
    }
    /* Pero el nombre de una localidad con un departamento que no es el suyo es esa localidad y un barrio:
       «Candelaria Boyacá» es La Candelaria y el barrio Boyacá, de Engativá (no casa). Con el suyo, el municipio
       de allá, como desde la tercera vuelta. */
    assert.equal(locDe('Candelaria Boyacá').estado, 'choque');
    assert.equal(locDe('Candelaria Valle').estado, 'otro-municipio');
    /* Bogotá con su departamento sigue siendo Bogotá. */
    for (const c of ['Bogotá Cundinamarca', 'Bogotá, Cundinamarca', 'Bogotá D.C. Cundinamarca']) {
      assert.equal(ver(L.localidadDe(c, 'Timiza', IB, IDX)), 'Kennedy', c);
      assert.equal(ver(deRegistro(c, 'Timiza')), 'Kennedy', c + ', en el registro');
    }
  });

  test('en «Ciudad», un municipio que se llama como un barrio de aquí: el barrio escrito dice cuál de los dos es', () => {
    assert.deepEqual(IB.barrios['madrid'], [codigo('Rafael Uribe Uribe')], 'precondición: Madrid es también un barrio de Rafael Uribe Uribe');
    assert.equal(L.lugarDeCliente({ ciudad: 'Madrid' }, IDX).codigo, '25430', 'precondición: y un municipio de Cundinamarca');
    for (const [c, b] of [['Bogotá - Madrid', 'Compartir'], ['Bogotá / Madrid', 'Timiza']]) {
      const r = L.localidadDe(c, b, IB, IDX);
      assert.equal(r.estado, 'otro-municipio', c + ' + ' + b);
      assert.equal(r.municipio, 'Madrid', c + ' + ' + b);
      assert.equal(r.en, 'ciudad', c + ' + ' + b);
    }
    /* Si el barrio casa con el de ese nombre, es el barrio. */
    for (const [c, b, loc] of [['Bogotá - Madrid', 'Madrid', 'Rafael Uribe Uribe'], ['Bogotá - Madrid', 'Quiroga', 'Rafael Uribe Uribe'],
      ['Bogotá - Florencia', 'Florencia', 'Engativá']]) {
      assert.equal(ver(L.localidadDe(c, b, IB, IDX)), loc, c + ' + ' + b);
    }
    /* Si el barrio no dice nada, no se sabe cuál de los dos es, y no se escoge. */
    assert.equal(L.localidadDe('Bogotá - Madrid', 'Narnia', IB, IDX).estado, 'desconocido');
    /* Por el registro, igual. */
    const g = deRegistro('Bogotá - Madrid', 'Compartir');
    assert.equal(g.estado, 'vacio');
    assert.equal(g.registro, 'Bogotá - Madrid');
    assert.equal(ver(deRegistro('Bogotá - Madrid', 'Madrid')), 'Rafael Uribe Uribe');
    /* Y se sabe que el trozo es también un barrio de aquí, para decirlo en la pestaña. */
    assert.equal(L.localidadDe('Bogotá - Madrid', 'Compartir', IB, IDX).tambienBarrio, true);
    assert.equal(L.localidadDe('Bogotá - Soacha', 'Compartir', IB, IDX).tambienBarrio, false);
  });

  test('en la pestaña, «Bogotá - Madrid» dice también que puede ser el barrio, y «Bogotá - Soacha» no', async () => {
    const db = cartera([['Bogotá - Madrid', 'Compartir', ''], ['Bogotá - Soacha Cundinamarca', 'Compartir', '']]);
    const { M } = await abrirCon(db, { depto: '11' });
    const h = M.caja.innerHTML;
    const sin = h.slice(h.indexOf('<details class="mapa-sin mapa-sin-loc">'), h.indexOf('</details>', h.indexOf('mapa-sin-loc')));
    assert.match(sin, /#1 Persona s1<\/b> · barrio «Compartir»<div class="muted">«Ciudad» nombra también otro municipio \(Madrid\): deja en «Ciudad» solo el municipio donde vive\. Si es un barrio de aquí que se llama igual, va en «Barrio»\.<\/div>/);
    assert.match(sin, /#2 Persona s2<\/b> · barrio «Compartir»<div class="muted">«Ciudad» nombra también otro municipio \(Soacha\): deja en «Ciudad» solo el municipio donde vive\.<\/div>/);
  });

  test('el consejo de la pestaña deja al cliente en Bogotá: «Bogotá - Santa Fe» en «Ciudad», no «Santa Fe» sola', () => {
    const locs = Object.keys(IB.nombre).map(nombreLoc);
    assert.equal(locs.length, 20, 'precondición');
    for (const x of locs) {
      /* Sola, tres son también municipios de otros departamentos: el cliente salía de Bogotá. */
      const sola = L.lugarDeCliente({ ciudad: x }, IDX);
      if (['Ciudad Bolívar', 'San Cristóbal', 'Santa Fe'].includes(x)) assert.equal(sola.estado, 'ambiguo', x);
      else assert.equal(sola.codigo, IB.municipio, x);
      /* Detrás de Bogotá, todas quedan en Bogotá y en su localidad, con barrio o sin él. */
      const ciudad = 'Bogotá - ' + x;
      assert.equal(L.lugarDeCliente({ ciudad }, IDX).codigo, IB.municipio, ciudad);
      assert.equal(ver(L.localidadDeCliente({ ciudad, barrio: '' }, IB, IDX)), x, ciudad);
      assert.equal(ver(L.localidadDeCliente({ ciudad, barrio: 'Narnia, ' + x }, IB, IDX)), x, ciudad + ' + Narnia');
    }
    /* El ejemplo de la pestaña: «Lisboa» está en varias localidades. */
    assert.ok(IB.barrios['lisboa'].length > 1, 'precondición');
    assert.equal(ver(L.localidadDeCliente({ ciudad: 'Bogotá - Suba', barrio: 'Lisboa' }, IB, IDX)), 'Suba');
  });
});

describe('12 · la sexta vuelta: la dirección pegada al municipio, el país detrás y el departamento con la localidad', () => {
  const locDe = barrio => L.localidadDe('Bogotá', barrio, IB, IDX);
  const ver = r => r.estado === 'ubicado' ? nombreLoc(r.codigo) : r.estado;
  const deRegistro = (ciudad, barrio) => L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { ciudad, barrio } }, IB, IDX);

  test('la dirección pegada al municipio no lo esconde: «Casa 5 Soacha, Compartir» es de Soacha, no de Ciudad Bolívar', () => {
    assert.equal(ver(locDe('Compartir')), 'Ciudad Bolívar', 'precondición: hay un Compartir en Ciudad Bolívar');
    for (const [b, m] of [['Casa 5 Soacha, Compartir', 'Soacha'], ['Compartir, Soacha casa 5', 'Soacha'], ['Torre 3 Apto 402 Soacha, Compartir', 'Soacha'],
      ['Compartir, Soacha calle 5', 'Soacha'], ['Mz 4 Lt 12 Mosquera, Villa Nueva', 'Mosquera'], ['Casa 5 Chía - 20 de Julio', 'Chía']]) {
      const r = locDe(b);
      assert.equal(r.estado, 'otro-municipio', b);
      assert.equal(r.municipio, m, b);
    }
    /* Con la dirección o sin ella, lo mismo. */
    for (const b of ['Soacha casa 5', 'Casa 5 Soacha', 'Soacha mz 4']) assert.deepEqual(locDe(b), Object.assign(locDe('Soacha, casa 5'), { texto: b }), b);
    /* El barrio de aquí que se llama como un municipio se miró ya sin la dirección: sigue siendo el barrio. */
    for (const b of ['Madrid casa 5', 'Casa 12 Madrid']) assert.equal(ver(locDe(b)), 'Rafael Uribe Uribe', b);
    /* Lo que queda no se toma por municipio si es una localidad («Candelaria» es también dos municipios) o el país
       (hay un Colombia en el Huila), aunque el barrio no case con el barrio de ese nombre. */
    for (const c of ['Bogotá - Casa 3 Candelaria', 'Bogotá - Colombia torre 2']) {
      for (const b of ['Egipto', 'Timiza']) assert.notEqual(L.localidadDe(c, b, IB, IDX).estado, 'otro-municipio', c + ' + ' + b);
    }
    /* En «Ciudad», igual. */
    for (const c of ['Bogotá - Casa 5 Soacha', 'Bogotá - Soacha casa 5']) {
      const r = L.localidadDe(c, 'Compartir', IB, IDX);
      assert.equal(r.estado, 'otro-municipio', c);
      assert.equal(r.en, 'ciudad', c);
      assert.equal(deRegistro(c, 'Compartir').estado, 'vacio', c + ', en el registro');
    }
  });

  test('el país detrás del departamento: «Bogotá - Soacha Cundinamarca Colombia» sigue siendo Soacha', () => {
    const r = L.localidadDe('Bogotá - Soacha Cundinamarca Colombia', 'Compartir', IB, IDX);
    assert.equal(r.estado, 'otro-municipio');
    assert.equal(r.municipio, 'Soacha');
    assert.equal(deRegistro('Bogotá - Soacha Cundinamarca Colombia', 'Compartir').estado, 'vacio');
    assert.equal(locDe('Soacha Cundinamarca Colombia, Compartir').municipio, 'Soacha');
    /* Quitado el país, lo que queda sigue la regla del barrio: Cabrera es también un barrio de Chapinero. Con su
       departamento sí es el municipio (quinta vuelta). */
    assert.equal(ver(locDe('Cabrera')), 'Chapinero', 'precondición');
    assert.notEqual(locDe('Cabrera Colombia').estado, 'otro-municipio');
    assert.equal(locDe('Cabrera Cundinamarca Colombia').municipio, 'Cabrera');
    /* «Colombia torre 2» es el país (sección 11), no Colombia, del Huila. */
    assert.ok(['ubicado', 'ambiguo'].includes(L.lugarDeCliente({ ciudad: 'Colombia' }, IDX).estado), 'precondición: hay municipios Colombia');
  });

  test('con un departamento que no es el suyo, el nombre que es también un barrio de aquí sigue la regla del barrio', () => {
    assert.deepEqual(IB.barrios['restrepo'], [IB.porNombre['antonio narino']], 'precondición: Restrepo es un barrio de Antonio Nariño');
    assert.ok(IB.barrios['florencia'], 'precondición');
    /* «Policarpa» es de Antonio Nariño: casa con el barrio Restrepo. La quinta vuelta lo volvía el Restrepo del Meta. */
    assert.equal(ver(L.localidadDe('Bogotá - Restrepo Santander', 'Policarpa', IB, IDX)), 'Antonio Nariño');
    assert.equal(ver(deRegistro('Bogotá - Restrepo Santander', 'Policarpa')), 'Antonio Nariño', 'en el registro');
    assert.equal(ver(L.localidadDe('Bogotá - Florencia Boyacá', 'Florencia', IB, IDX)), 'Engativá');
    /* Si el barrio no casa, es el otro municipio, como sin el departamento. */
    assert.equal(L.localidadDe('Bogotá - Restrepo Santander', 'Compartir', IB, IDX).estado, 'otro-municipio');
    /* En «Barrio», sin nada que diga otra cosa, no se escoge el municipio. */
    for (const b of ['Restrepo Santander', 'Florencia Boyacá']) assert.notEqual(locDe(b).estado, 'otro-municipio', b);
    assert.equal(ver(locDe('Florencia Boyacá, Engativá')), 'Engativá');
    /* El nombre de una localidad con un departamento que no es el suyo tampoco pasa a municipio en «Ciudad», aunque el
       barrio no case con nada de ese nombre (sección 11: «Candelaria Boyacá»). */
    assert.notEqual(L.localidadDe('Bogotá - Candelaria Boyacá', 'Timiza', IB, IDX).estado, 'otro-municipio');
    /* Con su departamento sí es el municipio, y lo que no es un barrio de aquí también. */
    assert.equal(locDe('Florencia Caquetá').municipio, 'Florencia');
    assert.equal(locDe('Soacha Boyacá').municipio, 'Soacha');
  });

  test('en «Ciudad», la localidad con el departamento o el país pegados es esa localidad: «Kennedy Cundinamarca»', () => {
    for (const [c, loc] of [['Kennedy Cundinamarca', 'Kennedy'], ['Bosa Cundinamarca', 'Bosa'], ['Engativá Cund', 'Engativá'], ['Kennedy Colombia', 'Kennedy'],
      ['Kennedy Cundinamarca Colombia', 'Kennedy']]) {
      assert.equal(L.lugarDeCliente({ ciudad: c }, IDX).codigo, IB.municipio, 'precondición: ' + c + ' es Bogotá');
      /* Antes no se leía, y decidía el barrio solo: «Compartir» caía en Ciudad Bolívar. */
      assert.equal(L.localidadDe(c, 'Compartir', IB, IDX).estado, 'choque', c);
      assert.equal(ver(L.localidadDeCliente({ ciudad: c, barrio: '' }, IB, IDX)), loc, c + ', sin barrio');
      assert.equal(ver(deRegistro(c, 'Compartir')), 'choque', c + ', en el registro');
    }
    assert.equal(ver(L.localidadDe('Kennedy Cundinamarca', 'Timiza', IB, IDX)), 'Kennedy');
  });
});

describe('13 · «Bogotá, Colombia.» con el punto ya no deja la pestaña del mapa en blanco', () => {
  const ver = r => r.estado === 'ubicado' ? nombreLoc(r.codigo) : r.estado;
  const deRegistro = (ciudad, barrio) => L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { ciudad, barrio } }, IB, IDX);

  test('«Bogotá, Colombia.» (o con «D.C.», un emoji o «Distrito Capital» detrás) es Bogotá, en la ficha y en el registro', () => {
    /* ubicar se llamaba a sí mismo sin fin: la expresión que quita el país no quitaba nada con
       un punto detrás. Venía del 9-nov y estaba publicado. */
    for (const c of ['Bogotá, Colombia.', 'Bogotá Colombia.', 'Bogotá, Colombia,', 'Bogotá Colombia DC', 'Bogotá, Colombia D.C.', 'Bogotá - Colombia!',
      'Bogotá, Colombia 🇨🇴', 'Bogotá, Colombia Distrito Capital']) {
      assert.equal(L.lugarDeCliente({ ciudad: c }, IDX).codigo, IB.municipio, c);
      assert.equal(ver(deRegistro(c, 'Timiza')), 'Kennedy', c + ', en el registro');
    }
    for (const c of ['Soacha, Colombia.', 'Medellín, Colombia.']) {
      assert.equal(L.lugarDeCliente({ ciudad: c }, IDX).codigo, L.lugarDeCliente({ ciudad: c.slice(0, -1) }, IDX).codigo, c);
    }
    assert.equal(L.lugarDeCliente({ ciudad: 'Huila, Colombia.' }, IDX).estado, L.lugarDeCliente({ ciudad: 'Huila, Colombia' }, IDX).estado);
  });

  test('lo que la expresión no sabe quitar («D.T. y C.», «Mpio») se queda, pero ya no tumba nada', () => {
    for (const c of ['Bogotá, Colombia D.T. y C.', 'Bogotá Colombia Mpio']) {
      assert.doesNotThrow(() => L.lugarDeCliente({ ciudad: c }, IDX), c);
      assert.doesNotThrow(() => deRegistro(c, 'Timiza'), c + ', en el registro');
    }
  });
});

describe('14 · el municipio al principio del barrio o de «Ciudad»: «Soacha Ciudad Verde, Compartir» (v152)', () => {
  const locDe = barrio => L.localidadDe('Bogotá', barrio, IB, IDX);
  const ver = r => r.estado === 'ubicado' ? nombreLoc(r.codigo) : r.estado;
  const deRegistro = (ciudad, barrio) => L.localidadDeCliente({ ciudad: 'Bogotá', barrio: '', vinculacion: { ciudad, barrio } }, IB, IDX);
  const esMunicipio = m => { const u = L.lugarDeCliente({ ciudad: m }, IDX); return ['ubicado', 'ambiguo'].includes(u.estado) && u.codigo !== IB.municipio; };
  const noSale = (r, que) => assert.notEqual(r.estado, 'otro-municipio', que);

  test('el municipio de Cundinamarca al principio, con algo detrás, es ese municipio: no Ciudad Bolívar ni Kennedy', () => {
    assert.equal(ver(locDe('Compartir')), 'Ciudad Bolívar', 'precondición: hay un Compartir en Ciudad Bolívar');
    assert.equal(ver(locDe('Villa Nueva')), 'Kennedy', 'precondición: hay una Villa Nueva en Kennedy');
    for (const [b, m] of [['Soacha Ciudad Verde, Compartir', 'Soacha'], ['Compartir, Soacha sur', 'Soacha'], ['Mosquera Centro, Villa Nueva', 'Mosquera'],
      ['Casa 5 Soacha Ciudad Verde, Compartir', 'Soacha'], ['Soacha Ciudad Verde Compartir', 'Soacha'], ['Chía Centro', 'Chía'], ['Funza Real, Timiza', 'Funza'],
      ['San Antonio del Tequendama Centro, Compartir', 'San Antonio del Tequendama'], ['La Mesa centro, Compartir', 'La Mesa'], ['Soacha León XIII', 'Soacha']]) {
      const r = locDe(b);
      assert.equal(r.estado, 'otro-municipio', b);
      assert.equal(r.municipio, m, b);
      assert.equal(deRegistro('Bogotá', b).municipio, m, b + ', en el registro');
    }
  });

  test('en «Ciudad»: «Bogotá - Soacha sur» con un barrio de Ciudad Bolívar es Soacha, y el barrio del registro no se usa', () => {
    for (const c of ['Bogotá - Soacha sur', 'Bogotá - Soacha Ciudad Verde', 'Bogotá - Soacha León XIII', 'Bogotá - Mosquera Centro']) {
      const r = L.localidadDe(c, 'Compartir', IB, IDX);
      assert.equal(r.estado, 'otro-municipio', c);
      assert.equal(r.en, 'ciudad', c);
      assert.equal(r.tambienBarrio, false, c);
      assert.equal(deRegistro(c, 'Compartir').estado, 'vacio', c + ', en el registro');
    }
  });

  test('solo Cundinamarca: los conjuntos de Bogotá se llaman como ciudades de otras partes («Toledo Etapa 2, Timiza» es Kennedy)', () => {
    for (const m of ['Toledo', 'Villavicencio', 'Málaga', 'Tunja']) assert.ok(esMunicipio(m), 'precondición: ' + m + ' es un municipio');
    for (const b of ['Toledo Etapa 2, Timiza', 'Villavicencio Centro, Timiza', 'Málaga Real, Timiza', 'Tunja Centro, Timiza']) assert.equal(ver(locDe(b)), 'Kennedy', b);
    /* «San Mateo» es de Boyacá: el primer nombre que aparece decide, y no se prueba uno más corto. */
    noSale(locDe('San Mateo Centro, Compartir'), 'San Mateo Centro');
  });

  test('un barrio, un pedazo de un barrio o una localidad de aquí al principio no son el municipio: «Prado Veraniego», «Madrid Centro»', () => {
    for (const m of ['Madrid', 'Cota', 'Girardot']) assert.ok(esMunicipio(m), 'precondición: ' + m + ' es un municipio');
    assert.ok(IB.pedazos['madrid'] && IB.pedazos['cota'] && IB.pedazos['prado'], 'precondición: son pedazos de nombres de la lista');
    for (const b of ['Prado Veraniego Alto', 'Bello Horizonte Sur', 'Madrid Centro, Compartir', 'Cota Centro, Compartir', 'Girardot Centro', 'Ciudad Bolívar Lucero'])
      noSale(locDe(b), b);
    assert.equal(ver(locDe('Ciudad Bolívar Lucero')), 'Ciudad Bolívar');
    assert.equal(ver(locDe('Santa Fe Las Cruces')), 'Santa Fe');
    /* «El Paso Ancho» es de Bosa, y El Paso es del Cesar: Cundinamarca lo deja fuera. */
    assert.ok(IB.barrios['paso ancho'] && esMunicipio('El Paso'), 'precondición');
    assert.equal(ver(locDe('El Paso Ancho, Bosa')), 'Bosa');
    noSale(locDe('El Paso Ancho Centro'), 'El Paso Ancho Centro');
    /* Un municipio que es un barrio ENTERO sigue la regla del barrio: en «Ciudad», con un barrio que lo desmiente, es el municipio
       (y lo dice: «también es un barrio de aquí»); con uno que casa, es el barrio. */
    assert.deepEqual(IB.barrios['girardot'], [IB.porNombre['santa fe']], 'precondición: Girardot es un barrio de Santa Fe');
    const g = L.localidadDe('Bogotá - Girardot Centro', 'Compartir', IB, IDX);
    assert.equal(g.municipio, 'Girardot');
    assert.equal(g.tambienBarrio, true);
    noSale(L.localidadDe('Bogotá - Girardot Centro', 'Las Cruces', IB, IDX), 'Girardot Centro + Las Cruces');
  });

  test('un municipio en cada punta, o una localidad detrás, no se escoge: «San Mateo Soacha», «Soacha San Mateo», «Soacha Bosa»', () => {
    for (const b of ['San Mateo Soacha', 'Soacha San Mateo', 'Soacha Mosquera', 'Mosquera Funza Centro', 'Soacha Santafe', 'Soacha Ciudad Bolívar'])
      noSale(locDe(b), b);
    assert.equal(ver(locDe('Soacha Bosa')), 'Bosa');
    /* El mismo municipio en las dos puntas sí: «Soacha Ciudad Verde Soacha». */
    assert.equal(locDe('Soacha Ciudad Verde Soacha').municipio, 'Soacha');
  });

  test('lo que lo junta con otro sitio o dice una cercanía tampoco: «Soacha y Ciudad Verde», «Soacha, límite con Bosa»', () => {
    for (const j of ['y', 'x', 'con', 'o', 'e', 'u']) noSale(locDe('Soacha ' + j + ' Ciudad Verde'), 'Soacha ' + j + ' Ciudad Verde');
    for (const b of ['Soacha cerca a Ciudad Verde', 'Soacha límite Compartir', 'Mosquera frente a Villa Nueva']) noSale(locDe(b), b);
  });

  test('lo escrito aparte manda: la localidad o el municipio de «Ciudad», una localidad en el barrio, dos municipios en dos trozos', () => {
    assert.equal(ver(L.localidadDe('Bogotá - Kennedy', 'Soacha Ciudad Verde', IB, IDX)), 'Kennedy');
    const r = L.localidadDe('Bogotá - Funza', 'Mosquera Centro', IB, IDX);
    assert.equal(r.municipio, 'Funza');
    assert.equal(r.en, 'ciudad');
    assert.equal(ver(locDe('Soacha sur, Bosa')), 'Bosa');
    assert.equal(ver(L.localidadDe('Bogotá - Soacha sur', 'Bosa', IB, IDX)), 'Bosa');
    assert.equal(ver(deRegistro('Bogotá - Soacha sur', 'Bosa')), 'Bosa', 'en el registro, igual');
    noSale(locDe('Soacha Ciudad Verde, Mosquera Centro'), 'dos trozos, dos municipios');
    assert.equal(locDe('Soacha Ciudad Verde, Soacha Compartir').municipio, 'Soacha', 'dos trozos, el mismo municipio');
  });

  test('lo que v151 ya leía no cambia, la lectura al final no se hace, y «Colombia Bogotá» es el país', () => {
    assert.equal(locDe('Kennedy, Soacha').municipio, 'Soacha');
    assert.equal(locDe('Compartir, Soacha').municipio, 'Soacha');
    /* Al final del texto no se lee: la tercera revisión del 16-nov («Portal de Toledo, Timiza», «Bosa, cerquita a Soacha»). */
    noSale(locDe('Bosa, cerquita a Soacha'), 'cerquita a Soacha');
    noSale(locDe('Portal de Toledo, Timiza'), 'Portal de Toledo');
    /* «Colombia Bogotá» en «Ciudad» es el país y la ciudad, como «Colombia - Bogotá», y no Colombia (Huila). Venía de v150. */
    assert.equal(ver(L.localidadDe('Colombia - Bogotá', 'Timiza', IB, IDX)), 'Kennedy', 'precondición');
    for (const c of ['Colombia Bogotá', 'Colombia Bogotá D.C.']) assert.equal(ver(L.localidadDe(c, 'Timiza', IB, IDX)), 'Kennedy', c);
  });

  /* La revisión del 17-nov encontró textos que salían de Bogotá sin decirlo. Todos quedan como en v151. */
  test('una localidad en cualquier parte del otro texto manda, no solo la localidad exacta: «Soacha sur, Kennedy 8», «Bogotá - Kennedy 8»', () => {
    for (const [b, l] of [['Soacha sur, Kennedy 8', 'Kennedy'], ['Soacha Ciudad Verde, localidad 7 Bosa', 'Bosa'], ['Mosquera centro, Loc 11 Suba', 'Suba'],
      ['Soacha sur, ahora Kennedy', 'Kennedy'], ['Funza trabajo, vivo en Bosa', 'Bosa'], ['Soacha Ciudad Verde, Bosa Recreo', 'Bosa'],
      ['Chía centro, Chapinero rural', 'Chapinero'], ['Soacha sur, Lucero Ciudad Bolívar', 'Ciudad Bolívar'], ['Soacha sur, Rafael Uribe Uribe', 'Rafael Uribe Uribe']])
      assert.equal(ver(locDe(b)), l, b);
    /* En «Ciudad», en la ficha y en el registro (que se lee con la ciudad de la ficha: «Kennedy 8» no es exactamente una localidad). */
    noSale(L.localidadDe('Bogotá - Kennedy 8', 'Mosquera centro', IB, IDX), 'Bogotá - Kennedy 8');
    noSale(deRegistro('Bogotá - Kennedy 8', 'Mosquera centro'), 'Bogotá - Kennedy 8, en el registro');
    /* Y al revés: «Bogotá - Soacha sur» con un barrio que nombra una localidad entre otras cosas. */
    for (const [b, l] of [['Piamonte, Bosa', 'Bosa'], ['Lisboa, Suba', 'Suba'], ['Timiza - Kennedy', 'Kennedy'], ['Lucero Ciudad Bolívar', 'Ciudad Bolívar']]) {
      assert.equal(ver(L.localidadDe('Bogotá - Soacha sur', b, IB, IDX)), l, b);
      assert.equal(ver(deRegistro('Bogotá - Soacha sur', b)), l, b + ', en el registro');
    }
  });

  test('lo de detrás del municipio tiene que parecer un nombre de sitio: «Soacha ya no», «Mosquera trabajo», «Soacha al ladito», «Mosquera a 10 min»', () => {
    for (const [b, l] of [['Bosa San Bernardino (Soacha al ladito)', 'Bosa'], ['Patio Bonito (Mosquera a 10 min)', 'Kennedy'],
      ['Soacha ya no, Patio Bonito', 'Kennedy'], ['Mosquera trabajo, Patio Bonito', 'Kennedy'], ['Chía mi mamá, Patio Bonito', 'Kennedy'],
      ['Mosquera 10 min, Patio Bonito', 'Kennedy'], ['Soacha 2 cuadras, Patio Bonito', 'Kennedy']])
      assert.equal(ver(locDe(b)), l, b);
    noSale(locDe('Chía queda cerquita'), 'Chía queda cerquita');
    noSale(locDe('Soacha en Patio Bonito'), 'Soacha en Patio Bonito');
    /* Las cercanías en diminutivo, cada forma: -ito, -ico, -itico, -cito, y «qu» que vuelve a ser «c». */
    for (const b of ['Soacha ladito, Compartir', 'Compartir (Soacha cerquita)', 'Soacha juntico, Compartir', 'Compartir (Soacha cerquitica)',
      'Soacha frentecito, Compartir', 'Soacha pegadito, Compartir']) assert.equal(ver(locDe(b)), 'Ciudad Bolívar', b);
    /* El artículo sí va en los nombres: «Soacha La Despensa» es Soacha. */
    assert.equal(locDe('Soacha La Despensa').municipio, 'Soacha');
  });

  test('un trozo de más de 12 palabras no se lee: es una frase, y la cuenta crecía con el cubo del largo', () => {
    const doce = 'Soacha Ciudad Verde Reservado de los Pinos Altos del Bosque Verde Claro';
    assert.equal(doce.split(' ').length, 12);
    assert.equal(locDe(doce).municipio, 'Soacha');
    noSale(locDe(doce + ' Grande'), 'trece palabras');
    /* 401 palabras: antes del tope eran segundos por ficha, en cada repintado del mapa. */
    const largo = 'Soacha ' + Array(200).fill('Ciudad Verde').join(' '), t0 = Date.now();
    locDe(largo);
    deRegistro('Bogotá - ' + largo, largo);
    assert.ok(Date.now() - t0 < 1000, 'tardó ' + (Date.now() - t0) + ' ms');
  });

  test('las llaves que todo objeto trae de suyo no son nombres: «constructor», «toString», «__proto__» no rompen nada', () => {
    for (const b of ['Soacha constructor', 'Soacha constructor centro, Compartir', 'toString Ciudad Verde', 'Soacha toString', 'Soacha __proto__ centro',
      'constructor', 'Soacha hasOwnProperty', 'Soacha valueOf Centro'])
      assert.doesNotThrow(() => { locDe(b); deRegistro('Bogotá - ' + b, b); L.localidadDe('Bogotá - ' + b, 'Compartir', IB, IDX); }, b);
  });
});
