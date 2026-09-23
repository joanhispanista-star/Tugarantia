'use strict';
/* ==========================================================================
 * EL CHAT CON EL EQUIPO — 22 de septiembre de 2026
 *
 * Joan: «el chat tambien debe funcionar para yo hablar con los asesores de
 * cobranza o con el gerente».
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTE ARCHIVO SUJETA, Y POR QUÉ CADA COSA
 *
 * 1. QUE SEA OTRA TABLA. En `mensajes` la conversación se identifica por
 *    `cedula`, y esa llave es la del CLIENTE — `llave_de_sesion` devuelve su
 *    cédula si vinculó y su CELULAR si no. Un asesor también se identifica por
 *    celular. Juntarlos sería poner dos cosas distintas bajo la misma llave y
 *    confiar en que nunca coincidan: hoy no coinciden porque `asesor_crear`
 *    prohíbe volver empleado a un cliente, pero entonces la seguridad de toda
 *    la bandeja queda colgando de esa prohibición.
 *
 * 2. QUE NADIE VEA EL HILO DE OTRO. Las dos funciones del asesor no reciben un
 *    parámetro que diga «de quién»: el celular sale de la sesión. La pregunta
 *    no tiene dónde escribirse, y hay centinela que revienta si algún día se le
 *    añade uno.
 *
 * 3. QUE LA BANDEJA TRAIGA A TODOS. Una que solo muestre a quien ya escribió no
 *    sirve para EMPEZAR una conversación, que es literalmente lo que pidió.
 *
 * 4. Y QUE CON LA CLAVE NO SE LE PUEDA ESCRIBIR A UN NÚMERO CUALQUIERA, o la
 *    tabla se vuelve un buzón abierto con el nombre de Joan encima.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922r_el_chat_con_el_equipo.sql')
  .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const funcion = nombre => {
  const i = CRM.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
};

describe('es otra tabla, y no por gusto', () => {

  test('el chat del equipo NO vive en `mensajes`', () => {
    assert.match(SQL, /create table if not exists public\.mensajes_equipo/,
      'se metió el chat del equipo en la tabla de los clientes: dos cosas ' +
      'distintas bajo la misma llave');
  });

  test('con RLS y sin políticas, como el resto', () => {
    assert.match(SQL, /alter table public\.mensajes_equipo enable row level security/);
    assert.equal(/create policy[^;]*mensajes_equipo/.test(SQL), false,
      'le pusieron una política: se entra solo por las funciones');
  });

  test('y guarda lo que las cosas SON, no lo que el pintor entiende', () => {
    /* Si la tabla guardara 'socio', la base diría «socio» de un asesor: una
       mentira escrita en el esquema, que es donde más caro sale. */
    assert.match(SQL, /check \(de in \('miembro', 'jefe'\)\)/,
      'la tabla guarda el vocabulario del pintor en vez del de la realidad');
  });
});

describe('la traducción para el pintor', () => {

  test('se devuelve socio/panel, que es lo que chat.js entiende', () => {
    assert.match(SQL, /case when m\.de = 'jefe' then 'panel' else 'socio' end/,
      'sin traducir, el pintor pone todas las burbujas del mismo lado');
  });

  test('y chat.js NO se tocó: los dos lados siguen siendo los de siempre', () => {
    /* La gracia del diseño es esta. Si hubiera habido que añadir autores al
       pintor, el chat de los clientes habría heredado el cambio. */
    assert.equal(CHAT.ladoDe('panel'), 'negocio');
    assert.equal(CHAT.ladoDe('socio'), 'socio');
    assert.equal(typeof CHAT.AUTORES.jefe, 'undefined',
      'se le añadió un autor a chat.js: el chat de los clientes hereda el cambio');
  });

  test('la bandeja usa los nombres de campo que listaHTML espera', () => {
    /* Con otro nombre la bandeja se pinta igual y sin hora — el peor fallo
       posible, porque se ve bien. */
    assert.match(SQL, /'ultimo_en', u\.ultimo_en/,
      'la fecha viaja con otro nombre: la bandeja saldría sin hora y nadie lo notaría');
    assert.match(SQL, /'cedula',\s*e\.celular/,
      'la llave del hilo no se llama como el pintor la pide');
  });

  test('y se ordena por columnas, no por una cadena armada', () => {
    /* «10» cae entre «1» y «2»: con diez sin leer, el orden se rompe. */
    assert.match(SQL, /order by \(coalesce\(u\.sin_leer, 0\) > 0\) desc/,
      'se ordena concatenando el contador: se rompe con diez sin leer');
  });
});

