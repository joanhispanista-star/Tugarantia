'use strict';
/* ==========================================================================
 * UNA PÁGINA NUEVA NO CORRE CON UN .JS VIEJO — 23-oct-2026
 *
 *   node --test pruebas/la-pagina-nueva-no-corre-con-un-js-viejo.test.js
 *
 * Tres rondas seguidas encontraron el mismo defecto con otra cara: el CRM
 * nuevo con el app/puente.js de antes («Ajustar el próximo pago», e0ae61a; el
 * pie de Créditos y la hoja del abono, a12dae4) y el espejo nuevo con el
 * panel/nube.js de antes, que cobraba dos veces un pago acordado (1d0267f).
 * Cada una tapó UNA función con una reja. Las tres salen de dos ventanas que
 * ninguna página puede cerrar sola:
 *
 *   1. LA CACHÉ HTTP. GitHub Pages manda max-age=600: un .js pedido en los
 *      últimos diez minutos sale de la caché del navegador sin preguntarle a
 *      nadie. El sw.js publicado (v138) pide con fetch(req) a secas, así que
 *      el primer F5 después de publicar trae la página nueva (la navegación
 *      se revalida) con el .js de antes (los subrecursos no).
 *   2. LA CACHÉ DEL SERVICE WORKER. Con señal floja, el v138 contesta el .js
 *      que no bajó con el que guardó él: el de antes. Y manda hasta que el
 *      v139 toma el control.
 *
 * LA REGLA QUE VIGILAN, para CADA página y CADA .js propio que cambió entre
 * lo publicado (origin/main, o main) y lo de hoy:
 *
 *   · la página lo pide con la versión en la dirección (…?v=139, el número de
 *     CACHE de sw.js), todas con la MISMA dirección, y sw.js la precarga así;
 *   · en un teléfono que tenía v138 —su caché llena con lo de antes y la caché
 *     HTTP con lo de antes todavía fresco— esa dirección nunca devuelve el
 *     archivo de antes: con señal, con ese archivo fallando, sin señal con el
 *     v139 ya instalado, y sin señal con el v139 mandando (este último, además,
 *     comprueba que el uso sin red no se rompió);
 *   · si lo que llega no es el archivo (el v138 contesta index.html a lo que
 *     no guardó, o una caché que no mirara la versión devolviera el de antes),
 *     la página no arranca: dice que se recargue y corta al principio de su
 *     bloque grande, que es donde se escribe la plata y los datos. Lo que SÍ
 *     llegó y después revienta en un teléfono no es mezcla: la página sigue,
 *     como antes de este cambio.
 *
 * Con la dirección SIN versión (como la piden las páginas de main y como la
 * pedían las de hoy antes de este cambio) la misma simulación devuelve el
 * archivo de antes por las dos ventanas: las pruebas «control» lo muestran,
 * para que el verde de las demás no sea de un simulador que nunca mezcla.
 *
 * Nada de navegadores: el teléfono es un simulador de la caché HTTP (con su
 * max-age), de la red (con o sin señal, por dirección) y de CacheStorage, y
 * los service workers son el sw.js de verdad —el de lo publicado sacado con
 * git show, y el de hoy— corridos en un contexto aparte.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ORIGEN = 'https://tugarantia.net/';
const MAX_AGE = 600 * 1000;           // GitHub Pages: Cache-Control: max-age=600
const MARCA_GUARDIA = '/* 23-oct-2026 — ¿LLEGÓ LO QUE PEDÍ?';
const FIRMA = '(function () { try { var s = document.currentScript; if (s && s.src) '
  + '(window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();';
const sinCR = s => String(s).replace(/\r\n/g, '\n');

/* ---- lo publicado ------------------------------------------------------- */
function git(args, comoBuffer) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: comoBuffer ? 'buffer' : 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}
/* origin/main es lo que está en GitHub, o sea en tugarantia.net; si no hay
   remoto (una copia sin red), main. TG_PUBLICADO lo cambia a mano. */
const PUBLICADO = (() => {
  const candidatos = [process.env.TG_PUBLICADO, 'origin/main', 'main'].filter(Boolean);
  for (const c of candidatos) {
    try { git(['rev-parse', '--verify', '--quiet', c + '^{commit}']); return c; } catch (e) { /* el siguiente */ }
  }
  return null;
})();
const SIN_PUBLICADO = !PUBLICADO && 'sin origin/main ni main no hay con qué comparar lo de hoy';

