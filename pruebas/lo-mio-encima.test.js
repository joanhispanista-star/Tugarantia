/* ===========================================================================
 * «MANDAR LO MÍO ENCIMA» — el botón que movía el espejo y no la cartera
 * 1 de octubre de 2026. Etapa 0, paso 4, de RECETA-NUBE-CRM.md.
 *
 * QUÉ PASABA. En el paso 7 de panel/subir.html, Joan elige «Mandar lo mío
 * encima» en un choque. Al aplicar, el ESPEJO avanzaba a la revisión del
 * servidor (paqueteCrudoDe(elegidos.concat(marcadosComoMio()))), pero la
 * CARTERA no se tocaba: la fusión de listas (fusionarConLoMio) solo corría para
 * «Dejar lo de la nube». O sea que el espejo juraba «ya conozco la revisión 5»
 * mientras la cartera seguía sin los abonos que solo estaban en la nube. La
 * subida siguiente mandaba la fila de acá CONTRA LA REVISIÓN BUENA, el servidor
 * entraba por `elsif v_rev = v_base` (base/20260811_panel_nube.sql:448) y la
 * escribía sin choque: el abono cobrado en la calle desaparecía en los dos
 * aparatos. Y si lo único que había en el paso 7 eran fichas marcadas «lo mío»,
 * aplicar() ni corría («No hay nada para aplicar»).
 *
 * LA CURA, las dos cosas o ninguna: para cada fila marcada «lo mío», PRIMERO se
 * escribe en la cartera fusionarFila(lo mío, lo de la nube) —lo mío gana en lo
 * que se pisa; las listas que solo suman traen lo del otro lado—, y SOLO si ese
 * setItem entró avanza el espejo a la revisión del servidor.
 *
 * Estas pruebas corren subir.html DE VERDAD contra un doble de localStorage: el
 * defecto vivía en el pegamento entre dos funciones correctas, y un centinela
 * de texto no lo habría visto.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const N = require('../panel/nube.js');
const KEY = 'joan_socios_v1';
const LLAVE_ESPEJO = 'joan_panel_espejo_pc';

/* El mismo montaje que abrirSubir() de pruebas/nube.test.js, con el almacén a
   la vista y un interruptor para que el navegador diga «no cupo» en una llave. */
function abrirSubir(opciones) {
  const o = opciones || {};
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
  const escrituras = [];
  const ctx = { console, document: doc, alert() {}, confirm: () => true, prompt: () => null,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => {
        if (o.noCabe === k) {
          const e = new Error('no cupo'); e.name = 'QuotaExceededError'; throw e;
        }
        escrituras.push(k);
        almacen[k] = String(v);
      },
      removeItem: k => { delete almacen[k]; } },
    location: { href: 'http://localhost/panel/subir.html', hash: '',
                pathname: '/panel/subir.html', search: '' },
    history: { replaceState() {} }, navigator: { userAgent: 'node' },
    fetch: () => Promise.reject(new Error('sin red')), setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}, TextEncoder, TextDecoder, URL, Intl,
    Date, Math, JSON,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'), Blob: class {}, FileReader: class {} };
  ctx.window = ctx; ctx.self = ctx;
  ctx.NubeTuGarantia = N;
  ctx.MotorReglas = require(path.join(RAIZ, 'app', 'motor.js'));
  ctx.PuenteTuGarantia = require(path.join(RAIZ, 'app', 'puente.js'));
  vm.createContext(ctx);
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'subir#' + i }));
  const ev = e => vm.runInContext(e, ctx, { filename: 'banco' });
  /* El respaldo de verdad baja un archivo con Blob y un <a>; acá no hay
     navegador. Lo que se prueba es lo que pasa DESPUÉS del respaldo. */
  ev('bajarRespaldo = function(){ E.respaldoHecho = true; return true; }');
  return { ev, ctx, almacen, escrituras, elems };
}

/* Deja subir.html exactamente en el paso 7: cartera y espejo leídos del disco,
   lo que trajo la nube, el plan de bajada armado por subir.html mismo, y las
   decisiones de Joan. */
function enElPaso7(S, paquete, decisiones) {
  S.ctx.__paq = paquete;
  S.ctx.__dec = decisiones;
  S.ev('E.db = leerDB(); E.espejo = leerEspejo(); E.panelEscribio = false;' +
       'E.paquete = __paq; E.plan = planDeBajada(E.db, E.paquete, E.espejo, true);' +
       'E.decisiones = __dec;');
  return JSON.parse(S.ev('JSON.stringify({aplicar: E.plan.aplicar.length, choques: E.plan.choques.map(function(it){ return it.tabla+"|"+it.id; })})'));
}

