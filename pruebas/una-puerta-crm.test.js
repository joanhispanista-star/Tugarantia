/* ============================================================================
 * UNA SOLA PUERTA EN EL CRM — panel/crm.html y panel/una-puerta.js
 * 7 de octubre de 2026.
 *
 *   node --test pruebas/una-puerta-crm.test.js
 *
 * Lo que Joan decidió el 7-oct y estas pruebas sostienen con el CRM de verdad
 * corriendo (banco-panel.js) y una nube de mentira:
 *
 *   1. EL ANTIGUO SE JUNTA CON UN TOQUE, MIRANDO. «🔗 ¿Es la misma persona?»
 *      solo aparece cuando el puente lo reconoce con fuerza; el botón no se
 *      pinta hasta que la nube contestó por la cuenta; y lo que se manda es el
 *      registro y la llave de la ficha, nunca un celular escrito por nadie.
 *   2. NUNCA SOLO. Si la nube dice que no (teléfono con otra ficha, cuenta que
 *      no existe), se dice por qué y no se toca la ficha ni la bandeja.
 *   3. EL NUEVO SE JUNTA AL APROBARLO, cuando su historial ya está arriba; si
 *      la nube ve algo raro, la ficha pide el toque.
 *   4. LO EQUIVOCADO SE DESHACE, preguntando antes.
 *   5. LOS CÓDIGOS SE FUERON DEL CRM: ni en la ficha, ni en la lista, ni en el
 *      lote, ni en las plantillas.
 *   6. «OLVIDÉ MI CONTRASEÑA» TIENE SALIDA: una clave nueva, al número de la
 *      FICHA.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const UP = require('../panel/una-puerta.js');
const PU = require('../app/puente.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* Una clienta antigua SIN cédula (como 17 de las 28) y un cliente con cédula. */
const CARTERA = {
  socios: [
    { id: 'C1', numero: 7, nombre: 'Adriana Antigua', cedula: '', telefono: '3001112222', whatsappIgual: true,
      codigoAcceso: 'K7QP3', codigoEnviadoEn: '2026-08-21' },
    { id: 'C2', numero: 8, nombre: 'Bruno Cedula', cedula: '52111222', telefono: '+57 300 333 4444', whatsappIgual: true }
  ],
  prestamos: [],
  config: { negocio: 'Tu Garantía' }
};
/* El registro de alguien con el celular de Adriana. */
const REG = { id: 41, nombre: 'Adriana Registrada', cedula: '', telefono: '3001112222', origen: 'abierto',
  estado: 'nuevo', creado_en: '2026-10-07T14:55:00Z', datos: { verificacion: 'TG-4821', nombres: 'Adriana', apellidos: 'Antigua' } };

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
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera(JSON.parse(JSON.stringify(o.cartera || CARTERA)));
  P.ctx._abiertos = [];
  P.ctx.open = u => { P.ctx._abiertos.push(String(u)); };
  if (o.registros !== false) P.ev('_registros = ' + JSON.stringify(o.registros || [REG]));
  return { P, N };
}
const llamadasA = (N, fn) => N.vistas.filter(v => v.fn === fn);
const avisos = P => (P.ctx._avisos || []).join('\n');

