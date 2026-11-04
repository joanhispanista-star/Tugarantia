/* ===========================================================================
 * UNA PESTAÑA VIEJA NO BORRA UN COBRO — E1, 4-nov-2026
 *
 *   node --test pruebas/pestana-vieja.test.js
 *
 * Medido el 3-nov con el CRM de verdad en dos pestañas sobre el mismo
 * localStorage: la pestaña A cobra y guarda; la B tiene un cuadro abierto, así
 * que no se recarga sola (alEscribirOtraPagina espera), y cuando Joan guarda ese
 * cuadro escribe encima SU copia de antes. Abonos en el disco: 1 tras A, 0 tras
 * B, sin ningún aviso. Y como guardar() soltaba el espejo, A se recargaba
 * mostrando 0: el cobro desaparecía de los dos lados antes de los 30-90 s que
 * tarda en subir.
 *
 * LA REGLA NUEVA: si el disco no es lo que esta pestaña conoce, guardar() NO
 * escribe. Para, lo dice («Otra pestaña guardó. Esto no se guardó: recarga») y
 * ofrece el botón. Lo que estaba en el disco se queda como estaba, con el espejo
 * y el sello de quien lo escribió.
 *
 * Estas pruebas abren crm.html de verdad (banco-panel.js), dos veces sobre el
 * mismo almacén. La de dos pestañas en un Chrome de verdad vive fuera del
 * repositorio, porque abre un navegador sin ventana.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { montar, pestana, cartera, leerDisco, espejoDisco, sembrar, invariante, almacenDoble, KEY, ESPEJO, SELLO } = require('./banco-nube-crm.js');

const clon = v => JSON.parse(JSON.stringify(v));
const HOY = '2026-11-03T15:00:00';
const CARTERA = {
  config: { negocio: 'Tu Garantía', pin: '123456' }, contadores: { cliente: 2, credito: 1, respaldado: 0 },
  socios: [{ id: 'C1', nombre: 'Cliente Inventada', numero: 1, gestiones: [] }, { id: 'C2', nombre: 'Otro Inventado', numero: 2, gestiones: [] }],
  prestamos: [{ id: 'P1', numero: 1, socioId: 'C1', socioNombre: 'Cliente Inventada', capital: 500000, costoPct: 20, fechaDesembolso: '2026-10-20',
    fechaPago: '2026-11-15', cicloActual: '2026-11-15', pagado: false, prorrogas: [], abonosCapital: [], comprobantes: [] }]
};
const OTRA_PESTANA = /Otra pestaña guardó\. Esto no se guardó: recarga/;

/* Dos pestañas del mismo navegador. Lo que distingue a la B es que abrió ANTES de
   que la A cobrara y tiene un cuadro abierto (no se recarga sola). */
function dosPestanas() {
  const almacen = {};
  const A = abrirPanel({ almacen, ahora: HOY });
  A.cargarCartera(clon(CARTERA));
  A.ev('_selloDesdeDisco(true)');
  const B = abrirPanel({ almacen, ahora: HOY });
  B.ev('estoyOcupado = function () { return true; }');
  A.ev('estoyOcupado = function () { return false; }');
  almacen[ESPEJO] = JSON.stringify({ socios: { C1: { revision: 1, json: '{}' } }, creditos: {}, respaldados: {}, ajustes: {} });
  return { A, B, almacen };
}
/* El abono como lo hace la pantalla: abonarCapital lee el monto del campo de la hoja. */
function cobrar(P, id, monto) {
  P.ev("document.getElementById('abCap').value = " + JSON.stringify(String(monto)));
  P.ev('abonarCapital(' + JSON.stringify(id) + ", '2026-11-03')");
}
const abonosEnDisco = alm => JSON.parse(alm[KEY]).prestamos[0].abonosCapital;
const aviso = P => P.ev("_cajaOtraPestana ? _cajaOtraPestana.innerHTML : ''");

