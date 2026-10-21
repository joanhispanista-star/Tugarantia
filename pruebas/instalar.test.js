/* ============================================================================
 * INSTALARLA SIN TIENDAS, PASO A PASO — 21 de octubre de 2026
 *
 *   node --test pruebas/instalar.test.js
 *
 * Joan: «que la app les explique cómo se hace paso a paso para que quede
 * guardada en el fondo de pantalla de los celulares de los clientes y que
 * tengan los permisos como una app normal». Decidió el camino: Chrome
 * «Instalar», sin APK. Una sola app instalable, app/socio.html.
 *
 * Lo que estas pruebas cuidan, en orden de lo que más cuesta si se rompe:
 *
 *   1. LA TARJETA SALE DONDE HACE FALTA, CON PASOS DE VERDAD. Hasta hoy, en
 *      Android solo salía si Chrome avisaba (beforeinstallprompt), y Chrome no
 *      avisa antes de 30 segundos y un toque, ni dentro de Instagram: casi
 *      nadie la veía. Y solo en la pantalla de Entrar: quien ya tenía la
 *      sesión guardada nunca la veía.
 *   2. NUNCA ENCIMA DE LA CUOTA, y nunca si ya está instalada.
 *   3. LOS MENÚS SE LLAMAN COMO SE LLAMAN HOY. «Añadir a pantalla de inicio» y
 *      «en Chrome no sale la opción» eran falsos en el iPhone de 2026.
 *   4. NO PROMETE AVISOS AL CELULAR: no hay emisor de push.
 *   5. play/ YA NO SE OFRECE: dos íconos «Tu Garantía» iguales, y uno pide la
 *      contraseña cada vez.
 *
 * Las páginas corren de verdad con pruebas/banco-socio.js y banco-play.js.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { abrirPlay } = require('./banco-play.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
/* Se pide adentro de cada prueba: si el archivo no existe, cae la prueba con
   su nombre, no el archivo entero sin decir cuál. */
const IA = () => require('../app/instalar.js');

const AHORA = Date.parse('2026-10-21T15:00:00Z');
const DIA = 86400000;

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
  edgeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/141.0.3537.71 Mobile/15E148 Safari/605.1.15',
  ipadEscritorio: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  instagram: 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android (33/13; 450dpi; 1080x2208; samsung; SM-A135M; a13; exynos850; es_US; 640000000)',
  facebookIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0;FBBV/1;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBLC/es_LA;FBOP/5]',
  tiktok: 'Mozilla/5.0 (Linux; Android 12; SM-A125M Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 trill_350000 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/35.0.0 BytedanceWebview/d8a21c6',
  whatsapp: 'Mozilla/5.0 (Linux; Android 14; SM-A155M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 WhatsApp/2.25.14.10',
  webview: 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
};

function almacen(inicial) {
  const d = Object.assign({}, inicial || {});
  return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}
const roto = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('x'); } };
const modo = cual => q => ({ matches: q === '(display-mode: ' + cual + ')' });
const entorno = (ua, extra) => Object.assign({ navegador: { userAgent: ua, maxTouchPoints: 5 }, almacen: almacen(), ahora: AHORA,
                                               matchMedia: () => ({ matches: false }), documento: { referrer: '' } }, extra || {});

/* Una nube de mentira para entrar (la misma forma que una-puerta-socio.test.js). */
const CORREO = '573001112222@tugarantia.net';
const tokenDe = extra => Object.assign({ access_token: 'acceso-1', refresh_token: 'renovar-1',
  expires_at: Math.floor(AHORA / 1000) + 3600, user: { email: CORREO } }, extra || {});
function nube() {
  return (url) => {
    if (/grant_type=refresh_token$/.test(url)) return { status: 200, cuerpo: tokenDe({ access_token: 'acceso-2' }) };
    if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: false } };
    if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-10-21T14:55:00Z' } } };
    if (/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, mensajes: [] } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
  socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
