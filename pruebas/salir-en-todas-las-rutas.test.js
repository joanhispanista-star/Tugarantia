/* ===========================================================================
 * QUIEN DIJO «SALIR» NO RECIBE — POR NINGUNA RUTA
 *
 * La salida es obligatoria en Colombia: quien responde SALIR no puede volver a
 * recibir. No es cortesía, es condición para poder mandar.
 *
 * Hay TRES rutas de envío en el CRM y el 16-sep-2026 solo dos consultaban la
 * lista de excluidos. La tercera —la de a uno, la del asesor— no pasaba `sinSMS`
 * en absoluto. Medido antes de tocarlo: con la lista, cero mensajes; sin ella,
 * uno. A quien pidió no recibir se le seguía escribiendo.
 *
 * Y hay un segundo hueco que este archivo vigila pero no puede cerrar: `noSMS`
 * no viaja en la cartera del equipo, así que un asesor no tiene ni el dato. La
 * regla adoptada es la del resto del proyecto: si no se puede comprobar, no se
 * manda.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../app/cobranza-envio.js');
const { abrirPanel } = require('./banco-panel.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

describe('la salida se respeta por todas las rutas (16-sep-2026)', () => {

  test('TODAS las llamadas a filasDeEnvio pasan la lista de excluidos', () => {
    /* Es un centinela de texto y lo digo: lo que vigila es que no aparezca una
       CUARTA ruta sin la lista. La de comportamiento es la de abajo.
       MUTANTE QUE CAZA: agregar un envío nuevo que olvide `sinSMS`. */
    const llamadas = CRM.split('E.filasDeEnvio(').slice(1);
    assert.ok(llamadas.length >= 3, 'esperaba al menos tres rutas de envío');

    const sinLista = [];
    llamadas.forEach((tr, i) => {
      const args = tr.slice(0, 260);
      /* La de la vista previa del editor de mensajes es la excepción legítima:
         arma un ejemplo con un caso inventado, no le escribe a nadie. */
      if (args.indexOf('ejemplo') > -1) return;
      if (args.indexOf('sinSMS') < 0) sinLista.push(i + 1);
    });
    assert.deepEqual(sinLista, [],
      'la(s) ruta(s) ' + sinLista.join(', ') + ' de filasDeEnvio no consultan la lista de ' +
      'quienes pidieron SALIR: a esa gente se le escribe igual');
  });

  test('con la lista, a quien dijo SALIR no se le arma mensaje', () => {
    const socios = [{ id: 'S9', noSMS: true, whatsappIgual: false,
                      telefono: '3001111111', whatsappNumero: '3002222222' }];
    const fuera = E.numerosQueSalieron(socios);
    const caso = { id: 'C1', socioId: 'S9', telefono: '3002222222',
                   nombre: 'Pedro', saldo: 50000, fecha_pago: '2026-09-20' };

    assert.equal(E.filasDeEnvio([caso], { sinSMS: fuera }).filas.length, 0,
      'se le arma mensaje a quien pidió no recibir');
    assert.equal(E.filasDeEnvio([caso], {}).filas.length, 1,
      'sin la lista se le escribe igual — que es exactamente el fallo que se arregló');
  });

  test('si no se puede comprobar la salida, NO se manda', () => {
    /* `noSMS` no viaja en la cartera del equipo, asi que el asesor no tiene el
       dato. La regla del proyecto es la misma que en la tanda del celular: no
       poder comprobar un tope es lo mismo que no poder mandar.

       ESTA PRUEBA EJECUTA. La primera version buscaba el texto «No puedo
       comprobar la salida» en el archivo y un `if (false)` alrededor de la
       guardia la pasaba en verde — el mutante escapo. Ahora corre la pantalla
       con la cartera local vacia, que es exactamente el modo asesor.
       MUTANTE QUE CAZA: `if (false)` sobre la guardia, o mandar igual. */
    const P = abrirPanel();
    P.cargarCartera({ socios: [], prestamos: [], config: { pin: '1234' } });
    P.ev('CARTERA_EQUIPO={yo:{id:"a1",rol:"asesor",celular:"3009999999"},' +
         'gente:[{id:"p1",nombre:"Pedro",celular:"3001111111",etapa:"M1A",saldo:50000,' +
         'creditos:1,fecha_pago:"2026-09-20",gestiones:[]}]}');
    P.ev('mensajearEq("p1","sms")');

    const m = String((P.elems['mBody'] || {}).innerHTML || '');
    assert.match(m, /No se manda/i,
      'con la cartera vacia no se puede comprobar quien pidio SALIR, y se mando igual');
    assert.match(m, /SALIR/,
      'no se le explica a quien mira por que no se mando');
    assert.doesNotMatch(m, /Mensaje de texto a|Enviar/i,
      'se llego a pintar la pantalla de envio pese a no poder comprobar la salida');
  });

  test('y a quien SI pidio salir se le dice eso, no «no pude armar el mensaje»', () => {
    /* «No pude armar el mensaje» manda a Joan a revisar el telefono de esa
       persona por un problema que no es ese.
       MUTANTE QUE CAZA: devolver el mensaje generico para el caso de la salida. */
    const P = abrirPanel();
    P.cargarCartera({
      socios: [{ id: 'p1', numero: 1, nombre: 'Pedro', cedula: '1', telefono: '3001111111',
                 whatsappIgual: true, noSMS: true, gestiones: [] }],
      prestamos: [], config: { pin: '1234' }
    });
    P.ev('CARTERA_EQUIPO={yo:{id:"a1",rol:"asesor",celular:"3009999999"},' +
         'gente:[{id:"p1",nombre:"Pedro",celular:"3001111111",etapa:"M1A",saldo:50000,' +
         'creditos:1,fecha_pago:"2026-09-20",gestiones:[]}]}');
    P.ev('mensajearEq("p1","sms")');

    const m = String((P.elems['mBody'] || {}).innerHTML || '');
    assert.match(m, /pidi[oó] no recibir mensajes/i,
      'no se dice que la persona pidio salir: se muestra un motivo que no es el real');
    assert.doesNotMatch(m, /no tiene un celular v[aá]lido/i,
      'se culpa al telefono de la persona cuando lo que paso es que pidio salir');
  });
});
