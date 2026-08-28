-- ============================================================================
-- EL CORREO INTERNO CAMBIA DE DOMINIO — 28 de agosto de 2026
--
-- POR QUÉ. El registro abierto llevaba días ROTO y nadie lo sabía: la cuenta
-- del socio vive en Supabase Auth bajo un correo sintético construido con su
-- celular, y ese correo usaba el dominio 'socios.tugarantia.co' — que NO
-- EXISTE (y encima .co, cuando el de la casa es .net). Supabase valida el
-- dominio antes de crear la cuenta y devolvía `email_address_invalid`, así que
-- todo registro nuevo moría ahí, en silencio.
--
-- Medido llamando al signup de verdad el 28-ago:
--   @socios.tugarantia.co   -> email_address_invalid
--   @socios.tugarantia.net  -> email_address_invalid  (el subdominio tampoco existe)
--   @tugarantia.net         -> pasa la validación     (ese sí resuelve)
--
-- Esta migración alinea play_solicitar con app/cuenta.js. Es lo ÚNICO del lado
-- de la base que conocía el dominio: la función saca el celular veraz del
-- correo del JWT —nunca de user_metadata, que el propio usuario puede
-- reescribir— y para eso tiene que saber con qué dominio compararlo.
--
-- Nadie se queda afuera: se comprobó en auth.users que había CERO cuentas con
-- el dominio viejo, precisamente porque ninguna se pudo crear jamás.
--
-- Idempotente. Se corre entero en el SQL Editor.
-- ============================================================================

create or replace function public.play_solicitar(p_capital bigint, p_meses integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  correo    text;
  cel       text;
  recientes integer;
begin
  correo := coalesce(auth.jwt() ->> 'email', '');
  -- 28-ago-2026: el dominio pasó de socios.tugarantia.co (inexistente) a
  -- tugarantia.net. Ver la cabecera de esta migración.
  if correo not like '57%@tugarantia.net' then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  cel := substring(public.solo_digitos(split_part(correo, '@', 1)) from 3);

  if p_capital is null or p_capital < 100000 or p_capital > 2000000
     or p_meses is null or p_meses < 1 or p_meses > 6 then
    return jsonb_build_object('ok', false);
  end if;

  if not public.puede_intentar_tope('psol:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  select count(*) into recientes
    from public.solicitudes
   where cedula = cel and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, producto, plazo_meses)
  values (
    cel,
    left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', 'Registrado')), 80),
    p_capital, 0, 0, 0, 'respaldado', p_meses
  );

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.play_solicitar(bigint, integer) from public, anon, authenticated;
grant execute on function public.play_solicitar(bigint, integer) to authenticated;

notify pgrst, 'reload schema';
