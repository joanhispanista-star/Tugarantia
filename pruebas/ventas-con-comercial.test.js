'use strict';
/* ============================================================================
 * VENTAS Y COMERCIAL, UNA SOLA PESTAÑA — 13 de noviembre de 2026
 *
 *   node --test pruebas/ventas-con-comercial.test.js
 *
 * Joan: «ventas y comercial es lo mismo, así que unifica esa pestaña en
 * ventas». Lo de «🚀 Comercial» (los números, «A quién se puede invitar»,
 * «Quién no, y por qué» y renderComercial) se MOVIÓ a 📈 Ventas, debajo del
 * embudo y de la lista. No se rehízo nada: los mismos ids, la misma función.
 *
 * Lo que se prueba, con el CRM de verdad corriendo (banco-panel.js):
 *   1. el menú ya no tiene Comercial, y su contenido vive una sola vez, en Ventas;
 *   2. abrir Ventas pinta las dos cosas, «↻ Recalcular» recalcula las dos, e
 *      irA('comercial') —un enlace viejo— lleva a esa sección de Ventas;
 *   3. invitar sigue exigiendo la autorización (lo que sanciona la SIC);
 *   4. nadie gana ni pierde acceso: el menú del equipo no cambió.
 *
 * Todos los nombres y celulares son inventados.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const seccion = id => {
  const m = new RegExp('<section class="view[^"]*" id="v-' + id + '">').exec(CRM);
  assert.ok(m, 'no existe la vista ' + id);
  return CRM.slice(m.index, CRM.indexOf('</section>', m.index));
};
const ENTRADAS = [...CRM.matchAll(/<button class="navbtn[^"]*" data-v="([a-z]+)">/g)].map(m => m[1]);

const AUTORIZADO = { id: 'p1', nombre: 'Prospecto Autorizado', celular: '3000000301', estado: 'nuevo', base: 'Base Inventada',
  autorizaInvitacion: true, autorizaDesde: '2026-11-01' };
const SIN_PERMISO = { id: 'p2', nombre: 'Prospecto Sin Permiso', celular: '3000000302', estado: 'nuevo', base: 'Base Inventada' };

/* El CRM con dos prospectos, y un menú y unas vistas de mentira que anotan cuál
   quedó encendida (el banco no tiene DOM: querySelectorAll devuelve []). */
