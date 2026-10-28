'use strict';
/* ==========================================================================
 * EL CHAT QUE SE MUEVE SOLO — app/chat-vivo.js — 26 de octubre de 2026
 *
 *   node --test pruebas/chat-vivo.test.js
 *
 * El módulo que comparten el CRM, el espejo y la app del socio para que una
 * conversación abierta se mueva sola y la bandeja se revise también con la
 * pestaña escondida. Nada de aquí toca la nube ni un navegador: los relojes
 * y el documento se inyectan, y cada prueba los maneja a mano.
 *
 * Lo que estas pruebas sujetan, y por qué cada cosa:
 *   1. JUNTAR POR id sin repetir, ordenado, sin tocar lo que recibe.
 *   2. EL HILO pide solo lo nuevo (p_desde = último id), pinta solo cuando
 *      cambió algo, NO pide escondido (lo que se pide queda «visto»), se
 *      para con la clave rechazada y cuando la caja ya no está, no arrastra
 *      la pantalla de quien lee arriba, y repite al terminar si alguien
 *      pidió una vuelta mientras otra iba.
 *   3. LA LISTA arma DOS relojes (45 s a la vista, 60 s escondida), cada uno
 *      trabaja solo en su caso, pide una vez al volver, y se detiene con la
 *      clave rechazada hasta que un ↻ bueno la reanuda.
 *   4. EL TIMBRE suena solo si hay con qué (en Node no hay AudioContext: en
 *      las pruebas no suena nada), respeta el interruptor y lo guarda.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../app/chat-vivo.js');
const { asentar } = require('./esperar.js');

const m = (id, de, texto) => ({ id, de, texto, creado_en: '2026-10-26T15:00:00-05:00' });

/* Un reloj y un documento de mentira que la prueba maneja a mano. */
function aparato(o) {
  o = o || {};
  const tics = {}, quitados = [], oyentes = {};
  let n = 0;
  return {
    tics, quitados, oyentes,
    reloj: { setInterval: (f, ms) => { tics[ms] = f; return ++n; }, clearInterval: id => { quitados.push(id); } },
    documento: { hidden: !!o.hidden,
      addEventListener(t, f) { oyentes[t] = f; }, removeEventListener(t) { delete oyentes[t]; } },
    /* Tocar el reloj de `ms` y esperar a que todo se asiente. */
    tic: async ms => { assert.ok(tics[ms], 'no hay reloj de ' + ms + ' ms: ' + Object.keys(tics)); tics[ms](); await asentar(); }
  };
}

/* ========================================================================== */
describe('1. juntar por id', () => {

  test('junta sin repetir, ordena por id y dice cuál es el último', () => {
    const r = V.juntar([m(1, 'socio', 'a'), m(2, 'panel', 'b')], [m(2, 'panel', 'b'), m(4, 'socio', 'd'), m(3, 'socio', 'c')]);
    assert.deepEqual(r.lista.map(x => x.id), [1, 2, 3, 4]);
    assert.deepEqual(r.agregados.map(x => x.id), [4, 3]);
    assert.equal(r.ultimo, 4);
    assert.equal(r.cambio, true);
  });

  test('sin nada nuevo, cambio es false y la lista es la misma', () => {
    const viejos = [m(1, 'socio', 'a')];
    const r = V.juntar(viejos, [m(1, 'socio', 'a')]);
    assert.equal(r.cambio, false);
    assert.deepEqual(r.lista.map(x => x.id), [1]);
    assert.equal(r.ultimo, 1);
  });

  test('no toca lo que recibe, y aguanta nulos y listas vacías', () => {
    const viejos = [m(1, 'socio', 'a')];
    V.juntar(viejos, [null, m(2, 'panel', 'b'), { texto: 'sin id' }]);
    assert.equal(viejos.length, 1, 'juntar modificó la lista que le pasaron');
    assert.equal(V.juntar(null, null).cambio, false);
    assert.equal(V.ultimoIdDe([]), 0);
    assert.equal(V.ultimoIdDe([m(7, 'socio', 'x'), m(3, 'socio', 'y')]), 7);
  });

  test('el título de la pestaña lleva el número adelante, y 99+ de cien para arriba', () => {
    assert.equal(V.titulo('Tu Garantía · Panel', 0), 'Tu Garantía · Panel');
    assert.equal(V.titulo('Tu Garantía · Panel', 3), '(3) Tu Garantía · Panel');
    assert.equal(V.titulo('Tu Garantía · Panel', 150), '(99+) Tu Garantía · Panel');
    assert.equal(V.titulo('Tu Garantía · Panel', '?'), 'Tu Garantía · Panel');
  });

  test('«al final» son 140 px o menos; sin medidas, al final', () => {
    assert.equal(V.estaAbajo(null), true);
    assert.equal(V.estaAbajo({}), true, 'una caja sin medidas (el banco, una caja sin pintar) cuenta como al final');
    assert.equal(V.estaAbajo({ scrollHeight: 1000, scrollTop: 0, clientHeight: 300 }), false);
    assert.equal(V.estaAbajo({ scrollHeight: 1000, scrollTop: 560, clientHeight: 300 }), true);
    assert.equal(V.estaAbajo({ scrollHeight: 1000, scrollTop: 559, clientHeight: 300 }), false);
  });
});

