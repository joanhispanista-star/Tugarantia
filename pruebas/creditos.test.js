/* ============================================================================
 * Pruebas del catálogo publicable — app/creditos.js
 *
 *   cd pruebas && node --test creditos.test.js
 *
 * Estas pruebas cuidan una raya que no es de estilo ni de producto: pasarse del
 * techo de usura en Colombia es el artículo 305 del Código Penal, 32 a 90 meses
 * de prisión. Por eso acá se BARRE en vez de muestrear, y por eso cada arnés se
 * comprueba a sí mismo antes de confiar en él: una prueba de seguridad que pasa
 * porque no está midiendo nada es peor que no tenerla.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../app/creditos.js');

/* ==========================================================================
 * EL TECHO
 * ======================================================================== */

describe('el techo de usura vive en una tabla con fecha', () => {

  test('devuelve el techo del mes que se pregunta', () => {
    assert.equal(C.topeVigente('2026-08-11').consumo_ordinario, 0.2966);
    assert.equal(C.topeVigente('2026-08-01').consumo_ordinario, 0.2966);
    assert.equal(C.topeVigente('2026-08-31').consumo_ordinario, 0.2966);
    assert.equal(C.topeVigente('2026-07-15').consumo_ordinario, 0.2879);
  });

  test('el techo SE MUEVE, y por eso es tabla y no constante', () => {
    /* Julio 28,79% · agosto 29,66%. Casi un punto en un mes, y baja igual de
       fácil. Un producto puesto exacto en el techo de agosto queda ilegal el
       primer mes que baje, sin que nadie toque una línea de código. */
    const jul = C.topeVigente('2026-07-15').consumo_ordinario;
    const ago = C.topeVigente('2026-08-15').consumo_ordinario;
    assert.notEqual(jul, ago, 'si fueran iguales, esta prueba no estaría probando nada');
  });

  test('cada techo es el IBC por uno y medio, que es la definición legal', () => {
    C.TOPES.forEach(t => {
      assert.ok(Math.abs(t.consumo_ordinario - t.ibc * 1.5) < 0.0002,
        t.desde + ': ' + t.consumo_ordinario + ' no es 1,5 × ' + t.ibc);
    });
  });

  test('FUERA DE LO CERTIFICADO NO INVENTA: devuelve null', () => {
    /* Lo más importante de la tabla. Heredar el mes anterior significaría que el
       día que nadie la actualice, el sistema cotiza contra un techo que ya no
       existe y nadie se entera. */
    /* 1-sep-2026: septiembre ya se certificó (Res. 1260), así que el ejemplo
       de «mes futuro sin fila» pasa a octubre. Esta prueba se corre el día 1
       de cada mes, con la certificación nueva en la mano. */
    assert.ok(C.topeVigente('2026-09-15'), 'septiembre SÍ está certificado');
    assert.equal(C.topeVigente('2026-10-01'), null, 'octubre todavía no');
    assert.equal(C.topeVigente('2026-06-30'), null, 'junio tampoco');
    assert.equal(C.topeVigente('2027-01-15'), null);
  });

  test('los tramos no se pisan ni dejan huecos', () => {
    const ordenados = [...C.TOPES].sort((a, b) => a.desde.localeCompare(b.desde));
    assert.deepEqual(C.TOPES.map(t => t.desde), ordenados.map(t => t.desde),
      'la tabla tiene que estar en orden: se lee de arriba a abajo');
    for (let i = 1; i < ordenados.length; i++) {
      assert.ok(ordenados[i].desde > ordenados[i - 1].hasta,
        'se pisan ' + ordenados[i - 1].hasta + ' y ' + ordenados[i].desde);
    }
  });

  test('NO trae el techo de bajo monto, y eso es a propósito', () => {
    /* 65,46% es el techo del crédito de consumo de bajo monto, y el Decreto 1348
       de 2016 lo reserva a entidades vigiladas por la Superfinanciera. Tu
       Garantía no lo es. Tenerlo escrito acá sería dejar cargada la posibilidad
       de usarlo por equivocación. */
    C.TOPES.forEach(t => {
      assert.equal(t.bajo_monto, undefined);
      assert.ok(t.consumo_ordinario < 0.40,
        'apareció un techo de ' + (t.consumo_ordinario * 100).toFixed(2) + '%: ' +
        'ese no es consumo ordinario, y ningún otro régimen le aplica a Joan');
    });
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'creditos.js'), 'utf8');
    assert.ok(!/0\.6546|65,46/.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '')),
      'el 65,46% aparece en el código, no solo en el comentario que explica por qué no se usa');
  });

  test('rechaza una fecha que no es fecha', () => {
    assert.throws(() => C.topeVigente('11/08/2026'), /AAAA-MM-DD/);
    assert.throws(() => C.topeVigente(null), /AAAA-MM-DD/);
    assert.throws(() => C.topeVigente('2026-8-1'), /AAAA-MM-DD/);
  });
});

