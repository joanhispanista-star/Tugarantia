/* ============================================================================
 * LA BARRA DE CINCO, DESPUÉS DE LA REVISIÓN — panel/espejo.html
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/la-barra-revisada.test.js
 *
 * Tres revisiones (ley, uso con una mano y números) leyeron la barra nueva
 * del celular antes de que Joan la viera. Cada prueba de este archivo es un
 * hallazgo confirmado, escrita para fallar con el código que lo tenía:
 *
 *   · REGISTRADOS: el número de la pestaña y la lista salían de momentos
 *     distintos y la pantalla se contradecía («3 esperando · se ven los 1 más
 *     recientes»); al abrir la app ahí se bajaba la lista dos veces; cerrar
 *     sesión dejaba los nombres en memoria; «Pidió $100.000» a quien no dijo
 *     cifra, «le mandaste» por una propuesta que mandó la app, y «todavía no
 *     ha pedido» a quien pidió por play/; «a. m..» con doble punto.
 *   · CLIENTES: «Para saldar hoy» era la cuota con plan de pagos; la mora se
 *     ordenaba por nombre y no por antigüedad; el préstamo con garantía en
 *     mora no contaba; volver de una ficha subía la lista al principio; el
 *     buscador resumía a toda la cartera en cada letra y volvía a animar el
 *     campo donde Joan escribe.
 *   · TU GENTE: prometía «nada le llega a quien invita, ni si pagaron», y su
 *     app sí lo deja saber; la simulación se presentaba como la regla v3 y es
 *     un techo; «0 personas traen gente» encima de una lista de 1.
 *   · LA BARRA: la pestaña activa no se anunciaba; el globo «99+» se cortaba.
 *
 * Usa el mismo banco que las demás pruebas de la barra (banco-espejo.js).
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const ESPEJO = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8');
const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/&larr;/g, '←').replace(/\s+/g, ' ');

/* ------------------------------------------------------------ registrados */

function carteraMinima() {
  return { socios: [{ id: 's1', numero: 7, nombre: 'Clienta Vieja Rqp', cedula: '1032456789',
    telefono: '3109998877', gestiones: [], ajusteGarantia: 0 }], prestamos: [] };
}
const persona = (id, nombre, extra) => Object.assign({ id, nombre, cedula: '80' + id, telefono: '300000' + String(id).padStart(4, '0'),
  creado_en: '2026-09-15T14:05:00Z', origen: 'abierto', app: 'tugarantia', ciudad: 'Bogotá', barrio: '',
  cotejo: null, pedido: null }, extra || {});

/* Una nube que cambia mientras la prueba corre: `remoto.filas` es lo que hay
   en la bandeja AHORA. Con p_limite 0 contesta solo la cuenta, como la de verdad. */