/* ========================================================================== */
describe('2. el hilo abierto', () => {

  function hilo(A, o) {
    const pedidos = [], pintados = [];
    const caja = { scrollHeight: 1000, scrollTop: 700, clientHeight: 300 };
    const respuestas = o.respuestas || (() => []);
    const v = V.hilo(Object.assign({
      pedir: desde => { pedidos.push(desde); return Promise.resolve().then(() => respuestas(desde)); },
      pintar: (lista, info) => pintados.push({ ids: lista.map(x => x.id), info }),
      caja: () => (o.sinCaja ? null : caja),
      esMio: x => x.de === 'panel',
      reloj: A.reloj, documento: A.documento
    }, o.extra || {}));
    return { v, pedidos, pintados, caja };
  }

  test('cargar pide desde 0, pinta y baja; el tic pide desde el último id y pinta SOLO si llegó algo', async () => {
    const A = aparato();
    const H = hilo(A, { respuestas: desde => desde === 0 ? [m(1, 'socio', 'hola'), m(2, 'panel', 'qué tal')] : (desde === 2 ? [m(3, 'socio', 'bien')] : []) });
    assert.equal(await H.v.cargar(), true);
    assert.deepEqual(H.pedidos, [0]);
    assert.equal(H.pintados.length, 1);
    assert.deepEqual(H.pintados[0].ids, [1, 2]);
    assert.equal(H.pintados[0].info.primera, true);
    assert.equal(H.caja.scrollTop, 1000, 'al abrir no bajó al final');
    assert.ok(A.tics[8000], 'el reloj del hilo no es de 8 s: ' + Object.keys(A.tics));
    await A.tic(8000);
    assert.deepEqual(H.pedidos, [0, 2], 'el tic no pidió desde el último id');
    assert.equal(H.pintados.length, 2);
    assert.deepEqual(H.pintados[1].ids, [1, 2, 3]);
    await A.tic(8000);
    assert.deepEqual(H.pedidos, [0, 2, 3]);
    assert.equal(H.pintados.length, 2, 'repintó sin que llegara nada: se llevaría lo que Joan está escribiendo');
    assert.equal(H.v.estado().ultimo, 3);
  });

  test('ESCONDIDO NO PIDE: lo que se pide queda «visto» sin que nadie lo vea; al volver, pide', async () => {
    const A = aparato();
    const H = hilo(A, { respuestas: () => [m(1, 'socio', 'a')] });
    await H.v.cargar();
    A.documento.hidden = true;
    await A.tic(8000);
    assert.deepEqual(H.pedidos, [0], 'pidió el hilo con la pestaña escondida');
    assert.equal(await H.v.latir(), false, 'latir() a mano también pidió escondido');
    A.documento.hidden = false;
    assert.ok(A.oyentes.visibilitychange, 'no escucha visibilitychange: al volver a la app no vuelve a pedir');
    A.oyentes.visibilitychange();
    await asentar();
    assert.deepEqual(H.pedidos, [0, 1], 'al volver a la pestaña no pidió lo que se perdió');
  });

  test('si Joan lee ARRIBA no se le arrastra la pantalla; lo que manda él baja siempre', async () => {
    const A = aparato();
    let nuevo = [m(2, 'socio', 'del cliente')];
    const H = hilo(A, { respuestas: desde => desde === 0 ? [m(1, 'socio', 'a')] : nuevo });
    await H.v.cargar();
    H.caja.scrollTop = 100;          /* leyendo arriba: a 600 px del final */
    await A.tic(8000);
    assert.equal(H.caja.scrollTop, 100, 'le arrastró la pantalla a quien estaba leyendo arriba');
    nuevo = [m(3, 'panel', 'lo mío')];
    await A.tic(8000);
    assert.equal(H.caja.scrollTop, 1000, 'lo que acaba de mandar Joan no bajó a verse');
    H.caja.scrollTop = 900; nuevo = [m(4, 'socio', 'otra')];   /* a 100 px: al final */
    await A.tic(8000);
    assert.equal(H.caja.scrollTop, 1000);
  });

  test('con la clave rechazada se PARA (y avisa); con la caja cerrada se para solo; nunca dos pedidos a la vez', async () => {
    const A = aparato();
    const parados = [], fallos = [];
    let rechazar = false;
    const H = hilo(A, { respuestas: () => { if (rechazar) throw { clave: true, humano: 'clave' }; return [m(1, 'socio', 'a')]; },
      extra: { alParar: mo => parados.push(mo), alFallar: e => fallos.push(e) } });
    await H.v.cargar();
    rechazar = true;
    await A.tic(8000);
    assert.deepEqual(parados, ['clave']);
    assert.equal(fallos.length, 1);
    assert.equal(H.v.estado().vivo, false);
    assert.equal(A.quitados.length, 1, 'no quitó el reloj: seguiría intentando con la clave mala');
    assert.equal(await H.v.latir(), false, 'parado, latir() siguió pidiendo');

    /* La caja desaparece (cerraron el cuadro): el reloj no tiene a quién pintarle. */
    const B = aparato();
    let cerrada = false;
    const parados2 = [];
    const H2 = hilo(B, { respuestas: () => [m(1, 'socio', 'a')] });
    const v2 = V.hilo({ pedir: () => Promise.resolve([m(1, 'socio', 'a')]), pintar() {},
      caja: () => (cerrada ? null : H2.caja), reloj: B.reloj, documento: B.documento, alParar: mo => parados2.push(mo) });
    await v2.cargar();
    cerrada = true;
    await B.tic(8000);
    assert.deepEqual(parados2, ['cerrada']);

    /* Dos a la vez, no: la segunda se guarda y se repite al terminar. */
    const C = aparato();
    let suelta = null;
    const pedidos = [];
    const v3 = V.hilo({ pedir: desde => { pedidos.push(desde); return new Promise(r => { suelta = () => r([]); }); }, pintar() {},
      caja: () => ({}), reloj: C.reloj, documento: C.documento });
    v3.cargar();
    assert.equal(await v3.latir(), false, 'pidió dos veces a la vez');
    assert.deepEqual(pedidos, [0]);
    suelta(); await asentar();
    assert.deepEqual(pedidos, [0, 0], 'la vuelta pedida mientras otra iba no se repitió al terminar');
  });

  test('si la base dice que no (null), no se pinta nada ni se da por cargado', async () => {
    const A = aparato();
    const H = hilo(A, { respuestas: () => null });
    assert.equal(await H.v.cargar(), false);
    assert.equal(H.pintados.length, 0);
    assert.equal(H.v.estado().cargado, false);
  });

  test('arrancar con semilla: no vuelve a pedir el hilo entero, y alLlegar solo con lo nuevo', async () => {
    const A = aparato();
    const llegados = [];
    const H = hilo(A, { respuestas: desde => desde === 5 ? [m(6, 'socio', 'nuevo')] : [], extra: { alLlegar: n => llegados.push(n.map(x => x.id)) } });
    H.v.arrancar({ mensajes: [m(4, 'socio', 'a'), m(5, 'panel', 'b')], ultimo: 5 });
    assert.equal(H.v.estado().cargado, true);
    await A.tic(8000);
    assert.deepEqual(H.pedidos, [5], 'con semilla pidió el hilo entero otra vez');
    assert.deepEqual(llegados, [[6]]);
    assert.deepEqual(H.pintados[0].ids, [4, 5, 6]);
    assert.equal(H.pintados[0].info.primera, false);
  });
});

