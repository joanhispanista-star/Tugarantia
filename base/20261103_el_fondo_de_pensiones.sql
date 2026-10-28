-- ===========================================================================
-- TU FONDO DE PENSIONES: LA HISTORIA LABORAL, OPCIONAL — 28 de octubre de 2026
-- (para publicar desde el martes 3 de noviembre de 2026)
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda no cambia nada. Va DESPUÉS de todo lo
-- de base/ (el último es 20261027_el_gerente_agrega.sql). Al final sale UNA
-- TABLA: cada fila es una comprobación y TODAS tienen que decir true. Después:
-- Settings → API → «Reload schema». Córrelo ANTES de publicar la app que trae
-- el paso: sin esto, lo que el cliente sube se queda en su teléfono (la
-- pantalla lo dice) y no te llega.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras (28-oct-2026)
--
-- «que el cliente autorice la verificación del fondo de pensiones, que aparezca
-- la lista del fondo de pensiones en el que está el cliente y que desde la
-- aplicación lo podamos redirigir a la página del fondo de pensiones y que el
-- cliente pueda descargar el reporte… y que este reporte se agregue
-- automáticamente al registro del cliente». Y después: «que esté la opción
-- para subir el pdf… no quiero que se elimine esta información después de 30
-- días, quiero que yo como dueño tenga acceso a esta información cuando
-- quiera… que el cliente pudiera simplemente enviar un pantallazo… o que
-- simplemente desde la app sea un pegar… y quiero que sea opcional en la
-- mitad del proceso de registro».
--
-- LO QUE ESTO GUARDA, Y POR QUÉ ASÍ
--
--   · public.pension_autorizaciones — UNA fila por celular: la autorización
--     APARTE (la versión del texto que aceptó, la hora que dijo su teléfono y
--     la hora de la base) y en qué fondo dijo que está. Es un dato semiprivado
--     (Corte Constitucional, T-729 de 2002): va con su propia autorización,
--     sin premarcar, y no toca la general (VERSION_AUTORIZACION no sube: a
--     nadie se le vuelve a pedir nada). Si la retira, la fila se queda como
--     constancia de lo que autorizó y cuándo lo retiró, SIN el fondo.
--   · public.pension_archivos — los archivos: el PDF de su historia laboral,
--     o pantallazos (JPG, PNG o WEBP). Hasta 2 PDF (Colpensiones y un fondo
--     privado: desde la reforma de la Ley 2381 de 2024 mucha gente tendrá los
--     dos) y 5 imágenes, de hasta 3 MB cada uno y 12 MB entre todos.
--   · NO SE BORRA A LOS 30 DÍAS (decisión de Joan): se guarda mientras la
--     persona tenga cuenta. Se borra cuando ella la quita desde su cuenta
--     (pension_retirar, pension_quitar), cuando Joan la borra
--     (pension_borrar, que llaman «🧪 Borrar y repetir» y «🚫 Borrar a alguien
--     que lo pidió»), y cuando se borra su cuenta de acceso (el disparador
--     sobre auth.users, por el camino que sea).
--
-- POR QUÉ NO ENTRA EN registro_archivos: su CHECK solo deja imágenes de hasta
-- 600.000 caracteres (20261002c), y archivos_de_registro la trae ENTERA en
-- cada «👁 Ver datos» y en cada «🔎 Revisar a todos»: el PDF de todos viajaría
-- en cada vuelta. Y gerente_archivos (el gerente) lee de ahí: aquí no.
-- Tampoco Supabase Storage: el CRM entra con la llave pública y la clave de
-- Joan, sin sesión, y un bucket privado no le abriría.
--
-- QUIÉN LO VE: SOLO JOAN. Lo leen únicamente pension_resumen, pension_de y
-- pension_archivo, que piden la clave de sincronización (anon + clave), como
-- archivos_de_registro. Ninguna función del equipo lo devuelve: la
-- comprobación 6 lo vigila. El cliente ve lo suyo SIN el contenido
-- (pension_mia: qué subió y cuándo), para quitarlo si quiere.
--
-- LO QUE SE COMPRUEBA EN EL SERVIDOR (el teléfono lo controla quien lo tiene
-- en la mano): el tipo sale de los primeros bytes del archivo, nunca de lo
-- que diga el teléfono (%PDF-, FF D8 FF, la firma del PNG, RIFF…WEBP): un SVG,
-- un HTML o cualquier otra cosa no entra. El tamaño se mira antes de
-- decodificar. Y el freno de siempre: 30 escrituras cada 15 minutos por cuenta.
--
-- Y EL CORTACIRCUITO (28-oct-2026, arreglo, ronda 2). Todos los topes de
-- arriba son POR PERSONA, y un tope por persona protege de UNA persona. El
-- registro está abierto (cualquiera abre cuenta con un celular inventado), y
-- unas 24 cuentas con su tope lleno pasaban los ~280 MB que el reparto deja
-- libres: probado en un PostgreSQL local, 104 archivos de 3 MB y ningún
-- rechazo. Pasados los 500 MB del plan gratis la base ENTERA queda de solo
-- lectura: no se desembolsa, no se registra un pago, no se contesta el chat.
-- Es la regla de la casa para las tablas de archivos (20260922j, 20260922s):
-- tope por persona MÁS cortacircuito con pg_total_relation_size. El reparto
-- de los 500 MB queda así:
--
--   · chat_fotos        150 MB  (20260922j)
--   · fotos_equipo       50 MB  (20260922s)
--   · pension_archivos   50 MB  (este archivo)
--   · registro_en_vivo   20 MB
--   ---------------------------------------------------------------
--   quedan ~230 MB para lo que no se puede parar nunca: los créditos, los
--   pagos y las fichas.
--
-- 50 MB, porque con lo normal (un PDF, o unos pocos pantallazos que el
-- teléfono achica antes de subir) son del orden de cien personas —estimado:
-- todavía no hay muestras reales—, y con el tope de 12 MB lleno, cuatro.
-- Cuando se llena, el cliente lee que ahora no podemos recibirla (es
-- opcional: su cuenta sigue igual), y lo que esperaba en su teléfono sigue en
-- la cola hasta el día siguiente, reintentándose cada vez que entra a su
-- cuenta. Lo arregla Joan: más espacio en Supabase, o borrar lo que ya no
-- sirve; borrar filas no siempre achica la tabla, así que después va
-- `vacuum full public.pension_archivos;`, sola en su propia consulta.
-- Joan se entera en 📥 Registrados: desde el 80 % del tope, una línea lo dice
-- (pension_resumen devuelve lo ocupado; arreglo de los leves, P14).
--
-- LO QUE NO HACE: no lee el PDF, no lo «verifica con el fondo» (ningún fondo
-- tiene cómo: ver la investigación del 28-oct) y no le suma garantía a nadie.
-- Lo mira Joan.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
-- Como todo lo que va después de 20261022d (la regla de
-- pruebas/el-lote-del-27-junto.test.js): si esa no está, se para aquí. Este
-- archivo no la usa —sus funciones son del cliente y de Joan, ninguna del
-- equipo—, pero correrlo antes por error diría que el orden no importa.
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql y base/20261027_el_gerente_agrega.sql. Este archivo va después. No se tocó nada.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.clave_ok(text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null
     or to_regprocedure('public.puede_intentar_tope(text, integer)') is null
     or to_regprocedure('public.anotar_fallo(text)') is null
     or to_regclass('public.intentos_fallidos') is null then
    raise exception 'Falta lo de base/supabase.sql o de 20260911 (celular_de_sesion, clave_ok, el freno). No se tocó nada.';
  end if;
end $$;

-- ====== 1. LAS DOS TABLAS ======
create table if not exists public.pension_autorizaciones (
  celular      text        primary key check (celular ~ '^3[0-9]{9}$'),
  fondos       text[]      not null default '{}',
  version      text        not null,            -- la del texto que aceptó (AAAA-MM-DD)
  momento      text,                            -- la hora que dijo su teléfono: solo informa
  recibida_en  timestamptz not null default now(),   -- la hora de la base: esta es la constancia
  revocada_en  timestamptz,                     -- si la retiró: desde ahí no entra nada
  historial    jsonb       not null default '[]'::jsonb   -- las constancias anteriores, sin el fondo
);
alter table public.pension_autorizaciones enable row level security;
revoke all on table public.pension_autorizaciones from public, anon, authenticated;

create table if not exists public.pension_archivos (
  id         bigint generated always as identity primary key,
  celular    text        not null check (celular ~ '^3[0-9]{9}$'),
  tipo       text        not null check (tipo in ('pdf', 'jpg', 'png', 'webp')),
  datos      bytea       not null,
  bytes      integer     not null check (bytes between 1 and 3145728),
  sha256     text        not null,
  creado_en  timestamptz not null default now(),
  unique (celular, sha256),
  check (octet_length(datos) = bytes)
);
create index if not exists pension_archivos_por_celular on public.pension_archivos (celular);
alter table public.pension_archivos enable row level security;
revoke all on table public.pension_archivos from public, anon, authenticated;
do $$
begin
  execute 'revoke all on sequence public.pension_archivos_id_seq from public, anon, authenticated';
exception when others then
  raise notice 'No encontré la secuencia de pension_archivos (%): las tablas siguen cerradas igual.', sqlerrm;
end $$;

-- ====== 2. LO DEL CLIENTE, CON SU SESIÓN ======

-- 2a. La autorización aparte y en qué fondo dijo que está. La manda el
-- teléfono en cuanto la persona marca la casilla (en la app) o al abrir su
-- cuenta (en el registro). Volver a llamarla cambia el fondo y guarda la
-- constancia anterior en el historial (sin el fondo: minimización).
--
-- 28-oct-2026 (arreglo de los leves, P6) — CAMBIAR DE FONDO NO ES FIRMAR.
-- La tarjeta de la app llamaba aquí con la versión del texto del CÓDIGO cada
-- vez que se marcaba o desmarcaba un fondo, y esto pisaba version, momento y
-- recibida_en: el CRM decía «Autorizó el…» con la hora del último cambio de
-- fondo. Hoy no hace daño (hay una sola versión), pero el día que el texto
-- cambie, cambiar de fondo con la casilla ya marcada anotaría que la persona
-- aceptó un texto que nunca marcó: lo mismo que una casilla premarcada.
-- Ahora, SIN versión (p_version null) no hay firma: solo cambia el fondo de
-- una autorización vigente, y la versión, el momento, la hora de la base y
-- el historial se quedan como estaban. Si no hay autorización vigente,
-- «sin_autorizacion»: cambiar de fondo nunca autoriza, ni vuelve a dar una
-- autorización retirada. Con versión, es la casilla: firma como siempre.
create or replace function public.pension_autorizar(p_fondos text[], p_version text, p_momento text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel  text;
  v    text;
  f    text[];
  afp  integer;
  ant  public.pension_autorizaciones;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  v := nullif(btrim(coalesce(p_version, '')), '');   -- null: solo cambia el fondo (ver arriba)
  if v is not null and v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'motivo', 'version');
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into f
    from unnest(coalesce(p_fondos, '{}'::text[])) x
   where x is not null and x <> '';
  -- La lista de app/fondos-pension.js, y sus reglas: «No sé» y «Nunca he
  -- cotizado» van solos; Colpensiones puede ir con UN fondo privado.
  if exists (select 1 from unnest(f) x
              where x not in ('colpensiones', 'porvenir', 'proteccion', 'colfondos', 'skandia', 'no_se', 'nunca'))
     or cardinality(f) > 2
     or (cardinality(f) > 1 and (f && array['no_se', 'nunca'])) then
    return jsonb_build_object('ok', false, 'motivo', 'fondos');
  end if;
  select count(*) into afp from unnest(f) x where x in ('porvenir', 'proteccion', 'colfondos', 'skandia');
  if afp > 1 then
    return jsonb_build_object('ok', false, 'motivo', 'fondos');
  end if;
  if not public.puede_intentar_tope('hl:' || cel, 30) then
    return jsonb_build_object('ok', false, 'motivo', 'freno');
  end if;
  perform public.anotar_fallo('hl:' || cel);

  select * into ant from public.pension_autorizaciones where celular = cel;
  -- Sin versión: el fondo de una autorización vigente, y nada más.
  if v is null then
    if not found or ant.revocada_en is not null then
      return jsonb_build_object('ok', false, 'motivo', 'sin_autorizacion');
    end if;
    update public.pension_autorizaciones set fondos = f where celular = cel;
    return jsonb_build_object('ok', true, 'fondos', to_jsonb(f), 'version', ant.version);
  end if;
  if found then
    update public.pension_autorizaciones
       set historial = (case when jsonb_array_length(historial) >= 20
                             then historial - 0 else historial end)
                       || jsonb_build_array(jsonb_build_object('version', ant.version, 'momento', ant.momento,
                            'recibida_en', ant.recibida_en, 'revocada_en', ant.revocada_en)),
           fondos = f, version = v, momento = left(p_momento, 40), recibida_en = now(), revocada_en = null
     where celular = cel;
  else
    insert into public.pension_autorizaciones (celular, fondos, version, momento)
    values (cel, f, v, left(p_momento, 40));
  end if;
  return jsonb_build_object('ok', true, 'fondos', to_jsonb(f), 'version', v);
end
$$;

-- 2b. Un archivo. El tipo lo deciden sus primeros bytes, no el teléfono.
create or replace function public.pension_subir(p_archivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel    text;
  b64    text;
  datos  bytea;
  tipo   text;
  h      text;
  n_pdf  integer;
  n_img  integer;
  total  bigint;
  nuevo  bigint;
  ya     bigint;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  -- Sin la autorización aparte (o retirada), no entra nada.
  if not exists (select 1 from public.pension_autorizaciones
                  where celular = cel and revocada_en is null) then
    return jsonb_build_object('ok', false, 'motivo', 'sin_autorizacion');
  end if;
  if not public.puede_intentar_tope('hl:' || cel, 30) then
    return jsonb_build_object('ok', false, 'motivo', 'freno');
  end if;
  perform public.anotar_fallo('hl:' || cel);

  -- El tamaño ANTES de decodificar: 3 MB son 4.194.304 letras en base64.
  if length(coalesce(p_archivo, '')) > 4500000 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_grande');
  end if;
  b64 := regexp_replace(regexp_replace(coalesce(p_archivo, ''), '^data:[A-Za-z0-9/+.-]*;base64,', ''), '\s+', '', 'g');
  if b64 = '' then
    return jsonb_build_object('ok', false, 'motivo', 'vacio');
  end if;
  if length(b64) > 4194304 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_grande');
  end if;
  if b64 !~ '^[A-Za-z0-9+/]+={0,2}$' or length(b64) % 4 <> 0 then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_archivo');
  end if;
  begin
    datos := decode(b64, 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_archivo');
  end;
  if datos is null or octet_length(datos) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'vacio');
  end if;
  if octet_length(datos) > 3145728 then
    return jsonb_build_object('ok', false, 'motivo', 'muy_grande');
  end if;
  tipo := case
    when substring(datos from 1 for 5) = '\x255044462d'::bytea then 'pdf'                -- %PDF-
    when substring(datos from 1 for 3) = '\xffd8ff'::bytea then 'jpg'
    when substring(datos from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'png'
    when substring(datos from 1 for 4) = '\x52494646'::bytea
         and substring(datos from 9 for 4) = '\x57454250'::bytea then 'webp'           -- RIFF….WEBP
    else null end;
  if tipo is null then
    return jsonb_build_object('ok', false, 'motivo', 'tipo_no_permitido');
  end if;
  h := encode(sha256(datos), 'hex');

  -- El mismo archivo dos veces (un reintento con la señal floja) no se duplica.
  select id into ya from public.pension_archivos where celular = cel and sha256 = h;
  if found then
    return jsonb_build_object('ok', true, 'id', ya, 'tipo', tipo, 'bytes', octet_length(datos), 'sha256', h, 'ya_estaba', true);
  end if;

  select count(*) filter (where p.tipo = 'pdf'), count(*) filter (where p.tipo <> 'pdf'), coalesce(sum(p.bytes), 0)
    into n_pdf, n_img, total
    from public.pension_archivos p where p.celular = cel;
  if (tipo = 'pdf' and n_pdf >= 2) or (tipo <> 'pdf' and n_img >= 5) then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados');
  end if;
  if total + octet_length(datos) > 12582912 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_espacio');
  end if;

  -- EL CORTACIRCUITO: el TOTAL, que ningún tope de arriba mira (ver el
  -- encabezado: el reparto de los 500 MB). Va justo antes de escribir y
  -- después de «ya estaba»: un reintento de lo que YA entró no es escritura
  -- nueva, y contestarle «no podemos recibirlo» sería mentirle.
  if pg_total_relation_size('public.pension_archivos') > 50 * 1024 * 1024 then
    return jsonb_build_object('ok', false, 'motivo', 'lleno');
  end if;

  insert into public.pension_archivos (celular, tipo, datos, bytes, sha256)
  values (cel, tipo, datos, octet_length(datos), h)
  returning id into nuevo;
  return jsonb_build_object('ok', true, 'id', nuevo, 'tipo', tipo, 'bytes', octet_length(datos), 'sha256', h);
end
$$;

-- 2c. Lo suyo, SIN el contenido: qué subió y cuándo, y qué autorizó.
create or replace function public.pension_mia()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; a public.pension_autorizaciones;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  select * into a from public.pension_autorizaciones where celular = cel;
  return jsonb_build_object(
    'ok', true,
    'autorizacion', case when a.celular is null then null else jsonb_build_object(
        'fondos', to_jsonb(a.fondos), 'version', a.version, 'recibida_en', a.recibida_en,
        'revocada_en', a.revocada_en) end,
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'bytes', p.bytes,
                                                               'creado_en', p.creado_en) order by p.id)
                            from public.pension_archivos p where p.celular = cel), '[]'::jsonb));
