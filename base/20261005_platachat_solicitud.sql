-- ===========================================================================
-- PLATACHAT, FASE 1b — LA NEGOCIACIÓN CON RELOJ
-- 5 de octubre de 2026 (escrita el 15-sep-2026 sobre el contrato CONTRATO-1B)
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
-- Va DESPUÉS de 20260923_platachat_chat.sql. Si falta algo de lo anterior,
-- este archivo ABORTA en el primer bloque y dice qué falta.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «que llegue una contrapropuesta al CRM y si yo mismo o el gerente asignado
--  no da una contrapropuesta a ese cliente que el CRM en una hora la de
--  automaticamente calculando simpre el 35%, y mostrarle con claridad cuando
--  ganaria de garantia para su siguiente prestamo»
--
-- ---------------------------------------------------------------------------
-- CÓMO SE VOLVIÓ PLOMERÍA
--
-- 1. POR QUÉ EL RELOJ VIVE EN LA BASE Y NO EN EL CRM. «Que el CRM en una hora
--    la dé automáticamente» no puede ser el CRM: el CRM es una página en el
--    navegador de Joan y no existe cuando él no la tiene abierta. Lo único de
--    este negocio que está encendido a las tres de la mañana es la base. Por
--    eso el reloj es una columna (solicitudes.responder_antes_de: la hora
--    exacta, en el servidor, no «una hora» contada en un teléfono) y una sola
--    función, resolver_vencidas(), que promueve toda solicitud vencida a
--    contrapropuesta automática. La llaman al PRINCIPIO todas las funciones
--    que miran solicitudes —la del cliente al abrir el chat, la de Joan al
--    abrir la bandeja, la del gerente al contestar— así que el reloj corre
--    cada vez que alguien mira; y si algún día Joan enciende pg_cron, además
--    corre solo cada minuto (bloque opcional al final). Misma función, dos
--    disparadores, nada que reescribir después. Las fechas de la propuesta
--    automática se calculan desde la hora en que VENCIÓ, no desde el momento
--    en que alguien la leyó: el cliente ve la respuesta que le tocaba a esa
--    hora. La única excepción es honesta: si nadie miró en días y la fecha de
--    pago ya quedó atrás, se corre para adelante, porque una propuesta que
--    nace vencida no se puede aceptar (20260916 rechaza lo mismo).
--
-- 2. POR QUÉ LA AUTOMÁTICA DEL QUE YA TIENE GARANTÍA ES LA ESTÁNDAR. La
--    lectura literal de «siempre el 35 %» es la del cliente NUEVO: 35 % sobre
--    lo pedido con tope 100.000 a 8 días (politica_app, la política que Joan
--    fijó el 8-sep). Al cliente que YA tiene garantía la calculadora de la app
--    le acaba de mostrar otro precio: el de siempre dentro de su cupo
--    (costo_pct_cupo, 20 %, por cortes). Si el automático le contestara con
--    el 35 % del novato, la app le habría prometido una cosa y la base le
--    daría otra —la regla de la casa es que la interfaz no promete lo que el
--    código no cumple—. Así que la automática del que tiene garantía es la
--    ESTÁNDAR: lo pedido recortado al cupo, al precio de siempre, para la
--    fecha que él eligió. Y como es una decisión que Joan no contestó (plan,
--    sección 6, decisión 5), queda con interruptor: politica_app.con_garantia
--    = 'estandar' (defecto) | 'misma' (la del nuevo para todos, la lectura
--    literal). Se cambia desde Ajustes con politica_app_guardar, sin tocar
--    código. Por encima del cupo no se cotiza solo: se recorta al cupo y la
--    tarjeta lo dice en pesos. Si el cupo no alcanza ni para el mínimo, el
--    automático NO inventa un precio: deja la solicitud para una persona y lo
--    avisa.
--
-- 3. QUÉ PASA SIN TELEGRAM. Sin aviso la hora no existe: la bandeja del CRM
--    solo pregunta a la nube cuando Joan la abre, y casi toda solicitud se
--    iría al automático sin que nadie supiera que la ventana estuvo abierta.
--    El aviso sale de la base por pg_net a un bot de Telegram (token en
--    config_privada, clave 'telegram_token'; chat_id por destino en
--    avisos_destinos). Pero el aviso es un ACCESORIO de la solicitud, nunca su
--    condición: si no hay pg_net, o no hay token, o el destino no tiene
--    chat_id, o Telegram no contesta, se ANOTA una fila en `avisos` con ese
--    estado y la solicitud sigue su curso. Nunca se finge que salió: pg_net es
--    asíncrono, así que lo que se guarda es 'encolado' con el id de la
--    petición, y avisos_recientes lo cruza después con net._http_response
--    para decir 'entregado' o 'rechazado (código)'. Todo el envío va dentro de
--    un bloque que atrapa cualquier error: un aviso roto no puede tumbar una
--    solicitud.
--
-- LEY 1581. El aviso viaja a un tercero (Telegram). Lleva nombre, monto,
-- fecha y «cel ···1234» (los últimos cuatro): NUNCA la cédula ni el celular
-- completo. Todos los textos de aviso se arman en UNA sola función,
-- texto_aviso, para que haya un solo sitio que auditar.
--
-- EL CLIENTE NUNCA VE PORCENTAJES: los mensajes del hilo van en pesos
-- (pesos_texto), fechas y días. El porcentaje vive en la política y en el
-- JSON de la propuesta, que la pantalla convierte antes de pintar.
--
-- HORA DE COLOMBIA SIEMPRE. Supabase corre en UTC: a las 19:30 de Bogotá el
-- servidor ya está en mañana. Toda fecha de este archivo sale de hoy_bogota()
-- y toda hora que lee una persona, de hora_texto(); la fecha del servidor no
-- se usa en ninguna función nueva.
--
-- DOS VERDADES, NINGUNA. La aritmética de plata no se duplica: la propuesta
-- se arma en un solo molde (propuesta_platachat_de, capital × porcentaje,
-- redondeado, × cortes), y el cupo en SQL es la MISMA cuenta que hace
-- app/ficha.js leer(): greatest(0, total − least(comprometida, acumulada)),
-- con comprometida = la guardada, o la suma de saldo_capital de los
-- respaldados no pagados. El tope del motor (CUPO_MAXIMO, 20 millones) no
-- hace falta copiarlo porque queda por encima del rango de PlataChat
-- (capital_maximo, 2 millones).
--
-- AUTORES DEL CHAT: solo los que app/chat.js conoce —'socio', 'panel', 'auto',
-- 'equipo'—. El automático escribe como 'auto' con regla 'solicitud'; Joan
-- como 'panel'; el gerente como 'equipo'. No se inventa ninguno.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. LO ANTERIOR TIENE QUE ESTAR — antes de crear nada
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'falta correr base/20260914b_tres_canales.sql antes que este archivo (no existe llave_de_sesion)';
  end if;
  if to_regprocedure('public.contrapropuesta_de(bigint, integer, integer, text, text)') is null
     or to_regprocedure('public.mi_solicitud()') is null
     or to_regprocedure('public.listar_solicitudes_abiertas(text)') is null
     or to_regprocedure('public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text)') is null then
    raise exception 'falta correr base/20260908_primer_credito.sql antes que este archivo';
  end if;
  if to_regprocedure('public.mi_alcance(text)') is null
     or to_regprocedure('public.celular_de_sesion()') is null
     or to_regclass('public.equipo') is null
     or to_regclass('public.cartera') is null
     or to_regclass('public.asignaciones') is null then
    raise exception 'falta correr base/20260910_equipo_en_la_nube.sql antes que este archivo';
  end if;
  if to_regclass('public.politica_app') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'app') then
    raise exception 'falta correr base/20260921_platachat_app.sql antes que este archivo (no existe politica_app o solicitudes.app)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'mensajes_autor_ok' and conrelid = 'public.mensajes'::regclass
                    and pg_get_constraintdef(oid) like '%equipo%') then
    raise exception 'falta correr base/20260923_platachat_chat.sql antes que este archivo (mensajes.de no admite equipo)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensajes' and column_name = 'canal') then
    raise exception 'mensajes no tiene la columna canal: falta 20260914b_tres_canales.sql';
  end if;
  if to_regclass('public.config_privada') is null
     or to_regprocedure('public.clave_ok(text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null
     or to_regprocedure('public.chat_puede_escribir(text)') is null then
    raise exception 'falta base/supabase.sql: no existe config_privada, clave_ok, solo_digitos o chat_puede_escribir';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 26-sep-2026 — EL CANDADO CONTRA COPIAR CUERPOS
--
-- Más abajo, la sección 7 reescribe tres funciones que YA están vivas en la
-- base (mi_solicitud, listar_solicitudes_abiertas, contrapropuesta_solicitud)
-- copiando su cuerpo y añadiéndole el reloj. Copiar el cuerpo de una función
-- viva es justo como esta casa ha perdido cambios en silencio: el 22-sep otra
-- sesión reescribió una función así y se le fueron un pg_sleep, un tope y un
-- nullif que la versión viva tenía. Y este mismo archivo, escrito el 15-sep,
-- habría borrado el desempate que 20260922b le puso a mi_solicitud el 22.
--
-- Así que antes de tocar nada se compara la huella de lo que está vivo contra
-- la que se leyó de la base el 26-sep-2026 (pg_get_functiondef, solo lectura).
-- Si alguien cambió cualquiera de las tres desde entonces, el pegado se para
-- AQUÍ, antes de crear una sola tabla, y dice cuál. La huella es el md5 del
-- cuerpo sin los \r (se pegaron desde Windows y el cuerpo los conserva).
--
-- Si la función ya trae resolver_vencidas, es que este archivo ya corrió: no
-- hay nada que comparar y se sigue (correrlo dos veces no hace daño).
-- ---------------------------------------------------------------------------
do $$
declare r record; src text; h text;
begin
  for r in
    select * from (values
      ('public.mi_solicitud()',
       '54bd82b151a7c50b4b48244d822a9dc4'),
      ('public.listar_solicitudes_abiertas(text)',
       '1f520b159d7f05487c2088878eb4a636'),
      ('public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text)',
       'e531bbe4ead66b42c8968fdd447a6218')
    ) as t(firma, huella)
  loop
    select p.prosrc into src from pg_proc p where p.oid = to_regprocedure(r.firma);
    if src is null then
      raise exception 'no existe % en esta base: falta 20260908_primer_credito.sql', r.firma;
    end if;
    if position('resolver_vencidas' in src) > 0 then
      continue;
    end if;
    h := md5(replace(src, chr(13), ''));
    if h <> r.huella then
      raise exception 'La definición viva de % cambió desde el 26-sep-2026 (huella %, esperaba %). Este archivo la reescribe copiando su cuerpo y borraría ese cambio. No se creó nada: compárala con pg_get_functiondef, pon el cambio en la copia de la sección 7 y la huella nueva aquí, y vuelve a correrlo.',
        r.firma, h, r.huella;
    end if;
  end loop;
end $$;

-- pg_net: lo que deja que la base haga una llamada HTTP. Supabase lo trae y
-- 20260918_infobip.sql ya lo creó en el esquema `extensions`; se repite
-- IDÉNTICO (mismo esquema) para que este archivo se pueda correr solo.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. LAS COLUMNAS
--
-- solicitudes: el celular de la sesión que pidió (la cédula de la fila es la
-- llave del hilo, que cambia cuando el cliente se vincula; el celular no),
-- el reloj, el responsable, cuándo se resolvió, y lo que el cliente PIDIÓ
-- (pedido), que no es lo que se le propone (contrapropuesta).
-- ---------------------------------------------------------------------------
alter table public.solicitudes add column if not exists celular            text;
alter table public.solicitudes add column if not exists responder_antes_de timestamptz;
alter table public.solicitudes add column if not exists responsable        text;
alter table public.solicitudes add column if not exists resuelta_en        timestamptz;
alter table public.solicitudes add column if not exists pedido             jsonb;
-- 15-sep-2026 — EL FRENO DE REPROPONER, EN LA MISMA FILA QUE FRENA. Los dos
-- frenos que reproponer_platachat copió de solicitar_platachat cuentan filas
-- CREADAS en la última hora, y reproponer no crea ninguna (hace update sobre
-- la que ya existe): con una sola solicitud abierta el contador valía 1 para
-- siempre y los dos `if` no se cumplían nunca. Código muerto con cara de reja,
-- que es justo lo que esta casa ya pagó dos veces. El contador va acá, en la
-- solicitud, y reproponer lo sube en el MISMO update que hace el cambio: no
-- hay forma de repreguntar sin que suba, y se ve en la fila sin cruzar nada.
alter table public.solicitudes add column if not exists repropuestas       integer not null default 0;

-- El índice parcial es lo que hace barato el reloj: cuando no hay vencidas,
-- resolver_vencidas no lee ni una fila, y por eso puede ir al principio de
-- cada lectura sin que nadie lo note.
create index if not exists solicitudes_platachat_vencen
  on public.solicitudes (responder_antes_de)
  where estado = 'nueva' and app = 'platachat';
create index if not exists solicitudes_por_celular
  on public.solicitudes (celular);
-- Para el freno global («cuántas de PlataChat en 15 minutos»).
create index if not exists solicitudes_por_app_fecha
  on public.solicitudes (app, creada_en desc);

comment on column public.solicitudes.responder_antes_de is
  'PlataChat: hora (servidor) hasta la que una persona puede contestar; después la base contesta sola (resolver_vencidas). Null = no está en el reloj.';
comment on column public.solicitudes.responsable is
  'PlataChat: ''joan'' o el celular del gerente responsable (responsable_de). Recibe el aviso además de Joan.';
comment on column public.solicitudes.repropuestas is
  'PlataChat: cuántas veces el cliente cambió lo que pedía en ESTA solicitud (reproponer_platachat lo sube en el mismo update). Su freno: por encima de 10 no se aceptan más, porque cada repropuesta vuelve a poner el reloj y manda dos avisos a Telegram.';
comment on column public.solicitudes.pedido is
  'PlataChat: lo que el cliente pidió {capital, fecha_pago, cortes, cupo, garantia, tiene_garantia, espera_minutos} y qué va a hacer el automático a esa hora (automatica): ''nuevo'' = la del primer crédito, ''estandar'' = dentro del cupo, ''sin_cupo'' = no propone nada y contesta una persona. Se estampa al NACER la solicitud (y al repreguntar); el reloj solo lo corrige a ''sin_cupo'' o ''sin_politica'' si al vencer no pudo proponer.';

-- politica_app: el precio dentro del cupo, el rango de la calculadora y el
-- interruptor de la automática del que ya tiene garantía (ver la cabecera).
-- Los checks van con nombre y dentro de un bloque, porque `add column if not
-- exists` no admite `if not exists` para la constraint.
alter table public.politica_app add column if not exists costo_pct_cupo integer not null default 20;
alter table public.politica_app add column if not exists capital_minimo bigint  not null default 50000;
alter table public.politica_app add column if not exists capital_maximo bigint  not null default 2000000;
alter table public.politica_app add column if not exists con_garantia   text    not null default 'estandar';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'politica_app_costo_cupo_en_rango') then
    alter table public.politica_app
      add constraint politica_app_costo_cupo_en_rango check (costo_pct_cupo between 1 and 50);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'politica_app_minimo_positivo') then
    alter table public.politica_app
      add constraint politica_app_minimo_positivo check (capital_minimo > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'politica_app_maximo_positivo') then
    alter table public.politica_app
      add constraint politica_app_maximo_positivo check (capital_maximo > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'politica_app_con_garantia_valida') then
    alter table public.politica_app
      add constraint politica_app_con_garantia_valida check (con_garantia in ('estandar', 'misma'));
  end if;
