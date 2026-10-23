/* ============================================================================
 * «YA LA ABRISTE DESDE SU ÍCONO»: LA GUÍA DE INSTALAR SE VA — 23-oct-2026
 *
 *   node --test pruebas/instalar-ya-la-abriste.test.js
 *
 * Joan: «instalé Tu Garantía en el teléfono y aún así sigue apareciendo la
 * información de instálala en el teléfono, quiero que cuando la app esté
 * instalada esa información desaparezca».
 *
 * Dentro de la app instalada la guía no salía (display-mode). Salía en la
 * PESTAÑA de Chrome —la portada raíz, fija, o socio.html abierta desde un
 * enlace—, que no tiene cómo saber que la app existe. Lo que estas pruebas
 * cuidan:
 *
 *   1. LA MARCA SE ESCRIBE donde se sabe algo: al abrir como app (en cada
 *      apertura), con appinstalled y con «Ya la tengo instalada» (en iPhone es
 *      lo único: Safari no ve la app de Inicio).
 *   2. LA MARCA SE BORRA con beforeinstallprompt (Chrome solo lo manda si NO
 *      está instalada) y CADUCA a los 30 días.
 *   3. CON LA MARCA, LA GUÍA SE VA y queda una línea con «¿La borraste? Ver
 *      cómo instalarla»: en las tres pantallas de socio.html y en la portada
 *      raíz (index.html), que era fija.
 *   4. NUNCA DICE «ESTÁ INSTALADA»: borrarla no avisa a nadie.
 *   5. DENTRO DE LA APP INSTALADA NO SALE NADA, ni la línea.
 *
 * Las páginas corren de verdad con pruebas/banco-socio.js; la portada raíz,
 * con un DOM mínimo y sus guiones de verdad.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const IA = () => require('../app/instalar.js');

const AHORA = Date.parse('2026-10-23T15:00:00Z');
const DIA = 86400000;
const LLAVE = 'tg_app_instalada_v1';

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android (33/13; 450dpi; 1080x2208; samsung; SM-A135M; a13; exynos850; es_US; 640000000)',
  /* 23-oct-2026 — los computadores: Chrome y Edge ofrecen instalar socio.html
     desde la barra de direcciones, y su ventana de app también es standalone. */
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
};
function almacen(inicial) {
  const d = Object.assign({}, inicial || {});
  return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}
const roto = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('x'); } };
const modo = cual => q => ({ matches: q === '(display-mode: ' + cual + ')' });
const entorno = (ua, extra) => Object.assign({ navegador: { userAgent: ua, maxTouchPoints: 5 }, almacen: almacen(), ahora: AHORA,
                                               matchMedia: () => ({ matches: false }), documento: { referrer: '' } }, extra || {});
const marca = (haceDias, via) => JSON.stringify({ visto: AHORA - haceDias * DIA, via: via || 'app' });
const NUNCA = /est[áa] instalada|ya qued[óo] instalada/i;

