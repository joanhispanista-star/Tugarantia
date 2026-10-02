/* ===========================================================================
 * LA SEGUNDA VUELTA DE LA SUBIDA AUTOMÁTICA — 1 de octubre de 2026
 *
 * Tres revisiones a la contra (plata, CRM, honestidad) atacaron las Etapas 0 y
 * 1 de RECETA-NUBE-CRM.md con node y los archivos de verdad. Cada prueba de
 * este archivo es UNO de sus hallazgos, reproducido, y se puso roja contra el
 * código de antes del arreglo. Van con el nombre del hallazgo para que, si un
 * día se pone roja otra vez, se sepa qué plata o qué frase está en juego.
 *
 * Los dobles son los MISMOS de pruebas/nube-crm.test.js (pruebas/
 * banco-nube-crm.js): un panel_empujar con las tres ramas del SQL y una
 * pestaña de mentira con el contrato de sello de crm.html. subir.html y
 * crm.html corren DE VERDAD en un vm, como en lo-mio-encima.test.js y
 * banco-panel.js.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const N = require('../panel/nube.js');
const {
  RAIZ, KEY, ESPEJO, SELLO, ESTADO, DUENO, clon, comoJsonb, fnv, pestana, montar, socio, credito,
  cartera, leerDisco, espejoDisco, estadoDisco, congeladas, sembrar, invariante
} = require('./banco-nube-crm.js');

const tick = () => new Promise(r => setImmediate(r));

/* ======================================================================== */
describe('plata 1 · el espejo no renace encima de una cartera que cambió durante el viaje', () => {

  test('otra pestaña guarda su cartera vieja MIENTRAS el pedazo sube: el cobro sigue en la nube', async () => {
    const m = montar({ db: cartera(3, 2) });
    await sembrar(m);
    /* La pestaña B, olvidada desde antes del cobro, con la cartera en memoria. */
    const B = pestana(m.alm, 'B');
    const viejaB = B.leer();
    /* Joan cobra C en el P1 en la pestaña A. */
    const db = m.tab.leer();
    db.prestamos.find(p => p.id === 'P1').abonos.push({ fecha: '2026-10-01', monto: 77777 });
    m.tab.guardar(db);
    /* Mientras el pedazo con P1 va y vuelve, B guarda lo suyo encima. */
    const original = m.srv.empujar;
    let carrera = false;
    m.srv.empujar = (d, l) => {
      const r = original(d, l);
      if (!carrera && (l.creditos || []).some(f => f.id === 'P1')) { carrera = true; B.guardar(viejaB); }
      return r;
    };
    await m.C.vuelta(true);
    assert.ok(carrera, 'la carrera no ocurrió: la prueba no midió nada');
    assert.equal(m.alm.getItem(ESPEJO), null,
      'el espejo renació con P1 encima de la cartera vieja: la próxima subida pisa el cobro con la revisión buena');
    /* La pestaña B también sube sola: tiene el sello y su NubeCRM corre. */
    const mB = montar({ alm: m.alm, srv: m.srv, tab: B });
    await mB.C.vuelta(false);
    const abonos = m.srv.creditos.P1.datos.abonos.map(a => a.monto);
    assert.ok(abonos.includes(77777), 'el cobro de 77.777 desapareció de la nube sin choque: ' + JSON.stringify(abonos));
    assert.equal(mB.C.estado().cinta.fase, 'falta-emparejar');
  });

  test('plata 9 · la pestaña que pierde el sello a mitad de subida suelta su latido «en vuelta»', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const B = pestana(m.alm, 'B');
    const viejaB = B.leer();
    const db = m.tab.leer(); db.prestamos[0].abonos.push({ fecha: '2026-10-01', monto: 1 }); m.tab.guardar(db);
    const original = m.srv.empujar;
    m.srv.empujar = (d, l) => { const r = original(d, l); B.guardar(viejaB); return r; };
    await m.C.vuelta(true);
    const d = JSON.parse(m.alm.getItem(DUENO) || '{}');
    assert.ok(!(d.id === 'A' && d.enVuelta), 'quedó {id:A, enVuelta:true}: la pestaña B esperaría 150 s a una subida que no existe');
  });
});

