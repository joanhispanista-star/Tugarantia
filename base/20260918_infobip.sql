-- ===========================================================================
-- MANDAR LOS SMS Y LAS LLAMADAS DESDE EL CRM (Infobip)
-- 15 de septiembre de 2026
--
-- SQL Editor de Supabase -> New query -> pegar TODO -> Run. Idempotente.
-- Va después de 20260917_ruleta.sql.
--
-- Joan lo pidió así: «poder conectar mi crm con la plataforma», y mandó la
-- documentación: https://www.infobip.com/docs/api/channels/sms
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTO VIVE EN LA BASE Y NO EN EL NAVEGADOR
--
-- La llave de la API de Infobip sirve para mandar mensajes que se cobran. Si el
-- CRM la llevara adentro, cualquiera que abra el archivo del CRM —que está
-- publicado en internet— la puede leer y gastar la plata de Joan. No hay forma
-- de esconder una llave en una página web: lo que llega al navegador, llega al
-- que mire.
--
-- Además, la API de Infobip no documenta CORS: un navegador probablemente ni
-- siquiera podría llamarla.
--
-- Entonces la llave vive acá, en config_privada, que tiene RLS y cero políticas
-- —nadie la lee por PostgREST— y el CRM pide «manda esto», nunca «manda esto
-- con esta llave».
--
-- LA LLAVE LA PEGA JOAN, NO YO. Al final de este archivo hay dos líneas
-- comentadas con el UPDATE que hay que correr con la llave de verdad. Están
-- comentadas a propósito: una llave escrita en un archivo del repositorio es
-- una llave publicada.
--
-- ---------------------------------------------------------------------------
-- LO QUE LA DOCUMENTACIÓN DE INFOBIP OBLIGA A HACER DISTINTO EN COLOMBIA
--
-- 1. NO HAY REMITENTES CON LETRAS. La tabla de cobertura dice, para Colombia:
--    «Alphanumeric Senders Supported: LOCAL No, INTERNATIONAL No». O sea que el
--    cliente NUNCA va a ver «Tu Garantía» como remitente: ve un código corto de
--    números. Por eso el TEXTO empieza diciendo quién escribe.
--
-- 2. LA SALIDA ES OBLIGATORIA. «Opt Out mandatory: Yes». Todo mensaje lleva
--    «Responde SALIR», y quien lo use sale de la lista (eso lo lleva el CRM).
--
-- 3. LA VENTANA DE ENVÍO. Infobip la aplica para Colombia: lunes a viernes
--    07:00-19:00 y sábados 08:00-15:00, hora de Bogotá. Es la MISMA ventana de
--    la Ley 2300 de 2023, que a Joan le aplica en persona. Acá se comprueba
--    ANTES de mandar, para que la negativa venga con una frase en español y no
--    con un error de la plataforma.
--
-- 4. deliveryTimeWindow DE INFOBIP VA EN UTC. Bogotá es UTC-5, así que la
--    ventana 07:00-19:00 de Bogotá es 12:00-24:00 UTC. Ponerle 7 a 19 en UTC
--    sería entregar entre las 2 de la mañana y las 2 de la tarde. Se manda
--    convertida, y va como segundo cerrojo: aunque este servidor se equivoque
--    de hora, Infobip no entrega fuera de la ventana.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO NO HACE
--
-- No decide a quién se le escribe. Eso lo decide panel/tanda.js con los topes de
-- la Ley 2300 (uno por persona, uno por semana, sin mezclar canales), y esta
-- función recibe la lista ya filtrada. Lo que sí hace es GUARDAR lo que salió,
-- para que el tope semanal tenga de dónde leerse aunque Joan cambie de
-- computador.
-- ===========================================================================

-- pg_net: es lo que deja que Postgres haga una llamada HTTP. Supabase lo trae.
create extension if not exists pg_net with schema extensions;

do $$
begin
  if to_regclass('public.config_privada') is null then
    raise exception 'Falta base/supabase.sql: no existe config_privada';
  end if;
  if not exists (select 1 from pg_proc
                  where proname = 'clave_ok' and pronamespace = 'public'::regnamespace) then
    raise exception 'Falta base/supabase.sql: no existe clave_ok()';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. QUÉ SALIÓ, CUÁNDO Y A QUIÉN
