-- ===========================================================================
-- LAS SOLICITUDES EN EL CELULAR — 25 de noviembre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor → New query → pegar TODO → Run.
-- Va DESPUÉS de 20260811_panel_nube.sql (de ahí sale panel_es_dueno) y de
-- 20261022d_el_equipo_con_la_clave_de_joan.sql. Es idempotente: crea o
-- reemplaza UNA función y vuelve a poner sus permisos. No crea tablas ni
-- columnas y no cambia ninguna función que ya exista.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema. Sin eso la función
-- contesta 404 aunque exista, y el celular sigue diciendo «tu base todavía no
-- tiene esta parte», que es lo que dice mientras esto no esté corrido.
--
-- LA PREGUNTA QUE CONTESTA
-- Joan quiere en el celular «toda la informacion que podria yo encontrar en
-- el crm del computador». La pestaña 📥 Solicitudes estaba tapada en el
-- teléfono: la bandeja se lee con listar_solicitudes_abiertas, y esa pide la
-- CLAVE DE SINCRONIZACIÓN del CRM (p_clave). El celular no la tiene y no debe
-- tenerla: entra con la sesión de Joan, como panel_traer y panel_registros.
--
-- POR QUÉ NO SE REUSA listar_solicitudes_abiertas CON OTRA PUERTA
-- Esa devuelve la fila ENTERA (setof public.solicitudes): la cuenta donde se
-- desembolsa, los datos declarados y el celular del gerente responsable. El
-- computador los necesita para responder; el teléfono solo MIRA, y un
-- teléfono se pierde en la calle. Esta función devuelve SOLO lo que la
-- tarjeta del celular pinta, campo por campo (el mismo criterio de
-- 20261002_panel_registros.sql).
--
-- LO QUE NUNCA SALE DE ACÁ
--   · destino_desembolso (la cuenta de banco o el Nequi de la persona).
--   · datos (lo que declaró: ingresos, dirección, referencias).
--   · responsable (el celular del gerente) ni el «por» entero de la propuesta:
--     de quién la mandó sale solo el TIPO (automatica, joan o gerente).
--   · La tasa, el costo y el total: para saber que alguien espera no hacen falta.
--
-- «PIDIÓ» ES LO QUE LA PERSONA PIDIÓ
-- capital es lo que se le PROPONE (nace con la propuesta automática y se pisa
-- con cada contrapropuesta). Lo que la persona pidió está en pedido_monto
-- (play/) o en pedido->>'capital' (PlataChat). Si no está, 'pedido_monto' sale
-- null y el celular dice «un crédito», sin inventarle una cifra. Es la misma
-- distinción que ya hace panel_registros.
--
-- EL RELOJ CORRE TAMBIÉN ACÁ
-- listar_solicitudes_abiertas llama a resolver_vencidas() antes de contestar
-- (20261005_platachat_solicitud.sql): «lo que Joan ve abierto es lo que de
-- verdad sigue abierto». El celular no puede mostrar como «te toca responder»
-- una solicitud que ya venció, así que hace lo mismo. Se llama con EXECUTE y
-- solo si existe: PL/pgSQL compila en la PRIMERA LLAMADA, y nombrarla
-- directamente dejaría esta función en verde al pegarla y muerta al usarla en
-- una base que no tenga ese archivo (ya costó trece días una vez).
--
-- COLUMNAS QUE PUEDEN NO ESTAR
-- Todo lo que no es de la tabla original (app, producto, celular, pedido…)
-- se lee con to_jsonb(s) ->> '...': si la columna no existe en la base de
-- verdad, sale null y la tarjeta no pinta esa parte.
--
-- CÓMO QUEDA PROTEGIDA, igual que panel_registros: security definer con el
-- search_path fijo, pregunta panel_es_dueno() en la primera línea, y los
-- permisos en dos tiempos (el revoke NOMBRA a anon y authenticated porque
-- Supabase les concede EXECUTE a cada función nueva de public por su cuenta).
-- ===========================================================================


-- ====== 0. LO QUE TIENE QUE ESTAR ANTES ======
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Falta base/20261022d_el_equipo_con_la_clave_de_joan.sql. Córrelo primero.';
  end if;
  if to_regprocedure('public.panel_es_dueno()') is null then
    raise exception 'Falta base/20260811_panel_nube.sql: sin panel_es_dueno() esta función no sabe quién es Joan. Córrelo primero.';
  end if;
  if to_regclass('public.solicitudes') is null then
    raise exception 'No existe public.solicitudes: corre primero base/supabase.sql.';
  end if;
end $$;


