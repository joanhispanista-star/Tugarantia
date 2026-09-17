'use strict';
/* ==========================================================================
 * CARGAR BASES DE PROSPECTOS — 9 de septiembre de 2026
 *
 * Joan: «quiero que el CRM pueda ser alimentado con bases de datos y tenga una
 * forma de recibir archivos… que me organice los clientes por nombre y el
 * celular», y después: «la información de los competidores no la agregues,
 * solo teléfono y número de celular».
 *
 * Esa segunda frase es una REGLA DE DISEÑO, no una instrucción de uso: el
 * importador tiene que ser incapaz de traer un saldo o unos días de mora,
 * aunque el archivo los traiga y aunque alguien apriete todo. La mitad de este
 * archivo comprueba justamente eso.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../app/bases.js');

const hoja = (filas) => filas;

describe('leer el celular y el nombre', () => {

  test('el celular se lee por los ÚLTIMOS diez dígitos', () => {
    /* Las bases llegan con 57 adelante, con espacios, con guiones y con
       apóstrofes. El 57 no puede dejar a nadie afuera — misma regla que la
       identidad en puente.js. */
    ['573001112233', '3001112233', '+57 300 111 2233', '300-111-2233', "57 300'111'2233"]
      .forEach(v => assert.equal(B.celularDe(v), '3001112233', 'no leyó «' + v + '»'));
  });

  test('lo que NO es un celular colombiano se descarta', () => {
    ['', '123', '6012345678', '4001112233', 'no tiene', '0', '57']
      .forEach(v => assert.equal(B.celularDe(v), '', '«' + v + '» pasó como celular'));
  });

  test('el nombre llega en Mayúscula Inicial, no gritado', () => {
    /* Un WhatsApp que empieza «Hola JENNY PAOLA» se lee como un robot. */
    assert.equal(B.nombreDe('JENNY PAOLA  GÓMEZ'), 'Jenny Paola Gómez');
    assert.equal(B.nombreDe('  maría   del carmen '), 'María Del Carmen');
    assert.equal(B.nombreDe('NANCY VÉLEZ 3001112233'), 'Nancy Vélez');
    assert.equal(B.nombreDe(''), '');
  });
});

describe('adivinar qué columna es cuál, mirando el contenido', () => {

  test('encuentra celular y nombre aunque el encabezado esté en chino', () => {
    /* Un encabezado puede estar en otro idioma, o no estar, o mentir. Los datos
       no. Por eso se mira el CONTENIDO. */
    const f = hoja([
      ['日期', '客户姓名', '手机号'],
      ['Fecha', 'Nombre', 'Teléfono'],
      ['2026-09-01', 'MIGUEL ANGEL TORRES', '573001112233'],
      ['2026-09-01', 'ANDREA GÓMEZ PARRA', '573009998877']
    ]);
    const c = B.detectarColumnas(f);
    assert.equal(c.celular, 2);
    assert.equal(c.nombre, 1);
    assert.equal(c.encabezado, 2, 'no reconoció que había DOS filas de encabezado');
  });

  test('NO confunde el nombre de la app con el nombre de la persona', () => {
    /* Encontrado probando contra una base real: la columna con «PlataX»
       repetido 500 veces le ganaba a la del nombre, porque tenía más letras.
       Un nombre de persona tiene dos cosas que un rótulo no: varias palabras, y
       ser distinto en casi cada fila. */
    const f = hoja([
      ['ID', 'APP', 'CLIENTE', 'CEL'],
      ['1', 'PlataX', 'MIGUEL ANGEL TORRES', '573001112233'],
      ['2', 'PlataX', 'ANDREA GÓMEZ PARRA', '573009998877'],
      ['3', 'PlataX', 'LUZ MARINA CASTAÑO', '573005550000'],
      ['4', 'PlataX', 'JORGE ELIÉCER RUIZ', '573012223344']
    ]);
    assert.equal(B.detectarColumnas(f).nombre, 2, 'eligió la columna de la app como nombre');
  });

  test('sin ninguna columna de celular, lo dice en vez de inventar', () => {
    const c = B.detectarColumnas(hoja([['a', 'b'], ['hola', 'mundo']]));
    assert.equal(c.celular, -1);
  });

  test('una hoja vacía no revienta', () => {
    assert.equal(B.detectarColumnas([]).celular, -1);
    assert.equal(B.detectarColumnas(null).celular, -1);
  });
});

