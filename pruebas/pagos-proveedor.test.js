'use strict';
/* ==========================================================================
 * EL PROVEEDOR DE PAGOS DE PLATACHAT — 14 de septiembre de 2026
 *
 * Este archivo decide cuánto le cuesta a Joan mover cada peso, y ese gasto
 * sale ANTES de calcular la garantía del cliente. Un peso de más aquí es un
 * peso de menos en el cupo de alguien; un peso de menos es plata que Joan cree
 * ganar y no ganó. Y ninguna de las dos se nota en la pantalla.
 *
 * Por eso las cifras se comparan contra la tabla del anexo A del plan
 * (PLAN-PLATACHAT.md), que un revisor reprodujo con el motor en Node, y no
 * contra lo que este mismo archivo diga de sí.
 *
 * La otra mitad comprueba lo que NO debe pasar: que no haya red, que no haya
 * credenciales, que el cliente no vea un porcentaje, y que TumiPay no finja
 * estar encendido.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../app/pagos-proveedor.js');

/* app/platachat-reglas.js lo escribe otro constructor en paralelo. Si todavía
   no está, las dos pruebas de coherencia se saltan DICIENDO por qué; el día
   que aparezca corren solas, sin tocar este archivo. */
const RUTA_REGLAS = path.join(__dirname, '..', 'app', 'platachat-reglas.js');
let R = null, sinReglas = 'app/platachat-reglas.js todavía no existe (lo escribe el constructor de reglas); esta prueba corre sola cuando aparezca';
if (fs.existsSync(RUTA_REGLAS)) {
  try {
    R = require(RUTA_REGLAS);
    sinReglas = typeof R.gastoTumiPay === 'function' ? false
      : 'app/platachat-reglas.js existe pero aún no expone gastoTumiPay';
  } catch (e) {
    sinReglas = 'app/platachat-reglas.js no carga todavía: ' + e.message;
  }
}

/* El anexo A del plan, tal cual: [capital, tasa, gasto sin IVA, gasto con IVA].
   Son las cifras con las que Joan decidió el reparto; si cambian, cambia la
   decisión, no la prueba. */
const ANEXO_A = [
  [50000, 0.35, 4513, 5370], [100000, 0.35, 5525, 6575], [150000, 0.35, 6538, 7780],
  [200000, 0.35, 7550, 8985], [300000, 0.35, 9575, 11394], [500000, 0.35, 13625, 16214],
  [1000000, 0.35, 23750, 28263],
  [50000, 0.20, 4400, 5236], [100000, 0.20, 5300, 6307], [150000, 0.20, 6200, 7378],
  [200000, 0.20, 7100, 8449], [300000, 0.20, 8900, 10591], [500000, 0.20, 12500, 14875],
  [1000000, 0.20, 21500, 25585]
];
const costoDe = (capital, tasa) => Math.round(capital * tasa);

describe('el proveedor activo y la tabla de proveedores', () => {

  test('PROVEEDOR_ACTIVO es manual: TumiPay se enciende con un commit, no con un flag', () => {
    /* Decisión 2a de Joan. Si esto cambia sin contrato firmado, la garantía de
       cada cliente se calcularía con un gasto que no existe. */
    assert.equal(P.PROVEEDOR_ACTIVO, 'manual');
    assert.equal(P.PROVEEDORES[P.PROVEEDOR_ACTIVO].listo, true);
  });

  test('existen manual y tumipay, con los nombres del contrato', () => {
    assert.equal(P.PROVEEDORES.manual.nombre, 'Nequi / transferencia a mano');
    assert.equal(P.PROVEEDORES.tumipay.nombre, 'TumiPay');
    assert.equal(P.PROVEEDORES.tumipay.listo, false, 'TumiPay no puede nacer «listo» sin contrato');
    assert.ok(P.proveedorValido('manual') && P.proveedorValido('tumipay'));
    assert.ok(!P.proveedorValido('nequi') && !P.proveedorValido('') && !P.proveedorValido(null));
  });
});

