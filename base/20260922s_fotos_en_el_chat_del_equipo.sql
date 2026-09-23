-- 22-sep-2026 — FOTOS EN EL CHAT CON EL EQUIPO
--
-- Joan: «agrega las fotos al chat del crm».
--
-- La migración de hace un rato (20260922r) dejó dicho que el chat del equipo NO
-- llevaba fotos y por qué: «eso pide su tabla, su tope y su cortacircuito».
-- Aquí están las tres.
--
-- ===========================================================================
-- SE COPIA LO QUE YA SE APRENDIÓ HOY, Y ESO ES LO IMPORTANTE
--
-- El chat con los clientes tuvo fotos esta misma tarde, y en el camino salieron
-- cuatro cosas que costaron caro. Las cuatro entran aquí desde el primer día:
--
-- 1. LA FUENTE SE COMPRUEBA ENTERA, de la primera letra a la última. El primer
--    CHECK solo exigía que la cadena EMPEZARA por `data:image/`, y eso dejaba
--    pasar `data:image/png;base64,AAAA" onerror="…`. Con esa cadena metida en
--    un atributo, el guión corría dentro del CRM y se llevaba la clave de
--    sincronización de Joan. Aquí el ancla del final va desde el principio.
-- 2. LA MINIATURA TAMBIÉN. Era la puerta por donde iba el cebo: sin miniatura
--    la burbuja sale como «un adjunto que no cargó», que es lo que invita a
--    tocarla.
-- 3. EL TOPE LLEVA VENTANA. Un tope sin fecha es un callejón sin salida: el
--    mensaje 61 no entra nunca más.
-- 4. Y HAY CORTACIRCUITO. Todos los topes son por persona, y un tope por
--    persona protege de UNA persona. El plan gratis son 500 MB y al pasarlos la
--    base entera queda DE SOLO LECTURA: no se desembolsa, no se cobra, no se
--    contesta nada. No llega una factura — deja de funcionar.
--
-- ===========================================================================
-- EL REPARTO DE LOS 500 MB, DICHO EN UN SITIO
--
--   · `chat_fotos`       150 MB  (las de los clientes, 20260922j)
--   · `fotos_equipo`      50 MB  (estas)
--   · `registro_en_vivo`  20 MB  (20260922f corregida)
--   ---------------------------------------------------------------
--   quedan ~280 MB para lo único que no se puede parar nunca: los créditos,
--   los pagos y las fichas.
--
-- 50 MB dan para unas 680 fotos de verdad. Con cinco personas en el equipo son
-- 136 cada una, y esto es un chat de trabajo, no un álbum.
--
-- ===========================================================================
-- Y EL VIDEO SIGUE FUERA, por el mismo número de siempre: una foto comprimida
-- como las comprime esta casa son 73 KB y un video de diez segundos son 15 a 21
-- MB. Con video, 25 archivos EN TOTAL llenarían lo de arriba.

