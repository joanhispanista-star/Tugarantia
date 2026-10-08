-- ===========================================================================
-- UNA SOLA PUERTA: CELULAR Y CONTRASEÑA PARA TODOS — 7 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve lo que ya está y no lo repite.
-- Después: Settings → API → «Reload schema» (el archivo también lo pide al
-- final). Y en seguida pega base/20261007b_una_puerta_comprobar.sql y mándale
-- a Claude los renglones que salgan: es la prueba de que se aplicó DE VERDAD
-- (lección de la casa: hubo migraciones «corridas» que nunca llegaron).
--
-- VA EL MISMO DÍA QUE SE PUBLICAN app/socio.html, panel/crm.html y
-- panel/espejo.html nuevos. Antes no: este archivo apaga la entrada con código,
-- y la app vieja no conoce otra.
--
-- 7-oct-2026 (segunda vuelta) — ANTES DE PEGARLO, MIRA QUE LA APP NUEVA YA
-- ESTÉ PUBLICADA: abre tugarantia.net/app/socio.html en el celular y tiene que
-- salir «Entrar» con celular y contraseña, y abajo la versión 2026-10-07. El
-- despliegue de este sitio ya falló sin avisar otras veces; si se pega esto con
-- la app vieja todavía servida, el cliente que ya estaba adentro recibe un
-- «no» que la app vieja lee como «sin red» y se queda mirando cifras viejas, y
-- el que entra por primera vez lee «No pude conectarme». Y la receta de play/
-- y PlataChat (RECETA-UNA-PUERTA-PLAY.md) va publicada ANTES de esto, no
-- después: sin ella, su caja de «pega tu código» contesta «Tu sesión se venció».
--
-- Y JUSTO DESPUÉS, base/20261007c_una_puerta_cierres.sql (los cierres que
-- encontró la revisión: datos de otro registro, la cuenta que se adelantó con
-- el número de un cliente, la fila de otra persona). Los dos van juntos.
--
-- ---------------------------------------------------------------------------
-- LO QUE DECIDIÓ JOAN (7-oct-2026)
--
-- «¿Por qué cada cliente necesita un código? Eso ya no debería existir. Quiero
--  que todos se registren igual y que el CRM detecte si es un cliente antiguo o
--  nuevo.»
--
-- 1. Una sola puerta: celular + contraseña (las cuentas que ya crea play/ al
--    registrarse). Nuevos y antiguos se registran igual.
-- 2. Al cliente ANTIGUO lo junta Joan con UN toque, mirando la revisión
--    automática. NUNCA solo: la cédula y el celular son datos públicos, y quien
--    registre el número de Adriana no puede ver la deuda de Adriana (Ley 1581,
--    SIC). Al cliente NUEVO se le junta al aprobarlo, que es cuando Joan abre
--    su ficha. (Segunda vuelta, 7-oct: si la cuenta se abrió antes que el
--    registro o hay un recado de contraseña abierto, un toque no basta: clave
--    nueva al número de la ficha y una hora. Ver la sección 1-bis.)
-- 3. Los códigos de acceso se apagan YA: este archivo le quita a la llave
--    pública las seis funciones que entregaban datos o juntaban cuentas con un
--    código. No se borra ninguna y no se reescribe ninguna: se revocan.
--
-- ---------------------------------------------------------------------------
-- LO QUE YA EXISTÍA Y SE REUSA (leído en la base, no supuesto)
--
-- La vinculación nació el 14-sep (20260914b_tres_canales.sql) y está viva:
--   · socios_historial.auth_vinculada_en / auth_celular — la marca;
--   · mi_cuenta() — devuelve el paquete SOLO si la ficha está junta con el
--     celular de la sesión; llave_de_sesion — el hilo del chat;
--   · sincronizar_socios — al cambiar de llave rescata la vinculación y nunca
--     la pisa en el `on conflict`;
--   · el índice único socios_un_telefono_una_ficha (20260922h): un teléfono,
--     una ficha.
-- Lo único que faltaba era QUIÉN junta. Hasta hoy, solo vincular_cuenta, que
-- pide el código. Desde hoy, Joan, con su clave (CRM) o con su sesión
-- (celular). No nace otra tabla de enlaces: nace un REGISTRO de quién juntó
-- qué (public.vinculos), que es evidencia, no mecanismo.
--
-- ---------------------------------------------------------------------------
-- UNA FUGA QUE ESTABA ABIERTA HOY, ANTES DE ESTE CAMBIO
--
-- Una cuenta SIN juntar leía el hilo de chat de su propio celular
-- (llave_de_sesion devolvía p_cel). Y las fichas sin cédula viven en la nube
-- con su CELULAR por llave (20260914b, sincronizar_socios): son 17 de 28. O
-- sea que cualquiera que se registrara con el número de un cliente antiguo sin
-- cédula leía su chat de cobranza, y podía escribir en él. Lo mismo con sus
-- solicitudes de crédito: mi_solicitud, solicitar_primer_credito y
-- aceptar_contrapropuesta leen `cedula = cel`, y las solicitudes que el
-- cliente mandó desde la app con su celular quedaron bajo su celular.
--
-- Se cierra acá (secciones 6 y 7): mientras la cuenta no esté junta, un
-- celular que es de una ficha habla en un hilo aparte ('0' + celular) y solo
-- ve las solicitudes que pidió DESPUÉS de abrir su cuenta. Las funciones vivas
-- no se copian: se leen con pg_get_functiondef y se les cambia una línea, con
-- el patrón de 20261002d (copiar cuerpos a mano ya perdió cosas en silencio).
--
-- ---------------------------------------------------------------------------
-- LO QUE NO HACE
--   · No borra códigos ni columnas: codigo_hash se queda (no abre nada).
--   · No toca play/ ni platachat/: sus recetas están en RECETA-UNA-PUERTA-PLAY.md.
--     7-oct-2026 (tercera vuelta): RECETA-UNA-PUERTA-PLAY.md ya se aplicó (se
--     fueron las cajas de «pega el código» de play/ y de PlataChat) y va
--     PUBLICADA antes que este archivo: con la versión vieja servida, esa caja
--     contestaría un error de permiso como «Tu sesión se venció».
--   · No cambia el registro (registrar_abierto) ni el signup.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES. Se para acá, sin tocar nada, y dice qué
--    archivo falta. (Esto sí lanza: todavía no se ha hecho nada que deshacer.)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.celular_de_sesion()') is null then
    raise exception 'Falta base/20260910c_quien_soy.sql (celular_de_sesion). Córrelo primero.';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null then
    raise exception 'Falta base/supabase.sql (clave_ok). Córrelo primero.';
  end if;
  if to_regprocedure('public.panel_es_dueno()') is null then
    raise exception 'Falta base/20260811_panel_nube.sql (panel_es_dueno). Córrelo primero.';
  end if;
  if to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'Falta base/20260914b_tres_canales.sql (llave_de_sesion). Córrelo primero.';
  end if;
  if to_regclass('public.ayudas_clave') is null then
    raise exception 'Falta base/20260922_a_la_medida_y_ayuda.sql (ayudas_clave). Córrelo primero.';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'socios_un_telefono_una_ficha') then
    raise exception 'Falta base/20260922h_una_ficha_por_telefono.sql (un teléfono, una ficha). Córrelo primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensajes' and column_name = 'regla') then
    raise exception 'Falta base/20260828b_chat.sql (la columna regla del chat). Córrelo primero.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. EL REGISTRO DE QUIÉN JUNTÓ QUÉ
