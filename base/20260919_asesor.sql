-- ===========================================================================
-- EL ASESOR: LA PLATA DE SU BASE, SU PROPIO ENVÍO, Y EL REGISTRO ACOMPAÑADO
-- 15 de septiembre de 2026
--
-- SQL Editor de Supabase -> New query -> pegar TODO -> Run. Idempotente.
-- Va después de 20260918_infobip.sql.
--
-- Joan pidió: «el role de asesor optimizalo para que pueda ver sus clientes y
-- les pueda dar gestion de whatsapp y sms y mensaje de voz (…) y que pueda ver
-- en tiempo real cuando el cliente se este registrando viendo las fotos que
-- sube el cliente y poderlo guiar incluso en la llamada».
--
-- ===========================================================================
-- 1. POR QUÉ EL ASESOR NO PODÍA MANDAR UN SMS, Y POR QUÉ NO ERA UN OLVIDO
--
-- `enviar_mensajes()` (20260918) se autoriza con `clave_ok(p_clave)` — la clave
-- de sincronización de Joan. Esa misma clave abre `equipo_publicar`,
-- `gestiones_listar` y `sincronizar_socios`: o sea, TODA la cartera.
--
-- Meterla en el celular de un asesor sería regalarle el negocio entero para que
-- pueda mandar un mensaje. Por eso acá hay una puerta NUEVA que se autoriza por
-- SESIÓN y por asignación —como ya hacen gestion_anotar y contacto_anotar— y no
-- por clave. El asesor solo puede escribirle a quien tiene asignado.
--
-- ===========================================================================
-- 2. LA PLATA EN SU CELULAR: LO MÍNIMO, NO TODO
--
-- Hasta hoy `mi_cartera()` NO mandaba saldo ni fecha de pago al celular del
-- asesor, a propósito. Un SMS de cobro sin monto ni fecha no sirve para nada,
-- así que hay que aflojar eso — y Joan eligió aflojarlo al mínimo:
--
--   SÍ viaja: saldo, fecha de pago y cuántos créditos, SOLO de los clientes
--             ASIGNADOS a ese asesor.
--   NO viaja: capital, ganancia, historial de pagos, ni nada de los clientes
--             de otro asesor.
--
-- Y la fuente de verdad NO cambia: el monto lo sigue calculando el CRM de Joan
-- y lo publica con equipo_publicar. Acá solo se guarda y se reparte. Si la nube
-- calculara el saldo por su cuenta habría dos respuestas a la misma pregunta.
--
-- ===========================================================================
-- 3. EL REGISTRO ACOMPAÑADO: EL CLIENTE DA EL PERMISO, NO NOSOTROS
--
-- Joan pidió ver al cliente registrándose en vivo, con sus fotos. Construirlo
-- tal cual tenía tres problemas que no son de opinión:
--
--   a) Hoy NADA sale del teléfono hasta el paso 9 de 9, y la casilla que
--      autoriza las fotos está en ese paso 9. Mandar la foto en el paso 2
--      significa que cuando la persona llegue a decidir, el asesor ya la vio.
--      La garantía «si desmarco, mis fotos no salen» existe hoy de verdad
--      (play/index.html:509) y se volvería papel mojado.
--   b) El paso de referencias lleva nombre y celular de DOS PERSONAS que no son
--      el cliente y que no autorizaron nada. Hoy solo salen si él termina.
--   c) La selfie es dato biométrico — la categoría más sensible de la Ley 1581.
--
-- La solución que eligió Joan: el cliente TOCA UN BOTÓN que dice «quiero que mi
-- asesor me acompañe», y solo a partir de ahí se publica su avance. Es el mismo
-- criterio de habeas data que este proyecto ya aplica para las invitaciones:
-- finalidad nueva, permiso nuevo.
--
-- LO QUE NUNCA VIAJA, ni con permiso: las referencias (son datos de terceros y
-- la Ley 2300 ya prohíbe contactarlas) y la contraseña. Y lo publicado se borra
-- solo a las dos horas: es una ayuda para una llamada, no un archivo.
-- ===========================================================================

