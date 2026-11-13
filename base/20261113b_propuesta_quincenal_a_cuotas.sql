-- ===========================================================================
-- LA PROPUESTA QUINCENAL A CUOTAS — 13 de noviembre de 2026. Rama
-- propuesta-a-cuotas (entra con v144).
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces: crea DOS funciones nuevas y les pone sus
-- permisos; no toca ninguna fila ni ninguna función que ya exista. Al final
-- sale UNA TABLA con una fila por comprobación y una columna «ok»: todas
-- tienen que decir true. Después: Settings → API → «Reload schema».
-- Para volver a mirar otro día sin cambiar nada:
-- base/comprobar_20261113b_propuesta_quincenal_a_cuotas.sql.
--
-- Va DESPUÉS de base/20261113_falta_tu_cedula.sql (no depende de ella: va
-- después por la fecha) y de todo lo del 22-oct (20261022d, el equipo), como
-- toda migración posterior. Usa contrapropuesta_solicitud (20260908 y
-- 20261005), hoy_bogota, resolver_vencidas, pesos_texto, fecha_texto y
-- llave_de_solicitud (20261005_platachat_solicitud.sql) y aceptar_condiciones
-- (20261008_condiciones_aceptadas.sql).
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN (13-nov-2026), con el pantallazo de un cliente nuevo que
-- pidió $2.000.000 a 79 días:
--
-- «al momento de hacer la contrapropuesta no me permite la opción de cuotas y
-- elegir el número de cuotas y las fechas, solo me lo permite con créditos con
-- garantía; habilita esta opción lo antes posible para enviar una
-- contrapropuesta del crédito a cuotas y con los porcentajes que yo quiera».
--
-- Lo que había: contrapropuesta_solicitud (un solo pago, hasta 60 días) y
-- contrapropuesta_a_cuotas (el préstamo CON GARANTÍA: mensual, desde un
-- millón, con techo en efectiva anual). El crédito QUINCENAL a cuotas ya se
-- podía REGISTRAR al desembolsar desde el CRM (16-oct-2026), pero no
-- PROPONER: el cliente no lo veía ni lo aceptaba antes.
--
-- ---------------------------------------------------------------------------
-- LAS REGLAS NO SON NUEVAS: son las del registro a cuotas, de Joan del 16 y
-- 17 de octubre, que viven en app/motor.js (construirPlanACuotas):
--   · de 2 a 6 cuotas, y la última a no más de 186 días;
--   · la fecha y el % de cada cuota los pone Joan;
--   · el costo de cada cuota es su % sobre lo que se debe cuando empieza su
--     quincena (el saldo insoluto): Math.round(saldo × pct / 100);
--   · el % va de 1 al techo de los quincenales, 50 (TASA_CREDITO_MAXIMA del
--     motor, el mismo 50 de contrapropuesta_solicitud; decisión de Joan del
--     8-sep);
--   · las fechas no se corren: si caen en domingo o festivo, el CRM lo avisa
--     con la cifra antes de mandar. Aquí no se frena por eso.
--
-- POR QUÉ ESTA FUNCIÓN RECIBE LAS CUOTAS EN VEZ DE CALCULARLAS (la misma razón
-- de contrapropuesta_a_cuotas, 20260916): el plan lo arma el motor, el mismo
-- que lo cobra; escribirlo otra vez en plpgsql serían dos reglas de plata. Lo
-- que la base hace es lo que un servidor sí tiene que hacer: comprobar que las
-- cifras cuadren y que cada costo sea el que da la regla.
--
-- EL REDONDEO ES EL DEL MOTOR, Y NO ES UN DETALLE. El motor calcula en doble
-- precisión (saldo × (pct/100), Math.round), y el resultado NO siempre es el
-- del redondeo exacto: 10.250 al 35 % da 3.587,4999999999995 en doble
-- precisión, y el motor cobra 3.587, no 3.588. Con numeric, la base diría que
-- la cuota que el motor armó está mal. Por eso la cuenta va en float8, que es
-- el mismo IEEE 754 de JavaScript, y redondea como Math.round: floor(x + 0,5).
-- Lo vigilan la fila 6 de la tabla de abajo y pruebas/propuesta-a-cuotas.test.js.
--
-- LA PROPUESTA QUE SE GUARDA tiene la forma que ya leen la app y el CRM: las
-- tres cifras de siempre (capital, costo, total), `cuotas` (cada una con
-- numero, fecha, pct, capital, costo y total), `fecha_pago` = la ÚLTIMA cuota
-- (es lo que compara aceptar_condiciones, y lo que una app vieja muestra),
-- `dias`, `texto`, `por` y `creada_en`, más `producto: 'quincenal'`, que es lo
-- que la separa de la del préstamo con garantía (que guarda 'respaldado'). El
-- `pct` de cada cuota viaja: el CRM lo necesita para registrar al desembolsar
-- exactamente lo aceptado. La app del cliente no lo muestra: ve pesos.
--
-- LOS ESTADOS Y LA FILA, como contrapropuesta_solicitud: solo una solicitud
-- 'nueva', 'contrapropuesta' o 'aceptada'; vuelve a 'contrapropuesta' sin
-- aceptación (el cliente tiene que aceptar lo que ahora ve); producto
-- 'quincenal'; fecha_corte = la última cuota; `tasa` = lo que el costo
-- representa del capital en todo el crédito (como contrapropuesta_a_cuotas).
-- Si es de PlataChat, resuelta_en y el mensaje en el hilo de Créditos, como
-- contrapropuesta_solicitud.
--
-- ACEPTARLA, VERLA Y LISTARLA NO NECESITAN NADA NUEVO. Se revisaron el 13-nov:
-- aceptar_condiciones compara capital, total, fecha_pago y creada_en (la
-- última cuota y el sello de ESTA propuesta), aceptar_con_destino pasa por
-- ella, y mi_solicitud y listar_solicitudes_abiertas devuelven la fila
-- entera. Ninguna mira el producto: una quincenal con cuotas pasa como las
-- otras, y la constancia (condiciones_aceptadas.oferta) guarda la propuesta
-- entera, cuotas incluidas. Por eso no se reescribe ninguna (fila 8 de abajo).
--
-- POR QUÉ DOS FUNCIONES. La revisión de las cifras vive aparte
-- (propuesta_quincenal_a_cuotas_revisar), sin clave y sin tocar tablas, para
-- poder PROBARLA aquí mismo en la tabla de abajo: llamar la de Joan exige la
-- clave, y una clave equivocada gasta un intento del freno de clave_ok, que
-- no se revierte. Nadie de afuera la puede llamar.
--
-- NUNCA `raise exception` después del paso 0: el editor corre el archivo en
-- UNA transacción y eso desharía todo lo de arriba.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
-- Antes de crear nada. Si falta algo, se para aquí y no se crea nada. Como
-- todo lo que va después de 20261022d: si esa no está, se para
-- (pruebas/el-lote-del-27-junto.test.js).
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql. Este archivo va después. No se tocó nada.';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null then
    raise exception 'Falta la clave de sincronización (public.clave_ok): corre base/supabase.sql. No se tocó nada.';
  end if;
  if to_regprocedure('public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text)') is null then
    raise exception 'Falta contrapropuesta_solicitud (base/20260908_primer_credito.sql): esta propuesta cuelga de la bandeja de solicitudes. No se tocó nada.';
  end if;
  if to_regprocedure('public.hoy_bogota(timestamptz)') is null
     or to_regprocedure('public.resolver_vencidas()') is null
     or to_regprocedure('public.pesos_texto(bigint)') is null
     or to_regprocedure('public.fecha_texto(date)') is null
     or to_regprocedure('public.llave_de_solicitud(public.solicitudes)') is null then
    raise exception 'Falta base/20261005_platachat_solicitud.sql (hoy_bogota, resolver_vencidas, pesos_texto, fecha_texto, llave_de_solicitud). Córrela primero. No se tocó nada.';
  end if;
  if to_regprocedure('public.aceptar_condiciones(bigint, jsonb)') is null then
    raise exception 'Falta base/20261008_condiciones_aceptadas.sql (aceptar_condiciones): sin ella el cliente no puede aceptar. Córrela primero. No se tocó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'resuelta_en')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'app') then
    raise exception 'A solicitudes le faltan app o resuelta_en (20260921_platachat_app.sql y 20261005). Córrelas primero. No se tocó nada.';
  end if;
