-- ===========================================================================
-- LO DEL EQUIPO SOLO SE ABRE CON LA CLAVE QUE PUSO JOAN — 22 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- toca ninguna fila: crea dos funciones chicas y cambia, en las funciones del
-- equipo, SOLO la línea que decide quién eres. Va DESPUÉS de
-- base/20261015c_clave_del_equipo.sql (equipo_poner_clave y claves_equipo).
-- Al final sale UNA TABLA: las comprobaciones (todas en true) y, debajo, una
-- fila por persona activa del equipo que dice si ya puede entrar y, si no, la
-- línea exacta que tienes que correr (con una contraseña que tú eliges).
-- Después: Settings → API → «Reload schema».
--
-- 23-oct-2026 — SE LLAMABA 20261022b_el_equipo_con_la_clave_de_joan.sql y
-- chocaba de nombre con el de las cuentas del registro. Ahora es la «d»: el
-- ÚLTIMO de los cuatro del 22-oct (20261022_la_foto…, 20261022b_destino…,
-- 20261022c_las_cuentas… y este). Va al final a propósito: es el único que
-- deja a alguien afuera, y conviene correrlo cuando ya tengas a mano las
-- claves que vas a poner. Ningún archivo posterior puede decidir el puesto
-- con celular_de_sesion() (lo vigila
-- pruebas/el-equipo-con-la-clave-de-joan-postgres.test.js). Nada de adentro
-- cambió.
--
-- OJO, ESTO CAMBIA ALGO QUE HOY FUNCIONA: desde que corras este archivo,
-- nadie del equipo entra al Panel hasta que le pongas la clave con
-- equipo_poner_clave (la tabla del final dice a quién). Es a propósito: es la
-- única prueba de que la cuenta es de quien tú dices.
--
-- ---------------------------------------------------------------------------
-- EL HUECO (22-oct-2026, mientras se buscaba la selfie de William)
--
-- Todas las funciones del equipo deciden quién eres con celular_de_sesion():
-- el correo de la sesión (57 + celular + @tugarantia.net), y nada más. Y la
-- cuenta de ese correo la crea CUALQUIERA que se registre en play/ con ese
-- celular, si todavía no existe: el registro de clientes está abierto, y el
-- signup de Supabase también (es como el CRM crea las cuentas del equipo).
-- Así que si alguien del equipo no tiene cuenta —nunca se la crearon, o se
-- borró con borrar_cuenta_de_pruebas, que no mira public.equipo—, quien se
-- registre como cliente con su celular queda con su puesto: ve la cartera de
-- su equipo, los registros con sus fotos de cédula, crea asesores… Se
-- reprodujo en una réplica con las funciones de verdad (registro → mi_rol
-- 'gerente', gerente_archivos con las fotos de un tercero, asesor_crear).
--
-- LA REGLA DESDE HOY: lo del equipo se abre solo si ESTA cuenta recibió la
-- clave de Joan (equipo_poner_clave) DESPUÉS de crearse, y la sesión es de
-- después de esa clave. equipo_poner_clave solo la corre quien entra al
-- editor SQL con la cuenta de Supabase de Joan, y deja su rastro en
-- public.claves_equipo: eso no lo puede fabricar nadie desde un teléfono.
-- Nada que el teléfono escriba en la cuenta (la metadata la cambia el dueño
-- de la sesión) sirve para decidirlo.
--   · celular_del_equipo_de_sesion(): el celular de la sesión si NO es de
--     nadie del equipo (todo sigue igual: esas funciones no le encuentran
--     puesto), o si es del equipo Y la cuenta tiene la clave de Joan. Si es
--     del equipo y no la tiene, null: para las funciones del equipo es «sin
--     sesión», que es lo que ya saben contestar.
--   · Las funciones del equipo cambian celular_de_sesion() por esa, y NADA
--     MÁS (ver abajo cómo se comprueba). Las de los clientes no se tocan:
--     quien se registró con ese celular sigue siendo un cliente con su
--     cuenta, sus fotos y su solicitud.
--   · equipo_cuenta_sin_clave(): le dice a la propia sesión si su cuenta es
--     de un puesto del equipo y le falta la clave, para que el Panel diga eso
--     y no «todavía no tienes puesto».
--
-- POR QUÉ NO SE COMPARA LA HUELLA DE CADA FUNCIÓN, como en 20261020: son
-- veinticinco funciones y en producción alguna puede ser distinta de la
-- réplica (20260922p no corre limpio en una base nueva); con una lista de
-- huellas el archivo pararía por una diferencia que no le importa. Lo que sí
-- se compara, función por función, es que el cambio sea EXACTAMENTE ese:
-- después de crearla se deshace el reemplazo sobre el texto vivo y su md5
-- tiene que ser el de antes. Si no, el archivo para y no queda nada a medias
-- (todo va dentro de un solo bloque).
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
do $$
begin
  if to_regprocedure('public.celular_de_sesion()') is null or to_regclass('public.equipo') is null then
    raise exception 'Falta celular_de_sesion o la tabla equipo (base/20260910_equipo_en_la_nube.sql). No se tocó nada.';
  end if;
  if to_regclass('public.claves_equipo') is null or to_regprocedure('public.equipo_poner_clave(text, text)') is null then
    raise exception 'Falta base/20261015c_clave_del_equipo.sql (equipo_poner_clave y claves_equipo). Córrela primero: sin ella nadie del equipo podría volver a entrar. No se tocó nada.';
  end if;