/* ==========================================================================
 * LA TASA
 * ======================================================================== */

describe('la tasa se mide con TIR, no con la fórmula del pago único', () => {

  test('el arnés: 100 que devuelven 110 en un mes son 10% mensual', () => {
    assert.ok(Math.abs(C.tirMensual([100, -110]) - 0.10) < 1e-9);
  });

  test('un pago único coincide con la fórmula cerrada', () => {
    /* Donde las dos cuentas SÍ tienen que dar lo mismo, dan lo mismo. Si no,
       una de las dos está mal y no sabríamos cuál. */
    const flujo = [1000, 0, 0, -1200];             // 20% a tres meses, todo al final
    const esperado = Math.pow(1.2, 1 / 3) - 1;
    assert.ok(Math.abs(C.tirMensual(flujo) - esperado) < 1e-9);
  });

  test('EN CUOTAS la tasa es mucho mayor, que es todo el punto', () => {
    /* El préstamo con garantía de hoy: 5% mensual plano a 6 meses = 30% de
       costo. La fórmula del Panel dice 70,2%; la real es 153,3%. Un producto
       diseñado con la fórmula vieja creería estar en 29% estando en 56%. */
    const enCuotas = C.eaDeCosto(6, 0.30);
    const formulaVieja = Math.pow(1.30, 365 / 180) - 1;
    assert.ok(enCuotas > formulaVieja * 2,
      'en cuotas ' + (enCuotas * 100).toFixed(1) + '% contra ' + (formulaVieja * 100).toFixed(1) + '%');
    assert.ok(Math.abs(enCuotas - 1.533) < 0.01, 'la cifra medida era 153,3%');
  });

  test('con el MISMO costo plano, más plazo sale más barato al año', () => {
    /* Escribí esta prueba al revés la primera vez y ella me corrigió, así que
       vale la pena dejar por qué: un 10% plano es 10% SE PAGUE CUANDO SE PAGUE.
       Repartido en 3 meses, ese 10% se cobra sobre plata que solo estuvo afuera
       dos meses en promedio; repartido en 6, sobre plata que estuvo tres y
       medio. El mismo peso de costo por más tiempo de uso es una tasa ANUAL más
       baja. Medido: 3 meses 78% · 6 meses 41%.

       De ahí sale algo que parece contradictorio y no lo es: bajo el mismo techo
       de usura, a 6 meses CABE más costo (7,08%) que a 3 meses (4,01%). Es lo
       que hace que la decisión de Joan del 11-ago —6 meses en vez de 3— le
       rinda 77% más por crédito sin acercarse un milímetro al techo. */
    let previa = Infinity;
    for (const n of [3, 4, 5, 6, 9, 12]) {
      const ea = C.eaDeCosto(n, 0.10);
      assert.ok(ea < previa, n + ' meses da ' + ea + ', más que ' + previa);
      previa = ea;
    }
    /* Y la consecuencia, medida y no supuesta. */
    assert.ok(C.costoQueCabe(6, 0.2966) > C.costoQueCabe(3, 0.2966),
      'a 6 meses tiene que caber más costo que a 3 bajo el mismo techo');
  });

  test('rechaza un flujo que no es flujo', () => {
    assert.throws(() => C.tirMensual([100]), /al menos dos/);
    assert.throws(() => C.tirMensual('hola'), /arreglo/);
    assert.throws(() => C.tirMensual([100, 'x']), /no es un número/);
  });
});

