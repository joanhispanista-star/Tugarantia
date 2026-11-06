'use strict';
/* ==========================================================================
 * ENTRAR DESDE OTRO CELULAR — 6 de noviembre de 2026
 *
 *   node --test pruebas/entrar-desde-otro-celular.test.js
 *
 * Joan, en su iPhone: «Me dice que el PIN está mal». Su decisión es un solo CRM
 * que abra desde cualquier celular, y esa obra va aparte. Esto es lo chico que
 * lo saca del callejón HOY, sin SQL y sin tocar lo de su computador.
 *
 * Corren crm.html (banco-panel.js) y traer.html (banco-traer.js) de verdad, sin
 * navegador. Lo que depende de pintar de verdad (dónde queda un botón, qué tapa a
 * qué, el scroll) se comprobó aparte en Chrome sin ventana, y lo que hace Safari
 * real no lo sabe nadie todavía. Las que dicen «control» pasan antes y después:
 * están para que el arreglo no se lleve por delante lo de siempre. Todas las demás
 * FALLAN con 76af475.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { abrirTraer } = require('./banco-traer.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = LEER('panel/crm.html');

/* Inventados: nada de esto es de nadie. */
const SOCIO = { id: 'C1', numero: 1, nombre: 'Cliente Inventado', cedula: '52000000', telefono: '3000000301', gestiones: [] };
const CREDITO = { id: 'P1', socioId: 'C1', monto: 300000, total: 360000, fecha: '2026-11-01', fechaPago: '2026-11-15', estado: 'activo', gestiones: [] };
const RESPALDADO = { id: 'R1', socioId: 'C1', monto: 100000, gestiones: [] };
const CARTERA = { socios: [SOCIO], prestamos: [CREDITO], config: { pin: '4321', negocio: 'Tu Garantía' } };
const LLAVE = 'joan_socios_v1';

