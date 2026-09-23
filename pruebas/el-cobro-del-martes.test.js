'use strict';
/* ==========================================================================
 * EL COBRO DEL MARTES
 * 23 de septiembre de 2026 — Fase B
 *
 * El defecto que hacía que el Panel en el bolsillo no sirviera para trabajar.
 * Estaba escrito en RECETA-NUBE-CRM.md como `[pierde_plata]`, y resultó estar
 * en un sitio más pequeño y más grave del que decía el documento.
 *
 * ---------------------------------------------------------------------------
 * LA SECUENCIA, QUE NO TIENE NADA DE RARA
 *
 *   t0  La cola tiene el crédito P1 marcado como pagado. `empujar` lo manda.
 *   t1  MIENTRAS LA PETICIÓN VIAJA —dos segundos en la calle, con mala señal—
 *       Joan registra un abono de 50.000 sobre ESE MISMO crédito.
 *       `encolar` no añade una segunda entrada: REEMPLAZA la que había
 *       (`salida[i] = c`), porque la cola guarda el ESTADO de la fila, no una
 *       lista de operaciones. Así que en la cola queda pagado + el abono.
 *   t2  Llega la respuesta confirmando lo de t0. `quitarDeCola` borraba de la
 *       cola todo lo que el servidor confirmara, POR LLAVE (tabla+id), sin
 *       mirar si lo que hay ahora es lo mismo que se mandó.
 *
 * El abono se va de la cola sin haber subido nunca. Y en la misma vuelta,
 * `bajar` se trae del servidor la fila SIN el abono y la escribe encima
 * (`aplicarPaquete` reemplaza la fila entera). Lo único que protegía el trabajo
 * sin subir era justamente volver a aplicar la cola encima — y el abono ya no
 * estaba en la cola.
 *
 * Resultado: 50.000 pesos desaparecen. Sin choque, sin aviso, y sin que nadie
 * pueda notarlo: la pantalla queda impecable y en cero pendientes.
 *
 * ---------------------------------------------------------------------------
 * EL ARREGLO, Y POR QUÉ NO ES EL QUE DECÍA LA RECETA
 *
 * La receta proponía filtrar el paquete que BAJA. Eso tapa el síntoma en un
 * sitio y deja la cola mintiendo: seguiría diciendo «0 esperando subir» sobre
 * un abono que no ha subido.
 *
 * La cura está en el origen: una entrada solo se saca de la cola si lo que hay
 * en ella es EXACTAMENTE lo que se mandó. Si cambió durante el viaje, se queda
 * — y se reapunta a la revisión que el servidor acaba de confirmar, porque con
 * la vieja chocaría en cada vuelta, para siempre. Ese segundo detalle no es un
 * adorno: es el mismo cuidado que ya está escrito en el espejo cuando se
 * resuelve un choque a mano.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../panel/nube.js');

const NUBE_JS = fs.readFileSync(path.join(__dirname, '..', 'panel', 'nube.js'), 'utf8');

/* La vuelta completa, tal como la hace subirCola: se arma el lote, se manda, y
   con la respuesta en la mano se quita de la cola lo confirmado. */
const vuelta = (cola, respuesta, lote) => N.quitarDeCola(cola, respuesta, lote);
const confirmar = (tabla, id, revision) =>
  ({ aplicados: 1, revisiones: [{ tabla, id, revision }], choques: [] });