end
$$;

-- 2d. Quitar UNO de los suyos (se equivocó de archivo).
create or replace function public.pension_quitar(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; n integer;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  delete from public.pension_archivos where id = p_id and celular = cel;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'borrados', n);
end
$$;

-- 2e. RETIRAR LA AUTORIZACIÓN (Ley 1581, art. 8 lit. e): se borran TODOS sus
-- archivos y el fondo, y queda la constancia de que la dio y la retiró. Tan
-- fácil como darla: un toque desde su cuenta. Sin freno: retirar no se frena.
create or replace function public.pension_retirar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; n integer;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  delete from public.pension_archivos where celular = cel;
  get diagnostics n = row_count;
  update public.pension_autorizaciones
     set fondos = '{}', revocada_en = coalesce(revocada_en, now())
   where celular = cel;
  return jsonb_build_object('ok', true, 'borrados', n);
end
$$;

-- ====== 3. LO DE JOAN, CON SU CLAVE ======
-- Todas VOLÁTILES a propósito: pasan por clave_ok, que escribe el freno
-- (la lección de archivos_de_registro, 8 al 10 de septiembre).

-- 3a. Quién tiene algo, sin ningún archivo: para pintar «📄 Fondo de
-- pensiones: Ver» en Registrados de un solo viaje.
-- 28-oct-2026 (arreglo de los leves, P14) — Y CUÁNTO ESPACIO VA OCUPADO, con
-- su tope: el del cortacircuito de pension_subir. Cuando saltaba, Joan no se
-- enteraba (el cliente sí: «ahora mismo no podemos recibir más historias
-- laborales»). 📥 Registrados lo dice en una línea desde el 80 %. El tope
-- se escribe aquí y en pension_subir: los dos tienen que decir lo mismo (lo
-- vigila pruebas/el-fondo-de-pensiones-postgres.test.js).
create or replace function public.pension_resumen(p_clave text)
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
  return jsonb_build_object('ok', true,
    'espacio', jsonb_build_object('ocupado', pg_total_relation_size('public.pension_archivos'), 'tope', 50 * 1024 * 1024),
    'personas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'celular', a.celular, 'fondos', to_jsonb(a.fondos), 'version', a.version,
             'autorizada_en', a.recibida_en, 'revocada_en', a.revocada_en,
             'pdf', (select count(*) from public.pension_archivos p where p.celular = a.celular and p.tipo = 'pdf'),
             'imagenes', (select count(*) from public.pension_archivos p where p.celular = a.celular and p.tipo <> 'pdf'),
             'ultimo', (select max(p.creado_en) from public.pension_archivos p where p.celular = a.celular))
           order by a.recibida_en desc)
      from public.pension_autorizaciones a), '[]'::jsonb));
