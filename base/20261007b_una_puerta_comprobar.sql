-- ===========================================================================
-- ¿QUEDÓ PUESTA LA PUERTA ÚNICA? — 7 de octubre de 2026
--
-- PARA JOAN: después de correr base/20261007_una_puerta.sql y de «Reload
-- schema», pega ESTO en una consulta nueva → Run. No cambia nada: solo mira.
-- Sale una tabla; mándale a Claude los renglones (una foto o copiarlos).
-- Todos tienen que decir ok = true. Si uno dice false, el «detalle» dice qué.
--
-- Se puede volver a correr cuando quieras: es la forma de saber, sin
-- suponerlo, que la base de verdad tiene lo que el repositorio dice (ya hubo
-- migraciones «corridas» que nunca llegaron).
-- ===========================================================================
with
codigo as (
  select string_agg(p.proname, ', ' order by p.proname) as abiertas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('historial_socio_por_codigo', 'crear_solicitud_por_codigo',
                       'cambiar_codigo_acceso', 'chat_leer', 'chat_escribir', 'vincular_cuenta')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
),
-- Las funciones que la llave pública puede llamar y que NO piden la clave de
-- Joan ni una sesión (las de sesión fallan cerradas sin ella: sin JWT,
-- celular_de_sesion y panel_es_dueno no dan a nadie). Lo que quede tiene que
-- ser de la lista conocida, que no devuelve datos de nadie:
--   registrar_abierto, registrar_abierto_app  el registro (escribe, contesta ok)
--   pedir_ayuda_clave                         el recado de contraseña (escribe)
--   canjear_invitacion                        la invitación vieja (contesta ok/motivo)
--   ruleta_premio, ventana_de_cobro           constantes y la hora legal
--   registro_vivo_publicar / _borrar          el avance del registro en vivo
--                                             (20260919): escriben y contestan
--                                             ok/motivo/testigo, nunca una ficha
-- Cualquier otro nombre que salga acá es para mirarlo ANTES de seguir.
anon_sin_clave as (
  select string_agg(p.proname, ', ' order by p.proname) as lista
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.prosrc !~ 'clave_ok'
     and p.prosrc !~ 'celular_de_sesion|panel_es_dueno|auth\.uid\(\)'
     and p.proname not in ('registrar_abierto', 'registrar_abierto_app', 'pedir_ayuda_clave',
                           'canjear_invitacion', 'ruleta_premio', 'ventana_de_cobro',
                           'registro_vivo_publicar', 'registro_vivo_borrar')
),
nuevas as (
  select f.firma, f.rol, f.debe,
         has_function_privilege(f.rol, f.firma, 'execute') as tiene
    from (values
      ('public.vincular_cuenta_joan(text, bigint, text, text, jsonb, text)', 'anon', true),
      ('public.vincular_cuenta_joan(text, bigint, text, text, jsonb, text)', 'authenticated', false),
      ('public.desvincular_cuenta_joan(text, text, text)', 'anon', true),
      ('public.cuentas_de_registros(text, bigint[])', 'anon', true),
      ('public.vinculos_listar(text)', 'anon', true),
      ('public.clave_temporal_joan(text, text, text)', 'anon', true),
      ('public.panel_vincular_cuenta(bigint, text, jsonb, text)', 'authenticated', true),
      ('public.panel_vincular_cuenta(bigint, text, jsonb, text)', 'anon', false),
      ('public.panel_cuentas_de_registros(bigint[])', 'authenticated', true),
      ('public.panel_cuentas_de_registros(bigint[])', 'anon', false),
      ('public.solicitar_por_sesion(jsonb, text, integer)', 'authenticated', true),
      ('public.solicitar_por_sesion(jsonb, text, integer)', 'anon', false),
      ('public.vincular_interna(bigint, text, text, jsonb, text)', 'anon', false),
      ('public.vincular_interna(bigint, text, text, jsonb, text)', 'authenticated', false),
      ('public.desvincular_interna(text, text, text)', 'anon', false),
      ('public.desvincular_interna(text, text, text)', 'authenticated', false),
      ('public.clave_temporal_interna(text, text)', 'anon', false),
      ('public.clave_temporal_interna(text, text)', 'authenticated', false),
      ('public.cuenta_de_celular(text)', 'anon', false),
      ('public.cuenta_de_celular(text)', 'authenticated', false),
      ('public.mi_registro()', 'authenticated', true),
      ('public.mi_registro()', 'anon', false)
    ) as f(firma, rol, debe)
   where to_regprocedure(f.firma) is not null
),
fuente as (
  select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace
)
select 1 as n, 'La entrada con código está cerrada' as que,
       (select abiertas is null from codigo) as ok,
       coalesce('siguen abiertas: ' || (select abiertas from codigo), 'las 6 cerradas') as detalle
