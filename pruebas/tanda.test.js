/* ============================================================================
 * Pruebas de la tanda — panel/tanda.js
 *
 *   cd pruebas && node --test tanda.test.js
 *
 * QUÉ CUIDAN, Y POR QUÉ MERECEN EXISTIR.
 * Una tanda es una máquina de contactar gente en orden. Si la compuerta legal
 * está mal, deja de ser una ayuda y se convierte en una máquina de incumplir la
 * Ley 2300 de forma ordenada Y CON REGISTRO ESCRITO DE QUE LO HICIMOS — que es
 * peor que hacerlo a mano, porque el registro es la prueba en contra.
 *
 * Por eso lo que se prueba acá no es que la lista salga bonita: es que NADIE
 * entre a la lista si la ley no lo permite en ese momento.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../panel/tanda.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const HOY = '2026-08-14';           // viernes
const ABIERTO = { ok: true };
const CERRADO = { ok: false, motivo: 'domingo' };

/* Un socio de mentira con las gestiones que le pongamos. */
function socio(id, gestiones, extra) {
  return Object.assign({ id, nombre: 'Socio ' + id, gestiones: gestiones || [] }, extra || {});
}
function caso(s, tel) {
  return { id: 'p' + s.id, socioId: s.id, socio: s, telefono: tel === undefined ? '3001234567' : tel };
}
function g(fecha, canal, extra) {
  return Object.assign({ fecha, canal: canal || 'whatsapp', plantilla: 'mora' }, extra || {});
}

/* ==========================================================================
 * 1 · LOS DOS TOPES DE LA LEY 2300
 * ======================================================================== */

