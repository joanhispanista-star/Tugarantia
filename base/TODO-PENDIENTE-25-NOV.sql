-- ========================================================================
-- TU GARANTÍA — LOS CUATRO SQL PENDIENTES, EN ORDEN
-- Armado el 25 de noviembre de 2026.
--
-- CÓMO SE CORRE: Supabase → SQL Editor → New query → pegar TODO ESTO → Run.
-- Después: Settings → API → Reload schema.
--
-- Es UN solo script a propósito, como el del 9 de septiembre. El editor lo corre
-- entero de una vez: si algo falla, falla completo, lo dice en rojo y la base no
-- queda a medias. Cuatro pegados sueltos tienen el riesgo de que el tercero se
-- quede sin correr y nadie lo note.
--
-- Los cuatro son idempotentes: correrlo dos veces no hace daño. Cada parte es su
-- archivo de base/ TAL CUAL (una prueba lo compara letra por letra), se prueba
-- sola llamándose al final, y revienta a propósito si algo no quedó como debe.
-- AL TERMINAR sale una tabla: todas las filas deben decir «bien».
--
-- Si prefieres correrlos de a uno, son estos cuatro archivos de base/, en este orden:
--   1. 20261113c_los_extractos.sql
--      TUS EXTRACTOS (subir los extractos del banco, con su autorización aparte)
--   2. 20261124_plataformas_del_extracto.sql
--      QUÉ PLATAFORMAS USA (Nequi, Daviplata, Nu, Lulo…)
--   3. 20261125_solicitudes_en_el_celular.sql
--      LAS SOLICITUDES EN EL CELULAR (la pestaña del CRM del teléfono)
--   4. 20261125b_el_chat_con_tu_sesion.sql
--      EL CHAT CON TU SESIÓN (contestar desde el Panel en el bolsillo)
-- ========================================================================


-- ========================================================================
-- PARTE 1 DE 4: 20261113c_los_extractos.sql
-- ========================================================================

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


-- ========================================================================
-- PARTE 2 DE 4: 20261124_plataformas_del_extracto.sql
-- ========================================================================

-- ===========================================================================
-- QUÉ PLATAFORMAS USA — 24 de noviembre de 2026
-- ===========================================================================
-- PARA JOAN. Se corre DESPUÉS de base/20261113c_los_extractos.sql (si esa no
-- está, este archivo se para solo y no toca nada). Se copia ENTERO en el SQL
-- Editor de Supabase, «Run», y al final Settings → API → «Reload schema». Se
-- puede correr dos veces. Lo último que muestra es una tabla: todas las filas
-- tienen que salir en true.
--
-- QUÉ PEDISTE (24-nov): «que el cliente pueda indicar que plataformas usa como
-- nequi, daviplata, nubank, lulo bank u otros… para poder dar con un analisis
-- de riesgo mucho mas acertado… todo esto opcional».
--
-- QUÉ HACE:
--   · una columna más en la autorización de los extractos, `plataformas`: un
--     texto corto con las que la persona marcó, de una LISTA CERRADA (nequi,
--     daviplata, nubank, lulo, bancolombia, otra). No hay texto libre: lo que
--     no está en la lista no se guarda, lo mande quien lo mande.
--   · va PEGADA a la autorización aparte de los extractos: sin esa autorización
--     vigente no se guarda nada, y al retirarla se borra (un disparador). Si
--     se borra la cuenta, o tú borras sus extractos, se va con la fila.
--   · la persona las dice y las lee con SU sesión; tú las ves con tu clave.
--     El equipo no las ve: ninguna función del equipo lee esa tabla.
--
-- QUÉ NO HACE: no reescribe ninguna función que ya exista (tampoco las de
-- 20261113c), no califica a nadie y no cambia la garantía. Es un dato que la
-- persona dice: no se confirma con ningún banco.
--
-- POR QUÉ UN ARCHIVO APARTE y no dentro de 20261113c: aquel se escribió y se
-- revisó el 13-nov; este es lo nuevo del 24. Si este no se corre, los extractos
-- funcionan igual y las casillas de «¿Cuáles usas?» no aparecen (el teléfono
-- pregunta primero si la base las puede guardar).
--
-- SIN FRENO, como extracto_quitar y extracto_mia: cada llamada escribe un
-- texto de a lo más 44 letras en LA fila de quien llama. No hay nada que
-- tantear ni nada que llenar.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
-- Como todo lo que va después de 20261022d (la regla de
-- pruebas/el-lote-del-27-junto.test.js): si esa no está, se para aquí. Este
-- archivo no la usa, pero correrlo antes por error diría que el orden no importa.
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql y lo que va después. Este archivo va al final. No se tocó nada.';
  end if;
  if to_regclass('public.extracto_autorizaciones') is null
     or to_regprocedure('public.extracto_autorizar(text, text)') is null
     or to_regprocedure('public.extracto_retirar()') is null then
    raise exception 'Primero corre base/20261113c_los_extractos.sql. Este archivo va después. No se tocó nada.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.clave_ok(text)') is null
     or to_regprocedure('public.solo_digitos(text)') is null then
    raise exception 'Falta lo de base/supabase.sql (celular_de_sesion, clave_ok, solo_digitos). No se tocó nada.';
  end if;
end $$;

-- ====== 1. LA COLUMNA ======
-- En la fila de la autorización, no en una tabla nueva: así nace con el
-- permiso, muere con él, y todo lo que ya borra esa fila (extracto_borrar, el
-- disparador de la cuenta borrada) se la lleva sin que haya que acordarse.
alter table public.extracto_autorizaciones
  add column if not exists plataformas text not null default '';

-- Solo letras minúsculas separadas por comas: aunque alguien escribiera en la
-- tabla sin pasar por la función, aquí no cabe un nombre, un número ni una
-- frase.
alter table public.extracto_autorizaciones
  drop constraint if exists extracto_plataformas_de_la_lista;
alter table public.extracto_autorizaciones
  add constraint extracto_plataformas_de_la_lista
  check (plataformas ~ '^([a-z]+(,[a-z]+)*)?$' and length(plataformas) <= 60);