function nubeViva(remoto) {
  return (url, cuerpo) => {
    if (url.endsWith('/rpc/panel_traer')) {
      return { status: 200, cuerpo: { completo: false, socios: [], creditos: [], respaldados: [], ajustes: [],
        servidor_ahora: '2026-09-15T15:30:00Z' } };
    }
    if (url.endsWith('/rpc/panel_registros')) {
      if (remoto.responder) return remoto.responder(cuerpo);
      const filas = remoto.filas;
      return { status: 200, cuerpo: { servidor_ahora: '2026-09-15T15:30:00Z', estado: 'nuevo', nuevos: filas.length,
        pedidos_leidos: true, registros: cuerpo.p_limite > 0 ? filas.slice(0, cuerpo.p_limite) : [] } };
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}
const listas = e => e.llamadas.filter(l => /panel_registros/.test(l.url) && l.cuerpo.p_limite > 0);

async function abrir(remoto, extra) {
  const e = abrirEspejo(Object.assign({ cartera: carteraMinima(), sesion: true, red: nubeViva(remoto) }, extra || {}));
  await asentar();
  return e;
}
async function entrar(e, v) {
  e.tocarPestania(v);
  e.correrPendientes();
  await asentar();
  return textoPlano(e.cuerpo());
}

describe('Registrados: la pestaña y la lista dicen lo mismo', () => {

  test('llegaron dos más mientras Joan estaba en Hoy: al volver, la lista se vuelve a pedir', async () => {
    const remoto = { filas: [persona(1, 'Primera Persona Kqz')] };
    const e = await abrir(remoto);
    await entrar(e, 'registrados');
    await entrar(e, 'hoy');
    remoto.filas = [persona(3, 'Tercera Persona Kqz'), persona(2, 'Segunda Persona Kqz'), persona(1, 'Primera Persona Kqz')];
    await e.ev('traerCuentaRegistros()');
    await asentar();
    assert.match(e.globo().innerHTML, />3</, 'la pestaña no se enteró de los nuevos');
    const antes = listas(e).length;
    const t = await entrar(e, 'registrados');
    assert.ok(listas(e).length > antes, 'entrar a Registrados no volvió a pedir la lista');
    assert.match(t, /3 esperando/);
    assert.ok(!/Se ven los 1 más recientes/.test(t),
      'dice que los demás están en el computador cuando el teléfono puede traerlos');
    ['Primera', 'Segunda', 'Tercera'].forEach(x => assert.ok(t.includes(x + ' Persona Kqz'), 'falta ' + x));
  });

  test('con la lista vacía y «2 nuevos» en la pestaña, la pantalla no dice «no hay nadie»', async () => {
    const remoto = { filas: [] };
    const e = await abrir(remoto);
    assert.match(await entrar(e, 'registrados'), /No hay nadie esperando/);
    await entrar(e, 'hoy');
    remoto.filas = [persona(5, 'Quinta Persona Kqz'), persona(4, 'Cuarta Persona Kqz')];
    await e.ev('traerCuentaRegistros()');
    await asentar();
    const t = await entrar(e, 'registrados');
    assert.ok(!/No hay nadie esperando/.test(t), 'el óvalo dice 2 y la pantalla dice que no hay nadie');
    assert.ok(t.includes('Quinta Persona Kqz') && t.includes('Cuarta Persona Kqz'));
  });

  test('mientras llega la lista nueva, el título cuenta las tarjetas que se ven, no la cuenta nueva', async () => {
    const remoto = { filas: [persona(1, 'Primera Persona Kqz')] };
    const e = await abrir(remoto);
    await entrar(e, 'registrados');
    await entrar(e, 'hoy');
    remoto.filas = [];                       /* Joan le abrió la ficha en el computador */
    await e.ev('traerCuentaRegistros()');
    await asentar();
    e.tocarPestania('registrados');          /* todavía sin correr la pregunta */
    const t = textoPlano(e.cuerpo());
    assert.ok(!/0 esperando/.test(t), '«0 esperando» encima de una tarjeta');
    assert.match(t, /1 esperando/);
    assert.match(t, /Preguntando a la nube si hay alguien más/);
    e.correrPendientes();
    await asentar();
    assert.match(textoPlano(e.cuerpo()), /No hay nadie esperando/);
  });

  test('al abrir la app en Registrados, la lista se baja UNA vez', async () => {
    const remoto = { filas: [persona(1, 'Primera Persona Kqz')] };
    const e = abrirEspejo({ cartera: carteraMinima(), sesion: true, red: nubeViva(remoto), ui: { pestania: 'registrados' } });
    /* En un navegador el setTimeout(0) de la pestaña corre antes de que la
       nube conteste la sincronización: se corre primero, igual. */
    e.correrPendientes();
    await asentar();
    e.correrPendientes();
    await asentar();
    assert.equal(listas(e).length, 1, 'se pidieron ' + listas(e).length + ' listas al abrir');
    assert.ok(textoPlano(e.cuerpo()).includes('Primera Persona Kqz'));
  });

  test('«↻ Traer de la nube» siempre pregunta, aunque la lista sea de hace un segundo', async () => {
    const remoto = { filas: [persona(1, 'Primera Persona Kqz')] };
    const e = await abrir(remoto);
    await entrar(e, 'registrados');
    const antes = listas(e).length;
    e.tocar('reg-traer');
    await asentar();
    assert.equal(listas(e).length, antes + 1);
  });

  test('un «cargando» sin pregunta en camino no deja la pestaña diciendo «Preguntando…» para siempre', async () => {
    const remoto = { filas: [persona(1, 'Primera Persona Kqz')] };
    const e = await abrir(remoto);
    await entrar(e, 'hoy');
    e.ev("_reg.estado = 'cargando'; _reg.enCurso = null;");
    const antes = listas(e).length;
    const t = await entrar(e, 'registrados');
    assert.equal(listas(e).length, antes + 1, 'entró a la pestaña y no preguntó');
    assert.ok(t.includes('Primera Persona Kqz'));
  });
});

describe('Registrados: cerrar sesión se lleva los nombres', () => {

  test('después de «Cerrar sesión» no queda nadie en memoria, ni el número en la pestaña', async () => {
    const remoto = { filas: [persona(1, 'Primera Persona Kqz'), persona(2, 'Segunda Persona Kqz')] };
    const e = await abrir(remoto);
    await entrar(e, 'registrados');
    assert.equal(e.globo().hidden, false);
    e.tocar('salir');
    await asentar();
    assert.equal(e.json('_reg.filas.length'), 0, 'los registrados de Joan quedaron en memoria');
    assert.equal(e.globo().hidden, true, 'la pestaña sigue diciendo cuántos hay, sin sesión');
    assert.ok(!e.cuerpo().includes('Persona Kqz'));
  });

  test('una respuesta que llega tarde, después de cerrar sesión, no los devuelve', async () => {
    let soltar;
    const remoto = { filas: [], responder: c => (c.p_limite > 0
      ? new Promise(r => { soltar = () => r({ status: 200, cuerpo: { nuevos: 1, pedidos_leidos: true,
          registros: [persona(9, 'Tardia Persona Kqz')] } }); })
      : { status: 200, cuerpo: { nuevos: 0, registros: [] } }) };
    const e = await abrir(remoto);
    e.tocarPestania('registrados');
    e.correrPendientes();
    await asentar();
    assert.equal(typeof soltar, 'function', 'la lista no se llegó a pedir');
    e.tocar('salir');
    await asentar();
    soltar();
    await asentar();
    assert.equal(e.json('_reg.filas.length'), 0);
    assert.equal(e.globo().hidden, true);
    assert.ok(!e.cuerpo().includes('Tardia Persona'));
  });
});

describe('Registrados: «Pidió» es lo que pidió la persona, y quién propuso lo dice la nube', () => {
  const FILAS = [
    persona(11, 'Automatica Persona Kqz', { pedido: { monto: null, propuesta: 100000, por: 'automatica',
      producto: 'quincenal', nota: null, estado: 'contrapropuesta', creada_en: '2026-09-15T14:06:00Z' } }),
    persona(12, 'Joan Propuso Kqz', { pedido: { monto: 300000, propuesta: 200000, por: 'joan',
      producto: 'quincenal', nota: null, estado: 'contrapropuesta', creada_en: '2026-09-15T14:06:00Z' } }),
    persona(13, 'Gerente Propuso Kqz', { pedido: { monto: 150000, propuesta: 120000, por: 'gerente',
      producto: 'quincenal', nota: null, estado: 'contrapropuesta', creada_en: '2026-09-15T14:06:00Z' } }),
    persona(14, 'Sin Solicitud Kqz', { pedido: null })
  ];
  const tarjeta = (t, nombre) => {
    const i = t.indexOf(nombre);
    const j = FILAS.map(f => t.indexOf(f.nombre)).filter(x => x > i).sort((a, b) => a - b)[0];
    return t.slice(i, j === undefined ? t.length : j);
  };

  test('la propuesta automática no se pinta como «Pidió $100.000», ni se le atribuye a Joan', async () => {
    const e = await abrir({ filas: FILAS });
    const t = await entrar(e, 'registrados');
    const a = tarjeta(t, 'Automatica Persona Kqz');
    assert.ok(!/Pidió \$100\.000/.test(a), 'le pone en la boca la cifra de la propuesta automática');
    assert.ok(!/le mandaste/.test(a), 'dice que Joan mandó una propuesta que mandó la app');
    assert.match(a, /Pidió un crédito/);
    assert.match(a, /La solicitud no dice cuánto pidió/);
    assert.match(a, /la app le mandó una propuesta automática de \$100\.000/);
  });

  test('la de Joan sí dice «le mandaste», y la del gerente dice que fue un gerente', async () => {
    const e = await abrir({ filas: FILAS });
    const t = await entrar(e, 'registrados');
    assert.match(tarjeta(t, 'Joan Propuso Kqz'), /Pidió \$300\.000/);
    assert.match(tarjeta(t, 'Joan Propuso Kqz'), /le mandaste una contrapropuesta de \$200\.000/);
    assert.match(tarjeta(t, 'Gerente Propuso Kqz'), /un gerente le mandó una contrapropuesta/);
    assert.ok(!/le mandaste/.test(tarjeta(t, 'Gerente Propuso Kqz')));
  });

  test('sin solicitud a la vista no afirma que no pidió: dice que no la ve', async () => {
    const e = await abrir({ filas: FILAS });
    const t = await entrar(e, 'registrados');
    const s = tarjeta(t, 'Sin Solicitud Kqz');
    assert.ok(!/Todavía no ha pedido/.test(s));
    assert.match(s, /No le veo ninguna solicitud de crédito/);
  });

  test('la hora no lleva doble punto («a. m..»)', async () => {
    const e = await abrir({ filas: [] });
    const vacio = await entrar(e, 'registrados');
    assert.match(vacio, /Lo contestó la nube hoy a las/);
    assert.ok(!/m\.\./.test(vacio), 'doble punto: ' + vacio.slice(vacio.indexOf('Lo contestó'), vacio.indexOf('Lo contestó') + 60));
    let falla = false;
    const e2 = await abrir({ filas: [], responder: c => (falla ? { status: 500, cuerpo: 'no' }
      : { status: 200, cuerpo: { nuevos: 1, pedidos_leidos: true, registros: c.p_limite > 0 ? [persona(1, 'Primera Persona Kqz')] : [] } }) });
    await entrar(e2, 'registrados');
    falla = true;
    e2.tocar('reg-traer');
    await asentar();
    const t = textoPlano(e2.cuerpo());
    assert.match(t, /Lo de abajo es lo que traje hoy a las/);
    assert.ok(!/m\.\./.test(t), 'doble punto en «Lo de abajo es lo que traje…»');
  });

  test('el aviso de arriba dice que no viajan las FOTOS (el número de cédula sí viaja)', async () => {
    const e = await abrir({ filas: [] });
    const t = await entrar(e, 'registrados');
    assert.match(t, /Las fotos de la cédula y la selfie no viajan al celular/);
  });

  test('la hora de «lo contestó la nube» es la del servidor, no la del teléfono', async () => {
    const e = await abrir({ filas: [], responder: () => ({ status: 200, cuerpo: {
      servidor_ahora: '2026-09-15T13:05:00Z', nuevos: 0, pedidos_leidos: true, registros: [] } }) });
    await entrar(e, 'registrados');
    assert.equal(e.json('_reg.leidoEn'), Date.parse('2026-09-15T13:05:00Z'));
  });
});

describe('panel_registros: enlaza la solicitud por el celular y separa lo pedido de lo propuesto', () => {
  const CODIGO = fs.readFileSync(path.join(RAIZ, 'base', '20261002_panel_registros.sql'), 'utf8')
    .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

  test('la solicitud sin registro_id (play_solicitar) se encuentra por los 10 dígitos del celular', () => {
    assert.match(CODIGO, /s\.registro_id is null/);
    assert.match(CODIGO, /length\(e\.tel\) = 10/, 'sin exigir 10 dígitos, un teléfono vacío casaría con cualquier solicitud');
    assert.match(CODIGO, /right\(regexp_replace\(coalesce\(s\.cedula, ''\), '\[\^0-9\]', '', 'g'\), 10\) = e\.tel/);
  });

  test('«monto» es lo que pidió la persona, nunca el capital propuesto', () => {
    assert.ok(!/coalesce\(\(to_jsonb\(s\) ->> 'pedido_monto'\)::bigint, s\.capital\)/.test(CODIGO),
      'el monto sigue cayendo al capital de la propuesta');
    assert.match(CODIGO, /'pedido' ->> 'capital'/, 'no lee lo que la persona pidió en PlataChat');
    assert.match(CODIGO, /'propuesta',/);
  });

  test('de quién propuso sale solo el tipo: el celular del gerente no viaja', () => {
    assert.match(CODIGO, /'por',\s+case/);
    assert.ok(!/'por',\s+to_jsonb/.test(CODIGO), '«por» sale crudo, con el celular del gerente');
  });
});

/* --------------------------------------------------------------- clientes */

let n = 1;
const socio = (id, nombre, extra) => Object.assign({ id, numero: n++, nombre,
  cedula: '52' + String(n).padStart(6, '0'), telefono: '310' + String(1000000 + n),
  gestiones: [], ajusteGarantia: 0, referidoPor: '' }, extra || {});
const credito = (id, socioId, corte, extra) => Object.assign({ id, numero: n++, socioId,
  capital: 100000, costoPct: 20, fechaDesembolso: '2026-08-01', cicloActual: corte,
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }, extra || {});

function carteraClientes() {
  n = 1;
  return {
    socios: [
      socio('s-and', 'Andres Mora Corta'),
      socio('s-zul', 'Zulma Mora Larga'),
      socio('s-pla', 'Pedro Con Plan'),
      socio('s-res', 'Rita Solo Garantia'),
      socio('s-car', 'Carla Al Dia')
    ],
    prestamos: [
      credito('c-and', 's-and', '2026-09-14'),
      credito('c-zul', 's-zul', '2026-08-26'),
      credito('c-car', 's-car', '2026-09-30'),
      /* Al pactar el plan, el CRM pone el ciclo en la primera cuota
         (p.cicloActual = p.planPagos.cuotas[0].fecha). */
      credito('c-pla', 's-pla', '2026-09-30', { capital: 400000,
        planPagos: { creado: '2026-08-31', tasa_por_corte: 0.05,
          entrada: { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, diasMora: 0 },
          total_capital: 400000, total_costo: 30000, total_a_pagar: 430000,
          cuotas: [
            { n: 1, fecha: '2026-09-30', capital: 200000, costo: 20000, total: 220000, pagado: false,
              fechaPagado: null, recargo: 0, garantiaGenerada: 0 },
            { n: 2, fecha: '2026-10-15', capital: 200000, costo: 10000, total: 210000, pagado: false,
              fechaPagado: null, recargo: 0, garantiaGenerada: 0 }] } })
    ],
    respaldados: [
      { id: 'r-1', numero: 1, socioId: 's-res', capital: 600000, fechaDesembolso: '2026-08-01',
        cuotas: [
          { n: 1, fecha: '2026-09-01', capital: 100000, costo: 20000, total: 120000, pagado: false },
          { n: 2, fecha: '2026-10-01', capital: 100000, costo: 20000, total: 120000, pagado: false }] }
    ]
  };
}
function tarjetaDe(h, nombre) {
  const i = h.indexOf(nombre);
  assert.ok(i > 0, 'no salió ' + nombre);
  const a = h.lastIndexOf('<div class="card ap tocable"', i);
  const b = h.indexOf('<div class="card ap tocable"', i);
  return h.slice(a, b < 0 ? h.length : b);
}

describe('Clientes: lo que dice cada tarjeta', () => {

  test('con plan de pagos, el número es la cuota del ciclo y no «para saldar hoy»', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    const t = textoPlano(tarjetaDe(e.cuerpo(), 'Pedro Con Plan'));
    assert.ok(!/Para saldar hoy/.test(t), 'con plan, «para saldar hoy» es solo la cuota: la deuda es más');
    assert.match(t, /Cuota de este ciclo \$220\.000/);
    assert.match(textoPlano(tarjetaDe(e.cuerpo(), 'Carla Al Dia')), /Para saldar hoy \$\d/,
      'sin plan, pagar eso hoy sí salda el crédito');
  });

  test('dentro de «En mora», primero la mora más vieja', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    const h = e.cuerpo();
    assert.ok(h.indexOf('Zulma Mora Larga') < h.indexOf('Andres Mora Corta'),
      'Andrés con un día salió encima de Zulma con veinte');
  });

  test('quien solo tiene un préstamo con garantía con una cuota vencida sale en mora, y lo dice', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    const h = e.cuerpo();
    const t = textoPlano(tarjetaDe(h, 'Rita Solo Garantia'));
    assert.match(t, /En mora/);
    assert.match(t, /Sin créditos quincenales abiertos/);
    assert.ok(!/Sin créditos abiertos/.test(t), '«sin créditos abiertos» a quien tiene un préstamo abierto');
    assert.match(t, /Una cuota venció el .* hace 14 día\(s\)/);
    assert.ok(h.indexOf('Rita Solo Garantia') < h.indexOf('Carla Al Dia'), 'quedó ordenada como si no debiera');
    assert.ok(!/Para saldar|Cuota de este ciclo/.test(t), 'las cuotas con garantía se cobran en el computador');
  });

  test('la píldora de mora no se parte en dos renglones', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    assert.match(tarjetaDe(e.cuerpo(), 'Zulma Mora Larga'), /<span class="pill mora" style="flex:none">En mora<\/span>/);
  });

  test('las tarjetas se anuncian como botón y se alcanzan con el teclado', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    assert.match(tarjetaDe(e.cuerpo(), 'Carla Al Dia'), /^<div class="card ap tocable" role="button" tabindex="0" data-acc="verficha"/);
    assert.match(ESPEJO, /addEventListener\('keydown', function \(ev\) \{\s*if \(ev\.key !== 'Enter' && ev\.key !== ' '\) return;/,
      'role="button" sin Enter ni espacio es una promesa falsa');
  });
});

