-- ===========================================================================
-- EL GERENTE NO SE PROPONE A SÍ MISMO — 19 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- toca ninguna fila. Va DESPUÉS de base/20261015_el_gerente_vende.sql (que crea
-- gerente_proponer): si esa no está, se detiene en el primer bloque y lo dice.
-- Al final sale UNA fila: las CINCO columnas tienen que decir true.
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
--
-- 20-oct-2026, revisión — LA OTRA PUERTA: contrapropuesta_gerente (PlataChat,
-- base/20261005_platachat_solicitud.sql). La primera versión de este archivo
-- solo parchaba gerente_proponer, y la revisión adversaria encontró la misma
-- venta abierta por la función de PlataChat, viva y con EXECUTE para
-- authenticated: Willian pide $300.000 en PlataChat, responsable_de lo pone a
-- él como responsable de su propia solicitud, y con su sesión llamaba
--   POST /rest/v1/rpc/contrapropuesta_gerente(id, 300000, 1, 15, '')
-- y la base le fijaba un 1% (por debajo del 10% que Joan le puso de mínimo).
-- Después aceptaba él mismo. Y por la misma función le proponía $20.000.000 al
-- 1% a 60 días a un cliente de su base, cuando sus topes son $500.000 / 10-20% /
-- 30 días: contrapropuesta_gerente usaba las rejas fijas de Joan (1-50%, hasta
-- 20 millones, hasta 60 días), no topes_equipo, porque es del 15-sep y los
-- topes son del 15-oct.
--
-- Hoy ninguna pantalla la llama (solo la nombran PLAN-PLATACHAT y un
-- comentario del CRM), pero una función con grant a authenticated se llama con
-- curl. Se le pone LO MISMO que tiene gerente_proponer, por el mismo camino
-- (huella md5 + pg_get_functiondef, nunca copiando el cuerpo):
--   · la reja «a sí mismo no», antes de la del alcance, por los tres caminos
--     (el registro del que nació, la columna celular y la cédula con o sin el
--     '0' del hilo de PlataChat);
--   · los topes de Joan (topes_equipo): sin topes no propone ('sin_topes') y
--     fuera de ellos tampoco ('fuera_de_topes'), además de las rejas fijas de
--     siempre, que se quedan. Los motivos son los mismos de gerente_proponer:
--     panel/gerente-vende.js ya tiene las palabras para cada uno.
-- Si la función no existe (PlataChat sin aplicar), no hay puerta que cerrar:
-- se dice y se sigue con lo demás.
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
  -- 20-oct-2026, revisión — la reja de PlataChat lee los topes de Joan.
  if to_regclass('public.topes_equipo') is null then
    raise exception 'Falta base/20261015_el_gerente_vende.sql (topes_equipo). Córrela primero. No se tocó nada.';
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

-- ====== 1b. LA MISMA REJA Y LOS TOPES, EN LA PUERTA DE PLATACHAT ======
-- 20-oct-2026, revisión — ver la cabecera («LA OTRA PUERTA»). Mismo método que
-- el bloque 1: la función viva, su huella contra la que dejó 20261005, y dos
-- parches de texto que tienen que encontrar su línea o no se toca nada.
do $$
declare
  f      regprocedure := to_regprocedure('public.contrapropuesta_gerente(bigint, bigint, integer, integer, text)');
  cuerpo text;
  src    text;
  nueva  text;
  -- La huella del cuerpo que dejó base/20261005_platachat_solicitud.sql, sin \r.
  huella constant text := 'f7812aefb22861128d92a96134c5b310';
