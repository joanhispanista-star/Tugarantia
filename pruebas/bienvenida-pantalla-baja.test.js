/* ============================================================================
 * LA BIENVENIDA NO SE MONTA SOBRE SÍ MISMA EN PANTALLAS BAJAS — 23-oct-2026
 *
 *   node --test pruebas/bienvenida-pantalla-baja.test.js
 *
 * Hallazgo de la auditoría del 23-oct (lente «marca»): la bienvenida nueva
 * (f1956a2) pone la G de oro en el CENTRO EXACTO con un sello de 200 px, y el
 * nombre y el lema cuelgan debajo con posición absoluta; la versión va fija
 * abajo. Con menos de ~450 px de alto (el teléfono acostado en la pestaña de
 * Chrome, la pantalla dividida, una ventana chica) la versión caía encima de
 * «Tu Garantía» y el lema se salía por abajo. Medido en Chrome sin ventana:
 * a 568x320 la versión (280–296) tapaba la palabra (272–303) y el lema
 * (315–338) quedaba cortado; a 800x400 versión y lema se mezclaban.
 *
 * Lo que se cuida:
 *   1. EN NINGÚN ALTO, de 240 px para arriba, se pisan: nada se corta arriba
 *      ni abajo, y entre lo último de la marca y la versión quedan 8 px.
 *   2. LA VERSIÓN NO SE ESCONDE para lograrlo: no es decoración (6-ago-2026,
 *      es cómo Joan sabe qué copia está mirando).
 *   3. EN VERTICAL NADA CAMBIA: la G sigue de 200 px en el centro exacto, que
 *      es lo que empata con la pantalla de arranque de Android (la app
 *      instalada va fija en vertical).
 *   4. AL ACHICAR EL SELLO, EL ANILLO Y EL HALO SIGUEN CENTRADOS en él.
 *
 * Nada de navegadores: un modelo de la caja con los números de la hoja de
 * app/socio.html (la caja de cada pieza es su alto, o su letra × el 1,5 del
 * body). Se comprobó contra Chrome sin ventana el 23-oct-2026.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const S = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
const HOJA = sinComentarios(S.slice(S.indexOf('<style>'), S.indexOf('</style>')));
const BIENVENIDA = sinComentarios(S.slice(S.indexOf('/* ---------------- la bienvenida'), S.indexOf('</style>')));

/* Los tokens de espacio de :root (--e1..--e4). */
const TOKENS = {};
for (const m of HOJA.matchAll(/--(e\d):(\d+(?:\.\d+)?)px/g)) if (!(m[1] in TOKENS)) TOKENS[m[1]] = Number(m[2]);

/* La hoja de la bienvenida partida en lo de siempre y en sus @media
   (max-height:N): cada @media con su N y sus reglas. Las demás @media (el
   movimiento reducido) no mueven nada de sitio y se dejan fuera. */
function partir(hoja) {
  let base = '';
  const medias = [];
  let i = 0;
  while (i < hoja.length) {
    const j = hoja.indexOf('@media', i);
    if (j < 0) { base += hoja.slice(i); break; }
    base += hoja.slice(i, j);
    const abre = hoja.indexOf('{', j);
    let prof = 1, k = abre + 1;
    while (prof > 0 && k < hoja.length) { if (hoja[k] === '{') prof++; else if (hoja[k] === '}') prof--; k++; }
    const cond = hoja.slice(j, abre);
    const m = /max-height:\s*(\d+)px/.exec(cond);
    if (m && !/min-height|width/.test(cond)) medias.push({ max: Number(m[1]), reglas: hoja.slice(abre + 1, k - 1) });
    i = k;
  }
  return { base, medias };
}
const PARTES = partir(BIENVENIDA);

/* Las declaraciones de un selector exacto en un trozo de hoja, en orden. */
function declaraciones(hoja, selector) {
  const d = {};
  for (const m of hoja.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map(s => s.replace(/\s+/g, ' ').trim());
    if (!sels.includes(selector)) continue;
    for (const par of m[2].split(';')) {
      const c = par.indexOf(':');
      if (c > 0) d[par.slice(0, c).trim()] = par.slice(c + 1).trim();
    }
  }
  return d;
}
/* Lo que vale para un selector con la pantalla de `alto`: la base y, encima,
   cada @media (max-height) que aplica, en el orden de la hoja. */
function estilo(selector, alto) {
  const d = declaraciones(PARTES.base, selector);
  for (const m of PARTES.medias) if (alto <= m.max) Object.assign(d, declaraciones(m.reglas, selector));
  return d;
}
function px(valor, seguro) {
  if (valor == null) return NaN;
  const v = String(valor).trim();
  const tok = /^var\(--(e\d)\)$/.exec(v);
  if (tok) return TOKENS[tok[1]];
  if (/env\(safe-area-inset-bottom\)/.test(v)) {
    const n = /(\d+(?:\.\d+)?)px/.exec(v.replace(/env\([^)]*\)/, ''));
    return (seguro || 0) + (n ? Number(n[1]) : 0);
  }
  const n = /^(-?\d+(?:\.\d+)?)px$/.exec(v);
  return n ? Number(n[1]) : NaN;
}
/* El body pone el alto de línea (1,5): de él sale la caja del lema y de la versión. */
const ALTO_LINEA = (() => {
  const m = /body\{[^}]*line-height:([\d.]+)/.exec(HOJA);
  assert.ok(m, 'el body no dice su line-height: el modelo no sabe el alto de una línea');
  return Number(m[1]);
})();

