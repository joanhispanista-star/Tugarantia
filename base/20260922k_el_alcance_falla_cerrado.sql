-- 22-sep-2026 — EL ORGANIGRAMA FALLA CERRADO, Y UNA ASIGNACIÓN NO EMPATA
--
-- Dos cosas pequeñas que hay que tener puestas ANTES de encender los roles de
-- asesor y gerente, porque las dos deciden **quién ve la cartera de quién** y
-- las dos fallan hacia el lado peligroso.
--
-- ===========================================================================
-- 1. `mi_alcance` NOMBRA AL RESTRINGIDO EN VEZ DE AL PODEROSO
--
-- Está escrito así:
--
--     case when (rol de esa persona) = 'asesor' then array[p_celular]
--          else (ese celular MÁS todos los que le reportan) end
--
-- O sea: el `when` nombra al caso restringido y el `else` reparte poder. Hoy
-- funciona, porque la tabla `equipo` tiene un CHECK que solo admite 'gerente' y
-- 'asesor' — el `else` es exactamente «gerente» y nada más.
--
-- Pero el día que alguien amplíe ese CHECK —Joan ya ha hablado de un rol que
-- solo mire—, el rol nuevo cae en el `else` y **sale viendo como un gerente**,
-- sin que nadie toque esta función y sin un solo error. Peor: también caería
-- ahí una fila con el rol en blanco, o con una errata.
--
-- Se invierte: se nombra a 'gerente' en el `when`, y el `else` pasa a ser el
-- caso restringido. Así un rol nuevo nace viendo SOLO lo suyo, y ampliarle el
-- alcance es una decisión que alguien tiene que escribir a propósito. Es la
-- diferencia entre fallar abierto y fallar cerrado, y no cuesta nada tenerla
-- del lado correcto.
--
-- Y de paso se exige `estado = 'activo'` también para el propio celular: un
-- asesor retirado conservaba su alcance sobre sí mismo.
--
-- ===========================================================================
-- 2. DOS ASIGNACIONES EL MISMO DÍA EMPATAN, Y LAS DOS GANAN
--
-- «La asignación vigente es la de fecha más reciente» se escribe así en todas
-- las rejas:
--
--     and a.desde = (select max(a2.desde) from asignaciones a2 where ...)
--
-- Si a una persona se le asigna un asesor y ese mismo día se le reasigna otro,
-- las dos filas empatan en `max(desde)` y **las dos pasan la reja**: dos
-- asesores ven al mismo cliente, los dos lo llaman, y el tope semanal de la Ley
-- 2300 se cuenta por separado para cada uno.
--
-- No es hipotético: `asignar_a` (la del gerente) escribe con `current_date`, y
-- Joan publica con la fecha de hoy. Que coincidan un día es lo normal, no lo
-- raro.
--
-- El índice único lo hace imposible. Y hay que ponerlo ANTES de que el gerente
-- pueda repartir, porque después habría que limpiar duplicados en producción.
--
-- Idempotente. Nada de esto rompe a quien ya esté dentro.

