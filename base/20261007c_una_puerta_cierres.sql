-- ===========================================================================
-- LOS CIERRES DE LA PUERTA ÚNICA — 7 de octubre de 2026 (segunda vuelta)
--
-- PARA JOAN: va JUSTO DESPUÉS de base/20261007_una_puerta.sql, el mismo día.
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run. Se puede
-- correr dos veces. Después: Settings → API → «Reload schema», y pega
-- base/20261007d_cierres_comprobar.sql para ver, renglón por renglón, que
-- quedó puesto DE VERDAD.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EXISTE
--
-- Tres revisiones probaron la puerta única en un PostgreSQL de verdad antes
-- de publicarla. Lo que encontraron en funciones que YA ESTÁN VIVAS en la base
-- (de antes del 7-oct) se cierra acá; lo que era de la puerta misma se
-- arregló en su propio archivo, que todavía no se había corrido.
--
--   1. LOS DATOS DEL REGISTRO DE OTRA PERSONA. solicitar_primer_credito y
--      solicitar_platachat copian a la solicitud el ÚLTIMO registro de ese
--      celular —el que sea, de cuando sea— y se lo devuelven al cliente
--      entero: cédula, dirección, referencias, nombre. Quien abría una cuenta
--      con el celular de alguien que se registró hace dos días (y cuyo signup
--      falló) recibía todo eso. Se cierra en dos sitios: al GUARDAR (un
--      disparador: solo se copia un registro hecho con esa cuenta, a una hora
--      de abrirla, como mi_registro) y al DEVOLVER (ninguna función del
--      cliente devuelve ya `datos` ni `registro_id`: son para Joan).
--   2. LA SOLICITUD DE UNA CUENTA SIN JUNTAR, PEGADA A UNA FICHA. Una cuenta
--      que Joan todavía no juntó puede pedir un crédito, y la solicitud queda
--      bajo su celular; el CRM la buscaba por cédula O por celular y se la
--      ponía a la ficha de ese número. Joan habría desembolsado a nombre de
--      Adriana lo que pidió quien registró su número. El disparador la marca
--      (cuenta_sin_juntar) y el CRM no la pega a ninguna ficha.
--   3. LA SUBIDA QUE MUDA LA UNIÓN A OTRA PERSONA. sincronizar_socios, al
--      cambiar de llave, rescata la unión de la fila vieja de ese celular sin
--      mirar de quién era: una ficha borrada en el Panel (su fila sigue
--      arriba, junta con su cuenta) y un número reciclado o un familiar que
--      sube con ese celular, y la cuenta del primero veía la ficha del
--      segundo. Desde hoy la unión —y el chat— solo viajan si la fila vieja es
--      de la misma persona (mismo_nombre, de 20261007_una_puerta.sql).
--   4. NINGUNA FICHA CON CÉDULA PODÍA SUBIR. sincronizar_socios deja
--      `propio` en NULL cuando no hay fila vieja con ese celular (un SELECT
--      INTO sin filas pone todo en NULL), y la columna codigo_propio no
--      acepta NULL: el pedazo entero de 25 fallaba. Con los códigos apagados
--      el CRM ya no manda nada que lo esquive. Se le quita el NOT NULL: un
--      NULL ahí se lee como «sin código propio», que con los códigos apagados
--      es la verdad de todos.
--
-- CÓMO SE TOCAN LAS FUNCIONES VIVAS: no se copian cuerpos. Se leen con
-- pg_get_functiondef y se les cambia lo justo con un patrón, y si el patrón no
-- está se dice FALTA y no se toca (el método de 20261002d: copiar cuerpos a
-- mano ya perdió cosas en silencio). Lo demás son piezas nuevas: un
-- disparador, una columna y dos ayudantes.
--
-- NUNCA `raise exception` después de la sección 0: el editor corre el archivo
-- en una transacción y eso deshace todo. Lo que falle se dice con FALTA/FALLA.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.vincular_interna(bigint, text, text, jsonb, text)') is null
     or to_regprocedure('public.mismo_nombre(text, text)') is null then
    raise exception 'Falta base/20261007_una_puerta.sql (la versión del 7-oct que compara el nombre). Córrelo primero.';
  end if;
  if to_regprocedure('public.cuenta_de_celular(text)') is null
     or to_regprocedure('public.celular_es_de_una_ficha(text)') is null then
    raise exception 'Falta base/20261007_una_puerta.sql (cuenta_de_celular). Córrelo primero.';
  end if;
  if to_regprocedure('public.sincronizar_socios(text, jsonb)') is null then
    raise exception 'Falta sincronizar_socios (base/20260914b_tres_canales.sql).';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. codigo_propio ACEPTA NULL (el punto 4 de la cabecera)