-- ====== 2. LA LISTA, EN UN SOLO SITIO ======
-- De lo que llegue a lo que se guarda: los nombres de la lista, en el orden de
-- la lista, sin repetir. La misma lista vive en app/extractos.js (PLATAFORMAS)
-- y en panel/extractos-crm.js; pruebas/los-extractos.test.js compara las tres.
-- En SQL y no en PL/pgSQL: así la base revisa el cuerpo AL CREARLA, no en la
-- primera llamada (la lección de 20260908b).
create or replace function public.extracto_plataformas_limpia(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(l.id, ',' order by l.n), '')
    from unnest(array['nequi', 'daviplata', 'nubank', 'lulo', 'bancolombia', 'otra'])
         with ordinality as l(id, n)
   where l.id = any (string_to_array(
           regexp_replace(lower(left(coalesce(p_texto, ''), 200)), '[^a-z,]', '', 'g'), ','));
$$;

-- ====== 3. LO DEL CLIENTE, CON SU SESIÓN ======

-- 3a. Decir cuáles usa. Manda la lista ENTERA cada vez (vacía = ninguna): la
-- última que llega es la que queda. Sin autorización vigente no guarda nada.
create or replace function public.extracto_plataformas(p_plataformas text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel  text;
  v    text;
  n    integer;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  v := public.extracto_plataformas_limpia(p_plataformas);
  update public.extracto_autorizaciones a
     set plataformas = v
   where a.celular = cel and a.revocada_en is null;
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_autorizacion');
  end if;
  return jsonb_build_object('ok', true, 'plataformas', v);
end
$$;

-- 3b. Leer las suyas (para pintar las casillas como las dejó). Sin
-- autorización vigente, vacío.
create or replace function public.extracto_plataformas_mias()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel  text;
  v    text;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;
  select a.plataformas into v
    from public.extracto_autorizaciones a
   where a.celular = cel and a.revocada_en is null;
  return jsonb_build_object('ok', true, 'plataformas', coalesce(v, ''));
end
$$;

-- ====== 4. AL RETIRAR LA AUTORIZACIÓN, SE BORRAN ======
-- extracto_retirar (20261113c) marca `revocada_en` y deja la fila como
-- constancia. Lo que la persona marcó no es constancia de nada: se va. Con un
-- disparador y no reescribiendo extracto_retirar, para no tocar una función
-- ya revisada; y así vale por cualquier camino que ponga esa fecha. Volver a
-- firmar después no las revive: ya no están.
create or replace function public.extracto_plataformas_al_retirar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.revocada_en is not null then
    new.plataformas := '';
  end if;
  return new;
end
$$;

drop trigger if exists extracto_plataformas_al_retirar on public.extracto_autorizaciones;
create trigger extracto_plataformas_al_retirar
  before update on public.extracto_autorizaciones
  for each row execute function public.extracto_plataformas_al_retirar();

-- ====== 5. LO DE JOAN, CON SU CLAVE ======
-- 5a. Lo de adentro: lo que contesta la de la clave. Aparte, y en SQL, por dos
-- razones: la base revisa el cuerpo al crearla, y la prueba de abajo la puede
-- LLAMAR (la de la clave no: llamarla con una clave falsa le suma un fallo al
-- freno de tu clave, que es una secuencia y no se deshace). No se le da a
-- nadie: solo la llama la de 5b, que corre como dueña de la base.
--   · con celular: las de esa persona;
--   · sin celular: todas las personas que marcaron alguna, para pintar la
--     lista de 📥 Registrados de un solo viaje.
create or replace function public.extracto_plataformas_interna(p_celular text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_celular, '')), '') is not null then
      jsonb_build_object(
        'ok', true,
        'celular', right(public.solo_digitos(p_celular), 10),
        'plataformas', coalesce((select a.plataformas
                                   from public.extracto_autorizaciones a
                                  where a.celular = right(public.solo_digitos(p_celular), 10)
                                    and a.revocada_en is null), ''))
    else
      jsonb_build_object(
        'ok', true,
        'personas', coalesce((select jsonb_agg(jsonb_build_object('celular', a.celular, 'plataformas', a.plataformas)
                                               order by a.celular)
                                from public.extracto_autorizaciones a
                               where a.revocada_en is null and a.plataformas <> ''), '[]'::jsonb))
  end;
$$;

-- 5b. La que llama el CRM. VOLÁTIL a propósito, como todas las de la clave:
-- clave_ok escribe el freno.
create or replace function public.extracto_plataformas_de(p_clave text, p_celular text default null)
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
  return public.extracto_plataformas_interna(p_celular);
end
$$;

-- ====== 6. LOS PERMISOS ======
-- PostgreSQL le da EXECUTE a todo el mundo por defecto, y Supabase se lo regala
-- además a anon y a authenticated: primero se quita todo, después se da lo justo.
revoke all on function public.extracto_plataformas_limpia(text)       from public, anon, authenticated;
revoke all on function public.extracto_plataformas(text)              from public, anon, authenticated;
revoke all on function public.extracto_plataformas_mias()             from public, anon, authenticated;
revoke all on function public.extracto_plataformas_al_retirar()       from public, anon, authenticated;
revoke all on function public.extracto_plataformas_interna(text)      from public, anon, authenticated;
revoke all on function public.extracto_plataformas_de(text, text)     from public, anon, authenticated;

grant execute on function public.extracto_plataformas(text)           to authenticated;
grant execute on function public.extracto_plataformas_mias()          to authenticated;
grant execute on function public.extracto_plataformas_de(text, text)  to anon;

notify pgrst, 'reload schema';

-- ====== 7. LA PRUEBA LLAMANDO, en la base de verdad ======
-- Con un celular de mentira y sin crear ninguna cuenta: las funciones del
-- cliente solo miran el correo de la sesión. Todo lo que se escribe se borra
-- al final, también el freno que deja extracto_autorizar. Si algo falla, el
-- archivo entero se deshace y lo dice. La tabla de la prueba es temporal y sin
-- «on commit drop» (si el editor corriera cada sentencia por separado, se
-- borraría antes de usarla).
drop table if exists pg_temp.plataformas_prueba;
create temporary table plataformas_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_cel  text := '3009991124';
  j      jsonb;