--
-- Existe por dos razones distintas y las dos importan:
--   · El tope semanal de la Ley 2300 necesita saber a quién se contactó. Si eso
--     viviera solo en el computador de Joan, cambiar de computador reiniciaría
--     el contador y el segundo mensaje sería el ilegal.
--   · El día que alguien reclame, la prueba de qué se mandó y a qué hora tiene
--     que existir. Sin esto, la única versión de los hechos es la del que se
--     queja.
-- ---------------------------------------------------------------------------
create table if not exists public.envios_mensajes (
  id           bigint generated always as identity primary key,
  canal        text        not null check (canal in ('sms', 'voz')),
  celular      text        not null,
  nombre       text,
  texto        text        not null,
  monto        bigint,
  bulk_id      text,
  peticion_id  bigint,                    -- el id de pg_net, para leer la respuesta
  estado       text        not null default 'encolado',
  enviado_en   timestamptz not null default now()
);

alter table public.envios_mensajes enable row level security;

create index if not exists envios_mensajes_celular on public.envios_mensajes (celular, enviado_en desc);
create index if not exists envios_mensajes_fecha   on public.envios_mensajes (enviado_en desc);

comment on table public.envios_mensajes is
  'Lo que salió por SMS o por voz. Es el tope semanal de la Ley 2300 y es la prueba.';

-- ---------------------------------------------------------------------------
-- 2. LA VENTANA LEGAL, EN HORA DE BOGOTÁ
--
-- Se pregunta en la base y no en el navegador porque el reloj del navegador lo
-- cambia cualquiera. Un computador con la hora mal puesta mandaría cobros a las
-- once de la noche, y la excusa «mi computador estaba mal» no existe en el
-- artículo 3.
-- ---------------------------------------------------------------------------
create or replace function public.ventana_de_cobro(p_momento timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  bog  timestamp;
  dia  int;      -- 0 = domingo
  hora numeric;
begin
  bog  := p_momento at time zone 'America/Bogota';
  dia  := extract(dow from bog);
  hora := extract(hour from bog) + extract(minute from bog) / 60.0;

  if dia = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'es domingo');
  end if;
  if dia = 6 then
    if hora >= 8 and hora < 15 then
      -- Sábado: 8am-3pm Bogotá = 13:00-20:00 UTC.
      return jsonb_build_object('ok', true, 'utc_desde', 13, 'utc_hasta', 20);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'el sabado solo de 8am a 3pm');
  end if;
  if hora >= 7 and hora < 19 then
    -- Entre semana: 7am-7pm Bogotá = 12:00-24:00 UTC. Se cierra en 23:59
    -- porque deliveryTimeWindow no acepta la hora 24.
    return jsonb_build_object('ok', true, 'utc_desde', 12, 'utc_hasta', 23);
  end if;
  return jsonb_build_object('ok', false, 'motivo', 'entre semana solo de 7am a 7pm');
end $$;

