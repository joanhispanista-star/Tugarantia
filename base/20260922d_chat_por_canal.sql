-- 22-sep-2026 — EL CHAT CONTESTA DONDE LE ESCRIBIERON
--
-- Joan: «arregla el chat mal enrutado».
--
-- QUÉ ESTABA ROTO, Y LO ROMPIMOS NOSOTROS AYER. El 22-sep se encendió el chat
-- de la app del cliente con sus tres pestañas: servicio, cobranza y créditos
-- (20260914b_tres_canales). Pero `chat_responder` —la función con la que Joan
-- contesta desde el Panel— es de agosto y hace:
--
--     insert into public.mensajes (cedula, de, texto) values (...)
--
-- sin la columna `canal`. Esa columna existe desde ayer con
-- `default 'servicio'`, así que TODA respuesta de Joan queda marcada
-- 'servicio'. Y `chat_leer_sesion`, la que lee el cliente, filtra
-- `where cedula = llave and canal = v_canal`.
--
-- Resultado exacto: un cliente que pregunta por su crédito en la pestaña
-- «Créditos nuevos» ve su mensaje ahí para siempre, sin respuesta. La de Joan
-- está en «Servicio al cliente» y él no tiene motivo para ir a mirar. Y como
-- ayer se quitó el WhatsApp de play/, ese cliente se queda sin NINGÚN canal que
-- funcione. Es exactamente el crédito que no se desembolsa.
--
-- Al revés también: `chat_de` no devuelve `canal`, así que Joan lee los tres
-- hilos mezclados y no puede saber desde qué pestaña le escribieron.
--
-- EL ARREGLO DE FONDO, y es el que importa aunque nadie toque una pantalla:
-- si no se le dice el canal, `chat_responder` contesta EN EL CANAL DEL ÚLTIMO
-- MENSAJE DEL CLIENTE. Así la respuesta cae donde él está mirando por sí sola,
-- sin depender de que el Panel se acuerde de mandarlo. El parámetro existe para
-- cuando Joan quiera cambiarlo a propósito, no para que la corrección dependa
-- de él.
--
-- Y LO QUE NO SE TOCA: `chat_escribir` y `chat_leer`, que son el camino viejo
-- de app/socio.html. Esa app no tiene canales y sus mensajes caen en
-- 'servicio', que es donde tienen que caer. Meterle canales a una pantalla que
-- no los enseña sería partirle la conversación a los clientes que ya la usan.

-- ===================== 1. CONTESTAR EN EL CANAL CORRECTO =====================

-- Cambia la firma (entra p_canal), así que hay que soltar la vieja: con las dos
-- puestas, PostgREST no sabría a cuál llamar.
drop function if exists public.chat_responder(text, text, text);

create or replace function public.chat_responder(
  p_clave  text,
  p_cedula text,
  p_texto  text,
  p_canal  text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  ced     text;
  nuevo   bigint;
  v_canal text;
begin
  if not public.clave_ok(p_clave) then
    raise exception 'clave incorrecta';
  end if;

  ced := public.solo_digitos(p_cedula);
  if btrim(coalesce(p_texto, '')) = '' then return null; end if;

  -- EL CANAL. Tres formas de llegar a él, en orden:
  --  1. el que pidió Joan, si es uno de los tres válidos;
  --  2. si no dijo nada, el del ÚLTIMO mensaje DEL CLIENTE — que es donde está
  --     mirando, y por eso este es el caso normal y no el excepcional;
  --  3. y si nunca ha escrito, 'servicio', que es el de siempre.
  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos')
                  then p_canal else null end;

  if v_canal is null then
    select m.canal into v_canal
      from public.mensajes m
     where m.cedula = ced and m.de = 'socio'
     order by m.id desc
     limit 1;
  end if;

  v_canal := coalesce(v_canal, 'servicio');

  insert into public.mensajes (cedula, de, texto, canal)
       values (ced, 'panel', left(btrim(p_texto), 1000), v_canal)
    returning id into nuevo;

  return nuevo;
end
$$;

-- ===================== 2. JOAN VE POR DÓNDE LE ESCRIBIERON ===================

drop function if exists public.chat_de(text, text, bigint);

create or replace function public.chat_de(
  p_clave  text,
  p_cedula text,
  p_desde  bigint default 0,
  p_canal  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ced     text;
  v_canal text;
  salida  jsonb;
begin
  if not public.clave_ok(p_clave) then
    raise exception 'clave incorrecta';
  end if;

  ced := public.solo_digitos(p_cedula);
  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos')
                  then p_canal else null end;

  -- `canal` entra en la respuesta. Sin él, Joan lee los tres hilos mezclados y
  -- no puede saber desde qué pestaña le escribieron — que es justo lo que
  -- necesita para contestar donde toca.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'de', m.de, 'texto', m.texto, 'canal', m.canal,
           'regla', m.regla, 'visto', m.visto, 'creado_en', m.creado_en
         ) order by m.id), '[]'::jsonb)
    into salida
    from public.mensajes m
   where m.cedula = ced
     and m.id > coalesce(p_desde, 0)
     and (v_canal is null or m.canal = v_canal);

  -- Se marca como visto SOLO lo que de verdad se leyó. Antes se marcaban los
  -- tres canales aunque se estuviera mirando uno: el contador de la bandeja
  -- decía cero y quedaban mensajes sin contestar en otra pestaña.
  update public.mensajes
     set visto = true
   where cedula = ced and de = 'socio' and not visto
     and (v_canal is null or canal = v_canal);

  return salida;
