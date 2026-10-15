-- =============================================================================
-- LA CLAVE DE ALGUIEN DEL EQUIPO, CUANDO SU CUENTA YA EXISTE — 15 de octubre de 2026
--
-- SQL Editor de Supabase → pegar TODO → Run. Idempotente.
--
-- POR QUÉ EXISTE. Joan quiso entrar como su gerente (Willian) y no pudo: la
-- cuenta existía desde el 10-sep, creada por el CRM, y la contraseña que Joan
-- volvió a «crear» después nunca se aplicó. «Crear cuenta» sobre una cuenta que
-- ya existe NO cambia la contraseña, y la pantalla terminaba en un callejón:
-- «para ponerle una contraseña nueva necesito la que tiene ahora; si no la
-- tienes, la única salida es que use otro celular». Para un gerente con 497
-- prospectos a su nombre, cambiar de celular no es una salida.
--
-- POR QUÉ NO ES UN BOTÓN DEL CRM. Todo lo que el CRM le pide a la base va con
-- la llave pública y, para lo de Joan, con su clave de sincronización. Esa
-- clave vive en los Ajustes de su navegador y ya quedó escrita una vez en una
-- conversación. 20261007c_una_puerta_cierres.sql cerró a propósito que con ella
-- se pudiera cambiar la contraseña de alguien del equipo, y lo vigila
-- 20261007d_cierres_comprobar. Un botón aquí la volvería a abrir.
-- Así que esto NO se le entrega a nadie: ni a la llave pública, ni a una
-- sesión, ni a la llave de servicio. Solo lo corre quien entra al editor SQL de
-- Supabase con su propia cuenta de Supabase, que es una credencial mucho más
-- fuerte. El CRM le arma la línea a Joan, Joan la pega, y después el CRM
-- comprueba contra Supabase Auth que la clave de verdad sirve.
-- (Revisado el 15-oct: la clave de sincronización todavía tiene OTROS caminos
-- hacia el equipo —borrar_cuenta_de_pruebas no mira public.equipo, y
-- equipo_publicar puede subir a alguien a gerente—. No los abre este archivo;
-- quedan anotados para cerrarlos aparte.)
--
-- LO QUE HACE, y lo que se niega a hacer:
--   · Solo para alguien que está en public.equipo y ACTIVO. Un cliente que no es
--     del equipo no se toca nunca por aquí: para eso está la clave nueva de la
--     puerta única, con sus propias rejas.
--   · Si la cuenta no existe, no la crea: dice que se cree desde el CRM. Si
--     está bloqueada o sin confirmar en Supabase Auth, tampoco: la clave nueva
--     no le serviría para entrar, y decir «Listo» sería mentir.
--   · La contraseña se guarda como la guarda Supabase Auth: bcrypt, con
--     extensions.crypt y gen_salt('bf'), como 20261007_una_puerta. Las dos van
--     con su esquema escrito y el search_path empieza por pg_catalog: así nadie
--     que pudiera crear una «crypt» en public la intercepta en claro.
--   · Cierra las sesiones abiertas de esa cuenta, y solo dice que las cerró si
--     de verdad pudo.
--   · Anota CUÁNDO y QUIÉN la corrió (session_user, no el dueño de la función),
--     nunca la contraseña.
-- =============================================================================

create table if not exists public.claves_equipo (
  id       bigint      generated always as identity primary key,
  celular  text        not null,
  cuando   timestamptz not null default now(),
  quien    text        not null default session_user
);
comment on table public.claves_equipo is
  'Cuándo se le cambió la contraseña a alguien del equipo desde el editor SQL (15-oct-2026). Nunca guarda la contraseña.';
alter table public.claves_equipo enable row level security;
revoke all on table public.claves_equipo from public, anon, authenticated;

create or replace function public.equipo_poner_clave(p_celular text, p_clave text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  cel      text;
  quien    public.equipo;
  correo   text;
  cuenta   jsonb;
  c_uid    uuid;
  cerradas boolean := true;
begin
  cel := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  if length(cel) = 12 and left(cel, 2) = '57' then cel := substr(cel, 3); end if;
  if cel !~ '^3[0-9]{9}$' then
    raise exception 'Ese celular no me cuadra: son 10 dígitos y empieza por 3. No se cambió nada.';
  end if;
  if p_clave is null or length(p_clave) < 8 then
    raise exception 'La contraseña necesita al menos 8 caracteres. No se cambió nada.';
  end if;

  select * into quien
    from public.equipo e
   where right(regexp_replace(coalesce(e.celular, ''), '\D', '', 'g'), 10) = cel
   limit 1;
  if not found then
    raise exception 'El celular % no es de nadie del equipo. Esta línea es solo para el equipo; no se cambió nada.', cel;
  end if;
  if quien.estado is distinct from 'activo' then
    raise exception '% está retirado del equipo. Reactívalo primero desde el CRM; no se cambió nada.', quien.nombre;
  end if;

  correo := '57' || cel || '@tugarantia.net';
  -- La fila entera como JSON: banned_until y email_confirmed_at existen en
  -- Supabase Auth, y preguntarlos así no rompe donde no existan.
  select to_jsonb(u) into cuenta from auth.users u where u.email = correo;
  if cuenta is null then
    raise exception '% todavía no tiene cuenta. Créala desde el CRM (Equipo → Crear cuenta); no se cambió nada.', quien.nombre;
  end if;
  c_uid := (cuenta ->> 'id')::uuid;
  if nullif(cuenta ->> 'banned_until', '') is not null and (cuenta ->> 'banned_until')::timestamptz > now() then
    raise exception 'La cuenta de % está bloqueada en Supabase Auth (Authentication → Users). Con una clave nueva tampoco podría entrar; no se cambió nada.', quien.nombre;
  end if;
  if cuenta ? 'email_confirmed_at' and nullif(cuenta ->> 'email_confirmed_at', '') is null then
    raise exception 'La cuenta de % quedó sin confirmar en Supabase Auth. Confírmala en Authentication → Users y vuelve a correr esta línea; no se cambió nada.', quien.nombre;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = c_uid;

  begin
    delete from auth.refresh_tokens where user_id::text = c_uid::text;
    delete from auth.sessions where user_id::text = c_uid::text;
  exception when others then
    cerradas := false;   -- la contraseña ya cambió; las sesiones viejas vencen solas en una hora
  end;

  insert into public.claves_equipo (celular, quien) values (cel, session_user);

  return 'Listo: ' || quien.nombre || ' ya puede entrar con su celular ' || cel ||
         ' y la contraseña nueva. ' ||
         case when cerradas then 'Las sesiones que tenía abiertas se cerraron.'
              else 'No pude cerrar sus sesiones abiertas: vencen solas en una hora.' end;
end
$$;

-- NADIE de afuera. `revoke ... from public` solo no basta en Supabase: sus
-- privilegios por defecto le dan EXECUTE a anon y a authenticated por separado
-- (la lección de quincena-chat: 28 funciones quedaron abiertas así). Y tampoco
-- a la llave de servicio: «solo desde el editor» tiene que ser literal.
revoke all on function public.equipo_poner_clave(text, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.equipo_poner_clave(text, text) from service_role';
    execute 'revoke all on table public.claves_equipo from service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