end $$;


-- ====== 1. LA REVISIÓN DE LAS CIFRAS ======
-- {ok:true, capital, costo, total, cuotas, ultima} con las cuotas limpias (solo
-- las seis llaves que se guardan), o {ok:false, motivo} con el porqué en
-- palabras: el CRM se lo muestra a Joan tal cual.
--
-- `p_hoy` entra por argumento, y no es pereza: la de Joan le pasa
-- hoy_bogota() (la fecha de Colombia, no la del servidor, que a las 7 de la
-- noche ya está en mañana); la tabla de abajo le pasa una fecha fija para que
-- el caso de Joan del 16-oct dé siempre lo mismo.
--
-- Cada número se lee SOLO si es un número JSON entero: un texto, un decimal o
-- un null no se convierten a la fuerza (un cast que revienta dejaría a Joan
-- con un error de PostgreSQL en vez de una frase).
-- ---------------------------------------------------------------------------
create or replace function public.propuesta_quincenal_a_cuotas_revisar(p_cuerpo jsonb, p_hoy date)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_capital bigint;
  v_costo   bigint;
  v_total   bigint;
  v_cuotas  jsonb;
  c         jsonb;
  n         integer := 0;
  v_n       integer;
  f         date;
  f_ant     date;
  v_pct     integer;
  v_cap     bigint;
  v_cos     bigint;
  v_tot     bigint;
  saldo     bigint;
  v_motor   bigint;
  v_techo   bigint;
  suma_cos  bigint := 0;
  suma_tot  bigint := 0;
  limpias   jsonb := '[]'::jsonb;