describe('Hoy: el mismo rótulo que Crédito cuando hay plan de pagos', () => {

  test('la tarjeta de Hoy de un crédito con plan dice «Total de la cuota», no «Total para saldar»', () => {
    n = 1;
    const c = { socios: [socio('s-pl', 'Plan Vence Hoy')], prestamos: [
      credito('c-pl', 's-pl', '2026-09-15', { capital: 400000,
        planPagos: { creado: '2026-08-31', tasa_por_corte: 0.05,
          entrada: { fecha: '2026-08-31', ciclo: '2026-08-31', monto: 80000, mora: 0, aTiempo: true, diasMora: 0 },
          total_capital: 400000, total_costo: 30000, total_a_pagar: 430000,
          cuotas: [
            { n: 1, fecha: '2026-09-15', capital: 200000, costo: 20000, total: 220000, pagado: false,
              fechaPagado: null, recargo: 0, garantiaGenerada: 0 },
            { n: 2, fecha: '2026-09-30', capital: 200000, costo: 10000, total: 210000, pagado: false,
              fechaPagado: null, recargo: 0, garantiaGenerada: 0 }] } })] };
    const e = abrirEspejo({ cartera: c });
    e.tocarPestania('hoy');
    const t = textoPlano(e.cuerpo());
    assert.ok(t.includes('Plan Vence Hoy'), 'el crédito no salió en Hoy: la prueba no mira nada');
    assert.match(t, /Total de la cuota \$220\.000/);
    assert.ok(!/Total para saldar/.test(t), 'con plan, pagar eso no salda el crédito');
  });
});