function montar() {
  const P = abrirPanel();
  P.cargarCartera({ socios: [], prestamos: [], config: { pin: '4321' }, prospectos: [AUTORIZADO, SIN_PERMISO].map(x => Object.assign({}, x)) });
  const encendido = {};
  const nodo = (clave, extra) => Object.assign({ classList: { toggle(c, on) { if (c === 'on') encendido[clave] = !!on; } } }, extra);
  const botones = ENTRADAS.map(v => nodo('btn:' + v, { dataset: { v } }));
  const vistas = [...CRM.matchAll(/<section class="view[^"]*" id="(v-[a-z]+)">/g)].map(m => nodo(m[1], { id: m[1] }));
  P.ctx.document.querySelectorAll = sel => (sel === '.navbtn' ? botones : sel === '.view' ? vistas : []);
  const bajadas = [];
  P.elems.ventasComercial = { id: 'ventasComercial', scrollIntoView: o => { bajadas.push(o); } };
  return { P, encendido, bajadas };
}

/* ======================================================================== */
describe('1. el menú ya no tiene «🚀 Comercial»: lo suyo vive en Ventas, una sola vez', () => {

  test('ni botón ni vista de Comercial; Ventas sigue, y el menú tiene 17 entradas con 📨 Solicitudes', () => {
    assert.ok(!ENTRADAS.includes('comercial'), 'sigue el botón «🚀 Comercial»: ' + ENTRADAS.join(','));
    assert.doesNotMatch(CRM, /id="v-comercial"/, 'sigue la vista de Comercial');
    assert.ok(ENTRADAS.includes('ventas'));
    assert.equal(ENTRADAS.length, 17, ENTRADAS.join(','));
  });

  test('en Ventas, debajo del embudo y de la lista, con su título; y en el mismo orden de antes', () => {
    const v = seccion('ventas');
    const orden = ['id="embudoVentas"', 'id="tblVentas"', 'id="ventasComercial"', 'id="kpiComercial"', 'id="tblComercial"', 'id="tblFueraCom"']
      .map(x => { const i = v.indexOf(x); assert.ok(i > 0, 'falta ' + x + ' en Ventas'); return i; });
    assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'lo de Comercial no quedó debajo del embudo y de la lista');
    assert.match(v, /id="ventasComercial"[^>]*><div><h2>🚀 Invitar a la app/, 'la sección no tiene un título que la nombre');
    assert.match(plano(v), /lo que antes estaba en «Comercial»/, 'quien busque «Comercial» no sabe que es esto');
  });

  test('movido, no copiado: cada id y renderComercial existen una sola vez', () => {
    for (const id of ['kpiComercial', 'tblComercial', 'tblFueraCom', 'ventasComercial']) {
      assert.equal((CRM.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' quedó repetido');
    }
    assert.equal((CRM.match(/function renderComercial\(/g) || []).length, 1);
    assert.equal((CRM.match(/function prospectosParaInvitar\(/g) || []).length, 1);
  });

  test('los textos ya no mandan a una pestaña que no existe', () => {
    assert.doesNotMatch(CRM, /invitaciones de Comercial/, 'un texto sigue diciendo «las invitaciones de Comercial»');
    assert.match(CRM, /no le llegan las invitaciones de 📈 Ventas/);
  });
});

/* ======================================================================== */
describe('2. abrir Ventas pinta las dos cosas; irA(\'comercial\') lleva allá', () => {

  test('abrir Ventas pinta el embudo y lo de invitar', () => {
    const { P, encendido } = montar();
    P.ev("irA('ventas')");
    assert.equal(encendido['v-ventas'], true);
    assert.ok(P.elems.embudoVentas.innerHTML.length > 0, 'no pintó el embudo');
    assert.match(plano(P.elems.tblComercial.innerHTML), /Prospecto Autorizado/, 'abrir Ventas no pintó a quién se puede invitar');
    assert.match(plano(P.elems.kpiComercial.innerHTML), /Se puede invitar 1/);
  });

  test('irA(\'comercial\'), el de un enlace viejo, abre Ventas, pinta la sección y baja hasta ella', () => {
    const { P, encendido, bajadas } = montar();
    P.ev("irA('comercial')");
    assert.equal(encendido['v-ventas'], true, 'irA(\'comercial\') no abrió Ventas');
    assert.equal(encendido['btn:ventas'], true, 'el menú no marca Ventas');
    assert.ok(!Object.keys(encendido).some(k => /comercial/.test(k) && encendido[k]), 'quedó encendido algo de Comercial');
    assert.match(plano(P.elems.tblComercial.innerHTML), /Prospecto Autorizado/);
    assert.equal(bajadas.length, 1, 'no bajó hasta «🚀 Invitar a la app»');
    assert.equal(P.ev('_vistaCRM'), 'ventas');
  });

  test('«↻ Recalcular» de Ventas recalcula las dos', () => {
    assert.match(seccion('ventas'), /onclick="renderVentas\(\);renderComercial\(\)">↻ Recalcular/);
    const { P } = montar();
    P.ev("renderVentas();renderComercial()");
    assert.match(plano(P.elems.tblComercial.innerHTML), /Prospecto Autorizado/);
  });

  test('mover el embudo NO repinta las invitaciones: no se pierde a quién desmarcó Joan', () => {
    const { P } = montar();
    P.ev("irA('ventas')");
    P.ev("marcarCom('3000000301', false)");
    P.ev('renderVentas()');   // lo que corre al tocar un paso del embudo (verPasoVentas)
    assert.equal(P.ev('filasComMarcadas().length'), 0, 'repintar Ventas volvió a marcar a quien Joan desmarcó');
  });
});

/* ======================================================================== */
describe('3. invitar sigue exigiendo la autorización', () => {

  test('quien no autorizó va a «Quién no, y por qué», sin casilla, con el porqué de la SIC', () => {
    const { P } = montar();
    P.ev("irA('ventas')");
    const si = P.elems.tblComercial.innerHTML, no = P.elems.tblFueraCom.innerHTML;
    assert.doesNotMatch(plano(si), /Prospecto Sin Permiso/, 'se puede invitar a quien no autorizó');
    assert.match(plano(no), /Prospecto Sin Permiso.*no autorizo que le escribieras \(habeas data\)/);
    assert.match(plano(no), /Invitar a quien no autorizó es lo que sanciona la SIC/);
    assert.match(seccion('ventas'), /Invitar sin permiso es lo que sanciona la SIC/);
  });

  test('autorizar desde Ventas pide confirmación y deja la fecha', () => {
    const { P } = montar();
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return true; };
    P.ev("irA('ventas'); autorizarProspecto('p2', true)");
    assert.equal(preguntas.length, 1, 'se marcó sin preguntar');
    assert.equal(P.ev("DB.prospectos.find(x => x.id === 'p2').autorizaDesde"), P.ev('hoyISO()'));
    assert.match(plano(P.elems.tblComercial.innerHTML), /Prospecto Sin Permiso/);
  });
});

/* ======================================================================== */
describe('4. nadie gana ni pierde acceso', () => {

  test('el menú del equipo (gerente y asesor) es el mismo de antes: ni Ventas, ni Comercial, ni Solicitudes', () => {
    const i = CRM.indexOf('function modoEquipo()');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction irEquipo(', i));
    const vistas = [...new Set([...cuerpo.matchAll(/irEquipo\(\\?'([a-z]+)\\?'\)/g)].map(m => m[1]))].sort();
    assert.deepEqual(vistas, ['agenda', 'base', 'clave', 'cobrar', 'equipo', 'jefe', 'plata', 'registros', 'tablero', 'vivo']);
    assert.doesNotMatch(cuerpo, /ventas|comercial|solicitudes/i);
  });
});
