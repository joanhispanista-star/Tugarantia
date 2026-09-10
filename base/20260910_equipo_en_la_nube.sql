-- ===========================================================================
-- EL EQUIPO ENTRA A LA NUBE — 10 de septiembre de 2026
--
-- Va DESPUÉS de 20260909b_topes_arriba.sql.
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «Aún no puedo entregarle el usuario y contraseña al gerente que agregué, y
-- quiero ver qué es lo que ve el gerente.»
--
-- Y antes: «el rol de asesor solo permite ver las cuentas asignadas y sus
-- propias cuentas… el rol de gerente solo ve de la base de clientes asignada
-- que yo autorice que él vea, de resto mis clientes antiguos u otra información
-- él no la ve».
--
-- ---------------------------------------------------------------------------
-- LA REJA VA ACÁ, NO EN LA PANTALLA. Esto es lo único que importa de este
-- archivo. La pantalla del asesor se puede editar desde el navegador de
-- cualquiera: si el filtro «solo lo mío» viviera ahí, cambiar una línea le
-- daría la cartera entera. Por eso `mi_cartera()` no recibe NINGÚN parámetro
-- que diga de quién es: saca el celular del JWT y decide el servidor.
--
-- ---------------------------------------------------------------------------
-- CÓMO ENTRA UNA PERSONA DEL EQUIPO
--
-- Joan crea el usuario a mano en Supabase (Authentication → Users → Add user),
-- con el correo sintético 57<celular>@tugarantia.net y la contraseña que él
-- elija, marcando «Auto Confirm User». Es lo que pidió: que las credenciales
-- las cree él.
--
-- No hay forma de crear ese usuario desde el CRM sin la llave de servicio, y
-- esa llave no puede vivir en un sitio público: cualquiera abre el código
-- fuente. El día que haga falta automatizarlo, es una Edge Function con la
-- llave guardada como secreto del proyecto — no en el repositorio.
--
-- ---------------------------------------------------------------------------
-- LO QUE NO VIAJA, Y ES DELIBERADO
--
-- Las tablas de acá NO llevan cédula, ni dirección, ni fotos, ni el historial
-- de crédito. Un asesor necesita un nombre, un celular y en qué cartera está la
-- persona; con eso cobra. Todo lo demás es dato personal que multiplicaría el
-- daño el día que un celular se pierda — y la Ley 1581 pide que se trate lo
-- mínimo para la finalidad, no todo lo que uno tenga a mano.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LAS TABLAS
-- ---------------------------------------------------------------------------

-- El equipo. La llave es el CELULAR, que es lo mismo que identifica a la
-- persona en Supabase Auth (57<celular>@tugarantia.net): así no hay que
-- guardar ni sincronizar ningún uid.
create table if not exists public.equipo (
  celular     text        primary key,
  nombre      text        not null,
  rol         text        not null check (rol in ('gerente', 'asesor')),
  estado      text        not null default 'activo' check (estado in ('activo', 'retirado')),
  -- A qué gerente reporta un asesor. Es lo que hace que un gerente vea a los
  -- suyos y solo a los suyos.
  jefe        text,
  actualizado timestamptz not null default now()
);
create index if not exists equipo_por_jefe on public.equipo (jefe);

-- Quién lleva a quién. SOLO SUMA: reasignar escribe una fila nueva con su
-- fecha y la vieja se queda, para que la comisión de un cliente reasignado le
-- llegue al que correspondía EN ESA FECHA.
create table if not exists public.asignaciones (
  id          text        primary key,
  persona_id  text        not null,          -- id del prospecto o del socio en el CRM
  asesor      text        not null,          -- celular del asesor
  desde       date        not null,
  actualizado timestamptz not null default now()
);
create index if not exists asignaciones_por_asesor on public.asignaciones (asesor);

-- Los prospectos: nombre y celular, y nada más. Ver la cabecera.
create table if not exists public.prospectos (
  id          text        primary key,
  celular     text        not null,
  nombre      text        not null default '',
  estado      text        not null default 'nuevo',
  etapa       text        not null default 'PC',   -- la calcula el CRM y la publica
  actualizado timestamptz not null default now()
);
create index if not exists prospectos_por_celular on public.prospectos (celular);

