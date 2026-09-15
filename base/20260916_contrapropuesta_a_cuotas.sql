-- ===========================================================================
-- LA CONTRAPROPUESTA A CUOTAS — 16 de septiembre de 2026
--
-- Joan: «si no tienen casi cupo e igual solicitan un monto alto, se vea en el
-- CRM la propuesta y yo pueda hacer una contrapropuesta; después, cuando yo
-- envíe la contrapropuesta, le aparezca segmentado la fecha y monto a pagar
-- para mejorar la cobranza y dar claridad».
--
-- Lo que había: contrapropuesta_de arma UN SOLO PAGO —capital, costo, y una
-- fecha— porque el primer crédito del nuevo es quincenal. La pantalla del
-- cliente ya sabe pintar cuotas una por una desde el 14-sep; lo que faltaba era
-- que Joan pudiera mandarlas.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTA FUNCIÓN RECIBE LAS CUOTAS EN VEZ DE CALCULARLAS
--
-- La amortización del préstamo con garantía —cuota fija sobre saldo decreciente,
-- 2% mensual— vive en app/motor.js, y es la MISMA que después cobra cada mes.
-- Escribirla otra vez en plpgsql sería escribir dos veces una regla de plata: el
-- día que una cambie, el cliente vería un plan y el CRM cobraría otro, y ninguno
-- de los dos podría saber cuál miente.
--
-- Así que el CRM de Joan calcula el plan con el motor y lo manda entero. Esto NO
-- es «confiar en la pantalla»: quien manda es Joan, con su clave de
-- sincronización, y él puede poner el precio que quiera —es su negocio—. Lo que
-- esta función hace es lo que el servidor sí tiene que hacer:
--
--   · COMPROBAR QUE LOS NÚMEROS CUADREN. La suma de los capitales tiene que dar
--     EXACTO el capital prestado, la suma de las cuotas el total, y cada cuota
--     su propio capital más su propio costo. Un plan que no cuadra es un plan
--     que el cliente va a leer y que nadie va a poder cobrar.
--   · COMPROBAR QUE LAS FECHAS SEAN FECHAS. Estrictamente crecientes y sin
--     empezar en el pasado: un plan que nace vencido es lo peor que se le puede
--     mandar a alguien a quien se le va a cobrar.
--   · GUARDAR CON QUÉ TECHO SE APROBÓ. La tabla de usura vive con fechas en
--     app/creditos.js y se certifica cada mes; duplicarla en plpgsql sería la
--     misma regla dos veces, y el modo de fallar sería el peor —los dos lados
--     discutiendo de qué mes es el techo—. Lo que sí se puede exigir acá, y se
--     exige, es que la efectiva anual que el CRM calculó NO pase del techo que
--     el CRM dice haber aplicado, y que las dos cifras queden guardadas. Eso
--     caza una cuenta mal hecha, y deja el rastro de con qué se aprobó el día
--     que alguien pregunte.
--
-- ---------------------------------------------------------------------------
-- LA PROPUESTA VIEJA SIGUE SIRVIENDO
--
-- El cuerpo que se guarda lleva `cuotas` Y TAMBIÉN `fecha_pago`, `total` y
-- `dias`, que es lo que leen la app publicada y el CRM de hoy. Una app vieja en
-- el teléfono de alguien sigue mostrando la propuesta —con la última fecha, que
-- es la verdad para quien solo entiende de un pago— en vez de quedarse en
-- blanco. Es la misma razón por la que socio.html no se borró.
--
-- Se puede correr dos veces. No borra nada.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text)') is null then
    raise exception 'Falta 20260908_primer_credito.sql: esta migracion cuelga de la bandeja de solicitudes';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null then
    raise exception 'Falta la clave de sincronizacion: corre base/supabase.sql';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- LA CONTRAPROPUESTA A CUOTAS
