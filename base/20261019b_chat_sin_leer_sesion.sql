-- ===========================================================================
-- EL CLIENTE SE ENTERA DE LA RESPUESTA, Y JOAN PUEDE ESCRIBIRLE PRIMERO
-- 19 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces. Crea dos funciones nuevas y no reescribe ninguna
-- viva. No deja ninguna fila: lo que escribe para comprobarse lo borra al
-- final. Va DESPUÉS de base/20260922f_fotos_en_el_chat.sql y de
-- base/20261007_una_puerta.sql. Es independiente de
-- 20261019_chat_quien_escribe.sql: se pueden pegar en cualquier orden.
-- Al final llama UNA vez a chat_hilo_de_celular con tu clave de verdad (un
-- acierto: no te acerca al freno).
--
-- DESPUÉS, la comprobación desde afuera (con la llave pública, sin sesión):
--   POST /rest/v1/rpc/chat_sin_leer_sesion  → 401 (existe y exige sesión)
--   POST /rest/v1/rpc/chat_hilo_de_celular  → 400 «clave incorrecta» con una
--   clave inventada (existe y exige la clave)
--
-- ---------------------------------------------------------------------------
-- 1. chat_sin_leer_sesion() — EL CONTADOR DEL CLIENTE
--
-- La app del cliente (play/) abría el chat siempre en «Servicio», leía un solo
-- canal y no volvía a mirar. Si Joan contestaba en «Créditos nuevos» o en
-- «Cobranzas» —y el CRM contesta en el canal del último mensaje del cliente,
-- no en uno fijo—, el cliente no se enteraba nunca. Hace falta un «Chat (2)».
--
-- Ese número NO puede salir de chat_leer_sesion: esa función MARCA como visto
-- lo que devuelve (20260922f, `update ... set visto = true`). Contar con ella
-- pondría «Lo vio» en el CRM sobre mensajes que nadie leyó: la pantalla de
-- Joan mintiendo. Esta función solo CUENTA, por canal, con la misma condición
-- con la que chat_leer_sesion marca —del negocio (`de <> 'socio'`), sin ver,
-- en el hilo de la sesión (llave_de_sesion)—, así que el número baja
-- exactamente cuando el cliente abre ese canal.
--
-- Solo `authenticated`: el hilo sale de la sesión, no de un parámetro, así que
-- no hay dónde escribir el celular de otro. Sin sesión, {ok:false}.
--
-- ---------------------------------------------------------------------------
-- 2. chat_hilo_de_celular(clave, celular) — ESCRIBIRLE PRIMERO
--
-- «💬 Escribirle por la app» en 📥 Registrados del CRM. chat_responder ya
-- escribe en un hilo que todavía no existe; lo que el CRM no sabe con certeza
-- es CUÁL es el hilo de ese celular. Lo decide llave_de_sesion: la cédula de
-- la ficha si la cuenta está junta, '0' + celular si el número es de una ficha
-- sin juntar, el celular si no. Lo juntado desde el celular de Joan no está en
-- el computador, así que adivinarlo allá es escribir en un hilo que nadie lee
-- y mostrar «enviado». Se le pregunta a la base, con la clave, como todo lo
-- del Panel. llave_de_sesion sigue sin ser llamable desde afuera.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES. Se para acá, sin tocar nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'Falta base/20260914b_tres_canales.sql (celular_de_sesion, llave_de_sesion). Córrelo primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensajes' and column_name = 'canal') then
    raise exception 'mensajes no tiene la columna canal: falta base/20260914b_tres_canales.sql.';
  end if;
  if to_regprocedure('public.chat_leer_sesion(text, bigint)') is null then
    raise exception 'No existe chat_leer_sesion: falta base/20260922f_fotos_en_el_chat.sql.';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null
     or to_regclass('public.config_privada') is null then
    raise exception 'Falta base/supabase.sql: no existe clave_ok, solo_digitos o config_privada.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. EL CONTADOR DEL CLIENTE
