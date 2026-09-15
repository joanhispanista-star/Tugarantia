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
    assert.match(col('mensaje_sms'), /Tu Garantia: Maria, hoy vence tu pago de \$150\.000/);
    assert.match(col('mensaje_sms'), /Responde SALIR/, 'falta el aviso de salida, que en Colombia es obligatorio');
    assert.match(col('mensaje_voz'), /ciento cincuenta mil pesos/);
  });
});

describe('la salida, que en Colombia es obligatoria (15-sep-2026)', () => {

  /* La tabla de cobertura de Infobip dice, para Colombia, «Opt Out mandatory:
     Yes». No es cortesía: es condición para que la operadora entregue. Y
     coincide con la Ley 2300, artículo 2: el deudor elige por qué canales se le
     puede contactar. */

  test('TODO mensaje lleva el aviso de salida', () => {
    const casos = [{ socioId:'s1', nombre:'Ana', telefono:'3001112233', saldo:50000,
                     fecha_pago:'2026-09-15', plantilla:'venceHoy' }];
    for (const p of Object.keys(E.SMS)) {
      const r = E.filasDeEnvio([{ ...casos[0], plantilla: p }], { telefono:'3009998877' });
      assert.match(r.filas[0].mensaje_sms, /Responde SALIR/,
        'la plantilla ' + p + ' sale sin aviso de salida');
      assert.match(r.filas[0].mensaje_voz, /no desea recibir/,
        'el mensaje de voz de ' + p + ' sale sin forma de salirse');
    }
  });

  test('CON el aviso, todas siguen cabiendo en UN SMS — peor caso', () => {
    /* El aviso cuesta 36 caracteres. Las plantillas de la primera versión de
       hoy ya no cabían con él (178 contra un límite de 160) y hubo que
       reescribirlas. Si alguien las alarga otra vez, esta prueba lo dice. */
    /* El peor caso de verdad: nombre largo, monto de ocho cifras, fecha larga y
       DOCE creditos. La primera version de esta prueba no pasaba `cuantos`, asi
       que medía la plantilla con el hueco «{cuantos}» sin rellenar — nueve
       caracteres donde en la vida real van uno o dos. Una prueba que mide el
       texto sin rellenar no mide el mensaje que se manda. */
    const vars = { nombre:'Inmaculada', saldo:'$12.750.000', cuantos:'12',
                   fecha_pago:'30 de septiembre', telefono:'3001112233' };
    for (const [clave, t] of Object.entries(E.SMS)) {
      const m = E.pedazosSMS(E.sinTildes(E.aplicar(t + E.SALIDA_SMS, vars)));
      assert.equal(m.pedazos, 1,
        clave + ' con el aviso de salida ocupa ' + m.pedazos + ' SMS (' + m.caracteres + ')');
      /* Y con MARGEN. Hoy dos plantillas distintas llegaron a 161 y a 178 —una
         y dieciocho por encima— y las dos veces el sintoma fue el mismo: el
         doble de la factura. Diez caracteres de aire es lo que separa «cabe» de
         «cabe hasta que alguien cambie una palabra». */
      assert.ok(m.caracteres <= E.SMS_UN_PEDAZO_GSM7 - 10,
        clave + ' cabe por poco: ' + m.caracteres + ' de ' + E.SMS_UN_PEDAZO_GSM7 +
        '. Un cambio pequeno la parte en dos y se paga doble.');
    }
  });

  test('el aviso vive en UN solo sitio, no copiado en cada plantilla', () => {
    /* Cinco copias son cinco sitios donde puede faltar, y el día que falte en
       una, esa es la que la operadora rechaza. */
    for (const t of Object.values(E.SMS)) {
      assert.equal(/SALIR/.test(t), false,
        'una plantilla trae el aviso escrito adentro: se va a desincronizar');
    }
    assert.match(E.SALIDA_SMS, /SALIR/);
  });

  test('quien dijo SALIR NO vuelve a entrar a la lista', () => {
    /* Sin esto el aviso sería pedirle permiso a alguien y desoírlo por escrito. */
    const casos = [
      { socioId:'s1', nombre:'Ana', telefono:'3001112233', saldo:50000,
        fecha_pago:'2026-09-15', plantilla:'venceHoy' },
      { socioId:'s2', nombre:'Pedro', telefono:'3155556677', saldo:80000,
        fecha_pago:'2026-09-15', plantilla:'venceHoy' }
    ];
    const r = E.filasDeEnvio(casos, { telefono:'3009998877', sinSMS:['3155556677'] });
    assert.equal(r.filas.length, 1);
    assert.equal(r.salidos.length, 1);
    assert.equal(r.salidos[0].nombre, 'Pedro');
  });

  test('se reconoce el número aunque esté escrito de otra forma', () => {
    /* En una cartera vieja el mismo celular está escrito de cinco maneras. Si
       la comparación fuera de texto, el que pidió salir volvería a entrar por
       tener un espacio de más. */
    const caso = [{ socioId:'s2', nombre:'Pedro', telefono:'3155556677', saldo:80000,
                    fecha_pago:'2026-09-15', plantilla:'venceHoy' }];
    for (const forma of ['3155556677', '315 555 6677', '+57 315 555 6677', '573155556677']) {
      const r = E.filasDeEnvio(caso, { telefono:'3009998877', sinSMS:[forma] });
      assert.equal(r.filas.length, 0, 'no lo reconoció escrito como ' + JSON.stringify(forma));
    }
  });

  test('el CRM saca la lista de salidos de la FICHA del socio', () => {
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const i = CRM.indexOf('function pantallaEnvioMasivo');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction bajarCSVEnvio', i));
    assert.match(cuerpo, /sinSMS: salieron/, 'la pantalla no excluye a los que pidieron salir');
    assert.match(cuerpo, /x\.noSMS/, 'no lee la marca de la ficha');
    assert.ok(CRM.indexOf('function cambiarSalidaSMS') > -1,
      'no hay forma de marcar que alguien pidió salir');
  });

  test('el CRM avisa que en Colombia el remitente NO puede decir «Tu Garantia»', () => {
    /* La tabla de Infobip: «Alphanumeric Senders Supported: LOCAL No,
       INTERNATIONAL No». El cliente ve un código corto de números, así que el
       texto TIENE que decir quién escribe. Si Joan no lo sabe, va a pelear con
       la plataforma para poner su nombre de remitente y a perder la tarde. */
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const i = CRM.indexOf('function pantallaEnvioMasivo');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction bajarCSVEnvio', i));
    assert.match(cuerpo, /NO va a ver/);
    assert.match(cuerpo, /codigo corto/);
  });

  test('cada mensaje dice quién escribe en las primeras palabras', () => {
    /* Y ahora importa el doble: el remitente es un número desconocido. */
    for (const t of Object.values(E.SMS)) {
      assert.ok(t.indexOf('Tu Garantia') === 0,
        'no empieza diciendo quién escribe: ' + t);
    }
  });
});

