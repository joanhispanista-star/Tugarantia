/* ============================================================================
 * LA PISTA ÚNICA: UNA PESTAÑA, EL RECORRIDO POR MUNDO Y EL CARRITO — 23-nov-2026
 *
 *   node --test pruebas/pista-unica.test.js
 *
 * Joan: «quiero que la pestaña de tu garantia, pista y la pestaña de historial
 * se unifiquen en una sola pestaña y que se llame pista, que desde la pista se
 * vea el historial que tiene y en que pista estaba ese historial… que se vea
 * como una llamita azul por donde paso… y que no sea una letra si no el nombre
 * de la persona… y que cada vez que entre la persona a la pista se vea una
 * animacion de un pequeño carrito pasando por la pista como mostrando el
 * historial y que en cada parada sea un pago y pare por un segundo mostrando
 * ese pago con lo que le sumo de garantia».
 *
 * Lo que cuida este archivo:
 *   1. la barra tiene UNA pestaña para las tres, y Mi garantía e Historial se
 *      abren desde adentro, con sus reglas de siempre;
 *   2. el plan del repaso (qué mundos, qué pagos, dónde para) es una cuenta
 *      aparte, y no se alarga con la historia;
 *   3. el repaso entero, corrido aquí con un reloj y una pantalla de mentira:
 *      dice cada pago una vez y en orden, cruza de mundo, llega, y limpia;
 *   4. «Saltar», salir de la pestaña, «menos movimiento» y una hoja abierta;
 *   5. lo que no puede decir (es crédito) y lo que no le puede pesar a un
 *      teléfono barato.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../app/motor.js');
const P = require('../app/puente.js');
const PN = require('../app/pista-niveles.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const SOCIO = leer('app/socio.html');
const JS = leer('app/pista-niveles.js');
const CSS = leer('app/pista-niveles.css');

const plano = h => String(h).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const COP = n => '$' + Math.round(n).toLocaleString('es-CO');
const cred = (codigo, garantia, pago, corte, extra) => Object.assign(
  { codigo, pagado: true, fecha_pagado: pago, corte, garantia }, extra || {});

/* La cuenta de las pruebas de la pista: 297.600 hoy, en Aluminio. Dos pagos
   cayeron en Hierro (169.600 y 195.200) y tres en Aluminio (225.600, 257.600
   y 297.600); arrancó en 147.200. Uno de Aluminio se pagó tarde. */
const DOS_MUNDOS = { nombre: 'María Fernanda', garantia: 297600, creditos: [
  cred('TG-7', 40000, '2026-11-13', '2026-11-13'),
  cred('TG-6', 32000, '2026-11-03', '2026-10-30'),
  cred('TG-5', 30400, '2026-10-15', '2026-10-15'),
  cred('TG-4', 25600, '2026-09-30', '2026-09-30'),
  cred('TG-3', 22400, '2026-09-15', '2026-09-15')] };
const planDe = d => { const e = PN.donde(d.garantia); return PN.planRepaso(e, PN.recorrido(e.garantia, d.creditos)); };

