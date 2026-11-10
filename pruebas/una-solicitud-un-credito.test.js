'use strict';
/* ============================================================================
 * UNA SOLICITUD, UN CRÉDITO — 10 de noviembre de 2026
 *
 *   node --test pruebas/una-solicitud-un-credito.test.js
 *
 * La revisión del 10-nov llegó a DOS créditos por una sola solicitud: Joan
 * registra a mano («Registrarlo a mano igual») y la propuesta queda abierta;
 * desde v143 su app la muestra con «Acepto», ella acepta, y la ficha le ofrece
 * «Registrar el crédito con lo que aceptó» sin saber que ya había uno. Y dos
 * caminos más: aceptada + a mano (la solicitud nunca se cerraba), y el cliente
 * NUEVO del formulario de Créditos, que registraba sin ningún aviso.
 *
 * Con el CRM de verdad (banco-panel.js) y una nube de mentira:
 *   1. después de un crédito a mano se pregunta si se cierra la propuesta; con
 *      el sí queda 'atendida' en la nube y sale de la bandeja;
 *   2. si quedó abierta y ella la acepta, la ficha dice «Ya le registraste…» y
 *      ofrece cerrarla, y registrar otro pide un sí explícito;
 *   3. el formulario de Créditos avisa también sin ficha, por el celular;
 *   4. «＋ Nuevo préstamo con garantía» desde Créditos pregunta igual.
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
const CREADA = '2026-11-09T15:00:00Z';

const FICHA = () => ({ id: 'C900', numero: 90, nombre: 'Marta Prueba', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [], fechaRegistro: '2026-11-08T10:00:00Z', origen: 'registro_abierto' });
const SOL = o => Object.assign({ id: 31, nombre: 'Marta Prueba', cedula: CEL, celular: CEL, estado: 'contrapropuesta', app: 'tugarantia', origen: 'nube',
  capital: 1500000, pedido_monto: 1500000, producto: 'quincenal', registro_id: 55, fecha_corte: enDias(30),
  pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30), dias: 30 }, datos: {},
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30, costo_pct: 20,
                     texto: '', por: 'joan', creada_en: CREADA } }, o || {});
const ACEPTADA = () => {
  const s = SOL({ estado: 'aceptada', aceptada_en: '2026-11-09T16:00:00Z' });
  s.contrapropuesta.condiciones = { version: '2026-10-22', aceptadas_en: '2026-11-09T16:00:00Z',
    lineas: [{ clave: 'recibes', k: 'Recibes', v: '$1.200.000' }], tope_mora: null,
    base: { capital: 1200000, total: 1440000, fecha_pago: s.contrapropuesta.fecha_pago, creada_en: CREADA } };
  s.destino_desembolso = { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: CREADA };
  return s;
};

function nube(lista) {
  const marcas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    let c = null; try { c = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { c = null; }
    if (fn === 'listar_solicitudes_abiertas') return Promise.resolve(resp(200, lista().map(x => JSON.parse(JSON.stringify(x)))));
    if (fn === 'marcar_solicitud' || fn === 'marcar_registro') { marcas.push({ fn, c }); return Promise.resolve(resp(200, { ok: true })); }
    if (/^listar_/.test(fn || '')) return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, marcas };
}
async function montar(lista, cartera) {
  const N = nube(lista);
  const P = abrirPanel({ red: N.red });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera(Object.assign({ socios: [FICHA()], prestamos: [], config: { negocio: 'Tu Garantía' } }, cartera || {}));
  P.ev('traerSolicitudes(true)'); await asentar();
  const preguntas = [];
  P.ctx.alert = m => { preguntas.push('ALERT ' + String(m)); };
  return { P, N, preguntas };
}
/* El confirm de mentira: anota cada pregunta y contesta con `responde(texto)`. */
const contestar = (P, preguntas, responde) => { P.ctx.confirm = m => { preguntas.push(String(m)); return responde(String(m)); }; };
const llenarAlta = P => {
  const el = id => P.ctx.document.getElementById(id);
  el('qNombre').value = 'Marta Prueba'; el('qTel').value = CEL; el('qCap').value = '1200000';
  el('qFecha').value = P.ev('hoyISO()'); el('qCosto').value = '20';
};
const creditos = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
const abierta = (P, id) => P.ev("_solicitudes.some(x=>String(x.id)==='" + id + "')");
const PREGUNTA_CERRAR = /quedó registrado[\s\S]*¿La cierro, para que su app deje de ofrecérsela/;

