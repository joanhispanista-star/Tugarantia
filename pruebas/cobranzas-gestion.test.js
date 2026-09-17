/* ===========================================================================
 * COBRANZAS: LA FILA COMO PUESTO DE TRABAJO
 *
 * Joan lo pidió el 16-sep-2026: «un boton para ver el historial del cliente y
 * otro para registrar un pago, un boton para dejar una nota o anotacion de
 * compromiso de pago o de llamada y tipificar».
 *
 * LO QUE HABÍA QUE RESOLVER, y no era pintar botones:
 *
 *   · El historial de contacto se lleva guardando desde agosto y Joan NUNCA lo
 *     ha visto en su computador: la ficha del cliente no pinta ni una gestión.
 *   · Anotar lo que el cliente contestó no se podía hacer en ninguna parte.
 *   · Y la pregunta que gobierna todo: ¿qué gasta el contacto de la semana?
 *     No lo decide una casilla que Joan pueda apagar. Se deriva de un hecho que
 *     él siempre sabe (¿lo buscó él, o lo buscaron a él?) más el tipo de lo que
 *     pasó. Si anotar «no contestó» quemara siete días, un martes de treinta
 *     llamadas con veinte buzones le borraría veinte clientes de la cobranza —
 *     y castigar el anotar es la forma más segura de que deje de anotar.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const RELOJ = require('./reloj.js');

/* 17-sep-2026 — LA HORA SE PASA. Dos pruebas de este archivo miran las tablas de
   Cobranzas, y ésas solo tienen filas dentro del horario de la Ley 2300; una
   tercera mide cómo se pinta «hace X» y depende de la hora por su propia
   naturaleza. Con el reloj de la casa las tres miden lo que dicen medir a
   cualquier hora del día. El porqué largo está en reloj.js. */
const HOY = RELOJ.HOY;

/* Gestión de ayer: es lo que pone a alguien detrás de la reja de la semana.
   Relativa y no escrita a mano, para que siga significando «ayer» en 2027. */
const AYER = RELOJ.haceDias(1);

function panel(extra) {
  const P = abrirPanel({ ahora: RELOJ.MOMENTO });
  P.cargarCartera(Object.assign({
    socios: [{ id: 'S1', numero: 1, nombre: 'Ana Perez', cedula: '1',
               telefono: '3001111111', whatsappIgual: true, gestiones: [] }],
    prestamos: [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY }],
    config: { pin: '1234', whatsapp: '3009999999' }
  }, extra || {}));
  return P;
}

/* Le pone a la pantalla las respuestas que daría Joan, sin DOM de verdad. */
function responde(P, quien, tipo, campos) {
  P.ev('document.querySelector=function(s){' +
       ' if(s.indexOf("aQuien")>-1) return {value:"' + quien + '"};' +
       ' if(s.indexOf("aTipo")>-1) return {value:"' + tipo + '"};' +
       ' return null; }');
  if (campos) {
    P.ev('document.getElementById=(function(o){ return function(id){' +
         ' var c=' + JSON.stringify(campos) + ';' +
         ' if(c[id]!==undefined) return {value:c[id]};' +
         ' return o(id); }; })(document.getElementById)');
  }
  P.ev('guardarAnotacionCobro()');
}

