-- ===========================================================================
-- PLATACHAT, FASE 1a — EL EQUIPO QUE CONTESTA, Y EL HORARIO EN LA BASE
-- 23 de septiembre de 2026
-- (revisada el 14-sep-2026 tras la auditoría adversaria: el autor 'equipo',
--  la persona por su id y no por su llave, el motivo honesto fuera de horario;
--  y el 26-sep-2026: fuera los comprobantes, y el check de autores se añade
--  sin pisar lo que esté vivo — ver cada sección)
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
-- Va DESPUÉS de 20260921_platachat_app.sql. Si falta 20260914b (la llave del
-- hilo y el candado), este archivo ABORTA en la primera línea y lo dice.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «que se vea segmentado en dos aplicaciones plataChat y TuGarantia y que yo
--  pueda revisar como le va a cada aplicacion»
-- «un sistema de ventas y cobranza dentro del mismo CRM»
--
-- ---------------------------------------------------------------------------
-- QUÉ PROTEGE CADA PIEZA
--
--   · El autor 'equipo' en `mensajes.de`: el gerente y el asesor no son Joan
--     ('panel') ni una máquina ('auto', 'agente'). Sin un valor propio, sus
--     respuestas se pintaban como automáticas (sección 1).
--   · `chat_responder_equipo`: el gerente o el asesor contesta desde su
--     celular, con sesión y SOLO a gente de su alcance (la misma reja de
--     gestion_anotar: el último dueño de la persona en asignaciones tiene que
--     estar en mi_alcance). Recibe el ID de la persona en la cartera, nunca
--     una cédula ni la llave del hilo: la llave la resuelve la base. Deja
--     rastro en `contactos` con canal 'app' —el check ya lo admitía desde
--     20260911 y nadie lo escribía— para que el control de calidad del gerente
--     vea el chat junto al WhatsApp y las llamadas.
--   · EL HORARIO DE LA LEY 2300, EN LA BASE. Un mensaje de cobranza fuera de
--     horario es una infracción que le cae a Joan en persona (la ley le aplica
--     a él, no a una empresa). Hoy el horario vive solo en la pantalla de
--     crm.html, que pinta una caja y no bloquea, y el gerente ni siquiera abre
--     esa pantalla. Acá se decide en el servidor: lunes a viernes 7:00–19:00,
--     sábados 8:00–15:00, nunca domingo ni festivo, hora de Colombia. Fuera de
--     horario NO se escribe nada y se contesta por qué. Solo aplica al canal
--     'cobranza': servicio y créditos son conversaciones que el cliente pidió.
--   · `festivos_colombia`: la lista de festivos que ese horario consulta. Se
--     siembra desde MotorReglas.esFestivo (app/motor.js: Ley Emiliani más
--     Pascua), corriendo el motor sobre cada día de 2026 y 2027 — es la única
--     fuente de verdad del proyecto para «qué día es festivo», y hay una prueba
--     que compara esta lista con lo que el motor dice. Si el año en curso no
--     tiene festivos sembrados, la cobranza por el chat SE CIERRA en vez de
--     suponer que no hay festivos: fallar cerrado es lo único honesto cuando
--     equivocarse es una multa.
--
-- LAS FOTOS NO ESTÁN ACÁ (26-sep-2026)
--   Este archivo traía una tabla `comprobantes` y tres funciones para que el
--   cliente de PlataChat mandara la foto de su pago. El 22-sep la app del
--   cliente de Tu Garantía estrenó fotos en el chat por otro camino
--   (20260922f_fotos_en_el_chat.sql, ya aplicada): `chat_fotos`, colgada del
--   mensaje con borrado en cascada, con miniatura, tope por mes y cortacircuito.
--   Dos formas de mandar una foto serían dos bandejas donde buscar un
--   comprobante y dos promesas de borrado que cumplir, así que PlataChat usa
--   la que ya existe (chat_foto_sesion y chat_foto_sesion_ver) y la de aquí se
--   quitó sin llegar nunca a la base.
--   OJO CON EL ESPACIO: las fotos de PlataChat se comen el MISMO presupuesto
--   que las de Tu Garantía. chat_fotos tiene 150 MB de los 500 del plan gratis
--   de Supabase, 60 fotos por persona cada 30 días, y un cortacircuito que deja
--   de recibirlas al pasar de ahí. Con dos marcas mandando fotos, ese techo se
--   alcanza el doble de rápido. Pasado el total de 500 MB la base entera queda
--   de SOLO LECTURA: no se puede desembolsar, cobrar ni contestar.
--
-- LO QUE NO ESTÁ ACÁ, A PROPÓSITO
--   · El contador «un canal por semana» de la Ley 2300 sigue en el CRM (fase
--     2). Esta migración solo cierra el HORARIO, que es lo que el gerente no
--     tenía enfrente.
--   · La cola de «se retiene y sale a las 7:00» no existe. El mensaje fuera de
--     horario no se guarda: se rechaza y el que escribe vuelve a intentarlo.
--     Guardarlo para mandarlo después necesita algo que corra solo en la base
--     (pg_cron), que hoy no está encendido. Prometer que «sale a las 7:00» sin
--     eso sería mentir — y el motivo que devuelve la función lo dice con esas
--     palabras: «no se envió», no «sale».
--
-- POR QUÉ LA RESPUESTA DEL EQUIPO NO VA DETRÁS DEL CANDADO. El candado de
-- 20260914b protege lo que se LEE del historial. Esta función ESCRIBE en el
-- hilo que llave_de_sesion resuelve, y el cliente NUEVO —que todavía no tiene
-- ficha, y es a quien PlataChat nació para atender— tiene que poder recibir
-- respuesta de su gerente desde el primer mensaje.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. LO ANTERIOR TIENE QUE ESTAR — antes de crear nada
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'falta correr base/20260914b_tres_canales.sql antes que este archivo (no existe llave_de_sesion)';
  end if;
  if to_regclass('public.contactos') is null
     or to_regclass('public.cartera') is null
     or to_regclass('public.asignaciones') is null
     or to_regprocedure('public.mi_alcance(text)') is null
     or to_regprocedure('public.celular_de_sesion()') is null then
    raise exception 'falta correr base/20260910_equipo_en_la_nube.sql y base/20260911_gerente_y_whatsapp.sql antes que este archivo';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'mensajes' and column_name = 'canal') then
    raise exception 'mensajes no tiene la columna canal: falta 20260914b_tres_canales.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. EL AUTOR QUE FALTABA: 'equipo'