begin
  if p_cuerpo is null or jsonb_typeof(p_cuerpo) <> 'object' or p_hoy is null then
    return jsonb_build_object('ok', false, 'motivo', 'la propuesta llegó vacía');
  end if;

  v_capital := case when jsonb_typeof(p_cuerpo -> 'capital') = 'number' and (p_cuerpo ->> 'capital') ~ '^\d{1,12}$'
                    then (p_cuerpo ->> 'capital')::bigint end;
  v_costo   := case when jsonb_typeof(p_cuerpo -> 'costo') = 'number' and (p_cuerpo ->> 'costo') ~ '^\d{1,12}$'
                    then (p_cuerpo ->> 'costo')::bigint end;
  v_total   := case when jsonb_typeof(p_cuerpo -> 'total') = 'number' and (p_cuerpo ->> 'total') ~ '^\d{1,12}$'
                    then (p_cuerpo ->> 'total')::bigint end;

  -- El monto: el MISMO rango que la propuesta de un solo pago
  -- (contrapropuesta_solicitud).
  if v_capital is null or v_capital < 10000 or v_capital > 20000000 then
    return jsonb_build_object('ok', false, 'motivo', 'el monto va de $10.000 a $20.000.000');
  end if;

  v_cuotas := p_cuerpo -> 'cuotas';
  if v_cuotas is null or jsonb_typeof(v_cuotas) <> 'array' then
    return jsonb_build_object('ok', false, 'motivo', 'faltan las cuotas');
  end if;
  v_n := jsonb_array_length(v_cuotas);
  -- CUOTAS_ALTA_MIN y CUOTAS_ALTA_MAX del motor.
  if v_n < 2 or v_n > 6 then
    return jsonb_build_object('ok', false, 'motivo',
      'las cuotas van de 2 a 6 y llegaron ' || v_n);
  end if;

  /* CADA CUOTA, UNA POR UNA. Las variables de la vuelta se reinician a mano:
     en plpgsql las del declare viven toda la función, no cada vuelta, y una
     que se quedara con el valor anterior haría pasar una cuota sin fecha con
     la fecha de la de antes (el defecto del 14-sep, ver 20260916). */
  saldo := v_capital;
  f_ant := null;
  for c in select value from jsonb_array_elements(v_cuotas) loop
    n := n + 1;
    f := null; v_pct := null; v_cap := null; v_cos := null; v_tot := null;

    if jsonb_typeof(c) <> 'object' then
      return jsonb_build_object('ok', false, 'motivo', 'la cuota ' || n || ' no se entiende');
    end if;

    if coalesce(c ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'motivo', 'la cuota ' || n || ' no tiene fecha');
    end if;
    begin
      f := (c ->> 'fecha')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'motivo', 'la fecha de la cuota ' || n || ' no existe');
    end;
    if f_ant is null and f < p_hoy then
      return jsonb_build_object('ok', false, 'motivo',
        'la primera cuota ya pasó: el crédito nacería vencido');
    end if;
    if f_ant is not null and f <= f_ant then
      return jsonb_build_object('ok', false, 'motivo',
        'las fechas de las cuotas no van de menor a mayor (la cuota ' || n || ')');
    end if;

    v_pct := case when jsonb_typeof(c -> 'pct') = 'number' and (c ->> 'pct') ~ '^\d{1,3}$'
                  then (c ->> 'pct')::integer end;
    -- De 1 al techo de los quincenales, entero: calcularCosto no acepta 0 ni
    -- más de TASA_CREDITO_MAXIMA (50 %).
    if v_pct is null or v_pct < 1 or v_pct > 50 then
      return jsonb_build_object('ok', false, 'motivo',
        'el % de la cuota ' || n || ' va entero de 1 a 50');
    end if;

    v_cap := case when jsonb_typeof(c -> 'capital') = 'number' and (c ->> 'capital') ~ '^\d{1,12}$'
                  then (c ->> 'capital')::bigint end;
    v_cos := case when jsonb_typeof(c -> 'costo') = 'number' and (c ->> 'costo') ~ '^\d{1,12}$'
                  then (c ->> 'costo')::bigint end;
    v_tot := case when jsonb_typeof(c -> 'total') = 'number' and (c ->> 'total') ~ '^\d{1,12}$'
                  then (c ->> 'total')::bigint end;
    if v_cap is null or v_cos is null or v_tot is null then
      return jsonb_build_object('ok', false, 'motivo',
        'la cuota ' || n || ' trae cifras que no son pesos enteros');
    end if;
    -- Una cuota de capital cero no: el recargo por atraso corre sobre el
    -- capital de la cuota, y una de puro costo se podría atrasar sin recargo.
    if v_cap < 1 then
      return jsonb_build_object('ok', false, 'motivo', 'la cuota ' || n || ' no tiene capital');
    end if;
    if v_cap > saldo then
      return jsonb_build_object('ok', false, 'motivo',
        'los capitales de las cuotas pasan lo prestado (en la cuota ' || n || ')');
    end if;
    if v_tot <> v_cap + v_cos then
      return jsonb_build_object('ok', false, 'motivo',
        'la cuota ' || n || ' no suma su capital más su costo');
    end if;

    /* EL COSTO, CON LA CUENTA DEL MOTOR (calcularCosto): su % sobre lo que se
       debe al empezar ESTA cuota, en doble precisión y redondeado como
       Math.round. Ver la cabecera. Primero el techo —el 50 % de ese saldo—,
       después que sea exactamente el de su %. */
    v_techo := floor(saldo::float8 * (50::float8 / 100::float8) + 0.5::float8)::bigint;
    if v_cos > v_techo then
      return jsonb_build_object('ok', false, 'motivo',
        'el costo de la cuota ' || n || ' pasa el techo: hasta ' || v_techo
        || ' sobre los ' || saldo || ' que se deben al empezarla');
    end if;
    v_motor := floor(saldo::float8 * (v_pct::float8 / 100::float8) + 0.5::float8)::bigint;
    if v_cos <> v_motor then
      return jsonb_build_object('ok', false, 'motivo',
        'el costo de la cuota ' || n || ' no es su ' || v_pct || ' % sobre los ' || saldo
        || ' que se deben al empezarla: da ' || v_motor || ' y llegó ' || v_cos);
    end if;

    limpias := limpias || jsonb_build_array(jsonb_build_object(
      'numero', n, 'fecha', to_char(f, 'YYYY-MM-DD'), 'pct', v_pct,
      'capital', v_cap, 'costo', v_cos, 'total', v_tot));
    suma_cos := suma_cos + v_cos;
    suma_tot := suma_tot + v_tot;
    saldo := saldo - v_cap;
    f_ant := f;
  end loop;

  -- La última, a no más de 186 días (DIAS_ALTA_MAX del motor).
  if f_ant - p_hoy > 186 then
    return jsonb_build_object('ok', false, 'motivo',
      'la última cuota cae a ' || (f_ant - p_hoy) || ' días; el tope es 186');
  end if;
  -- Y que el plan cuadre con lo prestado. Exacto: un peso suelto aquí es un
  -- peso que alguien va a reclamar.
  if saldo <> 0 then
    return jsonb_build_object('ok', false, 'motivo',
      'los capitales de las cuotas suman ' || (v_capital - saldo) || ' y el préstamo es de ' || v_capital);
  end if;
  if v_costo is distinct from suma_cos then
    return jsonb_build_object('ok', false, 'motivo',
      'los costos de las cuotas suman ' || suma_cos || ' y la propuesta dice ' || coalesce(v_costo::text, 'nada'));
  end if;
  if v_total is distinct from v_capital + suma_cos or suma_tot <> v_capital + suma_cos then
    return jsonb_build_object('ok', false, 'motivo',
      'las cuotas suman ' || suma_tot || ' y el total a devolver es ' || coalesce(v_total::text, 'nada'));
  end if;

  return jsonb_build_object('ok', true, 'capital', v_capital, 'costo', suma_cos, 'total', suma_tot,
                            'cuotas', limpias, 'ultima', to_char(f_ant, 'YYYY-MM-DD'));
