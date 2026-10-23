-- ===========================================================================
-- LA FOTO QUE NO ENTRA SE DICE — 22 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- toca ninguna fila: cambia una función y al final la comprueba. Va DESPUÉS de
-- base/20261020_la_cedula_de_la_cuenta.sql (la reja de la cédula y la
-- autorización de datos sensibles), que ya está aplicada desde el 21-oct.
-- Sirve en cualquier orden con la app: la v138 publicada no manda nada de lo
-- nuevo y no lee lo nuevo, y la del lote 1 funciona igual sin esto.
-- Al final sale UNA TABLA con una fila por comprobación y una columna «ok»:
-- todas tienen que decir true. Después: Settings → API → «Reload schema».
--
-- ---------------------------------------------------------------------------
-- POR QUÉ
--
-- Joan: «William se registró y se tomó la selfie pero no me aparece en mi
-- CRM». La base guardó todo lo que recibió y el CRM mostraba todo lo que
-- había: la selfie de William nunca salió del teléfono. Pero buscando eso
-- apareció un hueco de la base que habría producido el MISMO síntoma sin dejar
-- rastro: registro_archivos_guardar se saltaba EN SILENCIO una foto que no
-- empezara por data:image/ o pasara de 600.000 caracteres (`continue`). No
-- contestaba nada de ella: el teléfono la reintentaba cada vez que se entraba
-- a la cuenta hasta que la cola caducaba, y ni la base ni el CRM sabían que
-- había existido. Y cuando la persona seguía sin tomarse la foto, la base no
-- tenía cómo saberlo: el CRM no podía distinguir «no la tomó» de «no llegó».
--
-- LO QUE CAMBIA EN registro_archivos_guardar (nada más):
--   B1. La foto que no entra se DICE: la respuesta trae `rechazadas`
--       [{tipo, motivo}] (motivo 'no_es_imagen' o 'muy_grande') y la huella
--       del registro guarda `fotos_rechazadas` {fotos, momento}, SIN la imagen.
--       Va en una llave nueva y no en `descartados`: el teléfono publicado lee
--       `descartados` como «ya teníamos tu cédula leída, dejamos esas», que
--       sería falso para una selfie. Con la llave nueva, la v138 sigue igual.
--   B2. La huella acepta `selfie_omitida` {motivo}, con el momento que pone el
--       servidor, cuando la persona siguió sin la foto de su cara. Solo uno
--       de cuatro motivos (siguio_sin_ella, repitio_y_siguio, sin_camara,
--       camara_del_sistema_sin_volver): lo que HIZO la persona, nada que haya
--       medido el teléfono. Si la llamada trae la selfie, se ignora, y cuando
--       la selfie por fin entra, la marca vieja se quita.
--   Lo demás de la función sigue igual: la autorización de datos sensibles
--   (que va antes que todo), la reja de la cédula, el cotejo, la cédula
--   repetida, el desempate y los tres bloques protegidos.
--
-- LA FUNCIÓN NO SE COPIA. Se lee la viva con pg_get_functiondef, se le meten
-- los bloques nuevos en sus anclas y se vuelve a crear (lección de la casa:
-- copiar un cuerpo a mano ya perdió cosas en silencio; ver 20261002d). Antes
-- de tocarla se compara la huella (md5 del cuerpo sin \r) con la que dejó
-- base/20261020_la_cedula_de_la_cuenta.sql: si alguien la cambió desde
-- entonces, el archivo para y lo dice, sin tocar nada.
-- ===========================================================================

-- ====== 0. LO QUE TIENE QUE EXISTIR ANTES ======
do $$
declare cuerpo text;
begin
  if to_regprocedure('public.registro_archivos_guardar(jsonb, jsonb)') is null then
    raise exception 'Falta registro_archivos_guardar (base/20260908b_registro_archivos.sql y siguientes). No se tocó nada.';
  end if;
  select p.prosrc into cuerpo from pg_proc p where p.oid = 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure;
  if position('sin_autorizacion' in cuerpo) = 0 or position('cedula_rechazada' in cuerpo) = 0 then
    raise exception 'registro_archivos_guardar no tiene todavía la reja de la cédula y la autorización (base/20261020_la_cedula_de_la_cuenta.sql). Córrela primero. No se tocó nada.';
  end if;
end $$;

-- ====== 1. LA FOTO QUE NO ENTRA SE DICE, Y LA SELFIE OMITIDA SE ANOTA ======
do $$
declare
  f      regprocedure := 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure;
  cuerpo text;
  src    text;
  nueva  text;
  -- La huella del cuerpo que dejó base/20261020_la_cedula_de_la_cuenta.sql
  -- (con su paso 2-bis), sin \r.
  huella constant text := '63fe473024fc1ac8f2d358677adcc176';
