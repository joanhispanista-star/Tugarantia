-- ===========================================================================
-- ¿QUEDÓ PUESTO «EL ESTIMADO VIAJA»? — 19-oct-2026
--
-- PARA JOAN: después de correr base/20261019_el_estimado_viaja.sql y de
-- «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Existe porque en esta casa ya hubo migraciones «corridas» que nunca
-- llegaron a la base y nadie se enteró en semanas: lo que se comprueba es la
-- base, no el recuerdo de haberla pegado.
-- ===========================================================================
select 1 as n, 'Anotar el estimado: existe y solo con sesión' as que,
       to_regprocedure('public.anotar_estimado(bigint, jsonb)') is not null
       and has_function_privilege('authenticated', 'public.anotar_estimado(bigint, jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.anotar_estimado(bigint, jsonb)', 'execute') as ok,
       'sin ella, el CRM nunca dice «el cliente vio un estimado de $…» y no te avisa si tu propuesta se aleja' as detalle
union all
select 2, 'Es volátil y corre como dueño (security definer)',
       coalesce((select bool_and(p.provolatile = 'v' and p.prosecdef)
                   from pg_proc p
                  where p.pronamespace = 'public'::regnamespace
                    and p.proname = 'anotar_estimado'), false),
       'una «stable» la sirve PostgREST por GET en solo lectura y no guarda nada'
union all
select 3, 'Comprueba que el estimado sea de ESE pedido y no pase el 2%',
       coalesce((select prosrc ~ 'otro_pedido' and prosrc ~ '0\.02' and prosrc ~ 'solicitud_de_la_cuenta'
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'anotar_estimado'), false),
       'si sale false se pegó otra versión del archivo: un estimado inflado callaría el aviso para siempre'
union all
select 4, 'Pedir a la medida sigue siendo la de siempre (no se tocó)',
       to_regprocedure('public.solicitar_a_la_medida(bigint, date, text)') is not null
       and has_function_privilege('authenticated', 'public.solicitar_a_la_medida(bigint, date, text)', 'execute'),
       'el estimado se anota DESPUÉS de pedir; pedir no depende de él'
order by 1;
