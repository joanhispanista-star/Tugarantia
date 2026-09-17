/* ============================================================================
 * Corre las pruebas con el RELOJ DE PARED CONGELADO, para descubrir cuáles
 * dependen del calendario y se van a poner rojas solas.
 *
 *   node herramientas/reloj-falso.js                    # el barrido de siempre
 *   node herramientas/reloj-falso.js 2026-10-01
 *   node herramientas/reloj-falso.js 2026-10-01T03:30   # con hora (Ley 2300)
 *   node herramientas/reloj-falso.js 2026-10-01 2027-06-01 2028-03-01
 *
 * POR QUÉ EXISTE ESTA HERRAMIENTA — 3-sep-2026.
 *
 * El parte del 2-sep decía «871 pruebas en verde», y era verdad. A la mañana
 * siguiente eran 870 y una roja, sin que nadie hubiera tocado una línea de
 * código: «con DOS prórrogas más plan de pagos tampoco rinde más» afirmaba que
 * `meses_sin_mora` valía 0, y ese contador es `floor(díasEntre(último día de
 * mora, HOY) / 30)`. El fixture curaba su mora el 4-ago. El 2-sep iban 29 días
 * y daba 0; el 3-sep iban 30 y daba 1. La cuenta era correcta los dos días: lo
 * que estaba mal era la prueba, que preguntaba contra el almanaque.
 *
 * Y lo peor no fue el rojo, fue la FORMA del rojo: se habría curado sola el
 * 16-sep, cuando la primera cuota del plan vence, el socio vuelve a estar en
 * mora y el contador se pone en cero solo. Una prueba que se enciende y se
 * apaga con el calendario no distingue una regresión de un martes.
 *
 * Muestrear no encuentra esto: hay que BARRER el futuro. Este archivo es la
 * escoba. Encontró dos cosas el primer día que se corrió — la de arriba, y que
 * la tabla de usura se vence el 30-sep y deja muda a la app pública.
 *
 * CÓMO FUNCIONA. El mismo archivo hace dos papeles: si lo corres, lanza
 * `node --test` una vez por fecha; si `FECHA_FALSA` está puesta, se precarga a
 * sí mismo dentro de cada proceso hijo del corredor y reemplaza `Date` por una
 * que siempre contesta ese día. `node --test` corre cada archivo de pruebas en
 * su propio proceso, y por eso la precarga tiene que viajar en NODE_OPTIONS: un
 * `--require` en la línea de comandos no se hereda a los hijos.
 * ==========================================================================*/

'use strict';

const FECHA_FALSA = process.env.FECHA_FALSA;
const BARRA_INVERTIDA = String.fromCharCode(92);

/* ------------------------------------------------------ papel 1: congelar */
function congelar(iso) {
  /* 17-sep-2026 — Y AHORA TAMBIÉN LA HORA. Hasta hoy esta escoba congelaba
     siempre al MEDIODÍA, y por eso barrió dos años de futuro sin ver la mitad
     del problema: el mediodía cae dentro de la ventana de cobranza de la Ley
     2300 TODOS los días hábiles. Las diez pruebas que se caían de noche —y las
     diecisiete que se caían en domingo— eran invisibles para una escoba que
     solo sabía preguntar por días a las doce.
     `AAAA-MM-DD` sigue significando mediodía, que es lo que ya esperaban las
     seis fechas del barrido de siempre; `AAAA-MM-DDTHH:MM` fija la hora. */
  const texto = String(iso);
  const corte = texto.indexOf('T');
  const dia = (corte === -1 ? texto : texto.slice(0, corte)).split('-').map(Number);
  const reloj = corte === -1 ? [12, 0] : texto.slice(corte + 1).split(':').map(Number);
  /* Mediodía local por defecto a propósito: a medianoche cualquier conversión de
     zona horaria movería el día y estaríamos midiendo otro que el que se pidió
     —la misma trampa de UTC que ya tiene su prueba en el motor. */
  const FIJO = new Date(dia[0], dia[1] - 1, dia[2],
                        reloj[0] || 0, reloj[1] || 0, 0).getTime();
  const Real = Date;
  function Falso() {
    if (!(this instanceof Falso)) return new Real(FIJO).toString();
    if (arguments.length === 0) return new Real(FIJO);
    return new (Function.prototype.bind.apply(Real, [null].concat(
      Array.prototype.slice.call(arguments))))();
  }
  Falso.prototype = Real.prototype;      // para que instanceof y los métodos sigan
  Falso.now = function () { return FIJO; };
  Falso.parse = Real.parse;
  Falso.UTC = Real.UTC;
  Object.setPrototypeOf(Falso, Real);
  globalThis.Date = Falso;
}