describe('el total de TODOS los créditos (15-sep-2026)', () => {

  /* Joan: «quiero poder seleccionar la informacion de lo que debe en total con
     todos los creditos». No es comodidad: la Ley 2300 obliga a UN contacto por
     persona, así que a quien debe tres créditos se le escribe UNA vez. Si ese
     mensaje hablara de un solo crédito, el cliente paga ese, cree que quedó al
     día, y a la semana recibe otro cobro que no entiende — y tendría razón. */

  const base = { socioId: 's1', nombre: 'Pedro Ruiz', telefono: '3155556677',
                 fecha_pago: '2026-09-15' };

  test('con UN crédito, el mensaje habla de ese pago', () => {
    const r = E.filasDeEnvio([Object.assign({}, base, { saldo: 80000, cuantos: 1, plantilla: 'venceHoy' })],
                             { telefono: '3009998877' });
    assert.match(r.filas[0].mensaje_sms, /tu pago de \$80\.000/);
    assert.equal(r.filas[0].monto, 80000);
    assert.equal(r.filas[0].creditos, 1);
  });

  test('con TRES, el mensaje dice cuántos son y cuánto SUMAN', () => {
    const r = E.filasDeEnvio([Object.assign({}, base, { saldo: 80000, saldo_total: 295000,
                                                        cuantos: 3, plantilla: 'mora' })],
                             { telefono: '3009998877' });
    assert.match(r.filas[0].mensaje_sms, /tus 3 pagos vencidos suman \$295\.000/);
    assert.equal(r.filas[0].monto, 295000, 'la fila lleva el monto de UN crédito, no el total');
    assert.equal(r.filas[0].creditos, 3);
  });

  test('y la voz dice el total EN PALABRAS', () => {
    const r = E.filasDeEnvio([Object.assign({}, base, { saldo: 80000, saldo_total: 295000,
                                                        cuantos: 3, plantilla: 'mora' })],
                             { telefono: '3009998877' });
    assert.match(r.filas[0].mensaje_voz, /doscientos noventa y cinco mil pesos/);
    assert.equal(/295\.000/.test(r.filas[0].mensaje_voz), false,
      'la voz lleva la cifra con puntos: una máquina la lee como decimal');
  });

  test('sin saldo_total se usa el del crédito — no se inventa un total', () => {
    /* La forma peligrosa de equivocarse: que un dato ausente valga cero, y el
       cliente reciba «tus 3 pagos suman $0». */
    const r = E.filasDeEnvio([Object.assign({}, base, { saldo: 80000, cuantos: 3, plantilla: 'mora' })],
                             { telefono: '3009998877' });
    assert.equal(r.filas[0].monto, 80000);
    assert.equal(/\$0\b/.test(r.filas[0].mensaje_sms), false);
  });

  test('plantillaDe elige la de VARIOS solo cuando de verdad hay varios', () => {
    assert.equal(E.plantillaDe({ plantilla: 'venceHoy', cuantos: 1 }), 'venceHoy');
    assert.equal(E.plantillaDe({ plantilla: 'venceHoy', cuantos: 2 }), 'variasHoy');
    assert.equal(E.plantillaDe({ plantilla: 'mora', cuantos: 1 }), 'mora');
    assert.equal(E.plantillaDe({ plantilla: 'mora', cuantos: 4 }), 'variasMora');
    assert.equal(E.plantillaDe({ plantilla: 'moraTemprana', cuantos: 2 }), 'variasMora');
    assert.equal(E.plantillaDe({}), 'venceHoy');
    assert.equal(E.plantillaDe(null), 'venceHoy');
  });
});

