-- ===========================================================================
-- PEDIR LO QUE UNO QUIERA, Y ACEPTAR LAS CONDICIONES DE ESE CRÉDITO
-- 8 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces. Después: Settings → API → «Reload schema», y
-- pega base/20261008b_condiciones_comprobar.sql para ver, renglón por renglón,
-- que quedó puesto DE VERDAD.
-- Va DESPUÉS de las del 7-oct (20261007_una_puerta.sql y 20261007c): usa
-- solicitud_de_la_cuenta y el disparador de las solicitudes que dejaron ahí.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «Cuando le di solicitar crédito no me dejó solicitar lo que yo quería ni el
-- plazo que quería. El cliente puede pedir lo que quiera y yo soy el encargado
-- de darle una contrapropuesta.» Y: «al momento de la contrapropuesta que se
-- le muestren los términos y condiciones de ese crédito en específico».
--
-- QUÉ TRAE, en tres piezas NUEVAS (no se reescribe ninguna función viva):
--
--   1. solicitar_a_la_medida(p_capital, p_fecha_pago, p_nota). El cliente de
--      play/ pide un monto y UNA FECHA DE PAGO (el día del calendario que
--      escogió, no «en N días»: leído mañana serían otros días). La solicitud
--      nace 'nueva', SIN propuesta automática: la propuesta la pone Joan desde
--      la bandeja del CRM («✏️ Proponer»). Lo pedido queda en `pedido` (con
--      origen 'play'), en pedido_monto y en pedido_nota, aparte de lo que se
--      le proponga. Hasta hoy play/ llamaba solicitar_primer_credito(), que no
--      recibe nada y contesta al instante con la política del nuevo
--      (100.000 a 8 días): el cliente no podía pedir ni el monto ni la fecha.
--      solicitar_primer_credito NO se toca y sigue viva, por si una app vieja
--      la llama.
--
--   2. condiciones_aceptadas. Una tabla de SOLO AGREGAR con lo que el cliente
--      tenía delante al aceptar: la propuesta tal como la tenía la base, las
--      líneas y el texto de «Las condiciones de este crédito» que le pintó la
--      app, la versión de ese texto, y desde qué IP y aparato aceptó. Es la
--      prueba de qué se aceptó (Ley 527: la aceptación electrónica vale si se
--      puede mostrar). RLS encendido y SIN políticas: ni anon ni authenticated
--      la leen ni la escriben; entra solo por la función de abajo.
--
--   3. aceptar_condiciones(p_id, p_vio). Lo que llama la app al tocar «Acepto»
--      con la casilla marcada. Compara lo que el cliente vio (recibe, total,
--      fecha de pago y CUÁNDO se armó la propuesta) con la propuesta de la
--      base, BAJO CANDADO de la fila: si Joan la cambió mientras la persona
--      leía, NO se acepta y la app muestra la nueva. Si casan, acepta con la función de siempre
--      (aceptar_contrapropuesta, o aceptar_propuesta_platachat si es de
--      PlataChat) —no se copia su cuerpo—, anota la fila de arriba y deja un
--      resumen en contrapropuesta.condiciones para que el CRM lo muestre en la
--      solicitud. Si Joan vuelve a proponer, contrapropuesta_solicitud pisa
--      la propuesta entera y ese resumen se va con ella: lo que el CRM enseña
--      es siempre lo aceptado de la propuesta VIGENTE; el historial completo
--      sigue en condiciones_aceptadas.
--
-- LO QUE NO HACE: no pone precio a nada, no aprueba nada y no desembolsa. El
-- crédito sigue naciendo cuando Joan entrega la plata.
--
-- NUNCA `raise exception` después de la sección 0: el editor corre el archivo
-- en una transacción y eso deshace todo. Lo que falle se dice con FALLA.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.aceptar_contrapropuesta(bigint)') is null then
    raise exception 'Falta base/20260908_primer_credito.sql (celular_de_sesion, aceptar_contrapropuesta). Córrelo primero.';
  end if;
  if to_regprocedure('public.hoy_bogota(timestamptz)') is null
     or to_regprocedure('public.aceptar_propuesta_platachat(bigint)') is null then
    raise exception 'Falta base/20261005_platachat_solicitud.sql (hoy_bogota, la solicitud de PlataChat). Córrelo primero.';
  end if;
  if to_regprocedure('public.solicitud_de_la_cuenta(text, timestamptz)') is null
     or to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'Falta base/20261007_una_puerta.sql (solicitud_de_la_cuenta). Córrelo primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'pedido')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'pedido_nota') then
    raise exception 'A solicitudes le faltan pedido / pedido_nota (20261005 y 20260922_a_la_medida_y_ayuda.sql). Córrelos primero.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. LA TABLA DE LO ACEPTADO
