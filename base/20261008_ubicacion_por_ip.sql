-- ===========================================================================
-- LA UBICACIÓN APROXIMADA POR IP, ANOTADA EN EL REGISTRO — 8 de octubre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor. Es idempotente: crea o reemplaza
-- UNA función nueva y vuelve a poner sus permisos. No crea tablas, no toca
-- ninguna función que ya exista y no cambia ni una fila al correrlo.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema. Mientras no esté, el
-- CRM y «🔎 Revisar a todos» siguen mostrando la ubicación igual (la guardan
-- en el navegador), solo que cada computador la vuelve a consultar una vez.
--
-- LA PREGUNTA QUE CONTESTA
-- Joan, el 8-oct-2026: «no es necesario preguntar por la dirección, mejor con
-- la dirección IP validamos una ubicación aproximada y la dejamos anotada
-- automáticamente». La IP ya la guarda la base al recibir las fotos del
-- registro (huella.ip, de la cabecera de la petición: no la manda el
-- teléfono). La ciudad de esa IP la consulta el NAVEGADOR DE JOAN —nunca el
-- teléfono del cliente— en ipwho.is (ver app/ubicacion-ip.js, por qué ese
-- servicio y sus condiciones). Esta función es el sitio donde queda ANOTADA,
-- dentro del mismo registro, para no volver a preguntarle al servicio por la
-- misma IP desde cada computador y cada página.
--
-- QUÉ GUARDA, Y QUÉ NO
-- En huella.ubicacion_ip: la IP a la que corresponde, ciudad, departamento,
-- país, el código del país, el nombre de la red (el operador), de dónde salió
-- (la fuente) y el día en que se consultó — el día lo pone ESTA función, no
-- quien llama. Nada más: no hay coordenadas, y no hay dirección de nadie.
-- Es una ubicación APROXIMADA de la red, no de la casa, y así lo dicen todas
-- las pantallas que la muestran.
--
-- POR QUÉ COMPARA LA IP
-- registro_archivos_guardar vuelve a escribir huella.ip cada vez que el
-- teléfono sube fotos, y puede hacerlo desde otra red. Si llega una ubicación
-- de una IP que ya no es la del registro (una consulta vieja que terminó
-- tarde), no se anota: sería pegarle a este registro la ciudad de otra red.
-- Las pantallas hacen la misma comparación al leerla.
--
-- QUIÉN LA LLAMA
-- El CRM y panel/revision.html, con la clave de sincronización (p_clave), por
-- la misma puerta que listar_registros y verificar_registro_foto: concedida a
-- anon, cerrada a authenticated. Como esas dos, quien tenga la clave del CRM
-- puede escribir aquí lo que quiera: por eso cada campo se recorta y se limpia
-- aquí, y las pantallas lo vuelven a limpiar y lo escapan al pintarlo.
--
-- VOLÁTIL, NO STABLE: pasa por clave_ok, que escribe el freno anti fuerza
-- bruta, y además escribe la huella. PostgREST corre las stable en solo
-- lectura (ver 20260922c_verificacion_cedula.sql).
-- ===========================================================================

-- ===================== 0. LO QUE TIENE QUE EXISTIR ANTES ====================
-- Antes de crear nada. Si falta algo, no se crea nada.
do $$
begin
  if to_regclass('public.registros') is null then
    raise exception 'Falta la tabla public.registros (base/supabase.sql). Córrela primero.';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null then
    raise exception 'Falta public.clave_ok (base/supabase.sql). Córrelo primero.';
  end if;
end
$$;

-- La columna existe desde 20260908b_registro_archivos.sql. Se repite aquí
-- (si ya está, no hace nada) porque la función de abajo la nombra, y PL/pgSQL
-- no la busca al crearla sino en la PRIMERA LLAMADA: sin ella quedaría en
-- verde al pegarla y muerta al usarla.
alter table public.registros add column if not exists huella jsonb;

