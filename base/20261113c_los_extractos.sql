-- ===========================================================================
-- TUS EXTRACTOS: NEQUI, DAVIPLATA O EL BANCO, OPCIONAL — 13 de noviembre de 2026
-- (se publica con lote-v145; la versión de la autorización es la del día que
-- sale, 2026-11-19: ver app/extractos.js. Si el lote sale otro día, se mueve
-- allá, en la política y en los términos: pruebas/los-extractos.test.js lo dice.)
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda no cambia nada. Va DESPUÉS de todo lo
-- de base/ (el último antes de este es 20261113b_propuesta_quincenal_a_cuotas.sql;
-- no depende de él ni de 20261113_falta_tu_cedula.sql: se puede correr antes o
-- después de esos dos). Al final sale UNA TABLA: cada fila es una comprobación y
-- TODAS tienen que decir true. Después: Settings → API → «Reload schema». Para
-- mirarla otro día sin cambiar nada: base/comprobar_20261113c_los_extractos.sql.
-- Córrelo ANTES de publicar la app que trae el paso: sin esto el paso no
-- aparece en el registro (play/ le pregunta a la base y, con un 404, lo quita),
-- y la tarjeta de la cuenta tampoco. No se rompe nada: se ofrece menos.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN, con sus palabras (13-nov-2026)
--
-- «quiero validar si el cliente no es empleado que pueda subir los estractos
-- bancarios». Y sus decisiones de ese día: se le ofrece a quien NO es
-- empleado; va dentro del registro, como el fondo de pensiones, opcional y con
-- «Lo hago después»; los archivos se guardan mientras tenga cuenta; solo él los
-- ve, con su clave; se publica con este texto y después va al abogado.
--
-- LO QUE ESTO GUARDA, Y POR QUÉ ASÍ (es el modelo de 20261103_el_fondo_de_pensiones.sql)
--
--   · public.extracto_autorizaciones — UNA fila por celular: la autorización
--     APARTE (la versión del texto que aceptó, la hora que dijo su teléfono y
--     la hora de la base). Un extracto es dato financiero (Ley 1266, y la
--     Corte lo llama semiprivado): va con su propia autorización, sin
--     premarcar, y no toca la general (VERSION_AUTORIZACION de app/cuenta.js no
--     sube: a nadie se le vuelve a pedir nada). Si la retira, la fila se queda
--     como constancia de lo que autorizó y cuándo lo retiró.
--   · public.extracto_archivos — los archivos: el PDF del extracto o
--     pantallazos (JPG, PNG o WEBP). Hasta 3 PDF (los 3 últimos meses: Nequi da
--     uno por mes) y 5 imágenes, de hasta 3 MB cada uno y 12 MB entre todos: el
--     mismo tope por persona de la historia laboral, con un PDF más.
--   · SE GUARDAN MIENTRAS TENGA CUENTA (decisión de Joan del 13-nov; el plan
--     del 9-nov proponía borrarlos a los 30 días, y Joan decidió lo mismo que
--     con la historia laboral). Se borran cuando ella los quita desde su cuenta
--     (extracto_quitar, extracto_retirar), cuando Joan los borra
--     (extracto_borrar, «🗑 Borrar sus extractos» del CRM), y cuando se borra
--     su cuenta de acceso (el disparador sobre auth.users, por el camino que
--     sea).
--   · El RESUMEN que anota Joan (cuánto le entra al mes y si es regular) NO va
--     aquí: va en la ficha del CRM, con su cartera (panel/extractos-crm.js).
--
-- POR QUÉ NO EN LAS TABLAS DE LA HISTORIA LABORAL: son otro dato, con otra
-- autorización y otro texto; mezclarlas haría que retirar una borrara la otra,
-- o que el CRM no supiera cuál es cuál. Y por lo mismo que allá, ni en
-- registro_archivos (solo imágenes, y viaja entera en cada «👁 Ver datos») ni
-- en Supabase Storage (el CRM entra con la llave pública y la clave de Joan,
-- sin sesión, y un bucket privado no le abriría).
--
-- QUIÉN LO VE: SOLO JOAN. Lo leen únicamente extracto_resumen, extracto_de y
-- extracto_archivo, que piden la clave de sincronización (anon + clave). Ninguna
-- función del equipo lo devuelve: la comprobación 6 lo vigila. El cliente ve lo
-- suyo SIN el contenido (extracto_mia: qué subió y cuándo), para quitarlo.
-- extracto_mia también le dice a la app su ocupación del registro (la que él
-- mismo escribió): la tarjeta de la cuenta se ofrece a quien no es empleado.
--
-- LO QUE SE COMPRUEBA EN EL SERVIDOR (el teléfono lo controla quien lo tiene
-- en la mano): el tipo sale de los primeros bytes (%PDF-, FF D8 FF, la firma
-- del PNG, RIFF…WEBP), nunca de lo que diga el teléfono: un SVG o un HTML no
-- entra. El tamaño se mira antes de decodificar. Y el freno de siempre: 30
-- escrituras cada 15 minutos por cuenta, con su propia llave ('ex:'), para que
-- subir extractos no gaste el freno de la historia laboral.
--
-- NUNCA: la clave de Nequi, de Daviplata ni del banco; entrar a su cuenta; un
-- «agregador» que entre con su clave; leer sus SMS. Obtener datos personales sin
-- estar facultado es delito (Código Penal, art. 269F). Por eso la única puerta
-- es el archivo que la persona escoge, y ninguna función recibe una clave.
--
-- Y EL CORTACIRCUITO. Los topes de arriba son POR PERSONA, y un tope por
-- persona protege de UNA persona: el registro está abierto. Pasados los 500 MB
-- del plan gratis la base ENTERA queda de solo lectura: no se desembolsa, no se
-- registra un pago, no se contesta el chat. Es la regla de la casa para las
-- tablas de archivos (20260922j, 20260922s, 20261103): tope por persona MÁS
-- cortacircuito con pg_total_relation_size. El reparto de los 500 MB queda así:
--
--   · chat_fotos         150 MB  (20260922j)
--   · registro_archivos  100 MB  (20261028, la rama registro-tope, cuando se aplique)
--   · fotos_equipo        50 MB  (20260922s)
--   · pension_archivos    50 MB  (20261103)
--   · extracto_archivos   50 MB  (este archivo)
--   · registro_en_vivo    20 MB  (20260919)
--   ---------------------------------------------------------------
--   420 MB de fotos; quedan ~80 MB para lo que no se puede parar nunca: los
--   créditos, los pagos, las fichas, los mensajes y las cuentas de Supabase.
--
-- POR QUÉ 50 MB Y NO 100. El encargo sugería 100 MB. Con el reparto de arriba,
-- 100 dejarían ~30 MB para lo que no se puede parar, y eso es lo que tumba el
-- negocio si se llena. 50 MB es el tope del modelo (la historia laboral):
-- estimado, sin ninguna muestra real medida, un PDF de Nequi de un mes pesa del
-- orden de 100 a 300 KB, tres meses menos de 1 MB, y cinco pantallazos achicados
-- unos 2 MB; caben de 25 a 50 personas a la vez. Al ritmo de hoy (10 a 20
-- registros al mes, y no todos son independientes) son muchos meses. Cuando
-- haga falta más: pasar a Supabase Pro (8 GB) y subir este número aquí y en
-- extracto_resumen (los dos tienen que decir lo mismo: lo vigila la
-- comprobación 11). Lo libre de verdad lo dice Supabase en Settings → Usage →
-- Database size, y eso solo lo puede mirar Joan.
-- Cuando se llena, el cliente lee que ahora no podemos recibir sus extractos (es
-- opcional: su cuenta sigue igual), y lo que esperaba en su teléfono sigue en la
-- cola hasta el día siguiente, reintentándose cada vez que entra a su cuenta.
-- Joan se entera en 📥 Registrados desde el 80 % del tope (extracto_resumen
-- devuelve lo ocupado). Lo arregla borrando lo que ya no sirva; borrar filas no
-- siempre achica la tabla, así que después va
-- `vacuum full public.extracto_archivos;`, sola en su propia consulta.
--
-- LO QUE NO HACE: no lee el PDF, no lo confirma con el banco (no hay cómo sin la
-- clave, y la clave no se pide) y no le suma garantía a nadie. Lo mira Joan.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
-- Como todo lo que va después de 20261022d (la regla de
-- pruebas/el-lote-del-27-junto.test.js): si esa no está, se para aquí. Este
-- archivo no la usa —sus funciones son del cliente y de Joan, ninguna del
-- equipo—, pero correrlo antes por error diría que el orden no importa.
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql y lo que va después. Este archivo va al final. No se tocó nada.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.clave_ok(text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null
     or to_regprocedure('public.puede_intentar_tope(text, integer)') is null
     or to_regprocedure('public.anotar_fallo(text)') is null
     or to_regclass('public.intentos_fallidos') is null then
    raise exception 'Falta lo de base/supabase.sql o de 20260911 (celular_de_sesion, clave_ok, el freno). No se tocó nada.';
  end if;
  if to_regprocedure('public.cuenta_de_celular(text)') is null or to_regclass('public.registros') is null then
    raise exception 'Falta lo de base/20261007_una_puerta.sql (cuenta_de_celular) o la tabla de registros. No se tocó nada.';
  end if;
end $$;

-- ====== 1. LAS DOS TABLAS ======
create table if not exists public.extracto_autorizaciones (
  celular      text        primary key check (celular ~ '^3[0-9]{9}$'),
  version      text        not null,            -- la del texto que aceptó (AAAA-MM-DD)
  momento      text,                            -- la hora que dijo su teléfono: solo informa
  recibida_en  timestamptz not null default now(),   -- la hora de la base: esta es la constancia
  revocada_en  timestamptz,                     -- si la retiró: desde ahí no entra nada
  historial    jsonb       not null default '[]'::jsonb   -- las constancias anteriores
);
alter table public.extracto_autorizaciones enable row level security;
revoke all on table public.extracto_autorizaciones from public, anon, authenticated;

create table if not exists public.extracto_archivos (
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
create index if not exists extracto_archivos_por_celular on public.extracto_archivos (celular);
alter table public.extracto_archivos enable row level security;
revoke all on table public.extracto_archivos from public, anon, authenticated;
do $$
begin
  execute 'revoke all on sequence public.extracto_archivos_id_seq from public, anon, authenticated';
exception when others then
  raise notice 'No encontré la secuencia de extracto_archivos (%): las tablas siguen cerradas igual.', sqlerrm;
end $$;

-- ====== 2. LO DEL CLIENTE, CON SU SESIÓN ======

-- 2a. La autorización aparte. La manda el teléfono en cuanto la persona marca
-- la casilla (en la app) o al abrir su cuenta (en el registro). SIEMPRE con la
-- versión del texto que vio: aquí no hay nada que cambiar sin firmar (no hay
-- fondo que escoger), así que sin versión no hay nada que hacer. Volver a
-- firmar guarda la constancia anterior en el historial.
create or replace function public.extracto_autorizar(p_version text, p_momento text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel  text;
  v    text;
  ant  public.extracto_autorizaciones;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  v := nullif(btrim(coalesce(p_version, '')), '');
  if v is null or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'motivo', 'version');
  end if;
  if not public.puede_intentar_tope('ex:' || cel, 30) then
    return jsonb_build_object('ok', false, 'motivo', 'freno');
  end if;
  perform public.anotar_fallo('ex:' || cel);

  select * into ant from public.extracto_autorizaciones where celular = cel;
  if found then
    update public.extracto_autorizaciones
       set historial = (case when jsonb_array_length(historial) >= 20
                             then historial - 0 else historial end)
                       || jsonb_build_array(jsonb_build_object('version', ant.version, 'momento', ant.momento,
                            'recibida_en', ant.recibida_en, 'revocada_en', ant.revocada_en)),
           version = v, momento = left(p_momento, 40), recibida_en = now(), revocada_en = null
     where celular = cel;
  else
    insert into public.extracto_autorizaciones (celular, version, momento)
    values (cel, v, left(p_momento, 40));
  end if;
  return jsonb_build_object('ok', true, 'version', v);
end
$$;

-- 2b. Un archivo. El tipo lo deciden sus primeros bytes, no el teléfono.
create or replace function public.extracto_subir(p_archivo text)
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
  if not exists (select 1 from public.extracto_autorizaciones
                  where celular = cel and revocada_en is null) then
    return jsonb_build_object('ok', false, 'motivo', 'sin_autorizacion');
  end if;
  if not public.puede_intentar_tope('ex:' || cel, 30) then
    return jsonb_build_object('ok', false, 'motivo', 'freno');
  end if;
  perform public.anotar_fallo('ex:' || cel);

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
  select id into ya from public.extracto_archivos where celular = cel and sha256 = h;
  if found then
    return jsonb_build_object('ok', true, 'id', ya, 'tipo', tipo, 'bytes', octet_length(datos), 'sha256', h, 'ya_estaba', true);
  end if;

  select count(*) filter (where p.tipo = 'pdf'), count(*) filter (where p.tipo <> 'pdf'), coalesce(sum(p.bytes), 0)
    into n_pdf, n_img, total
    from public.extracto_archivos p where p.celular = cel;
  -- 3 PDF: los tres últimos meses, que Nequi da uno por mes. 5 imágenes, como
  -- el modelo (decisión de Joan: «pantallazos, hasta 5»).
  if (tipo = 'pdf' and n_pdf >= 3) or (tipo <> 'pdf' and n_img >= 5) then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados');
  end if;
  if total + octet_length(datos) > 12582912 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_espacio');
  end if;

  -- EL CORTACIRCUITO: el TOTAL, que ningún tope de arriba mira (ver el
  -- encabezado: el reparto de los 500 MB). Va justo antes de escribir y
  -- después de «ya estaba»: un reintento de lo que YA entró no es escritura
  -- nueva, y contestarle «no podemos recibirlo» sería mentirle.
  -- EN FILA (remate del 13-nov): pg_total_relation_size no bloquea nada, así
  -- que N cuentas subiendo a la vez miraban el mismo tamaño y se pasaban del
  -- tope unos N × 3 MB. Los topes por persona ya aguantaban (anotar_fallo
  -- bloquea la fila 'ex:' || celular); el total no. Este candado vive hasta
  -- que termina la transacción, o sea hasta después del insert: la siguiente
  -- subida mira el tamaño con este archivo ya adentro. Las subidas son pocas
  -- y cortas, y ponerlas en fila no frena nada más de la base.
  perform pg_advisory_xact_lock(hashtext('extracto_subir'));
  if pg_total_relation_size('public.extracto_archivos') > 50 * 1024 * 1024 then
    return jsonb_build_object('ok', false, 'motivo', 'lleno');
  end if;

  insert into public.extracto_archivos (celular, tipo, datos, bytes, sha256)
  values (cel, tipo, datos, octet_length(datos), h)
  returning id into nuevo;
  return jsonb_build_object('ok', true, 'id', nuevo, 'tipo', tipo, 'bytes', octet_length(datos), 'sha256', h);
end
$$;

-- 2c. Lo suyo, SIN el contenido: qué subió y cuándo, qué autorizó, y la
-- ocupación que escribió en su registro (la app ofrece la tarjeta a quien no
-- es empleado). El registro es el de ESTA cuenta, con la regla de mi_registro
-- (20261007): el más nuevo de su celular desde una hora antes de abrirla. Un
-- celular no es una persona: el registro de otro que usó ese número antes no
-- cuenta.
create or replace function public.extracto_mia()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cel text; a public.extracto_autorizaciones; desde timestamptz; ocup text;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  select * into a from public.extracto_autorizaciones where celular = cel;
  select c.creada_en into desde from public.cuenta_de_celular(cel) c;
  select left(r.datos ->> 'ocupacion', 60) into ocup
    from public.registros r
   where right(public.solo_digitos(coalesce(r.telefono, '')), 10) = cel
     and r.creado_en >= coalesce(desde, now()) - interval '1 hour'
   order by r.creado_en desc, r.id desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'ocupacion', ocup,
    'autorizacion', case when a.celular is null then null else jsonb_build_object(
        'version', a.version, 'recibida_en', a.recibida_en, 'revocada_en', a.revocada_en) end,
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'bytes', p.bytes,
                                                               'creado_en', p.creado_en) order by p.id)
                            from public.extracto_archivos p where p.celular = cel), '[]'::jsonb));