const fila = (id, datos, revision, extra) => Object.assign(
  { id, datos, revision, borrado: false, actualizado_en: '2026-10-01T15:00:00Z',
    actualizado_por: 'celular' }, extra || {});

/* EL MARTES DE COBRO, otra vez. A las 8:00 los dos aparatos estaban en la
   revisión 3. En la calle, el celular cobró el abono B y le subió la revisión a
   5. En el computador, Joan registró el abono A (con la foto del comprobante) y
   corrigió la nota. Las dos versiones chocan; Joan aprieta «Mandar lo mío
   encima» porque la nota buena es la suya. */
function martes() {
  const comun = { id: 'c1', socioId: 's1', numero: 7, capital: 200000, total: 240000,
    pagado: false, cicloActual: '2026-10-15', prorrogas: [], condonaciones: [],
    abonosCapital: [] };
  const alas8 = Object.assign({}, comun, { nota: 'de las 8', abonos: [], comprobantes: [] });
  const mio = Object.assign({}, comun, { nota: 'la de Joan',
    abonos: [{ fecha: '2026-10-01', monto: 50000 }],
    comprobantes: [{ fecha: '2026-10-01', tipo: 'abono', monto: 50000, foto: 'FOTO-A' }] });
  const suyo = Object.assign({}, comun, { nota: 'del celular',
    abonos: [{ fecha: '2026-09-30', monto: 30000 }],
    comprobantes: [{ fecha: '2026-09-30', tipo: 'abono', monto: 30000 }] });
  const socio = { id: 's1', numero: 3, nombre: 'Cliente de prueba', cedulaFrenteFoto: 'F1',
    selfieFoto: 'F3', gestiones: [] };
  const espejo = N.espejoVacio();
  espejo.socios.s1 = { revision: 2, json: N.jsonCanonico(N.sinFotos(socio)) };
  espejo.creditos.c1 = { revision: 3, json: N.jsonCanonico(alas8) };
  return { mio, suyo, socio, espejo,
    cartera: { socios: [socio], prestamos: [mio], respaldados: [],
               config: { pin: '1234' }, contadores: { cliente: 3, credito: 7, respaldado: 0 } },
    paquete: { completo: false, servidor_ahora: '2026-10-01T15:00:05Z',
               socios: [], creditos: [fila('c1', suyo, 5)], respaldados: [], ajustes: [] } };
}

function montar(m, opciones) {
  const S = abrirSubir(opciones);
  S.almacen[KEY] = JSON.stringify(m.cartera);
  S.almacen[LLAVE_ESPEJO] = JSON.stringify(m.espejo);
  return S;
}

