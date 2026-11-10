'use strict';
/* ============================================================================
 * LA PROPUESTA EN LA APP, EL REMATE — 10 de noviembre de 2026
 *
 *   node --test pruebas/la-propuesta-en-la-app-remate.test.js
 *
 * Tres cosas que la revisión del 10-nov encontró en app/socio.html con
 * app/propuesta-en-la-app.js (las graves van en la-propuesta-vencida y en
 * una-solicitud-un-credito):
 *   1. aceptada, «Aceptaste: … te la consignamos a …» quedaba a 1.244 px,
 *      debajo de todas las condiciones: ahora va arriba;
 *   2. en la cuenta junta, sin señal, Inicio le pintaba a TODO cliente «No pude
 *      ver si tienes una solicitud…», aunque nunca hubiera pedido: ahora no
 *      dice nada (la cuenta sin juntar sí lo sigue diciendo);
 *   3. si la respuesta de una aceptación buena se perdía y el cliente volvía a
 *      tocar, la base contestaba 'no_esta' y la app decía «No pudimos
 *      registrar tu aceptación», cuando sí había quedado: ahora le pregunta a
 *      la base antes.
 * Los nombres y números son de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
const PROPUESTA = () => ({ id: 9, estado: 'contrapropuesta', app: 'tugarantia', cedula: '3001112222',
  capital: 1500000, pedido_monto: 1500000, pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30) },
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30,
                     costo_pct: 20, texto: 'Te podemos prestar esto', por: 'joan', creada_en: '2026-11-09T15:00:00Z' } });
const ACEPTADA = () => Object.assign(PROPUESTA(), { estado: 'aceptada',
  destino_desembolso: { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: '2026-11-09T15:00:00Z' } });
const CUENTAS = { nequi: '3001112233', cuentas_mias: 'si' };
const CORREO = '573001112222@tugarantia.net';
const JUNTA = { ok: true, vinculada: true, nombre: 'Marta Prueba', actualizado_en: '2026-11-09T10:00:00Z',
  datos: { garantia: { total: 0, acumulada: 0 }, creditos: [], respaldados: [], socio: { codigo: 'CL-0099' }, perfil: { datos: {} },
           referidos: { total: 0, pagaron: 0, lista: [] } } };

/* `responder(fn, cuerpo, n)` contesta cada función; n cuenta las llamadas a esa función. */
async function enSocio(responder, o) {
  o = o || {};
  const veces = {};
  const A = abrirSocio({ red: (url, cuerpo) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
    }
    if (/\/auth\/v1\/logout/.test(url)) return { status: 204 };
    const fn = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    veces[fn] = (veces[fn] || 0) + 1;
    if (fn === 'mi_cuenta') return { status: 200, cuerpo: o.junta ? JUNTA : { ok: true, vinculada: false } };
    if (fn === 'mi_registro') return { status: 200, cuerpo: { ok: true, registro: { estado: 'atendido' } } };
    if (fn === 'chat_leer_sesion') return { status: 200, cuerpo: { ok: true, canal: cuerpo && cuerpo.p_canal, mensajes: [] } };
    const r = responder(fn, cuerpo, veces[fn]);
    return r === undefined ? { status: 404, cuerpo: { message: 'no existe' } } : r;
  } });
  await asentar();
  A.elem('inCel').value = '300 111 2222'; A.elem('inClave').value = 'una-clave-buena';
  A.ev('entrar()');
  await asentar(24);
  return A;
}
const caja = A => A.elem('propuestaCaja').innerHTML
  || (A.ev('PANTALLA') === 'sin_juntar' ? A.elem('entrarCuerpo').innerHTML : A.elem('cuerpo').innerHTML);

