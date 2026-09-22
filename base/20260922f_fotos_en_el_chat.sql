-- 22-sep-2026 — FOTOS EN EL CHAT
--
-- Joan: «este chat tambien quiero que se puedan enviar imagenes y videos».
--
-- ============================ FOTOS SÍ, VIDEO NO ============================
--
-- Y el número que decide, medido y no opinado:
--
--   una foto comprimida como las comprime esta casa (900 px, calidad 0,6)
--     = 100.023 caracteres en base64 = 73 KB de JPEG
--   un video de 10 segundos de un celular normal (1080p30)
--     = 15 a 21 MB, o sea 20 a 28 MB en base64
--
-- El plan gratis de Supabase tiene 500 MB de base, y al pasarlos la base entera
-- se vuelve DE SOLO LECTURA. No llega una factura: deja de poderse desembolsar,
-- cobrar y contestar el chat.
--
--   con video:  500 MB / 20 MB  =  25 videos EN TOTAL, para siempre
--   con fotos:  500 MB / 106 KB =  unas 4.700 fotos
--
-- Además el navegador NO puede recomprimir video (no hay equivalente de
-- toDataURL; haría falta ffmpeg.wasm, 25 MB de descarga), así que subiría lo
-- que grabó el teléfono tal cual, por una llamada RPC sin barra de progreso y
-- con un statement_timeout de 8 segundos detrás.
--
-- Y en todo el repo no hay una sola línea que pida video. Lo que sí se pide,
-- por nombre y tres veces, es la FOTO DEL COMPROBANTE DE PAGO. Eso es lo que se
-- construye. Hay un freno abajo que RECHAZA cualquier cosa que no sea imagen,
-- para que esta decisión no se deshaga por descuido.
--
-- ========================= POR QUÉ UNA TABLA APARTE =========================
--
-- `mensajes.texto` tiene un CHECK duro: entre 1 y 1.000 caracteres. Una foto
-- son cien mil. No es que quepa apretando: no cabe por un factor de cien. Así
-- que la foto va en su propia tabla, COLGADA DEL MENSAJE con
-- `on delete cascade`.
--
-- Ese cascade no es un detalle de esquema: es lo que hace que `chat_olvidar`
-- —que ya existe y borra la conversación entera porque la política de datos se
-- lo promete al socio (Ley 1581)— se lleve también las fotos, sin que nadie
-- tenga que acordarse. Si la tabla colgara de la cédula en vez del mensaje,
-- borrar la conversación dejaría las fotos huérfanas y la promesa incumplida.
--
-- ===================== DOS TAMAÑOS, Y POR QUÉ =====================
--
-- `miniatura` viaja SIEMPRE con el hilo y `imagen` solo cuando alguien la abre.
-- Sin esa separación, leer una conversación de veinte mensajes con fotos
-- bajaría dos megas cada vez que se abre, en el celular del cliente y con sus
-- datos. La miniatura la hace el teléfono al tomar la foto (unos 6 KB); si por
-- lo que sea no llegara, el hilo enseña un adjunto que se puede abrir igual.

-- ===================== 1. LA TABLA =====================

create table if not exists public.chat_fotos (
  id         bigint generated always as identity primary key,
  -- Colgada del MENSAJE, no de la cédula: ver la cabecera.
  mensaje_id bigint      not null references public.mensajes(id) on delete cascade,
  miniatura  text,
  imagen     text        not null,
  creado_en  timestamptz not null default now()
);

create index if not exists chat_fotos_por_mensaje on public.chat_fotos (mensaje_id);

-- RLS SIN NINGUNA POLÍTICA, como el resto de lo sensible de esta casa: la llave
-- pública no puede leer ni escribir la tabla ni por error. Se entra solo por
-- las funciones, que corren como dueñas y comprueban de quién es cada foto.
alter table public.chat_fotos enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chat_fotos_solo_imagen') then
    alter table public.chat_fotos
      add constraint chat_fotos_solo_imagen
      -- EL FRENO DEL VIDEO, en la base y no en la pantalla. Una pantalla se
      -- cambia; esto no deja pasar un video aunque alguien reescriba la app.
      check (imagen like 'data:image/%'
         and length(imagen) between 100 and 400000
         and (miniatura is null or (miniatura like 'data:image/%' and length(miniatura) <= 30000)));
  end if;
