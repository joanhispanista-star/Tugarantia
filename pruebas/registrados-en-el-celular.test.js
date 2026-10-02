/* ============================================================================
 * LOS REGISTRADOS EN EL CELULAR — la pestaña «Registrados» de panel/espejo.html
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/registrados-en-el-celular.test.js
 *
 * Joan quiere ver desde el celular a quien se registró. Lo que estas pruebas
 * cuidan, en orden de lo que más cuesta si se rompe:
 *
 *   1. LAS FOTOS NO LLEGAN AL TELÉFONO. Aunque la nube mandara de más (una
 *      función vieja, un error de alguien), la pantalla no pinta ni una
 *      imagen, ni la IP, ni el GPS. La selfie es dato biométrico (Ley 1581).
 *   2. NUNCA «VERIFICADO». Lo que hay es un cotejo con el código de barras, y
 *      solo informa cuando NO cuadra. Las píldoras van en ámbar, nunca verde.
 *   3. CUATRO SILENCIOS QUE NO SON EL MISMO: sin conectar, falta la función en
 *      la nube, no se pudo preguntar, y «no hay nadie». Solo el último puede
 *      decir «no hay nadie esperando».
 *   4. DESDE ACÁ NO SE APRUEBA NADA: se llama o se escribe, y lo demás se hace
 *      en el computador.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* Una cartera mínima, con una clienta cuya cédula va a repetir un registrado. */
function cartera() {
  return {
    socios: [{ id: 's1', numero: 7, nombre: 'Clienta Vieja Rqp', cedula: '1032456789',
      telefono: '3109998877', gestiones: [], ajusteGarantia: 0 }],
    prestamos: []
  };
}

/* La nube de mentira: la bajada no trae nada nuevo, el computador «no sé», y
   panel_registros contesta lo que diga cada prueba. */
function nube(registros) {
  return (url, cuerpo) => {
    if (url.endsWith('/rpc/panel_traer')) {
      return { status: 200, cuerpo: { completo: false, socios: [], creditos: [], respaldados: [], ajustes: [],
        servidor_ahora: '2026-09-15T15:30:00Z' } };
    }
    if (url.endsWith('/rpc/panel_registros')) {
      return typeof registros === 'function' ? registros(cuerpo) : registros;
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
const respuesta = (filas, nuevos) => ({ status: 200, cuerpo: {
  servidor_ahora: '2026-09-15T15:30:00Z', estado: 'nuevo',
  nuevos: nuevos == null ? filas.length : nuevos, pedidos_leidos: true, registros: filas } });

/* Dos personas. La primera trae todo lo que NO debe pintarse —una selfie, la
   huella con la IP y el GPS—, como si la nube mandara de más: la pantalla
   tiene que ignorarlo. */
const FILAS = [
  { id: 41, nombre: 'Rosa Registrada Wqe', cedula: '1032456789', telefono: '3001234567',
    creado_en: '2026-09-15T14:05:00Z', origen: 'abierto', app: 'tugarantia',
    ciudad: 'Bogotá', barrio: 'Kennedy',
    cotejo: { estado: 'no_cuadra', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: true },
    pedido: { monto: 300000, producto: 'quincenal', nota: 'para el arriendo', estado: 'nueva',
      creada_en: '2026-09-15T14:10:00Z' },
    selfie: 'data:image/jpeg;base64,QUJDREVGR0hJSktM', imagen: 'data:image/png;base64,TU5PUFFS',
    huella: { ip: '181.55.66.77', gps: { lat: 4.6, lng: -74.1 }, aparato: 'iPhone' } },
  { id: 42, nombre: '<img src=x onerror=alert(1)>Pedro', cedula: '80111222', telefono: '3157654321',
    creado_en: '2026-09-14T20:00:00Z', origen: 'abierto', app: 'platachat', ciudad: 'Soacha', barrio: '',
    cotejo: { estado: 'intacto', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false },
    pedido: null }
];

async function abrirConRegistros(registros, extra) {
  const e = abrirEspejo(Object.assign({ cartera: cartera(), sesion: true, red: nube(registros) }, extra || {}));
  await asentar();
  return e;
}
async function abrirPestania(e) {
  e.tocarPestania('registrados');
  e.correrPendientes();
  await asentar();
  return e.cuerpo();
}

describe('las fotos no llegan al teléfono, aunque la nube mande de más', () => {

  test('ni una imagen, ni base64, ni la IP, ni el GPS en la pantalla', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    assert.ok(h.includes('Rosa Registrada Wqe'), 'la tarjeta no salió: la prueba no está mirando nada');
    assert.ok(!/<img/i.test(h), 'la pantalla pinta una etiqueta <img>');
    ['data:image', 'base64', 'QUJDREVGR0hJSktM', 'TU5PUFFS', '181.55.66.77', '-74.1', 'iPhone']
      .forEach(x => assert.ok(!h.includes(x), 'la pantalla pinta «' + x + '»'));
  });

  test('lo dice con todas las letras, arriba', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const t = textoPlano(await abrirPestania(e));
    assert.match(t, /Las fotos, el cotejo y abrirle la ficha se hacen en el computador\./);
    assert.match(t, /Las fotos de la cédula y la selfie no viajan al celular/);
  });

  test('y no se guardan en el teléfono: ni los nombres de los registrados', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    await abrirPestania(e);
    const todo = Object.values(e.almacen).join('\n');
    assert.ok(!todo.includes('Rosa Registrada'), 'los registrados quedaron guardados en el localStorage');
    assert.ok(!todo.includes('3001234567'));
  });
});

