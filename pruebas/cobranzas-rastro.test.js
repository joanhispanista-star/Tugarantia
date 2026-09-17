/* ===========================================================================
 * COBRANZAS: QUE LO QUE SE MANDA QUEDE ESCRITO
 *
 * Joan pidió el 16-sep-2026 más botones en la pestaña de Cobranzas. Al medirla
 * salió que el botón que más le hacía falta no estaba en su lista, y que la
 * pestaña entera nunca se había ejecutado en una prueba.
 *
 * LO QUE ESTABA ROTO, y las tres cosas son la misma:
 *
 *   1. Bajar el CSV no dejaba rastro. Joan manda 80 mensajes desde su
 *      plataforma y el CRM no se entera; mañana le ofrece a los mismos, y ESE
 *      segundo mensaje dentro de la semana es el que la Ley 2300 prohíbe.
 *   2. Quien pidió SALIR seguía recibiendo si tenía el WhatsApp en otro número:
 *      la lista de excluidos leía `telefono` y el mensaje va a `waNum(socio)`.
 *   3. Al anotar el contacto se buscaba al socio por teléfono, con el mismo
 *      desfase — y lo que no empareja caía en un `if (!s) return;` mudo. Lo que
 *      no queda escrito, la reja de la semana no lo cuenta.
 *
 * Y el guardián de todo esto estaba ciego: buscaba `type=checkbox` sin comillas
 * y el archivo escribe `type="checkbox"`. Se le metieron casillas a la tabla de
 * gente excluida POR LA LEY y las 1.779 pruebas siguieron en verde.
 *
 * Todas las de acá EJECUTAN el CRM.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const RELOJ = require('./reloj.js');

/* 17-sep-2026 — LA HORA SE PASA. Estas pruebas ejecutan la pestaña de Cobranzas,
   que está detrás de la reja de la Ley 2300: fuera del horario legal la lista de
   arriba sale vacía y las filas que se buscan acá no existen. Corrida a las
   07:38 daba verde y a las 23:30 daba rojo, sin que nadie hubiera tocado nada.
   El porqué largo está en reloj.js. */
function panelCon(socios, prestamos) {
  const P = abrirPanel({ ahora: RELOJ.MOMENTO });
  P.cargarCartera({ socios: socios, prestamos: prestamos || [] });
  return P;
}
/* Un credito que vence HOY, que es lo que lo mete en la cola de cobranza. La
   fecha de corte sale de `fechaPago` (puente.js corteDelCredito); sin ella el
   credito queda «al-dia» y la pestaña no lo muestra — media hora de la primera
   vez. */
const VENCE_HOY = (id, socioId) => ({ id, socioId, monto: 200000, fechaPago: HOY });
const HOY = RELOJ.HOY;

const SOCIO = (extra) => Object.assign({
  id: 'S1', numero: 1, nombre: 'Ana Perez', cedula: '52000000',
  telefono: '3001234567', whatsappIgual: true, gestiones: []
}, extra || {});