describe('1. después de un crédito a mano, se pregunta si se cierra la propuesta', () => {
  test('esperando que acepte: «Registrarlo a mano igual», y con el sí queda atendida y sale de la bandeja', async () => {
    const { P, N, preguntas } = await montar(() => [SOL()]);
    contestar(P, preguntas, () => true);
    P.ev("nuevoCredito('C900')");
    assert.match(P.elems.mTitle.textContent, /Antes de registrarlo a mano/);
    P.ev("nuevoCredito('C900',true)");
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    assert.equal(creditos(P).length, 1);
    const q = preguntas.find(m => PREGUNTA_CERRAR.test(m));
    assert.ok(q, 'no preguntó si cerraba la propuesta: su app se la seguía ofreciendo encima del crédito');
    assert.match(q, /El crédito CR-\d+ de Marta Prueba quedó registrado/);
    assert.match(q, /Le propusiste \$1\.200\.000 y devuelve \$1\.440\.000/);
    assert.ok(N.marcas.some(m => m.fn === 'marcar_solicitud' && Number(m.c.p_id) === 31 && m.c.p_estado === 'atendida'),
      'no la marcó atendida en la nube');
    assert.equal(abierta(P, '31'), false, 'la solicitud siguió en la bandeja');
    /* El aviso de antes ya no promete «su app seguirá esperando» sin más. */
    assert.equal(preguntas.some(m => /su app seguirá esperando/.test(m)), false);
  });

  test('ya aceptada y registrada a mano: también se pregunta, y la aceptada no queda colgando', async () => {
    const { P, N, preguntas } = await montar(() => [ACEPTADA()]);
    contestar(P, preguntas, () => true);
    P.ev("nuevoCredito('C900',true)");
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    assert.ok(preguntas.some(m => PREGUNTA_CERRAR.test(m) && /la ACEPTÓ/.test(m)));
    assert.ok(N.marcas.some(m => m.fn === 'marcar_solicitud' && Number(m.c.p_id) === 31 && m.c.p_estado === 'atendida'));
    assert.equal(abierta(P, '31'), false);
  });

  test('con el no, sigue abierta y nada se marca', async () => {
    const { P, N, preguntas } = await montar(() => [SOL()]);
    contestar(P, preguntas, m => !PREGUNTA_CERRAR.test(m));
    P.ev("nuevoCredito('C900',true)");
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    assert.equal(creditos(P).length, 1);
    assert.equal(abierta(P, '31'), true);
    assert.equal(N.marcas.some(m => m.fn === 'marcar_solicitud'), false);
  });

  test('a cuotas, igual', async () => {
    const { P, preguntas } = await montar(() => [SOL()]);
    contestar(P, preguntas, () => true);
    P.ev("nuevoCredito('C900',true)");
    llenarAlta(P);
    P.ev("modoAlta('cuotas')");
    const el = id => P.ctx.document.getElementById(id);
    el('qaN').value = '2'; P.ev('filasAlta()');
    el('qaF1').value = enDias(15); el('qaF2').value = enDias(30);
    P.ev('guardarRapido()'); await asentar();
    assert.equal(creditos(P).length, 1, 'no registró el crédito a cuotas: ' + preguntas.join(' | '));
    assert.ok(preguntas.some(m => PREGUNTA_CERRAR.test(m)), 'a cuotas no preguntó si cerraba la propuesta');
    assert.equal(abierta(P, '31'), false);
  });
});