do $$
begin
  if to_regclass('public.cartera') is null then
    raise exception 'Falta 20260910_equipo_en_la_nube.sql: no existe public.cartera';
  end if;
  if not exists (select 1 from pg_proc
                  where proname = 'enviar_mensajes' and pronamespace = 'public'::regnamespace) then
    raise exception 'Falta 20260918_infobip.sql: no existe enviar_mensajes()';
  end if;
  if not exists (select 1 from pg_proc
                  where proname = 'mi_alcance' and pronamespace = 'public'::regnamespace) then
    raise exception 'Falta 20260910_equipo_en_la_nube.sql: no existe mi_alcance()';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. LA PLATA, EN LA CARTERA QUE JOAN PUBLICA
--
-- Columnas NUEVAS y NULLABLE: una cartera publicada por un CRM viejo sigue
-- entrando sin ellas, y la pantalla sabe que null es «no lo sé», no «cero».
-- Decir «$0» cuando no se sabe sería peor que no decir nada.
-- ---------------------------------------------------------------------------
alter table public.cartera add column if not exists saldo       bigint;
alter table public.cartera add column if not exists saldo_total bigint;
alter table public.cartera add column if not exists fecha_pago  date;
alter table public.cartera add column if not exists creditos    integer;

comment on column public.cartera.saldo_total is
  'Lo que la persona debe sumando TODOS sus creditos vencidos. Lo calcula el CRM de Joan.';

-- ---------------------------------------------------------------------------
-- 5. PUBLICAR TAMBIÉN LA PLATA
--
-- Misma firma que la de 20260910 para no romper a quien ya la llama; lo único
-- que cambia es que el insert de `cartera` lee cuatro campos más si vienen.
-- ---------------------------------------------------------------------------
create or replace function public.equipo_publicar(
  p_clave text, p_equipo jsonb, p_asignaciones jsonb, p_gente jsonb)
returns jsonb
language plpgsql
volatile
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

  for it in select * from jsonb_array_elements(coalesce(p_gente, '[]'::jsonb)) loop
    if coalesce(it->>'id', '') = '' then continue; end if;
    insert into public.cartera (id, tipo, celular, nombre, estado, etapa,
                                saldo, saldo_total, fecha_pago, creditos, actualizado)
    values (it->>'id',
            coalesce(nullif(it->>'tipo', ''), 'prospecto'),
            right(public.solo_digitos(coalesce(it->>'celular', '')), 10),
            left(coalesce(it->>'nombre', ''), 120),
            coalesce(nullif(it->>'estado', ''), 'nuevo'),
            coalesce(nullif(it->>'etapa', ''), 'PC'),
            nullif(it->>'saldo', '')::bigint,
            nullif(it->>'saldo_total', '')::bigint,
            nullif(it->>'fecha_pago', '')::date,
            nullif(it->>'creditos', '')::integer,
            now())
    on conflict (id) do update
      set tipo = excluded.tipo, celular = excluded.celular, nombre = excluded.nombre,
          estado = excluded.estado, etapa = excluded.etapa,
          saldo = excluded.saldo, saldo_total = excluded.saldo_total,
          fecha_pago = excluded.fecha_pago, creditos = excluded.creditos,
          actualizado = now();
    n_pr := n_pr + 1;
  end loop;

  return jsonb_build_object('ok', true, 'equipo', n_eq,
                            'asignaciones', n_as, 'gente', n_pr);
end $$;