--
-- La columna mensajes.de admitía cuatro autores (20260828b): socio, panel
-- (Joan), auto (una regla) y agente (el asistente). El gerente y el asesor no
-- son ninguno de los cuatro. La primera versión de este archivo los escribía
-- como 'agente', y app/chat.js —el ÚNICO que decide qué es automático— trata
-- 'agente' como máquina: burbuja punteada y rótulo «El asistente». El cliente
-- habría visto a su gerente pintado como un robot, y Joan en su bandeja a su
-- equipo como «automático». Es la promesa de la fase 3 al revés (hallazgo de
-- la auditoría del 14-sep, comprobado en un arnés).
--
-- Por eso un valor NUEVO, y no cambiarle el significado a 'agente': un valor
-- que quiere decir dos cosas según la fecha del mensaje no se puede pintar
-- bien nunca. chat.js sin tocar cae a AUTORES.panel para un autor que no
-- conoce (lado del negocio, SIN marca de automático): al cliente le sale como
-- persona desde el primer día, que es la verdad; en el CRM sale como «Tú»
-- hasta que se aplique la receta de RECETA-PLATACHAT.md (AUTORES.equipo =
-- «Tu gerente»). Nada escribía 'agente' todavía (barrido del 14-sep en base/
-- y pantallas): no hay filas que migrar.
--
-- 26-sep-2026 — SE AÑADE, NO SE REHACE A CIEGAS. La primera versión borraba el
-- check y lo volvía a crear con una lista escrita aquí; si alguien le hubiera
-- sumado un autor en la base después de 20260828b, este pegado se lo habría
-- quitado y el primer mensaje de ese autor reventaría. Ahora mira lo vivo:
-- si ya tiene 'equipo', no toca nada; si es exactamente el de 20260828b, le
-- añade 'equipo'; si es cualquier otra cosa, se para y dice qué encontró.
-- ---------------------------------------------------------------------------
do $$
declare def text; n integer;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conname = 'mensajes_autor_ok' and conrelid = 'public.mensajes'::regclass;
  if def is null then
    raise exception 'mensajes no tiene el check mensajes_autor_ok: falta correr 20260828b_chat.sql';
  end if;
  if def like '%''equipo''%' then
    return;                                   -- ya corrió: nada que hacer
  end if;
  -- Exactamente los cuatro de 20260828b, ni uno más.
  n := (length(def) - length(replace(def, '::text', ''))) / length('::text');
  if n <> 4 or def not like '%''socio''%' or def not like '%''panel''%'
     or def not like '%''auto''%' or def not like '%''agente''%' then
    raise exception 'el check mensajes_autor_ok de la base no es el de 20260828b: %. Alguien lo cambió después; añade equipo a mano SIN quitar lo que ya tenga, y vuelve a correr este archivo.', def;
  end if;
  alter table public.mensajes drop constraint mensajes_autor_ok;
  alter table public.mensajes
    add constraint mensajes_autor_ok check (de in ('socio', 'panel', 'auto', 'agente', 'equipo'));
