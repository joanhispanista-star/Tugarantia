-- ===========================================================================
-- LA CARTERA SALE DEL COMPUTADOR — 11 de agosto de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor, DESPUÉS de supabase.sql y de
-- 20260810_codigo_acceso.sql. Es idempotente: correrlo dos veces no rompe nada
-- y no toca ni una fila de datos.
--
-- QUÉ CAMBIA Y POR QUÉ
-- Hasta hoy la cartera entera de Joan vive en el localStorage de su computador,
-- en una sola llave ('joan_socios_v1'). El localStorage no sale del navegador
-- que lo escribió: por eso el CRM abierto en el celular aparece VACÍO, y por eso
-- cobrar en la calle significaba anotar en un papel y pasarlo a mano en la
-- noche. Lo que se anota en un papel se pierde.
--
-- Desde hoy la cartera también vive acá, y el celular pasa a ser un cliente más
-- del mismo dato: mira Y trabaja. El computador deja de ser "el original" y pasa
-- a ser otro aparato que sube y baja, igual que el teléfono.
--
-- LO QUE ESTE ARCHIVO NO HACE, y hay que decirlo antes de que alguien lo asuma:
--   · No resuelve solo un choque entre dos aparatos. Cuando el celular cobra a
--     las 10:15 y el computador guarda a las 14:40 con una copia de las 8:00,
--     ACÁ NO SE ELIGE UN GANADOR: se rechaza la escritura, se guardan las dos
--     versiones y decide Joan. Un servidor que elige "el último que llegó" es
--     exactamente el que borra el pago de las 10:15 sin que nadie se entere.
--   · No sabe nada de cupos, garantías, mora ni niveles. Eso lo calculan
--     app/motor.js y app/puente.js y no se reimplementa acá. Este archivo
--     guarda jsonb y cuenta revisiones; nada más. Un cálculo repetido en dos
--     idiomas es un cálculo que en algún momento va a contestar distinto.
--   · No filtra la papelera ni las fotos. Lo que suba, sube. El filtro vive en
--     panel/subir.html, que es donde Joan puede verlo y decidirlo.
--
-- CÓMO QUEDA PROTEGIDO
--   Igual que todo el resto del proyecto: tablas con RLS prendido y CERO
--   políticas, revoke a anon y authenticated, y lo único llamable son las cuatro
--   funciones de abajo. Pero acá hay una diferencia con el resto del archivo
--   viejo, y es a propósito:
--
--   ESTO NO ABRE CON LA CLAVE DE config_privada, ABRE CON UN USUARIO DE VERDAD.
--   La clave de sincronización viaja dentro del navegador y sirve para que un
--   Panel escriba el espejo que leen los socios. Acá se juega otra cosa: la
--   cartera COMPLETA de Joan, con nombres, cédulas, direcciones y plata. Eso
--   pide sesión de Supabase Auth (correo + contraseña + token que vence), y
--   además pide estar anotado a mano en public.panel_duenos. Tener una cuenta
--   en el proyecto no alcanza: hay que estar en esa lista.
--
--   Por eso NINGUNA función de este archivo se le concede a anon. Ninguna.
--
-- LO QUE JOAN TIENE QUE HACER A MANO DESPUÉS DE CORRER ESTO (los detalles, con
-- dónde queda cada botón, están en RECETA-PANEL-NUBE.md):
--   1. Authentication → Users → Add user: su correo y una contraseña de 20+
--      caracteres GENERADA por un gestor. Esa contraseña abre toda la cartera.
--   2. Authentication → Providers → Email: apagar "Enable sign ups". Si queda
--      prendido, cualquiera se crea una cuenta en el proyecto. No entraría acá
--      (falta panel_duenos), pero se le abre la puerta de la casa igual.
--   3. Anotarse como dueño, corriendo esto con su correo:
--        insert into public.panel_duenos (uid, nota)
--        select id, 'Joan — computador y celular'
--          from auth.users where email = 'EL-CORREO-DE-JOAN'
--        on conflict (uid) do nothing;
--   4. Settings → API → Reload schema. Sin eso las funciones nuevas contestan
--      404 aunque estén creadas. (Ya pasó con las del código de acceso.)
-- ===========================================================================


-- ---------------------------------------------------------------- tablas ---

-- Quién puede entrar. Una tabla y no un campo en auth.users porque auth es de
-- Supabase y no se toca: si mañana hay que migrar, esta lista se lleva entera.
create table if not exists public.panel_duenos (
  uid       uuid primary key,
  nota      text,                                  -- para quién es, lo escribe Joan
  creado_en timestamptz not null default now()
);

