'use strict';
/* ==========================================================================
 * LA BASE TIENE QUE CABER EN EL NAVEGADOR
 * 26 de septiembre de 2026
 *
 * Joan pidió cargar una base de 18.190 prospectos (PROSPECTOS-SIN-REPETIDOS.csv).
 * Se midió antes de hacerlo, con el archivo de verdad y el código de la nube:
 *
 *   · la cartera vive en el localStorage del navegador, que en Chrome da unos
 *     5 millones de caracteres por sitio;
 *   · un prospecto se guarda TRES veces: en la cartera, en la copia de la nube
 *     (joan_panel_espejo, como texto dentro de texto) y en la cola de subida;
 *   · los 18.190 son 2,95 millones de caracteres por copia: unos 9 millones.
 *
 * Y cuando no cabe, guardar() no falla a la vista: salva el libro tirando las
 * FOTOS de los comprobantes. Cargar la base entera le habría costado a Joan las
 * fotos de su cartera sin que nadie se lo preguntara.
 *
 * Ahora el CRM mide antes, carga los que caben, dice cuántos quedaron en el
 * archivo, y si aun así no cupiera deshace la carga antes de tocar una foto.
 * Para tener los 18.190 hace falta que los prospectos vivan en la nube y no en
 * el navegador: eso es un cambio de arquitectura, y queda anotado como tal.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const B = require('../app/bases.js');
const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/mg, '');
const cuerpo = nombre => {
  const i = CRM.indexOf('function ' + nombre + '(');
  assert.ok(i >= 0, 'crm.html ya no declara ' + nombre);
  const j = CRM.indexOf('\nfunction ', i + 1);
  return sinComentarios(CRM.slice(i, j < 0 ? CRM.length : j));
};

/* Prospectos como los que guarda el CRM, del tamaño de los de verdad. */
const prospecto = i => ({ id: 'P1727380000000-' + i, nombre: 'Yurley Yulieth Hernandez Garizado',
  celular: String(3000000000 + i), estado: 'nuevo', base: 'PROSPECTOS-SIN-REPETIDOS.csv',
  cargadoEn: '2026-09-26' });
const pesosDe = n => Array.from({ length: n }, (_, i) => B.pesoDeProspecto(prospecto(i)));

describe('cuántos caben', () => {

  test('LA BASE DE JOAN NO CABE ENTERA: ni con el navegador vacío', () => {
    const r = B.cuantosCaben({ usado: 0, pesos: pesosDe(18190) });
    assert.equal(r.total, 18190);
    assert.ok(r.caben > 0, 'algo tiene que poder entrar');
    assert.ok(r.caben < 18190, 'si esto pasa, alguien subió el límite o bajó las copias sin medir');
    // Las tres copias de los 18.190 pasan largamente el techo del sitio.
    const todas = pesosDe(18190).reduce((t, p) => t + 3 * (p.largo + 1) + p.comillas, 0);
    assert.ok(todas > B.LIMITE_NAVEGADOR, 'las tres copias: ' + todas);
  });

  test('entran en el orden del archivo, y ni uno pasa del espacio libre', () => {
    const pesos = pesosDe(5000);
    const r = B.cuantosCaben({ usado: 1000000, pesos });
    const gastado = pesos.slice(0, r.caben).reduce((t, p) => t + 3 * (p.largo + 1) + p.comillas, 0);
    assert.ok(gastado <= r.libre);
    const uno = pesos[r.caben];
    if (uno) assert.ok(gastado + 3 * (uno.largo + 1) + uno.comillas > r.libre, 'cabía uno más');
    assert.equal(r.libre, B.LIMITE_NAVEGADOR - B.MARGEN_NAVEGADOR - 1000000);
  });

  test('con el navegador lleno no entra ninguno, y no revienta con basura', () => {
    assert.equal(B.cuantosCaben({ usado: B.LIMITE_NAVEGADOR, pesos: pesosDe(10) }).caben, 0);
    assert.equal(B.cuantosCaben({ usado: 0, pesos: [] }).caben, 0);
    assert.doesNotThrow(() => B.cuantosCaben());
    assert.equal(B.cuantosCaben({ usado: 'x', pesos: 'y' }).caben, 0);
  });

  test('el peso se mide con el prospecto de verdad, comillas incluidas', () => {
    const p = prospecto(1), j = JSON.stringify(p);
    assert.deepEqual(B.pesoDeProspecto(p), { largo: j.length, comillas: (j.match(/"/g) || []).length });
  });
});

describe('el CRM carga solo los que caben, y nunca a costa de las fotos', () => {

  test('mide al leer el archivo y lo dice antes de cargar', () => {
    assert.match(cuerpo('leerArchivoBase'), /_baseLeida\.espacio = espacioParaBase\(_baseLeida\)/);
    const previo = cuerpo('pintarPrevioBase');
    assert.match(previo, /No caben todos en este navegador/);
    assert.match(previo, /Cargar \$\{caben\} prospectos/, 'el botón ofrece los que caben, no todos');
    assert.match(previo, /\$\{caben \? '' : 'disabled'\}/);
  });

  test('confirmar vuelve a medir, carga en orden y anota cuántos quedaron', () => {
    const f = cuerpo('confirmarCargaBase');
    assert.match(f, /espacioParaBase\(b\)\.caben/);
    assert.match(f, /b\.revision\.nuevos\.slice\(0, caben\)/);
    assert.match(f, /quedaron: faltan/);
    assert.ok(!/b\.revision\.nuevos\.forEach/.test(f), 'volvió a cargar la base entera sin medir');
  });

  test('si no cupiera igual, deshace la carga ANTES de que guardar() tire las fotos', () => {
    const f = cuerpo('confirmarCargaBase');
    const prueba = f.indexOf('localStorage.setItem(KEY, JSON.stringify(DB))');
    const guarda = f.indexOf('guardar()');
    assert.ok(prueba > 0 && guarda > prueba, 'la prueba de espacio tiene que ir antes de guardar()');
    assert.match(f, /prospectos\(\)\.splice\(antes\); basesCargadas\(\)\.splice\(basesAntes\)/);
  });

  test('la medición recorre TODO el localStorage del sitio, no solo la cartera', () => {
    const u = cuerpo('usoDelNavegador');
    assert.match(u, /localStorage\.length/);
    assert.match(u, /localStorage\.key\(i\)/);
  });
});