end $$;

comment on column public.mensajes.de is
  'socio = lo escribió el cliente. panel = lo escribió Joan. auto = lo contestó una regla. agente = lo contestó el asistente (automático). equipo = lo escribió el gerente o un asesor desde su celular (chat_responder_equipo).';

-- ---------------------------------------------------------------------------
-- 2. LOS FESTIVOS
--
-- Generados el 14-sep-2026 con el motor (scratchpad/festivos.js: recorre cada
-- día de 2026 y 2027 y anota los que MotorReglas.esFestivo da por festivos).
-- 18 por año, que es lo que Colombia tiene. NO se escriben a mano: cuando
-- llegue 2028, se vuelve a correr el motor y se siembra en una migración
-- nueva. Mientras tanto, chat_responder_equipo se niega a cobrar en un año
-- sin festivos sembrados (ver abajo).
-- ---------------------------------------------------------------------------
create table if not exists public.festivos_colombia (
  dia date primary key
);
alter table public.festivos_colombia enable row level security;
revoke all on table public.festivos_colombia from public, anon, authenticated;

insert into public.festivos_colombia (dia) values
  ('2026-01-01'), ('2026-01-12'), ('2026-03-23'), ('2026-04-02'), ('2026-04-03'),
  ('2026-05-01'), ('2026-05-18'), ('2026-06-08'), ('2026-06-15'), ('2026-06-29'),
  ('2026-07-20'), ('2026-08-07'), ('2026-08-17'), ('2026-10-12'), ('2026-11-02'),
  ('2026-11-16'), ('2026-12-08'), ('2026-12-25'),
  ('2027-01-01'), ('2027-01-11'), ('2027-03-22'), ('2027-03-25'), ('2027-03-26'),
  ('2027-05-01'), ('2027-05-10'), ('2027-05-31'), ('2027-06-07'), ('2027-07-05'),
  ('2027-07-20'), ('2027-08-07'), ('2027-08-16'), ('2027-10-18'), ('2027-11-01'),
  ('2027-11-15'), ('2027-12-08'), ('2027-12-25')
on conflict (dia) do nothing;