/* ==========================================================================
 * LA PRUEBA QUE PIDIÓ JOAN
 * ======================================================================== */

describe('NINGÚN producto del catálogo se pasa del techo — barrido', () => {

  /* El criterio de aceptación, escrito por él: "que exista una prueba automática
     que falle si alguien crea un producto por encima del tope de usura del
     régimen que le corresponde". Esta es. */

  const FECHAS = [];
  C.TOPES.forEach(t => {
    FECHAS.push(t.desde, t.hasta);
    FECHAS.push(t.desde.slice(0, 8) + '15');
  });
  const MONTOS = [50000, 100000, 137500, 250000, 500000, 999999, 1000000, 1500000, 2000000];

  test('barrido completo: perfiles × montos × fechas certificadas', () => {
    let medidos = 0;
    const peores = [];
    C.ORDEN_PERFILES.forEach(idPerfil => {
      MONTOS.forEach(capital => {
        FECHAS.forEach(fecha => {
          const s = C.simular({ perfil: idPerfil, capital, fecha_desembolso: fecha });
          const cot = s.puede ? s : s.cotizacion;
          if (!cot) return;                       // sin techo certificado: no cotiza, correcto
          medidos++;
          const techo = C.topeVigente(fecha).consumo_ordinario;
          if (cot.efectivo_anual > techo) {
            peores.push(idPerfil + ' ' + capital + ' ' + fecha + ': ' +
              (cot.efectivo_anual * 100).toFixed(4) + '% > ' + (techo * 100).toFixed(2) + '%');
          }
        });
      });
    });
    assert.ok(medidos >= 60, 'solo se midieron ' + medidos + ' combinaciones: el barrido no está barriendo');
    assert.deepEqual(peores, [], 'productos por encima del techo:\n  ' + peores.join('\n  '));
  });

  test('cobra la TASA FIJA, no lo que diga el techo del mes', () => {
    /* 27-ago-2026: el precio dejó de ir pegado al techo (era el 90% de él) y
       pasó a ser fijo. Dos razones: el cliente que simulaba el 30 y venía el 2
       veía otra cuota sin que nadie hubiera decidido nada, y el día 1 de cada
       mes la app se quedaba muda esperando la certificación nueva.
       El techo ya no fija el precio: solo puede prohibir. */
    C.ORDEN_PERFILES.forEach(idPerfil => {
      const s = C.simular({ perfil: idPerfil, capital: 500000, fecha_desembolso: '2026-08-15' });
      const cot = s.puede ? s : s.cotizacion;
      assert.ok(Math.abs(cot.efectivo_anual - C.TASA_FIJA_EA) < 0.005,
        idPerfil + ' quedó en ' + (cot.efectivo_anual * 100).toFixed(2) + '% y la tasa fija ' +
        'es ' + (C.TASA_FIJA_EA * 100).toFixed(2) + '%: el precio dejó de ser fijo');
      const techo = C.topeVigente('2026-08-15').consumo_ordinario;
      assert.ok(cot.efectivo_anual < techo,
        idPerfil + ' quedó POR ENCIMA del techo de usura: eso es el artículo 305');
    });
  });

  test('SIN certificación del mes, la app SIGUE cotizando', () => {
    /* Era el defecto que se arregló: sin la fila del mes en TOPES, simular()
       devolvía {puede:false} y la calculadora pública se quedaba en blanco el
       día 1. Con tasa fija eso ya no tiene que pasar — el precio no sale del
       techo, así que no depende de que la tabla esté al día. */
    const futuro = '2027-06-15';   // deliberadamente fuera de la tabla
    assert.equal(C.topeVigente(futuro), null, 'la fecha de prueba dejó de estar fuera de la tabla');
    const s = C.simular({ perfil: 'nuevo', capital: 500000, fecha_desembolso: futuro });
    const cot = s.puede ? s : s.cotizacion;
    assert.ok(cot && cot.cuota_tipica > 0,
      'sin techo certificado la app volvió a quedarse muda: revisa que cotizar() no exija tope');
    assert.equal(cot.techo_del_mes, null, 'sin certificación el techo tiene que venir null, no inventado');
    assert.ok(Math.abs(cot.efectivo_anual - C.TASA_FIJA_EA) < 0.005, 'cobró algo distinto de la tasa fija');
  });

  test('EL GUARDIÁN: si el techo bajara de la tasa fija, se NIEGA a cotizar', () => {
    /* La contrapartida de tener tasa fija. Joan eligió 24% sabiendo que en
       enero de 2026 el techo estuvo en 24,36% — a 0,36 puntos. Si vuelve a
       bajar así, esto tiene que frenar el préstamo, no seguir cotizando. */
    const tope = C.topeVigente('2026-08-15');
    assert.ok(C.TASA_FIJA_EA < tope.consumo_ordinario,
      'LA TASA FIJA (' + (C.TASA_FIJA_EA * 100).toFixed(2) + '%) YA NO CABE BAJO EL TECHO (' +
      (tope.consumo_ordinario * 100).toFixed(2) + '%). Hay que BAJAR TASA_FIJA_EA en ' +
      'app/creditos.js: cobrar por encima del techo es delito.');
    /* Y que el aviso exista en el código, para el día que haga falta. */
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'creditos.js'), 'utf8');
    assert.ok(fuente.indexOf('tasa_sobre_techo') >= 0,
      'se borró el guardián que niega la cotización cuando el techo baja de la tasa fija');
  });

  test('EL ARNÉS: un producto caro de a mentiras SÍ se caza', () => {
    /* Desconfiar del medidor antes que de la página. Si el barrido de arriba
       tuviera la comparación al revés, o midiera cero combinaciones, pasaría en
       verde para siempre y nadie se enteraría hasta el juzgado. */
    const techo = C.topeVigente('2026-08-15').consumo_ordinario;
    assert.ok(C.eaDeCosto(6, 0.30) > techo, 'el 5% mensual de hoy TIENE que salir por encima');
    assert.ok(C.eaDeCosto(6, 0.1367) > techo, 'el 13,67% que se propuso el 10-ago también');
    assert.ok(C.eaDeCosto(3, 0.1322) > techo, 'y el 13,22% a 3 meses, que era el peor');
    assert.ok(C.eaDeCosto(6, 0.0708) <= techo, 'y el que sí cabe, cabe');
  });

  test('el costo que se cobra es el que cabe: ni un decimal por encima', () => {
    /* costoQueCabe redondea hacia abajo a propósito. Hacia arriba sería pasarse
       del techo por un decimal, y del techo no se pasa ni por un decimal. */
    for (const n of [3, 6, 12]) {
      const c = C.costoQueCabe(n, 0.2966);
      assert.ok(C.eaDeCosto(n, c) <= 0.2966, n + ' meses: ' + c + ' se pasa');
      assert.ok(C.eaDeCosto(n, c + 0.0002) > 0.2966,
        n + ' meses: ' + c + ' deja plata sobre la mesa, cabía más');
    }
  });
});