describe('las dos pestañas nuevas (15-sep-2026)', () => {

  const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
  const trozo = (desde, hasta) => {
    const i = CRM.indexOf(desde);
    assert.ok(i > -1, 'no existe ' + desde);
    const j = CRM.indexOf(hasta, i + desde.length);
    return CRM.slice(i, j > -1 ? j : i + 4000);
  };

  test('las pestañas existen y el enrutador las conoce', () => {
    for (const v of ['cobranzas', 'comercial']) {
      assert.ok(CRM.indexOf('data-v="' + v + '"') > -1, 'falta el botón de ' + v);
      assert.ok(CRM.indexOf('id="v-' + v + '"') > -1, 'falta la sección de ' + v);
      assert.ok(CRM.indexOf("if(v==='" + v + "')") > -1, 'el enrutador no conoce ' + v);
    }
  });

  test('COBRANZAS suma los créditos por PERSONA antes de armar los casos', () => {
    /* Si se sumara después, tanda.js ya se habría quedado con uno solo y el
       total sería el de ese crédito. */
    const c = trozo('function casosDeCobroHoy', 'function horarioLegalHoy');
    assert.ok(c.indexOf('totales[k] = (totales[k] || 0) + totalCiclo(p)') > -1,
      'no suma los créditos por persona');
    assert.ok(c.indexOf('saldo_total: totales[s.id]') > -1);
    assert.ok(c.indexOf('cuantos: cuantos[s.id]') > -1);
    assert.ok(c.indexOf('acuerdoVigente(p)) return;') > -1,
      'se le cobra a gente con acuerdo vigente');
  });

  test('COBRANZAS no deja AGREGAR a alguien que el filtro dejó fuera', () => {
    /* Los topes de la Ley 2300 no tienen casilla de «yo autorizo». La tabla de
       excluidos se pinta sin checkbox a propósito. */
    const c = trozo('function renderCobranzas', 'function marcarCob');
    const i = c.indexOf('cajaF.innerHTML');
    assert.ok(i > -1);
    assert.equal(/type=checkbox/.test(c.slice(i)), false,
      'la tabla de excluidos trae casillas: se puede agregar a alguien que la ley excluyó');
  });

  test('COMERCIAL exige autorización — es habeas data, no Ley 2300', () => {
    /* La Ley 2300 regula el COBRO. Invitar no es cobrar. Lo que aplica es el
       Decreto 1377 art. 5: autorización nueva cuando la finalidad cambia. Y la
       política publicada de Tu Garantía cierra con «Para nada más». */
    const c = trozo('function prospectosParaInvitar', 'function autorizarProspecto');
    assert.ok(c.indexOf('if (!g.autorizaInvitacion)') > -1,
      'se invita a prospectos que no autorizaron');
    assert.ok(c.indexOf('habeas data') > -1);
    assert.ok(c.indexOf('ya es cliente tuyo') > -1);
    assert.ok(c.indexOf('ya abrio su cuenta') > -1);
  });

  test('marcar la autorización guarda la FECHA', () => {
    /* El día que la SIC pregunte «quién autorizó y cuándo», la respuesta tiene
       que existir. */
    const c = trozo('function autorizarProspecto', 'function renderComercial');
    assert.ok(c.indexOf('autorizaDesde = v ? hoyISO()') > -1);
    assert.ok(c.indexOf('confirm(') > -1, 'se marca sin preguntar');
  });

  test('la invitación lleva a la PUERTA, no a la app del socio', () => {
    /* Defecto encontrado abriendo el CRM en un navegador: mandaba a
       app/socio.html, que le pide al prospecto un código que no tiene. Habría
       llegado a una pantalla que le exige algo imposible. */
    assert.ok(CRM.indexOf("URL_PUERTA_DEF = 'https://tugarantia.net/play/'") > -1,
      'no existe la constante de la puerta pública');
    const c = trozo('function textoInvitacion', 'function marcarCom');
    assert.ok(c.indexOf('enlace: urlPuerta()') > -1,
      'la invitación sigue mandando a la app del socio');
  });

  test('enviar pide confirmación y dice que se cobra', () => {
    /* Un botón que manda cientos de mensajes de pago no puede dispararse de un
       clic distraído. */
    for (const fn of ['function enviarCobranzas', 'function enviarInvitaciones']) {
      const i = CRM.indexOf(fn);
      assert.ok(i > -1, 'falta ' + fn);
      const c = CRM.slice(i, i + 2600);
      assert.ok(c.indexOf('confirm(') > -1, fn + ' manda sin preguntar');
      assert.ok(/se cobra/i.test(c), fn + ' no avisa que cuesta plata');
    }
  });

  test('la llave de Infobip NO viaja por el navegador', () => {
    /* El CRM está publicado en internet. Una llave que llegue al navegador la
       lee cualquiera que abra el archivo, y con ella manda mensajes que Joan
       paga. El CRM pide «manda esto», nunca «manda esto con esta llave». */
    assert.equal(/infobip[_-]?(llave|key|token)\s*[:=]\s*['"][^'"]{8,}/i.test(CRM), false,
      'hay algo que parece una llave de Infobip escrita en el CRM');
    const c = CRM.slice(CRM.indexOf('function enviarCobranzas'),
                        CRM.indexOf('function enviarCobranzas') + 2600);
    assert.equal(/'App /.test(c), false,
      'el CRM arma la cabecera de autorización: la llave estaría en el navegador');
    assert.ok(c.indexOf("rpc('enviar_mensajes'") > -1, 'el CRM no manda por la nube');
  });

  test('anotar el contacto guarda el CANAL — el tope semanal es por canal', () => {
    const c = trozo('function anotarContactos', 'COMERCIAL');
    assert.ok(c.indexOf("canal: canal === 'voz' ? 'voz' : 'sms'") > -1);
    assert.ok(c.indexOf('gestiones.push') > -1);
  });
});

describe('la migración de Infobip (15-sep-2026)', () => {

  const SQL2 = fs.readFileSync(path.join(RAIZ, 'base', '20260918_infobip.sql'), 'utf8');

  test('la llave NO está escrita en el archivo', () => {
    /* Una llave en un archivo del repositorio es una llave publicada. El UPDATE
       que la pone está comentado, y lo corre Joan. */
    const vivas = SQL2.split('\n').filter(l => !l.trim().startsWith('--'));
    assert.equal(/infobip_llave'\s*,\s*'[^']{8,}'/.test(vivas.join('\n')), false,
      'hay una llave de verdad escrita en la migración');
  });

  test('enviar es VOLATILE — si no, PostgREST no manda nada', () => {
    const i = SQL2.indexOf('function public.enviar_mensajes');
    assert.ok(i > -1);
    assert.match(SQL2.slice(i, i + 400), /\bvolatile\b/);
  });

  test('la ventana legal se comprueba ANTES de mandar', () => {
    const i = SQL2.indexOf('function public.enviar_mensajes');
    const c = SQL2.slice(i, SQL2.indexOf('$$;', i));
    const iVentana = c.indexOf('ventana_de_cobro()');
    const iPost = c.indexOf('net.http_post');
    assert.ok(iVentana > -1 && iPost > -1);
    assert.ok(iVentana < iPost, 'se manda antes de mirar si se puede cobrar a esta hora');
  });

  test('deliveryTimeWindow va en UTC, no en hora de Bogotá', () => {
    /* Bogotá es UTC-5. Ponerle 7 a 19 en UTC sería entregar entre las 2 de la
       mañana y las 2 de la tarde — justo fuera de la ley, y creyendo lo
       contrario. */
    assert.ok(SQL2.indexOf("'utc_desde', 12") > -1, 'la ventana entre semana no está en UTC');
    assert.ok(SQL2.indexOf("'utc_desde', 13") > -1, 'la ventana del sábado no está en UTC');
    assert.ok(SQL2.indexOf('deliveryTimeWindow') > -1, 'no se manda la ventana a Infobip');
  });

  test('la migración comprueba sola su propia ventana', () => {
    /* Con horas de verdad, al pegarla. Si alguien se equivoca de zona horaria,
       revienta ahí y no con mil mensajes ya mandados a medianoche. */
    assert.ok(SQL2.indexOf('deja cobrar a las 3 de la manana') > -1);
    assert.ok(SQL2.indexOf('deja cobrar en DOMINGO') > -1);
    assert.ok(SQL2.indexOf('deja cobrar el sabado despues de las 3') > -1);
  });

  test('hay un freno de cuántos se mandan de una', () => {
    /* Infobip no documenta un tope. Un error de programación que mande 50.000
       mensajes se paga igual. */
    assert.ok(SQL2.indexOf('> 500') > -1, 'no hay freno de cantidad');
  });

  test('la tabla de envíos queda con RLS y sin políticas', () => {
    assert.ok(SQL2.indexOf('alter table public.envios_mensajes enable row level security') > -1);
    assert.equal(/create policy[\s\S]*envios_mensajes/.test(SQL2), false);
  });
});

describe('a un prospecto no se le cobra $0 (15-sep-2026)', () => {

  /* Lo cazó abrir el CRM en un navegador y mirar lo que de verdad se armaba: al
     prospecto —que no debe nada— le salía «te recordamos tu pago de $0 el .»,
     con el monto en cero y la fecha vacía. Un cobro de cero pesos a alguien que
     no debe nada no es un mensaje raro: es la casa quedando como que no sabe con
     quién habla. */

  const prospecto = { socioId: 'x', nombre: 'Luis Prospecto', telefono: '3007778899' };

  test('las plantillas de VENTA no hablan de plata', () => {
    for (const clave of ['presentacion', 'invitacion']) {
      const t = E.SMS[clave];
      assert.ok(t, 'falta la plantilla de venta ' + clave);
      assert.equal(/\{saldo|\{fecha_pago|\{cuantos/.test(t), false,
        clave + ' habla de plata o de fechas: ' + t);
      assert.equal(/\{saldo|\{fecha_pago|\{cuantos/.test(E.VOZ[clave]), false,
        'la voz de ' + clave + ' habla de plata');
    }
  });

  test('un mensaje de venta NUNCA sale con $0 ni con una fecha vacía', () => {
    for (const clave of ['presentacion', 'invitacion']) {
      const r = E.filasDeEnvio([Object.assign({}, prospecto, { plantilla: clave })],
                               { telefono: '3001112233' });
      const sms = r.filas[0].mensaje_sms, voz = r.filas[0].mensaje_voz;
      for (const m of [sms, voz]) {
        assert.equal(/\$0\b/.test(m), false, clave + ' salió con $0: ' + m);
        assert.equal(/ el \.|el $/.test(m), false, clave + ' salió con la fecha vacía: ' + m);
        assert.equal(/\{\w+\}/.test(m), false, clave + ' dejó un hueco sin rellenar: ' + m);
      }
    }
  });

  test('y siguen cabiendo en UN SMS, con el aviso de salida', () => {
    const vars = { nombre: 'Inmaculada', telefono: '3001112233',
                   enlace: 'https://tugarantia.net/play/' };
    for (const clave of ['presentacion', 'invitacion']) {
      const m = E.pedazosSMS(E.sinTildes(E.aplicar(E.SMS[clave] + E.SALIDA_SMS, vars)));
      assert.equal(m.pedazos, 1, clave + ' ocupa ' + m.pedazos + ' SMS (' + m.caracteres + ')');
    }
  });

  test('una plantilla de VENTA no se convierte en «tienes 3 pagos»', () => {
    /* Un prospecto no tiene tres pagos. Si plantillaDe las convirtiera, un
       prospecto con datos sucios recibiría un cobro múltiple inventado. */
    assert.equal(E.plantillaDe({ plantilla: 'presentacion', cuantos: 3 }), 'presentacion');
    assert.equal(E.plantillaDe({ plantilla: 'invitacion', cuantos: 5 }), 'invitacion');
  });

  test('el CRM le propone al prospecto una de VENTA, no una de cobro', () => {
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const i = CRM.indexOf('function plantillaSMSDe');
    const c = CRM.slice(i, CRM.indexOf('\n}', i));
    assert.ok(c.indexOf("etapa === 'PC') return 'presentacion'") > -1,
      'al potencial cliente se le propone una plantilla de cobro');
    assert.ok(c.indexOf("etapa === 'CR') return 'invitacion'") > -1,
      'al registrado se le propone una plantilla de cobro');
  });

  test('un COBRO sin monto no se manda: se explica', () => {
    /* La otra mitad del mismo problema. Si la nube todavía no manda la plata
       (migración sin pegar), un SMS de cobro sin cifra gasta el contacto de la
       semana y no dice nada. */
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const i = CRM.indexOf('function mensajearEq');
    const c = CRM.slice(i, CRM.indexOf('\nfunction plantillaSMSDe', i));
    assert.ok(c.indexOf('p.saldo == null && p.saldo_total == null') > -1,
      'se manda un cobro aunque no se sepa el monto');
    assert.ok(c.indexOf('20260919_asesor.sql') > -1,
      'no se dice qué falta para que lleguen los montos');
  });
});
