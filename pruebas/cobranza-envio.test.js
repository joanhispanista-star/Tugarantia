/* ===========================================================================
 * LA BASE PARA SMS Y VOZ
 *
 * Joan lo pidió el 15-sep-2026, el mismo día que vencía el plazo de muchos:
 * «cómo puedo conectar esta plataforma de mensajes de texto y mensajes de voz
 * para cobrar con una plantilla la cual indique el monto a cobrar por cada
 * cliente».
 *
 * Acá se prueban las tres cosas que cuestan plata o cuestan una sanción:
 *   · Que un mensaje quepa en UN SMS (uno que no cabe se cobra doble o cuádruple).
 *   · Que el celular salga del archivo como texto y no como número científico.
 *   · Que el monto hablado se entienda cuando lo lee una máquina.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../app/cobranza-envio.js');

const RAIZ = path.join(__dirname, '..');

/* Un lector de CSV de verdad, para comprobar el archivo como lo va a leer la
   plataforma. Con una expresión regular no se puede: el punto y coma de adentro
   de unas comillas es texto, no separador, y esa distinción es justo la que
   rompe una base cuando alguien se llama «Ana; Luisa». */
function leerCSV(linea, sep) {
  const s = sep || ';';
  const campos = [];
  let actual = '', dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (dentro) {
      if (c === '"') {
        if (linea[i + 1] === '"') { actual += '"'; i++; }
        else dentro = false;
      } else actual += c;
    } else if (c === '"') dentro = true;
    else if (c === s) { campos.push(actual); actual = ''; }
    else actual += c;
  }
  campos.push(actual);
  return campos;
}

describe('lo que cuesta un SMS (15-sep-2026)', () => {

  test('TODAS las plantillas caben en UN solo SMS', () => {
    /* Es la prueba que le ahorra plata. Un mensaje de dos pedazos se cobra dos
       veces, por cliente y por envío. Con 200 clientes al mes eso es el doble
       de la factura por una tilde que nadie miró. */
    const vars = { nombre: 'Maria', saldo: '$150.000',
                   saldo_hablado: 'ciento cincuenta mil pesos',
                   fecha_pago: '15 de septiembre', telefono: '3001112233' };
    for (const [clave, plantilla] of Object.entries(E.SMS)) {
      const texto = E.sinTildes(E.aplicar(plantilla, vars));
      const m = E.pedazosSMS(texto);
      assert.equal(m.alfabeto, 'GSM-7',
        'la plantilla ' + clave + ' se sale del alfabeto barato por: ' + m.culpables.join(' '));
      assert.equal(m.pedazos, 1,
        'la plantilla ' + clave + ' ocupa ' + m.pedazos + ' SMS (' + m.caracteres + ' caracteres)');
    }
  });

  test('con el nombre más largo que quepa, sigue siendo UN SMS', () => {
    /* Los nombres reales no son «Maria». Se prueba con el peor caso plausible:
       un primer nombre largo y un monto de siete cifras. */
    const vars = { nombre: 'Inmaculada', saldo: '$1.250.000',
                   saldo_hablado: 'un millon doscientos cincuenta mil pesos',
                   fecha_pago: '30 de septiembre', telefono: '3001112233' };
    for (const [clave, plantilla] of Object.entries(E.SMS)) {
      const m = E.pedazosSMS(E.sinTildes(E.aplicar(plantilla, vars)));
      assert.equal(m.pedazos, 1,
        clave + ' con nombre largo ocupa ' + m.pedazos + ' SMS (' + m.caracteres + ')');
    }
  });

  test('la cuenta de pedazos está bien: una tilde cuadruplica el precio', () => {
    /* La medida contra la que se decidió no reusar las plantillas del CRM. */
    const largo = 'Hola Maria, como estas hoy? Te recordamos que hoy es tu pago de ' +
      '$150.000. Si no alcanzas a cubrir todo, no te preocupes: puedes dejar la ' +
      'prorroga de $30.000 y seguimos en la otra quincena. Quedamos pendientes.';
    const limpio = E.pedazosSMS(largo);
    assert.equal(limpio.alfabeto, 'GSM-7');

    const conTilde = E.pedazosSMS(largo.replace('como estas', 'cómo estás'));
    assert.equal(conTilde.alfabeto, 'UCS-2');
    assert.ok(conTilde.pedazos > limpio.pedazos,
      'una tilde no cambió el número de pedazos: la cuenta está mal');
    assert.deepEqual(conTilde.culpables.sort(), ['á', 'ó']);
  });

  test('un emoji solo también encarece el mensaje entero', () => {
    const sin = E.pedazosSMS('Hola Maria, tu pago es hoy.');
    const con = E.pedazosSMS('Hola Maria, tu pago es hoy. 🙂');
    assert.equal(sin.alfabeto, 'GSM-7');
    assert.equal(con.alfabeto, 'UCS-2');
  });

  test('sinTildes deja el texto en el alfabeto barato, SIEMPRE', () => {
    /* Barrido: si algún carácter se escapa, el mensaje se encarece sin aviso. */
    const sucios = [
      'Hola José Muñoz 🙂 pagó $150.000',
      'Señora Ángela — su pago «vence» hoy…',
      'Niño André: ¿pagó? ¡Sí! ✅ 👍',
      'Comillas “curvas” y guion – largo',
      'Símbolos ± × ÷ € ™ © ® § ¶'
    ];
    for (const s of sucios) {
      const limpio = E.sinTildes(s);
      const m = E.pedazosSMS(limpio);
      assert.equal(m.alfabeto, 'GSM-7',
        'quedó fuera del alfabeto: ' + JSON.stringify(limpio) +
        ' (culpables: ' + m.culpables.join(' ') + ')');
    }
  });

  test('la ñ NO se quita — está en el alfabeto y quitarla cambia la palabra', () => {
    assert.equal(E.sinTildes('Muñoz cumplió un año'), 'Muñoz cumplio un año');
  });
});

