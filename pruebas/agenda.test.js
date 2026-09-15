/* ============================================================================
 * LA FICHA Y EL CALENDARIO — 15 de septiembre de 2026
 *
 *   node --test pruebas/agenda.test.js
 *
 * Dos cosas que Joan pidió el mismo día, y que comparten la misma reja.
 *
 * LO QUE SE VIGILA ACÁ, y por qué cada cosa:
 *
 *  1. QUE LA FICHA NO SE PUEDA PEDIR POR UN NÚMERO SUELTO. Abre la cédula, la
 *     dirección y las fotos de una persona. Si la función recibiera un celular,
 *     un asesor podría escribir cualquiera en la consola del navegador y mirar a
 *     quien quisiera. Recibe un id de SU base, y la reja la pone el servidor.
 *
 *  2. QUE EL AVISO DEL NOMBRE NO SE PIERDA NI SE ABARATE. Joan decidió el
 *     15-sep que con el mismo número y otro nombre la ficha SE MUESTRA, con
 *     aviso. Un aviso vale por dos cosas: que salga cuando tiene que salir, y
 *     que NO salga cuando no —si saliera siempre, a la semana nadie lo leería.
 *     Por eso «Ana Rodríguez» y «ANA MARÍA RODRÍGUEZ PÉREZ» no levantan aviso, y
 *     «Ana Rodríguez» contra «Carlos Pérez» sí. Y va ARRIBA: una advertencia
 *     debajo de lo que advierte llega tarde.
 *
 *  3. QUE UN 404 NO SE DISFRACE. Estas funciones viven en una migración que
 *     Joan corre a mano. Mientras no la corra, la nube contesta 404. Traducir
 *     eso a «esta persona no se ha registrado» haría que el asesor dejara de
 *     buscar algo que sí está; traducirlo a «revisa tu señal» lo manda a
 *     reiniciar el celular por un problema del servidor.
 *
 *  4. QUE EL CALENDARIO NO INVENTE FECHAS DE PLATA. La cartera del equipo no
 *     lleva cuánto debe nadie, a propósito. La agenda lleva lo que el equipo
 *     ACUERDA. Si algún día alguien mete ahí los vencimientos, esa decisión se
 *     toma a la vista y no de rebote.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260915_ficha_y_calendario.sql');
/* Sin comentarios: se vigila lo que CORRE, y una explicación de por qué algo no
   se hace no puede hacer caer la prueba que lo prohíbe. */
const VIVO = CRM.replace(/\/\*[\s\S]*?\*\//g, ' ');
const SQL_VIVO = SQL.replace(/--[^\n]*/g, ' ');

const HOY = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
})();
const mas = (iso, n) => {
  const p = iso.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
};

/* ------------------------------------------------------------------ el banco */
const YO_GERENTE = { nombre: 'Nancy', rol: 'gerente', celular: '3001110001' };
const YO_ASESOR  = { nombre: 'Pedro', rol: 'asesor',  celular: '3001110002' };

/* Abre el CRM en modo equipo con una nube de mentiras. `respuestas` es un mapa
   de nombre de función → lo que contesta; una función que no esté en el mapa
   devuelve 404, que es el estado real de la nube de Joan hoy. */
function abrirEquipo(yo, gente, respuestas) {
  const llamadas = [];
  const P = abrirPanel({
    red: (url, cfg) => {
      const fn = String(url).split('/rpc/')[1] || String(url);
      let cuerpo = null;
      try { cuerpo = JSON.parse((cfg && cfg.body) || 'null'); } catch (e) { cuerpo = null; }
      llamadas.push({ fn, cuerpo });
      if (String(url).indexOf('/auth/v1/token') >= 0) {
        return Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }) });
      }
      const r = respuestas && Object.prototype.hasOwnProperty.call(respuestas, fn)
        ? respuestas[fn] : { estado: 404, j: { code: 'PGRST202', message: 'no existe' } };
      const cuerpoR = typeof r.j === 'function' ? r.j(cuerpo) : r.j;
      return Promise.resolve({ ok: (r.estado || 200) < 400, status: r.estado || 200,
                               json: () => Promise.resolve(cuerpoR) });
    }
  });
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify({
    ok: true, yo: yo,
    equipo: yo.rol === 'gerente'
      ? [{ celular: '3001110002', nombre: 'Pedro', rol: 'asesor' },
         { celular: '3001110003', nombre: 'Lucia', rol: 'asesor' }]
      : [],
    gente: gente || []
  }) + ';');
  /* NUBE_EQUIPO es const y ya trae la direccion real horneada: no se toca.
     Lo que decide que respuesta llega es `red`, no la URL. */
  P.ev('SESION_EQUIPO = { access_token: "tok", refresh_token: "ref", vence: Date.now() + 3600000 };');
  return { P, llamadas };
}

