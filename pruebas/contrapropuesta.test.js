/* ============================================================================
 * LA CONTRAPROPUESTA A CUOTAS — 16 de septiembre de 2026
 *
 *   node --test pruebas/contrapropuesta.test.js
 *
 * Joan: «cuando yo envíe la contrapropuesta le aparezca segmentado la fecha y
 * monto a pagar para mejorar la cobranza y dar claridad».
 *
 * ESTE ARCHIVO CUIDA EL CAMINO ENTERO, de punta a punta: lo que el CRM de Joan
 * arma, lo que el servidor acepta, y lo que el cliente termina viendo. Se cuida
 * entero y no por trozos porque los tres se escribieron aparte y el defecto caro
 * de este proyecto no está en las reglas: está en el pegamento.
 *
 * LO QUE NO PUEDE PASAR, en orden de qué tan caro sale:
 *
 *  1. UN PRECIO POR ENCIMA DEL TECHO DE USURA. El artículo 305 del Código Penal
 *     lo castiga con 32 a 90 meses de prisión y dice «cualquiera sea la forma
 *     utilizada para hacer constar la operación, ocultarla o disimularla». La
 *     efectiva anual se mide sobre el flujo REAL —lo que entrega contra lo que
 *     le devuelven, cuota por cuota— y se compara contra el techo del mes.
 *
 *  2. UN PLAN QUE NO CUADRA. Si los capitales de las cuotas no suman exacto lo
 *     prestado, el cliente lee un plan que nadie va a poder cobrar. Se comprueba
 *     en el CRM y OTRA VEZ en el servidor, porque son dos cosas distintas: que
 *     el motor calcule bien, y que lo que llegó a la base sea lo que el motor
 *     calculó.
 *
 *  3. UNA CUOTA QUE NACE VENCIDA. Un plan cuya primera fecha ya pasó es lo peor
 *     que se le puede mandar a alguien a quien se le va a cobrar.
 *
 *  4. QUE EL CLIENTE NO VEA LAS FECHAS. Es literalmente lo que Joan pidió, y lo
 *     que separa esto de la propuesta de un solo pago que ya había.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');
const M = require('../app/motor.js');
const C = require('../app/creditos.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260916_contrapropuesta_a_cuotas.sql');
const VIVO = CRM.replace(/\/\*[\s\S]*?\*\//g, ' ');
const SQL_VIVO = SQL.replace(/--[^\n]*/g, ' ');

const HOY = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
})();

/* --------------------------------------------------------------- el banco */
/* Un socio con garantía ganada y una solicitud suya por más de lo que le
   alcanza: el caso exacto que Joan describió. */
const SOCIO = {
  id: 'C1', numero: 1, nombre: 'Ana Rodriguez', cedula: '52111222',
  telefono: '3011000001', garantiaAcumulada: 1500000, ajusteGarantia: 0,
  referidos: [], datos: {}
};
const SOLICITUD = {
  id: 77, cedula: '3011000001', nombre: 'Ana Rodriguez',
  capital: 3000000, tasa: 0.2, costo: 600000, total: 3600000,
  estado: 'nueva', producto: 'respaldado', plazo_meses: 6,
  contrapropuesta: null, datos: {}
};

function abrirCrm(opciones) {
  const o = opciones || {};
  const enviados = [];
  const P = abrirPanel({
    red: (url, cfg) => {
      const fn = String(url).split('/rpc/')[1] || String(url);
      let cuerpo = null;
      try { cuerpo = JSON.parse((cfg && cfg.body) || 'null'); } catch (e) { cuerpo = null; }
      enviados.push({ fn, cuerpo });
      return Promise.resolve({ ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify(o.respuesta || { ok: true })),
        json: () => Promise.resolve(o.respuesta || { ok: true }) });
    }
  });
  /* La nube conectada, para que rpc() no se niegue antes de salir. */
  P.almacen['joan_socios_sb'] = JSON.stringify({
    url: 'https://x.supabase.co', anon: 'k', clave: 'secreta' });
  P.ev('DB = cargar();');
  P.ev('DB.socios = ' + JSON.stringify([SOCIO]) + ';');
  P.ev('_solicitudes = ' + JSON.stringify([Object.assign({}, SOLICITUD, o.solicitud || {})]) + ';');
  /* La garantía ganada del socio se pone a mano: de dónde sale es asunto del
     puente y tiene sus propias pruebas. Lo que se mide acá es qué hace la
     contrapropuesta con ese número —y maxRespaldadoDe sigue siendo el del
     motor—, así que esto no se cae el día que el puente cambie de campo. */
  P.ev('entradaRespaldoDe = function () { return ' +
       JSON.stringify({ datos: {}, referidos: 0, acumulada: 1500000, ajuste: 0, comprometida: 0 }) +
       '; };');
  /* CADA BANCO CON SU PROPIA COPIA DE creditos.js, y esto no es un detalle:
     `require` devuelve SIEMPRE el mismo objeto, así que la prueba que le baja el
     techo de usura a mano para provocar el caso se lo dejaba bajado a todas las
     que vinieran después. Tres pruebas fallaban por una cuarta, y ninguna decía
     por qué. Con la copia, lo que una toque se queda en la suya. */
  P.ev('CreditosPublicables = Object.assign({}, CreditosPublicables);');
  return { P, enviados };
}

