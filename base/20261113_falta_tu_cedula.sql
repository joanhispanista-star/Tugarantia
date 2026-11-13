-- ===========================================================================
-- FALTA TU CÉDULA: LA CUENTA SABE QUÉ FOTOS DE SU REGISTRO LLEGARON
-- 13 de noviembre de 2026. Rama v144-cedula.
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces: crea UNA función de solo lectura y le pone
-- sus permisos; no toca ninguna fila ni ninguna función que ya exista. Al
-- final sale UNA TABLA con una fila por comprobación y una columna «ok»:
-- todas tienen que decir true. Después: Settings → API → «Reload schema».
-- Para volver a mirar otro día sin cambiar nada:
-- base/comprobar_20261113_falta_tu_cedula.sql.
--
-- Va DESPUÉS de base/20261020_la_cedula_de_la_cuenta.sql (la columna
-- registro_archivos.documento y la autorización de datos sensibles en
-- registro_archivos_guardar) y de base/20261007_una_puerta.sql
-- (cuenta_de_celular). No depende del cortacircuito ni del freno de las fotos
-- del registro (rama registro-tope, sin aplicar): se puede correr antes o
-- después de ellos, porque no toca registro_archivos_guardar.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN (13-nov-2026)
--
-- «El cliente no puso la cédula al momento de registrarse: quiero que cuando
-- él solicite el crédito, o incluso antes, tenga un botón o una alerta que
-- diga que no ha subido la cédula o que la información está incompleta.»
-- El caso real: un registrado del 8-nov subió solo la selfie y escribió el
-- número del documento.
--
-- Y LO QUE NO SE PUEDE: la cédula NO es obligatoria (decisión de Joan del
-- 3-nov; Decreto 1377 de 2013, art. 6: ninguna actividad puede condicionarse
-- a que el titular entregue datos sensibles; legal/privacidad.html promete
-- «Es opcional de verdad»). La app AVISA y OFRECE subirla. Nunca frena una
-- solicitud ni una aceptación.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ HACE FALTA LA BASE
--
-- La app del cliente no tiene cómo saber qué fotos de su registro llegaron.
-- Las fotos viven en registro_archivos, que nadie lee con la llave pública ni
-- con la sesión; archivos_de_registro es de Joan (pide la clave de
-- sincronización y devuelve las imágenes). Y lo que el teléfono anotó al
-- registrarse (registros.datos.fotos_tomadas) no sirve para esto: lo escribió
-- el teléfono por la puerta sin sesión, y no dice lo que pasó DESPUÉS (la cola
-- que subió al día siguiente, o la foto que la base no aceptó).
--
-- QUÉ DEVUELVE mis_fotos_del_registro(), y nada más:
--   · ok:false si no hay sesión de cliente (celular_de_sesion() en null);
--   · registro: null si la cuenta no tiene un registro hecho alrededor de
--     cuando la abrió (la ventana de mi_registro: desde una hora antes de
--     abrir la cuenta). Un registro viejo de ese número —de otra persona, por
--     la invitación de agosto— no le dice nada a quien abrió la cuenta. Si lo
--     tiene: su estado ('nuevo', 'atendido', 'descartado'), si es de antes de
--     la cámara del registro (antes del 9-sep-2026, cuando se aplicó
--     20260908b: ese registro nunca pidió fotos) y si se registró con
--     pasaporte (una sola foto, como lo lee el CRM: esPasaporte);
--   · fotos: cedula_frente, cedula_reverso y selfie, cada una true o false.
--     Si la fila existe, y nada más: ni la foto, ni su tamaño, ni su fecha;
--   · cedula_con_codigo: si las fotos de cédula que ya tiene entraron con la
--     lectura del código de barras (registro_archivos.documento). La reja de
--     20261020 no deja que una foto sin lectura reemplace a esas (la devuelve
--     en `descartados`): con este dato la app no ofrece un botón que no va a
--     servir, y ofrece el chat;
--   · sensibles: si la cuenta tiene la autorización de datos sensibles, leída
--     de auth.users con la MISMA expresión que registro_archivos_guardar. Sin
--     ella la app pide ESE permiso, aparte, antes de la foto: la base
--     rechazaría la foto con 'sin_autorizacion'.
-- Nada de otra persona: todo sale del celular de la sesión.
--
-- «NO HAY FILA» QUIERE DECIR «NO LLEGÓ». Revisado el 13-nov-2026 en base/ y en
-- el CRM: ninguna función borra filas de registro_archivos salvo
-- borrar_cuenta_de_pruebas (20260922e, la de las cuentas de prueba). Abrir la
-- ficha, «👁 Ver datos» y traer las fotos (archivos_de_registro,
-- traerFotosTardias) solo LEEN. Lo que la base no sabe es lo que Joan recibió
-- por otro lado (el chat, WhatsApp) y pegó a mano en la ficha. Por eso la app,
-- en la cuenta junta, lo cruza con lo que dice la ficha (el paquete trae
-- perfil.datos.foto_cedula_frente / _reverso, sin la foto), y en la cuenta sin
-- juntar la tarjeta dice «si ya nos la mandaste por el chat, no tienes que
-- hacer nada».
--
-- LA SUBIDA NO ES NUEVA: la app usa registro_archivos_guardar con su sesión,
-- la misma función y los mismos tipos que play/, sin tocarla. Con el freno de
-- la rama registro-tope (12 fotos cada 15 minutos por cuenta) una o dos fotos
-- no lo tocan; si se cruza el freno o la tabla está llena, la respuesta trae
-- esas fotos en `en_espera` y la app lo dice con su motivo.
--
-- POR QUÉ «stable». Solo lee, y no pasa por clave_ok (que escribe el freno):
-- PostgREST la corre en solo lectura sin que nada reviente.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
-- Antes de crear nada. Si falta algo, se para aquí y no se crea nada. Como
-- todo lo que va después de 20261022d: si esa no está, se para. Este archivo
-- no la usa (la cédula la sube el cliente, no el equipo), pero correrlo antes
-- por error diría que el orden no importa (pruebas/el-lote-del-27-junto.test.js).
do $$
begin
  if to_regprocedure('public.celular_del_equipo_de_sesion()') is null then
    raise exception 'Primero corre base/20261022d_el_equipo_con_la_clave_de_joan.sql. Este archivo va después. No se tocó nada.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null then
    raise exception 'Falta public.celular_de_sesion (base/20260908_primer_credito.sql y base/20260910c_quien_soy.sql). No se tocó nada.';
  end if;
  if to_regprocedure('public.cuenta_de_celular(text)') is null then
    raise exception 'Falta public.cuenta_de_celular (base/20261007_una_puerta.sql). Córrela primero. No se tocó nada.';
  end if;
  if to_regprocedure('public.solo_digitos(text)') is null or to_regclass('public.registros') is null then
    raise exception 'Faltan public.registros o public.solo_digitos (base/supabase.sql). No se tocó nada.';
  end if;
  if to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)') is null
     or to_regclass('public.registro_archivos') is null then
    raise exception 'Falta registro_archivos_guardar o su tabla (base/20260908b_registro_archivos.sql y siguientes). No se tocó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'registro_archivos'
                    and column_name = 'documento') then
    raise exception 'Falta la columna registro_archivos.documento (base/20261020_la_cedula_de_la_cuenta.sql). Córrela primero. No se tocó nada.';
  end if;
