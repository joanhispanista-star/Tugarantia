-- ===========================================================================
-- EL GERENTE VENDE — 15 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve lo que ya está y no lo repite.
-- Va DESPUÉS de todo lo de octubre (20261005, 20261007, 20261007c, 20261008 y
-- sus compañeras): si falta algo, se detiene en el primer bloque, dice qué, y
-- no toca nada. Después: Settings → API → «Reload schema», y en seguida pega
-- base/20261015b_el_gerente_vende_comprobar.sql y mándale a Claude la tabla.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN (15-oct-2026)
--
-- «quiero que [Willian, su gerente] inicie vendiendo créditos y que pueda ver
--  los nuevos registros pero únicamente de los clientes que tenemos como
--  prospectos y no todos, solo los que yo le asigne, y que él pueda hacer la
--  venta y la cobranza».
--
-- Y decidió, preguntado:
--   · que el gerente vea el registro COMPLETO, con las fotos de la cédula y la
--     selfie, no solo el contacto;
--   · que su propuesta le llegue al cliente directo, dentro de unos topes que
--     fija Joan. El desembolso sigue siendo solo de Joan.
--
-- ---------------------------------------------------------------------------
-- CÓMO QUEDÓ
--
-- 1. QUÉ REGISTROS VE: los de su alcance (él y sus asesores, mi_alcance), y
--    nada más. Llegan por dos caminos:
--      · el prospecto que Joan ya le asignó (cartera + asignaciones) y que se
--        registró en la app. Se reconoce por el celular, que es lo único que
--        comparten la base de Joan y el registro;
--      · el que Joan le asigna a mano desde 📥 Registrados (registros_asignados),
--        para quien no venía de su base.
--    Si los dos caminos dicen cosas distintas, MANDA LA ASIGNACIÓN A MANO: es
--    la decisión más reciente y explícita de Joan. Sin esta regla, uno de la
--    base de OTRO gerente que Joan le pasa a Willian lo verían los dos, y los
--    dos le podrían proponer al mismo cliente.
--    La regla vive en UNA función, registro_en_mi_alcance, y la usan las tres
--    puertas: la lista, las fotos y la propuesta. Si un día cambia, cambia en
--    las tres a la vez; tres copias de la regla son tres formas de que una se
--    quede atrás.
--
-- 2. LAS FOTOS DEJAN RASTRO. Joan eligió que el gerente vea la cédula y la
--    selfie. Es su decisión, y es legal con el encargo firmado (Ley 1581,
--    art. 25; Decreto 1377). Lo que pone este archivo es la otra mitad: cada vez
--    que el gerente abre las fotos de alguien queda anotado quién, de quién y
--    cuándo (vistas_de_datos, de solo agregar). Si un día hay un reclamo, eso es
--    lo que se muestra. La lista no se anota: se refresca sola y llenaría el
--    rastro de ruido que nadie leería.
--
-- 3. LA VENTA. gerente_proponer arma la propuesta con contrapropuesta_de, LA
--    MISMA función que usa Joan. Así el cliente la ve y la acepta con «Las
--    condiciones de este crédito» (aceptar_condiciones) exactamente igual, y en
--    `por` queda «gerente:<celular>».
--      · Los topes los fija Joan (topes_equipo). Sin topes el gerente no puede
--        proponer: cerrado por defecto. El techo del COSTO es el de Joan; el
--        techo legal del RECARGO por atraso ya va en las condiciones de cada
--        crédito desde el 8-oct.
--      · Solo sobre solicitudes 'nueva' o 'contrapropuesta'. Una aceptada es de
--        Joan, que es quien desembolsa, y reproponerla le cambiaría al cliente
--        lo que ya firmó.
--
-- 4. REPARTIR, ARREGLADO. 20260922k puso un índice único (persona_id, desde) y
--    asignar_a siguió con `on conflict (id) do nothing`. Reasignar a alguien el
--    mismo día que Joan publicó, o dos veces el mismo día, tumbaba la llamada
--    entera con 23505. Se parcha la línea exacta leyendo la función VIVA, como
--    20261002d con clave_ok: copiar el cuerpo desde un archivo pisaría lo que
--    otra migración le haya cambiado después. Si la línea no está, no se toca
--    nada.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
do $$
begin
  if to_regprocedure('public.mi_alcance(text)') is null
     or to_regprocedure('public.celular_de_sesion()') is null
     or to_regclass('public.equipo') is null
     or to_regclass('public.cartera') is null
     or to_regclass('public.asignaciones') is null
     or to_regclass('public.asignaciones_una_por_dia') is null then
    raise exception 'Falta lo del equipo (20260910, 20260911, 20260922k y 20260922p). No se tocó nada.';
  end if;
  if to_regprocedure('public.contrapropuesta_de(bigint, integer, integer, text, text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null then
    raise exception 'Falta base/20260908_primer_credito.sql (contrapropuesta_de). No se tocó nada.';
  end if;
  if to_regprocedure('public.aceptar_condiciones(bigint, jsonb)') is null then
    raise exception 'Falta base/20261008_condiciones_aceptadas.sql: sin ella el cliente no puede aceptar la propuesta con sus condiciones. Córrela primero. No se tocó nada.';
  end if;
  if to_regprocedure('public.llave_de_solicitud(public.solicitudes)') is null
     or to_regprocedure('public.pesos_texto(bigint)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'celular')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'app')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'resuelta_en') then
    raise exception 'Falta base/20261005_platachat_solicitud.sql (y las dos de PlataChat de antes). Córrelas primero. No se tocó nada.';
  end if;
end $$;

-- ====== 1. LAS TRES TABLAS NUEVAS ======
-- Todas con RLS y sin políticas: nadie las lee ni las escribe desde afuera.
-- Solo las funciones de abajo, que corren como dueño y ponen sus propias rejas.

-- El registro que Joan le asigna a mano a alguien del equipo. Una asignación
-- viva por celular; las viejas se quedan con su `hasta`, para saber quién lo
-- tenía en cada fecha.
create table if not exists public.registros_asignados (
  id        bigint      generated always as identity primary key,
  telefono  text        not null,        -- 10 dígitos, como celular_de_sesion
  asesor    text        not null,        -- celular del gerente o del asesor
  activo    boolean     not null default true,
  desde     timestamptz not null default now(),
  hasta     timestamptz
);
create unique index if not exists registros_asignados_uno_vivo
  on public.registros_asignados (telefono) where activo;
create index if not exists registros_asignados_por_asesor
  on public.registros_asignados (asesor) where activo;
alter table public.registros_asignados enable row level security;
revoke all on table public.registros_asignados from public, anon, authenticated;

-- Los topes de la venta del equipo. Una sola fila (id = 1). Sin fila, el
-- gerente no puede proponer.
create table if not exists public.topes_equipo (
  id          integer     primary key default 1 check (id = 1),
  capital_max bigint      not null check (capital_max between 10000 and 20000000),
  costo_min   integer     not null check (costo_min between 1 and 50),
  costo_max   integer     not null check (costo_max between 1 and 50),
  dias_max    integer     not null check (dias_max between 1 and 60),
  actualizado timestamptz not null default now(),
  check (costo_min <= costo_max)
);
alter table public.topes_equipo enable row level security;
revoke all on table public.topes_equipo from public, anon, authenticated;

-- El rastro: quién del equipo abrió los datos sensibles de quién.
create table if not exists public.vistas_de_datos (
  id      bigint      generated always as identity primary key,
  quien   text        not null,          -- celular de quien miró
  que     text        not null,          -- qué abrió, p. ej. 'fotos_registro'
  de      text        not null,          -- celular de la persona mirada
  cuando  timestamptz not null default now()
);
create index if not exists vistas_de_datos_por_persona on public.vistas_de_datos (de, cuando desc);
create index if not exists vistas_de_datos_por_quien   on public.vistas_de_datos (quien, cuando desc);
alter table public.vistas_de_datos enable row level security;
revoke all on table public.vistas_de_datos from public, anon, authenticated;

-- De solo agregar. Un rastro que se puede borrar no prueba nada, y menos ante
-- la SIC.
create or replace function public.vistas_de_datos_no_se_cambian()
returns trigger
language plpgsql
as $$
begin
  raise exception 'el rastro de quién vio qué no se cambia ni se borra';
end
$$;
drop trigger if exists vistas_de_datos_solo_agregar on public.vistas_de_datos;
create trigger vistas_de_datos_solo_agregar
  before update or delete on public.vistas_de_datos
  for each row execute function public.vistas_de_datos_no_se_cambian();

-- ====== 2. LAS DOS REGLAS, CADA UNA EN UN SOLO SITIO ======

-- ¿Quién es el gerente de esta sesión? Nadie si no es gerente activo. Que
-- devuelva la fila entera y no un sí o un no ahorra volver a leerla.
create or replace function public.gerente_de_sesion()
returns public.equipo
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; yo public.equipo;
begin
  cel := public.celular_de_sesion();
  if cel is null then return null; end if;
  select * into yo from public.equipo
   where celular = cel and estado = 'activo' and rol = 'gerente';
  if not found then return null; end if;
  return yo;
end
$$;

-- ¿Este celular le toca a alguien de mi alcance? Devuelve POR QUÉ ('base' o
-- 'asignado') o null. Lo que manda en la base es la ÚLTIMA asignación de la
-- persona, igual que en contrapropuesta_gerente: si Joan se la pasó a otro
-- equipo, deja de ser suya aunque lo haya sido.
create or replace function public.registro_en_mi_alcance(p_yo text, p_tel text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare mios text[]; t text; duenio text; amano text;
begin
  t := right(public.solo_digitos(coalesce(p_tel, '')), 10);
  if length(t) <> 10 then return null; end if;
  mios := public.mi_alcance(p_yo);
  if coalesce(array_length(mios, 1), 0) = 0 then return null; end if;

  -- La asignación a mano manda: si existe, solo cuenta ella.
  select ra.asesor into amano from public.registros_asignados ra
   where ra.telefono = t and ra.activo limit 1;
  if amano is not null then
    return case when amano = any(mios) then 'asignado' end;
  end if;

  select a.asesor into duenio
    from public.cartera p
    join public.asignaciones a on a.persona_id = p.id
   where right(public.solo_digitos(p.celular), 10) = t
   order by a.desde desc, a.id desc
   limit 1;
  if duenio is not null and duenio = any(mios) then return 'base'; end if;
  return null;
end
$$;

-- ====== 3. LO QUE LLAMA EL GERENTE (con su sesión) ======

-- La lista: los registros de su alcance, el más nuevo primero, cada uno con
-- sus solicitudes recientes. Registro completo (decisión de Joan), menos el
-- código de invitación, que no le sirve a nadie. De la solicitud se quitan
-- `datos` (es el mismo paquete del registro, repetido) y `responsable`.
create or replace function public.gerente_registros()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare yo public.equipo; mios text[]; lista jsonb; topes jsonb;
begin
  yo := public.gerente_de_sesion();
  if yo.celular is null then
    return jsonb_build_object('ok', false, 'motivo', 'solo_gerente');
  end if;
  mios := public.mi_alcance(yo.celular);

  with ult as (
    select distinct on (a.persona_id) a.persona_id, a.asesor
      from public.asignaciones a
     order by a.persona_id, a.desde desc, a.id desc
  ), amano as (
    select ra.telefono, ra.asesor from public.registros_asignados ra where ra.activo
  ), tels as (
    -- De la base, salvo que Joan lo haya asignado a mano (a él o a otro): la
    -- asignación a mano manda, igual que en registro_en_mi_alcance.
    select right(public.solo_digitos(p.celular), 10) as tel, u.asesor, 'base'::text as por, 2 as orden
      from public.cartera p
      join ult u on u.persona_id = p.id
     where u.asesor = any(mios)
       and not exists (select 1 from amano m where m.telefono = right(public.solo_digitos(p.celular), 10))
    union all
    select m.telefono, m.asesor, 'asignado', 1
      from amano m
     where m.asesor = any(mios)
  ), uno as (
    select distinct on (tel) tel, asesor, por
      from tels where length(tel) = 10
     order by tel, orden
  ), regs as (
    select distinct on (u.tel) r.*, u.tel as tel10, u.asesor as asesor_cel, u.por
      from public.registros r
      join uno u on u.tel = right(public.solo_digitos(r.telefono), 10)
     where r.estado <> 'descartado'
     order by u.tel, r.creado_en desc
  )
  select coalesce(jsonb_agg(x.j order by x.creado_en desc), '[]'::jsonb) into lista
    from (
      select g.creado_en,
             (to_jsonb(g) - 'codigo' - 'asesor_cel' - 'tel10')
             || jsonb_build_object(
                  'asesor', g.asesor_cel,
                  'asesor_nombre', (select e.nombre from public.equipo e where e.celular = g.asesor_cel),
                  'solicitudes', coalesce((
                    select jsonb_agg(to_jsonb(s) - 'datos' - 'responsable' order by s.creada_en desc)
                      from (select * from public.solicitudes s
                             where (s.registro_id = g.id
                                    or right(public.solo_digitos(coalesce(s.celular, '')), 10) = g.tel10
                                    or public.solo_digitos(coalesce(s.cedula, '')) = g.tel10)
                               and s.creada_en > now() - interval '120 days'
                             order by s.creada_en desc
                             limit 5) s), '[]'::jsonb)) as j
        from regs g
       order by g.creado_en desc
       limit 300) x;

  select to_jsonb(t) - 'id' into topes from public.topes_equipo t where t.id = 1;
  return jsonb_build_object('ok', true, 'registros', lista, 'topes', topes);
end
$$;

-- Las fotos de un registro de su alcance. Volátil porque escribe el rastro.
create or replace function public.gerente_archivos(p_telefono text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare yo public.equipo; t text; r jsonb; h jsonb;
begin
  yo := public.gerente_de_sesion();
  if yo.celular is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'solo_gerente');
  end if;
  t := right(public.solo_digitos(coalesce(p_telefono, '')), 10);
  if public.registro_en_mi_alcance(yo.celular, t) is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

  -- El rastro va ANTES de entregar: si se anotara después, una respuesta que
  -- se corta a medio camino dejaría las fotos vistas sin rastro.
  insert into public.vistas_de_datos (quien, que, de) values (yo.celular, 'fotos_registro', t);

  select coalesce(jsonb_object_agg(tipo, imagen), '{}'::jsonb) into r
    from public.registro_archivos
   where right(public.solo_digitos(celular), 10) = t;
  select huella into h from public.registros
   where right(public.solo_digitos(telefono), 10) = t
   order by creado_en desc limit 1;
  return jsonb_build_object('ok', true, 'fotos', r, 'huella', h);
end
$$;

-- La propuesta del gerente. Las rejas en este orden: quién es, si la solicitud
-- está abierta, si es suya, y si cabe en los topes. Lo que contesta dice cuál
-- falló, para que la pantalla lo pueda decir con palabras.
create or replace function public.gerente_proponer(
  p_id bigint, p_capital bigint, p_costo_pct integer, p_dias integer, p_texto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare yo public.equipo; s public.solicitudes; tel text; tp public.topes_equipo; cp jsonb; txt text;
begin
  yo := public.gerente_de_sesion();
  if yo.celular is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'solo_gerente');
  end if;

  select * into s from public.solicitudes where id = p_id for update;
  if not found or s.estado not in ('nueva', 'contrapropuesta') then
    return jsonb_build_object('ok', false, 'motivo', 'no_esta_abierta');
  end if;

  -- El celular de la solicitud, por el camino más firme primero: el registro
  -- del que nació; después su columna celular; y por último `cedula`, que
  -- guarda el celular mientras la cuenta no esté junta con una ficha.
  select right(public.solo_digitos(r.telefono), 10) into tel
    from public.registros r where r.id = s.registro_id;
  if coalesce(length(tel), 0) <> 10 then
    tel := right(public.solo_digitos(coalesce(s.celular, '')), 10);
  end if;
  if coalesce(length(tel), 0) <> 10 and public.solo_digitos(coalesce(s.cedula, '')) ~ '^3\d{9}$' then
    tel := public.solo_digitos(s.cedula);
  end if;
  if public.registro_en_mi_alcance(yo.celular, tel) is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

  select * into tp from public.topes_equipo where id = 1;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_topes');
  end if;
  if p_capital is null or p_capital < 10000 or p_capital > tp.capital_max
     or p_costo_pct is null or p_costo_pct < tp.costo_min or p_costo_pct > tp.costo_max
     or p_dias is null or p_dias < 1 or p_dias > tp.dias_max then
    return jsonb_build_object('ok', false, 'motivo', 'fuera_de_topes', 'topes', to_jsonb(tp) - 'id');
  end if;

  txt := left(btrim(coalesce(p_texto, '')), 400);
  cp  := public.contrapropuesta_de(p_capital, p_costo_pct, p_dias, txt, 'gerente:' || yo.celular)
         || jsonb_build_object('por_nombre', yo.nombre);

  -- Las mismas columnas que toca contrapropuesta_solicitud (la de Joan): el
  -- CRM y la app leen la solicitud igual venga de quien venga.
  update public.solicitudes
     set contrapropuesta = cp,
         estado      = 'contrapropuesta',
         aceptada_en = null,
         capital     = (cp ->> 'capital')::bigint,
         tasa        = p_costo_pct / 100.0,
         costo       = (cp ->> 'costo')::bigint,
         total       = (cp ->> 'total')::bigint,
         fecha_corte = (cp ->> 'fecha_pago')::date,
         producto    = 'quincenal',
         resuelta_en = case when app = 'platachat' then now() else resuelta_en end
   where id = s.id
  returning * into s;

  -- En PlataChat la propuesta además llega al chat de Créditos, como cuando la
  -- hace Joan. En play/ la ve en su pantalla de solicitud.
  if s.app = 'platachat' then
    insert into public.mensajes (cedula, de, texto, canal)
    values (public.llave_de_solicitud(s), 'equipo',
            'Te propongo ' || public.pesos_texto((cp ->> 'capital')::bigint)
            || '; devuelves ' || public.pesos_texto((cp ->> 'total')::bigint)
            || ' el ' || public.fecha_texto((cp ->> 'fecha_pago')::date) || '.'
            || case when txt <> '' then ' ' || txt else '' end,
            'creditos');
  end if;

  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s) - 'datos' - 'responsable');
end
$$;

-- ====== 4. LO QUE LLAMA JOAN (llave pública + su clave) ======

-- Los topes. Capital 0 los APAGA: el gerente deja de poder proponer.
create or replace function public.topes_equipo_guardar(
  p_clave text, p_capital_max bigint, p_costo_min integer, p_costo_max integer, p_dias_max integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare t public.topes_equipo;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if p_capital_max = 0 then
    delete from public.topes_equipo where id = 1;
    return jsonb_build_object('ok', true, 'topes', null);
  end if;
  if p_capital_max is null or p_capital_max < 10000 or p_capital_max > 20000000
     or p_costo_min is null or p_costo_max is null
     or p_costo_min < 1 or p_costo_max > 50 or p_costo_min > p_costo_max
     or p_dias_max is null or p_dias_max < 1 or p_dias_max > 60 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;
  insert into public.topes_equipo (id, capital_max, costo_min, costo_max, dias_max, actualizado)
  values (1, p_capital_max, p_costo_min, p_costo_max, p_dias_max, now())
  on conflict (id) do update
     set capital_max = excluded.capital_max, costo_min = excluded.costo_min,
         costo_max = excluded.costo_max, dias_max = excluded.dias_max, actualizado = now()
  returning * into t;
  return jsonb_build_object('ok', true, 'topes', to_jsonb(t) - 'id');
end
$$;

create or replace function public.topes_equipo_leer(p_clave text)
returns jsonb
language plpgsql
volatile          -- clave_ok escribe el freno: «stable» reventaría con 25006
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select to_jsonb(t) - 'id' into r from public.topes_equipo t where t.id = 1;
  return jsonb_build_object('ok', true, 'topes', r);
end
$$;

-- Asignar a mano un registro a alguien del equipo. `p_a` vacío lo QUITA.
-- Primero se valida y después se toca: al revés, un celular mal escrito
-- dejaba al registro sin nadie.
create or replace function public.registro_asignar(p_clave text, p_telefono text, p_a text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare t text; a text; e public.equipo;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  t := right(public.solo_digitos(coalesce(p_telefono, '')), 10);
  if length(t) <> 10 then
    return jsonb_build_object('ok', false, 'motivo', 'ese celular no tiene 10 dígitos');
  end if;
  a := right(public.solo_digitos(coalesce(p_a, '')), 10);
  if a <> '' then
    select * into e from public.equipo where celular = a and estado = 'activo';
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'esa persona no está activa en tu equipo');
    end if;
  end if;

  update public.registros_asignados set activo = false, hasta = now()
   where telefono = t and activo;
  if a = '' then
    return jsonb_build_object('ok', true, 'telefono', t, 'asesor', null);
  end if;
  insert into public.registros_asignados (telefono, asesor) values (t, a);
  return jsonb_build_object('ok', true, 'telefono', t, 'asesor', a, 'nombre', e.nombre, 'rol', e.rol);
end
$$;

-- Para la bandeja de Joan: de cada registro de los últimos 120 días, quién del
-- equipo lo ve y por qué. Así 📥 Registrados puede decir «lo ve WILLIAN (de su
-- base)» sin que Joan tenga que adivinarlo.
create or replace function public.registros_quien_ve(p_clave text)
returns jsonb
language plpgsql
volatile          -- clave_ok escribe el freno
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  with regs as (
    select distinct right(public.solo_digitos(telefono), 10) as tel
      from public.registros
     where creado_en > now() - interval '120 days'
  ), ult as (
    select distinct on (a.persona_id) a.persona_id, a.asesor, a.desde, a.id
      from public.asignaciones a
     order by a.persona_id, a.desde desc, a.id desc
  ), base as (
    select distinct on (g.tel) g.tel, u.asesor, 'base'::text as por
      from regs g
      join public.cartera p on right(public.solo_digitos(p.celular), 10) = g.tel
      join ult u on u.persona_id = p.id
     order by g.tel, u.desde desc, u.id desc
  ), mano as (
    select ra.telefono as tel, ra.asesor, 'asignado'::text as por
      from public.registros_asignados ra
      join regs g on g.tel = ra.telefono
     where ra.activo
  ), todo as (
    -- La asignación a mano primero: es la que manda (ver registro_en_mi_alcance).
    select distinct on (tel) tel, asesor, por
      from (select *, 1 as o from mano union all select *, 2 from base) x
     order by tel, o
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'telefono', t.tel, 'asesor', t.asesor, 'por', t.por,
           'asesor_nombre', e.nombre, 'rol', e.rol,
           -- Quién lo VE: los registros solo los ve un gerente. El de un
           -- asesor lo ve su jefe; el de un gerente, él mismo.
           'gerente', case when e.rol = 'gerente' then e.celular else e.jefe end,
           'gerente_nombre', case when e.rol = 'gerente' then e.nombre
                                  else (select j.nombre from public.equipo j where j.celular = e.jefe) end)),
           '[]'::jsonb) into r
    from todo t
    left join public.equipo e on e.celular = t.asesor;
  return jsonb_build_object('ok', true, 'registros', r);
