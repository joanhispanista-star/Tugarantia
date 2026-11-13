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
    assert.match(avisos(P), /quedó junta con CL-0007[\s\S]*Sigo con el crédito que aceptó/);
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
    assert.match(avisos(P), /la pidió la cuenta del registro 41, y la nube no me lo devolvió[\s\S]*No la junto con otro registro de ese celular/);
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

/* ============================================================================
 * LA REVISIÓN ADVERSARIA DEL 13-NOV (17 hallazgos verificados). Cada prueba es
 * uno: falla con el código de antes del arreglo.
 * ==========================================================================*/
describe('revisión: el registro de ESTA cuenta, y solo ese', () => {
  test('la nube le quitó el registro_id (el registro es de antes de abrir la cuenta): se dice arriba, no se cruza, y hay clave nueva', async () => {
    const VIEJO = Object.assign({}, REG, { creado_en: '2026-09-01T10:00:00Z' });
    const s = ACEPTADA({ registro_id: null });
    const { P, N } = montar({ solicitudes: [s], registros: [VIEJO],
      nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { cuenta_creada_en: '2026-11-12T10:00:00Z', minutos_antes_del_registro: -103920 })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const h = plano(P.elems.mBody.innerHTML);
    /* (segunda revisión) sin afirmar la causa: la dicen la fecha y la señal. */
    assert.match(h, /Esta solicitud no trae el registro de su cuenta\. O el registro de ese celular \(el del 0?1 de sept de 2026\) es de antes de abrir la cuenta, y la nube se lo quitó, o lo llenó después de pedir/);
    assert.match(h, /La solicitud no trae su registro: este no se cruza en la ficha/);
    assert.doesNotMatch(h, /Este registro ya lo atendiste/, 'dijo que Joan lo atendió');
    /* La cuenta se pinta aparte (#juntarCuenta), cuando contesta la nube. */
    const cuenta = plano(P.elems.juntarCuenta.innerHTML);
    assert.match(cuenta, /La cuenta se abrió \d+ días DESPUÉS de este registro/, 'la señal seguía diciendo «es lo normal»');
    assert.doesNotMatch(cuenta, /es lo normal/);
    const b = P.elems.juntarBoton.innerHTML;
    /* Lo seguro primero; el toque dice lo que Joan afirma; y la confirmación
       pegada al botón ya no es «que este registro es suyo». */
    assert.match(b, /btn-rojo" onclick="claveNuevaYJuntar\('41','C1',true\)">🔑 Clave nueva al número de su ficha/);
    assert.match(b, /juntarConUnToque\('41','C1',true\)">🔗 Ya lo llamé y me dijo qué pidió y a qué cuenta: juntar/, 'cruzaría en la ficha un registro que no es de esta cuenta');
    assert.match(plano(b), /te dijo él mismo qué pidió y a qué cuenta le consignas/);
    assert.doesNotMatch(plano(b), /registro es suyo/);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
  });

  test('sin registro propio, «Ya lo llamé…» junta y sigue con el crédito (lo afirmó Joan)', async () => {
    const VIEJO = Object.assign({}, REG, { creado_en: '2026-09-01T10:00:00Z' });
    const { P, N } = montar({ solicitudes: [ACEPTADA({ registro_id: null })], registros: [VIEJO] });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1',true)");
    await asentar(16);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 1);
    assert.equal(P.ev('(DB.socios[0].cruces||[]).length'), 0, 'cruzó en la ficha un registro que no es de esta cuenta');
  });

  test('arriba del toque, qué preguntarle por teléfono: qué pidió y a qué cuenta, sin dictárselo', async () => {
    const { P } = montar();
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const h = plano(P.elems.mBody.innerHTML);
    assert.match(h, /📞 Antes de juntar: llama al número de su FICHA \(300 111 2222\) y pregúntale qué pidió y a qué cuenta le consignas\. No le digas tú las cifras\. Debe decirte que recibe \$1\.200\.000, y que le consignes a Nequi 300 111 2233\. Si no sabe de qué le hablas, NO la juntes/);
  });

  test('la solicitud nombra el 50 y este computador tiene el 41 del mismo celular: no usa el 41, le pide el 50 a la nube', async () => {
    const R50 = Object.assign({}, REG, { id: 50, estado: 'atendido', creado_en: '2026-11-12T10:00:00Z' });
    const { P, N } = montar({ solicitudes: [ACEPTADA({ registro_id: 50 })], registros: [REG],
      nube: { listar_registros: c => c.p_estado === 'atendido' ? [R50] : [REG],
              cuentas_de_registros: c => [Object.assign({}, CUENTA, { registro_id: c.p_ids[0] })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.equal(llamadasA(N, 'listar_registros').length, 2, 'no le preguntó a la nube por el registro que nombra');
    assert.deepEqual(llamadasA(N, 'cuentas_de_registros')[0].c.p_ids, [50]);
  });

  test('sin registro_id y sin ningún registro de ese celular: se dice, sin toque', async () => {
    const { P } = montar({ solicitudes: [ACEPTADA({ registro_id: null })], registros: false });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(avisos(P), /No encontré ningún registro del 300 111 2222 \(ni nuevo ni atendido\), y la nube no junta una cuenta sin registro[\s\S]*que se registre en la app con ese mismo celular/);
    assert.notEqual((P.elems.mTitle || {}).textContent, '¿Es la misma persona?');
  });
});

describe('revisión: «compararlos», lo pendiente y la clave nueva', () => {
  test('el registro traído por 📨 Solicitudes (no está en la bandeja de nuevos): «compararlos» abre la mesa', async () => {
    const { P } = montar({ registros: false });
    P.ev('_registrosDeSolicitudes = ' + JSON.stringify([REG]));
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(P.elems.juntarBoton.innerHTML, /mesaDeCruce\('41','C1',true\)/);
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    assert.match(P.elems.mTitle.textContent, /^Cruzar · /, '«No estoy seguro: compararlos» no hizo nada');
    assert.ok(P.ev('!!_trasJuntar'), 'la mesa desde el toque perdió lo pendiente');
  });

  test('cerrado el toque sin juntar, juntar desde 📥 Registrados solo junta: ni crédito', async () => {
    const { P } = montar();
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev('cerrarModal()');
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(creditos(P).length, 0, 'un toque dado solo para juntar registró el crédito');
    assert.doesNotMatch(avisos(P), /Sigo con el crédito/);
  });

  test('la mesa abierta desde 📥 Registrados también olvida lo pendiente', async () => {
    const { P } = montar();
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1')");
    assert.equal(P.ev('_trasJuntar'), null);
  });

  test('con la clave nueva desde el toque, el crédito no sigue solo, y se dice que lo aceptó quien estaba adentro', async () => {
    const { P } = montar({ nube: { clave_temporal_joan: { ok: true, clave: 'PRUEBA-123' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("claveNuevaYJuntar('41','C1',false)");
    await asentar(16);
    assert.match(plano(P.elems.mBody.innerHTML), /El crédito NO lo registré\. Lo que aceptó, y la cuenta a la que pidió que le consignes, lo eligió quien estaba en esa cuenta ANTES de la clave nueva/);
    assert.equal(P.ev('_trasJuntar'), null);
    assert.equal(creditos(P).length, 0);
  });

  test('juntada tras una clave nueva, una aceptación de ANTES pregunta antes de desembolsar; con el no, nada', async () => {
    const FICHA = Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-11-13', registro_id: 41, por: 'crm', seguraDesde: '2026-11-13T20:00:00Z' } });
    const { P, preguntas } = montar({ socios: [FICHA], responde: m => !/ANTES de que la clave nueva/.test(m) });
    P.ev("crearDesdeSolicitud('s1')");
    await asentar();
    assert.ok(preguntas.some(m => /aceptó esta propuesta el .*ANTES de que la clave nueva que le diste dejara afuera a quien estuviera en su cuenta/.test(m)), preguntas.join('\n---\n'));
    assert.equal(creditos(P).length, 0);
  });

  test('juntarCuentaEnLaNube anota desde cuándo la cuenta es segura cuando se junta tras una clave nueva', async () => {
    const FICHA = Object.assign({}, JORGE, { cuentaPorJuntar: { registro_id: 41, desde: '2026-11-13', por: 'crm', noAntesDe: '2026-11-13T20:00:00Z' } });
    const { P } = montar({ socios: [FICHA] });
    P.ev("juntarCuentaEnLaNube({id:41},DB.socios[0],PUENTE.llaveEnLaNube(DB.socios[0]),'crm',{})");
    await asentar(8);
    assert.equal(P.ev('DB.socios[0].cuentaJunta.seguraDesde'), '2026-11-13T20:00:00Z');
  });
});

describe('revisión: los avisos dicen lo que pasó', () => {
  test('la ficha ya junta con OTRA cuenta: no dice «Quedó anotada», manda a mirar esa unión', async () => {
    const { P } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'ficha_con_otra_cuenta' } } });
    P.ev('DB.socios[0].cuentaJunta = ' + JSON.stringify({ celular: '3009990000', fecha: '2026-11-01', registro_id: 9 }));
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    /* Por la mesa el cruce SÍ quedó en la ficha: se dice (segunda revisión). */
    assert.match(avisos(P), /Quedó cruzado con su ficha, pero su cuenta en la app NO quedó junta, así que el crédito NO lo registré[\s\S]*«🔗 Ver en la nube» te muestra con cuál está junta/);
    assert.doesNotMatch(avisos(P), /Quedó anotada|NO registré nada/);
  });

  test('sin propuesta todavía: al juntar dice que le proponga, no «cuando acepte»', async () => {
    const s = SOL({ estado: 'nueva', contrapropuesta: null });
    const { P } = montar({ solicitudes: [s] });
    await tocarYJuntar(P);
    assert.match(avisos(P), /Ahora propónle con «✏️ Proponer»/);
    assert.doesNotMatch(avisos(P), /Cuando acepte/);
  });

  test('ya junta, la fila dice su ficha y no «nuevo · la ficha se crea al desembolsar»', async () => {
    const s = ACEPTADA({ datos: { nombres: 'Jorge', apellidos: 'Antiguo', celular: CEL } });
    const { P } = montar({ solicitudes: [s], responde: m => !/^Crear el crédito/.test(m) });
    await tocarYJuntar(P);
    const h = plano(fila(P));
    assert.match(h, /Jorge Antiguo CL-0007/);
    assert.doesNotMatch(h, /la ficha se crea al desembolsar/);
  });

  test('con garantía: el aviso de la fila nombra el mismo botón que tiene la fila', () => {
    const s = ACEPTADA({ producto: 'respaldado', tasa: 0.1, plazo_meses: 3, total: 1500000 });
    const { P } = montar({ solicitudes: [s] });
    const h = fila(P);
    assert.match(h, />🔗 Juntar y revisar préstamo</);
    assert.match(plano(h), /«🔗 Juntar y revisar préstamo» te deja compararlas/);
  });
});

/* ============================================================================
 * LA SEGUNDA REVISIÓN (13-nov, noche): lo que quedó a medias y lo que el
 * primer arreglo dejó mal.
 * ==========================================================================*/
describe('segunda revisión', () => {
  test('en la mesa abierta desde 📨 Solicitudes, «No es la misma persona» dice que no le preste, sin abrir otra ficha con el número de tu cliente', async () => {
    const { P } = montar({ registros: false });
    P.ev('_registrosDeSolicitudes = ' + JSON.stringify([REG]));
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    assert.match(P.elems.mBody.innerHTML, /otraPersona\('41',true\)">No es la misma persona/);
    P.ev("otraPersona('41',true)");
    assert.match(avisos(P), /quien pidió NO es tu cliente: no le prestes con esta solicitud, y no le abras una ficha con el número de tu cliente/);
    assert.ok(!P.ev('_registroPendiente'), 'le abrió una ficha nueva con el número de tu cliente');
    assert.equal(P.ev('_trasJuntar'), null);
  });

  test('desde 📥 Registrados, «No es la misma persona» sigue abriendo su ficha nueva (registroPorId)', async () => {
    const { P } = montar({ registros: false });
    P.ev('_registrosExtra = ' + JSON.stringify([REG]));
    P.ev("otraPersona('41')");
    assert.equal(String(P.ev('_registroPendiente')), '41');
  });

  test('sin registro propio y con la clave nueva ya dada, sin su hora todavía: no ofrece otra clave ni juntar ya', async () => {
    const VIEJO = Object.assign({}, REG, { creado_en: '2026-09-01T10:00:00Z' });
    const DADA = new Date(Date.now() - 10 * 60000).toISOString();
    const { P } = montar({ solicitudes: [ACEPTADA({ registro_id: null })], registros: [VIEJO],
      nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { clave_nueva_en: DADA, clave_nueva_ficha: CEL, registro_creado_en: VIEJO.creado_en })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.doesNotMatch(b, /claveNuevaYJuntar|juntarConUnToque/);
    assert.match(plano(b), /Ya le diste una clave nueva al número de su ficha: su cuenta se junta sola desde las/);
  });

  test('la clave nueva vista para una ficha no hace segura la unión de OTRA ficha', async () => {
    const OTRA = Object.assign({}, JORGE, { id: 'C2', numero: 8, nombre: 'Otra Persona', telefono: '3005556666' });
    const { P } = montar({ socios: [JORGE, OTRA] });
    P.ev("_claveVista['41|'+PUENTE.llaveEnLaNube(DB.socios[0])] = '2026-11-13T20:00:00Z'");
    P.ev("juntarCuentaEnLaNube({id:41},DB.socios[1],PUENTE.llaveEnLaNube(DB.socios[1]),'crm',{})");
    await asentar(8);
    assert.equal(P.ev('DB.socios[1].cuentaJunta && DB.socios[1].cuentaJunta.seguraDesde'), undefined);
  });

  test('un intento fallido por la mesa no bota la hora de la clave nueva, y al juntarse sale seguraDesde', async () => {
    let ok = false;
    const FICHA = Object.assign({}, JORGE, { cuentaPorJuntar: { registro_id: 41, desde: '2026-11-13', por: 'crm', noAntesDe: '2026-11-13T20:00:00Z' } });
    const { P } = montar({ socios: [FICHA],
      nube: { vincular_cuenta_joan: () => ok ? { ok: true, celular: CEL } : { ok: false, motivo: 'sin_cuenta' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    assert.equal(P.ev('DB.socios[0].cuentaPorJuntar.noAntesDe'), '2026-11-13T20:00:00Z', 'el intento fallido botó la hora de la clave nueva');
    ok = true;
    P.ev("juntarCuentaEnLaNube({id:41},DB.socios[0],PUENTE.llaveEnLaNube(DB.socios[0]),'crm',{})");
    await asentar(8);
    assert.equal(P.ev('DB.socios[0].cuentaJunta.seguraDesde'), '2026-11-13T20:00:00Z');
  });

  test('una clave nueva dada en otra parte (un recado, el celular) también deja seguraDesde', async () => {
    const DADA = '2026-11-13T19:00:00Z';
    const { P } = montar({ nube: { cuentas_de_registros: [Object.assign({}, CUENTA,
      { clave_nueva_en: DADA, clave_nueva_ficha: CEL, registro_creado_en: REG.creado_en })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("juntarCuentaEnLaNube({id:41},DB.socios[0],PUENTE.llaveEnLaNube(DB.socios[0]),'crm',{})");
    await asentar(8);
    assert.equal(P.ev('DB.socios[0].cuentaJunta.seguraDesde'), new Date(Date.parse(DADA) + 3600000).toISOString());
  });

  test('un «ya_estaba» con el mismo celular no borra seguraDesde', async () => {
    const FICHA = Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-11-13', registro_id: 41, por: 'crm', seguraDesde: '2026-11-13T20:00:00Z' } });
    const { P } = montar({ socios: [FICHA], nube: { vincular_cuenta_joan: { ok: true, ya_estaba: true, celular: CEL } } });
    P.ev("juntarCuentaEnLaNube({id:42},DB.socios[0],PUENTE.llaveEnLaNube(DB.socios[0]),'crm',{})");
    await asentar(8);
    assert.equal(P.ev('DB.socios[0].cuentaJunta.seguraDesde'), '2026-11-13T20:00:00Z');
  });

  test('la clave nueva en una solicitud que no ha aceptado no habla de «lo que aceptó»', async () => {
    const { P } = montar({ solicitudes: [SOL()], nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { recado_abierto: true })],
      clave_temporal_joan: { ok: true, clave: 'PRUEBA-123' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = plano(P.elems.juntarBoton.innerHTML);
    assert.doesNotMatch(b, /Lo que aceptó/);
    assert.match(b, /que acepte la propuesta ya con su clave nueva/);
    P.ev("claveNuevaYJuntar('41','C1',false)");
    await asentar(16);
    assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /Lo que aceptó/);
  });

  test('con la clave nueva ya dada y esperando su hora, el aviso no promete «registra lo que aceptó»', async () => {
    const FICHA = Object.assign({}, JORGE, { cuentaPorJuntar: { registro_id: 41, desde: '2026-11-13', por: 'crm', noAntesDe: '2099-01-01T20:00:00Z' } });
    const { P } = montar({ socios: [FICHA], nube: { vincular_cuenta_joan: { ok: false, motivo: 'clave_reciente', se_puede_desde: '2099-01-01T20:00:00Z' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    assert.match(avisos(P), /Ya le diste una clave nueva: su cuenta se junta sola desde las/);
    assert.match(avisos(P), /El crédito NO lo registré\. Lo que aceptó/);
    assert.doesNotMatch(avisos(P), /registra lo que aceptó, sin que tenga que volver a mandarla/);
  });

  test('el día de una hora de noche en Bogotá es el de Bogotá, no el de UTC', () => {
    const { P } = montar();
    /* 00:31 UTC del 14 = 19:31 del 13 en Bogotá (UTC-5): el día que se ve es el de la hora que se ve. */
    const iso = '2026-11-14T00:31:00.000Z';
    const d = new Date(iso);
    const dia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    assert.equal(P.ev('diaLocalISO(' + JSON.stringify(iso) + ')'), dia);
    assert.ok(P.ev('fmtFechaHora(' + JSON.stringify(iso) + ')').startsWith(P.ev('fmtFecha(' + JSON.stringify(dia) + ')')));
  });
});
