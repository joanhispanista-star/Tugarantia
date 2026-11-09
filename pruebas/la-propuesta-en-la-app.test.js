/* ============================================================================
 * LA PROPUESTA, EN LA APP INSTALADA — 9 de noviembre de 2026
 *
 *   node --test pruebas/la-propuesta-en-la-app.test.js
 *
 * Una clienta pidió en play/, Joan le mandó una propuesta, y el CRM le dijo
 * que «en su app la ve y la acepta». Ella abrió app/socio.html y solo vio
 * «Ya revisamos tu registro · Nos falta un paso de nuestro lado»: esa app
 * nunca preguntaba por la solicitud. Escribió «estoy esperando el
 * desembolso», y Joan registró un crédito a mano, sin la propuesta.
 *
 * Con las dos páginas de verdad en sus bancos:
 *   1. LA MISMA ACEPTACIÓN. La misma propuesta aceptada en play/ y en
 *      socio.html manda las MISMAS funciones, en el MISMO orden, con los
 *      MISMOS parámetros (p_vio entero: la constancia), también con la base
 *      sin la migración (404). Y esa constancia pasa las comprobaciones de
 *      aceptar_condiciones (base/20261008_condiciones_aceptadas.sql) y casa
 *      con descuadreDeConstancia del CRM.
 *   2. LA CUENTA SIN JUNTAR: la propuesta va arriba de todo y el texto dice
 *      que está esperando su respuesta; pidió → «Pediste $X: lo estamos
 *      revisando»; aceptó → «Aceptaste: … te consignamos a …», sin fecha.
 *      Con mi_registro en 404 no se pregunta nada (la base no tiene la reja).
 *   3. LA CUENTA JUNTA: la misma tarjeta arriba de Inicio.
 *   4. LA RECARGA SOLA no se lleva la casilla ni la cuenta a medio elegir, en
 *      ninguna pantalla; «Salir» lo suelta todo.
 *   5. Sin porcentajes en lo que ve el cliente.
 * Los números y nombres son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');
const { abrirSocio } = require('./banco-socio.js');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const SS = require('../app/sesion-socio.js');
const PEA = require('../app/propuesta-en-la-app.js');

const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };

/* Como la devuelve mi_solicitud: sin `datos` ni `registro_id`. */
const PROPUESTA = () => ({ id: 9, estado: 'contrapropuesta', app: 'tugarantia', cedula: '3001112222',
  capital: 1500000, pedido_monto: 1500000, pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30) },
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30,
                     costo_pct: 20, texto: 'Te podemos prestar esto', por: 'joan', creada_en: '2026-11-09T15:00:00Z' } });
/* Lo que contesta mis_cuentas_de_pago: solo las llaves de pago. */
const CUENTAS = { nequi: '3001112233', llave_breb: '@MARIA123', cuentas_mias: 'si' };
const aceptadaDe = (sol, destino) => Object.assign({}, sol, { estado: 'aceptada',
  destino_desembolso: destino ? Object.assign({}, destino, { propuesta: sol.contrapropuesta.creada_en }) : null });

const FUNCIONES = ['mi_solicitud', 'mis_cuentas_de_pago', 'aceptar_con_destino', 'aceptar_condiciones', 'aceptar_contrapropuesta'];
const lasDeLaPropuesta = l => l.filter(x => FUNCIONES.indexOf(x.fn) >= 0).map(x => ({ fn: x.fn, c: x.c }));

/* ---- play/, por su camino de siempre: cargarMiSolicitud y la tarjeta ---- */
async function enPlay(resp) {
  const P = abrirPlay();
  P.ev('window.__l = []; window.__resp = ' + JSON.stringify(resp) + ';' +
       ' fetch = function (u, o) { var s = String(u); var fn = (/rpc\\/([a-z_]+)/.exec(s) || [, ""])[1];' +
       ' window.__l.push({ u: s, fn: fn, c: o && o.body ? JSON.parse(o.body) : null });' +
       ' var r = window.__resp[fn]; if (r && r.__estado) return Promise.resolve({ ok: false, status: r.__estado, json: function () { return Promise.resolve({}); } });' +
       ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r || { ok: true }); } }); };');
  P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; cargarMiSolicitud();');
  await asentar(12);
  return { P, llamadas: () => JSON.parse(P.ev('JSON.stringify(window.__l)')) };
}