/* ======================================================================== */
describe('el toque: «¿Es la misma persona?»', () => {

  test('solo aparece cuando el puente lo reconoce con fuerza', () => {
    const { P } = montar();
    P.ev('renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.match(h, /abrirJuntarCuenta\('41','C1'\)/, 'el mismo celular sin nada que lo contradiga no ofreció el toque');
    const solo = montar({ registros: [Object.assign({}, REG, { id: 42, telefono: '3009990000' })] });
    solo.P.ev('renderRegistros()');
    assert.ok(!/abrirJuntarCuenta/.test(solo.P.elems.tblRegistros.innerHTML),
      'un parecido de nombre ofreció juntar la cuenta');
  });

  test('el botón no se pinta hasta que la nube contestó por la cuenta, y se pinta con sus señales', async () => {
    const { P, N } = montar({ nube: { cuentas_de_registros: [{ registro_id: 41, celular: '3001112222', cuenta: true,
      cuenta_creada_en: '2026-10-07T14:54:00Z', minutos_antes_del_registro: 1, junta_con: null,
      recado_abierto: true, verificacion: 'TG-4821' }] } });
    P.ev("abrirJuntarCuenta('41','C1')");
    assert.ok(!/juntarConUnToque/.test(P.elems.mBody.innerHTML), 'el toque salió antes de ver la cuenta');
    assert.match(P.elems.mBody.innerHTML, /Un desconocido con el número o la cédula de tu\s+cliente lo vería todo/);
    await asentar();
    const q = llamadasA(N, 'cuentas_de_registros')[0];
    assert.deepEqual(q.cuerpo, { p_clave: CLAVE, p_ids: [41] });
    const cuenta = P.elems.juntarCuenta.innerHTML, boton = P.elems.juntarBoton.innerHTML;
    assert.match(plano(cuenta), /recado de «Olvidé mi contraseña» abierto/, 'no mostró el recado abierto');
    /* 7-oct-2026 (segunda vuelta): con un recado de contraseña abierto un toque
       ya no basta (vincular_interna lo niega en las tres puertas): el botón es el
       de la clave nueva al número de la ficha. Ver una-puerta-cierres-crm.test.js. */
    assert.ok(!/juntarConUnToque/.test(boton), 'ofreció juntar con un toque una cuenta con un recado abierto');
    assert.match(boton, /claveNuevaYJuntar\('41','C1',false\)/);
    assert.match(plano(boton), /Un toque no basta/);
    /* Y la revisión automática, a la vista y sin nada biométrico. */
    assert.ok(P.elems.juntarRevision.innerHTML.length > 0);
    assert.match(plano(P.elems.juntarRevision.innerHTML), /Las fotos y el rostro se miran en «👁 Ver datos»/);
  });

  test('si ese celular no tiene cuenta, no hay botón de juntar', async () => {
    const { P } = montar({ nube: { cuentas_de_registros: [{ registro_id: 41, celular: '3001112222', cuenta: false }] } });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    assert.ok(!/juntarConUnToque/.test(P.elems.juntarBoton.innerHTML));
    assert.match(plano(P.elems.juntarCuenta.innerHTML), /no tiene cuenta en la app/);
  });

  test('juntar manda el registro y la llave de la ficha —nunca un celular— y después cruza', async () => {
    const { P, N } = montar({ nube: {
      cuentas_de_registros: [{ registro_id: 41, celular: '3001112222', cuenta: true, verificacion: 'TG-4821' }],
      vincular_cuenta_joan: { ok: true, ya_estaba: false, nombre: 'Adriana Antigua', celular: '3001112222', mensajes_movidos: 2 } } });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1')");
    await asentar(16);
    const j = llamadasA(N, 'vincular_cuenta_joan')[0];
    assert.ok(j, 'no llamó a juntar');
    assert.equal(j.cuerpo.p_registro_id, 41);
    assert.equal(j.cuerpo.p_ficha, '3001112222', 'la llave de una ficha sin cédula es su celular, como en sincronizar_socios');
    assert.equal(j.cuerpo.p_por, 'crm');
    assert.ok(!('p_celular' in j.cuerpo), 'la pantalla mandó un celular: el celular lo pone el servidor desde el registro');
    assert.ok(Array.isArray(j.cuerpo.p_revision.para_mirar), 'no se guardó qué decía la revisión al tocar');
    assert.equal(P.ev("DB.socios.find(s=>s.id==='C1').cuentaJunta.celular"), '3001112222');
    assert.ok(llamadasA(N, 'marcar_registro').length === 1, 'el registro no quedó atendido después de juntar');
    assert.match(avisos(P), /quedó junta con CL-0007/);
    assert.match(avisos(P), /2 mensajes que escribió antes de juntarla/);
  });

  test('si la nube dice que no, se dice por qué y no se toca ni la ficha ni la bandeja', async () => {
    const { P, N } = montar({ nube: {
      cuentas_de_registros: [{ registro_id: 41, celular: '3001112222', cuenta: true }],
      vincular_cuenta_joan: { ok: false, motivo: 'telefono_con_otra_ficha' } } });
    P.ev("abrirJuntarCuenta('41','C1')");
    await asentar();
    P.ev("juntarConUnToque('41','C1')");
    await asentar(16);
    assert.match(avisos(P), /Un teléfono solo puede ver una ficha/);
    assert.equal(P.ev("DB.socios.find(s=>s.id==='C1').cuentaJunta"), undefined);
    assert.equal(llamadasA(N, 'marcar_registro').length, 0, 'marcó atendido un registro que no quedó junto');
  });

  test('la mesa de cruce también junta, con la llave de ANTES de cargarle la cédula', async () => {
    const { P, N } = montar({ nube: {
      cuentas_de_registros: [{ registro_id: 41, celular: '3001112222', cuenta: true }],
      vincular_cuenta_joan: { ok: true, celular: '3001112222' } } });
    P.ev("mesaDeCruce('41','C1')");
    await asentar();
    assert.match(P.elems.mBody.innerHTML, /guardar y juntar su cuenta/);
    P.ev("DB.socios.find(s=>s.id==='C1').cedula='1032456789'");   // como si el cruce le cargara la cédula
    P.ev("aplicarCruce('41','C1')");
    await asentar(16);
    const j = llamadasA(N, 'vincular_cuenta_joan')[0];
    assert.ok(j, 'la mesa no juntó la cuenta');
    /* Acá la cédula ya estaba puesta antes de aplicar: la llave es la cédula. */
    assert.equal(j.cuerpo.p_ficha, '1032456789');
  });
});

/* ======================================================================== */
describe('el cliente nuevo: su cuenta se junta al aprobarlo', () => {

  function conHistoriales(P, llaves) {
    P.ev('window.HistorialesAuto = { llaveConfirmada: id => (' + JSON.stringify(llaves) + ')[id] || null }');
  }

  test('abrirle la ficha desde Registrados deja su cuenta por juntar', () => {
    const { P } = montar({ registros: [Object.assign({}, REG, { id: 50, telefono: '3007770000', nombre: 'Nueva Persona' })] });
    P.ev("fichaDesdeRegistro('50')");
    P.ev("document.getElementById('fNombre').value='Nueva Persona'; document.getElementById('fTel').value='3007770000'");
    P.ev('guardarCliente()');
    const cp = P.ev("JSON.stringify((DB.socios.find(s=>s.nombre==='Nueva Persona')||{}).cuentaPorJuntar||null)");
    assert.deepEqual(JSON.parse(cp).registro_id, 50, 'la ficha nueva no quedó con su cuenta por juntar');
  });

  test('se junta sola cuando su historial ya está arriba; antes no pregunta', async () => {
    const { P, N } = montar({ nube: { vincular_cuenta_joan: { ok: true, celular: '3007770000' } } });
    P.ev("DB.socios[1].cuentaPorJuntar={registro_id:50,desde:'2026-10-07'}");
    conHistoriales(P, {});
    await P.ev('juntarCuentasPendientes()');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 0, 'preguntó antes de que su historial subiera');
    conHistoriales(P, { C2: '52111222' });
    await P.ev('juntarCuentasPendientes()');
    const j = llamadasA(N, 'vincular_cuenta_joan')[0];
    assert.equal(j.cuerpo.p_por, 'aprobacion');
    assert.equal(j.cuerpo.p_ficha, '52111222');
    assert.equal(P.ev('DB.socios[1].cuentaPorJuntar'), undefined);
    assert.equal(P.ev('DB.socios[1].cuentaJunta.por'), 'aprobacion');
  });

  test('si la nube ve algo raro no la junta: la ficha lo dice y pide el toque', async () => {
    const { P, N } = montar({ nube: { vincular_cuenta_joan: { ok: false, motivo: 'pide_toque',
      razones: ['La cuenta de ese celular se abrió más de una hora antes del registro.'] } } });
    P.ev("DB.socios[1].cuentaPorJuntar={registro_id:50,desde:'2026-10-07'}");
    conHistoriales(P, { C2: '52111222' });
    await P.ev('juntarCuentasPendientes()');
    assert.match(P.ev('DB.socios[1].cuentaPorJuntar.motivo'), /más de una hora antes del registro/);
    /* Ya no vuelve a intentar sola: espera el toque. */
    await P.ev('juntarCuentasPendientes()');
    assert.equal(llamadasA(N, 'vincular_cuenta_joan').length, 1);
    P.ev("verCliente('C2')");
    assert.match(P.elems.mBody.innerHTML, /juntarPendienteAhora\('C2'\)/);
    assert.match(plano(P.elems.mBody.innerHTML), /falta tu toque/);
  });
});