/* ======================================================================== */
describe('1 · el plan del repaso: una cuenta aparte, sin pantalla', () => {

  test('va del mundo donde arrancó al de hoy, con cada pago en su mundo y en orden', () => {
    const p = planDe(DOS_MUNDOS);
    assert.deepEqual(p.mundos.map(w => w.nivel), ['hierro', 'aluminio']);
    assert.deepEqual(p.mundos.map(w => w.pagos.map(x => x.n)), [[1, 2], [3, 4, 5]]);
    assert.equal(p.pagos, 5);
    assert.equal(p.arranca, 147200);
    assert.deepEqual(p.mundos[1].pagos.map(x => x.dejo), [30400, 32000, 40000]);
    assert.deepEqual(p.mundos[1].pagos.map(x => x.en_fecha), [true, false, true]);
  });

  test('el primero arranca donde estaba su garantía; los pasados terminan en la meta; el de hoy, donde está', () => {
    const p = planDe(DOS_MUNDOS), e = PN.donde(DOS_MUNDOS.garantia);
    assert.ok(Math.abs(p.mundos[0].desde - 147200 / 200000) < 1e-9);
    assert.equal(p.mundos[0].hasta, 1);
    assert.equal(p.mundos[0].hoy, false);
    assert.equal(p.mundos[0].sigue, 'Aluminio');
    assert.equal(p.mundos[1].desde, 0);
    assert.equal(p.mundos[1].hasta, e.fraccion);
    assert.equal(p.mundos[1].hoy, true);
    /* cada parada queda donde está su piedra: la fracción del mundo en que quedó la garantía */
    p.mundos.forEach(w => w.pagos.forEach(x => assert.ok(x.f >= w.desde - 1e-9 && x.f <= w.hasta + 1e-9, 'una parada fuera de su tramo')));
    p.mundos.forEach(w => { for (let i = 1; i < w.pagos.length; i++) assert.ok(w.pagos[i].f >= w.pagos[i - 1].f, 'el carrito tendría que devolverse'); });
  });

  test('para un segundo en cada pago… hasta MAX_PARADAS; por los de antes pasa sin detenerse', () => {
    assert.equal(PN.MS_PARADA, 1000, 'Joan pidió un segundo por parada');
    assert.ok(planDe(DOS_MUNDOS).mundos.every(w => w.pagos.every(x => x.para)), 'con cinco pagos para en todos');
    const cs = [];
    for (let i = 0; i < 40; i++) cs.push(cred('C' + i, 15000, '2026-01-' + String(28 - (i % 28)).padStart(2, '0'), '2026-01-28'));
    const largo = planDe({ nombre: 'Años', garantia: 700000, creditos: cs });
    const todos = largo.mundos.flatMap(w => w.pagos);
    assert.equal(todos.length, 40, 'ningún pago se pierde del plan');
    assert.equal(todos.filter(x => x.para).length, PN.MAX_PARADAS);
    assert.deepEqual(todos.filter(x => x.para).map(x => x.n), todos.slice(-PN.MAX_PARADAS).map(x => x.n), 'las paradas son las de los ÚLTIMOS pagos');
    assert.equal(largo.paradas, PN.MAX_PARADAS);
  });

  test('NO SE ALARGA: con cuarenta pagos dura casi lo mismo que con ocho, y nunca más de 25 segundos', () => {
    const hace = n => { const cs = []; for (let i = 0; i < n; i++) cs.push(cred('C' + i, 15000, '2026-03-10', '2026-03-10')); return cs; };
    const ocho = PN.duracionRepaso(planDe({ nombre: 'A', garantia: 300000, creditos: hace(8) }));
    const cuarenta = PN.duracionRepaso(planDe({ nombre: 'A', garantia: 700000, creditos: hace(40) }));
    const cien = PN.duracionRepaso(planDe({ nombre: 'A', garantia: 1700000, creditos: hace(100) }));
    assert.ok(ocho >= 8000 && ocho <= 20000, 'ocho pagos: ' + ocho + ' ms');
    assert.ok(cuarenta <= 25000, 'cuarenta pagos: ' + cuarenta + ' ms');
    assert.ok(cien <= 30000, 'cien pagos: ' + cien + ' ms');
    assert.ok(cuarenta - ocho < 9000, 'la duración crece con la historia: ' + ocho + ' → ' + cuarenta);
  });

  test('sin pagos no hay repaso, y con datos raros no revienta', () => {
    assert.deepEqual(planDe({ nombre: 'Nueva', garantia: 100000, creditos: [] }).mundos, []);
    assert.doesNotThrow(() => PN.planRepaso(null, null));
    assert.doesNotThrow(() => PN.planRepaso(PN.donde(0), []));
    assert.equal(PN.duracionRepaso({ mundos: [] }) > 0, true);
  });

  test('un cerrado con pérdida no es una parada', () => {
    const d = { nombre: 'A', garantia: 250000, creditos: [cred('B', 20000, '2026-11-01', '2026-11-01', { cerrado_con_perdida: true }),
      cred('A', 20000, '2026-10-15', '2026-10-15')] };
    assert.equal(planDe(d).pagos, 1);
  });

  test('la ruta del carrito es la misma de la pista que se dibuja', () => {
    /* una piedra puesta en f se dibuja en el punto round(160·f) del eje: ese
       mismo punto tiene que dar rutaDe, o el carrito rodaría por fuera */
    ['hierro', 'aluminio', 'oro', 'misterio'].forEach(n => {
      const op = { cielo: 0.3, margenAbajo: 30, f: 0.6, piedras: [{ f: 0.4, sello: true }] };
      const h = PN.mundo(n, 328, 400, op), ruta = PN.rutaDe(n, 328, 400, op);
      assert.equal(ruta.length, 160);
      const m = /<g class="pn-piedra"><ellipse [^>]*\/><ellipse cx="([\d.-]+)" cy="([\d.-]+)"/.exec(h);
      assert.ok(m, 'no encontré la piedra en el dibujo de ' + n);
      const q = ruta[Math.round(160 * 0.4)];
      assert.ok(Math.abs(Number(m[1]) - q[0]) < 0.06 && Math.abs(Number(m[2]) - q[1]) < 0.06, n + ': la ruta no pasa por la piedra');
    });
  });
});

/* ======================================================================== */
/* UNA PANTALLA Y UN RELOJ DE MENTIRA, para correr el repaso entero aquí. La
   pantalla guarda lo que el repaso le escribe; el reloj avanza cuando la
   prueba lo dice. Lo que el repaso busca dentro del mundo (el carrito, la
   estela, las piedras, las llamitas) se saca del HTML que él mismo pintó. */
