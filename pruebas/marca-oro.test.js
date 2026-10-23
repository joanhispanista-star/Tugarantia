/* ============================================================================
 * LA MARCA DE ORO Y LA BIENVENIDA QUE BRILLA — 23-oct-2026
 *
 *   node --test pruebas/marca-oro.test.js
 *
 * Joan: «quiero que el diseño del logo solo aparezca el nombre Tu Garantía, y
 * que el logo dorado de la G tenga un color más oro y que parezca que brilla,
 * mejora el logo, cuando se inicia en la app quiero que el inicio se vea el
 * logo de Tu Garantía cargando así como lo hicimos antes, quiero que el inicio
 * de la app sea mucho más genial». Se construyó la propuesta A, «Oro clásico».
 *
 * Lo que cuidan estas pruebas:
 *   1. EL LOGO DICE SOLO «TU GARANTÍA»: la G de oro y la palabra, sin
 *      «powered by NEXECO» y sin el sello rojo, en las cabeceras de la app,
 *      de play/ y de la portada, y en imagen en legal/, descargas/ y el
 *      borrado de cuenta. PlataChat es otra marca: su rama no se toca.
 *   2. NEXECO SIGUE DONDE LA LEY LO PIDE: en el pie de las tres páginas y en
 *      la casilla de autorización del registro, con el NIT del recuadro
 *      «Quién responde» de legal/ (si uno cambia, esto no deja que se separen).
 *   3. LOS ÍCONOS NUEVOS, con los mismos nombres y tamaños; el maskable a
 *      sangre (el de antes tenía 38,6 % de píxeles transparentes).
 *   4. LA BIENVENIDA: la G de oro en el centro, el anillo que gira (sin barra
 *      ni porcentaje), nada de internet, movimiento reducido, y que DURE LO
 *      QUE TARDE LA APP: mínimo para ver el brillo, espera a que haya algo que
 *      mostrar, tope, y el plazo de seguridad si el script revienta.
 *   5. EL ARRANQUE DE ANDROID EMPATA: el manifiesto se llama «Tu Garantía», su
 *      fondo es la laca de la bienvenida y el id no se tocó.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => String(t).replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const visible = h => sinComentarios(h).replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const AHORA = Date.parse('2026-10-23T15:00:00Z');
const DIA = 86400000;

/* El NIT de verdad, del recuadro «Quién responde» de los dos documentos. */
function nitDeLegal() {
  const nits = ['legal/privacidad.html', 'legal/terminos.html'].map(f => {
    const m = /data-dato="nit">([^<]+)</.exec(leer(f));
    return m ? m[1].trim() : null;
  });
  assert.ok(nits[0], 'legal/privacidad.html no tiene el NIT en su recuadro');
  assert.equal(nits[0], nits[1], 'los dos documentos legales dicen NIT distintos');
  return nits[0];
}

/* La cabecera de una página: lo que hay dentro del primer class="marca". */
function cabecera(html) {
  const i = html.indexOf('class="marca"');
  assert.ok(i >= 0, 'no hay class="marca"');
  const cierre = html.indexOf('</a>', i) >= 0 && html.indexOf('</a>', i) < html.indexOf('</div>', i)
    ? html.indexOf('</a>', i) : html.indexOf('</div>', i);
  return html.slice(i, cierre);
}

