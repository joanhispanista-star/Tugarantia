/* ============================================================================
 * REPARTIR, CORRIENDO DE VERDAD — 10 de septiembre de 2026
 *
 *   cd pruebas && node --test
 *
 * POR QUÉ ESTE ARCHIVO EXISTE.
 *
 * La pantalla de repartir dice, con todas sus letras, «Seleccionar los 697».
 * Pero solo pinta 300 filas: con 697 casillas el navegador de Joan se arrastra.
 * O sea que hay un botón que promete alcanzar a gente que no está en pantalla.
 * Si esa promesa se rompe —si «todos» resulta ser «los que se ven»— nadie se
 * entera hasta que los 397 de abajo se quedan sin asesor, sin un error, sin un
 * aviso, y con el alert diciendo «Listo: 300 repartidos» como si estuviera bien.
 *
 * Una prueba de texto no puede ver eso: hay que ARMAR la pantalla, marcar las
 * casillas que de verdad se pintaron, y contar a quién le tocó dueño. Es la
 * misma medicina de panel.test.js — compilar no es ejecutar.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');

const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();

/* Un equipo de verdad: el que Joan describió — él reparte al gerente, y el
   gerente reparte a sus asesores. */
const EQUIPO = [
  { id: 'g1', nombre: 'Gerente Nancy', rol: 'gerente', estado: 'activo', celular: '3001110001' },
  { id: 'a1', nombre: 'Asesor Uno', rol: 'asesor', estado: 'activo', celular: '3001110002', jefe: 'g1' },
  { id: 'a2', nombre: 'Asesor Dos', rol: 'asesor', estado: 'activo', celular: '3001110003', jefe: 'g1' },
  { id: 'a9', nombre: 'Asesor Retirado', rol: 'asesor', estado: 'retirado', celular: '3001110009' }
];

function cartera(cuantosProspectos, extra) {
  const pros = [];
  for (let i = 1; i <= cuantosProspectos; i++) {
    pros.push({ id: 'p' + i, nombre: 'Potencial ' + i, celular: '31' + String(10000000 + i), estado: 'nuevo' });
  }
  return Object.assign({
    socios: [{ id: 's1', nombre: 'María Pérez', telefono: '3001112233' }],
    prestamos: [], prospectos: pros, equipo: EQUIPO, asignaciones: [],
    config: { negocio: 'Tu Garantía' }
  }, extra || {});
}

/* El banco no tiene DOM de verdad, así que las casillas se sacan del HTML que
   la pantalla ACABA de escribir. Es a propósito: si `pantallaAsignar` deja de
   pintar una casilla, acá desaparece igual que en el navegador. */
function conectarCasillas(P) {
  const html = () => P.elems['mBody'].innerHTML || '';
  /* El desplegable de destino no vive en el cuerpo del modal sino en su propia
     caja: pintarDestinos la reescribe sola al cambiar de modo, para no volver a
     armar la lista de 697 cada vez. */
  const htmlDest = () => (P.elems['asDestinoCaja'] || {}).innerHTML || '';
  let chks = [], dest = [];
  const releer = () => {
    chks = [...html().matchAll(/class="asChk" value="([^"]*)"\s*(data-libre="1")?/g)]
      .map(m => ({ value: m[1], checked: false, dataset: m[2] ? { libre: '1' } : {} }));
    dest = [...htmlDest().matchAll(/class="asDest" value="([^"]*)"([^>]*)/g)]
      .map(m => ({ value: m[1], checked: /checked/.test(m[2]), dataset: {} }));
  };
  P.ev('document').querySelectorAll = sel =>
    sel === '.asChk' ? chks : sel === '.asDest' ? dest : [];
  return { releer, chks: () => chks, dest: () => dest, html };
}

/* alert y confirm hablan: acá se escuchan, porque el aviso ES la salvaguarda. */
function escuchar(P) {
  P.ev('var _dichos=[]; alert=function(m){_dichos.push(String(m));}; confirm=function(m){_dichos.push(String(m)); return _respuesta;}; var _respuesta=true;');
  return {
    dichos: () => P.ev('_dichos.slice()'),
    ultimo: () => { const d = P.ev('_dichos.slice()'); return d[d.length - 1] || ''; },
    responder: v => P.ev('_respuesta=' + (v ? 'true' : 'false')),
    limpiar: () => P.ev('_dichos.length=0')
  };
}

