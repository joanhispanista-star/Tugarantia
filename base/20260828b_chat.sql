-- ===========================================================================
-- FASE 1 DEL CHAT — 28 de agosto de 2026
--
-- Cómo se aplica: SQL Editor de Supabase → New query → pegar TODO → Run.
-- Es idempotente: correrlo dos veces da lo mismo que correrlo una.
-- Va DESPUÉS de 20260828_correo_interno.sql.
--
-- ---------------------------------------------------------------------------
-- QUÉ ES ESTO
--
-- El chat de la app se escribió el 5 de agosto (supabase.sql) y se parcheó el
-- 10 y el 11. Está completo por dentro y NUNCA se cableó a una pantalla: al
-- 28-ago, buscar sus siete funciones en socio.html, crm.html, espejo.html y
-- nube.js daba cero resultados. Esta migración lo deja listo para encenderlo, y
-- arregla lo que se rompería el día que se encienda.
--
-- Y no es opcional: `legal/privacidad.html` ya le promete al cliente, en vivo y
-- en el documento de tratamiento de datos, que lo que escriba «por el chat de
-- la app» queda guardado y que puede pedir que se borre. Hoy eso es una
-- promesa sin código detrás.
--
-- ---------------------------------------------------------------------------
-- LAS CUATRO COSAS QUE HACE, Y POR QUÉ CADA UNA
--
-- 1. EL CHAT DEJA DE PEDIR CÉDULA. Es lo más grave y nadie lo había medido.
--    `chat_escribir` y `chat_leer` buscan `where cedula = ced`. Pero la puerta
--    de la app cambió el 20-ago a celular O cédula, y el propio archivo de esa
--    migración deja escrita la razón: **al 20-ago solo 5 de 16 clientes tienen
--    cédula cargada, y 15 de 16 tienen celular**. Encender el chat tal como
--    está dejaría a ~11 de 16 clientes tecleando su celular y su código y
--    recibiendo el mismo `null` mudo que un impostor. Aquí se copia la búsqueda
--    doble de `historial_socio_por_codigo`, palabra por palabra.
--
-- 2. LA LLAVE DEL SOCIO CAMBIA, Y `mensajes` NO SE ENTERABA.
--    `socios_historial` se llavea con `coalesce(cédula, celular)`. El día que a
--    una ficha que subía por celular le cargan la cédula de verdad,
--    `sincronizar_socios` borra la fila vieja y crea la buena — y hace bien, y
--    está comentado allá. Pero ese `delete` no toca `mensajes`: la conversación
--    de ese cliente quedaría colgando de una llave que ya no existe y
--    **desaparecería de la bandeja sin un solo aviso**. No es un fallo que se
--    vea al probar: aparece meses después, el día que Joan cargue una cédula.
--    Se arregla moviendo los mensajes en la MISMA transacción, antes del
--    delete.
--
-- 3. CABEN DOS AUTORES MÁS. `de in ('socio','panel')` no admite un tercero, y
--    la fase 3 necesita distinguir lo que contestó Joan de lo que contestó una
--    regla — que es exactamente lo que él pidió poder ver. Se abre el check a
--    'auto' y 'agente' y se agrega `regla`, que dice CUÁL contestó. Se hace
--    ahora, con la tabla vacía, y no en la fase 3 con conversaciones adentro.
--
-- 4. LOS PERMISOS SE CONSOLIDAN AQUÍ, Y ESTE ES EL ÚLTIMO SITIO DONDE VIVEN.
--    `20260810` hace `drop function` de `chat_escribir` y `chat_leer` —y un
--    drop se lleva los grants con él— y en la línea 424 los vuelve a conceder
--    SOLO a `anon`. `20260811` los había ampliado a `anon, authenticated`. La
--    firma vieja y la nueva son la misma `(text,text,text)`, así que nada
--    avisa. Como las migraciones de esta casa se escriben idempotentes
--    justamente para poder repegarlas, volver a correr `20260810` dejaría el
--    chat abierto para los clientes y cerrado para el Panel el día que el Panel
--    entre con Auth. **A partir de hoy, los grants del chat se editan en ESTE
--    archivo y `20260810` no se vuelve a correr suelto.**
--
-- ---------------------------------------------------------------------------
-- LO QUE NO HACE, DICHO A PROPÓSITO
--
-- · NO toca la autenticación del socio: ya pide el código desde el 10-ago
--   (`codigo_hash = huella_codigo(p_codigo)`) y tres pruebas lo custodian. Lo
--   de «cédula + últimos 4» está muerto; que nadie lo «arregle» otra vez.
-- · NO agrega `visto_por_joan`. El plan lo mencionaba, pero al escribirlo se
--   vio que sobra: un mensaje tiene UN destinatario, así que el `visto` que ya
--   existe alcanza — el de 'socio' lo levanta Joan al abrir, y los del negocio
--   los levanta el socio al leer. Una segunda columna sería otra verdad sobre
--   lo mismo.
-- · NO mueve `chat_olvidar` a Supabase Auth. Debe ir ahí, y queda anotado como
--   deuda; pero hoy `crm.html` habla con la nube por `anon` + clave de
--   sincronización, así que moverlo ahora no lo aseguraría: lo dejaría
--   incallable desde el Panel. Se mueve cuando se mueva el Panel entero, con
--   `panel_traer`/`panel_empujar`, y en la misma entrega.
-- ===========================================================================


