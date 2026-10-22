'use strict';
/* ==========================================================================
 * LA FRANJA NO SE QUEDA VIEJA, Y «ACTUALIZAR AHORA» NO CORTA NADA
 * 22 de octubre de 2026 (verificación de 35f0687, los dos hallazgos vivos)
 *
 *   node --test pruebas/la-franja-no-se-queda-vieja.test.js
 *
 * SE ACTUALIZA SOLA (app/actualizar.js) pinta una franja cuando hay versión
 * nueva. La verificación de 35f0687 encontró, con el controlador de verdad:
 *   1. LA FRANJA NO SE VOLVÍA A MIRAR al pasar a una pantalla que no es de la
 *      lista: en el registro de play/, la solicitud, «Cambiar mi contraseña»
 *      o el perfil del socio, el recado de PlataChat, seguía diciendo «se
 *      pone sola cuando salgas de la app y vuelvas» con el botón. Al salir y
 *      volver no se ponía sola; y el botón recargaba a mitad del registro.
 *      Solo se volvía a mirar desde irA/pintarEntrar: lo que se pinta por
 *      otro camino dependía de que alguien se acordara.
 *   2. «ACTUALIZAR AHORA» RECARGABA SIN VOLVER A PREGUNTAR: con «Pedir» en
 *      Crédito, una aceptación, el pedido de PlataChat o el mensaje del chat
 *      en el aire, el botón (pintado cuando la pantalla era segura) seguía a
 *      la vista y recargaba encima.
 *
 * El arreglo es UNO, en app/actualizar.js: mientras hay versión esperando,
 * la franja se decide otra vez cuando la página cambia lo que muestra (un
 * MutationObserver), cuando la persona teclea o marca (input/change), y
 * cuando empieza o termina una escritura (la página llama volverAMirar()
 * desde su escrituraEnCamino). El botón vuelve a preguntar al tocarlo:
 * espera lo que va en camino, no recarga fuera de la lista y pregunta si hay
 * algo escrito o la cámara abierta.
 *
 * Aquí corren el controlador de verdad contra un navegador de mentira (1) y
 * las tres páginas en sus bancos con el mismo controlador (2): solo el
 * navegador es de mentira, y su DOM AVISA como el de verdad — cada vez que
 * una pantalla se pinta (#cuerpo, #entrarCuerpo) hay un registro para el
 * observador, igual que lo entrega un navegador.
 *
 * Todas FALLAN con 35f0687.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../app/actualizar.js');
const { abrirPlay } = require('./banco-play.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirPlataChat } = require('./banco-platachat.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const PROMETE_AL_SALIR = /se pone sola cuando salgas/;

/* ==========================================================================
 * UN NAVEGADOR DE MENTIRA CON OJOS
 * Como el de pruebas/se-actualiza-sola.test.js (service worker, cachés,
 * pestaña, reloj, visibilidad), más lo que hoy hace falta: un
 * MutationObserver que entrega registros como el de verdad (en una
 * microtarea, juntos), los eventos de la persona (input, change, click) y
 * los relojes de un disparo (setTimeout) que la prueba corre a mano.
 * ======================================================================== */