-- ---------------------------------------------------------------------------
create or replace function public.chat_sin_leer_sesion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cel   text;
  llave text;
  n_ser integer;
  n_cob integer;
  n_cre integer;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  llave := public.llave_de_sesion(cel);

  -- La MISMA condición con la que chat_leer_sesion marca como visto: si un
  -- día cambia allá, tiene que cambiar aquí, o el número no baja al leer.
  -- Usa el índice mensajes_sin_ver (cedula, canal) where not visto.
  select count(*) filter (where m.canal = 'servicio'),
         count(*) filter (where m.canal = 'cobranza'),
         count(*) filter (where m.canal = 'creditos')
    into n_ser, n_cob, n_cre
    from public.mensajes m
   where m.cedula = llave
     and m.de <> 'socio'
     and not m.visto;

  return jsonb_build_object('ok', true,
    'servicio', n_ser, 'cobranza', n_cob, 'creditos', n_cre,
    'total', n_ser + n_cob + n_cre);
end
$$;


-- ---------------------------------------------------------------------------
-- 2. EN QUÉ HILO LEE ESE CELULAR
-- ---------------------------------------------------------------------------
create or replace function public.chat_hilo_de_celular(p_clave text, p_celular text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave incorrecta';
  end if;

  -- Los últimos diez dígitos: el CRM guarda el teléfono del registro como lo
  -- escribió la persona («+57 300…», «300 …»). Un celular es 3 + nueve.
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if cel !~ '^3[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;

  return jsonb_build_object('ok', true, 'hilo', public.llave_de_sesion(cel));
end
$$;


-- ---------------------------------------------------------------------------
-- 3. PERMISOS — explícitos, de los tres: Supabase le regala EXECUTE a anon y a
--    authenticated en cada función nueva, y `revoke ... from public` no lo
--    quita (la lección del 28-ago, base/20260828c_permisos.sql).
-- ---------------------------------------------------------------------------
revoke all on function public.chat_sin_leer_sesion()               from public, anon, authenticated;
grant  execute on function public.chat_sin_leer_sesion()           to authenticated;
revoke all on function public.chat_hilo_de_celular(text, text)     from public, anon, authenticated;
grant  execute on function public.chat_hilo_de_celular(text, text) to anon;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------- QUÉ SE COMPRUEBA
-- LLAMANDO (PL/pgSQL compila en la primera llamada), con una sesión de
-- mentira dentro de la transacción, y limpiando lo suyo al final: una
-- excepción de «todo bien» revertiría también los create de arriba.
-- El celular de prueba empieza por 399: no hay ningún móvil colombiano así.
do $prueba$
declare
  cel     text := '3990002019';
  v_clave text;   -- NO «clave»: config_privada tiene una columna clave (42702)
  j       jsonb;
  n       integer;
  pasos   text := '';
begin
  -- Si quedara algo de una corrida que se cortó, se va antes de contar.
  delete from public.mensajes where cedula = cel;

  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);

  -- 'panel' y 'auto' cuentan; lo del propio cliente y lo ya visto, no.
  insert into public.mensajes (cedula, de, texto, canal, visto) values
    (cel, 'panel',  'te contesto por cobranzas', 'cobranza', false),
    (cel, 'auto',   'respuesta automatica',      'creditos', false),
    (cel, 'panel',  'otra por creditos',         'creditos', false),
    (cel, 'socio',  'lo mio no cuenta',          'servicio', false),
    (cel, 'panel',  'esta ya la vio',            'servicio', true);

  j := public.chat_sin_leer_sesion();
  if (j->>'ok') is distinct from 'true'
     or (j->>'servicio')::int <> 0 or (j->>'cobranza')::int <> 1
     or (j->>'creditos')::int <> 2 or (j->>'total')::int <> 3 then
    raise exception 'FALLO 1: la cuenta no es la que es: %', j;
  end if;
  pasos := pasos || '1 cuenta-por-canal; ';

  -- CONTAR NO ES LEER: nada quedó marcado. Si esto falla, Joan vería «Lo vio».
  select count(*) into n from public.mensajes where cedula = cel and de <> 'socio' and not visto;
  if n <> 3 then
    raise exception 'FALLO 2 GRAVE: contar marcó mensajes como vistos: el CRM diría «Lo vio» sin que nadie leyera.';
  end if;
  pasos := pasos || '2 contar-no-marca; ';

  -- Y al LEER un canal, ese baja a cero y los otros no.
  perform public.chat_leer_sesion('creditos', 0);
  j := public.chat_sin_leer_sesion();
  if (j->>'creditos')::int <> 0 or (j->>'cobranza')::int <> 1 or (j->>'total')::int <> 1 then
    raise exception 'FALLO 3: leer un canal no bajó su número (o bajó el de otro): %', j;
  end if;
  pasos := pasos || '3 leer-baja-el-suyo; ';

  -- Sin sesión, nada.
  perform set_config('request.jwt.claims', '{}', true);
  j := public.chat_sin_leer_sesion();
  if (j->>'ok') is distinct from 'false' then
    raise exception 'FALLO 4: sin sesión contestó una cuenta: %', j;
  end if;
  pasos := pasos || '4 sin-sesion-nada; ';

  -- El hilo de un celular que no es de nadie es el propio celular, y llega
  -- escrito como sea.
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then
    raise exception 'No hay clave_sync en config_privada: esta migración no se comprueba a ciegas.';
  end if;
  j := public.chat_hilo_de_celular(v_clave, '+57 399 000 2019');
  if (j->>'ok') is distinct from 'true' or (j->>'hilo') is distinct from public.llave_de_sesion(cel) then
    raise exception 'FALLO 5: el hilo del celular no es el que dice llave_de_sesion: %', j;
  end if;
  j := public.chat_hilo_de_celular(v_clave, '12345');
  if (j->>'ok') is distinct from 'false' then
    raise exception 'FALLO 5b: aceptó algo que no es un celular: %', j;
  end if;
  pasos := pasos || '5 el-hilo-lo-dice-la-base; ';

  -- Permisos: el contador, solo con sesión; el hilo, solo con la clave.
  if has_function_privilege('anon', 'public.chat_sin_leer_sesion()', 'execute') then
    raise exception 'FALLO 6 GRAVE: el contador del cliente quedó abierto sin sesión.';
  end if;
  if not has_function_privilege('authenticated', 'public.chat_sin_leer_sesion()', 'execute') then
    raise exception 'FALLO 6b: el cliente con sesión no puede contar sus mensajes.';
  end if;
  if not has_function_privilege('anon', 'public.chat_hilo_de_celular(text, text)', 'execute') then
    raise exception 'FALLO 6c: el CRM (anon con la clave) no puede preguntar el hilo.';
  end if;
  if has_function_privilege('authenticated', 'public.chat_hilo_de_celular(text, text)', 'execute') then
    raise exception 'FALLO 6d GRAVE: una sesión de cliente puede preguntar el hilo de cualquier celular.';
  end if;
  if has_function_privilege('anon', 'public.llave_de_sesion(text)', 'execute')
     or has_function_privilege('authenticated', 'public.llave_de_sesion(text)', 'execute') then
    raise exception 'FALLO 6e GRAVE: llave_de_sesion quedó llamable desde afuera.';
  end if;
  pasos := pasos || '6 permisos; ';

  delete from public.mensajes where cedula = cel;
  raise notice 'Listo: el cliente cuenta sin marcar, y el CRM sabe dónde escribir. % (datos de prueba borrados)', pasos;
end
$prueba$;

-- ------------------------------------------------------ qué falta probar ---
--   1. Correrlo DOS VECES seguidas: las dos dicen «Listo».
--   2. Las dos comprobaciones desde afuera de la cabecera (401 y 400).
--   3. Con play/ publicado: un cliente entra, Joan le contesta desde el CRM en
--      «Créditos nuevos», y en menos de 20 s la app del cliente dice
--      «Chat (1)» y «Créditos nuevos (1)»; al abrir esa pestaña, el número se
--      va, y el CRM pone «Lo vio».
