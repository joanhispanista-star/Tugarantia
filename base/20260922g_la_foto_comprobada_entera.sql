-- 22-sep-2026 — LA FOTO SE COMPRUEBA ENTERA, DE LA PRIMERA LETRA A LA ÚLTIMA
--
-- La migración de esta misma tarde (20260922f) dejaba pasar esto:
--
--     data:image/png;base64,AAAA" onerror="…lo que quiera…"
--
-- porque el CHECK solo exigía que la cadena EMPEZARA por `data:image/` y que
-- midiera entre 100 y 400.000. Y el guardián de la escritura, chat_foto_sesion,
-- usaba exactamente la misma comprobación floja.
--
-- ¿Por qué eso importa tanto? Porque los dos visores pintaban la foto grande
-- metiendo esa cadena CRUDA dentro de un atributo, y la abrían con un
-- `window.open()` sin dirección — y un about:blank así HEREDA EL ORIGEN de
-- quien lo abre. O sea que el guión no corría en una pestaña cualquiera:
-- corría DENTRO del CRM, donde el navegador guarda la clave de sincronización
-- de Joan. Con esa clave, `chat_foto_panel(clave, 1)`, `(clave, 2)`, `(clave,
-- 3)`… — el id es correlativo — se baja el comprobante de pago de todos los
-- clientes; `chat_de(clave, cualquier cédula)` da las conversaciones enteras.
--
-- El cebo era limpio: se manda la foto envenenada SIN miniatura, así en la
-- bandeja sale como «📎 Foto» (un adjunto que no cargó), con el pie que el
-- atacante escriba: «no se ve, ábrela por favor». Joan toca. Ya está.
--
-- Lo más incómodo: LA COMPROBACIÓN BUENA YA EXISTÍA. En `app/chat.js` está
-- escrita, con un comentario que describe este ataque palabra por palabra… y
-- se le aplicaba solo a la MINIATURA. Dos definiciones de lo mismo es una que
-- se queda atrás; ahora hay una sola, exportada, y la usan los dos visores.
--
-- Esto es la mitad de abajo del arreglo. La pantalla ya no construye HTML: la
-- fuente se asigna como PROPIEDAD, que no puede salirse de ningún atributo
-- aunque esta comprobación fallara algún día. Las dos capas se sostienen sola
-- cada una; juntas es lo que hay que tener.
--
-- Y de paso: la MINIATURA no la revisaba nadie. Una miniatura mal formada
-- reventaba contra el CHECK, y un CHECK reventado sale por HTTP como un error
-- cualquiera, que la app traducía como «revisa tu internet». Ahora se revisa
-- antes y se contesta con un motivo, como todo lo demás.
--
-- Nada que aplicar dos veces hace daño: todo es idempotente.

-- ====== 1. EL CHECK, AHORA DE LA FORMA ENTERA ======
-- El ancla del final (`$`) vale tanto como la del principio: sin ella, «empieza
-- bien» es todo lo que se pide y detrás cabe cualquier cosa.
--
-- En PostgreSQL, `~` por defecto NO es sensible a saltos de línea, así que
-- `^…$` sujeta la cadena completa; y la clase [A-Za-z0-9+/=] no admite ni
-- espacios ni comillas ni saltos, que es justo por donde se salía.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'chat_fotos_solo_imagen') then
    alter table public.chat_fotos drop constraint chat_fotos_solo_imagen;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chat_fotos_imagen_entera') then
    alter table public.chat_fotos
      add constraint chat_fotos_imagen_entera
      check (
        -- Sigue siendo el freno del video, y sigue estando en la base y no en
        -- la pantalla: una pantalla se cambia, esto no.
            imagen ~ '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$'
        and length(imagen) between 100 and 400000
        and (miniatura is null
             or (miniatura ~ '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$'
                 and length(miniatura) <= 30000))
      );
  end if;
end $$;

-- ====== 2. Y EL GUARDIÁN DE LA ESCRITURA, CON LA MISMA REGLA ======
-- Se revisa ANTES de insertar para poder contestar con un motivo. Si se deja
-- que salte el CHECK, el fallo sale por HTTP como un error pelado y la app no
-- tiene con qué distinguirlo de que se cayó el internet.
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
  mini    text;
  cuantas integer;
  nuevo   bigint;
  -- La MISMA frase que aplica el CHECK de la tabla y la misma que aplica la
  -- pantalla al pintarla. Tres sitios, una regla: dos definiciones de lo mismo
  -- son una que se queda atras, y eso es exactamente lo que paso hoy.
  buena   constant text := '^data:image/[a-z+]{2,12};base64,[A-Za-z0-9+/=]+$';
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  llave := public.llave_de_sesion(cel);

  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else 'servicio' end;

  -- LA FORMA ENTERA, no solo el principio: el ancla del final vale tanto como
  -- la del principio, porque sin ella detras del prefijo bueno cabe cualquier
  -- cosa -- incluida una comilla que se sale del atributo donde se pinta.
  if p_imagen is null or p_imagen !~ buena then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;
  if length(p_imagen) > 400000 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_grande');
  end if;
  if length(p_imagen) < 100 then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;

  -- Y LA MINIATURA, que no la miraba nadie y era por donde iba el cebo: sin
  -- miniatura la burbuja sale como «un adjunto que no cargó», que es
  -- justamente lo que invita a tocarla.
  mini := nullif(p_miniatura, '');
  if mini is not null and (mini !~ buena or length(mini) > 30000) then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_imagen');
  end if;

  if not public.chat_puede_escribir(llave) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  select count(*) into cuantas
    from public.chat_fotos f
    join public.mensajes m on m.id = f.mensaje_id
   where m.cedula = llave;
  if cuantas >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'tope', 'tope', 60);
  end if;

  txt := nullif(btrim(coalesce(p_texto, '')), '');
  txt := left(coalesce(txt, 'Foto'), 1000);

  insert into public.mensajes (cedula, de, texto, canal)
       values (llave, 'socio', txt, v_canal)
    returning id into nuevo;

  insert into public.chat_fotos (mensaje_id, miniatura, imagen)
       values (nuevo, mini, p_imagen);

  return jsonb_build_object('ok', true, 'id', nuevo);
