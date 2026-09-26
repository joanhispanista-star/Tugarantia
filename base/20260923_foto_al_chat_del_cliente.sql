-- ===========================================================================
-- LA FOTO DEL COMPROBANTE, AL CHAT DEL CLIENTE
-- 23 de septiembre de 2026
--
-- Joan cobra en la calle y quiere dejarle al cliente la foto del recibo. Hasta
-- hoy no se podía desde ningún lado: el chat con clientes tiene `chat_foto_sesion`
-- (el cliente manda) y `chat_foto_panel` (Joan mira), pero NO había forma de que
-- Joan mandara una foto. El chat del EQUIPO sí la tiene —`equipo_foto_responder`—
-- y este archivo trae la que faltaba en el de clientes, calcada de esa.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ POR EL CHAT Y NO COLGADA DEL CRÉDITO
--
-- Porque `sinFotos` (panel/nube.js) quita la foto de un comprobante de la
-- sincronización A PROPÓSITO: pesan en base64 y la cartera viaja entera. Una
-- foto tomada en el teléfono y guardada dentro del crédito se quedaría en ESE
-- teléfono y desaparecería al resembrar el espejo — sin error y sin aviso.
--
-- El chat ya tiene el transporte resuelto: su tabla, su tope, su cortacircuito y
-- su trozo de los 500 MB. Y encima es donde el cliente va a buscarlo. La foto no
-- queda colgada del crédito, y eso está dicho en la pantalla: es el precio de no
-- inventar un segundo transporte para lo mismo.
--
-- ---------------------------------------------------------------------------
-- NO SE DUPLICA LA LÓGICA DEL CANAL
--
-- El mensaje lo inserta `chat_responder`, que ya sabe elegir canal (el que pide
-- Joan, si no el del último mensaje del cliente, si no 'servicio'). Copiar esas
-- tres reglas acá sería tener dos verdades sobre dónde cae una respuesta, y la
-- que se quedara vieja no avisaría.
--
-- ---------------------------------------------------------------------------
-- LO QUE SE COMPRUEBA, Y POR QUÉ ES LO MISMO QUE EN EL OTRO LADO
--
-- La fuente se valida ENTERA con el regex anclado, imagen y miniatura. El 22-sep
-- un CHECK que solo miraba el principio dejó pasar
-- `data:image/png;base64,AAAA" onerror="…`, y con eso el guión corría dentro del
-- Panel y se llevaba la clave de sincronización. Da igual que acá la foto la
-- ponga Joan: la reja se mantiene en los dos lados, porque una defensa que solo
-- existe en uno deja de existir el día que alguien mueve el otro.
--
-- Cortacircuito a 150 MB, que es el trozo de `chat_fotos` en el reparto escrito:
--   chat_fotos        150 MB
--   fotos_equipo       50 MB
--   registro_en_vivo   20 MB
--   el resto (~280 MB) para créditos, pagos y fichas.
-- Pasado ese tamaño la base entera se vuelve de SOLO LECTURA en el plan gratis,
-- sin factura y sin aviso: deja de guardarse un cobro, no una foto.
--
-- NO lleva tope por persona, a diferencia de `chat_foto_sesion`. Ese tope
-- protege de un cliente que suba sesenta fotos; acá quien manda es Joan, y un
-- tope que frena al dueño en mitad de un cobro estorba más de lo que protege.
-- El cortacircuito sí lo cubre, que es lo que de verdad importa.
--
-- CÓMO APLICARLO: pegar este archivo entero en el editor SQL de Supabase. Corre
-- en UNA transacción, así que la autocomprobación del final NO puede terminar en
-- `raise exception`: eso revertiría también la función que acaba de crear.
-- Termina en `raise notice` y borra lo que ensució.
-- ===========================================================================

create or replace function public.chat_foto_responder(
  p_clave     text,
  p_cedula    text,
  p_imagen    text,
  p_miniatura text default null,
  p_texto     text default null,
  p_canal     text default null)
returns jsonb
language plpgsql
volatile                       -- clave_ok usa una secuencia global: si fuera
                               -- stable, PostgREST la corre en una transacción
                               -- de solo lectura y contesta 25006.
security definer
set search_path = public
as $$
declare
  mini   text;
  nuevo  bigint;
  buena  constant text := '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$';
begin
  if not public.clave_ok(p_clave) then raise exception 'clave incorrecta'; end if;

  if pg_total_relation_size('public.chat_fotos') > 150 * 1024 * 1024 then
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

  -- El mensaje lo escribe chat_responder: ahí vive la regla del canal, y una
  -- sola vez. Si devuelve null es que el texto salió vacío, cosa que no puede
  -- pasar con el coalesce de abajo, pero se comprueba igual.
  nuevo := public.chat_responder(
             p_clave, p_cedula,
             coalesce(nullif(btrim(coalesce(p_texto, '')), ''), 'Foto'),
             p_canal);
  if nuevo is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_texto');
  end if;

  insert into public.chat_fotos (mensaje_id, miniatura, imagen)
  values (nuevo, mini, p_imagen);

  return jsonb_build_object('ok', true, 'id', nuevo);