const SESION_CON_PAQUETE = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + 30 * DIA, celular: '3001112222',
  paquete: { nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-20T10:00:00Z', origen: 'nube', cedula: '3001112222' } });
const SESION_SIN_JUNTAR = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + 30 * DIA, celular: '3001112222' });

/* Las tres pantallas, con el teléfono que se le pida. */
async function entrar(o) {
  const A = abrirSocio(Object.assign({ ahora: AHORA }, o));
  await asentar();
  return A;
}
/* Sin red y con el paquete guardado: abre Inicio con lo de la última vez. */
async function abrirInicio(o) {
  const local = Object.assign({ socio_cuenta: SESION_CON_PAQUETE }, (o && o.local) || {});
  const A = abrirSocio(Object.assign({ ahora: AHORA }, o, { local }));
  await asentar(16);
  return A;
}
async function espera(o) {
  const local = Object.assign({ socio_cuenta: SESION_SIN_JUNTAR }, (o && o.local) || {});
  const A = abrirSocio(Object.assign({ ahora: AHORA, red: nube() }, o, { local }));
  await asentar(16);
  return A;
}
/* Un beforeinstallprompt de mentira, como lo manda Chrome. */
function avisoDeChrome(respuesta) {
  const ev = { prevenido: false, pidio: 0,
    preventDefault() { this.prevenido = true; },
    prompt() { this.pidio++; return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome: respuesta || 'dismissed' }) };
  return ev;
}

/* ==========================================================================
 * 1. LA LIBRERÍA: app/instalar.js, sin DOM
 * ======================================================================== */
