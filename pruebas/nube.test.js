/* ============================================================================
 * Pruebas de la sincronización — panel/nube.js
 * Sin dependencias: corredor de pruebas nativo de Node.
 *
 *   node --test
 *
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO. Solo la PARTE PURA de nube.js: el diff, el
 * espejo, la fusión, la cola. Nada de red y nada de localStorage — `require`
 * de panel/nube.js no toca ninguno de los dos, y por eso este archivo corre en
 * node sin navegador ni servidor.
 *
 * Y una advertencia para el que venga a agregar casos: acá NO se recalcula
 * cupo, garantía, mora ni niveles. Si una prueba necesita uno de esos números,
 * se lo pide a MotorReglas o a PuenteTuGarantia (como hace la prueba del
 * paquete, más abajo). Escribir la cuenta a mano en la prueba es fabricar la
 * trece copia de la misma cuenta, y este proyecto ya sabe cómo termina eso.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../panel/nube.js');
const P = require('../app/puente.js');

/* ==========================================================================
 * UN SERVIDOR DE MENTIRA, PERO CON LAS DOS MAÑAS DEL DE VERDAD
 *
 * Las pruebas de sincronización que valen algo son las que meten DOS aparatos
 * contra UN servidor. Acá está ese servidor: no es Supabase, es la regla de
 * panel_empujar escrita en JavaScript, y por eso este bloque es también la
 * documentación ejecutable del contrato.
 *
 * Imita dos comportamientos del original, y los dos son los que rompen cosas:
 *
 *   1. LA REVISIÓN. Se escribe solo si revision_base coincide con la revisión
 *      que hay guardada. Cualquier otro caso es CHOQUE y no se escribe nada de
 *      esa fila. Es el bloqueo `for update` del SQL, sin las carreras.
 *   2. jsonb REORDENA LAS LLAVES. Todo lo que entra pasa por comoJsonb(), que
 *      es lo que de verdad le hace PostgreSQL a un objeto: guardar las llaves
 *      ordenadas por longitud y después por bytes. Sin esta línea, las pruebas
 *      pasarían felices y el sistema real seguiría resubiendo la cartera
 *      entera en cada sincronización.
 * ======================================================================== */

function clon(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

/* El reordenamiento EXACTO de jsonb: primero por largo de la llave, después
   byte a byte. No es un capricho de PostgreSQL, es su formato binario, y por
   eso ningún `order by` ni ningún cast lo devuelve al orden original. */
function comoJsonb(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(comoJsonb);   // el orden de un array SÍ se respeta
  const salida = {};
  Object.keys(v).sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : (a > b ? 1 : 0);
  }).forEach(k => { salida[k] = comoJsonb(v[k]); });
  return salida;
}

function servidorNuevo() {
  return { socios: {}, creditos: {}, respaldados: {}, ajustes: {}, bitacora: [], choques: [] };
}

function empujarEnServidor(srv, dispositivo, lote, cuando) {
  const r = { aplicados: 0, revisiones: [], choques: [] };
  const momento = cuando || new Date().toISOString();

  function una(tabla, llave, fila, datos) {
    const actual = srv[tabla][llave];
    const base = fila.revision_base == null ? 0 : Number(fila.revision_base);
    const nueva = actual && !base ? null
      : (!actual && !base) ? 1
        : (actual && Number(actual.revision) === base) ? Number(actual.revision) + 1
          : null;
    if (nueva === null) {
      /* NO SE ESCRIBE NADA de esta fila. Y queda constancia con las dos
         versiones: es la promesa entera de este sistema. */
      const ch = {
        tabla: tabla, id: llave,
        revision_servidor: actual ? Number(actual.revision) : 0,
        datos_servidor: actual ? clon(actual.datos) : null,
        actualizado_por: actual ? actual.actualizado_por : null,
        actualizado_en: actual ? actual.actualizado_en : null
      };
      r.choques.push(ch);
      srv.choques.push({ tabla: tabla, fila_id: llave, mio: clon(datos), suyo: ch.datos_servidor, cuando: momento });
      return;
    }
    srv[tabla][llave] = {
      datos: comoJsonb(clon(datos)),
      revision: nueva,
      borrado: !!fila.borrado,
      actualizado_en: momento,
      actualizado_por: dispositivo || null
    };
    r.aplicados++;
    /* Tres campos y ni uno más, como el SQL de verdad (20260811_panel_nube.sql,
       `v_revisiones := v_revisiones || jsonb_build_object('tabla', …, 'id', …,
       'revision', …)`). Es tentador devolver acá también la hora y el aparato
       —los tenemos a mano—, pero un doble más generoso que el servidor deja
       pasar código que en producción lee undefined. */
    r.revisiones.push({ tabla: tabla, id: llave, revision: nueva });
  }

  ['socios', 'creditos', 'respaldados'].forEach(t => {
    (lote[t] || []).forEach(f => una(t, String(f.id), f, f.datos));
  });
  (lote.ajustes || []).forEach(a => una('ajustes', String(a.clave), a, a.datos));

  srv.bitacora.push({ que: 'empujar', dispositivo: dispositivo, filas: r.aplicados, cuando: momento });
  return r;
}

function traerDeServidor(srv, desde, ahora) {
  const p = {
    servidor_ahora: ahora || new Date().toISOString(),
    completo: desde == null,
    socios: [], creditos: [], respaldados: [], ajustes: [],
    contadores: { cliente: 0, credito: 0, respaldado: 0 }
  };
  ['socios', 'creditos', 'respaldados'].forEach(t => {
    Object.keys(srv[t]).forEach(id => {
      const f = srv[t][id];
      if (desde != null && !(f.actualizado_en > desde)) return;
      p[t].push({
        id: id, datos: clon(f.datos), revision: f.revision, borrado: f.borrado,
        actualizado_en: f.actualizado_en, actualizado_por: f.actualizado_por
      });
    });
  });
  Object.keys(srv.ajustes).forEach(clave => {
    const a = srv.ajustes[clave];
    if (desde != null && !(a.actualizado_en > desde)) return;
    p.ajustes.push({
      clave: clave, datos: clon(a.datos), revision: a.revision,
      actualizado_en: a.actualizado_en, actualizado_por: a.actualizado_por
    });
  });
  srv.bitacora.push({ que: 'traer', filas: p.socios.length + p.creditos.length + p.respaldados.length + p.ajustes.length });
  return p;
}

/* ==========================================================================
 * DATOS DE MENTIRA CON LA FORMA DE VERDAD
 *
 * El orden de los campos NO es decorativo: es el que escribe crm.html
 * (guardarRapido, crm.html:1969). Se copia tal cual porque la prueba del
 * reordenamiento de jsonb depende de él — con las llaves en orden alfabético
 * de casualidad, esa prueba pasaría sin probar nada.
 * ======================================================================== */

function socioDemo(extra) {
  return Object.assign({
    id: 'C1754870000000',
    numero: 48,
    nombre: 'Ana Restrepo',
    telefono: '3001234567',
    email: 'ana@ejemplo.com',
    whatsappIgual: true,
    referencia: { nombre: 'Luz', telefono: '3009999999' },
    gestiones: [{ fecha: '2026-08-03', canal: 'whatsapp', plantilla: 'recordatorio' }],
    fechaRegistro: '2026-07-01T09:00:00.000Z'
  }, extra || {});
}

