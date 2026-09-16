/* ===========================================================================
 * LA ESTRATEGIA Y EL MENSAJE PROPIO
 *
 * Joan lo pidió el 16-sep-2026: «dandome la opcion de seleccionar a mis
 * clientes segun mi estrategia» y «mensajes personalizados».
 *
 * LA REGLA QUE NO SE NEGOCIA, y es lo primero que se prueba: una estrategia
 * ELIGE ENTRE los que la Ley 2300 ya dejó pasar. No puede agregar a nadie de la
 * tabla de abajo. Y eso no es una promesa escrita en un comentario: es una
 * consecuencia de DÓNDE corre el filtro — después de armarTanda y sobre lo que
 * ella devuelve, así que solo puede quitar.
 *
 * DOS COSAS QUE SE MIDIERON ANTES DE CONSTRUIR:
 *   · armarTanda se queda con UN caso por persona, el de corte más antiguo. Un
 *     socio con un crédito en mora de agosto y otro que vence hoy conserva el de
 *     agosto, así que un filtro que mirara `caso.credito` lo haría desaparecer
 *     de «vencen hoy». Por eso las estrategias preguntan por la PERSONA.
 *   · `plantillas` REEMPLAZABA el mapa entero de nueve textos, y el respaldo es
 *     `pSMS[clave] || pSMS.venceHoy`: un mapa a medias le mandaba al cliente la
 *     palabra «undefined» pegada al aviso de salida. Y se paga.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const E = require('../app/cobranza-envio.js');
const T = require('../panel/tanda.js');

const HOY = new Date().toISOString().slice(0, 10);
const socio = (id, n, tel) => ({ id, numero: Number(id.slice(1)), nombre: n, cedula: id,
                                 telefono: tel, whatsappIgual: true, gestiones: [] });

function panel(socios, prestamos) {
  const P = abrirPanel();
  P.cargarCartera({ socios, prestamos, config: { pin: '1234', whatsapp: '3009999999' } });
  return P;
}

describe('la estrategia NO puede agregar a nadie (16-sep-2026)', () => {

  test('filtrarCasos solo devuelve gente que ya estaba en la lista', () => {
    /* La garantía de fondo, probada como propiedad: para TODA estrategia, lo que
       sale es un subconjunto de lo que entró.
       MUTANTE QUE CAZA: una estrategia que consulte DB y agregue a alguien. */
    const P = panel(
      [socio('S1', 'Ana', '3001111111'), socio('S2', 'Luis', '3002222222')],
      [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY },
       { id: 'P2', socioId: 'S2', monto: 500000, fechaPago: '2026-08-20' }]);

    const ids = P.ev('ESTRATEGIAS.map(function(e){return e.id;}).join("|")').split('|');
    for (const id of ids) {
      const dentro = P.ev('casosDeCobroHoy().length');
      const fuera = P.ev('filtrarCasos(casosDeCobroHoy(), "' + id + '").length');
      assert.ok(fuera <= dentro,
        'la estrategia «' + id + '» devolvió MÁS gente de la que le entregaron: ' +
        fuera + ' de ' + dentro);
      const propios = P.ev('filtrarCasos(casosDeCobroHoy(), "' + id +
        '").every(function(c){ return casosDeCobroHoy().some(function(x){ return x.id===c.id; }); })');
      assert.equal(propios, true,
        'la estrategia «' + id + '» sacó de la nada a alguien que no estaba en la lista');
    }
  });

  test('el filtro corre DESPUÉS de la reja, no antes', () => {
    /* Si corriera antes, podría cambiar a quién ve la reja. Se comprueba por
       consecuencia: alguien excluido por la Ley 2300 NO aparece arriba con
       ninguna estrategia. */
    const P = panel(
      [Object.assign(socio('S1', 'Ana', '3001111111'), {
        gestiones: [{ fecha: '2026-09-14', hora: '2026-09-14T10:00:00Z', canal: 'sms', tipo: 'cobro' }] })],
      [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY }]);
    const ids = P.ev('ESTRATEGIAS.map(function(e){return e.id;}).join("|")').split('|');
    for (const id of ids) {
      P.ev('elegirEstrategia("' + id + '")');
      assert.equal(P.ev('_cob.filas.length'), 0,
        'con la estrategia «' + id + '» se le puede escribir a alguien a quien la ' +
        'Ley 2300 no deja contactar esta semana');
    }
  });

  test('«vencen hoy» NO pierde a quien debe varios créditos', () => {
    /* Medido: armarTanda conserva el crédito de corte más antiguo. Rosa tiene
       uno que vence hoy y otro del 1 de septiembre; sobrevive el viejo. Mirar
       `caso.credito` la haría desaparecer de esta estrategia.
       MUTANTE QUE CAZA: que la estrategia lea el estado del crédito que
       sobrevivió en vez de los estados de la persona. */
    const P = panel(
      [socio('S3', 'Rosa', '3003333333')],
      [{ id: 'P3', socioId: 'S3', monto: 100000, fechaPago: HOY },
       { id: 'P4', socioId: 'S3', monto: 150000, fechaPago: '2026-09-01' }]);

    /* Primero se comprueba que la trampa existe de verdad. */
    const casos = P.ev('casosDeCobroHoy()');
    const sobrevive = P.ev('(function(){var t=TandaTuGarantia.armarTanda(casosDeCobroHoy(),' +
      '{hoy:hoyISO(),horario:{ok:true},tipo:"cobro",grupo:"cobranzas",saltados:[]});' +
      'return t.pendientes[0].fecha_pago;})()');
    assert.notEqual(sobrevive, HOY,
      'el crédito que sobrevive ya es el de hoy: esta prueba dejó de medir la trampa');

    P.ev('elegirEstrategia("hoy")');
    assert.equal(P.ev('_cob.filas.length'), 1,
      'Rosa desapareció de «vencen hoy» aunque sí tiene un crédito que vence hoy');
  });

  test('la pantalla dice cuántos cumplen Y cuántos se pueden contactar', () => {
    /* Un filtro que solo dice cuántos quedaron arriba deja a Joan preguntándose
       dónde están los demás, y termina rehaciendo la lista a mano por fuera. */
    const P = panel(
      [socio('S1', 'Ana', '3001111111'),
       Object.assign(socio('S2', 'Luis', '3002222222'), {
         gestiones: [{ fecha: '2026-09-14', hora: '2026-09-14T10:00:00Z', canal: 'sms', tipo: 'cobro' }] })],
      [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY },
       { id: 'P2', socioId: 'S2', monto: 300000, fechaPago: HOY }]);
    P.ev('elegirEstrategia("hoy")');
    assert.equal(P.ev('_cob.cumplen'), 2, 'no se cuentan los que cumplen la estrategia');
    assert.equal(P.ev('_cob.filas.length'), 1, 'no se separan los que sí se pueden contactar');
    const txt = String(P.elems['estrategiaCob'].innerHTML);
    assert.match(txt, /2<\/b> que cumplen/, 'no se dice cuántos cumplen la estrategia');
    /* En singular la frase dice «El otro está abajo» y en plural «Los otros N
       están abajo»: las dos valen, y la prueba mide lo que importa —que se diga
       dónde quedaron— y no cómo se conjuga. */
    assert.match(txt, /est[áa]n? abajo/, 'no se dice dónde quedaron los otros');
  });

  test('«solo los primeros N» marca N y deja el resto SIN marcar', () => {
    /* No los saca de la lista: solo no los marca. Los que no se marcan conservan
       su contacto de la semana. */
    const P = panel(
      [socio('S1', 'Ana', '3001111111'), socio('S2', 'Luis', '3002222222'), socio('S3', 'Rosa', '3003333333')],
      [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY },
       { id: 'P2', socioId: 'S2', monto: 300000, fechaPago: HOY },
       { id: 'P3', socioId: 'S3', monto: 400000, fechaPago: HOY }]);
    P.ev('renderCobranzas()');
    assert.equal(P.ev('_cob.filas.length'), 3);
    P.ev('soloLosPrimeros(2)');
    assert.equal(P.ev('filasMarcadas().length'), 2, 'no marcó exactamente los primeros dos');
    assert.equal(P.ev('_cob.filas.length'), 3,
      'los que no se marcaron desaparecieron de la lista: tienen que seguir visibles');
  });
});

