/* ===========================================================================
 * LA FOTO DE LA CÉDULA NO PUEDE TUMBAR LA PÁGINA
 *
 * Joan, 16-sep-2026: «cuando intenté entrar como cliente en la parte de tomar
 * la foto de la cédula la página se cerró».
 *
 * LO QUE PASABA, en orden, al tomar el REVERSO:
 *   1. se descargaba la librería del código de barras (ZXing)
 *   2. se decodificaba la foto entera a 1600 px
 *   3. el lector la volvía a decodificar desde el data URL
 *   4. y SOLO ENTONCES se decodificaba una TERCERA vez a 900 px, para guardar
 *
 * Tres decodificaciones completas de una foto de celular —doce millones de
 * píxeles son unos cuarenta megas de mapa de bits cada una— justo cuando el
 * navegador acaba de volver de la cámara y está en su peor momento de memoria.
 * En un teléfono barato el sistema descarta la pestaña. Y como lo último que se
 * hacía era guardar, al volver NO HABÍA FOTO: la persona empezaba de cero.
 *
 * LAS DOS CURAS, y la segunda importa más que la primera:
 *   · una sola decodificación, de la que salen los dos tamaños;
 *   · y se GUARDA PRIMERO. Leer el código de barras ahorra teclear; perder la
 *     foto no se ahorra con nada.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');

/* Un archivo de mentira que cuenta cuántas veces lo decodifican. Es la medida
   que importa: cada decodificación es el pico de memoria que tumba la pestaña. */
function prepararCamara(P, opciones) {
  const o = opciones || {};
  P.ev('window.__decodificaciones = 0;');
  P.ev(`
    window.URL = window.URL || {};
    URL.createObjectURL = function () { return 'blob:falso'; };
    URL.revokeObjectURL = function () {};
    window.Image = function () {
      var self = this;
      this.width = 4000; this.height = 3000;
      Object.defineProperty(this, 'src', {
        set: function (v) {
          if (!v) return;
          window.__decodificaciones++;
          /* El banco tiene un setTimeout que no hace nada, asi que la camara de
             mentira dispara de una. Lo que se mide es el ORDEN y el NUMERO de
             decodificaciones, no el reloj. */
          if (self.onload) self.onload();
        },
        get: function () { return 'blob:falso'; }
      });
    };
  `);
  /* El lienzo devuelve una cadena reconocible y del tamaño que se le pida. */
  P.ev(`
    document.createElement = (function (o) {
      return function (t) {
        if (t === 'canvas') {
          return { width: 0, height: 0,
                   getContext: function () { return { drawImage: function () {} }; },
                   toDataURL: function () { return 'data:image/jpeg;base64,FOTO-' + this.width; } };
        }
        return o.call(document, t);
      };
    })(document.createElement);
  `);
  /* ZXing: por defecto revienta, que es el caso que importa. */
  P.ev(`
    window.cargarScript = function () {
      return ${o.zxingCae ? 'Promise.reject(new Error("sin red"))' : 'Promise.resolve()'};
    };
  `);
}

const disparar = (P, key) =>
  P.ev(`tomarFoto({ target: { files: [{ name: 'x.jpg', size: 4000000 }] } }, '${key}')`);

const esperar = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

describe('la foto de la cédula (16-sep-2026)', () => {

  test('el REVERSO se decodifica UNA vez, no tres', () => {
    /* El número es la memoria. Tres decodificaciones de una foto de celular son
       unos ciento veinte megas de picos, y por ahí se va la pestaña.
       MUTANTE QUE CAZA: volver a llamar a comprimirImagen por separado para cada
       tamaño, que es el código que estuvo vivo hasta hoy. */
    const P = abrirPlay();
    prepararCamara(P);
    disparar(P, 'cedula_reverso');
    return esperar().then(() => {
      assert.equal(P.ev('window.__decodificaciones'), 1,
        'la foto se decodificó ' + P.ev('window.__decodificaciones') + ' veces: cada una es ' +
        'un pico de memoria, y son los que cierran la página en un teléfono barato');
    });
  });

  test('y el FRENTE también, que no necesita código de barras', () => {
    const P = abrirPlay();
    prepararCamara(P);
    disparar(P, 'cedula_frente');
    return esperar().then(() => {
      assert.equal(P.ev('window.__decodificaciones'), 1);
    });
  });

  test('LA FOTO SE GUARDA ANTES de intentar leer el código', () => {
    /* Es la cura que de verdad importa. Si la pestaña se muere leyendo el
       código, la foto ya tiene que estar guardada.
       MUTANTE QUE CAZA: devolver el orden anterior (código primero). */
    const P = abrirPlay();
    prepararCamara(P, { zxingCae: true });   // el lector revienta, como sin señal
    disparar(P, 'cedula_reverso');
    return esperar().then(() => {
      assert.ok(String(P.ev('FOTOS.cedula_reverso || ""')).indexOf('FOTO-900') > -1,
        'el lector del código falló y la foto NO quedó guardada: la persona ' +
        'tiene que volver a tomarla');
    });
  });

  test('la foto que se guarda es la CHICA, no la de 1600', () => {
    /* La de 1600 existe solo para que el lector vea el código. Guardar esa sería
       cuadruplicar lo que pesa cada cédula en el teléfono y en la nube. */
    const P = abrirPlay();
    prepararCamara(P);
    disparar(P, 'cedula_reverso');
    return esperar().then(() => {
      assert.equal(P.ev('FOTOS.cedula_reverso'), 'data:image/jpeg;base64,FOTO-900',
        'se guardó la versión grande, que pesa cuatro veces más y no hace falta');
    });
  });

  test('si la foto no se puede abrir, se dice y no se rompe nada', () => {
    const P = abrirPlay();
    prepararCamara(P);
    P.ev('window.Image = function () { var s = this; Object.defineProperty(this, "src", ' +
         '{ set: function (v) { if (v && s.onerror) s.onerror(); } }); };');
    disparar(P, 'cedula_frente');
    return esperar().then(() => {
      assert.ok(!P.ev('FOTOS.cedula_frente'), 'se guardó algo de una foto que no se pudo abrir');
    });
  });

  test('una sola forma de comprimir en todo el archivo', () => {
    /* Tener dos es como se llegó a decodificar la misma foto tres veces. */
    const fs = require('node:fs'), path = require('node:path');
    const t = fs.readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8');
    assert.match(t, /function comprimirImagen[\s\S]{0,400}?return comprimirVarias/,
      'comprimirImagen volvió a tener su propia decodificación en vez de reenviar');
  });
});
