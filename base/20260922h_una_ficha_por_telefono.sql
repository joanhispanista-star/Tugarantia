-- 22-sep-2026 — UN TELÉFONO, UNA FICHA
--
-- Un defecto viejo que las fotos del chat acaban de volver caro.
--
-- `vincular_cuenta` se niega cuando la FICHA ya está reclamada («esa cuenta ya
-- está vinculada a otro teléfono»). Nunca mira lo contrario: si ESE TELÉFONO ya
-- reclamó otra ficha. Y el índice `socios_por_auth` sobre `auth_celular` NO es
-- único, así que nada lo impide por debajo.
--
-- Los códigos de acceso se mandan por WhatsApp y en las familias se comparten.
-- Mario tiene el suyo y el de su prima Ana, y él es quien instaló la app: puede
-- vincular LAS DOS fichas a su teléfono.
--
-- A partir de ahí, `llave_de_sesion(el celular de Mario)` encuentra dos filas y
-- decide con `order by actualizado_en desc limit 1`. Y aquí está la trampa fina:
-- `sincronizar_socios` pone `actualizado_en = now()` en todo el lote, y en
-- PostgreSQL **now() es la hora de INICIO DE LA TRANSACCIÓN**, la misma para
-- todas las filas. Después de cada publicación de Joan las dos fichas quedan
-- con el MISMO valor y el `limit 1` escoge una cualquiera — y ni siquiera
-- siempre la misma, porque tras un update la fila se mueve de sitio.
--
-- Es exactamente la familia de defecto que ya se arregló el 22-sep en
-- `mi_solicitud` (ver 20260922b_desempate). Volvió por otra puerta.
--
-- Lo que eso provoca ahora que se pueden mandar fotos:
--
--   · Mario sube su comprobante de pago y queda archivado en la conversación
--     de ANA. Joan lo lee bajo el nombre equivocado y decide sobre un abono
--     mirando el papel de otra persona.
--   · A la lectura siguiente puede ganar la otra cédula: la app le contesta
--     «no es tuya» a SU PROPIA foto y el hilo se le vacía.
--   · El tope de 60 fotos cuenta por esa misma llave, así que también salta.
--
-- Hoy hay **22 fichas y CERO vinculadas**: el defecto está latente y no ha
-- hecho daño. Por eso se cierra ahora, que no hay ni un duplicado que limpiar.
--
-- NO SE COPIAN CUERPOS. Se leen de la base con `pg_get_functiondef`, se les
-- cambia lo justo y se vuelven a crear — la misma técnica de 20260922b. Copiar
-- un cuerpo a mano es cómo se pierde silenciosamente un `pg_sleep` o el número
-- que devuelve un tope, y hoy ya estuvo a punto de pasar una vez.

-- ====== 1. EL DESEMPATE, en las tres que comparten el predicado ======
-- `socios_historial` tiene la clave primaria en `cedula`, así que ese es el
-- desempate estable. Se cambian LAS TRES y no solo `llave_de_sesion`: si el
-- hilo mira una ficha y la cuenta mira otra, es peor que el sorteo.
do $$
declare
  f        text;
  src      text;
  nueva    text;
  viejo    text;
  bueno    text;
  cambiadas int := 0;
begin
  foreach f in array array['llave_de_sesion', 'mi_cuenta', 'vincular_cuenta'] loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p
     where p.proname = f and p.pronamespace = 'public'::regnamespace;
    if src is null then
      raise exception 'no existe public.% — esto no se aplica a ciegas', f;
    end if;

    -- `llave_de_sesion` usa alias (`s.`), las otras dos no.
    if position('order by s.actualizado_en desc limit 1' in src) > 0 then
      viejo := 'order by s.actualizado_en desc limit 1';
      bueno := 'order by s.actualizado_en desc, s.cedula limit 1';
    elsif position('order by actualizado_en desc limit 1' in src) > 0 then
      viejo := 'order by actualizado_en desc limit 1';
      bueno := 'order by actualizado_en desc, cedula limit 1';
    else
      viejo := null;
    end if;

    if viejo is not null then
      nueva := replace(src, viejo, bueno);
      if nueva = src then
        raise exception 'no se pudo desempatar %: el texto estaba pero no cambio', f;
      end if;
      execute nueva;
      cambiadas := cambiadas + 1;
    end if;
  end loop;

  raise notice 'desempatadas: % de 3 (las que ya lo tenian no cuentan)', cambiadas;