describe('el dinero, dicho para una máquina (15-sep-2026)', () => {

  test('el monto hablado se entiende', () => {
    const casos = [
      [0, 'cero pesos'],
      [100, 'cien pesos'],
      [1000, 'mil pesos'],
      [50000, 'cincuenta mil pesos'],
      [150000, 'ciento cincuenta mil pesos'],
      [1000000, 'un millon de pesos'],
      [2000000, 'dos millones de pesos'],
      [1250000, 'un millon doscientos cincuenta mil pesos'],
      [21000, 'veintiun mil pesos'],
      [316500, 'trescientos dieciseis mil quinientos pesos']
    ];
    for (const [n, esperado] of casos) {
      assert.equal(E.montoHablado(n), esperado, 'con ' + n);
    }
  });

  test('«un millon de pesos» lleva DE, «un millon doscientos mil» no', () => {
    /* Lo lee una máquina en voz alta. «Un millon pesos» suena a robot roto y el
       cliente cuelga antes de oír la fecha. */
    assert.match(E.montoHablado(1000000), / de pesos$/);
    assert.match(E.montoHablado(3000000), / de pesos$/);
    assert.equal(/ de pesos$/.test(E.montoHablado(1200000)), false);
    assert.equal(/ de pesos$/.test(E.montoHablado(150000)), false);
  });

  test('lo hablado nunca trae cifras ni puntos', () => {
    /* Un punto lo lee como decimal: «ciento cincuenta punto cero cero cero». */
    for (let n = 1000; n <= 5000000; n += 7777) {
      const h = E.montoHablado(n);
      assert.equal(/\d/.test(h), false, 'quedaron dígitos en: ' + h + ' (de ' + n + ')');
    }
  });

  test('lo escrito lleva los puntos de miles', () => {
    assert.equal(E.montoEscrito(150000), '$150.000');
    assert.equal(E.montoEscrito(1250000), '$1.250.000');
    assert.equal(E.montoEscrito(900), '$900');
  });
});

