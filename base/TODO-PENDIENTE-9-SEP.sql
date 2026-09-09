-- ========================================================================
-- TU GARANTIA — LAS CUATRO MIGRACIONES PENDIENTES, EN ORDEN
-- Generado el 9 de septiembre de 2026.
--
-- COMO SE CORRE: Supabase → SQL Editor → New query → pegar TODO ESTO → Run.
--
-- Es UN solo script a proposito. El editor lo corre entero en una sola vez:
-- si algo falla, falla completo y la base no queda a medias. Cuatro pegados
-- sueltos tienen el riesgo de que el tercero se quede sin correr y nadie lo
-- note hasta que un cliente se estrella contra el.
--
-- Las cuatro son idempotentes: correrlas dos veces no hace dano.
-- Cada una termina con un bloque de comprobacion que REVIENTA A PROPOSITO si
-- algo no quedo como debe, y dice que fue. Si el editor no muestra ningun
-- error rojo al final, quedaron las cuatro.
--
-- Lo que hace cada una:
--   1. EL PRIMER CREDITO DEL CLIENTE NUEVO
--   2. LAS FOTOS DEL REGISTRO Y LA HUELLA DEL APARATO
--   3. UNA SOLA PUERTA (el cliente antiguo por fin se guarda)
--   4. LOS TOPES A 8 MILLONES
-- ========================================================================


-- ========================================================================
-- MIGRACION 1 DE 4: 20260908_primer_credito.sql
-- ========================================================================

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


-- ========================================================================
-- MIGRACION 2 DE 4: 20260908b_registro_archivos.sql
-- ========================================================================

-- ===========================================================================
-- LAS FOTOS DEL REGISTRO Y LA HUELLA DEL APARATO
-- 8 de septiembre de 2026 (noche). Va DESPUÉS de 20260908_primer_credito.sql.
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «No me pidió que me tomara la foto facial y la foto de mi cédula por las dos
-- caras… que únicamente tomando la foto de la cédula el sistema rellene los
-- datos… que al tomar la foto facial parezca que escanea la cara… que mi CRM
-- pueda identificar un porcentaje de parecido con la foto de la cédula… que el
-- CRM me permita ver desde qué celular usa la página o la IP… y que la
-- ubicación quede registrada automáticamente.»
--
-- POR QUÉ UNA TABLA APARTE. registrar_abierto recorta cada dato a 200
-- caracteres y listar_registros trae 200 filas de una: tres fotos por fila
-- serían decenas de megas en cada «Traer de la nube». Las fotos viven aquí, se
-- suben DESPUÉS de crear la cuenta (con la sesión, así nadie sube fotos a
-- nombre de otro celular) y el CRM las pide una por una, cuando Joan abre esa
-- persona.
--
-- LA HUELLA. La dirección IP y el aparato NO los manda el teléfono (se
-- falsifican en un segundo): los lee la base de las cabeceras de la petición,
-- que pone PostgREST. Lo único que manda el teléfono es el punto GPS, y solo si
-- la persona lo autorizó (dato sensible, Ley 1581: casilla aparte y opcional;
-- está en legal/privacidad.html desde el 24-ago).
-- ===========================================================================

alter table public.registros add column if not exists huella jsonb;

create table if not exists public.registro_archivos (
  id         bigint generated always as identity primary key,
  celular    text        not null,
  tipo       text        not null,      -- cedula_frente | cedula_reverso | selfie
  imagen     text        not null,      -- data:image/jpeg;base64,… (comprimida en el teléfono)
  creado_en  timestamptz not null default now(),
  unique (celular, tipo)
);
create index if not exists registro_archivos_por_celular on public.registro_archivos (celular);
alter table public.registro_archivos enable row level security;
revoke all on table public.registro_archivos from public, anon, authenticated;