-- LA GESTIÓN: qué hizo el asesor con cada persona de su base. Joan: «que pueda
-- tipificarlos para ver si contestan o si hay alguna novedad» y «que el gerente
-- pueda ver qué gestión le hace el asesor a cada uno».
--
-- SOLO SUMA, igual que las asignaciones: una gestión es un hecho con fecha, y
-- los hechos no se editan. La última manda para pintar el estado de hoy; las
-- viejas son la historia que le permite al gerente ver si de verdad se llamó.
--
-- La columna «asesor» NO viene de la pantalla: la escribe el servidor con el
-- celular de la sesión. Si la mandara el navegador, un asesor podría firmar
-- una gestión con el nombre de otro, y el gerente estaría leyendo una llamada
-- que nadie hizo.
create table if not exists public.gestiones (
  id          bigserial   primary key,
  persona_id  text        not null,
  asesor      text        not null,
  tipo        text        not null,
  nota        text        not null default '',
  cuando      timestamptz not null default now()
);
create index if not exists gestiones_por_persona on public.gestiones (persona_id, cuando desc);
create index if not exists gestiones_por_asesor  on public.gestiones (asesor, cuando desc);

-- El cerrojo doble de esta casa: RLS encendido y CERO políticas. Nadie entra
-- directo; todo pasa por las funciones de abajo, que deciden qué devolver.
alter table public.equipo       enable row level security;
alter table public.asignaciones enable row level security;
alter table public.prospectos   enable row level security;
alter table public.gestiones    enable row level security;
revoke all on public.equipo       from anon, authenticated;
revoke all on public.asignaciones from anon, authenticated;
revoke all on public.prospectos   from anon, authenticated;
revoke all on public.gestiones    from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. JOAN PUBLICA — desde su CRM, con su clave de sincronización
-- ---------------------------------------------------------------------------
create or replace function public.equipo_publicar(
  p_clave text, p_equipo jsonb, p_asignaciones jsonb, p_prospectos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  n_eq integer := 0; n_as integer := 0; n_pr integer := 0;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_equipo, '[]'::jsonb)) loop
    if public.solo_digitos(it->>'celular') = '' then continue; end if;
    insert into public.equipo (celular, nombre, rol, estado, jefe, actualizado)
    values (right(public.solo_digitos(it->>'celular'), 10),
            left(coalesce(it->>'nombre', 'Sin nombre'), 80),
            coalesce(nullif(it->>'rol', ''), 'asesor'),
            coalesce(nullif(it->>'estado', ''), 'activo'),
            nullif(right(public.solo_digitos(coalesce(it->>'jefe', '')), 10), ''),
            now())
    on conflict (celular) do update
      set nombre = excluded.nombre, rol = excluded.rol,
          estado = excluded.estado, jefe = excluded.jefe, actualizado = now();
    n_eq := n_eq + 1;
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p_asignaciones, '[]'::jsonb)) loop
    if coalesce(it->>'id', '') = '' then continue; end if;
    insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
    values (it->>'id', coalesce(it->>'persona_id', ''),
            right(public.solo_digitos(coalesce(it->>'asesor', '')), 10),
            coalesce((it->>'desde')::date, current_date), now())
    on conflict (id) do update
      set persona_id = excluded.persona_id, asesor = excluded.asesor,
          desde = excluded.desde, actualizado = now();
    n_as := n_as + 1;
  end loop;

  for it in select * from jsonb_array_elements(coalesce(p_prospectos, '[]'::jsonb)) loop
    if coalesce(it->>'id', '') = '' then continue; end if;
    insert into public.prospectos (id, celular, nombre, estado, etapa, actualizado)
    values (it->>'id', right(public.solo_digitos(coalesce(it->>'celular', '')), 10),
            left(coalesce(it->>'nombre', ''), 80),
            coalesce(nullif(it->>'estado', ''), 'nuevo'),
            coalesce(nullif(it->>'etapa', ''), 'PC'), now())
    on conflict (id) do update
      set celular = excluded.celular, nombre = excluded.nombre,
          estado = excluded.estado, etapa = excluded.etapa, actualizado = now();
    n_pr := n_pr + 1;
  end loop;

  return jsonb_build_object('ok', true, 'equipo', n_eq,
                            'asignaciones', n_as, 'prospectos', n_pr);
end
$$;

