/* ============================================================================
 * LA PUERTA ÚNICA EN LA BASE — base/20261007_una_puerta.sql, leída
 * 7 de octubre de 2026.
 *
 *   node --test pruebas/una-puerta-sql.test.js
 *
 * Una migración no corre acá: la pega Joan en Supabase. Estas pruebas leen el
 * archivo y sostienen las reglas que, si se rompen, no fallan en ninguna
 * pantalla —fallan en la privacidad de un cliente—:
 *
 *   1. NADA QUE LA LLAVE PÚBLICA PUEDA LLAMAR DEVUELVE DATOS DE NADIE sin la
 *      clave de Joan. Lo de Joan pide clave_ok en la primera línea; lo del
 *      celular de Joan, panel_es_dueno; lo del cliente, celular_de_sesion.
 *   2. LA PUERTA DEL CÓDIGO SE CIERRA con un revoke (no se reescribe ni se
 *      borra ninguna función).
 *   3. UN DESCONOCIDO CON EL NÚMERO DE UN CLIENTE NO VE NADA hasta que Joan
 *      junte: mi_cuenta no se toca (exige la marca), el hilo de una cuenta sin
 *      juntar es aparte ('0' + celular), y las solicitudes de antes de abrir
 *      la cuenta no se ven. Las reescrituras usan pg_get_functiondef, no
 *      cuerpos copiados.
 *   4. JUNTAR: el celular sale del registro en el servidor; un teléfono, una
 *      ficha; no se lleva la conversación de OTRA ficha que comparte número.
 *   5. DESHACER devuelve lo que escribió esa cuenta y deja el rastro.
 *   6. LA COMPROBACIÓN NO SE DESHACE A SÍ MISMA (nada de raise exception al
 *      final) y la consulta de verificación solo mira.
 *
 * El comportamiento de verdad se probó contra un PostgreSQL 17 con todas las
 * migraciones del repositorio: pruebas/una-puerta-postgres.test.js, que corre
 * cuando hay un PostgreSQL a mano (TG_PG_BIN).
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'base', '20261007_una_puerta.sql'), 'utf8');
const COMPROBAR = fs.readFileSync(path.join(RAIZ, 'base', '20261007b_una_puerta_comprobar.sql'), 'utf8');
/* Sin comentarios de línea: lo que se mide es lo que corre. */
const CODIGO = SQL.replace(/--[^\n]*/g, '');

/* Las funciones que crea el archivo, con su cuerpo. */
const FUNCIONES = (() => {
  const out = {};
  const re = /create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$;/g;
  let m;
  while ((m = re.exec(CODIGO))) {
    const cabeza = CODIGO.slice(m.index, CODIGO.indexOf('$$', m.index));
    out[m[1]] = { cabeza, cuerpo: m[3] };
  }
  return out;
})();
const grants = rol => [...CODIGO.matchAll(/grant execute on function public\.(\w+)\([^)]*\)\s+to\s+([a-z, ]+);/g)]
  .filter(m => m[2].split(',').map(x => x.trim()).includes(rol)).map(m => m[1]);
const revocadas = [...CODIGO.matchAll(/revoke all on function public\.(\w+)\([^)]*\)\s+from public, anon, authenticated;/g)].map(m => m[1]);
/* La primera instrucción del cuerpo (después de begin), para saber qué reja va primero. */
const primeraLinea = f => {
  const c = FUNCIONES[f].cuerpo;
  const i = c.indexOf('begin');
  return c.slice(i + 5).trim().split('\n')[0];
};

