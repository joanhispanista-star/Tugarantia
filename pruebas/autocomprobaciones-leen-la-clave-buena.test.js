'use strict';
/* ==========================================================================
 * LAS AUTOCOMPROBACIONES LEEN LA CLAVE BUENA
 * 26 de septiembre de 2026
 *
 * `config_privada` es una tabla NOMBRE -> VALOR: la clave de sincronización es
 * el `valor` de la fila cuyo nombre (`clave`) es 'clave_sync'.
 *
 * La primera versión de base/20260923_foto_al_chat_del_cliente.sql hacía
 *
 *     select clave into v_clave from public.config_privada limit 1;
 *
 * o sea: leía el NOMBRE de una fila cualquiera y se lo pasaba a la función como
 * si fuera la clave. Al aplicarla contestó «clave incorrecta» en el paso 2.
 *
 * No se rompió nada, y conviene saber por qué: el editor de Supabase corre el
 * archivo en UNA transacción, así que el error se llevó por delante también la
 * función recién creada. Pero la lección es otra: los nombres se parecen tanto
 * —una tabla de claves con una columna llamada `clave`— que el error se escribe
 * solo, y cualquier migración nueva con autocomprobación lo puede repetir.
 *
 * Y una cosa que se midió de paso: `clave_ok` tiene un freno de intentos en una
 * SECUENCIA, y las secuencias no se revierten con la transacción. Cada intento
 * fallido cuenta aunque la migración se deshaga. Solo se acumulan los fallos
 * —una clave buena pone el contador en cero—, pero una autocomprobación que
 * falla la clave varias veces seguidas le puede cerrar el Panel a Joan quince
 * minutos. Otra razón para no fallarla.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = path.join(__dirname, '..', 'base');

/* Solo lo que se ejecuta: el comentario que explica el error cita la línea mala
   con las mismas palabras, y un centinela que lee la prosa se caza a sí mismo. */
const codigo = f => fs.readFileSync(path.join(BASE, f), 'utf8')
  .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

/* Las migraciones de esta época en adelante, que son las que llevan
   autocomprobaciones que llaman con la clave. */
const recientes = fs.readdirSync(BASE)
  .filter(f => /^2026092[2-9].*\.sql$|^202610.*\.sql$/.test(f))
  .filter(f => !/platachat/.test(f));   // de otra sesión: su dueña las vigila

describe('ninguna autocomprobación lee el NOMBRE en vez del VALOR', () => {

  test('hay migraciones que mirar', () => {
    assert.ok(recientes.length >= 5, 'el filtro dejó de encontrar migraciones: ' + recientes.length);
  });

  for (const f of recientes) {
    test(f, () => {
      const c = codigo(f);
      assert.equal(/select\s+clave\s+into\s+\w+\s+from\s+public\.config_privada/i.test(c), false,
        f + ' lee la columna `clave` (el NOMBRE) de config_privada como si fuera la clave: ' +
        'hay que leer `valor` where clave = \'clave_sync\'');
    });
  }

  test('y la de la foto lee la buena', () => {
    const c = codigo('20260923_foto_al_chat_del_cliente.sql');
    assert.match(c, /select cp\.valor into v_clave from public\.config_privada cp where cp\.clave = 'clave_sync'/);
  });
});