begin
  if exists (select 1 from public.extracto_autorizaciones a where a.celular = v_cel) then
    raise notice 'El celular de prueba % ya tiene algo: la prueba llamando no corre.', v_cel;
    insert into plataformas_prueba values ('llamando', null) on conflict do nothing;
    return;
  end if;
  -- Sin sesión: nada.
  perform set_config('request.jwt.claims', '', true);
  j := public.extracto_plataformas('nequi');
  insert into plataformas_prueba values ('sin_sesion', coalesce(j ->> 'motivo', '') = 'sin_sesion');
  -- Con sesión y sin la autorización de los extractos: nada.
  perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
  j := public.extracto_plataformas('nequi');
  insert into plataformas_prueba values ('sin_autorizacion', coalesce(j ->> 'motivo', '') = 'sin_autorizacion');
  -- Con la autorización: SOLO lo de la lista, en su orden, sin repetir. Lo
  -- demás (otra palabra, una etiqueta de página) no se guarda.
  j := public.extracto_autorizar('2026-11-24', null);
  j := public.extracto_plataformas(' LULO, Nequi,otra,nequi,bitcoin,<script>alert(1)</script>');
  insert into plataformas_prueba values ('solo_la_lista',
    coalesce((j ->> 'ok')::boolean, false) and coalesce(j ->> 'plataformas', '') = 'nequi,lulo,otra');
  j := public.extracto_plataformas_mias();
  insert into plataformas_prueba values ('las_mias',
    coalesce((j ->> 'ok')::boolean, false) and coalesce(j ->> 'plataformas', '') = 'nequi,lulo,otra');
  -- Lo que ve Joan (lo de adentro de la función de la clave).
  j := public.extracto_plataformas_interna('+57 ' || v_cel);
  insert into plataformas_prueba values ('la_de_joan',
    coalesce(j ->> 'celular', '') = v_cel and coalesce(j ->> 'plataformas', '') = 'nequi,lulo,otra');
  j := public.extracto_plataformas_interna(null);
  insert into plataformas_prueba values ('todas',
    exists (select 1 from jsonb_array_elements(j -> 'personas') p
             where p ->> 'celular' = v_cel and p ->> 'plataformas' = 'nequi,lulo,otra'));
  -- Desmarcarlas todas deja vacío.
  j := public.extracto_plataformas('');
  insert into plataformas_prueba values ('vaciar',
    coalesce((j ->> 'ok')::boolean, false) and coalesce(j ->> 'plataformas', 'x') = '');
  -- Retirar la autorización las borra; retirada, no guarda; y volver a firmar
  -- no las revive.
  j := public.extracto_plataformas('daviplata');
  j := public.extracto_retirar();
  insert into plataformas_prueba values ('retirar_las_borra',
    coalesce((select a.plataformas = '' from public.extracto_autorizaciones a where a.celular = v_cel), false));
  j := public.extracto_plataformas('nequi');
  insert into plataformas_prueba values ('retirada_no_guarda', coalesce(j ->> 'motivo', '') = 'sin_autorizacion');
  j := public.extracto_autorizar('2026-11-24', null);
  j := public.extracto_plataformas_mias();
  insert into plataformas_prueba values ('firmar_no_revive', coalesce(j ->> 'plataformas', 'x') = '');
  delete from public.extracto_autorizaciones a where a.celular = v_cel;
  delete from public.intentos_fallidos f where f.cedula = 'ex:' || v_cel;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- ====== 8. LO QUE JOAN VE: una fila por comprobación, todas en true ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
with cliente(firma) as (values
  ('public.extracto_plataformas(text)'), ('public.extracto_plataformas_mias()')),
joan(firma) as (values
  ('public.extracto_plataformas_de(text, text)')),
adentro(firma) as (values
  ('public.extracto_plataformas_limpia(text)'), ('public.extracto_plataformas_interna(text)'),
  ('public.extracto_plataformas_al_retirar()'))
select 1 as n, 'la columna existe, sin sitio para texto libre, y la tabla sigue cerrada a anon y authenticated' as comprobacion,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'extracto_autorizaciones' and column_name = 'plataformas')
       and exists (select 1 from pg_constraint where conname = 'extracto_plataformas_de_la_lista')
       and not exists (select 1 from information_schema.table_privileges
                        where table_schema = 'public' and table_name = 'extracto_autorizaciones'
                          and grantee in ('anon', 'authenticated', 'PUBLIC')) as ok
union all
select 2, 'decirlas y leerlas: solo la sesión del cliente (nunca anon)',
       (select bool_and(has_function_privilege('authenticated', firma, 'execute')
                        and not has_function_privilege('anon', firma, 'execute')) from cliente)
union all
select 3, 'verlas: solo con la clave de Joan (anon + clave), nunca con una sesión',
       (select bool_and(has_function_privilege('anon', firma, 'execute')
                        and not has_function_privilege('authenticated', firma, 'execute')) from joan)
union all
select 4, 'las de adentro no se le dan a nadie',
       (select bool_and(not has_function_privilege('anon', firma, 'execute')
                        and not has_function_privilege('authenticated', firma, 'execute')) from adentro)
union all
select 5, 'las que se llaman desde afuera son security definer con el search_path fijo',
       (select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%')
          from (select firma from cliente union all select firma from joan) f
          join pg_proc p on p.oid = f.firma::regprocedure)
union all
select 6, 'al retirar la autorización se borran (el disparador existe)',
       exists (select 1 from pg_trigger t where not t.tgisinternal and t.tgname = 'extracto_plataformas_al_retirar')
union all
-- coalesce: bool_and SALTA los null, y un paso sin respuesta saldría en true.
select 7, 'la prueba llamando: sin sesión y sin autorización no guarda; guarda solo lo de la lista; Joan las ve; retirar las borra y volver a firmar no las revive',
       (select count(*) = 10 and bool_and(coalesce(ok, false)) from plataformas_prueba)
union all
select 8, 'la prueba no dejó nada',
       not exists (select 1 from public.extracto_autorizaciones where celular = '3009991124')
       and not exists (select 1 from public.intentos_fallidos where cedula = 'ex:3009991124')
order by 1;


-- ========================================================================
-- PARTE 3 DE 4: 20261125_solicitudes_en_el_celular.sql
-- ========================================================================

