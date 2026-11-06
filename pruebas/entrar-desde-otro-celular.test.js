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

/* ------------------------------------------------------------------ F4 */
describe('F4. Traer se puede usar desde la primera pantalla', () => {
  const TRAER = LEER('panel/traer.html').replace(/\r\n/g, '\n');
  const VISIBLE = TRAER.slice(TRAER.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*<\/script>/, '');
  const i = (texto, desde) => VISIBLE.indexOf(texto, desde || 0);
  const PLEGADO_ABRE = i('<details class="plegable" id="losDetalles">');
  const PLEGADO_CIERRA = i('</details>', PLEGADO_ABRE);

  test('a la vista, una sola frase; y es la frase que es', () => {
    assert.match(VISIBLE, /id="fraseDeArriba">Sirve para mirar: lo que anotes aquí no llega a tu computador ni a tus clientes\.</);
    assert.ok(i('fraseDeArriba') > 0 && i('fraseDeArriba') < PLEGADO_ABRE, 'la frase quedó dentro de lo plegado');
    const cabecera = VISIBLE.slice(i('<header'), i('</header>'));
    assert.doesNotMatch(cabecera, /class="sub"/, 'la cabecera sigue con otra frase más encima');
  });

  test('el desplegable nace cerrado', () => {
    assert.ok(PLEGADO_ABRE > 0, 'no hay desplegable');
    assert.doesNotMatch(VISIBLE.slice(PLEGADO_ABRE, i('>', PLEGADO_ABRE)), /\bopen\b/, 'nace abierto: los avisos vuelven a empujar «Entrar»');
  });

  test('con los mismos textos, los cinco avisos y la frase de la cabecera (es decisión de Joan que estén)', () => {
    const adentro = VISIBLE.slice(PLEGADO_ABRE, PLEGADO_CIERRA).replace(/\s+/g, ' ');
    [
      'Baja tu cartera de la nube y la deja donde el CRM de siempre la busca.',
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
    assert.match(VISIBLE.slice(PLEGADO_ABRE, PLEGADO_CIERRA), /<summary>Antes de nada: para qué sirve esto y para qué no<\/summary>/);
  });

  test('siguen antes de los botones, y «Tu correo», «Tu contraseña» y «Entrar» van en ese orden', () => {
    const entrar = i('id="btnEntrar"'), correo = i('for="sbCorreo"'), clave = i('for="sbClave"');
    assert.ok(PLEGADO_CIERRA < i('id="c1"') && PLEGADO_CIERRA < correo, 'los avisos ya no van antes de los botones');
    assert.ok(correo < clave && clave < entrar);
  });

  test('entre la contraseña y «Entrar» no queda nada que lo empuje', () => {
    const tramo = VISIBLE.slice(i('id="sbClave"'), i('id="btnEntrar"'));
    assert.doesNotMatch(tramo, /class="ayuda"/);
    /* Pero lo que decía sigue en el paso 2, justo debajo. */
    assert.match(VISIBLE.slice(i('id="btnEntrar"')), /^[^]*?No se guarda en este teléfono\. Se cambia por una sesión/);
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

  test('con datos, Ventas guarda como siempre: lo que el embudo movió no se pierde', () => {
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