/* ======================================================================== */
describe('deshacer una unión equivocada', () => {

  test('la lista viene de la nube, y deshacer manda la ficha y el motivo, y limpia lo de aquí', async () => {
    const { P, N } = montar({ nube: {
      vinculos_listar: [{ id: 3, ficha: '3001112222', nombre: 'Adriana Antigua', celular: '3001112222', por: 'crm',
        creado_en: '2026-10-07T15:00:00Z', deshecho_en: null }],
      desvincular_cuenta_joan: { ok: true, ya_estaba: false, mensajes_devueltos: 3, sesiones_cerradas: true } } });
    P.ev("DB.socios[0].cuentaJunta={celular:'3001112222',fecha:'2026-10-07'}");
    P.ev('cuentasJuntas()');
    await asentar();
    assert.match(P.elems.mBody.innerHTML, /deshacerUnion\('3001112222','Adriana Antigua','3001112222'\)/);
    assert.match(plano(P.elems.mBody.innerHTML), /Esta unión fue un error: deshacer/);
    P.ctx.prompt = () => 'no era ella';
    P.ev("deshacerUnion('3001112222','Adriana Antigua','3001112222')");
    await asentar();
    const d = llamadasA(N, 'desvincular_cuenta_joan')[0];
    assert.deepEqual(d.cuerpo, { p_clave: CLAVE, p_ficha: '3001112222', p_motivo: 'no era ella' });
    assert.equal(P.ev('DB.socios[0].cuentaJunta'), undefined);
    assert.match(avisos(P), /3 mensaje\(s\) volvieron a su conversación aparte/);
  });

  test('sin el sí de Joan no deshace nada', async () => {
    const { P, N } = montar({ nube: { desvincular_cuenta_joan: { ok: true } } });
    P.ctx.confirm = () => false;
    P.ev("deshacerUnion('3001112222','Adriana Antigua','3001112222')");
    await asentar();
    assert.equal(llamadasA(N, 'desvincular_cuenta_joan').length, 0);
  });
});

