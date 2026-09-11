-- ===========================================================================
-- EL GERENTE CREA Y REPARTE, Y EL WHATSAPP QUEDA REGISTRADO
-- 11 de septiembre de 2026
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «quiero que el rol de gerente tenga la opción de crear usuarios, y que pueda
--  tomar esa base y asignarla al asesor que quiera»
-- «que el asesor pueda incorporar un whatsapp y que pueda ver el registro de
--  las conversaciones con los clientes, para tener un control de calidad»
--
-- ---------------------------------------------------------------------------
-- TRAE DENTRO EL ARREGLO DE SEGURIDAD DEL 10-SEP, A PROPÓSITO
--
-- Este archivo le da PODER DE ESCRITURA a un gerente. Ese poder encima de una
-- puerta que no cierra sería peor que no dárselo: quien pudiera hacerse pasar
-- por un gerente podría, además de leer, crear cuentas y repartir cartera.
--
-- Así que la sección 0 vuelve a aplicar el arreglo de celular_de_sesion. Es
-- `create or replace`: si ya lo corriste, no pasa nada; si no, queda tapado
-- ahora. Un solo pegado y quedas cubierto de las dos cosas.
--
-- ---------------------------------------------------------------------------
-- QUIÉN ES EL DUEÑO DE LA VERDAD, QUE ES LA DECISIÓN DE FONDO
--
-- Hasta hoy la nube era una FOTOCOPIA del computador de Joan: equipo_publicar
-- mandaba la lista entera y pisaba lo que hubiera. En el momento en que un
-- gerente puede crear un asesor desde su celular, esa fotocopia BORRA su
-- trabajo en el siguiente «Publicar».
--
-- Desde acá, LA NUBE ES LA DUEÑA de `equipo` y de `asignaciones`. Joan sigue
-- publicando, pero primero TRAE (equipo_traer), igual que ya hace con las
-- gestiones. Y el gerente nunca pisa una fila: solo INSERTA hechos nuevos
-- —una persona nueva, una asignación nueva con su fecha— porque las
-- asignaciones ya eran una lista que solo suma, y así la comisión de un cliente
-- reasignado le sigue llegando a quien mandaba EN ESA FECHA.
--
-- ---------------------------------------------------------------------------
-- LO QUE EL GERENTE NO PUEDE, Y ES DELIBERADO
--
-- · No elige el rol de quien crea: el servidor pone 'asesor'. Si pudiera poner
--   'gerente', se fabricaría un igual y el organigrama dejaría de significar
--   algo.
-- · No elige a quién reporta: el servidor pone su propio celular. Si pudiera
--   poner otro jefe, le metería gente a la base de un colega.
-- · No puede crear a alguien que ya es CLIENTE. Un cliente vuelto empleado
--   sería un empleado que se ve a sí mismo, y abre la puerta a inventarse un
--   «asesor» para mirar datos que no le tocan.
-- · No reparte fuera de su alcance, ni hacia fuera ni desde fuera.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. LA PUERTA, OTRA VEZ — ver la cabecera
-- ---------------------------------------------------------------------------
create or replace function public.celular_de_sesion()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare correo text;
begin
  correo := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  /* EXACTAMENTE 57 + diez dígitos + el dominio, anclado a los dos extremos.
     Con un LIKE, el comodín aceptaba cualquier cosa en el medio y
     570003172862539@tugarantia.net se volvía el celular de otra persona. */
  if correo !~ '^57[0-9]{10}@tugarantia\.net$' then
    return null;
  end if;
  return substring(correo from 3 for 10);
end
$$;
revoke all on function public.celular_de_sesion() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. EL REGISTRO DE CONTACTOS — el WhatsApp que sí se puede registrar
--
-- NO se pueden leer las conversaciones de WhatsApp de nadie: WhatsApp no lo
-- permite y las librerías que lo simulan hacen que Meta banee el número. Lo que
-- sí queda, y sirve para control de calidad, es el HECHO del contacto: quién
-- abrió qué canal con quién, cuándo, y con qué texto salió el mensaje —porque
-- ese texto lo arma el propio CRM antes de entregárselo a WhatsApp.
--
-- SOLO SUMA, como las gestiones: un contacto es un hecho con fecha.
-- `quien` lo escribe el servidor desde la sesión, nunca la pantalla.
-- ---------------------------------------------------------------------------
create table if not exists public.contactos (
  id         bigserial   primary key,
  persona_id text        not null,
  quien      text        not null,      -- celular del que contactó
  canal      text        not null default 'whatsapp'
                         check (canal in ('whatsapp', 'llamada', 'sms', 'app')),
  texto      text        not null default '',
  cuando     timestamptz not null default now()
);
create index if not exists contactos_por_persona on public.contactos (persona_id, cuando desc);
create index if not exists contactos_por_quien   on public.contactos (quien, cuando desc);

