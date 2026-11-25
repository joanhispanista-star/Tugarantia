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

  /* 24-nov-2026 — decía «decide por la cartera, no por el tipo de aparato», y vetaba
     mirar el userAgent. Lo que esa regla cuidaba sigue en pie: un COMPUTADOR sin la
     cartera no va a un CRM vacío. Lo nuevo es que en un CELULAR sin cartera el CRM ya
     no está vacío (v162: panel/crm-remoto.js lo abre desde la nube, para mirar), y la
     puerta tiene que llevar a Joan hasta él. */
  test('con la cartera, al CRM; sin ella, un celular al CRM (desde la nube) y un computador al Panel en el bolsillo', () => {
    assert.match(PUERTA_CODIGO, /var destinoJoan = \(cartera \|\| celular\) \? 'crm\.html' : 'espejo\.html'/);
    assert.equal(/matchMedia|pointer:coarse|innerWidth/.test(PUERTA_CODIGO), false,
      'decide por el ANCHO de la pantalla: una ventana angosta en el computador iría a un CRM sin cartera');
    /* La puerta de verdad, corrida con cada aparato y cada cajón. */
    const guion = /<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>\s*<\/body>/.exec(PUERTA)[1];
    const abrir = (nav, conCartera, recordado) => {
      const el = {}, disco = Object.assign({}, conCartera ? { joan_socios_v1: '{}' } : {}, recordado ? { tg_puerta_panel: recordado } : {});
      const elem = id => (el[id] = el[id] || { id, href: '', innerHTML: '', textContent: '', _oy: {},
        classList: { add() {}, remove() {} }, addEventListener(t, f) { this._oy[t] = f; } });
      const ctx = { navigator: nav, location: { search: '', href: '' }, document: { getElementById: elem },
        localStorage: { get length() { return Object.keys(disco).length; }, key: i => Object.keys(disco)[i] || null,
          getItem: k => (k in disco ? disco[k] : null), setItem: (k, v) => { disco[k] = String(v); }, removeItem: k => { delete disco[k]; } },
        setTimeout: f => { ctx._irse = f; return 1; }, clearTimeout() {} };
      require('node:vm').runInNewContext('(function () {' + guion + '})();', ctx);
      return { href: elem('btnJoan').href, nota: elem('notaJoan').innerHTML, entrando: elem('recordadoTxt').textContent,
               irse: () => { ctx._irse(); return ctx.location.href; } };
    };
    const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 };
    const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', maxTouchPoints: 5 };
    const IPAD = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', maxTouchPoints: 5 };
    const PC = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 0 };
    const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', maxTouchPoints: 0 };
    [IPHONE, ANDROID, IPAD].forEach(n => {
      const p = abrir(n, false);
      assert.equal(p.href, 'crm.html', 'un celular sin cartera no llega al CRM: ' + n.userAgent);
      assert.match(p.nota, /En el celular el CRM es <b>solo para mirar<\/b>/, 'no dice que ahí solo se mira');
      assert.match(p.nota, /<a href="espejo\.html">Para registrar un cobro, abre el Panel en el bolsillo<\/a>/, 'no deja tomar el otro camino');
    });
    [PC, MAC].forEach(n => {
      const p = abrir(n, false);
      assert.equal(p.href, 'espejo.html', 'un computador sin cartera va a un CRM que no tiene de dónde pintar');
      assert.match(p.nota, /Abrir el CRM de todas formas<\/a> \(aquí no está tu cartera\)/);
    });
    [IPHONE, PC].forEach(n => assert.equal(abrir(n, true).href, 'crm.html'));
    /* Y el aparato que ya recordaba «soy Joan» (el iPhone de Joan lo recuerda): entra solo al mismo sitio. */
    const rec = abrir(IPHONE, false, 'joan');
    assert.equal(rec.entrando, 'Entrando a tu CRM…');
    assert.equal(rec.irse(), 'crm.html');
    assert.equal(abrir(PC, false, 'joan').irse(), 'espejo.html');
  });
  test('«¿es un celular?» se contesta igual que en el CRM (panel/crm-remoto.js): si una cambia, la otra también', () => {
    const R = require('../panel/crm-remoto.js');
    const f = /function esCelular\(\) \{([\s\S]*?)\n  \}/.exec(PUERTA_CODIGO.replace(/\r\n/g, '\n'));
    assert.ok(f, 'la puerta ya no tiene su esCelular');
    const dePuerta = nav => require('node:vm').runInNewContext('(function () {' + f[1] + '})()', { navigator: nav });
    [['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', 5], ['Mozilla/5.0 (iPod touch)', 5], ['Mozilla/5.0 (iPad; CPU OS 12_0)', 5],
     ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5], ['Mozilla/5.0 (Windows Phone 10.0)', 1],
     ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5], ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0],
     ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 1], ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0],
     ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 10], ['Mozilla/5.0 (X11; Linux x86_64)', 0], ['', 0]]
      .forEach(([userAgent, maxTouchPoints]) => {
        const nav = { userAgent, maxTouchPoints };
        assert.equal(dePuerta(nav), R.esCelular(nav), 'la puerta y el CRM no dicen lo mismo de: ' + userAgent + ' (' + maxTouchPoints + ')');
      });
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
    /* 4-nov-2026 — ya no sale vacío: la puerta del CRM dice dónde está la cartera. */
    assert.match(PUERTA, /Abrir el CRM de todas formas<\/a> \(aquí no está tu cartera\)/,
      'sin decir que aquí no está su cartera, el enlace de escape es una trampa');
    assert.match(PUERTA, /O abre el Panel en el bolsillo/);
    /* 24-nov-2026 — y el del celular: dice que ahí solo se mira y deja ir a registrar el cobro. */
    assert.match(PUERTA, /En el celular el CRM es <b>solo para mirar<\/b>/);
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
    /* 4-nov-2026: el hash ya no lleva `clave-nube=` (se quitó), pero un enlace viejo
       que lo traiga tampoco abre la puerta del equipo. */
    const re = /^#equipo(?:$|&)/;
    assert.equal(re.test('#clave-nube=abc'), false);
    assert.equal(re.test('#equipos'), false);
    assert.equal(re.test('#equipo'), true);
    assert.equal(re.test('#equipo&x=1'), true);
  });
});

