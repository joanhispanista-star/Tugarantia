-- 22-sep-2026 — EL CRÉDITO A LA MEDIDA Y LA AYUDA SIN WHATSAPP
--
-- Joan, el 21-sep: «al momento de pedir el credito deja que el cliente pida lo
-- que el quiera, y que despues yo pueda desde mi crm ver lo que quiere el
-- cliente, despues yo envio la contrapropuesta»; y «no quiero que me escriban
-- por whatsapp, desde el chat de la plataforma».
--
-- DOS COSAS, Y LA SEGUNDA EXISTE SOLO POR LA PRIMERA:
--
-- 1. El pedido del cliente se guarda APARTE de la propuesta. Hoy play_solicitar
--    metía lo que el cliente pedía en «capital» y ya; si Joan contrapropone otra
--    cifra, la original se perdía y nadie podía comparar. Ahora quedan las dos:
--    pedido_monto/pedido_plazo/pedido_nota es lo que pidió, y capital/plazo_meses
--    sigue siendo la línea con la que trabaja el CRM. Nada se auto-aprueba: esto
--    es una petición, no un crédito.
--
-- 2. «Olvidé mi contraseña» hoy abre el WhatsApp de Joan. Quitar ese enlace sin
--    poner otra cosa dejaría un botón muerto, y el que olvidó la contraseña NO
--    puede usar el chat de la app: el chat pide sesión y él justamente no puede
--    entrar. Por eso esta tabla. Es el único punto del sistema donde alguien sin
--    sesión escribe, así que va con freno, sin política de RLS (se entra solo
--    por la función) y guardando lo mínimo: un celular y una nota corta.
--
-- LO QUE NO HACE, y hay que decirlo: no manda ningún aviso a Joan. La fila queda
-- en la bandeja y el CRM la tiene que mostrar. Si el CRM no la muestra, esto es
-- un buzón que nadie abre — peor que el WhatsApp. El pantallazo del CRM va en el
-- mismo trabajo que esta migración, no después.

-- ===================== 1. EL PEDIDO DEL CLIENTE =====================

alter table public.solicitudes
  add column if not exists pedido_monto bigint,
  add column if not exists pedido_plazo integer,
  add column if not exists pedido_nota  text;

comment on column public.solicitudes.pedido_monto is
  'Lo que el cliente pidio, tal cual. No es lo aprobado: eso vive en contrapropuesta.';
comment on column public.solicitudes.pedido_nota is
  'Para que lo quiere, en sus palabras. Lo escribe el cliente; el CRM lo muestra escapado.';

-- Las funciones que leen solicitudes devuelven la fila entera (to_jsonb(s) y
-- setof public.solicitudes), asi que las columnas nuevas llegan al CRM y a la
-- app sin tocarlas. Lo unico que hace falta es recargar el esquema.

-- ===================== 2. PEDIR LO QUE UNO QUIERA =====================

-- Cambia la firma (entra p_nota), asi que hay que soltar la vieja: si quedaran
-- las dos, PostgREST no sabria a cual llamar.
drop function if exists public.play_solicitar(bigint, integer);