/* ======================================================================== */
describe('plata 2 · un borrado que no alcanzó a subir sale igual al emparejar', () => {

  function borrarP3SinSubir(m) {
    const db = m.tab.leer();
    db.prestamos = db.prestamos.filter(p => p.id !== 'P3');
    db.nubeBorrados = [{ tabla: 'creditos', id: 'P3', cuando: '2026-10-01' }];
    m.tab.guardar(db);
    /* Antes de los 90 s el espejo se suelta (cargar una base, importar, traer). */
    m.alm.removeItem(ESPEJO);
  }

  test('lo último lo escribió un computador: se borra en la nube, y sin datos', async () => {
    const m = montar({ db: cartera(3, 2) });
    await sembrar(m);
    borrarP3SinSubir(m);
    await m.C.emparejar();
    assert.match(m.vent.modal.h, /Borradas acá y vivas en la nube · 1/, 'el emparejamiento no le dice a Joan que P3 se va a borrar allá');
    await m.C.confirmarEmparejar();
    assert.equal(m.srv.creditos.P3.borrado, true, 'P3 quedó VIVO en la nube: el celular lo sigue cobrando');
    assert.deepEqual(m.srv.creditos.P3.datos, {}, 'la ficha borrada se quedó con sus datos en la nube');
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
  });

  test('lo último lo escribió el celular: NO se borra a ciegas; queda en discusión y lo del celular intacto', async () => {
    const m = montar({ db: cartera(3, 2) });
    await sembrar(m);
    borrarP3SinSubir(m);
    m.srv.celular('creditos', 'P3', d => { d.montoRecibido = 44444; });
    await sembrar(m);
    assert.equal(m.srv.creditos.P3.borrado, false);
    assert.equal(m.srv.creditos.P3.datos.montoRecibido, 44444, 'se borró encima de lo que cobró el celular');
    assert.equal((congeladas(m.alm)['creditos|P3'] || {}).motivo, 'borrada-aca');
    assert.equal(m.C.estado().cinta.fase, 'congeladas', 'la cinta no dice que hay algo por decidir');
  });
});

/* ======================================================================== */
describe('crm 1 · el espejo heredado de subir.html no se cree sin emparejar', () => {

  /* El 30-sep Joan eligió «Mandar lo mío encima» en subir.html (antes del
     arreglo de la Etapa 0): el espejo quedó en la revisión 5 del servidor, con
     el abono de 30.000 del celular, y la cartera con solo su abono de 50.000. */
  function heredado() {
    const db = cartera(2, 1);
    const P0 = db.prestamos[0], P1 = db.prestamos[1];
    P0.abonos = [{ fecha: '2026-09-29', monto: 50000 }];
    P1.abonos = [{ fecha: '2026-09-20', monto: 10000 }, { fecha: '2026-09-30', monto: 20000 }];
    const m = montar({ db });
    const nubeP0 = N.sinFotos(Object.assign(clon(P0), { abonos: [{ fecha: '2026-09-28', monto: 30000 }] }));
    const nubeP1 = N.sinFotos(Object.assign(clon(P1), { abonos: [{ fecha: '2026-09-20', monto: 10000 }] }));
    const fila = (datos, revision, por) => ({ datos: comoJsonb(clon(datos)), revision, borrado: false,
      actualizado_por: por, actualizado_en: '2026-09-30T12:00:00Z' });
    m.srv.creditos.P0 = fila(nubeP0, 5, 'celular');
    m.srv.creditos.P1 = fila(nubeP1, 3, 'computador');
    db.socios.forEach(s => { m.srv.socios[s.id] = fila(N.sinFotos(s), 2, 'computador'); });
    const esp = N.espejoVacio();
    esp.creditos.P0 = { revision: 5, json: N.jsonCanonico(nubeP0) };
    esp.creditos.P1 = { revision: 3, json: N.jsonCanonico(nubeP1) };
    db.socios.forEach(s => { esp.socios[s.id] = { revision: 2, json: N.jsonCanonico(N.sinFotos(s)) }; });
    m.alm.setItem(ESPEJO, JSON.stringify(esp));
    return m;
  }

  test('sin emparejar no sube nada, aunque el espejo tenga filas', async () => {
    const m = heredado();
    await m.C.vuelta(false);
    assert.equal(m.srv.lotes.length, 0, 'subió con un espejo que nadie comparó');
    assert.deepEqual(m.srv.creditos.P0.datos.abonos.map(a => a.monto), [30000]);
    assert.equal(m.C.estado().cinta.fase, 'falta-emparejar');
  });

  test('al emparejar: lo que le falta a la cartera se congela y SALE del espejo; lo que solo agrega, sube', async () => {
    const m = heredado();
    await sembrar(m);
    assert.deepEqual(m.srv.creditos.P0.datos.abonos.map(a => a.monto), [30000], 'el abono del celular murió');
    assert.ok(congeladas(m.alm)['creditos|P0'], 'P0 no quedó en discusión');
    assert.equal(espejoDisco(m.alm).creditos.P0, undefined,
      'P0 siguió en el espejo a la revisión de la nube: ☁ Subir la contaría como «solo cambié yo» y la mandaría igual');
    /* P1 solo AGREGÓ un abono: sube contra la revisión heredada y nada se pierde. */
    assert.deepEqual(m.srv.creditos.P1.datos.abonos.map(a => a.monto), [10000, 20000]);
    assert.equal(m.srv.creditos.P1.revision, 4);
    assert.equal(congeladas(m.alm)['creditos|P1'], undefined, 'P1 se congeló sin necesidad');
    invariante(m.alm, 'tras emparejar el espejo heredado');
  });
});

