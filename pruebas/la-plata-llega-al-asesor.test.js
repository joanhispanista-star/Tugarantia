'use strict';
/* ==========================================================================
 * LA PLATA LLEGA AL CELULAR DEL ASESOR — 22 de septiembre de 2026
 *
 * Joan: «que el asesor tenga la informacion organizada de las ventas del
 * credito y tener organizado cuando tienen que pagar para preparar la
 * cobranza».
 *
 * Esta es la fase 1 del plan de los roles, y arregla algo que NO estaba escrito
 * en ningún documento: aplicar la migración del asesor **no encendía nada**.
 * Las cuatro columnas de plata se creaban y se quedaban en `null` para siempre,
 * porque `publicarEquipoAhora` armaba cada persona con seis campos y ninguno
 * era el saldo. El asesor seguía leyendo «tu celular todavía no recibe los
 * montos» con la migración ya pegada.
 *
 * ---------------------------------------------------------------------------
 * LAS TRES COSAS QUE ESTE ARCHIVO SUJETA
 *
 * 1. QUE LA CUENTA SEA UNA SOLA. El monto se calcula igual que en
 *    `casosDeCobroHoy`. Si hubiera dos formas de sumar lo que alguien debe, el
 *    día que se separen el asesor le diría al cliente una cifra por teléfono y
 *    el SMS otra distinta — y el pantallazo lo tendría el cliente.
 *
 * 2. QUE EL «SALIR» VIAJE SIEMPRE, también en `false`. Si solo viajara cuando
 *    es `true`, el día que alguien se arrepienta el `coalesce` del servidor
 *    conservaría el `true` viejo y esa persona no volvería a recibir un mensaje
 *    nunca, sin que nadie pudiera notarlo.
 *
 * 3. QUE SE DIGA DE CUÁNDO ES LA CIFRA. El monto NO está guardado: lo recalcula
 *    el CRM contra la fecha de hoy, con sus intereses y su mora. Lo que viaja
 *    es una FOTO. Si Joan publica el lunes y no vuelve hasta el viernes, el
 *    asesor lee un saldo de lunes, se lo dice al cliente, el cliente paga eso y
 *    queda debiendo cuatro días de mora. Eso no es un detalle de interfaz: es
 *    una discusión perdida de antemano.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922m_la_plata_viaja.sql')
  .split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

const hoyISO = () => { const x = new Date();
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const HOY = hoyISO();
const enDias = n => { const d = new Date(HOY + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10); };

/* Una cartera con UN cliente que debe DOS créditos: el que vence antes y otro
   más lejos. Es el caso que decide si la cuenta se hace por persona o por
   crédito, que es donde se rompe la Ley 2300. */
function carteraConPlata(extra) {
  return Object.assign({
    socios: [{ id: 's1', nombre: 'Ana Torres', telefono: '3001112233', whatsappIgual: true,
               cedula: '52111222', gestiones: [] }],
    prestamos: [
      { id: 'P1', socioId: 's1', capital: 200000, fechaPago: enDias(3) },
      { id: 'P2', socioId: 's1', capital: 100000, fechaPago: enDias(20) }
    ],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' }],
    equipo: [{ id: 'a1', nombre: 'Asesor Uno', rol: 'asesor', estado: 'activo', celular: '3001110002' }],
    asignaciones: [{ id: 'A1', socio_id: 'p1', asesor_id: 'a1', desde: HOY },
                   { id: 'A2', socio_id: 's1', asesor_id: 'a1', desde: HOY }],
    gestiones: [], config: { negocio: 'Tu Garantía' }
  }, extra || {});
}

function publicar(db) {
  const P = abrirPanel();
  P.cargarCartera(db || carteraConPlata());
  P.ev(`
    var _enviado = null, _dicho = '';
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _dicho = String(m); return true; };
    alert = function () {};
    rpc = function (fn, args) {
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') { _enviado = args; return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
    publicarEquipo();
  `);
  return P;
}

const cliente = P => {
  const e = JSON.parse(P.ev('JSON.stringify(_enviado)'));
  assert.ok(e, 'no se llamó a equipo_publicar');
  const c = (e.p_gente || []).find(x => x.id === 's1');
  assert.ok(c, 'el cliente no viajó');
  return c;
};