-- ---------------------------------------------------------------- 1. tabla ---

-- El tercer y cuarto autor. Se nombra la restricción a mano: la que puso
-- supabase.sql se llama `mensajes_de_check` por la regla de PostgreSQL, pero
-- depender de un nombre automático es depender de un detalle que puede cambiar.
alter table public.mensajes drop constraint if exists mensajes_de_check;
alter table public.mensajes drop constraint if exists mensajes_autor_ok;
alter table public.mensajes
  add constraint mensajes_autor_ok check (de in ('socio', 'panel', 'auto', 'agente'));

-- Qué regla lo contestó. Nulo cuando lo escribió una persona — y esa es toda
-- la información: si tiene regla, no lo escribió Joan.
alter table public.mensajes add column if not exists regla text;

comment on column public.mensajes.de is
  'socio = lo escribió el cliente. panel = lo escribió Joan. auto = lo contestó una regla. agente = lo contestó el asistente.';
comment on column public.mensajes.regla is
  'Qué regla automática lo produjo. Nulo si lo escribió una persona.';


-- ------------------------------------------- 2. el socio escribe y lee ---
-- Las dos son copia FIEL de las de 20260810_codigo_acceso.sql, con un solo
-- cambio: donde buscaban `where cedula = ced` ahora buscan por las dos
-- columnas, igual que historial_socio_por_codigo, y guardan bajo la llave
-- canónica de la fila (r.cedula), no bajo lo que el cliente tecleó. Si no, el
-- que entra por celular abriría una conversación paralela que la bandeja de
-- Joan no sabría juntar con la suya.
--
-- El freno sigue midiéndose contra lo que TECLEÓ (`ident`), como en la puerta
-- de entrada: es lo que hay que frenar cuando alguien tantea.
--
-- Nada más se toca. Ni el freno, ni la espera de 0,3 s, ni el tope de 1.000
-- caracteres, ni el `null` mudo que no delata cuál de las tres causas falló.
-- Cambiar de paso «algo que se ve mejorable» en una función que funciona es
-- como se rompe lo que funcionaba.

create or replace function public.chat_escribir(p_cedula text, p_codigo text, p_texto text)
returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare r public.socios_historial; ident text; h text; nuevo bigint;
begin
  ident := public.solo_digitos(p_cedula);

  if not public.puede_intentar(ident) then
    perform pg_sleep(0.3);
    return null;
  end if;

  -- Un código con la forma mal puesta cuenta como fallo: si no, tantear el
  -- largo saldría gratis y el freno dejaría de medir lo que importa.
  h := public.huella_codigo(p_codigo);
  if h is null then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  -- order by + limit 1 y no un select a secas, por lo mismo que allá: si dos
  -- fichas compartieran celular, un select into con dos filas se queda con una
  -- cualquiera; así se queda con la más recién subida.
  select * into r
    from public.socios_historial
   where (cedula = ident or celular = ident)
     and codigo_hash = h
   order by actualizado_en desc
   limit 1;

  if not found then
    perform public.anotar_fallo(ident);   -- se anota ANTES de salir, y sin excepción
    perform pg_sleep(0.3);
    return null;
  end if;

  perform public.limpiar_fallos(ident);

  if btrim(coalesce(p_texto, '')) = '' then return null; end if;
  if not public.chat_puede_escribir(r.cedula) then return null; end if;

  insert into public.mensajes (cedula, de, texto)
       values (r.cedula, 'socio', left(btrim(p_texto), 1000))
    returning id into nuevo;

  return nuevo;
end
$$;