describe('repartir: la pantalla que le da dueño a la gente (10-sep-2026)', () => {

  test('LOS DOS GRUPOS NO SE MEZCLAN', () => {
    /* A un cliente se le cobra; a un potencial se le vende. Un asesor que los ve
       revueltos llama al que debe con el guion del que no ha pedido nada. */
    const P = abrirPanel(); P.cargarCartera(cartera(5));
    escuchar(P);

    P.ev("pantallaAsignar('potenciales')");
    let h = P.elems['mBody'].innerHTML;
    assert.ok(h.indexOf('Potencial 1') >= 0, 'el grupo de potenciales no trae a los prospectos');
    assert.ok(h.indexOf('María Pérez') < 0, 'un cliente se coló en la lista de potenciales');

    P.ev("pantallaAsignar('clientes')");
    h = P.elems['mBody'].innerHTML;
    assert.ok(h.indexOf('María Pérez') >= 0, 'el grupo de clientes no trae a los clientes');
    assert.ok(h.indexOf('Potencial 1') < 0, 'un potencial se coló en la lista de clientes');
  });

  test('SE LE PUEDE ASIGNAR AL GERENTE, que es el que después reparte', () => {
    /* Joan: «quiero poder asignar al gerente y que el gerente sea quien asigne a
       los asesores». Si el desplegable solo trajera asesores, esa cadena no
       existe y Joan queda de repartidor. */
    const P = abrirPanel(); P.cargarCartera(cartera(3));
    escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    const h = P.elems['asDestinoCaja'].innerHTML;
    assert.ok(/Gerentes/.test(h), 'el desplegable no separa a los gerentes');
    assert.ok(h.indexOf('Gerente Nancy') >= 0, 'el gerente no aparece como destino');
    assert.ok(h.indexOf('Asesor Uno') >= 0, 'los asesores no aparecen como destino');
    assert.ok(h.indexOf('Asesor Retirado') < 0, 'un retirado sigue apareciendo como destino');
  });

  test('«SELECCIONAR LOS 350» ALCANZA A LOS QUE NO SE PINTARON', () => {
    /* La razón de ser de este archivo. Se pintan 300 y se prometen 350. */
    const P = abrirPanel(); P.cargarCartera(cartera(350));
    escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    const C = conectarCasillas(P); C.releer();

    assert.equal(C.chks().length, 300, 'se pintaron más de 300 filas: el Panel se va a arrastrar');
    assert.ok(P.elems['mBody'].innerHTML.indexOf('Seleccionar los 350') >= 0,
      'el botón no promete los 350');

    P.ev('marcarTodos(true)');
    assert.equal(P.ev('idsAAsignar().length'), 350,
      '«seleccionar todos» solo alcanzó a los que se ven: los de abajo se quedan sin dueño y nadie avisa');
    assert.equal(P.elems['asCuenta'].textContent, 350, 'la cuenta en pantalla miente');

    P.ev('marcarTodos(false)');
    assert.equal(P.ev('idsAAsignar().length'), 0, '«ninguno» dejó gente marcada');
  });

  test('«LOS PRIMEROS N» toma exactamente N, y solo de los que no tienen dueño', () => {
    const P = abrirPanel(); P.cargarCartera(cartera(20, {
      asignaciones: [{ id: 'A0', socio_id: 'p1', asesor_id: 'a1', desde: '2026-01-01' }]
    }));
    escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    conectarCasillas(P);
    P.ev("cambiarModoAsignar('primeros')");
    P.ev("document.getElementById('asCuantos').value='6'");
    const ids = P.ev('idsAAsignar()');
    assert.equal(ids.length, 6, 'no tomó los seis que se le pidieron');
    assert.ok(ids.indexOf('p1') < 0, 'se llevó por delante a uno que ya tenía asesor');
    assert.deepEqual(ids, ['p2', 'p3', 'p4', 'p5', 'p6', 'p7'], 'no son los primeros, o no van en orden');
  });

  test('AUTOMÁTICO reparte por turnos, en orden y sin azar', () => {
    /* Sin azar a propósito: el día que un asesor reclame «¿por qué a mí me
       tocaron esos?», la respuesta tiene que poder repetirse. */
    const P = abrirPanel(); P.cargarCartera(cartera(6));
    const oye = escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    const C = conectarCasillas(P);
    P.ev("cambiarModoAsignar('auto')");
    C.releer();
    assert.equal(C.dest().length, 3, 'los destinos del automático no se pintaron');
    assert.deepEqual(C.dest().filter(d => d.checked).map(d => d.value), ['a1', 'a2'],
      'el automático debería venir con los asesores marcados y el gerente no');

    P.ev('asignarMarcados()');
    const asig = P.ev('asignaciones()');
    assert.equal(asig.length, 6, 'no repartió los seis');
    const de = id => P.ev("COMIS.asesorDe(asignaciones(),'" + id + "','" + HOY + "')");
    assert.deepEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(de),
      ['a1', 'a2', 'a1', 'a2', 'a1', 'a2'], 'los turnos no salieron alternados');
    assert.ok(/Asesor Uno/.test(oye.dichos().join(' ')) && /Asesor Dos/.test(oye.dichos().join(' ')),
      'el aviso no dice entre quiénes va a repartir');
  });

  test('QUITARLE CLIENTES A ALGUIEN SE AVISA POR SU NOMBRE, y se puede decir que no', () => {
    /* Reasignar no es un efecto secundario de haber apretado «todos»: es una
       decisión, y Joan tiene que leer a quién se los está quitando. */
    const P = abrirPanel(); P.cargarCartera(cartera(4, {
      asignaciones: [
        { id: 'A0', socio_id: 'p1', asesor_id: 'a1', desde: '2026-01-01' },
        { id: 'A1', socio_id: 'p2', asesor_id: 'a1', desde: '2026-01-01' }
      ]
    }));
    const oye = escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    conectarCasillas(P);
    P.ev("document.getElementById('asDestino').value='a2'");
    P.ev('marcarTodos(true)');

    oye.responder(false);
    P.ev('asignarMarcados()');
    assert.ok(/Asesor Uno \(2\)/.test(oye.ultimo()),
      'el aviso no dice por su nombre a quién le quita los dos: ' + oye.ultimo());
    assert.ok(/CAMBIAN de dueño/.test(oye.ultimo()), 'el aviso no distingue a los que cambian de dueño');
    assert.equal(P.ev('asignaciones().length'), 2, 'dijo que NO y repartió igual');

    oye.responder(true); oye.limpiar();
    P.ev('asignarMarcados()');
    const de = id => P.ev("COMIS.asesorDe(asignaciones(),'" + id + "','" + HOY + "')");
    assert.deepEqual(['p1', 'p2', 'p3', 'p4'].map(de), ['a2', 'a2', 'a2', 'a2'],
      'después de decir que sí, no quedaron todos con el nuevo dueño');
    assert.ok(/Listo: 4/.test(oye.dichos().join(' ')), 'no contó bien lo que repartió');
  });

  test('lo que ya se ganó NO se mueve al cambiar de dueño', () => {
    /* La asignación vieja se queda escrita: las comisiones se calculan contra el
       asesor que mandaba EL DÍA del hecho, no contra el de hoy. */
    const P = abrirPanel(); P.cargarCartera(cartera(2, {
      asignaciones: [{ id: 'A0', socio_id: 'p1', asesor_id: 'a1', desde: '2026-01-01' }]
    }));
    escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    conectarCasillas(P);
    P.ev("document.getElementById('asDestino').value='a2'");
    P.ev('marcarTodos(true)');
    P.ev('asignarMarcados()');
    assert.equal(P.ev("COMIS.asesorDe(asignaciones(),'p1','2026-06-01')"), 'a1',
      'la historia se reescribió: en junio ese cliente era de Asesor Uno');
    assert.equal(P.ev("COMIS.asesorDe(asignaciones(),'p1','" + HOY + "')"), 'a2',
      'de hoy en adelante tenía que ser del nuevo');
  });

  test('sin nadie en el equipo, avisa y no abre una pantalla vacía', () => {
    const P = abrirPanel(); P.cargarCartera(cartera(3, { equipo: [] }));
    const oye = escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    assert.ok(/pestaña Equipo/.test(oye.ultimo()), 'no dice dónde se crea la gente: ' + oye.ultimo());
  });

  test('repartir marcando a dedo respeta lo marcado', () => {
    const P = abrirPanel(); P.cargarCartera(cartera(5));
    escuchar(P);
    P.ev("pantallaAsignar('potenciales')");
    const C = conectarCasillas(P); C.releer();
    C.chks()[1].checked = true; C.chks()[3].checked = true;
    P.ev("document.getElementById('asDestino').value='g1'");
    P.ev('asignarMarcados()');
    const de = id => P.ev("COMIS.asesorDe(asignaciones(),'" + id + "','" + HOY + "')");
    assert.deepEqual(['p1', 'p2', 'p3', 'p4', 'p5'].map(de), ['', 'g1', '', 'g1', ''],
      'no repartió exactamente los dos que se marcaron, ni al gerente');
  });
});