end
$$;

-- 2d. Quitar UNO de los suyos (se equivocó de archivo).
create or replace function public.extracto_quitar(p_id bigint)
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
  delete from public.extracto_archivos where id = p_id and celular = cel;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'borrados', n);
end
$$;

-- 2e. RETIRAR LA AUTORIZACIÓN (Ley 1581, art. 8 lit. e): se borran TODOS sus
-- archivos, y queda la constancia de que la dio y la retiró. Tan fácil como
-- darla: un toque desde su cuenta. Sin freno: retirar no se frena.
create or replace function public.extracto_retirar()
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
  delete from public.extracto_archivos where celular = cel;
  get diagnostics n = row_count;
  update public.extracto_autorizaciones
     set revocada_en = coalesce(revocada_en, now())
   where celular = cel;
  return jsonb_build_object('ok', true, 'borrados', n);
end
$$;

-- ====== 3. LO DE JOAN, CON SU CLAVE ======
-- Todas VOLÁTILES a propósito: pasan por clave_ok, que escribe el freno
-- (la lección de archivos_de_registro, 8 al 10 de septiembre).

-- 3a. Quién tiene algo, sin ningún archivo: para pintar «📄 Extractos» en
-- Registrados y en 📨 Solicitudes de un solo viaje. Y cuánto espacio va
-- ocupado, con su tope: el del cortacircuito de extracto_subir (los dos
-- tienen que decir lo mismo: la comprobación 11).
create or replace function public.extracto_resumen(p_clave text)
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
    'espacio', jsonb_build_object('ocupado', pg_total_relation_size('public.extracto_archivos'), 'tope', 50 * 1024 * 1024),
    'personas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'celular', a.celular, 'version', a.version,
             'autorizada_en', a.recibida_en, 'revocada_en', a.revocada_en,
             'pdf', (select count(*) from public.extracto_archivos p where p.celular = a.celular and p.tipo = 'pdf'),
             'imagenes', (select count(*) from public.extracto_archivos p where p.celular = a.celular and p.tipo <> 'pdf'),
             'ultimo', (select max(p.creado_en) from public.extracto_archivos p where p.celular = a.celular))
           order by a.recibida_en desc)
      from public.extracto_autorizaciones a), '[]'::jsonb));
