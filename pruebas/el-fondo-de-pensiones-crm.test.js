/* ============================================================================
 * «📄 FONDO DE PENSIONES» EN EL CRM DE JOAN — 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones-crm.test.js
 *
 * Joan: «quiero que yo como dueño tenga acceso a esta información cuando
 * quiera». Lo que el cliente subió se ve en 📥 Registrados, en «👁 Ver datos»
 * y en la ficha, SOLO en el modo de Joan. Y como el archivo lo escribió un
 * desconocido, se abre con el tipo que dicen sus bytes (nunca el que diga el
 * dato), el PDF por un enlace de un solo uso en otra pestaña, y lo que no es
 * lo que dice ser no se abre. Borrar: aquí, con «🧪 Borrar y repetir» y con
 * «🚫 Borrar a alguien que lo pidió».
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const H = require('../panel/historia-laboral-crm.js');

const b64 = s => Buffer.from(s, 'binary').toString('base64');
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const CEL = '3001112233';
const PERSONA = { celular: CEL, fondos: ['colpensiones', 'porvenir'], version: '2026-11-03', autorizada_en: '2026-11-03T15:00:00Z',
  revocada_en: null, pdf: 1, imagenes: 2, ultimo: '2026-11-03T15:10:00Z' };
const DETALLE = { ok: true, celular: CEL,
  autorizacion: { fondos: ['colpensiones', 'porvenir'], version: '2026-11-03', autorizada_en: '2026-11-03T15:00:00Z', revocada_en: null },
  archivos: [{ id: 11, tipo: 'pdf', bytes: 230000, sha256: 'x', creado_en: '2026-11-03T15:05:00Z' },
             { id: 12, tipo: 'png', bytes: 180000, sha256: 'y', creado_en: '2026-11-03T15:10:00Z' }] };

/* El CRM de Joan, con la nube conectada y una nube de mentira que anota. */
function joan(resp, opc) {
  const P = abrirPanel(opc);
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave', clave: 'clave-larga-de-prueba' });
  P.ctx._resp = resp || {};
  P.ctx._llamadas = []; P.ctx._avisos = [];
  P.ev(`rpc = function (fn, args) {
    _llamadas.push({ fn: fn, args: JSON.parse(JSON.stringify(args || {})) });
    var r = _resp[fn]; if (typeof r === 'function') r = r(args);
    if (r && r.falla) return Promise.reject({ motivo: r.falla });
    return Promise.resolve(r === undefined ? null : JSON.parse(JSON.stringify(r)));
  };
  confirm = function (m) { _avisos.push('¿' + m); return true; };
  alert = function (m) { _avisos.push(String(m)); };`);
  return P;
}
const llamadas = (P, fn) => P.ctx._llamadas.filter(x => !fn || x.fn === fn);
const avisos = P => P.ctx._avisos.join('\n');
const REGISTRO = { id: 7, nombre: 'Maria Prueba', telefono: '300 111 2233', cedula: '52123456', origen: 'abierto',
  creado_en: '2026-11-03T14:00:00Z', datos: { documento: '52123456' }, estado: 'nuevo' };

