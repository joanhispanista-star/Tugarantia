'use strict';
/* ============================================================================
 * LA PROPUESTA VENCIDA — 10 de noviembre de 2026
 *
 *   node --test pruebas/la-propuesta-vencida.test.js
 *
 * Antes de v143 la app instalada (app/socio.html) no mostraba propuestas, y
 * las que nadie contestó se quedaron abiertas en la bandeja, algunas con la
 * fecha de pago ya pasada. La revisión del 10-nov vio que al publicar v143
 * le salían de golpe con «Acepto»: «Un solo pago … el sábado 31 de octubre»,
 * leído el 10 de noviembre. Y el CRM la registraba ya vencida: paga el 31-oct,
 * desembolso el 10-nov.
 *
 *   1. La app: una propuesta cuya fecha de pago (o primera cuota) ya llegó no
 *      se acepta. Dice lo que era, en pesos, y que pida una nueva por el chat;
 *      sin casilla, sin cuenta y sin botón, y no sale ninguna aceptación.
 *   2. El CRM: la bandeja y la ficha la marcan «Vencida», y registrarla
 *      aceptada pide un sí explícito. Con el no, no se registra nada.
 * Los nombres y números son de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirSocio } = require('./banco-socio.js');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const SS = require('../app/sesion-socio.js');
const PEA = require('../app/propuesta-en-la-app.js');
const CS = require('../app/calculadora-solicitud.js');

const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
const CEL = '3001112222';

/* Como la devuelve mi_solicitud. */
const PROPUESTA = dias => ({ id: 9, estado: 'contrapropuesta', app: 'tugarantia', cedula: CEL,
  capital: 1500000, pedido_monto: 1500000, pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(dias) },
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(dias), dias: 30,
                     costo_pct: 20, texto: '', por: 'joan', creada_en: '2026-10-20T15:00:00Z' } });
const A_CUOTAS = primera => {
  const s = PROPUESTA(primera + 60);
  s.producto = 'respaldado'; s.plazo_meses = 3;
  s.contrapropuesta = { capital: 1000000, costo: 40400, total: 1040400, por: 'joan', creada_en: '2026-10-20T15:00:00Z', texto: '',
    plazo_meses: 3, fecha_pago: enDias(primera + 60),
    cuotas: [{ n: 1, fecha: enDias(primera), cuota: 346800 }, { n: 2, fecha: enDias(primera + 30), cuota: 346800 }, { n: 3, fecha: enDias(primera + 60), cuota: 346800 }] };
  return s;
};
const CUENTAS = { nequi: '3001112233', cuentas_mias: 'si' };
const CORREO = '573001112222@tugarantia.net';

function nubeSocio(resp) {
  return (url, cuerpo) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
    }
    if (/\/auth\/v1\/logout/.test(url)) return { status: 204 };
    const fn = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    if (fn === 'mi_cuenta') return { status: 200, cuerpo: { ok: true, vinculada: false } };
    if (fn === 'mi_registro') return { status: 200, cuerpo: { ok: true, registro: { estado: 'atendido' } } };
    if (fn === 'chat_leer_sesion') return { status: 200, cuerpo: { ok: true, canal: cuerpo && cuerpo.p_canal, mensajes: [] } };
    const r = resp[fn];
    if (r !== undefined) return { status: 200, cuerpo: r };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
async function enSocio(sol) {
  const A = abrirSocio({ red: nubeSocio({ mi_solicitud: { ok: true, solicitud: sol }, mis_cuentas_de_pago: { ok: true, cuentas: CUENTAS },
    aceptar_con_destino: { ok: true, solicitud: Object.assign({}, sol, { estado: 'aceptada' }) },
    aceptar_condiciones: { ok: true, solicitud: Object.assign({}, sol, { estado: 'aceptada' }) } }) });
  await asentar();
  A.elem('inCel').value = '300 111 2222'; A.elem('inClave').value = 'una-clave-buena';
  A.ev('entrar()');
  await asentar(24);
  return A;
}
const aceptaciones = A => A.llamadas.filter(l => /\/rest\/v1\/rpc\/aceptar/.test(l.url));

