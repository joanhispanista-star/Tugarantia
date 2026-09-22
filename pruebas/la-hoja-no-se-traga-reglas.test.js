'use strict';
/* ==========================================================================
 * UN COMENTARIO SIN ABRIR SE TRAGA LA REGLA SIGUIENTE — 22 de septiembre de 2026
 *
 * Joan: «donde se pone la contraseña esta el boton de ver contraseña pero
 * quiero que cambie el diseño ya que se ve muy feo».
 *
 * No estaba mal diseñado: estaba SUELTO. Al mover la hoja del escáner dentro de
 * play/index.html el 21-sep se perdió el «/*» que abría un comentario largo. Un
 * navegador no da ningún error por eso: lee toda la prosa del comentario como
 * si fuera un SELECTOR y sigue leyendo hasta la primera llave que encuentra, así
 * que se come entera la PRIMERA REGLA que venga detrás.
 *
 * La regla que se estaba comiendo era «.clave-caja{position:relative}», que es
 * justo la que ancla el ojo DENTRO de la barra de la contraseña. Sin ella, el
 * ojo —que está posicionado en absoluto— se cuelga del antepasado posicionado
 * más cercano y aparece donde no debe.
 *
 * Llevaba así un día entero. Y el segundo día costó otra vez: una regla nueva
 * escrita justo ahí también desapareció, y hubo que perseguirla preguntándole al
 * navegador qué reglas le aplicaban al campo.
 *
 * ESTE ARCHIVO EXISTE PORQUE ESE FALLO NO GRITA. No hay error, no hay consola
 * roja, no hay prueba que falle: solo una regla que no está. Se vigila de dos
 * maneras, y las dos hacen falta.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* Saca todas las hojas del proyecto: las sueltas y las que viven dentro de un
   <style> en una página. */
function hojas() {
  const out = [];
  ['play/estilo.css', 'app/chat.css'].forEach(f => out.push([f, leer(f)]));
  ['play/index.html', 'panel/crm.html', 'app/socio.html', 'index.html'].forEach(f => {
    const s = leer(f);
    let m, i = 0;
    const re = /<style>([\s\S]*?)<\/style>/g;
    while ((m = re.exec(s))) out.push([f + ' <style#' + (++i) + '>', m[1]]);
  });
  return out;
}

/* Recorre carácter a carácter, como el navegador. Un conteo de «/*» contra
   «*​/» NO sirve: los comentarios de CSS no anidan, así que una secuencia de
   apertura ESCRITA DENTRO de un comentario no abre nada — y este mismo archivo
   la menciona. Contar da falsas alarmas y, peor, falsos silencios. */
function revisar(css) {
  const malos = [];
  let i = 0, dentro = false, abreEn = 1, lin = 1;
  while (i < css.length) {
    if (css[i] === '\n') lin++;
    if (!dentro && css[i] === '/' && css[i + 1] === '*') { dentro = true; abreEn = lin; i += 2; continue; }
    if (dentro && css[i] === '*' && css[i + 1] === '/') { dentro = false; i += 2; continue; }
    if (!dentro && css[i] === '*' && css[i + 1] === '/') {
      malos.push('un cierre de comentario SIN apertura, cerca de la línea ' + lin +
        '. Todo lo de arriba se lee como un selector y se traga la regla siguiente');
      i += 2; continue;
    }
    i++;
  }
  if (dentro) malos.push('un comentario abierto en la línea ' + abreEn +
    ' que nunca se cierra: todo lo que sigue se descarta');
  return malos;
}

describe('ninguna hoja se traga una regla en silencio', () => {

  hojas().forEach(([nombre, css]) => {
    test(nombre + ': los comentarios abren y cierran donde deben', () => {
      assert.deepEqual(revisar(css), [],
        nombre + ' tiene un comentario mal formado. Eso no da ningún error: el ' +
        'navegador se come la regla siguiente y nadie se entera');
    });
  });
});

