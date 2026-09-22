'use strict';
/* ==========================================================================
 * LA FOTO LA DECIDE EL DECODIFICADOR, NO EL TELÉFONO — 22 de septiembre de 2026
 *
 * Había un `if (!/^image\//.test(f.type))` antes de tocar la imagen, y parecía
 * lo correcto. No lo era, por dos motivos que solo se ven juntos:
 *
 *   1. El tipo que declara el teléfono NO ES FIABLE. Hay gestores de archivos
 *      de Android que entregan el tipo VACÍO sobre una foto perfecta. Ese `if`
 *      le contestaba «eso no es una foto» a una foto — y el primero en
 *      encontrárselo iba a ser la persona que Joan puso a probar con un Android.
 *   2. El tipo NO HACE FALTA para nada. La foto pasa por un lienzo que la
 *      vuelve a codificar a JPEG pase lo que pase, así que da igual si entró
 *      PNG, HEIC de iPhone o WebP: lo que sale hacia la base es
 *      `data:image/jpeg`, y el CHECK de la tabla lo comprueba de todos modos.
 *
 * Lo único que sí merece mirarse antes es el VIDEO, y no porque no se pueda
 * abrir —no se puede— sino para poder decir POR QUÉ no cabe en vez de un
 * «no se pudo» que deja a la persona intentándolo otra vez para siempre.
 *
 * Es el mismo error de forma que la casa ya cometió con la cédula: fiarse de
 * lo que llega declarado en lugar de comprobarlo. Aquí se comprueba abriéndola.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');

/* Un banco con lo justo para que mandarFoto llegue hasta el final: un lector
   que devuelve, una imagen que abre, un lienzo que dibuja. Lo que se prueba no
   es el navegador, es la DECISIÓN de quién dice si algo es una foto. */
function conCamara(opciones) {
  const o = opciones || {};
  const P = abrirPlay({ hash: '' });
  P.ev('CFG = { url: "https://x.supabase.co", anon: "llave" };');
  P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net" } };');
  P.ev('CANAL = "servicio";');

  P.ev(`
    window.__abre = ${o.abre === false ? 'false' : 'true'};
    /* Sincronos a proposito: el setTimeout del banco es un () => 0 que nunca
       llama a nadie, asi que una cadena que espere al reloj no llega nunca al
       final. Lo que se prueba es la DECISION, no el momento en que ocurre. */
    FileReader = function () {};
    FileReader.prototype.readAsDataURL = function () {
      this.result = 'data:loquesea;base64,AAAA';
      if (this.onload) this.onload();
    };
    Image = function () {};
    Object.defineProperty(Image.prototype, 'src', {
      set: function () {
        if (window.__abre) {
          this.naturalWidth = 1200; this.naturalHeight = 900;
          if (this.onload) this.onload();
        } else if (this.onerror) { this.onerror(); }
      }
    });
    document.createElement = function () {
      return { width: 0, height: 0, getContext: function () { return { drawImage: function () {} }; } };
    };
    fotoDeLienzo = function (c, ancho) { return 'data:image/jpeg;base64,' + (ancho === 900 ? 'GRANDE' : 'mini'); };
    window.__enviado = null;
    rpcSesion = function (f, cuerpo) {
      window.__enviado = { fn: f, cuerpo: cuerpo };
      return Promise.resolve({ ok: true });
    };
    abrirCanal = function () {};
  `);
  return P;
}

const mandar = (P, tipo) => {
  P.ev(`mandarFoto({ value: '', files: [{ type: ${JSON.stringify(tipo)}, name: 'x' }] })`);
  return new Promise(r => setTimeout(r, 20));
};

const loQueDice = P => String(P.ev('(document.getElementById("errChat") || {}).textContent || ""'));
const loEnviado = P => JSON.parse(P.ev('JSON.stringify(window.__enviado)'));

describe('una foto sin tipo declarado SÍ entra', () => {

  test('con el tipo vacío, que es lo que manda medio Android', async () => {
    const P = conCamara();
    await mandar(P, '');
    const e = loEnviado(P);
    assert.ok(e, 'se rechazó una foto perfecta por venir sin tipo: es lo primero ' +
      'que se iba a encontrar la persona que prueba con el Android');
    assert.equal(e.fn, 'chat_foto_sesion');
    assert.match(e.cuerpo.p_imagen, /^data:image\/jpeg;base64,/,
      'lo que sale hacia la base no es un JPEG, que es lo que el CHECK exige');
  });

  test('y con un tipo que nadie esperaba, como el HEIC del iPhone', async () => {
    const P = conCamara();
    await mandar(P, 'image/heic');
    assert.ok(loEnviado(P), 'un HEIC no llegó a intentarlo siquiera');
  });

  test('un octet-stream también: lo que sale es JPEG de todos modos', async () => {
    const P = conCamara();
    await mandar(P, 'application/octet-stream');
    assert.ok(loEnviado(P), 'se rechazó por el tipo algo que el lienzo abrió sin problema');
  });
});

describe('lo que no se puede abrir, se dice; y el video se dice ANTES', () => {

  test('el video se ataja con su porqué, sin gastar el lector', async () => {
    const P = conCamara();
    await mandar(P, 'video/mp4');
    assert.equal(loEnviado(P), null, 'se mandó un video: 25 de esos dejan la base de solo lectura');
    assert.match(loQueDice(P), /Un video no cabe en el chat/,
      'se rechaza el video sin explicar por qué: la persona lo vuelve a intentar');
  });

  test('y lo que no abre lo caza el decodificador, no el tipo', async () => {
    /* Esta es la mitad que sostiene a la otra: si se deja de mirar el tipo,
       algo tiene que rechazar lo que no es una foto. Es el decodificador, y
       tiene que DECIRLO. */
    const P = conCamara({ abre: false });
    await mandar(P, '');
    assert.equal(loEnviado(P), null, 'se subió algo que ni siquiera se pudo abrir');
    assert.match(loQueDice(P), /no se pudo abrir como foto/i,
      'no se le dice a la persona que el archivo no era una foto');
  });
});

describe('y el tipo ya no decide, ni por descuido', () => {

  test('no queda ningún portero que mire el tipo declarado para dejar pasar', () => {
    /* Sin comentarios: el que explica este arreglo cita la línea mala, y una
       prueba que mire la prosa se caza a sí misma. Ya pasó tres veces hoy. */
    const fs = require('node:fs'), path = require('node:path');
    const PLAY = fs.readFileSync(path.join(__dirname, '..', 'play', 'index.html'), 'utf8');
    const i = PLAY.indexOf('function mandarFoto');
    const cuerpo = PLAY.slice(i, PLAY.indexOf('function subirFotoChat'))
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.equal(/!\/\^image\\\//.test(cuerpo), false,
      'volvió el portero que se fía del tipo declarado: un tipo vacío es una ' +
      'foto perfecta rechazada');
    assert.match(cuerpo, /\/\^video\\\/\/\.test/,
      'se fue también el aviso del video, que es lo único que sí merece mirarse antes');
  });
});
