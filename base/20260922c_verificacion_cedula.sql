-- 22-sep-2026 — EL COTEJO DE LA CÉDULA
--
-- Joan, hoy: «enciende la verificacion de la cedula».
--
-- ============================ LÉASE ESTO PRIMERO ============================
--
-- ESTO NO ES UNA VERIFICACIÓN DE IDENTIDAD, y la palabra importa porque de ella
-- salen las frases que el cliente va a leer. Se estuvo a punto de escribir una
-- función que dijera «coincide» y habría sido un sello que se pinta solo. La
-- razón, que no se ve hasta seguir el camino del dato:
--
--   play/index.html, anotarCedulaLeida(): al leer el código de barras la app
--   ESCRIBE lo leído dentro del formulario — REGISTRO.nombres, .apellidos y
--   .documento. El paso del escáner va ANTES del paso «Quién eres». Así que en
--   el caso normal lo declarado y lo leído son la MISMA CADENA, byte a byte,
--   porque el código rellenó la casilla, no porque nadie haya comprobado nada.
--
-- Un veredicto «coincide» ahí es un espejo: daría verde el 100% de las veces
-- para todo el que no toque los campos. La única señal con información es la
-- CONTRARIA: que la persona haya borrado lo que el código leyó y haya escrito
-- otra cosa. Por eso los estados de aquí abajo no dicen si algo coincide: dicen
-- QUÉ PASÓ.
--
-- LOS CUATRO ESTADOS:
--   sin_codigo  no llegó lectura. NO significa «escribió a mano»: hay al menos
--               tres caminos que dejan la huella vacía con la cédula
--               perfectamente escaneada (sin sesión al subir, fotos de otro
--               registro, o nada que mandar). El CRM afirmaba lo contrario y se
--               corrige en el mismo commit que esta migración.
--   intacto     se leyó y lo que quedó escrito es exactamente lo que dijo el
--               código. Lo honesto que se puede afirmar: «estos tres datos no
--               los tecleó la persona, salieron del respaldo de su cédula».
--   retocado    se leyó y después corrigió algo, pero de forma compatible con
--               la misma persona (una tilde, un apellido que no escribió).
--   no_cuadra   se leyó y lo escrito lo contradice. Es el ÚNICO que merece que
--               Joan mire. Cae aquí el número de documento cambiado a mano, el
--               nombre sin relación, el tipo de documento imposible y el menor
--               de edad.
--
-- LO QUE SIGUE SIENDO MENTIRA con esto encendido, y por eso ninguna pantalla lo
-- puede decir: «verificamos tu identidad», «confirmamos que la cédula es tuya»,
-- «tu cédula es válida», «validamos tus datos con la Registraduría» y «el
-- algoritmo está verificando tu información». Nada de eso pasa. No se consulta
-- ninguna fuente externa, no se valida ninguna firma, y la selfie se guarda
-- pero no se compara con la foto del documento.
--
-- Y LA FECHA DE EXPEDICIÓN NO SE PUEDE COTEJAR NUNCA: no viaja en el PDF417 en
-- ninguna versión del formato. Es, además, el único campo de identidad que la
-- persona escribe de verdad a mano — o sea, el único que un impostor tendría
-- que inventarse — y es justo el que queda sin comprobar.
--
-- DOS NIVELES, y el segundo es el que resiste a un teléfono mentiroso:
--   nivel 'app'   al registrarse. Compara lo que el TELÉFONO DICE que leyó
--                 contra lo escrito. Cualquiera con la consola abierta puede
--                 mandar una lectura inventada que cuadre, así que esto sirve
--                 para distinguir descuidos, no para atrapar a nadie.
--   nivel 'foto'  cuando Joan quiera, desde el CRM. El navegador de Joan baja
--                 la foto del respaldo que está en el servidor, la decodifica
--                 con el mismo lector (ZXing ya vive en app/lib/) y manda aquí
--                 lo que salió.
--
--                 Y AQUÍ HAY QUE SER EXACTO, porque la primera versión de este
--                 comentario decía que el servidor «lee de la imagen» y eso es
--                 falso: el servidor recibe un JSON ya decodificado, igual que
--                 en el nivel 1. Lo que cambia NO es de dónde sale el dato:
--                 cambia QUIÉN lo manda. En el nivel 1 lo manda el teléfono de
--                 quien se registra, que es de él; en el nivel 2 lo manda el
--                 navegador de Joan, leyendo un archivo que el servidor guarda.
--                 Eso sube el listón de falsear —hay que subir la foto de una
--                 cédula real con ese número— pero NO lo cierra: la función
--                 está concedida a anon, así que cualquiera con la clave del
--                 CRM podría mandar un veredicto inventado. Ese riesgo es el
--                 mismo de toda la bandeja de Joan y se cierra el día que el
--                 CRM deje de hablar por anon + clave.
--
--                 Cerrarlo de verdad pide decodificar en el servidor, y eso
--                 pide una Edge Function en Deno: hoy este proyecto no tiene
--                 ninguna, ni CLI de Supabase, ni paso de compilación. Meter la
--                 primera es una decisión de Joan, no un detalle.
--
-- UNA SOLA REGLA: los dos niveles llaman a cedula_cotejar. Tenerla dos veces
-- —una en SQL y otra en JavaScript— es cómo se consigue que dentro de un mes
-- digan cosas distintas.
--
-- Y EL REGISTRO NO SE BLOQUEA NUNCA. Esto es una señal para Joan, no un muro.