/* El plan tal como lo arma el CRM, con los campos ya puestos. */
function planDelCrm(P, capital, meses) {
  P.ev("editarContrapropuesta('77', 'cuotas')");
  P.ev("document.getElementById('cqCap').value = '" + capital + "'");
  P.ev("document.getElementById('cqMeses').value = '" + meses + "'");
  return JSON.parse(P.ev('JSON.stringify(planDeCuotas())'));
}

/* ==========================================================================
 * LO QUE EL CRM ARMA
 * ======================================================================== */
describe('el CRM arma el plan con el motor, y con nada más', () => {

  test('NI UNA CUOTA SE CALCULA A MANO en esta pantalla', () => {
    /* La amortización vive en motor.js y es la misma que después cobra mes a
       mes. Una segunda aritmética acá es la puerta por la que el cliente ve un
       plan y el CRM cobra otro. */
    const i = VIVO.indexOf('function planDeCuotas');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /M\.simularPrestamoRespaldado\(/,
      'planDeCuotas dejó de pedirle el plan al motor');
    assert.ok(!/Math\.pow\(|\/\s*\(1\s*-\s*Math\.pow/.test(cuerpo),
      'planDeCuotas está amortizando por su cuenta');
  });

  test('el plan que arma es EXACTAMENTE el del motor', () => {
    const { P } = abrirCrm();
    const p = planDelCrm(P, 2000000, 6);
    const r = M.simularPrestamoRespaldado(2000000, 6,
      { datos: {}, referidos: 0, acumulada: 1500000, ajuste: 0, comprometida: 0 },
      { fechaDesembolso: HOY });
    assert.equal(p.capital, r.capital);
    assert.equal(p.costo, r.costo_total);
    assert.equal(p.total, r.total_a_pagar);
    assert.equal(p.cuota, r.cuota_fija);
    assert.equal(p.cuotas.length, r.cuotas.length);
    p.cuotas.forEach((q, k) => {
      assert.equal(q.total, r.cuotas[k].total, 'la cuota ' + (k + 1) + ' no es la del motor');
      assert.equal(q.fecha, r.cuotas[k].fecha_corte, 'la fecha de la cuota ' + (k + 1) + ' no es la del motor');
    });
  });

  test('LOS CAPITALES SUMAN EXACTO LO PRESTADO, y las cuotas el total', () => {
    /* Un peso suelto acá es un peso que alguien va a reclamar. */
    const { P } = abrirCrm();
    [1000000, 1750000, 3000000].forEach(cap => {
      [3, 4, 5, 6].forEach(m => {
        const p = planDelCrm(P, cap, m);
        const sumaCap = p.cuotas.reduce((t, q) => t + q.capital, 0);
        const sumaTot = p.cuotas.reduce((t, q) => t + q.total, 0);
        assert.equal(sumaCap, p.capital,
          'con ' + cap + ' a ' + m + ' meses los capitales suman ' + sumaCap);
        assert.equal(sumaTot, p.capital + p.costo,
          'con ' + cap + ' a ' + m + ' meses las cuotas suman ' + sumaTot);
      });
    });
  });

  test('LA EFECTIVA ANUAL SALE DEL FLUJO REAL y se compara con el techo del mes', () => {
    const { P } = abrirCrm();
    const p = planDelCrm(P, 2000000, 6);
    /* 16-sep-2026 — CON LAS FECHAS, y antes se comparaba contra la fórmula de
       periodos iguales. Las cuotas de este producto caen en los cortes: con
       desembolso el 10 la primera cae a veinte días y no a treinta, así que la
       tasa de verdad es más alta —hasta 33,07% donde se calculaba 26,82%—. La
       reja de usura de esta pantalla estaba comparando el techo contra un número
       que no era el del crédito que Joan iba a mandar. */
    assert.ok(Math.abs(p.ea - C.efectivoAnualPorFechas(HOY, p.capital,
        p.cuotas.map(q => ({ fecha: q.fecha, total: q.total })))) < 1e-9,
      'la efectiva anual no es la del flujo que se le va a cobrar, en sus fechas');
    const t = C.topeVigente(HOY);
    assert.equal(p.tope, t ? t.consumo_ordinario : null,
      'el techo que usa no es el certificado para hoy');
    assert.ok(p.ea <= p.tope,
      'el producto con garantía se pasó del techo de usura: ' + (p.ea * 100).toFixed(2) + '%');
  });

  test('las fechas van de menor a mayor y ninguna nace vencida', () => {
    const { P } = abrirCrm();
    const p = planDelCrm(P, 1500000, 6);
    let ant = null;
    p.cuotas.forEach((q, k) => {
      assert.ok(String(q.fecha) >= HOY, 'la cuota ' + (k + 1) + ' nace vencida: ' + q.fecha);
      if (ant) assert.ok(String(q.fecha) > ant, 'las fechas no crecen: ' + ant + ' → ' + q.fecha);
      ant = String(q.fecha);
    });
  });

  test('SI SE PASA DEL TECHO, NO SE MANDA — ni por el botón ni por la función', () => {
    /* Se le baja el techo a mano para provocar el caso. El artículo 305 no
       distingue entre una tasa alta puesta a propósito y una puesta por error,
       así que la reja tiene que estar en el camino de guardar y no solo en el
       color de una cifra. */
    const { P, enviados } = abrirCrm();
    P.ev("editarContrapropuesta('77', 'cuotas')");
    P.ev("document.getElementById('cqCap').value = '2000000'");
    P.ev("document.getElementById('cqMeses').value = '6'");
    /* Un techo imposible: 1% efectivo anual. */
    P.ev('CreditosPublicables.topeVigente = function () { ' +
         'return { desde: "2026-09-01", hasta: "2026-09-30", consumo_ordinario: 0.01, fuente: "prueba" }; };');
    P.ev('previsualizarCuotas()');
    assert.equal(P.ev("document.getElementById('cqBtn').disabled"), true,
      'con el precio por encima del techo, el botón de mandar sigue encendido');
    P.ev("guardarContrapropuestaCuotas('77')");
    assert.equal(enviados.filter(x => x.fn === 'contrapropuesta_a_cuotas').length, 0,
      'mandó una propuesta por encima del techo de usura');
  });

  test('SIN TECHO CERTIFICADO tampoco se manda, y se dice por qué', () => {
    /* La tabla se vence el último día de cada mes por diseño. Esta app ya estuvo
       a punto de publicar «tasa máxima legal: 0,00%» una vez. */
    const { P, enviados } = abrirCrm();
    P.ev("editarContrapropuesta('77', 'cuotas')");
    P.ev("document.getElementById('cqCap').value = '2000000'");
    P.ev("document.getElementById('cqMeses').value = '6'");
    P.ev('CreditosPublicables.topeVigente = function () { return null; };');
    P.ev('previsualizarCuotas()');
    const c = P.elems.cqCalc.innerHTML;
    assert.match(c.replace(/\s+/g, ' '), /certificación de la tasa máxima legal/i,
      'sin techo certificado no explica por qué no se puede');
    assert.equal(P.ev("document.getElementById('cqBtn').disabled"), true);
    P.ev("guardarContrapropuestaCuotas('77')");
    assert.equal(enviados.filter(x => x.fn === 'contrapropuesta_a_cuotas').length, 0,
      'mandó una propuesta sin saber cuál es el techo del mes');
  });

  test('por debajo del mínimo del producto no se manda', () => {
    const { P, enviados } = abrirCrm();
    P.ev("editarContrapropuesta('77', 'cuotas')");
    P.ev("document.getElementById('cqCap').value = '400000'");
    P.ev("document.getElementById('cqMeses').value = '6'");
    P.ev('previsualizarCuotas()');
    assert.match(P.elems.cqCalc.innerHTML, /va desde/i);
    P.ev("guardarContrapropuestaCuotas('77')");
    assert.equal(enviados.filter(x => x.fn === 'contrapropuesta_a_cuotas').length, 0,
      'mandó un préstamo con garantía por debajo del mínimo');
  });

  test('LE DICE A JOAN HASTA DÓNDE LE ALCANZA LA GARANTÍA AL CLIENTE', () => {
    /* Es el caso que Joan describió: «si no tienen casi cupo e igual solicitan
       un monto alto». Sin esa comparación, la contrapropuesta sería a ciegas. */
    const { P } = abrirCrm();
    P.ev("editarContrapropuesta('77')");
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /Pidió/, 'no dice cuánto pidió');
    assert.match(h, /garantía ganada le alcanza para/i,
      'no dice hasta dónde le alcanza la garantía');
    assert.match(h, /menos de lo que pidió/i,
      'pidió más de lo que le alcanza y no lo dice');
    /* Y la cifra es la del motor, no una cuenta de esta pantalla. */
    const max = M.maximoRespaldado({ datos: {}, referidos: 0, acumulada: 1500000,
                                     ajuste: 0, comprometida: 0 });
    assert.ok(h.indexOf('$' + max.toLocaleString('es-CO')) >= 0,
      'el respaldo que muestra no es el que calcula el motor');
  });

  test('lo que se manda a la nube es exactamente lo que se previsualizó', () => {
    const { P, enviados } = abrirCrm();
    const p = planDelCrm(P, 2000000, 6);
    P.ev("document.getElementById('cqTexto').value = 'Te alcanza para esto'");
    P.ev("guardarContrapropuestaCuotas('77')");
    const env = enviados.filter(x => x.fn === 'contrapropuesta_a_cuotas');
    assert.equal(env.length, 1, 'no mandó la propuesta');
    const b = env[0].cuerpo.p_cuerpo;
    assert.equal(b.capital, p.capital);
    assert.equal(b.costo, p.costo);
    assert.equal(b.meses, p.meses);
    assert.equal(b.cuotas.length, p.meses);
    assert.equal(b.texto, 'Te alcanza para esto');
    assert.equal(b.ea, p.ea, 'la efectiva anual que manda no es la que calculó');
    assert.equal(b.tope, p.tope, 'el techo que manda no es el que aplicó');
    assert.equal(env[0].cuerpo.p_id, 77);
    /* La clave viaja, porque esta función es de Joan y no del cliente. */
    assert.equal(env[0].cuerpo.p_clave, 'secreta');
  });

  test('la forma de la propuesta se conserva al reabrirla', () => {
    /* Si Joan ya mandó cuotas y al reabrir viera un pago único, perdería su
       trabajo sin que nada se lo dijera. */
    const { P } = abrirCrm({ solicitud: { contrapropuesta: {
      capital: 2000000, costo: 142308, total: 2142308, meses: 6,
      cuotas: [{ numero: 1, fecha: '2026-10-15', capital: 317000, costo: 40000, total: 357000 }],
      texto: 'hola', por: 'joan' } } });
    P.ev("editarContrapropuesta('77')");
    assert.equal(P.ev('_cpModo'), 'cuotas',
      'una propuesta a cuotas se reabre como un pago único');
  });
});

/* ==========================================================================
 * LO QUE EL SERVIDOR ACEPTA
 * ======================================================================== */
describe('el servidor comprueba lo que no puede dar por bueno', () => {

  test('VOLÁTIL, porque pasa por clave_ok', () => {
    const i = SQL_VIVO.indexOf('create or replace function public.contrapropuesta_a_cuotas');
    const cab = SQL_VIVO.slice(i, SQL_VIVO.indexOf('as $$', i));
    assert.ok(!/\bstable\b|\bimmutable\b/.test(cab),
      'contrapropuesta_a_cuotas se declaró stable y pasa por clave_ok: 25006 siempre');
  });

  test('un cliente con sesión NO puede cambiarse su propia propuesta', () => {
    assert.match(SQL_VIVO,
      /revoke all on function public\.contrapropuesta_a_cuotas\(text, bigint, jsonb\)\s*\n?\s*from public, anon, authenticated/,
      'falta el revoke: PostgreSQL le concede EXECUTE a PUBLIC por defecto');
    assert.ok(!/grant\s+execute on function public\.contrapropuesta_a_cuotas\([^)]*\)\s*to\s+authenticated/.test(SQL_VIVO),
      'un cliente con sesión puede llamarla: se cambiaría su propio precio');
    assert.match(SQL_VIVO, /grant\s+execute on function public\.contrapropuesta_a_cuotas\([^)]*\)\s*to anon/,
      'el CRM de Joan no puede llamarla');
  });

  test('comprueba las cuatro cosas que no puede dar por buenas', () => {
    const i = SQL_VIVO.indexOf('create or replace function public.contrapropuesta_a_cuotas');
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf('\n$$;', i));
    assert.match(cuerpo, /suma_cap <> v_capital/,
      'no comprueba que los capitales sumen lo prestado');
    assert.match(cuerpo, /suma_tot <> v_capital \+ v_costo/,
      'no comprueba que las cuotas sumen el total');
    assert.match(cuerpo, /f <= f_ant/,
      'no comprueba que las fechas vayan de menor a mayor');
    assert.match(cuerpo, /f < current_date/,
      'acepta un plan cuya primera cuota ya venció');
    assert.match(cuerpo, /ea > tope/,
      'no comprueba la efectiva anual contra el techo que el CRM dice haber aplicado');
    /* Y el techo tiene que venir: sin él no se puede saber con qué se aprobó. */
    assert.match(cuerpo, /no dice con que techo de usura se calculo/,
      'acepta una propuesta que no dice con qué techo se calculó');
  });

  test('las variables del loop se reinician, como en la lección del 14-sep', () => {
    /* En plpgsql las del declare viven toda la función. Una que se quede con el
       valor anterior acá dejaría pasar un plan con fechas repetidas. */
    const i = SQL_VIVO.indexOf('create or replace function public.contrapropuesta_a_cuotas');
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf('\n$$;', i));
    const antes = cuerpo.slice(0, cuerpo.indexOf('for c in select'));
    assert.match(antes, /f_ant\s*:=\s*null/,
      'f_ant no se reinicia antes del loop');
  });

  test('NINGUNA VARIABLE SE LLAMA COMO UNA COLUMNA que se actualiza', () => {
    /* «capital = capital» en un UPDATE es la columna contra sí misma, o un error
       de ambigüedad. Es la trampa de plpgsql que ya costó un defecto acá. */
    const i = SQL_VIVO.indexOf('create or replace function public.contrapropuesta_a_cuotas');
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf('\n$$;', i));
    const upd = cuerpo.slice(cuerpo.indexOf('update public.solicitudes'));
    ['capital', 'costo', 'total', 'tasa', 'estado', 'producto'].forEach(col => {
      assert.ok(!new RegExp('\\b' + col + '\\s*=\\s*' + col + '\\b').test(upd),
        'el UPDATE hace «' + col + ' = ' + col + '»: la columna contra sí misma');
    });
  });

  test('el cuerpo guardado deja vivir a una app vieja', () => {
    /* Lleva cuotas Y fecha_pago/total/dias. Una app en el teléfono de alguien
       que todavía no se actualizó muestra la propuesta con la última fecha —que
       es la verdad para quien solo entiende de un pago— en vez de quedarse en
       blanco. */
    const i = SQL_VIVO.indexOf("cp := jsonb_build_object");
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf("update public.solicitudes", i));
    ["'cuotas'", "'fecha_pago'", "'total'", "'dias'", "'capital'", "'costo'"].forEach(k =>
      assert.ok(cuerpo.indexOf(k) >= 0, 'el cuerpo guardado perdió ' + k));
    assert.match(cuerpo, /'por',\s*'joan'/, 'la propuesta no dice que la mandó Joan');
  });
});

