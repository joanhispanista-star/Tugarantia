/* ============================================================================
 * play/ DEJA DE SER INSTALABLE — 23-oct-2026
 *
 *   node --test pruebas/play-no-se-instala.test.js
 *
 * Desde el 21-oct la única app que se ofrece es app/socio.html (decisión de
 * Joan: «Chrome Instalar, sin APK», una sola app). play/ dejó de ofrecerse y
 * calló la franja de Chrome (preventDefault de beforeinstallprompt), pero
 * seguía enlazando su manifiesto, y Chrome la daba por instalable desde el
 * menú ⋮ con 0 errores (auditoría del 23-oct, en el túnel y en
 * tugarantia.net). Resultado: dos «Tu Garantía» con los mismos íconos en el
 * teléfono, y la de play/ pide la contraseña en cada apertura (guarda la
 * sesión en sessionStorage a propósito).
 *
 * Lo que cuidan estas pruebas:
 *   1. play/index.html no enlaza ningún manifiesto ni se declara app web en
 *      iPhone (apple-mobile-web-app-capable).
 *   2. El ARCHIVO play/app.webmanifest se queda, con su id de siempre y en la
 *      precarga de sw.js: el WebAPK de quien ya la instaló lo lleva adentro y
 *      la sigue abriendo.
 *   3. La única página del cliente que enlaza un manifiesto de Tu Garantía es
 *      app/socio.html (PlataChat es otra marca; el Panel es de Joan).
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = t => t.replace(/<!--[\s\S]*?-->/g, ' ');

describe('play/ deja de ser instalable (23-oct-2026)', () => {

  test('play/index.html no enlaza manifiesto ni se declara app web de iPhone', () => {
    const P = sinComentarios(leer('play/index.html'));
    const cabeza = P.slice(0, P.indexOf('</head>'));
    assert.ok(!/<link[^>]+rel=["']?manifest/i.test(cabeza), 'play/ sigue enlazando su manifiesto: Chrome la deja instalar desde el menú');
    assert.ok(!/apple-mobile-web-app-capable/.test(cabeza), 'play/ sigue declarándose app web en iPhone');
    /* Y ningún guion lo vuelve a poner en caliente. */
    assert.ok(!/rel\s*=\s*['"]manifest['"]|\.rel\s*=\s*['"]manifest/.test(P.replace(/\/\*[\s\S]*?\*\//g, ' ')),
      'un guion de play/ vuelve a enlazar un manifiesto');
  });

  test('el archivo se queda: mismo id, y en la precarga de sw.js', () => {
    const m = JSON.parse(leer('play/app.webmanifest'));
    assert.equal(m.id, '/play/', 'cambió el id: las instalaciones de play/ que ya existen se rompen');
    const SW = leer('sw.js');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS'), SW.indexOf('].map(f => BASE + f)'));
    assert.ok(lista.indexOf("'play/app.webmanifest'") >= 0, 'play/app.webmanifest salió de la precarga');
    /* El id es el de lo publicado, si hay con qué comparar. */
    let publicado = null;
    for (const rama of ['origin/main', 'main']) {
      try {
        publicado = execFileSync('git', ['show', rama + ':play/app.webmanifest'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        break;
      } catch (e) { /* la siguiente */ }
    }
    if (publicado) assert.equal(m.id, JSON.parse(publicado).id);
  });

  test('la única página del cliente con manifiesto de Tu Garantía es app/socio.html', () => {
    const paginas = ['index.html', 'play/index.html', 'play/borrar-cuenta.html', 'descargas/index.html',
                     'legal/terminos.html', 'legal/privacidad.html', 'app/socio.html']
      .filter(f => fs.existsSync(path.join(RAIZ, f)));
    const conManifiesto = paginas.filter(f => /<link[^>]+rel=["']?manifest/i.test(sinComentarios(leer(f))));
    assert.deepEqual(conManifiesto, ['app/socio.html']);
  });
});