function navegadorConOjos(o) {
  o = o || {};
  const st = {
    t: Date.parse('2026-10-22T10:00:00-05:00'), recargas: 0, hidden: false, onLine: true,
    claves: ['tugarantia-v139'], sesion: {}, oyentes: { doc: {}, win: {}, sw: {} },
    elementos: [], campos: o.campos || (() => []), videos: o.videos || (() => []),
    observadores: [], registros: [], relojes: [], entregando: false
  };
  const oir = d => (t, f) => { (st.oyentes[d][t] = st.oyentes[d][t] || []).push(f); };
  const soltar = d => (t, f) => { const l = st.oyentes[d][t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  const disparar = (d, t, extra) => (st.oyentes[d][t] || []).slice().forEach(f => f(Object.assign({ type: t }, extra || {})));
  const reg = { installing: null, waiting: null, update: () => Promise.resolve() };
  const el = tag => {
    const e = { tagName: String(tag).toUpperCase(), style: {}, hijos: [], textContent: '', id: '', className: '', attrs: {},
      oyentes: {}, parentNode: null,
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild(h) { this.hijos.push(h); h.parentNode = this; return h; }, addEventListener(t, f) { this.oyentes[t] = f; } };
    st.elementos.push(e);
    return e;
  };
  const document = {
    get hidden() { return st.hidden; }, get visibilityState() { return st.hidden ? 'hidden' : 'visible'; },
    addEventListener: oir('doc'), removeEventListener: soltar('doc'),
    createElement: el, getElementById: id => st.elementos.find(e => e.id === id) || null,
    querySelectorAll: sel => (sel === 'video' ? st.videos() : st.campos()),
    body: null, head: null
  };
  document.body = el('body'); document.head = el('head');
  /* El observador de mentira: guarda a quién mira y entrega lo que cambió en
     UNA microtarea, todo junto, como el navegador. */
  class Observador {
    constructor(cb) { this.cb = cb; st.observadores.push(this); }
    observe(blanco, op) { this.blanco = blanco; this.op = op; }
    disconnect() { st.observadores = st.observadores.filter(x => x !== this); }
    takeRecords() { return []; }
  }
  const mutar = (target, extra) => {
    st.registros.push(Object.assign({ type: 'childList', target, addedNodes: [], removedNodes: [] }, extra || {}));
    if (st.entregando) return;
    st.entregando = true;
    queueMicrotask(() => {
      st.entregando = false;
      const r = st.registros.splice(0);
      st.observadores.slice().forEach(ob => ob.cb(r, ob));
    });
  };
  const entorno = {
    window: { addEventListener: oir('win'), removeEventListener: soltar('win') },
    document,
    navigator: { get onLine() { return st.onLine; },
                 serviceWorker: { ready: Promise.resolve(reg), addEventListener: oir('sw'), removeEventListener: soltar('sw') } },
    caches: { keys: () => Promise.resolve(st.claves.slice()) },
    sessionStorage: { getItem: k => (k in st.sesion ? st.sesion[k] : null), setItem: (k, v) => { st.sesion[k] = String(v); },
                      removeItem: k => { delete st.sesion[k]; } },
    location: { protocol: 'https:', reload() { st.recargas++; } },
    ahora: () => st.t,
    setInterval: () => 1, clearInterval() {},
    setTimeout: (f, ms) => { st.relojes.push({ f, ms }); return st.relojes.length; },
    clearTimeout: id => { const r = st.relojes[id - 1]; if (r) r.muerto = true; },
    MutationObserver: Observador
  };
  const N = {
    st, entorno, mutar,
    /* Lo que hay en la franja AHORA (el DOM, no la última decisión). */
    franja() {
      const caja = st.elementos.find(e => e.id === A.ID_FRANJA);
      if (!caja || caja.style.display === 'none') return null;
      const [texto, boton, cerrar, otro] = caja.hijos;
      const ver = b => (b && b.style.display !== 'none' && b.textContent) ? b.textContent : null;
      return { texto: texto.textContent, boton: ver(boton), otro: ver(otro),
               tocar: () => boton.oyentes.click(), tocarOtro: () => otro.oyentes.click(), cerrar: () => cerrar.oyentes.click() };
    },
    /* El botón tal como quedó en la pantalla, para tocarlo después aunque la
       franja ya lo haya escondido: es el dedo que llega en el mismo instante
       en que algo sale (o un navegador que pinta tarde). */
    botonDeLaFranja() {
      const caja = st.elementos.find(e => e.id === A.ID_FRANJA);
      return () => caja.hijos[1].oyentes.click();
    },
    publicar(v) { st.claves = ['tugarantia-' + v]; disparar('sw', 'controllerchange'); return asentar(16); },
    ocultar() { st.hidden = true; disparar('doc', 'visibilitychange'); return asentar(16); },
    volver() { st.hidden = false; disparar('doc', 'visibilitychange'); return asentar(16); },
    /* La persona ya está mirando: pasó el rato de «justo al volver» y tocó. */
    mirando() { st.t += 10000; disparar('doc', 'pointerdown'); },
    teclear() { disparar('doc', 'input'); return asentar(4); },
    marcar() { disparar('doc', 'change'); return asentar(4); },
    sinSenal() { st.onLine = false; },
    /* Corre los relojes de un disparo que estén vivos (un segundo después). */
    pasaUnSegundo() {
      st.t += 1000;
      st.relojes.filter(r => !r.muerto && !r.hecho && r.ms <= 1000).forEach(r => { r.hecho = true; r.f(); });
      return asentar(16);
    },
    arrancar(op) {
      const c = A.iniciar(Object.assign({ version: 'v139', entorno }, op || {}));
      return asentar(12).then(() => c);
    },
    /* La página de verdad, con este navegador: se arranca SU controlador (con
       sus opciones: momentoSeguro, ocupado, nuncaEsSeguro, lugar) y su DOM
       avisa al observador cada vez que pinta una pantalla. */
    async enLaPagina(ev, ventana) {
      ventana.__entornoACT = entorno;
      ventana.__mutar = mutar;
      ev('(function () { var i = Actualizar.iniciar; Actualizar.iniciar = function (op) { op.entorno = window.__entornoACT; return i(op); }; })();' +
         'if (ACT) ACT.detener(); arrancarActualizar();');
      ev("['cuerpo', 'entrarCuerpo'].forEach(function (id) { var el = $(id); if (!el) return; var v = el.innerHTML;" +
         " Object.defineProperty(el, 'innerHTML', { configurable: true, get: function () { return v; }," +
         " set: function (x) { v = x; window.__mutar(el); } }); });");
      await asentar(16);
      return N;
    },
    estado: ev => JSON.parse(ev('JSON.stringify(ACT.estado())'))
  };
  return N;
}

/* Los <input>/<textarea> de la pantalla visible, como los vería el navegador:
   los que pintó `contenedor`, con el valor vivo de los que tienen id. */
function camposVisibles(ev, contenedor) {
  return () => {
    const html = String(ev("($('" + contenedor + "') || {}).innerHTML || ''"));
    const out = [];
    for (const m of html.matchAll(/<(input|textarea)\b([^>]*)>/g)) {
      const a = m[2];
      const id = (/\bid="([^"]*)"/.exec(a) || [])[1];
      const tipo = (/\btype="([^"]*)"/.exec(a) || [, ''])[1];
      const ro = /\sreadonly\b/.test(' ' + a);
      out.push({ tagName: m[1].toUpperCase(), type: tipo || 'text', readOnly: ro, disabled: false,
        value: id ? String(ev("($('" + id + "') || {}).value || ''")) : '',
        getAttribute: k => (k === 'type' ? tipo : null), hasAttribute: k => (k === 'readonly' ? ro : false),
        getClientRects: () => [{}] });
    }
    return out;
  };
}

