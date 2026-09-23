-- 22-sep-2026 — EL CHAT CON EL EQUIPO
--
-- Joan: «el chat tambien debe funcionar para yo hablar con los asesores de
-- cobranza o con el gerente».
--
-- ===========================================================================
-- LAS DOS DECISIONES DE JOAN, TOMADAS CON LAS OPCIONES DELANTE
--
--   · UNO A UNO. Un hilo suyo con cada persona del equipo, no una sala. Lo que
--     le dice a uno no lo lee otro, y para llamarle la atención a alguien no
--     tiene que hacerlo delante de los demás.
--   · SOLO JOAN habla con el equipo, por ahora. El gerente NO chatea con sus
--     asesores por aquí. Es lo más pequeño y se puede ampliar sin romper nada:
--     añadir esa mitad sería otra reja sobre la misma tabla, no otra tabla.
--
-- ===========================================================================
-- POR QUÉ UNA TABLA APARTE Y NO `mensajes`
--
-- Porque en `mensajes` la conversación se identifica por `cedula`, y esa llave
-- es la del CLIENTE: `llave_de_sesion` devuelve su cédula si vinculó su cuenta
-- y su CELULAR si no. Un asesor también se identifica por su celular.
--
-- O sea que meter el chat del equipo en la misma tabla sería meter dos cosas
-- distintas bajo la misma llave y confiar en que nunca coincidan. `asesor_crear`
-- prohíbe volver empleado a un cliente, así que hoy no coinciden — pero la
-- seguridad de toda la bandeja de Joan quedaría colgando de esa prohibición, y
-- el día que alguien la relaje, un mensaje del equipo aparecería en el hilo de
-- un cliente. O al revés.
--
-- Tabla aparte: dos cosas distintas, dos sitios.
--
-- ===========================================================================
-- Y POR QUÉ `de` DICE 'miembro' Y 'jefe' PERO SE DEVUELVE 'socio' Y 'panel'
--
-- El que pinta los dos chats es el MISMO archivo (`app/chat.js`), y decide de
-- qué lado va cada burbuja con `de`: 'socio' a un lado, 'panel' al otro. Si la
-- tabla guardara esas dos palabras, la base diría «socio» de un asesor — una
-- mentira escrita en el esquema, que es donde más caro sale.
--
-- Así que se guarda lo que las cosas SON y se traduce al leer. Dos `case` en
-- dos funciones, y a cambio el pintor no se toca: ni una línea de `chat.js`
-- cambia, y las dos pantallas heredan gratis la burbuja, la hora, el «Leído» y
-- el agrupado por día que ya estaban probados.
--
-- ===========================================================================
-- LO QUE NO LLEVA, Y SE DICE
--
--   · NO lleva fotos. El chat con clientes sí (20260922f), pero eso pide su
--     tabla, su tope y su cortacircuito. Joan no lo pidió aquí.
--   · NO hay respuestas automáticas ni reglas: esto lo escriben dos personas.
--   · NO lo ve nadie más. Un asesor lee SU hilo y nada más; ni siquiera su
--     gerente, porque esa mitad Joan la dejó fuera a propósito.

-- ====== 1. LA TABLA ======
create table if not exists public.mensajes_equipo (
  id        bigint generated always as identity primary key,
  -- La conversación ES la persona del equipo. No hay hilos entre dos miembros.
  celular   text        not null,
  -- Lo que las cosas SON. La traducción para el pintor va en las funciones.
  de        text        not null check (de in ('miembro', 'jefe')),
  texto     text        not null check (length(btrim(texto)) between 1 and 1000),
  creado_en timestamptz not null default now(),
  -- Un mensaje tiene un solo destinatario, así que con una marca alcanza.
  visto     boolean     not null default false
);

-- El cerrojo doble de esta casa: RLS encendido y CERO políticas. Nadie entra
-- directo; todo pasa por las funciones de abajo, que deciden qué devolver.
alter table public.mensajes_equipo enable row level security;

create index if not exists mensajes_equipo_conv
  on public.mensajes_equipo (celular, id);

comment on table public.mensajes_equipo is
  'Chat uno a uno entre Joan y cada persona del equipo. Tabla APARTE de mensajes porque alli la llave es la del CLIENTE (cedula o celular) y un asesor tambien se identifica por celular.';

