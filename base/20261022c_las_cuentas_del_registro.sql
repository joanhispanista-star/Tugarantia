-- ===========================================================================
-- LAS CUENTAS DEL REGISTRO, AL ACEPTAR — 22 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces. Va después de
-- base/20261022b_destino_del_desembolso.sql y ANTES de publicar la web (los
-- dos). Al final sale una tabla: todos los
-- renglones tienen que decir ok = true. Después: Settings → API → «Reload
-- schema». Mándale a Claude la tabla.
--
-- 23-oct-2026 — SE LLAMABA 20261022b_las_cuentas_del_registro.sql, igual
-- que el del equipo. Al juntar las ramas del lote del 27-oct se renombraron
-- los cuatro del 22-oct para que el orden alfabético de base/ sea el orden en
-- que se corren: 20261022_la_foto…, 20261022b_destino…, ESTE (c) y, el
-- último, 20261022d_el_equipo_con_la_clave_de_joan.sql. No se necesita con
-- el de destino (cada uno sirve solo), pero así no hay que pensarlo. Al
-- renombrarlo no cambió nada de adentro; lo del 23-oct (sección 1b) es aparte.
--
-- Si la web sale antes que este archivo, no se rompe nada: al aceptar, la
-- pregunta «¿A dónde te consignamos?» sale con «Escribe tu cuenta» (sin las
-- del registro), como si no hubiera dado ninguna.
--
-- 23-oct-2026 — Y LA BANDEJA RECIBE LA CORRECCIÓN DEL MISMO REGISTRO (sección
-- 1b). María escribía su Nequi con un dígito cambiado, la bandeja lo guardaba,
-- el signup se caía, ella volvía al paso, lo corregía y volvía a tocar «Abrir
-- mi cuenta»: la bandeja contestaba ok SIN guardar nada (el atajo del 9-sep) y
-- la cuenta nacía con el mismo sello. Al aceptar se le ofrecía el Nequi viejo
-- («Nequi ···2233»: los cuatro últimos iguales, el error no se ve) y a Joan le
-- salía «Consignar a» con ese número. Ahora registrar_abierto y
-- registrar_abierto_app, cuando ya hay una fila 'nuevo' con ese celular Y EL
-- MISMO SELLO, le cambian SOLO las ocho llaves de pago. Por eso va en este
-- archivo y no en otro: la oferta (mis_cuentas_de_pago) y la corrección
-- llegan juntas o no llega ninguna.
--
-- ---------------------------------------------------------------------------
-- EL DEFECTO QUE ESTO CIERRA
--
-- El registro dice «Puedes dejar varias», y al aceptar la propuesta la
-- pantalla iba a ofrecer esas cuentas leyéndolas de solicitud.datos. Pero
-- mi_solicitud y mi_solicitud_platachat le QUITAN `datos` a lo que devuelven
-- desde el 7-oct (base/20261007c_una_puerta_cierres.sql, sección 3), así que
-- la lista salía siempre vacía: solo «Escribe tu cuenta», y María tenía que
-- volver a teclear un número que ya había dado bien, justo al aceptar.
--
-- POR QUÉ NO SE LE DEVUELVE `datos` A mi_solicitud (el arreglo obvio): ese
-- corte del 7-oct es a propósito y se queda. Los datos del registro los
-- escribe una puerta SIN sesión (registrar_abierto), y pueden ser de otra
-- persona: el riesgo D2 de base/20261020_la_cedula_de_la_cuenta.sql, que
-- sigue abierto. Quien sabe el celular de María escribe primero SU fila, con
-- SU Nequi; la de María no entra (se le contesta ok) y su solicitud copia la
-- de él. Ofrecerle a María «Nequi ···1234 · Recomendado» con ese Nequi sería
-- mandar la plata a donde ella no la pidió, con un toque.
--
-- LO QUE TRAE: mis_cuentas_de_pago(p_id). Con sesión, solo para la dueña de
-- la solicitud y solo mientras está en 'contrapropuesta' (las mismas rejas de
-- aceptar_condiciones). Devuelve SOLO las ocho llaves de pago
-- (app/cuentas-pago.js, LLAVES_DEL_REGISTRO), nunca `datos` entero, y SOLO SI
-- EL SELLO CASA: el teléfono pone 32 letras al azar en el registro (llave
-- `cuentas_sello`) que viajan a la bandeja Y a la cuenta (el signup, dentro de
-- `vinculacion`). Si el sello de la solicitud no es el de la cuenta que
-- pregunta, esa fila no la escribió el registro que abrió esta cuenta, y no se
-- devuelve nada: la pantalla pregunta «Escribe tu cuenta». El sello de la
-- cuenta se lee de auth.users (la cuenta) y no del token.
--
-- Lo que NO cambia: mi_solicitud, mi_solicitud_platachat y las aceptaciones
-- siguen sin devolver `datos`; el CRM de Joan sigue leyendo las cuentas de la
-- bandeja; solicitudes sigue con RLS y sin políticas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.celular_de_sesion()') is null
     or to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'Falta la identidad de la sesión (celular_de_sesion y llave_de_sesion: base/20260910c_quien_soy.sql y base/20260914b_tres_canales.sql). No se tocó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'datos') then
    raise exception 'solicitudes no tiene la columna datos. No se tocó nada: avísale a Claude.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. LAS CUENTAS DE PAGO DE MI SOLICITUD, SI EL REGISTRO ES DE ESTA CUENTA
