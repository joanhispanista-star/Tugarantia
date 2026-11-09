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
 * Y el mapa mismo (panel/mapa/colombia-2026-11.json, que arma
 * herramientas/mapa-colombia.js con las descargas de geoBoundaries y HDX):
 * sus 1.122 municipios, que cada departamento sume su cuenta oficial, y el
 * casado de los nombres repetidos por vecindad.
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
const RUTA_MAPA = path.join(RAIZ, 'panel', 'mapa', 'colombia-2026-11.json');
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

  test('pesa menos de 600 KB y trae los créditos de las fuentes', () => {
    const bytes = fs.statSync(RUTA_MAPA).size;
    assert.ok(bytes < 600 * 1000, 'el mapa pesa ' + bytes + ' bytes');
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

  test('los .js nuevos se piden con ?v=143, la hoja también, y el mapa NO va en la precarga', () => {
    assert.match(CRM, /<script src="mapa-lugares\.js\?v=143"><\/script>/);
    assert.match(CRM, /<script src="mapa-clientes\.js\?v=143"><\/script>/);
    assert.match(CRM, /<link rel="stylesheet" href="mapa-clientes\.css\?v=143">/);
    assert.ok(!leer('sw.js').includes('colombia-2026-11.json'), 'el mapa (570 KB) se colaría en la precarga de cada teléfono');
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
    const red = url => (/mapa\/colombia-2026-11\.json$/.test(url) ? pedirMapa()
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
