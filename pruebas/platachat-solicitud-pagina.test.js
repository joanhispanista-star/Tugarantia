/* ============================================================================
 * PLATACHAT, LA PÁGINA CON RELOJ — fase 1b, 15 de septiembre de 2026.
 *
 *   node --test            (desde la raíz; descubre pruebas/*.test.js)
 *
 * platachat/index.html ya no manda el pedido como un mensaje suelto: lo
 * lleva a solicitar_platachat (base/20261005), que le pone hora, y la base
 * contesta —una persona o el automático— con una propuesta que la página
 * pinta como tarjeta en el chat de Créditos. Esto prueba los CABLES de esa
 * fase, con la misma técnica de pruebas/platachat.test.js: un document de
 * mentira que se acuerda de su innerHTML y una nube de mentira que contesta
 * por nombre de función. Compilar no es ejecutar.
 *
 * Lo que cada batería contesta:
 *
 *   1. ¿Pedir llama a solicitar_platachat con lo que la pantalla mostró, y
 *      cambiar a reproponer_platachat con el id? ¿Y si la migración no está
 *      (404), cae al camino de hoy y lo DICE? ¿Y un 500 no se disfraza de
 *      «sin conexión» ni manda un pedido sin reloj?
 *   2. ¿La tarjeta tiene una cara por estado, en pesos y fechas, con la hora
 *      en «a. m.»/«p. m.», y rotula a la máquina como máquina y a la persona
 *      como persona? ¿Ni un porcentaje?
 *   3. ¿Aceptar llama a aceptar_propuesta_platachat con el id, repinta con lo
 *      que la base devolvió y no se dispara dos veces?
 *   4. ¿El latido sigue siendo UNO, y en Créditos trae también la solicitud?
 *   5. ¿El botón de Plata cambia de verbo con la solicitud viva, y solo
 *      promete la hora cuando la base contestó al reloj?
 *   6. ¿Los nombres nuevos existen en base/20261005_platachat_solicitud.sql?
 *   7. ¿quienPropone y horaLimiteEnPalabras (platachat-reglas.js) hacen lo
 *      suyo sin mirar el reloj de pared?
 *
 * El arnés abrirPlataChat()/nube() es COPIA del de pruebas/platachat.test.js
 * (se copia, no se importa: un cambio allá no puede mover lo que se mide acá
 * sin que nadie lo vea).
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

const PAGINA = leer('platachat/index.html');
const MIGRACION = 'base/20261005_platachat_solicitud.sql';
const M = require('../app/motor.js');
const R = require('../app/platachat-reglas.js');
const FUENTE_REGLAS = leer('app/platachat-reglas.js');

/* Blanquea un trozo conservando los saltos de línea, para que los números de
   línea de un hallazgo sigan siendo los del archivo. */
const blanquear = (s, re) => s.replace(re, m => m.replace(/[^\n]/g, ' '));
const sinComentarios = s => blanquear(blanquear(s, /<!--[\s\S]*?-->/g), /\/\*[\s\S]*?\*\//g);


/* ==========================================================================
 * EL ARNÉS (copia de pruebas/platachat.test.js, sección 5)
 * ======================================================================== */
function abrirPlataChat(opciones) {
  const o = opciones || {};
  const almacen = {}, elems = {};
  /* Los temporizadores se ANOTAN, no corren: así una prueba puede contar
     cuántos latidos quedaron vivos y disparar uno a mano. */
  const temporizadores = []; let idT = 0;
  const elem = id => (elems[id] = elems[id] || {
    id, value: '', checked: false, max: '', min: '', step: '', textContent: '', innerHTML: '',
    dataset: {}, style: {}, files: null, disabled: false, scrollTop: 0, scrollHeight: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, insertBefore() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, click() {},
    getContext: () => null, scrollIntoView() {}
  });
  const doc = {
    getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elem('creado-' + Math.random()), addEventListener() {},
    head: elem('head'), body: elem('body'), documentElement: elem('html'), title: '', hidden: false
  };
  const ctx = {
    console, document: doc, alert() {}, confirm: () => true,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null),
                    setItem: (k, v) => { almacen[k] = String(v); },
                    removeItem: k => { delete almacen[k]; } },
    location: { href: 'https://tugarantia.net/platachat/', hash: '', hostname: 'tugarantia.net',
                pathname: '/platachat/', search: '', protocol: 'https:',
                host: 'tugarantia.net', origin: 'https://tugarantia.net', reload() {}, replace() {} },
    history: { replaceState() {} },
    navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() } },
    fetch: (url, cfg) => (o.red ? o.red(String(url), cfg)
      : Promise.reject(new Error('sin red en el banco de pruebas'))),
    setTimeout: (fn, ms) => { const t = { id: ++idT, fn, ms: Number(ms) || 0, vivo: true }; temporizadores.push(t); return t.id; },
    clearTimeout: id => { temporizadores.forEach(t => { if (t.id === id) t.vivo = false; }); },
    /* 15-sep-2026: un sondeo con setInterval también es un latido. Antes el
       arnés lo devolvía como 0 sin anotarlo, y la prueba de «UN latido» no
       veía un segundo sondeo permanente que ni salir() ni irA('plata') apagan
       (se comprobó por mutación: `setInterval(traerSolicitud, 20000)` en
       traerSolicitud pasaba en verde). Se anota igual que setTimeout, marcado
       `intervalo`, para que pendientes()/sondeos() lo cuenten sin cambiar
       ninguna aserción. El mismo hueco sigue en pruebas/platachat.test.js
       (archivo ajeno: no se toca desde acá). */
    setInterval: (fn, ms) => { const t = { id: ++idT, fn, ms: Number(ms) || 0, vivo: true, intervalo: true }; temporizadores.push(t); return t.id; },
    clearInterval: id => { temporizadores.forEach(t => { if (t.id === id) t.vivo = false; }); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Image: class {}, FileReader: class {}, Blob: class {}, File: class {},
    open() {}, scrollTo() {}, performance: { now: () => 0 },
    _oyentes: {},
    addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
    removeEventListener() {}, dispatchEvent() { return true; }
  };
  ctx.window = ctx; ctx.self = ctx;
  Object.assign(almacen, o.almacen || {});
  vm.createContext(ctx);
  const srcs = [...PAGINA.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  srcs.forEach(s => vm.runInContext(leer(path.join('platachat', s)), ctx, { filename: s }));
  [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'platachat#' + i }));
  return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems, almacen, ctx, srcs,
           pendientes: ms => temporizadores.filter(t => t.vivo && (ms == null || t.ms === ms)),
           /* 15-sep-2026: disparar un intervalo no lo apaga en un navegador
              de verdad; el arnés no finge que sí. */
           disparar: t => { t.vivo = !!t.intervalo; t.fn(); } };
}

/* Una nube de mentira que anota cada llamada y contesta por nombre de
   función. Contesta con .text() porque sesion.js lee el cuerpo como texto
   y lo intenta como JSON (un proxy caído contesta HTML). */
function nube(respuestas) {
  const llamadas = [], colgadas = [];
  const red = (url, cfg) => {
    const fn = (/rpc\/([a-z_0-9]+)/.exec(url) || [, url])[1];
    let cuerpo = null;
    try { cuerpo = JSON.parse(cfg && cfg.body); } catch (e) {}
    llamadas.push({ url, fn, cuerpo, cab: (cfg && cfg.headers) || {} });
    const r = typeof respuestas === 'function' ? respuestas(fn, cuerpo, llamadas) : (respuestas[fn] || { ok: true });
    const estado = r.__estado || 200;
    const resp = { ok: estado < 400, status: estado, text: () => Promise.resolve(JSON.stringify(r)) };
    /* __colgar: la respuesta se queda en el aire hasta que la prueba la
       suelte (colgadas[i]()), para poder cruzar dos traídas en vuelo. */
    if (r.__colgar) return new Promise(res => colgadas.push(() => res(resp)));
    return Promise.resolve(resp);
  };
  return { red, llamadas, colgadas };
}

/* La cuenta de prueba del enunciado del 5-ago (la misma de platachat.test.js):
   145.000 de cupo, 45.000 ganados. */
const CUENTA_PRUEBA = {
  ok: true, vinculada: true, nombre: 'Ana', actualizado_en: '2026-09-14',
  datos: { garantia: { total: 145000, acumulada: 45000, comprometida: 0, cupon: 100000, referidos: 0 },
           creditos: [], respaldados: [], perfil: { datos: {} },
           referidos: { total: 0, pagaron: 0, lista: [] }, resumen: {} }
};
const SESION_FALSA = 'SES = { access_token: "token-de-prueba", refresh_token: "refresco", celular: "3001112233", nombre: "Ana" }';
const tick = () => new Promise(r => setImmediate(r));
const ticks = async n => { for (let i = 0; i < (n || 4); i++) await tick(); };
const cuantas = (n, fn) => n.llamadas.filter(l => l.fn === fn).length;


/* ==========================================================================
 * LAS SOLICITUDES DE MENTIRA — tal como las devuelve la base (to_jsonb de la
 * fila, sin `responsable`). Las horas se cuentan desde el reloj de la
 * prueba: «dentro de 55 minutos» es hoy o mañana según la hora a la que se
 * corra, y eso mismo hace la página, así que se compara contra
 * platachat-reglas.js con el MISMO ahora y no contra una hora escrita.
 * ======================================================================== */
const enMin = m => new Date(Date.now() + m * 60000).toISOString();
const HOY = (() => { const x = new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })();
const FECHA_PAGO = M.iso(M.sumarDias(M.aFechaLocal(HOY), 15));

