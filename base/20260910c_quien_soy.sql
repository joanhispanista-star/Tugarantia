-- ===========================================================================
-- QUIÉN SOY, DE VERDAD — 10 de septiembre de 2026
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
-- Va después de 20260910_equipo_en_la_nube.sql.
--
-- ---------------------------------------------------------------------------
-- EL AGUJERO
--
-- `celular_de_sesion()` es el ÚNICO sitio donde este sistema decide quién eres.
-- De ahí salen tu rol, tu cartera, tus solicitudes y las fotos de tu cédula.
-- Y hasta hoy comprobaba el correo así:
--
--     if correo not like '57%@tugarantia.net' then return null; end if;
--     return substring(solo_digitos(split_part(correo,'@',1)) from 3);
--
-- El `%` de LIKE acepta CUALQUIER cantidad de caracteres, y el substring solo
-- quita los dos primeros. Después, las funciones buscan a la persona con
-- `where celular = right(cel, 10)`. Súmalo:
--
--     correo   570003172862539@tugarantia.net   ← pasa el LIKE
--     digitos  570003172862539
--     from 3   0003172862539
--     right 10 3172862539                       ← el celular de OTRA persona
--
-- Y crear esa cuenta no requiere nada: /auth/v1/signup está abierto con la
-- llave pública —que está en el código fuente de la página, como tiene que
-- estar— y el proyecto tiene la confirmación por correo apagada
-- (disable_signup:false, mailer_autoconfirm:true, comprobado hoy).
--
-- O sea: cualquiera que supiera un celular podía abrirse una cuenta a medida y
-- pasar por esa persona. Con eso se leía la cartera de un asesor, la solicitud
-- de un cliente, y —lo peor— las FOTOS DE LA CÉDULA de cualquiera que se haya
-- registrado por la app.
--
-- Nació el 8 de septiembre, con 20260908_primer_credito.sql.
--
-- ---------------------------------------------------------------------------
-- EL ARREGLO, Y POR QUÉ ES UNA SOLA FUNCIÓN
--
-- Seis funciones hacen `right(cel, 10)`. Se podrían arreglar las seis. No se
-- hace: todas derivan de esta, y si esta devuelve null ante un correo que no
-- sea EXACTAMENTE 57 + diez dígitos, ninguna de las seis puede ser engañada.
-- Reescribir seis cuerpos desde el repositorio —que puede haber derivado de lo
-- que de verdad está corriendo— es justo como se inventan defectos nuevos
-- arreglando uno viejo. Un cambio, en el único sitio que decide.
--
-- El `right(cel,10)` de las otras se queda, y ya no hace nada: `cel` mide diez.
-- Un cinturón que sobra no estorba.
--
-- Sigue siendo `stable` a propósito: solo lee auth.jwt(), no escribe nada. No
-- le aplica la regla del 25006 (esa es para las que pasan por clave_ok).
-- ===========================================================================

create or replace function public.celular_de_sesion()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare correo text;
begin
  correo := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  /* EXACTAMENTE 57 + diez dígitos + el dominio. Anclado a los dos extremos:
     sin el ^ y el $ , «570003172862539@tugarantia.net» también pasaría, que es
     el agujero que este archivo viene a tapar. */
  if correo !~ '^57[0-9]{10}@tugarantia\.net$' then
    return null;
  end if;
  /* Los diez dígitos, ya validados. No un substring de largo variable. */
  return substring(correo from 3 for 10);
end
$$;

-- Los permisos no cambian, pero `create or replace` no los toca y más vale
-- decirlo: la usan las funciones security definer, no el navegador.
revoke all on function public.celular_de_sesion() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'celular_de_sesion' and pronamespace = 'public'::regnamespace;
  if cuerpo is null then
    raise exception 'no existe celular_de_sesion';
  end if;
  if cuerpo like '%not like%' then
    raise exception 'celular_de_sesion sigue comprobando el correo con LIKE: el %% acepta cualquier cosa';
  end if;
  /* Sin el «\.» a propósito: en LIKE la barra invertida es el escape, así que
     buscar «\.» encontraría un punto pelado y esta comprobación fallaría con
     la función ya correcta. Con el ancla y el prefijo basta. */
  if cuerpo not like '%^57[0-9]{10}@tugarantia%' then
    raise exception 'celular_de_sesion no exige el formato exacto del correo';
  end if;
  /* Y anclada al FINAL: sin el $, «57xxxxxxxxxx@tugarantia.net.malo.com»
     también pasaría. «net$» solo aparece si el ancla está puesta. */
  if cuerpo not like '%net$%' then
    raise exception 'la expresion de celular_de_sesion no esta anclada al final';
  end if;
  if has_function_privilege('anon', 'public.celular_de_sesion()', 'execute')
     or has_function_privilege('authenticated', 'public.celular_de_sesion()', 'execute') then
    raise exception 'celular_de_sesion quedo abierta desde afuera';
  end if;
end $$;
