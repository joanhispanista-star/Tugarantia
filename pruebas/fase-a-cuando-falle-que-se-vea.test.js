'use strict';
/* ==========================================================================
 * FASE A — CUANDO FALLE, QUE SE VEA
 * 23 de septiembre de 2026
 *
 * Esta fase NO arregla la sincronización. Arregla algo anterior y más barato:
 * que los fallos que ya existían dejaran de ser invisibles.
 *
 * Los cuatro, y el hilo que los une:
 *
 *   1. La COLA se guardaba sin comprobar. `encolarYGuardar` tiraba a la basura
 *      el `false` de `guardarCola`. Si el navegador decía «no cupo», el cobro
 *      que Joan acababa de registrar en la calle se quedaba en la memoria de la
 *      pestaña, la pantalla seguía diciendo «1 esperando subir», y al cerrar la
 *      app desaparecía. El espejo grande SÍ lo comprobaba (`_sinEspacio`); la
 *      cola no — y es la que más duele, porque el espejo se vuelve a bajar de la
 *      nube y la cola no: nunca llegó al servidor.
 *
 *   2. NADIE LE PEDÍA A iOS QUE NO BORRARA. Safari borra todo el
 *      almacenamiento de un sitio tras SIETE DÍAS sin visitarlo. El CRM de
 *      escritorio pedía `persist()` desde hacía tiempo y el espejo no: la
 *      defensa estaba en el Windows, donde nadie borra, y faltaba en el único
 *      aparato donde iOS sí borra.
 *
 *   3. Y LA PANTALLA PROMETÍA QUE NO SE PERDÍA. «no se pierde por cerrar la
 *      app» — cerrar la app no lo pierde, cierto; no volver en una semana, sí.
 *      Ahora lo que promete depende de lo que el navegador haya CONTESTADO a
 *      `persist()`, que es la única forma de no mentir sin saberlo.
 *
 *   4. La cola mostraba solo la hora, así que un cobro del viernes pasado se
 *      veía igual que uno de hace diez minutos.
 *
 * Y el quinto, que no es del espejo: el recuadro del chat medía 15px y
 * `app/chat.css` le ganaba por especificidad a la regla de 16 del espejo. Por
 * debajo de 16, Safari hace zoom al enfocar. Era el único sitio de la pantalla
 * donde pasaba, y justo donde Joan le escribe a un cliente.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const ESPEJO = leer('panel/espejo.html');

const funcion = (src, nombre) => {
  const i = src.indexOf('function ' + nombre);
  assert.ok(i > 0, 'no existe ' + nombre);
  return src.slice(i, src.indexOf('\n}', i));
};

/* El almacén de mentira de la casa (ver pruebas/nube.test.js): nube.js lee
   `localStorage` del global, así que se le pone uno y se quita al salir. */
function conAlmacen(impl, fn) {
  const tenia = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const antes = tenia ? globalThis.localStorage : undefined;
  globalThis.localStorage = impl;
  try { return fn(); }
  finally {
    if (!tenia) delete globalThis.localStorage;
    else globalThis.localStorage = antes;
  }
}

const almacenBueno = () => {
  const caja = {};
  return { getItem: k => (k in caja ? caja[k] : null),
           setItem: (k, v) => { caja[k] = String(v); },
           removeItem: k => { delete caja[k]; } };
};

const almacenLleno = () => ({
  getItem: () => null,
  setItem: () => { const e = new Error('cuota'); e.name = 'QuotaExceededError'; throw e; },
  removeItem: () => {},
});