describe('los celulares (15-sep-2026)', () => {

  test('acepta las formas en que la gente escribe un celular', () => {
    for (const v of ['3001112233', '300 111 2233', '+57 300 111 2233',
                     '57 3001112233', '(300) 111-2233', '573001112233']) {
      assert.equal(E.celular10(v), '3001112233', 'con ' + JSON.stringify(v));
      assert.equal(E.celular57(v), '573001112233', 'con ' + JSON.stringify(v));
    }
  });

  test('rechaza lo que no es un celular colombiano', () => {
    /* Un fijo, un número corto o un campo vacío no se mandan: la plataforma
       cobra el intento igual y el mensaje no llega a nadie. */
    for (const v of ['6012345678', '123', '', null, undefined, 'no tiene',
                     '2001112233', '30011122']) {
      assert.equal(E.celular10(v), '', 'dejó pasar ' + JSON.stringify(v));
    }
  });
});

describe('el archivo que se sube (15-sep-2026)', () => {

  const casos = [
    { socioId: 's1', nombre: 'MARIA FERNANDA GÓMEZ', telefono: '300 111 2233',
      saldo: 150000, fecha_pago: '2026-09-15', plantilla: 'venceHoy' },
    { socioId: 's2', nombre: 'José Muñoz', telefono: '+57 311 222 3344',
      saldo: 1250000, fecha_pago: '2026-09-10', plantilla: 'mora' },
    { socioId: 's3', nombre: 'Sin Celular', telefono: '6012345678',
      saldo: 90000, fecha_pago: '2026-09-15', plantilla: 'venceHoy' }
  ];

  test('el que no tiene celular válido NO entra, y se dice quién', () => {
    const r = E.filasDeEnvio(casos, { telefono: '3009998877' });
    assert.equal(r.filas.length, 2);
    assert.equal(r.sinTelefono.length, 1);
    assert.equal(r.sinTelefono[0].nombre, 'Sin Celular');
  });

  test('cada fila trae el monto de ESE cliente — que es lo que Joan pidió', () => {
    const r = E.filasDeEnvio(casos, { telefono: '3009998877' });
    assert.equal(r.filas[0].monto, 150000);
    assert.equal(r.filas[1].monto, 1250000);
    assert.match(r.filas[0].mensaje_sms, /\$150\.000/);
    assert.match(r.filas[1].mensaje_sms, /\$1\.250\.000/);
    assert.match(r.filas[1].mensaje_voz, /un millon doscientos cincuenta mil pesos/);
  });

  test('se saluda por el primer nombre, bien escrito', () => {
    const r = E.filasDeEnvio(casos, { telefono: '3009998877' });
    assert.equal(r.filas[0].nombre, 'Maria');
    assert.equal(r.filas[1].nombre, 'Jose');
  });

  test('el CSV se separa por punto y coma — el Excel en español lo pide', () => {
    /* Con comas, un Windows en español abre todo el archivo en una sola
       columna y Joan sube una base rota. */
    const r = E.filasDeEnvio(casos, { telefono: '3009998877' });
    const csv = E.aCSV(r.filas);
    const lineas = csv.replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lineas[0], E.COLUMNAS.join(';'));
    assert.equal(lineas.length, 3, 'se esperaban cabecera y dos filas');
  });

  test('el archivo lleva BOM — si no, las ñ salen como Ã±', () => {
    const csv = E.aCSV(E.filasDeEnvio(casos, {}).filas);
    assert.equal(csv.charCodeAt(0), 0xFEFF, 'sin BOM: Excel va a romper los nombres');
  });

  test('un texto con punto y coma NO parte la fila', () => {
    /* Si un mensaje o un nombre trae el separador, la fila se corre una columna
       y el celular termina en la columna del monto. */
    const r = E.filasDeEnvio([{ socioId: 'x', nombre: 'Ana; Luisa', telefono: '3001112233',
                                saldo: 50000, fecha_pago: '2026-09-15', plantilla: 'venceHoy' }],
                             { telefono: '3009998877' });
    const csv = E.aCSV(r.filas);
    const cuerpo = csv.replace(/^﻿/, '').trim().split('\r\n')[1];
    assert.match(cuerpo, /"Ana; Luisa"/, 'el punto y coma no quedó protegido');
    /* Y la fila sigue teniendo el mismo número de campos que la cabecera. Se
       cuenta leyendo el CSV de verdad, no con una expresión regular: la
       primera versión de esta línea usaba una y contaba 16 donde había 12,
       o sea que acusaba al archivo de un defecto que era de la prueba. */
    assert.equal(leerCSV(cuerpo).length, E.COLUMNAS.length,
      'la fila quedó con ' + leerCSV(cuerpo).length + ' campos y la cabecera tiene ' +
      E.COLUMNAS.length);
    /* Y el nombre limpio llega entero a su columna. */
    assert.equal(leerCSV(cuerpo)[3], 'Ana; Luisa');
    assert.equal(leerCSV(cuerpo)[2], 'Ana', 'el primer nombre arrastró el punto y coma');
  });

  test('el celular va como texto de 10 dígitos y también con el 57', () => {
    /* Las dos formas porque cada plataforma pide la suya, y adivinar mal es
       mandar cero mensajes y enterarse al día siguiente. */
    const r = E.filasDeEnvio(casos, {});
    assert.equal(r.filas[0].celular, '3001112233');
    assert.equal(r.filas[0].celular_57, '573001112233');
  });
});

