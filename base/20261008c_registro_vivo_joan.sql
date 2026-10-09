-- ===========================================================================
-- «REGISTRÁNDOSE AHORA», EN EL CRM DE JOAN — 8 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces. Después: Settings → API → «Reload schema».
-- Va DESPUÉS de base/20260919_asesor.sql (la tabla registro_en_vivo).
--
-- LA PREGUNTA QUE CONTESTA
-- Joan, el 8-oct, al quitar la tarjeta de «¿prefieres seguir solo o que un
-- asesor te acompañe?»: «no quiero que se pregunte eso, yo quiero siempre ver
-- desde mi CRM y poder guiar al cliente». play/ ya publica el avance de quien
-- se registra en registro_en_vivo (con el aviso del paso 1), pero la ÚNICA
-- función que lo leía, registro_vivo_mirar, se lo enseña a los ASESORES y solo
-- de gente que ya está en su cartera. Un cliente nuevo no está en la cartera
-- de nadie: lo publicado no lo veía nadie, y el aviso del paso 1 («nuestro
-- equipo puede ver en qué paso vas») era mentira. Las tres revisiones del
-- 8-oct lo marcaron.
--
-- QUÉ TRAE: UNA función nueva, registro_vivo_joan(p_clave), por la misma
-- puerta que listar_registros (la clave de sincronización del CRM; concedida a
-- anon, cerrada a authenticated). Devuelve a todos los que se están
-- registrando ahora —lo que no ha vencido—: celular, nombre, en qué paso van,
-- lo que llevan escrito de la lista blanca de play/ (nombres, apellidos,
-- documento, tipo, celular, correo, nacimiento) y la hora del último paso.
--
-- LO QUE NO DEVUELVE: LAS FOTOS. Desde hoy play/ ya no las publica en vivo
-- (las fotos de la cédula se autorizaron «para confirmar que soy yo», no para
-- que alguien las mire mientras la persona escribe), y si quedara alguna de
-- antes, vence sola a las dos horas. Para guiar a alguien por teléfono basta
-- saber en qué paso se quedó.
--
-- No toca ninguna función que ya exista y no cambia ni una fila al correrlo.
-- NUNCA `raise exception` después de la sección 0: el editor corre el archivo
-- en una transacción y eso deshace todo.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.registro_en_vivo') is null then
    raise exception 'Falta la tabla registro_en_vivo (base/20260919_asesor.sql). Córrela primero.';
  end if;
  if to_regprocedure('public.clave_ok(text)') is null then
    raise exception 'Falta public.clave_ok (base/supabase.sql). Córrelo primero.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. LO QUE VE JOAN
--
-- VOLÁTIL, NO STABLE: pasa por clave_ok, que escribe el freno contra la fuerza
-- bruta. PostgREST corre las stable en solo lectura (ver
-- 20260922c_verificacion_cedula.sql) y ahí clave_ok fallaría.
-- Cincuenta filas como mucho: son las de las últimas dos horas, y una lista
-- más larga que eso ya no es «quién se está registrando», es un ataque.
-- ---------------------------------------------------------------------------
create or replace function public.registro_vivo_joan(p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  filas jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'celular', x.celular, 'nombre', x.nombre,
           'paso', x.paso, 'de_pasos', x.de_pasos,
           -- La misma lista blanca de play/ (CAMPOS_QUE_SE_PUBLICAN), otra
           -- vez aquí: lo que una versión vieja de la página mandara de más
           -- no sale por esta puerta.
           'avance', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                        from jsonb_each(x.avance) as e(k, v)
                       where k in ('nombres', 'apellidos', 'documento', 'tipo_doc',
                                   'celular', 'correo', 'nacimiento')),
           'actualizado', x.actualizado) order by x.actualizado desc), '[]'::jsonb)
    into filas
    from (select * from public.registro_en_vivo
           where vence_en > now()
           order by actualizado desc
           limit 50) x;

  return jsonb_build_object('ok', true, 'gente', filas);
end
$$;

-- ---------------------------------------------------------------------------
-- 2. LOS PERMISOS
-- Supabase le concede EXECUTE a anon y authenticated en cada función nueva, y
-- «revoke ... from public» NO quita ese permiso: se revoca de los dos roles por
-- su nombre y se le da solo a anon (la puerta del CRM, con su clave).
-- ---------------------------------------------------------------------------
revoke all on function public.registro_vivo_joan(text) from public, anon, authenticated;
grant  execute on function public.registro_vivo_joan(text) to anon;

-- ---------------------------------------------------------------------------
-- 3. LA COMPROBACIÓN (solo avisos)
-- Se prueba LLAMANDO con una clave equivocada, que tiene que fallar, y se mira
-- que una sesión de cliente no la pueda llamar. Con la clave buena no se llama
-- aquí: el archivo no la conoce, y escribirla sería dejarla en el historial.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def  boolean;
  v_vol  char;
  v_bien boolean := false;
begin
  select p.prosecdef, p.provolatile into v_def, v_vol
    from pg_proc p
   where p.oid = to_regprocedure('public.registro_vivo_joan(text)');
  begin
    perform public.registro_vivo_joan('una-clave-que-no-es-la-buena');
  exception when others then
    v_bien := true;
  end;
  if v_def is distinct from true or v_vol is distinct from 'v' then
    raise notice 'FALLA: registro_vivo_joan no quedó como security definer y volátil. Mándale a Claude este aviso.';
  elsif not v_bien then
    raise notice 'FALLA GRAVE: registro_vivo_joan contestó con una clave equivocada.';
  elsif has_function_privilege('authenticated', 'public.registro_vivo_joan(text)', 'execute') then
    raise notice 'OJO: una sesión de cliente puede llamar registro_vivo_joan. Vuelve a correr la sección 2.';
  elsif not has_function_privilege('anon', 'public.registro_vivo_joan(text)', 'execute') then
    raise notice 'OJO: el CRM (anon) no puede llamar registro_vivo_joan. Vuelve a correr la sección 2.';
  else
    raise notice 'Listo: «Registrándose ahora» queda en el CRM (📥 Registrados). Falta: Settings → API → Reload schema.';
  end if;
end
$$;