describe('una pestaña vieja no pisa lo que guardó otra', () => {
  test('LA MEDICIÓN: A cobra, B guarda su cuadro encima, y el cobro sigue en el disco', () => {
    const { A, B, almacen } = dosPestanas();
    cobrar(A, 'P1', 100000);
    assert.equal(abonosEnDisco(almacen).length, 1, 'A no alcanzó a guardar su abono');
    const conAbono = almacen[KEY];

    B.ev("DB.socios[1].gestiones.push({ fecha: '2026-11-03', canal: 'wa', plantilla: 'x' })");
    const r = B.ev('guardar()');

    assert.equal(r, false, 'guardar() dijo que guardó lo que no pudo guardar');
    assert.equal(abonosEnDisco(almacen).length, 1, 'la pestaña vieja borró el cobro');
    assert.equal(almacen[KEY], conAbono, 'la pestaña vieja le cambió algo al disco');
  });

  test('y lo dice en la pantalla, con el botón para recargar', () => {
    const { A, B } = dosPestanas();
    cobrar(A, 'P1', 100000);
    B.ev('guardar()');
    const t = aviso(B);
    assert.match(t, OTRA_PESTANA, 'no le dijo a Joan que eso no se guardó: ' + t);
    assert.match(t, /recargarPorOtraPestana\(\)/, 'el aviso no trae el botón');
    assert.match(t, />\s*Recargar\s*</, 'el botón no dice Recargar');
  });

  test('el botón recarga de verdad', () => {
    const { A, B } = dosPestanas();
    let veces = 0;
    B.ctx.location.reload = () => { veces++; };
    cobrar(A, 'P1', 100000);
    B.ev('guardar()');
    B.ev('recargarPorOtraPestana()');
    assert.equal(veces, 1);
  });

  test('tampoco suelta el espejo ni le quita el turno a quien cobró: lo de A sigue subiendo', () => {
    const { A, B, almacen } = dosPestanas();
    cobrar(A, 'P1', 100000);
    const sello = almacen[SELLO];
    B.ev('guardar()');
    assert.ok(almacen[ESPEJO], 'guardar() soltó el espejo aunque no escribió nada');
    assert.equal(almacen[SELLO], sello, 'la pestaña que no escribió se quedó con el sello');
    assert.equal(A.ev('_carteraAjena()'), false, 'la pestaña A ya no reconoce su propia cartera');
  });

  test('lo que no entró no se les sube a los clientes (historiales: sinGuardar), y al releer se suelta', () => {
    const { A, B } = dosPestanas();
    cobrar(A, 'P1', 100000);
    B.ev('guardar()');
    assert.equal(B.ev('_libroSinGuardar'), true, 'los historiales subirían lo que está solo en la memoria de B');
    B.ev('recargarSinReclamar()');
    assert.equal(B.ev('_libroSinGuardar'), false, 'después de releer no queda nada sin guardar');
  });

  test('sigue negándose mientras no se relea: dos guardar() seguidos no dejan pasar el segundo', () => {
    const { A, B, almacen } = dosPestanas();
    cobrar(A, 'P1', 100000);
    const conAbono = almacen[KEY];
    assert.equal(B.ev('guardar()'), false);
    assert.equal(B.ev('guardar()'), false, 'el segundo guardar() pisó la cartera');
    assert.equal(almacen[KEY], conAbono);
  });

  test('una escritura ajena del MISMO LARGO también se caza: 260.000 corregido a 240.000', () => {
    const almacen = {};
    const B = abrirPanel({ almacen, ahora: HOY });
    B.cargarCartera(clon(CARTERA));
    B.ev('guardar()');
    const otra = JSON.parse(almacen[KEY]);
    otra.prestamos[0].capital = 400000;
    const t = JSON.stringify(otra);
    assert.equal(t.length, almacen[KEY].length, 'la prueba necesita el mismo largo');
    almacen[KEY] = t;
    assert.equal(B.ev('guardar()'), false, 'con el mismo largo la dejó pasar: hace falta la huella');
    assert.equal(almacen[KEY], t);
  });

  test('CONTROL: sin nadie más escribiendo, guardar() guarda y no avisa nada, cien veces', () => {
    const { A, almacen } = dosPestanas();
    for (let i = 0; i < 100; i++) {
      A.ev("DB.socios[0].gestiones.push({ fecha: '2026-11-03', canal: 'wa', plantilla: 'p" + i + "' })");
      assert.equal(A.ev('guardar()'), true, 'la vuelta ' + i + ' no guardó');
    }
    assert.equal(JSON.parse(almacen[KEY]).socios[0].gestiones.length, 100);
    assert.equal(aviso(A), '', 'avisó de otra pestaña sin que hubiera otra');
  });

  test('si no se puede leer el disco no se acusa a otra pestaña de nada: se intenta como siempre', () => {
    /* _carteraAjena contesta «sí» cuando no sabe (cuesta un emparejar). Aquí eso no
       puede volverse «Otra pestaña guardó»: sería afirmar algo que nadie midió. */
    const { A } = dosPestanas();
    const leer = A.ctx.localStorage.getItem;
    A.ctx.localStorage.getItem = () => { throw new Error('no deja leer'); };
    A.ev('guardar()');
    A.ctx.localStorage.getItem = leer;
    assert.equal(aviso(A), '', 'culpó a otra pestaña de lo que fue no poder leer');
  });
});

