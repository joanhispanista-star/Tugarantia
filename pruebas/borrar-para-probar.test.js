'use strict';
/* ==========================================================================
 * BORRAR UNA CUENTA PARA VOLVER A PROBAR — 22 de septiembre de 2026
 *
 * Joan: «como estoy haciendo pruebas con el mismo numero quiero poder eliminar
 * usuarios asi el mismo usuario se puede registrar varias veces sin que le
 * aparezca que este numero ya esta registrado».
 *
 * LO QUE VIGILA ESTE ARCHIVO es una sola cosa, y no es que el borrado
 * funcione: es QUE NO SE LLEVE LO QUE NO DEBE.
 *
 * El celular es la identidad del negocio, así que «borrar al usuario» toca
 * media base: la cuenta de acceso, las fotos, la ficha de la bandeja, las
 * solicitudes y el chat. Al lado de todo eso está socios_historial, que es la
 * CARTERA de Joan — sus clientes de verdad, con su historial de créditos. Un
 * delete de más ahí, escrito con la mejor intención por querer «dejarlo todo
 * limpio», le borra un cliente por repetir una prueba.
 *
 * Por eso la migración lleva un centinela adentro que revienta si alguien le
 * mete ese delete, y por eso está esta prueba: para que el centinela no se
 * pueda quitar sin que algo grite.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SQL = leer('base/20260922e_borrar_para_probar.sql');
const CRM = leer('panel/crm.html');
/* Sin comentarios: lo que se vigila es lo que se EJECUTA. */
const SQL_VIVO = SQL.split('\n').map(l => l.replace(/^\s*--.*$/, '')).join('\n');

/* SOLO EL CUERPO DE LA FUNCIÓN, y hace falta: más abajo en el mismo archivo hay
   un centinela que busca la cadena «delete from public.socios_historial» para
   impedirla, y una prueba que mirara el archivo entero se cazaría a sí misma —
   diría que el borrado toca la cartera precisamente porque la protege. */
const CUERPO = (() => {
  const i = SQL_VIVO.indexOf('create or replace function public.borrar_cuenta_de_pruebas');
  assert.ok(i >= 0, 'no encontré la función en la migración');
  const j = SQL_VIVO.indexOf('\n$$;', i);
  assert.ok(j > i, 'no encontré dónde termina la función');
  return SQL_VIVO.slice(i, j);
})();

describe('lo que el borrado NO puede llevarse', () => {

  test('la cartera de Joan no se borra: solo se desvincula', () => {
    assert.equal(/delete\s+from\s+public\.socios_historial/i.test(CUERPO), false,
      'el borrado se lleva socios_historial. Ahí viven los clientes de verdad de ' +
      'Joan con su historial: borrar esa fila por repetir una prueba es perder un cliente');
    assert.match(CUERPO, /update public\.socios_historial[\s\S]{0,120}auth_vinculada_en = null/,
      'no se desvincula la ficha, así que el mismo celular no podría volver a pegar su código');
  });

  test('y hay un centinela DENTRO de la migración que lo impide', () => {
    /* Sin esto, el día que alguien «limpie» el borrado, nada grita. */
    assert.match(SQL, /borra socios_historial: eso es la cartera de Joan/,
      'se quitó el centinela que protege la cartera');
  });

  test('borra lo que sí tiene que borrar, y nada más', () => {
    const debe = ['registro_archivos', 'registros', 'solicitudes', 'mensajes',
                  'ayudas_clave', 'auth.users'];
    debe.forEach(t => assert.ok(
      new RegExp('delete\\s+from\\s+(public\\.)?' + t.replace('.', '\\.')).test(CUERPO),
      'no borra ' + t + ', así que quedaría basura colgando de una llave que ya no existe'));

    /* Y ninguna tabla de más. */
    const borra = [...CUERPO.matchAll(/delete\s+from\s+(?:public\.)?(\w+(?:\.\w+)?)/g)]
      .map(m => m[1].replace('public.', ''));
    const demas = borra.filter(t => debe.indexOf(t) < 0 && debe.indexOf('public.' + t) < 0);
    assert.deepEqual([...new Set(demas)], [],
      'el borrado toca tablas que nadie pidió: ' + [...new Set(demas)].join(', '));
  });

  test('la cuenta de acceso va en su propio bloque protegido', () => {
    /* Es lo último y lo más frágil: si el esquema de auth cambiara, lo demás ya
       está hecho y hay que poder decirlo en vez de fallar entero y en silencio. */
    const i = SQL_VIVO.indexOf('delete from auth.users');
    const antes = SQL_VIVO.slice(Math.max(0, i - 400), i);
    assert.match(antes, /begin/, 'el borrado de la cuenta no está protegido');
    assert.match(SQL_VIVO.slice(i, i + 700), /exception when others then/,
      'si falla el borrado de la cuenta, se cae todo sin decir qué sí se borró');
    assert.match(SQL, /con la cuenta viva el registro seguira diciendo que el numero ya existe/,
      'no se avisa de la consecuencia exacta si la cuenta no se pudo borrar');
  });
});

