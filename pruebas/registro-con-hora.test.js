/* ============================================================================
 * LA FECHA Y LA HORA DEL REGISTRO — 24-nov-2026
 *
 * Joan: «quiero que se vea la hora y fecha de registro». 📥 Registrados pintaba
 * solo el día, y lo sacaba cortando el texto que manda el servidor
 * (`creado_en.slice(0,10)`), que viene en hora UTC: quien se registraba en
 * Colombia después de las 7 p. m. salía con la fecha del día siguiente.
 *
 * El dato ya llegaba completo (registros.creado_en, timestamptz): no hay base
 * nueva. Aquí se fija que la bandeja y «👁 Ver datos» digan día Y hora, en la
 * hora del aparato.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');

/* Un registro de mentira hecho a las 7:42 p. m. del 23 de noviembre en Bogotá,
   que en UTC ya es el 24. La hora esperada se arma con el reloj de quien corre
   la prueba, igual que la arma la página. */
const CREADO = '2026-11-24T00:42:00Z';
const d = new Date(CREADO);
const HORA = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const REG = { id: 41, nombre: 'Persona Inventada', telefono: '3105550141', cedula: '10000041', estado: 'nuevo',
  origen: 'app', creado_en: CREADO, datos: { ciudad: 'Mosquera' } };

function crm() {
  const P = abrirPanel({});
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba' });
  P.cargarCartera({ socios: [], prestamos: [], config: { negocio: 'Tu Garantía' } });
  P.ev('_registros = ' + JSON.stringify([REG]));
  return P;
}

describe('crm.html · el registro dice su día y su hora', () => {
  test('la bandeja de Registrados pinta día y hora, no solo el día', () => {
    const P = crm();
    P.ev('renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.match(h, /Persona Inventada/, 'la bandeja pintó el registro');
    const esperado = P.ev('fmtFechaHora(' + JSON.stringify(CREADO) + ')');
    assert.ok(esperado.endsWith(' ' + HORA), 'fmtFechaHora da la hora de este aparato: ' + esperado);
    assert.ok(h.includes('>' + esperado + '</td>'), 'la columna «Cuándo» dice «' + esperado + '»');
  });

  test('el día es el de aquí, no el del servidor', () => {
    const P = crm();
    P.ev('renderRegistros()');
    const diaDeAqui = P.ev('fmtFecha(diaLocalISO(' + JSON.stringify(CREADO) + '))');
    assert.ok(P.elems.tblRegistros.innerHTML.includes('>' + diaDeAqui + ' ' + HORA + '</td>'));
    /* Y el corte viejo ya no está: era el que corría el día. */
    const fs = require('node:fs'), path = require('node:path');
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
    assert.equal(/<td>\$\{fmtFecha\(String\(r\.creado_en\|\|''\)\.slice\(0,10\)\)\}<\/td>/.test(fuente), false);
  });

  test('sin fecha no inventa una: pone una raya', () => {
    const P = crm();
    P.ev('_registros = ' + JSON.stringify([Object.assign({}, REG, { creado_en: null })]));
    P.ev('renderRegistros()');
    assert.match(P.elems.tblRegistros.innerHTML, /<td style="white-space:nowrap">—<\/td>/);
  });

  test('«👁 Ver datos» dice cuándo se registró, con la hora', () => {
    const P = crm();
    P.ev("verDatosRegistro('41')");
    const esperado = P.ev('fmtFechaHora(' + JSON.stringify(CREADO) + ')');
    assert.ok(P.elems.mBody.innerHTML.includes('<span class="k">Se registró el</span><span class="vv">' + esperado + '</span>'));
  });
});