-- ---------------------------------------------------------------------------
create or replace function public.mis_cuentas_de_pago(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  cel          text;
  llave        text;
  s            public.solicitudes;
  sello_cuenta text;
  sello_sol    text;
  k            text;
  cuentas      jsonb := '{}'::jsonb;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;
  llave := public.llave_de_sesion(cel);

  -- La dueña, y solo con una propuesta delante: es lo único para lo que la
  -- pantalla las necesita (la pregunta antes del «Acepto»).
  select * into s from public.solicitudes
   where id = p_id and estado = 'contrapropuesta'
     and (cedula = cel or celular = cel or cedula = llave);
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_esta');
  end if;

  -- El sello de la CUENTA (lo puso su signup) contra el de la fila que copió
  -- la solicitud. Treinta y dos letras o más: uno corto o vacío no prueba nada.
  select u.raw_user_meta_data -> 'vinculacion' ->> 'cuentas_sello' into sello_cuenta
    from auth.users u
   where u.id = auth.uid();
  sello_sol := coalesce(s.datos, '{}'::jsonb) ->> 'cuentas_sello';
  if coalesce(length(sello_cuenta), 0) < 32 or sello_sol is distinct from sello_cuenta then
    return jsonb_build_object('ok', true, 'cuentas', '{}'::jsonb);
  end if;

  -- Solo las ocho de pago. Lo demás del registro (documento, dirección,
  -- referencias) sigue sin salir hacia el teléfono.
  foreach k in array array['nequi', 'daviplata', 'llave_breb', 'banco', 'banco_codigo',
                           'banco_tipo', 'banco_numero', 'cuentas_mias'] loop
    if btrim(coalesce(s.datos ->> k, '')) <> '' then
      cuentas := cuentas || jsonb_build_object(k, left(s.datos ->> k, 200));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'cuentas', cuentas);
end
$$;

comment on function public.mis_cuentas_de_pago(bigint) is
  '22-oct-2026: las cuentas de pago que la clienta dio al registrarse, para «¿A dónde te consignamos?». '
  'Solo la dueña, solo en contrapropuesta, solo si el sello del registro (datos.cuentas_sello) es el de su cuenta.';