async function entrar(o) {
  const A = abrirSocio(Object.assign({ ahora: AHORA }, o));
  await asentar();
  return A;
}
function avisoDeChrome() {
  return { prevenido: false, pidio: 0, preventDefault() { this.prevenido = true; },
           prompt() { this.pidio++; return Promise.resolve(); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
}

/* ==========================================================================
 * 1. LA LIBRERÍA
 * ======================================================================== */
describe('app/instalar.js: la marca de «ya la abriste desde su ícono»', () => {

  test('abierta como app se anota; en la pestaña no', () => {
    const I = IA();
    const a = almacen();
    assert.equal(I.anotarSiEsApp(entorno(UA.chromeAndroid, { almacen: a, matchMedia: modo('standalone') })), true);
    const j = JSON.parse(a.d[LLAVE]);
    assert.equal(j.visto, AHORA);
    assert.equal(j.via, 'app');
    const b = almacen();
    assert.equal(I.anotarSiEsApp(entorno(UA.chromeAndroid, { almacen: b })), false);
    assert.ok(!(LLAVE in b.d), 'la pestaña de Chrome se anotó como app');
    /* El iPhone desde Inicio también es la app. */
    const c = almacen();
    assert.equal(I.anotarSiEsApp(entorno(UA.safari, { almacen: c, navegador: { userAgent: UA.safari, standalone: true } })), true);
  });

  test('con la marca fresca la guía no se muestra: motivo «recordada»', () => {
    const d = IA().decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(3) }) }));
    assert.equal(d.mostrar, false);
    assert.equal(d.motivo, 'recordada');
    assert.equal(d.via, 'app');
    assert.equal(d.variante, 'android_chrome', 'sin la variante no se puede pintar la guía cuando la pida');
  });

  test('la marca caduca a los 30 días, y una del futuro no es nuestra', () => {
    const I = IA();
    assert.equal(I.DIAS_RECORDADA, 30);
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(29) }) })).motivo, 'recordada');
    const vieja = I.decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(31) }) }));
    assert.equal(vieja.mostrar, true, 'una marca de hace 31 días todavía escondía la guía');
    const futuro = I.decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(-5) }) }));
    assert.equal(futuro.mostrar, true, 'una marca del futuro escondía la guía');
    const basura = I.decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: '{no es json' }) }));
    assert.equal(basura.mostrar, true);
  });

  test('con el almacenamiento bloqueado nada revienta: la guía sale como antes', () => {
    const I = IA();
    assert.doesNotThrow(() => I.recordarInstalada(roto, AHORA, 'boton'));
    assert.doesNotThrow(() => I.olvidarInstalada(roto));
    assert.equal(I.recordada(roto, AHORA), null);
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: roto })).mostrar, true);
  });

  test('«Ahora no» manda sobre la marca; abierta como app manda sobre todo', () => {
    const I = IA();
    const a = almacen({ [LLAVE]: marca(1), tg_instalar_ahora_no_v1: JSON.stringify({ hasta: AHORA + DIA }) });
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: a })).motivo, 'pospuesta');
    const b = almacen({ [LLAVE]: marca(1) });
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: b, matchMedia: modo('standalone') })).motivo, 'instalada');
  });

  test('la línea: lo que se sabe, «Ver cómo instalarla», y nunca «está instalada»', () => {
    const I = IA();
    for (const via of ['app', 'appinstalled', 'boton']) {
      const d = I.decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(1, via) }) }));
      const h = I.tarjetaHTML(d, { acciones: { verGuia: 'verGuiaInstalar()', ahoraNo: 'instalarAhoraNo()' } });
      const t = plano(h);
      assert.ok(!NUNCA.test(t), via + ': la línea dice que está instalada: ' + t);
      assert.match(t, /«Tu Garantía»/);
      assert.match(h, /onclick="verGuiaInstalar\(\)">¿La borraste\? Ver cómo instalarla</);
      assert.ok(!/Tenla en tu celular|pasos-instalar|Ahora no/.test(h), via + ': con la marca siguió la guía entera');
    }
    assert.match(I.textoRecordada('app'), /^Ya la abriste desde su ícono en este teléfono\./);
    assert.match(I.textoRecordada('boton'), /^Nos dijiste que ya la tienes/);
    /* Pidió verla: la guía entera, con sus pasos. */
    const d = I.decidir(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(1) }) }));
    const g = plano(I.tarjetaHTML(d, { verGuia: true, acciones: {} }));
    assert.match(g, /Tenla en tu celular como una app/);
    assert.match(g, /Instalar y crear acceso directo/);
  });

  test('«Ya la tengo instalada» va en la guía de los teléfonos, no dentro de otra app', () => {
    const I = IA();
    const acciones = { yaLaTengo: 'yaLaTengo()' };
    for (const ua of [UA.chromeAndroid, UA.safari]) {
      const d = I.decidir(entorno(ua));
      assert.match(I.tarjetaHTML(d, { acciones }), /onclick="yaLaTengo\(\)">Ya la tengo instalada</);
    }
    const dentro = I.decidir(entorno(UA.instagram));
    assert.ok(!/Ya la tengo instalada/.test(I.tarjetaHTML(dentro, { acciones })), 'dentro de Instagram no se pudo instalar');
  });
});

/* ==========================================================================
 * 2. LA APP DEL SOCIO, ARRANCADA DE VERDAD
 * ======================================================================== */