/* ======================================================================== */
describe('honesto 2 · el choque contra lo que este mismo computador escribió', () => {

  test('la respuesta se perdió: la vuelta siguiente lo anota y NO congela', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer(); db.prestamos[0].abonos.push({ fecha: '2026-10-01', monto: 5000 }); m.tab.guardar(db);
    const original = m.srv.empujar;
    let perdida = false;
    m.srv.empujar = (d, l) => {
      if (!perdida) { perdida = true; return original(d, l).then(() => Promise.reject({ motivo: 'Se cortó la respuesta.' })); }
      return original(d, l);
    };
    await m.C.vuelta(true);
    assert.equal(m.C.estado().cinta.fase, 'error');
    await m.C.vuelta(true);
    assert.deepEqual(congeladas(m.alm), {}, 'una ficha idéntica en los dos lados quedó «en discusión»');
    assert.equal(espejoDisco(m.alm).creditos.P0.revision, m.srv.creditos.P0.revision);
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
    invariante(m.alm, 'tras la respuesta perdida');
  });

  test('el espejo no cupo: la vuelta siguiente tampoco congela', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer(); db.socios[0].telefono = '3009999999'; m.tab.guardar(db);
    m.alm.llenas[ESPEJO] = true;
    await m.C.vuelta(true);
    assert.equal(m.C.estado().cinta.fase, 'espejo-no-cabe');
    delete m.alm.llenas[ESPEJO];
    await m.C.vuelta(true);
    assert.deepEqual(congeladas(m.alm), {});
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
  });

  test('pero si lo de allá lo escribió el CELULAR, es un choque de verdad y se congela', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    m.srv.celular('creditos', 'P0', d => { d.montoRecibido = 1; });
    const db = m.tab.leer(); db.prestamos[0].montoRecibido = 1; m.tab.guardar(db);
    await m.C.vuelta(true);
    assert.ok(congeladas(m.alm)['creditos|P0'], 'lo escrito por el celular no puede darse por «mío»');
  });
});

/* ======================================================================== */
describe('honesto 4 · el borrado viaja sin datos (Ley 1581)', () => {

  test('la ficha borrada no se queda entera en la nube', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer();
    db.prestamos = db.prestamos.filter(p => p.id !== 'P1');
    db.nubeBorrados = [{ tabla: 'creditos', id: 'P1', cuando: '2026-10-01' }];
    m.tab.guardar(db);
    await m.C.vuelta(true);
    const ultimo = m.srv.lotes[m.srv.lotes.length - 1];
    const fila = ultimo.creditos.find(f => f.id === 'P1');
    assert.equal(fila.borrado, true);
    assert.equal(fila.datos, null, 'el borrado viajó con la cédula, el teléfono y la plata adentro');
    assert.deepEqual(m.srv.creditos.P1.datos, {});
    assert.equal(m.srv.creditos.P1.borrado, true);
  });
});