describe('tarifas', () => {

  test('manual: todo cero', () => {
    assert.deepEqual(P.tarifas('manual'), { payout_fijo: 0, payin_pct: 0, payin_fijo: 0, iva: 0 });
  });

  test('tumipay: 2.800 por giro, 1,5 % más 700 por recaudo, IVA del 19 % como opción', () => {
    assert.deepEqual(P.tarifas('tumipay'), { payout_fijo: 2800, payin_pct: 0.015, payin_fijo: 700, iva: 0.19 });
  });

  test('devuelve una copia: tocarla no le cambia el precio al siguiente', () => {
    const t = P.tarifas('tumipay');
    t.payout_fijo = 0; t.payin_pct = 0;
    assert.equal(P.tarifas('tumipay').payout_fijo, 2800);
    assert.equal(P.gastoMovimiento('tumipay', 'payout', 100000), 2800);
  });

  test('un proveedor desconocido revienta con nombre y lista, no degrada a gasto cero', () => {
    /* «nequi» mal escrito que devolviera 0 regalaría garantía calculada sobre
       un gasto que sí existió. Mejor que reviente en la prueba. */
    assert.throws(() => P.tarifas('nequi'), /desconocido: «nequi».*manual, tumipay/);
    assert.throws(() => P.gastoMovimiento('wompi', 'payin', 1000), /desconocido/);
    assert.throws(() => P.gastoCredito('', 100000, 20000), /desconocido/);
    assert.throws(() => P.descripcionParaElCliente(undefined), /desconocido/);
  });

  test('la tarifa de TumiPay es la misma que la de PlataChatReglas', { skip: sinReglas }, () => {
    /* Dos tablas con el mismo número en dos archivos: la prueba es lo único
       que las mantiene juntas. */
    assert.deepEqual(P.tarifas('tumipay'), R.TARIFA_TUMIPAY);
  });
});

describe('gastoMovimiento: el gasto de UN movimiento', () => {

  test('tumipay · payout: 2.800 fijos sin IVA, 3.332 con IVA', () => {
    assert.equal(P.gastoMovimiento('tumipay', 'payout', 100000), 2800);
    assert.equal(P.gastoMovimiento('tumipay', 'payout', 1000000), 2800, 'el giro no depende del monto');
    assert.equal(P.gastoMovimiento('tumipay', 'payout', 100000, { conIva: true }), 3332);
  });

  test('tumipay · payin: 1,5 % de lo que trae más 700; con IVA ×1,19 redondeado', () => {
    assert.equal(P.gastoMovimiento('tumipay', 'payin', 135000), 2025 + 700);
    assert.equal(P.gastoMovimiento('tumipay', 'payin', 135000, { conIva: true }), Math.round(2725 * 1.19));
    assert.equal(P.gastoMovimiento('tumipay', 'payin', 60000), 900 + 700);
    /* 202.500 × 0,015 = 3.037,5: Math.round sube, como en el motor y en el anexo. */
    assert.equal(P.gastoMovimiento('tumipay', 'payin', 202500), 3038 + 700);
  });

  test('manual: cero siempre, con o sin IVA, sea payin o payout', () => {
    ['payin', 'payout'].forEach(tipo => {
      [0, 1, 50000, 135000, 5000000].forEach(monto => {
        assert.equal(P.gastoMovimiento('manual', tipo, monto), 0);
        assert.equal(P.gastoMovimiento('manual', tipo, monto, { conIva: true }), 0);
      });
    });
  });

  test('un movimiento de cero pesos no existe y no cuesta; un tipo desconocido revienta', () => {
    assert.equal(P.gastoMovimiento('tumipay', 'payin', 0), 0);
    assert.equal(P.gastoMovimiento('tumipay', 'payout', 0), 0);
    assert.equal(P.gastoMovimiento('tumipay', 'payin', -5000), 0);
    assert.equal(P.gastoMovimiento('tumipay', 'payin', 'no es número'), 0);
    assert.throws(() => P.gastoMovimiento('tumipay', 'transferencia', 1000), /Tipo de movimiento desconocido/);
  });
});

