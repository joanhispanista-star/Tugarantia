/* ============================================================================
 * EL RELOJ DE LAS PRUEBAS — la hora se PASA, no se lee
 *
 * 17-sep-2026. Nace de un fallo que no era de nadie: la suite daba 1.875 de
 * 1.875 a las 07:38 y 1.865 de 1.875 a las 23:30. El mismo código, el mismo
 * commit, distinta hora.
 *
 * POR QUÉ PASABA. La Ley 2300 prohíbe cobrar fuera de cierto horario, y el CRM
 * lo aplica bien: `horarioLegalHoy()` en crm.html mira `new Date()` y cierra la
 * reja de lunes a viernes antes de las 7am y después de las 7pm, los sábados
 * fuera de 8am–3pm, y los domingos entero. Cuatro archivos de pruebas arrancan
 * crm.html DE VERDAD para comprobar la pestaña de Cobranzas — y nunca le
 * dijeron qué hora era. Así que de noche la reja estaba cerrada, la lista salía
 * vacía, y diez pruebas acusaban al CRM de perder gente que el CRM estaba
 * excluyendo correctamente.
 *
 * POR QUÉ IMPORTA, Y NO ES UN DETALLE. `.github/workflows/vigilar.yml` corre la
 * suite en cada push a main. Contando las horas: de las 168 de la semana, la
 * ventana de cobranza son 67 —60 entre semana y 7 el sábado—. O sea que el CI
 * se ponía ROJO EL 60% DE LA SEMANA sin que nadie hubiera roto nada. Un CI que
 * se pone rojo solo deja de mirarse, y uno que se pone verde según la hora deja
 * pasar defectos de verdad: las dos averías salen del mismo sitio.
 *
 * LA REGLA QUE SALE DE ACÁ, y es la misma que `gestion-asesor.test.js` ya
 * seguía desde que se escribió (por eso es el único archivo de cobranza que
 * nunca falló): SI UNA PRUEBA DEPENDE DE LA HORA, LA HORA ES UN DATO DE
 * ENTRADA. `puedeContactar` recibe `{ahora}` y sus pruebas se lo pasan. Acá se
 * hace lo mismo un piso más abajo, en el banco: como el CRM y play/ son páginas
 * enteras que se ejecutan en un `vm`, la hora se les entrega congelando el
 * `Date` del contexto, y con eso `new Date()`, `Date.now()` y todo lo que
 * cuelga de ellos —`hoyISO()`, `horarioLegalHoy()`, `isoLocal()`— mienten a la
 * vez y de forma coherente.
 *
 * LO QUE ESTO NO ARREGLA, A PROPÓSITO. `creditos.test.js` comprueba que hay
 * techo de usura certificado PARA HOY y avisa 15 días antes de que se venza.
 * Esa prueba TIENE que leer el reloj de verdad: no es una prueba frágil, es una
 * alarma, y la tabla de la Superfinanciera se vence de verdad el último día de
 * cada mes. Congelarle la hora sería apagar el detector de humo porque suena.
 * Por eso este reloj es opcional y se pide archivo por archivo, y nunca se
 * instala encima del `Date` de todo el proceso.
 * ==========================================================================*/

'use strict';

/* El Date de verdad, guardado antes de que nadie lo tape. Todo lo de abajo
   construye sobre éste: si se leyera `Date` en el momento de usarlo y alguien
   hubiera puesto un reloj falso encima, se apilarían dos mentiras. */
const Real = Date;

