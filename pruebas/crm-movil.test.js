/* ============================================================================
 * EL CRM EN UN TELÉFONO: LA HOJA, LA BARRA DE ABAJO Y «MÁS» — 24-nov-2026
 *
 * Tres cosas que una pantalla bonita puede romper sin que nadie lo note, y que
 * aquí se vigilan:
 *
 *   1. LOS RÓTULOS DE LAS FICHAS. panel/crm-movil.css convierte cada fila de
 *      Créditos, Clientes, la cola del Tablero y las tres listas de Cobranzas en
 *      una ficha, y le pone a cada dato su rótulo («Capital», «A pagar», «Debe»)
 *      por la POSICIÓN de la columna (nth-child). Si una de esas tablas gana,
 *      pierde o cambia de sitio una columna, «A pagar» queda encima de otra
 *      cifra, sin ningún error. Aquí se pintan las seis tablas de verdad y se
 *      comparan sus <th> con los rótulos de la hoja.
 *   2. QUIÉN ENCIENDE LA HOJA. Solo un celular o una tableta con el menú de
 *      Joan. Un computador nunca, ni con la ventana angosta; el celular de un
 *      gerente o de un asesor, tampoco.
 *   3. QUE NINGUNA PESTAÑA SE PIERDA. Cuatro van en la barra y las demás en la
 *      hoja de «Más»: son los mismos botones, movidos. Ninguna se copia ni se
 *      queda afuera.
 *
 * Lo que esta prueba NO ve: cómo se pinta. Eso se mira en un navegador de
 * verdad (el arnés de PLAN-CRM-movil-bocetos/arnes, fuera del repositorio) y,
 * al final, en un iPhone.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const M = require('../panel/crm-movil.js');
const R = require('../panel/crm-remoto.js');
const CRM = LEER('panel/crm.html');
const HOJA = LEER('panel/crm-movil.css');
const PIEZA = LEER('panel/crm-movil.js');
/* La hoja sin comentarios: lo que el navegador lee. */
const REGLAS = HOJA.replace(/\/\*[\s\S]*?\*\//g, '');

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 };
const IPAD = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', maxTouchPoints: 5 };
const PC = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 0 };
const PC_TACTIL = Object.assign({}, PC, { maxTouchPoints: 10 });

