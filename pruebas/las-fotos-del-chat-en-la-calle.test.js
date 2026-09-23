'use strict';
/* ==========================================================================
 * LAS FOTOS DEL CHAT, DESDE LA CALLE — Fase D
 * 23 de septiembre de 2026
 *
 * El hilo del espejo ya pintaba las fotos que manda un cliente, pero SIN
 * manejador: salían como un «📎 Foto» que no hacía nada al tocarlo. El cliente
 * mandaba el pantallazo de su pago —que es la mitad de las conversaciones de
 * cobro— y Joan, en la calle, veía que existía y no podía abrirlo.
 *
 * Un botón inerte es peor que no tener botón: se toca tres veces antes de creer
 * que no funciona. Y el que lo escribió no lo vio nunca, porque en el
 * computador el mismo hilo sí pasa el manejador.
 *
 * ---------------------------------------------------------------------------
 * EL VISOR NO SE INVENTA: ES EL DEL CRM, Y POR UNA RAZÓN CARA
 *
 * El 22-sep se cerró esta cadena: CHECK flojo en la base → una foto envenenada
 * (`data:image/png;base64,AAAA" onerror="…`) → `document.write` dentro de un
 * atributo → `about:blank` heredando el origen → la clave de sincronización
 * robada del localStorage → y con ella el comprobante de pago de cualquier
 * cliente, porque el id de la foto es correlativo.
 *
 * Las tres reglas que la cierran, y que este archivo vigila en el espejo:
 *   1. se COMPRUEBA la fuente antes de tocarla;
 *   2. se asigna como PROPIEDAD, nunca como texto de un atributo;
 *   3. la capa es de esta misma página: ni `window.open()` ni `document.write`.
 *
 * Una defensa que solo existe en un lado deja de existir el día que alguien
 * mueve el otro.
 *
 * ---------------------------------------------------------------------------
 * LO QUE ESTA FASE NO HIZO, Y ESTÁ DICHO EN LA PANTALLA
 *
 * El comprobante fotografiado desde el teléfono NO entró, y no por falta de
 * tiempo: `sinFotos` quita la foto de un comprobante de la sincronización a
 * propósito. Una foto tomada en la calle se quedaría en ese teléfono y
 * desaparecería al resembrar el espejo. Mandarla necesita transporte propio
 * —como lo tienen las del chat, en su tabla y con su trozo de los 500 MB— y eso
 * es una decisión de Joan, no una tarea. Hay prueba de que la pantalla lo dice.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT = require('../app/chat.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ESPEJO = leer('panel/espejo.html');

/* El espejo sin comentarios: lo que de verdad se ejecuta. Se quitan los de
   bloque y los de línea, que es donde viven las explicaciones largas de este
   repo — y donde un centinela descuidado encuentra lo que está buscando. */
const SIN_COMENTARIOS = ESPEJO
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const funcion = (src, nombre) => {
  const i = src.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return src.slice(i, src.indexOf('\n}', i));
};

describe('el botón de la foto ya no es inerte', () => {

  test('el hilo del espejo pasa el manejador', () => {
    assert.match(funcion(ESPEJO, 'vistaHilo'), /alVerFoto: 'verFotoCliente'/,
      'volvió el «📎 Foto» que no hace nada: el pantallazo del pago se ve y no se abre');
  });

  test('y el renderizador lo cablea de verdad', () => {
    /* Se comprueba contra chat.js, no contra el texto del espejo: la pantalla
       podría pasar un nombre que el renderizador ignorara y nadie se enteraría
       hasta tener una foto de verdad delante. */
    const html = CHAT.hiloHTML(
      [{ id: 1, de: 'socio', texto: 'te mando el pago', foto: 7,
         miniatura: 'data:image/jpeg;base64,AAAA', creado_en: '2026-09-23T10:00:00Z' }],
      { yo: 'negocio', alVerFoto: 'verFotoCliente' });
    assert.match(html, /verFotoCliente\(7\)/);
  });

  test('sin manejador el botón sale deshabilitado, no roto', () => {
    const html = CHAT.hiloHTML(
      [{ id: 1, de: 'socio', foto: 7, miniatura: 'data:image/jpeg;base64,AAAA', creado_en: '2026-09-23T10:00:00Z' }],
      { yo: 'negocio' });
    assert.match(html, /disabled/);
  });
});

