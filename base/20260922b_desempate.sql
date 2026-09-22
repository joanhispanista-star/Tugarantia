-- 22-sep-2026 — EL DESEMPATE QUE FALTABA EN «LA ÚLTIMA SOLICITUD»
--
-- Lo encontró la prueba de 20260922_a_la_medida_y_ayuda.sql, no una lectura:
-- se pidieron dos créditos seguidos y mi_solicitud devolvió el PRIMERO.
--
-- La causa. Las dos funciones que buscan «la solicitud más reciente» hacen
--     order by creada_en desc limit 1
-- y creada_en viene de now(), que en PostgreSQL es la hora de INICIO DE LA
-- TRANSACCIÓN, no la del reloj. Dos filas creadas en la misma transacción —o,
-- en producción, dos toques rápidos del mismo botón dentro del mismo segundo—
-- quedan con el MISMO creada_en, y entonces el «desc limit 1» escoge cualquiera
-- de las dos. Sin desempate no hay «la última»: hay una al azar.
--
-- Por qué importa ahora y no antes. Hasta ayer el cliente pedía de un menú
-- cerrado y una sola vez. Desde 20260922 pide la cifra que quiera y puede
-- corregirla, así que dos solicitudes seguidas dejaron de ser un caso raro.
-- Y el daño es de los que se ven en plata: Joan contrapropone sobre una fila y
-- el cliente estaría mirando la otra.
--
-- Cómo se arregla sin reescribir las funciones. No se copian aquí sus cuerpos
-- —copiarlos es como se introducen las diferencias entre el repo y la base—:
-- se le pide a PostgreSQL su propia definición con pg_get_functiondef, se
-- cambia esa línea y se vuelve a ejecutar. Si la línea ya no está, no toca
-- nada, así que correr este archivo dos veces no hace daño.
--
-- NO se tocan los «order by creada_en desc» SIN limit 1 (los de las bandejas
-- del CRM): ahí un empate solo cambia el orden de dos filas que se ven las dos.

do $$
declare
  f      text;
  src    text;
  nueva  text;
  viejo  constant text := 'order by creada_en desc limit 1';
  bueno  constant text := 'order by creada_en desc, id desc limit 1';
  n      integer := 0;
begin
  foreach f in array array['mi_solicitud', 'solicitar_primer_credito'] loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p
     where p.proname = f and p.pronamespace = 'public'::regnamespace;

    if src is null then
      raise exception 'no existe public.% en esta base', f;
    end if;

    if position(bueno in src) > 0 then
      continue;                      -- ya tiene el desempate
    end if;

    if position(viejo in src) = 0 then
      raise exception 'public.% no tiene la linea que este arreglo esperaba; revisala a mano antes de seguir', f;
    end if;

    nueva := replace(src, viejo, bueno);
    execute nueva;
    n := n + 1;
  end loop;

  raise notice 'funciones con desempate nuevo: %', n;
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'mi_solicitud' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%creada_en desc, id desc%' then
    raise exception 'mi_solicitud siguio sin desempate';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'solicitar_primer_credito' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%creada_en desc, id desc%' then
    raise exception 'solicitar_primer_credito siguio sin desempate';
  end if;

  -- Y que no se hayan perdido los permisos al recrearlas: pg_get_functiondef
  -- NO trae los grants, y un create or replace los conserva, pero esto lo
  -- comprueba en vez de darlo por hecho.
  if not has_function_privilege('authenticated', 'public.mi_solicitud()', 'execute') then
    raise exception 'mi_solicitud perdio el permiso de la sesion al recrearse';
  end if;
  if has_function_privilege('anon', 'public.mi_solicitud()', 'execute') then
    raise exception 'mi_solicitud quedo abierta sin sesion';
  end if;
end $$;
