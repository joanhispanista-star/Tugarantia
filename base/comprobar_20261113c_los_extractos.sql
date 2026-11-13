-- ===========================================================================
-- ¿QUEDARON PUESTOS LOS EXTRACTOS? — 13-nov-2026
--
-- PARA JOAN: después de correr base/20261113c_los_extractos.sql y de
-- «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Existe porque en esta casa ya hubo migraciones «corridas» que nunca
-- llegaron a la base y nadie se enteró en semanas: lo que se comprueba es la
-- base, no el recuerdo de haberla pegado. Sin las funciones, el registro no
-- ofrece el paso «Tus extractos» y la cuenta no muestra la tarjeta (no dice
-- nada falso): por eso un false aquí no se ve en ningún teléfono, solo aquí.
--
-- POR QUÉ NO EMPIEZA CON LA FECHA: todo lo que empieza con ocho dígitos es una
-- migración (las pruebas de PostgreSQL las corren todas, en orden), y desde
-- 20261022d cada migración se para en su paso 0 si falta la del equipo
-- (pruebas/el-lote-del-27-junto.test.js). Esto no es una migración: no crea
-- nada y se puede pegar cuantas veces se quiera.
-- ===========================================================================
select 1 as n, 'Las dos tablas existen, con RLS, sin políticas y cerradas a la llave pública y a las sesiones' as que,
       case when to_regclass('public.extracto_autorizaciones') is null or to_regclass('public.extracto_archivos') is null then false
            else (select bool_and(c.relrowsecurity) from pg_class c
                   where c.oid in ('public.extracto_autorizaciones'::regclass, 'public.extracto_archivos'::regclass))
                 and not exists (select 1 from information_schema.table_privileges
                                  where table_schema = 'public' and table_name in ('extracto_autorizaciones', 'extracto_archivos')
                                    and grantee in ('anon', 'authenticated', 'PUBLIC'))
                 and not exists (select 1 from pg_policies
                                  where schemaname = 'public' and tablename in ('extracto_autorizaciones', 'extracto_archivos')) end as ok,
       'si sale false, alguien abrió las tablas: los extractos de todos quedarían a la vista de cualquier sesión' as detalle
union all
select 2, 'Autorizar, subir, mirar, quitar y retirar: solo una sesión de cliente (ni la llave pública)',
       coalesce((select bool_and(to_regprocedure(f) is not null
                                 and has_function_privilege('authenticated', f, 'execute')
                                 and not has_function_privilege('anon', f, 'execute'))
                   from unnest(array['public.extracto_autorizar(text, text)', 'public.extracto_subir(text)', 'public.extracto_mia()',
                                     'public.extracto_quitar(bigint)', 'public.extracto_retirar()']) f), false),
       'sin ellas el paso y la tarjeta no aparecen; con anon, cualquiera sin cuenta podría escribir'
union all
select 3, 'Resumen, detalle, archivo y borrar: solo con tu clave (llave pública + clave), nunca con una sesión',
       coalesce((select bool_and(to_regprocedure(f) is not null
                                 and has_function_privilege('anon', f, 'execute')
                                 and not has_function_privilege('authenticated', f, 'execute'))
                   from unnest(array['public.extracto_resumen(text)', 'public.extracto_de(text, text)',
                                     'public.extracto_archivo(text, bigint)', 'public.extracto_borrar(text, text)']) f), false),
       'si una sesión las pudiera llamar, un cliente (o tu equipo) vería los extractos de otros'
union all
select 4, 'Todas corren como dueñas y con search_path fijo; las tuyas son volátiles',
       coalesce((select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
                                 and (p.proname not in ('extracto_resumen', 'extracto_de', 'extracto_archivo', 'extracto_borrar')
                                      or p.provolatile = 'v'))
                   from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname like 'extracto\_%'), false)
       and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public' and p.proname like 'extracto\_%') = 10,
       'sin search_path fijo, alguien podría ponerle otra tabla delante; sin volátil, tu clave no anota los intentos fallidos'
union all
select 5, 'Ninguna función del equipo ni de otra parte lee los extractos',
       not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname not like 'extracto\_%'
                      and p.prosrc ~ 'extracto_archivos|extracto_autorizaciones'),
       'si sale false, una función que no es de los extractos los lee: puede que se los devuelva a quien no debe'
union all
select 6, 'Al borrar una cuenta se borran sus extractos (el disparador existe)',
       exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'extracto_al_borrar_la_cuenta'),
       'sin él, una cuenta borrada a mano en Supabase dejaría sus extractos; «🗑 Borrar sus extractos» del CRM sigue sirviendo'
union all
select 7, 'Subir tiene su cortacircuito de 50 MB, y el tope que ves en 📥 Registrados es el mismo',
       case when to_regprocedure('public.extracto_subir(text)') is null or to_regprocedure('public.extracto_resumen(text)') is null then false
            else pg_get_functiondef('public.extracto_subir(text)'::regprocedure)
                   like '%if pg_total_relation_size(''public.extracto_archivos'') > 50 * 1024 * 1024 then%'
                 and pg_get_functiondef('public.extracto_resumen(text)'::regprocedure) like '%''tope'', 50 * 1024 * 1024%' end,
       'si sale false se pegó otra versión: los extractos podrían llenar la base y dejarla de solo lectura'
union all
select 8, 'Sin sesión, mirar lo suyo contesta que no (y compila)',
       case when to_regprocedure('public.extracto_mia()') is null then false
            else coalesce((public.extracto_mia() ->> 'motivo') = 'sin_sesion', false) end,
       'si da error en vez de false, el cuerpo no compila: avísale a Claude con el mensaje'
union all
select 9, 'Hoy los extractos ocupan ' || coalesce(pg_size_pretty(pg_total_relation_size(to_regclass('public.extracto_archivos'))), '(la tabla no existe)') || ' de 50 MB',
       to_regclass('public.extracto_archivos') is not null,
       'solo informa: desde 40 MB (el 80 %) también lo dice una línea en 📥 Registrados'
order by 1;