describe('gastoCredito: giro + recaudos de capital y costo', () => {

  test('tumipay reproduce las 28 celdas del anexo A, sin IVA y con IVA', () => {
    ANEXO_A.forEach(([capital, tasa, sinIva, conIva]) => {
      const costo = costoDe(capital, tasa);
      assert.equal(P.gastoCredito('tumipay', capital, costo), sinIva,
        `${capital} al ${tasa} sin IVA`);
      assert.equal(P.gastoCredito('tumipay', capital, costo, { conIva: true }), conIva,
        `${capital} al ${tasa} con IVA`);
    });
  });

  test('manual: cero en toda la tabla, con IVA y con varios recaudos', () => {
    ANEXO_A.forEach(([capital, tasa]) => {
      const costo = costoDe(capital, tasa);
      assert.equal(P.gastoCredito('manual', capital, costo), 0);
      assert.equal(P.gastoCredito('manual', capital, costo, { conIva: true, payins: 3 }), 0);
    });
  });

  test('coherente con PlataChatReglas.gastoTumiPay para payins = 1', { skip: sinReglas }, () => {
    /* El contrato entre constructores: la app pinta con las reglas y el CRM
       con el proveedor; si se separan en un peso, el cliente ve una garantía y
       Joan otra. */
    ANEXO_A.forEach(([capital, tasa]) => {
      const costo = costoDe(capital, tasa);
      assert.equal(P.gastoCredito('tumipay', capital, costo, { payins: 1 }),
        R.gastoTumiPay(capital, costo), `${capital} al ${tasa} sin IVA`);
      assert.equal(P.gastoCredito('tumipay', capital, costo, { payins: 1, conIva: true }),
        R.gastoTumiPay(capital, costo, { conIva: true }), `${capital} al ${tasa} con IVA`);
    });
  });

  test('con varios recaudos cada uno paga su 700 y su 1,5 %; el giro se paga una vez', () => {
    /* Plan §2.3: «una prórroga o un plan de pagos son varios recaudos y cada
       uno paga su 700 + 1,5 %». La trampa que esto cierra: multiplicar el
       1,5 % de TODO lo recaudado por el número de recaudos. */
    const dos = P.gastoCredito('tumipay', 100000, 35000, { payins: 2 });
    assert.equal(dos, 2800 + 2 * (Math.round(0.015 * 67500) + 700));
    assert.ok(dos < 2 * P.gastoCredito('tumipay', 100000, 35000), 'el 1,5 % no se duplica');
    assert.equal(dos - P.gastoCredito('tumipay', 100000, 35000), 700 + 1, 'un recaudo más cuesta 700 más un peso de redondeo');
    const tres = P.gastoCredito('tumipay', 100000, 35000, { payins: 3 });
    assert.equal(tres, 2800 + 3 * (Math.round(0.015 * 45000) + 700));
  });

  test('payins = 0: desembolsado y todavía sin cobrar, solo el giro', () => {
    assert.equal(P.gastoCredito('tumipay', 100000, 35000, { payins: 0 }), 2800);
    assert.equal(P.gastoCredito('tumipay', 100000, 35000, { payins: 0, conIva: true }), 3332);
    /* Sin opciones es un solo recaudo, como en el anexo. */
    assert.equal(P.gastoCredito('tumipay', 100000, 35000), P.gastoCredito('tumipay', 100000, 35000, { payins: 1 }));
    assert.equal(P.gastoCredito('tumipay', 100000, 35000, { payins: -2 }), P.gastoCredito('tumipay', 100000, 35000, { payins: 1 }));
  });

  test('movimiento a movimiento suma lo mismo que el crédito entero (sin IVA), y a un peso con IVA', () => {
    ANEXO_A.forEach(([capital, tasa]) => {
      const costo = costoDe(capital, tasa);
      const porPartes = P.gastoMovimiento('tumipay', 'payout', capital) + P.gastoMovimiento('tumipay', 'payin', capital + costo);
      assert.equal(porPartes, P.gastoCredito('tumipay', capital, costo));
      const conIva = P.gastoMovimiento('tumipay', 'payout', capital, { conIva: true }) +
                     P.gastoMovimiento('tumipay', 'payin', capital + costo, { conIva: true });
      assert.ok(Math.abs(conIva - P.gastoCredito('tumipay', capital, costo, { conIva: true })) <= 1,
        `${capital}: el IVA por movimiento se aleja más de un peso del IVA sobre el total`);
    });
  });
});