-- ====== 1. LA TABLA ======
-- Cuelga del MENSAJE, no del celular: así `delete from mensajes_equipo` se
-- lleva las fotos sin que nadie tenga que acordarse de borrar en dos sitios.
create table if not exists public.fotos_equipo (
  id         bigint generated always as identity primary key,
  mensaje_id bigint      not null references public.mensajes_equipo(id) on delete cascade,
  miniatura  text,
  imagen     text        not null,
  creado_en  timestamptz not null default now()
);
alter table public.fotos_equipo enable row level security;
create index if not exists fotos_equipo_por_mensaje on public.fotos_equipo (mensaje_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_equipo_imagen_entera') then
    alter table public.fotos_equipo
      add constraint fotos_equipo_imagen_entera
      -- LA FORMA ENTERA. El ancla del final vale tanto como la del principio:
      -- sin ella, «empieza bien» es todo lo que se pide y detrás cabe una
      -- comilla que se sale del atributo donde la foto se pinta.
      -- En PostgreSQL `~` no es sensible a saltos de línea por defecto, así que
      -- `^…$` sujeta la cadena completa, y la clase de caracteres no admite ni
      -- espacios ni comillas ni saltos.
      check (
            imagen ~ '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$'
        and length(imagen) between 100 and 400000
        and (miniatura is null
             or (miniatura ~ '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$'
                 and length(miniatura) <= 30000))
      );
  end if;
end $$;

comment on table public.fotos_equipo is
  'Fotos del chat entre Joan y su equipo. Cuelgan del mensaje con on delete cascade. El video se rechaza en el CHECK: una pantalla se cambia, esto no.';

-- ====== 2. EL LADO DEL EQUIPO ======
create or replace function public.equipo_foto_escribir(
  p_imagen text, p_miniatura text default null, p_texto text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cel     text;
  yo      public.equipo;
  mini    text;
  cuantas integer;
  nuevo   bigint;
  -- LA MISMA FRASE que aplica el CHECK de la tabla y la misma que aplica la
  -- pantalla al pintarla. Tres sitios, una regla: dos definiciones de lo mismo
  -- son una que se queda atrás, y eso ya pasó hoy con la miniatura.
  buena   constant text := '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$';
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;

  -- EL CORTACIRCUITO, lo primero: es lo único que protege del total.
  if pg_total_relation_size('public.fotos_equipo') > 50 * 1024 * 1024 then
    return jsonb_build_object('ok', false, 'motivo', 'lleno');
  end if;

  if p_imagen is null or p_imagen !~ buena then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;
  if length(p_imagen) > 400000 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_grande');
  end if;
  if length(p_imagen) < 100 then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;

  mini := nullif(p_miniatura, '');
  if mini is not null and (mini !~ buena or length(mini) > 30000) then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;

  if not public.equipo_chat_puede(yo.celular) then
    return jsonb_build_object('ok', false, 'motivo', 'muchos');
  end if;

  -- EL TOPE, CON SU VENTANA. Sin la ventana sería perpetuo: la foto 61 no
  -- entraría nunca más, y la única salida sería borrar la conversación entera.
  select count(*) into cuantas
    from public.fotos_equipo f
    join public.mensajes_equipo m on m.id = f.mensaje_id
   where m.celular = yo.celular
     and f.creado_en > now() - interval '30 days';
  if cuantas >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'tope', 'tope', 60);
  end if;

  insert into public.mensajes_equipo (celular, de, texto, visto)
  values (yo.celular, 'miembro',
          left(coalesce(nullif(btrim(coalesce(p_texto, '')), ''), 'Foto'), 1000), false)
  returning id into nuevo;

  insert into public.fotos_equipo (mensaje_id, miniatura, imagen)
  values (nuevo, mini, p_imagen);

  return jsonb_build_object('ok', true, 'id', nuevo);
end $$;

-- La grande, SOLO la suya. El id es correlativo: sin esta reja, cualquiera con
-- sesión pide la 1, la 2, la 3 y se baja lo que le mandaron a sus compañeros.
create or replace function public.equipo_foto_ver(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; yo public.equipo; img text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10);
  if not found or yo.estado <> 'activo' then return jsonb_build_object('ok', false); end if;

  select f.imagen into img
    from public.fotos_equipo f
    join public.mensajes_equipo m on m.id = f.mensaje_id
   where f.id = p_id and m.celular = yo.celular;

  if img is null then return jsonb_build_object('ok', false, 'motivo', 'no es tuya'); end if;
  return jsonb_build_object('ok', true, 'imagen', img);
end $$;

-- ====== 3. EL LADO DE JOAN ======
create or replace function public.equipo_foto_responder(
  p_clave text, p_celular text, p_imagen text,
  p_miniatura text default null, p_texto text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  q       text;
  mini    text;
  nuevo   bigint;
  buena   constant text := '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$';
begin
  if not public.clave_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  q := right(public.solo_digitos(coalesce(p_celular, '')), 10);

  if not exists (select 1 from public.equipo where celular = q and estado = 'activo') then
    return jsonb_build_object('ok', false, 'motivo', 'ese no es de tu equipo');
  end if;

  if pg_total_relation_size('public.fotos_equipo') > 50 * 1024 * 1024 then
    return jsonb_build_object('ok', false, 'motivo', 'lleno');
  end if;

  if p_imagen is null or p_imagen !~ buena
     or length(p_imagen) < 100 or length(p_imagen) > 400000 then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;
  mini := nullif(p_miniatura, '');
  if mini is not null and (mini !~ buena or length(mini) > 30000) then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;

  insert into public.mensajes_equipo (celular, de, texto, visto)
  values (q, 'jefe',
          left(coalesce(nullif(btrim(coalesce(p_texto, '')), ''), 'Foto'), 1000), false)
  returning id into nuevo;

  insert into public.fotos_equipo (mensaje_id, miniatura, imagen)
  values (nuevo, mini, p_imagen);

  return jsonb_build_object('ok', true, 'id', nuevo);
end $$;

create or replace function public.equipo_foto_panel(p_clave text, p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare img text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave incorrecta';
  end if;
  select imagen into img from public.fotos_equipo where id = p_id;
  if img is null then return jsonb_build_object('ok', false, 'motivo', 'no existe'); end if;
  return jsonb_build_object('ok', true, 'imagen', img);
end $$;

-- ====== 4. QUE EL HILO LAS ENSEÑE ======
-- El hilo trae el id y la MINIATURA, nunca la imagen: veinte mensajes con foto
-- serían dos megas en cada apertura. La grande se pide al tocarla.
--
-- No se copian cuerpos: se leen de la base y se les cambia lo justo.
do $$
declare
  f     text;
  src   text;
  nueva text;
  n     int := 0;
begin
  foreach f in array array['equipo_chat_leer', 'equipo_chat_de'] loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p
     where p.proname = f and p.pronamespace = 'public'::regnamespace;
    if src is null then raise exception 'no existe public.%', f; end if;

    if position('fo.miniatura' in src) > 0 then
      continue;                         -- ya lo trae
    end if;

    -- (a) el join con las fotos
    nueva := replace(src,
      'from public.mensajes_equipo m',
      'from public.mensajes_equipo m' || E'\n      left join public.fotos_equipo fo on fo.mensaje_id = m.id');
    if nueva = src then raise exception 'no se encontro el from de %', f; end if;
    src := nueva;

    -- (b) y los dos campos, en el objeto que se devuelve
    nueva := replace(src,
      '''texto'', m.texto, ''visto'', m.visto, ''creado_en'', m.creado_en)',
      '''texto'', m.texto, ''visto'', m.visto, ''creado_en'', m.creado_en,' ||
      E'\n             ''foto'', fo.id, ''miniatura'', fo.miniatura)');
    if nueva = src then raise exception 'no se encontro el objeto de %', f; end if;

    execute nueva;
    n := n + 1;
  end loop;
  raise notice 'hilos con foto: % de 2', n;
end $$;

-- ====== 5. LOS PERMISOS ======
revoke all on function public.equipo_foto_escribir(text, text, text)          from public, anon, authenticated;
grant  execute on function public.equipo_foto_escribir(text, text, text)      to authenticated;
revoke all on function public.equipo_foto_ver(bigint)                         from public, anon, authenticated;
grant  execute on function public.equipo_foto_ver(bigint)                     to authenticated;

revoke all on function public.equipo_foto_responder(text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.equipo_foto_responder(text, text, text, text, text) to anon;
revoke all on function public.equipo_foto_panel(text, bigint)                 from public, anon, authenticated;
grant  execute on function public.equipo_foto_panel(text, bigint)             to anon;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
do $prueba$
declare
  v_clave text;
  v_ase   text := '3009990061';
  v_otro  text := '3009990062';
  img     text := 'data:image/jpeg;base64,' || repeat('A', 500);
  mini    text := 'data:image/jpeg;base64,' || repeat('B', 100);
  j       jsonb;
  idf     bigint;
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

  ---- 1. El asesor manda una foto, con su pie.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_ase || '@tugarantia.net","role":"authenticated"}', true);
  j := public.equipo_foto_escribir(img, mini, 'Ahi va el comprobante');
  if (j->>'ok') <> 'true' then raise exception 'FALLO 1: no entro: %', j; end if;
  pasos := pasos || '1 entra; ';

  ---- 2. Y el hilo la enseña: trae el id y la miniatura, NO la imagen.
  j := public.equipo_chat_leer(0);
  if (j->'mensajes'->0->>'foto') is null then
    raise exception 'FALLO 2: el hilo no dice que ese mensaje trae foto: %', j;
  end if;
  if (j->'mensajes'->0->>'miniatura') is null then
    raise exception 'FALLO 2b: no viaja la miniatura: el hilo saldria sin nada que ver';
  end if;
  if j::text like '%' || repeat('A', 100) || '%' then
    raise exception 'FALLO 2c GRAVE: la imagen ENTERA viaja en el hilo: dos megas por apertura';
  end if;
  idf := (j->'mensajes'->0->>'foto')::bigint;
  pasos := pasos || '2 el-hilo-la-ensena-sin-bajarla; ';

  ---- 3. La grande, solo al abrirla.
  j := public.equipo_foto_ver(idf);
  if (j->>'ok') <> 'true' or (j->>'imagen') is null then
    raise exception 'FALLO 3: no se puede abrir la propia: %', j;
  end if;
  pasos := pasos || '3 se-abre; ';

  ---- 4. Y NO la de un companiero. El id es correlativo: sin esta reja,
  ---- cualquiera con sesion se baja lo que le mandaron a los demas.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_otro || '@tugarantia.net","role":"authenticated"}', true);
  j := public.equipo_foto_ver(idf);
  if (j->>'ok') <> 'false' then
    raise exception 'FALLO 4 GRAVE: un asesor abrio la foto de otro: %', j;
  end if;
  pasos := pasos || '4 nadie-ve-la-ajena; ';

  ---- 5. Joan si, con su clave, y tambien puede mandar.
  j := public.equipo_foto_panel(v_clave, idf);
  if (j->>'ok') <> 'true' then raise exception 'FALLO 5: Joan no puede verla: %', j; end if;
  j := public.equipo_foto_responder(v_clave, v_ase, img, mini, 'Recibido');
  if (j->>'ok') <> 'true' then raise exception 'FALLO 5b: Joan no pudo mandar: %', j; end if;
  pasos := pasos || '5 Joan-la-ve-y-manda; ';

  ---- 6. NI VIDEO NI GIGANTE NI LA FUENTE ENVENENADA. Los tres, que son los
  ---- tres que costaron caro esta tarde en el chat de los clientes.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_ase || '@tugarantia.net","role":"authenticated"}', true);
  j := public.equipo_foto_escribir('data:video/mp4;base64,' || repeat('A', 200), null, null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 6: entro un video: %', j;
  end if;
  j := public.equipo_foto_escribir('data:image/jpeg;base64,' || repeat('C', 500000), null, null);
  if (j->>'motivo') <> 'muy_grande' then
    raise exception 'FALLO 6b: entro una imagen de medio mega: %', j;
  end if;
  j := public.equipo_foto_escribir('data:image/png;base64,AAAA" onerror="' || repeat('x', 200), null, null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 6c GRAVE: entro una fuente que se sale del atributo: %', j;
  end if;
  j := public.equipo_foto_escribir(img, 'data:image/png;base64,AA"><script>x</script>', null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 6d GRAVE: entro una miniatura envenenada: %', j;
  end if;
  pasos := pasos || '6 ni-video-ni-gigante-ni-envenenada; ';

  ---- 7. Y borrar la conversacion se lleva las fotos. Es la promesa del
  ---- esquema, y la cumple el cascade sin que nadie se acuerde.
  delete from public.mensajes_equipo where celular = v_ase;
  if exists (select 1 from public.fotos_equipo where id = idf) then
    raise exception 'FALLO 7 GRAVE: se borro la conversacion y la foto quedo huerfana';
  end if;
  pasos := pasos || '7 el-cascade-se-las-lleva; ';

  delete from public.mensajes_equipo where celular in (v_ase, v_otro);
  delete from public.equipo           where celular in (v_ase, v_otro);
  raise notice 'fotos en el chat del equipo: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'fotos_equipo' and c.relrowsecurity) then
    raise exception 'fotos_equipo quedo SIN row level security';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fotos_equipo') then
    raise exception 'fotos_equipo tiene politicas: se entra solo por las funciones';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fotos_equipo'::regclass and contype = 'f' and confdeltype = 'c') then
    raise exception 'fotos_equipo no cuelga del mensaje con on delete cascade';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'equipo_foto_ver' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%m.celular = yo.celular%' then
    raise exception 'equipo_foto_ver no comprueba de quien es: el id es correlativo';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'equipo_chat_leer' and pronamespace = 'public'::regnamespace;
  if cuerpo like '%fo.imagen%' then
    raise exception 'el hilo baja la imagen entera en cada apertura';
  end if;
  if cuerpo not like '%fo.miniatura%' then
    raise exception 'el hilo no trae la miniatura: saldria un adjunto sin nada que ver';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'equipo_foto_escribir' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  if cuerpo not like '%pg_total_relation_size%' then
    raise exception 'se fue el cortacircuito: las fotos del equipo pueden llenar la base';
  end if;
  if cuerpo not like '%30 days%' then
    raise exception 'el tope volvio a ser perpetuo';
  end if;
  if cuerpo not like '%p_imagen !~ buena%' then
    raise exception 'la fuente vuelve a comprobarse solo por el principio';
  end if;

  if has_function_privilege('anon', 'public.equipo_foto_escribir(text, text, text)', 'execute') then
    raise exception 'mandar fotas al equipo quedo abierto sin sesion';
  end if;
  if has_function_privilege('anon', 'public.equipo_foto_ver(bigint)', 'execute') then
    raise exception 'ver las fotos del equipo quedo abierto sin sesion';
  end if;
end $$;