function solNueva(extra) {
  return Object.assign({
    id: 41, app: 'platachat', estado: 'nueva', nombre: 'Ana', cedula: '3001112233', celular: '3001112233',
    capital: 100000, tasa: 0.2, costo: 20000, total: 120000, fecha_corte: '2026-09-30', producto: 'quincenal',
    garantia: 145000, cupo: 145000, sobre_cupo: false,
    creada_en: enMin(-5), responder_antes_de: enMin(55), resuelta_en: null, aceptada_en: null, contrapropuesta: null,
    /* 15-sep-2026 — CONTRATO NUEVO: la base estampa en el pedido quién va a
       contestar a la hora ('nuevo' | 'estandar' | 'sin_cupo') y la espera en
       minutos. El molde es el caso corriente —cupo de sobra, precio de
       siempre—, así que 'estandar'. Una fila SIN esa marca es una solicitud
       vieja, y para ese caso la página tiene prohibido prometer nada: se
       prueba aparte, no desde el molde. */
    pedido: { capital: 100000, fecha_pago: '2026-09-30', cortes: 1, cupo: 145000, garantia: 145000,
              tiene_garantia: true, automatica: 'estandar', espera_minutos: 60 }
  }, extra || {});
}
function propuesta(por, extra) {
  return Object.assign({
    capital: 100000, costo_pct: 20, dias: 15, cortes: 1, costo: 20000, total: 120000,
    fecha_pago: FECHA_PAGO, texto: 'Dentro de tu cupo, al precio de siempre.', por, creada_en: enMin(-1)
  }, extra || {});
}
function solContra(por, extraCp, extra) {
  return solNueva(Object.assign({ estado: 'contrapropuesta', contrapropuesta: propuesta(por, extraCp), resuelta_en: enMin(-1) }, extra || {}));
}
function solAceptada() {
  return solNueva({ estado: 'aceptada', contrapropuesta: propuesta('automatica_1h', { aceptada_en: enMin(0) }), aceptada_en: enMin(0), resuelta_en: enMin(-1) });
}

/* Una nube con memoria: `viva` es la solicitud que la base «tiene», y las
   cuatro funciones del reloj la leen y la mueven como lo haría la base. */
function nubeViva(inicial, extra) {
  const estado = { viva: inicial || null };
  const n = nube((fn, cuerpo, llamadas) => {
    if (extra) { const r = extra(fn, cuerpo, llamadas, estado); if (r) return r; }
    if (fn === 'mi_cuenta') return CUENTA_PRUEBA;
    if (fn === 'chat_leer_sesion') return { ok: true, canal: cuerpo.p_canal, mensajes: [] };
    if (fn === 'mi_solicitud_platachat') return { ok: true, solicitud: estado.viva, ahora: new Date().toISOString() };
    if (fn === 'solicitar_platachat') {
      estado.viva = solNueva({ capital: cuerpo.p_capital, pedido: { capital: cuerpo.p_capital, fecha_pago: cuerpo.p_fecha_pago, cortes: cuerpo.p_cortes } });
      return { ok: true, ya_habia: false, solicitud: estado.viva };
    }
    if (fn === 'reproponer_platachat') {
      estado.viva = solNueva({ id: cuerpo.p_id, capital: cuerpo.p_capital, pedido: { capital: cuerpo.p_capital, fecha_pago: cuerpo.p_fecha_pago, cortes: cuerpo.p_cortes } });
      return { ok: true, solicitud: estado.viva };
    }
    if (fn === 'aceptar_propuesta_platachat') {
      estado.viva = solAceptada();
      return { ok: true, solicitud: estado.viva };
    }
    return { ok: true };
  });
  n.estado = estado;
  return n;
}

async function abrirConCuenta(n) {
  const P = abrirPlataChat({ red: n.red });
  P.ev(SESION_FALSA);
  await P.ev('cargarCuenta()');
  await ticks();
  return P;
}


/* ==========================================================================
 * 1. PEDIR, CAMBIAR Y LO QUE PASA CUANDO LA BASE NO ESTÁ O SE CAE
 * ======================================================================== */
describe('PlataChat con reloj: pedir por el chat va a la base', () => {

  test('pedirPorChat llama a solicitar_platachat con {p_capital, p_fecha_pago, p_cortes}, guarda la solicitud y va a Créditos', async () => {
    const n = nubeViva(null);
    const P = await abrirConCuenta(n);
    assert.equal(P.ev('SOL'), null, 'sin solicitud en la base, SOL tiene que ser null');
    P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
    await ticks();
    const pedido = n.llamadas.find(l => l.fn === 'solicitar_platachat');
    assert.ok(pedido, 'no llamó a solicitar_platachat');
    assert.deepEqual(pedido.cuerpo, { p_capital: 100000, p_fecha_pago: '2026-09-30', p_cortes: 1 });
    assert.equal(pedido.cab.Authorization, 'Bearer token-de-prueba', 'la solicitud no va con la sesión del cliente');
    assert.equal(cuantas(n, 'chat_escribir_sesion'), 0, 'con el reloj encendido NO manda el pedido como mensaje');
    assert.equal(P.ev('SOL.id'), 41, 'SOL no es la solicitud que devolvió la base');
    assert.equal(P.ev('SOL.estado'), 'nueva');
    assert.equal(P.ev('RELOJ_OK'), true);
    assert.equal(P.ev('TAB'), 'chats');
    assert.equal(P.ev('CANAL'), 'creditos');
    assert.equal(P.ev('BORRADOR'), '');
    /* La tarjeta ya está debajo del hilo. */
    assert.match(P.elems.chPropuesta.innerHTML, /Tu solicitud llegó/);
    assert.match(P.elems.chPropuesta.innerHTML, /Pediste<\/span><strong>\$100\.000</);
  });

  test('con dos cortes y sin días va igual: la base recibe la fecha y los cortes, no el texto', async () => {
    const n = nubeViva(null);
    const P = await abrirConCuenta(n);
    P.ev('pedirPorChat(150000, "2026-10-15", null, 2)');
    await ticks();
    assert.deepEqual(n.llamadas.find(l => l.fn === 'solicitar_platachat').cuerpo, { p_capital: 150000, p_fecha_pago: '2026-10-15', p_cortes: 2 });
  });

  test('con una solicitud ABIERTA, pedir es cambiarla: reproponer_platachat con p_id y p_texto vacío', async () => {
    const n = nubeViva(solNueva());
    const P = await abrirConCuenta(n);
    assert.equal(P.ev('SOL.id'), 41, 'no trajo la solicitud viva al abrir la cuenta');
    P.ev('pedirPorChat(150000, "2026-10-15", 30, 2)');
    await ticks();
    const cambio = n.llamadas.find(l => l.fn === 'reproponer_platachat');
    assert.ok(cambio, 'no llamó a reproponer_platachat');
    assert.deepEqual(cambio.cuerpo, { p_id: 41, p_capital: 150000, p_fecha_pago: '2026-10-15', p_cortes: 2, p_texto: '' });
    assert.equal(cuantas(n, 'solicitar_platachat'), 0, 'con una abierta abrió otra en vez de cambiarla');
    assert.equal(P.ev('SOL.capital'), 150000);
    assert.equal(P.ev('TAB'), 'chats');
    /* Con una contrapropuesta delante también se cambia, no se crea. */
    const m = nubeViva(solContra('automatica_1h'));
    const Q = await abrirConCuenta(m);
    Q.ev('pedirPorChat(80000, "2026-10-01", 16, 1)');
    await ticks();
    assert.equal(m.llamadas.find(l => l.fn === 'reproponer_platachat').cuerpo.p_id, 41);
    assert.equal(cuantas(m, 'solicitar_platachat'), 0);
  });

  test('si la migración no está (404), cae al chat de hoy: chat_escribir_sesion con el texto, y lo DICE arriba del hilo', async () => {
    const n = nubeViva(null, fn => (/_platachat$/.test(fn) ? { __estado: 404, message: 'no existe' } : null));
    const P = await abrirConCuenta(n);
    assert.equal(P.ev('RELOJ_OK'), false, 'un 404 encendió RELOJ_OK');
    P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
    await ticks();
    const escrito = n.llamadas.find(l => l.fn === 'chat_escribir_sesion');
    assert.ok(escrito, 'no cayó al mensaje de hoy');
    assert.deepEqual(escrito.cuerpo, { p_canal: 'creditos', p_texto: 'Quiero pedir $100.000 para el 30 sep 2026 (en 15 días). ¿Me alcanza?' });
    assert.equal(P.ev('TAB'), 'chats');
    assert.equal(P.elems.chError.textContent, P.ev('AVISO_SIN_RELOJ'));
    assert.match(P.elems.chError.textContent, /todavía no está encendida en la base/);
    assert.match(P.elems.chError.textContent, /falta correr base\/20261005_platachat_solicitud\.sql/);
    assert.equal(P.ev('SOL'), null);
    assert.equal(P.ev('RELOJ_OK'), false);
    assert.equal(P.elems.chPropuesta.innerHTML, '', 'pintó una tarjeta sin solicitud');
    /* El archivo que el aviso manda correr existe con ese nombre. */
    const archivo = /base\/(\S+\.sql)/.exec(P.ev('AVISO_SIN_RELOJ'))[1];
    assert.ok(existe('base/' + archivo), 'el aviso manda correr base/' + archivo + ' y no existe');
  });

  test('un 5xx de solicitar_platachat NO es «sin conexión» ni cae al mensaje: se queda en Plata y lo dice', async () => {
    for (const estado of [500, 502, 503]) {
      const n = nubeViva(null, fn => (fn === 'solicitar_platachat' ? { __estado: estado, message: 'boom' } : null));
      const P = await abrirConCuenta(n);
      P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
      await ticks();
      assert.equal(P.ev('TAB'), 'plata', estado + ': se fue a Chats con la solicitud sin recibir');
      assert.equal(cuantas(n, 'chat_escribir_sesion'), 0, estado + ': mandó el pedido como mensaje —un pedido sin reloj que el cliente repetiría—');
      const err = P.elems.errPedir.textContent;
      assert.equal(err, P.ev('SP.NUBE_CAIDA'), estado + ': no dice que la nube no pudo');
      assert.ok(!/internet|conexión|señal/i.test(err), estado + ': culpa a la señal del cliente');
      assert.equal(P.ev('SOL'), null);
    }
  });

  test('ok:false con motivo: la frase humana en #errPedir, y sigue en Plata', async () => {
    const casos = [['demasiadas seguidas', /Pediste varias veces seguidas/], ['fuera de rango', /Esa cifra o esa fecha no entran/],
                   ['falta la política de PlataChat en la base', /No pudimos recibir tu solicitud ahora/]];
    for (const [motivo, frase] of casos) {
      const n = nubeViva(null, fn => (fn === 'solicitar_platachat' ? { ok: false, motivo } : null));
      const P = await abrirConCuenta(n);
      P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
      await ticks();
      assert.equal(P.ev('TAB'), 'plata', motivo + ': se fue a Chats');
      assert.match(P.elems.errPedir.textContent, frase, motivo + ': la frase no es humana');
      assert.ok(!/\d\s?%/.test(P.elems.errPedir.textContent));
      assert.equal(P.ev('SOL'), null);
      /* Y la base sí contestó: el reloj existe, se puede prometer la hora. */
      assert.equal(P.ev('RELOJ_OK'), true);
    }
  });

  test('ya_habia: la base devolvió la abierta que la pantalla no sabía, se guarda y se le dice', async () => {
    const n = nubeViva(null, (fn, cuerpo, ll, estado) => {
      if (fn !== 'solicitar_platachat') return null;
      estado.viva = solContra('joan');
      return { ok: true, ya_habia: true, solicitud: estado.viva };
    });
    const P = await abrirConCuenta(n);
    P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
    await ticks();
    assert.equal(P.ev('SOL.estado'), 'contrapropuesta');
    assert.equal(P.ev('TAB'), 'chats');
    assert.match(P.elems.chError.textContent, /Ya tenías una solicitud abierta: es esta/);
    assert.match(P.elems.chPropuesta.innerHTML, /PlataChat te propone/);
  });

  test('la sesión vencida al pedir manda a la puerta y limpia SOL', async () => {
    const n = nubeViva(null, fn => (fn === 'solicitar_platachat' ? { __estado: 401 } : null));
    const P = await abrirConCuenta(n);
    P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
    await ticks(8);
    assert.equal(P.ev('SES'), null);
    assert.equal(P.ev('SOL'), null);
    assert.equal(P.ev('RELOJ_OK'), false);
    assert.match(P.elems.errEntrar.textContent, /Tu sesión venció/);
  });

  test('el préstamo a meses (modo respaldado) no entra al reloj: sigue como mensaje, sin prometer hora', () => {
    /* solicitar_platachat cotiza quincenas; una automática le pondría precio
       de quincenal a un plan mensual. Es una decisión de la página, y se
       clava por su texto para que no se «arregle» por accidente. */
    const p = sinComentarios(PAGINA);
    assert.match(p, /if \(MODO === 'respaldado'\) \{ pedirComoMensaje\(texto, ''\); return; \}/);
    assert.match(p, /var conReloj = MODO !== 'respaldado';/);
  });
});


