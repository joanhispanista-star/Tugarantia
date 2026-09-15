-- ===========================================================================
-- LA FICHA DEL REGISTRADO Y EL CALENDARIO DEL EQUIPO
-- 15 de septiembre de 2026.
--
-- Dos cosas que Joan pidió, y que comparten la misma reja:
--
--   «cuando un cliente de su base se registre, que el gerente y el asesor
--    puedan ver la información completa del titular y las fotos, para verificar
--    la identidad y que esté completa. Si el titular se registra con otro
--    número y otro nombre entonces no se puede ver la información, únicamente
--    los clientes potenciales asignados.»
--
--   «también quiero que haya un calendario para el equipo.»
--
-- ---------------------------------------------------------------------------
-- LA REJA DE LA FICHA ES EL CELULAR, Y NO PUEDE SER OTRA COSA
--
-- La cartera del equipo (20260910) lleva a propósito lo mínimo: nombre, celular
-- y etapa. Ni cédula, ni dirección, ni fotos. Esto abre una puerta a lo demás, y
-- por eso la llave tiene que ser dura:
--
--   · Se abre por PERSONA DE MI BASE, no por celular suelto. La función no
--     recibe un teléfono: recibe el id de alguien que ya está asignado a mí. Un
--     asesor no puede preguntar por un número que se le ocurrió.
--   · Se cruza por el CELULAR de esa persona en la base contra el teléfono con
--     el que alguien se registró. Sin ese cruce no hay ficha: si el titular se
--     registró con otro número, no hay nada que mostrar y se dice así. Es lo que
--     pidió Joan y además es lo único honesto — cruzar por nombre sería adivinar,
--     y adivinar aquí significa enseñarle la cédula de una persona a quien
--     preguntó por otra.
--
-- MISMO NÚMERO Y OTRO NOMBRE: SE MUESTRA, CON AVISO. Decisión de Joan del
-- 15-sep-2026, pedida expresamente. El caso real no es un fraude sino lo de
-- siempre: la base dice «Ana Rodríguez» y ella se registra como «Ana María
-- Rodríguez Pérez». Bloquear eso habría escondido la ficha justo cuando sirve.
-- Así que la función compara los nombres y, cuando de verdad no se parecen,
-- devuelve la ficha CON un aviso que lleva los dos nombres, para que quien mira
-- decida. La pantalla lo pinta arriba y en ámbar, antes de la primera foto.
--
-- Y QUEDA REGISTRADO QUIÉN MIRÓ. Abrir la cédula y la selfie de una persona es
-- un acto con consecuencias bajo la Ley 1581, y el responsable es Joan, no el
-- asesor que hizo clic. Un registro de quién abrió qué y cuándo cuesta una
-- tabla y lo protege a él: sin eso, el día que alguien use esas fotos para algo,
-- no hay forma de saber por dónde salieron.
-- ---------------------------------------------------------------------------
-- EL CALENDARIO NO INVENTA FECHAS QUE NO EXISTEN
--
-- La tentación era pintar un calendario con los vencimientos de los créditos. No
-- se puede sin romper lo anterior: esas fechas viven en el CRM de Joan y la
-- cartera del equipo no las lleva, a propósito (ver la cabecera de 20260910).
-- Publicarlas sería meterle plata al teléfono del asesor por la puerta de atrás.
--
-- Así que el calendario lleva lo que el equipo ACUERDA: la promesa de pago que
-- dio el cliente, la visita, la llamada de vuelta. Es dato nuevo, lo escribe
-- quien habló, y es justamente lo que una cobranza necesita ver por día. Lo que
-- el cliente debe se sigue viendo donde siempre.
--
-- Se puede correr dos veces. No borra nada.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. NO SE CORRE ANTES DE TIEMPO
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.mi_alcance(text)') is null then
    raise exception 'Falta 20260910_equipo_en_la_nube.sql: esta migracion cuelga de mi_alcance';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null then
    raise exception 'Falta 20260910c_quien_soy.sql: sin el, cualquiera podria pasar por otro';
  end if;
  if to_regclass('public.registro_archivos') is null then
    raise exception 'Falta 20260908b_registro_archivos.sql: no hay donde estan las fotos';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. COMPARAR DOS NOMBRES SIN QUE UNA TILDE DECIDA