describe('lo que la ley prohíbe decir (15-sep-2026)', () => {

  /* Ley 2300 de 2023. Le aplica a Joan en persona: el artículo 1 nombra «todas
     las personas naturales y jurídicas que adelanten gestiones de cobranzas» y
     el artículo 4 repite «INCLUYENDO A LAS PERSONAS NATURALES». */

  test('ningún mensaje pregunta por qué no pagó (artículo 7)', () => {
    const todos = Object.values(E.SMS).concat(Object.values(E.VOZ));
    for (const t of todos) {
      assert.equal(/por qu[eé] no (pag|ha pag)/i.test(t), false,
        'un mensaje pregunta por qué no pagó: ' + t);
      assert.equal(/qu[eé] pas[oó]/i.test(t), false, 'un mensaje pide explicaciones: ' + t);
    }
  });

  test('ningún mensaje nombra a un tercero (artículo 4)', () => {
    /* Prohibido contactar —o mencionar— referencias, familia o empleador. */
    const todos = Object.values(E.SMS).concat(Object.values(E.VOZ));
    for (const t of todos) {
      assert.equal(/referencia|familiar|tu jefe|su jefe|empleador|codeudor/i.test(t), false,
        'un mensaje nombra a un tercero: ' + t);
    }
  });

  test('ningún mensaje amenaza ni anuncia consecuencias', () => {
    const todos = Object.values(E.SMS).concat(Object.values(E.VOZ));
    for (const t of todos) {
      assert.equal(/reporta|centrales de riesgo|datacredito|abogado|juridic|embarg|demand/i.test(t),
        false, 'un mensaje amenaza: ' + t);
    }
  });

  test('todos dicen quién escribe, y en las primeras palabras', () => {
    /* Un SMS de un número desconocido sin remitente se borra sin leer, y la
       plata del envío se pierde entera. */
    const todos = Object.values(E.SMS).concat(Object.values(E.VOZ));
    for (const t of todos) {
      assert.ok(t.indexOf('Tu Garantia') > -1 && t.indexOf('Tu Garantia') < 60,
        'no se identifica pronto: ' + t);
    }
  });
});

