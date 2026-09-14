-- ===========================================================================
-- EL CORREO DE LA CUENTA NO SE CAMBIA — 14 de septiembre de 2026
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- EL AGUJERO, QUE ES HERMANO DEL DEL 10 DE SEPTIEMBRE
--
-- El 10-sep se blindó `celular_de_sesion()` para que solo aceptara un correo
-- con la forma EXACTA 57 + diez dígitos + @tugarantia.net. Eso cerró la puerta
-- de inventarse un correo raro AL REGISTRARSE.
--
-- Pero quedó otra, y aquel arreglo no la tocaba: GoTrue deja que cualquiera con
-- SU PROPIA sesión se cambie el correo con
--
--     PUT /auth/v1/user   {"email": "573001112233@tugarantia.net"}
--
-- usando la llave pública —que está en el código fuente de la página, como
-- tiene que estar— y su propio token. Ese endpoint no es hipotético: es el
-- mismo que usa el Panel para cambiarle la contraseña a alguien del equipo
-- (cambiarClave, en panel/crm.html).
--
-- Y este proyecto tiene la confirmación por correo APAGADA
-- (mailer_autoconfirm:true, comprobado hoy contra el proyecto), cosa que tiene
-- que estar así: los correos son sintéticos y no existen, nadie puede abrir un
-- mensaje en 573001112233@tugarantia.net. Sin esa confirmación, el cambio de
-- correo se aplica de una.
--
-- Resultado: un cliente cualquiera se cambiaba el correo al de otra persona y
-- PASABA A SER esa persona. Su cartera, sus solicitudes, su chat, y las FOTOS
-- DE SU CÉDULA. Exactamente el mismo daño que el agujero de septiembre 10, por
-- una puerta distinta.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ SE ARREGLA EN LA BASE Y NO EN LA PANTALLA
--
-- Porque la pantalla no es la que llama: la llamada la hace quien quiera, desde
-- la consola de su navegador, contra la API de Supabase. Cualquier defensa que
-- viva en el JavaScript de la página es una defensa que el atacante controla.
--
-- Un disparador sobre auth.users es lo único que está del lado correcto de la
-- reja. Y ademas cubre cualquier camino futuro que todavía no existe.
--
-- ---------------------------------------------------------------------------
-- QUÉ NO ROMPE
--
-- · Crear cuentas: /auth/v1/signup INSERTA, no actualiza. Sigue igual.
-- · Cambiar contraseña: actualiza encrypted_password, no email. Sigue igual.
-- · Ningún flujo de este proyecto cambia el correo de una cuenta. El correo
--   SALE del celular y el celular es la identidad: si cambiara, la persona
--   cambiaría — que es justo lo que no puede pasar.
--
-- Esto tiene una consecuencia de producto que hay que decir en voz alta: un
-- cliente que cambie de número de celular NO puede arreglarlo solo. Tiene que
-- pedírselo a Joan. Eso es a propósito — es el mismo motivo por el que un banco
-- no te deja cambiar tu documento desde la app.
-- ===========================================================================

create or replace function public.correo_no_se_cambia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    raise exception 'el correo de la cuenta no se cambia: es la identidad del socio'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists correo_fijo on auth.users;
create trigger correo_fijo
  before update of email on auth.users
  for each row execute function public.correo_no_se_cambia();

-- Nadie la llama desde afuera: la dispara la base.
revoke all on function public.correo_no_se_cambia() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth' and c.relname = 'users'
       and t.tgname = 'correo_fijo' and not t.tgisinternal) then
    raise exception 'no quedo puesto el disparador que fija el correo';
  end if;

  if has_function_privilege('anon', 'public.correo_no_se_cambia()', 'execute')
     or has_function_privilege('authenticated', 'public.correo_no_se_cambia()', 'execute') then
    raise exception 'correo_no_se_cambia quedo abierta desde afuera';
  end if;

  -- Y que el arreglo del 10-sep siga puesto: los dos se cuidan las espaldas.
  -- Sin aquel, este no basta (se entra con un correo raro desde el principio);
  -- sin este, aquel no basta (se entra bien y despues se cambia el correo).
  if (select prosrc from pg_proc
       where proname = 'celular_de_sesion'
         and pronamespace = 'public'::regnamespace) not like '%net$%' then
    raise exception 'falta correr base/20260910c_quien_soy.sql: los dos arreglos van juntos';
  end if;
end $$;