--
-- Devuelve 'igual', 'parecido' o 'distinto'.
--
-- «Parecido» no es un matiz: es el caso normal. La base dice «Ana Rodriguez» y
-- ella se registra «ANA MARÍA RODRÍGUEZ PÉREZ». Si eso levantara aviso, el aviso
-- saldría siempre y a la semana nadie lo leería — que es la forma en que una
-- advertencia deja de servir. Se considera parecido cuando comparten dos
-- palabras de nombre, o cuando uno cabe entero dentro del otro.
--
-- Sin unaccent: la extensión puede no estar instalada y esto tiene que correr en
-- cualquier proyecto. translate() con las cinco vocales y la eñe alcanza para
-- español y no depende de nada.
-- ---------------------------------------------------------------------------
create or replace function public.nombre_normalizado(p_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_nombre, '')),
              'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc'),
    '[^a-z0-9 ]', ' ', 'g'));
$$;

create or replace function public.nombres_se_parecen(p_a text, p_b text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  a text; b text; pa text[]; pb text[]; comunes integer;
begin
  a := regexp_replace(public.nombre_normalizado(p_a), '\s+', ' ', 'g');
  b := regexp_replace(public.nombre_normalizado(p_b), '\s+', ' ', 'g');
  if a = '' or b = '' then return 'distinto'; end if;
  if a = b then return 'igual'; end if;
  /* Uno cabe entero dentro del otro: «ana rodriguez» dentro de «ana maria
     rodriguez perez». Es la misma persona escribiendo más. */
  if position(a in b) > 0 or position(b in a) > 0 then return 'parecido'; end if;

  /* O comparten dos palabras. Una sola no basta: medio país se llama «maria». */
  pa := string_to_array(a, ' ');
  pb := string_to_array(b, ' ');
  select count(*) into comunes
    from (select unnest(pa) intersect select unnest(pb)) t
   where length(t.unnest) >= 3;
  if comunes >= 2 then return 'parecido'; end if;
  return 'distinto';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. QUIÉN ABRIÓ QUÉ FICHA — ver la cabecera
--
-- Solo suma. Nadie la edita y nadie la borra desde la app: es el papel que le
-- permite a Joan contestar «quién vio esto» el día que haga falta.
-- ---------------------------------------------------------------------------
create table if not exists public.fichas_vistas (
  id         bigserial   primary key,
  persona_id text        not null,
  celular    text        not null,   -- el de la persona mirada
  quien      text        not null,   -- el celular del que miró
  aviso      text        not null default '',
  cuando     timestamptz not null default now()
);
create index if not exists fichas_vistas_por_quien   on public.fichas_vistas (quien, cuando desc);
create index if not exists fichas_vistas_por_persona on public.fichas_vistas (persona_id, cuando desc);

alter table public.fichas_vistas enable row level security;
revoke all on table public.fichas_vistas from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. LA FICHA DE ALGUIEN DE MI BASE
--
-- VOLÁTIL porque escribe el registro de quién miró. No se le puede poner
-- «stable»: PostgREST corre las stable en transacción de solo lectura y esto
-- reventaría con 25006 SIEMPRE. Es el mismo defecto que tuvo muertas dos
-- funciones durante dos días en septiembre.
-- ---------------------------------------------------------------------------
create or replace function public.ficha_de_mi_base(p_persona_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel     text;
  yo      public.equipo;
  mios    text[];
  p       public.cartera;
  cel10   text;
  r       public.registros;
  fotos   jsonb;
  parec   text;
  aviso   jsonb := null;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  /* LA REJA. La persona tiene que estar asignada HOY a alguien de mi alcance.
     La asignación vigente es la de fecha más reciente: la lista solo suma. */
  select c.* into p
    from public.cartera c
    join public.asignaciones a on a.persona_id = c.id
   where c.id = p_persona_id
     and a.asesor = any(mios)
     and a.desde = (select max(a2.desde) from public.asignaciones a2
                     where a2.persona_id = c.id)
   limit 1;
  if not found then
    /* Ni «no existe» ni «no es tuya»: la misma respuesta para los dos, porque
       distinguirlas convertiría esto en un detector de a quién lleva otro. */
    perform pg_sleep(0.2);
    return jsonb_build_object('ok', false, 'motivo', 'no_es_de_tu_base');
  end if;

  cel10 := right(public.solo_digitos(p.celular), 10);
  if cel10 is null or length(cel10) < 10 then
    return jsonb_build_object('ok', true, 'registrado', false,
      'nombre_base', p.nombre, 'celular', p.celular,
      'motivo', 'sin_celular');
  end if;

  /* EL CRUCE, Y EL ÚNICO QUE HAY: el celular de la base contra el teléfono con
     el que alguien se registró. Si el titular se registró con otro número, acá
     no sale nada y así se contesta. */
  select * into r from public.registros
   where right(public.solo_digitos(telefono), 10) = cel10
   order by creado_en desc limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'registrado', false,
      'nombre_base', p.nombre, 'celular', p.celular);
  end if;

  /* MISMO NÚMERO, OTRO NOMBRE: se muestra, con aviso. Decisión de Joan del
     15-sep-2026. Los dos nombres viajan para que quien mira decida. */
  parec := public.nombres_se_parecen(p.nombre, r.nombre);
  if parec = 'distinto' then
    aviso := jsonb_build_object(
      'tipo', 'otro_nombre',
      'en_la_base', p.nombre,
      'se_registro_como', r.nombre,
      'texto', 'Este numero esta en tu base a nombre de otra persona. ' ||
               'Verifica con la cedula antes de seguir, y si no es quien dices, avisa.');
  end if;

  select coalesce(jsonb_object_agg(tipo, imagen), '{}'::jsonb) into fotos
    from public.registro_archivos
   where right(public.solo_digitos(celular), 10) = cel10;

  insert into public.fichas_vistas (persona_id, celular, quien, aviso)
  values (p.id, cel10, yo.celular, coalesce(aviso ->> 'tipo', ''));

  return jsonb_build_object(
    'ok', true, 'registrado', true,
    'persona_id', p.id,
    'nombre_base', p.nombre,
    'nombre', r.nombre,
    'cedula', r.cedula,
    'celular', r.telefono,
    'datos', coalesce(r.datos, '{}'::jsonb),
    'huella', coalesce(r.huella, '{}'::jsonb),
    'registrado_en', r.creado_en,
    'fotos', fotos,
    'aviso', aviso);
end
$$;

-- ---------------------------------------------------------------------------
-- 3-bis. JOAN VE QUIÉN ABRIÓ QUÉ
-- ---------------------------------------------------------------------------
create or replace function public.fichas_vistas_traer(p_clave text, p_desde text default null)
returns jsonb
language plpgsql
/* VOLÁTIL: pasa por clave_ok, que escribe el freno contra la fuerza bruta. */
security definer
set search_path = public
as $$
declare d timestamptz;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;
  d := coalesce(nullif(p_desde, '')::timestamptz, now() - interval '30 days');
  return jsonb_build_object('ok', true, 'vistas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'persona_id', v.persona_id, 'celular', v.celular,
             'quien', v.quien, 'quien_nombre', coalesce(e.nombre, v.quien),
             'aviso', v.aviso, 'cuando', v.cuando) order by v.cuando desc)
      from public.fichas_vistas v
      left join public.equipo e on e.celular = v.quien
     where v.cuando >= d), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 4. EL CALENDARIO DEL EQUIPO