function mundoDeMentira(o) {
  o = o || {};
  const els = {}, rotulos = [], bajadas = [];
  const nodo = attrs => ({ attrs: attrs || {}, setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; } });
  const SELECTORES = { '.pn-carro': /<g class="pn-carro"/g, '.pn-carro-n': /<g class="pn-carro-n"/g, '[data-hecho]': /<path data-hecho="1"/g,
    '.pn-piedra': /<g class="pn-piedra"/g, '.pn-llama-s': /<g class="pn-llama-s" data-i="(\d+)"/g };
  function elemento(id) {
    const clases = new Set();
    const e = { id, _html: '', _cache: {}, offsetHeight: id === 'nav' ? 56 : 0,
      classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) },
      clases, getBoundingClientRect: () => ({ top: 170, bottom: o.pieEn || 760 }) };
    Object.defineProperty(e, 'innerHTML', { get: () => e._html, set: v => {
      e._html = String(v); e._cache = {};
      if (id === 'pnRp') rotulos.push(plano(e._html));
    } });
    e.querySelectorAll = sel => {
      if (!SELECTORES[sel]) throw new Error('el repaso busca algo que la prueba no conoce: ' + sel);
      if (!e._cache[sel]) {
        const re = new RegExp(SELECTORES[sel].source, 'g'), out = []; let m;
        while ((m = re.exec(e._html))) out.push(nodo(m[1] != null ? { 'data-i': m[1] } : {}));
        e._cache[sel] = out;
      }
      return e._cache[sel];
    };
    e.querySelector = sel => e.querySelectorAll(sel)[0] || null;
    return e;
  }
  const doc = { getElementById: id => (els[id] = els[id] || elemento(id)), addEventListener() {} };
  let ahora = 0, sig = 1; const cola = [];
  const viejos = { document: globalThis.document, window: globalThis.window, raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame, st: globalThis.setTimeout, ct: globalThis.clearTimeout,
    perf: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  globalThis.document = doc;
  globalThis.window = { innerHeight: 740, matchMedia: () => ({ matches: !!o.menosMovimiento }),
    scrollTo() {}, scrollBy: (x, y) => bajadas.push(y) };
  globalThis.requestAnimationFrame = fn => { const id = sig++; cola.push({ t: ahora + 16, fn, id }); return id; };
  globalThis.cancelAnimationFrame = id => { const i = cola.findIndex(c => c.id === id); if (i >= 0) cola.splice(i, 1); };
  globalThis.setTimeout = (fn, ms) => { const id = sig++; cola.push({ t: ahora + (ms || 0), fn, id }); return id; };
  globalThis.clearTimeout = id => { const i = cola.findIndex(c => c.id === id); if (i >= 0) cola.splice(i, 1); };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => ahora }, configurable: true, writable: true });
  return {
    els, rotulos, bajadas, pendientes: () => cola.length,
    /* avanza el reloj `ms` milisegundos, de 16 en 16, corriendo lo que toque */
    avanza(ms) {
      const hasta = ahora + ms;
      while (ahora < hasta) {
        ahora = Math.min(hasta, ahora + 16);
        for (let vueltas = 0; vueltas < 50; vueltas++) {
          const listas = cola.filter(c => c.t <= ahora);
          if (!listas.length) break;
          listas.forEach(c => { const i = cola.indexOf(c); if (i >= 0) { cola.splice(i, 1); c.fn(ahora); } });
        }
      }
    },
    /* como cuando la página repinta: las cajas de ahora son otras */
    repinta() { Object.keys(els).forEach(k => delete els[k]); },
    cierra() {
      PN.detener();
      globalThis.document = viejos.document; globalThis.window = viejos.window;
      globalThis.requestAnimationFrame = viejos.raf; globalThis.cancelAnimationFrame = viejos.caf;
      globalThis.setTimeout = viejos.st; globalThis.clearTimeout = viejos.ct;
      if (viejos.perf) Object.defineProperty(globalThis, 'performance', viejos.perf); else delete globalThis.performance;
      if (viejos.document === undefined) delete globalThis.document;
      if (viejos.window === undefined) delete globalThis.window;
      if (viejos.raf === undefined) delete globalThis.requestAnimationFrame;
      if (viejos.caf === undefined) delete globalThis.cancelAnimationFrame;
    }
  };
}
/* Corre `fn` con la pantalla de mentira puesta y la quita pase lo que pase. */
function conPantalla(o, fn) {
  const W = mundoDeMentira(o);
  try { return fn(W); } finally { W.cierra(); }
}

