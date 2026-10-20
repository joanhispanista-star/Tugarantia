-- ===========================================================================
-- LA CÉDULA ES LA DEL REGISTRO DE LA CUENTA — 20 de octubre de 2026, rediseño
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- toca ninguna fila de clientes (agrega una columna vacía y, al final, prueba
-- llamando con un celular de mentira y deshace lo que la prueba escribió). Va
-- DESPUÉS de base/20260922c_verificacion_cedula.sql (registro_archivos_guardar
-- con el cotejo), base/20260909_una_sola_puerta.sql (registrar_abierto) y, si
-- PlataChat está aplicado, base/20260921_platachat_app.sql. Convive con
-- base/20261019_aparato_del_telefono.sql en cualquier orden: esa no toca
-- registro_archivos_guardar ni registrar_abierto. Después: Settings → API →
-- «Reload schema». Al final tiene que salir «Listo: la cédula ya no se cuela
-- en la cuenta de otro.»
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EN LA BASE
--
-- Dos rondas de revisión del registro de play/ encontraron caminos para que,
-- en un teléfono compartido, la cédula de una persona (las fotos y la lectura
-- del código de barras) terminara en la cuenta de otra, y cada ronda de reglas
-- en el teléfono abrió otro camino. El teléfono lo controla quien lo tiene en
-- la mano. La reja de verdad tiene que estar aquí.
--
-- EL CASO (V1 de la verificación del 20-oct): María escanea su cédula y deja
-- el teléfono en «Revisa tus datos»; Pedro, que ya tiene cuenta, escribe su
-- celular, vuelve a la portada y entra con su contraseña. La página subía la
-- cédula de María con la sesión de Pedro, y registro_archivos_guardar la
-- guardaba por el celular de la sesión con `on conflict do update`: las fotos
-- de Pedro quedaban REEMPLAZADAS por las de María, y su lectura (su nombre, su
-- número, su fecha de nacimiento) en la huella de Pedro. El cotejo decía
-- 'no_cuadra', pero el dato sensible de María ya estaba en la cuenta de otro.
-- (La página del 20-oct ya no lo hace: lo de un registro abandonado no sube
-- nunca. Esto es por si otro camino lo vuelve a intentar.)
--
-- LO QUE CAMBIA EN registro_archivos_guardar, ANTES de guardar nada:
--   1. una cedula_leida cuyo documento NO es el de ninguno de los registros de
--      ese celular no entra: ni la lectura, ni las fotos de la cédula, ni la
--      selfie, ni el GPS de esa llamada. Contesta {ok:false, motivo} y deja en
--      la huella del último registro una marca SIN DATOS de la otra persona
--      (cedula_rechazada: motivo y momento), para que Joan sepa que pasó. El
--      motivo es 'otro_documento' si ese celular tiene un solo documento (o si
--      la cuenta ya tiene fotos de cédula con otro), y 'en_duda' si sus
--      registros dicen documentos distintos: entonces no se sabe cuál es el de
--      la cuenta, y la página no lo afirma (ver BUENA FE, abajo);
--   2. sin registro con qué comparar (o un documento vacío) es «no se sabe»,
--      nunca «es el mismo»: la lectura tampoco entra ('sin_documento');
--   3. LAS FOTOS DE CÉDULA QUE YA HABÍA NO SE PISAN con las de una lectura que
--      no cuadra con ellas. Desde hoy cada foto de cédula guarda el documento
--      de la lectura con que entró (registro_archivos.documento). Si la cuenta
--      ya tiene fotos con un documento, solo las reemplaza una lectura de ese
--      mismo documento: ni la de otro (aunque alguien haya escrito ese otro
--      documento en un registro nuevo de esta cuenta), ni unas fotos sin
--      código, que no dicen de quién son. Las que no entran por esto vuelven
--      en `descartados`, para que el teléfono no las reintente.
-- Lo demás de la función sigue igual: el cotejo, la cédula repetida, el
-- desempate y los tres bloques protegidos. Solo cambia QUÉ fila mira el
-- cotejo cuando hay lectura: la de ese documento, si la hay (la de ESTE
-- registro), y si no la última, como siempre.
--
-- Y EN registrar_abierto Y registrar_abierto_app (V6): el atajo contra el
-- doble toque miraba el teléfono O LA CÉDULA. Si alguien había abierto antes
-- una fila 'nuevo' con la cédula de María y su propio celular —la escribió a
-- mano, o la dejó puesta del escaneo de ella—, el registro de María no entraba
-- a la bandeja y la función contestaba ok: ella leía «Listo. Revisamos tu
-- solicitud» y Joan no tenía fila suya. Ahora el atajo mira el teléfono Y la
-- cédula JUNTOS (dos toques del mismo botón siguen sin duplicar, y la misma
-- persona que se vuelve a registrar con su celular y su documento tampoco).
-- Una cédula que ya está en otra fila 'nuevo' con otro teléfono entra igual,
-- marcada en la huella (cedula_repetida_al_registrarse), para que Joan decida
-- cuál es la de verdad. La revisión de 📥 Registrados ya compara las cédulas
-- de las filas que tiene a mano (app/revision-registro.js, «La cédula
-- repetida»).
--
-- BUENA FE — 20-oct-2026, segunda vuelta. La verificación del rediseño
-- confirmó que el atacante ya no cruza cédulas entre cuentas, pero que la
-- persona de buena fe perdía sus propias fotos en dos casos de la base:
--   A2. María tiene una fila 'nuevo' con el documento mal tecleado (de una
--       inscripción anterior, o de este mismo registro si la bandeja alcanzó a
--       entrar y la cuenta no salió por falta de señal). Lo corrige escaneando
--       su cédula y vuelve a tocar «Abrir mi cuenta». El atajo «solo por
--       teléfono» contestaba ok SIN insertar, la reja comparaba su lectura con
--       la fila vieja y le contestaba 'otro_documento': la página soltaba sus
--       fotos y le decía que no eran las del documento de su cuenta. Ahora el
--       atajo mira (teléfono, cédula): una corrección entra como fila NUEVA,
--       marcada (otro_documento_mismo_celular) y SIN pisar la vieja —que era
--       lo que protegía el «a propósito NO se actualiza» de 20260909: quien
--       sepa tu celular no puede cambiarte los datos que Joan va a mirar—.
--   A1. registrar_abierto se llama SIN SESIÓN. Cualquiera que sepa un celular
--       podía escribir una fila con otro documento (si la de la titular ya no
--       estaba 'nuevo'), volverla «el último registro de la cuenta», y la reja
--       le rechazaba a la titular su propia cédula. Una fila que cualquiera
--       escribe no puede decidir sola un rechazo: la lectura entra si es el
--       documento de CUALQUIERA de los registros de ese celular (salvo los que
--       Joan descartó), y si sus registros dicen documentos distintos y la
--       lectura no es de ninguno, el motivo es 'en_duda', no 'otro_documento'.
--       Las fotos que la cuenta ya tiene con su código sí deciden: esas solo
--       las sube la sesión de la cuenta.
-- Lo que esto NO cambia: quien DELIBERADAMENTE escribe una fila con el
-- documento de otra persona y su propio celular, y después sube esa cédula
-- desde su cuenta, entra (ya era así con «la última fila»: el residual
-- declarado en play/, LA CÉDULA SIN CÓDIGO SE CONFIRMA MIRÁNDOLA). Lo ven en
-- el CRM la cara contra la foto y la cédula repetida.
--
-- LAS FUNCIONES NO SE COPIAN. Se lee la que está viva con pg_get_functiondef,
-- se le meten los bloques nuevos en sus anclas y se vuelve a crear (lección de
-- la casa: copiar un cuerpo a mano ya perdió cosas en silencio; ver 20261002d).
-- Antes de tocarlas se compara la huella (md5 del cuerpo sin \r) con la que
-- dejó su última migración: si alguien las cambió desde entonces, el archivo
-- para y lo dice, sin tocar nada.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
do $$
begin
  if to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)') is null
     or to_regprocedure('public.cedula_cotejar(jsonb, jsonb)') is null then
    raise exception 'Falta base/20260922c_verificacion_cedula.sql (registro_archivos_guardar con el cotejo). Córrela primero. No se tocó nada.';
  end if;
  if to_regprocedure('public.registrar_abierto(text, text, text, jsonb)') is null then
    raise exception 'Falta base/20260909_una_sola_puerta.sql (registrar_abierto). Córrela primero. No se tocó nada.';
  end if;
  if to_regclass('public.registro_archivos') is null or to_regclass('public.registros') is null then
    raise exception 'Faltan las tablas registros o registro_archivos (base/supabase.sql, base/20260908b_registro_archivos.sql). No se tocó nada.';
  end if;
  if to_regprocedure('public.celular_de_sesion()') is null or to_regprocedure('public.solo_digitos(text)') is null then
    raise exception 'Falta celular_de_sesion (base/20260908_primer_credito.sql) o solo_digitos (base/supabase.sql). No se tocó nada.';
  end if;
