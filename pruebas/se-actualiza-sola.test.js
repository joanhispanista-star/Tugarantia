'use strict';
/* ==========================================================================
 * SE ACTUALIZA SOLA, SIN QUE NADIE PIERDA NADA — 21-oct-2026
 *
 *   node --test pruebas/se-actualiza-sola.test.js
 *
 * Joan: «que cuando tengamos actualizaciones el cliente pueda actualizar de
 * una forma automática». Lo medido ese día: ninguna página buscaba versión
 * nueva (ni registration.update, ni controllerchange), volver a la app en
 * segundo plano no es navegar, y para ver lo nuevo había que cerrar la app
 * del todo sin que nadie lo dijera. Además la red-primero de sw.js pasaba por
 * la caché HTTP (max-age=600) y podía mezclar una página nueva con un .js
 * viejo.
 *
 * Aquí corren, de verdad:
 *   1. app/actualizar.js contra un navegador de mentira donde se publica, se
 *      sale y se vuelve de la app, se pierde la señal y se toca la pantalla;
 *   2. sw.js en un contexto de service worker: lo que pide a la red;
 *   3. las tres páginas del cliente en sus bancos (play/, app/socio.html,
 *      platachat/): su lista blanca, la pestaña a la que se vuelve y la
 *      bienvenida que se salta; y el CRM y el espejo, que solo avisan;
 *   4. los centinelas: VERSION_SITIO de cada página = CACHE de sw.js, y cada
 *      función que pinta una pantalla dice cuál es.
 * Todas FALLAN con 8323fc0: app/actualizar.js no existía.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { asentar } = require('./esperar.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirPlataChat } = require('./banco-platachat.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const A = require('../app/actualizar.js');

/* ==========================================================================
 * UN NAVEGADOR DE MENTIRA para app/actualizar.js: un service worker con su
 * registro, las cachés, la pestaña (sessionStorage), el reloj, la señal y la
 * visibilidad. `publicar('v139')` es lo que ve una página abierta cuando el
 * service worker nuevo terminó: su caché es la única (activate borró la
 * vieja) y llega controllerchange.
 * ======================================================================== */
