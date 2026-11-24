'use strict';
/* ==========================================================================
 * LA GENTE DE LA PORTADA, EN FOTO — 24 de noviembre de 2026
 *
 * Joan, el 18-nov, mirando la tarjeta «Para qué te sirve» de tugarantia.net/play/:
 * «estas animaciones mejoralas, que parezcan personas reales». Escogió fotos
 * hechas con IA, y el 24-nov la opción a color entre doce candidatas. Las tres
 * ilustraciones de Open Peeps (play/gente/*.svg) salen; entran tres fotos
 * (play/gente/*.webp). Este archivo reemplaza a pruebas/gente-ilustrada.test.js.
 *
 * LO QUE UNA FOTO CAMBIA, Y POR QUÉ ESTAS PRUEBAS:
 *  1. Que la tarjeta pida un archivo que no está: imagen rota en la puerta
 *     pública, que es lo primero que ve un desconocido.
 *  2. Que la foto pese de más o venga de otro tamaño: se pinta a 112 px y el
 *     cliente la paga con sus datos. 336 px (112 × 3) y menos de 40 KB.
 *  3. Que viaje con metadatos: el texto con que se pidió, el programa, la fecha.
 *     Nada de eso es del cliente ni tiene que salir de aquí.
 *  4. Que la nota siga diciendo «ilustraciones»: una persona al lado de «una gran
 *     ayuda» se lee como testimonio, y lo que la página tiene que decir es que
 *     son fotos creadas con IA y que no son clientes.
 *  5. Que no esté en la precarga del service worker, o que se quede un .svg viejo.
 *
 * LO QUE SE FUE DEL ARCHIVO VIEJO, A PROPÓSITO:
 *  · «tinta y blanco, sin color de piel»: es justo la regla que cambió. «El
 *    cliente de Tu Garantía es cualquiera» se cumple ahora con variedad (tres
 *    personas distintas en edad, género y tono de piel), y eso no lo puede medir
 *    una prueba: se mira.
 *  · el crédito a Pablo Stanley y lo de «nada que corra dentro del .svg»: ya no
 *    hay .svg.
 *
 * LO QUE NINGUNA PRUEBA VE: lo que la foto MUESTRA. Que no haya letras, cifras,
 * billetes ni una pantalla de celular a la vista se revisa a ojo, foto por foto.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RELOJ = require('./reloj.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ESCENAS = ['varas', 'eliges', 'ayuda'];
const RUTAS = ESCENAS.map(n => 'play/gente/' + n + '.webp');
const CSS = leer('play/estilo.css');
const SIN_COMENTARIOS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const REGLA = (SIN_COMENTARIOS.match(/\.gente-esc\{[^}]*\}/) || [''])[0];

/* La portada de verdad, pintada por pintarEntrar() y no por tarjetaGente()
   suelta: una tarjeta que existe pero que la portada no pinta es una función
   muda. El reloj se congela porque la tarjeta solo se pinta con un techo de
   usura certificado para el día, y la fecha de verdad no puede decidir si esta
   prueba pasa. */
function portada() {
  const P = abrirPlay();
  P.ev('this').Date = RELOJ.relojFijo(RELOJ.MOMENTO);
  P.ev('pintarEntrar()');
  return P.elems.cuerpo.innerHTML;
}
const imagenesDeGente = html =>
  [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]).filter(t => /\bclass="gente-esc"/.test(t));
const atributo = (etiqueta, nombre) =>
  (etiqueta.match(new RegExp('\\s' + nombre + '="([^"]*)"')) || [])[1];

/* Un WebP por dentro: RIFF, tamaño, «WEBP» y una fila de trozos (cuatro letras,
   cuatro bytes de tamaño, los datos, y un byte de relleno si el tamaño es impar). */
function leerWebp(b) {
  const esWebp = b.length > 30 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
  const trozos = [];
  let ancho = 0, alto = 0;
  if (esWebp) {
    for (let p = 12; p + 8 <= b.length;) {
      const id = b.subarray(p, p + 4).toString('latin1'), n = b.readUInt32LE(p + 4), d = p + 8;
      trozos.push(id);
      if (id === 'VP8 ' && !ancho) { ancho = b.readUInt16LE(d + 6) & 0x3fff; alto = b.readUInt16LE(d + 8) & 0x3fff; }
      if (id === 'VP8L' && !ancho) { const v = b.readUInt32LE(d + 1); ancho = (v & 0x3fff) + 1; alto = ((v >>> 14) & 0x3fff) + 1; }
      if (id === 'VP8X') { ancho = b.readUIntLE(d + 4, 3) + 1; alto = b.readUIntLE(d + 7, 3) + 1; }
      p = d + n + (n % 2);
    }
  }
  return { esWebp, trozos, ancho, alto };
}