create or replace function public.play_solicitar(
  p_capital bigint,
  p_meses   integer,
  p_nota    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  correo    text;
  cel       text;
  recientes integer;
  nota      text;
begin
  correo := coalesce(auth.jwt() ->> 'email', '');
  if correo not like '57%@tugarantia.net' then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;
  cel := substring(public.solo_digitos(split_part(correo, '@', 1)) from 3);

  -- 22-sep-2026 — EL TOPE SUBE DE 8.000.000 A 50.000.000 y el piso baja a
  -- 50.000. No es que se preste eso: es que esto es una PETICION y el cliente
  -- pide lo que quiera, que fue lo que Joan pidio. El tope de arriba no
  -- desaparece del todo a proposito: sin ningun limite, un dedo torpe guarda
  -- 999.999.999.999 y esa cifra sale en la bandeja como si fuera en serio.
  --
  -- Y cada rechazo dice POR QUE. Antes los cuatro devolvian {ok:false} pelado y
  -- la app solo podia decir «no se pudo», que es la pantalla mintiendo por
  -- omision.
  if p_capital is null or p_capital < 50000 then
    return jsonb_build_object('ok', false, 'motivo', 'minimo', 'minimo', 50000);
  end if;
  if p_capital > 50000000 then
    return jsonb_build_object('ok', false, 'motivo', 'maximo', 'maximo', 50000000);
  end if;
  if p_meses is null or p_meses < 1 or p_meses > 6 then
    return jsonb_build_object('ok', false, 'motivo', 'plazo');
  end if;

  if not public.puede_intentar_tope('psol:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'ocupado');
  end if;

  select count(*) into recientes
    from public.solicitudes
   where cedula = cel and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  nota := nullif(left(btrim(coalesce(p_nota, '')), 300), '');

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, producto, plazo_meses,
     pedido_monto, pedido_plazo, pedido_nota)
  values (
    cel,
    left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', 'Registrado')), 80),
    p_capital, 0, 0, 0, 'respaldado', p_meses,
    p_capital, p_meses, nota
  );

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.play_solicitar(bigint, integer, text) from public, anon, authenticated;
grant  execute on function public.play_solicitar(bigint, integer, text) to authenticated;

-- ===================== 3. LA AYUDA SIN WHATSAPP =====================

create table if not exists public.ayudas_clave (
  id        bigserial primary key,
  celular   text not null,
  nota      text,
  estado    text not null default 'nueva',
  creada_en timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ayudas_clave_estado_valido') then
    alter table public.ayudas_clave
      add constraint ayudas_clave_estado_valido
      check (estado in ('nueva', 'atendida', 'descartada'));
  end if;
end $$;

create index if not exists ayudas_clave_nuevas on public.ayudas_clave (creada_en desc)
  where estado = 'nueva';

-- RLS SIN NINGUNA POLITICA, a proposito y como en reputation_events: asi la
-- llave publica no puede leer ni escribir la tabla ni por error. Se entra por
-- las funciones de abajo, que corren como duenas.
alter table public.ayudas_clave enable row level security;

create or replace function public.pedir_ayuda_clave(p_celular text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare cel text; nota text; recientes integer;
begin
  cel := public.solo_digitos(coalesce(p_celular, ''));
  if length(cel) <> 10 or left(cel, 1) <> '3' then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;

  -- El mismo freno que usa el resto de la casa. Sin esto, la unica puerta sin
  -- sesion del sistema es tambien la mas facil de llenar de basura.
  if not public.puede_intentar(cel) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  select count(*) into recientes
    from public.ayudas_clave
   where celular = cel and creada_en > now() - interval '1 hour';
  if recientes >= 3 then
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  nota := nullif(left(btrim(coalesce(p_nota, '')), 300), '');
  insert into public.ayudas_clave (celular, nota) values (cel, nota);
  perform public.anotar_fallo(cel);
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.listar_ayudas_clave(p_clave text, p_estado text default 'nueva')
returns setof public.ayudas_clave
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;
  return query
    select * from public.ayudas_clave
     where estado = coalesce(p_estado, 'nueva')
     order by creada_en desc
     limit 200;
end
$$;

create or replace function public.marcar_ayuda_clave(p_clave text, p_id bigint, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;
  if p_estado not in ('nueva', 'atendida', 'descartada') then
    return jsonb_build_object('ok', false, 'motivo', 'estado');
  end if;
  update public.ayudas_clave set estado = p_estado where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no existe'); end if;
  return jsonb_build_object('ok', true);
end
$$;

-- pedir_ayuda_clave es la UNICA que se le da a anon, y es deliberado: el que
-- olvido la contrasena no tiene sesion. Las otras dos son de Joan y van con su
-- clave, igual que el resto de la bandeja.
revoke all on function public.pedir_ayuda_clave(text, text)              from public, anon, authenticated;
grant  execute on function public.pedir_ayuda_clave(text, text)          to anon, authenticated;
revoke all on function public.listar_ayudas_clave(text, text)            from public, anon, authenticated;
grant  execute on function public.listar_ayudas_clave(text, text)        to anon;
revoke all on function public.marcar_ayuda_clave(text, bigint, text)     from public, anon, authenticated;
grant  execute on function public.marcar_ayuda_clave(text, bigint, text) to anon;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Se corren solas. Y no comprueban que la funcion EXISTA —eso ya lo sabiamos el
-- dia que el cuerpo con «huella» se creo bien y se rompio al primer uso—, sino
-- que diga lo que tiene que decir y que los permisos quedaran donde van.
do $$
declare cuerpo text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes'
                    and column_name = 'pedido_monto') then
    raise exception 'no quedo pedido_monto en solicitudes';
  end if;

  if exists (select 1 from pg_proc
              where proname = 'play_solicitar' and pronamespace = 'public'::regnamespace
                and pronargs = 2) then
    raise exception 'quedo la play_solicitar vieja de dos argumentos: PostgREST no sabria a cual llamar';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'play_solicitar' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%pedido_monto%' then
    raise exception 'play_solicitar no guarda lo que pidio el cliente';
  end if;
  if cuerpo not like '%50000000%' then
    raise exception 'play_solicitar no subio el tope: el cliente sigue sin poder pedir lo que quiera';
  end if;
  if cuerpo not like '%minimo%' then
    raise exception 'play_solicitar sigue rechazando sin decir por que';
  end if;

  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'ayudas_clave' and c.relrowsecurity) then
    raise exception 'ayudas_clave quedo SIN row level security';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ayudas_clave') then
    raise exception 'ayudas_clave tiene politicas: se entra solo por las funciones';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'pedir_ayuda_clave' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%puede_intentar%' then
    raise exception 'pedir_ayuda_clave no tiene freno y es la unica puerta sin sesion';
  end if;

  if not has_function_privilege('anon', 'public.pedir_ayuda_clave(text, text)', 'execute') then
    raise exception 'pedir_ayuda_clave no es llamable sin sesion, que es justo para lo que existe';
  end if;
  if has_function_privilege('anon', 'public.play_solicitar(bigint, integer, text)', 'execute') then
    raise exception 'play_solicitar quedo abierta sin sesion';
  end if;
  if not has_function_privilege('authenticated', 'public.play_solicitar(bigint, integer, text)', 'execute') then
    raise exception 'play_solicitar no es llamable con sesion';
  end if;
end $$;
