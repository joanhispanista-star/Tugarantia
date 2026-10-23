/* ============================================================================
 * EL EQUIPO VE LAS CUENTAS DE SUS CLIENTES — 23 de octubre de 2026
 *
 *   node --test pruebas/el-equipo-ve-las-cuentas.test.js
 *
 * Joan, a la pregunta «¿Tus gerentes y asesores pueden ver las cuentas
 * bancarias de tus clientes?»: «pueden ver todo, está autorizado».
 *
 * La rama de las cuentas (22-oct, d765e68) las había escondido a propósito en
 * las pantallas del equipo mientras Joan decidía, y la receta del 27-oct lo
 * dejó como pregunta abierta. Con su respuesta, el CRM de verdad
 * (pruebas/banco-panel.js) en modo equipo:
 *   · la ficha del equipo —🪪 en «Mi base» (asesor y gerente, por
 *     ficha_de_mi_base) y 🪪 en «Registros» (gerente, por gerente_registros)—
 *     pinta Nequi, Daviplata, llave Bre-B y cuenta de banco con sus nombres,
 *     como la ficha de Joan; nunca el sello del registro ni una llave cruda;
 *   · en «Registros» del gerente, la solicitud aceptada dice «💸 Consignar a:
 *     …» con el botón de copiar, solo con la cuenta de la propuesta vigente, y
 *     sin decirle que gira él (el desembolso es de Joan);
 *   · la bandeja de Joan ya no tiene una excepción para el equipo.
 * Qué le MANDA la base a cada uno —solo lo de sus clientes— lo vigila
 * pruebas/el-equipo-ve-las-cuentas-postgres.test.js.
 *
 * Contra b2aeae8 (la ficha con las cuentas escondidas) fallan todas.
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');

const CREADA = '2026-10-23T15:00:00Z';
const SELLO = 'abcdef0123456789abcdef0123456789';
/* El Nequi NO es el celular: así una prueba que encuentra el número sabe que
   salió de las cuentas y no del renglón del celular. */
const DATOS = { nombres: 'Nuevo', apellidos: 'Pérez', celular: '3005550000', documento: '1010101010', ciudad: 'Bogotá',
  correo: 'n@p.co', nequi: '3207776655', daviplata: '3108889900', llave_breb: '@NUEVO123', banco: 'Bancolombia',
  banco_codigo: '1-7', banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si', cuentas_sello: SELLO };
const FICHA = { ok: true, registrado: true, persona_id: 'p1', nombre_base: 'Nuevo Pérez', nombre: 'Nuevo Pérez',
  cedula: '1010101010', celular: '3005550000', datos: DATOS, huella: {}, registrado_en: CREADA, fotos: {}, aviso: null };

/* Lo que una pantalla del equipo tiene que decir de las cuentas, y lo que no. */
function conLasCuentas(h, que) {
  assert.match(h, /<span class="k">Nequi<\/span><span class="vv">3207776655<\/span>/, que + ': falta el Nequi');
  assert.match(h, /<span class="k">Daviplata<\/span><span class="vv">3108889900<\/span>/, que + ': falta el Daviplata');
  assert.match(h, /<span class="k">Llave Bre-B<\/span><span class="vv">@NUEVO123<\/span>/, que + ': falta la llave Bre-B');
  assert.match(h, /<span class="k">Cuenta de banco<\/span><span class="vv">Bancolombia · ahorros · 123456789<\/span>/,
    que + ': falta la cuenta de banco');
  assert.match(h, /Dijo que son a su nombre/, que + ': no dice que las declaró suyas');
  assert.equal(/banco_numero|llave_breb|cuentas_mias|banco_codigo|cuentas_sello/.test(h), false, que + ': sale una llave cruda');
  assert.equal(h.indexOf(SELLO), -1, que + ': sale el sello del registro, que no es un dato de la persona');
  assert.match(h, /Bogotá/, que + ': dejó de pintar lo demás');
}

/* El Panel del equipo, sin red: rpcEquipo contesta lo que le diga la prueba. */
function abrirEquipo(rol, respuestas, opciones) {
  const P = abrirPanel(Object.assign({ red: () => Promise.reject(new Error('sin red')) }, opciones || {}));
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: { nombre: rol === 'gerente' ? 'WILLIAN' : 'LEIDY', rol,
    celular: rol === 'gerente' ? '3000000000' : '3000000002' },
    equipo: [], gente: [{ id: 'p1', nombre: 'Nuevo Pérez', celular: '3005550000', tipo: 'prospecto', etapa: 'PC' }] }) + ';');
  P.ev('window.__rpc = []; window.__respuestas = ' + JSON.stringify(respuestas || {}) + ';' +
       ' rpcEquipo = function (fn, cuerpo) { window.__rpc.push(fn);' +
       '   return Promise.resolve({ ok: true, status: 200, j: window.__respuestas[fn] || null }); };');
  return P;
}
const pausa = () => new Promise(r => setImmediate(r));