end $$;

-- ====== 1. DE QUÉ DOCUMENTO ES CADA FOTO DE CÉDULA ======
-- Vacía para las fotos de antes: no se sabe, y no se inventa. Solo la llena
-- registro_archivos_guardar, con la lectura que entró con la foto.
alter table public.registro_archivos add column if not exists documento text;
comment on column public.registro_archivos.documento is
  '20-oct-2026: el documento (solo dígitos, sin ceros a la izquierda) de la lectura del código de barras con que entró esta foto de cédula. Vacío si entró sin lectura. Una lectura de otro documento no la reemplaza.';

-- ====== 2. LA REJA, DENTRO DE registro_archivos_guardar ======
do $$
declare
  f      regprocedure := 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure;
  cuerpo text;
  src    text;
  nueva  text;
  -- La huella del cuerpo que dejó base/20260922c_verificacion_cedula.sql, sin \r.
  huella constant text := 'b7e7ceeaa4f8434a1b70014dff4af9c8';
begin
  select p.prosrc into cuerpo from pg_proc p where p.oid = f;

  -- Ya aplicada: la segunda corrida no cambia nada.
  if position('cedula_rechazada' in cuerpo) > 0 then
    raise notice 'registro_archivos_guardar ya rechaza la cédula de otro documento: no se cambió nada.';
    return;
  end if;

  if md5(replace(cuerpo, chr(13), '')) <> huella then
    raise exception 'La definición viva de registro_archivos_guardar cambió desde el 22-sep-2026 (huella %, esperaba %). Este archivo la parcharía sin saber qué tiene. No se tocó nada: compárala con pg_get_functiondef y avísale a Claude.',
      md5(replace(cuerpo, chr(13), '')), huella;
  end if;

  src := pg_get_functiondef(f);

  -- (a) Las variables nuevas, con prefijo: la función actualiza tablas cuyas
  -- columnas se llaman parecido (la trampa de los trece días, 20260921).
  nueva := regexp_replace(src,
    $p$guardados\s+text\[\]\s*:=\s*'\{\}';$p$,
    $r$guardados text[] := '{}';
  -- 20-oct-2026 (base/20261020_la_cedula_de_la_cuenta.sql): la reja de la cédula.
  v_tg_doc_leido    text;
  v_tg_doc_fotos    text;
  v_tg_reg          bigint;
  v_tg_reg_igual    bigint;
  v_tg_docs         integer := 0;
  v_tg_motivo       text;
  v_tg_descartados  text[] := '{}';$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar la línea «guardados text[] := ''{}'';». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (b) La reja, justo después de saber de qué cuenta es la sesión y ANTES de
  -- guardar nada. En el texto de reemplazo la barra va doble ('\\D'):
  -- regexp_replace se come una (la trampa de 20261019_el_gerente_no_se_propone).
  src := nueva;
  nueva := regexp_replace(src,
    $p$(if\s+cel\s+is\s+null\s+then\s+perform\s+pg_sleep\(0\.3\);\s+return\s+jsonb_build_object\('ok',\s*false\);\s+end\s+if;)$p$,
    $r$\1

  -- 20-oct-2026 (base/20261020_la_cedula_de_la_cuenta.sql) — LA CÉDULA ES LA
  -- DE UN REGISTRO DE ESTA CUENTA. Antes de guardar nada: una lectura del
  -- código de barras cuyo documento no es el de ningún registro de este
  -- celular, o sin registro con qué compararla, no entra; y las fotos de
  -- cédula que ya hay, con su documento, no las reemplaza una lectura de otro
  -- documento ni unas fotos sin código.
  -- 20-oct-2026, buena fe — CUALQUIER registro, y no solo el último: los
  -- registros se escriben SIN SESIÓN (registrar_abierto), y una fila que
  -- cualquiera escribe con tu celular no puede rechazarte tu propia cédula
  -- (A1), ni la fila vieja de un documento mal tecleado la corrección (A2).
  -- Los que Joan descartó no cuentan.
  p_archivos := coalesce(p_archivos, '{}'::jsonb);
  p_huella   := coalesce(p_huella, '{}'::jsonb);
  select r.id into v_tg_reg
    from public.registros r
   where right(public.solo_digitos(r.telefono), 10) = right(cel, 10)
   order by r.creado_en desc, r.id desc
   limit 1;
  select a.documento into v_tg_doc_fotos
    from public.registro_archivos a
   where a.celular = cel and a.tipo in ('cedula_frente', 'cedula_reverso')
     and coalesce(a.documento, '') <> ''
   order by a.creado_en desc, a.id desc
   limit 1;
  if p_huella ? 'cedula_leida' then
    v_tg_doc_leido := regexp_replace(regexp_replace(
      coalesce(p_huella -> 'cedula_leida' ->> 'documento', ''), '\\D', '', 'g'), '^0+', '');
    -- Cuántos documentos distintos dicen los registros de este celular, y el
    -- último que dice el de la lectura (la fila de ESTE registro).
    select count(distinct d.doc),
           (array_agg(d.id order by d.creado_en desc, d.id desc) filter (where d.doc = v_tg_doc_leido))[1]
      into v_tg_docs, v_tg_reg_igual
      from (select r.id, r.creado_en,
                   regexp_replace(regexp_replace(
                     coalesce(nullif(coalesce(r.datos ->> 'documento', ''), ''), r.cedula, ''), '\\D', '', 'g'), '^0+', '') as doc
              from public.registros r
             where right(public.solo_digitos(r.telefono), 10) = right(cel, 10)
               and coalesce(r.estado, '') <> 'descartado') d
     where d.doc <> '';
    if coalesce(v_tg_doc_leido, '') = '' or coalesce(v_tg_docs, 0) = 0 then
      v_tg_motivo := 'sin_documento';
    elsif coalesce(v_tg_doc_fotos, '') <> '' and v_tg_doc_fotos <> v_tg_doc_leido then
      -- Las fotos que la cuenta ya tiene con su código las subió la sesión de
      -- esta cuenta: eso sí lo sabe la base.
      v_tg_motivo := 'otro_documento';
    elsif v_tg_reg_igual is null then
      v_tg_motivo := case when v_tg_docs > 1 then 'en_duda' else 'otro_documento' end;
    end if;
  elsif coalesce(v_tg_doc_fotos, '') <> '' then
    -- (alias propio: «k» ya es una variable de la función)
    select coalesce(array_agg(e.cual), '{}') into v_tg_descartados
      from unnest(array['cedula_frente', 'cedula_reverso']) as e(cual)
     where p_archivos ? e.cual;
    p_archivos := p_archivos - 'cedula_frente' - 'cedula_reverso';
  end if;
  if v_tg_motivo is not null then
    -- Nada de esa llamada se guarda. Solo la marca, sin un dato de la otra
    -- persona, en el registro de esta cuenta (si lo hay).
    begin
      if v_tg_reg is not null then
        update public.registros r
           set huella = coalesce(r.huella, '{}'::jsonb) || jsonb_build_object('cedula_rechazada',
                 jsonb_build_object('motivo', v_tg_motivo, 'momento', now()))
         where r.id = v_tg_reg;
      end if;
    exception when others then
      null;
    end;
    return jsonb_build_object('ok', false, 'motivo', v_tg_motivo);
  end if;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar el «if cel is null then … return jsonb_build_object(''ok'', false); end if;». Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (b2) 20-oct-2026, buena fe — la huella (la lectura, el GPS, el cotejo) va
  -- a la fila de ESTE registro, la que la reja encontró con el documento
  -- leído, y no a la última de ese celular: esa la pudo escribir cualquiera
  -- sin sesión (A1), y el cotejo diría 'no_cuadra' de una cédula que sí es.
  -- Sin lectura, la última, como siempre (el desempate por id se queda).
  src := nueva;
  nueva := regexp_replace(src,
    $p$(select\s+r\.id,\s*r\.datos,\s*r\.cedula,\s*r\.nombre\s+into\s+v_reg,\s*v_datos,\s*v_ced,\s*v_nom\s+from\s+public\.registros\s+r\s+where\s+right\(public\.solo_digitos\(r\.telefono\),\s*10\)\s*=\s*right\(cel,\s*10\))\s+order\s+by\s+r\.creado_en\s+desc,\s*r\.id\s+desc$p$,
    $r$\1
     order by coalesce(r.id = v_tg_reg_igual, false) desc, r.creado_en desc, r.id desc$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar el BLOQUE 1 («select r.id, r.datos, r.cedula, r.nombre into v_reg …»). Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (c) Cada foto de cédula guarda el documento de la lectura con que entra
  -- (vacío si entró sin lectura).
  src := nueva;
  nueva := regexp_replace(src,
    $p$insert\s+into\s+public\.registro_archivos\s+\(celular,\s*tipo,\s*imagen\)\s+values\s+\(cel,\s*k,\s*v\)\s+on\s+conflict\s+\(celular,\s*tipo\)\s+do\s+update\s+set\s+imagen\s*=\s*excluded\.imagen,\s*creado_en\s*=\s*now\(\);$p$,
    $r$insert into public.registro_archivos (celular, tipo, imagen, documento)
    values (cel, k, v, case when k in ('cedula_frente', 'cedula_reverso') then nullif(v_tg_doc_leido, '') end)
    on conflict (celular, tipo) do update
      set imagen = excluded.imagen, creado_en = now(), documento = excluded.documento;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar el insert de las fotos. Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (d) Y la respuesta dice qué fotos no entraron por no pisar las que había.
  src := nueva;
  nueva := regexp_replace(src,
    $p$return\s+jsonb_build_object\('ok',\s*true,\s*'fotos',\s*n,\s*'guardados',\s*to_jsonb\(guardados\)\);$p$,
    $r$return jsonb_build_object('ok', true, 'fotos', n, 'guardados', to_jsonb(guardados),
                            'descartados', to_jsonb(v_tg_descartados));$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar la respuesta final. Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end $$;

-- ====== 3. EL ATAJO DE registrar_abierto MIRA EL TELÉFONO Y LA CÉDULA (V6; A2) ======
do $$
declare
  f      regprocedure := 'public.registrar_abierto(text, text, text, jsonb)'::regprocedure;
  cuerpo text;
  src    text;
  nueva  text;
  -- La huella del cuerpo que dejó base/20260909_una_sola_puerta.sql, sin \r.
  huella constant text := 'f5157a717949e80c4558e53b0aaa43e6';
begin
  select p.prosrc into cuerpo from pg_proc p where p.oid = f;
  if position('cedula_repetida_al_registrarse' in cuerpo) > 0 then
    raise notice 'registrar_abierto ya no descarta el registro de otra persona con la misma cédula: no se cambió nada.';
    return;
  end if;
  if md5(replace(cuerpo, chr(13), '')) <> huella then
    raise exception 'La definición viva de registrar_abierto cambió desde el 9-sep-2026 (huella %, esperaba %). Este archivo la parcharía sin saber qué tiene. No se tocó nada: compárala con pg_get_functiondef y avísale a Claude.',
      md5(replace(cuerpo, chr(13), '')), huella;
  end if;
  src := pg_get_functiondef(f);
  nueva := regexp_replace(src,
    $p$if\s+not\s+exists\s+\(\s*select\s+1\s+from\s+public\.registros\s+where\s+estado\s*=\s*'nuevo'\s+and\s+\(telefono\s*=\s*cel\s+or\s+\(ced\s*<>\s*''\s+and\s+cedula\s*=\s*ced\)\)\s*\)\s+then\s+insert\s+into\s+public\.registros\s+\(codigo,\s*cedula,\s*nombre,\s*telefono,\s*datos,\s*origen\)\s+values\s+\(''\s*,\s*ced,\s*nom,\s*cel,\s*limpio,\s*'abierto'\);\s+end\s+if;$p$,
    $r$-- 20-oct-2026 (base/20261020_la_cedula_de_la_cuenta.sql) — EL ATAJO MIRA
  -- EL TELÉFONO Y LA CÉDULA JUNTOS. Miraba el teléfono O la cédula, y quien
  -- había dejado antes una fila con la cédula de otra persona (y su propio
  -- celular) le tumbaba en silencio el registro a la dueña: no entraba y se le
  -- contestaba ok. Una cédula que ya está en otra fila con otro teléfono entra
  -- igual, marcada.
  -- 20-oct-2026, buena fe — y no SOLO el teléfono: quien corrige su documento
  -- (o se vuelve a inscribir con otro) no entraba, y la reja de
  -- registro_archivos_guardar le rechazaba su propia cédula comparándola con
  -- la fila vieja. La corrección entra como fila NUEVA, marcada
  -- (otro_documento_mismo_celular), y la vieja NO se toca: quien sepa tu
  -- celular sigue sin poder cambiar los datos que Joan va a mirar. Dos toques
  -- del mismo botón siguen sin duplicar.
  if not exists (
       select 1 from public.registros
        where estado = 'nuevo'
          and telefono = cel
          and cedula = ced
     ) then
    insert into public.registros (codigo, cedula, nombre, telefono, datos, huella, origen)
    values ('', ced, nom, cel, limpio,
            nullif(
              (case when ced <> '' and exists (
                      select 1 from public.registros r2
                       where r2.estado = 'nuevo' and r2.cedula = ced and r2.telefono <> cel)
                    then jsonb_build_object('cedula_repetida_al_registrarse', jsonb_build_object('momento', now()))
                    else '{}'::jsonb end)
              || (case when exists (
                      select 1 from public.registros r3
                       where r3.telefono = cel and r3.cedula <> ced)
                    then jsonb_build_object('otro_documento_mismo_celular', jsonb_build_object('momento', now()))
                    else '{}'::jsonb end),
              '{}'::jsonb),
            'abierto');
  end if;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registrar_abierto el atajo «if not exists (… telefono = cel or (ced <> '''' and cedula = ced)) then insert …». Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end $$;

-- La puerta de PlataChat, igual (si PlataChat está aplicado).
do $$
declare
  f      regprocedure := to_regprocedure('public.registrar_abierto_app(text, text, text, jsonb, text)');
  cuerpo text;
  src    text;
  nueva  text;
  -- La huella del cuerpo que dejó base/20260921_platachat_app.sql, sin \r.
  huella constant text := '901e0c7ad038900db551700fa25965c9';
begin
  if f is null then
    raise notice 'registrar_abierto_app no existe (PlataChat sin aplicar): no hay puerta que cambiar ahí.';
    return;
  end if;
  select p.prosrc into cuerpo from pg_proc p where p.oid = f;
  if position('cedula_repetida_al_registrarse' in cuerpo) > 0 then
    raise notice 'registrar_abierto_app ya no descarta el registro de otra persona con la misma cédula: no se cambió nada.';
    return;
  end if;
  if md5(replace(cuerpo, chr(13), '')) <> huella then
    raise exception 'La definición viva de registrar_abierto_app cambió desde el 21-sep-2026 (huella %, esperaba %). Este archivo la parcharía sin saber qué tiene. No se tocó nada: compárala con pg_get_functiondef y avísale a Claude.',
      md5(replace(cuerpo, chr(13), '')), huella;
  end if;
  src := pg_get_functiondef(f);
  nueva := regexp_replace(src,
    $p$if\s+not\s+exists\s+\(\s*select\s+1\s+from\s+public\.registros\s+where\s+estado\s*=\s*'nuevo'\s+and\s+\(telefono\s*=\s*cel\s+or\s+\(ced\s*<>\s*''\s+and\s+cedula\s*=\s*ced\)\)\s*\)\s+then\s+insert\s+into\s+public\.registros\s+\(codigo,\s*cedula,\s*nombre,\s*telefono,\s*datos,\s*origen,\s*app\)\s+values\s+\(''\s*,\s*ced,\s*nom,\s*cel,\s*limpio,\s*'abierto',\s*v_app\);\s+end\s+if;$p$,
    $r$-- 20-oct-2026 (base/20261020_la_cedula_de_la_cuenta.sql) — EL ATAJO MIRA
  -- EL TELÉFONO Y LA CÉDULA JUNTOS, como en registrar_abierto: una cédula que
  -- ya está en otra fila con otro teléfono entra igual, marcada; y una
  -- corrección del documento con el mismo celular entra como fila nueva,
  -- marcada, sin tocar la vieja (20-oct-2026, buena fe).
  if not exists (
       select 1 from public.registros
        where estado = 'nuevo'
          and telefono = cel
          and cedula = ced
     ) then
    insert into public.registros (codigo, cedula, nombre, telefono, datos, huella, origen, app)
    values ('', ced, nom, cel, limpio,
            nullif(
              (case when ced <> '' and exists (
                      select 1 from public.registros r2
                       where r2.estado = 'nuevo' and r2.cedula = ced and r2.telefono <> cel)
                    then jsonb_build_object('cedula_repetida_al_registrarse', jsonb_build_object('momento', now()))
                    else '{}'::jsonb end)
              || (case when exists (
                      select 1 from public.registros r3
                       where r3.telefono = cel and r3.cedula <> ced)
                    then jsonb_build_object('otro_documento_mismo_celular', jsonb_build_object('momento', now()))
                    else '{}'::jsonb end),
              '{}'::jsonb),
            'abierto', v_app);
  end if;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registrar_abierto_app el atajo «if not exists (… telefono = cel or (ced <> '''' and cedula = ced)) then insert …». Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end $$;

-- ====== 4. PERMISOS ======
-- Los de siempre, explícitos: create or replace los conserva, pero en este
-- proyecto se aprendió que hay que decirlos (Supabase le regala EXECUTE a anon
-- y authenticated, y `revoke ... from public` no cierra nada).
revoke all on function public.registro_archivos_guardar(jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.registro_archivos_guardar(jsonb, jsonb) to authenticated;
revoke all on function public.registrar_abierto(text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.registrar_abierto(text, text, text, jsonb) to anon;
do $$
begin
  if to_regprocedure('public.registrar_abierto_app(text, text, text, jsonb, text)') is not null then
    execute 'revoke all on function public.registrar_abierto_app(text, text, text, jsonb, text) from public, anon, authenticated';
    execute 'grant execute on function public.registrar_abierto_app(text, text, text, jsonb, text) to anon';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ====== 5. QUÉ SE COMPRUEBA ======
-- No basta con que el texto esté: PL/pgSQL compila cada consulta la primera vez
-- que la CORRE (así vivió trece días rota registro_archivos_guardar). Se llama
-- con un celular de mentira que no es de nadie, por los caminos nuevos, y lo
-- que escribe se deshace dentro de la misma prueba (un bloque que termina en
-- su propia excepción, atrapada: la base vuelve atrás solo ese bloque). No se
-- crea ningún registro: la tabla de registros puede tener avisos enganchados
-- desde el panel de Supabase. Si algo falla, el archivo entero se deshace.
do $prueba$
declare
  v_cel  text := '3009990820';
  j      jsonb;
  pasos  text := '';
  src    text;
begin
  select p.prosrc into src from pg_proc p
   where p.oid = 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure;
  if position('cedula_rechazada' in src) = 0 or position('v_tg_descartados' in src) = 0 then
    raise exception 'FALLO: registro_archivos_guardar no quedó con la reja de la cédula.';
  end if;
  -- Lo de antes, entero: el cotejo en su bloque protegido, la cédula repetida
  -- y el desempate (los centinelas de 20260922c).
  if src !~ 'cedula_cotejar' or src !~ 'cedula_repetida' or src !~ 'creado_en desc, r\.id desc'
     or position('exception when others then' in substr(src, position('cedula_cotejar' in src))) = 0 then
    raise exception 'FALLO: a registro_archivos_guardar se le perdió una pieza de antes (el cotejo, la cédula repetida o el desempate).';
  end if;
  if position('cedula_rechazada' in src) > position('insert into public.registro_archivos' in src) then
    raise exception 'FALLO: la reja quedó DESPUÉS de guardar las fotos.';
  end if;
  -- 20-oct-2026, buena fe: la reja mira TODOS los registros del celular (A1),
  -- dice 'en_duda' cuando no se sabe, y la huella va a la fila de la lectura.
  if position('en_duda' in src) = 0 or position('v_tg_reg_igual' in src) = 0
     or src !~ 'order by coalesce\(r\.id = v_tg_reg_igual, false\) desc, r\.creado_en desc, r\.id desc' then
    raise exception 'FALLO: la reja de registro_archivos_guardar no quedó con la buena fe (todos los registros, en_duda, la fila de la lectura).';
  end if;
  select p.prosrc into src from pg_proc p
   where p.oid = 'public.registrar_abierto(text, text, text, jsonb)'::regprocedure;
  src := regexp_replace(src, '--[^' || chr(10) || ']*', '', 'g');
  if position('cedula_repetida_al_registrarse' in src) = 0 or src ~ 'cedula\s*=\s*ced\)\)'
     or position('otro_documento_mismo_celular' in src) = 0
     or src !~ 'telefono\s*=\s*cel\s+and\s+cedula\s*=\s*ced\s*\)\s*then'
     or src !~ 'puede_intentar_tope' or src !~ 'limpiar_fallos' then
    raise exception 'FALLO: registrar_abierto no quedó con el atajo por (teléfono, cédula), o perdió un freno.';
  end if;
  if to_regprocedure('public.registrar_abierto_app(text, text, text, jsonb, text)') is not null then
    select p.prosrc into src from pg_proc p
     where p.oid = 'public.registrar_abierto_app(text, text, text, jsonb, text)'::regprocedure;
    src := regexp_replace(src, '--[^' || chr(10) || ']*', '', 'g');
    if position('cedula_repetida_al_registrarse' in src) = 0 or src ~ 'cedula\s*=\s*ced\)\)'
       or position('otro_documento_mismo_celular' in src) = 0
       or src !~ 'telefono\s*=\s*cel\s+and\s+cedula\s*=\s*ced\s*\)\s*then'
       or src !~ 'origen, app\)' then
      raise exception 'FALLO: registrar_abierto_app no quedó con el atajo por (teléfono, cédula), o perdió la etiqueta.';
    end if;
  end if;
  if has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')
     or not has_function_privilege('anon', 'public.registrar_abierto(text, text, text, jsonb)', 'execute') then
    raise exception 'FALLO: los permisos no quedaron como deben.';
  end if;

  if exists (select 1 from public.registro_archivos where celular = v_cel)
     or exists (select 1 from public.registros where right(public.solo_digitos(coalesce(telefono, '')), 10) = v_cel) then
    raise notice 'El celular de prueba % ya existe en la base: la prueba llamando no corre (lo de arriba sí se comprobó).', v_cel;
    return;
  end if;

  -- Sin sesión, nada (como siempre).
  perform set_config('request.jwt.claims', '', true);
  j := public.registro_archivos_guardar('{}'::jsonb, '{}'::jsonb);
  if j is distinct from '{"ok": false}'::jsonb then
    raise exception 'FALLO: sin sesión, registro_archivos_guardar contestó %.', j;
  end if;
  pasos := pasos || '1 sin-sesion; ';

  perform set_config('request.jwt.claims', '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
  -- Una lectura sin registro con qué compararla: no se sabe, no entra.
  j := public.registro_archivos_guardar(
         '{"cedula_reverso":"data:image/jpeg;base64,AAAA"}'::jsonb,
         '{"cedula_leida":{"documento":"52123456"}}'::jsonb);
  if j ->> 'motivo' is distinct from 'sin_documento'
     or exists (select 1 from public.registro_archivos where celular = v_cel) then
    raise exception 'FALLO: una lectura sin registro con qué compararla entró: %.', j;
  end if;
  pasos := pasos || '2 sin-registro-no; ';

  -- Fotos sin lectura a una cuenta sin fotos de cédula: entran (vacío el
  -- documento). Y encima de unas con documento: no las pisan. Todo se deshace.
  begin
    j := public.registro_archivos_guardar('{"cedula_reverso":"data:image/jpeg;base64,AAAA"}'::jsonb, '{}'::jsonb);
    if j ->> 'ok' is distinct from 'true' or (j -> 'guardados') <> '["cedula_reverso"]'::jsonb
       or (select documento from public.registro_archivos where celular = v_cel and tipo = 'cedula_reverso') is not null then
      raise exception 'FALLO: una foto sin lectura a una cuenta sin fotos no entró como siempre: %.', j;
    end if;
    update public.registro_archivos set documento = '79111222', imagen = 'data:image/jpeg;base64,BBBB'
     where celular = v_cel and tipo = 'cedula_reverso';
    j := public.registro_archivos_guardar('{"cedula_reverso":"data:image/jpeg;base64,CCCC"}'::jsonb, '{}'::jsonb);
    if (j -> 'descartados') <> '["cedula_reverso"]'::jsonb
       or (select imagen from public.registro_archivos where celular = v_cel and tipo = 'cedula_reverso') <> 'data:image/jpeg;base64,BBBB' then
      raise exception 'FALLO: unas fotos sin código pisaron las que tenían documento: %.', j;
    end if;
    raise exception 'deshacer-la-prueba-20261020';
  exception when others then
    if sqlerrm <> 'deshacer-la-prueba-20261020' then raise; end if;
  end;
  if exists (select 1 from public.registro_archivos where celular = v_cel) then
    raise exception 'FALLO: la prueba no deshizo lo que escribió.';
  end if;
  pasos := pasos || '3 sin-lectura-no-pisa; ';
  perform set_config('request.jwt.claims', '', true);
  raise notice 'La cédula de la cuenta: %', pasos;
  raise notice 'Listo: la cédula ya no se cuela en la cuenta de otro. Falta: Settings → API → Reload schema.';
end
$prueba$;
