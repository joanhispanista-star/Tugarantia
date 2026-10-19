-- ===========================================================================
-- EL TELÉFONO DE VERDAD — 19 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces. Después: Settings → API → «Reload schema».
-- Al final salen avisos (NOTICE): tiene que decir «Aparato: listo» y ninguna
-- línea con FALLA. Va DESPUÉS de base/20261008_condiciones_aceptadas.sql.
--
-- ---------------------------------------------------------------------------
-- LO QUE PASABA
--
-- El «tipo de celular» del CRM no era el teléfono del cliente. La base anota
-- la cabecera User-Agent de la petición (registro_archivos_guardar), y desde
-- 2023 Chrome en Android manda la MISMA cadena en todos los teléfonos:
-- «Android 10; K». Ni la versión ni el modelo son de verdad, y la app de
-- Android (una TWA, Chrome por dentro) manda la misma. En iPhone, Safari 26
-- congeló la cifra del sistema en 18_6. El CRM pintaba «Android 10 · K ·
-- Chrome» para un Galaxy A15 con Android 14.
--
-- LO QUE TRAE, tres piezas NUEVAS (no se reescribe ninguna función viva):
--
--   1. public.aparatos_vistos: desde qué teléfono se registró, pidió y aceptó
--      cada celular, con lo que dijo la conexión (IP, User-Agent y las
--      cabeceras sec-ch-ua que Chrome ya manda solas) y lo que informó el
--      navegador del teléfono (modelo, versión del sistema, navegador, si fue
--      por nuestra app). Solo se agrega. RLS encendido y SIN políticas: nadie
--      la lee ni la escribe desde afuera; entra y sale por las dos funciones.
--
--   2. aparato_anotar(p_cuando, p_declarado): la llama la app (play/ y
--      app/socio.html) con la sesión del cliente, sin esperar respuesta. Cada
--      campo de lo declarado se valida contra una lista cerrada o una forma
--      fija, y lo que no cumple se tira. Como mucho 20 filas por celular al
--      día. Con 'registro' deja además huella.aparato_telefono en el último
--      registro de ese celular, que es lo que el CRM ya lee (listar_registros
--      devuelve la fila entera, y el gerente la ve por gerente_archivos):
--      así no se toca registro_archivos_guardar, que es la función viva más
--      delicada de la casa.
--
--   3. aparatos_de(p_clave, p_celular): para el CRM de Joan, con su clave de
--      sincronización. Devuelve lo anotado de ese celular, más la constancia
--      de cada aceptación (condiciones_aceptadas guardaba la IP y el aparato
--      y el CRM nunca los mostraba).
--
-- LO QUE NO HACE, y es a propósito:
--   · No le da más peso al modelo en la revisión de fraude. Lo que informa el
--     navegador se puede falsificar, igual que la cabecera, y un Galaxy A15 lo
--     tienen miles: no sirve para decir «es el mismo aparato».
--   · No corrige los registros viejos: el modelo nunca se guardó, y el CRM los
--     muestra como «el modelo no se supo».
--   · En iPhone no hay modelo: Apple no deja que una página lo sepa. Se anota
--     el motivo.
--
-- NUNCA `raise exception` después de la sección 0: el editor corre el archivo
-- en una transacción y eso deshace todo. Lo que falle se dice con FALLA.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES. Si falta algo, no se crea nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.solo_digitos(text)') is null then
    raise exception 'Falta base/20260908_primer_credito.sql (celular_de_sesion) o base/supabase.sql (solo_digitos). Córrelos primero.';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null then
    raise exception 'Falta public.clave_ok (base/supabase.sql). Córrelo primero.';
  end if;
  if to_regclass('public.registros') is null then
    raise exception 'Falta la tabla public.registros (base/supabase.sql). Córrela primero.';
  end if;
  if to_regclass('public.condiciones_aceptadas') is null then
    raise exception 'Falta base/20261008_condiciones_aceptadas.sql (condiciones_aceptadas). Córrelo primero.';
  end if;
