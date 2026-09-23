'use strict';
/* ==========================================================================
 * CUÁNDO COBRAR — 22 de septiembre de 2026
 *
 * Joan: «tener organizado cuando tienen que pagar para preparar la cobranza».
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ NO BASTABA «MI BASE»
 *
 * «Mi base» agrupa por ETAPA —D-3, D0, M1A…— y la etapa es una etiqueta
 * relativa: dice «faltan tres días», no QUÉ DÍA. Para preparar la jornada hay
 * que poder mirar una lista y decir «estos cinco son de hoy», no traducir
 * mentalmente nueve siglas.
 *
 * Y sobre todo: los VENCIDOS ordenados por antigüedad. En «Mi base» toda la
 * mora cae en dos o tres etapas revueltas; aquí el de hace veinte días sale
 * antes que el de ayer, que es el orden en que hay que llamar.
 *
 * ---------------------------------------------------------------------------
 * UN FALLO QUE CAZÓ ESTA PRUEBA, Y QUE VALE ANOTAR
 *
 * La primera versión de la marca de contactabilidad escribió el motivo
 * `'horario'`, que NO EXISTE: en `gestion-asesor.js` son `hora` y
 * `hora_sabado`. Los dos bloqueos de hora caían en el `else`, así que un sábado
 * por la tarde la lista decía «ya lo tocaste esta semana» sobre alguien a quien
 * nadie había tocado.
 *
 * Una etiqueta que miente sobre el POR QUÉ es peor que ninguna, porque el
 * asesor actúa sobre ella: ese cliente se queda sin llamada una semana entera.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const GESTION = leer('app/gestion-asesor.js');

const funcion = nombre => {
  const i = CRM.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
};

describe('se agrupa por la FECHA, no por la etiqueta', () => {

  const f = () => funcion('vistaCobrarEq');

  test('los cuatro grupos existen y salen del día de pago', () => {
    const v = f();
    ['vencidos', 'hoy', 'semana', 'despues'].forEach(k =>
      assert.ok(v.indexOf("k: '" + k + "'") >= 0, 'falta el grupo ' + k));
    assert.match(v, /diasEntre\(hoy, String\(p\.fecha_pago\)/,
      'no se calcula contra la fecha de pago: se estaría agrupando por otra cosa');
  });

  test('los vencidos salen del MÁS VIEJO al más nuevo', () => {
    /* Es el orden en que hay que llamar. Con el de ayer arriba, el de hace
       veinte días se queda para el final — y ese es el que se pierde. */
    assert.match(f(), /p\._dias < 0\).sort\(\(a, b\) => a\._dias - b\._dias\)/,
      'los vencidos no se ordenan por antigüedad');
  });

  test('«esta semana» son siete días, ni más ni menos', () => {
    assert.match(f(), /p\._dias > 0 && p\._dias <= 7/);
  });

  test('cada grupo lleva su plata, que es lo que decide por dónde empezar', () => {
    /* Diez personas que deben cien mil no son lo mismo que una que debe un
       millón, y con una lista de nombres eso no se ve. */
    assert.match(f(), /COP\(plata\(x\.g\)\)/, 'los grupos salen sin el total de plata');
    assert.match(f(), /p\.saldo_total != null \? Number\(p\.saldo_total\)/,
      'se suma con un truthy: un saldo de 0 se leería como «no sé»');
  });
});

describe('sin fecha no se inventa nada', () => {

  test('los que no la tienen van en su propio grupo', () => {
    assert.match(funcion('vistaCobrarEq'), /const sinFecha = cli\.filter\(p => !p\.fecha_pago\)/,
      'los que no tienen fecha caerían en «vencidos»: mandar a cobrar a ciegas');
  });

  test('y se dice que eso NO quiere decir que estén al día', () => {
    assert.match(funcion('vistaCobrarEq'), /<b>No<\/b> quiere decir que estén al día/,
      'el asesor leería «sin fecha» como «no debe nada»');
  });

  test('solo entran clientes: un prospecto no debe nada', () => {
    assert.match(funcion('vistaCobrarEq'), /genteEquipo\(\)\.filter\(p => p\.tipo === 'cliente'\)/,
      'se listarían prospectos para cobrarles algo que nunca pidieron');
  });
});