describe('la pestaña vieja se pone al día', () => {
  test('al quedar libre se relee: ve el cobro de A y lo siguiente que guarda entra encima de él', () => {
    const { A, B, almacen } = dosPestanas();
    cobrar(A, 'P1', 100000);
    B.ev('guardar()');
    B.ev('estoyOcupado = function () { return false; }');
    B.ev('alEscribirOtraPagina({ key: KEY })');
    assert.equal(B.ev('DB.prestamos[0].abonosCapital.length'), 1, 'B sigue sin ver el cobro de A');
    B.ev("DB.socios[1].gestiones.push({ fecha: '2026-11-03', canal: 'wa', plantilla: 'despues' })");
    assert.equal(B.ev('guardar()'), true, 'ya al día, B no pudo guardar');
    const d = JSON.parse(almacen[KEY]);
    assert.equal(d.prestamos[0].abonosCapital.length, 1, 'el guardado de B borró el cobro de A');
    assert.equal(d.socios[1].gestiones.length, 1);
  });

  test('y el aviso cambia: ya no dice «recarga», dice que lo último no quedó', () => {
    const { A, B } = dosPestanas();
    cobrar(A, 'P1', 100000);
    B.ev('guardar()');
    B.ev('estoyOcupado = function () { return false; }');
    B.ev('alEscribirOtraPagina({ key: KEY })');
    const t = aviso(B);
    assert.doesNotMatch(t, /: recarga/, 'le pide recargar a una pestaña que ya se recargó');
    assert.match(t, /no se guardó/, 'dejó de decir que lo último no se guardó: ' + t);
    B.ev('entendidoOtraPestana()');
    assert.equal(aviso(B), '', 'el aviso no se puede cerrar');
  });

  test('el botón de la cinta (recargarCartera) también la pone al día', () => {
    const { A, B } = dosPestanas();
    cobrar(A, 'P1', 100000);
    B.ev('guardar()');
    B.ev('recargarCartera()');
    assert.equal(B.ev('_libroSinGuardar'), false);
    assert.doesNotMatch(aviso(B), /: recarga/);
    assert.equal(B.ev('DB.prestamos[0].abonosCapital.length'), 1);
  });

  test('una pestaña olvidada en la puerta del PIN relee al entrar, en vez de chocar con el primer cobro', () => {
    const { A, B } = dosPestanas();
    cobrar(A, 'P1', 100000);
    assert.equal(B.ev('DB.prestamos[0].abonosCapital.length'), 0);
    B.ev("document.getElementById('pinInput').value = DB.config.pin; entrar()");
    assert.equal(B.ev('DB.prestamos[0].abonosCapital.length'), 1, 'entró a trabajar con la cartera de antes');
    assert.equal(B.ev('_carteraAjena()'), false);
    cobrar(B, 'P1', 50000);
    assert.equal(aviso(B), '', 'el primer cobro después de entrar chocó con la pestaña de al lado');
  });
});

describe('el otro escritor directo de la cartera, y lo que la pantalla afirma', () => {
  test('cargar una base de prospectos desde una pestaña vieja tampoco pisa', () => {
    const { A, B, almacen } = dosPestanas();
    cobrar(A, 'P1', 100000);
    const conAbono = almacen[KEY];
    B.ctx.__base = { archivo: 'base.csv', revision: { nuevos: [{ nombre: 'Prospecto Inventado', celular: '3000000099' }], senalesFinancieras: [] } };
    B.ev("_baseLeida = __base; gv = function () { return 'Una feria inventada'; }; extraParaGuardar = function () { return {}; }; espacioParaBase = function () { return { caben: 1 }; }");
    B.ev('confirmarCargaBase()');
    assert.equal(almacen[KEY], conAbono, 'la carga de la base pisó el cobro');
    assert.equal(B.ev('(DB.prospectos || []).length'), 0, 'dejó en memoria unos prospectos que dice que no cargó');
    assert.match(aviso(B), OTRA_PESTANA);
    assert.ok(!(B.ctx._avisos || []).some(x => /^Listo: entraron/.test(x)), 'dijo «Listo: entraron» sin haber guardado');
  });

  [['Plantillas guardadas.', 'guardarPlantillas()'], ['Ajustes guardados.', "document.getElementById('cfgFrenoFraccion').value = '30'; guardarCfg()"]].forEach(([frase, llamar]) => {
    test('no afirma «' + frase + '» de lo que no guardó', () => {
      const { A, B } = dosPestanas();
      cobrar(A, 'P1', 100000);
      B.ctx._avisos = [];
      B.ev(llamar);
      assert.ok(!B.ctx._avisos.some(x => x.indexOf(frase) >= 0), 'dijo «' + frase + '» y no guardó nada');
      assert.match(aviso(B), OTRA_PESTANA);
    });
  });

  test('CONTROL: cuando sí guarda, sí lo dice', () => {
    const { A } = dosPestanas();
    A.ctx._avisos = [];
    A.ev('guardarPlantillas()');
    assert.ok(A.ctx._avisos.some(x => x.indexOf('Plantillas guardadas.') >= 0));
  });
});