end $$;

-- ===================== 2. EL CLIENTE MANDA UNA FOTO =====================

create or replace function public.chat_foto_sesion(
  p_canal     text,
  p_imagen    text,
  p_miniatura text default null,
  p_texto     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel     text;
  llave   text;
  v_canal text;
  txt     text;
  cuantas integer;
  nuevo   bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  llave := public.llave_de_sesion(cel);

  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else 'servicio' end;

  if p_imagen is null or p_imagen not like 'data:image/%' then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;
  if length(p_imagen) > 400000 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_grande');
  end if;

  -- El mismo freno que los mensajes de texto: una foto cuesta mil veces más que
  -- un mensaje, así que con más razón.
  if not public.chat_puede_escribir(llave) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  -- EL TOPE POR CONVERSACIÓN. Sin esto, un solo cliente puede llenar la base
  -- hasta dejarla de solo lectura, y entonces NADIE puede desembolsar ni
  -- cobrar. Se rechaza diciendo por qué, no se borra la más vieja en silencio:
  -- un comprobante que desaparece es peor que un comprobante que no entra.
  select count(*) into cuantas
    from public.chat_fotos f
    join public.mensajes m on m.id = f.mensaje_id
   where m.cedula = llave;
  if cuantas >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'tope', 'tope', 60);
  end if;

  -- El mensaje que sostiene la foto. Lleva el pie que escriba la persona, o una
  -- palabra: `texto` es NOT NULL y tiene su propio mínimo de 1 carácter.
  txt := nullif(btrim(coalesce(p_texto, '')), '');
  txt := left(coalesce(txt, 'Foto'), 1000);

  insert into public.mensajes (cedula, de, texto, canal)
       values (llave, 'socio', txt, v_canal)
    returning id into nuevo;

  insert into public.chat_fotos (mensaje_id, miniatura, imagen)
       values (nuevo, nullif(p_miniatura, ''), p_imagen);

  return jsonb_build_object('ok', true, 'id', nuevo);
end
$$;

-- ===================== 3. LA FOTO ENTERA, CUANDO SE ABRE =====================

-- Dos funciones y no una con doble llave: cada una comprueba lo suyo y se lee
-- de un vistazo a quién deja entrar. Una sola con «o la sesión o la clave»
-- es donde se cuelan los permisos.

create or replace function public.chat_foto_sesion_ver(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; llave text; img text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  llave := public.llave_de_sesion(cel);

  -- SOLO LAS SUYAS. El id es un número correlativo, así que sin esta
  -- comprobación cualquiera con sesión podría pedir la 1, la 2, la 3 y bajarse
  -- los comprobantes de todos los clientes de Joan.
  select f.imagen into img
    from public.chat_fotos f
    join public.mensajes m on m.id = f.mensaje_id
   where f.id = p_id and m.cedula = llave;

  if img is null then return jsonb_build_object('ok', false, 'motivo', 'no es tuya'); end if;
  return jsonb_build_object('ok', true, 'imagen', img);
end
$$;

create or replace function public.chat_foto_panel(p_clave text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare img text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave incorrecta';
  end if;
  select imagen into img from public.chat_fotos where id = p_id;
  if img is null then return jsonb_build_object('ok', false, 'motivo', 'no existe'); end if;
  return jsonb_build_object('ok', true, 'imagen', img);
end
$$;

-- ===================== 4. EL HILO DICE QUÉ MENSAJES TRAEN FOTO ==============

-- Se reescriben las dos lectoras para que cada mensaje traiga `foto` (su id) y
-- `miniatura`. La imagen entera NO viaja aquí: un hilo de veinte mensajes con
-- fotos serían dos megas en cada apertura, en el celular del cliente.

create or replace function public.chat_leer_sesion(p_canal text, p_desde bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; llave text; v_canal text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  llave := public.llave_de_sesion(cel);
  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else 'servicio' end;

  update public.mensajes set visto = true
   where cedula = llave and canal = v_canal and de <> 'socio' and not visto;

  return jsonb_build_object('ok', true, 'canal', v_canal, 'mensajes', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'de', m.de, 'texto', m.texto, 'regla', m.regla,
             'visto', m.visto, 'creado_en', m.creado_en,
             'foto', f.id, 'miniatura', f.miniatura) order by m.id)
      from public.mensajes m
      left join public.chat_fotos f on f.mensaje_id = m.id
     where m.cedula = llave and m.canal = v_canal
       and m.id > coalesce(p_desde, 0)), '[]'::jsonb));