describe('la ficha del equipo pinta dónde recibe la plata', () => {
  test('fichaHTML: las cuatro formas con sus nombres, y nada crudo', () => {
    const P = abrirPanel();
    conLasCuentas(P.ev('fichaHTML(' + JSON.stringify(FICHA) + ')'), 'la ficha del equipo');
  });

  test('el asesor, en «Mi base» → 🪪: la ficha que manda la base trae sus cuentas', async () => {
    const P = abrirEquipo('asesor', { ficha_de_mi_base: FICHA });
    P.ev("verFichaEq('p1')");
    await pausa(); await pausa();
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__rpc)')), ['ficha_de_mi_base']);
    conLasCuentas(P.elems.mBody.innerHTML, 'la ficha del asesor');
  });

  test('sin cuentas en el registro (se registró antes del 22-oct) no inventa ninguna', () => {
    const P = abrirPanel();
    const h = P.ev('fichaHTML(' + JSON.stringify(Object.assign({}, FICHA, { datos: { nombres: 'Viejo', ciudad: 'Bogotá' } })) + ')');
    assert.equal(/Nequi|Daviplata|Llave Bre-B|Cuenta de banco|Dijo que son a su nombre/.test(h), false,
      'pinta formas de pago que el registro no trae');
    assert.match(h, /Bogotá/);
  });
});

/* ----------------------------------------------------------------------------
 * «REGISTROS» DEL GERENTE — la solicitud aceptada.
 * ------------------------------------------------------------------------- */
const CP = { capital: 250000, total: 300000, fecha_pago: '2026-11-01', creada_en: CREADA, por: 'gerente:3000000000', por_nombre: 'WILLIAN' };
const NEQUI = { medio: 'nequi', numero: '3207776655', es_mia: true, propuesta: CREADA, elegido_en: CREADA };
const TOPES = { capital_max: 500000, costo_min: 10, costo_max: 20, dias_max: 30 };
const registro = sol => ({ id: 2, nombre: 'Nuevo Pérez', telefono: '3005550000', cedula: '1010101010', por: 'base',
  asesor: '3000000000', asesor_nombre: 'WILLIAN', creado_en: CREADA, datos: DATOS, huella: null,
  solicitudes: sol ? [Object.assign({ id: 12, estado: 'aceptada', creada_en: CREADA, contrapropuesta: CP }, sol)] : [] });
function registrosDelGerente(sol, opciones) {
  const P = abrirEquipo('gerente', { gerente_archivos: { ok: true, fotos: {}, huella: {} } }, opciones);
  P.ev('VISTA_EQUIPO = "registros"; REG_EQ = ' + JSON.stringify({ estado: 'ok', registros: [registro(sol)], topes: TOPES, motivo: '' }) + ';');
  return P;
}

