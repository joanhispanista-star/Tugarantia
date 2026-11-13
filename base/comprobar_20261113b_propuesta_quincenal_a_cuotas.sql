-- ===========================================================================
-- ¿QUEDÓ PUESTA LA PROPUESTA QUINCENAL A CUOTAS? — 13-nov-2026
--
-- PARA JOAN: después de correr base/20261113b_propuesta_quincenal_a_cuotas.sql
-- y de «Reload schema», pega ESTO en una consulta nueva → Run. No cambia nada:
-- solo mira. Todos los renglones tienen que decir ok = true; si uno dice
-- false, el «detalle» dice qué. Mándale a Claude la tabla.
--
-- Existe porque en esta casa ya hubo migraciones «corridas» que nunca
-- llegaron a la base y nadie se enteró en semanas: lo que se comprueba es la
-- base, no el recuerdo de haberla pegado. Sin la función, el botón
-- «Mandarle esta propuesta» de «A cuotas» en el CRM dice que falta este
-- archivo y no manda nada: las otras dos formas siguen como siempre.
--
-- Las filas 5 a 7 llaman la revisión de las cifras con una fecha fija (el
-- 16-oct-2026, el día del caso de Joan): no escriben nada y no gastan
-- intentos de la clave. Es la misma tabla del final de la migración, con la
-- columna «detalle».
--
-- POR QUÉ NO EMPIEZA CON LA FECHA: todo lo que empieza con ocho dígitos es
-- una migración (las pruebas de PostgreSQL las corren todas, en orden).
-- ===========================================================================
select 1 as n, 'La propuesta a cuotas existe y la llama tu CRM con la llave pública, no una sesión de cliente' as que,
       case when to_regprocedure('public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)') is null then false
            else has_function_privilege('anon', 'public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)', 'execute')
                 and not has_function_privilege('authenticated', 'public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)', 'execute') end as ok,
       'sin ella, «Mandarle esta propuesta» de «A cuotas» dice que falta este archivo; si una sesión de cliente la pudiera llamar, se cambiaría su propia propuesta' as detalle
union all
select 2, 'Es volátil (pasa por clave_ok), corre como dueña y con search_path fijo',
       coalesce((select p.provolatile = 'v' and p.prosecdef
                        and coalesce(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
                   from pg_proc p where p.oid = to_regprocedure('public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)')), false),
       'si sale false, se pegó otra versión: una stable devolvería 25006 siempre'
union all
select 3, 'Mira tu clave antes que todo lo demás',
       coalesce((select position('clave_ok(p_clave)' in p.prosrc) > 0
                        and position('clave_ok(p_clave)' in p.prosrc) < position('propuesta_quincenal_a_cuotas_revisar' in p.prosrc)
                        and position('clave_ok(p_clave)' in p.prosrc) < position('update public.solicitudes' in p.prosrc)
                   from pg_proc p where p.oid = to_regprocedure('public.contrapropuesta_quincenal_a_cuotas(text, bigint, jsonb)')), false),
       'si sale false, la función hace algo antes de mirar la clave: avísale a Claude'
union all
select 4, 'La revisión de las cifras no la llama nadie de afuera',
       case when to_regprocedure('public.propuesta_quincenal_a_cuotas_revisar(jsonb, date)') is null then false
            else not has_function_privilege('anon', 'public.propuesta_quincenal_a_cuotas_revisar(jsonb, date)', 'execute')
                 and not has_function_privilege('authenticated', 'public.propuesta_quincenal_a_cuotas_revisar(jsonb, date)', 'execute') end,
       'si sale false, alguien le dio permisos a mano: no debe llamarla nadie de afuera'
union all
select 5, 'El caso de Joan: 650.000 en dos cuotas al 20 % son 455.000 y 390.000',
       coalesce((select r ->> 'ok' = 'true' and (r ->> 'total')::bigint = 845000
                        and (r -> 'cuotas' -> 0 ->> 'costo')::bigint = 130000
                        and (r -> 'cuotas' -> 1 ->> 'costo')::bigint = 65000
                        and r ->> 'ultima' = '2026-11-15'
                   from (select public.propuesta_quincenal_a_cuotas_revisar(
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[
                        {"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},
                        {"fecha":"2026-11-15","pct":20,"capital":325000,"costo":65000,"total":390000}]}'::jsonb,
                     date '2026-10-16') as r) x), false),
       'si da error en vez de false, el cuerpo no compila: avísale a Claude con el mensaje'
union all
select 6, 'El redondeo es el del motor: 10.250 al 35 % cuestan 3.587, no 3.588',
       coalesce((select r ->> 'ok' = 'true' and (r -> 'cuotas' -> 1 ->> 'costo')::bigint = 3587
                   from (select public.propuesta_quincenal_a_cuotas_revisar(
                     '{"capital":20500,"costo":10762,"total":31262,"cuotas":[
                        {"fecha":"2026-10-30","pct":35,"capital":10250,"costo":7175,"total":17425},
                        {"fecha":"2026-11-15","pct":35,"capital":10250,"costo":3587,"total":13837}]}'::jsonb,
                     date '2026-10-16') as r) x), false),
       'si sale false, la base y el CRM redondean distinto y la base rechazaría propuestas buenas'