end
$$;

-- 3b. Lo de UNA persona, sin el contenido: la ficha y el «📄 Ver».
create or replace function public.extracto_de(p_clave text, p_celular text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text; a public.extracto_autorizaciones;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  select * into a from public.extracto_autorizaciones where celular = cel;
  return jsonb_build_object(
    'ok', true,
    'celular', cel,
    'autorizacion', case when a.celular is null then null else jsonb_build_object(
        'version', a.version, 'momento', a.momento,
        'autorizada_en', a.recibida_en, 'revocada_en', a.revocada_en) end,
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'bytes', p.bytes,
                                                               'sha256', p.sha256, 'creado_en', p.creado_en) order by p.id)
                            from public.extracto_archivos p where p.celular = cel), '[]'::jsonb));
end
$$;

-- 3c. UN archivo, cuando Joan toca «📄 Ver». Nunca en lote.
create or replace function public.extracto_archivo(p_clave text, p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare p public.extracto_archivos;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  select * into p from public.extracto_archivos where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  return jsonb_build_object('ok', true, 'id', p.id, 'celular', p.celular, 'tipo', p.tipo, 'bytes', p.bytes,
                            'sha256', p.sha256, 'creado_en', p.creado_en,
                            'base64', translate(encode(p.datos, 'base64'), E'\n', ''));
end
$$;

-- 3d. Borrar todo lo de una persona: los archivos Y la autorización. Lo llama
-- «🗑 Borrar sus extractos» del CRM (quien lo pide por el chat); dice cuánto
-- borró, para que el CRM no diga «listo» sin saberlo.
create or replace function public.extracto_borrar(p_clave text, p_celular text)
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
  delete from public.extracto_archivos where celular = cel;
  get diagnostics n_arch = row_count;
  delete from public.extracto_autorizaciones where celular = cel;
  get diagnostics n_aut = row_count;
  return jsonb_build_object('ok', true, 'celular', cel, 'archivos', n_arch, 'autorizaciones', n_aut);
end
$$;

-- ====== 4. UNA CUENTA BORRADA SE LLEVA SUS EXTRACTOS ======
-- Por el camino que sea: borrar_cuenta_de_pruebas, o la cuenta borrada a mano
-- en Supabase. Nunca impide borrar (como cuenta_borrada_desvincula, 20261007).
create or replace function public.extracto_al_borrar_la_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cel text;
begin
  cel := substring(lower(coalesce(old.email, '')) from '^57([0-9]{10})@tugarantia\.net$');
  if cel is null then return old; end if;
  delete from public.extracto_archivos where celular = cel;
  delete from public.extracto_autorizaciones where celular = cel;
  return old;
exception when others then
  return old;
end
$$;

do $$
begin
  execute 'drop trigger if exists extracto_al_borrar_la_cuenta on auth.users';
  execute 'create trigger extracto_al_borrar_la_cuenta after delete on auth.users '
       || 'for each row execute function public.extracto_al_borrar_la_cuenta()';
exception when others then
  raise notice 'FALTA: no pude poner el disparador sobre auth.users (%). Lo demás quedó: «🗑 Borrar sus extractos» borra igual con extracto_borrar.', sqlerrm;
end
$$;

-- ====== 5. LOS PERMISOS ======
-- Dos tiempos, como siempre: revoke nombrando a anon y authenticated (Supabase
-- les da EXECUTE a cada función nueva de public por su cuenta: la lección de
-- 20260922c) y el grant justo.
revoke all on function public.extracto_autorizar(text, text)       from public, anon, authenticated;
revoke all on function public.extracto_subir(text)                 from public, anon, authenticated;
revoke all on function public.extracto_mia()                       from public, anon, authenticated;
revoke all on function public.extracto_quitar(bigint)              from public, anon, authenticated;
revoke all on function public.extracto_retirar()                   from public, anon, authenticated;
revoke all on function public.extracto_resumen(text)               from public, anon, authenticated;
revoke all on function public.extracto_de(text, text)              from public, anon, authenticated;
revoke all on function public.extracto_archivo(text, bigint)       from public, anon, authenticated;
revoke all on function public.extracto_borrar(text, text)          from public, anon, authenticated;
revoke all on function public.extracto_al_borrar_la_cuenta()       from public, anon, authenticated;

grant execute on function public.extracto_autorizar(text, text)    to authenticated;
grant execute on function public.extracto_subir(text)              to authenticated;
grant execute on function public.extracto_mia()                    to authenticated;
grant execute on function public.extracto_quitar(bigint)           to authenticated;
grant execute on function public.extracto_retirar()                to authenticated;
grant execute on function public.extracto_resumen(text)            to anon;
grant execute on function public.extracto_de(text, text)           to anon;
grant execute on function public.extracto_archivo(text, bigint)    to anon;
grant execute on function public.extracto_borrar(text, text)       to anon;

notify pgrst, 'reload schema';

-- ====== 6. LA PRUEBA LLAMANDO, en la base de verdad ======
-- Con un celular de mentira y sin crear ninguna cuenta en auth.users: las
-- funciones del cliente solo miran el correo de la sesión y la fila de la
-- autorización. Todo lo que se escribe se borra al final, también el freno.
-- Si algo falla, el archivo entero se deshace y lo dice. La tabla de la
-- prueba es temporal (muere con la conexión) y sin «on commit drop»: si el
-- editor corriera cada sentencia por separado, se borraría antes de usarla.
drop table if exists pg_temp.extracto_prueba;
create temporary table extracto_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_cel   text := '3009991113';
  j       jsonb;
  v_lleno boolean := false;
  pdf     text := encode(convert_to('%PDF-1.4 extracto de mentira de la migracion', 'UTF8'), 'base64');
begin
  if exists (select 1 from public.extracto_autorizaciones where celular = v_cel)
     or exists (select 1 from public.extracto_archivos where celular = v_cel) then
    raise notice 'El celular de prueba % ya tiene algo: la prueba llamando no corre.', v_cel;
    insert into extracto_prueba values ('llamando', null) on conflict do nothing;
    return;
  end if;
  -- Sin sesión: nada.
  perform set_config('request.jwt.claims', '', true);
  j := public.extracto_subir(pdf);
  insert into extracto_prueba values ('sin_sesion', j ->> 'motivo' = 'sin_sesion');
  -- Con sesión y sin autorización: nada.
  perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
  j := public.extracto_subir(pdf);
  insert into extracto_prueba values ('sin_autorizacion', j ->> 'motivo' = 'sin_autorizacion'
    and not exists (select 1 from public.extracto_archivos where celular = v_cel));
  -- Sin versión no hay firma; con la versión, sí.
  j := public.extracto_autorizar(null, null);
  insert into extracto_prueba values ('sin_version', j ->> 'motivo' = 'version'
    and not exists (select 1 from public.extracto_autorizaciones where celular = v_cel));
  j := public.extracto_autorizar('2026-11-19', null);
  insert into extracto_prueba values ('autoriza', coalesce((j ->> 'ok')::boolean, false));
  -- Lo que no es PDF ni imagen no entra, aunque diga que sí.
  j := public.extracto_subir('data:application/pdf;base64,' || encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'UTF8'), 'base64'));
  insert into extracto_prueba values ('svg', j ->> 'motivo' = 'tipo_no_permitido');
  j := public.extracto_subir(encode(convert_to('<!doctype html><script>alert(1)</script>', 'UTF8'), 'base64'));
  insert into extracto_prueba values ('html', j ->> 'motivo' = 'tipo_no_permitido');
  j := public.extracto_subir(repeat('A', 4500001));
  insert into extracto_prueba values ('enorme', j ->> 'motivo' = 'muy_grande');
  j := public.extracto_subir(pdf);
  -- Si este archivo se vuelve a correr con la tabla ya por encima de su
  -- trozo, el cortacircuito contesta «lleno» y no escribe: eso TAMBIÉN es lo
  -- que tiene que hacer, y la comprobación no debe salir en false por ello.
  v_lleno := coalesce(j ->> 'motivo', '') = 'lleno' and pg_total_relation_size('public.extracto_archivos') > 50 * 1024 * 1024;
  insert into extracto_prueba values ('pdf', (coalesce((j ->> 'ok')::boolean, false) and j ->> 'tipo' = 'pdf') or v_lleno);
  -- Lo suyo vuelve SIN el contenido.
  j := public.extracto_mia();
  insert into extracto_prueba values ('mia_sin_contenido', coalesce((j ->> 'ok')::boolean, false)
    and jsonb_array_length(j -> 'archivos') = (case when v_lleno then 0 else 1 end)
    and position('base64' in j::text) = 0 and position('JVBER' in j::text) = 0);
  -- Y se borra todo, también el freno.
  j := public.extracto_retirar();
  insert into extracto_prueba values ('retirar', (j ->> 'borrados')::int = (case when v_lleno then 0 else 1 end)
    and not exists (select 1 from public.extracto_archivos where celular = v_cel));
  delete from public.extracto_autorizaciones where celular = v_cel;
  delete from public.intentos_fallidos where cedula = 'ex:' || v_cel;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- ====== 7. LO QUE JOAN VE: una fila por comprobación, todas en true ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