/* ---- socio.html, entrando con su celular y su contraseña ---------------- */
const CORREO = '573001112222@tugarantia.net';
function nubeSocio(resp, o) {
  o = o || {};
  return (url, cuerpo) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
    }
    if (/\/auth\/v1\/logout/.test(url)) return { status: 204 };
    const fn = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    if (fn === 'mi_cuenta') {
      return o.junta ? { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Marta Prueba', actualizado_en: '2026-11-09T10:00:00Z',
        datos: { garantia: { total: 0, acumulada: 0 }, creditos: [], respaldados: [], socio: { codigo: 'CL-0099' }, perfil: { datos: {} },
                 referidos: { total: 0, pagaron: 0, lista: [] } } } }
        : { status: 200, cuerpo: { ok: true, vinculada: false } };
    }
    if (fn === 'mi_registro') return o.miRegistro || { status: 200, cuerpo: { ok: true, registro: { estado: 'atendido' } } };
    if (fn === 'chat_leer_sesion') return { status: 200, cuerpo: { ok: true, canal: cuerpo && cuerpo.p_canal, mensajes: [] } };
    const r = resp[fn];
    if (r && r.__estado) return { status: r.__estado, cuerpo: { message: 'no existe' } };
    if (r !== undefined) return { status: 200, cuerpo: r };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