end
$$;

-- ====== 5. REPARTIR EL MISMO DÍA ======
do $$
declare src text; nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'asignar_a'
     and p.pronamespace = 'public'::regnamespace
     and pg_get_function_identity_arguments(p.oid) = 'p_personas jsonb, p_asesor text';
  if src is null then
    raise exception 'No existe public.asignar_a(jsonb, text): falta 20260911. No se tocó nada.';
  end if;
  if src ~ 'on conflict \(persona_id, desde\)' then
    raise notice 'asignar_a ya reparte el mismo día: no se cambió nada.';
    return;
  end if;
  nueva := regexp_replace(src,
    'on conflict \(id\) do nothing;',
    'on conflict (persona_id, desde) do update set asesor = excluded.asesor, actualizado = now();');
  if nueva = src then
    raise exception 'No encontré en asignar_a la línea «on conflict (id) do nothing». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end $$;

-- ====== 6. PERMISOS ======
-- Explícitos de a uno: en Supabase el EXECUTE a anon y authenticated viene por
-- defecto, así que `revoke ... from public` no cierra nada.
revoke all on function public.vistas_de_datos_no_se_cambian()            from public, anon, authenticated;
revoke all on function public.gerente_de_sesion()                        from public, anon, authenticated;
revoke all on function public.registro_en_mi_alcance(text, text)         from public, anon, authenticated;

revoke all on function public.gerente_registros()                        from public, anon, authenticated;
grant  execute on function public.gerente_registros()                    to authenticated;
revoke all on function public.gerente_archivos(text)                     from public, anon, authenticated;
grant  execute on function public.gerente_archivos(text)                 to authenticated;
revoke all on function public.gerente_proponer(bigint, bigint, integer, integer, text) from public, anon, authenticated;
grant  execute on function public.gerente_proponer(bigint, bigint, integer, integer, text) to authenticated;

revoke all on function public.topes_equipo_guardar(text, bigint, integer, integer, integer) from public, anon, authenticated;
grant  execute on function public.topes_equipo_guardar(text, bigint, integer, integer, integer) to anon;
revoke all on function public.topes_equipo_leer(text)                    from public, anon, authenticated;
grant  execute on function public.topes_equipo_leer(text)                to anon;
revoke all on function public.registro_asignar(text, text, text)         from public, anon, authenticated;
grant  execute on function public.registro_asignar(text, text, text)     to anon;
revoke all on function public.registros_quien_ve(text)                   from public, anon, authenticated;
grant  execute on function public.registros_quien_ve(text)               to anon;

notify pgrst, 'reload schema';