-- ===========================================================================
-- LAS SOLICITUDES EN EL CELULAR — 25 de noviembre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor → New query → pegar TODO → Run.
-- Va DESPUÉS de 20260811_panel_nube.sql (de ahí sale panel_es_dueno) y de
-- 20261022d_el_equipo_con_la_clave_de_joan.sql. Es idempotente: crea o
-- reemplaza UNA función y vuelve a poner sus permisos. No crea tablas ni
-- columnas y no cambia ninguna función que ya exista.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema. Sin eso la función
-- contesta 404 aunque exista, y el celular sigue diciendo «tu base todavía no
-- tiene esta parte», que es lo que dice mientras esto no esté corrido.
--
-- LA PREGUNTA QUE CONTESTA
-- Joan quiere en el celular «toda la informacion que podria yo encontrar en
-- el crm del computador». La pestaña 📥 Solicitudes estaba tapada en el
-- teléfono: la bandeja se lee con listar_solicitudes_abiertas, y esa pide la
-- CLAVE DE SINCRONIZACIÓN del CRM (p_clave). El celular no la tiene y no debe
-- tenerla: entra con la sesión de Joan, como panel_traer y panel_registros.
--
-- POR QUÉ NO SE REUSA listar_solicitudes_abiertas CON OTRA PUERTA
-- Esa devuelve la fila ENTERA (setof public.solicitudes): la cuenta donde se
-- desembolsa, los datos declarados y el celular del gerente responsable. El
-- computador los necesita para responder; el teléfono solo MIRA, y un
-- teléfono se pierde en la calle. Esta función devuelve SOLO lo que la
-- tarjeta del celular pinta, campo por campo (el mismo criterio de
-- 20261002_panel_registros.sql).
--
-- LO QUE NUNCA SALE DE ACÁ
--   · destino_desembolso (la cuenta de banco o el Nequi de la persona).
--   · datos (lo que declaró: ingresos, dirección, referencias).
--   · responsable (el celular del gerente) ni el «por» entero de la propuesta:
--     de quién la mandó sale solo el TIPO (automatica, joan o gerente).
--   · La tasa, el costo y el total: para saber que alguien espera no hacen falta.
--
-- «PIDIÓ» ES LO QUE LA PERSONA PIDIÓ
-- capital es lo que se le PROPONE (nace con la propuesta automática y se pisa
-- con cada contrapropuesta). Lo que la persona pidió está en pedido_monto
-- (play/) o en pedido->>'capital' (PlataChat). Si no está, 'pedido_monto' sale
-- null y el celular dice «un crédito», sin inventarle una cifra. Es la misma
-- distinción que ya hace panel_registros.
--
-- EL RELOJ CORRE TAMBIÉN ACÁ
-- listar_solicitudes_abiertas llama a resolver_vencidas() antes de contestar
-- (20261005_platachat_solicitud.sql): «lo que Joan ve abierto es lo que de
-- verdad sigue abierto». El celular no puede mostrar como «te toca responder»
-- una solicitud que ya venció, así que hace lo mismo. Se llama con EXECUTE y
-- solo si existe: PL/pgSQL compila en la PRIMERA LLAMADA, y nombrarla
-- directamente dejaría esta función en verde al pegarla y muerta al usarla en
-- una base que no tenga ese archivo (ya costó trece días una vez).
--
-- COLUMNAS QUE PUEDEN NO ESTAR
-- Todo lo que no es de la tabla original (app, producto, celular, pedido…)
-- se lee con to_jsonb(s) ->> '...': si la columna no existe en la base de
-- verdad, sale null y la tarjeta no pinta esa parte.
--
-- CÓMO QUEDA PROTEGIDA, igual que panel_registros: security definer con el
-- search_path fijo, pregunta panel_es_dueno() en la primera línea, y los
-- permisos en dos tiempos (el revoke NOMBRA a anon y authenticated porque
-- Supabase les concede EXECUTE a cada función nueva de public por su cuenta).
-- ===========================================================================


-- ====== 0. LO QUE TIENE QUE ESTAR ANTES ======
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Falta base/20261022d_el_equipo_con_la_clave_de_joan.sql. Córrelo primero.';
  end if;
  if to_regprocedure('public.panel_es_dueno()') is null then
    raise exception 'Falta base/20260811_panel_nube.sql: sin panel_es_dueno() esta función no sabe quién es Joan. Córrelo primero.';
  end if;
  if to_regclass('public.solicitudes') is null then
    raise exception 'No existe public.solicitudes: corre primero base/supabase.sql.';
  end if;
end $$;