end
$$;

-- La columna existe desde 20260908b_registro_archivos.sql. Se repite (si ya
-- está, no hace nada) porque aparato_anotar la nombra y PL/pgSQL no la busca al
-- crearse sino en la PRIMERA LLAMADA: sin ella quedaría en verde al pegarla y
-- muerta al usarla.
alter table public.registros add column if not exists huella jsonb;


-- ---------------------------------------------------------------------------
-- 1. LA TABLA
-- ---------------------------------------------------------------------------
create table if not exists public.aparatos_vistos (
  id           bigint      generated always as identity primary key,
  celular      text        not null,                       -- 10 dígitos, de celular_de_sesion
  cuando       text        not null check (cuando in ('registro', 'solicitud', 'aceptacion')),
  momento      timestamptz not null default now(),
  ip           text        not null default '',            -- de la cabecera, no del teléfono
  ua_cabecera  text        not null default '',            -- User-Agent de la cabecera
  ch_cabecera  jsonb       not null default '{}'::jsonb,   -- sec-ch-ua*, si llegaron
  declarado    jsonb       not null default '{}'::jsonb    -- lo que informó el navegador, validado
);
create index if not exists aparatos_vistos_por_celular
  on public.aparatos_vistos (celular, momento desc);

comment on table public.aparatos_vistos is
  'Desde qué teléfono se registró, pidió y aceptó cada celular (19-oct-2026). Solo entra por aparato_anotar y solo sale por aparatos_de.';

