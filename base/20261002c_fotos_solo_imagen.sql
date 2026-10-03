-- ===========================================================================
-- LAS FOTOS DEL REGISTRO, SOLO IMAGEN — 2 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces (o diez): cada vez quita lo que puso la anterior y
-- lo vuelve a poner igual. No borra ni cambia ni una foto. No hace falta
-- «Reload schema»: no agrega nada que la app llame. Va DESPUÉS de
-- 20260908b_registro_archivos.sql y de 20260919_asesor.sql (si no, se para
-- arriba y dice cuál falta).
--
-- ---------------------------------------------------------------------------
-- EL HUECO QUE CIERRA
--
-- Las fotos del registro (la cédula por los dos lados y la selfie) llegan a
-- la base por dos puertas, y las dos revisaban solo que la cadena EMPEZARA por
-- «data:image/» y no pasara de 600.000 caracteres:
--   · registro_archivos_guardar (20260922c_verificacion_cedula.sql) → la
--     columna public.registro_archivos.imagen;
--   · registro_vivo_publicar (20260919_asesor.sql) → la columna jsonb
--     public.registro_en_vivo.fotos, lo que ve el asesor mientras acompaña.
-- Detrás de un prefijo bueno cabe cualquier cosa: una comilla y un guion. El
-- 1-oct el CRM dejó de pintar crudas esas fotos (fotoSegura, panel/crm.html),
-- que es la mitad de arriba. Esta es la de abajo: que la base no las guarde.
-- Es el mismo arreglo que ya tienen las fotos del chat desde el 22-sep
-- (20260922g_la_foto_comprobada_entera.sql), con el tope de las del registro.
--
-- LA REGLA, ENTERA, DE LA PRIMERA LETRA A LA ÚLTIMA:
--     data:image/ + (jpeg | jpg | png | webp) + ;base64, + solo base64 limpio
--     y como mucho 600.000 caracteres.
-- 600.000 y no los 400.000 del chat: es el tope que ya tenían las dos puertas
-- del registro, y una cédula a 900 px en JPEG puede pasar de 400.000. Copiar el
-- del chat dejaría fuera fotos buenas.
-- El ancla del final vale tanto como la del principio, y en PostgreSQL el
-- operador ~ no es sensible a saltos de línea: ^…$ sujeta la cadena entera.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ «NOT VALID»
--
-- Con NOT VALID la regla vale para TODO lo que se escriba desde hoy (cada
-- insert y cada update), pero no revisa las filas que ya están. Si hubiera una
-- foto vieja rara, la migración no revienta por ella. Para saber si hay
-- alguna (no cambia nada, solo cuenta):
--     select count(*) from public.registro_archivos
--      where not public.foto_de_registro_es_imagen(imagen);
-- Si da 0, se puede dejar la regla completa, también para las viejas:
--     alter table public.registro_archivos
--       validate constraint registro_archivos_solo_imagen;
--
-- QUÉ CAMBIA PARA UNA FOTO MALA. Antes la puerta se la saltaba y guardaba las
-- demás. Desde hoy, si alguien manda una «foto» con prefijo bueno y cola mala,
-- la base rechaza la llamada ENTERA (ni esa foto ni las otras de ese envío).
-- La app no puede caer ahí: el teléfono saca las fotos con
-- canvas.toDataURL('image/jpeg'), que produce exactamente la forma de arriba.
-- Solo cae quien arma la petición a mano.
--
-- LAS FUNCIONES DE LA BASE NO SE TOCAN. Ni registro_archivos_guardar ni
-- registro_vivo_publicar se reescriben (en esta casa, reescribir una función
-- ya aplicada copiando su cuerpo ya rompió cosas). Solo se agregan dos
-- funciones NUEVAS, chiquitas y puras, que usan las reglas de las tablas.
-- ===========================================================================


-- Sin las dos tablas no hay a qué ponerle la regla. Se para acá, con el
-- nombre del archivo que falta, en vez de reventar a la mitad.
do $$
begin
  if to_regclass('public.registro_archivos') is null then
    raise exception 'Falta base/20260908b_registro_archivos.sql: no existe la tabla de las fotos del registro. Córrelo primero.';
  end if;
  if to_regclass('public.registro_en_vivo') is null then
    raise exception 'Falta base/20260919_asesor.sql: no existe public.registro_en_vivo. Córrelo primero.';
  end if;
end
$$;