describe('la marca de «no se puede contactar»', () => {

  const f = () => funcion('marcaDeCobroEq');

  test('pregunta a la MISMA función que decide al tocar el botón', () => {
    /* Si hubiera dos reglas, la lista diría una cosa y el botón otra. */
    assert.match(f(), /G\.puedeContactar\(p, \{ canal: 'whatsapp', esFestivo \}\)/,
      'la lista calcula la contactabilidad por su cuenta');
  });

  test('LOS MOTIVOS SON LOS DE VERDAD, uno por uno', () => {
    /* El fallo que cazó esta prueba: se escribió `horario`, que no existe, y
       los dos bloqueos de hora caían en el else — un sábado por la tarde la
       lista decía «ya lo tocaste esta semana» sobre alguien a quien nadie
       había tocado. */
    const marca = f();
    const reales = [...new Set(
      [...GESTION.matchAll(/motivo: '([a-z_]+)'/g)].map(m => m[1]))];
    assert.ok(reales.length >= 6, 'no se encontraron los motivos en gestion-asesor.js');
    const faltan = reales.filter(m => marca.indexOf(m + ':') < 0);
    assert.deepEqual(faltan, [],
      'estos motivos existen en gestion-asesor.js y la marca no los nombra: ' +
      faltan.join(', ') + '. Caerían en el caso por defecto y la etiqueta mentiría ' +
      'sobre el porqué — y el asesor actúa sobre esa etiqueta.');
  });

  test('«ahora no» y «esta semana» se dicen distinto', () => {
    /* Lo de la hora cambia solo con esperar; lo de la semana, no. Lo que hay
       que HACER es distinto, así que no pueden verse igual. */
    const marca = f();
    assert.match(marca, /hora: 'ahora no'/);
    assert.match(marca, /esta_semana: 'ya lo tocaste esta semana'/);
    assert.match(marca, /hoy: 'ya lo tocaste hoy'/);
  });

  test('y un motivo que no se reconozca NO se disfraza de otro', () => {
    /* Si mañana se añade uno, se pinta el texto que manda la función —que
       siempre explica el caso— en vez de una etiqueta inventada. */
    assert.match(f(), /const et = CHIP\[r\.motivo\];/);
    assert.match(f(), /et \? '<span class="chip '/,
      'un motivo desconocido saldría con una etiqueta que no le corresponde');
  });
});

describe('y no le añade ruido a «Mi base»', () => {

  test('filaPersonaEq sigue funcionando sin la marca', () => {
    /* El parámetro es opcional a propósito: solo «Cuándo cobrar» le pasa algo.
       Si fuera obligatorio, «Mi base» heredaría una columna que no pidió. */
    assert.match(funcion('filaPersonaEq'), /function filaPersonaEq\(p, extra\)/);
    assert.match(CRM, /\$\{extra \|\| ''\}/,
      'sin el fallback, «Mi base» pintaría «undefined» en cada fila');
  });

  test('y el mapa del menú conoce la entrada nueva', () => {
    assert.match(CRM, /jefe: 'Mensajes', cobrar: 'Cuándo cobrar'/,
      'la entrada nueva hereda el fallo del mapa: el menú se apaga entero');
    assert.match(CRM, /onclick="irEquipo\('cobrar'\)"/, 'no hay por dónde entrar');
  });

  test('el aviso de «los montos son del…» también sale aquí', () => {
    /* Es donde más importa: esta pantalla es toda cifras y fechas, y si el
       CRM lleva tres días sin publicar, todas son viejas. */
    assert.match(funcion('vistaCobrarEq'), /avisoAlDiaDeEq\(\)/);
  });
});

/* ==========================================================================
 * Y AHORA DE VERDAD: SE RENDERIZA CON DATOS
 *
 * Todo lo de arriba mira el código. Esto lo EJECUTA, que es lo único que
 * demuestra que agrupa bien. Y ya sirvió: la primera comprobación a mano metió
 * un vencido en el grupo equivocado… porque el fixture armaba las fechas con
 * `toISOString()`, que es UTC, y a las diez de la noche en Bogotá eso es el día
 * siguiente. El código usaba hora local y estaba bien.
 *
 * Por eso las fechas de aquí abajo se arman EN LOCAL, igual que `hoyISOCrm()`.
 * Una prueba con la zona horaria equivocada acusa al código de lo que hace
 * ella.
 * ======================================================================== */
