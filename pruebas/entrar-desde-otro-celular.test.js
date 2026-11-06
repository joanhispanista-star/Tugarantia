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
    const salida = h.indexOf('id="salidaPuerta"');
    assert.ok(salida >= 0 && salida < h.indexOf('soyDelEquipo()'), 'la salida empujó el enlace del gerente hacia arriba o lo tapó');
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

  /* Lo que un CRM vacío guarda de verdad (se sacó de Chrome: las 16 entradas del menú en
     main y «Guardar ajustes»). Si esto pidiera PIN, a Joan se le volvería a cerrar la
     puerta en el teléfono donde nunca hubo uno. */
  const CRM_VACIO = {
    socios: [], prestamos: [], papelera: [], invitaciones: [], respaldados: [], papeleraSocios: [],
    plantillas: { recordatorio: 'Hola {nombre}' },
    config: { costoBasePct: 20, tasaUsuraEA: 0, pin: '1234', negocio: 'Tu Garantía', whatsapp: '', freno: { activo: false, fraccion_quincena: 0.3 } },
    contadores: { cliente: 0, credito: 0, respaldado: 0 },
    equipo: [], asignaciones: [], prospectos: [], bases: []
  };

  test('un CRM vacío de verdad, con todos sus arreglos vacíos, sigue pasando derecho', () => {
    assert.equal(abrirTraer({ almacen: cartera(CRM_VACIO) }).puerta(), false);
    assert.equal(abrirTraer({ almacen: cartera(Object.assign({}, CRM_VACIO, { gestiones: [], contactos: [], actosComision: [], misNumeros: [], nubeBorrados: [] })) }).puerta(), false);
    assert.equal(abrirTraer({ almacen: { [LLAVE]: '{}' } }).puerta(), false);
  });

  /* Inventados: los estados que F3 dejaba pasar sin PIN, y que el respaldo se lleva crudos. */
  const P = { id: 'P1-0', nombre: 'Prospecta Inventada', celular: '3000000000', estado: 'nuevo' };
  const CON_DATOS = {
    prospectos: { prospectos: [P] },
    gestiones: { gestiones: [{ id: 'g1', persona_id: 'P1-0', tipo: 'contesto', nota: 'dijo que paga el viernes' }] },
    contactos: { contactos: [{ id: 'c1', persona_id: 'P1-0', canal: 'whatsapp', texto: 'hola Prospecta Inventada' }] },
    equipo: { equipo: [{ id: 'E1', nombre: 'Gerente Inventado', celular: '3000000001', rol: 'gerente' }] },
    asignaciones: { asignaciones: [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'E1' }] },
    actosComision: { actosComision: [{ id: 'x', tipo: 'desbloqueo', asesor_id: 'E1' }] },
    bases: { bases: [{ id: 'B1', archivo: 'una-base.xlsx', entraron: 200 }] },
    misNumeros: { misNumeros: [{ numero: '3000000002', desde: '2026-11-01' }] },
    'config con whatsapp': { config: { pin: '1234', negocio: 'Tu Garantía', whatsapp: '3000000003' } },
    'config con telefono': { config: { pin: '1234', negocio: 'Tu Garantía', telefono: '3000000004' } },
    'un campo que nadie conoce': { solicitudesDelFuturo: [{ nombre: 'Prospecta Inventada' }] },
    'clientes con socios vacío': { socios: [], clientes: [{ id: 'S1', nombre: 'Socia Vieja Inventada' }] },
    'socios como objeto': { socios: { a: { id: 'S1', nombre: 'Socia Rara Inventada' } } },
    'un texto suelto': { algoSuelto: 'Prospecta Inventada 3000000000' }
  };

  test('control: con cualquier otro dato en el cajón la puerta sigue, aunque el PIN sea el de fábrica', () => {
    Object.keys(CON_DATOS).forEach(nombre => {
      const T = abrirTraer({ almacen: cartera(Object.assign({}, CRM_VACIO, CON_DATOS[nombre])) });
      assert.equal(T.puerta(), true, nombre + ' pasó derecho, y el respaldo se lo lleva sin PIN');
    });
  });

  test('control: un arreglo arriba del todo tampoco pasa: no se sabe qué es, y se decide del lado de proteger', () => {
    assert.equal(abrirTraer({ almacen: { [LLAVE]: '[{"nombre":"Socia Suelta Inventada"}]' } }).puerta(), true);
  });

  test('esa puerta abre con el PIN de ese navegador, y el 1234 es el suyo si nadie lo cambió', () => {
    const T = abrirTraer({ almacen: cartera(Object.assign({}, CRM_VACIO, { prospectos: [P] })) });
    T.elems.pin.value = '9999';
    T.tocar('btnPuerta');
    assert.equal(T.puerta(), true);
    assert.equal(T.elems.pinErr.textContent, 'Ese no es el PIN guardado en este navegador.');
    T.elems.pin.value = '1234';
    T.tocar('btnPuerta');
    assert.equal(T.puerta(), false);
    assert.equal(T.elems.c2.classList.contains('dormido'), false, 'abrió, pero la página no arrancó');
  });

  test('si otra pestaña escribe en un aparato que entró sin puerta, al volver a contar sale', () => {
    const A = {};
    const T = abrirTraer({ almacen: A });
    assert.equal(T.puerta(), false);
    A[LLAVE] = JSON.stringify(Object.assign({}, CRM_VACIO, { prospectos: [P] }));
    T.ev('recontar()');
    assert.equal(T.puerta(), true, 'el conteo nuevo dejó bajar el respaldo sin PIN');
    T.elems.pin.value = '1234';
    T.tocar('btnPuerta');
    assert.equal(T.puerta(), false);
    /* Abrir no arranca la página otra vez: los botones siguen con un solo oyente. */
    assert.equal(T.elems.btnEntrar._oyentes.click.length, 1);
  });

  test('control: si no apareció nada que tapar, volver a contar no pone puerta', () => {
    const A = {};
    const T = abrirTraer({ almacen: A });
    A[LLAVE] = JSON.stringify(CRM_VACIO);
    T.ev('recontar()');
    assert.equal(T.puerta(), false);
  });

  test('control: quien ya pasó la puerta no la vuelve a ver al contar, como siempre', () => {
    const A = cartera({ socios: [SOCIO], config: { pin: '4321' } });
    const T = abrirTraer({ almacen: A });
    T.elems.pin.value = '4321';
    T.tocar('btnPuerta');
    A[LLAVE] = JSON.stringify({ socios: [SOCIO, Object.assign({}, SOCIO, { id: 'C2' })], config: { pin: '4321' } });
    T.ev('recontar()');
    assert.equal(T.puerta(), false);
    assert.match(T.elems.cuerpo1.innerHTML, /<b>2<\/b> socios/, 'no volvió a contar');
  });

  test('control: un aparato vacío pasa derecho, como siempre', () => {
    const T = abrirTraer();
    assert.equal(T.puerta(), false);
    assert.equal(T.texto('e1'), 'Vacío');
  });

  test('control: con fichas sigue, aunque el PIN sea el de fábrica', () => {
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

  test('control: el respaldo del paso 4 no cambió, sin fichas se baja y se anota; con fichas exige que digas que lo tienes', () => {
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

/* ------------------------------------------------------------------ F4 */
describe('F4. En un aparato nuevo, traer se puede usar desde la primera pantalla', () => {
  const TRAER = LEER('panel/traer.html').replace(/\r\n/g, '\n');
  const VISIBLE = TRAER.slice(TRAER.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*<\/script>/, '');
  const i = (texto, desde) => VISIBLE.indexOf(texto, desde || 0);
  const PLEGADO_ABRE = i('<details id="losDetalles" open>');
  const PLEGADO_CIERRA = i('</details>', PLEGADO_ABRE);

  test('a la vista, una sola frase; y es la frase que es', () => {
    assert.match(VISIBLE, /id="fraseDeArriba">Sirve para mirar: lo que anotes aquí sube a la nube, pero no entra solo a tu computador ni les llega a tus clientes\.</);
    assert.ok(i('fraseDeArriba') > 0 && i('fraseDeArriba') < PLEGADO_ABRE, 'la frase quedó dentro de lo plegado');
    /* La de la cabecera baja al desplegable: arriba no queda otra frase más. */
    const T = abrirTraer();
    assert.equal(T.plegada(), true);
    assert.deepEqual(T.bajoA('paraQueSirve'), ['queHace'], 'la cabecera sigue con otra frase más encima');
  });

  test('control: la frase de arriba no se contradice con lo que hace el código', () => {
    /* «Sube a la nube»: el CRM carga nube-crm.js y ese archivo empuja. Decía que no llegaba. */
    assert.doesNotMatch(VISIBLE, /no llega a tu computador/);
    assert.match(LEER('panel/nube-crm.js'), /\.empujar\(/);
    assert.match(CRM, /<script src="nube-crm\.js\?v=\d+"><\/script>/);
    /* «Ni les llega a tus clientes»: lo que los alcanza exige la clave de sincronización, y
       ningún paso de esta página la trae. Un teléfono nuevo sale de aquí sin ella. */
    assert.match(CRM, /function sbListo\(\)\{ const c=sbCfg\(\); return !!\(c\.url&&c\.anon&&c\.clave\); \}/);
    const T = abrirTraer();
    assert.equal(JSON.parse(T.almacen.joan_socios_sb).clave, '', 'traer dejó una clave de sincronización');
  });

  test('en un aparato nuevo el desplegable queda cerrado', () => {
    assert.ok(PLEGADO_ABRE > 0, 'no hay desplegable');
    assert.equal(abrirTraer().elems.losDetalles.open, false, 'abierto: los avisos vuelven a empujar «Entrar»');
  });

  test('con los mismos textos, los cinco avisos y la frase de la cabecera (es decisión de Joan que estén)', () => {
    const adentro = VISIBLE.slice(PLEGADO_ABRE, PLEGADO_CIERRA).replace(/\s+/g, ' ');
    assert.match(VISIBLE.slice(i('<header'), i('</header>')).replace(/\s+/g, ' '),
      /id="queHace">Baja tu cartera de la nube y la deja donde el CRM de siempre la busca\. Después abres <span class="mono">crm\.html<\/span> y lo ves completo, sin instalar nada\./);
    [
      '<b class="tit">Este camino es para MIRAR</b>',
      'Lo que <b>no hace es bajar</b>: lo que se haga en otro aparato no aparece en',
      '<b class="tit">Y los choques se deciden en otro sitio</b>',
      'El espejo (<span class="mono">espejo.html</span>) sí te muestra las dos y te pregunta.',
      '<b class="tit">La recomendación, entonces</b>',
      '<b>Para cobrar en la calle, el espejo.</b>',
      '<b class="tit">Las fotos no viajan en esta fase</b>',
      'Las fichas se van a ver <b>sin foto</b>.',
      '<b class="tit">El espejo y el CRM son dos copias distintas en este mismo teléfono</b>',
      'Traer acá <b>no toca</b> lo que tenga el espejo'
    ].forEach(t => assert.ok(adentro.includes(t), 'se perdió: ' + t));
    assert.match(VISIBLE.slice(PLEGADO_ABRE, PLEGADO_CIERRA), /<summary id="cabAvisos" tabindex="-1"><div class="card-cab"><h3>Antes de nada: para qué sirve esto y para qué no<\/h3><\/div><\/summary>/);
  });

  test('control: siguen antes de los botones, y «Tu correo», «Tu contraseña» y «Entrar» van en ese orden', () => {
    const entrar = i('id="btnEntrar"'), correo = i('for="sbCorreo"'), clave = i('for="sbClave"');
    assert.ok(PLEGADO_CIERRA < i('id="c1"') && PLEGADO_CIERRA < correo, 'los avisos ya no van antes de los botones');
    assert.ok(correo < clave && clave < entrar);
  });

  test('entre la contraseña y «Entrar» no queda nada que lo empuje: la ayuda baja, y debajo del botón sigue', () => {
    assert.ok(abrirTraer().bajoA('abajoDeEntrar').includes('ayudaClave'), 'lo que no le pide nada sigue empujando «Entrar»');
    assert.ok(i('id="abajoDeEntrar"') > i('id="btnEntrar"'));
    assert.match(VISIBLE, /id="ayudaClave">No se guarda en este teléfono\. Se cambia por una sesión/);
  });

  test('el paso 1 se pliega solo en un aparato vacío; con cualquier otra cosa, abierto', () => {
    assert.equal(abrirTraer().elems.c1.open, false, 'vacío: seis líneas de más encima de «Entrar»');
    assert.equal(abrirTraer().texto('e1'), 'Vacío', 'plegado, la pastilla es lo único que se ve: tiene que decirlo');
    assert.match(abrirTraer().elems.cuerpo1.innerHTML, /Este aparato está vacío/, 'plegado no quiere decir borrado');
    const con = d => abrirTraer({ almacen: { [LLAVE]: typeof d === 'string' ? d : JSON.stringify(d) } });
    assert.equal(con({ socios: [], config: { pin: '1234' } }).elems.c1.open, true, 'solo ajustes');
    const ilegible = con('{"socios":[');
    ilegible.elems.pin.value = '1234';
    ilegible.tocar('btnPuerta');
    assert.equal(ilegible.elems.c1.open, true, 'ilegible');
    assert.match(ilegible.elems.cuerpo1.innerHTML, /Hay algo guardado y no lo entiendo/);
    const fichas = con({ socios: [SOCIO], config: { pin: '1234' } });
    fichas.elems.pin.value = '1234';
    fichas.tocar('btnPuerta');
    assert.equal(fichas.elems.c1.open, true, 'el bloque rojo se escondió');
    assert.match(fichas.elems.cuerpo1.innerHTML, /En este aparato ya hay una cartera/);
    assert.equal(abrirTraer({ sinCajon: true }).elems.c1.open, true, 'sin acceso al cajón');
  });
});

/* --------------------------------------------------------- la regla 8 */
describe('Con algo que perder, traer.html es la de siempre: lo único que cambia es el texto de la puerta', () => {
  /* El píxel a píxel contra 76af475, a 1280x800 y a 390x844, se corre en Chrome sin ventana
     fuera de este archivo: el banco no pinta. Lo que esta prueba amarra es lo que lo hace
     posible, y que nada de esto dependa del ancho: vale igual a 1280 que a 390. */
  const TRAER = LEER('panel/traer.html').replace(/\r\n/g, '\n');
  const HOJA = TRAER.slice(TRAER.indexOf('<style>'), TRAER.indexOf('</style>'));
  const VISIBLE = TRAER.slice(TRAER.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*<\/script>/, '');
  const con = d => abrirTraer({ almacen: { [LLAVE]: typeof d === 'string' ? d : JSON.stringify(d) } });
  const pasar = (T, pin) => { T.elems.pin.value = pin; T.tocar('btnPuerta'); return T; };
  const siempre = (T, que) => {
    assert.equal(T.plegada(), false, que + ': se plegó');
    assert.equal(T.elems.losDetalles.open, true, que + ': los avisos quedaron plegados');
    assert.equal(T.elems.c1.open, true, que + ': el paso 1 quedó plegado');
    assert.deepEqual(T.bajoA('paraQueSirve'), [], que + ': la frase de la cabecera se fue de la cabecera');
    assert.ok(!T.bajoA('abajoDeEntrar').includes('ayudaClave'), que + ': la ayuda se movió de encima de «Entrar»');
  };

  test('con cartera en el computador, con su clave y su PIN', () => {
    const A = { [LLAVE]: JSON.stringify(CARTERA), joan_socios_sb: JSON.stringify({ url: 'https://inventado.supabase.co', anon: 'llave-inventada', clave: 'clave-inventada' }) };
    siempre(pasar(abrirTraer({ almacen: A }), '4321'), 'computador');
  });

  test('con fichas en un teléfono, con el PIN de fábrica o con otro', () => {
    siempre(pasar(con({ socios: [SOCIO], config: { pin: '1234' } }), '1234'), 'fichas y PIN de fábrica');
    siempre(pasar(con(CARTERA), '4321'), 'fichas y PIN propio');
  });

  test('con algo ilegible, con otros datos, o con un PIN propio', () => {
    siempre(pasar(con('{"socios":['), '1234'), 'ilegible');
    siempre(pasar(con({ socios: [], prospectos: [{ id: 'P1', celular: '3000000000' }], config: { pin: '1234' } }), '1234'), 'prospectos');
    siempre(pasar(con({ socios: [], config: { pin: '4321' } }), '4321'), 'PIN propio');
  });

  test('con la clave de sincronización, aunque no haya cartera: la frase de arriba ahí sería falsa', () => {
    const T = abrirTraer({ almacen: { joan_socios_sb: JSON.stringify({ url: 'https://inventado.supabase.co', anon: 'llave-inventada', clave: 'clave-inventada' }) } });
    assert.equal(T.puerta(), false);
    siempre(T, 'con clave y sin cartera');
  });

  test('sin poder leer el cajón no se sabe, y ante la duda como siempre', () => {
    siempre(abrirTraer({ sinCajon: true }), 'sin cajón');
  });

  test('solo en un aparato nuevo se pliega, vacío o con ajustes de fábrica', () => {
    const vacio = abrirTraer();
    assert.equal(vacio.plegada(), true);
    assert.equal(vacio.elems.c1.open, false);
    const ajustes = con({ socios: [], config: { pin: '1234', negocio: 'Tu Garantía' } });
    assert.equal(ajustes.plegada(), true);
    assert.equal(ajustes.elems.losDetalles.open, false);
    assert.equal(ajustes.elems.c1.open, true, 'hay algo guardado: el paso 1 lo dice abierto');
  });

  test('el HTML, tal cual viene, es la cara de siempre: si algo falla antes de arrancar se ve como hoy', () => {
    assert.match(VISIBLE, /<details id="losDetalles" open>/);
    assert.match(VISIBLE, /<details class="card" id="c1" open>/);
    assert.match(VISIBLE.slice(VISIBLE.indexOf('<header'), VISIBLE.indexOf('</header>')), /class="sub" id="queHace"/);
    assert.match(VISIBLE, /class="aviso ambar solo-aparato-nuevo" id="fraseDeArriba"/);
    assert.match(HOJA, /\n\.solo-aparato-nuevo\{display:none\}/);
    assert.ok(VISIBLE.indexOf('id="ayudaClave"') < VISIBLE.indexOf('id="btnEntrar"'), 'la ayuda no va antes de «Entrar», como siempre');
    assert.ok(VISIBLE.indexOf('id="notaConexion"') < VISIBLE.indexOf('id="msg2"') && VISIBLE.indexOf('id="msg2"') < VISIBLE.indexOf('id="camposConexion"'));
  });

  test('todo lo que acorta la página cuelga de .aparato-nuevo, y no depende del ancho', () => {
    for (const m of HOJA.matchAll(/^[^\n{]*(#cabAvisos|#cabPaso1|\.card-antes|#paraQueSirve)[^\n{]*\{/gm)) {
      assert.match(m[0], /^\.aparato-nuevo /, 'esto no cuelga de la clase: ' + m[0]);
    }
    /* Sin marca ni dedo en la cara de siempre: en Safari el triángulo se quita con esto. */
    assert.match(HOJA, /details>summary\{display:block;list-style:none;cursor:auto\}/);
    assert.match(HOJA, /details>summary::-webkit-details-marker\{display:none\}/);
    assert.doesNotMatch(TRAER, /matchMedia|innerWidth/);
    assert.doesNotMatch(HOJA, /@media[^{]*width/);
  });

  test('en la cara de siempre un toque no pliega nada, y los dos encabezados no piden el tabulador', () => {
    const T = pasar(con(CARTERA), '4321');
    let frenados = 0;
    ['cabAvisos', 'cabPaso1'].forEach(id => {
      T.elems[id]._oyentes.click.forEach(f => f({ preventDefault() { frenados++; } }));
      assert.equal(T.elems[id].tabIndex, -1);
    });
    assert.equal(frenados, 2, 'un toque sin querer escondería el bloque rojo');
  });

  test('en un aparato nuevo sí se pliegan, y sí se llega con el tabulador', () => {
    const T = abrirTraer();
    let frenados = 0;
    ['cabAvisos', 'cabPaso1'].forEach(id => {
      T.elems[id]._oyentes.click.forEach(f => f({ preventDefault() { frenados++; } }));
      assert.equal(T.elems[id].tabIndex, 0);
    });
    assert.equal(frenados, 0);
  });

  test('volver a contar no le pliega la página a quien ya la tenía a la vista', () => {
    const A = { [LLAVE]: JSON.stringify(CARTERA) };
    const T = pasar(abrirTraer({ almacen: A }), '4321');
    delete A[LLAVE];
    T.ev('recontar()');
    siempre(T, 'otra pestaña la vació');
  });

  test('si en un aparato nuevo aparece algo que perder, al volver a contar se ve como siempre', () => {
    const A = {};
    const T = abrirTraer({ almacen: A });
    assert.equal(T.plegada(), true);
    A[LLAVE] = JSON.stringify(CARTERA);
    T.ev('recontar()');
    assert.equal(T.plegada(), false);
    assert.equal(T.elems.losDetalles.open, true);
    assert.equal(T.elems.c1.open, true);
  });

  describe('el paso 2 de la cara de siempre', () => {
    const PC = () => ({ [LLAVE]: JSON.stringify(CARTERA), joan_socios_sb: JSON.stringify({ url: 'https://inventado.supabase.co', anon: 'llave-inventada', clave: 'clave-inventada' }) });
    const NOTA = /^<div class="aviso info">La conexión ya estaba guardada en este teléfono \(<span class="mono">https:\/\/inventado\.supabase\.co<\/span>\)\. <button class="btn sec sm" type="button" id="btnVerCampos">Cambiarla<\/button><\/div>$/;
    const SESION = JSON.stringify({ access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', correo: 'duena@prueba.test', expira_en: Date.now() + 3600000 });
    const SALE_BIEN = () => ({ status: 200, cuerpo: { access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', expires_in: 3600, user: { id: 'u1', email: 'duena@prueba.test' } } });

    test('la conexión guardada se dice arriba, con el texto y el botón de siempre', () => {
      const T = pasar(abrirTraer({ almacen: PC() }), '4321');
      assert.match(T.elems.notaConexion.innerHTML, NOTA);
      assert.equal(T.texto('msg2'), '');
      assert.deepEqual(T.bajoA('abajoDeEntrar'), [], 'se fue de arriba');
    });

    test('«Cambiarla» abre los campos y se queda, como siempre', () => {
      const T = pasar(abrirTraer({ almacen: PC() }), '4321');
      assert.equal(T.elems.camposConexion.classList.contains('oculto'), true);
      T.tocar('btnVerCampos');
      assert.equal(T.elems.camposConexion.classList.contains('oculto'), false);
      assert.match(T.elems.notaConexion.innerHTML, NOTA, 'la nota se fue');
    });

    test('con una sesión guardada dice lo mismo que siempre: la nota y no «Ya había una sesión»', () => {
      const A = PC(); A.joan_panel_sesion = SESION;
      const T = pasar(abrirTraer({ almacen: A }), '4321');
      assert.match(T.elems.notaConexion.innerHTML, NOTA);
      assert.equal(T.texto('msg2'), '');
      assert.equal(T.texto('e2'), 'Conectado');
    });

    test('al entrar se va, como siempre; con un error ya no, y es lo que pidió F10', async () => {
      const bien = pasar(abrirTraer({ almacen: PC(), red: SALE_BIEN }), '4321');
      bien.elems.sbCorreo.value = 'duena@prueba.test'; bien.elems.sbClave.value = 'una-clave-inventada';
      bien.tocar('btnEntrar');
      await asentar();
      assert.equal(bien.elems.notaConexion.innerHTML, '');
      assert.match(bien.texto('msg2'), /^Entraste/);
      const mal = pasar(abrirTraer({ almacen: PC(), red: () => ({ status: 401, cuerpo: { message: 'Invalid API key' } }) }), '4321');
      mal.elems.sbCorreo.value = 'duena@prueba.test'; mal.elems.sbClave.value = 'una-clave-inventada';
      mal.tocar('btnEntrar');
      await asentar();
      assert.equal(mal.texto('e2'), 'No entró');
      assert.match(mal.elems.notaConexion.innerHTML, NOTA);
    });

    test('al cerrar sesión se va, como siempre', async () => {
      const A = PC(); A.joan_panel_sesion = SESION;
      const T = pasar(abrirTraer({ almacen: A, red: () => ({ status: 204 }) }), '4321');
      T.tocar('btnSalir');
      await asentar();
      assert.equal(T.elems.notaConexion.innerHTML, '');
      assert.match(T.texto('msg2'), /Sesión cerrada/);
    });

    test('con cartera y sin conexión guardada, también como siempre: lo que manda ahí es que nada cambie', () => {
      const T = pasar(con(CARTERA), '4321');
      assert.match(T.elems.notaConexion.innerHTML, /^<div class="aviso info">La conexión ya estaba guardada en este teléfono/);
      assert.equal(T.elems.btnVerCampos.textContent, 'Cambiarla');
      assert.deepEqual(T.bajoA('abajoDeEntrar'), []);
    });
  });

  test('el texto de la puerta sí cambió: es lo único', () => {
    assert.match(VISIBLE, /id="porquePuerta">Es el PIN guardado en este navegador\. Se pide porque aquí ya hay algo guardado:/);
  });
});

/* ------------------------------------------------------------------ F5 */
describe('F5. La clave mala no manda a crear otro usuario', () => {
  const TEXTO = 'Es la contraseña de la nube, no tu PIN. Si no la recuerdas, no crees otro usuario: no tendría tu cartera. Se cambia desde Supabase, con tu cuenta.';
  const entrarCon = async red => {
    const T = abrirTraer({ red });
    T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada';
    T.tocar('btnEntrar');
    await asentar();
    return T;
  };

  test('con la contraseña mala, en los dos formatos en que contesta Supabase, dice lo que es', async () => {
    for (const cuerpo of [{ error: 'invalid_grant', error_description: 'Invalid login credentials' },
                          { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }]) {
      const T = await entrarCon(() => ({ status: 400, cuerpo }));
      assert.equal(T.texto('e2'), 'No entró');
      const m = T.texto('msg2');
      assert.ok(m.includes('El correo o la contraseña no coinciden.'), m);
      assert.ok(m.includes(TEXTO), 'no explicó qué contraseña es: ' + m);
      assert.equal(T.elems.sbClave.value, 'una-clave-inventada', 'se tiene que poder corregir sin escribirla toda');
    }
  });

  test('«Add user» se fue: un usuario nuevo no está en la lista de dueños', () => {
    const t = LEER('panel/traer.html').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(t, /Add user/);
    assert.doesNotMatch(t, /el usuario se crea en Supabase/);
  });

  test('con un 429, un 500 o sin señal no le echa la culpa a la contraseña', async () => {
    for (const red of [() => ({ status: 429, cuerpo: { code: 429, msg: 'Request rate limit reached' } }),
                       () => ({ status: 500, cuerpo: { code: 500, msg: 'Database error querying schema' } }),
                       () => { throw new TypeError('Load failed'); }]) {
      const T = await entrarCon(red);
      assert.equal(T.texto('e2'), 'No entró');
      assert.doesNotMatch(T.texto('msg2'), /no tu PIN|Add user/, T.texto('msg2'));
    }
  });

  test('la frase que compara es la que escribe nube.js: si cambia allá, esto avisa', () => {
    assert.match(LEER('panel/nube.js'), /return 'El correo o la contraseña no coinciden\.';/);
    assert.match(LEER('panel/traer.html'), /var CLAVE_QUE_NO_COINCIDE = 'El correo o la contraseña no coinciden\.';/);
  });
});

/* --------------------------------------------------------- sin señal */
describe('Sin señal, traer.html dice lo que pasó: no se guardó nada y nada va a reintentar', () => {
  const FRASE = 'Sin señal: no pude hablar con la nube. No se guardó nada; inténtalo otra vez con señal.';
  const VIEJA = /queda guardado|sube solo cuando vuelva/;
  const SIN_RED = () => { throw new TypeError('Load failed'); };
  const conClave = T => { T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada'; T.tocar('btnEntrar'); };
  const SESION = JSON.stringify({ access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', correo: 'duena@prueba.test', expira_en: Date.now() + 3600000 });

  test('«Entrar» con fetch rechazado', async () => {
    const T = abrirTraer({ red: SIN_RED });
    conClave(T);
    await asentar();
    assert.equal(T.texto('e2'), 'No entró');
    assert.ok(T.texto('msg2').includes(FRASE), T.texto('msg2'));
    assert.doesNotMatch(T.texto('msg2'), VIEJA);
    assert.doesNotMatch(T.texto('msg2'), /no tu PIN/, 'le echó la culpa a la contraseña');
    assert.equal(T.almacen.joan_panel_sesion, undefined, 'tampoco es que se haya guardado');
    assert.equal(T.elems.btnEntrar.disabled, false, 'no deja intentarlo otra vez');
  });

  test('«Entrar» con el navegador diciendo que no hay red', async () => {
    const T = abrirTraer({ red: SIN_RED });
    T.ctx.navigator.onLine = false;
    conClave(T);
    await asentar();
    assert.ok(T.texto('msg2').includes(FRASE), T.texto('msg2'));
    assert.equal(T.llamadas.length, 0, 'con onLine false ni siquiera se intenta');
  });

  test('«Mirar» con fetch rechazado: la misma frase, y sigue diciendo que no tocó nada', async () => {
    const T = abrirTraer({ almacen: { joan_panel_sesion: SESION }, red: SIN_RED });
    T.tocar('btnMirar');
    await asentar();
    assert.equal(T.texto('e3'), 'No pude mirar');
    const m = T.texto('msg3');
    assert.ok(m.includes(FRASE), m);
    assert.doesNotMatch(m, VIEJA);
    assert.match(m, /No se tocó nada de este aparato\./);
  });

  test('con otro error dice lo que dijo la nube, y con la contraseña mala lo de siempre', async () => {
    const T = abrirTraer({ red: () => ({ status: 429, cuerpo: { code: 429, msg: 'Request rate limit reached' } }) });
    conClave(T);
    await asentar();
    assert.match(T.texto('msg2'), /Supabase respondió 429/);
    assert.ok(!T.texto('msg2').includes(FRASE));
    const M = abrirTraer({ red: () => ({ status: 400, cuerpo: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }) });
    conClave(M);
    await asentar();
    assert.match(M.texto('msg2'), /El correo o la contraseña no coinciden\. Es la contraseña de la nube, no tu PIN\./);
    assert.ok(!M.texto('msg2').includes(FRASE));
  });

  test('control: nube.js no se tocó: la frase de allá les sirve a las pantallas que sí guardan y reintentan', () => {
    assert.match(LEER('panel/nube.js'), /var SIN_RED = 'Sin internet\. Lo que hiciste queda guardado y sube solo cuando vuelva\.';/);
    assert.match(LEER('panel/nube.js'), /throw fallo\(SIN_RED, \{ sin_red: true \}\);/);
  });
});

/* ------------------------------------------------------------------ F6 */
describe('F6. El PIN que viaja es el de la última subida de ajustes, con su fecha', () => {
  const FRASE = 'Con ellos viaja el PIN que tenías cuando se subieron por última vez, el 18 de agosto de 2026 . Si lo cambiaste después, en este aparato sirve el de esa fecha.';
  const FILA = (id, datos) => ({ id, datos, borrado: false, actualizado_en: '2026-11-05T15:00:00Z', actualizado_por: 'crm' });
  const paquete = ajustes => ({ completo: true, servidor_ahora: '2026-11-06T15:00:00Z', contadores: { cliente: 1, credito: 1, respaldado: 0 },
    socios: [FILA('C1', SOCIO)], creditos: [FILA('P1', CREDITO)], respaldados: [], ajustes });
  const CONFIG = { clave: 'config', datos: { pin: '4321', negocio: 'Tu Garantía' }, actualizado_en: '2026-08-18T20:15:00Z', actualizado_por: 'subir' };
  const nube = paq => url => /grant_type=password/.test(url)
    ? { status: 200, cuerpo: { access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', expires_in: 3600, user: { id: 'u1', email: 'duena@prueba.test' } } }
    : /rpc\/panel_traer/.test(url) ? { status: 200, cuerpo: paq } : { status: 404, cuerpo: {} };
  const hastaMirar = async paq => {
    const T = abrirTraer({ red: nube(paq) });
    T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada';
    T.tocar('btnEntrar');
    await asentar();
    T.tocar('btnMirar');
    await asentar();
    return T;
  };
  const hastaTraer = async paq => {
    const T = await hastaMirar(paq);
    T.tocar('btnRespaldo');
    T.tocar('btnTraer');
    await asentar();
    return T;
  };

  test('paso 3: dice de qué fecha es el PIN, con la de la fila config y no la del último cambio', async () => {
    const T = await hastaMirar(paquete([CONFIG, { clave: 'plantillas', datos: { a: 'x' }, actualizado_en: '2026-11-01T15:00:00Z' }]));
    assert.ok(T.texto('resumen3').includes(FRASE), T.texto('resumen3'));
    assert.equal(T.ev('E.lectura.fechaConfig'), '2026-08-18T20:15:00Z');
    assert.ok(!T.texto('resumen3').includes('4321'), 'la pantalla pintó el PIN');
  });

  test('paso 6: lo mismo, y después de traer el PIN que quedó guardado es ese', async () => {
    const T = await hastaTraer(paquete([CONFIG]));
    const m = T.texto('msg6');
    assert.ok(m.includes(FRASE), m);
    assert.equal(JSON.parse(T.almacen[LLAVE]).config.pin, '4321');
  });

  test('«el mismo PIN del computador» se fue de los dos sitios', () => {
    const t = LEER('panel/traer.html').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(t, /mismo PIN del\s+'?\+?\s*'?computador/);
    assert.doesNotMatch(t, /PIN del computador/);
  });

  test('sin fecha en la fila no se inventa ninguna, y lo dice', async () => {
    const T = await hastaMirar(paquete([{ clave: 'config', datos: { pin: '4321' } }]));
    assert.match(T.texto('resumen3'), /la nube no dice cuándo fue/);
    assert.doesNotMatch(T.texto('resumen3'), /Invalid|NaN|undefined/);
  });

  test('una fila config sin PIN no promete uno: el CRM va a arrancar con el de fábrica', async () => {
    const T = await hastaTraer(paquete([{ clave: 'config', datos: { negocio: 'Tu Garantía' }, actualizado_en: '2026-08-18T20:15:00Z' }]));
    assert.match(T.texto('resumen3'), /Los ajustes sí vienen, pero sin PIN/);
    assert.match(T.texto('msg6'), /PIN de fábrica \(1234\).*los ajustes vinieron sin PIN/);
    assert.doesNotMatch(T.texto('msg6'), /te va a pedir un PIN/);
  });

  describe('si no recuerda ese PIN, se dice antes de traer', () => {
    const AVISO = 'Si no recuerdas ese PIN, no traigas todavía: en el computador abre ☁ Subir (Ajustes → Avanzado, o subir.html ) y sube tus ajustes, así viaja el de hoy. Después de traer, este aparato solo abre con ese PIN.';

    test('en el paso 3 y encima del botón del paso 5, sin pintar el PIN', async () => {
      const T = await hastaMirar(paquete([CONFIG]));
      assert.ok(T.texto('resumen3').includes(AVISO), T.texto('resumen3'));
      assert.ok(T.texto('avisoPinAntesDeTraer').includes(AVISO), T.texto('avisoPinAntesDeTraer'));
      assert.ok(!T.texto('avisoPinAntesDeTraer').includes('4321'), 'la pantalla pintó el PIN');
      const h = LEER('panel/traer.html');
      const c5 = h.indexOf('id="c5"');
      assert.ok(c5 < h.indexOf('id="avisoPinAntesDeTraer"') && h.indexOf('id="avisoPinAntesDeTraer"') < h.indexOf('id="btnTraer"'), 'no va encima del botón');
    });

    test('no queda pegado al aviso de arriba: es el primer hijo de su cajón, y ahí el margen se va', () => {
      assert.match(LEER('panel/traer.html'), /\.aviso:first-child\{margin-top:0\}/);
      assert.match(LEER('panel/traer.html'), /#avisoPinPaso3 \.aviso,#avisoPinAntesDeTraer \.aviso\{margin-top:var\(--e3\)\}/);
    });

    test('control: subir.html y el botón que nombra existen: si cambian, esto avisa', () => {
      assert.match(CRM, /<a class="btn btn-ghost btn-sm" href="subir\.html" target="_blank" rel="noopener">☁ Subir<\/a>/);
      assert.match(LEER('panel/subir.html'), /Sube tu configuración del negocio, y ahí adentro está el <b>PIN del Panel<\/b>/);
    });

    test('al traer se va: ya no le sirve a nadie, y el paso 6 sigue diciendo de qué fecha es', async () => {
      const T = await hastaTraer(paquete([CONFIG]));
      assert.equal(T.texto('e5'), 'Traído');
      assert.equal(T.texto('avisoPinAntesDeTraer'), '');
      assert.equal(T.texto('avisoPinPaso3'), '');
      assert.ok(T.texto('msg6').includes(FRASE), T.texto('msg6'));
    });

    test('sin PIN en el paquete no avisa de nada: ahí arranca con el de fábrica', async () => {
      for (const ajustes of [[], [{ clave: 'config', datos: { negocio: 'Tu Garantía' }, actualizado_en: '2026-08-18T20:15:00Z' }]]) {
        const T = await hastaMirar(paquete(ajustes));
        assert.ok(!T.texto('resumen3').includes('no traigas todavía'), T.texto('resumen3'));
        assert.equal(T.texto('avisoPinAntesDeTraer'), '');
      }
    });

    test('si la página se niega a escribir, encima del botón no sobra el aviso', async () => {
      const parcial = Object.assign(paquete([CONFIG]), { completo: false });
      const T = await hastaMirar(parcial);
      assert.match(T.texto('resumen3'), /Esto no se puede traer/);
      assert.equal(T.texto('avisoPinAntesDeTraer'), '');
    });
  });

  describe('después de traer, los pasos 1 y 4 dicen lo que quedó', () => {
    test('en un aparato vacío ya no sigue diciendo «Vacío»', async () => {
      const T = await hastaTraer(paquete([CONFIG]));
      assert.ok(T.almacen[LLAVE], 'no escribió');
      assert.equal(T.texto('e1'), 'Traído');
      assert.equal(T.texto('cuerpo1'), 'Ya quedó traído Este aparato ya tiene lo que bajó de la nube: 1 socio, 1 crédito y 0 respaldados.');
      assert.equal(T.texto('avisoRespaldo'), 'Ese respaldo es de antes de traer El archivo que ya bajaste guarda lo que había aquí antes de traer. Si lo bajas otra vez, sale lo que hay ahora.');
    });

    test('control: es cierto lo que dice del paso 4: bajarlo otra vez saca lo que hay ahora', async () => {
      const T = await hastaTraer(paquete([CONFIG]));
      assert.equal(T.descargas.length, 1);
      T.tocar('btnRespaldo');
      assert.equal(T.descargas.length, 2);
      assert.equal(T.ev('E.hay.crudo'), T.almacen[LLAVE], 'el respaldo no sale de lo que quedó');
    });

    test('sobre una cartera que ya había, el bloque rojo se va: ya se reemplazó', async () => {
      const A = { [LLAVE]: JSON.stringify(CARTERA) };
      const T = abrirTraer({ almacen: A, red: nube(paquete([CONFIG])) });
      T.elems.pin.value = '4321';
      T.tocar('btnPuerta');
      assert.match(T.elems.cuerpo1.innerHTML, /Se va a reemplazar/);
      T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada';
      T.tocar('btnEntrar');
      await asentar();
      T.tocar('btnMirar');
      await asentar();
      T.tocar('btnRespaldo');
      T.tocar('btnConfirmoRespaldo');
      T.tocar('btnTraer');
      await asentar();
      assert.equal(T.texto('e1'), 'Traído');
      assert.doesNotMatch(T.elems.cuerpo1.innerHTML, /Se va a reemplazar|class="peligro"/);
    });

    test('control: si dijo que no, o si no cupo, siguen diciendo lo de antes: no se escribió nada', async () => {
      const no = abrirTraer({ red: nube(paquete([CONFIG])), confirmar: false });
      no.elems.sbCorreo.value = 'duena@prueba.test'; no.elems.sbClave.value = 'una-clave-inventada';
      no.tocar('btnEntrar');
      await asentar();
      no.tocar('btnMirar');
      await asentar();
      no.tocar('btnRespaldo');
      no.tocar('btnTraer');
      await asentar();
      assert.equal(no.almacen[LLAVE], undefined);
      assert.equal(no.texto('e1'), 'Vacío');
      assert.match(no.elems.cuerpo1.innerHTML, /Este aparato está vacío/);

      const lleno = await hastaMirar(paquete([CONFIG]));
      lleno.tocar('btnRespaldo');
      lleno.ctx.localStorage.setItem = () => { throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); };
      lleno.tocar('btnTraer');
      await asentar();
      assert.equal(lleno.texto('e5'), 'No cupo');
      assert.equal(lleno.texto('e1'), 'Vacío');
      assert.match(lleno.elems.avisoRespaldo.innerHTML, /Este aparato está vacío, y se baja igual/);
    });
  });

  test('control: sin la fila config, como siempre', async () => {
    const T = await hastaTraer(paquete([]));
    assert.match(T.texto('resumen3'), /Los ajustes no vienen/);
    assert.match(T.texto('msg6'), /PIN de fábrica \(1234\).*los ajustes no vinieron/);
  });
});

/* ------------------------------------------------------------------ F7 */
describe('F7. Mirar el CRM no crea una cartera', () => {
  const ENTRADAS = [...CRM.matchAll(/<button class="navbtn[^"]*" data-v="([a-z]+)">/g)].map(m => m[1]);

  test('control: el menú sigue teniendo sus 16 entradas', () => {
    assert.equal(ENTRADAS.length, 16, ENTRADAS.join(','));
    assert.ok(ENTRADAS.includes('ventas'));
  });

  test('en un navegador vacío, tocar «Ventas» ya no escribe nada', () => {
    const P = abrirPanel();
    P.ev('irA("ventas")');
    assert.equal(P.almacen[LLAVE], undefined, 'con solo mirar nació la llave de la cartera');
  });

  test('ninguna de las 16 entradas del menú la crea', () => {
    const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
    ENTRADAS.forEach(v => {
      P.ev('irA(' + JSON.stringify(v) + ')');
      assert.equal(P.almacen[LLAVE], undefined, '«' + v + '» creó la cartera');
    });
  });

  test('con una cartera dañada, tocar todo el menú no la pisa', () => {
    const roto = '{"socios":[{"id":"C1","nombre":"Cliente Inventado"';
    const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')), almacen: { [LLAVE]: roto } });
    ENTRADAS.forEach(v => {
      P.ev('irA(' + JSON.stringify(v) + ')');
      assert.equal(P.almacen[LLAVE], roto, '«' + v + '» pisó lo que traer.html habría respaldado');
    });
  });

  test('control: con datos, Ventas guarda como siempre, lo que el embudo movió no se pierde', () => {
    const conSocio = {
      socios: [SOCIO], prestamos: [CREDITO], config: { pin: '4321' },
      prospectos: [{ id: 'p1', nombre: 'Prospecto Inventado', celular: '3000000301', estado: 'nuevo' }]
    };
    const P = abrirPanel({ almacen: { [LLAVE]: JSON.stringify(conSocio) } });
    P.ev('irA("ventas")');
    assert.equal(JSON.parse(P.almacen[LLAVE]).prospectos[0].estado, 'cliente', 'el embudo movió el estado y no se guardó');
    /* Cada una de las cuatro basta sola. */
    [{ socios: [SOCIO] }, { prestamos: [CREDITO] }, { respaldados: [RESPALDADO] }, { prospectos: [{ id: 'p1', celular: '3000000301' }] }].forEach(d => {
      const Q = abrirPanel({ almacen: { [LLAVE]: JSON.stringify(Object.assign({ config: { pin: '4321', marca: 'x' } }, d)) } });
      const antes = Q.almacen[LLAVE];
      Q.ev('irA("ventas")');
      assert.notEqual(Q.almacen[LLAVE], antes, 'con ' + Object.keys(d)[0] + ' dejó de guardar');
    });
  });
});

/* ------------------------------------------------------------------ F8 */
describe('F8. En el celular, tocar el menú lleva al contenido', () => {
  /* El banco no pinta: se le dan la medida de la pantalla, el <main> con su posición y un
     scrollTo que anota. Dónde queda de verdad se midió en Chrome sin ventana. */
  function montar(ancho, topeDelMain, o) {
    const P = abrirPanel(o || {});
    const mov = [];
    P.ctx.matchMedia = q => ({ matches: q === '(max-width:880px)' && ancho <= 880 });
    P.ctx.scrollTo = (x, y) => { mov.push([x, y]); };
    P.ctx.pageYOffset = 100;
    P.ctx.document.querySelector = s => (s === '.main' ? { innerHTML: '', getBoundingClientRect: () => ({ top: topeDelMain }) } : null);
    return { P, mov };
  }
  const boton = attrs => {
    const b = { dataset: attrs.v ? { v: attrs.v } : {}, getAttribute: k => (k === 'onclick' ? attrs.onclick || null : null) };
    return { target: { closest: s => (s === '.navbtn' ? b : null) } };
  };
  const adentro = P => P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: { nombre: 'GERENTE PRUEBA', rol: 'gerente', celular: '3000000000' }, equipo: [], gente: [] }));

  test('el toque del menú de Joan, a 880 px o menos, deja el contenido arriba de la pantalla', () => {
    const { P, mov } = montar(390, 1301);
    P.ctx.__toque = boton({ v: 'clientes' });
    P.ev('alTocarElMenu(__toque)');
    assert.deepEqual(mov, [[0, 1401]], 'tocar no llevó al contenido');
  });

  test('control: llamar a irA desde el código no arrastra la pantalla', () => {
    const { P, mov } = montar(390, 1301);
    P.ev('irA("clientes"); irA("cfg")');
    assert.deepEqual(mov, []);
  });

  test('a más de 880 px el toque no mueve nada, en ninguno de los dos menús', () => {
    const { P, mov } = montar(881, 0);
    P.ctx.__a = boton({ v: 'clientes' }); P.ctx.__b = boton({ onclick: "irEquipo('base')" });
    P.ev('alTocarElMenu(__a); alTocarElMenu(__b)');
    assert.deepEqual(mov, []);
    assert.equal(P.ev('pantallaDeCelular()'), false);
  });

  test('el menú del equipo también lleva; lo que abre un cuadro encima, no', () => {
    const { P, mov } = montar(390, 804);
    P.ctx.__a = boton({ onclick: "irEquipo('base')" });
    P.ev('alTocarElMenu(__a)');
    assert.deepEqual(mov, [[0, 904]]);
    mov.length = 0;
    ["agregarEq()", "miWhatsappEq()"].forEach(c => {
      P.ctx.__b = boton({ onclick: c });
      P.ev('alTocarElMenu(__b)');
    });
    assert.deepEqual(mov, [], 'al cerrar el cuadro la persona ya no estaría donde estaba');
  });

  test('lo que no es una entrada del menú no mueve nada', () => {
    const { P, mov } = montar(390, 804);
    P.ctx.__c = { target: { closest: () => null } };
    P.ev('alTocarElMenu(__c)');
    assert.deepEqual(mov, []);
  });

  test('control: irEquipo a más de 880 px sigue subiendo arriba del todo, que es a propósito', () => {
    const { P, mov } = montar(1280, 0);
    adentro(P);
    P.ev('irEquipo("plata")');
    assert.deepEqual(mov, [[0, 0]]);
  });

  test('irEquipo a 880 o menos ya no sube al menú: si leía el contenido vuelve a su principio; si estaba en el menú, ahí se queda', () => {
    const leyendo = montar(390, -300);
    adentro(leyendo.P);
    leyendo.P.ev('irEquipo("plata")');
    assert.deepEqual(leyendo.mov, [[0, -200]], 'subió al menú y escondió lo que acababa de cambiar');
    const enElMenu = montar(390, 804);
    adentro(enElMenu.P);
    enElMenu.P.ev('irEquipo("tablero")');
    assert.deepEqual(enElMenu.mov, [], 'al entrar, o desde el menú, el código no tiene por qué arrastrarlo');
  });

  test('sin matchMedia (un navegador raro, o este banco) se porta como en el computador', () => {
    const { P, mov } = montar(390, 0);
    delete P.ctx.matchMedia;
    assert.equal(P.ev('pantallaDeCelular()'), false);
    adentro(P);
    P.ev('irEquipo("plata")');
    assert.deepEqual(mov, [[0, 0]]);
  });

  test('el oyente está puesto en .side, y la cifra es la de la hoja', () => {
    assert.match(CRM, /const lado = document\.querySelector\('\.side'\); if \(lado\) lado\.addEventListener\('click', alTocarElMenu\);/);
    assert.match(CRM, /@media\(max-width:880px\)\{/);
    assert.match(CRM, /window\.matchMedia\('\(max-width:880px\)'\)/);
  });

  test('control: los botones del equipo siguen llamando a irEquipo con su onclick', () => {
    assert.match(CRM, /<button class="navbtn" onclick="irEquipo\('base'\)">/);
    assert.match(CRM, /<button class="navbtn" onclick="agregarEq\(\)">/);
  });
});

/* ------------------------------------------------------------------ F9 */
describe('F9. «Qué es» no deja escoger lo que no va a hacer', () => {
  const FRASE = 'El puesto de alguien que ya existe no se cambia desde aquí.';
  const conEquipo = (o) => abrirPanel(Object.assign({ red: () => Promise.reject(new Error('sin red')), almacen: { [LLAVE]: JSON.stringify({
    socios: [], prestamos: [], config: { pin: '4321' },
    equipo: [{ id: 'E1', nombre: 'ASESORA PRUEBA', celular: '3000000001', rol: 'asesor', estado: 'activo', jefe: '3000000000', codigo: 'X1', creadoEn: '2026-09-10' },
             { id: 'E2', nombre: 'GERENTE PRUEBA', celular: '3000000000', rol: 'gerente', estado: 'activo', jefe: '', codigo: 'X2', creadoEn: '2026-09-10' }]
  }) } }, o || {}));
  const cuadro = (P, id) => { P.ev('editarPersona(' + JSON.stringify(id) + ')'); return String(P.elems.mBody.innerHTML); };

  test('en alguien que ya existe sale apagado, con su rol, y dice por qué', () => {
    const P = conEquipo();
    const h = cuadro(P, 'E1');
    assert.match(h, /<select id="eqRol" disabled>/, 'sigue dejando escoger algo que guardarPersona ignora');
    assert.match(h, /<option value="asesor" selected>/, 'no muestra el puesto que tiene');
    assert.ok(h.includes(FRASE), 'apagado sin explicar parece un error');
  });

  test('control: al crear una persona nueva, igual que hoy, encendido y sin la frase', () => {
    const P = conEquipo();
    const h = cuadro(P, null);
    assert.match(h, /<select id="eqRol">/, 'no se podría crear a nadie con otro puesto');
    assert.ok(!h.includes(FRASE));
  });

  test('control: guardar a alguien que ya existe sigue funcionando y no le toca rol ni jefe', () => {
    const P = conEquipo();
    cuadro(P, 'E1');
    /* Lo que un <select disabled> de verdad devuelve: su opción marcada. */
    P.ctx.document.getElementById('eqRol').value = 'asesor';
    P.ctx.document.getElementById('eqNombre').value = 'ASESORA CORREGIDA';
    P.ctx.document.getElementById('eqTel').value = '3000000001';
    P.ctx.document.getElementById('eqJefe').value = '3000000000';
    P.ctx.document.getElementById('eqEstado').value = 'activo';
    P.ev("guardarPersona('E1')");
    const e = JSON.parse(P.almacen[LLAVE]).equipo.find(x => x.id === 'E1');
    assert.equal(e.nombre, 'ASESORA CORREGIDA');
    assert.equal(e.rol, 'asesor');
    assert.equal(e.jefe, '3000000000', 'guardar le quitó el jefe');
  });

  test('control: crear a una persona nueva con el puesto escogido sigue funcionando', () => {
    const P = conEquipo();
    cuadro(P, null);
    P.ctx.document.getElementById('eqRol').value = 'gerente';
    P.ctx.document.getElementById('eqNombre').value = 'GERENTE NUEVO';
    P.ctx.document.getElementById('eqTel').value = '3000000002';
    P.ctx.document.getElementById('eqJefe').value = '';
    P.ev('guardarPersona(null)');
    const e = JSON.parse(P.almacen[LLAVE]).equipo.find(x => x.nombre === 'GERENTE NUEVO');
    assert.equal(e.rol, 'gerente');
  });
});

/* ------------------------------------------------------------------ F10 */
describe('F10. Lo que traer.html dice de la conexión es cierto, y no se borra', () => {
  const CONEXION = 'joan_socios_sb';
  const VIEJA = () => {
    /* Una conexión guardada de antes: la que dejó el espejo en este teléfono. */
    const A = {};
    abrirTraer({ almacen: A });
    return A;
  };

  test('en un teléfono nuevo no dice que «ya estaba guardada»: la guardó esta página un instante antes', () => {
    const T = abrirTraer();
    assert.equal(T.texto('msg2'), '', 'afirma algo de la conexión');
    assert.equal(T.texto('notaConexion'), 'Cambiar la conexión', 'afirma algo de la conexión');
    assert.equal(T.elems.camposConexion.classList.contains('oculto'), true, 'los dos campos largos volvieron a la vista');
    assert.ok(JSON.parse(T.almacen[CONEXION]).url, 'tampoco es que no la tenga');
  });

  test('en un teléfono nuevo se puede cambiar igual: la llave de fábrica se puede rotar', () => {
    const T = abrirTraer();
    assert.equal(T.elems.btnVerCampos.classList.contains('oculto'), false);
    assert.equal(T.elems.btnVerCampos.textContent, 'Cambiar la conexión');
    T.tocar('btnVerCampos');
    assert.equal(T.elems.camposConexion.classList.contains('oculto'), false);
    assert.equal(T.elems.btnVerCampos.classList.contains('oculto'), true);
  });

  test('si de verdad ya estaba, lo dice, con su dirección y «Cambiarla»', () => {
    const T = abrirTraer({ almacen: VIEJA() });
    assert.match(T.texto('notaConexion'), /^La conexión ya estaba guardada en este teléfono \( ?https:\/\/[a-z0-9]+\.supabase\.co ?\)\. Cambiarla$/);
    assert.equal(T.elems.btnVerCampos.textContent, 'Cambiarla');
    assert.equal(T.elems.btnVerCampos.classList.contains('oculto'), false);
    assert.equal(T.texto('msg2'), '', 'se quedó en msg2: el primer «Entrando…» lo borra');
    assert.ok(T.bajoA('abajoDeEntrar').includes('notaConexion'), 'en un teléfono nada de esto puede empujar «Entrar»');
  });

  test('«Cambiarla» sobrevive al primer error: era justo cuando más podía hacer falta', async () => {
    const T = abrirTraer({ almacen: VIEJA(), red: () => ({ status: 401, cuerpo: { message: 'Invalid API key' } }) });
    T.elems.sbCorreo.value = 'duena@prueba.test'; T.elems.sbClave.value = 'una-clave-inventada';
    T.tocar('btnEntrar');
    await asentar();
    assert.equal(T.texto('e2'), 'No entró');
    assert.notEqual(T.texto('msg2'), '');
    assert.equal(T.elems.btnVerCampos.classList.contains('oculto'), false, 'desapareció con el primer error');
    assert.match(T.texto('notaConexion'), /ya estaba guardada/);
    T.tocar('btnVerCampos');
    assert.equal(T.elems.camposConexion.classList.contains('oculto'), false, 'el botón ya no abre los campos');
  });

  test('una sesión ya abierta ahora sí se dice: msg2 ya no viene lleno con la conexión', () => {
    const A = VIEJA();
    A.joan_panel_sesion = JSON.stringify({ access_token: 'acceso-de-prueba', refresh_token: 'renovar-de-prueba', correo: 'duena@prueba.test', expira_en: Date.now() + 3600000 });
    const T = abrirTraer({ almacen: A });
    assert.match(T.texto('msg2'), /Ya había una sesión abierta como duena@prueba\.test/);
    assert.equal(T.texto('e2'), 'Conectado');
  });

  test('sin acceso al cajón no ofrece cambiar nada', () => {
    const T = abrirTraer({ sinCajon: true });
    assert.equal(T.elems.btnVerCampos, undefined);
    assert.equal(T.texto('notaConexion'), '');
  });
});
