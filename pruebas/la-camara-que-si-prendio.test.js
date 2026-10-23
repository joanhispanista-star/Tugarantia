'use strict';
/* ==========================================================================
 * LA CÁMARA QUE SÍ PRENDIÓ — play/ y panel/crm.html — 22-oct-2026
 *
 *   node --test pruebas/la-camara-que-si-prendio.test.js
 *
 * T4 es la red de seguridad de capturarRostro: si el lienzo no da la foto
 * (Safari sin memoria para un lienzo más, justo el iPhone que se prueba el
 * lunes), lo dice y ofrece la cámara del celular. Para eso esconde el escáner
 * (escanerSinCamara), y motivoSinSelfie leía «escáner escondido» como «la
 * cámara no prendió»: si la persona seguía sin la selfie, el CRM le decía a
 * Joan «La cámara en vivo no prendió en su teléfono», que es falso. Prendió;
 * lo que no salió fue la foto. Ahora se anota el caso general, que sí es
 * cierto: le avisamos que faltaba y siguió sin ella.
 * La primera FALLA con c601179; las de control (las que dicen «sigue») pasan
 * con las dos.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay, RAIZ } = require('./banco-play.js');

const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const textoDelCrm = motivo => { const m = CRM.match(new RegExp('\\b' + motivo + ":'([^']*)'")); return m && m[1]; };

/* play/ con un classList de verdad donde importa (el del banco siempre dice
   que no), y una cámara que prende. */
function play() {
  const P = abrirPlay();
  P.ev("['escaner','btnCapturar','selfieListo','errReg'].forEach(function (id) { var el = $(id), s = {};" +
    ' el.classList = { add: function (c) { s[c] = 1; }, remove: function (c) { delete s[c]; },' +
    '  toggle: function (c, f) { if (f === undefined ? !s[c] : f) s[c] = 1; else delete s[c]; }, contains: function (c) { return !!s[c]; } }; });');
  P.ev("REGISTRO.celular = '3001112233'; FOTOS = { sensibles: true }; guardarFotos();");
  P.ev('navigator.mediaDevices = { getUserMedia: function () { return Promise.resolve({ getTracks: function () { return []; } }); } };');
  P.ev("ESCANER.activo = true; ESCANER.stream = { getTracks: function () { return []; } };");
  P.ev("$('camVideo').videoWidth = 720; $('camVideo').videoHeight = 960;");
  return P;
}
/* El lienzo de la foto no da contexto: Safari sin memoria (el banco ya lo
   hace así, pero se dice para que la prueba no dependa de eso). */
const sinLienzo = P => P.ev('document.createElement = (function (ce) { return function (t) { return t === "canvas" ? { getContext: function () { return null; } } : ce(t); }; })(document.createElement);');

describe('si la foto del escáner no sale, no se anota que la cámara no prendió', () => {

  test('T4 y la persona sigue sin la selfie: «siguió sin ella», y el CRM no dice «no prendió»', () => {
    const P = play();
    assert.equal(P.ev('motivoSinSelfie()'), 'siguio_sin_ella', 'con la cámara prendida el motivo ya era otro: la prueba no mediría nada');
    sinLienzo(P);
    assert.equal(P.ev('capturarRostro()'), false);
    assert.equal(P.ev("$('escaner').classList.contains('oculto')"), true, 'T4 ya no esconde el escáner: la prueba no mediría nada');
    assert.match(P.ev("$('selfieNota').textContent"), /No pude tomar la foto con el escáner/);
    P.ev('anotarSinSelfie()');
    const motivo = P.ev('FOTOS.selfie_omitida && FOTOS.selfie_omitida.motivo');
    assert.notEqual(motivo, 'sin_camara', 'la cámara prendió y se anotó «sin_camara»: el CRM le dice a Joan «' + textoDelCrm('sin_camara') + '»');
    assert.equal(motivo, 'siguio_sin_ella');
    assert.equal(/no prendió/.test(textoDelCrm(motivo) || ''), false);
  });

  test('si después tocó la cámara del celular y la foto no volvió, sigue diciéndose eso (control)', () => {
    const P = play();
    sinLienzo(P);
    P.ev('capturarRostro()');
    P.ev('FOTOS.selfie_camara_sistema = Date.now();');
    P.ev('anotarSinSelfie()');
    assert.equal(P.ev('FOTOS.selfie_omitida.motivo'), 'camara_del_sistema_sin_volver');
  });

  test('cuando la cámara de verdad no prendió, sigue anotándose «sin_camara» (control)', () => {
    const P = play();
    P.ev("ESCANER.activo = false; ESCANER.stream = null; escanerSinCamara('Este navegador no dejó encender la cámara.');");
    P.ev('anotarSinSelfie()');
    assert.equal(P.ev('FOTOS.selfie_omitida.motivo'), 'sin_camara');
  });
});
