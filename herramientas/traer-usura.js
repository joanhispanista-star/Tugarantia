/* ============================================================================
 * TRAER LA CERTIFICACIÓN DEL MES QUE ENTRA — el robot que TECLEA, no el que decide.
 *
 *   node herramientas/traer-usura.js              # consulta e informa. No escribe.
 *   node herramientas/traer-usura.js --escribir   # además agrega la fila a TOPES.
 *
 * QUÉ HACE. Mira hasta dónde llega la tabla TOPES de app/creditos.js, calcula
 * cuál es el mes siguiente, y le pregunta al portal de Datos Abiertos del Estado
 * si la Superintendencia Financiera ya certificó el interés bancario corriente
 * de ese mes para la modalidad CONSUMO Y ORDINARIO. Si ya está, lo valida contra
 * seis controles y escribe la fila. Si no está, lo dice y se va en paz.
 *
 * QUÉ **NO** HACE, Y ES LO IMPORTANTE: no publica. Escribe en una rama y abre un
 * Pull Request. El número que decide si un precio es delito (art. 305 del Código
 * Penal, 32 a 90 meses de prisión) NO entra a producción sin que un humano mire.
 * El robot ahorra el tecleo y la memoria; la firma sigue siendo de Joan.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTA FUENTE Y NO LA PÁGINA DE LA SUPERFINANCIERA
 *
 * La Superfinanciera publica la resolución en HTML y en un .xls heredado
 * (historicousura.xls). Las dos cosas se rascan con expresiones regulares, y una
 * expresión regular contra un HTML ajeno es una bomba de tiempo.
 *
 * El mismo dato vive en Datos Abiertos con una API de verdad (Socrata/SODA):
 *   https://www.datos.gov.co/resource/pare-7x5i.json
 * Publicador: Superintendencia Financiera de Colombia. 382 filas, desde 2007.
 * Comprobado el 17-sep-2026: las tres filas que Joan tecleó a mano (julio,
 * agosto, septiembre de 2026) coinciden EXACTAMENTE con lo que devuelve esa API,
 * incluido el número de resolución que en julio ni siquiera estaba anotado.
 *
 * TRAMPA GRANDE, ANOTADA A PROPÓSITO: esa API publica el INTERÉS BANCARIO
 * CORRIENTE, no el techo de usura. El techo lo multiplicamos nosotros (×1,5) y
 * ahí hay un precipicio de coma flotante:
 *
 *     (19.49 * 1.5).toFixed(2)  →  "29.23"   ← MAL: el techo certificado es 29,24%
 *     Math.round(19.49*1.5*100) →  2924      ← bien, por casualidad
 *
 * 19,49 × 1,5 = 29,235 exacto, y la mitad exacta se redondea HACIA ARRIBA, pero
 * en binario 29.235 es 29.23499999… y `toFixed` corta hacia abajo. Pasó en tres
 * de los últimos doce meses (julio 28,785 · agosto 29,655 · septiembre 29,235).
 * Por eso acá la cuenta se hace en ENTEROS de centésima de punto y nunca en
 * decimales. Comprobado contra el comunicado oficial de la Resolución 0405 de
 * 2026: ibc 17,01% → usura 25,52% (1701×3/2 = 2551,5 → 2552). ✔
 * ==========================================================================*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO = path.join(RAIZ, 'app', 'creditos.js');
const C = require(ARCHIVO);

const RECURSO = 'https://www.datos.gov.co/resource/pare-7x5i.json';
const MODALIDAD = 'CONSUMO Y ORDINARIO';

/* --------------------------------------------------------- los seis límites
 * Cada número de acá sale de mirar las 151 certificaciones de CONSUMO Y
 * ORDINARIO que hay en la serie (abril 2007 → septiembre 2026), no de la
 * intuición. Se dejan anchos a propósito: esto no adivina el dato correcto,
 * solo ataja la basura. Un valor raro PERO legítimo debe hacer fallar el robot
 * y obligar a Joan a mirar; eso es el comportamiento que se quiere.
 */