describe('desembolsar y recaudar: sin red y sin fingir', () => {
  /* Si alguna rama tocara fetch, esto revienta la promesa y la prueba cae. */
  const conFetchProhibido = async (fn) => {
    const antes = global.fetch;
    global.fetch = () => { throw new Error('no debe llamar fetch'); };
    try { return await fn(); } finally { global.fetch = antes; }
  };

  test('manual: {ok:true, manual:true} con instrucciones en pesos y gasto 0', async () => {
    const d = await conFetchProhibido(() => P.desembolsar('manual', { monto: 100000, destino: 'Nequi 3001234567' }));
    assert.equal(d.ok, true); assert.equal(d.manual, true); assert.equal(d.gasto, 0);
    assert.match(d.instrucciones, /\$100\.000/);
    assert.match(d.instrucciones, /Nequi 3001234567/);
    const r = await conFetchProhibido(() => P.recaudar('manual', { monto: 135000, referencia: 'crédito 7' }));
    assert.equal(r.ok, true); assert.equal(r.manual, true); assert.equal(r.gasto, 0);
    assert.match(r.instrucciones, /\$135\.000/);
    assert.match(r.instrucciones, /comprobante/);
  });

  test('tumipay: {ok:false} con el motivo honesto de la fase 3, sin fetch', async () => {
    const motivo = 'TumiPay no está configurado: falta el contrato y las credenciales (fase 3)';
    const d = await conFetchProhibido(() => P.desembolsar('tumipay', { monto: 100000 }));
    assert.equal(d.ok, false); assert.equal(d.motivo, motivo);
    const r = await conFetchProhibido(() => P.recaudar('tumipay', { monto: 135000 }));
    assert.equal(r.ok, false); assert.equal(r.motivo, motivo);
    assert.equal(P.MOTIVO_TUMIPAY_APAGADO, motivo);
  });

  test('un proveedor desconocido no revienta la promesa: {ok:false} que se pueda pintar', async () => {
    const d = await conFetchProhibido(() => P.desembolsar('wompi', { monto: 1 }));
    assert.equal(d.ok, false); assert.match(d.motivo, /desconocido/);
    const r = await conFetchProhibido(() => P.recaudar(undefined, {}));
    assert.equal(r.ok, false);
  });

  test('las dos devuelven promesas aunque no haya red: la página las espera igual que en la fase 3', () => {
    assert.ok(P.desembolsar('manual', { monto: 1 }) instanceof Promise);
    assert.ok(P.recaudar('tumipay', { monto: 1 }) instanceof Promise);
  });
});

