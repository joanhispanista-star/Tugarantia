/* ============================================================================
 * LOS CIERRES DE LA PUERTA ÚNICA EN LA APP DEL SOCIO — 7 de octubre de 2026
 * (segunda vuelta).
 *
 *   node --test pruebas/una-puerta-cierres-socio.test.js
 *
 * Lo que encontró la revisión del recorrido del cliente, con socio.html
 * arrancada de verdad (banco-socio.js), escrito para que falle con el código
 * de antes:
 *
 *   · entre publicar la app y pegar el SQL, una cuenta sin juntar veía el chat
 *     de la ficha de su número (cobranza incluida);
 *   · el cliente con código que tenía la app abierta perdía su sesión en
 *     silencio y caía en un formulario de contraseña que nunca tuvo, con un pie
 *     que lo mandaba a «Olvidé mi contraseña»;
 *   · «Tus datos de registro no nos llegaron» a quien sí los dejó;
 *   · «Salir» cerraba también PlataChat y play/ en los otros teléfonos;
 *   · la bandeja de Joan no advertía que el hilo «sin juntar» no es él;
 *   · la portada seguía mandando a pegar el código.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');
const SS = require('../app/sesion-socio.js');
const CHAT = require('../app/chat.js');

const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const AHORA = Date.parse('2026-10-07T15:00:00Z');
const CORREO = '573001112222@tugarantia.net';
const tokenDe = extra => Object.assign({ access_token: 'acceso-1', refresh_token: 'renovar-1',
  expires_at: Math.floor(AHORA / 1000) + 3600, user: { email: CORREO } }, extra || {});

function nube(o) {
  o = o || {};
  return (url, cuerpo) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return cuerpo && cuerpo.password === 'mi-clave-buena' ? { status: 200, cuerpo: tokenDe() } : { status: 400, cuerpo: {} };
    }
    if (/\/rest\/v1\/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: false } };
    if (/\/rest\/v1\/rpc\/mi_registro$/.test(url)) return o.miRegistro || { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo' } } };
    if (/\/rest\/v1\/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
    if (/\/rest\/v1\/rpc\/pedir_ayuda_clave$/.test(url)) return { status: 200, cuerpo: { ok: true } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
async function entrarCon(A) {
  A.elem('inCel').value = '300 111 2222'; A.elem('inClave').value = 'mi-clave-buena';
  A.ev('entrar()');
  await asentar(16);
}

describe('mientras la nube no tenga la puerta, la cuenta sin juntar no abre ningún chat', () => {

  test('mi_registro contesta 404: dice la verdad y no lee ni un mensaje', async () => {
    const A = abrirSocio({ red: nube({ miRegistro: { status: 404, cuerpo: { message: 'no existe' } } }), ahora: AHORA });
    await asentar();
    await entrarCon(A);
    const h = A.elem('entrarCuerpo').innerHTML;
    assert.ok(!/id="chHilo"/.test(h), 'abrió el chat: el hilo todavía es el de la ficha de ese número');
    assert.ok(!A.llamadas.some(l => /chat_leer_sesion/.test(l.url)), 'leyó mensajes del hilo de la ficha');
    assert.match(plano(h), /Estamos terminando de encender esta parte de la app/);
  });

  test('con la puerta puesta, la cuenta sin juntar sí tiene su chat (su hilo aparte)', async () => {
    const A = abrirSocio({ red: nube(), ahora: AHORA });
    await asentar();
    await entrarCon(A);
    assert.match(A.elem('entrarCuerpo').innerHTML, /id="chHilo"/);
  });
});

describe('el cliente que entraba con código', () => {

  test('si tenía la app abierta con el código, se le dice qué cambió en vez de borrarle la sesión en silencio', async () => {
    const A = abrirSocio({ red: nube(), ahora: AHORA,
      local: { socio_sesion: JSON.stringify({ cedula: '3001112222', codigo: 'K7QP3' }) } });
    await asentar();
    assert.equal(A.local.getItem('socio_sesion'), null, 'la sesión del código se quedó');
    assert.equal(A.elem('errEntrar').textContent, SS.TEXTOS.cambioDePuerta);
    assert.match(SS.TEXTOS.cambioDePuerta, /ya no se usa el código/);
    assert.match(SS.TEXTOS.cambioDePuerta, /Si nunca te registraste, toca «Registrarme»/);
  });

  test('sin sesión vieja no se le dice nada de eso', async () => {
    const A = abrirSocio({ red: nube(), ahora: AHORA });
    await asentar();
    assert.notEqual(A.elem('errEntrar').textContent, SS.TEXTOS.cambioDePuerta);
  });

  test('el pie da las dos salidas: «Registrarme» para el que nunca se registró', async () => {
    const A = abrirSocio({ red: nube(), ahora: AHORA });
    await asentar();
    const h = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(h, /¿Nunca te registraste\? Toca «Registrarme»/);
    assert.ok(!/¿No puedes entrar\? Toca «Olvidé mi contraseña»\./.test(h), 'manda al que nunca se registró a esperar una contraseña');
  });

  test('el recado de «Olvidé mi contraseña» no promete una contraseña a quien nunca se registró', async () => {
    const A = abrirSocio({ red: nube(), ahora: AHORA });
    await asentar();
    A.ev('olvide()');
    A.elem('ayTel').value = '3001112222';
    A.ev('mandarAyuda()');
    await asentar();
    const h = plano(A.elem('entrarCuerpo').innerHTML);
    assert.match(h, /si nunca te registraste, para decirte cómo hacerlo/);
    assert.ok(!/Cuando te llegue tu contraseña nueva/.test(h));
  });
});

describe('lo que dice la cuenta sin juntar, y lo que hace «Salir»', () => {

  test('sin registro hecho con la cuenta: no se dice «no nos llegaron» (pudo registrarse otro día)', () => {
    const t = SS.textoSinJuntar('sin_registro');
    assert.ok(!/no nos llegaron/.test(t.texto), 'le dice a quien sí se registró que sus datos no llegaron');
    assert.match(t.texto, /Si te registraste antes, en otro intento/);
  });

  test('«Salir» cierra solo esta sesión (scope=local), no las de PlataChat y play/', () => {
    const vistas = [];
    SS.avisarSalida({ url: 'https://x.supabase.co', anon: 'a', fetch: (u, o) => { vistas.push(u); return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') }); } },
      { access_token: 't' });
    assert.equal(vistas[0], 'https://x.supabase.co/auth/v1/logout?scope=local');
  });
});

describe('lo que lee Joan y lo que lee quien llega por la portada', () => {

  test('el hilo «sin juntar» advierte que no es para hablar de la deuda', () => {
    const h = CHAT.listaHTML([{ cedula: '03001112222', nombre: '', ultimo: 'hola', ultimo_de: 'socio',
      ultimo_en: '2026-10-07T15:00:00Z', sin_leer: 1 }], {});
    assert.match(h, /no sabemos si es él: no le hables de su deuda aquí/);
  });

  test('la portada ya no pide código: ni el botón de arriba ni «Cómo entrar»', () => {
    const p = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    assert.ok(!/>Ya tengo código</.test(p), 'el botón de arriba sigue diciendo «Ya tengo código»');
    assert.ok(!/pegas el código|K7QP3/.test(p), '«Cómo entrar» sigue mandando a pegar el código');
    assert.match(p, /No necesitas ningún código/);
  });
});
