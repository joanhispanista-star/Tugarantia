'use strict';
/* ==========================================================================
 * EL ELIXIR — la barra de la garantía (20-nov-2026)
 *
 * Joan: «mejora la barra de garantia, quiero que se vea mas visible y que sea
 * como una materia azul con energia … que se vea como ese elixir». Escogió el
 * boceto B: la tarjeta «Tu garantía» de Inicio pasa a la laca y la barra es un
 * líquido azul en un tubo con aro de oro. El riel de la Pista es el mismo.
 *
 * Lo que estas pruebas cuidan es lo que el dibujo NO puede hacer:
 *   - mostrar un largo que no sea el de la garantía real;
 *   - decir con palabras lo que el dibujo sugiere (riqueza, ahorro, plata): la
 *     garantía no se presenta como plata del cliente (riesgo de captación);
 *   - trabar un teléfono barato (filtros, o animar algo que repinta) o moverse
 *     cuando el teléfono pide «menos movimiento»;
 *   - pisar papel con el oro del aro, contra la ley de la paleta.
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../app/puente.js');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* Una clienta de verdad, armada como la arma el CRM y empaquetada por el
   puente: `pagados` créditos ya pagados (garantía ganada). */
function credito(i) {
  const d = new Date(Date.UTC(2026, 3, 1 + 15 * i)).toISOString().slice(0, 10);
  const c = new Date(Date.UTC(2026, 3, 15 + 15 * i)).toISOString().slice(0, 10);
  return { id: 'c' + i, numero: i + 1, socioId: 's1', socioNombre: 'Clienta Elixir', capital: 300000,
    costoPct: 20, fechaDesembolso: d, cicloActual: c, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: true, fechaPago: c, cicloPago: c, gananciaPago: 60000, recargoMora: 0 };
}
async function clienta(pagados) {
  const dia = '2026-11-20';
  const db = {
    socios: [{ id: 's1', numero: 1, nombre: 'Clienta Elixir', cedula: '52111222', telefono: '3001112233',
               whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }],
    prestamos: Array.from({ length: pagados }, (_, i) => credito(i)), config: { negocio: 'Tu Garantía' }
  };
  const paquete = P.migrarSocio(db, db.socios[0], dia);
  const ahora = new Date(dia + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000,
    celular: '3001112233', paquete: { nombre: 'Clienta Elixir', datos: paquete,
      actualizado_en: dia + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  return A;
}
/* La tarjeta «Tu garantía» de Inicio, tal como quedó pintada. */
function tarjeta(A) {
  A.ev("irA('inicio')");
  const h = A.elem('cuerpo').innerHTML;
  const i = h.indexOf('<div class="etq">Tu garantía</div>');
  assert.ok(i > 0, 'Inicio no tiene la tarjeta «Tu garantía»');
  const ini = h.lastIndexOf('<div class="card', i);
  /* la tarjeta termina donde abre la siguiente, o donde se cierra el panel */
  const fin = [h.indexOf('<div class="card', i), h.indexOf('<div id="hlCuenta"', i)].filter(n => n > 0);
  return h.slice(ini, fin.length ? Math.min.apply(null, fin) : h.length);
}
/* Lo que el motor dice que lleva hacia el nivel siguiente, sin pasar por la barra. */
function fraccionReal(A) {
  const a = JSON.parse(A.ev("(function(){var f=M.proyeccionNiveles(Number(S.garantia||0),S.nivel),a=null;" +
    "for(var k=0;k<f.length;k++)if(f[k].nivel===S.nivel)a=f[k];return JSON.stringify(a)})()"));
  if (!a || a.hasta == null) return 1;
  const g = Number(A.ev('S.garantia'));
  /* el piso del 6 % es de progresoNivel desde antes: con la garantía en el
     arranque del nivel, la barra no queda vacía */
  return Math.max(0.06, Math.min(1, (g - a.desde) / (a.hasta - a.desde)));
}

/* Las reglas de una hoja, con su selector, su cuerpo y el @media que las
   envuelve. Lee los comentarios y las comillas carácter a carácter: el SVG de
   las ondas va entre comillas y trae «//». */
function reglas(css) {
  const out = []; let i = 0, sel = '', pila = [];
  while (i < css.length) {
    if (css.startsWith('/*', i)) { i = css.indexOf('*/', i + 2) + 2; continue; }
    const c = css[i];
    if (c === '{') {
      const s = sel.trim(); sel = '';
      if (/^@(media|supports)/.test(s)) { pila.push(s); i++; continue; }
      let j = i + 1, prof = 1, q = null;
      for (; j < css.length && prof; j++) {
        const d = css[j];
        if (q) { if (d === q) q = null; continue; }
        if (d === '"' || d === "'") q = d; else if (d === '{') prof++; else if (d === '}') prof--;
      }
      out.push({ sel: s, cuerpo: css.slice(i + 1, j - 1), media: pila.join(' ') });
      i = j; continue;
    }
    if (c === '}') { pila.pop(); sel = ''; i++; continue; }
    sel += c; i++;
  }
  return out;
}
const hojaDeSocio = () => {
  const h = leer('app/socio.html');
  return h.slice(h.indexOf('<style>') + 7, h.indexOf('</style>'));
};
/* Las animaciones de un grupo de reglas: qué elementos se mueven, con qué
   fotogramas, y qué hace cada fotograma. */
function movimiento(rs, prefijoSel, prefijoAnim) {
  const mueven = rs.filter(r => r.sel.includes(prefijoSel) && !/reduce/.test(r.media) && /animation\s*:/.test(r.cuerpo));
  const fotogramas = rs.filter(r => r.sel.startsWith('@keyframes ' + prefijoAnim));
  const quietas = rs.filter(r => /prefers-reduced-motion\s*:\s*reduce/.test(r.media) && /animation\s*:\s*none/.test(r.cuerpo))
    .flatMap(r => r.sel.split(',').map(s => s.trim()));
  return { mueven, fotogramas, quietas };
}

describe('el elixir: la barra de la garantía de Inicio', () => {

  test('la tarjeta «Tu garantía» va en la laca, con la cifra en su amarillo y el elixir (no la barra de antes)', async () => {
    const t = tarjeta(await clienta(3));
    assert.match(t, /^<div class="card laca"/, 'la tarjeta de la garantía no está en la laca');
    assert.match(t, /<div class="cifra sm oro">\$[\d.]+<\/div>/, 'la cifra no va en el amarillo de la laca');
    assert.doesNotMatch(t, /oro-tinta/, 'quedó la tinta del amarillo, que es para el papel');
    assert.match(t, /<div class="elixir" aria-hidden="true" style="--f:[01]\.\d{3}"><i><\/i><\/div>/,
      'no está el elixir con su largo');
    assert.doesNotMatch(t, /class="barra"/, 'quedó la barra delgada de antes');
  });

  test('el largo es la garantía real hacia el nivel siguiente: cambia con lo que la clienta ha pagado', async () => {
    const largos = [];
    for (const pagados of [1, 3, 6]) {
      const A = await clienta(pagados);
      const f = Number(/--f:([\d.]+)/.exec(tarjeta(A))[1]);
      const real = fraccionReal(A);
      assert.ok(Math.abs(f - real) <= 0.0005,
        pagados + ' pagados: la barra dice ' + f + ' y la garantía real está en ' + real.toFixed(3));
      assert.ok(f > 0 && f <= 1, 'un largo fuera de 0 a 1: ' + f);
      largos.push(f);
    }
    assert.ok(new Set(largos).size > 1, 'la barra mide lo mismo para todas: ' + largos.join(', '));
  });

  test('es dibujo: no lo lee el lector de pantalla, y la tarjeta no dice elixir, riqueza, ahorro ni «tu plata»', async () => {
    const t = tarjeta(await clienta(3));
    assert.match(t, /class="elixir" aria-hidden="true"/);
    const texto = plano(t);
    assert.doesNotMatch(texto, /elixir|riqueza|rique|ahorr|tu plata|tus ahorros|dep[oó]sito/i,
      'la tarjeta le pone palabras de plata al dibujo: «' + texto + '»');
    /* lo que sí dice: cuánto falta, en pesos y con el nombre del nivel */
    assert.match(texto, /Te faltan \$[\d.]+ de garantía para pasar a \S+|Estás en el nivel más alto/);
  });
});

describe('el elixir en la hoja: liviano, quieto si se pide, y solo sobre la laca', () => {
  const rs = reglas(hojaDeSocio());
  const delElixir = rs.filter(r => /\.elixir\b/.test(r.sel));

  test('existe, y nada del elixir usa filtros ni colores sueltos: todo por sus tokens', () => {
    assert.ok(delElixir.length >= 5, 'faltan reglas del elixir: ' + delElixir.length);
    delElixir.forEach(r => {
      assert.doesNotMatch(r.cuerpo, /(^|[;\s])(-webkit-)?(backdrop-)?filter\s*:/, r.sel + ' usa filtros');
      /* fuera de los dibujos en data: (que no leen variables), ni un hex */
      assert.doesNotMatch(r.cuerpo.replace(/url\("data:[^"]*"\)/g, ''), /#[0-9a-f]{3,8}\b/i, r.sel + ' trae un color suelto');
    });
  });

  test('solo se mueven transform y opacity, y con «menos movimiento» no se mueve nada', () => {
    const m = movimiento(rs, '.elixir', 'elixir-');
    assert.ok(m.mueven.length >= 3, 'el elixir no se mueve: ' + m.mueven.length);
    assert.ok(m.fotogramas.length >= 3, 'faltan los fotogramas del elixir');
    m.fotogramas.forEach(k => {
      const props = [...k.cuerpo.matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]);
      props.forEach(p => assert.ok(p === 'transform' || p === 'opacity', k.sel + ' anima ' + p + ', que repinta'));
    });
    m.mueven.forEach(r => assert.ok(m.quietas.includes(r.sel),
      r.sel + ' se sigue moviendo con «menos movimiento» (prefers-reduced-motion)'));
  });

  test('sus tokens están una sola vez, en :root: el elixir es igual en los dos modos, como la marca', () => {
    const h = leer('app/socio.html');
    ['--elixir-hondo', '--elixir', '--elixir-vivo', '--elixir-claro', '--elixir-luz', '--elixir-noche', '--elixir-noche-2']
      .forEach(t => assert.equal(h.split(t + ':').length - 1, 1, t + ' no está definido exactamente una vez'));
  });

  test('el elixir solo se pinta sobre la laca: en el código, cada uno vive dentro de una tarjeta laca', () => {
    const h = leer('app/socio.html');
    const usos = [...h.matchAll(/class=\\?"elixir/g)].map(m => m.index);
    assert.ok(usos.length >= 1, 'no hay elixir en el código');
    usos.forEach(i => {
      const antes = h.slice(Math.max(0, i - 1500), i);
      const abre = antes.lastIndexOf('<div class=\\"card') >= 0 ? antes.lastIndexOf('<div class=\\"card') : antes.lastIndexOf('<div class="card');
      assert.ok(abre >= 0, 'un elixir sin tarjeta alrededor');
      assert.match(antes.slice(abre, abre + 30), /card laca/, 'un elixir en una tarjeta de papel: el aro es oro, y el oro no pisa papel');
    });
  });
});

describe('el riel de la Pista es el mismo elixir', () => {
  const rs = reglas(leer('app/pista-niveles.css'));
  const riel = rs.filter(r => /\.pn-riel\b/.test(r.sel));
  const regla = s => riel.find(r => r.sel === s);

  test('tubo de laca con aro de oro y líquido azul, por los tokens del elixir; ni rojo ni ámbar en la Pista', () => {
    assert.match(regla('.pn-riel').cuerpo, /var\(--elixir-noche\)[\s\S]*padding-box[\s\S]*var\(--oro-claro\)[\s\S]*border-box/);
    assert.match(regla('.pn-riel i').cuerpo, /var\(--elixir-vivo\)[\s\S]*var\(--elixir-hondo\)/);
    riel.forEach(r => {
      assert.doesNotMatch(r.cuerpo, /--rojo|--ambar|--amarillo/, r.sel + ' trae un color que no es del elixir');
      assert.doesNotMatch(r.cuerpo, /(^|[;\s])(-webkit-)?(backdrop-)?filter\s*:/, r.sel + ' usa filtros');
    });
  });

  test('el destello cae justo donde termina el líquido', () => {
    /* <i> empieza a `left` px y mide P % del riel; <b> va en left:P % y se
       corre su margen: el centro del destello tiene que quedar en P % + left. */
    const left = Number(/(?:^|;)\s*left:(-?[\d.]+)px/.exec(regla('.pn-riel i').cuerpo)[1]);
    const b = regla('.pn-riel b').cuerpo;
    const ancho = Number(/(?:^|;)\s*width:([\d.]+)px/.exec(b)[1]);
    const margen = /margin:(-?[\d.]+)px 0 0 (-?[\d.]+)px/.exec(b);
    assert.ok(margen, 'el destello no tiene su margen');
    assert.equal(Number(margen[2]) + ancho / 2, left, 'el destello se despega de la punta del líquido');
    assert.equal(Number(margen[1]), -Number(/(?:^|;)\s*height:([\d.]+)px/.exec(b)[1]) / 2, 'el destello no va centrado en el alto');
  });

  test('solo se mueven transform y opacity, y con «menos movimiento» se queda quieto', () => {
    const m = movimiento(rs, '.pn-riel', 'pn-');
    assert.ok(m.mueven.length >= 3, 'el riel no se mueve: ' + m.mueven.length);
    const nombres = new Set(m.mueven.map(r => /animation\s*:\s*([\w-]+)/.exec(r.cuerpo)[1]));
    m.fotogramas.filter(k => nombres.has(k.sel.replace('@keyframes ', ''))).forEach(k => {
      const props = [...k.cuerpo.matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]);
      props.forEach(p => assert.ok(p === 'transform' || p === 'opacity', k.sel + ' anima ' + p));
    });
    assert.equal([...nombres].filter(n => !m.fotogramas.some(k => k.sel === '@keyframes ' + n)).length, 0,
      'una animación del riel no tiene sus fotogramas en la hoja de la Pista');
    m.mueven.forEach(r => assert.ok(m.quietas.includes(r.sel), r.sel + ' se mueve con «menos movimiento»'));
  });
});