-- Las tres tablas de la cartera. La forma es idéntica a propósito: el Panel ya
-- guarda socios, créditos y respaldados como tres listas de objetos, y acá
-- viajan TAL CUAL, en 'datos'. No se desarma el objeto en columnas por una razón
-- concreta: el día que el Panel le agregue un campo a un crédito, no puede haber
-- que correr una migración para que ese campo pueda subir. Lo que la base sí
-- necesita saber es tres cosas por fila —quién la tocó, cuándo y en qué versión
-- va— y esas sí son columnas.
--
-- 'revision' es el corazón del asunto. Sube de a uno en cada escritura aceptada.
-- Un aparato que quiere escribir tiene que decir SOBRE QUÉ VERSIÓN escribe; si
-- no coincide con la que hay, no escribe. Ver panel_empujar.
--
-- 'borrado' es una marca, no un delete. Si se borrara la fila, el otro aparato
-- —que la tiene en su copia— la volvería a subir la próxima vez que sincronice,
-- y el borrado se desharía solo. Con la marca, el borrado también es un dato que
-- viaja.
create table if not exists public.panel_socios (
  id              text primary key,
  datos           jsonb       not null,
  revision        bigint      not null default 1,
  borrado         boolean     not null default false,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text                              -- 'computador' | 'celular' | lo que mande
);