-- ====== 2. EL FRENO ======
-- No es contra un ataque —aquí solo escriben gente con sesión o Joan con su
-- clave— sino contra un bucle: una pantalla con un fallo puede mandar mil
-- mensajes antes de que nadie lo note, y el plan gratis son 500 MB que al
-- pasarlos dejan la base DE SOLO LECTURA.
create or replace function public.equipo_chat_puede(p_celular text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 30 from public.mensajes_equipo
   where celular = p_celular and creado_en > now() - interval '15 minutes'
$$;
revoke all on function public.equipo_chat_puede(text) from public, anon, authenticated;

-- ====== 3. EL LADO DEL EQUIPO ======
-- Sin un solo parámetro que diga «de quién»: el celular sale de la sesión. La
-- pregunta «el hilo de otro» no tiene dónde escribirse.
create or replace function public.equipo_chat_leer(p_desde bigint default 0)
returns jsonb
language plpgsql
volatile                         -- marca `visto`: escribe
security definer
set search_path = public
as $$
declare cel text; yo public.equipo;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;

  update public.mensajes_equipo set visto = true
   where celular = yo.celular and de = 'jefe' and not visto;

  return jsonb_build_object('ok', true, 'mensajes', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id,
             -- LA TRADUCCION PARA EL PINTOR. Ver la cabecera: la base guarda lo
             -- que las cosas son, chat.js entiende 'socio' y 'panel'.
             'de', case when m.de = 'jefe' then 'panel' else 'socio' end,
             'texto', m.texto, 'visto', m.visto, 'creado_en', m.creado_en) order by m.id)
      from public.mensajes_equipo m
     where m.celular = yo.celular and m.id > coalesce(p_desde, 0)), '[]'::jsonb));
end $$;

create or replace function public.equipo_chat_escribir(p_texto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; txt text; nuevo bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;

  txt := btrim(coalesce(p_texto, ''));
  if length(txt) < 1 or length(txt) > 1000 then
    return jsonb_build_object('ok', false, 'motivo', 'largo');
  end if;
  if not public.equipo_chat_puede(yo.celular) then
    return jsonb_build_object('ok', false, 'motivo', 'muchos');
  end if;

  insert into public.mensajes_equipo (celular, de, texto, visto)
  values (yo.celular, 'miembro', txt, false)
  returning id into nuevo;

  return jsonb_build_object('ok', true, 'id', nuevo);
end $$;

-- ====== 4. EL LADO DE JOAN ======
create or replace function public.equipo_chat_conversaciones(p_clave text)
returns jsonb
language plpgsql
volatile                         -- clave_ok usa una secuencia: escribe
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then raise exception 'clave incorrecta'; end if;

  -- TODO EL EQUIPO, tenga o no mensajes. Una bandeja que solo muestra a quien
  -- ya escribió no sirve para EMPEZAR una conversación, que es justo lo que
  -- pidió Joan: «yo hablar con los asesores».
  --
  -- LOS NOMBRES DE LOS CAMPOS NO SON LIBRES: los espera `listaHTML` de
  -- app/chat.js tal cual — `cedula` es la llave del hilo (aquí, el celular) y
  -- la fecha se llama `ultimo_en`. Con otro nombre la bandeja se pinta igual y
  -- sin hora, que es el peor fallo posible: se ve bien.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'cedula',    e.celular,
             'nombre',    e.nombre,
             'rol',       e.rol,
             'sin_leer',  coalesce(u.sin_leer, 0),
             'ultimo',    u.ultimo,
             'ultimo_de', case when u.ultimo_de = 'jefe' then 'panel' else 'socio' end,
             'ultimo_en', u.ultimo_en)
           -- Primero a quien hay que contestarle, despues lo más reciente, y
           -- los que nunca han escrito al final por nombre. Se ordena por
           -- columnas de verdad: una cadena armada con el contador se rompe en
           -- cuanto alguien tiene diez sin leer («10» cae entre «1» y «2»).
           order by (coalesce(u.sin_leer, 0) > 0) desc,
                    u.ultimo_en desc nulls last,
                    e.nombre)
      from public.equipo e
      left join lateral (
        select count(*) filter (where not m.visto and m.de = 'miembro') as sin_leer,
               (array_agg(m.texto order by m.id desc))[1] as ultimo,
               (array_agg(m.de    order by m.id desc))[1] as ultimo_de,
               max(m.creado_en)                           as ultimo_en
          from public.mensajes_equipo m
         where m.celular = e.celular) u on true
     where e.estado = 'activo'), '[]'::jsonb);
end $$;

create or replace function public.equipo_chat_de(
  p_clave text, p_celular text, p_desde bigint default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare q text;
begin
  if not public.clave_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  q := right(public.solo_digitos(coalesce(p_celular, '')), 10);

  update public.mensajes_equipo set visto = true
   where celular = q and de = 'miembro' and not visto;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id,
             'de', case when m.de = 'jefe' then 'panel' else 'socio' end,
             'texto', m.texto, 'visto', m.visto, 'creado_en', m.creado_en) order by m.id)
      from public.mensajes_equipo m
     where m.celular = q and m.id > coalesce(p_desde, 0)), '[]'::jsonb);