-- El WhatsApp con el que trabaja cada quien. Puede no ser el celular con el que
-- entra: un asesor puede tener una línea de trabajo aparte, y el cliente le va a
-- contestar a esa.
alter table public.equipo add column if not exists whatsapp text;

alter table public.contactos enable row level security;
revoke all on public.contactos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. YO ANOTO QUE CONTACTÉ
--
-- Misma reja que gestion_anotar: solo gente de mi alcance, y quien firma sale
-- de la sesión. Se llama sola cuando el asesor toca el botón de WhatsApp.
-- ---------------------------------------------------------------------------
create or replace function public.contacto_anotar(
  p_persona_id text, p_canal text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; mios text[]; duenio text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  select a.asesor into duenio from public.asignaciones a
   where a.persona_id = p_persona_id
   order by a.desde desc, a.id desc limit 1;
  if duenio is null or not (duenio = any(mios)) then
    return jsonb_build_object('ok', false, 'motivo', 'esa persona no es de tu base');
  end if;

  insert into public.contactos (persona_id, quien, canal, texto)
  values (p_persona_id, yo.celular,
          case when p_canal in ('whatsapp','llamada','sms','app') then p_canal else 'whatsapp' end,
          left(coalesce(p_texto, ''), 600));
  return jsonb_build_object('ok', true);
end
$$;

-- Mi WhatsApp de trabajo. Solo el mío: no recibe de quién.
create or replace function public.mi_whatsapp_poner(p_whatsapp text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; w text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  w := right(public.solo_digitos(coalesce(p_whatsapp, '')), 10);
  if w <> '' and length(w) <> 10 then
    return jsonb_build_object('ok', false, 'motivo', 'ese número no tiene diez dígitos');
  end if;
  update public.equipo set whatsapp = nullif(w, ''), actualizado = now()
   where celular = cel and estado = 'activo';
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'whatsapp', nullif(w, ''));
end
$$;

-- La historia de contactos de UNA persona, para el que la trabaja y su jefe.
create or replace function public.contactos_de(p_persona_id text)
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
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  select a.asesor into duenio from public.asignaciones a
   where a.persona_id = p_persona_id
   order by a.desde desc, a.id desc limit 1;
  if duenio is null or not (duenio = any(mios)) then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'contactos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'canal', c.canal, 'texto', c.texto, 'cuando', c.cuando,
             'quien', coalesce(e.nombre, c.quien)) order by c.cuando desc)
      from public.contactos c
      left join public.equipo e on e.celular = c.quien
     where c.persona_id = p_persona_id), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 3. EL GERENTE CREA UN ASESOR