/* ======================================================================== */
describe('los códigos se fueron del CRM', () => {

  test('ni en la ficha ni en la lista: en su lugar, su cuenta en la app y «Cómo entrar»', () => {
    const { P } = montar();
    P.ev("verCliente('C1')");
    const f = P.elems.mBody.innerHTML;
    assert.ok(!/K7QP3|Mandar código|Generar su código|Código para entrar/.test(f), 'la ficha todavía enseña el código');
    assert.match(f, /cuentaDeLaFicha\('C1'\)/);
    assert.match(f, /mandarComoEntrar\('C1'\)/);
    P.ev('irA("clientes")'); P.ev('renderClientes()');
    const l = P.elems.tblClientes.innerHTML;
    assert.ok(!/Código app|K7QP3/.test(l), 'la lista todavía tiene la columna del código');
  });

  test('el lote que sube a la nube no lleva códigos, y la llave del puente es la del lote', () => {
    const { P } = montar();
    const lote = JSON.parse(P.ev('JSON.stringify(loteMigracion())'));
    lote.forEach(x => { assert.equal(x.codigo, null); assert.equal(x.codigo_forzar, false); });
    /* La llave con que se junta la cuenta (puente.llaveEnLaNube) es la misma
       que pone sincronizar_socios con este lote: la cédula, o el teléfono. */
    const llaves = lote.map(x => x.cedula || x.telefono);
    assert.deepEqual(llaves, CARTERA.socios.map(s => PU.llaveEnLaNube(s)));
    assert.deepEqual(llaves, ['3001112222', '52111222']);
  });

  test('«Cómo entrar» sale al WhatsApp de la ficha con el enlace y sin código', () => {
    const { P } = montar();
    P.ev("mandarComoEntrar('C1')");
    const u = decodeURIComponent(P.ctx._abiertos[0]);
    assert.match(u, /^https:\/\/wa\.me\/573001112222\?text=/);
    assert.match(u, /celular y tu contraseña/);
    assert.ok(!/K7QP3/.test(u));
  });

  test('una plantilla guardada que todavía habla del código se avisa', () => {
    const { P } = montar();
    P.ev("DB.plantillas.historial='Hola {nombre}, tu código es {codigo_acceso}: {enlace}'");
    P.ev('renderPlantillas()');
    assert.match(plano(P.elems.pltWrap.innerHTML), /habla del código de acceso, que se apagó el 7-oct/);
  });

  test('«Ver la app como la ve él» deja un pase de un uso con el id de la ficha', () => {
    const { P } = montar();
    P.ev("verComoSocio('C1')");
    const pase = JSON.parse(P.almacen.joan_ver_como);
    assert.equal(pase.id, 'C1');
    assert.match(P.ctx._abiertos[0], new RegExp('^\\.\\./app/socio\\.html#v=' + pase.nonce + '$'));
  });

  test('«Probar conexión» ya no pregunta por la puerta del código, y dice si falta la migración', async () => {
    const { P, N } = montar({ nube: { sincronizar_socios: 0 } });
    P.ev('probarSupabase()');
    await asentar();
    assert.ok(!N.vistas.some(v => v.fn === 'historial_socio_por_codigo'));
    assert.ok(N.vistas.some(v => v.fn === 'vinculos_listar'));
    assert.match(P.elems.sbEstado.innerHTML, /20261007_una_puerta\.sql/, 'no dijo qué migración falta');
  });
});

