/* ===========================================================================
 * EL ESCÁNER DE LA CÉDULA — 21 de septiembre de 2026
 *
 * Joan: «al tomar la foto de la cédula la página lo devuelve al primer paso»,
 * «la foto es muy aburrida, quiero que parezca que la cámara escanea la
 * cédula», «la información debe poderse rellenar automáticamente».
 *
 * Lo que se prueba acá SIN cámara ni cédula real:
 *   · el lector puro: lee un PDF417 fabricado con la forma de la cédula a 3 px
 *     por módulo, falla a 1,2, falla de pie (por eso el recorte se gira), y
 *     SIEMPRE termina en una sola llamada — el bucle infinito de
 *     decodeFromImageUrl era el defecto vivo;
 *   · la puerta del encuadre: tarjeta quieta sí, mesa no, oscuro no, borrosa no;
 *   · el marco: de pie en vertical, acostado en apaisado;
 *   · de quién son las fotos: mismo celular y mismo día;
 *   · y dentro de la página real: sin cámara caen las cajas de siempre, con
 *     cámara aparece el escáner, y la foto fija LEE y RELLENA el formulario.
 *
 * La fábrica de códigos (fabrica-pdf417.js) arma el PDF417 con las tablas del
 * propio ZXing del repo: si un día se actualiza la librería, la fábrica arma
 * códigos que ESE lector entiende, o se cae ella primero.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EC = require('../app/escaner-cedula.js');
const U = require('../app/cuenta.js');
const F = require('./fabrica-pdf417.js');
const { abrirPlay } = require('./banco-play.js');

const RAIZ = path.join(__dirname, '..');
const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
const SIN_COMENTARIOS = PLAY.replace(/\/\*[\s\S]*?\*\//g, ' ');
const BUNDLE = fs.readFileSync(path.join(RAIZ, 'app', 'lib', 'zxing.min.js'), 'utf8');

const CODIGO = F.fabricar(F.registroCedula(), 15, 5);
const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

describe('el lector del PDF417, por la ruta pura', () => {
  test('lee la cédula fabricada a 3 px por módulo y devuelve a la persona, sin el RH', () => {
    F.latin1EnNode(true);
    try {
      const { lum, W, H } = F.render(CODIGO, 3, 1.0, 6);
      const r = EC.decodificarLuminancias(F.Z, lum, W, H);
      assert.ok(r.texto, 'no leyó: ' + r.error);
      const c = EC.cedulaDelTexto(U.leerCedulaPDF417, r.texto);
      assert.equal(c.documento, '1234567');
      assert.equal(c.nombres, 'JUAN CARLOS');
      assert.equal(c.apellidos, 'PEREZ GOMEZ');
      assert.equal(c.nacimiento, '1990-05-15');
      assert.equal(c.rh, undefined, 'el tipo de sangre es dato de salud y no puede salir de aquí');
    } finally { F.latin1EnNode(false); }
  });

  test('a 2,5 px con el desenfoque normal de un celular también lee', () => {
    F.latin1EnNode(true);
    try {
      const { lum, W, H } = F.render(CODIGO, 2.5, 1.0, 6);
      assert.ok(EC.decodificarLuminancias(F.Z, lum, W, H).texto, 'a 2,5 px/módulo ya no lee: el marco tendría que ser más exigente');
    } finally { F.latin1EnNode(false); }
  });

  test('a 1,2 px NO lee, lo dice, y lo intenta UNA sola vez', () => {
    /* MUTANTE QUE CAZA: volver a decodeFromImageUrl, que reintenta a 0 ms para
       siempre cuando el código se ve pero no se corrige. Medido: 21 mapas de
       bits de 10 MB en 300 ms y una promesa que nunca vuelve. */
    const { lum, W, H } = F.render(CODIGO, 1.2, 1.0, 6);
    let veces = 0;
    const original = F.Z.PDF417Reader.prototype.decode;
    F.Z.PDF417Reader.prototype.decode = function () { veces++; return original.apply(this, arguments); };
    try {
      const r = EC.decodificarLuminancias(F.Z, lum, W, H);
      assert.ok(!r.texto);
      assert.ok(['no_hay', 'ilegible'].includes(r.error), 'error raro: ' + r.error);
      assert.equal(veces, 1, 'el lector decodificó ' + veces + ' veces: cada una es un mapa de bits entero');
    } finally { F.Z.PDF417Reader.prototype.decode = original; }
  });

  test('de pie (girado 90°) no lee: por eso el recorte se gira ANTES de leer', () => {
    F.latin1EnNode(true);
    try {
      const r0 = F.render(CODIGO, 3, 1.0, 6);
      const g = F.girar90(r0.lum, r0.W, r0.H);
      assert.ok(!EC.decodificarLuminancias(F.Z, g.lum, g.W, g.H).texto, 'leyó de pie: entonces el giro de 90° sobra');
      assert.match(SIN_COMENTARIOS, /bases\.push\(90\)/, 'la página dejó de probar el giro de 90° para la foto de pie');
    } finally { F.latin1EnNode(false); }
  });

  test('sin ZXing dice sin_lector y no revienta; con basura dice no_hay', () => {
    assert.equal(EC.decodificarLuminancias(null, new Uint8ClampedArray(4), 2, 2).error, 'sin_lector');
    assert.equal(EC.decodificarLuminancias(F.Z, null, 0, 0).error, 'no_hay');
  });

  test('un texto sin número de documento no es una cédula', () => {
    assert.equal(EC.cedulaDelTexto(U.leerCedulaPDF417, 'hola'), null);
    assert.equal(EC.cedulaDelTexto(null, 'x'), null);
  });
});

