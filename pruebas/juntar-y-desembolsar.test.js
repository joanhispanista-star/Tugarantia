'use strict';
/* ============================================================================
 * JUNTAR Y DESEMBOLSAR, EN LA MISMA FILA — 13 de noviembre de 2026
 *
 *   node --test pruebas/juntar-y-desembolsar.test.js
 *
 * Un cliente con ficha pidió desde una cuenta sin juntar, aceptó la propuesta,
 * y «✓ Desembolsar» mandaba a Joan a 📥 Registrados y al cliente a volverla a
 * mandar. Joan: «no quiero ir a otra página para registrar el crédito ya que el
 * cliente aceptó». Con el CRM de verdad (banco-panel.js) y una nube de mentira:
 *
 *   1. la fila dice «🔗 Juntar y desembolsar» (o «🔗 Juntar su cuenta» si no
 *      ha aceptado), y nada en el CRM pide «que la vuelva a mandar»;
 *   2. el botón abre «¿Es la misma persona?» con la ficha de ese celular y el
 *      registro de la cuenta; NADA se registra antes del toque de Joan;
 *   3. con el toque, la nube junta y sigue el crédito que aceptó, en la misma
 *      pantalla, y el final dice cuánto girar y a dónde;
 *   4. si la nube no junta, no se registra nada y se dice;
 *   5. el registro que no estaba traído se busca (nuevo o atendido); dos
 *      fichas con el mismo celular se escogen; sin ficha, se dice;
 *   6. lo pendiente no se dispara con OTRO toque, ni caducado.
 * Los nombres y números son de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const CEL = '3001112222';
const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
const CREADA = '2026-11-12T15:00:00Z';

/* El cliente antiguo, sin cédula, con su celular en la ficha. */
const JORGE = { id: 'C1', numero: 7, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [] };
/* El registro de la cuenta que pidió. */
const REG = { id: 41, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, origen: 'abierto', estado: 'nuevo',
  creado_en: '2026-11-08T14:55:00Z', datos: { nombres: 'Jorge', apellidos: 'Antiguo', celular: CEL } };
/* La solicitud sin juntar (la nube la marca: cuenta_sin_juntar), con propuesta. */
const SOL = o => Object.assign({ id: 's1', nombre: 'Jorge Antiguo', cedula: CEL, celular: CEL, estado: 'contrapropuesta',
  app: 'tugarantia', origen: 'nube', cuenta_sin_juntar: true, registro_id: 41,
  capital: 1500000, pedido_monto: 1500000, producto: 'quincenal', fecha_corte: enDias(30),
  pedido: { origen: 'play', capital: 1500000, fecha_pago: enDias(30), dias: 30 }, datos: {},
  contrapropuesta: { capital: 1200000, costo: 240000, total: 1440000, fecha_pago: enDias(30), dias: 30, costo_pct: 20,
                     texto: '', por: 'joan', creada_en: CREADA } }, o || {});
const ACEPTADA = o => {
  const s = SOL(Object.assign({ estado: 'aceptada', aceptada_en: '2026-11-13T13:38:00Z' }, o || {}));
  s.contrapropuesta.condiciones = { version: '2026-10-22', aceptadas_en: '2026-11-13T13:38:00Z',
    lineas: [{ clave: 'recibes', k: 'Recibes', v: '$1.200.000' }], tope_mora: null,
    base: { capital: 1200000, total: 1440000, fecha_pago: s.contrapropuesta.fecha_pago, creada_en: CREADA } };
  s.destino_desembolso = { medio: 'nequi', numero: '3001112233', es_mia: true, propuesta: CREADA };
  return s;
};
const CUENTA = { registro_id: 41, celular: CEL, cuenta: true, cuenta_creada_en: '2026-11-08T14:50:00Z' };