-- ====== 1. EL ALCANCE, DEL LADO CERRADO ======
create or replace function public.mi_alcance(p_celular text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- SE NOMBRA AL PODEROSO, no al restringido. Un rol que no sea exactamente
    -- 'gerente' cae en el else y ve solo lo suyo. Ver la cabecera.
    when (select rol from public.equipo
           where celular = p_celular and estado = 'activo') = 'gerente'
      then coalesce((select array_agg(celular) from public.equipo
                      where estado = 'activo'
                        and (celular = p_celular or jefe = p_celular)), array[]::text[])
    -- Y un retirado no se alcanza ni a sí mismo.
    when exists (select 1 from public.equipo
                  where celular = p_celular and estado = 'activo')
      then array[p_celular]
    else array[]::text[]
  end
$$;

revoke all on function public.mi_alcance(text) from public, anon, authenticated;

-- ====== 2. UNA SOLA ASIGNACIÓN VIGENTE POR DÍA ======
do $$
declare cuantos integer;
begin
  select count(*) into cuantos from (
    select persona_id, desde from public.asignaciones
     group by persona_id, desde having count(*) > 1) x;
  if cuantos > 0 then
    raise exception
      'hay % personas con dos asignaciones el mismo dia: hay que decidir cual vale ANTES de poner el indice', cuantos;
  end if;
end $$;

create unique index if not exists asignaciones_una_por_dia
  on public.asignaciones (persona_id, desde);

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, y limpiando lo suyo. La prueba NO puede terminar en `raise
-- exception`: el editor corre el archivo en UNA transacción y eso revertiría
-- también los `create` de arriba.
-- NOTA DEL 22-SEP: las variables de esta prueba llevan `v_` a proposito.
-- Se llamaban `jefe`, `peon`, `raro` e `ido`, y `jefe` ES UNA COLUMNA de
-- public.equipo: PL/pgSQL no sabe a cual te refieres y contesta 42702, la
-- misma familia de error que ya costo un intento esta misma tarde con `clave`.
-- La migracion entera revirtio, porque el editor la corre en UNA transaccion.
do $prueba$
declare
  v_jefe    text := '3009990001';
  v_peon    text := '3009990002';
  v_raro    text := '3009990003';
  v_ido     text := '3009990004';
  alcance text[];
  pasos   text := '';
begin
  -- ANTES DE NADA: que ninguno de esos cuatro numeros sea de una persona de
  -- verdad. Al final esta prueba BORRA por celular, y un `on conflict do
  -- nothing` seguido de un delete se llevaria por delante a alguien real sin
  -- un aviso. Es la misma comprobacion que salvo la migracion de las fotos.
  if exists (select 1 from public.equipo where celular in (v_jefe, v_peon, v_raro, v_ido)) then
    raise exception
      'alguno de los celulares de prueba (%, %, %, %) es de alguien de verdad: esta prueba borra por celular',
      v_jefe, v_peon, v_raro, v_ido;
  end if;

  insert into public.equipo (celular, nombre, rol, estado, jefe)
  values (v_jefe, 'Prueba jefe',  'gerente', 'activo',   null),
         (v_peon, 'Prueba peon',  'asesor',  'activo',   v_jefe),
         (v_ido,  'Prueba ido',   'asesor',  'retirado', v_jefe);

  ---- 1. El gerente alcanza a los suyos ACTIVOS, y no al retirado.
  alcance := public.mi_alcance(v_jefe);
  if not (v_peon = any(alcance)) then
    raise exception 'FALLO 1: el gerente no alcanza a su asesor: %', alcance;
  end if;
  if v_ido = any(alcance) then
    raise exception 'FALLO 1b: el gerente alcanza a un RETIRADO: %', alcance;
  end if;
  pasos := pasos || '1 el-gerente-alcanza-a-los-suyos; ';

  ---- 2. El asesor se alcanza SOLO a si mismo.
  alcance := public.mi_alcance(v_peon);
  if array_length(alcance, 1) <> 1 or alcance[1] <> v_peon then
    raise exception 'FALLO 2 GRAVE: un asesor alcanza a alguien mas: %', alcance;
  end if;
  pasos := pasos || '2 el-asesor-solo-a-si-mismo; ';

  ---- 3. Un RETIRADO no alcanza ni a si mismo.
  alcance := public.mi_alcance(v_ido);
  if coalesce(array_length(alcance, 1), 0) <> 0 then
    raise exception 'FALLO 3: un retirado conserva alcance: %', alcance;
  end if;
  pasos := pasos || '3 el-retirado-no-alcanza-nada; ';

  ---- 4. LO QUE MOTIVA TODO ESTO: alguien que no esta en el equipo, o con un
  ---- rol que nadie ha previsto, no puede salir viendo como un gerente. El
  ---- CHECK de la tabla no deja meter un rol v_raro, asi que se prueba el caso
  ---- que SI se puede montar y que es el mismo camino: un celular desconocido.
  alcance := public.mi_alcance(v_raro);
  if coalesce(array_length(alcance, 1), 0) <> 0 then
    raise exception 'FALLO 4 GRAVE: un celular que no es de nadie alcanza a %', alcance;
  end if;
  pasos := pasos || '4 un-desconocido-no-alcanza-nada; ';

  ---- 5. Y el indice impide el empate del mismo dia.
  if exists (select 1 from public.cartera where id = 'PRUEBA-ALC-1') then
    raise exception 'ya existe una fila PRUEBA-ALC-1 en cartera: hay que mirarla antes de seguir';
  end if;
  insert into public.cartera (id, tipo, celular, nombre, estado, etapa, actualizado)
  values ('PRUEBA-ALC-1', 'prospecto', '3009990009', 'Prueba', 'nuevo', 'PC', now());
  insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
  values ('PRUEBA-ASG-1', 'PRUEBA-ALC-1', v_peon, current_date, now())
  on conflict (id) do nothing;
  begin
    insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
    values ('PRUEBA-ASG-2', 'PRUEBA-ALC-1', v_jefe, current_date, now());
    raise exception 'FALLO 5 GRAVE: dos asignaciones vigentes el mismo dia: dos asesores ven al mismo cliente';
  exception when others then
    if sqlerrm like 'FALLO 5%' then raise; end if;
  end;
  pasos := pasos || '5 no-hay-empate-el-mismo-dia; ';

  delete from public.asignaciones where id like 'PRUEBA-ASG-%';
  delete from public.cartera     where id = 'PRUEBA-ALC-1';
  delete from public.equipo      where celular in (v_jefe, v_peon, v_ido);
  raise notice 'el alcance falla cerrado: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
-- Mira lo que se EJECUTA, no la prosa: el comentario que explica este arreglo
-- cita la línea mala, y un centinela que lea comentarios se caza a sí mismo.
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'mi_alcance' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^\n]*', '', 'g');

  if cuerpo ~ 'when[^\n]*=\s*''asesor''' then
    raise exception 'mi_alcance vuelve a nombrar al restringido: un rol nuevo saldria viendo como gerente';
  end if;
  if cuerpo !~ 'when[^\n]*=\s*''gerente''' then
    raise exception 'mi_alcance ya no nombra a gerente: hay que mirar en que quedo';
  end if;

  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'asignaciones_una_por_dia') then
    raise exception 'no quedo el indice: dos asignaciones el mismo dia volverian a empatar';
  end if;
end $$;