--
-- Se arregla en la columna y no en la función: así vale para cualquier
-- versión de sincronizar_socios que tenga la base (la de 20260909 y la de
-- 20260914b tienen el mismo SELECT INTO), sin reescribir ninguna.
-- Para saber si a tu base le pasaba: antes de correr esto,
--   select is_nullable from information_schema.columns
--    where table_name = 'socios_historial' and column_name = 'codigo_propio';
-- «NO» = ninguna ficha con cédula estaba subiendo.
-- ---------------------------------------------------------------------------
alter table public.socios_historial alter column codigo_propio drop not null;


-- ---------------------------------------------------------------------------
-- 2. LA SOLICITUD QUE PIDE UN CLIENTE CON SESIÓN (los puntos 1 y 2)
--
-- Un disparador ANTES de insertar, y no una reescritura de las cuatro
-- funciones que insertan (solicitar_primer_credito, play_solicitar,
-- solicitar_platachat, solicitar_por_sesion): lo que hacen bien no se toca, y
-- la que nazca mañana queda cubierta sin acordarse de esto.
--
-- Solo mira las que pide un CLIENTE (celular_de_sesion no es null). Las que
-- escribe Joan con su clave, o el servidor, pasan como venían.
--
--   (a) El registro copiado tiene que ser de ESTA cuenta: hecho a una hora de
--       abrirla, como mi_registro. Si no, se queda sin datos ni registro_id, y
--       si el nombre venía de ese registro, sin ese nombre (queda el que la
--       persona escribió al abrir su cuenta, o «Registrado»).
--   (b) Si la cuenta no está junta y su celular es de una ficha, la solicitud
--       nace marcada `cuenta_sin_juntar`: el CRM la muestra así y no la pega a
--       la ficha de ese número (decisión de Joan: el antiguo se junta con su
--       toque, nunca por un parecido).
-- Si algo falla adentro, falla CERRADO: sin datos y marcada. Mejor una
-- solicitud que Joan tiene que mirar a mano que una con los datos de otro.
-- ---------------------------------------------------------------------------
alter table public.solicitudes add column if not exists cuenta_sin_juntar boolean not null default false;
comment on column public.solicitudes.cuenta_sin_juntar is
  'La pidió una cuenta que Joan todavía no juntó y cuyo celular es de una ficha. El CRM no la pega a esa ficha (7-oct-2026).';

create or replace function public.solicitud_de_sesion_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cel   text;
  c_en  timestamptz;
  r_en  timestamptz;
  r_nom text;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    return new;
  end if;

  if new.registro_id is not null then
    begin
      select c.creada_en into c_en from public.cuenta_de_celular(cel) c;
      select r.creado_en, r.nombre into r_en, r_nom from public.registros r where r.id = new.registro_id;
      if c_en is null or r_en is null or r_en < c_en - interval '1 hour' then
        new.datos := '{}'::jsonb;
        new.registro_id := null;
        if r_nom is not null and new.nombre is not distinct from r_nom then
          new.nombre := coalesce(
            nullif(left(btrim(coalesce(auth.jwt() -> 'user_metadata' -> 'vinculacion' ->> 'nombres', '')), 80), ''),
            'Registrado');
        end if;
      end if;
    exception when others then
      new.datos := '{}'::jsonb;
      new.registro_id := null;
    end;
  end if;

  begin
    if not exists (select 1 from public.socios_historial s
                    where s.auth_vinculada_en is not null and s.auth_celular = cel)
       and public.celular_es_de_una_ficha(cel) then
      new.cuenta_sin_juntar := true;
    end if;
  exception when others then
    new.cuenta_sin_juntar := true;
  end;

  return new;
end
$$;

drop trigger if exists solicitud_de_sesion on public.solicitudes;
create trigger solicitud_de_sesion
  before insert on public.solicitudes
  for each row
  execute function public.solicitud_de_sesion_guarda();


