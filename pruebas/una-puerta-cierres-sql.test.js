/* ============================================================================
 * LOS CIERRES DE LA PUERTA ÚNICA EN LA BASE, LEÍDOS — 7 de octubre de 2026
 * (segunda vuelta).
 *
 *   node --test pruebas/una-puerta-cierres-sql.test.js
 *
 * Las migraciones no corren acá (las pega Joan): esto lee los archivos y
 * sostiene las reglas que encontró la revisión de seguridad. El
 * comportamiento de verdad, contra un PostgreSQL 17, está en
 * pruebas/una-puerta-cierres-postgres.test.js (TG_PG_BIN).
 *
 * Lo que se cuida:
 *   1. Juntar se niega en LAS TRES PUERTAS cuando la cuenta es más vieja que
 *      el registro o hay un recado abierto, salvo clave nueva al número de la
 *      ficha de hace una hora; y compara el nombre de la ficha con el de la
 *      fila. Las firmas viejas se sueltan.
 *   2. La clave nueva no toca al equipo ni a Joan, y queda anotada.
 *   3. Deshacer devuelve el chat al hilo que esa cuenta lee.
 *   4. 20261007c: los patrones con que reescribe funciones vivas CASAN con el
 *      cuerpo de esas funciones en el repositorio (si no casaran, la
 *      migración diría FALTA y no cerraría nada); el disparador y los
 *      ayudantes son de adentro; nada de `raise exception` después de la
 *      sección 0.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8');
const sinComentarios = t => t.replace(/--[^\n]*/g, '');
const PUERTA = sinComentarios(leer('20261007_una_puerta.sql'));
const CIERRES_CRUDO = leer('20261007c_una_puerta_cierres.sql');
const CIERRES = sinComentarios(CIERRES_CRUDO);

/* El cuerpo de la ÚLTIMA definición de una función en una migración. */
function cuerpoEn(texto, nombre) {
  const re = new RegExp('create or replace function public\\.' + nombre + '\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$;', 'g');
  let m, ultimo = null;
  while ((m = re.exec(texto))) ultimo = m;
  return ultimo ? { cabeza: ultimo[1], cuerpo: ultimo[2] } : null;
}

describe('juntar, en la puerta', () => {
  const V = cuerpoEn(PUERTA, 'vincular_interna');

  test('la firma lleva el nombre, y las viejas se sueltan', () => {
    assert.match(V.cabeza, /p_revision jsonb, p_nombre text\)/);
    assert.match(PUERTA, /drop function if exists public\.vincular_interna\(bigint, text, text, jsonb\);/);
    assert.match(PUERTA, /drop function if exists public\.vincular_cuenta_joan\(text, bigint, text, text, jsonb\);/);
    assert.match(PUERTA, /drop function if exists public\.panel_vincular_cuenta\(bigint, text, jsonb\);/);
    assert.match(PUERTA, /drop function if exists public\.clave_temporal_joan\(text, text\);/);
  });

  test('sin nombre, o con el de otra fila, no junta; y lo mira ANTES de tocar nada', () => {
    const c = V.cuerpo, toca = c.indexOf('update public.mensajes');
    ['falta_nombre', 'otra_fila'].forEach(m => {
      const i = c.indexOf("'" + m + "'");
      assert.ok(i > 0 && i < toca, m + ' no se mira antes de mover mensajes');
    });
    assert.match(c, /not public\.mismo_nombre\(ficha\.nombre, p_nombre\)/);
  });

  test('las señales valen en LAS TRES puertas, no solo en la aprobación', () => {
    const c = V.cuerpo;
    assert.ok(!/if p_por = 'aprobacion' then\s+if c_creada/.test(c), 'las señales siguen mirándose solo al aprobar');
    assert.match(c, /if c_creada < reg\.creado_en - interval '1 hour' then/);
    assert.match(c, /'necesita_clave_nueva'/);
  });

  test('pasa solo con clave nueva a ESTA ficha, posterior al registro y al recado, y de hace una hora', () => {
    const c = V.cuerpo;
    assert.match(c, /from public\.claves_nuevas k\s+where k\.celular = cel and k\.ficha = ident\s+and k\.creado_en > reg\.creado_en\s+and k\.creado_en > coalesce\(recado/);
    assert.match(c, /if rot > now\(\) - interval '1 hour' then/);
    assert.match(c, /'clave_reciente'/);
  });

  test('claves_nuevas: con RLS y cerrada', () => {
    assert.match(PUERTA, /create table if not exists public\.claves_nuevas/);
    assert.match(PUERTA, /alter table public\.claves_nuevas enable row level security;/);
    assert.match(PUERTA, /revoke all on public\.claves_nuevas from public, anon, authenticated;/);
  });
});