alter table public.aparatos_vistos enable row level security;
revoke all on table public.aparatos_vistos from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. ANOTAR (la app, con la sesión del cliente)
--
-- VOLÁTIL: escribe. Y security definer con search_path fijo, como todas las
-- de la casa que escriben por el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.aparato_anotar(p_cuando text, p_declarado jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cel     text;
  cab     jsonb;
  d       jsonb;
  v_dec   jsonb := '{}'::jsonb;
  v_ch    jsonb := '{}'::jsonb;
  v_n     integer;
  v_reg   bigint;
  v_en_reg boolean := false;
  v_nota  text;
  x       text;
  k       text;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;
  if p_cuando is null or p_cuando not in ('registro', 'solicitud', 'aceptacion') then
    return jsonb_build_object('ok', false, 'motivo', 'cuando');
  end if;

  d := case when jsonb_typeof(p_declarado) = 'object' then p_declarado else '{}'::jsonb end;
  if length(d::text) > 2000 then
    return jsonb_build_object('ok', false, 'motivo', 'grande');
  end if;

  -- El tope: 20 por celular en las últimas 24 horas. El candado pone en fila
  -- dos llamadas del mismo celular, para que no se cuelen las dos al contar.
  perform pg_advisory_xact_lock(hashtext('aparato_anotar:' || cel));
  select count(*) into v_n
    from public.aparatos_vistos
   where celular = cel and momento > now() - interval '1 day';
  if v_n >= 20 then
    return jsonb_build_object('ok', false, 'motivo', 'tope');
  end if;

  -- LO DECLARADO, campo por campo. Las listas son las de app/aparato.js
  -- (pruebas/aparato.test.js las compara). Lo que no cumple, no entra.
  if jsonb_typeof(d -> 'plataforma') = 'string'
     and d ->> 'plataforma' in ('android', 'ios', 'ipados', 'windows', 'mac', 'linux', 'chromeos', 'otro') then
    v_dec := v_dec || jsonb_build_object('plataforma', d ->> 'plataforma');
  end if;
  if jsonb_typeof(d -> 'sistema_version') = 'string'
     and d ->> 'sistema_version' ~ '^[0-9]{1,3}([.][0-9]{1,3}){0,2}$' then
    v_dec := v_dec || jsonb_build_object('sistema_version', d ->> 'sistema_version');
  end if;
  if jsonb_typeof(d -> 'sistema_o_mas') = 'boolean' and (d ->> 'sistema_o_mas')::boolean then
    v_dec := v_dec || jsonb_build_object('sistema_o_mas', true);
  end if;
  if jsonb_typeof(d -> 'modelo') = 'string'
     and d ->> 'modelo' ~ '^[A-Za-z0-9][A-Za-z0-9 ._()+/-]{0,59}$' then
    v_dec := v_dec || jsonb_build_object('modelo', d ->> 'modelo');
  end if;
  if jsonb_typeof(d -> 'navegador') = 'string'
     and d ->> 'navegador' in ('Chrome', 'Samsung Internet', 'Edge', 'Opera', 'Firefox', 'Safari',
                               'Navegador Huawei', 'Navegador Xiaomi', 'Brave', 'otro') then
    v_dec := v_dec || jsonb_build_object('navegador', d ->> 'navegador');
  end if;
  if jsonb_typeof(d -> 'navegador_version') = 'string'
     and d ->> 'navegador_version' ~ '^[0-9]{1,4}$' then
    v_dec := v_dec || jsonb_build_object('navegador_version', d ->> 'navegador_version');
  end if;
  if jsonb_typeof(d -> 'via') = 'string'
     and d ->> 'via' in ('app_tu_garantia', 'app_platachat', 'pagina_instalada', 'navegador',
                         'dentro_de_facebook', 'dentro_de_instagram', 'dentro_de_tiktok', 'dentro_de_otra_app') then
    v_dec := v_dec || jsonb_build_object('via', d ->> 'via');
  end if;
  -- El motivo de que no haya modelo, solo si de verdad no lo hay.
  if not (v_dec ? 'modelo') and jsonb_typeof(d -> 'sin_modelo') = 'string'
     and d ->> 'sin_modelo' in ('apple_no_lo_entrega', 'el_navegador_no_lo_dice') then
    v_dec := v_dec || jsonb_build_object('sin_modelo', d ->> 'sin_modelo');
  end if;
  if v_dec ? 'modelo' and jsonb_typeof(d -> 'fuente_modelo') = 'string'
     and d ->> 'fuente_modelo' in ('client_hints', 'user_agent') then
    v_dec := v_dec || jsonb_build_object('fuente_modelo', d ->> 'fuente_modelo');
  end if;
  if jsonb_typeof(d -> 'movil') = 'boolean' then
    v_dec := v_dec || jsonb_build_object('movil', (d ->> 'movil')::boolean);
  end if;

  -- LO QUE DIJO LA CONEXIÓN: las cabeceras de la petición, no el teléfono.
  begin
    cab := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    cab := '{}'::jsonb;
  end;
  foreach k in array array['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
                           'sec-ch-ua-model', 'sec-ch-ua-platform-version'] loop
    x := cab ->> k;
    if x is not null and x <> '' then
      v_ch := v_ch || jsonb_build_object(k, left(regexp_replace(x, '[[:cntrl:]]', ' ', 'g'), 300));
    end if;
  end loop;

  insert into public.aparatos_vistos (celular, cuando, ip, ua_cabecera, ch_cabecera, declarado)
  values (cel, p_cuando,
          left(regexp_replace(coalesce(cab ->> 'x-forwarded-for', cab ->> 'x-real-ip', ''), '[[:cntrl:]]', ' ', 'g'), 80),
          left(regexp_replace(coalesce(cab ->> 'user-agent', ''), '[[:cntrl:]]', ' ', 'g'), 300),
          v_ch, v_dec);

  -- EL REGISTRO. Con su propia red: si fallara, la fila de arriba ya quedó y
  -- el CRM la ve por aparatos_de; y no se calla, se devuelve qué pasó.
  if p_cuando = 'registro' then
    begin
      select r.id into v_reg
        from public.registros r
       where right(public.solo_digitos(r.telefono), 10) = cel
       order by r.creado_en desc, r.id desc
       limit 1;
      if v_reg is not null then
        update public.registros r
           set huella = coalesce(r.huella, '{}'::jsonb)
                        || jsonb_build_object('aparato_telefono', v_dec || jsonb_build_object('momento', now()))
         where r.id = v_reg;
        v_en_reg := true;
      end if;
    exception when others then
      v_en_reg := false;
      v_nota := left(coalesce(sqlerrm, ''), 120);
    end;
  end if;

  return jsonb_build_object('ok', true, 'en_registro', v_en_reg, 'declarado', v_dec)
         || case when v_nota is not null then jsonb_build_object('nota', v_nota) else '{}'::jsonb end;
end
$$;


-- ---------------------------------------------------------------------------
-- 3. LEER (el CRM de Joan, con su clave)
--
-- VOLÁTIL, NO STABLE: pasa por clave_ok, que escribe el freno anti fuerza
-- bruta, y PostgREST corre las stable en solo lectura (ver
-- 20260922c_verificacion_cedula.sql).
-- ---------------------------------------------------------------------------
create or replace function public.aparatos_de(p_clave text, p_celular text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t text;
  v jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;
  t := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(t) <> 10 then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.momento desc), '[]'::jsonb) into v
    from (select a.cuando, a.momento, a.ip, a.ua_cabecera as ua, a.declarado, 'telefono'::text as origen
            from public.aparatos_vistos a
           where a.celular = t
          union all
          -- La constancia de cada aceptación: solo trae lo de la cabecera.
          select 'aceptacion'::text, c.aceptada_en, coalesce(c.huella ->> 'ip', ''),
                 coalesce(c.huella ->> 'aparato', ''), '{}'::jsonb, 'constancia'::text
            from public.condiciones_aceptadas c
           where c.celular = t
          order by 2 desc
          limit 60) x;

  return jsonb_build_object('ok', true, 'aparatos', v);
