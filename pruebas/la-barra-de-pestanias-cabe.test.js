'use strict';
/* ==========================================================================
 * LA BARRA DE PESTAÑAS DEL ESPEJO CABE EN LA PANTALLA
 * 22 de septiembre de 2026
 *
 * Medido en un iPhone emulado: la barra pedía 418 px sobre una pantalla de
 * 375. Siete pestañas de 59 px que no podían encoger, porque el CSS decía
 * `flex:1 0 3.7rem` — el 0 del medio es el ENCOGER, y estaba prohibido.
 *
 * Lo que lo hacía difícil de ver: `overflow-x:auto`. La barra se deslizaba de
 * lado, así que no había nada roto a la vista; simplemente «Quincena» salía
 * cortada y parecía el borde de la pantalla. Un defecto que se esconde solo.
 *
 * ---------------------------------------------------------------------------
 * PERO EL ANCHO ERA EL SÍNTOMA.
 *
 * Dos de las siete pestañas —Ficha y Crédito— no eran destinos: son el DETALLE
 * de una persona o de un crédito. A las dos se llega abriendo a alguien. Si se
 * tocaban en frío, lo único que hacían era contestar «búscalo en Buscar». Dos
 * pestañas permanentes cuyo trabajo era mandarte a otra, ocupando 120 px de
 * 375.
 *
 * Quitarlas obliga a devolver lo que la barra hacía de mala manera: una salida
 * («volver», que nombra su destino) y un sitio donde leer dónde estás (la barra
 * marca la pestaña de ORIGEN mientras se mira un detalle).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTAS PRUEBAS Y NO UNA CAPTURA
 *
 * Node no puede medir texto. Así que no se comprueba el ancho: se comprueban
 * las DOS condiciones que hacen imposible el desborde pase lo que pase —que las
 * pestañas puedan encoger sin suelo, y que no se cuelen más de cinco—. Con esas
 * dos, el ancho de la barra lo manda la pantalla y no la suma de sus partes.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ESPEJO = fs.readFileSync(
  path.join(__dirname, '..', 'panel', 'espejo.html'), 'utf8');

/* El bloque <nav id="nav"> ... </nav>, que es el único sitio del archivo donde
   un data-v significa «vista». Hay otros data-v en la hoja de cobro que llevan
   un MONTO, y contarlos como pestañas daría una cifra falsa. */
const NAV = (() => {
  const i = ESPEJO.indexOf('id="nav"');
  assert.ok(i > 0, 'no existe la barra de pestañas');
  return ESPEJO.slice(i, ESPEJO.indexOf('</nav>', i));
})();

const PESTANIAS = [...NAV.matchAll(/data-v="([a-z]+)"[^>]*>([^<]*)</g)]
  .map(m => ({ v: m[1], texto: m[2].trim() }));

const funcion = nombre => {
  const i = ESPEJO.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return ESPEJO.slice(i, ESPEJO.indexOf('\n}', i));
};

