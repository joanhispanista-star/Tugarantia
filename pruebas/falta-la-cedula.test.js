/* ============================================================================
 * FALTA TU CÉDULA — 13 de noviembre de 2026
 *
 *   node --test pruebas/falta-la-cedula.test.js
 *
 * Joan: «el cliente no puso la cédula al momento de registrarse; quiero que
 * cuando él solicite el crédito, o incluso antes, tenga un botón o una alerta
 * que diga que no ha subido la cédula o que la información está incompleta».
 * Y la regla que manda: la cédula NO es obligatoria (decisión del 3-nov;
 * Decreto 1377 de 2013, art. 6). Avisa y ofrece; nunca frena.
 *
 * Con las páginas de verdad en sus bancos (app/socio.html, play/, el CRM):
 *   1. LO QUE SABE: la tarjeta sale solo si la base lo dice
 *      (mis_fotos_del_registro), y no le pide a nadie lo que la ficha de Joan
 *      ya tiene; sin la función (404) o sin señal, no dice nada.
 *   2. LA CUENTA SIN JUNTAR: «Tu información está incompleta» con «Subir mi
 *      cédula»; sin el permiso de datos sensibles, primero ESE permiso (sin
 *      marcar, con la frase y la versión de play/), guardado en la cuenta
 *      antes de subir; la foto sube por registro_archivos_guardar con la
 *      compresión de play/; cada respuesta de la base se dice como es.
 *   3. ANTES DE MANDAR UNA SOLICITUD (la cuenta junta), con «Seguir sin ella».
 *   4. EN LA PROPUESTA, con «puedes aceptar igual»: aceptar sigue igual.
 *   5. SE ACTUALIZA SOLA no recarga con el permiso marcado o una foto subiendo.
 * Los celulares, los nombres y los documentos son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');
const FLC = require('../app/falta-la-cedula.js');
const U = require('../app/cuenta.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* Lo que contesta mis_fotos_del_registro: el registro del 8-nov, solo la selfie. */
const SIN_CEDULA = (extra) => Object.assign({ ok: true,
  registro: { estado: 'atendido', antes_de_la_camara: false, pasaporte: false },
  fotos: { cedula_frente: false, cedula_reverso: false, selfie: true },
  cedula_con_codigo: false, sensibles: true }, extra || {});
const GUARDADA = tipo => ({ ok: true, fotos: 1, guardados: [tipo], descartados: [], rechazadas: [] });

/* ---- socio.html, entrando con su celular y su contraseña ---------------- */
const CORREO = '573001112222@tugarantia.net';
function nube(resp, o) {
  o = o || {};
  return (url, cuerpo, opciones) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return { status: 200, cuerpo: { access_token: 'acceso-1', refresh_token: 'r-1',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: CORREO } } };
    }
    if (/\/auth\/v1\/logout/.test(url)) return { status: 204 };
    if (/\/auth\/v1\/user$/.test(url)) {
      const m = (opciones && opciones.method) || 'GET';
      const r = resp['auth:' + m];
      if (typeof r === 'function') return r(cuerpo);
      /* null: la petición no volvió (el banco la rechaza como un fetch sin red). */
      return Object.prototype.hasOwnProperty.call(resp, 'auth:' + m) ? r : { status: 200, cuerpo: { email: CORREO, user_metadata: {} } };
    }
    const fn = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    if (fn === 'mi_cuenta') {
      return o.junta ? { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Marta Prueba', actualizado_en: '2026-11-12T10:00:00Z',
        datos: { garantia: { total: 300000, acumulada: 0, cupon: 0 }, creditos: [], respaldados: [], socio: { codigo: 'CL-0099' },
                 perfil: { datos: o.ficha || {} }, referidos: { total: 0, pagaron: 0, lista: [] } } } }
        : { status: 200, cuerpo: { ok: true, vinculada: false } };
    }
    if (fn === 'mi_registro') return o.miRegistro || { status: 200, cuerpo: { ok: true, registro: { estado: 'atendido' } } };
    if (fn === 'chat_leer_sesion') return { status: 200, cuerpo: { ok: true, canal: cuerpo && cuerpo.p_canal, mensajes: [] } };
    const r = resp[fn];
    if (typeof r === 'function') return r(cuerpo);
    if (r && r.__estado) return { status: r.__estado, cuerpo: { message: 'no existe' } };
    if (r !== undefined) return { status: 200, cuerpo: r };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