--
-- No es el mecanismo (la marca sigue en socios_historial): es la evidencia.
-- Si un día alguien reclama ante la SIC que otra persona vio su deuda, aquí
-- está cuándo se juntó, con qué cuenta, por qué puerta, qué decía la revisión
-- automática en ese momento, y cuándo y por qué se deshizo.
--
-- RLS prendido y CERO políticas, más el revoke: nadie entra directo, ni con
-- sesión. Se lee por vinculos_listar, que pide la clave de Joan.
-- ---------------------------------------------------------------------------
create table if not exists public.vinculos (
  id               bigint generated always as identity primary key,
  cedula           text        not null,          -- la llave de la ficha en la nube
  celular          text        not null,          -- el de la cuenta, 10 dígitos
  auth_uid         uuid,
  cuenta_creada_en timestamptz,
  registro_id      bigint,
  por              text        not null,
  revision         jsonb       not null default '{}'::jsonb,
  mensajes_movidos bigint[]    not null default '{}',
  aviso_id         bigint,                        -- el «Listo, ya juntamos…»
  creado_en        timestamptz not null default now(),
  deshecho_en      timestamptz,
  deshecho_por     text,
  motivo           text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vinculos_por_valido') then
    alter table public.vinculos
      add constraint vinculos_por_valido
      check (por in ('crm', 'celular', 'aprobacion', 'codigo_viejo'));
  end if;
end
$$;

create index if not exists vinculos_vivos on public.vinculos (cedula) where deshecho_en is null;
create index if not exists vinculos_por_celular on public.vinculos (celular, creado_en desc);

alter table public.vinculos enable row level security;
revoke all on public.vinculos from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1-bis. LAS CLAVES NUEVAS QUE DIO JOAN (7-oct-2026, segunda vuelta)
--
-- POR QUÉ EXISTE. La revisión lo probó en un PostgreSQL de verdad: alguien
-- abre la cuenta con el celular de Adriana ANTES que ella; Adriana se
-- registra (su registro llega, su cuenta no: el número ya está tomado), y si
-- Joan juntaba ese registro, la cuenta del que se adelantó veía la deuda de
-- Adriana. Que la cuenta sea más vieja que el registro es justo la señal de
-- eso, y ningún toque la arregla: Joan no puede saber, mirando, quién tiene
-- la contraseña.
--
-- Lo único que sí lo prueba es esto: Joan le pone una contraseña nueva a esa
-- cuenta (clave_temporal_*), se la manda por WhatsApp AL NÚMERO DE LA FICHA, y
-- desde ese momento solo entra quien recibió ese WhatsApp. Este es el renglón
-- que lo anota, con la ficha a la que Joan dijo que la mandaba: una clave dada
-- por el recado de OTRA ficha no sirve para juntar esta. vincular_interna la
-- exige (sección 3) cuando la cuenta es más vieja que el registro o hay un
-- recado de contraseña abierto, y además espera UNA HORA desde la clave: el
-- token que ya tenía el que se adelantó sigue valiendo hasta una hora aunque
-- se le cierren las sesiones, y mi_cuenta le serviría la ficha en ese rato.
-- (Una hora es la duración de token que trae Supabase; si alguien la sube en
-- Settings → Auth, esta espera tiene que subir con ella.)
--
-- RLS prendido, cero políticas y el revoke: como vinculos, nadie la lee.
-- ---------------------------------------------------------------------------
create table if not exists public.claves_nuevas (
  id        bigint generated always as identity primary key,
  celular   text        not null,          -- el de la cuenta, 10 dígitos
  ficha     text,                          -- la llave de la ficha a cuyo número se mandó
  creado_en timestamptz not null default now()
);
create index if not exists claves_nuevas_por_celular on public.claves_nuevas (celular, creado_en desc);
alter table public.claves_nuevas enable row level security;
revoke all on public.claves_nuevas from public, anon, authenticated;

-- Las que ya estaban juntas (por código, desde el 14-sep) entran como
-- 'codigo_viejo': sin esto, «Cuentas juntas» en el CRM no las mostraría y
-- deshacerlas no dejaría rastro de cuándo nacieron.
insert into public.vinculos (cedula, celular, por, creado_en)
select s.cedula, s.auth_celular, 'codigo_viejo', s.auth_vinculada_en
  from public.socios_historial s
 where s.auth_vinculada_en is not null and s.auth_celular is not null
   and not exists (select 1 from public.vinculos v
                    where v.cedula = s.cedula and v.celular = s.auth_celular
                      and v.deshecho_en is null);


-- ---------------------------------------------------------------------------
-- 2. AYUDANTES INTERNOS (nadie de afuera los llama)
-- ---------------------------------------------------------------------------

-- La cuenta de acceso de un celular. Se lee de auth.users porque la cuenta es
-- lo que el cliente creó al registrarse: si no existe, no hay a quién juntar.
-- La fecha de creación y la última entrada son SEÑALES para Joan (una cuenta
-- abierta días antes del registro es rara), no pruebas.
create or replace function public.cuenta_de_celular(p_cel text)
returns table (uid uuid, creada_en timestamptz, ultima_entrada timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.created_at, u.last_sign_in_at
    from auth.users u
   where lower(u.email) = '57' || p_cel || '@tugarantia.net'
   limit 1
$$;

-- ¿Ese celular es la llave o el teléfono de alguna ficha? Se compara por los
-- últimos 10 dígitos: el Panel sube el teléfono como lo tenga escrito, y un
-- 57 adelante no puede abrir un hueco. Equivocarse hacia el «sí» solo manda a
-- un registrado nuevo a un hilo aparte; hacia el «no» le abre un hilo ajeno.
create or replace function public.celular_es_de_una_ficha(p_cel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(length(p_cel), 0) = 10 and exists (
    select 1 from public.socios_historial f
     where f.cedula = p_cel
        or right(f.cedula, 10) = p_cel
        or right(coalesce(f.celular, ''), 10) = p_cel)
$$;

-- ¿Esta solicitud la puede ver (o aceptar) la cuenta de ese celular?
--   · cuenta junta con una ficha → sí: Joan ya dijo que es esa persona;
--   · el celular no es de ninguna ficha → sí: no hay a quién quitarle nada;
--   · el celular ES de una ficha y la cuenta no está junta → solo lo que se
--     pidió DESPUÉS de abrir la cuenta. Lo de antes lo pidió otra persona: la
--     cuenta todavía no existía.
create or replace function public.solicitud_de_la_cuenta(p_cel text, p_creada timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when p_cel is null then false
    when exists (select 1 from public.socios_historial s
                  where s.auth_vinculada_en is not null and s.auth_celular = p_cel) then true
    when not public.celular_es_de_una_ficha(p_cel) then true
    else coalesce(p_creada >= (select u.created_at from auth.users u
                                where lower(u.email) = '57' || p_cel || '@tugarantia.net'
                                limit 1), false)
  end
$$;

-- 7-oct-2026 (segunda vuelta) — ¿ES LA FILA DE ESTA FICHA? La revisión probó
-- que juntar podía unir la cuenta con la fila de nube de OTRA persona: dos
-- fichas sin cédula que comparten celular «chocan» y no suben, y en la nube se
-- queda la fila vieja de Beto con la llave de ese celular; Joan juntaba a Ana
-- y la cuenta de Ana veía la deuda de Beto. La pantalla manda la llave Y el
-- nombre de la ficha, y la nube compara el nombre con el de la fila. Sin
-- tildes ni mayúsculas, y vale que uno sea el comienzo del otro palabra por
-- palabra («Adriana Pérez» y «Adriana Pérez Gómez»): el Panel escribe los
-- nombres como los oye y a veces los completa después. «Beto Primero» y «Ana
-- Segunda» no casan, y eso es lo que importa. Las mismas reglas viven en
-- panel/una-puerta.js (mismoNombre) y una prueba las compara.
create or replace function public.nombre_plano(p text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select btrim(regexp_replace(
           translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
           '\s+', ' ', 'g'))
$$;

create or replace function public.mismo_nombre(a text, b text)
returns boolean
language sql
immutable
security definer
set search_path = public
as $$
  select n.x <> '' and n.y <> ''
         and (n.x = n.y
              or left(n.x, length(n.y) + 1) = n.y || ' '
              or left(n.y, length(n.x) + 1) = n.x || ' ')
    from (select public.nombre_plano(a) as x, public.nombre_plano(b) as y) n
$$;

revoke all on function public.cuenta_de_celular(text)                      from public, anon, authenticated;
revoke all on function public.celular_es_de_una_ficha(text)                from public, anon, authenticated;
revoke all on function public.solicitud_de_la_cuenta(text, timestamptz)    from public, anon, authenticated;
revoke all on function public.nombre_plano(text)                           from public, anon, authenticated;
revoke all on function public.mismo_nombre(text, text)                     from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. JUNTAR — una sola función que hace el trabajo, y dos puertas
--
-- EL CELULAR SALE DEL REGISTRO, EN EL SERVIDOR. La pantalla manda el número
-- del registro (registros.id) y la llave de la ficha; nunca un celular. Así
-- no hay forma de juntar una ficha con un número que nadie registró.
--
-- SE NIEGA, sin tocar nada, cuando:
--   · el registro no existe, o su celular no es un celular;
--   · ese celular no tiene cuenta (se registró por la invitación vieja, o el
--     signup no terminó): no hay a quién juntar;
--   · la ficha no está en la nube (sus historiales no han subido);
--   · la ficha ya está junta con OTRO teléfono (se deshace primero);
--   · ese teléfono ya está junto con OTRA ficha (un teléfono, una ficha:
--     20260922h). El familiar que comparte celular necesita el suyo.
--   · 7-oct-2026 (segunda vuelta) — la fila de la nube no es de esa ficha: el
--     nombre que manda la pantalla no casa con el de la fila (mismo_nombre).
--     Es la fila vieja de otra persona con ese celular ('otra_fila');
--   · y EN LAS TRES PUERTAS, no solo en la de aprobación como decía la
--     primera versión: si la cuenta se abrió más de una hora antes del
--     registro, o hay un recado de «Olvidé mi contraseña» abierto con ese
--     número. Las dos son señales de que la cuenta puede no ser de quien Joan
--     conoce, y la revisión probó que un toque no las arregla: el toque de
--     Joan juntaba la ficha de Adriana con la cuenta del que se adelantó con
--     su número. Pasa SOLO si Joan le dio a esa cuenta una clave nueva al
--     número de la ficha (claves_nuevas, sección 1-bis) después del registro
--     y del recado, y de eso hace ya una hora. Si la clave es de hace menos,
--     contesta 'clave_reciente' con la hora desde la que se puede.
--
-- LO QUE YA ESCRIBIÓ SE MUDA CON ÉL: lo que quedó bajo '0' + celular (el hilo
-- aparte de la sección 6) y, si el celular no es la llave de OTRA ficha, lo
-- que quedó bajo el celular a secas (de antes de este archivo). Esa condición
-- es la que impide que juntar a Ana se lleve la conversación de Beto cuando
-- los dos comparten número. Los ids se anotan para poder devolverlos al
-- deshacer.
-- ---------------------------------------------------------------------------
-- 7-oct-2026 (segunda vuelta) — LA FIRMA CAMBIA (entra p_nombre). Se sueltan
-- las de antes: si quedaran las dos, la vieja seguiría juntando sin mirar el
-- nombre, y PostgREST no sabría a cuál llamar.
drop function if exists public.vincular_cuenta_joan(text, bigint, text, text, jsonb);
drop function if exists public.panel_vincular_cuenta(bigint, text, jsonb);
drop function if exists public.vincular_interna(bigint, text, text, jsonb);

create or replace function public.vincular_interna(
  p_registro_id bigint, p_ficha text, p_por text, p_revision jsonb, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  reg      public.registros;
  ficha    public.socios_historial;
  cel      text;
  ident    text;
  c_uid    uuid;
  c_creada timestamptz;
  recado   timestamptz;
  rot      timestamptz;
  razones  text[] := '{}';
  movidos  bigint[];
  v_aviso  bigint;
  v_id     bigint;
  rev      jsonb;
begin
  if coalesce(p_por, '') not in ('crm', 'celular', 'aprobacion') then
    return jsonb_build_object('ok', false, 'motivo', 'por');
  end if;

  select * into reg from public.registros where id = p_registro_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_registro');
  end if;

  cel := right(public.solo_digitos(coalesce(reg.telefono, '')), 10);
  if length(cel) <> 10 or left(cel, 1) <> '3' then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;

  select c.uid, c.creada_en into c_uid, c_creada from public.cuenta_de_celular(cel) c;
  if c_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta', 'celular', cel);
  end if;

  ident := public.solo_digitos(coalesce(p_ficha, ''));
  if ident = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_historial_en_la_nube');
  end if;
  select * into ficha from public.socios_historial where cedula = ident for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_historial_en_la_nube');
  end if;

  -- 7-oct-2026 (segunda vuelta) — ¿ES LA FILA DE ESTA FICHA? Ver mismo_nombre
  -- (sección 2). Sin nombre no se junta: una pantalla que no lo manda es una
  -- versión vieja, y juntar a ciegas es justo lo que esto vino a cerrar.
  if btrim(coalesce(p_nombre, '')) = '' then
    return jsonb_build_object('ok', false, 'motivo', 'falta_nombre');
  end if;
  if not public.mismo_nombre(ficha.nombre, p_nombre) then
    return jsonb_build_object('ok', false, 'motivo', 'otra_fila', 'nombre_en_la_nube', ficha.nombre);
  end if;

  if ficha.auth_vinculada_en is not null then
    if ficha.auth_celular = cel then
      return jsonb_build_object('ok', true, 'ya_estaba', true, 'nombre', ficha.nombre, 'celular', cel);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'ficha_con_otra_cuenta',
      'otro_termina_en', right(coalesce(ficha.auth_celular, ''), 4));
  end if;

  if exists (select 1 from public.socios_historial s
              where s.auth_celular = cel and s.auth_vinculada_en is not null
                and s.cedula <> ident) then
    return jsonb_build_object('ok', false, 'motivo', 'telefono_con_otra_ficha');
  end if;

  -- 7-oct-2026 (segunda vuelta) — LAS SEÑALES, EN LAS TRES PUERTAS. Ver la
  -- cabecera de esta sección y la 1-bis: sin una clave nueva al número de la
  -- ficha, de hace al menos una hora, no se junta.
  if c_creada < reg.creado_en - interval '1 hour' then
    razones := razones || 'La cuenta de ese celular se abrió más de una hora antes del registro.'::text;
  end if;
  select max(a.creada_en) into recado from public.ayudas_clave a
   where a.celular = cel and a.estado = 'nueva';
  if recado is not null then
    razones := razones || 'Hay un recado de «Olvidé mi contraseña» abierto con ese celular.'::text;
  end if;
  if coalesce(array_length(razones, 1), 0) > 0 then
    select max(k.creado_en) into rot from public.claves_nuevas k
     where k.celular = cel and k.ficha = ident
       and k.creado_en > reg.creado_en
       and k.creado_en > coalesce(recado, '-infinity'::timestamptz);
    if rot is null then
      return jsonb_build_object('ok', false,
        'motivo', case when p_por = 'aprobacion' then 'pide_toque' else 'necesita_clave_nueva' end,
        'razones', to_jsonb(razones));
    end if;
    if rot > now() - interval '1 hour' then
      return jsonb_build_object('ok', false, 'motivo', 'clave_reciente',
        'se_puede_desde', rot + interval '1 hour', 'razones', to_jsonb(razones));
    end if;
  end if;

  with m as (
    update public.mensajes
       set cedula = ident
     where cedula = '0' || cel
        or (cedula = cel and cel <> ident
            and not exists (select 1 from public.socios_historial o where o.cedula = cel))
    returning id)
  select coalesce(array_agg(id), '{}'::bigint[]) into movidos from m;

  update public.socios_historial
     set auth_vinculada_en = now(), auth_celular = cel
   where cedula = ident;

  -- El aviso en su chat de servicio: es lo que la pantalla de «tu registro
  -- llegó» le prometió («te avisamos por este chat cuando esté»).
  insert into public.mensajes (cedula, de, texto, canal, regla)
  values (ident, 'auto',
          'Listo, ya juntamos tu historial con tu cuenta. Desde ahora lo ves al entrar con tu celular y tu contraseña.',
          'servicio', 'vinculo')
  returning id into v_aviso;

  rev := case when jsonb_typeof(p_revision) = 'object' and length(p_revision::text) <= 20000
              then p_revision else '{}'::jsonb end;

  insert into public.vinculos (cedula, celular, auth_uid, cuenta_creada_en, registro_id,
                               por, revision, mensajes_movidos, aviso_id)
  values (ident, cel, c_uid, c_creada, reg.id, p_por, rev, movidos, v_aviso)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'ya_estaba', false, 'vinculo', v_id,
    'nombre', ficha.nombre, 'celular', cel, 'mensajes_movidos', coalesce(array_length(movidos, 1), 0),
    'cuenta_creada_en', c_creada);
end
$$;

-- La puerta del CRM: la llave pública + la clave de Joan, como el resto de su
-- bandeja. Volátil a propósito (el default): clave_ok ESCRIBE el freno, y
-- PostgREST corre las stable en solo lectura (20260922e lo cuenta).
-- p_nombre: el nombre de la ficha en el CRM (ver mismo_nombre).
create or replace function public.vincular_cuenta_joan(
  p_clave text, p_registro_id bigint, p_ficha text,
  p_por text default 'crm', p_revision jsonb default '{}'::jsonb, p_nombre text default null)
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
  return public.vincular_interna(p_registro_id, p_ficha,
    case when p_por = 'aprobacion' then 'aprobacion' else 'crm' end, p_revision, p_nombre);
end
$$;

-- La puerta del celular de Joan: su sesión de Supabase Auth (panel_es_dueno
-- compara auth.uid()), como panel_registros. Nunca la llave pública.
create or replace function public.panel_vincular_cuenta(
  p_registro_id bigint, p_ficha text, p_revision jsonb default '{}'::jsonb, p_nombre text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.vincular_interna(p_registro_id, p_ficha, 'celular', p_revision, p_nombre);
end
$$;


-- ---------------------------------------------------------------------------
-- 4. DESHACER — «Esta unión fue un error»
--
-- Suelta la marca, devuelve al hilo aparte ('0' + celular) lo que se mudó al
-- juntar MÁS lo que esa cuenta escribió después (de='socio' desde la hora de
-- la unión) y el aviso automático; lo que escribió Joan se queda en la ficha.
-- Cierra las sesiones de esa cuenta: el token que ya tenga sigue valiendo
-- hasta una hora, pero mi_cuenta mira la marca en cada llamada, así que el
-- historial deja de verse en la siguiente.
--
-- Lo que esa persona ya vio no se puede deshacer. Por eso el renglón de
-- vinculos se marca y NO se borra: es la evidencia para un reclamo.
-- ---------------------------------------------------------------------------
create or replace function public.desvincular_interna(p_ficha text, p_motivo text, p_quien text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ficha    public.socios_historial;
  v        public.vinculos;
  cel      text;
  ident    text;
  desde    timestamptz;
  n_dev    integer := 0;
  c_uid    uuid;
  cerradas boolean := false;
begin
  ident := public.solo_digitos(coalesce(p_ficha, ''));
  select * into ficha from public.socios_historial where cedula = ident for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_historial_en_la_nube');
  end if;
  if ficha.auth_vinculada_en is null then
    return jsonb_build_object('ok', true, 'ya_estaba', true);
  end if;

  cel   := ficha.auth_celular;
  desde := ficha.auth_vinculada_en;

  /* Por el CELULAR y no por la llave: si la ficha estrenó cédula después de
     juntarse, sincronizar_socios mudó la marca a la llave nueva y el renglón
     de vinculos se quedó con la vieja. Un teléfono solo puede estar junto con
     una ficha (20260922h), así que el renglón vivo de ese celular es este. */
  select * into v from public.vinculos
   where celular = cel and deshecho_en is null
   order by id desc limit 1;

  /* 7-oct-2026 (segunda vuelta) — AL HILO QUE ESA CUENTA VA A LEER. Si su
     celular no es de ninguna ficha (el cliente se cambió de número),
     llave_de_sesion le da el hilo de su celular a secas, no el '0' + celular:
     devolverle los mensajes al '0' los dejaba huérfanos —él leía un hilo
     vacío— y la bandeja de Joan rotulaba ese hilo «número de una ficha». Es
     la misma regla de llave_de_sesion (sección 6), escrita igual. */
  update public.mensajes
     set cedula = case when public.celular_es_de_una_ficha(cel) then '0' || cel else cel end
   where cedula = ident
     and (id = any(coalesce(v.mensajes_movidos, '{}'::bigint[]))
          or id = v.aviso_id
          or (de = 'socio' and creado_en >= desde));
  get diagnostics n_dev = row_count;

  update public.socios_historial
     set auth_vinculada_en = null, auth_celular = null
   where cedula = ident;

  if v.id is not null then
    update public.vinculos
       set deshecho_en = now(), deshecho_por = left(coalesce(p_quien, ''), 40),
           motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), '')
     where id = v.id;
  else
    insert into public.vinculos (cedula, celular, por, creado_en, deshecho_en, deshecho_por, motivo)
    values (ident, cel, 'codigo_viejo', desde, now(), left(coalesce(p_quien, ''), 40),
            nullif(left(btrim(coalesce(p_motivo, '')), 300), ''));
  end if;

  select c.uid into c_uid from public.cuenta_de_celular(cel) c;
  if c_uid is not null then
    begin
      delete from auth.refresh_tokens where user_id::text = c_uid::text;
      delete from auth.sessions where user_id::text = c_uid::text;
      cerradas := true;
    exception when others then
      cerradas := false;
    end;
  end if;

  return jsonb_build_object('ok', true, 'ya_estaba', false,
    'mensajes_devueltos', n_dev, 'sesiones_cerradas', cerradas,
    'celular_termina_en', right(cel, 4));
end
$$;

create or replace function public.desvincular_cuenta_joan(p_clave text, p_ficha text, p_motivo text default null)
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
  return public.desvincular_interna(p_ficha, p_motivo, 'crm');
end
$$;


-- ---------------------------------------------------------------------------
-- 5. LO QUE JOAN MIRA ANTES DE TOCAR
--
-- Por cada registro: si su celular tiene cuenta, cuándo se abrió (y cuántos
-- minutos antes o después del registro), la última entrada, si ya está junto
-- con alguna ficha, si hay un recado de contraseña abierto y el código de
-- verificación por WhatsApp que el registro dice haber mandado. Son las
-- señales del toque; ninguna decide sola.
-- ---------------------------------------------------------------------------
create or replace function public.cuentas_de_registros_interna(p_ids bigint[])
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(jsonb_agg(x.fila order by x.id), '[]'::jsonb)
    from (
      select r.id,
             jsonb_build_object(
               'registro_id', r.id,
               'celular', right(public.solo_digitos(coalesce(r.telefono, '')), 10),
               'cuenta', c.uid is not null,
               'cuenta_creada_en', c.creada_en,
               'ultima_entrada', c.ultima_entrada,
               'minutos_antes_del_registro',
                 case when c.creada_en is null then null
                      else floor(extract(epoch from (r.creado_en - c.creada_en)) / 60)::bigint end,
               'junta_con', (select s.cedula from public.socios_historial s
                              where s.auth_vinculada_en is not null
                                and s.auth_celular = right(public.solo_digitos(coalesce(r.telefono, '')), 10)
                              order by s.cedula limit 1),
               'recado_abierto', exists (select 1 from public.ayudas_clave a
                                          where a.estado = 'nueva'
                                            and a.celular = right(public.solo_digitos(coalesce(r.telefono, '')), 10)),
               -- 7-oct-2026 (segunda vuelta): la última clave nueva que Joan le
               -- dio a esa cuenta y a qué ficha. Con señales raras, juntar la
               -- exige (vincular_interna); la pantalla dice desde qué hora.
               'clave_nueva_en', (select k.creado_en from public.claves_nuevas k
                                   where k.celular = right(public.solo_digitos(coalesce(r.telefono, '')), 10)
                                   order by k.creado_en desc limit 1),
               'clave_nueva_ficha', (select k.ficha from public.claves_nuevas k
                                      where k.celular = right(public.solo_digitos(coalesce(r.telefono, '')), 10)
                                      order by k.creado_en desc limit 1),
               'registro_creado_en', r.creado_en,
               'verificacion', left(coalesce(r.datos ->> 'verificacion', ''), 20)
             ) as fila
        from public.registros r
        left join lateral public.cuenta_de_celular(right(public.solo_digitos(coalesce(r.telefono, '')), 10)) c on true
       where r.id = any((coalesce(p_ids, '{}'::bigint[]))[1:200])
    ) x
$$;

create or replace function public.cuentas_de_registros(p_clave text, p_ids bigint[])
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
  return public.cuentas_de_registros_interna(p_ids);
end
$$;

create or replace function public.panel_cuentas_de_registros(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.cuentas_de_registros_interna(p_ids);
end
$$;

-- «Cuentas juntas» en el CRM: las últimas 200, vivas y deshechas, con el
-- nombre de la ficha para que Joan reconozca a quién deshace.
create or replace function public.vinculos_listar(p_clave text)
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
  /* La ficha de una unión VIVA se busca por el celular junto, no por la llave
     con que se juntó: si la ficha estrenó cédula, la nube la mudó
     (sincronizar_socios) y «deshacer» tiene que pedir la llave de hoy. */
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'ficha', coalesce(s.cedula, v.cedula), 'nombre', coalesce(s.nombre, ''),
             'celular', v.celular, 'por', v.por, 'registro_id', v.registro_id,
             'cuenta_creada_en', v.cuenta_creada_en, 'creado_en', v.creado_en,
             'deshecho_en', v.deshecho_en, 'deshecho_por', v.deshecho_por, 'motivo', v.motivo,
             'mensajes_movidos', coalesce(array_length(v.mensajes_movidos, 1), 0))
           order by v.id desc)
      from (select * from public.vinculos order by id desc limit 200) v
      left join lateral (
        select f.cedula, f.nombre from public.socios_historial f
         where (v.deshecho_en is null and f.auth_vinculada_en is not null and f.auth_celular = v.celular)
            or f.cedula = v.cedula
         order by (v.deshecho_en is null and f.auth_celular = v.celular) desc, f.cedula
         limit 1) s on true), '[]'::jsonb);
end
$$;


-- ---------------------------------------------------------------------------
-- 6. EL HILO DE UNA CUENTA SIN JUNTAR — reescritura de llave_de_sesion
--
-- Hoy: vinculada → la cédula de su ficha; sin vincular → su celular.
-- Desde hoy, sin vincular y con un celular que ES de una ficha → '0' + celular.
-- Solo dígitos (sobrevive al solo_digitos de chat_responder, así que Joan le
-- contesta en ese hilo desde la bandeja) y no choca con ninguna llave: ninguna
-- cédula empieza por 0 y ningún celular tiene 11 dígitos.
-- A un registrado nuevo cuyo número no es de nadie no le cambia nada.
-- ---------------------------------------------------------------------------
do $$
declare
  src   text;
  nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'llave_de_sesion' and p.pronamespace = 'public'::regnamespace
     and pg_get_function_identity_arguments(p.oid) = 'p_cel text';

  if src ~ 'celular_es_de_una_ficha' then
    raise notice 'llave_de_sesion ya separa el hilo de la cuenta sin juntar: no se cambió nada.';
    return;
  end if;

  -- \s+ entre palabras: pg_get_functiondef no devuelve los espacios del
  -- archivo (trampa de la casa, 22-sep). Se ancla al cierre del coalesce:
  -- «… limit 1), p_cel)».
  nueva := regexp_replace(src,
    '(limit\s+1\s*\)\s*,)\s*p_cel\s*\)',
    E'\\1\n    -- 7-oct-2026 (base/20261007_una_puerta): sin juntar y con el celular de una ficha, hilo aparte.\n    case when public.celular_es_de_una_ficha(p_cel) then ''0'' || p_cel else p_cel end)',
    '');
  if nueva = src then
    raise notice 'FALTA: no encontré en llave_de_sesion el «limit 1), p_cel)» que esperaba. NO se cambió: la cuenta sin juntar sigue leyendo el hilo de su celular. Mándale a Claude pg_get_functiondef(''public.llave_de_sesion(text)'').';
    return;
  end if;
  execute nueva;