-- ===================== 1. NORMALIZAR, PARA PODER COMPARAR =====================

-- Los nombres del código vienen en mayúsculas y sin tildes (limpiarNombre, en
-- app/cuenta.js); los que escribe la persona vienen como ella los escriba. Sin
-- esto, «José» y «JOSE» serían dos personas y TODO registro saldría retocado.
--
-- translate() y no la extensión unaccent: unaccent hay que instalarla, y en
-- este proyecto ya hubo una migración que falló en producción por dar una
-- extensión por sentada.
create or replace function public.cedula_normalizar_nombre(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(upper(coalesce(p_texto, '')),
              'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÃÕÇ',
              'AEIOUUNAEIOUAEIOUAOC'),
    '[^A-Z]+', ' ', 'g'))
$$;

-- Las palabras de un nombre, como conjunto sin repetidas. Por CONJUNTO y no por
-- cadena a propósito: la persona puede poner su segundo apellido en la casilla
-- de los nombres, o al revés, y sigue siendo la misma persona.
create or replace function public.cedula_palabras(p_texto text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct p order by p), '{}'::text[])
    from unnest(string_to_array(public.cedula_normalizar_nombre(p_texto), ' ')) as p
   where length(p) >= 2
$$;

-- ===================== 2. LA REGLA, UNA SOLA VEZ =====================

-- p_leida:   lo que salió del código de barras
--            {documento, nombres, apellidos, sexo, nacimiento, lectura}
-- p_escrito: lo que quedó escrito
--            {documento, nombres, apellidos, tipo_doc}
--
-- NUNCA lanza: la llaman funciones que no se pueden permitir fallar.
create or replace function public.cedula_cotejar(p_leida jsonb, p_escrito jsonb)
returns jsonb
language plpgsql
-- STABLE y no IMMUTABLE: mira current_date para sacar la edad. Declararla
-- inmutable es mentirle al planificador, que entonces puede calcularla una vez
-- y reusar el resultado — y la edad cambia con el día.
stable
set search_path = public
as $$
declare
  doc_l    text;
  doc_e    text;
  pal_l    text[];
  pal_e    text[];
  comunes  integer := 0;
  total_l  integer := 0;
  nac      date;
  anos     integer;
  lectura  text;
  d_doc    text := 'sin_dato';
  d_nom    text := 'sin_dato';
  d_edad   text := 'sin_dato';
  d_tipo   text := 'coherente';
  visto    jsonb := '{}'::jsonb;
  alarma   boolean := false;
  retoque  boolean := false;