describe('LA REGLA: solo nombre y celular, nunca nada más', () => {

  const conPlata = hoja([
    ['Nombre', 'Celular', 'Monto restante', 'Días de mora', 'APP'],
    ['MIGUEL TORRES', '573001112233', '1270445', '17', 'PlataX'],
    ['ANDREA GÓMEZ', '573009998877', '1050077', '3', 'Morlong']
  ]);

  test('lo que sale de la revisión tiene DOS campos y punto', () => {
    /* El centinela de la instrucción de Joan. Si mañana alguien le agrega un
       campo a esto «para tenerlo por si acaso», el saldo de un cliente ajeno
       entra al CRM y esta prueba se cae. */
    const c = B.detectarColumnas(conPlata);
    const r = B.revisarBase(conPlata, c, { socios: [], prospectos: [] });
    assert.equal(r.nuevos.length, 2);
    r.nuevos.forEach(p => assert.deepEqual(Object.keys(p).sort(), ['celular', 'nombre'],
      'el importador trajo campos de más: ' + Object.keys(p).join(', ')));
  });

  test('ningún saldo ni día de mora sobrevive al importador', () => {
    const c = B.detectarColumnas(conPlata);
    const r = B.revisarBase(conPlata, c, { socios: [], prospectos: [] });
    const texto = JSON.stringify(r.nuevos);
    ['1270445', '1050077', 'PlataX', 'Morlong']
      .forEach(x => assert.ok(texto.indexOf(x) === -1, 'se coló «' + x + '» en lo importado'));
  });

  test('pero AVISA que el archivo traía datos financieros ajenos', () => {
    /* No bloquea: avisa. Quien decide es Joan, pero decide sabiendo lo que
       tiene en las manos. */
    const c = B.detectarColumnas(conPlata);
    const r = B.revisarBase(conPlata, c, { socios: [], prospectos: [] });
    assert.ok(r.senalesFinancieras.length >= 2,
      'no avisó que el archivo traía saldos y mora de otra empresa');
    assert.ok(r.senalesFinancieras.indexOf('mora') >= 0);
  });

  test('una base limpia NO dispara el aviso', () => {
    const limpia = hoja([['CEL', 'NOMBRE', 'INFO'],
                         ['573001112233', 'NANCY VÉLEZ', 'aplica']]);
    const c = B.detectarColumnas(limpia);
    assert.deepEqual(B.revisarBase(limpia, c, { socios: [], prospectos: [] }).senalesFinancieras, []);
  });
});

describe('qué pasa antes de cargar: la revisión', () => {

  const base = hoja([
    ['CEL', 'NOMBRE'],
    ['573001112233', 'NANCY VÉLEZ'],
    ['573001112233', 'NANCY VELEZ'],          // repetida dentro del propio archivo
    ['573009998877', 'LUIS TORRES'],
    ['no tiene', 'SIN CELULAR'],
    ['573005550000', 'ANA GÓMEZ']
  ]);

  test('cuenta lo que va a pasar SIN hacerlo', () => {
    const c = B.detectarColumnas(base);
    const r = B.revisarBase(base, c, {
      socios: [{ telefono: '3009998877' }],       // Luis ya es cliente
      prospectos: [{ celular: '3005550000' }]     // Ana ya estaba en la base
    });
    assert.equal(r.nuevos.length, 1, 'debería entrar solo Nancy');
    assert.equal(r.nuevos[0].nombre, 'Nancy Vélez');
    assert.equal(r.yaClientes, 1, 'no reconoció al que ya es cliente');
    assert.equal(r.repetidos, 2, 'la repetida del archivo y la que ya era prospecto');
    assert.equal(r.sinCelular, 1);
  });

  test('reconoce al cliente por CUALQUIERA de sus tres teléfonos', () => {
    /* La ficha guarda telefono, telefono2 y whatsappNumero. Mirar solo el
       primero volvería a cargar como prospecto a alguien que ya es cliente. */
    const f = hoja([['CEL', 'NOMBRE'], ['573018889900', 'LUIS TORRES']]);
    const c = B.detectarColumnas(f);
    const r = B.revisarBase(f, c, { socios: [{ telefono: '3001112233', telefono2: '3018889900' }], prospectos: [] });
    assert.equal(r.yaClientes, 1);
    assert.equal(r.nuevos.length, 0, 'volvió a cargar a un cliente como prospecto');
  });

  test('rescata el celular aunque esté en otra columna de esa fila', () => {
    /* Una base de 226 con 8 filas corridas es una base con 8 personas perdidas. */
    const f = hoja([['CEL', 'NOMBRE'],
                    ['573001112233', 'NANCY VÉLEZ'],
                    ['', 'LUIS TORRES 573009998877']]);
    const c = B.detectarColumnas(f);
    const r = B.revisarBase(f, c, { socios: [], prospectos: [] });
    assert.equal(r.nuevos.length, 2, 'perdió la fila con el celular corrido');
  });

  test('la revisión no toca lo que le pasan', () => {
    const f = JSON.parse(JSON.stringify(base));
    const antes = JSON.stringify(f);
    B.revisarBase(f, B.detectarColumnas(f), { socios: [], prospectos: [] });
    assert.equal(JSON.stringify(f), antes);
  });
});

