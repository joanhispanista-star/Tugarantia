-- ===========================================================================
-- EL CHAT, CON TU SESIÓN — 25 de noviembre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor → New query → pegar TODO → Run.
-- Va DESPUÉS de todo lo del chat (20260828b … 20261019b) y de
-- 20261022d_el_equipo_con_la_clave_de_joan.sql. Es idempotente: crea o
-- reemplaza ONCE funciones nuevas y vuelve a poner sus permisos. No crea
-- tablas ni columnas y NO cambia ninguna función que ya exista.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema.
--
-- LA PREGUNTA QUE CONTESTA
-- El chat del Panel en el bolsillo (clientes y equipo) solo funciona en un
-- teléfono que tenga guardada la CLAVE DE SINCRONIZACIÓN del computador. El
-- celular de Joan entra con su sesión (correo o celular, y contraseña) y no
-- tiene esa clave, así que hoy no puede leer ni contestar el chat desde la
-- calle. Los clientes escriben y nadie responde.
--
-- CÓMO SE RESUELVE, Y POR QUÉ NO SE COPIA NI UN CUERPO
-- Cada función del chat de Joan (chat_conversaciones, chat_de, chat_responder
-- y sus vecinas) empieza con clave_ok(p_clave). Aquí cada una recibe una
-- GEMELA `panel_…` que hace dos cosas y nada más:
--   1. pregunta panel_es_dueno() — la misma puerta de panel_traer;
--   2. llama a la función DE SIEMPRE, pasándole la clave que la base ya tiene
--      guardada en config_privada.
-- Así todo lo que la función de siempre hace (el canal del último mensaje, el
-- «visto», los topes de las fotos, el cortacircuito, el horario) sigue
-- viviendo en UN solo sitio. Copiar los cuerpos es cómo se pierde en silencio
-- un tope o un pg_sleep (pasó el 22-sep con chat_foto_sesion). Si mañana
-- cambia chat_de, la gemela cambia con ella sin tocar este archivo.
--
-- LA CLAVE NO SALE DE LA BASE. Las gemelas la leen adentro, después de saber
-- quién pregunta, y no la devuelven. No se crea ninguna función que la
-- entregue: se lee en línea en cada gemela, para que no exista nada que un
-- permiso mal puesto pueda dejar publicado.
--
-- LO QUE SE ACEPTA A CAMBIO, DICHO: clave_ok pone su contador en cero cada vez
-- que recibe la clave buena, y ahora también la recibe desde el celular de
-- Joan. Es lo mismo que ya pasa con el CRM abierto en el computador, que
-- pregunta cada 45 segundos. Y si el freno está puesto (más de 10 intentos
-- fallidos en 15 minutos, de alguien tanteando), las gemelas también reciben
-- el «no», igual que el computador: el celular lo dice con esas palabras.
--
-- LO QUE NO SE ABRE: chat_olvidar (borrar una conversación entera) sigue
-- siendo solo del computador. Aquí no tiene gemela.
--
-- CÓMO QUEDAN PROTEGIDAS: security definer con el search_path fijo, la
-- pregunta por el dueño en la primera línea, y permisos en dos tiempos (el
-- revoke NOMBRA a anon y authenticated porque Supabase les concede EXECUTE a
-- cada función nueva de public por su cuenta). Solo `authenticated`; nunca
-- `anon`, que es la llave que va escrita en las páginas públicas.
-- ===========================================================================


-- ====== 0. LO QUE TIENE QUE ESTAR ANTES ======
-- Se pregunta por la FIRMA exacta de cada función de siempre: PL/pgSQL no
-- compila al crear, así que una gemela que apunte a una firma que no existe
-- quedaría en verde aquí y muerta en el celular.
do $$
declare
  f text;
  falta text := '';
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Falta base/20261022d_el_equipo_con_la_clave_de_joan.sql. Córrelo primero.';
  end if;
  if to_regprocedure('public.panel_es_dueno()') is null then
    raise exception 'Falta base/20260811_panel_nube.sql: sin panel_es_dueno() estas funciones no saben quién es Joan. Córrelo primero.';
  end if;
  if to_regclass('public.config_privada') is null then
    raise exception 'No existe public.config_privada: corre primero base/supabase.sql.';
  end if;
  foreach f in array array[
    'public.chat_conversaciones(text)',
    'public.chat_de(text,text,bigint,text)',
    'public.chat_responder(text,text,text,text)',
    'public.chat_hilo_de_celular(text,text)',
    'public.chat_foto_panel(text,bigint)',
    'public.chat_foto_responder(text,text,text,text,text,text)',
    'public.equipo_chat_conversaciones(text)',
    'public.equipo_chat_de(text,text,bigint)',
    'public.equipo_chat_responder(text,text,text)',
    'public.equipo_foto_panel(text,bigint)',
    'public.equipo_foto_responder(text,text,text,text,text)'
  ] loop
    if to_regprocedure(f) is null then falta := falta || ' ' || f; end if;
  end loop;
  if falta <> '' then
    raise exception 'A tu base le faltan funciones del chat (o tienen otra forma):%. Corre primero los archivos del chat (base/20260922d, 20260922f, 20260922r, 20260922s, 20260923 y 20261019b) y vuelve a correr este.', falta;
  end if;