describe('lo que Joan lee en la pantalla (16-sep-2026)', () => {

  test('la tabla nombra la plantilla en cristiano, no con su clave', () => {
    /* Las claves de los SMS viven en cobranza-envio.js y PLANTILLAS_DEF —que es
       el mapa de WhatsApp— no las conoce, así que la tabla pintaba «variasMora».
       MUTANTE QUE CAZA: quitar NOMBRE_SMS y volver a caer en la clave cruda. */
    const P = panel([socio('S1', 'Ana', '3001111111')],
                    [{ id: 'P1', socioId: 'S1', monto: 200000, fechaPago: HOY },
                     { id: 'P2', socioId: 'S1', monto: 100000, fechaPago: HOY }]);
    P.ev('renderCobranzas()');
    const html = String(P.elems['tblCobranzas'].innerHTML);
    assert.doesNotMatch(html, /variasHoy|variasMora|moraTemprana/,
      'la tabla le enseña a Joan el nombre interno de la plantilla');
    assert.match(html, /Varios cr[eé]ditos/,
      'no se nombra la plantilla de quien debe varios créditos');
  });
});

describe('el mensaje propio (16-sep-2026)', () => {

  test('una plantilla A MEDIAS no le manda «undefined» al cliente', () => {
    /* Era el código vivo hasta hoy: `plantillas` reemplazaba el mapa entero de
       nueve textos, y el respaldo `pSMS[clave] || pSMS.venceHoy` fallaba también,
       así que salía literalmente «undefined Responde SALIR…». Y se paga.
       MUTANTE QUE CAZA: volver a `(o.plantillas && o.plantillas.sms) || SMS`. */
    const caso = { id: 'C1', socioId: 'S1', telefono: '3001234567', nombre: 'Ana',
                   saldo: 120000, saldo_total: 300000, cuantos: 2, fecha_pago: '2026-09-20' };
    const f = E.filasDeEnvio([caso], { plantillas: { sms: { mora: 'X {saldo}' } } }).filas[0];
    assert.ok(f, 'no se armó la fila');
    assert.doesNotMatch(f.mensaje_sms, /undefined/,
      'al cliente le llega la palabra «undefined», y ese SMS se paga: «' + f.mensaje_sms + '»');
  });

  test('un texto propio vacío devuelve el de la casa, no un mensaje en blanco', () => {
    const caso = { id: 'C1', socioId: 'S1', telefono: '3001234567', nombre: 'Ana',
                   saldo: 120000, fecha_pago: HOY };
    const f = E.filasDeEnvio([caso], { plantillas: { sms: { venceHoy: '   ' } } }).filas[0];
    assert.ok(f.mensaje_sms.length > 20, 'un texto vacío dejó al cliente sin mensaje');
  });

  test('el aviso de salida se pega SIEMPRE, también con texto propio', () => {
    /* En Colombia no es cortesía: es condición para poder mandar el mensaje.
       MUTANTE QUE CAZA: dejar que el texto propio se entregue ya armado y se
       salte SALIDA_SMS. */
    const caso = { id: 'C1', socioId: 'S1', telefono: '3001234567', nombre: 'Ana',
                   saldo: 120000, fecha_pago: HOY };
    const f = E.filasDeEnvio([caso], { plantillas: { sms: { venceHoy: 'Pague hoy {saldo}' } } }).filas[0];
    assert.match(f.mensaje_sms, /SALIR/, 'el mensaje propio salió sin la forma de darse de baja');
  });

  test('la vista previa enseña lo que SALE, no lo que Joan tecleó', () => {
    /* filasDeEnvio pasa el SMS por sinTildes, que borra tildes y emoji ANTES de
       medir. Enseñar el borrador le mentiría sobre lo que lee el cliente y sobre
       lo que cuesta.
       MUTANTE QUE CAZA: medir y mostrar el borrador. */
    const P = panel([socio('S1', 'Ana', '3001111111')],
                    [{ id: 'P1', socioId: 'S1', monto: 180000, fechaPago: HOY }]);
    P.ev('editorMensajes()');
    P.ev('document.getElementById=(function(o){return function(id){' +
         ' if(id==="pm_venceHoy") return {value:"\\u00a1P\\u00e1gueme hoy {saldo} \\ud83d\\ude4f"};' +
         ' return o(id); };})(document.getElementById)');
    P.ev('previaMensaje("venceHoy")');
    const pv = String(P.elems['pv_venceHoy'].innerHTML);
    assert.match(pv, /Al cliente le llega/, 'no se enseña lo que sale');
    assert.doesNotMatch(pv, /águeme/,
      'la vista previa enseña el borrador con tildes, y al cliente le llega sin ellas');
    assert.match(pv, /tildes/i, 'no se avisa que se quitaron las tildes');
  });

  test('y el CONTADOR mide lo limpio, no el borrador', () => {
    /* La mitad cara del punto anterior, y la que se escapó en el primer intento:
       mirar solo el texto mostrado deja pasar un contador que mida el borrador.
       Un texto de ~100 caracteres CON una tilde es UCS-2 y se parte en dos (70
       por pedazo); el mismo texto ya limpio es GSM-7 y cabe en uno. Medir el
       borrador le diría a Joan que paga el doble de lo que paga — y el día que
       sea al revés, le escondería el costo.
       MUTANTE QUE CAZA: `E.pedazosSMS(borrador)` en vez de `E.pedazosSMS(sale)`. */
    const largo = 'Buenos dias {nombre}, le recordamos con mucho carinio que su pago de {saldo} ' +
                  'esta pendiente el dia de hoy, gracias.';
    const conTilde = largo.replace('carinio', 'cariño').replace('dias', 'días');

    /* Primero: que el caso de verdad separe los dos alfabetos. */
    assert.equal(E.pedazosSMS(conTilde).alfabeto, 'UCS-2');
    assert.ok(E.pedazosSMS(conTilde).pedazos > E.pedazosSMS(E.sinTildes(conTilde)).pedazos,
      'este texto ya no cuesta distinto con tildes: hay que rehacer la prueba');

    const P = panel([], []);
    P.ev('editorMensajes()');
    P.ev('document.getElementById=(function(o){return function(id){' +
         ' if(id==="pm_venceHoy") return {value:' + JSON.stringify(conTilde) + '};' +
         ' return o(id); };})(document.getElementById)');
    P.ev('previaMensaje("venceHoy")');
    const pv = String(P.elems['pv_venceHoy'].innerHTML);

    /* Lo que sale de verdad, para comparar contra lo que la pantalla dice. */
    const caso = { id: 'X', socioId: 'X', telefono: '3001234567', nombre: 'Maria Rodriguez',
                   saldo: 180000, saldo_total: 180000, cuantos: 1, fecha_pago: HOY };
    const real = E.pedazosSMS(E.filasDeEnvio([caso], { plantillas: { sms: { venceHoy: conTilde } } }).filas[0].mensaje_sms);

    assert.match(pv, new RegExp('\\b' + real.caracteres + ' caracteres'),
      'la pantalla no cuenta los caracteres del mensaje que de verdad sale');
    assert.match(pv, real.pedazos === 1 ? /<b>1 mensaje<\/b>/ : new RegExp('>' + real.pedazos + ' mensajes'),
      'la pantalla le dice a Joan un precio distinto del que va a pagar');
  });

  test('el mensaje de quien debe VARIOS exige decir cuántos', () => {
    /* La ley deja UN mensaje por persona. Si a quien debe tres créditos se le
       escribe de uno solo, paga ese, cree que quedó al día, y a la semana recibe
       otro cobro que no entiende.
       MUTANTE QUE CAZA: quitar la validación de {cuantos}. */
    const P = panel([], []);
    P.ev('editorMensajes()');
    P.ev('document.getElementById=(function(o){return function(id){' +
         ' if(id==="pm_variasHoy") return {value:"Hola {nombre}, debes {saldo}"};' +
         ' return o(id); };})(document.getElementById)');
    P.ev('guardarMensajes()');
    assert.ok(!P.ev('DB.config.plantillasSMS'),
      'se guardó un mensaje para quien debe varios créditos que no dice cuántos son');
    assert.match(String(P.ev('(window._avisos||[]).join(" ")')), /\{cuantos\}/);
  });

  test('con {cuantos} sí guarda, y sale en el mensaje', () => {
    const P = panel([], []);
    P.ev('editorMensajes()');
    P.ev('document.getElementById=(function(o){return function(id){' +
         ' if(id==="pm_variasHoy") return {value:"Hola {nombre}, tus {cuantos} creditos suman {saldo}"};' +
         ' return o(id); };})(document.getElementById)');
    P.ev('guardarMensajes()');
    assert.ok(P.ev('DB.config.plantillasSMS && DB.config.plantillasSMS.variasHoy'),
      'no se guardó un mensaje que sí cumple');

    const caso = { id: 'C1', socioId: 'S1', telefono: '3001234567', nombre: 'Ana',
                   saldo: 100000, saldo_total: 300000, cuantos: 3, fecha_pago: HOY };
    const f = E.filasDeEnvio([caso], { plantillas: { sms: { variasHoy: 'Hola {nombre}, tus {cuantos} creditos suman {saldo}' } } }).filas[0];
    assert.match(f.mensaje_sms, /tus 3 creditos/, 'el mensaje no dice cuántos créditos debe');
  });
});