/* ==========================================================================
 * EL PLAZO — la regla de Google, que es de plazo y no de precio
 * ======================================================================== */

describe('ningún producto puede durar menos de 90 días', () => {

  test('simular se NIEGA con un plazo corto, por barato que sea', () => {
    [1, 2].forEach(meses => {
      assert.throws(
        () => C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: '2026-08-15', meses }),
        /mínimo publicable/,
        meses + ' mes(es) tendría que reventar');
    });
  });

  test('la regla vive en el motor, no en una pantalla', () => {
    /* Si estuviera en la interfaz, bastaría llamar a simular desde otro sitio
       para saltársela — y "otro sitio" va a existir: el panel, el registro, la
       migración. */
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'creditos.js'), 'utf8');
    const i = fuente.indexOf('function simular(');
    const cuerpo = fuente.slice(i, fuente.indexOf('\n  }', i));
    assert.match(cuerpo, /PLAZO_MINIMO_DIAS/);
  });

  test('el plazo de fábrica son 6 meses, la decisión de Joan del 11-ago', () => {
    assert.equal(C.PLAZO_MESES, 6);
    assert.equal(C.PLAZO_MINIMO_DIAS, 90);
    const s = C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: '2026-08-15' });
    assert.equal(s.cuotas.length, 6);
  });
});