--
-- Lo que el equipo ACUERDA, no lo que el crédito vence: ver la cabecera.
--
-- `para` es a quién le toca y `quien` es quien la escribió, y son dos columnas
-- distintas a propósito: el gerente pone una visita en el día de su asesor y
-- tiene que verse quién la puso. Un asesor solo puede ponerse cosas a sí mismo,
-- y eso lo decide el servidor, no el botón.
-- ---------------------------------------------------------------------------
create table if not exists public.agenda (
  id         bigserial   primary key,
  persona_id text,                          -- puede ser null: una cita sin cliente
  titulo     text        not null,
  cuando     date        not null,
  hora       text        not null default '',   -- 'HH:MM' o vacío, que es «en el día»
  tipo       text        not null default 'llamada'
                         check (tipo in ('cobro', 'visita', 'llamada', 'recordatorio')),
  quien      text        not null,          -- quien la escribió
  para       text        not null,          -- a quien le toca
  nota       text        not null default '',
  hecho      boolean     not null default false,
  hecho_en   timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists agenda_por_para on public.agenda (para, cuando);
create index if not exists agenda_pendiente on public.agenda (cuando) where not hecho;

alter table public.agenda enable row level security;
revoke all on table public.agenda from public, anon, authenticated;

create or replace function public.agenda_poner(
  p_titulo text,
  p_cuando date,
  p_tipo text default 'llamada',
  p_para text default null,
  p_persona_id text default null,
  p_hora text default '',
  p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel text; yo public.equipo; mios text[]; destino text; t text; id_nuevo bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  if btrim(coalesce(p_titulo, '')) = '' then
    return jsonb_build_object('ok', false, 'motivo', 'escribe de que se trata');
  end if;
  if p_cuando is null then
    return jsonb_build_object('ok', false, 'motivo', 'falta la fecha');
  end if;
  /* Un año hacia adelante y un mes hacia atrás. No es capricho: una fecha de
     2126 escrita por un dedo torpe desaparece de la agenda sin avisar, y una de
     2019 la ensucia para siempre. */
  if p_cuando > (current_date + interval '1 year')::date
     or p_cuando < (current_date - interval '1 month')::date then
    return jsonb_build_object('ok', false, 'motivo', 'esa fecha esta muy lejos');
  end if;

  /* A QUIÉN LE TOCA, DECIDIDO ACÁ. Un asesor solo a sí mismo; un gerente a
     cualquiera de su alcance. Si el navegador manda otro celular, se ignora. */
  destino := right(public.solo_digitos(coalesce(p_para, '')), 10);
  if destino is null or destino = '' then destino := yo.celular; end if;
  if destino <> yo.celular and not (destino = any(mios)) then
    return jsonb_build_object('ok', false, 'motivo', 'esa persona no es de tu equipo');
  end if;

  t := case when p_tipo in ('cobro', 'visita', 'llamada', 'recordatorio')
            then p_tipo else 'llamada' end;

  /* Si la cita es sobre alguien, ese alguien tiene que ser de mi base. Sin esta
     reja, la agenda sería una forma de escribir en la cartera de otro. */
  if p_persona_id is not null and p_persona_id <> '' then
    if not exists (select 1 from public.asignaciones a
                    where a.persona_id = p_persona_id
                      and a.asesor = any(mios)
                      and a.desde = (select max(a2.desde) from public.asignaciones a2
                                      where a2.persona_id = a.persona_id)) then
      return jsonb_build_object('ok', false, 'motivo', 'esa persona no es de tu base');
    end if;
  end if;

  insert into public.agenda (persona_id, titulo, cuando, hora, tipo, quien, para, nota)
  values (nullif(p_persona_id, ''), left(btrim(p_titulo), 140), p_cuando,
          left(coalesce(p_hora, ''), 5), t, yo.celular, destino,
          left(coalesce(p_nota, ''), 400))
  returning id into id_nuevo;

  return jsonb_build_object('ok', true, 'id', id_nuevo);
end
$$;

-- Lo que me toca a mí, o a los míos si soy gerente. Sin un parámetro que diga
-- de quién: la pregunta no tiene dónde escribir un celular ajeno.
create or replace function public.agenda_mia(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; mios text[]; d1 date; d2 date;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  d1 := coalesce(p_desde, (current_date - interval '7 days')::date);
  d2 := coalesce(p_hasta, (current_date + interval '60 days')::date);
  /* Una ventana enorme traería toda la agenda del equipo a un celular. */
  if d2 > (d1 + interval '180 days')::date then d2 := (d1 + interval '180 days')::date; end if;

  return jsonb_build_object(
    'ok', true, 'desde', d1, 'hasta', d2,
    'citas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'persona_id', g.persona_id, 'titulo', g.titulo,
               'cuando', g.cuando, 'hora', g.hora, 'tipo', g.tipo, 'nota', g.nota,
               'hecho', g.hecho,
               'para', g.para, 'para_nombre', coalesce(ep.nombre, g.para),
               'quien', g.quien, 'quien_nombre', coalesce(eq.nombre, g.quien),
               'persona_nombre', coalesce(c.nombre, ''),
               'persona_celular', coalesce(c.celular, ''))
               order by g.cuando, g.hora, g.id)
        from public.agenda g
        left join public.equipo  ep on ep.celular = g.para
        left join public.equipo  eq on eq.celular = g.quien
        left join public.cartera c  on c.id = g.persona_id
       where g.para = any(mios) and g.cuando between d1 and d2), '[]'::jsonb));
