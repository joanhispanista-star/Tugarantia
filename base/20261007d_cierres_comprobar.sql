-- ===========================================================================
-- ¿QUEDARON PUESTOS LOS CIERRES? — 7 de octubre de 2026 (segunda vuelta)
--
-- PARA JOAN: después de correr base/20261007c_una_puerta_cierres.sql y de
-- «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Mira también dos cosas de 20261007_una_puerta.sql que nacieron en la
-- segunda vuelta (el nombre al juntar y las claves nuevas), porque si ese
-- archivo se pegó ANTES de la segunda vuelta, la base tiene la versión vieja
-- y hay que volver a pegarlo (es idempotente).
-- ===========================================================================
with
fuente as (
  select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace
),
devuelven as (
  select proname,
         prosrc ~ '''solicitud'',\s*to_jsonb\(s\)(\s*-\s*''responsable'')?\s*[,)]' as crudo
    from fuente
   where proname in ('solicitar_primer_credito', 'mi_solicitud', 'aceptar_contrapropuesta',
                     'solicitar_platachat', 'mi_solicitud_platachat',
                     'aceptar_propuesta_platachat', 'reproponer_platachat')
)
select 1 as n, 'Juntar mira el nombre de la ficha (la versión nueva de la puerta)' as que,
       to_regprocedure('public.vincular_interna(bigint, text, text, jsonb, text)') is not null
       and to_regprocedure('public.vincular_interna(bigint, text, text, jsonb)') is null
       and to_regprocedure('public.vincular_cuenta_joan(text, bigint, text, text, jsonb)') is null
       and to_regprocedure('public.panel_vincular_cuenta(bigint, text, jsonb)') is null as ok,
       'si dice false, vuelve a pegar base/20261007_una_puerta.sql (la versión de la segunda vuelta)' as detalle
union all
select 2, 'Juntar pide clave nueva cuando la cuenta es más vieja que el registro (en las 3 puertas)',
       coalesce((select prosrc ~ 'claves_nuevas' and prosrc !~ 'if\s+p_por\s*=\s*''aprobacion''\s+then\s+if\s+c_creada'
                   from fuente where proname = 'vincular_interna'), false),
       'sin esto, la cuenta del que se adelantó con el número de un cliente ve su deuda'
union all
select 3, 'public.claves_nuevas: con RLS y cerrada',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.claves_nuevas')), false)
       and not has_table_privilege('anon', 'public.claves_nuevas', 'select')
       and not has_table_privilege('authenticated', 'public.claves_nuevas', 'select'),
       'quién recibió una clave nueva no se lee desde afuera'
union all
select 4, 'La clave nueva no toca cuentas del equipo',
       coalesce((select prosrc ~ 'panel_duenos' and prosrc ~ 'equipo' from fuente where proname = 'clave_temporal_interna'), false),
       'sin esto, la clave de sincronización alcanza para volverse un gerente'
union all
select 5, 'Deshacer devuelve el chat al hilo que esa cuenta lee',
       coalesce((select prosrc ~ 'case\s+when\s+public\.celular_es_de_una_ficha\(cel\)' from fuente where proname = 'desvincular_interna'), false),
       'si dice false, el cliente que cambió de número pierde su chat al deshacer'
union all
select 6, 'Fichas con cédula pueden subir (codigo_propio acepta NULL)',
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema = 'public' and table_name = 'socios_historial' and column_name = 'codigo_propio'),
       'si dice false, toda subida con una ficha con cédula falla entera'
union all
select 7, 'Las solicitudes de un cliente guardan solo SU registro (disparador)',
       exists (select 1 from pg_trigger t
                where t.tgrelid = 'public.solicitudes'::regclass and t.tgname = 'solicitud_de_sesion'
                  and not t.tgisinternal and t.tgenabled <> 'D'),
       'sin esto, quien registra un número ajeno recibe la cédula y la dirección de otro'
union all
select 8, 'Ninguna función del cliente devuelve datos ni registro_id (7)',
       (select count(*) = 7 and bool_and(not crudo) from devuelven),
       coalesce((select string_agg(proname, ', ') from devuelven where crudo), 'las 7 limpias')
       || ' (' || (select count(*) from devuelven) || ' de 7 en esta base)'
union all
select 9, 'sincronizar_socios: la unión y el chat solo viajan con la misma persona',
       coalesce((select prosrc ~ 'fila_vieja_es_de' from fuente where proname = 'sincronizar_socios'), false),
       'si dice false, una subida puede darle a una cuenta la ficha de otra persona'
union all
select 10, 'Lo nuevo es de adentro: nadie de afuera lo llama',
       not has_function_privilege('anon', 'public.solicitud_de_sesion_guarda()', 'execute')
       and not has_function_privilege('authenticated', 'public.solicitud_de_sesion_guarda()', 'execute')
       and not has_function_privilege('anon', 'public.fila_vieja_es_de(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.fila_vieja_es_de(text, text)', 'execute')
       and not has_function_privilege('anon', 'public.mismo_nombre(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.mismo_nombre(text, text)', 'execute')
       and not has_function_privilege('anon', 'public.union_que_no_viaja(text, text, timestamptz)', 'execute'),
       'ayudantes internos'
order by 1;