async function entrar(resp, o) {
  const A = abrirSocio({ red: nube(resp, o) });
  await asentar();
  A.elem('inCel').value = '300 111 2222'; A.elem('inClave').value = 'una-clave-buena';
  A.ev('entrar()');
  await asentar(24);
  const rpc = () => A.llamadas.filter(l => /\/rest\/v1\/rpc\//.test(l.url)).map(l => ({ fn: l.url.split('/').pop(), c: l.cuerpo }));
  return { A, rpc };
}
/* La tarjeta como quedó en su caja (el banco crea el elemento al pedirlo). */
const tarjeta = A => plano(A.elem('faltaCedula').innerHTML);
/* Una cámara y un lienzo de mentira dentro del banco: la foto «mide» 1600×1200
   y el JPEG que sale anota su tipo y su calidad. */
const CAMARA = "URL = { createObjectURL: function () { return 'blob:prueba'; }, revokeObjectURL: function () {} };" +
  " window.__dibujo = null; window.__jpeg = null;" +
  " Image = function () { var yo = this; this.width = 0; this.height = 0;" +
  "   Object.defineProperty(this, 'src', { get: function () { return ''; }, set: function (v) { if (!v) return; yo.width = 1600; yo.height = 1200;" +
  "     Promise.resolve().then(function () { if (yo.onload) yo.onload(); }); } }); };" +
  " document.createElement = function (t) { return { width: 0, height: 0," +
  "   getContext: function () { return { drawImage: function (i, x, y, w, h) { window.__dibujo = [w, h]; } }; }," +
  "   toDataURL: function (tipo, q) { window.__jpeg = [tipo, q]; return 'data:image/jpeg;base64,RkFLRQ=='; } }; };";
const elegirFoto = (A, tipo) => A.ev("FLC.foto({ files: [{ name: 'cedula.jpg' }], value: 'C:\\\\fakepath\\\\cedula.jpg' }, '" + tipo + "')");

describe('1 · lo que sabe: la base, y en la cuenta junta también la ficha', () => {
  test('el registro del 8-nov (solo la selfie): faltan los dos lados', () => {
    assert.deepEqual(FLC.plan(SIN_CEDULA()), { mostrar: true, faltan: ['cedula_frente', 'cedula_reverso'], pasaporte: false, conCodigo: false, sensibles: true });
  });
  test('lo que la ficha de Joan ya tiene no se pide (la pegó a mano)', () => {
    assert.deepEqual(FLC.plan(SIN_CEDULA(), { foto_cedula_frente: true }).faltan, ['cedula_reverso']);
    assert.equal(FLC.plan(SIN_CEDULA(), { foto_cedula_frente: true, foto_cedula_reverso: true }).mostrar, false);
  });
  test('no se avisa: registro de antes de la cámara, descartado, sin registro, completo, o una respuesta rara', () => {
    const r = x => SIN_CEDULA({ registro: Object.assign({ estado: 'nuevo', antes_de_la_camara: false, pasaporte: false }, x) });
    assert.equal(FLC.plan(r({ antes_de_la_camara: true })).por, 'antes_de_la_camara');
    assert.equal(FLC.plan(r({ estado: 'descartado' })).por, 'descartado');
    assert.equal(FLC.plan(SIN_CEDULA({ registro: null })).por, 'sin_registro');
    assert.equal(FLC.plan(SIN_CEDULA({ fotos: { cedula_frente: true, cedula_reverso: true, selfie: false } })).por, 'completa');
    [null, {}, { ok: false }, { ok: true }, { ok: true, fotos: 'si' }].forEach(j => assert.equal(FLC.plan(j).mostrar, false, JSON.stringify(j)));
  });
  test('pasaporte: una sola foto, la página con su foto', () => {
    const p = FLC.plan(SIN_CEDULA({ registro: { estado: 'nuevo', antes_de_la_camara: false, pasaporte: true } }));
    assert.deepEqual(p.faltan, ['cedula_frente']);
    assert.match(FLC.queFaltaTexto(p), /pasaporte \(la página con tu foto\)/);
  });
  test('cada respuesta de registro_archivos_guardar, con su nombre', () => {
    assert.equal(FLC.resultadoDe(GUARDADA('cedula_frente'), 'cedula_frente'), 'ok');
    assert.equal(FLC.resultadoDe({ ok: true, guardados: [], descartados: ['cedula_frente'] }, 'cedula_frente'), 'descartada');
    assert.equal(FLC.resultadoDe({ ok: true, guardados: [], rechazadas: [{ tipo: 'cedula_frente', motivo: 'muy_grande' }] }, 'cedula_frente'), 'rechazada');
    /* La rama registro-tope (sin aplicar): lo que no cupo o se frenó vuelve en `en_espera`. */
    assert.equal(FLC.resultadoDe({ ok: true, guardados: [], en_espera: [{ tipo: 'cedula_frente', motivo: 'freno' }] }, 'cedula_frente'), 'freno');
    assert.equal(FLC.resultadoDe({ ok: true, guardados: [], en_espera: [{ tipo: 'cedula_frente', motivo: 'lleno' }] }, 'cedula_frente'), 'lleno');
    assert.equal(FLC.resultadoDe({ ok: false, motivo: 'sin_autorizacion' }, 'cedula_frente'), 'sin_autorizacion');
    assert.equal(FLC.resultadoDe({ ok: false }, 'cedula_frente'), 'sesion');
    assert.equal(FLC.resultadoDe({ ok: true, guardados: ['selfie'] }, 'cedula_frente'), 'no_entro');
  });
  test('la compresión es la de play/ para la cédula (tomarFoto: 900 y 0,6)', () => {
    const PLAY = leer('play/index.html');
    const m = /var tamanos = quiereCodigo \? \[\[(\d+), ([\d.]+)\], \[1600, null\]\] : \[\[(\d+), ([\d.]+)\]\];/.exec(PLAY);
    assert.ok(m, 'cambió cómo play/ comprime la cédula: mira tomarFoto');
    assert.equal(FLC.LADO_MAXIMO, Number(m[1])); assert.equal(FLC.CALIDAD, Number(m[2]));
    assert.equal(FLC.LADO_MAXIMO, Number(m[3])); assert.equal(FLC.CALIDAD, Number(m[4]));
  });
  test('las dos funciones que llama existen en base/ (la nueva, de solo sesión)', () => {
    const base = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).map(f => leer('base/' + f)).join('\n');
    [FLC.FUNCION, FLC.SUBIDA].forEach(fn => assert.match(base, new RegExp('create or replace function public\\.' + fn + '\\(')));
  });
});

