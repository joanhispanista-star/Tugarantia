'use strict';
/* ==========================================================================
 * DOS LINKS: UNO PARA EL PANEL, UNO PARA EL CLIENTE
 * 26 de septiembre de 2026
 *
 * Joan: «quiero solo dos links, uno para el panel de control y otro para el
 * cliente».
 *
 *   PANEL    https://tugarantia.net/panel    → panel/index.html (NUEVO)
 *   CLIENTE  https://tugarantia.net          → index.html (ya lo era)
 *
 * ---------------------------------------------------------------------------
 * EL DEL CLIENTE NO SE TOCÓ, Y CASI SE TOCA MAL
 *
 * La portada manda a todos a play/ con un solo botón (14-sep), y play/ pide
 * celular y contraseña — no el código de cinco letras con el que entra un
 * cliente de siempre. Se leyó como un callejón sin salida y estuvo a punto de
 * «arreglarse» abriendo una segunda puerta. No lo era: adentro, en Perfil, el
 * cliente pega su código y `vincular_cuenta` junta su historial. Las pruebas
 * de abajo existen para que nadie más lo lea mal: vigilan que ese camino siga
 * vivo, porque es lo único que hace que el link del cliente sea UNO.
 *
 * ---------------------------------------------------------------------------
 * A JOAN NO SE LE MIRA EL APARATO: SE LE MIRA EL CAJÓN
 *
 * La cartera vive en el localStorage de UN navegador. En cualquier otro,
 * crm.html abre vacío — y ese vacío miente con un ✓ verde. La puerta comparte
 * origen con crm.html, así que puede mirar si la cartera está: si está, CRM; si
 * no, el Panel en el bolsillo, que trae de la nube.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PUERTA = leer('panel/index.html');
const CRM = leer('panel/crm.html');
const PORTADA = leer('index.html');
const SW = leer('sw.js');

/* Solo lo que se ejecuta: los comentarios de este repo explican con las mismas
   palabras que buscan las pruebas, y un centinela que lee la prosa se caza a sí
   mismo. Pasó cuatro veces en una semana. */
const sinComentarios = s => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const PUERTA_CODIGO = sinComentarios(PUERTA);

describe('el link del panel existe', () => {

  test('tugarantia.net/panel ya no es un 404', () => {
    assert.match(PUERTA, /<title>Tu Garantía · Panel<\/title>/);
  });

  test('lleva la guarda de la «s», ARRIBA de todo', () => {
    /* Esta puerta decide mirando el cajón, y sin la «s» mira el cajón
       equivocado: diría «tu cartera no está» sobre un computador que la tiene. */
    const iGuarda = PUERTA.indexOf("location.protocol === 'http:'");
    const iDecide = PUERTA.indexOf('function hayCartera');
    assert.ok(iGuarda > 0 && iGuarda < iDecide,
      'la guarda de https tiene que ir antes de mirar el almacenamiento');
  });

  test('las dos puertas están, cada una con su destino', () => {
    assert.match(PUERTA, /id="btnJoan"/);
    assert.match(PUERTA, /id="btnEquipo" href="crm\.html#equipo"/,
      'el equipo tiene que llegar a SU puerta, no al PIN de Joan');
  });
});