/* ==========================================================================
 * 2. LA TARJETA: UN ESTADO, UNA CARA
 * ======================================================================== */
describe('PlataChat con reloj: la tarjeta de la solicitud', () => {

  const tarjeta = (P, sol) => P.ev('tarjetaPropuesta(' + JSON.stringify(sol) + ')');
  const fmtFecha = (P, iso) => P.ev('fmtFecha("' + iso + '")');
  const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sinPorcentaje = (h, que) => assert.ok(!/%/.test(h), que + ' muestra un porcentaje: ' + (/.{0,40}%.{0,40}/.exec(h) || [])[0]);

  test('NUEVA con hora: «Tu solicitud llegó», lo pedido en pesos y fecha, la hora en a. m./p. m., la nota del automático y «Cambiar lo que pedí»', () => {
    const P = abrirPlataChat();
    const sol = solNueva();
    const h = tarjeta(P, sol);
    assert.match(h, /<div class="tarjeta-propuesta">/);
    assert.ok(!/humana/.test(h), 'una solicitud nueva no es una propuesta de persona');
    assert.match(h, /class="tit">Tu solicitud llegó</);
    assert.match(h, /<span class="k">Pediste<\/span><strong>\$100\.000<\/strong>/);
    assert.match(h, /<span class="k">Para el<\/span><strong>30 sep 2026<\/strong>/);
    /* La hora: la MISMA que da platachat-reglas.js con el mismo ahora. */
    const esperada = R.horaLimiteEnPalabras(sol.responder_antes_de, new Date().toISOString());
    assert.match(esperada, /antes de las \d{1,2}:\d{2} (a|p)\. m\.$/);
    assert.ok(h.indexOf('<div class="dice">Te contestamos por aquí ' + esperada + '</div>') >= 0,
      'la hora de la tarjeta no es la de platachat-reglas.js: ' + (/class="dice">[^<]*/.exec(h) || [])[0]);
    assert.ok(!/p\. m\.\./.test(h) && !/a\. m\.\./.test(h), 'punto doble después de «p. m.»');
    assert.match(h, /<div class="nota">Si nadie alcanza, a esa hora te contesta el automático con una propuesta; la ves aquí mismo\.<\/div>/);
    assert.match(h, /<div class="acciones una"><button type="button" class="btn claro" onclick="proponerOtraCifra\(\)">Cambiar lo que pedí<\/button><\/div>/);
    assert.ok(!/aceptarPropuesta/.test(h), 'ofrece aceptar una solicitud que todavía no tiene propuesta');
    sinPorcentaje(h, 'la tarjeta nueva');
    /* Dos quincenas se dicen con palabras. */
    const h2 = tarjeta(P, solNueva({ pedido: { capital: 100000, fecha_pago: '2026-10-15', cortes: 2 } }));
    assert.match(h2, /<strong>15 oct 2026 \(dos quincenas\)<\/strong>/);
  });

  test('NUEVA con la hora ya cumplida (la base la resuelve en la próxima lectura): lo dice, no pinta una hora pasada', () => {
    const P = abrirPlataChat();
    const h = tarjeta(P, solNueva({ responder_antes_de: enMin(-3) }));
    assert.match(h, /La hora se cumplió: en un momento te contesta el automático con una propuesta; la ves aquí mismo\./);
    assert.ok(!/antes de las/.test(h), 'promete una hora que ya pasó');
    assert.match(h, /Cambiar lo que pedí/);
  });

  test('NUEVA sin hora (el automático no pudo: sin_cupo): «Te contesta una persona por aquí.»', () => {
    const P = abrirPlataChat();
    const h = tarjeta(P, solNueva({ responder_antes_de: null, resuelta_en: enMin(-1),
      pedido: { capital: 100000, fecha_pago: '2026-09-30', cortes: 1, automatica: 'sin_cupo' } }));
    assert.match(h, /<div class="dice">Te contesta una persona por aquí\.<\/div>/);
    assert.match(h, /El automático no pudo contestarte solo con tu cupo de hoy; lo que dijo está en el hilo, arriba\./);
    assert.ok(!/antes de las|automático con una propuesta/.test(h), 'promete el automático cuando el automático ya dijo que no pudo');
    sinPorcentaje(h, 'la tarjeta sin cupo');
  });

  test('NUEVA con hora y la marca de la base: solo «sin_cupo» quita la promesa del automático; «nuevo» y «estandar» la conservan', () => {
    /* 15-sep-2026 — CONTRATO NUEVO. La fila nace con `pedido.automatica`
       ('nuevo' | 'estandar' | 'sin_cupo') porque la página no puede ver
       politica_app: sin esa marca tenía que espejar la regla con
       M.MONTO_MINIMO, y el espejo no ve con_garantia. Pero de los tres
       valores solo UNO significa «el automático no va a proponer»: los otros
       dos significan exactamente lo contrario. Tratarlos como uno solo —un
       `if (pedido.automatica)`— le dice «te contesta una persona» al caso
       normal, que es la mentira opuesta y la más frecuente. El cupo de esta
       solicitud (145.000) está MUY por encima del mínimo, así que el espejo
       no opina: lo único que decide acá es la marca. */
    const P = abrirPlataChat();
    const pedidoCon = a => ({ capital: 100000, fecha_pago: '2026-09-30', cortes: 1,
                              cupo: 145000, garantia: 145000, tiene_garantia: true,
                              automatica: a, espera_minutos: 60 });
    const h = tarjeta(P, solNueva({ pedido: pedidoCon('sin_cupo') }));
    assert.ok(!/te contesta el automático con una propuesta/.test(h),
      'con automatica=«sin_cupo» la tarjeta sigue prometiendo la propuesta que la base ya sabe que no va a hacer');
    assert.match(h, /te contesta una persona por aquí/, 'con automatica=«sin_cupo» la tarjeta no dice quién sí va a contestar');
    ['nuevo', 'estandar'].forEach(a => {
      const g = tarjeta(P, solNueva({ pedido: pedidoCon(a) }));
      assert.match(g, /<div class="nota">Si nadie alcanza, a esa hora te contesta el automático con una propuesta; la ves aquí mismo\.<\/div>/,
        'con automatica=«' + a + '» la tarjeta le quita al cliente la propuesta automática que la base SÍ va a hacer');
      assert.ok(!/te contesta una persona/.test(g),
        'con automatica=«' + a + '» la tarjeta promete una persona donde contesta el automático');
    });
    /* Con la hora ya cumplida, el mismo criterio. */
    assert.match(tarjeta(P, solNueva({ responder_antes_de: enMin(-3), pedido: pedidoCon('estandar') })),
      /La hora se cumplió: en un momento te contesta el automático con una propuesta/);
    assert.match(tarjeta(P, solNueva({ responder_antes_de: enMin(-3), pedido: pedidoCon('sin_cupo') })),
      /La hora se cumplió: te contesta una persona por aquí/);
    /* El tercer estado: SIN marca. Es una solicitud nacida antes de esta
       fase (o con un valor que esta página no conoce). La página no sabe
       quién va a contestar, así que no promete a nadie: dice la hora y se
       calla. Prometer «el automático» acá sería la mentira que esta fase
       cierra, y prometer «una persona» la contraria. */
    const viejo = { capital: 100000, fecha_pago: '2026-09-30', cortes: 1, cupo: 145000, garantia: 145000, tiene_garantia: true };
    const sinMarca = tarjeta(P, solNueva({ pedido: viejo }));
    assert.match(sinMarca, /<div class="dice">Te contestamos por aquí antes de las \d{1,2}:\d{2} (a|p)\. m\.<\/div>/,
      'una solicitud sin la marca de la base ya no dice ni la hora');
    assert.ok(!/<div class="nota">/.test(sinMarca),
      'sin la marca de la base la tarjeta promete quién contesta: no puede saberlo');
    assert.ok(!/automático|una persona/.test(sinMarca), 'sin marca nombra a quien no sabe si va a contestar');
    const sinMarcaVencida = tarjeta(P, solNueva({ responder_antes_de: enMin(-3), pedido: viejo }));
    assert.match(sinMarcaVencida, /La hora se cumplió: en un momento te contestamos por aquí\./);
    assert.ok(!/automático|una persona/.test(sinMarcaVencida), 'sin marca y vencida nombra a quien no sabe si va a contestar');
  });

  test('CONTRAPROPUESTA automática (por = automatica_1h): «Propuesta automática», punteada, en pesos, con la garantía que gana y los dos botones', () => {
    const P = abrirPlataChat();
    const sol = solContra('automatica_1h');
    const h = tarjeta(P, sol);
    assert.match(h, /^<div class="tarjeta-propuesta">/, 'la automática tiene que conservar el borde punteado de la piel (sin .humana)');
    assert.match(h, /class="tit">Propuesta automática</);
    assert.match(h, /<div class="dice">Dentro de tu cupo, al precio de siempre\.<\/div>/);
    assert.match(h, /<span class="k">Te prestamos<\/span><strong>\$100\.000<\/strong>/);
    assert.match(h, /<span class="k">Lo que cuesta<\/span><strong>\$20\.000<\/strong>/);
    assert.match(h, /<span class="k">Devuelves<\/span><strong>\$120\.000<\/strong>/);
    assert.match(h, new RegExp('<span class="k">Cuándo</span><strong>el ' + re(fmtFecha(P, FECHA_PAGO)) + ', en 15 días</strong>'));
    /* La garantía que deja: la MISMA cuenta de la calculadora (+15.000 por 20.000 de costo). */
    const gana = P.ev('garantiaQueGana(20000, 100000)');
    assert.equal(gana, M.acumularGarantia(20000, true));
    assert.ok(h.indexOf('<div class="gana">Al pagarlo en fecha ganas <strong>+' + P.ev('COP(' + gana + ')') + '</strong> de garantía.</div>') >= 0,
      'la garantía que gana no es la de la calculadora (+' + P.ev('COP(' + gana + ')') + ')');
    assert.match(h, /<button type="button" class="btn marca" onclick="aceptarPropuesta\(41\)">Acepto: recibo \$100\.000<\/button>/);
    assert.match(h, /<button type="button" class="btn claro" onclick="proponerOtraCifra\(\)">Proponer otra cifra<\/button>/);
    assert.match(h, /Aceptar no te entrega la plata: te la entrega una persona de PlataChat por [^<]+ y ahí nace el crédito\. Si no te sirve, no aceptes\./);
    assert.ok(h.indexOf(P.ev('nombreProveedor()')) >= 0, 'la nota no dice por dónde llega la plata');
    sinPorcentaje(h, 'la propuesta automática');
    assert.ok(h.indexOf('0.2') < 0 && h.indexOf('costo_pct') < 0, 'se filtró la tasa');
  });

  test('CONTRAPROPUESTA del gerente (por = gerente:3001234567): «Tu gerente te propone», borde continuo (.humana)', () => {
    const P = abrirPlataChat();
    const h = tarjeta(P, solContra('gerente:3001234567', { texto: 'Te dejo 90 mil a 20 días', capital: 90000, costo: 18000, total: 108000, dias: 20 }));
    assert.match(h, /^<div class="tarjeta-propuesta humana">/);
    assert.match(h, /class="tit">Tu gerente te propone</);
    assert.match(h, /<div class="dice">Te dejo 90 mil a 20 días<\/div>/);
    assert.match(h, /Acepto: recibo \$90\.000</);
    assert.match(h, /Devuelves<\/span><strong>\$108\.000/);
    assert.ok(h.indexOf('3001234567') < 0, 'el celular del gerente se ve en la tarjeta');
    sinPorcentaje(h, 'la propuesta del gerente');
  });

  test('CONTRAPROPUESTA de Joan (por = joan): «PlataChat te propone», borde continuo', () => {
    const P = abrirPlataChat();
    const h = tarjeta(P, solContra('joan'));
    assert.match(h, /^<div class="tarjeta-propuesta humana">/);
    assert.match(h, /class="tit">PlataChat te propone</);
    /* La vieja 'automatica' (solicitar_primer_credito) sigue siendo máquina;
       un `por` desconocido también: ante la duda, el error barato. */
    assert.match(tarjeta(P, solContra('automatica')), /class="tit">Propuesta automática</);
    assert.match(tarjeta(P, solContra('quien-sabe')), /^<div class="tarjeta-propuesta">[\s\S]*Propuesta automática/);
  });

  test('CONTRAPROPUESTA con dos cortes: «dos quincenas», la garantía por dos, y el texto de la base escapado', () => {
    const P = abrirPlataChat();
    const h = tarjeta(P, solContra('automatica_1h', { cortes: 2, costo: 40000, total: 140000, dias: 30, texto: '<b>ojo</b> & más' }));
    assert.match(h, /, en 15 días, dos quincenas<\/strong>/);
    assert.match(h, /Lo que cuesta<\/span><strong>\$40\.000/);
    const gana = P.ev('garantiaQueGana(20000, 100000)') * 2;
    assert.ok(h.indexOf('+' + P.ev('COP(' + gana + ')')) >= 0, 'la garantía de dos cortes no es la de un corte por dos');
    assert.ok(h.indexOf('&lt;b&gt;ojo&lt;/b&gt; &amp; más') >= 0, 'el texto de la propuesta no llegó escapado');
    assert.ok(h.indexOf('<b>ojo</b>') < 0);
    /* A cuotas (contrapropuesta_a_cuotas del CRM): se listan y NO se inventa la garantía. */
    const hc = tarjeta(P, solContra('joan', { cuotas: [{ fecha: '2026-10-15', capital: 50000, costo: 10000 }, { fecha: '2026-11-15', capital: 50000, costo: 10000, total: 60000 }], fecha_pago: '2026-11-15' }));
    assert.match(hc, /Cuándo<\/span><strong>en 2 cuotas, la última el 15 nov 2026<\/strong>/);
    assert.match(hc, /Cuota 1<\/span><strong>\$60\.000 el 15 oct 2026/);
    assert.match(hc, /Cuota 2<\/span><strong>\$60\.000 el 15 nov 2026/);
    assert.ok(!/class="gana"/.test(hc), 'inventa la garantía de un plan a cuotas con la cuenta del quincenal');
    sinPorcentaje(hc, 'la propuesta a cuotas');
  });

  test('ACEPTADA: «Aceptaste $X», repite cuánto y cuándo, y dice que la plata la entrega una persona', () => {
    const P = abrirPlataChat();
    const h = tarjeta(P, solAceptada());
    assert.match(h, /class="tit">Aceptaste \$100\.000</);
    assert.match(h, /Devuelves<\/span><strong>\$120\.000/);
    assert.match(h, /Te la entregamos por [^<]+ y te avisamos por aquí\. No tienes que hacer nada más\./);
    assert.ok(!/aceptarPropuesta|Proponer otra cifra|Cambiar lo que pedí/.test(h), 'una aceptada sigue ofreciendo botones');
    sinPorcentaje(h, 'la tarjeta aceptada');
  });

  test('ATENDIDA y DESCARTADA: una frase cada una; después de siete días ya no se pintan; un estado raro tampoco', () => {
    const P = abrirPlataChat();
    assert.match(tarjeta(P, solNueva({ estado: 'atendida', aceptada_en: enMin(-60) })), /Crédito creado[\s\S]*Lo ves en Yo → tu historial cuando lo publiquen\./);
    assert.match(tarjeta(P, solNueva({ estado: 'descartada', resuelta_en: enMin(-60) })), /No pudimos con esta solicitud[\s\S]*Escríbenos por aquí si quieres intentarlo de otra forma\./);
    const hace8 = enMin(-8 * 24 * 60);
    assert.equal(tarjeta(P, solNueva({ estado: 'descartada', resuelta_en: hace8 })), '', 'una descartada de hace ocho días sigue en pantalla');
    assert.equal(tarjeta(P, solNueva({ estado: 'atendida', resuelta_en: null, aceptada_en: hace8 })), '', 'una atendida de hace ocho días sigue en pantalla');
    assert.equal(tarjeta(P, solNueva({ estado: 'pendiente' })), '', 'pinta un estado que no existe');
    assert.equal(tarjeta(P, null), '');
  });

  test('sin platachat-reglas.js: título neutro «Propuesta» con borde punteado, y la hora sola con Intl, nunca en blanco', () => {
    const P = abrirPlataChat();
    P.ev('R = null');
    const h = tarjeta(P, solContra('gerente:3001234567'));
    assert.match(h, /^<div class="tarjeta-propuesta">/, 'sin reglas no se puede decir que fue una persona: punteado');
    assert.match(h, /class="tit">Propuesta</);
    const hn = tarjeta(P, solNueva());
    assert.match(hn, /Te contestamos por aquí antes de las \d{1,2}:\d{2} (a|p)\. m\.</);
    assert.equal(P.ev('horaLimite("basura")'), 'antes de la hora que dice el hilo');
  });

  test('en el chat de Créditos la tarjeta es lo que la base devolvió; en otro canal no se pinta', async () => {
    const n = nubeViva(solContra('gerente:3001234567'));
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")');
    await ticks();
    assert.match(P.elems.chPropuesta.innerHTML, /Tu gerente te propone/);
    assert.equal(P.elems.chPropuesta.innerHTML, P.ev('tarjetaPropuesta(SOL)'));
    P.ev('setCanal("servicio")');
    await ticks();
    assert.equal(P.elems.chPropuesta.innerHTML, '', 'la tarjeta de Créditos se quedó en Servicio');
    P.ev('setCanal("creditos")');
    await ticks();
    assert.match(P.elems.chPropuesta.innerHTML, /Tu gerente te propone/);
  });
});