async function enSocio(resp, o) {
  const A = abrirSocio(Object.assign({ red: nubeSocio(resp, o) }, (o && o.banco) || {}));
  await asentar();
  A.elem('inCel').value = '300 111 2222'; A.elem('inClave').value = 'una-clave-buena';
  A.ev('entrar()');
  await asentar(24);
  const llamadas = () => A.llamadas.filter(l => /\/rest\/v1\/rpc\//.test(l.url))
    .map(l => ({ fn: l.url.split('/').pop(), c: l.cuerpo }));
  return { A, llamadas };
}
/* En el banco, el #propuestaCaja que viene dentro del HTML de la pantalla es
   texto de su contenedor; el elemento solo se llena cuando la tarjeta se
   repinta sola (después de aceptar, o al llegar la respuesta). */
const caja = A => A.elem('propuestaCaja').innerHTML
  || (A.ev('PANTALLA') === 'sin_juntar' ? A.elem('entrarCuerpo').innerHTML : A.elem('cuerpo').innerHTML);

/* Lo que hace aceptar_condiciones con p_vio ANTES de aceptar (la sección 3 de
   base/20261008_condiciones_aceptadas.sql), y lo que deja en
   contrapropuesta.condiciones. Si p_vio no pasara, la base contestaría
   'cambio' o 'sin_condiciones' y el cliente no podría aceptar. */
function comoLaBase(sol, vio) {
  const cp = sol.contrapropuesta;
  const num = v => (/^\d{1,12}$/.test(String(v == null ? '' : v)) ? Number(v) : null);
  if (num(vio.capital) !== Number(cp.capital) || num(vio.total) !== Number(cp.total)
      || String(vio.fecha_pago || '').slice(0, 10) !== String(cp.fecha_pago).slice(0, 10)
      || String(vio.creada_en || '') !== String(cp.creada_en || '')) return { ok: false, motivo: 'cambio' };
  if (String(vio.texto || '').trim().length < 40) return { ok: false, motivo: 'sin_condiciones' };
  const tope = vio.tope_mora && /^0?\.\d{1,8}$/.test(String(vio.tope_mora.ea)) && /^\d{1,9}$/.test(String(vio.tope_mora.por_dia))
    ? { ea: Number(vio.tope_mora.ea), por_dia: Number(vio.tope_mora.por_dia) } : null;
  return { ok: true, solicitud: Object.assign({}, sol, { estado: 'aceptada',
    contrapropuesta: Object.assign({}, cp, { condiciones: { version: vio.version, aceptadas_en: '2026-11-09T16:00:00Z',
      lineas: vio.lineas, tope_mora: tope,
      base: { capital: cp.capital, total: cp.total, fecha_pago: String(cp.fecha_pago).slice(0, 10), creada_en: cp.creada_en } } }) }) };
}

describe('1. la misma aceptación en play/ y en socio.html', () => {
  test('con su Nequi: las mismas funciones, en el mismo orden, con los mismos parámetros', async () => {
    const sol = PROPUESTA();
    const resp = { mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
      aceptar_con_destino: { ok: true, solicitud: aceptadaDe(sol, { medio: 'nequi', numero: '3001112233', es_mia: true }) } };
    const play = await enPlay(resp);
    play.P.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    const socio = await enSocio(resp);
    socio.A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);

    const deplay = lasDeLaPropuesta(play.llamadas()), desocio = lasDeLaPropuesta(socio.llamadas());
    assert.deepEqual(deplay.map(x => x.fn), ['mi_solicitud', 'mis_cuentas_de_pago', 'aceptar_con_destino'], 'play/ cambió su camino');
    assert.deepEqual(desocio.map(x => x.fn), deplay.map(x => x.fn), 'socio.html no llama lo mismo que play/');
    assert.deepEqual(desocio, deplay, 'los parámetros no son los mismos (p_vio es la constancia de lo que leyó)');
    /* Y ni la cuenta ni la llave viajan en una dirección. */
    assert.equal(socio.A.llamadas.some(l => /3001112233|MARIA123/.test(l.url)), false);
  });

  test('la constancia que mandan las dos pasa las comprobaciones de la base y casa en el CRM', async () => {
    const sol = PROPUESTA();
    const resp = { mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
      aceptar_con_destino: { ok: true, solicitud: aceptadaDe(sol, null) } };
    const socio = await enSocio(resp);
    socio.A.ev("marcarCondiciones(true); elegirDestino('1'); aceptarContrapropuesta(9);");
    await asentar(12);
    const a = socio.llamadas().find(x => x.fn === 'aceptar_con_destino');
    assert.ok(a, 'socio.html no aceptó');
    assert.deepEqual(a.c.p_destino, { medio: 'breb', llave: '@MARIA123', es_mia: true });
    const r = comoLaBase(sol, a.c.p_vio);
    assert.equal(r.ok, true, 'la base no aceptaría lo que manda socio.html: ' + r.motivo);
    /* El CRM, con la solicitud como la deja la base. */
    const C = abrirPanel();
    C.ev('_solicitudes = [' + JSON.stringify(Object.assign({ origen: 'nube' }, r.solicitud)) + ']');
    assert.deepEqual(JSON.parse(C.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))')), [],
      'el CRM diría que lo que dice su app no casa con la base');
    assert.match(C.ev('condicionesAceptadasDe(_solicitudes[0])'), /Aceptó las condiciones/);
    assert.doesNotMatch(C.ev('condicionesAceptadasDe(_solicitudes[0])'), /no casa/);
  });

  test('sin aceptar_con_destino (404): las dos caen a aceptar_condiciones con lo mismo, y lo dicen', async () => {
    const sol = PROPUESTA();
    const resp = { mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
      aceptar_con_destino: { __estado: 404 }, aceptar_condiciones: { ok: true, solicitud: aceptadaDe(sol, null) } };
    const play = await enPlay(resp);
    play.P.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    const socio = await enSocio(resp);
    socio.A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    const deplay = lasDeLaPropuesta(play.llamadas()), desocio = lasDeLaPropuesta(socio.llamadas());
    assert.deepEqual(deplay.map(x => x.fn), ['mi_solicitud', 'mis_cuentas_de_pago', 'aceptar_con_destino', 'aceptar_condiciones']);
    assert.deepEqual(desocio, deplay);
    const h = plano(caja(socio.A));
    assert.match(h, /Aceptaste/);
    assert.match(h, /no alcanzamos a guardar a qué cuenta te consignamos/);
    assert.doesNotMatch(h, /Te la consignamos a/, 'dice a dónde sin que la base lo sepa');
  });

  test('sin ninguna de las dos (404): no se acepta sin constancia, en ninguna de las dos', async () => {
    const sol = PROPUESTA();
    const resp = { mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
      aceptar_con_destino: { __estado: 404 }, aceptar_condiciones: { __estado: 404 }, aceptar_contrapropuesta: { ok: true, solicitud: aceptadaDe(sol, null) } };
    const play = await enPlay(resp);
    play.P.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    const socio = await enSocio(resp);
    socio.A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    assert.deepEqual(lasDeLaPropuesta(socio.llamadas()), lasDeLaPropuesta(play.llamadas()));
    assert.equal(socio.llamadas().some(x => x.fn === 'aceptar_contrapropuesta'), false, 'aceptó por la puerta que no guarda lo que leyó');
    assert.match(socio.A.elem('errAceptar').textContent, /No pudimos registrar tu aceptación todavía \(no es tu teléfono ni tu internet\)/);
  });

  test('si Joan la cambió mientras leía: la base dice «cambio», se vuelve a preguntar y se muestra la nueva', async () => {
    const sol = PROPUESTA();
    const nueva = PROPUESTA(); nueva.contrapropuesta.creada_en = '2026-11-09T15:30:00Z'; nueva.contrapropuesta.total = 1500000;
    let veces = 0;
    const resp = { mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS }, aceptar_con_destino: { ok: false, motivo: 'cambio' } };
    const socio = await enSocio(new Proxy(resp, { get: (t, k) => k === 'mi_solicitud'
      ? { ok: true, solicitud: (veces++ === 0 ? sol : nueva) } : t[k] }));
    socio.A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(16);
    assert.deepEqual(socio.llamadas().map(x => x.fn).filter(f => FUNCIONES.indexOf(f) >= 0),
      ['mi_solicitud', 'mis_cuentas_de_pago', 'aceptar_con_destino', 'mi_solicitud']);
    const h = plano(caja(socio.A));
    assert.match(h, /La propuesta cambió mientras la leías/);
    assert.match(h, /devuelvo \$1\.500\.000/);
    assert.equal(socio.A.ev('PDA.casillaMarcada()'), false, 'la marca de la vieja valió para la nueva');
  });

  test('sin marcar la casilla, o sin elegir a dónde, no sale nada', async () => {
    const sol = PROPUESTA();
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    socio.A.ev('aceptarContrapropuesta(9)');
    await asentar();
    assert.match(socio.A.elem('errAceptar').textContent, /Marca la casilla «Leí y acepto las condiciones de este crédito»/);
    socio.A.ev('marcarCondiciones(true); aceptarContrapropuesta(9)');
    await asentar();
    assert.match(socio.A.elem('errAceptar').textContent, /Elige a dónde te consignamos/);
    assert.equal(socio.llamadas().some(x => /^aceptar/.test(x.fn)), false);
  });
});