end $$;


-- ====== 1. LAS GEMELAS DEL CHAT CON CLIENTES ======
create or replace function public.panel_chat_conversaciones()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_conversaciones((select valor from public.config_privada where clave = 'clave_sync'));
end
$$;

create or replace function public.panel_chat_de(p_cedula text, p_desde bigint default 0, p_canal text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_de((select valor from public.config_privada where clave = 'clave_sync'), p_cedula, p_desde, p_canal);
end
$$;

create or replace function public.panel_chat_responder(p_cedula text, p_texto text, p_canal text default null)
returns bigint language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_responder((select valor from public.config_privada where clave = 'clave_sync'), p_cedula, p_texto, p_canal);
end
$$;

create or replace function public.panel_chat_hilo_de_celular(p_celular text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_hilo_de_celular((select valor from public.config_privada where clave = 'clave_sync'), p_celular);
end
$$;

create or replace function public.panel_chat_foto_panel(p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_foto_panel((select valor from public.config_privada where clave = 'clave_sync'), p_id);
end
$$;

create or replace function public.panel_chat_foto_responder(
  p_cedula text, p_imagen text, p_miniatura text default null, p_texto text default null, p_canal text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_foto_responder((select valor from public.config_privada where clave = 'clave_sync'),
                                    p_cedula, p_imagen, p_miniatura, p_texto, p_canal);
end
$$;


-- ====== 2. LAS GEMELAS DEL CHAT CON EL EQUIPO ======
create or replace function public.panel_equipo_chat_conversaciones()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_chat_conversaciones((select valor from public.config_privada where clave = 'clave_sync'));
end
$$;

create or replace function public.panel_equipo_chat_de(p_celular text, p_desde bigint default 0)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_chat_de((select valor from public.config_privada where clave = 'clave_sync'), p_celular, p_desde);
end
$$;

create or replace function public.panel_equipo_chat_responder(p_celular text, p_texto text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_chat_responder((select valor from public.config_privada where clave = 'clave_sync'), p_celular, p_texto);
end
$$;

create or replace function public.panel_equipo_foto_panel(p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_foto_panel((select valor from public.config_privada where clave = 'clave_sync'), p_id);
end
$$;

create or replace function public.panel_equipo_foto_responder(
  p_celular text, p_imagen text, p_miniatura text default null, p_texto text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_foto_responder((select valor from public.config_privada where clave = 'clave_sync'),
                                      p_celular, p_imagen, p_miniatura, p_texto);
end
$$;


-- ====== 3. PERMISOS ======
revoke all on function public.panel_chat_conversaciones()                          from public, anon, authenticated;
revoke all on function public.panel_chat_de(text, bigint, text)                    from public, anon, authenticated;
revoke all on function public.panel_chat_responder(text, text, text)               from public, anon, authenticated;
revoke all on function public.panel_chat_hilo_de_celular(text)                     from public, anon, authenticated;
revoke all on function public.panel_chat_foto_panel(bigint)                        from public, anon, authenticated;
revoke all on function public.panel_chat_foto_responder(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.panel_equipo_chat_conversaciones()                   from public, anon, authenticated;
revoke all on function public.panel_equipo_chat_de(text, bigint)                   from public, anon, authenticated;
revoke all on function public.panel_equipo_chat_responder(text, text)              from public, anon, authenticated;
revoke all on function public.panel_equipo_foto_panel(bigint)                      from public, anon, authenticated;
revoke all on function public.panel_equipo_foto_responder(text, text, text, text)  from public, anon, authenticated;

grant execute on function public.panel_chat_conversaciones()                          to authenticated;
grant execute on function public.panel_chat_de(text, bigint, text)                    to authenticated;
grant execute on function public.panel_chat_responder(text, text, text)               to authenticated;
grant execute on function public.panel_chat_hilo_de_celular(text)                     to authenticated;
grant execute on function public.panel_chat_foto_panel(bigint)                        to authenticated;
grant execute on function public.panel_chat_foto_responder(text, text, text, text, text) to authenticated;
grant execute on function public.panel_equipo_chat_conversaciones()                   to authenticated;
grant execute on function public.panel_equipo_chat_de(text, bigint)                   to authenticated;
grant execute on function public.panel_equipo_chat_responder(text, text)              to authenticated;
grant execute on function public.panel_equipo_foto_panel(bigint)                      to authenticated;
grant execute on function public.panel_equipo_foto_responder(text, text, text, text)  to authenticated;
-- Y NUNCA a anon. Tener sesión tampoco alcanza: adentro se pregunta panel_es_dueno().

notify pgrst, 'reload schema';


-- ====== 4. LA PRUEBA LLAMANDO, en la base de verdad ======
-- Las gemelas se LLAMAN aquí mismo, porque PL/pgSQL no las compila al crearlas.
--   · Sin sesión y con una sesión que no es de un dueño: las once se niegan.
--   · Con la sesión de un dueño que YA exista en panel_duenos (no se crea
--     ninguno): se piden las dos LISTAS de conversaciones, que solo leen.
-- Las que marcan «visto» o escriben (leer un hilo, responder, las fotos) NO se
-- llaman con datos de verdad: de esas se comprueba que existen con su firma y
-- sus permisos. La prueba no manda ningún mensaje ni marca nada como leído.
-- La tabla de la prueba es temporal (muere con la conexión).
drop table if exists pg_temp.chat_sesion_prueba;
create temporary table chat_sesion_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_uid   uuid;
  j       jsonb;
  n_neg   integer := 0;
  n_neg2  integer := 0;
  q       text;
  LLAMADAS constant text[] := array[
    'select public.panel_chat_conversaciones()',
    'select public.panel_chat_de(''0'', 0, null)',
    'select public.panel_chat_responder(''0'', ''x'', null)',
    'select public.panel_chat_hilo_de_celular(''0'')',
    'select public.panel_chat_foto_panel(0)',
    'select public.panel_chat_foto_responder(''0'', ''x'', null, null, null)',
    'select public.panel_equipo_chat_conversaciones()',
    'select public.panel_equipo_chat_de(''0'', 0)',
    'select public.panel_equipo_chat_responder(''0'', ''x'')',
    'select public.panel_equipo_foto_panel(0)',
    'select public.panel_equipo_foto_responder(''0'', ''x'', null, null)'];
begin
  -- Sin sesión: las once se niegan ANTES de tocar nada (la pregunta por el dueño va primero).
  perform set_config('request.jwt.claims', '', true);
  foreach q in array LLAMADAS loop
    begin
      execute q;
    exception when others then
      if sqlerrm = 'no autorizado' then n_neg := n_neg + 1; end if;
    end;
  end loop;
  insert into chat_sesion_prueba values ('sin_sesion_se_niegan_las_once', n_neg = 11);

  -- Con una sesión que no es de un dueño: también.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001126","role":"authenticated"}', true);
  foreach q in array LLAMADAS loop
    begin
      execute q;
    exception when others then
      if sqlerrm = 'no autorizado' then n_neg2 := n_neg2 + 1; end if;
    end;
  end loop;
  insert into chat_sesion_prueba values ('quien_no_es_dueno_tampoco',
    n_neg2 = 11 or exists (select 1 from public.panel_duenos where uid = '00000000-0000-4000-8000-000000001126'));

  -- Con la sesión de un dueño que ya existe: las dos listas contestan.
  select uid into v_uid from public.panel_duenos order by creado_en limit 1;
  if v_uid is null then
    raise notice 'Todavía no hay ningún dueño en panel_duenos: la prueba con sesión no corre.';
    insert into chat_sesion_prueba values ('con_dueno_lista_de_clientes', null), ('con_dueno_lista_del_equipo', null);
  elsif not exists (select 1 from public.config_privada where clave = 'clave_sync' and length(valor) >= 12) then
    raise notice 'La base todavía no tiene clave de sincronización: las funciones de siempre contestan «clave incorrecta» y la prueba con sesión no corre.';
    insert into chat_sesion_prueba values ('con_dueno_lista_de_clientes', null), ('con_dueno_lista_del_equipo', null);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    j := public.panel_chat_conversaciones();
    insert into chat_sesion_prueba values ('con_dueno_lista_de_clientes', j is not null and jsonb_typeof(j) in ('array', 'object'));
    j := public.panel_equipo_chat_conversaciones();
    insert into chat_sesion_prueba values ('con_dueno_lista_del_equipo', j is not null and jsonb_typeof(j) in ('array', 'object'));
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- Permisos, comprobados y no supuestos: ninguna abierta a la llave pública, todas con sesión.
insert into chat_sesion_prueba
select 'cerradas_a_la_llave_publica', not bool_or(has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^panel_(chat|equipo_chat|equipo_foto)_'
on conflict (paso) do update set ok = excluded.ok;
insert into chat_sesion_prueba
select 'abiertas_con_sesion_las_once', count(*) = 11 and bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^panel_(chat|equipo_chat|equipo_foto)_'
on conflict (paso) do update set ok = excluded.ok;
-- Y borrar una conversación entera NO quedó abierta por esta puerta.
insert into chat_sesion_prueba values
  ('borrar_la_conversacion_sigue_en_el_computador', to_regprocedure('public.panel_chat_olvidar(text)') is null)
on conflict (paso) do update set ok = excluded.ok;

-- Si algo salió en false, el archivo entero se deshace y lo dice.
do $$
declare v_mal text;
begin
  select string_agg(paso, ', ' order by paso) into v_mal from chat_sesion_prueba where ok is false;
  if v_mal is not null then
    raise exception 'FALLA la prueba del chat con tu sesión en: %. No quedó nada aplicado.', v_mal;
  end if;
  raise notice 'Listo: el chat con tu sesión. Falta: Settings → API → Reload schema.';
end $$;

-- Lo que Joan ve al terminar: una fila por comprobación.
select paso as "comprobación",
       case when ok then 'bien' when ok is null then 'no corrió (falta un dueño o la clave)' else 'FALLA' end as "resultado"
  from chat_sesion_prueba
 order by paso;
