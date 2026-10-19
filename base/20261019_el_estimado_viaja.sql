-- ===========================================================================
-- EL ESTIMADO VIAJA CON LO QUE SE PIDIÓ — 19 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces. Va DESPUÉS de
-- base/20261008_condiciones_aceptadas.sql (usa solicitar_a_la_medida y la
-- columna pedido). Después: Settings → API → «Reload schema», y pega
-- base/20261019b_el_estimado_comprobar.sql para ver, renglón por renglón, que
-- quedó puesto DE VERDAD. Mándale a Claude la tabla.
--
-- MIENTRAS NO SE CORRA, NO SE ROMPE NADA: la app pide igual (este archivo no
-- toca solicitar_a_la_medida), el cliente ve su estimado igual, y el CRM
-- simplemente no dice «el cliente vio un estimado», porque no tiene cómo
-- saberlo. Lo que se pierde es el aviso a Joan.
--
-- ---------------------------------------------------------------------------
-- LO QUE PASÓ Y LO QUE DECIDIÓ JOAN
--
-- William pidió 300.000 desde la app y no vio cuánto le tocaba pagar: la
-- calculadora decía «el costo exacto te lo mandamos en la propuesta» y nada
-- más. Joan decidió hoy: «deja un estimado del 2%» (al mes) y «que no pase el
-- nivel de usura». La cifra se calcula y se mide contra el techo en
-- app/calculadora-solicitud.js (estimadoDelCosto). 300.000 a 30 días: 6.000.
--
-- Y para que no se vuelva un engaño, el estimado tiene que llegarle a Joan:
-- si le propone 60.000 a quien vio 6.000, el CRM se lo dice ANTES de mandar.
--
-- ---------------------------------------------------------------------------
-- QUÉ TRAE: UNA función NUEVA, anotar_estimado(p_id, p_estimado).
--
-- POR QUÉ APARTE y no un cuarto parámetro de solicitar_a_la_medida: esa
-- función está viva y no se reescribe (copiar su cuerpo pisaría lo que otra
-- migración le haya cambiado), y una sobrecarga con el mismo nombre deja a
-- PostgREST escogiendo entre dos firmas. La app llama primero a pedir —que
-- funciona con o sin este archivo— y después, si pedir salió bien, a esta.
--
-- Lo que COMPRUEBA, porque el estimado lo manda el teléfono (es su palabra,
-- como `vio` en aceptar_condiciones):
--   · que la solicitud sea de ESTA cuenta, de play/, y esté esperando la
--     propuesta de Joan ('nueva', sin contrapropuesta). Con propuesta ya no
--     hay nada que estimar;
--   · que el estimado sea de ESTE pedido: el mismo monto y la misma fecha de
--     pago que la base tiene en `pedido`. Uno de un pedido anterior no entra;
--   · que no pase el 2% de Joan prorrateado por días (con un día de holgura
--     por el reloj del teléfono), que el total sea capital + costo y que la
--     tasa, si viene, esté entre 0 y el 2%. Un estimado inflado haría que el
--     CRM no avisara nunca; uno por debajo solo hace avisar de más.
--   · UNA VEZ POR PEDIDO: si ya hay estimado, no se reescribe. Pedir otra vez
--     (solicitar_a_la_medida, «cambiada») rehace `pedido` entero y el estimado
--     viejo se va con él; la app manda el nuevo.
-- El MOMENTO lo pone la base (now()), no el teléfono.
--
-- Lo que guarda: pedido.estimado = {costo, total, tasa, cuando, version}.
-- listar_solicitudes_abiertas ya devuelve `pedido` entero: el CRM lo lee sin
-- tocar nada más.
--
-- LO QUE NO HACE: no pone precio, no propone, no aprueba. El estimado no es la
-- oferta: la oferta es la propuesta de Joan, con sus condiciones.
--
-- NUNCA `raise exception` después de la sección 0: el editor corre el archivo
-- en una transacción y eso deshace todo. Lo que falle se dice con FALLA.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.solicitar_a_la_medida(bigint, date, text)') is null then
    raise exception 'Falta base/20261008_condiciones_aceptadas.sql (solicitar_a_la_medida). Córrelo primero.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.hoy_bogota(timestamptz)') is null
     or to_regprocedure('public.solicitud_de_la_cuenta(text, timestamptz)') is null then
    raise exception 'Faltan celular_de_sesion, hoy_bogota o solicitud_de_la_cuenta (20260908, 20261005, 20261007). Córrelos primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'pedido') then
    raise exception 'A solicitudes le falta la columna pedido (20260922_a_la_medida_y_ayuda.sql). Córrela primero.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. ANOTAR EL ESTIMADO