-- ====== 1. LA FUNCIÓN ======
create or replace function public.panel_solicitudes(p_limite integer default 100)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limite     integer;
  v_nuevas     integer := 0;
  v_aceptadas  integer := 0;
  v_propuestas integer := 0;
  v_filas      jsonb := '[]'::jsonb;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  -- El reloj, como en la bandeja del computador (ver la nota de arriba).
  if to_regprocedure('public.resolver_vencidas()') is not null then
    execute 'select public.resolver_vencidas()';
  end if;

  -- Con p_limite = 0 contesta solo cuántas hay: sirve para el número de la
  -- pestaña sin bajar los datos de nadie.
  v_limite := least(greatest(coalesce(p_limite, 100), 0), 200);

  select count(*) filter (where s.estado = 'nueva'),
         count(*) filter (where s.estado = 'aceptada'),
         count(*) filter (where s.estado = 'contrapropuesta')
    into v_nuevas, v_aceptadas, v_propuestas
    from public.solicitudes s
   where s.estado in ('nueva', 'contrapropuesta', 'aceptada');

  if v_limite > 0 then
    select coalesce(jsonb_agg(x.fila order by x.creada_en desc, x.id desc), '[]'::jsonb)
      into v_filas
      from (
        select s.id, s.creada_en,
               jsonb_build_object(
                 'id',          s.id,
                 'estado',      s.estado,
                 'creada_en',   s.creada_en,
                 'nombre',      left(s.nombre, 120),
                 -- La llave con la que entró: la cédula (app de socios) o el
                 -- celular (play/ y PlataChat guardan ahí el celular). El
                 -- teléfono la cruza con la cartera que ya tiene en memoria.
                 'llave',       s.cedula,
                 'celular',     to_jsonb(s) ->> 'celular',
                 'app',         coalesce(to_jsonb(s) ->> 'app', 'tugarantia'),
                 'producto',    coalesce(to_jsonb(s) ->> 'producto', 'quincenal'),
                 'plazo_meses', case when (to_jsonb(s) ->> 'plazo_meses') ~ '^[0-9]+$'
                                     then (to_jsonb(s) ->> 'plazo_meses')::integer end,
                 -- Lo que se le PROPONE hoy.
                 'capital',     s.capital,
                 'fecha_corte', s.fecha_corte,
                 'sobre_cupo',  s.sobre_cupo,
                 -- Lo que la persona PIDIÓ (null si no dijo una cifra).
                 'pedido_monto', coalesce(
                                   case when (to_jsonb(s) ->> 'pedido_monto') ~ '^[0-9]+$'
                                        then (to_jsonb(s) ->> 'pedido_monto')::bigint end,
                                   case when (to_jsonb(s) -> 'pedido' ->> 'capital') ~ '^[0-9]+$'
                                        then (to_jsonb(s) -> 'pedido' ->> 'capital')::bigint end),
                 'pedido_plazo', case when (to_jsonb(s) ->> 'pedido_plazo') ~ '^[0-9]+$'
                                      then (to_jsonb(s) ->> 'pedido_plazo')::integer end,
                 'pedido_nota',  left(to_jsonb(s) ->> 'pedido_nota', 140),
                 -- De la propuesta, solo quién la mandó reducido a su tipo.
                 'propuesta_por', case
                                    when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') like 'automatica%' then 'automatica'
                                    when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') = 'joan'            then 'joan'
                                    when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') like 'gerente%'     then 'gerente'
                                  end,
                 'aceptada_en',        to_jsonb(s) ->> 'aceptada_en',
                 'responder_antes_de', to_jsonb(s) ->> 'responder_antes_de',
                 'cuenta_sin_juntar',  coalesce(to_jsonb(s) ->> 'cuenta_sin_juntar', 'false') = 'true'
               ) as fila
          from public.solicitudes s
         where s.estado in ('nueva', 'contrapropuesta', 'aceptada')
         order by s.creada_en desc, s.id desc
         limit v_limite
      ) x;
  end if;

  return jsonb_build_object(
    -- La hora DEL SERVIDOR: el celular la pinta como «la nube contestó a las…»,
    -- y así no depende del reloj del teléfono.
    'servidor_ahora', now(),
    'nuevas',         v_nuevas,
    'aceptadas',      v_aceptadas,
    'propuestas',     v_propuestas,
    'solicitudes',    v_filas
  );
end
$$;


-- ====== 2. PERMISOS ======
revoke all on function public.panel_solicitudes(integer) from public, anon, authenticated;
grant execute on function public.panel_solicitudes(integer) to authenticated;
-- Y NUNCA a anon: la llave anon va escrita dentro de las páginas públicas, y lo
-- que se le concede a anon se le concede a internet. Tener sesión tampoco
-- alcanza: adentro se vuelve a preguntar panel_es_dueno().

notify pgrst, 'reload schema';


-- ====== 3. LA PRUEBA LLAMANDO, en la base de verdad ======
-- La función se LLAMA aquí mismo, porque PL/pgSQL no la compila al crearla.
-- Sin sesión tiene que negarse, y con la sesión de un dueño que YA exista en
-- panel_duenos (no se crea ninguno) tiene que contestar con la forma que el
-- celular espera y sin los campos que no deben salir. Si no hay ningún dueño
-- todavía, ese paso no corre y lo dice.
-- Lo único que puede moverse al llamarla es el reloj de las vencidas
-- (resolver_vencidas), el mismo que corre cada vez que el computador abre la
-- bandeja: la prueba no crea, no cambia ni borra ninguna solicitud por su cuenta.
-- La tabla de la prueba es temporal (muere con la conexión).
drop table if exists pg_temp.solicitudes_celular_prueba;
create temporary table solicitudes_celular_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_uid  uuid;
  j      jsonb;
  v_neg  boolean := false;
begin
  -- Sin sesión: se niega.
  perform set_config('request.jwt.claims', '', true);
  begin
    j := public.panel_solicitudes(1);
  exception when others then
    v_neg := sqlerrm = 'no autorizado';
  end;
  insert into solicitudes_celular_prueba values ('sin_sesion_se_niega', v_neg);

  -- Con una sesión que no es de un dueño: se niega.
  v_neg := false;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001125","role":"authenticated"}', true);
  begin
    j := public.panel_solicitudes(1);
  exception when others then
    v_neg := sqlerrm = 'no autorizado';
  end;
  insert into solicitudes_celular_prueba values ('quien_no_es_dueno_se_niega',
    v_neg or exists (select 1 from public.panel_duenos where uid = '00000000-0000-4000-8000-000000001125'));

  -- Con la sesión de un dueño que ya existe: contesta, con su forma.
  select uid into v_uid from public.panel_duenos order by creado_en limit 1;
  if v_uid is null then
    raise notice 'Todavía no hay ningún dueño en panel_duenos: la prueba con sesión no corre.';
    insert into solicitudes_celular_prueba values ('con_dueno_contesta', null), ('no_salen_los_campos_privados', null);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    j := public.panel_solicitudes(200);
    insert into solicitudes_celular_prueba values ('con_dueno_contesta',
      jsonb_typeof(j -> 'solicitudes') = 'array'
      and (j ->> 'nuevas') ~ '^[0-9]+$' and (j ->> 'aceptadas') ~ '^[0-9]+$' and (j ->> 'propuestas') ~ '^[0-9]+$'
      and (j ->> 'servidor_ahora') is not null
      and jsonb_array_length(j -> 'solicitudes') <= 200);
    insert into solicitudes_celular_prueba values ('no_salen_los_campos_privados',
      not exists (
        select 1 from jsonb_array_elements(j -> 'solicitudes') f
         where f ? 'destino_desembolso' or f ? 'datos' or f ? 'responsable' or f ? 'contrapropuesta'
            or f ? 'tasa' or f ? 'costo' or f ? 'total' or f ? 'pedido'));
    -- Y con el límite en cero, solo los números.
    j := public.panel_solicitudes(0);
    insert into solicitudes_celular_prueba values ('con_cero_solo_cuenta', jsonb_array_length(j -> 'solicitudes') = 0);
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- Permisos, comprobados y no supuestos.
insert into solicitudes_celular_prueba values
  ('cerrada_a_la_llave_publica', not has_function_privilege('anon', 'public.panel_solicitudes(integer)', 'execute')),
  ('abierta_con_sesion',         has_function_privilege('authenticated', 'public.panel_solicitudes(integer)', 'execute'))