/* --------------------------------------------------------- papel 2: barrer */
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function fechasPorDefecto() {
  /* Hoy, la semana que entra, el mes, el trimestre, el año y el siguiente. Con
     esas seis se ve casi todo: los contadores que avanzan por múltiplos de 30
     días caen en las primeras, y las tablas con fecha de vencimiento —la de
     usura— en las últimas. */
  const hoy = new Date();
  const mas = function (dias) {
    return iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias, 12));
  };
  /* 17-sep-2026 — LAS CUATRO HORAS QUE FALTABAN, y son las que esconden el otro
     tipo de bomba. La ventana de cobranza de la Ley 2300 es 7am–7pm entre
     semana, 8am–3pm el sábado y ninguna el domingo: eso son 67 horas de las 168
     de la semana, así que una suite atada al reloj está roja el 60% del tiempo y
     la escoba, barriendo siempre al mediodía, no veía ni una.
       · madrugada y noche  → la reja cerrada entre semana
       · sábado por la tarde → la ventana corta del sábado
       · domingo             → el día entero prohibido
     Y el domingo se busca de verdad en el calendario en vez de sumar días a
     ojo: sumar 3 acierta hoy y miente el resto de la semana. */
  const proximo = function (diaSemana, hora) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
    d.setDate(d.getDate() + ((diaSemana - d.getDay() + 7) % 7 || 7));
    return iso(d) + 'T' + String(hora).padStart(2, '0') + ':30';
  };
  return [mas(0), mas(7), mas(31), mas(93), mas(366), mas(731),
          mas(0) + 'T03:30', mas(0) + 'T20:30',
          proximo(6, 16),   // sábado, fuera de su ventana de 8 a 3
          proximo(0, 11)];  // domingo
}

function barrer(fechas) {
  const spawnSync = require('node:child_process').spawnSync;
  const path = require('node:path');
  const PRUEBAS = path.join(__dirname, '..', 'pruebas');
  /* NODE_OPTIONS no lleva bien las rutas de Windows con barra invertida: se
     pasan con barra normal, que Node acepta igual en todas las plataformas. */
  const yo = __filename.split(BARRA_INVERTIDA).join('/');

  console.log('Barriendo ' + fechas.length + ' fecha(s) con el reloj congelado.');
  console.log('(cada una corre la suite entera, así que toma unos segundos por fecha)');
  console.log('');

  const filas = [];
  for (const f of fechas) {
    const r = spawnSync(process.execPath, ['--test'], {
      cwd: PRUEBAS,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        FECHA_FALSA: f,
        NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --require ' + yo).trim()
      })
    });
    const salida = (r.stdout || '') + (r.stderr || '');
    const dato = function (etiqueta) {
      const m = salida.match(new RegExp('^# ' + etiqueta + ' ([0-9]+)', 'm'));
      return m ? Number(m[1]) : null;
    };
    /* El corredor reporta como `not ok` tanto la prueba que falló como la suite
       que la contiene, así que la lista trae repeticiones y se limpia por
       nombre: lo que interesa es CUÁL se rompió, no cuántas veces se dijo. */
    const rotas = (salida.match(/^ *not ok [0-9]+ - .*$/gm) || [])
      .map(function (l) { return l.replace(/^ *not ok [0-9]+ - /, '').trim(); });
    filas.push({ fecha: f, pasan: dato('pass'), fallan: dato('fail'),
                 rotas: Array.from(new Set(rotas)) });
  }

  console.log('CUANDO                PASAN   FALLAN');
  for (const x of filas) {
    console.log(x.fecha.padEnd(20) + '  ' + String(x.pasan == null ? '?' : x.pasan).padStart(5) +
                '    ' + String(x.fallan == null ? '?' : x.fallan).padStart(5));
    for (const r of x.rotas) console.log('                       · ' + r);
  }

  const hoyRoto = !!(filas[0] && filas[0].fallan);
  const futuroRoto = filas.slice(1).some(function (x) { return !!x.fallan; });
  console.log('');
  if (!hoyRoto && !futuroRoto) {
    console.log('Nada se vence: la suite dice lo mismo hoy que en dos años.');
  } else if (!hoyRoto && futuroRoto) {
    console.log('OJO: hoy está verde, pero HAY PRUEBAS QUE SE VAN A VENCER SOLAS.');
    console.log('Cada una es una de dos cosas, y hay que decidir cuál:');
    console.log('  (a) una prueba que mide el almanaque → escríbele la fecha y pásasela;');
    console.log('  (b) un aviso de verdad con fecha límite —la tabla de usura es esto→');
    console.log('      no se toca la prueba: se hace la tarea antes de esa fecha.');
  }
  return filas;
}

/* ------------------------------------------------------------- arranque */
if (require.main === module) {
  const args = process.argv.slice(2);
  const malas = args.filter(function (a) {
    return !/^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2})?$/.test(a);
  });
  if (malas.length) {
    console.error('Fecha no reconocida: ' + malas.join(', ') +
                  '   (se espera AAAA-MM-DD o AAAA-MM-DDTHH:MM)');
    process.exit(2);
  }
  barrer(args.length ? args : fechasPorDefecto());
} else if (FECHA_FALSA) {
  congelar(FECHA_FALSA);
}

module.exports = { congelar, barrer, fechasPorDefecto };