end $$;

comment on column public.politica_app.con_garantia is
  '''estandar'' = la automática del que ya tiene garantía es la de siempre dentro del cupo (costo_pct_cupo). ''misma'' = la del nuevo (costo_pct, capital_tope, dias) para todos: la lectura literal de «siempre el 35 %».';

-- ---------------------------------------------------------------------------
-- 2. LAS TABLAS DE LOS AVISOS
--
-- `avisos` es el rastro de cada intento de avisar: SIEMPRE se escribe una
-- fila por destino, diga lo que diga el estado. Un aviso que no se anota es
-- un aviso que nadie puede auditar, y «¿por qué no me llegó?» tiene que
-- poder contestarse mirando una tabla.
--
-- `avisos_destinos`: a qué chat de Telegram se le escribe a cada quien.
-- 'joan' o el celular (10 dígitos) de alguien del equipo. El chat_id lo da
-- el bot la primera vez que la persona le escribe; Joan lo pega desde
-- Ajustes (avisos_destino_guardar) y lo prueba (aviso_probar).
-- ---------------------------------------------------------------------------
create table if not exists public.avisos (
  id           bigserial   primary key,
  evento       text        not null,
  solicitud_id bigint,
  destino      text        not null,
  chat_id      text,
  texto        text        not null,
  estado       text        not null default 'encolado'
                           constraint avisos_estado_valido
                           check (estado in ('encolado', 'sin_token', 'sin_destino', 'sin_pg_net', 'error')),
  peticion_id  bigint,
  detalle      text,
  creado_en    timestamptz not null default now()
);
create index if not exists avisos_por_fecha     on public.avisos (creado_en desc);
create index if not exists avisos_por_solicitud on public.avisos (solicitud_id);
alter table public.avisos enable row level security;
revoke all on table public.avisos from public, anon, authenticated;

create table if not exists public.avisos_destinos (
  quien       text        primary key,
  chat_id     text        not null,
  nombre      text        not null default '',
  activo      boolean     not null default true,
  actualizado timestamptz not null default now()
);
alter table public.avisos_destinos enable row level security;
revoke all on table public.avisos_destinos from public, anon, authenticated;

comment on table public.avisos is
  'Cada intento de avisar por Telegram, con su estado real: encolado (pg_net lo tomó; la respuesta llega aparte), sin_token, sin_destino, sin_pg_net, error. Nunca se finge que salió.';
comment on table public.avisos_destinos is
  'quien = ''joan'' o el celular (10 dígitos) de alguien del equipo → chat_id de Telegram. Solo lo escribe Joan desde Ajustes.';

-- ---------------------------------------------------------------------------
-- 3. LAS INTERNAS — sin permiso para nadie desde afuera
--
-- Textos, fechas y la aritmética en un solo sitio. Ninguna se llama por
-- PostgREST: se revocan de los tres y no se conceden.
-- ---------------------------------------------------------------------------

-- '$1.234.567'. Es lo único que el cliente lee sobre plata.
create or replace function public.pesos_texto(n bigint)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select '$' || replace(to_char(coalesce(n, 0), 'FM999,999,999,999,999'), ',', '.')
$$;

-- La fecha de HOY en Bogotá, o la de cualquier instante. Es la única forma
-- de decir «hoy» en este archivo.
create or replace function public.hoy_bogota(p timestamptz default now())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (p at time zone 'America/Bogota')::date
$$;

-- '16 sep', o '16 sep 2027' si no es el año en curso en Bogotá. No se usa
-- to_char con nombres de mes porque dependen del idioma del servidor.
create or replace function public.fecha_texto(p date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p is null then 'sin fecha'
    else extract(day from p)::integer::text || ' '
      || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p)::integer]
      || case when extract(year from p) <> extract(year from public.hoy_bogota())
              then ' ' || extract(year from p)::integer::text else '' end
  end
$$;

-- '3:40 p. m.', hora de Bogotá. FM solo en la hora: a los minutos les hace
-- falta el cero ('3:05', no '3:5').
create or replace function public.hora_texto(p timestamptz)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(p at time zone 'America/Bogota', 'FMHH12') || ':'
      || to_char(p at time zone 'America/Bogota', 'MI')
      || case when extract(hour from (p at time zone 'America/Bogota')) < 12 then ' a. m.' else ' p. m.' end
$$;

-- '' si es hoy en Bogotá, 'mañana ' si es mañana, 'el 16 sep ' si no. Es lo
-- que se antepone a una hora para que «antes de las 8:05 a. m.» no engañe a
-- quien pidió a las once de la noche.
create or replace function public.dia_bogota_texto(p timestamptz)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.hoy_bogota(p) = public.hoy_bogota()     then ''
    when public.hoy_bogota(p) = public.hoy_bogota() + 1 then 'mañana '
    else 'el ' || public.fecha_texto(public.hoy_bogota(p)) || ' '
  end
$$;

-- '3:40 p. m.' | 'mañana 8:05 a. m.' | 'el 16 sep 8:05 a. m.' — para los
-- mensajes del hilo y los avisos.
create or replace function public.hora_bogota_texto(p timestamptz)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.dia_bogota_texto(p) || public.hora_texto(p)
$$;

-- 'una quincena' … 'cuatro quincenas': los cortes, en palabras.
create or replace function public.quincenas_texto(n integer)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case coalesce(n, 1)
    when 1 then 'una quincena'
    when 2 then 'dos quincenas'
    when 3 then 'tres quincenas'
    when 4 then 'cuatro quincenas'
    else n::text || ' quincenas'
  end
$$;

-- Un valor del paquete `datos` leído como lo lee JavaScript (Number(v), y 0
-- si no es un número): el paquete lo escribe el Panel y a veces trae texto
-- donde uno espera número. Sin esto, un solo campo raro reventaría el cupo.
create or replace function public.numero_json(p jsonb)
returns numeric
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p is null then 0
    when jsonb_typeof(p) = 'number'  then (p #>> '{}')::numeric
    when jsonb_typeof(p) = 'string'
         and (p #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then btrim(p #>> '{}')::numeric
    when jsonb_typeof(p) = 'boolean' then case when (p #>> '{}')::boolean then 1 else 0 end
    else 0
  end
$$;

-- LA PROPUESTA, EN UN SOLO MOLDE. El mismo de contrapropuesta_de (capital ×
-- porcentaje, redondeado) más los cortes y la fecha explícita: cada corte de
-- más es una prórroga al mismo precio, así que costo = costo de un corte ×
-- cortes. NO llama a contrapropuesta_de porque aquella pone la fecha con la
-- del servidor (UTC) y acá la fecha viene decidida en hora de Bogotá.
create or replace function public.propuesta_platachat_de(
  p_capital bigint, p_pct integer, p_dias integer, p_fecha_pago date,
  p_cortes integer, p_texto text, p_por text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'capital',    p_capital,
    'costo_pct',  p_pct,
    'dias',       p_dias,
    'cortes',     greatest(1, coalesce(p_cortes, 1)),
    'costo',      round(p_capital * p_pct / 100.0)::bigint * greatest(1, coalesce(p_cortes, 1)),
    'total',      p_capital + round(p_capital * p_pct / 100.0)::bigint * greatest(1, coalesce(p_cortes, 1)),
    'fecha_pago', to_char(p_fecha_pago, 'YYYY-MM-DD'),
    'texto',      coalesce(p_texto, ''),
    'por',        p_por,
    'creada_en',  now()
  )
$$;

-- QUIÉN RESPONDE POR ESTE CLIENTE: la cadena cartera → asignaciones (la
-- última) → equipo. Si el asignado es un asesor, responde su jefe si es
-- gerente activo (el asesor no cotiza; el gerente sí); si el asignado es un
-- gerente activo, él. Si no hay nadie en la cadena, Joan. Joan recibe TODOS
-- los avisos de todas formas; el responsable recibe además los suyos.
create or replace function public.responsable_de(p_celular text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_asesor text; e public.equipo; v_jefe public.equipo;
begin
  select a.asesor into v_asesor
    from public.cartera p
    join public.asignaciones a on a.persona_id = p.id
   where p.celular = right(coalesce(p_celular, ''), 10)
   order by a.desde desc, a.id desc
   limit 1;
  if v_asesor is null then return 'joan'; end if;

  select * into e from public.equipo where celular = v_asesor;
  if not found then return 'joan'; end if;
  if e.rol = 'gerente' and e.estado = 'activo' then return e.celular; end if;
  if e.rol = 'asesor' and e.jefe is not null then
    select * into v_jefe from public.equipo
     where celular = e.jefe and rol = 'gerente' and estado = 'activo';
    if found then return v_jefe.celular; end if;
  end if;
  return 'joan';
end
$$;

-- EL CUPO, LA MISMA CUENTA QUE app/ficha.js leer(): total − min(comprometida,
-- ganada), nunca negativo; comprometida = la guardada, o la suma de
-- saldo_capital de los respaldados no pagados. Lee la ficha con el MISMO
-- predicado de llave_de_sesion y mi_cuenta (vinculada y con este celular):
-- sin vincular no hay ficha, y sin ficha el cupo es cero. No es un error, es
-- la verdad sobre alguien que todavía no ha probado quién es.
create or replace function public.cupo_platachat_de(p_cel text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r public.socios_historial; g jsonb; v_total numeric; v_acumulada numeric; v_comprometida numeric;
begin
  select * into r from public.socios_historial
   where auth_vinculada_en is not null and auth_celular = p_cel
   order by actualizado_en desc limit 1;
  if not found then
    return jsonb_build_object('vinculada', false, 'garantia_total', 0, 'cupo', 0);
  end if;

  g := case when jsonb_typeof(r.datos -> 'garantia') = 'object' then r.datos -> 'garantia' else '{}'::jsonb end;
  v_total     := public.numero_json(g -> 'total');
  v_acumulada := greatest(0, public.numero_json(g -> 'acumulada'));

  if g -> 'comprometida' is null or jsonb_typeof(g -> 'comprometida') = 'null' then
    -- Como en JS: `!r.pagado` — cuenta el que no tiene la marca puesta, y la
    -- marca puede venir como booleano, número o texto.
    select coalesce(sum(public.numero_json(x -> 'saldo_capital')), 0) into v_comprometida
      from jsonb_array_elements(case when jsonb_typeof(r.datos -> 'respaldados') = 'array'
                                     then r.datos -> 'respaldados' else '[]'::jsonb end) x
     where not (case jsonb_typeof(x -> 'pagado')
                  when 'boolean' then (x ->> 'pagado')::boolean
                  when 'number'  then public.numero_json(x -> 'pagado') <> 0
                  when 'string'  then (x ->> 'pagado') <> ''
                  else false end);
  else
    v_comprometida := public.numero_json(g -> 'comprometida');
  end if;

  return jsonb_build_object(
    'vinculada',      true,
    'garantia_total', floor(v_total)::bigint,
    'cupo',           greatest(0, floor(v_total - least(v_comprometida, v_acumulada)))::bigint);
end
$$;

-- LA LLAVE DEL HILO DE UNA SOLICITUD, HOY. La fila guarda la llave con la que
-- nació (cedula), pero el hilo del cliente se muda a la cédula de su ficha el
-- día que se vincula (vincular_cuenta mueve los mensajes). Un mensaje escrito
-- bajo la llave vieja caería en un hilo que ya nadie lee: por eso se vuelve a
-- resolver con llave_de_sesion sobre el celular, que es lo que no cambia.
create or replace function public.llave_de_solicitud(p_sol public.solicitudes)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when coalesce(p_sol.celular, '') <> ''
              then public.llave_de_sesion(p_sol.celular)
              else p_sol.cedula end
$$;

-- LOS TEXTOS DEL AVISO, TODOS ACÁ. Van a un tercero (Telegram), así que
-- llevan lo mínimo: nombre, monto, fecha y los últimos cuatro del celular.
-- Nunca la cédula ni el celular completo (Ley 1581). Si alguien agrega un
-- evento, lo agrega acá y en ningún otro sitio.
create or replace function public.texto_aviso(p_evento text, p_sol public.solicitudes, p_extra text default '')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base text; cp jsonb; cap bigint; tot bigint; f date;
  pedido_cap bigint; pedido_f date; extra text;
begin
  cp    := coalesce(p_sol.contrapropuesta, '{}'::jsonb);
  extra := btrim(coalesce(p_extra, ''));
  base  := 'PlataChat · #' || coalesce(p_sol.id::text, '?')
        || ' · ' || coalesce(nullif(btrim(coalesce(p_sol.nombre, '')), ''), 'Sin nombre')
        || ' · cel ···' || right(coalesce(p_sol.celular, ''), 4);
  cap := coalesce(nullif(cp ->> 'capital', '')::bigint, p_sol.capital, 0);
  tot := coalesce(nullif(cp ->> 'total', '')::bigint, p_sol.total, 0);
  f   := coalesce(nullif(cp ->> 'fecha_pago', '')::date, p_sol.fecha_corte);
  pedido_cap := coalesce(nullif(p_sol.pedido ->> 'capital', '')::bigint, p_sol.capital, 0);
  pedido_f   := coalesce(nullif(p_sol.pedido ->> 'fecha_pago', '')::date, p_sol.fecha_corte);

  return case p_evento
    when 'nueva' then
      base || case when extra <> '' then ' · ' || extra else ' · nueva solicitud' end
      || ' · pide ' || public.pesos_texto(pedido_cap)
      || ' para el ' || public.fecha_texto(pedido_f)
      || ' (' || public.quincenas_texto(coalesce(nullif(p_sol.pedido ->> 'cortes', '')::integer, 1)) || ')'
      || case when p_sol.responder_antes_de is null then ''
              else ' · plazo: ' || public.hora_bogota_texto(p_sol.responder_antes_de) || ' (Bogotá)' end
      || ' · contesta desde el CRM → Solicitudes'
    when 'aceptada' then
      base || ' · aceptó ' || public.pesos_texto(cap) || ' y devuelve ' || public.pesos_texto(tot)
      || ' el ' || public.fecha_texto(f) || ': entrégale la plata y crea el crédito'
    when 'automatica' then
      base || ' · se fue al automático: ' || public.pesos_texto(cap)
      || ', devuelve ' || public.pesos_texto(tot) || ' el ' || public.fecha_texto(f)
    when 'sin_automatica' then
      base || ' · pidió ' || public.pesos_texto(pedido_cap) || ' y el automático no lo pudo contestar'
      || case when extra <> '' then ': ' || extra else '' end
      || ' · contéstale desde el CRM → Solicitudes'
    when 'contestada' then
      base || ' · ' || coalesce(nullif(extra, ''), 'el equipo') || ' le propuso ' || public.pesos_texto(cap)
      || ', devuelve ' || public.pesos_texto(tot) || ' el ' || public.fecha_texto(f)
    else
      base || ' · ' || p_evento || case when extra <> '' then ' · ' || extra else '' end
  end;
end
$$;

-- AVISAR. Destinos: Joan siempre, y el responsable si no es Joan. Por cada
-- destino se escribe UNA fila en avisos con lo que pasó de verdad. Cada
-- destino va dentro de SU PROPIO bloque que atrapa cualquier error: si
-- Telegram, pg_net o esta misma función se rompen, queda una fila 'error' con
-- el motivo y la solicitud sigue. Un aviso nunca tumba lo que avisa.
--
-- 15-sep-2026 — POR QUÉ UN BLOQUE POR DESTINO Y NO UNO SOLO PARA EL BUCLE.
-- Un `begin … exception` es una SUBTRANSACCIÓN: lo que falle adentro deshace
-- todo lo que el bloque alcanzó a hacer. Con un solo bloque alrededor del
-- bucle entero, un error en el segundo destino (el gerente) borraba la fila
-- 'encolado' del primero (Joan) Y la petición que pg_net ya había encolado
-- dentro de la misma transacción: Joan no recibía el aviso y la tabla decía
-- que a Joan nunca se le intentó, justo al revés de lo que promete esta
-- función («SIEMPRE una fila por destino») y de la regla «Joan recibe TODOS
-- los avisos». Ahora un destino roto solo se rompe a sí mismo. Queda un
-- segundo guardián afuera para lo PREVIO al bucle (armar destinos, leer el
-- token, preguntar por pg_extension): si eso revienta no hay a quién
-- escribirle, así que se anota una sola fila a nombre de Joan y se sale.
--
-- pg_net es ASÍNCRONO: net.http_post entrega la petición a una cola y
-- devuelve su id; la respuesta cae en net._http_response segundos después.
-- Por eso el estado que se guarda es 'encolado', no 'enviado'.
create or replace function public.avisar_platachat(p_evento text, p_sol public.solicitudes, p_texto text)
returns void
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  destinos text[]; d text; dest public.avisos_destinos; token text;
  hay_pg_net boolean; v_estado text; v_detalle text; pid bigint;
begin
  -- Lo previo al bucle, protegido aparte: si falla, no hay a quién escribirle.
  begin
    destinos := array['joan'];
    if p_sol.responsable is not null and p_sol.responsable <> 'joan' then
      destinos := destinos || p_sol.responsable;
    end if;

    hay_pg_net := exists (select 1 from pg_extension where extname = 'pg_net');
    select valor into token from public.config_privada where clave = 'telegram_token';
    token := nullif(btrim(coalesce(token, '')), '');
  exception when others then
    insert into public.avisos (evento, solicitud_id, destino, texto, estado, detalle)
    values (p_evento, p_sol.id, 'joan', coalesce(p_texto, ''), 'error', left(sqlerrm, 500));
    return;
  end;

  foreach d in array destinos loop
    -- UN bloque por destino: lo que se deshaga acá no toca al destino anterior.
    begin
      dest := null; pid := null; v_estado := null; v_detalle := null;
      select * into dest from public.avisos_destinos where quien = d and activo;

      if not hay_pg_net then
        v_estado  := 'sin_pg_net';
        v_detalle := 'la extensión pg_net no está instalada: la base no puede llamar a Telegram';
      elsif token is null then
        v_estado  := 'sin_token';
        v_detalle := 'no hay telegram_token en config_privada (ver el final de 20261005_platachat_solicitud.sql)';
      elsif dest.quien is null or coalesce(btrim(dest.chat_id), '') = '' then
        v_estado  := 'sin_destino';
        v_detalle := 'no hay chat_id activo para ' || d || ' en avisos_destinos';
      else
        select net.http_post(
          url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
          body    := jsonb_build_object('chat_id', dest.chat_id, 'text', p_texto),
          headers := '{"Content-Type":"application/json"}'::jsonb,
          timeout_milliseconds := 10000
        ) into pid;
        v_estado := 'encolado';
      end if;

      insert into public.avisos (evento, solicitud_id, destino, chat_id, texto, estado, peticion_id, detalle)
      values (p_evento, p_sol.id, d, dest.chat_id, coalesce(p_texto, ''), v_estado, pid, v_detalle);
    exception when others then
      insert into public.avisos (evento, solicitud_id, destino, texto, estado, detalle)
      values (p_evento, p_sol.id, coalesce(d, 'joan'), coalesce(p_texto, ''), 'error', left(sqlerrm, 500));
    end;
  end loop;
end
$$;

-- EL RELOJ. Promueve toda solicitud de PlataChat 'nueva' y vencida a
-- contrapropuesta automática, y devuelve cuántas resolvió. VOLÁTIL, sin
-- permiso para nadie desde afuera; la llaman las funciones que miran
-- solicitudes y, si existe pg_cron, el minutero.
--
-- `for update skip locked`: dos lecturas al mismo tiempo (el cliente en su
-- chat y Joan en su bandeja) no se pisan ni se esperan; la que llegue segunda
-- se salta la fila que la primera ya tomó.
--
-- Las fechas salen de la hora en que VENCIÓ (responder_antes_de), no de
-- cuándo alguien leyó. Si por no haber pg_cron nadie miró en días y la fecha
-- de pago ya quedó atrás, se corre desde hoy: una propuesta que nace vencida
-- no se puede aceptar.
--
-- 15-sep-2026 — TRES ARREGLOS DE LA AUDITORÍA ADVERSARIA:
--
-- a) SIN LA FILA politica_app NO SE PUEDE CALLAR. Antes devolvía 0 y se iba.
--    La guarda del final exige la fila al pegar, pero nada impide un `delete`
--    desde el SQL Editor después (politica_app_guardar no la recrea a
--    propósito). En ese estado solicitar_platachat sí se niega, pero las
--    solicitudes YA creadas —cuyo hilo dice «a esa hora te contesta el
--    automático»— vencían y NADIE las contestaba: ni mensaje, ni fila en
--    avisos, ni ruido. Ahora salen del reloj con automatica='sin_politica',
--    el cliente lee que le contesta una persona y Joan se entera por el mismo
--    canal que todo lo demás.
--
-- b) NO SE VUELVE A CONTESTAR LO QUE UNA PERSONA YA RESOLVIÓ. solicitud_estado
--    del Panel (supabase.sql) puede devolver a 'nueva' una fila de PlataChat
--    que ya pasó por el automático, y no toca responder_antes_de: en la
--    siguiente lectura el reloj la tomaba otra vez y la contestaba sola con la
--    política de hoy, pisando la intención de Joan de que la mirara una
--    persona. El predicado `resuelta_en is null or resuelta_en <
--    responder_antes_de` deja entrar lo que reproponer reabrió (pone
--    resuelta_en = null) y deja fuera lo que el automático o el gerente
--    resolvieron DESPUÉS del vencimiento.
--
-- c) LA FECHA QUE EL CLIENTE YA LEYÓ MANDA (rama del nuevo). Antes la rama del
--    nuevo ignoraba pedido.fecha_pago y hacía `base + pol.dias`: pidiendo a
--    las 11:30 p. m. el vencimiento cae en el día siguiente en Bogotá y la
--    propuesta salía para hoy+9, cuando el hilo y la tarjeta ya le habían
--    dicho dos veces «Para el 23 sep». Con espera_minutos >= 1440 pasaba
--    siempre. Es un desvío del contrato, y a favor del cliente: primero lo
--    pedido, `base + pol.dias` solo como respaldo.
create or replace function public.resolver_vencidas()
returns integer
language plpgsql
volatile
security definer
set search_path = public, extensions, net
as $$
declare
  s public.solicitudes; s2 public.solicitudes; pol public.politica_app; info jsonb;
  tiene boolean; pedido_capital bigint; capital bigint; v_cupo bigint; pct integer;
  cortes integer; base date; hoy_real date; desde date; fecha date; dias integer;
  cp jsonb; txt text; v_llave text; n integer := 0; hay_pol boolean;
begin
  select * into pol from public.politica_app where app = 'platachat';
  hay_pol := found;
  hoy_real := public.hoy_bogota();

  for s in select * from public.solicitudes
            where app = 'platachat' and estado = 'nueva'
              and responder_antes_de is not null and responder_antes_de <= now()
              and (resuelta_en is null or resuelta_en < responder_antes_de)
            order by responder_antes_de
            for update skip locked
  loop
    v_llave := public.llave_de_solicitud(s);

    if not hay_pol then
      -- Sin política no hay precio que firmar, pero callarse sería peor: el
      -- hilo prometió una respuesta a esa hora. Sale del reloj y se avisa.
      update public.solicitudes
         set pedido = coalesce(pedido, '{}'::jsonb) || jsonb_build_object('automatica', 'sin_politica'),
             responder_antes_de = null,
             resuelta_en = now()
       where id = s.id
      returning * into s2;
      insert into public.mensajes (cedula, de, regla, texto, canal)
      values (v_llave, 'auto', 'solicitud',
              'No pude contestarte solo. Te contesta una persona por aquí.',
              'creditos');
      perform public.avisar_platachat('sin_automatica', s2,
        public.texto_aviso('sin_automatica', s2, 'no hay política de PlataChat en la base'));
      n := n + 1;
      continue;
    end if;

    info    := public.cupo_platachat_de(s.celular);
    tiene   := coalesce((info ->> 'garantia_total')::bigint, 0) > 0;
    v_cupo  := coalesce((info ->> 'cupo')::bigint, 0);
    pedido_capital := coalesce(nullif(s.pedido ->> 'capital', '')::bigint, s.capital);
    base    := public.hoy_bogota(s.responder_antes_de);

    if (not tiene) or pol.con_garantia = 'misma' then
      -- La del nuevo: 35 % sobre lo pedido con tope, a 8 días, un solo corte.
      -- La FECHA es la que pidió (y ya leyó dos veces); base + pol.dias solo
      -- si no la hay o si viene absurda. Ver (c) en la cabecera.
      capital := least(pedido_capital, pol.capital_tope);
      desde   := base;
      fecha   := nullif(s.pedido ->> 'fecha_pago', '')::date;
      if fecha is null or fecha > base + 120 then fecha := base + pol.dias; end if;
      if fecha <= hoy_real then desde := hoy_real; fecha := hoy_real + pol.dias; end if;
      pct := pol.costo_pct;
      cp  := public.propuesta_platachat_de(capital, pct, fecha - desde, fecha, 1, pol.texto, 'automatica_1h');
    else
      -- La estándar dentro del cupo, al precio de siempre, para la fecha que pidió.
      capital := least(pedido_capital, v_cupo);
      if capital < pol.capital_minimo then
        -- SIN PRECIO: el automático no inventa. Sale del reloj, sigue 'nueva'
        -- y una persona la contesta.
        update public.solicitudes
           set pedido = coalesce(pedido, '{}'::jsonb) || jsonb_build_object('automatica', 'sin_cupo'),
               responder_antes_de = null,
               resuelta_en = now()
         where id = s.id
        returning * into s2;
        insert into public.mensajes (cedula, de, regla, texto, canal)
        values (v_llave, 'auto', 'solicitud',
                'No pude contestarte solo: tu cupo hoy es ' || public.pesos_texto(v_cupo)
                || ' y el mínimo es ' || public.pesos_texto(pol.capital_minimo)
                || '. Te contesta una persona por aquí.',
                'creditos');
        perform public.avisar_platachat('sin_automatica', s2,
          public.texto_aviso('sin_automatica', s2,
            'su cupo hoy es ' || public.pesos_texto(v_cupo)
            || ' y el mínimo es ' || public.pesos_texto(pol.capital_minimo)));
        n := n + 1;
        continue;
      end if;

      cortes := least(4, greatest(1, coalesce(nullif(s.pedido ->> 'cortes', '')::integer, 1)));
      fecha  := nullif(s.pedido ->> 'fecha_pago', '')::date;
      if fecha is null or fecha < base + 1 or fecha > base + 120 then fecha := base + 15; end if;
      desde := base;
      if fecha <= hoy_real then desde := hoy_real; fecha := hoy_real + 15; end if;
      dias := fecha - desde;
      txt  := case when capital < pedido_capital
                then 'Tu cupo de hoy es ' || public.pesos_texto(v_cupo) || ': te proponemos eso. Pagando en fecha, el siguiente sube.'
                else 'Dentro de tu cupo, al precio de siempre.' end;
      pct := pol.costo_pct_cupo;
      cp  := public.propuesta_platachat_de(capital, pct, dias, fecha, cortes, txt, 'automatica_1h');
    end if;

    update public.solicitudes
       set estado          = 'contrapropuesta',
           contrapropuesta = cp,
           capital         = (cp ->> 'capital')::bigint,
           tasa            = pct / 100.0,
           costo           = (cp ->> 'costo')::bigint,
           total           = (cp ->> 'total')::bigint,
           fecha_corte     = fecha,
           producto        = 'quincenal',
           resuelta_en     = now(),
           aceptada_en     = null
     where id = s.id
    returning * into s2;

    insert into public.mensajes (cedula, de, regla, texto, canal)
    values (v_llave, 'auto', 'solicitud',
            'Nadie alcanzó a contestarte antes de la hora, así que te contesto yo, el automático: te proponemos '
            || public.pesos_texto((cp ->> 'capital')::bigint) || ' y devuelves '
            || public.pesos_texto((cp ->> 'total')::bigint) || ' el ' || public.fecha_texto(fecha)
            || '. Mira la tarjeta y decide.',
            'creditos');
    perform public.avisar_platachat('automatica', s2, public.texto_aviso('automatica', s2, ''));
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. DEL CLIENTE — con sesión
--
-- Ninguna va detrás del candado de 20260914b, y es a propósito: el cliente
-- NUEVO, que no tiene ficha, es justo el que PlataChat nació para atender.
-- Lo que sí pasa por la ficha es el cupo (cupo_platachat_de), y sin vincular
-- el cupo es cero.
--
-- Los frenos de solicitar CUENTAN filas (la lección del 14-sep: puede_intentar_tope solo
-- lee un contador que nadie incrementa para estas llaves, así que no frena
-- nunca): cinco solicitudes del mismo celular en una hora, sesenta de
-- PlataChat en quince minutos, y el freno del chat (chat_puede_escribir,
-- veinte mensajes del socio en quince minutos), porque cada solicitud
-- escribe en el hilo.
--
-- 15-sep-2026 — POR QUÉ PEDIR Y REPREGUNTAR NO FRENAN IGUAL. Este párrafo
-- decía «los frenos CUENTAN filas» de las dos, y de reproponer era falso:
-- copiaba los dos contadores de solicitar tal cual, y los dos cuentan filas
-- CREADAS en la última hora. reproponer no crea ninguna (hace update sobre la
-- que ya existe), así que con una sola solicitud abierta el contador valía 1
-- para siempre y ninguno de los dos `if` se cumplía nunca: código muerto con
-- cara de reja. Lo único que frenaba de verdad era chat_puede_escribir (20
-- mensajes de socio en 15 min), y como cada repropuesta escribe UN mensaje de
-- socio, el techo real era de ~20 cada 15 minutos por cuenta —80 a la hora—, y
-- CADA una vuelve a poner el reloj (borrando la propuesta que el gerente
-- acababa de hacer) y dispara dos mensajes de Telegram. Con el registro
-- abierto, N cuentas son N×80 avisos por hora al Telegram de Joan sin que
-- ninguna reja lo note.
--
-- La asimetría es deliberada y cada una cuenta LO SUYO: pedir crea filas, así
-- que se cuentan filas; repreguntar no crea nada, así que se cuenta en la
-- propia solicitud (solicitudes.repropuestas, que sube en el mismo update) con
-- un techo de diez por solicitud. Se descartó contar filas de `avisos`: ataría
-- el freno al sistema de avisos, y el día que alguien cambie cómo se escriben
-- los avisos el freno desaparecería en silencio —exactamente la forma de fallo
-- que esta sección existe para no repetir—.
-- ---------------------------------------------------------------------------

-- LA POLÍTICA QUE LA PANTALLA PUEDE COTIZAR. Lo único que devuelve son los
-- números con los que a ESA persona se le va a hacer la propuesta: no hay nada
-- privado que esconder, es exactamente el precio que va a ver.
--
-- 15-sep-2026 — POR QUÉ EXISTE. La calculadora de platachat/index.html cotiza
-- el primer crédito con constantes del motor (35 %, 100.000, 8 días) mientras
-- el automático usa politica_app —la misma que esta fase estrena editable
-- desde Ajustes (politica_app_guardar)—. Hasta hoy coincidían por casualidad,
-- porque los defaults son los mismos. El día que Joan ponga 30 % o 10 días, la
-- pantalla seguiría enseñando «$135.000 el 23 sep» y la base firmaría
-- $130.000 el 25: dos verdades sobre la misma plata, y la de la pantalla es la
-- que el cliente leyó primero. Con esto la pantalla pregunta y las constantes
-- quedan solo de salvavidas cuando la llamada no llega.
--
-- STABLE a propósito: es la única función de este archivo que SOLO lee (no
-- toca el reloj, no pasa por clave_ok, no escribe). Por eso tampoco entra en
-- la guarda de volatilidad del bloque final, que exige 'v' a las demás.
create or replace function public.politica_platachat()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare pol public.politica_app;
begin
  select * into pol from public.politica_app where app = 'platachat';
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'politica', jsonb_build_object(
    'capital_tope',   pol.capital_tope,
    'costo_pct',      pol.costo_pct,
    'dias',           pol.dias,
    'costo_pct_cupo', pol.costo_pct_cupo,
    'capital_minimo', pol.capital_minimo,
    'capital_maximo', pol.capital_maximo,
    'espera_minutos', pol.espera_minutos,
    'con_garantia',   pol.con_garantia,
    'texto',          pol.texto));
end
$$;

-- EL CLIENTE PIDE. Nace 'nueva', con el reloj puesto y el responsable
-- calculado; el disparador manda el aviso. Idempotente: si ya tiene una
-- abierta, contesta esa (ya_habia = true). La fila guarda el precio ESPERADO
-- (lo que la calculadora le mostró) y `pedido` guarda lo que pidió; la
-- propuesta de verdad llega después, humana o automática.
--
-- 15-sep-2026 — `pedido.automatica` SE ESTAMPA AL NACER. La pantalla promete
-- «a esa hora te contesta el automático con una propuesta», y en un caso la
-- base ya sabe que eso es mentira. Quien decide es esta función, que tiene la
-- política y el cupo delante; la página solo lee la palabra. Tres valores, y
-- son EL MISMO predicado que usa resolver_vencidas al vencer:
--   'nuevo'    → sin garantía, o con_garantia = 'misma': la del primer crédito.
--   'estandar' → con garantía y cupo >= capital_minimo: dentro del cupo.
--   'sin_cupo' → con garantía y cupo < capital_minimo: el automático NO va a
--                proponer nada; contesta una persona (y el hilo lo dice).
-- Va también `espera_minutos`, el de la política EN ESTE INSTANTE, para que la
-- página no tenga que clavar «una hora» mientras Ajustes la deja mover de 1 a
-- 1440. Ojo: mirar `con_garantia` es lo que arregla el caso 'misma' —antes el
-- hilo decía «te contesta una persona» y a la hora contestaba el automático
-- con la del nuevo, porque el mensaje miraba el cupo y el reloj no.
--
-- 15-sep-2026 — EL CANDADO CONTRA EL DOBLE TOQUE. Entre el select de ya_habia
-- y el insert no había nada: dos peticiones a la vez del mismo celular (doble
-- toque, dos pestañas, el reintento del navegador) leían las dos «no hay» y
-- creaban DOS solicitudes abiertas. mi_solicitud_platachat devuelve la última,
-- así que la página solo veía una; la otra vencía, el automático le ponía
-- precio, avisaba a Joan y quedaba en la bandeja como una segunda solicitud
-- fantasma del mismo cliente. Se serializa por celular con un advisory lock de
-- transacción (se suelta solo al terminar). Se prefiere al índice único
-- parcial porque un índice único ABORTA el pegado si la base ya trae
-- duplicados de antes, y este archivo tiene que poder correrse sobre lo que
-- haya.
create or replace function public.solicitar_platachat(p_capital bigint, p_fecha_pago date, p_cortes integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cel text; llave text; pol public.politica_app; info jsonb; tiene boolean;
  hoy date; fecha date; cortes integer; pct integer; v_costo bigint; dias integer;
  s public.solicitudes; r public.registros; sh public.socios_historial; nombre text; n integer;
  v_cupo bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  llave := public.llave_de_sesion(cel);

  select count(*) into n from public.solicitudes
   where celular = cel and creada_en > now() - interval '1 hour';
  if n >= 5 then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiadas seguidas');
  end if;
  select count(*) into n from public.solicitudes
   where app = 'platachat' and creada_en > now() - interval '15 minutes';
  if n >= 60 then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiadas seguidas');
  end if;
  if not public.chat_puede_escribir(llave) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiados mensajes seguidos');
  end if;

  select * into pol from public.politica_app where app = 'platachat';
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'falta la política de PlataChat en la base');
  end if;

  info   := public.cupo_platachat_de(cel);
  tiene  := coalesce((info ->> 'garantia_total')::bigint, 0) > 0;
  v_cupo := coalesce((info ->> 'cupo')::bigint, 0);
  hoy    := public.hoy_bogota();
  cortes := coalesce(p_cortes, 1);
  -- Sin fecha: la del primer crédito del nuevo (8 días) o la quincena de siempre.
  fecha  := coalesce(p_fecha_pago, case when tiene then hoy + 15 else hoy + pol.dias end);

  if p_capital is null or p_capital < pol.capital_minimo or p_capital > pol.capital_maximo
     or cortes < 1 or cortes > 4
     or fecha < hoy + 1 or fecha > hoy + 120 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;

  -- El candado: de acá al insert no puede colarse otra petición del mismo
  -- celular. Es de transacción, así que se suelta solo (ver la cabecera).
  perform pg_advisory_xact_lock(hashtext('platachat:' || cel));

  -- Ya hay una abierta: se contesta esa. Por celular O por la llave del hilo,
  -- porque la que nació antes de vincularse quedó bajo el celular.
  select * into s from public.solicitudes
   where app = 'platachat' and estado in ('nueva', 'contrapropuesta', 'aceptada')
     and (celular = cel or cedula = llave)
   order by creada_en desc, id desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'ya_habia', true, 'solicitud', to_jsonb(s) - 'responsable');
  end if;

  -- El nombre, en este orden: la ficha si está vinculada, el registro por
  -- teléfono, lo que declaró al registrarse, y si nada, 'Registrado' (como
  -- solicitar_primer_credito).
  select * into sh from public.socios_historial
   where auth_vinculada_en is not null and auth_celular = cel
   order by actualizado_en desc limit 1;
  select * into r from public.registros
   where right(public.solo_digitos(telefono), 10) = right(cel, 10)
   order by creado_en desc limit 1;
  nombre := coalesce(
    nullif(btrim(coalesce(sh.nombre, '')), ''),
    nullif(btrim(coalesce(r.nombre, '')), ''),
    nullif(left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', '')), 80), ''),
    'Registrado');

  pct     := case when tiene then pol.costo_pct_cupo else pol.costo_pct end;
  v_costo := round(p_capital * pct / 100.0)::bigint * cortes;
  dias    := fecha - hoy;

  insert into public.solicitudes
    (cedula, celular, nombre, capital, tasa, costo, total, fecha_corte, garantia, cupo, sobre_cupo,
     producto, estado, app, pedido, datos, registro_id, responder_antes_de, responsable)
  values
    (llave, cel, nombre, p_capital, pct / 100.0, v_costo, p_capital + v_costo, fecha,
     (info ->> 'garantia_total')::bigint, (info ->> 'cupo')::bigint,
     p_capital > coalesce((info ->> 'cupo')::bigint, 0),
     'quincenal', 'nueva', 'platachat',
     jsonb_build_object('capital', p_capital, 'fecha_pago', to_char(fecha, 'YYYY-MM-DD'),
                        'cortes', cortes, 'cupo', (info ->> 'cupo')::bigint,
                        'garantia', (info ->> 'garantia_total')::bigint, 'tiene_garantia', tiene,
                        'automatica', case when not tiene or pol.con_garantia = 'misma' then 'nuevo'
                                           when v_cupo >= pol.capital_minimo            then 'estandar'
                                           else 'sin_cupo' end,
                        'espera_minutos', pol.espera_minutos),
     coalesce(r.datos, '{}'::jsonb), r.id,
     now() + pol.espera_minutos * interval '1 minute',
     public.responsable_de(cel))
  returning * into s;

  -- La conversación cuenta lo que pasó: lo que pidió, del lado del cliente, y
  -- el recibido con la hora real, del automático. Si ya se sabe que el cupo no
  -- alcanza para el mínimo, no se le promete una propuesta que no va a llegar.
  insert into public.mensajes (cedula, de, texto, canal)
  values (llave, 'socio',
          'Quiero pedir ' || public.pesos_texto(p_capital) || ' para el ' || public.fecha_texto(fecha)
          || ' (en ' || dias::text || ' días, ' || public.quincenas_texto(cortes) || ').',
          'creditos');
  insert into public.mensajes (cedula, de, regla, texto, canal)
  values (llave, 'auto', 'solicitud',
          'Recibido. Te contestamos por aquí ' || public.dia_bogota_texto(s.responder_antes_de)
          || 'antes de las ' || public.hora_texto(s.responder_antes_de) || ' (hora de Colombia). '
          -- 15-sep-2026 — LA PRIMERA RAMA ES EL INTERRUPTOR. Con con_garantia
          -- = 'misma' el automático le contesta a TODO el mundo con la del
          -- nuevo (resolver_vencidas: `if (not tiene) or pol.con_garantia =
          -- 'misma'`), también al que tiene el cupo por debajo del mínimo.
          -- Antes el mensaje solo miraba el cupo: el hilo le prometía «te
          -- contesta una persona» y a la hora le contestaba la máquina.
          || case when pol.con_garantia = 'misma'
               then 'Si nadie alcanza, a esa hora te contesta el automático con una propuesta.'
               when tiene and coalesce((info ->> 'cupo')::bigint, 0) < pol.capital_minimo
               then 'Como tu cupo de hoy es ' || public.pesos_texto(v_cupo)
                    || ', te contesta una persona.'
               else 'Si nadie alcanza, a esa hora te contesta el automático con una propuesta.' end,
          'creditos');

  return jsonb_build_object('ok', true, 'ya_habia', false, 'solicitud', to_jsonb(s) - 'responsable');
end
$$;

-- LO MÍO, en PlataChat. Corre el reloj primero: si la hora ya pasó, lo que se
-- devuelve es la propuesta automática, no una 'nueva' vencida. VOLÁTIL por
-- eso. `ahora` viaja para que la pantalla cuente el plazo con el reloj del
-- servidor y no con el del teléfono.
create or replace function public.mi_solicitud_platachat()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; llave text; s public.solicitudes;
begin
  perform public.resolver_vencidas();
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  llave := public.llave_de_sesion(cel);

  select * into s from public.solicitudes
   where app = 'platachat' and (celular = cel or cedula = llave)
   order by creada_en desc, id desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'solicitud', null, 'ahora', now());
  end if;
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s) - 'responsable', 'ahora', now());
end
$$;

-- ACEPTAR. Solo la suya y solo en 'contrapropuesta': una propuesta que alguien
-- cambió vuelve a ese estado, así que lo que se acepta es siempre lo que el
-- cliente tiene delante. Aceptar NO desembolsa: el disparador avisa
-- 'aceptada' y una persona entrega la plata.
create or replace function public.aceptar_propuesta_platachat(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; llave text; s public.solicitudes; cp jsonb;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  llave := public.llave_de_sesion(cel);

  update public.solicitudes
     set estado = 'aceptada',
         aceptada_en = now(),
         contrapropuesta = coalesce(contrapropuesta, '{}'::jsonb)
                           || jsonb_build_object('aceptada_en', now())
   where id = p_id and app = 'platachat'
     and (celular = cel or cedula = llave)
     and estado = 'contrapropuesta'
  returning * into s;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  cp := coalesce(s.contrapropuesta, '{}'::jsonb);
  insert into public.mensajes (cedula, de, texto, canal)
  values (public.llave_de_solicitud(s), 'socio',
          'Acepto: recibo ' || public.pesos_texto(coalesce(nullif(cp ->> 'capital', '')::bigint, s.capital))
          || ' y devuelvo ' || public.pesos_texto(coalesce(nullif(cp ->> 'total', '')::bigint, s.total))
          || ' el ' || public.fecha_texto(coalesce(nullif(cp ->> 'fecha_pago', '')::date, s.fecha_corte)) || '.',
          'creditos');

  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s) - 'responsable');
end
$$;

-- PROPONER OTRA CIFRA. Solo la suya, 'nueva' o 'contrapropuesta'. Vuelve a
-- 'nueva' con el reloj puesto otra vez: la propuesta anterior se borra
-- (nadie acepta lo que ya no está) y el disparador vuelve a avisar.
--
-- MISMAS REJAS que pedir (rango, cortes, fecha) y un freno PROPIO, no el de
-- pedir: los dos contadores de solicitar cuentan filas creadas y acá no se
-- crea ninguna, así que serían código muerto. El de acá es directo —
-- solicitudes.repropuestas, que sube en el mismo update, con techo de diez—
-- más chat_puede_escribir, que ya estaba. El porqué largo está en la cabecera
-- de la sección 4.
create or replace function public.reproponer_platachat(
  p_id bigint, p_capital bigint, p_fecha_pago date, p_cortes integer, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cel text; llave text; pol public.politica_app; info jsonb; tiene boolean;
  hoy date; fecha date; cortes integer; pct integer; v_costo bigint; dias integer;
  s public.solicitudes; estado_antes text; txt text; n integer;
  v_cupo bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  llave := public.llave_de_sesion(cel);

  if not public.chat_puede_escribir(llave) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiados mensajes seguidos');
  end if;

  select * into pol from public.politica_app where app = 'platachat';
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'falta la política de PlataChat en la base');
  end if;

  info   := public.cupo_platachat_de(cel);
  tiene  := coalesce((info ->> 'garantia_total')::bigint, 0) > 0;
  v_cupo := coalesce((info ->> 'cupo')::bigint, 0);
  hoy    := public.hoy_bogota();
  cortes := coalesce(p_cortes, 1);
  fecha  := coalesce(p_fecha_pago, case when tiene then hoy + 15 else hoy + pol.dias end);

  if p_capital is null or p_capital < pol.capital_minimo or p_capital > pol.capital_maximo
     or cortes < 1 or cortes > 4
     or fecha < hoy + 1 or fecha > hoy + 120 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;

  select * into s from public.solicitudes
   where id = p_id and app = 'platachat'
     and (celular = cel or cedula = llave)
     and estado in ('nueva', 'contrapropuesta')
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'esa solicitud ya no está abierta');
  end if;
  estado_antes := s.estado;

  -- EL FRENO DE ESTA FUNCIÓN. La fila está bloqueada (`for update`), así que
  -- el contador se lee y se sube sin carreras. Diez cambios por solicitud: por
  -- encima, el reloj y el Telegram de Joan dejarían de significar nada.
  if coalesce(s.repropuestas, 0) >= 10 then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiados cambios en esta solicitud');
  end if;

  pct     := case when tiene then pol.costo_pct_cupo else pol.costo_pct end;
  v_costo := round(p_capital * pct / 100.0)::bigint * cortes;
  dias    := fecha - hoy;
  txt     := left(btrim(coalesce(p_texto, '')), 400);

  update public.solicitudes
     set capital            = p_capital,
         tasa               = pct / 100.0,
         costo              = v_costo,
         total              = p_capital + v_costo,
         fecha_corte        = fecha,
         garantia           = (info ->> 'garantia_total')::bigint,
         cupo               = (info ->> 'cupo')::bigint,
         sobre_cupo         = p_capital > coalesce((info ->> 'cupo')::bigint, 0),
         pedido             = jsonb_build_object('capital', p_capital, 'fecha_pago', to_char(fecha, 'YYYY-MM-DD'),
                                                 'cortes', cortes, 'cupo', (info ->> 'cupo')::bigint,
                                                 'garantia', (info ->> 'garantia_total')::bigint,
                                                 'tiene_garantia', tiene,
                                                 'automatica', case when not tiene or pol.con_garantia = 'misma' then 'nuevo'
                                                                    when v_cupo >= pol.capital_minimo            then 'estandar'
                                                                    else 'sin_cupo' end,
                                                 'espera_minutos', pol.espera_minutos),
         -- El freno de esta función sube en el MISMO update que el cambio: no
         -- hay forma de repreguntar sin que el contador lo note.
         repropuestas       = coalesce(repropuestas, 0) + 1,
         contrapropuesta    = null,
         estado             = 'nueva',
         resuelta_en        = null,
         aceptada_en        = null,
         responder_antes_de = now() + pol.espera_minutos * interval '1 minute',
         responsable        = public.responsable_de(cel)
   where id = s.id
  returning * into s;

  insert into public.mensajes (cedula, de, texto, canal)
  values (public.llave_de_solicitud(s), 'socio',
          'Prefiero ' || public.pesos_texto(p_capital) || ' para el ' || public.fecha_texto(fecha)
          || ' (en ' || dias::text || ' días, ' || public.quincenas_texto(cortes) || ').'
          || case when txt <> '' then ' ' || txt else '' end,
          'creditos');
  insert into public.mensajes (cedula, de, regla, texto, canal)
  values (public.llave_de_solicitud(s), 'auto', 'solicitud',
          'Recibido. Te contestamos por aquí ' || public.dia_bogota_texto(s.responder_antes_de)
          || 'antes de las ' || public.hora_texto(s.responder_antes_de) || ' (hora de Colombia). '
          -- La primera rama es el interruptor (ver solicitar_platachat).
          || case when pol.con_garantia = 'misma'
               then 'Si nadie alcanza, a esa hora te contesta el automático con una propuesta.'
               when tiene and coalesce((info ->> 'cupo')::bigint, 0) < pol.capital_minimo
               then 'Como tu cupo de hoy es ' || public.pesos_texto(v_cupo)
                    || ', te contesta una persona.'
               else 'Si nadie alcanza, a esa hora te contesta el automático con una propuesta.' end,
          'creditos');

  -- El disparador solo avisa cuando CAMBIA el estado. Si seguía 'nueva' (nadie
  -- había contestado y el cliente cambió la cifra), se avisa desde acá, que
  -- el responsable tiene que saber que lo que va a contestar ya no es lo mismo.
  if estado_antes = 'nueva' then
    perform public.avisar_platachat('nueva', s, public.texto_aviso('nueva', s, 'cambió lo que pedía'));
  end if;

  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s) - 'responsable');
end
$$;

-- ---------------------------------------------------------------------------
-- 5. DEL EQUIPO — el gerente contesta desde su celular, con sesión
--
-- ALCANCE: la solicitud es suya si él es el responsable, o si la persona de
-- su cartera con ese celular tiene como último asesor a alguien de su
-- alcance (la reja de gestion_anotar y chat_responder_equipo). Misma respuesta
-- para «no existe» y para «no es mía»: no se distingue, para no delatar nada.
-- Solo el rol gerente cotiza: el asesor vende y cobra, no pone precio.
-- ---------------------------------------------------------------------------
create or replace function public.contrapropuesta_gerente(
  p_id bigint, p_capital bigint, p_costo_pct integer, p_dias integer, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel text; yo public.equipo; mios text[]; duenio text; s public.solicitudes; s_joan public.solicitudes;
  cp jsonb; es_mia boolean; txt text; fecha date;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' or yo.rol <> 'gerente' then
    return jsonb_build_object('ok', false);
  end if;

  perform public.resolver_vencidas();

  select * into s from public.solicitudes
   where id = p_id and app = 'platachat'
     and estado in ('nueva', 'contrapropuesta', 'aceptada');
  es_mia := found and s.responsable = yo.celular;
  if found and not es_mia then
    mios := public.mi_alcance(yo.celular);
    select a.asesor into duenio
      from public.cartera p
      join public.asignaciones a on a.persona_id = p.id
     where p.celular = right(coalesce(s.celular, ''), 10)
     order by a.desde desc, a.id desc limit 1;
    es_mia := duenio is not null and duenio = any(mios);
  end if;
  if not es_mia then
    return jsonb_build_object('ok', false, 'motivo', 'esa solicitud no es de tu base');
  end if;

  -- Las rejas de contrapropuesta_solicitud, tal cual.
  if p_capital is null or p_capital < 10000 or p_capital > 20000000
     or p_costo_pct is null or p_costo_pct < 1 or p_costo_pct > 50
     or p_dias is null or p_dias < 1 or p_dias > 60 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;

  txt   := left(btrim(coalesce(p_texto, '')), 400);
  fecha := public.hoy_bogota() + p_dias;
  cp    := public.propuesta_platachat_de(p_capital, p_costo_pct, p_dias, fecha, 1, txt, 'gerente:' || yo.celular);

  -- Como contrapropuesta_solicitud: vuelve a 'contrapropuesta' (el cliente
  -- tiene que volver a aceptar lo que ahora ve). El reloj se conserva como
  -- rastro de cuándo vencía; resuelta_en dice que una persona alcanzó.
  update public.solicitudes
     set contrapropuesta = cp,
         estado      = 'contrapropuesta',
         aceptada_en = null,
         resuelta_en = now(),
         capital     = (cp ->> 'capital')::bigint,
         tasa        = p_costo_pct / 100.0,
         costo       = (cp ->> 'costo')::bigint,
         total       = (cp ->> 'total')::bigint,
         fecha_corte = fecha,
         producto    = 'quincenal'
   where id = s.id
  returning * into s;

  insert into public.mensajes (cedula, de, texto, canal)
  values (public.llave_de_solicitud(s), 'equipo',
          'Te propongo ' || public.pesos_texto((cp ->> 'capital')::bigint)
          || '; devuelves ' || public.pesos_texto((cp ->> 'total')::bigint)
          || ' el ' || public.fecha_texto(fecha) || '.'
          || case when txt <> '' then ' ' || txt else '' end,
          'creditos');

  -- Solo a Joan: el gerente ya sabe lo que acaba de hacer. Se le pasa la fila
  -- sin responsable para que avisar_platachat no se la mande de vuelta.
  s_joan := s;
  s_joan.responsable := null;
  perform public.avisar_platachat('contestada', s_joan, public.texto_aviso('contestada', s, yo.nombre));

  -- 15-sep-2026 — LEY 1581: AL GERENTE, LO JUSTO PARA COTIZAR. Restar solo
  -- 'responsable' dejaba viajar `cedula` (la llave real de la ficha si el
  -- cliente está vinculado), `registro_id` y sobre todo `datos`, que es el
  -- paquete REGISTRO que manda play/index.html: documento, tipo_doc, nombres,
  -- apellidos, verificación. 20260910_equipo_en_la_nube fija la regla del
  -- equipo —«Nombre, celular y en qué etapa está. Nada más — ni cédula, ni
  -- dirección, ni fotos, ni cuánto debe»— y esta era una puerta que el resto
  -- del sistema le cierra. El celular sí se queda: es con lo que va a hablar.
  return jsonb_build_object('ok', true,
    'solicitud', to_jsonb(s) - 'responsable' - 'datos' - 'cedula' - 'registro_id');
end
$$;

-- ---------------------------------------------------------------------------
-- 6. DE JOAN — con la llave pública más su clave de sincronización
--
-- Tres se REDEFINEN con la misma firma y el cuerpo copiado de
-- 20260908_primer_credito.sql (no reescrito de memoria: copiar de memoria es
-- como se inventan defectos arreglando otros). Lo único que se les añade es
-- el reloj —y a contrapropuesta_solicitud, el mensaje en el hilo de
-- PlataChat—, con su comentario. Ninguna cambia de firma: una firma nueva
-- sobre el mismo nombre sería una sobrecarga que PostgREST no sabe resolver.
-- ---------------------------------------------------------------------------

-- LO MÍO (la app del socio de Tu Garantía y play/). Cuerpo de 20260908 más
-- DOS líneas: corre el reloj antes de mirar, y el JSON sale sin `responsable`.
-- Y sin `stable`: una función que escribe —resolver_vencidas escribe—
-- declarada stable revienta con 25006 sin que nadie se entere (dos estuvieron
-- muertas dos días en septiembre).
--
-- 15-sep-2026 — POR QUÉ TAMBIÉN ACÁ SE RESTA EL RESPONSABLE. Un cliente de
-- PlataChat sin vincular tiene llave_de_sesion(cel) = cel, así que su fila de
-- PlataChat lleva cedula = celular y esta función —que filtra por
-- `cedula = cel`— la encuentra. La misma cuenta abre play/index.html, que
-- llama a mi_solicitud, y recibía `responsable: '3001234567'`: el celular
-- personal del gerente. Las cinco funciones nuevas restan 'responsable' justo
-- para que eso no viaje; la vieja, que este archivo redefine, lo entregaba. En
-- Tu Garantía la columna es null, así que restarla no le cambia nada al socio
-- de siempre. (aceptar_contrapropuesta lo devuelve igual y no se puede tocar
-- acá: 20260908 es ajeno. Queda anotado para otra migración.)
create or replace function public.mi_solicitud()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; s public.solicitudes;
begin
  -- 5-oct-2026 — EL RELOJ CORRE AL LEER. Si una solicitud de PlataChat venció,
  -- se resuelve acá antes de contestar; cuando no hay vencidas no lee nada.
  perform public.resolver_vencidas();
  cel := public.celular_de_sesion();
  if cel is null then
    return jsonb_build_object('ok', false);
  end if;
  -- 26-sep-2026 — EL DESEMPATE YA ESTÁ VIVO: 20260922b_desempate.sql se lo
  -- puso a esta función en la base el 22-sep. Esta copia salió de 20260908,
  -- que no lo tiene, y sin estas dos palabras lo habría borrado al pegarse.
  select * into s from public.solicitudes
   where cedula = cel order by creada_en desc, id desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'solicitud', null);
  end if;
  -- 15-sep-2026 — SIN EL RESPONSABLE: el celular del gerente no es dato del
  -- cliente (Ley 1581). Ver la nota de arriba.
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s) - 'responsable');
end
$$;

-- LA BANDEJA. Cuerpo de 20260908 más el reloj después de la clave: lo que
-- Joan ve abierto es lo que de verdad sigue abierto.
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
  -- 5-oct-2026 — EL RELOJ CORRE AL ABRIR LA BANDEJA (ver mi_solicitud).
  perform public.resolver_vencidas();
  return query
    select * from public.solicitudes
     where estado in ('nueva', 'contrapropuesta', 'aceptada')
     order by creada_en desc
     limit 200;
end
$$;

-- CAMBIAR LA PROPUESTA (Joan). Cuerpo de 20260908 más tres cosas: el reloj
-- después de la clave; y si la solicitud es de PlataChat, resuelta_en (una
-- persona alcanzó) y el mensaje en el hilo de Créditos, del lado de Joan
-- ('panel'), para que el cliente lo lea en el chat y no solo en la tarjeta.
create or replace function public.contrapropuesta_solicitud(
  p_clave text, p_id bigint, p_capital bigint, p_costo_pct integer, p_dias integer, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.solicitudes; cp jsonb; txt text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  -- 5-oct-2026 — EL RELOJ CORRE ANTES DE CONTESTAR (ver mi_solicitud).
  perform public.resolver_vencidas();
  if p_capital is null or p_capital < 10000 or p_capital > 20000000
     or p_costo_pct is null or p_costo_pct < 1 or p_costo_pct > 50
     or p_dias is null or p_dias < 1 or p_dias > 60 then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;
  txt := left(coalesce(p_texto, ''), 400);
  cp := public.contrapropuesta_de(p_capital, p_costo_pct, p_dias, txt, 'joan');
  update public.solicitudes
     set contrapropuesta = cp,
         estado      = 'contrapropuesta',
         aceptada_en = null,
         capital     = (cp ->> 'capital')::bigint,
         tasa        = p_costo_pct / 100.0,
         costo       = (cp ->> 'costo')::bigint,
         total       = (cp ->> 'total')::bigint,
         fecha_corte = (cp ->> 'fecha_pago')::date,
         producto    = 'quincenal',
         -- 5-oct-2026 — PlataChat: una persona alcanzó a contestar.
         resuelta_en = case when app = 'platachat' then now() else resuelta_en end
   where id = p_id and estado in ('nueva', 'contrapropuesta', 'aceptada')
  returning * into s;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no está abierta');
  end if;
  -- 5-oct-2026 — PlataChat: la propuesta también se lee en el chat.
  if s.app = 'platachat' then
    insert into public.mensajes (cedula, de, texto, canal)
    values (public.llave_de_solicitud(s), 'panel',
            'Te propongo ' || public.pesos_texto((cp ->> 'capital')::bigint)
            || '; devuelves ' || public.pesos_texto((cp ->> 'total')::bigint)
            || ' el ' || public.fecha_texto((cp ->> 'fecha_pago')::date) || '.'
            || case when btrim(txt) <> '' then ' ' || btrim(txt) else '' end,
            'creditos');
  end if;
  return jsonb_build_object('ok', true, 'solicitud', to_jsonb(s));
end
$$;

-- LA POLÍTICA DE UNA APP, leer y guardar desde Ajustes. VOLÁTILES: pasan por
-- clave_ok, que escribe el freno. Leer devuelve la fila plana, como
-- politica_nuevos_leer, para que el CRM la lea con el mismo código.
create or replace function public.politica_app_leer(p_clave text, p_app text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare pol public.politica_app;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select * into pol from public.politica_app where app = p_app;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no hay política para esa app');
  end if;
  return to_jsonb(pol);
end
$$;

-- Guardar SOLO actualiza la fila que existe: no crea la de Tu Garantía, cuya
-- política vive en politica_nuevos (dos copias derivarían). Rejas como
-- politica_nuevos_guardar, más la espera y el interruptor.
create or replace function public.politica_app_guardar(
  p_clave text, p_app text, p_capital_tope bigint, p_costo_pct integer, p_dias integer,
  p_espera_minutos integer, p_costo_pct_cupo integer, p_con_garantia text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare pol public.politica_app;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if p_capital_tope is null or p_capital_tope < 10000 or p_capital_tope > 20000000
     or p_costo_pct is null or p_costo_pct < 1 or p_costo_pct > 50
     or p_dias is null or p_dias < 1 or p_dias > 60
     or p_espera_minutos is null or p_espera_minutos < 1 or p_espera_minutos > 1440
     or p_costo_pct_cupo is null or p_costo_pct_cupo < 1 or p_costo_pct_cupo > 50
     or p_con_garantia is null or p_con_garantia not in ('estandar', 'misma') then
    return jsonb_build_object('ok', false, 'motivo', 'fuera de rango');
  end if;
  update public.politica_app
     set capital_tope   = p_capital_tope,
         costo_pct      = p_costo_pct,
         dias           = p_dias,
         espera_minutos = p_espera_minutos,
         costo_pct_cupo = p_costo_pct_cupo,
         con_garantia   = p_con_garantia,
         texto          = left(coalesce(p_texto, ''), 400),
         actualizada_en = now()
   where app = p_app
  returning * into pol;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no hay política para esa app');
  end if;
  return jsonb_build_object('ok', true, 'politica', to_jsonb(pol));
end
$$;

-- A QUIÉN SE LE AVISA. quien = 'joan' o el celular (10 dígitos) de alguien
-- del equipo; el chat_id es el número que da el bot de Telegram. Un chat_id
-- vacío APAGA el destino (activo = false) sin borrarlo: así Joan puede callar
-- un aviso desde Ajustes sin entrar a la base.
create or replace function public.avisos_destino_guardar(p_clave text, p_quien text, p_chat_id text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q text; v_chat text; v_nombre text; d public.avisos_destinos;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  q := case when lower(btrim(coalesce(p_quien, ''))) = 'joan' then 'joan'
            else right(public.solo_digitos(coalesce(p_quien, '')), 10) end;
  if q <> 'joan' and (length(q) <> 10 or not exists (select 1 from public.equipo where celular = q)) then
    return jsonb_build_object('ok', false, 'motivo', 'ese celular no está en el equipo (o no es de 10 dígitos)');
  end if;

  v_chat := btrim(coalesce(p_chat_id, ''));
  if v_chat = '' then
    update public.avisos_destinos set activo = false, actualizado = now()
     where quien = q
    returning * into d;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'falta el chat_id: es el número que da el bot de Telegram');
    end if;
    return jsonb_build_object('ok', true, 'destino', to_jsonb(d));
  end if;
  -- Un chat_id de Telegram es un entero (negativo si es un grupo).
  if v_chat !~ '^-?[0-9]{1,20}$' then
    return jsonb_build_object('ok', false, 'motivo', 'el chat_id de Telegram es un número (negativo si es un grupo)');
  end if;

  v_nombre := left(btrim(coalesce(p_nombre, '')), 80);
  if v_nombre = '' then
    v_nombre := case when q = 'joan' then 'Joan'
                     else coalesce((select nombre from public.equipo where celular = q), '') end;
  end if;

  insert into public.avisos_destinos (quien, chat_id, nombre, activo, actualizado)
  values (q, v_chat, v_nombre, true, now())
  on conflict (quien) do update
    set chat_id = excluded.chat_id, nombre = excluded.nombre, activo = true, actualizado = now()
  returning * into d;
  return jsonb_build_object('ok', true, 'destino', to_jsonb(d));
end
$$;

create or replace function public.avisos_destinos_listar(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return jsonb_build_object('ok', true, 'destinos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'quien', d.quien, 'chat_id', d.chat_id, 'nombre', d.nombre, 'activo', d.activo,
             'actualizado', d.actualizado,
             'equipo_nombre', coalesce(e.nombre, ''), 'equipo_rol', coalesce(e.rol, ''),
             'equipo_estado', coalesce(e.estado, ''))
           order by (d.quien <> 'joan'), d.quien)
      from public.avisos_destinos d
      left join public.equipo e on e.celular = d.quien), '[]'::jsonb));
end
$$;

-- PROBAR UN DESTINO. Manda el saludo por el mismo camino que un aviso de
-- verdad (avisar_platachat, con una solicitud vacía) y devuelve las filas de
-- avisos que dejó: si dice 'sin_token' o 'sin_destino', ahí está el porqué.
-- Como Joan recibe todos los avisos, probar a un gerente también le manda una
-- copia a Joan, y el texto lo dice.
create or replace function public.aviso_probar(p_clave text, p_quien text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q text; s public.solicitudes; desde_id bigint; txt text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  q := case when lower(btrim(coalesce(p_quien, ''))) = 'joan' then 'joan'
            else right(public.solo_digitos(coalesce(p_quien, '')), 10) end;
  if q <> 'joan' and length(q) <> 10 then
    return jsonb_build_object('ok', false, 'motivo', 'quien tiene que ser joan o un celular de 10 dígitos');
  end if;

  txt := 'Hola: soy el aviso de PlataChat. Si lees esto, quedó bien.'
      || case when q = 'joan' then '' else ' (Prueba del destino ···' || right(q, 4) || '.)' end;

  -- Una solicitud vacía con solo el responsable puesto: ni id ni cliente.
  s := jsonb_populate_record(null::public.solicitudes,
         jsonb_build_object('responsable', case when q = 'joan' then null else q end));

  select coalesce(max(id), 0) into desde_id from public.avisos;
  perform public.avisar_platachat('prueba', s, txt);

  return jsonb_build_object('ok', true, 'avisos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'destino', a.destino, 'estado', a.estado, 'detalle', a.detalle,
             'peticion_id', a.peticion_id, 'creado_en', a.creado_en) order by a.id)
      from public.avisos a where a.id > desde_id), '[]'::jsonb),
    'nota', 'encolado = pg_net lo tomó; la respuesta de Telegram llega aparte: mírala en avisos_recientes.');
end
$$;

-- LOS AVISOS DE LOS ÚLTIMOS DÍAS, con el estado cruzado contra la respuesta
-- de pg_net cuando existe: 'entregado' (200-299), 'rechazado (código)',
-- 'error (…)' si la red falló, o el estado guardado. pg_net borra las
-- respuestas viejas (unas horas), así que un 'encolado' de hace días quiere
-- decir «no quedó respuesta guardada», no «nunca salió»; la nota lo dice.
-- El cruce va con SQL dinámico para que la función exista aunque pg_net no.
create or replace function public.avisos_recientes(p_clave text, p_dias integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  a public.avisos; hay_net boolean; v_status integer; v_err text; v_estado text;
  filas jsonb := '[]'::jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  hay_net := exists (select 1 from pg_extension where extname = 'pg_net')
             and to_regclass('net._http_response') is not null;

  for a in select * from public.avisos
            where creado_en >= now() - (greatest(coalesce(p_dias, 8), 1) || ' days')::interval
            order by id desc
            limit 500
  loop
    v_estado := a.estado;
    if hay_net and a.estado = 'encolado' and a.peticion_id is not null then
      v_status := null; v_err := null;
      execute 'select r.status_code, r.error_msg from net._http_response r where r.id = $1'
         into v_status, v_err using a.peticion_id;
      if v_err is not null then
        v_estado := 'error (' || left(v_err, 80) || ')';
      elsif v_status is not null then
        v_estado := case when v_status between 200 and 299 then 'entregado'
                         else 'rechazado (' || v_status::text || ')' end;
      end if;
    end if;
    filas := filas || jsonb_build_array(jsonb_build_object(
      'id', a.id, 'evento', a.evento, 'solicitud_id', a.solicitud_id, 'destino', a.destino,
      'estado', v_estado, 'estado_guardado', a.estado, 'detalle', a.detalle,
      'peticion_id', a.peticion_id, 'texto', a.texto, 'creado_en', a.creado_en));
  end loop;

  return jsonb_build_object('ok', true, 'avisos', filas,
    'nota', 'encolado sin respuesta = pg_net ya no guarda esa respuesta (las borra a las horas); no quiere decir que no salió.');
end
$$;

-- ---------------------------------------------------------------------------
-- 7. EL DISPARADOR — el aviso sale de la fila, no de quien la escribe
--
-- Va en la tabla y no en cada función, para que cualquier camino que ponga
-- una solicitud de PlataChat en 'nueva' o en 'aceptada' avise —el de hoy y
-- el que se escriba mañana—. Solo para app = 'platachat' (Tu Garantía no
-- tiene bot), y solo cuando el estado CAMBIA: una actualización que no toca
-- el estado no avisa dos veces. Nunca falla: avisar_platachat ya atrapa.
-- ---------------------------------------------------------------------------
create or replace function public.solicitudes_platachat_avisar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado = 'nueva' then
      perform public.avisar_platachat('nueva', new, public.texto_aviso('nueva', new, ''));
    end if;
  elsif old.estado is distinct from new.estado then
    if new.estado = 'aceptada' then
      perform public.avisar_platachat('aceptada', new, public.texto_aviso('aceptada', new, ''));
    elsif new.estado = 'nueva' then
      -- 15-sep-2026 — EL AVISO NO PUEDE MENTIR SOBRE QUIÉN MOVIÓ LA FILA. El
      -- único camino que devuelve una solicitud a 'nueva' con el reloj ya
      -- vencido (o sin reloj) es solicitud_estado, el botón del Panel:
      -- reproponer siempre deja responder_antes_de en el futuro. Decirle
      -- «volvió a pedir» a Joan cuando fue él mismo quien la reabrió manda a
      -- buscar un mensaje del cliente que no existe.
      perform public.avisar_platachat('nueva', new,
        public.texto_aviso('nueva', new,
          case when new.responder_antes_de is null or new.responder_antes_de <= now()
               then 'reabierta desde el Panel' else 'volvió a pedir' end));
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists solicitudes_platachat_avisar on public.solicitudes;
create trigger solicitudes_platachat_avisar
  after insert or update of estado on public.solicitudes
  for each row
  when (new.app = 'platachat')
  execute function public.solicitudes_platachat_avisar();

-- ---------------------------------------------------------------------------
-- 8. pg_cron, SI EXISTE
--
-- Sin pg_cron el reloj corre al leer (mi_solicitud, la bandeja, el chat de
-- PlataChat, el gerente): la solicitud se resuelve la primera vez que alguien
-- mira después de la hora. Con pg_cron, además, cada minuto, aunque nadie
-- mire. Es la misma función; si Joan enciende la extensión después, vuelve a
-- correr este archivo y queda programada. Si el trabajo ya existe con ese
-- nombre, cron.schedule lo actualiza en vez de duplicarlo.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('platachat_resolver_vencidas', '* * * * *', 'select public.resolver_vencidas()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. LOS PERMISOS
--
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto, y Supabase se lo concede EXPLÍCITO a anon y authenticated en
-- cada función nueva: se revoca de los tres, por firma exacta, y se concede
-- lo justo. Las internas no se conceden a nadie.
-- ---------------------------------------------------------------------------

-- Internas: nadie desde afuera. (Un solo espacio antes de `from` y de `to`:
-- el centinela de pruebas/platachat-base.test.js compara la línea exacta.)
revoke all on function public.pesos_texto(bigint) from public, anon, authenticated;
revoke all on function public.hoy_bogota(timestamptz) from public, anon, authenticated;
revoke all on function public.fecha_texto(date) from public, anon, authenticated;
revoke all on function public.hora_texto(timestamptz) from public, anon, authenticated;
revoke all on function public.dia_bogota_texto(timestamptz) from public, anon, authenticated;
revoke all on function public.hora_bogota_texto(timestamptz) from public, anon, authenticated;
revoke all on function public.quincenas_texto(integer) from public, anon, authenticated;
revoke all on function public.numero_json(jsonb) from public, anon, authenticated;
revoke all on function public.propuesta_platachat_de(bigint, integer, integer, date, integer, text, text) from public, anon, authenticated;
revoke all on function public.responsable_de(text) from public, anon, authenticated;
revoke all on function public.cupo_platachat_de(text) from public, anon, authenticated;
revoke all on function public.llave_de_solicitud(public.solicitudes) from public, anon, authenticated;
revoke all on function public.texto_aviso(text, public.solicitudes, text) from public, anon, authenticated;
revoke all on function public.avisar_platachat(text, public.solicitudes, text) from public, anon, authenticated;
revoke all on function public.resolver_vencidas() from public, anon, authenticated;
revoke all on function public.solicitudes_platachat_avisar() from public, anon, authenticated;

-- Del cliente: con sesión.
revoke all on function public.politica_platachat() from public, anon, authenticated;
grant  execute on function public.politica_platachat() to authenticated;
revoke all on function public.solicitar_platachat(bigint, date, integer) from public, anon, authenticated;
grant  execute on function public.solicitar_platachat(bigint, date, integer) to authenticated;
revoke all on function public.mi_solicitud_platachat() from public, anon, authenticated;
grant  execute on function public.mi_solicitud_platachat() to authenticated;
revoke all on function public.aceptar_propuesta_platachat(bigint) from public, anon, authenticated;
grant  execute on function public.aceptar_propuesta_platachat(bigint) to authenticated;
revoke all on function public.reproponer_platachat(bigint, bigint, date, integer, text) from public, anon, authenticated;
grant  execute on function public.reproponer_platachat(bigint, bigint, date, integer, text) to authenticated;

-- Del equipo: con sesión.
revoke all on function public.contrapropuesta_gerente(bigint, bigint, integer, integer, text) from public, anon, authenticated;
grant  execute on function public.contrapropuesta_gerente(bigint, bigint, integer, integer, text) to authenticated;

-- Las tres redefinidas: los MISMOS permisos que tenían en 20260908.
revoke all on function public.mi_solicitud() from public, anon, authenticated;
grant  execute on function public.mi_solicitud() to authenticated;
revoke all on function public.listar_solicitudes_abiertas(text) from public, anon, authenticated;
grant  execute on function public.listar_solicitudes_abiertas(text) to anon;
revoke all on function public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text) from public, anon, authenticated;
grant  execute on function public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text) to anon;

-- De Joan: con la llave pública más su clave por argumento.
revoke all on function public.politica_app_leer(text, text) from public, anon, authenticated;
grant  execute on function public.politica_app_leer(text, text) to anon;
revoke all on function public.politica_app_guardar(text, text, bigint, integer, integer, integer, integer, text, text) from public, anon, authenticated;
grant  execute on function public.politica_app_guardar(text, text, bigint, integer, integer, integer, integer, text, text) to anon;
revoke all on function public.avisos_destino_guardar(text, text, text, text) from public, anon, authenticated;
grant  execute on function public.avisos_destino_guardar(text, text, text, text) to anon;
revoke all on function public.avisos_destinos_listar(text) from public, anon, authenticated;
grant  execute on function public.avisos_destinos_listar(text) to anon;
revoke all on function public.aviso_probar(text, text) from public, anon, authenticated;
grant  execute on function public.aviso_probar(text, text) to anon;
revoke all on function public.avisos_recientes(text, integer) from public, anon, authenticated;
grant  execute on function public.avisos_recientes(text, integer) to anon;

-- PostgREST contesta 404 para las firmas nuevas hasta recargar el esquema.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 10. LA COMPROBACIÓN — se corre sola al final; si algo falla, no quedó bien
-- ---------------------------------------------------------------------------
do $$
declare nombre text; n integer; cuerpo text;
begin
  -- Lo anterior sigue estando (por si alguien pegó este archivo solo).
  if to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'falta correr base/20260914b_tres_canales.sql antes que este archivo (no existe llave_de_sesion)';
  end if;

  -- Las columnas.
  foreach nombre in array array['celular', 'responder_antes_de', 'responsable', 'resuelta_en', 'pedido', 'repropuestas'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'solicitudes' and column_name = nombre) then
      raise exception 'no quedo la columna solicitudes.%', nombre;
    end if;
  end loop;
  foreach nombre in array array['costo_pct_cupo', 'capital_minimo', 'capital_maximo', 'con_garantia'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'politica_app' and column_name = nombre) then
      raise exception 'no quedo la columna politica_app.%', nombre;
    end if;
  end loop;
  if not exists (select 1 from public.politica_app
                  where app = 'platachat' and costo_pct_cupo between 1 and 50
                    and capital_minimo > 0 and capital_maximo >= capital_minimo
                    and con_garantia in ('estandar', 'misma')) then
    raise exception 'politica_app no tiene la fila platachat con las columnas nuevas en rango';
  end if;

  -- Las dos tablas, cerradas.
  if to_regclass('public.avisos') is null or to_regclass('public.avisos_destinos') is null then
    raise exception 'falto alguna de las dos tablas de avisos';
  end if;
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public'
                and table_name in ('avisos', 'avisos_destinos')
                and grantee in ('anon', 'authenticated')) then
    raise exception 'avisos o avisos_destinos quedo abierta a la llave publica';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.avisos'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.avisos_destinos'::regclass) then
    raise exception 'avisos o avisos_destinos sin RLS';
  end if;

  -- El disparador existe y esta pegado a solicitudes.
  if not exists (select 1 from pg_trigger
                  where tgname = 'solicitudes_platachat_avisar'
                    and tgrelid = 'public.solicitudes'::regclass and not tgisinternal) then
    raise exception 'no quedo el disparador solicitudes_platachat_avisar';
  end if;

  -- UNA SOLA firma por nombre: dos firmas con el mismo nombre dejan a
  -- PostgREST sin saber cual llamar (300) y NINGUNA se puede llamar.
  foreach nombre in array array[
    'pesos_texto', 'hoy_bogota', 'fecha_texto', 'hora_texto', 'dia_bogota_texto', 'hora_bogota_texto',
    'quincenas_texto', 'numero_json', 'propuesta_platachat_de', 'responsable_de', 'cupo_platachat_de',
    'llave_de_solicitud', 'texto_aviso', 'avisar_platachat', 'resolver_vencidas',
    'politica_platachat',
    'solicitar_platachat', 'mi_solicitud_platachat', 'aceptar_propuesta_platachat', 'reproponer_platachat',
    'contrapropuesta_gerente', 'mi_solicitud', 'listar_solicitudes_abiertas', 'contrapropuesta_solicitud',
    'politica_app_leer', 'politica_app_guardar', 'avisos_destino_guardar', 'avisos_destinos_listar',
    'aviso_probar', 'avisos_recientes', 'solicitudes_platachat_avisar'] loop
    select count(*) into n from pg_proc where proname = nombre and pronamespace = 'public'::regnamespace;
    if n <> 1 then
      raise exception '% tiene % firmas: PostgREST no sabria cual llamar', nombre, n;
    end if;
  end loop;

  -- Las internas, cerradas a los dos roles de PostgREST.
  foreach nombre in array array[
    'public.pesos_texto(bigint)', 'public.hoy_bogota(timestamptz)', 'public.fecha_texto(date)',
    'public.hora_texto(timestamptz)', 'public.dia_bogota_texto(timestamptz)', 'public.hora_bogota_texto(timestamptz)',
    'public.quincenas_texto(integer)', 'public.numero_json(jsonb)',
    'public.propuesta_platachat_de(bigint, integer, integer, date, integer, text, text)',
    'public.responsable_de(text)', 'public.cupo_platachat_de(text)',
    'public.llave_de_solicitud(public.solicitudes)', 'public.texto_aviso(text, public.solicitudes, text)',
    'public.avisar_platachat(text, public.solicitudes, text)', 'public.resolver_vencidas()',
    'public.solicitudes_platachat_avisar()'] loop
    if has_function_privilege('anon', nombre, 'execute')
       or has_function_privilege('authenticated', nombre, 'execute') then
      raise exception 'la interna % quedo abierta desde afuera', nombre;
    end if;
  end loop;

  -- Del cliente y del equipo: con sesion, nunca sin ella. politica_platachat
  -- entra acá: la pantalla la llama para cotizar con la politica de verdad, y
  -- no dice nada que esa persona no vaya a ver en su propia propuesta.
  foreach nombre in array array[
    'public.politica_platachat()',
    'public.solicitar_platachat(bigint, date, integer)', 'public.mi_solicitud_platachat()',
    'public.aceptar_propuesta_platachat(bigint)', 'public.reproponer_platachat(bigint, bigint, date, integer, text)',
    'public.contrapropuesta_gerente(bigint, bigint, integer, integer, text)', 'public.mi_solicitud()'] loop
    if not has_function_privilege('authenticated', nombre, 'execute') then
      raise exception '% no es llamable con sesion', nombre;
    end if;
    if has_function_privilege('anon', nombre, 'execute') then
      raise exception '% quedo abierta sin sesion', nombre;
    end if;
  end loop;

  -- De Joan: con la llave publica (la clave va por argumento). La bandeja de
  -- hoy no se puede caer.
  foreach nombre in array array[
    'public.listar_solicitudes_abiertas(text)',
    'public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text)',
    'public.politica_app_leer(text, text)',
    'public.politica_app_guardar(text, text, bigint, integer, integer, integer, integer, text, text)',
    'public.avisos_destino_guardar(text, text, text, text)', 'public.avisos_destinos_listar(text)',
    'public.aviso_probar(text, text)', 'public.avisos_recientes(text, integer)'] loop
    if not has_function_privilege('anon', nombre, 'execute') then
      raise exception '% no es llamable desde el CRM con la llave publica', nombre;
    end if;
  end loop;

  -- Las que escriben o pasan por clave_ok no pueden ser stable (25006).
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname in ('mi_solicitud', 'mi_solicitud_platachat', 'resolver_vencidas',
                                  'avisar_platachat', 'solicitar_platachat', 'aceptar_propuesta_platachat',
                                  'reproponer_platachat', 'contrapropuesta_gerente',
                                  'listar_solicitudes_abiertas', 'contrapropuesta_solicitud',
                                  'politica_app_leer', 'politica_app_guardar', 'avisos_destino_guardar',
                                  'avisos_destinos_listar', 'aviso_probar', 'avisos_recientes')
                and p.provolatile <> 'v') then
    raise exception 'alguna funcion que escribe quedo stable: PostgREST la mata con 25006';
  end if;

  -- El reloj corre al leer: las tres redefinidas lo llaman. Sin comentarios
  -- antes de mirar, que la prosa de arriba nombra la funcion.
  foreach nombre in array array['mi_solicitud', 'listar_solicitudes_abiertas', 'contrapropuesta_solicitud'] loop
    select prosrc into cuerpo from pg_proc where proname = nombre and pronamespace = 'public'::regnamespace;
    cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
    if cuerpo not like '%perform public.resolver_vencidas()%' then
      raise exception '% no corre el reloj: una solicitud vencida se quedaria nueva para siempre', nombre;
    end if;
  end loop;

  -- El aviso a Telegram no puede llevar cedula ni celular completo.
  select prosrc into cuerpo from pg_proc where proname = 'texto_aviso' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  if cuerpo like '%.cedula%' or cuerpo like '%.celular ||%' then
    raise exception 'texto_aviso manda la cedula o el celular completo a un tercero (Ley 1581)';
  end if;
  if cuerpo not like '%right(coalesce(p_sol.celular, ''''), 4)%' then
    raise exception 'texto_aviso no recorta el celular a los ultimos cuatro';
  end if;

  -- El resolver toma las filas sin esperar a nadie, y el aviso atrapa todo.
  select prosrc into cuerpo from pg_proc where proname = 'resolver_vencidas' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%for update skip locked%' then
    raise exception 'resolver_vencidas no usa for update skip locked: dos lecturas a la vez se pisarian';
  end if;
  if cuerpo not like '%resuelta_en is null or resuelta_en < responder_antes_de%' then
    raise exception 'resolver_vencidas volveria a contestar sola una solicitud que una persona ya resolvio';
  end if;
  select prosrc into cuerpo from pg_proc where proname = 'avisar_platachat' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%exception when others%' then
    raise exception 'avisar_platachat no atrapa errores: un aviso roto tumbaria la solicitud';
  end if;
  -- 15-sep-2026: el exception va DENTRO del bucle, uno por destino. Con uno
  -- solo alrededor del bucle, un error en el segundo destino deshacia la fila
  -- y el envio del primero (un begin...exception es una subtransaccion).
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  if cuerpo not like '%exception when others%end;%end loop;%'
     or cuerpo like '%end loop;%exception when others%' then
    raise exception 'avisar_platachat atrapa el bucle entero: un destino roto borraria el aviso de Joan';
  end if;

  -- ---------------------------------------------------------------------
  -- 15-sep-2026 — LO QUE ARREGLO LA AUDITORIA ADVERSARIA, para que no se
  -- pueda perder al copiar y pegar este archivo encima de si mismo.
  -- ---------------------------------------------------------------------

  -- politica_platachat SOLO lee: si alguien la vuelve volatil o la pone a
  -- escribir, deja de ser la lectura barata que la pantalla llama en cada
  -- carga (y la guarda de volatilidad de arriba no la mira, a proposito).
  if coalesce((select p.provolatile from pg_proc p
                where p.proname = 'politica_platachat'
                  and p.pronamespace = 'public'::regnamespace), 'x') <> 's' then
    raise exception 'politica_platachat no quedo stable: solo lee la politica';
  end if;

  -- El JSON que viaja al cliente y al gerente, sin lo que no es suyo (Ley 1581).
  select prosrc into cuerpo from pg_proc where proname = 'mi_solicitud' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  if cuerpo not like '%to_jsonb(s) - ''responsable''%' then
    raise exception 'mi_solicitud devuelve el responsable: play/ le mostraria al cliente el celular del gerente';
  end if;
  select prosrc into cuerpo from pg_proc where proname = 'contrapropuesta_gerente' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  if cuerpo not like '%- ''datos'' - ''cedula'' - ''registro_id''%' then
    raise exception 'contrapropuesta_gerente le entrega al gerente la cedula y el registro del cliente (Ley 1581)';
  end if;

  -- La solicitud nace diciendo QUE va a hacer el automatico a esa hora: sin
  -- eso la pantalla promete una propuesta que a veces no va a llegar.
  foreach nombre in array array['solicitar_platachat', 'reproponer_platachat'] loop
    select prosrc into cuerpo from pg_proc where proname = nombre and pronamespace = 'public'::regnamespace;
    cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
    if cuerpo not like '%''automatica'', case when not tiene or pol.con_garantia = ''misma'' then ''nuevo''%'
       or cuerpo not like '%''estandar''%' or cuerpo not like '%''sin_cupo''%'
       or cuerpo not like '%''espera_minutos'', pol.espera_minutos%' then
      raise exception '% no estampa pedido.automatica/espera_minutos con el predicado del automatico: la pantalla no sabria que prometer', nombre;
    end if;
    -- Y el mensaje del hilo usa el MISMO interruptor: con ''misma'' el
    -- automatico SI propone, y decir «te contesta una persona» seria mentira.
    if cuerpo not like '%when pol.con_garantia = ''misma''%' then
      raise exception '% promete «te contesta una persona» sin mirar con_garantia', nombre;
    end if;
  end loop;

  -- Dos toques a la vez no pueden crear dos solicitudes abiertas.
  select prosrc into cuerpo from pg_proc where proname = 'solicitar_platachat' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%pg_advisory_xact_lock%' then
    raise exception 'solicitar_platachat sin candado por celular: un doble toque crea dos solicitudes abiertas';
  end if;

  -- Y reproponer frena de verdad: cuenta en la fila que cambia, no filas que
  -- no crea. La columna tiene que existir o el contador no sube.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'repropuestas') then
    raise exception 'no quedo la columna solicitudes.repropuestas: reproponer_platachat se queda sin freno';
  end if;
  select prosrc into cuerpo from pg_proc where proname = 'reproponer_platachat' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  if cuerpo like '%creada_en > now() - interval%' then
    raise exception 'reproponer_platachat vuelve a contar filas creadas: no crea ninguna, ese freno es codigo muerto';
  end if;
  if cuerpo not like '%repropuestas, 0) >= 10%' or cuerpo not like '%repropuestas       = coalesce(repropuestas, 0) + 1%' then
    raise exception 'reproponer_platachat se quedo sin freno propio: tiene que leer y subir solicitudes.repropuestas';
  end if;

  raise notice 'PlataChat 1b: listo. Falta el token del bot (ver el final de este archivo) y los destinos (avisos_destino_guardar).';