--
-- VOLÁTIL, y no se le puede poner «stable»: pasa por clave_ok, que ESCRIBE el
-- freno contra la fuerza bruta. PostgREST corre las stable en transacción de
-- solo lectura y devolverían 25006 SIEMPRE. Ya tuvo muertas dos funciones dos
-- días en septiembre.
-- ---------------------------------------------------------------------------
create or replace function public.contrapropuesta_a_cuotas(
  p_clave text, p_id bigint, p_cuerpo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.solicitudes;
  cp       jsonb;
  cuotas   jsonb;
  c        jsonb;
  v_capital  bigint;
  v_costo    bigint;
  v_meses    integer;
  ea       numeric;
  tope     numeric;
  n        integer := 0;
  suma_cap bigint := 0;
  suma_tot bigint := 0;
  f_ant    date;
  f        date;
  ult      date;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;

  v_capital := nullif(p_cuerpo ->> 'capital', '')::bigint;
  v_costo   := nullif(p_cuerpo ->> 'costo', '')::bigint;
  v_meses   := nullif(p_cuerpo ->> 'meses', '')::integer;
  ea      := nullif(p_cuerpo ->> 'ea', '')::numeric;
  tope    := nullif(p_cuerpo ->> 'tope', '')::numeric;
  cuotas  := p_cuerpo -> 'cuotas';

  if v_capital is null or v_capital < 10000 or v_capital > 20000000 then
    return jsonb_build_object('ok', false, 'motivo', 'el capital esta fuera de rango');
  end if;
  if v_costo is null or v_costo < 0 or v_costo > v_capital then
    return jsonb_build_object('ok', false, 'motivo', 'el costo esta fuera de rango');
  end if;
  if v_meses is null or v_meses < 1 or v_meses > 6 then
    return jsonb_build_object('ok', false, 'motivo', 'el plazo va de 1 a 6 meses');
  end if;
  if cuotas is null or jsonb_typeof(cuotas) <> 'array' then
    return jsonb_build_object('ok', false, 'motivo', 'faltan las cuotas');
  end if;
  if jsonb_array_length(cuotas) <> v_meses then
    return jsonb_build_object('ok', false, 'motivo', 'las cuotas no son las del plazo');
  end if;

  /* EL TECHO CON EL QUE SE APROBÓ. No se busca acá —la tabla vive en
     creditos.js, con fecha— pero sí se exige que lo que el CRM calculó no lo
     pase, y las dos cifras quedan guardadas. Ver la cabecera. */
  if ea is null or tope is null or tope <= 0 then
    return jsonb_build_object('ok', false, 'motivo',
      'la propuesta no dice con que techo de usura se calculo');
  end if;
  if ea > tope then
    return jsonb_build_object('ok', false, 'motivo',
      'esa propuesta pasa el techo de usura del mes');
  end if;

  /* CADA CUOTA, UNA POR UNA. Las variables del loop se reinician arriba a mano:
     en plpgsql las del declare viven toda la funcion, no cada vuelta, y una que
     se quede con el valor anterior aca haria pasar un plan con fechas repetidas.
     Ese defecto ya se cometio en este proyecto el 14-sep. */
  f_ant := null;
  for c in select * from jsonb_array_elements(cuotas) loop
    n := n + 1;
    f := nullif(c ->> 'fecha', '')::date;
    if f is null then
      return jsonb_build_object('ok', false, 'motivo', 'la cuota ' || n || ' no tiene fecha');
    end if;
    if f_ant is not null and f <= f_ant then
      return jsonb_build_object('ok', false, 'motivo',
        'las fechas de las cuotas no van de menor a mayor');
    end if;
    if f_ant is null and f < current_date then
      return jsonb_build_object('ok', false, 'motivo',
        'la primera cuota ya vencio: el credito naceria vencido');
    end if;
    if coalesce((c ->> 'capital')::bigint, -1) < 0
       or coalesce((c ->> 'costo')::bigint, -1) < 0 then
      return jsonb_build_object('ok', false, 'motivo', 'la cuota ' || n || ' tiene cifras negativas');
    end if;
    if (c ->> 'total')::bigint <> (c ->> 'capital')::bigint + (c ->> 'costo')::bigint then
      return jsonb_build_object('ok', false, 'motivo',
        'la cuota ' || n || ' no suma su propio capital mas su propio costo');
    end if;
    suma_cap := suma_cap + (c ->> 'capital')::bigint;
    suma_tot := suma_tot + (c ->> 'total')::bigint;
    f_ant := f;
  end loop;
  ult := f_ant;

  /* Y QUE EL PLAN CUADRE CON LO PRESTADO. Exacto, no aproximado: un peso suelto
     acá es un peso que alguien va a reclamar. */
  if suma_cap <> v_capital then
    return jsonb_build_object('ok', false, 'motivo',
      'los capitales de las cuotas suman ' || suma_cap || ' y el prestamo es de ' || v_capital);
  end if;
  if suma_tot <> v_capital + v_costo then
    return jsonb_build_object('ok', false, 'motivo',
      'las cuotas suman ' || suma_tot || ' y el total a devolver es ' || (v_capital + v_costo));
  end if;

  /* El cuerpo que ve el cliente. Lleva las cuotas Y las tres cifras de la
     propuesta de un solo pago, para que una app vieja siga mostrando algo en vez
     de quedarse en blanco: la ultima fecha es la verdad para quien solo entiende
     de un pago. */
  cp := jsonb_build_object(
    'capital',    v_capital,
    'costo',      v_costo,
    'total',      v_capital + v_costo,
    'meses',      v_meses,
    'producto',   'respaldado',
    'cuotas',     cuotas,
    'fecha_pago', to_char(ult, 'YYYY-MM-DD'),
    'dias',       (ult - current_date),
    'texto',      left(coalesce(p_cuerpo ->> 'texto', ''), 400),
    'por',        'joan',
    'ea',         ea,
    'tope',       tope,
    'creada_en',  now());

  update public.solicitudes
     set contrapropuesta = cp,
         estado      = 'contrapropuesta',
         aceptada_en = null,
         capital     = v_capital,
         /* `tasa` guarda lo mismo que en la propuesta de un solo pago: la
            fraccion que el costo representa del capital, para todo el credito.
            No es la mensual — ver contrapropuesta_de. */
         tasa        = v_costo::numeric / nullif(v_capital, 0),
         costo       = v_costo,
         total       = v_capital + v_costo,
         fecha_corte = ult,
         producto    = 'respaldado',
         plazo_meses = v_meses
   where id = p_id and estado in ('nueva', 'contrapropuesta', 'aceptada')
  returning * into s;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'esa solicitud no esta abierta');
  end if;
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;

-- ---------------------------------------------------------------------------
-- LOS PERMISOS
--
-- A `anon` como las demas de Joan: su CRM entra con la clave, no con sesion.
-- Y el revoke va ANTES del grant, porque PostgreSQL le concede EXECUTE a PUBLIC
-- por defecto.
-- ---------------------------------------------------------------------------
revoke all on function public.contrapropuesta_a_cuotas(text, bigint, jsonb)
                                                      from public, anon, authenticated;
grant  execute on function public.contrapropuesta_a_cuotas(text, bigint, jsonb) to anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.contrapropuesta_a_cuotas(text, bigint, jsonb)') is null then
    raise exception 'contrapropuesta_a_cuotas no quedo';
  end if;
  if (select provolatile from pg_proc
       where oid = 'public.contrapropuesta_a_cuotas(text, bigint, jsonb)'::regprocedure) <> 'v' then
    raise exception 'contrapropuesta_a_cuotas no es volatil y pasa por clave_ok: devolveria 25006 siempre';
  end if;
  if has_function_privilege('authenticated', 'public.contrapropuesta_a_cuotas(text, bigint, jsonb)', 'execute') then
    raise exception 'un cliente con sesion puede cambiarse su propia propuesta';
  end if;
end
$$;
