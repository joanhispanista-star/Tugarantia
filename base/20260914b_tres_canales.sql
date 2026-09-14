-- ===========================================================================
-- TRES CANALES DE CHAT, Y EL CANDADO DE LA PUERTA ÚNICA
-- 14 de septiembre de 2026
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
-- Va después de 20260914_el_correo_no_se_cambia.sql.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «una pestaña chat, en el cual esté el chat de servicio al cliente y el chat
--  de cobranzas y el chat de créditos nuevos»
-- «que tanto nuevos como antiguos ingresen por el mismo lado y se registren»
--
-- ---------------------------------------------------------------------------
-- EL CANDADO, QUE ES LA MITAD IMPORTANTE DE ESTE ARCHIVO
--
-- La puerta única dice: el cliente VIEJO se registra como si fuera nuevo, con
-- su celular y una contraseña que él elige. Suena inofensivo hasta que se mira
-- de dónde sale la identidad:
--
--   · Registrarse está abierto con la llave pública, que está en el código
--     fuente de la página (disable_signup:false, mailer_autoconfirm:true —
--     comprobado contra el proyecto).
--   · El correo sale del celular: 57<celular>@tugarantia.net.
--   · Un número de celular en Colombia no es un secreto. Joan mismo tiene una
--     base de 697 números de gente que no conoce.
--
-- Entonces: EL PRIMERO QUE REGISTRE EL CELULAR DE UN CLIENTE VIEJO SE QUEDA CON
-- ESA CUENTA. Hoy eso no da nada, porque ninguna función por sesión devuelve el
-- historial del socio — lo comprobé barriendo las 60 funciones de base/. Pero la
-- puerta única existe justo para escribir esas funciones, y el día que exista la
-- primera, quien haya registrado primero lee el chat, la garantía y los créditos
-- de otra persona.
--
-- Por eso el candado va ANTES que la primera función que lo necesita, y no
-- después:
--
--   Una cuenta con sesión NO ve el historial de ningún socio mientras no
--   demuestre ser ese socio, y lo demuestra con su CÉDULA MÁS SU CÓDIGO —
--   los dos, igual que hoy en historial_socio_por_codigo. El código de cinco
--   caracteres no aguanta solo: por eso la función de hoy pide las dos cosas y
--   esta pide las dos también.
--
-- Mientras no lo demuestre, la cuenta se comporta como un registrado nuevo:
-- cupo cero, sin historial, con su chat propio. No es un error — es la verdad
-- sobre alguien que todavía no ha probado quién es.
--
-- SE VINCULA UNA VEZ Y NADA MÁS. Si ya está vinculada, esta función se niega
-- aunque el código sea correcto: un código que se filtró no puede servir para
-- siempre, y el segundo en llegar no le quita la cuenta al primero.
-- Desvincular lo hace Joan desde el CRM, nunca el cliente.
--
-- EL CELULAR NO TIENE QUE COINCIDIR con el de la ficha vieja, y es deliberado:
-- Joan dice que sus clientes tienen la información incompleta y los números
-- cambian de dueño. Exigir que coincida dejaría afuera justo a los que se
-- cambiaron de número. El código es la prueba, como ya lo es hoy.
--
-- EL SOCIO SIN CÓDIGO no puede vincularse solo, y está bien: entra como nuevo y
-- Joan lo une desde la mesa de cruce del CRM, que ya existe.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. EL CANAL DEL MENSAJE
--
-- Tres valores, en minúscula y sin tildes, sacados de las palabras de Joan.
-- El default es 'servicio' a propósito: las filas que ya existen no tienen
-- canal, y servicio es el cajón neutro — donde escribe el que no sabe dónde
-- escribir. Dejarlo NULL obligaría a un coalesce en cada consulta, y alguna se
-- iba a olvidar.
-- ---------------------------------------------------------------------------
alter table public.mensajes
  add column if not exists canal text not null default 'servicio';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_canal_valido') then
    alter table public.mensajes
      add constraint mensajes_canal_valido
      check (canal in ('servicio', 'cobranza', 'creditos'));
  end if;
end $$;

-- La consulta deja de ser «los mensajes de esta cédula» y pasa a ser «los de
-- esta cédula EN ESTE CANAL, a partir de este id».
create index if not exists mensajes_cedula_canal_id on public.mensajes (cedula, canal, id);
drop index if exists public.mensajes_sin_ver;
create index if not exists mensajes_sin_ver on public.mensajes (cedula, canal) where not visto;

-- ---------------------------------------------------------------------------
-- 2. LA MARCA DE LA VINCULACIÓN
-- ---------------------------------------------------------------------------
alter table public.socios_historial
  add column if not exists auth_vinculada_en timestamptz,
  add column if not exists auth_celular      text;

