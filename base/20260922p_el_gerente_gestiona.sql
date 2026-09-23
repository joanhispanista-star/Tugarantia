-- 22-sep-2026 — RETIRAR A ALGUIEN NO PUEDE HACER DESAPARECER SU CARTERA
--
-- Fase 4 del plan de los roles: la gestión de personal del gerente.
--
-- ===========================================================================
-- EL DEFECTO, Y POR QUÉ NO GRITA
--
-- `asesor_retirar` hace una sola cosa: `set estado = 'retirado'`. Las
-- asignaciones de esa persona siguen apuntando a su celular, y `mi_alcance`
-- solo devuelve gente **activa**. Así que desde el segundo siguiente:
--
--   · el asesor retirado no ve nada (correcto),
--   · **y el gerente tampoco ve a los clientes que llevaba** (no correcto),
--   · ni puede reasignarlos, porque para reasignar hay que poder verlos.
--
-- Esa gente no da un error: simplemente deja de estar. Nadie los llama, nadie
-- les cobra, y el único sitio donde siguen existiendo es el computador de Joan
-- — que es justo el que su mano derecha no tiene delante.
--
-- Con treinta clientes en cobranza a nombre de alguien que se fue, eso es un
-- mes de cartera en silencio.
--
-- ===========================================================================
-- LAS TRES COSAS QUE SE ARREGLAN
--
-- 1. UN GERENTE ALCANZA A LOS SUYOS AUNQUE ESTÉN RETIRADOS. Él sigue activo;
--    los que le reportan pueden no estarlo. Así la cartera de quien se fue no
--    se cae por un agujero: la ve su jefe, que es quien tiene que repartirla.
--    El retirado sigue sin ver nada, porque `mi_alcance(retirado)` devuelve
--    vacío desde 20260922k.
--
-- 2. RETIRAR EXIGE DECIR A QUIÉN LE PASA LA GENTE. Si el asesor tiene personas
--    asignadas y no se dice a dónde van, **no se retira** y se contesta cuántas
--    son. No es una molestia: es lo único que impide crear el agujero de arriba
--    en el momento exacto en que se crea.
--
-- 3. Y SE PUEDE REACTIVAR. Hoy retirar no se deshace por ninguna pantalla: el
--    gerente se equivoca de fila y tiene que llamar a Joan.
--
-- ===========================================================================
-- LO QUE SIGUE PROHIBIDO, Y ES DELIBERADO (viene de 20260911)
--
--   · El gerente crea ASESORES, no gerentes. Los gerentes los nombra Joan.
--     Decisión suya, reafirmada el 22-sep con las tres opciones delante.
--   · No elige a quién reporta quien crea: el servidor pone su propio celular.
--   · No puede volver empleado a un cliente.
--   · No reparte fuera de su alcance, ni hacia fuera ni desde fuera.
--
-- Por eso aquí NO hay «cambiar de jefe»: mover un asesor de un gerente a otro
-- es una decisión de organigrama, y el organigrama es de Joan. Lo hace desde su
-- CRM y publica.
--
-- NO SE COPIAN CUERPOS donde se puede evitar; donde hay que reescribir entero
-- se compara contra el vivo antes de dar nada por bueno.