/* ==========================================================================
 * 1. EL CONTROLADOR, CONTRA EL NAVEGADOR DE MENTIRA
 * ======================================================================== */
describe('1. la franja vuelve a mirar sola, desde app/actualizar.js', () => {

  test('la página cambia de pantalla (el DOM cambia): la franja se decide otra vez, y nunca recarga debajo del dedo', async () => {
    const N = navegadorConOjos();
    let es = true;
    await N.arrancar({ momentoSeguro: () => es });
    N.mirando();
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    /* Pasa a una pantalla de fuera de la lista (el registro): solo cambia el DOM. */
    es = false;
    N.mutar({ id: 'cuerpo' });
    await asentar(4);
    assert.equal(PROMETE_AL_SALIR.test((N.franja() || {}).texto || ''), false,
      'la franja siguió prometiendo «se pone sola cuando salgas de la app» fuera de la lista: ' + (N.franja() || {}).texto);
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null],
      'el botón siguió a la vista en una pantalla que no es de la lista');
    /* Vuelve a una pantalla de la lista por un camino que no avisa: vuelve el botón, sin recargar. */
    es = true;
    N.mutar({ id: 'cuerpo' });
    await asentar(4);
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    assert.equal(N.st.recargas, 0, 'recargó mientras la persona miraba');
  });

  test('pintar la franja no es «la pantalla cambió»: no se mira a sí misma', async () => {
    const N = navegadorConOjos();
    let preguntas = 0;
    await N.arrancar({ momentoSeguro: () => { preguntas++; return false; } });
    N.mirando();
    await N.publicar('v140');
    const caja = N.st.elementos.find(e => e.id === A.ID_FRANJA);
    const antes = preguntas;
    N.mutar(caja.hijos[0]);                                             // su texto
    N.mutar(N.st.elementos.find(e => e === N.entorno.document.body), { addedNodes: [caja] });   // ella misma entrando al <body>
    await asentar(4);
    assert.equal(preguntas, antes, 'la franja volvió a decidir por cambios suyos: se miraría a sí misma sin fin');
    N.mutar({ id: 'cuerpo' });
    await asentar(4);
    assert.equal(preguntas, antes + 1, 'un cambio de la página no se miró, o se miró más de una vez');
  });

  test('sin versión esperando no se mira nada; el CRM y el espejo nunca miran la pantalla', async () => {
    const N = navegadorConOjos();
    await N.arrancar({ momentoSeguro: () => true });
    assert.equal(N.st.observadores.length, 0, 'conectó el observador sin versión nueva: la página paga por cada cambio del DOM');
    N.mirando();
    await N.publicar('v140');
    assert.equal(N.st.observadores.length, 1, 'con versión nueva no mira la pantalla');
    const P = navegadorConOjos();
    await P.arrancar({ soloAvisar: true });
    await P.publicar('v140');
    assert.equal(P.st.observadores.length, 0, 'el CRM mira cada cambio de su DOM enorme para un texto que no depende de la pantalla');
  });

  test('lo tecleado y la casilla marcada (input, change) no tocan el DOM, y también cambian la franja', async () => {
    const campo = { tagName: 'INPUT', getAttribute: () => 'text', value: '', getClientRects: () => [1] };
    const N = navegadorConOjos({ campos: () => [campo] });
    let casilla = false;
    await N.arrancar({ momentoSeguro: () => !casilla });
    N.mirando();
    await N.publicar('v140');
    assert.equal(N.franja().boton, 'Actualizar ahora');
    campo.value = 'una nota para Joan';
    await N.teclear();
    assert.equal(N.franja().boton, null, 'escribió y el botón siguió ofreciendo recargar encima de lo escrito');
    campo.value = '';
    await N.teclear();
    assert.equal(N.franja().boton, 'Actualizar ahora');
    casilla = true;
    await N.marcar();
    assert.equal(N.franja().boton, null, 'marcó la casilla de la propuesta y el botón siguió ahí');
    assert.equal(N.st.recargas, 0);
  });

  test('empieza una escritura: volverAMirar() decide YA, sin esperar a las cachés', async () => {
    const N = navegadorConOjos();
    let enCamino = false;
    const c = await N.arrancar({ momentoSeguro: () => true, ocupado: () => enCamino });
    N.mirando();
    await N.publicar('v140');
    assert.equal(N.franja().boton, 'Actualizar ahora');
    enCamino = true;
    c.volverAMirar();   // sin await: el botón no puede seguir a la vista ni un instante
    assert.equal(N.franja().boton, null, 'con algo saliendo, el botón siguió a la vista');
    assert.equal(N.st.recargas, 0);
  });

  test('ocupado frena la recarga sola aunque la lista blanca de la página se olvide de lo que va en camino', async () => {
    const N = navegadorConOjos();
    let enCamino = true;
    await N.arrancar({ momentoSeguro: () => true, ocupado: () => enCamino });
    await N.publicar('v140');
    await N.ocultar();
    assert.equal(N.st.recargas, 0, 'recargó al salir de la app con algo en camino');
    enCamino = false;
    await N.volver();
    assert.equal(N.st.recargas, 1);
  });
});

