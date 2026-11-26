-- ===========================================================================
-- DIAGNÓSTICO: «UNA PERSONA SE REGISTRÓ Y NO ME APARECE EN EL CRM»
-- 26 de noviembre de 2026
--
-- SOLO LEE. No crea, no cambia y no borra nada: es un único select.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
--
-- NO muestra nombres, cédulas ni celulares completos: de cada celular salen
-- los últimos 4 dígitos, que alcanzan para reconocer a la persona.
--
-- QUÉ CONTESTA
--   1. Cuánto pesa la base. El plan gratis llega a 500 MB; al pasarlos la base
--      queda de solo lectura y los registros dejan de entrar sin avisar.
--   2. Los últimos 15 registros de la bandeja: cuándo entraron, en qué estado
--      están y cuándo se creó la cuenta de ese celular.
--   3. Las últimas 15 cuentas creadas, y qué registro tiene cada una.
--
-- CÓMO SE LEE (las tres cosas que explican «no me aparece»)
--   · Una CUENTA de hoy cuyo registro es de OTRO día: esa persona ya se había
--     registrado antes. La base no hace una fila nueva mientras la primera siga
--     en «nuevo» (registrar_abierto, 20260909_una_sola_puerta.sql): en el CRM
--     está, pero con la fecha del primer intento, no arriba con la de hoy.
--   · Una cuenta cuyo registro está «atendido» o «descartado»: ya no sale en
--     la lista de nuevos.
--   · Una cuenta «SIN NINGÚN REGISTRO»: la cuenta se creó y la fila de la
--     bandeja no. Eso sí sería un defecto, y hay que mirarlo.
-- ===========================================================================
with regs as (
  select r.id, r.creado_en, r.estado,
         to_jsonb(r) ->> 'origen' as origen, to_jsonb(r) ->> 'app' as app,
         right(regexp_replace(coalesce(r.telefono, ''), '\D', '', 'g'), 10) as cel
    from public.registros r
), cuentas as (
  select u.created_at, u.last_sign_in_at,
         position('@tugarantia.net' in coalesce(u.email, '')) > 0 as de_celular,
         right(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '\D', '', 'g'), 10) as cel
    from auth.users u
)
select "qué", "celular", "cuándo", "estado", "nota"
  from (
    select 1 as n, now() as ts,
           'La base pesa' as "qué", '' as "celular",
           pg_size_pretty(pg_database_size(current_database())) as "cuándo",
           case when pg_database_size(current_database()) > 450 * 1024 * 1024 then 'CASI LLENA' else 'con espacio' end as "estado",
           'el tope del plan gratis es 500 MB' as "nota"
    union all
    /* El CRM del computador lista los 200 «nuevos» más recientes y el del celular, 100
       (listar_registros y panel_registros). Con más que eso, los de más atrás no se ven. */
    select 1, now() - interval '1 second',
           'Registros en «nuevo»', '',
           (select count(*)::text from regs where estado = 'nuevo'),
           case when (select count(*) from regs where estado = 'nuevo') > 200 then 'MÁS DE LOS QUE SE VEN'
                when (select count(*) from regs where estado = 'nuevo') > 100 then 'más de los que ve el celular'
                else 'caben todos' end,
           'el computador muestra 200 y el celular 100; el más viejo es del ' ||
             coalesce((select to_char(min(creado_en) at time zone 'America/Bogota', 'DD Mon YYYY') from regs where estado = 'nuevo'), '—')
    union all
    select 2, r.creado_en,
           'Registro #' || r.id, '…' || right(r.cel, 4),
           to_char(r.creado_en at time zone 'America/Bogota', 'DD Mon HH24:MI'),
           r.estado,
           coalesce(r.origen, '') || ' · ' || coalesce(r.app, '') || ' · ' ||
           coalesce('su cuenta se creó el ' || (
             select to_char(max(c.created_at) at time zone 'America/Bogota', 'DD Mon HH24:MI')
               from cuentas c where c.de_celular and c.cel = r.cel and length(r.cel) = 10), 'sin cuenta todavía')
      from (select * from regs order by creado_en desc limit 15) r
    union all
    select 3, c.created_at,
           'Cuenta creada', case when c.de_celular then '…' || right(c.cel, 4) else '(entra con correo)' end,
           to_char(c.created_at at time zone 'America/Bogota', 'DD Mon HH24:MI'),
           case when not c.de_celular then 'no es de un cliente'
                else coalesce((
                  select string_agg(x.estado || ' (#' || x.id || ', del ' ||
                                    to_char(x.creado_en at time zone 'America/Bogota', 'DD Mon HH24:MI') || ')', '; ' order by x.creado_en desc)
                    from regs x where x.cel = c.cel and length(c.cel) = 10), 'SIN NINGÚN REGISTRO') end,
           'última entrada: ' || coalesce(to_char(c.last_sign_in_at at time zone 'America/Bogota', 'DD Mon HH24:MI'), 'nunca')
      from (select * from cuentas order by created_at desc limit 15) c
  ) t
 order by n, ts desc;