describe('ningún atributo se escapa de su etiqueta', () => {

  /* EL OTRO FALLO QUE NO GRITA, y este llevaba DOS SEMANAS en la puerta
     pública. El 8-sep, el commit que pasó los precios de porcentajes a pesos
     hizo una sustitución automática sobre «5%» y se comió el «$1» junto con el
     cierre de la etiqueta. Quedó así, y se veía impreso en pantalla:

       <p class="tasa"> style="font-size:16px;color:var(--gris)"5.000 <span…

     En la tarjeta que dice cuánto cuesta prestar, en tugarantia.net, a la vista
     de cualquiera. Ningún navegador se queja: un atributo fuera de su etiqueta
     es simplemente texto. */
  ['index.html', 'play/index.html', 'legal/terminos.html', 'legal/privacidad.html',
   'panel/crm.html', 'app/socio.html'].forEach(f => {
    test(f + ': no hay un atributo suelto fuera de su etiqueta', () => {
      /* Fuera los comentarios y fuera los <script>: dentro de un guion, el
         HTML se arma con plantillas y un trozo de código entre un «>» y un «<»
         parece un atributo suelto sin serlo. El defecto que se vigila aquí es
         del MARCADO estático, que es lo que el navegador pinta tal cual. */
      const s = leer(f)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<style[\s\S]*?<\/style>/g, ' ');
      /* Entre un «>» y el siguiente «<» solo puede haber texto. Si ahí aparece
         algo con la forma «nombre="valor"», es un atributo que se escapó. */
      const sueltos = [];
      const re = />([^<]*)</g;
      let m;
      while ((m = re.exec(s))) {
        const t = m[1];
        if (/\b(style|class|href|src|id|onclick|width|height)\s*=\s*"/.test(t)) {
          sueltos.push(t.trim().slice(0, 80));
        }
      }
      assert.deepEqual(sueltos, [],
        f + ' tiene un atributo impreso como texto en la pantalla. Suele venir de ' +
        'una sustitución automática que se comió el cierre de una etiqueta, y ningún ' +
        'navegador se queja: lo pinta tal cual.');
    });
  });
});

describe('la regla que ya se perdió una vez', () => {

  /* La segunda vigilancia, y es la que de verdad importa: que la regla
     CONCRETA que se estaba perdiendo siga ahí y siga siendo alcanzable. Los
     comentarios equilibrados son la causa; esto es el efecto. */
  const PLAY = leer('play/index.html');
  const ESTILO = PLAY.slice(PLAY.indexOf('<style>') + 7, PLAY.indexOf('</style>'));
  /* Sin comentarios, que es lo que el navegador acaba aplicando. */
  const VIVO = ESTILO.replace(/\/\*[\s\S]*?\*\//g, ' ');

  test('el ojo se ancla DENTRO de la barra de la contraseña', () => {
    assert.match(VIVO, /\.clave-caja\{[^}]*position:relative/,
      'se perdió «.clave-caja{position:relative}». Sin ella el ojo, que está ' +
      'posicionado en absoluto, se cuelga de otro antepasado y aparece suelto: ' +
      'es exactamente lo que Joan describió como «se ve muy feo»');
  });

  test('y las casillas donde se escribe son blancas con letra negra', () => {
    /* Joan, con una clienta cuyo teléfono estaba en modo oscuro: «no quiero que
       sea oscuro donde uno escribe si no blanco con letras negras». */
    assert.match(VIVO, /input\[type=password\][\s\S]{0,200}\{[^}]*background:#FFFFFF/,
      'las casillas volvieron a heredar var(--papel), que en modo oscuro es casi negro');
    assert.match(VIVO, /background:#FFFFFF;color:#0C0A0B/,
      'el fondo blanco quedó sin su letra negra: sería blanco sobre blanco');
  });

  test('la regla del campo va DESPUÉS de la hoja externa, o no gana', () => {
    /* estilo.css pinta los mismos campos con la misma especificidad, así que
       esto solo funciona por orden. Si alguien mueve el <style> antes del
       <link>, la casilla vuelve a ser oscura sin que nada falle. */
    const link = PLAY.indexOf('href="estilo.css"');
    const style = PLAY.indexOf('<style>');
    assert.ok(link > 0 && style > link,
      'el <style> de la página quedó ANTES de estilo.css: sus reglas dejan de ganar');
  });
});