/* ==========================================================================
 * LO QUE EL CLIENTE VE — el pegamento, de punta a punta
 * ======================================================================== */
describe('el cliente ve las fechas y los montos, cuota por cuota', () => {

  /* El banco de play/, en chiquito: lo que hace falta para pintar una tarjeta. */
  function abrirPlay() {
    const html = leer('play/index.html');
    const elems = {};
    const elem = id => (elems[id] = elems[id] || {
      id, value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
      appendChild() {}, setAttribute() {}, focus() {}, getContext: () => null,
      scrollIntoView() {}
    });
    const ctx = {
      console, document: { getElementById: elem, querySelector: () => null,
        querySelectorAll: () => [], createElement: () => elem('x'), addEventListener() {},
        head: elem('head'), body: elem('body'), documentElement: elem('html'), title: '' },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      location: { href: 'https://tugarantia.net/play/', hash: '', pathname: '/play/',
        search: '', protocol: 'https:', host: 'tugarantia.net', origin: 'https://tugarantia.net' },
      history: { replaceState() {} },
      navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() } },
      fetch: () => Promise.reject(new Error('sin red')),
      setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      requestAnimationFrame: () => 0, cancelAnimationFrame() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
      btoa: s => Buffer.from(s, 'binary').toString('base64'),
      atob: s => Buffer.from(s, 'base64').toString('binary'),
      Image: class {}, FileReader: class {}, Blob: class {}, File: class {},
      alert() {}, confirm: () => true, open() {}, scrollTo() {},
      performance: { now: () => 0 },
      _oyentes: {}, addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
      removeEventListener() {}, dispatchEvent() { return true; }
    };
    ctx.window = ctx; ctx.self = ctx;
    ctx.CreditosPublicables = C;
    ctx.CuentaSocio = require('../app/cuenta.js');
    ctx.Cumplimiento = require('../app/cumplimiento.js');
    ctx.MotorReglas = M;
    ctx.FichaSocio = require('../app/ficha.js');
    ctx.ChatTuGarantia = require('../app/chat.js');
    vm.createContext(ctx);
    [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'play#' + i }));
    return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems };
  }

  test('DE PUNTA A PUNTA: lo que el CRM manda, el cliente lo lee con sus fechas', () => {
    /* Esta es la prueba que vale por todas: se arma la propuesta en el CRM, se
       toma el cuerpo TAL CUAL saldría hacia la nube, y se le da a la pantalla
       del cliente. Si alguno de los tres cambia un nombre de campo, esto se cae
       —y es justo el defecto que ninguna prueba de un solo lado ve. */
    const { P, enviados } = abrirCrm();
    planDelCrm(P, 2000000, 6);
    P.ev("guardarContrapropuestaCuotas('77')");
    const b = enviados.filter(x => x.fn === 'contrapropuesta_a_cuotas')[0].cuerpo.p_cuerpo;

    /* El cuerpo que el servidor guarda, armado como lo arma la migración. */
    const ult = b.cuotas[b.cuotas.length - 1].fecha;
    const cp = Object.assign({}, b, { total: b.capital + b.costo, fecha_pago: ult,
                                      por: 'joan', producto: 'respaldado' });

    const Y = abrirPlay();
    const h = Y.ev('tarjetaContrapropuesta(' +
      JSON.stringify({ id: 77, estado: 'contrapropuesta', contrapropuesta: cp }) + ')');

    const COP = n => '$' + Math.round(n).toLocaleString('es-CO');
    assert.ok(h.indexOf(COP(b.capital)) >= 0, 'el cliente no ve cuánto recibe');
    assert.ok(h.indexOf(COP(b.capital + b.costo)) >= 0, 'el cliente no ve cuánto devuelve');
    assert.match(h, /Cuándo pagas/, 'no le muestra cuándo paga');
    /* Y CADA cuota, con su fecha y su monto: es lo que Joan pidió. */
    b.cuotas.forEach((q, k) => {
      assert.ok(h.indexOf('Cuota ' + q.numero) >= 0,
        'falta la cuota ' + q.numero + ' en la pantalla del cliente');
      assert.ok(h.indexOf(COP(q.total)) >= 0,
        'falta el monto de la cuota ' + q.numero);
    });
    assert.ok(h.indexOf('Pago único') === -1,
      'una propuesta a cuotas se está pintando como un pago único');
    /* Y ni un porcentaje: al cliente se le habla en pesos. */
    const limpio = h.replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!/\d+(,\d+)?\s*%/.test(limpio),
      'la propuesta le muestra un porcentaje al cliente');
  });

  test('una propuesta de un solo pago sigue viéndose como un solo pago', () => {
    /* Lo viejo no se rompe: es la mitad de la razón por la que el cuerpo lleva
       fecha_pago además de cuotas. */
    const Y = abrirPlay();
    const h = Y.ev('tarjetaContrapropuesta(' + JSON.stringify({
      id: 1, estado: 'contrapropuesta',
      contrapropuesta: { capital: 300000, costo: 60000, total: 360000, dias: 15,
                         fecha_pago: '2026-09-30', texto: 'Para empezar', por: 'joan' }
    }) + ')');
    assert.match(h, /Pago único/, 'un pago único dejó de decirse pago único');
    assert.ok(h.indexOf('30 sep 2026') >= 0, 'perdió la fecha del pago único');
  });
});
