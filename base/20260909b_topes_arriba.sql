-- ===========================================================================
-- SUBEN LOS TOPES — 9 de septiembre de 2026 (tarde)
--
-- Va DESPUÉS de 20260909_una_sola_puerta.sql.
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «Queremos llegar a montos superiores a los 6 millones, entonces tanto
-- calculadora como los topes cámbialos, que el cliente sepa hasta cuánto puede
-- pedir a futuro.»
--
-- El cupo del perfil más alto pasó de 2.000.000 a 8.000.000 y el del de en
-- medio de 1.000.000 a 3.000.000 (app/creditos.js: PERFILES). Esta migración
-- sube el MISMO tope en el servidor, y no toca nada más de la función.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ NO BASTABA CON CAMBIARLO EN LA APP
--
-- play_solicitar tiene su propia reja, y con razón: la app se puede editar
-- desde el navegador de cualquiera, así que el tope que de verdad protege la
-- plata de Joan es este. Pero decía 2.000.000, y la app traduce su {ok:false} a
-- «No pudimos recibir la solicitud ahora, espera unos minutos».
--
-- O sea: sin esta migración, el cliente movía la calculadora a 3.000.000,
-- pedía, y le salía un error de CONEXIÓN que era mentira — el sistema le
-- echaba la culpa a su internet por un tope que pusimos nosotros. De los
-- errores posibles ese es el peor: el que manda a la persona a reintentar algo
-- que nunca va a funcionar.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO CAMBIA, Y HAY QUE DECIDIR APARTE
--
-- El plazo sigue siendo de 1 a 6 meses. A 8.000.000 en 6 cuotas la mensualidad
-- es de $1.418.933; a 6.000.000, de $1.064.200. La tasa está muy por debajo del
-- techo de usura (24% E.A. contra 29,24%), así que el freno no es legal: es que
-- esa cuota tiene que caberle a alguien. Si el producto va a prestar de verdad
-- esos montos, el plazo tiene que crecer con ellos — y eso es otra decisión,
-- con otra migración y con la letra legal de vuelta al abogado.
--
-- NOTA PARA QUIEN VENGA DESPUÉS: el cuerpo de abajo es el de
-- 20260828_correo_interno.sql, copiado tal cual salvo el número del tope. Se
-- copia entero porque `create or replace` reemplaza la función completa; si
-- alguien vuelve a escribirla de memoria en vez de leerla, se lleva por delante
-- el freno global, el conteo de solicitudes por hora y las columnas del insert.
-- ===========================================================================

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
  -- tugarantia.net. Ver la cabecera de esa migración.
  if correo not like '57%@tugarantia.net' then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  cel := substring(public.solo_digitos(split_part(correo, '@', 1)) from 3);

  -- 9-sep-2026 — EL TOPE SUBE DE 2.000.000 A 8.000.000. Es lo único que cambia
  -- en esta función. El mínimo se queda en 100.000: por debajo de ahí el costo
  -- se redondea a cero y la app publicaría una tasa efectiva del 0,00%, que es
  -- justo la mentira que se arregló el 4-sep.
  if p_capital is null or p_capital < 100000 or p_capital > 8000000
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

-- ------------------------------------------------------------- permisos
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto: se revoca a mano y se vuelve a conceder lo justo.
revoke all on function public.play_solicitar(bigint, integer) from public, anon, authenticated;
grant execute on function public.play_solicitar(bigint, integer) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------- comprobación
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'play_solicitar' and pronamespace = 'public'::regnamespace;
  if cuerpo is null then
    raise exception 'play_solicitar no existe: corre antes las migraciones anteriores';
  end if;
  if cuerpo like '%> 2000000%' then
    raise exception 'play_solicitar sigue rechazando por encima de 2.000.000';
  end if;
  if cuerpo not like '%> 8000000%' then
    raise exception 'play_solicitar no quedo con el tope nuevo';
  end if;
  -- Que no se haya perdido nada del cuerpo viejo al reemplazarlo.
  if cuerpo not like '%puede_intentar_tope%' then
    raise exception 'se perdio el freno global al reemplazar play_solicitar';
  end if;
  if cuerpo not like '%recientes >= 5%' then
    raise exception 'se perdio el limite de solicitudes por hora';
  end if;
  if cuerpo not like '%plazo_meses%' then
    raise exception 'se perdio el plazo en el insert de la solicitud';
  end if;
  if has_function_privilege('anon', 'public.play_solicitar(bigint, integer)', 'execute') then
    raise exception 'play_solicitar quedo abierta a anon: solo con sesion';
  end if;
end $$;