/* ======================================================================== */
describe('crm 4 · un fallo de red con el navegador «en línea» vuelve a intentarse solo', () => {

  test('la cinta dice «suben solos tras 90 s» y hay un reloj de 90 s puesto', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer(); db.socios[0].telefono = '3001112233'; m.tab.guardar(db);
    m.srv.empujar = () => Promise.reject({ sin_red: true, motivo: 'Sin señal.' });
    m.timers.length = 0;
    await m.C.vuelta(false);
    assert.match(m.C.estado().cinta.l2, /suben solos tras 90 s/);
    assert.ok(m.timers.some(t => t.ms === 90000), 'la cinta promete un reintento que nadie programó');
  });
});

/* ======================================================================== */
describe('crm 5 / honesto 9 · sin sesión, la nube sigue teniendo lo subido', () => {

  test('la sesión se cierra a media subida: el motivo se queda y no dice «vive solo en este computador»', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer(); db.socios[0].telefono = '3001112233'; m.tab.guardar(db);
    m.srv.empujar = () => { m.estadoRed.conectado = false; return Promise.reject({ motivo: 'La sesión de la nube venció.' }); };
    await m.C.vuelta(false);
    await m.C.vuelta(false);
    const c = m.C.estado().cinta;
    assert.equal(c.fase, 'sin-conectar');
    assert.doesNotMatch(c.l2, /vive solo en este computador/, 'la nube tiene todo lo de antes y la cinta dice que no');
    assert.match(c.l2, /La nube tiene lo que subiste hasta/);
    assert.match(c.l2, /La sesión de la nube venció/, 'el motivo se perdió en la vuelta siguiente');
    assert.equal(c.clase, 'ojo');
  });
});

/* ======================================================================== */
describe('honesto 6 · un sello que no se pudo escribir no inventa otra pestaña', () => {

  test('el disco guarda el sello ANTERIOR de esta misma pestaña: sube igual', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    /* guardar() escribe la cartera, pero el sello no cabe: queda el de antes. */
    const db = m.tab.leer(); db.socios[0].telefono = '3005550000';
    const t = JSON.stringify(db);
    m.alm.setItem(KEY, t);
    m.tab.mio = { v: ++m.tab.v, quien: 'A', largo: t.length, huella: fnv(t) };
    m.alm.llenas[SELLO] = true;
    await m.C.vuelta(true);
    assert.notEqual(m.C.estado().cinta.fase, 'otra-pestana', 'dice «sube la otra pestaña» y no hay otra');
    assert.equal(m.srv.socios.C0.datos.telefono, '3005550000', 'el cambio no subió');
  });

  test('sin sello en el disco y sin sitio para escribirlo: lo dice como es', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    m.alm.removeItem(SELLO);
    m.alm.llenas[SELLO] = true;
    await m.C.vuelta(true);
    const c = m.C.estado().cinta;
    assert.equal(c.fase, 'sello-no-cabe');
    assert.doesNotMatch(c.l1 + c.l2, /otra pestaña/i);
  });
});

/* ======================================================================== */
describe('honesto 7 y 8 · la cinta no tapa lo que espera', () => {

  test('sin señal y con una ficha en discusión, lo dice', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    m.srv.celular('creditos', 'P0', d => { d.montoRecibido = 1; });
    const db = m.tab.leer(); db.prestamos[0].pagado = true; m.tab.guardar(db);
    await m.C.vuelta(true);
    assert.ok(congeladas(m.alm)['creditos|P0']);
    m.estadoRed.enLinea = false;
    const c = m.C.estado().cinta;
    assert.equal(c.fase, 'sin-senal');
    assert.match(c.l2, /1 ficha en discusión/, 'sin señal la cinta escondía la ficha en discusión');
    assert.equal(c.clase, 'mal');
  });

  test('una fila sin id: «tu cartera GUARDADA está en la nube» no es cierto', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer(); db.prestamos.push({ socioId: 'C0', capital: 100000 }); m.tab.guardar(db);
    await m.C.vuelta(true);
    const c = m.C.estado().cinta;
    assert.notEqual(c.fase, 'al-dia');
    assert.match(c.l1, /1 fila sin id no sube/);
  });

  test('honesto 10 · el sí del freno no jura que siguen en la papelera', async () => {
    const m = montar({ db: cartera(8, 1) });
    await sembrar(m);
    const db = m.tab.leer();
    const fuera = ['C1', 'C2', 'C3', 'C4'];
    db.socios = db.socios.filter(s => !fuera.includes(s.id));
    db.prestamos = db.prestamos.filter(p => !fuera.includes(p.socioId));
    db.nubeBorrados = fuera.map(id => ({ tabla: 'socios', id }));
    m.tab.guardar(db);
    await m.C.vuelta(true);
    m.vent.confirmar = false;
    await m.C.accion();
    assert.ok(m.vent.confirmes.length, 'el freno no pidió el sí');
    assert.doesNotMatch(m.vent.confirmes[0], /ya están en la papelera/);
    assert.match(m.vent.confirmes[0], /ya los borraste/);
  });
});