create index if not exists socios_por_auth on public.socios_historial (auth_celular)
  where auth_celular is not null;

-- ---------------------------------------------------------------------------
-- 3. VINCULAR — el cliente viejo demuestra que es él
--
-- Misma reja que historial_socio_por_codigo: el mismo freno, el mismo null mudo
-- y el mismo «una forma mal puesta cuenta como fallo» (si no, sería gratis
-- tantear el largo). No se inventa una reja nueva para la misma llave.
-- ---------------------------------------------------------------------------
create or replace function public.vincular_cuenta(p_ident text, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare cel text; r public.socios_historial; ident text; h text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;

  ident := public.solo_digitos(p_ident);
  if not public.puede_intentar(ident) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiados intentos');
  end if;

  h := public.huella_codigo(p_codigo);
  if h is null then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  select * into r
    from public.socios_historial
   where (cedula = ident or celular = ident)
     and codigo_hash = h
   order by actualizado_en desc
   limit 1;

  if not found then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  /* UNA VEZ Y NADA MÁS. Si ya la reclamó alguien, se niega aunque el código
     esté bien. Y si la reclamó ESTA misma cuenta, se contesta que sí: volver a
     intentarlo no puede parecer un fallo. */
  if r.auth_vinculada_en is not null then
    if r.auth_celular = cel then
      return jsonb_build_object('ok', true, 'ya_estaba', true, 'nombre', r.nombre);
    end if;
    perform public.anotar_fallo(ident);
    return jsonb_build_object('ok', false, 'motivo',
      'esa cuenta ya está vinculada a otro teléfono. Habla con nosotros.');
  end if;

  /* LO QUE YA ESCRIBIÓ SE MUDA CON ÉL. Antes de vincularse, sus mensajes
     quedaron bajo su celular; desde ahora su hilo es el de la ficha. Sin esta
     línea tendría dos conversaciones y Joan vería dos: la del cliente, con
     nombre, y otra suelta sin nombre. Es el mismo movimiento que hace
     sincronizar_socios cuando cambia la llave, y por la misma razón. */
  if r.cedula <> cel then
    update public.mensajes set cedula = r.cedula where cedula = cel;
  end if;

  update public.socios_historial
     set auth_vinculada_en = now(), auth_celular = cel
   where cedula = r.cedula;

  perform public.limpiar_fallos(ident);
  return jsonb_build_object('ok', true, 'ya_estaba', false, 'nombre', r.nombre);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. MI CUENTA — lo que ve el que entró, y SOLO si demostró quién es
--
-- No recibe ningún parámetro que diga de quién es la cuenta: saca el celular
-- del JWT. La reja la decide el servidor, no la pantalla.
-- ---------------------------------------------------------------------------
create or replace function public.mi_cuenta()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare cel text; r public.socios_historial;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;

  select * into r from public.socios_historial
   where auth_vinculada_en is not null and auth_celular = cel
   order by actualizado_en desc limit 1;

  /* Sin vincular NO es un error: es un registrado nuevo, y así se le contesta.
     Cuenta vacía, y la pantalla le explica que su historial está en camino. */
  if not found then
    return jsonb_build_object('ok', true, 'vinculada', false);
  end if;

  return jsonb_build_object('ok', true, 'vinculada', true,
    'nombre', r.nombre, 'datos', r.datos, 'actualizado_en', r.actualizado_en);
end
$$;

-- ---------------------------------------------------------------------------
-- 4-bis. LA LLAVE DEL HILO, EN UN SOLO SITIO
--
-- No es el celular de la sesión a secas, y esa fue mi primera respuesta
-- equivocada. Este sistema ya tiene una LLAVE CANÓNICA para una conversación:
-- la cédula cuando la hay, el celular cuando no. Y sincronizar_socios la
-- respeta — hace `update mensajes set cedula = ident where cedula = cel` el día
-- que Joan le carga la cédula a una ficha que subía por celular, con un
-- comentario del 28-ago que dice por qué: «Dos verdades sobre la misma
-- conversación, y ninguna alarma».
--
-- Si el chat por sesión leyera siempre por el celular, ese día el cliente
-- abriría la app y su conversación habría desaparecido. Así que la llave es:
--   · vinculado    → la cédula de su ficha, que es la canónica
--   · sin vincular → su celular, que es lo único que hay
--
-- En una sola función para que no se escriba dos veces.
-- ---------------------------------------------------------------------------
create or replace function public.llave_de_sesion(p_cel text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.cedula from public.socios_historial s
      where s.auth_vinculada_en is not null and s.auth_celular = p_cel
      order by s.actualizado_en desc limit 1),
    p_cel)
