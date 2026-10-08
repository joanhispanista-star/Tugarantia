/* ============================================================================
 * LOS CIERRES DE LA PUERTA ÚNICA EN EL CRM — 7 de octubre de 2026 (segunda vuelta)
 *
 *   node --test pruebas/una-puerta-cierres-crm.test.js
 *
 * Tres revisiones probaron la puerta única antes de publicarla. Cada prueba de
 * acá es uno de sus hallazgos, con el CRM de verdad corriendo (banco-panel.js)
 * y una nube de mentira, escrita para que falle con el código de antes:
 *
 *   · el toque pedía «el WhatsApp con el código V-…», que nadie manda desde
 *     el 8-sep (ahora: llamar al número de la FICHA);
 *   · con señales raras (cuenta anterior al registro, recado abierto) el
 *     toque juntaba igual; ahora ofrece la clave nueva al número de la ficha
 *     y junta una hora después;
 *   · juntar podía unir la cuenta con la fila de OTRA persona (la ficha que
 *     choca nunca se confirma; va el nombre);
 *   · la mesa marcaba «atendido» y si la nube no juntaba, no quedaba dónde
 *     volver a tocar;
 *   · el cruce que le cambia la llave a la ficha dejaba la cuenta pegada a la
 *     fila vieja;
 *   · el cliente ya atendido no tenía cómo juntarse («🔗 Buscar su registro»);
 *   · deshacer una unión dejaba en la ficha la selfie y los datos del otro;
 *   · la solicitud de una cuenta sin juntar se pegaba a la ficha de su número;
 *   · textos que hablaban de códigos y un reloj que no llegaba a correr.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const UP = require('../panel/una-puerta.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

const CARTERA = {
  socios: [
    { id: 'C1', numero: 7, nombre: 'Adriana Antigua', cedula: '', telefono: '3001112222', whatsappIgual: true },
    { id: 'C2', numero: 8, nombre: 'Bruno Cedula', cedula: '52111222', telefono: '3003334444', whatsappIgual: true }
  ],
  prestamos: [],
  config: { negocio: 'Tu Garantía' }
};
const REG = { id: 41, nombre: 'Adriana Registrada', cedula: '', telefono: '3001112222', origen: 'abierto',
  estado: 'nuevo', creado_en: '2026-10-07T14:55:00Z', datos: { verificacion: 'V-48211', nombres: 'Adriana', apellidos: 'Antigua' } };
const CUENTA_NORMAL = { registro_id: 41, celular: '3001112222', cuenta: true, cuenta_creada_en: '2026-10-07T14:56:00Z',
  minutos_antes_del_registro: -1, junta_con: null, recado_abierto: false, verificacion: 'V-48211' };

function nube(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    const cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null;
    vistas.push({ fn, cuerpo });
    if (cuerpo && 'p_clave' in cuerpo && cuerpo.p_clave !== CLAVE) return Promise.resolve(resp(400, { message: 'clave de sincronización incorrecta' }));
    if (o[fn] !== undefined) {
      const r = typeof o[fn] === 'function' ? o[fn](cuerpo) : o[fn];
      return Promise.resolve(r && r.status ? resp(r.status, r.cuerpo) : resp(200, r));
    }
    if (fn === 'archivos_de_registro') return Promise.resolve(resp(200, { fotos: {}, huella: null }));
    if (fn === 'marcar_registro') return Promise.resolve(resp(200, true));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas };
}
function montar(o) {
  o = o || {};
  const N = nube(o.nube);
  const P = abrirPanel({ red: N.red });
  if (o.conNube !== false) P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera(JSON.parse(JSON.stringify(o.cartera || CARTERA)));
  P.ctx._abiertos = [];
  P.ctx.open = u => { P.ctx._abiertos.push(String(u)); };
  if (o.registros !== false) P.ev('_registros = ' + JSON.stringify(o.registros || [REG]));
  return { P, N };
}
const llamadasA = (N, fn) => N.vistas.filter(v => v.fn === fn);
const avisos = P => (P.ctx._avisos || []).join('\n');
const conHistoriales = (P, llaves) =>
  P.ev('window.HistorialesAuto = { llaveConfirmada: id => (' + JSON.stringify(llaves) + ')[id] || null }');

/* ======================================================================== */
describe('el toque ya no pide el WhatsApp con el código: pide llamar al número de la ficha', () => {

  test('el modal corto dice «llamaste al 300 111 2222 (el número de su ficha)» y no enseña el código', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [CUENTA_NORMAL] } });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    const todo = plano(P.elems.juntarCuenta.innerHTML + P.elems.juntarBoton.innerHTML);
    assert.match(todo, /Tócalo solo si llamaste al 300 111 2222 \(el número de su ficha\)/);
    assert.ok(!/WhatsApp con el código|te llegó por WhatsApp|Código de verificación/.test(todo), 'sigue pidiendo una prueba que nadie manda');
    assert.ok(!/V-48211/.test(todo), 'enseña el código como si probara algo');
  });

  test('la mesa pide «llamé al número de su ficha» y la bandeja ya no enseña el código', () => {
    const { P } = montar();
    P.ev("mesaDeCruce('41','C1')");
    const h = P.elems.mBody.innerHTML;
    assert.match(plano(h), /Llamé a Adriana Antigua al 300 111 2222 \(el número de su ficha\)/);
    assert.ok(!/Me llegó el código/.test(h));
    P.ev('renderRegistros()');
    assert.ok(!/V-48211|verif\./.test(P.elems.tblRegistros.innerHTML));
  });
});