describe('lo que Joan ve', () => {
  test('📥 Registrados: «📄 Fondo de pensiones: Ver» con el fondo, cuántos y cuándo; nada de archivos en esa llamada', async () => {
    const P = joan({ listar_registros: [REGISTRO], pension_resumen: { ok: true, personas: [PERSONA] } });
    P.ev('traerRegistros()');
    await asentar(20);
    const h = P.elems.tblRegistros.innerHTML;
    assert.match(h, /📄 Fondo de pensiones: Ver/);
    assert.match(plano(h), /Colpensiones y Porvenir · 1 PDF y 2 pantallazos · subido el 3-nov-2026/);
    assert.deepEqual(llamadas(P, 'pension_resumen')[0].args, { p_clave: 'clave-larga-de-prueba' });
    assert.equal(llamadas(P, 'pension_archivo').length, 0, 'pintar la bandeja bajó un archivo');
  });

  test('«📄 Ver»: el bloque con lo que dijo, cuándo autorizó, cada archivo con su botón, y que no es prueba', async () => {
    const P = joan({ listar_registros: [REGISTRO], pension_de: DETALLE });
    P.ev('traerRegistros()'); await asentar(10);
    P.ev("verPensionRegistro('3001112233')");
    await asentar(10);
    assert.match(P.elems.mTitle.textContent, /📄 Fondo de pensiones · Maria Prueba/);
    const t = plano(P.elems.pensionModal.innerHTML);
    assert.match(t, /Dijo que está en Colpensiones y Porvenir/);
    assert.match(t, /Autorizó el 3-nov-2026/);
    assert.match(t, /texto del 2026-11-03/);
    assert.match(t, /📄 PDF · 225 KB/);
    assert.match(t, /🖼 Pantallazo · 176 KB/);
    assert.match(t, /ningún fondo tiene cómo confirmarlo/);
    assert.match(t, /no las uses para decidir: son datos de salud/);
    assert.match(t, /Suele llegar con contraseña: el número de documento/, 'falta la nota de Colpensiones para Joan');
    assert.match(P.elems.pensionModal.innerHTML, /data-pension-archivo="11"/);
    assert.match(P.elems.pensionModal.innerHTML, /🗑 Borrar su historia laboral/);
  });

  test('«👁 Ver datos» lo trae debajo de las fotos; sin autorización, dice que no la dio (es opcional)', async () => {
    const P = joan({ listar_registros: [REGISTRO], pension_de: { ok: true, celular: CEL, autorizacion: null, archivos: [] }, archivos_de_registro: { fotos: {} } });
    P.ev('traerRegistros()'); await asentar(10);
    P.ev("verDatosRegistro('7')");
    await asentar(10);
    assert.match(P.elems.mBody.innerHTML, /<div id="regPension"><\/div>/);
    assert.match(plano(P.elems.regPension.innerHTML), /No nos dio su historia laboral \(es opcional\)\./);
    assert.deepEqual(llamadas(P, 'pension_de')[0].args, { p_clave: 'clave-larga-de-prueba', p_celular: CEL });
  });

  test('la base sin la migración: dice que falta correrla, no que no la dio', async () => {
    const P = joan({ pension_de: { falla: 'Tu base todavía no tiene «pension_de». Vuelve a correr base/supabase.sql completo en el SQL Editor.' } });
    P.ev('document.getElementById("x").innerHTML = ""; pintarPension("3001112233", "x", {})');
    await asentar(10);
    assert.match(plano(P.elems.x.innerHTML), /corre base\/20261103_el_fondo_de_pensiones\.sql/);
  });

  test('EL MODO EQUIPO NO VE NADA: ni la línea, ni el bloque, ni una sola llamada', async () => {
    const P = joan({ pension_resumen: { ok: true, personas: [PERSONA] }, pension_de: DETALLE });
    P.ev('CARTERA_EQUIPO = { yo: { nombre: "WILLIAN", rol: "gerente", celular: "3172862539" } }');
    P.ev('traerPensiones(); _pensiones = ' + JSON.stringify({ [CEL]: PERSONA }));
    assert.equal(P.ev('chipPension(' + JSON.stringify(REGISTRO) + ')'), '');
    P.ev('document.getElementById("y").innerHTML = "algo"; pintarPension("3001112233", "y", {})');
    P.ev("verPensionRegistro('3001112233'); verArchivoPension(11); borrarPensionDe('3001112233')");
    await asentar(10);
    assert.equal(P.elems.y.innerHTML, '');
    assert.equal(llamadas(P).filter(x => /^pension_/.test(x.fn)).length, 0, 'el modo equipo le preguntó a la nube por la historia laboral');
  });

  test('sin sus archivos (un service worker viejo), Registrados se pinta igual, sin la línea', async () => {
    const P = joan({ listar_registros: [REGISTRO] }, { sinPension: true });
    P.ev('traerRegistros()'); await asentar(10);
    assert.match(P.elems.tblRegistros.innerHTML, /Maria Prueba/);
    assert.equal(/Fondo de pensiones/.test(P.elems.tblRegistros.innerHTML), false);
  });
});