describe('1 · la cola dice si de verdad se guardó', () => {

  test('con disco sano: guardada true y la cola de vuelta', () => {
    conAlmacen(almacenBueno(), () => {
      delete require.cache[require.resolve('../panel/nube.js')];
      const N = require('../panel/nube.js');
      const r = N.encolarYGuardar({ tabla: 'creditos', id: 'P1', datos: { pagado: true }, que: 'cobro' });
      assert.equal(r.guardada, true);
      assert.ok(Array.isArray(r.cola), 'dejó de devolver la cola');
      assert.equal(r.cola.length, 1);
    });
  });

  test('CON EL DISCO LLENO: guardada false, y ese es todo el arreglo', () => {
    /* Antes esto devolvía la cola tan tranquila y el cobro se perdía al cerrar.
       Que `cola` siga viniendo es a propósito: en memoria el cambio SÍ está, y
       la pantalla tiene que poder seguir pintando mientras avisa. */
    conAlmacen(almacenLleno(), () => {
      delete require.cache[require.resolve('../panel/nube.js')];
      const N = require('../panel/nube.js');
      const r = N.encolarYGuardar({ tabla: 'creditos', id: 'P1', datos: { pagado: true }, que: 'cobro' });
      assert.equal(r.guardada, false,
        'la cola volvió a tragarse el «no cupo»: un cobro de la calle se pierde al cerrar la app');
      assert.ok(Array.isArray(r.cola), 'con el disco lleno hay que seguir pintando');
    });
  });

  test('y no revienta: devolver false no es tirar una excepción', () => {
    conAlmacen(almacenLleno(), () => {
      delete require.cache[require.resolve('../panel/nube.js')];
      const N = require('../panel/nube.js');
      assert.doesNotThrow(() => N.encolarYGuardar({ tabla: 'socios', id: 'C1', datos: {} }));
    });
  });
});

