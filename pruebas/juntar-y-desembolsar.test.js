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
  /* `envolverRed`: para retener una respuesta de la nube (la carrera del modal). */
  const P = abrirPanel({ red: o.envolverRed ? o.envolverRed(N.red) : N.red });
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

/* ============================================================================
 * SU FICHA SUBE SOLA AL TOCAR (13-nov, noche, v146). Con un cliente real: Joan lo
 * llamó, tocó «juntar» y le salió «No la junté: este computador todavía no
 * subió el historial de esta ficha…», con la instrucción de ir a Ajustes.
 * Joan: «yo no quiero estar subiendo cosas a la nube manualmente». Ahora el
 * toque corre la subida automática y después junta POR LA NUBE como siempre
 * (la nube sigue mirando la clave nueva, el celular de otra ficha, etc.); si
 * este computador no puede subirla, el cuadro lo dice antes de llamar. El
 * crédito NUNCA se registra sin juntar (la revisión mostró que así cobraba un
 * impostor).
 * La subida automática (historiales-auto.js) no corre en el banco: aquí va una
 * de mentira con lo que el CRM le pregunta, y el texto de la línea de Ajustes
 * es el de verdad (textoCinta).
 * ==========================================================================*/
const { crear: crearHistoriales } = require('../panel/historiales-auto.js');
const TEXTO_CINTA = crearHistoriales({})._puro.textoCinta;
/* op.alVolver: {idFicha: llave} que la vuelta confirma (la ficha «sube»). */
function conHistoriales(P, op) {
  op = op || {};
  P.ev('window.__hist = ' + JSON.stringify({ conf: op.conf || {}, ultimo: op.ultimo || null, habilitado: op.habilitado !== false,
    alVolver: op.alVolver || {}, vueltas: 0, cinta: op.cinta || null, lenta: !!op.lenta }));
  P.ev(`window.HistorialesAuto = {
    configurado: function () { return true; },
    habilitado: function () { return !!window.__hist.habilitado; },
    llaveConfirmada: function (id) { return window.__hist.conf[id] || null; },
    estado: function () { return { ultimo: window.__hist.ultimo, cinta: window.__hist.cinta || { l1: 'Tus clientes ven lo de hace 2 h', l2: '' } }; },
    vuelta: function (porOrden) {
      window.__hist.vueltas++;
      window.__hist.porOrden = porOrden;
      var a = window.__hist.alVolver || {};
      var subir = function () { Object.keys(a).forEach(function (k) { window.__hist.conf[k] = a[k]; }); return {}; };
      if (window.__hist.lenta) return new Promise(function (listo) { window.__soltarVuelta = function () { listo(subir()); }; });
      return Promise.resolve(subir());
    },
    subirTodo: function () { window.__hist.subirTodo = true; return Promise.resolve({ ok: true, confirmados: [] }); },
    algoCambio: function () {}
  };`);
  P.ev('window.HistorialesAuto')._puro = { textoCinta: TEXTO_CINTA };
  /* 14-nov-2026 — op.una: el historiales-auto.js de hoy, con subirUna. Sube solo
     la ficha que le piden (lo de alVolver para ESE id); op.unaFallas, lo que
     contesta mal cada llamada, en orden. */
  if (op.una) {
    P.ev('window.__hist.unas = []; window.__hist.unaFallas = ' + JSON.stringify(op.unaFallas || []));
    P.ev(`window.HistorialesAuto.subirUna = function (id) {
      window.__hist.unas.push(id);
      var f = window.__hist.unaFallas.shift();
      if (f) return Promise.resolve({ ok: false, fase: f.fase, motivo: f.motivo || '' });
      var a = window.__hist.alVolver || {};
      if (a[id]) window.__hist.conf[id] = a[id];
      return Promise.resolve({ ok: true, total: 1, subidos: 1, confirmados: [id] });
    };`);
  }
}
/* La cartera según nube-crm.js. libroAlDiaEsperando contesta lo de op.despues. */
function conLibro(P, r, despues) {
  P.ev('window.__libro = ' + JSON.stringify(r) + '; window.__libroDespues = ' + JSON.stringify(despues || null));
  P.ev(`window.NubeCRM = {
    libroAlDia: function () { return window.__libro; },
    libroAlDiaEsperando: function () { if (window.__libroDespues) window.__libro = window.__libroDespues; return Promise.resolve(window.__libro); }
  };`);
}
const llaveDe = P => String(P.ev('PUENTE.llaveEnLaNube(DB.socios[0])'));
const toqueDe = P => /juntarConUnToque\('([^']+)','([^']+)',(true|false)\)/.exec(P.elems.juntarBoton.innerHTML);
async function tocar(P, m) {
  P.ev('juntarConUnToque(' + JSON.stringify(m[1]) + ',' + JSON.stringify(m[2]) + ',' + m[3] + ')');
  await asentar(24);
}
const vueltas = P => P.ev('window.__hist.vueltas');
const CON_CC = Object.assign({}, JORGE, { cedula: '79111222' });
const OTRA = { id: 'C2', numero: 9, nombre: 'Otra Persona', cedula: '79111222', telefono: '3009998888', whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [] };

describe('su ficha sube sola al tocar, y el crédito sigue esperando a que la nube junte', () => {
  test('el cuadro dice que al tocar la sube primero; el toque la sube, junta por la nube y registra lo que aceptó', async () => {
    const { P, N, preguntas } = montar();
    conHistoriales(P, { conf: {} });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.match(plano(b), /Su ficha todavía no subió a la nube desde este computador: al tocar, la subo primero \(es automático, unos segundos\) y después la junto como siempre\./);
    assert.match(b, /onclick="juntarConUnToque\('41','C1',false\)">🔗 Sí, es la misma persona: juntar<\/button>/);
    assert.doesNotMatch(b, /Subir historiales|Subir su ficha|Avanzado/, 'le pidió subir algo a mano');
    assert.equal(vueltas(P), 0, 'subió antes del toque');
    await tocar(P, toqueDe(P));
    assert.equal(vueltas(P), 1, 'el toque no corrió la subida');
    assert.equal(P.ev('window.__hist.porOrden'), true, 'la vuelta no fue la del clic');
    assert.equal(P.ev('!!window.__hist.subirTodo'), false, 'subió a todos con el botón de Ajustes');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1, 'no juntó por la nube');
    const p = creditos(P);
    assert.equal(p.length, 1, 'no siguió con el crédito: ' + avisos(P));
    assert.equal(p[0].capital, 1200000);
    const fin = preguntas.find(m => /registrado para Jorge Antiguo/.test(m));
    assert.match(fin, /💸 Ya puedes girarle \$1\.200\.000 a Nequi 300 111 2233, a nombre de Jorge Antiguo/);
  });

  test('la nube sigue mirando todo: si al juntar dice que ese celular es de otra ficha, no registra nada', async () => {
    const { P, N } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'telefono_con_otra_ficha' } } });
    conHistoriales(P, { conf: {} });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    await tocar(P, toqueDe(P));
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1, 'no le preguntó a la nube');
    assert.equal(creditos(P).length, 0, 'registró con un «no» de la nube');
    assert.match(avisos(P), /No la junté\.[\s\S]*Y sin juntarla no registro el crédito\./);
  });

  test('si la subida no alcanza a confirmarla: no junta, no registra, y lo dice sin mandar a Ajustes', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {} });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    await tocar(P, toqueDe(P));
    assert.equal(vueltas(P), 2, 'no lo intentó una segunda vez');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
    assert.equal(creditos(P).length, 0);
    assert.match(avisos(P), /No la junté\.\n\nIntenté subir su ficha y la nube todavía no la confirmó \(Tus clientes ven lo de hace 2 h\)\. Vuelve a tocar en un momento\.\n\nY sin juntarla no registro el crédito\./);
    assert.doesNotMatch(avisos(P), /Avanzado|Subir historiales/);
  });

  test('si la nube tiene fichas más nuevas: el cuadro lo dice ANTES, sin toque, y no sube nada', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, { ok: false, motivo: 'nube-mas-nueva', fichas: 2 });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.doesNotMatch(b, /juntarConUnToque\(|claveNuevaYJuntar\(|mesaDeCruce\(/, 'ofreció algo que termina juntando');
    assert.match(plano(b), /Este computador no está subiendo las fichas de tus clientes a la nube, y sin subir la suya no junto su cuenta ni registro el crédito\. No lo llames todavía\./);
    assert.match(plano(b), /Por qué: La nube tiene 2 fichas más nuevas que esta cartera/);
    assert.match(b, /onclick="cerrarModal\(\)">Cerrar/);
    assert.equal(vueltas(P), 0);
  });

  test('tras importar un respaldo (cartera sin comprobar): no ofrece el toque ni sube nada', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, ultimo: { fase: 'esperando-libro', motivo: 'falta-emparejar', pausa: 'respaldo' } });
    conLibro(P, { ok: false, motivo: 'falta-emparejar' });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.doesNotMatch(P.elems.juntarBoton.innerHTML, /juntarConUnToque\(/);
    assert.match(plano(P.elems.juntarBoton.innerHTML), /Por qué: Estoy emparejando tu cartera con la nube/);
    /* Y si igual llegara un toque (un modal viejo), no sube a ciegas. */
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(vueltas(P), 0);
    assert.equal(creditos(P).length, 0);
    assert.match(avisos(P), /No la junté\.\n\nEste computador no está subiendo las fichas de tus clientes a la nube, y sin subir la suya no la junto: Estoy emparejando/);
  });

  test('«comparando»: el toque espera la comparación y, si está al día, sube y junta', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, habilitado: false });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    conLibro(P, { ok: false, motivo: 'comparando' }, { ok: true, motivo: 'al-dia' });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const m = toqueDe(P);
    assert.ok(m, 'mientras compara, el toque se ofrece (espera la comparación)');
    await tocar(P, m);
    assert.equal(vueltas(P), 1);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 1);
  });

  test('si otra ficha tiene su misma cédula: lo dice antes, nombra cuál, sin toque y sin subir', async () => {
    const { P } = montar({ socios: [CON_CC, OTRA] });
    conHistoriales(P, { conf: {} });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.match(plano(b), /Su ficha no puede subir a la nube: otra ficha tiene su mismo celular o su misma cédula \( CL-0009 · Otra Persona \)/);
    assert.match(plano(b), /Hasta entonces su cuenta no se junta y el crédito no se registra\./);
    assert.doesNotMatch(b, /juntarConUnToque\(/);
    assert.match(b, /verCliente\('C2'\)/);
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(vueltas(P), 0, 'intentó subir una ficha que choca');
    assert.match(avisos(P), /Su ficha no sube a la nube: otra ficha tiene su mismo celular o su misma cédula \(CL-0009 · Otra Persona\)/);
  });

  test('con la cartera sin guardar no sube: lo dice antes', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {} });
    P.ev('_libroSinGuardar = true');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.doesNotMatch(P.elems.juntarBoton.innerHTML, /juntarConUnToque\(/);
    assert.match(plano(P.elems.juntarBoton.innerHTML), /Por qué: tu cartera no se pudo guardar en este navegador, y no subo lo que no quedó guardado/);
  });

  test('desde 📥 Registrados también sube sola y junta', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {} });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    await tocar(P, toqueDe(P));
    assert.equal(vueltas(P), 1);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(P.ev('DB.socios[0].cuentaJunta.celular'), CEL);
  });

  test('la mesa («compararlos») también sube sola antes de juntar, y registra lo que aceptó', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {} });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(24);
    assert.equal(vueltas(P), 1);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 1, 'no registró: ' + avisos(P));
  });

  test('la mesa sin poder subir: no registra, y el porqué no manda a Ajustes', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, { ok: false, motivo: 'nube-mas-nueva', fichas: 1 });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(24);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
    assert.equal(creditos(P).length, 0);
    assert.match(avisos(P), /Este computador no está subiendo las fichas de tus clientes a la nube, y sin subir la suya no la junto: La nube tiene 1 ficha más nueva/);
    assert.doesNotMatch(avisos(P), /Subir historiales|Avanzado/);
  });

  test('una respuesta tardía de la nube no pinta el toque de un cliente en el cuadro de OTRO', async () => {
    const ANA = { id: 'C2', numero: 9, nombre: 'Ana Segunda', cedula: '', telefono: '3005556666', whatsappIgual: true,
      referencia: { nombre: '', telefono: '' }, gestiones: [] };
    const REG2 = Object.assign({}, REG, { id: 42, nombre: 'Ana Segunda', telefono: '3005556666', datos: { nombres: 'Ana', apellidos: 'Segunda', celular: '3005556666' } });
    let soltar = null;
    const envolverRed = base => (url, cfg) => {
      const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
      let c = null; try { c = JSON.parse(cfg.body); } catch (e) { c = null; }
      if (fn === 'cuentas_de_registros' && c && c.p_ids[0] === 41 && !soltar) return new Promise(r => { soltar = () => r(base(url, cfg)); });
      return base(url, cfg);
    };
    const { P, N } = montar({ socios: [JORGE, ANA], registros: [REG, REG2], envolverRed,
      nube: { cuentas_de_registros: c => [Object.assign({}, CUENTA, { registro_id: c.p_ids[0], celular: c.p_ids[0] === 42 ? '3005556666' : CEL })] } });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    P.ev('cerrarModal()');
    P.ev("abrirJuntarCuenta('42','C2')");
    await asentar();
    assert.match(P.elems.juntarBoton.innerHTML, /juntarConUnToque\('42','C2'/, 'precondición: el toque de Ana');
    soltar();
    await asentar(16);
    assert.doesNotMatch(P.elems.juntarBoton.innerHTML, /juntarConUnToque\('41','C1'/, 'pintó el toque de Jorge en el cuadro de Ana');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
  });

  test('con su ficha ya arriba, nada cambia: ni nota ni subida', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {} });
    P.ev('window.__hist.conf.C1 = ' + JSON.stringify(llaveDe(P)));
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.doesNotMatch(plano(P.elems.juntarBoton.innerHTML), /no subió a la nube/);
    await tocar(P, toqueDe(P));
    assert.equal(vueltas(P), 0);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 1);
  });

  test('en un computador que no sube historiales (la reja no aplica), el toque es el de siempre', async () => {
    const { P } = montar();
    P.ev('window.HistorialesAuto = { configurado: function () { return false; }, llaveConfirmada: function () { return null; } }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(P.elems.juntarBoton.innerHTML, /🔗 Sí, es la misma persona: juntar/);
    assert.doesNotMatch(plano(P.elems.juntarBoton.innerHTML), /no subió a la nube/);
  });

  test('nunca hay un camino que registre el crédito sin juntar', () => {
    const crm = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    assert.doesNotMatch(crm, /\{sinJuntar:|op\.sinJuntar|registrarSinJuntar|subirFichaParaJuntar|bloqueSubirParaJuntar/);
    assert.match(crm, /function crearDesdeSolicitud\(id,idFicha\)\{/);
  });
});

/* ============================================================================
 * LA REVISIÓN DE v146 (14-nov, v147). Lo que la revisión adversaria le encontró
 * a «su ficha sube sola al tocar», ya publicada.
 * ==========================================================================*/
describe('revisión de v146: lo que pasa mientras sube, la mesa con la cédula, la clave rechazada', () => {
  test('si Joan cierra el cuadro mientras sube su ficha, el toque NO junta al terminar', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, lenta: true });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev('juntarConUnToque(' + JSON.stringify('41') + ',' + JSON.stringify('C1') + ',false)');
    await asentar();
    assert.equal(vueltas(P), 1, 'precondición: está subiendo');
    P.ev('cerrarModal()');
    P.ev('window.__soltarVuelta()');
    await asentar(24);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó después de que Joan cerró el cuadro');
    assert.equal(creditos(P).length, 0);
    assert.match(avisos(P), /No junté la cuenta de Jorge Antiguo: cerraste su cuadro \(o abriste otro\) mientras subía su ficha\. Su ficha ya quedó arriba en la nube\. Si es él, vuelve a abrir su cuadro y toca «juntar»\./);
  });

  test('…y si abre el cuadro de OTRO cliente mientras sube, tampoco junta al primero', async () => {
    const ANA = { id: 'C2', numero: 9, nombre: 'Ana Segunda', cedula: '', telefono: '3005556666', whatsappIgual: true,
      referencia: { nombre: '', telefono: '' }, gestiones: [] };
    const REG2 = Object.assign({}, REG, { id: 42, nombre: 'Ana Segunda', telefono: '3005556666', datos: { nombres: 'Ana', apellidos: 'Segunda', celular: '3005556666' } });
    const { P, N } = montar({ socios: [JORGE, ANA], registros: [REG, REG2],
      nube: { cuentas_de_registros: c => [Object.assign({}, CUENTA, { registro_id: c.p_ids[0], celular: c.p_ids[0] === 42 ? '3005556666' : CEL })] } });
    conHistoriales(P, { conf: { C2: '3005556666' }, lenta: true });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar();
    P.ev('cerrarModal()');
    P.ev("abrirJuntarCuenta('42','C2')");
    await asentar();
    P.ev('window.__soltarVuelta()');
    await asentar(24);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó a Jorge desde el cuadro de Ana');
    assert.match(P.elems.juntarBoton.innerHTML, /juntarConUnToque\('42','C2'/, 'el cuadro de Ana quedó tocado');
  });

  test('una solicitud que no estaba pendiente al tocar no se registra (la abrió mientras subía)', () => {
    const { P } = montar({ solicitudes: [ACEPTADA(), ACEPTADA({ id: 's2' })] });
    P.ev("_trasJuntar = { sol: 's2', socio: 'C1', reg: '41', en: Date.now() }");
    assert.equal(P.ev("seguirTrasJuntar('41','C1',{ok:true,texto:'junta'},'s1')"), false);
    assert.equal(creditos(P).length, 0);
    assert.equal(P.ev('_trasJuntar && _trasJuntar.sol'), 's2', 'se comió lo pendiente de la otra');
  });

  test('la mesa: llenarle la cédula a una ficha que ya subió por su celular junta con el celular y registra, sin subir', async () => {
    const CON_CEDULA = Object.assign({}, REG, { cedula: '79111222' });
    const { P, N } = montar({ registros: [CON_CEDULA] });
    conHistoriales(P, { conf: { C1: CEL } });
    P.ev("window.__hist.alVolver = { C1: '79111222' }");
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("marcadosDelCruce = () => ['cedula']");
    P.ev("document.getElementById('cruceVerif').checked = true");
    P.ev("aplicarCruce('41','C1')");
    await asentar(24);
    assert.equal(P.ev('DB.socios[0].cedula'), '79111222', 'precondición: el cruce le cargó la cédula');
    assert.equal(vueltas(P), 0, 'subió una ficha que la nube ya conocía');
    const j = llamadasA(N, 'vincular_cuenta_joan');
    assert.equal(j.length, 1, 'no juntó: ' + avisos(P));
    assert.equal(j[0].c.p_ficha, CEL, 'no juntó con la llave que la nube conoce');
    assert.equal(creditos(P).length, 1, 'el crédito que en v145 se registraba no se registró');
    assert.doesNotMatch(avisos(P), /todavía no la confirmó/);
  });

  test('la mesa: una ficha que nunca subió se sube ya cruzada y se junta con la llave y el nombre de ahora', async () => {
    const CON_CEDULA = Object.assign({}, REG, { cedula: '79111222' });
    const { P, N } = montar({ registros: [CON_CEDULA] });
    conHistoriales(P, { conf: {} });
    P.ev("window.__hist.alVolver = { C1: '79111222' }");
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("marcadosDelCruce = () => ['cedula']");
    P.ev("document.getElementById('cruceVerif').checked = true");
    P.ev("aplicarCruce('41','C1')");
    await asentar(24);
    assert.equal(vueltas(P), 1);
    const j = llamadasA(N, 'vincular_cuenta_joan');
    assert.equal(j.length, 1, 'no juntó: ' + avisos(P));
    assert.equal(j[0].c.p_ficha, '79111222');
    assert.equal(j[0].c.p_nombre, 'Jorge Antiguo');
    assert.equal(creditos(P).length, 1);
  });

  test('con la clave de sincronización rechazada no insiste (cada intento gasta el freno de todos) y lo dice antes', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {}, ultimo: { fase: 'clave' },
      cinta: { l1: 'La nube no aceptó tu clave de sincronización', l2: 'Revísala en Ajustes y toca «Guardar conexión» · pruebo otra vez sola en 15 min' } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.doesNotMatch(P.elems.juntarBoton.innerHTML, /juntarConUnToque\(/);
    assert.match(plano(P.elems.juntarBoton.innerHTML), /Por qué: La nube no aceptó tu clave de sincronización: Revísala en Ajustes y toca «Guardar conexión»\./);
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(vueltas(P), 0, 'gastó un intento con la clave mala');
  });

  test('desde 📥 Registrados, el cuadro que no deja juntar no habla de ningún crédito', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, { ok: false, motivo: 'nube-mas-nueva', fichas: 1 });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    const b = plano(P.elems.juntarBoton.innerHTML);
    assert.match(b, /y sin subir la suya no junto su cuenta\. No lo llames todavía\./);
    assert.doesNotMatch(b, /crédito/);
  });

  test('sin aceptar todavía, dice que su solicitud no queda en su ficha, no «el crédito»', async () => {
    const { P } = montar({ solicitudes: [SOL()] });
    conHistoriales(P, { conf: {}, habilitado: false });
    conLibro(P, { ok: false, motivo: 'nube-mas-nueva', fichas: 1 });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = plano(P.elems.juntarBoton.innerHTML);
    assert.match(b, /no junto su cuenta, y su solicitud no queda en su ficha\./);
    assert.doesNotMatch(b, /registro el crédito/);
  });
});

