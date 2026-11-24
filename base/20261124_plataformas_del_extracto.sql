-- ===========================================================================
-- QUÉ PLATAFORMAS USA — 24 de noviembre de 2026
-- ===========================================================================
-- PARA JOAN. Se corre DESPUÉS de base/20261113c_los_extractos.sql (si esa no
-- está, este archivo se para solo y no toca nada). Se copia ENTERO en el SQL
-- Editor de Supabase, «Run», y al final Settings → API → «Reload schema». Se
-- puede correr dos veces. Lo último que muestra es una tabla: todas las filas
-- tienen que salir en true.
--
-- QUÉ PEDISTE (24-nov): «que el cliente pueda indicar que plataformas usa como
-- nequi, daviplata, nubank, lulo bank u otros… para poder dar con un analisis
-- de riesgo mucho mas acertado… todo esto opcional».
--
-- QUÉ HACE:
--   · una columna más en la autorización de los extractos, `plataformas`: un
--     texto corto con las que la persona marcó, de una LISTA CERRADA (nequi,
--     daviplata, nubank, lulo, bancolombia, otra). No hay texto libre: lo que
--     no está en la lista no se guarda, lo mande quien lo mande.
--   · va PEGADA a la autorización aparte de los extractos: sin esa autorización
--     vigente no se guarda nada, y al retirarla se borra (un disparador). Si
--     se borra la cuenta, o tú borras sus extractos, se va con la fila.
--   · la persona las dice y las lee con SU sesión; tú las ves con tu clave.
--     El equipo no las ve: ninguna función del equipo lee esa tabla.
--
-- QUÉ NO HACE: no reescribe ninguna función que ya exista (tampoco las de
-- 20261113c), no califica a nadie y no cambia la garantía. Es un dato que la
-- persona dice: no se confirma con ningún banco.
--
-- POR QUÉ UN ARCHIVO APARTE y no dentro de 20261113c: aquel se escribió y se
-- revisó el 13-nov; este es lo nuevo del 24. Si este no se corre, los extractos
-- funcionan igual y las casillas de «¿Cuáles usas?» no aparecen (el teléfono
-- pregunta primero si la base las puede guardar).
--
-- SIN FRENO, como extracto_quitar y extracto_mia: cada llamada escribe un
-- texto de a lo más 44 letras en LA fila de quien llama. No hay nada que
-- tantear ni nada que llenar.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
-- Como todo lo que va después de 20261022d (la regla de
-- pruebas/el-lote-del-27-junto.test.js): si esa no está, se para aquí. Este
-- archivo no la usa, pero correrlo antes por error diría que el orden no importa.
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql y lo que va después. Este archivo va al final. No se tocó nada.';
  end if;
  if to_regclass('public.extracto_autorizaciones') is null
     or to_regprocedure('public.extracto_autorizar(text, text)') is null
     or to_regprocedure('public.extracto_retirar()') is null then
    raise exception 'Primero corre base/20261113c_los_extractos.sql. Este archivo va después. No se tocó nada.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.clave_ok(text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null then
    raise exception 'Falta lo de base/supabase.sql (celular_de_sesion, clave_ok, solo_digitos). No se tocó nada.';
  end if;
end $$;

-- ====== 1. LA COLUMNA ======
-- En la fila de la autorización, no en una tabla nueva: así nace con el
-- permiso, muere con él, y todo lo que ya borra esa fila (extracto_borrar, el
-- disparador de la cuenta borrada) se la lleva sin que haya que acordarse.
alter table public.extracto_autorizaciones
  add column if not exists plataformas text not null default '';

-- Solo letras minúsculas separadas por comas: aunque alguien escribiera en la
-- tabla sin pasar por la función, aquí no cabe un nombre, un número ni una
-- frase.
alter table public.extracto_autorizaciones
  drop constraint if exists extracto_plataformas_de_la_lista;
alter table public.extracto_autorizaciones
  add constraint extracto_plataformas_de_la_lista
  check (plataformas ~ '^([a-z]+(,[a-z]+)*)?$' and length(plataformas) <= 60);