describe('abrir UN archivo que escribió un desconocido', () => {
  /* Una ventana de mentira con lo justo: crear elementos, URL de blob. */
  function ventana() {
    const creados = [], urls = [];
    const el = tag => ({ tag, style: {}, children: [], attrs: {}, className: '', textContent: '',
      setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { this.children.push(c); return c; },
      set innerHTML(v) { this.children = []; this._html = v; }, get innerHTML() { return this._html || ''; } });
    const body = el('body');
    const W = { document: { createElement: t => { const e = el(t); creados.push(e); return e; }, body },
      URL: { createObjectURL: b => { urls.push(b); return 'blob:https://tugarantia.net/' + urls.length; }, revokeObjectURL() {} },
      setTimeout: () => 0 };
    return { W, creados, urls, body };
  }
  const rpcCon = j => fn => Promise.resolve(fn === 'pension_archivo' ? j : null);

  test('el PDF: Blob con application/pdf forzado, y un enlace a otra pestaña (noopener) que toca Joan', async () => {
    const r = await H.traer(rpcCon({ ok: true, tipo: 'pdf', base64: b64('%PDF-1.4 historia'), bytes: 17 }), 'k', 11);
    assert.equal(r.ok, true);
    assert.equal(r.blob.type, 'application/pdf');
    const v = ventana(), caja = v.W.document.createElement('div');
    assert.equal(H.abrir(r, caja, v.W), true);
    const a = caja.children[0];
    assert.equal(a.tag, 'a');
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
    assert.match(a.href, /^blob:/);
    assert.match(a.textContent, /Abrir el PDF/);
    assert.equal(v.urls[0].type, 'application/pdf');
  });

  test('un pantallazo se ve en grande aquí mismo, como imagen y nada más', async () => {
    const r = await H.traer(rpcCon({ ok: true, tipo: 'png', base64: b64('\x89PNG\r\n\x1a\nIHDR'), bytes: 12 }), 'k', 12);
    assert.equal(r.blob.type, 'image/png');
    const v = ventana();
    assert.equal(H.abrir(r, null, v.W), true);
    const img = v.creados.find(e => e.tag === 'img');
    assert.ok(img && /^blob:/.test(img.src));
    assert.equal(v.body.children[0].attrs.role, 'dialog');
  });

  test('lo que NO es lo que dice ser no se abre: un HTML que dice ser PDF, un SVG que dice ser PNG', async () => {
    const html = await H.traer(rpcCon({ ok: true, tipo: 'pdf', base64: b64('<!doctype html><script>fetch(localStorage.joan_socios_sb)</script>') }), 'k', 1);
    assert.deepEqual([html.ok, html.motivo], [false, 'no_coincide']);
    const svg = await H.traer(rpcCon({ ok: true, tipo: 'png', base64: b64('<svg onload="x"/>') }), 'k', 2);
    assert.equal(svg.motivo, 'no_coincide');
    const jpgComoPng = await H.traer(rpcCon({ ok: true, tipo: 'png', base64: b64('\xff\xd8\xff\xe0JFIF') }), 'k', 3);
    assert.equal(jpgComoPng.motivo, 'no_coincide', 'abrió con un tipo que no es el de la base');
    assert.equal((await H.traer(rpcCon({ ok: false, motivo: 'no_existe' }), 'k', 4)).motivo, 'no_existe');
    assert.match(H.motivoEnPalabras('no_coincide'), /No lo abro/);
  });

  test('en el CRM: «📄 Ver» pide ESE archivo, con la clave, y deja el enlace', async () => {
    const P = joan({ pension_archivo: { ok: true, tipo: 'pdf', base64: b64('%PDF-1.4 historia'), bytes: 17 } });
    P.ev('verArchivoPension(11)');
    await asentar(10);
    assert.deepEqual(llamadas(P, 'pension_archivo')[0].args, { p_clave: 'clave-larga-de-prueba', p_id: 11 });
  });
});