/* ======================================================================== */
describe('el CRM de verdad (crm.html en el banco de pruebas)', () => {
  const { abrirPanel } = require('./banco-panel.js');
  const conNubeCRM = P => vm.runInContext(fs.readFileSync(path.join(RAIZ, 'panel', 'nube-crm.js'), 'utf8'), P.ctx, { filename: 'nube-crm.js' });
  const entrar = P => { P.ev('document.getElementById("pinInput").value = DB.config.pin'); P.ev('entrar()'); };

  test('plata 4 / crm 3 · cargar una base de prospectos NO suelta el espejo', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    P.ev('_selloDesdeDisco(false)');
    P.almacen[ESPEJO] = '{"socios":{"C0":{"revision":3,"json":"{}"}}}';
    P.elems.baseOrigen = { id: 'baseOrigen', value: 'Feria del barrio' };
    P.ev('_baseLeida = { archivo: "feria.csv", revision: { nuevos: [{ nombre: "Prospecto Uno", celular: "3001234567" }], senalesFinancieras: [] } }');
    P.ev('confirmarCargaBase()');
    assert.equal(JSON.parse(P.almacen[KEY]).prospectos.length, 1, 'la base no entró: la prueba no midió nada');
    assert.ok(P.almacen[ESPEJO], 'cargar una base soltó el espejo: toca emparejar otra vez y se congela lo del celular');
    assert.equal(JSON.parse(P.almacen[SELLO]).largo, P.almacen[KEY].length);
  });

  test('plata 6 · subir.html escribe la cartera: esta pestaña recarga, y su guardar() ya no la pisa', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    P.ev('_selloDesdeDisco(false)');
    const oyentes = {};
    P.ctx.addEventListener = (tipo, f) => { oyentes[tipo] = f; };
    entrar(P);
    assert.equal(typeof oyentes.storage, 'function', 'crm.html no escucha lo que escriben las otras páginas');
    P.ev('modal.classList.contains = () => false');
    P.almacen[ESPEJO] = '{"creditos":{"P0":{"revision":4,"json":"{}"}}}';
    /* subir.html aplica un abono del celular en P0 */
    const d = JSON.parse(P.almacen[KEY]);
    d.prestamos[0].abonos = [{ fecha: '2026-09-30', monto: 30000 }];
    P.almacen[KEY] = JSON.stringify(d);
    oyentes.storage({ key: KEY });
    P.ev('DB.socios[0].telefono = "3007770000"; guardar();');
    const despues = JSON.parse(P.almacen[KEY]);
    assert.deepEqual(despues.prestamos[0].abonos.map(a => a.monto), [30000], 'el guardar() de la pestaña vieja borró lo que aplicó subir.html');
    assert.equal(despues.socios[0].telefono, '3007770000');
    assert.ok(P.almacen[ESPEJO], 'se soltó el espejo aunque la pestaña ya había recargado');
  });

  test('plata 6 · con un modal abierto NO se recarga debajo de Joan', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    P.ev('_selloDesdeDisco(false)');
    const oyentes = {};
    P.ctx.addEventListener = (tipo, f) => { oyentes[tipo] = f; };
    entrar(P);
    P.ev('modal.classList.contains = () => true');
    P.ev('DB.socios[0].nombre = "a medio escribir"');
    const d = JSON.parse(P.almacen[KEY]); d.socios[1].telefono = '3000000002'; P.almacen[KEY] = JSON.stringify(d);
    oyentes.storage({ key: KEY });
    assert.equal(P.ev('DB.socios[0].nombre'), 'a medio escribir', 'recargó debajo de un formulario abierto');
  });

  test('crm 6 / honesto 14 · importar un respaldo sella la cartera como de ESTA pestaña', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    conNubeCRM(P);
    entrar(P);
    const respaldo = JSON.stringify(cartera(3, 1));
    P.ctx.__archivo = { target: { files: [{ texto: respaldo }], value: '' } };
    P.ev('importar(__archivo)');
    const s = JSON.parse(P.almacen[SELLO] || 'null');
    assert.ok(s, 'importar() dejó la cartera sin sello: la cinta culpa a «otra pestaña»');
    assert.equal(s.quien, P.ev('_TAB'));
    assert.equal(s.largo, P.almacen[KEY].length);
    assert.equal(P.almacen[ESPEJO], undefined, 'importar() tiene que seguir soltando el espejo');
  });

  test('plata 8 / honesto 1 y 11 · la barra no manda a ⬇ Traer en este computador, y nombra bien lo que no viaja', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    conNubeCRM(P);
    entrar(P);
    const barra = P.elems.nubeBarra.innerHTML;
    assert.doesNotMatch(barra, /llega a este computador con ⬇ Traer/, 'Traer reemplaza la cartera entera: fotos, papelera y configuración se van');
    assert.match(barra, /☁ Subir \(paso 6/);
    assert.match(barra, /OTRO computador/);
    assert.doesNotMatch(barra, /los contactos de la Ley 2300/, 'las gestiones que cuenta la Ley 2300 SÍ viajan');
    assert.match(barra, /registro de WhatsApp del equipo/);
  });
});