end $$;

create or replace function public.equipo_chat_responder(
  p_clave text, p_celular text, p_texto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare q text; txt text; nuevo bigint;
begin
  if not public.clave_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  q := right(public.solo_digitos(coalesce(p_celular, '')), 10);

  -- SOLO A GENTE DEL EQUIPO. Sin esto, la clave de sincronización serviría para
  -- escribirle a cualquier número de diez dígitos y la tabla se volvería un
  -- buzón abierto con el nombre de Joan encima.
  if not exists (select 1 from public.equipo where celular = q and estado = 'activo') then
    return jsonb_build_object('ok', false, 'motivo', 'ese no es de tu equipo');
  end if;

  txt := btrim(coalesce(p_texto, ''));
  if length(txt) < 1 or length(txt) > 1000 then
    return jsonb_build_object('ok', false, 'motivo', 'largo');
  end if;

  insert into public.mensajes_equipo (celular, de, texto, visto)
  values (q, 'jefe', txt, false)
  returning id into nuevo;

  return jsonb_build_object('ok', true, 'id', nuevo);
end $$;

-- ====== 5. LOS PERMISOS ======
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto, y Supabase se lo concede EXPLÍCITO a anon y authenticated en
-- cada función nueva: se revoca de los tres y se concede lo justo. Un
-- `revoke ... from public` a secas NO cierra nada en Supabase, y eso costó
-- encontrar 28 funciones abiertas el 28 de agosto.
revoke all on function public.equipo_chat_leer(bigint)                from public, anon, authenticated;
grant  execute on function public.equipo_chat_leer(bigint)            to authenticated;
revoke all on function public.equipo_chat_escribir(text)              from public, anon, authenticated;
grant  execute on function public.equipo_chat_escribir(text)          to authenticated;

revoke all on function public.equipo_chat_conversaciones(text)        from public, anon, authenticated;
grant  execute on function public.equipo_chat_conversaciones(text)    to anon;
revoke all on function public.equipo_chat_de(text, text, bigint)      from public, anon, authenticated;
grant  execute on function public.equipo_chat_de(text, text, bigint)  to anon;
revoke all on function public.equipo_chat_responder(text, text, text) from public, anon, authenticated;
grant  execute on function public.equipo_chat_responder(text, text, text) to anon;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, y limpiando con `delete`: una prueba dentro de una migración NO
-- puede terminar en `raise exception`, porque el editor corre el archivo en UNA
-- transacción y eso revertiría también los `create` de arriba.
do $prueba$
declare
  v_clave text;
  v_ase   text := '3009990051';
  v_otro  text := '3009990052';
  j       jsonb;
  pasos   text := '';
begin
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then raise exception 'no hay clave_sync: esto no se comprueba a ciegas'; end if;
  if exists (select 1 from public.equipo where celular in (v_ase, v_otro)) then
    raise exception 'los celulares de prueba son de alguien de verdad';
  end if;

  insert into public.equipo (celular, nombre, rol, estado, jefe)
  values (v_ase,  'Prueba asesor', 'asesor', 'activo', null),
         (v_otro, 'Prueba otro',   'asesor', 'activo', null);

  ---- 1. Joan le escribe.
  j := public.equipo_chat_responder(v_clave, v_ase, 'Hola, como va la cobranza');
  if (j->>'ok') <> 'true' then raise exception 'FALLO 1: Joan no pudo escribir: %', j; end if;
  pasos := pasos || '1 Joan-escribe; ';

  ---- 2. El asesor lo lee, y lo lee TRADUCIDO para el pintor.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_ase || '@tugarantia.net","role":"authenticated"}', true);
  j := public.equipo_chat_leer(0);
  if (j->>'ok') <> 'true' then raise exception 'FALLO 2: el asesor no pudo leer: %', j; end if;
  if (j->'mensajes'->0->>'de') <> 'panel' then
    raise exception 'FALLO 2b: el mensaje de Joan no llega como panel: el pintor lo pondria del lado equivocado: %', j->'mensajes'->0;
  end if;
  pasos := pasos || '2 lo-lee-y-traducido; ';

  ---- 3. Y contesta.
  j := public.equipo_chat_escribir('Vamos bien, dos promesas para manana');
  if (j->>'ok') <> 'true' then raise exception 'FALLO 3: el asesor no pudo contestar: %', j; end if;
  pasos := pasos || '3 contesta; ';

  ---- 4. LO QUE MAS IMPORTA: otro asesor NO ve ese hilo. No hay parametro donde
  ---- pedirlo, asi que se comprueba que su propia lectura salga vacia.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_otro || '@tugarantia.net","role":"authenticated"}', true);
  j := public.equipo_chat_leer(0);
  if jsonb_array_length(coalesce(j->'mensajes', '[]'::jsonb)) <> 0 then
    raise exception 'FALLO 4 GRAVE: un asesor ve el hilo de otro: %', j->'mensajes';
  end if;
  pasos := pasos || '4 nadie-ve-el-hilo-ajeno; ';

  ---- 5. La bandeja de Joan trae a TODO el equipo, tenga o no mensajes: si solo
  ---- trajera a quien ya escribio, no se podria EMPEZAR una conversacion.
  j := public.equipo_chat_conversaciones(v_clave);
  if (select count(*) from jsonb_array_elements(j) e
       where e->>'cedula' in (v_ase, v_otro)) <> 2 then
    raise exception 'FALLO 5: la bandeja no trae a todo el equipo: %', j;
  end if;
  if (select (e->>'sin_leer')::int from jsonb_array_elements(j) e
       where e->>'cedula' = v_ase) <> 1 then
    raise exception 'FALLO 5b: no se cuenta el sin leer del asesor: %', j;
  end if;
  pasos := pasos || '5 la-bandeja-trae-a-todos; ';

  ---- 6. Joan abre el hilo y eso marca lo del asesor como visto.
  j := public.equipo_chat_de(v_clave, v_ase, 0);
  if jsonb_array_length(j) <> 2 then
    raise exception 'FALLO 6: el hilo no trae los dos mensajes: %', j;
  end if;
  j := public.equipo_chat_conversaciones(v_clave);
  if (select (e->>'sin_leer')::int from jsonb_array_elements(j) e
       where e->>'cedula' = v_ase) <> 0 then
    raise exception 'FALLO 6b: abrir el hilo no marco como visto';
  end if;
  pasos := pasos || '6 abrirlo-lo-marca; ';

  ---- 7. Y con la clave NO se le puede escribir a un numero cualquiera: la
  ---- tabla no puede volverse un buzon abierto con el nombre de Joan encima.
  j := public.equipo_chat_responder(v_clave, '3001119999', 'Hola');
  if (j->>'ok') <> 'false' then
    raise exception 'FALLO 7 GRAVE: se le escribio a alguien que no es del equipo: %', j;
  end if;
  pasos := pasos || '7 solo-a-gente-del-equipo; ';

  delete from public.mensajes_equipo where celular in (v_ase, v_otro);
  delete from public.equipo           where celular in (v_ase, v_otro);
  raise notice 'el chat con el equipo: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'mensajes_equipo' and c.relrowsecurity) then
    raise exception 'mensajes_equipo quedo SIN row level security';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mensajes_equipo') then
    raise exception 'mensajes_equipo tiene politicas: se entra solo por las funciones';
  end if;

  -- Lo del equipo se lee SIN parametro de celular: si algun dia se le añade
  -- uno, un asesor podria pedir el hilo de otro.
  if to_regprocedure('public.equipo_chat_leer(bigint)') is null then
    raise exception 'no quedo equipo_chat_leer';
  end if;
  if pg_get_function_identity_arguments(
       to_regprocedure('public.equipo_chat_leer(bigint)')) <> 'bigint' then
    raise exception 'equipo_chat_leer recibe algo mas que el desde: ahi cabe pedir el hilo ajeno';
  end if;

  -- Las dos de sesion, cerradas a anon. Las tres de Joan, abiertas a anon pero
  -- con su reja de clave adentro, como el resto del CRM.
  if has_function_privilege('anon', 'public.equipo_chat_leer(bigint)', 'execute') then
    raise exception 'leer el chat del equipo quedo abierto sin sesion';
  end if;
  if has_function_privilege('anon', 'public.equipo_chat_escribir(text)', 'execute') then
    raise exception 'escribir en el chat del equipo quedo abierto sin sesion';
  end if;
  if not has_function_privilege('anon', 'public.equipo_chat_responder(text, text, text)', 'execute') then
    raise exception 'el CRM no puede contestarle al equipo';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'equipo_chat_responder' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  if cuerpo not like '%from public.equipo where celular = q and estado = ''activo''%' then
    raise exception 'se le puede escribir a cualquier numero: la tabla seria un buzon abierto';
  end if;
end $$;