--
-- El rol y el jefe NO son parámetros: los pone el servidor. Esa es toda la
-- seguridad de esta función — si vinieran de la pantalla, un gerente se
-- fabricaría un gerente, o le metería gente al equipo de un colega.
--
-- La CUENTA (correo y contraseña) la crea el navegador con /auth/v1/signup y la
-- llave pública, igual que la crea Joan hoy. Eso no da acceso a nada por sí
-- solo: quién es quién lo dice esta tabla, y a esta tabla solo se entra por acá.
-- ---------------------------------------------------------------------------
create or replace function public.asesor_crear(p_celular text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; nuevo text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  if yo.rol <> 'gerente' then
    return jsonb_build_object('ok', false, 'motivo', 'solo un gerente puede crear asesores');
  end if;

  nuevo := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(nuevo) <> 10 or left(nuevo, 1) <> '3' then
    return jsonb_build_object('ok', false, 'motivo', 'ese celular no tiene diez dígitos ni empieza por 3');
  end if;
  if nuevo = yo.celular then
    return jsonb_build_object('ok', false, 'motivo', 'ese eres tú');
  end if;
  if exists (select 1 from public.equipo where celular = nuevo) then
    return jsonb_build_object('ok', false, 'motivo', 'ese celular ya está en el equipo');
  end if;
  /* UN CLIENTE NO PUEDE VOLVERSE EMPLEADO por esta puerta. Sería un empleado
     que se ve a sí mismo, y la forma de inventarse un «asesor» para mirar lo
     que no le toca. */
  if exists (select 1 from public.cartera
              where tipo = 'cliente' and right(celular, 10) = nuevo) then
    return jsonb_build_object('ok', false, 'motivo', 'ese celular es de un cliente; pídeselo a Joan');
  end if;

  insert into public.equipo (celular, nombre, rol, estado, jefe, actualizado)
  values (nuevo, left(coalesce(nullif(btrim(p_nombre), ''), 'Sin nombre'), 80),
          'asesor',            -- el servidor, no la pantalla
          'activo',
          yo.celular,          -- reporta a quien lo creó, y a nadie más
          now());

  return jsonb_build_object('ok', true, 'celular', nuevo);
end
$$;

-- Retirar a alguien de los míos. No se borra: se marca, para que su historia
-- y sus comisiones sigan teniendo dueño.
create or replace function public.asesor_retirar(p_celular text)
returns jsonb
language plpgsql
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
  if q = yo.celular then
    return jsonb_build_object('ok', false, 'motivo', 'no te puedes retirar a ti mismo');
  end if;
  update public.equipo set estado = 'retirado', actualizado = now()
   where celular = q and jefe = yo.celular;      -- solo los suyos
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'ese no es de tu equipo');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. EL GERENTE REPARTE — dentro de su alcance, y solo hacia dentro
--
-- Escribe una fila NUEVA con la fecha de hoy y nunca pisa una vieja: así la
-- comisión de un cliente reasignado le sigue llegando a quien mandaba EN ESA
-- FECHA (app/comisiones.js, asesorDe). Es la misma regla que usa el CRM de Joan.
--
-- INVARIANTE QUE NO SE PUEDE ROMPER DESPUÉS, y por eso queda escrito acá:
-- ESTA FUNCIÓN REPARTE GENTE QUE YA ESTÁ EN LA BASE. Nunca mete a nadie nuevo:
-- exige que la persona TENGA ya una asignación vigente, y que esa asignación
-- sea de alguien de su alcance. Quien mete gente a la base es Joan, y solo Joan.
--
-- Importa porque lo siguiente que va a existir es que el asesor vea la cédula y
-- las fotos del titular que se registró, y eso se va a desbloquear casándolo
-- con el CELULAR que esté en la base. El día que alguien le dé al gerente una
-- función que INSERTE celulares nuevos, le estará dando también la llave para
-- abrir la ficha de cualquiera: escribe el número, y la ficha se abre sola.
-- ---------------------------------------------------------------------------
create or replace function public.asignar_a(p_personas jsonb, p_asesor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel text; yo public.equipo; mios text[]; destino text;
  it jsonb; duenio text; n integer := 0; fuera integer := 0; sello text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' or yo.rol <> 'gerente' then
    return jsonb_build_object('ok', false, 'motivo', 'solo un gerente reparte');
  end if;
  mios := public.mi_alcance(yo.celular);

  destino := right(public.solo_digitos(coalesce(p_asesor, '')), 10);
  if not (destino = any(mios)) then
    return jsonb_build_object('ok', false, 'motivo', 'ese asesor no es de tu equipo');
  end if;
  if not exists (select 1 from public.equipo where celular = destino and estado = 'activo') then
    return jsonb_build_object('ok', false, 'motivo', 'ese asesor no está activo');
  end if;

  sello := 'G' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  for it in select * from jsonb_array_elements(coalesce(p_personas, '[]'::jsonb)) loop
    /* El dueño de HOY tiene que ser de los míos: un gerente no le quita gente
       al equipo de otro, aunque conozca el id. */
    select a.asesor into duenio from public.asignaciones a
     where a.persona_id = (it #>> '{}')
     order by a.desde desc, a.id desc limit 1;
    if duenio is null or not (duenio = any(mios)) then fuera := fuera + 1; continue; end if;
    if duenio = destino then continue; end if;

    insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
    values (sello || '-' || n, (it #>> '{}'), destino, current_date, now())
    on conflict (id) do nothing;
    n := n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'repartidos', n, 'fuera_de_tu_alcance', fuera);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. JOAN TRAE LO QUE HIZO SU GERENTE
--
-- Sin esto, el siguiente «☁ Publicar a la nube» borraría al asesor que creó el
-- gerente y las cuentas que repartió. Es el mismo remedio que ya se le puso a
-- las gestiones: traer antes de publicar.
-- ---------------------------------------------------------------------------
create or replace function public.equipo_traer(p_clave text)
returns jsonb
language plpgsql
/* VOLÁTIL A PROPÓSITO: pasa por clave_ok, que ESCRIBE el freno contra la fuerza
   bruta. Una «stable» revienta con 25006 antes de mirar la clave y no sirve
   nunca — la lección del 8 de septiembre. */
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return jsonb_build_object(
    'equipo', coalesce((select jsonb_agg(jsonb_build_object(
        'celular', celular, 'nombre', nombre, 'rol', rol, 'estado', estado,
        'jefe', jefe, 'whatsapp', whatsapp))
      from public.equipo), '[]'::jsonb),
    'asignaciones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'persona_id', persona_id, 'asesor', asesor, 'desde', desde))
      from public.asignaciones), '[]'::jsonb),
    'contactos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'persona_id', c.persona_id, 'quien', c.quien,
        'canal', c.canal, 'texto', c.texto, 'cuando', c.cuando))
      from public.contactos c
     where c.cuando > now() - interval '180 days'), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. MI CARTERA devuelve también el WhatsApp de cada quien del equipo