-- ====== 1. EL ALCANCE DEL GERENTE INCLUYE A LOS SUYOS RETIRADOS ======
create or replace function public.mi_alcance(p_celular text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- SE NOMBRA AL PODEROSO, no al restringido (20260922k): un rol que no sea
    -- exactamente 'gerente' cae en el else y ve solo lo suyo.
    when (select rol from public.equipo
           where celular = p_celular and estado = 'activo') = 'gerente'
      -- 22-sep-2026: SIN filtrar por estado en los subordinados. Un gerente
      -- tiene que alcanzar la cartera de quien se fue, porque es quien la
      -- reparte. Filtrarlos hacía que esos clientes desaparecieran de la nube
      -- para todo el mundo, sin un error y sin que nadie pudiera notarlo.
      -- Él sí tiene que estar activo, y eso se comprueba arriba.
      then coalesce((select array_agg(celular) from public.equipo
                      where celular = p_celular or jefe = p_celular), array[]::text[])
    -- Un asesor se alcanza solo a sí mismo, y un retirado no se alcanza ni a sí.
    when exists (select 1 from public.equipo
                  where celular = p_celular and estado = 'activo')
      then array[p_celular]
    else array[]::text[]
  end
$$;

revoke all on function public.mi_alcance(text) from public, anon, authenticated;

-- ====== 2. RETIRAR, PASANDO LA GENTE ======
create or replace function public.asesor_retirar(p_celular text, p_pasar_a text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cel     text;
  yo      public.equipo;
  q       text;
  destino text;
  cuantos integer;
  movidos integer := 0;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' or yo.rol <> 'gerente' then
    return jsonb_build_object('ok', false);
  end if;

  q := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if q = yo.celular then
    return jsonb_build_object('ok', false, 'motivo', 'no te puedes retirar a ti mismo');
  end if;
  if not exists (select 1 from public.equipo where celular = q and jefe = yo.celular) then
    return jsonb_build_object('ok', false, 'motivo', 'ese no es de tu equipo');
  end if;

  -- ¿CUÁNTA GENTE LLEVA? La asignación vigente es la de fecha máxima, y desde
  -- 20260922k no puede haber dos el mismo día.
  select count(*) into cuantos
    from public.asignaciones a
   where a.asesor = q
     and a.desde = (select max(a2.desde) from public.asignaciones a2
                     where a2.persona_id = a.persona_id);

  if cuantos > 0 and coalesce(btrim(p_pasar_a), '') = '' then
    -- NO SE RETIRA A CIEGAS. Se devuelve el número para que la pantalla pueda
    -- preguntar «¿a quién le paso sus N personas?» en vez de dejar el agujero.
    return jsonb_build_object('ok', false, 'motivo', 'tiene_gente', 'cuantos', cuantos);
  end if;

  if cuantos > 0 then
    destino := right(public.solo_digitos(p_pasar_a), 10);
    if destino = q then
      return jsonb_build_object('ok', false, 'motivo', 'destino_es_el_mismo');
    end if;
    -- El destino tiene que ser uno de los suyos Y estar activo: pasarle la
    -- cartera a otro retirado sería mover el agujero de sitio.
    if not exists (select 1 from public.equipo
                    where celular = destino and estado = 'activo'
                      and (celular = yo.celular or jefe = yo.celular)) then
      return jsonb_build_object('ok', false, 'motivo', 'destino_no_sirve');
    end if;

    -- FILA NUEVA CON FECHA DE HOY, nunca se pisa la vieja: así la comisión de
    -- un cliente reasignado le sigue llegando a quien lo llevaba EN SU FECHA.
    -- El `on conflict` cubre el caso de que hoy ya se le hubiera asignado algo
    -- a esa persona: la última decisión del día es la que vale.
    insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
    select 'RE-' || a.persona_id || '-' || to_char(current_date, 'YYYYMMDD'),
           a.persona_id, destino, current_date, now()
      from public.asignaciones a
     where a.asesor = q
       and a.desde = (select max(a2.desde) from public.asignaciones a2
                       where a2.persona_id = a.persona_id)
    on conflict (persona_id, desde) do update
      set asesor = excluded.asesor, actualizado = now();
    get diagnostics movidos = row_count;
  end if;

  update public.equipo set estado = 'retirado', actualizado = now()
   where celular = q and jefe = yo.celular;

  return jsonb_build_object('ok', true, 'movidos', movidos);
end
$$;

-- ====== 3. Y DESHACERLO ======
create or replace function public.asesor_reactivar(p_celular text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; q text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' or yo.rol <> 'gerente' then
    return jsonb_build_object('ok', false);
  end if;
  q := right(public.solo_digitos(coalesce(p_celular, '')), 10);

  -- Solo los suyos, y solo los que ÉL retiró (jefe = él). No se puede
  -- reactivar a alguien de otro gerente ni fabricarse uno nuevo por esta vía:
  -- crear sigue siendo asesor_crear, con sus rejas.
  update public.equipo set estado = 'activo', actualizado = now()
   where celular = q and jefe = yo.celular and estado = 'retirado';
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'ese no es de tu equipo, o no esta retirado');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.asesor_retirar(text)             from public, anon, authenticated;
revoke all on function public.asesor_retirar(text, text)       from public, anon, authenticated;
grant  execute on function public.asesor_retirar(text, text)   to authenticated;
revoke all on function public.asesor_reactivar(text)           from public, anon, authenticated;
grant  execute on function public.asesor_reactivar(text)       to authenticated;

-- La de un solo argumento se va: si se quedara, PostgREST tendría DOS funciones
-- con el mismo nombre y la llamada de la pantalla sería ambigua — un 300 que
-- nadie entiende. Y además esa era justo la que dejaba el agujero.
drop function if exists public.asesor_retirar(text);

-- ====== 4. QUE EL GERENTE VEA A LOS RETIRADOS, Y QUIÉN SE QUEDÓ SIN ASESOR ======
do $$
declare
  src   text;
  nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'mi_cartera' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.mi_cartera'; end if;

  if position('retirados' in src) > 0 then
    raise notice 'mi_cartera ya devuelve los retirados';
    return;
  end if;

  -- (a) Marcar a cada persona con si su asesor sigue activo. Sin esto, el
  --     gerente ve la cartera del que se fue mezclada con la de los demás y no
  --     tiene forma de saber cuál hay que repartir.
  -- El coalesce no sobra: `e2` es un LEFT JOIN, asi que sin fila en `equipo`
  -- `e2.estado` es NULL y `null = 'activo'` da NULL, no false. La pantalla
  -- leeria «no lo se» donde tiene que leer «este no tiene asesor».
  nueva := regexp_replace(src,
    '(''asesor'', a\.asesor, ''asesor_nombre'', coalesce\(e2\.nombre, ''''\),)',
    '\1' || E'\n               ''asesor_activo'', coalesce(e2.estado = ''activo'', false),', '');
  if nueva = src then raise exception 'no se encontro donde marcar asesor_activo'; end if;
  src := nueva;

  -- (b) Y la lista de los retirados, para poder reactivarlos.
  nueva := regexp_replace(src,
    '(''equipo'', coalesce\(\()',
    '''retirados'', coalesce((' ||
      'select jsonb_agg(jsonb_build_object(''celular'', celular, ''nombre'', nombre, ''rol'', rol))' ||
      ' from public.equipo' ||
      ' where estado = ''retirado'' and celular = any(mios) and celular <> yo.celular' ||
      '), ''[]''::jsonb),' || E'\n    \1', '');
  if nueva = src then raise exception 'no se encontro donde anadir los retirados'; end if;

  execute nueva;
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Las variables llevan `v_`: `nombre`, `rol`, `estado`, `jefe` y `celular` son
-- columnas de estas tablas y PL/pgSQL contesta 42702 sin decir cuál.
do $prueba$
declare
  v_jefe  text := '3009990031';
  v_uno   text := '3009990032';
  v_dos   text := '3009990033';
  v_pers  text := 'PRUEBA-GES-1';
  j       jsonb;
  pasos   text := '';
begin
  if exists (select 1 from public.equipo where celular in (v_jefe, v_uno, v_dos)) then
    raise exception 'los celulares de prueba son de alguien de verdad';
  end if;
  if exists (select 1 from public.cartera where id = v_pers) then
    raise exception 'ya existe la fila de prueba %', v_pers;
  end if;

  insert into public.equipo (celular, nombre, rol, estado, jefe)
  values (v_jefe, 'Prueba jefe', 'gerente', 'activo', null),
         (v_uno,  'Prueba uno',  'asesor',  'activo', v_jefe),
         (v_dos,  'Prueba dos',  'asesor',  'activo', v_jefe);
  insert into public.cartera (id, tipo, celular, nombre, estado, etapa, actualizado)
  values (v_pers, 'cliente', '3001119999', 'Cliente de prueba', 'cliente', 'M1A', now());
  insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
  values ('PRUEBA-GES-ASG', v_pers, v_uno, current_date - 1, now());

  perform set_config('request.jwt.claims',
    '{"email":"57' || v_jefe || '@tugarantia.net","role":"authenticated"}', true);

  ---- 1. NO SE RETIRA A CIEGAS a quien lleva gente.
  j := public.asesor_retirar(v_uno, null);
  if (j->>'motivo') <> 'tiene_gente' or (j->>'cuantos')::int <> 1 then
    raise exception 'FALLO 1 GRAVE: se retiro a alguien con cartera sin decir a quien se la pasa: %', j;
  end if;
  if (select estado from public.equipo where celular = v_uno) <> 'activo' then
    raise exception 'FALLO 1b: se nego pero igual lo retiro';
  end if;
  pasos := pasos || '1 no-se-retira-a-ciegas; ';

  ---- 2. Y no se le pasa a cualquiera.
  j := public.asesor_retirar(v_uno, '3009999999');
  if (j->>'motivo') <> 'destino_no_sirve' then
    raise exception 'FALLO 2: se le paso la cartera a alguien que no es del equipo: %', j;
  end if;
  pasos := pasos || '2 el-destino-tiene-que-ser-suyo; ';

  ---- 3. Con destino bueno, la cartera SE MUEVE y el retiro ocurre.
  j := public.asesor_retirar(v_uno, v_dos);
  if (j->>'ok') <> 'true' or (j->>'movidos')::int <> 1 then
    raise exception 'FALLO 3: no se movio la cartera: %', j;
  end if;
  if (select estado from public.equipo where celular = v_uno) <> 'retirado' then
    raise exception 'FALLO 3b: no quedo retirado';
  end if;
  ---- Y la fila vieja SIGUE, porque la comision de un reasignado le toca a
  ---- quien lo llevaba EN SU FECHA.
  if not exists (select 1 from public.asignaciones
                  where persona_id = v_pers and asesor = v_uno) then
    raise exception 'FALLO 3c: se piso la asignacion vieja: la comision se le iria al que no fue';
  end if;
  pasos := pasos || '3 la-cartera-se-mueve-sin-pisar-el-pasado; ';

  ---- 4. El cliente lo ve AHORA el asesor nuevo, no el retirado.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_dos || '@tugarantia.net","role":"authenticated"}', true);
  j := public.mi_cartera();
  if (j->'gente'->0->>'id') <> v_pers then
    raise exception 'FALLO 4 GRAVE: el cliente no le llego al asesor nuevo: %', j->'gente';
  end if;
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_uno || '@tugarantia.net","role":"authenticated"}', true);
  j := public.mi_cartera();
  if (j->>'ok') <> 'false' then
    raise exception 'FALLO 4b GRAVE: un RETIRADO sigue viendo cartera: %', j;
  end if;
  pasos := pasos || '4 la-ve-el-nuevo-y-no-el-retirado; ';

  ---- 5. EL DEFECTO QUE MOTIVA TODO ESTO: aunque alguien quedara asignado a un
  ---- retirado, su jefe TIENE que poder verlo. Se monta a mano el estado que
  ---- antes dejaba la cartera colgando.
  insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
  values ('PRUEBA-GES-ASG2', v_pers, v_uno, current_date + 1, now());
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_jefe || '@tugarantia.net","role":"authenticated"}', true);
  j := public.mi_cartera();
  if jsonb_array_length(coalesce(j->'gente', '[]'::jsonb)) = 0 then
    raise exception 'FALLO 5 GRAVE: la cartera de un retirado desaparecio para su jefe';
  end if;
  if (j->'gente'->0->>'asesor_activo') <> 'false' then
    raise exception 'FALLO 5b: no se marca que el asesor de esa persona ya no esta: %', j->'gente'->0;
  end if;
  pasos := pasos || '5 el-jefe-ve-la-del-retirado-y-marcada; ';

  ---- 6. Y los retirados salen en su lista, para poder reactivarlos.
  if (j->'retirados'->0->>'celular') <> v_uno then
    raise exception 'FALLO 6: el gerente no ve a quien retiro: %', j->'retirados';
  end if;
  j := public.asesor_reactivar(v_uno);
  if (j->>'ok') <> 'true' then raise exception 'FALLO 6b: no se pudo reactivar: %', j; end if;
  if (select estado from public.equipo where celular = v_uno) <> 'activo' then
    raise exception 'FALLO 6c: dijo que si y no lo reactivo';
  end if;
  pasos := pasos || '6 se-ve-y-se-reactiva; ';

  delete from public.asignaciones where id like 'PRUEBA-GES-%' or persona_id = v_pers;
  delete from public.cartera      where id = v_pers;
  delete from public.equipo       where celular in (v_jefe, v_uno, v_dos);
  raise notice 'el gerente gestiona: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  -- La de un argumento no puede volver: era la que dejaba el agujero, y
  -- conviviendo con la nueva haria ambigua la llamada de la pantalla.
  if to_regprocedure('public.asesor_retirar(text)') is not null then
    raise exception 'volvio asesor_retirar de un solo argumento: retira sin pasar la cartera';
  end if;
  if to_regprocedure('public.asesor_retirar(text, text)') is null then
    raise exception 'no quedo asesor_retirar con destino';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'mi_alcance' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  if cuerpo not like '%= ''gerente''%' then
    raise exception 'mi_alcance dejo de nombrar al poderoso (20260922k)';
  end if;
  if cuerpo like '%where estado = ''activo'' and (celular = p_celular or jefe = p_celular)%' then
    raise exception 'el gerente vuelve a NO alcanzar a sus retirados: su cartera desaparece';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cartera' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  if cuerpo not like '%''asesor_activo''%' then
    raise exception 'mi_cartera dejo de marcar quien se quedo sin asesor';
  end if;
  -- Y que no se llevo por delante lo de las fases anteriores.
  if cuerpo not like '%''com_al_dia_de'', yo.actualizado%' then
    raise exception 'se piso la comision del asesor (20260922n)';
  end if;
  if cuerpo not like '%''al_dia_de'', p.actualizado%' then
    raise exception 'se piso el al_dia_de de la cartera (20260922m)';
  end if;
  if cuerpo not like '%p.saldo_total%' then
    raise exception 'se piso la plata de los clientes (20260919)';
  end if;
end $$;
