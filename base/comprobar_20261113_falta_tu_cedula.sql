-- ===========================================================================
-- ¿QUEDÓ PUESTO «FALTA TU CÉDULA»? — 13-nov-2026
--
-- PARA JOAN: después de correr base/20261113_falta_tu_cedula.sql y de
-- «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Existe porque en esta casa ya hubo migraciones «corridas» que nunca
-- llegaron a la base y nadie se enteró en semanas: lo que se comprueba es la
-- base, no el recuerdo de haberla pegado. Sin la función, la app no muestra
-- la tarjeta de «falta tu cédula» (no dice nada que no sepa): por eso un
-- false aquí no se ve en ningún teléfono, solo aquí.
--
-- POR QUÉ NO EMPIEZA CON LA FECHA, como 20261019b_el_estimado_comprobar.sql:
-- todo lo que empieza con ocho dígitos es una migración (las pruebas de
-- PostgreSQL las corren todas, en orden), y desde 20261022d cada migración se
-- para en su paso 0 si falta la del equipo (pruebas/el-lote-del-27-junto.test.js).
-- Esto no es una migración: no crea nada y se puede pegar cuantas veces se
-- quiera.
-- ===========================================================================
select 1 as n, 'La función existe y solo la llama una sesión de cliente (ni la llave pública)' as que,
       case when to_regprocedure('public.mis_fotos_del_registro()') is null then false
            else has_function_privilege('authenticated', 'public.mis_fotos_del_registro()', 'execute')
                 and not has_function_privilege('anon', 'public.mis_fotos_del_registro()', 'execute') end as ok,
       'sin ella, la app del cliente no sabe si le falta la cédula y no muestra la tarjeta' as detalle
union all
select 2, 'Es de solo lectura, corre como dueña y con search_path fijo',
       coalesce((select p.provolatile = 's' and p.prosecdef
                        and coalesce(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
                   from pg_proc p where p.oid = to_regprocedure('public.mis_fotos_del_registro()')), false),
       'sin security definer no puede mirar registro_archivos; sin search_path fijo, alguien podría ponerle otra tabla delante'
union all
select 3, 'No devuelve ninguna foto: solo si existe',
       coalesce((select position('imagen' in p.prosrc) = 0 and position('archivos_de_registro' in p.prosrc) = 0
                   from pg_proc p where p.oid = to_regprocedure('public.mis_fotos_del_registro()')), false),
       'si sale false se pegó otra versión: la cédula no tiene que viajar al teléfono'
union all
select 4, 'Sin sesión contesta ok:false (y compila)',
       case when to_regprocedure('public.mis_fotos_del_registro()') is null then false
            else coalesce((public.mis_fotos_del_registro() ->> 'ok') = 'false', false) end,
       'si da error en vez de false, el cuerpo no compila: avísale a Claude con el mensaje'
union all
select 5, 'Lee la autorización de datos sensibles igual que la subida',
       coalesce((select position('''autorizacion'' ->> ''sensibles''' in p.prosrc) > 0
                   from pg_proc p where p.oid = to_regprocedure('public.mis_fotos_del_registro()')), false)
       and coalesce((select position('sin_autorizacion' in p.prosrc) > 0
                       from pg_proc p where p.oid = to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)')), false),
       'si no, la app pediría (o no) el permiso al revés de lo que la base va a exigir al subir'
union all
select 6, 'La subida sigue siendo registro_archivos_guardar, solo con sesión',
       case when to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)') is null then false
            else has_function_privilege('authenticated', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute') end,
       'es la misma de play/: si dejó de ser llamable con sesión, nadie sube fotos'
order by 1;
