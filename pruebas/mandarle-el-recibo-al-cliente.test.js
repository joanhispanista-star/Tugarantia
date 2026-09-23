'use strict';
/* ==========================================================================
 * MANDARLE EL RECIBO AL CLIENTE — Fase D, opción B
 * 23 de septiembre de 2026
 *
 * Joan cobra en la calle y quiere dejarle al cliente la foto del recibo.
 *
 * VA POR EL CHAT Y NO COLGADA DEL CRÉDITO, y no por comodidad: `sinFotos`
 * (panel/nube.js) quita la foto de un comprobante de la sincronización A
 * PROPÓSITO, porque la cartera viaja entera y en base64 pesa. Una foto guardada
 * dentro del crédito se quedaría en ESE teléfono y desaparecería al resembrar el
 * espejo — sin error y sin aviso.
 *
 * El chat ya tiene el transporte resuelto: su tabla, su tope, su cortacircuito y
 * su trozo de los 500 MB. El precio es que la foto queda en la conversación y no
 * colgada del crédito, y eso se dice en pantalla.
 *
 * ---------------------------------------------------------------------------
 * LO QUE HUBO QUE AÑADIR, Y QUE FALTABA DESDE SIEMPRE
 *
 * El chat con clientes tenía `chat_foto_sesion` (el cliente manda) y
 * `chat_foto_panel` (Joan mira). No había NINGUNA forma de que Joan mandara una
 * foto a un cliente — tampoco desde el computador. El chat del EQUIPO sí la
 * tenía. `chat_foto_responder` es la que faltaba, calcada de `equipo_foto_responder`.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');
const N = require('../panel/nube.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ESPEJO = leer('panel/espejo.html');
const SQL = leer('base/20260923_foto_al_chat_del_cliente.sql');
/* Sin comentarios: es donde vive la explicación, y donde un centinela
   descuidado encuentra justo lo que busca. Ya pasó cuatro veces hoy. */
const SQL_CODIGO = SQL.split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const funcion = (src, nombre) => {
  const i = src.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return src.slice(i, src.indexOf('\n}', i));
};

describe('la razón de fondo sigue siendo cierta', () => {

  test('sinFotos SÍ se lleva la foto de un comprobante', () => {
    /* Toda la decisión cuelga de este hecho. Si algún día dejara de ser verdad,
       lo correcto pasaría a ser colgarla del crédito, y esta prueba es la que
       avisa. */
    const r = N.sinFotos({ id: 'P1',
      comprobantes: [{ fecha: '2026-09-23', tipo: 'pago', monto: 1,
                       foto: 'data:image/jpeg;base64,AAAA' }] });
    assert.ok(!r.comprobantes[0].foto,
      'sinFotos ya no quita la foto del comprobante: ahora se PODRÍA colgar del ' +
      'crédito, y hay que revisar esta decisión y el aviso de la pantalla');
  });
});

