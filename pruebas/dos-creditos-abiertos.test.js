/* ============================================================================
 * DOS CRÉDITOS ABIERTOS: A Y B — 23-nov-2026
 *
 *   node --test pruebas/dos-creditos-abiertos.test.js
 *
 * Joan, mirando la app de una clienta desde el CRM: «ella tiene dos creditos
 * activos pero desde la app de cliente al inicio le aparece solo para pagar un
 * credito, separacelo por credito A Y B».
 *
 * La causa: Inicio pintaba `S.activo`, que es el PRIMER crédito sin pagar del
 * paquete, y el paquete viaja del más nuevo al más viejo. A la clienta con dos
 * abiertos le salía el último que pidió, y el otro —el más viejo, el que vence
 * primero— no aparecía en ninguna parte de Inicio.
 *
 * Lo que vigila este archivo, con la app de verdad (banco-socio.js) y una
 * clienta armada por el puente de verdad:
 *   1. con UN crédito abierto, Inicio es el de siempre: sin letras;
 *   2. con dos, cada uno tiene su renglón arriba y su tarjeta abajo, con su
 *      letra, y la A es el que recibió PRIMERO;
 *   3. cada renglón dice la MISMA cifra que diría la app si ese crédito fuera
 *      el único, y la cifra grande es la suma de los renglones;
 *   4. el crédito a cuotas muestra TODAS sus cuotas;
 *   5. cada tarjeta recuerda su propio crédito.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const P = require('../app/puente.js');
const M = require('../app/motor.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const DIA = '2026-11-23';
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const pesos = t => Number(String(t).replace(/[^\d]/g, ''));

const SOCIA = { id: 's1', numero: 1, nombre: 'Clienta De Prueba', cedula: '52111222', telefono: '3001112233',
  whatsappIgual: true, gestiones: [], ajusteGarantia: 0 };

function base(id, numero, capital, desembolso, corte) {
  return { id, numero, socioId: 's1', socioNombre: SOCIA.nombre, capital, costoPct: 20,
    fechaDesembolso: desembolso, cicloActual: corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: false };
}
function pagado(id, numero, capital, desembolso, corte) {
  return Object.assign(base(id, numero, capital, desembolso, corte),
    { pagado: true, cobroRegistrado: true, fechaPagado: corte, fechaPago: corte, cicloPago: corte,
      gananciaPago: Math.round(capital * 0.2), recargoMora: 0 });
}
/* El quincenal de siempre: 300.000 recibidos el 16-nov, corte el 30-nov. */
const quincenal = () => base('pq', 7, 300000, '2026-11-16', '2026-11-30');
/* Uno a cuotas, MÁS NUEVO: 400.000 recibidos el 20-nov, en dos cuotas. */
function aCuotas() {
  const plan = M.construirPlanACuotas(400000, [
    { fecha: '2026-11-30', pct: 20 }, { fecha: '2026-12-15', pct: 20 }
  ], { fechaDesembolso: '2026-11-20' });
  return Object.assign(base('pc', 8, 400000, '2026-11-20', plan.cuotas[0].fecha_corte),
    { costoPct: plan.cuotas[0].pct, planPagos: P.planPagosDeAlta(plan) });
}

