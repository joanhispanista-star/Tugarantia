/* ============================================================================
 * LOS CIERRES DE LA PUERTA ÚNICA EN EL CELULAR — panel/espejo.html
 * 7 de octubre de 2026 (segunda vuelta).
 *
 *   node --test pruebas/una-puerta-cierres-celular.test.js
 *
 * Lo que encontraron las revisiones en la hoja «¿Es la misma persona?» del
 * celular de Joan, escrito para que falle con el código de antes:
 *
 *   · la hoja pedía «el WhatsApp con el código V-…», que nadie manda;
 *   · juntar no mandaba el nombre de la ficha (la nube no podía ver que la
 *     fila de esa llave era de otra persona);
 *   · con una cuenta abierta antes que el registro ofrecía el toque igual;
 *   · `.replace(/D/g, '')` en vez de /\D/g: con espacios o un 57 delante, «la
 *     cuenta del …» salía con otro número;
 *   · «Cliente nuevo» decía que el código de acceso se llena en el computador.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ESPEJO = fs.readFileSync(path.join(__dirname, '..', 'panel', 'espejo.html'), 'utf8');

function cartera() {
  return {
    socios: [{ id: 's1', numero: 7, nombre: 'Adriana Antigua Rqp', cedula: '', telefono: '3001112222',
      whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }],
    prestamos: []
  };
}
const FILA = { id: 41, nombre: 'Adriana Registrada', cedula: '', telefono: '+57 300 111 2222',
  creado_en: '2026-09-15T14:05:00Z', origen: 'abierto', app: 'tugarantia', ciudad: 'Bogotá', barrio: 'Kennedy',
  cotejo: null, pedido: null };
const CUENTA = { registro_id: 41, celular: '3001112222', cuenta: true, cuenta_creada_en: '2026-09-15T14:04:00Z',
  minutos_antes_del_registro: 1, recado_abierto: false, junta_con: null, verificacion: 'V-48211' };

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
    if (url.endsWith('/rpc/panel_cuentas_de_registros')) return { status: 200, cuerpo: [o.cuenta || CUENTA] };
    if (url.endsWith('/rpc/panel_vincular_cuenta')) return { status: 200, cuerpo: { ok: true, ya_estaba: false, celular: '3001112222' } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
async function abrir(o) {
  const e = abrirEspejo({ cartera: cartera(), sesion: true, red: nube(o) });
  e.ev("document.querySelector=function(s){return s==='.hoja-caja'?{scrollTop:0}:null}");
  await asentar();
  e.tocarPestania('registrados');
  e.correrPendientes();
  await asentar();
  e.tocar('reg-juntar', { id: '41', socio: 's1' });
  await asentar();
  return e;
}
const hoja = e => e.elems.hojaCuerpo ? e.elems.hojaCuerpo.innerHTML : '';
const llamadasA = (e, fn) => e.llamadas.filter(l => l.url.endsWith('/rpc/' + fn));

describe('la hoja del celular, después de la revisión', () => {

  test('pide llamar al número de la ficha, no el WhatsApp con el código, y no enseña el código', async () => {
    const e = await abrir();
    const h = plano(hoja(e));
    assert.match(h, /Tócalo solo si llamaste al 300 111 2222 \(el número de su ficha\)/);
    assert.ok(!/WhatsApp con el código|Código de verificación|V-48211/.test(h));
  });

  test('«la cuenta del …» sale con el número bien aunque el registro lo traiga con espacios y 57', async () => {
    const e = await abrir();
    assert.match(plano(hoja(e)), /Si la juntas, la cuenta del 300 111 2222 ve desde ya/);
    assert.ok(!/replace\(\/D\/g/.test(ESPEJO), 'quedó una expresión que quita la letra D en vez de lo que no es dígito');
  });

  test('juntar manda el nombre de la ficha para que la nube lo compare con el de la fila', async () => {
    const e = await abrir();
    e.tocar('reg-juntar-ok');
    await asentar();
    assert.equal(llamadasA(e, 'panel_vincular_cuenta')[0].cuerpo.p_nombre, 'Adriana Antigua Rqp');
  });

  test('con una cuenta abierta días antes del registro, no ofrece el toque: manda a la clave nueva en el computador', async () => {
    const e = await abrir({ cuenta: Object.assign({}, CUENTA, { minutos_antes_del_registro: 4320 }) });
    assert.ok(!/reg-juntar-ok/.test(hoja(e)), 'ofreció juntar con un toque una cuenta abierta 3 días antes');
    assert.match(plano(hoja(e)), /Clave nueva al número de su ficha/);
  });

  test('«Cliente nuevo» ya no habla del código de acceso', () => {
    assert.ok(!/<b>código de acceso<\/b> con el que el cliente entra/.test(ESPEJO));
  });
});
