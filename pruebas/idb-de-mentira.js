'use strict';
/* ===========================================================================
 * UN INDEXEDDB DE MENTIRA, LO JUSTO — 28 de octubre de 2026
 *
 * Lo que usa app/historia-laboral.js (el guardadero de la historia laboral):
 * open, una tienda 'lotes' con get/put/delete, el cursor para barrer, y las
 * transacciones que avisan al terminar. Todo contesta en otra vuelta del
 * reloj (setImmediate), como el de verdad: quien pone sus oyentes después de
 * pedir, los oye.
 *
 * Por qué hace falta: el barrido de lo vencido (arreglo de los leves, P7) se
 * hace con un cursor sobre IndexedDB, y Node no tiene IndexedDB. Sin esto, la
 * prueba solo vería la memoria de la página, que en un teléfono de verdad
 * nace vacía en cada arranque: probaría otra cosa.
 *
 * `datos` es un Map a la vista: la prueba siembra lo que había en el teléfono
 * y mira lo que quedó. Los valores se copian (como el clon estructurado), así
 * que nadie los cambia por la espalda.
 *
 * 28-oct-2026 (arreglador final) — `opciones.fallaPut(llave, valor)`: si
 * devuelve true, esa escritura no queda y la transacción aborta, como un
 * QuotaExceededError en un teléfono casi sin espacio. Hace falta para la
 * ronda 3 (G1): el PDF cabía, el pantallazo no, y la línea de «Lo hago
 * después» contaba los dos mientras subía uno. `opciones.fallaDelete(llave)`,
 * lo mismo con un borrado.
 * ======================================================================== */
function idbDeMentira(inicial, opciones) {
  const o = opciones || {};
  const datos = new Map(Object.entries(inicial || {}).map(([k, v]) => [k, copia(v)]));
  const luego = f => setImmediate(f);
  function copia(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  const db = {
    createObjectStore() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      let pendientes = 0, aborta = false;
      const termina = () => {
        if (--pendientes === 0) luego(() => { if (aborta) { if (tx.onabort) tx.onabort(); } else if (tx.oncomplete) tx.oncomplete(); });
      };
      const pedido = hacer => {
        pendientes++;
        const r = { result: undefined, onsuccess: null, onerror: null };
        luego(() => { r.result = hacer(); if (r.onsuccess) r.onsuccess(); termina(); });
        return r;
      };
      tx.objectStore = () => ({
        get: k => pedido(() => copia(datos.get(k))),
        put: (v, k) => {
          if (o.fallaPut && o.fallaPut(k, v)) { aborta = true; return pedido(() => undefined); }
          return pedido(() => { datos.set(k, copia(v)); });
        },
        delete: k => {
          if (o.fallaDelete && o.fallaDelete(k)) { aborta = true; return pedido(() => undefined); }
          return pedido(() => { datos.delete(k); });
        },
        openCursor: () => {
          pendientes++;
          const r = { result: null, onsuccess: null };
          const llaves = [...datos.keys()];
          let i = 0;
          const paso = () => luego(() => {
            while (i < llaves.length && !datos.has(llaves[i])) i++;
            if (i >= llaves.length) { r.result = null; if (r.onsuccess) r.onsuccess(); termina(); return; }
            const k = llaves[i++];
            r.result = { key: k, value: copia(datos.get(k)), delete: () => { datos.delete(k); }, continue: paso };
            if (r.onsuccess) r.onsuccess();
          });
          paso();
          return r;
        }
      });
      return tx;
    }
  };
  return {
    datos,
    open() {
      const r = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      luego(() => { r.result = db; if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
      return r;
    }
  };
}

module.exports = { idbDeMentira };