-- ====== 1. LA FUNCIÓN ======
create or replace function public.panel_solicitudes(p_limite integer default 100)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limite     integer;
  v_nuevas     integer := 0;
  v_aceptadas  integer := 0;
  v_propuestas integer := 0;
  v_filas      jsonb := '[]'::jsonb;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  -- El reloj, como en la bandeja del computador (ver la nota de arriba).
  if to_regprocedure('public.resolver_vencidas()') is not null then
    execute 'select public.resolver_vencidas()';
  end if;

  -- Con p_limite = 0 contesta solo cuántas hay: sirve para el número de la
  -- pestaña sin bajar los datos de nadie.
  v_limite := least(greatest(coalesce(p_limite, 100), 0), 200);

  select count(*) filter (where s.estado = 'nueva'),
         count(*) filter (where s.estado = 'aceptada'),
         count(*) filter (where s.estado = 'contrapropuesta')
    into v_nuevas, v_aceptadas, v_propuestas
    from public.solicitudes s
   where s.estado in ('nueva', 'contrapropuesta', 'aceptada');

  if v_limite > 0 then
    select coalesce(jsonb_agg(x.fila order by x.creada_en desc, x.id desc), '[]'::jsonb)
      into v_filas
      from (
        select s.id, s.creada_en,
               jsonb_build_object(
                 'id',          s.id,
                 'estado',      s.estado,
                 'creada_en',   s.creada_en,
                 'nombre',      left(s.nombre, 120),
                 -- La llave con la que entró: la cédula (app de socios) o el
                 -- celular (play/ y PlataChat guardan ahí el celular). El
                 -- teléfono la cruza con la cartera que ya tiene en memoria.
                 'llave',       s.cedula,
                 'celular',     to_jsonb(s) ->> 'celular',
                 'app',         coalesce(to_jsonb(s) ->> 'app', 'tugarantia'),
                 'producto',    coalesce(to_jsonb(s) ->> 'producto', 'quincenal'),
                 'plazo_meses', case when (to_jsonb(s) ->> 'plazo_meses') ~ '^[0-9]+$'
                                     then (to_jsonb(s) ->> 'plazo_meses')::integer end,
                 -- Lo que se le PROPONE hoy.
                 'capital',     s.capital,
                 'fecha_corte', s.fecha_corte,
                 'sobre_cupo',  s.sobre_cupo,
                 -- Lo que la persona PIDIÓ (null si no dijo una cifra).
                 'pedido_monto', coalesce(
                                   case when (to_jsonb(s) ->> 'pedido_monto') ~ '^[0-9]+$'
                                        then (to_jsonb(s) ->> 'pedido_monto')::bigint end,
                                   case when (to_jsonb(s) -> 'pedido' ->> 'capital') ~ '^[0-9]+$'
                                        then (to_jsonb(s) -> 'pedido' ->> 'capital')::bigint end),
                 'pedido_plazo', case when (to_jsonb(s) ->> 'pedido_plazo') ~ '^[0-9]+$'
                                      then (to_jsonb(s) ->> 'pedido_plazo')::integer end,
                 'pedido_nota',  left(to_jsonb(s) ->> 'pedido_nota', 140),
                 -- De la propuesta, solo quién la mandó reducido a su tipo.
                 'propuesta_por', case
                                    when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') like 'automatica%' then 'automatica'
                                    when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') = 'joan'            then 'joan'
                                    when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') like 'gerente%'     then 'gerente'
                                  end,
                 'aceptada_en',        to_jsonb(s) ->> 'aceptada_en',
                 'responder_antes_de', to_jsonb(s) ->> 'responder_antes_de',
                 'cuenta_sin_juntar',  coalesce(to_jsonb(s) ->> 'cuenta_sin_juntar', 'false') = 'true'
               ) as fila
          from public.solicitudes s
         where s.estado in ('nueva', 'contrapropuesta', 'aceptada')
         order by s.creada_en desc, s.id desc
         limit v_limite
      ) x;
  end if;

  return jsonb_build_object(
    -- La hora DEL SERVIDOR: el celular la pinta como «la nube contestó a las…»,
    -- y así no depende del reloj del teléfono.
    'servidor_ahora', now(),
    'nuevas',         v_nuevas,
    'aceptadas',      v_aceptadas,
    'propuestas',     v_propuestas,
    'solicitudes',    v_filas
  );
end
$$;


-- ====== 2. PERMISOS ======
revoke all on function public.panel_solicitudes(integer) from public, anon, authenticated;
grant execute on function public.panel_solicitudes(integer) to authenticated;
-- Y NUNCA a anon: la llave anon va escrita dentro de las páginas públicas, y lo
-- que se le concede a anon se le concede a internet. Tener sesión tampoco
-- alcanza: adentro se vuelve a preguntar panel_es_dueno().