end
$$;


-- ---------------------------------------------------------------------------
-- 7. LAS SOLICITUDES DE OTRO — mi_solicitud, solicitar_primer_credito y
--    aceptar_contrapropuesta leen «cedula = cel». Se les agrega
--    solicitud_de_la_cuenta(cel, creada_en) en esa misma línea. Una por una,
--    y si una no tiene la línea esperada se dice y se sigue con las otras.
-- ---------------------------------------------------------------------------
do $$
declare
  f      text;
  patron text;
  cambio text;
  src    text;
  nueva  text;
  hechas text := '';
begin
  foreach f in array array['mi_solicitud', 'solicitar_primer_credito', 'aceptar_contrapropuesta'] loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p
     where p.proname = f and p.pronamespace = 'public'::regnamespace
     limit 1;
    if src is null then
      raise notice 'public.% no existe en esta base: nada que cerrar ahí.', f;
      continue;
    end if;
    if src ~ 'solicitud_de_la_cuenta' then
      hechas := hechas || f || ' (ya estaba) ';
      continue;
    end if;

    if f = 'mi_solicitud' then
      patron := 'where\s+cedula\s*=\s*cel\s+order\s+by';
      cambio := 'where cedula = cel and public.solicitud_de_la_cuenta(cel, creada_en) order by';
    elsif f = 'solicitar_primer_credito' then
      patron := 'where\s+cedula\s*=\s*cel\s+and\s+estado\s+in';
      cambio := 'where cedula = cel and public.solicitud_de_la_cuenta(cel, creada_en) and estado in';
    else
      patron := 'where\s+id\s*=\s*p_id\s+and\s+cedula\s*=\s*cel\s+and\s+estado';
      cambio := 'where id = p_id and cedula = cel and public.solicitud_de_la_cuenta(cel, creada_en) and estado';
    end if;

    nueva := regexp_replace(src, patron, cambio, '');
    if nueva = src then
      raise notice 'FALTA: no encontré en % la línea «cedula = cel» que esperaba. NO se cambió: mándale a Claude pg_get_functiondef de esa función.', f;
      continue;
    end if;
    execute nueva;
    hechas := hechas || f || ' ';
  end loop;
  raise notice 'solicitudes con la reja de la cuenta: %', hechas;
