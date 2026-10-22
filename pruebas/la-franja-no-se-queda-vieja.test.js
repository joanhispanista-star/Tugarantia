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
 *
 * 22-oct-2026 (verificación de e8f34eb) — LO QUE CONTESTÓ LA BASE SE VE
 * ANTES DE ACTUALIZAR. «Actualizar ahora» esperaba lo que iba en camino y,
 * al terminar, recargaba solo, encima de la respuesta: si la base decía que
 * NO (el «Pedir», el «Acepto» o la foto del comprobante de PlataChat con la
 * calculadora movida; el «Pedir» de Crédito en play/), la página lo pintaba
 * y la recarga se lo llevaba. Las pruebas de aquí que fijaban «termina, y
 * recarga» ahora fijan lo contrario (termina, dice «ya terminó» con el
 * botón, y recarga cuando la persona lo toca), y la sección 4 corre el «no»
 * de la base en las tres páginas. Las de la sección 4 FALLAN con e8f34eb,
 * salvo la del chat del socio, que es centinela (ver allá por qué).
 *
 * 23-oct-2026 (verificación de c213faf) — Y SIN TOCAR EL BOTÓN, IGUAL. La
 * sección 5 corre el «no» de la base cuando la persona NO tocó «Actualizar
 * ahora» pero se fue de la app (o volvió) con «Enviando…» en pantalla: con
 * c213faf la recarga sola se lo llevaba. 5a, el controlador; 5b, el «Pedir»
 * de play/ y de PlataChat de verdad. FALLAN con c213faf, salvo las tres
 * marcadas CENTINELA.
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

  /* 22-oct-2026 (verificación de e8f34eb) — antes: «termina, y recarga».
     Recargar ahí era hacerlo encima de la respuesta, que podía ser un «no». */
  test('con algo en camino espera y lo dice; al terminar NO recarga solo: dice que terminó, y el botón recarga', async () => {
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
    assert.equal(N.st.recargas, 0, 'terminó lo que iba en camino y recargó encima de la respuesta, sin dejarla ver');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    assert.equal(/se pone sola|se envió|llegó|recibi/.test(A.TEXTOS.termino), false,
      '«ya terminó» no puede prometer cómo terminó: este archivo no lee la respuesta');
    N.franja().tocar();
    assert.equal(N.st.recargas, 1, 'vio cómo quedó, tocó «Actualizar ahora» y no se puso');
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

  test('play/: «Aceptar» en camino: el botón se va; tocado igual, espera, y al contestar dice que terminó en vez de recargar', async () => {
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
    /* 22-oct-2026 (verificación de e8f34eb) — antes recargaba aquí solo:
       encima de la respuesta, que podía ser un «no». */
    assert.equal(N.st.recargas, 0, 'contestó y recargó encima de la respuesta, sin dejarla ver');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    N.franja().tocar();
    assert.equal(N.st.recargas, 1, 'la pantalla sigue siendo Crédito, tocó «Actualizar ahora» y no se puso');
  });

  test('app/socio.html sin juntar: «Enviar» en el chat; tocado igual espera, y cuando el mensaje llegó dice que terminó (y el botón recarga)', async () => {
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
    /* 22-oct-2026 (verificación de e8f34eb) — antes recargaba aquí solo. */
    assert.equal(N.st.recargas, 0, 'el mensaje llegó y recargó encima, sin dejar ver el hilo con lo que mandó');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    N.franja().tocar();
    assert.equal(N.st.recargas, 1, 'la caja quedó vacía, tocó «Actualizar ahora» y no se puso');
  });

  test('platachat/ con la calculadora movida (el botón siempre): «Pedir» en el aire; tocado, espera; contesta, y dice que terminó', async () => {
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
    /* 22-oct-2026 (verificación de e8f34eb) — antes recargaba aquí solo. */
    assert.equal(N.st.recargas, 0, 'el pedido contestó y recargó encima de la respuesta');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    N.franja().tocar();
    assert.equal(N.st.recargas, 1, 'vio cómo quedó, tocó «Actualizar ahora» y no se puso');
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

/* ==========================================================================
 * 4. LO QUE CONTESTÓ LA BASE SE VE ANTES DE ACTUALIZAR
 * 22-oct-2026 (verificación de e8f34eb)
 *
 * «Actualizar ahora» con algo en el aire esperaba a que terminara y,
 * al terminar, recargaba solo, sin mirar cómo terminó. Si la base decía que
 * NO, la página lo pintaba y la recarga se lo llevaba unos milisegundos
 * después: la persona quedaba creyendo que pidió, aceptó o mandó el
 * comprobante. Ahora, al terminar, la franja dice «ya terminó: mira cómo
 * quedó» con el botón, y nada recarga solo hasta que la persona toca la
 * página (ya la vio), toca el botón o cierra la franja.
 * Aquí: el controlador de verdad (4a) y el «no» de la base —un motivo y un
 * 500— en las tres páginas de verdad (4b).
 * ======================================================================== */
describe('4a. «ya terminó»: ni una recarga sola antes de que la persona vea la respuesta', () => {

  /* Toca «Actualizar ahora» con algo saliendo, y lo deja terminar. */
  async function tocoYTermina() {
    const N = navegadorConOjos();
    const v = { enCamino: false };
    const c = await N.arrancar({ momentoSeguro: () => !v.enCamino, ocupado: () => v.enCamino });
    N.mirando();
    await N.publicar('v140');
    const tocar = N.botonDeLaFranja();
    v.enCamino = true;
    tocar();
    v.enCamino = false;
    await c.revisar();          // la página avisa que terminó (su avisarQueTermino)
    return { N, c, v };
  }

  test('se queda mientras nadie toque la página: ni la respuesta que se pinta, ni salir y volver a la app recargan', async () => {
    const { N } = await tocoYTermina();
    assert.equal(N.st.recargas, 0, 'terminó y recargó encima de la respuesta');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    N.mutar({ id: 'cuerpo' });          // la página pinta lo que contestó la base
    await asentar(4);
    assert.equal(N.franja().texto, A.TEXTOS.termino,
      'la página pintó la respuesta y la franja volvió a lo de siempre: «ya terminó» no alcanzó a leerse');
    await N.ocultar();
    assert.equal(N.st.recargas, 0, 'se fue a otra app sin haber mirado la respuesta, y recargó');
    await N.volver();
    assert.equal(N.st.recargas, 0, 'volvió a la app y recargó antes de que viera la respuesta');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    /* Toca la página: ya la está mirando. Desde ahí, lo de siempre. */
    N.mirando();
    N.mutar({ id: 'cuerpo' });
    await asentar(4);
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    await N.ocultar();
    assert.equal(N.st.recargas, 1, 'ya vio cómo quedó, salió de la app y no se puso sola, que es lo que la franja prometía');
  });

  test('la ✕ sobre «ya terminó» la cierra, y no vuelve a salir con otro texto', async () => {
    const { N } = await tocoYTermina();
    assert.equal(N.st.recargas, 0, 'terminó y recargó encima de la respuesta');
    assert.equal(N.franja().texto, A.TEXTOS.termino);
    N.franja().cerrar();
    assert.equal(N.franja(), null);
    N.mutar({ id: 'cuerpo' });
    await asentar(4);
    assert.equal(N.franja(), null, 'cerró «ya terminó» y la franja volvió con lo de siempre, que nadie cerró');
    assert.equal(N.st.recargas, 0);
  });

  test('algo sale otra vez sin que la persona toque (un envío de fondo): mientras sale no dice «ya terminó», y nada recarga', async () => {
    const { N, c, v } = await tocoYTermina();
    assert.equal(N.st.recargas, 0, 'terminó y recargó encima de la respuesta');
    v.enCamino = true;
    await c.volverAMirar();
    assert.notEqual((N.franja() || {}).texto, A.TEXTOS.termino, 'con algo saliendo, la franja dice «ya terminó lo que iba en camino»');
    await N.ocultar();
    v.enCamino = false;
    await c.revisar();
    assert.equal(N.st.recargas, 0, 'terminó el envío de fondo con la app oculta y recargó encima de una respuesta que nadie vio');
    await N.volver();
    assert.equal(N.st.recargas, 0);
    assert.equal(N.franja().texto, A.TEXTOS.termino);
  });

  test('se cae la señal con algo esperando: al volver la señal dice «ya terminó» (lo que falló por eso), y no recarga encima', async () => {
    const N = navegadorConOjos();
    let enCamino = false;
    const c = await N.arrancar({ momentoSeguro: () => !enCamino, ocupado: () => enCamino });
    N.mirando();
    await N.publicar('v140');
    const tocar = N.botonDeLaFranja();
    enCamino = true;
    tocar();
    N.sinSenal();
    enCamino = false;           // falló, sin señal
    await c.revisar();
    assert.equal(c.estado().pedido, '', 'sin señal el pedido quedó en pie');
    assert.equal(N.franja(), null, 'sin señal prometió algo');
    N.st.onLine = true;
    (N.st.oyentes.win.online || []).forEach(f => f({ type: 'online' }));
    await asentar(16);
    assert.deepEqual([(N.franja() || {}).texto, (N.franja() || {}).boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    await N.ocultar();
    assert.equal(N.st.recargas, 0, 'volvió la señal y recargó encima del «no pude conectarme», que nadie vio');
  });
});

describe('4b. el «no» de la base, en las tres páginas de verdad', () => {

  /* play/: la red retiene «Pedir» (solicitar_a_la_medida); lo demás contesta en el acto. */
  for (const [nombre, respuesta, mensaje] of [
    ['la base dice que no (motivo «muchas»)',
     "{ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, motivo: 'muchas' }); } }",
     'Ya nos dejaste varias solicitudes hace poco. Las tenemos: dale un rato y te respondemos.'],
    ['el servidor contesta 500',
     "{ ok: false, status: 500, json: function () { return Promise.resolve({ message: 'boom' }); } }",
     'No pude conectarme. Revisa tu internet y vuelve a intentar.']
  ]) {
    test('play/: «Pedir» en Crédito, toca «Actualizar ahora», y ' + nombre + ': el «no» se ve, y la app no recarga encima', async () => {
      const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
      P.ev('window.__pend = []; fetch = function (u, o) { u = String(u);' +
           ' if (/solicitar_a_la_medida/.test(u)) return new Promise(function (res) { window.__pend.push(res); });' +
           ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };');
      const N = await navegadorConOjos().enLaPagina(P.ev, P.ventana);
      P.ev("irA('credito')");
      N.mirando();
      await N.publicar('v140');
      const tocar = N.botonDeLaFranja();
      P.ev('enviarPedido()');
      assert.equal(P.ev('window.__pend.length'), 1, 'el pedido no salió');
      tocar();                  // el dedo que llegó en el mismo instante
      await asentar(8);
      assert.equal(N.franja().texto, A.TEXTOS.esperando);
      P.ev('window.__pend[0](' + respuesta + ')');
      await asentar(16);
      await N.pasaUnSegundo();
      assert.equal(P.ev("$('csError').textContent"), mensaje, 'la página no pintó el «no»: la prueba no prueba el caso');
      assert.equal(P.ev('momentoSeguroPlay()'), true, 'Crédito con el «no» dejó de ser de la lista: la prueba no prueba el caso');
      assert.equal(N.st.recargas, 0, 'la base dijo que no y la app recargó encima: la persona nunca lo vio');
      assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
      await N.ocultar(); await N.volver();
      assert.equal(N.st.recargas, 0, 'salió y volvió sin haber tocado la página, y la recarga se llevó el «no»');
      assert.equal(P.ev("$('csError').textContent"), mensaje);
      N.franja().tocar();
      assert.equal(N.st.recargas, 1, 'vio el «no», tocó «Actualizar ahora» y no se puso');
    });
  }

  /* CENTINELA, no arreglo: en el chat del socio el «no» sale en un alert y
     lo escrito se queda en la caja, así que su lista blanca (sinTeclear)
     ya frenaba la recarga con e8f34eb. Esta prueba fija que siga así: que
     «ya terminó» no le ofrezca el botón con lo escrito a la vista. */
  test('app/socio.html sin juntar: el mensaje NO llega (500 y un «no» de la base): lo dice, lo escrito se queda, y nada recarga', async () => {
    const CORREO = '573001112222@tugarantia.net';
    for (const [nombre, resp] of [['500', { status: 500, cuerpo: { message: 'boom' } }],
                                  ['un «no»', { status: 200, cuerpo: { ok: false, motivo: 'demasiados mensajes seguidos' } }]]) {
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
      const tocar = N.botonDeLaFranja();
      S.elem('chTexto').value = 'Ya consigné, ¿me confirman?';
      S.ev('chatEnviar()');
      await asentar(4);
      assert.equal(pendientes.length, 1, nombre + ': el mensaje no salió');
      tocar();
      await asentar(8);
      assert.equal(N.franja().texto, A.TEXTOS.esperando);
      pendientes[0](resp);
      await asentar(16);
      await N.pasaUnSegundo();
      assert.ok(S.avisos.some(a => /^No pude (mandarlo|conectarme)/.test(a)), nombre + ': la página no dijo que no se mandó: la prueba no prueba el caso. Dijo: ' + S.avisos.join(' | '));
      assert.equal(S.ev("$('chTexto').value"), 'Ya consigné, ¿me confirman?', nombre + ': lo escrito no se quedó en la caja');
      assert.equal(N.st.recargas, 0, nombre + ': el mensaje no llegó y la app recargó encima de lo escrito');
      assert.equal(N.franja().boton, null, nombre + ': con lo escrito a la vista, la franja ofreció recargar');
      await N.ocultar(); await N.volver();
      assert.equal(N.st.recargas, 0, nombre + ': salió y volvió, y la recarga se llevó lo escrito');
    }
  });

  /* PlataChat con la calculadora movida (el modo «nunca»: el botón siempre),
     con los campos de verdad de la pantalla para la guarda de lo escrito. */
  async function plataConLaCalculadoraMovida() {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    P.ev('setMonto(MONTO + 50000)');
    const N = navegadorConOjos({ campos: camposVisibles(P.ev, 'cuerpo') });
    await N.enLaPagina(P.ev, P.ctx);
    N.mirando();
    await N.publicar('v140');
    assert.equal(P.ev('nuncaSeguroPC()'), true, 'la calculadora no quedó movida: la prueba no prueba el caso');
    return { P, N };
  }
  /* Toca «Actualizar ahora» con lo retenido en el aire, la nube contesta
     `resp`, y devuelve lo que la página pintó en `idError`. */
  async function tocaYLaNubeContesta(P, N, resp, idError) {
    assert.equal(P.st.colgadas.length, 1, 'no salió nada: la prueba no prueba el caso');
    N.franja().tocar();
    await asentar(8);
    assert.equal(N.st.recargas, 0, 'recargó con la escritura en el aire');
    assert.equal(N.franja().texto, A.TEXTOS.esperando);
    P.st.colgar = null;
    P.suelta(0, resp);
    await asentar(16);
    await N.pasaUnSegundo();
    return String(P.ev("$('" + idError + "').textContent"));
  }
  /* Lo que vale para los tres: el «no» se ve, la franja dice «ya terminó»
     con el botón, nada recarga solo (ni saliendo y volviendo), y el botón,
     sí. */
  async function seVeYNoRecarga(P, N, idError, dijo) {
    assert.equal(N.st.recargas, 0, 'la base dijo que no y la app recargó encima: la persona nunca lo vio (' + dijo + ')');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    await N.ocultar(); await N.volver();
    assert.equal(N.st.recargas, 0, 'salió y volvió, y la recarga se llevó el «no»');
    assert.equal(String(P.ev("$('" + idError + "').textContent")), dijo);
    N.franja().tocar();
    assert.equal(N.st.recargas, 1, 'vio el «no», tocó «Actualizar ahora» y no se puso');
  }

  for (const [nombre, resp] of [['un «no» por el tope', { ok: false, motivo: 'tope' }], ['un 500', { __estado: 500, message: 'boom' }]]) {
    test('platachat/: «Pedir» con la calculadora movida y ' + nombre + ': el «no» se ve, y la app no recarga encima', async () => {
      const { P, N } = await plataConLaCalculadoraMovida();
      const html = String(P.ev("$('calcSalida').innerHTML"));
      const pedir = (/onclick="(pedirPorChat\([^"]*\))"/.exec(html) || [])[1];
      assert.ok(pedir, 'Plata no pintó el botón de pedir');
      P.st.colgar = /solicitar_platachat|reproponer_platachat/;
      P.ev(pedir.replace(/&#39;|&apos;/g, "'"));
      await asentar(4);
      const dijo = await tocaYLaNubeContesta(P, N, resp, 'errPedir');
      assert.ok(dijo && !/Mandando/.test(dijo), 'la página no pintó el «no»: la prueba no prueba el caso (' + dijo + ')');
      assert.equal(P.ev('PANTALLA'), 'plata');
      await seVeYNoRecarga(P, N, 'errPedir', dijo);
    });
  }

  test('platachat/: «Acepto» en la propuesta y la base dice que cambió: el aviso se ve, y la app no recarga encima', async () => {
    const { P, N } = await plataConLaCalculadoraMovida();
    P.ev("SOL = { id: 9, estado: 'propuesta', capital: 350000, total: 380000, fecha_pago: '2026-11-15' }; CANAL = 'creditos'; irA('chats');");
    await asentar(8);
    P.st.colgar = /aceptar_/;
    P.ev('aceptarPropuesta(9)');
    await asentar(4);
    const dijo = await tocaYLaNubeContesta(P, N, { ok: false, motivo: 'cambio' }, 'chError');
    assert.match(dijo, /La propuesta cambió mientras la leías/, 'la página no pintó el «no»: la prueba no prueba el caso');
    await seVeYNoRecarga(P, N, 'chError', dijo);
  });

  test('platachat/: la foto del comprobante y la base dice que no (el tope del mes): el aviso se ve, y la app no recarga encima', async () => {
    const { P, N } = await plataConLaCalculadoraMovida();
    P.ev("CANAL = 'creditos'; irA('chats');");
    await asentar(8);
    P.st.colgar = /chat_foto_sesion/;
    P.ev("subirFotoChat('data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB')");
    await asentar(4);
    const dijo = await tocaYLaNubeContesta(P, N, { ok: false, motivo: 'tope' }, 'chError');
    assert.ok(dijo && !/Mandando/.test(dijo), 'la página no pintó el «no»: la prueba no prueba el caso (' + dijo + ')');
    await seVeYNoRecarga(P, N, 'chError', dijo);
  });
});

/* ==========================================================================
 * 5. Y SIN TOCAR EL BOTÓN, IGUAL — 23-oct-2026 (verificación de c213faf)
 *
 * La sección 4 cubría la respuesta que llega después de tocar «Actualizar
 * ahora». Sin tocarlo, la recarga sola seguía llevándose el «no»: la persona
 * pedía en Crédito (play/) o en Plata (PlataChat, con la calculadora como se
 * abrió), se iba a WhatsApp con «Enviando…» en pantalla —o volvía y la
 * respuesta llegaba en los 4 s de «justo al volver»—, la base decía que no,
 * y con la app oculta o recién vuelta la recarga sola estaba en su momento.
 * Al volver: Crédito limpio, lo último leído «Enviando…», y la solicitud no
 * existía. Regla: lo que llega sin nadie mirando se VE antes de cualquier
 * recarga sola (el mismo «ya terminó, mira cómo quedó» del botón).
 * Las de 5a y 5b FALLAN con c213faf (recargas 1 donde va 0), salvo las
 * marcadas como CENTINELA: esas fijan lo que NO debe cambiar.
 * ======================================================================== */
describe('5a. el controlador: lo que la persona mandó y terminó sin nadie mirando', () => {

  /* La persona toca algo que sale (su toque, y la página avisa que empieza). */
  async function salePorUnToque() {
    const N = navegadorConOjos();
    const v = { enCamino: false };
    const c = await N.arrancar({ momentoSeguro: () => !v.enCamino, ocupado: () => v.enCamino });
    N.mirando();
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    v.enCamino = true;
    await c.volverAMirar();           // la página: escrituraEnCamino → avisarQueEmpieza
    return { N, c, v };
  }

  test('se va de la app mientras sale y termina allá: no recarga sola, ni al volver; dice «ya terminó» hasta que toca la página', async () => {
    const { N, c, v } = await salePorUnToque();
    await N.ocultar();
    assert.equal(N.st.recargas, 0, 'recargó con algo en camino');
    v.enCamino = false;
    await c.revisar();                // la página: avisarQueTermino, con la app oculta
    assert.equal(N.st.recargas, 0, 'terminó con la app oculta y la recarga sola se llevó la respuesta antes de que nadie la viera');
    assert.equal(c.estado().terminoSinVer, true);
    await N.volver();
    assert.equal(N.st.recargas, 0, 'volvió a la app y recargó antes de que viera la respuesta');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    /* Toca la página: ya la está mirando. Desde ahí, lo de siempre. */
    N.mirando();
    N.mutar({ id: 'cuerpo' });
    await asentar(4);
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    await N.ocultar();
    assert.equal(N.st.recargas, 1, 'ya vio cómo quedó, salió de la app y no se puso sola, que es lo que la franja prometía');
  });

  test('sale, se va y vuelve, y la respuesta llega en los 4 s de «justo al volver»: tampoco recarga encima', async () => {
    const { N, c, v } = await salePorUnToque();
    await N.ocultar();
    await N.volver();
    v.enCamino = false;
    await c.revisar();
    assert.equal(N.st.recargas, 0, 'la respuesta llegó justo al volver, antes de tocar nada, y la recarga sola se la llevó');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
    await N.ocultar();
    assert.equal(N.st.recargas, 0, 'no había tocado la página: nadie dice que la vio, y al irse de la app recargó');
  });

  test('la página no avisa que empezó: la mirada al irse de la app lo encuentra en camino y lo anota igual', async () => {
    const N = navegadorConOjos();
    let enCamino = false;
    const c = await N.arrancar({ momentoSeguro: () => !enCamino, ocupado: () => enCamino });
    N.mirando();
    await N.publicar('v140');
    enCamino = true;                  // sin volverAMirar: una página que se olvidó de avisar
    await N.ocultar();
    enCamino = false;
    await c.revisar();
    assert.equal(N.st.recargas, 0, 'terminó con la app oculta y recargó encima: solo lo frenaba quien avisara al empezar');
    await N.volver();
    assert.equal(N.franja().texto, A.TEXTOS.termino);
  });

  test('la versión nueva aparece DESPUÉS de la respuesta (al volver): igual espera a que la vea', async () => {
    const N = navegadorConOjos();
    const v = { enCamino: false };
    const c = await N.arrancar({ momentoSeguro: () => !v.enCamino, ocupado: () => v.enCamino });
    N.mirando();
    v.enCamino = true;
    await c.volverAMirar();           // sin versión nueva todavía
    await N.ocultar();
    v.enCamino = false;
    await c.revisar();                // terminó allá; no hay nada que actualizar aún
    assert.equal(N.st.recargas, 0);
    await N.volver();
    await N.publicar('v140');         // la búsqueda del regreso la encuentra
    assert.equal(N.st.recargas, 0, 'la versión llegó al volver y recargó encima de una respuesta que nadie había visto');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
  });

  test('CENTINELA: con la persona mirando cuando llega, no nace nada: lo de siempre, y al salir de la app se pone sola', async () => {
    const { N, c, v } = await salePorUnToque();
    v.enCamino = false;
    await c.revisar();
    assert.equal(c.estado().terminoSinVer, false, 'la vio llegar y quedó «ya terminó»: frenaría la recarga sin motivo');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    await N.ocultar();
    assert.equal(N.st.recargas, 1);
  });

  test('CENTINELA: lo que la página manda sola, sin un toque desde que se abrió, no frena la recarga del arranque', async () => {
    const N = navegadorConOjos();
    const v = { enCamino: true };
    const c = await N.arrancar({ momentoSeguro: () => !v.enCamino, ocupado: () => v.enCamino });
    await c.volverAMirar();           // marcar_acceso al abrir PlataChat: nadie lo pidió
    await N.publicar('v140');
    assert.equal(N.st.recargas, 0, 'recargó con algo en camino');
    v.enCamino = false;
    await c.revisar();                // termina en los 4 s del arranque
    assert.equal(N.st.recargas, 1, 'un envío que nadie pidió dejó la página vieja: «ya terminó» le mentiría a quien no mandó nada');
  });
});

describe('5b. el «no» de la base sin tocar el botón, en play/ y PlataChat de verdad', () => {

  /* play/: la red retiene «Pedir» (solicitar_a_la_medida); lo demás contesta en el acto. */
  async function playConElPedidoEnElAire() {
    const P = abrirPlay({ sesion: { play_sesion: SESION_PLAY } });
    P.ev('window.__pend = []; fetch = function (u, o) { u = String(u);' +
         ' if (/solicitar_a_la_medida/.test(u)) return new Promise(function (res) { window.__pend.push(res); });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };');
    const N = await navegadorConOjos().enLaPagina(P.ev, P.ventana);
    P.ev("irA('credito')");
    N.mirando();                      // el toque de «Pedir»
    await N.publicar('v140');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    P.ev('enviarPedido()');
    await asentar(8);
    assert.equal(P.ev('window.__pend.length'), 1, 'el pedido no salió');
    return { P, N };
  }
  const SE_VA = ['se va a otra app mientras dice «Enviando…»', N => N.ocultar()];
  const VA_Y_VUELVE = ['se va y vuelve antes de la respuesta', async N => { await N.ocultar(); await N.volver(); }];

  for (const [nombre, respuesta, mensaje] of [
    ['la base dice que no (motivo «muchas»)',
     "{ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, motivo: 'muchas' }); } }",
     'Ya nos dejaste varias solicitudes hace poco. Las tenemos: dale un rato y te respondemos.'],
    ['el servidor contesta 500',
     "{ ok: false, status: 500, json: function () { return Promise.resolve({ message: 'boom' }); } }",
     'No pude conectarme. Revisa tu internet y vuelve a intentar.']
  ]) {
    for (const [como, coreografia] of [SE_VA, VA_Y_VUELVE]) {
      test('play/: «Pedir» en Crédito sin tocar el botón, ' + como + ', y ' + nombre + ': el «no» se ve antes de recargar', async () => {
        const { P, N } = await playConElPedidoEnElAire();
        await coreografia(N);
        P.ev('window.__pend[0](' + respuesta + ')');
        await asentar(16);
        assert.equal(P.ev("$('csError').textContent"), mensaje, 'la página no pintó el «no»: la prueba no prueba el caso');
        assert.equal(P.ev('momentoSeguroPlay()'), true, 'Crédito con el «no» dejó de ser de la lista: la prueba no prueba el caso');
        assert.equal(N.st.recargas, 0, 'la base dijo que no sin nadie mirando y la recarga sola se lo llevó: la persona cree que pidió');
        if (N.st.hidden) await N.volver();
        assert.equal(N.st.recargas, 0, 'volvió a la app y la recarga se llevó el «no» antes de que lo viera');
        assert.equal(P.ev("$('csError').textContent"), mensaje);
        assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
        /* Lo lee y toca la página: desde ahí, salir de la app sí la pone. */
        N.mirando();
        await N.ocultar();
        assert.equal(N.st.recargas, 1, 'ya vio el «no», salió de la app y no se puso sola');
      });
    }
  }

  test('CENTINELA play/: mirando todo el rato, el «no» llega delante de ella: lo de siempre, y al salir de la app se pone sola', async () => {
    const { P, N } = await playConElPedidoEnElAire();
    P.ev("window.__pend[0]({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, motivo: 'muchas' }); } })");
    await asentar(16);
    assert.match(String(P.ev("$('csError').textContent")), /varias solicitudes/);
    assert.equal(N.st.recargas, 0, 'recargó debajo del dedo');
    assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.alSalir, 'Actualizar ahora']);
    await N.ocultar();
    assert.equal(N.st.recargas, 1);
  });

  /* PlataChat con la calculadora COMO SE ABRIÓ: Plata es de la lista, y ahí
     la recarga sola sí está en su momento con la app oculta. */
  async function plataConElPedidoEnElAire() {
    const P = abrirPlataChat();
    await asentar();
    await P.entrarComo('3001112233', 'Maria.Secreta9');
    const N = navegadorConOjos({ campos: camposVisibles(P.ev, 'cuerpo') });
    await N.enLaPagina(P.ev, P.ctx);
    N.mirando();                      // el toque de «Pedir»
    await N.publicar('v140');
    assert.equal(P.ev('nuncaSeguroPC()'), false, 'la calculadora quedó movida: ese caso es el de la sección 4b');
    const html = String(P.ev("$('calcSalida').innerHTML"));
    const pedir = (/onclick="(pedirPorChat\([^"]*\))"/.exec(html) || [])[1];
    assert.ok(pedir, 'Plata no pintó el botón de pedir');
    P.st.colgar = /solicitar_platachat|reproponer_platachat/;
    P.ev(pedir.replace(/&#39;|&apos;/g, "'"));
    await asentar(4);
    assert.equal(P.st.colgadas.length, 1, 'el pedido no salió');
    return { P, N };
  }

  for (const [nombre, resp] of [['un «no» por el tope', { ok: false, motivo: 'tope' }], ['un 500', { __estado: 500, message: 'boom' }]]) {
    for (const [como, coreografia] of [SE_VA, VA_Y_VUELVE]) {
      test('platachat/: «Pedir» en Plata sin tocar el botón, ' + como + ', y ' + nombre + ': el «no» se ve antes de recargar', async () => {
        const { P, N } = await plataConElPedidoEnElAire();
        await coreografia(N);
        P.st.colgar = null;
        P.suelta(0, resp);
        await asentar(16);
        const dijo = String(P.ev("$('errPedir').textContent"));
        assert.ok(dijo && !/Mandando/.test(dijo), 'la página no pintó el «no»: la prueba no prueba el caso (' + dijo + ')');
        assert.equal(P.ev('PANTALLA'), 'plata');
        assert.equal(P.ev('momentoSeguroPC()'), true, 'Plata con el «no» dejó de ser de la lista: la prueba no prueba el caso');
        assert.equal(N.st.recargas, 0, 'la base dijo que no sin nadie mirando y la recarga sola se lo llevó (' + dijo + ')');
        if (N.st.hidden) await N.volver();
        assert.equal(N.st.recargas, 0, 'volvió a la app y la recarga se llevó el «no» antes de que lo viera');
        assert.equal(String(P.ev("$('errPedir').textContent")), dijo);
        assert.deepEqual([N.franja().texto, N.franja().boton], [A.TEXTOS.termino, 'Actualizar ahora']);
        N.mirando();
        await N.ocultar();
        assert.equal(N.st.recargas, 1, 'ya vio el «no», salió de la app y no se puso sola');
      });
    }
  }
});