/* ======================================================================== */
describe('cuando la cuenta es más vieja que el registro: clave nueva al número de la ficha, y una hora', () => {
  const RARA = Object.assign({}, CUENTA_NORMAL, { minutos_antes_del_registro: 4320, cuenta_creada_en: '2026-10-04T14:55:00Z' });

  test('el toque no ofrece juntar: ofrece la clave nueva', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [RARA] } });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    const b = P.elems.juntarBoton.innerHTML;
    assert.ok(!/juntarConUnToque/.test(b), 'ofreció juntar con un toque una cuenta abierta 3 días antes del registro');
    assert.match(b, /claveNuevaYJuntar\('41','C1',false\)/);
    assert.match(plano(P.elems.juntarCuenta.innerHTML), /un toque no basta/i);
  });

  test('la clave va a la cuenta del registro, se anota la ficha, y la cuenta queda por juntar desde una hora después', async () => {
    const { P, N } = montar({ nube: { cuentas_de_registros: [RARA],
      clave_temporal_joan: { ok: true, celular: '3001112222', clave: 'k3m9p2xq' } } });
    const antes = Date.now();
    P.ev("claveNuevaYJuntar('41','C1',false)");
    await asentar();
    assert.deepEqual(llamadasA(N, 'clave_temporal_joan')[0].cuerpo, { p_clave: CLAVE, p_celular: '3001112222', p_ficha: '3001112222' });
    const cp = JSON.parse(P.ev("JSON.stringify(DB.socios.find(s=>s.id==='C1').cuentaPorJuntar)"));
    assert.equal(cp.registro_id, 41);
    assert.equal(cp.por, 'crm');
    assert.ok(Date.parse(cp.noAntesDe) >= antes + 3600000, 'no espera la hora del token de quien estuviera adentro');
    const m = P.elems.mBody.innerHTML;
    assert.match(m, /k3m9p2xq/);
    assert.match(m, /href="https:\/\/wa\.me\/573001112222\?text=/);
    assert.match(decodeURIComponent(m), /Entra con el celular 300 111 2222 y esa contraseña/);
  });

  test('la vuelta de 45 s no la junta antes de su hora; después sí, como toque de Joan', async () => {
    const { P, N } = montar({ nube: { vincular_cuenta_joan: { ok: true, celular: '3001112222' } } });
    conHistoriales(P, { C1: '3001112222' });
    P.ev("DB.socios[0].cuentaPorJuntar={registro_id:41,desde:'2026-10-07',por:'crm',noAntesDe:new Date(Date.now()+30*60000).toISOString()}");
    await P.ev('juntarCuentasPendientes()');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó antes de que venciera la sesión del otro');
    P.ev("DB.socios[0].cuentaPorJuntar.noAntesDe=new Date(Date.now()-60000).toISOString()");
    await P.ev('juntarCuentasPendientes()');
    const j = llamadasA(N, 'vincular_cuenta_joan')[0];
    assert.equal(j.cuerpo.p_por, 'crm');
    assert.equal(j.cuerpo.p_nombre, 'Adriana Antigua');
  });

  test('si la nube dice «clave reciente», la ficha anota desde qué hora y no insiste', async () => {
    const desde = new Date(Date.now() + 40 * 60000).toISOString();
    const { P, N } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'clave_reciente', se_puede_desde: desde, razones: [] } } });
    conHistoriales(P, { C1: '3001112222' });
    P.ev("DB.socios[0].cuentaPorJuntar={registro_id:41,desde:'2026-10-07',por:'crm'}");
    await P.ev('juntarCuentasPendientes()');
    assert.equal(P.ev('DB.socios[0].cuentaPorJuntar.noAntesDe'), desde);
    await P.ev('juntarCuentasPendientes()');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
  });

  test('«necesita clave nueva» deja en la ficha el botón de la clave', async () => {
    const { P } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'necesita_clave_nueva',
      razones: ['La cuenta de ese celular se abrió más de una hora antes del registro.'] } } });
    conHistoriales(P, { C1: '3001112222' });
    P.ev("DB.socios[0].cuentaPorJuntar={registro_id:41,desde:'2026-10-07',por:'crm'}");
    await P.ev('juntarCuentasPendientes()');
    P.ev("verCliente('C1')");
    assert.match(P.elems.mBody.innerHTML, /claveNuevaYJuntar\('41','C1',true\)/);
  });

  test('una clave dada desde un recado a esa ficha también cuenta: la ficha deja de pedirla y espera su hora', async () => {
    const cartera = JSON.parse(JSON.stringify(CARTERA));
    cartera.socios[0].cuentaPorJuntar = { registro_id: 41, desde: '2026-10-07', por: 'crm', motivo: 'x', pideClave: true };
    const { P, N } = montar({ cartera, nube: { clave_temporal_joan: { ok: true, celular: '3001112222', clave: 'aa22bb33' } } });
    P.ev("_ayudas=[{id:9,celular:'3001112222',nota:'',creada_en:'2026-10-07'}]");
    P.ev('darClaveNueva(9)');
    await asentar();
    assert.equal(llamadasA(N, 'clave_temporal_joan')[0].cuerpo.p_ficha, '3001112222');
    const cp = JSON.parse(P.ev("JSON.stringify(DB.socios[0].cuentaPorJuntar)"));
    assert.ok(!cp.motivo && !cp.pideClave && cp.noAntesDe);
  });

  test('una cuenta del equipo no se reinicia desde un recado, y se dice por qué', async () => {
    const { P } = montar({ nube: { clave_temporal_joan: { ok: false, motivo: 'equipo' } } });
    P.ev("_ayudas=[{id:10,celular:'3105550000',nota:'',creada_en:'2026-10-07'}]");
    P.ev('darClaveNueva(10)');
    await asentar();
    assert.match(avisos(P), /alguien de tu equipo/);
  });
});

