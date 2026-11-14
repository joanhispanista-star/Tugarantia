'use strict';
/* ============================================================================
 * CON EL CLIENTE AL LADO — 14 de noviembre de 2026 (v148)
 *
 *   node --test pruebas/con-el-cliente-al-lado.test.js
 *
 * Joan tenía a un cliente sentado a su lado y no pudo registrarle el crédito
 * que había aceptado: «¿Es la misma persona?» solo ofrecía Cerrar. «Sigue sin
 * tener un botón para registrar». A «si la nube no logra juntar la cuenta, ¿el
 * botón igual debe registrar el crédito?» contestó «Sí, registrarlo igual»:
 * él lo verifica en persona. Con el CRM de verdad (banco-panel.js):
 *
 *   1. el cuadro del pantallazo (la subida frenada) ofrece el botón;
 *   2. el botón abre las tres casillas, y sin las tres no registra nada; con
 *      ellas, registra lo que aceptó con todas sus rejas, deja escrito que fue
 *      sin juntar y en persona, y la ficha queda por juntar;
 *   3. juntar sigue siendo lo primero: el botón sale cuando juntar no se puede
 *      ahora, o cuando la nube ya dijo que no;
 *   4. no se ofrece con la ficha junta con OTRA cuenta, ni sin propuesta
 *      aceptada, ni si la cuenta ya está junta;
 *   5. sin registro con qué juntar, también;
 *   6. a cuotas (el otro cliente del día), por su propia puerta;
 *   7. tras la mesa de cruce, el cuadro de las tres casillas se abre solo.
 * Los nombres y números son de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const CEL = '3001112222';
const plano = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const dos = n => (n < 10 ? '0' : '') + n;
const enDias = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + dos(x.getMonth() + 1) + '-' + dos(x.getDate()); };
const CREADA = '2026-11-12T15:00:00Z';

const JORGE = { id: 'C1', numero: 7, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [] };
const REG = { id: 41, nombre: 'Jorge Antiguo', cedula: '', telefono: CEL, origen: 'abierto', estado: 'nuevo',
  creado_en: '2026-11-08T14:55:00Z', datos: { nombres: 'Jorge', apellidos: 'Antiguo', celular: CEL } };
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
  const P = abrirPanel(Object.assign({ red: N.red }, o.ahora ? { ahora: o.ahora } : {}));
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera({ socios: (o.socios || [JORGE]).map(x => JSON.parse(JSON.stringify(x))), prestamos: [], config: { negocio: 'Tu Garantía' } });
  P.ctx.open = () => {};
  if (o.registros !== false) P.ev('_registros = ' + JSON.stringify(o.registros || [REG]));
  P.ev('_solicitudes = ' + JSON.stringify(o.solicitudes || [ACEPTADA()]));
  const preguntas = [];
  /* Sí a todo, menos al WhatsApp de bienvenida (no abre nada). */
  P.ctx.confirm = m => { preguntas.push(String(m)); return o.responde ? o.responde(String(m)) : !/bienvenida/.test(String(m)); };
  return { P, N, preguntas };
}
const llamadasA = (N, fn) => N.vistas.filter(v => v.fn === fn);
const avisos = P => (P.ctx._avisos || []).join('\n');
const creditos = P => JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
const ficha = P => JSON.parse(P.ev('JSON.stringify(DB.socios[0])'));
const boton = P => P.elems.juntarBoton.innerHTML;
/* La subida de historiales de v146: sin subirUna, frena con fichas en discusión.
   Es el cuadro del pantallazo de Joan. */
function subidaFrenada(P) {
  P.ev(`window.HistorialesAuto = {
    configurado: function () { return true; }, habilitado: function () { return false; },
    llaveConfirmada: function () { return null; },
    estado: function () { return { ultimo: null, cinta: { l1: 'Tus clientes ven lo de hace 2 h', l2: '' } }; },
    vuelta: function () { return Promise.resolve({}); }, algoCambio: function () {} };`);
  P.ev(`window.NubeCRM = { libroAlDia: function () { return { ok: false, motivo: 'en-discusion', fichas: 23 }; },
    libroAlDiaEsperando: function () { return Promise.resolve({ ok: false, motivo: 'en-discusion', fichas: 23 }); } };`);
}
/* Las tres casillas, marcadas (o las que se digan). */
function marcar(P, cuales) {
  (cuales || [1, 2, 3]).forEach(n => P.ev("document.getElementById('enPersona" + n + "').checked = true"));
  P.ev('enPersonaListo()');
}
const RX_BOTON = /onclick="registrarEnPersona\('s1','C1'\)">✍️ Está conmigo: registrar el crédito sin juntar<\/button>/;

