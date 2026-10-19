/* ============================================================================
 * EL TELÉFONO DE VERDAD — app/aparato.js y el lector de app/cuenta.js
 * 19 de octubre de 2026.
 *
 *   node --test pruebas/aparato.test.js
 *
 * Joan: el «tipo de celular» del panel no es el teléfono real del cliente. La
 * prueba que había (pruebas/cuenta.test.js) solo miraba la cadena de un
 * navegador DENTRO de otra app, con «Build/», que es el caso raro; la que
 * mandan más del 90% de los Android —«Android 10; K», congelada desde Chrome
 * 110— no la miraba nadie, y por eso todo pasaba en verde mientras el CRM
 * decía «Android 10 · K · Chrome» para todos.
 *
 * Aquí: las cadenas reales (congelada, iOS 26, Facebook, TikTok, Huawei), lo
 * que pregunta el teléfono (con y sin userAgentData, con el límite de tiempo,
 * la app por el referrer), la marca por el prefijo, lo que ve Joan, y que las
 * listas cerradas digan lo mismo que la base.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const U = require('../app/cuenta.js');
const A = require('../app/aparato.js');
const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'base', '20261019_aparato_del_telefono.sql'), 'utf8');

const UA = {
  congelada: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsungInternet: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  facebook: 'Mozilla/5.0 (Linux; Android 14; SM-A155M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.36.106;]',
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadEscritorio: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
};
/* Lo que contesta getHighEntropyValues en un Galaxy A15 con Android 14. */
const ALTO_A15 = { platform: 'Android', mobile: true, model: 'SM-A155M', platformVersion: '14.0.0',
  brands: [{ brand: 'Chromium', version: '129' }, { brand: 'Google Chrome', version: '129' }],
  fullVersionList: [{ brand: 'Chromium', version: '129.0.6668.100' }, { brand: 'Google Chrome', version: '129.0.6668.100' },
                    { brand: 'Not=A?Brand', version: '8.0.0.0' }] };

function almacen(inicial) {
  const d = Object.assign({}, inicial || {});
  return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}
const navegador = (ua, alto) => ({ userAgent: ua, maxTouchPoints: 0,
  userAgentData: alto === undefined ? undefined : { getHighEntropyValues: () => Promise.resolve(alto) } });

/* ==========================================================================
 * 1. EL USER-AGENT, SIN INVENTAR (fase A, app/cuenta.js)
 * ======================================================================== */
describe('el user-agent, leído sin inventar (fase A)', () => {

  test('la cadena congelada de Chrome en Android NO se lee como versión ni como modelo', () => {
    const t = U.dispositivoDe(UA.congelada);
    assert.equal(t, 'Android · el navegador oculta el modelo y la versión · Chrome 129');
    assert.doesNotMatch(t, /Android 10|\bK\b/, 'volvió a leer «Android 10; K» como si fuera el teléfono');
    const L = U.leerUserAgent(UA.congelada);
    assert.equal(L.congelado, true);
    assert.equal(L.modelo, '');
    assert.equal(L.sistema_version, '');
    /* Samsung Internet manda la misma. */
    assert.equal(U.dispositivoDe(UA.samsungInternet), 'Android · el navegador oculta el modelo y la versión · Samsung Internet 26');
  });

  test('iPhone con iOS 26: la cifra congelada 18_6 / 18_7 no manda, manda Version/', () => {
    assert.equal(U.dispositivoDe(UA.iphone26), 'iPhone · iOS 26 · Safari');
    assert.equal(U.dispositivoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1'),
      'iPhone · iOS 26.2 · Safari');
    /* Un iOS 18.6 de verdad, con su Safari 18.6, se dice tal cual. */
    assert.equal(U.dispositivoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'),
      'iPhone · iOS 18.6 · Safari');
    /* Sin Version/ (el navegador de Facebook) no se sabe si 18.6 es la de
       verdad o la congelada: se dice «o más nuevo». */
    assert.equal(U.dispositivoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/485.0.0.36.106]'),
      'iPhone · iOS 18.6 o más nuevo · dentro de Facebook');
  });

  test('dentro de Facebook, Instagram o TikTok se dice cuál; «(app)» no vuelve', () => {
    const fb = U.dispositivoDe(UA.facebook);
    assert.equal(fb, 'SM-A155M · Android 14 · dentro de Facebook');
    assert.equal(U.dispositivoDe('Mozilla/5.0 (Linux; Android 13; SM-A245M Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.146 Mobile Safari/537.36 Instagram 349.0.0.39.106 Android'),
      'SM-A245M · Android 13 · dentro de Instagram');
    assert.equal(U.dispositivoDe('Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 trill_350402 AppName/musical_ly BytedanceWebview/d8a21c6'),
      'SM-A135M · Android 13 · dentro de TikTok');
    assert.doesNotMatch(fb, /\(app\)/);
  });

  test('un iPad que pide la página de escritorio es «Mac o iPad»; Huawei, Motorola y Xiaomi traen su modelo', () => {
    assert.equal(U.dispositivoDe(UA.ipadEscritorio), 'Mac o iPad · Safari');
    assert.equal(U.dispositivoDe('Mozilla/5.0 (Linux; Android 12; HarmonyOS; ANA-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36'),
      'ANA-NX9 · Android 12 · Navegador Huawei 15');
    /* Un Motorola trae paréntesis dentro del modelo. */
    assert.equal(U.leerUserAgent('Mozilla/5.0 (Linux; Android 11; moto g(60) Build/RRIS31.Q1-42-51-12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36').modelo,
      'moto g(60)');
    /* El navegador de Xiaomi copia la firma del incrustado, y es un navegador. */
    assert.equal(U.dispositivoDe('Mozilla/5.0 (Linux; U; Android 13; es-us; 2312DRA50G Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.5.1-gn'),
      '2312DRA50G · Android 13 · Navegador Xiaomi 14');
  });
});