-- ---------------------------------------------------------------------------
-- 3. (QUITADA el 26-sep-2026) LOS COMPROBANTES
--
-- Aquí vivían la tabla `comprobantes` y comprobante_subir, comprobantes_de y
-- comprobante_imagen. Se quitaron antes de llegar a la base: PlataChat manda
-- sus fotos por chat_foto_sesion, la misma de la app del cliente (ver la
-- cabecera, «LAS FOTOS NO ESTÁN ACÁ»). El número de sección se conserva para
-- que las referencias de las pruebas y de la receta sigan apuntando bien.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. EL EQUIPO CONTESTA — con sesión, dentro de su alcance, y en horario
--
-- Recibe p_persona_id: el id de la persona en la CARTERA, que el CRM ya tiene
-- en la mano (es lo mismo que reciben gestion_anotar y contacto_anotar). NO
-- recibe la llave del hilo ni una cédula, por dos razones:
--   · La cartera no tiene cédula a propósito (Ley 1581, 20260910). Una función
--     que recibiera cédulas y contestara «ok» / «no es de tu base» sería un
--     oráculo: un asesor podría tantear cédulas hasta confirmar cuál es la de
--     su persona — justo el dato que la cartera le oculta. Y cada acierto
--     escribiría un mensaje.
--   · La llave del hilo la RESUELVE la base con llave_de_sesion sobre el
--     celular de la cartera: la MISMA función con la que chat_leer_sesion
--     decide qué hilo le muestra a ese celular. Por construcción el mensaje
--     cae donde el cliente de PlataChat lo lee, y no en un hilo huérfano bajo
--     una llave que nadie resuelve. Un socio de Tu Garantía que nunca abrió
--     PlataChat tiene su hilo bajo la cédula: a ese se le contesta desde el
--     CRM con chat_responder, como hasta hoy. Esta función es la del equipo
--     para PlataChat, y cuando el CRM la enchufe (fase 2) la ofrece sobre los
--     hilos de PlataChat, no sobre los de socio.html.
--
-- Escribe con de = 'equipo' (sección 1): ni 'panel' (Joan) ni 'agente' (una
-- máquina). Joan tiene que poder ver en su bandeja qué contestó él y qué
-- contestó su equipo, y el cliente tiene que ver a una persona.
-- ---------------------------------------------------------------------------
create or replace function public.chat_responder_equipo(p_persona_id text, p_canal text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel text; yo public.equipo; mios text[]; duenio text;
  v_llave text; v_cel_persona text; v_canal text; txt text;
  v_local timestamp; v_dow integer; v_hora time;
begin
  cel := public.celular_de_sesion();
  if cel is null then return jsonb_build_object('ok', false); end if;
  select * into yo from public.equipo where celular = cel;
  if not found or yo.estado <> 'activo' or yo.rol not in ('gerente', 'asesor') then
    return jsonb_build_object('ok', false);
  end if;

  v_canal := case when p_canal in ('servicio', 'cobranza', 'creditos') then p_canal else 'servicio' end;
  txt := btrim(coalesce(p_texto, ''));
  if length(txt) < 1 or length(txt) > 1000 then
    return jsonb_build_object('ok', false, 'motivo', 'el mensaje va de 1 a 1000 caracteres');
  end if;
  if coalesce(p_persona_id, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'falta decir a quién');
  end if;

  -- LA REJA DE gestion_anotar, tal cual: el dueño de HOY de la persona (la
  -- última asignación) tiene que estar en mi alcance. Misma respuesta para
  -- «no existe» y para «no es mía»: no se distingue, para no delatar nada.
  mios := public.mi_alcance(yo.celular);
  select a.asesor into duenio from public.asignaciones a
   where a.persona_id = p_persona_id
   order by a.desde desc, a.id desc limit 1;
  if duenio is null or not (duenio = any(mios)) then
    return jsonb_build_object('ok', false, 'motivo', 'esa persona no es de tu base');
  end if;

  -- El celular con el que la persona figura en la cartera, y de ahí la llave
  -- del hilo: la misma cuenta que hace chat_leer_sesion para ese celular.
  select right(public.solo_digitos(coalesce(p.celular, '')), 10) into v_cel_persona
    from public.cartera p
   where p.id = p_persona_id;
  if coalesce(v_cel_persona, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'esa persona no tiene celular en la cartera');
  end if;
  v_llave := public.llave_de_sesion(v_cel_persona);

  -- EL HORARIO DE LA LEY 2300, solo para cobranza. Hora de Colombia, no la del
  -- servidor (Supabase corre en UTC: a las 19:30 de Bogotá el servidor marca
  -- 00:30 del día siguiente). isodow: 1 lunes … 6 sábado, 7 domingo.
  if v_canal = 'cobranza' then
    v_local := now() at time zone 'America/Bogota';
    v_dow   := extract(isodow from v_local)::integer;
    v_hora  := v_local::time;

    -- Fallar cerrado: sin festivos sembrados para este año no se sabe si hoy
    -- es festivo, y suponer que no lo es cuesta una multa.
    if not exists (select 1 from public.festivos_colombia
                    where extract(year from dia) = extract(year from v_local)) then
      return jsonb_build_object('ok', false, 'motivo',
        'faltan los festivos de este año en la base: no se puede cobrar por el chat hasta sembrarlos');
    end if;

    -- El motivo dice lo que PASA —no se envió— y no lo que pasaría con una
    -- cola que no existe. «Sale desde las 7:00» haría que el gerente no lo
    -- volviera a mandar, y el mensaje nunca saldría.
    if v_dow = 7
       or exists (select 1 from public.festivos_colombia where dia = v_local::date)
       or (v_dow between 1 and 5 and (v_hora < time '07:00' or v_hora >= time '19:00'))
       or (v_dow = 6 and (v_hora < time '08:00' or v_hora >= time '15:00')) then
      return jsonb_build_object('ok', false,
        'motivo', 'fuera de horario: no se envió. La cobranza por el chat va de lunes a viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00 (nunca domingos ni festivos). Vuelve a mandarlo en horario.',
        'horario', 'lunes a viernes de 7:00 a 19:00, sábados de 8:00 a 15:00; nunca domingos ni festivos');
    end if;
  end if;

  insert into public.mensajes (cedula, de, texto, canal)
  values (v_llave, 'equipo', txt, v_canal);

  -- El rastro para el control de calidad: mismo hecho que un WhatsApp o una
  -- llamada, con el texto que salió. `quien` sale de la sesión, no de la
  -- pantalla, igual que en contacto_anotar.
  insert into public.contactos (persona_id, quien, canal, texto)
  values (p_persona_id, yo.celular, 'app', left(txt, 600));

  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. LOS PERMISOS
--
-- `create or replace` NO quita el EXECUTE que PostgreSQL le concede a PUBLIC
-- por defecto, y Supabase se lo concede EXPLÍCITO a anon y authenticated en
-- cada función nueva: se revoca de los tres y se concede lo justo.
-- ---------------------------------------------------------------------------
revoke all on function public.chat_responder_equipo(text, text, text) from public, anon, authenticated;
grant  execute on function public.chat_responder_equipo(text, text, text) to authenticated;      -- el equipo, con sesión

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. LA COMPROBACIÓN
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text; n integer;
begin
  if to_regprocedure('public.llave_de_sesion(text)') is null then
    raise exception 'falta correr base/20260914b_tres_canales.sql antes que este archivo (no existe llave_de_sesion)';
  end if;
  if to_regclass('public.festivos_colombia') is null then
    raise exception 'falto la tabla festivos_colombia';
  end if;

  -- Cerradas: nadie las lee directo.
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public'
                and table_name = 'festivos_colombia'
                and grantee in ('anon', 'authenticated')) then
    raise exception 'festivos_colombia quedo abierta a la llave publica';
  end if;

  -- El autor 'equipo' cabe en la columna: sin esto el gerente no podria contestar.
  select pg_get_constraintdef(oid) into cuerpo from pg_constraint
   where conname = 'mensajes_autor_ok' and conrelid = 'public.mensajes'::regclass;
  if cuerpo is null or cuerpo not like '%equipo%' then
    raise exception 'mensajes.de no admite el autor equipo: chat_responder_equipo reventaria al escribir';
  end if;

  -- Los festivos: 18 por año, los dos años, y el año en curso sembrado.
  select count(*) into n from public.festivos_colombia where dia between '2026-01-01' and '2026-12-31';
  if n <> 18 then raise exception 'los festivos de 2026 no son 18'; end if;
  select count(*) into n from public.festivos_colombia where dia between '2027-01-01' and '2027-12-31';
  if n <> 18 then raise exception 'los festivos de 2027 no son 18'; end if;
  if not exists (select 1 from public.festivos_colombia
                  where extract(year from dia) = extract(year from (now() at time zone 'America/Bogota'))) then
    raise exception 'no hay festivos sembrados para el año en curso: la cobranza por el chat quedaria cerrada. Corre MotorReglas.esFestivo sobre el año y siembralo en una migracion nueva';
  end if;

  -- EL HORARIO VIVE EN LA BASE. Sin comentarios antes de mirar: la prosa de
  -- arriba nombra las dos cosas y un centinela que lee prosa se caza solo.
  select prosrc into cuerpo from pg_proc
   where proname = 'chat_responder_equipo' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^' || chr(10) || ']*', '', 'g');
  cuerpo := regexp_replace(cuerpo, '/\*[^*]*\*+([^/*][^*]*\*+)*/', '', 'g');
  if cuerpo not like '%festivos_colombia%' or cuerpo not like '%America/Bogota%' then
    raise exception 'chat_responder_equipo no aplica el horario de la Ley 2300 en la base';
  end if;
  if cuerpo not like '%celular_de_sesion%' or cuerpo not like '%mi_alcance%' then
    raise exception 'chat_responder_equipo no saca de la sesion quien firma o no comprueba el alcance';
  end if;
  if cuerpo not like '%insert into public.contactos%' then
    raise exception 'chat_responder_equipo no deja rastro en contactos';
  end if;
  -- La persona entra por su id y la llave del hilo la resuelve la base: ni
  -- cedulas de entrada (oraculo) ni hilos huerfanos.
  if cuerpo not like '%llave_de_sesion%' then
    raise exception 'chat_responder_equipo no resuelve la llave del hilo con llave_de_sesion: el mensaje podria caer en un hilo que nadie lee';
  end if;
  if cuerpo not like '%''equipo''%' or cuerpo like '%''agente''%' then
    raise exception 'chat_responder_equipo no escribe como equipo: el cliente veria a su gerente como una maquina';
  end if;
  if cuerpo like '%sale desde las%' then
    raise exception 'chat_responder_equipo promete una cola que no existe';
  end if;

  -- Permisos: la respuesta del equipo va con sesion, nunca con la llave publica.
  if has_function_privilege('anon', 'public.chat_responder_equipo(text, text, text)', 'execute') then
    raise exception 'chat_responder_equipo quedo abierta sin sesion';
  end if;
  if not has_function_privilege('authenticated', 'public.chat_responder_equipo(text, text, text)', 'execute') then
    raise exception 'chat_responder_equipo no es llamable con sesion: el equipo no podria contestar';
  end if;

  -- Las que pasan por clave_ok no pueden ser stable (25006).
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname = 'chat_responder_equipo'
                and p.provolatile <> 'v') then
    raise exception 'alguna funcion nueva quedo stable y escribe: PostgREST la mata con 25006';
  end if;
end $$;