describe('1b. «Actualizar ahora» vuelve a preguntar al tocarlo', () => {

  test('con algo en camino espera y lo dice; termina, y recarga', async () => {
    const N = navegadorConOjos();
    let enCamino = false;
    await N.arrancar({ momentoSeguro: () => true, ocupado: () => enCamino });
    N.mirando();
    await N.publicar('v140');
    const tocar = N.botonDeLaFranja();
    enCamino = true;          // sale el pedido en el mismo instante del toque
    tocar();
    assert.equal(N.st.recargas, 0, 'recargó con el pedido en el aire');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.esperando, null]);
    assert.equal(/se pone sola/.test(A.TEXTOS.esperando), false);
    await N.pasaUnSegundo();
    assert.equal(N.st.recargas, 0, 'recargó con el pedido todavía en el aire');
    enCamino = false;
    await N.pasaUnSegundo();
    assert.equal(N.st.recargas, 1, 'terminó lo que iba en camino y no se puso, aunque la persona lo pidió');
  });

  test('termina lo que iba en camino y la pantalla ya no es de la lista: no recarga, y dice lo de esa pantalla', async () => {
    const N = navegadorConOjos();
    let enCamino = false, es = true;
    const c = await N.arrancar({ momentoSeguro: () => es && !enCamino, ocupado: () => enCamino });
    N.mirando();
    await N.publicar('v140');
    const tocar = N.botonDeLaFranja();
    enCamino = true;
    tocar();
    /* Contesta, y la página pinta «Recibimos tu solicitud» (fuera de la lista). */
    enCamino = false; es = false;
    await c.revisar();
    assert.equal(N.st.recargas, 0, 'recargó en una pantalla que la página no tiene por segura');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null]);
    /* Y lo que dice es cierto: al volver al inicio, se pone sola. */
    es = true;
    await c.yaEsSeguro();
    assert.equal(N.st.recargas, 1);
  });

  test('algo escrito a la vista: lo dice y pregunta; «Ahora no» no recarga; «Actualizar igual» sí', async () => {
    const campo = { tagName: 'TEXTAREA', getAttribute: () => null, value: 'ya pagué, les mando la foto', getClientRects: () => [1] };
    const N = navegadorConOjos({ campos: () => [campo] });
    await N.arrancar({ momentoSeguro: () => false, nuncaEsSeguro: () => true });
    N.mirando();
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.nuncaSola, 'Actualizar ahora']);
    N.franja().tocar();
    assert.equal(N.st.recargas, 0, 'recargó y se llevó lo escrito sin decirlo');
    assert.deepEqual([N.franja().texto, N.franja().boton, N.franja().otro],
      [A.TEXTOS.confirmarTexto, 'Actualizar igual', 'Ahora no']);
    N.franja().tocarOtro();
    assert.equal(N.st.recargas, 0, '«Ahora no» recargó');
    assert.deepEqual([N.franja().texto, N.franja().boton, N.franja().otro], [A.TEXTOS.nuncaSola, 'Actualizar ahora', null]);
    N.franja().tocar();
    N.franja().tocar();       // «Actualizar igual»
    assert.equal(N.st.recargas, 1, '«Actualizar igual» no recargó');
  });

  test('la cámara abierta: pregunta (recargar la apaga a mitad de la foto)', async () => {
    const N = navegadorConOjos({ videos: () => [{ srcObject: { active: true } }] });
    await N.arrancar({ momentoSeguro: () => true, nuncaEsSeguro: () => true });
    N.mirando();
    await N.publicar('v140');
    N.franja().tocar();
    assert.equal(N.st.recargas, 0);
    assert.equal(N.franja().texto, A.TEXTOS.confirmarCamara);
  });

  test('la ✕ con el pedido en curso lo suelta, y lo de siempre no vuelve a salir solo', async () => {
    const N = navegadorConOjos();
    let enCamino = false;
    const c = await N.arrancar({ momentoSeguro: () => !enCamino, ocupado: () => enCamino, nuncaEsSeguro: () => true });
    N.mirando();
    await N.publicar('v140');
    enCamino = true;
    N.franja().tocar();
    assert.equal(N.franja().texto, A.TEXTOS.esperando);
    N.franja().cerrar();
    assert.equal(N.franja(), null);
    enCamino = false;
    await c.revisar();
    await N.pasaUnSegundo();
    assert.equal(N.st.recargas, 0, 'la persona cerró el aviso y la app se recargó igual');
    assert.equal(N.franja(), null, 'cerró el aviso y volvió a salir con el mismo texto');
  });

  test('sin señal no recarga ni deja el pedido en pie', async () => {
    const N = navegadorConOjos();
    let enCamino = false;
    const c = await N.arrancar({ momentoSeguro: () => true, ocupado: () => enCamino });
    N.mirando();
    await N.publicar('v140');
    enCamino = true;
    N.franja().tocar();
    N.sinSenal();
    enCamino = false;
    await c.revisar();
    await N.pasaUnSegundo();
    assert.equal(N.st.recargas, 0, 'recargó sin señal: caería en lo guardado');
    assert.equal(c.estado().pedido, '');
  });
});

