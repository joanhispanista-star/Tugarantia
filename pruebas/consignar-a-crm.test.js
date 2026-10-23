/* ============================================================================
 * «💸 CONSIGNAR A: …» Y LAS FORMAS DE PAGO EN EL CRM — 22 de octubre de 2026
 *
 *   node --test pruebas/consignar-a-crm.test.js
 *
 * El CRM de Joan, de verdad en el banco (pruebas/banco-panel.js):
 *   · en la bandeja, la aceptada dice a dónde consignar, completo, con un
 *     botón que copia el número; sin cuenta (o con la de una propuesta
 *     vieja) dice «No eligió cuenta: pregúntale»;
 *   · al desembolsar, la confirmación lo repite y el crédito lo guarda;
 *   · nada de eso para las pegadas (el equipo sí la ve desde el 23-oct:
 *     pruebas/el-equipo-ve-las-cuentas.test.js);
 *   · «Lo que declaró» nombra las formas de pago; la ficha las muestra, las
 *     edita y las guarda; la ficha que nace del registro las trae;
 *   · la ficha del equipo SÍ las pinta desde el 23-oct (decisión de Joan):
 *     lo vigila pruebas/el-equipo-ve-las-cuentas.test.js;
 *   · la constancia (que sale por correo) no lleva el número.
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const P_ = require('../app/puente.js');

const UN_CLIENTE = { socios: [{ id: 's1', nombre: 'María Pérez', telefono: '3001112233', whatsappIgual: true, cedula: '52111222' }],
  prestamos: [], config: { negocio: 'Tu Garantía' } };
const CREADA = '2026-10-22T15:00:00Z';
const DATOS = { nombres: 'Nuevo', apellidos: 'Pérez', celular: '3005550000', documento: '1010101010', ciudad: 'Bogotá',
  correo: 'n@p.co', ingreso_mes: '2.000.000', nequi: '3005550000', llave_breb: '@NUEVO123', banco: 'Bancolombia',
  banco_codigo: '1-7', banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si' };
const sol = (estado, extra) => Object.assign({
  id: 77, origen: 'nube', cedula: '3005550000', nombre: 'Nuevo Pérez', capital: 100000, tasa: 0.35, costo: 35000, total: 135000,
  fecha_corte: '2026-09-16', producto: 'quincenal', estado, registro_id: 9, datos: DATOS,
  contrapropuesta: { capital: 100000, costo_pct: 35, dias: 8, costo: 35000, total: 135000, fecha_pago: '2026-09-16', texto: 'Por ser nuevo…',
    por: 'automatica', creada_en: CREADA,
    condiciones: { version: '2026-10-22', aceptadas_en: CREADA, lineas: [{ clave: 'recibes', k: 'Recibes', v: '$100.000' }],
                   base: { capital: 100000, total: 135000, fecha_pago: '2026-09-16', creada_en: CREADA } } }
}, extra || {});
const NEQUI = { medio: 'nequi', numero: '3005550000', es_mia: true, propuesta: CREADA, elegido_en: CREADA };
const conBandeja = (P, s) => { P.ev('_solicitudes=' + JSON.stringify([s]) + ';renderBandeja()'); return P.elems.bandeja.innerHTML; };

describe('la bandeja dice a dónde consignar', () => {
  test('aceptó con su Nequi: «Consignar a» completo y el botón de copiar', async () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, sol('aceptada', { destino_desembolso: NEQUI }));
    assert.match(h, /💸 Consignar a:<\/b> <span class="mono">Nequi 300 555 0000<\/span>/);
    assert.match(h, /onclick="copiarDestino\('77'\)">📋 Copiar el número/);
    assert.match(h, /Solo a nombre de Nuevo Pérez/);
    P.ev('window.__copiado = null; navigator.clipboard = { writeText: function (t) { window.__copiado = t; return Promise.resolve(); } };');
    P.ev("copiarDestino('77')");
    assert.equal(P.ev('window.__copiado'), '3005550000');
  });

  test('la llave y la cuenta de banco, también completas', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    assert.match(conBandeja(P, sol('aceptada', { destino_desembolso: { medio: 'breb', llave: '@NUEVO123', es_mia: true, propuesta: CREADA } })),
      /Llave Bre-B @NUEVO123[\s\S]*Copiar la llave/);
    assert.match(conBandeja(P, sol('aceptada', { destino_desembolso: { medio: 'banco', banco: 'Bancolombia', banco_codigo: '1-7',
      banco_tipo: 'Ahorros', numero: '123456789', es_mia: true, propuesta: CREADA } })), /Bancolombia · ahorros 123456789/);
  });

  test('aceptó sin cuenta (app vieja, o la base sin el archivo del 22-oct): «No eligió cuenta: pregúntale»', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, sol('aceptada'));
    assert.match(h, /No eligió cuenta: pregúntale por el chat/);
    assert.equal(/Consignar a:/.test(h), false);
  });

  test('la cuenta de una propuesta VIEJA no pasa por la de esta', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    const h = conBandeja(P, sol('aceptada', { destino_desembolso: Object.assign({}, NEQUI, { propuesta: '2026-10-01T10:00:00Z' }) }));
    assert.equal(/Consignar a:/.test(h), false, 'muestra la cuenta que eligió para otra propuesta');
    assert.match(h, /No eligió cuenta/);
  });

  /* 23-oct-2026 — decía «esperando que acepte, para el gerente, o pegada»:
     el gerente ya no es una excepción. Joan: «pueden ver todo, está
     autorizado» (pruebas/el-equipo-ve-las-cuentas.test.js). */
  test('esperando que acepte, o pegada: nada', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    assert.equal(/Consignar a|No eligió cuenta/.test(conBandeja(P, sol('contrapropuesta', { destino_desembolso: NEQUI }))), false);
    assert.equal(/Consignar a|No eligió cuenta/.test(conBandeja(P, sol('aceptada', { origen: 'pegada' }))), false);
  });

  test('sin app/cuentas-pago.js, lo dice con lo que trae la fila', () => {
    const P = abrirPanel({ sinCuentas: true }); P.cargarCartera(UN_CLIENTE);
    assert.equal(P.ev('CPAGO'), null);
    assert.match(conBandeja(P, sol('aceptada', { destino_desembolso: NEQUI })), /Consignar a:<\/b> <span class="mono">Nequi 3005550000/);
  });
});

