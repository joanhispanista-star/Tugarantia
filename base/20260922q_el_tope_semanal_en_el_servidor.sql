-- 22-sep-2026 — EL TOPE DE LA LEY 2300, EN EL SERVIDOR
--
-- Fase 4b del plan de los roles.
--
-- ===========================================================================
-- EL HUECO
--
-- La cabecera de `asesor_enviar` dice que comprueba «tres cosas que la pantalla
-- no puede garantizar sola»: que esa persona sea suya, que sea hora hábil de
-- cobro, y que no haya pasado de sesenta envíos en el día.
--
-- **El tope que trae la multa no es ninguna de las tres.** El artículo 3 de la
-- Ley 2300 permite UN contacto de cobro por consumidor y por SEMANA, y prohíbe
-- además mezclar canales dentro de esa semana. Eso solo lo comprobaba la
-- pantalla, leyendo la última gestión que le mandó `mi_cartera`.
--
-- Una pantalla no es un cerrojo. Un asesor con la consola del navegador
-- abierta —o cualquiera con su token— podía llamar a `asesor_enviar` sesenta
-- veces contra la misma persona en un día. Sesenta mensajes de cobro a un solo
-- cliente, cada uno una infracción, y **la sanción de la Ley 2300 le llega a
-- Joan en persona**, no a una sociedad.
--
-- ===========================================================================
-- LA MISMA REGLA QUE LA PANTALLA, NI MÁS NI MENOS
--
-- Se copia lo que hace `puedeContactar` en app/gestion-asesor.js, para que no
-- haya dos reglas que un día se separen:
--
--   · Solo aplica a COBRANZA. Vender no tiene ventana legal, y ahí la lista
--     corta es la de las excepciones: PC, CR y PAGADO son venta; **todo lo
--     demás, y lo que no se reconozca, es cobro**. Del lado seguro.
--   · Se mira la ÚLTIMA gestión de esa PERSONA, venga de quien venga. El tope
--     es por consumidor, no por asesor: dos asesores llamando al mismo cliente
--     en la misma semana son dos infracciones, no una cada uno.
--   · Menos de un día → ya se le contactó hoy.
--   · Menos de siete → ya se le contactó esta semana.
--
-- No se comprueba «mezclar canales» aparte porque con un solo contacto por
-- semana la mezcla ya no cabe: es la misma reja.
--
-- ===========================================================================
-- POR QUÉ EL SERVIDOR PUEDE HACERLO Y ANTES NO
--
-- Porque la propia `asesor_enviar` escribe una gestión después de mandar
-- (desde 20260919), y el botón de WhatsApp escribe un contacto. El libro está
-- en la base; lo único que faltaba era leerlo antes de mandar.
--
-- NO SE COPIA EL CUERPO: se lee de la base y se le mete la reja justo después
-- de la de la ventana horaria, con un reemplazo tolerante a los espacios.

do $$
declare
  src   text;
  nueva text;
  reja  text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'asesor_enviar' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.asesor_enviar'; end if;

  if position('ultimo_contacto' in src) > 0 then
    raise notice 'el tope semanal ya estaba puesto';
    return;
  end if;

  -- `per.etapa` ya está cargada: la reja de «es tuyo» la trae entera.
  reja :=
    'if per.etapa is distinct from ''PC'' and per.etapa is distinct from ''CR'' ' ||
       'and per.etapa is distinct from ''PAGADO'' then ' ||
      'select max(g.cuando) into ultimo_contacto from public.gestiones g ' ||
       'where g.persona_id = per.id; ' ||
      'if ultimo_contacto is not null then ' ||
        'if ultimo_contacto > now() - interval ''1 day'' then ' ||
          'return jsonb_build_object(''ok'', false, ''motivo'', ''ya_hoy'', ' ||
            '''detalle'', ''Ya se le escribio hoy. La Ley 2300 deja un contacto de cobro al dia.''); ' ||
        'end if; ' ||
        'if ultimo_contacto > now() - interval ''7 days'' then ' ||
          'return jsonb_build_object(''ok'', false, ''motivo'', ''ya_esta_semana'', ' ||
            '''detalle'', ''Ya se le contacto esta semana. La Ley 2300 deja uno por semana.''); ' ||
        'end if; ' ||
      'end if; ' ||
    'end if; ';

  -- (a) la variable
  nueva := regexp_replace(src,
    '(ventana_obj jsonb;)',
    '\1' || E'\n  ultimo_contacto timestamptz;', '');
  if nueva = src then raise exception 'no se encontro donde declarar ultimo_contacto'; end if;
  src := nueva;

  -- (b) y la reja, justo DESPUÉS de la ventana horaria y ANTES del tope diario.
  --     Ahí y no antes: si se pusiera delante de la ventana, se le diría «ya lo
  --     contactaste» a quien en realidad está fuera de horario, y el asesor
  --     esperaría una semana por un problema de reloj.
  nueva := regexp_replace(src,
    '(''motivo'', ''fuera_de_horario'',\s*''detalle'', ventana->>''motivo''\);\s*end if;)',
    '\1' || E'\n\n  ' || reja, '');
  if nueva = src then raise exception 'no se encontro donde poner la reja semanal'; end if;

  execute nueva;
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
do $prueba$
declare
  v_ase   text := '3009990041';
  v_pers  text := 'PRUEBA-L2300-1';
  v_vende text := 'PRUEBA-L2300-2';
  j       jsonb;
  pasos   text := '';
  k       int;