on conflict (paso) do update set ok = excluded.ok;

-- Si algo salió en false, el archivo entero se deshace y lo dice.
do $$
declare v_mal text;
begin
  select string_agg(paso, ', ' order by paso) into v_mal from solicitudes_celular_prueba where ok is false;
  if v_mal is not null then
    raise exception 'FALLA la prueba de panel_solicitudes en: %. No quedó nada aplicado.', v_mal;
  end if;
  raise notice 'Listo: las solicitudes en el celular. Falta: Settings → API → Reload schema.';
end $$;

-- Lo que Joan ve al terminar: una fila por comprobación.
select paso as "comprobación",
       case when ok then 'bien' when ok is null then 'no corrió (todavía no hay dueño)' else 'FALLA' end as "resultado"
  from solicitudes_celular_prueba
 order by paso;


-- ========================================================================
-- PARTE 4 DE 4: 20261125b_el_chat_con_tu_sesion.sql
-- ========================================================================

-- ===========================================================================
-- EL CHAT, CON TU SESIÓN — 25 de noviembre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor → New query → pegar TODO → Run.
-- Va DESPUÉS de todo lo del chat (20260828b … 20261019b) y de
-- 20261022d_el_equipo_con_la_clave_de_joan.sql. Es idempotente: crea o
-- reemplaza ONCE funciones nuevas y vuelve a poner sus permisos. No crea
-- tablas ni columnas y NO cambia ninguna función que ya exista.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema.
--
-- LA PREGUNTA QUE CONTESTA
-- El chat del Panel en el bolsillo (clientes y equipo) solo funciona en un
-- teléfono que tenga guardada la CLAVE DE SINCRONIZACIÓN del computador. El
-- celular de Joan entra con su sesión (correo o celular, y contraseña) y no
-- tiene esa clave, así que hoy no puede leer ni contestar el chat desde la
-- calle. Los clientes escriben y nadie responde.
--
-- CÓMO SE RESUELVE, Y POR QUÉ NO SE COPIA NI UN CUERPO
-- Cada función del chat de Joan (chat_conversaciones, chat_de, chat_responder
-- y sus vecinas) empieza con clave_ok(p_clave). Aquí cada una recibe una
-- GEMELA `panel_…` que hace dos cosas y nada más:
--   1. pregunta panel_es_dueno() — la misma puerta de panel_traer;
--   2. llama a la función DE SIEMPRE, pasándole la clave que la base ya tiene
--      guardada en config_privada.
-- Así todo lo que la función de siempre hace (el canal del último mensaje, el
-- «visto», los topes de las fotos, el cortacircuito, el horario) sigue
-- viviendo en UN solo sitio. Copiar los cuerpos es cómo se pierde en silencio
-- un tope o un pg_sleep (pasó el 22-sep con chat_foto_sesion). Si mañana
-- cambia chat_de, la gemela cambia con ella sin tocar este archivo.
--
-- LA CLAVE NO SALE DE LA BASE. Las gemelas la leen adentro, después de saber
-- quién pregunta, y no la devuelven. No se crea ninguna función que la
-- entregue: se lee en línea en cada gemela, para que no exista nada que un
-- permiso mal puesto pueda dejar publicado.
--
-- LO QUE SE ACEPTA A CAMBIO, DICHO: clave_ok pone su contador en cero cada vez
-- que recibe la clave buena, y ahora también la recibe desde el celular de
-- Joan. Es lo mismo que ya pasa con el CRM abierto en el computador, que
-- pregunta cada 45 segundos. Y si el freno está puesto (más de 10 intentos
-- fallidos en 15 minutos, de alguien tanteando), las gemelas también reciben
-- el «no», igual que el computador: el celular lo dice con esas palabras.
--
-- LO QUE NO SE ABRE: chat_olvidar (borrar una conversación entera) sigue
-- siendo solo del computador. Aquí no tiene gemela.
--
-- CÓMO QUEDAN PROTEGIDAS: security definer con el search_path fijo, la
-- pregunta por el dueño en la primera línea, y permisos en dos tiempos (el
-- revoke NOMBRA a anon y authenticated porque Supabase les concede EXECUTE a
-- cada función nueva de public por su cuenta). Solo `authenticated`; nunca
-- `anon`, que es la llave que va escrita en las páginas públicas.
-- ===========================================================================


-- ====== 0. LO QUE TIENE QUE ESTAR ANTES ======
-- Se pregunta por la FIRMA exacta de cada función de siempre: PL/pgSQL no
-- compila al crear, así que una gemela que apunte a una firma que no existe
-- quedaría en verde aquí y muerta en el celular.
do $$
declare
  f text;
  falta text := '';
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Falta base/20261022d_el_equipo_con_la_clave_de_joan.sql. Córrelo primero.';
  end if;
  if to_regprocedure('public.panel_es_dueno()') is null then
    raise exception 'Falta base/20260811_panel_nube.sql: sin panel_es_dueno() estas funciones no saben quién es Joan. Córrelo primero.';
  end if;
  if to_regclass('public.config_privada') is null then
    raise exception 'No existe public.config_privada: corre primero base/supabase.sql.';
  end if;
  foreach f in array array[
    'public.chat_conversaciones(text)',
    'public.chat_de(text,text,bigint,text)',
    'public.chat_responder(text,text,text,text)',
    'public.chat_hilo_de_celular(text,text)',
    'public.chat_foto_panel(text,bigint)',
    'public.chat_foto_responder(text,text,text,text,text,text)',
    'public.equipo_chat_conversaciones(text)',
    'public.equipo_chat_de(text,text,bigint)',
    'public.equipo_chat_responder(text,text,text)',
    'public.equipo_foto_panel(text,bigint)',
    'public.equipo_foto_responder(text,text,text,text,text)'
  ] loop
    if to_regprocedure(f) is null then falta := falta || ' ' || f; end if;
  end loop;
  if falta <> '' then
    raise exception 'A tu base le faltan funciones del chat (o tienen otra forma):%. Corre primero los archivos del chat (base/20260922d, 20260922f, 20260922r, 20260922s, 20260923 y 20261019b) y vuelve a correr este.', falta;
  end if;