describe('al desembolsar', () => {
  test('la confirmación dice a dónde, y el crédito lo guarda', async () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    conBandeja(P, sol('aceptada', { destino_desembolso: NEQUI }));
    P.ev("window.__confirms = []; confirm = function (t) { window.__confirms.push(String(t)); return String(t).indexOf('bienvenida') < 0; };");
    await P.ev("crearDesdeSolicitud('77')");
    const c = JSON.parse(P.ev('JSON.stringify(window.__confirms)')).find(t => /Crear el crédito/.test(t));
    assert.ok(c, 'no pidió confirmar');
    assert.match(c, /• Consignar a: Nequi 300 555 0000 \(a nombre de Nuevo Pérez: compara el titular con su cédula\)/);
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0])'));
    assert.equal(p.consignarA.numero, '3005550000');
    assert.equal(p.consignarA.medio, 'nequi');
  });

  test('sin cuenta, la confirmación avisa que hay que preguntar', async () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    conBandeja(P, sol('aceptada'));
    P.ev("window.__confirms = []; confirm = function (t) { window.__confirms.push(String(t)); return String(t).indexOf('bienvenida') < 0; };");
    await P.ev("crearDesdeSolicitud('77')");
    const c = JSON.parse(P.ev('JSON.stringify(window.__confirms)')).find(t => /Crear el crédito/.test(t));
    assert.match(c, /No eligió a qué cuenta: pregúntale por el chat/);
    assert.equal(P.ev('DB.prestamos[0].consignarA'), undefined);
  });

  test('la ficha que nace al desembolsar trae sus formas de pago', async () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    conBandeja(P, sol('aceptada', { destino_desembolso: NEQUI }));
    P.ev("confirm = function (t) { return String(t).indexOf('bienvenida') < 0; };");
    await P.ev("crearDesdeSolicitud('77')");
    const s = JSON.parse(P.ev('JSON.stringify(DB.socios[DB.socios.length-1])'));
    assert.deepEqual({ nequi: s.nequi, llaveBreb: s.llaveBreb, banco: s.banco, bancoCodigo: s.bancoCodigo, bancoTipo: s.bancoTipo, bancoNumero: s.bancoNumero },
      { nequi: '3005550000', llaveBreb: '@NUEVO123', banco: 'Bancolombia', bancoCodigo: '1-7', bancoTipo: 'Ahorros', bancoNumero: '123456789' });
  });

  test('la constancia (que sale por correo) no lleva la cuenta', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    /* Otro número que el celular: el modal sí muestra el celular (sus aparatos). */
    conBandeja(P, sol('aceptada', { destino_desembolso: Object.assign({}, NEQUI, { numero: '3207776655' }) }));
    P.ev("window.__abierto = []; open = function (u) { window.__abierto.push(String(u)); }; location.href = '';");
    try { P.ev("verCondicionesAceptadas('77')"); } catch (e) { /* sin el modal del banco, basta con lo que armó */ }
    const todo = P.ev('JSON.stringify(window.__abierto)') + P.ev('String(location.href || "")') + (P.elems.mBody ? P.elems.mBody.innerHTML : '');
    assert.equal(/3207776655|320 777 6655/.test(todo), false, 'la cuenta salió en la constancia');
  });
});