/* ======================================================================== */
describe('juntar no une la cuenta con la fila de nube de otra persona', () => {

  test('si este computador sube historiales, la llave tiene que ser la que la nube le confirmó a ESTA ficha', async () => {
    const { P, N } = montar({ nube: { cuentas_de_registros: [CUENTA_NORMAL], vincular_cuenta_joan: { ok: true, celular: '3001112222' } } });
    conHistoriales(P, {});   // la ficha choca con otra: nunca se confirmó
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1')");
    await asentar();
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó una ficha cuya fila de nube puede ser de otro');
    assert.match(avisos(P), /comparte\s+celular o cédula con otra/);
    conHistoriales(P, { C1: '3001112222' });
    P.ev("juntarConUnToque('41','C1')");
    await asentar(16);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan')[0].cuerpo.p_nombre, 'Adriana Antigua', 'no mandó el nombre para que la nube lo compare');
  });

  test('si la nube dice que la fila es de otra persona, se nombra a quién', () => {
    const t = UP.textoMotivo({ motivo: 'otra_fila', nombre_en_la_nube: 'Beto Primero' });
    assert.match(t, /«Beto Primero»/);
    assert.match(t, /otra persona/);
  });

  test('mismoNombre dice lo mismo que public.mismo_nombre', () => {
    assert.equal(UP.mismoNombre('Adriana Pérez', 'ADRIANA PEREZ GÓMEZ'), true);
    assert.equal(UP.mismoNombre('  Beto   Primero ', 'beto primero'), true);
    assert.equal(UP.mismoNombre('Beto Primero', 'Ana Segunda'), false);
    assert.equal(UP.mismoNombre('Adri', 'Adriana'), false);
    assert.equal(UP.mismoNombre('', ''), false);
    /* Las mismas letras en las dos reglas. */
    const sql = fs.readFileSync(path.join(__dirname, '..', 'base', '20261007_una_puerta.sql'), 'utf8');
    const m = /translate\(lower\(coalesce\(p, ''\)\), '([^']+)', '([^']+)'\)/.exec(sql);
    assert.ok(m, 'no encontré el translate de nombre_plano');
    assert.equal(UP.nombrePlano(m[1]), m[2]);
  });
});