--
-- Sin llave foránea a solicitudes, A PROPÓSITO: la prueba de lo que alguien
-- aceptó tiene que sobrevivir a que la solicitud se borre (borrar_para_probar,
-- una limpieza a mano). Con «on delete cascade» se iría con ella; con
-- «restrict», una limpieza no podría borrar la solicitud.
-- ---------------------------------------------------------------------------
create table if not exists public.condiciones_aceptadas (
  id            bigint generated always as identity primary key,
  solicitud_id  bigint      not null,
  celular       text        not null,
  version       text        not null default '',
  oferta        jsonb       not null default '{}'::jsonb,   -- la propuesta, tal como la tenía la base
  vio           jsonb       not null default '{}'::jsonb,   -- lo que la app le mostró: líneas y texto
  huella        jsonb       not null default '{}'::jsonb,   -- ip y aparato de la petición
  aceptada_en   timestamptz not null default now()
);
create index if not exists condiciones_aceptadas_por_solicitud
  on public.condiciones_aceptadas (solicitud_id, aceptada_en desc);
create index if not exists condiciones_aceptadas_por_celular
  on public.condiciones_aceptadas (celular, aceptada_en desc);

comment on table public.condiciones_aceptadas is
  'Lo que el cliente tenía delante al aceptar una propuesta (8-oct-2026). Solo se agrega; entra únicamente por aceptar_condiciones.';

alter table public.condiciones_aceptadas enable row level security;
revoke all on table public.condiciones_aceptadas from public, anon, authenticated;

-- SOLO AGREGAR. Una aceptación que se puede reescribir no prueba nada: la fila
-- dice lo que se vio ESE día. Borrar sí se deja (una solicitud de habeas data
-- la puede exigir, y eso lo decide Joan a mano), cambiar no.
create or replace function public.condiciones_aceptadas_no_se_cambian()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'condiciones_aceptadas es de solo agregar: lo aceptado no se reescribe';
end
$$;
drop trigger if exists condiciones_aceptadas_solo_agregar on public.condiciones_aceptadas;
create trigger condiciones_aceptadas_solo_agregar
  before update on public.condiciones_aceptadas
  for each row execute function public.condiciones_aceptadas_no_se_cambian();