end
$$;

create or replace function public.agenda_hecho(p_id bigint, p_hecho boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; mios text[];
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  update public.agenda
     set hecho = coalesce(p_hecho, true),
         hecho_en = case when coalesce(p_hecho, true) then now() else null end
   where id = p_id and para = any(mios);
  if not found then return jsonb_build_object('ok', false, 'motivo', 'esa cita no es tuya'); end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Borrar: solo el que la escribió, o el gerente de quien la tiene. Un asesor no
-- le borra a otro asesor lo que le pusieron.
create or replace function public.agenda_borrar(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; mios text[];
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  delete from public.agenda
   where id = p_id
     and (quien = yo.celular
          or (yo.rol = 'gerente' and para = any(mios)));
  if not found then return jsonb_build_object('ok', false, 'motivo', 'esa cita no la puedes borrar'); end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Y Joan la ve entera desde su CRM, con su clave.
create or replace function public.agenda_traer(p_clave text, p_desde text default null)
returns jsonb
language plpgsql
/* VOLÁTIL: clave_ok escribe el freno. */
security definer
set search_path = public
as $$
declare d date;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;
  d := coalesce(nullif(p_desde, '')::date, (current_date - interval '30 days')::date);
  return jsonb_build_object('ok', true, 'citas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', g.id, 'persona_id', g.persona_id, 'titulo', g.titulo,
             'cuando', g.cuando, 'hora', g.hora, 'tipo', g.tipo, 'nota', g.nota,
             'hecho', g.hecho, 'hecho_en', g.hecho_en,
             'para', g.para, 'para_nombre', coalesce(ep.nombre, g.para),
             'quien', g.quien, 'quien_nombre', coalesce(eq.nombre, g.quien),
             'persona_nombre', coalesce(c.nombre, ''),
             'persona_celular', coalesce(c.celular, ''))
             order by g.cuando, g.hora, g.id)
      from public.agenda g
      left join public.equipo  ep on ep.celular = g.para
      left join public.equipo  eq on eq.celular = g.quien
      left join public.cartera c  on c.id = g.persona_id
     where g.cuando >= d), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. LOS PERMISOS