describe('borrar', () => {
  test('«🗑 Borrar su historia laboral»: pregunta nombrando a la persona, borra con la clave y dice cuántos', async () => {
    const P = joan({ listar_registros: [REGISTRO], pension_borrar: { ok: true, archivos: 3, autorizaciones: 1 }, pension_resumen: { ok: true, personas: [] } });
    P.ev('traerRegistros()'); await asentar(10);
    P.ev("borrarPensionDe('3001112233')");
    await asentar(10);
    assert.match(avisos(P), /¿BORRAR la historia laboral de Maria Prueba: sus archivos, el fondo que dijo y su autorización\./);
    assert.deepEqual(llamadas(P, 'pension_borrar')[0].args, { p_clave: 'clave-larga-de-prueba', p_celular: CEL });
    assert.match(avisos(P), /Listo: borré 3 archivo\(s\) de su historia laboral y su autorización\./);
  });

  test('«🧪 Borrar y repetir» la borra ANTES de la cuenta, lo anuncia en la confirmación y dice cuántos se fueron', async () => {
    const P = joan({ listar_registros: [REGISTRO], pension_borrar: { ok: true, archivos: 2, autorizaciones: 1 },
      borrar_cuenta_de_pruebas: { ok: true, cuenta: 1, fotos: 3, registros: 1, solicitudes: 0, mensajes: 0 } });
    P.ev('traerRegistros()'); await asentar(10);
    P.ev("borrarParaProbar('3001112233')");
    await asentar(20);
    assert.match(avisos(P), /su historia laboral del fondo de pensiones, si la subio/);
    const orden = llamadas(P).map(x => x.fn).filter(f => /pension_borrar|borrar_cuenta_de_pruebas/.test(f));
    assert.deepEqual(orden, ['pension_borrar', 'borrar_cuenta_de_pruebas']);
    assert.match(avisos(P), /historia laboral del fondo de pensiones: 2 archivo\(s\) y su autorizacion/);
  });

  test('«🧪 Borrar y repetir» con la base sin esa parte: borra la cuenta igual y lo dice', async () => {
    const P = joan({ listar_registros: [REGISTRO], pension_borrar: { falla: 'Tu base todavía no tiene «pension_borrar». Vuelve a correr base/supabase.sql completo en el SQL Editor.' },
      borrar_cuenta_de_pruebas: { ok: true, cuenta: 1, fotos: 0, registros: 1, solicitudes: 0, mensajes: 0 } });
    P.ev('traerRegistros()'); await asentar(10);
    P.ev("borrarParaProbar('3001112233')");
    await asentar(20);
    assert.equal(llamadas(P, 'borrar_cuenta_de_pruebas').length, 1);
    assert.match(avisos(P), /tu base todavia no tiene esa parte/);
  });

  test('«🚫 Borrar a alguien que lo pidió»: el cuadro lo anuncia y, después de borrarlo, borra también su historia laboral', async () => {
    const P = joan({ equipo_suprimir: { ok: true, es_cliente: false, del_equipo: 0, de_joan: 1, copias_pendientes: 0, registrado: true },
      pension_borrar: { ok: true, archivos: 1, autorizaciones: 1 }, equipo_agregados: { cargas: [], frenados: [] } });
    P.ev('suprimirDesdeBases()');
    assert.match(plano(P.elems.mBody.innerHTML), /Si se registró y subió su historia laboral del fondo de pensiones, esa también se borra\./);
    P.ev("document.getElementById('supCel').value = '3001112233'; document.getElementById('supComo').value = 'por el chat de la app el 3-nov';");
    P.ev('confirmarSuprimir()');
    await asentar(40);
    const orden = llamadas(P).map(x => x.fn).filter(f => /pension_borrar|equipo_suprimir/.test(f));
    assert.deepEqual(orden, ['equipo_suprimir', 'pension_borrar']);
    assert.match(avisos(P), /También borré su historia laboral del fondo de pensiones: 1 archivo\(s\) y su autorización\./);
    /* Y a un cliente, también: no es un soporte del crédito. */
    const Q = joan({ equipo_suprimir: { ok: true, es_cliente: true }, pension_borrar: { ok: true, archivos: 2, autorizaciones: 1 } });
    Q.ev('suprimirDesdeBases()');
    Q.ev("document.getElementById('supCel').value = '3001112233'; document.getElementById('supComo').value = 'llamó a la oficina';");
    Q.ev('confirmarSuprimir()');
    await asentar(40);
    assert.match(avisos(Q), /Es cliente: [\s\S]*También borré su historia laboral del fondo de pensiones: 2 archivo\(s\)/);
  });
});