union all
select 7, 'Dice que no a 1 y a 7 cuotas, a la primera ayer, a la última a 187 días, al 51 %, a un peso de más y a capitales que no suman',
       coalesce((select bool_and(public.propuesta_quincenal_a_cuotas_revisar(c::jsonb, date '2026-10-16') ->> 'ok' = 'false')
                   from unnest(array[
                     '{"capital":650000,"costo":130000,"total":780000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":650000,"costo":130000,"total":780000}]}',
                     '{"capital":70000,"costo":0,"total":0,"cuotas":[{},{},{},{},{},{},{}]}',
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-15","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2026-11-15","pct":20,"capital":325000,"costo":65000,"total":390000}]}',
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2027-04-21","pct":20,"capital":325000,"costo":65000,"total":390000}]}',
                     '{"capital":650000,"costo":496500,"total":1146500,"cuotas":[{"fecha":"2026-10-30","pct":51,"capital":325000,"costo":331500,"total":656500},{"fecha":"2026-11-15","pct":51,"capital":325000,"costo":165750,"total":490750}]}',
                     '{"capital":650000,"costo":195001,"total":845001,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130001,"total":455001},{"fecha":"2026-11-15","pct":20,"capital":325000,"costo":65000,"total":390000}]}',
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2026-11-15","pct":20,"capital":300000,"costo":65000,"total":365000}]}'
                   ]) as c)
                and (select public.propuesta_quincenal_a_cuotas_revisar(
                     '{"capital":650000,"costo":195000,"total":845000,"cuotas":[{"fecha":"2026-10-30","pct":20,"capital":325000,"costo":130000,"total":455000},{"fecha":"2027-04-20","pct":20,"capital":325000,"costo":65000,"total":390000}]}'::jsonb,
                     date '2026-10-16') ->> 'ok') = 'true', false),
       'si sale false, una de las rejas se cayó: avísale a Claude'
union all
select 8, 'Aceptarla, verla y listarla no miran el producto: una quincenal a cuotas pasa como las otras',
       coalesce((select bool_and(position('producto' in p.prosrc) = 0)
                   from pg_proc p
                  where p.oid in (to_regprocedure('public.aceptar_condiciones(bigint, jsonb)'),
                                  to_regprocedure('public.aceptar_contrapropuesta(bigint)'),
                                  to_regprocedure('public.mi_solicitud()'),
                                  to_regprocedure('public.listar_solicitudes_abiertas(text)'),
                                  to_regprocedure('public.aceptar_con_destino(bigint, jsonb, jsonb)'))), false)
       and to_regprocedure('public.aceptar_condiciones(bigint, jsonb)') is not null
       and to_regprocedure('public.mi_solicitud()') is not null
       and to_regprocedure('public.listar_solicitudes_abiertas(text)') is not null,
       'si sale false, alguna de esas funciones cambió desde el 13-nov: una quincenal a cuotas podría no poderse aceptar o no verse'
order by 1;