end
$$;


-- ====== 2. LA PROPUESTA DE JOAN ======
-- VOLÁTIL, y no se le puede poner «stable»: pasa por clave_ok, que ESCRIBE el
-- freno contra la fuerza bruta. PostgREST corre las stable en transacción de
-- solo lectura y devolverían 25006 siempre (ya tuvo muertas dos funciones dos
-- días en septiembre).
create or replace function public.contrapropuesta_quincenal_a_cuotas(
  p_clave text, p_id bigint, p_cuerpo jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s     public.solicitudes;
  r     jsonb;
  cp    jsonb;
  v_hoy date;
  v_ult date;
  txt   text;
  q1    jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  -- Como contrapropuesta_solicitud: lo que Joan ve abierto es lo que de verdad
  -- sigue abierto (el reloj de PlataChat corre antes de contestar).
  perform public.resolver_vencidas();

  v_hoy := public.hoy_bogota();
  r := public.propuesta_quincenal_a_cuotas_revisar(p_cuerpo, v_hoy);
  if coalesce(r ->> 'ok', '') <> 'true' then
    return r;
  end if;

  v_ult := (r ->> 'ultima')::date;
  txt := left(coalesce(p_cuerpo ->> 'texto', ''), 400);
  /* El cuerpo que ve el cliente: las cifras de la revisión, no las que llegaron
     (son las mismas, ya comprobadas, y solo con las llaves que se guardan). */
  cp := jsonb_build_object(
    'capital',    (r ->> 'capital')::bigint,
    'costo',      (r ->> 'costo')::bigint,
    'total',      (r ->> 'total')::bigint,
    'producto',   'quincenal',
    'cuotas',     r -> 'cuotas',
    'fecha_pago', to_char(v_ult, 'YYYY-MM-DD'),
    'dias',       (v_ult - v_hoy),
    'texto',      txt,
    'por',        'joan',
    'creada_en',  now());

  update public.solicitudes
     set contrapropuesta = cp,
         estado      = 'contrapropuesta',
         aceptada_en = null,
         capital     = (cp ->> 'capital')::bigint,
         /* La fracción que el costo representa del capital, en todo el
            crédito, como contrapropuesta_a_cuotas: no es el % de una cuota. */
         tasa        = (cp ->> 'costo')::numeric / nullif((cp ->> 'capital')::numeric, 0),
         costo       = (cp ->> 'costo')::bigint,
         total       = (cp ->> 'total')::bigint,
         fecha_corte = v_ult,
         producto    = 'quincenal',
         -- PlataChat: una persona alcanzó a contestar (contrapropuesta_solicitud).
         resuelta_en = case when app = 'platachat' then now() else resuelta_en end
   where id = p_id and estado in ('nueva', 'contrapropuesta', 'aceptada')
  returning * into s;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'esa solicitud no está abierta');
  end if;

  -- PlataChat: la propuesta también se lee en el chat, en pesos y fechas.
  if s.app = 'platachat' then
    q1 := cp -> 'cuotas' -> 0;
    insert into public.mensajes (cedula, de, texto, canal)
    values (public.llave_de_solicitud(s), 'panel',
            'Te propongo ' || public.pesos_texto((cp ->> 'capital')::bigint)
            || '; devuelves ' || public.pesos_texto((cp ->> 'total')::bigint)
            || ' en ' || jsonb_array_length(cp -> 'cuotas') || ' cuotas: la primera de '
            || public.pesos_texto((q1 ->> 'total')::bigint) || ' el ' || public.fecha_texto((q1 ->> 'fecha')::date)
            || ' y la última el ' || public.fecha_texto(v_ult) || '.'
            || case when btrim(txt) <> '' then ' ' || btrim(txt) else '' end,
            'creditos');
  end if;

  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;