describe('el modo equipo no pasa por aquí', () => {
  test('con la sesión de un gerente, la regla nueva no acusa a nadie', () => {
    /* modoEquipo() vacía DB: lo que hay en esa memoria no es la cartera de Joan, y
       «esto no se guardó: recarga» no significaría nada. Ninguna pantalla del
       equipo llama a guardar() (lo vigila el-freno-de-borrados); esto vigila que
       si algún día lo hace, la regla nueva no le pinte a un gerente un aviso de
       las pestañas de Joan. */
    const { A, B } = dosPestanas();
    cobrar(A, 'P1', 100000);
    B.ev('CARTERA_EQUIPO = { yo: { nombre: "Gerente Inventado", rol: "gerente" } }');
    assert.equal(B.ev('_otraPestanaEscribio()'), false, 'el modo equipo entró a la regla nueva');
    assert.equal(aviso(B), '');
  });

  test('guardar() durante el arranque no se cae por leer CARTERA_EQUIPO antes de su línea', () => {
    /* cargar() puede llamar a guardar() por la migración de fechas, y CARTERA_EQUIPO
       es un `let` declarado miles de líneas después: leerlo a secas ahí tumba el
       script entero y el botón Entrar deja de hacer algo. */
    const almacen = {};
    almacen[KEY] = JSON.stringify(Object.assign(clon(CARTERA), { prestamos: [Object.assign(clon(CARTERA.prestamos[0]),
      { pagado: true, fechaPagado: '2026-10-25', fechaPago: '2026-11-15' })] }));
    const P = abrirPanel({ almacen, ahora: HOY });
    assert.equal(P.ev('typeof entrar'), 'function');
    assert.equal(P.ev('DB.socios.length'), 2);
  });
});

describe('la subida que ya existe sigue subiendo', () => {
  test('lo de la pestaña que cobró sube, y la cinta de esa pestaña no se mueve', async () => {
    /* La pestaña de mentira de banco-nube-crm.js cumple el MISMO contrato. Ver
       abajo la prueba que comprueba que los dos dicen lo mismo. */
    const alm = almacenDoble();
    const m = montar({ alm, db: cartera(3, 1) });
    await sembrar(m);
    const B = pestana(alm, 'B');
    B.leer();                        // B abre aquí y se queda con esta copia
    const db = leerDisco(alm);
    db.prestamos[0].abonos.push({ fecha: '2026-11-03', monto: 50000 });
    m.tab.guardar(db);               // A cobra
    const conAbono = alm.getItem(KEY);
    const copiaVieja = clon(db);
    copiaVieja.prestamos[0].abonos = [];
    assert.equal(B.guardar(copiaVieja), false, 'la pestaña vieja de mentira escribió');
    assert.equal(alm.getItem(KEY), conAbono);
    assert.ok(espejoDisco(alm).socios, 'se soltó el espejo');
    await m.C.vuelta(true);
    assert.equal(m.srv.creditos.P0.datos.abonos.length, 1, 'el cobro de A no subió');
    assert.notEqual(m.C.estado().cinta.fase, 'sello-roto');
    assert.notEqual(m.C.estado().cinta.fase, 'falta-emparejar', 'la pestaña vieja dejó a la buena sin emparejar');
    invariante(alm, 'tras la pestaña vieja');
  });

  test('la pestaña de mentira de los bancos dice lo mismo que el crm.html de verdad', () => {
    const { A, B, almacen } = dosPestanas();
    cobrar(A, 'P1', 100000);
    const verdad = B.ev('guardar()');
    const alm = almacenDoble();
    const X = pestana(alm, 'X'), Y = pestana(alm, 'Y');
    X.guardar({ a: 1 });
    Y.leer();
    X.guardar({ a: 2 });
    assert.equal(Y.guardar({ a: 3 }), verdad, 'el doble y crm.html contestan distinto');
    assert.deepEqual(JSON.parse(alm.getItem(KEY)), { a: 2 }, 'el doble pisó: dejó de parecerse a crm.html');
    assert.ok(almacen[KEY]);
  });
});
