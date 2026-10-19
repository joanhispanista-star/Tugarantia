-- ===========================================================================
-- EL GERENTE NO SE PROPONE A SÍ MISMO — 19 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- toca ninguna fila. Va DESPUÉS de base/20261015_el_gerente_vende.sql (que crea
-- gerente_proponer): si esa no está, se detiene en el primer bloque y lo dice.
-- Al final sale UNA fila: las tres columnas tienen que decir true.
--
-- ---------------------------------------------------------------------------
-- EL HUECO
--
-- Willian, el gerente, entró a la app como cliente y pidió $300.000. Eso es
-- legítimo: alguien del equipo puede ser cliente. Lo que no puede es ponerse él
-- mismo las condiciones. gerente_proponer (20261015) deja proponer sobre
-- cualquier solicitud cuyo celular esté en el alcance del gerente —su base o un
-- registro que Joan le asignó—, y nada impide que ese celular sea EL SUYO: basta
-- con que su número esté en la cartera como prospecto de él, o que Joan le
-- asigne su propio registro sin darse cuenta. Entonces Willian se propone un
-- crédito a sí mismo, con el costo más bajo de los topes, y le llega a Joan
-- como «la puso WILLIAN, tu gerente» para desembolsar.
--
-- LO QUE CAMBIA. Antes de mirar el alcance, gerente_proponer compara el celular
-- del gerente con el de la solicitud por los TRES caminos que la función ya
-- usa (el registro del que nació, su columna celular y la cédula que guarda el
-- celular mientras la cuenta no está junta), no solo por el que gana arriba: si
-- cualquiera es el suyo, contesta 'no_a_ti_mismo' y no toca nada. La propuesta
-- de un gerente que es cliente la hace Joan, como la de cualquier cliente
-- (contrapropuesta_solicitud, que no cambia).
--
-- LA FUNCIÓN NO SE COPIA. Se lee la que está viva con pg_get_functiondef, se le
-- mete el bloque nuevo justo antes de la línea del alcance y se vuelve a crear
-- (lección de la casa: copiar un cuerpo a mano ya perdió cosas en silencio; ver
-- 20261002d). Y antes de tocarla se compara la huella (md5 del cuerpo sin \r)
-- con la que dejó 20261015: si alguien la cambió desde entonces, el archivo
-- para y lo dice, sin tocar nada.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
do $$
begin
  if to_regprocedure('public.gerente_proponer(bigint, bigint, integer, integer, text)') is null
     or to_regprocedure('public.gerente_de_sesion()') is null
     or to_regprocedure('public.registro_en_mi_alcance(text, text)') is null then
    raise exception 'Falta base/20261015_el_gerente_vende.sql (gerente_proponer). Córrela primero. No se tocó nada.';
  end if;
  if to_regprocedure('public.solo_digitos(text)') is null then
    raise exception 'Falta base/supabase.sql (solo_digitos). No se tocó nada.';
  end if;
end $$;

-- ====== 1. LA REJA, DENTRO DE LA FUNCIÓN VIVA ======
do $$
declare
  f      regprocedure := 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure;
  cuerpo text;
  src    text;
  nueva  text;
  -- La huella del cuerpo que dejó base/20261015_el_gerente_vende.sql, sin \r
  -- (si se pegó desde Windows, el cuerpo los conserva).
  huella constant text := '371ad2eed1af3fed4335581b8f4ff607';