-- El teléfono sube sus fotos (con sesión) y su huella. Una foto de más de
-- ~400 KB no entra: la app las comprime a ~900 px, y si algo llega más grande
-- es que no vino de la app.
create or replace function public.registro_archivos_guardar(p_archivos jsonb, p_huella jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel     text;
  k       text;
  v       text;
  cab     jsonb;
  huella  jsonb;
  n       integer := 0;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_archivos, '{}'::jsonb)) loop
    if k not in ('cedula_frente', 'cedula_reverso', 'selfie') then continue; end if;
    if v is null or v not like 'data:image/%' or length(v) > 600000 then continue; end if;
    insert into public.registro_archivos (celular, tipo, imagen)
    values (cel, k, v)
    on conflict (celular, tipo) do update set imagen = excluded.imagen, creado_en = now();
    n := n + 1;
  end loop;

  -- La huella: lo que dice la petición (no el teléfono) más el GPS autorizado.
  begin
    cab := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  exception when others then
    cab := '{}'::jsonb;
  end;
  huella := jsonb_build_object(
    'ip',      left(coalesce(cab ->> 'x-forwarded-for', cab ->> 'x-real-ip', ''), 80),
    'aparato', left(coalesce(cab ->> 'user-agent', ''), 300),
    'momento', now()
  );
  if p_huella ? 'gps' then
    huella := huella || jsonb_build_object('gps', p_huella -> 'gps');
  end if;
  if p_huella ? 'cedula_leida' then
    huella := huella || jsonb_build_object('cedula_leida', p_huella -> 'cedula_leida');
  end if;
  update public.registros
     set huella = coalesce(huella, '{}'::jsonb) || huella
   where id = (select id from public.registros
                where right(public.solo_digitos(telefono), 10) = right(cel, 10)
                order by creado_en desc limit 1);

  return jsonb_build_object('ok', true, 'fotos', n);
end
$$;