$$;

-- ---------------------------------------------------------------------------
-- 5. EL CHAT POR SESIÓN, CON CANAL
--
-- NO va detrás del candado, y es a propósito: un registrado nuevo también tiene
-- derecho a escribirle a Joan — es justo por donde va a pedir su primer crédito
-- o a preguntar por qué no ve su historial. Lo que el candado protege es el
-- HISTORIAL, no la conversación.
--
-- El hilo se identifica con el CELULAR DE LA SESIÓN, siempre. Una sola regla,
-- sin ramas: quien entró es quien escribe.
-- ---------------------------------------------------------------------------
create or replace function public.chat_escribir_sesion(p_canal text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; llave text; v_canal text; txt text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  llave := public.llave_de_sesion(cel);

  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else 'servicio' end;
  txt := btrim(coalesce(p_texto, ''));
  if length(txt) < 1 or length(txt) > 1000 then
    return jsonb_build_object('ok', false, 'motivo', 'el mensaje va de 1 a 1000 caracteres');
  end if;

  /* chat_puede_escribir y NO puede_intentar_tope: aquella CUENTA los mensajes
     que el socio ya escribió en la ventana; ésta solo lee un contador de fallos
     que nadie incrementa para esta llave, así que el tope no se dispararía
     nunca. Es el mismo defecto que tiene muerto al freno global del registro
     desde agosto: un freno que no frena es peor que no tener freno, porque se
     lee como si estuviera puesto. */
  if not public.chat_puede_escribir(llave) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'demasiados mensajes seguidos');
  end if;

  insert into public.mensajes (cedula, de, texto, canal) values (llave, 'socio', txt, v_canal);
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.chat_leer_sesion(p_canal text, p_desde bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; llave text; v_canal text;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  llave := public.llave_de_sesion(cel);
  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else 'servicio' end;

  /* Al leer, lo que le mandaron queda visto. Volátil por esto: escribe.
     `de <> 'socio'` y no `de = 'panel'`: hay mensajes de 'auto' y de 'agente',
     y con la comparación estrecha nunca quedarían vistos — la campanita del
     cliente se quedaría encendida para siempre. Es como lo hace chat_leer. */
  update public.mensajes set visto = true
   where cedula = llave and canal = v_canal and de <> 'socio' and not visto;

  /* Viajan `regla` y `visto` porque hiloHTML los usa: el `visto` del último
     mensaje propio es lo que pinta el «visto» debajo de la burbuja. Sin ellos
     la pantalla no se rompe — simplemente deja de decir algo que sí sabe. */
  return jsonb_build_object('ok', true, 'canal', v_canal, 'mensajes', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', id, 'de', de, 'texto', texto, 'regla', regla,
             'visto', visto, 'creado_en', creado_en) order by id)
      from public.mensajes
     where cedula = llave and canal = v_canal and id > coalesce(p_desde, 0)), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------------------