-- ---------------------------------------------------------------------------
-- 3. MANDAR
--
-- p_mensajes: [{celular, nombre, texto, monto}]  — ya filtrados por tanda.js
--
-- VOLATILE, obligatorio: escribe, llama a clave_ok (que hace nextval) y hace una
-- llamada HTTP. Declararla stable la serviría PostgREST por GET y no mandaría
-- nada, devolviendo 405 para siempre. Este proyecto ya perdió una tarde con eso.
-- ---------------------------------------------------------------------------
create or replace function public.enviar_mensajes(p_clave text, p_canal text, p_mensajes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  llave    text;
  base     text;
  remite   text;
  ventana  jsonb;
  cuerpo   jsonb;
  lote     text;
  msgs     jsonb := '[]'::jsonb;
  m        jsonb;
  pid      bigint;
  n        int := 0;
  ruta     text;
begin
  if not public.clave_ok(p_clave) then
    return jsonb_build_object('ok', false, 'motivo', 'clave');
  end if;
  if p_canal not in ('sms', 'voz') then
    return jsonb_build_object('ok', false, 'motivo', 'canal desconocido');
  end if;

  -- LA VENTANA, ANTES QUE NADA. Fuera de ella no se manda ni se encola.
  ventana := public.ventana_de_cobro();
  if (ventana->>'ok')::boolean is not true then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de horario',
                              'detalle', ventana->>'motivo');
  end if;

  select valor into llave  from public.config_privada where clave = 'infobip_llave';
  select valor into base   from public.config_privada where clave = 'infobip_base';
  select valor into remite from public.config_privada where clave = 'infobip_remitente';

  if llave is null or base is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin llave',
      'detalle', 'Falta pegar la llave de Infobip en config_privada. Ver el final de 20260918_infobip.sql.');
  end if;

  if jsonb_typeof(p_mensajes) <> 'array' or jsonb_array_length(p_mensajes) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sin mensajes');
  end if;
  if jsonb_array_length(p_mensajes) > 500 then
    -- No es un límite de Infobip (no lo documentan): es un freno propio. Un
    -- error de programación que mande 50.000 mensajes se paga igual.
    return jsonb_build_object('ok', false, 'motivo', 'demasiados',
      'detalle', 'Maximo 500 por tanda. Si de verdad son mas, se manda en varias.');
  end if;

  lote := 'TG-' || to_char(now() at time zone 'America/Bogota', 'YYYYMMDD-HH24MISS');

  -- Un objeto por destinatario, porque cada uno lleva SU texto con SU monto.
  -- Es lo que pidió Joan: «una plantilla la cual indique el monto a cobrar por
  -- cada cliente».
  for m in select * from jsonb_array_elements(p_mensajes)
  loop
    n := n + 1;
    -- EL REMITENTE VACÍO NO SE MANDA — 16-sep-2026.
    -- Esto ponía 'sender', '' cuando no había remitente configurado, y una
    -- cadena vacía NO es lo mismo que no mandar el campo: lo primero es un
    -- remitente inválido y se rechaza; lo segundo deja que la plataforma use el
    -- que tiene asignado a la cuenta.
    -- Y es el caso NORMAL de Joan, no un caso raro: se comprobó contra su
    -- cuenta que no tiene ningún número propio registrado ({"numbers":[]}) —
    -- los mensajes salen por el código corto del revendedor, que es de ellos y
    -- no aparece en su subcuenta. O sea que el campo va vacío siempre, y de
    -- haberlo dejado así no habría salido ni un mensaje.
    if p_canal = 'sms' then
      msgs := msgs || jsonb_build_array(
        jsonb_build_object(
          'destinations', jsonb_build_array(jsonb_build_object(
            'to', '57' || regexp_replace(m->>'celular', '\D', '', 'g'),
            'messageId', lote || '-' || n)),
          'content', jsonb_build_object('text', m->>'texto')
        )
        || case when coalesce(remite, '') <> ''
                then jsonb_build_object('sender', remite)
                else '{}'::jsonb end
      );
    else
      msgs := msgs || jsonb_build_array(
        jsonb_build_object(
          'destinations', jsonb_build_array(jsonb_build_object(
            'to', '57' || regexp_replace(m->>'celular', '\D', '', 'g'))),
          'text', m->>'texto',
          'language', 'es',
          'voice', jsonb_build_object('gender', 'female'),
          -- Cada coma es media pausa. La cifra se dice despacio a propósito.
          'speechRate', 0.9
        )
        || case when coalesce(remite, '') <> ''
                then jsonb_build_object('from', remite)
                else '{}'::jsonb end
      );
    end if;
  end loop;

  -- ---------------------------------------------------------------------
  -- EL SEGUNDO CERROJO — 16-sep-2026, ARREGLADO Y EN EL SITIO CORRECTO
  --
  -- Esto va EN UTC (Bogotá es UTC-5) y es la red de abajo: aunque este
  -- servidor tuviera la hora mal, el proveedor no entrega fuera de la ventana.
  --
  -- ESTABA EN EL OBJETO EQUIVOCADO. Iba en el `options` de la RAÍZ, y en la
  -- versión 3 de la API ese objeto (SmsMessageRequestOptions) admite
  -- exactamente cuatro campos —schedule, tracking, includeSmsCountInResponse y
  -- conversionTracking— y `deliveryTimeWindow` NO es uno de ellos: vive en
  -- `messages[].options`. Comprobado contra el esquema publicado.
  --
  -- Por qué importa tanto un campo mal puesto: si el proveedor ignora en
  -- silencio lo que no reconoce —que es el comportamiento por defecto de la
  -- mayoría de servidores— la respuesta habría sido 200, los SMS habrían salido
  -- SIN NINGUNA restricción horaria, y el comentario de acá habría seguido
  -- afirmando que sí la tenían. El peor fallo posible es el que se ve bien.
  --
  -- Y LA VOZ NO LLEVABA NINGUNA. Una llamada de cobro a las diez de la noche es
  -- peor que un SMS a las diez de la noche.
  -- ---------------------------------------------------------------------
  declare
    dias    jsonb := jsonb_build_array('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY');
    ventana_obj jsonb;
    msgs2   jsonb := '[]'::jsonb;
    mm      jsonb;
  begin
    ventana_obj := jsonb_build_object(
      'days', dias,
      'from', jsonb_build_object('hour', (ventana->>'utc_desde')::int, 'minute', 0),
      'to',   jsonb_build_object('hour', (ventana->>'utc_hasta')::int, 'minute', 59));

    -- La ventana se le pega a CADA mensaje: la API no deja fijarla una sola vez
    -- para todo el lote.
    for mm in select * from jsonb_array_elements(msgs)
    loop
      msgs2 := msgs2 || jsonb_build_array(
        mm || jsonb_build_object('options',
          coalesce(mm->'options', '{}'::jsonb) ||
          jsonb_build_object('deliveryTimeWindow', ventana_obj)));
    end loop;
    msgs := msgs2;
  end;

  if p_canal = 'sms' then
    ruta := '/sms/3/messages';
    cuerpo := jsonb_build_object(
      'messages', msgs,
      'options', jsonb_build_object(
        'schedule', jsonb_build_object('bulkId', lote),
        'includeSmsCountInResponse', true));
  else
    ruta := '/tts/3/advanced';
    cuerpo := jsonb_build_object('bulkId', lote, 'messages', msgs);
  end if;

  select net.http_post(
    url     := rtrim(base, '/') || ruta,
    body    := cuerpo,
    headers := jsonb_build_object(
      'Authorization', 'App ' || llave,
      'Content-Type',  'application/json',
      'Accept',        'application/json'),
    timeout_milliseconds := 20000
  ) into pid;

  -- Se anota SIEMPRE, encolado. Si la llamada falla, queda el rastro de que se
  -- intentó: un envío que no se anota es un envío que nadie puede auditar.
  for m in select * from jsonb_array_elements(p_mensajes)
  loop
    insert into public.envios_mensajes (canal, celular, nombre, texto, monto, bulk_id, peticion_id)
    values (p_canal,
            regexp_replace(m->>'celular', '\D', '', 'g'),
            m->>'nombre',
            m->>'texto',
            nullif(m->>'monto', '')::bigint,
            lote, pid);
  end loop;

  return jsonb_build_object('ok', true, 'bulk_id', lote, 'peticion_id', pid,
                            'cuantos', jsonb_array_length(p_mensajes),
                            'nota', 'Encolado. La respuesta de Infobip llega aparte: usa estado_envio.');