end $$;

-- ====== 1. QUIÉN ES DEL EQUIPO EN ESTA SESIÓN ======
create or replace function public.celular_del_equipo_de_sesion()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  cel     text;
  creada  timestamptz;
  clave   timestamptz;
  emitido timestamptz;
begin
  cel := public.celular_de_sesion();
  if cel is null then return null; end if;
  -- No es de nadie del equipo: nada cambia (las funciones del equipo no le
  -- encuentran puesto, como siempre).
  if not exists (select 1 from public.equipo e where e.celular = right(cel, 10)) then
    return cel;
  end if;
  -- Es de un puesto: la cuenta de ESTA sesión (por su id, no por el correo
  -- del token) y cuándo nació.
  select u.created_at into creada
    from auth.users u
   where u.id = auth.uid()
     and lower(u.email) = '57' || right(cel, 10) || '@tugarantia.net';
  if creada is null then return null; end if;
  -- La última clave de Joan para ese celular, y tiene que ser de DESPUÉS de
  -- que naciera esta cuenta: una clave de una cuenta anterior (borrada) no
  -- vale para la que alguien creó registrándose.
  select max(c.cuando) into clave from public.claves_equipo c where c.celular = right(cel, 10);
  if clave is null or clave < creada then return null; end if;
  -- Y la sesión, de después de esa clave: equipo_poner_clave cierra las
  -- sesiones abiertas, pero un token ya entregado sigue vivo hasta una hora.
  -- 30 segundos de gracia por la diferencia de relojes entre Auth y la base.
  begin
    emitido := to_timestamp(nullif(auth.jwt() ->> 'iat', '')::double precision);
  exception when others then
    emitido := null;
  end;
  if emitido is null or emitido < clave - interval '30 seconds' then return null; end if;
  return cel;
end
$$;
comment on function public.celular_del_equipo_de_sesion() is
  '22-oct-2026: el celular de la sesión para las funciones del equipo. Si el celular es de alguien del equipo, solo con la clave de Joan (claves_equipo) puesta después de crear la cuenta y una sesión de después de esa clave.';
revoke all on function public.celular_del_equipo_de_sesion() from public, anon, authenticated;

-- Para que el Panel diga la verdad: «tu contraseña sirve, pero a esta cuenta
-- le falta la clave de Joan». Solo de la propia sesión: no dice nada de nadie.
create or replace function public.equipo_cuenta_sin_clave()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare cel text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return false; end if;
  return exists (select 1 from public.equipo e where e.celular = right(cel, 10) and e.estado = 'activo')
         and public.celular_del_equipo_de_sesion() is null;
end
$$;
revoke all on function public.equipo_cuenta_sin_clave() from public, anon, authenticated;
grant execute on function public.equipo_cuenta_sin_clave() to authenticated;

-- ====== 2. LAS FUNCIONES DEL EQUIPO DECIDEN QUIÉN ERES CON LA CLAVE ======
-- Son las que deciden quién eres con celular_de_sesion() y miran el puesto
-- (public.equipo) o los envíos del asesor. Las que llaman a
-- gerente_de_sesion() quedan cubiertas por ella, que también cambia.
do $$
declare
  r       record;
  antes   text;
  despues text;
  n       integer := 0;
  lista   text := '';
