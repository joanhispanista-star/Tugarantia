'use strict';
/* ==========================================================================
 * LA MORA VIEJA SE QUEDA
 * 26 de septiembre de 2026
 *
 * El 23-sep Joan decidió el 80/20: de cada peso de COSTO, 80 centavos son
 * garantía del socio, pague cuando pague, y la mora es toda de la empresa.
 *
 * Al terminarlo apareció lo que esa regla hacía por la espalda. La garantía no
 * se guarda: se recalcula desde el historial cada vez. Quitarle la garantía a
 * la mora se la quitaba TAMBIÉN hacia atrás, a todo socio que alguna vez pagó
 * un recargo, el día de publicar y sin que hiciera nada. Y los términos que
 * firmaron (versión del 6-ago) dicen dos cosas que eso rompía:
 *
 *   · «la parte de cada pago que se te vuelve garantía queda fija el día en que
 *     pagas» (punto 7), y
 *   · «un crédito se rige por las reglas que estaban vigentes el día que lo
 *     pediste» (punto 12).
 *
 * Joan decidió, el mismo 26-sep, en dos preguntas: que lo ya ganado se queda,
 * y que la llave sea el día en que se PIDIÓ el crédito. Así:
 *
 *   · crédito pedido antes del 27-sep-2026: su mora suma como siempre (0,375
 *     en el quincenal, 0,10 en el de garantía), la ya pagada y la que pague
 *     hasta terminarlo;
 *   · crédito pedido desde el 27-sep-2026: su mora no suma nada.
 *
 * La regla vive en UNA función (MotorReglas.garantiaDeMoraPagada) y una fecha
 * (FECHA_MORA_SIN_GARANTIA). Estas pruebas vigilan que esa fecha y la de los
 * términos sean la misma, que todas las pantallas le pasen al motor la fecha
 * del crédito —sin ella lo lee como viejo y promete garantía por la mora—, y
 * que los textos que el socio lee digan la regla de hoy.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../app/motor.js');
const P = require('../app/puente.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
/* Solo el código: los comentarios que cuentan el cambio citan las frases
   viejas, y un centinela que lee la prosa se caza a sí mismo. */
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/mg, '');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const enPalabras = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  return d + ' de ' + MESES[m - 1] + ' de ' + a;
};