-- ---------------------------------------------------------------------------
-- (mi_cartera no cambia de firma; solo se le agrega el dato en `equipo`.)

-- ---------------------------------------------------------------------------
-- 7. LOS PERMISOS
-- ---------------------------------------------------------------------------
revoke all on function public.contacto_anotar(text, text, text) from public, anon, authenticated;
grant  execute on function public.contacto_anotar(text, text, text) to authenticated;
revoke all on function public.contactos_de(text) from public, anon, authenticated;
grant  execute on function public.contactos_de(text) to authenticated;
revoke all on function public.mi_whatsapp_poner(text) from public, anon, authenticated;
grant  execute on function public.mi_whatsapp_poner(text) to authenticated;
revoke all on function public.asesor_crear(text, text) from public, anon, authenticated;
grant  execute on function public.asesor_crear(text, text) to authenticated;
revoke all on function public.asesor_retirar(text) from public, anon, authenticated;
grant  execute on function public.asesor_retirar(text) to authenticated;
revoke all on function public.asignar_a(jsonb, text) from public, anon, authenticated;
grant  execute on function public.asignar_a(jsonb, text) to authenticated;
revoke all on function public.equipo_traer(text) from public, anon, authenticated;
grant  execute on function public.equipo_traer(text) to anon;   -- Joan, con su clave

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 8. LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text;
begin
  -- La puerta de la identidad, que es de lo que cuelga todo lo de arriba.
  select prosrc into cuerpo from pg_proc
   where proname = 'celular_de_sesion' and pronamespace = 'public'::regnamespace;
  if cuerpo is null or cuerpo like '%not like%' or cuerpo not like '%net$%' then
    raise exception 'celular_de_sesion no quedo con la comprobacion exacta del correo';
  end if;

  if to_regclass('public.contactos') is null then
    raise exception 'falto la tabla de contactos';
  end if;
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public' and table_name = 'contactos'
                and grantee in ('anon', 'authenticated')) then
    raise exception 'la tabla contactos quedo abierta a la llave publica';
  end if;

  -- EL ROL Y EL JEFE NO PUEDEN SER PARAMETROS: es toda la seguridad de crear.
  if pg_get_function_arguments('public.asesor_crear(text, text)'::regprocedure)
     !~ '^p_celular text, p_nombre text$' then
    raise exception 'asesor_crear recibe algo mas que el celular y el nombre';
  end if;
  select prosrc into cuerpo from pg_proc
   where proname = 'asesor_crear' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%celular_de_sesion%' then
    raise exception 'asesor_crear no saca de la sesion quien crea';
  end if;
  if cuerpo not like '%yo.rol <> ''gerente''%' then
    raise exception 'asesor_crear no comprueba que quien crea sea gerente';
  end if;
  if cuerpo not like '%''asesor''%' then
    raise exception 'asesor_crear no fija el rol en el servidor';
  end if;

  -- Repartir, dentro del alcance y nada mas.
  select prosrc into cuerpo from pg_proc
   where proname = 'asignar_a' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%mi_alcance%' or cuerpo not like '%celular_de_sesion%' then
    raise exception 'asignar_a no comprueba el alcance del que reparte';
  end if;

  -- Nada de esto puede abrirse sin sesion.
  if has_function_privilege('anon', 'public.asesor_crear(text, text)', 'execute')
     or has_function_privilege('anon', 'public.asignar_a(jsonb, text)', 'execute')
     or has_function_privilege('anon', 'public.contacto_anotar(text, text, text)', 'execute') then
    raise exception 'alguna funcion del gerente quedo abierta sin sesion';
  end if;

  -- Y equipo_traer es de Joan, con su clave, y tiene que ser volatil.
  if (select provolatile from pg_proc
       where proname = 'equipo_traer' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'equipo_traer no es volatil y pasa por clave_ok: no serviria nunca';
  end if;
end $$;