-- EL SOCIO LEE LO SUYO. De paso da por vistos los que le mandó el negocio: el
-- socio está mirando la pantalla, así que ya los vio. Ojo al `de <> 'socio'` y
-- no `de = 'panel'`: desde hoy hay cuatro autores y tres son del lado de acá.
create or replace function public.chat_leer(p_cedula text, p_codigo text, p_desde bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.socios_historial; ident text; h text; salida jsonb;
begin
  ident := public.solo_digitos(p_cedula);

  if not public.puede_intentar(ident) then
    perform pg_sleep(0.3);
    return null;
  end if;

  h := public.huella_codigo(p_codigo);
  if h is null then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  select * into r
    from public.socios_historial
   where (cedula = ident or celular = ident)
     and codigo_hash = h
   order by actualizado_en desc
   limit 1;

  if not found then
    perform public.anotar_fallo(ident);
    perform pg_sleep(0.3);
    return null;
  end if;

  perform public.limpiar_fallos(ident);

  -- `visto` sale también, y sirve para algo concreto: en un mensaje del SOCIO
  -- significa que Joan ya abrió la conversación. Es lo único con lo que la app
  -- puede decirle «lo leyó» sin inventárselo. Se lee ANTES del update de abajo,
  -- que solo toca los del negocio, así que no se pisa a sí mismo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'de', m.de, 'texto', m.texto,
           'regla', m.regla, 'visto', m.visto, 'creado_en', m.creado_en
         ) order by m.id), '[]'::jsonb)
    into salida
    from public.mensajes m
   where m.cedula = r.cedula
     and m.id > coalesce(p_desde, 0);

  update public.mensajes
     set visto = true
   where cedula = r.cedula and de <> 'socio' and not visto;

  return salida;
end
$$;


-- ------------------------------------------------- 3. la bandeja de Joan ---
-- Se le agrega el celular. Sin él, la bandeja sabe quién le escribió pero no
-- por dónde contestarle si el cliente no vuelve a abrir la app — y hoy el
-- canal de Joan sigue siendo WhatsApp. `ultimo_de` ya distingue los cuatro
-- autores solo, porque devuelve lo que hay en la columna.

create or replace function public.chat_conversaciones(p_clave text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.clave_ok(p_clave) then
    raise exception 'clave incorrecta';
  end if;

  return coalesce((
    select jsonb_agg(c order by c->>'ultimo_en' desc)
      from (
        select jsonb_build_object(
                 'cedula',    m.cedula,
                 'nombre',    coalesce(s.nombre, ''),
                 'celular',   coalesce(s.celular, ''),
                 'ultimo',    (array_agg(m.texto order by m.id desc))[1],
                 'ultimo_de', (array_agg(m.de    order by m.id desc))[1],
                 'ultimo_en', max(m.creado_en),
                 'sin_leer',  count(*) filter (where m.de = 'socio' and not m.visto)
               ) as c
          from public.mensajes m
          left join public.socios_historial s on s.cedula = m.cedula
         group by m.cedula, s.nombre, s.celular
      ) t
  ), '[]'::jsonb);
end
$$;

-- JOAN ABRE UNA CONVERSACIÓN. Al abrirla, los del socio quedan vistos.
-- Devuelve también `regla`, que es lo que le deja ver, mensaje por mensaje,
-- qué contestó él y qué contestó la máquina.
create or replace function public.chat_de(p_clave text, p_cedula text, p_desde bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare ced text; salida jsonb;
begin
  if not public.clave_ok(p_clave) then
    raise exception 'clave incorrecta';
  end if;

  ced := public.solo_digitos(p_cedula);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'de', m.de, 'texto', m.texto,
           'regla', m.regla, 'visto', m.visto, 'creado_en', m.creado_en
         ) order by m.id), '[]'::jsonb)
    into salida
    from public.mensajes m
   where m.cedula = ced
     and m.id > coalesce(p_desde, 0);

  update public.mensajes
     set visto = true
   where cedula = ced and de = 'socio' and not visto;

  return salida;
end
$$;


-- ------------------------------------ 4. la llave que cambia (la trampa 2) ---
-- `sincronizar_socios` es IDÉNTICA a la de 20260820b_codigo_propio.sql —
-- incluido todo el trato del código propio, que no se toca— salvo por UNA
-- línea: el `update` de `mensajes` justo antes del `delete`.
--
-- Por qué va antes y en la misma transacción: si se hiciera después, entre las
-- dos sentencias la conversación apunta a una fila que ya no existe; y si
-- fallara la segunda, quedaría movida a medias. Y si el cliente ya tenía
-- conversación bajo su cédula, las dos se juntan — que es lo correcto: es la
-- misma persona.