function creditoDemo(extra) {
  return Object.assign({
    id: 'P1754870000001',
    numero: 91,
    socioId: 'C1754870000000',
    socioNombre: 'Ana Restrepo',
    telefono: '3001234567',
    capital: 300000,
    costoPct: 20,
    fechaDesembolso: '2026-07-20',
    cicloActual: '2026-07-31',
    prorrogas: [],
    abonosCapital: [],
    comprobantes: [],
    pagado: false,
    fechaCreacion: '2026-07-20T14:00:00.000Z'
  }, extra || {});
}

function dbDemo() {
  return {
    socios: [socioDemo()],
    prestamos: [creditoDemo()],
    respaldados: [],
    papelera: [],
    papeleraSocios: [],
    invitaciones: [],
    plantillas: { recordatorio: 'Hola {nombre}' },
    config: { costoBasePct: 20, negocio: 'Tu Garantía' },
    contadores: { cliente: 48, credito: 91, respaldado: 3 }
  };
}

/* Sube un db entero a un servidor limpio y devuelve las dos cosas que hacen
   falta para seguir: el servidor y el espejo que le queda a ese aparato. Es la
   "primera subida de la vida", que es como empiezan casi todos los casos. */
function primeraSubida(srv, db, dispositivo, cuando) {
  const lote = N.armarLote(db, N.espejoVacio());
  const resp = empujarEnServidor(srv, dispositivo, N.loteLimpio(lote), cuando);
  const espejo = N.espejoTrasEmpujar(N.espejoVacio(), lote, resp);
  return { lote, resp, espejo };
}

/* ==========================================================================
 * 1 · armarLote — solo lo que cambió, y contra la revisión correcta
 * ======================================================================== */

describe('armarLote — manda solo lo que cambió', () => {

  test('con el espejo vacío manda todo, con revision_base null (fila nueva)', () => {
    const lote = N.armarLote(dbDemo(), N.espejoVacio());
    assert.equal(lote.socios.length, 1);
    assert.equal(lote.creditos.length, 1);
    assert.equal(lote.socios[0].revision_base, null);
    assert.equal(lote.creditos[0].revision_base, null);
    /* Los cinco ajustes por defecto; el db de prueba los tiene todos. */
    assert.equal(lote.ajustes.length, N.CLAVES_AJUSTES.length);
  });

  test('sin tocar nada, la segunda vez no manda ni una fila', () => {
    const srv = servidorNuevo();
    const db = dbDemo();
    const { espejo } = primeraSubida(srv, db, 'computador', '2026-08-11T08:00:00Z');
    const segundo = N.armarLote(db, espejo);
    assert.equal(N.tamanoLote(segundo), 0,
      'una sincronización sin cambios no puede mandar nada: si manda, resube la cartera entera cada vez');
  });

  test('cambiar UN crédito manda ese crédito y nada más, con la revisión que tenía', () => {
    const srv = servidorNuevo();
    const db = dbDemo();
    const { espejo } = primeraSubida(srv, db, 'computador', '2026-08-11T08:00:00Z');

    db.prestamos[0].pagado = true;
    db.prestamos[0].fechaPagado = '2026-08-11';

    const lote = N.armarLote(db, espejo);
    assert.equal(lote.socios.length, 0);
    assert.equal(lote.ajustes.length, 0);
    assert.equal(lote.creditos.length, 1);
    assert.equal(lote.creditos[0].id, 'P1754870000001');
    assert.equal(lote.creditos[0].revision_base, 1,
      'la revisión base es contra la que empezamos a trabajar: si va mal, el choque no se detecta');
  });

  test('una fila que estaba en el espejo y ya no está en el db se manda como borrada', () => {
    const srv = servidorNuevo();
    const db = dbDemo();
    const { espejo } = primeraSubida(srv, db, 'computador', '2026-08-11T08:00:00Z');

    db.socios = [];
    const lote = N.armarLote(db, espejo);
    assert.equal(lote.socios.length, 1);
    assert.equal(lote.socios[0].borrado, true);
    assert.equal(lote.socios[0].revision_base, 1);
    /* Se manda el último dato conocido, no un id pelado: el servidor tiene que
       poder decir DE QUIÉN era la ficha que se borró. */
    assert.equal(lote.socios[0].datos.nombre, 'Ana Restrepo');
  });

  test('una fila sin id no se sube y tampoco se traga en silencio', () => {
    const db = dbDemo();
    db.socios.push({ nombre: 'Sin ficha' });
    const lote = N.armarLote(db, N.espejoVacio());
    assert.equal(lote.socios.length, 1, 'la fila sin id no puede viajar');
    assert.equal(lote.omitidas.length, 1);
    assert.equal(lote.omitidas[0].tabla, 'socios');
  });

  test('la papelera no viaja cuando se pide sin papelera', () => {
    const db = dbDemo();
    db.papelera = [creditoDemo({ id: 'P-borrado' })];
    const lote = N.armarLote(db, N.espejoVacio(), { sinPapelera: true });
    const claves = lote.ajustes.map(a => a.clave);
    assert.ok(!claves.includes('papelera'));
    assert.ok(!claves.includes('papeleraSocios'));
    assert.ok(claves.includes('config'));
  });
});

/* ==========================================================================
 * 2 · jsonb REORDENA LAS LLAVES — la prueba que fija el arreglo
 *
 * Esta es la prueba que faltaba y por la que el sistema resubía todo. Va con
 * un socio con el orden de campos de crm.html, lo pasa por el servidor (que
 * reordena como jsonb) y exige que el diff devuelva CERO.
 * ======================================================================== */

describe('el orden de las llaves de jsonb no puede leerse como un cambio', () => {

  test('el servidor de mentira de verdad reordena (si no, las de abajo no prueban nada)', () => {
    const s = socioDemo();
    const vuelto = comoJsonb(clon(s));
    assert.notEqual(JSON.stringify(vuelto), JSON.stringify(s),
      'si el doble no reordena, la prueba del diff pasa sin probar nada');
    assert.deepEqual(vuelto, s, 'reordenar llaves no cambia el dato, solo el texto');
    assert.deepEqual(Object.keys(vuelto).slice(0, 5),
      ['id', 'email', 'nombre', 'numero', 'telefono'],
      'jsonb ordena por largo de la llave y después por bytes');
  });

  test('jsonCanonico da el MISMO texto antes y después de pasar por jsonb', () => {
    const s = socioDemo();
    assert.equal(N.jsonCanonico(comoJsonb(clon(s))), N.jsonCanonico(s));
    /* Y el orden de un array no se toca: ahí el orden sí es dato. */
    assert.notEqual(N.jsonCanonico({ a: [1, 2] }), N.jsonCanonico({ a: [2, 1] }));
  });

  test('una fila que vuelve del servidor con las llaves reordenadas NO se resube', () => {
    const srv = servidorNuevo();
    const db = dbDemo();
    primeraSubida(srv, db, 'computador', '2026-08-11T08:00:00Z');

    /* El camino que rompía: el espejo se rehace TRAYENDO de la nube, y lo que
       llega viene reordenado por jsonb. */
    const paquete = traerDeServidor(srv, null, '2026-08-11T08:00:05Z');
    const espejo = N.espejoDe(paquete);
    const lote = N.armarLote(db, espejo);

    assert.equal(N.tamanoLote(lote), 0,
      'nadie tocó nada: si esto manda filas, el computador resube la cartera completa ' +
      'en cada sincronización y toda fila del celular sale como choque falso');
  });

  test('un espejo guardado por una versión vieja (sin ordenar) se acomoda solo', () => {
    const db = dbDemo();
    /* Así lo escribía la versión anterior: JSON.stringify a secas del dato ya
       reordenado por jsonb. Al leerlo hay que recanonizarlo, o la primera
       sincronización después de actualizar vuelve a mandarlo todo. */
    const viejo = {
      socios: { [db.socios[0].id]: { revision: 1, json: JSON.stringify(comoJsonb(clon(db.socios[0]))) } },
      creditos: { [db.prestamos[0].id]: { revision: 1, json: JSON.stringify(comoJsonb(clon(db.prestamos[0]))) } },
      respaldados: {}, ajustes: {}
    };
    const lote = N.armarLote(db, viejo, { claves: [] });
    assert.equal(N.tamanoLote(lote), 0);
  });
});