end $$;

-- ---------------------------------------------------------------------------
-- 4. QUÉ CONTESTÓ INFOBIP
--
-- pg_net es ASÍNCRONO: la función de arriba entrega la petición y sigue, así
-- que la respuesta no vuelve en la misma llamada. Llega a net._http_response
-- unos segundos después. Esto la lee.
--
-- Se dice en la pantalla con estas palabras —«encolado», y después «entregado»
-- o el error— en vez de fingir que ya salió: fingirlo haría que Joan diera por
-- enviado un lote que se cayó.
-- ---------------------------------------------------------------------------
create or replace function public.estado_envio(p_clave text, p_peticion_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, net
as $$
declare r record;
begin
  if not public.clave_ok(p_clave) then
    return jsonb_build_object('ok', false, 'motivo', 'clave');
  end if;

  select status_code, content, error_msg into r
    from net._http_response where id = p_peticion_id;

  if not found then
    return jsonb_build_object('ok', true, 'estado', 'encolado',
      'nota', 'Todavia no hay respuesta. Espera unos segundos y vuelve a mirar.');
  end if;

  if r.error_msg is not null then
    update public.envios_mensajes set estado = 'error' where peticion_id = p_peticion_id;
    return jsonb_build_object('ok', false, 'estado', 'error', 'detalle', r.error_msg);
  end if;

  update public.envios_mensajes
     set estado = case when r.status_code between 200 and 299 then 'entregado a Infobip'
                       else 'rechazado (' || r.status_code || ')' end
   where peticion_id = p_peticion_id;

  return jsonb_build_object('ok', r.status_code between 200 and 299,
                            'estado', case when r.status_code between 200 and 299
                                           then 'entregado a Infobip'
                                           else 'rechazado' end,
                            'codigo', r.status_code,
                            'respuesta', r.content);
end $$;

-- ---------------------------------------------------------------------------
-- 5. LO QUE SE HA MANDADO (para el CRM y para el tope semanal)
-- ---------------------------------------------------------------------------
create or replace function public.envios_recientes(p_clave text, p_dias int default 8)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare filas jsonb;
begin
  if not public.clave_ok(p_clave) then
    return jsonb_build_object('ok', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'canal', canal, 'celular', celular, 'nombre', nombre,
           'monto', monto, 'estado', estado, 'enviado_en', enviado_en,
           'bulk_id', bulk_id) order by enviado_en desc), '[]'::jsonb)
    into filas
    from public.envios_mensajes
   where enviado_en >= now() - (greatest(p_dias, 1) || ' days')::interval
   limit 1000;

  return jsonb_build_object('ok', true, 'envios', filas);