-- ====== 2. LA LISTA, EN UN SOLO SITIO ======
-- De lo que llegue a lo que se guarda: los nombres de la lista, en el orden de
-- la lista, sin repetir. La misma lista vive en app/extractos.js (PLATAFORMAS)
-- y en panel/extractos-crm.js; pruebas/los-extractos.test.js compara las tres.
-- En SQL y no en PL/pgSQL: así la base revisa el cuerpo AL CREARLA, no en la
-- primera llamada (la lección de 20260908b).
create or replace function public.extracto_plataformas_limpia(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(l.id, ',' order by l.n), '')
    from unnest(array['nequi', 'daviplata', 'nubank', 'lulo', 'bancolombia', 'otra'])
         with ordinality as l(id, n)
   where l.id = any (string_to_array(
           regexp_replace(lower(left(coalesce(p_texto, ''), 200)), '[^a-z,]', '', 'g'), ','));
$$;

-- ====== 3. LO DEL CLIENTE, CON SU SESIÓN ======

-- 3a. Decir cuáles usa. Manda la lista ENTERA cada vez (vacía = ninguna): la
-- última que llega es la que queda. Sin autorización vigente no guarda nada.
create or replace function public.extracto_plataformas(p_plataformas text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel  text;
  v    text;
  n    integer;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  v := public.extracto_plataformas_limpia(p_plataformas);
  update public.extracto_autorizaciones a
     set plataformas = v
   where a.celular = cel and a.revocada_en is null;
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_autorizacion');
  end if;
  return jsonb_build_object('ok', true, 'plataformas', v);
end
$$;

-- 3b. Leer las suyas (para pintar las casillas como las dejó). Sin
-- autorización vigente, vacío.
create or replace function public.extracto_plataformas_mias()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel  text;
  v    text;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  select a.plataformas into v
    from public.extracto_autorizaciones a
   where a.celular = cel and a.revocada_en is null;
  return jsonb_build_object('ok', true, 'plataformas', coalesce(v, ''));
end
$$;

-- ====== 4. AL RETIRAR LA AUTORIZACIÓN, SE BORRAN ======
-- extracto_retirar (20261113c) marca `revocada_en` y deja la fila como
-- constancia. Lo que la persona marcó no es constancia de nada: se va. Con un
-- disparador y no reescribiendo extracto_retirar, para no tocar una función
-- ya revisada; y así vale por cualquier camino que ponga esa fecha. Volver a
-- firmar después no las revive: ya no están.
create or replace function public.extracto_plataformas_al_retirar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.revocada_en is not null then
    new.plataformas := '';
  end if;
  return new;
end
$$;

drop trigger if exists extracto_plataformas_al_retirar on public.extracto_autorizaciones;
create trigger extracto_plataformas_al_retirar
  before update on public.extracto_autorizaciones
  for each row execute function public.extracto_plataformas_al_retirar();

-- ====== 5. LO DE JOAN, CON SU CLAVE ======
-- 5a. Lo de adentro: lo que contesta la de la clave. Aparte, y en SQL, por dos
-- razones: la base revisa el cuerpo al crearla, y la prueba de abajo la puede
-- LLAMAR (la de la clave no: llamarla con una clave falsa le suma un fallo al
-- freno de tu clave, que es una secuencia y no se deshace). No se le da a
-- nadie: solo la llama la de 5b, que corre como dueña de la base.
--   · con celular: las de esa persona;
--   · sin celular: todas las personas que marcaron alguna, para pintar la
--     lista de 📥 Registrados de un solo viaje.
create or replace function public.extracto_plataformas_interna(p_celular text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_celular, '')), '') is not null then
      jsonb_build_object(
        'ok', true,
        'celular', right(public.solo_digitos(p_celular), 10),
        'plataformas', coalesce((select a.plataformas
                                   from public.extracto_autorizaciones a
                                  where a.celular = right(public.solo_digitos(p_celular), 10)
                                    and a.revocada_en is null), ''))
    else
      jsonb_build_object(
        'ok', true,
        'personas', coalesce((select jsonb_agg(jsonb_build_object('celular', a.celular, 'plataformas', a.plataformas)
                                               order by a.celular)
                                from public.extracto_autorizaciones a
                               where a.revocada_en is null and a.plataformas <> ''), '[]'::jsonb))
  end;