const GENTE = [
  { id: 'p1', nombre: 'Ana Rodriguez', celular: '3011000001', tipo: 'prospecto',
    estado: 'nuevo', etapa: 'PC' },
  { id: 'p2', nombre: 'Carlos Ruiz', celular: '3011000002', tipo: 'cliente',
    estado: 'al_dia', etapa: 'CA' }
];

/* ==========================================================================
 * LA FICHA
 * ======================================================================== */
describe('la ficha del registrado: se abre por la base, nunca por un número', () => {

  test('LA FUNCIÓN NO RECIBE UN CELULAR, y no puede recibirlo', () => {
    /* La reja entera depende de esto. Si mañana alguien le agrega un parámetro
       de teléfono «para probar», un asesor mira a quien quiera desde la consola
       del navegador. */
    const m = SQL_VIVO.match(/create or replace function public\.ficha_de_mi_base\(([^)]*)\)/);
    assert.ok(m, 'no encontré ficha_de_mi_base');
    assert.equal(m[1].trim(), 'p_persona_id text',
      'ficha_de_mi_base recibe algo más que el id de una persona de la base');
    /* Y la pantalla tampoco le manda otra cosa. */
    const llamada = VIVO.match(/rpcEquipo\('ficha_de_mi_base',\s*\{([^}]*)\}/);
    assert.ok(llamada, 'el CRM no llama a ficha_de_mi_base');
    assert.ok(llamada[1].indexOf('celular') === -1 && llamada[1].indexOf('cedula') === -1,
      'el CRM le manda a la ficha algo distinto del id de la persona');
  });

  test('la reja mira la asignación VIGENTE, no una vieja', () => {
    /* Las asignaciones solo suman: reasignar escribe una fila nueva. Si la reja
       aceptara cualquier fila, un asesor seguiría viendo la cédula de la gente
       que le quitaron hace meses. */
    const i = SQL_VIVO.indexOf('create or replace function public.ficha_de_mi_base');
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf('\n$$;', i));
    assert.match(cuerpo, /a\.desde\s*=\s*\(select max\(a2\.desde\)/,
      'la ficha no exige la asignación vigente: se vería la de gente ya reasignada');
    assert.match(cuerpo, /mi_alcance/,
      'la ficha no usa mi_alcance: un asesor podría ver la base de otro');
  });

  test('VOLÁTIL, porque escribe quién miró', () => {
    /* PostgREST corre las «stable» en transacción de solo lectura: una función
       que escribe y se declara stable devuelve 25006 SIEMPRE. Ya tuvo muertas
       dos funciones dos días en septiembre. */
    const i = SQL_VIVO.indexOf('create or replace function public.ficha_de_mi_base');
    const cab = SQL_VIVO.slice(i, SQL_VIVO.indexOf('as $$', i));
    assert.ok(!/\bstable\b|\bimmutable\b/.test(cab),
      'ficha_de_mi_base se declaró stable y escribe: devolvería 25006 en cada clic');
    assert.match(SQL_VIVO.slice(i), /insert into public\.fichas_vistas/,
      'la ficha dejó de registrar quién la abrió');
  });

  test('las dos tablas nuevas nacen cerradas', () => {
    ['agenda', 'fichas_vistas'].forEach(t => {
      assert.ok(SQL_VIVO.indexOf('alter table public.' + t + ' enable row level security') >= 0,
        'la tabla ' + t + ' quedó sin RLS');
      assert.ok(new RegExp('revoke all on table public\\.' + t + ' from public, anon, authenticated')
        .test(SQL_VIVO), 'la tabla ' + t + ' quedó abierta a la llave pública');
    });
    /* Y cero políticas: el cerrojo de esta casa es RLS + ninguna política, todo
       por funciones. Una política sería una puerta directa. */
    assert.ok(!/create policy/i.test(SQL_VIVO),
      'apareció una política: en esta casa se entra por funciones, no por la tabla');
  });

  test('el aviso del nombre sale cuando tiene que salir, y CALLA cuando no', () => {
    /* Las dos mitades. Un aviso que sale siempre deja de leerse a la semana. */
    const i = SQL.indexOf('create or replace function public.nombres_se_parecen');
    assert.ok(i > 0, 'no encontré nombres_se_parecen');
    /* Los casos van escritos en la comprobación del propio archivo, que corre en
       el servidor de Joan cuando pega. Acá se exige que sigan estando: sin
       ellos, una «mejora» del parecido no rompería nada y el aviso se volvería
       ruido o desaparecería. */
    [['Ana Rodriguez', 'ANA MARÍA RODRÍGUEZ PÉREZ', 'parecido'],
     ['Ana Rodriguez', 'Carlos Pérez Gómez', 'distinto'],
     ['Maria Gomez', 'Maria Lopez', 'distinto']].forEach(c => {
      assert.ok(SQL.indexOf("nombres_se_parecen('" + c[0] + "', '" + c[1] + "') <> '" + c[2] + "'") >= 0,
        'se perdió la comprobación de «' + c[0] + '» contra «' + c[1] + '» → ' + c[2]);
    });
    /* Una sola palabra en común no puede bastar: medio país se llama «maria». */
    const cuerpo = SQL.slice(i, SQL.indexOf('\n$$;', i));
    assert.match(cuerpo, /comunes\s*>=\s*2/,
      'con una sola palabra en común dos personas distintas pasarían por la misma');
  });

  test('el aviso se pinta ARRIBA, antes de la primera foto', () => {
    const i = VIVO.indexOf('function fichaHTML');
    assert.ok(i > 0, 'no encontré fichaHTML');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    /* El ORDEN se comprueba sobre lo PINTADO, no sobre el orden del archivo:
       una variable declarada arriba no dice nada de dónde sale en pantalla. La
       prueba de más abajo —«con otro nombre»— lo mide sobre el HTML de verdad.
       Acá solo se exige que el aviso exista y lleve los dos nombres. */
    assert.ok(cuerpo.indexOf('j.aviso') > 0, 'la ficha dejó de pintar el aviso del nombre');
    assert.match(cuerpo, /en_la_base/, 'el aviso no muestra el nombre que está en la base');
    assert.match(cuerpo, /se_registro_como/, 'el aviso no muestra el nombre con el que se registró');
  });

  test('«no se ha registrado» NO se dice cuando lo que pasó es que no se pudo preguntar', () => {
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {});  // todo 404
    P.ev("verFichaEq('p1')");
    return new Promise(r => setImmediate(r)).then(() => {
      const h = P.elems.mBody.innerHTML;
      assert.match(h, /todavía no está encendida/i,
        'con la migración sin correr, la ficha no dice que esa parte no está encendida');
      assert.ok(!/no se ha registrado/i.test(h),
        'un 404 se está leyendo como «esta persona no se registró»: el asesor dejaría de buscarla');
      assert.ok(!/revisa tu señal|revisa la señal/i.test(h),
        'le echa la culpa a la señal del asesor por un 404 del servidor');
    });
  });

  test('sin registro se dice sin registro, y se explica que pudo usar otro número', () => {
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      ficha_de_mi_base: { j: { ok: true, registrado: false, nombre_base: 'Ana Rodriguez',
                               celular: '3011000001' } }
    });
    P.ev("verFichaEq('p1')");
    return new Promise(r => setImmediate(r)).then(() => {
      const h = P.elems.mBody.innerHTML;
      assert.match(h, /no se ha registrado/i);
      assert.match(h, /otro n[úu]mero/i,
        'no le explica al asesor la razón más probable: se registró con otro número');
      assert.ok(h.indexOf('3011000001') >= 0, 'no dice con qué número buscó');
    });
  });

  test('con otro nombre: la ficha SE MUESTRA, y el aviso va con los dos nombres', () => {
    /* Decisión de Joan del 15-sep-2026, pedida con esas palabras. */
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      ficha_de_mi_base: { j: { ok: true, registrado: true,
        nombre_base: 'Ana Rodriguez', nombre: 'Carlos Perez Gomez',
        cedula: '52111222', celular: '3011000001',
        datos: { direccion: 'Calle 45 #12-30', ocupacion: 'Independiente' },
        fotos: { cedula_frente: 'data:image/jpeg;base64,AAA' },
        aviso: { tipo: 'otro_nombre', en_la_base: 'Ana Rodriguez',
                 se_registro_como: 'Carlos Perez Gomez' } } }
    });
    P.ev("verFichaEq('p1')");
    return new Promise(r => setImmediate(r)).then(() => {
      const h = P.elems.mBody.innerHTML;
      assert.ok(h.indexOf('Ana Rodriguez') >= 0 && h.indexOf('Carlos Perez Gomez') >= 0,
        'el aviso no lleva los dos nombres');
      assert.match(h, /Ojo con el nombre/i, 'no se ve el aviso');
      /* Y la ficha se muestra igual: es lo que Joan decidió. */
      assert.ok(h.indexOf('52111222') >= 0, 'con aviso se escondió la ficha: Joan pidió mostrarla');
      assert.ok(h.indexOf('Calle 45 #12-30') >= 0, 'no muestra los datos del registro');
      assert.match(h, /data:image\/jpeg/, 'no muestra las fotos');
      /* El aviso, antes de la cédula. */
      assert.ok(h.indexOf('Ojo con el nombre') < h.indexOf('52111222'),
        'el aviso quedó debajo de lo que advierte');
    });
  });

  test('sin fotos se dice sin fotos, y no se calla', () => {
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      ficha_de_mi_base: { j: { ok: true, registrado: true, nombre: 'Ana Rodriguez',
        cedula: '52111222', celular: '3011000001', datos: {}, fotos: {} } }
    });
    P.ev("verFichaEq('p1')");
    return new Promise(r => setImmediate(r)).then(() => {
      assert.match(P.elems.mBody.innerHTML, /No subió fotos/i,
        'una ficha sin fotos se pinta igual que una con fotos');
    });
  });
});

