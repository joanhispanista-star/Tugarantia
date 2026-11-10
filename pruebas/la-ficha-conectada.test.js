'use strict';
/* ============================================================================
 * LA FICHA SABE LO QUE PIDIÓ — 9 de noviembre de 2026
 *
 *   node --test pruebas/la-ficha-conectada.test.js
 *
 * Una clienta pidió en play/, Joan le propuso y ella no veía la propuesta (su
 * app no preguntaba: pruebas/la-propuesta-en-la-app.test.js). Joan, sin
 * «✅ Aceptó» a la vista, fue a su ficha, tocó «＋ Nuevo crédito» y lo
 * registró desde cero: la ficha no decía qué había pedido ni qué se le había
 * propuesto, el crédito no llevó lo aceptado y la solicitud se quedó colgando.
 *
 * Con el CRM de verdad (banco-panel.js) y una nube de mentira:
 *   1. la ficha trae «Lo que pidió»: lo pedido, lo propuesto, en qué va y los
 *      mismos botones de la bandeja; aceptada, «Registrar el crédito con lo
 *      que aceptó» registra lo que aceptó (crearDesdeSolicitud);
 *   2. si la cuenta de su registro no está junta, lo dice con el botón de
 *      juntar que ya existe, y no la junta sola;
 *   3. «＋ Nuevo crédito» y el formulario de Créditos avisan ANTES si hay una
 *      propuesta abierta, con las dos salidas;
 *   4. al crear la ficha desde la solicitud se ofrece juntar la cuenta;
 *   5. el CRM no dice «en su app la ve» de lo que su app no puede mostrar.
 * Los nombres y números son de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const CEL = '3001112222';
const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };

const MARTA = { id: 'C900', numero: 90, nombre: 'Marta Prueba', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [], fechaRegistro: '2026-11-09T10:00:00Z', origen: 'registro_abierto' };
/* Como la trae listar_solicitudes_abiertas: con su celular en cedula y celular
   (solicitar_a_la_medida), el registro del que nació y la propuesta de Joan. */
const SOLICITUD = () => ({ id: 31, nombre: 'Marta Prueba', cedula: CEL, celular: CEL, estado: 'contrapropuesta', app: 'tugarantia',
  capital: 1500000, pedido_monto: 1500000, producto: 'quincenal', registro_id: 55, fecha_corte: enDias(30),
  pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30), dias: 30 }, datos: { nombres: 'Marta', apellidos: 'Prueba', celular: CEL },
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30, costo_pct: 20,
                     texto: '', por: 'joan', creada_en: '2026-11-09T15:00:00Z' } });
const aceptada = sol => Object.assign(sol, { estado: 'aceptada', aceptada_en: '2026-11-09T16:00:00Z',
  contrapropuesta: Object.assign(sol.contrapropuesta, { condiciones: { version: '2026-10-22', aceptadas_en: '2026-11-09T16:00:00Z',
    lineas: [{ clave: 'recibes', k: 'Recibes', v: '$1.200.000' }, { clave: 'total', k: 'Total a pagar', v: '$1.440.000' }],
    tope_mora: null, base: { capital: 1200000, total: 1440000, fecha_pago: sol.contrapropuesta.fecha_pago, creada_en: sol.contrapropuesta.creada_en } } }),
  destino_desembolso: { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: sol.contrapropuesta.creada_en } });

function nube(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)),
    json: () => Promise.resolve(cuerpo) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    let cuerpo = null; try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    if (fn === 'listar_solicitudes_abiertas') return Promise.resolve(resp(200, (o.solicitudes || []).map(x => JSON.parse(JSON.stringify(x)))));
    if (fn === 'listar_ayudas_clave') return Promise.resolve(resp(200, []));
    if (fn === 'marcar_solicitud' || fn === 'marcar_registro') return Promise.resolve(resp(200, { ok: true }));
    if (fn === 'archivos_de_registro' || fn === 'registro_archivos') return Promise.resolve(resp(200, { ok: true, fotos: {}, huella: null }));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas };
}
async function montar(o) {
  o = o || {};
  const N = nube(o);
  const P = abrirPanel({ red: N.red });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera({ socios: (o.socios || [MARTA]).map(x => JSON.parse(JSON.stringify(x))), prestamos: [], config: { negocio: 'Tu Garantía' } });
  P.ev('traerSolicitudes(true)');
  await asentar();
  return { P, N };
}
const ficha = P => P.elems.mBody.innerHTML;