/* ==========================================================================
 * LA COTIZACIÓN
 * ======================================================================== */

describe('la cotización cuadra peso a peso', () => {

  const s = () => C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: '2026-08-15' });

  test('las cuotas suman EXACTAMENTE el total', () => {
    /* Un peso de diferencia entre "total a pagar" y la suma de las cuotas es una
       discusión con un cliente delante. */
    for (const capital of [50000, 137500, 333333, 500000, 999999, 2000000]) {
      const c = C.simular({ perfil: 'preferente', capital, fecha_desembolso: '2026-08-15' });
      const suma = c.cuotas.reduce((t, q) => t + q.total, 0);
      assert.equal(suma, c.total_a_pagar, capital + ': las cuotas suman ' + suma);
      assert.equal(c.total_a_pagar, c.capital + c.costo_total);
    }
  });

  test('NO hay ningún cargo aparte, y la suma lo demuestra', () => {
    /* Ley 45 de 1990, artículo 68: cualquier cobro sin contraprestación distinta
       del crédito es interés. Un campo de "administración" acá no bajaría la
       tasa: la subiría y la escondería. */
    const c = s();
    assert.equal(c.total_a_pagar - c.capital, c.costo_total);
    const claves = Object.keys(c).join(' ');
    ['administracion', 'plataforma', 'seguro', 'estudio', 'cargo', 'comision']
      .forEach(p => assert.ok(claves.toLowerCase().indexOf(p) === -1,
        'apareció un campo «' + p + '» en la cotización'));
  });

  test('las fechas de las cuotas son mensuales y no caen en el vacío', () => {
    const c = s();
    assert.equal(c.cuotas[0].fecha, '2026-09-15');
    assert.equal(c.cuotas[5].fecha, '2027-02-15');
    c.cuotas.forEach(q => assert.match(q.fecha, /^\d{4}-\d{2}-\d{2}$/));
  });

  test('el 31 de enero más un mes es fin de febrero, no el 3 de marzo', () => {
    assert.equal(C.sumarMeses('2026-01-31', 1), '2026-02-28');
    assert.equal(C.sumarMeses('2028-01-31', 1), '2028-02-29', '2028 es bisiesto');
    assert.equal(C.sumarMeses('2026-08-31', 1), '2026-09-30');
    assert.equal(C.sumarMeses('2026-12-15', 1), '2027-01-15', 'cruza el año');
  });

  test('trae lo que hay que publicar en la ficha de Play', () => {
    /* Google exige plazo mínimo y máximo, la TAE máxima, y un ejemplo del costo
       total. Todo tiene que salir de acá y no escribirse a mano en tres sitios. */
    const c = s();
    ['efectivo_anual', 'costo_total', 'total_a_pagar', 'cuota_tipica', 'meses',
     'techo_del_mes', 'certificacion', 'dias_minimos'].forEach(k =>
      assert.ok(c[k] !== undefined, 'falta ' + k + ' en la cotización'));
  });

  test('sin techo certificado SIGUE cotizando, con la tasa fija', () => {
    /* 27-ago-2026 — ESTA PRUEBA SE INVIRTIÓ A SABIENDAS. Antes exigía que sin
       certificación la app se negara a cotizar, y era lo correcto MIENTRAS el
       precio salía del techo: cotizar contra un techo que ya no existe es el
       artículo 305 esperando. Desde que la tasa es FIJA, el techo no fija el
       precio —solo puede prohibirlo—, así que no saber el techo del mes no
       impide cobrar una tasa que se decidió por debajo de cualquiera.

       Lo que protege ahora es el guardián: si HAY techo y la tasa fija no cabe
       debajo, se niega (motivo 'tasa_sobre_techo'). Eso se prueba aparte. */
    const r = C.simular({ perfil: 'preferente', capital: 500000, fecha_desembolso: '2027-09-15' });
    const c = r.puede ? r : r.cotizacion;
    assert.ok(c && c.cuota_tipica > 0, 'sin techo certificado volvió a quedarse muda');
    assert.equal(c.techo_del_mes, null, 'el techo desconocido tiene que viajar null, no inventado');
  });
});

