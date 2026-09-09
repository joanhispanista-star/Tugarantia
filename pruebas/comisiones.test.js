'use strict';
/* ==========================================================================
 * LAS COMISIONES DE LOS ASESORES — 9 de septiembre de 2026
 *
 * Esta plata sale del margen de Joan y la cobra gente que trabaja para él. Un
 * error acá no es una pantalla fea: es pagarle de más a alguien, o dejar de
 * pagarle lo que ganó. Las dos cosas se descubren tarde y las dos cuestan la
 * relación.
 *
 * Por eso más de la mitad de este archivo comprueba lo que NO debe pasar.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/comisiones.js');

/* Una cartera chiquita y explícita: dos asesores, tres clientes. */
const ANA = 'E-ana', BETO = 'E-beto';
const base = () => ({
  socios: [{ id: 's1', numero: 1, nombre: 'María' }, { id: 's2', numero: 2, nombre: 'Luis' }],
  prestamos: [],
  registros: [],
  asignaciones: [{ socio_id: 's1', asesor_id: ANA, desde: '2026-01-01' },
                 { socio_id: 's2', asesor_id: BETO, desde: '2026-01-01' }],
  hasta: '2026-12-31'
});
const credito = (o) => Object.assign({
  id: 'p1', numero: 1, socioId: 's1', capital: 300000, costoPct: 20,
  fechaDesembolso: '2026-03-01', cicloActual: '2026-03-16', cicloPago: '2026-03-16',
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false
}, o);
const tipos = (m, t) => m.filter(x => x.tipo === t);
const suma = (m, t) => tipos(m, t).reduce((a, x) => a + x.monto, 0);

describe('las cinco reglas que pidió Joan', () => {

  test('el registro paga 5.000, y uno descartado NO paga', () => {
    /* Pagar por traer a alguien que Joan rechazó sería pagar por volumen, no
       por cliente. */
    const d = base();
    d.registros = [{ id: 1, socio_id: 's1', asesor_id: ANA, creado_en: '2026-02-01', estado: 'nuevo' },
                   { id: 2, socio_id: 's2', asesor_id: BETO, creado_en: '2026-02-02', estado: 'descartado' }];
    const m = C.derivarMovimientos(d);
    assert.equal(suma(m, 'registro'), 5000);
    assert.equal(tipos(m, 'registro')[0].asesor_id, ANA);
  });

  test('el desembolso paga 15.000 UNA VEZ POR CLIENTE, no por crédito', () => {
    /* La trampa que esto cierra: si fuera por crédito, el mismo cliente
       re-tomado diez veces pagaría diez bonos de captación. Es lo que separa
       las dos frases de Joan — 15.000 «si el cliente pide el crédito» y 5.000
       «cada vez que pase de nuevo». */
    const d = base();
    d.prestamos = [credito({ id: 'p1' }),
                   credito({ id: 'p2', numero: 2, fechaDesembolso: '2026-06-01' }),
                   credito({ id: 'p3', numero: 3, fechaDesembolso: '2026-09-01' })];
    const m = C.derivarMovimientos(d);
    assert.equal(tipos(m, 'desembolso').length, 1, 'pagó el bono más de una vez por el mismo cliente');
    assert.equal(suma(m, 'desembolso'), 15000);
    assert.equal(tipos(m, 'desembolso')[0].credito_id, 'p1', 'lo cobró por un crédito que no es el primero');
  });

  test('el pago del PRIMER crédito da 10.000; los siguientes dan 5.000 de cobranza', () => {
    const d = base();
    d.prestamos = [credito({ id: 'p1', pagado: true, fechaPagado: '2026-03-16' }),
                   credito({ id: 'p2', numero: 2, fechaDesembolso: '2026-06-01',
                             cicloActual: '2026-06-16', pagado: true, fechaPagado: '2026-06-16' })];
    const m = C.derivarMovimientos(d);
    assert.equal(suma(m, 'pago'), 10000);
    assert.equal(suma(m, 'recurrencia'), 5000);
    assert.equal(tipos(m, 'recurrencia')[0].credito_id, 'p2');
  });

  test('un crédito posterior SIN pagar no da cobranza', () => {
    const d = base();
    d.prestamos = [credito({ id: 'p1', pagado: true, fechaPagado: '2026-03-16' }),
                   credito({ id: 'p2', numero: 2, fechaDesembolso: '2026-06-01', pagado: false })];
    assert.equal(suma(C.derivarMovimientos(d), 'recurrencia'), 0,
      'pagó cobranza por un crédito que el cliente no ha cerrado');
  });

  test('a los 20 días de mora se descuentan 10.000, FECHADOS EL DÍA 20', () => {
    /* No el día en que alguien abrió la pantalla: es una pregunta con fecha
       adentro, y contestarla con el dato de hoy es el defecto que este proyecto
       ya arregló once veces. */
    const d = base();
    d.prestamos = [credito({ cicloActual: '2026-03-16', cicloPago: '2026-03-16' })];
    const m = C.derivarMovimientos(d);
    const c = tipos(m, 'castigo_mora');
    assert.equal(c.length, 1);
    assert.equal(c[0].monto, -10000);
    assert.equal(c[0].fecha, '2026-04-05', 'el castigo tiene que quedar fechado el día 20 del tramo');
  });

  test('el castigo es UNO por crédito, aunque la mora siga meses', () => {
    const d = base();
    d.prestamos = [credito({ cicloActual: '2026-03-16' })];
    assert.equal(tipos(C.derivarMovimientos(d), 'castigo_mora').length, 1);
  });

  test('un crédito pagado ANTES del día 20 no castiga', () => {
    const d = base();
    d.prestamos = [credito({ cicloActual: '2026-03-16', pagado: true, fechaPagado: '2026-03-20' })];
    assert.equal(tipos(C.derivarMovimientos(d), 'castigo_mora').length, 0);
  });
});