describe('la clave nueva y deshacer, en la puerta', () => {

  test('la clave nueva no toca al equipo ni a Joan, y se anota con su ficha', () => {
    const c = cuerpoEn(PUERTA, 'clave_temporal_interna');
    assert.match(c.cabeza, /p_celular text, p_ficha text\)/);
    const equipo = c.cuerpo.indexOf("'equipo'"), cambia = c.cuerpo.indexOf('update auth.users');
    assert.ok(equipo > 0 && equipo < cambia, 'mira el equipo DESPUÉS de cambiar la contraseña');
    assert.match(c.cuerpo, /from public\.panel_duenos d where d\.uid = c_uid/);
    assert.match(c.cuerpo, /public\.equipo/);
    assert.match(c.cuerpo, /insert into public\.claves_nuevas \(celular, ficha\)/);
  });

  test('deshacer devuelve el chat al hilo que esa cuenta lee (la misma regla de llave_de_sesion)', () => {
    const d = cuerpoEn(PUERTA, 'desvincular_interna').cuerpo;
    assert.match(d, /set cedula = case when public\.celular_es_de_una_ficha\(cel\) then '0' \|\| cel else cel end/);
    assert.ok(!/set cedula = '0' \|\| cel\s/.test(d));
  });

  test('las cuentas del registro dicen la clave nueva que ya se dio', () => {
    const c = cuerpoEn(PUERTA, 'cuentas_de_registros_interna').cuerpo;
    assert.match(c, /'clave_nueva_en'/);
    assert.match(c, /'clave_nueva_ficha'/);
    assert.match(c, /'registro_creado_en'/);
  });
});

describe('20261007c: los cierres de funciones vivas', () => {

  test('después de la sección 0 no hay raise exception (el editor deshace todo)', () => {
    const despues = CIERRES.slice(CIERRES.indexOf('alter table public.socios_historial alter column codigo_propio'));
    assert.ok(!/raise exception/.test(despues));
    assert.match(CIERRES, /alter table public\.socios_historial alter column codigo_propio drop not null;/);
  });

  test('el disparador de solicitudes: antes de insertar, de adentro, falla cerrado', () => {
    const f = cuerpoEn(CIERRES, 'solicitud_de_sesion_guarda');
    assert.ok(f, 'falta solicitud_de_sesion_guarda');
    assert.match(CIERRES, /create trigger solicitud_de_sesion\s+before insert on public\.solicitudes/);
    assert.match(CIERRES_CRUDO, /create or replace function public\.solicitud_de_sesion_guarda\(\)\s+returns trigger\s+language plpgsql\s+security definer\s+set search_path = public, auth/);
    assert.match(f.cuerpo, /r_en < c_en - interval '1 hour'/);
    assert.match(f.cuerpo, /new\.datos := '\{\}'::jsonb;\s+new\.registro_id := null;/);
    assert.match(f.cuerpo, /new\.cuenta_sin_juntar := true/);
    assert.match(CIERRES, /revoke all on function public\.solicitud_de_sesion_guarda\(\)\s+from public, anon, authenticated;/);
  });

  /* El mismo patrón que usa la migración, aplicado al cuerpo de cada función
     tal como está en el repositorio (su última definición). Si una de estas
     no casara, en la base de verdad la migración diría FALTA. */
  test('el patrón que quita datos y registro_id casa con las 7 funciones del cliente', () => {
    const crudo = /'solicitud',\s*to_jsonb\(s\)(\s*-\s*'responsable')?\s*[,)]/;
    const donde = {
      solicitar_primer_credito: '20260908_primer_credito.sql', aceptar_contrapropuesta: '20260908_primer_credito.sql',
      mi_solicitud: '20261005_platachat_solicitud.sql', solicitar_platachat: '20261005_platachat_solicitud.sql',
      mi_solicitud_platachat: '20261005_platachat_solicitud.sql', aceptar_propuesta_platachat: '20261005_platachat_solicitud.sql',
      reproponer_platachat: '20261005_platachat_solicitud.sql'
    };
    Object.keys(donde).forEach(f => {
      assert.ok(CIERRES.indexOf("'" + f + "'") > 0, f + ' no está en la lista');
      const c = cuerpoEn(leer(donde[f]), f);
      assert.ok(c && crudo.test(c.cuerpo), f + ': el patrón no casa con su cuerpo');
      const parchado = c.cuerpo.replace(/('solicitud',\s*to_jsonb\(s\)(\s*-\s*'responsable')?)(\s*[,)])/g, "$1 - 'datos' - 'registro_id'$3");
      assert.ok(!crudo.test(parchado), f + ': después del parche todavía devuelve la fila entera');
    });
  });

  test('los dos anclajes de sincronizar_socios casan con su cuerpo vivo (20260914b)', () => {
    const s = cuerpoEn(leer('20260914b_tres_canales.sql'), 'sincronizar_socios').cuerpo;
    assert.match(s, /update\s+public\.mensajes\s+set\s+cedula\s*=\s*ident\s+where\s+cedula\s*=\s*cel\s*;/);
    assert.match(s, /into\s+h_viejo\s*,\s*propio\s*,\s*v_en\s*,\s*v_cel\s+from\s+public\.socios_historial\s+where\s+cedula\s*=\s*cel\s*;/);
    assert.match(CIERRES, /if v_en is not null and not public\.fila_vieja_es_de\(cel, item->>''nombre''\) then/);
  });

  test('la comprobación 20261007d solo mira, y tiene sus 10 renglones', () => {
    const d = leer('20261007d_cierres_comprobar.sql');
    assert.ok(!/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i.test(sinComentarios(d)), 'la comprobación cambia algo');
    assert.equal((d.match(/^select \d+/gm) || []).length, 10);
  });

  test('la puerta avisa en su cabecera: la app publicada antes, la receta de play/ antes, y los cierres justo después', () => {
    const cabecera = leer('20261007_una_puerta.sql').slice(0, 4000);
    assert.match(cabecera, /tugarantia\.net\/app\/socio\.html/);
    assert.match(cabecera, /RECETA-UNA-PUERTA-PLAY\.md\) va publicada ANTES de esto/);
    assert.match(cabecera, /20261007c_una_puerta_cierres\.sql/);
  });
});
