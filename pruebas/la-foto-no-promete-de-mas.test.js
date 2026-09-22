'use strict';
/* ==========================================================================
 * LA PANTALLA DE LA FOTO NO PROMETE LO QUE EL CÓDIGO NO CUMPLE
 * 22 de septiembre de 2026
 *
 * Seis cosas que decía la pantalla de las fotos y que no eran verdad. Ninguna
 * expone datos ni plata; todas rompen la regla dura de esta casa, y esa regla
 * no está por gusto: la marca aquí es la confianza, y un cliente que aprende
 * que la pantalla miente deja de leerla — incluso cuando dice algo importante.
 *
 * La peor de las seis era el tope. Decía:
 *
 *     «Ya nos mandaste muchas fotos POR AQUÍ. ESCRÍBENOS y las revisamos.»
 *
 * y las DOS mitades eran falsas. El conteo no filtraba por canal ni por fecha:
 * eran 60 fotos en total, sumando los tres canales, Y PARA SIEMPRE. Y la
 * salida que ofrecía no existe: no hay ninguna función que borre UNA foto —
 * la única palanca es borrar la conversación entera, que no se deshace. Al
 * cliente 61 se le ofrecía un trámite que solo se podía cumplir destruyéndole
 * el historial. Y sin aviso a nadie: Joan se habría enterado el día que un
 * socio dejara de mandar comprobantes.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PLAY = leer('play/index.html');
const PRIV = leer('legal/privacidad.html');
const SQL = leer('base/20260922i_el_tope_no_es_para_siempre.sql')
  .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const funcion = nombre => {
  const i = PLAY.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return PLAY.slice(i, PLAY.indexOf(String.fromCharCode(10) + '}', i));
};

describe('el tope deja de ser un callejón sin salida', () => {

  test('la base cuenta solo el último mes', () => {
    /* En SQL las comillas van dobladas dentro de una cadena, asi que en el
       archivo esto se lee «interval ''30 days''». Se busca lo que el archivo
       DICE, no lo que uno recuerda haber escrito. */
    assert.match(SQL, /and f\.creado_en > now\(\) - interval ''30 days''/,
      'el tope vuelve a ser perpetuo: al cliente 61 se le cierra la puerta para siempre');
    assert.match(SQL, /cuerpo not like '%interval ''30 days''%'/,
      'no hay centinela que vigile que la ventana siga puesta');
  });

  test('pero el freno SIGUE, que es la mitad que se olvida', () => {
    /* Un arreglo que quita el freno no es un arreglo: sin él, un solo cliente
       llena los 500 MB y la base entera queda DE SOLO LECTURA — y ahí no se
       puede ni desembolsar, ni cobrar, ni contestar el chat. */
    assert.match(SQL, /FALLO 2 GRAVE: se quito el freno/,
      'la migración no comprueba que el tope siga existiendo');
    assert.match(SQL, /cuantas >= 60/,
      'el centinela ya no vigila que el tope siga puesto');
  });

  test('y el mensaje no ofrece un trámite que no existe', () => {
    const t = funcion('subirFotoChat');
    assert.equal(/Escr[íi]benos y las revisamos/.test(t), false,
      'se vuelve a ofrecer revisar las fotos: no hay ninguna función que borre ' +
      'UNA foto, solo la conversación entera y sin vuelta atrás');
    assert.equal(/muchas fotos por aqu[íi]/.test(t), false,
      'se vuelve a decir «por aquí»: el tope cuenta los tres canales juntos');
    assert.match(t, /m[áa]ximo de fotos de este mes/,
      'no se dice que el tope es del mes, que es lo que ahora sí es verdad');
  });

  test('y «espera un momento» no puede ser un cuarto de hora', () => {
    /* El freno real es chat_puede_escribir: 20 mensajes cada 15 MINUTOS. */
    const t = funcion('subirFotoChat');
    assert.equal(/Espera un momento/.test(t), false,
      '«un momento» puede ser quince minutos: no es un momento');
    assert.match(t, /Espera unos minutos/);
  });
});