-- ---------------------------------------------- 1. la regla, una sola vez ---
-- Una sola definición para las dos tablas: dos copias de la misma regla son
-- una que se queda atrás (pasó con las fotos del chat el 22-sep).
-- Pura (immutable): no lee ninguna tabla, por eso puede ir dentro de un CHECK.
create or replace function public.foto_de_registro_es_imagen(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select p is not null
     and length(p) <= 600000
     and p ~ '^data:image/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'
$$;

-- La misma regla para la columna jsonb del registro en vivo: un objeto cuyos
-- valores son TODOS fotos que pasan la regla. Vacío, sí; null, sí (la columna
-- tiene su propio not null); cualquier otra forma, no.
create or replace function public.fotos_de_registro_son_imagen(p jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
           when p is null then true
           when jsonb_typeof(p) <> 'object' then false
           else not exists (
             select 1
               from jsonb_each(p) as e(k, v)
              where jsonb_typeof(e.v) <> 'string'
                 or not public.foto_de_registro_es_imagen(e.v #>> '{}'))
         end
$$;

-- Nadie de afuera las necesita: las usan las reglas de las tablas, y esas se
-- evalúan con el dueño de las funciones que escriben (security definer). El
-- revoke NOMBRA a anon y authenticated porque Supabase les concede EXECUTE a
-- cada función nueva por su cuenta (20260828c_permisos.sql).
revoke all on function public.foto_de_registro_es_imagen(text) from public, anon, authenticated;
revoke all on function public.fotos_de_registro_son_imagen(jsonb) from public, anon, authenticated;


-- --------------------------------------------- 2. las reglas de las tablas ---
-- Quitar y volver a poner: así correrlo dos veces deja lo mismo, y si algún
-- día cambia la regla, la nueva reemplaza a la vieja sin pasos a mano.
alter table public.registro_archivos drop constraint if exists registro_archivos_solo_imagen;
alter table public.registro_archivos
  add constraint registro_archivos_solo_imagen
  check (public.foto_de_registro_es_imagen(imagen)) not valid;

alter table public.registro_en_vivo drop constraint if exists registro_en_vivo_fotos_solo_imagen;
alter table public.registro_en_vivo
  add constraint registro_en_vivo_fotos_solo_imagen
  check (public.fotos_de_registro_son_imagen(fotos)) not valid;


-- ---------------------------------------------- 3. comprobado, no supuesto ---
-- Se le pregunta a la regla con fotos buenas y con los ataques de verdad. Sin
-- escribir ni una fila. Si algo no da, el editor revierte el archivo entero y
-- Joan ve el motivo.
do $$
declare
  buena text := 'data:image/jpeg;base64,' || repeat('A', 400) || '==';
begin
  if not public.foto_de_registro_es_imagen(buena) then
    raise exception 'FALLO: la regla rechaza una foto JPEG buena. No sigas: las fotos del registro dejarían de entrar.';
  end if;
  if not public.foto_de_registro_es_imagen('data:image/png;base64,AAAA')
     or not public.foto_de_registro_es_imagen('data:image/webp;base64,AAAA')
     or not public.foto_de_registro_es_imagen('data:image/jpg;base64,AAAA') then
    raise exception 'FALLO: la regla rechaza PNG, WEBP o JPG.';
  end if;
  -- El tope: 600.000 entra, uno más no.
  if not public.foto_de_registro_es_imagen('data:image/jpeg;base64,' || repeat('A', 600000 - 23)) then
    raise exception 'FALLO: una foto de 600.000 caracteres no entra, y es el tope de siempre del registro.';
  end if;
  if public.foto_de_registro_es_imagen('data:image/jpeg;base64,' || repeat('A', 600000 - 22)) then
    raise exception 'FALLO: entra una foto de más de 600.000 caracteres.';
  end if;
  -- Los ataques: prefijo bueno y cola mala.
  if public.foto_de_registro_es_imagen('data:image/png;base64,AAAA" onerror="alert(1)')
     or public.foto_de_registro_es_imagen('data:image/png;base64,AA"><script>x</script>')
     or public.foto_de_registro_es_imagen('data:image/png;base64,AAAA' || chr(10) || 'BBBB')
     or public.foto_de_registro_es_imagen('data:image/svg+xml;base64,PHN2Zz4=')
     or public.foto_de_registro_es_imagen('data:image/gif;base64,R0lGOD==')
     or public.foto_de_registro_es_imagen('data:image/jpeg;base64,')
     or public.foto_de_registro_es_imagen('data:text/html;base64,AAAA')
     or public.foto_de_registro_es_imagen('') then
    raise exception 'FALLO: la regla deja pasar algo que no es una foto.';
  end if;
  -- El registro en vivo.
  if not public.fotos_de_registro_son_imagen('{}'::jsonb)
     or not public.fotos_de_registro_son_imagen(jsonb_build_object('selfie', buena, 'cedula_frente', buena)) then
    raise exception 'FALLO: el registro en vivo rechaza fotos buenas.';
  end if;
  if public.fotos_de_registro_son_imagen(jsonb_build_object('selfie', 'data:image/png;base64,AA" x="'))
     or public.fotos_de_registro_son_imagen(jsonb_build_object('selfie', buena, 'otra', 'data:image/svg+xml;base64,AAAA'))
     or public.fotos_de_registro_son_imagen(jsonb_build_object('selfie', 12))
     or public.fotos_de_registro_son_imagen('[]'::jsonb) then
    raise exception 'FALLO: el registro en vivo deja pasar algo que no es una foto.';
  end if;
  -- Las dos reglas quedaron puestas en sus tablas.
  if not exists (select 1 from pg_constraint
                  where conname = 'registro_archivos_solo_imagen'
                    and conrelid = 'public.registro_archivos'::regclass) then
    raise exception 'FALLO: no quedó la regla en public.registro_archivos.';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'registro_en_vivo_fotos_solo_imagen'
                    and conrelid = 'public.registro_en_vivo'::regclass) then
    raise exception 'FALLO: no quedó la regla en public.registro_en_vivo.';
  end if;
  -- Y nadie de afuera las puede llamar.
  if has_function_privilege('anon', 'public.foto_de_registro_es_imagen(text)', 'execute')
     or has_function_privilege('anon', 'public.fotos_de_registro_son_imagen(jsonb)', 'execute') then
    raise exception 'FALLO: las funciones de la regla quedaron llamables con la llave pública.';
  end if;
  raise notice 'Listo: las fotos del registro solo entran si son imagen, enteras y de hasta 600.000 caracteres.';
end
$$;


-- ------------------------------------------------------ qué falta probar ---
--   1. Correrlo DOS VECES seguidas: la segunda no puede dar error.
--   2. Registrarse desde play/ con fotos: tienen que llegar las tres (en el
--      CRM, 📥 Registrados → 👁 Ver datos). Si no llegan, el aviso de la
--      subida en el teléfono lo dice; avísale a Claude con lo que diga.
--   3. Contar las viejas raras (la consulta de arriba, en «POR QUÉ NOT VALID»).