-- Joan pide las fotos de UNA persona, cuando la abre.
create or replace function public.archivos_de_registro(p_clave text, p_celular text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb; h jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select coalesce(jsonb_object_agg(tipo, imagen), '{}'::jsonb) into r
    from public.registro_archivos
   where right(public.solo_digitos(celular), 10) = right(public.solo_digitos(p_celular), 10);
  select huella into h from public.registros
   where right(public.solo_digitos(telefono), 10) = right(public.solo_digitos(p_celular), 10)
   order by creado_en desc limit 1;
  -- Las fotos y la huella juntas: la ficha nace con todo de una llamada.
  return jsonb_build_object('fotos', r, 'huella', h);
end
$$;

-- ------------------------------------------------------------- permisos
revoke all on function public.registro_archivos_guardar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.registro_archivos_guardar(jsonb, jsonb) to authenticated;
revoke all on function public.archivos_de_registro(text, text)          from public, anon, authenticated;
grant execute on function public.archivos_de_registro(text, text)       to anon;

notify pgrst, 'reload schema';

do $$
begin
  if has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute') then
    raise exception 'registro_archivos_guardar sigue abierta a anon';
  end if;
  if not has_function_privilege('anon', 'public.archivos_de_registro(text, text)', 'execute') then
    raise exception 'archivos_de_registro no es llamable con la llave pública';
  end if;
  if exists (select 1 from information_schema.table_privileges
              where table_name = 'registro_archivos' and grantee in ('anon', 'authenticated')) then
    raise exception 'la tabla de fotos quedó abierta';
  end if;
end $$;


-- ========================================================================
-- MIGRACION 3 DE 4: 20260909_una_sola_puerta.sql
-- ========================================================================

-- ===========================================================================
-- UNA SOLA PUERTA — 9 de septiembre de 2026
--
-- Va DESPUÉS de 20260908_primer_credito.sql y 20260908b_registro_archivos.sql.
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «En la pantalla de inicio está un botón que dice no tengo código, y al
-- oprimir envía al WhatsApp de Garantía, pero no quiero que sea así: quiero que
-- lleve a todos los clientes independientemente que sea nuevo o antiguo, y que
-- yo desde el CRM tenga la información y pueda cruzar la información del
-- cliente con la que yo manualmente anteriormente ingresé, y que se pueda ver
-- su historial y que no quede como dos clientes duplicados.»
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL PRIMER CAMBIO: HOY EL CLIENTE ANTIGUO SE TIRA A LA BASURA
--
-- registrar_abierto (20260824) tiene esto antes de insertar:
--
--     if exists (select 1 from public.registros ...)
--        or exists (select 1 from public.socios_historial
--                    where celular = cel or cedula = cel or cedula = ced)
--     then return jsonb_build_object('ok', true); end if;
--
-- El segundo `exists` significa: SI YA ERES CLIENTE DE JOAN, TU REGISTRO NO SE
-- GUARDA. La app te dice «listo» y la fila no existe. Con el botón nuevo eso
-- sería catastrófico: Joan manda un enlace a sus 16 clientes, los 16 llenan
-- nueve pasos con foto de cédula y de rostro, y a la bandeja no llega ninguno.
--
-- Se quita ese `exists`. Lo que NO se quita es el motivo por el que se escribió:
-- que la respuesta al teléfono no delate quién es cliente de Joan. Sigue siendo
-- la misma en todos los casos — y ahora también los EFECTOS, que es lo que
-- faltaba (ver abajo).
--
-- ---------------------------------------------------------------------------
-- LA LECCIÓN QUE COSTÓ ESTA AUDITORÍA: UNA RESPUESTA IGUAL NO BASTA
--
-- Los dos caminos de éxito devolvían el mismo `{"ok": true}` pero NO hacían lo
-- mismo: el que insertaba llamaba `limpiar_fallos('reg:'||cel)` y el que se
-- rendía se iba sin llamarlo. `limpiar_fallos` borra el contador de intentos
-- fallidos de ese celular — y ese contador SÍ es observable desde afuera:
-- basta con quemar unos intentos con datos malos, registrarse bien, y mirar si
-- el freno se soltó. Si se soltó, eras desconocido; si no, ya estabas dentro.
-- La respuesta era idéntica y el oráculo funcionaba igual.
--
-- Ahora `limpiar_fallos` va ANTES de la bifurcación: los dos caminos de éxito
-- dejan la base en el mismo estado.
--
-- LO QUE SIGUE SIENDO OBSERVABLE, y se declara en vez de esconderse: el camino
-- que inserta escribe una fila y el que no, no — la diferencia de tiempo es de
-- microsegundos y medirla exige miles de intentos contra el freno global de 30
-- cada 15 minutos. Para un negocio de barrio se asume. Lo que NO se asume es un
-- canal que se lea con tres intentos, que es lo que había.
--
-- Y hay un oráculo MÁS GRANDE que este archivo no puede cerrar, así que queda
-- escrito: el signup de Supabase que corre justo después (play/index.html)
-- contesta distinto si el celular ya tiene cuenta, y la app se lo dice a la
-- persona («Ya hay una cuenta con ese celular»). Es información que el dueño
-- del número necesita para no registrarse dos veces, y quitarla dejaría sin
-- salida al que sí es suyo. Cerrarlo de verdad pide verificar el celular por
-- SMS antes de contestar nada, que hoy no existe. Se asume a conciencia.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL SEGUNDO CAMBIO: EL CRUCE PODÍA DEJAR AL CLIENTE AFUERA DE SU APP
--
-- La llave de un cliente en la nube es «su cédula si la tiene, y si no, su
-- celular» (ident := coalesce(cedula, celular)). Once de los dieciséis clientes
-- de Joan NO tienen cédula: viven en la nube con la llave = su celular.
--
-- El cruce que Joan pidió consiste, justamente, en rellenarle la cédula a esas
-- fichas incompletas. En la siguiente «☁ Subir historiales», la llave cambia de
-- celular a cédula y sincronizar_socios hace:
--
--     update public.mensajes set cedula = ident where cedula = cel;
--     delete from public.socios_historial where cedula = cel;
--
-- Los mensajes viajan (eso ya estaba resuelto el 28-ago). El CÓDIGO DE ACCESO
-- no: se va en el `delete`. Y si el socio se había puesto su propio código
-- desde la app (`codigo_propio`), la fila nueva nace con el que tiene Joan en
-- su Panel, que es el viejo. Resultado: el cliente teclea su código, la nube no
-- lo reconoce, y no entra a ver su historial. Sin un error en pantalla, sin una
-- alarma, y justo el día que Joan le completó la ficha.
--
-- Ahora la fila vieja se RESCATA antes de borrarla: el código y la marca de
-- «se lo puso él» se llevan a la fila nueva.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. EL REGISTRO GUARDA A TODO EL MUNDO
-- ---------------------------------------------------------------------------
create or replace function public.registrar_abierto(
  p_celular text, p_nombre text, p_cedula text default '',
  p_datos jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cel    text;
  ced    text;
  nom    text;
  k      text;
  v      text;
  limpio jsonb := '{}'::jsonb;
  n      integer := 0;
begin
  cel := public.solo_digitos(p_celular);
  ced := public.solo_digitos(coalesce(p_cedula, ''));
  nom := left(btrim(coalesce(p_nombre, '')), 80);

  -- El freno global va PRIMERO: es el que no depende de qué identidad inventen.
  if not public.puede_intentar_tope('reg:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  if not public.puede_intentar('reg:' || left(cel, 20)) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  -- El celular es EL identificador del negocio (decisión del 20-ago: 15 de 16
  -- clientes tienen celular; 5 tienen cédula). 10 dígitos y empieza por 3 —
  -- un fijo no recibe WhatsApp y sería una cuenta incontactable.
  if length(cel) <> 10 or left(cel, 1) <> '3' or length(nom) < 3
     or (ced <> '' and length(ced) < 5) then
    perform public.anotar_fallo('reg:' || left(cel, 20));
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  -- La vinculación, desinfectada: solo pares de texto plano, llave capada a
  -- 40, valor a 200, máximo 40 pares. Objetos anidados y arreglos se quedan
  -- por fuera — la ficha de verdad la arma Joan en su Panel.
  if jsonb_typeof(p_datos) = 'object' and length(p_datos::text) <= 12000 then
    for k, v in select key, value from jsonb_each_text(p_datos) loop
      exit when n >= 40;
      if v is not null and btrim(v) <> '' then
        limpio := limpio || jsonb_build_object(left(k, 40), left(v, 200));
        n := n + 1;
      end if;
    end loop;
  end if;

  -- 9-sep-2026 — ANTES DE LA BIFURCACIÓN, no dentro de una rama. Ver la
  -- cabecera: si solo lo llamara el camino que inserta, el contador de fallos
  -- contestaría lo que la respuesta se niega a contestar.
  perform public.limpiar_fallos('reg:' || left(cel, 20));

  -- 9-sep-2026 — SE CAYÓ EL `exists` CONTRA socios_historial. Un cliente
  -- antiguo que se registra AHORA SÍ le llega a Joan: es la mitad de lo que
  -- pidió («que lleve a todos, nuevo o antiguo, y que yo lo cruce a mano»).
  -- Sigue en pie el de `registros`, y por otro motivo: que dos toques del botón
  -- no le pongan dos filas iguales en la bandeja. Ese no es un oráculo de
  -- clientela — es el mismo que ya existía para cualquier desconocido.
  --
  -- Y a propósito NO se actualiza la fila que ya estaba: si el segundo registro
  -- pisara al primero, cualquiera que sepa tu celular podría cambiar los datos
  -- que Joan está a punto de mirar.
  if not exists (
       select 1 from public.registros
        where estado = 'nuevo'
          and (telefono = cel or (ced <> '' and cedula = ced))
     ) then
    insert into public.registros (codigo, cedula, nombre, telefono, datos, origen)
    values ('', ced, nom, cel, limpio, 'abierto');
  end if;

  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 2. LA SUBIDA NO SE LLEVA EL CÓDIGO DE ACCESO POR DELANTE
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item     jsonb;
  n        integer := 0;
  h        text;
  ident    text;
  cel      text;
  forzar   boolean;
  h_viejo  text;
  propio   boolean;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    cel    := nullif(public.solo_digitos(item->>'telefono'), '');
    ident  := coalesce(nullif(public.solo_digitos(item->>'cedula'), ''), cel);
    forzar := coalesce((item->>'codigo_forzar')::boolean, false);
    continue when ident is null;

    h_viejo := null;
    propio  := false;

    if cel is not null and cel <> ident then
      -- 28-ago-2026 — LOS MENSAJES VIAJAN CON EL CLIENTE.
      -- Sin esta línea, el día que Joan le cargue la cédula a una ficha que
      -- subía por celular, la conversación de ese cliente queda colgando de
      -- una llave borrada: desaparece de la bandeja y él sigue viendo la suya.
      -- Dos verdades sobre la misma conversación, y ninguna alarma.
      update public.mensajes set cedula = ident where cedula = cel;

      -- 9-sep-2026 — Y EL CÓDIGO DE ACCESO TAMBIÉN VIAJA.
      -- El `delete` de abajo se llevaba `codigo_hash` y `codigo_propio`. Con el
      -- cruce que Joan estrena hoy, cargarle la cédula a una ficha que subía
      -- por celular es la operación NORMAL, no la rara: once de sus dieciséis
      -- clientes viven en la nube con la llave = su celular. El cliente tecleaba
      -- su código de siempre y la nube ya no lo reconocía.
      --
      -- Se lee ANTES de borrar y se usa como respaldo más abajo. Si el socio se
      -- había puesto su propio código desde la app, `codigo_propio` viaja con
      -- él: si no, la fila nueva nacería con el código viejo del Panel de Joan
      -- y le quitaría al socio el que él mismo eligió.
      select codigo_hash, coalesce(codigo_propio, false)
        into h_viejo, propio
        from public.socios_historial
       where cedula = cel;

      delete from public.socios_historial where cedula = cel;
    end if;

    h := public.huella_codigo(item->>'codigo');

    -- Si el socio se había puesto su propio código y Joan no está forzando uno
    -- nuevo, manda el suyo. Es la misma regla que el `on conflict` de abajo
    -- aplica a la fila que no cambia de llave; acá se aplica a la que sí.
    if h_viejo is not null and propio and not forzar then
      h := h_viejo;
    elsif h is null then
      h := h_viejo;
    end if;

    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, codigo_hash, codigo_propio, actualizado_en)
    values (
      ident,
      cel,
      right(coalesce(cel, ''), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      case when forzar then false else propio end,
      now()
    )
    on conflict (cedula) do update
      set celular        = excluded.celular,
          tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          codigo_hash    = case
            when forzar then coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
            when socios_historial.codigo_propio then socios_historial.codigo_hash
            else coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
          end,
          codigo_propio  = case when forzar then false else socios_historial.codigo_propio end,
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;

-- ------------------------------------------------------------- permisos
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto: se revoca a mano y se vuelve a conceder lo justo. Es la lección
-- del 28-ago (28 funciones abiertas a la llave pública sin que nadie lo viera).
revoke all on function public.registrar_abierto(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_abierto(text, text, text, jsonb) to anon;
revoke all on function public.sincronizar_socios(text, jsonb)              from public, anon, authenticated;
grant execute on function public.sincronizar_socios(text, jsonb)           to anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------- comprobación
do $$
declare
  cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'registrar_abierto' and pronamespace = 'public'::regnamespace;
  if cuerpo like '%socios_historial%' then
    raise exception 'registrar_abierto sigue mirando socios_historial: el cliente antiguo se seguiria tirando';
  end if;
  if cuerpo not like '%limpiar_fallos%' then
    raise exception 'registrar_abierto perdio limpiar_fallos';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'sincronizar_socios' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%h_viejo%' then
    raise exception 'sincronizar_socios no rescata el codigo antes del delete';
  end if;

  if not has_function_privilege('anon', 'public.registrar_abierto(text, text, text, jsonb)', 'execute') then
    raise exception 'registrar_abierto dejo de ser llamable desde la app';
  end if;
end $$;


-- ========================================================================
-- MIGRACION 4 DE 4: 20260909b_topes_arriba.sql
-- ========================================================================

-- ===========================================================================
-- SUBEN LOS TOPES — 9 de septiembre de 2026 (tarde)
--
-- Va DESPUÉS de 20260909_una_sola_puerta.sql.
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «Queremos llegar a montos superiores a los 6 millones, entonces tanto
-- calculadora como los topes cámbialos, que el cliente sepa hasta cuánto puede
-- pedir a futuro.»
--
-- El cupo del perfil más alto pasó de 2.000.000 a 8.000.000 y el del de en
-- medio de 1.000.000 a 3.000.000 (app/creditos.js: PERFILES). Esta migración
-- sube el MISMO tope en el servidor, y no toca nada más de la función.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ NO BASTABA CON CAMBIARLO EN LA APP
--
-- play_solicitar tiene su propia reja, y con razón: la app se puede editar
-- desde el navegador de cualquiera, así que el tope que de verdad protege la
-- plata de Joan es este. Pero decía 2.000.000, y la app traduce su {ok:false} a
-- «No pudimos recibir la solicitud ahora, espera unos minutos».
--
-- O sea: sin esta migración, el cliente movía la calculadora a 3.000.000,
-- pedía, y le salía un error de CONEXIÓN que era mentira — el sistema le
-- echaba la culpa a su internet por un tope que pusimos nosotros. De los
-- errores posibles ese es el peor: el que manda a la persona a reintentar algo
-- que nunca va a funcionar.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO CAMBIA, Y HAY QUE DECIDIR APARTE
--
-- El plazo sigue siendo de 1 a 6 meses. A 8.000.000 en 6 cuotas la mensualidad
-- es de $1.418.933; a 6.000.000, de $1.064.200. La tasa está muy por debajo del
-- techo de usura (24% E.A. contra 29,24%), así que el freno no es legal: es que
-- esa cuota tiene que caberle a alguien. Si el producto va a prestar de verdad
-- esos montos, el plazo tiene que crecer con ellos — y eso es otra decisión,
-- con otra migración y con la letra legal de vuelta al abogado.
--
-- NOTA PARA QUIEN VENGA DESPUÉS: el cuerpo de abajo es el de
-- 20260828_correo_interno.sql, copiado tal cual salvo el número del tope. Se
-- copia entero porque `create or replace` reemplaza la función completa; si
-- alguien vuelve a escribirla de memoria en vez de leerla, se lleva por delante
-- el freno global, el conteo de solicitudes por hora y las columnas del insert.
-- ===========================================================================

create or replace function public.play_solicitar(p_capital bigint, p_meses integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  correo    text;
  cel       text;
  recientes integer;
begin
  correo := coalesce(auth.jwt() ->> 'email', '');
  -- 28-ago-2026: el dominio pasó de socios.tugarantia.co (inexistente) a
  -- tugarantia.net. Ver la cabecera de esa migración.
  if correo not like '57%@tugarantia.net' then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  cel := substring(public.solo_digitos(split_part(correo, '@', 1)) from 3);

  -- 9-sep-2026 — EL TOPE SUBE DE 2.000.000 A 8.000.000. Es lo único que cambia
  -- en esta función. El mínimo se queda en 100.000: por debajo de ahí el costo
  -- se redondea a cero y la app publicaría una tasa efectiva del 0,00%, que es
  -- justo la mentira que se arregló el 4-sep.
  if p_capital is null or p_capital < 100000 or p_capital > 8000000
     or p_meses is null or p_meses < 1 or p_meses > 6 then
    return jsonb_build_object('ok', false);
  end if;

  if not public.puede_intentar_tope('psol:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  select count(*) into recientes
    from public.solicitudes
   where cedula = cel and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, producto, plazo_meses)
  values (
    cel,
    left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', 'Registrado')), 80),
    p_capital, 0, 0, 0, 'respaldado', p_meses
  );

  return jsonb_build_object('ok', true);
end
$$;

-- ------------------------------------------------------------- permisos
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto: se revoca a mano y se vuelve a conceder lo justo.
revoke all on function public.play_solicitar(bigint, integer) from public, anon, authenticated;
grant execute on function public.play_solicitar(bigint, integer) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------- comprobación
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'play_solicitar' and pronamespace = 'public'::regnamespace;
  if cuerpo is null then
    raise exception 'play_solicitar no existe: corre antes las migraciones anteriores';
  end if;
  if cuerpo like '%> 2000000%' then
    raise exception 'play_solicitar sigue rechazando por encima de 2.000.000';
  end if;
  if cuerpo not like '%> 8000000%' then
    raise exception 'play_solicitar no quedo con el tope nuevo';
  end if;
  -- Que no se haya perdido nada del cuerpo viejo al reemplazarlo.
  if cuerpo not like '%puede_intentar_tope%' then
    raise exception 'se perdio el freno global al reemplazar play_solicitar';
  end if;
  if cuerpo not like '%recientes >= 5%' then
    raise exception 'se perdio el limite de solicitudes por hora';
  end if;
  if cuerpo not like '%plazo_meses%' then
    raise exception 'se perdio el plazo en el insert de la solicitud';
  end if;
  if has_function_privilege('anon', 'public.play_solicitar(bigint, integer)', 'execute') then
    raise exception 'play_solicitar quedo abierta a anon: solo con sesion';
  end if;
end $$;


-- ========================================================================
-- LISTO. Si llegaste hasta aca sin un error rojo, las cuatro quedaron.
-- ========================================================================