describe('la fecha es UNA: la del motor y la de los términos', () => {

  test('los términos se publican con la fecha en que empieza la regla', () => {
    const T = leer('legal/terminos.html');
    const m = T.match(/Última actualización: (\d{1,2}) de (\w+) de (\d{4})/);
    assert.ok(m, 'terminos.html perdió su fecha de versión');
    const iso = m[3] + '-' + String(MESES.indexOf(m[2]) + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0');
    assert.equal(iso, M.FECHA_MORA_SIN_GARANTIA,
      'la regla nueva empieza el ' + M.FECHA_MORA_SIN_GARANTIA + ' pero los términos dicen ' + iso +
      '. Si la publicación se corrió, se mueven las dos juntas — y la fecha tiene que ser la del ' +
      'día de publicar o una posterior, o un crédito pedido en el medio cambia de reglas.');
  });

  test('toda frase que nombra la fecha nombra la del motor', () => {
    const fecha = enPalabras(M.FECHA_MORA_SIN_GARANTIA);
    const textos = {
      'app/socio.html': sinComentarios(leer('app/socio.html')),
      'legal/terminos.html': sinComentarios(leer('legal/terminos.html')),
      'reglasResumen': M.reglasResumen().garantia.texto
    };
    Object.keys(textos).forEach(k => {
      assert.ok(textos[k].indexOf(fecha) >= 0,
        k + ' no dice desde cuándo el recargo no suma (' + fecha + '): si la fecha del motor se ' +
        'movió, esta frase se quedó con la vieja');
    });
  });
});

describe('la regla, en el motor', () => {

  test('crédito pedido antes: su mora suma como siempre; pedido desde la fecha: nada', () => {
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-09-26'), 37500);
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-09-27'), 0);
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-10-01'), 0);
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-01-02'), 37500);
    // El de garantía, con su propio factor de mora.
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-09-26', 'respaldado'), 10000);
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-09-27', 'respaldado'), 0);
    // Un ISO más largo y un Date cuentan igual.
    assert.equal(M.garantiaDeMoraPagada(100000, '2026-09-27T08:00:00'), 0);
    assert.equal(M.garantiaDeMoraPagada(100000, new Date(2026, 8, 26)), 37500);
  });

  test('sin fecha se lee como crédito de ANTES, a propósito', () => {
    /* Todo crédito que crean el Panel, el espejo o una solicitud graba su
       fechaDesembolso: sin ella solo puede ser un registro viejo, y quitarle
       la garantía de su mora sería justo lo que Joan decidió no hacer. La
       contracara la vigilan las pruebas de abajo: quien liquide un crédito
       nuevo tiene que pasar la fecha. */
    assert.equal(M.garantiaDeMoraPagada(100000), 37500);
    assert.equal(M.garantiaDeMoraPagada(100000, null), 37500);
    assert.equal(M.garantiaDeMoraPagada(100000, 'basura'), 37500);
  });

  test('el reparto cuadra a los dos lados: lo que no es garantía es de Joan', () => {
    for (const pidio of ['2026-09-26', '2026-09-27']) {
      const r = M.repartirCosto(40000, { mora: 20000, fechaDelCredito: pidio });
      assert.equal(r.total, 60000);
      assert.equal(r.garantia_socio + r.amortiza_cupon + r.operativo, r.total, pidio);
      assert.equal(r.garantia_mora, pidio === '2026-09-26' ? 7500 : 0);
      assert.equal(r.garantia_socio, 32000 + r.garantia_mora);
    }
  });

  test('las liquidaciones leen la fecha del crédito, no la del pago', () => {
    const credito = pidio => ({ capital: 300000, costo: 60000, fecha_corte: '2026-10-15', fecha_desembolso: pidio });
    // Mismo pago, el 25 de octubre, 10 días tarde: solo cambia cuándo se pidió.
    assert.equal(M.liquidarCredito(credito('2026-09-20'), '2026-10-25').garantia_generada, 48000 + 11250);
    assert.equal(M.liquidarCredito(credito('2026-10-01'), '2026-10-25').garantia_generada, 48000);
    const pr = pidio => M.liquidarProrroga(Object.assign(credito(pidio),
      { tasa_aplicada: 0.20, estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'bronce' }), '2026-10-25');
    assert.equal(pr('2026-09-20').garantia_generada, 48000 + 11250);
    assert.equal(pr('2026-10-01').garantia_generada, 48000);
    const cuota = { capital: 54000, costo: 16200, fecha_corte: '2026-10-31' };
    assert.equal(M.liquidarCuotaRespaldada(cuota, '2026-11-10', { fechaDelCredito: '2026-09-01' })
      .garantia_generada, 1620 + 702);
    assert.equal(M.liquidarCuotaRespaldada(cuota, '2026-11-10', { fechaDelCredito: '2026-10-01' })
      .garantia_generada, 1620);
  });
});

describe('la regla, en el puente: lo que el socio ya tenía no se mueve', () => {

  const credito = (pidio, extra) => Object.assign({
    id: 'c', numero: 1, socioId: 's1', capital: 200000, costoPct: 20,
    fechaDesembolso: pidio, cicloActual: '2026-10-31', pagado: false,
    prorrogas: [{ fecha: '2026-10-05', ciclo: '2026-09-30', monto: 40000 + 10000, mora: 10000, aTiempo: false }],
    abonosCapital: [], comprobantes: []
  }, extra || {});

  test('una prórroga de octubre sobre un crédito de septiembre todavía suma su mora (punto 12)', () => {
    assert.equal(P.garantiaGanadaCredito(credito('2026-09-15')), 32000 + 3750);
    assert.equal(P.garantiaGanadaCredito(credito('2026-10-01', { cicloActual: '2026-11-15' })), 32000);
  });

  test('el crédito viejo sin fecha de desembolso se lee como viejo', () => {
    const sinFecha = credito(undefined);
    delete sinFecha.fechaDesembolso;
    assert.equal(P.fechaDelCredito(sinFecha), null);
    assert.equal(P.garantiaGanadaCredito(sinFecha), 32000 + 3750);
  });

  test('los tableros de Joan cuentan la misma garantía que el socio recibe', () => {
    /* amortizarCupon reparte los movimientos; garantiaGanadaDe es lo que se le
       acredita al socio. Si la mora vieja entrara en uno y no en el otro, Joan
       vería como suya plata que es cupo del socio, o al revés. */
    for (const pidio of ['2026-08-01', '2026-10-01']) {
      const p = credito(pidio, { pagado: true, fechaPagado: '2026-11-10', cicloPago: '2026-10-31',
        gananciaPago: 40000 + 20000, recargoMora: 20000, cobroRegistrado: true });
      const s = { id: 's1', nombre: 'Ana', gestiones: [], ajusteGarantia: 0 };
      const db = { socios: [s], prestamos: [p], respaldados: [], config: {}, contadores: {} };
      assert.equal(P.contabilidadCupon(db, s).garantia_socio, P.garantiaGanadaDe(db, s), 'pedido ' + pidio);
    }
  });
});

describe('toda pantalla le pasa al motor la fecha del crédito', () => {

  const CRM = leer('panel/crm.html');
  const ESPEJO = leer('panel/espejo.html');
  const SOCIO = leer('app/socio.html');
  const cuerpo = (fuente, nombre) => {
    const i = fuente.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'ya no existe ' + nombre);
    const j = fuente.indexOf('\nfunction ', i + 1);
    return sinComentarios(fuente.slice(i, j < 0 ? fuente.length : j));
  };

  test('creditoMotor, en el Panel y en el espejo', () => {
    assert.match(cuerpo(CRM, 'creditoMotor'), /fecha_desembolso:PUENTE\.fechaDelCredito\(p\)/,
      'sin la fecha, el motor lee el crédito como viejo y el confirm de la prórroga promete garantía por la mora');
    assert.match(cuerpo(ESPEJO, 'creditoMotor'), /fecha_desembolso: P\.fechaDelCredito\(p\)/);
  });

  test('el recuadro del reparto y la cuota del préstamo con garantía', () => {
    const llamadas = (sinComentarios(CRM).match(/[^\n]*bloqueReparto\(s,[^\n]*/g) || [])
      .filter(l => !/function bloqueReparto/.test(l));
    assert.equal(llamadas.length, 2, 'cambió cuántas veces se pinta el reparto: revisar cada una');
    llamadas.forEach(l => assert.match(l, /PUENTE\.fechaDelCredito\(/, 'bloqueReparto sin la fecha del crédito: ' + l));
    assert.match(cuerpo(CRM, 'bloqueReparto'), /fechaDelCredito\}\)/);
    assert.match(cuerpo(CRM, 'liqCuota'), /fechaDelCredito:PUENTE\.fechaDelCredito\(r\)/);
  });

  test('la app del socio liquida con la fecha del crédito en las tres rutas', () => {
    const f = cuerpo(SOCIO, 'liquidacion');
    assert.match(f, /fecha_desembolso: \(c && c\.desembolso\) \|\| null/);
    assert.equal((f.match(/M\.garantiaDeMoraPagada\([^,]+, \(c && c\.desembolso\) \|\| null\)/g) || []).length, 2);
  });

  test('y el paquete del socio trae la fecha del crédito', () => {
    const s = { id: 's1', nombre: 'Ana', cedula: '1', telefono: '3001112222', gestiones: [], ajusteGarantia: 0 };
    const db = P.normalizar({ socios: [s], prestamos: [{ id: 'c', numero: 1, socioId: 's1', capital: 200000,
      costoPct: 20, fechaDesembolso: '2026-10-01', cicloActual: '2026-10-15', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [] }] });
    const m = P.migrarSocio(db, db.socios[0]);
    assert.equal(m.creditos[0].desembolso, '2026-10-01');
  });
});