/* ==========================================================================
 * 3 · EL MARTES DE COBRO — el caso que hoy pierde plata
 *
 * 8:00  el computador carga la cartera.
 * 10:15 Joan cobra en la calle desde el celular y sube.
 * 14:40 el computador guarda con su copia de las 8:00.
 *
 * Sin revisiones, a las 14:40 el computador escribe `pagado:false` encima del
 * cobro de las 10:15 y el crédito queda sin cobrar en la base. Nadie se entera
 * hasta que el cliente reclama que ya pagó.
 * ======================================================================== */

describe('el martes de cobro', () => {

  function montarElMartes() {
    const srv = servidorNuevo();

    // --- 8:00, el computador carga y sube lo que tiene ---
    const dbPC = dbDemo();
    const { espejo: espejoPC } = primeraSubida(srv, dbPC, 'computador', '2026-08-11T08:00:00Z');

    // --- 10:15, el celular cobra en la calle y sube ---
    const paqueteCel = traerDeServidor(srv, null, '2026-08-11T10:14:00Z');
    const espejoCel = N.espejoDe(paqueteCel);
    const aplicado = N.aplicarPaquete({}, paqueteCel);
    const dbCel = aplicado.db;
    const credCel = dbCel.prestamos[0];
    credCel.pagado = true;
    credCel.fechaPagado = '2026-08-11';
    credCel.gananciaPago = 60000;
    credCel.cicloPago = '2026-08-15';
    credCel.comprobantes = [{ fecha: '2026-08-11', tipo: 'pago', monto: 360000 }];

    const loteCel = N.armarLote(dbCel, espejoCel);
    const respCel = empujarEnServidor(srv, 'celular', N.loteLimpio(loteCel), '2026-08-11T10:15:00Z');

    // --- 14:40, el computador guarda con su copia vieja ---
    // Joan anotó en el computador un abono en efectivo del mismo crédito. Su
    // copia sigue diciendo pagado:false, porque es la de las 8:00.
    dbPC.prestamos[0].comprobantes = [{ fecha: '2026-08-11', tipo: 'abono', monto: 50000 }];
    const lotePC = N.armarLote(dbPC, espejoPC);
    const respPC = empujarEnServidor(srv, 'computador', N.loteLimpio(lotePC), '2026-08-11T14:40:00Z');

    return { srv, dbPC, dbCel, espejoPC, loteCel, respCel, lotePC, respPC };
  }

  test('a las 10:15 el celular escribe sin problema: nadie más había tocado el crédito', () => {
    const m = montarElMartes();
    assert.equal(m.respCel.choques.length, 0);
    assert.equal(m.respCel.aplicados, 1);
    assert.equal(m.respCel.revisiones[0].revision, 2);
  });

  test('a las 14:40 el computador CHOCA y no pisa el cobro', () => {
    const m = montarElMartes();
    assert.equal(m.respPC.aplicados, 0, 'no se puede escribir ni una fila: la del servidor es más nueva');
    assert.equal(m.respPC.choques.length, 1);

    const enLaNube = m.srv.creditos['P1754870000001'];
    assert.equal(enLaNube.revision, 2);
    assert.equal(enLaNube.datos.pagado, true, 'EL COBRO DE LAS 10:15 SIGUE AHÍ');
    assert.equal(enLaNube.actualizado_por, 'celular');
  });

  test('a las 14:45, con el choque SIN resolver, la segunda subida tampoco lo pisa', () => {
    const m = montarElMartes();

    /* Esto es exactamente lo que hacen subir.html (paso 5) y subirCola() en el
       celular después de una respuesta con choques. */
    const espejoDespues = N.espejoTrasEmpujar(m.espejoPC, m.lotePC, m.respPC);
    assert.equal(espejoDespues.creditos['P1754870000001'].revision, 1,
      'el espejo no puede adelantar la revisión de una fila que este aparato NUNCA aplicó: ' +
      'eso convierte la copia vieja en una edición legítima contra la revisión nueva');

    // Joan aprieta «Subir» otra vez, sin haber elegido nada en el paso 7.
    const lote2 = N.armarLote(m.dbPC, espejoDespues);
    assert.equal(lote2.creditos.length, 1);
    assert.equal(lote2.creditos[0].revision_base, 1,
      'tiene que volver a salir contra la revisión de las 8:00, que es contra la que se trabajó');

    const resp2 = empujarEnServidor(m.srv, 'computador', N.loteLimpio(lote2), '2026-08-11T14:45:00Z');
    assert.equal(resp2.aplicados, 0, 'nada se escribe mientras el choque siga sin resolver');
    assert.equal(resp2.choques.length, 1, 'y la ficha vuelve a la lista de choques, que es donde Joan la ve');

    const enLaNube = m.srv.creditos['P1754870000001'];
    assert.equal(enLaNube.datos.pagado, true, 'EL COBRO DE LAS 10:15 SIGUE AHÍ');
    assert.equal(enLaNube.revision, 2);
  });

  test('el choque se corta cuando Joan decide, y no antes', () => {
    const m = montarElMartes();
    const ch = m.respPC.choques[0];

    /* [Mandar lo mío encima]: la pantalla anota en el espejo la revisión del
       servidor para esa fila —subir.html con las marcadas «lo mío manda»,
       espejo.html reencolando contra revision_servidor— y solo entonces la
       versión de Joan pisa. Es una decisión suya, escrita, no un efecto
       secundario de haber apretado subir dos veces. */
    const espejo = N.espejoDe(
      { completo: false, creditos: [{ id: ch.id, datos: ch.datos_servidor, revision: ch.revision_servidor }] },
      N.espejoTrasEmpujar(m.espejoPC, m.lotePC, m.respPC));

    const lote = N.armarLote(m.dbPC, espejo);
    assert.equal(lote.creditos[0].revision_base, 2);
    const resp = empujarEnServidor(m.srv, 'computador', N.loteLimpio(lote), '2026-08-11T15:00:00Z');
    assert.equal(resp.aplicados, 1, 'cuando Joan lo pide, su versión sí entra');
    assert.equal(m.srv.creditos['P1754870000001'].revision, 3);
  });

  test('las DOS versiones quedan guardadas antes de preguntarle nada a nadie', () => {
    const m = montarElMartes();
    const guardados = N.choquesDe(m.lotePC, m.respPC, 'computador');
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].tabla, 'creditos');
    assert.equal(guardados[0].id, 'P1754870000001');
    assert.equal(guardados[0].mio.pagado, false, 'lo que quiso escribir el computador');
    assert.equal(guardados[0].suyo.pagado, true, 'lo que había en la nube, del celular');
    assert.equal(guardados[0].mio.comprobantes[0].monto, 50000);
    assert.equal(guardados[0].suyo.comprobantes[0].monto, 360000);
    assert.equal(guardados[0].resuelto_como, null, 'nadie decidió todavía');

    /* Y el servidor también dejó constancia, que es lo que exige el contrato:
       si el aparato se pierde, la evidencia del choque sigue estando. */
    assert.equal(m.srv.choques.length, 1);
    assert.equal(m.srv.choques[0].mio.pagado, false);
    assert.equal(m.srv.choques[0].suyo.pagado, true);
  });

  test('lo que chocó NO se va de la cola: sigue esperando, marcado', () => {
    const m = montarElMartes();
    const cola = N.encolar(N.colaVacia(), {
      tabla: 'creditos', id: 'P1754870000001',
      datos: m.dbPC.prestamos[0], revision_base: 1, que: 'abono'
    });
    const despues = N.quitarDeCola(cola, m.respPC);
    assert.equal(despues.length, 1, 'una fila sale de la cola cuando el servidor la confirma, y nunca antes');
    assert.equal(despues[0].choque, true);
    assert.equal(N.contarPendientes(despues), 1, 'el aviso tiene que seguir diciendo que hay 1 esperando');
  });

  test('el que sí se escribió se va de la cola, y el que chocó se queda', () => {
    const m = montarElMartes();
    const cola = [
      { tabla: 'creditos', id: 'P1754870000001', datos: {}, revision_base: 1 },
      { tabla: 'socios', id: 'C1754870000000', datos: {}, revision_base: 1 }
    ];
    const resp = { revisiones: [{ tabla: 'socios', id: 'C1754870000000', revision: 2 }], choques: m.respPC.choques };
    const despues = N.quitarDeCola(cola, resp);
    assert.equal(despues.length, 1);
    assert.equal(despues[0].tabla, 'creditos');
  });

  test('juntando las dos versiones no se pierde ningún movimiento, y `pagado` va al aviso', () => {
    const m = montarElMartes();
    const mio = m.lotePC.creditos[0].datos;
    const suyo = m.respPC.choques[0].datos_servidor;
    const f = N.fusionarFila(mio, suyo, N.LISTAS_CREDITO);

    assert.equal(f.fila.comprobantes.length, 2, 'el abono del computador y el pago del celular conviven');
    assert.ok(f.hayChoque);
    const campos = f.pisables.map(p => p.campo);
    assert.ok(campos.includes('pagado'), 'un merge que decide solo si el crédito está pagado borra un cobro');
  });
});