/* ======================================================================== */
/* subir.html de verdad, con el mismo montaje que lo-mio-encima.test.js. */
function abrirSubir(nube) {
  const html = fs.readFileSync(path.join(RAIZ, 'panel', 'subir.html'), 'utf8');
  const elems = {};
  const elem = id => (elems[id] = elems[id] || { id, value: '', checked: false, textContent: '',
    innerHTML: '', dataset: {}, style: {}, disabled: false, title: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, setAttribute() {}, focus() {}, remove() {} });
  const doc = { getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('nuevo'), addEventListener() {}, body: elem('body'),
    documentElement: elem('html'), title: '' };
  const almacen = {};
  const ctx = { console, document: doc, alert() {}, confirm: () => true, prompt: () => null,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: k => { delete almacen[k]; } },
    location: { href: 'http://localhost/panel/subir.html', hash: '', pathname: '/panel/subir.html', search: '' },
    history: { replaceState() {} }, navigator: { userAgent: 'node' },
    fetch: () => Promise.reject(new Error('sin red')), setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}, TextEncoder, TextDecoder, URL, Intl, Date, Math, JSON,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'), Blob: class {}, FileReader: class {} };
  ctx.window = ctx; ctx.self = ctx;
  ctx.NubeTuGarantia = nube || N;
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.PuenteTuGarantia = require(path.join(RAIZ, 'app', 'puente.js'));
  vm.createContext(ctx);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'subir#' + i }));
  const ev = e => vm.runInContext(e, ctx, { filename: 'banco' });
  return { ev, ctx, almacen, elems };
}

