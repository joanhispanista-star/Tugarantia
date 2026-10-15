-- ===========================================================================
-- ¿QUEDÓ PUESTO «EL GERENTE VENDE»? — 15-oct-2026
--
-- PARA JOAN: después de correr base/20261015_el_gerente_vende.sql y de
-- «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Lo que se comprueba es la base, no el recuerdo de haberla pegado: en esta
-- casa ya hubo migraciones «corridas» que nunca llegaron.
-- ===========================================================================
select 1 as n, 'Las tres funciones del gerente existen y solo abren con sesión' as que,
       to_regprocedure('public.gerente_registros()') is not null
       and to_regprocedure('public.gerente_archivos(text)') is not null
       and to_regprocedure('public.gerente_proponer(bigint, bigint, integer, integer, text)') is not null
       and has_function_privilege('authenticated', 'public.gerente_registros()', 'execute')
       and has_function_privilege('authenticated', 'public.gerente_archivos(text)', 'execute')
       and has_function_privilege('authenticated', 'public.gerente_proponer(bigint, bigint, integer, integer, text)', 'execute')
       and not has_function_privilege('anon', 'public.gerente_registros()', 'execute')
       and not has_function_privilege('anon', 'public.gerente_archivos(text)', 'execute')
       and not has_function_privilege('anon', 'public.gerente_proponer(bigint, bigint, integer, integer, text)', 'execute') as ok,
       'sin ellas, Willian ve «Registros todavía no está encendido» y no puede proponer' as detalle
union all
select 2, 'Las cuatro de Joan existen y piden su clave (llave pública)',
       to_regprocedure('public.topes_equipo_guardar(text, bigint, integer, integer, integer)') is not null
       and to_regprocedure('public.topes_equipo_leer(text)') is not null
       and to_regprocedure('public.registro_asignar(text, text, text)') is not null
       and to_regprocedure('public.registros_quien_ve(text)') is not null
       and has_function_privilege('anon', 'public.topes_equipo_guardar(text, bigint, integer, integer, integer)', 'execute')
       and has_function_privilege('anon', 'public.registro_asignar(text, text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.registro_asignar(text, text, text)', 'execute'),
       'sin ellas, en tu CRM no salen los topes del equipo ni el botón de asignar un registro'
union all
select 3, 'Las reglas internas no se pueden llamar desde afuera',
       not has_function_privilege('anon', 'public.registro_en_mi_alcance(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.registro_en_mi_alcance(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.gerente_de_sesion()', 'execute'),
       'si se pudieran llamar, cualquiera podría preguntar de quién es un celular'
union all
select 4, 'Las tres tablas nuevas: con RLS, sin políticas y cerradas',
       coalesce((select bool_and(c.relrowsecurity) from pg_class c
                  where c.oid in (to_regclass('public.registros_asignados'),
                                  to_regclass('public.topes_equipo'),
                                  to_regclass('public.vistas_de_datos'))), false)
       and (select count(*) from pg_class c
             where c.oid in (to_regclass('public.registros_asignados'),
                             to_regclass('public.topes_equipo'),
                             to_regclass('public.vistas_de_datos'))) = 3
       and not exists (select 1 from pg_policies where schemaname = 'public'
                        and tablename in ('registros_asignados', 'topes_equipo', 'vistas_de_datos'))
       and not has_table_privilege('authenticated', 'public.vistas_de_datos', 'select')
       and not has_table_privilege('anon', 'public.registros_asignados', 'select'),
       'nadie las lee ni las escribe desde afuera: solo las funciones'
union all
select 5, 'El rastro de quién vio las fotos es de solo agregar',
       exists (select 1 from pg_trigger t
                where t.tgrelid = to_regclass('public.vistas_de_datos')
                  and t.tgname = 'vistas_de_datos_solo_agregar'
                  and not t.tgisinternal and t.tgenabled <> 'D'),
       'un rastro que se puede borrar no prueba nada ante un reclamo'
union all
select 6, 'Las fotos dejan rastro ANTES de entregarse',
       coalesce((select prosrc ~ 'insert into public\.vistas_de_datos' and p.provolatile = 'v'
                   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'gerente_archivos'), false),
       'una «stable» corre en solo lectura y el rastro no se escribiría'
union all
select 7, 'La propuesta del gerente sale de la misma función que la tuya',
       coalesce((select prosrc ~ 'contrapropuesta_de\(' and prosrc ~ 'topes_equipo'
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'gerente_proponer'), false),
       'si saliera de otra, el cliente podría aceptar algo con otra forma que las condiciones no reconocen'
union all
select 8, 'Repartir ya aguanta reasignar el mismo día',
       coalesce((select prosrc ~ 'on conflict \(persona_id, desde\)'
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'asignar_a'), false),
       'sin esto, repartir a alguien el mismo día que publicaste falla entero'
union all
select 9, '¿Ya pusiste los topes? (si sale false, ve a Ajustes → Topes del equipo)',
       exists (select 1 from public.topes_equipo where id = 1),
       'sin topes el gerente ve las solicitudes pero NO puede proponer: está cerrado por defecto'
order by 1;
