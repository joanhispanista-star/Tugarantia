-- ===========================================================================
-- EL GERENTE AGREGA — 27 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Es el paso 2.4-bis de la receta: va DESPUÉS de
-- base/20261022d_el_equipo_con_la_clave_de_joan.sql (el 2.4) y antes del
-- «Reload schema». Si lo corres antes del 2.4, para en la primera parte, dice
-- «Primero corre el 2.4» y no toca nada.
-- CÓRRELO DE NOCHE (después de las 9 p. m.): crea índices, y mientras se
-- construyen (son segundos, una sola vez) nadie puede terminar su registro en
-- play/.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada.
-- Al final sale UNA TABLA: 10 filas que tienen que salir en true y, debajo,
-- una fila por gerente activo que dice si ya puede subir gente y, si no, la
-- línea exacta que te falta correr.
--
-- ---------------------------------------------------------------------------
-- QUÉ HACE (lo que pidió Joan el 26-oct: «que william pueda agregar bases en
-- archivo y que también pueda agregar clientes de forma manual y mi rol
-- también… con el nombre y el teléfono u otra información adicional… y que se
-- los podamos asignar a otros del equipo»)
--
--   · Un GERENTE (con la clave de Joan, 22d) agrega prospectos: uno a mano o
--     un archivo en tandas de 200. Entran a public.cartera + public.asignaciones
--     —las MISMAS tablas que lee mi_cartera()—, así que le salen en «Mi base»
--     (o en la de su asesor) sin esperar a Joan.
--   · La información adicional (nota, columnas del archivo, de dónde salió, la
--     autorización y dónde está su prueba) vive APARTE, en public.cartera_info.
--     equipo_publicar hace upsert en cartera y nunca va a saber de esta tabla:
--     ninguna publicación de Joan la puede pisar.
--   · Joan ve lo que subió su equipo desde la nube (no se copia a su
--     navegador), reasigna a cualquiera, y puede borrar a quien lo pida.
--
-- LAS REGLAS, y por qué (Ley 1581 de habeas data y Ley 2300; la responsable
-- de los datos es NEXECO S.A.S.):
--   · Solo entra quien AUTORIZÓ que le escribamos por WhatsApp, y diciendo
--     dónde está la prueba. Sin eso, no entra: guardar su número y repartirlo
--     ya es tratarlo.
--   · Un gerente sin su acuerdo de encargado anotado (equipo_acuerdo_firmado,
--     que solo corres tú desde aquí) no sube a nadie.
--   · Si un celular ya está en Tu Garantía —en cualquier tabla—, la respuesta
--     es «ya existe», sin decir de quién ni dónde, y la fila NO se crea: así
--     no se le abre al gerente el registro, las fotos ni el chat de alguien que
--     no es suyo. «Ya existe» igual le dice qué números conoces: por eso, cada
--     50 «ya existía», el gerente se para hasta que tú los mires y le des paso,
--     y queda guardado cuáles consultó y cuándo.
--   · Topes: 200 por tanda, 300 al día por gerente (cuentan los que entran y
--     los que ya existían), 100 intentos al día y un techo de 3.000 subidos por
--     gerente mientras «Mi base» no se pagine.
--   · Quien pida que lo borren se borra (equipo_suprimir) y su número queda en
--     una lista para que nadie lo vuelva a agregar.
--   · El nombre que llega de play/ se limpia al entrar (un disparador): sin
--     comillas ni símbolos, para que ninguna pantalla lo pueda ejecutar.
--
-- LO QUE NO TOCA: equipo_publicar, equipo_traer, mi_cartera, asignar_a,
-- mi_alcance, ficha_de_mi_base, registro_en_mi_alcance, responsable_de,
-- gerente_registros, gerente_archivos, asesor_enviar ni registrar_abierto. Sus
-- cuerpos vivos llevan parches de otros días; reescribirlos es la manera de
-- perder uno sin que nadie lo note. Todo lo de aquí es NUEVO.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
do $$
begin
  -- 27-oct-2026 — IF anidados y to_regprocedure: un `or` de SQL no garantiza
  -- el orden, y un ::regprocedure de una función que no existe para con el
  -- error crudo de Postgres en vez de con este mensaje.
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null
     or to_regprocedure('public.gerente_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql (el 2.4 de la receta) y ponle la clave a tu equipo. Este archivo va después. No se tocó nada.';
  end if;
  if (select p.prosrc from pg_proc p
       where p.oid = to_regprocedure('public.gerente_de_sesion()')) !~ 'celular_del_equipo_de_sesion' then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql (el 2.4 de la receta). Este archivo va después. No se tocó nada.';
  end if;
  if to_regclass('public.cartera') is null or to_regclass('public.panel_socios') is null
     or to_regclass('public.panel_ajustes') is null or to_regclass('public.registros_asignados') is null
     or to_regclass('public.registro_en_vivo') is null or to_regclass('public.asignaciones_una_por_dia') is null then
    raise exception 'Faltan tablas de antes (equipo en la nube, panel en la nube o el gerente vende). No se tocó nada.';
  end if;
end $$;

-- ====== 1. LAS SEIS TABLAS NUEVAS ======
-- Todas con RLS encendido y CERO políticas: nadie las lee ni las escribe desde
-- afuera. Solo las funciones de abajo, que corren como dueño y ponen sus rejas.

-- La información que no cabe en la cartera, y quién la subió. Va aparte de
-- public.cartera A PROPÓSITO: equipo_publicar hace upsert en cartera y nunca
-- va a saber de esta tabla, así que ninguna publicación de Joan la puede pisar.
create table if not exists public.cartera_info (
  persona_id   text        primary key,             -- = cartera.id
  origen       text        not null default '',     -- «¿De dónde sale?»
  autoriza     boolean,                             -- null = nadie preguntó (bases de Joan)
  canal        text        not null default '',     -- 'whatsapp': el canal que autorizó
  nota         text        not null default '' check (length(nota) <= 300),
  extra        jsonb       not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  subido_por   text        not null,                -- celular del gerente, o 'joan'
  subido_en    timestamptz not null default now(),
  carga_id     bigint,                              -- equipo_cargas.id (null si es de Joan)
  -- Lo del equipo entra SOLO con autorización (D3). La fecha en que el
  -- gerente la marcó es equipo_cargas.cuando.
  constraint cartera_info_del_equipo_completa
    check (subido_por = 'joan' or (origen <> '' and autoriza and canal = 'whatsapp' and carga_id is not null))
);
create index if not exists cartera_info_por_carga on public.cartera_info (carga_id);
create index if not exists cartera_info_por_quien on public.cartera_info (subido_por, subido_en desc);

-- EL RASTRO: cada llamada del gerente, entre o no entre nadie, con los
-- celulares que dieron «ya existe». Es el tope del día, el freno de los 50, lo
-- que Joan ve en «Lo que subió tu equipo» y la prueba de quién consultó qué y
-- cuándo. De solo agregar, como vistas_de_datos.
create table if not exists public.equipo_cargas (
  id              bigint      generated always as identity primary key,
  quien           text        not null,              -- celular del gerente, de la SESIÓN
  cuando          timestamptz not null default now(),
  archivo         text        not null default '',   -- '' = a mano
  origen          text        not null default '',
  autoriza        boolean,                           -- null si no la dijo
  canal           text        not null default 'whatsapp',
  prueba          text        not null default '',   -- «¿Dónde está la prueba?»
  recibidas       integer     not null default 0,
  entraron        integer     not null default 0,
  ya_en_tu_base   integer     not null default 0,
  ya_existen      integer     not null default 0,
  ya_existen_cels text[]      not null default '{}', -- cuáles: la base ya los tiene, y es la prueba
  repetidas       integer     not null default 0,
  invalidas       integer     not null default 0,
  rechazo         text        not null default ''
  -- '' | 'tope' | 'tope_ya_existen' | 'en_revision' | 'techo_base' | 'sin_acuerdo'
  -- | 'tanda_grande' | 'para_no_es_tuyo' | 'solo_con_si' | 'falta_prueba'
  -- | 'falta_origen' | 'falta_autoriza' | 'sin_filas'
);
create index if not exists equipo_cargas_por_quien on public.equipo_cargas (quien, cuando desc);

-- EL FRENO: «frenado» cuando se pasan los 50 «ya existían»; «soltado» cuando
-- Joan revisa. Manda la última fila de cada gerente. De solo agregar.
create table if not exists public.equipo_frenos (
  id        bigint      generated always as identity primary key,
  quien     text        not null,
  cuando    timestamptz not null default now(),
  accion    text        not null check (accion in ('frenado', 'soltado')),
  carga_id  bigint,
  por       text        not null default ''          -- 'sistema' o 'joan'
);
create index if not exists equipo_frenos_por_quien on public.equipo_frenos (quien, cuando desc);

-- EL ACUERDO DE ENCARGADO (D12). Lo escribe SOLO Joan desde el editor, con
-- equipo_acuerdo_firmado(). Sin fila, el gerente no sube a nadie.
create table if not exists public.equipo_acuerdos (
  celular    text        primary key,
  firmado_en date        not null,
  donde      text        not null check (length(btrim(donde)) >= 5),
  anotado_en timestamptz not null default now()
);

-- LOS QUE PIDIERON QUE LOS BORRARAN. El sha256 del celular, no el número: no
-- es un secreto para quien tenga la base entera (son pocos números posibles),
-- por eso esta tabla, como las demás, no la lee nadie de afuera. Es lo mínimo
-- para cumplir «no te volvemos a escribir».
create table if not exists public.no_contactar (
  cel_hash text        primary key,
  desde    timestamptz not null default now(),
  como     text        not null                      -- «por el chat el 3-nov»
);

-- LOS CELULARES DE LOS PROSPECTOS DE JOAN, solo eso. NubeCRM no sube los
-- prospectos (nube-crm.js, CLAVES_QUE_SUBEN), y sin esto el «ya existe» no
-- veía los que Joan todavía no había repartido: le pasaría a William el mismo
-- Excel y entraría todo como nuevo.
create table if not exists public.joan_celulares (
  celular     text        primary key check (celular ~ '^3[0-9]{9}$'),
  actualizado timestamptz not null default now()
);

alter table public.cartera_info    enable row level security;
alter table public.equipo_cargas   enable row level security;
alter table public.equipo_frenos   enable row level security;
alter table public.equipo_acuerdos enable row level security;
alter table public.no_contactar    enable row level security;
alter table public.joan_celulares  enable row level security;
revoke all on table public.cartera_info    from public, anon, authenticated;
revoke all on table public.equipo_cargas   from public, anon, authenticated;
revoke all on table public.equipo_frenos   from public, anon, authenticated;
revoke all on table public.equipo_acuerdos from public, anon, authenticated;
revoke all on table public.no_contactar    from public, anon, authenticated;
revoke all on table public.joan_celulares  from public, anon, authenticated;

-- El rastro y el freno son de solo agregar. Un rastro que se puede borrar no
-- prueba nada, y menos ante la SIC (el mismo patrón de vistas_de_datos).
create or replace function public.equipo_cargas_no_se_cambian()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'el rastro de lo que subió el equipo no se cambia ni se borra';
end
$$;
drop trigger if exists equipo_cargas_solo_agregar on public.equipo_cargas;
create trigger equipo_cargas_solo_agregar
  before update or delete on public.equipo_cargas
  for each row execute function public.equipo_cargas_no_se_cambian();
drop trigger if exists equipo_frenos_solo_agregar on public.equipo_frenos;
create trigger equipo_frenos_solo_agregar
  before update or delete on public.equipo_frenos
  for each row execute function public.equipo_cargas_no_se_cambian();
revoke all on function public.equipo_cargas_no_se_cambian() from public, anon, authenticated;

-- ====== 2. LOS AYUDANTES (nadie de afuera los llama) ======

-- La MISMA regla de BasesTuGarantia.celularDe (app/bases.js): los últimos 10
-- dígitos si hay 10 o más y empiezan por 3; si no, ''.
create or replace function public.celular_de_base(t text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when length(public.solo_digitos(t)) >= 10 and right(public.solo_digitos(t), 10) ~ '^3[0-9]{9}$'
      then right(public.solo_digitos(t), 10)
    else '' end
$$;

-- La lista de letras de nombreDe (app/bases.js) SIN LA COMILLA: todo lo demás
-- se vuelve espacio. Sin cambiar mayúsculas (los de play/ se guardan como los
-- escribió la persona). Un nombre sin comilla ni paréntesis no puede cerrar
-- ninguna cadena en ninguna pantalla.
create or replace function public.nombre_limpio(t text, n integer)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select btrim(left(btrim(regexp_replace(
           regexp_replace(coalesce(t, ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .-]', ' ', 'g'),
           '\s+', ' ', 'g')), greatest(coalesce(n, 0), 0)))
$$;

-- Para el archivo, el origen, la prueba, la nota y los valores de las columnas
-- extra: los caracteres de control se vuelven espacio y se quitan < > " ' `
-- y la barra invertida. Una sola regla para todo texto del equipo (R11).
create or replace function public.texto_del_equipo(t text, n integer)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select btrim(left(btrim(regexp_replace(regexp_replace(
           regexp_replace(coalesce(t, ''), '[[:cntrl:]]', ' ', 'g'),
           '[<>"''`\\]', '', 'g'), '[ ]{2,}', ' ', 'g')), greatest(coalesce(n, 0), 0)))
$$;

-- La información adicional que se puede guardar (R9): solo un objeto de
-- máximo 6 claves; claves de hasta 40 y valores de texto de hasta 120. NO se
-- guardan claves de plata o cobro, documentos, otras personas, claves y
-- bancos, ni datos sensibles (art. 5 de la Ley 1581); ni valores con 7 dígitos
-- seguidos (cédulas y teléfonos de otros), ni los que son solo cifras (montos,
-- fechas de Excel, códigos), ni los que traen palabras de cobro. La MISMA
-- regla vive en panel/agregar-prospectos.js: el CRM ni siquiera las ofrece.
create or replace function public.extra_limpio(p jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  r      record;
  k      text;
  v      text;
  salida jsonb := '{}'::jsonb;
  n      integer := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  for r in select key, value from jsonb_each(p) order by key loop
    exit when n >= 6;
    if jsonb_typeof(r.value) not in ('string', 'number') then continue; end if;
    k := public.texto_del_equipo(r.key, 40);
    v := public.texto_del_equipo(r.value #>> '{}', 120);
    if k = '' or v = '' then continue; end if;
    if k ~* '(saldo|mora|deuda|cuota|inter[eé]s|pr[eé]stamo|monto|valor|capital|cr[eé]dito|cupo|pago|abono|vencim|estado|observaci|gesti[oó]n|resultado|tipific|orden|plataforma|c[eé]dula|documento|identificaci|pasaporte|referencia|codeudor|fiador|c[oó]nyuge|familiar|asesor|cobrador|gestor|vendedor|recomend|referid|clave|contrase|tarjeta|cuenta|banco|salario|ingreso|salud|diagn|enfermedad|discapacid|m[eé]dic|religi|pol[ií]tic|partido|sindica|etni|raza|orientaci|sexual|huella|foto|biom)'
       or k ~* '(^|[^a-záéíóúñ])(eps|nit|app)([^a-záéíóúñ]|$)' then
      continue;
    end if;
    if regexp_replace(v, '[ .-]', '', 'g') ~ '[0-9]{7,}'
       or v ~ '^[0-9.,$ ]{3,}$'
       or v ~* '((^|[^a-záéíóúñ])mora([^a-záéíóúñ]|$)|vencid|pag[oóa]|deud|cobr|saldo|abon|cuota|castig|embarg|promesa|no contesta|\$)' then
      continue;
    end if;
    salida := salida || jsonb_build_object(k, v);
    n := n + 1;
  end loop;
  return salida;
end
$$;

-- El celular de quien pidió que lo borraran, sin guardarlo.
create or replace function public.cel_hash(t text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to('tg-nc:' || coalesce(t, ''), 'UTF8')), 'hex')
$$;

-- R1 · EL ÚNICO LUGAR con la lista de dónde puede existir un celular. La
-- próxima tabla con celulares se agrega AQUÍ y en ningún otro sitio. Todas las
-- causas dan la misma palabra afuera: «ya existe».
create or replace function public.celulares_conocidos(p_cels text[])
returns setof text
language sql
stable
security definer
set search_path = public, auth
as $$
  with c as (select distinct x from unnest(coalesce(p_cels, '{}'::text[])) x where x ~ '^3[0-9]{9}$')
  select distinct k.x from (
    select c.x from c join public.cartera p on right(public.solo_digitos(p.celular), 10) = c.x
    union all
    select c.x from c join public.registros r on right(public.solo_digitos(r.telefono), 10) = c.x
    union all
    select c.x from c join public.registro_archivos a on right(public.solo_digitos(a.celular), 10) = c.x
    union all
    -- Quien se está registrando AHORA todavía no está en registros ni en
    -- auth.users (la cuenta se crea al final): sin esto, subir su número le
    -- abría al gerente lo que va escribiendo.
    select c.x from c join public.registro_en_vivo v on right(public.solo_digitos(v.celular), 10) = c.x and v.vence_en > now()
    union all
    select c.x from c join public.solicitudes s on right(public.solo_digitos(s.celular), 10) = c.x
    union all
    select c.x from c join public.socios_historial h on right(public.solo_digitos(h.celular), 10) = c.x
    union all
    select c.x from c join public.registros_asignados ra on right(public.solo_digitos(ra.telefono), 10) = c.x
    union all
    select c.x from c join public.equipo e on right(public.solo_digitos(e.celular), 10) = c.x
    union all
    -- play/ y PlataChat comparten registro: la cuenta es 57<celular>@tugarantia.net.
    select c.x from c join auth.users u on lower(u.email) = '57' || c.x || '@tugarantia.net'
    union all
    select c.x from c join public.panel_socios ps on not ps.borrado
       and right(public.solo_digitos(ps.datos->>'telefono'), 10) = c.x
    union all
    select c.x from c join public.panel_socios ps on not ps.borrado
       and right(public.solo_digitos(ps.datos->>'telefono2'), 10) = c.x
    union all
    select c.x from c join public.panel_socios ps on not ps.borrado
       and right(public.solo_digitos(ps.datos->>'whatsappNumero'), 10) = c.x
    union all
    select c.x from c
      join public.panel_ajustes pa on pa.clave = 'prospectos' and jsonb_typeof(pa.datos) = 'array'
      cross join lateral jsonb_array_elements(pa.datos) e
     where right(public.solo_digitos(e->>'celular'), 10) = c.x
    union all
    select c.x from c join public.joan_celulares j on j.celular = c.x
    union all
    select c.x from c join public.no_contactar n on n.cel_hash = public.cel_hash(c.x)
  ) k
$$;

-- Los índices que hacen que el «ya existe» BUSQUE en vez de recorrer tablas
-- enteras. Importan sobre todo en panel_socios: su `datos` puede traer las
-- fotos de la cédula, y leer datos->>'telefono' sin índice las descomprimiría
-- todas en cada tanda. Sin `concurrently` porque el editor corre dentro de una
-- transacción: por eso este archivo se corre de noche.
create index if not exists cartera_por_cel10             on public.cartera (right(public.solo_digitos(celular), 10));
create index if not exists registros_por_cel10           on public.registros (right(public.solo_digitos(telefono), 10));
create index if not exists registro_archivos_por_cel10   on public.registro_archivos (right(public.solo_digitos(celular), 10));
create index if not exists solicitudes_por_cel10         on public.solicitudes (right(public.solo_digitos(celular), 10));
create index if not exists socios_historial_por_cel10    on public.socios_historial (right(public.solo_digitos(celular), 10));
create index if not exists registros_asignados_por_tel   on public.registros_asignados (right(public.solo_digitos(telefono), 10));
create index if not exists panel_socios_tel10            on public.panel_socios (right(public.solo_digitos(datos->>'telefono'), 10));
create index if not exists panel_socios_tel2_10          on public.panel_socios (right(public.solo_digitos(datos->>'telefono2'), 10));
create index if not exists panel_socios_wa10             on public.panel_socios (right(public.solo_digitos(datos->>'whatsappNumero'), 10));

-- ====== 3. LOS NOMBRES DE play/ DEJAN DE PODER EJECUTARSE ======
-- El nombre llega tal cual de quien se registra (registrar_abierto solo lo
-- corta a 80). En el CRM ya no viaja dentro de ningún onclick (commit 1 del
-- lote), y además aquí se limpia al entrar, sin la comilla. No se reescribe
-- registrar_abierto: un disparador hace lo mismo sin tocar su cuerpo vivo.
-- 27-oct-2026 — Aquí NO se juntan los espacios ni se recorta (nombre_limpio
-- sí lo hace con lo del gerente): solo se quita lo que podría ejecutarse, y
-- lo demás queda como lo escribió la persona. Juntarlos cambiaba nombres que
-- otras partes comparan tal cual (el chat de 20261019 busca su registro de
-- prueba por el nombre exacto, espacios incluidos).
create or replace function public.registros_nombre_limpio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.nombre := left(regexp_replace(coalesce(new.nombre, ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .-]', ' ', 'g'), 80);
  return new;
end
$$;
revoke all on function public.registros_nombre_limpio() from public, anon, authenticated;
drop trigger if exists registros_nombre_limpio on public.registros;
create trigger registros_nombre_limpio
  before insert or update of nombre on public.registros
  for each row execute function public.registros_nombre_limpio();
-- Y los que ya están guardados con símbolos, una sola vez (el disparador los
-- limpia al pasar por aquí).
update public.registros set nombre = nombre
 where nombre ~ '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .-]';

-- ====== 4. EL TRABAJO DEL GERENTE, con el gerente ya resuelto ======
-- Está separada de gerente_agregar_prospectos para que la prueba de este mismo
-- archivo recorra el camino entero contra la base de verdad y lo deshaga. No
-- tiene permiso para nadie: solo la llaman las funciones de aquí.
create or replace function public.agregar_prospectos_de(p_yo public.equipo, p_lote jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  -- El día es el de Bogotá: en UTC, a las 7 p. m. ya sería «mañana».
  inicio_hoy  timestamptz := (date_trunc('day', now() at time zone 'America/Bogota')) at time zone 'America/Bogota';
  lote        jsonb := coalesce(p_lote, '{}'::jsonb);
  v_archivo   text;
  v_origen    text;
  v_prueba    text;
  v_aut       text;
  v_autoriza  boolean;
  filas       jsonb;
  motivo      text := '';
  destinos    text[];
  mios        text[];
  f           jsonb;
  cel         text;
  para        text;
  cels        text[] := '{}';
  nombres     text[] := '{}';
  notas       text[] := '{}';
  extras      jsonb[] := '{}';
  paras       text[] := '{}';
  recibidas   integer := 0;
  repetidas   integer := 0;
  invalidas   integer := 0;
  tuyos       text[];
  conocidos   text[];
  n_tuyos     integer;
  n_existen   integer;
  n_entran    integer;
  usadas      integer;
  ventana     timestamptz;
  en_ventana  integer;
  subidos     integer;
  llamadas    integer;
  carga       bigint;
  sello       text;
  pid         text;
  k           integer := 0;
  i           integer;
begin
  if p_yo.celular is null then
    return jsonb_build_object('ok', false, 'motivo', 'solo_gerente');
  end if;

  -- 1. Un solo candado para todos los gerentes: dos que suban el mismo celular
  --    a la vez no pueden crear dos filas, y dos tandas del mismo gerente no
  --    se saltan el tope.
  perform pg_advisory_xact_lock(hashtext('gerente_agregar_prospectos'));

  -- 0. Las llamadas del día, CON las rechazadas: pasadas 100 ni siquiera se
  --    escribe rastro. Así ni el rastro ni la tarjeta de Joan se pueden
  --    inflar llamando en un bucle con tandas que no gastan cupo.
  select count(*) into llamadas from public.equipo_cargas
   where quien = p_yo.celular and cuando >= inicio_hoy;
  if llamadas >= 100 then
    return jsonb_build_object('ok', false, 'motivo', 'muchas_llamadas');
  end if;

  v_origen  := public.texto_del_equipo(lote->>'origen', 200);
  v_prueba  := public.texto_del_equipo(lote->>'prueba', 200);
  v_archivo := public.texto_del_equipo(lote->>'archivo', 120);
  v_aut     := lower(btrim(coalesce(lote->>'autoriza', '')));
  v_autoriza := case v_aut when 'si' then true when 'no' then false else null end;
  filas     := case when jsonb_typeof(lote->'filas') = 'array' then lote->'filas' else '[]'::jsonb end;
  recibidas := jsonb_array_length(filas);

  -- 2 a 4. El acuerdo, el freno y el lote, en ese orden.
  if not exists (select 1 from public.equipo_acuerdos a where a.celular = p_yo.celular) then
    motivo := 'sin_acuerdo';
  elsif (select fr.accion from public.equipo_frenos fr where fr.quien = p_yo.celular
          order by fr.cuando desc, fr.id desc limit 1) = 'frenado' then
    motivo := 'en_revision';
  elsif v_origen = '' then
    motivo := 'falta_origen';
  elsif v_aut = 'no' then
    motivo := 'solo_con_si';          -- D3: sin autorización no entra
  elsif v_aut <> 'si' then
    motivo := 'falta_autoriza';
  elsif length(v_prueba) < 5 then
    motivo := 'falta_prueba';
  elsif recibidas = 0 then
    motivo := 'sin_filas';
  elsif recibidas > 200 then
    motivo := 'tanda_grande';
  end if;

  -- 5. A quién se lo puede dejar: a él mismo o a sus asesores ACTIVOS. Un
  --    retirado no recibe gente nueva aunque mi_alcance lo alcance.
  if motivo = '' then
    select coalesce(array_agg(e.celular), '{}') into destinos from public.equipo e
     where e.estado = 'activo'
       and (e.celular = p_yo.celular or (e.rol = 'asesor' and e.jefe = p_yo.celular));
    for f in select value from jsonb_array_elements(filas) loop
      para := right(public.solo_digitos(coalesce(f->>'para', '')), 10);
      if para <> '' and not (para = any(destinos)) then motivo := 'para_no_es_tuyo'; exit; end if;
    end loop;
  end if;

  if motivo <> '' then
    insert into public.equipo_cargas (quien, archivo, origen, autoriza, prueba, recibidas, rechazo)
    values (p_yo.celular, v_archivo, v_origen, v_autoriza, v_prueba, recibidas, motivo);
    return jsonb_build_object('ok', false, 'motivo', motivo);
  end if;

  -- 6. Cada fila, limpia. Los repetidos dentro de la tanda cuentan aparte.
  for f in select value from jsonb_array_elements(filas) loop
    cel := public.celular_de_base(f->>'celular');
    if cel = '' then invalidas := invalidas + 1; continue; end if;
    if cel = any(cels) then repetidas := repetidas + 1; continue; end if;
    para := right(public.solo_digitos(coalesce(f->>'para', '')), 10);
    if para = '' then para := p_yo.celular; end if;
    cels    := cels || cel;
    nombres := nombres || public.nombre_limpio(f->>'nombre', 120);
    notas   := notas || public.texto_del_equipo(f->>'nota', 300);
    extras  := extras || public.extra_limpio(f->'extra');
    paras   := paras || para;
  end loop;

  -- 7. La clasificación. «Ya es tuyo» con la MISMA regla de
  --    registro_en_mi_alcance: primero manda la asignación a mano activa
  --    (registros_asignados); si no la hay, la última asignación entre todas
  --    las filas de cartera con ese celular. La prueba de PostgreSQL compara
  --    las dos formas caso por caso.
  mios := public.mi_alcance(p_yo.celular);
  select coalesce(array_agg(c.x), '{}') into tuyos
    from unnest(cels) c(x)
   where coalesce(
           (select ra.asesor = any(mios) from public.registros_asignados ra
             where ra.telefono = c.x and ra.activo limit 1),
           (select a.asesor = any(mios) from public.cartera p
              join public.asignaciones a on a.persona_id = p.id
             where right(public.solo_digitos(p.celular), 10) = c.x
             order by a.desde desc, a.id desc limit 1),
           false);
  select coalesce(array_agg(x), '{}') into conocidos
    from public.celulares_conocidos(cels) x
   where not (x = any(tuyos));
  n_tuyos   := coalesce(array_length(tuyos, 1), 0);
  n_existen := coalesce(array_length(conocidos, 1), 0);
  n_entran  := coalesce(array_length(cels, 1), 0) - n_tuyos - n_existen;

  -- 8. El techo: «Mi base» baja entera en cada llamada; con más de 3.000 por
  --    gerente hay que paginarla antes.
  select count(*) into subidos from public.cartera_info where subido_por = p_yo.celular;
  if subidos + n_entran > 3000 then
    motivo := 'techo_base';
  end if;

  -- 9. El tope del día: cuentan los que entran y los que ya existían de las
  --    tandas ACEPTADAS. Una rechazada no gasta, y no devuelve cuentas: si
  --    las devolviera, serviría de consulta gratis.
  select coalesce(sum(c.entraron + c.ya_existen), 0) into usadas from public.equipo_cargas c
   where c.quien = p_yo.celular and c.rechazo = '' and c.cuando >= inicio_hoy;
  if motivo = '' and usadas + n_entran + n_existen > 300 then
    motivo := 'tope';
  end if;

  if motivo <> '' then
    insert into public.equipo_cargas (quien, archivo, origen, autoriza, prueba, recibidas, repetidas, invalidas, rechazo)
    values (p_yo.celular, v_archivo, v_origen, true, v_prueba, recibidas, repetidas, invalidas, motivo);
    return jsonb_build_object('ok', false, 'motivo', motivo, 'quedan_hoy', greatest(0, 300 - usadas));
  end if;

  -- 10. EL FRENO DE LOS 50. La ventana empieza en lo más reciente entre el
  --     comienzo del día y la última vez que Joan le dio paso. Si se pasa, la
  --     tanda no entra, se guardan los celulares que se consultaron (aunque no
  --     se respondan) y el gerente queda parado hasta que Joan mire.
  select greatest(inicio_hoy, coalesce(max(fr.cuando), inicio_hoy)) into ventana
    from public.equipo_frenos fr where fr.quien = p_yo.celular and fr.accion = 'soltado';
  select coalesce(sum(c.ya_existen), 0) into en_ventana from public.equipo_cargas c
   where c.quien = p_yo.celular and c.rechazo = '' and c.cuando >= ventana;
  if en_ventana + n_existen > 50 then
    insert into public.equipo_cargas (quien, archivo, origen, autoriza, prueba, recibidas, ya_existen,
                                      ya_existen_cels, repetidas, invalidas, rechazo)
    values (p_yo.celular, v_archivo, v_origen, true, v_prueba, recibidas, n_existen,
            conocidos, repetidas, invalidas, 'tope_ya_existen')
    returning id into carga;
    insert into public.equipo_frenos (quien, accion, carga_id, por)
    values (p_yo.celular, 'frenado', carga, 'sistema');
    return jsonb_build_object('ok', false, 'motivo', 'en_revision');
  end if;

  -- 11. El rastro de la tanda que entra.
  insert into public.equipo_cargas (quien, archivo, origen, autoriza, canal, prueba, recibidas, entraron,
                                    ya_en_tu_base, ya_existen, ya_existen_cels, repetidas, invalidas, rechazo)
  values (p_yo.celular, v_archivo, v_origen, true, 'whatsapp', v_prueba, recibidas, n_entran,
          n_tuyos, n_existen, conocidos, repetidas, invalidas, '')
  returning id into carga;

  -- 12. Cada uno que entra: su fila en cartera (como todo prospecto: no_sms en
  --     null, así que ✉️ y 📞 siguen cerrados), su PRIMERA asignación (con la
  --     misma fecha que usa asignar_a, y como es la primera de una persona
  --     nueva no choca con asignaciones_una_por_dia) y su información.
  --     Los prefijos GP/GA no chocan con nada: Joan escribe P, A y B; asignar_a
  --     escribe G+dígitos; asesor_retirar, RE-; equipo_reasignar, JA.
  sello := to_char(clock_timestamp() at time zone 'America/Bogota', 'YYYYMMDDHH24MISSMS');
  for i in 1 .. coalesce(array_length(cels, 1), 0) loop
    if cels[i] = any(tuyos) or cels[i] = any(conocidos) then continue; end if;
    pid := 'GP' || sello || '-' || carga || '-' || k;
    insert into public.cartera (id, tipo, celular, nombre, estado, etapa, actualizado)
    values (pid, 'prospecto', cels[i], nombres[i], 'nuevo', 'PC', now());
    insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
    values ('GA' || sello || '-' || carga || '-' || k, pid, paras[i], current_date, now());
    insert into public.cartera_info (persona_id, origen, autoriza, canal, nota, extra, subido_por, subido_en, carga_id)
    values (pid, v_origen, true, 'whatsapp', notas[i], extras[i], p_yo.celular, now(), carga);
    k := k + 1;
  end loop;

  -- 13. Sin ids, sin nombres y sin decir dónde existe un número ni de quién es.
  return jsonb_build_object('ok', true, 'carga', carga, 'entraron', n_entran,
    'ya_en_tu_base', n_tuyos, 'ya_existen', n_existen, 'repetidas', repetidas,
    'invalidas', invalidas, 'quedan_hoy', greatest(0, 300 - usadas - n_entran - n_existen));
end
$$;

-- ====== 5. LO QUE LLAMA EL GERENTE (con su sesión y la clave de Joan) ======

-- Antes de pintar el formulario: ¿puede subir hoy?, ¿cuánto le queda?, ¿a
-- quién se lo puede dejar? Así la pantalla no le pide llenar algo que no va a
-- servir.
create or replace function public.gerente_carga_cupo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo         public.equipo;
  inicio_hoy timestamptz := (date_trunc('day', now() at time zone 'America/Bogota')) at time zone 'America/Bogota';
  usadas     integer;
  llamadas   integer;
  subidos    integer;
  motivo     text := '';
begin
  yo := public.gerente_de_sesion();   -- null si no es gerente activo O le falta la clave de Joan
  if yo.celular is null then return jsonb_build_object('ok', false); end if;
  select coalesce(sum(c.entraron + c.ya_existen), 0) into usadas from public.equipo_cargas c
   where c.quien = yo.celular and c.rechazo = '' and c.cuando >= inicio_hoy;
  select count(*) into llamadas from public.equipo_cargas c
   where c.quien = yo.celular and c.cuando >= inicio_hoy;
  select count(*) into subidos from public.cartera_info where subido_por = yo.celular;
  if not exists (select 1 from public.equipo_acuerdos a where a.celular = yo.celular) then
    motivo := 'sin_acuerdo';
  elsif (select fr.accion from public.equipo_frenos fr where fr.quien = yo.celular
          order by fr.cuando desc, fr.id desc limit 1) = 'frenado' then
    motivo := 'en_revision';
  elsif subidos >= 3000 then
    motivo := 'techo_base';
  elsif llamadas >= 100 then
    motivo := 'muchas_llamadas';
  end if;
  return jsonb_build_object(
    'ok', true, 'puede', motivo = '', 'motivo', motivo,
    'tope_dia', 300, 'tope_tanda', 200, 'tope_ya_existen', 50, 'techo_base', 3000,
    'usadas_hoy', usadas, 'quedan_hoy', greatest(0, 300 - usadas), 'subidos', subidos,
    'destinos', coalesce((
      select jsonb_agg(jsonb_build_object('celular', e.celular, 'nombre', e.nombre)
                       || case when e.celular = yo.celular then '{"yo": true}'::jsonb else '{}'::jsonb end
                       order by (e.celular <> yo.celular), e.nombre)
        from public.equipo e
       where e.estado = 'activo'
         and (e.celular = yo.celular or (e.rol = 'asesor' and e.jefe = yo.celular))), '[]'::jsonb),
    'ultimas', coalesce((
      select jsonb_agg(jsonb_build_object('cuando', u.cuando, 'archivo', u.archivo,
                                          'entraron', u.entraron, 'ya_existen', u.ya_existen) order by u.cuando desc)
        from (select c.cuando, c.archivo, c.entraron, c.ya_existen from public.equipo_cargas c
               where c.quien = yo.celular and c.rechazo = '' order by c.cuando desc, c.id desc limit 5) u), '[]'::jsonb));
end
$$;

-- Agregar: uno a mano o una tanda de un archivo. El rol sale de la SESIÓN
-- (gerente_de_sesion, que después de 22d exige la clave de Joan); ningún
-- parámetro dice quién es el gerente.
create or replace function public.gerente_agregar_prospectos(p_lote jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare yo public.equipo;
begin
  yo := public.gerente_de_sesion();
  if yo.celular is null then return jsonb_build_object('ok', false, 'motivo', 'solo_gerente'); end if;
  return public.agregar_prospectos_de(yo, p_lote);
end
$$;

-- La información adicional de SU gente (gerente o asesor). Es una función
-- COMPAÑERA de mi_cartera, no un cambio a mi_cartera: el cuerpo vivo de esa
-- lleva parches de 22m, 22n, 22p y 22d. Mismo alcance: las personas cuya
-- asignación VIGENTE es de alguien de su alcance.
create or replace function public.mi_cartera_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cel  text;
  yo   public.equipo;
  mios text[];
begin
  cel := public.celular_del_equipo_de_sesion();   -- con la clave de Joan
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = right(cel, 10) and estado = 'activo';
  if not found then return jsonb_build_object('ok', false); end if;
  mios := public.mi_alcance(yo.celular);
  return jsonb_build_object('ok', true, 'info', coalesce((
    select jsonb_object_agg(ci.persona_id, jsonb_build_object(
             'nota', ci.nota, 'extra', ci.extra, 'origen', ci.origen,
             'autoriza', ci.autoriza, 'canal', ci.canal,
             'prueba', coalesce(ec.prueba, ''),
             'subido_por', case when ci.subido_por = 'joan' then 'Joan' else coalesce(es.nombre, 'alguien del equipo') end,
             'subido_en', ci.subido_en))
      from public.cartera_info ci
      join lateral (select a.asesor from public.asignaciones a where a.persona_id = ci.persona_id
                     order by a.desde desc, a.id desc limit 1) va on true
      left join public.equipo_cargas ec on ec.id = ci.carga_id
      left join public.equipo es on es.celular = ci.subido_por
     where va.asesor = any(mios)), '{}'::jsonb));
end
$$;

-- ====== 6. LO QUE LLAMA JOAN (con su clave; volátiles, como equipo_traer:
-- clave_ok ESCRIBE el freno contra la fuerza bruta, y una «stable» revienta) ======

-- La tarjeta «⤒ Lo que subió tu equipo». Sin el mapa de celulares (crecía
-- ~30.000 por gerente al mes y se bajaba entero cada vez): para eso está
-- equipo_tiene, por celulares concretos.
create or replace function public.equipo_agregados(p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return jsonb_build_object(
    'cargas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.cuando desc) from (
        -- Las aceptadas de los últimos 60 días: un archivo de varias tandas
        -- es UNA fila, y lo de a mano se junta por persona y por día.
        -- «Se registraron» y «sin gestión antes» son la huella de quien sube
        -- números para quedarse con el que se registre solo (riesgo 1).
        select a.*,
               (select count(*)::int from public.cartera_info ci join public.cartera p on p.id = ci.persona_id
                 cross join lateral (select min(r.creado_en) as primero from public.registros r
                                      where right(public.solo_digitos(r.telefono), 10) = right(public.solo_digitos(p.celular), 10)) rc
                 where ci.carga_id = any(a.ids) and rc.primero is not null) as registrados,
               (select count(*)::int from public.cartera_info ci join public.cartera p on p.id = ci.persona_id
                 cross join lateral (select min(r.creado_en) as primero from public.registros r
                                      where right(public.solo_digitos(r.telefono), 10) = right(public.solo_digitos(p.celular), 10)) rc
                 where ci.carga_id = any(a.ids) and rc.primero is not null
                   and not exists (select 1 from public.gestiones g where g.persona_id = p.id and g.cuando < rc.primero)) as registrados_sin_gestion_previa
          from (
            select min(c.id) as id, array_agg(c.id order by c.id) as ids, c.quien,
                   coalesce(max(e.nombre), c.quien) as quien_nombre, max(c.cuando) as cuando,
                   c.archivo, (array_agg(c.origen order by c.id desc))[1] as origen,
                   (array_agg(c.prueba order by c.id desc))[1] as prueba,
                   sum(c.recibidas)::int as recibidas, sum(c.entraron)::int as entraron,
                   sum(c.ya_en_tu_base)::int as ya_en_tu_base, sum(c.ya_existen)::int as ya_existen,
                   sum(c.repetidas)::int as repetidas, sum(c.invalidas)::int as invalidas,
                   count(*)::int as tandas, ''::text as rechazo
              from public.equipo_cargas c
              left join public.equipo e on e.celular = c.quien
             where c.rechazo = '' and c.cuando >= now() - interval '60 days'
             group by c.quien, (c.cuando at time zone 'America/Bogota')::date, c.archivo
             order by max(c.cuando) desc
             limit 200) a
        union all
        -- Las rechazadas, en gris: solo las últimas 20.
        select r.*, 0, 0 from (
          select c.id, array[c.id], c.quien, coalesce(e.nombre, c.quien), c.cuando, c.archivo, c.origen, c.prueba,
                 c.recibidas, 0, 0, 0, c.repetidas, c.invalidas, 1, c.rechazo
            from public.equipo_cargas c
            left join public.equipo e on e.celular = c.quien
           where c.rechazo <> ''
           order by c.cuando desc, c.id desc
           limit 20) r
      ) x), '[]'::jsonb),
    -- Quién está parado: la última fila de su freno dice «frenado».
    'frenados', coalesce((
      select jsonb_agg(jsonb_build_object('quien', u.quien, 'quien_nombre', coalesce(e.nombre, u.quien),
               'desde', u.cuando, 'carga', u.carga_id,
               'ya_existen', (select coalesce(sum(c.ya_existen), 0)::int from public.equipo_cargas c
                               where c.quien = u.quien
                                 and c.cuando <= u.cuando
                                 and c.cuando >= greatest(
                                       (date_trunc('day', u.cuando at time zone 'America/Bogota')) at time zone 'America/Bogota',
                                       coalesce((select max(s.cuando) from public.equipo_frenos s
                                                  where s.quien = u.quien and s.accion = 'soltado' and s.cuando <= u.cuando),
                                                '-infinity'::timestamptz))
                                 and (c.rechazo = '' or c.id = u.carga_id))))
        from (select distinct on (fr.quien) fr.quien, fr.accion, fr.cuando, fr.carga_id
                from public.equipo_frenos fr order by fr.quien, fr.cuando desc, fr.id desc) u
        left join public.equipo e on e.celular = u.quien
       where u.accion = 'frenado'), '[]'::jsonb),
    -- Cuánto lleva cada gerente contra el techo: avisa el día que hay que
    -- paginar «Mi base», en vez de esperar a que alguien se acuerde.
    'por_gerente', coalesce((
      select jsonb_agg(jsonb_build_object('quien', e.celular, 'quien_nombre', e.nombre,
               'subidos', (select count(*)::int from public.cartera_info ci where ci.subido_por = e.celular),
               'techo', 3000) order by e.nombre)
        from public.equipo e
       where e.rol = 'gerente'
         and (e.estado = 'activo' or exists (select 1 from public.cartera_info ci where ci.subido_por = e.celular))), '[]'::jsonb));
end
$$;

-- La gente de una o varias cargas, de 200 en 200, con quién la trabaja y su
-- última gestión: es lo que Joan necesita para reasignar sin traérsela.
create or replace function public.equipo_agregados_de(p_clave text, p_cargas bigint[], p_desde integer default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return jsonb_build_object(
    'total', (select count(*)::int from public.cartera_info ci where ci.carga_id = any(coalesce(p_cargas, '{}'))),
    'gente', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'nombre', x.nombre, 'celular', x.celular, 'estado', x.estado, 'etapa', x.etapa,
               'nota', x.nota, 'extra', x.extra, 'origen', x.origen, 'prueba', x.prueba, 'autoriza', x.autoriza,
               'subido_por_nombre', x.subido_por_nombre, 'subido_en', x.subido_en,
               'asesor', x.asesor, 'asesor_nombre', x.asesor_nombre, 'gestion', x.gestion)
             order by x.subido_en, x.id)
        from (
          select p.id, p.nombre, p.celular, p.estado, p.etapa, ci.nota, ci.extra, ci.origen,
                 coalesce(ec.prueba, '') as prueba, ci.autoriza, ci.subido_en,
                 coalesce(es.nombre, ci.subido_por) as subido_por_nombre,
                 coalesce(va.asesor, '') as asesor, coalesce(ea.nombre, '') as asesor_nombre,
                 (select jsonb_build_object('tipo', g.tipo, 'nota', g.nota, 'cuando', g.cuando,
                                            'quien', coalesce(eg.nombre, g.asesor))
                    from public.gestiones g left join public.equipo eg on eg.celular = g.asesor
                   where g.persona_id = p.id order by g.cuando desc limit 1) as gestion
            from public.cartera_info ci
            join public.cartera p on p.id = ci.persona_id
            left join public.equipo_cargas ec on ec.id = ci.carga_id
            left join public.equipo es on es.celular = ci.subido_por
            left join lateral (select a.asesor from public.asignaciones a where a.persona_id = p.id
                                order by a.desde desc, a.id desc limit 1) va on true
            left join public.equipo ea on ea.celular = va.asesor
           where ci.carga_id = any(coalesce(p_cargas, '{}'))
           order by ci.subido_en, p.id
          offset greatest(coalesce(p_desde, 0), 0) limit 200) x), '[]'::jsonb));
end
$$;

-- Cuáles «ya existían» en una carga, y dónde. Joan es el administrador y puede
-- verlo todo: es lo que necesita para decidir si le da paso al gerente.
create or replace function public.equipo_ya_existian(p_clave text, p_carga bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('celular', c.x, 'donde',
      case
        when exists (select 1 from public.no_contactar n where n.cel_hash = public.cel_hash(c.x)) then 'pidió que lo borraran'
        when exists (select 1 from public.panel_socios ps where not ps.borrado and c.x in (
                       right(public.solo_digitos(ps.datos->>'telefono'), 10),
                       right(public.solo_digitos(ps.datos->>'telefono2'), 10),
                       right(public.solo_digitos(ps.datos->>'whatsappNumero'), 10)))
          or exists (select 1 from public.cartera p where right(public.solo_digitos(p.celular), 10) = c.x and p.tipo = 'cliente')
          or exists (select 1 from public.socios_historial h where right(public.solo_digitos(h.celular), 10) = c.x) then 'cliente'
        when exists (select 1 from public.equipo e where e.celular = c.x) then 'del equipo'
        when coalesce(b.nombre, '') <> '' then 'base de ' || b.nombre
        when exists (select 1 from public.joan_celulares j where j.celular = c.x)
          or exists (select 1 from public.cartera p where right(public.solo_digitos(p.celular), 10) = c.x)
          or exists (select 1 from public.panel_ajustes pa cross join lateral jsonb_array_elements(
                       case when jsonb_typeof(pa.datos) = 'array' then pa.datos else '[]'::jsonb end) e
                      where pa.clave = 'prospectos' and right(public.solo_digitos(e->>'celular'), 10) = c.x) then 'prospecto tuyo'
        when exists (select 1 from public.registro_en_vivo v where v.celular = c.x and v.vence_en > now()) then 'registrándose ahora'
        else 'registro en la app'
      end) order by c.x)
      from public.equipo_cargas ca
      cross join lateral unnest(ca.ya_existen_cels) c(x)
      -- De quién es hoy en el equipo: la ÚLTIMA asignación de cualquier fila
      -- de cartera con ese celular ('' si la soltaron).
      left join lateral (select ea.nombre
                           from public.cartera p join public.asignaciones a on a.persona_id = p.id
                           left join public.equipo ea on ea.celular = a.asesor
                          where right(public.solo_digitos(p.celular), 10) = c.x
                          order by a.desde desc, a.id desc limit 1) b on true
     where ca.id = p_carga), '[]'::jsonb);
end
$$;

-- «Ya lo revisé: que siga». La ventana de los 50 vuelve a empezar.
create or replace function public.equipo_soltar(p_clave text, p_quien text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare q text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  q := right(public.solo_digitos(coalesce(p_quien, '')), 10);
  -- Solo se suelta a quien está parado: un «soltado» de más reiniciaría la
  -- ventana de los 50 sin que nadie hubiera mirado nada.
  if coalesce((select fr.accion from public.equipo_frenos fr where fr.quien = q
                order by fr.cuando desc, fr.id desc limit 1), '') <> 'frenado' then
    return jsonb_build_object('ok', true, 'ya_estaba_suelto', true);
  end if;
  insert into public.equipo_frenos (quien, accion, por) values (q, 'soltado', 'joan');
  return jsonb_build_object('ok', true);
end
$$;

-- ¿Estos celulares ya los subió el equipo, o pidieron que los borraran? Lo
-- pregunta el CRM de Joan EN EL MOMENTO (al agregar uno, al cargar una base,
-- al repartir y al publicar), no con una lista vieja. Solo responde por lo del
-- equipo y por no_contactar.
create or replace function public.equipo_tiene(p_clave text, p_cels text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if coalesce(array_length(p_cels, 1), 0) > 2000 then
    raise exception 'equipo_tiene: hasta 2.000 celulares por llamada';
  end if;
  return coalesce((
    select jsonb_object_agg(z.x, z.v) from (
      select c.x,
        case when exists (select 1 from public.no_contactar n where n.cel_hash = public.cel_hash(c.x))
          then jsonb_build_object('no_contactar', true,
                 'desde', (select n.desde from public.no_contactar n where n.cel_hash = public.cel_hash(c.x)))
          else (select jsonb_build_object(
                   'id', p.id,
                   'subido_por_nombre', coalesce(es.nombre, ci.subido_por),
                   'subido_en', ci.subido_en,
                   'lo_trabaja_nombre', coalesce((select ea.nombre from public.asignaciones a
                                                   join public.equipo ea on ea.celular = a.asesor
                                                  where a.persona_id = p.id
                                                  order by a.desde desc, a.id desc limit 1), ''),
                   'gestion_antes_del_registro', (
                     select case when rc.primero is null then null
                                 else exists (select 1 from public.gestiones g
                                               where g.persona_id = p.id and g.cuando < rc.primero) end
                       from (select min(r.creado_en) as primero from public.registros r
                              where right(public.solo_digitos(r.telefono), 10) = c.x) rc))
                  from public.cartera p
                  join public.cartera_info ci on ci.persona_id = p.id and ci.subido_por <> 'joan'
                  left join public.equipo es on es.celular = ci.subido_por
                 where right(public.solo_digitos(p.celular), 10) = c.x
                 order by ci.subido_en desc limit 1)
        end as v
      from (select distinct public.celular_de_base(y) as x from unnest(coalesce(p_cels, '{}'::text[])) y) c
     where c.x <> '') z
    where z.v is not null), '{}'::jsonb);
end
$$;

-- Joan reasigna lo que subió el equipo a CUALQUIERA del equipo activo, o a
-- nadie ('' = soltarlo: nadie lo trabaja y nadie ve su registro). Solo mueve
-- gente del equipo: lo de Joan se reparte desde su CRM, como siempre (dos
-- caminos para lo mismo terminan pisándose). Una fila por persona y día.
create or replace function public.equipo_reasignar(p_clave text, p_personas jsonb, p_asesor text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  destino text;
  it      jsonb;
  pid     text;
  sello   text;
  n       integer := 0;
  fuera   integer := 0;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  destino := right(public.solo_digitos(coalesce(p_asesor, '')), 10);
  if destino <> '' and not exists (select 1 from public.equipo e where e.celular = destino and e.estado = 'activo') then
    return jsonb_build_object('ok', false, 'motivo', 'destino_no_sirve');
  end if;
  sello := 'JA' || to_char(clock_timestamp() at time zone 'America/Bogota', 'YYYYMMDDHH24MISSMS');
  for it in select value from jsonb_array_elements(case when jsonb_typeof(p_personas) = 'array' then p_personas else '[]'::jsonb end) loop
    pid := it #>> '{}';
    if pid is null or not exists (select 1 from public.cartera_info ci
                                   where ci.persona_id = pid and ci.subido_por <> 'joan') then
      fuera := fuera + 1; continue;
    end if;
    insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
    values (sello || '-' || n, pid, destino, current_date, now())
    on conflict (persona_id, desde) do update set asesor = excluded.asesor, actualizado = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'movidos', n, 'no_son_del_equipo', fuera);
end
$$;

-- La información de los prospectos de Joan viaja a quien los trabaja: su nota,
-- sus columnas extra, el origen y si autorizó. Solo se escribe AL CREAR (do
-- nothing): nunca pisa lo que escribió el gerente.
create or replace function public.equipo_publicar_info(p_clave text, p_info jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  it        jsonb;
  pid       text;
  guardadas integer := 0;
  ya        integer := 0;
  sin_fila  integer := 0;
  filas     integer;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if jsonb_typeof(p_info) <> 'array' or jsonb_array_length(p_info) > 1000 then
    raise exception 'equipo_publicar_info: una lista de hasta 1.000';
  end if;
  for it in select value from jsonb_array_elements(p_info) loop
    pid := it->>'id';
    if pid is null or not exists (select 1 from public.cartera p where p.id = pid) then
      sin_fila := sin_fila + 1; continue;
    end if;
    insert into public.cartera_info (persona_id, origen, autoriza, canal, nota, extra, subido_por, subido_en, carga_id)
    values (pid, public.texto_del_equipo(it->>'origen', 200),
            case when jsonb_typeof(it->'autoriza') = 'boolean' then (it->>'autoriza')::boolean else null end,
            '', public.texto_del_equipo(it->>'nota', 300), public.extra_limpio(it->'extra'), 'joan', now(), null)
    on conflict (persona_id) do nothing;
    get diagnostics filas = row_count;
    if filas > 0 then guardadas := guardadas + 1; else ya := ya + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'guardadas', guardadas, 'ya_tenian', ya, 'sin_fila', sin_fila);
end
$$;

-- Los celulares de TODOS los prospectos de Joan, para que el «ya existe» los
-- vea aunque Joan no los haya repartido. Solo el número.
create or replace function public.equipo_publicar_celulares(p_clave text, p_cels jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  guardados integer := 0;
  saltados  integer := 0;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if jsonb_typeof(p_cels) <> 'array' or jsonb_array_length(p_cels) > 5000 then
    raise exception 'equipo_publicar_celulares: una lista de hasta 5.000';
  end if;
  with c as (
    select distinct public.celular_de_base(e #>> '{}') as x from jsonb_array_elements(p_cels) e
  ), buenos as (
    select x from c where x <> ''
      and not exists (select 1 from public.no_contactar n where n.cel_hash = public.cel_hash(c.x))
  ), puestos as (
    insert into public.joan_celulares (celular, actualizado)
    select x, now() from buenos
    on conflict (celular) do update set actualizado = now()
    returning 1
  )
  select (select count(*) from puestos), (select count(*) from c) - (select count(*) from puestos)
    into guardados, saltados;
  return jsonb_build_object('ok', true, 'guardados', guardados, 'saltados', saltados);
end
$$;

-- R12 · BORRAR A QUIEN LO PIDE (Ley 1581: 15 días hábiles). Es el ÚNICO
-- borrado de este lote, y rompe a propósito «las asignaciones solo suman»:
-- lo exige la ley. Si es cliente, lo que la ley obliga a guardar (créditos y
-- pagos) no se toca: solo se anota para que nadie lo vuelva a agregar.
create or replace function public.equipo_suprimir(p_clave text, p_celular text, p_como text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cel        text;
  como       text;
  ids        text[];
  del_equipo integer;
  de_joan    integer;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  cel := public.celular_de_base(p_celular);
  if cel = '' then return jsonb_build_object('ok', false, 'motivo', 'celular_invalido'); end if;
  como := public.texto_del_equipo(p_como, 200);
  if length(como) < 5 then return jsonb_build_object('ok', false, 'motivo', 'falta_como'); end if;

  insert into public.no_contactar (cel_hash, desde, como) values (public.cel_hash(cel), now(), como)
  on conflict (cel_hash) do nothing;

  if exists (select 1 from public.panel_socios ps where not ps.borrado and cel in (
               right(public.solo_digitos(ps.datos->>'telefono'), 10),
               right(public.solo_digitos(ps.datos->>'telefono2'), 10),
               right(public.solo_digitos(ps.datos->>'whatsappNumero'), 10)))
     or exists (select 1 from public.cartera p where right(public.solo_digitos(p.celular), 10) = cel and p.tipo <> 'prospecto')
     or exists (select 1 from public.socios_historial h where right(public.solo_digitos(h.celular), 10) = cel) then
    return jsonb_build_object('ok', true, 'es_cliente', true);
  end if;

  select coalesce(array_agg(p.id), '{}') into ids from public.cartera p
   where right(public.solo_digitos(p.celular), 10) = cel and p.tipo = 'prospecto';
  select count(*) into del_equipo from public.cartera_info ci where ci.persona_id = any(ids) and ci.subido_por <> 'joan';
  de_joan := coalesce(array_length(ids, 1), 0) - del_equipo;

  delete from public.gestiones    where persona_id = any(ids);
  delete from public.contactos    where persona_id = any(ids);
  delete from public.agenda       where persona_id = any(ids);
  delete from public.asignaciones where persona_id = any(ids);
  delete from public.cartera_info where persona_id = any(ids);
  delete from public.cartera      where id = any(ids);
  delete from public.joan_celulares where celular = cel;
  return jsonb_build_object('ok', true, 'es_cliente', false, 'del_equipo', del_equipo, 'de_joan', de_joan);
end
$$;

-- R10 · EL ACUERDO DE ENCARGADO. Solo desde el editor (como equipo_poner_clave):
--   select public.equipo_acuerdo_firmado('<celular>', '2026-10-28', '<dónde guardas el firmado>');
create or replace function public.equipo_acuerdo_firmado(p_celular text, p_fecha date, p_donde text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; fila public.equipo_acuerdos;
begin
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if not exists (select 1 from public.equipo e where e.celular = cel and e.rol = 'gerente') then
    raise exception 'Ese celular no es de ningún gerente de tu equipo. No se anotó nada.';
  end if;
  if p_fecha is null or length(btrim(coalesce(p_donde, ''))) < 5 then
    raise exception 'Falta la fecha de la firma o dónde guardas el acuerdo firmado (mínimo 5 letras). No se anotó nada.';
  end if;
  insert into public.equipo_acuerdos (celular, firmado_en, donde, anotado_en)
  values (cel, p_fecha, btrim(p_donde), now())
  on conflict (celular) do update set firmado_en = excluded.firmado_en, donde = excluded.donde, anotado_en = now()
  returning * into fila;
  return to_jsonb(fila);
end
$$;

-- ====== 7. LOS PERMISOS ======
-- `create or replace` NO quita el EXECUTE que PostgreSQL (y Supabase, con sus
-- privilegios por defecto) le da a todos: se revoca a mano y se concede lo
-- justo.
revoke all on function public.celular_de_base(text)                            from public, anon, authenticated;
revoke all on function public.nombre_limpio(text, integer)                     from public, anon, authenticated;
revoke all on function public.texto_del_equipo(text, integer)                  from public, anon, authenticated;
revoke all on function public.extra_limpio(jsonb)                              from public, anon, authenticated;
revoke all on function public.cel_hash(text)                                   from public, anon, authenticated;
revoke all on function public.celulares_conocidos(text[])                      from public, anon, authenticated;
revoke all on function public.agregar_prospectos_de(public.equipo, jsonb)      from public, anon, authenticated;
revoke all on function public.equipo_acuerdo_firmado(text, date, text)         from public, anon, authenticated;
revoke all on function public.gerente_carga_cupo()                             from public, anon, authenticated;
revoke all on function public.gerente_agregar_prospectos(jsonb)                from public, anon, authenticated;
revoke all on function public.mi_cartera_info()                                from public, anon, authenticated;
grant  execute on function public.gerente_carga_cupo()                         to authenticated;
grant  execute on function public.gerente_agregar_prospectos(jsonb)            to authenticated;
grant  execute on function public.mi_cartera_info()                            to authenticated;
revoke all on function public.equipo_agregados(text)                           from public, anon, authenticated;
revoke all on function public.equipo_agregados_de(text, bigint[], integer)     from public, anon, authenticated;
revoke all on function public.equipo_ya_existian(text, bigint)                 from public, anon, authenticated;
revoke all on function public.equipo_soltar(text, text)                        from public, anon, authenticated;
revoke all on function public.equipo_tiene(text, text[])                       from public, anon, authenticated;
revoke all on function public.equipo_reasignar(text, jsonb, text)              from public, anon, authenticated;
revoke all on function public.equipo_publicar_info(text, jsonb)                from public, anon, authenticated;
revoke all on function public.equipo_publicar_celulares(text, jsonb)           from public, anon, authenticated;
revoke all on function public.equipo_suprimir(text, text, text)                from public, anon, authenticated;
grant  execute on function public.equipo_agregados(text)                       to anon;   -- Joan, con su clave
grant  execute on function public.equipo_agregados_de(text, bigint[], integer) to anon;
grant  execute on function public.equipo_ya_existian(text, bigint)             to anon;
grant  execute on function public.equipo_soltar(text, text)                    to anon;
grant  execute on function public.equipo_tiene(text, text[])                   to anon;
grant  execute on function public.equipo_reasignar(text, jsonb, text)          to anon;
grant  execute on function public.equipo_publicar_info(text, jsonb)            to anon;
grant  execute on function public.equipo_publicar_celulares(text, jsonb)       to anon;
grant  execute on function public.equipo_suprimir(text, text, text)            to anon;

notify pgrst, 'reload schema';

-- ====== 8. LA PRUEBA, LLAMÁNDOLAS ======
-- PL/pgSQL compila cada consulta la primera vez que CORRE: crear la función no
-- prueba nada (la lección de «una migración verde y rota»). Aquí se recorre el
-- camino entero contra la base de verdad con un gerente de mentira, y se
-- deshace TODO con una excepción a propósito. No escribe en auth.users. No usa
-- registros para el «ya existe» (por si algún día tiene disparadores con
-- efectos). Los caminos con sesiones de verdad, en la réplica:
-- pruebas/el-gerente-agrega-postgres.test.js.
do $prueba$
declare
  r      jsonb;
  falso  public.equipo;
  libres text[];
begin
  perform set_config('request.jwt.claims', '', true);
  r := public.gerente_agregar_prospectos('{"filas":[]}'::jsonb);
  if r->>'motivo' is distinct from 'solo_gerente' then
    raise exception 'FALLO: sin sesión, gerente_agregar_prospectos no dijo solo_gerente: %', r;
  end if;
  r := public.gerente_carga_cupo();
  if (r->>'ok')::boolean then raise exception 'FALLO: sin sesión, gerente_carga_cupo dejó pasar.'; end if;

  -- Tres celulares de mentira que no existan en ninguna parte.
  select array_agg(x order by x) into libres from (
    select '3009990' || lpad(g::text, 3, '0') as x from generate_series(271, 290) g
    except select public.celulares_conocidos(array(select '3009990' || lpad(g::text, 3, '0') from generate_series(271, 290) g))
  ) l;
  if coalesce(array_length(libres, 1), 0) < 3 then
    raise notice 'La prueba en vivo se saltó: los celulares de prueba ya existen en la base.';
    return;
  end if;

  begin
    insert into public.equipo (celular, nombre, rol, estado) values (libres[1], 'PRUEBA 27-OCT', 'gerente', 'activo');
    insert into public.equipo_acuerdos (celular, firmado_en, donde) values (libres[1], current_date, 'prueba del archivo');
    select * into falso from public.equipo where celular = libres[1];

    r := public.agregar_prospectos_de(falso, jsonb_build_object('archivo', '', 'origen', 'prueba 27-oct', 'autoriza', 'si',
           'prueba', 'prueba del archivo', 'filas', jsonb_build_array(jsonb_build_object('nombre', 'Prueba Uno', 'celular', libres[2], 'nota', 'nota de prueba'))));
    if (r->>'entraron')::int is distinct from 1 then raise exception 'FALLO: uno nuevo no entró: %', r; end if;
    if r ? 'ids' then raise exception 'FALLO: la respuesta trae ids.'; end if;

    r := public.agregar_prospectos_de(falso, jsonb_build_object('archivo', '', 'origen', 'prueba 27-oct', 'autoriza', 'si',
           'prueba', 'prueba del archivo', 'filas', jsonb_build_array(jsonb_build_object('nombre', 'Prueba Uno', 'celular', libres[2]))));
    if (r->>'ya_en_tu_base')::int is distinct from 1 then raise exception 'FALLO: el mismo otra vez no salió como suyo: %', r; end if;

    insert into public.cartera (id, tipo, celular, nombre) values ('PRUEBA27-X', 'prospecto', libres[3], 'De Otro');
    r := public.agregar_prospectos_de(falso, jsonb_build_object('archivo', '', 'origen', 'prueba 27-oct', 'autoriza', 'si',
           'prueba', 'prueba del archivo', 'filas', jsonb_build_array(jsonb_build_object('nombre', 'Otro', 'celular', libres[3]))));
    if (r->>'ya_existen')::int is distinct from 1 then raise exception 'FALLO: uno ajeno no salió como «ya existe»: %', r; end if;
    if r::text ~ 'De Otro' then raise exception 'FALLO: «ya existe» dijo un nombre.'; end if;

    r := public.agregar_prospectos_de(falso, jsonb_build_object('origen', 'x', 'autoriza', 'no', 'prueba', 'prueba del archivo',
           'filas', jsonb_build_array(jsonb_build_object('celular', libres[3]))));
    if r->>'motivo' is distinct from 'solo_con_si' then raise exception 'FALLO: sin autorización no dijo solo_con_si: %', r; end if;

    if public.nombre_limpio('x'',fetch(''//a''),''', 80) ~ '[''()/]' then
      raise exception 'FALLO: nombre_limpio dejó pasar comillas, paréntesis o barras.';
    end if;
    raise exception 'DESHACER-27OCT';
  exception when others then
    if sqlerrm <> 'DESHACER-27OCT' then raise; end if;
  end;
end
$prueba$;

-- ====== LO QUE JOAN VE: las comprobaciones (todas en true) y, debajo, sus gerentes ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
select 1 as orden, 'va después de 22d: las funciones del equipo ya piden la clave de Joan' as comprobacion,
       (to_regprocedure('public.celular_del_equipo_de_sesion()') is not null
        and (select p.prosrc ~ 'celular_del_equipo_de_sesion' from pg_proc p
              where p.oid = to_regprocedure('public.gerente_de_sesion()'))) as ok,
       '' as que_hacer
union all
select 2, 'las seis tablas nuevas: RLS encendido, sin políticas y sin permisos para anon ni authenticated',
       (select bool_and(c.relrowsecurity
                        and not exists (select 1 from pg_policies pol where pol.schemaname = 'public' and pol.tablename = c.relname)
                        and not has_table_privilege('anon', c.oid, 'select,insert,update,delete')
                        and not has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))
              and count(*) = 6
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('cartera_info', 'equipo_cargas', 'equipo_frenos', 'equipo_acuerdos', 'no_contactar', 'joan_celulares')),
       ''
union all
select 3, 'gerente_carga_cupo, gerente_agregar_prospectos y mi_cartera_info: solo authenticated, nunca anon',
       (select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
          from unnest(array['public.gerente_carga_cupo()'::regprocedure, 'public.gerente_agregar_prospectos(jsonb)'::regprocedure,
                            'public.mi_cartera_info()'::regprocedure]) f),
       ''
union all
select 4, 'las nueve de Joan: solo anon (con tu clave), nunca authenticated',
       (select bool_and(has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute'))
          from unnest(array['public.equipo_agregados(text)'::regprocedure, 'public.equipo_agregados_de(text, bigint[], integer)'::regprocedure,
                            'public.equipo_ya_existian(text, bigint)'::regprocedure, 'public.equipo_soltar(text, text)'::regprocedure,
                            'public.equipo_tiene(text, text[])'::regprocedure, 'public.equipo_reasignar(text, jsonb, text)'::regprocedure,
                            'public.equipo_publicar_info(text, jsonb)'::regprocedure, 'public.equipo_publicar_celulares(text, jsonb)'::regprocedure,
                            'public.equipo_suprimir(text, text, text)'::regprocedure]) f),
       ''
union all
select 5, 'los ayudantes, agregar_prospectos_de y equipo_acuerdo_firmado: nadie de afuera los llama',
       (select bool_and(not has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute'))
          from unnest(array['public.celular_de_base(text)'::regprocedure, 'public.nombre_limpio(text, integer)'::regprocedure,
                            'public.texto_del_equipo(text, integer)'::regprocedure, 'public.extra_limpio(jsonb)'::regprocedure,
                            'public.cel_hash(text)'::regprocedure, 'public.celulares_conocidos(text[])'::regprocedure,
                            'public.agregar_prospectos_de(public.equipo, jsonb)'::regprocedure,
                            'public.equipo_acuerdo_firmado(text, date, text)'::regprocedure]) f),
       ''
union all
select 6, 'ninguna función nueva decide quién eres sin la clave de Joan',
       not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public'
                      and p.proname in ('gerente_carga_cupo', 'gerente_agregar_prospectos', 'mi_cartera_info', 'agregar_prospectos_de')
                      and p.prosrc ~ 'public\.celular_de_sesion\(\)'),
       ''
union all
select 7, 'equipo_publicar no toca cartera_info: ninguna publicación tuya pisa lo del equipo',
       (select bool_and(p.prosrc !~ 'cartera_info') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.proname = 'equipo_publicar'),
       ''
union all
select 8, 'el rastro y el freno son de solo agregar (los dos disparadores existen)',
       (select count(*) = 2 from pg_trigger t
         where not t.tgisinternal
           and t.tgname in ('equipo_cargas_solo_agregar', 'equipo_frenos_solo_agregar')),
       ''
union all
select 9, 'los nombres de registros se limpian al entrar, y ninguno guardado trae símbolos',
       (exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'registros_nombre_limpio'
                  and t.tgrelid = 'public.registros'::regclass)
        and not exists (select 1 from public.registros where nombre ~ '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .-]')),
       ''
union all
select 10, 'la prueba en vivo no dejó nada',
       (not exists (select 1 from public.cartera where id = 'PRUEBA27-X' or nombre = 'Prueba Uno')
        and not exists (select 1 from public.equipo where nombre = 'PRUEBA 27-OCT')
        and not exists (select 1 from public.equipo_acuerdos where donde = 'prueba del archivo')
        and not exists (select 1 from public.equipo_cargas where origen = 'prueba 27-oct')),
       ''
union all
select 20 + row_number() over (order by e.nombre, e.celular),
       'Puede subir gente: ' || e.nombre || ' (gerente, ' || e.celular || ')',
       exists (select 1 from public.equipo_acuerdos a where a.celular = e.celular),
       case when exists (select 1 from public.equipo_acuerdos a where a.celular = e.celular) then ''
            else 'Le falta su acuerdo de encargado firmado. Cuando lo tengas, corre aquí: select public.equipo_acuerdo_firmado(''' || e.celular || ''', ''AAAA-MM-DD'', ''DÓNDE GUARDAS EL FIRMADO''); (con la fecha de la firma)'
       end
  from public.equipo e
 where e.estado = 'activo' and e.rol = 'gerente'
 order by 1;