describe('lo que el socio lee dice la regla de hoy', () => {

  test('ni la web, ni los términos, ni la app dicen tres cuartas partes ni la mitad por tarde', () => {
    const viejas = [/tres cuartas partes/, /la mitad de eso si\s+(?:pagas|venía|pagaste)\s+tarde/,
      /el doble\s+que pagando tarde/, /suma el doble que pagar tarde/, /suma a la mitad/,
      /el doble de lo que sube pagando tarde/];
    ['index.html', 'legal/terminos.html', 'app/socio.html'].forEach(f => {
      const t = sinComentarios(leer(f));
      viejas.forEach(re => assert.ok(!re.test(t), f + ' le sigue diciendo al socio ' + re));
    });
  });

  test('LA ESCALERA DE LA WEB ES LA DEL MOTOR, peso a peso', () => {
    /* Estuvo tres días mostrando la del 75% mientras motor.test.js ya tenía la
       del 80%: nada comparaba la tabla con el motor. Ahora sí. */
    const W = leer('index.html');
    const filas = [...W.matchAll(/<tr><td>(\d)º<\/td><td>\$([\d.]+)<\/td><td class="col-extra">\$([\d.]+)<\/td><td>\+\$([\d.]+)<\/td><td class="gan">\$([\d.]+)<\/td><\/tr>/g)]
      .map(m => m.slice(2).map(x => Number(x.replace(/\./g, ''))));
    assert.equal(filas.length, 5, 'la tabla de la escalera cambió de forma');
    const p = M.proyectarCrecimiento(100000, 100000, 5, 'bronce', { pideElCupo: true });
    filas.forEach((f, i) => assert.deepEqual(f, [p[i].capital, p[i].costo, p[i].garantia_ganada, p[i].garantia],
      'fila ' + (i + 1) + ' de la escalera de index.html'));
    // Y las cifras que la web repite abajo salen de la misma última fila.
    const total = p[4].garantia, ganada = total - 100000;
    const cop = n => '$' + n.toLocaleString('es-CO');
    assert.ok(W.indexOf('De esos ' + cop(total)) >= 0, 'el párrafo de abajo no repite el total de la escalera');
    assert.ok(W.indexOf(cop(ganada) + ' que te ganaste tú') >= 0);
    assert.ok(W.indexOf('<dd>+' + cop(M.acumularGarantia(20000)) + '</dd>') >= 0,
      'la tarjeta del quincenal: lo que sube la garantía pidiendo 100.000');
  });

  test('EL CABLE TRAMPA: si los dos factores se separan, estas frases mienten', () => {
    /* «Suma lo mismo si pagas en la fecha o después» (motor), «lo pagues en la
       fecha o después» (index.html), «lo hayas pagado en fecha o tarde»
       (términos), y las pantallas de socio.html que ya no ramifican por
       puntualidad. Todas son verdad SOLO mientras FACTOR_GARANTIA_MORA ===
       FACTOR_GARANTIA. Si un día se separan otra vez, esta prueba falla y dice
       dónde hay que reescribir — que es lo que no pasó el 23-sep. */
    assert.equal(M.FACTOR_GARANTIA_MORA, M.FACTOR_GARANTIA,
      'los factores se separaron: reescribir index.html («Lo que te construyes», «Pagas y creces»), ' +
      'legal/terminos.html (puntos 5, 7 y 8) y socio.html (tarjetaActivo, armarICS, verReglas) ' +
      'antes de publicar');
  });
});