notify pgrst, 'reload schema';


-- ====== 3. LA PRUEBA LLAMANDO, en la base de verdad ======
-- La función se LLAMA aquí mismo, porque PL/pgSQL no la compila al crearla.
-- Sin sesión tiene que negarse, y con la sesión de un dueño que YA exista en
-- panel_duenos (no se crea ninguno) tiene que contestar con la forma que el
-- celular espera y sin los campos que no deben salir. Si no hay ningún dueño
-- todavía, ese paso no corre y lo dice.
-- Lo único que puede moverse al llamarla es el reloj de las vencidas
-- (resolver_vencidas), el mismo que corre cada vez que el computador abre la
-- bandeja: la prueba no crea, no cambia ni borra ninguna solicitud por su cuenta.
-- La tabla de la prueba es temporal (muere con la conexión).
drop table if exists pg_temp.solicitudes_celular_prueba;
create temporary table solicitudes_celular_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_uid  uuid;
  j      jsonb;
  v_neg  boolean := false;
begin
  -- Sin sesión: se niega.
  perform set_config('request.jwt.claims', '', true);
  begin
    j := public.panel_solicitudes(1);
  exception when others then
    v_neg := sqlerrm = 'no autorizado';
  end;
  insert into solicitudes_celular_prueba values ('sin_sesion_se_niega', v_neg);

  -- Con una sesión que no es de un dueño: se niega.
  v_neg := false;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001125","role":"authenticated"}', true);
  begin
    j := public.panel_solicitudes(1);
  exception when others then
    v_neg := sqlerrm = 'no autorizado';
  end;
  insert into solicitudes_celular_prueba values ('quien_no_es_dueno_se_niega',
    v_neg or exists (select 1 from public.panel_duenos where uid = '00000000-0000-4000-8000-000000001125'));

  -- Con la sesión de un dueño que ya existe: contesta, con su forma.
  select uid into v_uid from public.panel_duenos order by creado_en limit 1;
  if v_uid is null then
    raise notice 'Todavía no hay ningún dueño en panel_duenos: la prueba con sesión no corre.';
    insert into solicitudes_celular_prueba values ('con_dueno_contesta', null), ('no_salen_los_campos_privados', null);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    j := public.panel_solicitudes(200);
    insert into solicitudes_celular_prueba values ('con_dueno_contesta',
      jsonb_typeof(j -> 'solicitudes') = 'array'
      and (j ->> 'nuevas') ~ '^[0-9]+$' and (j ->> 'aceptadas') ~ '^[0-9]+$' and (j ->> 'propuestas') ~ '^[0-9]+$'
      and (j ->> 'servidor_ahora') is not null
      and jsonb_array_length(j -> 'solicitudes') <= 200);
    insert into solicitudes_celular_prueba values ('no_salen_los_campos_privados',
      not exists (
        select 1 from jsonb_array_elements(j -> 'solicitudes') f
         where f ? 'destino_desembolso' or f ? 'datos' or f ? 'responsable' or f ? 'contrapropuesta'
            or f ? 'tasa' or f ? 'costo' or f ? 'total' or f ? 'pedido'));
    -- Y con el límite en cero, solo los números.
    j := public.panel_solicitudes(0);
    insert into solicitudes_celular_prueba values ('con_cero_solo_cuenta', jsonb_array_length(j -> 'solicitudes') = 0);
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- Permisos, comprobados y no supuestos.
insert into solicitudes_celular_prueba values
  ('cerrada_a_la_llave_publica', not has_function_privilege('anon', 'public.panel_solicitudes(integer)', 'execute')),
  ('abierta_con_sesion',         has_function_privilege('authenticated', 'public.panel_solicitudes(integer)', 'execute'))
on conflict (paso) do update set ok = excluded.ok;

-- Si algo salió en false, el archivo entero se deshace y lo dice.
do $$
declare v_mal text;
begin
  select string_agg(paso, ', ' order by paso) into v_mal from solicitudes_celular_prueba where ok is false;
  if v_mal is not null then
    raise exception 'FALLA la prueba de panel_solicitudes en: %. No quedó nada aplicado.', v_mal;
  end if;
  raise notice 'Listo: las solicitudes en el celular. Falta: Settings → API → Reload schema.';
end $$;

-- Lo que Joan ve al terminar: una fila por comprobación.
select paso as "comprobación",
       case when ok then 'bien' when ok is null then 'no corrió (todavía no hay dueño)' else 'FALLA' end as "resultado"
  from solicitudes_celular_prueba
 order by paso;
