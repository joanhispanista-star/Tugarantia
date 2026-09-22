-- 22-sep-2026 — EL TOPE DE FOTOS NO PUEDE SER PERPETUO
--
-- El tope de 60 fotos se contaba así:
--
--     where m.cedula = llave
--
-- Sin canal y sin fecha. O sea que no eran 60 fotos «por aquí» sino 60 EN
-- TOTAL, sumando servicio, cobranza y créditos, Y PARA SIEMPRE. El cliente 61
-- se quedaba sin poder mandar un comprobante nunca más.
--
-- Y la pantalla le ofrecía una salida que no existe: «Escríbenos y las
-- revisamos». En toda la carpeta `base/` no hay ni una función que borre UNA
-- foto. La única palanca de Joan es «Borrar la conversación» (`chat_olvidar`),
-- que arrasa el hilo entero y no se deshace. Se le estaba prometiendo un
-- trámite que solo se podía cumplir destruyéndole la conversación.
--
-- Las dos mitades de esa frase eran falsas, que es justo lo que esta casa no
-- hace: la interfaz no promete lo que el código no cumple.
--
-- LO QUE CAMBIA: el conteo mira los últimos 30 días. El freno sigue estando
-- —sigue protegiendo los 500 MB del plan gratis, que al pasarlos dejan la base
-- DE SOLO LECTURA y con ella se cae desembolsar, cobrar y contestar— pero deja
-- de ser un callejón sin salida. 60 fotos al mes son unos 4,4 MB por cliente;
-- nadie manda 60 comprobantes en un mes, y el que llegue ahí puede volver a
-- mandar el mes siguiente en vez de quedarse fuera de por vida.
--
-- El freno de verdad contra una avalancha sigue siendo otro y no se toca:
-- `chat_puede_escribir`, 20 mensajes cada 15 minutos.
--
-- No se copia el cuerpo: se lee de la base y se le cambia la línea. Copiar a
-- mano es como se pierde en silencio un `pg_sleep` o el número que devuelve un
-- tope, y hoy estuvo a punto de pasar.

do $$
declare
  src   text;
  nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'chat_foto_sesion' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.chat_foto_sesion'; end if;

  if position('interval ''30 days''' in src) > 0 then
    raise notice 'la ventana ya estaba puesta';
    return;
  end if;

  -- Tolerante a los espacios: el formato de pg_get_functiondef no es el del
  -- archivo. Anclarse a un espacio concreto es como se rompen estas cosas, y
  -- hoy ya se rompió una vez exactamente así.
  nueva := regexp_replace(src,
    '(from public\.chat_fotos f\s+join public\.mensajes m on m\.id = f\.mensaje_id\s+where m\.cedula = llave)',
    '\1' || E'\n       and f.creado_en > now() - interval ''30 days''',
    '');

  if nueva = src then
    raise exception 'no se encontro el conteo del tope en chat_foto_sesion: mirar pg_get_functiondef antes de seguir';
  end if;
  execute nueva;
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- La prueba NO puede terminar en `raise exception`: el editor corre el archivo
-- en UNA transacción y eso revertiría también el cambio de arriba.
do $prueba$
declare
  cel   text := '3009998844';
  img   text := 'data:image/jpeg;base64,' || repeat('A', 500);
  j     jsonb;
  id_m  bigint;
  pasos text := '';
begin
  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);

  ---- 61 fotos VIEJAS (de hace más de un mes) no pueden tapar el paso.
  ---- Se escriben directas para no chocar con chat_puede_escribir, que es el
  ---- otro freno y no es el que se está probando aquí.
  insert into public.mensajes (cedula, de, texto, canal, visto, creado_en)
  values (cel, 'socio', 'Foto vieja', 'cobranza', false, now() - interval '90 days')
  returning id into id_m;

  insert into public.chat_fotos (mensaje_id, imagen, creado_en)
  select id_m, img, now() - interval '90 days'
    from generate_series(1, 61);

  j := public.chat_foto_sesion('cobranza', img, null, 'La de hoy');
  if (j->>'ok') <> 'true' then
    raise exception 'FALLO 1: 61 fotos del trimestre pasado siguen tapando el paso hoy: %', j;
  end if;
  pasos := pasos || '1 lo-viejo-ya-no-tapa; ';

  ---- Y el tope SIGUE existiendo: 61 fotos de hoy sí frenan. Un arreglo que
  ---- quita el freno no es un arreglo: con el freno fuera, la base se llena y
  ---- se vuelve de solo lectura.
  insert into public.chat_fotos (mensaje_id, imagen)
  select id_m, img from generate_series(1, 61);

  j := public.chat_foto_sesion('cobranza', img, null, 'Una mas');
  if (j->>'motivo') <> 'tope' then
    raise exception 'FALLO 2 GRAVE: se quito el freno: la base se llena y queda de solo lectura: %', j;
  end if;
  pasos := pasos || '2 el-freno-sigue; ';

  delete from public.mensajes where cedula = cel;
  raise notice 'el tope no es para siempre: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'chat_foto_sesion' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^\n]*', '', 'g');

  if cuerpo not like '%interval ''30 days''%' then
    raise exception 'el tope vuelve a ser perpetuo: al cliente 61 se le cierra la puerta para siempre';
  end if;
  if cuerpo not like '%cuantas >= 60%' then
    raise exception 'se fue el tope entero: sin el, un solo cliente deja la base de solo lectura';
  end if;
end $$;