--
-- PostgreSQL le concede EXECUTE a PUBLIC por defecto. El revoke va SIEMPRE
-- antes del grant, y el grant es el mínimo: las del equipo a «authenticated»
-- (la reja de quién es la pone celular_de_sesion adentro), y las de Joan a
-- «anon», porque su CRM entra con la clave y no con sesión.
-- ---------------------------------------------------------------------------
revoke all on function public.nombre_normalizado(text)              from public, anon, authenticated;
grant  execute on function public.nombre_normalizado(text)          to authenticated;
revoke all on function public.nombres_se_parecen(text, text)        from public, anon, authenticated;
grant  execute on function public.nombres_se_parecen(text, text)    to authenticated;

revoke all on function public.ficha_de_mi_base(text)                from public, anon, authenticated;
grant  execute on function public.ficha_de_mi_base(text)            to authenticated;

revoke all on function public.agenda_poner(text, date, text, text, text, text, text)
                                                                    from public, anon, authenticated;
grant  execute on function public.agenda_poner(text, date, text, text, text, text, text)
                                                                    to authenticated;
revoke all on function public.agenda_mia(date, date)                from public, anon, authenticated;
grant  execute on function public.agenda_mia(date, date)            to authenticated;
revoke all on function public.agenda_hecho(bigint, boolean)         from public, anon, authenticated;
grant  execute on function public.agenda_hecho(bigint, boolean)     to authenticated;
revoke all on function public.agenda_borrar(bigint)                 from public, anon, authenticated;
grant  execute on function public.agenda_borrar(bigint)             to authenticated;

