/* ============================================================================
 * EL RAYO — 16 de septiembre de 2026
 *
 *   node --test pruebas/rayo.test.js
 *
 * Joan: «mejora el rayo, que no llegue tan lejos pero que se vea más
 * ramificado, y que sea un movimiento más constante y que se siga moviendo
 * mientras tocamos la pantalla».
 *
 * POR QUÉ UN ADORNO MERECE PRUEBAS.
 *
 * Porque este adorno corre en el teléfono de TODO el que abre la puerta pública,
 * y en el peor momento: mientras la persona toca la pantalla para decidir si
 * pide plata. Un adorno se rompe de formas que no se ven en una captura:
 *
 *   · corriendo para siempre. El bucle vive de requestAnimationFrame, y si un
 *     rayo no se muere nunca —un dedo que se queda puesto, un pointerup que no
 *     llega porque el navegador se quedó con el gesto— la batería se va sin que
 *     nada se vea mal en pantalla.
 *   · quedándose pegado. Si `pointercancel` no suelta, el rayo se queda colgado
 *     del dedo que ya no está.
 *   · creciendo sin freno. Las ramas se llaman a sí mismas: sin un corte de
 *     profundidad, un teléfono lento se arrodilla.
 *   · ignorando a quien pidió que no se moviera. prefers-reduced-motion no es un
 *     detalle de accesibilidad: hay gente a la que una animación así le dispara
 *     una migraña.
 *
 * Y porque lo que Joan pidió son cuatro cosas MEDIBLES —alcance corto, más
 * ramas, movimiento constante, vivo mientras se toca— y una prueba puede decir
 * si están o no mejor que mirando una captura, que congela justo lo que importa.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'play', 'estilo.css'), 'utf8');
const VIVO = PLAY.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* --------------------------------------------------------------------------
 * EL BANCO, con lienzo de mentiras y fotogramas a mano.
 *
 * El lienzo apunta lo que se le dibuja, así que una prueba puede contar trazos
 * en vez de mirar píxeles. Y los fotogramas no corren solos: la prueba los pisa
 * uno por uno, que es la única forma de preguntar «¿esto se murió?» sin esperar.
 * ------------------------------------------------------------------------ */
function abrirPlay(opciones) {
  const o = opciones || {};
  const trazos = [];
  const ctx2d = {
    _lw: 1, _ss: '',
    set lineWidth(v) { this._lw = v; }, get lineWidth() { return this._lw; },
    set strokeStyle(v) { this._ss = v; }, get strokeStyle() { return this._ss; },
    lineCap: '', lineJoin: '',
    save() {}, restore() {}, setTransform() {}, clearRect() {},
    beginPath() { this._pts = 0; },
    moveTo() { this._pts = 1; },
    lineTo() { this._pts++; },
    stroke() { trazos.push({ puntos: this._pts, ancho: this._lw, color: this._ss }); }
  };
  const elems = {};
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', checked: false, max: '', min: '', textContent: '', innerHTML: '',
    dataset: {}, style: {}, files: null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, insertBefore() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, scrollIntoView() {},
    play: () => Promise.resolve(),
    width: 0, height: 0,
    getContext: () => ctx2d
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('lienzo'), addEventListener(t, f) { (this._oy[t] = this._oy[t] || []).push(f); },
    _oy: {}, head: elem('head'), body: elem('body'), documentElement: elem('html'),
    title: '', hidden: false
  };
  /* Los fotogramas, en cola. `pisar(n)` corre n. */
  const cola = [];
  let reloj = 0;

  const ctx = {
    console, document: doc, alert() {}, confirm: () => true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'https://tugarantia.net/play/', hash: '', pathname: '/play/',
      search: '', protocol: 'https:', host: 'tugarantia.net', origin: 'https://tugarantia.net' },
    history: { replaceState() {} },
    navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() } },
    fetch: () => Promise.reject(new Error('sin red')),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: f => { cola.push(f); return cola.length; },
    cancelAnimationFrame() {},
    /* El interruptor de «no quiero movimiento», que una prueba enciende. */
    matchMedia: q => ({ matches: !!o.sinMovimiento && /reduced-motion/.test(q), addEventListener() {} }),
    /* `== null` y no `||`: una prueba necesita poder pedir ancho CERO —es el
       caso de la pestaña que todavía no se muestra— y con `||` el cero se caía
       al valor por defecto, así que esa prueba no probaba nada. */
    innerWidth: o.ancho == null ? 390 : o.ancho,
    innerHeight: o.alto == null ? 780 : o.alto, devicePixelRatio: 2,
    Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Image: class {}, FileReader: class {}, Blob: class {}, File: class {},
    open() {}, scrollTo() {}, performance: { now: () => reloj },
    _oyentes: {},
    addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
    removeEventListener() {}, dispatchEvent() { return true; }
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.CreditosPublicables = require('../app/creditos.js');
  ctx.CuentaSocio = require('../app/cuenta.js');
  ctx.Cumplimiento = require('../app/cumplimiento.js');
  ctx.MotorReglas = require('../app/motor.js');
  ctx.FichaSocio = require('../app/ficha.js');
  ctx.ChatTuGarantia = require('../app/chat.js');
  vm.createContext(ctx);
  [...PLAY.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'play#' + i }));

  const ev = e => vm.runInContext(e, ctx, { filename: 'banco' });
  /* Un toque: se llama al oyente que la página registró, con el evento que le
     llegaría del navegador. */
  const tocar = (tipo, x, y, id) => {
    const os = ctx._oyentes[tipo] || [];
    os.forEach(f => f({ clientX: x, clientY: y, pointerId: id == null ? 1 : id }));
  };
  /* Pisa n fotogramas, avanzando el reloj `ms` en cada uno. */
  const pisar = (n, ms) => {
    for (let i = 0; i < n; i++) {
      const f = cola.shift();
      if (!f) return i;
      reloj += (ms == null ? 16 : ms);
      f(reloj);
    }
    return n;
  };
  return { ev, tocar, pisar, trazos, elems, cola, reloj: () => reloj };
}