describe('lo que la llave pública puede llamar', () => {

  test('cada función nueva es security definer con su search_path, y tiene su revoke', () => {
    const nombres = Object.keys(FUNCIONES);
    assert.ok(nombres.length >= 14, 'no encontré las funciones: la prueba no mide nada (' + nombres.length + ')');
    nombres.forEach(f => {
      assert.match(FUNCIONES[f].cabeza, /security definer/, f + ' no es security definer');
      assert.match(FUNCIONES[f].cabeza, /set search_path = /, f + ' sin search_path fijo: una security definer así es escalable');
      assert.ok(revocadas.includes(f), f + ' no tiene revoke de public, anon y authenticated: Supabase se la regala a anon');
    });
  });

  test('lo que se le da a anon pide la clave de Joan en la PRIMERA línea', () => {
    const anon = grants('anon');
    assert.deepEqual(anon.sort(), ['clave_temporal_joan', 'cuentas_de_registros', 'desvincular_cuenta_joan',
      'vincular_cuenta_joan', 'vinculos_listar'].sort());
    anon.forEach(f => assert.match(primeraLinea(f), /^if not public\.clave_ok\(p_clave\) then$/,
      f + ' se le da a la llave pública y no empieza pidiendo la clave'));
    /* Volátiles: clave_ok escribe el freno, y PostgREST corre las stable en
       solo lectura (20260922e). */
    anon.forEach(f => assert.ok(!/\bstable\b/.test(FUNCIONES[f].cabeza), f + ' es stable y llama a clave_ok'));
  });

  test('lo que se le da a una sesión pregunta quién es antes que nada', () => {
    const auth = grants('authenticated');
    assert.deepEqual(auth.sort(), ['mi_registro', 'panel_cuentas_de_registros', 'panel_vincular_cuenta',
      'solicitar_por_sesion'].sort());
    ['panel_cuentas_de_registros', 'panel_vincular_cuenta'].forEach(f =>
      assert.match(primeraLinea(f), /^if not public\.panel_es_dueno\(\) then raise exception 'no autorizado'; end if;$/,
        f + ' no pregunta si la sesión es de Joan'));
    ['mi_registro', 'solicitar_por_sesion'].forEach(f =>
      assert.match(primeraLinea(f), /^cel := public\.celular_de_sesion\(\);$/, f + ' no saca de la sesión de quién es'));
    /* Ninguna recibe un celular o una cédula que diga de quién es la pregunta. */
    ['mi_registro', 'solicitar_por_sesion'].forEach(f =>
      assert.ok(!/p_cel|p_cedula|p_ident/.test(FUNCIONES[f].cabeza), f + ' recibe de quién es la pregunta'));
  });

  test('las internas no se le dan a nadie', () => {
    const dadas = grants('anon').concat(grants('authenticated'));
    ['vincular_interna', 'desvincular_interna', 'cuentas_de_registros_interna', 'clave_temporal_interna',
     'cuenta_de_celular', 'celular_es_de_una_ficha', 'solicitud_de_la_cuenta', 'cuenta_borrada_desvincula']
      .forEach(f => {
        assert.ok(FUNCIONES[f], 'no encontré ' + f);
        assert.ok(!dadas.includes(f), f + ' es interna y se le dio a alguien');
      });
  });

  test('public.vinculos: RLS sin políticas y cerrada a todos', () => {
    assert.match(CODIGO, /alter table public\.vinculos enable row level security;/);
    assert.match(CODIGO, /revoke all on public\.vinculos from public, anon, authenticated;/);
    assert.ok(!/create policy/i.test(CODIGO), 'una política abre la tabla de evidencia a alguien');
  });
});

describe('la puerta del código se cierra', () => {

  test('con un revoke por oid de las seis, sin reescribir ni borrar ninguna', () => {
    const i = CODIGO.indexOf('p.proname in (\'historial_socio_por_codigo\'');
    assert.ok(i > 0, 'no encontré el cierre');
    const bloque = CODIGO.slice(i, CODIGO.indexOf('loop', i));
    ['historial_socio_por_codigo', 'crear_solicitud_por_codigo', 'cambiar_codigo_acceso',
     'chat_leer', 'chat_escribir', 'vincular_cuenta'].forEach(f =>
      assert.ok(bloque.indexOf("'" + f + "'") >= 0, f + ' quedó abierta'));
    assert.match(CODIGO, /p\.oid::regprocedure as firma/);
    assert.match(CODIGO, /revoke all on function %s from public, anon, authenticated/);
    ['historial_socio_por_codigo', 'crear_solicitud_por_codigo', 'cambiar_codigo_acceso', 'chat_leer(',
     'chat_escribir(', 'vincular_cuenta('].forEach(f => {
      assert.ok(CODIGO.indexOf('create or replace function public.' + f) < 0, 'se reescribió ' + f);
      assert.ok(CODIGO.indexOf('drop function if exists public.' + f) < 0, 'se borró ' + f);
    });
  });
});

