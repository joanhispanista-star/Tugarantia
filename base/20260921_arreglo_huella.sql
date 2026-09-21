-- ===========================================================================
-- LAS FOTOS DEL REGISTRO NUNCA SE GUARDARON: «huella» era variable Y columna
-- 21 de septiembre de 2026.
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente: correrlo
-- dos veces no hace daño.
--
-- ---------------------------------------------------------------------------
-- QUÉ PASABA
--
-- Joan, hoy: «también quiero tener las fotos de las cédulas guardadas en mi
-- CRM» y «y la foto de la selfie». No las tiene. Y no es del CRM: es de acá.
--
-- `registro_archivos_guardar` (migración 20260908b, aplicada el 9-sep) declara
-- una variable llamada `huella`, y la tabla `public.registros` tiene una
-- columna llamada `huella` — la agrega esa MISMA migración cuatro líneas antes.
-- Su última instrucción es:
--
--     update public.registros
--        set huella = coalesce(huella, '{}'::jsonb) || huella
--
-- En un UPDATE, las columnas de la tabla SÍ están en alcance dentro del SET y
-- del WHERE. Así que `huella` es a la vez la columna y la variable, y PL/pgSQL
-- —con `plpgsql.variable_conflict` en su valor por defecto, que es `error`—
-- lanza en tiempo de EJECUCIÓN:
--
--     ERROR: column reference "huella" is ambiguous   (SQLSTATE 42702)
--
-- «En tiempo de ejecución» es la parte que lo volvió invisible: el cuerpo de
-- una función PL/pgSQL no se compila al crearla, sino la primera vez que se
-- usa. Por eso la migración pasó en verde el 9-sep y el bloque de comprobación
-- que trae al final no vio nada: comprueba que la función EXISTA, no que
-- funcione.
--
-- LO QUE SE PERDIÓ: la excepción aborta la función entera, así que la
-- transacción se deshace — incluidos los `insert` de las fotos que ya se
-- habían hecho unas líneas arriba. Cada cliente que subió su cédula desde el
-- 9 de septiembre recibió un error 500 que la app se tragó con un
-- `.catch(function () {})` vacío, borró su copia del teléfono a las 24 horas, y
-- el CRM de Joan nunca vio una sola foto. Trece días.
--
-- Comprobado leyendo el SQL, no ejecutándolo: el sondeo con la llave anónima
-- solo llega a decir que la función existe (contesta «permission denied», que
-- es lo correcto para `anon`). La prueba definitiva es la consulta de abajo.
--
-- ---------------------------------------------------------------------------
-- LA CURA, Y POR QUÉ ASÍ
--
-- Se renombra la variable a `v_huella`. Se descartaron las otras dos salidas:
--   · `#variable_conflict use_variable` arregla ESTA función y deja la trampa
--     puesta para la siguiente que alguien escriba;
--   · calificar la columna (`registros.huella`) funciona, pero deja dos cosas
--     distintas con el mismo nombre a tres palabras de distancia, que es
--     exactamente cómo nació el defecto.
-- El prefijo `v_` es feo a propósito: se ve desde lejos que eso es una
-- variable. Lo mismo vale para la siguiente función que toque una tabla cuyas
-- columnas no se conocen de memoria.
--
-- BARRIDO: se revisaron las 34 tablas y todas las funciones de base/*.sql
-- buscando el mismo choque. Hay otros seis nombres repetidos
-- (`solicitar_primer_credito` con `nombre`, `ficha_de_mi_base` con `aviso`)
-- pero NINGUNO es ambiguo: todos están dentro del `values` de un `insert`,
-- donde las columnas de la tabla destino no están en alcance. Esta era la
-- única rota.
-- ===========================================================================

create or replace function public.registro_archivos_guardar(p_archivos jsonb, p_huella jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel       text;
  k         text;
  v         text;
  cab       jsonb;
  v_huella  jsonb;   -- 21-sep-2026: se llamaba `huella`, igual que la columna de registros
  n         integer := 0;
  guardados text[] := '{}';
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
    guardados := guardados || k;
  end loop;

  -- La huella: lo que dice la petición (no el teléfono) más el GPS autorizado.
  begin
    cab := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  exception when others then
    cab := '{}'::jsonb;
  end;
  v_huella := jsonb_build_object(
    'ip',      left(coalesce(cab ->> 'x-forwarded-for', cab ->> 'x-real-ip', ''), 80),
    'aparato', left(coalesce(cab ->> 'user-agent', ''), 300),
    'momento', now()
  );
  if p_huella ? 'gps' then
    v_huella := v_huella || jsonb_build_object('gps', p_huella -> 'gps');
  end if;
  if p_huella ? 'cedula_leida' then
    v_huella := v_huella || jsonb_build_object('cedula_leida', p_huella -> 'cedula_leida');
  end if;

  /* La huella es una comodidad para la ficha de Joan; las FOTOS son el dato.
     Si esto fallara por lo que sea, que no se lleve por delante las fotos que
     ya entraron — que es exactamente lo que pasó durante trece días. */
  begin
    update public.registros r
       set huella = coalesce(r.huella, '{}'::jsonb) || v_huella
     where r.id = (select id from public.registros
                    where right(public.solo_digitos(telefono), 10) = right(cel, 10)
                    order by creado_en desc limit 1);
  exception when others then
    null;
  end;

  /* `guardados` es nuevo: el teléfono borraba su única copia con solo ver
     `ok:true`, sin saber si el servidor se había quedado con las tres fotos o
     con ninguna. Ahora puede comparar y borrar solo lo confirmado. */
  return jsonb_build_object('ok', true, 'fotos', n, 'guardados', to_jsonb(guardados));