describe('1. la app no deja aceptar una propuesta vencida', () => {
  for (const [nombre, sol] of [['un solo pago, la fecha pasó hace 10 días', () => PROPUESTA(-10)],
                               ['un solo pago, la fecha es hoy', () => PROPUESTA(0)],
                               ['a cuotas, la primera cuota ya pasó', () => A_CUOTAS(-3)]]) {
    test(nombre + ': lo dice, sin casilla ni botón, y no sale ninguna aceptación', async () => {
      const A = await enSocio(sol());
      const h = A.elem('entrarCuerpo').innerHTML, p = plano(h);
      assert.match(p, /Esta propuesta ya no se puede aceptar\. Te ofrecíamos \$1\.[02]00\.000 para devolver \$1\.[04]{2}0\.[04]00 .*el .+, y esa fecha ya llegó\. Escríbenos por el chat de la app y te mandamos una nueva\./);
      assert.doesNotMatch(h, /id="btnAceptar"|id="condLeidas"|id="cajaDestino"/);
      assert.doesNotMatch(p, /Acepto: recibo|esperando tu respuesta/);
      assert.match(plano(A.elem('sjTexto').innerHTML || h), /La propuesta de crédito que te hicimos ya no se puede aceptar/);
      /* Ni tocando los manejadores a mano sale una aceptación. */
      A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
      await asentar(12);
      assert.equal(aceptaciones(A).length, 0, 'mandó la aceptación de una propuesta vencida');
      assert.equal(A.ev('momentoSeguroSocio()'), true, 'una vencida no tiene nada a medias');
      assert.doesNotMatch(p, /%/);
    });
  }

  test('con la fecha por venir, la de siempre (control)', async () => {
    const A = await enSocio(PROPUESTA(30));
    assert.match(plano(A.elem('entrarCuerpo').innerHTML), /Acepto: recibo \$1\.200\.000 y devuelvo \$1\.440\.000/);
  });

  test('si la fecha llega con la tarjeta abierta (la medianoche), «Acepto» no manda nada y se repinta vencida', async () => {
    let H = enDias(0);
    const sol = PROPUESTA(1);
    const llamadas = [];
    const caja = { innerHTML: '' };
    const C = PEA.crear({ CS, CP: null, hoy: () => H, quien: () => CEL, caja: () => caja, porId: () => null,
      rpc: fn => { llamadas.push(fn); return Promise.resolve(fn === 'mi_solicitud' ? { ok: true, solicitud: sol } : { ok: true, solicitud: sol }); } });
    await C.cargar();
    assert.equal(C.que(), 'propuesta');
    caja.innerHTML = C.html();
    C.marcar(true);
    assert.equal(C.aMedias(), true);
    H = enDias(1);                       // pasó la medianoche: la fecha de pago es hoy
    C.aceptar(9);
    await asentar();
    assert.deepEqual(llamadas.filter(f => /^aceptar/.test(f)), [], 'aceptó después de que llegara la fecha');
    assert.equal(C.que(), 'propuesta_vencida');
    assert.match(plano(caja.innerHTML), /Esta propuesta ya no se puede aceptar/);
    assert.equal(C.aMedias(), false, 'la casilla de una vencida seguía frenando la recarga');
  });

  test('queMostrar y textoSinJuntar: con hoy, «propuesta_vencida»; sin hoy, la lectura de siempre', () => {
    const v = PROPUESTA(-1);
    assert.equal(PEA.queMostrar(v), 'propuesta');
    assert.equal(PEA.queMostrar(v, enDias(0)), 'propuesta_vencida');
    assert.equal(PEA.queMostrar(PROPUESTA(1), enDias(0)), 'propuesta');
    assert.equal(PEA.vencioEl(v, enDias(0)), enDias(-1));
    assert.equal(PEA.vencioEl(A_CUOTAS(-1), enDias(0)), enDias(-1));
    assert.equal(PEA.queMostrar(Object.assign(v, { estado: 'aceptada' }), enDias(0)), 'aceptada');
    assert.match(SS.textoSinJuntar('atendido', 'propuesta_vencida').texto, /^La propuesta de crédito que te hicimos ya no se puede aceptar \(arriba\): escríbenos por este chat y te mandamos una nueva\. Nos falta un paso/);
  });
});