/* ==========================================================================
 * 2. LAS TRES PÁGINAS DE VERDAD
 * ======================================================================== */
const SESION_PLAY = JSON.stringify({ access_token: 'tok-prueba', refresh_token: 'ref',
  user: { email: '573001112233@tugarantia.net', created_at: '2026-10-20T10:00:00Z' } });

describe('2. hallazgo 1: las pantallas que no avisaban', () => {

  test('play/: de la portada al registro («Abrir mi cuenta»), la franja deja de prometer y de ofrecer el botón', async () => {
    const P = abrirPlay({});
    assert.equal(P.ev('VISTA'), 'entrar');
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ventana);
    N.mirando();
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    P.ev('abrirRegistro()');
    await asentar(8);
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'el registro dejó de ser «no seguro»: la prueba no prueba el caso');
    assert.equal(PROMETE_AL_SALIR.test((N.franja() || {}).texto || ''), false,
      'en el registro siguió diciendo «se pone sola cuando salgas de la app y vuelvas»: ' + (N.franja() || {}).texto);
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null],
      'el botón siguió a la vista en el registro, donde recargar es empezar de nuevo');
    /* Y lo que dice es lo que pasa: sale y vuelve, y no se puso (está a medias). */
    await N.ocultar(); await N.volver();
    assert.equal(N.st.recargas, 0);
  });

  test('play/: de Crédito a la pantalla de la solicitud, igual', async () => {
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ventana);
    P.ev("irA('credito')");
    N.mirando();
    await N.publicar('v140');
    assert.equal(N.franja().boton, 'Actualizar ahora');
    P.ev("pintarSolicitud({ id: 7, estado: 'propuesta', pedido: { capital: 300000 }, capital: 300000, fecha_pago: '2026-11-15', costo: 9000, total: 309000 })");
    await asentar(8);
    assert.equal(P.ev('VISTA'), 'solicitud');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null]);
    /* «Ir a mi cuenta» vuelve al inicio, y ahí se pone sola: lo que decía era cierto. */
    P.ev('pintarCuenta()');
    await asentar(16);
    assert.equal(N.st.recargas, 1, 'volvió al inicio y no se puso sola, que es lo que la franja prometía');
  });

  test('app/socio.html: del Inicio a «Cambiar mi contraseña» y al perfil; de vuelta al Inicio se pone sola', async () => {
    const CORREO = '573001112222@tugarantia.net';
    const PAQ = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [], socio: { codigo: 'CL-0007' },
                  perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
    const red = (url, cuerpo) => {
      if (/grant_type=password$/.test(url)) return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
      if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Adriana Prueba', datos: PAQ, actualizado_en: '2026-10-21T10:00:00Z' } };
      if (/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
      return { status: 404, cuerpo: {} };
    };
    for (const abrir of ['pantallaCambiarClave()', 'abrirPerfil()']) {
      const S = abrirSocio({ red });
      await asentar();
      S.elem('inCel').value = '3001112222'; S.elem('inClave').value = 'mi-clave-buena';
      S.ev('entrar()');
      await asentar(16);
      S.elem('inCel').value = ''; S.elem('inClave').value = '';
      assert.equal(S.ev('PANTALLA'), 'inicio');
      const N = await navegadorConOjos().enLaPagina(S.ev, S.ctx);
      N.mirando();
      await N.publicar('v140');
      assert.equal(N.franja().boton, 'Actualizar ahora');
      S.ev(abrir);
      await asentar(8);
      assert.equal(S.ev('momentoSeguroSocio()'), false, abrir + ': la prueba no prueba el caso');
      assert.equal(PROMETE_AL_SALIR.test((N.franja() || {}).texto || ''), false, abrir + ': siguió prometiendo «se pone sola cuando salgas»');
      assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null], abrir + ': el botón siguió a la vista');
      await N.ocultar(); await N.volver();
      assert.equal(N.st.recargas, 0, abrir + ': recargó a medias');
      N.mirando();
      S.ev("irA('inicio')");
      await asentar(16);
      assert.equal(N.st.recargas, 1, abrir + ': volvió al Inicio y no se puso sola, que es lo que la franja prometía');
    }
  });

  test('platachat/: de la entrada al recado, la franja deja de prometer y de ofrecer el botón', async () => {
    const P = abrirPlataChat();
    await asentar();
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ctx);
    N.mirando();
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    P.ev('pintarRecado()');
    await asentar(8);
    assert.equal(P.ev('PANTALLA'), 'recado');
    assert.equal(PROMETE_AL_SALIR.test((N.franja() || {}).texto || ''), false, 'en el recado siguió prometiendo: ' + (N.franja() || {}).texto);
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null]);
    await N.ocultar(); await N.volver();
    assert.equal(N.st.recargas, 0);
  });
});