/* ======================================================================== */
describe('«🔑 Darle una clave nueva»', () => {

  test('va al número de la FICHA, avisa si no es el del recado, y muestra la clave una vez', async () => {
    const cartera = JSON.parse(JSON.stringify(CARTERA));
    /* La cuenta se juntó con un celular nuevo; la ficha conserva el suyo. */
    cartera.socios[0].cuentaJunta = { celular: '3009998888', fecha: '2026-10-07' };
    const { P, N } = montar({ cartera, nube: { clave_temporal_joan: { ok: true, celular: '3009998888', clave: 'k3m9p2xq' } } });
    P.ev("_ayudas=[{id:5,celular:'3009998888',nota:'cambié de teléfono',creada_en:'2026-10-07'}]");
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(m); return true; };
    P.ev('darClaveNueva(5)');
    assert.match(preguntas[0], /al número de su ficha \(CL-0007 Adriana Antigua\): 300 111 2222/);
    assert.match(preguntas[0], /OJO: ese NO es el número del recado/);
    await asentar();
    /* 7-oct-2026 (segunda vuelta): va también la ficha a cuyo número se manda. */
    assert.deepEqual(llamadasA(N, 'clave_temporal_joan')[0].cuerpo, { p_clave: CLAVE, p_celular: '3009998888', p_ficha: '3001112222' });
    const m = P.elems.mBody.innerHTML;
    assert.match(m, /k3m9p2xq/);
    assert.match(m, /href="https:\/\/wa\.me\/573001112222\?text=/, 'la clave no fue al número de la ficha');
    assert.match(decodeURIComponent(m), /cámbiala por una tuya/);
  });

  test('el recado ofrece el botón; sin cuenta lo dice con su arreglo', async () => {
    const { P } = montar({ nube: { clave_temporal_joan: { ok: false, motivo: 'sin_cuenta' } } });
    P.ev("_ayudas=[{id:6,celular:'3005550000',nota:'',creada_en:'2026-10-07'}]");
    P.ev('renderAyudas()');
    assert.match(P.elems.ayudas.innerHTML, /darClaveNueva\(6\)/);
    P.ev('darClaveNueva(6)');
    await asentar();
    assert.match(avisos(P), /no tiene cuenta en la app.*Registrarme/s);
  });
});