/* ==========================================================================
 * EL CALENDARIO
 * ======================================================================== */
describe('el calendario del equipo: lo que se acuerda, no lo que vence', () => {

  test('NO PINTA VENCIMIENTOS DE CRÉDITO, y eso se decide a la vista', () => {
    /* La cartera del equipo no lleva cuánto debe nadie, a propósito (ver la
       cabecera de 20260910). Si algún día alguien mete plata en la agenda, que
       sea una decisión tomada de frente y no de rebote. */
    const i = SQL_VIVO.indexOf('create table if not exists public.agenda');
    const tabla = SQL_VIVO.slice(i, SQL_VIVO.indexOf(');', i));
    ['saldo', 'monto', 'capital', 'cuota', 'valor'].forEach(c =>
      assert.ok(tabla.indexOf(c) === -1,
        'la agenda ganó una columna de plata (' + c + '): la cartera del equipo no lleva eso'));
  });

  test('A QUIÉN LE TOCA LO DECIDE EL SERVIDOR, no el navegador', () => {
    /* Sin esto, un asesor se pone citas en el día de otro desde la consola, y
       el gerente lee una agenda que nadie acordó. */
    const i = SQL_VIVO.indexOf('create or replace function public.agenda_poner');
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf('\n$$;', i));
    assert.match(cuerpo, /destino <> yo\.celular and not \(destino = any\(mios\)\)/,
      'agenda_poner acepta cualquier destino: un asesor le escribiría en la agenda a otro');
    assert.match(cuerpo, /quien.*yo\.celular|values[\s\S]*yo\.celular/,
      'quien escribió la cita no sale de la sesión');
    /* Y si la cita es sobre alguien, ese alguien tiene que ser de mi base. */
    assert.match(cuerpo, /esa persona no es de tu base/,
      'agenda_poner deja colgar una cita de gente que no es de mi base');
  });

  test('la ventana de la agenda tiene tope', () => {
    /* Sin tope, una consulta traería la agenda entera del equipo a un celular. */
    const i = SQL_VIVO.indexOf('create or replace function public.agenda_mia');
    const cuerpo = SQL_VIVO.slice(i, SQL_VIVO.indexOf('\n$$;', i));
    assert.match(cuerpo, /180 days/, 'agenda_mia no limita la ventana de fechas');
    assert.match(cuerpo, /mi_alcance/, 'agenda_mia no usa mi_alcance');
  });

  test('la pestaña Agenda existe y pinta', () => {
    /* Se llama a la vista directamente y no a irEquipo: el banco no tiene un
       DOM de verdad y irEquipo se sale temprano al no encontrar «.main». Lo que
       importa acá es lo que la vista PINTA, que es lo mismo en los dos casos. */
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      agenda_mia: { j: { ok: true, citas: [] } }
    });
    P.ev('traerAgendaEq()');
    return new Promise(r => setImmediate(r)).then(() => {
      assert.equal(P.ev('AGENDA_ESTADO'), 'listo', 'la agenda no llegó a cargar');
      const h = P.ev('vistaAgendaEq()');
      assert.match(h, /Agenda/, 'la vista de la agenda no se pinta');
      assert.match(h, /No tienes nada agendado/,
        'con la agenda vacía no dice que está vacía');
      assert.match(h, /semana/, 'no pinta la semana de un vistazo');
      /* Y la pestaña existe en la barra, para los dos papeles. */
      assert.ok(VIVO.indexOf("irEquipo('agenda')") >= 0, 'no hay botón de Agenda en la barra');
      assert.match(VIVO, /agenda: 'Agenda'/, 'la barra no sabe marcar la pestaña de Agenda');
    });
  });

  test('con el calendario apagado se dice apagado, no vacío', () => {
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {});  // 404
    P.ev('traerAgendaEq()');
    return new Promise(r => setImmediate(r)).then(() => {
      assert.equal(P.ev('AGENDA_ESTADO'), 'apagada');
      const h = P.ev('vistaAgendaEq()');
      assert.match(h, /todavía no está encendido/i);
      assert.ok(!/No tienes nada agendado/.test(h),
        'con la migración sin correr dice que el asesor no tiene nada: es mentira');
    });
  });

  test('si no se pudo preguntar, NO se dice que está vacía', () => {
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      agenda_mia: { estado: 500, j: { message: 'boom' } }
    });
    P.ev('traerAgendaEq()');
    return new Promise(r => setImmediate(r)).then(() => {
      assert.equal(P.ev('AGENDA_ESTADO'), 'falla');
      const h = P.ev('vistaAgendaEq()');
      assert.match(h, /no pude traer tu agenda/i);
      assert.match(h, /no.*quiere decir que esté vacía/i,
        'no distingue «no hay nada» de «no pude preguntar»');
    });
  });

  test('LO VENCIDO VA PRIMERO Y APARTE', () => {
    /* Un pendiente de anteayer perdido entre los de la semana que viene es un
       pendiente que nadie hace. */
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      agenda_mia: { j: { ok: true, citas: [
        { id: 1, titulo: 'Cobrar la cuota', cuando: mas(HOY, -3), hora: '', tipo: 'cobro',
          hecho: false, para: '3001110002', quien: '3001110002',
          persona_nombre: 'Ana Rodriguez', persona_celular: '3011000001', persona_id: 'p1', nota: '' },
        { id: 2, titulo: 'Llamar', cuando: mas(HOY, 4), hora: '10:00', tipo: 'llamada',
          hecho: false, para: '3001110002', quien: '3001110002',
          persona_nombre: '', persona_celular: '', persona_id: null, nota: '' }
      ] } }
    });
    P.ev('traerAgendaEq()');
    return new Promise(r => setImmediate(r)).then(() => {
      const h = P.ev('vistaAgendaEq()');
      assert.match(h, /Se pasó la fecha/, 'lo vencido no se separa');
      assert.ok(h.indexOf('Se pasó la fecha') < h.indexOf('Llamar'),
        'lo vencido no va primero');
      assert.ok(h.indexOf('Cobrar la cuota') >= 0 && h.indexOf('Ana Rodriguez') >= 0,
        'la cita no muestra de quién es');
    });
  });

  test('lo hecho se apaga pero NO se esconde', () => {
    /* Esconderlo haría que el asesor no supiera si lo marcó o si nunca lo
       agendó, y lo volvería a agendar. */
    const { P } = abrirEquipo(YO_ASESOR, GENTE, {
      agenda_mia: { j: { ok: true, citas: [
        { id: 3, titulo: 'Ya cobrado', cuando: HOY, hora: '', tipo: 'cobro', hecho: true,
          para: '3001110002', quien: '3001110002', persona_nombre: '', persona_celular: '',
          persona_id: null, nota: '' }
      ] } }
    });
    P.ev('traerAgendaEq()');
    return new Promise(r => setImmediate(r)).then(() => {
      const h = P.ev('vistaAgendaEq()');
      assert.ok(h.indexOf('Ya cobrado') >= 0, 'lo hecho desapareció de la agenda');
      assert.match(h, /info-row hecha/, 'lo hecho no se distingue de lo pendiente');
    });
  });

  test('un ASESOR no puede escoger a quién le toca; un GERENTE sí', () => {
    const a = abrirEquipo(YO_ASESOR, GENTE, { agenda_mia: { j: { ok: true, citas: [] } } });
    a.P.ev('nuevaCitaEq()');
    assert.ok(a.P.elems.mBody.innerHTML.indexOf('ciPara') === -1,
      'un asesor puede escoger a quién le toca: se pondría citas en el día de otro');

    const g = abrirEquipo(YO_GERENTE, GENTE, { agenda_mia: { j: { ok: true, citas: [] } } });
    g.P.ev('nuevaCitaEq()');
    const h = g.P.elems.mBody.innerHTML;
    assert.ok(h.indexOf('ciPara') >= 0, 'el gerente no puede repartir una cita');
    assert.ok(h.indexOf('Pedro') >= 0 && h.indexOf('Lucia') >= 0,
      'el gerente no ve a sus asesores en la lista');
  });

  test('agendar desde una persona la deja colgada de ESA persona', () => {
    const { P, llamadas } = abrirEquipo(YO_ASESOR, GENTE, {
      agenda_mia: { j: { ok: true, citas: [] } },
      agenda_poner: { j: { ok: true, id: 9 } }
    });
    P.ev("nuevaCitaEq('p1')");
    P.ev("document.getElementById('ciTitulo').value = 'Quedó de pagar'");
    P.ev("document.getElementById('ciFecha').value = '" + mas(HOY, 2) + "'");
    P.ev('guardarCitaEq()');
    return new Promise(r => setImmediate(r)).then(() => {
      const puso = llamadas.filter(x => x.fn === 'agenda_poner');
      assert.equal(puso.length, 1, 'no mandó la cita');
      assert.equal(puso[0].cuerpo.p_persona_id, 'p1', 'la cita no quedó colgada de la persona');
      assert.equal(puso[0].cuerpo.p_titulo, 'Quedó de pagar');
      assert.equal(puso[0].cuerpo.p_cuando, mas(HOY, 2));
    });
  });

  test('una cita sin título no se manda', () => {
    const { P, llamadas } = abrirEquipo(YO_ASESOR, GENTE, {
      agenda_mia: { j: { ok: true, citas: [] } },
      agenda_poner: { j: { ok: true, id: 9 } }
    });
    P.ev('nuevaCitaEq()');
    P.ev("document.getElementById('ciTitulo').value = '   '");
    P.ev('guardarCitaEq()');
    assert.equal(llamadas.filter(x => x.fn === 'agenda_poner').length, 0,
      'mandó una cita sin decir de qué se trata');
  });

  test('la fila de cada persona lleva el botón de la ficha y el de agendar', () => {
    const i = VIVO.indexOf('function filaPersonaEq');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /verFichaEq\(/, 'no se puede abrir la ficha desde la base');
    assert.match(cuerpo, /nuevaCitaEq\(/, 'no se puede agendar desde la base');
  });

  test('el código HTTP viaja con la respuesta: sin él no se puede distinguir un 404', () => {
    /* Es lo que permite decir «esa parte no está encendida» en vez de «la nube
       contestó que no». Si alguien lo quita, las tres pantallas del equipo
       empiezan a echarle la culpa a la señal del asesor. */
    assert.match(VIVO, /function rpcEquipo[\s\S]{0,600}status:\s*r\.status/,
      'rpcEquipo dejó de devolver el código HTTP');
  });
});
