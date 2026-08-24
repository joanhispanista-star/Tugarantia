-- ============================================================================
-- EL REGISTRO ABIERTO — 24 de agosto de 2026
--
-- POR QUÉ EXISTE. Decisión de Joan: un cliente nuevo, sin invitación de nadie,
-- abre la app publicable (play/index.html), se registra solo con el formulario
-- de 26 campos, y le aparece a Joan en el CRM en un apartado «Registrados»
-- separado de sus clientes de verdad. Hasta hoy eso era IMPOSIBLE: la única
-- función que escribía en public.registros era canjear_invitacion, que exige
-- un código TG- — y el registro de la fachada se quedaba en Supabase Auth,
-- donde ningún Panel lo lee. El registrado era invisible.
--
-- LO QUE NO CAMBIA: registros sigue sin ser socios_historial. Nada de lo que
-- llega de la calle entra derecho a la tabla que leen los clientes; Joan
-- aprueba a mano, le abre la ficha, le da su primer crédito y AHÍ el puente
-- de siempre (sincronizar_socios + código de acceso) lo vuelve socio.
--
-- Se corre ENTERO en el SQL Editor. Idempotente: dos veces no hace daño.
-- ============================================================================

-- 1. La tabla aprende a distinguir de dónde vino cada registro. Las filas
--    viejas eran todas de invitación: el default las etiqueta bien solas.
alter table public.registros
  add column if not exists origen text not null default 'invitacion';

-- El registro abierto no canjea ningún código: codigo pasa a admitir vacío.
-- (Era NOT NULL porque canjear_invitacion siempre traía uno.)
alter table public.registros alter column codigo drop not null;

-- 2. LA PUERTA ABIERTA. Modelada sobre canjear_invitacion, que ya aprendió
--    las tres lecciones caras de este archivo:
--
--    · NUNCA un raise después de anotar_fallo: la excepción revierte la
--      transacción entera y borra el fallo recién anotado (el agujero que
--      tuvo crear_solicitud hasta el 2-ago). Todas las salidas son `return`.
--    · El freno por identidad NO basta en una puerta abierta: el que ataca
--      inventa un celular nuevo por intento. El que de verdad protege es el
--      contador GLOBAL (patrón 'inv:*'): aquí 'reg:*' con tope 30 cada 15
--      minutos. Para un negocio de barrio sobra; el precio asumido es el
--      mismo de las invitaciones — alguien puede clavar el tope y cerrar el
--      registro un rato, pero la bandeja de Joan no se llena de basura.
--    · Los datos de la calle se DESINFECTAN: solo valores planos, con tope
--      de largo y de cantidad. Un campo sin tope en una puerta abierta es un
--      sitio donde subir lo que sea.
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

  -- Ya registrado o ya cliente: se contesta EXACTAMENTE igual que un éxito.
  -- Distinguirlo convertiría esta función en un oráculo de quién es cliente
  -- de Joan — la misma razón por la que la entrada nunca dice «la cédula
  -- existe pero el código no».
  if exists (
       select 1 from public.registros
        where estado = 'nuevo'
          and (telefono = cel or (ced <> '' and cedula = ced))
     ) or exists (
       select 1 from public.socios_historial
        where celular = cel or cedula = cel or (ced <> '' and cedula = ced)
     ) then
    return jsonb_build_object('ok', true);
  end if;

  insert into public.registros (codigo, cedula, nombre, telefono, datos, origen)
  values ('', ced, nom, cel, limpio, 'abierto');

  perform public.limpiar_fallos('reg:' || left(cel, 20));
  return jsonb_build_object('ok', true);
end
$$;

-- Toda función nueva de public NACE con EXECUTE para PUBLIC (ya pasó con
-- solo_digitos y con chat_puede_escribir): primero se le quita a todos y
-- después se le da solo a quien la necesita.
revoke all on function public.registrar_abierto(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_abierto(text, text, text, jsonb) to anon;

-- 3. LA SOLICITUD DE LA FACHADA. play/index.html llama play_solicitar desde
--    el 11-ago y la función nunca se escribió: daba 404. Entra aquí, y SOLO
--    para cuentas con sesión de Supabase Auth (el registro es su puerta) —
--    anon no la puede tocar. Los números (tasa/costo/total) van en cero a
--    propósito: el Panel recalcula todo con sus propios datos y del cliente
--    solo cree el monto que pidió — la regla de renderBandeja de siempre.
create or replace function public.play_solicitar(p_capital bigint, p_meses integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  correo    text;
  cel       text;
  recientes integer;
begin
  correo := coalesce(auth.jwt() ->> 'email', '');
  -- El correo sintético es 57XXXXXXXXXX@socios.tugarantia.co: el celular veraz
  -- sale de AHÍ (lo fijó el signup), nunca de user_metadata, que el propio
  -- usuario puede reescribir.
  if correo not like '57%@socios.tugarantia.co' then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;
  cel := substring(public.solo_digitos(split_part(correo, '@', 1)) from 3);

  if p_capital is null or p_capital < 100000 or p_capital > 2000000
     or p_meses is null or p_meses < 1 or p_meses > 6 then
    return jsonb_build_object('ok', false);
  end if;

  if not public.puede_intentar_tope('psol:*', 30) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  -- Mismo tope que la solicitud del quincenal: 5 por hora por persona.
  select count(*) into recientes
    from public.solicitudes
   where cedula = cel and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, producto, plazo_meses)
  values (
    cel,
    left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', 'Registrado')), 80),
    p_capital, 0, 0, 0, 'respaldado', p_meses
  );

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.play_solicitar(bigint, integer) from public, anon, authenticated;
grant execute on function public.play_solicitar(bigint, integer) to authenticated;

-- PostgREST contesta 404 para funciones nuevas hasta recargar el esquema (ya
-- pasó dos veces y las dos parecieron migración fallida). Esta línea se lo
-- pide de una, sin ir a Settings -> API.
notify pgrst, 'reload schema';
