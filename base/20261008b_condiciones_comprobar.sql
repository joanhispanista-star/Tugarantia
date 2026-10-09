-- ===========================================================================
-- ¿QUEDÓ PUESTO «PEDIR A LA MEDIDA» Y «ACEPTAR LAS CONDICIONES»? — 8-oct-2026
--
-- PARA JOAN: después de correr base/20261008_condiciones_aceptadas.sql y de
-- «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Existe porque en esta casa ya hubo migraciones «corridas» que nunca
-- llegaron a la base y nadie se enteró en semanas: lo que se comprueba es la
-- base, no el recuerdo de haberla pegado.
-- ===========================================================================
select 1 as n, 'Pedir a la medida: existe y solo con sesión' as que,
       to_regprocedure('public.solicitar_a_la_medida(bigint, date, text)') is not null
       and has_function_privilege('authenticated', 'public.solicitar_a_la_medida(bigint, date, text)', 'execute')
       and not has_function_privilege('anon', 'public.solicitar_a_la_medida(bigint, date, text)', 'execute') as ok,
       'sin ella, la app dice «pedir a la medida todavía no está encendido» y manda al chat' as detalle
union all
select 2, 'Aceptar con las condiciones: existe y solo con sesión',
       to_regprocedure('public.aceptar_condiciones(bigint, jsonb)') is not null
       and has_function_privilege('authenticated', 'public.aceptar_condiciones(bigint, jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.aceptar_condiciones(bigint, jsonb)', 'execute'),
       'sin ella, la app NO deja aceptar: dice que no pudo registrar la aceptación y que te escribe por el chat'
union all
select 3, 'Las dos son volátiles y corren como dueño (security definer)',
       coalesce((select bool_and(p.provolatile = 'v' and p.prosecdef)
                   from pg_proc p
                  where p.pronamespace = 'public'::regnamespace
                    and p.proname in ('solicitar_a_la_medida', 'aceptar_condiciones')), false),
       'una «stable» la sirve PostgREST por GET en solo lectura y no guarda nada'
union all
select 4, 'condiciones_aceptadas: con RLS, sin políticas y cerrada',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.condiciones_aceptadas')), false)
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'condiciones_aceptadas')
       and not has_table_privilege('anon', 'public.condiciones_aceptadas', 'select')
       and not has_table_privilege('authenticated', 'public.condiciones_aceptadas', 'select')
       and not has_table_privilege('authenticated', 'public.condiciones_aceptadas', 'insert'),
       'lo que cada cliente aceptó no se lee ni se escribe desde afuera'
union all
select 5, 'condiciones_aceptadas es de solo agregar',
       exists (select 1 from pg_trigger t
                where t.tgrelid = to_regclass('public.condiciones_aceptadas')
                  and t.tgname = 'condiciones_aceptadas_solo_agregar'
                  and not t.tgisinternal and t.tgenabled <> 'D'),
       'una aceptación que se puede reescribir no prueba nada'
union all
select 6, 'Aceptar usa la función de siempre, no una copia',
       coalesce((select prosrc ~ 'aceptar_contrapropuesta\(p_id\)' and prosrc ~ 'aceptar_propuesta_platachat\(p_id\)'
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'aceptar_condiciones'), false),
       'las rejas de dueño y de cuenta las sigue poniendo aceptar_contrapropuesta'
union all
-- 8-oct-2026 (segunda vuelta): la versión que solo comparaba monto y total
-- dejaba aceptar una propuesta con otra fecha. Si esto sale false, se pegó la
-- versión vieja del archivo.
select 7, 'Aceptar compara también la fecha de pago y cuándo se armó la propuesta',
       coalesce((select prosrc ~ 'creada_en' and prosrc ~ 'fecha_pago'
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'aceptar_condiciones'), false),
       'sin esto, si cambias la fecha de una propuesta mientras el cliente la lee, él acepta la que no vio'
order by 1;