-- ---------------------------------------------------------------------------
-- 3. QUIÉN SOY — el que entra pregunta por sí mismo, y nada más
-- ---------------------------------------------------------------------------
create or replace function public.mi_rol()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; e public.equipo;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into e from public.equipo where celular = right(cel, 10);
  if not found or e.estado <> 'activo' then
    -- Un retirado entra a su cuenta pero no es nadie acá. Se contesta lo mismo
    -- que a un desconocido: no hay por qué decirle que existió.
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'nombre', e.nombre, 'rol', e.rol,
                            'celular', e.celular);
end
$$;

-- ---------------------------------------------------------------------------
-- 3-bis. MI ALCANCE — de quién es la gente que me toca ver
--
-- No decide quién soy: eso lo resuelve cada función con celular_de_sesion().
-- Acá vive solo el organigrama, que escrito dos veces cambiaría en uno.
-- ---------------------------------------------------------------------------
create or replace function public.mi_alcance(p_celular text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select rol from public.equipo where celular = p_celular) = 'asesor'
      then array[p_celular]
    else coalesce((select array_agg(celular) from public.equipo
                    where estado = 'activo'
                      and (celular = p_celular or jefe = p_celular)), array[]::text[])
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. MI CARTERA — sin un solo parámetro que diga de quién es
--
-- Un asesor recibe los suyos. Un gerente recibe los de los asesores que le
-- reportan, con el nombre del asesor al lado. Nadie recibe nada de nadie más,
-- y no hay forma de pedirlo: la pregunta no tiene dónde escribir un celular
-- ajeno.
-- ---------------------------------------------------------------------------
create or replace function public.mi_cartera()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cel  text;
  yo   public.equipo;
  mios text[];
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;

  -- Un asesor: él solo. Un gerente: él y los que le reportan.
  mios := public.mi_alcance(yo.celular);

  return jsonb_build_object(
    'ok', true,
    'yo', jsonb_build_object('nombre', yo.nombre, 'rol', yo.rol, 'celular', yo.celular),
    'equipo', coalesce((
      select jsonb_agg(jsonb_build_object('celular', celular, 'nombre', nombre, 'rol', rol))
        from public.equipo
       where estado = 'activo' and celular = any(mios) and celular <> yo.celular), '[]'::jsonb),
    'gente', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nombre', p.nombre, 'celular', p.celular,
               'estado', p.estado, 'etapa', p.etapa,
               'asesor', a.asesor, 'asesor_nombre', coalesce(e2.nombre, ''),
               -- La última gestión viaja pegada a la persona: es lo que el
               -- gerente abre la pantalla a mirar, y pedirla aparte sería una
               -- consulta por cada nombre de la lista.
               'gestion', (select jsonb_build_object(
                             'tipo', g.tipo, 'nota', g.nota, 'cuando', g.cuando,
                             'quien', coalesce(e3.nombre, g.asesor))
                             from public.gestiones g
                             left join public.equipo e3 on e3.celular = g.asesor
                            where g.persona_id = p.id
                            order by g.cuando desc limit 1)))
        from public.prospectos p
        join public.asignaciones a on a.persona_id = p.id
        left join public.equipo e2 on e2.celular = a.asesor
       where a.asesor = any(mios)
         -- De varias asignaciones del mismo prospecto manda la ÚLTIMA: la
         -- lista solo suma, y la vigente es la de fecha más reciente.
         and a.desde = (select max(a2.desde) from public.asignaciones a2
                         where a2.persona_id = p.id)), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 4-bis. ANOTAR UNA GESTIÓN — el asesor tipifica desde su celular
