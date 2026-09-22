'use strict';
/* ==========================================================================
 * LA FOTO GRANDE TAMBIÉN SE COMPRUEBA — 22 de septiembre de 2026
 *
 * Lo encontró una revisión adversaria el mismo día que se construyeron las
 * fotos, y lo incómodo es que EL REPO YA CONOCÍA ESTE ATAQUE. En `app/chat.js`
 * está escrito, con su comentario: «un src sale del atributo con un simple
 * x" onerror=…, así que escapar no alcanza». Y la comprobación se aplicaba
 * solo a la MINIATURA. La foto grande, veinte líneas más allá y en los DOS
 * visores, se pintaba cruda.
 *
 * EL CAMINO ENTERO, porque sin él esto parece una precaución de manual:
 *
 *   1. Cualquiera abre cuenta: el registro no comprueba el celular y la llave
 *      pública está en la página, por diseño.
 *   2. En vez del botón, llama la función directamente y manda como «foto»
 *      `data:image/png;base64,AAAA" onerror="…"`. El CHECK de la tabla solo
 *      exigía que EMPEZARA por data:image/ — entraba sin despeinarse.
 *   3. La manda SIN miniatura. Así en la bandeja sale como «📎 Foto»: un
 *      adjunto que no cargó. Y el pie lo escribe él: «no se ve, ábrela».
 *   4. Joan toca. El visor abría `window.open()` SIN dirección, y un
 *      about:blank así HEREDA EL ORIGEN de quien lo abre: el guión no corría
 *      en una pestaña cualquiera, corría DENTRO del CRM.
 *   5. Allí, en localStorage, está la clave de sincronización de Joan. Con
 *      ella: `chat_foto_panel(clave, 1)`, `(clave, 2)`, `(clave, 3)`… el id es
 *      correlativo y esa función no filtra por cédula. Los comprobantes de
 *      pago de TODOS sus clientes, uno detrás de otro.
 *
 * La reja que la migración probaba con dos sesiones no servía de nada: no se
 * saltaba, se rodeaba robando la llave que abre la otra puerta.
 *
 * Este archivo guarda las DOS capas, porque cada una sola se puede caer:
 *   · que la fuente se COMPRUEBE entera, con una sola definición para todos;
 *   · que se ASIGNE como propiedad y no se construya HTML, que es lo que hace
 *     que una comprobación rota mañana no vuelva a ser un agujero.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PLAY = leer('play/index.html');
const CRM = leer('panel/crm.html');

describe('qué cuenta como una foto, en un solo sitio', () => {

  test('la comprobación está exportada: una sola definición para todos', () => {
    /* Dos definiciones de lo mismo es una que se queda atrás, y eso es
       exactamente lo que pasó: la miniatura tenía la buena y la grande no. */
    assert.equal(typeof CHAT.esFoto, 'function',
      'no hay una comprobación compartida: cada visor se hará la suya y una se quedará atrás');
  });

  test('una foto de verdad pasa', () => {
    assert.equal(CHAT.esFoto('data:image/jpeg;base64,AAAA+/=='), true);
    assert.equal(CHAT.esFoto('data:image/png;base64,iVBORw0KGgo='), true);
    assert.equal(CHAT.esFoto('data:image/svg+xml;base64,PHN2Zz4='), true);
  });

  test('y la de este ataque, no', () => {
    assert.equal(CHAT.esFoto('data:image/png;base64,AAAA" onerror="alert(1)'), false,
      'se sale del atributo: es el ataque entero en una línea');
    assert.equal(CHAT.esFoto('javascript:alert(1)'), false);
    assert.equal(CHAT.esFoto('data:text/html;base64,PHNjcmlwdD4='), false);
    assert.equal(CHAT.esFoto('data:video/mp4;base64,AAAA'), false);
  });

  test('el ancla del final vale tanto como la del principio', () => {
    /* Sin el `$`, «empieza bien» es todo lo que se pide y detrás cabe lo que
       sea. Es literalmente lo que fallaba: el CHECK de la base hacía
       `like 'data:image/%'` y nada más. */
    assert.equal(CHAT.esFoto('data:image/png;base64,AAAA<script>x</script>'), false,
      'basta con empezar bien para pasar: falta el ancla del final');
    assert.equal(CHAT.esFoto('data:image/png;base64,AAAA\n<img onerror=x>'), false,
      'un salto de línea se cuela por detrás');
    assert.equal(CHAT.esFoto('data:image/png;base64,AAAA ' ), false,
      'un espacio al final basta para empezar a escribir otro atributo');
  });

  test('lo que no es una cadena, tampoco', () => {
    [null, undefined, 7, {}, [], { toString: () => 'data:image/png;base64,AA' }]
      .forEach(x => assert.equal(CHAT.esFoto(x), false,
        'algo que no es texto pasó la comprobación: ' + String(x)));
  });
});