-- ====== 3. LOS PERMISOS ======
-- La de Joan, a `anon` como las otras dos (contrapropuesta_solicitud y
-- contrapropuesta_a_cuotas): su CRM entra con la llave pública y la clave de
-- sincronización por argumento, no con sesión. Ninguna sesión de cliente.
-- La revisión, a nadie: solo la llama la de Joan, que corre como su dueña.
-- El revoke va ANTES del grant: Supabase le concede EXECUTE a anon y
-- authenticated en cada función nueva, y «revoke ... from public» no lo quita.
revoke all on function public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb) from public, anon, authenticated;
grant  execute on function public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb) to anon;
revoke all on function public.propuesta_quincenal_a_cuotas_revisar(jsonb, date) from public, anon, authenticated;

notify pgrst, 'reload schema';


-- ====== 4. ¿QUEDÓ? — LA TABLA PARA JOAN ======
-- El editor no muestra los avisos: esto sí. Todas las filas en true. Es la
-- misma consulta de base/comprobar_20261113b_propuesta_quincenal_a_cuotas.sql.
-- Las filas 5 a 7 LLAMAN la revisión (PL/pgSQL compila en la primera
-- llamada: así se sabe hoy, y no en el CRM, si el cuerpo corre) con una fecha
-- fija, el 16-oct-2026, el día del caso de Joan.
select 1 as n, 'La propuesta a cuotas existe y la llama tu CRM con la llave pública, no una sesión de cliente' as comprobacion,
       case when to_regprocedure('public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)') is null then false
            else has_function_privilege('anon', 'public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)', 'execute')
                 and not has_function_privilege('authenticated', 'public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)', 'execute') end as ok