describe('lo que NO debe pasar', () => {

  test('UN ABONO DE MIL PESOS EL DÍA 19 NO BORRA EL CASTIGO', () => {
    /* El motor sí cancela el castigo del SOCIO con cualquier abono, hasta de un
       peso (evaluarCastigo). Copiar esa regla acá dejaría que mil pesos el día
       19 borraran diez mil de descuento al asesor. Son dos castigos distintos
       con dos motivos distintos. */
    const d = base();
    d.prestamos = [credito({ cicloActual: '2026-03-16',
      abonosCapital: [{ fecha: '2026-04-04', monto: 1000 }] })];
    const c = tipos(C.derivarMovimientos(d), 'castigo_mora');
    assert.equal(c.length, 1, 'un abono de mil pesos borró el castigo');
    assert.equal(c[0].fecha, '2026-04-05');
  });

  test('PERDONARLE LA MORA AL CLIENTE no le perdona el castigo al asesor', () => {
    /* «Perdonar la plata no puede lavar la historia» — la misma doctrina que ya
       gobierna movimientosConMora en el puente. Si Joan también quiere
       perdonárselo al asesor, eso es otro hecho fechado y con motivo. */
    const d = base();
    d.prestamos = [credito({ cicloActual: '2026-03-16', recargoMora: 0,
      condonaciones: [{ fecha: '2026-04-10', mora: 40000, motivo: 'se le quemó la casa' }] })];
    assert.equal(tipos(C.derivarMovimientos(d), 'castigo_mora').length, 1,
      'la condonación al cliente borró el castigo del asesor');
  });

  test('EL CLIENTE REASIGNADO: el castigo al que vendió, la cobranza al que cobra', () => {
    /* Consecuencia deliberada, y hay que decírsela a Joan: son dos asesores
       distintos sobre el mismo cliente, y así debe ser. El asesor va congelado
       en cada movimiento, no leído de la ficha. */
    const d = base();
    d.asignaciones = [{ socio_id: 's1', asesor_id: ANA, desde: '2026-01-01' },
                      { socio_id: 's1', asesor_id: BETO, desde: '2026-05-01' }];
    d.prestamos = [credito({ id: 'p1', cicloActual: '2026-03-16' }),
                   credito({ id: 'p2', numero: 2, fechaDesembolso: '2026-06-01',
                             cicloActual: '2026-06-16', pagado: true, fechaPagado: '2026-06-16' })];
    const m = C.derivarMovimientos(d);
    assert.equal(tipos(m, 'desembolso')[0].asesor_id, ANA, 'el bono de captación cambió de dueño');
    assert.equal(tipos(m, 'castigo_mora')[0].asesor_id, ANA, 'el castigo le llegó al que no vendió');
    assert.equal(tipos(m, 'recurrencia')[0].asesor_id, BETO, 'la cobranza no le llegó a quien cobró');
  });

  test('DOS CRÉDITOS EL MISMO DÍA: manda el número, no el orden del arreglo', () => {
    /* El orden de DB.prestamos depende de en qué aparato se guardó. */
    const d = base();
    d.prestamos = [credito({ id: 'pB', numero: 2, fechaDesembolso: '2026-03-01', pagado: true, fechaPagado: '2026-04-01' }),
                   credito({ id: 'pA', numero: 1, fechaDesembolso: '2026-03-01', pagado: true, fechaPagado: '2026-04-02' })];
    const m = C.derivarMovimientos(d);
    assert.equal(tipos(m, 'desembolso')[0].credito_id, 'pA', 'eligió el primero por el orden del arreglo');
    assert.equal(tipos(m, 'recurrencia')[0].credito_id, 'pB');
  });

  test('NADA se paga por un hecho posterior a la fecha de corte', () => {
    const d = base();
    d.prestamos = [credito({ pagado: true, fechaPagado: '2026-11-01' })];
    d.hasta = '2026-06-30';
    assert.equal(suma(C.derivarMovimientos(d), 'pago'), 0, 'pagó una comisión que todavía no ha ocurrido');
  });

  test('un cliente sin asesor asignado no genera un solo peso', () => {
    const d = base();
    d.asignaciones = [];
    d.prestamos = [credito({ pagado: true, fechaPagado: '2026-03-16' })];
    d.registros = [{ id: 1, socio_id: 's1', creado_en: '2026-02-01', estado: 'nuevo' }];
    assert.deepEqual(C.derivarMovimientos(d), [], 'le pagó a un asesor que no existe');
  });

  test('el mismo hecho DOS VECES es un solo movimiento', () => {
    /* La identidad es tipo+asesor+socio+crédito+fecha. Sin esto, derivar dos
       veces duplicaría la plata. */
    const d = base();
    d.prestamos = [credito({ pagado: true, fechaPagado: '2026-03-16' })];
    const m = C.derivarMovimientos(d);
    const llaves = m.map(x => C.IDENTIDAD.map(k => x[k]).join('|'));
    assert.equal(new Set(llaves).size, llaves.length, 'hay dos movimientos con la misma identidad');
  });

  test('el MONTO no entra en la identidad de un hecho', () => {
    /* Meter un campo que cambia dentro de la identidad fue lo que duplicó una
       prórroga y produjo ingreso fantasma, cupo regalado y una prórroga quemada
       de más. */
    assert.ok(C.IDENTIDAD.indexOf('monto') === -1, 'el monto volvió a la identidad');
    assert.ok(C.IDENTIDAD.indexOf('motivo') === -1, 'el motivo volvió a la identidad');
  });

  test('la función es PURA: no toca lo que le pasan', () => {
    const d = base();
    d.prestamos = [credito({ pagado: true, fechaPagado: '2026-03-16' })];
    const antes = JSON.stringify(d);
    C.derivarMovimientos(d);
    assert.equal(JSON.stringify(d), antes, 'derivarMovimientos escribió en la cartera');
  });

  test('sin fecha de corte no inventa nada', () => {
    const d = base(); delete d.hasta;
    assert.deepEqual(C.derivarMovimientos(d), []);
  });
});