describe('Clientes: el buscador y volver de una ficha', () => {

  test('el buscador resume solo a los que coinciden', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    e.ev('var __resumidos = 0, __resumen = resumenCliente;'
      + 'resumenCliente = function (s) { __resumidos++; return __resumen(s); };');
    e.escribir('bq', 'zulma');
    assert.equal(e.json('__resumidos'), 1, 'para mostrar a una se resumió a toda la cartera');
    assert.ok(textoPlano(e.cuerpo()).includes('Zulma Mora Larga'));
  });

  test('repintar la misma pantalla no vuelve a animar el campo donde se escribe', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    assert.match(e.cuerpo(), /^<div class="vista">/, 'entrar a una pantalla sí se anima');
    e.escribir('bq', 'z');
    assert.match(e.cuerpo(), /^<div class="vista quieta">/);
    e.tocarPestania('hoy');
    assert.match(e.cuerpo(), /^<div class="vista">/);
    assert.match(ESPEJO, /\.vista\.quieta\{animation:none\}/);
  });

  test('volver de una ficha deja la lista donde Joan iba', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    const saltos = [];
    e.ctx.scrollTo = (x, y) => { saltos.push(y); };
    e.tocarPestania('clientes');
    e.ctx.scrollY = 900;
    e.tocar('verficha', { id: 's-car' });
    e.ctx.scrollY = 0;
    e.tocar('volver');
    assert.equal(e.titulo(), 'Clientes');
    assert.equal(saltos[saltos.length - 1], 900, 'volvió arriba del todo');
    e.tocarPestania('hoy');
    e.tocarPestania('clientes');
    assert.equal(saltos[saltos.length - 1], 0, 'tocar la pestaña es empezar de nuevo, arriba');
  });
});