/* ==========================================================================
 * 4 · fusionarListas — lo único que se puede juntar sin preguntar
 * ======================================================================== */

describe('fusionarListas', () => {

  const g1 = { fecha: '2026-08-01', canal: 'whatsapp', plantilla: 'recordatorio' };
  const g2 = { fecha: '2026-08-05', canal: 'llamada', plantilla: 'mora' };
  const g3 = { fecha: '2026-08-03', canal: 'whatsapp', plantilla: 'corte' };

  test('une sin duplicar y sin perder ninguna', () => {
    const r = N.fusionarListas([g1, g2], [g2, g3], ['fecha', 'canal', 'plantilla']);
    assert.equal(r.length, 3);
  });

  test('da el mismo resultado vengan del orden que vengan', () => {
    const a = N.fusionarListas([g1, g2], [g3], ['fecha', 'canal', 'plantilla']);
    const b = N.fusionarListas([g3], [g2, g1], ['fecha', 'canal', 'plantilla']);
    assert.deepEqual(a, b, 'si el resultado depende de quién es "el mío", dos aparatos quedan distintos para siempre');
  });

  test('queda ordenada por fecha', () => {
    const r = N.fusionarListas([g2], [g3, g1], ['fecha', 'canal', 'plantilla']);
    assert.deepEqual(r.map(x => x.fecha), ['2026-08-01', '2026-08-03', '2026-08-05']);
  });

  test('el mismo comprobante con foto y sin foto es UNO solo', () => {
    const sinFoto = { fecha: '2026-08-11', tipo: 'pago', monto: 360000 };
    const conFoto = { fecha: '2026-08-11', tipo: 'pago', monto: 360000, foto: 'data:image/png;base64,AAA' };
    const r = N.fusionarListas([conFoto], [sinFoto], N.LISTAS_CREDITO.comprobantes);
    assert.equal(r.length, 1, 'la foto no es parte de la identidad del hecho: es el mismo pago');
    assert.equal(r[0].foto, 'data:image/png;base64,AAA', 'gana el primero, que trae más campos llenos');
  });

  test('dos pagos del mismo día por montos distintos son DOS pagos', () => {
    const r = N.fusionarListas(
      [{ fecha: '2026-08-11', tipo: 'abono', monto: 50000 }],
      [{ fecha: '2026-08-11', tipo: 'abono', monto: 80000 }],
      N.LISTAS_CREDITO.abonos);
    assert.equal(r.length, 2, 'juntar dos abonos distintos en uno es borrarle plata a Joan');
  });

  test('no toca las listas que le dan', () => {
    const mias = [g1];
    N.fusionarListas(mias, [g2], ['fecha', 'canal', 'plantilla']);
    assert.equal(mias.length, 1);
  });

  test('prórrogas: el mismo ciclo prorrogado dos veces por montos distintos no se colapsa', () => {
    const r = N.fusionarListas(
      [{ fecha: '2026-07-31', ciclo: '2026-07-31', monto: 60000 }],
      [{ fecha: '2026-08-15', ciclo: '2026-08-15', monto: 60000 }],
      N.LISTAS_CREDITO.prorrogas);
    assert.equal(r.length, 2);
  });

  /* ---------------------------------------------------------------------
     14-ago-2026 — LA GESTIÓN DE LA TANDA
     La tanda del celular anota la gestión con `hora` (la Ley 2300 obliga a
     poder probar que el contacto fue dentro del horario) y con `tipo`. El
     computador anota la misma gestión sin esos campos. Son EL MISMO HECHO.
     --------------------------------------------------------------------- */

  test('la misma gestión con hora y sin hora es UNA sola', () => {
    /* Si `hora` entrara en la identidad, el tope de la Ley 2300 —que se cuenta
       sobre esta lista— vería dos contactos donde hubo uno. */
    const delCelular = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora',
                         hora: '2026-08-14T09:12:00-05:00', tipo: 'cobro', origen: 'tanda' };
    const delComputador = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora' };
    const r = N.fusionarListas([delCelular], [delComputador], N.LISTAS_SOCIO.gestiones);
    assert.equal(r.length, 1);
  });

  test('y la hora NO se pierde aunque el que gane sea el que no la trae', () => {
    /* Este era el defecto: el primero ganaba ENTERO y lo del otro se tiraba.
       La hora es lo único con lo que Joan podría probar, si lo investigan, que
       escribió dentro del horario del artículo 3. */
    const conHora = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora',
                      hora: '2026-08-14T09:12:00-05:00' };
    const sinHora = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora' };
    const r = N.fusionarListas([sinHora], [conHora], N.LISTAS_SOCIO.gestiones);
    assert.equal(r.length, 1);
    assert.equal(r[0].hora, '2026-08-14T09:12:00-05:00');
  });

  test('completar NUNCA pisa un valor que ya estaba', () => {
    const mia = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora', hora: 'A', tipo: 'cobro' };
    const suya = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora', hora: 'B', grupo: 'hoy' };
    const r = N.fusionarListas([mia], [suya], N.LISTAS_SOCIO.gestiones);
    assert.equal(r[0].hora, 'A', 'el ganador manda en lo que los dos traen');
    assert.equal(r[0].grupo, 'hoy', 'y se queda con lo que solo traía el otro');
    assert.equal(r[0].tipo, 'cobro');
  });

  test('el resultado es el MISMO en los dos sentidos, también con campos distintos', () => {
    /* La promesa de esta función. Antes solo se cumplía cuando los dos lados
       eran idénticos; con dos aparatos escribiendo el mismo hecho con distinto
       detalle, cada uno se quedaba con una versión distinta para siempre. */
    const a = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora', hora: 'A' };
    const b = { fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora', tipo: 'cobro' };
    assert.deepEqual(
      N.fusionarListas([a], [b], N.LISTAS_SOCIO.gestiones),
      N.fusionarListas([b], [a], N.LISTAS_SOCIO.gestiones));
  });

  test('un choque de cobro no puede borrar un «ya lo contacté»', () => {
    /* Es la razón de que el avance de la tanda VIVA en las gestiones y no en un
       campo propio: si viviera en un campo, «mandar lo mío encima» lo borraría
       y la tanda volvería a ofrecer a alguien al que Joan ya le escribió — un
       segundo contacto el mismo día, que es lo que el artículo 3 prohíbe. */
    const mio = { id: 's1', nombre: 'Ana', telefono: '300',
                  gestiones: [{ fecha: '2026-08-14', canal: 'whatsapp', plantilla: 'mora', hora: 'X' }] };
    const suyo = { id: 's1', nombre: 'Ana María', telefono: '300',
                   gestiones: [{ fecha: '2026-08-13', canal: 'llamada', plantilla: 'moraTemprana' }] };
    const f = N.fusionarFila(mio, suyo, N.LISTAS_SOCIO);
    assert.equal(f.fila.gestiones.length, 2, 'las dos gestiones tienen que sobrevivir al choque');
    assert.ok(f.pisables.some(p => p.campo === 'nombre'), 'el nombre sí es un choque para Joan');
    assert.ok(!f.pisables.some(p => p.campo === 'gestiones'), 'las gestiones nunca son un choque: suman');
  });
});