/* ==========================================================================
 * 3. ACEPTAR
 * ======================================================================== */
describe('PlataChat con reloj: aceptar', () => {

  test('aceptarPropuesta llama a aceptar_propuesta_platachat con {p_id}, repinta con lo que la base devolvió y vuelve a traer el hilo', async () => {
    const n = nubeViva(solContra('automatica_1h'));
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")');
    await ticks();
    assert.match(P.elems.chPropuesta.innerHTML, /onclick="aceptarPropuesta\(41\)"/);
    const hilosAntes = cuantas(n, 'chat_leer_sesion');
    P.ev('aceptarPropuesta(41)');
    await ticks();
    const ac = n.llamadas.find(l => l.fn === 'aceptar_propuesta_platachat');
    assert.ok(ac, 'no llamó a aceptar_propuesta_platachat');
    assert.deepEqual(ac.cuerpo, { p_id: 41 });
    assert.equal(ac.cab.Authorization, 'Bearer token-de-prueba');
    assert.equal(P.ev('SOL.estado'), 'aceptada', 'SOL no es lo que devolvió la base');
    assert.equal(P.ev('ACEPTANDO'), false);
    assert.match(P.elems.chPropuesta.innerHTML, /Aceptaste \$100\.000/);
    assert.equal(cuantas(n, 'chat_leer_sesion'), hilosAntes + 1, 'no volvió a traer el hilo (el «Acepto» que escribió la base)');
    /* Aceptar no desembolsa: ninguna función de crédito ni de pago se llama. */
    assert.ok(!n.llamadas.some(l => /credito|pago|desembols/.test(l.fn)), 'aceptar llamó a algo que parece un desembolso');
  });

  test('mientras el aceptar va en vuelo el botón queda apagado y un segundo toque no manda nada', async () => {
    const n = nubeViva(solContra('joan'), fn => (fn === 'aceptar_propuesta_platachat' ? { __colgar: true, ok: true, solicitud: solAceptada() } : null));
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")');
    await ticks();
    P.ev('aceptarPropuesta(41)');
    await ticks();
    assert.equal(P.ev('ACEPTANDO'), true);
    assert.match(P.elems.chPropuesta.innerHTML, /onclick="aceptarPropuesta\(41\)" disabled>/, 'el botón sigue vivo con el aceptar en vuelo');
    P.ev('aceptarPropuesta(41)');
    await ticks();
    assert.equal(cuantas(n, 'aceptar_propuesta_platachat'), 1, 'el segundo toque mandó otro aceptar');
    n.colgadas[0]();
    await ticks();
    assert.equal(P.ev('ACEPTANDO'), false);
    assert.equal(P.ev('SOL.estado'), 'aceptada');
  });

  test('si la base dice que no (la propuesta cambió), lo dice y vuelve a traer la solicitud que sí vale', async () => {
    const n = nubeViva(solContra('automatica_1h'), (fn, c, ll, estado) => {
      if (fn !== 'aceptar_propuesta_platachat') return null;
      estado.viva = solContra('gerente:3001234567', { capital: 80000, costo: 16000, total: 96000 });
      return { ok: false };
    });
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")');
    await ticks();
    const traidasAntes = cuantas(n, 'mi_solicitud_platachat');
    P.ev('aceptarPropuesta(41)');
    await ticks();
    assert.equal(P.elems.chError.textContent, 'No pudimos registrar tu aceptación. Si la propuesta cambió, acá ves la nueva.');
    assert.equal(cuantas(n, 'mi_solicitud_platachat'), traidasAntes + 1, 'no volvió a traer la solicitud');
    assert.match(P.elems.chPropuesta.innerHTML, /Tu gerente te propone[\s\S]*Acepto: recibo \$80\.000/);
    assert.equal(P.ev('ACEPTANDO'), false);
  });

  test('aceptar con la migración sin correr (404) o con la nube caída: el aviso, y la tarjeta sigue', async () => {
    const n = nubeViva(solContra('joan'), fn => (fn === 'aceptar_propuesta_platachat' ? { __estado: 404 } : null));
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")'); await ticks();
    P.ev('aceptarPropuesta(41)'); await ticks();
    assert.equal(P.elems.chError.textContent, P.ev('AVISO_SIN_RELOJ'));
    assert.match(P.elems.chPropuesta.innerHTML, /Acepto: recibo/);
    const m = nubeViva(solContra('joan'), fn => (fn === 'aceptar_propuesta_platachat' ? { __estado: 503 } : null));
    const Q = await abrirConCuenta(m);
    Q.ev('irA("chats")'); await ticks();
    Q.ev('aceptarPropuesta(41)'); await ticks();
    assert.equal(Q.elems.chError.textContent, Q.ev('SP.NUBE_CAIDA'));
    assert.ok(!/internet/.test(Q.elems.chError.textContent));
    assert.equal(Q.ev('SOL.estado'), 'contrapropuesta');
  });
});