/* ========================================================================== */
describe('3. la bandeja: 45 s a la vista, 60 s escondida', () => {

  function lista(A, o) {
    const pedidos = [];
    o = o || {};
    const r = V.lista({ pedir: esc => { pedidos.push(esc); return Promise.resolve().then(() => { if (o.rechazar) throw o.rechazar; }); },
      reloj: A.reloj, documento: A.documento });
    r.arrancar();
    return { r, pedidos };
  }

  test('dos relojes, y cada uno trabaja solo en su caso', async () => {
    const A = aparato();
    const L = lista(A);
    assert.deepEqual(Object.keys(A.tics).map(Number).sort(), [45000, 60000], 'no son dos relojes de 45 s y 60 s');
    await A.tic(60000);
    assert.deepEqual(L.pedidos, [], 'el de 60 s trabajó con la pestaña a la vista');
    await A.tic(45000);
    assert.deepEqual(L.pedidos, [false]);
    A.documento.hidden = true;
    await A.tic(45000);
    assert.deepEqual(L.pedidos, [false], 'el de 45 s trabajó escondido');
    await A.tic(60000);
    assert.deepEqual(L.pedidos, [false, true], 'escondido tiene que pedir con escondida=true: solo las listas');
    assert.equal(L.r.estado().vueltas.escondida, 1);
  });

  test('al volver a la pestaña pide una vez (lo que se perdió no llega solo)', async () => {
    const A = aparato({ hidden: true });
    const L = lista(A);
    A.documento.hidden = false;
    A.oyentes.visibilitychange(); await asentar();
    assert.deepEqual(L.pedidos, [false]);
    A.documento.hidden = true;
    A.oyentes.visibilitychange(); await asentar();
    assert.deepEqual(L.pedidos, [false], 'esconderse también pidió');
  });

  test('con la clave rechazada se detiene, parar/reanudar y latir a mano', async () => {
    const A = aparato();
    const L = lista(A, { rechazar: { clave: true } });
    await A.tic(45000);
    assert.equal(L.r.estado().vivo, false);
    assert.equal(L.r.estado().parado, 'clave');
    assert.equal(A.quitados.length, 2, 'no quitó los dos relojes');
    await A.tic(45000);
    assert.equal(L.pedidos.length, 1, 'parada, siguió pidiendo');
    L.r.reanudar();
    assert.equal(L.r.estado().vivo, true);
    assert.equal(Object.keys(A.tics).length, 2);
    /* Un fallo que NO es la clave no para nada. */
    const B = aparato();
    const M = lista(B, { rechazar: { humano: 'sin internet' } });
    await B.tic(45000);
    assert.equal(M.r.estado().vivo, true, 'un corte de red paró el reloj para siempre');
    /* latir() a mano respeta si está escondida. */
    B.documento.hidden = true;
    await M.r.latir();
    assert.deepEqual(M.pedidos, [false, true]);
    M.r.parar('apagado');
    assert.equal(await M.r.latir(), false);
  });
});