describe('lo que va bien no se pinta de error', () => {

  test('hay una caja de progreso aparte de la de fallo', () => {
    /* «Preparando la foto…» salía en la misma caja ámbar con filete que «no
       pude mandarla». Una caja que se ve igual pase lo que pase deja de
       significar nada, y la gente aprende a no leerla. */
    assert.match(PLAY, /function progreso\(el, msg\)/,
      'el progreso se sigue pintando en la caja de error');
    assert.match(funcion('progreso'), /classList\.remove\('ambar'\)/);
  });

  test('y fallo vuelve a ponerla ámbar, para que un progreso no la deje azul', () => {
    assert.match(funcion('fallo'), /classList\.add\('ambar'\)/,
      'tras un progreso, el error siguiente saldría del color del progreso');
  });

  test('los dos avisos de la foto usan el de progreso', () => {
    assert.match(PLAY, /progreso\(err, 'Preparando la foto/);
    assert.match(PLAY, /progreso\(err, 'Mandando la foto/);
  });
});

describe('nada se corta en silencio y nada se queda mudo', () => {

  test('el pie de la foto se revisa ANTES, no lo recorta la base', () => {
    /* La base hace left(..., 1000). Un pie que llega cortado deja a la persona
       creyendo que mandó el resto — que es justo lo que chat.js prohíbe por
       escrito. La diferencia con un mensaje: aquí un pie VACÍO sí vale. */
    const t = funcion('subirFotoChat');
    assert.match(t, /pie\.length > CH\.LARGO_MAX/,
      'el pie vuelve a cortarse en silencio a mil caracteres');
  });

  test('no se le echa la culpa al internet de lo que es nuestro', () => {
    const t = funcion('subirFotoChat');
    assert.match(t, /causaDe\(e\)/,
      'el catch no distingue: mandar a alguien a revisar su wifi cuando el ' +
      'problema es nuestro lo deja reintentando para siempre');
    assert.match(t, /c === 'sesion'/, 'una sesión vencida sale como un fallo de red');
  });

  test('y abrir una foto que falla lo dice', () => {
    /* Un `return` pelado dejaba a la persona tocando una miniatura que nunca
       abría, sin saber por qué. Una función muda no existe. */
    const t = funcion('verFotoChat');
    assert.equal(/\.catch\(function \(\) \{\}\)/.test(t), false,
      'verFotoChat vuelve a tragarse el fallo en silencio');
    assert.match(t, /No pude abrir esa foto/);
  });
});

describe('y el tratamiento de datos está declarado (Ley 1581)', () => {

  test('la política declara las fotos del chat, en su propia fila', () => {
    /* Cada tratamiento se declara aparte — por eso la cédula y la selfie tienen
       una fila cada una. Desde hoy el chat recibe imágenes que se guardan: eso
       es un tratamiento nuevo, y uno que arrastra datos de terceros por diseño
       (un comprobante lleva el nombre y la cuenta de otra persona). */
    assert.match(PRIV, /fotos que nos mandas por el chat/i,
      'se guardan fotos de clientes sin declararlo en la política');
    assert.match(PRIV, /se borran con ella/i,
      'no se dice qué pasa con esas fotos cuando se borra la conversación');
  });

  test('y avisa de lo que un comprobante lleva de otra persona', () => {
    assert.match(PRIV, /nombre y el n[úu]mero de cuenta de otra persona/i,
      'no se avisa de que un comprobante trae datos de terceros');
  });

  test('la fecha de la política es la de este cambio', () => {
    /* Sin esto el documento miente sobre sí mismo, y aquí un documento
       desactualizado cuenta como un defecto. */
    assert.match(PRIV, /Última actualización: 22 de septiembre de 2026/,
      'se cambió la política y no se movió la fecha');
  });
});

describe('el cortacircuito: que las fotos no tumben el negocio', () => {

  const CRM = leer('panel/crm.html');
  const J = leer('base/20260922j_el_cortacircuito.sql')
    .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

  test('hay un freno que mira el TOTAL, no solo a un cliente', () => {
    /* Todos los demas frenos son por cliente: 60 al mes, 400.000 caracteres,
       20 mensajes cada 15 minutos. Ninguno puede proteger de cuentas en bucle,
       porque protegen de UNA. Y el registro no comprueba el celular. Al pasar
       los 500 MB la base entera queda DE SOLO LECTURA: no llega factura, deja
       de poderse desembolsar y cobrar, y el primer aviso es un cliente. */
    assert.match(J, /pg_total_relation_size\('public\.chat_fotos'\)/,
      'no hay freno global: cuentas en bucle pueden dejar la base de solo lectura');
    assert.match(J, /150 \* 1024 \* 1024/, 'no se sabe cual es el liston');
  });

  test('y la migración comprueba que CORTA, no solo que está escrito', () => {
    assert.match(J, /FALLO 2 GRAVE: el cortacircuito no corta/,
      'se da por bueno un freno que nadie ha visto frenar');
    assert.match(J, /FALLO 1: el cortacircuito frena con la tabla vacia/,
      'no se comprueba que NO frene cuando no toca: un freno que salta de mas ' +
      'es peor, porque nadie lo cree la vez que hace falta');
  });

  test('no se queda a medias si la prueba falla', () => {
    /* Se baja el liston a cero para probar el corte. Si eso se quedara puesto,
       el chat no aceptaria una sola foto nunca mas y nadie sabria por que. */
    assert.match(J, /execute original/,
      'la prueba no repone la función que modificó');
    assert.match(J, /FALLO 3 GRAVE: el liston se quedo en cero/);
  });

  test('y no se lleva por delante lo que ya estaba', () => {
    /* Tres migraciones seguidas reescriben la MISMA función leyéndola de la
       base. La cuarta que se despiste borra el trabajo de las tres. */
    ['p_imagen !~ buena', '30 days', 'cuantas >= 60'].forEach(x =>
      assert.ok(J.indexOf(x) > 0,
        'el centinela no vigila que siga puesto lo de antes: «' + x + '»'));
  });

  test('la app explica el «lleno» sin culpar a quien manda', () => {
    const t = funcion('subirFotoChat');
    assert.match(t, /m === 'lleno'/, 'el motivo «lleno» no se traduce: saldría «no pude mandar la foto»');
    assert.match(t, /no podemos recibir fotos/i);
  });
});

describe('borrar una cuenta dice qué fotos se lleva', () => {

  const CRM = leer('panel/crm.html');

  test('ya no dice «fotos» a secas contando solo las del registro', () => {
    /* `n_fotos` cuenta registro_archivos —la cédula y la selfie—. Las del chat
       se van con el cascade de los mensajes y no se contaban en ningún sitio:
       Joan leía «fotos: 0» mientras se borraban cuarenta comprobantes. */
    assert.match(CRM, /fotos del registro \(cedula y selfie\)/,
      'el conteo vuelve a decir «fotos» sin decir de cuáles habla');
    assert.match(CRM, /mensajes del chat, con las fotos que llevaran/,
      'no se dice que los mensajes se llevan sus fotos');
  });

  test('y el aviso de ANTES también, que es donde Joan decide', () => {
    assert.match(CRM, /su chat y las fotos que haya mandado por el/,
      'se le pide confirmación sin nombrar los comprobantes que se van');
  });
});
