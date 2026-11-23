/* ============================================================================
 * LA BIENVENIDA DE UN CRÉDITO A CUOTAS DICE TODAS LAS CUOTAS — 23-nov-2026
 *
 *   node --test pruebas/bienvenida-a-cuotas.test.js
 *
 * Joan: «recuerda que al momento de hacer un credito de varias cuotas y
 * registrarlo el mensaje que se envia por whatsapp debe de mostrar no solo el
 * pago de la primera cuota si no todas las cuotas».
 *
 * La bienvenida de siempre dice «tu primera cuota de {saldo} es el
 * {fecha_pago}». Con el caso de Joan del 16-oct (650.000 en dos cuotas), a la
 * clienta le quedaba escrito el aviso de los 455.000 del 30-oct y nada de los
 * 390.000 del 15-nov.
 *
 * Arranca crm.html de verdad (banco-panel.js) y lee el mensaje que el CRM deja
 * listo para WhatsApp.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const PU = require(path.join(RAIZ, 'app', 'puente.js'));

const AHORA = new Date('2026-10-16T10:00:00').getTime();
const SOCIO = { id: 's1', numero: 1, nombre: 'Carlos Rincón', telefono: '3112457788', gestiones: [] };

/* El crédito de Joan del 16-oct, guardado como lo guarda el alta. */
function aCuotas(cuotas) {
  const plan = M.construirPlanACuotas(650000, cuotas || [
    { fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }
  ], { fechaDesembolso: '2026-10-16' });
  return { id: 'p1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre, telefono: SOCIO.telefono,
    capital: 650000, costoPct: plan.cuotas[0].pct, fechaDesembolso: '2026-10-16',
    cicloActual: plan.cuotas[0].fecha_corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false, planPagos: PU.planPagosDeAlta(plan) };
}
const deUnPago = () => ({ id: 'p1', numero: 1, socioId: 's1', socioNombre: SOCIO.nombre, telefono: SOCIO.telefono,
  capital: 300000, costoPct: 20, fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30',
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false });

function crmCon(prestamo) {
  const P = abrirPanel({ ahora: AHORA });
  P.cargarCartera({ socios: [JSON.parse(JSON.stringify(SOCIO))], prestamos: [prestamo],
    config: { negocio: 'Tu Garantía' } });
  return P;
}
/* El mensaje que el CRM arma para ESTE crédito pidiéndole la bienvenida. */
const mensaje = P => P.ev("(function(){var p=DB.prestamos[0],s=DB.socios[0],k=plantillaDeBienvenida(p,'bienvenida');" +
  "return aplicarVars(DB.plantillas[k]||PLANTILLAS_DEF[k].m,p,s,'',varsDePlantilla(p,k));})()");