end
$$;


-- ---------------------------------------------------------------------------
-- 4. LOS PERMISOS
--
-- Supabase le da EXECUTE a anon y authenticated en cada función nueva, y
-- «revoke ... from public» NO lo quita: se revoca de los tres por su nombre y
-- se da solo lo que toca. Anotar, con la sesión del cliente; leer, solo con la
-- llave pública más la clave de Joan (la puerta del CRM). Y nada para la llave
-- de servicio: nadie la usa para esto.
-- ---------------------------------------------------------------------------
revoke all on function public.aparato_anotar(text, jsonb) from public, anon, authenticated;
grant  execute on function public.aparato_anotar(text, jsonb) to authenticated;
revoke all on function public.aparatos_de(text, text) from public, anon, authenticated;
grant  execute on function public.aparatos_de(text, text) to anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.aparato_anotar(text, jsonb) from service_role';
    execute 'revoke all on function public.aparatos_de(text, text) from service_role';
    execute 'revoke all on table public.aparatos_vistos from service_role';
  end if;
end
$$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 5. LO QUE SE COMPRUEBA SOLO (sin raise exception: ver la cabecera)
--
-- Se prueba LLAMANDO, con un celular de mentira que no es de nadie, y se borra
-- lo que se creó. No se crea ningún registro de mentira: la tabla de
-- registros puede tener avisos enganchados desde el panel de Supabase.
-- ---------------------------------------------------------------------------
do $prueba$
declare
  v_cel  text := '3009990819';
  j      jsonb;
  pasos  text := '';