end
$$;

-- 3b. Lo de UNA persona, sin el contenido: la ficha y «👁 Ver datos».
create or replace function public.pension_de(p_clave text, p_celular text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; a public.pension_autorizaciones;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  select * into a from public.pension_autorizaciones where celular = cel;
  return jsonb_build_object(
    'ok', true,
    'celular', cel,
    'autorizacion', case when a.celular is null then null else jsonb_build_object(
        'fondos', to_jsonb(a.fondos), 'version', a.version, 'momento', a.momento,
        'autorizada_en', a.recibida_en, 'revocada_en', a.revocada_en) end,
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'bytes', p.bytes,
                                                               'sha256', p.sha256, 'creado_en', p.creado_en) order by p.id)
                            from public.pension_archivos p where p.celular = cel), '[]'::jsonb));
end
$$;

-- 3c. UN archivo, cuando Joan toca «📄 Ver». Nunca en lote.
create or replace function public.pension_archivo(p_clave text, p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare p public.pension_archivos;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select * into p from public.pension_archivos where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  return jsonb_build_object('ok', true, 'id', p.id, 'celular', p.celular, 'tipo', p.tipo, 'bytes', p.bytes,
                            'sha256', p.sha256, 'creado_en', p.creado_en,
                            'base64', translate(encode(p.datos, 'base64'), E'\n', ''));
end
$$;

-- 3d. Borrar todo lo de una persona: los archivos Y la autorización. La
-- llaman «🧪 Borrar y repetir» y «🚫 Borrar a alguien que lo pidió»; dice
-- cuánto borró, para que el CRM no diga «listo» sin saberlo.
create or replace function public.pension_borrar(p_clave text, p_celular text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; n_arch integer; n_aut integer;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(cel) <> 10 or left(cel, 1) <> '3' then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;
  delete from public.pension_archivos where celular = cel;
  get diagnostics n_arch = row_count;
  delete from public.pension_autorizaciones where celular = cel;
  get diagnostics n_aut = row_count;
  return jsonb_build_object('ok', true, 'celular', cel, 'archivos', n_arch, 'autorizaciones', n_aut);
end
$$;

-- ====== 4. UNA CUENTA BORRADA SE LLEVA SU HISTORIA LABORAL ======
-- Por el camino que sea: borrar_cuenta_de_pruebas, o la cuenta borrada a mano
-- en Supabase. Nunca impide borrar (como cuenta_borrada_desvincula, 20261007).
create or replace function public.pension_al_borrar_la_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cel text;
begin
  cel := substring(lower(coalesce(old.email, '')) from '^57([0-9]{10})@tugarantia\.net$');
  if cel is null then return old; end if;
  delete from public.pension_archivos where celular = cel;
  delete from public.pension_autorizaciones where celular = cel;
  return old;
exception when others then
  return old;
end
$$;

do $$
begin
  execute 'drop trigger if exists pension_al_borrar_la_cuenta on auth.users';
  execute 'create trigger pension_al_borrar_la_cuenta after delete on auth.users '
       || 'for each row execute function public.pension_al_borrar_la_cuenta()';
exception when others then
  raise notice 'FALTA: no pude poner el disparador sobre auth.users (%). Lo demás quedó: «🧪 Borrar y repetir» borra igual con pension_borrar.', sqlerrm;
end
$$;

-- ====== 5. LOS PERMISOS ======
-- Dos tiempos, como siempre: revoke nombrando a anon y authenticated (Supabase
-- les da EXECUTE a cada función nueva de public por su cuenta) y el grant justo.
revoke all on function public.pension_autorizar(text[], text, text) from public, anon, authenticated;
revoke all on function public.pension_subir(text)                   from public, anon, authenticated;
revoke all on function public.pension_mia()                         from public, anon, authenticated;
revoke all on function public.pension_quitar(bigint)                from public, anon, authenticated;
revoke all on function public.pension_retirar()                     from public, anon, authenticated;
revoke all on function public.pension_resumen(text)                 from public, anon, authenticated;
revoke all on function public.pension_de(text, text)                from public, anon, authenticated;
revoke all on function public.pension_archivo(text, bigint)         from public, anon, authenticated;
revoke all on function public.pension_borrar(text, text)            from public, anon, authenticated;
revoke all on function public.pension_al_borrar_la_cuenta()         from public, anon, authenticated;

grant execute on function public.pension_autorizar(text[], text, text) to authenticated;
grant execute on function public.pension_subir(text)                   to authenticated;
grant execute on function public.pension_mia()                         to authenticated;
grant execute on function public.pension_quitar(bigint)                to authenticated;
grant execute on function public.pension_retirar()                     to authenticated;
grant execute on function public.pension_resumen(text)                 to anon;
grant execute on function public.pension_de(text, text)                to anon;
grant execute on function public.pension_archivo(text, bigint)         to anon;
grant execute on function public.pension_borrar(text, text)            to anon;

notify pgrst, 'reload schema';

-- ====== 6. LA PRUEBA LLAMANDO, en la base de verdad ======
-- Con un celular de mentira y sin crear ninguna cuenta en auth.users: las
-- funciones del cliente solo miran el correo de la sesión y la fila de la
-- autorización. Todo lo que se escribe se borra al final, también el freno.
-- Si algo falla, el archivo entero se deshace y lo dice. La tabla de la
-- prueba es temporal (muere con la conexión) y sin «on commit drop»: si el
-- editor corriera cada sentencia por separado, se borraría antes de usarla.
drop table if exists pg_temp.pension_prueba;
create temporary table pension_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_cel   text := '3009991103';
  j       jsonb;
  v_lleno boolean := false;
  pdf     text := encode(convert_to('%PDF-1.4 prueba de la migracion', 'UTF8'), 'base64');
begin
  if exists (select 1 from public.pension_autorizaciones where celular = v_cel)
     or exists (select 1 from public.pension_archivos where celular = v_cel) then
    raise notice 'El celular de prueba % ya tiene algo: la prueba llamando no corre.', v_cel;
    insert into pension_prueba values ('llamando', null) on conflict do nothing;
    return;
  end if;
  -- Sin sesión: nada.
  perform set_config('request.jwt.claims', '', true);
  j := public.pension_subir(pdf);
  insert into pension_prueba values ('sin_sesion', j ->> 'motivo' = 'sin_sesion');
  -- Con sesión y sin autorización: nada.
  perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
  j := public.pension_subir(pdf);
  insert into pension_prueba values ('sin_autorizacion', j ->> 'motivo' = 'sin_autorizacion'
    and not exists (select 1 from public.pension_archivos where celular = v_cel));
  -- Con la autorización: un fondo inventado no; uno de la lista sí.
  j := public.pension_autorizar(array['fondo_inventado'], '2026-11-03', null);
  insert into pension_prueba values ('fondo_inventado', j ->> 'motivo' = 'fondos');
  j := public.pension_autorizar(array['colpensiones', 'porvenir'], '2026-11-03', null);
  insert into pension_prueba values ('autoriza', (j ->> 'ok')::boolean);
  -- Lo que no es PDF ni imagen no entra, aunque diga que sí.
  j := public.pension_subir('data:application/pdf;base64,' || encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'UTF8'), 'base64'));
  insert into pension_prueba values ('svg', j ->> 'motivo' = 'tipo_no_permitido');
  j := public.pension_subir(encode(convert_to('<!doctype html><script>alert(1)</script>', 'UTF8'), 'base64'));
  insert into pension_prueba values ('html', j ->> 'motivo' = 'tipo_no_permitido');
  j := public.pension_subir(repeat('A', 4500001));
  insert into pension_prueba values ('enorme', j ->> 'motivo' = 'muy_grande');
  j := public.pension_subir(pdf);
  -- Si este archivo se vuelve a correr con la tabla ya por encima de su
  -- trozo, el cortacircuito contesta «lleno» y no escribe: eso TAMBIÉN es lo
  -- que tiene que hacer, y la comprobación no debe salir en false por ello.
  v_lleno := coalesce(j ->> 'motivo', '') = 'lleno' and pg_total_relation_size('public.pension_archivos') > 50 * 1024 * 1024;
  insert into pension_prueba values ('pdf', ((j ->> 'ok')::boolean and j ->> 'tipo' = 'pdf') or v_lleno);
  -- Y se borra todo, también el freno.
  j := public.pension_retirar();
  insert into pension_prueba values ('retirar', (j ->> 'borrados')::int = (case when v_lleno then 0 else 1 end)
    and not exists (select 1 from public.pension_archivos where celular = v_cel));
  delete from public.pension_autorizaciones where celular = v_cel;
  delete from public.intentos_fallidos where cedula = 'hl:' || v_cel;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- ====== 7. LO QUE JOAN VE: una fila por comprobación, todas en true ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