describe('anotar y tipificar (16-sep-2026)', () => {

  test('«no contestó» se anota y NO gasta el contacto de la semana', () => {
    /* Es la regla que hace que Joan siga anotando.
       MUTANTE QUE CAZA: meter no_contesta en TIPOS_CON_CONTACTO, o escribir
       siempre en s.gestiones sin mirar el tipo. */
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)');
    responde(P, 'yo', 'no_contesta');
    assert.equal(P.ev('gestiones().length'), 1, 'no quedó anotado lo que pasó');
    assert.equal(P.ev('(DB.socios[0].gestiones||[]).length'), 0,
      'anotar «no contestó» gastó el contacto de la semana: con veinte buzones un ' +
      'martes, Joan se queda sin poder escribirle a veinte clientes');
  });

  test('«promesa de pago» SÍ gasta el contacto de la semana', () => {
    /* Hubo alguien del otro lado y lo buscó Joan: eso es contacto establecido.
       MUTANTE QUE CAZA: sacar promesa de TIPOS_CON_CONTACTO. */
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)');
    responde(P, 'yo', 'promesa', { aMonto: '150000', aFecha: '2026-09-20', aNota: 'le pagan el viernes' });
    assert.equal(P.ev('(DB.socios[0].gestiones||[]).length'), 1,
      'un contacto establecido no quedó en el libro que lee la reja de la semana');
    assert.equal(P.ev('DB.socios[0].gestiones[0].canal'), 'llamada');
    assert.ok(P.ev('DB.socios[0].gestiones[0].hora'),
      'sin hora, el registro no prueba cuándo se contactó');
  });

  test('si el cliente llamó a Joan, NUNCA gasta la semana', () => {
    /* La ley limita que el GESTOR contacte, no que el cliente llame. Es la
       pregunta de hecho, y es la mitad de la regla.
       MUTANTE QUE CAZA: ignorar la respuesta de «quién buscó a quién». */
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)');
    responde(P, 'el', 'promesa', { aMonto: '', aFecha: '', aNota: '' });
    assert.equal(P.ev('gestiones().length'), 1, 'no se anotó la llamada del cliente');
    assert.equal(P.ev('(DB.socios[0].gestiones||[]).length'), 0,
      'el cliente llamó a Joan y le gastó a Joan su propio contacto de la semana');
  });

  test('la promesa guarda cuánto y para cuándo, dentro de la nota', () => {
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)');
    responde(P, 'yo', 'promesa', { aMonto: '150000', aFecha: '2026-09-20', aNota: 'le pagan el viernes' });
    const nota = String(P.ev('gestiones()[0].nota'));
    assert.match(nota, /150\.000/, 'no quedó cuánto prometió');
    assert.match(nota, /20 de sept/, 'no quedó para qué día');
    assert.match(nota, /le pagan el viernes/, 'se perdió lo que Joan escribió');
  });

  test('la anotación guarda desde QUÉ NÚMERO habló Joan', () => {
    /* Es para lo que existe el registro de números: el día que alguien reclame,
       poder decir desde dónde se le contactó.
       MUTANTE QUE CAZA: dejar de escribir `desde`. */
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)');
    responde(P, 'yo', 'contesto');
    assert.equal(P.ev('gestiones()[0].desde'), '3009999999',
      'la anotación no dice desde qué número se habló');
    assert.equal(P.ev('gestiones()[0].quien'), 'Joan');
  });

  test('sin decir quién buscó a quién, no se anota nada', () => {
    /* Es un dato de hecho que decide si se gasta la semana: no puede tener un
       valor por defecto, porque el por defecto se convierte en la respuesta. */
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)');
    P.ev('document.querySelector=function(s){ return s.indexOf("aTipo")>-1?{value:"contesto"}:null; }');
    P.ev('guardarAnotacionCobro()');
    assert.equal(P.ev('gestiones().length'), 0, 'se anotó sin saber quién buscó a quién');
    assert.match(String(P.ev('(window._avisos||[]).join(" ")')), /quién buscó a quién/i);
  });

  test('una anotación NO se puede editar ni borrar', () => {
    /* Una gestión es un hecho con fecha: solo suma. Es lo que la hace servir
       como prueba. El contraejemplo vive en el mismo archivo: `notaRiesgo` es
       un cuadro que se sobrescribe y no prueba nada. */
    const P = panel();
    P.ev('anotarCobro("S1","P1",1)'); responde(P, 'yo', 'contesto');
    P.ev('anotarCobro("S1","P1",1)'); responde(P, 'yo', 'promesa', { aMonto: '', aFecha: '', aNota: '' });
    assert.equal(P.ev('gestiones().length'), 2,
      'la segunda anotación pisó la primera en vez de sumarse');
  });
});