-- ---------------------------------------------------------------------------
-- 6. LA CARTERA DEL ASESOR, AHORA CON LA PLATA DE LOS SUYOS
--
-- La reja no cambia y es la de siempre: `mi_alcance(yo.celular)` y el filtro
-- `a.asesor = any(mios)`. El asesor ve la plata de los que tiene asignados
-- porque son los que ya veía; no se abre ni una persona más.
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
               'tipo', p.tipo, 'estado', p.estado, 'etapa', p.etapa,
               'asesor', a.asesor, 'asesor_nombre', coalesce(e2.nombre, ''),
               -- 15-sep-2026: la plata de los SUYOS. Va null cuando no se sabe,
               -- nunca cero: «$0» es una afirmacion y «no lo se» es otra cosa.
               'saldo', p.saldo, 'saldo_total', p.saldo_total,
               'fecha_pago', p.fecha_pago, 'creditos', p.creditos,
               'gestion', (select jsonb_build_object(
                             'tipo', g.tipo, 'nota', g.nota, 'cuando', g.cuando,
                             'quien', coalesce(e3.nombre, g.asesor))
                             from public.gestiones g
                             left join public.equipo e3 on e3.celular = g.asesor
                            where g.persona_id = p.id
                            order by g.cuando desc limit 1)))
        from public.cartera p
        join public.asignaciones a on a.persona_id = p.id
        left join public.equipo e2 on e2.celular = a.asesor
       where a.asesor = any(mios)
         and a.desde = (select max(a2.desde) from public.asignaciones a2
                         where a2.persona_id = p.id)), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 7. EL TOPE DE GASTO DEL ASESOR
--
-- Un asesor con un botón que manda SMS es un asesor que puede quemar el saldo
-- de Infobip, por error o por rabia el día que renuncie. El tope vive acá y no
-- en la pantalla: una pantalla se puede saltar abriendo la consola.
-- ---------------------------------------------------------------------------
create table if not exists public.envios_asesor (
  id          bigint generated always as identity primary key,
  asesor      text        not null,
  persona_id  text        not null,
  canal       text        not null check (canal in ('sms', 'voz')),
  texto       text        not null,
  enviado_en  timestamptz not null default now()
);
alter table public.envios_asesor enable row level security;
create index if not exists envios_asesor_dia on public.envios_asesor (asesor, enviado_en desc);

-- Cuántos lleva hoy. Se saca aparte para que la pantalla lo pueda mostrar antes
-- de que el asesor toque el botón, y no solo cuando ya se le negó.
create or replace function public.envios_asesor_hoy()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; n int;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select count(*) into n from public.envios_asesor
   where asesor = right(cel, 10)
     and enviado_en >= (now() at time zone 'America/Bogota')::date;
  return jsonb_build_object('ok', true, 'hoy', n, 'tope', 60);
end $$;