/* ==========================================================================
 * LOS PERFILES
 * ======================================================================== */

describe('el perfil decide cuánto y qué tan rápido, no cuánto cuesta', () => {

  test('los tres perfiles cobran lo mismo', () => {
    /* Con un solo techo disponible, cobrarle más al que menos historia tiene es
       cobrarle más al que menos puede pagarlo. Lo que gana el que construye
       historial es cupo y aprobación inmediata. */
    const costos = C.ORDEN_PERFILES.map(p => {
      const s = C.simular({ perfil: p, capital: 500000, fecha_desembolso: '2026-08-15' });
      return (s.puede ? s : s.cotizacion).costo_plano;
    });
    assert.equal(new Set(costos).size, 1, 'los perfiles cobran distinto: ' + costos.join(' / '));
  });

  test('los cupos son los que pidió Joan', () => {
    assert.equal(C.PERFILES.preferente.cupo_maximo, 2000000);
    assert.equal(C.PERFILES.recurrente.cupo_maximo, 1000000);
    assert.equal(C.PERFILES.nuevo.cupo_maximo, 0);
  });

  test('el socio NUEVO ve el costo real pero no puede desembolsar solo', () => {
    /* Las dos mitades de lo que pidió: que vea el catálogo con el costo real
       desde el primer momento, y que su solicitud pase por él. */
    const r = C.simular({ perfil: 'nuevo', capital: 500000, fecha_desembolso: '2026-08-15' });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_cupo');
    assert.ok(r.cotizacion, 'tiene que ver el costo aunque no tenga cupo');
    assert.equal(r.cotizacion.total_a_pagar, r.cotizacion.capital + r.cotizacion.costo_total);
    assert.equal(C.PERFILES.nuevo.aprobacion, 'manual');
  });

  test('pasarse del cupo no cotiza a escondidas: lo dice', () => {
    const r = C.simular({ perfil: 'recurrente', capital: 1500000, fecha_desembolso: '2026-08-15' });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sobre_cupo');
    assert.equal(r.cupo_maximo, 1000000);
  });

  test('un perfil inventado revienta acá y no dos pantallas más allá', () => {
    assert.throws(() => C.simular({ perfil: 'diamante', capital: 500000, fecha_desembolso: '2026-08-15' }),
      /perfil desconocido/);
    assert.throws(() => C.normalizarPerfil(null), /perfil desconocido/);
    assert.equal(C.perfilValido('preferente'), true);
    assert.equal(C.perfilValido('platino'), false);
  });
});

/* ==========================================================================
 * LA MIGRACIÓN
 * ======================================================================== */