describe('2 · la cuenta sin juntar', () => {
  test('el caso del 8-nov: «Tu información está incompleta», con «Subir mi cédula», y nada se frena', async () => {
    const { A, rpc } = await entrar({ mis_fotos_del_registro: SIN_CEDULA() });
    assert.equal(A.ev('PANTALLA'), 'sin_juntar');
    assert.ok(rpc().some(x => x.fn === 'mis_fotos_del_registro'), 'no le preguntó a la base');
    const t = tarjeta(A);
    assert.match(t, /Tu información está incompleta: falta la foto de tu cédula, por los dos lados\./);
    assert.match(t, /No es obligatoria/);
    assert.match(t, /Subir mi cédula/);
    assert.match(t, /Ya la mandé por el chat/);
    /* La pantalla de siempre sigue ahí: el chat y su estado. */
    assert.match(A.elem('entrarCuerpo').innerHTML, /id="sjTit"/);
    assert.match(A.elem('entrarCuerpo').innerHTML, /id="faltaCedula"/);
  });

  test('sin la función en la base (404), sin señal o con una respuesta rara: no dice nada', async () => {
    /* Control: con la respuesta buena, la misma cuenta sí la ve. */
    assert.match(tarjeta((await entrar({ mis_fotos_del_registro: SIN_CEDULA() })).A), /incompleta/);
    for (const r of [{ __estado: 404 }, { __estado: 500 }, { ok: true }, { ok: false }]) {
      const { A } = await entrar({ mis_fotos_del_registro: r });
      assert.equal(tarjeta(A).trim(), '', JSON.stringify(r) + ' → ' + tarjeta(A));
      assert.doesNotMatch(plano(A.elem('entrarCuerpo').innerHTML), /incompleta|Subir mi cédula/);
    }
  });

  test('sin la puerta (mi_registro en 404) ni siquiera pregunta; con ella, sí', async () => {
    const { rpc } = await entrar({ mis_fotos_del_registro: SIN_CEDULA() }, { miRegistro: { status: 404, cuerpo: {} } });
    assert.equal(rpc().some(x => x.fn === 'mis_fotos_del_registro'), false);
    const con = await entrar({ mis_fotos_del_registro: SIN_CEDULA() });
    assert.equal(con.rpc().filter(x => x.fn === 'mis_fotos_del_registro').length, 1);
  });

  test('«Ya la mandé por el chat» la quita en este teléfono, para esta cuenta', async () => {
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA() });
    A.ev('FLC.yaLaMande()');
    assert.equal(tarjeta(A).trim(), '');
    assert.equal(A.local.getItem('tg_cedula_por_chat_3001112222'), '1');
  });

  test('con el permiso dado: elige la foto, se comprime como en play/ y sube por registro_archivos_guardar', async () => {
    const subidas = [];
    const { A, rpc } = await entrar({ mis_fotos_del_registro: SIN_CEDULA(),
      registro_archivos_guardar: c => { subidas.push(c); return { status: 200, cuerpo: GUARDADA(Object.keys(c.p_archivos)[0]) }; } });
    A.ev(CAMARA);
    A.ev('FLC.abrir()');
    let t = tarjeta(A);
    assert.match(t, /La foto de tu cédula/);
    assert.match(t, /El frente/); assert.match(t, /El respaldo/);
    assert.doesNotMatch(A.elem('faltaCedula').innerHTML, /capture=/, 'no deja elegir de la galería');
    assert.match(A.elem('faltaCedula').innerHTML, /type="file" id="flcFoto_cedula_frente" accept="image\/\*"/);
    elegirFoto(A, 'cedula_frente');
    await asentar(12);
    assert.deepEqual(JSON.parse(A.ev('JSON.stringify(window.__dibujo)')), [900, 675], 'no se achicó a 900 por el lado mayor');
    assert.deepEqual(JSON.parse(A.ev('JSON.stringify(window.__jpeg)')), ['image/jpeg', 0.6]);
    assert.equal(subidas.length, 1);
    assert.deepEqual(subidas[0], { p_archivos: { cedula_frente: 'data:image/jpeg;base64,RkFLRQ==' }, p_huella: {} },
      'la subida no es la de play/ (mismos tipos, sin ubicación ni lectura)');
    t = tarjeta(A);
    assert.match(t, /Recibimos el frente\. Falta el otro lado\./);
    assert.doesNotMatch(t, /El frente/, 'sigue pidiendo el frente que ya llegó');
    elegirFoto(A, 'cedula_reverso');
    await asentar(12);
    assert.match(tarjeta(A), /Listo: recibimos tu foto\./);
    /* Con la sesión de la cuenta, como play/. */
    const l = A.llamadas.filter(x => /registro_archivos_guardar$/.test(x.url));
    assert.ok(l.every(x => x.cab.Authorization === 'Bearer acceso-1'));
    assert.deepEqual(rpc().filter(x => x.fn === 'registro_archivos_guardar').map(x => Object.keys(x.c.p_archivos)[0]), ['cedula_frente', 'cedula_reverso']);
  });

  test('sin el permiso de datos sensibles: primero ESE permiso, sin marcar, con la frase y la versión de play/', async () => {
    const puts = [];
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }),
      'auth:GET': { status: 200, cuerpo: { email: CORREO, user_metadata: { telefono: '3001112222',
        autorizacion: { version: '2026-10-19', momento: '2026-11-08T15:20:00.000Z', general: true, sensibles: false } } } },
      'auth:PUT': c => { puts.push(c); return { status: 200, cuerpo: { email: CORREO } }; },
      registro_archivos_guardar: c => ({ status: 200, cuerpo: GUARDADA(Object.keys(c.p_archivos)[0]) }) });
    A.ev('FLC.abrir()');
    const h = A.elem('faltaCedula').innerHTML;
    assert.match(h, /<input type="checkbox" id="flcPermiso"[^>]*>/);
    assert.doesNotMatch(h.match(/<input type="checkbox" id="flcPermiso"[^>]*>/)[0], /\schecked[\s>]/, 'el permiso vino marcado');
    /* La frase de la casilla de play/ (pasoPermiso), letra por letra. */
    const PLAY = leer('play/index.html');
    const frase = 'Autorizo también la foto de mi cédula, la de mi rostro y mi ubicación.';
    assert.ok(PLAY.indexOf("'" + frase + "' +") >= 0, 'cambió la frase de play/: cámbiala en los dos lados');
    assert.ok(h.indexOf(frase) >= 0);
    assert.match(plano(h), /aparte y es opcional/);
    /* Sin marcar no se guarda nada. */
    A.ev('FLC.guardarPermiso()'); await asentar();
    assert.equal(puts.length, 0);
    assert.match(tarjeta(A), /Marca la casilla para seguir/);
    assert.equal(A.llamadas.filter(x => /registro_archivos_guardar$/.test(x.url)).length, 0);
    /* Marcada: GET y PUT de la cuenta, y recién ahí la foto. */
    A.ev('FLC.marcarPermiso(true); FLC.guardarPermiso()'); await asentar(12);
    assert.equal(puts.length, 1);
    const d = puts[0].data;
    assert.equal(d.autorizacion.version, U.VERSION_AUTORIZACION, 'no es la versión de app/cuenta.js (la de play/)');
    assert.equal(d.autorizacion.sensibles, true);
    assert.equal(d.autorizacion.general, true, 'la general es la que ya tenía la cuenta');
    assert.match(d.autorizacion.momento, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(d.autorizaciones.length, 2, 'se perdió el historial');
    assert.equal(d.autorizaciones[0].momento, '2026-11-08T15:20:00.000Z');
    assert.equal(d.telefono, undefined, 'el PUT pisa otros datos de la cuenta');
    assert.match(tarjeta(A), /La foto de tu cédula/);
    const orden = A.llamadas.map(x => (x.metodo || 'GET') + ' ' + x.url.replace(/^.*\/(auth\/v1|rest\/v1\/rpc)\//, ''));
    assert.ok(orden.indexOf('GET user') >= 0 && orden.indexOf('GET user') < orden.indexOf('PUT user'));
  });

  /* 13-nov-2026 (remate) — la revisión: copiar `general: true` de una política
     vieja dejaba escrito que aceptó HOY la general vigente, y en esta pantalla
     solo marcó la de datos sensibles. Esa constancia es la prueba ante la SIC. */
  test('la general de una política vieja no se copia como aceptada hoy: se anota cuál fue, y el historial la guarda', async () => {
    const VIEJA = { version: '2026-08-20', momento: '2026-08-21T10:00:00Z', general: true, sensibles: false };
    assert.notEqual(VIEJA.version, U.VERSION_AUTORIZACION);
    const c = FLC.constancia({ autorizacion: VIEJA }, U, '2026-11-13T15:00:00Z');
    assert.equal(c.autorizacion.version, U.VERSION_AUTORIZACION);
    assert.equal(c.autorizacion.sensibles, true);
    assert.equal(c.autorizacion.general, false, 'quedó escrito que hoy aceptó la política general vigente');
    assert.equal(c.autorizacion.general_version, '2026-08-20');
    assert.equal(U.autorizacionAlDia(c.autorizacion), false, 'la cuenta pasa por aceptada al día');
    assert.deepEqual(c.autorizaciones, [VIEJA, c.autorizacion], 'se perdió la aceptación vieja del historial');
    /* La de la misma versión sí (el registro del 8-nov), y sin autorización previa no hay nada que copiar. */
    const MISMA = { version: U.VERSION_AUTORIZACION, momento: '2026-11-08T15:20:00Z', general: true, sensibles: false };
    const c2 = FLC.constancia({ autorizacion: MISMA }, U, '2026-11-13T15:00:00Z');
    assert.equal(c2.autorizacion.general, true);
    assert.equal(c2.autorizacion.general_version, undefined);
    assert.equal(U.autorizacionAlDia(c2.autorizacion), true);
    const c3 = FLC.constancia({}, U, '2026-11-13T15:00:00Z');
    assert.equal(c3.autorizacion.general, false);
    assert.equal(c3.autorizacion.general_version, undefined);
    /* Y por la pantalla de verdad: lo que viaja en el PUT de la cuenta. */
    const puts = [];
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }),
      'auth:GET': { status: 200, cuerpo: { email: CORREO, user_metadata: { autorizacion: VIEJA } } },
      'auth:PUT': c => { puts.push(c); return { status: 200, cuerpo: { email: CORREO } }; },
      registro_archivos_guardar: c => ({ status: 200, cuerpo: GUARDADA(Object.keys(c.p_archivos)[0]) }) });
    A.ev('FLC.abrir()');
    A.ev('FLC.marcarPermiso(true); FLC.guardarPermiso()'); await asentar(12);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].data.autorizacion.general, false);
    assert.equal(puts[0].data.autorizacion.general_version, '2026-08-20');
    assert.equal(puts[0].data.autorizacion.sensibles, true);
    /* La subida no depende de la general: la base mira solo `sensibles`. */
    assert.match(tarjeta(A), /La foto de tu cédula/);
  });

  test('si el permiso no se puede guardar, no sube nada y lo dice', async () => {
    for (const [r, texto] of [[{ status: 500, cuerpo: {} }, /No pudimos guardar tu permiso/], [null, /No pude confirmar que tu permiso quedó guardado/],
                              [{ status: 401, cuerpo: {} }, /sesión/i]]) {
      const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }), 'auth:PUT': r });
      A.ev(CAMARA);
      A.ev('FLC.abrir(); FLC.marcarPermiso(true); FLC.guardarPermiso()'); await asentar(12);
      assert.match(tarjeta(A), texto);
      assert.match(tarjeta(A), /Antes de la foto, tu permiso/, 'pasó a las fotos sin la constancia');
      assert.equal(A.llamadas.filter(x => /registro_archivos_guardar$/.test(x.url)).length, 0);
    }
  });

  test('cada no de la base se dice como es, y la foto se puede volver a intentar', async () => {
    const casos = [
      [{ ok: true, guardados: [], descartados: ['cedula_frente'] }, /leída por su código de barras/],
      [{ ok: true, guardados: [], rechazadas: [{ tipo: 'cedula_frente', motivo: 'muy_grande' }] }, /No pudimos usar esa foto/],
      [{ ok: true, guardados: [], en_espera: [{ tipo: 'cedula_frente', motivo: 'freno' }] }, /muchas veces seguidas/],
      [{ ok: true, guardados: [], en_espera: [{ tipo: 'cedula_frente', motivo: 'lleno' }] }, /Ahora mismo no podemos recibir fotos/],
      [{ __estado: 404 }, /Todavía no podemos recibir fotos desde aquí/],
      [{ __estado: 500 }, /No pude conectarme, y la foto no se guardó/]
    ];
    for (const [r, texto] of casos) {
      const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA(), registro_archivos_guardar: r });
      A.ev(CAMARA); A.ev('FLC.abrir()');
      elegirFoto(A, 'cedula_frente'); await asentar(12);
      const t = tarjeta(A);
      assert.match(t, texto, JSON.stringify(r));
      assert.doesNotMatch(t, /Recibimos|Listo/, 'dijo que llegó una foto que no entró');
      assert.match(A.elem('faltaCedula').innerHTML, /id="flcBoton_cedula_frente"(?![^>]*disabled)/, 'no deja volver a intentar');
    }
  });

  test('la base dice que falta el permiso (sin_autorizacion): vuelve a pedirlo, no inventa otra causa', async () => {
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA(), registro_archivos_guardar: { ok: false, motivo: 'sin_autorizacion' } });
    A.ev(CAMARA); A.ev('FLC.abrir()');
    elegirFoto(A, 'cedula_frente'); await asentar(12);
    assert.match(tarjeta(A), /Antes de la foto, tu permiso/);
    assert.match(tarjeta(A), /necesitamos primero tu permiso/);
  });

  test('con un lado ya leído por su código: no ofrece un botón que la base va a descartar, ofrece el chat', async () => {
    const { A, rpc } = await entrar({ mis_fotos_del_registro: SIN_CEDULA({ cedula_con_codigo: true,
      fotos: { cedula_frente: false, cedula_reverso: true, selfie: true } }) });
    const t = tarjeta(A);
    assert.match(t, /falta la foto del frente de tu cédula/);
    assert.match(t, /mándala por el chat de la app/);
    assert.doesNotMatch(t, /Subir mi cédula/);
    A.ev('FLC.abrir()');
    assert.equal(rpc().some(x => x.fn === 'registro_archivos_guardar'), false);
  });

  test('«Salir» suelta lo de esta cuenta', async () => {
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA() });
    assert.equal(A.ev('FLC.debeAvisar()'), true);
    A.ev('salir()');
    assert.equal(A.ev('FLC.debeAvisar()'), false);
    assert.equal(A.ev('FLC.estado().estado'), 'sin_preguntar');
  });
});