describe('1. el logo dice solo «Tu Garantía»: la G de oro y la palabra', () => {

  const PAGINAS = { 'app/socio.html': 2, 'play/index.html': 1, 'index.html': 1 };

  for (const [f, cuantas] of Object.entries(PAGINAS)) {
    test(f + ': la cabecera es la G de oro + la palabra, sin «powered by» ni sello rojo', () => {
      const H = sinComentarios(leer(f));
      const marcas = [...H.matchAll(/<(?:div|a) class="marca"[^>]*>([\s\S]*?)<\/(?:div|a)>/g)]
        .filter(m => m[0].indexOf('<svg class="g"') >= 0);
      assert.equal(marcas.length, cuantas, f + ': ' + marcas.length + ' cabeceras con la G de oro, se esperaban ' + cuantas);
      for (const m of marcas) {
        assert.match(m[1], /fill="url\(#boro\)"/, 'la G no es la de oro');
        assert.match(m[1], /class="destello"/, 'la G no tiene su destello');
        assert.match(m[1], /<svg class="palabra"[^>]*role="img"[^>]*aria-label="Tu Garantía"><use href="#palabra"\/><\/svg>/);
        assert.match(m[1], /<svg class="g" width="30" height="30"/, 'sin ancho ni alto, con la hoja vieja la G sale de 300 px');
        assert.ok(!/powered|NEXECO|porNexeco|class="pin"|class="sello"/i.test(m[1]), 'la cabecera sigue con lo de antes: ' + plano(m[1]));
      }
      /* Los moldes, una vez, y antes de usarse. */
      for (const id of ['boro', 'besp', 'bclip', 'dest', 'palabra']) {
        assert.equal((H.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, f + ': el molde #' + id + ' tiene que estar una vez');
      }
      assert.ok(!/powered by NEXECO/i.test(visible(leer(f))), f + ' sigue diciendo «powered by NEXECO»');
    });
  }

  test('la palabra va en curvas: ninguna página trae fuentes de internet para la marca', () => {
    for (const f of Object.keys(PAGINAS)) {
      const H = leer(f);
      assert.ok(!/fonts\.googleapis|@font-face|@import/.test(H), f + ' carga fuentes');
      assert.match(H, /<path id="palabra" d="M[\d.\s\-MLQZ]+Z"\/>/, f + ': la palabra no es un trazo');
    }
  });

  test('play/: la regla de la marca va EN LÍNEA (la lección del escáner) y la rama de PlataChat se queda', () => {
    const P = leer('play/index.html');
    const enLinea = P.slice(P.indexOf('<style>'), P.indexOf('</style>'));
    assert.match(enLinea, /\.marca \.g\{width:30px;height:30px/);
    assert.match(enLinea, /\.marca \.palabra\{width:120px;height:18px/);
    assert.match(P, /marcaCab\.innerHTML = '<span class="pin">P<\/span> PlataChat <span class="porNexeco">de Tu Garantía<\/span>'/,
      'la marca de PlataChat cambió: es otra marca y no se toca');
    const E = leer('play/estilo.css');
    assert.match(E, /\.marca \.porNexeco\{/, 'PlataChat usa .porNexeco: la regla se queda');
    assert.match(E, /\.pin\{/, 'PlataChat usa .pin: la regla se queda');
  });

  test('legal/, descargas/ y el borrado de cuenta: la marca en imagen (app/marca.svg), sin el sello rojo', () => {
    for (const f of ['legal/terminos.html', 'legal/privacidad.html', 'descargas/index.html', 'play/borrar-cuenta.html']) {
      const H = sinComentarios(leer(f));
      assert.match(H, /<img class="marca-img" src="\.\.\/app\/marca\.svg" alt="[^"]*" width="156" height="26">/, f + ' no lleva la marca nueva');
      assert.ok(!/<span class="(?:sello|pin)"[^>]*>G<\/span>/.test(H), f + ' sigue con el sello de la G');
    }
    const M = leer('app/marca.svg');
    assert.match(M, /aria-label="Tu Garantía"/);
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(M), 'app/marca.svg pide algo de internet');
    assert.ok(!/NEXECO|powered/i.test(M));
    const SW = leer('sw.js');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS'), SW.indexOf('].map(f => BASE + f)'));
    assert.ok(lista.indexOf("'app/marca.svg'") >= 0, 'app/marca.svg no está en la precarga: sin señal, legal/ saldría sin marca');
  });
});

describe('2. NEXECO sigue donde la ley lo pide', () => {

  test('la portada lo dice en el pie, con el NIT de legal/', () => {
    const nit = nitDeLegal();
    const I = leer('index.html');
    const pie = visible(I.slice(I.indexOf('<footer'), I.indexOf('</footer>')));
    assert.match(pie, /Tu Garantía es una marca de NEXECO S\.A\.S\./);
    assert.ok(pie.indexOf('NIT ' + nit) >= 0, 'el pie de la portada no dice el NIT ' + nit);
  });

  test('la app lo dice en el pie de Entrar, con el NIT de legal/', async () => {
    const nit = nitDeLegal();
    const A = abrirSocio({ ahora: AHORA });
    await asentar();
    const t = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(t, /Tu Garantía es una marca de NEXECO S\.A\.S\./, 'Entrar no dice quién responde');
    assert.ok(t.indexOf('NIT ' + nit) >= 0);
  });

  test('play/: en el pie y en la casilla de autorización, con el NIT de legal/', () => {
    const nit = nitDeLegal();
    const P = leer('play/index.html');
    const i = P.indexOf('\nfunction pie(');
    assert.ok(i >= 0);
    assert.match(P.slice(i, P.indexOf('\n}', i)), /quienResponde\(\)/, 'el pie de play/ no dice quién responde');
    const f = /function quienResponde\(\) \{ return '([^']+)'; \}/.exec(P);
    assert.ok(f, 'play/ no declara quienResponde');
    assert.ok(f[1].indexOf('NIT ' + nit) >= 0);
    const casilla = P.slice(P.indexOf('id="autGeneral"'), P.indexOf('</label>', P.indexOf('id="autGeneral"')));
    assert.match(casilla, /Los trata NEXECO S\.A\.S\. \(NIT ([\d.\-]+)\), la empresa que opera Tu Garantía/);
    assert.ok(casilla.indexOf('NIT ' + nit) >= 0, 'la casilla dice otro NIT');
  });
});

/* ---- PNG: tamaño y si tiene algo transparente, sin dependencias ---------- */
function leerPNG(f) {
  const b = fs.readFileSync(path.join(RAIZ, f));
  assert.equal(b.slice(1, 4).toString(), 'PNG', f + ' no es un PNG');
  const ancho = b.readUInt32BE(16), alto = b.readUInt32BE(20), tipo = b[25];
  let p = 8, trns = null; const datos = [];
  while (p < b.length) {
    const largo = b.readUInt32BE(p), nombre = b.slice(p + 4, p + 8).toString();
    const cuerpo = b.slice(p + 8, p + 8 + largo);
    if (nombre === 'tRNS') trns = cuerpo;
    if (nombre === 'IDAT') datos.push(cuerpo);
    p += 12 + largo;
  }
  return { ancho, alto, tipo, trns, b, datos: Buffer.concat(datos) };
}
/* ¿Algún píxel no opaco? Para paleta (tipo 3): los índices usados con alfa < 255. */
function tieneTransparencia(png) {
  if (png.tipo === 2 || png.tipo === 0) return !!png.trns;
  if (png.tipo === 3) {
    if (!png.trns) return false;
    const crudo = zlib.inflateSync(png.datos);
    const fila = png.ancho;   // 8 bits por píxel (es lo que hace achicar-png.py)
    const usados = new Set();
    for (let y = 0; y < png.alto; y++) {
      const o = y * (fila + 1);
      if (crudo[o] !== 0) return null;   // con filtro no se puede leer así: la prueba no sabe
      for (let x = 0; x < fila; x++) usados.add(crudo[o + 1 + x]);
    }
    for (const i of usados) if (i < png.trns.length && png.trns[i] < 255) return true;
    return false;
  }
  return null;
}

describe('3. los íconos nuevos, con los mismos nombres y tamaños', () => {

  const TAMANOS = { 'app/icono-180.png': 180, 'app/icono-192.png': 192, 'app/icono-512.png': 512, 'app/icono-maskable-512.png': 512 };

  test('cada uno mide lo que dice su nombre (el manifiesto y el APK los nombran así)', () => {
    for (const [f, lado] of Object.entries(TAMANOS)) {
      const p = leerPNG(f);
      assert.equal(p.ancho, lado, f);
      assert.equal(p.alto, lado, f);
    }
    const m = JSON.parse(leer('app/app.webmanifest'));
    for (const i of m.icons) assert.ok(fs.existsSync(path.join(RAIZ, 'app', i.src)), 'el manifiesto nombra ' + i.src + ' y no existe');
  });

  test('el maskable va a sangre: ni un píxel transparente', () => {
    const p = leerPNG('app/icono-maskable-512.png');
    const t = tieneTransparencia(p);
    if (t === null) {
      /* Sin filtro conocido no se decodifica aquí: que al menos no declare alfa. */
      assert.ok(!p.trns && (p.tipo === 2 || p.tipo === 3), 'el maskable declara transparencia');
    } else {
      assert.equal(t, false, 'el maskable tiene píxeles transparentes: según el lanzador sale un aro o una esquina blanca');
    }
  });

  test('son los de la marca de oro, no los de antes', () => {
    let antes = null;
    for (const rama of ['origin/main', 'main']) {
      try {
        antes = execFileSync('git', ['show', rama + ':app/icono-maskable-512.png'], { cwd: RAIZ, encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] });
        break;
      } catch (e) { /* la siguiente */ }
    }
    if (!antes) return;
    assert.ok(!antes.equals(fs.readFileSync(path.join(RAIZ, 'app/icono-maskable-512.png'))), 'el ícono maskable sigue siendo el de antes');
  });
});

describe('4. la bienvenida: la G de oro que brilla, y dura lo que tarde la app', () => {

  const S = leer('app/socio.html');
  const hola = S.slice(S.indexOf('<div id="hola"'), S.indexOf('<div class="version" id="holaVersion"'));
  const css = S.slice(S.indexOf('/* ---------------- la bienvenida'), S.indexOf('</style>'));

  test('la G grande es la de oro, con destello y chispa, y la palabra en curvas', () => {
    assert.match(hola, /<svg class="g-grande"[^>]*>[\s\S]*fill="url\(#aoro\)"[\s\S]*class="destello"[\s\S]*class="chispa"/);
    assert.match(hola, /<svg class="nombre"[^>]*aria-label="Tu Garantía"><use href="#palabra"\/><\/svg>/);
    for (const id of ['aoro', 'aesp', 'aclip', 'amluz', 'amsom', 'chispaLuz']) {
      assert.equal((S.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, 'el molde #' + id);
    }
    assert.ok(!/NEXECO|powered/i.test(hola), 'la bienvenida nombra a NEXECO: el logo dice solo «Tu Garantía»');
  });

  test('sin barra ni porcentaje: el anillo gira y no cuenta nada', () => {
    assert.ok(!/<progress|role="progressbar"|aria-valuenow|%<|\d+\s*%/.test(hola), 'la bienvenida cuenta un porcentaje que no sabe');
    assert.match(hola, /class="orbita"[\s\S]*class="giro"/);
    assert.match(css, /#hola \.giro\{[^}]*animation:hola-girar [^}]*infinite/);
  });

  test('la G va en el centro: lo de debajo no la empuja (empata con el arranque de Android)', () => {
    assert.match(css, /#hola\{[^}]*display:grid;place-items:center/);
    assert.match(css, /#hola \.debajo\{position:absolute;left:50%;top:100%/);
    assert.match(hola, /<div class="marco">\s*<div class="sello"[\s\S]*<\/div>\s*<div class="debajo">/);
  });

  test('nada de internet: ni fuentes, ni imágenes de afuera', () => {
    /* Solo los data: (el grano) y las referencias internas (#id, o %23id dentro de un data:). */
    assert.ok(!/url\((?!["']?data:|#|%23)/.test(css), 'la bienvenida pide algo por url()');
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(hola + css), 'la bienvenida apunta a internet');
  });

  test('con movimiento reducido, todo lo que se mueve se queda quieto y la G sigue brillando', () => {
    const i = css.lastIndexOf('@media (prefers-reduced-motion:reduce)');
    const regla = css.slice(i);
    for (const sel of ['#hola .orbita', '#hola .g-grande', '#hola .nombre', '#hola .giro', '#hola .destello', '#hola .chispa', '#hola .aura', '#hola .halo']) {
      assert.ok(regla.indexOf(sel) >= 0, sel + ' se mueve con el movimiento reducido');
    }
    assert.match(regla, /#hola \.destello\{transform:translateX\(34px\);opacity:\.6\}/, 'quieta, la G pierde el brillo');
  });

  const nube = colgada => (url) => {
    if (colgada && /rpc\/|auth\//.test(url)) return new Promise(() => {});
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
  const SESION = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: AHORA + 30 * DIA, celular: '3001112222' });
  const reloj = (A, ms) => A.temporizadores.find(t => t.ms === ms);

  test('sin sesión: el mínimo es para ver el brillo, y al cumplirse se va (Entrar ya tiene qué mostrar)', async () => {
    const A = abrirSocio({ ahora: AHORA, performanceNow: 0 });
    await asentar();
    const min = reloj(A, 2000), tope = reloj(A, 4000);
    assert.ok(min, 'no hay reloj del mínimo de 2 s');
    assert.ok(tope, 'no hay tope de 4 s: si la cuenta no llega, la bienvenida se quedaría hasta el plazo de seguridad');
    assert.ok(!A.elem('hola').classList.contains('fuera'));
    min.fn();
    assert.ok(A.elem('hola').classList.contains('fuera'), 'cumplido el mínimo y con Entrar pintada, no se fue');
  });

  test('con sesión: si al mínimo la cuenta no ha llegado, ESPERA; se va cuando hay qué mostrar', async () => {
    const A = abrirSocio({ ahora: AHORA, performanceNow: 0, local: { socio_cuenta: SESION }, red: nube(true) });
    await asentar(8);
    assert.equal(A.ev('PANTALLA'), 'cargando', 'la prueba necesita la cuenta pidiéndose');
    reloj(A, 2000).fn();
    assert.ok(!A.elem('hola').classList.contains('fuera'), 'se fue con «Buscando tu historial…» detrás: dos pantallas de carga');
    A.ev("PANTALLA = 'inicio'; mostrar('pCuenta')");
    assert.ok(A.elem('hola').classList.contains('fuera'), 'llegó la cuenta y la bienvenida no se fue');
  });

  test('con sesión y la nube colgada: el tope la quita a los 4 s', async () => {
    const A = abrirSocio({ ahora: AHORA, performanceNow: 0, local: { socio_cuenta: SESION }, red: nube(true) });
    await asentar(8);
    reloj(A, 2000).fn();
    reloj(A, 4000).fn();
    assert.ok(A.elem('hola').classList.contains('fuera'), 'el tope no la quitó');
  });

  test('el plazo de seguridad sigue arriba, aparte del guion grande, por encima del tope', () => {
    const bloques = [...S.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1].trim());
    const plazo = bloques.map(b => /\}, (\d+)\);$/.exec(b)).find(Boolean);
    assert.ok(plazo, 'sin plazo de seguridad');
    assert.ok(Number(plazo[1]) > 4000 && Number(plazo[1]) <= 6000, 'el plazo de seguridad (' + plazo[1] + ') tiene que quedar por encima del tope de 4 s');
    assert.match(S, /var TOPE_BIENVENIDA = 4000;/);
  });
});

describe('5. el arranque de Android empata con la bienvenida', () => {

  test('el manifiesto se llama «Tu Garantía», su fondo es la laca de la bienvenida y el id no se tocó', () => {
    const m = JSON.parse(leer('app/app.webmanifest'));
    assert.equal(m.name, 'Tu Garantía');
    assert.equal(m.short_name, 'Tu Garantía');
    assert.equal(m.id, '/TuGarantia/app/socio.html', 'el id de la instalación cambió');
    const laca = /--laca:(#[0-9A-Fa-f]{6})/.exec(leer('app/socio.html'))[1];
    assert.equal(m.background_color.toUpperCase(), laca.toUpperCase(), 'la pantalla de arranque de Android y la bienvenida no son del mismo negro');
    assert.match(leer('app/socio.html'), /#hola\{position:fixed;inset:0;z-index:99;background:var\(--laca\)/);
  });
});