describe('la migración sugiere el perfil, no lo asigna', () => {

  test('propone según el historial, con el motivo escrito', () => {
    assert.equal(C.perfilSugerido({ pagados_a_tiempo: 7, creditos_total: 7 }).perfil, 'preferente');
    assert.equal(C.perfilSugerido({ pagados_a_tiempo: 2, creditos_total: 3 }).perfil, 'recurrente');
    assert.equal(C.perfilSugerido({ pagados_a_tiempo: 0, creditos_total: 1 }).perfil, 'nuevo');
    assert.equal(C.perfilSugerido({}).perfil, 'nuevo');
    C.ORDEN_PERFILES.forEach(() => {});
    ['', null, undefined].forEach(() => {});
    assert.match(C.perfilSugerido({ pagados_a_tiempo: 7, creditos_total: 7 }).motivo, /7 créditos/);
  });

  test('quien está en mora hoy vuelve a revisión, por bueno que sea el historial', () => {
    const r = C.perfilSugerido({ pagados_a_tiempo: 20, creditos_total: 20, en_mora: true });
    assert.equal(r.perfil, 'nuevo');
    assert.match(r.motivo, /mora/);
  });

  test('el perfil nace SIN ASIGNAR, y sin asignar no hay cupo', () => {
    /* Joan dijo que el perfil lo pone él. Que lo pusiera la migración sería lo
       mismo con otro disfraz: cincuenta clientes con cupo que él nunca aprobó. */
    const campos = C.camposNuevosDelSocio();
    assert.equal(campos.perfil, null);
    assert.equal(campos.perfilSugerido, null);
    assert.deepEqual(campos.perfilHistorial, [], 'su spec pide saber quién cambió qué y cuándo');
  });

  test('la ficha nueva reserva lo que hace falta y nada más', () => {
    const campos = C.camposNuevosDelSocio();
    ['perfil', 'perfilSugerido', 'perfilMotivo', 'perfilAsignadoEn', 'perfilHistorial',
     'telefonoUsuario', 'registradoEn', 'autorizacionDatos'].forEach(k =>
      assert.ok(k in campos, 'falta ' + k));
    /* Sin contraseña acá: la guarda Supabase Auth, hasheada del lado del
       servidor. Un campo de contraseña en la ficha del Panel es una contraseña
       en claro esperando a que alguien la use. */
    assert.ok(!('contrasena' in campos) && !('password' in campos) && !('clave' in campos),
      'apareció un campo de contraseña en la ficha: eso lo guarda Supabase Auth, no el Panel');
  });
});

/* ==========================================================================
 * QUE NO SE MEZCLE CON EL PRODUCTO DE HOY
 * ======================================================================== */

describe('creditos.js y motor.js no se pisan', () => {

  test('el catálogo publicable no sabe nada del quincenal', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'creditos.js'), 'utf8');
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, ' ');
    ['quincenal', 'TASA_CREDITO', 'prorroga', 'garantia'].forEach(p =>
      assert.ok(codigo.toLowerCase().indexOf(p.toLowerCase()) === -1,
        'el catálogo publicable menciona «' + p + '» en el código: son dos productos y no se mezclan'));
  });

  test('no depende de motor.js: se puede razonar solo', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'app', 'creditos.js'), 'utf8');
    assert.ok(!/require\(|MotorReglas/.test(fuente.replace(/\/\*[\s\S]*?\*\//g, ' ')));
  });

  test('el motor de siempre sigue intacto', () => {
    /* Etapa 1 no toca el producto que Joan opera hoy. Si esto se cae, se movió
       algo que no se tenía que mover. */
    const M = require('../app/motor.js');
    assert.equal(M.TASA_CREDITO, 0.20);
    /* 29-ago: la tasa pactable. 2-sep: los niveles por garantia. */
    assert.equal(M.REGLAS_VIGENTES_DESDE, '2026-09-02');
  });
});