describe('nadie ve el hilo de otro', () => {

  test('las dos del asesor no reciben a quién', () => {
    assert.match(SQL, /function public\.equipo_chat_leer\(p_desde bigint default 0\)/,
      'equipo_chat_leer recibe algo más que el desde: ahí cabe pedir el hilo ajeno');
    assert.match(SQL, /function public\.equipo_chat_escribir\(p_texto text\)/,
      'equipo_chat_escribir recibe a quién: podría escribir en el hilo de otro');
  });

  test('y hay centinela que lo vigila contando los argumentos', () => {
    /* La primera versión comparaba el tipo con texto y recibía «p_desde
       bigint» — con el nombre del parámetro delante. Se cazó a sí misma. */
    assert.match(SQL, /select pronargs from pg_proc/,
      'el centinela compara tipos como texto: se caza a sí mismo');
  });

  test('la migración lo comprueba con DOS asesores, no con uno', () => {
    assert.match(SQL, /FALLO 4 GRAVE: un asesor ve el hilo de otro/,
      'no se comprueba lo único que no se puede fallar aquí');
  });

  test('las de sesión están cerradas a la llave pública', () => {
    assert.match(SQL, /leer el chat del equipo quedo abierto sin sesion/);
    assert.match(SQL, /escribir en el chat del equipo quedo abierto sin sesion/);
  });
});

describe('la bandeja de Joan sirve para EMPEZAR, no solo para contestar', () => {

  test('trae a todo el equipo, tenga o no mensajes', () => {
    assert.match(SQL, /FALLO 5: la bandeja no trae a todo el equipo/,
      'no se comprueba: una bandeja que solo muestra a quien ya escribió no ' +
      'sirve para lo que Joan pidió');
  });

  test('y con la clave NO se le escribe a un número cualquiera', () => {
    assert.match(SQL, /FALLO 7 GRAVE: se le escribio a alguien que no es del equipo/,
      'la tabla sería un buzón abierto con el nombre de Joan encima');
    assert.match(SQL, /se le puede escribir a cualquier numero: la tabla seria un buzon abierto/,
      'el centinela no vigila esa reja');
  });

  test('abrir el hilo marca lo del asesor como visto', () => {
    assert.match(SQL, /FALLO 6b: abrir el hilo no marco como visto/);
  });
});

describe('las dos pantallas', () => {

  test('el asesor tiene su entrada en el menú, con contador', () => {
    assert.match(CRM, /onclick="irEquipo\('jefe'\)"/, 'no hay por dónde entrar');
    assert.match(CRM, /id="sinLeerJefe"/,
      'sin contador, un mensaje de Joan llega y el asesor no se entera');
  });

  test('y el mapa del menú la conoce, o el botón no se enciende', () => {
    assert.match(CRM, /whatsapp: 'Mi WhatsApp', jefe: 'Mensajes'/,
      'la entrada nueva hereda el fallo del mapa: el menú se apaga entero');
  });

  test('el hilo del asesor se pinta con yo:socio', () => {
    /* En SU pantalla el de este lado es él. Con 'negocio' vería sus propios
       mensajes del lado de Joan. */
    assert.match(funcion('pintarHiloJefe'), /yo: 'socio'/,
      'el asesor vería sus mensajes del lado equivocado');
  });

  test('y el vistazo periódico NO apaga el contador sin que nadie lea', () => {
    /* `equipo_chat_leer` MARCA como visto lo que devuelve. Un vistazo contra
       el hilo entero apagaría el contador solo. Por eso se pide desde el
       último id conocido. */
    const f = funcion('vigilarJefeEq');
    assert.match(f, /p_desde: _jefeUltimo/,
      'el vistazo pide el hilo entero: marcaría como leído lo que nadie leyó');
  });

  test('Joan tiene su bandeja aparte de la de clientes', () => {
    assert.match(CRM, /id="eqBandeja"/, 'no hay bandeja del equipo');
    assert.match(CRM, /Un hilo con cada uno\. Lo que le digas a uno no lo ve otro/,
      'no se dice que es uno a uno: Joan podría creer que escribe a todos');
  });

  test('y su hilo se pinta con yo:negocio', () => {
    assert.match(funcion('cargarHiloEquipo'), /yo:'negocio'/);
  });

  test('con la migración sin correr, se dice cuál falta', () => {
    assert.match(funcion('renderChatEquipo'), /20260922r_el_chat_con_el_equipo\.sql/,
      'un 404 saldría como un fallo de red y se perdería la tarde');
  });

  test('y se le dice a Joan que eso lo lee solo esa persona', () => {
    assert.match(funcion('abrirChatEquipo'), /Sus compañeros no lo ven/,
      'sin decirlo, Joan no sabe si lo que escribe es privado');
  });
});