describe('2. la cuenta sin juntar dice en qué va su solicitud', () => {
  test('con una propuesta: va arriba de todo, con las condiciones, la cuenta y la casilla, y el texto no dice solo «nos falta un paso»', async () => {
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    const h = socio.A.elem('entrarCuerpo').innerHTML;
    assert.equal(h.indexOf('<div id="propuestaCaja">'), 0, 'la propuesta no va arriba de todo');
    assert.ok(h.indexOf('Te hicimos una propuesta') < h.indexOf('id="sjTit"'));
    const p = plano(h);
    assert.match(p, /Las condiciones de este crédito/);
    assert.match(p, /Acepto: recibo \$1\.200\.000 y devuelvo \$1\.440\.000/);
    assert.match(socio.A.elem('cajaDestino').innerHTML, /Nequi ···2233/);
    assert.match(p, /Ya revisamos tu registro Te hicimos una propuesta de crédito: la tienes arriba, esperando tu respuesta\. Nos falta un paso de nuestro lado/);
  });

  test('pidió y todavía no hay propuesta: «Pediste $X: lo estamos revisando», sin prometer una hora', async () => {
    const sol = { id: 7, estado: 'nueva', cedula: '3001112222', capital: 800000, pedido_monto: 800000,
      pedido: { origen: 'play', capital: 800000, fecha_pago: enDias(20) }, contrapropuesta: null };
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: sol } });
    const p = plano(caja(socio.A));
    assert.match(p, /Pediste \$800\.000 para pagar el .+: lo estamos revisando/);
    assert.match(p, /Todavía no es un crédito/);
    assert.doesNotMatch(p, /\bhoras?\b|te avisamos al celular/);
    assert.match(plano(socio.A.elem('entrarCuerpo').innerHTML), /Tu solicitud de crédito llegó y la estamos revisando/);
  });

  test('aceptada: «Aceptaste: … te consignamos a …», sin fecha, y sin casilla ni botón', async () => {
    const sol = aceptadaDe(PROPUESTA(), { medio: 'nequi', numero: '3001112233', es_mia: true });
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: sol } });
    const h = caja(socio.A), p = plano(h);
    assert.match(p, /Aceptaste: \$1\.200\.000\. Te la consignamos a Nequi ···2233 , a tu nombre/);
    assert.doesNotMatch(h, /id="btnAceptar"|id="condLeidas"/);
    assert.doesNotMatch(p, /\b(mañana|hoy mismo|en \d+ horas?)\b/);
    assert.equal(socio.A.ev('momentoSeguroSocio()'), true, 'una aceptada no tiene nada a medias');
  });

  test('con mi_registro en 404 (la base sin la reja) no se pregunta por la solicitud; con la reja, sí', async () => {
    const conReja = await enSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() } });
    assert.ok(conReja.llamadas().some(x => x.fn === 'mi_solicitud'), 'con la puerta puesta no preguntó por su solicitud');
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() } },
      { miRegistro: { status: 404, cuerpo: { message: 'no existe' } } });
    assert.equal(socio.llamadas().some(x => x.fn === 'mi_solicitud'), false,
      'preguntó por la solicitud en una base que todavía no separa la cuenta de la ficha de su número');
    assert.doesNotMatch(socio.A.elem('entrarCuerpo').innerHTML, /propuestaCaja/);
  });

  test('sin mi_solicitud en la base (404), o sin señal, se dice', async () => {
    const a = await enSocio({ mi_solicitud: { __estado: 404 } });
    assert.match(plano(caja(a.A)), /Todavía no podemos mostrarte aquí tus solicitudes de crédito \(no es tu teléfono ni tu internet\)/);
    const b = await enSocio({ mi_solicitud: { __estado: 500 } });
    assert.match(plano(caja(b.A)), /No pude ver si tienes una solicitud o una propuesta de crédito esperando/);
  });

  test('sin nada abierto (atendida, descartada), no se pinta ninguna tarjeta y el texto es el de siempre', async () => {
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: { id: 3, estado: 'atendida', contrapropuesta: { capital: 1 } } } });
    assert.ok(socio.llamadas().some(x => x.fn === 'mi_solicitud'), 'no preguntó por su solicitud');
    assert.doesNotMatch(socio.A.elem('entrarCuerpo').innerHTML, /id="pdaTarjeta"/);
    assert.match(plano(socio.A.elem('entrarCuerpo').innerHTML), /Ya revisamos tu registro Nos falta un paso de nuestro lado/);
  });
});

