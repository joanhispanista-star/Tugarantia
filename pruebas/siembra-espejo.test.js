/* ===========================================================================
 * LA SIEMBRA DEL ESPEJO
 * 15 de septiembre de 2026.
 *
 * POR QUE EXISTE. Sin espejo, armarLote manda TODAS las filas con
 * revision_base null —«esta fila la cree yo y el servidor no la tiene»—, el
 * servidor las encuentra, y contesta CHOQUE en cada una. Eso es lo que pasa hoy
 * en un computador nuevo: traer.html no escribe espejo y subir.html nunca
 * escribe servidor_ahora.
 *
 * LA REGLA QUE ORDENA TODO: el espejo nunca puede afirmar algo que la cartera
 * no dice. Cada vez que esas dos cosas se separan, el diff deja de ser una
 * subida y se convierte en una LISTA DE BORRADOS con la bendicion del control
 * de revisiones. Estas pruebas existen para que esa regla no se rompa.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../panel/nube.js');

/* Una fila de la nube tal como la devuelve panel_traer. */
const enLaNube = (id, datos, extra) => Object.assign(
  { id, datos, revision: 7, borrado: false, actualizado_en: '2026-09-15T10:00:00Z',
    actualizado_por: 'computador' }, extra || {});

describe('esSuperconjunto (15-sep-2026)', () => {

  test('lo identico es superconjunto', () => {
    assert.equal(N.esSuperconjunto({ a: 1, b: 'x' }, { a: 1, b: 'x' }), true);
  });

  test('tener campos DE MAS sigue siendo superconjunto', () => {
    /* Es el caso real: cargar() le agrega campos a cada ficha al abrir el CRM,
       asi que la de aca tiene mas que la que subio subir.html. */
    assert.equal(N.esSuperconjunto({ a: 1, b: 'x', nuevo: true }, { a: 1, b: 'x' }), true);
  });

  test('un valor DISTINTO no lo es', () => {
    assert.equal(N.esSuperconjunto({ a: 1 }, { a: 2 }), false);
  });

  test('un campo que FALTA no lo es', () => {
    assert.equal(N.esSuperconjunto({ a: 1 }, { a: 1, b: 'x' }), false);
  });

  test('UN ABONO DE MAS del lado del servidor NO es superconjunto', () => {
    /* Los arrays se comparan enteros a proposito. Si esto devolviera true, el
       espejo adoptaria la revision del servidor y la subida siguiente mandaria
       la lista corta contra la revision buena: el abono de la nube se pierde,
       aceptado sin choque. Eso es plata cobrada que desaparece. */
    const local = { abonos: [{ f: '2026-09-01', m: 100 }] };
    const nube = { abonos: [{ f: '2026-09-01', m: 100 }, { f: '2026-09-05', m: 50 }] };
    assert.equal(N.esSuperconjunto(local, nube), false);
  });

  test('anidado: mira hacia adentro', () => {
    assert.equal(N.esSuperconjunto({ a: { b: 1, c: 2 } }, { a: { b: 1 } }), true);
    assert.equal(N.esSuperconjunto({ a: { b: 1 } }, { a: { b: 2 } }), false);
  });

  test('lo que el servidor no dice, no se exige', () => {
    assert.equal(N.esSuperconjunto({ a: 1 }, {}), true);
    assert.equal(N.esSuperconjunto({ a: 1 }, null), true);
  });
});

