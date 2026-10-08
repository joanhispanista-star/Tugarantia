/* ============================================================================
 * JUNTAR UNA CUENTA DESDE EL CELULAR — panel/espejo.html, pestaña Registrados
 * 7 de octubre de 2026.
 *
 *   node --test pruebas/una-puerta-celular.test.js
 *
 * Joan decidió el 7-oct que también puede confirmar «es la misma persona»
 * desde el celular. Lo que se cuida:
 *
 *   1. EL TOQUE SE DA MIRANDO: la hoja enseña la cuenta (y lo raro en ámbar),
 *      «Para mirar, y por qué» de la revisión del teléfono, y dice que las
 *      fotos se ven en el computador. El botón no aparece hasta que la nube
 *      contestó por la cuenta.
 *   2. VA CON LA SESIÓN DE JOAN (panel_vincular_cuenta), con el registro y la
 *      llave de la ficha; lo que se guarda de la revisión no es biométrico.
 *   3. NUNCA SOLO, y sin mentir: si la nube dice que no, lo dice; si falta la
 *      migración, lo dice como falta de un paso.
 *   4. Juntar NO aprueba, no abre ficha, no descarta: la tarjeta sigue sin
 *      esos botones.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');
const PU = require('../app/puente.js');

const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function cartera() {
  return {
    socios: [{ id: 's1', numero: 7, nombre: 'Adriana Antigua Rqp', cedula: '', telefono: '3001112222',
      whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }],
    prestamos: []
  };
}
const FILA = { id: 41, nombre: 'Adriana Registrada', cedula: '', telefono: '3001112222',
  creado_en: '2026-09-15T14:05:00Z', origen: 'abierto', app: 'tugarantia', ciudad: 'Bogotá', barrio: 'Kennedy',
  cotejo: { estado: 'no_cuadra', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false },
  pedido: null };

function nube(o) {
  o = o || {};
  return (url, cuerpo) => {
    if (url.endsWith('/rpc/panel_traer')) {
      return { status: 200, cuerpo: { completo: false, socios: [], creditos: [], respaldados: [], ajustes: [],
        servidor_ahora: '2026-09-15T15:30:00Z' } };
    }
    if (url.endsWith('/rpc/panel_registros')) {
      return { status: 200, cuerpo: { servidor_ahora: '2026-09-15T15:30:00Z', estado: 'nuevo', nuevos: 1,
        pedidos_leidos: true, registros: [FILA] } };
    }
    if (url.endsWith('/rpc/panel_cuentas_de_registros')) {
      return o.cuentas || { status: 200, cuerpo: [{ registro_id: 41, celular: '3001112222', cuenta: true,
        cuenta_creada_en: '2026-09-15T14:04:00Z', minutos_antes_del_registro: 1, recado_abierto: false,
        junta_con: null, verificacion: 'TG-4821' }] };
    }
    if (url.endsWith('/rpc/panel_vincular_cuenta')) {
      return typeof o.vincular === 'function' ? o.vincular(cuerpo)
        : (o.vincular || { status: 200, cuerpo: { ok: true, ya_estaba: false, nombre: 'Adriana Antigua Rqp', celular: '3001112222' } });
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}

async function abrir(o) {
  const e = abrirEspejo(Object.assign({ cartera: cartera(), sesion: true, red: nube(o) }, (o && o.extra) || {}));
  e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
  await asentar();
  e.tocarPestania('registrados');
  e.correrPendientes();
  await asentar();
  return e;
}
const hoja = e => e.elems.hojaCuerpo ? e.elems.hojaCuerpo.innerHTML : '';
const llamadasA = (e, fn) => e.llamadas.filter(l => l.url.endsWith('/rpc/' + fn));

describe('«🔗 Es la misma persona», desde el celular', () => {

  test('la tarjeta lo ofrece junto a «Ya es tu cliente», y no ofrece aprobar ni descartar', async () => {
    const e = await abrir();
    const h = e.cuerpo();
    assert.match(h, /data-acc="reg-juntar" data-id="41" data-socio="s1"/);
    const acciones = new Set([...h.matchAll(/data-acc="([^"]+)"/g)].map(m => m[1]));
    acciones.forEach(a => assert.ok(['reg-traer', 'verficha', 'reg-juntar'].includes(a), 'la pestaña ofrece «' + a + '»'));
  });

  test('la hoja enseña la cuenta, la revisión y lo que NO se ve desde aquí; el botón espera a la nube', async () => {
    const e = await abrir();
    e.tocar('reg-juntar', { id: '41', socio: 's1' });
    assert.ok(!/reg-juntar-ok/.test(hoja(e)), 'el toque salió antes de que la nube contestara por la cuenta');
    assert.match(plano(hoja(e)), /Preguntando a la nube por esa cuenta/);
    await asentar();
    const q = llamadasA(e, 'panel_cuentas_de_registros')[0];
    assert.deepEqual(q.cuerpo, { p_ids: [41] });
    const h = plano(hoja(e));
    assert.match(h, /Si la juntas, la cuenta del 300 111 2222 ve desde ya el historial de CL-0007/);
    assert.match(h, /Para mirar, y por qué/, 'no enseñó las razones de la revisión');
    assert.match(h, /No cuadra|código de barras|cuadra/i);
    assert.match(h, /Las fotos de su cédula y su selfie se ven en el computador: desde aquí no/);
    /* 7-oct-2026 (segunda vuelta): ya no pide «el WhatsApp con el código»
       (play/ dejó de pedirlo el 8-sep): pide llamar al número de la FICHA. */
    assert.match(h, /Tócalo solo si llamaste al 300 111 2222 \(el número de su ficha\)/);
    assert.ok(!/te llegó el WhatsApp con el código/.test(h));
    assert.match(hoja(e), /data-acc="reg-juntar-ok"/);
    /* Nada de fotos ni de IP en la hoja. */
    assert.ok(!/<img|base64|data:image/i.test(hoja(e)));
  });

  test('juntar va con la sesión de Joan, el registro y la llave de la ficha, sin nada biométrico', async () => {
    const e = await abrir();
    e.tocar('reg-juntar', { id: '41', socio: 's1' });
    await asentar();
    e.tocar('reg-juntar-ok');
    await asentar();
    const j = llamadasA(e, 'panel_vincular_cuenta')[0];
    assert.ok(j, 'no llamó a juntar');
    assert.equal(j.cuerpo.p_registro_id, 41);
    assert.equal(j.cuerpo.p_ficha, PU.llaveEnLaNube(cartera().socios[0]));
    assert.ok(!('p_celular' in j.cuerpo) && !('p_clave' in j.cuerpo), 'el teléfono mandó un celular o la clave de sincronización');
    assert.equal(j.cuerpo.p_revision.quien, 'celular');
    assert.ok(Array.isArray(j.cuerpo.p_revision.para_mirar));
    assert.match(plano(hoja(e)), /quedó junta con CL-0007/);
    assert.match(plano(hoja(e)), /se deshace allá: 🔗 Cuentas juntas/);
    /* Nada de esto se guarda en el teléfono. */
    assert.ok(!Object.values(e.almacen).join('\n').includes('TG-4821'));
  });

  test('si la nube dice que no, lo dice con su porqué; sin la migración, que falta un paso', async () => {
    const e = await abrir({ vincular: { status: 200, cuerpo: { ok: false, motivo: 'ficha_con_otra_cuenta', otro_termina_en: '9999' } } });
    e.tocar('reg-juntar', { id: '41', socio: 's1' });
    await asentar();
    e.tocar('reg-juntar-ok');
    await asentar();
    assert.match(plano(hoja(e)), /No la junté\. Esta ficha ya está junta con OTRA cuenta \(un celular que termina en 9999\)/);

    const f = await abrir({ cuentas: { status: 404, cuerpo: { message: 'no existe' } } });
    f.tocar('reg-juntar', { id: '41', socio: 's1' });
    await asentar();
    assert.match(plano(hoja(f)), /pegar base\/20261007_una_puerta\.sql/);
    assert.ok(!/reg-juntar-ok/.test(hoja(f)));
  });

  test('sin panel/una-puerta.js la tarjeta no ofrece juntar', async () => {
    const e = await abrir({ extra: { sin: ['una-puerta.js'] } });
    assert.ok(!/reg-juntar/.test(e.cuerpo()));
    assert.match(e.cuerpo(), /Ya es tu cliente: abrir CL-0007/);
  });
});