describe('la puerta del encuadre (medirTarjeta)', () => {
  const W = 64, H = 96;
  const cuadro = f => { const g = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = f(x, y);
    return g; };
  const adentro = (x, y) => x >= W * 0.15 && x < W * 0.85 && y >= H * 0.15 && y < H * 0.85;
  /* Una «cédula»: bordes fuertes adentro del marco (texto, código de barras),
     fondo liso alrededor. No es una cédula de verdad y da igual: lo que se
     mide es el ENCUADRE. */
  const tarjeta = (off) => cuadro((x, y) => adentro(x, y) ? ((Math.floor((x + (off || 0)) / 2) + Math.floor(y / 2)) % 2 ? 40 : 210) : 128);
  const mesa = cuadro(() => 128);

  test('una tarjeta quieta y con luz dispara', () => {
    const m = EC.medirTarjeta(tarjeta(0), tarjeta(0), W, H);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.equal(m.falla, '');
  });
  test('una mesa lisa no, por mucho que uno espere', () => {
    const m = EC.medirTarjeta(mesa, mesa, W, H);
    assert.equal(m.ok, false);
    assert.equal(m.falla, 'sin_tarjeta');
    assert.match(EC.textoDeTarjeta(m), /dentro del marco/);
  });
  test('a oscuras y con un reflejo tampoco, y cada uno lo dice a su manera', () => {
    const oscuro = cuadro(() => 12), quemado = cuadro(() => 250);
    assert.equal(EC.medirTarjeta(oscuro, oscuro, W, H).falla, 'poca_luz');
    assert.equal(EC.medirTarjeta(quemado, quemado, W, H).falla, 'mucha_luz');
    assert.match(EC.textoDeTarjeta(EC.medirTarjeta(oscuro, oscuro, W, H)), /más luz/);
  });
  test('desenfocada no dispara: hay algo, pero sin bordes', () => {
    /* Una onda suave adentro: varianza alta (hay «algo») y gradiente bajo. */
    const borrosa = cuadro((x, y) => adentro(x, y) ? 128 + 60 * Math.sin(x / 12) : 128);
    const m = EC.medirTarjeta(borrosa, borrosa, W, H);
    assert.equal(m.falla, 'borrosa', JSON.stringify(m));
    assert.match(EC.textoDeTarjeta(m), /enfoque/);
  });
  test('moviéndose no dispara: la racha se cae', () => {
    const m = EC.medirTarjeta(tarjeta(0), tarjeta(1), W, H);
    assert.equal(m.ok, false);
    assert.equal(m.falla, 'movimiento');
  });
  test('sin cuadro anterior todavía no se sabe, y un cuadro vacío no revienta', () => {
    assert.equal(EC.medirTarjeta(tarjeta(0), null, W, H).falla, 'movimiento');
    assert.equal(EC.medirTarjeta([], null, 0, 0).ok, false);
  });
});

describe('el marco de la cédula', () => {
  test('en un cuadro vertical la cédula va DE PIE y cabe', () => {
    const g = EC.rectanguloGuia(1080, 1920);
    assert.equal(g.vertical, true);
    assert.ok(g.h > g.w, 'el marco no está de pie');
    assert.ok(Math.abs(g.h / g.w - EC.PROPORCION) < 0.02, 'el marco no tiene la proporción de una cédula');
    assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= 1080 && g.y + g.h <= 1920, 'el marco se sale del cuadro');
    /* Y lo que importa de verdad: el lado largo llena el cuadro para que el
       código salga a 3 px por módulo. */
    assert.ok(g.h >= 1920 * 0.8, 'el marco es chico: el código saldría por debajo de los 3 px por módulo');
  });
  test('en un cuadro apaisado va acostada', () => {
    const g = EC.rectanguloGuia(1280, 720);
    assert.equal(g.vertical, false);
    assert.ok(g.w > g.h);
    assert.ok(g.x + g.w <= 1280 && g.y + g.h <= 720);
  });
});

describe('de quién son las fotos, y cuánto vive un registro a medias', () => {
  const ahora = Date.parse('2026-09-21T15:00:00Z');
  test('mismo celular y mismo día: son suyas', () => {
    assert.equal(EC.fotosPertenecen({ de: { celular: '3001112233', t: ahora - 3600e3 } }, '3001112233', ahora), true);
  });
  test('otro celular (el siguiente en un teléfono prestado): no', () => {
    assert.equal(EC.fotosPertenecen({ de: { celular: '3001112233', t: ahora } }, '3009999999', ahora), false);
  });
  test('de hace más de un día, o sin dueño: tampoco', () => {
    assert.equal(EC.fotosPertenecen({ de: { celular: '3001112233', t: ahora - 25 * 3600e3 } }, '3001112233', ahora), false);
    assert.equal(EC.fotosPertenecen({ cedula_frente: 'x' }, '3001112233', ahora), false);
    assert.equal(EC.fotosPertenecen(null, '3001112233', ahora), false);
  });
  test('el checkpoint del paso vale un día', () => {
    assert.equal(EC.checkpointFresco({ paso: 2, t: ahora - 1000 }, ahora), true);
    assert.equal(EC.checkpointFresco({ paso: 2, t: ahora - 30 * 3600e3 }, ahora), false);
    assert.equal(EC.checkpointFresco({ paso: 'x', t: ahora }, ahora), false);
    assert.equal(EC.checkpointFresco(null, ahora), false);
  });
});

/* ------------------------------------------------------------------------
   Dentro de la página real (pruebas/banco-play.js). Sin cámara ni lienzo, así
   que se prueba lo que no depende de ellos y se fabrica lo demás.
   ------------------------------------------------------------------------ */