const _main = new Map();
function deMain(ruta) {
  if (!_main.has(ruta)) {
    let b = null;
    try { b = git(['show', PUBLICADO + ':' + ruta], true); } catch (e) { b = null; }
    _main.set(ruta, b);
  }
  return _main.get(ruta);
}
function deHoy(ruta) {
  const f = path.join(RAIZ, ruta);
  return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null;
}
const leer = ruta => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');

/* ---- qué cambió --------------------------------------------------------- */
/* Los .js propios: los de app/, panel/, platachat/ y play/ (sin app/lib/, que
   son librerías de otros con su versión atada en ORIGEN.md). CAMBIADO es el
   que estaba publicado y hoy dice otra cosa: uno NUEVO no tiene versión de
   antes con la que mezclarse. */
const PROPIOS = ['app', 'panel', 'platachat', 'play'].flatMap(d =>
  fs.readdirSync(path.join(RAIZ, d)).filter(f => /\.js$/.test(f)).map(f => d + '/' + f));
const CAMBIADOS = PUBLICADO ? PROPIOS.filter(f => {
  const antes = deMain(f);
  return antes && sinCR(antes) !== sinCR(deHoy(f));
}) : [];

const SW_HOY = leer('sw.js');
const NUMERO = (/const CACHE = 'tugarantia-v(\d+)';/.exec(SW_HOY) || [])[1];
const SW_MAIN = PUBLICADO ? sinCR(deMain('sw.js') || '') : '';

/* ARCHIVOS de sw.js, sin comentarios: las direcciones tal cual se precargan. */
function archivosDe(sw) {
  const i = sw.indexOf('const ARCHIVOS = ['), j = sw.indexOf('].map(f => BASE + f)', i);
  const cuerpo = sw.slice(i + 'const ARCHIVOS = ['.length, j).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s,])\/\/[^\n]*/g, '$1');
  return [...cuerpo.matchAll(/'([^']*)'/g)].map(m => m[1]);
}
const PRECARGA = archivosDe(SW_HOY);
const PAGINAS_PRECARGADAS = new Set(PRECARGA.map(f => f === '' ? 'index.html' : f.replace(/\/$/, '/index.html')).filter(f => /\.html$/.test(f)));