/* ==========================================================================
 * LA TABLA DE TOPES NO SE PUEDE VENCER EN SILENCIO — 27-ago-2026
 *
 * POR QUÉ EXISTE. Las siete pruebas de arriba miden la FORMA de la tabla (que
 * el tope sea el IBC × 1,5, que los tramos no se pisen, que el 65,46% de bajo
 * monto no se cuele) y NINGUNA mide su FRESCURA. O sea que el día 1 de cada
 * mes la calculadora pública se queda muda —simular() devuelve
 * {puede:false, motivo:'sin_tope'} y la fachada cae en su rama honesta— sin
 * que se caiga una sola prueba y sin que nadie se entere hasta que un cliente
 * abre la app y no ve precios.
 *
 * Que la app se niegue a cotizar sin techo certificado es CORRECTO y no se
 * toca: cotizar por encima del tope de usura es delito (art. 305 del Código
 * Penal). Lo que estaba mal es que se enterara el cliente antes que Joan.
 *
 * Esta prueba usa la fecha real a propósito —es de las poquísimas que
 * deben— porque lo que vigila es justamente el paso del tiempo.
 * ======================================================================== */
describe('la tabla de usura avisa ANTES de vencerse', () => {

  const C = require('../app/creditos.js');
  const DIAS_DE_AVISO = 15;

  function hoyISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
  function diasHasta(iso) {
    return Math.round((new Date(iso + 'T00:00:00Z') - new Date(hoyISO() + 'T00:00:00Z')) / 86400000);
  }

  test('HAY TECHO CERTIFICADO PARA HOY: si no, la app pública está muda', () => {
    const hoy = hoyISO();
    assert.ok(C.topeVigente(hoy),
      'NO HAY TOPE DE USURA PARA HOY (' + hoy + '). La calculadora de play/ no está ' +
      'dando precios y el registro abierto no sirve de nada. La tabla llega hasta ' +
      C.ultimoTopeCertificado() + '.\n\n' +
      'ARREGLO: la Superfinanciera publica la resolución a fin de mes. Se agrega UNA fila ' +
      'a TOPES en app/creditos.js con su desde/hasta, el ibc y consumo_ordinario = ibc × 1,5, ' +
      'y se regenera PLAY-FICHA.md. Las filas viejas no se tocan: son historia.');
  });

  test('avisa con 15 días de anticipación (no rompe: avisa)', (t) => {
    /* ESTE NO FALLA A PROPÓSITO, y la decisión importa. La tabla se vence por
       diseño el último día de cada mes, así que una prueba que se pusiera roja
       en los días previos dejaría la suite roja DOS SEMANAS DE CADA MES — y una
       suite crónicamente roja se ignora, que es peor que no tener centinela.
       Aquí se grita en la salida (`# ...`, imposible de no ver al correr las
       pruebas) y el rojo se reserva para cuando la app ya está muda de verdad,
       que es la prueba de arriba. Aviso ≠ emergencia. */
    const ultimo = C.ultimoTopeCertificado();
    const faltan = diasHasta(ultimo);
    if (faltan <= DIAS_DE_AVISO) {
      t.diagnostic('⚠️  LA TABLA DE USURA SE VENCE EN ' + faltan + ' DÍA(S) (el ' + ultimo + ').');
      t.diagnostic('    Desde el día siguiente la calculadora pública deja de dar precios y la');
      t.diagnostic('    divulgación obligatoria desaparece de la pantalla.');
      t.diagnostic('    ARREGLO: consigue la certificación del mes que entra y agrega su fila a');
      t.diagnostic('    TOPES en app/creditos.js (ibc y consumo_ordinario = ibc × 1,5), después');
      t.diagnostic('    regenera la ficha: node herramientas/ficha-play.js');
    }
    assert.ok(faltan >= 0, 'el último tope quedó en el pasado: eso lo caza la prueba anterior');
  });
});