const { abrirPanel } = require('./banco-panel.js');

const localISO = d => d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const enDias = n => { const x = new Date(); x.setDate(x.getDate() + n); return localISO(x); };

function pintar(gente) {
  const P = abrirPanel({});
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify({
    ok: true, yo: { nombre: 'Ana', rol: 'asesor', celular: '3001110002' },
    equipo: [], retirados: [], gente
  }) + ';');
  P.ev('AGENDA_ESTADO="listo"; AGENDA_EQ=[];');
  return P.ev('vistaCobrarEq()');
}

const CLIENTES = [
  { id: '1', nombre: 'Vencido viejo', celular: '3001110001', tipo: 'cliente', etapa: 'M1B',
    saldo_total: 340000, fecha_pago: enDias(-20) },
  { id: '2', nombre: 'Vencido ayer', celular: '3001110003', tipo: 'cliente', etapa: 'M1A',
    saldo_total: 120000, fecha_pago: enDias(-1) },
  { id: '3', nombre: 'Paga hoy', celular: '3001110004', tipo: 'cliente', etapa: 'D0',
    saldo_total: 200000, fecha_pago: enDias(0) },
  { id: '4', nombre: 'De aqui a tres', celular: '3001110005', tipo: 'cliente', etapa: 'D-3',
    saldo_total: 150000, fecha_pago: enDias(3) },
  { id: '5', nombre: 'Mas adelante', celular: '3001110006', tipo: 'cliente', etapa: 'CA',
    saldo_total: 500000, fecha_pago: enDias(20) },
  { id: '6', nombre: 'Sin fecha suya', celular: '3001110007', tipo: 'cliente', etapa: 'CA' },
  { id: '7', nombre: 'Un prospecto', celular: '3001110008', tipo: 'prospecto', etapa: 'PC' }
];

describe('se ejecuta y agrupa de verdad', () => {

  test('cada quien cae en su grupo, y el prospecto en ninguno', () => {
    const h = pintar(CLIENTES);
    assert.ok(h.length > 500, 'no pintó nada');
    ['Vencido viejo', 'Vencido ayer', 'Paga hoy', 'De aqui a tres', 'Mas adelante',
     'Sin fecha suya'].forEach(n =>
      assert.ok(h.indexOf(n) >= 0, 'no sale ' + n));
    assert.equal(h.indexOf('Un prospecto') >= 0, false,
      'se listó un prospecto para cobrarle algo que nunca pidió');
  });

  test('el vencido MÁS VIEJO sale primero', () => {
    const h = pintar(CLIENTES);
    assert.ok(h.indexOf('Vencido viejo') < h.indexOf('Vencido ayer'),
      'el de hace veinte días quedó detrás del de ayer: es el que se pierde');
  });

  test('y el total de vencidos suma LOS DOS', () => {
    /* $340.000 + $120.000. Esta cifra es la que decide por dónde empezar: diez
       personas que deben cien mil no son lo mismo que una que debe un millón. */
    const h = pintar(CLIENTES);
    const chip = (h.match(/<span class="chip mora">[^<]*<\/span>/) || [''])[0];
    assert.match(chip, /2 · \$460\.000/,
      'el grupo de vencidos no suma bien: ' + chip);
  });

  test('sin clientes, lo dice en vez de salir en blanco', () => {
    const h = pintar([{ id: '9', nombre: 'Solo un prospecto', celular: '3001110009',
                        tipo: 'prospecto', etapa: 'PC' }]);
    assert.match(h, /No tienes clientes con crédito abierto/,
      'la pantalla sale vacía sin explicar por qué');
  });

  test('un grupo sin nadie no pinta una tarjeta vacía', () => {
    const h = pintar([CLIENTES[2]]);          // solo el de hoy
    assert.equal(h.indexOf('Vencidos') >= 0, false,
      'pinta «Vencidos» con cero personas: ruido que hay que leer para descartar');
    assert.ok(h.indexOf('Paga hoy') >= 0);
  });
});