/* ============================================================================
 * CON FICHAS EN DISCUSIÓN, LA SUYA SUBE IGUAL (14-nov). El cliente siguiente
 * no pudo: «Hay 23 fichas de tu cartera en discusión con la nube: en cuanto
 * decidas en ☁ Subir (paso 7), suben solos», y el crédito sin registrar. Joan:
 * «eso de subir a la nube manualmente quítalo, quiero que sea automático».
 * Con el historiales-auto.js de hoy (subirUna), el toque sube SOLO su ficha y
 * junta por la nube como siempre. Fallan contra 952e5fc salvo las que vigilan
 * que lo que no está emparejado siga frenando.
 * ==========================================================================*/
const EN_DISCUSION_23 = { ok: false, motivo: 'en-discusion', congeladas: 23 };
const conPorCliente = (P, r) => P.ev('NubeCRM.libroPorCliente = function () { return ' + JSON.stringify(r) + '; }');

describe('con fichas en discusión, la suya sube igual: registrar desde la propuesta sin subir nada a mano', () => {
  test('con 23 fichas en discusión, el cuadro ofrece el toque; el toque sube SOLO su ficha, junta por la nube y registra el crédito', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, una: true });
    conLibro(P, EN_DISCUSION_23);
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.doesNotMatch(plano(b), /no está subiendo|paso 7|☁ Subir/, 'mandó a subir o a decidir a mano');
    assert.match(plano(b), /al tocar, la subo primero \(es automático, unos segundos\) y después la junto como siempre\./);
    assert.match(b, /onclick="juntarConUnToque\('41','C1',false\)"/);
    await tocar(P, toqueDe(P));
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__hist.unas)')), ['C1'], 'no subió su ficha sola');
    assert.equal(vueltas(P), 0, 'corrió la vuelta de todos en vez de subir solo la suya');
    assert.equal(P.ev('!!window.__hist.subirTodo'), false, 'subió a todos con el botón de Ajustes');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1, 'no juntó por la nube');
    assert.equal(creditos(P).length, 1, 'no registró el crédito: ' + avisos(P));
  });

  test('si su ficha es de las que están en discusión, el cuadro lo dice antes: su app va a mostrar lo de este computador', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, una: true });
    conLibro(P, EN_DISCUSION_23);
    conPorCliente(P, { ok: false, motivo: 'en-discusion', congeladas: 23, clientes: { C1: { enDiscusion: true } } });
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = plano(P.elems.juntarBoton.innerHTML);
    assert.match(b, /Ojo: su ficha no coincide con la de la nube \(la tocaste aquí y en el celular\)\. Su app va a mostrar lo de este computador; lo de la nube no se borra y lo decides cuando quieras\./);
    await tocar(P, toqueDe(P));
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 1, 'no registró el crédito: ' + avisos(P));
  });

  test('…y si lo más nuevo de su ficha está en la nube (lo del celular), también lo dice', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, una: true });
    conLibro(P, { ok: false, motivo: 'nube-mas-nueva', fichas: 2 });
    conPorCliente(P, { ok: false, motivo: 'nube-mas-nueva', fichas: 2, clientes: { C1: { masNueva: true } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(plano(P.elems.juntarBoton.innerHTML), /Ojo: la nube tiene algo más nuevo de su ficha \(lo que anotaste en el celular\)\. Su app va a mostrar lo de este computador/);
  });

  test('con la cartera sin emparejar todavía, sigue sin ofrecer el toque y dice por qué', async () => {
    const { P } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, una: true });
    conLibro(P, { ok: false, motivo: 'falta-emparejar' });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = plano(P.elems.juntarBoton.innerHTML);
    assert.doesNotMatch(P.elems.juntarBoton.innerHTML, /juntarConUnToque\(/);
    assert.match(b, /Por qué: Estoy emparejando tu cartera con la nube/);
  });

  test('si su ficha no puede subir sola (otra ficha vive en la nube con su celular): no junta, no registra, dice por qué y no reintenta', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, una: true,
      unaFallas: [{ fase: 'fila', motivo: 'Su celular es todavía la llave con que Ana Primera vive en la nube: si son la misma persona, junta las dos fichas; si no, corrige el número.' }] });
    conLibro(P, EN_DISCUSION_23);
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    await tocar(P, toqueDe(P));
    assert.equal(P.ev('window.__hist.unas.length'), 1, 'reintentó algo que reintentar no arregla');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
    assert.equal(creditos(P).length, 0);
    assert.match(avisos(P), /Su ficha no subió a la nube, y sin ella no la junto: Su celular es todavía la llave con que Ana Primera vive en la nube/);
  });

  test('una nube que falló una vez se reintenta una sola vez, y entonces junta y registra', async () => {
    const { P, N } = montar();
    conHistoriales(P, { conf: {}, habilitado: false, una: true, unaFallas: [{ fase: 'error', motivo: 'La nube respondió 500' }] });
    conLibro(P, EN_DISCUSION_23);
    P.ev('window.__hist.alVolver = { C1: ' + JSON.stringify(llaveDe(P)) + ' }');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    await tocar(P, toqueDe(P));
    assert.equal(P.ev('window.__hist.unas.length'), 2);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(creditos(P).length, 1, 'no registró el crédito: ' + avisos(P));
  });
});