/* ---- lo que cada página pide -------------------------------------------- */
const PAGINAS = git(['ls-files', '*.html']).split(/\r?\n/).filter(p => p && !p.startsWith('pruebas/'));
const resolver = (pagina, pedido) => path.posix.normalize(path.posix.join(path.posix.dirname(pagina), pedido.split(/[?#]/)[0]));
const versionDe = pedido => (/[?&]v=(\d+)/.exec(pedido) || [])[1] || null;

/* Los <script src> de verdad (fuera de comentarios HTML) y los .js que el
   código escrito en la página pide a mano (cargarScript, URL_…): los dos
   llegan por la misma red y las mismas cachés. */
function pedidosDe(pagina) {
  const html = leer(pagina).replace(/<!--[\s\S]*?-->/g, '');
  const estaticos = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g)]
    .map(m => ({ pagina, pedido: m[1], modo: 'estático' }));
  const escritos = [];
  for (const b of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const m of b[1].matchAll(/(['"`])((?:\.\.\/|\.\/)?[\w\-/.]+\.js(?:\?v=\d+)?)\1/g)) {
      escritos.push({ pagina, pedido: m[2], modo: 'a mano' });
    }
  }
  return estaticos.concat(escritos)
    .filter(p => !/^(https?:|\/\/)/.test(p.pedido))
    .map(p => Object.assign(p, { archivo: resolver(pagina, p.pedido) }));
}
const PEDIDOS = PAGINAS.flatMap(pedidosDe);
const PEDIDOS_CAMBIADOS = PEDIDOS.filter(p => CAMBIADOS.includes(p.archivo));
const urlDe = p => new URL(p.pedido, ORIGEN + p.pagina).href;
const rutaDeUrl = u => new URL(u).pathname.slice(1);

/* ==========================================================================
 * EL TELÉFONO: red, caché HTTP y CacheStorage
 * ======================================================================== */
function rutaServida(url) {
  let r = decodeURIComponent(new URL(url).pathname.slice(1));
  if (r === '' || r.endsWith('/')) r += 'index.html';
  return r;
}
/* GitHub Pages sirve el archivo e ignora el ?v=: la versión vive en la
   dirección, no en el servidor. */
function servir(servidor, url) {
  const r = rutaServida(url);
  return servidor === 'main' ? deMain(r) : deHoy(r);
}

class RequestRelativa extends Request {
  /* En un service worker, un pedido relativo se resuelve contra sw.js. */
  constructor(entrada, init) {
    super(typeof entrada === 'string' ? new URL(entrada, ORIGEN).href : entrada, init);
  }
}
const urlPedido = r => typeof r === 'string' ? new URL(r, ORIGEN).href : r.url;

class CacheFalsa {
  constructor(tel) { this.m = new Map(); this.tel = tel; }
  async match(req, o) {
    const u = urlPedido(req);
    let c = this.m.get(u);
    if (c == null && o && o.ignoreSearch) {
      for (const [k, v] of this.m) if (k.split('?')[0] === u.split('?')[0]) { c = v; break; }
    }
    return c == null ? undefined : new Response(c);
  }
  async put(req, res) { this.m.set(urlPedido(req), Buffer.from(await res.arrayBuffer())); }
  async add(req) {
    const r = await this.tel.fetch(req);
    if (!r.ok) throw new TypeError('add: ' + r.status);
    await this.put(req, r);
  }
}
class CacheStorageFalsa {
  constructor(tel) { this.c = new Map(); this.tel = tel; }
  async open(n) { if (!this.c.has(n)) this.c.set(n, new CacheFalsa(this.tel)); return this.c.get(n); }
  async keys() { return [...this.c.keys()]; }
  async delete(n) { return this.c.delete(n); }
  /* Como el de verdad: busca en TODAS las cachés del origen, en orden. */
  async match(req, o) {
    for (const c of this.c.values()) { const r = await c.match(req, o); if (r) return r; }
    return undefined;
  }
}

function telefono() {
  const tel = { servidor: 'main', ahora: 0, red: () => true, http: new Map() };
  tel.fetch = async (entrada, init) => {
    const req = entrada instanceof Request ? (init ? new RequestRelativa(entrada, init) : entrada)
      : new RequestRelativa(String(entrada), init);
    const url = req.url, modo = req.cache;
    const guardada = tel.http.get(url);
    /* 'default' acepta lo fresco sin preguntar; 'no-cache' y 'reload' van al
       servidor siempre (MDN, Request.cache). */
    if ((modo === 'default' || modo === 'force-cache') && guardada && tel.ahora - guardada.en < MAX_AGE) {
      return new Response(guardada.cuerpo);
    }
    if (!tel.red(url)) throw new TypeError('Failed to fetch (sin señal): ' + url);
    const cuerpo = servir(tel.servidor, url);
    if (cuerpo == null) return new Response('404', { status: 404 });
    if (modo !== 'no-store') tel.http.set(url, { cuerpo, en: tel.ahora });
    return new Response(cuerpo);
  };
  tel.caches = new CacheStorageFalsa(tel);
  return tel;
}
const asentar = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

function cargarSW(codigo, tel) {
  const oyentes = {};
  const self = {
    location: new URL(ORIGEN + 'sw.js'),
    addEventListener: (t, f) => { oyentes[t] = f; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };
  const ctx = vm.createContext({ self, caches: tel.caches, fetch: (a, b) => tel.fetch(a, b),
    Request: RequestRelativa, Response, URL, Promise, Set, Map, console });
  vm.runInContext(codigo, ctx, { filename: 'sw.js' });
  const esperar = async tipo => { let p; oyentes[tipo]({ waitUntil: x => { p = x; } }); await p; await asentar(); };
  return {
    instalar: () => esperar('install'),
    activar: () => esperar('activate'),
    /* Lo que la página recibe: la respuesta del service worker, o la de la
       red si el service worker la deja pasar. */
    async pedir(url) {
      const req = new RequestRelativa(url);
      let p = null;
      oyentes.fetch({ request: req, respondWith: x => { p = x; } });
      let res;
      try { res = p ? await p : await tel.fetch(req); } catch (e) { await asentar(); return { error: e.message }; }
      await asentar();
      if (!res) return { error: 'el service worker no contestó nada' };
      if (!res.ok) return { error: 'HTTP ' + res.status };
      return { cuerpo: Buffer.from(await res.arrayBuffer()) };
    }
  };
}

/* El teléfono de un cliente antes de publicar: el v138 instalado y mandando,
   con su caché llena de lo de antes (su precarga pide con 'reload', así que
   la caché HTTP también queda con lo de antes, fresca). Dos minutos después
   se publica: el servidor ya sirve lo de hoy. */
async function telefonoConV138() {
  const tel = telefono();
  const v138 = cargarSW(SW_MAIN, tel);
  await v138.instalar();
  await v138.activar();
  tel.ahora = 2 * 60 * 1000;
  tel.servidor = 'hoy';
  return { tel, v138 };
}

const igual = (a, b) => a != null && b != null && sinCR(a) === sinCR(b);

/* ==========================================================================
 * LA PÁGINA: sus <script src> y la guardia del bloque grande
 * ======================================================================== */
const sinComentariosHTML = html => html.replace(/<!--[\s\S]*?-->/g, '');
function bloquesDe(pagina) {
  const html = sinComentariosHTML(leer(pagina));
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m => {
    const src = (/\bsrc="([^"]+)"/.exec(m[1]) || [])[1];
    return src ? { src } : { codigo: m[2] };
  });
}
/* El bloque grande: el primer <script> escrito después del primer .js
   versionado. Lo que va antes no puede usar esos módulos. */
function bloqueGrande(pagina) {
  const bs = bloquesDe(pagina);
  const i = bs.findIndex(b => b.src && versionDe(b.src));
  if (i < 0) return null;
  const j = bs.findIndex((b, k) => k > i && b.codigo != null);
  return j < 0 ? null : { estaticos: bs.slice(0, j).filter(b => b.src).map(b => b.src), codigo: bs[j].codigo };
}
function guardiaDe(codigo) {
  const i = codigo.indexOf(MARCA_GUARDIA);
  if (i < 0) return null;
  const j = codigo.indexOf('\n})();', i);
  return j < 0 ? null : codigo.slice(i, j + '\n})();'.length);
}
/* index.html, la web pública, es la única con .js versionados que no lleva
   guardia: no escribe más que el monto y los días de su calculadora en ese
   teléfono, y su bloque ya se corta solo si la calculadora no llegó. Una
   pantalla de «recarga» encima de la portada le quitaría a un desconocido lo
   único que vino a leer. */
const SIN_GUARDIA = new Set(['index.html']);
const PAGINAS_CON_VERSION = PAGINAS.filter(p => bloquesDe(p).some(b => b.src && versionDe(b.src)));
const PAGINAS_GUARDADAS = PAGINAS_CON_VERSION.filter(p => !SIN_GUARDIA.has(p));

/* Corre los <script src> de antes del bloque grande con lo que «llegó» de
   cada uno, y después la guardia. `llego(archivo, pedido)` devuelve
   { cuerpo } o { error } (no llegó: no se ejecuta nada). */
function abrirPagina(pagina, llego, ajenos) {
  const bg = bloqueGrande(pagina);
  const guardia = guardiaDe(bg.codigo);
  const urlPagina = ORIGEN + pagina;
  const elementos = bg.estaticos.map(src => ({
    src: new URL(src, urlPagina).href,
    getAttribute: n => (n === 'src' ? src : null)
  }));
  /* <script> que no son de la página (los mete una extensión del navegador). */
  const extra = (ajenos || []).map(src => ({ src, getAttribute: n => (n === 'src' ? src : null) }));
  const puestos = [], oyentes = [];
  let recargas = 0;
  function nodo() {
    const boton = { onclick: null };
    const el = { style: {}, innerHTML: '', setAttribute() {}, querySelector: () => boton,
      contains: x => x === el || x === boton, boton };
    return el;
  }
  const doc = {
    currentScript: null,
    getElementsByTagName: n => (n === 'script' ? extra.concat(elementos) : []),
    createElement: () => nodo(),
    addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: x => { puestos.push(x); return x; } },
    documentElement: { appendChild: x => { puestos.push(x); return x; } }
  };
  const almacen = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document: doc,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13)', onLine: true },
    location: { href: urlPagina, hostname: 'tugarantia.net', protocol: 'https:', search: '', hash: '', reload() { recargas++; } },
    localStorage: { getItem: k => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)), removeItem: k => almacen.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URL, TextEncoder, TextDecoder, Intl, Math, JSON, Date
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.addEventListener = (tipo, fn, captura) => oyentes.push({ tipo, fn, captura });
  vm.createContext(ctx);
  bg.estaticos.forEach((src, k) => {
    const r = llego(resolver(pagina, src), src);
    if (!r || r.error) return;                 // no llegó: el navegador no ejecuta nada
    doc.currentScript = elementos[k];
    try { vm.runInContext(sinCR(r.cuerpo), ctx, { filename: src }); } catch (e) { /* index.html como .js: SyntaxError */ }
    doc.currentScript = null;
  });
  let arranca = true, error = null;
  try { vm.runInContext(guardia, ctx, { filename: pagina + ' (guardia)' }); } catch (e) { arranca = false; error = e; }
  return { arranca, error, ctx, puestos, oyentes, recargas: () => recargas,
    aMedias: ctx.TG_A_MEDIAS ? Array.from(ctx.TG_A_MEDIAS) : null };
}
const todoDeHoy = archivo => ({ cuerpo: deHoy(archivo) });