function nube(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    let c = null; try { c = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { c = null; }
    vistas.push({ fn, c });
    if (o[fn] !== undefined) { const r = typeof o[fn] === 'function' ? o[fn](c) : o[fn]; return Promise.resolve(resp(200, r)); }
    if (fn === 'listar_registros') return Promise.resolve(resp(200, []));
    if (fn === 'archivos_de_registro' || fn === 'registro_archivos') return Promise.resolve(resp(200, { ok: true, fotos: {}, huella: null }));
    if (fn === 'marcar_solicitud' || fn === 'marcar_registro') return Promise.resolve(resp(200, { ok: true }));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas };
}
function montar(o) {
  o = o || {};
  const N = nube(Object.assign({ cuentas_de_registros: [CUENTA],
    vincular_cuenta_joan: { ok: true, ya_estaba: false, nombre: 'Jorge Antiguo', celular: CEL } }, o.nube || {}));
  const P = abrirPanel({ red: N.red });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera({ socios: (o.socios || [JORGE]).map(x => JSON.parse(JSON.stringify(x))), prestamos: [], config: { negocio: 'Tu Garantía' } });
  P.ctx.open = () => {};
  if (o.registros !== false) P.ev('_registros = ' + JSON.stringify(o.registros || [REG]));
  P.ev('_solicitudes = ' + JSON.stringify(o.solicitudes || [ACEPTADA()]));
  const preguntas = [];
  P.ctx.confirm = m => { preguntas.push(String(m)); return o.responde ? o.responde(String(m)) : true; };
  return { P, N, preguntas };
}
const llamadasA = (N, fn) => N.vistas.filter(v => v.fn === fn);
const avisos = P => (P.ctx._avisos || []).join('\n');
const creditos = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
const fila = P => { P.ev('renderBandeja()'); return P.elems.bandeja.innerHTML; };
/* El toque de Joan: abre el modal desde la fila, espera a la nube y da «Sí, es la misma persona». */
async function tocarYJuntar(P, id) {
  P.ev("juntarYDesembolsar('" + (id || 's1') + "')");
  await asentar();
  assert.equal(P.elems.mTitle.textContent, '¿Es la misma persona?');
  const b = P.elems.juntarBoton.innerHTML;
  const m = /juntarConUnToque\('([^']+)','([^']+)',(true|false)\)/.exec(b);
  assert.ok(m, 'el toque no ofreció juntar: ' + plano(b));
  P.ev('juntarConUnToque(' + JSON.stringify(m[1]) + ',' + JSON.stringify(m[2]) + ',' + m[3] + ')');
  await asentar(16);
  return m;
}

