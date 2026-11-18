/* ============================================================================
 * NAVIDAD — app/temporada.js y app/temporada.css
 * 18 de noviembre de 2026.
 *
 *   node --test pruebas/temporada.test.js
 *
 * Joan (18-nov): «que tengamos en la plataforma un diseño de temporada
 * navideña hasta el 7 de enero». Escogió el alumbrado (boceto 18-A): una
 * guirnalda de focos colgando de la cabecera y «¡Feliz Navidad!» junto al
 * nivel.
 *
 * Es adorno, y casi todo lo que cuidan estas pruebas es lo que un adorno no
 * puede hacer:
 *
 *   · EQUIVOCARSE DE DÍA. En hora de Colombia, la del teléfono o la de
 *     cualquier zona: el último segundo del 30-nov no, el primero del 1-dic
 *     sí; el último del 7-ene sí, el primero del 8-ene no. Y vuelve sola cada
 *     diciembre.
 *   · PROMETER. El único texto es el saludo: ni regalos, ni bonos, ni rifas
 *     (Ley 643).
 *   · MOVERSE A QUIEN PIDIÓ QUE NO, o tapar un toque.
 *   · PESAR. El boceto dibujaba 36 focos con dos sombras de filtro animadas;
 *     aquí no hay filtros, y lo único que se anima es la opacidad.
 *   · NECESITAR SEÑAL. Nada de red, y los dos archivos en la precarga.
 *   · DEJAR ALGO PUESTO fuera de temporada, o repetir el saludo.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const T = require('../app/temporada.js');
const { abrirSocio } = require('./banco-socio.js');

const RAIZ = path.join(__dirname, '..');
/* Sin los retornos de carro: en Windows git deja los archivos con CRLF. */
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const JS = leer('app/temporada.js');
const CSS = leer('app/temporada.css');
const SW = leer('sw.js');
/* El código sin sus comentarios: lo que el teléfono de verdad corre. */
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
const CODIGO = sinComentarios(JS);
const REGLAS = sinComentarios(CSS);