describe('el cotejo se llama cotejo, y solo habla cuando hay algo que mirar', () => {

  test('nunca «verificado», ni en la tarjeta ni en ningún lado de la pestaña', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    assert.ok(!/verificad/i.test(h), 'la pestaña dice «verificado»');
  });

  test('«no cuadra» y «cédula repetida» salen en ámbar', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    assert.match(h, /<span class="pill mora">No cuadra con el código de su cédula<\/span>/);
    assert.match(h, /<span class="pill mora">Cédula repetida<\/span>/);
  });

  test('un cotejo «intacto» no pinta nada: el silencio es lo normal', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    const i = h.indexOf('Pedro');
    const tarjeta = h.slice(h.lastIndexOf('<div class="card ap">', i), h.indexOf('</div></div>', h.indexOf('Llamar', i)));
    assert.ok(!/pill mora/.test(tarjeta), 'un cotejo intacto se pintó como si hubiera algo que mirar');
    assert.ok(!/intacto|coincide/i.test(tarjeta), 'un cotejo intacto se pintó como un visto bueno');
  });

  test('menor de edad y documento imposible tienen su propia píldora', async () => {
    const fila = Object.assign({}, FILAS[1], { id: 43, nombre: 'Menor Prueba Zxc',
      cotejo: { estado: 'no_cuadra', menor: true, documento_imposible: true, cedula_repetida: false } });
    const e = await abrirConRegistros(respuesta([fila]));
    const h = await abrirPestania(e);
    assert.match(h, /pill mora">Su cédula dice que es menor de edad/);
    assert.match(h, /pill mora">Marcó otro documento/);
    assert.ok(!/No cuadra con el código/.test(h), 'con el motivo a la vista, el «no cuadra» genérico sobra');
  });

  test('en toda la página no hay una píldora verde ni azul de visto bueno', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    assert.ok(!/pill ok/.test(h), 'una píldora de «ok» en la bandeja se lee como «aprobado»');
  });
});

describe('cuatro silencios que no son el mismo', () => {

  test('sin conectar: no me ha llegado, y NO dice que no haya nadie', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('registrados');
    e.correrPendientes();
    const t = textoPlano(e.cuerpo());
    assert.match(t, /No me ha llegado ningún registro/);
    assert.match(t, /no quiere decir que no haya nadie esperando/);
    assert.ok(!/No hay nadie esperando/.test(t));
    assert.equal(e.llamadas.filter(l => /panel_registros/.test(l.url)).length, 0,
      'sin sesión no se pregunta nada');
  });

  test('falta la función en la nube (404): «falta un paso», con el archivo a pegar', async () => {
    const e = await abrirConRegistros({ status: 404, cuerpo: { code: 'PGRST202' } });
    const t = textoPlano(await abrirPestania(e));
    assert.match(t, /Falta un paso en la nube/);
    assert.match(t, /base\/20261002_panel_registros\.sql/);
    assert.match(t, /No quiere decir que no haya registrados/);
    assert.ok(!/No hay nadie esperando/.test(t));
    assert.equal(e.globo().hidden, true, 'sin la función no hay número que poner en la pestaña');
  });

  test('no se pudo preguntar (500): lo dice, y no afirma que no hay nadie', async () => {
    const e = await abrirConRegistros({ status: 500, cuerpo: 'se cayó' });
    const t = textoPlano(await abrirPestania(e));
    assert.match(t, /No pude traerlos/);
    assert.match(t, /no sé si hay alguien esperando/);
    assert.ok(!/No hay nadie esperando/.test(t));
  });

  test('vacío de verdad: la nube contestó que no hay nadie', async () => {
    const e = await abrirConRegistros(respuesta([], 0));
    const t = textoPlano(await abrirPestania(e));
    assert.match(t, /No hay nadie esperando/);
    assert.match(t, /Lo contestó la nube hoy a las/);
    assert.equal(e.globo().hidden, true);
  });

  test('mientras pregunta, dice que está preguntando', () => {
    const e = abrirEspejo({ cartera: cartera(), sesion: true, red: nube(respuesta(FILAS)) });
    e.tocarPestania('registrados');
    assert.match(textoPlano(e.cuerpo()), /Preguntando a la nube…/);
  });

  test('si una consulta falla después de una buena, lo de antes se queda con su hora', async () => {
    let falla = false;
    const e = await abrirConRegistros(() => (falla ? { status: 500, cuerpo: 'no' } : respuesta(FILAS)));
    await abrirPestania(e);
    falla = true;
    e.tocar('reg-traer');
    await asentar();
    const t = textoPlano(e.cuerpo());
    assert.match(t, /No pude traerlos/);
    assert.match(t, /Lo de abajo es lo que traje hoy a las/);
    assert.ok(t.includes('Rosa Registrada Wqe'));
  });
});