describe('leer un CSV', () => {

  test('adivina el separador: en Colombia Excel exporta con punto y coma', () => {
    const a = B.leerCSV('CEL;NOMBRE\n573001112233;NANCY VÉLEZ');
    assert.deepEqual(a[1], ['573001112233', 'NANCY VÉLEZ']);
    const b = B.leerCSV('CEL,NOMBRE\n573001112233,NANCY VÉLEZ');
    assert.deepEqual(b[1], ['573001112233', 'NANCY VÉLEZ']);
  });

  test('respeta las comillas y las comas de adentro', () => {
    const a = B.leerCSV('NOMBRE,CEL\n"GÓMEZ PARRA, ANDREA",573001112233');
    assert.deepEqual(a[1], ['GÓMEZ PARRA, ANDREA', '573001112233']);
  });

  test('se come el BOM que le pone Excel al principio', () => {
    const a = B.leerCSV('﻿CEL,NOMBRE\n573001112233,NANCY');
    assert.equal(a[0][0], 'CEL', 'el BOM se quedó pegado al primer encabezado');
  });

  test('las líneas vacías no cuentan como filas', () => {
    assert.equal(B.leerCSV('CEL,NOMBRE\n\n573001112233,NANCY\n\n\n').length, 2);
  });
});

describe('el archivo es puro y no llama a nadie', () => {
  test('sin red, sin almacenamiento y sin reloj de pared', () => {
    const fs = require('node:fs'), path = require('node:path');
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'app', 'bases.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.ok(!/fetch\(|localStorage|new Date\(\s*\)/.test(codigo),
      'bases.js dejó de ser puro');
    /* Y nada de CDN: este módulo lo carga el CRM, que tiene TODA la cartera de
       Joan en memoria. Un script de un servidor ajeno ahí podría leerla. */
    assert.ok(!/https?:\/\//.test(codigo), 'bases.js trajo un script de afuera');
  });
});

/* ==========================================================================
 * SIN NOMBRE ES MEJOR QUE CON UNO INVENTADO — 17 de septiembre de 2026
 *
 * Joan trajo nueve reportes de cobranza para cargarlos como prospectos. El
 * detector de columnas escogía bien cuando el archivo traía titular, pero
 * cuando NO lo traía escogía igual: la mejor columna de un montón malo. En dos
 * de los nueve el ganador fue la columna de OBSERVACIÓN, y entraban personas
 * llamadas «Pse», «Ya Pago», «Antes Pm» y «Buzon».
 *
 * Un WhatsApp que empieza «Hola Pse» es exactamente el defecto que este
 * proyecto ya cometió una vez —los mensajes que decían «Tu usuario: {usuario}»
 * durante semanas— y que 809 pruebas en verde no vieron.
 *
 * LOS TRES UMBRALES SE MIDIERON contra las nueve bases de verdad, y separan con
 * más del doble de margen:
 *
 *     columna              variedad   dos palabras   cobertura
 *     nombres de verdad    0,68–1,00    0,99–1,00     0,60–1,00
 *     notas y observación  0,01–0,21    0,48–1,00     0,72–1,00
 *     nombre del asesor    0,03         0,90–1,00     1,00
 *     una celda suelta     1,00         1,00          0,003
 *
 * La VARIEDAD es la que parte el agua: una lista de personas es casi toda
 * distinta, una de notas se repite, y la del asesor tiene tres valores.
 * ======================================================================== */