/* -------------------------------------------------------------- la barra */

describe('La barra: lo que no se ve', () => {

  test('la pestaña encendida se anuncia como la página actual, y solo ella', () => {
    const e = abrirEspejo({ cartera: carteraClientes() });
    e.tocarPestania('clientes');
    const marcadas = e.pestanias.filter(p => p.getAttribute('aria-current') === 'page').map(p => p.dataset.v);
    assert.deepEqual(marcadas, ['clientes']);
    e.tocar('ir', { destino: 'gente' });
    assert.deepEqual(e.pestanias.filter(p => p.getAttribute('aria-current') === 'page').map(p => p.dataset.v), ['mas']);
  });

  test('el globo va pegado al borde derecho del botón: «99+» no se corta a 360 px', () => {
    const regla = /\.nav \.globo\{[^}]*\}/.exec(ESPEJO);
    assert.ok(regla, 'no encontré la regla del globo');
    assert.match(regla[0], /right:2px/);
    assert.ok(!/left:50%/.test(regla[0]), 'medido desde el centro, «99+» se sale del botón');
  });

  test('una palabra larga sin espacios se parte en vez de correr la página de lado', () => {
    assert.match(ESPEJO, /\.card,\.vacio,\.aviso\{overflow-wrap:anywhere\}/);
  });
});

