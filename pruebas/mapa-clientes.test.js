'use strict';
/* ==========================================================================
 * EL MAPA DE LOS CLIENTES — 9-nov-2026
 *
 *   node --test pruebas/mapa-clientes.test.js
 *
 * Joan pidió ver en el CRM dónde están sus clientes y escogió, con maquetas,
 * «Departamentos» más «Conquistas». Sus reglas, que esta prueba amarra:
 *   · zonas, nunca puntos: el municipio sale de la ciudad que escribió el
 *     cliente, nunca del GPS ni de una coordenada suya;
 *   · una zona con 1 o 2 clientes dice «1–2», nunca la cifra;
 *   · un municipio se conquista con 3 clientes con un crédito PAGADO ENTERO,
 *     con la regla del motor (un cierre con pérdida no cuenta, un abierto
 *     tampoco);
 *   · la pestaña solo lee la cartera.
 * Y el mapa mismo (panel/mapa/colombia-2026-11b.json, que arma
 * herramientas/mapa-colombia.js con las descargas de geoBoundaries y HDX):
 * sus 1.122 municipios, que cada departamento sume su cuenta oficial, y el
 * casado de los nombres repetidos por vecindad.
 *
 * 13-nov-2026 — la sección 8: «quiero que se mejore el mapa ya que no se ven
 * los municipios» (Joan). Los nombres, el zoom (sin robar el scroll), el
 * buscador, Bogotá dentro de Cundinamarca, el contraste medido y el «1–2» en
 * los globitos y las etiquetas.
 *
 * Las descargas no viven en el repo: el casado se prueba con un mapa de
 * juguete que tiene las mismas trampas (un nombre en dos departamentos, un
 * nombre parecido, una isla sin vecinos), y el resultado de verdad se prueba
 * en el JSON publicado.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const RUTA_MAPA = path.join(RAIZ, 'panel', 'mapa', 'colombia-2026-11b.json');
const MAPA = JSON.parse(fs.readFileSync(RUTA_MAPA, 'utf8'));
const L = require('../panel/mapa-lugares.js');
const P = require('../app/puente.js');
const G = require('../herramientas/mapa-colombia.js');
const IDX = L.indice(MAPA.municipios, MAPA.departamentos);

/* Cada prueba con su copia del módulo: guarda el mapa y la vista en memoria. */
function fresco() {
  delete require.cache[require.resolve('../panel/mapa-clientes.js')];
  return require('../panel/mapa-clientes.js');
}
/* Una caja de mentira: anota los oyentes y lo que se pinta. */
function cajaFalsa() {
  const oy = {};
  return { innerHTML: '', oy, addEventListener: (t, f) => { oy[t] = f; }, querySelector: () => null, contains: () => true };
}
const pedirMapa = () => Promise.resolve({ ok: true, json: () => Promise.resolve(MAPA) });

/* Créditos de mentira, con la forma que el puente entiende. */
const credito = (id, socioId, extra) => Object.assign({ id, socioId, capital: 300000, monto: 300000,
  fechaDesembolso: '2026-09-01', cicloPago: '2026-09-15' }, extra);
const pagado = (id, s) => credito(id, s, { pagado: true, fechaPagado: '2026-09-15', capitalPerdido: 0, montoRecibido: 360000, gananciaPago: 60000 });
const conPerdida = (id, s) => credito(id, s, { pagado: true, fechaPagado: '2026-10-20', capitalPerdido: 300000, montoRecibido: 0, gananciaPago: 0 });
const abierto = (id, s) => credito(id, s, { pagado: false });
const cliente = (id, ciudad, extra) => Object.assign({ id, numero: Number(id.replace(/\D/g, '')) || 0, nombre: 'Persona ' + id, ciudad }, extra);

/* Los puntos de un «d» (M absoluto, l relativo). */
function puntos(d) {
  const r = [];
  for (const parte of d.match(/M[^M]*/g) || []) {
    const n = parte.match(/-?\d+/g).map(Number);
    let x = n[0], y = n[1]; r.push([x, y]);
    for (let i = 2; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; r.push([x, y]); }
  }
  return r;
}

/* ==========================================================================
 * 1 · Los datos del mapa
 * ======================================================================== */
describe('1 · el mapa: 1.122 municipios y cada departamento con su cuenta', () => {

  test('1.122 municipios con código DIVIPOLA único y 33 departamentos', () => {
    assert.equal(MAPA.municipios.length, 1122);
    const codigos = new Set(MAPA.municipios.map(m => m.c));
    assert.equal(codigos.size, 1122, 'hay códigos repetidos');
    MAPA.municipios.forEach(m => assert.match(m.c, /^\d{5}$/, m.n + ': código ' + m.c));
    assert.equal(MAPA.departamentos.length, 33);
  });

  test('cada departamento suma su cuenta oficial de municipios, y el total da 1.122', () => {
    const cuenta = {};
    MAPA.municipios.forEach(m => { cuenta[m.c.slice(0, 2)] = (cuenta[m.c.slice(0, 2)] || 0) + 1; });
    MAPA.departamentos.forEach(d => assert.equal(cuenta[d.c], d.m, d.n + ': ' + cuenta[d.c] + ' en el mapa, ' + d.m + ' oficiales'));
    assert.equal(MAPA.departamentos.reduce((t, d) => t + d.m, 0), 1122);
    /* Unas cuentas conocidas del DANE, para que «suma su cuenta» no sea una
       cuenta contra sí misma. */
    const por = Object.fromEntries(MAPA.departamentos.map(d => [d.c, d.m]));
    assert.deepEqual([por['05'], por['15'], por['25'], por['11'], por['88']], [125, 123, 116, 1, 2]);
  });

  test('cada municipio cae dentro de la caja de SU departamento (el casado no mandó a nadie lejos)', () => {
    const caja = Object.fromEntries(MAPA.departamentos.map(d => [d.c, d.b]));
    const fuera = [];
    MAPA.municipios.forEach(m => {
      const b = caja[m.c.slice(0, 2)];
      const pts = puntos(m.d);
      assert.ok(pts.length >= 3, m.n + ' no tiene forma');
      if (pts.some(([x, y]) => x < b[0] - 1 || y < b[1] - 1 || x > b[2] + 1 || y > b[3] + 1)) fuera.push(m.c + ' ' + m.n);
    });
    assert.deepEqual(fuera, []);
  });

  test('los nombres repetidos quedaron cada uno en su departamento', () => {
    const nombre = Object.fromEntries(MAPA.municipios.map(m => [m.c, m.n]));
    for (const [c, n] of [['25473', 'Mosquera'], ['52473', 'Mosquera'], ['05059', 'Armenia'], ['63001', 'Armenia'],
      ['68669', 'San Andrés'], ['88001', 'San Andrés'], ['05697', 'El Santuario'], ['66687', 'Santuario']]) {
      assert.equal(nombre[c], n, c);
    }
  });

  /* 13-nov: 650 KB, con el punto del nombre de cada municipio (`p`) y los
     huecos de cada departamento (`h`): 601.577 bytes. */
  test('pesa menos de 650 KB y trae los créditos de las fuentes', () => {
    const bytes = fs.statSync(RUTA_MAPA).size;
    assert.ok(bytes < 650 * 1000, 'el mapa pesa ' + bytes + ' bytes');
    assert.equal(MAPA.creditos, 'Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)');
    const f = leer('panel/mapa/FUENTES.md');
    for (const x of ['geoboundaries.org', 'data.humdata.org', 'CC BY 4.0', 'CC BY-IGO', '9-nov-2026', 'herramientas/mapa-colombia.js']) {
      assert.ok(f.includes(x), 'FUENTES.md no dice ' + x);
    }
  });
});

describe('1b · el casado, con un mapa de juguete que tiene las mismas trampas', () => {
  /* Cuadrados de 1×1 que comparten vértices. Dos bloques que no se tocan:
     el del departamento 01 y el del 02. Los dos tienen un «Río». */
  const cuadro = (nombre, x, y) => ({ properties: { shapeName: nombre },
    geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] } });
  const fila = (n, depto, cod) => ({ ADM2_ES: n, ADM2_PCODE: 'CO' + depto + cod, ADM1_ES: 'Depto ' + depto, ADM1_PCODE: 'CO' + depto });
  const formas = [
    cuadro('Alfa', 0, 0), cuadro('Río', 1, 0), cuadro('Gama', 0, 1), cuadro('Guicán', 1, 1),
    cuadro('Beta', 5, 0), cuadro('Rio', 6, 0), cuadro('Épsilon', 5, 1), cuadro('Zeta', 6, 1)
  ];
  const filas = [
    fila('Río', '02', '002'), fila('Alfa', '01', '001'), fila('Río', '01', '002'), fila('Gama', '01', '003'),
    fila('Güicán de la Sierra', '01', '004'), fila('Beta', '02', '001'), fila('Epsilon', '02', '003'), fila('Zeta', '02', '004'),
    /* Otro nombre que también empieza por «Guicán», pero en el departamento
       de al lado: el parecido solo vale si es del vecindario. */
    fila('Guicán del Norte', '02', '009')
  ];

  test('el nombre repetido va con el departamento de sus vecinos, y el parecido solo si su vecindario lo confirma', () => {
    const topo = G.topologia(formas);
    const r = G.casar(formas, filas, topo.vecinos);
    const de = i => filas[r.forma[i]].ADM2_PCODE;
    assert.equal(de(1), 'CO01002', 'el Río del bloque 01');
    assert.equal(de(5), 'CO02002', 'el Río del bloque 02');
    assert.equal(r.via[1], 'vecindad');
    assert.equal(de(3), 'CO01004', 'Guicán → Güicán de la Sierra');
    assert.equal(r.via[3], 'parecido');
    assert.equal(de(6), 'CO02003', 'Épsilon, por nombre sin tilde');
    assert.ok(r.forma.every(x => x >= 0), 'todo casó');
  });

  test('una isla con un nombre que está en dos departamentos NO se adivina', () => {
    const conIsla = formas.concat([cuadro('Río', 20, 20)]);
    const conFilas = filas.concat([fila('Río', '03', '002'), fila('Río', '04', '002')]);
    const topo = G.topologia(conIsla);
    const r = G.casar(conIsla, conFilas, topo.vecinos);
    assert.equal(r.forma[8], -1, 'la isla quedó casada a ojo con ' + (r.forma[8] >= 0 ? conFilas[r.forma[8]].ADM2_PCODE : ''));
  });

  test('pero si solo queda una fila posible, por descarte sí', () => {
    const conIsla = formas.concat([cuadro('Río', 20, 20)]);
    const conFilas = filas.concat([fila('Río', '03', '002')]);
    const topo = G.topologia(conIsla);
    const r = G.casar(conIsla, conFilas, topo.vecinos);
    assert.equal(conFilas[r.forma[8]].ADM2_PCODE, 'CO03002');
  });
});