describe('el saldo: bloqueado, libre y lo que Joan ya pagó', () => {

  const conTodo = () => {
    const d = base();
    d.registros = [{ id: 1, socio_id: 's1', asesor_id: ANA, creado_en: '2026-02-01', estado: 'nuevo' }];
    d.prestamos = [credito({ pagado: true, fechaPagado: '2026-03-16' })];
    return C.derivarMovimientos(d);
  };

  test('los 20.000 nacen BLOQUEADOS y el pago llega libre', () => {
    /* Joan: «esos 20.000 ganados se verán siempre en su usuario pero siguen
       bloqueados hasta que el cliente pague». */
    const s = C.saldoDeAsesor(conTodo(), ANA, '2026-12-31');
    assert.equal(s.bloqueado, 20000);
    assert.equal(s.libre, 10000);
    assert.equal(s.total_ganado, 30000);
  });

  test('el desbloqueo NO se puede sin que el cliente haya pagado', () => {
    const d = base();
    d.registros = [{ id: 1, socio_id: 's1', asesor_id: ANA, creado_en: '2026-02-01', estado: 'nuevo' }];
    d.prestamos = [credito({ pagado: false })];
    const m = C.derivarMovimientos(d);
    const p = C.puedeDesbloquear(m, ANA, 's1');
    assert.equal(p.puede, false);
    assert.equal(p.monto, 20000, 'tiene que decir CUÁNTO hay bloqueado aunque no se pueda');
    assert.match(p.motivo, /todavía no ha pagado/);
  });

  test('con el cliente al día, el desbloqueo pasa los 20.000 a libre', () => {
    const m = conTodo();
    assert.equal(C.puedeDesbloquear(m, ANA, 's1').puede, true);
    m.push({ id: 'd1', fecha: '2026-04-01', asesor_id: ANA, socio_id: 's1', credito_id: null,
             tipo: 'desbloqueo', monto: 0, motivo: 'lo soltó Joan', quien: 'joan' });
    const s = C.saldoDeAsesor(m, ANA, '2026-12-31');
    assert.equal(s.bloqueado, 0);
    assert.equal(s.libre, 30000);
  });

  test('UN CASTIGO NUNCA LE QUITA PLATA QUE YA ESTÁ EN SU BOLSILLO', () => {
    /* Lo que no cabe queda a la vista como deuda, no escondido en un número
       negativo. Qué se hace con eso lo decide Joan, no una fórmula. */
    const m = [
      { id: 'l1', fecha: '2026-03-01', asesor_id: ANA, socio_id: 's1', tipo: 'liquidacion', monto: 0, motivo: '' },
      { id: 'r1', fecha: '2026-03-02', asesor_id: ANA, socio_id: 's1', tipo: 'recurrencia', monto: 5000, motivo: '' },
      { id: 'c1', fecha: '2026-04-05', asesor_id: ANA, socio_id: 's1', tipo: 'castigo_mora', monto: -10000, motivo: '' }
    ];
    const s = C.saldoDeAsesor(m, ANA, '2026-12-31');
    assert.equal(s.libre, 0, 'el saldo libre quedó negativo en vez de dejar la deuda a la vista');
    assert.equal(s.deuda, 5000);
    assert.ok(s.pagado >= 0);
  });

  test('cada movimiento deja escrito cómo quedaba el saldo después', () => {
    /* Es lo que convierte el libro en algo que se puede discutir con el asesor
       línea por línea, en vez de un total que hay que creer. */
    const s = C.saldoDeAsesor(conTodo(), ANA, '2026-12-31');
    s.movimientos.forEach(m => {
      assert.equal(typeof m.bloqueado_despues, 'number');
      assert.equal(typeof m.libre_despues, 'number');
      assert.ok(m.fecha && m.tipo);
    });
    const ult = s.movimientos[s.movimientos.length - 1];
    assert.equal(ult.libre_despues, s.libre, 'el último movimiento no cuadra con el total');
  });

  test('el saldo de uno NO incluye lo de otro', () => {
    const d = base();
    d.registros = [{ id: 1, socio_id: 's1', asesor_id: ANA, creado_en: '2026-02-01', estado: 'nuevo' },
                   { id: 2, socio_id: 's2', asesor_id: BETO, creado_en: '2026-02-02', estado: 'nuevo' }];
    const m = C.derivarMovimientos(d);
    assert.equal(C.saldoDeAsesor(m, ANA, '2026-12-31').total_ganado, 5000);
    assert.equal(C.saldoDeAsesor(m, BETO, '2026-12-31').total_ganado, 5000);
  });
});