describe('el tope diario y el semanal salen de la misma cuenta', () => {

  test('sin gestiones, no hay tope que aplique', () => {
    const s = socio('a');
    assert.equal(T.contactadoHoy(s, HOY), false);
    assert.equal(T.contactadoEstaSemana(s, HOY).si, false);
  });

  test('contactado hoy: bloquea el diario Y el semanal', () => {
    const s = socio('a', [g(HOY)]);
    assert.equal(T.contactadoHoy(s, HOY), true);
    assert.equal(T.contactadoEstaSemana(s, HOY).si, true);
  });

  test('contactado ayer: el diario deja pasar, el semanal NO', () => {
    /* Esta es LA prueba de la entrega. Hasta hoy el repositorio solo tenía el
       tope diario (crm.html:976, espejo.html:619), así que un socio contactado
       ayer aparecía disponible hoy — y la Ley 2300 dice que no. */
    const s = socio('a', [g('2026-08-13')]);
    assert.equal(T.contactadoHoy(s, HOY), false, 'ayer no es hoy');
    assert.equal(T.contactadoEstaSemana(s, HOY).si, true, 'el tope semanal tiene que atraparlo');
  });

  test('la ventana es de 7 días MÓVILES: al séptimo día se libera, no antes', () => {
    const seis = socio('a', [g('2026-08-08')]);   // hace 6 días
    const siete = socio('b', [g('2026-08-07')]);  // hace 7 días
    assert.equal(T.contactadoEstaSemana(seis, HOY).si, true, 'a los 6 días todavía no');
    assert.equal(T.contactadoEstaSemana(siete, HOY).si, false, 'a los 7 se libera');
  });

  test('dice CUÁNDO fue y POR QUÉ CANAL, no solo que no se puede', () => {
    /* «No puedes» sin motivo es un número en el que Joan no confía, y termina
       abriendo WhatsApp por fuera de la tanda, que es justo lo que la tanda
       viene a evitar. */
    const s = socio('a', [g('2026-08-11', 'llamada')]);
    const r = T.contactadoEstaSemana(s, HOY);
    assert.equal(r.dias, 3);
    assert.equal(r.gestion.canal, 'llamada');
    assert.equal(T.canalUsadoEstaSemana(s, HOY), 'llamada');
  });

  test('con varias gestiones en la semana manda LA MÁS RECIENTE', () => {
    const s = socio('a', [g('2026-08-09'), g('2026-08-12'), g('2026-08-10')]);
    assert.equal(T.contactadoEstaSemana(s, HOY).dias, 2);
  });

  test('EL TOPE ES POR PERSONA, NO POR CRÉDITO', () => {
    /* El artículo 3 habla del «consumidor». Un socio con dos créditos sigue
       siendo UN contacto al día. Se comprueba en el sitio donde se decide:
       dos casos distintos que apuntan al MISMO socio. */
    const s = socio('a', [g(HOY)]);
    const t = T.armarTanda([caso(s), Object.assign(caso(s), { id: 'p2' })],
      { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.equal(t.pendientes.length, 0, 'el segundo crédito no puede colarse por ser otro crédito');
    assert.equal(t.fuera.length, 1, 'y se queda fuera UNA persona, no dos: el tope es del consumidor');
  });

  test('un socio con dos créditos aparece UNA vez, no dos', () => {
    /* Si apareciera dos veces, la caja de arriba diría «puedes escribirle a 9»
       contando a la misma persona dos veces, y el segundo contacto del día
       sería una infracción del artículo 3. */
    const s = socio('a');
    const t = T.armarTanda(
      [Object.assign(caso(s), { id: 'p1', orden: '2026-08-14' }),
       Object.assign(caso(s), { id: 'p2', orden: '2026-08-20' })],
      { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.equal(t.pendientes.length, 1);
    assert.equal(t.pendientes[0].id, 'p1', 'se queda el más urgente');
    assert.equal(t.pendientes[0].otrosDelMismoSocio, 1, 'y dice cuántos más tiene esa persona');
  });

  test('una gestión sin fecha se ignora, no bloquea para siempre', () => {
    const s = socio('a', [{ canal: 'whatsapp' }]);
    assert.equal(T.contactadoEstaSemana(s, HOY).si, false);
  });

  test('una gestión con fecha futura SÍ cuenta', () => {
    /* Es un reloj mal puesto, no una licencia para escribir otra vez. */
    const s = socio('a', [g('2026-08-20')]);
    assert.equal(T.contactadoHoy(s, HOY), true);
  });

  test('la fecha no se corre por la zona horaria', () => {
    /* Colombia es UTC-5: `new Date('2026-08-14')` a secas es el 13 a las 7pm.
       Si eso se colara, todo el tope estaría un día desplazado. */
    const s = socio('a', [g('2026-08-14')]);
    assert.equal(T.contactosEnVentana(s, '2026-08-14', 1).length, 1);
    assert.equal(T.contactosEnVentana(s, '2026-08-15', 1).length, 0);
  });
});

/* ==========================================================================
 * 2 · QUIÉN SE QUEDA FUERA Y POR QUÉ
 * ======================================================================== */

describe('la exclusión dice un motivo, y el motivo correcto', () => {

  test('fuera de horario NO entra nadie, tenga o no teléfono', () => {
    const s = socio('a');
    const t = T.armarTanda([caso(s), caso(socio('b'), '')],
      { hoy: HOY, horario: CERRADO, tipo: 'cobro' });
    assert.equal(t.pendientes.length, 0);
    assert.deepEqual(t.fuera.map(f => f.motivo.clave), ['horario', 'horario']);
  });

  test('el horario gana al teléfono: primero lo que Joan no puede arreglar', () => {
    /* Decirle «no tiene teléfono» a alguien que además está fuera de horario lo
       manda a editar una ficha que igual no va a poder usar hoy. */
    const m = T.motivoDeExclusion(caso(socio('a'), ''), { hoy: HOY, horario: CERRADO, tipo: 'cobro' });
    assert.equal(m.clave, 'horario');
  });

  test('el motivo del horario viaja con el detalle («domingo»)', () => {
    const m = T.motivoDeExclusion(caso(socio('a')), { hoy: HOY, horario: CERRADO, tipo: 'cobro' });
    assert.equal(m.detalle, 'domingo');
  });

  test('sin teléfono en la ficha no hay chat que abrir', () => {
    const m = T.motivoDeExclusion(caso(socio('a'), ''), { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.equal(m.clave, 'sinTel');
  });

  test('los motivos se cuentan por separado, con nombre', () => {
    const casos = [
      caso(socio('a')),                       // puede
      caso(socio('b', [g(HOY)])),             // ya hoy
      caso(socio('c', [g('2026-08-12')])),    // ya esta semana
      caso(socio('d'), '')                    // sin teléfono
    ];
    const r = T.resumenDeTanda(T.armarTanda(casos, { hoy: HOY, horario: ABIERTO, tipo: 'cobro' }));
    assert.equal(r.total, 4);
    assert.equal(r.puedes, 1);
    assert.equal(r.fuera, 3);
    const porClave = Object.fromEntries(r.porMotivo.map(m => [m.clave, m.cuantos]));
    assert.deepEqual(porClave, { hoy: 1, semana: 1, sinTel: 1 });
  });

  test('la suma cuadra siempre: puedes + fuera + saltados = total', () => {
    const casos = [caso(socio('a')), caso(socio('b', [g(HOY)])), caso(socio('c'))];
    const t = T.armarTanda(casos, { hoy: HOY, horario: ABIERTO, tipo: 'cobro', saltados: [{ socioId: 'c', motivo: 'prometió pagar' }] });
    const r = T.resumenDeTanda(t);
    assert.equal(r.puedes + r.fuera + r.saltados, r.total,
      'si la suma no cuadra, alguien desapareció de la lista sin que nadie decidiera nada');
  });

  test('y también cuadra cuando un socio tiene varios créditos', () => {
    /* Acá es donde se rompía si la deduplicación fuera después del filtro: el
       total contaría créditos y los motivos contarían personas. */
    const dos = socio('a', [g(HOY)]);
    const casos = [caso(dos), Object.assign(caso(dos), { id: 'p2' }), caso(socio('b'))];
    const r = T.resumenDeTanda(T.armarTanda(casos, { hoy: HOY, horario: ABIERTO, tipo: 'cobro' }));
    assert.equal(r.total, 2, 'el total son PERSONAS');
    assert.equal(r.puedes + r.fuera + r.saltados, r.total);
    assert.equal(r.porMotivo.find(m => m.clave === 'hoy').cuantos, 1,
      'la señora con dos créditos es UNA persona ya contactada, no dos');
    assert.equal(r.creditosAgrupados, 1, 'y el crédito que se agrupó tampoco se calla');
  });
});

/* ==========================================================================
 * 3 · SERVICIO NO ES COBRANZA, PERO ANOTA IGUAL
 * ======================================================================== */

describe('la tanda de servicio («pagaron ayer»)', () => {

  test('no gasta el cupo: agradecer un pago no es gestión de cobranza', () => {
    /* Ley 2300, art. 8: se exceptúa la confirmación de operaciones. */
    const s = socio('a', [g(HOY)]);
    const m = T.motivoDeExclusion(caso(s), { hoy: HOY, horario: ABIERTO, tipo: 'servicio', grupo: 'pagaron-ayer' });
    assert.equal(m, null);
  });

  test('pero NO agradece dos veces el mismo día', () => {
    /* Sin esto la tanda de servicio es una máquina de mandar dos «gracias por
       tu pago» seguidos: como los topes no la excluyen, la persona sigue en la
       lista después de escribirle. No infringe ninguna ley y queda igual de mal. */
    const s = socio('a', [g(HOY, 'whatsapp', { grupo: 'pagaron-ayer', origen: 'tanda' })]);
    const ctx = { hoy: HOY, horario: ABIERTO, tipo: 'servicio', grupo: 'pagaron-ayer' };
    assert.equal(T.motivoDeExclusion(caso(s), ctx).clave, 'yaEnGrupo');
    assert.equal(T.armarTanda([caso(s)], ctx).pendientes.length, 0);
  });

  test('y un contacto de COBRO de hoy no le impide agradecerle', () => {
    /* Son cosas distintas: le cobré en la mañana y pagó al mediodía. */
    const s = socio('a', [g(HOY, 'whatsapp', { grupo: 'mora', origen: 'tanda' })]);
    const m = T.motivoDeExclusion(caso(s), { hoy: HOY, horario: ABIERTO, tipo: 'servicio', grupo: 'pagaron-ayer' });
    assert.equal(m, null);
  });

  test('pero el horario sí la gobierna', () => {
    const m = T.motivoDeExclusion(caso(socio('a')), { hoy: HOY, horario: CERRADO, tipo: 'servicio' });
    assert.equal(m.clave, 'horario');
  });
});

/* ==========================================================================
 * 4 · PUBLICIDAD — BLOQUEADA, Y CON LOS MOTIVOS ESCRITOS
 * ======================================================================== */

describe('la publicidad no puede salir habilitada como si nada', () => {

  test('está bloqueada aunque la cartera esté llena', () => {
    const b = T.bloqueoDePublicidad([socio('a'), socio('b'), socio('c')]);
    assert.equal(b.bloqueada, true);
    assert.equal(b.autorizados, 0, 'nadie ha autorizado: el consentimiento no se presume');
    assert.equal(b.total, 3, 'el total sí se dice, para que el cero se entienda');
  });

  test('sigue bloqueada aunque alguien tuviera la casilla marcada', () => {
    /* Marcar una casilla hoy no sería una autorización válida: la política
       publicada no declara la finalidad publicitaria. El bloqueo NO depende del
       dato del socio, y esta prueba es la que impide que alguien lo "arregle"
       marcando fichas. */
    const b = T.bloqueoDePublicidad([socio('a', [], { autorizaPublicidad: { valor: true, fecha: HOY } })]);
    assert.equal(b.bloqueada, true);
    assert.equal(b.autorizados, 1, 'se cuenta, pero no desbloquea');
  });

  test('los cuatro impedimentos están nombrados, con quién los resuelve', () => {
    const claves = T.FALTA_PUBLICIDAD.map(f => f.clave);
    ['autorizacion', 'baja', 'rne', 'responsable'].forEach(k =>
      assert.ok(claves.includes(k), 'falta explicar el impedimento «' + k + '»'));
    T.FALTA_PUBLICIDAD.forEach(f => {
      assert.ok(f.titulo && f.texto && f.quien, 'un impedimento sin dueño no lo resuelve nadie');
      assert.ok(f.texto.length > 80, '«' + f.clave + '»: el motivo es demasiado corto para explicar nada');
    });
  });

  test('a nadie en mora se le manda publicidad: está en la definición del grupo', () => {
    /* Ofrecerle un crédito nuevo a quien está atrasado es cobranza disfrazada y
       hace CRECER la exposición de Joan. Si algún día alguien quita `sinDeuda`,
       esta prueba se cae. */
    T.gruposDeTipo('publicidad').forEach(gr =>
      assert.equal(gr.sinDeuda, true, 'el grupo «' + gr.clave + '» podría escribirle a alguien que debe'));
  });

  test('la autorización por defecto es NO, y una baja pesa más que un sí', () => {
    const ctx = { hoy: HOY, horario: ABIERTO, tipo: 'publicidad' };
    assert.equal(T.motivoDeExclusion(caso(socio('a')), ctx).clave, 'sinAutorizacion');
    const conBaja = socio('b', [], { autorizaPublicidad: { valor: true, baja: '2026-08-01' } });
    assert.equal(T.motivoDeExclusion(caso(conBaja), ctx).clave, 'baja');
  });
});

/* ==========================================================================
 * 5 · LO QUE LA PANTALLA PROMETE
 * ======================================================================== */

describe('la tanda no promete lo que no hace', () => {

  test('la cuenta de minutos es de ENVÍO y crece con la lista', () => {
    assert.deepEqual(T.minutosDeEnvio(0), { min: 0, max: 0 });
    const veinte = T.minutosDeEnvio(20);
    assert.ok(veinte.min >= 8 && veinte.max <= 14, JSON.stringify(veinte));
    assert.ok(T.minutosDeEnvio(50).max > veinte.max);
  });

  test('una sola persona nunca dice «0 minutos»', () => {
    assert.equal(T.minutosDeEnvio(1).min, 1, 'decir 0 minutos es prometer que es gratis');
  });

  test('el aviso de ritmo aparece en el tope y no antes', () => {
    const ahora = new Date('2026-08-14T10:00:00-05:00');
    const conN = n => [socio('a', Array.from({ length: n }, (_, i) =>
      g(HOY, 'whatsapp', { hora: new Date(ahora.getTime() - i * 60000).toISOString() })))];
    assert.equal(T.avisoDeRitmo(conN(T.TOPE_CHATS_HORA - 1), ahora), null);
    assert.ok(T.avisoDeRitmo(conN(T.TOPE_CHATS_HORA), ahora).chats >= T.TOPE_CHATS_HORA);
  });

  test('los chats de hace más de una hora no cuentan', () => {
    const ahora = new Date('2026-08-14T10:00:00-05:00');
    const viejo = [socio('a', [g(HOY, 'whatsapp', { hora: '2026-08-14T08:00:00-05:00' })])];
    assert.equal(T.chatsEnLaUltimaHora(viejo, ahora), 0);
  });

  test('las gestiones sin hora no se cuentan para el ritmo', () => {
    /* Son las que escribió el computador, que no guarda hora. Contarlas como
       «hace un momento» frenaría la tanda con gestiones de la mañana. */
    assert.equal(T.chatsEnLaUltimaHora([socio('a', [g(HOY)])], new Date('2026-08-14T10:00:00-05:00')), 0);
  });

  test('dice en voz alta que NO envía', () => {
    const t = T.LO_QUE_NO_HACE.join(' ');
    assert.match(t, /No envía/);
    assert.match(t, /tú tocas enviar/i);
    assert.match(t, /No sabe si enviaste/);
  });

  test('NUNCA toca la referencia personal', () => {
    /* Ley 2300 art. 4: prohibición absoluta de contactar referencias, e incluye
       expresamente a las personas naturales. Si alguien añade acá una lista de
       "a quién más llamar", esta prueba se cae. */
    const fuente = leer('panel/tanda.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
    /* Lo que se prohíbe es LEER el dato, no nombrarlo: LO_QUE_NO_HACE dice en
       voz alta que no se contactan referencias, y esa frase tiene que poder
       existir. Lo que no puede existir es un acceso al campo. */
    assert.ok(!/[.\[]\s*['"]?referencia/i.test(fuente),
      'tanda.js lee el campo de la referencia: la Ley 2300 art. 4 prohíbe contactarla');
    assert.match(T.LO_QUE_NO_HACE.join(' '), /No contacta referencias/);
  });

  test('no calcula plata: ni mora, ni total, ni garantía', () => {
    /* Regla 3 de la casa. La tanda ORDENA; los números los da el puente. */
    const fuente = leer('panel/tanda.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
    ['recargo', 'TASA_MORA', 'capital *', 'garantia', '0.75', '0.375', '* 0.01']
      .forEach(p => assert.ok(fuente.indexOf(p) === -1,
        'tanda.js parece estar calculando «' + p + '»: eso lo contesta el puente'));
  });

  test('es puro: ni localStorage, ni fetch, ni document', () => {
    const fuente = leer('panel/tanda.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
    ['localStorage', 'setItem', 'fetch(', 'document.', 'window.']
      .forEach(p => assert.ok(fuente.indexOf(p) === -1, 'tanda.js usa «' + p + '»'));
  });
});

/* ==========================================================================
 * 6 · EL ORDEN Y LA REANUDACIÓN
 * ======================================================================== */

describe('el orden de la tanda y los saltados', () => {

  test('ordena por prioridad y después por fecha de corte', () => {
    const mk = (id, prioridad, orden) =>
      Object.assign(caso(socio(id)), { prioridad, orden });
    const t = T.armarTanda([mk('a', 2, '2026-08-01'), mk('b', 1, '2026-08-10'), mk('c', 1, '2026-08-05')],
      { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.deepEqual(t.pendientes.map(c => c.socioId), ['c', 'b', 'a']);
  });

  test('los saltados van AL FINAL, no desaparecen', () => {
    /* Saltar es «ahora no», no «nunca». Sacarlos de la lista los haría
       desaparecer sin que Joan decidiera nada, y al final del día no sabría a
       quién le faltó. */
    const t = T.armarTanda([caso(socio('a')), caso(socio('b'))],
      { hoy: HOY, horario: ABIERTO, tipo: 'cobro', saltados: [{ socioId: 'a', motivo: 'prometió pagar el viernes' }] });
    assert.deepEqual(t.pendientes.map(c => c.socioId), ['b']);
    assert.equal(t.saltados.length, 1);
    assert.equal(t.saltados[0].motivo, 'prometió pagar el viernes');
  });

  test('la tanda se RECALCULA: no guarda la lista de pendientes', () => {
    /* Si congelara la lista, el que pagó anoche seguiría dentro y Joan le
       cobraría a un cliente que está al día, con el cliente leyéndolo. */
    const s = socio('a');
    const antes = T.armarTanda([caso(s)], { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.equal(antes.pendientes.length, 1);
    s.gestiones.push(g(HOY));
    const despues = T.armarTanda([caso(s)], { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.equal(despues.pendientes.length, 0, 'la tanda tiene que enterarse de lo que pasó por fuera de ella');
  });

  test('no muta lo que le dan', () => {
    const casos = [caso(socio('a'))];
    const copia = JSON.stringify(casos);
    T.armarTanda(casos, { hoy: HOY, horario: ABIERTO, tipo: 'cobro' });
    assert.equal(JSON.stringify(casos), copia);
  });
});

/* ==========================================================================
 * 7 · LOS GRUPOS
 * ======================================================================== */

describe('los grupos de cobro y los de publicidad no se pueden confundir', () => {

  test('cada grupo declara su tipo, y solo hay tres tipos', () => {
    T.GRUPOS.forEach(gr => {
      assert.ok(['cobro', 'servicio', 'publicidad'].includes(gr.tipo), gr.clave + ': tipo raro');
      assert.ok(gr.titulo && gr.ayuda, gr.clave + ': sin título o sin explicación');
    });
  });

  test('ningún grupo de cobro es de publicidad ni al revés', () => {
    const cobro = T.gruposDeTipo('cobro').map(x => x.clave);
    const publi = T.gruposDeTipo('publicidad').map(x => x.clave);
    assert.ok(cobro.length >= 4 && publi.length >= 4);
    cobro.forEach(k => assert.ok(!publi.includes(k), k + ' está en los dos lados'));
  });

  test('las claves no se repiten', () => {
    const ks = T.GRUPOS.map(x => x.clave);
    assert.equal(new Set(ks).size, ks.length);
  });
});