describe('1b · y la pantalla lo recoge', () => {

  test('los dos llamadores leen el resultado y encienden el aviso', () => {
    /* Son dos: el de encolar normal y el de resolver un choque. Arreglar uno
       solo deja la mitad del agujero, que es exactamente lo que pasó con el
       reparto de 300. */
    const n = (ESPEJO.match(/if \(!r\.guardada\) _sinEspacio = true;|if \(!rc\.guardada\) _sinEspacio = true;/g) || []).length;
    assert.equal(n, 2, 'uno de los dos llamadores volvió a ignorar si se guardó');
  });

  test('se reutiliza la bandera del espejo grande, no se inventa otra', () => {
    /* Mismo fallo y misma consecuencia: dos avisos distintos para «no cupo» se
       leen como dos problemas. */
    assert.match(ESPEJO, /if \(_sinEspacio\) \{/);
    assert.match(ESPEJO, /no sobrevive a cerrar la app/);
  });
});

describe('2 · se le pide a iOS que no borre', () => {

  test('el espejo pide persist(), que era lo que faltaba', () => {
    assert.match(ESPEJO, /navigator\.storage\.persist\(\)/,
      'el espejo volvió a no pedirlo: es el único aparato donde iOS sí borra');
  });

  test('y GUARDA la respuesta, porque de ella depende lo que promete', () => {
    assert.match(ESPEJO, /var _almacenFirme = null;/,
      'sin guardar la respuesta, la pantalla no puede saber si puede prometer');
    assert.match(ESPEJO, /_almacenFirme = !!dado/);
  });

  test('null significa «no lo sé», y no se confunde con «no»', () => {
    /* El `=== true` de abrirCola es lo que mantiene esa diferencia viva: si
       fuera un `if (_almacenFirme)`, «no lo sé» prometería de más. */
    assert.match(funcion(ESPEJO, 'abrirCola'), /_almacenFirme === true/,
      'se perdió la diferencia entre «no lo sé» y «sí»: no saberlo pasa a prometer');
  });

  test('el CRM de escritorio lo sigue pidiendo también', () => {
    assert.match(leer('panel/crm.html'), /navigator\.storage\.persist\(\)/);
  });
});

describe('3 · la pantalla no promete lo que iOS puede desmentir', () => {

  test('desapareció la promesa en seco', () => {
    assert.equal(/sigue ahí hasta que suba: no se pierde por cerrar la app/.test(ESPEJO), false,
      'volvió la frase que en un iPhone es falsa a los siete días');
  });

  test('y en su lugar se avisa de la semana', () => {
    const f = funcion(ESPEJO, 'abrirCola');
    assert.match(f, /una semana sin abrir esto, el teléfono puede borrarlo/,
      'la pantalla dejó de avisar del borrado a los siete días');
    assert.match(f, /esto no está en ningún otro sitio todavía/,
      'no se dice lo que lo hace grave: que la cola no se recupera de la nube');
  });

  test('cuando el navegador SÍ se compromete, se dice', () => {
    assert.match(funcion(ESPEJO, 'abrirCola'), /El navegador se comprometió a no borrarlo/,
      'se perdió la rama buena: prometer de menos también es no informar');
  });
});

describe('4 · la cola dice qué día, no solo qué hora', () => {

  test('usa fmtFechaHora', () => {
    assert.match(funcion(ESPEJO, 'abrirCola'), /fmtFechaHora\(it\.cuando\)/,
      'volvió la hora sola: un cobro del viernes se ve igual que uno de hace diez minutos');
  });

  test('y esa función existía ya, no se duplicó ninguna cuenta', () => {
    assert.match(ESPEJO, /function fmtFechaHora/);
    assert.match(funcion(ESPEJO, 'fmtFechaHora'), /'hoy'|'ayer'/);
  });
});

describe('5 · el recuadro del chat ya no hace zoom en iOS', () => {

  test('16px exactos en app/chat.css', () => {
    /* 15px era el valor, y el selector .ch-escribir textarea (0-1-1) le ganaba
       por especificidad al selector de elemento del espejo (0-0-1). */
    const CSS = leer('app/chat.css');
    assert.equal(/font:inherit; font-size:15px/.test(CSS), false,
      'volvieron los 15px: Safari hace zoom justo donde Joan le escribe a un cliente');
    assert.match(CSS, /font:inherit; font-size:16px/);
  });

  test('y el espejo mantiene sus 16 en lo que se teclea', () => {
    assert.match(ESPEJO, /border-radius:14px;font-size:16px/);
  });
});

describe('6 · los papeles dejan de decir que la nube no existe', () => {
  /* Tres sitios afirmaban que el SQL del Panel no se había corrido nunca. Es
     falso desde hace tiempo y nadie lo tachó. Casi hace empezar de cero una
     función que ya estaba viva — documentación desactualizada es un bug, y este
     costaba días. */

  test('la pantalla que lo dice en la cara (subir.html)', () => {
    const S = leer('panel/subir.html');
    assert.equal(/Esto nunca se ha corrido contra datos de verdad/.test(S), false,
      'subir.html vuelve a decirle a Joan que la nube no existe');
    assert.match(S, /Las funciones de la nube ya existen en tu Supabase/);
    /* Pero sin pasarse al otro lado: lo que sigue sin probarse, se sigue diciendo. */
    assert.match(S, /nunca ha movido una cartera de verdad/,
      'se corrigió de más: esta página sigue sin haber movido datos reales');
  });

  test('la receta, si está', () => {
    /* `RECETA-*.md` está en .gitignore a propósito: son notas internas que no
       viajan al repo publico. Asi que en el computador de Joan esto se
       comprueba, y en un clon limpio no hay nada que comprobar. Exigirlo a
       secas seria una prueba que falla por un archivo que nadie borro. */
    const p = path.join(RAIZ, 'RECETA-PANEL-NUBE.md');
    if (!fs.existsSync(p)) return;   // clon limpio: no aplica
    assert.match(fs.readFileSync(p, 'utf8'), /CORREGIDO EL 23-SEP-2026/);
  });

  test('y la propia migración', () => {
    const SQL = leer('base/20260811_panel_nube.sql');
    assert.match(SQL, /CORREGIDO EL 23-SEP-2026: este archivo SÍ está aplicado/);
    assert.match(SQL, /Se toca SOLO este comentario/,
      'hay que dejar dicho que no se tocó una línea ejecutable de algo ya aplicado');
  });
});
