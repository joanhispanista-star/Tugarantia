-- ===========================================================================
-- EL PRIMER CRÉDITO DEL CLIENTE NUEVO: solicitud, contrapropuesta y aceptación
-- 8 de septiembre de 2026 (noche). Va DESPUÉS de 20260828c_permisos.sql.
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «Que el cliente, después de que se registre, pueda automáticamente aplicar a
-- un crédito, y que el CRM automáticamente le haga una contrapropuesta por
-- 100.000 pesos con un 35% en costos a los 8 días; que el cliente acepte
-- explicando que por ser nuevo aún no puede acceder a los créditos premium; que
-- cuando acepte yo pueda verlo desde mi CRM y modificar la contrapropuesta como
-- yo quiera; y que yo solo tenga que hacer el desembolso manualmente.»
--
-- CÓMO SE VOLVIÓ PLOMERÍA. «El CRM automáticamente» no puede ser el CRM: es
-- una página en el navegador de Joan y no corre cuando él no está. Lo
-- automático vive AQUÍ, en la base, que sí está siempre: la política del primer
-- crédito es una fila (politica_nuevos) que Joan edita desde Ajustes, y la
-- función solicitar_primer_credito() la aplica en el mismo instante en que el
-- cliente pide. El cliente ve la propuesta en su app (en pesos, nunca en
-- porcentaje), acepta, y Joan la ve en la bandeja del CRM, donde puede cambiarla
-- (con lo que el cliente tiene que volver a aceptar) o desembolsar.
--
-- LA REGLA DE HONESTIDAD: una propuesta cambiada por Joan vuelve al estado
-- 'contrapropuesta' —deja de estar aceptada—, porque nadie acepta lo que no ha
-- visto. Y aceptar NO crea un crédito: el crédito nace cuando Joan desembolsa.
--
-- ESTADOS de solicitudes, ahora: nueva | contrapropuesta | aceptada | atendida
-- | descartada. Los dos nuevos van en el medio.
-- ===========================================================================

-- ---------------------------------------------------------------- columnas
alter table public.solicitudes add column if not exists contrapropuesta jsonb;
alter table public.solicitudes add column if not exists datos           jsonb;
alter table public.solicitudes add column if not exists aceptada_en     timestamptz;
alter table public.solicitudes add column if not exists registro_id     bigint;

