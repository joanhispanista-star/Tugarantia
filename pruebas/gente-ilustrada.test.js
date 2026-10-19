'use strict';
/* ==========================================================================
 * LA GENTE DE LA PORTADA LA DIBUJÓ UN ILUSTRADOR — 19 de octubre de 2026
 *
 * Joan, mirando la tarjeta «Para qué te sirve» de tugarantia.net/play/: «la
 * calidad es muy baja… quiero que se vean más cercanas a lo que es una
 * persona, no a dibujos de niño de 3 años». Los dibujos del 16-sep estaban
 * hechos a mano en el propio HTML; los de hoy son de Open Peeps (Pablo
 * Stanley, CC0) y viven en play/gente/*.svg, uno por escena.
 *
 * Cambiar de un SVG en línea a un archivo aparte trae cuatro maneras nuevas de
 * fallar, y ninguna se ve en la suite si nadie las mira:
 *  1. Que la tarjeta pida un archivo que no está: imagen rota en la puerta
 *     pública, que es lo primero que ve un desconocido.
 *  2. Que el archivo no se pinte dentro de un <img> (sin xmlns no se pinta), o
 *     que traiga algo que corra: un .svg servido desde tugarantia.net y abierto
 *     directo ejecuta sus scripts CON el origen de la app, o sea con su
 *     localStorage y su sesión.
 *  3. Que el modo oscuro se la trague: un <img> no hereda --tinta, así que si
 *     la placa de detrás cambia con el tema, la tinta negra se pierde.
 *  4. Que no esté en la precarga del service worker: el primer arranque sin
 *     señal enseña la imagen rota.
 * Lo que vigilaba el bloque del 16-sep en vitrina.test.js (ni ✓ ni cifras ni
 * texto dentro de los dibujos) sigue allá, leyendo ahora estos archivos.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RELOJ = require('./reloj.js');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ESCENAS = ['varas', 'eliges', 'ayuda'];
const RUTAS = ESCENAS.map(n => 'play/gente/' + n + '.svg');
const CSS = leer('play/estilo.css');
const SIN_COMENTARIOS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/* La portada de verdad, pintada por pintarEntrar() y no por tarjetaGente()
   suelta: una tarjeta que existe pero que la portada no pinta es una función
   muda. El reloj se congela porque la tarjeta solo se pinta con un techo de
   usura certificado para el día (el guardián del 17-sep), y la fecha de verdad
   no puede decidir si esta prueba pasa. */
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