describe('espejoDeAdopcion (15-sep-2026)', () => {

  test('EL CASO QUE HAY QUE CLAVAR: cartera migrada + nube cruda + espejo vacio', () => {
    /* La cartera de Joan tiene los campos que cargar() le agrega al abrir; la
       nube tiene lo que subio subir.html, sin ellos. Tienen que adoptarse TODAS
       —cero congeladas— y el armarLote siguiente tiene que salir contra la
       revision del servidor, NUNCA con revision_base null. */
    const db = {
      socios: [{ id: 's1', nombre: 'Ana', cedula: '111', gestiones: [], cruces: [] },
               { id: 's2', nombre: 'Luis', cedula: '222', gestiones: [], cruces: [] }],
      prestamos: [{ id: 'p1', socioId: 's1', capital: 500000, abonos: [], prorrogas: [] }],
      respaldados: []
    };
    const paquete = {
      completo: true,
      socios: [enLaNube('s1', { id: 's1', nombre: 'Ana', cedula: '111' }),
               enLaNube('s2', { id: 's2', nombre: 'Luis', cedula: '222' })],
      creditos: [enLaNube('p1', { id: 'p1', socioId: 's1', capital: 500000 })],
      respaldados: [], ajustes: []
    };
    const r = N.espejoDeAdopcion(db, paquete, null);
    assert.equal(r.adoptadas.length, 3, 'no adopto las tres: ' + JSON.stringify(r.congelar));
    assert.equal(r.congelar.length, 0);

    const lote = N.armarLote(db, r.espejo, { marcarBorrados: false });
    const todas = lote.socios.concat(lote.creditos);
    for (const f of todas) {
      assert.notEqual(f.revision_base, null,
        'la fila ' + f.id + ' sale con revision_base null: el servidor la va a contestar CHOQUE');
    }
  });

  test('UNA FILA BORRADA EN LA NUBE NO SE ADOPTA', () => {
    /* Si se adoptara, la proxima subida no diria nada de ella y quedaria
       borrada para todos los demas aparatos sin que nadie lo hubiera decidido.
       O revive en la nube, o desaparece en silencio: las dos son malas. */
    const db = { socios: [{ id: 's1', nombre: 'Pedro' }], prestamos: [], respaldados: [] };
    const paquete = { socios: [enLaNube('s1', { id: 's1', nombre: 'Pedro' }, { borrado: true })],
                      creditos: [], respaldados: [], ajustes: [] };
    const r = N.espejoDeAdopcion(db, paquete, null);
    assert.equal(r.adoptadas.length, 0, 'adopto una fila borrada teniendo el socio vivo aca');
    assert.equal(r.congelar.length, 1);
    assert.equal(r.congelar[0].motivo, 'borrada-en-la-nube');
    assert.equal(r.espejo.socios.s1, undefined, 'la fila borrada entro al espejo igual');
  });

  test('una fila borrada que aca NO existe si se adopta: no hay nada que perder', () => {
    const db = { socios: [], prestamos: [], respaldados: [] };
    const paquete = { socios: [enLaNube('sX', { id: 'sX' }, { borrado: true })],
                      creditos: [], respaldados: [], ajustes: [] };
    const r = N.espejoDeAdopcion(db, paquete, null);
    assert.equal(r.adoptadas.length, 1);
    assert.equal(r.espejo.socios.sX.borrado, true);
  });

  test('CENTINELA DEL INVARIANTE: 200 filas, una mutada al azar cada vez', () => {
    /* Para TODA entrada que quede en el espejo, la fila local tiene que ser
       identica al servidor o superconjunto suyo. Ninguna adoptada puede
       corresponder a una fila donde el servidor dice algo que el local
       contradice. Se prueba mutando, no razonando. */
    const campos = ['nombre', 'cedula', 'celular', 'direccion'];
    for (let vuelta = 0; vuelta < 200; vuelta++) {
      const base = { id: 's' + vuelta, nombre: 'N' + vuelta, cedula: 'C' + vuelta,
                     celular: '300' + vuelta, direccion: 'Calle ' + vuelta };
      const local = Object.assign({}, base, { gestiones: [] });
      /* El servidor difiere en UN campo, elegido por la vuelta (no al azar:
         una prueba que cambia sola no se puede repetir). */
      const campo = campos[vuelta % campos.length];
      const suyo = Object.assign({}, base);
      suyo[campo] = base[campo] + '-CAMBIADO';

      const r = N.espejoDeAdopcion(
        { socios: [local], prestamos: [], respaldados: [] },
        { socios: [enLaNube(base.id, suyo)], creditos: [], respaldados: [], ajustes: [] },
        null);
      assert.equal(r.adoptadas.length, 0,
        'vuelta ' + vuelta + ': adopto una fila que difiere en ' + campo);
      assert.equal(r.congelar.length, 1);
      assert.equal(r.congelar[0].motivo, 'difieren');
    }
  });

  test('lo que solo esta en la nube no entra al espejo', () => {
    /* Si entrara, el espejo afirmaria que la cartera tiene una fila que no
       tiene, y el siguiente diff la mandaria como borrada. */
    const r = N.espejoDeAdopcion(
      { socios: [], prestamos: [], respaldados: [] },
      { socios: [enLaNube('sY', { id: 'sY', nombre: 'Nuevo' })], creditos: [], respaldados: [], ajustes: [] },
      null);
    assert.equal(r.soloAlla.length, 1);
    assert.equal(r.espejo.socios.sY, undefined);
    assert.equal(r.adoptadas.length, 0);
  });

  test('lo que solo esta aca se reporta, y tampoco entra al espejo', () => {
    const r = N.espejoDeAdopcion(
      { socios: [{ id: 'sZ', nombre: 'Solo mio' }], prestamos: [], respaldados: [] },
      { socios: [], creditos: [], respaldados: [], ajustes: [] }, null);
    assert.equal(r.soloAca.length, 1);
    assert.equal(r.espejo.socios.sZ, undefined,
      'una fila que la nube no tiene entro al espejo: el proximo diff no la subiria');
  });

  test('servidor_ahora queda en NULL a proposito', () => {
    /* Esta funcion no sabe de que momento es el paquete. Poner una hora
       inventada haria que la proxima bajada se saltara lo que paso en medio. */
    const r = N.espejoDeAdopcion({ socios: [], prestamos: [], respaldados: [] },
                                 { socios: [], creditos: [], respaldados: [], ajustes: [] }, null);
    assert.equal(r.espejo.servidor_ahora, null);
  });

  test('NO escribe disco', () => {
    /* Es una funcion pura. Si un dia toca localStorage, esta prueba revienta en
       node, que no lo tiene. */
    assert.doesNotThrow(() => N.espejoDeAdopcion(
      { socios: [{ id: 'a' }], prestamos: [], respaldados: [] },
      { socios: [enLaNube('a', { id: 'a' })], creditos: [], respaldados: [], ajustes: [] }, null));
  });
});