-- 5-bis. QUE UNA SUBIDA DE HISTORIALES NO DESVINCULE A NADIE
--
-- sincronizar_socios borra y vuelve a insertar la fila cuando cambia la llave
-- (de celular a cédula), y hasta hoy solo rescataba el código. Las dos columnas
-- de la vinculación se iban con el borrado, así que el cliente que ya había
-- probado quién era volvía a la cuenta vacía la próxima vez que Joan publicara.
--
-- El cuerpo NO se reescribió a mano: se copió del archivo vivo
-- (20260909_una_sola_puerta.sql, idéntico al que Joan corrió) y se le
-- insertaron tres cosas — leer las dos columnas antes del borrado, escribirlas
-- en la fila nueva, y no pisarlas en el `on conflict`.
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
  v_en     timestamptz;
  v_cel    text;
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
      -- 14-sep-2026 — Y LA VINCULACIÓN TAMBIÉN VIAJA. El `delete` de abajo se
      -- llevaba auth_vinculada_en y auth_celular, que nacieron hoy: el cliente
      -- que ya había probado quién era volvía a ver «tu historial está en
      -- camino» la próxima vez que Joan subiera historiales. Mismo defecto que
      -- el del código el 9-sep, con dos columnas que aquel arreglo no podía
      -- conocer.
      select codigo_hash, coalesce(codigo_propio, false), auth_vinculada_en, auth_celular
        into h_viejo, propio, v_en, v_cel
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

    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, codigo_hash, codigo_propio, auth_vinculada_en, auth_celular, actualizado_en)
    values (
      ident,
      cel,
      right(coalesce(cel, ''), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      case when forzar then false else propio end,
      v_en,
      v_cel,
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
          -- La vinculación NO se pisa: se queda la que hubiera, y si la fila
          -- cambió de llave se recoge la rescatada. Una subida de historiales
          -- de Joan no puede desvincular a nadie.
          auth_vinculada_en = coalesce(socios_historial.auth_vinculada_en, excluded.auth_vinculada_en),
          auth_celular      = coalesce(socios_historial.auth_celular, excluded.auth_celular),
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. LOS PERMISOS
-- ---------------------------------------------------------------------------
revoke all on function public.vincular_cuenta(text, text) from public, anon, authenticated;
grant  execute on function public.vincular_cuenta(text, text) to authenticated;
revoke all on function public.mi_cuenta() from public, anon, authenticated;
grant  execute on function public.mi_cuenta() to authenticated;
revoke all on function public.chat_escribir_sesion(text, text) from public, anon, authenticated;
grant  execute on function public.chat_escribir_sesion(text, text) to authenticated;
revoke all on function public.chat_leer_sesion(text, bigint) from public, anon, authenticated;
grant  execute on function public.chat_leer_sesion(text, bigint) to authenticated;
-- La llave es de uso interno: recibe un celular y contesta bajo qué hilo vive.
revoke all on function public.llave_de_sesion(text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 7. LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text;
begin
  -- La puerta de la identidad, de la que cuelga todo esto.
  select prosrc into cuerpo from pg_proc
   where proname = 'celular_de_sesion' and pronamespace = 'public'::regnamespace;
  if cuerpo is null or cuerpo like '%not like%' or cuerpo not like '%net$%' then
    raise exception 'falta correr base/20260910c_quien_soy.sql antes que este archivo';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'auth' and c.relname = 'users'
                    and t.tgname = 'correo_fijo' and not t.tgisinternal) then
    raise exception 'falta correr base/20260914_el_correo_no_se_cambia.sql antes que este archivo';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensajes' and column_name = 'canal') then
    raise exception 'no quedo la columna canal';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'socios_historial'
                    and column_name = 'auth_vinculada_en') then
    raise exception 'no quedo la marca de vinculacion';
  end if;

  -- EL CANDADO. mi_cuenta no puede devolver el historial sin la marca.
  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cuenta' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%auth_vinculada_en is not null%' then
    raise exception 'mi_cuenta no exige la vinculacion: cualquiera que registre el celular de un socio viejo leeria su historial';
  end if;
  if cuerpo not like '%celular_de_sesion%' then
    raise exception 'mi_cuenta no saca de la sesion de quien es la cuenta';
  end if;

  -- Vincular usa la MISMA reja que la puerta vieja, no una inventada.
  select prosrc into cuerpo from pg_proc
   where proname = 'vincular_cuenta' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%puede_intentar%' or cuerpo not like '%anotar_fallo%'
     or cuerpo not like '%huella_codigo%' then
    raise exception 'vincular_cuenta no usa el freno ni la huella del codigo';
  end if;
  if cuerpo not like '%auth_vinculada_en is not null%' then
    raise exception 'vincular_cuenta deja vincular dos veces: un codigo filtrado serviria para siempre';
  end if;

  if has_function_privilege('anon', 'public.mi_cuenta()', 'execute')
     or has_function_privilege('anon', 'public.vincular_cuenta(text, text)', 'execute')
     or has_function_privilege('anon', 'public.chat_escribir_sesion(text, text)', 'execute')
     or has_function_privilege('anon', 'public.chat_leer_sesion(text, bigint)', 'execute')
     or has_function_privilege('anon', 'public.llave_de_sesion(text)', 'execute') then
    raise exception 'alguna funcion por sesion quedo abierta sin sesion';
  end if;

  -- EL FRENO DEL CHAT TIENE QUE CONTAR ALGO. puede_intentar_tope solo LEE un
  -- contador de fallos, y para la llave del chat nadie lo incrementa: el tope
  -- no se dispararia nunca. Un freno que no frena es peor que ninguno.
  select prosrc into cuerpo from pg_proc
   where proname = 'chat_escribir_sesion' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%chat_puede_escribir%' then
    raise exception 'chat_escribir_sesion no usa un freno que cuente de verdad';
  end if;

  -- Y LA SUBIDA DE HISTORIALES NO PUEDE DESVINCULAR A NADIE.
  select prosrc into cuerpo from pg_proc
   where proname = 'sincronizar_socios' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%auth_vinculada_en%' then
    raise exception 'sincronizar_socios no rescata la vinculacion: la siguiente subida desvincularia a todos';
  end if;
end $$;