describe('2 · el repaso, corrido entero', () => {

  test('dice cada pago UNA vez y en orden, cruza de mundo, llega y deja todo como estaba', () => {
    conPantalla({}, W => {
      const html = PN.vista(DOS_MUNDOS);
      const escenaFinal = (/<div id="pnEscena">([\s\S]*?)<\/div><div class="pn-cabeza">/.exec(html) || [])[1];
      assert.ok(escenaFinal && escenaFinal.includes('pn-capas'), 'no encontré el mundo de hoy en la pestaña');
      assert.equal(PN.repasar(false), true, 'el repaso no arrancó');
      assert.equal(PN.repasando(), true);
      const hero = W.els.pnHero;
      assert.equal(hero.clases.has('pn-repasando'), true);
      W.avanza(PN.duracionRepaso(planDe(DOS_MUNDOS)) + 600);
      assert.deepEqual(W.rotulos, [
        'Mundo 1 de 9 Hierro',
        'Mundo 1 de 9 Hierro +' + COP(22400) + ' a tu garantía Pago 1 de 5 · 15 sep · en la fecha',
        'Mundo 1 de 9 Hierro +' + COP(25600) + ' a tu garantía Pago 2 de 5 · 30 sep · en la fecha',
        'Mundo 1 de 9 Hierro ¡Pasaste a Aluminio!',
        'Mundo 2 de 9 Aluminio',
        'Mundo 2 de 9 Aluminio +' + COP(30400) + ' a tu garantía Pago 3 de 5 · 15 oct · en la fecha',
        'Mundo 2 de 9 Aluminio +' + COP(32000) + ' a tu garantía Pago 4 de 5 · 3 nov',
        'Mundo 2 de 9 Aluminio +' + COP(40000) + ' a tu garantía Pago 5 de 5 · 13 nov · en la fecha',
        COP(297600) + ' de garantía hoy Lo lograste pago a pago, y sigues hacia Bronce.',
        ''
      ]);
      assert.equal(PN.repasando(), false);
      assert.equal(hero.clases.has('pn-repasando'), false, 'la pestaña quedó en modo repaso');
      assert.equal(hero.clases.has('pn-llego'), false, 'el rótulo de la llegada no se fue');
      assert.equal(W.pendientes(), 0, 'quedó algo corriendo después de llegar');
      /* y el mundo es el de hoy, el mismo que pinta la pestaña (salvo los id de los degradados) */
      const sinId = h => String(h).replace(/pn[a-z]+\d+/g, 'ID');
      assert.equal(sinId(W.els.pnEscena.innerHTML), sinId(escenaFinal));
      assert.equal(/class="pn-carro"/.test(W.els.pnEscena.innerHTML), false, 'el carrito se quedó parqueado en la pista');
    });
  });

  test('mientras corre: el carrito avanza, la estela crece detrás y cada piedra se enciende al pasar', () => {
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS);
      PN.repasar(false);
      const esc = W.els.pnEscena;
      /* al arrancar: el mundo es Hierro, sin marcador, con el carrito y sus dos piedras apagadas */
      assert.match(esc.innerHTML, /class="pn-capas pn-m-hierro"/);
      const carro = esc.querySelector('.pn-carro'), estela = esc.querySelector('[data-hecho]'), piedras = esc.querySelectorAll('.pn-piedra');
      assert.ok(carro && estela && piedras.length === 2);
      assert.equal(piedras.filter(p => /pn-ya/.test(p.attrs.class || '')).length, 0);
      const t0 = carro.attrs.transform, largo0 = (estela.attrs.d || '').length;
      W.avanza(900);
      assert.notEqual(carro.attrs.transform, t0, 'el carrito no se movió');
      assert.ok((estela.attrs.d || '').length >= largo0, 'la estela se acortó');
      assert.match(carro.attrs.transform, /^translate\([\d.-]+ [\d.-]+\) scale\(-?[\d.]+ [\d.]+\)$/);
      W.avanza(2600);
      assert.ok(piedras.filter(p => /pn-ya/.test(p.attrs.class || '')).length >= 1, 'pasó por un pago y la piedra sigue apagada');
      /* la placa del nombre va con el carrito, y no se sale del dibujo */
      const placa = esc.querySelector('.pn-carro-n');
      assert.ok(placa && /^translate\(/.test(placa.attrs.transform || ''));
      const x = Number((/translate\(([\d.-]+) /.exec(placa.attrs.transform) || [])[1]);
      assert.ok(x > 10 && x < 480, 'la placa se salió: ' + x);
    });
  });

  test('si el rótulo queda debajo de la barra, la página baja lo justo; si ya se ve, no se mueve', () => {
    conPantalla({ pieEn: 800 }, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false); W.avanza(100);
      /* 740 de alto, 56 de barra y 8 de aire: el piso es 676; el pie está en 800 */
      assert.deepEqual(W.bajadas, [124]);
    });
    conPantalla({ pieEn: 600 }, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false); W.avanza(100);
      assert.deepEqual(W.bajadas, []);
    });
  });

  test('«Saltar» lo lleva al final de una vez, sin rótulo y sin nada corriendo', () => {
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false); W.avanza(1500);
      const antes = W.rotulos.length;
      assert.equal(PN.saltar(), true);
      assert.equal(PN.repasando(), false);
      assert.equal(W.els.pnHero.clases.has('pn-repasando'), false);
      assert.equal(W.els.pnRp.innerHTML, '');
      assert.match(W.els.pnEscena.innerHTML, /class="pn-capas pn-m-aluminio"/, 'no quedó en el mundo de hoy');
      W.avanza(20000);
      assert.equal(W.rotulos.length, antes + 1, 'después de saltar siguió hablando');
      assert.equal(W.pendientes(), 0);
      assert.doesNotThrow(() => PN.saltar(), 'saltar sin repaso revienta');
    });
  });

  test('al salir de la pestaña se detiene, y no toca la pantalla que haya después', () => {
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false); W.avanza(1200);
      const rotulos = W.rotulos.length;
      PN.detener();   // lo que hace la página en cerrarPista
      W.avanza(20000);
      assert.equal(W.rotulos.length, rotulos);
      assert.equal(PN.repasando(), false);
      assert.equal(W.pendientes(), 0);
    });
    /* y si la pantalla se repintó sin avisar (una sesión que venció), se da cuenta sola */
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false); W.avanza(1200);
      const viejo = W.els.pnEscena, html = viejo.innerHTML;
      W.repinta();
      W.avanza(20000);
      assert.equal(viejo.innerHTML, html, 'siguió pintando en una caja que ya no está');
      assert.equal(Object.keys(W.els).filter(k => k === 'pnRp' && W.els[k].innerHTML).length, 0, 'escribió en la pantalla nueva');
    });
  });

  test('con «menos movimiento» no corre; tampoco encima de una hoja abierta, ni sin pagos', () => {
    conPantalla({ menosMovimiento: true }, W => {
      PN.vista(DOS_MUNDOS);
      assert.equal(PN.repasar(false), false);
      assert.equal(W.els.pnHero ? W.els.pnHero.clases.has('pn-repasando') : false, false);
    });
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS);
      assert.equal(PN.abrir('oro'), true);
      assert.equal(PN.repasar(false), false, 'el repaso corrió debajo de la hoja de un mundo');
      PN.cerrar();
      assert.equal(PN.repasar(false), true);
    });
    conPantalla({}, W => {
      PN.vista({ nombre: 'Nueva', garantia: 100000, creditos: [] });
      assert.equal(PN.repasar(false), false);
      void W;
    });
  });

  test('abrir la hoja de un mundo mientras corre: el carrito llega de una vez y la hoja abre', () => {
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false); W.avanza(1500);
      assert.equal(PN.repasando(), true);
      assert.equal(PN.abrir('oro'), true);
      assert.equal(PN.repasando(), false, 'el carrito siguió corriendo debajo de la hoja');
      assert.equal(W.els.pnHero.clases.has('pn-repasando'), false);
      assert.match(W.els.pnEscena.innerHTML, /class="pn-capas pn-m-aluminio"/);
      assert.ok(W.els.pnHoja.innerHTML.length > 100, 'la hoja no abrió');
      W.avanza(20000);
      assert.equal(W.pendientes(), 0);
      PN.cerrar();
    });
  });

  test('«Verlo en la pista» con el rótulo de la llegada todavía puesto: el reloj viejo no le borra nada al repaso nuevo', () => {
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS); PN.repasar(false);
      W.avanza(PN.duracionRepaso(planDe(DOS_MUNDOS)) - 2000);   // ya llegó: está el rótulo de «hoy»
      assert.equal(W.els.pnHero.clases.has('pn-llego'), true, 'la prueba no llegó al rótulo de la llegada');
      assert.equal(PN.repasar(true), true);
      assert.equal(W.els.pnHero.clases.has('pn-llego'), false);
      W.avanza(2500);   // pasa la hora en que el reloj viejo habría borrado el rótulo
      assert.equal(PN.repasando(), true);
      assert.equal(W.els.pnHero.clases.has('pn-repasando'), true);
      assert.notEqual(W.els.pnRp.innerHTML, '', 'el reloj de la llegada anterior borró el rótulo del repaso nuevo');
    });
  });

  test('montar lo arranca solo si la página dice que viene ENTRANDO', () => {
    conPantalla({}, W => {
      PN.vista(DOS_MUNDOS);
      PN.montar();
      assert.equal(PN.repasando(), false, 'corrió sin que nadie entrara');
      PN.montar({ entrando: false });
      assert.equal(PN.repasando(), false);
      PN.montar({ entrando: true });
      assert.equal(PN.repasando(), true);
      /* y pintar de nuevo la pestaña lo suelta */
      PN.vista(DOS_MUNDOS);
      assert.equal(PN.repasando(), false);
      void W;
    });
  });

  test('donde no hay con qué animar (el banco de pruebas, un navegador sin lo necesario) no hace nada', () => {
    assert.equal(typeof globalThis.requestAnimationFrame, 'undefined', 'la prueba anterior dejó un reloj de mentira puesto');
    PN.vista(DOS_MUNDOS);
    assert.equal(PN.repasar(false), false);
    assert.doesNotThrow(() => PN.montar({ entrando: true }));
    assert.doesNotThrow(() => PN.detener());
  });
});

