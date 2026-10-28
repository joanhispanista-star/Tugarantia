/* ============================================================================
 * «TU HISTORIA LABORAL» EN LA APP DEL CLIENTE — 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones-app.test.js
 *
 * El «Lo hago después» del registro tiene que existir de verdad: es la tarjeta
 * de app/socio.html, en la espera de quien todavía no está junto a su
 * historial y en Inicio. Con su sesión, y solo con ella: cada cosa sale con
 * SU token. Si la base no tiene las funciones (404), la tarjeta no aparece.
 * Y la casilla del registro promete «puedo quitarla desde mi cuenta en la
 * app»: aquí se quita.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const AHORA = Date.parse('2026-11-03T15:00:00Z');
const SESION = JSON.stringify({ access_token: 'token-de-ana', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222' });
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
  socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };

/* Una nube de mentira: la cuenta (junta o no), el chat callado, y lo del fondo. */
function nube(o) {
  o = o || {};
  const mia = { ok: true, autorizacion: o.autorizacion || null, archivos: o.archivos || [] };
  return (url, cuerpo) => {
    if (/rpc\/mi_cuenta$/.test(url)) return o.junta
      ? { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Ana Prueba', datos: PAQUETE, actualizado_en: '2026-11-03T14:00:00Z' } }
      : { status: 200, cuerpo: { ok: true, vinculada: false } };
    if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-11-03T14:55:00Z' } } };
    if (/rpc\/chat_/.test(url)) return { status: 200, cuerpo: { ok: true, mensajes: [], servicio: 0, cobranza: 0, creditos: 0, total: 0 } };
    if (/rpc\/pension_/.test(url) && o.apagado) return { status: 404, cuerpo: { message: 'no existe' } };
    if (/rpc\/pension_mia$/.test(url)) return { status: 200, cuerpo: mia };
    if (/rpc\/pension_autorizar$/.test(url)) {
      mia.autorizacion = { fondos: cuerpo.p_fondos, version: cuerpo.p_version, recibida_en: '2026-11-03T15:00:00Z', revocada_en: null };
      return { status: 200, cuerpo: { ok: true, fondos: cuerpo.p_fondos } };
    }
    if (/rpc\/pension_retirar$/.test(url)) {
      const n = mia.archivos.length; mia.archivos = [];
      if (mia.autorizacion) { mia.autorizacion.revocada_en = '2026-11-03T15:05:00Z'; mia.autorizacion.fondos = []; }
      return { status: 200, cuerpo: { ok: true, borrados: n } };
    }
    if (/rpc\/pension_quitar$/.test(url)) { mia.archivos = mia.archivos.filter(a => a.id !== cuerpo.p_id); return { status: 200, cuerpo: { ok: true, borrados: 1 } }; }
    return { status: 404, cuerpo: {} };
  };
}
const pension = A => A.llamadas.filter(l => /rpc\/pension_/.test(l.url));
const cambio = (A, que, valor) => A.elem('hlCuerpo')._oyentes.change.forEach(f => f({ target: {
  getAttribute: k => (k === 'data-hl' ? que : null), checked: valor === true, value: valor, files: [] } }));

describe('dónde aparece', () => {
  test('en la espera (todavía no está junto a su historial), con «Subirla»; pide lo suyo con SU sesión', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube() });
    await asentar(30);
    assert.match(A.elem('entrarCuerpo').innerHTML, /<div id="hlCuenta"><\/div>/);
    const t = plano(A.elem('hlCuenta').innerHTML);
    assert.match(t, /📄 Tu historia laboral · opcional/);
    assert.match(t, /Todavía no nos la das\./);
    assert.match(A.elem('hlCuenta').innerHTML, /id="hlAbrir"[^>]*>Subirla</);
    const l = pension(A);
    assert.equal(l[0].url.replace(/^.*rpc\//, ''), 'pension_mia');
    assert.equal(l[0].cab.Authorization, 'Bearer token-de-ana', 'no la pidió con la sesión del cliente');
  });

  test('en Inicio, a quien ya está junto, también', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ junta: true }) });
    await asentar(30);
    assert.ok(A.visible('pCuenta'));
    assert.match(A.elem('cuerpo').innerHTML, /<div id="hlCuenta"><\/div>/);
    assert.match(plano(A.elem('hlCuenta').innerHTML), /Tu historia laboral/);
  });

  test('si la base todavía no tiene las funciones (404), la tarjeta no aparece: no se ofrece lo que no funciona', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ apagado: true }) });
    await asentar(30);
    assert.equal(A.elem('hlCuenta').innerHTML, '');
    assert.equal(A.ev('HL_APAGADO'), true);
  });

  test('sin sesión no hay tarjeta (ni llamada)', async () => {
    const A = abrirSocio({ ahora: AHORA, red: nube() });
    await asentar(30);
    assert.equal(pension(A).length, 0);
    assert.equal(A.ev('montarHistoriaLaboral(), document.getElementById("hlCuenta").innerHTML'), '');
  });

  test('sin sus archivos (un service worker viejo), no hay tarjeta y la app sigue', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube(), sin: ['historia-laboral.js', 'fondos-pension.js'] });
    await asentar(30);
    assert.ok(A.visible('pEntrar'));
    assert.equal(A.elem('hlCuenta').innerHTML, '');
    assert.equal(pension(A).length, 0);
  });
});