describe('el rayo: corto, ramificado, y vivo mientras el dedo esté puesto', () => {

  test('NO LLEGA TAN LEJOS: el alcance está acotado y sale de la pantalla', () => {
    /* Lo primero que pidió Joan. Antes era la suma de veintiséis pasos al azar
       de hasta 38px —media pantalla y sin techo—; ahora es un número. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    const L = P.ev('largoDeRayo()');
    const max = P.ev('RAYO_LARGO_MAX');
    assert.ok(L <= max, 'el alcance (' + L + ') se pasa de su propio techo');
    assert.ok(L <= 390 * 0.30, 'en un celular de 390px el rayo llega a ' + L + 'px: es demasiado');
    assert.ok(L >= 60, 'el rayo quedó tan corto (' + L + 'px) que no se va a ver');
    /* Y en una pantalla grande no se vuelve un cable que cruza el escritorio. */
    const G = abrirPlay({ ancho: 2560, alto: 1440 });
    G.ev('iniciarRayos()');
    assert.equal(G.ev('largoDeRayo()'), max,
      'en una pantalla grande el alcance no topa: se haría enorme');
  });

  test('SE RAMIFICA, y las ramas tienen ramas', () => {
    /* La segunda cosa que pidió. Antes eran tres rayitas rectas de 12px que
       salían de un sorteo por paso. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 120, 200);
    P.pisar(3);
    const r = JSON.parse(P.ev('JSON.stringify({ramas: RAYOS.vivos[0].ramas.map(function(b){' +
      'return {n: b.nivel, p: b.pts.length};}), tronco: RAYOS.vivos[0].camino.length})'));
    assert.ok(r.ramas.length >= 2, 'el rayo salió con ' + r.ramas.length + ' ramas');
    assert.ok(r.tronco >= 9, 'el tronco tiene ' + r.tronco + ' puntos: es una línea recta');
    /* Y que haya de dos profundidades es lo que lo hace ver ramificado y no
       «tres rayos encimados». */
    const niveles = new Set(r.ramas.map(b => b.n));
    assert.ok(niveles.size >= 2 || r.ramas.length >= 4,
      'todas las ramas son del mismo nivel: no hay ramas de ramas');
    /* Cada rama es un camino de verdad, no un palito. */
    r.ramas.forEach(b => assert.ok(b.p >= 4,
      'una rama tiene ' + b.p + ' puntos: es una raya, no una rama'));
  });

  test('LA RAMIFICACIÓN TIENE FONDO: no se llama a sí misma sin corte', () => {
    /* ramasDeRayo es recursiva. Sin el corte de profundidad, un teléfono lento
       se arrodilla y nadie sabría por qué. */
    const i = VIVO.indexOf('function ramasDeRayo');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /profundidad > 0/,
      'la recursión de las ramas no tiene corte de profundidad');
    assert.match(cuerpo, /profundidad - 1/, 'la recursión no baja la profundidad');
    /* Y en la práctica: ningún rayo pasa de un número razonable de ramas. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 150, 300);
    for (let k = 0; k < 40; k++) {
      P.pisar(1);
      const n = P.ev('RAYOS.vivos[0] ? RAYOS.vivos[0].ramas.length : 0');
      assert.ok(n <= 14, 'en el fotograma ' + k + ' el rayo llegó a ' + n + ' ramas');
    }
  });

  test('EL MOVIMIENTO ES CONSTANTE: el camino se rehace en cada fotograma', () => {
    /* La tercera cosa que pidió. Antes el rayo crecía una vez y se quedaba
       quieto hasta apagarse; ahora se vuelve a sortear, que es lo que hace que
       vibre como un rayo de verdad. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 200, 400);
    P.pisar(2);
    const a = P.ev('JSON.stringify(RAYOS.vivos[0].camino)');
    P.pisar(1);
    const b = P.ev('JSON.stringify(RAYOS.vivos[0].camino)');
    P.pisar(1);
    const c = P.ev('JSON.stringify(RAYOS.vivos[0].camino)');
    assert.notEqual(a, b, 'el camino no cambió de un fotograma al otro: está quieto');
    assert.notEqual(b, c, 'el camino solo cambió una vez');
  });

  test('SE SIGUE MOVIENDO MIENTRAS SE TOCA, y sigue al dedo', () => {
    /* La cuarta, y la que se pidió con más letras. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 100, 100);
    P.pisar(60);                                  // casi un segundo
    assert.equal(P.ev('RAYOS.vivos.length'), 1, 'el rayo se murió con el dedo puesto');
    assert.equal(P.ev('RAYOS.vivos[0].sujeto'), true);
    assert.equal(P.ev('RAYOS.vivos[0].alfa'), 1, 'se está apagando aunque el dedo sigue puesto');
    /* Y el origen es el dedo. */
    P.tocar('pointermove', 260, 330);
    P.pisar(1);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify([RAYOS.vivos[0].x, RAYOS.vivos[0].y])')),
      [260, 330], 'el rayo no siguió al dedo');
  });

  test('al soltar se apaga, y el bucle se APAGA con él', () => {
    /* Un bucle de animación que sigue girando en vacío es batería regalada, y no
       se ve: la pantalla está quieta y el teléfono caliente. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 100, 100);
    P.pisar(5);
    P.tocar('pointerup', 100, 100);
    P.pisar(60);
    assert.equal(P.ev('RAYOS.vivos.length'), 0, 'el rayo no se apagó después de soltar');
    assert.equal(P.ev('RAYOS.corriendo'), false, 'el bucle sigue girando sin ningún rayo vivo');
  });

  test('POINTERCANCEL TAMBIÉN SUELTA — en un celular es el que llega de verdad', () => {
    /* Cuando el navegador se queda con el gesto para desplazar la página, no
       manda pointerup: manda pointercancel. Sin escucharlo, el rayo se queda
       colgado del dedo que ya no está hasta el tope de aguante. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 100, 100);
    P.pisar(3);
    P.tocar('pointercancel', 100, 100);
    P.pisar(60);
    assert.equal(P.ev('RAYOS.vivos.length'), 0, 'pointercancel no apagó el rayo');
  });

  test('UN DEDO QUE NO SE LEVANTA NUNCA TAMPOCO CORRE PARA SIEMPRE', () => {
    /* Un bolsillo que aprieta la pantalla, un lápiz apoyado, un navegador que se
       traga el pointerup. Sin tope, la animación corre indefinidamente. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    const tope = P.ev('RAYO_AGUANTE');
    assert.ok(tope > 0 && tope <= 15000, 'el tope de aguante es ' + tope + 'ms');
    P.tocar('pointerdown', 100, 100);
    /* Se pisan fotogramas hasta pasarse del aguante, sin soltar nunca. */
    P.pisar(Math.ceil(tope / 16) + 40);
    assert.equal(P.ev('RAYOS.vivos.length'), 0,
      'con el dedo puesto para siempre, el rayo no se apaga nunca');
    assert.equal(P.ev('RAYOS.corriendo'), false);
  });

  test('un dedo, un rayo; y el cuarto dedo no crea nada', () => {
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    [1, 2, 3, 4].forEach(id => P.tocar('pointerdown', 50 * id, 100, id));
    assert.equal(P.ev('RAYOS.vivos.length'), 3, 'se pasó del tope de rayos a la vez');
    /* Y el mismo dedo dos veces no deja dos pegados. */
    P.tocar('pointerdown', 80, 120, 1);
    assert.equal(P.ev('RAYOS.vivos.length'), 3, 'el mismo dedo creó dos rayos');
  });

  test('NO SE DIBUJA FUERA DE LA PANTALLA', () => {
    /* Si el destino se sale, media rama se dibuja donde nadie la ve — y el rayo
       se lee cortado. */
    const P = abrirPlay({ ancho: 390, alto: 780 });
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 4, 4);       // la esquina, que es el caso peor
    P.pisar(30);
    const d = JSON.parse(P.ev('JSON.stringify([RAYOS.vivos[0].dx, RAYOS.vivos[0].dy])'));
    assert.ok(d[0] >= 0 && d[0] <= 390, 'el destino se fue en x: ' + d[0]);
    assert.ok(d[1] >= 0 && d[1] <= 780, 'el destino se fue en y: ' + d[1]);
  });

  test('RESPETA A QUIEN PIDIÓ QUE NADA SE MUEVA', () => {
    /* No es un detalle de accesibilidad: hay gente a la que una animación así le
       produce mareo o le dispara una migraña, y el sistema operativo ya trae la
       respuesta puesta. */
    const P = abrirPlay({ sinMovimiento: true });
    P.ev('iniciarRayos()');
    assert.equal(P.ev('RAYOS.lienzo'), null, 'se creó el lienzo con reduced-motion puesto');
    P.tocar('pointerdown', 100, 100);
    assert.equal(P.ev('RAYOS.vivos.length'), 0, 'nació un rayo con reduced-motion puesto');
    /* Y la hoja de estilos también lo apaga, por si el lienzo llegara por otro
       lado. Se busca DENTRO del bloque de la media query y no en los primeros
       400 caracteres desde la palabra: la primera aparición es un comentario que
       la explica, y medir desde ahí hacía que la prueba dependiera de cuánto
       texto tuviera ese comentario. */
    const bloque = CSS.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(bloque, 'la hoja no tiene bloque de prefers-reduced-motion');
    assert.match(bloque[1], /#rayos\s*\{[^}]*display:\s*none/,
      'la hoja no esconde el lienzo cuando se pide no-movimiento');
  });

  test('el lienzo es sordo al tacto: jamás se queda con un toque de un botón', () => {
    assert.match(CSS, /#rayos\{[^}]*pointer-events:none/,
      'el lienzo del rayo puede robarse un toque que era para un botón');
  });

  test('DIBUJA DE VERDAD: halo, filamento y ramas, sin shadowBlur', () => {
    /* shadowBlur recalcula el desenfoque en cada fotograma, y con el camino
       regenerándose sesenta veces por segundo ese coste se paga sesenta veces. */
    const P = abrirPlay();
    P.ev('iniciarRayos()');
    P.tocar('pointerdown', 150, 300);
    P.trazos.length = 0;
    P.pisar(1);
    assert.ok(P.trazos.length >= 3,
      'un fotograma dibujó ' + P.trazos.length + ' trazos: falta el halo, el filamento o las ramas');
    const anchos = P.trazos.map(t => t.ancho);
    assert.ok(Math.max.apply(null, anchos) >= 8, 'no se dibuja el halo ancho');
    assert.ok(Math.min.apply(null, anchos) <= 2, 'no se dibuja el filamento fino');
    assert.ok(!/shadowBlur/.test(VIVO), 'volvió el shadowBlur, que es caro por fotograma');
  });

  test('si el lienzo todavía no tiene tamaño, NO se dibuja en la nada', () => {
    /* Pasa cuando la página arranca en una pestaña que no se muestra: innerWidth
       llega en cero, y sin esto el lienzo nace de 0×0 y el rayo no se dibuja
       nunca más, sin un error en consola. */
    const P = abrirPlay({ ancho: 0, alto: 0 });
    P.ev('iniciarRayos()');
    assert.equal(P.ev('medirLienzo()'), false);
    /* Y cuando la pestaña por fin se muestra, se recupera solo. */
    P.ev('window.innerWidth = 390; window.innerHeight = 780;');
    assert.equal(P.ev('medirLienzo()'), true, 'no se recupera cuando la pestaña aparece');
  });
});