/* ==========================================================================
 * 5 · fusionarFila — NO decide sola nada que valga plata
 * ======================================================================== */

describe('fusionarFila', () => {

  test('ningún campo pisable se resuelve solo: todos van al aviso', () => {
    const mia = creditoDemo({ pagado: false, capital: 300000, fechaPagado: '' });
    const suya = creditoDemo({ pagado: true, capital: 250000, fechaPagado: '2026-08-11' });
    const f = N.fusionarFila(mia, suya, N.LISTAS_CREDITO);

    /* Los tres que nombra el contrato y que valen plata. `fechaPagado` entra
       aunque lo mío esté vacío: "vacío" es un dato que alguien escribió, no un
       campo que falta, y decidir por Joan que gana el lleno es exactamente el
       merge inteligente que borra un cobro. */
    const campos = f.pisables.map(p => p.campo).sort();
    assert.deepEqual(campos, ['capital', 'fechaPagado', 'pagado']);
    assert.ok(f.hayChoque);
    /* Lo mío se queda como estaba: `fila` es "lo mío con las listas completas",
       o sea lo que se manda si Joan elige [Mandar lo mío encima]. */
    assert.equal(f.fila.pagado, false);
    assert.equal(f.fila.capital, 300000);
  });

  test('nombre y cédula tampoco: son la ficha del cliente', () => {
    const f = N.fusionarFila(
      socioDemo({ nombre: 'Ana Restrepo', cedula: '1020304050' }),
      socioDemo({ nombre: 'Ana R. Restrepo', cedula: '1020304051' }),
      N.LISTAS_SOCIO);
    const campos = f.pisables.map(p => p.campo).sort();
    assert.deepEqual(campos, ['cedula', 'nombre']);
  });

  test('un campo que SOLO existe en la nube se copia: no hay nada mío que pisar', () => {
    const mia = socioDemo();
    const suya = socioDemo({ codigoAcceso: 'K7M2Q' });
    const f = N.fusionarFila(mia, suya, N.LISTAS_SOCIO);
    assert.equal(f.fila.codigoAcceso, 'K7M2Q');
    assert.equal(f.pisables.length, 0, 'copiar lo que no tengo no es pisar nada');
  });

  test('si los dos dicen lo mismo no hay nada que decidir', () => {
    const f = N.fusionarFila(socioDemo(), socioDemo(), N.LISTAS_SOCIO);
    assert.equal(f.hayChoque, false);
    assert.deepEqual(f.pisables, []);
  });

  test('las listas sí se juntan solas, en la misma pasada', () => {
    const mia = creditoDemo({ comprobantes: [{ fecha: '2026-08-11', tipo: 'abono', monto: 50000 }] });
    const suya = creditoDemo({ comprobantes: [{ fecha: '2026-08-12', tipo: 'pago', monto: 360000 }] });
    const f = N.fusionarFila(mia, suya, N.LISTAS_CREDITO);
    assert.equal(f.fila.comprobantes.length, 2);
    assert.equal(f.hayChoque, false, 'juntar dos listas que solo suman no es un choque');
  });

  test('no muta ninguna de las dos que le dan', () => {
    const mia = creditoDemo({ comprobantes: [{ fecha: '2026-08-11', tipo: 'abono', monto: 50000 }] });
    const suya = creditoDemo({ pagado: true, comprobantes: [] });
    const copiaMia = clon(mia), copiaSuya = clon(suya);
    N.fusionarFila(mia, suya, N.LISTAS_CREDITO);
    assert.deepEqual(mia, copiaMia);
    assert.deepEqual(suya, copiaSuya);
  });
});

/* ==========================================================================
 * 6 · sinFotos — las fotos no viajan, y el original no se toca
 * ======================================================================== */

describe('sinFotos', () => {

  const conFotos = () => socioDemo({
    cedulaFrenteFoto: 'data:image/png;base64,AAA',
    cedulaReversoFoto: 'data:image/png;base64,BBB',
    selfieFoto: 'data:image/png;base64,CCC',
    cedulaFoto: 'data:image/png;base64,DDD',
    comprobantes: [{ fecha: '2026-08-11', tipo: 'pago', monto: 360000, foto: 'data:image/png;base64,EEE' }]
  });

  test('quita las cuatro clases de foto del socio', () => {
    const limpio = N.sinFotos(conFotos());
    N.CAMPOS_FOTO.forEach(c => assert.ok(!(c in limpio), 'quedó ' + c));
  });

  test('quita también la foto de cada comprobante, y deja el resto del comprobante', () => {
    const limpio = N.sinFotos(conFotos());
    assert.equal(limpio.comprobantes.length, 1);
    assert.ok(!('foto' in limpio.comprobantes[0]));
    assert.equal(limpio.comprobantes[0].monto, 360000, 'el hecho se conserva entero; lo que no viaja es la imagen');
  });

  test('NO toca el original: las fotos se quedan en el computador, no se borran', () => {
    const original = conFotos();
    const copia = clon(original);
    N.sinFotos(original);
    assert.deepEqual(original, copia,
      'si esto mutara, subir la cartera le BORRARÍA a Joan las cédulas de su disco');
  });

  test('lo demás del socio queda intacto', () => {
    const limpio = N.sinFotos(conFotos());
    assert.equal(limpio.nombre, 'Ana Restrepo');
    assert.equal(limpio.telefono, '3001234567');
    assert.deepEqual(limpio.referencia, { nombre: 'Luz', telefono: '3009999999' });
  });

  test('un campo de foto vacío no se toca: no es una foto, es un campo en null', () => {
    const limpio = N.sinFotos(socioDemo({ selfieFoto: null }));
    assert.ok('selfieFoto' in limpio);
  });

  test('lo que sube de verdad no lleva ni una foto', () => {
    const db = dbDemo();
    db.socios = [conFotos()];
    const lote = N.armarLote(db, N.espejoVacio());
    const texto = JSON.stringify(lote.socios);
    assert.ok(texto.indexOf('base64') < 0, 'se coló una foto en el lote');
  });
});