describe('la cuenta que decide si el negocio aguanta', () => {

  test('el punto de equilibrio del primer ciclo, en pesos', () => {
    /* El costo de un crédito es un porcentaje del capital; la comisión del
       primer ciclo es una cifra FIJA. Por debajo de este capital, cada cliente
       nuevo que trae un asesor le cuesta plata a Joan. */
    assert.equal(C.primerCicloCuesta(), 30000);
    assert.equal(C.puntoDeEquilibrio(20), 150000);
    assert.equal(C.puntoDeEquilibrio(35), 85715);
  });

  test('el freno de plata se puede encender, y entonces no publica lo que no cabe', () => {
    const d = base();
    d.prestamos = [credito({ capital: 100000, costoPct: 20 })];   // deja 20.000, la comisión pide 30.000
    assert.equal(suma(C.derivarMovimientos(d), 'desembolso'), 15000, 'apagado debe pagar igual');
    d.frenoDePlata = true;
    assert.equal(suma(C.derivarMovimientos(d), 'desembolso'), 0,
      'con el freno encendido no puede publicar una comisión que el crédito no paga');
  });

  test('con el freno encendido, un crédito que sí cubre la comisión pasa', () => {
    const d = base();
    d.prestamos = [credito({ capital: 300000, costoPct: 20 })];   // deja 60.000
    d.frenoDePlata = true;
    assert.equal(suma(C.derivarMovimientos(d), 'desembolso'), 15000);
  });
});

describe('las tarifas y la historia', () => {

  test('cada tarifa rige DESDE una fecha: lo ganado no se reescribe', () => {
    /* Si Joan sube el pago mañana, lo que ya ganaron sus asesores tiene que
       quedarse con el valor del día en que se ganó. */
    C.TARIFAS.forEach(t => assert.match(t.desde, /^\d{4}-\d{2}-\d{2}$/));
    assert.equal(C.tarifaEn('2026-09-09').registro, 5000);
    assert.equal(C.tarifaEn('2030-01-01').registro, 5000, 'una fecha futura tiene que tomar la última vigente');
  });

  test('el archivo no lee el reloj de pared', () => {
    /* La lección del commit 36209a9: una función que mira el reloj contesta
       distinto según el día en que se le pregunte, y no se puede auditar. */
    const fs = require('node:fs'), path = require('node:path');
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'app', 'comisiones.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.ok(!/new Date\(\s*\)/.test(codigo), 'comisiones.js lee el reloj de pared');
    assert.ok(!/localStorage|fetch\(|document\./.test(codigo),
      'comisiones.js dejó de ser puro: tocó el navegador');
  });
});