-- --------------------------------------------- la política del primer crédito
-- Una sola fila (id = 1). Lo que Joan quiere ofrecerle a TODO nuevo, hasta que
-- lo cambie desde Ajustes. El texto es el que el cliente lee en su app.
create table if not exists public.politica_nuevos (
  id             integer     primary key default 1 check (id = 1),
  capital        bigint      not null default 100000,
  costo_pct      integer     not null default 35,
  dias           integer     not null default 8,
  texto          text        not null default
    'Por ser cliente nuevo todavía no puedes acceder a los créditos premium. Este es tu primer crédito: si lo pagas en fecha, el siguiente será mayor.',
  actualizada_en timestamptz not null default now()
);
alter table public.politica_nuevos enable row level security;
revoke all on table public.politica_nuevos from public, anon, authenticated;
insert into public.politica_nuevos (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------- ayudantes
-- El celular VERAZ del que está en sesión: sale del correo sintético que fijó
-- el signup (57XXXXXXXXXX@tugarantia.net), nunca de user_metadata, que el
-- propio usuario puede reescribir. Es la misma regla de play_solicitar.
--
-- 9-sep-2026 — EL DOMINIO ES tugarantia.net, NO socios.tugarantia.co. Este
-- archivo nació con el dominio viejo, el que murió el 28-ago
-- (20260828_correo_interno.sql: socios.tugarantia.co no existe y Supabase
-- contestaba email_address_invalid). Con el dominio viejo, celular_de_sesion
-- devolvía null SIEMPRE y se caían las cinco funciones que la usan sin un solo
-- error en pantalla: el primer crédito, mi solicitud, aceptar la
-- contrapropuesta, y las fotos y el GPS del registro (20260908b). La fuente de
-- verdad del dominio es DOMINIO_INTERNO en app/cuenta.js, y hay un centinela
-- en pruebas/cuenta.test.js que compara los dos literales.
create or replace function public.celular_de_sesion()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare correo text;
begin
  correo := coalesce(auth.jwt() ->> 'email', '');
  if correo not like '57%@tugarantia.net' then
    return null;
  end if;
  return substring(public.solo_digitos(split_part(correo, '@', 1)) from 3);
end
$$;

-- La contrapropuesta, armada en un solo sitio: la misma cuenta que hace el
-- motor en el computador (costo = capital × porcentaje, redondeado; fecha de
-- pago = hoy + días). Cambiar una regla acá es cambiarla para todos los nuevos.
create or replace function public.contrapropuesta_de(
  p_capital bigint, p_pct integer, p_dias integer, p_texto text, p_por text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'capital',    p_capital,
    'costo_pct',  p_pct,
    'dias',       p_dias,
    'costo',      round(p_capital * p_pct / 100.0)::bigint,
    'total',      p_capital + round(p_capital * p_pct / 100.0)::bigint,
    'fecha_pago', to_char(current_date + p_dias, 'YYYY-MM-DD'),
    'texto',      p_texto,
    'por',        p_por,
    'creada_en',  now()
  );
$$;

-- --------------------------------------------------- del lado del cliente
-- EL NUEVO PIDE. Idempotente: si ya tiene una solicitud abierta, contesta esa.
-- La propuesta sale de la política vigente en ese instante; los datos que
-- declaró al registrarse viajan copiados en la solicitud para que Joan pueda
-- abrirle la ficha y el crédito de una sola vez desde la bandeja.
create or replace function public.solicitar_primer_credito()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cel    text;
  pol    public.politica_nuevos;
  s      public.solicitudes;
  r      public.registros;
  cp     jsonb;
  nombre text;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  if not public.puede_intentar_tope('psol:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  select * into s from public.solicitudes
   where cedula = cel and estado in ('nueva', 'contrapropuesta', 'aceptada')
   order by creada_en desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
  end if;

  select * into pol from public.politica_nuevos where id = 1;
  select * into r from public.registros
   where right(public.solo_digitos(telefono), 10) = right(cel, 10)
   order by creado_en desc limit 1;
  nombre := coalesce(r.nombre,
    left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', 'Registrado')), 80));

  cp := public.contrapropuesta_de(pol.capital, pol.costo_pct, pol.dias, pol.texto, 'automatica');

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, fecha_corte, producto, estado,
     contrapropuesta, datos, registro_id)
  values
    (cel, nombre, (cp ->> 'capital')::bigint, pol.costo_pct / 100.0,
     (cp ->> 'costo')::bigint, (cp ->> 'total')::bigint, (cp ->> 'fecha_pago')::date,
     'quincenal', 'contrapropuesta', cp, coalesce(r.datos, '{}'::jsonb), r.id)
  returning * into s;

  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;

-- LO MÍO. La app lo pregunta al abrirse: es la «notificación» — si Joan cambió
-- la propuesta, acá aparece la nueva, sin aceptar, para que la lea y decida.
create or replace function public.mi_solicitud()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; s public.solicitudes;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into s from public.solicitudes
   where cedula = cel order by creada_en desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'solicitud', null);
  end if;
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;

-- ACEPTAR. Solo lo suyo, y solo lo que está en 'contrapropuesta': una
-- propuesta que Joan cambió vuelve a ese estado, así que lo que se acepta es
-- siempre la versión que el cliente tiene delante.
create or replace function public.aceptar_contrapropuesta(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; s public.solicitudes;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  update public.solicitudes
     set estado = 'aceptada',
         aceptada_en = now(),
         contrapropuesta = coalesce(contrapropuesta, '{}'::jsonb)
                           || jsonb_build_object('aceptada_en', now())
   where id = p_id and cedula = cel and estado = 'contrapropuesta'
  returning * into s;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;

-- ------------------------------------------------------ del lado de Joan
-- La bandeja completa: lo nuevo, lo propuesto y lo aceptado, en una sola
-- llamada. listar_solicitudes(p_clave, p_estado) sigue existiendo tal cual.
create or replace function public.listar_solicitudes_abiertas(p_clave text)
returns setof public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return query
    select * from public.solicitudes
     where estado in ('nueva', 'contrapropuesta', 'aceptada')
     order by creada_en desc
     limit 200;
end
$$;

-- CAMBIAR LA PROPUESTA. Lo que Joan quiera, dentro de las rejas del motor
-- (el costo de 1% a 50%). Vuelve a 'contrapropuesta': el cliente tiene que
-- volver a aceptar lo que ahora ve.
create or replace function public.contrapropuesta_solicitud(
  p_clave text, p_id bigint, p_capital bigint, p_costo_pct integer, p_dias integer, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.solicitudes; cp jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if p_capital is null or p_capital < 10000 or p_capital > 20000000
     or p_costo_pct is null or p_costo_pct < 1 or p_costo_pct > 50
     or p_dias is null or p_dias < 1 or p_dias > 60 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;
  cp := public.contrapropuesta_de(p_capital, p_costo_pct, p_dias,
          left(coalesce(p_texto, ''), 400), 'joan');
  update public.solicitudes
     set contrapropuesta = cp,
         estado      = 'contrapropuesta',
         aceptada_en = null,
         capital     = (cp ->> 'capital')::bigint,
         tasa        = p_costo_pct / 100.0,
         costo       = (cp ->> 'costo')::bigint,
         total       = (cp ->> 'total')::bigint,
         fecha_corte = (cp ->> 'fecha_pago')::date,
         producto    = 'quincenal'
   where id = p_id and estado in ('nueva', 'contrapropuesta', 'aceptada')
  returning * into s;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no está abierta');
  end if;
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;

-- LA POLÍTICA, leer y guardar desde Ajustes.
create or replace function public.politica_nuevos_leer(p_clave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare pol public.politica_nuevos;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select * into pol from public.politica_nuevos where id = 1;
  return to_jsonb(pol);
end
$$;

create or replace function public.politica_nuevos_guardar(
  p_clave text, p_capital bigint, p_costo_pct integer, p_dias integer, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare pol public.politica_nuevos;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if p_capital is null or p_capital < 10000 or p_capital > 20000000
     or p_costo_pct is null or p_costo_pct < 1 or p_costo_pct > 50
     or p_dias is null or p_dias < 1 or p_dias > 60 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;
  update public.politica_nuevos
     set capital = p_capital, costo_pct = p_costo_pct, dias = p_dias,
         texto = left(coalesce(p_texto, ''), 400), actualizada_en = now()
   where id = 1
  returning * into pol;
  return jsonb_build_object('ok', true, 'politica', to_jsonb(pol));
end
$$;

-- ------------------------------------------------------------- permisos
-- La lección del 28-ago: Supabase le da EXECUTE a anon y authenticated a CADA
-- función nueva, así que primero se les quita a los tres y después se da solo
-- lo que toca. Las del cliente, con sesión; las de Joan, con la llave pública
-- más la clave de sincronización por argumento (igual que listar_solicitudes).
revoke all on function public.celular_de_sesion()                                                   from public, anon, authenticated;
revoke all on function public.contrapropuesta_de(bigint, integer, integer, text, text)              from public, anon, authenticated;

revoke all on function public.solicitar_primer_credito()                                            from public, anon, authenticated;
grant execute on function public.solicitar_primer_credito()                                         to authenticated;
revoke all on function public.mi_solicitud()                                                        from public, anon, authenticated;
grant execute on function public.mi_solicitud()                                                     to authenticated;
revoke all on function public.aceptar_contrapropuesta(bigint)                                       from public, anon, authenticated;
grant execute on function public.aceptar_contrapropuesta(bigint)                                    to authenticated;

revoke all on function public.listar_solicitudes_abiertas(text)                                     from public, anon, authenticated;
grant execute on function public.listar_solicitudes_abiertas(text)                                  to anon;
revoke all on function public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text) from public, anon, authenticated;
grant execute on function public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text) to anon;
revoke all on function public.politica_nuevos_leer(text)                                            from public, anon, authenticated;
grant execute on function public.politica_nuevos_leer(text)                                         to anon;
revoke all on function public.politica_nuevos_guardar(text, bigint, integer, integer, text)         from public, anon, authenticated;
grant execute on function public.politica_nuevos_guardar(text, bigint, integer, integer, text)      to anon;

-- PostgREST contesta 404 para funciones nuevas hasta recargar el esquema.
notify pgrst, 'reload schema';

-- ----------------------------------------------------- comprobaciones
-- Se corren solas al final. Si alguna falla, la migración no quedó bien.
do $$
begin
  if not exists (select 1 from public.politica_nuevos where id = 1) then
    raise exception 'politica_nuevos sin su fila';
  end if;
  if has_function_privilege('anon', 'public.solicitar_primer_credito()', 'execute') then
    raise exception 'solicitar_primer_credito sigue abierta a anon';
  end if;
  if not has_function_privilege('authenticated', 'public.aceptar_contrapropuesta(bigint)', 'execute') then
    raise exception 'aceptar_contrapropuesta no es llamable con sesión';
  end if;
  if not has_function_privilege('anon', 'public.listar_solicitudes_abiertas(text)', 'execute') then
    raise exception 'la bandeja de Joan no es llamable con la llave pública';
  end if;
end $$;