with fn(firma) as (values
  ('public.extracto_autorizar(text, text)'), ('public.extracto_subir(text)'), ('public.extracto_mia()'),
  ('public.extracto_quitar(bigint)'), ('public.extracto_retirar()'), ('public.extracto_resumen(text)'),
  ('public.extracto_de(text, text)'), ('public.extracto_archivo(text, bigint)'), ('public.extracto_borrar(text, text)'),
  ('public.extracto_al_borrar_la_cuenta()')),
cliente(firma) as (values
  ('public.extracto_autorizar(text, text)'), ('public.extracto_subir(text)'), ('public.extracto_mia()'),
  ('public.extracto_quitar(bigint)'), ('public.extracto_retirar()')),
joan(firma) as (values
  ('public.extracto_resumen(text)'), ('public.extracto_de(text, text)'), ('public.extracto_archivo(text, bigint)'),
  ('public.extracto_borrar(text, text)'))
select 1 as n, 'las dos tablas existen, con RLS, sin políticas y cerradas a anon y authenticated' as comprobacion,
       (select bool_and(c.relrowsecurity) from pg_class c
         where c.oid in ('public.extracto_autorizaciones'::regclass, 'public.extracto_archivos'::regclass))
       and not exists (select 1 from information_schema.table_privileges
                        where table_schema = 'public' and table_name in ('extracto_autorizaciones', 'extracto_archivos')
                          and grantee in ('anon', 'authenticated', 'PUBLIC'))
       and not exists (select 1 from pg_policies
                        where schemaname = 'public' and tablename in ('extracto_autorizaciones', 'extracto_archivos')) as ok