union all
select 2, 'Es volátil (pasa por clave_ok), corre como dueña y con search_path fijo',
       coalesce((select p.provolatile = 'v' and p.prosecdef
                        and coalesce(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
                   from pg_proc p where p.oid = to_regprocedure('public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)')), false)
union all
select 3, 'Mira tu clave antes que todo lo demás',
       coalesce((select position('clave_ok(p_clave)' in p.prosrc) > 0
                        and position('clave_ok(p_clave)' in p.prosrc) < position('propuesta_quincenal_a_cuotas_revisar' in p.prosrc)
                        and position('clave_ok(p_clave)' in p.prosrc) < position('update public.solicitudes' in p.prosrc)
                   from pg_proc p where p.oid = to_regprocedure('public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)')), false)
union all
select 4, 'La revisión de las cifras no la llama nadie de afuera',
       case when to_regprocedure('public.propuesta_quincenal_a_cuotas_revisar(jsonb, date)') is null then false
            else not has_function_privilege('anon', 'public.propuesta_quincenal_a_cuotas_revisar(jsonb, date)', 'execute')
                 and not has_function_privilege('authenticated', 'public.propuesta_quincenal_a_cuotas_revisar(jsonb, date)', 'execute') end
union all
select 5, 'El caso de Joan: 650.000 en dos cuotas al 20 % son 455.000 y 390.000',
       coalesce((select r ->> 'ok' = 'true' and (r ->> 'total')::bigint = 845000
                        and (r -> 'cuotas' -> 0 ->> 'costo')::bigint = 130000
                        and (r -> 'cuotas' -> 1 ->> 'costo')::bigint = 65000
                        and r ->> 'ultima' = '2026-11-15'
                   from (select public.propuesta_quincenal_a_cuotas_revisar(
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[
                        {"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},
                        {"fecha":"2026-11-15","pct":20,"capital":325000,"costo":65000,"total":390000}]}'::jsonb,
                     date '2026-10-16') as r) x), false)
union all
select 6, 'El redondeo es el del motor: 10.250 al 35 % cuestan 3.587, no 3.588',
       coalesce((select r ->> 'ok' = 'true' and (r -> 'cuotas' -> 1 ->> 'costo')::bigint = 3587
                   from (select public.propuesta_quincenal_a_cuotas_revisar(
                     '{"capital":20500,"costo":10762,"total":31262,"cuotas":[
                        {"fecha":"2026-10-30","pct":35,"capital":10250,"costo":7175,"total":17425},
                        {"fecha":"2026-11-15","pct":35,"capital":10250,"costo":3587,"total":13837}]}'::jsonb,
                     date '2026-10-16') as r) x), false)
