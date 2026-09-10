-- ===========================================================================
-- LAS FOTOS DEL REGISTRO Y LA HUELLA DEL APARATO
-- 8 de septiembre de 2026 (noche). Va DESPUÉS de 20260908_primer_credito.sql.
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «No me pidió que me tomara la foto facial y la foto de mi cédula por las dos
-- caras… que únicamente tomando la foto de la cédula el sistema rellene los
-- datos… que al tomar la foto facial parezca que escanea la cara… que mi CRM
-- pueda identificar un porcentaje de parecido con la foto de la cédula… que el
-- CRM me permita ver desde qué celular usa la página o la IP… y que la
-- ubicación quede registrada automáticamente.»
--
-- POR QUÉ UNA TABLA APARTE. registrar_abierto recorta cada dato a 200
-- caracteres y listar_registros trae 200 filas de una: tres fotos por fila
-- serían decenas de megas en cada «Traer de la nube». Las fotos viven aquí, se
-- suben DESPUÉS de crear la cuenta (con la sesión, así nadie sube fotos a
-- nombre de otro celular) y el CRM las pide una por una, cuando Joan abre esa
-- persona.
--
-- LA HUELLA. La dirección IP y el aparato NO los manda el teléfono (se
-- falsifican en un segundo): los lee la base de las cabeceras de la petición,
-- que pone PostgREST. Lo único que manda el teléfono es el punto GPS, y solo si
-- la persona lo autorizó (dato sensible, Ley 1581: casilla aparte y opcional;
-- está en legal/privacidad.html desde el 24-ago).
-- ===========================================================================

alter table public.registros add column if not exists huella jsonb;

create table if not exists public.registro_archivos (
  id         bigint generated always as identity primary key,
  celular    text        not null,
  tipo       text        not null,      -- cedula_frente | cedula_reverso | selfie
  imagen     text        not null,      -- data:image/jpeg;base64,… (comprimida en el teléfono)
  creado_en  timestamptz not null default now(),
  unique (celular, tipo)
);
create index if not exists registro_archivos_por_celular on public.registro_archivos (celular);
alter table public.registro_archivos enable row level security;
revoke all on table public.registro_archivos from public, anon, authenticated;

-- El teléfono sube sus fotos (con sesión) y su huella. Una foto de más de
-- ~400 KB no entra: la app las comprime a ~900 px, y si algo llega más grande
-- es que no vino de la app.
create or replace function public.registro_archivos_guardar(p_archivos jsonb, p_huella jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel     text;
  k       text;
  v       text;
  cab     jsonb;
  huella  jsonb;
  n       integer := 0;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_archivos, '{}'::jsonb)) loop
    if k not in ('cedula_frente', 'cedula_reverso', 'selfie') then continue; end if;
    if v is null or v not like 'data:image/%' or length(v) > 600000 then continue; end if;
    insert into public.registro_archivos (celular, tipo, imagen)
    values (cel, k, v)
    on conflict (celular, tipo) do update set imagen = excluded.imagen, creado_en = now();
    n := n + 1;
  end loop;

  -- La huella: lo que dice la petición (no el teléfono) más el GPS autorizado.
  begin
    cab := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  exception when others then
    cab := '{}'::jsonb;
  end;
  huella := jsonb_build_object(
    'ip',      left(coalesce(cab ->> 'x-forwarded-for', cab ->> 'x-real-ip', ''), 80),
    'aparato', left(coalesce(cab ->> 'user-agent', ''), 300),
    'momento', now()
  );
  if p_huella ? 'gps' then
    huella := huella || jsonb_build_object('gps', p_huella -> 'gps');
  end if;
  if p_huella ? 'cedula_leida' then
    huella := huella || jsonb_build_object('cedula_leida', p_huella -> 'cedula_leida');
  end if;
  update public.registros
     set huella = coalesce(huella, '{}'::jsonb) || huella
   where id = (select id from public.registros
                where right(public.solo_digitos(telefono), 10) = right(cel, 10)
                order by creado_en desc limit 1);

  return jsonb_build_object('ok', true, 'fotos', n);
end
$$;

-- Joan pide las fotos de UNA persona, cuando la abre.
create or replace function public.archivos_de_registro(p_clave text, p_celular text)
returns jsonb
language plpgsql
/* VOLÁTIL A PROPÓSITO, y no se le puede poner «stable»: esta función pasa por
   clave_ok, que ESCRIBE el freno contra la fuerza bruta. PostgREST corre las
   «stable» en transacción de solo lectura y revientan con 25006 antes de mirar
   la clave — o sea que no sirven nunca. Lo estuvo desde el 8-sep-2026. */
security definer
set search_path = public
as $$
declare r jsonb; h jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select coalesce(jsonb_object_agg(tipo, imagen), '{}'::jsonb) into r
    from public.registro_archivos
   where right(public.solo_digitos(celular), 10) = right(public.solo_digitos(p_celular), 10);
  select huella into h from public.registros
   where right(public.solo_digitos(telefono), 10) = right(public.solo_digitos(p_celular), 10)
   order by creado_en desc limit 1;
  -- Las fotos y la huella juntas: la ficha nace con todo de una llamada.
  return jsonb_build_object('fotos', r, 'huella', h);
end
$$;

-- ------------------------------------------------------------- permisos
revoke all on function public.registro_archivos_guardar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.registro_archivos_guardar(jsonb, jsonb) to authenticated;
revoke all on function public.archivos_de_registro(text, text)          from public, anon, authenticated;
grant execute on function public.archivos_de_registro(text, text)       to anon;

notify pgrst, 'reload schema';

do $$
begin
  if has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute') then
    raise exception 'registro_archivos_guardar sigue abierta a anon';
  end if;
  if not has_function_privilege('anon', 'public.archivos_de_registro(text, text)', 'execute') then
    raise exception 'archivos_de_registro no es llamable con la llave pública';
  end if;
  if exists (select 1 from information_schema.table_privileges
              where table_name = 'registro_archivos' and grantee in ('anon', 'authenticated')) then
    raise exception 'la tabla de fotos quedó abierta';
  end if;
end $$;
