-- ============================================================================
-- EL CÓDIGO PROPIO — 20 de agosto de 2026 (segunda migración del día)
--
-- Pedido de Joan con el primer cliente real adentro: que el socio pueda
-- ponerse la clave que quiera. Mantiene la forma de siempre (5 letras y
-- números, la del motor): sigue siendo "tu código", solo que ahora es SUYO.
--
-- LA CONSECUENCIA QUE ESTA MIGRACIÓN ADMINISTRA: el Panel de Joan guarda los
-- códigos EN CLARO y los sube con cada sincronización. Si el socio se cambia
-- el suyo y la siguiente subida lo pisara con el viejo, el socio quedaría
-- afuera sin aviso y creyendo que su clave nueva "no sirve". Por eso nace
-- codigo_propio: cuando el socio se puso su clave, la sincronización NO la
-- toca — salvo que Joan use «Cambiar» en la ficha (codigo_forzar), que es el
-- rescate para el socio que la perdió.
--
-- Se corre DESPUÉS de 20260820_entrada_por_celular.sql (usa la columna
-- celular). Idempotente: correrla dos veces no hace daño.
-- ============================================================================

alter table public.socios_historial
  add column if not exists codigo_propio boolean not null default false;

-- 1. EL SOCIO CAMBIA SU CÓDIGO. Exige el actual (misma puerta y mismo freno
--    de intentos que entrar), guarda solo la huella del nuevo, y marca
--    codigo_propio para que la sincronización lo respete.
create or replace function public.cambiar_codigo_acceso(
  p_identificador text, p_codigo_actual text, p_codigo_nuevo text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.socios_historial; ident text; h_actual text; h_nuevo text;
begin
  ident := public.solo_digitos(p_identificador);

  if not public.puede_intentar(ident) then
    perform pg_sleep(0.3);
    return false;
  end if;

  h_actual := public.huella_codigo(p_codigo_actual);
  if h_actual is null then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return false;
  end if;

  select * into r
    from public.socios_historial
   where (cedula = ident or celular = ident)
     and codigo_hash = h_actual
   order by actualizado_en desc
   limit 1;

  if not found then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return false;
  end if;

  -- El actual era correcto: de aquí en adelante los fallos no se cobran.
  perform public.limpiar_fallos(ident);

  h_nuevo := public.huella_codigo(p_codigo_nuevo);
  -- Forma inválida o el mismo código de siempre: no es un ataque, es un
  -- dedazo. Se devuelve false sin anotar fallo y la app lo explica.
  if h_nuevo is null or h_nuevo = h_actual then
    return false;
  end if;

  update public.socios_historial
     set codigo_hash   = h_nuevo,
         codigo_propio = true
   where cedula = r.cedula;

  return true;
end
$$;

grant execute on function public.cambiar_codigo_acceso(text, text, text) to anon;

-- 2. LA SINCRONIZACIÓN RESPETA EL CÓDIGO PROPIO. Idéntica a la de
--    20260820_entrada_por_celular.sql salvo el trato del codigo_hash:
--    · codigo_propio y sin forzar  → se queda el del socio.
--    · item con codigo_forzar      → Joan usó «Cambiar»: pisa y desmarca.
--    · lo demás                    → como siempre (coalesce, nunca null).
create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item   jsonb;
  n      integer := 0;
  h      text;
  ident  text;
  cel    text;
  forzar boolean;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    cel    := nullif(public.solo_digitos(item->>'telefono'), '');
    ident  := coalesce(nullif(public.solo_digitos(item->>'cedula'), ''), cel);
    forzar := coalesce((item->>'codigo_forzar')::boolean, false);
    continue when ident is null;

    if cel is not null and cel <> ident then
      delete from public.socios_historial where cedula = cel;
    end if;

    h := public.huella_codigo(item->>'codigo');

    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, codigo_hash, codigo_propio, actualizado_en)
    values (
      ident,
      cel,
      right(coalesce(cel, ''), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      false,
      now()
    )
    on conflict (cedula) do update
      set celular        = excluded.celular,
          tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          codigo_hash    = case
            when forzar then coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
            when socios_historial.codigo_propio then socios_historial.codigo_hash
            else coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
          end,
          codigo_propio  = case when forzar then false else socios_historial.codigo_propio end,
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;