create table if not exists public.panel_creditos (
  id              text primary key,
  datos           jsonb       not null,
  revision        bigint      not null default 1,
  borrado         boolean     not null default false,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

create table if not exists public.panel_respaldados (
  id              text primary key,
  datos           jsonb       not null,
  revision        bigint      not null default 1,
  borrado         boolean     not null default false,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- Lo que en el Panel no es una lista sino un objeto suelto. Claves que usa hoy:
-- 'config', 'plantillas', 'papelera', 'papeleraSocios', 'invitaciones'.
-- No hay check que las encierre: el día que el Panel guarde una sexta cosa, esto
-- tiene que dejarla pasar sin migración. Quién puede escribir acá ya está
-- resuelto arriba (hay que ser dueño), que es la parte que importa.
create table if not exists public.panel_ajustes (
  clave           text primary key,
  datos           jsonb       not null,
  revision        bigint      not null default 1,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- Los números que se emiten: cliente 48, crédito 3011, respaldado 7. Están acá y
-- no en el navegador porque son LO ÚNICO que dos aparatos no pueden calcular por
-- separado. Si el computador y el celular sacaran el siguiente número mirando su
-- propia copia, los dos sacarían el 48 y habría dos clientes 48 en la cartera. Un
-- número lo da la base, de a uno, con la fila bloqueada. Ver panel_siguiente_numero.
create table if not exists public.panel_contadores (
  nombre text primary key,                          -- 'cliente' | 'credito' | 'respaldado'
  valor  bigint not null default 0
);

-- Quién sincronizó, cuándo y cuánto. Sirve para una pregunta que se hace sola el
-- día que falte plata: "¿el celular llegó a subir el cobro del martes?".
-- Se agrega para siempre y hoy nada la limpia: si algún día pesa, se borra por
-- fecha a mano. No se inventa acá un proceso de limpieza que nadie va a vigilar.
create table if not exists public.panel_bitacora (
  id          bigserial primary key,
  cuando      timestamptz not null default now(),
  quien       uuid,
  que         text,                                 -- 'traer' | 'empujar'
  dispositivo text,
  filas       integer
);

-- Los choques, guardados enteros y de los dos lados. Esta tabla es la red: aunque
-- el celular se apague justo después de que el servidor rechace su escritura, lo
-- que quiso escribir queda acá y no se pierde. Es la diferencia entre "hubo un
-- conflicto" y "se perdió un pago".
create table if not exists public.panel_choques (
  id            bigserial primary key,
  tabla         text,
  fila_id       text,
  mio           jsonb,                              -- lo que mandó el aparato
  suyo          jsonb,                              -- lo que ya había en el servidor
  cuando        timestamptz default now(),
  resuelto_como text                                -- lo escribe Joan cuando decide
);

-- El cerrojo doble de siempre: RLS prendido y CERO políticas (nadie entra
-- directo, ni siquiera con sesión iniciada), más el revoke por si Supabase le
-- regala permisos a anon y authenticated sobre las tablas nuevas de public.
alter table public.panel_duenos      enable row level security;
alter table public.panel_socios      enable row level security;
alter table public.panel_creditos    enable row level security;
alter table public.panel_respaldados enable row level security;
alter table public.panel_ajustes     enable row level security;
alter table public.panel_contadores  enable row level security;
alter table public.panel_bitacora    enable row level security;
alter table public.panel_choques     enable row level security;

revoke all on public.panel_duenos      from anon, authenticated;
revoke all on public.panel_socios      from anon, authenticated;
revoke all on public.panel_creditos    from anon, authenticated;
revoke all on public.panel_respaldados from anon, authenticated;
revoke all on public.panel_ajustes     from anon, authenticated;
revoke all on public.panel_contadores  from anon, authenticated;
revoke all on public.panel_bitacora    from anon, authenticated;
revoke all on public.panel_choques     from anon, authenticated;

-- Y las dos secuencias de los bigserial. Una secuencia NO tiene RLS: se cierra
-- quitándole el permiso a mano, exactamente como se hizo con freno_clave en
-- supabase.sql. Las funciones de acá adentro la siguen usando igual, porque
-- corren como dueñas de la base (security definer).
revoke all on sequence public.panel_bitacora_id_seq from public, anon, authenticated;
revoke all on sequence public.panel_choques_id_seq  from public, anon, authenticated;

-- Buscar "qué cambió desde tal hora" es LA consulta de este archivo: la hace cada
-- aparato cada vez que sincroniza. Sin índice es un recorrido completo de la
-- cartera en cada tirón.
create index if not exists panel_socios_por_fecha      on public.panel_socios      (actualizado_en);
create index if not exists panel_creditos_por_fecha    on public.panel_creditos    (actualizado_en);
create index if not exists panel_respaldados_por_fecha on public.panel_respaldados (actualizado_en);
create index if not exists panel_ajustes_por_fecha     on public.panel_ajustes     (actualizado_en);
create index if not exists panel_choques_sin_resolver
  on public.panel_choques (cuando desc) where resuelto_como is null;


-- ------------------------------------------------------------- funciones ---

-- LA PUERTA. Todo lo demás empieza preguntándole a esta.
--
-- Va con security definer porque panel_duenos está cerrada con RLS y sin
-- políticas: un usuario cualquiera no puede leerla, y justamente por eso no puede
-- averiguar quién está en la lista. La función corre como dueña, mira, y contesta
-- sí o no.
--
-- auth.uid() sale del token que manda PostgREST. Sin sesión iniciada devuelve
-- null, y null nunca va a estar en la tabla: sin token, no hay dueño.
create or replace function public.panel_es_dueno()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.panel_duenos where uid = auth.uid())
$$;


-- BAJAR. Con p_desde null baja todo (la primera vez, o cuando un aparato se
-- resetea). Con p_desde baja solo lo que cambió después de esa hora.
--
-- POR QUÉ 'servidor_ahora' SE DEVUELVE CINCO SEGUNDOS ATRASADO
-- Es la trampa clásica de sincronizar por fecha, y cuesta plata cuando muerde.
-- En PostgreSQL, now() es la hora en que ARRANCÓ la transacción, no la hora en que
-- terminó. Otro aparato puede haber abierto su escritura a las 10:15:03, sellar sus
-- filas con esa hora, y hacer commit a las 10:15:06 — un segundo después de que
-- nosotros leímos. Esas filas ya no las vemos (todavía no estaban visibles) y
-- tampoco las vamos a ver nunca más, porque la próxima vez pediremos "desde
-- 10:15:05" y ellas dicen 10:15:03. El pago desaparece sin ruido.
--
-- La cura barata es no confiar en el filo: se devuelve una marca un poco vieja, así
-- que la próxima bajada se pisa unos segundos consigo misma y vuelve a traer un
-- puñado de filas que ya teníamos. Eso no cuesta nada —el cliente las aplica igual,
-- aplicar dos veces la misma revisión no cambia nada— y a cambio no se pierde una.
-- Cinco segundos porque una transacción de este archivo dura milisegundos; cinco
-- segundos es un margen absurdo a propósito.
create or replace function public.panel_traer(p_desde timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_socios      jsonb;
  v_creditos    jsonb;
  v_respaldados jsonb;
  v_ajustes     jsonb;
  v_total       integer;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  -- Las filas con borrado = true VIAJAN, también en la bajada completa. Un aparato
  -- que no las recibiera volvería a subir mañana la ficha que se borró hoy, y
  -- además no tendría la revisión de esa fila para poder escribirla nunca más.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'datos', t.datos, 'revision', t.revision,
           'borrado', t.borrado, 'actualizado_en', t.actualizado_en,
           'actualizado_por', t.actualizado_por) order by t.actualizado_en), '[]'::jsonb)
    into v_socios
    from public.panel_socios t
   where p_desde is null or t.actualizado_en > p_desde;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'datos', t.datos, 'revision', t.revision,
           'borrado', t.borrado, 'actualizado_en', t.actualizado_en,
           'actualizado_por', t.actualizado_por) order by t.actualizado_en), '[]'::jsonb)
    into v_creditos
    from public.panel_creditos t
   where p_desde is null or t.actualizado_en > p_desde;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'datos', t.datos, 'revision', t.revision,
           'borrado', t.borrado, 'actualizado_en', t.actualizado_en,
           'actualizado_por', t.actualizado_por) order by t.actualizado_en), '[]'::jsonb)
    into v_respaldados
    from public.panel_respaldados t
   where p_desde is null or t.actualizado_en > p_desde;

  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', t.clave, 'datos', t.datos, 'revision', t.revision,
           'actualizado_en', t.actualizado_en,
           'actualizado_por', t.actualizado_por) order by t.actualizado_en), '[]'::jsonb)
    into v_ajustes
    from public.panel_ajustes t
   where p_desde is null or t.actualizado_en > p_desde;

  v_total := jsonb_array_length(v_socios) + jsonb_array_length(v_creditos)
           + jsonb_array_length(v_respaldados) + jsonb_array_length(v_ajustes);

  insert into public.panel_bitacora (quien, que, filas)
       values (auth.uid(), 'traer', v_total);

  return jsonb_build_object(
    'servidor_ahora', now() - interval '5 seconds',
    'completo',       p_desde is null,
    'socios',         v_socios,
    'creditos',       v_creditos,
    'respaldados',    v_respaldados,
    'ajustes',        v_ajustes,
    -- Los contadores van SIEMPRE completos, aunque la bajada sea parcial: son
    -- tres números y el aparato los necesita para saber por dónde va la
    -- numeración aunque nadie haya emitido nada desde la última vez.
    'contadores', jsonb_build_object(
      'cliente',    coalesce((select valor from public.panel_contadores where nombre = 'cliente'), 0),
      'credito',    coalesce((select valor from public.panel_contadores where nombre = 'credito'), 0),
      'respaldado', coalesce((select valor from public.panel_contadores where nombre = 'respaldado'), 0)
    )
  );