end $$;

-- ---------------------------------------------------------------------------
-- 6. LAS REJAS
-- ---------------------------------------------------------------------------
revoke all on function public.ventana_de_cobro(timestamptz)          from public, anon, authenticated;
grant  execute on function public.ventana_de_cobro(timestamptz)      to anon, authenticated;

revoke all on function public.enviar_mensajes(text, text, jsonb)     from public, anon, authenticated;
grant  execute on function public.enviar_mensajes(text, text, jsonb) to anon, authenticated;

revoke all on function public.estado_envio(text, bigint)             from public, anon, authenticated;
grant  execute on function public.estado_envio(text, bigint)         to anon, authenticated;

revoke all on function public.envios_recientes(text, int)            from public, anon, authenticated;
grant  execute on function public.envios_recientes(text, int)        to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. LO QUE SE COMPRUEBA SOLO
-- ---------------------------------------------------------------------------
do $$
begin
  if (select provolatile from pg_proc
       where proname = 'enviar_mensajes' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'enviar_mensajes no es volatile: PostgREST la serviria por GET y no mandaria nada';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.envios_mensajes'::regclass) then
    raise exception 'envios_mensajes sin RLS: la llave publica leeria a quien se le cobra';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'envios_mensajes') then
    raise exception 'envios_mensajes tiene politicas: se esperaba cero';
  end if;

  -- La ventana, comprobada con horas de verdad. Si alguien se equivoca de zona
  -- horaria, esto revienta acá y no con mil mensajes ya mandados a medianoche.
  if (public.ventana_de_cobro('2026-09-15 03:00:00-05'::timestamptz)->>'ok')::boolean then
    raise exception 'la ventana deja cobrar a las 3 de la manana';
  end if;
  if (public.ventana_de_cobro('2026-09-15 23:00:00-05'::timestamptz)->>'ok')::boolean then
    raise exception 'la ventana deja cobrar a las 11 de la noche';
  end if;
  if (public.ventana_de_cobro('2026-09-13 10:00:00-05'::timestamptz)->>'ok')::boolean then
    raise exception 'la ventana deja cobrar en DOMINGO';
  end if;
  if (public.ventana_de_cobro('2026-09-19 16:00:00-05'::timestamptz)->>'ok')::boolean then
    raise exception 'la ventana deja cobrar el sabado despues de las 3';
  end if;
  if not (public.ventana_de_cobro('2026-09-15 10:00:00-05'::timestamptz)->>'ok')::boolean then
    raise exception 'la ventana NO deja cobrar un martes a las 10 de la manana';
  end if;
  if not (public.ventana_de_cobro('2026-09-19 10:00:00-05'::timestamptz)->>'ok')::boolean then
    raise exception 'la ventana NO deja cobrar un sabado a las 10 de la manana';
  end if;

  raise notice 'Infobip: listo. Falta pegar la llave (ver el final de este archivo).';