describe('app/instalar.js: en qué teléfono está y qué le toca', () => {

  test('reconoce el navegador y la plataforma con el lector único de app/cuenta.js', () => {
    const I = IA();
    const v = (ua, toques) => I.decidir(entorno(ua, { navegador: { userAgent: ua, maxTouchPoints: toques == null ? 5 : toques } })).variante;
    assert.equal(v(UA.chromeAndroid), 'android_chrome');
    assert.equal(v(UA.samsung), 'android_samsung');
    assert.equal(v(UA.firefoxAndroid), 'android_otro');
    assert.equal(v(UA.safari), 'iphone_safari');
    assert.equal(v(UA.chromeIphone), 'iphone_otro');
    assert.equal(v(UA.edgeIphone), 'iphone_otro');
    /* Un iPad con Safari pide la página «de escritorio» y dice Macintosh: lo
       delata la pantalla táctil, como en app/aparato.js. */
    assert.equal(v(UA.ipadEscritorio, 5), 'iphone_safari');
    assert.equal(I.decidir(entorno(UA.ipadEscritorio, { navegador: { userAgent: UA.ipadEscritorio, maxTouchPoints: 0 } })).mostrar, false);
  });

  test('dentro de Facebook, Instagram, TikTok, WhatsApp u otra app: va primero y nombra la app', () => {
    const I = IA();
    [[UA.instagram, 'instagram', 'Instagram'], [UA.facebookIphone, 'facebook', 'Facebook'], [UA.tiktok, 'tiktok', 'TikTok'],
     [UA.whatsapp, 'whatsapp', 'WhatsApp'], [UA.webview, 'otra_app', '']].forEach(([ua, dentro, nombre]) => {
      const d = I.decidir(entorno(ua));
      assert.equal(d.mostrar, true, ua);
      assert.equal(d.variante, 'dentro_de_app', ua);
      assert.equal(d.dentroDe, dentro);
      assert.equal(d.arriba, true, 'dentro de ' + dentro + ' el aviso no va primero');
      const g = I.guia(d);
      assert.match(g.titulo, nombre ? new RegExp('Estás dentro de ' + nombre) : /Estás dentro de otra app/);
      assert.match(g.intro, /no se puede instalar/);
      assert.equal(g.copiar, true, 'dentro de otra app no hay «Copiar enlace»');
    });
  });

  test('ya instalada: display-mode que no es «browser», navigator.standalone, o nuestra app de Android', () => {
    const I = IA();
    ['standalone', 'fullscreen', 'minimal-ui'].forEach(m =>
      assert.equal(I.yaInstalada(entorno(UA.chromeAndroid, { matchMedia: modo(m) })), true, m));
    assert.equal(I.yaInstalada(entorno(UA.safari, { navegador: { userAgent: UA.safari, standalone: true } })), true);
    /* El APK (una TWA) se reconoce por el referrer en la primera carga. */
    assert.equal(I.yaInstalada(entorno(UA.chromeAndroid, { documento: { referrer: 'android-app://co.tugarantia.socio/' } })), true);
    assert.equal(I.yaInstalada(entorno(UA.chromeAndroid)), false);
    assert.equal(I.yaInstalada(entorno(UA.chromeAndroid, { matchMedia: modo('browser') })), false);
    const d = I.decidir(entorno(UA.chromeAndroid, { matchMedia: modo('standalone') }));
    assert.deepEqual([d.mostrar, d.motivo], [false, 'instalada']);
  });

  test('en un computador no se ofrece: la guía es para el celular', () => {
    const d = IA().decidir(entorno(UA.windows));
    assert.deepEqual([d.mostrar, d.motivo], [false, 'computador']);
  });

  test('«Ahora no» dura siete días, y un almacenamiento bloqueado no rompe nada', () => {
    const I = IA();
    const a = almacen();
    assert.equal(I.posponer(a, AHORA), true);
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: a, ahora: AHORA + 6 * DIA })).motivo, 'pospuesta');
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: a, ahora: AHORA + 7 * DIA + 1 })).mostrar, true);
    /* Un reloj que se atrasó no la esconde para siempre. */
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: a, ahora: AHORA - 30 * DIA })).mostrar, true);
    /* Modo privado, datos bloqueados: ni lanza ni la esconde por error. */
    assert.equal(I.posponer(roto, AHORA), false);
    assert.equal(I.pospuesta(roto, AHORA), false);
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: roto })).mostrar, true);
    assert.equal(I.decidir(entorno(UA.chromeAndroid, { almacen: null })).mostrar, true);
  });

  test('el enlace que se copia es la app pelada: sin #, sin ?, sin el pase del CRM', () => {
    const I = IA();
    assert.equal(I.enlace({ protocol: 'https:', host: 'tugarantia.net', pathname: '/app/socio.html', hash: '#v=abc123', search: '?x=1' }),
      'https://tugarantia.net/app/socio.html');
    assert.equal(I.enlace({ protocol: 'https:', hostname: 'tugarantia.net', pathname: '/app/socio.html', hash: '#d=eyJ' }),
      'https://tugarantia.net/app/socio.html');
    assert.equal(I.enlace({ protocol: 'file:', pathname: '/C:/x/socio.html' }), 'https://tugarantia.net/app/socio.html');
    assert.equal(I.enlace(null), 'https://tugarantia.net/app/socio.html');
  });
});