end
$$;


-- ---------------------------------------------------------------------------
-- 8. PEDIR UN CRÉDITO DESDE app/socio.html, CON SESIÓN
--
-- Reemplaza a crear_solicitud_por_codigo. Exige estar junto: el que no lo
-- está no tiene cupo que pedir (la app se lo dice antes). Guarda con la llave
-- de la ficha, como guardaba la puerta del código, y conserva el tope de 5
-- por hora y los mismos campos (20260820_entrada_por_celular.sql).
-- Contesta jsonb y no lanza por el producto: la app manda el WhatsApp igual y
-- solo necesita saber si la bandeja la recibió.
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_por_sesion(
  p_datos jsonb, p_producto text default 'quincenal', p_plazo integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel       text;
  r         public.socios_historial;
  prod      text;
  plazo     integer;
  recientes integer;
  nuevo     bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  select * into r from public.socios_historial
   where auth_vinculada_en is not null and auth_celular = cel
   order by actualizado_en desc, cedula limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_juntar');
  end if;

  prod := coalesce(p_producto, 'quincenal');
  if prod not in ('quincenal', 'respaldado') then
    return jsonb_build_object('ok', false, 'motivo', 'producto');
  end if;
  if prod = 'respaldado' then
    if p_plazo is null or p_plazo < 1 or p_plazo > 6 then
      return jsonb_build_object('ok', false, 'motivo', 'plazo');
    end if;
    plazo := p_plazo;
  end if;

  select count(*) into recientes
    from public.solicitudes
   where cedula = r.cedula and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, fecha_corte,
     garantia, cupo, sobre_cupo, producto, plazo_meses)
  values (
    r.cedula,
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

  return jsonb_build_object('ok', true, 'id', nuevo);
end
$$;


-- ---------------------------------------------------------------------------
-- 8-bis. ¿EN QUÉ VA MI REGISTRO? — para que la pantalla de la cuenta sin
-- juntar diga la verdad y no un «lo estamos revisando» de cajón: si Joan ya lo
-- atendió, si lo descartó, o si nunca llegó (el signup terminó y el registro
-- no). Solo el estado y la fecha del registro de SU celular, y solo uno hecho
-- alrededor de cuando se abrió la cuenta (registrar_abierto corre segundos
-- antes del signup): un registro viejo de ese número —de otra persona, por la
-- invitación de agosto— no le cuenta nada a quien acaba de abrir la cuenta.
-- ---------------------------------------------------------------------------
create or replace function public.mi_registro()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare cel text; desde timestamptz; r public.registros;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;

  select c.creada_en into desde from public.cuenta_de_celular(cel) c;
  select * into r from public.registros
   where right(public.solo_digitos(coalesce(telefono, '')), 10) = cel
     and creado_en >= coalesce(desde, now()) - interval '1 hour'
   order by creado_en desc, id desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'registro', null);
  end if;
  return jsonb_build_object('ok', true,
    'registro', jsonb_build_object('estado', r.estado, 'creado_en', r.creado_en));