describe('lo que ve el cliente', () => {
  const SIN_PORCENTAJE = /\d\s?%/;

  test('manual: la frase exacta del contrato', () => {
    assert.equal(P.descripcionParaElCliente('manual'),
      'Sin gastos de pago: recibes y pagas por Nequi o transferencia');
  });

  test('tumipay: en pesos, sin un solo porcentaje, y dice que no se cobra aparte', () => {
    const s = P.descripcionParaElCliente('tumipay');
    assert.ok(!SIN_PORCENTAJE.test(s), 'le muestra un porcentaje al cliente: ' + s);
    assert.ok(!/%/.test(s));
    assert.match(s, /\$2\.800/);
    assert.match(s, /\$700/);
    assert.match(s, /\$15 por cada \$1\.000/, 'el 1,5 % se dice en pesos por cada mil');
    assert.match(s, /No se te cobra aparte/);
  });

  test('con capital y costo, le da la cifra de SU crédito', () => {
    const s = P.descripcionParaElCliente('tumipay', { capital: 100000, costo: 35000 });
    assert.match(s, /\$100\.000/); assert.match(s, /\$135\.000/); assert.match(s, /\$5\.525/);
    assert.ok(!/%/.test(s));
    const conIva = P.descripcionParaElCliente('tumipay', { capital: 100000, costo: 35000, conIva: true });
    assert.match(conIva, /\$6\.575/);
    assert.ok(!/%/.test(conIva));
  });

  test('ningún texto que salga de aquí lleva «%»: ni las instrucciones para Joan', async () => {
    const textos = [
      P.descripcionParaElCliente('manual'),
      P.descripcionParaElCliente('tumipay', { conIva: true }),
      (await P.desembolsar('manual', { monto: 250000 })).instrucciones,
      (await P.recaudar('manual', { monto: 250000 })).instrucciones,
      (await P.desembolsar('tumipay', {})).motivo
    ];
    textos.forEach(t => assert.ok(!/%/.test(t), 'lleva porcentaje: ' + t));
  });

  test('pesos: punto de miles sin depender del locale del aparato', () => {
    assert.equal(P.pesos(0), '$0');
    assert.equal(P.pesos(700), '$700');
    assert.equal(P.pesos(5525), '$5.525');
    assert.equal(P.pesos(1000000), '$1.000.000');
    assert.equal(P.pesos(-138), '-$138');
  });
});

describe('el archivo es puro y no guarda secretos', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'pagos-proveedor.js'), 'utf8');
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/mg, ' ');

  test('sin reloj de pared, sin red, sin navegador', () => {
    /* La lección del commit 36209a9 (comisiones.js): lo que lee el reloj no se
       puede auditar. Y lo que hace fetch desde aquí sería mover plata sin
       contrato. */
    assert.ok(!/new Date\(/.test(codigo), 'lee el reloj de pared');
    assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(codigo), 'hace red');
    assert.ok(!/localStorage|sessionStorage|document\.|window\./.test(codigo), 'toca el navegador');
  });

  test('ni credenciales ni URLs de TumiPay: todo lo de app/ es público', () => {
    assert.ok(!/https?:\/\//.test(codigo), 'trae una URL');
    assert.ok(!/api[_-]?key|secret|bearer|token|clientId|client_id/i.test(codigo), 'huele a credencial');
  });

  test('UMD: en un navegador sin `module` queda como window.PagosProveedor', () => {
    /* platachat/index.html lo carga con <script src>; el arnés de
       pruebas/vitrina.test.js lo mete por require. Las dos puertas tienen que
       dar el mismo objeto. */
    const ctx = {};
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fuente, ctx, { filename: 'pagos-proveedor.js' });
    assert.equal(typeof ctx.PagosProveedor, 'object');
    assert.equal(ctx.PagosProveedor.PROVEEDOR_ACTIVO, 'manual');
    assert.equal(ctx.PagosProveedor.gastoCredito('tumipay', 100000, 35000), P.gastoCredito('tumipay', 100000, 35000));
  });

  test('la cabecera explica el porqué: Ley 45/1990, no custodiar, fase 3', () => {
    assert.match(fuente, /Ley 45 de 1990/);
    assert.match(fuente, /art[ií]culo 68/);
    assert.match(fuente, /NUNCA CUSTODIAR FONDOS/);
    assert.match(fuente, /fase 3/i);
  });
});