create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item   jsonb;
  n      integer := 0;
  h      text;
  ident  text;
  cel    text;
  forzar boolean;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    cel    := nullif(public.solo_digitos(item->>'telefono'), '');
    ident  := coalesce(nullif(public.solo_digitos(item->>'cedula'), ''), cel);
    forzar := coalesce((item->>'codigo_forzar')::boolean, false);
    continue when ident is null;

    if cel is not null and cel <> ident then
      -- 28-ago-2026 — LOS MENSAJES VIAJAN CON EL CLIENTE.
      -- Sin esta línea, el día que Joan le cargue la cédula a una ficha que
      -- subía por celular, la conversación de ese cliente queda colgando de
      -- una llave borrada: desaparece de la bandeja y él sigue viendo la suya.
      -- Dos verdades sobre la misma conversación, y ninguna alarma.
      update public.mensajes set cedula = ident where cedula = cel;
      delete from public.socios_historial where cedula = cel;
    end if;

    h := public.huella_codigo(item->>'codigo');

    insert into public.socios_historial (cedula, celular, tel4, nombre, datos, codigo_hash, codigo_propio, actualizado_en)
    values (
      ident,
      cel,
      right(coalesce(cel, ''), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      h,
      false,
      now()
    )
    on conflict (cedula) do update
      set celular        = excluded.celular,
          tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          codigo_hash    = case
            when forzar then coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
            when socios_historial.codigo_propio then socios_historial.codigo_hash
            else coalesce(excluded.codigo_hash, socios_historial.codigo_hash)
          end,
          codigo_propio  = case when forzar then false else socios_historial.codigo_propio end,
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;


-- ------------------------------------------------------- 5. los permisos ---
-- El sitio único. `revoke ... from public` primero porque PostgreSQL le concede
-- EXECUTE a PUBLIC por defecto a toda función nueva, y `create or replace` no
-- lo quita. Después el grant explícito.
--
-- `chat_puede_escribir` NO lleva grant y eso es deliberado: es interna, y
-- concedida sería un oráculo de «esta persona está usando el chat ahora mismo»
-- llamable por internet con la llave pública. Ya se cerró una vez (20260811).

revoke all on function public.chat_puede_escribir(text)              from public;
revoke all on function public.chat_escribir(text, text, text)        from public;
revoke all on function public.chat_leer(text, text, bigint)          from public;
revoke all on function public.chat_conversaciones(text)              from public;
revoke all on function public.chat_de(text, text, bigint)            from public;
revoke all on function public.chat_responder(text, text, text)       from public;
revoke all on function public.chat_olvidar(text, text)               from public;
revoke all on function public.sincronizar_socios(text, jsonb)        from public;

grant execute on function public.chat_escribir(text, text, text)     to anon, authenticated;
grant execute on function public.chat_leer(text, text, bigint)       to anon, authenticated;
grant execute on function public.chat_conversaciones(text)           to anon, authenticated;
grant execute on function public.chat_de(text, text, bigint)         to anon, authenticated;
grant execute on function public.chat_responder(text, text, text)    to anon, authenticated;
grant execute on function public.chat_olvidar(text, text)            to anon, authenticated;
grant execute on function public.sincronizar_socios(text, jsonb)     to anon, authenticated;

-- Para que PostgREST vea las firmas nuevas sin esperar a que recargue solo.
notify pgrst, 'reload schema';


-- ===========================================================================
-- CÓMO COMPROBAR QUE QUEDÓ APLICADA (30 segundos, en el mismo SQL Editor)
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.mensajes'::regclass;
--   -- tiene que salir mensajes_autor_ok con los cuatro autores
--
--   select column_name from information_schema.columns
--    where table_name = 'mensajes' and column_name = 'regla';
--   -- una fila
--
--   select prosrc like '%update public.mensajes set cedula%' as mueve_mensajes
--     from pg_proc where proname = 'sincronizar_socios';
--   -- true
--
--   select p.proname, array_agg(a.rolname order by a.rolname) as quien_puede
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
--     cross join lateral (select rolname from pg_roles
--                          where has_function_privilege(rolname, p.oid, 'execute')
--                            and rolname in ('anon','authenticated')) a
--    where p.proname like 'chat\_%'
--    group by p.proname order by p.proname;
--   -- las seis públicas con anon y authenticated; chat_puede_escribir NO sale
-- ===========================================================================