async function app(prestamos) {
  const db = { socios: [JSON.parse(JSON.stringify(SOCIA))], prestamos, config: { negocio: 'Tu Garantía' } };
  const paquete = P.migrarSocio(db, db.socios[0], DIA);
  const ahora = new Date(DIA + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000,
    celular: SOCIA.telefono, paquete: { nombre: SOCIA.nombre, datos: paquete,
      actualizado_en: DIA + 'T10:00:00Z', origen: 'nube', cedula: SOCIA.cedula } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  A.ev("irA('inicio')");
  return { A, paquete, html: A.elem('cuerpo').innerHTML };
}
/* La tarjeta de arriba de Inicio (la de la laca con la cifra grande). */
function tarjetaDeArriba(html) {
  const i = html.indexOf('tienes que pagar</div>');
  assert.ok(i > 0, 'Inicio no tiene la tarjeta de «tienes que pagar»');
  const ini = html.lastIndexOf('<div class="card laca">', i);
  const fin = html.indexOf('Calcular y pedir', i);
  return html.slice(ini, fin);
}
const cifraGrande = t => pesos((/<div class="cifra">([^<]+)<\/div>/.exec(t) || [])[1]);
/* Los renglones «Crédito X · …» de la tarjeta de arriba: letra, texto y pesos. */
function renglones(t) {
  return [...t.matchAll(/<span class="k">Crédito ([A-Z]) · ([^<]+)<\/span><span class="v">([^<]+)<\/span>/g)]
    .map(m => ({ letra: m[1], texto: m[2], pesos: pesos(m[3]) }));
}

describe('con UN crédito abierto, Inicio es el de siempre', () => {
  test('no hay letras: ni «Crédito A» ni «Entre tus…»', async () => {
    const { html } = await app([pagado('p1', 1, 300000, '2026-10-16', '2026-10-31'), quincenal()]);
    const t = plano(html);
    assert.match(t, /Este corte tienes que pagar/);
    assert.match(t, /Tu crédito de ahora/);
    assert.doesNotMatch(t, /Crédito [A-Z]\b/);
    assert.doesNotMatch(t, /Entre tus/);
    assert.match(html, /onclick="recordarme\(\)"/);
    assert.match(html, /id="recordarPie"/);
  });
  test('y la cifra es la misma con el crédito a cuotas solo', async () => {
    const { html } = await app([aCuotas()]);
    const t = plano(html);
    assert.match(t, /Este corte tienes que pagar/);
    assert.match(t, /Tu crédito a cuotas · cuota 1 de 2/);
    assert.doesNotMatch(t, /Crédito [A-Z]\b/);
  });
});

describe('con DOS créditos abiertos, cada uno sale por separado', () => {
  test('el paquete viaja del más nuevo al más viejo (es la causa del defecto)', async () => {
    const { paquete } = await app([quincenal(), aCuotas()]);
    const abiertos = paquete.creditos.filter(c => !c.pagado);
    assert.equal(abiertos.length, 2);
    assert.equal(abiertos[0].desembolso, '2026-11-20', 'si el paquete cambia de orden, revisar creditosAbiertos');
    assert.equal(abiertos[1].desembolso, '2026-11-16');
  });

  test('arriba hay un renglón por crédito y la A es el que recibió PRIMERO', async () => {
    const { html } = await app([quincenal(), aCuotas()]);
    const arriba = tarjetaDeArriba(html);
    assert.match(plano(arriba), /Entre tus 2 créditos tienes que pagar/);
    const r = renglones(arriba);
    assert.deepEqual(r.map(x => x.letra), ['A', 'B']);
    assert.match(r[0].texto, /^quincenal, el /, 'el A es el quincenal del 16-nov');
    assert.match(r[1].texto, /^cuota 1 de 2, el /, 'el B es el de cuotas del 20-nov');
    assert.doesNotMatch(plano(arriba), /Este corte tienes que pagar/,
      'dos créditos pueden vencer en días distintos: no se dice «este corte»');
  });

  test('cada renglón dice lo MISMO que diría la app con ese crédito solo, y la cifra grande es la suma', async () => {
    const solo = async prestamo => cifraGrande(tarjetaDeArriba((await app([prestamo])).html));
    const deA = await solo(quincenal());
    const deB = await solo(aCuotas());
    assert.ok(deA > 0 && deB > 0);
    const arriba = tarjetaDeArriba((await app([quincenal(), aCuotas()])).html);
    const r = renglones(arriba);
    assert.equal(r[0].pesos, deA, 'el renglón del A no cuadra con su propia cuenta');
    assert.equal(r[1].pesos, deB, 'el renglón del B no cuadra con su propia cuenta');
    assert.equal(cifraGrande(arriba), deA + deB);
  });

  test('las cifras salen del puente: 360.000 del quincenal y 280.000 de la cuota 1', async () => {
    /* 300.000 al 20 % = 360.000. 400.000 en dos cuotas: 200.000 + 20 % de
       400.000 = 280.000 la primera. */
    const r = renglones(tarjetaDeArriba((await app([quincenal(), aCuotas()])).html));
    assert.deepEqual(r.map(x => x.pesos), [360000, 280000]);
  });

  test('abajo hay una tarjeta por crédito, con su letra y cuál es', async () => {
    const { html } = await app([quincenal(), aCuotas()]);
    const t = plano(html);
    assert.match(t, /Crédito A · quincenal/);
    assert.match(t, /Crédito B · a cuotas · cuota 1 de 2/);
    assert.match(t, /Es el que recibiste el 16 nov/);
    assert.match(t, /Es el que recibiste el 20 nov/);
    assert.ok(t.indexOf('Crédito A · quincenal') < t.indexOf('Crédito B · a cuotas'), 'la A va primero');
    assert.doesNotMatch(t, /Tu crédito de ahora/, 'con dos, ninguno es «el de ahora»');
  });

  test('el crédito a cuotas muestra TODAS sus cuotas, con valor y fecha', async () => {
    const { html } = await app([quincenal(), aCuotas()]);
    const t = plano(html);
    assert.match(t, /Tus cuotas/);
    assert.match(t, /Cuota 1 · 30 nov[^$]*\$\s?280\.000/);
    assert.match(t, /Cuota 2 · 15 dic[^$]*\$\s?240\.000/);
  });

  test('cada tarjeta recuerda SU crédito', async () => {
    const { A, html } = await app([quincenal(), aCuotas()]);
    assert.match(html, /onclick="recordarme\(0\)"/);
    assert.match(html, /onclick="recordarme\(1\)"/);
    assert.match(html, /id="recordarPie0"/);
    assert.match(html, /id="recordarPie1"/);
    assert.equal(A.ev('S.activos[0].desembolso'), '2026-11-16');
    assert.equal(A.ev('S.activos[1].desembolso'), '2026-11-20');
    /* El recordatorio del A lleva la fecha del A. */
    assert.match(A.ev('armarICS(S.activos[0])'), /20261130/);
    assert.match(A.ev('armarICS(S.activos[1])'), /20261130|20261215/);
  });

  test('la app no hace cuentas de plata nuevas: la tarjeta de varios solo suma', () => {
    const fs = require('node:fs');
    const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');
    const i = html.indexOf('function tarjetaVariosCreditos(');
    const cuerpo = html.slice(i, html.indexOf('\nfunction vistaInicio()', i));
    assert.ok(i > 0 && cuerpo.length > 200);
    assert.doesNotMatch(cuerpo, /\*\s*0?\.\d|\bTASA|costoPct|calcularCosto/, 'ahí no se calcula ningún costo');
    assert.doesNotMatch(cuerpo.replace(/\/\*[\s\S]*?\*\//g, ''), /%/, 'ni se le muestra un porcentaje al cliente');
  });
});

describe('con TRES abiertos y con uno atrasado', () => {
  test('A, B y C, del que recibió primero al último', async () => {
    const tercero = base('p3', 9, 150000, '2026-11-21', '2026-11-30');
    const { html } = await app([quincenal(), aCuotas(), tercero]);
    const arriba = tarjetaDeArriba(html);
    assert.match(plano(arriba), /Entre tus 3 créditos tienes que pagar/);
    const r = renglones(arriba);
    assert.deepEqual(r.map(x => x.letra), ['A', 'B', 'C']);
    assert.equal(cifraGrande(arriba), r.reduce((t, x) => t + x.pesos, 0));
  });

  test('el atrasado lo dice en su renglón, con el recargo adentro', async () => {
    /* Un quincenal que venció el 15-nov: el 23-nov lleva 8 días. */
    const viejo = base('pv', 5, 200000, '2026-11-01', '2026-11-15');
    const { html } = await app([viejo, quincenal()]);
    const arriba = tarjetaDeArriba(html);
    const r = renglones(arriba);
    assert.deepEqual(r.map(x => x.letra), ['A', 'B']);
    assert.match(r[0].texto, /^quincenal, vencía el 15 nov[^,]*, con el recargo$/);
    assert.ok(r[0].pesos > 240000, 'el A trae su recargo: más que 200.000 + 40.000');
    assert.match(plano(html), /Crédito A · quincenal[\s\S]*día[s]? de atraso/);
  });

  test('los pagados no llevan letra ni cuentan', async () => {
    const { html } = await app([pagado('p1', 1, 300000, '2026-10-01', '2026-10-15'),
      pagado('p2', 2, 300000, '2026-10-16', '2026-10-31'), quincenal(), aCuotas()]);
    assert.match(plano(tarjetaDeArriba(html)), /Entre tus 2 créditos tienes que pagar/);
  });
});
