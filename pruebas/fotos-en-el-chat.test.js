'use strict';
/* ==========================================================================
 * FOTOS EN EL CHAT — 22 de septiembre de 2026
 *
 * Joan: «este chat tambien quiero que se puedan enviar imagenes y videos».
 *
 * FOTOS SÍ, VIDEO NO, y el número es el que decide, medido y no opinado:
 *
 *   una foto comprimida como las comprime esta casa  =  73 KB
 *   un video de 10 segundos de un celular normal     =  15 a 21 MB
 *
 * El plan gratis tiene 500 MB de base y al pasarlos la base entera se vuelve DE
 * SOLO LECTURA: no llega una factura, deja de poderse desembolsar, cobrar y
 * contestar el chat. Con video son 25 archivos EN TOTAL, para siempre. Con
 * fotos, unas 4.700.
 *
 * ESTE ARCHIVO GUARDA TRES COSAS, y las tres pueden costar caro:
 *
 *   1. Que el video no vuelva a entrar. El freno está en la BASE y no en la
 *      pantalla, porque una pantalla se cambia y un CHECK no.
 *   2. Que nadie vea la foto de otro. El id de una foto es un número
 *      correlativo: sin la reja, cualquiera con sesión pide la 1, la 2, la 3 y
 *      se baja los comprobantes de todos los clientes de Joan.
 *   3. Que el hilo NO baje la imagen entera. Veinte mensajes con foto serían
 *      dos megas en cada apertura, con los datos del cliente.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SQL = leer('base/20260922f_fotos_en_el_chat.sql');
const PLAY = leer('play/index.html');
const CRM = leer('panel/crm.html');
/* Sin comentarios: lo que se vigila es lo que se EJECUTA, y el comentario que
   explica cada arreglo cita la línea mala. */
const SQL_VIVO = SQL.split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

describe('el video no entra, y el freno está en la base', () => {

  test('la tabla RECHAZA cualquier cosa que no sea imagen', () => {
    assert.match(SQL_VIVO, /check \(imagen like 'data:image\/%'/,
      'el CHECK del tipo desapareció: una pantalla se cambia, un CHECK no');
    assert.match(SQL_VIVO, /length\(imagen\) between 100 and 400000/,
      'se fue el tope de tamaño: una imagen de medio mega pasaría');
  });

  test('y la función lo rechaza antes, para poder decirlo con palabras', () => {
    const f = SQL_VIVO.slice(SQL_VIVO.indexOf('function public.chat_foto_sesion('),
                             SQL_VIVO.indexOf('function public.chat_foto_sesion_ver'));
    assert.match(f, /'no_es_imagen'/);
    assert.match(f, /'muy_grande'/);
  });

  test('la app también lo dice, y dice por qué', () => {
    const i = PLAY.indexOf('function mandarFoto');
    const t = PLAY.slice(i, i + 1400);
    assert.match(t, /Un video no cabe en el chat/,
      'la app no explica por qué no se puede mandar un video');
    assert.match(PLAY, /Solo fotos: un video no cabe/,
      'el botón no avisa antes de que la persona lo intente');
  });

  test('y se dice para qué sirve, que es el comprobante', () => {
    assert.match(PLAY, /comprobante de un pago/i,
      'el botón dice «adjuntar» sin contarle a nadie para qué sirve');
  });
});

describe('nadie ve la foto de otro', () => {

  test('la del cliente comprueba que el mensaje es suyo', () => {
    const f = SQL_VIVO.slice(SQL_VIVO.indexOf('function public.chat_foto_sesion_ver'),
                             SQL_VIVO.indexOf('function public.chat_foto_panel'));
    assert.match(f, /m\.cedula = llave/,
      'no se comprueba de quién es la foto. El id es correlativo: pedir la 1, la ' +
      '2, la 3 bajaría los comprobantes de todos los clientes');
    assert.match(f, /join public\.mensajes m on m\.id = f\.mensaje_id/,
      'no se llega al mensaje, así que no hay con qué comprobar el dueño');
  });

  test('la de Joan pide su clave', () => {
    const f = SQL_VIVO.slice(SQL_VIVO.indexOf('function public.chat_foto_panel'));
    assert.match(f.slice(0, 600), /if not public\.clave_ok\(p_clave\)/);
  });

  test('mandar y ver son solo con sesión; el CRM solo puede VER', () => {
    assert.match(SQL_VIVO, /grant\s+execute on function public\.chat_foto_sesion\(text, text, text, text\)\s+to authenticated/);
    assert.equal(/grant\s+execute on function public\.chat_foto_sesion\([^)]*\)\s+to anon/.test(SQL_VIVO), false,
      'mandar fotos quedó abierto a la llave pública');
    assert.match(SQL_VIVO, /grant\s+execute on function public\.chat_foto_panel\(text, bigint\)\s+to anon/);
  });

  test('la tabla va con RLS y sin políticas', () => {
    assert.match(SQL_VIVO, /alter table public\.chat_fotos enable row level security/);
    assert.equal(/create policy[^;]*chat_fotos/.test(SQL_VIVO), false,
      'le pusieron una política: se entra solo por las funciones');
  });
});