union all
select 2, 'autorizar, subir, mirar, quitar y retirar: solo la sesión del cliente (nunca anon)',
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
select 6, 'ninguna función del equipo ni de otra parte lee los extractos (solo las extracto_…)',
       not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname not like 'extracto\_%'
                      and p.prosrc ~ 'extracto_archivos|extracto_autorizaciones')
union all
select 7, 'al borrar una cuenta de acceso se borran sus extractos (el disparador existe)',
       exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'extracto_al_borrar_la_cuenta')
union all
-- coalesce: bool_and SALTA los null, y un paso cuya respuesta no traía
-- «motivo» quedaba en null y la fila salía en true sin haberlo visto.
select 8, 'la prueba llamando: sin sesión, sin autorización, sin versión, SVG, HTML y archivo enorme no entran; un PDF sí; lo suyo vuelve sin el contenido; retirar lo borra',
       (select count(*) = 10 and bool_and(coalesce(ok, false)) from extracto_prueba)
union all
select 9, 'la prueba no dejó nada',
       not exists (select 1 from public.extracto_autorizaciones where celular = '3009991113')
       and not exists (select 1 from public.extracto_archivos where celular = '3009991113')
       and not exists (select 1 from public.intentos_fallidos where cedula = 'ex:3009991113')
union all
select 10, 'subir tiene su cortacircuito, en fila: pasados 50 MB en extracto_archivos no escribe nada (el reparto de los 500 MB), ni con muchas cuentas subiendo a la vez',
       pg_get_functiondef('public.extracto_subir(text)'::regprocedure)
         like '%perform pg_advisory_xact_lock(hashtext(''extracto_subir''));%if pg_total_relation_size(''public.extracto_archivos'') > 50 * 1024 * 1024 then%return jsonb_build_object(''ok'', false, ''motivo'', ''lleno'');%insert into public.extracto_archivos%'
union all
select 11, 'el tope que Joan ve en 📥 Registrados es el mismo del cortacircuito (50 MB)',
       pg_get_functiondef('public.extracto_resumen(text)'::regprocedure)
         like '%''tope'', 50 * 1024 * 1024%'
union all
select 12, 'ninguna función recibe una clave del banco: las del cliente solo reciben la versión, el momento, el archivo o su número',
       not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname like 'extracto\_%'
                      and coalesce(array_to_string(p.proargnames, ','), '') ~* 'clave_banco|password|contrasena|pin')
order by 1;