describe('el paso de la cédula dentro de la página', () => {

  function enElPaso(P) {
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos(); pintarRegistro(1);");
    return P.elems.cuerpo.innerHTML;
  }

  test('sin cámara en vivo, salen las cajas de foto de siempre y ningún botón de escanear', () => {
    const P = abrirPlay();
    assert.equal(P.ev('hayCamaraEnVivo()'), false, 'el banco no tiene cámara y la página cree que sí');
    const h = enElPaso(P);
    assert.match(h, /id="fot_cedula_reverso"/, 'se fue la caja del respaldo');
    assert.match(h, /id="fot_cedula_frente"/, 'se fue la caja del frente');
    assert.match(h, /id="docFijo">/, 'las cajas de foto quedaron ocultas sin cámara: no hay forma de tomar la cédula');
    assert.equal(/btnEscanear/.test(h), false, 'ofrece escanear sin cámara en vivo');
  });

  test('con cámara en vivo, el botón de escanear manda y las cajas quedan de respaldo', () => {
    const P = abrirPlay();
    P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
    assert.equal(P.ev('hayCamaraEnVivo()'), true);
    const h = enElPaso(P);
    assert.match(h, /id="btnEscanear"[^>]*onclick="iniciarEscanerDoc\('reverso'\)"/, 'el botón no arranca por el respaldo');
    assert.match(h, /Escanear mi cédula/);
    assert.match(h, /id="docFijo" class="oculto"/, 'las cajas de foto no quedaron de respaldo');
    assert.match(h, /Prefiero tomar las fotos con la cámara del celular/, 'no hay salida a la cámara del celular');
    assert.match(h, /id="escDoc"/, 'no está la caja del escáner');
    assert.match(h, /Tomar la foto ahora/, 'el botón manual no está: quien no logre el encuadre se queda atascado');
  });

  test('si la cámara tarda, se ofrece la salida SIN acusar al navegador ni matar el permiso', () => {
    /* MUTANTE QUE CAZA: volver a declarar «este navegador no dejó encender la
       cámara» a los 9 s. Ese plazo se cumple DEBAJO del diálogo del permiso,
       mientras la persona lo está leyendo: la pantalla culpaba a un navegador
       que no había dicho nada y tiraba el permiso que iba a dar un segundo
       después. Ahora el intento sigue vivo, se ofrece la cámara del celular, y
       si el permiso llega el escáner arranca igual. */
    const P = abrirPlay();
    P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
    P.ev('setTimeout = function (f) { window.__vigilante = f; return 1; };');
    enElPaso(P);
    P.ev("iniciarEscanerDoc('reverso')");
    P.ev('window.__vigilante && window.__vigilante()');
    assert.equal(P.ev('ESCDOC.activo'), true, 'tiró el intento de cámara mientras la persona leía el permiso');
    const nota = P.ev("$('docNota').textContent");
    assert.match(nota, /toca «Permitir»/, 'no le dice qué hacer con el permiso que tiene en pantalla');
    assert.match(nota, /cámara del celular/, 'no le ofrece la salida');
    assert.equal(/no dejó encender/.test(nota), false, 'vuelve a culpar al navegador sin haberlo comprobado');
    assert.match(P.ev("$('docEstado').textContent"), /Esperando el permiso/);
  });

  test('con el permiso negado, lo mismo — y sin culpar al cliente', () => {
    const P = abrirPlay();
    P.ev('navigator.mediaDevices = { getUserMedia: function () { var e = new Error("no"); e.name = "NotAllowedError"; return Promise.reject(e); } };');
    enElPaso(P);
    P.ev("iniciarEscanerDoc('reverso')");
    return esperar().then(() => {
      assert.equal(P.ev('ESCDOC.activo'), false);
      const nota = P.ev("$('docNota').textContent");
      assert.match(nota, /navegador no dejó/);
      assert.equal(/No diste permiso/.test(nota), false, 'culpa al cliente por un permiso que quizá nunca vio');
    });
  });

  /* La foto fija que sí se lee: un PDF417 fabricado, metido en un lienzo de
     mentira que devuelve sus píxeles. Es el camino de <input type=file> y el
     de «Tomar la foto ahora». */
  function conLector(P, lum, W, H) {
    P.ev(BUNDLE);
    P.ev("ZXing.ZXingStringEncoding.customDecoder = function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };");
    P.ev('window.cargarScript = function () { return Promise.resolve(); };');
    const b64 = Buffer.from(lum).toString('base64');
    P.ev("window.__lum = Uint8ClampedArray.from(atob('" + b64 + "'), function (c) { return c.charCodeAt(0); });");
    P.ev('window.__lienzo = { width: ' + W + ', height: ' + H + ', getContext: function () { return { getImageData: function () {' +
         ' var n = window.__lum.length, d = new Uint8ClampedArray(n * 4);' +
         ' for (var i = 0, j = 0; i < n; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = window.__lum[i]; d[j + 3] = 255; }' +
         ' return { data: d }; } }; } };');
  }

  test('LA FOTO DEL RESPALDO LEE EL CÓDIGO Y RELLENA nombres, apellidos y cédula', () => {
    const P = abrirPlay();
    enElPaso(P);
    const { lum, W, H } = F.render(CODIGO, 3, 0.8, 4);
    conLector(P, lum, W, H);
    return P.ev('leerCodigoDeBarras(window.__lienzo)').then(() => {
      assert.equal(P.ev('REGISTRO.nombres'), 'JUAN CARLOS', 'no rellenó los nombres');
      assert.equal(P.ev('REGISTRO.apellidos'), 'PEREZ GOMEZ');
      assert.equal(P.ev('REGISTRO.documento'), '1234567');
      assert.equal(P.ev('REGISTRO.tipo_doc'), 'Cédula de ciudadanía');
      assert.equal(P.ev('FOTOS.cedula_leida.nacimiento'), '1990-05-15');
      assert.equal(P.ev('FOTOS.cedula_leida.rh'), undefined, 'el RH llegó al teléfono');
      assert.match(P.ev("$('docLeido').innerHTML"), /Leímos tu cédula/);
      assert.match(P.almacen.play_registro_borrador || '', /JUAN CARLOS/, 'lo leído no quedó en el borrador: una recarga lo pierde');
      assert.equal(P.ev('window.__lienzo.width'), 1, 'el lienzo grande no se soltó');
      /* Y el paso «Quién eres» lo dice. */
      P.ev('pintarRegistro(3)');
      const h = P.elems.cuerpo.innerHTML;
      assert.match(h, /los leímos del código de barras/, 'el paso no dice de dónde salieron los datos');
      assert.match(h, /id="f_nombres"[^>]*value="JUAN CARLOS"/, 'los nombres no aparecen escritos en el formulario');
    });
  });

  test('con una foto ilegible TERMINA y lo dice: no se queda «Leyendo…» para siempre', () => {
    const P = abrirPlay();
    enElPaso(P);
    const { lum, W, H } = F.render(CODIGO, 1.2, 1.0, 6);
    conLector(P, lum, W, H);
    P.ev('window.__dec = 0; (function () { var d = ZXing.PDF417Reader.prototype.decode; ZXing.PDF417Reader.prototype.decode = function () { window.__dec++; return d.apply(this, arguments); }; })();');
    return P.ev('leerCodigoDeBarras(window.__lienzo)').then(() => {
      assert.match(P.ev("$('docLeido').innerHTML"), /No pude leer/, 'la pantalla se quedó en «Leyendo…»');
      assert.equal(P.ev('FOTOS.cedula_leida'), undefined);
      assert.ok(P.ev('window.__dec') <= 1 + EC.GIROS_DE_RESCATE.length,
        'decodificó ' + P.ev('window.__dec') + ' veces: eso ya no es un rescate, es el bucle de antes');
    });
  });

  test('la página ya no usa los métodos de ZXing que reintentan para siempre', () => {
    ['decodeFromImageUrl', 'decodeFromVideoDevice', 'decodeFromVideoElement', 'decodeFromConstraints', 'decodeOnceFromConstraints']
      .forEach(m => assert.equal(SIN_COMENTARIOS.indexOf(m + '('), -1, 'volvió ' + m + ': reintenta a 0 ms sin fin'));
  });

  test('la marca de las fotos vive CON las fotos, en localStorage, no en la pestaña', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true, cedula_frente: 'data:x' }; marcarDuenoDeLasFotos(); guardarFotos();");
    assert.match(P.almacen.play_fotos_borrador, /"de":\{"celular":"3001112233"/, 'la marca no está con las fotos');
    assert.equal(P.sesion.play_fotos_de_esta_pestana, undefined, 'la marca volvió a sessionStorage, que Android no restaura');
    assert.equal(P.ev('fotosSonDeEsteRegistro()'), true);
    /* Al día siguiente, otra persona en el mismo teléfono: */
    const otra = abrirPlay({ almacen: P.almacen, hash: '' });
    assert.equal(otra.ev("fotosSonDeEsteRegistro('3009999999')"), false, 'las fotos de uno se le pegan a otro');
    assert.equal(otra.ev("fotosSonDeEsteRegistro('3001112233')"), true, 'el mismo, el mismo día, perdió sus fotos');
  });

  test('todas las contraseñas tienen ojo, y el ojo alterna el MISMO campo', () => {
    ['inClave', 'rClave', 'rClave2', 'clave1', 'clave2', 'rClaveFin', 'rClaveFin2'].forEach(id =>
      assert.ok(SIN_COMENTARIOS.indexOf("campoClave('" + id + "'") >= 0, id + ' se quedó sin ojo'));
    assert.equal(/type="password"[^>]*id="(inClave|rClave|rClave2|clave1|clave2)"/.test(SIN_COMENTARIOS), false,
      'hay un campo de contraseña pintado a mano, fuera de campoClave');
    const P = abrirPlay();
    P.ev("pintarEntrar(); $('inClave').type = 'password';");
    P.ev("verClave('inClave', null)");
    assert.equal(P.ev("$('inClave').type"), 'text', 'el ojo no muestra la contraseña');
    P.ev("verClave('inClave', null)");
    assert.equal(P.ev("$('inClave').type"), 'password', 'el ojo no la vuelve a tapar');
  });

  test('EL CSS DEL ESCÁNER VIAJA DENTRO DEL HTML, no en la hoja aparte', () => {
    /* 21-sep-2026 (noche) — LA LECCIÓN MÁS CARA DEL DÍA, y la pagó la primera
       clienta de verdad. Sofía vio «una foto normal» y su cédula salió EN
       ESPEJO: su teléfono recibió el HTML y el JS de ese día, pero la HOJA del
       18, porque el CSS solo pasó a red-primero en la v77 y el service worker
       que decidía en SU carga era el anterior. Sin las reglas del escáner
       mandaron las de base —caja 3:4 y scaleX(-1)— y el recorte dejó el código
       de barras a 2 px por módulo, así que tampoco autollenó nada.

       Subir el número de caché no arregla esa visita: arregla la SEGUNDA. Y
       eso significaba que TODA persona a la que ya se le hubiera mandado el
       enlace tenía una visita rota pendiente.

       La regla que deja: una función nueva no puede depender de dos archivos
       que se sirven con estrategias distintas. El CSS del escáner vive en el
       <style> en línea de play/index.html, que llega siempre fresco porque el
       HTML va red-primero desde el día uno — igual que el del rostro. */
    const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    assert.match(SW, /'app\/escaner-cedula\.js'/,
      'el módulo del escáner no está en el precache: sin señal el paso de la cédula queda sin escáner');
    const HTML = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    const enLinea = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
    assert.match(enLinea, /\.escaner\.escaner-doc video,\.escaner\.escaner-doc canvas\{transform:none\}/,
      'el video de la cédula volvió a espejarse, o la regla salió del <style> en línea: un código de barras espejado no se lee');
    assert.match(enLinea, /\.escaner\.escaner-doc\{aspect-ratio:9\/16/,
      'la caja dejó de ser 9:16 (o se fue a la hoja aparte): el código saldría a 2 px por módulo');
    assert.match(enLinea, /\.doc-linea\{/, 'la línea que barre se fue a la hoja aparte: puede llegar rancia');
    assert.match(enLinea, /\.clave-caja \.ojo\{/, 'el ojo de la contraseña se fue a la hoja aparte');
    const CSS = fs.readFileSync(path.join(RAIZ, 'play', 'estilo.css'), 'utf8');
    assert.equal(/\.escaner-doc|\.doc-guia|\.doc-linea|\.clave-caja/.test(CSS), false,
      'las reglas del escáner volvieron a la hoja aparte: la primera visita de quien tenga un service worker viejo las recibe rancias');
  });
});

/* ===========================================================================
 * LO QUE ENCONTRÓ LA REVISIÓN ADVERSARIA — 21 de septiembre de 2026
 *
 * Cinco lentes sobre el cambio antes de publicarlo: 16 hallazgos verificados
 * contra el código y dos más de severidad alta. Cada uno deja su centinela
 * aquí, porque casi todos eran FALLOS MUDOS —la pantalla decía una cosa y el
 * código hacía otra— y esos son los que vuelven.
 * ========================================================================= */
describe('lo que encontró la revisión (21-sep-2026)', () => {

  const FUENTE = () => fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const conFotos = (P, cel, horas) =>
    P.ev("FOTOS = { sensibles: true, cedula_frente: 'data:x', cedula_reverso: 'data:y', de: { celular: '" +
      cel + "', t: Date.now() - " + ((horas || 0) * 3600e3) + " } }; guardarFotos();");

  test('ALTA: una foto que NO va a subir no puede decir «Listo»', () => {
    /* Era el peor de todos: la caja pintaba ✓ mirando solo si el dato existía,
       y la subida miraba otra cosa. Una cédula de otro celular, o de hace dos
       días, se veía lista y no subía jamás; el CRM recibía el registro sin
       cédula y nadie se enteraba. Ahora la pantalla y la subida preguntan lo
       MISMO (hayFotoLista → fotosSonDeEsteRegistro). */
    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233';");
    conFotos(P, '3001112233');
    P.ev('pintarRegistro(1)');
    assert.match(P.elems.cuerpo.innerHTML, /✓ Respaldo/, 'la foto propia y de hoy no se ve lista');

    const Q = abrirPlay();
    Q.ev("REGISTRO.celular = '3009999999';");
    conFotos(Q, '3001112233');
    Q.ev('pintarRegistro(1)');
    assert.equal(/✓ Respaldo/.test(Q.elems.cuerpo.innerHTML), false,
      'dice «Listo» de una foto que no va a subir: la interfaz promete lo que el código no cumple');
    assert.equal(Q.ev("hayFotoLista('cedula_reverso')"), false);
  });

  test('ALTA: las fotos de la versión anterior no se quedan mintiendo', () => {
    /* Las de la v75 no llevaban dueño escrito (la marca vivía en la pestaña).
       Al estrenar esta versión se adoptan si esa marca sigue viva en esta
       pestaña, y si no se sueltan: que es lo que iba a pasarles igual. */
    const almacen = () => ({
      play_registro_borrador: JSON.stringify({ celular: '3001112233' }),
      play_fotos_borrador: JSON.stringify({ sensibles: true, cedula_reverso: 'data:vieja' })
    });
    const adoptada = abrirPlay({ almacen: almacen(), sesion: { play_fotos_de_esta_pestana: '1' } });
    assert.equal(adoptada.ev('FOTOS.de.celular'), '3001112233',
      'no adoptó las fotos de la versión anterior en su propia pestaña');
    const huerfana = abrirPlay({ almacen: almacen(), sesion: {} });
    assert.equal(huerfana.ev('FOTOS.cedula_reverso'), undefined,
      'quedó una foto sin dueño: se vería lista y no subiría nunca');
    assert.equal(huerfana.ev('FOTOS.sensibles'), true, 'se perdió el consentimiento al sanear');
  });

  test('la cédula de otra persona no se queda en el teléfono para siempre', () => {
    /* Solo «empezar de cero» las borraba, y ese botón únicamente aparece a
       mitad del registro. Cédula, selfie y ubicación —datos sensibles de la
       Ley 1581— se quedaban en un teléfono que se presta. */
    const P = abrirPlay();
    conFotos(P, '3001112233', 30);
    const Q = abrirPlay({ almacen: P.almacen, sesion: {} });
    assert.equal(Q.ev('FOTOS.cedula_frente'), undefined, 'la cédula de hace 30 horas sigue en el teléfono');
    assert.equal(String(Q.almacen.play_fotos_borrador).indexOf('data:x'), -1);
  });

  test('ALTA: un registro viejo no se abre solo por el enlace que reparte Joan', () => {
    /* «#registro» es lo que Android restaura Y lo que Joan manda por WhatsApp,
       y entraba a leerPaso() sin mirar la hora: un borrador de hace una semana
       —o de otra persona— se abría en su paso, sin el botón de salida. */
    const P = abrirPlay({ hash: '' });
    P.ev('pintarRegistro(0)');
    P.ev("$('rTel').value='3001112233'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x'; siguientePaso();");
    P.almacen.play_registro_paso = JSON.stringify({ paso: 5, t: Date.now() - 50 * 3600e3 });
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '#registro' });
    assert.match(Q.elems.cuerpo.innerHTML, /Paso 1 de/, 'retomó un registro de hace dos días sin preguntar');
    assert.match(Q.elems.errReg.innerHTML, /empezarDeNuevo\(\)/, 'no le da forma de soltar el registro de otro');
  });

  test('«Tu cuenta ya quedó creada» trae salida: en un teléfono prestado es de otro', () => {
    const P = abrirPlay({ hash: '' });
    P.ev("anotarCuentaCreada('3001112233'); pintarRegistrado();");
    const Q = abrirPlay({ almacen: P.almacen, sesion: {}, hash: '' });
    assert.match(Q.ev("$('errEntrar').innerHTML"), /noSoyYo\(\)/,
      'el celular de otro se queda puesto sin forma de quitarlo');
    Q.ev('noSoyYo()');
    assert.equal(Q.almacen.play_cuenta_creada, undefined);
    assert.equal(Q.ev("$('inTel').value"), '');
  });

  test('cambiar el celular suelta las fotos Y la identidad del anterior', () => {
    /* Se soltaban las fotos, pero el nombre, la cédula y el nacimiento seguían
       en el borrador: con el acompañamiento encendido, los datos de A se
       publicaban al CRM bajo el celular de B. */
    const P = abrirPlay({ hash: '' });
    P.ev('pintarRegistro(0)');
    P.ev("$('rTel').value='3001112233'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x'; siguientePaso();");
    conFotos(P, '3001112233');
    P.ev("REGISTRO.nombres='JUAN'; REGISTRO.apellidos='PEREZ'; REGISTRO.documento='123'; guardarBorrador(REGISTRO);");
    P.ev('pintarRegistro(0)');
    P.ev("$('rTel').value='3009999999'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x'; siguientePaso();");
    assert.equal(P.ev('REGISTRO.nombres'), undefined, 'el nombre del anterior viaja con el celular del nuevo');
    assert.equal(P.ev('REGISTRO.documento'), undefined, 'la cédula del anterior viaja con el celular del nuevo');
    assert.equal(P.ev('FOTOS.cedula_frente'), undefined);
    assert.equal(/JUAN/.test(String(P.almacen.play_registro_borrador || '')), false,
      'quedó en el borrador del teléfono');
  });

  test('«empezar de cero» apaga también el acompañamiento del anterior', () => {
    const P = abrirPlay({ hash: '' });
    P.ev('fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); };');
    P.ev("REGISTRO.celular='3001112233'; acompanar(true);");
    assert.equal(P.almacen.tg_acompana, '1');
    P.ev('empezarDeNuevo()');
    assert.equal(P.ev('ACOMPANA'), false, 'el asesor del anterior sigue viendo al siguiente');
    assert.notEqual(P.almacen.tg_acompana, '1');
  });

  test('zxing se puede reintentar: una caída no deja la sesión sin lector', () => {
    /* Antes se preguntaba por el <script src> en el DOM: un fallo dejaba el
       nodo muerto ahí y TODAS las llamadas siguientes contestaban «ya está»
       sin librería. El escáner se quedaba en «Leyendo…» y la foto fija le
       echaba la culpa a la foto. */
    const P = abrirPlay();
    P.ev('window.__intentos = 0;');
    P.ev("document.createElement = (function (o) { return function (t) {" +
         " if (t === 'script') window.__intentos++;" +
         " return o.call(document, t); }; })(document.createElement);");
    P.ev("document.head.appendChild = function (e) { if (e && e.onerror) e.onerror(); };");
    return P.ev("cargarScript('x.js').then(function () { window.__r = 'ok'; }, function () { window.__r = 'falla'; })")
      .then(() => P.ev("cargarScript('x.js').then(function () { window.__r2 = 'ok'; }, function () { window.__r2 = 'falla'; })"))
      .then(() => {
        assert.equal(P.ev('window.__r'), 'falla');
        assert.equal(P.ev('window.__r2'), 'falla',
          'el segundo intento contestó «ya está» sin haber cargado nada');
        assert.equal(P.ev('window.__intentos'), 2,
          'no volvió a pedir el archivo: intentos = ' + P.ev('window.__intentos'));
      });
  });

  test('el giro de rescate cerca de 90° intercambia los lados', () => {
    /* «recto» era Math.abs(grados) === 90, así que 88°, 92°, 86° y 94°
       dibujaban una imagen apaisada en un lienzo de pie: se recortaba, y el
       rescate no podía leer nunca. */
    const P = abrirPlay();
    P.ev("document.createElement = (function (o) { return function (t) {" +
         " if (t !== 'canvas') return o.call(document, t);" +
         " return { width: 0, height: 0, getContext: function () { return {" +
         "   save: function () {}, restore: function () {}, translate: function () {}," +
         "   rotate: function () {}, fillRect: function () {}, drawImage: function () {} }; } };" +
         " }; })(document.createElement);");
    P.ev('window.__fuente = { width: 400, height: 900 };');
    [90, 92, 86, 270].forEach(g => {
      P.ev('lienzoGirado(window.__fuente, ' + g + ')');
      assert.equal(P.ev('LIENZO_GIRO.width'), 900, 'a ' + g + '° el lienzo no quedó apaisado');
      assert.equal(P.ev('LIENZO_GIRO.height'), 400);
    });
    P.ev('lienzoGirado(window.__fuente, 4)');
    assert.equal(P.ev('LIENZO_GIRO.width'), 400, 'un giro chico no debe intercambiar los lados');
  });

  test('el frente va ACOSTADO: una cara al revés no la compara el CRM', () => {
    /* Con el marco de pie el recorte se gira 90°, y según hacia dónde apunte el
       borde de arriba la foto queda cabeza abajo. Al respaldo le da igual (el
       lector prueba 0° y 180°); al frente no, que es el que el CRM compara con
       la selfie. */
    const g = EC.rectanguloGuia(1080, 1920, true);
    assert.equal(g.vertical, false, 'el marco del frente volvió a ser vertical');
    assert.ok(g.w > g.h);
    assert.ok(g.x >= 0 && g.x + g.w <= 1080 && g.y + g.h <= 1920);
    const t = FUENTE();
    assert.ok(t.indexOf("rectanguloGuia(cw, ch, ESCDOC.lado === 'frente')") >= 0,
      'el marco dejó de acostarse para el frente');
    assert.ok(t.indexOf('con tu foto a la izquierda') >= 0, 'no le dice cómo poner el frente');
  });

  test('mientras el escáner está abierto no se ofrece volver a abrirlo', () => {
    const P = abrirPlay();
    P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };');
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos(); pintarRegistro(1);");
    assert.match(P.elems.cuerpo.innerHTML, /btnEscanear/);
    P.ev('ESCDOC.activo = true;');
    assert.equal(P.ev('botonesDoc()'), '',
      'pinta «Ahora el frente» encima de un escáner que ya está escaneando el frente');
  });

  test('si el lienzo grande falla, la foto de 900 NO se pierde', () => {
    /* La regla del 16-sep por el otro lado: leer el código es la comodidad, la
       foto es lo esencial. Un map que reventaba en el 1600 se llevaba las dos. */
    const P = abrirPlay();
    P.ev("window.URL = window.URL || {}; URL.createObjectURL = function () { return 'blob:falso'; }; URL.revokeObjectURL = function () {};");
    P.ev("window.Image = function () { var s = this; this.width = 4000; this.height = 3000;" +
         " Object.defineProperty(this, 'src', { set: function (v) { if (v && s.onload) s.onload(); }," +
         " get: function () { return ''; } }); };");
    P.ev("document.createElement = (function (o) { return function (t) {" +
         " if (t !== 'canvas') return o.call(document, t);" +
         " return { width: 0, height: 0," +
         "   getContext: function () { if (this.width > 1000) throw new Error('sin memoria');" +
         "     return { drawImage: function () {} }; }," +
         "   toDataURL: function () { return 'data:image/jpeg;base64,FOTO-' + this.width; } }; };" +
         " })(document.createElement);");
    P.ev("window.cargarScript = function () { return Promise.reject(new Error('sin red')); };");
    P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true };");
    P.ev("tomarFoto({ target: { files: [{ name: 'x.jpg', size: 4000000 }] } }, 'cedula_reverso')");
    return esperar().then(() => {
      assert.match(String(P.ev('FOTOS.cedula_reverso') || ''), /FOTO-900/,
        'se perdió la foto porque falló el lienzo que solo servía para leer el código');
    });
  });

  test('ZXing manda sobre el detector nativo: una Ñ mal leída rellena mal el CRM', () => {
    /* El nativo (ML Kit) aguanta mejor la inclinación pero devuelve el texto ya
       convertido y se come los bytes que no entiende. ZXing vive en el sitio y
       devuelve los bytes exactos: lee primero, y el nativo queda de rescate. */
    const t = FUENTE();
    const i = t.indexOf('function leerCuadroDoc');
    const cuerpo = t.slice(i, t.indexOf('\nfunction ', i + 1));
    assert.ok(cuerpo.indexOf('if (Z) {') > -1 && cuerpo.indexOf('if (Z) {') < cuerpo.indexOf('if (ESCDOC.nativo) {'),
      'el detector nativo volvió a leer primero: sus bytes no son los de la cédula');
    assert.ok(cuerpo.indexOf('if (!Z && !ESCDOC.nativo) return;') > -1,
      'vuelve a recortar el cuadro mientras el lector todavía se está bajando');
  });

  test('la lectura que llega tarde no dispara nada, y no hay dos cámaras en vuelo', () => {
    /* La promesa del detector nativo podía resolver después de «Cancelar»:
       guardaba una foto de un video apagado y reanudaba un escáner sin cámara.
       Y dos getUserMedia seguidos dejaban el primer flujo encendido. */
    const t = FUENTE();
    assert.ok(t.indexOf('if (miTurno !== ESCDOC.turno || !ESCDOC.stream) return;') > -1,
      'una lectura de un escáner ya cerrado vuelve a poder guardar una foto');
    assert.ok(t.indexOf('if (!ESCDOC.activo || miTurno !== ESCDOC.turno) {') > -1,
      'dos getUserMedia en vuelo: el primero se queda encendido para siempre');
  });

  test('irse a otra app apaga la cámara aunque el escáner esté celebrando', () => {
    assert.ok(FUENTE().indexOf('if (ESCDOC.activo || ESCDOC.stream) { var lado = ESCDOC.lado;') > -1,
      'entre que lee y reanuda con el frente, la cámara se queda encendida en segundo plano');
  });

  test('la hoja de estilos va fresco-primero: la primera visita tras publicar no sale rota', () => {
    /* El HTML iba fresco-primero y el CSS cache-primero, así que la primera
       carga después de publicar servía el HTML NUEVO con la hoja VIEJA: el
       service worker que manda en ese momento sigue siendo el anterior. Se veía
       como un defecto de la página y se arreglaba solo en la segunda visita,
       que es la peor forma de un fallo. */
    const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    assert.ok(SW.indexOf('(html|js|css|webmanifest)') > -1,
      'la hoja volvió a servirse desde la caché: la primera visita tras publicar mezcla HTML nuevo con estilos viejos');
  });
});

