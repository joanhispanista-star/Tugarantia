'use strict';
/* ==========================================================================
 * FOTOS EN EL CHAT CON EL EQUIPO — 22 de septiembre de 2026
 *
 * Joan: «agrega las fotos al chat del crm».
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTE ARCHIVO GUARDA, Y POR QUÉ NO ES REPETIR OTRO
 *
 * El chat con los CLIENTES tuvo fotos esta misma tarde, y en el camino salieron
 * cuatro cosas que costaron caro. Este archivo existe para que no vuelvan a
 * salir aquí — y para que, si alguien reescribe una de las dos mitades, la
 * prueba diga cuál se quedó atrás.
 *
 *   1. La fuente se comprueba ENTERA. El primer CHECK del chat de clientes solo
 *      exigía que empezara por `data:image/`, y eso dejaba pasar
 *      `data:image/png;base64,AAAA" onerror="…`. Con esa cadena en un atributo,
 *      el guión corría dentro del CRM y se llevaba la clave de Joan.
 *   2. La MINIATURA también: sin ella la burbuja sale como «un adjunto que no
 *      cargó», que es justo lo que invita a tocarla. Era el cebo.
 *   3. El tope lleva VENTANA, o el mensaje 61 no entra nunca más.
 *   4. Y hay CORTACIRCUITO: todos los demás topes son por persona, y un tope
 *      por persona protege de una persona.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922s_fotos_en_el_chat_del_equipo.sql')
  .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const funcion = nombre => {
  const i = CRM.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
};

describe('las cuatro lecciones del chat de clientes, aplicadas desde el día uno', () => {

  test('1 · la fuente se comprueba ENTERA, no solo el principio', () => {
    assert.match(SQL, /imagen ~ '\^data:image\/\[a-z\+\]\{2,12\};base64,\[A-Za-z0-9\+\/=\]\+\$'/,
      'el CHECK mira solo el principio: entra una fuente que se sale del atributo');
    assert.match(SQL, /FALLO 6c GRAVE: entro una fuente que se sale del atributo/,
      'no se comprueba el ataque que costó caro esta tarde');
  });

  test('2 · y la miniatura también, que era el cebo', () => {
    assert.match(SQL, /miniatura ~ '\^data:image\//);
    assert.match(SQL, /FALLO 6d GRAVE: entro una miniatura envenenada/);
  });

  test('3 · el tope lleva ventana: no es un callejón sin salida', () => {
    assert.match(SQL, /f\.creado_en > now\(\) - interval '30 days'/,
      'el tope vuelve a ser perpetuo: la foto 61 no entraría nunca más');
    assert.match(SQL, /el tope volvio a ser perpetuo/, 'no hay centinela que lo vigile');
  });

  test('4 · y hay cortacircuito sobre el total', () => {
    assert.match(SQL, /pg_total_relation_size\('public\.fotos_equipo'\) > 50 \* 1024 \* 1024/,
      'sin freno global, las fotos del equipo pueden dejar la base de solo lectura');
  });

  test('el reparto de los 500 MB está escrito en un sitio', () => {
    /* Tres tablas se reparten el mismo plan gratis. Si cada una pone su número
       sin mirar a las otras, la suma se pasa y nadie lo nota hasta que la base
       se vuelve de solo lectura.

       Se lee el archivo CRUDO a propósito: esto vive en la cabecera, que es
       comentario, y `SQL` los quita para mirar solo lo que se ejecuta. */
    const CRUDO = leer('base/20260922s_fotos_en_el_chat_del_equipo.sql');
    assert.match(CRUDO, /chat_fotos`\s+150 MB/,
      'no se dice cuánto se lleva cada tabla: la suma se pasa sin que nadie lo vea');
    assert.match(CRUDO, /registro_en_vivo`\s+20 MB/);
  });
});

describe('nadie abre la foto de un compañero', () => {

  test('la del equipo comprueba de quién es', () => {
    /* El id es correlativo: sin la reja, cualquiera con sesión pide la 1, la 2,
       la 3 y se baja lo que le mandaron a los demás. */
    assert.match(SQL, /m\.celular = yo\.celular/,
      'equipo_foto_ver no comprueba el dueño y el id es correlativo');
    assert.match(SQL, /FALLO 4 GRAVE: un asesor abrio la foto de otro/,
      'no se comprueba con DOS asesores, que es lo único que lo demuestra');
  });

  test('mandar y ver son solo con sesión', () => {
    assert.match(SQL, /mandar fotas al equipo quedo abierto sin sesion/);
    assert.match(SQL, /ver las fotos del equipo quedo abierto sin sesion/);
  });

  test('y la tabla va con RLS y sin políticas', () => {
    assert.match(SQL, /alter table public\.fotos_equipo enable row level security/);
    assert.equal(/create policy[^;]*fotos_equipo/.test(SQL), false);
  });
});