describe('quién puede llamarla', () => {

  test('la pide con la clave de Joan', () => {
    assert.match(SQL_VIVO, /if not public\.clave_ok\(p_clave\)/,
      'se puede borrar cuentas sin la clave');
  });

  test('el CRM sí, un cliente con sesión NO', () => {
    assert.match(SQL_VIVO, /grant\s+execute on function public\.borrar_cuenta_de_pruebas\(text, text\)\s+to anon/);
    assert.match(SQL, /quedo llamable con una sesion de cliente: un cliente podria borrar cuentas/,
      'no se comprueba que un cliente autenticado no pueda borrar cuentas');
    /* revoke explícito de los dos roles: en Supabase «from public» no quita
       nada, porque el EXECUTE a anon y authenticated es explícito. */
    assert.match(SQL_VIVO, /revoke all on function public\.borrar_cuenta_de_pruebas\(text, text\) from public, anon, authenticated/);
  });

  test('volátil, porque clave_ok escribe', () => {
    assert.match(SQL, /no quedo volatil/,
      'no se comprueba la volatilidad. Marcada stable, PostgREST la corre en solo ' +
      'lectura y revienta con 25006 antes de mirar la clave: es lo que dejó las ' +
      'fotos invisibles del 8 al 10 de septiembre');
  });
});

describe('el botón del CRM dice la verdad antes de borrar', () => {

  test('está en la fila del registrado, no escondido en un modal', () => {
    assert.match(CRM, /onclick="borrarParaProbar\(/,
      'no hay botón para borrar y repetir');
    assert.match(CRM, /function borrarParaProbar\(celular, nombre\)/);
  });

  test('la confirmación enumera lo que se va, y dice qué se queda', () => {
    const i = CRM.indexOf('function borrarParaProbar');
    const t = CRM.slice(i, i + 2600);
    ['cuenta de acceso', 'fotos', 'solicitudes'].forEach(x =>
      assert.ok(t.indexOf(x) >= 0, 'la confirmación no menciona: ' + x));
    assert.match(t, /NO se borra su ficha de cliente/,
      'no se dice que la cartera se queda, que es lo que más puede asustar');
    assert.match(t, /sin deshacer|no se puede deshacer|para siempre/i,
      'no se advierte de que no se puede deshacer');
  });

  test('el resultado lo dice el SERVIDOR, no la pantalla', () => {
    const i = CRM.indexOf('function borrarParaProbar');
    const t = CRM.slice(i, i + 2600);
    ['j.fotos', 'j.registros', 'j.solicitudes', 'j.mensajes'].forEach(x =>
      assert.ok(t.indexOf(x) >= 0,
        'el aviso final no usa ' + x + ': un «listo» no se puede comprobar'));
  });

  test('si falta la migración, dice cuál', () => {
    const i = CRM.indexOf('function borrarParaProbar');
    const t = CRM.slice(i, i + 2600);
    assert.match(t, /20260922e_borrar_para_probar\.sql/,
      'ante un 404 no dice qué archivo correr, y manda a buscar donde no está');
  });
});