--
-- Dos rejas, y las dos del lado del servidor:
--   · quién firma      — sale de la sesión, no del navegador.
--   · sobre quién      — tiene que ser gente de SU alcance. Sin esto, un asesor
--     podría escribir en la cartera de otro, y el gerente leería una llamada
--     que nadie hizo. Es peor que no tener la función: sería un registro falso
--     con apariencia de verdadero.
-- ---------------------------------------------------------------------------
create or replace function public.gestion_anotar(
  p_persona_id text, p_tipo text, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel text; yo public.equipo; mios text[]; duenio text; nuevo text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  if coalesce(p_tipo, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'falta decir qué pasó');
  end if;

  mios := public.mi_alcance(yo.celular);

  -- El dueño de HOY: de varias asignaciones manda la última.
  select a.asesor into duenio from public.asignaciones a
   where a.persona_id = p_persona_id
   order by a.desde desc, a.id desc limit 1;
  if duenio is null or not (duenio = any(mios)) then
    return jsonb_build_object('ok', false, 'motivo', 'esa persona no es de tu base');
  end if;

  insert into public.gestiones (persona_id, asesor, tipo, nota)
  values (p_persona_id, yo.celular, left(p_tipo, 24), left(coalesce(p_nota, ''), 300));

  -- El estado del prospecto sigue a la gestión. Si no, el asesor marca «no
  -- contesta» y el chip le sigue diciendo «sin contactar»: la pantalla estaría
  -- desmintiendo lo que él acaba de escribir.
  nuevo := case p_tipo
             when 'contesto'    then 'contactado'
             when 'volver'      then 'contactado'
             when 'va_a_pedir'  then 'contactado'
             when 'no_contesta' then 'no_contesta'
             when 'numero_malo' then 'numero_malo'
             when 'no_quiere'   then 'no_quiso'
             else null end;
  if nuevo is not null then
    update public.prospectos set estado = nuevo, actualizado = now()
     where id = p_persona_id;
  end if;

  return jsonb_build_object('ok', true);
end
$$;

-- La historia de UNA persona, para el gerente que quiere ver si de verdad se
-- llamó. Misma reja: solo gente de su alcance.
create or replace function public.gestiones_de(p_persona_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; mios text[]; duenio text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  select a.asesor into duenio from public.asignaciones a
   where a.persona_id = p_persona_id
   order by a.desde desc, a.id desc limit 1;
  if duenio is null or not (duenio = any(mios)) then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'gestiones', coalesce((
    select jsonb_agg(jsonb_build_object(
             'tipo', g.tipo, 'nota', g.nota, 'cuando', g.cuando,
             'quien', coalesce(e.nombre, g.asesor)) order by g.cuando desc)
      from public.gestiones g
      left join public.equipo e on e.celular = g.asesor
     where g.persona_id = p_persona_id), '[]'::jsonb));
end
$$;

-- Joan se las trae TODAS a su CRM, con su clave. Es el único que ve la casa
-- entera; para eso es la casa.
create or replace function public.gestiones_listar(p_clave text, p_desde text)
returns jsonb
language plpgsql
/* VOLÁTIL A PROPÓSITO, y no se le puede poner «stable»: esta función pasa por
   clave_ok, que ESCRIBE el freno contra la fuerza bruta. PostgREST corre las
   «stable» en transacción de solo lectura y revientan con 25006 antes de mirar
   la clave — o sea que no sirven nunca. Lo estuvo desde el 8-sep-2026. */
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', g.id, 'persona_id', g.persona_id, 'tipo', g.tipo, 'nota', g.nota,
             'cuando', g.cuando, 'asesor', g.asesor,
             'quien', coalesce(e.nombre, g.asesor)) order by g.cuando)
      from public.gestiones g
      left join public.equipo e on e.celular = g.asesor
     where g.cuando >= coalesce(nullif(p_desde, '')::timestamptz, now() - interval '180 days')
     limit 5000), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. LOS PERMISOS
