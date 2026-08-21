-- ============================================================================
-- ENTRADA POR CELULAR — 20 de agosto de 2026
--
-- POR QUÉ EXISTE. El primer cliente real que instaló el APK (Leonardo) no pudo
-- entrar: la app pedía CÉDULA y su ficha no la tiene. No es un caso raro, es la
-- regla: al 20-ago solo 5 de 16 clientes tienen cédula cargada, y 15 de 16
-- tienen celular. El CRM de Joan conoce a su gente por el celular; la puerta
-- de la app pedía un dato que el negocio no recoge.
--
-- LO QUE CAMBIA: el cliente entra con su CELULAR o su cédula, más su código.
--
-- LO QUE NO CAMBIA, y es la parte importante: EL SECRETO SIGUE SIENDO EL
-- CÓDIGO. La puerta que se cerró el 10-ago era otra: cédula + últimos 4 del
-- celular, dos datos PÚBLICOS haciendo de llave. Aquí el celular solo
-- identifica (igual de público que la cédula que ya se usaba); sin el código
-- de 5 caracteres — al azar, con huella y pepper en el servidor, y el freno
-- de 8 intentos — el celular no abre nada.
--
-- Idempotente: se puede correr dos veces sin daño. Se corre ENTERO en el SQL
-- Editor de Supabase, y después Ajustes → ☁ Subir historiales para que la
-- columna nueva se llene.
-- ============================================================================

-- 1. La columna del celular completo. socios_historial guardaba solo tel4
--    (los últimos 4, herencia de la puerta vieja); para buscar por celular
--    hace falta el número entero, en dígitos.
alter table public.socios_historial add column if not exists celular text;

-- Búsqueda por celular sin recorrer la tabla. No es unique a propósito: el
-- que corta de verdad es codigo_hash, y un unique aquí haría fallar la
-- sincronización entera por un celular repetido en dos fichas.
create index if not exists socios_historial_celular_idx
  on public.socios_historial (celular);

-- 2. ESCRIBIR. El identificador (la llave de la fila) es la cédula si la
--    ficha la tiene, y si no, el celular. Así el cliente sin cédula por fin
--    SUBE a la nube — antes se saltaba con un continue y no existía.
create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item  jsonb;
  n     integer := 0;
  h     text;
  ident text;
  cel   text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    cel   := nullif(public.solo_digitos(item->>'telefono'), '');
    ident := coalesce(nullif(public.solo_digitos(item->>'cedula'), ''), cel);
    -- Sin cédula Y sin celular no hay con qué identificarlo: ese sí se salta.
    continue when ident is null;

    -- El día que a una ficha que subía por celular le carguen la cédula de
    -- verdad, su fila vieja (llave = celular) quedaría huérfana con datos
    -- congelados — y la búsqueda por celular podría devolver ESA en vez de
    -- la nueva. Se borra aquí, en la misma transacción que crea la buena.
    if cel is not null and cel <> ident then
      delete from public.socios_historial where cedula = cel;
    end if;

    h := public.huella_codigo(item->>'codigo');

    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, codigo_hash, actualizado_en)
    values (
      ident,
      cel,
      right(coalesce(cel, ''), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      now()
    )
    on conflict (cedula) do update
      set celular        = excluded.celular,
          tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          -- coalesce y no excluded a secas: sin código en el lote, se queda el
          -- que ya estaba. Pisarlo con null deja al cliente afuera sin aviso.
          codigo_hash    = coalesce(excluded.codigo_hash, socios_historial.codigo_hash),
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;

-- 3. LEER. Lo que el cliente teclea puede ser su cédula o su celular; se
--    busca por las dos columnas. El parámetro conserva el nombre p_cedula
--    para no romper la app ya publicada: la firma es un contrato.
create or replace function public.historial_socio_por_codigo(p_cedula text, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.socios_historial; ident text; h text;
begin
  ident := public.solo_digitos(p_cedula);

  if not public.puede_intentar(ident) then
    perform pg_sleep(0.3);
    return null;
  end if;

  h := public.huella_codigo(p_codigo);
  -- Un código con la forma mal puesta cuenta como fallo igual: si no, sería
  -- gratis tantear el largo.
  if h is null then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  -- order by + limit 1 y no un select a secas: si dos filas compartieran
  -- celular (dos fichas con el mismo número), un select into con dos filas
  -- se queda con una cualquiera; así se queda con la más recién subida.
  select * into r
    from public.socios_historial
   where (cedula = ident or celular = ident)
     and codigo_hash = h
   order by actualizado_en desc
   limit 1;

  if not found then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  perform public.limpiar_fallos(ident);
  return jsonb_build_object(
    'nombre',         r.nombre,
    'datos',          r.datos,
    'actualizado_en', r.actualizado_en
  );
end
$$;

-- 4. PEDIR. La misma puerta doble para la solicitud: sin esto, el cliente que
--    entra por celular VERÍA su cuenta pero el botón de pedir le fallaría en
--    silencio — la solicitud viaja en un catch vacío a propósito (para que una
--    solicitud que no sube no tumbe la pantalla), así que él vería «listo, te
--    respondemos» y a la bandeja de Joan no llegaría nada. El resto es copia
--    fiel de la versión del 10-ago: tope de 5 por hora, mismos campos.
create or replace function public.crear_solicitud_por_codigo(
  p_cedula text, p_codigo text, p_datos jsonb,
  p_producto text default 'quincenal', p_plazo integer default null)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.socios_historial; nuevo bigint; recientes integer; ident text;
        prod text; plazo integer; h text;
begin
  prod := coalesce(p_producto, 'quincenal');
  if prod not in ('quincenal', 'respaldado') then
    raise exception 'producto desconocido';
  end if;
  if prod = 'respaldado' then
    if p_plazo is null or p_plazo < 1 or p_plazo > 6 then
      raise exception 'plazo inválido';
    end if;
    plazo := p_plazo;
  else
    plazo := null;
  end if;

  ident := public.solo_digitos(p_cedula);

  if not public.puede_intentar(ident) then
    perform pg_sleep(0.3);
    return null;
  end if;

  h := public.huella_codigo(p_codigo);
  if h is null then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  select * into r
    from public.socios_historial
   where (cedula = ident or celular = ident)
     and codigo_hash = h
   order by actualizado_en desc
   limit 1;

  if not found then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  perform public.limpiar_fallos(ident);

  -- Y un tope de solicitudes por socio, para que nadie llene la bandeja de Joan.
  select count(*) into recientes
    from public.solicitudes
   where cedula = ident and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return null;
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, fecha_corte,
     garantia, cupo, sobre_cupo, producto, plazo_meses)
  values (
    ident,
    r.nombre,
    coalesce((p_datos->>'capital')::bigint, 0),
    coalesce((p_datos->>'tasa')::numeric, 0),
    coalesce((p_datos->>'costo')::bigint, 0),
    coalesce((p_datos->>'total')::bigint, 0),
    nullif(p_datos->>'fecha_corte', '')::date,
    nullif(p_datos->>'garantia', '')::bigint,
    nullif(p_datos->>'cupo', '')::bigint,
    coalesce((p_datos->>'sobre_cupo')::boolean, false),
    prod,
    plazo
  )
  returning id into nuevo;

  return nuevo;
end
$$;

-- Las funciones no cambian de permisos: ya venían con grant a anon del archivo
-- del 10-ago, y create or replace conserva los grants existentes.