begin
  if p_leida is null or jsonb_typeof(p_leida) <> 'object'
     or coalesce(p_leida ->> 'documento', '') = '' then
    return jsonb_build_object(
      'estado', 'sin_codigo',
      'nota',   'no llego lectura del codigo de barras; NO significa que escribiera a mano',
      'regla',  '2026-09-22');
  end if;

  lectura := coalesce(p_leida ->> 'lectura', '');

  ---- EL NÚMERO DE DOCUMENTO. La comparación fuerte: son dígitos, no hay
  ---- ortografía que valga, y es el dato que identifica la cuenta.
  doc_l := regexp_replace(regexp_replace(coalesce(p_leida   ->> 'documento', ''), '\D', '', 'g'), '^0+', '');
  doc_e := regexp_replace(regexp_replace(coalesce(p_escrito ->> 'documento', ''), '\D', '', 'g'), '^0+', '');

  if doc_e = '' then
    d_doc := 'sin_escribir';
  elsif doc_l = doc_e then
    d_doc := 'igual';
  else
    -- EL CASO QUE ESTA MIGRACIÓN EXISTE PARA VER: el código rellenó el número y
    -- después alguien lo cambió a mano. No prueba nada por sí solo —pudo leerse
    -- mal un dígito— pero es lo único aquí que merece los ojos de Joan.
    d_doc  := 'cambiado';
    alarma := true;
    visto  := visto || jsonb_build_object(
      'documento_codigo', doc_l, 'documento_escrito', doc_e);
  end if;

  ---- EL NOMBRE. Por conjunto de palabras: ver cedula_palabras.
  pal_l := public.cedula_palabras(
    coalesce(p_leida ->> 'nombres', '') || ' ' || coalesce(p_leida ->> 'apellidos', ''));
  pal_e := public.cedula_palabras(
    coalesce(p_escrito ->> 'nombres', '') || ' ' || coalesce(p_escrito ->> 'apellidos', ''));
  total_l := coalesce(array_length(pal_l, 1), 0);

  if total_l = 0 or coalesce(array_length(pal_e, 1), 0) = 0 then
    d_nom := 'sin_dato';
  else
    select count(*) into comunes from unnest(pal_l) as x where x = any(pal_e);
    if comunes = total_l then
      d_nom := 'igual';
    elsif comunes >= 2 then
      -- «La misma persona con una casilla movida»: un segundo apellido que no
      -- escribió, o un nombre compuesto partido. Se anota y no suena la alarma:
      -- marcar esto como sospechoso perdería clientes buenos sin atrapar a uno
      -- malo.
      d_nom   := 'retocado';
      retoque := true;
      visto   := visto || jsonb_build_object(
        'nombre_codigo', array_to_string(pal_l, ' '),
        'nombre_escrito', array_to_string(pal_e, ' '));
    else
      d_nom := 'otro';
      visto := visto || jsonb_build_object(
        'nombre_codigo', array_to_string(pal_l, ' '),
        'nombre_escrito', array_to_string(pal_e, ' '));
      -- La lectura 'tokens' ADIVINA dónde parten nombres y apellidos
      -- (app/cuenta.js). Con ese lector, una diferencia de nombre puede ser
      -- culpa del lector y no de la persona, así que no levanta alarma sola.
      if lectura <> 'tokens' then alarma := true; else retoque := true; end if;
    end if;
  end if;

  ---- LA MAYORÍA DE EDAD. Esta no compara contra nada escrito —la fecha de
  ---- nacimiento no se le pide a la persona— y aun así sale del documento. Un
  ---- menor no puede obligarse: el contrato sería nulo (arts. 1502 y 1504 del
  ---- Código Civil), así que esto es lo único de aquí que le ahorra plata.
  begin
    nac := (p_leida ->> 'nacimiento')::date;
  exception when others then
    nac := null;
  end;
  if nac is not null and nac <= current_date then
    anos   := extract(year from age(current_date, nac));
    d_edad := case when anos >= 18 then 'mayor' else 'MENOR' end;
    visto  := visto || jsonb_build_object('anos', anos,
      'nacimiento', to_char(nac, 'YYYY-MM-DD'));
    if anos < 18 then alarma := true; end if;
  end if;

  ---- EL TIPO DE DOCUMENTO. Este código de barras SOLO existe en la cédula de
  ---- ciudadanía colombiana. Si se leyó uno y la persona marcó pasaporte o
  ---- cédula de extranjería, una de las dos cosas está mal.
  if coalesce(p_escrito ->> 'tipo_doc', '') <> ''
     and public.cedula_normalizar_nombre(p_escrito ->> 'tipo_doc')
         not like '%CEDULA DE CIUDADANIA%' then
    d_tipo := 'incoherente';
    alarma := true;
    visto  := visto || jsonb_build_object('tipo_doc_escrito', left(p_escrito ->> 'tipo_doc', 60));
  end if;

  return jsonb_build_object(
    'estado',    case when alarma then 'no_cuadra'
                      when retoque or d_doc = 'sin_escribir' then 'retocado'
                      else 'intacto' end,
    'documento', d_doc,
    'nombre',    d_nom,
    'edad',      d_edad,
    'tipo_doc',  d_tipo,
    'lectura',   lectura,
    'visto',     visto,
    'regla',     '2026-09-22');
end
$$;