describe('la llamada vive con las otras, no copiada', () => {

  test('chat.js expone fotoDelPanel', () => {
    assert.equal(typeof CHAT.fotoDelPanel, 'function',
      'la llamada volvió a estar copiada en cada pantalla');
  });

  test('pide la foto por su id y con la clave', () => {
    const f = funcion(leer('app/chat.js'), 'fotoDelPanel');
    assert.match(f, /'chat_foto_panel'/);
    assert.match(f, /p_clave/);
    assert.match(f, /p_id: Number\(id\)/);
  });

  test('el espejo la usa en vez de armar su propia petición', () => {
    assert.match(funcion(ESPEJO, 'verFotoCliente'), /ChatTuGarantia\.fotoDelPanel\(cfg, id\)/);
    /* SE MIRA EL CÓDIGO, NO LOS COMENTARIOS. Esta prueba nació acusando al
       espejo de llamar a la RPC por su cuenta, y lo que había encontrado era el
       comentario que explica que NO lo hace. Es la cuarta vez que pasa en este
       proyecto: un centinela que lee la prosa que lo justifica. */
    const codigo = SIN_COMENTARIOS;
    assert.equal(/chat_foto_panel/.test(codigo), false,
      'el espejo volvió a llamar a la RPC por su cuenta en vez de pasar por chat.js');
  });

  test('sin clave no pide nada, y lo dice', () => {
    assert.match(funcion(ESPEJO, 'verFotoCliente'), /if \(!cfg\)/);
  });
});

describe('las tres reglas del visor', () => {

  test('1 · se comprueba la fuente antes de tocarla', () => {
    assert.match(funcion(ESPEJO, 'mostrarFoto'), /if \(!ChatTuGarantia\.esFoto\(imagen\)\)/,
      'el visor volvió a pintar lo que llegue: es por donde entraba el guión');
  });

  test('   y la comprobación de verdad rechaza el ataque', () => {
    assert.equal(CHAT.esFoto('data:image/png;base64,AAAA" onerror="alert(1)'), false);
    assert.equal(CHAT.esFoto('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  });

  test('2 · la fuente se asigna como PROPIEDAD', () => {
    const f = funcion(ESPEJO, 'mostrarFoto');
    assert.match(f, /img\.src = imagen/,
      'si vuelve a construirse el atributo como texto, hay de dónde salirse');
    assert.equal(/innerHTML\s*=\s*['"`].*<img/.test(f), false);
  });

  test('3 · la capa es de esta página', () => {
    const f = funcion(ESPEJO, 'mostrarFoto');
    assert.equal(/document\.write/.test(f), false, 'volvió el document.write');
    assert.equal(/window\.open/.test(f), false,
      'volvió el window.open: un about:blank hereda el origen de quien lo abre');
  });

  test('y se cierra con Escape además de con el toque', () => {
    assert.match(funcion(ESPEJO, 'mostrarFoto'), /ev\.key === 'Escape'/);
  });

  test('el pie respeta la raya del gesto del iPhone', () => {
    /* Sin el safe-area, «Toca para cerrar» queda debajo de la barra del gesto y
       el primer toque de Joan cierra la app en vez de la foto. */
    assert.match(funcion(ESPEJO, 'mostrarFoto'), /env\(safe-area-inset-bottom\)/);
  });
});

describe('la pantalla dice exactamente qué foto sí y cuál no', () => {

  test('ya no dice que no trae ninguna', () => {
    assert.equal(/no trae fotos \(cédula, selfie, comprobantes\) — Fase 1/.test(ESPEJO), false,
      'la cabecera sigue diciendo que no trae fotos, y ahora sí abre las del chat');
    assert.match(ESPEJO, /SÍ abre las fotos que mandan los clientes por el chat/);
  });

  test('y sigue diciendo lo que NO hace, con el porqué', () => {
    /* Corregirse de más es el otro lado del mismo error. Y el porqué importa:
       sin él, mañana alguien añade la cámara del comprobante y la foto se
       pierde en silencio al sincronizar. */
    assert.match(ESPEJO, /sigue sin traer la cédula, la selfie ni los comprobantes/);
    assert.match(ESPEJO, /`sinFotos` los quita a propósito de la/,
      'no queda dicho POR QUÉ no viajan: es lo que impide que alguien lo "arregle" mal');
  });

  test('y eso es verdad: sinFotos se lleva la foto del comprobante', () => {
    /* La prueba que sostiene la frase de arriba. Si algún día sinFotos dejara
       de quitarla, la pantalla estaría mintiendo — y al revés, si alguien
       añade la cámara creyendo que viaja, esto se lo dice antes. */
    const N = require('../panel/nube.js');
    const r = N.sinFotos({ id: 'P1',
      comprobantes: [{ fecha: '2026-09-23', tipo: 'pago', monto: 1, foto: 'data:image/jpeg;base64,AAAA' }] });
    assert.ok(!r.comprobantes[0].foto,
      'sinFotos ya no quita la foto del comprobante: hay que revisar el aviso ' +
      'de la cabecera del espejo, que afirma que sí la quita');
  });
});