describe('el link del cliente sigue siendo UNO, y su camino sigue vivo', () => {

  test('la portada tiene un solo botón de entrada, a play/', () => {
    /* 17-nov-2026 — la franja «Cómo entrar» y su botón rojo se fueron (Joan:
       «mucha información que el cliente no leerá»). La puerta es el «Entrar»
       de la cabecera, que es fija y va directo. Y si algún botón vuelve a
       bajar a un #ancla, el ancla tiene que existir: «Entrar» bajaba a
       #entrar, y quitar la franja sin tocarlo lo habría dejado en el aire. */
    assert.match(PORTADA, /<a class="btn btn-linea" href="play\/">Entrar<\/a>/);
    const vivo = PORTADA.replace(/<!--[\s\S]*?-->/g, ' ');
    (vivo.match(/href="#[\w-]+"/g) || []).forEach((h) => {
      const id = h.slice(7, -1);
      assert.ok(vivo.indexOf('id="' + id + '"') >= 0, 'la portada enlaza a #' + id + ' y ese id no existe');
    });
  });

  test('el cliente de siempre junta su historial desde adentro', () => {
    /* Esto es lo que hace que la portada NO sea un callejón sin salida para
       quien entra con su código de cinco letras. Si desapareciera, el link del
       cliente dejaría de ser uno y habría que volver a repartir socio.html. */
    const PLAY = leer('play/index.html');
    /* 7-oct-2026 — AL REVÉS. Esto exigía vincularHistorial y vincular_cuenta,
       y desde que Joan apagó los códigos solo seguía en verde porque los
       comentarios que cuentan por qué se fueron los nombran. El link sigue
       siendo UNO por otro camino: el antiguo abre su cuenta en play/ como
       cualquiera y Joan la junta con su ficha con un toque. Lo que se exige
       ahora es que el código vivo no llame a la función cerrada y que Perfil
       le diga que no tiene que hacer nada. */
    const vivo = PLAY.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    assert.ok(!/vincular_cuenta|function vincularHistorial|function tarjetaVincular/.test(vivo),
      'play/ volvió a llamar a vincular_cuenta, que la nube le quitó a la sesión');
    /* Se pegan los trozos «' + '» para que un reacomodo de líneas no la rompa. */
    const pegado = vivo.replace(/'\s*\+\s*'/g, '');
    assert.match(pegado, /Si ya eras cliente, no tienes que hacer nada: revisamos que seas tú y juntamos tu historial con esta cuenta\. Te avisamos por el chat cuando esté\./,
      'Perfil ya no le dice al antiguo qué pasa con su historial');
  });

  test('y la puerta se lo explica', () => {
    /* 7-oct-2026 (segunda vuelta) — sin código: Joan los apagó el 7-oct. La
       portada decía «pegas el código de cinco caracteres», y esa caja ya no
       junta nada desde base/20261007_una_puerta.sql.
       17-nov-2026 — lo explicaba la franja «Cómo entrar» de la portada, que se
       quitó. Lo dice play/ en la fachada, justo cuando se va a registrar
       (pruebas/una-puerta-play.test.js lo mira ya pintado). */
    assert.match(leer('play/index.html'), /No necesitas ningún código/);
    assert.ok(!/pegas el código/.test(PORTADA), 'la portada todavía manda a pegar un código');
  });
});

describe('el service worker', () => {

  test('la puerta entra a la precarga', () => {
    /* Sin eso, un celular sin señal abriría desde la caché el 404 viejo. */
    assert.match(SW, /'panel\/index\.html',/);
  });
});