-- ===================== 2-bis. ¿ESE NÚMERO YA ESTÁ EN OTRA FICHA? =============

-- EL ÚNICO FRENO CONTRA LA CÉDULA AJENA. Ni el cotejo del registro ni el de la
-- foto cazan a quien usa la cédula de otro: la cédula es real, el código es
-- real, y todo cuadra. La foto del respaldo de un tercero circula por WhatsApp
-- más de lo que parece.
--
-- Lo único que lo delata es que ese mismo número ya esté en otra parte con otro
-- teléfono. No es prueba de nada —una persona puede cambiar de celular y
-- registrarse otra vez— pero es exactamente el minuto de teléfono que a Joan le
-- puede ahorrar un crédito.
--
-- Va aparte de cedula_cotejar porque cedula_cotejar es una función pura sobre
-- dos jsonb, y esta mira la base. Mezclarlas volvería la regla imposible de
-- probar sin datos.
create or replace function public.cedula_repetida(p_documento text, p_celular text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  doc   text;
  cel   text;
  otros integer := 0;
  socio integer := 0;
begin
  doc := regexp_replace(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '^0+', '');
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(doc) < 5 then return jsonb_build_object('repetida', false); end if;

  select count(*) into otros
    from public.registros r
   where regexp_replace(regexp_replace(coalesce(r.cedula, ''), '\D', '', 'g'), '^0+', '') = doc
     and right(public.solo_digitos(coalesce(r.telefono, '')), 10) <> cel;

  select count(*) into socio
    from public.socios_historial s
   where regexp_replace(regexp_replace(coalesce(s.cedula, ''), '\D', '', 'g'), '^0+', '') = doc
     and right(public.solo_digitos(coalesce(s.celular, '')), 10) <> cel;

  return jsonb_build_object(
    'repetida', (otros + socio) > 0,
    'otros_registros', otros,
    'ya_es_socio_con_otro_celular', socio > 0);
end
$$;

-- ===================== 3. NIVEL «APP»: AL REGISTRARSE =====================

-- registro_archivos_guardar ya recibía las dos mitades: la foto y
-- p_huella.cedula_leida. Lo único que faltaba era cotejarlas.
--
-- SE REESCRIBE ENTERA Y CON TRES BLOQUES PROTEGIDOS SEPARADOS, que es el cambio
-- de forma que importa. Antes había uno solo, envolviendo el UPDATE. Meter el
-- cotejo ahí dentro habría hecho que un error nuevo desapareciera sin ruido
-- —que es justo el defecto que costó trece días de fotos—; dejarlo fuera habría
-- hecho que un error se llevara por delante las fotos ya insertadas. Con tres
-- bloques, cada fallo pierde solo lo suyo.
create or replace function public.registro_archivos_guardar(p_archivos jsonb, p_huella jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel       text;
  k         text;
  v         text;
  cab       jsonb;
  v_huella  jsonb;
  v_reg     bigint;
  v_datos   jsonb;
  v_ced     text;
  v_nom     text;
  n         integer := 0;
  guardados text[] := '{}';
begin
  cel := public.celular_de_sesion();
  if cel is null then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false);
  end if;

  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_archivos, '{}'::jsonb)) loop
    if k not in ('cedula_frente', 'cedula_reverso', 'selfie') then continue; end if;
    if v is null or v not like 'data:image/%' or length(v) > 600000 then continue; end if;
    insert into public.registro_archivos (celular, tipo, imagen)
    values (cel, k, v)
    on conflict (celular, tipo) do update set imagen = excluded.imagen, creado_en = now();
    n := n + 1;
    guardados := guardados || k;
  end loop;

  -- La huella: lo que dice la petición (no el teléfono) más el GPS autorizado.
  begin
    cab := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  exception when others then
    cab := '{}'::jsonb;
  end;
  v_huella := jsonb_build_object(
    'ip',      left(coalesce(cab ->> 'x-forwarded-for', cab ->> 'x-real-ip', ''), 80),
    'aparato', left(coalesce(cab ->> 'user-agent', ''), 300),
    'momento', now()
  );
  if p_huella ? 'gps' then
    v_huella := v_huella || jsonb_build_object('gps', p_huella -> 'gps');
  end if;
  if p_huella ? 'cedula_leida' then
    v_huella := v_huella || jsonb_build_object('cedula_leida', p_huella -> 'cedula_leida');
  end if;

  -- BLOQUE 1: buscar la ficha. Con DESEMPATE por id: creado_en sale de now(),
  -- que es la hora de INICIO DE LA TRANSACCIÓN, así que dos filas del mismo
  -- segundo empatan y gana cualquiera. Es el mismo defecto que se arregló hoy
  -- en mi_solicitud (ver 20260922b_desempate.sql) y aquí seguía vivo.
  begin
    select r.id, r.datos, r.cedula, r.nombre into v_reg, v_datos, v_ced, v_nom
      from public.registros r
     where right(public.solo_digitos(r.telefono), 10) = right(cel, 10)
     order by r.creado_en desc, r.id desc
     limit 1;
  exception when others then
    v_reg := null;
  end;

  -- BLOQUE 2: el cotejo. Su propia red: si fallara, se pierde el cotejo y nada
  -- más, y queda dicho que falló en vez de desaparecer.
  if v_reg is not null and p_huella ? 'cedula_leida' then
    begin
      v_huella := v_huella || jsonb_build_object('cotejo',
        public.cedula_cotejar(
          p_huella -> 'cedula_leida',
          jsonb_build_object(
            -- (el bloque de abajo arma «lo escrito»)
            -- Contra datos->>'documento', que es la casilla que la persona pudo
            -- editar. registros.cedula sale de REGISTRO.documento, que el
            -- escáner ya había pisado: compararlo contra eso no probaría nada.
            'documento', coalesce(nullif(coalesce(v_datos ->> 'documento', ''), ''), v_ced),
            'nombres',   coalesce(nullif(coalesce(v_datos ->> 'nombres', ''), ''), v_nom),
            'apellidos', coalesce(v_datos ->> 'apellidos', ''),
            'tipo_doc',  coalesce(v_datos ->> 'tipo_doc', '')))
        || jsonb_build_object('nivel', 'app', 'momento', now())
        -- El único freno contra la cédula ajena: ver cedula_repetida.
        || public.cedula_repetida(
             coalesce(nullif(coalesce(v_datos ->> 'documento', ''), ''), v_ced), cel));
    exception when others then
      v_huella := v_huella || jsonb_build_object('cotejo',
        jsonb_build_object('estado', 'sin_codigo', 'nivel', 'app',
          'nota', 'el cotejo fallo: ' || left(coalesce(sqlerrm, ''), 120)));
    end;
  end if;

  -- BLOQUE 3: el UPDATE. La huella es una comodidad para la ficha de Joan; las
  -- FOTOS son el dato. Si esto fallara, que no se lleve por delante las fotos
  -- que ya entraron — que es exactamente lo que pasó durante trece días.
  begin
    if v_reg is not null then
      update public.registros r
         set huella = coalesce(r.huella, '{}'::jsonb) || v_huella
       where r.id = v_reg;
    end if;
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'fotos', n, 'guardados', to_jsonb(guardados));
end
$$;

