'use strict';
/* ==========================================================================
 * EL «SALIR» DE PLATACHAT SALE DE VERDAD — 21-oct-2026 (H3)
 *
 *   node --test pruebas/platachat-sale-de-verdad.test.js
 *
 * La verificación de f1bcfde lo confirmó con la página REAL de PlataChat (y ya
 * pasaba en main): María abre su cuenta por play/?marca=platachat en la misma
 * pestaña; el registro guarda su sesión entera (con el refresh_token) en
 * play_sesion y se la pasa a PlataChat. Ella usa PlataChat y toca «Salir»:
 * salir() solo borraba platachat_sesion. Pedro, en el mismo teléfono y la
 * misma pestaña, toca «Abrir mi cuenta»: el arranque de play/ encontraba la
 * sesión de María, la volvía a pasar, y PlataChat se le abría DENTRO de la
 * cuenta de ella (su crédito, su chat, sus datos). Lo mismo play/ sin la
 * marca y app/socio.html, que también adoptan play_sesion.
 *
 * Aquí corren las dos páginas de verdad, con los dos almacenes compartidos
 * como en una sola pestaña: el registro de play/, PlataChat con su salir(), y
 * otra vez play/. Todas FALLAN con las páginas de f1bcfde.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./banco-registro.js');
const SS = require('../app/sesion-socio.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PAGINA = leer('platachat/index.html');

/* PlataChat de verdad, con el localStorage y el sessionStorage de la pestaña. */
function abrirPlataChat(almacen, sesion, llamadas) {
  const elems = {};
  const elem = id => (elems[id] = elems[id] || { id, value: '', checked: false, textContent: '', innerHTML: '', dataset: {}, style: {},
    disabled: false, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], appendChild() {}, insertBefore() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, click() {}, getContext: () => null, scrollIntoView() {} });
  const doc = { getElementById: elem, querySelector: () => null, querySelectorAll: () => [], createElement: () => elem('c' + Math.random()),
    addEventListener() {}, head: elem('head'), body: elem('body'), documentElement: elem('html'), title: '', hidden: false };
  const red = (url, cfg) => {
    const h = (cfg && cfg.headers) || {};
    llamadas.push({ url: String(url), metodo: (cfg && cfg.method) || 'GET', auth: String(h.Authorization || '') });
    const fn = (/rpc\/([a-z_0-9]+)/.exec(url) || [, ''])[1];
    const r = fn === 'mi_cuenta' ? { ok: true, vinculada: false, nombre: 'Maria' } : { ok: true };
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(r)), json: () => Promise.resolve(r) });
  };
  const ctx = { console, document: doc, alert() {}, confirm: () => true,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); }, removeItem: k => { delete almacen[k]; } },
    sessionStorage: { getItem: k => (k in sesion ? sesion[k] : null), setItem: (k, v) => { sesion[k] = String(v); }, removeItem: k => { delete sesion[k]; } },
    location: { href: 'https://tugarantia.net/platachat/', hash: '', hostname: 'tugarantia.net', pathname: '/platachat/', search: '', protocol: 'https:',
      host: 'tugarantia.net', origin: 'https://tugarantia.net', reload() {}, replace() {} },
    history: { replaceState() {} }, navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() } },
    fetch: red, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    Image: class {}, FileReader: class {}, Blob: class {}, File: class {}, open() {}, scrollTo() {}, performance: { now: () => 0 },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  /* 23-oct-2026 — sin la versión de la dirección (…?v=139, ver sw.js). */
  [...PAGINA.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].split('?')[0])
    .forEach(s => vm.runInContext(leer(path.join('platachat', s)), ctx, { filename: s }));
  [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'pc#' + i }));
  return { ev: e => vm.runInContext(e, ctx), elems };
}
const tokenDe = j => { try { return JSON.parse(j || 'null').access_token; } catch (e) { return null; } };
const almacenSesion = sesion => ({ getItem: k => (k in sesion ? sesion[k] : null) });
const CON_LA_MARCA = '?marca=platachat';

/* María abre su cuenta con la marca: el registro termina en PlataChat. */
async function mariaAbreSuCuentaEnPlataChat(almacen, sesion) {
  const A = B.abrir({ search: CON_LA_MARCA, almacen, sesion });
  B.nube(A);
  B.mariaHastaElPermiso(A, false);
  B.tocar(A, 'Abrir mi cuenta');
  await B.asentar(20);
  assert.equal(A.ev('location.href'), '../platachat/index.html', 'el registro no terminó en PlataChat: ' + B.texto(B.caja(A)));
  const tok = tokenDe(almacen.platachat_sesion);
  assert.match(tok || '', /573001112233/, 'PlataChat no recibió la sesión de María');
  return tok;
}