-- ===================== 1. ANOTAR LA UBICACIÓN ===============================
create or replace function public.anotar_ubicacion_ip(p_clave text, p_id bigint, p_ubicacion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_huella jsonb;
  v_ip     text;
  v_dice   text;
  v_cod    text;
  v_fuente text;
  v_ciudad text;
  v_region text;
  v_pais   text;
  v_red    text;
  v_u      jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;

  if p_ubicacion is null or jsonb_typeof(p_ubicacion) <> 'object' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_ubicacion');
  end if;

  -- for update: entre leer la IP y escribir no puede colarse una subida de
  -- fotos que la cambie.
  select r.huella into v_huella
    from public.registros r
   where r.id = p_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  -- La primera de la lista (la cabecera puede traer «cliente, proxy»), en
  -- minúsculas y sin el prefijo de IPv4 metida en IPv6: igual que
  -- normalizarIP en app/ubicacion-ip.js.
  v_ip := lower(btrim(split_part(coalesce(v_huella ->> 'ip', ''), ',', 1)));
  v_ip := regexp_replace(v_ip, '^::ffff:([0-9]+[.][0-9]+[.][0-9]+[.][0-9]+)$', '\1');
  v_dice := lower(btrim(coalesce(p_ubicacion ->> 'ip', '')));
  if v_ip = '' or v_ip !~ '^[0-9a-f:.]{2,45}$' or v_dice <> v_ip then
    return jsonb_build_object('ok', false, 'motivo', 'otra_ip');
  end if;

  -- Cada texto, sin caracteres de control y recortado.
  v_ciudad := left(btrim(regexp_replace(coalesce(p_ubicacion ->> 'ciudad', ''), '[[:cntrl:]]', ' ', 'g')), 80);
  v_region := left(btrim(regexp_replace(coalesce(p_ubicacion ->> 'region', ''), '[[:cntrl:]]', ' ', 'g')), 80);
  v_pais   := left(btrim(regexp_replace(coalesce(p_ubicacion ->> 'pais', ''), '[[:cntrl:]]', ' ', 'g')), 80);
  v_red    := left(btrim(regexp_replace(coalesce(p_ubicacion ->> 'red', ''), '[[:cntrl:]]', ' ', 'g')), 120);
  if v_ciudad = '' and v_region = '' and v_pais = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_lugar');
  end if;

  v_cod := upper(btrim(coalesce(p_ubicacion ->> 'codigo_pais', '')));
  if v_cod !~ '^[A-Z]{2}$' then v_cod := ''; end if;
  v_fuente := lower(btrim(coalesce(p_ubicacion ->> 'fuente', '')));
  if v_fuente !~ '^[a-z0-9.-]{1,40}$' then v_fuente := 'ipwho.is'; end if;

  v_u := jsonb_build_object(
    'ip',          v_ip,
    'ciudad',      v_ciudad,
    'region',      v_region,
    'pais',        v_pais,
    'codigo_pais', v_cod,
    'red',         v_red,
    'fuente',      v_fuente,
    'consultada',  to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD'));

  update public.registros r
     set huella = coalesce(r.huella, '{}'::jsonb) || jsonb_build_object('ubicacion_ip', v_u)
   where r.id = p_id;

  return jsonb_build_object('ok', true, 'ubicacion_ip', v_u);
end
$$;

-- ===================== 2. PERMISOS ==========================================
-- Supabase le concede EXECUTE a anon y authenticated en cada función nueva de
-- public, y «revoke ... from public» NO quita ese permiso: se revoca de los
-- dos roles por su nombre, y se le da solo a anon (la puerta del CRM).
revoke all on function public.anotar_ubicacion_ip(text, bigint, jsonb) from public, anon, authenticated;
grant  execute on function public.anotar_ubicacion_ip(text, bigint, jsonb) to anon;

-- ===================== 3. LA COMPROBACIÓN ===================================
-- Solo avisos: una excepción aquí desharía lo de arriba (el editor corre el
-- archivo en una sola transacción).
do $$
declare
  v_def boolean;
begin
  select p.prosecdef into v_def
    from pg_proc p
   where p.oid = to_regprocedure('public.anotar_ubicacion_ip(text, bigint, jsonb)');
  if v_def is distinct from true then
    raise notice 'FALTA: anotar_ubicacion_ip no quedó como security definer. Mándale a Claude este aviso.';
  elsif has_function_privilege('authenticated', 'public.anotar_ubicacion_ip(text, bigint, jsonb)', 'execute') then
    raise notice 'OJO: una sesión de cliente (authenticated) puede llamar anotar_ubicacion_ip. Vuelve a correr la sección 2.';
  elsif not has_function_privilege('anon', 'public.anotar_ubicacion_ip(text, bigint, jsonb)', 'execute') then
    raise notice 'OJO: el CRM (anon) no puede llamar anotar_ubicacion_ip. Vuelve a correr la sección 2.';
  else
    raise notice 'Listo: la ubicación aproximada por IP queda anotada en cada registro. Falta: Settings → API → Reload schema.';
  end if;
end
$$;