revoke all on function public.condiciones_aceptadas_no_se_cambian() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. PEDIR A LA MEDIDA
--
-- Rejas, cada una con su porqué:
--   · el monto, de 50.000 (MONTO_MINIMO del motor) a 20.000.000, que es lo
--     más que Joan puede contraproponer (contrapropuesta_solicitud); pedir más
--     dejaría una solicitud que nadie puede contestar con una propuesta;
--   · la fecha, de mañana a un año, en hora de Colombia (hoy_bogota);
--   · el freno global de solicitudes (psol:*) y cinco por hora por celular,
--     los mismos de solicitar_primer_credito y play_solicitar;
--   · UNA abierta por cuenta: si ya hay una 'nueva', se le cambia lo pedido
--     (con techo de diez cambios, en el mismo contador que usa PlataChat); si
--     ya tiene propuesta o la aceptó, se devuelve esa y no se crea otra.
-- Un candado de transacción por celular hace que dos toques seguidos no creen
-- dos solicitudes (el mismo de solicitar_platachat).
-- Cada rechazo dice POR QUÉ, para que la app no tenga que decir «no se pudo».
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_a_la_medida(
  p_capital bigint, p_fecha_pago date, p_nota text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  cel    text;
  hoy    date;
  dias   integer;
  v_nota text;
  n      integer;
  s      public.solicitudes;
  r      public.registros;
  nombre text;
  ped    jsonb;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;

  hoy := public.hoy_bogota();
  if p_capital is null or p_capital < 50000 then
    return jsonb_build_object('ok', false, 'motivo', 'minimo', 'minimo', 50000);
  end if;
  if p_capital > 20000000 then
    return jsonb_build_object('ok', false, 'motivo', 'maximo', 'maximo', 20000000);
  end if;
  if p_fecha_pago is null or p_fecha_pago < hoy + 1 or p_fecha_pago > hoy + 366 then
    return jsonb_build_object('ok', false, 'motivo', 'fecha');
  end if;
  dias   := p_fecha_pago - hoy;
  v_nota := nullif(left(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), 300), '');

  if not public.puede_intentar_tope('psol:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'ocupado');
  end if;

  perform pg_advisory_xact_lock(hashtext('a_la_medida:' || cel));

  ped := jsonb_build_object('origen', 'play', 'capital', p_capital,
                            'fecha_pago', to_char(p_fecha_pago, 'YYYY-MM-DD'),
                            'dias', dias, 'pedida_en', now());

  -- La abierta de ESTA cuenta (solicitud_de_la_cuenta: nada de antes de abrirla).
  select * into s from public.solicitudes
   where cedula = cel and app = 'tugarantia'
     and estado in ('nueva', 'contrapropuesta', 'aceptada')
     and public.solicitud_de_la_cuenta(cel, creada_en)
   order by creada_en desc, id desc
   limit 1
   for update;
  if found then
    if s.estado = 'nueva' and s.contrapropuesta is null then
      if coalesce(s.repropuestas, 0) >= 10 then
        return jsonb_build_object('ok', false, 'motivo', 'muchas');
      end if;
      update public.solicitudes
         set capital      = p_capital,
             fecha_corte  = p_fecha_pago,
             pedido       = ped,
             pedido_monto = p_capital,
             pedido_nota  = v_nota,
             repropuestas = coalesce(repropuestas, 0) + 1
       where id = s.id
      returning * into s;
      return jsonb_build_object('ok', true, 'cambiada', true,
        'solicitud', to_jsonb(s) - 'datos' - 'registro_id' - 'responsable');
    end if;
    return jsonb_build_object('ok', true, 'ya_habia', true,
      'solicitud', to_jsonb(s) - 'datos' - 'registro_id' - 'responsable');
  end if;

  select count(*) into n from public.solicitudes
   where cedula = cel and creada_en > now() - interval '1 hour';
  if n >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  -- El registro y el nombre, como solicitar_primer_credito. El disparador de
  -- 20261007c (solicitud_de_sesion_guarda) suelta el registro si no es de
  -- esta cuenta y marca cuenta_sin_juntar si hace falta: no se repite acá.
  select * into r from public.registros
   where right(public.solo_digitos(coalesce(telefono, '')), 10) = cel
   order by creado_en desc, id desc
   limit 1;
  nombre := coalesce(
    nullif(btrim(coalesce(r.nombre, '')), ''),
    nullif(left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', '')), 80), ''),
    'Registrado');

  insert into public.solicitudes
    (cedula, celular, nombre, capital, tasa, costo, total, fecha_corte, producto, estado, app,
     pedido, pedido_monto, pedido_nota, datos, registro_id)
  values
    (cel, cel, nombre, p_capital, 0, 0, 0, p_fecha_pago, 'quincenal', 'nueva', 'tugarantia',
     ped, p_capital, v_nota, coalesce(r.datos, '{}'::jsonb), r.id)
  returning * into s;

  return jsonb_build_object('ok', true,
    'solicitud', to_jsonb(s) - 'datos' - 'registro_id' - 'responsable');
end
$$;


-- ---------------------------------------------------------------------------
-- 3. ACEPTAR, CON LAS CONDICIONES QUE SE VIERON
--
-- p_vio = { version, capital, total, fecha_pago, lineas:[{clave,k,v}], texto }
-- tal como lo arma app/calculadora-solicitud.js (paraAceptar).
--
-- De lo que manda el teléfono se CREE una cosa y se COMPRUEBAN cuatro: se
-- guarda lo que dice que mostró (es su palabra, y por eso va aparte de la
-- `oferta`, que la copia la base de su propia fila), y se exige que el monto,
-- el total, la fecha de pago y el momento en que se armó la propuesta
-- (creada_en) sean los de la propuesta vigente.
--
-- 8-oct-2026 (segunda vuelta) — LA FECHA Y EL MOMENTO, que faltaban. Solo se
-- comparaban el monto y el total, y contrapropuesta_de calcula el costo como
-- capital × porcentaje SIN mirar los días: Joan re-proponía la misma plata a 5
-- días en vez de 30 mientras el cliente leía la de 30, y se aceptaba. El
-- cliente quedaba debiendo en una fecha que nunca vio, y la constancia («lo
-- que vio») decía la otra. Lo reprodujo la revisión de seguridad contra un
-- PostgreSQL 17. creada_en cambia con CADA propuesta nueva (now()), así que
-- también cubre un plan de cuotas que cambia de fechas con el mismo total.
--
-- Y en el resumen que lee el CRM va, aparte de lo que dice el teléfono, LO QUE
-- TENÍA LA BASE (`base`): la constancia muestra las dos cosas lado a lado y
-- marca cualquier diferencia, en vez de presentar la palabra del teléfono como
-- un hecho.
-- ---------------------------------------------------------------------------
create or replace function public.aceptar_condiciones(p_id bigint, p_vio jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  cel     text;
  llave   text;
  s       public.solicitudes;
  cp      jsonb;
  res     jsonb;
  v_cap   bigint;
  v_tot   bigint;
  v_fecha text;
  v_creada text;
  v_tope  jsonb;
  v_texto text;
  v_lin   jsonb;
  v_ver   text;
  hdr     jsonb;
  huella  jsonb;
  vio     jsonb;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;
  llave := public.llave_de_sesion(cel);

  -- El candado de la fila: de aquí al final nadie le cambia la propuesta.
  select * into s from public.solicitudes
   where id = p_id and estado = 'contrapropuesta'
     and (cedula = cel or celular = cel or cedula = llave)
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_esta');
  end if;
  cp := coalesce(s.contrapropuesta, '{}'::jsonb);

  -- Las cifras que dice haber visto, leídas sin confiar en el formato.
  v_cap := case when coalesce(p_vio ->> 'capital', '') ~ '^\d{1,12}$' then (p_vio ->> 'capital')::bigint end;
  v_tot := case when coalesce(p_vio ->> 'total', '')   ~ '^\d{1,12}$' then (p_vio ->> 'total')::bigint end;
  v_fecha  := left(coalesce(cp ->> 'fecha_pago', s.fecha_corte::text, ''), 10);
  v_creada := coalesce(cp ->> 'creada_en', '');
  if v_cap is distinct from coalesce(case when coalesce(cp ->> 'capital', '') ~ '^\d{1,12}$' then (cp ->> 'capital')::bigint end, s.capital)
     or v_tot is distinct from coalesce(case when coalesce(cp ->> 'total', '') ~ '^\d{1,12}$' then (cp ->> 'total')::bigint end, s.total)
     or left(coalesce(p_vio ->> 'fecha_pago', ''), 10) is distinct from v_fecha
     or coalesce(p_vio ->> 'creada_en', '') is distinct from v_creada then
    return jsonb_build_object('ok', false, 'motivo', 'cambio');
  end if;

  v_texto := left(coalesce(p_vio ->> 'texto', ''), 6000);
  if length(btrim(v_texto)) < 40 then
    -- Sin el texto de las condiciones no hay nada que probar después.
    return jsonb_build_object('ok', false, 'motivo', 'sin_condiciones');
  end if;
  v_lin := case when jsonb_typeof(p_vio -> 'lineas') = 'array' and length((p_vio -> 'lineas')::text) <= 8000
                then p_vio -> 'lineas' else '[]'::jsonb end;
  v_ver := left(coalesce(p_vio ->> 'version', ''), 20);
  -- El techo del recargo que se le mostró (pesos por día y la tasa). Solo si
  -- tiene forma de número y está en un rango posible: el CRM lo pone al lado
  -- del que él mismo calcula, nunca lo toma como verdad.
  v_tope := case
    when jsonb_typeof(p_vio -> 'tope_mora') = 'object'
     and coalesce(p_vio -> 'tope_mora' ->> 'ea', '') ~ '^0?\.\d{1,8}$'
     and coalesce(p_vio -> 'tope_mora' ->> 'por_dia', '') ~ '^\d{1,9}$'
    then jsonb_build_object('ea', (p_vio -> 'tope_mora' ->> 'ea')::numeric,
                            'por_dia', (p_vio -> 'tope_mora' ->> 'por_dia')::bigint)
  end;

  -- Acepta la función de siempre: sus rejas (dueño, estado, la cuenta) siguen
  -- siendo las que mandan.
  if s.app = 'platachat' then
    res := public.aceptar_propuesta_platachat(p_id);
  else
    res := public.aceptar_contrapropuesta(p_id);
  end if;
  if coalesce(res ->> 'ok', '') <> 'true' then
    return jsonb_build_object('ok', false, 'motivo', 'no_se_pudo');
  end if;

  -- Desde dónde: lo leen las cabeceras de la petición, no el teléfono.
  begin
    hdr := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    hdr := null;
  end;
  huella := jsonb_build_object(
    'ip', left(split_part(coalesce(hdr ->> 'x-forwarded-for', hdr ->> 'x-real-ip', ''), ',', 1), 60),
    'aparato', left(coalesce(hdr ->> 'user-agent', ''), 300));

  vio := jsonb_build_object('version', v_ver, 'lineas', v_lin, 'texto', v_texto,
                            'fecha_pago', left(coalesce(p_vio ->> 'fecha_pago', ''), 10),
                            'creada_en', left(coalesce(p_vio ->> 'creada_en', ''), 40),
                            'tope_mora', v_tope);
  insert into public.condiciones_aceptadas (solicitud_id, celular, version, oferta, vio, huella)
  values (s.id, cel, v_ver, cp, vio, huella);

  update public.solicitudes
     set contrapropuesta = coalesce(contrapropuesta, '{}'::jsonb)
           || jsonb_build_object('condiciones',
                jsonb_build_object('version', v_ver, 'aceptadas_en', now(), 'lineas', v_lin,
                  'tope_mora', v_tope,
                  -- Lo que tenía LA BASE, no el teléfono: el CRM lo pone al lado.
                  'base', jsonb_build_object('capital', cp -> 'capital', 'total', cp -> 'total',
                                             'fecha_pago', v_fecha, 'creada_en', v_creada)))
   where id = s.id
  returning * into s;

  return jsonb_build_object('ok', true,
    'solicitud', to_jsonb(s) - 'datos' - 'registro_id' - 'responsable');
end
$$;


-- ---------------------------------------------------------------------------
-- 4. LOS PERMISOS
--
-- Supabase le da EXECUTE a anon y authenticated a CADA función nueva: primero
-- se les quita a todos y después se da solo lo que toca. Las dos del cliente,
-- con sesión; ninguna con la llave pública sola.
-- ---------------------------------------------------------------------------
revoke all on function public.solicitar_a_la_medida(bigint, date, text) from public, anon, authenticated;
grant  execute on function public.solicitar_a_la_medida(bigint, date, text) to authenticated;
revoke all on function public.aceptar_condiciones(bigint, jsonb) from public, anon, authenticated;
grant  execute on function public.aceptar_condiciones(bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. LO QUE SE COMPRUEBA SOLO (sin raise exception: ver la cabecera)
--
-- Se prueba LLAMANDO, con un celular de mentira que no es de nadie, y se borra
-- todo lo que se creó. Si el número existe en la base, la prueba no corre.
-- ---------------------------------------------------------------------------
do $prueba$
declare
  v_cel  text := '3009990817';
  j      jsonb;
  v_id   bigint;
  cp     jsonb;
  pasos  text := '';
begin
  if exists (select 1 from public.solicitudes where cedula = v_cel or celular = v_cel)
     or exists (select 1 from public.registros where right(public.solo_digitos(coalesce(telefono, '')), 10) = v_cel) then
    raise notice 'Condiciones: el celular de prueba % ya existe en la base; la prueba no corre.', v_cel;
    return;
  end if;

  begin
    perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);

    j := public.solicitar_a_la_medida(40000, public.hoy_bogota() + 10, null);
    if j ->> 'motivo' = 'minimo' then pasos := pasos || '1 piso; ';
    else raise notice 'FALLA 1: 40.000 pasó el piso: %', j; end if;

    j := public.solicitar_a_la_medida(700000, public.hoy_bogota() + 400, null);
    if j ->> 'motivo' = 'fecha' then pasos := pasos || '2 fecha; ';
    else raise notice 'FALLA 2: una fecha a más de un año pasó: %', j; end if;

    j := public.solicitar_a_la_medida(700000, public.hoy_bogota() + 37, 'surtir el negocio');
    v_id := (j -> 'solicitud' ->> 'id')::bigint;
    if j ->> 'ok' = 'true' and j -> 'solicitud' ->> 'estado' = 'nueva'
       and (j -> 'solicitud' -> 'pedido' ->> 'dias')::int = 37
       and j -> 'solicitud' -> 'contrapropuesta' = 'null'::jsonb
       and not (j -> 'solicitud' ? 'datos') then
      pasos := pasos || '3 nace-nueva-sin-propuesta; ';
    else raise notice 'FALLA 3: %', j; end if;

    j := public.solicitar_a_la_medida(800000, public.hoy_bogota() + 20, null);
    if j ->> 'cambiada' = 'true' and (j -> 'solicitud' ->> 'id')::bigint = v_id
       and (j -> 'solicitud' ->> 'pedido_monto')::bigint = 800000 then
      pasos := pasos || '4 una-sola-abierta; ';
    else raise notice 'FALLA 4: pedir otra vez creó otra o no cambió: %', j; end if;

    -- Joan propone (sin su clave: se escribe la fila como lo haría contrapropuesta_solicitud).
    cp := public.contrapropuesta_de(800000, 20, 20, 'Te propongo esto', 'joan');
    update public.solicitudes
       set contrapropuesta = cp, estado = 'contrapropuesta', capital = 800000,
           costo = (cp ->> 'costo')::bigint, total = (cp ->> 'total')::bigint
     where id = v_id;

    j := public.aceptar_condiciones(v_id, jsonb_build_object('capital', 800000, 'total', 999999,
           'texto', repeat('condiciones ', 10), 'version', '2026-10-08'));
    if j ->> 'motivo' = 'cambio'
       and (select estado from public.solicitudes where id = v_id) = 'contrapropuesta' then
      pasos := pasos || '5 otra-cifra-no-acepta; ';
    else raise notice 'FALLA 5: aceptó con un total que no era el de la propuesta: %', j; end if;

    j := public.aceptar_condiciones(v_id, jsonb_build_object('capital', 800000, 'total', (cp ->> 'total')::bigint,
           'fecha_pago', cp ->> 'fecha_pago', 'creada_en', cp ->> 'creada_en',
           'texto', '', 'version', '2026-10-08'));
    if j ->> 'motivo' = 'sin_condiciones' then pasos := pasos || '6 sin-texto-no-acepta; ';
    else raise notice 'FALLA 6: aceptó sin el texto de las condiciones: %', j; end if;

    -- Otra cuenta no acepta lo ajeno, aunque traiga las cifras buenas.
    perform set_config('request.jwt.claims', '{"email":"573009990818@tugarantia.net","role":"authenticated"}', true);
    j := public.aceptar_condiciones(v_id, jsonb_build_object('capital', 800000, 'total', (cp ->> 'total')::bigint,
           'texto', repeat('condiciones ', 10)));
    if j ->> 'ok' = 'false'
       and (select estado from public.solicitudes where id = v_id) = 'contrapropuesta' then
      pasos := pasos || '7 lo-ajeno-no; ';
    else raise notice 'FALLA 7 GRAVE: otra cuenta aceptó una solicitud ajena: %', j; end if;
    perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);

    -- La MISMA plata con OTRA fecha, o el sello de OTRA propuesta (como si Joan
    -- la cambiara mientras la persona leía): el total no cambia, y aun así no
    -- se acepta.
    j := public.aceptar_condiciones(v_id, jsonb_build_object('capital', 800000, 'total', (cp ->> 'total')::bigint,
           'fecha_pago', to_char(public.hoy_bogota() + 40, 'YYYY-MM-DD'), 'creada_en', cp ->> 'creada_en',
           'texto', repeat('condiciones ', 10), 'version', '2026-10-08'));
    if j ->> 'motivo' = 'cambio' then pasos := pasos || '10 otra-fecha-no-acepta; ';
    else raise notice 'FALLA 10 GRAVE: aceptó una propuesta con otra fecha de pago: %', j; end if;
    j := public.aceptar_condiciones(v_id, jsonb_build_object('capital', 800000, 'total', (cp ->> 'total')::bigint,
           'fecha_pago', cp ->> 'fecha_pago', 'creada_en', '2026-01-01T00:00:00+00:00',
           'texto', repeat('condiciones ', 10), 'version', '2026-10-08'));
    if j ->> 'motivo' = 'cambio' then pasos := pasos || '11 otra-propuesta-no-acepta; ';
    else raise notice 'FALLA 11 GRAVE: aceptó con el sello de otra propuesta: %', j; end if;

    j := public.aceptar_condiciones(v_id, jsonb_build_object('capital', 800000, 'total', (cp ->> 'total')::bigint,
           'fecha_pago', cp ->> 'fecha_pago', 'creada_en', cp ->> 'creada_en',
           'tope_mora', jsonb_build_object('ea', 0.2859, 'por_dia', 544),
           'texto', 'Las condiciones de este crédito - Recibes: $800.000 - Total a pagar: ...',
           'version', '2026-10-08',
           'lineas', jsonb_build_array(jsonb_build_object('clave', 'recibes', 'k', 'Recibes', 'v', '$800.000'))));
    if j ->> 'ok' = 'true' and j -> 'solicitud' ->> 'estado' = 'aceptada'
       and j -> 'solicitud' -> 'contrapropuesta' -> 'condiciones' ->> 'version' = '2026-10-08'
       and j -> 'solicitud' -> 'contrapropuesta' -> 'condiciones' -> 'base' ->> 'fecha_pago' = cp ->> 'fecha_pago'
       and (j -> 'solicitud' -> 'contrapropuesta' -> 'condiciones' -> 'tope_mora' ->> 'por_dia')::bigint = 544
       and exists (select 1 from public.condiciones_aceptadas where solicitud_id = v_id and celular = v_cel) then
      pasos := pasos || '8 acepta-y-anota; ';
    else raise notice 'FALLA 8: %', j; end if;

    begin
      update public.condiciones_aceptadas set version = 'otra' where solicitud_id = v_id;
      raise notice 'FALLA 9 GRAVE: lo aceptado se pudo reescribir';
    exception when others then
      pasos := pasos || '9 solo-agregar; ';
    end;

  exception when others then
    raise notice 'FALLA: la prueba se cayó en la mitad: % (%)', sqlerrm, sqlstate;
  end;

  perform set_config('request.jwt.claims', '', true);
  delete from public.condiciones_aceptadas where celular = v_cel;
  delete from public.solicitudes where cedula = v_cel or celular = v_cel;
  raise notice 'Condiciones: %', pasos;
end
$prueba$;
