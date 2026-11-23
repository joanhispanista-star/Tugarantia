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
 *     cualquier zona: el último segundo del 19-nov no, el primero del 20-nov
 *     sí; el último del 7-ene sí, el primero del 8-ene no. Y vuelve sola cada
 *     20 de noviembre. (Arrancaba el 1-dic; Joan la adelantó el 20-nov-2026.)
 *   · PROMETER. El único texto es el saludo: ni regalos, ni bonos, ni rifas
 *     (Ley 643).
 *   · MOVERSE A QUIEN PIDIÓ QUE NO, o tapar un toque.
 *   · PESAR. El boceto dibujaba 36 focos con dos sombras de filtro animadas;
 *     aquí no hay filtros, y lo que se mueve va con opacidad o transform (lo
 *     que el teléfono mueve sin repintar).
 *   · NECESITAR SEÑAL. Nada de red, y los dos archivos en la precarga.
 *   · DEJAR ALGO PUESTO fuera de temporada, o repetir el saludo.
 *
 * El mismo 18-nov Joan pidió el resto de la app («desde la calculadora hasta
 * el logo que aparece al comienzo») y escogió la opción A, «Pino y oro»: el
 * gorro en la G, el oro que cae en la bienvenida, el pino y el acebo de las
 * tarjetas y las perillas como bolas. Sus pruebas van al final de «la hoja»
 * y cuidan además que el gorro siga a la G sin tapar su remate, que ni la
 * Pista ni los botones de pedir se adornen, y que la perilla siga diciendo
 * de qué producto es. Después Joan quiso el pino también en play/ y en la
 * portada («Sí, también»): esas pruebas cuidan que sus reglas no alcancen las
 * tarjetas de la app, que la rama solo encuentre rótulos en su esquina, que el
 * acebo quepa en el relleno y que los avisos sigan sin adorno.
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
/* La lista de precarga de sw.js, sin sus comentarios. */
const ARCHIVOS_SW = () => {
  const i = SW.indexOf('const ARCHIVOS = ['), j = SW.indexOf('].map(f => BASE + f)', i);
  return [...SW.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
};
/* El código sin sus comentarios: lo que el teléfono de verdad corre. */
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
const CODIGO = sinComentarios(JS);
const REGLAS = sinComentarios(CSS);
/* Una lista de selectores, partida solo por las comas de afuera. */
const partes = sel => {
  const out = []; let hondo = 0, va = '';
  for (const ch of sel) {
    if (ch === '(') hondo++;
    if (ch === ')') hondo--;
    if (ch === ',' && hondo === 0) { out.push(va.trim()); va = ''; } else va += ch;
  }
  return out.concat(va.trim());
};

/* Un instante dado en hora de Colombia (UTC−5). */
const co = (a, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(a, m - 1, d, h + 5, mi, s, ms);

describe('la fecha: del 20 de noviembre al 7 de enero, en hora de Colombia', () => {
  /* Era del 1-dic. El 20-nov-2026, ya publicada, Joan dijo «sube lo de navidad desde ya» y
     escogió que los años siguientes también arranque el 20-nov. */
  test('se prende el 20-nov a las 00:00, no un milisegundo antes', () => {
    assert.equal(T.navidad(co(2026, 11, 19, 23, 59, 59, 999)), false);
    assert.equal(T.navidad(co(2026, 11, 20)), true);
    assert.equal(T.PRIMER_DIA_NOVIEMBRE, 20);
  });
  test('el 7-ene es el último día entero; el 8-ene a las 00:00 ya se apagó', () => {
    assert.equal(T.navidad(co(2027, 1, 7, 23, 59, 59, 999)), true);
    assert.equal(T.navidad(co(2027, 1, 8)), false);
  });
  test('en medio, siempre: el resto de noviembre, Nochebuena, el 31 a medianoche y el 1-ene', () => {
    [co(2026, 11, 20, 16), co(2026, 11, 30, 23, 59), co(2026, 12, 1), co(2026, 12, 7, 19), co(2026, 12, 24, 23),
      co(2026, 12, 31, 23, 59), co(2027, 1, 1), co(2027, 1, 6, 12)]
      .forEach(ms => assert.equal(T.navidad(ms), true, new Date(ms).toISOString()));
  });
  test('fuera, nunca: el resto del año', () => {
    [co(2026, 11, 18), co(2026, 11, 19, 23), co(2027, 1, 9), co(2027, 2, 14), co(2027, 6, 15),
      co(2027, 10, 31, 23), co(2027, 11, 19, 23, 59)]
      .forEach(ms => assert.equal(T.navidad(ms), false, new Date(ms).toISOString()));
  });
  test('vuelve sola el 20-nov siguiente, sin publicar nada', () => {
    assert.equal(T.navidad(co(2027, 11, 19, 23, 59, 59, 999)), false);
    assert.equal(T.navidad(co(2027, 11, 20)), true);
    assert.equal(T.navidad(co(2027, 12, 1)), true);
    assert.equal(T.navidad(co(2028, 1, 7, 22)), true);
    assert.equal(T.navidad(co(2028, 1, 8)), false);
  });
  test('la medianoche que cuenta es la de Colombia, no la UTC: el 19-nov a las 8 p. m. (ya 20-nov en UTC) todavía no', () => {
    const ms = co(2026, 11, 19, 20);
    assert.equal(new Date(ms).getUTCDate(), 20, 'en UTC ya es 20-nov');
    assert.equal(T.navidad(ms), false);
  });
  test('la zona del teléfono no cuenta: mismo resultado en Bogotá, Miami, Madrid, Tokio y Kiritimati', () => {
    /* Un proceso aparte por zona: TZ solo se lee al arrancar Node. */
    const casos = [co(2026, 11, 19, 23, 30), co(2026, 11, 20, 0, 30), co(2027, 1, 7, 23, 30), co(2027, 1, 8, 0, 30)];
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

describe('verla fuera de temporada: ?temporada=navidad', () => {
  test('la prende fuera de temporada, solo con ese valor exacto', () => {
    const fuera = co(2026, 11, 19, 12);
    assert.equal(T.activa(fuera, ''), false);
    assert.equal(T.activa(fuera, '?temporada=navidad'), true);
    assert.equal(T.activa(fuera, '?x=1&temporada=navidad&y=2'), true);
    assert.equal(T.activa(fuera, '?temporada=navidades'), false);
    assert.equal(T.activa(fuera, '?temporada=no'), false);
  });
  test('sin el parámetro, manda la fecha', () => {
    assert.equal(T.activa(co(2026, 12, 15), ''), true);
    assert.equal(T.activa(co(2026, 12, 15), undefined), true);
  });
});

/* Un documento de mentira con lo que usa aplicar(): <html> con sus clases, el
   chip del nivel con su padre, la hoja que llegó (o no) y, si se pide, la
   bienvenida (#hola) con su lema. */
function documento({ chip = true, hoja = true, hola = false } = {}) {
  const clases = new Set();
  const padreDe = lista => {
    const p = {
      insertBefore(n, ref) { const i = ref ? lista.indexOf(ref) : -1; if (i < 0) lista.push(n); else lista.splice(i, 0, n); n.parentNode = p; },
      removeChild(n) { const i = lista.indexOf(n); if (i >= 0) lista.splice(i, 1); n.parentNode = null; }
    };
    return p;
  };
  const hijos = [], debajo = [];
  const elChip = { id: 'uNivel', parentNode: padreDe(hijos), nextSibling: null };
  const elLema = { className: 'lema', parentNode: padreDe(debajo), nextSibling: null };
  if (chip) hijos.push(elChip);
  if (hola) debajo.push(elLema);
  const doc = {
    documentElement: { classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) } },
    getElementById: id => (chip && id === 'uNivel' ? elChip : null),
    querySelector: sel => (sel === '.tg-saludo' ? hijos.find(n => n.className === 'tg-saludo') || null
      : sel === '.tg-saludo-hola' ? debajo.find(n => n.className === 'tg-saludo-hola') || null
      : sel === '#hola .lema' ? (hola ? elLema : null) : null),
    createElement: () => ({ className: '', textContent: '', parentNode: null }),
    defaultView: { getComputedStyle: () => ({ getPropertyValue: n => (hoja && n === '--tg-temporada' ? '1' : '') }) }
  };
  return { doc, clases, hijos, elChip, debajo, elLema };
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
    dibujan.forEach(b => partes(b.sel).forEach(s =>
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
  test('lo que se mueve va solo por la tarjeta gráfica (opacidad o transform), y no hay filtros ni mezclas (un Android barato)', () => {
    assert.doesNotMatch(REGLAS, /filter|drop-shadow|blur|mix-blend|box-shadow|backdrop/);
    const cuadros = [...REGLAS.matchAll(/@keyframes\s+[\w-]+\{([\s\S]*?\})\}/g)].map(m => m[1]);
    assert.ok(cuadros.length >= 2);
    const soloTarjeta = c => [...c.matchAll(/\{([^}]*)\}/g)].forEach(p =>
      p[1].split(';').filter(Boolean).forEach(d => assert.match(d.trim(), /^(opacity|transform):/)));
    cuadros.forEach(soloTarjeta);
    /* Y las que toma prestadas de la bienvenida de socio.html (el gorro llega
       con la G, el saludo sube con el lema): también. */
    const socio = leer('app/socio.html');
    const propias = new Set([...REGLAS.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
    const prestadas = new Set([...REGLAS.matchAll(/animation:([\w-]+)/g)].map(m => m[1]).filter(n => n !== 'none' && !propias.has(n)));
    assert.ok(prestadas.size >= 1);
    prestadas.forEach(n => {
      const m = new RegExp('@keyframes ' + n + '\\{([\\s\\S]*?\\})\\s*\\}').exec(socio);
      assert.ok(m, 'socio.html ya no tiene @keyframes ' + n);
      soloTarjeta(m[1]);
    });
  });
  test('la hoja trae su marca para que el guion sepa que llegó', () => {
    assert.match(REGLAS, /:root\{--tg-temporada:1\}/);
  });
});

/* ── 18-nov (2): NAVIDAD EN TODA LA APP — opción A, «Pino y oro» ──────────────
   Joan: «desde la calculadora hasta el logo que aparece al comienzo de la
   aplicacion todo tenga tematica y decoracion navideña». Lo de arriba sigue
   valiendo para todo lo nuevo (cuelga de html.tg-navidad, no escribe texto, no
   trae nada de la red, no usa filtros). Aquí, además:
     · que el gorro siga a la G en todos sus tamaños y no tape su remate,
     · que ni la Pista ni los botones de pedir se adornen,
     · que la perilla siga diciendo de qué producto es,
     · que el oro que cae no muestre el empalme ni siga cayendo escondido,
     · que cada dibujo sea un SVG entero: un # suelto corta la dirección. */
const SOCIO = leer('app/socio.html');
const PLAY = leer('play/index.html');
const ESTILO_PLAY = leer('play/estilo.css');
const PORTADA = leer('index.html');
const BLOQUES = (() => {
  const r = REGLAS.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g, '$1');
  return [...r.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), cuerpo: m[2] }));
})();
const regla = sel => {
  const b = BLOQUES.find(x => x.sel === sel);
  assert.ok(b, 'no está la regla «' + sel + '»');
  return b.cuerpo;
};
const IMAGENES = Object.fromEntries([...REGLAS.matchAll(/--(tg-[\w-]+):url\("data:image\/svg\+xml,([^"]*)"\)/g)].map(m => [m[1], m[2]]));
const svgDe = n => { assert.ok(IMAGENES[n], 'falta --' + n); return IMAGENES[n].replace(/%23/g, '#'); };
/* 23-nov-2026 — era la pestaña encendida (#nav button.on[data-t="pista"]); ahora
   es el mundo pintado: Mi garantía e Historial viven dentro de esa pestaña y
   siguen llevando su adorno. */
const PISTA_NO = 'body:not(:has(#pnHero))';

describe('toda la app: el gorro, el oro, el pino, el acebo y las bolas (18-nov, «Pino y oro»)', () => {
  test('cada dibujo se define una vez, en html.tg-navidad, y no sobra ni falta ninguno', () => {
    const nombres = Object.keys(IMAGENES).sort();
    assert.deepEqual(nombres, ['tg-acebo', 'tg-acebo-nav', 'tg-bola-azul', 'tg-bola-oro', 'tg-bola-roja', 'tg-gorro', 'tg-oro-cae', 'tg-rama']);
    const definen = BLOQUES.filter(b => /--tg-[\w-]+:url\(/.test(b.cuerpo));
    assert.deepEqual(definen.map(b => b.sel), ['html.tg-navidad']);
    const usadas = [...new Set([...REGLAS.matchAll(/var\(--(tg-[\w-]+)\)/g)].map(m => m[1]))].sort();
    assert.deepEqual(usadas, nombres);
  });
  test('cada dibujo es un SVG entero: sin # suelto, con sus etiquetas cerradas y sus degradados adentro', () => {
    /* Los de las variables y también las dos capas de la guirnalda, que van
       sueltas en su regla. Desde el 20-nov el foco y la hoja del acebo se dibujan
       una vez y se ponen con <use href='#…'>: esa referencia también tiene que
       estar adentro. */
    const todos = Object.entries(IMAGENES);
    [...REGLAS.matchAll(/background-image:url\("data:image\/svg\+xml,([^"]*)"\)/g)].forEach((m, i) => todos.push(['guirnalda ' + (i + 1), m[1]]));
    assert.equal(todos.length, Object.keys(IMAGENES).length + 2, 'faltan las dos capas de la guirnalda');
    for (const [n, u] of todos) {
      assert.doesNotMatch(u, /#/, n + ': un # sin codificar corta la dirección ahí');
      const s = u.replace(/%23/g, '#');
      assert.match(s, /^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='[-\d. ]+'>/, n);
      assert.ok(s.endsWith('</svg>'), n);
      const pila = [];
      for (const m of s.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) {
        if (m[3]) continue;
        if (m[1]) assert.equal(pila.pop(), m[2], n + ': </' + m[2] + '> sin abrir');
        else pila.push(m[2]);
      }
      assert.deepEqual(pila, [], n + ': quedó abierto');
      for (const r of s.matchAll(/(?:url\(#|href='#)(\w+)/g)) assert.ok(s.includes("id='" + r[1] + "'"), n + ': falta #' + r[1]);
    }
  });
  test('el gorro: la misma imagen en la G de la bienvenida y en la de la cabecera, y nunca tapa un toque', () => {
    for (const sel of ['html.tg-navidad #hola .sello::after', 'html.tg-navidad .marca:has(>.g)::before']) {
      const c = regla(sel);
      assert.match(c, /background:var\(--tg-gorro\)/, sel);
      assert.match(c, /pointer-events:none/, sel);
    }
  });
  test('en la bienvenida el gorro sigue a la G en sus tres tamaños (200, 120 y 96 px)', () => {
    assert.match(SOCIO, /<svg class="g-grande"[^>]*viewBox="-170 -170 340 340"/, 'la G de la bienvenida cambió de lienzo: revisar el gorro');
    const c = regla('html.tg-navidad #hola .sello::after');
    const ancho = +/width:([\d.]+)%/.exec(c)[1], izq = +/left:(-?[\d.]+)%/.exec(c)[1], arriba = +/top:(-?[\d.]+)%/.exec(c)[1];
    assert.equal(izq, -(ancho - 100) / 2);
    assert.equal(arriba, izq);
    const sellos = [...SOCIO.matchAll(/#hola \.sello\{[^}]*?width:(\d+)px/g)].map(m => +m[1]);
    const ges = [...SOCIO.matchAll(/#hola \.g-grande\{[^}]*?width:(\d+)px/g)].map(m => +m[1]);
    assert.deepEqual([sellos.length, ges.length], [3, 3]);
    sellos.forEach((s, i) => {
      const justo = 100 * (600 / 340) * ges[i] / s;     // el lienzo de 600 unidades, en % del sello
      assert.ok(Math.abs(justo - ancho) / ancho < 0.025, 'sello de ' + s + ' px: el gorro debería medir ' + justo.toFixed(1) + ' %');
    });
  });
  test('en la cabecera el gorro mide lo justo para la G de 30 px de las tres páginas', () => {
    const c = regla('html.tg-navidad .marca:has(>.g)::before');
    const ancho = +/width:([\d.]+)px/.exec(c)[1], izq = +/left:(-?[\d.]+)px/.exec(c)[1];
    assert.ok(c.includes('top:calc(50% - ' + (ancho / 2) + 'px)'), 'centrado en alto');
    for (const [nombre, html] of [['app/socio.html', SOCIO], ['play/index.html', PLAY], ['index.html', PORTADA]]) {
      const g = /class="marca"[^>]*><svg class="g" width="(\d+)" height="\1" viewBox="-?\d+ -?\d+ (\d+) \2"/.exec(html);
      assert.ok(g, nombre + ': la G ya no abre la marca');
      assert.equal(ancho, 600 / +g[2] * +g[1], nombre);
      assert.equal(izq, -(ancho - +g[1]) / 2, nombre);
    }
  });
  test('el ala del gorro no tapa el remate de la G: de ahí sale la chispa de la bienvenida', () => {
    const s = svgDe('tg-gorro');
    const grados = v => v * 180 / Math.PI;
    const giro = +/rotate\((-?[\d.]+)\)/.exec(s)[1];
    const ala = /<path d='M-?[\d.]+ -?[\d.]+A([\d.]+) [\d.]+ 0 0 1 ([\d.]+) (-?[\d.]+)' fill='none' stroke='url\(#p\)' stroke-width='([\d.]+)'/.exec(s);
    assert.ok(ala, 'no encontré el ala');
    const finAla = grados(Math.atan2(+ala[3], +ala[2])) + giro + grados(+ala[4] / 2 / +ala[1]);   // con la punta redonda
    const remate = /<path d="M ([\d.]+) (-?[\d.]+) A 150 150/.exec(SOCIO);
    const enRemate = grados(Math.atan2(+remate[2], +remate[1]));
    assert.ok(finAla < enRemate - 5, 'el ala llega a ' + finAla.toFixed(1) + '° y el remate está en ' + enRemate.toFixed(1) + '°');
  });
  test('el oro cae una baldosa exacta por vuelta (sin empalme), entre el fondo y la G, sin tapar un toque', () => {
    const c = regla('html.tg-navidad #hola::before');
    const lado = +/\/(\d+)px \1px repeat/.exec(c)[1];
    assert.ok(c.includes('top:-' + lado + 'px'));
    assert.ok(REGLAS.includes('@keyframes tg-cae{to{transform:translateY(' + lado + 'px)}}'));
    assert.ok(svgDe('tg-oro-cae').includes("viewBox='0 0 " + lado + ' ' + lado + "'"));
    const z = +/z-index:(\d+)/.exec(c)[1], zMarco = +/#hola \.marco\{[^}]*z-index:(\d+)/.exec(SOCIO)[1];
    assert.ok(z < zMarco, 'el oro quedaría encima de la G');
    assert.match(c, /pointer-events:none/);
  });
  test('cuando la bienvenida se va (#hola no se borra, se esconde), el oro deja de caer', () => {
    assert.match(regla('html.tg-navidad #hola.fuera::before'), /animation-play-state:paused/);
    assert.match(SOCIO, /h\.classList\.add\('fuera'\)/);
  });
  test('con «menos movimiento» ni cae el oro, ni salta el gorro, ni sube el saludo', () => {
    const medias = [...REGLAS.matchAll(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\}\s*\}/g)].map(m => m[1]).join('\n');
    for (const s of ['#hola::before', '#hola .sello::after', '#hola .tg-saludo-hola']) assert.ok(medias.includes('html.tg-navidad ' + s), s);
    assert.ok(medias.includes('html.tg-navidad #hola .tg-saludo-hola{animation:none'), 'las tres, con animation:none');
  });
  test('el saludo de la bienvenida se esconde fuera de temporada, y en las pantallas muy bajas se va con el lema', () => {
    assert.match(regla('.tg-saludo-hola'), /display:none/);
    assert.ok(REGLAS.includes('@media (max-height:300px){html.tg-navidad #hola .tg-saludo-hola{display:none}}'));
    assert.match(SOCIO, /@media \(max-height:300px\)\{[^@]*#hola \.lema\{display:none\}/);
  });
  test('la Pista no se adorna, y se sabe por su mundo pintado (vale también para lo que se le agregue)', () => {
    const adornan = BLOQUES.filter(b => /var\(--tg-(rama|acebo)\)/.test(b.cuerpo) && b.sel.includes('.panel>'));
    assert.equal(adornan.length, 2);
    adornan.forEach(b => assert.ok(b.sel.startsWith('html.tg-navidad ' + PISTA_NO + ' :is(#cuerpo>.panel,#cuerpo>.panel>div[id])>'), b.sel));
    /* el mundo lo pinta pista-niveles.js con ese id, y solo en la pantalla de la Pista */
    const PISTA = fs.readFileSync(path.join(__dirname, '..', 'app', 'pista-niveles.js'), 'utf8');
    assert.match(PISTA, /class="laca pn-hero ' \+ mu\.clase \+ '" id="pnHero"/);
    assert.equal(/pnHero/.test(SOCIO.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'la página pinta un #pnHero fuera de la Pista');
  });
  test('las reglas de play/ (tarjetas en #cuerpo o en #lamina, sueltas o en una caja con id) no alcanzan la app: allá todo va en un .panel sin id', () => {
    const dePlay = BLOQUES.filter(b => b.sel.includes(':is(#cuerpo,#lamina,#cuerpo>div[id],#lamina>div[id])>'));
    assert.equal(dePlay.length, 3, 'la rama, su rótulo y el acebo');
    const pintan = [...SOCIO.matchAll(/\$\('cuerpo'\)\.innerHTML = ([^\n]*)/g)].map(m => m[1]);
    assert.ok(pintan.length >= 5);
    pintan.forEach(x => assert.ok(x.startsWith("'<div class=\"panel\">"), 'socio.html pinta #cuerpo sin .panel: ' + x.slice(0, 60)));
    assert.doesNotMatch(SOCIO, /\$\('cuerpo'\)\.(insertAdjacentHTML|appendChild|prepend)|lamina/);
    assert.match(PLAY, /'<div id="lamina"><\/div>'/);
    /* play/ no tiene Pista: sus pestañas son estas cuatro. */
    assert.match(PLAY, /var PESTANAS = \[\['credito', 'Crédito'\], \['historial', 'Historial'\],\s*\['chat', 'Chat'\], \['perfil', 'Perfil'\]\];/);
  });
  test('las tarjetas que van en una caja con id también se adornan: el resultado de la calculadora y la historia laboral', () => {
    const EN_APP = ':is(#cuerpo>.panel,#cuerpo>.panel>div[id])>';
    const EN_PLAY = ':is(#cuerpo,#lamina,#cuerpo>div[id],#lamina>div[id])>';
    const adornan = BLOQUES.filter(b => /var\(--tg-(rama|acebo)\)/.test(b.cuerpo) && !/#entrarCuerpo|#calcPedido/.test(b.sel)).map(b => b.sel);
    assert.equal(adornan.length, 4, 'la rama y el acebo de la app, y los de play/');
    adornan.forEach(x => assert.ok(x.includes(' ' + EN_APP + '.card') || x.startsWith('html.tg-navidad ' + EN_PLAY + '.card'), x));
    /* Y de verdad hay tarjetas en esas cajas: el resultado de la calculadora de
       la app, y la historia laboral (app/historia-laboral.js) en las dos. */
    assert.match(SOCIO, /'<div id="calcSalida"><\/div>' \+\n\s*'<div id="calcComparar"><\/div>'/);
    assert.match(SOCIO, /\$\('calcSalida'\)\.innerHTML = salidaCalc\(s\);/);
    assert.match(SOCIO, /var h = '<div class="card quincenal">'/);
    assert.match(SOCIO, /'<div id="hlCuenta"><\/div>'/);
    assert.match(PLAY, /'<div id="hlCuenta"><\/div>'/);
    assert.match(leer('app/historia-laboral.js'), /caja\.innerHTML = '<div class="card"/);
  });
  test('las tarjetas de Entrar van en reglas aparte: sin :has se caen las de la app, no estas', () => {
    regla('html.tg-navidad #entrarCuerpo>.card.laca');
    regla('html.tg-navidad #entrarCuerpo>.card:not(.laca)');
    BLOQUES.filter(b => b.sel.includes(':has(')).forEach(b => assert.equal(partes(b.sel).length, 1, 'mezcla :has con otra: ' + b.sel));
  });
  test('los rótulos de las tarjetas con rama dejan libre la esquina de las bolas (a 320 px el de Entrar se metía)', () => {
    const rama = svgDe('tg-rama');
    const lienzo = +/viewBox='0 0 ([\d.]+) [\d.]+'/.exec(rama)[1];
    const bolas = [...rama.matchAll(/<circle cx='([\d.]+)' cy='[\d.]+' r='([\d.]+)' fill='url\(#\w+\)'\/>/g)].map(m => +m[1] - +m[2]);
    assert.ok(bolas.length >= 2, 'no encontré las bolas');
    /* El relleno es el --e4 de 20 px en las tres páginas (en la portada, el de
       la caja de la calculadora). */
    for (const [nombre, hoja] of [['app/socio.html', SOCIO], ['play/estilo.css', ESTILO_PLAY]]) {
      assert.match(hoja, /--e4:20px/, nombre);
      assert.match(hoja, /\.card\{[^}]*padding:var\(--e4\)/, nombre);
    }
    assert.match(PORTADA, /--e4:20px/);
    assert.match(PORTADA, /<div id="calcPedido" style="[^"]*padding:var\(--e4\)/);
    const piden = lienzo - Math.min(...bolas) - 20;     // menos el relleno de la tarjeta (--e4)
    const conRama = BLOQUES.filter(b => /var\(--tg-rama\)/.test(b.cuerpo)).map(b => b.sel);
    assert.equal(conRama.length, 4, 'Entrar, la app, play/ y la caja de la portada');
    conRama.forEach(sel => {
      const libre = +/padding-right:(\d+)px/.exec(regla(sel + ' :is(.etq,.cs-etq)'))[1];
      assert.ok(libre >= piden + 8, sel + ': el rótulo deja ' + libre + ' px y las bolas piden ' + piden + ' (más 8 de aire)');
    });
    /* Si la calculadora de la portada no llega, en la caja queda su frase. */
    assert.match(PORTADA, /<div id="calcPedido"[^>]*>\s*<p class="tenue">/);
    assert.ok(+/padding-right:(\d+)px/.exec(regla('html.tg-navidad #calcPedido>p:first-child'))[1] >= piden + 8);
  });
  test('la rama no se sale de su esquina: hasta 16 px de alto en todo el ancho, y hasta 44 en los últimos 40 px', () => {
    /* Son las dos zonas que mide el arnés de las fotos (si un texto o un control
       las toca). El arnés mide las zonas, no el dibujo: si las agujas crecieran,
       no lo vería. Aquí se mide lo pintado, el punto más el medio grueso del
       trazo. Los caminos de la rama solo usan M, L, l, Q y V absolutas: con otra
       letra la cuenta de abajo dejaría de valer, y la prueba lo dice. */
    const rama = svgDe('tg-rama'), fuera = [];
    const mira = (x, y, m, que) => { if (!(y + m <= 16 || (x - m >= 64 && y + m <= 44))) fuera.push(que + ' en ' + x.toFixed(1) + ',' + y.toFixed(1)); };
    const caminos = [...rama.matchAll(/<path d='([^']*)'[^>]*?stroke-width='([\d.]+)'/g)];
    assert.equal(caminos.length, (rama.match(/<path /g) || []).length, 'hay un camino sin trazo: revisar esta prueba');
    assert.ok(caminos.length >= 8);
    for (const [, d, grueso] of caminos) {
      assert.match(d, /^M[MLlQV\d\s.-]*$/, 'letra nueva en el camino de la rama');
      let letra = 'M', x = 0, y = 0;
      for (const t of d.match(/[MLlQV]|-?(?:\d+\.?\d*|\.\d+)/g).reduce((a, t) => {
        if (/[A-Za-z]/.test(t)) a.push([t]); else a[a.length - 1].push(+t);
        return a;
      }, [])) {
        letra = t[0];
        if (letra === 'V') { y = t[1]; mira(x, y, grueso / 2, 'hilo'); continue; }
        for (let i = 1; i < t.length; i += 2) {
          if (letra === 'l') { x += t[i]; y += t[i + 1]; } else { x = t[i]; y = t[i + 1]; }
          mira(x, y, grueso / 2, 'trazo');
        }
      }
    }
    const bolas = [...rama.matchAll(/<circle cx='([\d.]+)' cy='([\d.]+)' r='([\d.]+)'/g)];
    const casquillos = [...rama.matchAll(/<rect x='([\d.]+)' y='([\d.]+)' width='[\d.]+' height='([\d.]+)'/g)];
    assert.ok(bolas.length >= 2 && casquillos.length >= 2);
    bolas.forEach(([, cx, cy, r]) => mira(cx - r, +cy + +r, 0, 'bola'));
    casquillos.forEach(([, x, y, alto]) => mira(+x, +y + +alto, 0, 'casquillo'));
    assert.deepEqual(fuera, []);
  });
  test('en play/ cada tarjeta negra abre con su rótulo: en la esquina de la rama no hay otra cosa', () => {
    const negras = [...PLAY.matchAll(/'<div class="card laca"[^']*'\s*\+\s*([^\n]*)/g)].map(m => m[1].trim());
    assert.equal(negras.length, 6, 'hay una tarjeta negra nueva en play/: revisar que abra con su rótulo');
    negras.forEach(n => assert.match(n, /^('<div class="etq">|'<span class="ej-sello">|CS\.html\()/, n.slice(0, 70)));
    /* CS.html abre con su rótulo (.cs-etq) cuando lleva título, y en play/ siempre lo lleva. */
    assert.match(leer('app/calculadora-solicitud.js'), /\(o\.titulo \? '<div class="cs-etq">'/);
    const titulos = [...PLAY.matchAll(/CS\.html\([^\n]*?\{ titulo: ([^,]+),/g)].map(m => m[1]);
    assert.equal(titulos.length, 2);
    titulos.forEach(t => assert.match(t, /^(titulo \|\| '[^']+'|TEXTOS\.\w+)$/, t));
  });
  test('el acebo cabe entero en el relleno de arriba (20 px): no hay texto que tape', () => {
    const acebos = BLOQUES.filter(b => /var\(--tg-acebo\)/.test(b.cuerpo));
    assert.equal(acebos.length, 3, 'Entrar, la app y play/');
    acebos.forEach(b => {
      const arriba = +/background-position:right \d+px top (\d+)px/.exec(b.cuerpo)[1];
      const alto = +/background-size:\d+px (\d+)px/.exec(b.cuerpo)[1];
      assert.ok(arriba + alto <= 20, b.sel + ': el acebo baja hasta ' + (arriba + alto) + ' px');
    });
  });
  test('los avisos no se adornan: ni el ámbar de la portada («haz la cuenta») ni los de play/', () => {
    /* Un aviso puede nombrarse dentro de un :has (para dejar SIN adorno la
       tarjeta que lo trae), pero ninguna regla lo adorna a él. */
    const sinHas = x => x.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, '');
    BLOQUES.forEach(b => assert.doesNotMatch(sinHas(b.sel), /aviso|ambar/, b.sel));
    assert.match(PORTADA, /<div class="aviso ambar">/);
    assert.match(PLAY, /return '<div class="aviso ambar"><b>Tu sesión se venció/);
  });
  test('una tarjeta que abre con un aviso (salvo el verde de «Listo») va sin adorno: la propuesta, los datos personales, los errores', () => {
    const CON = ':has(>.aviso:not(.verde):first-child,>:first-child>.aviso:not(.verde):first-child)';
    const acebos = BLOQUES.filter(b => /var\(--tg-acebo\)/.test(b.cuerpo)).map(b => b.sel);
    /* En la app y en play/, dentro de la regla. En Entrar, aparte: sin :has se
       cae ella sola y el acebo se queda. */
    const dentro = acebos.filter(x => !x.includes('#entrarCuerpo'));
    assert.equal(dentro.length, 2);
    dentro.forEach(x => assert.ok(x.endsWith(':not(' + CON + ')'), x));
    assert.match(regla('html.tg-navidad #entrarCuerpo>.card:not(.laca)'), /var\(--tg-acebo\)/);
    assert.equal(regla('html.tg-navidad #entrarCuerpo>.card:not(.laca)' + CON).trim(), 'background-image:none');
    /* Y pasa de verdad: la propuesta de play/ abre con su aviso ámbar, encima de
       las condiciones; el aviso de los datos personales es uno informativo; y el
       error de Entrar abre con uno ámbar. */
    assert.match(PLAY, /var h = '<div class="card">' \+\n\s*\(aceptada \? '' : '<div class="aviso ambar"><b>Te hicimos una propuesta\.<\/b>/);
    assert.match(PLAY, /'<div class="card" id="avisoResponsable"><div class="aviso info"/);
    assert.match(SOCIO, /\$\('entrarCuerpo'\)\.innerHTML = '<div class="card">' \+\n\s*'<div class="aviso ambar">'/);
    /* El chat de play/ pone su error dentro de #hilo, la primera caja de su
       tarjeta: por eso la regla mira también un nivel adentro. */
    assert.match(PLAY, /'<div class="card"><div id="hilo" class="ch-hilo"><\/div>'/);
    assert.match(PLAY, /caja\.innerHTML = '<div class="aviso ambar">No pude traer tus mensajes ahora\./);
    /* El verde de «Listo» sí lleva: es una buena noticia. */
    assert.match(PLAY, /'<div class="card"><div class="aviso verde"><b>Listo\.<\/b> Tu cuenta quedó creada\.<\/div>'/);
  });
  test('los botones de pedir no se adornan: ninguna regla toca un .btn, y el único botón es la pestaña encendida', () => {
    assert.doesNotMatch(REGLAS, /\.btn\b/);
    BLOQUES.forEach(b => partes(b.sel).map(s => s.split(PISTA_NO).join('').trim()).forEach(s => {
      if (/button/.test(s)) assert.equal(s, 'html.tg-navidad #nav button.on::after');
    }));
  });
  test('la perilla sigue diciendo de qué producto es: roja la del quincenal, azul la del respaldado', () => {
    const token = n => new RegExp('--' + n + ':(#[0-9A-Fa-f]{6})').exec(SOCIO)[1].toUpperCase();
    const centro = n => /offset='\.45' stop-color='(#[0-9A-Fa-f]{6})'/.exec(svgDe(n))[1].toUpperCase();
    assert.equal(centro('tg-bola-roja'), token('rojo'));
    assert.equal(centro('tg-bola-azul'), token('azul'));
    assert.match(regla('html.tg-navidad #calcRange::-webkit-slider-thumb'), /var\(--tg-bola-roja\)/);
    assert.match(regla('html.tg-navidad #calcRange.azul::-webkit-slider-thumb'), /var\(--tg-bola-azul\)/);
    assert.match(SOCIO, /<input type="range" id="calcRange"/);
    assert.match(SOCIO, /classList\.toggle\('azul', resp\)/);
  });
  test('la bola queda centrada en la barra de la calculadora', () => {
    const perilla = +/input\[type=range\]::-webkit-slider-thumb\{[^}]*?height:(\d+)px/.exec(SOCIO)[1];
    const barra = +/input\[type=range\]::-webkit-slider-runnable-track\{height:(\d+)px/.exec(SOCIO)[1];
    const m = +/margin-top:(-?\d+)px/.exec(regla('html.tg-navidad #calcRange::-webkit-slider-thumb'))[1];
    assert.equal(m, (barra - perilla) / 2);
    assert.match(regla('html.tg-navidad #calcRange'), /(^|;)appearance:none/);
  });
  test('la calculadora de la solicitud (Entrar, play/ y la portada) lleva la bola de oro, encima de su propia regla', () => {
    assert.match(leer('app/calculadora-solicitud.js'), /'\.cs input\[type=range\]::-webkit-slider-thumb\{/);
    assert.match(regla('html.tg-navidad .cs input[type=range]::-webkit-slider-thumb'), /var\(--tg-bola-oro\)/);
  });
  test('la hoja sigue liviana: todo dibujado adentro, por debajo de 32 KB', () => {
    assert.ok(Buffer.byteLength(CSS) < 32 * 1024, Buffer.byteLength(CSS) + ' bytes');
  });
});

describe('el saludo también en la bienvenida (18-nov, «Pino y oro»)', () => {
  test('en temporada: UN saludo justo después del lema, además del de la cabecera', () => {
    const d = documento({ hola: true });
    assert.equal(T.aplicar(d.doc, true), true);
    assert.equal(d.debajo.length, 2);
    assert.equal(d.debajo[0], d.elLema);
    assert.equal(d.debajo[1].className, 'tg-saludo-hola');
    assert.equal(d.debajo[1].textContent, '¡Feliz Navidad!');
    assert.equal(d.hijos.filter(n => n.className === 'tg-saludo').length, 1);
  });
  test('no se repite, y al salir de temporada se quita', () => {
    const d = documento({ hola: true });
    T.aplicar(d.doc, true); T.aplicar(d.doc, true); T.aplicar(d.doc, true);
    assert.equal(d.debajo.filter(n => n.className === 'tg-saludo-hola').length, 1);
    T.aplicar(d.doc, false);
    assert.deepEqual(d.debajo, [d.elLema]);
  });
  test('sin la hoja no sale: quedaría suelto', () => {
    const d = documento({ hola: true, hoja: false });
    T.aplicar(d.doc, true);
    assert.deepEqual(d.debajo, [d.elLema]);
  });
  test('la bienvenida de la app trae el lema donde el guion lo busca', () => {
    assert.match(SOCIO, /<div id="hola"[^>]*>[\s\S]*?<div class="lema">/);
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
  test('los dos archivos van en la precarga del service worker: la hoja sin versión, el guion con la suya', () => {
    /* 20-nov-2026 (v155): el guion cambió (la fecha), y todo .js que cambia se pide con
       la versión en la dirección (pruebas/la-pagina-nueva-no-corre-con-un-js-viejo.test.js).
       La hoja no la necesita: el service worker pide las hojas frescas primero. */
    const lista = ARCHIVOS_SW();
    const guion = lista.filter(f => /^app\/temporada\.js(\?|$)/.test(f));
    assert.equal(guion.length, 1, 'app/temporada.js, una vez');
    assert.match(guion[0], /^app\/temporada\.js\?v=\d+$/, 'desde v155 el guion va con versión');
    assert.ok(lista.includes('app/temporada.css'), 'falta app/temporada.css');
  });
});

describe('llega a las tres páginas', () => {
  const PAGINAS = { 'app/socio.html': 'app', 'play/index.html': 'play', 'index.html': '.' };
  for (const [pagina, carpeta] of Object.entries(PAGINAS)) {
    test(pagina + ': pide la hoja y el guion, y las dos direcciones llevan a los archivos', () => {
      const html = leer(pagina).replace(/<!--[\s\S]*?-->/g, '');
      const hoja = [...html.matchAll(/<link rel="stylesheet" href="([^"]*temporada\.css)">/g)].map(m => m[1]);
      const guion = [...html.matchAll(/<script src="([^"]*temporada\.js)\?v=(\d+)"><\/script>/g)];
      assert.equal(hoja.length, 1, 'la hoja, una vez');
      assert.equal(guion.length, 1, 'el guion, una vez y con su versión');
      assert.equal(path.posix.normalize(path.posix.join(carpeta, hoja[0])), 'app/temporada.css');
      assert.equal(path.posix.normalize(path.posix.join(carpeta, guion[0][1])), 'app/temporada.js');
      /* La hoja, sin versión. El guion, con la misma que precarga sw.js (cambió el 20-nov, v155). */
      assert.ok(!/\?v=/.test(hoja[0]), 'la hoja va sin versión');
      assert.ok(ARCHIVOS_SW().includes('app/temporada.js?v=' + guion[0][2]), 'sw.js precarga la misma dirección');
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
  test('el 20-nov, el día que se adelantó, ya dice que sí', () => {
    const b = abrirSocio({ ahora: co(2026, 11, 20, 17) });
    assert.equal(b.ctx.Temporada.activa(), true);
    assert.equal(b.visible('pEntrar'), true);
  });
  /* Desde el 20-nov (v155) el guion va con versión. En un teléfono, si no llega, frena
     «¿LLEGÓ LO QUE PEDÍ?» y la app pide recargar, como con todo guion con versión. Lo que
     cuida esta prueba es otra cosa: que nada de la app dependa de window.Temporada. */
  test('nada de la app depende de temporada.js: sin él, abre igual', () => {
    const b = abrirSocio({ ahora: co(2026, 12, 24, 20), sin: ['temporada.js'] });
    assert.equal(b.ctx.Temporada, undefined);
    assert.equal(b.visible('pEntrar'), true);
  });
});