describe('3 · antes de mandar una solicitud (la cuenta junta)', () => {
  const RESP = () => ({ mis_fotos_del_registro: SIN_CEDULA(), solicitar_por_sesion: { ok: true }, mi_solicitud: { ok: true, solicitud: null } });

  test('en Inicio, la misma tarjeta; y al tocar «Mandar la solicitud», primero la cédula, con «Seguir sin ella»', async () => {
    const { A, rpc } = await entrar(RESP(), { junta: true });
    assert.equal(A.ev('PANTALLA'), 'inicio');
    assert.match(A.elem('faltaCedula').innerHTML, /Tu información está incompleta/);
    A.ev('pedirCredito()');
    const boton = /onclick="(antesDeMandar\(\d+\))"/.exec(A.elem('cuerpo').innerHTML);
    assert.ok(boton, '«Mandar la solicitud» no pasa por antesDeMandar');
    A.ev(boton[1]);
    const h = A.elem('cuerpo').innerHTML;
    assert.equal(A.ev('PANTALLA'), 'pedir');
    assert.match(plano(h), /Antes de mandar tu solicitud/);
    assert.match(plano(h), /puedes mandar tu solicitud igual/);
    assert.match(h, /id="btnSeguirSinElla" onclick="mandarSolicitud\(\d+\)">Seguir sin ella</);
    assert.equal(rpc().some(x => x.fn === 'solicitar_por_sesion'), false, 'mandó antes de que decidiera');
    /* «Seguir sin ella»: la solicitud sale como siempre. */
    A.ev(/onclick="(mandarSolicitud\(\d+\))"/.exec(h)[1]);
    await asentar(12);
    assert.ok(rpc().some(x => x.fn === 'solicitar_por_sesion'), 'la cédula frenó la solicitud');
  });

  test('si la ficha de Joan ya tiene la cédula, no se le pide, y la solicitud sale derecho', async () => {
    const { A, rpc } = await entrar(RESP(), { junta: true, ficha: { foto_cedula_frente: true, foto_cedula_reverso: true } });
    assert.equal(A.elem('faltaCedula').innerHTML.trim(), '');
    A.ev('pedirCredito()');
    A.ev(/onclick="(antesDeMandar\(\d+\))"/.exec(A.elem('cuerpo').innerHTML)[1]);
    await asentar(12);
    assert.ok(rpc().some(x => x.fn === 'solicitar_por_sesion'));
  });

  test('sin la función en la base: la solicitud sale derecho, sin aviso', async () => {
    const r = RESP(); r.mis_fotos_del_registro = { __estado: 404 };
    const { A, rpc } = await entrar(r, { junta: true });
    A.ev('pedirCredito()');
    A.ev(/onclick="(antesDeMandar\(\d+\))"/.exec(A.elem('cuerpo').innerHTML)[1]);
    await asentar(12);
    assert.ok(rpc().some(x => x.fn === 'solicitar_por_sesion'));
    assert.doesNotMatch(plano(A.elem('cuerpo').innerHTML), /incompleta/);
  });

  test('si la sube ahí mismo, el botón deja de decir «sin ella»', async () => {
    const r = RESP();
    r.registro_archivos_guardar = c => ({ status: 200, cuerpo: GUARDADA(Object.keys(c.p_archivos)[0]) });
    const { A } = await entrar(r, { junta: true });
    A.ev(CAMARA);
    A.ev('pedirCredito()');
    A.ev(/onclick="(antesDeMandar\(\d+\))"/.exec(A.elem('cuerpo').innerHTML)[1]);
    A.ev('FLC.abrir()');
    elegirFoto(A, 'cedula_frente'); await asentar(12);
    elegirFoto(A, 'cedula_reverso'); await asentar(12);
    assert.match(tarjeta(A), /Listo: recibimos tu foto/);
    assert.equal(A.elem('btnSeguirSinElla').textContent, 'Mandar la solicitud');
  });
});