/* ---------------------------------------------------------------- tu gente */

describe('Tu gente: lo que promete y lo que cuenta', () => {

  test('no promete que a quien invita no le llega si pagaron: su app sí lo deja saber', () => {
    const c = carteraClientes();
    c.socios.push(socio('p', 'Padrino Del Barrio'), socio('i1', 'Invitada Uno', { referidoPor: 'p' }));
    const e = abrirEspejo({ cartera: c });
    e.tocar('ir', { destino: 'gente' });
    const t = textoPlano(e.cuerpo());
    assert.ok(!/ni si pagaron/.test(t), 'promete algo que socio.html no cumple');
    assert.match(t, /insignia «Trajiste a alguien»/);
    assert.match(t, /con un solo invitado, eso deja saber si esa persona pagó/);
    assert.match(t, /abogado/);
    assert.match(t, /Ya sacaron crédito/);
    assert.ok(!/Ya pidieron/.test(t), 'cuenta créditos desembolsados, no solicitudes');
  });

  test('la simulación se presenta como un techo, no como la cuenta de la v3', () => {
    const c = carteraClientes();
    c.socios.push(socio('p', 'Padrino Del Barrio'), socio('i1', 'Invitada Uno', { referidoPor: 'p' }));
    const e = abrirEspejo({ cartera: c });
    e.tocar('ir', { destino: 'gente' });
    const t = textoPlano(e.cuerpo());
    assert.match(t, /Si el programa estuviera encendido, a lo sumo/);
    assert.match(t, /Es un techo/);
    assert.match(t, /así que daría menos/);
  });

  test('quien solo se refirió a sí mismo no infla «Quién trae gente»: va aparte, para revisar', () => {
    const c = carteraClientes();
    c.socios.push(socio('auto', 'Auto Referido Xq', { referidoPor: 'auto' }));
    const e = abrirEspejo({ cartera: c });
    e.tocar('ir', { destino: 'gente' });
    const t = textoPlano(e.cuerpo());
    assert.match(t, /0 personas traen gente/);
    assert.ok(!/Quién trae gente/.test(t), '«0 personas traen gente» encima de una lista de «Quién trae gente»');
    assert.match(t, /Nadie te ha traído a nadie todavía/);
    assert.match(t, /Para revisar 1/);
    assert.match(t, /Auto Referido Xq/);
    assert.match(t, /Figura como referido de sí mismo/);
  });
});

/* 2-oct-2026 — visto en el sitio publicado a 375 px: overflow-wrap:anywhere de
   .card partía los montos («$2.00» y «0» en dos renglones) en Tu gente. La
   cifra de una fila se parte solo en los espacios. */
test('las cifras de una fila no se parten por dentro', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'panel', 'espejo.html'), 'utf8');
  const regla = html.match(/\n\.fila \.v\{[^}]*\}/);
  assert.ok(regla, 'no encontré la regla .fila .v');
  assert.match(regla[0], /overflow-wrap:normal/);
  assert.match(regla[0], /word-break:normal/);
});