describe('la gente de la portada, dibujada por un ilustrador (19-oct-2026)', () => {

  test('la portada pinta las tres personas como <img> de play/gente/, y los archivos existen', () => {
    const html = portada();
    const imgs = imagenesDeGente(html);
    assert.equal(imgs.length, 3, 'la portada no pinta las tres personas como imagen');
    /* Se resuelve la ruta como la resuelve el navegador, contra /play/: así un
       «../gente/» o un «/gente/» escrito por error se ve aquí y no en el
       teléfono de un cliente. */
    const pedidas = imgs.map(t => new URL(atributo(t, 'src'), 'https://tugarantia.net/play/').pathname.slice(1));
    assert.deepEqual(pedidas, RUTAS, 'las escenas no piden sus archivos en el orden de TEXTOS.gente');
    pedidas.forEach(r => assert.ok(fs.existsSync(path.join(RAIZ, r)),
      r + ' no existe: la puerta pública sale con una imagen rota'));
    assert.equal(/<svg[^>]*class="gente-esc"/.test(html), false,
      'volvió un dibujo en línea al lado de los de ilustrador');
  });

  test('cada imagen guarda su hueco y no le habla al lector de pantalla', () => {
    const imgs = imagenesDeGente(portada());
    assert.equal(imgs.length, 3, 'no hay tres imágenes que revisar: esta prueba pasaría en vacío');
    imgs.forEach(t => {
      /* alt vacío y no ausente: sin alt, un lector de pantalla lee el nombre del
         archivo («varas punto ese uve ge»). Son decoración; el texto de al lado
         es lo que importa. */
      assert.equal(atributo(t, 'alt'), '', 'una persona dibujada perdió su alt="": ' + t);
      const w = Number(atributo(t, 'width')), h = Number(atributo(t, 'height'));
      assert.ok(w > 0 && w === h, 'sin width/height iguales el texto salta al llegar la imagen: ' + t);
      /* Y la hoja tiene que estar de acuerdo con el HTML, o el hueco reservado
         no es el que se pinta. */
      const regla = (SIN_COMENTARIOS.match(/\.gente-esc\{[^}]*\}/) || [''])[0];
      assert.match(regla, new RegExp('width:' + w + 'px'), 'la hoja y el HTML no dan el mismo ancho');
      assert.match(regla, new RegExp('height:' + h + 'px'), 'la hoja y el HTML no dan el mismo alto');
    });
  });

  test('los tres archivos se pintan dentro de un <img> y no traen nada que corra', () => {
    RUTAS.forEach(r => {
      const s = leer(r);
      /* Al revés que los <svg> en línea de index.html: en un archivo aparte, sin
         xmlns el navegador no lo pinta. */
      assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, r + ' no se pintaría: le falta el xmlns');
      const vb = (s.match(/viewBox="([^"]+)"/) || [])[1];
      assert.ok(vb, r + ' no tiene viewBox');
      const [, , ancho, alto] = vb.split(/\s+/).map(Number);
      assert.equal(ancho, alto, r + ' no es cuadrado y la placa es cuadrada: la persona quedaría flotando');
      [[/<script/i, 'un script'], [/\son[a-z]+\s*=/i, 'un manejador de eventos'],
       [/href\s*=/i, 'un enlace'], [/<image\b/i, 'una imagen de afuera'],
       [/<foreignObject/i, 'HTML incrustado'], [/<use\b/i, 'una referencia'],
       [/url\(/i, 'una url()'], [/<style/i, 'una hoja propia']]
        .forEach(([p, que]) => assert.equal(p.test(s), false, r + ' trae ' + que));
      const urls = (s.match(/https?:\/\/[^\s"')]+/g) || []).filter(u => u !== 'http://www.w3.org/2000/svg');
      assert.deepEqual(urls, [], r + ' apunta a un servidor ajeno');
    });
  });

  test('tinta y blanco, sin color de piel y sin los restos de Sketch', () => {
    /* La regla del 16-sep sigue: ningún tono de piel, porque elegir uno es
       elegir a quién se parece el cliente. Open Peeps es tinta negra sobre
       relleno blanco; un color nuevo pegado aquí rompe esa decisión sin que
       nadie la discuta. */
    RUTAS.forEach(r => {
      const s = leer(r);
      const colores = [...s.matchAll(/\b(?:fill|stroke|stop-color|color)\s*=\s*"([^"]+)"/g)].map(m => m[1].toLowerCase());
      colores.forEach(c => assert.ok(['#fff', '#ffffff', '#000', '#000000', 'none'].includes(c),
        r + ' trae el color ' + c + ': las personas son tinta y blanco, sin tono de piel'));
      [[/Generator:\s*Sketch|sketch\.com/i, 'el comentario de Sketch'], [/<title/, 'un <title>'], [/<desc/, 'un <desc>'],
       [/\sid="/, 'ids sueltos'], [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'un emoji']]
        .forEach(([p, que]) => assert.equal(p.test(s), false, r + ' conserva ' + que));
      /* Las muestras originales pesan 21-53 KB; limpias, 13-21. Un archivo de
         más de 24 KB es casi seguro una muestra pegada tal cual. */
      const kb = Buffer.byteLength(s) / 1024;
      assert.ok(kb < 24, r + ' pesa ' + kb.toFixed(1) + ' KB: ¿se pegó la muestra sin limpiar?');
    });
  });

  test('el crédito a Pablo Stanley va dentro de cada archivo', () => {
    /* CC0 no lo exige. Se pone igual: es lo honesto con quien los dibujó, y el
       día que alguien pregunte de dónde salieron, la respuesta está en el
       archivo y no en la memoria de nadie. */
    RUTAS.forEach(r => assert.match(leer(r), /Open Peeps, de Pablo Stanley — CC0 \(openpeeps\.com\)/,
      r + ' perdió el crédito'));
  });

  test('la placa de detrás NO cambia con el tema: un <img> no hereda --tinta', () => {
    /* Los dibujos de antes se pintaban con --tinta y se invertían solos en modo
       oscuro. Estos son tinta negra siempre; sobre una placa que se oscurezca
       con el tema, desaparecen. Se comprueba que la placa exista y que ninguno
       de los tokens con que se arma se redefina en los bloques oscuros. */
    const regla = (SIN_COMENTARIOS.match(/\.gente-esc\{[^}]*\}/) || [''])[0];
    const fondo = (regla.match(/background(?:-color)?:([^;}]+)/) || [])[1];
    assert.ok(fondo, 'la imagen de la gente no tiene placa: en modo oscuro la tinta negra se pierde');
    const usados = [...fondo.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]);
    assert.ok(usados.length > 0, 'la placa no se arma con tokens');
    const oscuros = [...SIN_COMENTARIOS.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\}\s*\}|:root\[data-theme="dark"\]\s*\{[^}]*\}/g)]
      .map(m => m[0]).join('\n');
    assert.ok(oscuros.length > 0, 'no encontré los bloques del modo oscuro: revisa esta prueba');
    usados.forEach(v => assert.equal(new RegExp(v + '\\s*:').test(oscuros), false,
      'la placa usa ' + v + ', que cambia en modo oscuro: la tinta negra quedaría sobre fondo oscuro'));
  });

  test('ninguna regla pinta DENTRO de .gente-esc (el noveno patrón)', () => {
    /* Dentro de un <img> no hay nada que pintar: una regla a sus descendientes
       es código muerto, y las del 16-sep (.gente-esc .g-…) lo eran desde hoy.
       Y el noveno patrón de la casa: pintar descendientes de una clase sin
       acotarla a su tarjeta ya dejó un descargo legal blanco sobre blanco. */
    const reglas = SIN_COMENTARIOS.match(/[^{}]*\.gente-esc[^{}]*\{/g) || [];
    reglas.forEach(r => r.split('{')[0].split(',').forEach(sel =>
      assert.equal(/\.gente-esc[\s>+~]+\S/.test(sel.trim()), false,
        'una regla pinta dentro de la imagen de la gente: ' + sel.trim())));
  });

  test('las tres rutas van en la precarga del service worker', t => {
    /* Sin la precarga, el primer arranque sin señal enseña una imagen rota, y
       como sw.js sirve las imágenes caché-primero, un dibujo cambiado sin subir
       el número de caché se queda viejo en cada teléfono.
       Esta rama no edita sw.js (lo junta quien publica las fases del 19-oct),
       así que la prueba se ARMA SOLA cuando el número de caché pase de v137, que
       es justo cuando esto sale a la calle: desde ese momento, una publicación
       sin las tres rutas no pasa. Mientras tanto queda en TODO, que sí se ve en
       el resumen de la suite. */
    const faltan = sw => RUTAS.filter(r => sw.indexOf("'" + r + "'") === -1);
    /* El detector, probado contra los dos casos: si no ve una lista vacía, no
       sirve de centinela. */
    assert.deepEqual(faltan("const ARCHIVOS = ['play/index.html'];"), RUTAS);
    assert.deepEqual(faltan(RUTAS.map(r => "'" + r + "'").join(',\n')), []);
    const SW = leer('sw.js');
    const v = Number((SW.match(/const CACHE = 'tugarantia-v(\d+)';/) || [])[1]);
    assert.ok(v > 0, 'sw.js ya no declara CACHE con la forma tugarantia-vN');
    if (v <= 137 && faltan(SW).length) {
      t.todo('sw.js sigue en v' + v + ': faltan en ARCHIVOS ' + faltan(SW).join(', ') + ' (y subir CACHE)');
      return;
    }
    assert.deepEqual(faltan(SW), [],
      'sw.js v' + v + ' no precarga los dibujos de la portada: sin señal salen rotos');
  });
});