describe('app/instalar.js: los pasos, con los nombres de los menús de hoy', () => {

  const todo = g => [g.titulo, g.intro, g.antesDePasos, g.nota, g.permisos].concat(g.pasos).join(' ');

  test('Chrome en Android: el menú nuevo, el viejo, y la trampa de «Crear acceso directo»', () => {
    const g = IA().guia({ variante: 'android_chrome' });
    const t = todo(g);
    assert.match(t, /⋮/);
    assert.match(t, /«Instalar y crear acceso directo» y después «Instalar»/);
    assert.match(t, /«Instalar app» o «Agregar a la pantalla principal»/, 'falta el menú del Chrome viejo');
    assert.match(t, /No elijas «Crear acceso directo»: ese abre Chrome, no la app/);
    assert.match(t, /búscala en tus apps como «Tu Garantía»/);
  });

  test('con el aviso de Chrome, el botón primero y los pasos a mano por si no abre nada', () => {
    const g = IA().guia({ variante: 'android_chrome' }, { conAviso: true });
    assert.equal(g.boton, 'Instalar la app');
    assert.match(g.antesDePasos, /Si el botón no abre nada/);
    assert.equal(IA().guia({ variante: 'android_chrome' }).boton, '', 'sin aviso de Chrome no hay botón que prometer');
    assert.equal(IA().guia({ variante: 'iphone_safari' }, { conAviso: true }).boton, '', 'en iPhone no hay diálogo de instalar');
  });

  test('Samsung Internet: el ícono de la barra, y el menú ≡ si no está', () => {
    const t = todo(IA().guia({ variante: 'android_samsung' }));
    assert.match(t, /barra/);
    assert.match(t, /≡/);
    assert.match(t, /«Añadir página a»/);
    assert.match(t, /«Pantalla de inicio»/);
  });

  test('Safari en iPhone: ··· → Compartir → «Agregar a Inicio», «Abrir como app web», y volver a entrar', () => {
    const t = todo(IA().guia({ variante: 'iphone_safari' }));
    assert.match(t, /···/);
    assert.match(t, /«Compartir»/);
    assert.match(t, /⬆/);
    assert.match(t, /«Agregar a Inicio»/);
    assert.match(t, /Deja activado «Abrir como app web» y toca «Agregar»/);
    /* La app agregada guarda sus datos aparte de Safari (WebKit, «por diseño»). */
    assert.match(t, /entra con tu celular y tu contraseña/);
    assert.match(t, /aparte de Safari/);
  });

  test('Chrome o Edge en iPhone: sí se puede desde iOS 16.4, y se dice', () => {
    const t = todo(IA().guia({ variante: 'iphone_otro' }));
    assert.match(t, /⬆/);
    assert.match(t, /«Agregar a Inicio»/);
    assert.match(t, /16\.4/);
    assert.ok(!/no sale la opción|solo Safari/i.test(t), 'volvió a decir que en Chrome de iPhone no se puede');
  });

  test('ninguna guía usa los nombres viejos ni promete avisos al celular', () => {
    const I = IA();
    I.VARIANTES.forEach(v => {
      [false, true].forEach(conAviso => {
        const t = todo(I.guia({ variante: v, dentroDe: 'instagram' }, { conAviso }));
        assert.ok(!/Añadir a pantalla de inicio|en Chrome no sale/i.test(t), v + ' usa un nombre de menú que ya no existe');
        assert.ok(!/notificaci/i.test(t), v + ' habla de notificaciones');
        assert.ok(!/te (avisamos|llegan|llegarán) (al|en tu) celular/i.test(t), v + ' promete avisos al celular');
      });
    });
  });

  test('los permisos: en el momento, como cualquier app, y sin push', () => {
    const p = IA().PERMISOS;
    assert.match(p, /La cámara la pedimos solo para tu cédula y tu selfie/);
    assert.match(p, /la ubicación una vez al registrarte/);
    assert.match(p, /siempre en el momento, como cualquier app/);
    assert.match(p, /Avisos al celular todavía no enviamos: te escribimos por el chat de la app y por WhatsApp/);
    /* Y de verdad no hay con qué mandarlos: si algún día sw.js escucha 'push',
       esta frase se cambia a propósito. */
    assert.ok(!/addEventListener\(\s*['"]push['"]/.test(leer('sw.js')), 'ya hay emisor de push: la frase de permisos miente');
  });

  test('el texto de arriba: ícono, pantalla completa, se actualiza sola, sin tienda y sin archivos', () => {
    const t = IA().guia({ variante: 'android_chrome' }).intro;
    assert.match(t, /Queda con su ícono, abre a pantalla completa y se actualiza sola cada vez que la abres con internet/);
    assert.match(t, /No es de la Play Store: se instala desde aquí, sin descargar archivos/);
  });

  test('la tarjeta escapa lo que pinta y no deja «Ahora no» sin dueño', () => {
    const I = IA();
    const h = I.tarjetaHTML(I.decidir(entorno(UA.instagram)), { enlace: 'https://tugarantia.net/app/socio.html"><img src=x>',
      acciones: { instalar: 'instalarApp()', ahoraNo: 'instalarAhoraNo()', copiar: 'copiarEnlaceInstalar()' } });
    assert.ok(!/<img src=x>/.test(h), 'el enlace se pintó sin escapar');
    assert.match(h, /onclick="instalarAhoraNo\(\)">Ahora no</);
    assert.match(h, /onclick="copiarEnlaceInstalar\(\)">Copiar enlace</);
  });
});

/* ==========================================================================
 * 2. LA APP DEL SOCIO, ARRANCADA DE VERDAD
 * ======================================================================== */
describe('app/socio.html: la tarjeta de instalar, en las tres pantallas', () => {

  test('Android sin aviso de Chrome: la tarjeta sale igual, con los pasos a mano (antes nacía escondida)', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid } });
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.match(h, /id="cajaInstalar-entrar"/, 'la pantalla de entrar no tiene la tarjeta');
    const t = plano(h);
    assert.match(t, /Tenla en tu celular como una app/);
    assert.match(t, /Instalar y crear acceso directo/);
    assert.ok(!/Instalar la app/.test(t), 'sin aviso de Chrome pinta un botón que no abre nada');
    /* Abajo de lo que busca el que ya tiene cuenta y del registro. */
    assert.ok(h.indexOf('cajaInstalar-entrar') > h.indexOf('id="inCel"'));
    assert.ok(h.indexOf('cajaInstalar-entrar') > h.indexOf('Registrarme'));
  });

  test('cuando Chrome avisa, aparece «Instalar la app»; tocarlo abre el diálogo una sola vez', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid } });
    const ev = avisoDeChrome('dismissed');
    A.disparar('beforeinstallprompt', ev);
    assert.equal(ev.prevenido, true, 'Chrome pinta su propia franja encima');
    const caja = () => A.elem('cajaInstalar-entrar').innerHTML;
    assert.match(caja(), /onclick="instalarApp\(\)">Instalar la app</);
    assert.match(plano(caja()), /Si el botón no abre nada, hazlo a mano/);
    A.ev('instalarApp()');
    A.ev('instalarApp()');
    assert.equal(ev.pidio, 1, 'el diálogo se pidió dos veces: Chrome da uno solo por carga');
    await asentar();
    /* Lo descartó: el botón se va (ya no abre nada), los pasos se quedan. */
    assert.ok(!/Instalar la app/.test(caja()));
    assert.match(plano(caja()), /Instalar y crear acceso directo/);
  });

  test('aceptó e instaló: la tarjeta dice dónde buscarla, no vuelve a ofrecerla', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid } });
    const ev = avisoDeChrome('accepted');
    A.disparar('beforeinstallprompt', ev);
    A.ev('instalarApp()');
    await asentar();
    A.disparar('appinstalled', {});
    const t = plano(A.elem('cajaInstalar-entrar').innerHTML);
    assert.match(t, /Listo: ya quedó instalada/);
    assert.match(t, /«Tu Garantía»/);
    assert.ok(!/Instalar la app|Instalar y crear acceso directo/.test(t));
  });

  test('abierta como app (display-mode: standalone) no se ofrece en ninguna pantalla', async () => {
    const o = { navegador: { userAgent: UA.chromeAndroid }, matchMedia: modo('standalone') };
    const E = await entrar(o);
    assert.ok(!/cajaInstalar|Tenla en tu celular/.test(E.elem('entrarCuerpo').innerHTML));
    const S = await espera(o);
    assert.ok(!/cajaInstalar|Tenla en tu celular/.test(S.elem('entrarCuerpo').innerHTML));
    const I = await abrirInicio(o);
    assert.ok(I.visible('pCuenta'));
    assert.ok(!/cajaInstalar|Tenla en tu celular/.test(I.elem('cuerpo').innerHTML));
  });

  test('iPhone con Safari: los pasos de hoy, sin «Añadir a pantalla de inicio» ni «en Chrome no sale»', async () => {
    const A = await entrar({ navegador: { userAgent: UA.safari, maxTouchPoints: 5 } });
    const t = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(t, /Agregar a Inicio/);
    assert.match(t, /Abrir como app web/);
    assert.ok(!/Añadir a pantalla de inicio|en Chrome no sale/.test(t));
  });

  test('dentro de Instagram el aviso va PRIMERO, y «Copiar enlace» copia la app sin el # de la dirección', async () => {
    const copiado = [];
    const A = await entrar({ hash: '#zz=lo-que-no-viaja',
      navegador: { userAgent: UA.instagram, clipboard: { writeText: t => { copiado.push(t); return Promise.resolve(); } } } });
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.match(plano(h), /Estás dentro de Instagram/);
    assert.ok(h.indexOf('cajaInstalar-entrar') >= 0 && h.indexOf('cajaInstalar-entrar') < h.indexOf('id="inCel"'),
      'dentro de Instagram el aviso quedó debajo del formulario');
    A.ev('copiarEnlaceInstalar()');
    await asentar();
    assert.deepEqual(copiado, ['https://tugarantia.net/app/socio.html']);
    assert.match(plano(A.elem('cajaInstalar-entrar').innerHTML), /Copiado/);
  });

  test('sin portapapeles no dice «Copiado»: dice cómo copiarlo a mano', async () => {
    const A = await entrar({ navegador: { userAgent: UA.tiktok } });
    A.ev('copiarEnlaceInstalar()');
    await asentar();
    const t = plano(A.elem('cajaInstalar-entrar').innerHTML);
    assert.ok(!/Copiado/.test(t), 'dijo «Copiado» sin haber copiado nada');
    assert.match(t, /No se pudo copiar solo/);
    assert.match(A.elem('cajaInstalar-entrar').innerHTML, /value="https:\/\/tugarantia\.net\/app\/socio\.html"/);
  });

  test('mientras espera la respuesta de su registro (sin juntar) también la ve', async () => {
    const A = await espera({ navegador: { userAgent: UA.chromeAndroid } });
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.match(h, /Tu registro llegó y lo estamos revisando/);
    assert.match(h, /id="cajaInstalar-espera"/, 'la pantalla de espera no tiene la tarjeta');
    assert.ok(h.indexOf('cajaInstalar-espera') > h.indexOf('Tu registro llegó'), 'la tarjeta tapó el estado de su registro');
  });

  test('en Inicio va AL FINAL: nunca encima de la cuota ni del cupo', async () => {
    const A = await abrirInicio({ navegador: { userAgent: UA.chromeAndroid } });
    assert.ok(A.visible('pCuenta'));
    const h = A.elem('cuerpo').innerHTML;
    const i = h.indexOf('id="cajaInstalar-inicio"');
    assert.ok(i > 0, 'Inicio no tiene la tarjeta: quien ya tenía la sesión nunca la veía');
    ['Puedes pedir hasta', 'Tu crédito', 'Tu garantía'].forEach(s =>
      assert.ok(h.indexOf(s) >= 0 && h.indexOf(s) < i, 'la tarjeta quedó encima de «' + s + '»'));
  });

  test('en Inicio, dentro de Instagram, el aviso también va al final', async () => {
    const A = await abrirInicio({ navegador: { userAgent: UA.instagram } });
    const h = A.elem('cuerpo').innerHTML;
    const i = h.indexOf('id="cajaInstalar-inicio"');
    assert.ok(i > h.indexOf('Puedes pedir hasta'), 'el aviso de Instagram quedó encima del cupo');
  });

  test('«Ahora no» la esconde siete días, también al volver a abrir la app', async () => {
    const A = await abrirInicio({ navegador: { userAgent: UA.chromeAndroid } });
    A.ev('instalarAhoraNo()');
    assert.equal(A.elem('cajaInstalar-inicio').innerHTML, '', 'la tarjeta se quedó después de «Ahora no»');
    assert.ok(A.local.getItem('tg_instalar_ahora_no_v1'), 'no quedó recordado');
    const B = await abrirInicio({ navegador: { userAgent: UA.chromeAndroid }, local: A.local.d, ahora: AHORA + 3 * DIA });
    assert.ok(!/cajaInstalar-inicio/.test(B.elem('cuerpo').innerHTML), 'volvió antes de los siete días');
    const C = await abrirInicio({ navegador: { userAgent: UA.chromeAndroid }, local: A.local.d, ahora: AHORA + 8 * DIA });
    assert.match(C.elem('cuerpo').innerHTML, /cajaInstalar-inicio/, 'no volvió después de los siete días');
  });

  test('«Ahora no» con el almacenamiento bloqueado no revienta: se va por esta vez', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid } });
    A.ctx.localStorage = roto;
    A.ev('instalarAhoraNo()');
    assert.equal(A.elem('cajaInstalar-entrar').innerHTML, '');
  });

  test('en un computador (Joan mirando la app) no sale', async () => {
    const A = await entrar({ navegador: { userAgent: UA.windows } });
    assert.ok(!/cajaInstalar|Tenla en tu celular/.test(A.elem('entrarCuerpo').innerHTML));
  });

  test('la frase de permisos va en la tarjeta, y la app sigue sin pedir notificaciones', async () => {
    const A = await entrar({ navegador: { userAgent: UA.chromeAndroid } });
    assert.match(plano(A.elem('entrarCuerpo').innerHTML), /Avisos al celular todavía no enviamos/);
    assert.ok(!/Notification\.requestPermission|pushManager|PushManager/.test(sinComentarios(leer('app/socio.html')) + sinComentarios(leer('app/instalar.js'))));
  });

  test('si app/instalar.js no llegó, la app abre igual y no pinta tarjeta', async () => {
    const A = abrirSocio({ ahora: AHORA, navegador: { userAgent: UA.chromeAndroid } });
    /* Como un service worker viejo que no lo tenía: se borra y se vuelve a pintar. */
    A.ev('IA = null; pintarEntrar()');
    assert.match(A.elem('entrarCuerpo').innerHTML, /id="inCel"/);
    assert.ok(!/cajaInstalar/.test(A.elem('entrarCuerpo').innerHTML));
  });
});