begin
  select p.prosrc into cuerpo from pg_proc p where p.oid = f;

  -- Ya aplicada: la segunda corrida no cambia nada.
  if position('fotos_rechazadas' in cuerpo) > 0 then
    raise notice 'registro_archivos_guardar ya dice qué foto no entró: no se cambió nada.';
    return;
  end if;

  if md5(replace(cuerpo, chr(13), '')) <> huella then
    raise exception 'La definición viva de registro_archivos_guardar cambió desde el 21-oct-2026 (huella %, esperaba %). Este archivo la parcharía sin saber qué tiene. No se tocó nada: compárala con pg_get_functiondef y avísale a Claude.',
      md5(replace(cuerpo, chr(13), '')), huella;
  end if;

  src := pg_get_functiondef(f);

  -- (a) La variable nueva, con prefijo: la función actualiza tablas cuyas
  -- columnas se llaman parecido (la trampa de los trece días, 20260921).
  nueva := regexp_replace(src,
    $p$v_tg_descartados\s+text\[\]\s*:=\s*'\{\}';$p$,
    $r$v_tg_descartados  text[] := '{}';
  -- 22-oct-2026 (base/20261022_la_foto_que_no_entra_se_dice.sql): las fotos
  -- que no entran, con su motivo y sin la imagen.
  v_tg_rechazadas   jsonb := '[]'::jsonb;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar la línea «v_tg_descartados text[] := ''{}'';». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (b) B1 — el `continue` mudo deja de ser mudo.
  src := nueva;
  nueva := regexp_replace(src,
    $p$if\s+v\s+is\s+null\s+or\s+v\s+not\s+like\s+'data:image/%'\s+or\s+length\(v\)\s*>\s*600000\s+then\s+continue;\s+end\s+if;$p$,
    $r$if v is null or v not like 'data:image/%' or length(v) > 600000 then
      -- 22-oct-2026 (base/20261022_la_foto_que_no_entra_se_dice.sql) — B1:
      -- ANTES ERA UN `continue` MUDO. Se sigue sin guardar, pero se dice cuál
      -- y por qué (sin la imagen): vuelve en `rechazadas` y queda en la huella.
      v_tg_rechazadas := v_tg_rechazadas || jsonb_build_array(jsonb_build_object(
        'tipo', k,
        'motivo', case when v is null or v not like 'data:image/%' then 'no_es_imagen' else 'muy_grande' end));
      continue;
    end if;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar el «if v is null or v not like ''data:image/%%'' or length(v) > 600000 then continue; end if;». Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (c) B1 y B2 en la huella, junto a la lectura de la cédula.
  src := nueva;
  nueva := regexp_replace(src,
    $p$(if\s+p_huella\s+\?\s+'cedula_leida'\s+then\s+v_huella\s*:=\s*v_huella\s*\|\|\s*jsonb_build_object\('cedula_leida',\s*p_huella\s*->\s*'cedula_leida'\);\s+end\s+if;)$p$,
    $r$\1
  -- 22-oct-2026 (base/20261022_la_foto_que_no_entra_se_dice.sql) — B1: las
  -- fotos que no entraron, sin la imagen. B2: la persona siguió sin la foto
  -- de su cara, y QUÉ hizo (uno de cuatro motivos; nada medido por el
  -- teléfono), con la hora del servidor. Si la llamada trae la selfie, no.
  if jsonb_array_length(v_tg_rechazadas) > 0 then
    v_huella := v_huella || jsonb_build_object('fotos_rechazadas',
      jsonb_build_object('fotos', v_tg_rechazadas, 'momento', now()));
  end if;
  if p_huella ? 'selfie_omitida' and not (coalesce(p_archivos, '{}'::jsonb) ? 'selfie')
     and coalesce(p_huella -> 'selfie_omitida' ->> 'motivo', '') in
         ('siguio_sin_ella', 'repitio_y_siguio', 'sin_camara', 'camara_del_sistema_sin_volver') then
    v_huella := v_huella || jsonb_build_object('selfie_omitida', jsonb_build_object(
      'motivo', p_huella -> 'selfie_omitida' ->> 'motivo', 'momento', now()));
  end if;$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar el «if p_huella ? ''cedula_leida'' then v_huella := … end if;». Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (d) El UPDATE de la huella: la marca de la selfie omitida se va cuando la
  -- selfie por fin entra, y la lista de rechazadas es la de la última llamada
  -- que trajo fotos (una vieja no se queda diciendo algo que ya no es).
  src := nueva;
  nueva := regexp_replace(src,
    $p$set\s+huella\s*=\s*coalesce\(r\.huella,\s*'\{\}'::jsonb\)\s*\|\|\s*v_huella$p$,
    $r$set huella = (coalesce(r.huella, '{}'::jsonb)
                     - (case when 'selfie' = any(guardados) then 'selfie_omitida' else '' end)
                     - (case when coalesce(p_archivos, '{}'::jsonb) <> '{}'::jsonb then 'fotos_rechazadas' else '' end))
                    || v_huella$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar el «set huella = coalesce(r.huella, ''{}''::jsonb) || v_huella» del BLOQUE 3. Alguien lo cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;

  -- (e) Y la respuesta dice cuáles no entraron, en su llave nueva.
  src := nueva;
  nueva := regexp_replace(src,
    $p$'descartados',\s*to_jsonb\(v_tg_descartados\)\);$p$,
    $r$'descartados', to_jsonb(v_tg_descartados),
                            'rechazadas', v_tg_rechazadas);$r$,
    '');
  if nueva = src then
    raise exception 'No encontré en registro_archivos_guardar la respuesta final con «descartados». Alguien la cambió: no se tocó nada. Compárala con pg_get_functiondef y avísale a Claude.';
  end if;
  execute nueva;
end $$;

-- ====== 2. PERMISOS ======
-- Los de siempre, explícitos (create or replace los conserva, pero en este
-- proyecto se aprendió a decirlos: Supabase le regala EXECUTE a anon y a
-- authenticated, y `revoke ... from public` no cierra nada). Con su nombre
-- armado por regprocedure: así este archivo no escribe la firma de la función
-- como texto, que es lo que vigila pruebas/la-cedula-de-la-cuenta-postgres.
do $$
declare f regprocedure := 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure;
begin
  execute format('revoke all on function %s from public, anon, authenticated', f);
  execute format('grant execute on function %s to authenticated', f);
end $$;

notify pgrst, 'reload schema';

-- ====== 3. LA PRUEBA, LLAMÁNDOLA ======
-- PL/pgSQL compila cada consulta la primera vez que la CORRE (así vivió trece
-- días rota esta misma función). Se llama con un celular de mentira, sin
-- sesión y con una sesión sin cuenta, por caminos que se devuelven ANTES de
-- escribir, y se comprueba que no quedó nada. No se crea ninguna cuenta en
-- auth.users (ver el porqué en 20261020, I5): los caminos que sí guardan se
-- prueban en la réplica (pruebas/la-foto-que-no-entra-se-dice-postgres.test.js).
do $prueba$
declare
  v_cel text := '3009991022';
  v_uid uuid := gen_random_uuid();
  j     jsonb;
begin
  if exists (select 1 from public.registro_archivos where celular = v_cel) then
    raise notice 'El celular de prueba % ya existe: la prueba llamando no corre (lo de abajo sí se comprueba).', v_cel;
    return;
  end if;
  perform set_config('request.jwt.claims', '', true);
  j := public.registro_archivos_guardar('{}'::jsonb, '{}'::jsonb);
  if j is distinct from '{"ok": false}'::jsonb then
    raise exception 'FALLO: sin sesión, registro_archivos_guardar contestó %.', j;
  end if;
  if not exists (select 1 from auth.users where id = v_uid) then
    perform set_config('request.jwt.claims', '{"sub":"' || v_uid || '","email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
    j := public.registro_archivos_guardar('{"selfie":"no es una foto"}'::jsonb, '{"selfie_omitida":{"motivo":"siguio_sin_ella"}}'::jsonb);
    if j ->> 'motivo' is distinct from 'sin_autorizacion' or exists (select 1 from public.registro_archivos where celular = v_cel) then
      raise exception 'FALLO: una sesión sin autorización dejó algo: %.', j;
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);
end
$prueba$;

-- ====== 4. LO QUE JOAN VE: una fila por comprobación, todas en true ======
-- (el editor de Supabase no muestra los NOTICE: por eso es un SELECT)
with f as (
  select p.prosrc as src from pg_proc p
   where p.oid = 'public.registro_archivos_guardar(jsonb, jsonb)'::regprocedure
)
select 'registro_archivos_guardar dice qué foto no entró (rechazadas)' as comprobacion,
       (position('''rechazadas'', v_tg_rechazadas' in src) > 0 and position('fotos_rechazadas' in src) > 0) as ok from f
union all
select 'ya no hay un continue mudo para la foto que no es imagen o es muy grande',
       (src !~ 'length\(v\)\s*>\s*600000\s+then\s+continue;') from f
union all
select 'anota la selfie omitida (solo los cuatro motivos)',
       (position('selfie_omitida' in src) > 0 and position('camara_del_sistema_sin_volver' in src) > 0) from f
union all
select 'la autorización de datos sensibles sigue antes que todo',
       (position('sin_autorizacion' in src) > 0 and position('sin_autorizacion' in src) < position('cedula_rechazada' in src)
        and position('sin_autorizacion' in src) < position('insert into public.registro_archivos' in src)) from f
union all
select 'la reja de la cédula, el cotejo y el desempate siguen',
       (position('cedula_rechazada' in src) > 0 and position('cedula_cotejar' in src) > 0
        and src ~ 'order by coalesce\(r\.id = v_tg_reg_igual, false\) desc, r\.creado_en desc, r\.id desc') from f
union all
select 'solo la llama una sesión (ni anon ni nadie sin sesión)',
       (not has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute')
        and has_function_privilege('authenticated', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute'));