/* ==========================================================================
 * 7 · aplicarPaquete — el db que sale tiene que servirle al PUENTE
 *
 * No basta con que "tenga la forma": se carga PuenteTuGarantia de verdad y se
 * le pregunta algo real. Si aplicarPaquete devolviera `clientes` en vez de
 * `socios`, o `creditos` en vez de `prestamos`, el Panel abriría vacío y las
 * pruebas de forma no se enterarían.
 * ======================================================================== */

describe('aplicarPaquete y el puente', () => {

  function paqueteReal() {
    const srv = servidorNuevo();
    const db = dbDemo();
    db.prestamos[0].pagado = true;
    db.prestamos[0].fechaPagado = '2026-07-31';
    db.prestamos[0].cicloPago = '2026-07-31';
    db.prestamos[0].gananciaPago = 60000;
    primeraSubida(srv, db, 'computador', '2026-08-11T08:00:00Z');
    return { db, paquete: traerDeServidor(srv, null, '2026-08-11T08:00:05Z') };
  }

  test('el puente lee el db que sale y contesta lo mismo que con el original', () => {
    const { db, paquete } = paqueteReal();
    const salida = N.aplicarPaquete({}, paquete).db;

    const socioOriginal = db.socios[0];
    const socioVuelto = salida.socios[0];

    /* La cuenta la hace el PUENTE. Acá no se escribe ningún número de garantía:
       se exige que las dos respuestas coincidan. */
    const antes = P.garantiaGanadaDe(db, socioOriginal);
    const despues = P.garantiaGanadaDe(salida, socioVuelto);
    assert.equal(despues, antes);
    assert.ok(antes > 0, 'con un crédito pagado el puente tiene que dar garantía: si da 0, la prueba no probó nada');

    assert.deepEqual(P.fotoComunidad(salida), P.fotoComunidad(db));
    assert.equal(P.codCliente(socioVuelto), P.codCliente(socioOriginal));
  });

  test('el paquete del socio (migrarSocio) sale igual del db reconstruido', () => {
    const { db, paquete } = paqueteReal();
    const salida = N.aplicarPaquete({}, paquete).db;
    assert.deepEqual(
      P.migrarSocio(salida, salida.socios[0]),
      P.migrarSocio(db, db.socios[0]),
      'si esto se rompe, el socio ve números distintos según por dónde entró');
  });

  test('devuelve un db NUEVO: el que recibe no se toca', () => {
    const { paquete } = paqueteReal();
    const previo = { socios: [], prestamos: [], respaldados: [] };
    const copia = clon(previo);
    N.aplicarPaquete(previo, paquete);
    assert.deepEqual(previo, copia);
  });

  test('cuenta los cambios y no cuenta lo que llegó igual', () => {
    const { db, paquete } = paqueteReal();
    const primera = N.aplicarPaquete({}, paquete);
    assert.equal(primera.cambios.socios, 1);
    assert.equal(primera.cambios.creditos, 1);
    const segunda = N.aplicarPaquete(primera.db, paquete);
    assert.equal(segunda.cambios.socios, 0, 'aplicar dos veces lo mismo no es un cambio');
    assert.equal(segunda.cambios.creditos, 0);
    assert.equal(segunda.db.socios.length, db.socios.length, 'y no duplica filas');
  });

  test('un borrado de la nube saca la fila, y una fila sin datos no borra la que hay', () => {
    const { paquete } = paqueteReal();
    const base = N.aplicarPaquete({}, paquete).db;

    const conBorrado = N.aplicarPaquete(base, { socios: [{ id: base.socios[0].id, borrado: true }] });
    assert.equal(conBorrado.db.socios.length, 0);

    const conVacio = N.aplicarPaquete(base, { socios: [{ id: base.socios[0].id, datos: null }] });
    assert.equal(conVacio.db.socios.length, 1, 'un jsonb en null no puede dejar al socio sin ficha');
  });

  test('los contadores SUBEN al máximo y no bajan nunca', () => {
    const base = { contadores: { cliente: 48, credito: 91, respaldado: 3 } };
    const r = N.aplicarPaquete(base, { contadores: { cliente: 50, credito: 80, respaldado: 3 } });
    assert.equal(r.db.contadores.cliente, 50, 'el otro aparato ya emitió el 50');
    assert.equal(r.db.contadores.credito, 91, 'bajarlo repite un número de crédito, y eso no se desarma después');
  });

  test('una clave de ajuste desconocida no se le mete al Panel', () => {
    const r = N.aplicarPaquete({}, { ajustes: [{ clave: 'inventada', datos: { x: 1 } }] });
    assert.equal(r.db.inventada, undefined);
    assert.equal(r.cambios.ajustes, 0);
  });
});

/* ==========================================================================
 * 8 · IDA Y VUELTA — db → lote → paquete → db, al peso
 * ======================================================================== */

describe('ida y vuelta', () => {

  test('lo que sale es lo mismo que entró (sin fotos, que no viajan)', () => {
    const db = dbDemo();
    const lote = N.armarLote(db, N.espejoVacio());
    const paquete = N.paqueteDeLote(lote, { completo: true, contadores: db.contadores });
    const vuelta = N.aplicarPaquete({}, paquete).db;
    const esperado = N.dbBase(N.dbSinFotos(db));

    ['socios', 'prestamos', 'respaldados', 'papelera', 'papeleraSocios',
      'invitaciones', 'plantillas', 'config', 'contadores'].forEach(campo => {
        assert.deepEqual(vuelta[campo], esperado[campo], 'se movió ' + campo);
      });
  });

  test('la ida y vuelta ATRAVESANDO jsonb también', () => {
    const srv = servidorNuevo();
    const db = dbDemo();
    primeraSubida(srv, db, 'computador', '2026-08-11T08:00:00Z');
    const vuelta = N.aplicarPaquete({}, traerDeServidor(srv, null, '2026-08-11T08:00:05Z')).db;
    const esperado = N.dbBase(N.dbSinFotos(db));

    /* deepEqual no mira el orden de las llaves, y por eso solita NO habría
       cazado el defecto del orden: por eso además está la prueba del diff. */
    assert.deepEqual(vuelta.socios, esperado.socios);
    assert.deepEqual(vuelta.prestamos, esperado.prestamos);
    assert.deepEqual(vuelta.config, esperado.config);
  });

  test('con fotos, la vuelta las conserva (es el camino del respaldo local)', () => {
    const db = dbDemo();
    db.socios[0].selfieFoto = 'data:image/png;base64,CCC';
    const lote = N.armarLote(db, N.espejoVacio(), { conFotos: true });
    const vuelta = N.aplicarPaquete({}, N.paqueteDeLote(lote, { completo: true })).db;
    assert.equal(vuelta.socios[0].selfieFoto, 'data:image/png;base64,CCC');
  });
});

/* ==========================================================================
 * 9 · LA COLA — nada sale sin confirmación del servidor
 * ======================================================================== */