describe('a Joan se le mira el cajón, no el aparato', () => {

  test('decide por la cartera, no por el tipo de aparato', () => {
    assert.match(PUERTA_CODIGO, /var destinoJoan = cartera \? 'crm\.html' : 'espejo\.html'/);
    assert.equal(/userAgent|matchMedia|pointer:coarse|innerWidth/.test(PUERTA_CODIGO), false,
      'volvió a decidir por el aparato: en un segundo computador mandaría a Joan ' +
      'a un CRM vacío que dice «nada por gestionar»');
  });

  test('mira el NOMBRE de la llave, sin leer la cartera', () => {
    /* getItem traería megas de texto solo para saber si existe. */
    const f = PUERTA_CODIGO.slice(PUERTA_CODIGO.indexOf('function hayCartera'),
                                  PUERTA_CODIGO.indexOf('function leer'));
    assert.match(f, /localStorage\.key\(i\) === LLAVE_CARTERA/);
    assert.equal(/getItem\(LLAVE_CARTERA\)/.test(PUERTA_CODIGO), false);
  });

  test('y NO ESCRIBE NUNCA en la cartera de Joan', () => {
    assert.equal(/setItem\(\s*LLAVE_CARTERA|removeItem\(\s*LLAVE_CARTERA|setItem\(\s*'joan_socios_v1'/.test(PUERTA_CODIGO), false,
      'la puerta tocó la llave de la cartera: es la única escritura que no se permite');
    assert.match(PUERTA_CODIGO, /LLAVE_CARTERA = 'joan_socios_v1'/);
  });

  test('si el navegador no deja mirar, manda al espejo (el error barato)', () => {
    /* Safari en privado lanza al tocar localStorage. «No sé» tiene que acabar
       en el sitio que funciona en cualquier aparato, no en el CRM vacío. */
    const f = PUERTA_CODIGO.slice(PUERTA_CODIGO.indexOf('function hayCartera'),
                                  PUERTA_CODIGO.indexOf('function leer'));
    assert.match(f, /catch \(e\) \{\}/);
    assert.match(f, /return false;\s*\}\s*$/);
  });

  test('cada camino dice su consecuencia, y deja tomar el otro', () => {
    assert.match(PUERTA, /Abrir el CRM de todas formas<\/a> \(aquí saldría vacío\)/,
      'sin decir que saldría vacío, el enlace de escape es una trampa');
    assert.match(PUERTA, /O abre el Panel en el bolsillo/);
  });
});

describe('se acuerda de quién eres, sin encerrarte', () => {

  test('lo que recuerda es una comodidad de este aparato', () => {
    assert.match(PUERTA_CODIGO, /LLAVE_QUIEN = 'tg_puerta_panel'/);
    assert.match(PUERTA_CODIGO, /function leer\(\) \{ try \{/,
      'leer el recuerdo sin try: en Safari privado la puerta entera revienta');
  });

  test('«No soy yo» cancela la entrada Y olvida', () => {
    const i = PUERTA_CODIGO.indexOf("getElementById('noSoyYo')");
    const trozo = PUERTA_CODIGO.slice(i, i + 300);
    assert.match(trozo, /clearTimeout\(t\)/, 'sin cancelar, se va igual aunque digas que no eres tú');
    assert.match(trozo, /guardar\(null\)/, 'sin olvidar, la próxima vez vuelve a entrar como el otro');
  });

  test('?elegir fuerza el selector', () => {
    assert.match(PUERTA_CODIGO, /\[\?&\]elegir\\b/);
  });
});

describe('el CRM abre directo la puerta del equipo', () => {

  test('#equipo pinta la puerta del equipo', () => {
    assert.match(CRM, /if \(\/\^#equipo\(\?:\$\|&\)\/\.test\(location\.hash \|\| ''\)\) \{ try \{ pintarPuertaEquipo\(\); \} catch \(e\) \{\} \}/);
  });

  test('va DESPUÉS de enfocar el PIN', () => {
    /* Si pintarPuertaEquipo fallara, la pantalla se queda en la entrada de Joan,
       que es la de siempre, y no en blanco. */
    const iPin = CRM.indexOf("document.getElementById('pinInput').focus();");
    const iEq = CRM.indexOf('/^#equipo(?:$|&)/');
    assert.ok(iPin > 0 && iEq > iPin);
  });

  test('y #clave-nube NO dispara la puerta del equipo', () => {
    /* El hash del CRM también lleva `clave-nube=` para la sincronización. */
    const re = /^#equipo(?:$|&)/;
    assert.equal(re.test('#clave-nube=abc'), false);
    assert.equal(re.test('#equipos'), false);
    assert.equal(re.test('#equipo'), true);
    assert.equal(re.test('#equipo&x=1'), true);
  });
});

describe('el link del cliente sigue siendo UNO, y su camino sigue vivo', () => {

  test('la portada tiene un solo botón de entrada, a play/', () => {
    assert.match(PORTADA, /<a class="btn btn-rojo" href="play\/">Entrar o abrir mi cuenta<\/a>/);
  });

  test('el cliente de siempre junta su historial desde adentro', () => {
    /* Esto es lo que hace que la portada NO sea un callejón sin salida para
       quien entra con su código de cinco letras. Si desapareciera, el link del
       cliente dejaría de ser uno y habría que volver a repartir socio.html. */
    const PLAY = leer('play/index.html');
    assert.match(PLAY, /vincularHistorial/, 'play/ ya no deja juntar el historial con el código');
    assert.match(PLAY, /vincular_cuenta/);
  });

  test('y la portada se lo explica', () => {
    assert.match(PORTADA, /pegas el código de cinco caracteres/);
  });
});

describe('el service worker', () => {

  test('la puerta entra a la precarga', () => {
    /* Sin eso, un celular sin señal abriría desde la caché el 404 viejo. */
    assert.match(SW, /'panel\/index\.html',/);
  });
});