--
-- El 2% (0.02) es TASA_ESTIMADO_MENSUAL de app/calculadora-solicitud.js; una
-- prueba compara los dos números para que no se separen. La cuenta es la
-- misma: capital × 2% × días / 30, redondeada al peso.
-- ---------------------------------------------------------------------------
create or replace function public.anotar_estimado(p_id bigint, p_estimado jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  cel     text;
  s       public.solicitudes;
  v_cap   numeric;
  v_costo numeric;
  v_total numeric;
  v_tasa  numeric;
  v_dias  integer;
  v_max   numeric;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;

  -- La forma: números donde van números. jsonb_typeof de una llave que no
  -- está da NULL, y «NULL <> 'number'» no es verdad: por eso el coalesce.
  if p_id is null or p_estimado is null or jsonb_typeof(p_estimado) <> 'object'
     or coalesce(jsonb_typeof(p_estimado -> 'capital'), '') <> 'number'
     or coalesce(jsonb_typeof(p_estimado -> 'costo'), '') <> 'number'
     or coalesce(jsonb_typeof(p_estimado -> 'total'), '') <> 'number'
     or coalesce(jsonb_typeof(p_estimado -> 'fecha_pago'), '') <> 'string'
     or coalesce(jsonb_typeof(p_estimado -> 'tasa'), 'number') <> 'number' then
    return jsonb_build_object('ok', false, 'motivo', 'estimado');
  end if;
  v_cap   := (p_estimado ->> 'capital')::numeric;
  v_costo := (p_estimado ->> 'costo')::numeric;
  v_total := (p_estimado ->> 'total')::numeric;
  v_tasa  := (p_estimado ->> 'tasa')::numeric;

  -- La de ESTA cuenta (nada de antes de abrirla), bajo candado: si pedir otra
  -- vez está cambiando la fila, se espera y se compara con lo que quedó.
  select * into s from public.solicitudes
   where id = p_id and cedula = cel and app = 'tugarantia'
     and public.solicitud_de_la_cuenta(cel, creada_en)
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuya');
  end if;
  if s.estado <> 'nueva' or s.contrapropuesta is not null
     or s.pedido is null or jsonb_typeof(s.pedido) <> 'object'
     or coalesce(s.pedido ->> 'origen', '') <> 'play' then
    return jsonb_build_object('ok', false, 'motivo', 'no_aplica');
  end if;
  if s.pedido ? 'estimado' then
    return jsonb_build_object('ok', true, 'ya_estaba', true);
  end if;

  -- De ESTE pedido: el mismo monto y la misma fecha que tiene la base.
  if v_cap <> coalesce((s.pedido ->> 'capital')::numeric, -1)
     or (p_estimado ->> 'fecha_pago') is distinct from (s.pedido ->> 'fecha_pago') then
    return jsonb_build_object('ok', false, 'motivo', 'otro_pedido');
  end if;

  -- Las cifras: enteras, el total cuadra, y no pasa el 2% de Joan. Un día de
  -- holgura porque los días los contó el teléfono con SU fecha.
  v_dias := (s.pedido ->> 'fecha_pago')::date - public.hoy_bogota();
  v_max  := round(v_cap * 0.02 * (greatest(v_dias, 0) + 1) / 30.0);
  if v_costo <> trunc(v_costo) or v_total <> trunc(v_total)
     or v_costo < 1 or v_costo > v_max
     or v_total <> v_cap + v_costo
     or (v_tasa is not null and (v_tasa <= 0 or v_tasa > 0.02)) then
    return jsonb_build_object('ok', false, 'motivo', 'estimado');
  end if;

  update public.solicitudes
     set pedido = s.pedido || jsonb_build_object('estimado', jsonb_build_object(
           'costo', v_costo::bigint, 'total', v_total::bigint, 'tasa', v_tasa,
           'cuando', now(),
           'version', left(coalesce(p_estimado ->> 'version', ''), 20)))
   where id = s.id;

  return jsonb_build_object('ok', true);
end
$$;


-- ---------------------------------------------------------------------------
-- 2. LOS PERMISOS
--
-- Supabase le da EXECUTE a anon y authenticated a CADA función nueva: primero
-- se les quita a todos y después se da solo lo que toca. Con sesión; nunca
-- con la llave pública sola.
-- ---------------------------------------------------------------------------
revoke all on function public.anotar_estimado(bigint, jsonb) from public, anon, authenticated;
grant  execute on function public.anotar_estimado(bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. LO QUE SE COMPRUEBA SOLO (sin raise exception: ver la cabecera)
--
-- Se prueba LLAMANDO —una función PL/pgSQL no se compila del todo hasta la
-- primera llamada, y ya hubo una migración «verde» rota por eso—, con un
-- celular de mentira que no es de nadie, y se borra todo lo que se creó. Si
-- el número existe en la base, la prueba no corre.
-- ---------------------------------------------------------------------------
do $prueba$
declare
  v_cel  text := '3009991019';
  j      jsonb;
  v_id   bigint;
  v_f    text;
  est    jsonb;
  pasos  text := '';
begin
  if exists (select 1 from public.solicitudes where cedula = v_cel or celular = v_cel)
     or exists (select 1 from public.registros where right(public.solo_digitos(coalesce(telefono, '')), 10) = v_cel) then
    raise notice 'Estimado: el celular de prueba % ya existe en la base; la prueba no corre.', v_cel;
    return;
  end if;

  begin
    perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);

    j := public.solicitar_a_la_medida(300000, public.hoy_bogota() + 30, null);
    v_id := (j -> 'solicitud' ->> 'id')::bigint;
    v_f  := to_char(public.hoy_bogota() + 30, 'YYYY-MM-DD');
    est  := jsonb_build_object('version', '2026-10-19', 'capital', 300000, 'fecha_pago', v_f,
                               'costo', 6000, 'total', 306000, 'tasa', 0.02, 'ea', 0.272434, 'techo', 0.2859);

    j := public.anotar_estimado(v_id, est || jsonb_build_object('costo', 60000, 'total', 360000));
    if j ->> 'motivo' = 'estimado'
       and not ((select pedido from public.solicitudes where id = v_id) ? 'estimado') then
      pasos := pasos || '1 no-pasa-el-2; ';
    else raise notice 'FALLA 1: aceptó un estimado diez veces el 2%%: %', j; end if;

    j := public.anotar_estimado(v_id, est || jsonb_build_object('capital', 500000, 'total', 506000));
    if j ->> 'motivo' = 'otro_pedido' then pasos := pasos || '2 de-este-pedido; ';
    else raise notice 'FALLA 2: aceptó el estimado de otro monto: %', j; end if;

    j := public.anotar_estimado(v_id, est);
    if j ->> 'ok' = 'true'
       and ((select pedido from public.solicitudes where id = v_id) -> 'estimado' ->> 'costo')::bigint = 6000
       and ((select pedido from public.solicitudes where id = v_id) -> 'estimado' ->> 'cuando') is not null then
      pasos := pasos || '3 anota; ';
    else raise notice 'FALLA 3: no anotó el estimado bueno: %', j; end if;

    j := public.anotar_estimado(v_id, est || jsonb_build_object('costo', 5000, 'total', 305000));
    if j ->> 'ya_estaba' = 'true'
       and ((select pedido from public.solicitudes where id = v_id) -> 'estimado' ->> 'costo')::bigint = 6000 then
      pasos := pasos || '4 una-vez; ';
    else raise notice 'FALLA 4: el estimado se reescribió: %', j; end if;

    -- Pedir otra vez rehace el pedido: el estimado viejo se va con él.
    j := public.solicitar_a_la_medida(450000, public.hoy_bogota() + 15, null);
    if j ->> 'cambiada' = 'true'
       and not ((select pedido from public.solicitudes where id = v_id) ? 'estimado') then
      pasos := pasos || '5 pedir-otra-vez-lo-borra; ';
    else raise notice 'FALLA 5: el estimado viejo se quedó en el pedido nuevo: %', j; end if;

    -- Otra cuenta no anota en lo ajeno.
    perform set_config('request.jwt.claims', '{"email":"573009991020@tugarantia.net","role":"authenticated"}', true);
    j := public.anotar_estimado(v_id, jsonb_build_object('capital', 450000,
           'fecha_pago', to_char(public.hoy_bogota() + 15, 'YYYY-MM-DD'), 'costo', 4500, 'total', 454500));
    if j ->> 'ok' = 'false' then pasos := pasos || '6 lo-ajeno-no; ';
    else raise notice 'FALLA 6 GRAVE: otra cuenta anotó en una solicitud ajena: %', j; end if;
    perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);

    -- Con propuesta de Joan ya no hay nada que estimar.
    update public.solicitudes set contrapropuesta = '{"capital":450000}'::jsonb where id = v_id;
    j := public.anotar_estimado(v_id, jsonb_build_object('capital', 450000,
           'fecha_pago', to_char(public.hoy_bogota() + 15, 'YYYY-MM-DD'), 'costo', 4500, 'total', 454500));
    if j ->> 'motivo' = 'no_aplica' then pasos := pasos || '7 con-propuesta-no; ';
    else raise notice 'FALLA 7: anotó sobre una solicitud que ya tiene propuesta: %', j; end if;

  exception when others then
    raise notice 'FALLA: la prueba se cayó en la mitad: % (%)', sqlerrm, sqlstate;
  end;

  perform set_config('request.jwt.claims', '', true);
  delete from public.solicitudes where cedula = v_cel or celular = v_cel;
  raise notice 'Estimado: %', pasos;
end
$prueba$;