/* Las pestañas del menú de Joan, en el orden en que crm.html las trae. */
const MENU = (() => {
  const lado = /<aside class="side">([\s\S]*?)<\/aside>/.exec(CRM)[1];
  return Array.from(lado.matchAll(/<button class="navbtn[^"]*" data-v="([^"]+)"/g)).map(m => m[1]);
})();

/* ------------------------------------------------------------------ 1 ---- */
describe('crm-movil · lo puro', () => {
  test('la barra de abajo es la misma en la pieza y en la hoja, y en el mismo orden', () => {
    const sel = /\.navbtn:is\(((?:\[data-v="[^"]+"\],?)+)\),\.mas-btn\{\s*position:fixed/.exec(REGLAS);
    assert.ok(sel, 'la hoja tiene el selector de la barra');
    const enLaHoja = Array.from(sel[1].matchAll(/data-v="([^"]+)"/g)).map(m => m[1]);
    assert.deepEqual(enLaHoja, M.EN_LA_BARRA);
    /* Cada una en su quinto, y «Más» en el último. */
    M.EN_LA_BARRA.forEach((v, i) => {
      const izq = new RegExp('\\.navbtn\\[data-v="' + v + '"\\]\\{left:(\\d+)%?\\}').exec(REGLAS);
      assert.ok(izq, 'la hoja coloca a ' + v);
      assert.equal(Number(izq[1]), i * 20, v + ' va en el puesto ' + (i + 1));
    });
    assert.match(REGLAS, /\.mas-btn\{left:80%/);
    /* Ningún otro selector de la hoja vuelve a escribir la lista con otra pestaña. */
    for (const m of REGLAS.matchAll(/\.navbtn:is\(((?:\[data-v="[^"]+"\],?)+)\)/g)) {
      assert.deepEqual(Array.from(m[1].matchAll(/data-v="([^"]+)"/g)).map(x => x[1]), M.EN_LA_BARRA);
    }
  });

  test('ninguna pestaña se pierde: cuatro en la barra y las otras trece en la hoja de «Más»', () => {
    assert.equal(MENU.length, 17, 'el menú de Joan tiene 17 pestañas');
    M.EN_LA_BARRA.forEach(v => assert.ok(MENU.includes(v), v + ' existe en el menú'));
    const adentro = M.paraLaHoja(MENU);
    assert.equal(adentro.length, 13);
    assert.deepEqual([...M.EN_LA_BARRA, ...adentro].sort(), [...MENU].sort());
    assert.deepEqual(adentro, MENU.filter(v => !M.EN_LA_BARRA.includes(v)), 'y adentro van en su orden de siempre');
    assert.deepEqual(M.paraLaHoja(null), []);
  });

  test('la hoja se enciende con las TRES cosas: un celular, el menú de Joan, y sin copia local (o mirando la nube)', () => {
    assert.equal(M.seEnciende({ celular: true, menuDeJoan: true }), true);
    assert.equal(M.seEnciende({ celular: true, menuDeJoan: true, copia: false }), true);
    assert.equal(M.seEnciende({ celular: true, menuDeJoan: true, copia: true }), false, 'sobre una copia local que escribe, no');
    assert.equal(M.seEnciende({ celular: true, menuDeJoan: true, copia: true, mirando: true }), true, 'mirando la nube sí, aunque haya una copia guardada');
    assert.equal(M.seEnciende({ celular: false, menuDeJoan: true, mirando: true }), false);
    assert.equal(M.seEnciende({ celular: false, menuDeJoan: true }), false, 'un computador, nunca');
    assert.equal(M.seEnciende({ celular: true, menuDeJoan: false }), false, 'el menú del equipo, tampoco');
    assert.equal(M.seEnciende({}), false);
    assert.equal(M.seEnciende(), false);
    assert.equal(M.seEnciende({ celular: 1, menuDeJoan: 'sí' }), false, 'solo con true de verdad');
  });
});

/* ------------------------------------------------------------------ 2 ----
   Una pantalla de mentira, lo justo para la barra y la hoja. */
function pantalla(o) {
  o = o || {};
  const porId = {};
  function nodo(etiqueta, clase, datos) {
    const clases = new Set(String(clase || '').split(' ').filter(Boolean));
    const n = {
      tagName: String(etiqueta || 'div').toUpperCase(), nodeType: 1, hijos: [], padre: null, _attrs: {}, _oyentes: {},
      dataset: Object.assign({}, datos || {}), textContent: '', type: '', _id: '', _enfocado: 0,
      get id() { return this._id; }, set id(v) { this._id = v; if (v) porId[v] = this; },
      get className() { return [...clases].join(' '); }, set className(v) { clases.clear(); String(v).split(' ').filter(Boolean).forEach(c => clases.add(c)); },
      set innerHTML(h) { this._html = String(h); }, get innerHTML() { return this._html || ''; },
      classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c),
        toggle: (c, s) => { if (s === undefined ? !clases.has(c) : s) clases.add(c); else clases.delete(c); } },
      get children() { return this.hijos; }, get parentNode() { return this.padre; },
      get nextSibling() { if (!this.padre) return null; const i = this.padre.hijos.indexOf(this); return this.padre.hijos[i + 1] || null; },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) { return k in this._attrs ? this._attrs[k] : (k === 'data-v' && this.dataset.v ? this.dataset.v : null); },
      _sacar() { if (this.padre) { const i = this.padre.hijos.indexOf(this); if (i >= 0) this.padre.hijos.splice(i, 1); this.padre = null; } },
      appendChild(x) { x._sacar(); x.padre = this; this.hijos.push(x); return x; },
      insertBefore(x, ref) { x._sacar(); x.padre = this; const i = ref ? this.hijos.indexOf(ref) : -1; if (i < 0) this.hijos.push(x); else this.hijos.splice(i, 0, x); return x; },
      addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
      /* Un toque: corre los oyentes del nodo y sube por sus padres, como en un navegador. */
      tocar() { const ev = { target: this }; for (let x = this; x; x = x.padre) (x._oyentes.click || []).forEach(f => f(ev)); },
      closest(sel) { const c = sel.replace(/^\./, ''); for (let x = this; x; x = x.padre) if (x.classList.contains(c)) return x; return null; },
      focus() { this._enfocado++; }
    };
    return n;
  }
  const html = nodo('html'), lado = nodo('aside', 'side');
  const poner = x => lado.appendChild(x);
  poner(nodo('div', 'brand')); poner(nodo('div', 'sep'));
  const busca = nodo('div', 'busca'), campo = nodo('input'); campo.id = 'buscaGlobal'; busca.appendChild(campo); poner(busca);
  (o.menu || MENU).forEach(v => poner(nodo('button', 'navbtn', { v })));
  poner(nodo('div', 'avisos-pie')); poner(nodo('div', 'horario'));
  const enlace = nodo('link'); enlace.id = 'hojaMovil'; enlace.setAttribute('media', 'not all');
  if (o.sinEnlace) delete porId.hojaMovil;
  const oyentesDoc = [], vigias = [], subidas = [], estado = { mirando: !!o.mirando };
  const document = {
    documentElement: html,
    getElementById: id => porId[id] || null,
    querySelector: sel => (sel === '.side' ? (o.sinLado ? null : lado) : null),
    createElement: e => nodo(e),
    addEventListener(t, f) { oyentesDoc.push({ t, f }); }
  };
  const W = {
    document, navigator: o.navegador || IPHONE,
    scrollTo(x, y) { subidas.push([x, y]); },
    MutationObserver: class { constructor(f) { this.f = f; vigias.push(this); } observe(que, como) { this.que = que; this.como = como; } },
    JSON, Math, Object, Array, String, Number, RegExp, Error
  };
  const almacen = Object.assign({}, o.almacen || {});
  W.localStorage = { getItem: k => { if (o.almacenRoto) throw new Error('sin permiso'); return k in almacen ? almacen[k] : null; } };
  if (!o.sinRemoto) W.CrmRemoto = { esCelular: R.esCelular, gavetaConFichas: R.gavetaConFichas, GAVETA: R.GAVETA, activo: () => !!estado.mirando };
  W.globalThis = W; W.window = W; W.self = W;
  vm.createContext(W);
  vm.runInContext(PIEZA, W, { filename: 'crm-movil.js' });
  const vistas = caja => caja.hijos.filter(x => x.classList.contains('navbtn')).map(x => x.dataset.v);
  return { W, C: W.CrmMovil, html, lado, enlace, porId, oyentesDoc, vigias, subidas, campo, nodo, vistas, estado,
    tecla(k) { oyentesDoc.filter(x => x.t === 'keydown').forEach(x => x.f({ key: k })); } };
}

describe('crm-movil · quién enciende la hoja', () => {
  test('en un computador la pieza no hace NADA: ni hoja, ni botón, ni vigía, ni oyentes', () => {
    const p = pantalla({ navegador: PC });
    assert.equal(p.enlace.getAttribute('media'), 'not all');
    assert.equal(p.html.classList.contains('tg-celular'), false);
    assert.equal(p.porId.masHoja, undefined);
    assert.equal(p.porId.masBtn, undefined);
    assert.equal(p.vigias.length, 0);
    assert.equal(p.oyentesDoc.length, 0);
    assert.deepEqual(p.vistas(p.lado), MENU, 'las 17 pestañas siguen donde estaban');
    assert.equal(p.C.encendida(), false);
  });

  test('un computador con pantalla táctil sigue siendo el computador', () => {
    const p = pantalla({ navegador: PC_TACTIL });
    assert.equal(p.enlace.getAttribute('media'), 'not all');
    assert.equal(p.porId.masHoja, undefined);
  });

  test('en un iPhone con el menú de Joan: la hoja se enciende y las trece se van a «Más»', () => {
    const p = pantalla();
    assert.equal(p.enlace.getAttribute('media'), 'screen');
    assert.equal(p.html.classList.contains('tg-celular'), true);
    assert.deepEqual(p.vistas(p.lado), M.EN_LA_BARRA, 'en la barra quedan las cuatro');
    assert.deepEqual(p.vistas(p.porId.masHoja), M.paraLaHoja(MENU), 'y adentro las otras trece, en su orden');
    assert.equal(p.C.encendida(), true);
    assert.equal(p.C.abierto(), false, 'la hoja nace cerrada');
  });

  test('son los MISMOS botones, movidos: ninguno se copia', () => {
    const p = pantalla();
    const todos = [...p.lado.hijos, ...p.porId.masHoja.hijos].filter(x => x.classList.contains('navbtn'));
    assert.equal(todos.length, 17);
    assert.equal(new Set(todos).size, 17);
    assert.deepEqual(todos.map(x => x.dataset.v).sort(), [...MENU].sort());
  });

  test('«Más» NO lleva la clase navbtn: crm.html le cuelga irA a todo .navbtn que encuentre', () => {
    const p = pantalla();
    assert.equal(p.porId.masBtn.classList.contains('navbtn'), false);
    assert.equal(p.porId.masBtn.classList.contains('mas-btn'), true);
    assert.equal(p.porId.masBtn.getAttribute('aria-expanded'), 'false');
    assert.equal(p.porId.masBtn.getAttribute('aria-controls'), 'masHoja');
    /* Y la pieza corre ANTES del guion de la página que cuelga los oyentes. */
    const pieza = CRM.indexOf('<script src="crm-movil.js'), cuelga = CRM.indexOf("document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click'");
    assert.ok(pieza > 0 && cuelga > pieza, 'crm-movil.js va antes de que crm.html le cuelgue irA a las pestañas');
  });

  test('la caja de «Más» queda después de la última pestaña de la barra (para el teléfono acostado)', () => {
    const p = pantalla();
    const i = p.lado.hijos.indexOf(p.porId.masHoja);
    assert.equal(p.lado.hijos[i - 1].dataset.v, 'cobranzas');
    assert.equal(p.lado.hijos[i + 1].classList.contains('avisos-pie'), true);
  });

  test('un celular con una COPIA de la cartera guardada no recibe la hoja: esa pantalla escribe', () => {
    const copia = JSON.stringify({ socios: [{ id: 's1', nombre: 'Persona Inventada' }], prestamos: [] });
    const p = pantalla({ almacen: { [R.GAVETA]: copia } });
    assert.equal(p.enlace.getAttribute('media'), 'not all');
    assert.equal(p.html.classList.contains('tg-celular'), false);
    assert.equal(p.porId.masHoja, undefined, 'ni se le mueve el menú');
    assert.deepEqual(p.vistas(p.lado), MENU);
    /* …hasta que el CRM se pone a mirar la nube: crm-remoto.js avisa con revisar(). */
    p.estado.mirando = true;
    p.C.revisar();
    assert.equal(p.enlace.getAttribute('media'), 'screen');
    assert.equal(p.vistas(p.porId.masHoja).length, 13);
  });

  test('una gaveta vacía o que no se deja leer no es una copia', () => {
    assert.equal(pantalla({ almacen: { [R.GAVETA]: '{}' } }).enlace.getAttribute('media'), 'screen');
    assert.equal(pantalla({ almacenRoto: true }).enlace.getAttribute('media'), 'screen');
  });

  test('crm-remoto.js avisa a la hoja cuando empieza a mirar', () => {
    const fuente = LEER('panel/crm-remoto.js');
    const abrir = fuente.slice(fuente.indexOf('function abrirDesdeLaNube'), fuente.indexOf('function arrancarRelojes'));
    assert.match(abrir, /W\.CrmMovil\.revisar\(\)/);
    assert.ok(abrir.indexOf('E.activo = true') < abrir.indexOf('W.CrmMovil.revisar()'), 'después de quedar activo');
  });

  test('una tableta también es de mano: se enciende', () => {
    const p = pantalla({ navegador: IPAD });
    assert.equal(p.enlace.getAttribute('media'), 'screen');
    assert.equal(p.vistas(p.porId.masHoja).length, 13);
  });

  test('revisar dos veces no duplica nada', () => {
    const p = pantalla();
    const hoja = p.porId.masHoja, boton = p.porId.masBtn;
    p.C.revisar(); p.C.revisar();
    assert.equal(p.porId.masHoja, hoja);
    assert.equal(p.porId.masBtn, boton);
    assert.equal(p.lado.hijos.filter(x => x.classList.contains('mas-hoja')).length, 1);
    assert.equal(p.lado.hijos.filter(x => x.classList.contains('mas-btn')).length, 1);
    assert.equal(p.lado.hijos.filter(x => x.classList.contains('mas-velo')).length, 1);
    assert.equal(p.vistas(hoja).length, 13);
  });

  test('con el menú del equipo la hoja se APAGA: sus pantallas no se han mirado con ella', () => {
    const p = pantalla();
    p.porId.masBtn.tocar();
    assert.equal(p.C.abierto(), true);
    /* modoEquipo() le reemplaza el contenido a .side: botones con onclick y sin data-v. */
    p.lado.hijos.splice(0).forEach(x => { x.padre = null; });
    ['tablero', 'base', 'agenda'].forEach(() => p.lado.appendChild(p.nodo('button', 'navbtn')));
    assert.equal(p.vigias.length, 1, 'hay un vigía');
    assert.equal(p.vigias[0].que, p.lado, 'que mira a .side');
    assert.equal(p.vigias[0].como.childList, true);
    p.vigias[0].f([]);
    assert.equal(p.enlace.getAttribute('media'), 'not all');
    assert.equal(p.html.classList.contains('tg-celular'), false);
    assert.equal(p.html.classList.contains('mas-abierto'), false);
    assert.equal(p.C.encendida(), false);
    assert.equal(p.lado.hijos.length, 3, 'y al menú del equipo no se le añade nada');
  });

  test('si arranca por la puerta del equipo nunca se enciende', () => {
    const p = pantalla({ menu: [] });
    assert.equal(p.enlace.getAttribute('media'), 'not all');
    assert.equal(p.porId.masHoja, undefined);
  });

  test('sin crm-remoto.js, sin el <link> o sin .side no revienta', () => {
    assert.doesNotThrow(() => pantalla({ sinRemoto: true }));
    assert.equal(pantalla({ sinRemoto: true }).enlace.getAttribute('media'), 'not all', 'sin saber qué aparato es, no se enciende');
    const p = pantalla({ sinEnlace: true });
    assert.equal(p.vistas(p.porId.masHoja).length, 13, 'sin el <link> igual arma el menú');
    assert.doesNotThrow(() => pantalla({ sinLado: true }));
  });
});

describe('crm-movil · abrir y cerrar «Más»', () => {
  const abierta = p => p.html.classList.contains('mas-abierto');

  test('«Más» abre y «Más» cierra, y lo dice para quien no ve la pantalla', () => {
    const p = pantalla();
    p.porId.masBtn.tocar();
    assert.equal(abierta(p), true);
    assert.equal(p.porId.masBtn.getAttribute('aria-expanded'), 'true');
    p.porId.masBtn.tocar();
    assert.equal(abierta(p), false);
    assert.equal(p.porId.masBtn.getAttribute('aria-expanded'), 'false');
  });

  test('se cierra tocando fuera, con la ×, con Escape y al escoger una pestaña de adentro', () => {
    const p = pantalla();
    p.porId.masBtn.tocar(); p.porId.masVelo.tocar();
    assert.equal(abierta(p), false, 'el velo');
    p.porId.masBtn.tocar(); p.porId.masCerrar.tocar();
    assert.equal(abierta(p), false, 'la ×');
    p.porId.masBtn.tocar(); p.tecla('Escape');
    assert.equal(abierta(p), false, 'Escape');
    p.porId.masBtn.tocar();
    p.porId.masHoja.hijos.filter(x => x.dataset.v === 'cal')[0].tocar();
    assert.equal(abierta(p), false, 'una pestaña de la hoja');
  });

  test('una pestaña de la barra con la hoja abierta la cierra', () => {
    const p = pantalla();
    p.porId.masBtn.tocar();
    p.lado.hijos.filter(x => x.dataset.v === 'cred')[0].tocar();
    assert.equal(abierta(p), false);
  });

  test('tocar la hoja donde no hay nada NO la cierra', () => {
    const p = pantalla();
    p.porId.masBtn.tocar();
    p.porId.masHoja.tocar();
    assert.equal(abierta(p), true);
  });

  test('«Buscar» cierra, sube al comienzo y deja el cursor en el buscador de siempre', () => {
    const p = pantalla();
    p.porId.masBtn.tocar();
    p.porId.masBuscar.tocar();
    assert.equal(abierta(p), false);
    assert.deepEqual(p.subidas, [[0, 0]]);
    assert.equal(p.campo._enfocado, 1);
  });

  test('Escape con la hoja cerrada no hace nada', () => {
    const p = pantalla();
    assert.doesNotThrow(() => p.tecla('Escape'));
    assert.equal(abierta(p), false);
  });
});

/* ------------------------------------------------------------------ 3 ---- */
describe('crm-movil · la página, la hoja y el service worker', () => {
  test('la página pide la hoja APAGADA, después de su propia hoja, y la pieza después de crm-remoto.js', () => {
    const enlace = /<link rel="stylesheet" href="crm-movil\.css\?v=(\d+)" media="not all" id="hojaMovil">/.exec(CRM);
    assert.ok(enlace, 'el <link> llega con media="not all"');
    assert.ok(CRM.indexOf(enlace[0]) > CRM.lastIndexOf('</style>', CRM.indexOf('</head>')), 'después de la hoja que crm.html trae adentro');
    assert.ok(CRM.indexOf(enlace[0]) < CRM.indexOf('</head>'));
    const guion = /<script src="crm-movil\.js\?v=(\d+)"><\/script>/.exec(CRM);
    assert.ok(guion, 'la página pide crm-movil.js con su versión');
    assert.ok(CRM.indexOf(guion[0]) > CRM.indexOf('<script src="crm-remoto.js'), 'después de crm-remoto.js, que sabe qué aparato es');
    assert.equal(guion[1], enlace[1], 'la hoja y la pieza llevan la misma versión');
    const sw = LEER('sw.js');
    assert.ok(sw.includes("'panel/crm-movil.js?v=" + guion[1] + "'"), 'sw.js guarda la pieza');
    assert.ok(sw.includes("'panel/crm-movil.css?v=" + enlace[1] + "'"), 'sw.js guarda la hoja');
    const cache = Number(/const CACHE = 'tugarantia-v(\d+)'/.exec(sw)[1]);
    assert.ok(Number(guion[1]) <= cache, 'la versión no va por delante de la del sitio');
  });

  test('la pieza firma su llegada, como cada .js que la página pide con ?v=', () => {
    assert.match(PIEZA, /TG_LLEGARON/);
  });

  test('la hoja: llaves parejas, sin colores a mano, y solo en pantalla', () => {
    assert.equal((REGLAS.match(/\{/g) || []).length, (REGLAS.match(/\}/g) || []).length);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(REGLAS), false, 'los colores salen de los tokens de la página');
    assert.equal(/rgba?\(\s*\d/.test(REGLAS), false, 'ni un rgb() con números a mano');
    assert.equal((REGLAS.match(/@media screen and \(max-width:880px\)/g) || []).length, 1, 'un solo bloque, y con «screen»');
    assert.equal(/@media\s+(?:print|all)/.test(REGLAS), false);
  });

  test('fuera del @media solo queda lo que desarma el menú de «Más» en una pantalla ancha', () => {
    const antes = REGLAS.slice(0, REGLAS.indexOf('@media screen')).replace(/\s+/g, '');
    assert.equal(antes, '.mas-btn,.mas-velo,.mas-cabeza,.mas-buscar{display:none}.mas-hoja{display:contents}');
    /* Y después del bloque no hay nada. */
    const desde = REGLAS.indexOf('@media screen');
    let hondo = 0, fin = -1;
    for (let i = REGLAS.indexOf('{', desde); i < REGLAS.length; i++) {
      if (REGLAS[i] === '{') hondo++;
      else if (REGLAS[i] === '}') { hondo--; if (!hondo) { fin = i; break; } }
    }
    assert.equal(REGLAS.slice(fin + 1).trim(), '');
  });

  test(':has() va en reglas aparte: un iPhone viejo que no lo entiende no pierde la barra', () => {
    const cuerpo = REGLAS.slice(REGLAS.indexOf('@media screen'));
    for (const m of cuerpo.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) {
      const sel = m[1];
      if (!sel.includes(':has(')) continue;
      sel.split(/,(?![^()]*\))/).forEach(s => assert.ok(s.includes(':has('), 'en «' + sel.trim().slice(0, 70) + '…» :has() comparte regla con un selector que no lo usa'));
    }
  });
});

/* Una cartera inventada con lo justo para que las SEIS tablas se pinten el lunes
   23-nov-2026 a las 10:30: uno en mora al que se le puede escribir, uno en mora al
   que ya se le escribió esta semana (queda fuera), uno al día y uno pagado. */
function cartera() {
  const socios = [
    ['Ana Inventada Uno', '3105550101'], ['Beto Inventado Dos', '3125550102'],
    ['Caro Inventada Tres', '3205550103'], ['Dario Inventado Cuatro', '3015550104']
  ].map((g, i) => ({ id: 'C' + (1 + i), numero: i + 1, nombre: g[0], telefono: g[1], whatsappIgual: true, cedula: '1000' + i,
    ciudad: 'Mosquera', barrio: 'Centro', gestiones: [], fechaRegistro: '2026-08-10T15:00:00.000Z' }));
  socios[1].gestiones.push({ fecha: '2026-11-20', canal: 'whatsapp', plantilla: 'mora' });
  const credito = (n, si, capital, desembolso, corte, pagado) => Object.assign({
    id: 'P' + n, numero: n, socioId: socios[si].id, socioNombre: socios[si].nombre, telefono: socios[si].telefono,
    capital, costoPct: 20, fechaDesembolso: desembolso, cicloActual: corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, fechaCreacion: desembolso + 'T16:00:00.000Z'
  }, pagado ? { pagado: true, fechaPagado: corte, cicloPago: corte, cobroRegistrado: true, gananciaPago: capital * 0.2,
    recargoMora: 0, costoCausado: capital * 0.2, moraCausada: 0, montoRecibido: capital * 1.2 } : {});
  const prestamos = [
    credito(1, 0, 300000, '2026-10-20', '2026-10-31'),            // en mora, se le puede escribir
    credito(2, 1, 200000, '2026-11-03', '2026-11-15'),            // en mora, ya se le escribió
    credito(3, 2, 400000, '2026-11-18', '2026-11-30'),            // al día
    credito(4, 3, 250000, '2026-09-02', '2026-09-15', true)       // pagado
  ];
  return { socios, prestamos, config: { negocio: 'Tu Garantía' }, contadores: { cliente: 4, credito: 4, respaldado: 0 } };
}
/* ------------------------------------------------------------------ 4 ----
   Los rótulos de las fichas contra los <th> de las tablas de verdad. */
describe('crm-movil · los rótulos de las fichas dicen lo que dice la tabla', () => {
  const b = abrirPanel({ almacen: {}, ahora: '2026-11-23T15:30:00Z' });
  b.cargarCartera(cartera());
  b.ev('render()');
  b.ev('renderCobranzas()');
  /* 24-nov-2026 — y las cinco de Socios y Ciclos (bloque 4b de la hoja). */
  b.ev('renderSocios()');
  b.ev('renderCiclos()');

  const limpio = h => String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  function tabla(id) {
    const h = (b.elems[id] && b.elems[id].innerHTML) || '';
    const t = /<table[^>]*>\s*<thead>([\s\S]*?)<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>(?:\s*<tfoot>([\s\S]*?)<\/tfoot>)?/.exec(h);
    assert.ok(t, '#' + id + ' pintó su tabla (si no, a la cartera de esta prueba le falta un caso)');
    const celdas = fila => Array.from(fila.matchAll(/<td\b([^>]*)>/g)).map(m => Number((/colspan="?(\d+)/.exec(m[1]) || [0, 1])[1]));
    return {
      th: Array.from(t[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)).map(m => limpio(m[1])),
      filas: Array.from(t[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)).map(m => celdas(m[1])),
      pie: t[3] ? celdas(/<tr\b[^>]*>([\s\S]*?)<\/tr>/.exec(t[3])[1]) : null
    };
  }
  const TABLAS = ['tblCred', 'tblClientes', 'cola', 'tblCobranzas', 'tblFueraCob', 'tblNoToca'];
  /* 24-nov-2026 — las cinco de Socios y Ciclos. Van aparte porque tres de ellas son solo
     para leer (no tienen columna de botones), y la regla de «la fila de botones» es de las seis. */
  const DE_LEER = ['socTramos', 'socNiveles', 'socMigracion', 'socPerfiles', 'tblCiclos'];
  /* Los rótulos de la hoja, tal como están escritos: tabla, parte (cuerpo o pie), columna, texto. */
  const ROTULOS = Array.from(REGLAS.matchAll(/#(\w+)>table(?::first-of-type)?>([^{}>]+)>tr>td:nth-child\((\d+)\)::before\{content:"([^"]+)"/g))
    .map(m => ({ tabla: m[1], parte: m[2], n: Number(m[3]), texto: m[4] }));
  /* Donde la hoja abrevia o aclara a propósito, se declara aquí. Lo demás tiene que ser
     la MISMA palabra que el <th>. */
  const DICE = { 'Desembolso → vence': 'Desemb. → Quincena', 'Ganancia': ['Ganancia', 'Ganancia generada'] };
  /* En Ciclos el <th> trae una aclaración debajo («Descuentos dados · ya restados de la
     ganancia»): el rótulo de la ficha es su primera línea. Solo estos tres pueden empezar igual
     sin ser iguales; cualquier otro tiene que ser la misma palabra. */
  const EMPIEZA = ['Invertido', 'Descuentos dados', 'Capital perdido'];
  const vale = (rotulo, th) => [].concat(DICE[rotulo] || rotulo).some(x => x.toLowerCase() === String(th).toLowerCase()) ||
    (EMPIEZA.includes(rotulo) && String(th).toLowerCase().startsWith(rotulo.toLowerCase()));

  test('las seis tablas se pintan, y cada fila trae tantas celdas como columnas', () => {
    TABLAS.forEach(id => {
      const t = tabla(id);
      assert.ok(t.filas.length >= 1, '#' + id + ' tiene filas');
      t.filas.forEach(f => {
        assert.equal(f.length, t.th.length, '#' + id + ': una fila de ' + f.length + ' celdas bajo ' + t.th.length + ' columnas');
        assert.ok(f.every(c => c === 1), '#' + id + ': ninguna celda del cuerpo abarca dos columnas');
      });
    });
  });

  test('la hoja trae rótulos para las seis, y no para una tabla que no existe', () => {
    assert.ok(ROTULOS.length >= 20, 'se leyeron los rótulos de la hoja (' + ROTULOS.length + ')');
    assert.deepEqual([...new Set(ROTULOS.map(r => r.tabla))].sort(), [...TABLAS, ...DE_LEER].sort());
  });

  test('cada rótulo del cuerpo está sobre la columna que dice su <th>', () => {
    ROTULOS.filter(r => r.parte !== 'tfoot').forEach(r => {
      const th = tabla(r.tabla).th[r.n - 1];
      assert.ok(vale(r.texto, th), '#' + r.tabla + ', columna ' + r.n + ': la hoja dice «' + r.texto + '» y la tabla dice «' + th + '»');
    });
  });

  test('en el pie de Créditos, cada rótulo cae bajo la columna de su suma', () => {
    const t = tabla('tblCred');
    assert.ok(t.pie, 'Créditos pinta su pie de totales');
    const delPie = ROTULOS.filter(r => r.tabla === 'tblCred' && (r.parte === 'tfoot' || r.parte === ':is(tbody,tfoot)'));
    assert.ok(delPie.some(r => r.parte === 'tfoot'), 'la hoja rotula el pie');
    ROTULOS.filter(r => r.tabla === 'tblCred' && r.parte === 'tfoot').forEach(r => {
      /* La celda n del pie empieza en la columna 1 + lo que abarcan las anteriores. */
      const columna = 1 + t.pie.slice(0, r.n - 1).reduce((a, c) => a + c, 0);
      assert.ok(vale(r.texto, t.th[columna - 1]), 'pie, celda ' + r.n + ' (columna ' + columna + '): la hoja dice «' + r.texto + '» y la tabla «' + t.th[columna - 1] + '»');
    });
  });

  test('toda columna tiene su sitio en la ficha: ninguna queda suelta', () => {
    TABLAS.forEach(id => {
      const n = tabla(id).th.length;
      const puestas = new Set(Array.from(REGLAS.matchAll(new RegExp('#' + id + '>table(?::first-of-type)?>tbody>tr>td:nth-child\\((\\d+)\\)\\{grid-area:', 'g'))).map(m => Number(m[1])));
      assert.deepEqual([...puestas].sort((a, c) => a - c), Array.from({ length: n }, (_, i) => i + 1), '#' + id + ': columnas con sitio en la ficha');
      /* Y ninguna regla de la hoja nombra una columna que la tabla no tiene. */
      for (const m of REGLAS.matchAll(new RegExp('#' + id + '>table(?::first-of-type)?>tbody>tr>td:(?:is\\()?((?::nth-child\\(\\d+\\),?)+)', 'g'))) {
        Array.from(m[1].matchAll(/nth-child\((\d+)\)/g)).forEach(x => assert.ok(Number(x[1]) <= n, '#' + id + ': la hoja nombra la columna ' + x[1] + ' y hay ' + n));
      }
    });
  });

  /* 24-nov-2026 — SOCIOS Y CICLOS. */
  test('las cinco de Socios y Ciclos se pintan con sus columnas de siempre, y cada fila trae tantas celdas como columnas', () => {
    const COLUMNAS = { socTramos: 6, socNiveles: 5, socMigracion: 7, socPerfiles: 5, tblCiclos: 7 };
    DE_LEER.forEach(id => {
      const t = tabla(id);
      assert.equal(t.th.length, COLUMNAS[id], '#' + id + ' cambió de columnas: la hoja del teléfono la rotula por posición (' + t.th.join(' | ') + ')');
      assert.ok(t.filas.length >= 1, '#' + id + ' tiene filas');
      t.filas.forEach(f => {
        assert.equal(f.length, t.th.length, '#' + id + ': una fila de ' + f.length + ' celdas bajo ' + t.th.length + ' columnas');
        assert.ok(f.every(c => c === 1), '#' + id + ': ninguna celda del cuerpo abarca dos columnas');
      });
    });
  });
  test('en Socios y Ciclos toda columna tiene su sitio en la ficha, y ninguna regla nombra una columna que no existe', () => {
    DE_LEER.forEach(id => {
      const n = tabla(id).th.length;
      const puestas = new Set(Array.from(REGLAS.matchAll(new RegExp('#' + id + '>table>tbody>tr>td:nth-child\\((\\d+)\\)\\{grid-area:', 'g'))).map(m => Number(m[1])));
      assert.deepEqual([...puestas].sort((a, c) => a - c), Array.from({ length: n }, (_, i) => i + 1), '#' + id + ': columnas con sitio en la ficha');
      for (const m of REGLAS.matchAll(new RegExp('#' + id + '>table>[^{}]*?>tr>td:(?:is\\()?((?::nth-child\\(\\d+\\),?)+)', 'g'))) {
        Array.from(m[1].matchAll(/nth-child\((\d+)\)/g)).forEach(x => assert.ok(Number(x[1]) <= n, '#' + id + ': la hoja nombra la columna ' + x[1] + ' y hay ' + n));
      }
      /* Cada columna con dato lleva su rótulo; la primera (el nombre) y la de botones, no. */
      const rotuladas = ROTULOS.filter(r => r.tabla === id).map(r => r.n);
      const th = tabla(id).th;
      th.forEach((titulo, i) => { if (i > 0 && titulo) assert.ok(rotuladas.includes(i + 1), '#' + id + ': la columna «' + titulo + '» quedó sin rótulo en la ficha'); });
    });
  });
  test('en un celular que solo mira, la revisión de la migración no le pide revisar: dice dónde se hace', () => {
    const f = CRM.slice(CRM.indexOf("document.getElementById('socMigracion').innerHTML="), CRM.indexOf("document.getElementById('socPerfiles').innerHTML="));
    const i = f.indexOf('? (soloMirar()'), j = f.indexOf('la revisión se hace en tu computador.`');
    assert.ok(i >= 0 && j > i, 'la frase de la migración ya no tiene su rama de solo mirar');
    assert.equal(/Te faltan|por revisar/.test(f.slice(i, j)), false, 'en el celular le sigue pidiendo revisar');
    assert.match(f, /: `Te faltan <b>/, 'la frase del computador se perdió');
  });

  test('la fila de botones de cada ficha es la ÚLTIMA columna, la que no lleva título o dice «Gestión»', () => {
    const fila = /((?:#\w+>table(?::first-of-type)?>tbody>tr>td:nth-child\(\d+\),?\s*)+)\{display:flex;flex-wrap:wrap/.exec(REGLAS);
    assert.ok(fila, 'la hoja tiene la regla de la fila de botones');
    const vistas = Array.from(fila[1].matchAll(/#(\w+)>table(?::first-of-type)?>tbody>tr>td:nth-child\((\d+)\)/g)).map(m => ({ tabla: m[1], n: Number(m[2]) }));
    assert.deepEqual(vistas.map(v => v.tabla).sort(), [...TABLAS].sort());
    vistas.forEach(v => {
      const th = tabla(v.tabla).th;
      assert.equal(v.n, th.length, '#' + v.tabla + ': los botones van en la última columna');
      assert.ok(['', 'Gestión'].includes(th[v.n - 1]), '#' + v.tabla + ': la última columna es la de los botones («' + th[v.n - 1] + '»)');
    });
  });
});

/* ------------------------------------------------------------------ 5 ----
   En un celular que solo mira, crm-remoto.js esconde los botones que escriben. Las
   frases que los explicaban no pueden quedarse hablando de algo que ya no está. */
describe('crm.html · en un celular que solo mira, las frases no hablan de lo que no está', () => {
  function abrir(mirando) {
    const b = abrirPanel({ almacen: {}, ahora: '2026-11-23T15:30:00Z' });
    if (mirando) {
      b.ctx.CrmRemoto = { activo: () => true, paraCargar: () => JSON.parse(JSON.stringify(cartera())),
        alGuardar: () => false, puertaDeCorreo: () => false, pintarPuerta: () => false };
      b.ev('abrirSoloMirar()');
    } else { b.cargarCartera(cartera()); b.ev('render()'); }
    b.ev('renderCobranzas()');
    return b;
  }
  const texto = (b, id) => String((b.elems[id] && b.elems[id].innerHTML) || '');

  test('control: en el computador las frases y los botones siguen como siempre', () => {
    const b = abrir(false);
    assert.match(texto(b, 'tblCobranzas'), /Destilda a quien no quieras/);
    assert.match(texto(b, 'tblFueraCob'), /registrarle un pago/);
    assert.match(texto(b, 'tblNoToca'), /aquí le registras el/);
    b.ev("verCredito('P1')");
    assert.match(texto(b, 'mBody'), /Va a la papelera, no se pierde/);
    b.ev("verCliente('C1')");
    assert.match(texto(b, 'mBody'), /Este computador no la ha juntado/);
    assert.match(texto(b, 'mBody'), /Ver en la nube/);
  });

  test('Cobranzas: ni «destilda», ni casillas, ni registrar pagos; dice desde dónde se manda', () => {
    const b = abrir(true);
    assert.equal(b.ev('soloMirar()'), true);
    assert.doesNotMatch(texto(b, 'tblCobranzas'), /Destilda|no tienen casilla/);
    assert.match(texto(b, 'tblCobranzas'), /Los mensajes se mandan desde tu computador/);
    assert.doesNotMatch(texto(b, 'tblFueraCob'), /no tienen casilla|registrarle un pago/);
    assert.match(texto(b, 'tblFueraCob'), /no se le\s+puede escribir hoy/);
    assert.doesNotMatch(texto(b, 'tblNoToca'), /registras el|💵 Pago<\/b>/);
    assert.match(texto(b, 'tblNoToca'), /todavía no\s+vencen/);
  });

  test('el detalle de un crédito no explica un botón de borrar que no se ve', () => {
    const b = abrir(true);
    b.ev("verCredito('P1')");
    assert.doesNotMatch(texto(b, 'mBody'), /Va a la papelera/);
    assert.match(texto(b, 'mBody'), /Total para saldar/, 'y sigue diciendo cuánto se debe hoy');
  });

  test('la ficha no dice «este computador» ni ofrece juntar la cuenta; si la ficha sabe que está junta, lo dice', () => {
    const b = abrir(true);
    b.ev("verCliente('C1')");
    assert.doesNotMatch(texto(b, 'mBody'), /Este computador|Ver en la nube|Buscar su registro|Le va este enlace/);
    assert.doesNotMatch(texto(b, 'mBody'), /Su cuenta en la app/, 'sin dato, el renglón no sale');
    b.ev("DB.socios[0].cuentaJunta={celular:'3105550101',fecha:'2026-11-02'}; verCliente('C1')");
    assert.match(texto(b, 'mBody'), /Su cuenta en la app<\/span><span class="vv">Junta con el /);
    assert.doesNotMatch(texto(b, 'mBody'), /desde este computador/);
  });
});