describe('el nombre se lee, no se inventa (17-sep-2026)', () => {

  /* Una hoja como las de verdad: App, celular, id de orden, y la columna que
     se quiera poner a competir. */
  const hojaCon = (cuarta) => {
    const filas = [['App', '#Telefono', 'ID orden', 'CUARTA']];
    for (let i = 0; i < 200; i++) {
      filas.push(['LuckyPlata', '5731' + String(10000000 + i), '11522601' + i, cuarta(i)]);
    }
    return filas;
  };

  test('una columna de OBSERVACIONES no puede pasar por nombres', () => {
    /* Es el caso real: «pse», «ya pago», «antes 2pm», «no contesta». Tienen dos
       palabras y alguna variedad, pero se repiten — que es lo que un nombre no
       hace. MUTANTE QUE CAZA: quitar el umbral de variedad. */
    const notas = ['no contesta', 'ya pago', 'pago prorroga', 'buzon apagado',
                   'no se contacta', 'renuente incumplido'];
    const filas = hojaCon(i => notas[i % notas.length]);
    const cols = B.detectarColumnas(filas);
    assert.equal(cols.nombre, -1,
      'eligió la columna de observaciones como nombres: entrarían personas ' +
      'llamadas «Ya Pago» y el primer WhatsApp diría «Hola Ya Pago»');
  });

  test('una columna con el nombre del ASESOR tampoco', () => {
    /* Tres asesores repartidos en cuatrocientas filas. Son nombres de persona
       de verdad, pero no son los del prospecto. Los caza la variedad. */
    const asesores = ['Laura Ruiz', 'Ginna Owalle', 'Karina Barreto'];
    const filas = hojaCon(i => asesores[i % 3]);
    assert.equal(B.detectarColumnas(filas).nombre, -1,
      'metió el nombre del asesor como nombre del prospecto');
  });

  test('una sola celda de texto suelta no gana el puesto', () => {
    /* Sin mínimo de cobertura, UNA celda saca variedad 1,00 y dos palabras
       1,00, y se lleva la columna con una fila de doscientas. Se descubrió
       probando el arreglo de arriba, no antes. */
    const filas = hojaCon(i => (i === 0 ? 'Titulo Suelto' : ''));
    assert.equal(B.detectarColumnas(filas).nombre, -1,
      'una celda suelta se llevó la columna de nombres');
  });

  test('y una columna de nombres DE VERDAD sí se reconoce', () => {
    /* El otro lado del interruptor: tres umbrales que no dejan pasar nada no
       sirven de nada. */
    const nombres = ['Laura Camila Ordoñez Gomez', 'Juan Carlos Henao Hinestroza',
                     'Maria Eugenia Valencia Parra', 'Tania Julieth Guacaneme Ortigoza'];
    const filas = hojaCon(i => nombres[i % 4] + ' ' + i);   // variados, como en la vida
    const cols = B.detectarColumnas(filas);
    assert.equal(cols.nombre, 3, 'dejó de reconocer una columna de nombres de verdad');
  });

  test('con nombres repetidos de verdad (la base grande) también', () => {
    /* La base de 27.000 filas tiene 16.580 nombres con variedad 0,68: hay gente
       que aparece varias veces y nombres comunes que se repiten. El umbral está
       en 0,5 justamente para que esa base entre. */
    const pilas = [];
    for (let i = 0; i < 300; i++) pilas.push('Nombre Apellido ' + (i % 200));  // variedad ≈ 0,67
    const filas = hojaCon(i => pilas[i % pilas.length]);
    assert.notEqual(B.detectarColumnas(filas).nombre, -1,
      'la base grande, con nombres repetidos de verdad, se quedó sin nombres');
  });

  test('sin nombre NO es un fallo: la ficha entra con su celular', () => {
    /* Es la decisión que hace que todo lo de arriba sea seguro. Mejor una lista
       de celulares sin nombre que una con nombres inventados. */
    const notas = ['buzon', 'no contesta', 'sms enviado'];
    const filas = hojaCon(i => notas[i % 3]);
    const cols = B.detectarColumnas(filas);
    const r = B.revisarBase(filas, cols, { socios: [], prospectos: [] });
    assert.ok(r.nuevos.length > 150, 'se perdieron las filas por no tener nombre');
    assert.ok(r.nuevos.every(x => x.celular && !x.nombre),
      'entró algún nombre donde no había ninguno');
  });
});