begin
  select p.prosrc into cuerpo from pg_proc p where p.oid = f;

  -- Ya aplicada: la segunda corrida no cambia nada.
  if position('no_a_ti_mismo' in cuerpo) > 0 then
    raise notice 'gerente_proponer ya no deja que el gerente se proponga a sí mismo: no se cambió nada.';
    return;
  end if;

  if md5(replace(cuerpo, chr(13), '')) <> huella then
    raise exception 'La definición viva de gerente_proponer cambió desde el 15-oct-2026 (huella %, esperaba %). Este archivo la parcharía sin saber qué tiene. No se tocó nada: compárala con pg_get_functiondef y avísale a Claude.',
      md5(replace(cuerpo, chr(13), '')), huella;
  end if;

  src := pg_get_functiondef(f);
  -- \s+ entre palabras: pg_get_functiondef no devuelve el texto con los mismos
  -- espacios del archivo (trampa de la casa, 22-sep). El reemplazo vuelve a
  -- escribir la línea del alcance tal cual, debajo del bloque nuevo. Y en el
  -- texto de reemplazo la barra va doble (\\d): regexp_replace se come una.
  nueva := regexp_replace(src,
    $p$if\s+public\.registro_en_mi_alcance\(\s*yo\.celular\s*,\s*tel\s*\)\s+is\s+null\s+then$p$,
    $r$-- 19-oct-2026 (base/20261019_el_gerente_no_se_propone.sql) — A SÍ MISMO
  -- NO. El gerente que pide como cliente no se pone él mismo las condiciones:
  -- se mira su celular contra los tres caminos de arriba, no solo contra el
  -- que ganó (`tel` ya es el del registro cuando lo hay; la columna celular es
  -- el de la sesión que pidió; y la cédula, también con el '0' del hilo de
  -- PlataChat). La propuesta se la hace Joan.
  if length(right(public.solo_digitos(coalesce(yo.celular, '')), 10)) = 10
     and right(public.solo_digitos(coalesce(yo.celular, '')), 10) in (
           coalesce(tel, ''),
           right(public.solo_digitos(coalesce(s.celular, '')), 10),
           case when public.solo_digitos(coalesce(s.cedula, '')) ~ '^0?3\\d{9}$'
                then right(public.solo_digitos(s.cedula), 10) end) then
    return jsonb_build_object('ok', false, 'motivo', 'no_a_ti_mismo');
  end if;

  if public.registro_en_mi_alcance(yo.celular, tel) is null then$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en gerente_proponer la línea «if public.registro_en_mi_alcance(yo.celular, tel) is null then». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end $$;

-- ====== 2. PERMISOS ======
-- Explícitos, aunque create or replace conserve los de antes: en Supabase el
-- EXECUTE a anon y authenticated viene por defecto, y `revoke ... from public`
-- no cierra nada. La llama el gerente con su sesión, y nadie más.
revoke all on function public.gerente_proponer(bigint, bigint, integer, integer, text) from public, anon, authenticated;
grant  execute on function public.gerente_proponer(bigint, bigint, integer, integer, text) to authenticated;
do $$
begin
  -- service_role no la necesita: sin sesión, la función contesta 'solo_gerente'.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.gerente_proponer(bigint, bigint, integer, integer, text) from service_role';
  end if;
end $$;

-- ====== 3. QUÉ SE COMPRUEBA ======
-- No basta con que el texto esté: PL/pgSQL compila el cuerpo en la PRIMERA
-- LLAMADA (así vivió trece días rota registro_archivos_guardar). Se la llama
-- una vez sin sesión, que tiene que contestar 'solo_gerente' sin tocar nada. Y
-- se mira que no se le haya caído ninguna de las rejas de antes.
do $$
declare src text; r jsonb;
begin
  select p.prosrc into src from pg_proc p
   where p.oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure;
  if position('no_a_ti_mismo' in src) = 0 then
    raise exception 'FALLO: gerente_proponer no quedó con la reja de «a sí mismo no».';
  end if;
  if position('no_a_ti_mismo' in src) > position('registro_en_mi_alcance' in src) then
    raise exception 'FALLO: la reja quedó DESPUÉS de la del alcance.';
  end if;
  if src !~ 'solo_gerente' or src !~ 'no_esta_abierta' or src !~ 'no_es_tuyo'
     or src !~ 'sin_topes' or src !~ 'fuera_de_topes' or src !~ 'contrapropuesta_de' then
    raise exception 'FALLO: a gerente_proponer se le perdió una de las rejas de antes.';
  end if;
  r := public.gerente_proponer(-1, 0, 0, 0, '');
  if r ->> 'motivo' is distinct from 'solo_gerente' then
    raise exception 'FALLO: sin sesión, gerente_proponer contestó % y no solo_gerente.', r;
  end if;
  if has_function_privilege('anon', 'public.gerente_proponer(bigint, bigint, integer, integer, text)', 'execute') then
    raise exception 'FALLO: gerente_proponer quedó al alcance de la llave pública.';
  end if;
  raise notice 'Listo: el gerente ya no se puede proponer un crédito a sí mismo.';
end $$;

notify pgrst, 'reload schema';

-- La fila para Joan: las tres en true.
select position('no_a_ti_mismo' in p.prosrc) > 0                                     as tiene_la_reja,
       has_function_privilege('authenticated', p.oid, 'execute')                     as el_gerente_la_puede_llamar,
       not has_function_privilege('anon', p.oid, 'execute')                          as cerrada_a_la_llave_publica
  from pg_proc p
 where p.oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure;

-- ------------------------------------------------------ qué falta probar ---
--   1. Correrlo DOS VECES seguidas: la segunda dice «no se cambió nada».
--   2. Con la cuenta de Willian (#equipo), abrir Registros: si su propia
--      solicitud aparece, NO tiene botón «✏️ Proponer».
--   3. Joan, en 📋 Socios: la solicitud de Willian sale con su celular y el
--      chip «👥 Es de tu equipo: WILLIAN (gerente)»; «✏️ Proponer» de Joan
--      sigue funcionando (contrapropuesta_solicitud no se tocó).