describe('el CRM baja la base sin saltarse la ley (15-sep-2026)', () => {

  const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');

  test('la lista pasa por tanda.js, no por un filtro propio', () => {
    /* Si el CRM armara su propia lista, habría dos lecturas de la Ley 2300 en
       el repositorio y el día que una cambie la otra seguiría contestando lo
       de antes. Es la enfermedad que este proyecto lleva semanas quitándose. */
    const i = CRM.indexOf('function pantallaEnvioMasivo');
    assert.ok(i > -1, 'no existe pantallaEnvioMasivo');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction bajarCSVEnvio', i));
    assert.match(cuerpo, /armarTanda\(/,
      'la pantalla arma la lista por su cuenta en vez de preguntarle a tanda.js');
  });

  test('el CRM carga los dos módulos', () => {
    assert.match(CRM, /<script src="tanda\.js">/);
    assert.match(CRM, /<script src="\.\.\/app\/cobranza-envio\.js">/);
  });

  test('quien tiene acuerdo VIGENTE no entra a la lista', () => {
    /* Hay pacto y una fecha. Escribirle de mora lo rompe, y encima gasta el
       único contacto que la ley permite esa semana. */
    const i = CRM.indexOf('function casosDeCobroHoy');
    assert.ok(i > -1);
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction horarioLegalHoy', i));
    assert.match(cuerpo, /if \(acuerdoVigente\(p\)\) return;/,
      'se le va a escribir de cobro a gente con acuerdo vigente');
  });

  test('fuera del horario legal se avisa, y se dice que cuenta la hora de LLEGADA', () => {
    const i = CRM.indexOf('function pantallaEnvioMasivo');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction bajarCSVEnvio', i));
    assert.match(cuerpo, /horarioLegalHoy/);
    assert.match(cuerpo, /hora en que <b>llega<\/b>/,
      'no se advierte que la ley mira la hora de llegada, no la de programación');
  });

  test('hay cómo anotar el contacto, o el tope semanal se rompe solo', () => {
    /* Si Joan manda por fuera y el CRM no se entera, mañana le vuelve a ofrecer
       la misma gente y el segundo mensaje ya es el ilegal. */
    const i = CRM.indexOf('function marcarEnviados');
    assert.ok(i > -1, 'no hay forma de anotar que ya se contactó');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction renderCred', i));
    assert.match(cuerpo, /gestiones\.push/, 'no escribe la gestión');
    assert.match(cuerpo, /canal: canal === 'voz' \? 'voz' : 'sms'/,
      'no guarda por qué canal se contactó, y el tope semanal es POR CANAL');
    assert.match(cuerpo, /confirm\(/,
      'anota el contacto sin preguntar: si Joan no alcanzó a enviar, los pierde una semana');
  });

  test('el archivo que se baja lleva la fecha en el nombre', () => {
    const i = CRM.indexOf('function bajarCSVEnvio');
    const cuerpo = CRM.slice(i, CRM.indexOf('\n/* Anotar el contacto', i));
    assert.match(cuerpo, /cobranza-' \+ hoyISO\(\)/,
      'dos bases del mismo mes se pisan en la carpeta de descargas');
  });
});

describe('la tanda y el archivo, juntos de verdad (15-sep-2026)', () => {

  const T = require('../panel/tanda.js');

  /* Estas pruebas CORREN las dos piezas juntas. Las de arriba leen el código
     fuente del CRM, y eso no alcanzó: la primera versión pedía `t.listos`, que
     no existe —el campo se llama `pendientes`— así que la lista salía VACÍA
     siempre y ninguna prueba de texto lo vio. Lo cazó abrir el CRM en un
     navegador. Una prueba que lee no sustituye a una que ejecuta. */

  const HOY = '2026-09-15';
  const armar = casos => T.armarTanda(casos, {
    hoy: HOY, horario: { ok: true }, tipo: 'cobro', grupo: 'sms', saltados: []
  });
  const caso = (id, socioId, nombre, saldo, gestiones) => ({
    id, socioId, socio: { id: socioId, nombre, gestiones: gestiones || [] },
    telefono: '3001112233', nombre, saldo, fecha_pago: HOY,
    plantilla: 'venceHoy', prioridad: 1, orden: HOY
  });

  test('el campo que devuelve armarTanda es el que lee el CRM', () => {
    /* El defecto exacto, convertido en centinela. */
    const t = armar([caso('c1', 's1', 'Ana', 100000)]);
    assert.ok(Array.isArray(t.pendientes), 'armarTanda ya no devuelve «pendientes»');
    assert.equal(t.pendientes.length, 1);

    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const i = CRM.indexOf('function pantallaEnvioMasivo');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction bajarCSVEnvio', i));
    const usa = cuerpo.match(/\bt\.(\w+)\s*\|\|\s*\[\]/);
    assert.ok(usa, 'el CRM ya no toma la lista de la tanda como se esperaba');
    assert.ok(Object.prototype.hasOwnProperty.call(t, usa[1]),
      'el CRM lee «t.' + usa[1] + '», que armarTanda NO devuelve: la lista sale vacía');
  });

  test('una persona con DOS créditos vencidos es UN mensaje', () => {
    /* El tope de la Ley 2300 es por consumidor, no por crédito. Mandarle dos
       SMS a la misma señora el mismo día es la infracción más fácil de cometer
       y la más fácil de probar en su contra: quedan los dos mensajes. */
    const t = armar([
      caso('c1', 's9', 'Pedro Ruiz', 80000),
      caso('c2', 's9', 'Pedro Ruiz', 40000)
    ]);
    assert.equal(t.pendientes.length, 1, 'se le va a escribir dos veces a la misma persona');
    const r = E.filasDeEnvio(t.pendientes, { telefono: '3009998877' });
    assert.equal(r.filas.length, 1);
  });

  test('a quien ya se le escribió esta semana por WhatsApp NO se le manda SMS', () => {
    /* Es la trampa de mandar por una plataforma de afuera: el artículo 3
       prohíbe usar VARIOS CANALES en la misma semana, así que un SMS hoy
       encima del WhatsApp del lunes es la infracción, no el segundo mensaje. */
    const t = armar([
      caso('c1', 's1', 'Ana', 100000),
      caso('c2', 's2', 'Pedro', 90000,
        [{ fecha: '2026-09-14', hora: '2026-09-14T10:00:00Z', canal: 'whatsapp', tipo: 'cobro' }])
    ]);
    const nombres = t.pendientes.map(c => c.nombre);
    assert.deepEqual(nombres, ['Ana'],
      'entró alguien a quien ya se contactó esta semana por otro canal');
    assert.equal(t.fuera.length, 1);
  });

  test('fuera del horario legal NO sale ni una fila', () => {
    const t = T.armarTanda([caso('c1', 's1', 'Ana', 100000)], {
      hoy: HOY, horario: { ok: false, motivo: 'domingo' },
      tipo: 'cobro', grupo: 'sms', saltados: []
    });
    const r = E.filasDeEnvio(t.pendientes || [], { telefono: '3009998877' });
    assert.equal(r.filas.length, 0,
      'se armó una base para enviar en un horario en que la ley no deja cobrar');
  });

  test('el archivo completo sale bien de punta a punta', () => {
    const t = armar([
      caso('c1', 's1', 'MARIA FERNANDA GÓMEZ', 150000),
      caso('c2', 's2', 'José Muñoz', 1250000)
    ]);
    const r = E.filasDeEnvio(t.pendientes, { telefono: '3009998877' });
    const lineas = E.aCSV(r.filas).replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lineas.length, 3, 'cabecera + dos clientes');

    const f1 = leerCSV(lineas[1]);
    const col = n => f1[E.COLUMNAS.indexOf(n)];
    assert.equal(col('celular'), '3001112233');
    assert.equal(col('celular_57'), '573001112233');
    assert.equal(col('nombre'), 'Maria');
    assert.equal(col('monto'), '150000');
    assert.equal(col('pedazos_sms'), '1');
    assert.match(col('mensaje_sms'), /Hola Maria, somos Tu Garantia\. Hoy vence tu pago de \$150\.000/);
    assert.match(col('mensaje_voz'), /ciento cincuenta mil pesos/);
  });
});
