-- ===========================================================================
-- ENTRAR CON CÓDIGO, NO CON LOS ÚLTIMOS 4 DEL CELULAR — 10 de agosto de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor, DESPUÉS de supabase.sql. Es
-- idempotente: correrlo dos veces no rompe nada y no toca ni una fila de datos.
--
-- QUÉ CAMBIA Y POR QUÉ
-- Hasta hoy el cliente entraba con su cédula y los últimos 4 dígitos de su
-- celular. Los dos son públicos: la cédula está impresa en cualquier recibo y
-- los cuatro últimos del celular circulan en todos los grupos de WhatsApp de los
-- que esa persona hace parte. Con ese par se abría el historial completo: la
-- dirección de la casa, el segundo teléfono, la referencia personal.
--
-- Desde hoy entra con un CÓDIGO de 5 caracteres que genera el Panel al azar y
-- que Joan le manda. Alfabeto Crockford-32 sin confundibles: 33.554.432
-- combinaciones contra las 10.000 de antes, y el freno de 8 intentos cada 15
-- minutos las deja en 120 años de tanteo. Las cuentas completas están en
-- generarCodigoAcceso, en app/motor.js.
--
-- EL CÓDIGO NO SE GUARDA ACÁ EN CLARO. Se guarda su huella: sha256 del código
-- más un pepper que vive en config_privada, que está cerrada con RLS y sin
-- políticas, o sea que solo la leen las funciones security definer de este
-- archivo. Un volcado de socios_historial no le sirve a nadie para entrar. Es la
-- misma regla que el proyecto ya le aplica a la cédula del KYC.
--
-- El código en claro vive en UN solo lugar: el Panel de Joan, en su computador.
-- Si se pierde, se genera otro y se manda; no hay forma de recuperarlo desde
-- acá, y eso es lo correcto.
--
-- LAS DOS PUERTAS VIEJAS SE CIERRAN, no se dejan de reserva. Joan lo decidió
-- así el 10 de agosto: una segunda entrada más débil que sigue viva es la que
-- alguien olvida cerrar. Al final del archivo se tiran historial_socio y
-- crear_solicitud, las dos versiones que preguntaban por tel4.
-- ===========================================================================

-- pgcrypto para el sha256. En Supabase las extensiones viven en su propio
-- esquema, así que las funciones de abajo lo llevan en el search_path.
create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------- la huella ---

alter table public.socios_historial add column if not exists codigo_hash text;

-- Buscar por (cédula, huella) tiene que ser barato: es lo que hace cada entrada.
create index if not exists socios_historial_por_codigo
  on public.socios_historial (cedula, codigo_hash);

-- El pepper. Se crea solo la primera vez y con azar de verdad; si ya existe, no
-- se toca — cambiarlo dejaría afuera a todos los clientes de un golpe, porque
-- todas las huellas guardadas dejarían de coincidir.
insert into public.config_privada (clave, valor)
select 'pepper_codigo', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.config_privada where clave = 'pepper_codigo');

-- La huella de un código. Normaliza igual que el motor: mayúsculas y los
-- confundibles a su carácter de verdad (la O que es cero, la I y la L que son
-- uno, la U que es V). Si acá y en el motor se normalizara distinto, un cliente
-- entraría desde el Panel y no desde la nube, con el mismo código.
-- translate() va posición a posición: I→1, L→1, O→0, U→V. Son los mismos cuatro
-- confundibles de CONFUSABLES_CODIGO en el motor, y tienen que seguir siéndolo:
-- si acá se enderezara distinto, un cliente entraría desde el Panel y no desde
-- la nube tecleando exactamente lo mismo. Después cae todo lo que no es del
-- alfabeto — espacios, guiones, puntos.
create or replace function public.normalizar_codigo_acceso(t text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      translate(upper(coalesce(t, '')), 'ILOU', '110V'),
      '[^0-9A-HJKMNP-TV-Z]', '', 'g'),
    '')
$$;