describe('la ficha y lo que declaró', () => {
  test('«Lo que declaró» nombra las formas de pago', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    P.ev('_registros = ' + JSON.stringify([{ id: 9, nombre: 'Nuevo Pérez', telefono: '3005550000', datos: DATOS }]) + '; pintarFotosRegistro = function () {}; resolverUbicaciones = function () {};');
    P.ev('verDatosRegistro(9)');
    const h = P.elems.mBody.innerHTML;
    ['Su Nequi', 'Su llave Bre-B', 'Banco', 'Tipo de cuenta', 'Número de cuenta', 'Dijo que son a su nombre']
      .forEach(e => assert.match(h, new RegExp('<span class="k">' + e + '</span>'), 'falta la etiqueta ' + e));
    assert.equal(/<span class="k">(llave_breb|banco_numero|cuentas_mias)<\/span>/.test(h), false, 'sale una llave cruda');
  });

  test('la ficha las muestra, las edita y las guarda', () => {
    const P = abrirPanel(); P.cargarCartera(UN_CLIENTE);
    P.ev("Object.assign(DB.socios[0], { daviplata: '3209998877', llaveBreb: '@MARIA123', banco: 'Bancolombia', bancoTipo: 'Ahorros', bancoNumero: '123456789' }); verCliente('s1')");
    const v = P.elems.mBody.innerHTML;
    assert.match(v, /Daviplata<\/span><span class="vv">3209998877/);
    assert.match(v, /Llave Bre-B<\/span><span class="vv">@MARIA123/);
    assert.match(v, /Cuenta de banco<\/span><span class="vv">Bancolombia · ahorros · 123456789/);
    P.ev("editarCliente('s1')");
    const f = P.elems.mBody.innerHTML;
    ['fDaviplata', 'fLlaveBreb', 'fBanco', 'fBancoTipo', 'fBancoNumero'].forEach(id => assert.match(f, new RegExp('id="' + id + '"')));
    assert.match(f, /<datalist id="listaBancosFicha">[\s\S]*<option value="Davibank \(antes Scotiabank Colpatria\)">/);
    P.ev("['fNombre','fTel','fDaviplata','fLlaveBreb','fBanco','fBancoTipo','fBancoNumero'].forEach(function (i) { document.getElementById(i).value = ''; });" +
         " document.getElementById('fNombre').value = 'María Pérez'; document.getElementById('fTel').value = '3001112233';" +
         " document.getElementById('fBanco').value = 'davivienda'; document.getElementById('fBancoTipo').value = 'Corriente';" +
         " document.getElementById('fBancoNumero').value = '0550-1234-5678'; document.getElementById('fLlaveBreb').value = '@MARIA123';");
    P.ev("guardarCliente('s1')");
    const s = JSON.parse(P.ev('JSON.stringify(DB.socios[0])'));
    assert.deepEqual({ banco: s.banco, bancoCodigo: s.bancoCodigo, bancoTipo: s.bancoTipo, bancoNumero: s.bancoNumero, llaveBreb: s.llaveBreb, daviplata: s.daviplata },
      { banco: 'davivienda', bancoCodigo: '1-39', bancoTipo: 'Corriente', bancoNumero: '055012345678', llaveBreb: '@MARIA123', daviplata: '' });
  });

  test('la mesa de cruce trae las formas de pago del registro', () => {
    const filas = P_.camposDelCruce({ nombre: 'Nuevo Pérez' }, { telefono: '3005550000', datos: DATOS });
    const por = c => filas.find(f => f.campo === c);
    assert.equal(por('nequi').declarado, '3005550000');
    assert.equal(por('nequi').estado, 'falta');
    assert.equal(por('llaveBreb').declarado, '@NUEVO123');
    assert.equal(por('bancoNumero').declarado, '123456789');
    /* Lo que no vino no se inventa. */
    assert.equal(P_.fichaDeclarada({ datos: {} }).daviplata, '');
    assert.equal(P_.fichaDeclarada({ datos: {} }).nequi, '');
  });

  /* 23-oct-2026 — aquí estaba «la ficha del equipo (gerente y asesor) NO
     pinta las cuentas». Joan decidió lo contrario («pueden ver todo, está
     autorizado»): ahora la pinta, con sus nombres y sin llaves crudas, y lo
     vigila pruebas/el-equipo-ve-las-cuentas.test.js. */
});