describe('H3 — después del «Salir» de PlataChat, la pestaña no le abre a nadie la cuenta de María', () => {

  test('H3 — play/ suelta su copia en cuanto pasa la sesión a PlataChat', async () => {
    const almacen = {}, sesion = {};
    await mariaAbreSuCuentaEnPlataChat(almacen, sesion);
    assert.equal(sesion.play_sesion, undefined,
      'la sesión de María (con su refresh_token) se quedó en la pestaña después de pasarla a PlataChat');
  });

  test('H3 — de punta a punta: registro con la marca → PlataChat → «Salir» → «Abrir mi cuenta» en la misma pestaña pinta el registro, sin la sesión de María en ningún almacén', async () => {
    const almacen = {}, sesion = {};
    const tokMaria = await mariaAbreSuCuentaEnPlataChat(almacen, sesion);

    /* PlataChat de verdad abre con la sesión de María. */
    const llPC = [];
    const PC = abrirPlataChat(almacen, sesion, llPC);
    await B.asentar(20);
    assert.equal(PC.ev('SES && SES.access_token'), tokMaria, 'PlataChat no abrió con la sesión que le pasó el registro');
    assert.ok(llPC.some(x => /mi_cuenta/.test(x.url) && x.auth === 'Bearer ' + tokMaria));

    /* María toca «Salir». */
    const n0 = llPC.length;
    PC.ev('salir()');
    await B.asentar(5);
    const salio = llPC.slice(n0).filter(x => /\/auth\/v1\/logout/.test(x.url));
    assert.equal(salio.length, 1, 'el «Salir» de PlataChat no le avisó al servidor: el refresh_token de María sigue vivo');
    assert.equal(salio[0].auth, 'Bearer ' + tokMaria);
    assert.equal(salio[0].metodo, 'POST');
    assert.equal(almacen.platachat_sesion, undefined);
    assert.equal(sesion.play_sesion, undefined, 'después del «Salir» de PlataChat la sesión de María sigue en la pestaña');

    /* Pedro toca «Abrir mi cuenta» en la misma pestaña. */
    const C = B.abrir({ search: CON_LA_MARCA, almacen, sesion });
    B.nube(C);
    await B.asentar(20);
    assert.equal(C.ev('VISTA'), 'registro', 'no se pintó el registro: el arranque encontró una sesión (VISTA ' + C.ev('VISTA') + ')');
    assert.notEqual(C.ev('location.href'), '../platachat/index.html', 'el arranque mandó a Pedro a PlataChat');
    assert.equal(C.ev('SESION'), null);
    assert.equal(almacen.platachat_sesion, undefined, 'el arranque le volvió a escribir a PlataChat la sesión de María');
    assert.equal(new RegExp(tokMaria.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(JSON.stringify(almacen) + JSON.stringify(sesion)), false,
      'la sesión de María quedó en algún almacén de la pestaña');
    /* Y la app del socio, en esa misma pestaña, tampoco la adopta. */
    assert.equal(SS.deSesionDePlay(almacenSesion(sesion), Date.now()), null, 'app/socio.html adoptaría la sesión de María');
  });

  test('H3 — si la pestaña todavía tiene una copia de play/ (de antes de esta versión), «Salir» la cierra en el servidor y la borra', async () => {
    const almacen = { platachat_sesion: JSON.stringify({ access_token: 'tok-PC-MARIA', refresh_token: 'r1', celular: B.CEL_MARIA, expira: Date.now() / 1000 + 3600 }) };
    const sesion = { play_sesion: JSON.stringify({ access_token: 'tok-PLAY-MARIA', refresh_token: 'r2', expires_in: 3600, user: { email: B.CORREO_MARIA } }) };
    const llPC = [];
    const PC = abrirPlataChat(almacen, sesion, llPC);
    await B.asentar(20);
    const n0 = llPC.length;
    PC.ev('salir()');
    await B.asentar(5);
    const cerradas = llPC.slice(n0).filter(x => /\/auth\/v1\/logout/.test(x.url)).map(x => x.auth).sort();
    assert.deepEqual(cerradas, ['Bearer tok-PC-MARIA', 'Bearer tok-PLAY-MARIA'], 'no se cerraron las dos sesiones de la pestaña');
    assert.equal(sesion.play_sesion, undefined, 'la copia de play/ sobrevivió al «Salir»');
    assert.equal(SS.deSesionDePlay(almacenSesion(sesion), Date.now()), null);
  });

  test('H3, control — cuando la nube ya dijo que la sesión no vale, «Salir» no le avisa por ella (no hay a quién)', async () => {
    const almacen = {}, sesion = {};
    const llPC = [];
    const PC = abrirPlataChat(almacen, sesion, llPC);
    await B.asentar(5);
    PC.ev("SES = { access_token: 'tok-vencido', refresh_token: 'r', celular: '3001112233' }");
    const n0 = llPC.length;
    PC.ev("salir('Tu sesión venció, así que te pedimos entrar de nuevo.')");
    await B.asentar(5);
    assert.equal(llPC.slice(n0).filter(x => /logout/.test(x.url)).length, 0);
  });
});