/* Dónde cae cada pieza con la pantalla de `alto` (y la franja segura de abajo). */
function medir(alto, seguro) {
  const sello = estilo('#hola .sello', alto);
  const debajo = estilo('#hola .debajo', alto);
  const nombre = estilo('#hola .nombre', alto);
  const lema = estilo('#hola .lema', alto);
  const version = estilo('#hola .version', alto);
  const s = px(sello.height);
  const pad = px(debajo['padding-top']);
  const n = px(nombre.height);
  const conLema = lema.display !== 'none';
  const ml = px(lema['margin-top']);
  const al = px(lema['font-size']) * ALTO_LINEA;
  for (const [que, v] of [['sello', s], ['padding del nombre', pad], ['nombre', n], ['lema', conLema ? ml + al : 0]]) {
    assert.ok(Number.isFinite(v), 'el modelo no pudo leer ' + que + ' a ' + alto + ' px');
  }
  const D = pad + n + (conLema ? ml + al : 0);
  const absoluto = (debajo.position || 'static') === 'absolute';
  const bloque = absoluto ? s : s + D;
  const arriba = (alto - bloque) / 2;
  const fondo = arriba + s + D;
  const conVersion = version.display !== 'none';
  const vArriba = alto - px(version.bottom, seguro) - px(version['font-size']) * ALTO_LINEA;
  return { s, absoluto, arriba, centroG: arriba + s / 2, fondo, conLema, conVersion, vArriba };
}

describe('la bienvenida en pantallas bajas (23-oct-2026)', () => {

  test('el modelo lee la hoja de verdad (control: con la bienvenida vertical da lo medido en Chrome)', () => {
    /* 360x740, como se ve en el teléfono: la G de 200 px en el centro exacto. */
    const m = medir(740, 0);
    assert.equal(m.s, 200);
    assert.equal(m.absoluto, true);
    assert.equal(m.centroG, 370);
    assert.ok(m.fondo + 8 <= m.vArriba);
  });

  const ALTOS = [240, 264, 280, 300, 320, 340, 360, 375, 400, 412, 430, 450, 480, 500, 520, 568, 640, 740, 800, 915];
  for (const alto of ALTOS) {
    test(alto + ' px de alto: nada se pisa ni se corta, y la versión se ve', () => {
      for (const seguro of alto >= 340 && alto <= 430 ? [0, 21] : [0]) {
        const m = medir(alto, seguro);
        const donde = alto + ' px' + (seguro ? ' (con ' + seguro + ' px de franja segura abajo)' : '');
        assert.ok(m.conVersion, donde + ': la versión se escondió; no es decoración (6-ago-2026)');
        assert.ok(m.arriba >= 0, donde + ': la G se corta arriba (' + m.arriba.toFixed(1) + ')');
        assert.ok(m.fondo <= alto - 4, donde + ': lo de debajo de la G se sale por abajo (termina en ' + m.fondo.toFixed(1) + ')');
        assert.ok(m.fondo + 8 <= m.vArriba,
          donde + ': la versión (desde ' + m.vArriba.toFixed(1) + ') se monta sobre la marca (que termina en ' + m.fondo.toFixed(1) + ')');
        assert.ok(m.s >= 88, donde + ': la G quedó de ' + m.s + ' px; achicarla tanto ya no es la bienvenida');
      }
    });
  }

  test('en vertical (568 px o más) no cambia nada: la G de 200 px en el centro exacto, como el arranque de Android', () => {
    for (const alto of [568, 640, 740, 915]) {
      const m = medir(alto, 0);
      assert.equal(m.s, 200, alto + ' px: el sello cambió de tamaño en vertical');
      assert.equal(m.absoluto, true, alto + ' px: lo de debajo empuja la G');
      assert.equal(m.centroG, alto / 2, alto + ' px: la G no está en el centro exacto');
      assert.ok(m.conLema, alto + ' px: el lema se escondió en vertical');
    }
  });

  test('donde el sello se achica, el anillo y el halo lo siguen y quedan centrados en él', () => {
    assert.ok(PARTES.medias.length > 0, 'no hay ninguna regla para pantallas bajas');
    for (const { max, reglas } of PARTES.medias) {
      const sello = declaraciones(reglas, '#hola .sello');
      if (!sello.height) continue;
      const s = px(sello.height);
      assert.equal(px(sello.width), s, max + ': el sello no es cuadrado');
      for (const [sel, maxRel, minRel] of [['#hola .orbita', 1, 0.8], ['#hola .halo', 1.8, 1.2], ['#hola .g-grande', 0.8, 0.55]]) {
        const d = declaraciones(reglas, sel);
        const w = px(d.width);
        assert.ok(Number.isFinite(w), max + ': el sello se achica y ' + sel + ' se queda de su tamaño');
        assert.equal(px(d.height), w, max + ': ' + sel + ' no es cuadrado');
        assert.ok(w >= s * minRel && w <= s * maxRel, max + ': ' + sel + ' de ' + w + ' px no guarda la proporción con un sello de ' + s);
        if (d.margin) {
          const mm = /^-(\d+(?:\.\d+)?)px 0 0 -(\d+(?:\.\d+)?)px$/.exec(d.margin.trim());
          assert.ok(mm && Number(mm[1]) === w / 2 && Number(mm[2]) === w / 2, max + ': ' + sel + ' quedó descentrado (margin ' + d.margin + ')');
        }
      }
    }
  });

  test('el modelo sí ve el defecto (control: sin las reglas de pantalla baja, a 320 px se pisan)', () => {
    const guardadas = PARTES.medias.splice(0);
    try {
      const m = medir(320, 0);
      assert.ok(m.fondo + 8 > m.vArriba || m.fondo > 316, 'sin las reglas nuevas el modelo no ve que se pisan');
    } finally {
      PARTES.medias.push(...guardadas);
    }
  });
});