-- ---------------------------------------------------------------------------
-- 8. MANDAR UN MENSAJE, DESDE EL ASESOR
--
-- Autorizada por SESIÓN, no por clave. Y comprueba TRES cosas que la pantalla
-- no puede garantizar sola:
--   · que esa persona esté ASIGNADA a quien pide el envío;
--   · que estemos dentro de la ventana de la Ley 2300 (ventana_de_cobro);
--   · que no se haya pasado del tope diario.
--
-- VOLATILE obligatorio: escribe y hace una llamada HTTP.
-- ---------------------------------------------------------------------------
create or replace function public.asesor_enviar(
  p_persona_id text, p_canal text, p_texto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  cel     text;
  yo      public.equipo;
  mios    text[];
  per     public.cartera;
  ventana jsonb;
  n       int;
  llave   text; base text; remite text;
  cuerpo  jsonb; pid bigint; lote text; ruta text;
  destino text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false, 'motivo', 'sin_sesion'); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  if p_canal not in ('sms', 'voz') then
    return jsonb_build_object('ok', false, 'motivo', 'canal');
  end if;
  if coalesce(trim(p_texto), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_texto');
  end if;

  -- ¿ES SUYO? La reja de siempre: mi_alcance mas la asignacion vigente.
  mios := public.mi_alcance(yo.celular);
  select c.* into per
    from public.cartera c
    join public.asignaciones a on a.persona_id = c.id
   where c.id = p_persona_id
     and a.asesor = any(mios)
     and a.desde = (select max(a2.desde) from public.asignaciones a2
                     where a2.persona_id = c.id)
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo',
      'detalle', 'Esa persona no esta asignada a ti.');
  end if;

  -- LA VENTANA LEGAL. Se comprueba aca y no en el telefono: el reloj de un
  -- telefono lo cambia cualquiera, y «mi celular estaba mal» no existe en el
  -- articulo 3.
  ventana := public.ventana_de_cobro();
  if (ventana->>'ok')::boolean is not true then
    return jsonb_build_object('ok', false, 'motivo', 'fuera_de_horario',
                              'detalle', ventana->>'motivo');
  end if;

  -- EL TOPE DEL DIA.
  select count(*) into n from public.envios_asesor
   where asesor = yo.celular
     and enviado_en >= (now() at time zone 'America/Bogota')::date;
  if n >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'tope',
      'detalle', 'Llegaste a los 60 mensajes de hoy. Manana se reinicia.');
  end if;

  select valor into llave  from public.config_privada where clave = 'infobip_llave';
  select valor into base   from public.config_privada where clave = 'infobip_base';
  select valor into remite from public.config_privada where clave = 'infobip_remitente';
  if llave is null or base is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_llave',
      'detalle', 'Joan todavia no ha pegado la llave de Infobip.');
  end if;

  destino := '57' || regexp_replace(per.celular, '\D', '', 'g');
  lote := 'AS-' || yo.celular || '-' ||
          to_char(now() at time zone 'America/Bogota', 'YYYYMMDD-HH24MISS');

  if p_canal = 'sms' then
    ruta := '/sms/3/messages';
    cuerpo := jsonb_build_object(
      'messages', jsonb_build_array(jsonb_build_object(
        'sender', coalesce(remite, ''),
        'destinations', jsonb_build_array(jsonb_build_object('to', destino)),
        'content', jsonb_build_object('text', p_texto))),
      'options', jsonb_build_object(
        'schedule', jsonb_build_object('bulkId', lote),
        'deliveryTimeWindow', jsonb_build_object(
          'days', jsonb_build_array('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'),
          'from', jsonb_build_object('hour', (ventana->>'utc_desde')::int, 'minute', 0),
          'to',   jsonb_build_object('hour', (ventana->>'utc_hasta')::int, 'minute', 59))));
  else
    ruta := '/tts/3/advanced';
    cuerpo := jsonb_build_object('bulkId', lote, 'messages', jsonb_build_array(
      jsonb_build_object('from', coalesce(remite, ''),
        'destinations', jsonb_build_array(jsonb_build_object('to', destino)),
        'text', p_texto, 'language', 'es',
        'voice', jsonb_build_object('gender', 'female'), 'speechRate', 0.9)));
  end if;

  select net.http_post(
    url     := rtrim(base, '/') || ruta,
    body    := cuerpo,
    headers := jsonb_build_object('Authorization', 'App ' || llave,
                                  'Content-Type', 'application/json'),
    timeout_milliseconds := 20000) into pid;

  insert into public.envios_asesor (asesor, persona_id, canal, texto)
  values (yo.celular, p_persona_id, p_canal, p_texto);

  -- Y queda como GESTION, que es de donde salen los topes de la Ley 2300. Si no
  -- se anotara, manana la pantalla volveria a ofrecer a la misma persona.
  insert into public.gestiones (persona_id, asesor, tipo, nota)
  values (p_persona_id, yo.celular,
          case when p_canal = 'voz' then 'voz' else 'sms' end,
          left(p_texto, 300));

  return jsonb_build_object('ok', true, 'peticion_id', pid,
                            'quedan_hoy', 60 - (n + 1));
end $$;