/* ==========================================================================
 * 4. UN SOLO LATIDO, Y EN CRÉDITOS TRAE LA SOLICITUD
 * ======================================================================== */
describe('PlataChat con reloj: el latido sigue siendo uno', () => {

  test('abrir Chats deja UN temporizador de 20 s; su tic trae el hilo Y la solicitud en Créditos; en Servicio solo el hilo', async () => {
    const n = nubeViva(solNueva());
    const P = await abrirConCuenta(n);
    /* Los temporizadores que ya estaban antes de abrir Chats (los dos de la
       bienvenida, de una sola vez, que el arnés nunca dispara) no cuentan:
       lo que se mide es lo que ARMA abrir Chats y lo que queda vivo después. */
    const deAntes = new Set(P.pendientes().map(t => t.id));
    const sondeos = () => P.pendientes().filter(t => !deAntes.has(t.id));
    P.ev('irA("chats")');
    await ticks();
    assert.equal(P.pendientes(20000).length, 1, 'abrir Chats no dejó exactamente un latido');
    assert.equal(sondeos().length, 1, 'hay otro sondeo vivo además del latido: la solicitud NO puede tener el suyo');
    /* 15-sep-2026: sondeos() ya cuenta los setInterval (el arnés los anota);
       esta aserción solo le pone nombre al fallo si alguien mete uno. */
    assert.equal(P.pendientes().filter(t => t.intervalo).length, 0, 'hay un setInterval vivo: el sondeo permanente que la fase prohíbe');
    let hilos = cuantas(n, 'chat_leer_sesion'), sols = cuantas(n, 'mi_solicitud_platachat');
    P.disparar(P.pendientes(20000)[0]);
    await ticks();
    assert.equal(cuantas(n, 'chat_leer_sesion'), hilos + 1, 'el tic no trajo el hilo');
    assert.equal(cuantas(n, 'mi_solicitud_platachat'), sols + 1, 'el tic en Créditos no trajo la solicitud');
    assert.equal(P.pendientes(20000).length, 1, 'el tic no reprogramó UN latido');
    assert.equal(sondeos().length, 1);
    /* En Servicio el mismo latido no pregunta por la solicitud. */
    P.ev('setCanal("servicio")');
    await ticks();
    assert.equal(P.pendientes(20000).length, 1, 'cambiar de canal sumó un latido');
    hilos = cuantas(n, 'chat_leer_sesion'); sols = cuantas(n, 'mi_solicitud_platachat');
    P.disparar(P.pendientes(20000)[0]);
    await ticks();
    assert.equal(cuantas(n, 'chat_leer_sesion'), hilos + 1);
    assert.equal(cuantas(n, 'mi_solicitud_platachat'), sols, 'en Servicio el tic preguntó por la solicitud');
    /* Volver a Créditos pregunta de una (una traída, no un temporizador). */
    P.ev('setCanal("creditos")');
    await ticks();
    assert.equal(cuantas(n, 'mi_solicitud_platachat'), sols + 1);
    assert.equal(sondeos().length, 1);
    /* Al salir de Chats y al salir de la cuenta, ningún sondeo queda vivo. */
    P.ev('irA("plata")');
    assert.equal(sondeos().length, 0);
    P.ev('irA("chats")'); await ticks();
    P.ev('salir()');
    assert.equal(sondeos().length, 0);
    assert.equal(P.ev('SOL'), null, 'salir no limpió SOL');
    assert.equal(P.ev('RELOJ_OK'), false, 'salir no apagó RELOJ_OK');
  });

  test('una traída que falla no borra la propuesta que el cliente mira (5xx, sin red); solo el 404 la deja en null', async () => {
    /* 15-sep-2026: el título prometía «5xx, sin red» y el cuerpo solo hacía un
       500 una vez; y la nube del arnés SIEMPRE resuelve el fetch, así que
       ningún camino hacía que rechazara. Un 502 del proxy (Supabase caído
       detrás de Cloudflare) o el celular sin señal en cada latido borraban la
       tarjeta sin que nadie lo viera (mutaciones `e.estado === 502` y `e.red`
       en traerSolicitud, en verde). Se recorren los estados como en la
       prueba de pedir, y se hace que el fetch RECHACE, que es lo que SP.rpc
       marca red:true. abrirConCuenta(n) solo usa n.red: el envoltorio basta,
       sin tocar el arnés. */
    let modo = 'ok', sinRed = false;
    const base = nubeViva(solContra('automatica_1h'), fn => {
      if (fn !== 'mi_solicitud_platachat' || modo === 'ok') return null;
      return { __estado: Number(modo) };
    });
    const n = { red: (url, cfg) => (sinRed && /mi_solicitud_platachat/.test(String(url))
      ? Promise.reject(new Error('sin red')) : base.red(url, cfg)), llamadas: base.llamadas };
    const P = await abrirConCuenta(n);
    assert.equal(P.ev('SOL.id'), 41);
    /* Todo lo que la nube contesta cuando no puede (5xx y el 429 del límite)
       se ignora: la tarjeta que el cliente mira no se borra. `SOL && SOL.id`
       para que el rojo diga la frase humana y no «Cannot read properties of null». */
    for (const estado of [500, 502, 503, 429]) {
      modo = String(estado);
      await P.ev('traerSolicitud()');
      assert.equal(P.ev('SOL && SOL.id'), 41, 'un ' + estado + ' en el latido le quitó la propuesta al cliente');
      assert.equal(P.ev('RELOJ_OK'), true, estado + ' apagó RELOJ_OK');
    }
    /* Sin señal tampoco: el fetch rechaza y la tarjeta sigue. */
    modo = 'ok'; sinRed = true;
    await P.ev('traerSolicitud()');
    assert.equal(P.ev('SOL && SOL.id'), 41, 'sin red el latido le quitó la propuesta al cliente');
    assert.equal(P.ev('RELOJ_OK'), true, 'sin red apagó RELOJ_OK');
    sinRed = false;
    modo = '404';
    await P.ev('traerSolicitud()');
    assert.equal(P.ev('SOL'), null, 'con la migración sin correr SOL tiene que ser null');
    /* Y la respuesta de otra sesión se bota: si el cliente salió mientras venía. */
    const m = nubeViva(solNueva(), fn => (fn === 'mi_solicitud_platachat' ? { __colgar: true, ok: true, solicitud: solNueva() } : null));
    const Q = abrirPlataChat({ red: m.red });
    Q.ev(SESION_FALSA);
    Q.ev('traerSolicitud()');
    await ticks();
    Q.ev('salir()');
    m.colgadas[0]();
    await ticks();
    assert.equal(Q.ev('SOL'), null, 'la traída de una sesión cerrada resucitó la solicitud');
  });

  test('los <script> inline siguen compilando y pintarPropuesta no repinta si el HTML no cambió (los botones no parpadean)', async () => {
    const inline = [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    inline.forEach((m, i) => assert.doesNotThrow(() => new vm.Script(m[1], { filename: 'platachat#' + i })));
    const n = nubeViva(solContra('joan'));
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")');
    await ticks();
    const caja = P.elems.chPropuesta;
    const html = caja.innerHTML;
    assert.ok(html.length > 200);
    /* Se marca la caja y se vuelve a pintar lo mismo: la marca sigue, no se reescribió. */
    caja.innerHTML = 'MARCA';
    P.ev('pintarPropuesta()');
    assert.equal(caja.innerHTML, 'MARCA', 'repintó el mismo HTML: cada latido rehace los botones bajo el dedo');
    assert.equal(caja.__tarjeta, html);
    /* Con otra solicitud sí cambia. */
    P.ev('SOL = ' + JSON.stringify(solAceptada()) + '; pintarPropuesta()');
    assert.match(caja.innerHTML, /Aceptaste/);
  });
});


/* ==========================================================================
 * 5. EL BOTÓN DE PLATA CAMBIA CON LA SOLICITUD
 * ======================================================================== */
describe('PlataChat con reloj: el botón de Plata', () => {

  test('sin solicitud: «Pedir $X por el chat»; la hora se promete SOLO cuando la base contestó al reloj (RELOJ_OK)', async () => {
    const n = nubeViva(null, fn => (/_platachat$/.test(fn) ? { __estado: 404 } : null));
    const P = await abrirConCuenta(n);
    P.ev('setMonto(100000)');
    let s = P.elems.calcSalida.innerHTML;
    assert.match(s, /onclick="pedirPorChat\(100000,'\d{4}-\d{2}-\d{2}',\d+,1\)">Pedir \$100\.000 por el chat</);
    assert.ok(s.indexOf(P.ev('FRASE_HOY')) >= 0, 'sin reloj en la base no dice la frase de hoy');
    assert.ok(s.indexOf(P.ev('FRASE_RELOJ')) < 0, 'promete la hora con la migración sin correr');
    assert.ok(!/(una|1) hora/.test(s));
    /* La base contesta al reloj: ahora sí. */
    const m = nubeViva(null);
    const Q = await abrirConCuenta(m);
    assert.equal(Q.ev('RELOJ_OK'), true, 'mi_solicitud_platachat contestó ok y RELOJ_OK sigue apagado');
    Q.ev('setMonto(100000)');
    s = Q.elems.calcSalida.innerHTML;
    assert.match(s, /Pedir \$100\.000 por el chat</);
    assert.ok(s.indexOf(Q.ev('FRASE_RELOJ')) >= 0, 'con la base contestando no promete la hora');
    /* 15-sep-2026: antes se clavaba el literal «…te contestan por el chat de
       Créditos antes de una hora…». La espera de verdad vive en
       politica_app.espera_minutos, que va de 1 a 1440 y se cambia desde el
       CRM sin tocar código: el día que Joan la pusiera en 180, el botón
       seguiría diciendo «antes de una hora» y la tarjeta del hilo diría
       «antes de las 6:40 p. m.» — dos verdades, y la del botón salida de un
       literal que nadie actualiza. Así que se clava la PROPIEDAD y no la
       frase: ni un plazo escrito en ninguna parte, y remite a la hora límite,
       que es la que la base sí cumple. Clavar el literal era además lo que
       hacía roja esta prueba en cuanto la página se arreglaba. */
    const frase = Q.ev('FRASE_RELOJ');
    assert.ok(!/\b(un|una|dos|tres|media|\d+)\s*(hora|horas|minuto|minutos|día|días)\b/i.test(frase),
      'FRASE_RELOJ escribe un plazo fijo que politica_app.espera_minutos puede desmentir hoy mismo: «' + frase + '»');
    assert.match(frase, /hora límite/, 'FRASE_RELOJ no remite a la hora límite, que es la única verdad que la base cumple');
    assert.match(frase, /Créditos/, 'FRASE_RELOJ no dice por dónde le contestan');
    assert.match(frase, /automático/, 'FRASE_RELOJ ya no dice que si nadie alcanza contesta el automático');
    assert.ok(!/\d\s?%/.test(s));
  });

  test('con una solicitud abierta: «Cambiar mi solicitud a $Y» y la tarjeta «Tienes una solicitud en curso» arriba de la calculadora', async () => {
    const n = nubeViva(solNueva());
    const P = await abrirConCuenta(n);
    assert.equal(P.ev('TAB'), 'plata');
    /* Dentro del cupo (145.000): por encima la calculadora no da «para cuándo» y el botón va sin días. */
    P.ev('setMonto(120000)');
    const s = P.elems.calcSalida.innerHTML;
    assert.match(s, /onclick="pedirPorChat\(120000,'\d{4}-\d{2}-\d{2}',\d+,1\)">Cambiar mi solicitud a \$120\.000</);
    assert.ok(!/ disabled/.test(s.slice(0, s.indexOf('Cambiar mi solicitud'))), 'el botón de cambiar está apagado');
    assert.ok(s.indexOf(P.ev('FRASE_RELOJ')) >= 0);
    /* La tarjeta en curso llegó sola (traerSolicitud la repinta en su caja). */
    const t = P.elems.plSolicitud.innerHTML;
    assert.match(t, /Tienes una solicitud en curso: <b>\$100\.000<\/b> · te contestamos (mañana |el \d{1,2} \w{3} )?antes de las \d{1,2}:\d{2} (a|p)\. m\./);
    assert.match(t, /onclick="CANAL='creditos';irA\('chats'\)">Verla en Créditos</);
    /* Y al rehacer Plata, la tarjeta va dentro del cuerpo. */
    P.ev('irA("plata")');
    assert.match(P.elems.cuerpo.innerHTML, /<div id="plSolicitud"><div class="card"><div class="etq">Créditos<\/div>[\s\S]*?Tienes una solicitud en curso/);
    /* Con una contrapropuesta delante, el estado en palabras cambia. */
    P.ev('SOL = ' + JSON.stringify(solContra('joan')) + '; irA("plata")');
    assert.match(P.elems.cuerpo.innerHTML, /Tienes una solicitud en curso: <b>\$100\.000<\/b> · tienes una propuesta para mirar/);
    assert.match(P.elems.calcSalida.innerHTML, /Cambiar mi solicitud a \$120\.000</);
    /* Por encima del cupo también se puede cambiar (lo revisa una persona), sin días en el botón. */
    P.ev('setMonto(150000)');
    assert.match(P.elems.calcSalida.innerHTML, /onclick="pedirPorChat\(150000,'\d{4}-\d{2}-\d{2}',null,1\)">Cambiar mi solicitud a \$150\.000</);
  });

  test('aceptada: el botón se apaga y dice «Ya aceptaste $X: espera la entrega»; atendida o descartada vuelven a «Pedir»', async () => {
    const n = nubeViva(solAceptada());
    const P = await abrirConCuenta(n);
    P.ev('setMonto(100000)');
    const s = P.elems.calcSalida.innerHTML;
    assert.match(s, /<button type="button" class="btn marca" style="[^"]*" disabled onclick="pedirPorChat\([^)]*\)">Ya aceptaste \$100\.000: espera la entrega<\/button>/);
    assert.match(s, /Te la entregamos por [^<]+ y te avisamos por el chat de Créditos\./);
    assert.ok(s.indexOf(P.ev('FRASE_RELOJ')) < 0, 'con una aceptada sigue prometiendo otra respuesta en una hora');
    assert.match(P.elems.plSolicitud.innerHTML, /aceptada, esperando la entrega/);
    P.ev('SOL = ' + JSON.stringify(solNueva({ estado: 'atendida' })) + '; irA("plata")');
    assert.match(P.elems.calcSalida.innerHTML, /Pedir \$100\.000 por el chat</);
    assert.ok(P.elems.cuerpo.innerHTML.indexOf('Tienes una solicitud en curso') < 0, 'una atendida sigue «en curso»');
    P.ev('SOL = ' + JSON.stringify(solNueva({ estado: 'descartada' })) + '; irA("plata")');
    assert.match(P.elems.calcSalida.innerHTML, /Pedir \$100\.000 por el chat</);
  });

  test('«Proponer otra cifra» vuelve a Plata; «Verla en Créditos» va al canal de Créditos', async () => {
    const n = nubeViva(solContra('automatica_1h'));
    const P = await abrirConCuenta(n);
    P.ev('irA("chats")'); await ticks();
    P.ev('proponerOtraCifra()');
    assert.equal(P.ev('TAB'), 'plata');
    assert.match(P.elems.calcSalida.innerHTML, /Cambiar mi solicitud a/);
    P.ev('setCanal("servicio"); irA("plata")');
    P.ev("CANAL='creditos';irA('chats')");
    await ticks();
    assert.equal(P.ev('TAB'), 'chats');
    assert.equal(P.ev('CANAL'), 'creditos');
    assert.match(P.elems.chPropuesta.innerHTML, /Propuesta automática/);
  });
});