end $$;

-- ===========================================================================
-- 11. LO QUE HACE JOAN, Y SOLO ÉL
--
-- 1. Crear el bot en Telegram: abrir @BotFather, /newbot, ponerle nombre.
--    BotFather devuelve el token (algo como 123456789:AAH…). Ese token se pega
--    en una consulta NUEVA —esta línea va comentada a propósito: un token
--    escrito en un archivo del repositorio es un token publicado—:
--
--    insert into public.config_privada (clave, valor) values ('telegram_token', 'AQUI-VA-EL-TOKEN')
--    on conflict (clave) do update set valor = excluded.valor;
--
-- 2. Escribirle al bot desde tu Telegram (cualquier cosa: «hola»). Después,
--    en el navegador, abrir https://api.telegram.org/bot<TOKEN>/getUpdates y
--    copiar el número que sale en "chat":{"id":…}. Ese es tu chat_id.
--    Cada gerente hace lo mismo con su Telegram y te pasa el suyo.
--
-- 3. Guardar los destinos desde Ajustes (fase 2) o con la clave:
--    select public.avisos_destino_guardar('<tu clave>', 'joan', '<chat_id>', 'Joan');
--    select public.avisos_destino_guardar('<tu clave>', '<celular del gerente>', '<chat_id>', '');
--
-- 4. Probar: select public.aviso_probar('<tu clave>', 'joan');
--    y a los segundos: select public.avisos_recientes('<tu clave>', 1);
--    Tiene que decir 'entregado'. Si dice 'sin_token' o 'sin_destino', ahí
--    está el porqué; si dice 'rechazado (401)', el token está mal; si
--    'rechazado (400)', el chat_id.
--
-- Para comprobar que el token quedó (NO lo muestra, solo si está):
--    select clave, length(valor) as largo from public.config_privada
--     where clave = 'telegram_token';
-- ===========================================================================