describe('la gente de la portada, en foto (24-nov-2026)', () => {

  test('la portada pinta las tres personas como <img> de play/gente/*.webp, y los archivos existen', () => {
    const html = portada();
    const imgs = imagenesDeGente(html);
    assert.equal(imgs.length, 3, 'la portada no pinta las tres personas como imagen');
    /* Se resuelve la ruta como la resuelve el navegador, contra /play/: así un
       «../gente/» o un «/gente/» escrito por error se ve aquí y no en el
       teléfono de un cliente. */
    const pedidas = imgs.map(t => new URL(atributo(t, 'src'), 'https://tugarantia.net/play/').pathname.slice(1));
    assert.deepEqual(pedidas, RUTAS, 'las escenas no piden sus fotos en el orden de TEXTOS.gente');
    pedidas.forEach(r => assert.ok(fs.existsSync(path.join(RAIZ, r)),
      r + ' no existe: la puerta pública sale con una imagen rota'));
    assert.equal(/<svg[^>]*class="gente-esc"/.test(html), false, 'volvió un dibujo en línea');
    assert.equal(/gente\/[a-z]+\.svg/.test(html), false, 'la portada sigue pidiendo un dibujo .svg');
  });

  test('cada imagen guarda su hueco de 112 × 112 y no le habla al lector de pantalla', () => {
    const imgs = imagenesDeGente(portada());
    assert.equal(imgs.length, 3, 'no hay tres imágenes que revisar: esta prueba pasaría en vacío');
    imgs.forEach(t => {
      /* alt vacío y no ausente: sin alt, un lector de pantalla lee el nombre del
         archivo. Son decoración: nadie necesita oír cómo es una persona que no
         existe, y el texto de al lado dice lo que importa. */
      assert.equal(atributo(t, 'alt'), '', 'una foto perdió su alt="": ' + t);
      assert.equal(atributo(t, 'width'), '112');
      assert.equal(atributo(t, 'height'), '112');
      assert.equal(atributo(t, 'loading'), 'lazy');
      assert.equal(atributo(t, 'decoding'), 'async');
    });
    assert.match(REGLA, /width:112px/, 'la hoja y el HTML no dan el mismo ancho');
    assert.match(REGLA, /height:112px/, 'la hoja y el HTML no dan el mismo alto');
    assert.match(REGLA, /object-fit:cover/, 'sin object-fit:cover, una foto que no sea cuadrada sale aplastada');
  });

  test('cada foto es un WebP de verdad, de 336 × 336 y de menos de 40 KB', () => {
    RUTAS.forEach(r => {
      const b = fs.readFileSync(path.join(RAIZ, r));
      const w = leerWebp(b);
      assert.ok(w.esWebp, r + ' no es un WebP (¿un .png o un .jpg con otro nombre?)');
      assert.equal(w.ancho + '×' + w.alto, '336×336', r + ' no mide 336 × 336 (112 px × 3)');
      assert.ok(b.length < 40 * 1024, r + ' pesa ' + Math.round(b.length / 1024) + ' KB: el cliente la paga con sus datos');
      assert.ok(b.length > 4 * 1024, r + ' pesa menos de 4 KB: eso no es una foto');
    });
  });

  test('ninguna foto viaja con metadatos: ni el texto con que se pidió, ni fecha, ni programa', () => {
    RUTAS.forEach(r => {
      const b = fs.readFileSync(path.join(RAIZ, r));
      const w = leerWebp(b);
      ['EXIF', 'XMP ', 'ICCP'].forEach(id => assert.equal(w.trozos.includes(id), false, r + ' trae un trozo ' + id.trim()));
      assert.equal(/<x:xmpmeta|photorealistic|prompt|higgsfield|nano banana/i.test(b.toString('latin1')), false,
        r + ' lleva texto adentro');
    });
    /* El detector, probado: si no ve un EXIF puesto a mano, no sirve de centinela. */
    const conExif = Buffer.concat([Buffer.from('RIFF\x20\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00', 'latin1'), Buffer.alloc(10),
      Buffer.from('EXIF\x02\x00\x00\x00ab', 'latin1')]);
    assert.ok(leerWebp(conExif).trozos.includes('EXIF'));
  });

  test('las tres son fotos DISTINTAS: no se repite una persona en dos tarjetas', () => {
    const huellas = RUTAS.map(r => require('node:crypto').createHash('sha1').update(fs.readFileSync(path.join(RAIZ, r))).digest('hex'));
    assert.equal(new Set(huellas).size, 3);
  });

  test('la nota de la tarjeta dice que son fotos creadas con IA y que no son clientes ni testimonios', () => {
    const P = abrirPlay();
    const nota = P.ev('TEXTOS.gente_nota');
    assert.match(nota, /creadas con IA/);
    assert.match(nota, /no son clientes ni testimonios/);
    assert.equal(/ilustraci|dibujo/i.test(nota), false, 'la nota sigue hablando de dibujos');
    assert.ok(portada().includes(nota), 'la portada no pinta la nota');
  });

  test('en la carpeta no queda ningún dibujo viejo ni un archivo que la portada no pida', () => {
    const enDisco = fs.readdirSync(path.join(RAIZ, 'play', 'gente')).sort();
    assert.deepEqual(enDisco, ESCENAS.map(n => n + '.webp').sort());
  });

  test('la placa de detrás NO cambia con el tema (se ve mientras llega la foto)', () => {
    const fondo = (REGLA.match(/background(?:-color)?:([^;}]+)/) || [])[1];
    assert.ok(fondo, 'la imagen de la gente no tiene placa: mientras llega la foto queda un hueco sin fondo');
    const usados = [...fondo.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]);
    assert.ok(usados.length > 0, 'la placa no se arma con tokens');
    const oscuros = [...SIN_COMENTARIOS.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\}\s*\}|:root\[data-theme="dark"\]\s*\{[^}]*\}/g)]
      .map(m => m[0]).join('\n');
    assert.ok(oscuros.length > 0, 'no encontré los bloques del modo oscuro: revisa esta prueba');
    usados.forEach(v => assert.equal(new RegExp(v + '\\s*:').test(oscuros), false,
      'la placa usa ' + v + ', que cambia en modo oscuro'));
    assert.match(REGLA, /color-scheme:only light/, 'sin only light, un navegador con oscuro forzado repinta la placa');
  });

  test('ninguna regla pinta DENTRO de .gente-esc (el noveno patrón)', () => {
    /* Dentro de un <img> no hay nada que pintar, y pintar descendientes de una
       clase sin acotarla a su tarjeta ya dejó un descargo legal blanco sobre blanco. */
    const reglas = SIN_COMENTARIOS.match(/[^{}]*\.gente-esc[^{}]*\{/g) || [];
    assert.ok(reglas.length >= 1);
    reglas.forEach(r => r.split('{')[0].split(',').forEach(sel =>
      assert.equal(/\.gente-esc[\s>+~]+\S/.test(sel.trim()), false,
        'una regla pinta dentro de la imagen de la gente: ' + sel.trim())));
  });

  test('las tres fotos van en la precarga del service worker, y ningún .svg viejo', () => {
    /* Sin la precarga, el primer arranque sin señal enseña una imagen rota. Y como
       sw.js sirve las imágenes caché-primero, el cambio de dibujo a foto solo llega
       a cada teléfono porque el NOMBRE del archivo es nuevo. */
    const SW = leer('sw.js');
    const faltan = RUTAS.filter(r => SW.indexOf("'" + r + "'") === -1);
    assert.deepEqual(faltan, [], 'sw.js no precarga las fotos de la portada: sin señal salen rotas');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS'));
    assert.equal(/'play\/gente\/[a-z]+\.svg'/.test(lista), false, 'sw.js sigue precargando un .svg que ya no existe: la instalación falla');
    const v = Number((SW.match(/const CACHE = 'tugarantia-v(\d+)';/) || [])[1]);
    assert.ok(v >= 158, 'las fotos salen con v158 o más (va en v' + v + ')');
  });
});