end
$$;


-- SUBIR. Acá está la única regla que de verdad protege la plata:
-- NADIE ESCRIBE ENCIMA DE LO QUE NO VIO.
--
-- Cada fila del lote llega con 'revision_base': la versión que el aparato tenía
-- cuando la modificó. Si el servidor sigue en esa versión, la escritura entra y la
-- versión sube uno. Si el servidor ya está en otra, es que alguien más la tocó en
-- el medio: la fila NO SE ESCRIBE, se guarda en panel_choques con las dos
-- versiones y se devuelve en la lista de choques para que el aparato le pregunte a
-- Joan. El resto del lote sigue de largo; un choque en un crédito no puede frenar
-- los otros 199.
--
-- El bloqueo (for update) es lo que hace que dos aparatos que llegan al mismo
-- milisegundo no pasen los dos: el segundo espera, y cuando entra ya ve la
-- revisión nueva del primero, así que choca. Sin el bloqueo los dos leerían la
-- misma revisión vieja y los dos escribirían — el segundo borrando al primero.
create or replace function public.panel_empujar(p_dispositivo text, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla      text;
  v_real       text;
  v_fila       jsonb;
  v_id         text;
  v_datos      jsonb;
  v_borrado    boolean;
  v_base       bigint;
  v_rev        bigint;
  v_datos_srv  jsonb;
  v_por        text;
  v_cuando     timestamptz;
  v_filas      integer;
  v_choque     boolean;
  v_disp       text;
  v_aplicados  integer := 0;
  v_revisiones jsonb   := '[]'::jsonb;
  v_choques    jsonb   := '[]'::jsonb;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  -- Nunca 'null' en la bitácora: si un aparato no dice cómo se llama, queda
  -- 'desconocido' y al menos se sabe que fue alguien.
  v_disp := coalesce(nullif(btrim(coalesce(p_dispositivo, '')), ''), 'desconocido');

  -- Las tres tablas de filas. El nombre de la tabla sale de esta lista escrita a
  -- mano, NUNCA del lote que manda el cliente: por eso el format(%I) de abajo no
  -- puede recibir nada inventado desde afuera. (El %I igual va, porque una función
  -- security definer con SQL armado a mano es donde se cuelan las inyecciones, y
  -- la costumbre de saltárselo "porque acá no hace falta" es la que un día cuesta
  -- la base.)
  foreach v_tabla in array array['socios', 'creditos', 'respaldados'] loop
    v_real := 'panel_' || v_tabla;

    continue when jsonb_typeof(p_lote -> v_tabla) is distinct from 'array';

    for v_fila in select * from jsonb_array_elements(p_lote -> v_tabla) loop
      v_id      := nullif(btrim(coalesce(v_fila ->> 'id', '')), '');
      v_borrado := coalesce((v_fila ->> 'borrado')::boolean, false);
      v_base    := coalesce((v_fila ->> 'revision_base')::bigint, 0);
      v_datos   := v_fila -> 'datos';
      v_choque  := false;

      -- Una fila sin id no es un caso de la calle: es un defecto de panel/nube.js.
      -- Se corta fuerte y a la vista en vez de guardarla con un id inventado, que
      -- es como se fabrican los duplicados que nadie sabe de dónde salieron.
      if v_id is null then
        raise exception 'fila sin id en %', v_tabla;
      end if;

      -- Lo mismo con los datos, salvo cuando la fila viene marcada como borrada:
      -- ahí el contenido ya no importa y el aparato puede no tenerlo.
      if v_datos is null or jsonb_typeof(v_datos) <> 'object' then
        if v_borrado then
          v_datos := '{}'::jsonb;
        else
          raise exception 'fila % de % sin datos', v_id, v_tabla;
        end if;
      end if;

      -- Estado actual, con la fila bloqueada hasta el final de esta transacción.
      -- Se limpian las variables antes porque EXECUTE ... INTO deja los destinos en
      -- null cuando no hay fila, pero no está de más que se lea explícito: de esos
      -- valores colgados de la vuelta anterior salen los errores más difíciles.
      v_rev := null; v_datos_srv := null; v_por := null; v_cuando := null;
      execute format(
        'select revision, datos, actualizado_por, actualizado_en
           from public.%I where id = $1 for update', v_real)
        into v_rev, v_datos_srv, v_por, v_cuando
        using v_id;

      if v_rev is null then
        -- No está en el servidor.
        if v_base <> 0 then
          -- El aparato jura que la tenía en la versión N y acá no hay nada. Pasa
          -- cuando alguien vació la nube y el aparato conservó su espejo viejo. No
          -- se inventa nada: choca, y en el Panel se arregla borrando el espejo
          -- local para que vuelva a subir todo como nuevo.
          v_choque := true;
        else
          -- on conflict do nothing y no un insert pelado: dos aparatos pueden
          -- estrenar la misma fila en el mismo instante, y una violación de clave
          -- primaria cancelaría el LOTE ENTERO, no solo esta fila.
          execute format(
            'insert into public.%I (id, datos, revision, borrado, actualizado_en, actualizado_por)
             values ($1, $2, 1, $3, now(), $4)
             on conflict (id) do nothing', v_real)
            using v_id, v_datos, v_borrado, v_disp;
          get diagnostics v_filas = row_count;

          if v_filas = 0 then
            -- Se nos adelantaron entre el select y el insert. Es un choque como
            -- cualquier otro; se relee para poder mostrar las dos versiones.
            execute format(
              'select revision, datos, actualizado_por, actualizado_en
                 from public.%I where id = $1', v_real)
              into v_rev, v_datos_srv, v_por, v_cuando
              using v_id;
            v_choque := true;
          else
            v_rev := 1;
          end if;
        end if;

      elsif v_rev = v_base then
        execute format(
          'update public.%I
              set datos = $1, revision = $2, borrado = $3,
                  actualizado_en = now(), actualizado_por = $4
            where id = $5', v_real)
          using v_datos, v_rev + 1, v_borrado, v_disp, v_id;
        v_rev := v_rev + 1;

      else
        v_choque := true;
      end if;

      if v_choque then
        insert into public.panel_choques (tabla, fila_id, mio, suyo)
        values (v_tabla, v_id, v_fila,
                jsonb_build_object('revision', v_rev, 'datos', v_datos_srv,
                                   'actualizado_por', v_por, 'actualizado_en', v_cuando));
        v_choques := v_choques || jsonb_build_object(
          'tabla', v_tabla, 'id', v_id,
          'revision_servidor', v_rev, 'datos_servidor', v_datos_srv,
          'actualizado_por', v_por, 'actualizado_en', v_cuando);
      else
        v_aplicados  := v_aplicados + 1;
        v_revisiones := v_revisiones || jsonb_build_object(
          'tabla', v_tabla, 'id', v_id, 'revision', v_rev);
      end if;
    end loop;
  end loop;

  -- Los ajustes van aparte y no dentro del mismo recorrido porque su tabla tiene
  -- otra forma: la llave se llama 'clave' y no hay columna 'borrado' (un ajuste no
  -- se borra, se deja vacío). Forzar las dos formas en un solo bloque dinámico
  -- salía más largo y menos legible que estas treinta líneas.
  if jsonb_typeof(p_lote -> 'ajustes') = 'array' then
    for v_fila in select * from jsonb_array_elements(p_lote -> 'ajustes') loop
      v_id     := nullif(btrim(coalesce(v_fila ->> 'clave', '')), '');
      v_base   := coalesce((v_fila ->> 'revision_base')::bigint, 0);
      v_datos  := v_fila -> 'datos';
      v_choque := false;

      if v_id is null then
        raise exception 'ajuste sin clave';
      end if;
      if v_datos is null then
        raise exception 'ajuste % sin datos', v_id;
      end if;

      v_rev := null; v_datos_srv := null; v_por := null; v_cuando := null;
      select revision, datos, actualizado_por, actualizado_en
        into v_rev, v_datos_srv, v_por, v_cuando
        from public.panel_ajustes where clave = v_id for update;

      if v_rev is null then
        if v_base <> 0 then
          v_choque := true;
        else
          insert into public.panel_ajustes (clave, datos, revision, actualizado_en, actualizado_por)
          values (v_id, v_datos, 1, now(), v_disp)
          on conflict (clave) do nothing;
          get diagnostics v_filas = row_count;

          if v_filas = 0 then
            select revision, datos, actualizado_por, actualizado_en
              into v_rev, v_datos_srv, v_por, v_cuando
              from public.panel_ajustes where clave = v_id;
            v_choque := true;
          else
            v_rev := 1;
          end if;
        end if;

      elsif v_rev = v_base then
        update public.panel_ajustes
           set datos = v_datos, revision = v_rev + 1,
               actualizado_en = now(), actualizado_por = v_disp
         where clave = v_id;
        v_rev := v_rev + 1;

      else
        v_choque := true;
      end if;

      if v_choque then
        insert into public.panel_choques (tabla, fila_id, mio, suyo)
        values ('ajustes', v_id, v_fila,
                jsonb_build_object('revision', v_rev, 'datos', v_datos_srv,
                                   'actualizado_por', v_por, 'actualizado_en', v_cuando));
        v_choques := v_choques || jsonb_build_object(
          'tabla', 'ajustes', 'id', v_id,
          'revision_servidor', v_rev, 'datos_servidor', v_datos_srv,
          'actualizado_por', v_por, 'actualizado_en', v_cuando);
      else
        v_aplicados  := v_aplicados + 1;
        v_revisiones := v_revisiones || jsonb_build_object(
          'tabla', 'ajustes', 'id', v_id, 'revision', v_rev);
      end if;
    end loop;
  end if;

  insert into public.panel_bitacora (quien, que, dispositivo, filas)
       values (auth.uid(), 'empujar', v_disp, v_aplicados);

  return jsonb_build_object(
    'aplicados',  v_aplicados,
    'revisiones', v_revisiones,
    'choques',    v_choques
  );
end
$$;


-- EL SIGUIENTE NÚMERO. Lo pide el aparato justo antes de crear un cliente, un
-- crédito o un respaldado.
--
-- El insert ... on conflict do update bloquea la fila mientras suma, así que dos
-- aparatos que lo pidan a la vez se ponen en fila solos: uno se lleva el 48 y el
-- otro el 49. Nunca los dos el 48. Esa es toda la razón de que esta tabla exista.
--
-- Ojo con lo que NO garantiza: si el aparato pide el número y después se queda sin
-- señal antes de subir la ficha, ese número queda quemado y en la cartera va a
-- faltar el 48. Un hueco en la numeración es feo; dos clientes con el mismo número
-- es un problema de verdad. Se elige el hueco.
create or replace function public.panel_siguiente_numero(p_nombre text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_valor bigint;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  -- Lista cerrada a propósito: un nombre con un dedazo ('creditos' en vez de
  -- 'credito') crearía un contador nuevo empezando en 1 y el aparato se pondría a
  -- emitir números repetidos sin que nadie lo note.
  if p_nombre not in ('cliente', 'credito', 'respaldado') then
    raise exception 'contador desconocido: %', p_nombre;
  end if;

  insert into public.panel_contadores (nombre, valor)
       values (p_nombre, 1)
  on conflict (nombre) do update set valor = panel_contadores.valor + 1
    returning valor into v_valor;

  return v_valor;
end
$$;


-- SEMBRAR EL CONTADOR. Es para la primera subida y para nada más.
--
-- El Panel de Joan ya viene con clientes hasta el 47 y créditos hasta el 3011.
-- Si la nube arrancara en cero, el celular emitiría el cliente 1 —que ya existe—
-- y a partir de ahí habría dos fichas peleando por el mismo número. Así que antes
-- de subir nada, el computador le dice a la base hasta dónde llegó.
--
-- NUNCA BAJA. Se queda con el mayor entre lo que hay y lo que le mandan, y esto
-- no es una precaución teórica: alcanza con que Joan corra la subida dos veces, la
-- segunda desde un respaldo viejo, para que un "poner en 47" después de un 52
-- repita cinco números.
create or replace function public.panel_sembrar_contador(p_nombre text, p_valor bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_valor bigint;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  if p_nombre not in ('cliente', 'credito', 'respaldado') then
    raise exception 'contador desconocido: %', p_nombre;
  end if;

  insert into public.panel_contadores (nombre, valor)
       values (p_nombre, greatest(coalesce(p_valor, 0), 0))
  on conflict (nombre) do update
          set valor = greatest(panel_contadores.valor, excluded.valor)
    returning valor into v_valor;

  return v_valor;
end
$$;


-- ---------------------------------------------------------------- grants ---
-- En dos tiempos, como todo el resto del proyecto: primero se le quita a todo el
-- mundo, después se le da al que toca. El orden importa, porque PostgreSQL le
-- concede EXECUTE a PUBLIC por defecto: una función nueva nace abierta.

revoke all on function public.panel_es_dueno()                      from public, anon, authenticated;
revoke all on function public.panel_traer(timestamptz)              from public, anon, authenticated;
revoke all on function public.panel_empujar(text, jsonb)            from public, anon, authenticated;
revoke all on function public.panel_siguiente_numero(text)          from public, anon, authenticated;
revoke all on function public.panel_sembrar_contador(text, bigint)  from public, anon, authenticated;

-- Y ahora solo a authenticated, o sea: solo con sesión de Supabase Auth iniciada.
-- Tener sesión tampoco alcanza —adentro cada una vuelve a preguntar por
-- panel_es_dueno()—, pero así ni siquiera se las puede tocar desde afuera.
grant execute on function public.panel_traer(timestamptz)             to authenticated;
grant execute on function public.panel_empujar(text, jsonb)           to authenticated;
grant execute on function public.panel_siguiente_numero(text)         to authenticated;
grant execute on function public.panel_sembrar_contador(text, bigint) to authenticated;

-- panel_es_dueno NO lleva grant, a propósito: la llaman las otras cuatro, que
-- corren como dueñas de la base y no necesitan permiso propio. Publicarla sería
-- regalar un "¿estoy en la lista?" que no le sirve a nadie de afuera.
--
-- Y NINGUNA lleva grant a anon. La llave anon va escrita dentro de las páginas
-- públicas del proyecto: lo que se le concede a anon se le concede a internet.


-- ------------------------------------ un agujero viejo, en el mismo viaje ---
-- Esto no es del Panel en la nube, pero se tapa acá porque se encontró revisando
-- los grants de este archivo y no se puede dejar para otro día.
--
-- En base/supabase.sql, el bloque del chat (5-ago-2026) creó SIETE funciones y les
-- puso los grants a anon, pero se saltó el "revoke ... from public" que sí llevan
-- todas las demás. Y PostgreSQL le da EXECUTE a PUBLIC por defecto: una función de
-- public sin revoke queda llamable por cualquiera.
--
-- La peor de las siete es chat_puede_escribir(text). Es security definer, lee
-- public.mensajes —una tabla declarada cerrada, con RLS y sin políticas— y hoy
-- contesta a cualquiera que la llame por PostgREST con la llave anon, sin clave ni
-- cédula verificada. No devuelve mensajes, pero sí un true/false por cédula que
-- dice si esa persona escribió menos de 20 mensajes en los últimos 15 minutos: es
-- un oráculo de "esta cédula está usando el chat ahora mismo". Y aparte era la
-- única de las siete que NUNCA debió estar publicada, porque es interna.
--
-- Las otras seis ya estaban concedidas a anon y authenticated a propósito (piden
-- clave, o cédula + últimos 4), así que taparlas es formalidad: se les quita todo
-- y se les devuelve EXACTAMENTE lo que tenían. Ni un permiso más.
--
-- Las firmas están copiadas de base/supabase.sql:1070-1266, verificadas una por
-- una. Si alguna no coincide, el revoke no falla: crea el permiso sobre una
-- función que no existe y tira error — que es justo lo que queremos que pase.
revoke all on function public.chat_puede_escribir(text)              from public;
revoke all on function public.chat_escribir(text, text, text)        from public;
revoke all on function public.chat_leer(text, text, bigint)          from public;
revoke all on function public.chat_conversaciones(text)              from public;
revoke all on function public.chat_de(text, text, bigint)            from public;
revoke all on function public.chat_responder(text, text, text)       from public;
revoke all on function public.chat_olvidar(text, text)               from public;

-- Se devuelve lo que ya tenían en supabase.sql:1261-1266 — a anon Y a
-- authenticated, tal como estaba. chat_puede_escribir queda afuera: es interna, la
-- llama chat_escribir desde adentro, y nunca necesitó permiso propio.
grant execute on function public.chat_escribir(text, text, text)     to anon, authenticated;
grant execute on function public.chat_leer(text, text, bigint)       to anon, authenticated;
grant execute on function public.chat_conversaciones(text)           to anon, authenticated;
grant execute on function public.chat_de(text, text, bigint)         to anon, authenticated;
grant execute on function public.chat_responder(text, text, text)    to anon, authenticated;
grant execute on function public.chat_olvidar(text, text)            to anon, authenticated;


-- ------------------------------------------------------ qué falta probar ---
-- NADA DE ESTE ARCHIVO SE CORRIÓ TODAVÍA CONTRA UNA BASE DE VERDAD. Está escrito
-- siguiendo el estilo y las trampas ya conocidas de supabase.sql, y revisado a
-- mano, pero no probado. Esto es lo que hay que probarle, en este orden, y las
-- pruebas 9, 10 y 14 son las que de verdad deciden si sirve.
--
-- IDEMPOTENCIA
--   1. Correrlo DOS VECES seguidas en una base limpia: la segunda no puede tirar
--      error ni borrar nada.
--   2. Correrlo con datos adentro (después de la primera subida): ninguna fila de
--      panel_socios/creditos/respaldados puede cambiar de revisión.
--   3. Correrlo con los contadores ya sembrados (cliente = 47): siguen en 47.
--
-- LA PUERTA
--   4. Con la llave anon y SIN sesión: POST a /rest/v1/rpc/panel_traer →
--      permiso denegado, nunca un 200 con datos. Lo mismo con panel_empujar,
--      panel_siguiente_numero y panel_sembrar_contador. Las cuatro.
--   5. Con sesión iniciada de un usuario que NO está en panel_duenos → las cuatro
--      tienen que tirar 'no autorizado'.
--   6. Con la llave anon: select sobre panel_socios, panel_ajustes, panel_choques,
--      panel_bitacora y panel_duenos → vacío o error de permiso. Nunca una fila.
--   7. rpc/panel_es_dueno con la llave anon y con sesión de dueño → las dos veces
--      error de permiso (no está concedida a nadie).
--   8. select nextval('public.panel_bitacora_id_seq') como rol anon → 'permission
--      denied for sequence'.
--
-- EL MARTES DE COBRO — la prueba que justifica el archivo entero
--   9. Con un crédito ya en la nube en revisión 3:
--        a. el "computador" baja y se queda con revision_base = 3;
--        b. el "celular" empuja ese crédito con revision_base = 3 → entra, queda
--           en revisión 4;
--        c. el "computador" empuja el suyo, todavía con revision_base = 3 →
--           aplicados = 0, un choque en la respuesta, y en panel_choques UNA fila
--           con 'mio' = lo del computador y 'suyo' = lo del celular.
--      Y lo que hay que mirar de verdad: el crédito en panel_creditos tiene que
--      seguir con lo que escribió el celular. Si quedó lo del computador, el pago
--      de las 10:15 se perdió y el archivo no sirve.
--  10. Que un choque no arrastre al lote: mandar 5 filas donde solo la tercera
--      choca → aplicados = 4, choques = 1, y las otras cuatro escritas de verdad.
--  11. Fila nueva con revision_base ausente, 0 y null → las tres entran con
--      revisión 1. Con revision_base = 7 y la fila inexistente → choque.
--  12. Empujar dos veces el MISMO lote sin volver a bajar → la segunda vez todo
--      choca y no se escribe nada. (Es el caso de "se cortó la señal y reintenté".)
--  13. borrado = true sin 'datos' → entra. borrado = false sin 'datos' → error
--      'fila X de Y sin datos', y el lote entero se cancela.
--
-- LOS NÚMEROS
--  14. DOS SESIONES psql a la vez, las dos con begin y las dos llamando
--      panel_siguiente_numero('cliente') → tienen que salir dos números
--      distintos y consecutivos. Nunca el mismo dos veces. (Probarlo también con
--      la primera haciendo rollback: el número que sacó queda quemado igual, y
--      eso es lo correcto.)
--  15. panel_sembrar_contador('cliente', 47) y después ('cliente', 20) → las dos
--      devuelven 47. Nunca baja.
--  16. panel_siguiente_numero('creditos') (con la s de más) → excepción
--      'contador desconocido', y NO se crea la fila en panel_contadores.
--
-- LA BAJADA
--  17. panel_traer(null) → completo = true y todo. panel_traer(servidor_ahora de
--      la vez anterior) → completo = false y solo lo que cambió.
--  18. Que los 5 segundos de atraso hagan su trabajo: escribir una fila, bajar,
--      escribir otra en el mismo segundo, volver a bajar con el servidor_ahora
--      recibido → la segunda tiene que aparecer. (Y aceptar que alguna repetida
--      aparezca dos veces: es el precio, y aplicar dos veces no cambia nada.)
--  19. Una fila con borrado = true tiene que venir en la bajada completa, no
--      desaparecer.
--  20. Los contadores vienen siempre, aunque no haya cambiado ni una fila.
--
-- EL AGUJERO DEL CHAT
--  21. ANTES de correr esto, con la llave anon:
--        POST /rest/v1/rpc/chat_puede_escribir  {"p_cedula":"52111222"}
--      → hoy contesta true/false. DESPUÉS de correr esto → error de permiso.
--      Si antes ya daba error, mejor: quiere decir que alguien lo tapó antes.
--  22. Y que las otras seis SIGAN andando igual que ayer: chat_escribir y
--      chat_leer desde la app del socio, chat_conversaciones y chat_responder
--      desde el Panel con la clave. Las cuatro tienen que contestar como siempre.
--      Este es el riesgo real de este bloque: quitar de más y dejar el chat mudo.
--
-- Y LO DE SIEMPRE
--  23. Settings → API → Reload schema. Sin eso las cuatro funciones nuevas
--      contestan 404 aunque estén creadas.
