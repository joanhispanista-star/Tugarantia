-- ===========================================================================
-- UNA SOLA PUERTA — 9 de septiembre de 2026
--
-- Va DESPUÉS de 20260908_primer_credito.sql y 20260908b_registro_archivos.sql.
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras
--
-- «En la pantalla de inicio está un botón que dice no tengo código, y al
-- oprimir envía al WhatsApp de Garantía, pero no quiero que sea así: quiero que
-- lleve a todos los clientes independientemente que sea nuevo o antiguo, y que
-- yo desde el CRM tenga la información y pueda cruzar la información del
-- cliente con la que yo manualmente anteriormente ingresé, y que se pueda ver
-- su historial y que no quede como dos clientes duplicados.»
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL PRIMER CAMBIO: HOY EL CLIENTE ANTIGUO SE TIRA A LA BASURA
--
-- registrar_abierto (20260824) tiene esto antes de insertar:
--
--     if exists (select 1 from public.registros ...)
--        or exists (select 1 from public.socios_historial
--                    where celular = cel or cedula = cel or cedula = ced)
--     then return jsonb_build_object('ok', true); end if;
--
-- El segundo `exists` significa: SI YA ERES CLIENTE DE JOAN, TU REGISTRO NO SE
-- GUARDA. La app te dice «listo» y la fila no existe. Con el botón nuevo eso
-- sería catastrófico: Joan manda un enlace a sus 16 clientes, los 16 llenan
-- nueve pasos con foto de cédula y de rostro, y a la bandeja no llega ninguno.
--
-- Se quita ese `exists`. Lo que NO se quita es el motivo por el que se escribió:
-- que la respuesta al teléfono no delate quién es cliente de Joan. Sigue siendo
-- la misma en todos los casos — y ahora también los EFECTOS, que es lo que
-- faltaba (ver abajo).
--
-- ---------------------------------------------------------------------------
-- LA LECCIÓN QUE COSTÓ ESTA AUDITORÍA: UNA RESPUESTA IGUAL NO BASTA
--
-- Los dos caminos de éxito devolvían el mismo `{"ok": true}` pero NO hacían lo
-- mismo: el que insertaba llamaba `limpiar_fallos('reg:'||cel)` y el que se
-- rendía se iba sin llamarlo. `limpiar_fallos` borra el contador de intentos
-- fallidos de ese celular — y ese contador SÍ es observable desde afuera:
-- basta con quemar unos intentos con datos malos, registrarse bien, y mirar si
-- el freno se soltó. Si se soltó, eras desconocido; si no, ya estabas dentro.
-- La respuesta era idéntica y el oráculo funcionaba igual.
--
-- Ahora `limpiar_fallos` va ANTES de la bifurcación: los dos caminos de éxito
-- dejan la base en el mismo estado.
--
-- LO QUE SIGUE SIENDO OBSERVABLE, y se declara en vez de esconderse: el camino
-- que inserta escribe una fila y el que no, no — la diferencia de tiempo es de
-- microsegundos y medirla exige miles de intentos contra el freno global de 30
-- cada 15 minutos. Para un negocio de barrio se asume. Lo que NO se asume es un
-- canal que se lea con tres intentos, que es lo que había.
--
-- Y hay un oráculo MÁS GRANDE que este archivo no puede cerrar, así que queda
-- escrito: el signup de Supabase que corre justo después (play/index.html)
-- contesta distinto si el celular ya tiene cuenta, y la app se lo dice a la
-- persona («Ya hay una cuenta con ese celular»). Es información que el dueño
-- del número necesita para no registrarse dos veces, y quitarla dejaría sin
-- salida al que sí es suyo. Cerrarlo de verdad pide verificar el celular por
-- SMS antes de contestar nada, que hoy no existe. Se asume a conciencia.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL SEGUNDO CAMBIO: EL CRUCE PODÍA DEJAR AL CLIENTE AFUERA DE SU APP
--
-- La llave de un cliente en la nube es «su cédula si la tiene, y si no, su
-- celular» (ident := coalesce(cedula, celular)). Once de los dieciséis clientes
-- de Joan NO tienen cédula: viven en la nube con la llave = su celular.
--
-- El cruce que Joan pidió consiste, justamente, en rellenarle la cédula a esas
-- fichas incompletas. En la siguiente «☁ Subir historiales», la llave cambia de
-- celular a cédula y sincronizar_socios hace:
--
--     update public.mensajes set cedula = ident where cedula = cel;
--     delete from public.socios_historial where cedula = cel;
--
-- Los mensajes viajan (eso ya estaba resuelto el 28-ago). El CÓDIGO DE ACCESO
-- no: se va en el `delete`. Y si el socio se había puesto su propio código
-- desde la app (`codigo_propio`), la fila nueva nace con el que tiene Joan en
-- su Panel, que es el viejo. Resultado: el cliente teclea su código, la nube no
-- lo reconoce, y no entra a ver su historial. Sin un error en pantalla, sin una
-- alarma, y justo el día que Joan le completó la ficha.
--
-- Ahora la fila vieja se RESCATA antes de borrarla: el código y la marca de
-- «se lo puso él» se llevan a la fila nueva.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. EL REGISTRO GUARDA A TODO EL MUNDO
-- ---------------------------------------------------------------------------
create or replace function public.registrar_abierto(
  p_celular text, p_nombre text, p_cedula text default '',
  p_datos jsonb default '{}'::jsonb)
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
begin
  cel := public.solo_digitos(p_celular);
  ced := public.solo_digitos(coalesce(p_cedula, ''));
  nom := left(btrim(coalesce(p_nombre, '')), 80);

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
  -- cabecera: si solo lo llamara el camino que inserta, el contador de fallos
  -- contestaría lo que la respuesta se niega a contestar.
  perform public.limpiar_fallos('reg:' || left(cel, 20));

  -- 9-sep-2026 — SE CAYÓ EL `exists` CONTRA socios_historial. Un cliente
  -- antiguo que se registra AHORA SÍ le llega a Joan: es la mitad de lo que
  -- pidió («que lleve a todos, nuevo o antiguo, y que yo lo cruce a mano»).
  -- Sigue en pie el de `registros`, y por otro motivo: que dos toques del botón
  -- no le pongan dos filas iguales en la bandeja. Ese no es un oráculo de
  -- clientela — es el mismo que ya existía para cualquier desconocido.
  --
  -- Y a propósito NO se actualiza la fila que ya estaba: si el segundo registro
  -- pisara al primero, cualquiera que sepa tu celular podría cambiar los datos
  -- que Joan está a punto de mirar.
  if not exists (
       select 1 from public.registros
        where estado = 'nuevo'
          and (telefono = cel or (ced <> '' and cedula = ced))
     ) then
    insert into public.registros (codigo, cedula, nombre, telefono, datos, origen)
    values ('', ced, nom, cel, limpio, 'abierto');
  end if;

  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 2. LA SUBIDA NO SE LLEVA EL CÓDIGO DE ACCESO POR DELANTE
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item     jsonb;
  n        integer := 0;
  h        text;
  ident    text;
  cel      text;
  forzar   boolean;
  h_viejo  text;
  propio   boolean;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    cel    := nullif(public.solo_digitos(item->>'telefono'), '');
    ident  := coalesce(nullif(public.solo_digitos(item->>'cedula'), ''), cel);
    forzar := coalesce((item->>'codigo_forzar')::boolean, false);
    continue when ident is null;

    h_viejo := null;
    propio  := false;

    if cel is not null and cel <> ident then
      -- 28-ago-2026 — LOS MENSAJES VIAJAN CON EL CLIENTE.
      -- Sin esta línea, el día que Joan le cargue la cédula a una ficha que
      -- subía por celular, la conversación de ese cliente queda colgando de
      -- una llave borrada: desaparece de la bandeja y él sigue viendo la suya.
      -- Dos verdades sobre la misma conversación, y ninguna alarma.
      update public.mensajes set cedula = ident where cedula = cel;

      -- 9-sep-2026 — Y EL CÓDIGO DE ACCESO TAMBIÉN VIAJA.
      -- El `delete` de abajo se llevaba `codigo_hash` y `codigo_propio`. Con el
      -- cruce que Joan estrena hoy, cargarle la cédula a una ficha que subía
      -- por celular es la operación NORMAL, no la rara: once de sus dieciséis
      -- clientes viven en la nube con la llave = su celular. El cliente tecleaba
      -- su código de siempre y la nube ya no lo reconocía.
      --
      -- Se lee ANTES de borrar y se usa como respaldo más abajo. Si el socio se
      -- había puesto su propio código desde la app, `codigo_propio` viaja con
      -- él: si no, la fila nueva nacería con el código viejo del Panel de Joan
      -- y le quitaría al socio el que él mismo eligió.
      select codigo_hash, coalesce(codigo_propio, false)
        into h_viejo, propio
        from public.socios_historial
       where cedula = cel;

      delete from public.socios_historial where cedula = cel;
    end if;

    h := public.huella_codigo(item->>'codigo');

    -- Si el socio se había puesto su propio código y Joan no está forzando uno
    -- nuevo, manda el suyo. Es la misma regla que el `on conflict` de abajo
    -- aplica a la fila que no cambia de llave; acá se aplica a la que sí.
    if h_viejo is not null and propio and not forzar then
      h := h_viejo;
    elsif h is null then
      h := h_viejo;
    end if;

    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, codigo_hash, codigo_propio, actualizado_en)
    values (
      ident,
      cel,
      right(coalesce(cel, ''), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      case when forzar then false else propio end,
      now()
    )
    on conflict (cedula) do update
      set celular        = excluded.celular,
          tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          codigo_hash    = case
            when forzar then coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
            when socios_historial.codigo_propio then socios_historial.codigo_hash
            else coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
          end,
          codigo_propio  = case when forzar then false else socios_historial.codigo_propio end,
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;

-- ------------------------------------------------------------- permisos
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto: se revoca a mano y se vuelve a conceder lo justo. Es la lección
-- del 28-ago (28 funciones abiertas a la llave pública sin que nadie lo viera).
revoke all on function public.registrar_abierto(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_abierto(text, text, text, jsonb) to anon;
revoke all on function public.sincronizar_socios(text, jsonb)              from public, anon, authenticated;
grant execute on function public.sincronizar_socios(text, jsonb)           to anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------- comprobación
do $$
declare
  cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'registrar_abierto' and pronamespace = 'public'::regnamespace;
  if cuerpo like '%socios_historial%' then
    raise exception 'registrar_abierto sigue mirando socios_historial: el cliente antiguo se seguiria tirando';
  end if;
  if cuerpo not like '%limpiar_fallos%' then
    raise exception 'registrar_abierto perdio limpiar_fallos';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'sincronizar_socios' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%h_viejo%' then
    raise exception 'sincronizar_socios no rescata el codigo antes del delete';
  end if;

  if not has_function_privilege('anon', 'public.registrar_abierto(text, text, text, jsonb)', 'execute') then
    raise exception 'registrar_abierto dejo de ser llamable desde la app';
  end if;
end $$;