/* ======================================================================== */
describe('3 · lo que no puede decir: es crédito', () => {
  /* todo lo que el repaso y el recorrido le escriben al cliente */
  const textos = [];
  conPantalla({}, W => {
    [DOS_MUNDOS, { nombre: 'Ana', garantia: 30000000, creditos: DOS_MUNDOS.creditos }].forEach(d => {
      const h = PN.vista(d);
      textos.push(plano(h.slice(h.indexOf('id="pnRecorrido"'), h.indexOf('</div>', h.lastIndexOf('pn-rec-pie')))));
      PN.repasar(false); W.avanza(40000);
    });
    W.rotulos.forEach(r => textos.push(r));
  });

  test('hay texto que mirar', () => {
    assert.ok(textos.filter(Boolean).length >= 10, 'la prueba no está mirando nada');
    assert.ok(textos.some(t => /a tu garantía/.test(t)) && textos.some(t => /Tu recorrido/.test(t)));
  });
  test('en pesos: ni un porcentaje', () => {
    textos.forEach(t => assert.equal(/%/.test(t), false, t));
    assert.ok(textos.some(t => /\+\$[\d.]+/.test(t)));
  });
  test('la garantía no se llama plata, ahorro, saldo ni riqueza, y nada se regala', () => {
    textos.forEach(t => assert.equal(/\b(plata|ahorr\w*|saldo|riqueza|dinero|billetera|premio\w*|regal\w*|rifa\w*|sorteo\w*|gan[aá]s?te? plata)\b/i.test(t), false, t));
  });
  test('nada invita a pedir, ni promete, ni apura', () => {
    textos.forEach(t => {
      assert.equal(/\b(pide|pídelo|pedir|solicita\w*|aprovecha\w*|no te lo pierdas|última oportunidad|solo hoy|ya casi)\b/i.test(t), false, t);
      assert.equal(/\b(garantizad\w*|aprobad\w*|segur[oa] que)\b/i.test(t), false, t);
    });
  });
  test('no dice en qué fecha llegó a un mundo: esa fecha no viaja', () => {
    textos.forEach(t => assert.equal(/llegaste|desde el \d|empezaste el/i.test(t), false, t));
  });
});