describe('«Registros» del gerente: la aceptada dice a dónde se consigna', () => {
  test('con su Nequi: «Consignar a» completo, el botón copia el número, y el que gira es Joan', () => {
    const P = registrosDelGerente({ destino_desembolso: NEQUI });
    const h = P.ev('vistaRegistrosEq()');
    assert.match(h, /💸 Consignar a:<\/b> <span class="mono">Nequi 320 777 6655<\/span>/, 'el gerente no ve a dónde se consigna');
    assert.match(h, /onclick="copiarDestinoEq\(12\)">📋 Copiar el número/);
    assert.match(h, /El desembolso lo hace Joan, solo a una cuenta a nombre de Nuevo Pérez/, 'no dice que el desembolso es de Joan');
    assert.equal(/al girar, tu banco/.test(h), false, 'le dice al gerente que gira él');
    P.ev('window.__copiado = null; navigator.clipboard = { writeText: function (t) { window.__copiado = t; return Promise.resolve(); } };');
    P.ev('copiarDestinoEq(12)');
    assert.equal(P.ev('window.__copiado'), '3207776655');
  });

  test('la llave y la cuenta de banco, también completas', () => {
    assert.match(registrosDelGerente({ destino_desembolso: { medio: 'breb', llave: '@NUEVO123', es_mia: true, propuesta: CREADA } })
      .ev('vistaRegistrosEq()'), /Llave Bre-B @NUEVO123[\s\S]*Copiar la llave/);
    assert.match(registrosDelGerente({ destino_desembolso: { medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7',
      banco_tipo: 'Ahorros', numero: '123456789', es_mia: true, propuesta: CREADA } }).ev('vistaRegistrosEq()'),
      /Consignar a:<\/b> <span class="mono">Bancolombia · ahorros 123456789/);
  });

  test('aceptó sin cuenta, o con la de una propuesta VIEJA: «No eligió cuenta», nunca la vieja', () => {
    const sin = registrosDelGerente({}).ev('vistaRegistrosEq()');
    assert.match(sin, /No eligió cuenta al aceptar/);
    assert.equal(/Consignar a:/.test(sin), false);
    const vieja = registrosDelGerente({ destino_desembolso: Object.assign({}, NEQUI, { propuesta: '2026-10-01T10:00:00Z' }) })
      .ev('vistaRegistrosEq()');
    assert.equal(/Consignar a:|320 777 6655/.test(vieja), false, 'muestra la cuenta que eligió para otra propuesta');
    assert.match(vieja, /No eligió cuenta al aceptar/);
  });

  test('pidiendo, con propuesta, o ya atendida por Joan: nada de cuentas en la fila', () => {
    ['nueva', 'contrapropuesta', 'atendida'].forEach(estado => {
      const h = registrosDelGerente({ estado, destino_desembolso: NEQUI }).ev('vistaRegistrosEq()');
      assert.equal(/Consignar a|No eligió cuenta|320 777 6655/.test(h), false, 'en «' + estado + '» la fila habla de la cuenta');
    });
  });

  test('sin app/cuentas-pago.js, lo dice con lo que trae la fila', () => {
    const P = registrosDelGerente({ destino_desembolso: NEQUI }, { sinCuentas: true });
    assert.equal(P.ev('CPAGO'), null);
    assert.match(P.ev('vistaRegistrosEq()'), /Consignar a:<\/b> <span class="mono">Nequi 3207776655/);
  });

  test('🪪 en «Registros»: la ficha del registro trae sus cuentas', async () => {
    const P = registrosDelGerente({ destino_desembolso: NEQUI });
    P.ev("verRegistroEq('3005550000')");
    await pausa(); await pausa();
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__rpc)')), ['gerente_archivos']);
    conLasCuentas(P.elems.mBody.innerHTML, 'la ficha del gerente');
  });
});

describe('la bandeja de Joan', () => {
  test('ya no tiene una excepción para el equipo', () => {
    /* La bandeja no se le pinta al equipo (listar_solicitudes_abiertas pide la
       clave de Joan); la excepción que decía «el gerente no ve a dónde se
       consigna» se va con la decisión del 23-oct. */
    const P = abrirPanel();
    P.cargarCartera({ socios: [], prestamos: [], config: { negocio: 'Tu Garantía' } });
    P.ev('CARTERA_EQUIPO = { gerente: true }; _solicitudes = ' + JSON.stringify([{ id: 77, origen: 'nube', cedula: '3005550000',
      nombre: 'Nuevo Pérez', capital: 100000, tasa: 0.35, costo: 35000, total: 135000, fecha_corte: '2026-11-01', producto: 'quincenal',
      estado: 'aceptada', destino_desembolso: NEQUI, contrapropuesta: CP }]) + '; renderBandeja();');
    assert.match(P.elems.bandeja.innerHTML, /Consignar a:<\/b> <span class="mono">Nequi 320 777 6655/);
  });
});