union all
select 2, 'Las funciones nuevas existen (14)',
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in (
          'vincular_interna', 'vincular_cuenta_joan', 'panel_vincular_cuenta', 'desvincular_interna',
          'desvincular_cuenta_joan', 'cuentas_de_registros_interna', 'cuentas_de_registros',
          'panel_cuentas_de_registros', 'vinculos_listar', 'solicitar_por_sesion',
          'clave_temporal_interna', 'clave_temporal_joan', 'cuenta_de_celular', 'mi_registro')) = 14,
       (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in (
          'vincular_interna', 'vincular_cuenta_joan', 'panel_vincular_cuenta', 'desvincular_interna',
          'desvincular_cuenta_joan', 'cuentas_de_registros_interna', 'cuentas_de_registros',
          'panel_cuentas_de_registros', 'vinculos_listar', 'solicitar_por_sesion',
          'clave_temporal_interna', 'clave_temporal_joan', 'cuenta_de_celular', 'mi_registro')) || ' de 14'
union all
select 3, 'Cada puerta nueva, abierta solo para quien es',
       (select count(*) = 22 and bool_and(tiene = debe) from nuevas),
       coalesce((select string_agg(firma || ' ' || rol || (case when tiene then ' SÍ' else ' NO' end), '; ')
                   from nuevas where tiene <> debe), 'todas bien')
       || ' (' || (select count(*) from nuevas) || ' de 22 revisadas)'
union all
select 4, 'Lo que la llave pública llama sin clave no devuelve datos de nadie',
       (select lista is null from anon_sin_clave),
       coalesce('revisar: ' || (select lista from anon_sin_clave), 'nada fuera de la lista conocida')
union all
select 5, 'La cuenta sin juntar habla en un hilo aparte (llave_de_sesion)',
       coalesce((select prosrc ~ 'celular_es_de_una_ficha' from fuente where proname = 'llave_de_sesion'), false),
       'si dice false, la cuenta sin juntar lee el chat de la ficha con su número'
union all
select 6, 'Las solicitudes de otro no se ven (3 funciones)',
       (select count(*) from fuente
         where proname in ('mi_solicitud', 'solicitar_primer_credito', 'aceptar_contrapropuesta')
           and prosrc ~ 'solicitud_de_la_cuenta')
       = (select count(*) from fuente
           where proname in ('mi_solicitud', 'solicitar_primer_credito', 'aceptar_contrapropuesta')),
       (select string_agg(proname || case when prosrc ~ 'solicitud_de_la_cuenta' then ' sí' else ' NO' end, ', ')
          from fuente where proname in ('mi_solicitud', 'solicitar_primer_credito', 'aceptar_contrapropuesta'))
union all
select 7, 'mi_cuenta exige la marca de la unión',
       coalesce((select prosrc like '%auth_vinculada_en is not null%' from fuente where proname = 'mi_cuenta'), false),
       'sin esto, cualquiera que registre un número ajeno vería ese historial'
union all
select 8, 'public.vinculos: con RLS y cerrada',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.vinculos')), false)
       and not has_table_privilege('anon', 'public.vinculos', 'select')
       and not has_table_privilege('authenticated', 'public.vinculos', 'select'),
       'el registro de quién juntó qué no se lee desde afuera'
union all
select 9, 'Un teléfono, una ficha (el índice único)',
       exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'socios_un_telefono_una_ficha'),
       'base/20260922h'
union all
select 10, 'Borrar una cuenta suelta su unión (disparador)',
       exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                 join pg_namespace s on s.oid = c.relnamespace
                where s.nspname = 'auth' and c.relname = 'users'
                  and t.tgname = 'desvincular_al_borrar' and not t.tgisinternal),
       'si dice false, una cuenta borrada y vuelta a crear por otro heredaría la ficha'
union all
select 11, 'Cuentas juntas hoy (cuántas y cuántas anotadas)',
       (select count(*) from public.socios_historial where auth_vinculada_en is not null)
       = (select count(*) from public.vinculos where deshecho_en is null),
       (select count(*) from public.socios_historial where auth_vinculada_en is not null)::text
       || ' fichas juntas; ' ||
       (select count(*) from public.vinculos where deshecho_en is null)::text || ' anotadas en vinculos'
order by 1;