with fn(firma) as (values
  ('public.pension_autorizar(text[], text, text)'), ('public.pension_subir(text)'), ('public.pension_mia()'),
  ('public.pension_quitar(bigint)'), ('public.pension_retirar()'), ('public.pension_resumen(text)'),
  ('public.pension_de(text, text)'), ('public.pension_archivo(text, bigint)'), ('public.pension_borrar(text, text)'),
  ('public.pension_al_borrar_la_cuenta()')),
cliente(firma) as (values
  ('public.pension_autorizar(text[], text, text)'), ('public.pension_subir(text)'), ('public.pension_mia()'),
  ('public.pension_quitar(bigint)'), ('public.pension_retirar()')),
joan(firma) as (values
  ('public.pension_resumen(text)'), ('public.pension_de(text, text)'), ('public.pension_archivo(text, bigint)'),
  ('public.pension_borrar(text, text)'))
select 1 as n, 'las dos tablas existen, con RLS y cerradas a anon y authenticated' as comprobacion,
       (select bool_and(c.relrowsecurity) from pg_class c
         where c.oid in ('public.pension_autorizaciones'::regclass, 'public.pension_archivos'::regclass))
       and not exists (select 1 from information_schema.table_privileges
                        where table_schema = 'public' and table_name in ('pension_autorizaciones', 'pension_archivos')
                          and grantee in ('anon', 'authenticated', 'PUBLIC')) as ok