describe('lo que hace, con su sesión', () => {
  test('abierta: la autorización SIN marcar; al marcarla se guarda con su versión, sin fondo todavía', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube() });
    await asentar(30);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    const h = A.elem('hlCuerpo').innerHTML;
    assert.match(h, /<input type="checkbox" id="hlAut" data-hl="aut">/, 'la autorización nació marcada');
    assert.match(plano(h), /No cambia tu garantía/);
    assert.equal(/Lo hago después/.test(h), false, 'en la app no hay «después»: ya es el después');
    cambio(A, 'aut', true);
    await asentar(20);
    const aut = pension(A).find(l => /pension_autorizar$/.test(l.url));
    assert.ok(aut, 'marcar la casilla no guardó la autorización');
    assert.deepEqual(aut.cuerpo.p_fondos, []);
    assert.equal(aut.cuerpo.p_version, '2026-11-03');
    assert.equal(aut.cab.Authorization, 'Bearer token-de-ana');
    assert.match(A.elem('hlCuerpo').innerHTML, /data-hl="fondo" value="colpensiones"/, 'con la autorización no apareció la lista de fondos');
  });

  test('escoger el fondo lo guarda (y Colpensiones con un privado); lo que ya subió se ve con su fecha y se puede quitar', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({
      autorizacion: { fondos: ['colpensiones'], version: '2026-11-03', recibida_en: '2026-11-03T14:00:00Z', revocada_en: null },
      archivos: [{ id: 41, tipo: 'pdf', bytes: 230000, creado_en: '2026-11-03T14:10:00Z' }] }) });
    await asentar(30);
    assert.match(plano(A.elem('hlCuenta').innerHTML), /Ya nos diste 1 PDF\./);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    assert.match(plano(A.elem('hlCuerpo').innerHTML), /PDF · 225 KB · subido el 3-nov/);
    cambio(A, 'fondo', 'porvenir');
    await asentar(20);
    const aut = pension(A).filter(l => /pension_autorizar$/.test(l.url)).pop();
    assert.deepEqual(aut.cuerpo.p_fondos, ['colpensiones', 'porvenir']);
    /* El toque en «Quitar»: el banco no tiene DOM, así que se le da al oyente
       de la caja un botón de mentira con sus atributos. */
    A.elem('hlCuerpo').contains = () => true;
    A.elem('hlCuerpo')._oyentes.click.forEach(f => f({ target: { closest: () => ({ getAttribute: k => (k === 'data-hl' ? 'quitar' : k === 'data-id' ? '41' : null) }) } }));
    await asentar(20);
    const q = pension(A).find(l => /pension_quitar$/.test(l.url));
    assert.ok(q, 'quitar no salió');
    assert.equal(q.cuerpo.p_id, 41);
  });

  test('RETIRAR la autorización (Ley 1581): un toque, y se borra todo lo subido', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({
      autorizacion: { fondos: ['skandia'], version: '2026-11-03', recibida_en: '2026-11-03T14:00:00Z', revocada_en: null },
      archivos: [{ id: 7, tipo: 'png', bytes: 1000, creado_en: '2026-11-03T14:10:00Z' }] }) });
    await asentar(30);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    assert.match(A.elem('hlCuenta').innerHTML, /id="hlRetirar"[^>]*>Retirar mi autorización y borrar mi historia laboral</);
    A.elem('hlRetirar')._oyentes.click[0]();
    await asentar(20);
    assert.ok(pension(A).some(l => /pension_retirar$/.test(l.url)), 'retirar no salió');
    assert.match(plano(A.elem('hlCuerpo').innerHTML), /Listo: borramos tu historia laboral y quitamos tu autorización\./);
    assert.match(plano(A.elem('hlCuenta').innerHTML), /Todavía no nos la das\./);
  });
});
