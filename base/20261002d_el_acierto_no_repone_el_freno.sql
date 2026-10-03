-- ===========================================================================
-- EL ACIERTO YA NO REPONE EL FRENO DE LA CLAVE — 2 de octubre de 2026 (noche)
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- toca ninguna fila. No hace falta «Reload schema». Va DESPUÉS de
-- base/supabase.sql (que crea clave_ok y la secuencia freno_clave).
-- OJO: al final se llama UNA vez a clave_ok con una clave vacía, para que la
-- base compile la función nueva de verdad (ver «QUÉ SE COMPRUEBA»). Eso cuenta
-- como un intento fallido de los 10 del cuarto de hora. Es uno.
--
-- ---------------------------------------------------------------------------
-- EL HUECO
--
-- clave_ok (base/supabase.sql) frena la fuerza bruta contra la clave de
-- sincronización: 10 intentos por cuarto de hora, contados en la secuencia
-- GLOBAL public.freno_clave. Y cada vez que alguien acierta, la vuelve a cero
-- («Clave buena: el mostrador vuelve a cero»). O sea que cada acierto de Joan
-- le devuelve a quien esté probando claves sus 10 intentos.
--
-- Hasta hoy eso se cuidaba desde afuera: el CRM pregunta cada 45 segundos y no
-- más seguido justo por esto (panel/crm.html, «POR QUÉ 45 SEGUNDOS»). Pero
-- desde el 2-oct «🔎 Revisar a todos» (panel/revision.html) hace 3 llamadas más
-- 2 por cada registrado, una detrás de otra: con 200 registrados son ~400
-- aciertos seguidos, ~4.000 intentos de regalo en una sola pasada, y otra vez
-- con cada «↻ Volver a revisar». Espaciar las llamadas no lo arregla: lo que
-- cuenta es CUÁNTOS aciertos hay, no qué tan rápido llegan. El arreglo tiene
-- que estar en la base.
--
-- LO QUE CAMBIA. Un acierto ya no vuelve el freno a cero cada vez:
--   · lo vuelve a cero como mucho UNA vez cada 45 segundos —el mismo ritmo
--     del CRM, que es lo que la casa ya aceptó—;
--   · entre medio, solo descuenta SU PROPIO intento (el que anotó al entrar),
--     así que los aciertos de Joan nunca suman y los fallos ajenos no se
--     perdonan.
-- Joan trabajando normal sigue sin acercarse nunca al tope. Una ventana del
-- navegador con la clave vieja que siga preguntando cada 45 segundos sigue sin
-- dejar afuera a la buena (eso lo sostenía el «a cero» de antes, y se
-- conserva con el perdón de cada 45 segundos).
--
-- POR QUÉ OTRA SECUENCIA. La hora del último perdón tiene que sobrevivir a un
-- rollback, igual que el freno (ver EL FRENO en base/supabase.sql): una tabla
-- se revertiría con la transacción. public.freno_clave_perdon guarda los
-- segundos desde 1970 del último «a cero».
--
-- LA FUNCIÓN NO SE COPIA. Se lee la que está viva con pg_get_functiondef, se
-- cambia SOLO la línea del «a cero» y se vuelve a crear (lección de la casa:
-- copiar un cuerpo a mano ya perdió cosas en silencio). Si esa línea no está
-- como se espera, el archivo para y lo dice, sin tocar nada.
-- ===========================================================================

create sequence if not exists public.freno_clave_perdon;
revoke all on sequence public.freno_clave_perdon from anon, authenticated, public;

do $$
declare
  src   text;
  nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'clave_ok'
     and p.pronamespace = 'public'::regnamespace
     and pg_get_function_identity_arguments(p.oid) = 'p_clave text';
  if src is null then
    raise exception 'No existe public.clave_ok(text): corre primero base/supabase.sql.';
  end if;

  -- Ya aplicada: la segunda corrida no cambia nada.
  if src ~ 'freno_clave_perdon' then
    raise notice 'clave_ok ya perdona como mucho cada 45 segundos: no se cambió nada.';
    return;
  end if;

  -- \s+ entre palabras: pg_get_functiondef no devuelve el texto con los
  -- mismos espacios del archivo (trampa de la casa, 22-sep).
  nueva := regexp_replace(src,
    $p$perform\s+setval\(\s*'public\.freno_clave'\s*,\s*casillero\s*\*\s*1000000000\s*\)\s*;$p$,
    $r$-- 2-oct-2026 (base/20261002d): a cero como mucho cada 45 segundos; si
  -- no, este acierto solo descuenta su propio intento.
  if floor(extract(epoch from clock_timestamp()))::bigint
       - (select last_value from public.freno_clave_perdon) >= 45 then
    perform setval('public.freno_clave', casillero * 1000000000);
    perform setval('public.freno_clave_perdon', floor(extract(epoch from clock_timestamp()))::bigint);
  else
    perform setval('public.freno_clave',
      greatest(casillero * 1000000000, (select last_value from public.freno_clave) - 1));
  end if;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en clave_ok la línea que vuelve el freno a cero. Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end
$$;

-- ---------------------------------------------------------- QUÉ SE COMPRUEBA
-- No basta con que la función exista: PL/pgSQL compila el cuerpo en la
-- PRIMERA LLAMADA (así vivió trece días rota registro_archivos_guardar). Así
-- que se la llama una vez, con una clave vacía, que tiene que dar falso. Y se
-- mira que sigan vivas las piezas de antes: el freno, el tope, la clave.
do $$
declare
  src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'clave_ok' and p.pronamespace = 'public'::regnamespace
     and pg_get_function_identity_arguments(p.oid) = 'p_clave text';
  if src !~ 'freno_clave_perdon' then
    raise exception 'FALLO: clave_ok no quedó con el perdón cada 45 segundos.';
  end if;
  if src !~ $q$nextval\('public\.freno_clave'\)$q$ or src !~ 'intentos\s*>\s*10' or src !~ 'config_privada' then
    raise exception 'FALLO: a clave_ok se le perdió una pieza de antes (el contador, el tope de 10 o la clave guardada).';
  end if;
  if public.clave_ok('') is distinct from false then
    raise exception 'FALLO: clave_ok con una clave vacía no dio falso.';
  end if;
  perform last_value from public.freno_clave_perdon;
  if has_sequence_privilege('anon', 'public.freno_clave_perdon', 'usage')
     or has_sequence_privilege('authenticated', 'public.freno_clave_perdon', 'usage') then
    raise exception 'FALLO: la secuencia del perdón quedó al alcance de la llave pública.';
  end if;
  raise notice 'Listo: un acierto ya no le devuelve a nadie los 10 intentos más de una vez cada 45 segundos.';
end
$$;

-- ------------------------------------------------------ qué falta probar ---
--   1. Correrlo DOS VECES seguidas: la segunda dice «no se cambió nada».
--   2. Abrir el CRM y tocar «↻ Traer de la nube»: tiene que traer como siempre.
--   3. Abrir «🔎 Revisar a todos» con varios registrados: tiene que terminar
--      («Listo: N registros revisados»), sin «Tu clave de sincronización no es
--      la que quedó en la base».