/* ==========================================================================
 * 5b. LA POLÍTICA DE LA APP MANDA SOBRE LOS LITERALES DE LA PÁGINA
 * ======================================================================== */
describe('PlataChat con reloj: la calculadora cotiza con politica_platachat', () => {

  /* A propósito, NINGUNA de estas cifras coincide con la constante que la
     página usaría sin política: si la prueba pasara igual con POL vacío,
     no estaría midiendo nada. */
  const POLITICA = { capital_tope: 300000, costo_pct: 30, dias: 10, costo_pct_cupo: 25,
                     capital_minimo: 80000, capital_maximo: 1500000, espera_minutos: 180,
                     con_garantia: 'estandar', texto: 'Este es tu primer crédito.' };

  test('la política llega al abrir la cuenta y la calculadora cotiza con ELLA, no con los literales', async () => {
    /* 15-sep-2026 — CONTRATO NUEVO. La base firma el precio con politica_app
       (resolver_vencidas y solicitar_platachat leen `pol`), y politica_app se
       cambia desde el CRM sin tocar código. La calculadora cotizaba con
       literales (35 %, 100.000, 8 días) que coincidían por CASUALIDAD: el día
       que Joan pusiera 30 % o 10 días, la calculadora enseñaría «$135.000 el
       23 sep» y la tarjeta del hilo «$130.000 el 25 sep» — dos cifras para lo
       mismo, en la misma pantalla. */
    const n = nubeViva(null, fn => (fn === 'politica_platachat' ? { ok: true, politica: POLITICA } : null));
    const P = await abrirConCuenta(n);
    assert.ok(cuantas(n, 'politica_platachat') >= 1, 'abrir la cuenta no pregunta la política: la calculadora cotiza con literales');
    assert.deepEqual(P.ev('POL'), POLITICA, 'la política que contestó la base no quedó guardada');
    assert.equal(P.ev('topeNuevo()'), 300000, 'el tope del primer crédito no sale de la política');
    assert.equal(P.ev('tasaNuevo()'), 0.3, 'el precio del primer crédito no sale de la política');
    assert.equal(P.ev('diasNuevo()'), 10, 'los días del primer crédito no salen de la política');
    assert.equal(P.ev('capitalMinimo()'), 80000, 'el mínimo no sale de la política');
    assert.equal(P.ev('capitalMaximo()'), 1500000, 'el máximo no sale de la política');
    assert.equal(P.ev('esperaMinutos()'), 180, 'la espera no sale de la política');
    /* Y que ninguna de esas cifras sea, de casualidad, la constante. */
    assert.notEqual(POLITICA.capital_tope, R.TOPE_NUEVO);
    assert.notEqual(POLITICA.costo_pct / 100, R.TASA_NUEVO);
    assert.notEqual(POLITICA.dias, M.POLITICA_NUEVOS_DEF.dias);
    assert.notEqual(POLITICA.capital_minimo, M.MONTO_MINIMO);
    /* No se le pregunta en cada latido: es la política de la app, no del cliente. */
    P.ev('irA("chats")'); await ticks();
    const antes = cuantas(n, 'politica_platachat');
    P.disparar(P.pendientes(20000)[0]); await ticks();
    assert.equal(cuantas(n, 'politica_platachat'), antes, 'el latido vuelve a pedir la política en cada tic');
  });

  test('el plazo que promete el botón sale de espera_minutos, en palabras; sin política no lleva cifra', async () => {
    /* 15-sep-2026 — el otro lado del mismo hallazgo. La frase de debajo del
       botón decía «antes de una hora» como literal, y politica_app.espera_minutos
       va de 1 a 1440 y se cambia desde el CRM: con 180 el botón decía «una
       hora» y el hilo «antes de las 6:40 p. m.». Ahora el número se ARMA con
       la espera que la base mandó; se comprueba con tres esperas distintas
       para que un literal no pueda pasar por casualidad. */
    for (const [minutos, dice] of [[60, 'antes de una hora'], [180, 'antes de tres horas'], [90, 'antes de 90 minutos']]) {
      const n = nubeViva(null, fn => (fn === 'politica_platachat'
        ? { ok: true, politica: Object.assign({}, POLITICA, { espera_minutos: minutos }) } : null));
      const P = await abrirConCuenta(n);
      P.ev('setMonto(100000)');
      const frase = P.ev('FRASE_RELOJ');
      assert.ok(frase.indexOf(dice) >= 0, 'con espera_minutos = ' + minutos + ' el botón dice: «' + frase + '»');
      assert.ok(P.elems.calcSalida.innerHTML.indexOf(frase) >= 0,
        'la frase se armó pero el botón sigue enseñando la vieja: POL llega DESPUÉS del primer pintado');
    }
    /* Sin política no se sabe la espera: la frase va sin cifra, que es la
       única que no puede quedar desmentida. */
    const m = nubeViva(null, fn => (fn === 'politica_platachat' ? { __estado: 404 } : null));
    const Q = await abrirConCuenta(m);
    Q.ev('setMonto(100000)');
    const sinCifra = Q.ev('FRASE_RELOJ');
    assert.ok(!/\b(un|una|dos|tres|media|\d+)\s*(hora|horas|minuto|minutos|día|días)\b/i.test(sinCifra),
      'sin política la frase se inventa un plazo: «' + sinCifra + '»');
    assert.match(sinCifra, /hora límite/, 'sin cifra, la frase tiene que remitir a la hora límite que la base sí pone');
  });

  test('con 404 —o con la nube caída— la calculadora cae a las constantes del motor y NO inventa un aviso', async () => {
    /* La migración sin correr no puede dejar la calculadora en blanco ni
       mandar al cliente a revisar su internet: se cotiza con lo de siempre y
       la pantalla no dice nada nuevo. */
    for (const fallo of [{ __estado: 404, message: 'no existe' }, { __estado: 500 }]) {
      const n = nubeViva(null, fn => (fn === 'politica_platachat' ? fallo : null));
      const P = await abrirConCuenta(n);
      const cual = 'politica_platachat dio ' + fallo.__estado + ': ';
      assert.equal(P.ev('POL'), null, cual + 'POL quedó con algo');
      assert.equal(P.ev('topeNuevo()'), R.TOPE_NUEVO, cual + 'el tope del primer crédito no cayó a la constante');
      assert.equal(P.ev('tasaNuevo()'), R.TASA_NUEVO, cual + 'el precio del primer crédito no cayó a la constante');
      assert.equal(P.ev('diasNuevo()'), M.POLITICA_NUEVOS_DEF.dias, cual + 'los días no cayeron a la constante');
      assert.equal(P.ev('capitalMinimo()'), M.MONTO_MINIMO, cual + 'el mínimo no cayó a la constante');
      assert.equal(P.ev('esperaMinutos()'), 0, cual + 'sin política se inventa una espera en minutos');
      assert.equal(P.ev('AVISO_NUBE'), '', cual + 'puso un aviso arriba de la pantalla por algo que el cliente no puede arreglar');
      assert.equal(P.ev('SIN_NUBE'), false, cual + 'dijo «sin conexión» por la política');
      assert.equal(P.ev('RELOJ_OK'), true, cual + 'apagó el reloj, que contesta por su cuenta');
      P.ev('setMonto(100000)');
      assert.match(P.elems.calcSalida.innerHTML, /Pedir \$100\.000 por el chat</, cual + 'la calculadora dejó de ofrecer el botón');
    }
    /* Y sin señal tampoco: el fetch rechaza y la pantalla sigue igual. */
    const base = nubeViva(null);
    const n = { red: (url, cfg) => (/politica_platachat/.test(String(url))
      ? Promise.reject(new Error('sin red')) : base.red(url, cfg)), llamadas: base.llamadas };
    const Q = await abrirConCuenta(n);
    assert.equal(Q.ev('POL'), null, 'sin red POL quedó con algo');
    assert.equal(Q.ev('topeNuevo()'), R.TOPE_NUEVO, 'sin red el tope no cayó a la constante');
    assert.equal(Q.ev('AVISO_NUBE'), '', 'sin red la política puso un aviso propio');
  });
});