describe('la plata sale del computador de Joan', () => {

  test('viaja el total de TODOS sus créditos, no el de uno', async () => {
    /* La Ley 2300 obliga a UN contacto por persona. Si ese mensaje único
       hablara de un solo crédito, el cliente paga ese, cree que quedó al día, y
       a la semana recibe otro cobro que no entiende — y tendría razón. */
    const P = publicar();
    await new Promise(r => setTimeout(r, 30));
    const c = cliente(P);
    assert.ok(Number(c.saldo_total) > Number(c.saldo),
      'el total no suma los dos créditos: ' + JSON.stringify(c));
    assert.equal(c.creditos, '2', 'no se dice cuántos créditos son: ' + c.creditos);
  });

  test('y la fecha es la del que vence PRIMERO', async () => {
    /* Es sobre la que hay que llamarlo. Si viajara la más lejana, el asesor
       cobraría tarde y nadie se enteraría. */
    const P = publicar();
    await new Promise(r => setTimeout(r, 30));
    const c = cliente(P);
    assert.equal(c.fecha_pago, enDias(3),
      'la fecha no es la del crédito que vence antes: ' + c.fecha_pago);
  });

  test('sin créditos abiertos no se inventa un cero', async () => {
    /* `null` NO es cero. Escribir «$0» donde no se sabe es peor que no escribir
       nada, porque el asesor se lo cree y llama a cobrar cero pesos. */
    const P = publicar(carteraConPlata({ prestamos: [] }));
    await new Promise(r => setTimeout(r, 30));
    const c = cliente(P);
    assert.equal(c.saldo, '', 'se inventó un saldo donde no hay créditos');
    assert.equal(c.saldo_total, '', 'se inventó un total donde no hay créditos');
    assert.equal(c.fecha_pago, '', 'se inventó una fecha donde no hay créditos');
  });

  test('un crédito con acuerdo vigente SÍ se ve: un pacto no borra la deuda', async () => {
    /* La primera version de esto lo excluia, copiando la reja de
       `casosDeCobroHoy`. Ahi tiene sentido —no se le manda un SMS de mora a
       quien ya pactó— pero aqui no: esta lista dice LO QUE HAY, y un acuerdo
       mueve la fecha, no la deuda. Excluirlo hacia desaparecer al cliente de la
       vista de su asesor sin que nadie pudiera notarlo. */
    const conAcuerdo = carteraConPlata();
    conAcuerdo.prestamos[1].acuerdo = { fecha: enDias(10), monto: 100000, estado: 'vigente' };
    const P = publicar(conAcuerdo);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(cliente(P).creditos, '2',
      'un credito con acuerdo vigente desaparecio de la vista del asesor');
  });

  test('y uno PAGADO no cuenta', async () => {
    const db = carteraConPlata();
    db.prestamos[1].pagado = true;
    const P = publicar(db);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(cliente(P).creditos, '1', 'se cobra un credito ya pagado');
  });

  test('un credito que vence en TRES dias si viaja con su plata', async () => {
    /* Es el fallo que cazo esta prueba: el filtro copiado de la pantalla de
       cobranza solo dejaba pasar mora/hoy/proximo, y `proximo` son DOS dias.
       Preparar la cobranza pasa en D-3, que es justo el que se caia. */
    const P = publicar(carteraConPlata({
      prestamos: [{ id: 'P1', socioId: 's1', capital: 200000, fechaPago: enDias(3) }] }));
    await new Promise(r => setTimeout(r, 30));
    const c = cliente(P);
    assert.ok(Number(c.saldo_total) > 0,
      'un credito a tres dias viaja sin monto: el asesor no puede preparar nada');
    assert.equal(c.fecha_pago, enDias(3));
  });
});

describe('el SALIR viaja siempre, también en false', () => {

  test('quien NO pidió salir viaja como false, no como ausente', async () => {
    const P = publicar();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(cliente(P).no_sms, 'false',
      'el SALIR solo viaja cuando es true: el día que alguien se arrepienta, el ' +
      'coalesce del servidor conservaría el true viejo para siempre');
  });

  test('y quien sí pidió salir viaja como true', async () => {
    const db = carteraConPlata();
    db.socios[0].noSMS = true;
    const P = publicar(db);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(cliente(P).no_sms, 'true', 'el SALIR no viajó: la pantalla no podría frenarlo');
  });
});