describe('1. la ficha trae «Lo que pidió»', () => {
  test('con la propuesta esperando: lo pedido, lo propuesto, «📨 Esperando que acepte» y «✏️ Cambiar propuesta»', async () => {
    const { P } = await montar({ solicitudes: [SOLICITUD()] });
    P.ev("verCliente('C900')");
    const h = ficha(P), t = plano(h);
    assert.match(t, /Lo que pidió/);
    assert.match(t, /Pidió \$1\.500\.000 para pagar el/);
    assert.match(t, /le propusiste \$1\.200\.000 y devuelve \$1\.440\.000 el/);
    assert.match(t, /📨 Esperando que acepte/);
    assert.match(h, /onclick="editarContrapropuesta\('31'\)">✏️ Cambiar propuesta/);
    assert.doesNotMatch(h, /Registrar el crédito con lo que aceptó/, 'ofrece registrar lo que todavía no acepta');
  });

  test('sin propuesta: «✏️ Proponer», que abre el formulario de siempre', async () => {
    const sol = SOLICITUD(); sol.estado = 'nueva'; sol.contrapropuesta = null;
    const { P } = await montar({ solicitudes: [sol] });
    P.ev("verCliente('C900')");
    assert.match(ficha(P), /onclick="editarContrapropuesta\('31'\)">✏️ Proponer/);
    assert.match(plano(ficha(P)), /todavía sin propuesta/);
  });

  test('aceptada: «Registrar el crédito con lo que aceptó» registra lo que aceptó, con su techo y a dónde consignar', async () => {
    const { P, N } = await montar({ solicitudes: [aceptada(SOLICITUD())] });
    P.ev("verCliente('C900')");
    const h = ficha(P);
    assert.match(plano(h), /✅ Aceptó/);
    assert.match(plano(h), /Consignar a: Nequi 300 111 2233/);
    assert.match(h, /onclick="cerrarModal\(\);crearDesdeSolicitud\('31'\)">Registrar el crédito con lo que aceptó/);
    P.ev("cerrarModal();crearDesdeSolicitud('31')");
    await asentar();
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
    assert.equal(p.length, 1, 'no registró el crédito');
    assert.equal(p[0].socioId, 'C900');
    assert.equal(p[0].capital, 1200000, 'no registró lo que aceptó');
    assert.equal(p[0].cicloActual, SOLICITUD().contrapropuesta.fecha_pago);
    assert.equal(p[0].origen, 'solicitud');
    assert.deepEqual(p[0].consignarA && p[0].consignarA.numero, '3001112233');
    assert.ok(N.vistas.some(v => v.fn === 'marcar_solicitud' && v.cuerpo && v.cuerpo.p_estado === 'atendida' && Number(v.cuerpo.p_id) === 31),
      'la solicitud no se marcó atendida en la nube');
  });

  test('la ficha abierta antes de que llegue la nube dice que pregunta, y se repinta sola al llegar', async () => {
    const N = nube({ solicitudes: [SOLICITUD()] });
    const P = abrirPanel({ red: N.red });
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
    P.cargarCartera({ socios: [JSON.parse(JSON.stringify(MARTA))], prestamos: [], config: {} });
    P.ev("verCliente('C900')");
    assert.match(plano(ficha(P)), /Preguntando a la nube qué pidió/);
    assert.ok(N.vistas.some(v => v.fn === 'listar_solicitudes_abiertas'), 'abrir la ficha no le preguntó a la nube');
    await asentar();
    assert.match(plano(P.elems.fichaPidio.innerHTML), /📨 Esperando que acepte/, 'la ficha no se repintó con lo que llegó');
  });

  test('sin nada pedido, la ficha no pinta el bloque', async () => {
    const { P } = await montar({ solicitudes: [] });
    P.ev("verCliente('C900')");
    assert.doesNotMatch(plano(ficha(P)), /Lo que pidió/);
    assert.match(ficha(P), /id="fichaPidio"/);
  });
});