describe('«Mandar lo mío encima» escribe la cartera ANTES de mover el espejo (1-oct-2026)', () => {

  test('LA CARTERA queda con el abono de acá Y el de la nube, y el espejo con la revisión del servidor', () => {
    const m = martes();
    const S = montar(m);
    const plan = enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    assert.deepEqual(plan.choques, ['creditos|c1'], 'el montaje no produjo el choque que se quería probar');
    assert.equal(plan.aplicar, 0, 'en el paso 7 solo hay una ficha marcada «lo mío», y nada más');

    S.ev('aplicar()');

    const cartera = JSON.parse(S.almacen[KEY]);
    const c1 = cartera.prestamos.find(p => p.id === 'c1');
    const abonos = (c1.abonos || []).map(a => a.fecha + ':' + a.monto).sort();
    assert.deepEqual(abonos, ['2026-09-30:30000', '2026-10-01:50000'],
      'la cartera no tiene los DOS abonos: el que solo estaba en la nube se pierde en la subida siguiente');
    assert.equal(c1.nota, 'la de Joan', 'Joan eligió lo suyo y en lo que se pisa ganó la nube');
    assert.equal((c1.comprobantes || []).length, 2, 'falta un comprobante de alguno de los dos lados');
    const conFoto = c1.comprobantes.find(c => c.fecha === '2026-10-01');
    assert.equal(conFoto && conFoto.foto, 'FOTO-A', 'la foto del comprobante de acá se perdió al fusionar');

    const espejo = JSON.parse(S.almacen[LLAVE_ESPEJO]);
    assert.equal(espejo.creditos.c1.revision, 5, 'el espejo no avanzó a la revisión del servidor');
    assert.equal(espejo.creditos.c1.json, N.jsonCanonico(m.suyo),
      'el espejo tiene que decir lo que HAY en la nube, no lo que hay acá');

    /* Y el orden: primero la cartera, después el espejo. */
    const iCartera = S.escrituras.indexOf(KEY);
    const iEspejo = S.escrituras.lastIndexOf(LLAVE_ESPEJO);
    assert.ok(iCartera > -1 && iEspejo > iCartera,
      'el espejo se escribió antes que la cartera (o la cartera no se escribió): ' + S.escrituras.join(', '));
  });

  test('EL HUECO TAL COMO ERA: con otra ficha que baja sin discutir, el espejo avanzaba y la cartera no', () => {
    /* Con algo más para aplicar, aplicar() sí corría: escribía la ficha nueva,
       movía el espejo de c1 a la revisión 5 y dejaba c1 en la cartera sin el
       abono B. Medido el 1-oct-2026 contra el código de antes de esta cura:
       espejo en 5, cartera con un solo abono. */
    const m = martes();
    m.paquete.socios = [fila('s2', { id: 's2', numero: 4, nombre: 'Nuevo del celular' }, 1)];
    const S = montar(m);
    const plan = enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    assert.equal(plan.aplicar, 1);
    S.ev('aplicar()');
    const cartera = JSON.parse(S.almacen[KEY]);
    assert.ok(cartera.socios.some(s => s.id === 's2'), 'la ficha que bajaba sin discutir no se escribió');
    const espejo = JSON.parse(S.almacen[LLAVE_ESPEJO]);
    const c1 = cartera.prestamos.find(p => p.id === 'c1');
    assert.equal(espejo.creditos.c1.revision, 5);
    assert.equal(c1.abonos.length, 2,
      'el espejo avanzó a la revisión 5 y la cartera se quedó sin el abono de la nube: la subida ' +
      'siguiente lo borra con la revisión buena y sin choque');
  });

  test('la subida siguiente sale contra la revisión 5 y LLEVA el abono de la nube', () => {
    /* Esto es lo que de verdad importa: lo que el servidor acepta por
       `v_rev = v_base` tiene que traer adentro el abono B. Antes llevaba solo
       el A, y el servidor lo escribía igual. */
    const m = martes();
    const S = montar(m);
    enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    S.ev('aplicar()');

    const lote = N.armarLote(JSON.parse(S.almacen[KEY]), JSON.parse(S.almacen[LLAVE_ESPEJO]));
    const c1 = lote.creditos.find(f => f.id === 'c1');
    assert.ok(c1, 'la ficha de Joan no sale en la subida: «lo mío» no llegaría nunca a la nube');
    assert.equal(c1.revision_base, 5);
    assert.equal(c1.borrado, false);
    const montos = c1.datos.abonos.map(a => a.monto).sort();
    assert.deepEqual(montos, [30000, 50000],
      'la fila que el servidor va a aceptar sin choque NO trae el abono cobrado en la calle');
    assert.equal(c1.datos.comprobantes.some(c => 'foto' in c), false, 'una foto se iba a ir a la nube');
  });

  test('si la cartera NO CUPO, el espejo queda byte por byte como estaba', () => {
    /* Las dos cosas o ninguna. Un espejo que avanza sin la cartera es
       exactamente el defecto que se está curando. */
    const m = martes();
    const S = montar(m, { noCabe: KEY });
    const antes = S.almacen[LLAVE_ESPEJO];
    const carteraAntes = S.almacen[KEY];
    enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    S.ev('aplicar()');
    /* Primero, que de verdad se llegó al setItem: sin esto la prueba pasaría
       igual con un aplicar() que se sale antes de tiempo. */
    assert.match(S.elems.msg6.innerHTML, /No cupo/, 'aplicar() no llegó a intentar escribir la cartera');
    assert.equal(S.almacen[LLAVE_ESPEJO], antes, 'el espejo avanzó aunque la cartera no se escribió');
    assert.equal(S.almacen[KEY], carteraAntes);
  });

  test('si la fusión revienta, no se escribe NADA', () => {
    /* Caer a «lo de acá a secas» sería volver al defecto con otro nombre: el
       espejo avanzaría sin las listas de la nube adentro. */
    const m = martes();
    const S = montar(m);
    const antes = { c: S.almacen[KEY], e: S.almacen[LLAVE_ESPEJO] };
    enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    S.ev('NUBE = Object.assign({}, NUBE, { fusionarFila: function(){ throw new Error("rota"); } })');
    S.ev('aplicar()');
    assert.match(S.elems.msg6.innerHTML, /No apliqué nada/, 'no se le dijo a Joan que no se aplicó');
    assert.equal(S.almacen[KEY], antes.c, 'se escribió la cartera con una fusión rota');
    assert.equal(S.almacen[LLAVE_ESPEJO], antes.e, 'el espejo avanzó con una fusión rota');
  });

  test('una FICHA DE SOCIO marcada «lo mío» conserva sus fotos y gana las gestiones de la nube', () => {
    /* Lo que baja nunca trae fotos. Si la ficha escrita fuera la de la nube con
       lo de Joan encima pero sin devolverle las fotos, la cédula y la selfie
       —dato biométrico, Ley 1581— desaparecerían del único aparato que las tiene. */
    const m = martes();
    const nubeSocio = { id: 's1', numero: 3, nombre: 'Otro nombre',
      gestiones: [{ fecha: '2026-09-30', canal: 'llamada', plantilla: 'cobro' }] };
    m.paquete.creditos = [];
    m.paquete.socios = [fila('s1', nubeSocio, 9)];
    m.cartera.socios[0].nombre = 'Nombre de Joan';
    const S = montar(m);
    const plan = enElPaso7(S, m.paquete, { 'socios|s1': 'mio' });
    assert.deepEqual(plan.choques, ['socios|s1']);
    S.ev('aplicar()');
    const s1 = JSON.parse(S.almacen[KEY]).socios.find(s => s.id === 's1');
    assert.equal(s1.cedulaFrenteFoto, 'F1', 'se perdió la foto de la cédula');
    assert.equal(s1.selfieFoto, 'F3', 'se perdió la selfie');
    assert.equal(s1.nombre, 'Nombre de Joan');
    assert.equal(s1.gestiones.length, 1, 'la gestión que solo estaba en la nube no entró');
    assert.equal(JSON.parse(S.almacen[LLAVE_ESPEJO]).socios.s1.revision, 9);
  });

  test('«Dejar lo de la nube» sigue igual: gana la nube y las listas se juntan', () => {
    const m = martes();
    const S = montar(m);
    enElPaso7(S, m.paquete, { 'creditos|c1': 'nube' });
    S.ev('aplicar()');
    const c1 = JSON.parse(S.almacen[KEY]).prestamos.find(p => p.id === 'c1');
    assert.equal(c1.nota, 'del celular');
    assert.equal(c1.abonos.length, 2);
    assert.equal(JSON.parse(S.almacen[LLAVE_ESPEJO]).creditos.c1.revision, 5);
  });

  test('una ficha BORRADA en la nube y marcada «lo mío» sigue viva en la cartera', () => {
    /* «Lo mío manda» sobre una ficha que el celular borró quiere decir «la
       quiero viva». Si el paquete llegara a aplicarPaquete con borrado:true,
       la cartera la tiraría — lo contrario de lo que Joan eligió. */
    const m = martes();
    m.paquete.creditos = [fila('c1', m.suyo, 5, { borrado: true })];
    const S = montar(m);
    enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    S.ev('aplicar()');
    const c1 = JSON.parse(S.almacen[KEY]).prestamos.find(p => p.id === 'c1');
    assert.ok(c1, 'Joan eligió lo suyo y la ficha desapareció de su cartera');
    assert.equal(c1.abonos.length, 2);
    /* Y la subida siguiente la revive en la nube contra la revisión buena. */
    const lote = N.armarLote(JSON.parse(S.almacen[KEY]), JSON.parse(S.almacen[LLAVE_ESPEJO]));
    const sube = lote.creditos.find(f => f.id === 'c1');
    assert.equal(sube && sube.revision_base, 5);
    assert.equal(sube.borrado, false);
  });

  test('una ficha que acá ya NO existe no se resucita en la cartera', () => {
    /* Joan la borró en el computador y el celular la tocó después: «lo mío»
       es el borrado. Meterle la de la nube sería deshacer lo que eligió. */
    const m = martes();
    m.cartera.prestamos = [];
    const S = montar(m);
    const plan = enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    assert.deepEqual(plan.choques, ['creditos|c1']);
    const carteraAntes = S.almacen[KEY];
    S.ev('aplicar()');
    const cartera = JSON.parse(S.almacen[KEY]);
    assert.equal(cartera.prestamos.some(p => p.id === 'c1'), false,
      'la ficha que Joan borró volvió a la cartera');
    assert.equal(S.almacen[KEY], carteraAntes, 'no había nada que escribir y se escribió la cartera igual');
    /* Y el espejo sí avanza: «lo mío» es el borrado, y tiene que salir contra
       la revisión buena en la subida siguiente, no chocar en bucle. */
    assert.equal(JSON.parse(S.almacen[LLAVE_ESPEJO]).creditos.c1.revision, 5);
    assert.match(S.elems.msg6.innerHTML, /No había nada que escribir/);
  });

  test('un AJUSTE que es lista («gestiones») marcado «lo mío» trae los elementos de la nube', () => {
    /* localAjuste de subir.html no conoce «gestiones» (Etapa 4, punto 6 de la
       receta), así que cualquier gestión de un asesor sale como choque. Si
       «lo mío» solo moviera el espejo, la subida siguiente mandaría la lista de
       acá contra la revisión buena y las gestiones del asesor desaparecerían. */
    const m = martes();
    m.cartera.gestiones = [{ id: 'G1', socio_id: 's1', nota: 'de acá' }];
    m.espejo.ajustes.gestiones = { revision: 1, json: N.jsonCanonico([]) };
    m.paquete.creditos = [];
    m.paquete.ajustes = [{ clave: 'gestiones', revision: 4,
      datos: [{ id: 'G2', socio_id: 's1', nota: 'del asesor' }] }];
    const S = montar(m);
    const plan = enElPaso7(S, m.paquete, { 'ajustes|gestiones': 'mio' });
    assert.deepEqual(plan.choques, ['ajustes|gestiones']);
    S.ev('aplicar()');
    const ids = JSON.parse(S.almacen[KEY]).gestiones.map(g => g.id).sort();
    assert.deepEqual(ids, ['G1', 'G2'], 'se perdió una gestión de alguno de los dos lados');
    assert.equal(JSON.parse(S.almacen[LLAVE_ESPEJO]).ajustes.gestiones.revision, 4);
  });

  test('un AJUSTE que es un valor entero («config») marcado «lo mío» NO se reemplaza por el de la nube', () => {
    /* aplicarPaquete pisa config entera con la de la nube (fusionarAjuste
       devuelve la entrante para toda clave sin identidad). Meter la fila de la
       nube en la escritura haría ganar a la nube justo cuando Joan eligió lo suyo. */
    const m = martes();
    m.cartera.config = { pin: '1234', tasaUsuraEA: 26.9 };
    m.espejo.ajustes.config = { revision: 1, json: N.jsonCanonico({ pin: '1234', tasaUsuraEA: 25 }) };
    m.paquete.creditos = [];
    m.paquete.ajustes = [{ clave: 'config', revision: 6, datos: { pin: '1234', tasaUsuraEA: 24 } }];
    const S = montar(m);
    enElPaso7(S, m.paquete, { 'ajustes|config': 'mio' });
    S.ev('aplicar()');
    assert.equal(JSON.parse(S.almacen[KEY]).config.tasaUsuraEA, 26.9,
      'Joan eligió su tasa y quedó la de la nube');
    assert.equal(JSON.parse(S.almacen[LLAVE_ESPEJO]).ajustes.config.revision, 6,
      'el espejo no avanzó: la tasa de Joan no subiría nunca, chocaría en bucle');
  });

  test('el botón Aplicar se enciende con solo fichas marcadas «lo mío»', () => {
    /* Antes quedaba apagado («!filasAAplicar().length») y la ficha volvía a
       chocar en cada subida sin que Joan pudiera hacer nada desde acá. */
    const m = martes();
    const S = montar(m);
    enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    S.ev('E.respaldoHecho = true; refrescarBotones();');
    assert.equal(S.elems.btnAplicar.disabled, false);
  });

  test('la tarjeta del choque ya no dice «No se toca nada acá» cuando sí se toca', () => {
    /* La interfaz no promete lo que el código no hace — tampoco al revés. */
    const m = martes();
    const S = montar(m);
    enElPaso7(S, m.paquete, { 'creditos|c1': 'mio' });
    const h = S.ev('tarjetaChoque(E.plan.choques[0], "b0")');
    assert.doesNotMatch(h, /No se toca nada acá/);
    assert.match(h, /se juntan/);
  });
});