union all
select 7, 'Dice que no a 1 y a 7 cuotas, a la primera ayer, a la última a 187 días, al 51 %, a un peso de más y a capitales que no suman',
       coalesce((select bool_and(public.propuesta_quincenal_a_cuotas_revisar(c::jsonb, date '2026-10-16') ->> 'ok' = 'false')
                   from unnest(array[
                     '{"capital":650000,"costo":130000,"total":780000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":650000,"costo":130000,"total":780000}]}',
                     '{"capital":70000,"costo":0,"total":0,"cuotas":[{},{},{},{},{},{},{}]}',
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-15","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2026-11-15","pct":20,"capital":325000,"costo":65000,"total":390000}]}',
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2027-04-21","pct":20,"capital":325000,"costo":65000,"total":390000}]}',
                     '{"capital":650000,"costo":496500,"total":1146500,"cuotas":[{"fecha":"2026-10-30","pct":51,"capital":325000,"costo":331500,"total":656500},{"fecha":"2026-11-15","pct":51,"capital":325000,"costo":165750,"total":490750}]}',
                     '{"capital":650000,"costo":195001,"total":845001,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130001,"total":455001},{"fecha":"2026-11-15","pct":20,"capital":325000,"costo":65000,"total":390000}]}',
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2026-11-15","pct":20,"capital":300000,"costo":65000,"total":365000}]}'
                   ]) as c)
                and (select public.propuesta_quincenal_a_cuotas_revisar(
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2027-04-20","pct":20,"capital":325000,"costo":65000,"total":390000}]}'::jsonb,
                     date '2026-10-16') ->> 'ok') = 'true', false)
union all
select 8, 'Aceptarla, verla y listarla no miran el producto: una quincenal a cuotas pasa como las otras',
       coalesce((select bool_and(position('producto' in p.prosrc) = 0)
                   from pg_proc p
                  where p.oid in (to_regprocedure('public.aceptar_condiciones(bigint, jsonb)'),
                                  to_regprocedure('public.aceptar_contrapropuesta(bigint)'),
                                  to_regprocedure('public.mi_solicitud()'),
                                  to_regprocedure('public.listar_solicitudes_abiertas(text)'),
                                  to_regprocedure('public.aceptar_con_destino(bigint, jsonb, jsonb)'))), false)
       and to_regprocedure('public.aceptar_condiciones(bigint, jsonb)') is not null
       and to_regprocedure('public.mi_solicitud()') is not null
       and to_regprocedure('public.listar_solicitudes_abiertas(text)') is not null
order by 1;