revoke all on function public.agenda_traer(text, text)              from public, anon, authenticated;
grant  execute on function public.agenda_traer(text, text)          to anon;
revoke all on function public.fichas_vistas_traer(text, text)       from public, anon, authenticated;
grant  execute on function public.fichas_vistas_traer(text, text)   to anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. LA COMPROBACIÓN — que lo de arriba de verdad quedó puesto
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.ficha_de_mi_base(text)') is null then
    raise exception 'ficha_de_mi_base no quedo';
  end if;
  if to_regprocedure('public.agenda_poner(text, date, text, text, text, text, text)') is null then
    raise exception 'agenda_poner no quedo';
  end if;
  if to_regclass('public.agenda') is null or to_regclass('public.fichas_vistas') is null then
    raise exception 'faltan las tablas nuevas';
  end if;

  -- NADIE ENTRA DIRECTO A LAS TABLAS NUEVAS.
  if exists (select 1 from pg_tables
              where schemaname = 'public' and tablename in ('agenda', 'fichas_vistas')
                and not rowsecurity) then
    raise exception 'una de las tablas nuevas quedo sin RLS';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('agenda', 'fichas_vistas')
                and grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception 'una de las tablas nuevas quedo abierta a la llave publica';
  end if;

  -- LA FICHA NO PUEDE SER «STABLE»: escribe el registro de quien miro, y
  -- PostgREST corre las stable en transaccion de solo lectura. Seria un 25006
  -- en cada clic, siempre.
  if (select provolatile from pg_proc
       where oid = 'public.ficha_de_mi_base(text)'::regprocedure) <> 'v' then
    raise exception 'ficha_de_mi_base no es volatil: devolveria 25006 siempre';
  end if;
  if (select provolatile from pg_proc
       where oid = 'public.agenda_traer(text, text)'::regprocedure) <> 'v' then
    raise exception 'agenda_traer no es volatil y pasa por clave_ok: devolveria 25006 siempre';
  end if;

  -- Y LA COMPARACION DE NOMBRES HACE LO QUE DICE.
  if public.nombres_se_parecen('Ana Rodriguez', 'ANA MARÍA RODRÍGUEZ PÉREZ') <> 'parecido' then
    raise exception 'nombres_se_parecen levantaria aviso con el caso normal';
  end if;
  if public.nombres_se_parecen('Ana Rodriguez', 'Ana Rodriguez') <> 'igual' then
    raise exception 'nombres_se_parecen no reconoce dos nombres identicos';
  end if;
  if public.nombres_se_parecen('Ana Rodriguez', 'Carlos Pérez Gómez') <> 'distinto' then
    raise exception 'nombres_se_parecen no levanta aviso con dos personas distintas';
  end if;
  if public.nombres_se_parecen('Maria Gomez', 'Maria Lopez') <> 'distinto' then
    raise exception 'una sola palabra en comun no puede contar como parecido';
  end if;
end
$$;