/* ==========================================================================
 * 6. LOS NOMBRES NUEVOS EXISTEN EN LA BASE
 * ======================================================================== */
describe('PlataChat con reloj: llama a la base por nombres que existen', () => {

  /* 15-sep-2026: politica_platachat() entra a la lista. Es la quinta y la
     única que no mueve nada: devuelve la politica_app de PlataChat para que
     la calculadora cotice con lo mismo que la base va a firmar. */
  const NUEVAS = ['solicitar_platachat', 'reproponer_platachat', 'mi_solicitud_platachat', 'aceptar_propuesta_platachat',
                  'politica_platachat'];

  test('las cinco funciones nuevas están en base/20261005_platachat_solicitud.sql y la página las llama por su nombre exacto', () => {
    assert.ok(existe(MIGRACION), 'no existe ' + MIGRACION);
    const sql = leer(MIGRACION);
    const definidas = new Set([...sql.matchAll(/create or replace function public\.([a-z_0-9]+)\s*\(/g)].map(m => m[1]));
    NUEVAS.forEach(fn => assert.ok(definidas.has(fn), MIGRACION + ' no define ' + fn));
    const p = sinComentarios(PAGINA);
    const llamadas = new Set([...p.matchAll(/\.rpc\(\s*CFG\s*,\s*SES\s*,\s*'([a-z_0-9]+)'/g)].map(m => m[1]));
    NUEVAS.forEach(fn => assert.ok(llamadas.has(fn), 'la página no llama a ' + fn));
    /* Y no llama a lo que es del equipo o de Joan. */
    ['contrapropuesta_gerente', 'contrapropuesta_solicitud', 'listar_solicitudes_abiertas', 'resolver_vencidas', 'politica_app_leer',
     'politica_app_guardar', 'avisos_destino_guardar', 'aviso_probar', 'avisos_recientes', 'mi_solicitud']
      .forEach(fn => assert.ok(!llamadas.has(fn), 'la app del cliente llama a ' + fn));
  });

  test('las firmas que la página manda son las de la base: mismos nombres de parámetro', () => {
    const sql = leer(MIGRACION);
    const params = fn => (new RegExp('create or replace function public\\.' + fn + '\\(([^)]*)\\)').exec(sql) || [, ''])[1]
      .split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    assert.deepEqual(params('solicitar_platachat'), ['p_capital', 'p_fecha_pago', 'p_cortes']);
    assert.deepEqual(params('reproponer_platachat'), ['p_id', 'p_capital', 'p_fecha_pago', 'p_cortes', 'p_texto']);
    assert.deepEqual(params('aceptar_propuesta_platachat'), ['p_id']);
    assert.deepEqual(params('mi_solicitud_platachat'), []);
    assert.deepEqual(params('politica_platachat'), []);
    const p = sinComentarios(PAGINA);
    assert.match(p, /'solicitar_platachat', \{ p_capital: [^}]*, p_fecha_pago: [^}]*, p_cortes: [^}]* \}/);
    assert.match(p, /'reproponer_platachat', \{ p_id: [^}]*, p_capital: [^}]*, p_fecha_pago: [^}]*, p_cortes: [^}]*, p_texto: '' \}/);
    assert.match(p, /'aceptar_propuesta_platachat', \{ p_id: Number\(id\) \}/);
  });
});