/* ======================================================================== */
describe('4 · los dibujos: azul del elixir, su nombre, y nada que le pese al teléfono', () => {

  test('el azul de la estela es el del elixir de la página, token por token', () => {
    const token = n => (new RegExp('--' + n + ':(#[0-9A-Fa-f]{6})').exec(SOCIO) || [])[1];
    assert.equal(PN.ELIXIR.hondo, token('elixir-hondo'));
    assert.equal(PN.ELIXIR.medio, token('elixir'));
    assert.equal(PN.ELIXIR.vivo, token('elixir-vivo'));
    assert.equal(PN.ELIXIR.claro, token('elixir-claro'));
    assert.equal(PN.ELIXIR.luz, token('elixir-luz'));
    assert.equal(PN.ELIXIR.noche, token('elixir-noche'));
  });

  test('lo recorrido va en azul, no en amarillo, y con llamitas: pocas', () => {
    const h = PN.mundo('aluminio', 328, 400, { cielo: 0.3, margenAbajo: 30, f: 0.9, nombre: 'Camila' });
    const usos = [...h.matchAll(/<use href="#pnr\d+"[^>]*stroke="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]);
    assert.ok(usos.length >= 4, 'no encontré los trazos de lo recorrido');
    assert.equal(usos.includes('#F5C542'), false, 'lo recorrido volvió al amarillo');
    assert.ok(usos.includes(PN.ELIXIR.vivo) && usos.includes(PN.ELIXIR.claro));
    const llamas = (h.match(/class="pn-llama-s"/g) || []).length;
    assert.ok(llamas >= 3 && llamas <= PN.MAX_LLAMAS, llamas + ' llamitas');
    /* y con poco recorrido, pocas o ninguna: no se amontonan */
    const poco = PN.mundo('aluminio', 328, 400, { cielo: 0.3, f: 0.04 });
    assert.ok((poco.match(/class="pn-llama-s"/g) || []).length <= 1);
    assert.equal(/pn-llama-s/.test(PN.mundo('aluminio', 328, 400, { cielo: 0.3 })), false, 'llamas en una pista sin recorrer');
  });

  test('el carrito solo se pinta cuando se pide, y la hoja de un mundo no lo trae', () => {
    assert.equal(/pn-carro/.test(PN.vista(DOS_MUNDOS)), false, 'la pestaña quieta trae un carrito');
    assert.equal(/pn-carro/.test(PN.hoja('oro')), false);
    const con = PN.mundo('hierro', 328, 400, { f: 0.5, carro: true, nombre: 'Camila' });
    assert.match(con, /<g class="pn-carro" transform="translate\(/);
    assert.match(con, /<g class="pn-carro-n"[\s\S]*?>Camila<\/text>/);
  });

  test('la placa del nombre no se sale del dibujo, ni con el marcador en un borde', () => {
    for (let f = 0; f <= 1; f += 0.05) {
      const h = PN.mundo('aluminio', 328, 400, { cielo: 0.3, margenAbajo: 30, f: Math.max(0.01, f), nombre: 'Maximiliano…' });
      const m = /<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)" height="17" rx="8.5"/.exec(h);
      assert.ok(m, 'no encontré la placa en f=' + f.toFixed(2));
      assert.ok(Number(m[1]) >= 3 && Number(m[1]) + Number(m[2]) <= 325, 'la placa se sale en f=' + f.toFixed(2) + ': ' + m[1] + ' + ' + m[2]);
    }
  });

  const sinNotas = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = [...sinNotas.matchAll(/(^|\}|\{)\s*([^{}@]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[2].trim(), cuerpo: m[3] }));
  const nuevas = reglas.filter(r => /\.pn-(llama|carro|piedra|rp|rec|repasando|llego)/.test(r.sel));

  test('lo nuevo de la hoja: sin filtros, y lo que se mueve solo cambia transform y opacity', () => {
    assert.ok(nuevas.length >= 20, 'no encontré las reglas nuevas: ' + nuevas.length);
    nuevas.forEach(r => assert.equal(/(^|[;\s])(-webkit-)?(backdrop-)?filter\s*:/.test(r.cuerpo), false, r.sel + ' usa filtros'));
    ['pn-llama', 'pn-rp'].forEach(k => {
      const kf = new RegExp('@keyframes ' + k + '\\{([\\s\\S]*?\\})\\}').exec(sinNotas);
      assert.ok(kf, 'falta @keyframes ' + k);
      [...kf[1].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]).forEach(p =>
        assert.ok(['transform', 'opacity'].includes(p), '@keyframes ' + k + ' anima «' + p + '»'));
    });
    nuevas.filter(r => /transition\s*:/.test(r.cuerpo)).forEach(r =>
      assert.match(r.cuerpo, /transition\s*:\s*opacity\b[^;,]*(;|$)/, r.sel + ' transiciona algo que no es opacity'));
  });

  test('con «menos movimiento» las llamitas se quedan quietas y el rótulo no entra animado', () => {
    const quietas = [...sinNotas.matchAll(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?\})\s*\}/g)].map(m => m[1]).join(' ');
    assert.match(quietas, /\.pn-llama\{animation:none\}/);
    assert.match(quietas, /\.pn-rp-p\{animation:none\}/);
    assert.match(JS, /prefers-reduced-motion: reduce/);
  });

  test('el carrito nace apagado y solo se ve mientras dura el repaso', () => {
    assert.match(sinNotas, /\.pn-carro,\.pn-carro-n\{opacity:0\}/);
    assert.match(sinNotas, /\.pn-repasando \.pn-carro,\.pn-repasando \.pn-carro-n\{opacity:1\}/);
    assert.match(sinNotas, /\.pn-repasando \.pn-piedra,\.pn-repasando \.pn-llama-s\{opacity:0\}/);
    assert.match(sinNotas, /\.pn-repasando \.pn-piedra\.pn-ya,\.pn-repasando \.pn-llama-s\.pn-ya\{opacity:1\}/);
    assert.match(sinNotas, /\.pn-rp\{display:none;/);
    assert.match(sinNotas, /\.pn-rp-saltar\{display:none;/);
  });

  test('«Saltar» y «Verlo en la pista» se pueden tocar con el dedo', () => {
    assert.match(sinNotas, /\.pn-rp-saltar\{[^}]*min-height:36px/);
    assert.match(sinNotas, /\.pn-rec-ver\{[^}]*min-height:36px/);
    assert.match(PN.vista(DOS_MUNDOS), /<button type="button" class="pn-rp-saltar" id="pnSaltar" onclick="PistaNiveles\.saltar\(\)">Saltar<\/button>/);
    assert.match(PN.vista(DOS_MUNDOS), /<button type="button" class="pn-rec-ver" id="pnVerRecorrido" onclick="PistaNiveles\.repasar\(true\)">/);
  });
});