/* ==========================================================================
 * 3. play/ YA NO SE OFRECE, Y SALTA A HTTPS
 * ======================================================================== */
describe('play/: una sola app instalable', () => {

  test('ya no ofrece instalarse: el aviso de Chrome se calla y no aparece tarjeta', () => {
    const P = abrirPlay();
    const n = P.ev('(_oyentes.beforeinstallprompt || []).length');
    assert.ok(n >= 1, 'sin oyente, Chrome ofrecería instalar play/ con su propia franja');
    P.ev('var __ev = { prevenido: false, preventDefault: function () { this.prevenido = true; }, prompt: function () { __pidio = true; }, userChoice: Promise.resolve({ outcome: "dismissed" }) }; var __pidio = false;' +
         '(_oyentes.beforeinstallprompt || []).forEach(function (f) { f(__ev); });');
    assert.equal(P.ev('__ev.prevenido'), true);
    assert.equal(P.ev('__pidio'), false);
    const pintado = Object.keys(P.elems).map(k => P.elems[k].innerHTML || '').join(' ');
    assert.ok(!/Agregar a mi pantalla de inicio|Déjala en tu celular/.test(pintado),
      'play/ volvió a ofrecer instalarse: dos íconos «Tu Garantía» iguales, y este pide la contraseña cada vez');
    const VIVO = sinComentarios(leer('play/index.html'));
    assert.ok(!/cajaInstalar|\.prompt\(\)|empujon_instalar/.test(VIVO), 'quedó código de la tarjeta de instalar en play/');
  });

  test('salta a https ARRIBA del todo, como socio.html (Enforce HTTPS sigue apagado en Pages)', () => {
    const html = leer('play/index.html');
    const guiones = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    const i = guiones.findIndex(m => /location\.protocol === 'http:'/.test(m[1]));
    assert.ok(i >= 0, 'play/ no tiene el parche de https');
    assert.equal(html.indexOf('<script'), guiones[i].index, 'el parche no es el primer script: algo lee el almacenamiento antes');
    const correr = (href, hostname) => {
      const fuimos = [];
      const location = { protocol: href.slice(0, href.indexOf(':') + 1), hostname, href, replace: u => fuimos.push(u) };
      vm.runInContext(guiones[i][1], vm.createContext({ location }));
      return fuimos;
    };
    assert.deepEqual(correr('http://tugarantia.net/play/?marca=platachat#registro', 'tugarantia.net'),
      ['https://tugarantia.net/play/?marca=platachat#registro']);
    assert.deepEqual(correr('https://tugarantia.net/play/', 'tugarantia.net'), []);
    assert.deepEqual(correr('http://localhost:8124/play/', 'localhost'), []);
    assert.deepEqual(correr('http://127.0.0.1:8124/play/', '127.0.0.1'), []);
    /* Un banco sin location no se cae por el parche. */
    assert.doesNotThrow(() => vm.runInContext(guiones[i][1], vm.createContext({})));
  });
});