create or replace function public.huella_codigo(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare pepper text; cod text;
begin
  cod := public.normalizar_codigo_acceso(p_codigo);
  if cod is null or length(cod) <> 5 then return null; end if;
  select valor into pepper from public.config_privada where clave = 'pepper_codigo';
  if pepper is null then raise exception 'falta el pepper del código'; end if;
  return encode(digest(cod || pepper, 'sha256'), 'hex');
end
$$;

-- ------------------------------------------------------------------ leer ---
-- El cliente entra con su cédula y su código. Mismo freno, misma espera en cada
-- fallo y la misma respuesta para "no existe" que para "código equivocado": si
-- contestara distinto, sería un oráculo de cédulas.
create or replace function public.historial_socio_por_codigo(p_cedula text, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.socios_historial; ced text; h text;
begin
  ced := public.solo_digitos(p_cedula);

  if not public.puede_intentar(ced) then
    perform pg_sleep(0.3);
    return null;
  end if;

  h := public.huella_codigo(p_codigo);
  -- Un código con la forma mal puesta cuenta como fallo igual: si no, sería
  -- gratis tantear el largo.
  if h is null then
    perform public.anotar_fallo(ced);
    perform pg_sleep(0.3);
    return null;
  end if;

  select * into r
    from public.socios_historial
   where cedula = ced
     and codigo_hash = h;

  if not found then
    perform public.anotar_fallo(ced);
    perform pg_sleep(0.3);
    return null;
  end if;

  perform public.limpiar_fallos(ced);
  return jsonb_build_object(
    'nombre',         r.nombre,
    'datos',          r.datos,
    'actualizado_en', r.actualizado_en
  );
end
$$;

-- --------------------------------------------------------------- escribir ---
-- El Panel sube el código EN CLARO dentro del lote y esta función guarda solo la
-- huella. El código en claro no queda escrito en ninguna tabla.
--
-- Y si un socio llega SIN código en el lote, se le respeta el que ya tenía: un
-- Panel viejo, o una sincronización parcial, no puede dejar a nadie sin entrada.
create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item jsonb;
  n    integer := 0;
  h    text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    continue when public.solo_digitos(item->>'cedula') = '';

    h := public.huella_codigo(item->>'codigo');

    insert into public.socios_historial (cedula, tel4, nombre, datos, codigo_hash, actualizado_en)
    values (
      public.solo_digitos(item->>'cedula'),
      right(public.solo_digitos(item->>'telefono'), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      now()
    )
    on conflict (cedula) do update
      set tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          -- coalesce y no excluded a secas: sin código en el lote, se queda el
          -- que ya estaba. Pisarlo con null deja al cliente afuera sin aviso.
          codigo_hash    = coalesce(excluded.codigo_hash, socios_historial.codigo_hash),
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;

-- ------------------------------------------------------------- solicitar ---
-- La misma solicitud de siempre, pero probando la identidad con el código.
-- Copia la lógica de crear_solicitud tal como quedó el 2-ago-2026, incluido el
-- porqué de devolver null en vez de lanzar: una excepción cancela la transacción
-- entera y borra el fallo que se acaba de anotar, y entonces el freno no frena.
create or replace function public.crear_solicitud_por_codigo(
  p_cedula text, p_codigo text, p_datos jsonb,
  p_producto text default 'quincenal', p_plazo integer default null)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.socios_historial; nuevo bigint; recientes integer; ced text;
        prod text; plazo integer; h text;
begin
  prod := coalesce(p_producto, 'quincenal');
  if prod not in ('quincenal', 'respaldado') then
    raise exception 'producto desconocido';
  end if;
  if prod = 'respaldado' then
    if p_plazo is null or p_plazo < 1 or p_plazo > 6 then
      raise exception 'plazo inválido';
    end if;
    plazo := p_plazo;
  else
    plazo := null;
  end if;

  ced := public.solo_digitos(p_cedula);

  if not public.puede_intentar(ced) then
    perform pg_sleep(0.3);
    return null;
  end if;

  h := public.huella_codigo(p_codigo);
  if h is null then
    perform public.anotar_fallo(ced);
    perform pg_sleep(0.3);
    return null;
  end if;

  select * into r
    from public.socios_historial
   where cedula = ced
     and codigo_hash = h;

  if not found then
    perform public.anotar_fallo(ced);
    perform pg_sleep(0.3);
    return null;
  end if;

  perform public.limpiar_fallos(ced);

  -- Y un tope de solicitudes por socio, para que nadie llene la bandeja de Joan.
  select count(*) into recientes
    from public.solicitudes
   where cedula = ced and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return null;
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, fecha_corte,
     garantia, cupo, sobre_cupo, producto, plazo_meses)
  values (
    ced,
    r.nombre,
    coalesce((p_datos->>'capital')::bigint, 0),
    coalesce((p_datos->>'tasa')::numeric, 0),
    coalesce((p_datos->>'costo')::bigint, 0),
    coalesce((p_datos->>'total')::bigint, 0),
    nullif(p_datos->>'fecha_corte', '')::date,
    nullif(p_datos->>'garantia', '')::bigint,
    nullif(p_datos->>'cupo', '')::bigint,
    coalesce((p_datos->>'sobre_cupo')::boolean, false),
    prod,
    plazo
  )
  returning id into nuevo;

  return nuevo;
end
$$;

-- ------------------------------------------------------------------ grants ---
revoke all on function public.huella_codigo(text)                    from public, anon, authenticated;
revoke all on function public.normalizar_codigo_acceso(text)         from public, anon, authenticated;
grant execute on function public.historial_socio_por_codigo(text, text) to anon;
grant execute on function public.crear_solicitud_por_codigo(text, text, jsonb, text, integer) to anon;
grant execute on function public.sincronizar_socios(text, jsonb) to anon;

-- --------------------------------------------------- cerrar la puerta vieja ---
-- Decisión de Joan del 10-ago-2026: se corta de una, sin período de convivencia.
-- Mientras historial_socio(cedula, tel4) exista, los 10.000 números posibles de
-- los últimos 4 dígitos siguen siendo una entrada válida a los datos de
-- cualquiera, y da igual lo bueno que sea el código nuevo.
--
-- Correr esto DESPUÉS de haber subido los códigos desde el Panel y de haber
-- comprobado que un cliente entra con el suyo. Si se corre antes, nadie entra.
drop function if exists public.historial_socio(text, text);
drop function if exists public.crear_solicitud(text, text, jsonb, text, integer);
drop function if exists public.crear_solicitud(text, text, jsonb);

-- La columna tel4 se QUEDA. Sigue sirviendo para que Joan reconozca al cliente
-- en la bandeja y para cruzar con su Panel; lo que ya no hace es abrir nada.