/* ========================================================================
   LA APP ARRANCADA DE VERDAD (banco-socio.js)
   ======================================================================== */
let numero = 100;
function pagado(id, capital, desembolso, corte, pago) {
  return { id, numero: numero++, socioId: 's1', socioNombre: 'Clienta De Prueba', capital, costoPct: 20,
    fechaDesembolso: desembolso, cicloActual: corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: true, fechaPagado: pago, cicloPago: corte, gananciaPago: Math.round(capital * 0.2), cobroRegistrado: true };
}
const DIA = '2026-11-23';
function paquete() {
  numero = 100;
  const db = { socios: [{ id: 's1', numero: 1, nombre: 'Clienta De Prueba', cedula: '52111222', telefono: '3001112233',
    whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }], prestamos: [
    pagado('c1', 100000, '2026-07-30', '2026-08-15', '2026-08-15'), pagado('c2', 120000, '2026-08-16', '2026-08-31', '2026-08-31'),
    pagado('c3', 140000, '2026-09-01', '2026-09-15', '2026-09-15'), pagado('c4', 160000, '2026-09-16', '2026-09-30', '2026-09-30'),
    pagado('c5', 190000, '2026-10-01', '2026-10-15', '2026-10-15'), pagado('c6', 250000, '2026-10-16', '2026-10-31', '2026-11-03'),
    pagado('c7', 300000, '2026-11-04', '2026-11-15', '2026-11-13')], config: { negocio: 'Tu Garantía' } };
  return P.migrarSocio(db, db.socios[0], DIA);
}
async function app(opciones) {
  const ahora = new Date(DIA + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000, celular: '3001112233',
    paquete: { nombre: 'Clienta De Prueba', datos: paquete(), actualizado_en: DIA + 'T10:00:00Z', origen: 'nube', cedula: '52111222' } });
  const A = abrirSocio(Object.assign({ local: { socio_cuenta: sesion }, ahora }, opciones || {}));
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  return A;
}
const pestanitas = A => {
  const m = /<div class="subtabs"[^>]*>([\s\S]*?)<\/div>/.exec(A.elem('cuerpo').innerHTML);
  return m ? [...m[1].matchAll(/<button[^>]*?(class="on")?[^>]*onclick="irA\('([a-z]+)'\)">([^<]+)<\/button>/g)]
    .map(x => ({ a: x[2], texto: x[3], on: /class="on"/.test(x[0]), sel: /aria-selected="true"/.test(x[0]) })) : null;
};