/* ------------------------------------------------------------------ F2 */
describe('F2. La puerta del PIN de un navegador sin fichas tiene salida', () => {
  const FRASE = '¿Eres Joan? Este aparato todavía no tiene tu cartera. Tu PIN vive en tu computador, por eso aquí no sirve.';
  const conAlmacen = A => abrirPanel({ tarjeta: true, almacen: A });
  const aLaVista = P => P.elems.salidaPuerta.style.display !== 'none';
  const dice = P => P.elems.salidaPuertaTexto.textContent;
  const entrarCon = (P, pin) => { P.ctx.document.getElementById('pinInput').value = pin; P.ev('entrar()'); };

  test('en un navegador vacío sale, con su frase y un botón a traer.html', () => {
    const P = conAlmacen({});
    assert.equal(aLaVista(P), true, 'la puerta sigue sin salida');
    assert.equal(dice(P), FRASE);
    assert.match(P.elems['gate-card'].innerHTML, /<a href="traer\.html">Traer mi cartera<\/a>/);
  });

  test('sigue después de un PIN malo, que dice lo de siempre', () => {
    const P = conAlmacen({});
    entrarCon(P, '4821');
    assert.equal(P.elems.pinErr.textContent, 'PIN incorrecto.');
    assert.equal(aLaVista(P), true);
    assert.equal(dice(P), FRASE);
  });

  test('sobrevive a «← Soy Joan»: la tarjeta se repone con innerHTML, y vuelve a decidirse', () => {
    const P = conAlmacen({});
    P.ev('soyDelEquipo()');
    assert.doesNotMatch(P.elems['gate-card'].innerHTML, /salidaPuerta/, 'en la tarjeta del equipo no va');
    /* Lo que el navegador haría al reponer la tarjeta: nace escondida y sin texto. */
    P.elems.salidaPuerta.style.display = 'none'; P.elems.salidaPuertaTexto.textContent = '';
    P.ev('volverAPuertaDeJoan()');
    assert.match(P.elems['gate-card'].innerHTML, /id="salidaPuerta"/);
    assert.equal(aLaVista(P), true, 'desapareció al volver de la puerta del equipo');
    assert.equal(dice(P), FRASE);
  });

  test('«Soy del equipo» sigue en la tarjeta, después de la salida y sin nada que lo tape', () => {
    const P = conAlmacen({});
    const h = P.elems['gate-card'].innerHTML;
    assert.match(h, /<button class="gate-link" onclick="soyDelEquipo\(\)">Soy del equipo \(gerente o asesor\)<\/button>/);
    assert.ok(h.indexOf('id="salidaPuerta"') < h.indexOf('soyDelEquipo()'), 'la salida empujó el enlace del gerente hacia arriba o lo tapó');
  });

  test('con cualquiera de las tres clases de ficha no sale, y la tarjeta nace escondida', () => {
    assert.match(CRM, /<div class="gate-salida" id="salidaPuerta" style="display:none">/);
    [{ socios: [SOCIO] }, { prestamos: [CREDITO] }, { respaldados: [RESPALDADO] }, CARTERA].forEach(d => {
      const P = conAlmacen({ [LLAVE]: JSON.stringify(Object.assign({ config: { pin: '4321' } }, d)) });
      assert.equal(aLaVista(P), false, 'salió con ' + Object.keys(d).join(','));
      assert.equal(P.ev('textoSalidaDeLaPuerta()'), '');
    });
  });

  test('con fichas tampoco sale tras un PIN malo ni tras «← Soy Joan»', () => {
    const P = conAlmacen({ [LLAVE]: JSON.stringify(CARTERA) });
    entrarCon(P, '0000');
    assert.equal(aLaVista(P), false);
    P.ev('soyDelEquipo(); volverAPuertaDeJoan()');
    assert.equal(aLaVista(P), false);
  });

  test('con el candado encima de un CRM con datos no sale, aunque ahí no hubiera nada al abrir', () => {
    const P = conAlmacen({});
    entrarCon(P, '1234');
    P.ev('DB.socios.push(' + JSON.stringify(SOCIO) + ')');
    P.ev("pedirEntrarOtraVez('salir')");
    assert.match(P.elems.pinErr.textContent, /Cerraste la sesión/);
    assert.equal(aLaVista(P), false, 'la puerta encima de un CRM con datos dice que no hay cartera');
  });

  test('con el candado encima de un CRM vacío sí: ese aparato sigue sin cartera', () => {
    const P = conAlmacen({});
    entrarCon(P, '1234');
    P.ev("pedirEntrarOtraVez('salir')");
    assert.equal(aLaVista(P), true);
  });

  test('en modo equipo no sale', () => {
    const P = conAlmacen({});
    P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: { nombre: 'GERENTE PRUEBA', rol: 'gerente', celular: '3000000000' }, equipo: [], gente: [] }));
    assert.equal(P.ev('textoSalidaDeLaPuerta()'), '');
    P.ev('pintarSalidaDeLaPuerta()');
    assert.equal(aLaVista(P), false);
  });

  test('«aquí no sirve» solo se dice si es cierto: con un PIN propio ese sí abre', () => {
    const P = conAlmacen({ [LLAVE]: JSON.stringify({ socios: [], prestamos: [], config: { pin: '4321' } }) });
    assert.equal(aLaVista(P), true);
    assert.equal(dice(P), '¿Eres Joan? Este aparato todavía no tiene tu cartera.');
    entrarCon(P, '4321');
    assert.equal(P.elems.gate.style.display, 'none', 'el PIN de este navegador no abrió');
  });

  test('con la cartera dañada no dice que no hay nada: dice que no se puede leer', () => {
    const roto = '{"socios":[{"id":"C1"';
    const P = conAlmacen({ [LLAVE]: roto });
    assert.equal(aLaVista(P), true);
    assert.match(dice(P), /está dañado y no lo puedo leer/);
    assert.doesNotMatch(dice(P), /todavía no tiene/);
    assert.equal(P.almacen[LLAVE], roto, 'abrir la puerta tocó lo guardado');
  });

  test('«Atrás» desde traer.html: si el cajón cambió recarga, y si no, no', () => {
    let recargas = 0, oyente = null;
    const armar = o => {
      const P = abrirPanel(Object.assign({ tarjeta: true }, o));
      return P;
    };
    /* El banco no tiene window.addEventListener: el oyente se lee del código real. */
    const i = CRM.indexOf("window.addEventListener('pageshow', ev => {");
    assert.ok(i > 0, 'no hay oyente de la vuelta con «Atrás»');
    const cuerpo = CRM.slice(i + "window.addEventListener('pageshow', ".length, CRM.indexOf('\n  });', i)) + '\n  }';
    const A = {};
    const P = armar({ almacen: A });
    P.ctx.location.reload = () => { recargas++; };
    oyente = P.ev('(' + cuerpo.replace(/\r/g, '') + ')');
    oyente({ persisted: false });
    oyente({ persisted: true });
    assert.equal(recargas, 0, 'recargó sin que nada cambiara');
    A[LLAVE] = JSON.stringify(CARTERA);          // traer.html escribió
    oyente({ persisted: false });
    assert.equal(recargas, 0, 'una carga normal no es una vuelta congelada');
    oyente({ persisted: true });
    assert.equal(recargas, 1, 'siguió con la DB de antes de traer');
    /* En un navegador con fichas, nunca: la puerta de Joan se porta como siempre. */
    const Q = armar({ almacen: { [LLAVE]: JSON.stringify(CARTERA) } });
    let otras = 0; Q.ctx.location.reload = () => { otras++; };
    const o2 = Q.ev('(' + cuerpo.replace(/\r/g, '') + ')');
    Q.almacen[LLAVE] = JSON.stringify({ socios: [] });
    o2({ persisted: true });
    assert.equal(otras, 0);
  });
});