end
$$;

-- ===================== 3. LA BANDEJA DICE EN QUÉ CANAL FALTA =================

create or replace function public.chat_conversaciones(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    raise exception 'clave incorrecta';
  end if;

  return coalesce((
    select jsonb_agg(c order by c->>'ultimo_en' desc)
      from (
        select jsonb_build_object(
                 'cedula',    m.cedula,
                 'nombre',    coalesce(s.nombre, ''),
                 'celular',   coalesce(s.celular, ''),
                 'ultimo',    (array_agg(m.texto order by m.id desc))[1],
                 'ultimo_de', (array_agg(m.de    order by m.id desc))[1],
                 'ultimo_en', max(m.creado_en),
                 'sin_leer',  count(*) filter (where m.de = 'socio' and not m.visto),
                 -- 22-sep-2026 — POR CANAL. Con tres pestañas, «2 sin leer» no
                 -- alcanza: Joan necesita saber en cuál, porque de eso depende
                 -- si es una duda, una promesa de pago o una solicitud.
                 'ultimo_canal', (array_agg(m.canal order by m.id desc))[1],
                 'sin_leer_canal', jsonb_build_object(
                    'servicio', count(*) filter (where m.de = 'socio' and not m.visto and m.canal = 'servicio'),
                    'cobranza', count(*) filter (where m.de = 'socio' and not m.visto and m.canal = 'cobranza'),
                    'creditos', count(*) filter (where m.de = 'socio' and not m.visto and m.canal = 'creditos'))
               ) as c
          from public.mensajes m
          left join public.socios_historial s on s.cedula = m.cedula
         group by m.cedula, s.nombre, s.celular
      ) t
  ), '[]'::jsonb);
end
$$;

-- ===================== 4. PERMISOS =====================

-- El Panel habla por `anon` + la clave de sincronización, como el resto de la
-- bandeja. Un `drop` se lleva los grants por delante, así que hay que
-- reponerlos: ese descuido exacto —un drop que se llevó los grants del chat—
-- dejó el chat abierto para los clientes y cerrado para el Panel en agosto.
revoke all on function public.chat_responder(text, text, text, text)   from public, anon, authenticated;
grant  execute on function public.chat_responder(text, text, text, text) to anon;
revoke all on function public.chat_de(text, text, bigint, text)        from public, anon, authenticated;
grant  execute on function public.chat_de(text, text, bigint, text)    to anon;
revoke all on function public.chat_conversaciones(text)                from public, anon, authenticated;
grant  execute on function public.chat_conversaciones(text)            to anon;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, no mirando que existan: el cuerpo de una PL/pgSQL compila en la
-- PRIMERA llamada, y así es como este repo estuvo trece días sin guardar fotos.
do $prueba$
declare
  ced     text := '99999999902';
  v_clave text;   -- NO «clave»: config_privada TIENE una columna llamada clave,
                  -- y `where clave = 'clave_sync'` sería ambiguo (SQLSTATE
                  -- 42702). Es el mismo descuido que con `huella` dejó trece
                  -- días sin guardar una sola foto de cliente, y no se ve hasta
                  -- que la función se EJECUTA.
  id1     bigint;
  j       jsonb;
  n       integer;
  pasos   text := '';
begin
  -- La clave de sincronización real, del mismo sitio del que la lee clave_ok.
  -- La columna va calificada por la misma razón de arriba.
  select cp.valor into v_clave
    from public.config_privada cp
   where cp.clave = 'clave_sync';
  if v_clave is null then
    raise exception 'no hay clave_sync en config_privada: esta migracion no se comprueba a ciegas';
  end if;

  -- Sobre el freno de clave_ok: cada clave BUENA lo devuelve a cero, así que
  -- estas siete llamadas correctas no acercan a Joan al tope de 10. La única
  -- que suma es la del final, que falla a propósito.

  ---- El cliente escribe en «creditos».
  insert into public.mensajes (cedula, de, texto, canal)
       values (ced, 'socio', 'Quiero pedir mas', 'creditos');

  ---- Joan contesta SIN decir el canal. Tiene que caer en 'creditos'.
  id1 := public.chat_responder(v_clave, ced, 'Claro, cuentame');
  if id1 is null then raise exception 'FALLO 1: no inserto la respuesta'; end if;
  if (select canal from public.mensajes where id = id1) <> 'creditos' then
    raise exception 'FALLO 1b GRAVE: la respuesta cayo en «%», no en el canal donde le escribieron',
      (select canal from public.mensajes where id = id1);
  end if;
  pasos := pasos || '1 contesta-donde-le-escribieron; ';

  ---- Y el cliente la ve: chat_leer_sesion filtra por canal.
  select count(*) into n from public.mensajes
   where cedula = ced and canal = 'creditos' and de = 'panel';
  if n <> 1 then raise exception 'FALLO 2: el cliente no ve la respuesta en su pestana'; end if;
  pasos := pasos || '2 el-cliente-la-ve; ';

  ---- Joan puede mandarla a otro canal a proposito.
  id1 := public.chat_responder(v_clave, ced, 'Por aqui lo de la cuota', 'cobranza');
  if (select canal from public.mensajes where id = id1) <> 'cobranza' then
    raise exception 'FALLO 3: no se puede escoger el canal a proposito';
  end if;
  pasos := pasos || '3 se-puede-escoger; ';

  ---- Un canal inventado NO rompe: cae en el del ultimo mensaje del cliente.
  id1 := public.chat_responder(v_clave, ced, 'prueba', 'canal-que-no-existe');
  if (select canal from public.mensajes where id = id1) <> 'creditos' then
    raise exception 'FALLO 4: un canal invalido no cayo en el del cliente';
  end if;
  pasos := pasos || '4 canal-invalido-no-rompe; ';

  ---- chat_de devuelve el canal de cada mensaje.
  j := public.chat_de(v_clave, ced, 0);
  if j->0->>'canal' is null then
    raise exception 'FALLO 5: chat_de sigue sin decir por que pestana le escribieron';
  end if;
  pasos := pasos || '5 chat_de-dice-el-canal; ';

  ---- Y filtrando por canal solo marca visto ESE canal.
  insert into public.mensajes (cedula, de, texto, canal)
       values (ced, 'socio', 'y esto es de cobranza', 'cobranza'),
              (ced, 'socio', 'y esto de servicio', 'servicio');
  perform public.chat_de(v_clave, ced, 0, 'cobranza');
  select count(*) into n from public.mensajes
   where cedula = ced and de = 'socio' and not visto and canal = 'servicio';
  if n <> 1 then
    raise exception 'FALLO 6: leer un canal marco como vistos los otros: el contador mentiria';
  end if;
  pasos := pasos || '6 visto-solo-lo-leido; ';

  ---- La bandeja dice en que canal falta.
  j := public.chat_conversaciones(v_clave);
  if not (j::text like '%sin_leer_canal%') then
    raise exception 'FALLO 7: la bandeja no dice en que canal hay pendientes';
  end if;
  pasos := pasos || '7 bandeja-por-canal; ';

  ---- Sin la clave, nada.
  begin
    perform public.chat_responder('clave-que-no-es', ced, 'hola');
    raise exception 'FALLO 8 GRAVE: se contesto SIN la clave de Joan';
  exception when others then
    if sqlerrm like 'FALLO 8%' then raise; end if;
  end;
  pasos := pasos || '8 pide-clave; ';

  raise exception 'TODO BIEN >>> % <<< (a proposito: deshace la prueba)', pasos;
end
$prueba$;

do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'chat_responder' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%canal%' then
    raise exception 'chat_responder sigue sin escribir el canal';
  end if;
  if cuerpo not like '%de = ''socio''%' then
    raise exception 'chat_responder no mira el ultimo mensaje DEL CLIENTE para escoger el canal';
  end if;

  if exists (select 1 from pg_proc
              where proname = 'chat_responder' and pronamespace = 'public'::regnamespace
                and pronargs = 3) then
    raise exception 'quedo la chat_responder vieja de tres argumentos: PostgREST no sabria a cual llamar';
  end if;
  if exists (select 1 from pg_proc
              where proname = 'chat_de' and pronamespace = 'public'::regnamespace
                and pronargs = 3) then
    raise exception 'quedo la chat_de vieja de tres argumentos';
  end if;

  -- Los grants, que un drop se lleva por delante. Es el descuido exacto que en
  -- agosto dejo el chat abierto para los clientes y cerrado para el Panel.
  if not has_function_privilege('anon', 'public.chat_responder(text, text, text, text)', 'execute') then
    raise exception 'chat_responder perdio el permiso del Panel al recrearse: Joan no podria contestar';
  end if;
  if not has_function_privilege('anon', 'public.chat_de(text, text, bigint, text)', 'execute') then
    raise exception 'chat_de perdio el permiso del Panel al recrearse';
  end if;
end $$;