/* ==========================================================================
 * 4. LOS TEXTOS QUE SE QUEDAN QUIETOS, Y LA PRECARGA
 * ======================================================================== */
describe('las páginas fijas dicen los menús de hoy y mandan a la app que se instala', () => {

  const VIEJOS = /Añadir a pantalla de inicio|en Chrome no sale|Instalar aplicación|solo Safari puede/;

  ['index.html', 'descargas/index.html', 'descargas/platachat.html', 'app/socio.html'].forEach(f => {
    test(f + ' no repite los nombres de menú que ya no existen', () => {
      const t = plano(sinComentarios(leer(f)));
      const m = t.match(VIEJOS);
      assert.ok(!m, f + ' todavía dice «' + (m && m[0]) + '»');
    });
  });

  test('index.html: el botón lleva a app/socio.html (la que se instala), con los pasos de Android y de iPhone', () => {
    const I = sinComentarios(leer('index.html'));
    const s = I.slice(I.indexOf('id="instalar"'), I.indexOf('</section>', I.indexOf('id="instalar"')));
    assert.match(s, /href="app\/socio\.html"/);
    const t = plano(s);
    assert.match(t, /Instalar y crear acceso directo/);
    assert.match(t, /Agregar a Inicio/);
    assert.match(t, /Abrir como app web/);
    assert.match(t, /Avisos al celular todavía no enviamos/);
  });

  test('descargas/index.html ya no le ofrece el APK a nadie nuevo: manda a Chrome', () => {
    const t = sinComentarios(leer('descargas/index.html'));
    assert.ok(!/href="TuGarantia\.apk"/.test(t), 'la página sigue ofreciendo el APK');
    assert.match(t, /href="\.\.\/app\/socio\.html"/);
    assert.match(plano(t), /Instalar y crear acceso directo/);
    assert.match(plano(t), /Agregar a Inicio/);
    /* El archivo se queda para quien ya lo tiene (enlaces viejos): no se borra. */
    assert.ok(fs.existsSync(path.join(RAIZ, 'descargas', 'TuGarantia.apk')));
  });

  test('sw.js precarga app/instalar.js y todo lo que socio.html carga con <script src>', () => {
    const SW = leer('sw.js');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS'), SW.indexOf('].map(f => BASE + f)'));
    const html = leer('app/socio.html');
    const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => 'app/' + m[1]);
    assert.ok(srcs.indexOf('app/instalar.js') >= 0, 'socio.html no carga app/instalar.js');
    srcs.forEach(s => assert.ok(lista.indexOf("'" + s + "'") >= 0, s + ' no está en la precarga: la app instalada no lo tendría sin señal'));
  });
});