begin
  if f is null then
    raise notice 'contrapropuesta_gerente no existe (PlataChat sin aplicar): no hay puerta que cerrar ahí.';
    return;
  end if;
  select p.prosrc into cuerpo from pg_proc p where p.oid = f;

  if position('no_a_ti_mismo' in cuerpo) > 0 then
    raise notice 'contrapropuesta_gerente ya no deja que el gerente se proponga a sí mismo: no se cambió nada.';
    return;
  end if;

  if md5(replace(cuerpo, chr(13), '')) <> huella then
    raise exception 'La definición viva de contrapropuesta_gerente cambió desde el 15-sep-2026 (huella %, esperaba %). Este archivo la parcharía sin saber qué tiene. No se tocó nada: compárala con pg_get_functiondef y avísale a Claude.',
      md5(replace(cuerpo, chr(13), '')), huella;
  end if;

  src := pg_get_functiondef(f);

  -- (a) A SÍ MISMO NO, justo antes de la reja del alcance. Aquí no hay `tel`:
  -- el registro se busca en la misma línea. Si la solicitud no existe, todo
  -- es null, nada casa y sigue a la respuesta de siempre («no es de tu base»),
  -- que no distingue «no existe» de «no es mía».
  nueva := regexp_replace(src,
    $p$if\s+not\s+es_mia\s+then$p$,
    $r$-- 20-oct-2026 (base/20261019_el_gerente_no_se_propone.sql, revisión) —
  -- A SÍ MISMO NO, TAMBIÉN EN PLATACHAT. responsable_de pone al gerente como
  -- responsable de la solicitud que él mismo pidió: sin esto se fijaba el
  -- costo y la aceptaba. Los tres caminos de gerente_proponer: el registro del
  -- que nació, la columna celular y la cédula (con el '0' del hilo aparte).
  if length(right(public.solo_digitos(coalesce(yo.celular, '')), 10)) = 10
     and right(public.solo_digitos(coalesce(yo.celular, '')), 10) in (
           coalesce((select right(public.solo_digitos(r.telefono), 10)
                       from public.registros r where r.id = s.registro_id), ''),
           right(public.solo_digitos(coalesce(s.celular, '')), 10),
           case when public.solo_digitos(coalesce(s.cedula, '')) ~ '^0?3\\d{9}$'
                then right(public.solo_digitos(s.cedula), 10) end) then
    return jsonb_build_object('ok', false, 'motivo', 'no_a_ti_mismo');
  end if;

  if not es_mia then$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en contrapropuesta_gerente la línea «if not es_mia then». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (b) LOS TOPES DE JOAN, después de las rejas fijas y antes de armar la
  -- propuesta: la misma regla que gerente_proponer (sin fila, cerrado).
  src := nueva;
  nueva := regexp_replace(src,
    $p$txt\s+:=\s+left\(btrim\(coalesce\(p_texto$p$,
    $r$-- 20-oct-2026 (base/20261019_el_gerente_no_se_propone.sql, revisión) —
  -- LOS TOPES DE JOAN, TAMBIÉN EN PLATACHAT. Las rejas de arriba son las de
  -- Joan (hasta 20 millones al 1%); las del gerente son las de topes_equipo.
  if not exists (select 1 from public.topes_equipo t where t.id = 1) then
    return jsonb_build_object('ok', false, 'motivo', 'sin_topes');
  end if;
  if exists (select 1 from public.topes_equipo t
              where t.id = 1
                and (p_capital > t.capital_max or p_costo_pct < t.costo_min
                     or p_costo_pct > t.costo_max or p_dias > t.dias_max)) then
    return jsonb_build_object('ok', false, 'motivo', 'fuera_de_topes',
      'topes', (select to_jsonb(t) - 'id' from public.topes_equipo t where t.id = 1));
  end if;

  txt   := left(btrim(coalesce(p_texto$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en contrapropuesta_gerente la línea «txt := left(btrim(coalesce(p_texto…». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
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
  -- 20-oct-2026, revisión — la de PlataChat, igual: la llama el gerente con su
  -- sesión y nadie más. Si no existe, no hay nada que cerrar.
  if to_regprocedure('public.contrapropuesta_gerente(bigint, bigint, integer, integer, text)') is not null then
    execute 'revoke all on function public.contrapropuesta_gerente(bigint, bigint, integer, integer, text) from public, anon, authenticated';
    execute 'grant execute on function public.contrapropuesta_gerente(bigint, bigint, integer, integer, text) to authenticated';
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'revoke all on function public.contrapropuesta_gerente(bigint, bigint, integer, integer, text) from service_role';
    end if;
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

-- 20-oct-2026, revisión — y la de PlataChat: las dos rejas nuevas, en su
-- orden, sin perder ninguna de las de antes, y llamada una vez sin sesión
-- (contesta {ok:false} sin tocar nada).
do $$
declare f regprocedure := to_regprocedure('public.contrapropuesta_gerente(bigint, bigint, integer, integer, text)');
        src text; r jsonb;
begin
  if f is null then
    raise notice 'contrapropuesta_gerente no existe: nada que comprobar ahí.';
    return;
  end if;
  select p.prosrc into src from pg_proc p where p.oid = f;
  if position('no_a_ti_mismo' in src) = 0 or position('topes_equipo' in src) = 0 then
    raise exception 'FALLO: contrapropuesta_gerente no quedó con la reja de «a sí mismo no» y los topes de Joan.';
  end if;
  if position('no_a_ti_mismo' in src) > position('if not es_mia then' in src) then
    raise exception 'FALLO: en contrapropuesta_gerente la reja quedó DESPUÉS de la del alcance.';
  end if;
  if position('fuera de rango' in src) = 0 or position('esa solicitud no es de tu base' in src) = 0
     or position('propuesta_platachat_de' in src) = 0 or position('''responsable'' - ''datos'' - ''cedula'' - ''registro_id''' in src) = 0 then
    raise exception 'FALLO: a contrapropuesta_gerente se le perdió una de las rejas de antes.';
  end if;
  r := public.contrapropuesta_gerente(-1, 0, 0, 0, '');
  if r is distinct from '{"ok": false}'::jsonb then
    raise exception 'FALLO: sin sesión, contrapropuesta_gerente contestó %.', r;
  end if;
  if has_function_privilege('anon', f, 'execute') then
    raise exception 'FALLO: contrapropuesta_gerente quedó al alcance de la llave pública.';
  end if;
  raise notice 'Listo: tampoco por PlataChat (contrapropuesta_gerente) se propone a sí mismo ni se sale de los topes.';
end $$;

notify pgrst, 'reload schema';

-- La fila para Joan: las CINCO en true. La de PlataChat sale true también si
-- la función no existe: no hay puerta que cerrar.
select position('no_a_ti_mismo' in p.prosrc) > 0                                     as tiene_la_reja,
       has_function_privilege('authenticated', p.oid, 'execute')                     as el_gerente_la_puede_llamar,
       not has_function_privilege('anon', p.oid, 'execute')                          as cerrada_a_la_llave_publica,
       coalesce((select position('no_a_ti_mismo' in q.prosrc) > 0
                   from pg_proc q
                  where q.oid = to_regprocedure('public.contrapropuesta_gerente(bigint, bigint, integer, integer, text)')), true)
                                                                                     as platachat_tiene_la_reja,
       coalesce((select position('topes_equipo' in q.prosrc) > 0
                        and not has_function_privilege('anon', q.oid, 'execute')
                   from pg_proc q
                  where q.oid = to_regprocedure('public.contrapropuesta_gerente(bigint, bigint, integer, integer, text)')), true)
                                                                                     as platachat_con_topes_y_cerrada
  from pg_proc p
 where p.oid = 'public.gerente_proponer(bigint, bigint, integer, integer, text)'::regprocedure;

-- ------------------------------------------------------ qué falta probar ---
--   1. Correrlo DOS VECES seguidas: la segunda dice «no se cambió nada».
--   2. Con la cuenta de Willian (#equipo), abrir Registros: si su propia
--      solicitud aparece, NO tiene botón «✏️ Proponer».
--   3. Joan, en 📋 Socios: la solicitud de Willian sale con su celular y el
--      chip «👥 Es de tu equipo: WILLIAN (gerente)»; «✏️ Proponer» de Joan
--      sigue funcionando (contrapropuesta_solicitud no se tocó).
--   4. (20-oct-2026, revisión) Con la sesión de Willian, desde la consola:
--      POST /rest/v1/rpc/contrapropuesta_gerente sobre su propia solicitud de
--      PlataChat contesta {"ok":false,"motivo":"no_a_ti_mismo"}, y sobre la de
--      un cliente suyo con 20.000.000 contesta "fuera_de_topes".