/* ========================================================================== */
describe('0 · Lo que cambió desde lo publicado', { skip: SIN_PUBLICADO }, () => {

  test('se compara contra lo publicado y sw.js dice su número', () => {
    assert.ok(PUBLICADO, 'sin referencia de lo publicado');
    assert.match(String(NUMERO), /^\d+$/, 'sw.js perdió su const CACHE');
    assert.match(SW_MAIN, /self\.addEventListener\('fetch'/, 'no pude leer el sw.js publicado con git show');
  });

  test('ningún .js propio que cambió se queda sin página que lo pida (si no, la prueba no miraría nada)', () => {
    /* Un cambiado sin página es un archivo muerto o uno que se carga por un
       camino que esta prueba no ve: las dos cosas hay que mirarlas a mano. */
    const pedidos = new Set(PEDIDOS.map(p => p.archivo));
    const sueltos = CAMBIADOS.filter(f => !pedidos.has(f));
    assert.deepEqual(sueltos, [], 'cambiaron y ninguna página los pide');
  });
});

/* ========================================================================== */
describe('1 · Cada página pide cada .js que cambió con la versión en la dirección, y sw.js la precarga igual', { skip: SIN_PUBLICADO }, () => {

  test('todos los pedidos de un .js que cambió llevan ?v=<número de CACHE>', () => {
    const malos = PEDIDOS_CAMBIADOS.filter(p => versionDe(p.pedido) !== NUMERO)
      .map(p => p.pagina + ' pide «' + p.pedido + '» (' + p.modo + ')');
    assert.deepEqual(malos, [], 'una página pide un .js que cambió sin ?v=' + NUMERO
      + ': la caché HTTP o la del sw.js anterior le pueden dar el de antes');
  });

  test('un mismo .js se pide con UNA sola dirección en todo el sitio (una sola entrada en cada caché)', () => {
    const por = new Map();
    PEDIDOS_CAMBIADOS.forEach(p => {
      const u = new URL(p.pedido, ORIGEN + p.pagina);
      const clave = u.pathname + u.search;
      if (!por.has(p.archivo)) por.set(p.archivo, new Set());
      por.get(p.archivo).add(clave);
    });
    const varios = [...por].filter(([, s]) => s.size > 1).map(([f, s]) => f + ': ' + [...s].join(' y '));
    assert.deepEqual(varios, [], 'dos direcciones del mismo archivo: sin señal, la que no se precargó no está');
  });

  test('sw.js precarga cada .js que cambió con esa misma dirección, y ya no con la de antes', () => {
    const lista = new Set(PRECARGA);
    const faltan = [], viejas = [];
    [...new Set(PEDIDOS_CAMBIADOS.filter(p => PAGINAS_PRECARGADAS.has(p.pagina)).map(p => p.archivo))].forEach(f => {
      if (!lista.has(f + '?v=' + NUMERO)) faltan.push(f + '?v=' + NUMERO);
      if (lista.has(f)) viejas.push(f);
    });
    assert.deepEqual(faltan, [], 'sin señal, la app instalada no los encontraría');
    assert.deepEqual(viejas, [], 'precargados sin versión: nadie los pide así, y se bajarían dos veces');
  });
});

/* ========================================================================== */
describe('2 · Control: SIN la versión en la dirección, el teléfono con v138 da el .js de antes', { skip: SIN_PUBLICADO }, () => {
  /* Lo que pasaba hasta hoy, por las dos ventanas. Si estas fallan, el
     simulador ya no reproduce el defecto y el resto no prueba nada. */
  const ejemplos = ['app/puente.js', 'panel/nube.js'].filter(f => CAMBIADOS.includes(f));
  /* El sw.js publicado desde v139 ya pide con 'no-cache' (pedidoFresco): con
     él mandando, la ventana de la caché HTTP no existe y ese control no tiene
     qué mostrar. La de su propia caché sí sigue: la cierra la dirección. */
  const pideFresco = /function pedidoFresco/.test(SW_MAIN);

  for (const f of ejemplos) {
    test(f + ': el F5 después de publicar lo saca de la caché HTTP (max-age=600)',
      { skip: pideFresco && 'el sw.js publicado ya pide con no-cache' }, async () => {
      const { v138 } = await telefonoConV138();
      const r = await v138.pedir(ORIGEN + f);
      assert.ok(igual(r.cuerpo, deMain(f)), 'el simulador ya no reproduce la ventana de la caché HTTP');
    });
    test(f + ': con señal floja el v138 lo contesta de su caché', async () => {
      const { tel, v138 } = await telefonoConV138();
      tel.http.clear();                                   // pasaron los 10 minutos
      tel.red = url => rutaDeUrl(url) !== f;               // justo ese no baja
      const r = await v138.pedir(ORIGEN + f);
      assert.ok(igual(r.cuerpo, deMain(f)), 'el simulador ya no reproduce la ventana del sw.js anterior');
    });
  }
});

/* ========================================================================== */
describe('3 · Con la versión en la dirección, ninguna caché da el .js de antes a la página nueva', { skip: SIN_PUBLICADO }, () => {

  for (const p of PEDIDOS_CAMBIADOS) {
    const nombre = p.pagina + ' → ' + p.pedido;
    const antes = () => deMain(p.archivo), hoy = () => deHoy(p.archivo);

    test(nombre + ': con señal, el v138 y la caché HTTP de 10 min dan el de hoy', async () => {
      const { v138 } = await telefonoConV138();
      const r = await v138.pedir(urlDe(p));
      assert.ok(!igual(r.cuerpo, antes()), 'la página nueva recibió el ' + p.archivo + ' de antes');
      assert.ok(igual(r.cuerpo, hoy()), 'con señal tenía que llegar el de hoy');
    });

    test(nombre + ': con señal floja (justo ese no baja), el v138 no contesta el de antes', async () => {
      const { tel, v138 } = await telefonoConV138();
      tel.red = url => url !== urlDe(p);
      const r = await v138.pedir(urlDe(p));
      assert.ok(!igual(r.cuerpo, antes()), 'el sw.js v138 le dio el ' + p.archivo + ' de su caché a la página nueva');
    });

    test(nombre + ': sin señal, con el v139 instalado y el v138 mandando todavía, sale el de hoy', async () => {
      const { tel, v138 } = await telefonoConV138();
      const v139 = cargarSW(SW_HOY, tel);
      await v139.instalar();
      /* La precarga del v139 dejó lo de hoy en la caché HTTP; pasados los 10
         minutos eso ya no cuenta, y el v138 va a su respaldo. */
      tel.http.clear();
      tel.red = () => false;
      const r = await v138.pedir(urlDe(p));
      assert.ok(!igual(r.cuerpo, antes()), 'el v138 encontró el ' + p.archivo + ' de antes');
      assert.ok(igual(r.cuerpo, hoy()), 'el v138 tenía que encontrarlo en la caché del v139 (caches.match mira todas)');
    });

    test(nombre + ': sin señal, con el v139 mandando, sale de su precarga (el uso sin red no se rompió)', async () => {
      const { tel } = await telefonoConV138();
      const v139 = cargarSW(SW_HOY, tel);
      await v139.instalar();
      await v139.activar();
      tel.red = () => false;
      const r = await v139.pedir(urlDe(p));
      assert.ok(igual(r.cuerpo, hoy()), 'sin señal, el v139 no tiene ' + p.pedido);
    });
  }
});

/* ========================================================================== */
describe('4 · Si un .js versionado no llega, o llega otro, la página dice que recargue y no arranca', () => {

  test('las páginas con .js versionados llevan la guardia, la misma, al principio de su bloque grande', () => {
    assert.ok(PAGINAS_GUARDADAS.length >= 8, 'esperaba las páginas que escriben: ' + PAGINAS_GUARDADAS.join(', '));
    const textos = new Set();
    PAGINAS_GUARDADAS.forEach(pagina => {
      const bg = bloqueGrande(pagina);
      assert.ok(bg, pagina + ': no encontré su bloque grande');
      const g = guardiaDe(bg.codigo);
      assert.ok(g, pagina + ': su bloque grande no lleva la guardia');
      const inicio = bg.codigo.replace(/^\s*(['"])use strict\1;?\s*/, '').trimStart();
      assert.ok(inicio.startsWith(MARCA_GUARDIA), pagina + ': la guardia tiene que ser lo PRIMERO del bloque grande (después de \'use strict\')');
      textos.add(sinCR(g));
    });
    assert.equal(textos.size, 1, 'la guardia no es la misma en todas las páginas: se copió y se cambió en una');
  });

  test('cada .js que una página pide con versión firma su llegada ANTES de todo su código', () => {
    /* Primero y no al final: la firma dice que llegó ESTE archivo. Si después
       revienta en algún teléfono, eso no es mezclar versiones, y frenar la
       página por eso la dejaría en «recarga» para siempre. */
    const versionados = [...new Set(PEDIDOS.filter(p => versionDe(p.pedido)).map(p => p.archivo))];
    assert.ok(versionados.length > 0, 'ninguna página pide un .js con versión');
    const malos = [];
    versionados.forEach(f => {
      const t = sinCR(deHoy(f));
      const codigo = t.replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, '');
      if (!codigo.startsWith(FIRMA)) malos.push(f + ': su primer código no es la firma');
      if (t.split('TG_LLEGARON = window.TG_LLEGARON').length - 1 !== 1) malos.push(f + ': firma más de una vez');
    });
    assert.deepEqual(malos, []);
  });

  for (const pagina of PAGINAS_GUARDADAS) {
    test(pagina + ': con todo lo de hoy, arranca', () => {
      const r = abrirPagina(pagina, todoDeHoy);
      assert.equal(r.error && r.error.message, null);
      assert.equal(r.arranca, true);
      assert.equal(r.aMedias, null);
      assert.equal(r.puestos.length, 0, 'pintó el aviso de recargar con todo bien');
    });

    test(pagina + ': un <script> ajeno con ?v= (el de una extensión del navegador) no la frena', () => {
      /* La guardia mira solo lo del sitio (direcciones relativas): si mirara
         todo, una extensión cualquiera dejaría el CRM en «recarga» para siempre. */
      const r = abrirPagina(pagina, todoDeHoy,
        ['chrome-extension://abcdefghijklmnop/inyectado.js?v=3', 'https://cdn.ajeno.com/x.js?v=2', '//cdn.ajeno.com/y.js?v=1']);
      assert.equal(r.arranca, true, 'un script ajeno frenó la página');
      assert.equal(r.aMedias, null);
    });

    const versionados = bloqueGrande(pagina).estaticos.filter(versionDe);
    for (const src of versionados) {
      const archivo = resolver(pagina, src);

      test(pagina + ' → ' + src + ' no llegó (el v138 contestó index.html): no arranca, y dice que recargue', async () => {
        /* Lo que de verdad contesta el v138 publicado con ese archivo
           fallando: lo saca la simulación, no se supone. */
        let cuerpo = null;
        if (!SIN_PUBLICADO) {
          const { tel, v138 } = await telefonoConV138();
          tel.http.clear();
          tel.red = url => rutaDeUrl(url) !== archivo;
          const r = await v138.pedir(new URL(src, ORIGEN + pagina).href);
          cuerpo = r.cuerpo || null;
        } else {
          cuerpo = deHoy('index.html');
        }
        const r = abrirPagina(pagina, f => (f === archivo ? (cuerpo ? { cuerpo } : { error: 'sin respuesta' }) : todoDeHoy(f)));
        assert.equal(r.arranca, false, 'la página arrancó sin ' + archivo);
        assert.deepEqual(r.aMedias, [src.split('?')[0]]);
        assert.equal(r.puestos.length, 1, 'no pintó el aviso');
        assert.match(r.puestos[0].innerHTML, /Recargar/);
        assert.match(r.puestos[0].innerHTML, /no sigue/);
        r.puestos[0].boton.onclick();
        assert.equal(r.recargas(), 1, 'el botón no recarga');
      });

      /* Solo mientras lo publicado no firma (hoy: main no tiene firmas). Después
         de publicar, el de antes también firma: entre dos versiones con firma,
         la que separa es la dirección (las secciones 1 a 3), no la firma. */
      const antes = PUBLICADO ? deMain(archivo) : null;
      const sinFirmaAntes = !!antes && !/TG_LLEGARON/.test(sinCR(antes));
      test(pagina + ' → ' + src + ' llegó el de antes (una caché que no mirara la versión): tampoco arranca',
        { skip: !sinFirmaAntes && 'lo publicado ya firma (o no hay con qué comparar): ver la nota' }, () => {
        const r = abrirPagina(pagina, f => (f === archivo ? { cuerpo: deMain(archivo) } : todoDeHoy(f)));
        assert.equal(r.arranca, false, 'la página nueva arrancó con el ' + archivo + ' de antes');
        assert.deepEqual(r.aMedias, [src.split('?')[0]]);
      });

      test(pagina + ' → ' + src + ' falló la red sin respuesta: tampoco arranca', () => {
        const r = abrirPagina(pagina, f => (f === archivo ? { error: 'Failed to fetch' } : todoDeHoy(f)));
        assert.equal(r.arranca, false);
        assert.deepEqual(r.aMedias, [src.split('?')[0]]);
      });

      test(pagina + ' → ' + src + ' llegó el de hoy y revienta al correr en ese teléfono: eso no es mezcla, la página sigue', () => {
        /* Como antes de este cambio: cada página se protege sola sin el
           módulo. Frenarla aquí la dejaría en «recarga» para siempre en ese
           teléfono, y recargar no lo arregla. */
        const r = abrirPagina(pagina, f => (f === archivo
          ? { cuerpo: sinCR(deHoy(archivo)) + '\nthrow new Error("este teléfono no tiene algo que el módulo usa");' }
          : todoDeHoy(f)));
        assert.equal(r.arranca, true, 'la guardia confundió un módulo que revienta con uno que no llegó');
        assert.equal(r.aMedias, null);
      });
    }

    test(pagina + ': a medias, un toque o una tecla fuera del aviso no llegan a la página', () => {
      const src = bloqueGrande(pagina).estaticos.find(versionDe);
      const archivo = resolver(pagina, src);
      const r = abrirPagina(pagina, f => (f === archivo ? { error: 'no' } : todoDeHoy(f)));
      ['click', 'keydown', 'submit', 'input', 'change'].forEach(tipo => {
        const o = r.oyentes.find(x => x.tipo === tipo && x.captura === true);
        assert.ok(o, 'no se frenó «' + tipo + '» en la captura de window');
        let parado = 0, prevenido = 0;
        o.fn({ target: { fuera: true }, stopImmediatePropagation() { parado++; }, preventDefault() { prevenido++; } });
        assert.equal(parado + prevenido, 2, '«' + tipo + '» fuera del aviso siguió a la página');
        let parado2 = 0;
        o.fn({ target: r.puestos[0].boton, stopImmediatePropagation() { parado2++; }, preventDefault() {} });
        assert.equal(parado2, 0, 'el botón Recargar del aviso quedó frenado también');
      });
    });
  }
});