end
$$;

create or replace function public.chat_de(
  p_clave text, p_cedula text, p_desde bigint default 0, p_canal text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare ced text; v_canal text; salida jsonb;
begin
  if not public.clave_ok(p_clave) then
    raise exception 'clave incorrecta';
  end if;

  ced := public.solo_digitos(p_cedula);
  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else null end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'de', m.de, 'texto', m.texto, 'canal', m.canal,
           'regla', m.regla, 'visto', m.visto, 'creado_en', m.creado_en,
           'foto', f.id, 'miniatura', f.miniatura
         ) order by m.id), '[]'::jsonb)
    into salida
    from public.mensajes m
    left join public.chat_fotos f on f.mensaje_id = m.id
   where m.cedula = ced
     and m.id > coalesce(p_desde, 0)
     and (v_canal is null or m.canal = v_canal);

  update public.mensajes
     set visto = true
   where cedula = ced and de = 'socio' and not visto
     and (v_canal is null or canal = v_canal);

  return salida;
end
$$;

-- ===================== 5. PERMISOS =====================

revoke all on function public.chat_foto_sesion(text, text, text, text)     from public, anon, authenticated;
grant  execute on function public.chat_foto_sesion(text, text, text, text) to authenticated;
revoke all on function public.chat_foto_sesion_ver(bigint)                 from public, anon, authenticated;
grant  execute on function public.chat_foto_sesion_ver(bigint)             to authenticated;
revoke all on function public.chat_foto_panel(text, bigint)                from public, anon, authenticated;
grant  execute on function public.chat_foto_panel(text, bigint)            to anon;
revoke all on function public.chat_leer_sesion(text, bigint)               from public, anon, authenticated;
grant  execute on function public.chat_leer_sesion(text, bigint)           to authenticated;
revoke all on function public.chat_de(text, text, bigint, text)            from public, anon, authenticated;
grant  execute on function public.chat_de(text, text, bigint, text)        to anon;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, y limpiando lo suyo al final: una prueba dentro de una migración no
-- puede deshacerse con una excepción, porque el editor corre el archivo en UNA
-- transacción y eso revertiría también los create de arriba. Costó un intento
-- aprenderlo esta misma tarde.
do $prueba$
declare
  cel     text := '3009998844';
  v_clave text;
  img     text := 'data:image/jpeg;base64,' || repeat('A', 500);
  mini    text := 'data:image/jpeg;base64,' || repeat('B', 100);
  j       jsonb;
  idf     bigint;
  pasos   text := '';