-- ---------------------------------------------------------------------------
-- 9. EL REGISTRO ACOMPAÑADO
--
-- El cliente toca «quiero que mi asesor me acompañe» y a partir de ahí publica
-- su avance. Antes de eso, acá no hay nada suyo.
--
-- LO QUE NUNCA ENTRA, ni con permiso:
--   · las referencias — son datos de DOS TERCEROS que no autorizaron nada, y la
--     Ley 2300 ya le prohíbe a Joan contactarlas: tenerlas anotadas sería
--     exposición pura sin ningún uso legítimo;
--   · la contraseña;
--   · la ubicación — el GPS se pide en el paso 2 pero se autoriza en el 9.
-- Se comprueba con una restricción de verdad, más abajo, no con un comentario.
--
-- Y SE BORRA SOLO a las dos horas. Es una ayuda para una llamada, no un archivo.
-- ---------------------------------------------------------------------------
create table if not exists public.registro_en_vivo (
  celular     text        primary key,
  paso        integer     not null default 0,
  de_pasos    integer     not null default 9,
  nombre      text,
  avance      jsonb       not null default '{}'::jsonb,
  fotos       jsonb       not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  vence_en    timestamptz not null default now() + interval '2 hours'
);
alter table public.registro_en_vivo enable row level security;
create index if not exists registro_en_vivo_vence on public.registro_en_vivo (vence_en);

comment on table public.registro_en_vivo is
  'Avance de quien SE ESTA registrando y pidio acompanamiento. Se borra a las 2 horas.';