describe('subir.html y el CRM que sube solo', () => {
  const credP = (id, monto) => ({ id, socioId: 's1', capital: 100000, abonos: monto ? [{ fecha: '2026-10-01', monto }] : [] });

  test('plata 3 · terminoLaSubida no resucita un espejo que el CRM soltó a propósito', async () => {
    const S = abrirSubir();
    const esp = N.espejoVacio();
    esp.creditos.P1 = { revision: 1, json: N.jsonCanonico(credP('P1')) };
    S.almacen[KEY] = JSON.stringify({ socios: [], prestamos: [credP('P1', 5)] });
    S.almacen[ESPEJO] = JSON.stringify(esp);
    S.ev('E.db = leerDB(); E.espejo = leerEspejo();');
    S.ctx.__u = [{ tabla: 'creditos', fila: { id: 'P1', datos: credP('P1', 5), revision_base: 1, borrado: false } }];
    S.ev('E.unidades = __u; E.siguiente = 1; E.aplicados = 1; E.choquesSubida = []; E.revisionesSubida = [{tabla:"creditos", id:"P1", revision:2}];');
    /* mientras subía, Joan importó un respaldo en el CRM: espejo fuera */
    delete S.almacen[ESPEJO];
    S.ev('terminoLaSubida()');
    await tick();
    assert.equal(S.almacen[ESPEJO], undefined,
      'subir.html resucitó el espejo encima de una cartera importada: la subida siguiente del CRM pisa la nube');
  });

  test('plata 5 · lo que el CRM subió mientras subir.html estaba abierto no se devuelve a una revisión vieja', async () => {
    const S = abrirSubir();
    const esp = N.espejoVacio();
    esp.creditos.P1 = { revision: 1, json: N.jsonCanonico(credP('P1')) };
    esp.creditos.P2 = { revision: 1, json: N.jsonCanonico(credP('P2')) };
    S.almacen[KEY] = JSON.stringify({ socios: [], prestamos: [credP('P1', 5), credP('P2', 7)] });
    S.almacen[ESPEJO] = JSON.stringify(esp);
    S.ev('E.db = leerDB(); E.espejo = leerEspejo();');
    /* el CRM sube P2 por su cuenta: el espejo del disco pasa a la revisión 2 */
    const enDisco = JSON.parse(S.almacen[ESPEJO]);
    enDisco.creditos.P2 = { revision: 2, json: N.jsonCanonico(credP('P2', 7)) };
    S.almacen[ESPEJO] = JSON.stringify(enDisco);
    S.ev('alEscribirOtraPagina({ key: LLAVE_ESPEJO })');
    assert.equal(S.ev('E.panelEscribio'), true, 'subir.html no se enteró de que el CRM subió');
    /* y aunque terminara una subida suya de P1, el P2 del CRM se queda */
    S.ctx.__u = [{ tabla: 'creditos', fila: { id: 'P1', datos: credP('P1', 5), revision_base: 1, borrado: false } }];
    S.ev('E.unidades = __u; E.siguiente = 1; E.aplicados = 1; E.choquesSubida = []; E.revisionesSubida = [{tabla:"creditos", id:"P1", revision:2}];');
    S.ev('terminoLaSubida()');
    await tick();
    const final = JSON.parse(S.almacen[ESPEJO]);
    assert.equal(final.creditos.P2.revision, 2, 'subir.html devolvió el P2 del CRM a la revisión 1: choque falso y ficha congelada');
    assert.equal(final.creditos.P1.revision, 2);
  });

  test('plata 5 · anotar lo aplicado se hace sobre el espejo del DISCO', () => {
    const S = abrirSubir();
    const esp = N.espejoVacio();
    esp.creditos.P2 = { revision: 1, json: N.jsonCanonico(credP('P2')) };
    S.almacen[KEY] = JSON.stringify({ socios: [], prestamos: [credP('P2', 7)] });
    S.almacen[ESPEJO] = JSON.stringify(esp);
    S.ev('E.db = leerDB(); E.espejo = leerEspejo();');
    const enDisco = JSON.parse(S.almacen[ESPEJO]);
    enDisco.creditos.P2 = { revision: 2, json: N.jsonCanonico(credP('P2', 7)) };
    S.almacen[ESPEJO] = JSON.stringify(enDisco);
    S.ev('anotarEnElEspejo([], [], {socios:0, creditos:0, respaldados:0, ajustes:0})');
    assert.equal(JSON.parse(S.almacen[ESPEJO]).creditos.P2.revision, 2);
  });

  test('plata 5 · traer() vuelve a leer el espejo del disco antes de decidir', async () => {
    const paq = { completo: true, servidor_ahora: null, socios: [], respaldados: [], ajustes: [],
      creditos: [{ id: 'P2', datos: credP('P2', 7), revision: 2, borrado: false }] };
    const S = abrirSubir(Object.assign({}, N, { traer: () => Promise.resolve(clon(paq)) }));
    const esp = N.espejoVacio();
    esp.creditos.P2 = { revision: 1, json: N.jsonCanonico(credP('P2')) };
    S.almacen[KEY] = JSON.stringify({ socios: [], prestamos: [credP('P2', 7)] });
    S.almacen[ESPEJO] = JSON.stringify(esp);
    S.ev('E.db = leerDB(); E.espejo = leerEspejo();');
    const enDisco = JSON.parse(S.almacen[ESPEJO]);
    enDisco.creditos.P2 = { revision: 2, json: N.jsonCanonico(credP('P2', 7)) };
    S.almacen[ESPEJO] = JSON.stringify(enDisco);
    S.ev('traer()');
    await tick(); await tick();
    const plan = JSON.parse(S.ev('JSON.stringify({c: E.plan.choques.length, s: E.plan.sinCambio})'));
    assert.deepEqual(plan, { c: 0, s: 1 }, 'con el espejo de memoria, lo que subió el CRM salía como choque');
  });

  test('plata 7 / honesto 3 · borrada allá, idéntica y viva acá: va a los choques, no a «sin novedad»', () => {
    const S = abrirSubir();
    S.ctx.__db = { socios: [{ id: 's1', nombre: 'Ana' }], prestamos: [], respaldados: [] };
    S.ctx.__paq = { socios: [{ id: 's1', datos: { id: 's1', nombre: 'Ana' }, revision: 3, borrado: true }], creditos: [], respaldados: [], ajustes: [] };
    const plan = JSON.parse(S.ev('JSON.stringify(planDeBajada(__db, __paq, {}, true))'));
    assert.equal(plan.choques.length, 1, 'la ficha congelada por el CRM no aparecía en ningún sitio donde decidirla');
    assert.equal(plan.sinCambio, 0);
  });

  test('honesto 13 · «lo mío» de una ficha que acá no existe dice QUÉ botón la borra', () => {
    const S = abrirSubir();
    S.ctx.__it = { tabla: 'creditos', id: 'P9', local: null, borrado: false, fila: { id: 'P9' } };
    const t = S.ev('queHaceLoMio(__it)');
    assert.doesNotMatch(t, /próxima subida/, 'el CRM sube solo pero nunca deduce un borrado: «la próxima subida» no lo manda');
    assert.match(t, /«Subir a la nube» en esta página/);
  });
});