describe('2. la cuenta de su registro, sin juntar: se dice, con el botón que ya existe', () => {
  test('sin juntar desde este computador: el aviso y «🔗 Buscar su registro»; no junta nada solo', async () => {
    const { P, N } = await montar({ solicitudes: [SOLICITUD()] });
    P.ev("verCliente('C900')");
    const h = ficha(P);
    assert.match(plano(h), /Su cuenta de la app \(el 300 111 2222\) no está junta con esta ficha desde este computador/);
    assert.match(h, /onclick="buscarRegistroParaJuntar\('C900'\)"[^>]*>🔗 Buscar su registro/);
    assert.equal(N.vistas.some(v => /^vincular/.test(v.fn || '')), false, 'juntó la cuenta sola');
  });

  test('junta con esta ficha: no hay aviso', async () => {
    const m = Object.assign({}, MARTA, { cuentaJunta: { celular: CEL, fecha: '2026-11-09', registro_id: 55, por: 'crm' } });
    const { P } = await montar({ socios: [m], solicitudes: [SOLICITUD()] });
    P.ev("verCliente('C900')");
    assert.match(plano(ficha(P)), /Lo que pidió .*📨 Esperando que acepte/, 'no pintó lo que pidió');
    assert.doesNotMatch(plano(ficha(P)), /no está junta con esta ficha/);
  });

  test('pedida por una cuenta sin juntar con el celular de esta ficha: el aviso de no prestarle hasta juntarla', async () => {
    const sol = SOLICITUD(); sol.cuenta_sin_juntar = true;
    const m = Object.assign({}, MARTA, { cuentaPorJuntar: { registro_id: 55, desde: '2026-11-09' } });
    const { P } = await montar({ socios: [m], solicitudes: [sol] });
    P.ev("verCliente('C900')");
    const h = ficha(P);
    assert.match(plano(h), /no está junta con esta ficha\. Ese celular es el de esta ficha, pero no sabemos si la cuenta es de esta persona/);
    assert.match(h, /onclick="juntarPendienteAhora\('C900'\)">🔗 Juntar su cuenta/);
  });
});

describe('3. «＋ Nuevo crédito» con una propuesta abierta avisa antes', () => {
  test('desde la ficha: el aviso con las dos salidas, y «Registrarlo a mano igual» abre el formulario', async () => {
    const { P } = await montar({ solicitudes: [SOLICITUD()] });
    P.ev("nuevoCredito('C900')");
    const t = plano(ficha(P));
    assert.equal(P.elems.mTitle.textContent, 'Antes de registrarlo a mano · Marta Prueba');
    /* 10-nov-2026 — todavía no la aceptó: «lo que aceptó» no era verdad (revisión del 10-nov). */
    assert.match(t, /Un crédito a mano no lleva lo que le propusiste/);
    assert.doesNotMatch(t, /no lleva lo que aceptó/);
    assert.match(t, /Lo bueno: esperar a que la acepte/);
    /* 10-nov-2026 — y ya no queda abierta sin preguntar (pruebas/una-solicitud-un-credito.test.js). */
    assert.match(t, /Al terminar te pregunto si cierro la propuesta\. Ciérrala: si queda abierta, su app se la sigue ofreciendo/);
    assert.match(ficha(P), /onclick="nuevoCredito\('C900',true\)">Registrarlo a mano igual/);
    P.ev("nuevoCredito('C900',true)");
    assert.match(ficha(P), /id="qCap"/, '«Registrarlo a mano igual» no abrió el formulario');
    /* Y ya avisado, guardar no vuelve a preguntar lo mismo. */
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return true; };
    const el = id => P.ctx.document.getElementById(id);
    el('qNombre').value = 'Marta Prueba'; el('qTel').value = CEL; el('qCap').value = '500000';
    el('qFecha').value = P.ev('hoyISO()'); el('qCosto').value = '20';
    P.ev('guardarRapido()');
    assert.equal(preguntas.some(m => /tiene una propuesta abierta/.test(m)), false, 'preguntó dos veces lo mismo');
    assert.equal(JSON.parse(P.ev('JSON.stringify(DB.prestamos)')).length, 1, 'no lo registró a mano');
    /* Sin propuesta abierta, «＋ Nuevo crédito» abre el formulario de siempre. */
    const { P: Q } = await montar({ solicitudes: [] });
    Q.ev("nuevoCredito('C900')");
    assert.match(ficha(Q), /id="qCap"/);
  });

  test('aceptada: la salida buena es «Registrar el crédito con lo que aceptó»', async () => {
    const { P } = await montar({ solicitudes: [aceptada(SOLICITUD())] });
    P.ev("nuevoCredito('C900')");
    assert.match(plano(ficha(P)), /Lo bueno: registrarlo desde la solicitud/);
    assert.match(ficha(P), /crearDesdeSolicitud\('31'\)">Registrar el crédito con lo que aceptó/);
  });

  test('desde Créditos, al guardar con su celular: pregunta antes, y con «No» no registra nada', async () => {
    const { P } = await montar({ solicitudes: [SOLICITUD()] });
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev('nuevoCredito()');
    const el = id => P.ctx.document.getElementById(id);
    el('qNombre').value = 'Marta Prueba'; el('qTel').value = CEL; el('qCap').value = '500000';
    el('qFecha').value = P.ev('hoyISO()'); el('qCosto').value = '20';
    P.ev('guardarRapido()');
    assert.ok(preguntas.length >= 1, 'no preguntó');
    assert.match(preguntas[0], /Marta Prueba tiene una propuesta abierta/);
    assert.match(preguntas[0], /Si lo registras a mano, al terminar te pregunto si cierro la propuesta\. Ciérrala: si queda abierta, su app se la sigue ofreciendo/);
    assert.equal(JSON.parse(P.ev('JSON.stringify(DB.prestamos)')).length, 0, 'registró con «No»');
  });

  test('«＋ Con garantía» a mano desde la ficha, igual', async () => {
    const { P } = await montar({ solicitudes: [SOLICITUD()] });
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev("nuevoRespaldado('C900')");
    assert.match(preguntas[0] || '', /tiene una propuesta abierta/);
  });
});