describe('los dos visores ya no construyen HTML', () => {

  const visor = (archivo, texto) => {
    const i = texto.indexOf('function mostrarFoto(');
    assert.ok(i > 0, 'no hay visor en ' + archivo);
    /* Sin comentarios: el que explica este arreglo cita la línea mala, y una
       prueba que mire la prosa se caza a sí misma. Ya pasó tres veces. */
    return texto.slice(i, i + 2600).replace(/\/\*[\s\S]*?\*\//g, ' ');
  };

  [['play/index.html', PLAY], ['panel/crm.html', CRM]].forEach(([nombre, texto]) => {

    test(nombre + ': comprueba la fuente antes de enseñarla', () => {
      assert.match(visor(nombre, texto), /\.esFoto\(imagen\)/,
        'se enseña la foto sin comprobar de qué forma es');
    });

    test(nombre + ': la fuente se ASIGNA, no se escribe dentro de un atributo', () => {
      /* Esta es la capa que sostiene a la otra. Una propiedad no puede salirse
         de ningún atributo aunque la comprobación fallara algún día. */
      const v = visor(nombre, texto);
      assert.match(v, /img\.src = imagen/,
        'la fuente no se asigna como propiedad');
      assert.equal(/document\.write/.test(v), false,
        'volvió el document.write: es por donde entraba el guión');
      assert.equal(/<img src="/.test(v), false,
        'se vuelve a construir el atributo a mano, que es el agujero entero');
    });

    test(nombre + ': ya no abre un about:blank, que hereda el origen', () => {
      const v = visor(nombre, texto);
      assert.equal(/window\.open\(\s*\)/.test(v), false,
        'window.open() sin dirección abre un about:blank que HEREDA el origen ' +
        'de esta página: cualquier guión de ahí dentro lee lo que esta página guarda');
    });
  });

  test('y no queda ningún otro sitio pintando la imagen grande a mano', () => {
    [['play/index.html', PLAY], ['panel/crm.html', CRM]].forEach(([nombre, t]) => {
      assert.equal(t.indexOf('+j.imagen+') >= 0 || t.indexOf("+ j.imagen +") >= 0, false,
        nombre + ' vuelve a concatenar la imagen dentro de una cadena de HTML');
    });
  });
});

describe('y el freno de abajo, en la base', () => {

  const SQL = leer('base/20260922g_la_foto_comprobada_entera.sql')
    .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

  test('el CHECK mira la forma ENTERA, no solo el principio', () => {
    assert.match(SQL, /imagen ~ '\^data:image\/\[a-z\+\]\{2,12\};base64,\[A-Za-z0-9\+\/=\]\+\$'/,
      'el CHECK vuelve a mirar solo el principio de la cadena');
    assert.equal(/check \(imagen like 'data:image\/%'/.test(SQL), false,
      'sigue el CHECK viejo, el que dejaba pasar el ataque');
  });

  test('y la miniatura también, que es por donde iba el cebo', () => {
    /* Sin miniatura la burbuja sale como «un adjunto que no cargó», que es
       justo lo que invita a tocarla. Por eso no basta con mirar la grande. */
    assert.match(SQL, /miniatura ~ '\^data:image\//,
      'la miniatura vuelve a entrar sin que nadie la mire');
    assert.match(SQL, /mini !~ buena/,
      'la función no revisa la miniatura: el fallo saldría como un error pelado ' +
      'y la app lo traduciría como «revisa tu internet»');
  });

  test('la misma frase en la base y en la pantalla', () => {
    /* Que las dos capas digan lo mismo no es elegancia: si la base acepta algo
       que la pantalla rechaza, aparece un adjunto que nadie puede abrir; y al
       revés es el agujero de hoy. */
    const dePantalla = /^data:image\/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$/.source;
    const deLaBase = (SQL.match(/'(\^data:image\/\[a-z\+\]\{2,12\};base64,\[A-Za-z0-9\+\/=\]\+\$)'/) || [])[1];
    assert.ok(deLaBase, 'no se encuentra la frase en la migración');
    assert.equal(deLaBase.replace(/\\/g, ''), dePantalla.replace(/\\/g, ''),
      'la base y la pantalla ya no comprueban lo mismo');
  });
});