describe('el hilo no baja la imagen entera', () => {

  test('trae el id y la miniatura, nunca la imagen', () => {
    /* Veinte mensajes con foto serían dos megas en cada apertura, en el celular
       de alguien que está en la calle. */
    assert.match(SQL, /'foto', fo\.id, ''miniatura'', fo\.miniatura|''foto'', fo\.id/,
      'el hilo no trae la foto');
    assert.match(SQL, /el hilo baja la imagen entera en cada apertura/,
      'no hay centinela que lo vigile');
    assert.match(SQL, /FALLO 2c GRAVE: la imagen ENTERA viaja en el hilo/);
  });

  test('y borrar la conversación se lleva las fotos', () => {
    /* Lo cumple el esquema, sin que nadie tenga que acordarse de borrar en dos
       sitios. */
    assert.match(SQL, /references public\.mensajes_equipo\(id\) on delete cascade/);
    assert.match(SQL, /FALLO 7 GRAVE: se borro la conversacion y la foto quedo huerfana/);
  });
});

describe('las dos pantallas, con el visor que ya era seguro', () => {

  test('el asesor puede mandar y abrir', () => {
    assert.match(CRM, /id="jefeFoto"/, 'el asesor no tiene por dónde mandar una foto');
    assert.match(funcion('pintarHiloJefe'), /alVerFoto: 'verFotoJefe'/,
      'la miniatura saldría con el botón inerte');
  });

  test('y Joan también', () => {
    assert.match(CRM, /id="eqFoto"/, 'Joan no tiene por dónde mandar una foto');
    assert.match(funcion('cargarHiloEquipo'), /alVerFoto:'verFotoDelEquipo'/);
  });

  test('los dos visores usan mostrarFoto, que comprueba la fuente', () => {
    /* No se construye HTML en ninguno de los dos: `mostrarFoto` valida con
       CHAT.esFoto y asigna la fuente como PROPIEDAD. Es el arreglo que costó
       caro esta tarde y no se repite aquí. */
    assert.match(funcion('verFotoJefe'), /mostrarFoto\(j\.imagen\)/);
    assert.match(funcion('verFotoDelEquipo'), /mostrarFoto\(j\.imagen\)/);
    assert.equal(/document\.write/.test(funcion('verFotoJefe')), false,
      'volvió el document.write: es por donde entraba el guión');
  });

  test('y la fuente se sigue comprobando de verdad', () => {
    /* La reja vive en una sola función compartida. Si se cayera, los dos
       visores del equipo se caerían con ella — por eso se prueba aquí también. */
    assert.equal(CHAT.esFoto('data:image/png;base64,AAAA" onerror="alert(1)'), false);
    assert.equal(CHAT.esFoto('data:image/jpeg;base64,AAAA+/=='), true);
  });

  test('el tipo que declara el teléfono no decide', () => {
    /* Hay gestores de Android que lo mandan VACÍO sobre una foto perfecta, y el
       lienzo reencodifica a JPEG pase lo que pase. Decide el decodificador; el
       video se ataja antes solo para poder explicar por qué no cabe. */
    const f = funcion('mandarFotoJefe');
    assert.equal(/!\/\^image\\\//.test(f), false,
      'volvió el portero que se fía del tipo declarado');
    assert.match(f, /\/\^video\\\/\/\.test/);
  });

  test('se comprime igual que en el chat de clientes', () => {
    /* 900 px al 0,6 son unos 73 KB, que es el número con el que están hechas
       TODAS las cuentas de capacidad del proyecto. Cambiarlo aquí sin cambiar
       las cuentas sería mover el suelo sin avisar. */
    assert.match(funcion('mandarFotoJefe'), /fotoDeLienzoEq\(c, 900, 0\.6\)/);
    assert.match(funcion('mandarFotoJefe'), /fotoDeLienzoEq\(c, 240, 0\.5\)/);
  });

  test('cada rechazo del servidor dice algo distinto', () => {
    const f = funcion('subirFotoJefe');
    ['no_es_imagen', 'muy_grande', 'lleno', 'tope', 'muchos', 'sesion'].forEach(m =>
      assert.ok(f.indexOf("'" + m + "'") >= 0, 'el motivo «' + m + '» no se traduce'));
  });

  test('y se dice que solo lo ve Joan', () => {
    /* En el codigo va partida en dos cadenas de JS, asi que se buscan las dos
       mitades por separado: una prueba que exija la frase entera se cae en
       cuanto alguien reformatea la concatenacion. */
    assert.match(CRM, /Solo fotos: un video no cabe/,
      'no se avisa de que el video no entra');
    assert.match(CRM, /Lo ve únicamente Joan/,
      'el asesor no sabe quién va a ver esa foto');
  });
});