$$;

-- 5b. La que llama el CRM. VOLÁTIL a propósito, como todas las de la clave:
-- clave_ok escribe el freno.
create or replace function public.extracto_plataformas_de(p_clave text, p_celular text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return public.extracto_plataformas_interna(p_celular);
end
$$;

-- ====== 6. LOS PERMISOS ======
-- PostgreSQL le da EXECUTE a todo el mundo por defecto, y Supabase se lo regala
-- además a anon y a authenticated: primero se quita todo, después se da lo justo.
revoke all on function public.extracto_plataformas_limpia(text)       from public, anon, authenticated;
revoke all on function public.extracto_plataformas(text)              from public, anon, authenticated;
revoke all on function public.extracto_plataformas_mias()             from public, anon, authenticated;
revoke all on function public.extracto_plataformas_al_retirar()       from public, anon, authenticated;
revoke all on function public.extracto_plataformas_interna(text)      from public, anon, authenticated;
revoke all on function public.extracto_plataformas_de(text, text)     from public, anon, authenticated;

grant execute on function public.extracto_plataformas(text)           to authenticated;
grant execute on function public.extracto_plataformas_mias()          to authenticated;
grant execute on function public.extracto_plataformas_de(text, text)  to anon;

notify pgrst, 'reload schema';

-- ====== 7. LA PRUEBA LLAMANDO, en la base de verdad ======
-- Con un celular de mentira y sin crear ninguna cuenta: las funciones del
-- cliente solo miran el correo de la sesión. Todo lo que se escribe se borra
-- al final, también el freno que deja extracto_autorizar. Si algo falla, el
-- archivo entero se deshace y lo dice. La tabla de la prueba es temporal y sin
-- «on commit drop» (si el editor corriera cada sentencia por separado, se
-- borraría antes de usarla).
drop table if exists pg_temp.plataformas_prueba;
create temporary table plataformas_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_cel  text := '3009991124';
  j      jsonb;
begin
  if exists (select 1 from public.extracto_autorizaciones a where a.celular = v_cel) then
    raise notice 'El celular de prueba % ya tiene algo: la prueba llamando no corre.', v_cel;
    insert into plataformas_prueba values ('llamando', null) on conflict do nothing;
    return;
  end if;
  -- Sin sesión: nada.
  perform set_config('request.jwt.claims', '', true);
  j := public.extracto_plataformas('nequi');
  insert into plataformas_prueba values ('sin_sesion', coalesce(j ->> 'motivo', '') = 'sin_sesion');
  -- Con sesión y sin la autorización de los extractos: nada.
  perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
  j := public.extracto_plataformas('nequi');
  insert into plataformas_prueba values ('sin_autorizacion', coalesce(j ->> 'motivo', '') = 'sin_autorizacion');
  -- Con la autorización: SOLO lo de la lista, en su orden, sin repetir. Lo
  -- demás (otra palabra, una etiqueta de página) no se guarda.
  j := public.extracto_autorizar('2026-11-24', null);
  j := public.extracto_plataformas(' LULO, Nequi,otra,nequi,bitcoin,<script>alert(1)</script>');
  insert into plataformas_prueba values ('solo_la_lista',
    coalesce((j ->> 'ok')::boolean, false) and coalesce(j ->> 'plataformas', '') = 'nequi,lulo,otra');
  j := public.extracto_plataformas_mias();
  insert into plataformas_prueba values ('las_mias',
    coalesce((j ->> 'ok')::boolean, false) and coalesce(j ->> 'plataformas', '') = 'nequi,lulo,otra');
  -- Lo que ve Joan (lo de adentro de la función de la clave).
  j := public.extracto_plataformas_interna('+57 ' || v_cel);
  insert into plataformas_prueba values ('la_de_joan',
    coalesce(j ->> 'celular', '') = v_cel and coalesce(j ->> 'plataformas', '') = 'nequi,lulo,otra');
  j := public.extracto_plataformas_interna(null);
  insert into plataformas_prueba values ('todas',
    exists (select 1 from jsonb_array_elements(j -> 'personas') p
             where p ->> 'celular' = v_cel and p ->> 'plataformas' = 'nequi,lulo,otra'));
  -- Desmarcarlas todas deja vacío.
  j := public.extracto_plataformas('');
  insert into plataformas_prueba values ('vaciar',
    coalesce((j ->> 'ok')::boolean, false) and coalesce(j ->> 'plataformas', 'x') = '');
  -- Retirar la autorización las borra; retirada, no guarda; y volver a firmar
  -- no las revive.
  j := public.extracto_plataformas('daviplata');
  j := public.extracto_retirar();
  insert into plataformas_prueba values ('retirar_las_borra',
    coalesce((select a.plataformas = '' from public.extracto_autorizaciones a where a.celular = v_cel), false));
  j := public.extracto_plataformas('nequi');
  insert into plataformas_prueba values ('retirada_no_guarda', coalesce(j ->> 'motivo', '') = 'sin_autorizacion');
  j := public.extracto_autorizar('2026-11-24', null);
  j := public.extracto_plataformas_mias();
  insert into plataformas_prueba values ('firmar_no_revive', coalesce(j ->> 'plataformas', 'x') = '');
  delete from public.extracto_autorizaciones a where a.celular = v_cel;
  delete from public.intentos_fallidos f where f.cedula = 'ex:' || v_cel;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- ====== 8. LO QUE JOAN VE: una fila por comprobación, todas en true ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
with cliente(firma) as (values
  ('public.extracto_plataformas(text)'), ('public.extracto_plataformas_mias()')),
joan(firma) as (values
  ('public.extracto_plataformas_de(text, text)')),
adentro(firma) as (values
  ('public.extracto_plataformas_limpia(text)'), ('public.extracto_plataformas_interna(text)'),
  ('public.extracto_plataformas_al_retirar()'))
select 1 as n, 'la columna existe, sin sitio para texto libre, y la tabla sigue cerrada a anon y authenticated' as comprobacion,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'extracto_autorizaciones' and column_name = 'plataformas')
       and exists (select 1 from pg_constraint where conname = 'extracto_plataformas_de_la_lista')
       and not exists (select 1 from information_schema.table_privileges
                        where table_schema = 'public' and table_name = 'extracto_autorizaciones'
                          and grantee in ('anon', 'authenticated', 'PUBLIC')) as ok