describe('1. aceptada: «Aceptaste» va arriba de las condiciones', () => {
  for (const junta of [false, true]) {
    test(junta ? 'en la cuenta junta' : 'en la cuenta sin juntar', async () => {
      const A = await enSocio(fn => (fn === 'mi_solicitud' ? { status: 200, cuerpo: { ok: true, solicitud: ACEPTADA() } } : undefined), { junta });
      const p = plano(caja(A));
      const i = p.indexOf('Aceptaste: $1.200.000.'), j = p.indexOf('Las condiciones de este crédito');
      assert.ok(i >= 0 && j >= 0, 'no pintó la aceptada con sus condiciones');
      assert.ok(i < j, '«Aceptaste» quedó debajo de las condiciones');
      assert.match(p, /Tu crédito, aceptado Aceptaste: \$1\.200\.000\. Te la consignamos a Nequi ···2233 , a tu nombre/);
    });
  }
});

describe('2. la cuenta junta sin señal no le dice a todo el mundo «No pude ver…»', () => {
  for (const estado of [503, 404]) {
    test('mi_solicitud ' + estado + ': Inicio no pinta el aviso; la cuenta sin juntar, sí', async () => {
      const responder = fn => (fn === 'mi_solicitud' ? { status: estado, cuerpo: {} } : undefined);
      const J = await enSocio(responder, { junta: true });
      assert.equal(J.ev('PANTALLA'), 'inicio');
      assert.doesNotMatch(plano(caja(J)), /No pude ver si tienes una solicitud|Todavía no podemos mostrarte aquí tus solicitudes/);
      const S = await enSocio(responder);
      assert.equal(S.ev('PANTALLA'), 'sin_juntar');
      assert.match(plano(caja(S)), estado === 404 ? /Todavía no podemos mostrarte aquí tus solicitudes/ : /No pude ver si tienes una solicitud/);
    });
  }
  test('con su propuesta, la cuenta junta la sigue mostrando (control)', async () => {
    const J = await enSocio(fn => (fn === 'mi_solicitud' ? { status: 200, cuerpo: { ok: true, solicitud: PROPUESTA() } }
      : fn === 'mis_cuentas_de_pago' ? { status: 200, cuerpo: { ok: true, cuentas: CUENTAS } } : undefined), { junta: true });
    assert.match(plano(caja(J)), /Te hicimos una propuesta/);
  });
});

describe('3. «no_esta» después de una respuesta perdida: se pregunta antes de decir que no quedó', () => {
  test('la primera aceptación quedó pero su respuesta se perdió; el segundo toque muestra «Aceptaste»', async () => {
    const A = await enSocio((fn, c, n) => {
      if (fn === 'mi_solicitud') return { status: 200, cuerpo: { ok: true, solicitud: n === 1 ? PROPUESTA() : ACEPTADA() } };
      if (fn === 'mis_cuentas_de_pago') return { status: 200, cuerpo: { ok: true, cuentas: CUENTAS } };
      if (fn === 'aceptar_con_destino') return n === 1 ? null : { status: 200, cuerpo: { ok: false, motivo: 'no_esta' } };
      return undefined;
    });
    A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    assert.match(A.elem('errAceptar').textContent, /No pude conectarme/, 'la primera respuesta perdida no dijo lo de la red');
    A.ev('aceptarContrapropuesta(9);');
    await asentar(12);
    assert.doesNotMatch(A.elem('errAceptar').textContent || '', /No pudimos registrar tu aceptación/);
    assert.match(plano(A.elem('propuestaCaja').innerHTML), /Aceptaste: \$1\.200\.000\./, 'no mostró la aceptación que sí quedó');
    assert.equal(A.ev('momentoSeguroSocio()'), true);
  });

  test('si de verdad no está (la base no la tiene aceptada), lo dice como siempre', async () => {
    const A = await enSocio((fn, c, n) => {
      if (fn === 'mi_solicitud') return { status: 200, cuerpo: { ok: true, solicitud: n === 1 ? PROPUESTA() : null } };
      if (fn === 'mis_cuentas_de_pago') return { status: 200, cuerpo: { ok: true, cuentas: CUENTAS } };
      if (fn === 'aceptar_con_destino') return { status: 200, cuerpo: { ok: false, motivo: 'no_esta' } };
      return undefined;
    });
    A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    assert.match(A.elem('errAceptar').textContent, /No pudimos registrar tu aceptación/);
  });
});