-- ---------------------------------------------------------------------------
-- 1b. LA BANDEJA RECIBE LA CORRECCIÓN DE LAS CUENTAS, SOLO CON EL SELLO
--     23-oct-2026
--
-- El atajo del 9-sep («si ya hay una fila 'nuevo' con ese celular, no se
-- toca») se queda: sin sesión, cualquiera que sepa tu celular podría cambiar
-- lo que Joan está a punto de mirar. Lo que se agrega es una rama `else` que
-- cambia SOLO las ocho llaves de pago de esa fila, y SOLO si el registro que
-- llega trae el MISMO sello que la fila (32 letras al azar que nacen en el
-- teléfono de quien se registró; nadie más las tiene). El resto de la fila
-- (documento, nombre, dirección, referencias) sigue sin tocarse, como antes.
--
-- Cómo se cambia: no se copia el cuerpo de la función (así se pierden frenos
-- en silencio). Se lee la definición viva, se le agrega la rama después del
-- insert del atajo de base/20261020_la_cedula_de_la_cuenta.sql, y si eso no
-- se encuentra, se para y se dice. Si ya tiene la rama, no se toca.
-- ---------------------------------------------------------------------------
do $$
declare
  f      regprocedure;
  nombre text;
  cola   text;
  cuerpo text;
  src    text;
  nueva  text;
  -- La rama que se agrega: la misma en las dos puertas.
  rama   constant text := $r$
  else
    -- 23-oct-2026 (base/20261022c_las_cuentas_del_registro.sql, 1b) — LA
    -- CORRECCIÓN DE LAS CUENTAS DEL MISMO REGISTRO. Quien corrige su Nequi
    -- después de un primer «Abrir mi cuenta» a medias llega aquí con su fila
    -- ya puesta: sin esto el Nequi corregido no quedaba en ninguna parte y al
    -- aceptar se le ofrecía el viejo. Solo las ocho llaves de pago, y solo con
    -- el sello de la fila: lo demás sigue como lo dejó el primero.
    update public.registros r
       set datos = (coalesce(r.datos, '{}'::jsonb)
                     - array['nequi', 'daviplata', 'llave_breb', 'banco', 'banco_codigo',
                             'banco_tipo', 'banco_numero', 'cuentas_mias'])
                   || coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(limpio) e
                                 where e.key = any (array['nequi', 'daviplata', 'llave_breb', 'banco', 'banco_codigo',
                                                          'banco_tipo', 'banco_numero', 'cuentas_mias'])), '{}'::jsonb)
     where r.estado = 'nuevo'
       and r.telefono = cel
       and length(coalesce(limpio ->> 'cuentas_sello', '')) >= 32
       and r.datos ->> 'cuentas_sello' = limpio ->> 'cuentas_sello';
  end if;$r$;
begin
  foreach nombre in array array['registrar_abierto', 'registrar_abierto_app'] loop
    -- `cola`: el final del insert del atajo (el `end if` va aparte, abajo).
    if nombre = 'registrar_abierto' then
      f := to_regprocedure('public.registrar_abierto(text, text, text, jsonb)');
      cola := $p$'abierto'\);$p$;
    else
      f := to_regprocedure('public.registrar_abierto_app(text, text, text, jsonb, text)');
      cola := $p$'abierto',\s*v_app\);$p$;
    end if;
    if f is null then
      if nombre = 'registrar_abierto' then
        raise exception 'Falta registrar_abierto (base/20260909_una_sola_puerta.sql). No se tocó nada.';
      end if;
      raise notice 'registrar_abierto_app no existe (PlataChat sin aplicar): no hay puerta que cambiar ahí.';
      continue;
    end if;
    select p.prosrc into cuerpo from pg_proc p where p.oid = f;
    if position('cuentas_sello' in cuerpo) > 0 then
      raise notice '% ya recibe la corrección de las cuentas con el sello: no se cambió nada.', nombre;
      continue;
    end if;
    -- La rama va después del atajo de 20261020 (solo por teléfono). Sin él,
    -- no se sabe qué tiene la función: se para.
    if position('cedula_repetida_al_registrarse' in cuerpo) = 0 then
      raise exception '% no tiene el atajo de base/20261020_la_cedula_de_la_cuenta.sql. Córrelo primero. No se tocó nada.', nombre;
    end if;
    if (select count(*) from regexp_matches(cuerpo, cola || $p$\s+end\s+if;$p$, 'g')) <> 1 then
      raise exception 'No encontré UNA sola vez en % el final del atajo («''abierto''…); end if;»). Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.', nombre;
    end if;
    -- La rama va entre el insert y su `end if` (que la rama trae consigo).
    src := pg_get_functiondef(f);
    nueva := regexp_replace(src, '(' || cola || $p$)\s+end\s+if;$p$, '\1' || rama, '');
    if nueva = src then
      raise exception 'No pude agregarle la rama a %: no se tocó nada. Avísale a Claude.', nombre;
    end if;
    execute nueva;
    raise notice '% ya recibe la corrección de las cuentas de pago con el sello del mismo registro.', nombre;
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 2. LOS PERMISOS
--
-- Supabase le da EXECUTE a anon y authenticated a cada función nueva: primero
-- se le quita a todos y después se da solo a la sesión.
-- ---------------------------------------------------------------------------
revoke all on function public.mis_cuentas_de_pago(bigint) from public, anon, authenticated;
grant  execute on function public.mis_cuentas_de_pago(bigint) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 3. ¿QUEDÓ? — solo mira, no cambia nada. Todos los renglones en true.
-- ---------------------------------------------------------------------------
select 1 as n, 'Las cuentas del registro existen y corren como dueño (security definer)' as que,
       coalesce((select p.prosecdef from pg_proc p
                  where p.oid = to_regprocedure('public.mis_cuentas_de_pago(bigint)')), false) as ok