describe('devolverFotos (15-sep-2026)', () => {

  test('IDA Y VUELTA: las cuatro fotos y la del comprobante sobreviven', () => {
    /* Lo que baja de la nube NO trae fotos —nunca suben—, asi que una fila que
       vuelve y se escribe tal cual BORRA las fotos del aparato que si las tenia,
       en silencio. */
    const local = {
      id: 's1', nombre: 'Ana',
      cedulaFrenteFoto: 'F1', cedulaReversoFoto: 'F2', selfieFoto: 'F3', cedulaFoto: 'F4',
      comprobantes: [{ fecha: '2026-09-01', tipo: 'pago', monto: 100, foto: 'FC' }]
    };
    const deLaNube = {
      id: 's1', nombre: 'Ana Maria',
      comprobantes: [{ fecha: '2026-09-01', tipo: 'pago', monto: 100 }]
    };
    const r = N.devolverFotos(deLaNube, local);
    assert.equal(r.cedulaFrenteFoto, 'F1');
    assert.equal(r.cedulaReversoFoto, 'F2');
    assert.equal(r.selfieFoto, 'F3');
    assert.equal(r.cedulaFoto, 'F4');
    assert.equal(r.comprobantes[0].foto, 'FC', 'la foto del comprobante se perdio');
    /* Y lo que cambio en la nube se respeta: no se pisa con lo viejo. */
    assert.equal(r.nombre, 'Ana Maria');
  });

  test('el comprobante se empareja aunque el monto venga como TEXTO', () => {
    /* Vuelve de un jsonb y el tipo se puede haber movido. Comparar con === a
       secas perderia la foto sin decir nada. */
    const local = { comprobantes: [{ fecha: '2026-09-01', tipo: 'pago', monto: 100, foto: 'FC' }] };
    const nube = { comprobantes: [{ fecha: '2026-09-01', tipo: 'pago', monto: '100' }] };
    assert.equal(N.devolverFotos(nube, local).comprobantes[0].foto, 'FC');
  });

  test('NO pisa una foto que la nube si trae', () => {
    const local = { cedulaFrenteFoto: 'VIEJA' };
    const nube = { cedulaFrenteFoto: 'NUEVA' };
    assert.equal(N.devolverFotos(nube, local).cedulaFrenteFoto, 'NUEVA');
  });

  test('no revienta sin local ni sin datos', () => {
    assert.equal(N.devolverFotos(null, { cedulaFoto: 'x' }), null);
    assert.deepEqual(N.devolverFotos({ a: 1 }, null), { a: 1 });
  });

  test('no toca el objeto que recibe', () => {
    const nube = { id: 's1', comprobantes: [{ fecha: 'f', tipo: 't', monto: 1 }] };
    const antes = JSON.stringify(nube);
    N.devolverFotos(nube, { comprobantes: [{ fecha: 'f', tipo: 't', monto: 1, foto: 'X' }] });
    assert.equal(JSON.stringify(nube), antes, 'modifico lo que le pasaron');
  });
});