end
$$;

revoke all on function public.chat_foto_sesion(text, text, text, text)     from public, anon, authenticated;
grant  execute on function public.chat_foto_sesion(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, y limpiando lo suyo con `delete`: una prueba dentro de una
-- migración NO puede terminar en `raise exception`, porque el editor corre el
-- archivo entero en UNA transacción y eso revertiría también los `create` de
-- arriba. La migración diría «todo bien» y no habría aplicado nada.
do $prueba$
declare
  cel   text := '3009998844';
  img   text := 'data:image/jpeg;base64,' || repeat('A', 500);
  mini  text := 'data:image/jpeg;base64,' || repeat('B', 100);
  j     jsonb;
  pasos text := '';
begin
  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);

  ---- EL ATAQUE DE ESTA TARDE, tal cual. Empieza por data:image/ y mide de
  ---- sobra: con el CHECK viejo entraba sin despeinarse.
  j := public.chat_foto_sesion('servicio',
         'data:image/png;base64,AAAA" onerror="' || repeat('x', 200), null, null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 1 GRAVE: entro una fuente que se sale del atributo: %', j;
  end if;
  pasos := pasos || '1 no-se-sale-del-atributo; ';

  ---- Y por la puerta de la miniatura, que es la que nadie miraba.
  j := public.chat_foto_sesion('servicio', img,
         'data:image/png;base64,AA"><script>x</script>', null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 2 GRAVE: entro una miniatura envenenada: %', j;
  end if;
  pasos := pasos || '2 ni-por-la-miniatura; ';

  ---- Un salto de línea tampoco, que es la otra forma de escaparse.
  j := public.chat_foto_sesion('servicio',
         'data:image/png;base64,AAAA' || chr(10) || repeat('B', 200), null, null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 3: se colo un salto de linea dentro de la fuente: %', j;
  end if;
  pasos := pasos || '3 ni-con-un-salto; ';

  ---- El video sigue fuera.
  j := public.chat_foto_sesion('servicio', 'data:video/mp4;base64,' || repeat('A', 200), null, null);
  if (j->>'motivo') <> 'no_es_imagen' then
    raise exception 'FALLO 4: entro un video: 25 de esos dejan la base de solo lectura: %', j;
  end if;
  pasos := pasos || '4 el-video-sigue-fuera; ';

  ---- Y una foto de verdad SIGUE ENTRANDO, que es la mitad que se olvida.
  j := public.chat_foto_sesion('cobranza', img, mini, 'Ahi va el comprobante');
  if (j->>'ok') <> 'true' then
    raise exception 'FALLO 5: se rompio el camino bueno, ya no entra una foto normal: %', j;
  end if;
  pasos := pasos || '5 la-buena-sigue-entrando; ';

  ---- Y el CHECK aguanta aunque alguien escriba por debajo de la función.
  begin
    insert into public.chat_fotos (mensaje_id, imagen)
    select m.id, 'data:image/png;base64,AAAA" onerror="' || repeat('x', 200)
      from public.mensajes m where m.cedula = cel limit 1;
    raise exception 'FALLO 6 GRAVE: el CHECK dejo entrar la fuente envenenada por debajo';
  exception when others then
    if sqlerrm like 'FALLO 6%' then raise; end if;
  end;
  pasos := pasos || '6 el-CHECK-aguanta-por-debajo; ';

  delete from public.mensajes where cedula = cel;
  raise notice 'la foto comprobada entera: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
-- Mira lo que se EJECUTA, no la prosa: el comentario que explica este mismo
-- arreglo cita la línea mala, y un centinela que lea comentarios se caza a sí
-- mismo. Ya pasó tres veces en un solo día.
do $$
declare cuerpo text;
begin
  if exists (select 1 from pg_constraint where conname = 'chat_fotos_solo_imagen') then
    raise exception 'sigue puesto el CHECK viejo, el que solo miraba el principio';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chat_fotos_imagen_entera') then
    raise exception 'no quedo puesto el CHECK de la forma entera';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'chat_foto_sesion' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^\n]*', '', 'g');

  if cuerpo like '%like ''data:image/%%' then
    raise exception 'chat_foto_sesion vuelve a mirar solo el principio de la fuente';
  end if;
  -- Se mira que la miniatura pase por la MISMA frase que la imagen. Buscar el
  -- nombre de la variable seria fragil; lo que importa es que se comprueba.
  if cuerpo not like '%mini !~ buena%' then
    raise exception 'la miniatura vuelve a entrar sin que nadie la mire: es por donde iba el cebo';
  end if;
  if cuerpo not like '%p_imagen !~ buena%' then
    raise exception 'la imagen ya no se comprueba contra la forma entera';
  end if;
end $$;