describe('5 · una sola pestaña en la barra, y las tres pantallas adentro', () => {

  test('la barra: Inicio, Calculadora, Pista y Chat', () => {
    const barra = SOCIO.slice(SOCIO.indexOf('<nav class="nav" id="nav">'), SOCIO.indexOf('</nav>')).replace(/<!--[\s\S]*?-->/g, '');
    assert.deepEqual([...barra.matchAll(/<button data-t="([a-z]+)"[^>]*>([^<]+)</g)].map(m => m[1] + ':' + m[2]),
      ['inicio:Inicio', 'calc:Calculadora', 'pista:Pista', 'chat:Chat']);
    /* y «Pista» queda encendida en las tres pantallas de adentro */
    assert.match(SOCIO, /var EN_PISTA = \['pista', 'garantia', 'historial'\];/);
    assert.match(SOCIO, /classList\.toggle\('on', b\[i\]\.dataset\.t === \(enPista \? 'pista' : tab\)\)/);
  });

  test('en las tres pantallas, arriba, las tres pestañitas, con la suya encendida', async () => {
    const A = await app();
    for (const [tab, texto] of [['pista', 'Pista'], ['garantia', 'Mi garantía'], ['historial', 'Historial']]) {
      A.ev("irA('" + tab + "')");
      const p = pestanitas(A);
      assert.ok(p, 'en «' + tab + '» no están las pestañitas');
      assert.deepEqual(p.map(x => x.a + ':' + x.texto), ['pista:Pista', 'garantia:Mi garantía', 'historial:Historial']);
      assert.deepEqual(p.filter(x => x.on).map(x => x.texto), [texto]);
      assert.deepEqual(p.filter(x => x.sel).map(x => x.texto), [texto], 'aria-selected no dice cuál está abierta');
      assert.ok(A.elem('cuerpo').innerHTML.indexOf('<div class="subtabs"') < 30, 'las pestañitas no van arriba');
    }
  });

  test('Inicio, la Calculadora y el Chat no las llevan', async () => {
    const A = await app();
    for (const tab of ['inicio', 'calc', 'chat']) {
      A.ev("irA('" + tab + "')");
      assert.equal(pestanitas(A), null, '«' + tab + '» trae las pestañitas de la Pista');
    }
  });

  test('por dentro siguen siendo tres pantallas: Mi garantía e Historial se recargan solas, la Pista no', async () => {
    const A = await app();
    A.ev("irA('garantia')"); assert.equal(A.ev('TAB'), 'garantia'); assert.equal(A.ev('PANTALLA'), 'garantia');
    A.ev("irA('historial')"); assert.equal(A.ev('TAB'), 'historial');
    A.ev("irA('pista')"); assert.equal(A.ev('TAB'), 'pista');
    const seguras = (/var PANTALLAS_SEGURAS = \[([^\]]*)\]/.exec(SOCIO) || [])[1];
    assert.ok(/'garantia'/.test(seguras) && /'historial'/.test(seguras) && !/'pista'/.test(seguras));
  });

  test('la tarjeta «Tu garantía» de Inicio y la vuelta del perfil siguen llegando a Mi garantía', async () => {
    assert.match(SOCIO, /<div class="card laca" onclick="irA\(\\'garantia\\'\)" style="cursor:pointer">/);
    const A = await app();
    A.ev("irA('garantia')");
    const t = plano(A.elem('cuerpo').innerHTML);
    assert.ok(t.startsWith('Pista Mi garantía Historial Tu garantía'), t.slice(0, 80));
    assert.match(A.elem('cuerpo').innerHTML, /onclick="abrirPerfil\(\)"/, 'se perdió la única puerta a completar el perfil');
  });

  test('la Pista trae el historial por mundo, y el Historial de siempre sigue completo al lado', async () => {
    const A = await app();
    A.ev("irA('pista')");
    const t = plano(A.elem('cuerpo').innerHTML);
    assert.ok(/Tu recorrido ▶ Verlo en la pista/.test(t), t.slice(0, 300));
    assert.ok(/Aluminio aquí estás · \d pagos?, \d en la fecha/.test(t));
    assert.ok(/Hierro ya lo pasaste · \d pagos?, \d en la fecha/.test(t));
    assert.equal((A.elem('cuerpo').innerHTML.match(/<li class="pn-rec-f/g) || []).length, 7, 'los siete pagos, cada uno una vez');
    assert.equal(/Tus pagos en /.test(t), false, 'volvió la lista corta de pagos: son dos listas de lo mismo');
    A.ev("irA('historial')");
    const h = plano(A.elem('cuerpo').innerHTML);
    assert.ok(h.includes('Crédito por crédito') && h.includes('Lo que has logrado'));
  });

  test('el carrito corre al ENTRAR a la Pista, no cuando la Pista se repinta por dentro', async () => {
    const A = await app();
    A.ev("var __m = [], __orig = PistaNiveles.montar; PistaNiveles.montar = function (o) { __m.push(!!(o && o.entrando)); return __orig(o); };");
    A.ev("irA('pista'); irA('pista'); irA('garantia'); irA('pista'); irA('inicio'); irA('pista')");
    assert.deepEqual(JSON.parse(A.ev('JSON.stringify(__m)')), [true, false, true, true]);
    /* y las misiones repintan con irA('pista') estando en la pista: no vuelve a correr */
    assert.match(SOCIO, /repintar: function \(\) \{ irA\('pista'\); \}/);
  });

  test('al salir de la Pista, la página detiene el repaso', async () => {
    const A = await app();
    A.ev("var __d = 0, __od = PistaNiveles.detener; PistaNiveles.detener = function () { __d++; return __od(); };");
    A.ev("irA('pista')");
    const antes = A.ev('__d');
    A.ev("irA('inicio')");
    assert.ok(A.ev('__d') > antes, 'salió de la Pista y el repaso siguió vivo');
  });

  test('en el banco no hay con qué animar: la Pista abre igual y nada revienta', async () => {
    const A = await app();
    A.ev("irA('pista')");
    assert.equal(A.ev('PistaNiveles.repasando()'), false);
    assert.deepEqual(A.avisos, []);
    assert.ok(plano(A.elem('cuerpo').innerHTML).includes('Mundo 2 de 9 Aquí estás Aluminio'));
  });

  test('el marcador lleva el primer nombre de la cuenta', async () => {
    const A = await app();
    A.ev("irA('pista')");
    assert.match(A.elem('cuerpo').innerHTML, />Clienta<\/text>/);
  });
});