describe('la cola de salida', () => {

  test('tocar tres veces el mismo crédito es UNA cosa pendiente', () => {
    let cola = N.colaVacia();
    cola = N.encolar(cola, { tabla: 'creditos', id: 'P1', datos: { v: 1 }, revision_base: 4 });
    cola = N.encolar(cola, { tabla: 'creditos', id: 'P1', datos: { v: 2 }, revision_base: 9 });
    cola = N.encolar(cola, { tabla: 'creditos', id: 'P1', datos: { v: 3 }, revision_base: 9 });
    assert.equal(cola.length, 1);
    assert.equal(N.contarPendientes(cola), 1, 'el aviso dice cosas pendientes, no ediciones');
    assert.deepEqual(cola[0].datos, { v: 3 }, 'se queda el dato más nuevo');
    assert.equal(cola[0].revision_base, 4,
      'y la revisión base del PRIMERO: si se refresca, el segundo intento pisa al otro aparato sin avisar');
  });

  test('la cola conserva revision_base null (fila creada acá)', () => {
    let cola = N.encolar(N.colaVacia(), { tabla: 'socios', id: 'C9', datos: { a: 1 }, revision_base: null });
    cola = N.encolar(cola, { tabla: 'socios', id: 'C9', datos: { a: 2 }, revision_base: 7 });
    assert.equal(cola[0].revision_base, null,
      'null quiere decir "esta la creé yo"; si se pierde, dos aparatos creando la misma fila se pisan');
  });

  test('encolar no muta la cola que recibe', () => {
    const cola = N.colaVacia();
    N.encolar(cola, { tabla: 'socios', id: 'C9', datos: {} });
    assert.equal(cola.length, 0);
  });

  test('la cola se convierte en lote sin perder nada, y avisa lo que no puede mandar', () => {
    const lote = N.loteDeCola([
      { tabla: 'socios', id: 'C1', datos: { a: 1 }, revision_base: 2 },
      { tabla: 'creditos', id: 'P1', datos: { b: 1 }, revision_base: null },
      { tabla: 'ajustes', clave: 'config', datos: { c: 1 }, revision_base: 3 },
      { tabla: 'inventada', id: 'X1', datos: {} },
      { tabla: 'socios', datos: {} }
    ]);
    assert.equal(lote.socios.length, 1);
    assert.equal(lote.creditos.length, 1);
    assert.equal(lote.ajustes.length, 1);
    assert.equal(lote.omitidas.length, 2);
  });

  test('contarPendientes aguanta cola, lote y paquete', () => {
    assert.equal(N.contarPendientes(null), 0);
    assert.equal(N.contarPendientes([]), 0);
    assert.equal(N.contarPendientes({ socios: [{ id: 'a' }], creditos: [], respaldados: [], ajustes: [{ clave: 'config' }] }), 2);
  });

  test('partirLote parte de a 200 y no pierde ni una fila', () => {
    const db = { socios: [], prestamos: [], respaldados: [] };
    for (let i = 0; i < 450; i++) db.socios.push(socioDemo({ id: 'C' + i, numero: i }));
    const lote = N.armarLote(db, N.espejoVacio(), { claves: [] });
    const pedazos = N.partirLote(lote, 200);
    assert.equal(pedazos.length, 3);
    const total = pedazos.reduce((t, p) => t + p.socios.length, 0);
    assert.equal(total, 450);
  });
});

/* ==========================================================================
 * 10 · EL ESPEJO — la marca de por dónde vamos
 * ======================================================================== */

describe('el espejo', () => {

  test('lo que chocó NO mueve el espejo: la entrada vieja se queda tal cual', () => {
    const antes = N.espejoDe({ completo: true, creditos: [{ id: 'P1', datos: { pagado: false }, revision: 1 }] });
    const lote = { creditos: [{ id: 'P1', datos: { pagado: false, abono: 50000 }, revision_base: 1 }] };
    const resp = {
      revisiones: [],
      choques: [{ tabla: 'creditos', id: 'P1', revision_servidor: 2, datos_servidor: { pagado: true } }]
    };
    const e = N.espejoTrasEmpujar(antes, lote, resp);
    assert.equal(e.creditos.P1.revision, 1,
      'adelantar la revisión de lo que chocó es firmar la próxima subida a nombre de una versión que este aparato no tiene');
    assert.equal(e.creditos.P1.json, N.jsonCanonico({ pagado: false }));
  });

  test('una fila que chocó y nunca había estado en el espejo no se inventa', () => {
    /* Pasa cuando dos aparatos estrenan la misma ficha: la mía sale con
       revision_base null y el servidor contesta choque. Si el espejo se
       quedara con la revisión de allá, la próxima subida pisaría la ficha del
       otro aparato sin volver a preguntar. */
    const e = N.espejoTrasEmpujar(N.espejoVacio(),
      { socios: [{ id: 'C9', datos: { nombre: 'Ana' }, revision_base: null }] },
      { revisiones: [], choques: [{ tabla: 'socios', id: 'C9', revision_servidor: 1, datos_servidor: { nombre: 'Otro' } }] });
    assert.equal(e.socios.C9, undefined);
  });

  test('lo que sí se escribió avanza, aunque el servidor solo mande tabla/id/revisión', () => {
    /* panel_empujar devuelve tres campos en `revisiones`, ni uno más. El espejo
       tiene que quedar completo igual, con el JSON que mandamos nosotros. */
    const lote = { socios: [{ id: 'C1', datos: { nombre: 'Ana' }, revision_base: null, borrado: false }] };
    const e = N.espejoTrasEmpujar(N.espejoVacio(), lote,
      { revisiones: [{ tabla: 'socios', id: 'C1', revision: 1 }], choques: [] });
    assert.equal(e.socios.C1.revision, 1);
    assert.equal(e.socios.C1.json, N.jsonCanonico({ nombre: 'Ana' }));
  });

  test('un paquete completo descarta el espejo viejo; uno incremental lo conserva', () => {
    const previo = N.espejoDe({ completo: true, socios: [{ id: 'C1', datos: { a: 1 }, revision: 1 }] });
    const incremental = N.espejoDe({ completo: false, socios: [{ id: 'C2', datos: { b: 1 }, revision: 1 }] }, previo);
    assert.ok(incremental.socios.C1, 'un incremental solo trae lo que cambió: lo demás sigue estando');
    assert.ok(incremental.socios.C2);

    const completo = N.espejoDe({ completo: true, socios: [{ id: 'C2', datos: { b: 1 }, revision: 1 }] }, previo);
    assert.ok(!completo.socios.C1, 'con el paquete completo, lo que no vino ya no está en la nube');
  });

  test('guarda la hora DEL SERVIDOR, no la del aparato', () => {
    const e = N.espejoDe({ completo: true, servidor_ahora: '2026-08-11T15:00:00Z', socios: [] });
    assert.equal(e.servidor_ahora, '2026-08-11T15:00:00Z');
  });

  test('normalizarEspejo no muta el que recibe', () => {
    const espejo = N.espejoDe({ completo: true, socios: [{ id: 'C1', datos: { a: 1 }, revision: 1 }] });
    const copia = clon(espejo);
    N.armarLote(dbDemo(), espejo);
    assert.deepEqual(espejo, copia);
  });
});

/* ==========================================================================
 * 11 · DOS APARATOS ESTRENAN LA MISMA FICHA
 *
 * No es rebuscado: es el lunes en que Joan crea a la señora en el celular
 * mientras el computador todavía tiene abierta la ficha que le empezó a llenar
 * en la mañana. Los dos mandan revision_base null, que quiere decir "esta la
 * creé yo". El primero entra; el segundo TIENE que chocar, porque las dos
 * fichas son distintas y quedarse con una es perder la otra.
 * ======================================================================== */