describe('4 · en la propuesta: avisa, y aceptar sigue igual', () => {
  const dos = n => (n < 10 ? '0' : '') + n;
  const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
  const PROPUESTA = () => ({ id: 9, estado: 'contrapropuesta', app: 'tugarantia', cedula: '3001112222',
    capital: 500000, pedido_monto: 500000, pedido: { origen: 'play', capital: 500000, fecha_pago: enDias(30) },
    contrapropuesta: { capital: 400000, costo: 80000, total: 480000, fecha_pago: enDias(30), dias: 30,
                       costo_pct: 20, texto: 'Te podemos prestar esto', por: 'joan', creada_en: '2026-11-12T15:00:00Z' } });

  test('la línea sale dentro de la propuesta, y la aceptación sale como siempre', async () => {
    const sol = PROPUESTA();
    const { A, rpc } = await entrar({ mis_fotos_del_registro: SIN_CEDULA(), mi_solicitud: { ok: true, solicitud: sol },
      mis_cuentas_de_pago: { ok: true, cuentas: { nequi: '3001112233', cuentas_mias: 'si' } },
      aceptar_con_destino: { ok: true, solicitud: Object.assign({}, sol, { estado: 'aceptada' }) } });
    /* La caja va dentro de la tarjeta de la propuesta, arriba de la casilla. */
    const prop = A.elem('entrarCuerpo').innerHTML;
    assert.ok(prop.indexOf('id="flcEnPropuesta"') >= 0 && prop.indexOf('id="flcEnPropuesta"') < prop.indexOf('condLeidas'),
      'la propuesta no le deja lugar al aviso');
    const linea = plano(A.elem('flcEnPropuesta').innerHTML);
    assert.match(linea, /Falta la foto de tu cédula, por los dos lados\./);
    assert.match(linea, /puedes aceptar igual/);
    assert.match(linea, /Subir mi cédula/);
    A.ev("marcarCondiciones(true); elegirDestino('0'); aceptarContrapropuesta(9);");
    await asentar(12);
    assert.ok(rpc().some(x => x.fn === 'aceptar_con_destino'), 'la cédula frenó la aceptación');
  });

  test('app/propuesta-en-la-app.js: el extra es un aviso y nada más (si revienta, la propuesta sale igual)', () => {
    const PEA = require('../app/propuesta-en-la-app.js');
    const CS = require('../app/calculadora-solicitud.js');
    const caja = { innerHTML: '' };
    let extra = () => '<div id="aquiElAviso"></div>';
    const d = PEA.crear({ CS, rpc: () => Promise.resolve({ ok: true, solicitud: PROPUESTA() }), caja: () => caja, hoy: () => enDias(0),
      extraPropuesta: s => extra(s) });
    return d.cargar().then(() => {
      d.pintar();
      assert.ok(caja.innerHTML.indexOf('aquiElAviso') >= 0 && caja.innerHTML.indexOf('aquiElAviso') < caja.innerHTML.indexOf('condLeidas'),
        'el aviso no quedó arriba de la casilla');
      assert.match(caja.innerHTML, /btnAceptar/);
      extra = () => { throw new Error('se rompió'); };
      d.pintar();
      assert.match(caja.innerHTML, /btnAceptar/, 'un aviso que revienta se llevó la propuesta');
    });
  });
});