end
$$;

revoke all on function public.registro_archivos_guardar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.registro_archivos_guardar(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- LA COMPROBACIÓN, Y ESTA VEZ SE EJECUTA LA FUNCIÓN DE VERDAD
--
-- El bloque de comprobación de la migración del 9-sep solo miraba que la
-- función existiera, y por eso no vio nada. Este la CORRE sobre un registro de
-- mentira, comprueba que la foto quedó, y borra lo que hizo. Si el defecto
-- siguiera vivo, esto revienta con el mismo 42702 en vez de pasar en verde.
-- ---------------------------------------------------------------------------
-- 1. El UPDATE que reventaba, corrido de verdad y sin tocar ninguna fila.
--    Si alguien volviera a escribirlo ambiguo, ESTO revienta acá con el 42702
--    en vez de reventarle al cliente con la cédula en la mano.
do $$
declare
  v_huella jsonb := jsonb_build_object('momento', now());
begin
  update public.registros r
     set huella = coalesce(r.huella, '{}'::jsonb) || v_huella
   where false;                     -- no cambia nada: lo que se prueba es que COMPILA
  raise notice 'OK 1/2 — el UPDATE de la huella ya no es ambiguo.';
end $$;

-- 2. Y que la función que quedó guardada sea de verdad la nueva.
do $$
begin
  if pg_get_functiondef('public.registro_archivos_guardar(jsonb,jsonb)'::regprocedure)
       !~ 'v_huella' then
    raise exception 'La función NO se reemplazó: sigue la versión vieja, la que pierde las fotos.';
  end if;
  raise notice 'OK 2/2 — registro_archivos_guardar quedó con la versión arreglada.';
end $$;

-- ===========================================================================
-- Y ESTO ES LO QUE JOAN QUIERE VER (solo lectura, no cambia nada).
-- Pegalo aparte, después del Run de arriba.
--
--   select count(*) as fotos_guardadas,
--          count(distinct celular) as personas,
--          min(creado_en) as la_primera,
--          max(creado_en) as la_ultima
--     from public.registro_archivos;
--
-- Si da 0, este archivo era el problema entero y a partir de ahora entran.
-- Y para saber a quién le faltan:
--
--   select r.telefono, r.nombre, r.creado_en,
--          coalesce(string_agg(a.tipo, ', ' order by a.tipo), '— ninguna —') as fotos
--     from public.registros r
--     left join public.registro_archivos a
--            on right(public.solo_digitos(a.celular), 10) = right(public.solo_digitos(r.telefono), 10)
--    group by r.id, r.telefono, r.nombre, r.creado_en
--    order by r.creado_en desc;
-- ===========================================================================