describe('dos aparatos estrenan la misma ficha', () => {

  test('el segundo choca en vez de pisar, y sigue chocando hasta que Joan decida', () => {
    const srv = servidorNuevo();

    const delCelular = { id: 'C777', nombre: 'Rosa Elena Díaz', telefono: '3101112233' };
    const delPC = { id: 'C777', nombre: 'Rosa Diaz', telefono: '3009998877', cedula: '52123456' };

    const r1 = empujarEnServidor(srv, 'celular',
      { socios: [{ id: 'C777', datos: delCelular, revision_base: null }] }, '2026-08-10T09:00:00Z');
    assert.equal(r1.aplicados, 1);

    const lotePC = { socios: [{ id: 'C777', datos: delPC, revision_base: null }] };
    const r2 = empujarEnServidor(srv, 'computador', lotePC, '2026-08-10T09:02:00Z');
    assert.equal(r2.aplicados, 0, 'una fila nueva que ya existe no se escribe: es choque, dice el contrato');
    assert.equal(r2.choques.length, 1);
    assert.equal(srv.socios.C777.datos.nombre, 'Rosa Elena Díaz', 'la del celular sigue entera');

    /* Y el espejo no se queda con la revisión de allá, así que el reintento
       vuelve a salir como fila nueva y vuelve a chocar. La ficha del otro
       aparato no se puede perder por apretar subir dos veces. */
    const espejo = N.espejoTrasEmpujar(N.espejoVacio(), lotePC, r2);
    assert.equal(espejo.socios.C777, undefined);
    const r3 = empujarEnServidor(srv, 'computador', lotePC, '2026-08-10T09:05:00Z');
    assert.equal(r3.aplicados, 0);
    assert.equal(srv.socios.C777.datos.nombre, 'Rosa Elena Díaz');
  });

  test('las dos fichas quedan guardadas para que Joan las compare', () => {
    const srv = servidorNuevo();
    empujarEnServidor(srv, 'celular',
      { socios: [{ id: 'C777', datos: { id: 'C777', nombre: 'Rosa Elena Díaz' }, revision_base: null }] },
      '2026-08-10T09:00:00Z');
    const lotePC = { socios: [{ id: 'C777', datos: { id: 'C777', nombre: 'Rosa Diaz' }, revision_base: null }] };
    const r = empujarEnServidor(srv, 'computador', lotePC, '2026-08-10T09:02:00Z');

    const guardados = N.choquesDe(lotePC, r, 'computador');
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].mio.nombre, 'Rosa Diaz');
    assert.equal(guardados[0].suyo.nombre, 'Rosa Elena Díaz');
  });
});

/* ==========================================================================
 * 12 · EL DISCO — la única llave que no se puede tocar
 *
 * En el computador, crm.html, subir.html y espejo.html comparten origen: el
 * localStorage es EL MISMO. Una sola línea distraída que escriba en
 * 'joan_socios_v1' le borra a Joan la cartera de verdad, y no hay respaldo que
 * valga si nadie se entera hasta el otro día.
 *
 * Estas pruebas no necesitan navegador: le ponen a node un localStorage de
 * mentira y miran QUÉ LLAVES quedaron escritas.
 * ======================================================================== */

describe('el disco local', () => {

  function conDiscoFalso(cuerpo) {
    const mapa = new Map();
    const antes = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
      ? globalThis.localStorage : undefined;
    globalThis.localStorage = {
      getItem(k) { return mapa.has(k) ? mapa.get(k) : null; },
      setItem(k, v) { mapa.set(k, String(v)); },
      removeItem(k) { mapa.delete(k); }
    };
    try { return cuerpo(mapa); }
    finally {
      if (antes === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = antes;
    }
  }

  test('nada de lo que escribe nube.js toca la cartera del Panel', () => {
    conDiscoFalso(mapa => {
      /* El nombre de la llave no se escribe a mano acá: se le pregunta al
         puente, que es quien manda sobre la base del Panel. */
      const LLAVE_PANEL = P.LLAVE_PANEL;
      assert.equal(LLAVE_PANEL, 'joan_socios_v1');

      const carteraDeJoan = JSON.stringify(dbDemo());
      mapa.set(LLAVE_PANEL, carteraDeJoan);

      N.guardarConfig({ url: 'https://abc.supabase.co/', anon: 'llave-anonima' });
      N.guardarCola([{ tabla: 'creditos', id: 'P1', datos: {} }]);
      N.encolarYGuardar({ tabla: 'socios', id: 'C1', datos: { nombre: 'Ana' } });
      N.guardarLocal({ espejo: N.espejoVacio(), db: dbDemo() });
      N.agregarChoques([{ tabla: 'creditos', id: 'P1', mio: {}, suyo: {} }]);

      assert.equal(mapa.get(LLAVE_PANEL), carteraDeJoan,
        'nube.js le escribió encima a la cartera de Joan');
      const escritas = [...mapa.keys()].filter(k => k !== LLAVE_PANEL).sort();
      assert.deepEqual(escritas,
        [N.LLAVE_CHOQUES, N.LLAVE_COLA, N.LLAVE_CONFIG, N.LLAVE_ESPEJO].sort(),
        'apareció una llave que nadie declaró');
    });
  });

  test('guardar la conexión no le borra la `clave` de la sincronización vieja', () => {
    conDiscoFalso(mapa => {
      /* Ese campo lo usa crm.html en cada rpc de invitaciones y registros. Si
         guardarConfig lo pisara, la parte vieja del Panel dejaría de funcionar
         el día que Joan escriba la URL en la pantalla nueva. */
      mapa.set(N.LLAVE_CONFIG, JSON.stringify({ url: 'https://viejo.supabase.co', anon: 'a1', clave: 'la-de-los-socios' }));
      const c = N.guardarConfig({ url: 'https://nuevo.supabase.co/', anon: 'a2' });
      assert.equal(c.clave, 'la-de-los-socios');
      assert.equal(c.url, 'https://nuevo.supabase.co', 'la barra final se cae: si no, la URL sale con // y el fetch falla');
      assert.equal(JSON.parse(mapa.get(N.LLAVE_CONFIG)).clave, 'la-de-los-socios');
    });
  });

  test('la cola sobrevive a cerrar la pestaña, y el contador la cuenta desde el disco', () => {
    conDiscoFalso(() => {
      N.encolarYGuardar({ tabla: 'creditos', id: 'P1', datos: { pagado: true }, revision_base: 3 });
      N.encolarYGuardar({ tabla: 'creditos', id: 'P1', datos: { pagado: true, nota: 'con abono' }, revision_base: 9 });
      N.encolarYGuardar({ tabla: 'socios', id: 'C1', datos: { nombre: 'Ana' }, revision_base: 1 });

      assert.equal(N.pendientes(), 2, 'el aviso dice cosas pendientes: dos filas, no tres toques');
      const cola = N.leerCola();
      assert.equal(cola[0].revision_base, 3, 'se conserva la revisión base del primer toque');
      assert.equal(cola[0].datos.nota, 'con abono', 'y el dato más nuevo');
    });
  });

  test('sin localStorage (o con el disco lleno) no revienta: devuelve lo vacío', () => {
    /* Safari en privado tira al leer la propiedad, y un disco lleno tira al
       escribir. En la calle eso no puede ser una pantalla en blanco. */
    assert.deepEqual(N.leerCola(), []);
    assert.equal(N.pendientes(), 0);
    assert.equal(N.sesion(), null);
    assert.equal(N.conectado(), false);
  });
});