/* ======================================================================== */
describe('las palabras del toque (panel/una-puerta.js)', () => {

  test('cada motivo de la nube dice qué pasó y qué hacer', () => {
    ['sin_cuenta', 'sin_historial_en_la_nube', 'ficha_con_otra_cuenta', 'telefono_con_otra_ficha',
     'pide_toque', 'sin_registro', 'celular'].forEach(m => {
      const t = UP.textoMotivo({ motivo: m, razones: ['x'] });
      assert.ok(t.length > 40, m + ' no dice nada útil');
      assert.ok(!/c[oó]digo de acceso/i.test(t), m + ' habla de códigos');
    });
  });

  test('las señales marcan lo raro en ámbar y nunca dicen «verificado»', () => {
    const s = { telefono: '3001112222' };
    const sen = UP.senales({ cuenta: true, celular: '3009998888', minutos_antes_del_registro: 2880,
      recado_abierto: true, junta_con: '79000111', verificacion: '' }, s, ['3001112222']);
    const ojos = sen.filter(x => x.ojo).map(x => x.texto).join(' | ');
    assert.match(ojos, /2 días ANTES de este registro/);
    assert.match(ojos, /recado/);
    assert.match(ojos, /otra ficha/);
    assert.match(ojos, /NO es el de la ficha/);
    sen.forEach(x => assert.ok(!/verificad|confiable|aprobad/i.test(x.texto)));
  });

  test('lo que se guarda de la revisión no lleva nada biométrico', () => {
    const r = UP.revisionParaGuardar({ para_mirar: [{ texto: 'Foto borrosa' }, { texto: 'Rostros distintos', biometrico: true }],
      neutros: [{ texto: 'Sin lectura' }] }, 'crm');
    assert.deepEqual(r.para_mirar, ['Foto borrosa']);
    assert.equal(r.quien, 'crm');
  });
});

/* ======================================================================== */
describe('la bandeja de mensajes nombra el hilo de una cuenta sin juntar', () => {

  test("'0' + celular sale como «Sin juntar» con el número, no como un socio nuevo cualquiera", () => {
    const CHAT = require('../app/chat.js');
    const h = CHAT.listaHTML([{ cedula: '03001112222', nombre: '', ultimo: 'hola', ultimo_de: 'socio',
      ultimo_en: '2026-10-07T15:00:00Z', sin_leer: 1 }], {});
    assert.match(h, /Sin juntar · 3001112222 \(número de una ficha\)/);
    const nuevo = CHAT.listaHTML([{ cedula: '3009990000', nombre: '', ultimo: 'hola', ultimo_de: 'socio',
      ultimo_en: '2026-10-07T15:00:00Z', sin_leer: 0 }], {});
    assert.match(nuevo, /Socio nuevo · 3009990000/);
  });
});