/* ===========================================================================
 * LO QUE LA PANTALLA DICE DE LA CÉDULA — 21 de septiembre de 2026 (tarde)
 *
 * Dos investigaciones a fondo dejaron tres cosas que la pantalla decía al
 * revés, y una de ellas se escribió el día anterior:
 *   · la fecha de expedición NO está en el frente: está en el RESPALDO, encima
 *     del código de barras, al lado de la firma del Registrador;
 *   · el código de 5 dígitos del PDF417 NO es «el municipio de expedición»
 *     —son 2 de departamento + 3 de municipio, en la numeración de la
 *     Registraduría, y el único indicio apunta a NACIMIENTO—, así que no se
 *     rotula ni se usa;
 *   · la caja de respaldo de la selfie buscaba un id que no existía, y por eso
 *     la pantalla le decía «no dejó encender la cámara» a alguien cuya foto
 *     acababa de guardarse bien.
 * ========================================================================= */
describe('la pantalla dice la verdad sobre la cédula (21-sep-2026)', () => {

  const FUENTE = () => fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');

  test('NO se le dice a nadie que la fecha de expedición está en el frente', () => {
    /* La frase vivió un día en producción y era falsa para el 100% de quien la
       veía: solo se pinta después de leer el PDF417, y el PDF417 está en el
       respaldo, en la misma cara que la fecha. */
    const t = FUENTE();
    assert.equal(/expedici[óo]n est[áa] impresa en el frente/i.test(t), false,
      'volvió la frase falsa: la fecha de expedición está en el RESPALDO');
    assert.match(t, /FECHA Y LUGAR DE EXPEDICIÓN/,
      'el aviso ya no le dice dónde buscarla, que es lo único que le sirve');
    assert.match(t, /firma del Registrador/,
      'se perdió el punto de referencia, que es lo que vale para las dos cédulas');
  });

  test('el código de localidad se descarta y no se rotula', () => {
    /* Rotularlo «lugar de expedición» sería escribirle al cliente un dato que
       nadie ha verificado que sea suyo. */
    const cuenta = fs.readFileSync(path.join(RAIZ, 'app', 'cuenta.js'), 'utf8');
    assert.equal(/c[óo]digo del municipio\s*\n?\s*de expedici[óo]n/i.test(cuenta), false,
      'el comentario volvió a afirmar que ese código es el municipio de expedición');
    assert.match(cuenta, /DIVIPOL/, 'se perdió la advertencia de que no es la numeración del DANE');
    F.latin1EnNode(true);
    let c;
    try {
      const { lum, W, H } = F.render(CODIGO, 3, 0.8, 4);
      c = EC.cedulaDelTexto(U.leerCedulaPDF417, EC.decodificarLuminancias(F.Z, lum, W, H).texto);
    } finally { F.latin1EnNode(false); }
    assert.ok(c, 'el fixture dejó de leerse');
    ['lugar_expedicion', 'expedicion', 'municipio', 'departamento'].forEach(k =>
      assert.equal(c[k], undefined, 'el lector devolvió «' + k + '»: ese dato no se conoce'));
  });

  test('la caja de la selfie tiene el id que tomarFoto busca', () => {
    /* MUTANTE QUE CAZA: volver a `fot_selfie_fallback`. La foto se guardaba y
       subía bien, pero ni la miniatura, ni el «Listo», ni los tres avisos que
       SALVAN la foto se pintaban nunca, porque todos van dentro de `if (caja)`. */
    const t = FUENTE();
    assert.match(t, /id="fot_selfie"/, 'la caja de la selfie no tiene el id que tomarFoto busca');
    assert.equal(/fot_selfie_fallback/.test(t), false, 'quedó el id viejo por algún lado');
    assert.match(t, /id="selfieNota"/, 'no hay nota aparte: el motivo del fallo vuelve a pisar el «Listo»');
  });

  test('TODO id que tomarFoto reciba tiene que existir en el HTML', () => {
    /* El centinela que faltaba, y el que habría cazado el defecto de la selfie
       el mismo día. El banco no lo ve porque `elems` fabrica cualquier id que
       le pidan: hay que comparar el texto contra el texto. */
    const t = FUENTE();
    /* Las comillas van escapadas en la fuente (`tomarFoto(event,\'selfie\')`),
       porque el HTML se arma dentro de una cadena de JavaScript. */
    const literales = [...t.matchAll(/tomarFoto\(event,\s*\\?'([a-z_]+)\\?'\)/g)].map(m => m[1]);
    /* Los que se pintan a mano (hoy: la selfie). La cédula pasa por cajaFoto,
       que arma el id con la MISMA variable que le da a tomarFoto, así que ahí
       no puede haber desfase por construcción. */
    assert.ok(literales.length >= 1, 'no encontré ninguna llamada literal a tomarFoto');
    [...new Set(literales)].forEach(k => {
      const aMano = t.indexOf('id="fot_' + k + '"') >= 0;
      const porCajaFoto = new RegExp("cajaFoto\\('" + k + "'").test(t);
      assert.ok(aMano || porCajaFoto,
        'tomarFoto recibe «' + k + '» pero nadie pinta id="fot_' + k + '": la pantalla se queda muda');
    });
    /* Y que cajaFoto siga atándolos: el día que alguien le cambie el id a uno
       y no al otro, vuelve el defecto de la selfie por la otra puerta. */
    assert.match(t, /id="fot_' \+ key \+ '"/,
      'cajaFoto dejó de armar el id con la misma clave que le pasa a tomarFoto');
    const porCaja = [...t.matchAll(/cajaFoto\('([a-z_]+)'/g)].map(m => m[1]);
    assert.ok(porCaja.length >= 2, 'se perdieron las cajas de foto de la cédula: ' + porCaja.join(', '));
  });

  test('la subida deja rastro y solo borra del teléfono lo que el servidor confirmó', () => {
    /* Trece días de fotos perdidas cabían en un `.catch(function () {})` vacío.
       La función de la base reventaba SIEMPRE («huella» era variable y columna
       a la vez) y el cliente veía «Listo». */
    const t = FUENTE().replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(t, /function anotarSubida/, 'la subida volvió a no dejar rastro de lo que pasó');
    assert.equal(/subirArchivosRegistro\(\)\.catch\(function \(\) \{\}\)/.test(t), false,
      'volvió un catch vacío: un fallo de la subida vuelve a ser invisible');

    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233';");
    P.ev("FOTOS = { sensibles: true, cedula_frente: 'data:a', cedula_reverso: 'data:b', selfie: 'data:c' }; marcarDuenoDeLasFotos(); guardarFotos();");
    P.ev("SESION = { access_token: 'tok', user: { email: '573001112233@tugarantia.net' } };");
    /* El servidor solo se queda con dos de las tres. */
    P.ev("rpcSesion = function () { return Promise.resolve({ ok: true, fotos: 2, guardados: ['cedula_frente','selfie'] }); };");
    return P.ev('subirArchivosRegistro()').then(() => {
      assert.equal(P.ev('FOTOS.cedula_frente'), undefined, 'no soltó la que sí entró');
      assert.equal(P.ev('FOTOS.selfie'), undefined);
      assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:b',
        'borró del teléfono una foto que el servidor NO confirmó: esa copia era la única');
      assert.equal(JSON.parse(P.almacen.play_subida_fotos).estado, 'parcial');
      assert.ok(String(P.almacen.play_fotos_borrador).indexOf('data:b') > 0,
        'la que falta ya no quedó guardada para reintentar');
    });
  });

  test('si el servidor rechaza, NO se borra nada del teléfono', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233';");
    P.ev("FOTOS = { sensibles: true, cedula_reverso: 'data:b' }; marcarDuenoDeLasFotos(); guardarFotos();");
    P.ev("SESION = { access_token: 'tok', user: { email: '573001112233@tugarantia.net' } };");
    P.ev("rpcSesion = function () { return Promise.resolve({ ok: false }); };");
    return P.ev('subirArchivosRegistro()').then(() => {
      assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:b', 'borró la foto con un rechazo del servidor');
      assert.equal(JSON.parse(P.almacen.play_subida_fotos).estado, 'rechazo');
    });
  });

  test('a quien lleva la cédula nueva se le dice que esa no se sabe leer', () => {
    assert.match(FUENTE(), /gris y de pl[áa]stico/,
      'quien lleva la cédula nueva se queda esperando a un lector que nunca va a leer nada');
  });
});