describe('la función que faltaba', () => {

  test('existe, y escribe en la tabla del chat', () => {
    assert.match(SQL_CODIGO, /create or replace function public\.chat_foto_responder\(/);
    assert.match(SQL_CODIGO, /insert into public\.chat_fotos \(mensaje_id, miniatura, imagen\)/);
  });

  test('NO duplica la regla del canal: se la pide a chat_responder', () => {
    /* Copiar las tres reglas del canal sería tener dos verdades sobre dónde cae
       una respuesta, y la que se quedara vieja no avisaría. */
    assert.match(SQL_CODIGO, /nuevo := public\.chat_responder\(/,
      'volvió a insertarse el mensaje a mano: son dos verdades sobre el canal');
    assert.equal(/insert into public\.mensajes\b/.test(SQL_CODIGO), false);
  });

  test('la fuente se comprueba ENTERA, imagen y miniatura', () => {
    /* El 22-sep un CHECK que solo miraba el principio dejó pasar
       `data:image/png;base64,AAAA" onerror="…`. */
    assert.match(SQL_CODIGO, /\^data:image\/\[a-z\+\]\{2,12\};base64,\[A-Za-z0-9\+\/=\]\+\$/);
    assert.match(SQL_CODIGO, /mini !~ buena/);
    assert.match(SQL, /entró una fuente envenenada/, 'no se autocomprueba el ataque');
    assert.match(SQL, /entró una miniatura envenenada/);
  });

  test('tiene cortacircuito, y con el número del reparto escrito', () => {
    assert.match(SQL_CODIGO, /pg_total_relation_size\('public\.chat_fotos'\) > 150 \* 1024 \* 1024/,
      'sin freno global, las fotos pueden dejar la base de SOLO LECTURA');
    assert.match(SQL, /chat_fotos\s+150 MB/, 'no se dice de dónde sale el 150');
  });

  test('es volatile, o PostgREST contesta 25006', () => {
    /* clave_ok usa una secuencia global: en una transacción de solo lectura
       revienta. Ya costó una migración. */
    const i = SQL_CODIGO.indexOf('chat_foto_responder');
    assert.match(SQL_CODIGO.slice(i, i + 900), /volatile/);
  });

  test('se cierra a public y authenticated, y se abre solo a anon', () => {
    /* `revoke ... from public` NO cierra nada en Supabase: hay que nombrar los
       roles. Costó descubrir 28 funciones abiertas a la llave pública. */
    assert.match(SQL_CODIGO, /revoke all on function public\.chat_foto_responder[\s\S]{0,120}from public, anon, authenticated/);
    assert.match(SQL_CODIGO, /grant execute on function public\.chat_foto_responder[\s\S]{0,120}to anon/);
  });

  test('se LLAMA en la autocomprobación, no solo se crea', () => {
    /* PL/pgSQL compila el cuerpo en la primera llamada. Una migración que solo
       crea puede quedar verde y estar rota: pasó, y costó trece días sin
       guardar una foto. */
    assert.match(SQL, /r := public\.chat_foto_responder\(/);
  });

  test('y la autocomprobación NO termina en raise exception', () => {
    /* El editor de Supabase corre el archivo en UNA transacción: un exception
       al final revertiría también la función recién creada. */
    const i = SQL.indexOf('AUTOCOMPROBACIÓN');
    assert.equal(/raise exception/.test(SQL.slice(i)), false,
      'la autocomprobación revierte la migración que acaba de aplicar');
    assert.match(SQL.slice(i), /raise notice/);
  });

  test('y limpia lo que ensució', () => {
    assert.match(SQL, /delete from public\.mensajes where cedula = ced;/);
  });
});

describe('el teléfono', () => {

  test('la llamada vive en chat.js, con las otras', () => {
    assert.equal(typeof CHAT.mandarFoto, 'function');
    assert.match(funcion(leer('app/chat.js'), 'mandarFoto'), /'chat_foto_responder'/);
  });

  test('la cámara se abre directamente, no el carrete', () => {
    /* Fotografiar un recibo que tienes en la mano no debería costar tres toques. */
    assert.match(funcion(ESPEJO, 'vistaHilo'), /capture="environment"/);
    assert.match(funcion(ESPEJO, 'vistaHilo'), /accept="image\/\*"/);
  });

  test('se comprime igual que en todo el proyecto', () => {
    /* 900 px al 0,6 son ~73 KB, el número con el que están hechas TODAS las
       cuentas de capacidad. Cambiarlo mueve el suelo sin avisar. */
    const f = funcion(leer('app/chat.js'), 'prepararFoto');
    assert.match(f, /fotoDeLienzo\(c, 900, 0\.6\)/);
    assert.match(f, /fotoDeLienzo\(c, 240, 0\.5\)/);
  });

  test('el tipo que declara el teléfono no decide', () => {
    /* Hay gestores de Android que lo mandan vacío sobre una foto perfecta, y el
       lienzo reencodifica a JPEG pase lo que pase. Decide el decodificador; el
       video se ataja antes solo para poder explicar por qué no cabe. */
    const f = funcion(leer('app/chat.js'), 'prepararFoto');
    assert.match(f, /\/\^video\\\/\/\.test/);
    assert.equal(/\/\^image\\\//.test(f), false,
      'volvió el portero que se fía del tipo declarado');
  });

  test('y el lienzo funciona de verdad', () => {
    /* No se prueba leyendo el archivo: se ejecuta. `fotoDeLienzo` necesita un
       canvas, así que acá solo se comprueba que exista y que no reviente sin
       navegador — el resultado con una imagen real se midió en el navegador. */
    assert.equal(typeof CHAT.fotoDeLienzo, 'function');
    assert.equal(CHAT.fotoDeLienzo(null, 900, 0.6), '',
      'sin lienzo tiene que devolver cadena vacía, no reventar');
  });

  test('cada rechazo dice algo distinto', () => {
    const f = funcion(ESPEJO, 'porQueNoSeMando');
    ['es_video', 'no_es_imagen', 'no_la_pude_leer', 'no_la_pude_preparar', 'lleno']
      .forEach(m => assert.ok(f.indexOf("'" + m + "'") >= 0,
        'el motivo «' + m + '» no se traduce: un único «no se pudo» obliga a adivinar'));
  });

  test('y se dice el precio: queda en la conversación, no en el crédito', () => {
    assert.match(funcion(ESPEJO, 'mandarFotoCliente'),
      /Queda en la conversacion, no en el credito/,
      'sin eso, Joan la busca en la ficha del crédito y no está');
  });
});