describe('lo que sí se hace desde acá: llamar o escribir', () => {

  test('cada tarjeta: nombre, cuándo, de dónde, qué pidió, y sus dos botones', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    const t = textoPlano(h);
    assert.match(t, /Rosa Registrada Wqe Se registró hoy a las .* · Bogotá · Kennedy/);
    assert.match(t, /Pidió \$300\.000 · quincenal/);
    assert.match(t, /«para el arriendo»/);
    assert.match(t, /No le veo ninguna solicitud de crédito/, 'sin solicitud a la vista no lo dice');
    assert.match(h, /href="https:\/\/wa\.me\/573001234567"/);
    assert.match(h, /href="tel:\+573001234567"/);
  });

  test('desde el celular no se aprueba, no se abre ficha y no se descarta', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    const acciones = new Set([...h.matchAll(/data-acc="([^"]+)"/g)].map(m => m[1]));
    acciones.forEach(a => assert.ok(['reg-traer', 'verficha'].includes(a),
      'la pestaña ofrece «' + a + '»: aprobar y abrir fichas se hace en el computador'));
    assert.ok(!/marcar_registro|fichaDesdeRegistro|descartar/i.test(h));
  });

  test('si ya es cliente tuyo, lo dice y lleva a su ficha', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    assert.match(h, /data-acc="verficha" data-id="s1">Ya es tu cliente: abrir CL-0007<\/button>/);
  });

  test('un nombre con código no corre: se escapa', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    const h = await abrirPestania(e);
    assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;Pedro'));
  });

  test('sin un celular de 10 dígitos no hay botón que no lleve a ninguna parte', async () => {
    const fila = Object.assign({}, FILAS[1], { id: 44, nombre: 'Sin Celular Bien', telefono: '12345' });
    const e = await abrirConRegistros(respuesta([fila]));
    const h = await abrirPestania(e);
    assert.match(textoPlano(h), /No dejó un celular de 10 dígitos/);
    assert.ok(!/tel:\+57/.test(h));
  });
});

describe('el número de nuevos en la pestaña', () => {

  test('sale con lo que contestó la nube, y para eso no se bajan los datos de nadie', async () => {
    const e = await abrirConRegistros(respuesta(FILAS, 3));
    assert.equal(e.globo().hidden, false);
    assert.match(e.globo().innerHTML, />3</);
    assert.match(e.globo().innerHTML, /nuevos/);
    const primera = e.llamadas.find(l => /panel_registros/.test(l.url));
    assert.ok(primera, 'el número no se pidió');
    assert.equal(primera.cuerpo.p_limite, 0, 'para pintar un número se bajaron los registros');
  });

  test('al abrir la pestaña sí se piden las tarjetas', async () => {
    const e = await abrirConRegistros(respuesta(FILAS));
    await abrirPestania(e);
    const ultima = e.llamadas.filter(l => /panel_registros/.test(l.url)).pop();
    assert.ok(ultima.cuerpo.p_limite > 0);
    assert.equal(ultima.cuerpo.p_estado, 'nuevo');
  });

  test('sin respuesta no hay número: un cero sin preguntar diría que no hay nadie', () => {
    const e = abrirEspejo({ cartera: cartera() });
    assert.equal(e.globo().hidden, true);
  });
});