/* ========================================================================== */
describe('4. el timbre', () => {

  function almacen() { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d }; }
  function audio() {
    const sonados = [];
    class Ctx {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      createOscillator() { return { type: '', frequency: {}, connect() {}, start() { sonados.push(1); }, stop() {} }; }
      createGain() { return { gain: { value: 0, exponentialRampToValueAtTime() {} }, connect() {} }; }
    }
    return { Ctx, sonados };
  }

  test('en Node no hay AudioContext: no suena nada y no revienta', () => {
    const t = V.timbre({ almacen: almacen() });
    assert.equal(t.sonar(), false);
  });

  test('suena con lo que le pasen, respeta el interruptor y lo guarda, y no suena dos veces en 1,5 s', () => {
    const a = almacen(), { Ctx, sonados } = audio();
    let reloj = 10000;
    const t = V.timbre({ almacen: a, crear: Ctx, ahora: () => reloj });
    assert.equal(t.apagado(), false);
    assert.equal(t.sonar(), true);
    assert.equal(sonados.length, 1);
    /* Las dos listas llegan con milisegundos de diferencia: un solo toque. */
    reloj += 200;
    assert.equal(t.sonar(), false, 'sonó dos veces seguidas por un solo «llegó algo»');
    assert.equal(sonados.length, 1);
    reloj += 5000;
    t.poner(true);
    assert.equal(a.d.joan_chat_sonido, 'apagado', 'el interruptor no se guardó en el navegador');
    assert.equal(t.apagado(), true);
    assert.equal(t.sonar(), false);
    assert.equal(sonados.length, 1, 'apagado, sonó');
    t.poner(false);
    assert.equal(t.sonar(), true);
    assert.equal(sonados.length, 2);
  });

  test('si el navegador no deja crear el audio, devuelve false y sigue', () => {
    const t = V.timbre({ almacen: almacen(), crear: function () { throw new Error('sin audio'); } });
    assert.equal(t.sonar(), false);
  });
});