/* Un instante dado en hora de Colombia (UTC−5). */
const co = (a, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(a, m - 1, d, h + 5, mi, s, ms);

describe('la fecha: del 1 de diciembre al 7 de enero, en hora de Colombia', () => {
  test('se prende el 1-dic a las 00:00, no un milisegundo antes', () => {
    assert.equal(T.navidad(co(2026, 11, 30, 23, 59, 59, 999)), false);
    assert.equal(T.navidad(co(2026, 12, 1)), true);
  });
  test('el 7-ene es el último día entero; el 8-ene a las 00:00 ya se apagó', () => {
    assert.equal(T.navidad(co(2027, 1, 7, 23, 59, 59, 999)), true);
    assert.equal(T.navidad(co(2027, 1, 8)), false);
  });
  test('en medio, siempre: Nochebuena, el 31 a medianoche y el 1-ene', () => {
    [co(2026, 12, 7, 19), co(2026, 12, 24, 23), co(2026, 12, 31, 23, 59), co(2027, 1, 1), co(2027, 1, 6, 12)]
      .forEach(ms => assert.equal(T.navidad(ms), true, new Date(ms).toISOString()));
  });
  test('fuera, nunca: el resto del año', () => {
    [co(2026, 11, 18), co(2027, 1, 9), co(2027, 2, 14), co(2027, 6, 15), co(2027, 11, 30, 23)]
      .forEach(ms => assert.equal(T.navidad(ms), false, new Date(ms).toISOString()));
  });
  test('vuelve sola el diciembre siguiente, sin publicar nada', () => {
    assert.equal(T.navidad(co(2027, 12, 1)), true);
    assert.equal(T.navidad(co(2028, 1, 7, 22)), true);
    assert.equal(T.navidad(co(2028, 1, 8)), false);
  });
  test('la medianoche que cuenta es la de Colombia, no la UTC: el 30-nov a las 8 p. m. (ya 1-dic en UTC) todavía no', () => {
    const ms = co(2026, 11, 30, 20);
    assert.equal(new Date(ms).getUTCDate(), 1, 'en UTC ya es 1-dic');
    assert.equal(T.navidad(ms), false);
  });
  test('la zona del teléfono no cuenta: mismo resultado en Bogotá, Miami, Madrid, Tokio y Kiritimati', () => {
    /* Un proceso aparte por zona: TZ solo se lee al arrancar Node. */
    const casos = [co(2026, 11, 30, 23, 30), co(2026, 12, 1, 0, 30), co(2027, 1, 7, 23, 30), co(2027, 1, 8, 0, 30)];
    const esperado = JSON.stringify(casos.map(T.navidad));
    assert.equal(esperado, '[false,true,true,false]');
    const codigo = 'const T=require(' + JSON.stringify(path.join(RAIZ, 'app', 'temporada.js')) + ');' +
      'process.stdout.write(JSON.stringify(' + JSON.stringify(casos) + '.map(T.navidad)))';
    ['America/Bogota', 'America/New_York', 'Europe/Madrid', 'Asia/Tokyo', 'Pacific/Kiritimati'].forEach(tz => {
      const sale = execFileSync(process.execPath, ['-e', codigo], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' });
      assert.equal(sale, esperado, tz);
    });
  });
  test('y no se lee la hora local en ninguna parte del código', () => {
    assert.doesNotMatch(CODIGO, /\.get(FullYear|Month|Date|Day|Hours)\(|getTimezoneOffset|toLocale/);
  });
  test('una fecha que no es fecha no prende nada', () => {
    [NaN, Infinity, undefined, null, '2026-12-24', {}].forEach(x => assert.equal(T.navidad(x), false, String(x)));
  });
});

describe('verla antes de tiempo: ?temporada=navidad', () => {
  test('la prende fuera de temporada, solo con ese valor exacto', () => {
    const nov = co(2026, 11, 20);
    assert.equal(T.activa(nov, ''), false);
    assert.equal(T.activa(nov, '?temporada=navidad'), true);
    assert.equal(T.activa(nov, '?x=1&temporada=navidad&y=2'), true);
    assert.equal(T.activa(nov, '?temporada=navidades'), false);
    assert.equal(T.activa(nov, '?temporada=no'), false);
  });
  test('sin el parámetro, manda la fecha', () => {
    assert.equal(T.activa(co(2026, 12, 15), ''), true);
    assert.equal(T.activa(co(2026, 12, 15), undefined), true);
  });
});

/* Un documento de mentira con lo que usa aplicar(): <html> con sus clases, el
   chip del nivel con su padre, y la hoja que llegó (o no). */
function documento({ chip = true, hoja = true } = {}) {
  const clases = new Set();
  const hijos = [];
  const padre = {
    insertBefore(n, ref) { const i = ref ? hijos.indexOf(ref) : -1; if (i < 0) hijos.push(n); else hijos.splice(i, 0, n); n.parentNode = padre; },
    removeChild(n) { const i = hijos.indexOf(n); if (i >= 0) hijos.splice(i, 1); n.parentNode = null; }
  };
  const elChip = { id: 'uNivel', parentNode: padre, nextSibling: null };
  if (chip) hijos.push(elChip);
  const doc = {
    documentElement: { classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) } },
    getElementById: id => (chip && id === 'uNivel' ? elChip : null),
    querySelector: sel => (sel === '.tg-saludo' ? hijos.find(n => n.className === 'tg-saludo') || null : null),
    createElement: () => ({ className: '', textContent: '', parentNode: null }),
    defaultView: { getComputedStyle: () => ({ getPropertyValue: n => (hoja && n === '--tg-temporada' ? '1' : '') }) }
  };
  return { doc, clases, hijos, elChip };
}

describe('aplicar(): la clase y el saludo', () => {
  test('en temporada: la clase en <html> y UN saludo justo después del chip', () => {
    const d = documento();
    assert.equal(T.aplicar(d.doc, true), true);
    assert.ok(d.clases.has('tg-navidad'));
    assert.equal(d.hijos.length, 2);
    assert.equal(d.hijos[0], d.elChip);
    assert.equal(d.hijos[1].className, 'tg-saludo');
    assert.equal(d.hijos[1].textContent, '¡Feliz Navidad!');
  });
  test('se puede llamar las veces que sea: no repite el saludo', () => {
    const d = documento();
    T.aplicar(d.doc, true); T.aplicar(d.doc, true); T.aplicar(d.doc, true);
    assert.equal(d.hijos.filter(n => n.className === 'tg-saludo').length, 1);
  });
  test('al salir de temporada (la app vuelve a primer plano el 8-ene): se quita todo', () => {
    const d = documento();
    T.aplicar(d.doc, true);
    assert.equal(T.aplicar(d.doc, false), false);
    assert.equal(d.clases.has('tg-navidad'), false);
    assert.equal(d.hijos.filter(n => n.className === 'tg-saludo').length, 0);
  });
  test('sin la hoja: la clase sí (no pinta nada), el saludo NO (saldría suelto)', () => {
    const d = documento({ hoja: false });
    T.aplicar(d.doc, true);
    assert.ok(d.clases.has('tg-navidad'));
    assert.equal(d.hijos.length, 1);
  });
  test('sin chip del nivel (la portada y play/): solo la clase', () => {
    const d = documento({ chip: false });
    assert.equal(T.aplicar(d.doc, true), true);
    assert.ok(d.clases.has('tg-navidad'));
    assert.equal(d.hijos.length, 0);
  });
  test('sin documento, o sin <html>: no revienta', () => {
    assert.equal(T.aplicar(null, true), false);
    assert.equal(T.aplicar({}, true), false);
  });
});

describe('no promete nada', () => {
  test('el único texto que sale en pantalla es «¡Feliz Navidad!»', () => {
    assert.equal(T.SALUDO, '¡Feliz Navidad!');
    const textos = [...CODIGO.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map(m => m[1])
      .filter(s => s !== 'use strict' && /[a-záéíóúñ]{3,}\s+[a-záéíóúñ]/i.test(s));
    assert.deepEqual(textos, ['¡Feliz Navidad!']);
  });
  test('ni el código ni la hoja hablan de regalos, bonos, premios, rifas, descuentos ni plata', () => {
    const prohibidas = /regal|bono|premi|rifa|sorteo|descuento|gratis|plata|cupo|ganas?\b|promoci/i;
    assert.doesNotMatch(CODIGO, prohibidas);
    assert.doesNotMatch(REGLAS, prohibidas);
  });
  test('la hoja no escribe texto: solo content vacío', () => {
    const contents = [...REGLAS.matchAll(/content:\s*([^;}]+)/g)].map(m => m[1].trim());
    assert.ok(contents.length > 0);
    contents.forEach(c => assert.equal(c, "''"));
  });
});

describe('la hoja: solo en temporada, sin estorbar y sin pesar', () => {
  /* Las reglas de la hoja, sin los @media ni los @keyframes. */
  const reglas = REGLAS.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g, '$1');
  const bloques = [...reglas.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), cuerpo: m[2] }));

  test('todo lo que dibuja cuelga de html.tg-navidad', () => {
    const dibujan = bloques.filter(b => /background|content:|animation:(?!none)|display:inline/.test(b.cuerpo));
    assert.ok(dibujan.length >= 3);
    dibujan.forEach(b => b.sel.split(',').forEach(s =>
      assert.match(s.trim(), /^html\.tg-navidad /, 'sin la clase: «' + s.trim() + '»')));
  });
  test('fuera de temporada el saludo está escondido aunque alguien lo deje puesto', () => {
    assert.ok(bloques.some(b => b.sel === '.tg-saludo' && /display:none/.test(b.cuerpo)));
  });
  test('la guirnalda nunca tapa un toque', () => {
    const g = bloques.find(b => /::before/.test(b.sel) && /::after/.test(b.sel) && /position:absolute/.test(b.cuerpo));
    assert.ok(g, 'no encontré la regla de las dos capas');
    assert.match(g.cuerpo, /pointer-events:none/);
    ['.cab>.wrap::before', '.cab>.wrap::after', '.tope>.wrap::before', '.tope>.wrap::after']
      .forEach(s => assert.ok(g.sel.includes(s), s));
  });
  test('con «menos movimiento» los focos no titilan', () => {
    const m = /@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\}\s*\}/.exec(REGLAS);
    assert.ok(m, 'falta el @media de menos movimiento');
    ['.cab>.wrap::before', '.cab>.wrap::after', '.tope>.wrap::before', '.tope>.wrap::after']
      .forEach(s => assert.ok(m[1].includes(s), s));
    assert.match(m[1], /animation:none/);
  });
  test('lo único que se anima es la opacidad, y no hay filtros ni mezclas (un Android barato)', () => {
    assert.doesNotMatch(REGLAS, /filter|drop-shadow|blur|mix-blend|box-shadow|backdrop/);
    const cuadros = [...REGLAS.matchAll(/@keyframes\s+[\w-]+\{([\s\S]*?\})\}/g)].map(m => m[1]);
    assert.ok(cuadros.length >= 1);
    cuadros.forEach(c => [...c.matchAll(/\{([^}]*)\}/g)].forEach(p =>
      p[1].split(';').filter(Boolean).forEach(d => assert.match(d.trim(), /^opacity:/))));
  });
  test('la hoja trae su marca para que el guion sepa que llegó', () => {
    assert.match(REGLAS, /:root\{--tg-temporada:1\}/);
  });
});