/* --------------------------------------------------------------------------
 * EL MOMENTO DE LA CASA: martes 15 de septiembre de 2026, 10:30 de la mañana.
 *
 * No es una fecha cualquiera. Cumple cinco cosas a la vez, y cada una es un
 * fallo que se evita:
 *
 *   · MARTES, no lunes ni viernes: día hábil sin bordes. Y no es festivo en
 *     Colombia, que `MotorReglas.esFestivo` sí mira.
 *   · 10:30, no 7:00 ni 19:00: bien adentro de la ventana de la Ley 2300, lejos
 *     de los dos bordes. Una prueba que se calibra justo en el borde vuelve a
 *     ser frágil, solo que más difícil de diagnosticar.
 *   · 10:30 TAMBIÉN cae dentro de la ventana del sábado (8am–3pm). Si algún día
 *     alguien mueve el día a un sábado, la hora sigue sirviendo.
 *   · POR LA MAÑANA, y esto es menos obvio: en Bogotá (UTC-5) las 10:30 locales
 *     son las 15:30 UTC, el MISMO día. Varias pruebas sacan el día de hoy con
 *     `new Date().toISOString().slice(0,10)` —que es UTC— mientras el CRM lo
 *     saca con `isoLocal()` —que es local—. A las 10:30 los dos dan la misma
 *     fecha; a las 20:00 darían días distintos y la prueba fallaría por un
 *     motivo que no tiene nada que ver con lo que mide.
 *   · Y la fecha deja la calibración de `fechas-de-pago.test.js` sana: a tres
 *     meses desde el 15-sep la primera cuota cae a 46 días, y con el techo de
 *     mentira del 24% eso separa las dos opciones de arranque, que es
 *     justamente lo que esa prueba necesita medir.
 * ------------------------------------------------------------------------ */
const MOMENTO = '2026-09-15T10:30:00';

/* El mismo instante ya partido, para que ninguna prueba lo vuelva a calcular
   —y para que nadie escriba '2026-09-15' a mano en un sitio y '2026-09-16' en
   otro, que es como se desincronizan los datos de prueba. */
const HOY = '2026-09-15';

/* --------------------------------------------------------------------------
 * UN Date CONGELADO
 *
 * Congelado y no «adelantado desde»: el reloj no avanza durante la corrida. Es
 * más duro a propósito. Un reloj que corre hace que dos lecturas dentro de la
 * misma prueba puedan caer en minutos distintos, y eso es exactamente la clase
 * de fragilidad que este archivo existe para quitar.
 *
 * Lo que SÍ sigue siendo de verdad: `new Date(x)` con argumento, `Date.parse` y
 * `Date.UTC`. Solo se miente cuando se pregunta «¿qué hora es?».
 * ------------------------------------------------------------------------ */
function relojFijo(momento) {
  const instante = new Real(momento || MOMENTO).getTime();
  if (!isFinite(instante)) {
    throw new Error('reloj.js: «' + momento + '» no es un momento que Date entienda');
  }

  function DateFijo(...args) {
    /* Sin `new` —`Date()` a secas— el Date de verdad devuelve un texto, no un
       objeto. Se respeta: hay código que lo usa para pintar. */
    if (!(this instanceof DateFijo)) return new Real(instante).toString();
    return args.length === 0 ? new Real(instante) : new Real(...args);
  }
  /* Comparte prototipo con el Date real para que `instanceof Date` siga siendo
     cierto dentro de la página. Sin esto, cualquier código que compruebe el
     tipo de una fecha empieza a decir que no lo es. */
  DateFijo.prototype = Real.prototype;
  DateFijo.now = () => instante;
  DateFijo.parse = Real.parse;
  DateFijo.UTC = Real.UTC;
  return DateFijo;
}

/* --------------------------------------------------------------------------
 * FECHAS RELATIVAS AL MOMENTO DE LA CASA
 *
 * Para los datos de prueba. Antes estaban escritas a mano —'2026-09-14' para
 * decir «ayer»— y ése es el segundo cronómetro de esta suite: una gestión de
 * «hace un día» escrita a mano deja de estar dentro de la semana que mira la
 * Ley 2300 en cuanto pasa el tiempo, y la prueba se cae sola meses después sin
 * que nadie haya tocado nada.
 * ------------------------------------------------------------------------ */
function isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/* 'AAAA-MM-DD' de hace n días (n negativo = dentro de n días). */
function haceDias(n) {
  const d = new Real(MOMENTO);
  d.setDate(d.getDate() - n);
  return isoLocal(d);
}

/* El instante completo de hace n días, que es lo que guardan las gestiones en
   su campo `hora`. Se devuelve en UTC («...Z») porque así es como lo escribe el
   CRM y como lo lee `Date.parse`. */
function instanteHaceDias(n) {
  const d = new Real(MOMENTO);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

module.exports = { MOMENTO, HOY, relojFijo, haceDias, instanteHaceDias, isoLocal };