union all
select 2, 'subir, autorizar, mirar, quitar y retirar: solo la sesión del cliente (nunca anon)',
       (select bool_and(has_function_privilege('authenticated', firma, 'execute')
                        and not has_function_privilege('anon', firma, 'execute')) from cliente)
union all
select 3, 'resumen, detalle, archivo y borrar: solo con la clave de Joan (anon + clave), nunca con una sesión',
       (select bool_and(has_function_privilege('anon', firma, 'execute')
                        and not has_function_privilege('authenticated', firma, 'execute')) from joan)
union all
select 4, 'todas son security definer con el search_path fijo',
       (select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%')
          from fn join pg_proc p on p.oid = fn.firma::regprocedure)
union all
select 5, 'las de Joan son volátiles (clave_ok escribe el freno)',
       (select bool_and(p.provolatile = 'v') from joan join pg_proc p on p.oid = joan.firma::regprocedure)
union all
select 6, 'ninguna función del equipo ni de otra parte lee la historia laboral (solo las pension_…)',
       not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname not like 'pension\_%'
                      and p.prosrc ~ 'pension_archivos|pension_autorizaciones')
union all
select 7, 'al borrar una cuenta de acceso se borra su historia laboral (el disparador existe)',
       exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'pension_al_borrar_la_cuenta')
union all
-- 28-oct-2026 (arreglo, ronda 2) — coalesce: bool_and SALTA los null, y un
-- paso cuya respuesta no traía «motivo» (por ejemplo, si algo entrara sin
-- sesión) quedaba en null y la fila salía en true sin haberlo visto.
select 8, 'la prueba llamando: sin sesión, sin autorización, SVG, HTML y archivo enorme no entran; un PDF sí; retirar lo borra',
       (select count(*) = 9 and bool_and(coalesce(ok, false)) from pension_prueba)
union all
select 9, 'la prueba no dejó nada',
       not exists (select 1 from public.pension_autorizaciones where celular = '3009991103')
       and not exists (select 1 from public.pension_archivos where celular = '3009991103')
union all
select 10, 'subir tiene su cortacircuito: pasados 50 MB en pension_archivos no escribe nada (el reparto de los 500 MB)',
       pg_get_functiondef('public.pension_subir(text)'::regprocedure)
         like '%if pg_total_relation_size(''public.pension_archivos'') > 50 * 1024 * 1024 then%return jsonb_build_object(''ok'', false, ''motivo'', ''lleno'');%insert into public.pension_archivos%'
order by 1;