describe('la historia de contacto (16-sep-2026)', () => {

  test('mezcla los DOS libros en una sola línea de tiempo', () => {
    /* s.gestiones es el libro legal (lo que cuenta la semana) y DB.gestiones lo
       tipificado. Verlos aparte obligaría a Joan a armar la historia de cabeza. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana Perez', cedula: '1', telefono: '3001111111',
                 whatsappIgual: true, gestiones: [
                   { fecha: '2026-09-10', canal: 'whatsapp', plantilla: 'venceHoy' },
                   { fecha: '2026-09-12', hora: '2026-09-12T15:30:00Z', canal: 'sms', plantilla: 'mora', tipo: 'cobro' }] }],
      gestiones: [{ id: 'g1', persona_id: 'S1', tipo: 'promesa', cuando: '2026-09-14T10:00:00Z', nota: 'paga el viernes' }]
    });
    P.ev('verHistoriaCobro("S1")');
    const h = String(P.elems['mBody'].innerHTML);
    assert.match(h, /Promesa de pago/, 'falta lo tipificado');
    assert.match(h, /WhatsApp/, 'falta el WhatsApp del libro legal');
    assert.match(h, /Mensaje de texto/, 'falta el SMS');
    /* Y en orden: lo más nuevo primero. */
    assert.ok(h.indexOf('Promesa de pago') < h.indexOf('Mensaje de texto'),
      'la historia no está de lo más nuevo a lo más viejo');
  });

  test('NO dice «sin gestionar» sobre un WhatsApp que sí se mandó', () => {
    /* etiquetaGestion busca el tipo en TIPOS_GESTION, y lo que hay en
       s.gestiones no lo tiene: reusarla pintaría «sin gestionar» al lado de cada
       WhatsApp real y la palabra cruda «cobro» al lado de cada SMS — justo en la
       pantalla que existe para enseñarle a Joan lo que ya tenía.
       MUTANTE QUE CAZA: volver a usar etiquetaGestion en la historia. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001111111',
                 whatsappIgual: true, gestiones: [{ fecha: '2026-09-10', canal: 'whatsapp', plantilla: 'venceHoy' }] }]
    });
    P.ev('verHistoriaCobro("S1")');
    const h = String(P.elems['mBody'].innerHTML);
    assert.doesNotMatch(h, /sin gestionar/i,
      'la historia llama «sin gestionar» a un WhatsApp que Joan sí mandó');
    assert.match(h, /Vence hoy/, 'no se dice qué plantilla se mandó');
  });

  test('sin hora NO se inventa un «hace X»', () => {
    /* Medido: haceCuanto('2026-09-16') a las nueve de la mañana de Bogotá
       devuelve «hace 14 h», porque una fecha sin hora se lee como medianoche UTC
       y Bogotá va cinco horas atrás. A las siete de la noche del MISMO día diría
       «ayer». El día que haya que probarle algo a la SIC, una hora inventada es
       peor que el hueco.
       MUTANTE QUE CAZA: pasar g.fecha por haceCuanto cuando no hay hora. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001111111',
                 whatsappIgual: true, gestiones: [{ fecha: HOY, canal: 'whatsapp', plantilla: 'venceHoy' }] }]
    });
    P.ev('verHistoriaCobro("S1")');
    const h = String(P.elems['mBody'].innerHTML);
    assert.match(h, /sin hora/, 'no se dice que a ese registro le falta la hora');
    assert.doesNotMatch(h, /hace \d+ h/,
      'se inventó una hora relativa sobre una fecha que no tiene hora');
  });

  test('un cliente sin nada anotado lo dice, no sale vacío', () => {
    const P = panel();
    P.ev('verHistoriaCobro("S1")');
    assert.match(String(P.elems['mBody'].innerHTML), /Todavia no hay nada anotado/i);
  });
});

describe('mis números de WhatsApp (16-sep-2026)', () => {

  test('el número que ya estaba entra como el primer tramo', () => {
    const P = panel();
    assert.equal(P.ev('misNumeros().length'), 1, 'la lista nació vacía, negando el número que ya había');
    assert.equal(P.ev('numeroActivoWA()'), '3009999999');
  });

  test('cambiar de número CIERRA el anterior en vez de borrarlo', () => {
    /* Es todo el punto: el viejo con su fecha es lo que prueba desde dónde se
       contactó a alguien el mes pasado.
       MUTANTE QUE CAZA: sobrescribir en vez de sumar. */
    const P = panel();
    P.ev('document.getElementById=(function(o){ return function(id){ ' +
         'return id==="cfgWaNuevo" ? {value:"3002222222"} : o(id); }; })(document.getElementById)');
    P.ev('agregarNumeroWA()');
    assert.equal(P.ev('misNumeros().length'), 2, 'se perdió el número anterior');
    assert.equal(P.ev('numeroActivoWA()'), '3002222222');
    assert.ok(P.ev('misNumeros()[0].hasta'), 'el anterior quedó sin fecha de salida');
    assert.equal(P.ev('DB.config.whatsapp'), '3002222222',
      'el número que va escrito dentro de los mensajes no se actualizó');
  });

  test('guardar CUALQUIER otro ajuste no le borra el número', () => {
    /* guardarCfg leía un input suelto. Al sacar ese input, la próxima vez que
       Joan guardara cualquier ajuste habría escrito `whatsapp = ''`, y todos los
       SMS saldrían diciendo «Escríbenos al  ».
       MUTANTE QUE CAZA: volver a leer gv('cfgWa') en guardarCfg. */
    const P = panel();
    P.ev('guardarCfg()');
    assert.equal(P.ev('DB.config.whatsapp'), '3009999999',
      'guardar otro ajuste borró el número con el que salen los mensajes');
  });

  test('dos aparatos NO se pisan la lista', () => {
    /* Medido antes de construirlo: dentro de `config` el segundo aparato en
       subir le borraba la lista al primero, sin choque y sin aviso, porque
       `config` no tiene identidad de lista. Por eso vive en su propia clave. */
    const N = require('../panel/nube.js');
    assert.ok(N.CLAVES_AJUSTES.indexOf('misNumeros') > -1, 'la lista no viaja a la nube');
    assert.deepEqual(N.LISTAS_DE_AJUSTES.misNumeros, ['numero', 'desde'],
      'sin identidad, el aparato que suba de segundo borra la lista del primero');
    const r = N.fusionarAjuste('misNumeros',
      [{ numero: '3001111111', desde: '2026-09-01', hasta: '2026-09-10', motivo: 'me lo bloquearon' }],
      [{ numero: '3002222222', desde: '2026-09-10' }]);
    const t = JSON.stringify(r.valor || r);
    assert.ok(t.indexOf('3001111111') > -1 && t.indexOf('3002222222') > -1,
      'al juntar dos aparatos se perdió un tramo de la historia de números');
  });
});