end $$;

-- ===========================================================================
-- 8. LO ÚNICO QUE FALTA, Y LO HACE JOAN
--
-- Copia estas tres líneas en una consulta NUEVA, cámbiales los valores por los
-- de tu cuenta de Infobip, y córrelas. Están comentadas a propósito: una llave
-- escrita en un archivo del repositorio es una llave publicada.
--
--   · La llave: en el portal de Infobip, en «API Keys». Se ve completa solo
--     durante los dos primeros días; después hay que generar otra.
--   · La base: la que muestre TU portal, del estilo xxxxx.api.infobip.com.
--     Con https:// adelante y sin barra al final.
--   · El remitente: en Colombia NO puede llevar letras. Va el código corto que
--     te asigne Infobip. Si todavía no tienes, déjalo vacío y ellos ponen uno.
--
-- insert into public.config_privada (clave, valor) values
--   ('infobip_llave',     'AQUI-VA-TU-LLAVE'),
--   ('infobip_base',      'https://xxxxx.api.infobip.com'),
--   ('infobip_remitente', '')
-- on conflict (clave) do update set valor = excluded.valor;
--
-- Para comprobar que quedó (NO muestra la llave, solo si está):
--   select clave, length(valor) as largo from public.config_privada
--    where clave like 'infobip%';
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PROBAR LA CONEXION SIN MANDARLE NADA A NADIE — 16-sep-2026
--
-- La primera vez que se enciende un canal de cobro, la tentacion es «mandale
-- uno a ver si llega». Eso es mandarle un cobro de verdad a un cliente de
-- verdad para averiguar si funciona un tubo — y si el tubo funciona a medias,
-- el que recibe el mensaje raro es una persona que debe plata.
--
-- Esto pregunta el SALDO de la cuenta, que es la llamada mas inofensiva que
-- existe: no manda nada, no cuesta nada, y falla exactamente igual que un envio
-- si la llave o la direccion estan mal.
--
-- Devuelve el numero de peticion. La respuesta se lee con estado_envio, igual
-- que un envio, porque pg_net es asincrono.
-- ---------------------------------------------------------------------------
create or replace function public.probar_conexion(p_clave text)
returns jsonb
language plpgsql
security definer
volatile                       -- pasa por clave_ok, que escribe. Ver la nota de arriba.
set search_path = public, net
as $$
declare
  llave text;
  base  text;
  pid   bigint;
begin
  if not public.clave_ok(p_clave) then
    return jsonb_build_object('ok', false, 'motivo', 'clave');
  end if;

  select valor into llave from public.config_privada where clave = 'infobip_llave';
  select valor into base  from public.config_privada where clave = 'infobip_base';

  if coalesce(llave, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'falta la llave',
      'detalle', 'No has pegado la llave. Ver el final de 20260918_infobip.sql.');
  end if;
  if coalesce(base, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'falta la direccion');
  end if;

  select net.http_get(
    url     := rtrim(base, '/') || '/account/1/balance',
    headers := jsonb_build_object(
      'Authorization', 'App ' || llave,
      'Accept',        'application/json'),
    timeout_milliseconds := 15000
  ) into pid;

  return jsonb_build_object('ok', true, 'peticion_id', pid,
    'nota', 'Preguntado el saldo. Mira la respuesta con estado_envio(clave, peticion_id).');
end $$;

revoke all on function public.probar_conexion(text) from public, anon, authenticated;
grant  execute on function public.probar_conexion(text) to anon;


/* QUE POSTGREST SE ENTERE. Sin esto, las funciones nuevas existen en la base y
   PostgREST sigue contestando 404 sobre ellas hasta que algo lo reinicie: el CRM
   dice «tu nube todavia no sabe hacer esto» sobre algo que SI acaba de quedar
   hecho, y se pierde la tarde buscando el error en el sitio equivocado.
   Faltaba en esta migracion, en la de la ruleta y en la del asesor — las tres
   del trabajo reciente. Se corrio a mano el 16-sep-2026 y se agrega aqui para
   que quien la vuelva a correr no dependa de acordarse. */
notify pgrst, 'reload schema';