/* ======================================================================== */
describe('la mesa: si no junta en el momento, queda anotado en la ficha', () => {

  test('la nube contesta que no: el registro sale de la bandeja, pero la ficha ofrece «🔗 Juntar su cuenta»', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [CUENTA_NORMAL],
      vincular_cuenta_joan: { ok: false, motivo: 'sin_historial_en_la_nube' } } });
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    const cp = JSON.parse(P.ev("JSON.stringify(DB.socios[0].cuentaPorJuntar||null)"));
    assert.ok(cp, 'la cuenta no quedó por juntar en ninguna parte');
    assert.equal(cp.registro_id, 41);
    assert.match(avisos(P), /Quedó anotada en su ficha/);
    P.ev("verCliente('C1')");
    assert.match(P.elems.mBody.innerHTML, /juntarPendienteAhora\('C1'\)/);
  });

  test('sin nube, la mesa lo dice y no se queda «preguntando» para siempre; con nube, el botón espera la respuesta', async () => {
    const sin = montar({ conNube: false });
    sin.P.ev("mesaDeCruce('41','C1')");
    assert.match(plano(sin.P.elems.juntarCuenta.innerHTML), /Sin conexión con la nube/);
    assert.ok(!/id="btnCruceJuntar" disabled/.test(sin.P.elems.mBody.innerHTML));

    const con = montar({ nube: { cuentas_de_registros: [CUENTA_NORMAL] } });
    con.P.ev("mesaDeCruce('41','C1')");
    assert.match(con.P.elems.mBody.innerHTML, /id="btnCruceJuntar" disabled/, 'se puede juntar antes de ver la cuenta');
    await asentar();
    assert.equal(con.P.elems.btnCruceJuntar.disabled, false, 'el botón no se soltó cuando la nube contestó');
  });

  test('el cruce que le cambia la llave a la ficha no junta con la fila vieja: junta cuando la ficha suba con la nueva', async () => {
    const reg = Object.assign({}, REG, { cedula: '1012345678', telefono: '3002220000' });
    const { P, N } = montar({ registros: [reg], nube: { cuentas_de_registros: [Object.assign({}, CUENTA_NORMAL, { celular: '3002220000' })],
      vincular_cuenta_joan: { ok: true, celular: '3002220000' } } });
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    P.ev("marcadosDelCruce = () => ['cedula', 'telefono']");
    P.ev("document.getElementById('cruceVerif').checked = true");
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'juntó con la llave vieja: la cuenta quedaría pegada a una fila congelada');
    assert.equal(P.ev("DB.socios[0].cuentaPorJuntar.por"), 'crm');
    conHistoriales(P, { C1: '3001112222' });          // todavía la fila de antes
    await P.ev('juntarCuentasPendientes()');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0);
    conHistoriales(P, { C1: '1012345678' });          // ya subió con la cédula
    await P.ev('juntarCuentasPendientes()');
    const j = llamadasA(N, 'vincular_cuenta_joan')[0];
    assert.equal(j.cuerpo.p_ficha, '1012345678');
    assert.equal(j.cuerpo.p_por, 'crm');
  });
});

/* ======================================================================== */
describe('el cliente que ya se registró y quedó atendido tiene camino', () => {

  test('la ficha no supone que no se ha registrado, y ofrece «🔗 Buscar su registro»', () => {
    const { P } = montar();
    P.ev("verCliente('C1')");
    const h = P.elems.mBody.innerHTML;
    assert.ok(!/Cuando se registre, te sale en 📥 Registrados/.test(h), 'sigue diciendo que no se ha registrado');
    assert.match(h, /buscarRegistroParaJuntar\('C1'\)/);
  });

  test('trae su registro atendido, abre el toque solo para juntar (sin volver a cruzar) y no lo mete a la bandeja', async () => {
    const atendido = Object.assign({}, REG, { estado: 'atendido' });
    const { P, N } = montar({ registros: [], nube: {
      listar_registros: c => (c.p_estado === 'atendido' ? [atendido] : []),
      cuentas_de_registros: [CUENTA_NORMAL],
      vincular_cuenta_joan: { ok: true, celular: '3001112222' } } });
    P.ev("buscarRegistroParaJuntar('C1')");
    await asentar();
    assert.deepEqual(llamadasA(N, 'listar_registros').map(v => v.cuerpo.p_estado).sort(), ['atendido', 'nuevo']);
    assert.match(plano(P.elems.mBody.innerHTML), /ya lo atendiste/);
    assert.match(P.elems.juntarBoton.innerHTML, /juntarConUnToque\('41','C1',true\)/);
    assert.equal(P.ev('_registros.length'), 0, 'un registro atendido apareció en la bandeja de los nuevos');
    P.ev("juntarConUnToque('41','C1',true)");
    await asentar(16);
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    assert.equal(llamadasA(N, 'marcar_registro').length, 0, 'volvió a cruzar un registro ya cruzado');
    assert.equal(P.ev("DB.socios[0].cuentaJunta.celular"), '3001112222');
  });

  test('«Cuentas juntas» de una ficha sin unión manda a buscar su registro', async () => {
    const { P } = montar({ nube: { vinculos_listar: [] } });
    P.ev("cuentaDeLaFicha('C1')");
    await asentar();
    assert.match(plano(P.elems.mBody.innerHTML), /Buscar su registro/);
    assert.ok(!/Cuando se registre con su celular, te sale en 📥 Registrados/.test(P.elems.mBody.innerHTML));
  });
});