begin
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then raise exception 'no hay clave_sync: esto no se comprueba a ciegas'; end if;

  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);

  ---- Una foto entra, con su pie.
  j := public.chat_foto_sesion('cobranza', img, mini, 'Ahi va el comprobante');
  if (j->>'ok') <> 'true' then raise exception 'FALLO 1: %', j; end if;
  pasos := pasos || '1 entra; ';

  ---- Y el hilo la enseña: trae el id de la foto y la miniatura, NO la imagen.
  j := public.chat_leer_sesion('cobranza', 0);
  if (j->'mensajes'->0->>'foto') is null then
    raise exception 'FALLO 2: el hilo no dice que ese mensaje trae foto: %', j;
  end if;
  if (j->'mensajes'->0->>'miniatura') is null then
    raise exception 'FALLO 2b: no viaja la miniatura, el hilo saldria sin nada que ver';
  end if;
  if j::text like '%' || repeat('A', 100) || '%' then
    raise exception 'FALLO 2c GRAVE: la imagen ENTERA viaja en el hilo: dos megas por apertura';
  end if;
  idf := (j->'mensajes'->0->>'foto')::bigint;
  pasos := pasos || '2 el-hilo-la-enseña-sin-bajarla; ';

  ---- La imagen entera, solo cuando se abre.
  j := public.chat_foto_sesion_ver(idf);
  if (j->>'ok') <> 'true' or (j->>'imagen') is null then
    raise exception 'FALLO 3: no se puede abrir la foto propia: %', j;
  end if;
  pasos := pasos || '3 se-abre; ';

  ---- Y NO la de otro. El id es correlativo: sin esta reja, cualquiera con
  ---- sesion se baja los comprobantes de todos los clientes de Joan.
  perform set_config('request.jwt.claims',
    '{"email":"573009998833@tugarantia.net","role":"authenticated"}', true);
  j := public.chat_foto_sesion_ver(idf);
  if (j->>'ok') <> 'false' then
    raise exception 'FALLO 4 GRAVE: otro cliente se bajo una foto ajena: %', j;
  end if;
  pasos := pasos || '4 nadie-ve-la-ajena; ';

  ---- Joan si, con su clave.
  j := public.chat_foto_panel(v_clave, idf);
  if (j->>'ok') <> 'true' then raise exception 'FALLO 5: Joan no puede verla: %', j; end if;
  begin
    perform public.chat_foto_panel('clave-que-no-es', idf);
    raise exception 'FALLO 5b GRAVE: se vio una foto SIN la clave';
  exception when others then
    if sqlerrm like 'FALLO 5b%' then raise; end if;
  end;
  pasos := pasos || '5 Joan-si-con-su-clave; ';

  ---- EL VIDEO NO ENTRA, y el freno esta en la BASE y no en la pantalla.
  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);
  j := public.chat_foto_sesion('servicio', 'data:video/mp4;base64,AAAA', null, null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 6: entro un video: 25 de esos dejan la base de solo lectura: %', j;
  end if;
  j := public.chat_foto_sesion('servicio', 'data:image/jpeg;base64,' || repeat('C', 500000), null, null);
  if (j->>'motivo') <> 'muy_grande' then
    raise exception 'FALLO 6b: entro una imagen de medio mega: %', j;
  end if;
  pasos := pasos || '6 ni-video-ni-gigante; ';

  ---- Y BORRAR LA CONVERSACION SE LLEVA LAS FOTOS. Es la promesa de la politica
  ---- de datos (Ley 1581) y aqui la cumple el cascade, sin que nadie se acuerde.
  delete from public.mensajes where cedula = cel;
  if exists (select 1 from public.chat_fotos where id = idf) then
    raise exception 'FALLO 7 GRAVE: se borro la conversacion y la foto quedo huerfana';
  end if;
  pasos := pasos || '7 borrar-el-chat-se-lleva-las-fotos; ';

  raise notice 'fotos en el chat: %', pasos;
end
$prueba$;

do $$
declare cuerpo text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'chat_fotos' and c.relrowsecurity) then
    raise exception 'chat_fotos quedo SIN row level security';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_fotos') then
    raise exception 'chat_fotos tiene politicas: se entra solo por las funciones';
  end if;

  -- El cascade, que es lo que cumple la promesa de borrado sin que nadie se
  -- acuerde de borrar dos sitios.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.chat_fotos'::regclass and contype = 'f' and confdeltype = 'c') then
    raise exception 'chat_fotos no cuelga del mensaje con on delete cascade: borrar la conversacion dejaria las fotos';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'chat_foto_sesion_ver' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%m.cedula = llave%' then
    raise exception 'chat_foto_sesion_ver no comprueba de quien es la foto: el id es correlativo';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'chat_leer_sesion' and pronamespace = 'public'::regnamespace;
  if cuerpo like '%f.imagen%' then
    raise exception 'el hilo baja la imagen entera en cada apertura';
  end if;
  if cuerpo not like '%f.miniatura%' then
    raise exception 'el hilo no trae la miniatura: saldria un adjunto sin nada que ver';
  end if;

  if has_function_privilege('anon', 'public.chat_foto_sesion(text, text, text, text)', 'execute') then
    raise exception 'mandar fotos quedo abierto sin sesion';
  end if;
  if has_function_privilege('anon', 'public.chat_foto_sesion_ver(bigint)', 'execute') then
    raise exception 'ver fotos quedo abierto sin sesion';
  end if;
  if not has_function_privilege('anon', 'public.chat_foto_panel(text, bigint)', 'execute') then
    raise exception 'el CRM no puede ver las fotos';
  end if;
end $$;