begin
  if exists (select 1 from public.aparatos_vistos where celular = v_cel)
     or exists (select 1 from public.registros where right(public.solo_digitos(coalesce(telefono, '')), 10) = v_cel) then
    raise notice 'Aparato: el celular de prueba % ya existe en la base; la prueba no corre.', v_cel;
    return;
  end if;

  begin
    -- Sin sesión, nada.
    perform set_config('request.jwt.claims', '', true);
    j := public.aparato_anotar('registro', '{}'::jsonb);
    if j ->> 'motivo' = 'sesion' then pasos := pasos || '1 sin-sesion-no; ';
    else raise notice 'FALLA 1: anotó sin sesión: %', j; end if;

    perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
    j := public.aparato_anotar('cuando_sea', '{}'::jsonb);
    if j ->> 'motivo' = 'cuando' then pasos := pasos || '2 cuando-cerrado; ';
    else raise notice 'FALLA 2: aceptó un momento que no existe: %', j; end if;

    j := public.aparato_anotar('solicitud', jsonb_build_object(
           'plataforma', 'android', 'modelo', 'SM-A155M', 'sistema_version', '14',
           'navegador', 'Chrome', 'navegador_version', '129', 'via', 'app_tu_garantia',
           'fuente_modelo', 'client_hints', 'movil', true));
    if j ->> 'ok' = 'true' and j -> 'declarado' ->> 'modelo' = 'SM-A155M'
       and j -> 'declarado' ->> 'via' = 'app_tu_garantia' then
      pasos := pasos || '3 anota; ';
    else raise notice 'FALLA 3: %', j; end if;

    j := public.aparato_anotar('aceptacion', jsonb_build_object(
           'plataforma', 'nokia3310', 'modelo', '<script>alert(1)</script>', 'sistema_version', '14; drop',
           'navegador', 'Netscape', 'via', 'por ahí', 'otro_campo', 'x', 'sin_modelo', 'porque_si'));
    if j ->> 'ok' = 'true' and j -> 'declarado' = '{}'::jsonb then
      pasos := pasos || '4 lo-invalido-no-entra; ';
    else raise notice 'FALLA 4 GRAVE: entró algo que no cumple las reglas: %', j; end if;

    j := public.aparato_anotar('registro', jsonb_build_object('plataforma', 'ios', 'sin_modelo', 'apple_no_lo_entrega'));
    if j ->> 'ok' = 'true' and j ->> 'en_registro' = 'false' and j ->> 'nota' is null then
      pasos := pasos || '5 sin-registro-no-falla; ';
    else raise notice 'FALLA 5: %', j; end if;

    if (select count(*) from public.aparatos_vistos where celular = v_cel) = 3 then
      pasos := pasos || '6 tres-filas; ';
    else raise notice 'FALLA 6: no quedaron las tres filas'; end if;

    -- Desde afuera, nadie.
    if has_function_privilege('anon', 'public.aparato_anotar(text, jsonb)', 'execute')
       or not has_function_privilege('authenticated', 'public.aparato_anotar(text, jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.aparatos_de(text, text)', 'execute')
       or not has_function_privilege('anon', 'public.aparatos_de(text, text)', 'execute')
       or has_table_privilege('anon', 'public.aparatos_vistos', 'select')
       or has_table_privilege('authenticated', 'public.aparatos_vistos', 'select')
       or has_table_privilege('authenticated', 'public.aparatos_vistos', 'insert') then
      raise notice 'FALLA 7 GRAVE: los permisos no quedaron como deben. Vuelve a correr la sección 4.';
    else pasos := pasos || '7 permisos; '; end if;

    if (select prosecdef from pg_proc where oid = to_regprocedure('public.aparato_anotar(text, jsonb)'))
       and (select prosecdef from pg_proc where oid = to_regprocedure('public.aparatos_de(text, text)')) then
      pasos := pasos || '8 definer; ';
    else raise notice 'FALLA 8: alguna de las dos no quedó security definer.'; end if;
  exception when others then
    raise notice 'FALLA: la prueba se cayó: %', sqlerrm;
  end;

  delete from public.aparatos_vistos where celular = v_cel;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'Aparato: %', pasos;
  if pasos = '1 sin-sesion-no; 2 cuando-cerrado; 3 anota; 4 lo-invalido-no-entra; 5 sin-registro-no-falla; 6 tres-filas; 7 permisos; 8 definer; ' then
    raise notice 'Aparato: listo. Falta: Settings → API → Reload schema.';
  end if;
end
$prueba$;