/* ======================================================================== */
describe('honesto 12 · el celular no estira una respuesta vieja', () => {
  const FUENTE = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8').replace(/\r\n/g, '\n');
  const i = FUENTE.indexOf('\nfunction textoSubidaPC(');
  const j = FUENTE.indexOf('\n}\n', i);
  const textoSubidaPC = new Function(FUENTE.slice(i + 1, j + 3) + '\nreturn textoSubidaPC;')();
  const AHORA = Date.UTC(2026, 9, 1, 17, 0, 0);

  test('preguntó hace 3 h y no pudo volver a preguntar: dice a qué hora era cierto', () => {
    const s = { ultima: new Date(AHORA - 5 * 60000).toISOString(), servidorAhora: new Date(AHORA).toISOString(), leidoEn: AHORA };
    const t = textoSubidaPC(s, AHORA + 3 * 3600000);
    assert.doesNotMatch(t, /subió hace 3 h/, 'la respuesta de las 17:00 se estiró hasta las 20:00');
    const h = new Date(AHORA);
    assert.equal(t, 'A las ' + h.getHours() + ':' + String(h.getMinutes()).padStart(2, '0') +
      ' (lo último que supe), el computador había subido hace 5 min.');
  });
});

/* ======================================================================== */
describe('honesto 5 · traer.html ya no dice que el CRM no sube', () => {
  test('las frases que la Etapa 1 volvió falsas', () => {
    /* Lo que ve Joan, no los comentarios que cuentan lo que decía antes. */
    const T = fs.readFileSync(path.join(RAIZ, 'panel', 'traer.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(T, /no sabe subir/);
    assert.doesNotMatch(T, /<b>no sube solo<\/b>/);
    assert.doesNotMatch(T, /en el computador de Joan, donde siempre/);
  });
});