describe('2. si quedó abierta y la acepta: la ficha lo dice, y otro crédito pide un sí explícito', () => {
  test('la ficha dice «Ya le registraste…», ofrece cerrarla, y crearDesdeSolicitud pregunta antes del segundo', async () => {
    let sol = SOL();
    const { P, N, preguntas } = await montar(() => [sol]);
    contestar(P, preguntas, m => !PREGUNTA_CERRAR.test(m));   // Joan dice que no la cierre
    P.ev("nuevoCredito('C900',true)");
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    const cod = P.ev('codCredito(DB.prestamos[0])');
    /* Su app se la sigue ofreciendo: la acepta. */
    sol = ACEPTADA();
    P.ev('traerSolicitudes()'); await asentar();
    P.ev("verCliente('C900')");
    const t = plano(P.elems.mBody.innerHTML);
    assert.match(t, new RegExp('A Marta Prueba ya le registraste ' + cod + ' el .+, después de esta propuesta'),
      'la ficha no dice que ya tiene un crédito posterior a la propuesta');
    assert.match(P.elems.mBody.innerHTML, /onclick="cerrarPropuestaYaRegistrada\('31','C900'\)">Ya tiene su crédito: cerrar la propuesta/);
    /* Registrar otro: la pregunta nombra el que ya tiene, y con el no, nada. */
    preguntas.length = 0;
    contestar(P, preguntas, m => !/OTRO crédito/.test(m));
    P.ev("cerrarModal();crearDesdeSolicitud('31')"); await asentar();
    assert.equal(creditos(P).length, 1, 'registró un segundo crédito por la misma solicitud sin preguntar');
    assert.ok(preguntas.some(m => m.indexOf('ya le registraste ' + cod) >= 0 && /¿Le registro OTRO crédito además de ese\?/.test(m)));
    /* Y cerrarla desde la ficha la marca atendida. */
    contestar(P, preguntas, () => true);
    P.ev("verCliente('C900')");
    P.ev("cerrarPropuestaYaRegistrada('31','C900')"); await asentar();
    assert.ok(N.marcas.some(m => m.fn === 'marcar_solicitud' && Number(m.c.p_id) === 31 && m.c.p_estado === 'atendida'));
    assert.equal(abierta(P, '31'), false);
    assert.doesNotMatch(plano(P.elems.fichaPidio.innerHTML), /Registrar el crédito con lo que aceptó/);
  });

  test('el caso del 9-nov: crédito a mano DESPUÉS de la propuesta, ya registrado, y la propuesta abierta', async () => {
    const despues = { id: 'P1', numero: 7, socioId: 'C900', socioNombre: 'Marta Prueba', telefono: CEL, capital: 1200000, costoPct: 20,
      fechaDesembolso: '2026-11-09', cicloActual: enDias(20), prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false,
      fechaCreacion: '2026-11-09T18:00:00.000Z' };
    const { P } = await montar(() => [SOL()], { prestamos: [despues] });
    P.ev("verCliente('C900')");
    assert.match(plano(P.elems.mBody.innerHTML), /A Marta Prueba ya le registraste CR-\d+ el .+, después de esta propuesta/);
    /* El código entero en un renglón: «CR-» arriba y el número abajo no se lee. */
    assert.match(P.elems.mBody.innerHTML, /ya le registraste <span style="white-space:nowrap">CR-\d+<\/span> el /);
  });

  test('un crédito de ANTES de la propuesta no dispara el aviso', async () => {
    const antes = { id: 'P1', numero: 7, socioId: 'C900', socioNombre: 'Marta Prueba', telefono: CEL, capital: 500000, costoPct: 20,
      fechaDesembolso: '2026-10-01', cicloActual: '2026-10-16', prorrogas: [], abonosCapital: [], comprobantes: [], pagado: true,
      fechaCreacion: '2026-10-01T12:00:00.000Z' };
    const { P, preguntas } = await montar(() => [ACEPTADA()], { prestamos: [antes] });
    P.ev("verCliente('C900')");
    assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /ya le registraste/);
    contestar(P, preguntas, m => String(m).indexOf('bienvenida') < 0);
    P.ev("cerrarModal();crearDesdeSolicitud('31')"); await asentar();
    assert.equal(creditos(P).length, 2, 'el crédito de la solicitud no se registró');
    assert.equal(preguntas.some(m => /OTRO crédito/.test(m)), false);
  });
});

describe('3. el formulario de Créditos, sin ficha: avisa por el celular', () => {
  test('cliente NUEVO con una propuesta abierta: pregunta antes; con el no, no registra nada', async () => {
    const { P, preguntas } = await montar(() => [SOL()], { socios: [] });
    contestar(P, preguntas, () => false);
    P.ev('nuevoCredito()');
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    assert.equal(creditos(P).length, 0, 'registró sin avisar de la propuesta abierta');
    assert.match(preguntas[0] || '', /^Marta Prueba tiene una propuesta abierta/);
  });

  test('con el sí registra, y después ofrece cerrarla', async () => {
    const { P, N, preguntas } = await montar(() => [SOL()], { socios: [] });
    contestar(P, preguntas, () => true);
    P.ev('nuevoCredito()');
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    assert.equal(creditos(P).length, 1);
    assert.ok(preguntas.some(m => PREGUNTA_CERRAR.test(m)));
    assert.ok(N.marcas.some(m => m.fn === 'marcar_solicitud' && Number(m.c.p_id) === 31 && m.c.p_estado === 'atendida'));
  });

  test('si la bandeja llega con el formulario abierto, al guardar avisa igual', async () => {
    let lista = [];
    const { P, preguntas } = await montar(() => lista);
    contestar(P, preguntas, () => false);
    P.ev("nuevoCredito('C900')");            // al abrir no había nada: el formulario directo
    assert.doesNotMatch(P.elems.mTitle.textContent, /Antes de registrarlo a mano/);
    lista = [SOL()];
    P.ev('traerSolicitudes()'); await asentar();
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    assert.equal(creditos(P).length, 0, 'la propuesta que llegó con el formulario abierto no se avisó');
    assert.match(preguntas[0] || '', /tiene una propuesta abierta/);
  });
});