/* ======================================================================== */
describe('1. la fila: un botón, y nada de «que la vuelva a mandar»', () => {
  test('aceptada y sin juntar: «🔗 Juntar y desembolsar», no el Desembolsar que solo avisaba', () => {
    const { P } = montar();
    const h = fila(P);
    assert.match(h, /onclick="juntarYDesembolsar\('s1'\)"[^>]*>🔗 Juntar y desembolsar<\/button>/);
    assert.doesNotMatch(h, /crearDesdeSolicitud\('s1'\)/, 'siguió el botón que solo decía «júntale la cuenta»');
    assert.match(plano(h), /Sin juntar: su celular es el de una de tus fichas, pero no sabemos si es esa persona\. «🔗 Juntar y desembolsar» te deja compararlas aquí mismo y sigue con el crédito/);
  });

  test('esperando que acepte: «🔗 Juntar su cuenta», sin botón de desembolsar', () => {
    const { P } = montar({ solicitudes: [SOL()] });
    const h = fila(P);
    assert.match(h, /onclick="juntarYDesembolsar\('s1'\)"[^>]*>🔗 Juntar su cuenta<\/button>/);
    assert.doesNotMatch(h, /Juntar y desembolsar|Desembolsar<\/button>/);
    assert.match(plano(h), /No le prestes hasta juntarla/);
  });

  test('la de una cuenta YA junta en este computador sigue con el «✓ Desembolsar» de siempre', () => {
    const { P } = montar({ socios: [Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-11-13', registro_id: 41 } })] });
    const h = fila(P);
    assert.match(h, /onclick="crearDesdeSolicitud\('s1'\)">✓ Desembolsar/);
    assert.doesNotMatch(h, /juntarYDesembolsar/);
  });

  test('ningún texto del CRM le pide al cliente que vuelva a mandar una solicitud por no estar junta', () => {
    const crm = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    assert.doesNotMatch(crm, /júntale la cuenta[^'\n]*y pídele que la vuelva a mandar/i);
  });
});

/* ======================================================================== */
describe('2 y 3. el toque, mirando, y el crédito en la misma pantalla', () => {
  test('nada se registra antes del toque: el botón abre «¿Es la misma persona?» con su ficha y su registro', async () => {
    const { P, N } = montar();
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, '¿Es la misma persona?');
    assert.match(plano(P.elems.mBody.innerHTML), /Su ficha: CL-0007 · Jorge Antiguo/);
    assert.equal(creditos(P).length, 0, 'registró antes de que Joan mirara');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó sin el toque');
    assert.equal(llamadasA(N, 'cuentas_de_registros')[0].c.p_ids[0], 41, 'preguntó por otro registro');
  });

  test('con el toque: junta, cruza el registro nuevo, y registra lo que aceptó sin abrir otra pantalla', async () => {
    const { P, N, preguntas } = montar();
    await tocarYJuntar(P);
    const j = llamadasA(N, 'vincular_cuenta_joan')[0];
    assert.ok(j, 'no juntó');
    assert.equal(j.c.p_registro_id, 41);
    assert.equal(P.ev("DB.socios[0].cuentaJunta.celular"), CEL);
    const p = creditos(P);
    assert.equal(p.length, 1, 'no siguió con el crédito');
    assert.equal(p[0].socioId, 'C1', 'el crédito no quedó en su ficha');
    assert.equal(p[0].capital, 1200000, 'no registró lo que aceptó');
    assert.equal(p[0].origen, 'solicitud');
    assert.equal(p[0].consignarA.numero, '3001112233');
    assert.equal(P.ev("_solicitudes.some(x=>x.id==='s1')"), false, 'la solicitud siguió en la bandeja');
    assert.ok(llamadasA(N, 'marcar_solicitud').some(v => v.c.p_estado === 'atendida'), 'no quedó atendida en la nube');
    assert.ok(preguntas.some(m => /^Crear el crédito de Jorge Antiguo/.test(m)), 'no preguntó antes de registrar');
    assert.match(avisos(P), /quedó junta con CL-0007[\s\S]*Ahora te muestro el crédito que aceptó/);
    /* «me avisas para poder desembolsar»: el final dice cuánto girar y a dónde. */
    const fin = preguntas.find(m => /registrado para Jorge Antiguo/.test(m));
    assert.ok(fin, 'no dijo que quedó registrado');
    assert.match(fin, /💸 Ya puedes girarle \$1\.200\.000 a Nequi 300 111 2233, a nombre de Jorge Antiguo/);
  });

  test('un registro ya atendido solo se junta (no se vuelve a cruzar) y también sigue con el crédito', async () => {
    const { P } = montar({ registros: [Object.assign({}, REG, { estado: 'atendido' })] });
    const m = await tocarYJuntar(P);
    assert.equal(m[3], 'true', 'volvió a cruzar un registro que ya estaba atendido');
    assert.equal(creditos(P).length, 1);
    assert.equal(P.ev('(DB.socios[0].cruces||[]).length'), 0);
  });

  test('si Joan dice que no al crédito, la cuenta queda junta y la solicitud sigue para desembolsar después', async () => {
    const { P } = montar({ responde: m => !/^Crear el crédito/.test(m) });
    await tocarYJuntar(P);
    assert.equal(creditos(P).length, 0);
    assert.equal(P.ev("_solicitudes.some(x=>x.id==='s1')"), true);
    assert.match(fila(P), /onclick="crearDesdeSolicitud\('s1'\)">✓ Desembolsar/, 'ya junta, la fila no volvió al desembolsar de siempre');
  });

  test('esperando que acepte: junta, no registra nada, y dice que el botón sale cuando acepte', async () => {
    const { P } = montar({ solicitudes: [SOL()] });
    await tocarYJuntar(P);
    assert.equal(creditos(P).length, 0);
    assert.match(avisos(P), /Cuando acepte la propuesta, en su fila de 📨 Solicitudes te sale «✓ Desembolsar»/);
  });

  test('desde la ficha, «Registrar el crédito con lo que aceptó» abre el mismo toque con ESA ficha', async () => {
    const { P } = montar();
    P.ev("crearDesdeSolicitud('s1','C1')");
    await asentar();
    assert.equal(P.elems.mTitle.textContent, '¿Es la misma persona?');
    assert.equal(creditos(P).length, 0);
  });
});

/* ======================================================================== */
describe('4. si la nube no junta, no hay crédito', () => {
  test('el teléfono es de otra ficha: «No la junté», y sin juntarla no se registra', async () => {
    const { P, N } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'telefono_con_otra_ficha' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 0, 'registró sin la cuenta junta');
    assert.match(avisos(P), /No la junté[\s\S]*Y sin juntarla no registro el crédito/);
    assert.equal(P.ev("_solicitudes.some(x=>x.id==='s1')"), true);
  });

  test('una cuenta que pide la clave nueva no ofrece el toque: tampoco hay crédito', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { cuenta_creada_en: '2026-09-01T10:00:00Z', recado_abierto: true })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.match(b, /claveNuevaYJuntar\('41','C1',false\)/, 'no ofreció la clave nueva');
    assert.doesNotMatch(b, /juntarConUnToque/, 'ofreció juntar con un toque una cuenta con un recado abierto');
    assert.equal(creditos(P).length, 0);
  });
});

/* ======================================================================== */
describe('5. encontrar la ficha y el registro', () => {
  test('el registro que no estaba traído se busca en la nube (nuevos y atendidos) por el que nombra la solicitud', async () => {
    const otro = Object.assign({}, REG, { id: 40, creado_en: '2026-11-09T10:00:00Z' });
    const { P, N } = montar({ registros: false, nube: { listar_registros: c => c.p_estado === 'atendido' ? [Object.assign({}, REG, { estado: 'atendido' })] : [otro] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.equal(llamadasA(N, 'listar_registros').length, 2);
    assert.equal(P.elems.mTitle.textContent, '¿Es la misma persona?');
    assert.equal(llamadasA(N, 'cuentas_de_registros')[0].c.p_ids[0], 41, 'tomó el registro del mismo celular y no el que nombra la solicitud');
  });

  test('sin registro de esa cuenta, se dice y no se pega a la ficha', async () => {
    const { P } = montar({ registros: false });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(avisos(P), /No encontré el registro de la cuenta del 300 111 2222/);
    assert.equal(creditos(P).length, 0);
  });

  test('dos fichas con ese celular: se escoge cuál, y el toque se abre con la escogida', async () => {
    const OTRA = Object.assign({}, JORGE, { id: 'C2', numero: 8, nombre: 'Jorge Homónimo' });
    const { P } = montar({ socios: [JORGE, OTRA] });
    P.ev("juntarYDesembolsar('s1')");
    assert.equal(P.elems.mTitle.textContent, '¿De cuál de tus fichas es?');
    assert.match(P.elems.mBody.innerHTML, /juntarYDesembolsar\('s1','C2'\)/);
    P.ev("juntarYDesembolsar('s1','C2')");
    await asentar();
    assert.match(plano(P.elems.mBody.innerHTML), /Su ficha: CL-0008 · Jorge Homónimo/);
  });

  test('sin ficha con ese celular en este computador, se dice sin pedirle nada al cliente', () => {
    const { P } = montar({ socios: [Object.assign({}, JORGE, { telefono: '3009998888' })] });
    P.ev("juntarYDesembolsar('s1')");
    assert.match(avisos(P), /no la encuentro/);
    assert.match(avisos(P), /no hace falta que te la vuelva a mandar/);
  });
});

/* ======================================================================== */
describe('6. lo pendiente es de ESE toque', () => {
  test('juntar OTRO registro con la misma ficha no dispara el desembolso', async () => {
    const OTRO = Object.assign({}, REG, { id: 42 });
    const { P } = montar({ registros: [REG, OTRO],
      nube: { cuentas_de_registros: c => [Object.assign({}, CUENTA, { registro_id: c.p_ids[0] })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev('cerrarModal()');
    P.ev("abrirJuntarCuenta('42','C1')");
    await asentar();
    P.ev("juntarConUnToque('42','C1',false)");
    await asentar(16);
    assert.equal(creditos(P).length, 0, 'un toque sobre otro registro registró el crédito');
  });

  test('caducado (más de 30 minutos), el toque solo junta', async () => {
    const { P } = montar();
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev('_trasJuntar.en -= 31*60000');
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(creditos(P).length, 0);
    assert.equal(P.ev("DB.socios[0].cuentaJunta.celular"), CEL);
  });
});

/* ======================================================================== */
describe('el aviso de girar, también en el desembolso de siempre', () => {
  test('una solicitud de cuenta junta: el final dice cuánto girar y a dónde', async () => {
    const { P, preguntas } = montar({ socios: [Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-11-13', registro_id: 41 } })] });
    P.ev("crearDesdeSolicitud('s1')");
    await asentar();
    assert.equal(creditos(P).length, 1);
    assert.ok(preguntas.some(m => /registrado para Jorge Antiguo\.\n\n💸 Ya puedes girarle \$1\.200\.000 a Nequi/.test(m)));
  });

  test('sin cuenta elegida, el aviso dice que hay que preguntarle a cuál', async () => {
    const s = ACEPTADA(); delete s.destino_desembolso;
    const { P, preguntas } = montar({ solicitudes: [s], socios: [Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-11-13', registro_id: 41 } })] });
    P.ev("crearDesdeSolicitud('s1')");
    await asentar();
    assert.ok(preguntas.some(m => /💸 Ya puedes girarle \$1\.200\.000, pero no eligió a qué cuenta: pregúntale por el chat/.test(m)));
  });
});
