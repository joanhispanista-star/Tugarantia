/* ============================================================================
 * ¿HASTA CUÁNDO PUEDE COTIZAR TU GARANTÍA? — el vigilante de la tabla de usura.
 *
 *   node herramientas/vigilar-usura.js              # informa; falla solo si ya venció
 *   node herramientas/vigilar-usura.js --avisar     # falla también en los 15 días previos
 *
 * QUÉ VIGILA. `app/creditos.js` tiene la tabla TOPES: una fila por mes con el
 * interés bancario corriente que certifica la Superintendencia Financiera y el
 * techo de usura (= ibc × 1,5). La tabla se vence POR DISEÑO el último día de
 * cada mes, porque la certificación es mensual y nadie puede adivinar la del mes
 * que entra.
 *
 * QUÉ PASA CUANDO SE VENCE. `topeVigente(hoy)` devuelve null, la calculadora
 * pública de `play/` deja de dar precios y la divulgación obligatoria desaparece
 * de la pantalla. La app no miente ni cotiza por encima del techo —cobrar por
 * encima del tope de usura es delito, artículo 305 del Código Penal—, así que
 * quedarse muda es la conducta CORRECTA y no se toca.
 *
 * Lo que está mal es que se entere el cliente antes que Joan. Para eso es esto.
 *
 * POR QUÉ HACE FALTA UN ARCHIVO APARTE, si ya hay una prueba. La prueba
 * («HAY TECHO CERTIFICADO PARA HOY», en pruebas/creditos.test.js) solo se ve si
 * alguien corre las pruebas, y se pone roja cuando la app YA está muda: tarde.
 * Este archivo se puede correr solo, decir cuántos días faltan, y —con
 * --avisar— fallar ANTES, que es lo que lo hace servible desde un vigilante
 * automático (ver .github/workflows/vigilar.yml).
 *
 * 3-sep-2026: se descubrió barriendo el futuro con herramientas/reloj-falso.js.
 * La tabla llegaba hasta el 30-sep y nada en el repositorio iba a avisar a
 * tiempo; el 1 de octubre la app pública se habría quedado muda en silencio.
 * ==========================================================================*/

'use strict';

const path = require('node:path');
const C = require(path.join(__dirname, '..', 'app', 'creditos.js'));

/* Los mismos 15 días que usa pruebas/creditos.test.js. La Superfinanciera
   publica la resolución del mes entrante sobre el final del mes en curso, así
   que dos semanas es el aviso más temprano que puede ser accionable. */
const DIAS_DE_AVISO = 15;

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function diasEntre(desdeISO, hastaISO) {
  return Math.round((new Date(hastaISO + 'T00:00:00Z') - new Date(desdeISO + 'T00:00:00Z')) / 86400000);
}

function pct(x) { return (x * 100).toFixed(2).replace('.', ',') + '%'; }

/**
 * El estado de la tabla en la fecha `hoy`.
 * @returns {{hoy:string, vigente:object|null, ultimo:string|null, faltan:number|null,
 *            estado:'muda'|'por_vencer'|'al_dia'}}
 */
function revisar(hoy) {
  const dia = hoy || hoyISO();
  const vigente = C.topeVigente(dia);
  const ultimo = C.ultimoTopeCertificado();
  const faltan = ultimo ? diasEntre(dia, ultimo) : null;
  let estado = 'al_dia';
  if (!vigente) estado = 'muda';
  else if (faltan !== null && faltan <= DIAS_DE_AVISO) estado = 'por_vencer';
  return { hoy: dia, vigente: vigente, ultimo: ultimo, faltan: faltan, estado: estado };
}

const ARREGLO = [
  'CÓMO SE ARREGLA (10 minutos, y solo lo puede hacer Joan):',
  '  1. Busca la resolución del mes en la Superintendencia Financiera:',
  '     https://www.superfinanciera.gov.co  →  «Tasas de interés» →',
  '     interés bancario corriente, modalidad CONSUMO Y ORDINARIO.',
  '  2. Agrega UNA fila al final de TOPES, en app/creditos.js:',
  '       { desde: \'AAAA-MM-01\', hasta: \'AAAA-MM-<último día>\',',
  '         consumo_ordinario: <ibc × 1,5>, ibc: <ibc>,',
  '         fuente: \'Resolución <número> de <año>\' }',
  '     El techo es el ibc por 1,5, en tanto por uno (0,2924 = 29,24%).',
  '  3. Las filas viejas NO se tocan: son historia y hay pruebas que las miran.',
  '  4. Regenera la ficha:  node herramientas/ficha-play.js',
  '  5. Corre las pruebas:  cd pruebas && node --test',
  '  6. git commit y git push (Pages publica solo).'
];

function informar(r) {
  const L = [];
  L.push('TABLA DE USURA — ' + r.hoy);
  L.push('');
  if (r.vigente) {
    L.push('  Techo vigente hoy:  ' + pct(r.vigente.consumo_ordinario) +
           '   (ibc ' + pct(r.vigente.ibc) + ')');
    L.push('  Fuente:             ' + r.vigente.fuente);
  }
  L.push('  La tabla llega hasta: ' + r.ultimo +
         (r.faltan === null ? '' : '   (faltan ' + r.faltan + ' día(s))'));
  L.push('');

  if (r.estado === 'muda') {
    L.push('*** LA APP PÚBLICA ESTÁ MUDA ***');
    L.push('');
    L.push('No hay techo certificado para hoy (' + r.hoy + '). Ahora mismo:');
    L.push('  · la calculadora de play/ NO está dando precios;');
    L.push('  · la divulgación obligatoria no aparece en pantalla;');
    L.push('  · el registro abierto no sirve de nada, porque nadie ve cuánto cuesta.');
    L.push('');
    L.push.apply(L, ARREGLO);
  } else if (r.estado === 'por_vencer') {
    L.push('AVISO: la tabla se vence en ' + r.faltan + ' día(s), el ' + r.ultimo + '.');
    L.push('Desde el día siguiente la calculadora pública deja de dar precios.');
    L.push('');
    L.push.apply(L, ARREGLO);
  } else {
    L.push('Al día. Nada que hacer hasta dentro de ' +
           (r.faltan - DIAS_DE_AVISO) + ' día(s), cuando empiece el aviso.');
  }
  return L.join('\n');
}

if (require.main === module) {
  const avisar = process.argv.indexOf('--avisar') >= 0;
  const r = revisar();
  console.log(informar(r));
  /* Muda siempre falla. «Por vencer» falla solo con --avisar, y la distinción
     es deliberada: la suite local no puede estar roja dos semanas de cada mes
     —una suite crónicamente roja se ignora—, pero el vigilante automático SÍ
     tiene que gritar antes, porque su rojo es justamente el correo del aviso. */
  if (r.estado === 'muda') process.exit(1);
  if (r.estado === 'por_vencer' && avisar) process.exit(1);
  process.exit(0);
}

module.exports = { revisar, informar, DIAS_DE_AVISO };