const LIMITES = {
  /* histórico real: 14,21% – 31,39%. Se abre a 10–40 para no gritar por un mes
     raro, y sigue atajando el 0, el 1,949 y el 1949. */
  ibc_min: 1000, ibc_max: 4000,
  /* salto mes contra mes más grande en 19 años: 2,26 puntos (julio 2007).
     3,00 está por encima de todo lo observado y por debajo de una coma corrida. */
  salto_max: 300,
  /* la resolución se firma entre 1 y 11 días antes de entrar a regir
     (59 veces a 1 día, 37 a 2, 24 a 3; el máximo histórico es 11). */
  dias_firma_min: 1, dias_firma_max: 20
};

/* --------------------------------------------------------------- utilidades */
function ultimoDelMes(anio, mes) { return new Date(Date.UTC(anio, mes, 0)).getUTCDate(); }
function iso(d) { return d.toISOString().slice(0, 10); }
function dias(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
function hoyISO() { return iso(new Date()); }
/* Centésimas de punto → literal de tanto por uno, SIN pasar por coma flotante.
   2924 → '0.2924'. Así el texto que se escribe en el archivo es idéntico, dígito
   a dígito, al que habría tecleado un humano. */
function literal(centesimas) { return '0.' + String(centesimas).padStart(4, '0'); }
function pct(centesimas) { return (centesimas / 100).toFixed(2).replace('.', ',') + '%'; }

/** El mes que le falta a la tabla: el siguiente al último certificado. */
function mesQueFalta() {
  const hasta = C.ultimoTopeCertificado();           // p.ej. '2026-09-30'
  if (!hasta) throw new Error('TOPES está vacía: no hay de dónde partir.');
  const d = new Date(hasta + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);                  // '2026-10-01'
  const anio = d.getUTCFullYear(), mes = d.getUTCMonth() + 1;
  return {
    desde: iso(d),
    hasta: `${anio}-${String(mes).padStart(2, '0')}-${ultimoDelMes(anio, mes)}`
  };
}

async function consultar(desde) {
  const u = new URL(RECURSO);
  u.searchParams.set('$where',
    `modalidad='${MODALIDAD}' AND vigencia_desde='${desde}T00:00:00.000'`);
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Datos Abiertos respondió HTTP ${r.status}. No se concluye nada.`);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error('La respuesta no es una lista: la API cambió de forma.');
  return j;
}

/**
 * Los seis controles. Devuelve {fila, avisos:[]} o lanza con el motivo.
 * Lanzar es bueno: en el vigilante automático, lanzar = correo a Joan.
 */
function validar(cruda, mes) {
  const problemas = [];
  const anterior = C.TOPES[C.TOPES.length - 1];

  /* 1. la forma del número. Las 382 filas de la serie usan '99.99%'. */
  const m = /^(\d{1,2})\.(\d{2})%$/.exec(String(cruda.interes_bancario_corriente || ''));
  if (!m) throw new Error(
    `El interés llegó como ${JSON.stringify(cruda.interes_bancario_corriente)} y se esperaba '99.99%'. ` +
    'La fuente cambió de formato: NO se escribe nada.');
  const ibc = Number(m[1]) * 100 + Number(m[2]);     // centésimas de punto, entero

  /* 2. rango plausible */
  if (ibc < LIMITES.ibc_min || ibc > LIMITES.ibc_max) {
    problemas.push(`ibc ${pct(ibc)} fuera del rango plausible ` +
      `(${pct(LIMITES.ibc_min)}–${pct(LIMITES.ibc_max)}).`);
  }

  /* 3. salto contra el mes anterior */
  const ibcAnt = Math.round(anterior.ibc * 10000);
  const salto = Math.abs(ibc - ibcAnt);
  if (salto > LIMITES.salto_max) {
    problemas.push(`salta ${pct(salto)} contra ${pct(ibcAnt)} del mes pasado; ` +
      `el máximo histórico en 19 años es 2,26%.`);
  }

  /* 4. continuidad: la vigencia tiene que empezar justo donde termina la tabla */
  if (cruda.vigencia_desde.slice(0, 10) !== mes.desde) {
    problemas.push(`vigencia_desde ${cruda.vigencia_desde.slice(0, 10)} ≠ ${mes.desde}.`);
  }
  if (cruda.vigencia_hasta.slice(0, 10) !== mes.hasta) {
    problemas.push(`vigencia_hasta ${cruda.vigencia_hasta.slice(0, 10)} ≠ ${mes.hasta} ` +
      '(la certificación no cubre el mes completo).');
  }

  /* 5. la fecha de firma: antes de regir, y no demasiado antes */
  const firma = String(cruda.fecha_resolucion || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firma)) problemas.push('fecha_resolucion ilegible.');
  else {
    const d = dias(firma, mes.desde);
    if (d < LIMITES.dias_firma_min || d > LIMITES.dias_firma_max) {
      problemas.push(`firmada el ${firma}, ${d} día(s) antes de regir; lo normal es 1–11.`);
    }
  }

  /* 6. la resolución: número, y que no sea una que ya usamos */
  const res = String(cruda.resolucion || '');
  if (!/^\d+$/.test(res)) problemas.push(`resolución '${res}' no es un número.`);
  if (C.TOPES.some(t => t.fuente.includes(res))) {
    problemas.push(`la resolución ${res} ya aparece en TOPES: la fuente repitió una fila vieja.`);
  }

  if (problemas.length) {
    throw new Error('LA CERTIFICACIÓN NO PASÓ LOS CONTROLES:\n  · ' + problemas.join('\n  · '));
  }

  /* El techo, en enteros. NUNCA con decimales: ver el comentario de arriba. */
  const usura = Math.round(ibc * 3 / 2);

  return {
    desde: mes.desde, hasta: mes.hasta,
    ibc, usura, resolucion: res, firma,
    anio: mes.desde.slice(0, 4)
  };
}

function lineaNueva(f) {
  return `    { desde: '${f.desde}', hasta: '${f.hasta}', ` +
         `consumo_ordinario: ${literal(f.usura)}, ibc: ${literal(f.ibc)}, ` +
         `fuente: 'Resolución ${f.resolucion} de ${f.anio}' }`;
}

/**
 * Mete la fila al final de TOPES sin tocar nada más.
 *
 * DOS ANCLAS, Y LA DISTINCIÓN COSTÓ UNA PRUEBA FALLIDA:
 *
 *   · la COMA se le pone a la última línea que empieza por `{ desde: '`;
 *   · la FILA NUEVA va justo antes del `];`, no justo después de esa línea.
 *
 * Parecen lo mismo y no lo son. Entre la última fila y el cierre hay comentarios
 * —el de septiembre de 2026 explica por qué ese mes fue el más bajo del año— y
 * en este archivo el comentario va ANTES de la fila que describe. Anclando en la
 * fila, octubre se colaba entre agosto y el comentario de septiembre: el arreglo
 * quedaba correcto para JavaScript y mentiroso para el que lo lee al mes
 * siguiente. Se comprobó reconstruyendo la fila de septiembre y comparándola con
 * la que tecleó Joan: el texto salió idéntico, la posición no.
 *
 * No se escribe con una expresión regular sobre todo el archivo a propósito:
 * `consumo_ordinario` aparece también en comentarios y en otras funciones.
 */
function escribir(f) {
  const texto = fs.readFileSync(ARCHIVO, 'utf8');
  const fin = texto.includes('\r\n') ? '\r\n' : '\n';   // el repo vive en Windows
  const lineas = texto.split(/\r?\n/);

  const abre = lineas.findIndex(l => /var TOPES = \[/.test(l));
  if (abre < 0) throw new Error('No encontré `var TOPES = [` en app/creditos.js.');
  const cierra = lineas.findIndex((l, i) => i > abre && /^\s*\];\s*$/.test(l));
  if (cierra < 0) throw new Error('No encontré el cierre de TOPES.');

  let ultima = -1;
  for (let i = abre + 1; i < cierra; i++) if (/^\s*\{ desde: '/.test(lineas[i])) ultima = i;
  if (ultima < 0) throw new Error('TOPES no tiene ninguna fila reconocible.');

  if (!/,\s*$/.test(lineas[ultima])) lineas[ultima] = lineas[ultima].replace(/\s*$/, ',');
  lineas.splice(cierra, 0, lineaNueva(f));

  fs.writeFileSync(ARCHIVO, lineas.join(fin));
}

/* -------------------------------------------------------------------- cara */
async function principal() {
  const escribirlo = process.argv.includes('--escribir');
  const mes = mesQueFalta();
  const hoy = hoyISO();

  console.log('TRAER USURA — ' + hoy);
  console.log('  La tabla llega hasta:  ' + C.ultimoTopeCertificado());
  console.log('  Falta el mes:          ' + mes.desde + ' … ' + mes.hasta);
  console.log('');

  const filas = await consultar(mes.desde);

  if (filas.length === 0) {
    /* TODAVÍA NO ESTÁ PUBLICADA. Eso es normal hasta el último día hábil del mes
       anterior y NO es un fallo... salvo que el mes ya haya empezado, porque
       entonces la app pública ya está muda y sí es una emergencia. */
    if (hoy >= mes.desde) {
      console.error('*** EMERGENCIA: ya es ' + hoy + ', el mes ' + mes.desde.slice(0, 7) +
        ' YA EMPEZÓ y la certificación sigue sin aparecer en Datos Abiertos.');
      console.error('    La calculadora pública está cotizando con el techo del mes pasado');
      console.error('    (topeDeReferencia), que es conservador pero ya no es el vigente.');
      console.error('    Míralo A MANO: https://www.superfinanciera.gov.co → Tasas de interés.');
      process.exit(1);
    }
    console.log('Todavía no la publican. Normal: la resolución se firma el último');
    console.log('día hábil del mes y el dato aparece esa misma noche.');
    console.log('Nada que hacer. Este mismo trabajo vuelve a mirar mañana.');
    process.exit(0);
  }

  if (filas.length > 1) {
    console.error('*** La fuente devolvió ' + filas.length + ' filas para un solo mes y una sola');
    console.error('    modalidad. Eso no debería poder pasar (comprobado: 0 duplicados en 382');
    console.error('    filas). La API cambió: NO se escribe nada, míralo a mano.');
    process.exit(1);
  }

  const f = validar(filas[0], mes);   // lanza si algo huele mal

  console.log('CERTIFICACIÓN ENCONTRADA Y VALIDADA');
  console.log('  Resolución:    ' + f.resolucion + ' de ' + f.anio + '  (firmada ' + f.firma + ')');
  console.log('  Interés corr.: ' + pct(f.ibc));
  console.log('  Techo (×1,5):  ' + pct(f.usura));
  console.log('  Mes anterior:  ' + pct(Math.round(C.TOPES[C.TOPES.length - 1].ibc * 10000)) +
              '  →  se mueve ' + pct(Math.abs(f.ibc - Math.round(C.TOPES[C.TOPES.length - 1].ibc * 10000))));
  console.log('');
  console.log('  La fila queda así:');
  console.log(lineaNueva(f));
  console.log('');
  console.log('  COMPRUÉBALA CONTRA LA FUENTE OFICIAL ANTES DE APROBAR:');
  console.log('  https://www.superfinanciera.gov.co/publicaciones/10829/' +
              'sala-de-prensacomunicados-de-prensa-interes-bancario-corriente-10829/');

  if (escribirlo) { escribir(f); console.log(''); console.log('  Escrita en app/creditos.js.'); }

  /* Código 10 = «hay noticia y es buena». El workflow lo usa para saber que
     tiene que abrir el Pull Request. 0 = no hay nada. 1 = algo está mal. */
  process.exit(escribirlo ? 10 : 0);
}

if (require.main === module) {
  principal().catch(e => { console.error('\n' + e.message); process.exit(1); });
}

module.exports = { mesQueFalta, validar, lineaNueva, LIMITES };