describe('los botones de la fila (16-sep-2026)', () => {

  test('los tres botones salen en LAS DOS tablas', () => {
    /* La de abajo es la de quien la ley dejó fuera hoy. Gana botones y NO gana
       casillas: mirar, anotar y cobrar no es contactar, y ahí vive buena parte
       de la cartera. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001111111', whatsappIgual: true,
                 gestiones: [{ fecha: AYER, hora: AYER + 'T10:00:00Z', canal: 'sms', tipo: 'cobro' }] },
               { id: 'S2', numero: 2, nombre: 'Luis', cedula: '2', telefono: '3002222222', whatsappIgual: true, gestiones: [] }],
      prestamos: [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY },
                  { id: 'P2', socioId: 'S2', monto: 300000, fechaPago: HOY }]
    });
    P.ev('renderCobranzas()');
    const arriba = String(P.elems['tblCobranzas'].innerHTML);
    const abajo = String(P.elems['tblFueraCob'].innerHTML);

    for (const [donde, html] of [['arriba', arriba], ['abajo', abajo]]) {
      assert.match(html, /verHistoriaCobro/, 'falta «Su historia» en la tabla de ' + donde);
      assert.match(html, /anotarCobro/, 'falta «Anotar» en la tabla de ' + donde);
      assert.match(html, /pagoDesdeCobro/, 'falta «Pago» en la tabla de ' + donde);
    }
    assert.equal((abajo.match(/type="checkbox"/g) || []).length, 0,
      'la tabla de los que la ley excluyó tiene casillas: se puede agregar a alguien que no se puede contactar');
  });

  test('la tabla de abajo dice CUÁNDO se libera', () => {
    /* tanda.js ya calculaba ese detalle y nadie lo pintaba. «Ya lo contactaste
       esta semana» sin decir cuándo se libera deja a Joan con la pregunta que
       precisamente se está haciendo. */
    const P = panel({
      socios: [{ id: 'S1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001111111', whatsappIgual: true,
                 gestiones: [{ fecha: AYER, hora: AYER + 'T10:00:00Z', canal: 'sms', tipo: 'cobro' }] }]
    });
    P.ev('renderCobranzas()');
    assert.match(String(P.elems['tblFueraCob'].innerHTML), /Se libera en \d+ día/,
      'no se dice cuándo se puede volver a escribir');
  });
});