-- El cliente publica su avance. Sin sesión —todavía no tiene cuenta— así que va
-- por celular, y por eso NO devuelve nada que no haya mandado él mismo: quien
-- llame esto con un celular ajeno solo consigue pisar su propio avance.
create or replace function public.registro_vivo_publicar(
  p_celular text, p_paso int, p_de int, p_nombre text,
  p_avance jsonb, p_fotos jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; av jsonb; ft jsonb;
begin
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(cel) <> 10 then return jsonb_build_object('ok', false); end if;

  -- LA REJA DE CONTENIDO, aca y no en el telefono. Lo que la pantalla mande de
  -- mas se cae aca: las referencias, la clave y la ubicacion NO entran nunca.
  av := coalesce(p_avance, '{}'::jsonb)
        - 'referencia1' - 'referencia2' - 'ref1_nombre' - 'ref1_celular'
        - 'ref2_nombre' - 'ref2_celular' - 'clave' - 'contrasena' - 'password'
        - 'gps' - 'lat' - 'lng' - 'ubicacion';
  ft := coalesce(p_fotos, '{}'::jsonb);

  insert into public.registro_en_vivo (celular, paso, de_pasos, nombre, avance, fotos,
                                       actualizado, vence_en)
  values (cel, greatest(0, coalesce(p_paso, 0)), greatest(1, coalesce(p_de, 9)),
          left(coalesce(p_nombre, ''), 120), av, ft, now(), now() + interval '2 hours')
  on conflict (celular) do update
    set paso = excluded.paso, de_pasos = excluded.de_pasos,
        nombre = excluded.nombre, avance = excluded.avance, fotos = excluded.fotos,
        actualizado = now(), vence_en = now() + interval '2 hours';

  -- Barrido perezoso: lo vencido se va cuando alguien pasa por aca. No hace
  -- falta un proceso aparte que nadie vigile.
  delete from public.registro_en_vivo where vence_en < now();

  return jsonb_build_object('ok', true);
end $$;

-- El cliente se arrepiente: se borra y ya.
create or replace function public.registro_vivo_borrar(p_celular text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.registro_en_vivo
   where celular = right(public.solo_digitos(coalesce(p_celular, '')), 10);
  return jsonb_build_object('ok', true);
end $$;

-- Lo que ve el asesor. Solo de gente de SU base, y solo mientras no venza.
create or replace function public.registro_vivo_mirar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; mios text[]; filas jsonb;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);

  select coalesce(jsonb_agg(jsonb_build_object(
           'celular', v.celular, 'nombre', v.nombre,
           'paso', v.paso, 'de_pasos', v.de_pasos,
           'avance', v.avance, 'fotos', v.fotos,
           'actualizado', v.actualizado) order by v.actualizado desc), '[]'::jsonb)
    into filas
    from public.registro_en_vivo v
    join public.cartera c on c.celular = v.celular
    join public.asignaciones a on a.persona_id = c.id
   where v.vence_en > now()
     and a.asesor = any(mios)
     and a.desde = (select max(a2.desde) from public.asignaciones a2
                     where a2.persona_id = c.id);

  return jsonb_build_object('ok', true, 'gente', filas);
end $$;

-- ---------------------------------------------------------------------------
-- 10. LAS REJAS
-- ---------------------------------------------------------------------------
revoke all on function public.asesor_enviar(text, text, text)      from public, anon, authenticated;
grant  execute on function public.asesor_enviar(text, text, text)  to authenticated;

revoke all on function public.envios_asesor_hoy()                  from public, anon, authenticated;
grant  execute on function public.envios_asesor_hoy()              to authenticated;

revoke all on function public.registro_vivo_publicar(text, int, int, text, jsonb, jsonb)
                                                                   from public, anon, authenticated;
grant  execute on function public.registro_vivo_publicar(text, int, int, text, jsonb, jsonb)
                                                                   to anon, authenticated;

revoke all on function public.registro_vivo_borrar(text)           from public, anon, authenticated;
grant  execute on function public.registro_vivo_borrar(text)       to anon, authenticated;

revoke all on function public.registro_vivo_mirar()                from public, anon, authenticated;
grant  execute on function public.registro_vivo_mirar()            to authenticated;

-- ---------------------------------------------------------------------------
-- 11. LO QUE SE COMPRUEBA SOLO
-- ---------------------------------------------------------------------------
do $$
declare av jsonb;
begin
  if (select provolatile from pg_proc
       where proname = 'asesor_enviar' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'asesor_enviar no es volatile: PostgREST la serviria por GET y no mandaria nada';
  end if;

  -- La puerta del asesor NO puede pedir la clave de Joan: si la pidiera,
  -- habria que meterla en su celular y eso abre la cartera entera.
  if (select pg_get_functiondef(oid) from pg_proc
       where proname = 'asesor_enviar' and pronamespace = 'public'::regnamespace) ~* 'clave_ok' then
    raise exception 'asesor_enviar pide la clave de sincronizacion: eso abriria toda la cartera';
  end if;

  -- Y TIENE que comprobar la ventana legal antes de mandar.
  if (select pg_get_functiondef(oid) from pg_proc
       where proname = 'asesor_enviar' and pronamespace = 'public'::regnamespace)
      !~* 'ventana_de_cobro' then
    raise exception 'asesor_enviar no comprueba la ventana de la Ley 2300';
  end if;

  -- LA REJA DEL REGISTRO EN VIVO, probada de verdad: se le mandan referencias,
  -- clave y ubicacion, y no tienen que quedar.
  perform public.registro_vivo_publicar(
    '3009998877', 2, 9, 'Prueba',
    jsonb_build_object('nombres','Ana','referencia1','Pedro 3001112233',
                       'ref2_celular','3004445566','clave','secreta',
                       'gps', jsonb_build_object('lat',1,'lng',2)),
    '{}'::jsonb);
  select avance into av from public.registro_en_vivo where celular = '3009998877';
  if av ? 'referencia1' or av ? 'ref2_celular' or av ? 'clave' or av ? 'gps' then
    raise exception 'el registro en vivo dejo pasar referencias, clave o ubicacion: %', av;
  end if;
  if not (av ? 'nombres') then
    raise exception 'el registro en vivo se comio datos que si debia guardar';
  end if;
  delete from public.registro_en_vivo where celular = '3009998877';

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cartera'
                    and column_name = 'saldo_total') then
    raise exception 'falto la columna saldo_total en cartera';
  end if;

  raise notice 'Asesor: listo. Plata de los suyos, envio propio con tope de 60 al dia, y registro acompanado con permiso.';
end $$;