/* ==========================================================================
 * 2. LO QUE PREGUNTA EL TELÉFONO (fase B, app/aparato.js)
 * ======================================================================== */
describe('lo que pregunta el teléfono', () => {

  test('con userAgentData: el modelo, la versión y el navegador de verdad, y que es nuestra app', async () => {
    const alm = almacen();
    const d = await A.leerAparato({ navegador: navegador(UA.congelada, ALTO_A15),
      documento: { referrer: 'android-app://co.tugarantia.creditos/' }, almacen: alm,
      matchMedia: () => ({ matches: true }) });
    assert.deepEqual(d, { plataforma: 'android', sistema_version: '14', modelo: 'SM-A155M', navegador: 'Chrome',
      navegador_version: '129', via: 'app_tu_garantia', fuente_modelo: 'client_hints', movil: true });
    const w = A.enPalabras(d);
    assert.equal(w.texto, 'Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía');
    assert.equal(w.nota, 'Lo informa el navegador del teléfono.');
    assert.deepEqual(w.noSabe, []);
  });

  test('sin userAgentData (Firefox, Safari): lo que diga la cadena, y al instante', async () => {
    const d = await A.leerAparato({ navegador: navegador(UA.firefox), almacen: almacen() });
    assert.equal(d.plataforma, 'android');
    assert.equal(d.sistema_version, '14');
    assert.equal(d.modelo, null);
    assert.equal(d.sin_modelo, 'el_navegador_no_lo_dice');
    assert.equal(d.via, 'navegador');
    const w = A.enPalabras(d);
    assert.equal(w.texto, 'Android 14 · Firefox 131');
    assert.equal(w.nota, 'El navegador no dijo el modelo.');
    assert.deepEqual(w.noSabe, ['modelo']);
  });

  test('EL LÍMITE DE TIEMPO: si el navegador no contesta, sale con lo que hay y nunca se queda colgada', async () => {
    let alarma = null, pedido = 0;
    const nav = { userAgent: UA.congelada, userAgentData: { getHighEntropyValues: () => new Promise(() => {}) } };
    const p = A.leerAparato({ navegador: nav, almacen: almacen(), reloj: (fn, ms) => { alarma = fn; pedido = ms; } }, { tiempo: 800 });
    assert.equal(pedido, 800, 'no puso el límite de 800 ms');
    alarma();
    const d = await p;
    assert.equal(d.plataforma, 'android');
    assert.equal(d.modelo, null);
    assert.equal(d.sin_modelo, 'el_navegador_no_lo_dice');
    assert.ok(!('sistema_version' in d), 'inventó una versión de la cadena congelada');
  });

  test('si el navegador lanza o rechaza, tampoco falla: nunca se rechaza la promesa', async () => {
    const lanza = { userAgent: UA.congelada, userAgentData: { getHighEntropyValues: () => { throw new Error('NotAllowedError'); } } };
    assert.equal((await A.leerAparato({ navegador: lanza, almacen: almacen() })).plataforma, 'android');
    const rechaza = { userAgent: UA.congelada, userAgentData: { getHighEntropyValues: () => Promise.reject(new Error('x')) } };
    assert.equal((await A.leerAparato({ navegador: rechaza, almacen: almacen() })).plataforma, 'android');
    /* Un entorno vacío o roto: un objeto, nunca una excepción. Sin cadena no
       se afirma nada del aparato, ni siquiera que le falte el modelo. */
    assert.deepEqual(await A.leerAparato(), { via: 'navegador' });
    const roto = { get userAgent() { throw new Error('roto'); } };
    assert.deepEqual(await A.leerAparato({ navegador: roto }), {});
  });

  test('iPhone: sin modelo y con su motivo; la versión sale de Version/, no de la cifra congelada', async () => {
    const d = await A.leerAparato({ navegador: navegador(UA.iphone26), almacen: almacen() });
    assert.equal(d.plataforma, 'ios');
    assert.equal(d.sistema_version, '26');
    assert.equal(d.modelo, null);
    assert.equal(d.sin_modelo, 'apple_no_lo_entrega');
    const w = A.enPalabras(d);
    assert.equal(w.texto, 'iPhone · iOS 26 · Safari');
    assert.equal(w.nota, 'Apple no deja a una página saber el modelo exacto.');
    /* Y no se estima el modelo por la pantalla (decisión del 19-oct). */
    assert.ok(!/aprox/i.test(fs.readFileSync(path.join(RAIZ, 'app', 'aparato.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
      'apareció una estimación del modelo: Joan decidió no estimarlo');
  });

  test('un «Mac» con pantalla táctil es un iPad pidiendo la página de escritorio', async () => {
    const nav = navegador(UA.ipadEscritorio); nav.maxTouchPoints = 5;
    const d = await A.leerAparato({ navegador: nav, almacen: almacen() });
    assert.equal(d.plataforma, 'ipados');
    assert.equal(d.sistema_version, '26');
    assert.equal(d.sin_modelo, 'apple_no_lo_entrega');
    assert.equal(A.enPalabras(d).texto, 'iPad · iPadOS 26 · Safari');
    /* Sin pantalla táctil es un Mac, y es un computador. */
    const mac = await A.leerAparato({ navegador: navegador(UA.ipadEscritorio), almacen: almacen() });
    assert.equal(mac.plataforma, 'mac');
    assert.equal(A.enPalabras(mac).nota, 'Es un computador, no un celular.');
  });

  test('LA APP: el referrer se guarda en localStorage y vale después solo en pantalla completa', async () => {
    const alm = almacen();
    const enApp = { matchMedia: () => ({ matches: true }) };
    /* Primera carga, dentro de la app. */
    let d = await A.leerAparato(Object.assign({ navegador: navegador(UA.congelada), almacen: alm,
      documento: { referrer: 'android-app://co.tugarantia.creditos/' } }, enApp));
    assert.equal(d.via, 'app_tu_garantia');
    assert.match(alm.d[A.LLAVE_APP], /co\.tugarantia\.creditos/, 'no lo dejó anotado');
    /* La recarga de la cámara: sin referrer, pero en pantalla completa. */
    d = await A.leerAparato(Object.assign({ navegador: navegador(UA.congelada), almacen: alm, documento: { referrer: '' } }, enApp));
    assert.equal(d.via, 'app_tu_garantia');
    /* El mismo Chrome, como pestaña normal: no es la app. */
    d = await A.leerAparato({ navegador: navegador(UA.congelada), almacen: alm, documento: { referrer: '' },
      matchMedia: () => ({ matches: false }) });
    assert.equal(d.via, 'navegador');
    /* Instalada desde el navegador, sin haber abierto nunca la app. */
    d = await A.leerAparato(Object.assign({ navegador: navegador(UA.congelada), almacen: almacen() }, enApp));
    assert.equal(d.via, 'pagina_instalada');
    /* PlataChat es otra app; y un paquete ajeno no es ninguna de las nuestras. */
    assert.equal(A.viaDe({ documento: { referrer: 'android-app://co.tugarantia.platachat/' }, almacen: almacen() }), 'app_platachat');
    assert.equal(A.viaDe({ documento: { referrer: 'android-app://com.facebook.katana/' }, almacen: almacen() }), 'navegador');
    assert.equal(A.appDeReferrer('android-app://co.tugarantia.otra/'), '');
  });

  test('el navegador incrustado de otra app no se hace pasar por nuestra app', async () => {
    const alto = Object.assign({}, ALTO_A15, { fullVersionList: [{ brand: 'Android WebView', version: '129.0.0.0' }, { brand: 'Chromium', version: '129.0.0.0' }] });
    const d = await A.leerAparato({ navegador: navegador(UA.congelada, alto), almacen: almacen() });
    assert.equal(d.via, 'dentro_de_otra_app');
    assert.equal(d.modelo, 'SM-A155M');
    assert.equal(A.enPalabras(d).texto, 'Samsung SM-A155M · Android 14 · dentro de otra app');
    /* Facebook lo dice la cadena, y gana. */
    const fb = await A.leerAparato({ navegador: navegador(UA.facebook, alto), almacen: almacen() });
    assert.equal(fb.via, 'dentro_de_facebook');
  });
});

/* ==========================================================================
 * 3. LA MARCA Y LO QUE VE JOAN
 * ======================================================================== */
describe('la marca por el prefijo, y lo que ve Joan', () => {

  test('la marca por el prefijo; si el prefijo es de dos marcas, se nombran las dos', () => {
    const casos = { 'SM-A155M': 'Samsung', 'moto g(60)': 'Motorola', 'XT2343-2': 'Motorola', 'RMX3830': 'realme',
      'CPH2591': 'OPPO u OnePlus', 'V2318': 'vivo', 'TECNO KI5q': 'TECNO', 'Infinix X6831': 'Infinix',
      'ANA-NX9': 'Huawei u HONOR', 'JNY-LX3': 'Huawei u HONOR', '2312DRA50G': 'Xiaomi, Redmi o POCO',
      '23129RAA4G': 'Xiaomi, Redmi o POCO', 'M2101K6G': 'Xiaomi, Redmi o POCO', 'Redmi Note 13': 'Xiaomi',
      'Pixel 8': 'Google', 'K': '', 'ABC123': '' };
    Object.keys(casos).forEach(m => assert.equal(A.marcaDeModelo(m), casos[m], m));
    /* «TECNO KI5q», no «TECNO TECNO KI5q». */
    assert.equal(A.enPalabras({ plataforma: 'android', modelo: 'TECNO KI5q', sistema_version: '13' }).texto, 'TECNO KI5q · Android 13');
  });

  test('lo que no tiene forma de modelo no se pinta, ni viaja', () => {
    assert.equal(A.enPalabras({ plataforma: 'android', modelo: '<img src=x onerror=alert(1)>' }).texto, 'Android');
    const l = A.limpiar({ plataforma: 'nokia3310', modelo: '<script>', sistema_version: '14; drop', navegador: 'Netscape',
      navegador_version: '12345', via: 'por ahí', sin_modelo: 'porque_si', fuente_modelo: 'yo', movil: 'si', otro: 1 });
    assert.deepEqual(l, {});
  });

  test('la huella de un registro: lo informado si lo hay; si no, «el modelo no se supo»', () => {
    const nueva = { aparato: UA.congelada, aparato_telefono: { plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14',
      navegador: 'Chrome', navegador_version: '129', via: 'app_tu_garantia' } };
    assert.equal(A.deLaHuella(nueva).texto, 'Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía');
    /* Un registro de antes del 19-oct, con la cadena congelada. */
    const vieja = A.deLaHuella({ aparato: UA.congelada });
    assert.equal(vieja.texto, 'Android · el modelo no se supo · Chrome 129');
    assert.match(vieja.nota, /anterior al 19-oct-2026/);
    /* Uno viejo que venía de Facebook sí traía el modelo. */
    assert.equal(A.deLaHuella({ aparato: UA.facebook }).texto, 'Samsung SM-A155M · Android 14 · dentro de Facebook');
    /* Uno de iPhone: lo de Apple, no «no se supo». */
    assert.equal(A.deLaHuella({ aparato: UA.iphone26 }).nota, 'Apple no deja a una página saber el modelo exacto.');
    assert.equal(A.deLaHuella({}), null);
    assert.equal(A.deLaHuella(null), null);
  });

  test('las filas de aparatos_de: de la más nueva a la más vieja, sin la constancia repetida', () => {
    const filas = A.filasDeAparatos([
      { cuando: 'registro', momento: '2026-10-19T14:00:00+00:00', ip: '181.50.1.2, 10.0.0.1', ua: UA.congelada, declarado: {}, origen: 'telefono' },
      { cuando: 'aceptacion', momento: '2026-10-19T16:00:00+00:00', ip: '181.50.1.2', ua: UA.congelada, declarado: {}, origen: 'constancia' },
      { cuando: 'aceptacion', momento: '2026-10-19T16:00:03+00:00', ip: '181.50.1.2', ua: UA.congelada, origen: 'telefono',
        declarado: { plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14' } },
      { cuando: 'aceptacion', momento: '2026-10-10T16:00:00+00:00', ip: '', ua: UA.congelada, declarado: {}, origen: 'constancia' },
      { cuando: 'solicitud', momento: '2026-10-19T15:00:00+00:00', ip: '', ua: UA.iphone26, origen: 'telefono',
        declarado: { plataforma: 'ios', sistema_version: '26', navegador: 'Safari', sin_modelo: 'apple_no_lo_entrega' } }
    ]);
    assert.deepEqual(filas.map(f => f.cuando), ['Al aceptar', 'Al pedir', 'Al registrarse', 'Al aceptar (constancia)']);
    assert.equal(filas[0].texto, 'Samsung SM-A155M · Android 14');
    assert.equal(filas[1].texto, 'iPhone · iOS 26 · Safari');
    assert.equal(filas[2].texto, 'Android · el modelo no se supo · Chrome 129');
    assert.equal(filas[2].ip, '181.50.1.2');
    assert.equal(filas[3].constancia, true, 'la constancia vieja, que no tiene aviso del teléfono, sí se ve');
    assert.deepEqual(A.filasDeAparatos(null), []);
  });

  test('el modelo NO sube de peso en la regla de fraude', () => {
    /* Diez registros desde un «Samsung SM-A155M» informado, cada uno en su
       red: miles de personas tienen ese teléfono. La regla sigue mirando solo
       la cabecera, y la congelada no cuenta nunca. */
    const R = require('../app/revision-registro.js');
    const congelada = UA.congelada;
    const informado = { plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14', navegador: 'Chrome' };
    const reg = { id: 1, nombre: 'Ana', cedula: '1029384274', telefono: '3001112233', creado_en: '2026-10-19T15:00:00+00:00',
      datos: { documento: '1029384274', celular: '3001112233' },
      huella: { ip: '181.50.1.2', aparato: congelada, aparato_telefono: informado } };
    const otros = Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, nombre: 'Otro ' + i, cedula: String(60000000 + i),
      telefono: '31000000' + String(10 + i), creado_en: '2026-10-18T12:00:00+00:00',
      datos: { documento: String(60000000 + i), celular: '31000000' + String(10 + i) },
      huella: { ip: '190.0.0.' + i, aparato: congelada, aparato_telefono: informado } }));
    const res = R.revisarRegistro(reg, { otros, hoy: '2026-10-19' });
    assert.deepEqual(res.para_mirar.filter(x => x.regla === 'red'), [], 'el modelo informado pesó en la regla de fraude');
    assert.ok(!/aparato_telefono/.test(fs.readFileSync(path.join(RAIZ, 'app', 'revision-registro.js'), 'utf8')),
      'la regla de fraude empezó a leer el modelo informado: Joan decidió que no pesa');
  });
});

/* ==========================================================================
 * 4. LAS LISTAS DICEN LO MISMO QUE LA BASE
 * ======================================================================== */
describe('la app y la base aceptan lo mismo', () => {
  const lista = campo => {
    const m = new RegExp("d ->> '" + campo + "' in \\(([^)]*)\\)").exec(SQL);
    assert.ok(m, 'la base no valida ' + campo + ' con una lista cerrada');
    return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
  };

  test('plataformas, navegadores, vías, motivos y fuentes', () => {
    assert.deepEqual(lista('plataforma'), A.PLATAFORMAS);
    assert.deepEqual(lista('navegador'), A.NAVEGADORES);
    assert.deepEqual(lista('via'), A.VIAS);
    assert.deepEqual(lista('sin_modelo'), A.SIN_MODELO);
    assert.deepEqual(lista('fuente_modelo'), A.FUENTES);
  });

  test('y la forma del modelo: lo que pasa en una pasa en la otra', () => {
    const m = /d ->> 'modelo' ~ '([^']+)'/.exec(SQL);
    assert.ok(m, 'la base no valida la forma del modelo');
    const enLaBase = new RegExp(m[1]);
    ['SM-A155M', 'moto g(60)', 'Redmi Note 13 Pro+', '2312DRA50G', 'K', 'TECNO KI5q', 'Pixel 8 Pro',
     '<script>', ' espacio', 'a'.repeat(61), 'x;y', 'Más', ''].forEach(s =>
      assert.equal(A.limpiar({ modelo: s }).modelo === s, enLaBase.test(s), 'no casan con «' + s + '»'));
  });

  test('todo lo que leerAparato puede mandar, la base lo acepta', async () => {
    const d = await A.leerAparato({ navegador: navegador(UA.congelada, ALTO_A15),
      documento: { referrer: 'android-app://co.tugarantia.creditos/' }, almacen: almacen(), matchMedia: () => ({ matches: true }) });
    Object.keys(d).forEach(k => assert.ok(SQL.indexOf("d -> '" + k + "'") >= 0 || SQL.indexOf("d ->> '" + k + "'") >= 0,
      'la app manda «' + k + '» y la base no lo lee: se perdería sin avisar'));
  });
});