describe('un desconocido con el número de un cliente no ve nada', () => {

  test('mi_cuenta NO se toca: sigue exigiendo la marca de la unión (20260914b)', () => {
    assert.ok(CODIGO.indexOf('function public.mi_cuenta') < 0, 'esta migración reescribe mi_cuenta');
    assert.match(CODIGO, /mi_cuenta ya no exige la marca de la unión/, 'la comprobación no vigila mi_cuenta');
  });

  test('la cuenta sin juntar habla en un hilo aparte: la reescritura es de la función viva, no un cuerpo copiado', () => {
    assert.ok(CODIGO.indexOf('create or replace function public.llave_de_sesion') < 0,
      'llave_de_sesion se reescribió copiando el cuerpo: así se pierden cosas en silencio');
    /* Del archivo crudo y no de CODIGO: el reemplazo lleva adentro un comentario
       SQL (el «7-oct-2026» que queda en la función viva), y quitar comentarios
       se comería la línea entera. */
    const i = SQL.indexOf("p.proname = 'llave_de_sesion'");
    const bloque = SQL.slice(SQL.lastIndexOf('do $$', i), SQL.indexOf('end\n$$;', i));
    assert.match(bloque, /pg_get_functiondef\(p\.oid\)/);
    assert.match(bloque, /regexp_replace\(src,/);
    assert.match(bloque, /celular_es_de_una_ficha\(p_cel\) then ''0'' \|\| p_cel else p_cel end/);
    assert.match(bloque, /if src ~ 'celular_es_de_una_ficha' then/, 'correrlo dos veces lo aplicaría dos veces');
    assert.ok(!/raise exception/.test(bloque), 'si no encuentra la línea, tiene que decirlo sin deshacer todo el archivo');
    /* «Es de una ficha»: la llave O el teléfono, por los últimos 10. */
    const f = FUNCIONES.celular_es_de_una_ficha.cuerpo;
    assert.match(f, /f\.cedula = p_cel/);
    assert.match(f, /right\(coalesce\(f\.celular, ''\), 10\) = p_cel/);
  });

  test('las solicitudes de antes de abrir la cuenta no se ven ni se aceptan', () => {
    const i = CODIGO.indexOf("array['mi_solicitud', 'solicitar_primer_credito', 'aceptar_contrapropuesta']");
    assert.ok(i > 0, 'no se cierran las tres');
    const bloque = CODIGO.slice(i, CODIGO.indexOf('end\n$$;', i));
    assert.match(bloque, /pg_get_functiondef/);
    assert.equal((bloque.match(/public\.solicitud_de_la_cuenta\(cel, creada_en\)/g) || []).length, 3);
    const s = FUNCIONES.solicitud_de_la_cuenta.cuerpo;
    assert.match(s, /auth_vinculada_en is not null and s\.auth_celular = p_cel\) then true/);
    assert.match(s, /p_creada >= \(select u\.created_at from auth\.users u/);
  });
});

describe('juntar y deshacer', () => {

  const V = () => FUNCIONES.vincular_interna.cuerpo;

  test('el celular sale del registro, en el servidor; la pantalla no manda ninguno', () => {
    /* 7-oct-2026 (segunda vuelta): entra p_nombre (la nube lo compara con el de la fila). */
    assert.match(FUNCIONES.vincular_interna.cabeza, /\(\s*p_registro_id bigint, p_ficha text, p_por text, p_revision jsonb, p_nombre text\)/);
    assert.match(V(), /select \* into reg from public\.registros where id = p_registro_id;/);
    assert.match(V(), /cel := right\(public\.solo_digitos\(coalesce\(reg\.telefono, ''\)\), 10\);/);
    assert.match(V(), /'sin_cuenta'/, 'sin cuenta de ese celular no hay a quién juntar');
  });

  test('se niega ANTES de tocar nada: ficha con otra cuenta, teléfono con otra ficha, y la aprobación rara', () => {
    const v = V();
    const toca = v.indexOf('update public.mensajes');
    ['ficha_con_otra_cuenta', 'telefono_con_otra_ficha', 'pide_toque', 'sin_historial_en_la_nube'].forEach(m => {
      const i = v.indexOf("'" + m + "'");
      assert.ok(i > 0 && i < toca, m + ' se mira después de mover mensajes');
    });
    assert.match(v, /c_creada < reg\.creado_en - interval '1 hour'/);
    assert.match(v, /a\.celular = cel and a\.estado = 'nueva'/);
  });

  test('no se lleva la conversación de OTRA ficha que comparte el número', () => {
    assert.match(V(), /where cedula = '0' \|\| cel\s+or \(cedula = cel and cel <> ident\s+and not exists \(select 1 from public\.socios_historial o where o\.cedula = cel\)\)/);
  });

  test('deja la evidencia y el aviso en su chat', () => {
    assert.match(V(), /insert into public\.vinculos/);
    assert.match(V(), /'Listo, ya juntamos tu historial con tu cuenta\./);
    assert.match(V(), /'servicio', 'vinculo'/);
  });

  test('deshacer devuelve lo de esa cuenta, cierra sus sesiones y NO borra el rastro', () => {
    const d = FUNCIONES.desvincular_interna.cuerpo;
    /* 7-oct-2026 (segunda vuelta): al hilo que esa cuenta lee (llave_de_sesion). */
    assert.match(d, /set cedula = case when public\.celular_es_de_una_ficha\(cel\) then '0' \|\| cel else cel end/);
    /* La unión viva se busca por el CELULAR: si la ficha estrenó cédula, la
       llave con que se juntó ya no existe en la nube. */
    assert.match(d, /where celular = cel and deshecho_en is null/);
    assert.match(FUNCIONES.vinculos_listar.cuerpo, /f\.auth_celular = v\.celular/);
    assert.match(d, /de = 'socio' and creado_en >= desde/);
    assert.match(d, /id = any\(coalesce\(v\.mensajes_movidos/);
    assert.match(d, /set deshecho_en = now\(\)/);
    assert.ok(!/delete from public\.vinculos/.test(d), 'deshacer borra la evidencia');
    assert.match(d, /delete from auth\.sessions/);
  });

  test('una cuenta borrada suelta su unión, sin impedir nunca que se borre', () => {
    const t = FUNCIONES.cuenta_borrada_desvincula.cuerpo;
    assert.match(t, /\^57\(\[0-9\]\{10\}\)@tugarantia\\\.net\$/);
    assert.match(t, /exception when others then\s+return old;/);
    assert.match(CODIGO, /create trigger desvincular_al_borrar after delete on auth\.users/);
  });

  test('la clave nueva: bcrypt, cierra sesiones, y solo la de Joan', () => {
    const c = FUNCIONES.clave_temporal_interna.cuerpo;
    assert.match(c, /crypt\(clave, gen_salt\('bf'\)\)/);
    assert.match(c, /gen_random_bytes\(8\)/);
    assert.ok(!/random\(\)/.test(c), 'una contraseña con random() se adivina');
    assert.match(c, /delete from auth\.sessions/);
  });
});

describe('la comprobación', () => {

  test('lo que va después de la sección 13 nunca se deshace a sí mismo', () => {
    const i = CODIGO.indexOf('do $prueba$');
    assert.ok(i > 0);
    assert.ok(!/raise exception/.test(CODIGO.slice(i)), 'una comprobación con raise exception revierte la migración entera');
    /* La ficha de mentira se borra al final del mismo bloque. */
    assert.match(CODIGO.slice(i), /delete from public\.socios_historial where cedula = cel;/);
  });

  test('la consulta de verificación solo mira', () => {
    const c = COMPROBAR.replace(/--[^\n]*/g, '');
    assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b/i.test(c), 'la verificación cambia algo');
    assert.match(c, /^\s*with/i);
    for (let n = 1; n <= 11; n++) assert.match(c, new RegExp('select ' + n + '(\\s|,)'), 'falta el renglón ' + n);
  });
});