end $$;

-- ====== 2. LA REJA: ese teléfono no puede reclamar una segunda ficha ======
-- Va ANTES de mover los mensajes: si se va a negar, no se toca nada.
do $$
declare
  src   text;
  nueva text;
  reja  text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'vincular_cuenta' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.vincular_cuenta'; end if;

  if position('ya tiene un historial junto' in src) > 0 then
    raise notice 'la reja ya estaba puesta';
    return;
  end if;

  reja :=
    'if exists (select 1 from public.socios_historial s ' ||
     'where s.auth_celular = cel and s.auth_vinculada_en is not null ' ||
       'and s.cedula <> r.cedula) then ' ||
     'return jsonb_build_object(''ok'', false, ''motivo'', ' ||
       '''este teléfono ya tiene un historial junto. Habla con nosotros.''); ' ||
    'end if; ';

  -- Tolerante a los espacios: el formato de pg_get_functiondef no es el del
  -- archivo, y anclarse a un espacio concreto es como estas cosas se rompen.
  nueva := regexp_replace(src, '(if\s+r\.cedula\s*<>\s*cel\s+then)', reja || E'\n  \\1', '');
  if nueva = src then
    raise exception 'no se encontro donde poner la reja en vincular_cuenta';
  end if;
  execute nueva;
end $$;

-- ====== 3. Y LA REJA DE VERDAD, para que no vuelva por otra puerta ======
-- Una función se reescribe; un índice único no. Primero se comprueba que no
-- haya duplicados (hoy no los hay), porque crear el índice con duplicados
-- fallaría y dejaría la migración a medias.
do $$
declare cuantos integer;
begin
  select count(*) into cuantos from (
    select auth_celular from public.socios_historial
     where auth_celular is not null and auth_vinculada_en is not null
     group by auth_celular having count(*) > 1) x;
  if cuantos > 0 then
    raise exception 'hay % telefonos con mas de una ficha vinculada: hay que decidir cual se queda ANTES de poner el indice', cuantos;
  end if;
end $$;

create unique index if not exists socios_un_telefono_una_ficha
  on public.socios_historial (auth_celular)
  where auth_celular is not null and auth_vinculada_en is not null;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Se prueba con fichas de mentira que se borran al final. La prueba NO puede
-- terminar en `raise exception`: el editor corre el archivo en UNA transacción
-- y eso revertiría también los cambios de arriba.
do $prueba$
declare
  cel    text := '3009998844';
  ced_a  text := '99000000001';
  ced_b  text := '99000000002';
  codigo text := 'AB123';      -- 5 caracteres: es lo que exige huella_codigo,
  j      jsonb;                -- comprobado contra la base, no supuesto
  pasos  text := '';
begin
  -- Ojo con el ORDEN: el indice unico ya esta puesto arriba, asi que el estado
  -- «dos fichas en un telefono» YA NO SE PUEDE NI MONTAR desde aqui. Eso es
  -- precisamente lo que se buscaba, pero significa que el desempate no se
  -- puede probar llamando: lo vigila el centinela mirando el codigo de las tres
  -- funciones. Y esta bien asi — el desempate es el cinturon, el indice son los
  -- tirantes, y lo que se prueba aqui es que los tirantes sujetan.
  --
  -- `datos`, `nombre` y `tel4` son obligatorias y sin defecto: se comprobo
  -- contra el esquema.
  insert into public.socios_historial (cedula, tel4, nombre, datos, celular, actualizado_en)
  values (ced_a, '8844', 'Prueba A', '{}'::jsonb, cel, now()),
         (ced_b, '8844', 'Prueba B', '{}'::jsonb, cel, now())
  on conflict (cedula) do nothing;

  update public.socios_historial
     set auth_vinculada_en = now(), auth_celular = cel
   where cedula = ced_a;
  update public.socios_historial
     set auth_vinculada_en = null, auth_celular = null,
         codigo_hash = public.huella_codigo(codigo)
   where cedula = ced_b;

  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);

  ---- 1. LA REJA. Con un codigo VALIDO: sin el, la funcion se para antes y no
  ---- se llegaria a probar lo unico que esta migracion anade.
  perform public.limpiar_fallos(ced_b);
  j := public.vincular_cuenta(ced_b, codigo);
  if (j->>'ok') <> 'false' then
    raise exception 'FALLO 1 GRAVE: un telefono vinculo una SEGUNDA ficha: %', j;
  end if;
  if (j->>'motivo') not like '%historial junto%' then
    raise exception 'FALLO 1b: se nego, pero por otro motivo (%): la reja no es la que paro', j;
  end if;
  pasos := pasos || '1 la-segunda-ficha-se-niega; ';

  ---- Y al negar NO toca nada: ni vincula ni mueve la conversacion.
  if exists (select 1 from public.socios_historial
              where cedula = ced_b and auth_vinculada_en is not null) then
    raise exception 'FALLO 2: se nego pero igual quedo vinculada';
  end if;
  pasos := pasos || '2 al-negar-no-toca-nada; ';

  ---- 3. EL INDICE, que aguanta aunque alguien reescriba la funcion manana.
  begin
    update public.socios_historial
       set auth_vinculada_en = now(), auth_celular = cel where cedula = ced_b;
    raise exception 'FALLO 3 GRAVE: dos fichas vinculadas al mismo telefono';
  exception when others then
    if sqlerrm like 'FALLO 3%' then raise; end if;
  end;
  pasos := pasos || '3 el-indice-aguanta-por-debajo; ';

  ---- 4. Y LA MITAD QUE SE OLVIDA: con el telefono libre, vincular sigue
  ---- funcionando. Un arreglo que cierra la puerta buena no es un arreglo.
  update public.socios_historial
     set auth_vinculada_en = null, auth_celular = null where cedula = ced_a;
  perform public.limpiar_fallos(ced_b);
  j := public.vincular_cuenta(ced_b, codigo);
  if (j->>'ok') <> 'true' then
    raise exception 'FALLO 4: se rompio el camino bueno, ya no se puede vincular: %', j;
  end if;
  pasos := pasos || '4 la-primera-ficha-sigue-entrando; ';

  delete from public.mensajes where cedula in (cel, ced_a, ced_b);
  delete from public.socios_historial where cedula in (ced_a, ced_b);
  raise notice 'un telefono una ficha: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text; f text;
begin
  foreach f in array array['llave_de_sesion', 'mi_cuenta', 'vincular_cuenta'] loop
    select prosrc into cuerpo from pg_proc
     where proname = f and pronamespace = 'public'::regnamespace;
    cuerpo := regexp_replace(cuerpo, '--[^\n]*', '', 'g');
    if cuerpo ~ 'actualizado_en desc\s+limit' then
      raise exception '% vuelve a ordenar sin desempate: con el mismo actualizado_en eso es un sorteo', f;
    end if;
  end loop;

  select prosrc into cuerpo from pg_proc
   where proname = 'vincular_cuenta' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%ya tiene un historial junto%' then
    raise exception 'se fue la reja: un telefono vuelve a poder reclamar dos fichas';
  end if;

  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'socios_un_telefono_una_ficha') then
    raise exception 'no quedo el indice unico: una funcion se reescribe, un indice no';
  end if;
end $$;