/* ==========================================================================
 * 7. LAS REGLAS PURAS: quienPropone y horaLimiteEnPalabras
 * ======================================================================== */
describe('platachat-reglas.js: quién propone y la hora límite en palabras', () => {

  test('quienPropone: gerente:… es equipo; joan y panel son panel; automatica, automatica_1h, vacío y lo desconocido son máquina', () => {
    assert.deepEqual(R.quienPropone('gerente:3001234567'), { clave: 'equipo', titulo: 'Tu gerente te propone' });
    assert.deepEqual(R.quienPropone(' GERENTE:3001234567 '), { clave: 'equipo', titulo: 'Tu gerente te propone' });
    assert.deepEqual(R.quienPropone('joan'), { clave: 'panel', titulo: 'PlataChat te propone' });
    assert.deepEqual(R.quienPropone(' Joan '), { clave: 'panel', titulo: 'PlataChat te propone' });
    assert.deepEqual(R.quienPropone('panel'), { clave: 'panel', titulo: 'PlataChat te propone' });
    assert.deepEqual(R.quienPropone('automatica_1h'), { clave: 'automatico', titulo: 'Propuesta automática' });
    assert.deepEqual(R.quienPropone('automatica'), { clave: 'automatico', titulo: 'Propuesta automática' });
    /* Ante la duda, máquina: llamar persona a lo que quizá firmó una máquina
       rompe la promesa de la piel; al revés solo es menos cálido. */
    [null, undefined, '', 'gerente', 'algo-nuevo', 42].forEach(v =>
      assert.equal(R.quienPropone(v).clave, 'automatico', 'un `por` desconocido (' + v + ') no es máquina'));
    assert.ok(!/%/.test(R.quienPropone('joan').titulo + R.quienPropone('x').titulo + R.quienPropone('gerente:1').titulo));
  });

  test('horaLimiteEnPalabras: hoy, mañana y otro día, en hora de Colombia, con «a. m.»/«p. m.» de espacios normales', () => {
    const ahora = '2026-09-15T15:00:00-05:00';        /* martes 3 p. m. en Bogotá */
    assert.equal(R.horaLimiteEnPalabras('2026-09-15T20:40:00Z', ahora), 'antes de las 3:40 p. m.');
    assert.equal(R.horaLimiteEnPalabras('2026-09-16T13:05:00Z', ahora), 'mañana antes de las 8:05 a. m.');
    assert.equal(R.horaLimiteEnPalabras('2026-09-17T13:05:00Z', ahora), 'el 17 sep antes de las 8:05 a. m.');
    assert.equal(R.horaLimiteEnPalabras('2026-10-02T13:05:00Z', ahora), 'el 2 oct antes de las 8:05 a. m.');
    /* Mediodía y medianoche en doce horas. */
    assert.equal(R.horaLimiteEnPalabras('2026-09-15T12:00:00-05:00', '2026-09-15T11:00:00-05:00'), 'antes de las 12:00 p. m.');
    assert.equal(R.horaLimiteEnPalabras('2026-09-15T00:05:00-05:00', '2026-09-14T23:30:00-05:00'), 'mañana antes de las 12:05 a. m.');
    /* Los espacios de «p. m.» son espacios normales, no los de ICU. */
    const s = R.horaLimiteEnPalabras('2026-09-15T20:40:00Z', ahora);
    assert.ok(!/[  ]/.test(s), 'trae espacios que no se rompen: un copiar y pegar no los reconoce');
  });

  test('horaLimiteEnPalabras: la trampa de UTC (a las 19:30 de Bogotá el servidor ya está en mañana) y el cambio de mes', () => {
    /* 8:30 p. m. de Bogotá = 01:30Z del día siguiente: sigue siendo HOY. */
    assert.equal(R.horaLimiteEnPalabras('2026-09-16T01:30:00Z', '2026-09-15T19:30:00-05:00'), 'antes de las 8:30 p. m.');
    /* 30 sep 11:30 p. m. → 1 oct 12:30 a. m. es «mañana», no «el 1 oct» ni «el 31 sep». */
    assert.equal(R.horaLimiteEnPalabras('2026-10-01T00:30:00-05:00', '2026-09-30T23:30:00-05:00'), 'mañana antes de las 12:30 a. m.');
    /* Con otra zona el mismo instante cambia de hora. */
    assert.equal(R.horaLimiteEnPalabras('2026-09-15T20:40:00Z', ahoraUTC(), 'UTC'), 'antes de las 8:40 p. m.');
    function ahoraUTC() { return '2026-09-15T15:00:00Z'; }
    /* Basura: se rechaza con nombre, no se devuelve una hora inventada. */
    assert.throws(() => R.horaLimiteEnPalabras('basura', ahoraUTC()), /isoLimite/);
    assert.throws(() => R.horaLimiteEnPalabras('2026-09-15T20:40:00Z', 'basura'), /isoAhora/);
    assert.throws(() => R.horaLimiteEnPalabras('2026-09-15T20:40:00Z', ahoraUTC(), ''), /zona/);
    assert.throws(() => R.horaLimiteEnPalabras(null, ahoraUTC()), TypeError);
  });

  test('no miran el reloj de pared: el AHORA entra por parámetro; ni Date.now ni new Date en el módulo', () => {
    assert.doesNotMatch(FUENTE_REGLAS, /Date\.now/, 'usa Date.now');
    assert.doesNotMatch(FUENTE_REGLAS, /new\s+Date\b/, 'construye una fecha con el reloj de pared');
    const seccion7 = FUENTE_REGLAS.slice(FUENTE_REGLAS.indexOf('7. QUIÉN PROPONE'));
    assert.ok(seccion7.length > 500, 'no encontré la sección 7 en platachat-reglas.js');
    assert.match(seccion7, /function quienPropone\(por\)/);
    assert.match(seccion7, /function horaLimiteEnPalabras\(isoLimite, isoAhora, zona\)/);
    assert.match(seccion7, /timeZone: zona/, 'no formatea con la zona que le pasan');
    /* La misma entrada, la misma salida, sin importar cuándo se corra. */
    const a = R.horaLimiteEnPalabras('2026-09-16T13:05:00Z', '2026-09-15T15:00:00-05:00');
    R.quienPropone('joan'); R.horaLimiteEnPalabras('2026-09-15T20:40:00Z', '2026-09-15T15:00:00-05:00');
    assert.equal(R.horaLimiteEnPalabras('2026-09-16T13:05:00Z', '2026-09-15T15:00:00-05:00'), a);
    /* Y las dos salen exportadas también en el navegador (window.PlataChatReglas). */
    const ventana = {}; ventana.window = ventana;
    vm.runInNewContext(FUENTE_REGLAS, ventana, { filename: 'platachat-reglas.js' });
    assert.equal(typeof ventana.PlataChatReglas.quienPropone, 'function');
    assert.equal(typeof ventana.PlataChatReglas.horaLimiteEnPalabras, 'function');
  });

  test('la página pasa SU ahora y la zona por defecto es Bogotá: la hora de la tarjeta es la de platachat-reglas.js', () => {
    const p = sinComentarios(PAGINA);
    assert.match(p, /R\.horaLimiteEnPalabras\(iso, ahora\)/, 'la página no le pasa el ahora a horaLimiteEnPalabras');
    assert.match(p, /R\.quienPropone\(por\)/);
    assert.match(FUENTE_REGLAS, /var ZONA_COLOMBIA = 'America\/Bogota';/);
    assert.match(FUENTE_REGLAS, /var z = zona == null \? ZONA_COLOMBIA : zona;/);
  });
});