describe('2b. hallazgo 2: «Actualizar ahora» con algo en el aire', () => {

  test('play/: «Pedir» en Crédito: el botón se va al salir el pedido; tocado igual, espera y no lo corta', async () => {
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    /* La red retiene el pedido; lo demás contesta en el acto. */
    P.ev('window.__pend = []; fetch = function (u, o) { u = String(u);' +
         ' if (/solicitar_a_la_medida/.test(u)) return new Promise(function (res) { window.__pend.push(res); });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };');
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ventana);
    P.ev("irA('credito')");
    N.mirando();
    await N.publicar('v140');
    assert.equal(N.franja().boton, 'Actualizar ahora');
    const tocar = N.botonDeLaFranja();
    P.ev('enviarPedido()');
    assert.equal(P.ev('window.__pend.length'), 1, 'el pedido no salió');
    assert.equal(N.franja().boton, null, 'con «Pedir» en el aire, «Actualizar ahora» siguió a la vista');
    tocar();                  // el dedo que llegó en el mismo instante
    await asentar(8);
    assert.equal(N.st.recargas, 0, 'recargó con solicitar_a_la_medida en el aire: el pedido puede no llegar');
    assert.equal(N.franja().texto, A.TEXTOS.esperando);
    /* Contesta con la solicitud: la página pinta «Solicitud enviada», que no es de la lista. */
    P.ev("window.__pend[0]({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, solicitud:" +
         " { id: 7, estado: 'propuesta', pedido: { capital: 300000 }, capital: 300000, fecha_pago: '2026-11-15', costo: 9000, total: 309000 } }); } })");
    await asentar(16);
    await N.pasaUnSegundo();
    assert.equal(P.ev('VISTA'), 'solicitud');
    assert.equal(N.st.recargas, 0, 'recargó encima de la respuesta del pedido');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alTerminar, null]);
  });

  test('play/: «Aceptar» en camino: el botón se va, y tocado igual no recarga hasta que contesta', async () => {
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    P.ev('window.__pend = []; fetch = function (u, o) { u = String(u);' +
         ' if (/aceptar_condiciones/.test(u)) return new Promise(function (res) { window.__pend.push(res); });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };');
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ventana);
    P.ev("irA('credito')");
    N.mirando();
    await N.publicar('v140');
    const tocar = N.botonDeLaFranja();
    P.ev("rpcSesion('aceptar_condiciones', { p_id: 7, p_vio: {} })");
    assert.equal(N.franja().boton, null, 'con la aceptación en el aire, el botón siguió a la vista');
    tocar();
    await asentar(8);
    assert.equal(N.st.recargas, 0, 'recargó con aceptar_condiciones en el aire');
    P.ev("window.__pend[0]({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } })");
    await asentar(16);
    await N.pasaUnSegundo();
    assert.equal(N.st.recargas, 1, 'contestó, la pantalla sigue siendo Crédito, y no se puso aunque la persona lo pidió');
  });

  test('app/socio.html sin juntar: «Enviar» en el chat; tocado igual espera, y recarga cuando el mensaje llegó', async () => {
    const CORREO = '573001112222@tugarantia.net';
    const pendientes = [];
    const red = (url, cuerpo) => {
      if (/chat_escribir_sesion/.test(url)) return new Promise(r => pendientes.push(r));
      if (/grant_type=password$/.test(url)) return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
      if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: false } };
      if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-10-21T09:00:00Z' } } };
      if (/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
      return { status: 404, cuerpo: { message: 'no existe' } };
    };
    const S = abrirSocio({ red });
    await asentar();
    S.elem('inCel').value = '3001112222'; S.elem('inClave').value = 'mi-clave-buena';
    S.ev('entrar()');
    await asentar(16);
    S.elem('inCel').value = ''; S.elem('inClave').value = '';
    assert.equal(S.ev('PANTALLA'), 'sin_juntar');
    const N = navegadorConOjos({ campos: camposVisibles(S.ev, 'cuerpo') });
    await N.enLaPagina(S.ev, S.ctx);
    N.mirando();
    await N.publicar('v140');
    assert.equal(N.franja().boton, 'Actualizar ahora');
    const tocar = N.botonDeLaFranja();
    S.elem('chTexto').value = 'Ya consigné, ¿me confirman?';
    S.ev('chatEnviar()');
    await asentar(4);
    assert.equal(pendientes.length, 1, 'el mensaje no salió');
    assert.equal(N.franja().boton, null, 'con el mensaje en el aire, el botón siguió a la vista');
    tocar();
    await asentar(8);
    assert.equal(N.st.recargas, 0, 'recargó con el mensaje en el aire, y con lo escrito en la caja');
    assert.equal(N.franja().texto, A.TEXTOS.esperando);
    pendientes[0]({ status: 200, cuerpo: { ok: true, id: 1 } });
    await asentar(16);
    await N.pasaUnSegundo();
    assert.equal(S.ev("$('chTexto').value"), '', 'la caja no se vació al llegar el mensaje: la prueba no prueba el caso');
    assert.equal(N.st.recargas, 1, 'el mensaje llegó, la caja quedó vacía, y no se puso aunque la persona lo pidió');
  });

  test('platachat/ con la calculadora movida (el botón siempre): «Pedir» en el aire; tocado, espera; contesta, y recarga', async () => {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    assert.equal(P.ev('PANTALLA'), 'plata');
    P.ev('setMonto(MONTO + 50000)');
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ctx);
    N.mirando();
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.nuncaSola, 'Actualizar ahora']);
    /* «Pedir» por el camino de la pantalla: el onclick que pintó la calculadora. */
    const html = String(P.ev("$('calcSalida').innerHTML"));
    const pedir = (/onclick="(pedirPorChat\([^"]*\))"/.exec(html) || [])[1];
    assert.ok(pedir, 'Plata no pintó el botón de pedir');
    P.st.colgar = /solicitar_platachat|reproponer_platachat/;
    P.ev(pedir.replace(/&#39;|&apos;/g, "'"));
    await asentar(4);
    assert.equal(P.st.colgadas.length, 1, 'el pedido no salió');
    N.franja().tocar();
    await asentar(8);
    assert.equal(N.st.recargas, 0, 'recargó con solicitar_platachat en el aire');
    assert.equal(N.franja().texto, A.TEXTOS.esperando);
    P.st.colgar = null;
    P.suelta(0, { ok: true, solicitud: { id: 9, estado: 'pendiente', capital: 350000 } });
    await asentar(16);
    await N.pasaUnSegundo();
    assert.equal(N.st.recargas, 1, 'el pedido contestó y no se puso, aunque la persona lo pidió');
  });

  test('platachat/ con la calculadora movida y algo escrito en el chat: pregunta antes de borrarlo', async () => {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    P.ev('setMonto(MONTO + 50000)');
    const N = navegadorConOjos({ campos: camposVisibles(P.ev, 'cuerpo') });
    await N.enLaPagina(P.ev, P.ctx);
    N.mirando();
    await N.publicar('v140');
    P.ev("irA('chats')");
    await asentar(8);
    P.ev("$('chTexto').value = 'ya pagué, les mando la foto'");
    await N.teclear();
    assert.equal(N.franja().boton, 'Actualizar ahora', 'en el modo «nunca» el botón va siempre');
    N.franja().tocar();
    assert.equal(N.st.recargas, 0, 'recargó y borró lo escrito sin decirlo');
    assert.deepEqual([N.franja().texto, N.franja().boton, N.franja().otro], [A.TEXTOS.confirmarTexto, 'Actualizar igual', 'Ahora no']);
    N.franja().tocarOtro();
    assert.equal(N.st.recargas, 0);
    N.franja().tocar(); N.franja().tocar();
    assert.equal(N.st.recargas, 1);
  });
});