/* ---- El CRM ---------------------------------------------------------------- */
const FICHA = () => ({ id: 'C900', numero: 90, nombre: 'Marta Prueba', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [], fechaRegistro: '2026-10-19T10:00:00Z', origen: 'registro_abierto' });
const SOLICITUD = (estado, dias) => {
  const s = { id: 31, nombre: 'Marta Prueba', cedula: CEL, celular: CEL, estado, app: 'tugarantia', origen: 'nube',
    capital: 1500000, pedido_monto: 1500000, producto: 'quincenal', registro_id: 55, fecha_corte: enDias(dias),
    pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(dias), dias: 30 }, datos: {},
    contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(dias), dias: 30, costo_pct: 20,
                       texto: '', por: 'joan', creada_en: '2026-10-20T15:00:00Z' } };
  if (estado === 'aceptada') {
    s.contrapropuesta.condiciones = { version: '2026-10-22', aceptadas_en: '2026-10-21T16:00:00Z',
      lineas: [{ clave: 'recibes', k: 'Recibes', v: '$1.200.000' }], tope_mora: null,
      base: { capital: 1200000, total: 1440000, fecha_pago: s.contrapropuesta.fecha_pago, creada_en: s.contrapropuesta.creada_en } };
    s.destino_desembolso = { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: s.contrapropuesta.creada_en };
  }
  return s;
};
async function enCRM(sol) {
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const P = abrirPanel({ red: url => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    if (fn === 'listar_solicitudes_abiertas') return Promise.resolve(resp(200, [JSON.parse(JSON.stringify(sol))]));
    if (/^listar_/.test(fn || '')) return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(200, { ok: true }));
  } });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba-bien-larga' });
  P.cargarCartera({ socios: [FICHA()], prestamos: [], config: { negocio: 'Tu Garantía' } });
  P.ev('traerSolicitudes(true)'); await asentar();
  return P;
}

describe('2. el CRM la marca y no la registra vencida sin preguntar', () => {
  test('aceptada con la fecha pasada: «Registrar el crédito con lo que aceptó» pregunta, y con el no no registra', async () => {
    const P = await enCRM(SOLICITUD('aceptada', -10));
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return !/nace VENCIDO/.test(m); };
    P.ev("crearDesdeSolicitud('31')"); await asentar();
    assert.equal(JSON.parse(P.ev('JSON.stringify(DB.prestamos)')).length, 0, 'registró un crédito que nace vencido sin preguntar');
    const q = preguntas.find(m => /nace VENCIDO/.test(m));
    assert.ok(q, 'no avisó que la fecha ya pasó');
    assert.match(q, /se pagaba el .+, y esa fecha ya llegó/);
    assert.match(q, /cámbiale la propuesta con «✏️ Cambiar propuesta»/);
  });

  test('con el sí (la plata ya se giró y se anota tarde), registra como antes', async () => {
    const P = await enCRM(SOLICITUD('aceptada', -10));
    P.ctx.confirm = m => String(m).indexOf('bienvenida') < 0;
    P.ev("crearDesdeSolicitud('31')"); await asentar();
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
    assert.equal(p.length, 1);
    assert.equal(p[0].cicloActual, enDias(-10));
  });

  test('la bandeja y la ficha dicen «Vencida»; aceptada, la ficha pone primero «✏️ Cambiar propuesta»', async () => {
    const P = await enCRM(SOLICITUD('contrapropuesta', -2));
    assert.match(plano(P.elems.bandeja.innerHTML), /⚠️ Vencida: pagaba el .+ y esa fecha ya llegó\. Cámbiale la propuesta \(✏️\) antes de que la acepte/);
    P.ev("verCliente('C900')");
    assert.match(plano(P.elems.mBody.innerHTML), /⚠️ Vencida: pagaba el .+ y esa fecha ya llegó/);
    const Q = await enCRM(SOLICITUD('aceptada', -2));
    Q.ev("verCliente('C900')");
    const h = Q.elems.mBody.innerHTML;
    assert.match(plano(h), /Cámbiale la propuesta \(✏️\) y que la vuelva a aceptar/);
    assert.ok(h.indexOf("editarContrapropuesta(\\'31\\')") >= 0 || h.indexOf("editarContrapropuesta('31')") >= 0);
    assert.ok(h.indexOf('✏️ Cambiar propuesta') < h.indexOf('Registrar el crédito con lo que aceptó'));
    /* Con la fecha por venir, nada (control). */
    const R = await enCRM(SOLICITUD('contrapropuesta', 20));
    assert.doesNotMatch(plano(R.elems.bandeja.innerHTML), /Vencida/);
  });
});