function navegador(o) {
  o = o || {};
  const st = {
    t: 1800000000000, recargas: 0, updates: 0, hidden: false, onLine: true, instalando: null,
    claves: (o.claves || ['tugarantia-v138']).slice(), sesion: o.sesion || {},
    oyentes: { doc: {}, win: {}, sw: {} }, intervalos: [], elementos: [], campos: o.campos || [], videos: o.videos || []
  };
  const oir = d => (t, f) => { (st.oyentes[d][t] = st.oyentes[d][t] || []).push(f); };
  const soltar = d => (t, f) => { const l = st.oyentes[d][t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  const disparar = (d, t) => (st.oyentes[d][t] || []).slice().forEach(f => f({ type: t }));
  const reg = {
    get installing() { return st.instalando; }, waiting: null,
    update() { st.updates++; return Promise.resolve(); }
  };
  const el = tag => {
    const e = { tagName: String(tag).toUpperCase(), style: {}, hijos: [], textContent: '', id: '', className: '', attrs: {}, oyentes: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild(h) { this.hijos.push(h); return h; }, addEventListener(t, f) { this.oyentes[t] = f; } };
    st.elementos.push(e);
    return e;
  };
  const document = {
    get hidden() { return st.hidden; }, get visibilityState() { return st.hidden ? 'hidden' : 'visible'; },
    addEventListener: oir('doc'), removeEventListener: soltar('doc'),
    createElement: el, getElementById: id => st.elementos.find(e => e.id === id) || null,
    querySelectorAll: sel => (sel === 'video' ? st.videos : st.campos),
    body: null, head: null
  };
  document.body = el('body'); document.head = el('head');
  const sesionStorage = o.sinMemoria
    ? { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } }
    : { getItem: k => (k in st.sesion ? st.sesion[k] : null), setItem: (k, v) => { st.sesion[k] = String(v); }, removeItem: k => { delete st.sesion[k]; } };
  const entorno = {
    window: { addEventListener: oir('win'), removeEventListener: soltar('win') },
    document,
    navigator: { get onLine() { return st.onLine; },
                 serviceWorker: o.sinServiceWorker ? undefined
                   : { ready: Promise.resolve(reg), addEventListener: oir('sw'), removeEventListener: soltar('sw') } },
    caches: { keys: () => Promise.resolve(st.claves.slice()) },
    sessionStorage: sesionStorage,
    location: { protocol: o.protocolo || 'https:', reload() { st.recargas++; } },
    ahora: () => st.t,
    setInterval: (f, ms) => { st.intervalos.push({ f, ms }); return st.intervalos.length; },
    clearInterval() {}
  };
  const N = {
    st, reg, entorno,
    publicar(v) { st.claves = ['tugarantia-' + v]; disparar('sw', 'controllerchange'); return asentar(12); },
    ocultar() { st.hidden = true; disparar('doc', 'visibilitychange'); return asentar(12); },
    volver() { st.hidden = false; disparar('doc', 'visibilitychange'); return asentar(12); },
    pasa(ms) { st.t += ms; },
    tocar() { disparar('doc', 'pointerdown'); },
    sinSenal() { st.onLine = false; },
    conSenal() { st.onLine = true; disparar('win', 'online'); return asentar(12); },
    cadaRato() { st.intervalos.forEach(i => i.f()); return asentar(12); },
    franja() {
      const f = st.elementos.find(e => e.id === A.ID_FRANJA);
      if (!f || f.style.display === 'none') return null;
      const [texto, boton, cerrar] = f.hijos;
      return { texto: texto.textContent, boton: boton.style.display === 'none' ? null : boton.textContent,
               tocar: () => boton.oyentes.click(), cerrar: () => cerrar.oyentes.click() };
    },
    arrancar(op) {
      const c = A.iniciar(Object.assign({ version: 'v138', entorno }, op || {}));
      return asentar(12).then(() => c);
    }
  };
  return N;
}
const seguro = () => true, noSeguro = () => false;

/* ======================================================================== */
describe('1. la decisión, sin navegador (app/actualizar.js, decidir)', () => {

  const base = { pagina: 'v138', nueva: 'v139', instalando: false, enLinea: true, soloAvisar: false,
                 seguro: true, autoPosible: true, momento: 'oculta' };
  const d = cambios => A.decidir(Object.assign({}, base, cambios));

  test('la misma versión, una más vieja, o el service worker nuevo instalándose: nada', () => {
    assert.equal(d({ nueva: 'v138' }).accion, 'nada');
    assert.equal(d({ nueva: 'v137' }).accion, 'nada');
    assert.equal(d({ nueva: '' }).accion, 'nada');
    assert.equal(d({ instalando: true }).accion, 'nada', 'la caché nueva existe pero el service worker todavía no manda');
    assert.equal(d({ pagina: '' }).accion, 'nada', 'sin número propio no se compara: mejor no avisar que recargar de gana');
  });

  test('segura y fuera de la vista, al volver o al cambiar de pantalla: recarga; mirándola: NO', () => {
    ['oculta', 'volviendo', 'transicion'].forEach(m => assert.equal(d({ momento: m }).accion, 'recargar', m));
    const r = d({ momento: 'mirando' });
    assert.equal(r.accion, 'avisar', 'recargó debajo del dedo de quien está leyendo');
    assert.deepEqual(r.aviso, { texto: A.TEXTOS.alSalir, boton: 'Actualizar ahora' });
  });

  test('no segura: nunca recarga, y dice «se pone sola cuando termines y vuelvas al inicio»', () => {
    ['oculta', 'volviendo', 'transicion', 'mirando'].forEach(m => {
      const r = d({ seguro: false, momento: m });
      assert.equal(r.accion, 'avisar', m);
      assert.deepEqual(r.aviso, { texto: 'Hay una versión nueva: se pone sola cuando termines y vuelvas al inicio.', boton: null });
    });
  });

  test('«se pone sola» SOLO cuando de verdad se va a poner sola (la interfaz no promete lo que no hace)', () => {
    /* Sin la recarga sola (ya se usó en esta pestaña, o no hay sessionStorage)
       ningún texto puede decir «se pone sola». */
    const a = d({ autoPosible: false, momento: 'oculta' });
    assert.equal(a.accion, 'avisar');
    assert.deepEqual(a.aviso, { texto: 'Hay una versión nueva.', boton: 'Actualizar ahora' });
    const b = d({ autoPosible: false, seguro: false });
    assert.ok(!/se pone sola/.test(b.aviso.texto), b.aviso.texto);
    assert.match(b.aviso.texto, /toca «Actualizar ahora»/);
    Object.keys(A.TEXTOS).filter(k => /se pone sola/.test(A.TEXTOS[k]))
      .forEach(k => assert.ok(['alTerminar', 'alSalir'].includes(k), k + ' promete «se pone sola»'));
  });

  test('sin señal: ni recarga ni promete nada', () => {
    ['oculta', 'volviendo', 'mirando'].forEach(m => assert.deepEqual(d({ enLinea: false, momento: m }), { accion: 'nada', aviso: null }));
    assert.deepEqual(d({ enLinea: false, seguro: false }), { accion: 'nada', aviso: null });
  });

  test('el CRM y el espejo (soloAvisar): NUNCA recargan, ni ocultos ni seguros; botón «Recargar» solo con señal', () => {
    ['oculta', 'volviendo', 'transicion', 'mirando'].forEach(m => {
      const r = d({ soloAvisar: true, momento: m });
      assert.equal(r.accion, 'avisar');
      assert.deepEqual(r.aviso, { texto: A.TEXTOS.panel, boton: 'Recargar' });
    });
    assert.deepEqual(d({ soloAvisar: true, enLinea: false }).aviso, { texto: A.TEXTOS.panelSinSenal, boton: null });
  });

  test('las versiones y el sello', () => {
    assert.equal(A.numeroDeVersion('v138'), 138);
    assert.equal(A.numeroDeVersion('tugarantia-v139'), 139);
    assert.equal(A.numeroDeVersion('2026-10-21'), 0);
    assert.equal(A.versionDeCaches(['tugarantia-v138', 'tugarantia-v140', 'otra-cosa-v999', 'tugarantia-vieja']), 'v140');
    assert.equal(A.versionDeCaches([]), '');
    assert.equal(A.sello('2026-10-21', 'v138'), 'Versión 2026-10-21 · v138');
  });
});

/* ======================================================================== */
describe('2. app/actualizar.js en un navegador: publicar, salir, volver', () => {

  test('la PRIMERA apertura después de publicar no recarga de gana (VERSION_SITIO contra la caché)', async () => {
    /* El HTML v139 llegó por la red; el service worker v139 se está
       instalando con su caché ya creada; después toma la página. */
    const N = navegador({ claves: ['tugarantia-v138', 'tugarantia-v139'] });
    N.st.instalando = {};
    await N.arrancar({ version: 'v139', momentoSeguro: seguro });
    N.st.instalando = null;
    await N.publicar('v139');
    await N.ocultar();
    assert.equal(N.st.recargas, 0, 'la app cargó dos veces seguidas');
    assert.equal(N.franja(), null);
  });

  test('busca: al abrir, al volver pasados 10 min (no antes), cada 30 min a la vista y al volver la señal', async () => {
    const N = navegador();
    await N.arrancar({ momentoSeguro: seguro });
    assert.equal(N.st.updates, 1, 'no buscó al abrir');
    assert.equal(N.st.intervalos.length, 1);
    assert.equal(N.st.intervalos[0].ms, 30 * 60 * 1000);
    await N.ocultar(); N.pasa(5 * 60 * 1000); await N.volver();
    assert.equal(N.st.updates, 1, 'buscó al volver a los 5 min: es una consulta por cada vistazo');
    await N.ocultar(); N.pasa(6 * 60 * 1000); await N.volver();
    assert.equal(N.st.updates, 2, 'no buscó al volver pasados 10 min');
    await N.cadaRato();
    assert.equal(N.st.updates, 3, 'no buscó a los 30 min con la página a la vista');
    await N.ocultar(); await N.cadaRato();
    assert.equal(N.st.updates, 3, 'buscó con la app en segundo plano');
    await N.volver(); N.sinSenal(); await N.conSenal();
    assert.equal(N.st.updates, 4, 'no buscó al volver la señal');
  });

  test('una página vieja en pantalla segura recarga AL VOLVER a la app, antes de tocar nada, y recuerda la pestaña', async () => {
    const N = navegador();
    await N.arrancar({ momentoSeguro: seguro, lugar: () => ({ tab: 'historial', secreto: 'no' }) });
    await N.ocultar();
    N.st.claves = ['tugarantia-v139'];           // se publicó mientras estaba en WhatsApp
    N.pasa(60 * 1000);
    await N.volver();
    assert.equal(N.st.recargas, 1);
    assert.equal(N.st.sesion[A.LLAVE_RECARGA], 'v139');
    const v = JSON.parse(N.st.sesion[A.LLAVE_VUELTA]);
    assert.equal(v.version, 'v139');
    assert.deepEqual(v.lugar, { tab: 'historial', secreto: 'no' });
  });

  test('mirando la pantalla NO recarga debajo del dedo: avisa con «Actualizar ahora», y recarga al salir de la app', async () => {
    const N = navegador();
    await N.arrancar({ momentoSeguro: seguro });
    N.pasa(10000); N.tocar();
    await N.publicar('v139');
    assert.equal(N.st.recargas, 0, 'recargó mientras la persona leía');
    assert.deepEqual({ texto: N.franja().texto, boton: N.franja().boton },
      { texto: 'Hay una versión nueva: se pone sola cuando salgas de la app y vuelvas.', boton: 'Actualizar ahora' });
    await N.ocultar();
    assert.equal(N.st.recargas, 1, 'no se puso sola al salir de la app');
  });

  test('pantalla NO segura: avisa, no recarga ni al salir; recarga cuando la página vuelve al inicio (yaEsSeguro)', async () => {
    const N = navegador();
    let es = false;
    const c = await N.arrancar({ momentoSeguro: () => es });
    await N.publicar('v139');
    assert.equal(N.franja().texto, 'Hay una versión nueva: se pone sola cuando termines y vuelvas al inicio.');
    assert.equal(N.franja().boton, null, 'ofreció recargar en medio de algo a medias');
    await N.ocultar(); await N.volver();
    assert.equal(N.st.recargas, 0, 'recargó con algo a medias');
    N.pasa(10000); N.tocar();
    es = true;
    await c.yaEsSeguro();
    assert.equal(N.st.recargas, 1, 'no se puso sola al volver al inicio, que es lo que la franja prometía');
  });

  test('UNA recarga sola por versión y por pestaña: si la CDN sigue sirviendo la vieja, no hay bucle', async () => {
    const sesion = {};
    const N1 = navegador({ claves: ['tugarantia-v139'], sesion });
    await N1.arrancar({ momentoSeguro: seguro });
    assert.equal(N1.st.recargas, 1, 'la página vieja al abrir, con la caché nueva, no se puso al día');
    /* La recarga trajo OTRA VEZ la página v138 (la CDN), en la misma pestaña. */
    const N2 = navegador({ claves: ['tugarantia-v139'], sesion });
    const c2 = await N2.arrancar({ momentoSeguro: seguro });
    assert.ok(c2.vuelta, 'la página no supo que la recarga fue nuestra');
    await N2.ocultar(); await N2.volver(); await c2.yaEsSeguro();
    assert.equal(N2.st.recargas, 0, 'bucle de recargas');
    await N2.volver();
    assert.deepEqual({ texto: N2.franja().texto, boton: N2.franja().boton }, { texto: 'Hay una versión nueva.', boton: 'Actualizar ahora' });
    N2.franja().tocar();
    assert.equal(N2.st.recargas, 1, 'el botón no recargó: a mano siempre se puede');
  });

  test('sin sessionStorage nunca recarga sola (no tendría tope): solo el botón', async () => {
    const N = navegador({ sinMemoria: true });
    await N.arrancar({ momentoSeguro: seguro });
    await N.publicar('v139'); await N.ocultar(); await N.volver();
    assert.equal(N.st.recargas, 0);
    assert.equal(N.franja().boton, 'Actualizar ahora');
    assert.ok(!/se pone sola/.test(N.franja().texto));
  });

  test('sin señal no recarga ni dice nada; al volver la señal, sí', async () => {
    const N = navegador();
    await N.arrancar({ momentoSeguro: seguro });
    N.sinSenal();
    await N.publicar('v139'); await N.ocultar();
    assert.equal(N.st.recargas, 0, 'recargó sin señal: caería en lo guardado, quizá a medias');
    assert.equal(N.franja(), null, 'prometió algo que depende de una señal que no hay');
    await N.volver();
    await N.conSenal();
    assert.equal(N.st.recargas, 1);
  });

  test('lo tecleado A LA VISTA y una cámara encendida le ganan a la lista blanca de la página', async () => {
    const visible = { tagName: 'INPUT', getAttribute: () => 'tel', value: '300 111', getClientRects: () => [1] };
    const N = navegador({ campos: [visible] });
    await N.arrancar({ momentoSeguro: seguro });
    await N.publicar('v139'); await N.ocultar();
    assert.equal(N.st.recargas, 0, 'recargó encima de un celular a medio escribir');
    /* Lo escrito en una pantalla escondida (display:none) no cuenta. */
    visible.getClientRects = () => [];
    await N.volver();
    assert.equal(N.st.recargas, 1);

    const C = navegador({ videos: [{ srcObject: { active: true } }] });
    await C.arrancar({ momentoSeguro: seguro });
    await C.publicar('v139'); await C.ocultar();
    assert.equal(C.st.recargas, 0, 'recargó con la cámara encendida');
  });

  test('el CRM y el espejo: nunca solos, ni ocultos; «Recargar» recarga', async () => {
    const N = navegador();
    await N.arrancar({ soloAvisar: true, momentoSeguro: seguro });
    await N.publicar('v139'); await N.ocultar(); await N.volver();
    assert.equal(N.st.recargas, 0, 'el CRM se recargó solo: allá vive la cola de cobros sin señal');
    assert.deepEqual({ texto: N.franja().texto, boton: N.franja().boton }, { texto: A.TEXTOS.panel, boton: 'Recargar' });
    N.franja().tocar();
    assert.equal(N.st.recargas, 1);
    /* Y se puede cerrar: Joan puede estar una hora en algo, y la franja no
       le tapa la cabecera todo ese rato (ni vuelve a la media hora). */
    const M = navegador();
    await M.arrancar({ soloAvisar: true });
    await M.publicar('v139');
    M.franja().cerrar();
    await M.cadaRato();
    assert.equal(M.franja(), null);
  });

  test('la franja se cierra con ✕ y se esconde con style.display (no con hidden, que pierde contra display:flex)', async () => {
    const N = navegador();
    await N.arrancar({ momentoSeguro: noSeguro });
    await N.publicar('v139');
    const f = N.st.elementos.find(e => e.id === A.ID_FRANJA);
    assert.equal(f.attrs.role, 'status');
    N.franja().cerrar();
    assert.equal(f.style.display, 'none');
    await N.ocultar(); await N.volver();
    assert.equal(N.franja(), null, 'el mismo aviso volvió a salir después de cerrarlo');
  });

  test('la vuelta: se lee una vez, se borra, solo el nombre de la pestaña, y una vieja no cuenta', async () => {
    const N = navegador({ sesion: {} });
    N.st.sesion[A.LLAVE_VUELTA] = JSON.stringify({ version: 'v139', lugar: { tab: 'historial', cedula: '1' }, en: N.st.t - 5000 });
    const c = await N.arrancar({ momentoSeguro: seguro });
    assert.deepEqual(c.vuelta, { version: 'v139', lugar: { tab: 'historial' } });
    assert.equal(N.st.sesion[A.LLAVE_VUELTA], undefined, 'la marca se quedó: la próxima apertura también se saltaría la bienvenida');

    const V = navegador({ sesion: {} });
    V.st.sesion[A.LLAVE_VUELTA] = JSON.stringify({ version: 'v139', lugar: { tab: 'historial' }, en: V.st.t - 3 * 60 * 1000 });
    const c2 = await V.arrancar({ momentoSeguro: seguro });
    assert.equal(c2.vuelta, null, 'una marca de hace minutos le saltó la bienvenida a una apertura nueva');
  });

  test('sin service worker (o fuera de https) es un controlador que no hace nada y no lanza', async () => {
    const N = navegador({ sinServiceWorker: true });
    const c = await N.arrancar({ momentoSeguro: seguro });
    assert.equal(N.st.updates, 0);
    assert.equal(c.estado().accion, 'nada');
    await c.yaEsSeguro();
    const F = navegador({ protocolo: 'file:' });
    await F.arrancar({ momentoSeguro: seguro });
    assert.equal(F.st.updates, 0);
    assert.deepEqual(F.st.oyentes.doc, {}, 'puso oyentes en file://');
  });
});

/* ==========================================================================
 * 3. sw.js EN UN CONTEXTO DE SERVICE WORKER
 * ======================================================================== */
function correrSW(o) {
  o = o || {};
  const oyentes = {}, pedidos = [], precargados = [];
  class Req {
    constructor(entrada, init) {
      if (entrada instanceof Req) {
        if (entrada.mode === 'navigate' && init && Object.keys(init).length && o.viejo) {
          throw new TypeError("Failed to construct 'Request': Cannot construct a Request with a Request whose mode is 'navigate' and a non-empty RequestInit.");
        }
        this.url = entrada.url; this.method = entrada.method;
        this.mode = (entrada.mode === 'navigate' && init) ? 'same-origin' : entrada.mode;
        this.cache = (init && init.cache) || entrada.cache;
      } else {
        this.url = String(entrada); this.method = 'GET'; this.mode = 'cors'; this.cache = (init && init.cache) || 'default';
      }
    }
  }
  const caja = { put: () => Promise.resolve(), add: r => { precargados.push(r); return Promise.resolve(); } };
  const ctx = {
    URL, Promise, console, Request: Req,
    caches: { open: () => Promise.resolve(caja), match: () => Promise.resolve(undefined),
              keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
    fetch: r => { pedidos.push(r); return Promise.resolve({ clone() { return this; } }); }
  };
  ctx.self = { location: new URL('https://tugarantia.net/sw.js'), addEventListener: (t, f) => { oyentes[t] = f; },
               skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } };
  vm.createContext(ctx);
  vm.runInContext(leer('sw.js'), ctx, { filename: 'sw.js' });
  const pedir = (url, mode) => {
    const r = new Req(url); r.mode = mode || 'cors';
    let p = null;
    oyentes.fetch({ request: r, respondWith(x) { p = x; } });
    return Promise.resolve(p).then(() => r);
  };
  return { oyentes, pedidos, precargados, pedir, Req };
}

describe('3. sw.js: red primero DE VERDAD, y la precarga que no baja lo que no cambió', () => {

  test('una navegación y un .js van al servidor con cache «no-cache» (la ETag decide, no el max-age de 10 min)', async () => {
    const S = correrSW();
    await S.pedir('https://tugarantia.net/play/', 'navigate');
    await S.pedir('https://tugarantia.net/app/escaner-cedula.js');
    await S.pedir('https://tugarantia.net/platachat/sesion.js');
    assert.equal(S.pedidos.length, 3);
    S.pedidos.forEach(p => assert.equal(p.cache, 'no-cache',
      p.url + ' salió por la caché HTTP: una página nueva con un .js viejo durante 10 min'));
  });

  test('un navegador que no copia una navegación con opciones pide como antes (y NO sirve lo guardado con señal)', async () => {
    const S = correrSW({ viejo: true });
    const r = await S.pedir('https://tugarantia.net/app/socio.html', 'navigate');
    assert.equal(S.pedidos.length, 1, 'no fue a la red');
    assert.equal(S.pedidos[0], r, 'la navegación no salió tal cual en el navegador viejo');
    await S.pedir('https://tugarantia.net/app/motor.js');
    assert.equal(S.pedidos[1].cache, 'no-cache');
  });

  test('la precarga va a la red con «no-cache», precarga app/actualizar.js, y el modelo de skipWaiting no cambió', async () => {
    const S = correrSW();
    let espera = null;
    S.oyentes.install({ waitUntil(p) { espera = p; } });
    await espera;
    assert.ok(S.precargados.length > 60, 'la precarga se quedó corta: ' + S.precargados.length);
    S.precargados.forEach(r => assert.equal(r.cache, 'no-cache', r.url + ' se precargó con ' + r.cache));
    assert.ok(S.precargados.some(r => r.url === '/app/actualizar.js'), 'app/actualizar.js no está en la precarga');
    const SW = leer('sw.js');
    assert.match(SW, /self\.skipWaiting\(\)/);
    assert.match(SW, /self\.clients\.claim\(\)/);
    assert.match(SW, /const CACHE = 'tugarantia-v\d+';/);
  });
});

/* ==========================================================================
 * 4. LOS CENTINELAS
 * ======================================================================== */
const PAGINAS = ['play/index.html', 'app/socio.html', 'platachat/index.html', 'panel/crm.html', 'panel/espejo.html'];
const CLIENTE = ['play/index.html', 'app/socio.html', 'platachat/index.html'];

describe('4. VERSION_SITIO es el CACHE de sw.js, en cada página que se actualiza sola', () => {

  test('cada página declara VERSION_SITIO UNA vez y es el número de CACHE (si sube uno, suben todos)', () => {
    const cache = (/const CACHE = 'tugarantia-(v\d+)';/.exec(leer('sw.js')) || [])[1];
    assert.ok(cache, 'sw.js perdió su CACHE');
    PAGINAS.forEach(f => {
      const t = leer(f);
      const v = [...t.matchAll(/var VERSION_SITIO = '([^']*)';/g)].map(m => m[1]);
      assert.equal(v.length, 1, f + ' declara VERSION_SITIO ' + v.length + ' veces');
      assert.equal(v[0], cache, f + ' dice ' + v[0] + ' y sw.js ' + cache + ': súbelo. Sin esto una página ' +
        'vieja no sabe que es vieja, o la primera apertura después de publicar recarga de gana');
    });
  });

  test('toda página que registra sw.js carga app/actualizar.js y lo arranca con su VERSION_SITIO', () => {
    const html = [];
    const recorrer = d => fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true }).forEach(e => {
      const rel = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) { if (['app', 'play', 'platachat', 'panel', 'entrar', 'descargas', 'legal'].includes(rel.split('/')[0])) recorrer(rel); return; }
      if (/\.html$/.test(e.name)) html.push(rel);
    });
    recorrer('');
    const registran = html.filter(f => /serviceWorker\.register\(/.test(leer(f)));
    assert.deepEqual(registran.slice().sort(), PAGINAS.slice().sort(), 'cambió quién registra el service worker: ¿se actualiza sola?');
    registran.forEach(f => {
      const t = leer(f);
      assert.match(t, /<script src="(\.\.\/app\/)?actualizar\.js"><\/script>/, f + ' no carga app/actualizar.js');
      assert.match(t, /\.iniciar\(\{ version: VERSION_SITIO\b/, f + ' no arranca app/actualizar.js con su VERSION_SITIO');
    });
  });

  test('el CRM y el espejo solo AVISAN; las tres del cliente traen su lista blanca y nunca soloAvisar', () => {
    ['panel/crm.html', 'panel/espejo.html'].forEach(f =>
      assert.match(leer(f), /Actualizar\.iniciar\(\{ version: VERSION_SITIO, soloAvisar: true \}\)/, f + ' podría recargarse solo'));
    [['play/index.html', 'momentoSeguroPlay'], ['app/socio.html', 'momentoSeguroSocio'], ['platachat/index.html', 'momentoSeguroPC']]
      .forEach(([f, fn]) => {
        const t = leer(f);
        assert.match(t, new RegExp('iniciar\\(\\{ version: VERSION_SITIO, momentoSeguro: ' + fn + ','), f);
        assert.ok(!/soloAvisar/.test(t), f + ' quedó en solo avisar');
      });
  });

  /* Cada función que pinta una pantalla entera dice cuál es: si una nueva se
     olvida, la variable seguiría diciendo la anterior —quizá «inicio»— y la
     lista blanca recargaría encima de una pantalla que no conoce. */
  function funcionesQuePintan(t, patron) {
    const pos = [...t.matchAll(/\nfunction ([A-Za-z0-9_$]+)\(/g)].map(m => [m.index, m[1]]);
    return pos.map(([i, n], k) => [n, t.slice(i, k + 1 < pos.length ? pos[k + 1][0] : t.length)])
      .filter(([, cuerpo]) => patron.test(cuerpo));
  }
  test('play/: cada función que pinta #cuerpo pone VISTA', () => {
    const f = funcionesQuePintan(leer('play/index.html'), /\$\('cuerpo'\)\.innerHTML\s*=/);
    assert.ok(f.length >= 10, 'no encontré las pantallas de play/');
    f.forEach(([n, c]) => assert.match(c, /\bVISTA = '/, n + ' pinta la pantalla sin decir cuál es (VISTA)'));
  });
  test('app/socio.html: cada función que pinta el cuerpo o la entrada pone PANTALLA', () => {
    const f = funcionesQuePintan(leer('app/socio.html'), /\$\('(cuerpo|entrarCuerpo)'\)\.innerHTML\s*=/);
    assert.ok(f.length >= 12, 'no encontré las pantallas de socio.html');
    f.forEach(([n, c]) => assert.match(c, /\bPANTALLA = /, n + ' pinta la pantalla sin decir cuál es (PANTALLA)'));
  });
  test('platachat/: cada función que pinta la entrada o el cuerpo pone PANTALLA', () => {
    const f = funcionesQuePintan(leer('platachat/index.html'), /\$\('(cuerpo|entrarCuerpo)'\)/);
    assert.ok(f.length >= 4, 'no encontré las pantallas de PlataChat');
    f.filter(([n]) => n !== 'mostrar').forEach(([n, c]) => assert.match(c, /\bPANTALLA = /, n + ' pinta sin decir cuál es (PANTALLA)'));
  });

  test('el sello dice la fecha Y el número de la caché, en las tres del cliente', () => {
    const P = abrirPlay();
    assert.match(P.ev('pie()'), /Versión 2026-\d\d-\d\d · v\d+ · reglas del/);
    assert.equal(P.ev('VERSION_SITIO'), (/const CACHE = 'tugarantia-(v\d+)';/.exec(leer('sw.js')) || [])[1]);
    ['app/socio.html', 'platachat/index.html'].forEach(f => {
      const t = leer(f);
      assert.match(t, /v\.textContent = 'Versión ' \+ VERSION_APP \+ ' · ' \+ VERSION_SITIO;/, f + ': la bienvenida');
      const i = t.indexOf('\nfunction selloDeVersion(');
      assert.match(t.slice(i, t.indexOf('\nfunction ', i + 1)), /esc\(VERSION_APP\) \+ ' · ' \+ esc\(VERSION_SITIO\)/, f + ': el pie');
    });
  });
});

/* ==========================================================================
 * 5. LAS PÁGINAS DE VERDAD: su lista blanca
 * ======================================================================== */
const SESION_PLAY = JSON.stringify({ access_token: 'tok-prueba', refresh_token: 'ref', user: { email: '573001112233@tugarantia.net', created_at: '2026-10-20T10:00:00Z' } });
const vuelta = (tab, en) => JSON.stringify({ version: 'v139', lugar: tab ? { tab } : null, en: en == null ? Date.now() : en });

describe('5a. play/: lo que es momento seguro y lo que no', () => {

  test('la portada sin nada tecleado sí; con el celular o la contraseña a medias, no', () => {
    const P = abrirPlay();
    assert.equal(P.ev('VISTA'), 'entrar');
    assert.equal(P.ev('momentoSeguroPlay()'), true);
    P.ev("$('inTel').value = '300 111'");
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'recargaría encima de un celular a medio escribir');
    P.ev("$('inTel').value = ''; $('inClave').value = 'secreta'");
    assert.equal(P.ev('momentoSeguroPlay()'), false);
    P.ev("$('inClave').value = ''; EN_VUELO = { viaje: 1 }");
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'un «Entrar» en camino');
  });

  test('el registro, en CUALQUIER paso, nunca (la vuelta de la cámara)', () => {
    const P = abrirPlay({ hash: '#registro' });
    assert.equal(P.ev('VISTA'), 'registro');
    for (let paso = 0; paso < 9; paso++) {
      P.ev('try { pintarRegistro(' + paso + ') } catch (e) {}');
      assert.equal(P.ev('momentoSeguroPlay()'), false, 'el paso ' + paso + ' del registro recargaría');
    }
    assert.equal(P.ev('lugarPlay()'), null, 'algo del registro cruzaría la recarga');
  });

  test('la cuenta: Crédito e Historial sí; Chat y Perfil no; un pedido, una subida o la casilla marcada, no', () => {
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.ev('TAB'), 'credito');
    assert.equal(P.ev('momentoSeguroPlay()'), true);
    P.ev("irA('historial')");
    assert.equal(P.ev('momentoSeguroPlay()'), true);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(lugarPlay())')), { tab: 'historial' });
    P.ev("irA('chat')");
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'el chat');
    P.ev("irA('perfil')");
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'el perfil (la contraseña nueva)');
    P.ev("irA('credito'); PIDIENDO = true");
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'un pedido saliendo');
    P.ev('PIDIENDO = false; SUBIDA_EN_CURSO = { p: 1 }');
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'las fotos subiendo');
    P.ev("SUBIDA_EN_CURSO = null; $('csNota').value = 'surtir la tienda'");
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'la nota del pedido a medio escribir');
    P.ev("$('csNota').value = ''");
    /* La propuesta: leerla no es tenerla a medias; marcar la casilla sí. */
    P.ev("tarjetaContrapropuesta({ id: 7, estado: 'contrapropuesta', contrapropuesta: { capital: 300000, costo: 30000, total: 330000, fecha_pago: '2026-11-20', texto: 'Te proponemos' } })");
    assert.equal(P.ev('momentoSeguroPlay()'), true);
    P.ev('CONDICIONES_LEIDAS[CS.llaveDeCasilla(SOL_EN_PANTALLA)] = true');
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'se perdería la casilla «Leí y acepto» marcada');
    /* Aceptada, la tarjeta ya no tiene casilla: Crédito vuelve a ser seguro. */
    P.ev("tarjetaContrapropuesta({ id: 7, estado: 'aceptada', contrapropuesta: { capital: 300000, costo: 30000, total: 330000, fecha_pago: '2026-11-20' } })");
    assert.equal(P.ev('SOL_EN_PANTALLA'), null);
    assert.equal(P.ev('momentoSeguroPlay()'), true, 'después de aceptar, Crédito no volvía a recargar nunca');
    P.ev('pintarPedido()');
    assert.equal(P.ev('VISTA'), 'pedido');
    assert.equal(P.ev('momentoSeguroPlay()'), false);
  });

  test('después de una recarga suya vuelve a la pestaña donde estaba (solo Crédito o Historial)', () => {
    const sesion = { play_sesion: SESION_PLAY, tg_vuelta_por_version: vuelta('historial') };
    const P = abrirPlay({ sesion });
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.equal(P.ev('TAB'), 'historial', 'volvió a Crédito: perdió el lugar');
    assert.equal(sesion.tg_vuelta_por_version, undefined, 'la marca de la vuelta se quedó');
    const Q = abrirPlay({ sesion: { play_sesion: SESION_PLAY, tg_vuelta_por_version: vuelta('chat') } });
    assert.equal(Q.ev('TAB'), 'credito', 'una pestaña fuera de la lista no se restaura');
  });

  test('la página arranca app/actualizar.js con su versión, antes de decidir dónde cae la persona', () => {
    const P = abrirPlay();
    assert.equal(P.ev('ACT && ACT.opciones.version'), P.ev('VERSION_SITIO'));
    assert.equal(P.ev('ACT.opciones.soloAvisar'), false);
    const t = leer('play/index.html');
    assert.ok(t.indexOf('  arrancarActualizar();') < t.indexOf('var sesionGuardada = leerSesionEnCurso();'));
  });
});