describe('5 · se actualiza sola, y lo que se pinta', () => {
  test('con el permiso marcado o una foto subiendo, no es momento de recargar', async () => {
    let soltar;
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }),
      registro_archivos_guardar: () => new Promise(r => { soltar = () => r({ status: 200, cuerpo: GUARDADA('cedula_frente') }); }) });
    assert.equal(A.ev('momentoSeguroSocio()'), true);
    A.ev('FLC.abrir(); FLC.marcarPermiso(true)');
    assert.equal(A.ev('momentoSeguroSocio()'), false, 'el permiso marcado se iría con la recarga');
    A.ev('FLC.cerrar()');
    assert.equal(A.ev('momentoSeguroSocio()'), true);
    /* Ya con el permiso: una foto en camino. */
    A.ev('FLC.soltar()');
    const { A: B } = await entrar({ mis_fotos_del_registro: SIN_CEDULA(),
      registro_archivos_guardar: () => new Promise(r => { soltar = () => r({ status: 200, cuerpo: GUARDADA('cedula_frente') }); }) });
    B.ev(CAMARA); B.ev('FLC.abrir()');
    /* El paso de las fotos abierto: la cámara del sistema deja la página
       oculta, y una recarga ahí se llevaría la foto al volver. */
    assert.equal(B.ev('momentoSeguroSocio()'), false, 'recargaría con la cámara abierta');
    elegirFoto(B, 'cedula_frente'); await asentar(6);
    assert.equal(B.ev('momentoSeguroSocio()'), false, 'la recarga cortaría la foto subiendo');
    soltar(); await asentar(12);
    assert.match(tarjeta(B), /Recibimos el frente/);
    assert.equal(B.ev('momentoSeguroSocio()'), false, 'todavía falta el respaldo, con el paso abierto');
    B.ev('FLC.cerrar()');
    assert.equal(B.ev('momentoSeguroSocio()'), true, '«Ahora no» no lo soltó');
  });

  test('sin porcentajes ni imágenes en lo que ve el cliente', async () => {
    const { A } = await entrar({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }) });
    const vistas = [A.elem('faltaCedula').innerHTML];
    A.ev('FLC.abrir()'); vistas.push(A.elem('faltaCedula').innerHTML);
    vistas.forEach(h => {
      assert.doesNotMatch(plano(h), /%/);
      assert.doesNotMatch(h, /base64/);
    });
  });

  test('la página pide el módulo con ?v=144, y sw.js lo precarga igual (la página de socio)', () => {
    const SOCIO = leer('app/socio.html'), SW = leer('sw.js');
    assert.match(SOCIO, /<script src="falta-la-cedula\.js\?v=144"><\/script>/);
    assert.match(SOCIO, /<script src="propuesta-en-la-app\.js\?v=144"><\/script>/);
    assert.match(SW, /'app\/falta-la-cedula\.js\?v=144'/);
    assert.match(SW, /'app\/propuesta-en-la-app\.js\?v=144'/);
    assert.match(leer('app/falta-la-cedula.js'), /^[\s\S]*?\(function \(\) \{ try \{ var s = document\.currentScript;/);
  });
});

/* ---- play/: la cuenta de la puerta pública ------------------------------ */
const { abrirPlay } = require('./banco-play.js');
/* fetch de mentira DENTRO de la página: las RPC por su nombre, y la cuenta
   (/auth/v1/user) como «auth:GET» y «auth:PUT». Lo que no está en `resp`
   contesta 404, como una base sin esa función. */
const FETCH_PLAY = "window.__l = []; fetch = function (u, op) { var s = String(u);" +
  " var fn = (/rpc.([a-z_]+)$/.exec(s) || [, ''])[1] || (/auth.v1.user$/.test(s) ? 'auth:' + ((op && op.method) || 'GET') : '');" +
  " window.__l.push({ u: s, fn: fn, c: op && op.body ? JSON.parse(op.body) : null, auth: (op && op.headers && op.headers.Authorization) || '' });" +
  " var r = window.__resp[fn]; var st = r === undefined ? 404 : (r && r.__estado) || 200; var t = st === 200 ? JSON.stringify(r) : '{}';" +
  " return Promise.resolve({ ok: st === 200, status: st, json: function () { return Promise.resolve(JSON.parse(t)); }, text: function () { return Promise.resolve(t); } }); };";
async function enPlay(resp, antes) {
  const P = abrirPlay();
  P.ev('window.__resp = ' + JSON.stringify(resp) + ';' + FETCH_PLAY);
  if (antes) P.ev(antes);
  P.ev('pintarCuenta({ access_token: "token-play", user: { email: "' + CORREO + '", user_metadata: {} } })');
  await asentar(16);
  return { P, l: () => JSON.parse(P.ev('JSON.stringify(window.__l)')), caja: () => plano(P.ev("document.getElementById('faltaCedula').innerHTML")) };
}

describe('6 · la cuenta de play/, con la misma tarjeta', () => {
  test('arriba de las pestañas: «Tu información está incompleta», con la sesión de la cuenta', async () => {
    const { l, caja, P } = await enPlay({ mis_fotos_del_registro: SIN_CEDULA() });
    const p = l().filter(x => x.fn === 'mis_fotos_del_registro');
    assert.equal(p.length, 1, 'no le preguntó a la base');
    assert.equal(p[0].auth, 'Bearer token-play');
    assert.match(caja(), /Tu información está incompleta: falta la foto de tu cédula, por los dos lados\./);
    assert.match(caja(), /Subir mi cédula/);
    /* La caja va antes de la lámina: se ve en Crédito, donde se pide. */
    const cuerpo = P.ev("document.getElementById('cuerpo').innerHTML");
    assert.ok(cuerpo.indexOf('id="faltaCedula"') >= 0 && cuerpo.indexOf('id="faltaCedula"') < cuerpo.indexOf('id="lamina"'));
    /* Solo lee: no frena la recarga sola. */
    assert.ok(JSON.parse(P.ev('JSON.stringify(LECTURAS_QUE_NO_FRENAN)')).indexOf('mis_fotos_del_registro') >= 0);
  });

  test('sin la función en la base (404) no dice nada; con las fotos del registro todavía en la cola, tampoco', async () => {
    assert.equal((await enPlay({})).caja().trim(), '');
    const { caja, l } = await enPlay({ mis_fotos_del_registro: SIN_CEDULA() },
      "colaDe = function (c) { return c === '3001112222' ? { cedula_frente: 'data:image/jpeg;base64,QQ==' } : null; };");
    assert.ok(l().some(x => x.fn === 'mis_fotos_del_registro'));
    assert.equal(caja().trim(), '', 'pide la cédula que va en camino desde este teléfono');
  });

  test('sube con la compresión de play/ (comprimirImagen 900 / 0,6) y por registro_archivos_guardar con su sesión', async () => {
    const { P, l, caja } = await enPlay({ mis_fotos_del_registro: SIN_CEDULA(), registro_archivos_guardar: GUARDADA('cedula_frente') },
      "comprimirImagen = function (f, max, q) { window.__cmp = [max, q]; return Promise.resolve('data:image/jpeg;base64,UExBWQ=='); };");
    P.ev('FLC.abrir()');
    P.ev("FLC.foto({ files: [{ name: 'c.jpg' }], value: 'x' }, 'cedula_frente')");
    await asentar(12);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__cmp)')), [900, 0.6]);
    const s = l().filter(x => x.fn === 'registro_archivos_guardar');
    assert.equal(s.length, 1);
    assert.deepEqual(s[0].c, { p_archivos: { cedula_frente: 'data:image/jpeg;base64,UExBWQ==' }, p_huella: {} });
    assert.equal(s[0].auth, 'Bearer token-play');
    assert.match(caja(), /Recibimos el frente/);
  });

  test('el permiso, por la cuenta de esta sesión, antes de subir', async () => {
    const { P, l } = await enPlay({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }),
      'auth:GET': { email: CORREO, user_metadata: { autorizacion: { version: '2026-10-19', momento: '2026-11-08T15:20:00.000Z', general: true, sensibles: false } } },
      'auth:PUT': { email: CORREO } });
    P.ev('FLC.abrir()');
    P.ev('FLC.marcarPermiso(true); FLC.guardarPermiso()');
    await asentar(12);
    const put = l().filter(x => x.fn === 'auth:PUT');
    assert.equal(put.length, 1);
    assert.equal(put[0].auth, 'Bearer token-play');
    assert.equal(put[0].c.data.autorizacion.sensibles, true);
    assert.equal(put[0].c.data.autorizaciones.length, 2);
    assert.equal(l().filter(x => x.fn === 'registro_archivos_guardar').length, 0, 'subió algo sin una foto');
  });

  test('«Salir» suelta lo que se sabía; y con el permiso marcado no es momento de recargar', async () => {
    const { P } = await enPlay({ mis_fotos_del_registro: SIN_CEDULA({ sensibles: false }) });
    P.ev("irA('historial')");
    assert.equal(P.ev('momentoSeguroPlay()'), true);
    P.ev('FLC.abrir(); FLC.marcarPermiso(true)');
    assert.equal(P.ev('momentoSeguroPlay()'), false, 'la recarga se llevaría el permiso marcado');
    P.ev('salirDeCuenta()');
    assert.equal(P.ev('FLC.estado().estado'), 'sin_preguntar');
  });

  test('play/ pide el módulo con ?v=144', () => {
    assert.match(leer('play/index.html'), /<script src="\.\.\/app\/falta-la-cedula\.js\?v=144"><\/script>/);
  });
});