/* ==========================================================================
 * 2 · De la ciudad escrita, el municipio
 * ======================================================================== */
describe('2 · la ciudad que escribió el cliente', () => {
  const donde = (c, d) => L.ubicar(c, d, IDX);

  test('Bogotá de todas las formas', () => {
    for (const t of ['Bogota', 'Bogotá D.C.', 'bogota dc', 'BOGOTÁ, D. C.', '  bogotá  ', 'Bogotá Distrito Capital', 'Bogotá, Colombia', 'Bta']) {
      const r = donde(t);
      assert.equal(r.estado, 'ubicado', t + ': ' + r.estado);
      assert.equal(r.codigo, '11001', t);
    }
  });

  test('tildes, mayúsculas, abreviaturas y los nombres de todos los días', () => {
    const casos = { 'medellin': '05001', 'CALI': '76001', 'Cúcuta': '54001', 'cucuta': '54001', 'Sta Marta': '47001',
      'Pto Boyacá': '15572', 'Chia': '25175', 'Ubaté': '25843', 'Tumaco': '52835', 'Cartagena': '13001',
      'Piendamó-Tunía': '19548', 'Municipio de Zipaquirá': '25899', 'Cartagena D.T. y C.': '13001',
      'Funza, Cundinamarca, Colombia': '25286', 'Bello Antioquia': '05088' };
    for (const [t, c] of Object.entries(casos)) assert.equal(donde(t).codigo, c, t);
  });

  test('con el departamento al lado, sea con coma, paréntesis, guion o pegado', () => {
    assert.equal(donde('Mosquera, Cundinamarca').codigo, '25473');
    assert.equal(donde('Mosquera (Nariño)').codigo, '52473');
    assert.equal(donde('Mosquera Cund.').codigo, '25473');
    assert.equal(donde('Soacha Cundinamarca').codigo, '25754');
    assert.equal(donde('Armenia - Quindío').codigo, '63001');
    assert.equal(donde('San Andrés, Santander').codigo, '68669');
    assert.equal(donde('Mosquera', 'Nariño').codigo, '52473', 'el departamento en su propio campo');
    assert.equal(donde('Bogotá, Cundinamarca').codigo, '11001', 'Bogotá es su propio departamento, pero así lo escribe la gente');
  });

  test('un nombre repetido sin departamento NO se adivina: «Sin ubicar (nombre repetido)»', () => {
    for (const [t, opciones] of [['Mosquera', ['25473', '52473']], ['Armenia', ['05059', '63001']],
      ['Rionegro', ['05615', '68615']], ['Ciudad Bolívar', ['05101', '11001']], ['Colombia', ['41206']]]) {
      const r = donde(t);
      assert.equal(r.estado, 'ambiguo', t + ' quedó ' + r.estado + (r.codigo ? ' en ' + r.codigo : ''));
      assert.deepEqual(r.opciones.slice().sort(), opciones, t);
    }
    assert.equal(donde('Mosquera').motivo, 'nombre repetido');
  });

  test('las localidades de Bogotá son Bogotá; «Puerto Colombia» no pierde su «Colombia»', () => {
    assert.equal(donde('Kennedy').codigo, '11001');
    assert.equal(donde('Suba').codigo, '11001');
    assert.equal(donde('Puerto Colombia, Atlántico').codigo, '08573');
    assert.equal(donde('Colombia, Huila').codigo, '41206');
  });

  test('lo que no se reconoce, lo vacío y la ciudad que no es de ese departamento', () => {
    assert.equal(donde('Narnia').estado, 'desconocido');
    assert.equal(donde('').estado, 'vacio');
    assert.equal(donde(null).estado, 'vacio');
    assert.equal(donde('Soacha, Antioquia').estado, 'otro-depto');
  });

  /* Del barrido del revisor (10-nov): cualquier ciudad mal escrita seguida
     de «, Colombia» caía en el municipio Colombia (Huila). */
  test('«…, Colombia» al final es el país: una ciudad que no casa no se va al Colombia del Huila', () => {
    for (const t of ['Medelin, Colombia', 'Bogtá, Colombia', 'Narnia, Colombia', 'Huila, Colombia']) {
      const r = donde(t);
      assert.equal(r.estado, 'desconocido', t + ' quedó ' + r.estado + (r.codigo ? ' en ' + r.codigo : ''));
    }
    assert.equal(donde('Colombia, Huila').codigo, '41206', 'el municipio primero y su departamento sí casa');
    assert.equal(donde('Neiva, Huila, Colombia').codigo, '41001');
    assert.equal(donde('Puerto Colombia, Atlántico, Colombia').codigo, '08573');
  });

  test('«D.C.» o «Distrito Capital» solos: la ficha tiene texto, no está «sin ciudad»', async () => {
    for (const t of ['D.C.', 'Distrito Capital']) assert.equal(donde(t).estado, 'desconocido', t);
    const MC = fresco();
    const caja = cajaFalsa();
    await MC.abrir({ caja, db: { socios: [cliente('s1', 'D.C.'), cliente('s2', 'Colombia')], prestamos: [] }, puente: P, pedir: pedirMapa });
    assert.doesNotMatch(caja.innerHTML, /Sin ciudad en la ficha/);
    assert.match(caja.innerHTML, /escribió «D\.C\.»<div class="muted">No reconozco esa ciudad\./);
    assert.match(caja.innerHTML, /escribió «Colombia»<div class="muted">Sin ubicar: puede ser el país o Colombia \(Huila\)\./,
      'con una sola opción no es un «nombre repetido»');
  });

  test('los apodos que se escriben de verdad: San Juan de Pasto, San Andrés Isla, Fusa, Zipa', () => {
    const casos = { 'San Juan de Pasto': '52001', 'San Andrés Isla': '88001', 'San Andres Islas': '88001', 'Fusa': '25290', 'Zipa': '25899' };
    for (const [t, c] of Object.entries(casos)) assert.equal(donde(t).codigo, c, t);
    assert.equal(donde('San Andrés').estado, 'ambiguo', 'a secas sigue repetido: también hay uno en Santander');
    assert.equal(donde('Barranca').estado, 'desconocido', '«Barranca» no se adivina');
  });

  test('de la ficha: primero «Ciudad» (la que Joan corrigió), si no la del registro', () => {
    assert.equal(L.lugarDeCliente({ ciudad: 'Soacha', vinculacion: { ciudad: 'Medellín' } }, IDX).codigo, '25754');
    assert.equal(L.lugarDeCliente({ ciudad: '', vinculacion: { ciudad: 'Medellín' } }, IDX).codigo, '05001');
    assert.equal(L.lugarDeCliente({ ciudad: 'Mosquera', vinculacion: { departamento: 'Nariño' } }, IDX).codigo, '52473');
  });
});

/* ==========================================================================
 * 3 · Zonas, nunca puntos
 * ======================================================================== */
describe('3 · nunca coordenadas del cliente', () => {

  test('con el GPS del registro y sin ciudad, el cliente queda sin ubicar', () => {
    const s = { id: 's1', ciudad: '', ubicacion: { lat: 4.65, lng: -74.1, acc: 12, fecha: '2026-11-01' },
      vinculacion: { ciudad: '', ubicacion_ip: { ciudad: 'Bogotá', region: 'Bogotá D.C.' }, lat: 4.65, lng: -74.1 } };
    assert.equal(L.lugarDeCliente(s, IDX).estado, 'vacio');
  });

  test('y el GPS tampoco desempata un nombre repetido', () => {
    const s = { id: 's1', ciudad: 'Mosquera', ubicacion: { lat: 4.7, lng: -74.23 } };
    assert.equal(L.lugarDeCliente(s, IDX).estado, 'ambiguo');
  });

  test('ninguno de los dos archivos lee ubicación, latitud ni geolocalización', () => {
    for (const f of ['panel/mapa-lugares.js', 'panel/mapa-clientes.js']) {
      const codigo = leer(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const x of ['ubicacion', '.lat', '.lng', 'latitud', 'longitud', 'geolocation', 'coords', '.ip']) {
        assert.ok(!codigo.includes(x), f + ' menciona «' + x + '» fuera de un comentario');
      }
    }
  });
});

/* ==========================================================================
 * 4 · La conquista
 * ======================================================================== */
describe('4 · conquista: 3 clientes con un crédito pagado entero', () => {
  const MC = fresco();
  const enSoacha = n => Array.from({ length: n }, (_, i) => cliente('s' + (i + 1), 'Soacha'));

  test('precondición: el puente de verdad distingue los tres créditos', () => {
    assert.equal(P.cerroConPerdida(conPerdida('x', 's')), true);
    assert.equal(P.cerroConPerdida(pagado('y', 's')), false);
  });

  test('tres que pagaron entero: conquistado', () => {
    const db = { socios: enSoacha(3), prestamos: [pagado('p1', 's1'), pagado('p2', 's2'), pagado('p3', 's3')] };
    const q = MC.conquistas(MC.resumir(db, MAPA, P), MAPA);
    assert.deepEqual(q.conquistados.map(x => x.c), ['25754']);
    assert.equal(q.conClientes, 1);
    assert.equal(q.total, 1122);
  });

  test('un cierre con pérdida no cuenta como pago', () => {
    const db = { socios: enSoacha(3), prestamos: [pagado('p1', 's1'), pagado('p2', 's2'), conPerdida('p3', 's3')] };
    const q = MC.conquistas(MC.resumir(db, MAPA, P), MAPA);
    assert.deepEqual(q.conquistados, []);
    assert.equal(q.porConquistar[0].pagaron, 2);
  });

  test('un crédito abierto tampoco', () => {
    const db = { socios: enSoacha(3), prestamos: [pagado('p1', 's1'), pagado('p2', 's2'), abierto('p3', 's3')] };
    assert.deepEqual(MC.conquistas(MC.resumir(db, MAPA, P), MAPA).conquistados, []);
  });

  test('cuentan CLIENTES, no créditos: uno con tres créditos pagados es uno', () => {
    const db = { socios: enSoacha(3), prestamos: [pagado('p1', 's1'), pagado('p2', 's1'), pagado('p3', 's1')] };
    assert.deepEqual(MC.conquistas(MC.resumir(db, MAPA, P), MAPA).conquistados, []);
  });

  test('sin la regla del motor (un puente viejo) no se cuenta ninguna conquista', () => {
    const db = { socios: enSoacha(3), prestamos: [pagado('p1', 's1'), pagado('p2', 's2'), pagado('p3', 's3')] };
    const r = MC.resumir(db, MAPA, {});
    assert.equal(r.reglaDePago, false);
    assert.deepEqual(MC.conquistas(r, MAPA).conquistados, []);
  });

  /* En las capturas del 9-nov, Soacha y Bucaramanga conquistados casi no se
     veían: pintados antes que sus vecinos, estos les tapaban el borde. */
  test('en el mapa, lo conquistado se pinta al final, encima de sus vecinos', async () => {
    const MC = fresco();
    const caja = cajaFalsa();
    MC._estado.vista = 'conquistas';
    await MC.abrir({ caja, db: { socios: [...enSoacha(3), cliente('s9', 'Neiva')],
      prestamos: [pagado('p1', 's1'), pagado('p2', 's2'), pagado('p3', 's3')] }, puente: P, pedir: pedirMapa });
    const capas = [...caja.innerHTML.matchAll(/<path class="mapa-q (\w+)" data-mapa="muni" data-c="(\d+)"/g)].map(m => m[1] + ' ' + m[2]);
    assert.equal(capas.length, 1122);
    assert.deepEqual(capas.slice(-2), ['con 41001', 'conq 25754'], 'primero lo vacío, después lo que tiene clientes y al final lo conquistado');
  });

  test('los que no se ubican no conquistan nada y salen en la lista con lo que escribieron', () => {
    const db = { socios: [cliente('s1', 'Mosquera'), cliente('s2', 'Mosquera'), cliente('s3', 'Mosquera')],
      prestamos: [pagado('p1', 's1'), pagado('p2', 's2'), pagado('p3', 's3')] };
    const r = MC.resumir(db, MAPA, P);
    assert.deepEqual(MC.conquistas(r, MAPA).conquistados, []);
    assert.equal(r.sinUbicar.length, 3);
    assert.equal(r.sinUbicar[0].texto, 'Mosquera');
    assert.equal(r.sinUbicar[0].estado, 'ambiguo');
  });
});