describe('app/socio.html: con la marca, la guía se va', () => {

  test('abierta como app deja la marca en este teléfono, y no pinta nada de instalar', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid }, matchMedia: modo('standalone') });
    const j = JSON.parse(A.local.d[LLAVE] || 'null');
    assert.ok(j, 'abierta como app no dejó la marca');
    assert.equal(j.via, 'app');
    assert.equal(j.visto, AHORA);
    assert.ok(!/cajaInstalar|Tenla en tu celular|Ya la abriste/.test(A.elem('entrarCuerpo').innerHTML),
      'dentro de la app instalada salió algo de instalar');
  });

  test('en la pestaña de Chrome con la marca fresca: una línea y no la guía; «Ver cómo instalarla» la trae', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid }, local: { [LLAVE]: marca(2) } });
    /* Lo pintado al abrir está en entrarCuerpo; lo repintado, en su caja (el
       banco no arma el DOM de un innerHTML). */
    const caja = () => A.elem('cajaInstalar-entrar').innerHTML;
    assert.match(A.elem('entrarCuerpo').innerHTML, /id="cajaInstalar-entrar"/);
    const t = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(t, /Ya la abriste desde su ícono en este teléfono/);
    assert.ok(!/Tenla en tu celular|Instalar y crear acceso directo/.test(t), 'con la marca siguió saliendo la guía');
    assert.ok(!NUNCA.test(t));
    A.ev('verGuiaInstalar()');
    assert.match(plano(caja()), /Instalar y crear acceso directo/, '«Ver cómo instalarla» no trajo la guía');
  });

  test('beforeinstallprompt borra la marca: Chrome dice que NO está instalada, y vuelve la guía con su botón', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid }, local: { [LLAVE]: marca(2) } });
    A.disparar('beforeinstallprompt', avisoDeChrome());
    assert.ok(!(LLAVE in A.local.d), 'la marca sobrevivió a beforeinstallprompt');
    const t = plano(A.elem('cajaInstalar-entrar').innerHTML);
    assert.match(t, /Instalar la app/);
    assert.match(t, /Instalar y crear acceso directo/);
  });

  test('appinstalled deja la marca', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid } });
    A.disparar('appinstalled', {});
    const j = JSON.parse(A.local.d[LLAVE] || 'null');
    assert.ok(j, 'appinstalled no dejó la marca');
    assert.equal(j.via, 'appinstalled');
  });

  test('iPhone con Safari: «Ya la tengo instalada» deja la marca y cambia la guía por la línea', async () => {
    const A = await entrar({ navegador: { userAgent: UA.safari, maxTouchPoints: 5 } });
    const caja = () => A.elem('cajaInstalar-entrar').innerHTML;
    assert.match(A.elem('entrarCuerpo').innerHTML, /onclick="yaLaTengo\(\)">Ya la tengo instalada</);
    A.ev('yaLaTengo()');
    assert.equal(JSON.parse(A.local.d[LLAVE]).via, 'boton');
    const t = plano(caja());
    assert.match(t, /Nos dijiste que ya la tienes en este teléfono/);
    assert.ok(!/Agregar a Inicio/.test(t), 'después de «Ya la tengo instalada» siguió la guía');
    /* Y al volver a abrir, sigue la línea. */
    const B = await entrar({ navegador: { userAgent: UA.safari, maxTouchPoints: 5 }, local: { [LLAVE]: A.local.d[LLAVE] } });
    assert.match(plano(B.elem('entrarCuerpo').innerHTML), /Nos dijiste que ya la tienes/);
  });

  test('una marca de hace 31 días ya no esconde la guía', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid }, local: { [LLAVE]: marca(31) } });
    assert.match(plano(A.elem('entrarCuerpo').innerHTML), /Tenla en tu celular como una app/);
  });
});

/* ==========================================================================
 * 3. LA PORTADA RAÍZ (index.html): ERA FIJA
 * ======================================================================== */
/* Corre los guiones de la portada desde app/instalar.js hasta el final con
   un DOM mínimo: lo que importa es qué clase le queda a #instalar. */
/* 23-oct-2026 — `navegador`: el de un Android con Chrome si no se dice
   otro. La portada ya no le cree a la marca en un computador (ver la
   sección 4), así que las pruebas de arriba tienen que decir que son un
   teléfono. Va fuera del describe porque la sección 4 también la usa. */
function abrirPortada(local, navegador) {
  const html = leer('index.html');
  const desde = html.indexOf('<script src="app/instalar.js"></script>');
  assert.ok(desde > 0, 'index.html no carga app/instalar.js');
  const elems = {};
  const clases = () => { const s = new Set(); return { s, add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c) }; };
  const elem = id => (elems[id] = elems[id] || { id, textContent: '', classList: clases() });
  const D = function (...a) { return a.length ? new Date(...a) : new Date(AHORA); };
  D.now = () => AHORA; D.parse = Date.parse;
  const ctx = { document: { getElementById: elem }, localStorage: almacen(local), Date: D, JSON, Math, console,
                navigator: Object.assign({ userAgent: UA.chromeAndroid, maxTouchPoints: 5 }, navegador || {}) };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* cuenta.js: el lector del user-agent que instalar.js busca al usarlo. */
  vm.runInContext(leer('app/cuenta.js'), ctx, { filename: 'cuenta.js' });
  for (const m of html.slice(desde).matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = (/\bsrc="([^"]+)"/.exec(m[1]) || [])[1];
    if (src) vm.runInContext(leer(src.split('?')[0]), ctx, { filename: src });
    else vm.runInContext(m[2], ctx, { filename: 'index.html' });
  }
  return { elem, ctx };
}