end $$;

-- ====== 1. LA FUNCIÓN DE LA SESIÓN ======
-- La ventana del registro es la de mi_registro (20261007_una_puerta.sql,
-- 8-bis), escrita aquí y no llamada: mi_registro devuelve otra cosa, y si un
-- día cambia su ventana, esta tiene que seguir diciendo de qué registro habla.
-- El desempate por id es el de 20260922b (dos filas del mismo segundo).
create or replace function public.mis_fotos_del_registro()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cel        text;
  desde      timestamptz;
  v_estado   text;
  v_creado   timestamptz;
  v_tipo_doc text;
  v_hay_reg  boolean := false;
  v_tipos    text[];
  v_codigo   boolean;
  v_sens     boolean;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    return jsonb_build_object('ok', false);
  end if;

  select c.creada_en into desde from public.cuenta_de_celular(cel) c;

  select r.estado, r.creado_en, coalesce(r.datos ->> 'tipo_doc', '')
    into v_estado, v_creado, v_tipo_doc
    from public.registros r
   where right(public.solo_digitos(coalesce(r.telefono, '')), 10) = cel
     and r.creado_en >= coalesce(desde, now()) - interval '1 hour'
   order by r.creado_en desc, r.id desc
   limit 1;
  v_hay_reg := found;

  select coalesce(array_agg(distinct a.tipo), '{}'::text[]),
         coalesce(bool_or(a.tipo in ('cedula_frente', 'cedula_reverso')
                          and coalesce(a.documento, '') <> ''), false)
    into v_tipos, v_codigo
    from public.registro_archivos a
   where right(public.solo_digitos(coalesce(a.celular, '')), 10) = cel;

  select coalesce((u.raw_user_meta_data -> 'autorizacion' ->> 'sensibles') = 'true', false)
    into v_sens
    from auth.users u
   where u.id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'registro', case when v_hay_reg then jsonb_build_object(
        'estado', v_estado,
        'antes_de_la_camara', v_creado < timestamptz '2026-09-09 00:00:00-05',
        'pasaporte', v_tipo_doc = 'Pasaporte')
      else null end,
    'fotos', jsonb_build_object(
        'cedula_frente',  'cedula_frente'  = any(v_tipos),
        'cedula_reverso', 'cedula_reverso' = any(v_tipos),
        'selfie',         'selfie'         = any(v_tipos)),
    'cedula_con_codigo', coalesce(v_codigo, false),
    'sensibles', coalesce(v_sens, false));