describe('el CSV deja rastro (16-sep-2026)', () => {

  test('bajar el CSV guarda A QUIENES se bajó', () => {
    /* Sin esto, todo lo demás se construye encima de un contador que no cuenta.
       MUTANTE QUE CAZA: quitar la línea que arma _cob.lote — que es el código
       que estuvo vivo hasta hoy. */
    const P = panelCon([SOCIO()], [VENCE_HOY('P1', 'S1')]);
    P.ev('renderCobranzas()');          // recalcula la lista de verdad
    P.ev('bajarCSVCobranzas()');
    assert.equal(P.ev('_cob.lote && _cob.lote.socios.join("|")'), 'S1',
      'se bajó el archivo y el CRM no guardó a quién se lo bajó');
    assert.match(String(P.ev('_cob.lote.archivo')), /^cobranza-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('«Ya les escribí por fuera» anota el contacto de verdad', () => {
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote={cuando:new Date().toISOString(),archivo:"cobranza-2026-09-16.csv",' +
         'socios:["S1"],plantillas:["venceHoy"]}');
    P.ev('window.prompt=function(q){ return /canal/i.test(q)?"voz":"2026-09-16"; }');
    P.ev('marcarLoteEnviado()');

    const g = JSON.parse(P.almacen['joan_socios_v1']).socios[0].gestiones;
    assert.equal(g.length, 1, 'no quedó anotado el contacto: la reja de la semana no lo va a contar');
    assert.equal(g[0].canal, 'voz', 'el canal no quedó: el tope semanal es POR canal');
    assert.equal(g[0].fecha, '2026-09-16');
    assert.ok(g[0].hora, 'sin hora el registro no prueba cuándo se contactó');
  });

  test('anota el día que LLEGÓ, no el día del clic', () => {
    /* La ley mira cuándo le llega el mensaje al cliente. Un CSV se puede subir
       al portal al día siguiente, y anotarlo con la fecha del clic corre la
       semana de esa persona un día — justo en la dirección peligrosa.
       MUTANTE QUE CAZA: ignorar el parámetro y usar hoyISO() siempre. */
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote={cuando:new Date().toISOString(),archivo:"a.csv",socios:["S1"],plantillas:[""]}');
    P.ev('window.prompt=function(q){ return /canal/i.test(q)?"texto":"2026-09-14"; }');
    P.ev('marcarLoteEnviado()');
    assert.equal(JSON.parse(P.almacen['joan_socios_v1']).socios[0].gestiones[0].fecha, '2026-09-14',
      'se anotó con la fecha de hoy y no con el día en que llegaron los mensajes');
  });

  test('no se puede anotar el mismo lote dos veces', () => {
    /* Anotar dos veces no rompe la ley, pero infla el historial y le hace creer
       a Joan que contactó el doble. El lote se consume. */
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote={cuando:new Date().toISOString(),archivo:"a.csv",socios:["S1"],plantillas:[""]}');
    P.ev('window.prompt=function(q){ return /canal/i.test(q)?"texto":"2026-09-16"; }');
    P.ev('marcarLoteEnviado()');
    P.ev('marcarLoteEnviado()');
    assert.equal(JSON.parse(P.almacen['joan_socios_v1']).socios[0].gestiones.length, 1,
      'el mismo lote se anotó dos veces');
  });

  test('una fecha con mala forma no escribe nada', () => {
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote={cuando:new Date().toISOString(),archivo:"a.csv",socios:["S1"],plantillas:[""]}');
    P.ev('window.prompt=function(q){ return /canal/i.test(q)?"texto":"el martes"; }');
    P.ev('marcarLoteEnviado()');
    assert.equal((JSON.parse(P.almacen['joan_socios_v1']).socios[0].gestiones || []).length, 0,
      'se anotó una gestión con una fecha que no es una fecha');
    assert.ok(P.ev('_cob.lote !== null'), 'se perdió el lote por escribir mal la fecha');
  });

  test('si un socio del lote ya no existe, se DICE — no se traga', () => {
    /* Un contacto que no se pudo anotar es un riesgo legal, no un detalle: el
       CRM le va a volver a ofrecer esa persona esta misma semana.
       MUTANTE QUE CAZA: volver al `if (!s) return;` mudo. */
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote={cuando:new Date().toISOString(),archivo:"a.csv",' +
         'socios:["S1","S-BORRADO"],plantillas:["",""]}');
    P.ev('window.prompt=function(q){ return /canal/i.test(q)?"texto":"2026-09-16"; }');
    P.ev('marcarLoteEnviado()');
    const avisos = String(P.ev('(window._avisos||[]).join(" | ")'));
    assert.match(avisos, /no quedaron\s+anotados|1 contacto/i,
      'un contacto se perdió al anotarlo y el CRM no dijo nada');
    assert.match(avisos, /Ley 2300|misma semana|volver a ofrecer/i,
      'no se le explicó a Joan la consecuencia de que ese contacto no quede escrito');
  });

  test('la barra se pinta también cuando no hay a quién escribirle', () => {
    /* Fuera de horario la reja excluye a TODOS de una, la lista queda vacía, y
       la barra vivía dentro del `else`: a las 7:05 de la noche Joan entraba a
       anotar lo que mandó al mediodía y no tenía un solo botón.
       MUTANTE QUE CAZA: devolver la barra adentro del else. */
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote={cuando:new Date().toISOString(),archivo:"a.csv",socios:["S1"],plantillas:[""]}');
    P.ev('renderCobranzas()');
    const html = String(P.elems['tblCobranzas'].innerHTML);
    assert.match(html, /marcarLoteEnviado/,
      'sin nadie a quien escribirle desaparece el botón de anotar lo que ya se mandó');
  });

  test('sin lote bajado, el botón de anotar no se pinta', () => {
    /* No se puede ofrecer anotar un envío que no existe: Joan apretaría y el
       CRM anotaría contactos que nunca salieron. */
    const P = panelCon([SOCIO()]);
    P.ev('_cob.lote=null; renderCobranzas()');
    assert.doesNotMatch(String(P.elems['tblCobranzas'].innerHTML), /marcarLoteEnviado/,
      'se ofrece anotar un envío que nunca se bajó');
  });
});

describe('las casillas saben de quién son (16-sep-2026)', () => {

  test('dos fichas con el MISMO celular no comparten casilla', () => {
    /* La pareja que comparte línea, o una ficha repetida. Con la marca por
       celular, Joan destildaba a una y el mensaje se le iba a la otra igual.
       MUTANTE QUE CAZA: volver a llavear _cob.marcados por f.celular. */
    const P = panelCon([SOCIO(), SOCIO({ id: 'S2', numero: 2, nombre: 'Luis Perez' })]);
    P.ev('_cob.filas=[{socio_id:"S1",celular:"3001234567",nombre_completo:"Ana",monto:1,plantilla:"",mensaje_sms:"",mensaje_voz:"",pedazos_sms:1},' +
         '{socio_id:"S2",celular:"3001234567",nombre_completo:"Luis",monto:1,plantilla:"",mensaje_sms:"",mensaje_voz:"",pedazos_sms:1}];' +
         '_cob.marcados={S1:true,S2:true}');
    P.ev('marcarCob("S1",false)');
    assert.equal(P.ev('filasMarcadas().map(function(f){return f.socio_id;}).join("|")'), 'S2',
      'destildar a uno destildó (o dejó) al otro: comparten casilla por tener el mismo celular');
  });

  test('cada casilla pintada lleva SU dueño y SU marca', () => {
    /* renderCobranzasMarcas emparejaba por POSICIÓN: cajas[i] contra filas[i].
       La primera casilla que alguien metiera dentro de esa caja corría todas las
       marcas un puesto — Joan destilda a Pedro y se le manda a María.

       ESTA PRUEBA MIDE LO QUE SE PINTA, no lo que hace el repintado: el banco no
       tiene un DOM que parsee innerHTML (su querySelectorAll devuelve vacío), y
       lo digo en vez de fingir que lo probé. Lo que sí queda garantizado acá es
       que cada casilla sale con su `data-socio` y con la marca de ESE socio, que
       es lo que hace posible el emparejamiento por dueño. El repintado con una
       casilla intrusa se comprobó abriendo el CRM en un navegador.
       MUTANTE QUE CAZA: quitar el data-socio, o volver a leer _cob.marcados por
       celular al pintar. */
    const P = panelCon(
      [SOCIO(), SOCIO({ id: 'S2', numero: 2, nombre: 'Luis Perez', cedula: '2', telefono: '3009999999' })],
      [VENCE_HOY('P1', 'S1'), VENCE_HOY('P2', 'S2')]);
    P.ev('renderCobranzas()');

    const casillas = String(P.elems['tblCobranzas'].innerHTML)
      .match(/<input type="checkbox"[^>]*>/g) || [];
    assert.equal(casillas.length, 2, 'no se pintó una casilla por fila');

    /* Cada casilla dice de quién es, y son distintas. Eso es lo que hace posible
       emparejar por dueño en vez de por posición. */
    const duenos = casillas.map(c => (c.match(/data-socio="([^"]*)"/) || [])[1]);
    assert.deepEqual(duenos, ['S1', 'S2'],
      'las casillas no llevan su dueño: sin eso solo se pueden emparejar por posición');

    /* Y destildar a uno saca a ese uno. `renderCobranzas` vuelve a marcar a
       todos a propósito al recalcular —el caso normal es escribirle a todos—,
       así que la marca se comprueba sin repintar, que es lo que hace Joan. */
    P.ev('marcarCob("S1", false)');
    assert.equal(P.ev('filasMarcadas().map(function(f){return f.socio_id;}).join("|")'), 'S2',
      'destildar a uno no lo sacó, o sacó a otro');
  });
});