end
$$;


-- ---------------------------------------------------------------------------
-- 9. UNA CONTRASEÑA NUEVA PARA QUIEN LA OLVIDÓ
--
-- Hasta hoy el recado de «Olvidé mi contraseña» solo se podía marcar «Ya le
-- escribí»: no había con qué devolverle el acceso. Con los códigos apagados,
-- sin esto un cliente que olvida su contraseña queda afuera para siempre.
--
-- Pone una contraseña de 8 caracteres (sin letras que se confundan), cierra
-- las sesiones de esa cuenta (si un intruso estaba adentro, sale) y la
-- devuelve UNA vez. El CRM abre WhatsApp al número de la FICHA con ella.
--
-- ANTES DE USARLA CON UN CLIENTE: probarla con una cuenta de prueba (registrar
-- un celular de prueba, darle la clave nueva, entrar con ella en la app). La
-- contraseña se guarda con crypt(..., gen_salt('bf')), que es el bcrypt que
-- usa Supabase Auth; si algún día cambiaran el formato, esto dejaría de servir
-- y la prueba lo diría.
-- ---------------------------------------------------------------------------
-- 7-oct-2026 (segunda vuelta) — DOS COSAS NUEVAS:
--   · NO A LAS CUENTAS DEL EQUIPO NI A LA DE JOAN. La revisión probó que esto
--     reiniciaba cualquier cuenta 57…@tugarantia.net, también la de un gerente
--     o un asesor: quien tuviera la clave de sincronización se volvía, con un
--     WhatsApp, cualquier persona del equipo. Y cualquiera puede dejar un
--     recado con el número de alguien del equipo. Esas cuentas se arreglan a
--     mano en Supabase, no desde una bandeja de recados.
--   · SE ANOTA (claves_nuevas, sección 1-bis) con la ficha a cuyo número dijo
--     Joan que la mandaba (p_ficha). Es lo que deja juntar una cuenta que se
--     abrió antes que el registro: ver vincular_interna.
-- La firma cambia (entra p_ficha): se suelta la vieja.
drop function if exists public.clave_temporal_joan(text, text);
drop function if exists public.clave_temporal_interna(text);

