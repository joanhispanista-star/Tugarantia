'use strict';
/* ==========================================================================
 * EL PLAZO SE PIDE, NO SE PROMETE — 22 de septiembre de 2026
 *
 * Joan: «quiero que el cliente pueda elegir el monto que quiera y el plazo que
 * quiera desde la calculadora».
 *
 * EL MONTO SÍ, EL PLAZO NO, y la diferencia no es de pantalla.
 *
 * Un monto por encima del cupo no es un error: es una petición que Joan
 * contrapropone hacia abajo con el producto que ya tiene. El plazo no funciona
 * así. El motor con el que Joan cotiza y contrapropone LANZA un RangeError
 * fuera de 1..6 (simularPrestamoRespaldado), y el formulario de contrapropuesta
 * del CRM está clavado al mismo rango. Si el cliente pidiera 24 cuotas, la
 * solicitud entraría y Joan NO TENDRÍA CON QUÉ RESPONDERLE: se quedaría muerta
 * en la bandeja y el cliente leería el silencio como un no.
 *
 * Así que el plazo entra como PETICIÓN ESCRITA: viaja en la nota, que ya llega
 * al CRM, y Joan decide caso a caso. La pantalla dice lo que de verdad pasa
 * —«lo leemos y te contestamos»— y nunca que se lo dan.
 *
 * Este archivo guarda las dos mitades: que el cliente pueda pedirlo, y que Joan
 * SE ENTERE de que lo pidió en vez de que se le recorte en silencio.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PLAY = leer('play/index.html');
const CRM = leer('panel/crm.html');

function enElSimulador() {
  const P = abrirPlay({ hash: '' });
  P.ev('CFG = { url: "https://x.supabase.co", anon: "llave" };');
  P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net", ' +
       'user_metadata: { perfil: "nuevo" } } };');
  P.ev('pintarCuenta()'); P.ev('irA("credito")');
  return P;
}

describe('el cliente puede pedir otro plazo', () => {

  test('hay dónde escribirlo, al lado de la cifra libre', () => {
    const P = enElSimulador();
    const h = P.elems.lamina.innerHTML;
    assert.match(h, /id="rPlazoLibre"/, 'no hay casilla para pedir otro plazo');
    assert.match(h, /id="rMontoLibre"/, 'desapareció la casilla de la cifra libre');
  });

  test('la ayuda dice lo que PASA, no que se lo dan', () => {
    const P = enElSimulador();
    const h = P.elems.lamina.innerHTML;
    assert.match(h, /lo leemos con tu solicitud y te contestamos/i,
      'no se dice qué pasa con lo que escriba');
    /* La trampa: prometer el plazo. Hoy no hay producto detrás de 12 cuotas. */
    assert.equal(/te lo damos|lo aprobamos|puedes pedir hasta \d+ cuotas/i.test(h), false,
      'la pantalla promete un plazo que no existe como producto');
    /* Y dice cuál es el rango real, para que la petición sea informada. */
    assert.match(h, /Hoy prestamos de 3 a 6 cuotas/,
      'no se dice cuál es el plazo que de verdad se presta');
  });

  test('lo escrito viaja en la NOTA, no en el plazo que se registra', () => {
    /* p_meses es lo que se va a registrar y tiene que ser un plazo que exista.
       Lo que el cliente pide de más es información para Joan, no una
       instrucción para la base: si viajara en p_meses, play_solicitar lo
       rechazaría entero y la solicitud no llegaría. */
    const P = enElSimulador();
    P.ev('window.__l = [];');
    P.ev('fetch = function (u, o) { window.__l.push({ u: u, cuerpo: JSON.parse(o.body) });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); };');
    P.ev('MONTO = 900000; PLAZO = 6;');
    P.ev('document.getElementById("rPlazoLibre").value = "10 cuotas";');
    P.ev('document.getElementById("rNota").value = "Para surtir";');
    P.ev('pedir()');
    const l = JSON.parse(P.ev('JSON.stringify(window.__l)'));
    assert.equal(l.length, 1, 'no salió la solicitud');
    assert.equal(l[0].cuerpo.p_meses, 6,
      'el plazo pedido se coló en p_meses: el servidor rechazaría la solicitud entera');
    assert.match(l[0].cuerpo.p_nota, /Pide el plazo: 10 cuotas/,
      'lo que el cliente pidió no llega al CRM');
    assert.match(l[0].cuerpo.p_nota, /Para surtir/,
      'se perdió el «para qué lo quiere» al meter el plazo');
  });

  test('sin pedir otro plazo, la nota no se ensucia', () => {
    const P = enElSimulador();
    P.ev('document.getElementById("rNota").value = "Solo esto";');
    assert.equal(P.ev('notaConPlazo()'), 'Solo esto',
      'se añade un texto de plazo aunque el cliente no pidiera ninguno');
  });
});

describe('Joan se entera de lo que el cliente pidió', () => {

  test('el formulario lo DICE en vez de recortarlo en silencio', () => {
    /* Antes se aplicaba Math.min y Joan contestaba 6 a quien pidió 10 sin
       saberlo. El cliente leía eso como que no lo escucharon. */
    const i = CRM.indexOf('previsualizarCuotas()"></div>');
    const t = CRM.slice(i, i + 1400);
    assert.match(t, /Pidió/, 'el formulario no avisa de que el cliente pidió otro plazo');
    assert.match(t, /pedido_plazo/, 'no lee lo que el cliente pidió');
    assert.match(t, /pedido_nota/, 'no lee la nota, donde va el plazo escrito a mano');
    assert.match(t, /un no el mismo día vale más que un silencio/,
      'no se le sugiere a Joan que conteste aunque sea para decir que no');
  });
});

describe('el ojo del CRM, como el de la app', () => {

  test('es un trazo, no un emoji', () => {
    assert.match(CRM, /function ojoSVG/, 'no hay un ojo dibujado');
    const gate = CRM.slice(CRM.indexOf('id="pinInput"') - 400, CRM.indexOf('id="pinInput"') + 700);
    assert.equal(gate.indexOf('👁') >= 0, false, 'la puerta del PIN sigue con el emoji');
  });

  test('alternar no lo destruye', () => {
    /* Hacía btn.textContent = «🙈», que borra el SVG de dentro: el ojo se
       deshacía al primer toque y volvía a ser un emoji. */
    const i = CRM.indexOf('function alternarOjo');
    /* Sin comentarios: el que explica este mismo arreglo cita la línea mala, y
       una prueba que mire la prosa se caza a sí misma. Ya pasó tres veces hoy. */
    const t = CRM.slice(i, i + 900).replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.equal(/btn\.textContent\s*=/.test(t), false,
      'alternarOjo vuelve a escribir el contenido del botón: eso borra el dibujo');
    assert.match(t, /classList\.toggle\('viendo'/,
      'no se alterna por clase, que es lo único que no destruye el SVG');
  });

  test('y el HTML estático no lleva plantillas', () => {
    /* La puerta del PIN es marcado estático: un ${...} ahí se imprime tal cual.
       Es el mismo destrozo que hoy se encontró en la portada pública. */
    const gate = CRM.slice(CRM.indexOf('gate-card'), CRM.indexOf('id="pinErr"'));
    assert.equal(gate.indexOf('${') >= 0, false,
      'se coló una plantilla en el HTML estático de la puerta: se vería impresa');
  });
});