/* ======================================================================== */
describe('deshacer una unión equivocada también ofrece deshacer su cruce', () => {

  test('vuelven los datos de antes, se sueltan las fotos de ese registro y lo que el cruce puso', async () => {
    const cartera = JSON.parse(JSON.stringify(CARTERA));
    Object.assign(cartera.socios[0], {
      ciudad: 'Cali', selfieFoto: 'foto:reg:3001112222/selfie', cedulaFrenteFoto: 'foto:reg:3001112222/cedula_frente',
      huellaRegistro: { ip: '1.2.3.4' }, vinculacion: { documento: '999' }, cuentaJunta: { celular: '3001112222', fecha: '2026-10-07' },
      cruces: [{ fecha: '2026-10-07', registro_id: '41', celular: '3001112222', campos: [{ campo: 'ciudad', tenia: 'Bogotá', queda: 'Cali' }],
                 previo: { vinculacion: null, referencia: null, puso: ['huella'] } }] });
    const { P } = montar({ cartera, nube: { desvincular_cuenta_joan: { ok: true, mensajes_devueltos: 1, sesiones_cerradas: true },
      vinculos_listar: [] } });
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(m); return true; };
    P.ctx.prompt = () => 'no era ella';
    P.ev("deshacerUnion('3001112222','Adriana Antigua','3001112222')");
    await asentar();
    assert.match(preguntas[0], /Los datos y las fotos que el cruce/);
    assert.ok(preguntas.some(p => /¿Deshago también el cruce\?/.test(p)), 'no ofreció deshacer el cruce');
    const s = JSON.parse(P.ev('JSON.stringify(DB.socios[0])'));
    assert.equal(s.ciudad, 'Bogotá');
    assert.ok(!s.selfieFoto && !s.cedulaFrenteFoto, 'la selfie del otro sigue en la ficha');
    assert.ok(!s.huellaRegistro, 'la huella que puso el cruce sigue');
    assert.ok(!s.vinculacion, 'los datos declarados del otro siguen');
    assert.ok(s.cruces[0].deshecho, 'el hecho no quedó marcado deshecho');
  });

  test('desde hoy el cruce anota lo que la ficha tenía antes', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [CUENTA_NORMAL], vincular_cuenta_joan: { ok: true, celular: '3001112222' } } });
    P.ev("DB.socios[0].vinculacion={documento:'111'}");
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    const c = JSON.parse(P.ev('JSON.stringify(DB.socios[0].cruces.slice(-1)[0])'));
    assert.deepEqual(c.previo.vinculacion, { documento: '111' });
  });
});