end
$$;

-- ====== 2. LOS PERMISOS ======
-- Supabase le concede EXECUTE a anon y authenticated en CADA función nueva de
-- public, y «revoke ... from public» no lo quita: se revoca de los dos por su
-- nombre y se le devuelve solo a la sesión (la lección de 20260922c).
revoke all on function public.mis_fotos_del_registro() from public, anon, authenticated;
grant execute on function public.mis_fotos_del_registro() to authenticated;

notify pgrst, 'reload schema';

-- ====== 3. LLAMARLA UNA VEZ ======
-- PL/pgSQL compila el cuerpo en la PRIMERA LLAMADA (así vivió trece días rota
-- registro_archivos_guardar): se llama aquí, sin sesión, para que un error de
-- escritura salga hoy y no en el teléfono de un cliente. NUNCA raise exception
-- aquí: el editor corre el archivo en UNA transacción y eso revertiría lo de
-- arriba. Lo que falle se dice en los avisos y en la tabla de abajo.
do $$
declare j jsonb;
begin
  begin
    j := public.mis_fotos_del_registro();
    if (j ->> 'ok') = 'false' then
      raise notice 'mis_fotos_del_registro: sin sesión contesta ok:false, como debe.';
    else
      raise notice 'FALLA: mis_fotos_del_registro sin sesión contestó %', j;
    end if;
  exception when others then
    raise notice 'FALLA: mis_fotos_del_registro no corre: %', sqlerrm;
  end;
end $$;

-- ====== 4. LA TABLA PARA JOAN ======
-- El editor no muestra los avisos: esto sí. Todas las filas en true. Es la
-- misma consulta de base/comprobar_20261113_falta_tu_cedula.sql.
select 1 as n, 'La función existe y solo la llama una sesión de cliente (ni la llave pública)' as comprobacion,
       case when to_regprocedure('public.mis_fotos_del_registro()') is null then false
            else has_function_privilege('authenticated', 'public.mis_fotos_del_registro()', 'execute')
                 and not has_function_privilege('anon', 'public.mis_fotos_del_registro()', 'execute') end as ok
union all
select 2, 'Es de solo lectura, corre como dueña y con search_path fijo',
       coalesce((select p.provolatile = 's' and p.prosecdef
                        and coalesce(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
                   from pg_proc p where p.oid = to_regprocedure('public.mis_fotos_del_registro()')), false)
union all
select 3, 'No devuelve ninguna foto: solo si existe',
       coalesce((select position('imagen' in p.prosrc) = 0 and position('archivos_de_registro' in p.prosrc) = 0
                   from pg_proc p where p.oid = to_regprocedure('public.mis_fotos_del_registro()')), false)
union all
select 4, 'Sin sesión contesta ok:false (y compila)',
       case when to_regprocedure('public.mis_fotos_del_registro()') is null then false
            else coalesce((public.mis_fotos_del_registro() ->> 'ok') = 'false', false) end
union all
select 5, 'Lee la autorización de datos sensibles igual que la subida',
       coalesce((select position('''autorizacion'' ->> ''sensibles''' in p.prosrc) > 0
                   from pg_proc p where p.oid = to_regprocedure('public.mis_fotos_del_registro()')), false)
       and coalesce((select position('sin_autorizacion' in p.prosrc) > 0
                       from pg_proc p where p.oid = to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)')), false)
union all
select 6, 'La subida sigue siendo registro_archivos_guardar, solo con sesión',
       case when to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)') is null then false
            else has_function_privilege('authenticated', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute') end
order by 1;