describe('el mensaje de bienvenida', () => {
  test('a cuotas: dice las DOS cuotas, con su valor y su fecha', () => {
    const t = mensaje(crmCon(aCuotas()));
    assert.match(t, /Hola Carlos/);
    assert.match(t, /tu crédito de \$\s?650\.000/);
    assert.match(t, /Lo pagas en 2 cuotas:/);
    /* La fecha la escribe fmtFecha del CRM («30 de oct de 2026» o «30 oct 2026»,
       según el Node): se mira el día, el mes y el año, no los conectores. */
    assert.match(t, /• Cuota 1: \$\s?455\.000 el 30 (de )?oct\.? (de )?2026/);
    assert.match(t, /• Cuota 2: \$\s?390\.000 el 15 (de )?nov\.? (de )?2026/);
    assert.doesNotMatch(t, /primera cuota/, 'ya no habla solo de la primera');
  });

  test('a tres cuotas: las tres, en orden y cada una en su renglón', () => {
    const t = mensaje(crmCon(aCuotas([
      { fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }, { fecha: '2026-11-30', pct: 20 }
    ])));
    const renglones = t.split('\n').filter(l => /^• Cuota \d+:/.test(l));
    assert.equal(renglones.length, 3);
    assert.deepEqual(renglones.map(l => l.slice(0, 9)), ['• Cuota 1', '• Cuota 2', '• Cuota 3']);
    assert.match(t, /Lo pagas en 3 cuotas:/);
  });

  test('cada valor es el PACTADO de esa cuota: el mismo que viaja a la app', () => {
    const P = crmCon(aCuotas());
    const t = mensaje(P);
    const delPlan = PU.cuotasPlan(aCuotas()).map(c => c.total);
    assert.deepEqual(delPlan, [455000, 390000]);
    const enElMensaje = t.split('\n').filter(l => /^• Cuota/.test(l))
      .map(l => Number((/\$\s?([\d.]+)/.exec(l) || [])[1].replace(/\./g, '')));
    assert.deepEqual(enElMensaje, delPlan);
  });

  test('el cliente no ve porcentajes ni llaves sin contestar', () => {
    const t = mensaje(crmCon(aCuotas()));
    assert.doesNotMatch(t, /%/);
    assert.doesNotMatch(t, /\{[a-z_]+\}/, 'quedó una llave sin contestar: ' + t);
  });

  test('de un solo pago: la bienvenida de siempre, sin tocar', () => {
    const t = mensaje(crmCon(deUnPago()));
    /* La cifra no se escribe a mano: sin fecha, el CRM le pregunta al puente
       con el reloj de verdad, y pasado el corte trae recargo. */
    assert.match(t, /tu primera cuota de \$\s?[\d.]+ es el 30 (de )?oct/);
    assert.doesNotMatch(t, /• Cuota/);
    assert.doesNotMatch(t, /\{[a-z_]+\}/);
  });
});

describe('quién escoge la plantilla', () => {
  test('gestionar, con «bienvenida», abre la de cuotas para un crédito a cuotas', () => {
    const P = crmCon(aCuotas());
    P.ev("gestionar('p1','bienvenida')");
    /* Lo que quedó escrito en la ventana de gestión (openModal lo deja en mBody). */
    const html = String(P.ev("document.getElementById('mBody').innerHTML") || '');
    assert.match(html, /Lo pagas en 2 cuotas:/);
    assert.match(html, /Cuota 2: \$\s?390\.000/);
    assert.match(html, /marcarGestion\('p1','bienvenidaCuotas'\)/, 'la gestión queda anotada con la plantilla que salió');
  });

  test('el «próximo pago acordado» (un plan de UNA cuota) no es un crédito a cuotas', () => {
    const una = aCuotas([{ fecha: '2026-10-30', pct: 20 }, { fecha: '2026-11-15', pct: 20 }]);
    una.planPagos.cuotas = una.planPagos.cuotas.slice(0, 1);
    const P = crmCon(una);
    assert.equal(P.ev('esAVariasCuotas(DB.prestamos[0])'), false);
    assert.equal(P.ev("plantillaDeBienvenida(DB.prestamos[0],'bienvenida')"), 'bienvenida');
  });

  test('las otras plantillas no cambian', () => {
    const P = crmCon(aCuotas());
    for (const k of ['recordatorio1', 'recordatorio2', 'venceHoy', 'mora', 'recibo']) {
      assert.equal(P.ev("plantillaDeBienvenida(DB.prestamos[0],'" + k + "')"), k);
    }
  });

  test('la plantilla nueva está en Plantillas, con sus llaves y editable', () => {
    assert.match(CRM, /bienvenidaCuotas:\{t:'Bienvenida · crédito a cuotas'/);
    assert.match(CRM, /bienvenidaCuotas:\['nombre','negocio','monto','n_cuotas','cuotas'\]/);
    const P = crmCon(aCuotas());
    assert.deepEqual(JSON.parse(P.ev("JSON.stringify(tokensSueltos(PLANTILLAS_DEF.bienvenidaCuotas.m,'bienvenidaCuotas'))")), []);
  });

  test('si Joan la edita en Plantillas, sale la suya', () => {
    const P = crmCon(aCuotas());
    P.ev("DB.plantillas.bienvenidaCuotas='Hola {nombre}, estas son tus cuotas:\\n{cuotas}'");
    const t = mensaje(P);
    assert.match(t, /^Hola Carlos, estas son tus cuotas:\n• Cuota 1: /);
  });
});