describe('4. «＋ Nuevo préstamo con garantía» desde Créditos', () => {
  test('sin ficha de entrada, al guardar pregunta por la propuesta abierta del cliente elegido', async () => {
    const { P, preguntas } = await montar(() => [SOL()]);
    /* La garantía ganada, de mentira: lo que se prueba es la pregunta, no el tope. */
    P.ev('maxRespaldadoDe = function () { return 5000000; };');
    P.ev("simRespaldado = function () { var s = DB.socios[0]; return { s: s, max: 5000000, nivel: migrarSocio(s).garantia.nivel, cap: 1000000, plazo: 2," +
         " sim: { capital: 1000000, plazo_meses: 2, cuota_tipica: 520000, total_a_pagar: 1040000, costo_total: 40000, garantia_que_deja: 0," +
         " dentro_del_respaldo: true, cuotas: [{ numero: 1, fecha_corte: '" + enDias(30) + "', capital: 500000, costo: 20000, total: 520000 }," +
         " { numero: 2, fecha_corte: '" + enDias(60) + "', capital: 500000, costo: 20000, total: 520000 }] } }; };");
    contestar(P, preguntas, m => !/tiene una propuesta abierta/.test(m));
    P.ev('nuevoRespaldado()');
    P.ev('guardarRespaldado()'); await asentar();
    assert.ok(preguntas.some(m => /^Marta Prueba tiene una propuesta abierta/.test(m)), 'no preguntó por la propuesta abierta');
    assert.equal(P.ev('(DB.respaldados||[]).length'), 0, 'registró el préstamo pese al no');
  });
});

describe('5. los avisos no prometen lo que su app no hace', () => {
  test('una propuesta guardada con su cédula (su app no la ve): ni «Cuando la acepte desde su app» ni «su app se la sigue ofreciendo»', async () => {
    const sol = SOL({ cedula: '52123456', celular: null });
    const { P, preguntas } = await montar(() => [sol], { socios: [Object.assign(FICHA(), { cedula: '52123456' })] });
    assert.equal(P.ev('laVeEnSuApp(_solicitudes[0])'), false);
    P.ev("nuevoCredito('C900')");
    const t = plano(P.elems.mBody.innerHTML);
    assert.match(t, /hoy no la va a ver/);
    assert.doesNotMatch(t, /Cuando la acepte desde su app|su app se la sigue ofreciendo|su app seguirá esperando/);
    assert.match(t, /Su app no le muestra esta propuesta/);
    const conf = P.ev('textoAntesDeAMano(DB.socios[0], solicitudesConPropuesta(DB.socios[0]))');
    assert.doesNotMatch(conf, /acepte en su app|su app se la sigue ofreciendo|su app seguirá esperando/);
    /* Y la pregunta de cerrarla después del registro, tampoco. */
    contestar(P, preguntas, () => true);
    P.ev("nuevoCredito('C900',true)");
    llenarAlta(P);
    P.ev('guardarRapido()'); await asentar();
    const q = preguntas.find(m => /quedó registrado/.test(m));
    assert.ok(q, 'no preguntó si cerraba la propuesta');
    assert.doesNotMatch(q, /su app/);
  });
});

describe('6. sin la bandeja (colgada o caída), «＋ Nuevo crédito» dice que no sabe', () => {
  for (const modo of ['colgada', 'caida']) {
    test('bandeja ' + modo + ': el formulario lo dice, y vuelve a preguntar', async () => {
      let preguntas = 0;
      const P = abrirPanel({ red: url => {
        const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
        if (fn === 'listar_solicitudes_abiertas') { preguntas++; return modo === 'colgada' ? new Promise(() => {}) : Promise.reject(new Error('sin red')); }
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]'), json: () => Promise.resolve([]) });
      } });
      P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
      P.cargarCartera({ socios: [FICHA()], prestamos: [], config: {} });
      P.ev('traerSolicitudes(true)'); await asentar();
      P.ev('_solPreguntadaEn = 0');   // el freno de 15 s ya pasó
      const antes = preguntas;
      P.ev("nuevoCredito('C900')");
      const t = plano(P.elems.mBody.innerHTML);
      assert.match(t, new RegExp('No sé si Marta Prueba tiene una propuesta abierta: ' + (modo === 'caida' ? 'no pude preguntarle a la nube' : 'la nube todavía no contesta')));
      assert.match(P.elems.mBody.innerHTML, /id="qCap"/, 'el formulario no se abrió');
      assert.ok(preguntas > antes, 'no volvió a preguntarle a la nube');
    });
  }
  test('con la bandeja al día, nada', async () => {
    const { P } = await montar(() => []);
    P.ev("nuevoCredito('C900')");
    assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /No sé si/);
  });
});