-- ---------------------------------------------------------------------------
-- 3. LO QUE SE LE DEVUELVE AL CLIENTE, SIN `datos` NI `registro_id`
--
-- Las siete funciones que el cliente llama con su sesión y que contestan la
-- solicitud entera ('solicitud', to_jsonb(s)). La app no usa ninguno de los
-- dos campos (se miró en play/, PlataChat y app/ el 7-oct): son de Joan. El
-- disparador de arriba arregla lo que se guarda desde hoy; esto cubre además
-- las filas que ya estaban guardadas con los datos de otro.
-- Se agrega «- 'datos' - 'registro_id'» detrás de to_jsonb(s) (y detrás del
-- «- 'responsable'» que algunas ya tienen) y en ningún otro sitio.
-- ---------------------------------------------------------------------------
do $$
declare
  f       text;
  src     text;
  nueva   text;
  hechas  text := '';
  crudo   constant text := '''solicitud'',\s*to_jsonb\(s\)(\s*-\s*''responsable'')?\s*[,)]';
begin
  foreach f in array array['solicitar_primer_credito', 'mi_solicitud', 'aceptar_contrapropuesta',
                           'solicitar_platachat', 'mi_solicitud_platachat',
                           'aceptar_propuesta_platachat', 'reproponer_platachat'] loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p
     where p.proname = f and p.pronamespace = 'public'::regnamespace
     order by p.oid desc
     limit 1;
    if src is null then
      raise notice 'public.% no existe en esta base: nada que cerrar ahí.', f;
      continue;
    end if;
    if src !~ crudo then
      hechas := hechas || f || ' (ya estaba) ';
      continue;
    end if;
    nueva := regexp_replace(src,
      '(''solicitud'',\s*to_jsonb\(s\)(\s*-\s*''responsable'')?)(\s*[,)])',
      '\1 - ''datos'' - ''registro_id''\3', 'g');
    if nueva = src or nueva ~ crudo then
      raise notice 'FALTA: no pude quitarle datos y registro_id a % (el patrón no casó entero). NO se cambió: mándale a Claude pg_get_functiondef de esa función.', f;
      continue;
    end if;
    execute nueva;
    hechas := hechas || f || ' ';
  end loop;
  raise notice 'Solicitudes sin datos de registro hacia el cliente: %', hechas;
end
$$;


-- ---------------------------------------------------------------------------
-- 4. LA UNIÓN Y EL CHAT SOLO VIAJAN CON LA MISMA PERSONA (el punto 3)
--
-- sincronizar_socios, cuando una ficha estrena llave (le cargan la cédula),
-- hace dos cosas con la fila vieja de su celular: muda sus MENSAJES a la llave
-- nueva y RESCATA su unión con la cuenta. Desde hoy las dos piden que la fila
-- vieja sea de la misma persona (fila_vieja_es_de: no hay fila, o su nombre
-- casa con el que sube). Si no casa, la unión se suelta y queda anotada en
-- vinculos como deshecha «por la subida», con su porqué: Joan la ve en
-- «🔗 Cuentas juntas» y, si era la misma persona con el nombre cambiado, la
-- vuelve a juntar con su toque. Equivocarse hacia el «no» deja a un cliente
-- sin ver su historial un rato; hacia el «sí» le muestra a alguien la deuda
-- de otro.
-- ---------------------------------------------------------------------------
create or replace function public.fila_vieja_es_de(p_cel text, p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.socios_historial o where o.cedula = p_cel)
      or exists (select 1 from public.socios_historial o
                  where o.cedula = p_cel
                    and public.mismo_nombre(o.nombre, coalesce(p_nombre, 'Socio')))
$$;

create or replace function public.union_que_no_viaja(p_fila text, p_cel text, p_desde timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare txt constant text :=
  'Una subida de historiales trajo a OTRA persona con el celular de esta fila: la unión no viajó con ella.';
begin
  if p_cel is null then return; end if;
  update public.vinculos
     set deshecho_en = now(), deshecho_por = 'subida', motivo = coalesce(motivo, txt)
   where celular = p_cel and deshecho_en is null;
  if not found then
    insert into public.vinculos (cedula, celular, por, creado_en, deshecho_en, deshecho_por, motivo)
    values (p_fila, p_cel, 'codigo_viejo', coalesce(p_desde, now()), now(), 'subida', txt);
  end if;
end
$$;

do $$
declare
  src   text;
  paso1 text;
  nueva text;
begin
  select pg_get_functiondef('public.sincronizar_socios(text, jsonb)'::regprocedure) into src;

  if src ~ 'fila_vieja_es_de' then
    raise notice 'sincronizar_socios ya mira de quién es la fila vieja: no se cambió nada.';
    return;
  end if;

  -- (a) Los mensajes: «update public.mensajes set cedula = ident where cedula = cel;»
  paso1 := regexp_replace(src,
    '(update\s+public\.mensajes\s+set\s+cedula\s*=\s*ident\s+where\s+cedula\s*=\s*cel)(\s*;)',
    '\1 and public.fila_vieja_es_de(cel, item->>''nombre'')\2', '');

  -- (b) La unión: justo después del SELECT … INTO h_viejo, propio, v_en, v_cel.
  nueva := regexp_replace(paso1,
    '(into\s+h_viejo\s*,\s*propio\s*,\s*v_en\s*,\s*v_cel\s+from\s+public\.socios_historial\s+where\s+cedula\s*=\s*cel\s*;)',
    '\1
      -- 7-oct-2026 (base/20261007c): la unión solo viaja si la fila vieja es de la misma persona.
      if v_en is not null and not public.fila_vieja_es_de(cel, item->>''nombre'') then
        perform public.union_que_no_viaja(cel, v_cel, v_en);
        v_en  := null;
        v_cel := null;
      end if;', '');

  if paso1 = src or nueva = paso1 then
    raise notice 'FALTA: no encontré en sincronizar_socios % que esperaba. NO se cambió: una subida todavía puede mudar la unión de una fila vieja a otra persona. Mándale a Claude pg_get_functiondef(''public.sincronizar_socios(text,jsonb)'').',
      case when paso1 = src then 'el «update public.mensajes set cedula = ident where cedula = cel»'
           else 'el «into h_viejo, propio, v_en, v_cel … where cedula = cel»' end;
    return;
  end if;
  execute nueva;
  raise notice 'sincronizar_socios: la unión y el chat solo viajan con la misma persona.';
end
$$;


-- ---------------------------------------------------------------------------
-- 5. LOS PERMISOS. Todo lo nuevo es de adentro: nadie de afuera lo llama.
-- ---------------------------------------------------------------------------
revoke all on function public.solicitud_de_sesion_guarda()                from public, anon, authenticated;
revoke all on function public.fila_vieja_es_de(text, text)                from public, anon, authenticated;
revoke all on function public.union_que_no_viaja(text, text, timestamptz) from public, anon, authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 6. LA COMPROBACIÓN, LLAMANDO. Nunca `raise exception`: solo avisos.
--
-- El disparador se prueba sobre una tabla TEMPORAL con la forma de
-- solicitudes, no sobre la de verdad: una solicitud de prueba en la tabla de
-- verdad dispararía el aviso de PlataChat por Telegram. La temporal se borra
-- sola al terminar.
-- ---------------------------------------------------------------------------
do $prueba$
declare
  pasos  text := '';
  fallas text := '';
  r      record;
begin
  begin
    create temp table prueba_cierres_sol (like public.solicitudes including defaults) on commit drop;
    create trigger prueba_cierres before insert on prueba_cierres_sol
      for each row execute function public.solicitud_de_sesion_guarda();
    perform set_config('request.jwt.claims', '{"email":"573009997712@tugarantia.net"}', true);
    insert into prueba_cierres_sol (id, cedula, nombre, capital, tasa, costo, total, datos, registro_id)
    values (-1, '3009997712', 'Prueba', 1, 0, 0, 1, '{"documento":"123"}'::jsonb, -1)
    returning datos, registro_id, cuenta_sin_juntar into r;
    perform set_config('request.jwt.claims', '', true);
    if r.datos = '{}'::jsonb and r.registro_id is null and r.cuenta_sin_juntar = false then
      pasos := pasos || 'disparador ';
    else
      fallas := fallas || 'disparador(' || coalesce(r.datos::text, 'null') || ') ';
    end if;
    drop table prueba_cierres_sol;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    fallas := fallas || 'disparador(' || sqlerrm || ') ';
  end;

  begin
    if public.fila_vieja_es_de('0000000000', 'Nadie') then pasos := pasos || 'fila-vieja '; else fallas := fallas || 'fila-vieja '; end if;
  exception when others then fallas := fallas || 'fila-vieja(' || sqlerrm || ') ';
  end;

  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'socios_historial' and column_name = 'codigo_propio') = 'YES' then
    pasos := pasos || 'codigo-propio ';
  else
    fallas := fallas || 'codigo-propio ';
  end if;

  raise notice 'Cierres, llamando: %', pasos;
  if fallas <> '' then
    raise notice 'FALLA: %', fallas;
  end if;
  raise notice 'Listo. Falta: Settings → API → Reload schema, y pegar base/20261007d_cierres_comprobar.sql.';
end
$prueba$;