begin
  for r in
    select p.oid, p.oid::regprocedure::text as firma, p.prosrc
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public'
       and p.proname not in ('celular_de_sesion', 'celular_del_equipo_de_sesion', 'equipo_cuenta_sin_clave')
       and p.prosrc ~ 'public\.celular_de_sesion\(\)'
       and p.prosrc ~* '(public\.equipo|from\s+equipo|join\s+equipo|update\s+equipo|public\.envios_asesor)\M'
     order by 2
  loop
    antes := r.prosrc;
    execute replace(pg_get_functiondef(r.oid), 'public.celular_de_sesion()', 'public.celular_del_equipo_de_sesion()');
    select p.prosrc into despues from pg_proc p where p.oid = r.oid;
    if position('public.celular_de_sesion()' in despues) > 0
       or md5(replace(despues, 'public.celular_del_equipo_de_sesion()', 'public.celular_de_sesion()')) <> md5(antes) then
      raise exception 'Al cambiar % quedó algo distinto de la línea que decide quién eres. No se tocó nada (todo este bloque se deshace): avísale a Claude.', r.firma;
    end if;
    n := n + 1;
    lista := lista || r.firma || '; ';
  end loop;
  if n = 0 then
    raise notice 'Las funciones del equipo ya deciden quién eres con la clave de Joan: no se cambió nada.';
  else
    raise notice 'Cambiadas % funciones del equipo: %', n, lista;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ====== 3. LA PRUEBA, LLAMÁNDOLA ======
-- PL/pgSQL compila cada consulta la primera vez que la CORRE. Se llaman las
-- dos funciones nuevas sin sesión y con una sesión cuyo `sub` no es ninguna
-- cuenta, con un celular de mentira; no se crea ninguna cuenta ni se escribe
-- nada (los caminos con cuentas de verdad, en la réplica:
-- pruebas/el-equipo-con-la-clave-de-joan-postgres.test.js).
do $prueba$
begin
  perform set_config('request.jwt.claims', '', true);
  if public.celular_del_equipo_de_sesion() is not null or public.equipo_cuenta_sin_clave() then
    raise exception 'FALLO: sin sesión, alguien es del equipo.';
  end if;
  perform set_config('request.jwt.claims', '{"sub":"' || gen_random_uuid() || '","email":"573009991023@tugarantia.net","role":"authenticated","iat":' ||
    floor(extract(epoch from now())) || '}', true);
  if public.celular_del_equipo_de_sesion() is distinct from (case when exists (select 1 from public.equipo where celular = '3009991023') then null else '3009991023' end) then
    raise exception 'FALLO: celular_del_equipo_de_sesion no devolvió lo esperado para un celular que no es del equipo.';
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- ====== 4. LO QUE JOAN VE: las comprobaciones y, debajo, su equipo ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
select 1 as orden, 'celular_del_equipo_de_sesion existe y nadie de afuera la llama' as comprobacion,
       (to_regprocedure('public.celular_del_equipo_de_sesion()') is not null
        and not has_function_privilege('anon', 'public.celular_del_equipo_de_sesion()', 'execute')
        and not has_function_privilege('authenticated', 'public.celular_del_equipo_de_sesion()', 'execute')) as ok,
       '' as que_hacer
union all
select 2, 'ninguna función del equipo decide quién eres sin la clave de Joan',
       not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public'
                      and p.proname not in ('celular_de_sesion', 'celular_del_equipo_de_sesion', 'equipo_cuenta_sin_clave')
                      and p.prosrc ~ 'public\.celular_de_sesion\(\)'
                      and p.prosrc ~* '(public\.equipo|from\s+equipo|join\s+equipo|update\s+equipo|public\.envios_asesor)\M'),
       ''
union all
select 3, 'gerente_de_sesion y mi_rol ya piden la clave de Joan',
       (select bool_and(p.prosrc ~ 'celular_del_equipo_de_sesion') from pg_proc p
         where p.oid in ('public.gerente_de_sesion()'::regprocedure, 'public.mi_rol()'::regprocedure)),
       ''
union all
select 4, 'lo de los clientes no cambió (la subida de fotos decide como siempre)',
       (select p.prosrc ~ 'public\.celular_de_sesion\(\)' and p.prosrc !~ 'celular_del_equipo_de_sesion' from pg_proc p
         where p.oid = 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure),
       ''
union all
select 10 + row_number() over (order by e.rol, e.celular),
       'Puede entrar al equipo: ' || e.nombre || ' (' || e.rol || ', ' || e.celular || ')',
       (u.id is not null and exists (select 1 from public.claves_equipo c where c.celular = e.celular and c.cuando >= u.created_at)),
       case
         when u.id is null then 'Todavía no tiene cuenta: créala en el CRM (Equipo → Crear cuenta) y después ponle la clave.'
         when exists (select 1 from public.claves_equipo c where c.celular = e.celular and c.cuando >= u.created_at) then ''
         else 'Le falta tu clave. Corre aquí: select public.equipo_poner_clave(''' || e.celular || ''', ''UNA-CLAVE-NUEVA''); (cambia UNA-CLAVE-NUEVA por la que le vas a mandar, y borra la línea del editor después)'
       end
  from public.equipo e
  left join auth.users u on lower(u.email) = '57' || e.celular || '@tugarantia.net'
 where e.estado = 'activo'
 order by 1;