describe('sin señal', () => {
  test('el guion no pide nada a la red ni guarda nada en el teléfono', () => {
    assert.doesNotMatch(CODIGO, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|importScripts|localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
  test('la hoja no trae nada de afuera: ni @import, ni fuentes, ni imágenes por la red', () => {
    assert.doesNotMatch(REGLAS, /@import|@font-face|url\(\s*["']?(https?:|\/\/)/);
    [...REGLAS.matchAll(/url\(\s*"([^"]*)"\s*\)/g)].forEach(m => assert.match(m[1], /^data:image\/svg\+xml,/));
  });
  test('los dos archivos van en la precarga del service worker, sin versión', () => {
    const i = SW.indexOf('const ARCHIVOS = ['), j = SW.indexOf('].map(f => BASE + f)', i);
    const lista = [...SW.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
    assert.ok(lista.includes('app/temporada.js'), 'falta app/temporada.js');
    assert.ok(lista.includes('app/temporada.css'), 'falta app/temporada.css');
  });
});

describe('llega a las tres páginas', () => {
  const PAGINAS = { 'app/socio.html': 'app', 'play/index.html': 'play', 'index.html': '.' };
  for (const [pagina, carpeta] of Object.entries(PAGINAS)) {
    test(pagina + ': pide la hoja y el guion, y las dos direcciones llevan a los archivos', () => {
      const html = leer(pagina).replace(/<!--[\s\S]*?-->/g, '');
      const hoja = [...html.matchAll(/<link rel="stylesheet" href="([^"]*temporada\.css)">/g)].map(m => m[1]);
      const guion = [...html.matchAll(/<script src="([^"]*temporada\.js)"><\/script>/g)].map(m => m[1]);
      assert.equal(hoja.length, 1, 'la hoja, una vez');
      assert.equal(guion.length, 1, 'el guion, una vez');
      assert.equal(path.posix.normalize(path.posix.join(carpeta, hoja[0])), 'app/temporada.css');
      assert.equal(path.posix.normalize(path.posix.join(carpeta, guion[0])), 'app/temporada.js');
      assert.ok(!/\?v=/.test(hoja[0] + guion[0]), 'archivo nuevo: sin versión en la dirección');
    });
  }
  test('el guion firma su llegada antes de todo su código', () => {
    const codigo = JS.replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, '');
    assert.ok(codigo.startsWith('(function () { try { var s = document.currentScript; if (s && s.src) '
      + '(window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();'));
  });
});

describe('dentro de la app del cliente, arrancada de verdad', () => {
  test('en Nochebuena la app arranca igual y Temporada dice que sí', () => {
    const b = abrirSocio({ ahora: co(2026, 12, 24, 20) });
    assert.equal(typeof b.ctx.Temporada, 'object');
    assert.equal(b.ctx.Temporada.activa(), true);
    assert.equal(b.visible('pEntrar'), true, 'sin sesión abre en Entrar, como siempre');
  });
  test('el 18-nov también, y dice que no', () => {
    const b = abrirSocio({ ahora: co(2026, 11, 18, 10) });
    assert.equal(b.ctx.Temporada.activa(), false);
  });
  test('si temporada.js no llegó, la app abre igual', () => {
    const b = abrirSocio({ ahora: co(2026, 12, 24, 20), sin: ['temporada.js'] });
    assert.equal(b.ctx.Temporada, undefined);
    assert.equal(b.visible('pEntrar'), true);
  });
});