describe('4. al crear la ficha desde la solicitud se ofrece juntar la cuenta', () => {
  test('con su sí, la cuenta queda por juntar (como al abrirle la ficha desde Registrados); sin él, no', async () => {
    for (const si of [true, false]) {
      const { P } = await montar({ socios: [], solicitudes: [aceptada(SOLICITUD())] });
      const preguntas = [];
      P.ctx.confirm = m => { preguntas.push(String(m)); return /Junto también su cuenta/.test(m) ? si : true; };
      P.ev("crearDesdeSolicitud('31')");
      await asentar();
      assert.ok(preguntas.some(m => /¿Junto también su cuenta de la app \(el 300 111 2222\) con esa ficha\?/.test(m)), 'no ofreció juntar la cuenta');
      const s = JSON.parse(P.ev('JSON.stringify(DB.socios)'));
      assert.equal(s.length, 1, 'no creó la ficha');
      assert.deepEqual(s[0].cuentaPorJuntar ? s[0].cuentaPorJuntar.registro_id : null, si ? 55 : null, si ? 'dijo que sí y no quedó por juntar' : 'dijo que no y quedó por juntar');
    }
  });
});

describe('5. el CRM no promete «en su app la ve» de lo que su app no puede mostrar', () => {
  test('la que quedó con su cédula (pedida desde su cuenta junta): se dice que su app no la ve', async () => {
    const m = Object.assign({}, MARTA, { cedula: '52123456' });
    const sol = SOLICITUD(); sol.cedula = '52123456'; sol.celular = null; sol.pedido = null;
    const { P } = await montar({ socios: [m], solicitudes: [sol] });
    assert.equal(P.ev('laVeEnSuApp(_solicitudes[0])'), false);
    P.ev("verCliente('C900')");
    assert.match(plano(ficha(P)), /su app solo muestra las que quedan con su celular: hoy no la va a ver/);
    const avisos = [];
    P.ctx.alert = x => avisos.push(String(x));
    P.ev("crearDesdeSolicitud('31')");
    assert.doesNotMatch(avisos.join('\n'), /Cuando la acepte desde su app/);
    assert.match(avisos.join('\n'), /hoy no la va a ver ni a poder aceptarla desde ahí/);
    /* En la bandeja y al cambiarle la propuesta, lo mismo. */
    P.ev('renderBandeja()');
    assert.match(plano(P.elems.bandeja.innerHTML), /📨 Esperando que acepte .*hoy no la va a ver/);
    P.ev("editarContrapropuesta('31')");
    assert.match(plano(ficha(P)), /hoy no la va a ver ni a poder aceptarla desde ahí/);
    /* Y la de su celular (play/) sí la ve: ahí el aviso de siempre es verdad. */
    const { P: Q } = await montar({ solicitudes: [SOLICITUD()] });
    assert.equal(Q.ev('laVeEnSuApp(_solicitudes[0])'), true);
    const avisosQ = [];
    Q.ctx.alert = x => avisosQ.push(String(x));
    Q.ev("crearDesdeSolicitud('31')");
    assert.match(avisosQ.join('\n'), /Cuando la acepte desde su app te aparece «✅ Aceptó»/);
    Q.ev('renderBandeja()');
    assert.doesNotMatch(plano(Q.elems.bandeja.innerHTML), /hoy no la va a ver/);
  });
});