describe('index.html: la sección de instalar se va con la marca', () => {

  test('sin marca, la guía se queda (también en el computador)', () => {
    const P = abrirPortada({});
    assert.ok(!P.elem('instalar').classList.contains('recordada'));
  });

  test('con la marca fresca, .recordada esconde la guía y deja la línea; «Ver cómo instalarla» la devuelve', () => {
    const P = abrirPortada({ [LLAVE]: marca(4, 'appinstalled') });
    assert.ok(P.elem('instalar').classList.contains('recordada'), 'con la marca la portada siguió mostrando la guía');
    assert.match(P.elem('instalarRecordadaTexto').textContent, /La instalaste desde aquí/);
    assert.ok(!NUNCA.test(P.elem('instalarRecordadaTexto').textContent));
    P.ctx.verGuiaInstalar();
    assert.ok(!P.elem('instalar').classList.contains('recordada'));
  });

  test('con la marca vencida, la guía se queda', () => {
    const P = abrirPortada({ [LLAVE]: marca(45) });
    assert.ok(!P.elem('instalar').classList.contains('recordada'));
  });

  test('el CSS esconde la guía con display (no con hidden) y todo lo de la guía va marcado', () => {
    const I = leer('index.html');
    assert.match(I, /#instalar\.recordada \.guia-instalar\{display:none\}/);
    assert.match(I, /#instalar \.linea-recordada\{display:none\}/);
    assert.match(I, /#instalar\.recordada \.linea-recordada\{display:block\}/);
    const s = I.slice(I.indexOf('id="instalar"'), I.indexOf('</section>', I.indexOf('id="instalar"'))).replace(/\r\n/g, '\n');
    for (const que of ['Instálala y ábrela', 'Abrir la app para instalarla', 'En Android', 'En iPhone', 'Avisos al celular']) {
      assert.ok(s.indexOf(que) > 0, 'falta «' + que + '»: la guía fija es la que vale sin JavaScript');
    }
    /* Las hijas de la columna (8 espacios de sangría): todas, salvo el rótulo
       «En tu celular» y la línea misma, van marcadas. */
    const hijas = [...s.matchAll(/^ {8}<(p|div)\b([^>]*)>/gm)].map(m => m[2]);
    assert.ok(hijas.length >= 8, 'cambió la forma de la sección: revisar esta prueba');
    for (const atrs of hijas) {
      if (/class="et"/.test(atrs) || /linea-recordada/.test(atrs)) continue;
      assert.match(atrs, /guia-instalar/, 'una parte de la guía no va marcada .guia-instalar: con la marca seguiría saliendo (' + atrs + ')');
    }
    assert.ok(!NUNCA.test(plano(s)));
  });
});

/* ==========================================================================
 * 4. EN UN COMPUTADOR NO HAY «ESTE TELÉFONO» — 23-oct-2026
 *
 * Hallazgo de la auditoría del 23-oct (lente «instalar»): Chrome y Edge en
 * Windows o Mac ofrecen instalar app/socio.html desde la barra de
 * direcciones, y su ventana de app también es display-mode: standalone. La
 * marca se anotaba igual (anotarSiEsApp y appinstalled no miraban la
 * plataforma), y la portada —que a propósito no usa decidir(), para que la
 * guía salga en el computador— pintaba «Ya la abriste desde su ícono en este
 * teléfono» y escondía la guía del celular en un computador. Falso, y en la
 * pantalla desde donde muchos la leen.
 *
 * Lo que se cuida: la marca solo se escribe en un teléfono (Android, o
 * iPhone/iPad), y la portada solo le cree en un teléfono.
 * ======================================================================== */
describe('en un computador no se anota ni se cree la marca de «este teléfono»', () => {

  const pc = ua => ({ userAgent: ua, maxTouchPoints: 0 });

  test('app/instalar.js: la ventana de app de un computador NO deja la marca', () => {
    const I = IA();
    for (const ua of [UA.windows, UA.mac]) {
      const a = almacen();
      assert.equal(I.anotarSiEsApp(entorno(ua, { almacen: a, navegador: pc(ua), matchMedia: modo('standalone') })), false,
        'la ventana de app de un computador se anotó como «este teléfono»');
      assert.ok(!(LLAVE in a.d), 'quedó la marca en un computador');
    }
    /* Un «Macintosh» con pantalla táctil es un iPad pidiendo la de escritorio:
       ese sí es «este teléfono» para la guía (es la que le sirve). */
    const ipad = almacen();
    assert.equal(I.anotarSiEsApp(entorno(UA.mac, { almacen: ipad, navegador: { userAgent: UA.mac, maxTouchPoints: 5, standalone: true } })), true);
    assert.ok(LLAVE in ipad.d);
  });

  test('app/instalar.js: anotarInstalada (appinstalled, «Ya la tengo») solo en un teléfono', () => {
    const I = IA();
    assert.equal(typeof I.anotarInstalada, 'function', 'falta anotarInstalada: appinstalled no tiene cómo mirar la plataforma');
    for (const ua of [UA.windows, UA.mac]) {
      const a = almacen();
      assert.equal(I.anotarInstalada(entorno(ua, { almacen: a, navegador: pc(ua) }), 'appinstalled'), false);
      assert.ok(!(LLAVE in a.d), 'appinstalled en un computador dejó la marca');
    }
    const b = almacen();
    assert.equal(I.anotarInstalada(entorno(UA.chromeAndroid, { almacen: b }), 'appinstalled'), true);
    assert.equal(JSON.parse(b.d[LLAVE]).via, 'appinstalled');
    const c = almacen();
    assert.equal(I.anotarInstalada(entorno(UA.safari, { almacen: c }), 'boton'), true);
    assert.equal(JSON.parse(c.d[LLAVE]).via, 'boton');
  });

  test('app/instalar.js: recordadaEnTelefono no le cree a una marca en un computador', () => {
    const I = IA();
    assert.equal(typeof I.recordadaEnTelefono, 'function', 'falta recordadaEnTelefono: la portada no tiene cómo mirar la plataforma');
    for (const ua of [UA.windows, UA.mac]) {
      assert.equal(I.recordadaEnTelefono(entorno(ua, { almacen: almacen({ [LLAVE]: marca(2) }), navegador: pc(ua) })), null,
        ua + ': la marca valió en un computador');
    }
    const r = I.recordadaEnTelefono(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(2, 'appinstalled') }) }));
    assert.ok(r && r.via === 'appinstalled', 'en Android la marca fresca tiene que valer');
    assert.ok(I.recordadaEnTelefono(entorno(UA.safari, { almacen: almacen({ [LLAVE]: marca(2, 'boton') }) })));
    /* Vencida sigue vencida, también en un teléfono. */
    assert.equal(I.recordadaEnTelefono(entorno(UA.chromeAndroid, { almacen: almacen({ [LLAVE]: marca(31) }) })), null);
  });

  test('app/socio.html en la ventana de app de un computador: no deja la marca', async () => {
    const A = await entrar({ navegador: pc(UA.windows), matchMedia: modo('standalone') });
    assert.ok(!(LLAVE in A.local.d), 'la ventana de app de Windows dejó la marca de «este teléfono»');
  });

  test('app/socio.html en la pestaña de un computador: appinstalled no deja la marca', async () => {
    const A = await entrar({ navegador: pc(UA.windows) });
    A.disparar('appinstalled', {});
    assert.ok(!(LLAVE in A.local.d), 'instalarla desde la barra de Chrome en Windows dejó la marca de «este teléfono»');
  });

  test('index.html en un computador con una marca: la guía se queda y no dice «en este teléfono»', () => {
    for (const ua of [UA.windows, UA.mac]) {
      for (const via of ['app', 'appinstalled', 'boton']) {
        const P = abrirPortada({ [LLAVE]: marca(1, via) }, pc(ua));
        assert.ok(!P.elem('instalar').classList.contains('recordada'),
          'en un computador (' + via + ') la portada escondió la guía y dijo «en este teléfono»');
      }
    }
    /* En el iPhone y en el Android, la misma marca sí la cambia por la línea. */
    assert.ok(abrirPortada({ [LLAVE]: marca(1, 'boton') }, { userAgent: UA.safari, maxTouchPoints: 5 }).elem('instalar').classList.contains('recordada'));
    assert.ok(abrirPortada({ [LLAVE]: marca(1) }, { userAgent: UA.chromeAndroid }).elem('instalar').classList.contains('recordada'));
  });
});