/* ---- el CRM: la cédula que llegó días después, de punta a punta --------- */
const { abrirPanel } = require('./banco-panel.js');

describe('7 · el CRM se entera: la foto subida días después aparece con lo que ya existe', () => {
  /* La «base» de mentira que comparten la app y el CRM: lo que la app sube
     por registro_archivos_guardar es lo que el CRM trae por
     archivos_de_registro (la misma tabla, sin borrar nada al leer). */
  async function subirDesdeLaApp() {
    const TABLA = { selfie: 'data:image/jpeg;base64,' + 'S'.repeat(40) };
    const { A } = await entrar({
      mis_fotos_del_registro: () => ({ status: 200, cuerpo: SIN_CEDULA({ fotos: {
        cedula_frente: !!TABLA.cedula_frente, cedula_reverso: !!TABLA.cedula_reverso, selfie: !!TABLA.selfie } }) }),
      registro_archivos_guardar: c => { Object.assign(TABLA, c.p_archivos); return { status: 200, cuerpo: GUARDADA(Object.keys(c.p_archivos)[0]) }; } });
    A.ev(CAMARA); A.ev('FLC.abrir()');
    elegirFoto(A, 'cedula_frente'); await asentar(12);
    elegirFoto(A, 'cedula_reverso'); await asentar(12);
    return TABLA;
  }
  /* Como la deja «＋ Abrirle la ficha» desde 📥 Registrados el 8-nov: con la
     selfie y sin la cédula, que no había llegado. */
  const FICHA = () => ({ id: 's1', numero: 1, nombre: 'Ficha Inventada', cedula: '52000111', telefono: '3001112222',
    origen: 'registro_abierto', selfieFoto: 'foto:reg:3001112222/selfie', cedulaFrenteFoto: null, cedulaReversoFoto: null, gestiones: [] });
  const DB = s => ({ socios: [s], prestamos: [], respaldados: [], config: { negocio: 'Tu Garantía' },
    contadores: { cliente: 1, credito: 0, respaldado: 0 }, plantillas: {} });

  test('la ficha que nació sin la cédula la anota al abrirse (traerFotosTardias)', async () => {
    const TABLA = await subirDesdeLaApp();
    assert.ok(TABLA.cedula_frente && TABLA.cedula_reverso, 'la app no subió la cédula');
    const C = abrirPanel();
    C.cargarCartera(DB(FICHA()));
    C.ctx.__tabla = TABLA;
    C.ev("sbListo = function () { return true; }; verCliente = function () { window.__repinto = true; }; _fichaVista = 's1';" +
         ' archivosDe = function (cel) { window.__pidio = cel; return Promise.resolve({ fotos: Object.assign({}, __tabla), huella: {} }); };');
    await C.ev('traerFotosTardias(DB.socios[0])');
    assert.equal(C.ev('window.__pidio'), '3001112222');
    assert.equal(C.ev('DB.socios[0].cedulaFrenteFoto'), 'foto:reg:3001112222/cedula_frente');
    assert.equal(C.ev('DB.socios[0].cedulaReversoFoto'), 'foto:reg:3001112222/cedula_reverso');
    assert.equal(C.ev('window.__repinto'), true, 'la ficha no se volvió a pintar con ellas');
  });

  test('«👁 Ver datos» de 📥 Registrados la muestra, y ya no dice que falta', async () => {
    const TABLA = await subirDesdeLaApp();
    const C = abrirPanel();
    C.ctx.__tabla = TABLA;
    C.ev("sbListo = function () { return true; };" +
         ' archivosDe = function () { return Promise.resolve({ fotos: Object.assign({}, __tabla), huella: { momento: "2026-11-12T10:00:00Z" } }); };');
    const r = { id: 25, nombre: 'Prueba', telefono: '3001112222', app: 'tugarantia', estado: 'atendido', creado_en: '2026-11-08T15:20:00Z',
      datos: { documento: '52000111', fotos_tomadas: 'selfie' }, huella: {} };
    C.ctx.__r = r;
    C.ev("pintarFotosRegistro('3001112222', 'regFotos', __r)");
    await asentar(8);
    const h = C.ev("document.getElementById('regFotos').innerHTML");
    assert.match(h, /Cédula \(frente\)/);
    assert.match(h, /Cédula \(reverso\)/);
    assert.doesNotMatch(plano(h), /Falta la cédula|Pídeselas/, 'dice que falta una cédula que ya llegó');
  });
});
