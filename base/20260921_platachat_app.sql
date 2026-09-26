-- ===========================================================================
-- PLATACHAT, FASE 1a — LA SEGUNDA MARCA SE ETIQUETA, NO SE SEPARA
-- 21 de septiembre de 2026
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
-- Va DESPUÉS de 20260914b_tres_canales.sql (o sea, después del pegado
-- PEGAR-AHORA.html: 20260910c, 20260911, 20260914, 20260914b).
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «que se vea segmentado en dos aplicaciones plataChat y TuGarantia y que yo
--  pueda revisar como le va a cada aplicacion»
-- «un sistema de ventas y cobranza dentro del mismo CRM»
--
-- ---------------------------------------------------------------------------
-- LA DECISIÓN DE FONDO: UNA SOLA BASE, UNA ETIQUETA
--
-- PlataChat es la segunda marca de Tu Garantía: mismo motor, misma base, mismo
-- CRM, otra piel. «Segmentado» no quiere decir dos bases ni dos juegos de
-- permisos: quiere decir que cada registro, cada solicitud y cada ficha diga
-- POR CUÁL APP ENTRÓ, para que el CRM pueda poner las dos columnas que Joan
-- quiere comparar. Eso es una columna `app` con dos valores, y nada más.
--
-- POR QUÉ LA APP NUNCA CAMBIA PERMISOS, SOLO ETIQUETA. Cada reja de esta base
-- —el freno del registro, el candado del código, el alcance del asesor, quién
-- lee qué— la decide la identidad de la sesión dentro de una función security
-- definer, nunca «desde qué app viene la llamada». Si el valor de `app` abriera
-- o cerrara una puerta, ese valor lo manda el navegador y cualquiera lo
-- cambia: sería una reja pintada en la pantalla. Por eso `app` se VALIDA (uno
-- de dos valores, o el default) y se GUARDA, pero ninguna función de este
-- archivo ni de los que siguen la lee para decidir permisos. Es una pista de
-- auditoría y una columna para agrupar en el CRM. Nada más.
--
-- QUÉ PROTEGE CADA PIEZA
--   · La columna `app` con check por nombre en registros, solicitudes y
--     socios_historial: que nunca entre un tercer valor («PlataChat», «plata»,
--     vacío) que parta las cifras del CRM en tres. Las filas viejas quedan
--     como Tu Garantía, que es la verdad: entraron por ahí.
--   · El check de `solicitudes.estado`, NOT VALID: los cinco estados que el
--     código ya usa quedan escritos en la base (hasta hoy solo vivían en un
--     comentario de supabase.sql y en el código de cuatro funciones). NOT
--     VALID para que una fila vieja con un estado raro no reviente el pegado:
--     se vigila lo que entra desde hoy, no se juzga lo de ayer.
--   · `politica_app`: la política del primer crédito de PlataChat vive aparte
--     de `politica_nuevos` (que es la fila única de Tu Garantía). Cambiar una
--     no cambia la otra, que es lo que «segmentado» significa para el precio.
--     Esta migración solo la crea y la siembra: la lee la fase 1b (el reloj de
--     la hora, resolver_vencidas), que todavía no existe.
--   · `registrar_abierto_app`: la puerta pública de PlataChat, copia fiel de
--     la de Tu Garantía —mismas rejas, misma respuesta en todas las ramas— más
--     la etiqueta. Es una función NUEVA y no una sobrecarga de la vieja: dos
--     registrar_abierto con firmas distintas dejarían a PostgREST sin saber
--     cuál llamar, y el registro público de Tu Garantía se caería el mismo día
--     de pegar este archivo. La vieja no se toca.
--   · `accesos_app` + `marcar_acceso`: «abrieron la app» medido por sesión,
--     sin tocar socios_historial y sin pasar por el candado — porque no
--     devuelve nada del socio, solo cuenta. Es el primer número que Joan va a
--     poder comparar entre las dos apps sin esperar a que alguien pida
--     crédito.
--
-- LO QUE NO SE ETIQUETA TODAVÍA: `mensajes`. El chat se etiqueta en la fase 2,
-- cuando el CRM tenga la bandeja por app. Ponerle la columna hoy sería una
-- columna que ninguna función escribe y que las cifras leerían como «todo es
-- Tu Garantía». Una columna que miente en silencio es peor que una que falta.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LA ETIQUETA
--
-- Default 'tugarantia' y not null, a propósito: todo lo que ya existe entró
-- por Tu Garantía, y un null obligaría a un coalesce en cada cifra del CRM —
-- alguna se iba a olvidar y esa cifra contaría de menos.
-- ---------------------------------------------------------------------------
alter table public.registros
  add column if not exists app text not null default 'tugarantia';