/* ======================================================================== */
describe('la solicitud de una cuenta sin juntar no se pega a la ficha de su número', () => {
  const SOL = { id: 's1', cedula: '3001112222', nombre: 'Alguien', capital: 100000, tasa: 0.2, costo: 20000, total: 120000,
    estado: 'aceptada', cuenta_sin_juntar: true, contrapropuesta: { capital: 100000, costo_pct: 20, dias: 8 },
    datos: { documento: '1234' }, creada_en: '2026-10-07T15:00:00Z' };

  test('ni para proponer, ni para desembolsar, ni en la bandeja', () => {
    const { P } = montar();
    P.ev('_solicitudes = ' + JSON.stringify([SOL, Object.assign({}, SOL, { id: 's2', cedula: '03001112222', cuenta_sin_juntar: false })]));
    assert.equal(P.ev("socioDeSolicitud(_solicitudes[0])"), null, 'la pegó a la ficha de Adriana');
    assert.equal(P.ev("socioDeSolicitud(_solicitudes[1])"), null, 'la de PlataChat (0 + celular) se pegó a Adriana');
    const antes = P.ev('DB.prestamos.length');
    P.ev("crearDesdeSolicitud('s1')");
    assert.equal(P.ev('DB.prestamos.length'), antes, 'desembolsó a nombre de la ficha');
    assert.equal(P.ev('DB.socios.length'), 2, 'le abrió una segunda ficha con el número de un cliente');
    assert.match(avisos(P), /no está junta con ninguna ficha/);
    P.ev('renderBandeja()');
    assert.match(plano(P.elems.bandeja.innerHTML), /Sin juntar: su celular es el de una de tus fichas/);
  });

  test('si este computador ya juntó esa cuenta con la ficha, sí es de ella', () => {
    const { P } = montar();
    P.ev("DB.socios[0].cuentaJunta={celular:'3001112222',fecha:'2026-10-07'}");
    P.ev('_solicitudes = ' + JSON.stringify([SOL]));
    assert.equal(P.ev("socioDeSolicitud(_solicitudes[0]).id"), 'C1');
  });
});

/* ======================================================================== */
describe('textos y relojes', () => {

  test('«Ver qué se va a subir» ya no habla de códigos', () => {
    const { P } = montar();
    P.ev('verMigracion()');
    const h = P.elems.mBody.innerHTML;
    assert.ok(!/sin código|Códigos de acceso|no tienen código/.test(h), 'sigue mandando a generar códigos');
  });

  test('las señales no mandan a deshacer la unión que ya es con esta ficha', () => {
    const c = Object.assign({}, CUENTA_NORMAL, { junta_con: '3001112222' });
    const misma = UP.senales(c, {}, ['3001112222'], '3001112222');
    assert.ok(misma.some(x => !x.ojo && /Ya está junta con esta ficha/.test(x.texto)));
    assert.ok(!misma.some(x => /con otra ficha/.test(x.texto)));
    const otra = UP.senales(c, {}, ['3001112222'], '52111222');
    assert.ok(otra.some(x => x.ojo && /con otra ficha/.test(x.texto)));
  });

  test('la invitación de fábrica ya no pide un código, y la copia vieja guardada se cambia', () => {
    const { P } = montar({ cartera: Object.assign({}, CARTERA, { plantillas: {
      invitacion: 'Hola {nombre}, te escribimos para pasarte tu código de entrada: {codigo}\nEntras acá: {enlace}\nEl código sirve para una sola persona, así que no lo reenvíes.' } }) });
    assert.ok(!/\{codigo\}|código/.test(P.ev('PLANTILLAS_DEF.invitacion.m')));
    assert.ok(!/codigo/.test(P.ev("JSON.stringify(TOKENS_POR_PLANTILLA.invitacion)")));
    assert.equal(P.ev('DB.plantillas.invitacion'), P.ev('PLANTILLAS_DEF.invitacion.m'));
  });

  test('Registrados ya no habla de canjear códigos', () => {
    /* Lo que Joan lee en pantalla (el subtítulo y la bandeja vacía); el
       comentario sobre los registros de la invitación de agosto es historia. */
    assert.ok(!/Se registraron solos o canjearon un código|el que canjee un código desde su celular/.test(CRM));
    const { P } = montar({ conNube: false, registros: false });
    P.ev('renderRegistros()');
    assert.ok(!/código/.test(plano(P.elems.tblRegistros.innerHTML)));
  });

  test('el WhatsApp de la clave nueva dice con qué celular se entra', () => {
    assert.match(UP.mensajeClaveNueva('Ana María', 'k3m9p2xq', '3009998888'), /^Hola Ana, .*k3m9p2xq\. Entra con el celular 300 999 8888 y esa contraseña/);
  });

  test('repintar no reinicia el reloj de 45 s: la vuelta llega aunque Joan esté trabajando', () => {
    const { P } = montar();
    let puestos = 0, quitados = 0;
    P.ctx.setInterval = () => { puestos++; return 7; };
    P.ctx.clearInterval = () => { quitados++; };
    P.ev('render()'); P.ev('render()'); P.ev('render()');
    assert.equal(puestos, 1, 'cada repintada vuelve a empezar la cuenta de 45 s');
    assert.equal(quitados, 0);
  });
});