describe('5b. app/socio.html: lo que es momento seguro y lo que no', () => {
  const CORREO = '573001112222@tugarantia.net';
  const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
    socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
  const nube = junta => (url, cuerpo) => {
    if (/grant_type=password$/.test(url)) {
      return cuerpo && cuerpo.password === 'mi-clave-buena'
        ? { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } }
        : { status: 400, cuerpo: { error: 'invalid_grant' } };
    }
    if (/rpc\/mi_cuenta$/.test(url)) {
      return junta ? { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-21T10:00:00Z' } }
                   : { status: 200, cuerpo: { ok: true, vinculada: false } };
    }
    if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-10-21T09:00:00Z' } } };
    if (/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
  async function entrar(A) {
    A.elem('inCel').value = '3001112222'; A.elem('inClave').value = 'mi-clave-buena';
    A.ev('entrar()');
    await asentar(16);
  }

  test('la entrada vacía sí; con algo tecleado, no; ?cfg nunca', async () => {
    const A = abrirSocio();
    await asentar();
    assert.equal(A.ev('PANTALLA'), 'entrar');
    assert.equal(A.ev('momentoSeguroSocio()'), true);
    A.elem('inClave').value = 'a medias';
    assert.equal(A.ev('momentoSeguroSocio()'), false);
    A.elem('inClave').value = '';
    A.loc.search = '?cfg';
    assert.equal(A.ev('momentoSeguroSocio()'), false, 'el modo ?cfg');
  });

  test('la cuenta junta: Inicio, Historial y Garantía sí; la calculadora, el chat, pedir, la autorización y la contraseña, no', async () => {
    const A = abrirSocio({ red: nube(true) });
    await asentar();
    await entrar(A);
    assert.ok(A.visible('pCuenta'), 'no entró');
    assert.equal(A.ev('PANTALLA'), 'inicio');
    assert.equal(A.ev('momentoSeguroSocio()'), true);
    ['historial', 'garantia'].forEach(t => { A.ev("irA('" + t + "')"); assert.equal(A.ev('momentoSeguroSocio()'), true, t); });
    ['calc', 'chat'].forEach(t => { A.ev("irA('" + t + "')"); assert.equal(A.ev('momentoSeguroSocio()'), false, t); });
    [['pantallaAutorizacion()', 'autorizacion'], ['pantallaCambiarClave()', 'clave'], ['verReglas()', 'reglas'],
     ['pedirCredito()', 'pedir']].forEach(([fn, p]) => {
      A.ev("irA('inicio')"); A.ev('try { ' + fn + ' } catch (e) {}');
      assert.equal(A.ev('PANTALLA'), p, fn);
      assert.equal(A.ev('momentoSeguroSocio()'), false, fn + ' no es momento seguro');
    });
    A.ev("irA('historial')");
    assert.deepEqual(JSON.parse(A.ev('JSON.stringify(lugarSocio())')), { tab: 'historial' });
  });

  test('el «Ver como» de Joan NUNCA (el pase no sirve para recargar)', async () => {
    const A = abrirSocio();
    await asentar();
    A.ev("abrir({ nombre: 'Adriana Prueba', datos: " + JSON.stringify(PAQUETE) + ", origen: 'panel' })");
    assert.equal(A.ev('PANTALLA'), 'inicio');
    assert.equal(A.ev('momentoSeguroSocio()'), false);
    assert.equal(A.ev('lugarSocio()'), null);
  });

  test('la cuenta sin juntar (el inicio de quien se registró): con el chat vacío sí; escribiendo o mandando, no', async () => {
    const A = abrirSocio({ red: nube(false) });
    await asentar();
    await entrar(A);
    assert.equal(A.ev('PANTALLA'), 'sin_juntar');
    assert.equal(A.ev('momentoSeguroSocio()'), true);
    A.elem('chTexto').value = 'hola, ¿ya me aprobaron?';
    assert.equal(A.ev('momentoSeguroSocio()'), false);
    A.elem('chTexto').value = '';
    A.ev('CH.enviando = true');
    assert.equal(A.ev('momentoSeguroSocio()'), false);
  });

  test('después de una recarga suya: sin la bienvenida de 2 s, y en la pestaña donde estaba', async () => {
    const A = abrirSocio({ red: nube(true), performanceNow: 0 });
    await asentar();
    assert.ok(A.temporizadores.some(t => t.ms === 2000), 'la bienvenida normal dura 2 s');
    await entrar(A);
    /* La recarga: el mismo teléfono (localStorage) y la misma pestaña. */
    const B = abrirSocio({ red: nube(true), performanceNow: 0, local: A.local.d,
                           sesion: Object.assign({}, A.sesion.d, { tg_vuelta_por_version: vuelta('historial') }) });
    await asentar(16);
    assert.ok(!B.temporizadores.some(t => t.ms === 2000), 'dos segundos de logo en medio de lo que estaba haciendo');
    assert.ok(B.temporizadores.some(t => t.ms === 0), 'la bienvenida no se quitó');
    assert.ok(B.visible('pCuenta'));
    assert.equal(B.ev('PANTALLA'), 'historial', 'volvió al inicio: perdió el lugar');
    assert.equal(B.sesion.d.tg_vuelta_por_version, undefined);
  });
});

describe('5c. platachat/: lo que es momento seguro y lo que no', () => {

  test('la entrada vacía sí; con la contraseña a medias o un «Entrar» en camino, no', async () => {
    const P = abrirPlataChat();
    await asentar();
    assert.equal(P.ev('PANTALLA'), 'entrar');
    assert.equal(P.ev('momentoSeguroPC()'), true);
    P.ev("$('inClave').value = 'a medias'");
    assert.equal(P.ev('momentoSeguroPC()'), false);
    P.ev("$('inClave').value = ''; ENTRAR_EN_CAMINO = { viaje: 1, celular: '3001112233' }");
    assert.equal(P.ev('momentoSeguroPC()'), false, 'un «Entrar» en camino');
    P.ev("ENTRAR_EN_CAMINO = null; pintarRecado()");
    assert.equal(P.ev('momentoSeguroPC()'), false, 'el recado');
  });

  test('Plata como se abrió y Yo sí; la calculadora movida, Chats, un pedido o una aceptación en camino, no', async () => {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    assert.equal(P.ev('PANTALLA'), 'plata');
    assert.equal(P.ev('momentoSeguroPC()'), true);
    P.ev("irA('yo')");
    assert.equal(P.ev('momentoSeguroPC()'), true);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(lugarPC())')), { tab: 'yo' });
    P.ev("irA('chats')");
    assert.equal(P.ev('momentoSeguroPC()'), false, 'Chats');
    P.ev("irA('plata'); PIDIENDO_PC = true");
    assert.equal(P.ev('momentoSeguroPC()'), false, 'un pedido saliendo');
    P.ev('PIDIENDO_PC = false; ACEPTANDO = true');
    assert.equal(P.ev('momentoSeguroPC()'), false, 'una aceptación en camino');
    P.ev('ACEPTANDO = false; setMonto(MONTO + 50000)');
    assert.equal(P.ev('momentoSeguroPC()'), false, 'se perdería la cifra que movió');
  });

  test('pedirPorChat marca el pedido en camino y lo suelta al contestar', async () => {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    P.st.colgar = /solicitar_platachat/;
    P.ev("pedirPorChat(100000, '2026-11-14', 24, 1)");
    await asentar();
    assert.equal(P.st.colgadas.length, 1, 'el pedido no salió');
    assert.equal(P.ev('!!PIDIENDO_PC'), true);
    assert.equal(P.ev('momentoSeguroPC()'), false);
    P.suelta(0, { ok: true, solicitud: { id: 1, estado: 'nueva' } });
    await asentar(16);
    assert.equal(P.ev('PIDIENDO_PC'), false);
  });

  test('la respuesta de un pedido viejo no suelta la marca del pedido que salió después', async () => {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    P.st.colgar = /solicitar_platachat/;
    P.ev("irA('plata'); pedirPorChat(100000, '2026-11-14', 24, 1)");
    await asentar();
    P.ev("irA('plata'); pedirPorChat(200000, '2026-11-14', 24, 1)");
    await asentar();
    assert.equal(P.st.colgadas.length, 2);
    P.suelta(0, { ok: false, motivo: 'muchas' });
    await asentar(16);
    assert.equal(P.ev('!!PIDIENDO_PC'), true, 'la respuesta del primero dio por terminado el segundo');
    P.suelta(1, { ok: true, solicitud: { id: 2, estado: 'nueva' } });
    await asentar(16);
    assert.equal(P.ev('PIDIENDO_PC'), false);
  });

  test('después de una recarga suya: sin la bienvenida de 2 s, y con la pestaña donde estaba', async () => {
    const N = abrirPlataChat();
    await asentar();
    assert.ok(N.st.relojes.some(r => r.ms === 2000), 'la bienvenida normal dura 2 s');
    const sesion = { tg_vuelta_por_version: vuelta('yo') };
    const P = abrirPlataChat({ sesion });
    await asentar();
    assert.ok(!P.st.relojes.some(r => r.ms === 2000), 'dos segundos de logo en medio de lo que estaba haciendo');
    assert.equal(P.ev('TAB'), 'yo');
    assert.equal(sesion.tg_vuelta_por_version, undefined);
  });
});