describe('la pantalla del asesor lo enseña, y dice de cuándo es', () => {

  test('la fila del cliente pinta el monto y el día de pago', () => {
    const i = CRM.indexOf('function lineaPlataEq');
    assert.ok(i > 0, 'no existe lineaPlataEq: la plata llega y no se ve');
    const f = CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
    assert.match(f, /COP\(total\)/, 'el monto no se pinta con el formato de pesos de la casa');
    assert.match(f, /paga el/, 'no se dice cuándo paga, que es la mitad de lo que pidió Joan');
    assert.match(f, /p\.tipo !== 'cliente'/,
      'se pintaría plata en un prospecto, que no debe nada');
  });

  test('y no pinta nada cuando no sabe', () => {
    const i = CRM.indexOf('function lineaPlataEq');
    const f = CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
    assert.match(f, /saldo_total != null/,
      'se usa un truthy en vez de comparar con null: un saldo de 0 desaparecería');
  });

  test('el aviso de «los montos son del…» existe y se pone ámbar cuando envejece', () => {
    const i = CRM.indexOf('function avisoAlDiaDeEq');
    assert.ok(i > 0, 'no se dice de cuándo es la cifra: el asesor cotizaría un saldo rancio');
    const f = CRM.slice(i, CRM.indexOf(String.fromCharCode(10) + '}', i));
    assert.match(f, /al_dia_de/, 'no lee el dato que manda el servidor');
    assert.match(f, /confirma antes de cobrar/,
      'cuando la cifra es vieja no se le dice al asesor qué hacer con ella');
  });
});

describe('el tercer tapón: la pantalla ya no se bloquea sola', () => {

  const env = (() => {
    const i = CRM.indexOf("if (p.no_sms === true)");
    assert.ok(i > 0, 'la pantalla no comprueba el SALIR con el dato que ahora viaja');
    return CRM.slice(i - 200, i + 2200);
  })();

  test('con SALIR en true, no se manda y se dice por qué', () => {
    assert.match(env, /respondió <b>SALIR<\/b>/,
      'se rechaza sin explicar: la persona vuelve a intentarlo');
  });

  test('con el dato ausente TAMPOCO se manda', () => {
    /* Es el lado correcto en el que equivocarse. Callarlo sería escribirle a
       quien quizá pidió que no, y la sanción le llega a Joan en persona. */
    assert.match(env, /p\.no_sms == null/,
      'con el dato ausente se mandaría igual');
    assert.match(env, /volver a <b>publicar el equipo<\/b>/,
      'no se dice cómo arreglarlo, así que el asesor se queda atascado');
  });

  test('y ya no exige DB.socios, que en el celular está vacío a propósito', () => {
    assert.equal(/Array\.isArray\(DB\.socios\) && DB\.socios\.length/.test(env), false,
      'vuelve a exigir la cartera local, que en modo equipo se vacía a propósito: ' +
      'el botón quedaría muerto para siempre');
  });
});

describe('y el servidor guarda lo que le mandan, sin borrar lo que no', () => {

  test('la migración comprueba que un publicar sin plata NO la borra', () => {
    assert.match(SQL, /FALLO 2 GRAVE: un publicar sin la plata la BORRO/,
      'no se comprueba el caso que borraría el saldo de toda la cartera de un golpe');
    assert.match(SQL, /coalesce\(excluded\.no_sms,\s*cartera\.no_sms\)/,
      'el SALIR se pisaría con null en cada publicar');
  });

  test('y que el asesor recibe el «al día de»', () => {
    assert.match(SQL, /FALLO 3d/, 'no se comprueba que viaje la fecha del cálculo');
    /* En el SQL esto vive dentro de una cadena de reemplazo, asi que las
       comillas van DOBLADAS. Se busca lo que el archivo dice. */
    assert.match(SQL, /''al_dia_de'', p\.actualizado/,
      'mi_cartera no devuelve cuándo se calculó el saldo');
  });

  test('el centinela vigila que no se pise lo de la fase anterior', () => {
    /* Cuatro migraciones seguidas reescriben las MISMAS dos funciones leyéndolas
       de la base. La quinta que se despiste borra el trabajo de las cuatro. */
    assert.match(SQL, /se piso la plata de 20260919/,
      'el centinela no comprueba que siga puesto lo de la migración anterior');
    assert.match(SQL, /se fue el saneo de tipo/,
      'el centinela no vigila el saneo que evita que el Publicar falle entero');
  });
});