describe('3. la cuenta junta: la misma tarjeta, arriba de Inicio', () => {
  test('su propuesta sale en Inicio y se acepta igual', async () => {
    const sol = PROPUESTA();
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
      aceptar_con_destino: { ok: true, solicitud: aceptadaDe(sol, { medio: 'nequi', numero: '3001112233', es_mia: true }) } }, { junta: true });
    assert.ok(socio.A.visible('pCuenta'), 'no abrió la cuenta junta');
    assert.equal(socio.A.ev('PANTALLA'), 'inicio');
    assert.match(plano(caja(socio.A)), /Te hicimos una propuesta/);
    socio.A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    assert.ok(socio.llamadas().some(x => x.fn === 'aceptar_con_destino'));
    assert.match(plano(caja(socio.A)), /Aceptaste/);
    /* Al volver a Inicio se pinta lo que se sabe, sin volver a preguntar. */
    socio.A.ev("irA('historial'); irA('inicio')");
    assert.match(plano(socio.A.elem('cuerpo').innerHTML), /Aceptaste/);
    /* Y el «Ver como» de Joan (sin sesión) no pregunta nada a nombre de nadie. */
    const A = abrirSocio({ red: nubeSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() } }) });
    await asentar();
    A.ev("abrir({ nombre: 'Marta Prueba', datos: { garantia: { total: 0 }, creditos: [], respaldados: [], perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } }, origen: 'panel' })");
    await asentar();
    assert.equal(A.llamadas.some(l => /mi_solicitud/.test(l.url)), false);
    assert.doesNotMatch(A.elem('cuerpo').innerHTML, /propuestaCaja/);
  });
});

