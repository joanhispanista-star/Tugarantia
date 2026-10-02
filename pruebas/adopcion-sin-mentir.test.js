/* ===========================================================================
 * LA ADOPCIÓN NO PUEDE MENTIR — el invariante de espejoDeAdopcion, con 200 filas
 * 1 de octubre de 2026. Etapa 0, pasos 2 y 3, y su centinela, de RECETA-NUBE-CRM.md.
 *
 * espejoDeAdopcion decide qué filas de la cartera puede el espejo dar por
 * «iguales a la nube» sin haberlas subido. Si adopta una fila donde la nube dice
 * algo que la cartera contradice, la subida siguiente sale contra la revisión
 * BUENA y el servidor la acepta sin choque: lo que dijo la nube se pierde.
 *
 * pruebas/siembra-espejo.test.js (15-sep) ya prueba los casos a mano. Esto
 * agrega lo que allá no estaba:
 *   · un GENERADOR: 200 filas de las tres tablas, con números, textos,
 *     booleanos, nulos, listas y objetos anidados, fotos y los campos que
 *     cargar() agrega al abrir; la mitad con UN campo mutado del lado del
 *     servidor. Toda mutada tiene que salir congelada, toda intacta adoptada, y
 *     toda entrada del espejo devuelto tiene que ser cierta;
 *   · el NULO. Hasta hoy esSuperconjunto trataba un `null` del servidor como
 *     «eso no lo dice», y adoptaba. Pero null en un jsonb SÍ es un dato: «la
 *     nube dice que acá no hay nada» contra «la cartera dice 15-sep» es una
 *     contradicción, y la receta lo escribió así (primitivos por jsonCanonico).
 *     El generador lo encontró al primer intento.
 *
 * El azar va con semilla fija: una prueba que cambia sola no se puede repetir,
 * y el mensaje de cada fallo dice fila, campo y mutación para reproducirlo.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../panel/nube.js');

/* mulberry32: diez líneas, sin dependencias, la misma secuencia en todo node. */
function azar(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clon = v => JSON.parse(JSON.stringify(v));

/* Una fila CRUDA, como la sube subir.html desde el disco. Tiene de todo lo que
   tienen las de Joan: texto, plata en número, booleanos, nulos que significan
   «nada», listas que suman y un objeto anidado. */
function filaCruda(tabla, i, r) {
  const id = tabla[0] + i;
  if (tabla === 'socios') {
    return { id, numero: i + 1, nombre: 'Socio ' + i, cedula: String(1000000 + i),
      telefono: '300' + String(i).padStart(7, '0'), ingresoQuincenal: Math.round(r() * 2e6),
      whatsappIgual: r() < 0.5, codigoEnviadoEn: r() < 0.5 ? null : '2026-09-0' + (1 + (i % 9)),
      referencia: { nombre: 'Ref ' + i, telefono: '301' + i },
      gestiones: [{ fecha: '2026-09-10', canal: 'whatsapp', plantilla: 'recordatorio' }] };
  }
  if (tabla === 'creditos') {
    const capital = 100000 * (1 + (i % 9));
    return { id, socioId: 's' + (i % 100), numero: i + 1, capital, total: capital * 1.2,
      costoPct: 20, pagado: r() < 0.3, fechaPagado: null, cicloActual: '2026-10-15',
      abonos: [{ fecha: '2026-09-20', monto: 30000 }],
      comprobantes: [{ fecha: '2026-09-20', tipo: 'abono', monto: 30000 }],
      prorrogas: [], condonaciones: [], abonosCapital: [] };
  }
  return { id, numero: i + 1, capital: 50000 * (1 + (i % 5)), pagado: false, fechaPagado: null,
    plazo: 4, cuotas: [{ n: 1, monto: 25000, pagado: r() < 0.5 }, { n: 2, monto: 25000, pagado: false }] };
}

/* Lo que tiene la cartera de este computador: la misma fila, MÁS las fotos y
   los campos que cargar() de crm.html agrega al abrir (panel/crm.html:1209-1226).
   Es un superconjunto honesto: no contradice nada de lo de arriba. */
function filaLocal(tabla, cruda) {
  const l = clon(cruda);
  if (tabla === 'socios') {
    l.cedulaFrenteFoto = 'data:image/jpeg;base64,AAAA' + l.id;
    l.selfieFoto = 'data:image/jpeg;base64,BBBB' + l.id;
    l.cedulaReversoFoto = null;
    if (l.telefono2 === undefined) l.telefono2 = '';
    if (l.notaRiesgo === undefined) l.notaRiesgo = '';
    if (l.ajusteGarantia === undefined) l.ajusteGarantia = 0;
    if (l.migracionRevisada === undefined) l.migracionRevisada = null;
  } else if (tabla === 'creditos') {
    l.comprobantes = l.comprobantes.map(c => Object.assign({}, c, { foto: 'data:image/png;base64,CC' }));
  }
  return l;
}

/* Las mutaciones: cada una hace que la NUBE diga algo que la cartera
   contradice. `aplica` dice si tiene sentido sobre ese campo. */
const MUTACIONES = [
  { nombre: 'otro texto', aplica: v => typeof v === 'string', hacer: v => v + '-OTRO' },
  { nombre: 'otro número', aplica: v => typeof v === 'number', hacer: v => v + 1 },
  { nombre: 'número como texto', aplica: v => typeof v === 'number', hacer: v => String(v) },
  { nombre: 'booleano al revés', aplica: v => typeof v === 'boolean', hacer: v => !v },
  { nombre: 'a NULL', aplica: v => v !== null, hacer: () => null },
  { nombre: 'de null a valor', aplica: v => v === null, hacer: () => '2026-09-30' },
  { nombre: 'un elemento de más', aplica: v => Array.isArray(v),
    hacer: v => v.concat([{ fecha: '2026-09-29', monto: 1234 }]) },
  { nombre: 'un elemento de menos', aplica: v => Array.isArray(v) && v.length > 0, hacer: v => v.slice(1) },
  { nombre: 'adentro del objeto', aplica: v => v && typeof v === 'object' && !Array.isArray(v),
    hacer: v => Object.assign({}, v, { nombre: 'OTRA' }) }
];

/* Muta UN campo de la fila de la nube, elegido al azar entre los que admiten
   alguna mutación. Si sale «llave nueva», la nube trae un campo con valor que la
   cartera no tiene — también es decir algo que acá no se dice. */
function mutar(datos, r) {
  if (r() < 0.1) {
    const d = clon(datos); d.campoQueSoloTieneLaNube = 'algo'; return { datos: d, como: 'llave nueva' };
  }
  const campos = Object.keys(datos).filter(k => k !== 'id' && MUTACIONES.some(m => m.aplica(datos[k])));
  const campo = campos[Math.floor(r() * campos.length)];
  const posibles = MUTACIONES.filter(m => m.aplica(datos[campo]));
  const m = posibles[Math.floor(r() * posibles.length)];
  const d = clon(datos);
  d[campo] = m.hacer(d[campo]);
  return { datos: d, como: campo + ' → ' + m.nombre };
}

const enLaNube = (id, datos, revision, extra) => Object.assign(
  { id, datos, revision, borrado: false, actualizado_en: '2026-10-01T10:00:00Z',
    actualizado_por: 'computador' }, extra || {});

/* La cartera de 200 filas y lo que hay en la nube para ella. */
function generar(semilla) {
  const r = azar(semilla);
  const db = { socios: [], prestamos: [], respaldados: [] };
  const paquete = { completo: true, socios: [], creditos: [], respaldados: [], ajustes: [] };
  const mutadas = {};
  const reparto = [['socios', 'socios', 100], ['creditos', 'prestamos', 70], ['respaldados', 'respaldados', 30]];
  reparto.forEach(([tabla, campo, n]) => {
    for (let i = 0; i < n; i++) {
      const cruda = filaCruda(tabla, i, r);
      db[campo].push(filaLocal(tabla, cruda));
      let datos = N.sinFotos(cruda);
      if (r() < 0.5) {
        const m = mutar(datos, r);
        datos = m.datos;
        mutadas[tabla + '|' + cruda.id] = m.como;
      }
      paquete[tabla].push(enLaNube(cruda.id, datos, 1 + Math.floor(r() * 9)));
    }
  });
  return { db, paquete, mutadas };
}

const localPorId = (db, tabla) => {
  const m = {};
  db[N.CAMPO_DB[tabla]].forEach(f => { m[f.id] = f; });
  return m;
};

describe('espejoDeAdopcion: el invariante, con un generador de 200 filas (1-oct-2026)', () => {

  /* Tres semillas, cada una 200 filas: 600 filas y ~300 mutaciones distintas. */
  [20261001, 7, 424242].forEach(semilla => {
    test('semilla ' + semilla + ': toda fila mutada se congela, toda intacta se adopta, y el espejo no miente', () => {
      const g = generar(semilla);
      const r = N.espejoDeAdopcion(g.db, g.paquete, null);
      assert.equal(r.adoptadas.length + r.congelar.length, 200, 'alguna fila no cayó en ningún montón');
      assert.equal(r.soloAlla.length, 0);
      assert.equal(r.soloAca.length, 0);

      const congeladas = {};
      r.congelar.forEach(c => { congeladas[c.tabla + '|' + c.id] = c.motivo; });
      Object.keys(g.mutadas).forEach(k => {
        assert.equal(congeladas[k], 'difieren',
          'semilla ' + semilla + ', fila ' + k + ': la nube cambió «' + g.mutadas[k] +
          '» y la fila se ADOPTÓ. La subida siguiente la pisaría con la revisión buena.');
      });
      r.adoptadas.forEach(a => {
        assert.ok(!g.mutadas[a.tabla + '|' + a.id], 'semilla ' + semilla + ': adoptó ' + a.id);
      });
      assert.equal(r.congelar.length, Object.keys(g.mutadas).length,
        'se congelaron filas que NO difieren: eso es un choque inventado, y los inventados enseñan a ignorar los de verdad');

      /* EL INVARIANTE, entrada por entrada: todo lo que el espejo afirma es
         cierto para la cartera — idéntico o superconjunto. */
      N.TABLAS.forEach(t => {
        const locales = localPorId(g.db, t);
        Object.keys(r.espejo[t]).forEach(id => {
          const local = locales[id];
          assert.ok(local, 'el espejo afirma ' + t + '|' + id + ' y la cartera no la tiene');
          const servidor = JSON.parse(r.espejo[t][id].json);
          assert.ok(N.esSuperconjunto(N.sinFotos(local), servidor),
            'semilla ' + semilla + ': el espejo afirma de ' + t + '|' + id + ' algo que la cartera contradice');
        });
      });
    });
  });

  test('y el primer lote sale contra la revisión del servidor, NUNCA con revision_base null', () => {
    /* Es el caso que la receta pide clavar antes que ninguno, ahora sobre 200
       filas: lo adoptado sube contra la revisión buena (o no sube, si es
       idéntico). Ni una adoptada puede salir como «fila nueva». */
    const g = generar(20261001);
    const r = N.espejoDeAdopcion(g.db, g.paquete, null);
    const lote = N.armarLote(g.db, r.espejo, { marcarBorrados: false });
    const revisiones = {};
    N.TABLAS.forEach(t => g.paquete[t].forEach(f => { revisiones[t + '|' + f.id] = f.revision; }));
    const adoptadas = new Set(r.adoptadas.map(a => a.tabla + '|' + a.id));
    let suben = 0;
    N.TABLAS.forEach(t => lote[t].forEach(f => {
      if (!adoptadas.has(t + '|' + f.id)) return;   // las congeladas son asunto de la Etapa 1
      suben++;
      assert.equal(f.revision_base, revisiones[t + '|' + f.id],
        t + '|' + f.id + ' sale con revision_base ' + f.revision_base + ': el servidor la contestaría CHOQUE');
      assert.equal(f.borrado, false);
    }));
    /* Los socios llevan los campos de cargar(), así que TODOS los adoptados
       suben (con la revisión buena); los créditos y respaldados sin fotos son
       idénticos y no viajan. Que suba algo prueba que la prueba miró algo. */
    assert.ok(suben > 0, 'no subió ninguna adoptada: la prueba no midió nada');
  });
});

describe('esSuperconjunto: un null de la nube SÍ es un dato (1-oct-2026)', () => {

  test('la nube dice null y acá hay un valor: NO es superconjunto', () => {
    /* Era true hasta hoy. «Nada» contra «15-sep» se contradicen. */
    assert.equal(N.esSuperconjunto({ fechaPagado: '2026-09-15' }, { fechaPagado: null }), false);
    assert.equal(N.esSuperconjunto({ perfil: 'bronce' }, { perfil: null }), false);
  });

  test('la nube dice null y acá no está el campo: SÍ (null y ausente son el mismo dato)', () => {
    /* jsonCanonico escribe los dos como «null», y cargar() rellena el ausente
       con null. Es el caso de las fotos: acá la selfie existe, sinFotos la
       quita, y la nube dice selfieFoto:null. No se contradicen. */
    assert.equal(N.esSuperconjunto({ a: 1 }, { a: 1, selfieFoto: null }), true);
    assert.equal(N.esSuperconjunto({ a: 1, b: null }, { a: 1, b: null }), true);
  });

  test('una fila entera en null del lado de la nube no es superconjunto de nada', () => {
    assert.equal(N.esSuperconjunto({ a: 1 }, null), false);
    assert.equal(N.esSuperconjunto(null, null), true);
  });

  test('un objeto vacío allá no exige nada, pero un null acá no es un objeto', () => {
    assert.equal(N.esSuperconjunto({ ref: { a: 1 } }, { ref: {} }), true);
    assert.equal(N.esSuperconjunto({ ref: null }, { ref: {} }), false);
  });
});

describe('espejoDeAdopcion: el orden de las reglas y el espejo previo (1-oct-2026)', () => {

  test('(a) va antes que (d): borrada allá y SUPERCONJUNTO acá, igual se congela', () => {
    /* Borrado primero, json después. Si (d) mirara antes, una ficha que acá
       tiene los campos de cargar() se adoptaría borrada y la subida siguiente
       la resucitaría en la nube sin choque. */
    const db = { socios: [{ id: 's1', nombre: 'Pedro', notaRiesgo: '' }], prestamos: [], respaldados: [] };
    const p = { socios: [enLaNube('s1', { id: 's1', nombre: 'Pedro' }, 4, { borrado: true })],
                creditos: [], respaldados: [], ajustes: [] };
    const r = N.espejoDeAdopcion(db, p, null);
    assert.deepEqual(r.congelar, [{ tabla: 'socios', id: 's1', motivo: 'borrada-en-la-nube' }]);
    assert.equal(r.adoptadas.length, 0);
  });

  test('(f) quita del espejo PREVIO una fila que la cartera ya no tiene', () => {
    /* «No entra al espejo» tiene que ser cierto también cuando el espejo
       anterior la traía: si se quedara, armarLote con marcarBorrados (que es lo
       que usa subir.html) la mandaría BORRADA contra la revisión buena. */
    const previo = N.espejoVacio();
    previo.socios.sY = { revision: 3, json: N.jsonCanonico({ id: 'sY', nombre: 'Viejo' }) };
    const r = N.espejoDeAdopcion({ socios: [], prestamos: [], respaldados: [] },
      { socios: [enLaNube('sY', { id: 'sY', nombre: 'Viejo' }, 3)], creditos: [], respaldados: [], ajustes: [] },
      previo);
    assert.equal(r.soloAlla.length, 1);
    assert.equal(r.espejo.socios.sY, undefined,
      'el espejo sigue afirmando una fila que la cartera no tiene');
    const lote = N.armarLote({ socios: [], prestamos: [], respaldados: [] }, r.espejo);
    assert.equal(lote.socios.length, 0, 'de un espejo que miente salió un borrado');
    assert.ok(previo.socios.sY, 'tocó el espejo que le pasaron: tiene que ser pura');
  });

  test('una fila congelada CONSERVA su entrada vieja del espejo previo', () => {
    /* Es lo único que la hace volver a chocar en vez de pisar (receta, Etapa 2,
       «espejo con una fila congelada + paquete completo»). */
    const previo = N.espejoVacio();
    previo.creditos.c1 = { revision: 2, json: N.jsonCanonico({ id: 'c1', capital: 100 }) };
    const r = N.espejoDeAdopcion(
      { socios: [], prestamos: [{ id: 'c1', capital: 100, pagado: true }], respaldados: [] },
      { socios: [], creditos: [enLaNube('c1', { id: 'c1', capital: 100, pagado: false }, 5)],
        respaldados: [], ajustes: [] },
      previo);
    assert.equal(r.congelar.length, 1);
    assert.equal(r.espejo.creditos.c1.revision, 2, 'la entrada vieja de la congelada se perdió');
  });
});