union all
select 2, 'decirlas y leerlas: solo la sesión del cliente (nunca anon)',
       (select bool_and(has_function_privilege('authenticated', firma, 'execute')
                        and not has_function_privilege('anon', firma, 'execute')) from cliente)
union all
select 3, 'verlas: solo con la clave de Joan (anon + clave), nunca con una sesión',
       (select bool_and(has_function_privilege('anon', firma, 'execute')
                        and not has_function_privilege('authenticated', firma, 'execute')) from joan)
union all
select 4, 'las de adentro no se le dan a nadie',
       (select bool_and(not has_function_privilege('anon', firma, 'execute')
                        and not has_function_privilege('authenticated', firma, 'execute')) from adentro)
union all
select 5, 'las que se llaman desde afuera son security definer con el search_path fijo',
       (select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%')
          from (select firma from cliente union all select firma from joan) f
          join pg_proc p on p.oid = f.firma::regprocedure)
union all
select 6, 'al retirar la autorización se borran (el disparador existe)',
       exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'extracto_plataformas_al_retirar')
union all
-- coalesce: bool_and SALTA los null, y un paso sin respuesta saldría en true.
select 7, 'la prueba llamando: sin sesión y sin autorización no guarda; guarda solo lo de la lista; Joan las ve; retirar las borra y volver a firmar no las revive',
       (select count(*) = 10 and bool_and(coalesce(ok, false)) from plataformas_prueba)
union all
select 8, 'la prueba no dejó nada',
       not exists (select 1 from public.extracto_autorizaciones where celular = '3009991124')
       and not exists (select 1 from public.intentos_fallidos where cedula = 'ex:3009991124')
order by 1;