describe('lo que se escribe mientras la petición viaja no se pierde', () => {

  test('EL CASO: un abono registrado durante el viaje sobrevive', () => {
    let cola = N.encolar([], { tabla: 'creditos', id: 'P1',
      datos: { id: 'P1', pagado: true }, revision_base: 4, que: 'cobro' });
    const lote = N.loteDeCola(cola);              // <- esto es lo que viaja

    /* Mientras viaja: */
    cola = N.encolar(cola, { tabla: 'creditos', id: 'P1',
      datos: { id: 'P1', pagado: true, abonos: [{ monto: 50000 }] }, que: 'abono' });

    cola = vuelta(cola, confirmar('creditos', 'P1', 5), lote);

    assert.equal(cola.length, 1,
      'el abono de 50.000 desapareció: no está en la cola, y la bajada de esta ' +
      'misma vuelta va a traer la fila sin él y escribirla encima');
    assert.deepEqual(cola[0].datos.abonos, [{ monto: 50000 }]);
  });

  test('y se reapunta a la revisión nueva, o chocaría para siempre', () => {
    /* Si se quedara con revision_base 4, el servidor —que ya va por la 5—
       contestaría choque en cada vuelta. El cobro no se perdería, pero Joan
       tendría un choque perpetuo que no puede resolver. */
    let cola = N.encolar([], { tabla: 'creditos', id: 'P1',
      datos: { id: 'P1', pagado: true }, revision_base: 4 });
    const lote = N.loteDeCola(cola);
    cola = N.encolar(cola, { tabla: 'creditos', id: 'P1',
      datos: { id: 'P1', pagado: true, abonos: [{ monto: 50000 }] } });
    cola = vuelta(cola, confirmar('creditos', 'P1', 5), lote);
    assert.equal(cola[0].revision_base, 5,
      'quedó apuntando a la revisión vieja: chocaría en cada vuelta, para siempre');
  });

  test('lo NO tocado durante el viaje sí se va de la cola', () => {
    /* El arreglo no puede convertirse en «la cola no se vacía nunca»: eso
       serían choques eternos y un contador que no baja. */
    let cola = N.encolar([], { tabla: 'creditos', id: 'P1',
      datos: { id: 'P1', pagado: true }, revision_base: 4 });
    const lote = N.loteDeCola(cola);
    cola = vuelta(cola, confirmar('creditos', 'P1', 5), lote);
    assert.equal(cola.length, 0, 'la cola no se vacía: el contador no bajaría nunca');
  });

  test('un cambio a OTRA fila durante el viaje tampoco se toca', () => {
    let cola = N.encolar([], { tabla: 'creditos', id: 'P1', datos: { id: 'P1', pagado: true }, revision_base: 4 });
    const lote = N.loteDeCola(cola);
    cola = N.encolar(cola, { tabla: 'socios', id: 'C9', datos: { id: 'C9', nombre: 'Ana' } });
    cola = vuelta(cola, confirmar('creditos', 'P1', 5), lote);
    assert.equal(cola.length, 1);
    assert.equal(cola[0].id, 'C9');
  });

  test('lo que CHOCÓ sigue quedándose adentro y marcado', () => {
    let cola = N.encolar([], { tabla: 'creditos', id: 'P1', datos: { id: 'P1', pagado: true }, revision_base: 4 });
    const lote = N.loteDeCola(cola);
    cola = N.quitarDeCola(cola,
      { aplicados: 0, revisiones: [], choques: [{ tabla: 'creditos', id: 'P1', actualizado_en: 'X' }] }, lote);
    assert.equal(cola.length, 1);
    assert.equal(cola[0].choque, true);
    assert.equal(cola[0].choque_en, 'X');
  });

  test('confirmar un borrado que entretanto dejó de serlo tampoco lo quita', () => {
    /* Mismo fallo con otra ropa: los datos podrían coincidir y la bandera no. */
    let cola = N.encolar([], { tabla: 'socios', id: 'C1', datos: { id: 'C1' }, borrado: true, revision_base: 2 });
    const lote = N.loteDeCola(cola);
    cola = N.encolar(cola, { tabla: 'socios', id: 'C1', datos: { id: 'C1' }, borrado: false });
    cola = vuelta(cola, confirmar('socios', 'C1', 3), lote);
    assert.equal(cola.length, 1, 'se perdió la resurrección: la fila queda borrada en la nube');
  });

  test('los ajustes se comparan por su clave, no por id', () => {
    let cola = N.encolar([], { tabla: 'ajustes', clave: 'gestiones', datos: [{ a: 1 }], revision_base: 7 });
    const lote = N.loteDeCola(cola);
    cola = N.encolar(cola, { tabla: 'ajustes', clave: 'gestiones', datos: [{ a: 1 }, { a: 2 }] });
    cola = vuelta(cola, { aplicados: 1, revisiones: [{ tabla: 'ajustes', id: 'gestiones', revision: 8 }], choques: [] }, lote);
    assert.equal(cola.length, 1, 'la gestión añadida durante el viaje se perdió');
    assert.equal(cola[0].datos.length, 2);
  });
});

describe('el ciclo de verdad usa el arreglo', () => {

  test('subirCola le pasa a quitarDeCola lo que acaba de mandar', () => {
    /* Sin este argumento la comparación no puede hacerse, y la función vuelve a
       su comportamiento de antes en silencio. Es la única línea de producción
       que sostiene todo lo de arriba. */
    assert.match(NUBE_JS, /quitarDeCola\(leerCola\(\), resp, pedazo\)/,
      'subirCola dejó de decirle a quitarDeCola qué mandó: el abono del viaje ' +
      'vuelve a perderse, y ninguna de las pruebas de arriba se entera');
  });

  test('y está dicho que sin el lote no se puede comparar', () => {
    /* Tolerante a los espacios y al asterisco del comentario: esta frase se
       parte donde el margen la corte, y un patrón rígido acusaría al código
       de algo que sí está escrito. Ya pasó con cuatro centinelas el 22-sep. */
    assert.match(NUBE_JS, /sin el lote no hay[\s*]+con qué comparar/,
      'no queda escrito por qué ese tercer argumento no es opcional de verdad');
  });
});