-- `create or replace` NO quita el EXECUTE que PostgreSQL le da a PUBLIC por
-- defecto: se revoca a mano y se concede lo justo. Lección del 28-ago, cuando
-- había 28 funciones abiertas a la llave pública sin que nadie lo viera.
-- ---------------------------------------------------------------------------
revoke all on function public.equipo_publicar(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.equipo_publicar(text, jsonb, jsonb, jsonb) to anon;   -- Joan, con su clave
revoke all on function public.mi_rol()     from public, anon, authenticated;
grant  execute on function public.mi_rol() to authenticated;                            -- solo con sesión
revoke all on function public.mi_cartera() from public, anon, authenticated;
grant  execute on function public.mi_cartera() to authenticated;
-- mi_alcance no se le concede a NADIE desde afuera: es de uso interno de las
-- funciones de acá. Recibe un celular por parámetro, y una función que recibe
-- un celular y contesta a quién ve esa persona es justo lo que no puede quedar
-- al alcance de un navegador.
revoke all on function public.mi_alcance(text) from public, anon, authenticated;
revoke all on function public.gestion_anotar(text, text, text) from public, anon, authenticated;
grant  execute on function public.gestion_anotar(text, text, text) to authenticated;
revoke all on function public.gestiones_de(text) from public, anon, authenticated;
grant  execute on function public.gestiones_de(text) to authenticated;
revoke all on function public.gestiones_listar(text, text) from public, anon, authenticated;
grant  execute on function public.gestiones_listar(text, text) to anon;   -- Joan, con su clave

-- ---------------------------------------------------------------------------
-- 5-bis. REPARAR LO QUE YA ESTABA ROTO
--
-- politica_nuevos_leer y archivos_de_registro se declararon `stable` y pasan
-- por clave_ok, que escribe el freno contra la fuerza bruta. PostgREST corre
-- las `stable` en transacción de SOLO LECTURA, así que revientan con
--
--     405 {"code":"25006","message":"cannot execute nextval() in a read-only transaction"}
--
-- antes de mirar la clave. No fallan a veces: no funcionan NUNCA, ni con la
-- clave correcta. Comprobado hoy llamándolas contra esta misma nube.
--
-- Lo que costó: archivos_de_registro es la que trae las fotos de la cédula de
-- quien se registra por la app. El Panel se tragaba el error y la ficha de cada
-- registrado decía «No subió fotos». Las fotos siempre estuvieron ahí.
--
-- Se arregla con ALTER y no volviendo a escribir el cuerpo, a propósito: copiar
-- un cuerpo de memoria es como se inventan defectos nuevos arreglando uno viejo.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.politica_nuevos_leer(text)') is not null then
    execute 'alter function public.politica_nuevos_leer(text) volatile';
  end if;
  if to_regprocedure('public.archivos_de_registro(text, text)') is not null then
    execute 'alter function public.archivos_de_registro(text, text) volatile';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text;
begin
  if to_regclass('public.equipo') is null
     or to_regclass('public.asignaciones') is null
     or to_regclass('public.prospectos') is null
     or to_regclass('public.gestiones') is null then
    raise exception 'falto alguna de las cuatro tablas';
  end if;

  -- Que nadie pueda leer las tablas directo, sin pasar por las funciones.
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public'
                and table_name in ('equipo', 'asignaciones', 'prospectos', 'gestiones')
                and grantee in ('anon', 'authenticated')) then
    raise exception 'alguna tabla del equipo quedo abierta a la llave publica';
  end if;

  -- Y que mi_cartera NO acepte un parametro: si algun dia recibe el celular
  -- de quien pregunta, la reja se muda a la pantalla y deja de servir.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'mi_cartera' and p.pronargs > 0) > 0 then
    raise exception 'mi_cartera recibe parametros: la reja tiene que decidirla el servidor';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cartera' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%celular_de_sesion%' then
    raise exception 'mi_cartera no saca el celular de la sesion';
  end if;

  if has_function_privilege('anon', 'public.mi_cartera()', 'execute') then
    raise exception 'mi_cartera quedo abierta sin sesion';
  end if;

  -- Anotar una gestion tampoco puede hacerse sin sesion, y el que firma tiene
  -- que salir de ella: si el celular del que anota viniera por parametro, el
  -- gerente estaria leyendo llamadas firmadas por quien no las hizo.
  if has_function_privilege('anon', 'public.gestion_anotar(text, text, text)', 'execute') then
    raise exception 'gestion_anotar quedo abierta sin sesion';
  end if;
  select prosrc into cuerpo from pg_proc
   where proname = 'gestion_anotar' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%celular_de_sesion%' then
    raise exception 'gestion_anotar no saca de la sesion quien firma';
  end if;
  if cuerpo not like '%mi_alcance%' then
    raise exception 'gestion_anotar no comprueba que la persona sea de su base';
  end if;

  -- NINGUNA funcion que pase por clave_ok puede ser stable ni immutable.
  -- clave_ok ESCRIBE el freno contra la fuerza bruta, y PostgREST corre las
  -- stable en transaccion de solo lectura: revientan con 25006 antes de mirar
  -- la clave, o sea que no sirven nunca. Este centinela habria cazado el
  -- defecto el 8-sep en vez del 10.
  if exists (select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.provolatile <> 'v'
               and p.prosrc like '%clave_ok%') then
    raise exception 'hay funciones stable que pasan por clave_ok: no sirven nunca (error 25006)';
  end if;

  -- Y mi_alcance no puede quedar al alcance de un navegador: recibe un celular
  -- y contesta a quien ve esa persona.
  if has_function_privilege('anon', 'public.mi_alcance(text)', 'execute')
     or has_function_privilege('authenticated', 'public.mi_alcance(text)', 'execute') then
    raise exception 'mi_alcance quedo abierta desde afuera';
  end if;
end $$;