create or replace function public.clave_temporal_interna(p_celular text, p_ficha text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  cel       text;
  c_uid     uuid;
  es_equipo boolean := false;
  alfabeto  constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes     bytea;
  clave     text := '';
  i         integer;
begin
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(cel) <> 10 or left(cel, 1) <> '3' then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;

  select c.uid into c_uid from public.cuenta_de_celular(cel) c;
  if c_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta');
  end if;

  -- El equipo vive en public.equipo desde 20260910, que puede no estar
  -- corrido en todas las bases: se pregunta con execute para que su falta no
  -- rompa esta función (PL/pgSQL compila en la primera llamada).
  begin
    execute 'select exists (select 1 from public.equipo e
                             where right(public.solo_digitos(coalesce(e.celular, '''')), 10) = $1)'
       into es_equipo using cel;
  exception when undefined_table then
    es_equipo := false;
  end;
  if es_equipo or exists (select 1 from public.panel_duenos d where d.uid = c_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'equipo');
  end if;

  bytes := gen_random_bytes(8);
  for i in 0..7 loop
    clave := clave || substr(alfabeto, (get_byte(bytes, i) % length(alfabeto)) + 1, 1);
  end loop;

  update auth.users
     set encrypted_password = crypt(clave, gen_salt('bf')),
         updated_at = now()
   where id = c_uid;

  begin
    delete from auth.refresh_tokens where user_id::text = c_uid::text;
    delete from auth.sessions where user_id::text = c_uid::text;
  exception when others then
    null;   -- la contraseña ya cambió; las sesiones viejas vencen solas en una hora
  end;

  insert into public.claves_nuevas (celular, ficha)
  values (cel, nullif(public.solo_digitos(coalesce(p_ficha, '')), ''));

  return jsonb_build_object('ok', true, 'celular', cel, 'clave', clave);
end
$$;

-- p_ficha: la llave de la ficha a cuyo número Joan manda la clave, o null si
-- el recado no es de ningún cliente suyo.
create or replace function public.clave_temporal_joan(p_clave text, p_celular text, p_ficha text default null)
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
  return public.clave_temporal_interna(p_celular, p_ficha);
end
$$;


-- ---------------------------------------------------------------------------
-- 10. UNA CUENTA BORRADA NO DEJA HERENCIA
--
-- El correo de la cuenta no se puede cambiar (20260914) y la marca guarda el
-- celular. Si se borra la cuenta y OTRA persona se registra con ese número, la
-- marca seguiría diciendo «junta» y mi_cuenta le daría la ficha al nuevo.
-- Este disparador suelta la marca al borrar, y lo anota. Nunca impide borrar.
-- ---------------------------------------------------------------------------
create or replace function public.cuenta_borrada_desvincula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cel text;
begin
  cel := substring(lower(coalesce(old.email, '')) from '^57([0-9]{10})@tugarantia\.net$');
  if cel is null then return old; end if;
  update public.vinculos
     set deshecho_en = now(), deshecho_por = 'cuenta_borrada',
         motivo = coalesce(motivo, 'se borró la cuenta de acceso')
   where celular = cel and deshecho_en is null;
  update public.socios_historial
     set auth_vinculada_en = null, auth_celular = null
   where auth_celular = cel;
  return old;
exception when others then
  return old;
end
$$;

do $$
begin
  execute 'drop trigger if exists desvincular_al_borrar on auth.users';
  execute 'create trigger desvincular_al_borrar after delete on auth.users '
       || 'for each row execute function public.cuenta_borrada_desvincula()';
exception when others then
  raise notice 'FALTA: no pude poner el disparador sobre auth.users (%). Lo demás quedó.', sqlerrm;
end
$$;


-- ---------------------------------------------------------------------------
-- 11. LOS PERMISOS — dos tiempos: revoke nombrando a anon y authenticated
--     (Supabase les concede EXECUTE a cada función nueva de public por su
--     cuenta: 20260828c lo cuenta) y después el grant justo.
-- ---------------------------------------------------------------------------
revoke all on function public.vincular_interna(bigint, text, text, jsonb, text)    from public, anon, authenticated;
revoke all on function public.desvincular_interna(text, text, text)                from public, anon, authenticated;
revoke all on function public.cuentas_de_registros_interna(bigint[])               from public, anon, authenticated;
revoke all on function public.clave_temporal_interna(text, text)                   from public, anon, authenticated;
revoke all on function public.cuenta_borrada_desvincula()                          from public, anon, authenticated;

revoke all on function public.vincular_cuenta_joan(text, bigint, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.desvincular_cuenta_joan(text, text, text)            from public, anon, authenticated;
revoke all on function public.cuentas_de_registros(text, bigint[])                 from public, anon, authenticated;
revoke all on function public.vinculos_listar(text)                                from public, anon, authenticated;
revoke all on function public.clave_temporal_joan(text, text, text)                from public, anon, authenticated;
revoke all on function public.panel_vincular_cuenta(bigint, text, jsonb, text)     from public, anon, authenticated;
revoke all on function public.panel_cuentas_de_registros(bigint[])                 from public, anon, authenticated;
revoke all on function public.solicitar_por_sesion(jsonb, text, integer)           from public, anon, authenticated;
revoke all on function public.mi_registro()                                        from public, anon, authenticated;

-- El CRM: llave pública + la clave de Joan adentro (clave_ok, primera línea).
grant execute on function public.vincular_cuenta_joan(text, bigint, text, text, jsonb, text) to anon;
grant execute on function public.desvincular_cuenta_joan(text, text, text)            to anon;
grant execute on function public.cuentas_de_registros(text, bigint[])                 to anon;
grant execute on function public.vinculos_listar(text)                                to anon;
grant execute on function public.clave_temporal_joan(text, text, text)                to anon;
-- El celular de Joan: con su sesión, y adentro panel_es_dueno().
grant execute on function public.panel_vincular_cuenta(bigint, text, jsonb, text)     to authenticated;
grant execute on function public.panel_cuentas_de_registros(bigint[])                 to authenticated;
-- El cliente, con su sesión: solo lo suyo (celular_de_sesion, primera línea).
grant execute on function public.solicitar_por_sesion(jsonb, text, integer)           to authenticated;
grant execute on function public.mi_registro()                                        to authenticated;


-- ---------------------------------------------------------------------------
-- 12. LA PUERTA DEL CÓDIGO SE CIERRA
--
-- Por oid y no por firma escrita a mano (como 20260828c): estas funciones
-- cambiaron de firma con las migraciones, y un revoke con la firma vieja no
-- avisa de nada útil. NO se reescribe ninguna, NO se borra ninguna: se les
-- quita el permiso a la llave pública y a las sesiones. Si un día hiciera
-- falta volver atrás, es un grant.
--
--   historial_socio_por_codigo  — entregaba el historial con cédula/celular + código
--   crear_solicitud_por_codigo  — pedía un crédito a nombre de la ficha
--   cambiar_codigo_acceso       — el cliente cambiaba su código
--   chat_leer / chat_escribir   — el chat por código (la app usa los de sesión)
--   vincular_cuenta             — juntaba la cuenta con un código: desde hoy
--                                 junta Joan, con un toque
-- ---------------------------------------------------------------------------
do $$
declare f record; n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in ('historial_socio_por_codigo', 'crear_solicitud_por_codigo',
                         'cambiar_codigo_acceso', 'chat_leer', 'chat_escribir',
                         'vincular_cuenta')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    n := n + 1;
  end loop;
  raise notice 'La puerta del código: % funciones cerradas para la llave pública y las sesiones.', n;
end
$$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 13. LA COMPROBACIÓN, LLAMANDO Y SIN DESHACERSE A SÍ MISMA
--
-- PL/pgSQL compila el cuerpo en la PRIMERA LLAMADA (así vivió trece días rota
-- registro_archivos_guardar): por eso se llama a cada función nueva con datos
-- que no existen. Y se prueba la regla del hilo con una ficha de mentira que
-- se borra al final.
--
-- NUNCA `raise exception` acá: el editor corre el archivo en UNA transacción y
-- eso revertiría todo lo de arriba. Lo que falla se dice con un FALLA: en los
-- avisos, y la consulta de base/20261007b_una_puerta_comprobar.sql lo vuelve a
-- mirar renglón por renglón.
-- ---------------------------------------------------------------------------
do $prueba$
declare
  j      jsonb;
  pasos  text := '';
  fallas text := '';
  cel    constant text := '3009997711';   -- un celular de prueba, sin cuenta
  b      boolean;
begin
  -- 1. Cada función nueva, una vez, con datos que no existen.
  begin
    j := public.vincular_interna(-1, '0', 'crm', '{}'::jsonb, 'Prueba');
    if j->>'motivo' = 'sin_registro' then pasos := pasos || 'juntar '; else fallas := fallas || 'juntar=' || j::text || ' '; end if;
  exception when others then fallas := fallas || 'juntar(' || sqlerrm || ') ';
  end;
  begin
    j := public.desvincular_interna('0', 'prueba', 'prueba');
    if j->>'motivo' = 'sin_historial_en_la_nube' then pasos := pasos || 'deshacer '; else fallas := fallas || 'deshacer=' || j::text || ' '; end if;
  exception when others then fallas := fallas || 'deshacer(' || sqlerrm || ') ';
  end;
  begin
    j := public.cuentas_de_registros_interna(array[-1]::bigint[]);
    if jsonb_typeof(j) = 'array' then pasos := pasos || 'cuentas '; else fallas := fallas || 'cuentas ' ; end if;
  exception when others then fallas := fallas || 'cuentas(' || sqlerrm || ') ';
  end;
  begin
    j := public.clave_temporal_interna(cel, null);
    if j->>'motivo' = 'sin_cuenta' then pasos := pasos || 'clave '; else fallas := fallas || 'clave=' || j::text || ' '; end if;
  exception when others then fallas := fallas || 'clave(' || sqlerrm || ') ';
  end;
  begin
    b := public.solicitud_de_la_cuenta(cel, now());
    pasos := pasos || 'solicitudes ';
  exception when others then fallas := fallas || 'solicitudes(' || sqlerrm || ') ';
  end;
  begin
    -- Sin sesión (el editor no tiene JWT): tiene que contestar que no.
    j := public.mi_registro();
    if (j->>'ok') = 'false' then pasos := pasos || 'mi-registro '; else fallas := fallas || 'mi-registro=' || j::text || ' '; end if;
  exception when others then fallas := fallas || 'mi-registro(' || sqlerrm || ') ';
  end;

  -- 2. La regla del hilo, con una ficha de mentira cuya llave es el celular
  --    (como 17 de las 28 de verdad). Todo en un bloque propio: si algo
  --    falla, ese bloque se deshace solo y la ficha de mentira no queda.
  begin
    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, actualizado_en)
    values (cel, cel, right(cel, 4), 'Prueba una puerta', '{}'::jsonb, now());

    if public.llave_de_sesion(cel) = '0' || cel then
      pasos := pasos || 'hilo-aparte ';
    else
      fallas := fallas || 'hilo-aparte(da ' || coalesce(public.llave_de_sesion(cel), 'null') || ') ';
    end if;

    -- Junta a mano (la marca, como la deja vincular_interna) y deshace: lo
    -- escrito después de juntar vuelve al hilo aparte; lo de Joan se queda.
    update public.socios_historial set auth_vinculada_en = now() - interval '1 minute', auth_celular = cel
     where cedula = cel;
    if public.llave_de_sesion(cel) <> cel then
      fallas := fallas || 'junta-lee-su-ficha ';
    end if;
    insert into public.mensajes (cedula, de, texto, canal) values (cel, 'socio', 'prueba de la cuenta', 'servicio');
    insert into public.mensajes (cedula, de, texto, canal) values (cel, 'panel', 'prueba de Joan', 'servicio');
    j := public.desvincular_interna(cel, 'prueba', 'prueba');
    if (j->>'ok') = 'true' and (j->>'mensajes_devueltos') = '1'
       and exists (select 1 from public.mensajes where cedula = '0' || cel and texto = 'prueba de la cuenta')
       and exists (select 1 from public.mensajes where cedula = cel and texto = 'prueba de Joan')
       and exists (select 1 from public.socios_historial where cedula = cel and auth_vinculada_en is null) then
      pasos := pasos || 'deshacer-devuelve ';
    else
      fallas := fallas || 'deshacer-devuelve=' || j::text || ' ';
    end if;

    delete from public.mensajes where cedula in (cel, '0' || cel);
    delete from public.vinculos where cedula = cel;
    delete from public.socios_historial where cedula = cel;
  exception when others then
    fallas := fallas || 'ficha-de-prueba(' || sqlerrm || ') ';
  end;

  -- 3. 7-oct-2026 (segunda vuelta): el nombre que casa y el que no, como los
  --    probó la revisión. Puro: no toca ninguna tabla.
  begin
    if public.mismo_nombre('Adriana Pérez', 'ADRIANA PEREZ GÓMEZ')
       and public.mismo_nombre('  Beto   Primero ', 'beto primero')
       and not public.mismo_nombre('Beto Primero', 'Ana Segunda')
       and not public.mismo_nombre('Pedro Borrado', 'Lucia Otra')
       and not public.mismo_nombre('Adri', 'Adriana')
       and not public.mismo_nombre('', '') then
      pasos := pasos || 'mismo-nombre ';
    else
      fallas := fallas || 'mismo-nombre ';
    end if;
  exception when others then fallas := fallas || 'mismo-nombre(' || sqlerrm || ') ';
  end;

  raise notice 'Una puerta, llamando: %', pasos;
  if fallas <> '' then
    raise notice 'FALLA: %', fallas;
  end if;
end
$prueba$;

do $$
declare cuerpo text; malas text := '';
begin
  -- La puerta del código, cerrada de verdad.
  select string_agg(p.proname, ', ') into malas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('historial_socio_por_codigo', 'crear_solicitud_por_codigo',
                       'cambiar_codigo_acceso', 'chat_leer', 'chat_escribir', 'vincular_cuenta')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if malas is not null then
    raise notice 'FALLA: siguen abiertas con la llave pública o con sesión: %', malas;
  end if;

  if has_table_privilege('anon', 'public.vinculos', 'select')
     or has_table_privilege('authenticated', 'public.vinculos', 'select') then
    raise notice 'FALLA: public.vinculos quedó legible desde afuera.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.vinculos'::regclass) then
    raise notice 'FALLA: public.vinculos sin RLS.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.claves_nuevas'::regclass)
     or has_table_privilege('anon', 'public.claves_nuevas', 'select')
     or has_table_privilege('authenticated', 'public.claves_nuevas', 'select') then
    raise notice 'FALLA: public.claves_nuevas sin RLS o legible desde afuera.';
  end if;

  if has_function_privilege('anon', 'public.panel_vincular_cuenta(bigint, text, jsonb, text)', 'execute')
     or has_function_privilege('authenticated', 'public.vincular_cuenta_joan(text, bigint, text, text, jsonb, text)', 'execute')
     or has_function_privilege('anon', 'public.vincular_interna(bigint, text, text, jsonb, text)', 'execute')
     or has_function_privilege('authenticated', 'public.vincular_interna(bigint, text, text, jsonb, text)', 'execute')
     or has_function_privilege('anon', 'public.clave_temporal_interna(text, text)', 'execute')
     or has_function_privilege('anon', 'public.solicitar_por_sesion(jsonb, text, integer)', 'execute') then
    raise notice 'FALLA: alguna puerta nueva quedó abierta para quien no es.';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'llave_de_sesion' and pronamespace = 'public'::regnamespace;
  if cuerpo !~ 'celular_es_de_una_ficha' then
    raise notice 'FALLA: llave_de_sesion no separa el hilo de la cuenta sin juntar.';
  end if;
  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cuenta' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%auth_vinculada_en is not null%' then
    raise notice 'FALLA: mi_cuenta ya no exige la marca de la unión.';
  end if;

  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'socios_un_telefono_una_ficha') then
    raise notice 'FALLA: se fue el índice de un teléfono, una ficha.';
  end if;

  raise notice 'Listo. Falta: Settings → API → Reload schema, y pegar base/20261007b_una_puerta_comprobar.sql.';
end
$$;