end $$;


-- ====== 1. LAS GEMELAS DEL CHAT CON CLIENTES ======
create or replace function public.panel_chat_conversaciones()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_conversaciones((select valor from public.config_privada where clave = 'clave_sync'));
end
$$;

create or replace function public.panel_chat_de(p_cedula text, p_desde bigint default 0, p_canal text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_de((select valor from public.config_privada where clave = 'clave_sync'), p_cedula, p_desde, p_canal);
end
$$;

create or replace function public.panel_chat_responder(p_cedula text, p_texto text, p_canal text default null)
returns bigint language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_responder((select valor from public.config_privada where clave = 'clave_sync'), p_cedula, p_texto, p_canal);
end
$$;

create or replace function public.panel_chat_hilo_de_celular(p_celular text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_hilo_de_celular((select valor from public.config_privada where clave = 'clave_sync'), p_celular);
end
$$;

create or replace function public.panel_chat_foto_panel(p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_foto_panel((select valor from public.config_privada where clave = 'clave_sync'), p_id);
end
$$;

create or replace function public.panel_chat_foto_responder(
  p_cedula text, p_imagen text, p_miniatura text default null, p_texto text default null, p_canal text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.chat_foto_responder((select valor from public.config_privada where clave = 'clave_sync'),
                                    p_cedula, p_imagen, p_miniatura, p_texto, p_canal);
end
$$;


-- ====== 2. LAS GEMELAS DEL CHAT CON EL EQUIPO ======
create or replace function public.panel_equipo_chat_conversaciones()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_chat_conversaciones((select valor from public.config_privada where clave = 'clave_sync'));
end
$$;

create or replace function public.panel_equipo_chat_de(p_celular text, p_desde bigint default 0)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_chat_de((select valor from public.config_privada where clave = 'clave_sync'), p_celular, p_desde);
end
$$;

create or replace function public.panel_equipo_chat_responder(p_celular text, p_texto text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_chat_responder((select valor from public.config_privada where clave = 'clave_sync'), p_celular, p_texto);
end
$$;

create or replace function public.panel_equipo_foto_panel(p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_foto_panel((select valor from public.config_privada where clave = 'clave_sync'), p_id);
end
$$;

create or replace function public.panel_equipo_foto_responder(
  p_celular text, p_imagen text, p_miniatura text default null, p_texto text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;
  return public.equipo_foto_responder((select valor from public.config_privada where clave = 'clave_sync'),
                                      p_celular, p_imagen, p_miniatura, p_texto);
end
$$;


-- ====== 3. PERMISOS ======
revoke all on function public.panel_chat_conversaciones()                          from public, anon, authenticated;
revoke all on function public.panel_chat_de(text, bigint, text)                    from public, anon, authenticated;
revoke all on function public.panel_chat_responder(text, text, text)               from public, anon, authenticated;
revoke all on function public.panel_chat_hilo_de_celular(text)                     from public, anon, authenticated;
revoke all on function public.panel_chat_foto_panel(bigint)                        from public, anon, authenticated;
revoke all on function public.panel_chat_foto_responder(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.panel_equipo_chat_conversaciones()                   from public, anon, authenticated;
revoke all on function public.panel_equipo_chat_de(text, bigint)                   from public, anon, authenticated;
revoke all on function public.panel_equipo_chat_responder(text, text)              from public, anon, authenticated;
revoke all on function public.panel_equipo_foto_panel(bigint)                      from public, anon, authenticated;
revoke all on function public.panel_equipo_foto_responder(text, text, text, text)  from public, anon, authenticated;

grant execute on function public.panel_chat_conversaciones()                          to authenticated;
grant execute on function public.panel_chat_de(text, bigint, text)                    to authenticated;
grant execute on function public.panel_chat_responder(text, text, text)               to authenticated;
grant execute on function public.panel_chat_hilo_de_celular(text)                     to authenticated;
grant execute on function public.panel_chat_foto_panel(bigint)                        to authenticated;
grant execute on function public.panel_chat_foto_responder(text, text, text, text, text) to authenticated;
grant execute on function public.panel_equipo_chat_conversaciones()                   to authenticated;
grant execute on function public.panel_equipo_chat_de(text, bigint)                   to authenticated;
grant execute on function public.panel_equipo_chat_responder(text, text)              to authenticated;
grant execute on function public.panel_equipo_foto_panel(bigint)                      to authenticated;
grant execute on function public.panel_equipo_foto_responder(text, text, text, text)  to authenticated;
-- Y NUNCA a anon. Tener sesión tampoco alcanza: adentro se pregunta panel_es_dueno().

notify pgrst, 'reload schema';


-- ====== 4. LA PRUEBA LLAMANDO, en la base de verdad ======
-- Las gemelas se LLAMAN aquí mismo, porque PL/pgSQL no las compila al crearlas.
--   · Sin sesión y con una sesión que no es de un dueño: las once se niegan.
--   · Con la sesión de un dueño que YA exista en panel_duenos (no se crea
--     ninguno): se piden las dos LISTAS de conversaciones, que solo leen.
-- Las que marcan «visto» o escriben (leer un hilo, responder, las fotos) NO se
-- llaman con datos de verdad: de esas se comprueba que existen con su firma y
-- sus permisos. La prueba no manda ningún mensaje ni marca nada como leído.
-- La tabla de la prueba es temporal (muere con la conexión).
drop table if exists pg_temp.chat_sesion_prueba;
create temporary table chat_sesion_prueba (paso text primary key, ok boolean);
do $prueba$
declare
  v_uid   uuid;
  j       jsonb;
  n_neg   integer := 0;
  n_neg2  integer := 0;
  q       text;
  LLAMADAS constant text[] := array[
    'select public.panel_chat_conversaciones()',
    'select public.panel_chat_de(''0'', 0, null)',
    'select public.panel_chat_responder(''0'', ''x'', null)',
    'select public.panel_chat_hilo_de_celular(''0'')',
    'select public.panel_chat_foto_panel(0)',
    'select public.panel_chat_foto_responder(''0'', ''x'', null, null, null)',
    'select public.panel_equipo_chat_conversaciones()',
    'select public.panel_equipo_chat_de(''0'', 0)',
    'select public.panel_equipo_chat_responder(''0'', ''x'')',
    'select public.panel_equipo_foto_panel(0)',
    'select public.panel_equipo_foto_responder(''0'', ''x'', null, null)'];
begin
  -- Sin sesión: las once se niegan ANTES de tocar nada (la pregunta por el dueño va primero).
  perform set_config('request.jwt.claims', '', true);
  foreach q in array LLAMADAS loop
    begin
      execute q;
    exception when others then
      if sqlerrm = 'no autorizado' then n_neg := n_neg + 1; end if;
    end;
  end loop;
  insert into chat_sesion_prueba values ('sin_sesion_se_niegan_las_once', n_neg = 11);

  -- Con una sesión que no es de un dueño: también.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001126","role":"authenticated"}', true);
  foreach q in array LLAMADAS loop
    begin
      execute q;
    exception when others then
      if sqlerrm = 'no autorizado' then n_neg2 := n_neg2 + 1; end if;
    end;
  end loop;
  insert into chat_sesion_prueba values ('quien_no_es_dueno_tampoco',
    n_neg2 = 11 or exists (select 1 from public.panel_duenos where uid = '00000000-0000-4000-8000-000000001126'));

  -- Con la sesión de un dueño que ya existe: las dos listas contestan.
  select uid into v_uid from public.panel_duenos order by creado_en limit 1;
  if v_uid is null then
    raise notice 'Todavía no hay ningún dueño en panel_duenos: la prueba con sesión no corre.';
    insert into chat_sesion_prueba values ('con_dueno_lista_de_clientes', null), ('con_dueno_lista_del_equipo', null);
  elsif not exists (select 1 from public.config_privada where clave = 'clave_sync' and length(valor) >= 12) then
    raise notice 'La base todavía no tiene clave de sincronización: las funciones de siempre contestan «clave incorrecta» y la prueba con sesión no corre.';
    insert into chat_sesion_prueba values ('con_dueno_lista_de_clientes', null), ('con_dueno_lista_del_equipo', null);
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    j := public.panel_chat_conversaciones();
    insert into chat_sesion_prueba values ('con_dueno_lista_de_clientes', j is not null and jsonb_typeof(j) in ('array', 'object'));
    j := public.panel_equipo_chat_conversaciones();
    insert into chat_sesion_prueba values ('con_dueno_lista_del_equipo', j is not null and jsonb_typeof(j) in ('array', 'object'));
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- Permisos, comprobados y no supuestos: ninguna abierta a la llave pública, todas con sesión.
insert into chat_sesion_prueba
select 'cerradas_a_la_llave_publica', not bool_or(has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^panel_(chat|equipo_chat|equipo_foto)_'
on conflict (paso) do update set ok = excluded.ok;
insert into chat_sesion_prueba
select 'abiertas_con_sesion_las_once', count(*) = 11 and bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^panel_(chat|equipo_chat|equipo_foto)_'
on conflict (paso) do update set ok = excluded.ok;
-- Y borrar una conversación entera NO quedó abierta por esta puerta.
insert into chat_sesion_prueba values
  ('borrar_la_conversacion_sigue_en_el_computador', to_regprocedure('public.panel_chat_olvidar(text)') is null)
on conflict (paso) do update set ok = excluded.ok;

-- Si algo salió en false, el archivo entero se deshace y lo dice.
do $$
declare v_mal text;
begin
  select string_agg(paso, ', ' order by paso) into v_mal from chat_sesion_prueba where ok is false;
  if v_mal is not null then
    raise exception 'FALLA la prueba del chat con tu sesión en: %. No quedó nada aplicado.', v_mal;
  end if;
  raise notice 'Listo: el chat con tu sesión. Falta: Settings → API → Reload schema.';
end $$;

-- Lo que Joan ve al terminar: una fila por comprobación.
select paso as "comprobación",
       case when ok then 'bien' when ok is null then 'no corrió (falta un dueño o la clave)' else 'FALLA' end as "resultado"
  from chat_sesion_prueba
 order by paso;


-- ========================================================================
-- EL RESUMEN: lo que ves al terminar. Todas las filas deben decir «bien».
-- («no corrió» solo puede salir en las dos últimas partes, y solo si todavía no
-- hay ningún dueño anotado en panel_duenos o la base no tiene clave.)
-- ========================================================================
select 1 as "parte", 'Extractos: la prueba llamando (10 pasos)' as "comprobación",
       case when (select count(*) = 10 and bool_and(coalesce(ok, false)) from extracto_prueba) then 'bien' else 'FALLA' end as "resultado"
union all
select 2, 'Plataformas: la prueba llamando (10 pasos)',
       case when (select count(*) = 10 and bool_and(coalesce(ok, false)) from plataformas_prueba) then 'bien' else 'FALLA' end
union all
select 3, 'Solicitudes en el celular: ' || paso, case when ok then 'bien' when ok is null then 'no corrió' else 'FALLA' end from solicitudes_celular_prueba
union all
select 4, 'Chat con tu sesión: ' || paso, case when ok then 'bien' when ok is null then 'no corrió' else 'FALLA' end from chat_sesion_prueba
union all
select 5, 'Las cuatro partes dejaron sus funciones',
       case when to_regprocedure('public.extracto_mia()') is not null
             and to_regprocedure('public.extracto_plataformas_mias()') is not null
             and to_regprocedure('public.panel_solicitudes(integer)') is not null
             and to_regprocedure('public.panel_chat_conversaciones()') is not null then 'bien' else 'FALLA' end
order by 1, 2;