/* ==========================================================================
 * 3. LOS CENTINELAS: UN SOLO PUNTO, EN LAS TRES PÁGINAS
 * ======================================================================== */
describe('3. el aviso de «empezó una escritura» sale del único sitio por donde salen', () => {
  for (const [f, ocupado] of [['play/index.html', 'ocupadoPlay'], ['app/socio.html', 'ocupadoSocio'], ['platachat/index.html', 'ocupadoPC']]) {
    test(f + ': escrituraEnCamino avisa al empezar, y el controlador sabe lo que va en camino (' + ocupado + ')', () => {
      const t = leer(f);
      const cuerpo = (/\nfunction escrituraEnCamino\(p\) \{([\s\S]*?)\n\}/.exec(t) || [])[1] || '';
      assert.match(cuerpo, /avisarQueEmpieza\(\)/, f + ': una escritura sale sin que la franja se vuelva a mirar');
      assert.match(t, /\nfunction avisarQueEmpieza\(\) \{[\s\S]*?ACT\.volverAMirar\(\)/);
      assert.match(t, new RegExp('iniciar\\(\\{ version: VERSION_SITIO, momentoSeguro: \\w+, ocupado: ' + ocupado + ','),
        f + ': el controlador no sabe qué va en camino; «Actualizar ahora» lo cortaría');
      assert.match(t, new RegExp('function momentoSeguro\\w*\\(\\) \\{[\\s\\S]{0,200}' + ocupado + '\\(\\)'),
        f + ': la lista blanca y el botón miran cosas distintas');
    });
  }
});