describe('la barra no puede desbordarse', () => {

  test('las pestañas pueden encoger, y sin suelo', () => {
    /* `flex:1 0 <algo>` es lo que causó el defecto: el 0 prohíbe encoger, así
       que cada pestaña conservaba su ancho aunque la suma no cupiera. */
    assert.match(ESPEJO, /\.nav button\{flex:1 1 0;min-width:0/,
      'la barra volvió a un flex que no encoge: con una pestaña más se desborda ' +
      'otra vez, y como la barra se desliza de lado no se va a ver');
  });

  test('y si algún día no cupiera el texto, se corta dentro de su pestaña', () => {
    /* Sin esto el texto se sale del botón y se monta sobre el de al lado, que
       se lee como una pantalla rota en vez de como una pestaña estrecha. */
    const reglas = ESPEJO.slice(ESPEJO.indexOf('.nav button{'),
                                ESPEJO.indexOf('.nav button.on'));
    assert.match(reglas, /overflow:hidden/);
    assert.match(reglas, /text-overflow:ellipsis/);
  });

  test('no hay más de cinco pestañas', () => {
    /* Cinco es lo que cabe legible en 320 px, que es el iPhone más estrecho que
       todavía se usa. Encoger impide el desborde; este tope impide que la
       solución sea cinco pestañas ilegibles de 40 px. */
    assert.ok(PESTANIAS.length <= 5,
      'la barra tiene ' + PESTANIAS.length + ' pestañas: ' +
      PESTANIAS.map(p => p.texto).join(', ') + '. Si de verdad hace falta una ' +
      'sexta, el sitio no es la barra — mira primero si no es un detalle, como ' +
      'pasó con Ficha y Crédito.');
  });
});

describe('el detalle no vuelve a ser una pestaña', () => {

  test('Ficha y Crédito no están en la barra', () => {
    const v = PESTANIAS.map(p => p.v);
    assert.equal(v.includes('ficha'), false,
      'Ficha volvió a la barra: tocarla en frío solo sabe decir «búscalo en Buscar»');
    assert.equal(v.includes('credito'), false, 'Crédito volvió a la barra');
  });

  test('pero siguen existiendo como vistas', () => {
    /* Quitarlas de la barra no es quitarlas: se llega abriendo a alguien. */
    assert.match(ESPEJO, /VISTA === 'ficha'/);
    assert.match(ESPEJO, /VISTA === 'credito'/);
    assert.match(ESPEJO, /var DETALLE = \{ ficha: 1, credito: 1 \}/,
      'sin DETALLE, la barra no sabe que está mirando un detalle y se apaga entera');
  });

  test('toda pestaña de la barra lleva a algún sitio', () => {
    /* Una pestaña sin rama en pintar() no da error: deja la pantalla en blanco
       con el título puesto, que es peor que un error porque parece vacío. */
    PESTANIAS.forEach(p => {
      assert.ok(ESPEJO.indexOf("VISTA === '" + p.v + "'") > 0,
        'la pestaña «' + p.texto + '» (' + p.v + ') no tiene vista: deja la ' +
        'pantalla en blanco');
    });
  });
});

describe('de un detalle siempre se puede salir', () => {

  test('las dos vistas pintan el botón de volver', () => {
    assert.match(funcion('vistaFicha'), /botonVolver\(\)/,
      'sin salida y sin pestaña, quien abra una ficha se queda encerrado');
    assert.match(funcion('vistaCredito'), /botonVolver\(\)/);
  });

  test('incluso cuando no hay nadie que enseñar', () => {
    /* Se llega a este estado si la nube borra a quien se estaba mirando. Es
       justo cuando más falta hace la salida. */
    const f = funcion('vistaFicha');
    assert.match(f.slice(0, f.indexOf('</div>')), /botonVolver\(\)/,
      'el vacío de la ficha devuelve antes de pintar la salida');
    const c = funcion('vistaCredito');
    assert.match(c.slice(0, c.indexOf('</div>')), /botonVolver\(\)/,
      'el vacío del crédito devuelve antes de pintar la salida');
  });

  test('y el botón está enchufado', () => {
    assert.match(ESPEJO, /acc === 'volver'\) \{ volver\(\); \}/,
      'el botón de volver se pinta pero nadie lo escucha');
  });

  test('volver NO apila', () => {
    /* Si volver apilara, cada ida y vuelta dejaría la pila creciendo y el botón
       de atrás nunca saldría de las dos últimas pantallas. */
    assert.equal(/PILA\.push/.test(funcion('volver')), false,
      'volver volvió a apilar: el botón de atrás se queda dando vueltas entre ' +
      'las dos últimas pantallas');
    assert.match(funcion('volver'), /PILA\.pop\(\)/);
  });

  test('el camino se guarda entero, no solo el último sitio', () => {
    /* Buscar -> ficha -> crédito tiene que volver a la FICHA y después a
       Buscar. Con una sola variable ese paso intermedio se pierde y el crédito
       devuelve a Buscar saltándose al socio que se estaba mirando. */
    assert.match(ESPEJO, /var PILA = \[\]/);
    assert.match(funcion('ir'), /PILA\.push\(VISTA\)/);
    assert.match(funcion('ir'), /v !== VISTA/,
      'sin esa guarda, quedarse en la misma vista apila duplicados');
  });

  test('entrar por una pestaña borra el camino', () => {
    assert.match(funcion('ir'), /PILA\.length = 0/,
      'la pila no se limpia al tocar una pestaña: el botón de atrás acabaría ' +
      'ofreciendo volver a una pantalla de hace media hora');
  });
});

describe('la barra dice dónde estás aunque estés en un detalle', () => {

  test('marca la pestaña de origen', () => {
    const f = funcion('pintarVista');
    assert.match(f, /DETALLE\[v\] \? raiz : v/,
      'la barra volvió a marcar por la vista actual: al abrir una ficha se ' +
      'apagan las cinco luces y el teléfono se queda sin decir dónde estás');
  });

  test('y la busca en vez de dar por hecho que es la primera de la pila', () => {
    assert.match(funcion('pintarVista'), /if \(!DETALLE\[PILA\[i\]\]\)/,
      'si algún día se llega a un detalle desde otro detalle, la barra se ' +
      'encendería en el sitio equivocado');
  });
});