end $$;

-- Se entra con la llave pública MÁS la clave de sincronización, igual que el
-- resto del Panel. La reja es `clave_ok`, no el rol.
revoke all on function public.chat_foto_responder(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.chat_foto_responder(text, text, text, text, text, text)
  to anon;

-- ===========================================================================
-- AUTOCOMPROBACIÓN
--
-- PL/pgSQL compila el cuerpo en la PRIMERA LLAMADA, no al crear la función. Una
-- migración que solo la crea puede quedar verde y estar rota: pasó el 21-sep y
-- costó trece días sin guardar una foto. Así que acá se LLAMA.
-- ===========================================================================
do $$
declare
  v_clave text;
  r       jsonb;
  ced     constant text := '900000000001';   -- cédula de mentira, se borra abajo
  img     constant text := 'data:image/jpeg;base64,' || repeat('A', 200);
  n_ok    int := 0;
  fallos  text := '';
begin
  -- config_privada es NOMBRE -> VALOR: la clave de sincronización es el `valor`
  -- de la fila cuyo nombre es 'clave_sync'. La primera versión de este archivo
  -- leía la columna `clave` —el NOMBRE— de una fila cualquiera, y al aplicarla el
  -- 26-sep contestó «clave incorrecta» en el paso 2. No quedó nada a medias: el
  -- editor corre el archivo en una sola transacción y se revirtió entero.
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then
    raise notice 'SIN CLAVE configurada: no se pudo autocomprobar. Revísalo a mano.';
    return;
  end if;

  -- 1 · la clave mala no entra
  begin
    r := public.chat_foto_responder('clave-que-no-es', ced, img);
    fallos := fallos || ' [1 GRAVE: entró sin la clave buena]';
  exception when others then n_ok := n_ok + 1;
  end;

  -- 2 · una fuente que se sale del atributo se rechaza
  r := public.chat_foto_responder(v_clave, ced,
         'data:image/png;base64,AAAA" onerror="alert(1)');
  if r->>'motivo' = 'no_es_imagen' then n_ok := n_ok + 1;
  else fallos := fallos || ' [2 GRAVE: entró una fuente envenenada]'; end if;

  -- 3 · y una miniatura envenenada también
  r := public.chat_foto_responder(v_clave, ced, img,
         'data:image/png;base64,AAAA" onerror="alert(1)');
  if r->>'motivo' = 'no_es_imagen' then n_ok := n_ok + 1;
  else fallos := fallos || ' [3 GRAVE: entró una miniatura envenenada]'; end if;

  -- 4 · la buena entra, y deja mensaje Y foto
  r := public.chat_foto_responder(v_clave, ced, img, null, 'Tu recibo');
  if (r->>'ok')::boolean
     and exists (select 1 from public.mensajes m
                  where m.id = (r->>'id')::bigint and m.de = 'panel' and m.texto = 'Tu recibo')
     and exists (select 1 from public.chat_fotos f where f.mensaje_id = (r->>'id')::bigint)
  then n_ok := n_ok + 1;
  else fallos := fallos || ' [4 GRAVE: la foto buena no quedó guardada]'; end if;

  -- 5 · sin texto queda 'Foto', que es lo que pinta el hilo
  r := public.chat_foto_responder(v_clave, ced, img);
  if exists (select 1 from public.mensajes m
              where m.id = (r->>'id')::bigint and m.texto = 'Foto')
  then n_ok := n_ok + 1;
  else fallos := fallos || ' [5: sin texto no quedó «Foto»]'; end if;

  -- 6 · borrar el mensaje se lleva la foto (lo cumple el esquema, no un acuerdo)
  delete from public.mensajes where cedula = ced;
  if not exists (select 1 from public.chat_fotos f
                  join public.mensajes m on m.id = f.mensaje_id
                 where m.cedula = ced)
     and not exists (select 1 from public.chat_fotos f
                      where f.mensaje_id not in (select id from public.mensajes))
  then n_ok := n_ok + 1;
  else fallos := fallos || ' [6 GRAVE: quedó una foto huérfana]'; end if;

  -- La limpieza va SIEMPRE, pase lo que pase con las comprobaciones.
  delete from public.mensajes where cedula = ced;

  if fallos = '' then
    raise notice 'chat_foto_responder: % de 6 comprobaciones OK. Aplicada.', n_ok;
  else
    raise notice 'chat_foto_responder: % de 6 OK. FALLOS:%', n_ok, fallos;
    raise notice 'NO la uses hasta revisar eso.';
  end if;
end $$;
