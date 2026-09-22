-- 22-sep-2026 — EL CORTACIRCUITO: que las fotos no puedan tumbar el negocio
--
-- Todos los frenos de las fotos son POR CLIENTE: 60 al mes por conversación,
-- 400.000 caracteres por foto, 20 mensajes cada 15 minutos. Ninguno mira el
-- TOTAL. Y el registro de la app no comprueba el celular —cualquiera abre
-- cuenta con un número que no sea suyo—, así que nada impide abrir cuentas en
-- bucle y llenar entre todas.
--
-- Lo que pasa al llenarse no es una factura. El plan gratis son 500 MB y al
-- pasarlos **la base entera se vuelve DE SOLO LECTURA**. No avisa nadie:
-- simplemente deja de poderse desembolsar, deja de poderse registrar un pago,
-- deja de poderse contestar el chat. El negocio de Joan se para y el primer
-- síntoma es un cliente diciendo que la app no le deja hacer nada.
--
-- Un tope por cliente no puede proteger de eso, por definición: protege de UN
-- cliente. Hace falta uno que mire el total, y es barato — `pg_total_relation_size`
-- lee un dato que el catálogo ya tiene, no cuenta filas.
--
-- 150 MB dan para unas 1.500 fotos de verdad (una foto comprimida como las
-- comprime esta casa son 100.023 caracteres). Con 22 clientes son 68 fotos
-- cada uno: de sobra para comprobantes de pago. Y deja 350 MB de aire para lo
-- único que aquí no se puede parar nunca, que son los créditos y los pagos.
--
-- Cuando se llena, se dice con todas las letras y se ofrece la salida que SÍ
-- existe: escribir. No es el callejón sin salida que se acaba de quitar en
-- 20260922i, porque esto lo arregla Joan borrando conversaciones viejas.

do $$
declare
  src   text;
  nueva text;
  corte text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'chat_foto_sesion' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.chat_foto_sesion'; end if;

  if position('pg_total_relation_size' in src) > 0 then
    raise notice 'el cortacircuito ya estaba puesto';
    return;
  end if;

  corte :=
    'if pg_total_relation_size(''public.chat_fotos'') > 150 * 1024 * 1024 then ' ||
      'return jsonb_build_object(''ok'', false, ''motivo'', ''lleno''); ' ||
    'end if; ';

  -- Va justo DESPUÉS de comprobar la sesión: lo primero que se mira, antes de
  -- gastar nada en revisar la imagen. Tolerante a los espacios, porque el
  -- formato de pg_get_functiondef no es el del archivo — y hoy ya se rompió
  -- una migración por anclarse a un espacio concreto.
  nueva := regexp_replace(src,
    '(llave\s*:=\s*public\.llave_de_sesion\(cel\);)',
    '\1' || E'\n\n  ' || corte, '');

  if nueva = src then
    raise exception 'no se encontro donde poner el cortacircuito en chat_foto_sesion';
  end if;
  execute nueva;
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
do $prueba$
declare
  cel      text := '3009998844';
  img      text := 'data:image/jpeg;base64,' || repeat('A', 500);
  original text;
  j        jsonb;
  tamano   bigint;
  pasos    text := '';
begin
  -- Se GUARDA el original y se repone tal cual. La primera version de esto
  -- restauraba buscando un texto («> 0 then»), que es como se deja una
  -- funcion a medias el dia que ese texto aparezca en otro sitio.
  select pg_get_functiondef(p.oid) into original
    from pg_proc p
   where p.proname = 'chat_foto_sesion' and p.pronamespace = 'public'::regnamespace;

  perform set_config('request.jwt.claims',
    '{"email":"57' || cel || '@tugarantia.net","role":"authenticated"}', true);

  ---- Con sitio de sobra NO debe frenar: un freno que salta cuando no toca es
  ---- peor que no tenerlo, porque nadie lo cree la vez que si hace falta.
  select pg_total_relation_size('public.chat_fotos') into tamano;
  if tamano > 150 * 1024 * 1024 then
    raise notice 'la tabla ya pasa de 150 MB (% bytes): esto hay que mirarlo aparte', tamano;
  else
    j := public.chat_foto_sesion('cobranza', img, null, 'Prueba del cortacircuito');
    if (j->>'ok') <> 'true' then
      raise exception 'FALLO 1: el cortacircuito frena con la tabla vacia: %', j;
    end if;
    pasos := pasos || '1 con-sitio-si-entra; ';
  end if;

  ---- Y que el freno CORTA de verdad, no solo que esta escrito. Se le baja el
  ---- liston a cero y tiene que negarse: asi se prueba el camino entero -- la
  ---- comparacion, el return y el motivo -- sin llenar 150 MB.
  execute replace(original, '150 * 1024 * 1024', '0');
  j := public.chat_foto_sesion('cobranza', img, null, 'Con la tabla llena');
  if (j->>'motivo') <> 'lleno' then
    execute original;   -- que no se quede en cero pase lo que pase
    raise exception 'FALLO 2 GRAVE: el cortacircuito no corta: %', j;
  end if;
  pasos := pasos || '2 sin-sitio-se-niega; ';

  ---- Y vuelve a su sitio. Si esto se olvidara, el chat no aceptaria una sola
  ---- foto nunca mas y nadie sabria por que.
  execute original;
  if (select prosrc from pg_proc
       where proname = 'chat_foto_sesion' and pronamespace = 'public'::regnamespace)
     not like '%150 * 1024 * 1024%' then
    raise exception 'FALLO 3 GRAVE: el liston se quedo en cero: el chat no aceptaria ni una foto';
  end if;
  pasos := pasos || '3 el-liston-vuelve-a-su-sitio; ';

  delete from public.mensajes where cedula = cel;
  raise notice 'el cortacircuito: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'chat_foto_sesion' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(cuerpo, '--[^\n]*', '', 'g');

  if cuerpo not like '%pg_total_relation_size%' then
    raise exception 'se fue el cortacircuito: las fotos pueden volver a dejar la base de solo lectura';
  end if;
  if cuerpo not like '%150 * 1024 * 1024%' then
    raise exception 'el liston del cortacircuito no es 150 MB: mirar en que quedo antes de seguir';
  end if;
  -- Y que no se llevo por delante lo que ya habia.
  if cuerpo not like '%p_imagen !~ buena%' then
    raise exception 'se piso la comprobacion de la forma entera (20260922g)';
  end if;
  if cuerpo not like '%30 days%' then
    raise exception 'se piso la ventana del tope (20260922i)';
  end if;
  if cuerpo not like '%cuantas >= 60%' then
    raise exception 'se piso el tope de 60';
  end if;
end $$;