/* ======================================================================== */
describe('1. el cuadro del pantallazo ofrece el botón', () => {
  test('con la subida frenada (23 fichas en discusión): Cerrar, y además «✍️ Está conmigo: registrar el crédito sin juntar»', async () => {
    const { P, N } = montar();
    subidaFrenada(P);
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = boton(P);
    assert.match(plano(b), /Este computador no está subiendo las fichas de tus clientes a la nube/, 'precondición: es el cuadro del pantallazo');
    assert.match(b, RX_BOTON, 'el cuadro sigue sin botón para registrar');
    assert.match(plano(b), /¿Está contigo en persona\? Puedes registrar igual el crédito que aceptó, sin juntar su cuenta: antes te pido verificar tres cosas con él\./);
    assert.doesNotMatch(b, /juntarConUnToque\(|claveNuevaYJuntar\(|mesaDeCruce\(/, 'ofreció juntar con la subida frenada');
    assert.equal(creditos(P).length, 0, 'registró antes de que Joan tocara nada');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
  });
});

/* ======================================================================== */
describe('2. las tres casillas', () => {
  async function abrirCasillas(o) {
    const m = montar(o);
    subidaFrenada(m.P);
    m.P.ev("juntarYDesembolsar('s1')");
    await asentar();
    m.P.ev("registrarEnPersona('s1','C1')");
    return m;
  }

  test('el botón abre el cuadro de las tres cosas, con la cuenta a la que se le gira, y el botón apagado', async () => {
    const { P } = await abrirCasillas();
    assert.equal(P.elems.mTitle.textContent, 'Registrar el crédito sin juntar su cuenta');
    const h = P.elems.mBody.innerHTML, t = plano(h);
    assert.match(t, /Le registras a CL-\d+ · Jorge Antiguo el crédito que aceptó la cuenta del 300 111 2222 \(le propusiste \$1\.200\.000 y devuelve \$1\.440\.000/);
    for (const n of [1, 2, 3]) assert.match(h, new RegExp('<input type="checkbox" id="enPersona' + n + '" onchange="enPersonaListo\\(\\)">'));
    /* `plano` deja un espacio donde estaba el </b>. */
    assert.match(t, /1\. Viste su cédula, y es Jorge Antiguo ?\./);
    assert.match(t, /2\. Te mostró en su celular, entrando a la app, la propuesta aceptada\./);
    assert.match(t, /3\. Te dijo él mismo a qué cuenta le consignas, sin que tú se la leyeras, y es Nequi 300 111 2233 ?\./);
    assert.match(t, /Al girar, tu banco te muestra el titular: compáralo con su cédula, y si no es él, no gires\./);
    assert.match(t, /Su app no lo muestra todavía\. Su cuenta queda por juntar en su ficha/);
    assert.match(h, /id="btnEnPersona" disabled onclick="confirmarEnPersona\('s1','C1'\)">✍️ Lo verifiqué en persona: registrar el crédito/);
    assert.equal(P.ev("document.getElementById('btnEnPersona').disabled"), true);
    assert.equal(creditos(P).length, 0);
  });

  test('sin las tres marcadas no registra nada, aunque llegue el toque', async () => {
    const { P } = await abrirCasillas();
    marcar(P, [1, 3]);
    assert.equal(P.ev("document.getElementById('btnEnPersona').disabled"), true, 'el botón se soltó con dos de tres');
    P.ev("confirmarEnPersona('s1','C1')");
    await asentar(8);
    assert.equal(creditos(P).length, 0, 'registró sin las tres casillas');
    assert.match(avisos(P), /Marca las tres casillas/);
    assert.equal(P.ev("_solicitudes.some(x=>x.id==='s1')"), true);
  });

  test('con las tres: registra lo que aceptó, dice que fue sin juntar, y la ficha queda por juntar', async () => {
    const { P, N, preguntas } = await abrirCasillas();
    marcar(P);
    assert.equal(P.ev("document.getElementById('btnEnPersona').disabled"), false);
    P.ev("confirmarEnPersona('s1','C1')");
    await asentar(8);
    const p = creditos(P);
    assert.equal(p.length, 1, 'no registró: ' + avisos(P));
    assert.equal(p[0].capital, 1200000);
    assert.equal(p[0].socioId, 'C1');
    assert.deepEqual(p[0].consignarA && p[0].consignarA.numero, '3001112233');
    assert.equal(p[0].sinJuntar.cuenta, CEL);
    assert.equal(p[0].sinJuntar.solicitud, 's1');
    assert.equal(p[0].sinJuntar.registro_id, 41);
    assert.ok(!isNaN(Date.parse(p[0].sinJuntar.verificadoEnPersona)));
    const f = ficha(P);
    assert.equal(f.cuentaPorJuntar && f.cuentaPorJuntar.registro_id, 41, 'la ficha no quedó por juntar');
    assert.equal(f.cuentaPorJuntar.por, 'crm');
    assert.ok(!f.cuentaJunta, 'dijo que la cuenta quedó junta');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'intentó juntar');
    assert.equal(llamadasA(N, 'marcar_solicitud').map(x => x.c.p_estado).join(), 'atendida');
    assert.equal(P.ev("_solicitudes.some(x=>x.id==='s1')"), false, 'la solicitud se quedó en la bandeja');
    assert.equal(P.ev('_trasJuntar'), null);
    const fin = preguntas.find(m => /registrado para Jorge Antiguo/.test(m)) || '';
    assert.match(fin, /💸 Ya puedes girarle \$1\.200\.000 a Nequi 300 111 2233, a nombre de Jorge Antiguo\. Al girar, tu banco te muestra el titular: compáralo con su cédula\./);
    assert.match(fin, /✍️ Lo registraste sin juntar su cuenta: su app todavía no lo muestra\. Quedó por juntar en su ficha: se junta sola cuando su ficha suba a la nube/);
    /* Pasó por la confirmación de siempre, con las cifras. */
    assert.ok(preguntas.some(m => /^Crear el crédito de Jorge Antiguo:/.test(m) && /Capital: \$1\.200\.000/.test(m)));
  });

  test('si Joan cancela en «¿Lo registro?», no queda nada: ni crédito, ni por juntar', async () => {
    const { P } = await abrirCasillas({ responde: m => !/^Crear el crédito/.test(m) });
    marcar(P);
    P.ev("confirmarEnPersona('s1','C1')");
    await asentar(8);
    assert.equal(creditos(P).length, 0);
    assert.ok(!ficha(P).cuentaPorJuntar, 'la dejó por juntar sin crédito');
    assert.equal(P.ev("_solicitudes.some(x=>x.id==='s1')"), true);
  });

  test('las rejas de siempre siguen: una propuesta vencida a un solo pago pregunta antes', async () => {
    const venc = ACEPTADA();
    venc.contrapropuesta.fecha_pago = enDias(-2);
    venc.contrapropuesta.condiciones.base.fecha_pago = venc.contrapropuesta.fecha_pago;
    const { P, preguntas } = await abrirCasillas({ solicitudes: [venc], responde: m => !/nace VENCIDO|bienvenida/.test(m) });
    marcar(P);
    P.ev("confirmarEnPersona('s1','C1')");
    await asentar(8);
    assert.ok(preguntas.some(m => /el crédito nace VENCIDO/.test(m)), 'se saltó la reja de la vencida');
    assert.equal(creditos(P).length, 0);
  });
});

/* ======================================================================== */
describe('3. juntar sigue siendo lo primero', () => {
  test('si juntar se puede, el cuadro ofrece juntar (y dice que registra), sin el botón de en persona', async () => {
    const { P } = montar();
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = boton(P);
    assert.match(b, /onclick="juntarConUnToque\('41','C1',false\)">🔗 Sí, es la misma persona: juntar y registrar el crédito<\/button>/);
    assert.doesNotMatch(b, /registrarEnPersona\(/, 'ofreció saltarse juntar cuando juntar se podía');
  });

  test('si la nube dice que no al juntar: el cuadro sigue abierto con el botón, y el aviso dice dónde está', async () => {
    const { P } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'telefono_con_otra_ficha' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.equal(creditos(P).length, 0, 'registró con el «no» de la nube, sin las casillas');
    assert.match(avisos(P), /No la junté\.[\s\S]*Y sin juntarla no registro el crédito\.\n\nSi está contigo en persona: abajo en el cuadro, «✍️ Está conmigo: registrar el crédito sin juntar»\./);
    assert.match(boton(P), RX_BOTON);
    assert.match(plano(boton(P)), /¿Está contigo en persona\? La nube no juntó su cuenta\./);
    /* Y si cierra y vuelve a abrir, el cuadro ya lo sabe. */
    P.ev('cerrarModal()');
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(boton(P), /juntarConUnToque\(/, 'dejó de ofrecer juntar');
    assert.match(boton(P), RX_BOTON, 'al volver a abrir, olvidó que la nube dijo que no');
  });

  test('la cuenta que pide la clave nueva: la clave nueva, y también el botón', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { cuenta_creada_en: '2026-09-01T10:00:00Z', recado_abierto: true })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = boton(P);
    assert.match(b, /claveNuevaYJuntar\('41','C1',false\)/);
    assert.doesNotMatch(b, /juntarConUnToque/);
    assert.match(b, RX_BOTON);
  });
});

/* ======================================================================== */
describe('4. lo que no se ofrece', () => {
  test('la ficha ya junta con OTRA cuenta: no hay botón, y se dice por qué', async () => {
    const OTRA_CUENTA = Object.assign({}, JORGE, { cuentaJunta: { celular: '3009990000', fecha: '2026-11-01', registro_id: 9 } });
    const { P } = montar({ socios: [OTRA_CUENTA], nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { cuenta_creada_en: '2026-09-01T10:00:00Z', recado_abierto: true })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    const b = boton(P);
    assert.doesNotMatch(b, /registrarEnPersona\(/);
    assert.match(plano(b), /No te ofrezco registrarlo sin juntar: su ficha ya está junta con otra cuenta de la app \(el 300 999 0000\), y esa cuenta vería el crédito\./);
    P.ev("registrarEnPersona('s1','C1')");
    assert.notEqual(P.elems.mTitle.textContent, 'Registrar el crédito sin juntar su cuenta');
    P.ev("crearDesdeSolicitud('s1','C1',{enPersona:true})");
    await asentar(8);
    assert.equal(creditos(P).length, 0, 'registró en una ficha junta con otra cuenta');
  });

  test('si la nube dice que la ficha está junta con otra cuenta, tampoco', async () => {
    const { P } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'ficha_con_otra_cuenta' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1',false)");
    await asentar(16);
    assert.doesNotMatch(boton(P), /registrarEnPersona\(/);
    assert.doesNotMatch(avisos(P), /Si está contigo en persona/);
    assert.match(plano(boton(P)), /No te ofrezco registrarlo sin juntar/);
  });

  test('sin propuesta aceptada no hay nada que registrar: no sale', async () => {
    const { P } = montar({ solicitudes: [SOL()], nube: { cuentas_de_registros: [Object.assign({}, CUENTA, { cuenta_creada_en: '2026-09-01T10:00:00Z', recado_abierto: true })] } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.doesNotMatch(boton(P), /registrarEnPersona\(|enPersona/);
  });

  test('con la cuenta ya junta en este computador no hace falta: va por «✓ Desembolsar» de siempre', async () => {
    const JUNTA = Object.assign({}, JORGE, { cuentaJunta: { celular: CEL, fecha: '2026-11-13', registro_id: 41 } });
    const { P } = montar({ socios: [JUNTA] });
    P.ev("registrarEnPersona('s1','C1')");
    assert.notEqual((P.elems.mTitle || {}).textContent, 'Registrar el crédito sin juntar su cuenta');
    assert.match(avisos(P), /ya no se puede registrar desde aquí/);
  });

  test('el equipo no lo tiene: el botón y la puerta viven solo en el CRM de Joan', () => {
    const crm = require('fs').readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    const f = /function puedeRegistrarEnPersona\(sol,ficha\)\{([\s\S]*?)\n\}/.exec(crm);
    assert.ok(f, 'falta puedeRegistrarEnPersona');
    assert.match(f[1], /^\s*if\(typeof CARTERA_EQUIPO!=='undefined'&&CARTERA_EQUIPO\) return \{ok:false\};/);
  });
});

/* ======================================================================== */
describe('5. sin registro con qué juntar', () => {
  test('la cuenta sin ningún registro: el aviso de siempre, y después las tres casillas; la ficha no queda por juntar', async () => {
    const { P, preguntas } = montar({ solicitudes: [ACEPTADA({ registro_id: null })], registros: false });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(avisos(P), /No encontré ningún registro del 300 111 2222 \(ni nuevo ni atendido\), y la nube no junta una cuenta sin registro[\s\S]*No le registres el crédito sin juntar, salvo que esté contigo en persona: no sabemos si es la misma persona\.\n\nSi está contigo en persona, ahora te muestro cómo registrarlo sin juntar\./);
    assert.equal(P.elems.mTitle.textContent, 'Registrar el crédito sin juntar su cuenta');
    marcar(P);
    P.ev("confirmarEnPersona('s1','C1')");
    await asentar(8);
    assert.equal(creditos(P).length, 1, 'no registró: ' + avisos(P));
    assert.equal(creditos(P)[0].sinJuntar.registro_id, null);
    assert.ok(!ficha(P).cuentaPorJuntar, 'la dejó por juntar sin registro con qué juntarse');
    const fin = preguntas.find(m => /registrado para Jorge Antiguo/.test(m)) || '';
    assert.match(fin, /Para que lo vea, júntale la cuenta desde su ficha \(«🔗 Buscar su registro»; si no aparece, que primero llene su registro en la app\)\./);
  });
});

/* ======================================================================== */
describe('6. a cuotas, por su propia puerta', () => {
  test('la propuesta a cuotas aceptada se registra a cuotas, con lo que aceptó, y dice que fue sin juntar', async () => {
    const M = require(path.join(__dirname, '..', 'app', 'motor.js'));
    const HOY = '2026-11-13';
    const plan = M.construirPlanACuotas(2000000, [{ fecha: '2026-11-30', pct: 20 }, { fecha: '2026-12-15', pct: 15 }, { fecha: '2027-01-31', pct: 10 }],
      { fechaDesembolso: HOY });
    const cuotas = plan.cuotas.map(q => ({ numero: q.numero, fecha: q.fecha_corte, pct: q.pct, capital: q.capital, costo: q.costo, total: q.total }));
    const sol = ACEPTADA();
    sol.contrapropuesta = { capital: 2000000, costo: plan.total_costo, total: plan.total_a_pagar, producto: 'quincenal', cuotas,
      fecha_pago: cuotas[cuotas.length - 1].fecha, dias: 79, texto: '', por: 'joan', creada_en: CREADA,
      condiciones: { version: '2026-10-22', aceptadas_en: '2026-11-13T13:38:00Z', lineas: [], tope_mora: null,
        base: { capital: 2000000, total: plan.total_a_pagar, fecha_pago: cuotas[cuotas.length - 1].fecha, creada_en: CREADA } } };
    const { P, preguntas } = montar({ solicitudes: [sol], ahora: '2026-11-13T10:00:00' });
    subidaFrenada(P);
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    assert.match(boton(P), RX_BOTON);
    P.ev("registrarEnPersona('s1','C1')");
    marcar(P);
    P.ev("confirmarEnPersona('s1','C1')");
    await asentar(8);
    const p = creditos(P);
    assert.equal(p.length, 1, 'no registró: ' + avisos(P) + ' | ' + preguntas.join(' | '));
    assert.equal(p[0].capital, 2000000);
    assert.ok(Array.isArray(p[0].planPagos) || (p[0].planPagos && typeof p[0].planPagos === 'object'), 'no quedó a cuotas');
    assert.equal(p[0].sinJuntar.solicitud, 's1');
    assert.equal(ficha(P).cuentaPorJuntar.registro_id, 41);
    const fin = preguntas.find(m => /✓ Crédito a cuotas/.test(m)) || '';
    assert.match(fin, /✍️ Lo registraste sin juntar su cuenta: su app todavía no lo muestra\./);
  });
});

/* ======================================================================== */
describe('7. tras la mesa de cruce', () => {
  test('si la mesa cruza pero la nube no junta: el aviso, y después las tres casillas', async () => {
    const { P } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'telefono_con_otra_ficha' } } });
    P.ev("juntarYDesembolsar('s1')");
    await asentar();
    P.ev("mesaDeCruce('41','C1',true)");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    assert.match(avisos(P), /Quedó cruzado con su ficha, pero su cuenta en la app NO quedó junta, así que el crédito NO lo registré[\s\S]*Si está contigo en persona, ahora te muestro cómo registrarlo sin juntar\./);
    assert.equal(P.elems.mTitle.textContent, 'Registrar el crédito sin juntar su cuenta');
    assert.equal(creditos(P).length, 0, 'registró sin las casillas');
  });
});