/* ==========================================================================
 * 5 · «1–2»
 * ======================================================================== */
describe('5 · con uno o dos clientes se dice «1–2»', () => {

  test('la cifra, lo que falta y el color', () => {
    const MC = fresco();
    assert.equal(MC.cifra(0), '0');
    assert.equal(MC.cifra(1), '1–2');
    assert.equal(MC.cifra(2), '1–2');
    assert.equal(MC.cifra(3), '3');
    assert.equal(MC.cifra(1500), '1.500');
    assert.equal(MC.faltan(0), 'faltan 3');
    assert.equal(MC.faltan(1), 'faltan 1–2', 'faltar 2 diría que pagó exactamente uno');
    assert.equal(MC.faltan(2), 'faltan 1–2');
    assert.equal(MC.faltan(3), '');
    assert.equal(MC.tramo(1), MC.tramo(2), 'el color separaba el 1 del 2');
    assert.notEqual(MC.tramo(2), MC.tramo(3));
  });

  test('en la pantalla: el departamento, el municipio y la conquista con dos clientes no dicen «2»', async () => {
    const MC = fresco();
    const caja = cajaFalsa();
    const db = { socios: [cliente('s1', 'Neiva'), cliente('s2', 'Neiva')], prestamos: [pagado('p1', 's1'), pagado('p2', 's2')] };
    await MC.abrir({ caja, db, puente: P, pedir: pedirMapa });
    assert.match(caja.innerHTML, /Huila · 1–2 clientes/);
    assert.match(caja.innerHTML, /<span>Huila<\/span><b>1–2<\/b>/);
    assert.doesNotMatch(caja.innerHTML, /· 2 clientes|<b>2<\/b>/);
    MC._estado.depto = '41';
    await MC.abrir({ caja, db, puente: P });
    assert.match(caja.innerHTML, /Neiva \(Huila\) · 1–2 clientes/);
    assert.doesNotMatch(caja.innerHTML, /· 2 clientes|<b>2<\/b>/);
    MC._estado.vista = 'conquistas'; MC._estado.depto = null;
    await MC.abrir({ caja, db, puente: P });
    assert.match(caja.innerHTML, /faltan 1–2/);
    assert.doesNotMatch(caja.innerHTML, /faltan 1</);
  });

  /* Tapar la cifra en la zona no bastaba. El revisor del 9-nov la despejó de
     dos maneras: RESTANDO («Huila · 6 clientes», Neiva 3, y las otras dos
     «1–2»: entre las dos, 3 → una tiene 2 y la otra 1) y por el ORDEN (las
     listas iban por la cifra exacta, así que de dos «1–2» la de 2 salía
     primero aunque el abecedario dijera lo contrario). */
  const CODIGO = n => L.ubicar(n, '', IDX).codigo;
  /* Una cartera con { ciudad: [clientes, de ellos cuántos pagaron entero] }. */
  function carteraCon(cuantos) {
    const socios = [], prestamos = [];
    let n = 0;
    for (const [ciudad, [c, p]] of Object.entries(cuantos)) {
      for (let i = 0; i < c; i++) {
        n++; socios.push(cliente('s' + n, ciudad));
        if (i < p) prestamos.push(pagado('p' + n, 's' + n));
      }
    }
    return { socios, prestamos };
  }
  /* Huila: Neiva con 3 que no han pagado, La Plata y Pitalito con «1–2».
     Boyacá (Tunja) y Tolima (Ibagué) con «1–2» cada uno. En A, Pitalito,
     Ibagué y Tolima van por DELANTE de su vecino del abecedario en la cifra
     exacta: con el orden viejo salían primero. */
  const A = { Neiva: [3, 0], 'La Plata': [1, 1], Pitalito: [2, 2], Tunja: [1, 0], Ibagué: [2, 0] };
  const MUNIS = ['Neiva', 'La Plata', 'Pitalito', 'Tunja', 'Ibagué'];
  /* Los nombres de una lista, en el orden en que salen. */
  const filas = (html, desde) => {
    const i = desde ? html.indexOf(desde) : 0;
    const ol = html.slice(html.indexOf('<ol class="mapa-lista">', i), html.indexOf('</ol>', html.indexOf('<ol class="mapa-lista">', i)));
    return [...ol.matchAll(/<span>([^<]+)/g)].map(m => m[1].trim());
  };
  /* Todo lo que la pestaña puede enseñar de una cartera: las tres vistas,
     cada departamento abierto, y la línea de información de cada municipio
     tocado en las dos vistas (los <title> van dentro del HTML). */
  async function todoLoQueSeVe(db) {
    const MC = fresco();
    const info = { textContent: '' };
    const caja = cajaFalsa();
    caja.querySelector = s => (s === '.mapa-info' ? info : null);
    const toca = (accion, c, v) => caja.oy.click({ target: { closest: () => ({
      getAttribute: k => ({ 'data-mapa': accion, 'data-c': c, 'data-v': v }[k]) }) } });
    await MC.abrir({ caja, db, puente: P, pedir: pedirMapa });
    const vista = { pais: caja.innerHTML };
    for (const d of ['41', '15', '73']) {
      toca('depto', d); vista['depto ' + d] = caja.innerHTML;
      for (const m of MUNIS) { toca('muni', CODIGO(m)); vista['info ' + d + ' ' + m] = info.textContent; }
    }
    toca('vista', null, 'conquistas'); vista.conquistas = caja.innerHTML;
    for (const m of MUNIS) { toca('muni', CODIGO(m)); vista['info conquistas ' + m] = info.textContent; }
    return vista;
  }
  /* assert.equal con 700 KB de SVG no se puede leer: aquí, dónde difieren. */
  function igual(a, b, que) {
    if (a === b) return;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    assert.fail(que + ': la pantalla cambia según la cifra exacta. Una dice «…' + a.slice(Math.max(0, i - 80), i + 60) +
      '…» y la otra «…' + b.slice(Math.max(0, i - 80), i + 60) + '…»');
  }

  test('dos zonas con «1–2» salen por el abecedario en las tres listas, tenga cada una 1 o 2', async () => {
    assert.ok(MUNIS.every(CODIGO), 'precondición: los cinco municipios se ubican');
    const v = await todoLoQueSeVe(carteraCon(A));
    assert.deepEqual(filas(v.pais), ['Huila', 'Boyacá', 'Tolima'], 'departamentos');
    assert.deepEqual(filas(v['depto 41']), ['Neiva', 'La Plata', 'Pitalito'], 'municipios del Huila');
    assert.deepEqual(filas(v.conquistas, 'Por conquistar'), ['La Plata', 'Pitalito', 'Neiva', 'Ibagué', 'Tunja'],
      'por conquistar: primero «faltan 1–2», después «faltan 3»; dentro, los que más clientes muestran y el abecedario');
  });

  test('ningún total deja despejar la cifra restando: si dentro hay un «1–2», el total va en rango', async () => {
    const v = await todoLoQueSeVe(carteraCon(A));
    // Exactos: Huila 3+1+2 = 6, Colombia 9. Lo que se ve: Huila 3 + [1,2] + [1,2] = 5–7; Colombia 7–11.
    assert.match(v.pais, /<b>7–11<\/b> de tus clientes están en el mapa/);
    assert.match(v.pais, /<span>Huila<\/span><b>5–7<\/b>/);
    assert.match(v.pais, /<title>Huila · 5–7 clientes<\/title>/);
    assert.match(v['depto 41'], /<h3 class="mapa-h">Huila<\/h3><div class="mapa-total"><b>5–7<\/b> clientes/);
    assert.match(v['depto 41'], /Va en rango porque/, 'un «5–7» sin explicar parece un error de la cuenta');
    for (const [que, html] of Object.entries(v)) {
      assert.doesNotMatch(html, /\b(6|9) clientes|<b>(6|9)<\/b>/, que + ' dice un total exacto');
    }
  });

  test('dos carteras que se ven iguales pintan la MISMA pantalla, títulos y línea de información incluidos', async () => {
    const a = await todoLoQueSeVe(carteraCon(A));
    // B: cada «1–2» con la otra cifra (los totales exactos son los mismos: aquí delataba el orden).
    const b = await todoLoQueSeVe(carteraCon({ Neiva: [3, 0], 'La Plata': [2, 1], Pitalito: [1, 1], Tunja: [2, 0], Ibagué: [1, 0] }));
    // C: todos los «1–2» con 2 (Huila 7, Colombia 11: aquí delataba la resta), y Pitalito con 1 pagado en vez de 2.
    const c = await todoLoQueSeVe(carteraCon({ Neiva: [3, 0], 'La Plata': [2, 2], Pitalito: [2, 1], Tunja: [2, 0], Ibagué: [2, 0] }));
    assert.equal(Object.keys(a).length, 1 + 3 * 6 + 1 + 5);
    for (const k of Object.keys(a)) { igual(a[k], b[k], k + ' (A contra B)'); igual(a[k], c[k], k + ' (A contra C)'); }
  });

  test('Bogotá, que es departamento de un solo municipio, no repite su nombre', async () => {
    const MC = fresco();
    const info = { textContent: '' };
    const caja = cajaFalsa();
    caja.querySelector = s => (s === '.mapa-info' ? info : null);
    const db = carteraCon({ Bogotá: [3, 3], Soacha: [3, 0] });
    MC._estado.vista = 'conquistas';
    await MC.abrir({ caja, db, puente: P, pedir: pedirMapa });
    assert.match(caja.innerHTML, /<span>Bogotá, D\.C\.<\/span><b>🏁<\/b>/, 'la fila de Bogotá en «Conquistados»');
    assert.match(caja.innerHTML, /<title>Bogotá, D\.C\. · 3 clientes · 🏁 conquistado<\/title>/);
    assert.match(caja.innerHTML, /<span>Soacha <small>Cundinamarca<\/small><\/span>/, 'los demás siguen con su departamento');
    caja.oy.click({ target: { closest: () => ({ getAttribute: k => ({ 'data-mapa': 'muni', 'data-c': '11001' }[k]) }) } });
    assert.equal(info.textContent, 'Bogotá, D.C. · 3 clientes · 🏁 conquistado');
    assert.doesNotMatch(caja.innerHTML, /Bogotá, D\.C\. (<small>|\()Bogotá/);
  });

  test('los créditos de las fuentes se ven en la pestaña', async () => {
    const MC = fresco();
    const caja = cajaFalsa();
    await MC.abrir({ caja, db: { socios: [], prestamos: [] }, puente: P, pedir: pedirMapa });
    assert.ok(caja.innerHTML.includes('Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)'));
  });
});

/* ==========================================================================
 * 6 · La pestaña en el CRM: entra como las demás, lleva a la ficha, solo lee
 * ======================================================================== */
describe('6 · la pestaña «🗺️ Mapa» en el CRM', () => {
  const CRM = leer('panel/crm.html');

  test('botón en el menú, su vista, y irA la pinta al entrar', () => {
    assert.match(CRM, /<button class="navbtn" data-v="mapa"><span class="ic">🗺️<\/span> Mapa<\/button>/);
    assert.match(CRM, /<section class="view" id="v-mapa">[\s\S]*?<div id="mapaCaja"><\/div>/);
    const irA = CRM.slice(CRM.indexOf('function irA(v)'), CRM.indexOf('\ndocument.querySelectorAll(\'.navbtn\')'));
    assert.match(irA, /if\(v==='mapa'&&typeof abrirMapaClientes==='function'\)abrirMapaClientes\(\)/);
  });

  /* 13-nov: mapa-clientes.js y su hoja cambiaron después de salir en v144:
     ?v=145. mapa-lugares.js no cambió y sigue en ?v=143. */
  test('los .js se piden con su versión, la hoja también, y el mapa NO va en la precarga', () => {
    assert.match(CRM, /<script src="mapa-lugares\.js\?v=143"><\/script>/);
    assert.match(CRM, /<script src="mapa-clientes\.js\?v=145"><\/script>/);
    assert.match(CRM, /<link rel="stylesheet" href="mapa-clientes\.css\?v=145">/);
    const sw = leer('sw.js');
    assert.ok(sw.includes("'panel/mapa-clientes.js?v=145'") && sw.includes("'panel/mapa-clientes.css?v=145'"), 'la precarga sigue con la versión de antes');
    for (const f of ['colombia-2026-11.json', 'colombia-2026-11b.json']) {
      assert.ok(!sw.includes(f), 'el mapa (590 KB) se colaría en la precarga de cada teléfono: ' + f);
    }
  });

  test('se ve en el celular: a 880 px o menos, una sola columna', () => {
    const hoja = leer('panel/mapa-clientes.css');
    const m = /@media \(max-width:880px\)\{([\s\S]*?)\n\}/.exec(hoja);
    assert.ok(m, 'la hoja no tiene la regla de 880 px');
    assert.match(m[1], /\.mapa-cuerpo\{grid-template-columns:minmax\(0,1fr\)\}/);
  });

  test('sin colores a mano: la hoja usa solo los tokens del CRM', () => {
    const hoja = leer('panel/mapa-clientes.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(hoja, /#[0-9a-f]{3,8}\b/i, 'un hex suelto');
    assert.doesNotMatch(hoja, /rgba?\(\s*\d/, 'un rgb() con números en vez de una variable');
  });

  test('cada cliente sin ubicar lleva a su ficha', async () => {
    const MC = fresco();
    const caja = cajaFalsa();
    const abiertas = [];
    await MC.abrir({ caja, db: { socios: [cliente('s7', 'Narnia')], prestamos: [] }, puente: P, pedir: pedirMapa,
      abrirFicha: id => abiertas.push(id) });
    assert.match(caja.innerHTML, /#7 Persona s7<\/b> · escribió «Narnia»/);
    assert.match(caja.innerHTML, /data-mapa="ficha" data-id="s7"/);
    const boton = { getAttribute: k => ({ 'data-mapa': 'ficha', 'data-id': 's7' }[k]) };
    caja.oy.click({ target: { closest: () => boton } });
    assert.deepEqual(abiertas, ['s7']);
  });

  /* En el celular la lista va debajo del mapa: tocar «Pitalito» solo cambiaba
     una línea fuera de la pantalla (el revisor, 10-nov). */
  test('tocar en la LISTA no es mudo: marca el municipio en el mapa y lleva la pantalla a lo que cambió', async () => {
    const MC = fresco();
    const clases = new Set();
    let alFinal = null, llevadaA = null, mapaA = null;
    const camino = { classList: { add: x => clases.add(x), remove: x => clases.delete(x) }, parentNode: { appendChild: n => { alFinal = n; } } };
    const info = { textContent: '', getBoundingClientRect: () => ({ top: -64, bottom: -20 }), scrollIntoView: o => { llevadaA = o; } };
    const lienzo = { getBoundingClientRect: () => ({ top: -900, bottom: -300 }), scrollIntoView: o => { mapaA = o; } };
    const caja = cajaFalsa();
    caja.querySelector = s => ({ '.mapa-info': info, '.mapa-lienzo': lienzo, 'path[data-mapa="muni"][data-c="41551"]': camino,
      'path.mapa-sel': clases.has('mapa-sel') ? camino : null }[s] || null);
    const fila = (accion, c) => ({ tagName: 'BUTTON', getAttribute: k => ({ 'data-mapa': accion, 'data-c': c }[k]) });
    const antes = globalThis.innerHeight;
    globalThis.innerHeight = 844;
    try {
      await MC.abrir({ caja, db: { socios: [cliente('s1', 'Pitalito')], prestamos: [] }, puente: P, pedir: pedirMapa });
      caja.oy.click({ target: { closest: () => fila('depto', '41') } });
      assert.deepEqual(mapaA, { block: 'start', behavior: 'smooth' }, 'al abrir el Huila desde la lista, el mapa quedaba arriba, fuera de la pantalla');
      caja.oy.click({ target: { closest: () => fila('muni', '41551') } });
      assert.match(info.textContent, /^Pitalito \(Huila\)/);
      assert.ok(clases.has('mapa-sel'), 'Pitalito no quedó marcado en el mapa');
      assert.equal(alFinal, camino, 'el borde quedaba debajo de los vecinos');
      assert.deepEqual(llevadaA, { block: 'end', behavior: 'smooth' }, 'la línea que cambió quedó fuera de la pantalla');
      /* En el computador la línea y el mapa ya se ven: nada se mueve. */
      llevadaA = mapaA = null;
      info.getBoundingClientRect = () => ({ top: 500, bottom: 540 });
      lienzo.getBoundingClientRect = () => ({ top: 120, bottom: 960 });
      caja.oy.click({ target: { closest: () => fila('muni', '41551') } });
      caja.oy.click({ target: { closest: () => fila('depto', '41') } });
      assert.equal(llevadaA, null);
      assert.equal(mapaA, null, 'un mapa que solo se sale por abajo no se mueve a cada clic');
    } finally {
      if (antes === undefined) delete globalThis.innerHeight; else globalThis.innerHeight = antes;
    }
  });

  test('dibuja en menos de 1 s con 1.122 municipios y 2.000 clientes', async () => {
    const MC = fresco();
    const caja = cajaFalsa();
    const ciudades = ['Bogotá', 'Soacha', 'Medellín', 'Cali', 'Neiva', 'Pasto', 'Mosquera'];
    const socios = Array.from({ length: 2000 }, (_, i) => cliente('s' + i, ciudades[i % ciudades.length]));
    const prestamos = socios.filter((_, i) => i % 2).map((s, i) => pagado('p' + i, s.id));
    await MC.abrir({ caja, db: { socios, prestamos }, puente: P, pedir: pedirMapa });
    MC._estado.vista = 'conquistas';
    const t = Date.now();
    await MC.abrir({ caja, db: { socios, prestamos }, puente: P });
    assert.ok(Date.now() - t < 1000, 'tardó ' + (Date.now() - t) + ' ms');
    assert.equal((caja.innerHTML.match(/<path class="mapa-q /g) || []).length, 1122);
  });
});

describe('7 · la pestaña solo LEE la cartera', () => {

  test('los dos archivos no guardan ni escriben el almacenamiento', () => {
    for (const f of ['panel/mapa-lugares.js', 'panel/mapa-clientes.js']) {
      const codigo = leer(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const x of ['setItem', 'removeItem', 'localStorage', 'guardar(', 'sessionStorage', 'indexedDB']) {
        assert.ok(!codigo.includes(x), f + ' usa ' + x);
      }
    }
  });

  test('en el CRM de verdad: abrir el mapa no toca el disco ni llama a guardar()', async () => {
    const { abrirPanel } = require('./banco-panel.js');
    const red = url => (/mapa\/colombia-2026-11b\.json$/.test(url) ? pedirMapa()
      : Promise.reject(new Error('sin red')));
    const B = abrirPanel({ red });
    B.cargarCartera({ socios: [cliente('s1', 'Soacha'), cliente('s2', 'Mosquera')],
      prestamos: [pagado('p1', 's1')] });
    /* Los dos módulos corren DENTRO de la página, como en el navegador: así
       un guardar() o un localStorage suyos serían los de la página, y esta
       prueba los vería. */
    const vm = require('node:vm');
    for (const f of ['panel/mapa-lugares.js', 'panel/mapa-clientes.js']) vm.runInContext(leer(f), B.ctx, { filename: f });
    assert.equal(typeof B.ctx.MapaClientes.abrir, 'function', 'precondición: el módulo cargó en la página');
    B.ev('window.__guardo = 0; guardar = function () { window.__guardo++; };');
    const antes = JSON.stringify(B.almacen);
    const dbAntes = JSON.stringify(B.ev('DB'));
    B.ev("irA('mapa')");
    for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
    assert.match(B.elems.mapaCaja.innerHTML, /<svg class="mapa-svg/, 'el mapa no se pintó: ' + B.elems.mapaCaja.innerHTML.slice(0, 200));
    assert.match(B.elems.mapaCaja.innerHTML, /Mosquera/, 'el cliente sin ubicar no salió');
    assert.equal(B.ev('window.__guardo'), 0, 'la pestaña llamó a guardar()');
    assert.equal(JSON.stringify(B.almacen), antes, 'la pestaña escribió en el almacenamiento');
    assert.equal(JSON.stringify(B.ev('DB')), dbAntes, 'la pestaña le cambió algo a la cartera');
  });

  test('si los dos archivos no llegaron, la pestaña lo dice (y no queda en blanco)', () => {
    const { abrirPanel } = require('./banco-panel.js');
    const B = abrirPanel({});
    B.ev("irA('mapa')");
    assert.match(B.elems.mapaCaja.innerHTML, /versión vieja del CRM: el mapa no cargó/);
  });
});

/* ==========================================================================
 * 8 · 13-nov-2026: QUE SE VEAN LOS MUNICIPIOS
 *
 * Joan: «quiero que se mejore el mapa ya que no se ven los municipios». En
 * las capturas de antes: Cundinamarca en beige con bordes blancos casi
 * invisibles y sin un solo nombre, el «1–2» en un azul casi blanco, Bogotá
 * como un hueco en blanco en medio de Cundinamarca, y en Conquistas los
 * municipios eran puntitos. Cada prueba de aquí falla con el código de antes.
 * ======================================================================== */
describe('8 · que se vean los municipios (13-nov-2026)', () => {
  function carteraCon(cuantos) {
    const socios = [], prestamos = [];
    let n = 0;
    for (const [ciudad, [c, p]] of Object.entries(cuantos)) {
      for (let i = 0; i < c; i++) {
        n++; socios.push(cliente('s' + n, ciudad));
        if (i < (p || 0)) prestamos.push(pagado('p' + n, 's' + n));
      }
    }
    return { socios, prestamos };
  }
  /* Un DOM de mentira con lo que tocan el zoom, las etiquetas y el globito:
     el <svg> medido en pantalla (left 100, top 50), el lienzo, el globito,
     la línea, el buscador con sus sugerencias, los botones del zoom y los
     <path> que marcar() pide. Anota lo que se le hace. */
  function montaje(ancho, alto) {
    const anota = ini => { const s = new Set(ini || []); return { add: x => s.add(x), remove: x => s.delete(x), contains: x => s.has(x) }; };
    const M = { textos: [], caminos: {} };
    M.svg = { tagName: 'svg', attrs: {}, k: null, classList: anota(), capturas: [],
      setAttribute(k, v) { this.attrs[k] = String(v); },
      style: { setProperty(k, v) { if (k === '--k') M.svg.k = Number(v); } },
      getBoundingClientRect: () => ({ left: 100, top: 50, width: ancho, height: alto, right: 100 + ancho, bottom: 50 + alto }),
      setPointerCapture(id) { this.capturas.push(id); },
      querySelectorAll: () => {
        const n = (M.caja.innerHTML.match(/<text class="mapa-et/g) || []).length;
        M.textos = Array.from({ length: n }, () => ({ classList: anota(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
        return M.textos;
      } };
    M.lienzo = { getBoundingClientRect: () => ({ left: 90, top: 40, width: ancho + 20, height: alto + 120 }) };
    M.globo = { innerHTML: '', hidden: true, style: {}, classList: anota() };
    M.info = { textContent: '' };
    M.sug = { innerHTML: '', hidden: true };
    M.entrada = { className: 'mapa-buscar', value: '' };
    M.botones = { mas: { disabled: false }, menos: { disabled: true }, todo: { disabled: true } };
    M.caja = cajaFalsa();
    M.caja.querySelector = sel => {
      const fijo = { 'svg.mapa-svg': M.svg, '.mapa-lienzo': M.lienzo, '.mapa-globo': M.globo, '.mapa-info': M.info,
        '.mapa-sug': M.sug, '.mapa-buscar': M.entrada, '[data-z="mas"]': M.botones.mas, '[data-z="menos"]': M.botones.menos,
        '[data-z="todo"]': M.botones.todo }[sel];
      if (fijo) return fijo;
      const m = /^path\[data-mapa="muni"\]\[data-c="(\d+)"\]$/.exec(sel);
      if (m) {
        if (!M.caja.innerHTML.includes('data-mapa="muni" data-c="' + m[1] + '"')) return null;
        return M.caminos[m[1]] || (M.caminos[m[1]] = { classList: anota(), parentNode: { appendChild() {} } });
      }
      if (sel === 'path.mapa-sel') return Object.values(M.caminos).find(p => p.classList.contains('mapa-sel')) || null;
      return null;
    };
    M.doc = { oy: {}, addEventListener(t, f) { this.oy[t] = f; } };
    /* Los blancos de un evento: una zona del mapa, el mar del <svg> (dentro
       del mapa, fuera de toda zona), un botón, y fuera del mapa. */
    M.zona = (c, accion) => {
      const p = { tagName: 'path', getAttribute: k => ({ 'data-mapa': accion || 'muni', 'data-c': c }[k]) };
      return { closest: sel => (sel === 'svg.mapa-svg' ? M.svg : sel === '.mapa-busca' ? null : p) };
    };
    M.mar = { closest: sel => (sel === 'svg.mapa-svg' ? M.svg : null) };
    M.fuera = { closest: () => null };
    M.boton = attrs => {
      const b = { tagName: 'BUTTON', getAttribute: k => attrs[k] };
      return { closest: sel => (sel === '[data-mapa]' ? b : null) };
    };
    M.clic = (target, extra) => M.caja.oy.click(Object.assign({ target }, extra));
    M.rueda = (deltaY, extra) => {
      const ev = Object.assign({ target: M.mar, deltaY, deltaMode: 0, clientX: 350, clientY: 350, ctrlKey: false, prevenido: false,
        preventDefault() { this.prevenido = true; } }, extra);
      M.caja.oy.wheel(ev);
      return ev;
    };
    M.puntero = (tipo, extra) => {
      const ev = Object.assign({ type: tipo, pointerType: 'mouse', pointerId: 1, button: 0, buttons: 0, target: M.mar, clientX: 350, clientY: 350,
        movementX: 0, movementY: 0, cancelable: true, prevenido: false, preventDefault() { this.prevenido = true; } }, extra);
      M.caja.oy[tipo](ev);
      return ev;
    };
    return M;
  }
  async function abrirCon(db, opciones, ancho, alto) {
    const MC = fresco();
    const M = montaje(ancho || 500, alto || 600);
    Object.assign(MC._estado, opciones && opciones.estado);
    let ahora = 100000;
    MC._estado.reloj = () => ahora;
    M.pasa = ms => { ahora += ms; };
    await MC.abrir({ caja: M.caja, db, puente: P, pedir: pedirMapa, doc: M.doc });
    return { MC, M, E: MC._estado };
  }
  /* Las etiquetas de un HTML: código, nombre, cifra y si es de las de siempre. */
  const etiquetasDe = html => [...html.matchAll(/<text class="mapa-et( siempre| oculta)?[^"]*"[^>]*data-c="(\d+)">([^<]+) <tspan class="mapa-et-k">([^<]+)<\/tspan><\/text>/g)]
    .map(m => ({ c: m[2], nombre: m[3], cifra: m[4], siempre: m[1] === ' siempre' }));
  const casi = (a, b, que) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), que + ': ' + a + ' ≠ ' + b);
  const nombreDe = c => MAPA.municipios.find(m => m.c === c).n;

  /* ---------------------------------------------------------- el mapa nuevo */
  test('el mapa trae dónde va el nombre de cada municipio, DENTRO de él, y los huecos de cada departamento', () => {
    const anillos = d => (d.match(/M[^M]*/g) || []).map(p => {
      const n = p.match(/-?\d+/g).map(Number); let x = n[0], y = n[1]; const r = [[x, y]];
      for (let i = 2; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; r.push([x, y]); }
      return r;
    });
    const dentro = (x, y, as) => {
      let s = false;
      for (const r of as) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i], b = r[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) s = !s;
      }
      return s;
    };
    const fuera = MAPA.municipios.filter(m => !(Array.isArray(m.p) && dentro(m.p[0], m.p[1], anillos(m.d)))).map(m => m.c + ' ' + m.n);
    assert.deepEqual(fuera, [], 'el nombre caería fuera de su municipio');
    const huecos = Object.fromEntries(MAPA.departamentos.filter(d => d.h).map(d => [d.c, d.h]));
    assert.deepEqual(huecos['25'], ['11001'], 'Bogotá es el hueco de Cundinamarca');
    assert.deepEqual(Object.keys(huecos).sort(), ['15', '17', '19', '25', '54', '68']);
    const MC = fresco();
    assert.equal(MC.URL_MAPA, 'mapa/colombia-2026-11b.json', 'un JSON cambiado con el mismo nombre: el service worker serviría el de antes');
    assert.ok(leer('panel/mapa/FUENTES.md').includes('colombia-2026-11b.json'));
  });

  test('el guion: el polo de una C cae dentro (el centro de la caja no) y un hueco es el que comparte 2/3 de su borde', () => {
    const C = [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10]]];
    assert.ok(G.distanciaAlBorde(5, 5, C) < 0, 'precondición: el centro de la caja de una C está afuera');
    const p = G.poloDeInaccesibilidad(C, 0.1);
    assert.ok(G.distanciaAlBorde(p.x, p.y, C) > 0.9, 'el polo cayó en (' + p.x + ', ' + p.y + ')');
    /* Un cuadrado de 10×10 (forma 0, depto 11): tres lados con la forma 1
       (depto 25) y uno con la 2 (depto 50). Las otras dos tienen además un
       borde largo propio. */
    const arcos = [[[0, 0], [0, 10]], [[0, 10], [10, 10]], [[10, 10], [10, 0]], [[10, 0], [0, 0]], [[0, 0], [0, 100]], [[0, 0], [100, 0]]];
    const depto = f => ['11', '25', '50'][f];
    const con = (...a) => [a.map(x => ({ a: x, rev: false }))];
    assert.deepEqual(G.huecos([con(0, 1, 2, 3), con(0, 1, 2, 4), con(3, 5)], arcos, depto).map(h => [h.f, h.depto]), [[0, '25']], '3/4 del borde');
    assert.deepEqual(G.huecos([con(0, 1, 2, 3), con(0, 1, 4), con(2, 3, 5)], arcos, depto), [], 'con la mitad no es un hueco');
  });

  /* ----------------------------------------------------- 1 · los nombres */
  test('en un departamento abierto, el nombre y la cifra de CADA municipio con clientes, siempre; los demás no', async () => {
    const db = carteraCon({ Soacha: [4], Chía: [1], Zipaquirá: [2], Fusagasugá: [3] });
    const { M, E } = await abrirCon(db, { estado: { depto: '25' } });
    const ets = etiquetasDe(M.caja.innerHTML);
    assert.deepEqual(ets.map(e => e.c).sort(), ['25175', '25290', '25754', '25899']);
    assert.ok(ets.every(e => e.siempre), 'en un departamento abierto los nombres no se esconden');
    const por = Object.fromEntries(ets.map(e => [e.nombre, e.cifra]));
    assert.deepEqual(por, { Soacha: '4', Fusagasugá: '3', 'Chía': '1–2', 'Zipaquirá': '1–2' });
    assert.ok(E.ets.every(e => e.ver), 'colocarEtiquetas apagó uno de los que van siempre');
    /* Los demás, en el globito: al pasar el ratón por Tocaima, sin clientes. */
    M.caja.oy.mouseover({ target: M.zona('25815'), clientX: 300, clientY: 300 });
    assert.equal(M.globo.hidden, false);
    assert.equal(M.globo.innerHTML, '<b>Tocaima (Cundinamarca)</b> · sin clientes');
    assert.equal(M.info.textContent, 'Tocaima (Cundinamarca) · sin clientes');
    assert.equal(M.globo.style.left, '210px', 'el globito va donde está el ratón (300 − 90 del lienzo)');
  });

  test('en Colombia, los nombres que caben sin taparse; con zoom, caben más', async () => {
    const db = carteraCon({ Funza: [3], 'Mosquera, Cundinamarca': [4], Madrid: [5], Medellín: [6], Neiva: [2] });
    const { M, E } = await abrirCon(db);
    const ets = etiquetasDe(M.caja.innerHTML);
    assert.deepEqual(ets.map(e => e.nombre).sort(), ['Funza', 'Madrid', 'Medellín', 'Mosquera', 'Neiva'].sort());
    assert.ok(ets.every(e => !e.siempre), 'en Colombia salen apagados hasta que se sabe si caben');
    const ver = () => Object.fromEntries(E.ets.map(e => [nombreDe(e.c), e.ver]));
    const lejos = ver();
    assert.equal(lejos['Medellín'], true); assert.equal(lejos.Neiva, true);
    assert.ok(!(lejos.Funza && lejos.Mosquera && lejos.Madrid), 'tres vecinos de la Sabana a escala de país se tapan: ' + JSON.stringify(lejos));
    /* Acercar sobre Funza hasta el tope: Funza y Mosquera, que son vecinos, ya caben los dos. */
    const funza = MAPA.municipios.find(m => m.c === '25286').p;
    for (let i = 0; i < 12; i++) {
      const vb = E.z.vb, s = Math.max(vb[2] / 500, vb[3] / 600);
      M.rueda(-200, { ctrlKey: true, clientX: 100 + (500 - vb[2] / s) / 2 + (funza[0] - vb[0]) / s, clientY: 50 + (600 - vb[3] / s) / 2 + (funza[1] - vb[1]) / s });
    }
    const cerca = ver();
    assert.equal(cerca.Funza, true); assert.equal(cerca.Mosquera, true);
    assert.equal(cerca['Medellín'], false, 'lo que quedó fuera de la ventana no se cuenta (ni se ve)');
  });

  test('colocarEtiquetas: la segunda que tapa a la primera se apaga; «siempre» se corre arriba o abajo', () => {
    const MC = fresco();
    const dos = [{ x: 0, y: 0, w: 60, h: 16 }, { x: 10, y: 0, w: 60, h: 16 }];
    const vb = [-500, -500, 1000, 1000];
    assert.deepEqual(MC.colocarEtiquetas(dos, vb, 1).map(r => r.ver), [true, false]);
    assert.deepEqual(MC.colocarEtiquetas(dos, vb, 0.1).map(r => r.ver), [true, true], 'más cerca, las dos caben');
    const siempre = MC.colocarEtiquetas(dos.map(e => Object.assign({ siempre: true }, e)), vb, 1);
    assert.deepEqual(siempre.map(r => r.ver), [true, true]);
    assert.equal(siempre[0].dy, 0); assert.notEqual(siempre[1].dy, 0, 'la segunda se corrió para no tapar a la primera');
  });

  test('la etiqueta que se sale por un lado de la ventana se corre hacia adentro («irardot 1–2»)', async () => {
    const MC = fresco();
    const vb = [0, 0, 1000, 1000];
    const [izq, der, centro] = MC.colocarEtiquetas([{ x: 10, y: 100, w: 100, h: 16, siempre: true },
      { x: 990, y: 300, w: 100, h: 16, siempre: true }, { x: 500, y: 500, w: 100, h: 16, siempre: true }], vb, 1);
    assert.equal(10 + izq.dx - 50, 0, 'por la izquierda, el texto empieza en el borde');
    assert.equal(990 + der.dx + 50, 1000, 'por la derecha, termina en el borde');
    assert.equal(centro.dx, 0, 'la que cabe no se mueve');
    /* En Cundinamarca abierta, Girardot (en el borde de la ventana) se lee entero. */
    const db = carteraCon({ Girardot: [1], Soacha: [4] });
    const { M, E } = await abrirCon(db, { estado: { depto: '25' } });
    const i = E.ets.findIndex(e => e.c === '25307');
    assert.ok(i >= 0, 'Girardot no tiene etiqueta');
    const e = E.ets[i], x = Number(M.textos[i].attrs.x === undefined ? e.x : M.textos[i].attrs.x);
    assert.ok(x - e.w * E.z.s / 2 >= E.z.vb[0] - 0.1, 'el nombre de Girardot se sale por la izquierda: ' + (x - e.w * E.z.s / 2) + ' < ' + E.z.vb[0]);
  });

  /* ------------------------------------- 3 · los municipios con clientes */
  test('en Colombia, los municipios con clientes se marcan encima de los departamentos, sin taparlos', async () => {
    const db = carteraCon({ Soacha: [4], Neiva: [1] });
    const { M } = await abrirCon(db);
    const h = M.caja.innerHTML;
    assert.equal((h.match(/<path class="mapa-z t\d" data-mapa="depto"/g) || []).length, 33, 'los departamentos siguen todos');
    const marcas = [...h.matchAll(/<path class="mapa-marca" data-mapa="muni" data-c="(\d+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(marcas, ['25754', '41001']);
    assert.equal((h.match(/<path class="mapa-marca-f"/g) || []).length, 2, 'cada marca con su trazo claro debajo');
    assert.ok(h.indexOf('class="mapa-marca"') > h.lastIndexOf('<path class="mapa-z'), 'las marcas van encima de los departamentos');
    assert.match(h, /<title>Neiva \(Huila\) · 1–2 clientes<\/title>/);
  });

  /* ------------------------------------- 4 · Bogotá dentro de Cundinamarca */
  test('Bogotá dentro de Cundinamarca: en su sitio, con su nombre y su cifra, se toca, y no suma al total', async () => {
    const db = carteraCon({ Bogotá: [3], Soacha: [1] });
    const { MC, M, E } = await abrirCon(db, { estado: { depto: '25' } });
    const h = M.caja.innerHTML;
    assert.match(h, /<path class="mapa-z t2 mapa-hueco" data-mapa="muni" data-c="11001"/, 'Bogotá no se pintó');
    const bog = etiquetasDe(h).find(e => e.c === '11001');
    assert.deepEqual(bog, { c: '11001', nombre: 'Bogotá, D.C.', cifra: '3', siempre: true });
    assert.match(h, /<h3 class="mapa-h">Cundinamarca<\/h3><div class="mapa-total"><b>1–2<\/b> clientes · 1 de 116 municipios/, 'Bogotá sumó al total de Cundinamarca');
    assert.match(h, /También en este mapa[\s\S]*data-mapa="muni" data-c="11001"><span>Bogotá, D\.C\.<\/span><b>3<\/b>/);
    /* La ventana la incluye entera. */
    const b = MC.cajaDe(MAPA.municipios.find(m => m.c === '11001').d), vb = E.z.base;
    assert.ok(b[0] >= vb[0] && b[1] >= vb[1] && b[2] <= vb[0] + vb[2] && b[3] <= vb[1] + vb[3], 'Bogotá se sale de la ventana');
    M.clic(M.zona('11001'), { clientX: 320, clientY: 330 });
    assert.equal(M.info.textContent, 'Bogotá, D.C. · 3 clientes');
    assert.equal(M.globo.innerHTML, '<b>Bogotá, D.C.</b> · 3 clientes');
    assert.ok(M.caminos['11001'].classList.contains('mapa-sel'), 'Bogotá no quedó marcada');
  });

  /* ------------------------------------------------------------ 5 · zoom */
  test('zoom: ＋, － y «Volver a ver todo»; el texto mide lo mismo en pantalla con cualquier zoom', async () => {
    const { M, E } = await abrirCon(carteraCon({ Soacha: [4] }));
    const base = E.z.base.slice(), k0 = M.svg.k;
    assert.ok(k0 > 0, 'sin --k el texto crece con el zoom');
    assert.deepEqual(E.z.vb, base);
    assert.equal(M.botones.todo.disabled, true, '«Volver a ver todo» sin nada que volver');
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    casi(E.z.vb[2], base[2] / 1.6, 'el ancho tras ＋');
    assert.ok(Math.abs(M.svg.k * 1.6 - k0) < 0.01, '--k (unidades por píxel) baja lo mismo que sube el zoom: la letra no crece');
    assert.equal(M.svg.attrs.viewBox, E.z.vb.map(v => Math.round(v * 10) / 10).join(' '));
    assert.ok(M.svg.classList.contains('ampliado'));
    assert.equal(M.botones.todo.disabled, false);
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'menos' }));
    casi(E.z.vb[2], base[2] / 1.6, 'el ancho tras ＋＋－');
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'todo' }));
    assert.deepEqual(E.z.vb, base);
    assert.ok(Math.abs(M.svg.k - k0) < 0.001, '--k al volver');
    assert.ok(!M.svg.classList.contains('ampliado'));
    for (let i = 0; i < 40; i++) M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    assert.equal(E.z.vb[2], 100, 'hasta 100 unidades (23 km) y no más');
    assert.equal(M.botones.mas.disabled, true);
    const hoja = leer('panel/mapa-clientes.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(hoja, /\.mapa-et\{[^}]*font-size:calc\(var\(--k,1\) \* 12px\)/, 'el tamaño de la letra no va en --k');
  });

  test('la rueda NO roba el scroll de la página: solo con el ratón movido encima del mapa, o con Ctrl', async () => {
    const { M, E } = await abrirCon(carteraCon({ Soacha: [4] }));
    const base = E.z.base.slice();
    let ev = M.rueda(-100);
    assert.equal(ev.prevenido, false, 'el mapa llegó debajo del ratón quieto y se robó la rueda');
    assert.deepEqual(E.z.vb, base);
    M.puntero('pointermove', { movementX: 3 });
    ev = M.rueda(-100);
    assert.equal(ev.prevenido, true); assert.ok(E.z.vb[2] < base[2], 'con el ratón movido encima, la rueda acerca');
    /* La página se movió (la rueda en otra parte): el mapa la deja pasar. */
    M.pasa(1000); M.doc.oy.scroll();
    const vb = E.z.vb.slice();
    ev = M.rueda(-100);
    assert.equal(ev.prevenido, false); assert.deepEqual(E.z.vb, vb);
    /* Un movimiento pegado al scroll es el que inventa el navegador al pasar el mapa: no arma. */
    M.puntero('pointermove', { movementX: 2 });
    assert.equal(M.rueda(-100).prevenido, false);
    M.pasa(1000); M.puntero('pointermove', { movementY: 2 });
    assert.equal(M.rueda(-100).prevenido, true, 'movido de verdad, vuelve a acercar');
    /* Fuera del mapa, la rueda es de la página. */
    M.pasa(1000); M.puntero('pointermove', { target: M.fuera, movementX: 5 });
    assert.equal(M.rueda(-100).prevenido, false);
    /* En el tope (todo a la vista, alejando), pasado un rato, la rueda es de la página. */
    M.pasa(1000); M.puntero('pointermove', { movementX: 5 });
    M.rueda(5000);
    assert.deepEqual(E.z.vb, base);
    M.pasa(1000);
    assert.equal(M.rueda(100).prevenido, false, 'con todo a la vista, alejar no frena la página');
    /* Con Ctrl (o el pellizco del trackpad) acerca aunque la página se haya movido. */
    M.doc.oy.scroll();
    assert.equal(M.rueda(-30, { ctrlKey: true }).prevenido, true);
    assert.ok(E.z.vb[2] < base[2]);
  });

  test('arrastrar con el ratón mueve el mapa, y soltar encima de un departamento no lo abre', async () => {
    const { M, E } = await abrirCon(carteraCon({ Soacha: [4] }));
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': 'mas' }));
    const vb = E.z.vb.slice();
    M.puntero('pointerdown', { target: M.zona('25', 'depto'), clientX: 300, clientY: 300 });
    M.puntero('pointermove', { target: M.zona('25', 'depto'), clientX: 302, clientY: 301, buttons: 1 });
    assert.deepEqual(E.z.vb, vb, 'dos píxeles no son un arrastre');
    const ev = M.puntero('pointermove', { target: M.zona('25', 'depto'), clientX: 340, clientY: 320, buttons: 1 });
    assert.ok(E.z.vb[0] < vb[0] && E.z.vb[1] < vb[1], 'arrastrar a la derecha y abajo muestra lo de la izquierda y arriba');
    assert.equal(ev.prevenido, true);
    assert.deepEqual(M.svg.capturas, [1], 'el ratón se captura cuando ya es arrastre');
    M.puntero('pointerup', { target: M.zona('25', 'depto'), clientX: 340, clientY: 320 });
    M.clic(M.zona('25', 'depto'), { clientX: 340, clientY: 320 });
    assert.equal(E.depto, null, 'soltar el arrastre encima de Cundinamarca la abrió');
    M.pasa(2000);
    /* Apretado y soltado fuera de la caja antes de ser arrastre (ese pointerup
       no llega): de vuelta, el ratón sin botones no arrastra el mapa. */
    M.puntero('pointerdown', { target: M.mar, clientX: 300, clientY: 300 });
    const quieto = E.z.vb.slice();
    M.puntero('pointermove', { target: M.mar, clientX: 380, clientY: 300, buttons: 0, movementX: 80 });
    assert.deepEqual(E.z.vb, quieto, 'el mapa se pegó al ratón sin apretar');
    M.clic(M.zona('25', 'depto'), { clientX: 340, clientY: 320 });
    assert.equal(E.depto, '25', 'un toque de verdad sí la abre');
  });

  test('en el celular: un dedo sin ampliar es de la página; dos dedos pellizcan; ampliado, un dedo mueve', async () => {
    const { M, E } = await abrirCon(carteraCon({ Soacha: [4] }));
    const base = E.z.base.slice();
    const dedo = (tipo, id, x, y) => M.puntero(tipo, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, target: M.zona('25', 'depto') });
    dedo('pointerdown', 5, 300, 400);
    const ev = dedo('pointermove', 5, 300, 250);
    assert.equal(ev.prevenido, false, 'el dedo que baja la página quedó atrapado en el mapa');
    assert.deepEqual(E.z.vb, base);
    dedo('pointerup', 5, 300, 250);
    dedo('pointerdown', 7, 250, 300); dedo('pointerdown', 8, 350, 300);
    dedo('pointermove', 8, 450, 300);
    casi(E.z.vb[2], base[2] / 2, 'separar los dedos al doble acerca al doble');
    assert.ok(M.svg.classList.contains('ampliado'), 'ampliado: la hoja le quita el dedo a la página (touch-action:none)');
    dedo('pointerup', 7, 250, 300); dedo('pointerup', 8, 450, 300);
    const vb = E.z.vb.slice();
    dedo('pointerdown', 9, 300, 300); dedo('pointermove', 9, 260, 300);
    assert.ok(E.z.vb[0] > vb[0], 'ampliado, un dedo mueve el mapa');
    dedo('pointerup', 9, 260, 300);
    const hoja = leer('panel/mapa-clientes.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(hoja, /\.mapa-svg\{[^}]*touch-action:pan-y/);
    assert.match(hoja, /\.mapa-svg\.ampliado\{[^}]*touch-action:none/);
  });

  /* ------------------------------------------------------- 6 · el buscador */
  test('el buscador encuentra el municipio, abre su departamento, lo centra y lo resalta', async () => {
    const db = carteraCon({ 'Mosquera, Cundinamarca': [1], Soacha: [4] });
    const { MC, M, E } = await abrirCon(db);
    assert.deepEqual(MC.buscar('mosq'), ['25473', '52473'], 'primero el que tiene clientes');
    assert.ok(MC.buscar('fusa').includes('25290'), 'los apodos de mapa-lugares.js también');
    M.entrada.value = 'mosq';
    M.caja.oy.input({ target: M.entrada });
    assert.equal(M.sug.hidden, false);
    assert.match(M.sug.innerHTML, /data-c="25473"><span>Mosquera <small>Cundinamarca<\/small><\/span><b>1–2<\/b>/);
    assert.match(M.sug.innerHTML, /data-c="52473"><span>Mosquera <small>Nariño<\/small><\/span><b><i>sin clientes<\/i><\/b>/);
    M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
    assert.equal(E.depto, '25', 'no abrió Cundinamarca');
    assert.ok(E.z.vb[2] < E.z.base[2], 'no se acercó');
    const p = MAPA.municipios.find(m => m.c === '25473').p, vb = E.z.vb;
    assert.ok(p[0] > vb[0] && p[0] < vb[0] + vb[2] && p[1] > vb[1] && p[1] < vb[1] + vb[3], 'Mosquera quedó fuera de la ventana');
    assert.ok(M.caminos['25473'].classList.contains('mapa-sel'), 'no quedó resaltado');
    assert.equal(M.info.textContent, 'Mosquera (Cundinamarca) · 1–2 clientes');
    assert.equal(M.globo.hidden, false);
    assert.equal(M.entrada.value, 'Mosquera');
    /* Bogotá se busca y se ve dentro de Cundinamarca. */
    E.depto = null;
    M.entrada.value = 'bogota'; M.caja.oy.input({ target: M.entrada });
    M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
    assert.equal(E.depto, '25');
    assert.ok(M.caminos['11001'].classList.contains('mapa-sel'));
    /* Lo que no existe se dice. */
    M.entrada.value = 'Narnia'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /No encuentro un municipio con ese nombre/);
    /* En Conquistas busca sin cambiar de vista. */
    E.vista = 'conquistas'; E.depto = null;
    await MC.abrir({ caja: M.caja, db, puente: P, doc: M.doc });
    M.entrada.value = 'soacha'; M.caja.oy.input({ target: M.entrada });
    M.clic(M.boton({ 'data-mapa': 'buscado', 'data-c': '25754' }));
    assert.equal(E.vista, 'conquistas'); assert.equal(E.depto, null);
    assert.ok(E.z.vb[2] < E.z.base[2]);
  });

  test('el buscador no deja ver cuál «1–2» tiene 2: con dos «1–2», va el abecedario', async () => {
    /* Sopó tiene 2 y Soacha 1: por la cifra exacta, Sopó saldría primero y se
       sabría cuál tiene más. Con el punto medio de lo visible, empatan. */
    const db = carteraCon({ Sopó: [2], Soacha: [1] });
    const { MC, M } = await abrirCon(db);
    assert.deepEqual(MC.buscar('so').slice(0, 2), ['25754', '25758']);
    M.entrada.value = 'so'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /data-c="25754"><span>Soacha <small>Cundinamarca<\/small><\/span><b>1–2<\/b>[\s\S]*data-c="25758"><span>Sopó <small>Cundinamarca<\/small><\/span><b>1–2<\/b>/);
  });

  test('«Mosquera» a secas no deja a las dos Mosquera «sin clientes»: dice cuántos quedaron sin ubicar', async () => {
    const db = carteraCon({ Mosquera: [6], Soacha: [4], Armenia: [1] });
    const { MC, M, E } = await abrirCon(db);
    M.entrada.value = 'mosq'; M.caja.oy.input({ target: M.entrada });
    assert.doesNotMatch(M.sug.innerHTML, /sin clientes/, 'dice «sin clientes» donde hay clientes que escribieron Mosquera');
    assert.match(M.sug.innerHTML, /data-c="25473"><span>Mosquera <small>Cundinamarca<\/small><\/span><b><i>6 sin ubicar<\/i><\/b>/);
    assert.match(M.sug.innerHTML, /data-c="52473"><span>Mosquera <small>Nariño<\/small><\/span><b><i>6 sin ubicar<\/i><\/b>/);
    M.caja.oy.keydown({ target: M.entrada, key: 'Enter', preventDefault() {} });
    assert.equal(M.info.textContent, 'Mosquera (Cundinamarca) · ninguno ubicado · 6 sin ubicar (nombre repetido, abajo)');
    /* Con «1–2» también aquí: Armenia a secas es de Antioquia o del Quindío. */
    E.depto = null;
    M.entrada.value = 'armenia'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /<b><i>1–2 sin ubicar<\/i><\/b>/);
    assert.doesNotMatch(M.sug.innerHTML, /<i>1 sin ubicar/);
    /* Y donde de verdad no hay nadie, sigue «sin clientes». */
    assert.equal(MC._estado.res.dudosos['25754'], undefined);
    M.entrada.value = 'tocaima'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /<b><i>sin clientes<\/i><\/b>/);
  });

  /* ------------------------------------------------- 2 · el contraste medido */
  describe('el contraste, medido con los tokens de crm.html', () => {
    const CRM_HTML = leer('panel/crm.html');
    const i = CRM_HTML.indexOf(':root{');
    const VARS = Object.fromEntries([...CRM_HTML.slice(i, CRM_HTML.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/--([\w-]+):([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    const HOJA = leer('panel/mapa-clientes.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const REGLAS = {};
    for (const m of HOJA.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (!(sel in REGLAS)) REGLAS[sel] = Object.fromEntries(m[2].split(';').map(d => d.split(':')).filter(d => d.length >= 2)
        .map(d => [d[0].trim(), d.slice(1).join(':').trim()]));
    }
    Object.entries(REGLAS['.mapa-lienzo'] || {}).forEach(([k, v]) => { if (k.startsWith('--')) VARS[k.slice(2)] = v; });
    const decl = (sel, prop, otra) => (REGLAS[sel] && REGLAS[sel][prop]) || (otra && REGLAS[otra] && REGLAS[otra][prop]);
    const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
    /* Un color de la hoja, pintado sobre `sobre` (las transparencias se mezclan). */
    function color(valor, sobre) {
      const v = String(valor).trim();
      let m = /^var\(--([\w-]+)\)$/.exec(v);
      if (m) return color(VARS[m[1]], sobre);
      m = /^rgba\(var\(--([\w-]+)\),\s*([\d.]+)\)$/.exec(v);
      if (m) { const c = VARS[m[1]].split(',').map(Number), a = Number(m[2]); return c.map((x, k) => a * x + (1 - a) * sobre[k]); }
      if (/^#[0-9a-f]{6}$/i.test(v)) return hex(v);
      throw new Error('no sé leer el color «' + v + '»');
    }
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const Y = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const contraste = (a, b) => { const x = Y(a), y = Y(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const Lestrella = c => { const y = Y(c); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
    const PAPEL = color('var(--papel)'), LACA = color('var(--laca)');
    const rellenos = [0, 1, 2, 3, 4, 5].map(t => color(decl('.mapa-z.t' + t, 'fill'), PAPEL));

    test('cada borde de municipio contra su relleno, a 3:1 o más (antes: blanco sobre beige, 1,17:1)', () => {
      const malos = [];
      rellenos.forEach((f, t) => {
        const raya = color(decl('.mapa-z.t' + t, 'stroke', '.mapa-z'), f);
        const c = contraste(raya, f);
        if (c < 3) malos.push('t' + t + ': ' + c.toFixed(2) + ':1');
      });
      assert.deepEqual(malos, []);
    });

    test('la escala se distingue paso a paso, y el «1–2» ya no es casi blanco', () => {
      const Ls = rellenos.map(Lestrella);
      for (let t = 1; t < 6; t++) assert.ok(Ls[t - 1] - Ls[t] >= 8, 't' + (t - 1) + '→t' + t + ': L* ' + Ls[t - 1].toFixed(1) + ' → ' + Ls[t].toFixed(1));
      const c1 = contraste(rellenos[1], rellenos[0]);
      assert.ok(c1 >= 1.3, '«1–2» contra «Sin clientes»: ' + c1.toFixed(2) + ':1 (antes 1,08)');
      for (let t = 0; t < 6; t++) assert.equal(decl('.mapa-leyenda .mapa-z.t' + t, 'background'), decl('.mapa-z.t' + t, 'fill'), 'la leyenda de t' + t + ' no es el color del mapa');
    });

    test('los nombres y el globito se leen (4,5:1) sobre su halo y su fondo, en las dos vistas', () => {
      const halo = color(decl('.mapa-et', 'stroke'), PAPEL);
      assert.ok(contraste(color(decl('.mapa-et', 'fill'), halo), halo) >= 4.5);
      assert.ok(contraste(color(decl('.mapa-et .mapa-et-k', 'fill'), halo), halo) >= 4.5, 'la cifra');
      const haloO = color(decl('.mapa-oscuro .mapa-et', 'stroke'), LACA);
      for (const s of ['.mapa-oscuro .mapa-et', '.mapa-oscuro .mapa-et .mapa-et-k', '.mapa-oscuro .mapa-et.conq']) {
        assert.ok(contraste(color(decl(s, 'fill'), haloO), haloO) >= 4.5, s);
      }
      const fondo = color(decl('.mapa-globo', 'background'), PAPEL);
      assert.ok(contraste(color(decl('.mapa-globo', 'color'), fondo), fondo) >= 4.5, 'el globito');
      assert.ok(/paint-order:stroke/.test(HOJA), 'sin paint-order el halo tapa la letra');
    });

    test('Conquistas: los bordes de «sin clientes» y «con clientes» a 3:1; la marca de Colombia, de dos tonos', () => {
      for (const c of ['vacio', 'con']) {
        const f = color(decl('.mapa-q.' + c, 'fill'), LACA);
        const raya = color(decl('.mapa-q.' + c, 'stroke', '.mapa-q'), f);
        assert.ok(contraste(raya, f) >= 3, c + ': ' + contraste(raya, f).toFixed(2) + ':1');
      }
      const oscura = color(decl('.mapa-marca', 'stroke'), PAPEL), clara = color(decl('.mapa-marca-f', 'stroke'), PAPEL);
      assert.ok(contraste(oscura, clara) >= 4.5, 'los dos tonos de la marca');
      assert.ok(parseFloat(decl('.mapa-marca-f', 'stroke-width')) > parseFloat(decl('.mapa-marca', 'stroke-width')), 'el trazo claro va por fuera');
      const velo = /rgba\(var\(--laca-rgb\),([\d.]+)\)/.exec(decl('.mapa-marca', 'fill'));
      assert.ok(velo && Number(velo[1]) <= 0.3, 'la marca tapa el color del departamento');
    });
  });

  /* ------------------------------------- «1–2» en globitos y etiquetas */
  test('«1–2» en las etiquetas, el globito y el buscador: nunca un «2» ni un total que se despeje', async () => {
    const db = carteraCon({ Neiva: [2, 2], Pitalito: [1] });
    const { M, E } = await abrirCon(db);
    /* La nota que explica el rango dice «1 o 2 clientes» a propósito, y las
       tarjetas de Conquistas cuentan MUNICIPIOS («2 con clientes»): no son
       cifras de personas. */
    const sinDos = (txt, que) => assert.doesNotMatch(txt.replace(/las zonas con 1 o 2 clientes/g, '')
      .replace(/<div class="mapa-kpis">[\s\S]*?<\/div><\/div>/, ''), /(^|[^–\d])[12]( clientes|<\/tspan>|<\/b>)/, que);
    /* Colombia: el departamento (dos «1–2» suman 2–4) y la etiqueta. */
    M.caja.oy.mouseover({ target: M.zona('41', 'depto'), clientX: 300, clientY: 300 });
    assert.equal(M.globo.innerHTML, '<b>Huila</b> · 2–4 clientes');
    M.caja.oy.mouseover({ target: M.zona('41001'), clientX: 300, clientY: 300 });
    assert.equal(M.globo.innerHTML, '<b>Neiva (Huila)</b> · 1–2 clientes');
    assert.deepEqual(etiquetasDe(M.caja.innerHTML).map(e => e.cifra), ['1–2', '1–2']);
    sinDos(M.caja.innerHTML, 'Colombia');
    /* El departamento abierto. */
    M.clic(M.boton({ 'data-mapa': 'depto', 'data-c': '41' }));
    assert.equal(E.depto, '41');
    assert.deepEqual(etiquetasDe(M.caja.innerHTML).map(e => [e.nombre, e.cifra]), [['Neiva', '1–2'], ['Pitalito', '1–2']]);
    sinDos(M.caja.innerHTML, 'Huila');
    /* Conquistas: «faltan 1–2» en el globito, «1–2» en la etiqueta. */
    M.clic(M.boton({ 'data-mapa': 'vista', 'data-v': 'conquistas' }));
    M.caja.oy.mouseover({ target: M.zona('41001'), clientX: 300, clientY: 300 });
    assert.equal(M.globo.innerHTML, '<b>Neiva (Huila)</b> · 1–2 clientes · faltan 1–2 para conquistarlo');
    sinDos(M.caja.innerHTML, 'Conquistas');
    /* El buscador. */
    M.entrada.value = 'neiva'; M.caja.oy.input({ target: M.entrada });
    assert.match(M.sug.innerHTML, /<b>1–2<\/b>/);
    sinDos(M.sug.innerHTML, 'el buscador');
  });

  /* ----------------------------------------------------------- 7 · rápido */
  test('rápido: 2.000 clientes en 300 municipios, cada vista en menos de 1 s y el zoom en menos de 30 ms', async () => {
    const codigos = MAPA.municipios.filter((_, i) => i % 3 === 0).slice(0, 300);
    const socios = Array.from({ length: 2000 }, (_, i) => {
      const m = codigos[i % codigos.length];
      return cliente('s' + i, m.n + ', ' + MAPA.departamentos.find(d => d.c === m.c.slice(0, 2)).n);
    });
    const prestamos = socios.filter((_, i) => i % 2).map((s, i) => pagado('p' + i, s.id));
    const { MC, M, E } = await abrirCon({ socios, prestamos });
    assert.ok(Object.keys(E.res.porMuni).length > 250, 'precondición: se ubicaron ' + Object.keys(E.res.porMuni).length);
    for (const [que, antes] of [['Colombia', () => { E.depto = null; E.vista = 'deptos'; }], ['Cundinamarca', () => { E.depto = '25'; }],
      ['Antioquia', () => { E.depto = '05'; }], ['Conquistas', () => { E.vista = 'conquistas'; E.depto = null; }]]) {
      antes();
      const t = Date.now();
      await MC.abrir({ caja: M.caja, db: { socios, prestamos }, puente: P, doc: M.doc });
      assert.ok(Date.now() - t < 1000, que + ' tardó ' + (Date.now() - t) + ' ms');
      const t2 = Date.now();
      for (let k = 0; k < 10; k++) M.clic(M.boton({ 'data-mapa': 'zoom', 'data-z': k < 5 ? 'mas' : 'menos' }));
      assert.ok((Date.now() - t2) / 10 < 30, que + ': cada paso de zoom tardó ' + (Date.now() - t2) / 10 + ' ms');
    }
    assert.ok(E.ets.length > 250, 'las etiquetas de Conquistas: ' + E.ets.length);
  });
});