alter table public.solicitudes
  add column if not exists app text not null default 'tugarantia';
alter table public.socios_historial
  add column if not exists app text not null default 'tugarantia';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registros_app_valida') then
    alter table public.registros
      add constraint registros_app_valida check (app in ('tugarantia', 'platachat'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'solicitudes_app_valida') then
    alter table public.solicitudes
      add constraint solicitudes_app_valida check (app in ('tugarantia', 'platachat'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'socios_historial_app_valida') then
    alter table public.socios_historial
      add constraint socios_historial_app_valida check (app in ('tugarantia', 'platachat'));
  end if;

  -- Los cinco estados que el código ya usa (supabase.sql: nueva, atendida,
  -- descartada; 20260908_primer_credito.sql: contrapropuesta, aceptada).
  -- NOT VALID: vigila lo que entra desde hoy; no juzga las filas viejas.
  if not exists (select 1 from pg_constraint where conname = 'solicitudes_estado_valido') then
    alter table public.solicitudes
      add constraint solicitudes_estado_valido
      check (estado in ('nueva', 'contrapropuesta', 'aceptada', 'atendida', 'descartada'))
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. LA POLÍTICA DEL PRIMER CRÉDITO, POR APP
--
-- Una fila por app; hoy solo la de PlataChat. La de Tu Garantía sigue en
-- politica_nuevos (fila única, id = 1) y no se duplica acá: dos copias de la
-- misma política derivan, y el día que Joan cambie una en Ajustes la otra
-- seguiría diciendo lo viejo.
--
-- costo_pct guarda un porcentaje porque así lo guarda politica_nuevos y así lo
-- edita Joan en Ajustes. El CLIENTE nunca ve esta columna: la pantalla la
-- convierte a pesos antes de pintarla (regla de la casa: el socio no ve
-- porcentajes). espera_minutos es la hora que el gerente tiene para contestar
-- antes de que la base aplique esta política sola — el reloj es la fase 1b;
-- acá solo queda escrito cuánto dura.
-- ---------------------------------------------------------------------------
create table if not exists public.politica_app (
  app            text        primary key
                             constraint politica_app_app_valida
                             check (app in ('tugarantia', 'platachat')),
  capital_tope   bigint      not null default 100000
                             constraint politica_app_capital_positivo check (capital_tope > 0),
  costo_pct      integer     not null default 35
                             constraint politica_app_costo_en_rango check (costo_pct between 1 and 50),
  dias           integer     not null default 8
                             constraint politica_app_dias_en_rango check (dias between 1 and 60),
  espera_minutos integer     not null default 60
                             constraint politica_app_espera_en_rango check (espera_minutos between 1 and 1440),
  texto          text        not null default
    'Por ser cliente nuevo, este es tu primer crédito: si lo pagas en fecha, el siguiente será mayor.',
  actualizada_en timestamptz not null default now()
);
alter table public.politica_app enable row level security;
revoke all on table public.politica_app from public, anon, authenticated;
insert into public.politica_app (app) values ('platachat') on conflict (app) do nothing;

-- ---------------------------------------------------------------------------
-- 3. LA PUERTA PÚBLICA DE PLATACHAT
--
-- COPIA FIEL de registrar_abierto (base/20260909_una_sola_puerta.sql). Las
-- únicas diferencias son tres líneas: el parámetro p_app, su validación, y la
-- columna app en el insert. Todo lo demás —el freno global reg:* de 30 cada
-- 15 minutos, el freno por celular, los 10 dígitos que empiezan por 3, la
-- desinfección de p_datos, limpiar_fallos ANTES de la bifurcación y la misma
-- respuesta en todas las ramas— es el mismo texto, y hay una prueba en
-- pruebas/platachat-base.test.js que compara los dos cuerpos.
--
-- Por qué copiar y no compartir: la reja de registrar_abierto es la que cerró
-- un oráculo el 9-sep (ver la cabecera de aquel archivo). Meterle un parámetro
-- a la vieja cambiaría su firma, y una firma nueva sobre el mismo nombre es
-- una sobrecarga que PostgREST no sabe resolver.
--
-- p_app que no sea uno de los dos valores cae a 'tugarantia': la etiqueta no
-- puede abrir ni cerrar nada, así que un valor raro no es un ataque, es un
-- dato mal puesto, y se guarda con la marca que menos miente (la puerta
-- vieja). Los frenos son COMPARTIDOS entre las dos puertas a propósito —
-- reg:* y reg:<celular>— porque son el mismo negocio y la misma bandeja: dos
-- puertas con frenos separados serían el doble de intentos para el mismo
-- atacante.
--
-- El `exists` contra registros también se comparte: si la persona ya tiene una
-- fila 'nuevo' en la bandeja por Tu Garantía y ahora abre PlataChat, no se le
-- pone una segunda. Eso no pierde la información de «también abrió PlataChat»:
-- para eso está accesos_app (sección 4), que cuenta por sesión y por app.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_abierto_app(
  p_celular text, p_nombre text, p_cedula text default '',
  p_datos jsonb default '{}'::jsonb, p_app text default 'platachat')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cel    text;
  ced    text;
  nom    text;
  k      text;
  v      text;
  limpio jsonb := '{}'::jsonb;
  n      integer := 0;
  v_app  text;
begin
  cel := public.solo_digitos(p_celular);
  ced := public.solo_digitos(coalesce(p_cedula, ''));
  nom := left(btrim(coalesce(p_nombre, '')), 80);
  v_app := case when p_app in ('tugarantia', 'platachat') then p_app else 'tugarantia' end;

  -- El freno global va PRIMERO: es el que no depende de qué identidad inventen.
  if not public.puede_intentar_tope('reg:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  if not public.puede_intentar('reg:' || left(cel, 20)) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  -- El celular es EL identificador del negocio (decisión del 20-ago: 15 de 16
  -- clientes tienen celular; 5 tienen cédula). 10 dígitos y empieza por 3 —
  -- un fijo no recibe WhatsApp y sería una cuenta incontactable.
  if length(cel) <> 10 or left(cel, 1) <> '3' or length(nom) < 3
     or (ced <> '' and length(ced) < 5) then
    perform public.anotar_fallo('reg:' || left(cel, 20));
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  -- La vinculación, desinfectada: solo pares de texto plano, llave capada a
  -- 40, valor a 200, máximo 40 pares. Objetos anidados y arreglos se quedan
  -- por fuera — la ficha de verdad la arma Joan en su Panel.
  if jsonb_typeof(p_datos) = 'object' and length(p_datos::text) <= 12000 then
    for k, v in select key, value from jsonb_each_text(p_datos) loop
      exit when n >= 40;
      if v is not null and btrim(v) <> '' then
        limpio := limpio || jsonb_build_object(left(k, 40), left(v, 200));
        n := n + 1;
      end if;
    end loop;
  end if;

  -- 9-sep-2026 — ANTES DE LA BIFURCACIÓN, no dentro de una rama. Ver la
  -- cabecera de 20260909: si solo lo llamara el camino que inserta, el
  -- contador de fallos contestaría lo que la respuesta se niega a contestar.
  perform public.limpiar_fallos('reg:' || left(cel, 20));

  -- Sigue en pie el `exists` de `registros`, y por el motivo de siempre: que
  -- dos toques del botón no le pongan dos filas iguales en la bandeja. Y a
  -- propósito NO se actualiza la fila que ya estaba: si el segundo registro
  -- pisara al primero, cualquiera que sepa tu celular podría cambiar los datos
  -- que Joan está a punto de mirar.
  if not exists (
       select 1 from public.registros
        where estado = 'nuevo'
          and (telefono = cel or (ced <> '' and cedula = ced))
     ) then
    insert into public.registros (codigo, cedula, nombre, telefono, datos, origen, app)
    values ('', ced, nom, cel, limpio, 'abierto', v_app);
  end if;

  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. «ABRIERON LA APP», CONTADO POR SESIÓN
--
-- La llave es el CELULAR de la sesión, no llave_de_sesion: medir quién abrió
-- la app no puede depender de si ya se vinculó, y no toca socios_historial —
-- así que no pasa por el candado ni tiene por qué. Una fila por (celular,
-- app): la primera vez, la última y cuántas. Con eso el CRM contesta «cuántos
-- abrieron PlataChat esta semana» sin que nadie haya pedido crédito todavía.
--
-- Un p_app que no sea uno de los dos NO se guarda como 'tugarantia' ni como
-- 'platachat': se rechaza. Es distinto del registro: allá la fila importa más
-- que la etiqueta; acá la etiqueta ES el dato, y una medición mal etiquetada
-- es peor que ninguna.
-- ---------------------------------------------------------------------------
create table if not exists public.accesos_app (
  llave      text        not null,       -- el celular de la sesión
  app        text        not null
                         constraint accesos_app_app_valida
                         check (app in ('tugarantia', 'platachat')),
  primero_en timestamptz not null default now(),
  ultimo_en  timestamptz not null default now(),
  veces      integer     not null default 1,
  primary key (llave, app)
);
create index if not exists accesos_app_por_app on public.accesos_app (app, ultimo_en desc);
alter table public.accesos_app enable row level security;
revoke all on table public.accesos_app from public, anon, authenticated;

create or replace function public.marcar_acceso(p_app text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; v_veces integer;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  if p_app is null or p_app not in ('tugarantia', 'platachat') then
    return jsonb_build_object('ok', false, 'motivo', 'app desconocida');
  end if;

  insert into public.accesos_app (llave, app, primero_en, ultimo_en, veces)
  values (cel, p_app, now(), now(), 1)
  on conflict (llave, app) do update
    set ultimo_en = now(), veces = accesos_app.veces + 1
  returning veces into v_veces;

  return jsonb_build_object('ok', true, 'veces', v_veces);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. LOS PERMISOS
--
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto, y Supabase además se lo concede EXPLÍCITO a anon y a
-- authenticated en cada función nueva: se revoca de los tres y se concede lo
-- justo. Lección del 28-ago (28 funciones abiertas a la llave pública).
-- ---------------------------------------------------------------------------
revoke all on function public.registrar_abierto_app(text, text, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.registrar_abierto_app(text, text, text, jsonb, text) to anon;   -- la puerta pública, sin sesión
revoke all on function public.marcar_acceso(text) from public, anon, authenticated;
grant  execute on function public.marcar_acceso(text) to authenticated;                        -- solo con sesión

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text; n integer;
begin
  -- Lo anterior tiene que estar: el candado y la llave del hilo.
  if to_regprocedure('public.llave_de_sesion(text)') is null
     or to_regprocedure('public.vincular_cuenta(text, text)') is null then
    raise exception 'falta correr base/20260914b_tres_canales.sql antes que este archivo';
  end if;

  -- La etiqueta, en las tres tablas, y con su check.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and column_name = 'app'
         and table_name in ('registros', 'solicitudes', 'socios_historial')) <> 3 then
    raise exception 'no quedo la columna app en las tres tablas';
  end if;
  if (select count(*) from pg_constraint
       where conname in ('registros_app_valida', 'solicitudes_app_valida',
                         'socios_historial_app_valida', 'solicitudes_estado_valido')) <> 4 then
    raise exception 'falta alguno de los cuatro checks por nombre';
  end if;

  -- La politica de PlataChat existe y esta sembrada.
  if not exists (select 1 from public.politica_app where app = 'platachat') then
    raise exception 'politica_app no quedo sembrada para platachat';
  end if;

  -- Las dos tablas nuevas, cerradas: nadie las lee directo.
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public'
                and table_name in ('politica_app', 'accesos_app')
                and grantee in ('anon', 'authenticated')) then
    raise exception 'politica_app o accesos_app quedo abierta a la llave publica';
  end if;

  -- UNA SOLA registrar_abierto y UNA SOLA registrar_abierto_app. Si hay dos
  -- firmas con el mismo nombre, PostgREST contesta 300 y NINGUNA de las dos
  -- se puede llamar: el registro publico de Tu Garantia se cae.
  select count(*) into n from pg_proc
   where proname = 'registrar_abierto' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'registrar_abierto quedo sobrecargada: PostgREST no sabria cual llamar';
  end if;
  select count(*) into n from pg_proc
   where proname = 'registrar_abierto_app' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'registrar_abierto_app quedo sobrecargada: PostgREST no sabria cual llamar';
  end if;

  -- La copia es fiel: mismas rejas, y no consulta socios_historial (el oraculo
  -- del 9-sep). Sin comentarios antes de mirar, que ya nos cazamos una vez.
  select prosrc into cuerpo from pg_proc
   where proname = 'registrar_abierto_app' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  if cuerpo like '%from public.socios_historial%' or cuerpo like '%from socios_historial%' then
    raise exception 'registrar_abierto_app consulta socios_historial: delataria quien es cliente';
  end if;
  if cuerpo not like '%puede_intentar_tope%' or cuerpo not like '%puede_intentar(%'
     or cuerpo not like '%anotar_fallo%' or cuerpo not like '%limpiar_fallos%' then
    raise exception 'registrar_abierto_app perdio alguno de los frenos de registrar_abierto';
  end if;
  if cuerpo not like '%origen, app)%' then
    raise exception 'registrar_abierto_app no escribe la etiqueta app';
  end if;

  -- Permisos: la puerta nueva abierta sin sesion (como la vieja, que sigue
  -- abierta), y la medicion solo con sesion.
  if not has_function_privilege('anon', 'public.registrar_abierto_app(text, text, text, jsonb, text)', 'execute') then
    raise exception 'registrar_abierto_app no es llamable desde la app';
  end if;
  if not has_function_privilege('anon', 'public.registrar_abierto(text, text, text, jsonb)', 'execute') then
    raise exception 'la puerta vieja registrar_abierto dejo de ser llamable: Tu Garantia se quedo sin registro';
  end if;
  if has_function_privilege('anon', 'public.marcar_acceso(text)', 'execute') then
    raise exception 'marcar_acceso quedo abierta sin sesion';
  end if;
end $$;