begin
  -- DOS CUIDADOS QUE NO SON OPCIONALES EN ESTA PRUEBA:
  --
  -- 1. `asesor_enviar` MANDA DE VERDAD si llega al final. La ventana horaria y
  --    el tope semanal frenan los primeros pasos, pero los dos ultimos
  --    comprueban justo que NO frenan -- y ahi seguiria hacia Infobip. Asi que
  --    antes de esos dos se llena el tope diario de 60: la funcion se para en
  --    el escalon siguiente y contestar 'tope' PRUEBA que paso el semanal.
  --    Sin esto, correr esta migracion gastaria creditos y escribiria en el
  --    libro legal de Joan.
  --
  -- 2. La reja semanal va DESPUES de la ventana horaria, asi que fuera de
  --    horario esta prueba no puede llegar hasta ella. Se dice y no se finge:
  --    una prueba que se salta a si misma en silencio es peor que ninguna.
  if (public.ventana_de_cobro()->>'ok')::boolean is not true then
    raise notice 'TOPE SEMANAL: fuera de la ventana de cobro (%), asi que los cinco pasos no se pudieron probar LLAMANDO. El centinela de abajo si corrio, y comprueba el codigo. Para probarlo llamando, correr esta migracion de lunes a sabado en horario habil de Bogota.',
      public.ventana_de_cobro()->>'motivo';
    return;
  end if;

  if exists (select 1 from public.equipo where celular = v_ase) then
    raise exception 'el celular de prueba % es de alguien de verdad', v_ase;
  end if;
  if exists (select 1 from public.cartera where id in (v_pers, v_vende)) then
    raise exception 'ya existen las filas de prueba';
  end if;

  insert into public.equipo (celular, nombre, rol, estado, jefe)
  values (v_ase, 'Prueba asesor', 'asesor', 'activo', null);
  -- Uno en COBRO (M1A) y otro en VENTA (PC), que es la diferencia entera.
  insert into public.cartera (id, tipo, celular, nombre, estado, etapa, actualizado)
  values (v_pers,  'cliente',   '3001119991', 'En cobro', 'cliente', 'M1A', now()),
         (v_vende, 'prospecto', '3001119992', 'En venta', 'nuevo',   'PC',  now());
  insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
  values ('PRUEBA-L2300-A1', v_pers,  v_ase, current_date, now()),
         ('PRUEBA-L2300-A2', v_vende, v_ase, current_date, now());

  perform set_config('request.jwt.claims',
    '{"email":"57' || v_ase || '@tugarantia.net","role":"authenticated"}', true);

  ---- 1. Con un contacto de AYER, no se le puede volver a escribir de cobro.
  insert into public.gestiones (persona_id, asesor, tipo, nota, cuando)
  values (v_pers, v_ase, 'sms', 'de ayer', now() - interval '1 day' - interval '2 hours');

  j := public.asesor_enviar(v_pers, 'sms', 'Hola');
  if (j->>'motivo') <> 'ya_esta_semana' then
    raise exception 'FALLO 1 GRAVE: se mando un segundo cobro en la misma semana: %', j;
  end if;
  pasos := pasos || '1 uno-por-semana; ';

  ---- 2. Y el de HOY se dice con otras palabras: es otra cosa y otra espera.
  update public.gestiones set cuando = now() - interval '2 hours' where persona_id = v_pers;
  j := public.asesor_enviar(v_pers, 'sms', 'Hola');
  if (j->>'motivo') <> 'ya_hoy' then
    raise exception 'FALLO 2: un contacto de hoy sale como el de la semana: %', j;
  end if;
  pasos := pasos || '2 el-de-hoy-se-dice-aparte; ';

  ---- 3. NO IMPORTA QUIEN LO CONTACTO. El tope es por CONSUMIDOR: dos asesores
  ---- llamando al mismo cliente en la semana son dos infracciones, no una cada
  ---- uno. Se cambia el autor y la reja tiene que seguir puesta.
  update public.gestiones set asesor = '3009999998', cuando = now() - interval '2 days'
   where persona_id = v_pers;
  j := public.asesor_enviar(v_pers, 'sms', 'Hola');
  if (j->>'motivo') <> 'ya_esta_semana' then
    raise exception 'FALLO 3 GRAVE: el tope se cuenta por asesor y no por persona: %', j;
  end if;
  pasos := pasos || '3 el-tope-es-por-persona; ';

  ---- AHORA SE LLENA EL TOPE DIARIO, para que lo que sigue no pueda mandar.
  for k in 1..60 loop
    insert into public.envios_asesor (asesor, persona_id, canal, texto)
    values (v_ase, v_pers, 'sms', 'freno de la prueba');
  end loop;

  ---- 4. PASADA LA SEMANA, el semanal SUELTA. Un freno que no suelta no es un
  ---- freno: es una puerta cerrada. Se comprueba que caiga en el escalon
  ---- SIGUIENTE ('tope'), que es justo lo que prueba que paso este.
  update public.gestiones set cuando = now() - interval '8 days' where persona_id = v_pers;
  j := public.asesor_enviar(v_pers, 'sms', 'Hola');
  if (j->>'motivo') <> 'tope' then
    raise exception 'FALLO 4: pasada la semana no llego al escalon siguiente: %', j;
  end if;
  pasos := pasos || '4 pasada-la-semana-se-suelta; ';

  ---- 5. Y A VENDER NO SE LE APLICA. La Ley 2300 es de COBRANZA; ponerle la
  ---- reja a la venta seria inventarse una ley y dejar al asesor sin trabajar.
  insert into public.gestiones (persona_id, asesor, tipo, nota, cuando)
  values (v_vende, v_ase, 'llamada', 'de ayer', now() - interval '1 day');
  j := public.asesor_enviar(v_vende, 'sms', 'Hola');
  if (j->>'motivo') <> 'tope' then
    raise exception 'FALLO 5: se le aplico el tope de cobranza a un prospecto: %', j;
  end if;
  pasos := pasos || '5 a-vender-no-se-le-aplica; ';

  delete from public.envios_asesor where asesor = v_ase;
  delete from public.gestiones     where persona_id in (v_pers, v_vende);
  delete from public.asignaciones  where id like 'PRUEBA-L2300-%';
  delete from public.cartera       where id in (v_pers, v_vende);
  delete from public.equipo        where celular = v_ase;
  raise notice 'el tope semanal en el servidor: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'asesor_enviar' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');

  if cuerpo not like '%ultimo_contacto%' then
    raise exception 'se fue el tope semanal: un asesor con la consola abierta manda sesenta al mismo cliente';
  end if;
  if cuerpo not like '%interval ''7 days''%' then
    raise exception 'el tope semanal ya no es de siete dias';
  end if;
  -- La reja va DESPUES de la ventana horaria: al reves se le diria «ya lo
  -- contactaste» a quien solo esta fuera de hora.
  if position('fuera_de_horario' in cuerpo) > position('ultimo_contacto' in cuerpo) then
    raise exception 'la reja semanal quedo ANTES de la ventana horaria: los motivos saldrian cambiados';
  end if;
  -- Y que no se llevo por delante lo de antes.
  if cuerpo not like '%ventana_de_cobro%' then
    raise exception 'se piso la ventana de la Ley 2300';
  end if;
  if cuerpo not like '%deliveryTimeWindow%' then
    raise exception 'se piso la ventana horaria del proveedor (fase 0)';
  end if;
  if cuerpo not like '%n >= 60%' then
    raise exception 'se piso el tope diario de 60';
  end if;
end $$;