union all
select 2, 'Solo con sesión: el cliente sí, sin sesión no',
       case when to_regprocedure('public.mis_cuentas_de_pago(bigint)') is null then false
            else has_function_privilege('authenticated', 'public.mis_cuentas_de_pago(bigint)', 'execute')
                 and not has_function_privilege('anon', 'public.mis_cuentas_de_pago(bigint)', 'execute') end
union all
select 3, 'Sin sesión no devuelve ninguna cuenta',
       case when to_regprocedure('public.mis_cuentas_de_pago(bigint)') is null then false
            else not coalesce((public.mis_cuentas_de_pago(0) ->> 'ok')::boolean, false)
                 and public.mis_cuentas_de_pago(0) -> 'cuentas' is null end
union all
select 4, 'Pide el sello del registro (no devuelve datos de otra persona)',
       coalesce(position('cuentas_sello' in pg_get_functiondef(to_regprocedure('public.mis_cuentas_de_pago(bigint)'))) > 0, false)
union all
select 5, 'mi_solicitud sigue SIN devolver los datos del registro (el corte del 7-oct)',
       coalesce(position('''datos''' in pg_get_functiondef(to_regprocedure('public.mi_solicitud()'))) > 0, false)
union all
select 6, 'solicitudes sigue con RLS (todo entra y sale por funciones)',
       coalesce((select relrowsecurity from pg_class where oid = 'public.solicitudes'::regclass), false)
union all
-- 23-oct-2026 (1b) — la corrección entra solo con el sello, y el atajo del
-- 20-oct (solo por teléfono, sin pisar la fila) sigue en su sitio.
select 7, 'La bandeja recibe la corrección de las cuentas de pago, solo con el sello del mismo registro',
       coalesce((select p.prosrc ~ $p$r\.datos ->> 'cuentas_sello' = limpio ->> 'cuentas_sello'$p$
                    and position('cedula_repetida_al_registrarse' in p.prosrc) > 0
                    and p.prosrc ~ $p$estado\s*=\s*'nuevo'\s+and\s+telefono\s*=\s*cel\s*\)\s*then$p$
                  from pg_proc p where p.oid = to_regprocedure('public.registrar_abierto(text, text, text, jsonb)')), false)
union all
select 8, 'La de PlataChat, igual (o PlataChat sin aplicar)',
       case when to_regprocedure('public.registrar_abierto_app(text, text, text, jsonb, text)') is null then true
            else coalesce((select p.prosrc ~ $p$r\.datos ->> 'cuentas_sello' = limpio ->> 'cuentas_sello'$p$
                             and position('cedula_repetida_al_registrarse' in p.prosrc) > 0
                             and p.prosrc ~ $p$estado\s*=\s*'nuevo'\s+and\s+telefono\s*=\s*cel\s*\)\s*then$p$
                           from pg_proc p where p.oid = to_regprocedure('public.registrar_abierto_app(text, text, text, jsonb, text)')), false) end
order by 1;