describe('4. la recarga sola no corta a mitad de elegir o aceptar', () => {
  test('la casilla marcada o la cuenta a medio elegir frenan en cualquier pantalla; «Salir» lo suelta', async () => {
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } }, { junta: true });
    const A = socio.A;
    assert.equal(A.ev('momentoSeguroSocio()'), true, 'con la propuesta sin tocar, Inicio es de la lista');
    A.ev('marcarCondiciones(true)');
    assert.equal(A.ev('momentoSeguroSocio()'), false, 'la casilla marcada');
    A.ev("irA('historial')");
    assert.equal(A.ev('momentoSeguroSocio()'), false, 'en Historial se la llevaba igual');
    A.ev('marcarCondiciones(false)');
    A.ev("irA('inicio'); elegirDestino('otra'); medioDestino('daviplata')");
    assert.equal(A.ev('momentoSeguroSocio()'), false, 'la cuenta a medio elegir');
    A.ev('salir()');
    await asentar();
    A.elem('inCel').value = '';   // la entrada se vuelve a pintar vacía; en el banco el campo se queda
    assert.equal(A.ev('PDA.aMedias()'), false, '«Salir» dejó lo elegido para la siguiente cuenta');
    assert.equal(A.ev('momentoSeguroSocio()'), true);
  });

  test('en la cuenta sin juntar, igual', async () => {
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    assert.equal(socio.A.ev('PANTALLA'), 'sin_juntar');
    assert.equal(socio.A.ev('momentoSeguroSocio()'), true);
    socio.A.ev("elegirDestino('0')");
    assert.equal(socio.A.ev('momentoSeguroSocio()'), false);
  });

  test('la respuesta de una aceptación que llega después de «Salir» no se pinta', async () => {
    const sol = PROPUESTA();
    let soltar;
    const resp = { mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } };
    const A = abrirSocio({ red: (u, c) => /aceptar_con_destino$/.test(u)
      ? new Promise(r => { soltar = () => r({ status: 200, cuerpo: { ok: true, solicitud: aceptadaDe(sol, null) } }); })
      : nubeSocio(resp)(u, c) });
    await asentar();
    A.elem('inCel').value = '300 111 2222'; A.elem('inClave').value = 'una-clave-buena';
    A.ev('entrar()');
    await asentar(24);
    A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar();
    assert.equal(A.ev('ocupadoSocio()'), true, 'la aceptación en camino no cuenta como escritura');
    A.ev('salir()');
    A.elem('propuestaCaja').innerHTML = '(nada)';
    soltar();
    await asentar(12);
    assert.equal(A.elem('propuestaCaja').innerHTML, '(nada)', 'pintó la aceptación de la cuenta anterior');
  });
});

describe('5. lo que ve el cliente', () => {
  test('ningún porcentaje en la tarjeta de la propuesta', async () => {
    const socio = await enSocio({ mi_solicitud: { ok: true, solicitud: PROPUESTA() }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS } });
    const p = plano(caja(socio.A));
    assert.match(p, /Las condiciones de este crédito/, 'no pintó la propuesta');
    assert.doesNotMatch(p, /%/);
  });

  test('textoSinJuntar: sin propuesta dice lo de siempre; con ella, primero lo de su crédito', () => {
    assert.deepEqual(SS.textoSinJuntar('atendido'), SS.textoSinJuntar('atendido', null));
    const t = SS.textoSinJuntar('atendido', 'propuesta');
    assert.equal(t.titulo, 'Ya revisamos tu registro');
    assert.match(t.texto, /^Te hicimos una propuesta de crédito: la tienes arriba, esperando tu respuesta\. Nos falta un paso de nuestro lado/);
    assert.match(SS.textoSinJuntar('nuevo', 'espera').texto, /^Tu solicitud de crédito llegó/);
    assert.equal(SS.textoSinJuntar('descartado', 'propuesta').texto, SS.textoSinJuntar('descartado').texto);
    assert.equal(SS.textoSinJuntar('apagado', 'propuesta').texto, SS.textoSinJuntar('apagado').texto);
  });

  test('queMostrar lee la solicitud como cargarMiSolicitud de play/', () => {
    assert.equal(PEA.queMostrar(null), null);
    assert.equal(PEA.queMostrar({ estado: 'nueva' }), 'espera');
    assert.equal(PEA.queMostrar({ estado: 'contrapropuesta', contrapropuesta: { capital: 1 } }), 'propuesta');
    assert.equal(PEA.queMostrar({ estado: 'aceptada', contrapropuesta: { capital: 1 } }), 'aceptada');
    ['atendida', 'descartada', 'vencida'].forEach(e => assert.equal(PEA.queMostrar({ estado: e, contrapropuesta: { capital: 1 } }), null, e));
    assert.deepEqual(PEA.LECTURAS, ['mi_solicitud', 'mis_cuentas_de_pago']);
  });
});