describe('el hilo no baja la imagen entera', () => {

  test('chat_leer_sesion trae el id y la miniatura, nunca la imagen', () => {
    const f = SQL_VIVO.slice(SQL_VIVO.indexOf('function public.chat_leer_sesion'),
                             SQL_VIVO.indexOf('function public.chat_de'));
    assert.match(f, /'miniatura', f\.miniatura/, 'sin miniatura el hilo sale sin nada que ver');
    assert.equal(/f\.imagen/.test(f), false,
      'el hilo baja la imagen entera: veinte mensajes con foto serían dos megas ' +
      'en cada apertura, con los datos del cliente');
  });

  test('y la de Joan, igual', () => {
    const f = SQL_VIVO.slice(SQL_VIVO.indexOf('function public.chat_de'),
                             SQL_VIVO.indexOf('====== 5.') > 0 ? SQL_VIVO.indexOf('====== 5.') : undefined);
    assert.equal(/'imagen', f\.imagen/.test(f), false, 'el CRM baja todas las fotos de golpe');
  });

  test('la app manda DOS tamaños', () => {
    const i = PLAY.indexOf('function mandarFoto');
    const t = PLAY.slice(i, i + 1600);
    assert.match(t, /fotoDeLienzo\(c, 900, 0\.6\)/, 'la foto no se comprime como el resto de la casa');
    assert.match(t, /fotoDeLienzo\(c, 240, 0\.5\)/, 'no se hace miniatura: el hilo bajaría la grande');
  });
});

describe('borrar la conversación se lleva las fotos', () => {

  test('cuelga del mensaje con on delete cascade', () => {
    /* Es la promesa de la política de datos (Ley 1581) y aquí la cumple el
       esquema, sin que nadie tenga que acordarse de borrar en dos sitios. Si
       colgara de la cédula, chat_olvidar dejaría las fotos huérfanas. */
    assert.match(SQL_VIVO, /references public\.mensajes\(id\) on delete cascade/,
      'las fotos no cuelgan del mensaje: borrar la conversación las dejaría');
    assert.match(SQL, /confdeltype = 'c'/,
      'no se comprueba que el cascade quedara puesto de verdad');
  });

  test('y la prueba de la migración lo verifica borrando', () => {
    assert.match(SQL, /se borro la conversacion y la foto quedo huerfana/,
      'la migración no comprueba el borrado en cascada');
  });
});

describe('la burbuja no se puede usar para inyectar', () => {

  const pinta = m => CHAT.hiloHTML([Object.assign(
    { id: 1, de: 'socio', texto: 'hola', creado_en: '2026-09-22T10:00:00Z' }, m)],
    { yo: 'negocio', hoy: '2026-09-22', alVerFoto: 'ver' });

  test('una fuente que no es data:image NO se pinta', () => {
    /* Escapar no alcanza en un src: «x" onerror="...» se sale del atributo. Por
       eso la fuente se COMPRUEBA antes de emitirla. */
    const veneno = 'x" onerror="alert(1)';
    const h = pinta({ foto: 7, miniatura: veneno });
    assert.equal(h.indexOf('onerror') >= 0, false, 'se coló un onerror por el src de la imagen');
    assert.match(h, /ch-foto-sin/, 'sin miniatura válida no se dice que hay un adjunto');
  });

  test('un javascript: tampoco', () => {
    const h = pinta({ foto: 7, miniatura: 'javascript:alert(1)' });
    assert.equal(h.indexOf('javascript:') >= 0, false, 'se coló un javascript: en el src');
  });

  test('una miniatura de verdad sí se pinta', () => {
    const buena = 'data:image/jpeg;base64,AAAABBBBCCCC';
    const h = pinta({ foto: 7, miniatura: buena });
    assert.ok(h.indexOf('<img src="' + buena + '"') >= 0, 'la miniatura buena no se pintó');
    assert.match(h, /onclick="ver\(7\)"/, 'no se puede abrir la foto');
  });

  test('sin foto, la burbuja no cambia', () => {
    const h = pinta({});
    assert.equal(h.indexOf('ch-foto') >= 0, false, 'se pinta un adjunto donde no hay ninguno');
  });

  test('sin manera de abrirla, el botón queda inerte y no miente', () => {
    const h = CHAT.hiloHTML([{ id: 1, de: 'socio', texto: 'h', creado_en: '2026-09-22T10:00:00Z',
      foto: 3, miniatura: 'data:image/png;base64,AAAA' }], { yo: 'negocio', hoy: '2026-09-22' });
    assert.match(h, /disabled/,
      'sin alVerFoto el botón sigue pareciendo pulsable y no hace nada');
  });
});

describe('cada rechazo del servidor dice algo distinto', () => {

  test('los cinco motivos tienen su frase', () => {
    /* La funcion ENTERA, no un trozo de 1.800 caracteres: esa ventana fija ya
       se rompio una vez al anadir comentarios, y una prueba que falla porque
       alguien explico mejor el codigo ensena a ignorar las pruebas. */
    const i = PLAY.indexOf('function subirFotoChat');
    const t = PLAY.slice(i, PLAY.indexOf(String.fromCharCode(10) + '}', i));
    ['no_es_imagen', 'muy_grande', 'tope', 'muchas', 'sesion'].forEach(m =>
      assert.ok(t.indexOf("'" + m + "'") >= 0, 'el motivo «' + m + '» no se traduce'));
  });

  test('el tope por conversación existe, y se rechaza en vez de borrar la vieja', () => {
    const f = SQL_VIVO.slice(SQL_VIVO.indexOf('function public.chat_foto_sesion('),
                             SQL_VIVO.indexOf('function public.chat_foto_sesion_ver'));
    assert.match(f, /cuantas >= 60/,
      'sin tope, un solo cliente puede llenar la base y dejarla de solo lectura');
    assert.equal(/delete from public\.chat_fotos/.test(f), false,
      'se borra la foto más vieja en silencio: un comprobante que desaparece es ' +
      'peor que un comprobante que no entra');
  });
});