-- ===================== 4. NIVEL «FOTO»: CONTRA LA IMAGEN GUARDADA =============

-- Lo llama el CRM de Joan. La foto del respaldo ya está en el servidor; el CRM
-- la vuelve a decodificar con el mismo lector que usa la app y manda aquí lo
-- que salió.
--
-- LO QUE ESTA FUNCIÓN SÍ GARANTIZA Y LO QUE NO. Recibe un JSON ya decodificado
-- —no lee la imagen, PostgreSQL no lee códigos de barras— así que no puede
-- saber si ese JSON salió de verdad de una foto. Lo que aporta sobre el nivel 1
-- es QUIÉN lo manda: el navegador de Joan en vez del teléfono de quien se
-- registra. Está concedida a anon como el resto de la bandeja, así que quien
-- tenga la clave del CRM puede inventarse un veredicto. No se documenta como
-- más fuerte de lo que es.
--
-- VOLÁTIL, NO STABLE, y no es un descuido: pasa por clave_ok, que ESCRIBE el
-- freno antifuerza-bruta, y PostgREST corre las stable en transacción de solo
-- lectura. Una hermana de esta reventó con 25006 del 8 al 10 de septiembre y
-- dejó invisibles las fotos de todo el mundo.
create or replace function public.verificar_registro_foto(
  p_clave text, p_celular text, p_leida jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cel     text;
  v_reg   bigint;
  v_datos jsonb;
  v_ced   text;
  v_nom   text;
  v_cot   jsonb;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;

  cel := public.solo_digitos(coalesce(p_celular, ''));
  if length(cel) < 10 then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;

  select r.id, r.datos, r.cedula, r.nombre into v_reg, v_datos, v_ced, v_nom
    from public.registros r
   where right(public.solo_digitos(r.telefono), 10) = right(cel, 10)
   order by r.creado_en desc, r.id desc
   limit 1;

  if v_reg is null then
    return jsonb_build_object('ok', false, 'motivo', 'no existe ese registro');
  end if;

  v_cot := public.cedula_cotejar(
    p_leida,
    jsonb_build_object(
      'documento', coalesce(nullif(coalesce(v_datos ->> 'documento', ''), ''), v_ced),
      'nombres',   coalesce(nullif(coalesce(v_datos ->> 'nombres', ''), ''), v_nom),
      'apellidos', coalesce(v_datos ->> 'apellidos', ''),
      'tipo_doc',  coalesce(v_datos ->> 'tipo_doc', '')))
    || jsonb_build_object('nivel', 'foto', 'momento', now())
    || public.cedula_repetida(
         coalesce(nullif(coalesce(v_datos ->> 'documento', ''), ''), v_ced), cel);

  update public.registros r
     set huella = coalesce(r.huella, '{}'::jsonb) || jsonb_build_object('cotejo_foto', v_cot)
   where r.id = v_reg;

  return jsonb_build_object('ok', true, 'cotejo', v_cot);
end
$$;

-- ===================== 5. PERMISOS =====================

-- Los tres ayudantes no se le dan a nadie. En este proyecto se aprendió por las
-- malas que Supabase le concede EXECUTE a anon y authenticated en CADA función
-- nueva de public, y que «revoke ... from public» NO quita ese permiso: hay que
-- revocar de los dos roles por su nombre.
revoke all on function public.cedula_normalizar_nombre(text)  from public, anon, authenticated;
revoke all on function public.cedula_palabras(text)           from public, anon, authenticated;
revoke all on function public.cedula_cotejar(jsonb, jsonb)    from public, anon, authenticated;
-- cedula_repetida MIRA LA BASE ENTERA: si se le diera a anon, sería un oráculo
-- para preguntar «¿esta cédula es cliente de Joan?» una por una.
revoke all on function public.cedula_repetida(text, text)     from public, anon, authenticated;

revoke all on function public.registro_archivos_guardar(jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.registro_archivos_guardar(jsonb, jsonb) to authenticated;

revoke all on function public.verificar_registro_foto(text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.verificar_registro_foto(text, text, jsonb) to anon;

-- ===================== 6. EL DESEMPATE QUE FALTABA AQUÍ TAMBIÉN =============

-- archivos_de_registro busca «la última ficha de este celular» con
-- `order by creado_en desc limit 1` y SIN desempate. creado_en sale de now(),
-- que es la hora de inicio de la TRANSACCIÓN: dos filas del mismo segundo
-- empatan y gana cualquiera. Con dos filas del mismo celular, las fotos y el
-- cotejo pueden caer en la fila que Joan no está mirando.
--
-- Es el mismo defecto que se arregló esta mañana en mi_solicitud (ver
-- 20260922b_desempate.sql) y aquí seguía vivo. Se arregla igual: se le pide a
-- PostgreSQL su propia definición y se le cambia esa línea, para no copiar el
-- cuerpo a mano — que es como el repo y la base se separan.
do $$
declare
  src   text;
  viejo constant text := 'order by creado_en desc limit 1';
  bueno constant text := 'order by creado_en desc, id desc limit 1';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'archivos_de_registro' and p.pronamespace = 'public'::regnamespace;
  if src is null then
    raise exception 'no existe public.archivos_de_registro en esta base';
  end if;
  if position(bueno in src) > 0 then
    return;                          -- ya lo tiene
  end if;
  if position(viejo in src) = 0 then
    raise notice 'archivos_de_registro no tiene la linea esperada; se deja como esta';
    return;
  end if;
  execute replace(src, viejo, bueno);
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- COTEJAN DE VERDAD en vez de mirar que la función exista: el cuerpo de una
-- PL/pgSQL compila en la PRIMERA LLAMADA, no al crearla, y así es como una
-- migración pasó verde y dejó trece días sin guardar una foto.
do $$
declare
  j     jsonb;
  leida jsonb;
begin
  leida := jsonb_build_object('documento', '1018447274', 'nombres', 'JOAN SEBASTIAN',
    'apellidos', 'RUIZ FLOREZ', 'nacimiento', '1990-05-14', 'lectura', 'anchos_fijos');

  ---- El caso normal: el código rellenó y la persona no tocó nada.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1018447274', 'nombres', 'Joan Sebastián', 'apellidos', 'Ruiz Flórez',
    'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' <> 'intacto' then
    raise exception 'lo no tocado no dio intacto: %', j;
  end if;
  ---- Y NO puede decir «coincide»: seria un espejo. Este centinela existe para
  ---- que nadie «mejore» los nombres de los estados sin leer la cabecera.
  if j::text ilike '%coincide%' or j::text ilike '%verificad%' then
    raise exception 'el cotejo volvio a hablar de coincidir o verificar: %', j;
  end if;

  ---- Las tildes NO pueden convertir a alguien en otra persona.
  if (j ->> 'nombre') <> 'igual' then
    raise exception 'las tildes rompieron el cotejo de nombres: %', j;
  end if;

  ---- EL CASO QUE IMPORTA: el número cambiado a mano.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1018447999', 'nombres', 'Joan Sebastián', 'apellidos', 'Ruiz Flórez',
    'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' <> 'no_cuadra' or (j ->> 'documento') <> 'cambiado' then
    raise exception 'cambiar el numero a mano no salto: %', j;
  end if;
  if (j -> 'visto' ->> 'documento_escrito') <> '1018447999'
     or (j -> 'visto' ->> 'documento_codigo') <> '1018447274' then
    raise exception 'no quedaron los dos numeros a la vista, que es lo que Joan compara: %', j;
  end if;

  ---- Un apellido que no escribió: la misma persona. NO puede ser no_cuadra.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1018447274', 'nombres', 'Joan', 'apellidos', 'Ruiz',
    'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' <> 'retocado' then
    raise exception 'escribir menos apellidos lo marco como sospechoso: perderia clientes buenos: %', j;
  end if;

  ---- Casillas cambiadas: los apellidos en la casilla de los nombres.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1018447274', 'nombres', 'Ruiz Florez', 'apellidos', 'Joan Sebastian',
    'tipo_doc', 'Cédula de ciudadanía'));
  if (j ->> 'nombre') <> 'igual' then
    raise exception 'mover el apellido de casilla lo volvio otra persona: %', j;
  end if;

  ---- La cedula con puntos: 1.018.447.274 es el MISMO numero.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1.018.447.274', 'nombres', 'Joan Sebastián', 'apellidos', 'Ruiz Flórez',
    'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' <> 'intacto' then
    raise exception 'escribir la cedula con puntos dio falsa alarma: %', j;
  end if;

  ---- Un nombre sin relacion, con lectura fiable: alarma.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1018447274', 'nombres', 'Pedro', 'apellidos', 'Gomez',
    'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' <> 'no_cuadra' then
    raise exception 'un nombre ajeno con el mismo numero no salto: %', j;
  end if;

  ---- El MISMO caso pero leido por 'tokens', que ADIVINA donde parten nombres y
  ---- apellidos: ahi la culpa puede ser del lector, no de la persona.
  j := public.cedula_cotejar(leida || jsonb_build_object('lectura', 'tokens'),
    jsonb_build_object('documento', '1018447274', 'nombres', 'Pedro', 'apellidos', 'Gomez',
      'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' = 'no_cuadra' then
    raise exception 'con el lector que adivina, una diferencia de nombre acuso a la persona: %', j;
  end if;

  ---- Menor de edad: salta aunque TODO lo demas cuadre.
  j := public.cedula_cotejar(
    leida || jsonb_build_object('nacimiento', to_char(current_date - interval '15 years', 'YYYY-MM-DD')),
    jsonb_build_object('documento', '1018447274', 'nombres', 'Joan Sebastián',
      'apellidos', 'Ruiz Flórez', 'tipo_doc', 'Cédula de ciudadanía'));
  if j ->> 'estado' <> 'no_cuadra' or (j ->> 'edad') <> 'MENOR' then
    raise exception 'un menor de edad no salto: el contrato seria nulo (art. 1504 C.C.): %', j;
  end if;

  ---- Tipo de documento imposible: se leyo el codigo de una cedula colombiana.
  j := public.cedula_cotejar(leida, jsonb_build_object(
    'documento', '1018447274', 'nombres', 'Joan Sebastián', 'apellidos', 'Ruiz Flórez',
    'tipo_doc', 'Pasaporte'));
  if j ->> 'estado' <> 'no_cuadra' then
    raise exception 'leyo el codigo de una cedula y marco pasaporte, y no salto: %', j;
  end if;

  ---- Sin lectura: no se inventa un veredicto, y se dice que NO significa
  ---- «escribio a mano».
  j := public.cedula_cotejar(null, jsonb_build_object('documento', '1018447274'));
  if j ->> 'estado' <> 'sin_codigo' then
    raise exception 'sin lectura se invento un veredicto: %', j;
  end if;
  if (j ->> 'nota') not like '%NO significa%' then
    raise exception 'sin_codigo no aclara que no significa que escribiera a mano: %', j;
  end if;

  ---- Y que NUNCA lance, pase lo que pase.
  perform public.cedula_cotejar('"texto suelto"'::jsonb, '{}'::jsonb);
  perform public.cedula_cotejar('[]'::jsonb, null);
  perform public.cedula_cotejar('{}'::jsonb, null);
  perform public.cedula_cotejar(jsonb_build_object('documento', '123', 'nacimiento', 'no-es-fecha'), '{}'::jsonb);
  perform public.cedula_cotejar(jsonb_build_object('documento', '123', 'nacimiento', '2999-01-01'), '{}'::jsonb);
end $$;

do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'registro_archivos_guardar' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%cedula_cotejar%' then
    raise exception 'registro_archivos_guardar no cotejo nada';
  end if;
  -- El cotejo va DENTRO de un bloque protegido: si lanzara, no puede llevarse
  -- las fotos por delante. Se comprueba que DESPUES de la llamada siga habiendo
  -- un manejador, no que vaya antes del primero: hay tres bloques y el de las
  -- cabeceras va antes que todo.
  if position('exception when others then' in substr(cuerpo, position('cedula_cotejar' in cuerpo))) = 0 then
    raise exception 'el cotejo quedo FUERA de bloque protegido: un error ahi tumba las fotos otra vez';
  end if;
  -- Y el desempate, que aqui seguia sin ponerse.
  if cuerpo not like '%creado_en desc, r.id desc%' then
    raise exception 'registro_archivos_guardar sigue sin desempate: la huella puede caer en la fila que Joan no mira';
  end if;

  if has_function_privilege('anon', 'public.cedula_cotejar(jsonb, jsonb)', 'execute') then
    raise exception 'cedula_cotejar quedo abierta a la llave publica';
  end if;
  -- Esta es la peor de todas si se abre: seria un oraculo para preguntar
  -- «¿esta cedula es cliente de Joan?» una por una con la llave publica.
  if has_function_privilege('anon', 'public.cedula_repetida(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.cedula_repetida(text, text)', 'execute') then
    raise exception 'cedula_repetida quedo llamable desde fuera: es un oraculo sobre la cartera entera';
  end if;
  if (select prosrc from pg_proc
       where proname = 'registro_archivos_guardar' and pronamespace = 'public'::regnamespace)
     not like '%cedula_repetida%' then
    raise exception 'el cotejo no mira si esa cedula ya esta en otra ficha: es lo unico que caza la cedula ajena';
  end if;

  -- El desempate de archivos_de_registro, que se arregla arriba.
  if (select prosrc from pg_proc
       where proname = 'archivos_de_registro' and pronamespace = 'public'::regnamespace)
     not like '%creado_en desc, id desc%' then
    raise exception 'archivos_de_registro sigue sin desempate: las fotos pueden caer en la fila que Joan no mira';
  end if;
  if has_function_privilege('anon', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute') then
    raise exception 'registro_archivos_guardar quedo llamable sin sesion';
  end if;
  if not has_function_privilege('authenticated', 'public.registro_archivos_guardar(jsonb, jsonb)', 'execute') then
    raise exception 'registro_archivos_guardar dejo de ser llamable con sesion: las fotos no subirian';
  end if;
  if not has_function_privilege('anon', 'public.verificar_registro_foto(text, text, jsonb)', 'execute') then
    raise exception 'el CRM no puede llamar a verificar_registro_foto';
  end if;

  -- verificar_registro_foto pasa por clave_ok, que ESCRIBE. Si alguien la
  -- marcara stable, PostgREST la correria en solo lectura y reventaria con
  -- 25006 — que es lo que dejo las fotos invisibles del 8 al 10 de septiembre.
  if (select provolatile from pg_proc
       where proname = 'verificar_registro_foto' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'verificar_registro_foto no quedo volatil: clave_ok escribe y PostgREST la correria en solo lectura';
  end if;
end $$;