describe('el espejo se invalida cuando la cartera se reemplaza (15-sep-2026)', () => {

  const fs = require('node:fs');
  const path = require('node:path');
  const RAIZ = path.join(__dirname, '..');

  const { abrirPanel } = require('./banco-panel.js');

  /* Un respaldo de verdad, del tamaño que tiene uno de Joan. */
  const RESPALDO = JSON.stringify({
    socios: [{ id: 'C1', nombre: 'Ana', cedula: '1', telefono: '3001' }],
    prestamos: []
  });

  /* Le entrega un archivo al importar() del CRM como se lo entrega el navegador:
     un evento con un input y un File. El FileReader del banco lee de `.texto`. */
  function importarEn(P, texto) {
    P.ev('window.__ev = { target: { files: [{ texto: ' + JSON.stringify(texto) + ' }], value: "x" } }');
    P.ev('importar(window.__ev)');
    return P.ev('(window._avisos || []).slice(-1)[0] || ""');
  }

  test('importar() BORRA el espejo — ejecutado, no leido', () => {
    /* Una cartera que acaba de ser reemplazada entera no tiene ningun derecho a
       decirle a la nube que le falta. Son exactamente dos sitios en todo el
       proyecto: traer.html y el importar() del CRM — el segundo no lo habia
       visto nadie, estando a doce lineas del otro que todos citaban.

       ESTA PRUEBA SE REESCRIBIO EL 15-sep-2026 PORQUE ERA DE TEXTO. Buscaba el
       removeItem en los 900 caracteres siguientes al setItem, y se puso roja
       cuando entre los dos se metieron catorce lineas que no cambiaban nada de
       lo que ella dice vigilar. Una prueba que se rompe por una linea de mas
       —y que aprobaria un `if(false)` alrededor del removeItem— no estaba
       midiendo la invariante: estaba midiendo la distancia. Ahora corre el
       importar() de verdad y mira el almacen.
       MUTANTE QUE CAZA: envolver los removeItem en `if(false)`, moverlos antes
       del setItem, o cambiar el nombre de cualquiera de las dos llaves. */
    const P = abrirPanel();
    P.almacen['joan_panel_espejo_pc'] = '{"socios":{"C9":{"revision":7}}}';
    P.almacen['joan_crm_sello'] = 'sello-de-otra-cartera';

    const aviso = importarEn(P, RESPALDO);

    assert.equal(P.almacen['joan_panel_espejo_pc'], undefined,
      'importar() reemplazo la cartera y dejo vivo el espejo: la siguiente subida ' +
      'mandaria un diff contra una verdad que ya no existe');
    assert.equal(P.almacen['joan_crm_sello'], undefined,
      'importar() no invalido el sello');
    assert.match(aviso, /Respaldo importado/,
      'el importe no llego a buen puerto, asi que esta prueba no midio nada');
    assert.equal(JSON.parse(P.almacen['joan_socios_v1']).socios[0].nombre, 'Ana',
      'la cartera nueva no quedo escrita');
  });

  test('importar() NO llama «invalido» a un respaldo que solo no cupo', () => {
    /* El respaldo es HOY la unica copia de las fotos que existe fuera de este
       navegador (crm.html lo serializa entero, base64 adentro), y el aviso rojo
       de «no pude guardar» le ofrece a Joan exactamente ese archivo. Decirle que
       esta dañado cuando lo que falto fue sitio lo manda a buscar otro que no
       existe — y a desconfiar del unico bueno que tiene.
       MUTANTE QUE CAZA: devolver el setItem adentro del try grande. */
    const P = abrirPanel({ topeKB: 0.001 });   /* el almacen se llena con nada */
    const aviso = importarEn(P, RESPALDO);

    assert.doesNotMatch(aviso, /Archivo inv/i,
      'al navegador le falto espacio y el CRM acuso al archivo: «' + aviso.split('\n')[0] + '»');
    assert.match(aviso, /no cupo|espacio/i,
      'no se le dijo a Joan que lo que falto fue espacio');
    assert.match(aviso, /no se perdi/i,
      'no se le dijo que lo que ya tenia sigue intacto, que es la mitad que quita el susto');
  });

  test('y un archivo de VERDAD roto si se llama invalido', () => {
    /* La otra mitad: si se arregla lo de arriba tapando el mensaje, esta se
       pone roja. Las dos juntas obligan a distinguir, que es el punto. */
    const P = abrirPanel();
    assert.match(importarEn(P, 'esto no es json'), /Archivo inv/i,
      'un archivo ilegible dejo de avisarse como tal');
  });

  test('traer.html tambien invalida el espejo', () => {
    /* Esta sigue siendo de texto y lo digo: traer.html no tiene banco. Se
       compensa con que su hermana de arriba SI ejecuta, y las dos cambian por
       el mismo motivo. */
    const t = fs.readFileSync(path.join(RAIZ, 'panel', 'traer.html'), 'utf8');
    const i = t.indexOf('localStorage.setItem(KEY, texto);');
    assert.ok(i > -1, 'no encontre el escritor de la cartera en traer.html');
    const despues = t.slice(i, i + 900);
    assert.match(despues, /removeItem\('joan_panel_espejo_pc'\)/,
      'traer.html reemplaza la cartera y NO invalida el espejo');
    assert.match(despues, /removeItem\('joan_crm_sello'\)/,
      'traer.html no invalida el sello');
  });
});