/* ------------------------------------------------------------------ F3 */
describe('F3. La puerta de traer.html solo sale si hay algo que tapar', () => {
  const cartera = d => ({ [LLAVE]: JSON.stringify(d) });

  test('un CRM vacío que guardó sus ajustes (PIN de fábrica, sin fichas) ya no pone puerta', () => {
    /* Es lo que dejaba tocar «Guardar ajustes» o, hasta hoy, solo mirar «Ventas». */
    const T = abrirTraer({ almacen: cartera({ socios: [], prestamos: [], respaldados: [], config: { pin: '1234', negocio: 'Tu Garantía' }, plantillas: { a: 'x' } }) });
    assert.equal(T.puerta(), false, 'puerta que solo abre con 1234, sin decirlo');
    assert.equal(T.texto('e1'), 'Solo ajustes', 'no siguió derecho a contar lo que hay');
    assert.equal(T.elems.c2.classList.contains('dormido'), false, 'el paso 2 no despertó');
  });

  test('legible, sin fichas y sin PIN guardado, tampoco', () => {
    const T = abrirTraer({ almacen: cartera({ socios: [], config: { negocio: 'Tu Garantía' } }) });
    assert.equal(T.puerta(), false);
  });

  test('control: un aparato vacío pasa derecho, como siempre', () => {
    const T = abrirTraer();
    assert.equal(T.puerta(), false);
    assert.equal(T.texto('e1'), 'Vacío');
  });

  test('con fichas sigue, aunque el PIN sea el de fábrica', () => {
    [{ socios: [SOCIO] }, { prestamos: [CREDITO] }, { respaldados: [RESPALDADO] }, { papelera: [CREDITO] }, { invitaciones: [{ id: 'I1' }] }]
      .forEach(d => assert.equal(abrirTraer({ almacen: cartera(Object.assign({ config: { pin: '1234' } }, d)) }).puerta(), true, Object.keys(d)[0]));
  });

  test('con un PIN propio sigue, aunque no haya fichas, y abre con ese PIN', () => {
    const T = abrirTraer({ almacen: cartera({ socios: [], config: { pin: '4321' } }) });
    assert.equal(T.puerta(), true);
    T.elems.pin.value = '1234';
    T.tocar('btnPuerta');
    assert.equal(T.puerta(), true, 'abrió con el de fábrica');
    assert.equal(T.elems.pinErr.textContent, 'Ese no es el PIN guardado en este navegador.');
    T.elems.pin.value = '4321';
    T.tocar('btnPuerta');
    assert.equal(T.puerta(), false);
    assert.equal(T.texto('e1'), 'Solo ajustes');
  });

  test('ilegible sigue, y como ahí no hay PIN que leer, dice con cuál abre', () => {
    const roto = '{"socios":[{"id":"C1"';
    const T = abrirTraer({ almacen: { [LLAVE]: roto } });
    assert.equal(T.puerta(), true);
    assert.match(T.elems.porquePuerta.textContent, /está dañado.*el de fábrica: 1234/, 'otro callejón: solo abre con 1234 y no lo dice');
    T.elems.pin.value = '4321';
    T.tocar('btnPuerta');
    assert.match(T.elems.pinErr.textContent, /el de fábrica/);
    T.elems.pin.value = '1234';
    T.tocar('btnPuerta');
    assert.equal(T.puerta(), false);
    assert.equal(T.texto('e1'), 'Ilegible');
    assert.equal(T.almacen[LLAVE], roto, 'abrir la puerta tocó lo guardado');
  });

  test('el texto ya no promete «el mismo PIN del Panel»', () => {
    const T = abrirTraer();
    const t = T.html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(t, /mismo PIN del Panel/);
    assert.doesNotMatch(t, /no es el PIN del Panel/);
    assert.match(t, /id="porquePuerta">Es el PIN guardado en este navegador./);
  });

  test('control: sin acceso al cajón no hay nada que tapar, y se dice', () => {
    const T = abrirTraer({ sinCajon: true });
    assert.equal(T.puerta(), false);
    assert.equal(T.texto('e1'), 'No pude leer');
    assert.equal(T.elems.btnEntrar.disabled, true);
  });

  test('el respaldo del paso 4 no cambió: sin fichas se baja y se anota; con fichas exige que digas que lo tienes', () => {
    const sinFichas = abrirTraer({ almacen: cartera({ socios: [], config: { pin: '1234' } }) });
    sinFichas.tocar('btnRespaldo');
    assert.equal(sinFichas.descargas.length, 1);
    assert.equal(sinFichas.texto('e4'), 'Respaldo bajado');
    const conFichas = abrirTraer({ almacen: cartera({ socios: [SOCIO], config: { pin: '4321' } }) });
    conFichas.elems.pin.value = '4321';
    conFichas.tocar('btnPuerta');
    conFichas.tocar('btnRespaldo');
    assert.equal(conFichas.texto('e4'), 'Compruébalo');
    assert.equal(conFichas.ev('E.respaldoHecho'), false, 'con cartera, bajar no basta: lo tiene que decir Joan');
    conFichas.tocar('btnConfirmoRespaldo');
    assert.equal(conFichas.ev('E.respaldoHecho'), true);
  });
});
