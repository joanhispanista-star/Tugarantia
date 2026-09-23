-- 22-sep-2026 — QUE LA PLATA LLEGUE AL CELULAR DEL ASESOR
--
-- Fase 1 del plan de los roles. La fase 0 encendió las funciones; esta destapa
-- los dos tapones que estaban detrás y que no figuraban en ningún documento.
--
-- ===========================================================================
-- LO QUE PIDIÓ JOAN, Y LO QUE DECIDIÓ
--
-- «que el asesor tenga la informacion organizada de las ventas del credito y
--  tener organizado cuando tienen que pagar para preparar la cobranza»
--
-- Se le preguntó qué debía ver el asesor de la plata de su cliente, con las
-- tres opciones y sus riesgos. Eligió **fecha Y monto**, sabiendo lo que eso
-- significa: un asesor que pierde el celular, o que se va a la competencia, se
-- lleva la cartera valorizada de los suyos. Decisión suya, reafirmada, y queda
-- escrita aquí para que dentro de seis meses se sepa que no fue un descuido.
--
-- ===========================================================================
-- EL SEGUNDO TAPÓN: EL «SALIR»
--
-- `panel/crm.html` ya lo tenía escrito, con todas las letras:
--
--     «HAY UN SEGUNDO HUECO QUE ESTE ARREGLO NO TAPA: `noSMS` NO viaja en la
--      cartera del equipo. O sea que un ASESOR no tiene ni el dato. Mientras
--      eso no se arregle en la base, si no se puede comprobar, no se manda.»
--
-- Quien responde SALIR no puede volver a recibir mensajes, y eso es obligatorio
-- en Colombia. Como el asesor no tenía el dato, la pantalla se bloqueaba a sí
-- misma — y hacía bien: callarlo sería escribirle a quien pidió que no.
--
-- Así que el dato viaja. Una columna `no_sms` que solo puede llenar el CRM de
-- Joan, porque la fuente de verdad es la ficha del cliente y ahí sigue.
--
-- ===========================================================================
-- Y EL «AL DÍA DE», QUE NO ES UN ADORNO
--
-- El monto NO es un dato guardado: lo recalcula el CRM de Joan contra la fecha
-- de hoy, con sus intereses y su mora. Lo que se publica es una FOTO de ese
-- número.
--
-- Si Joan publica el lunes y no vuelve a publicar hasta el viernes, el asesor
-- lee un saldo de lunes, se lo dice al cliente por teléfono y se lo manda por
-- SMS. El cliente paga eso, **queda debiendo la mora de cuatro días**, y el
-- pantallazo del SMS lo tiene él. Eso no es un detalle de interfaz: es una
-- discusión perdida de antemano.
--
-- No hace falta columna nueva: `cartera.actualizado` ya es el instante en que
-- se publicó, que es el mismo en que se calculó. Solo había que devolverlo, y
-- que la pantalla lo pinte al lado de la cifra.
--
-- ===========================================================================
-- NO SE COPIAN CUERPOS. Se leen de la base con `pg_get_functiondef` y se les
-- cambia lo justo, con reemplazos tolerantes a los espacios. Copiar a mano es
-- cómo se pierde en silencio un `pg_sleep` o un `nullif`, y hoy ya estuvo a
-- punto de pasar una vez.

-- ====== 1. LA COLUMNA DEL «SALIR» ======
-- Nullable a propósito, igual que las cuatro de la plata: `null` es «no lo sé»,
-- y no es lo mismo que `false`. Un CRM que todavía no lo mande deja la columna
-- en null, y la pantalla sabe que con null NO puede mandar — que es el lado
-- correcto en el que equivocarse.
alter table public.cartera add column if not exists no_sms boolean;

comment on column public.cartera.no_sms is
  'true = esta persona respondio SALIR y no puede recibir mensajes (Ley 2300 y habeas data). null = el CRM todavia no lo publico, y entonces NO se manda.';

-- ====== 2. PUBLICAR TAMBIÉN EL «SALIR» ======
do $$
declare
  src   text;
  nueva text;
  paso  text := '';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'equipo_publicar' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.equipo_publicar'; end if;

  if position('no_sms' in src) > 0 then
    raise notice 'equipo_publicar ya publica el no_sms';
    return;
  end if;

  -- (a) la lista de columnas del insert
  nueva := regexp_replace(src,
    '(saldo,\s*saldo_total,\s*fecha_pago,\s*creditos,)(\s*actualizado\))',
    '\1 no_sms,\2', '');
  if nueva = src then raise exception 'no se encontro la lista de columnas del insert'; end if;
  paso := paso || 'columnas; ';
  src := nueva;

  -- (b) el valor, justo antes del now()
  nueva := regexp_replace(src,
    '(nullif\(it->>''creditos'',\s*''''\)::integer,)(\s*)(now\(\))',
    '\1\2(it->>''no_sms'')::boolean,\2\3', '');
  if nueva = src then raise exception 'no se encontro donde poner el valor de no_sms'; end if;
  paso := paso || 'valor; ';
  src := nueva;

  -- (c) y el update, con el mismo coalesce que el resto de la plata: no mandar
  --     un campo significa «no lo sé» y se queda lo último que sí se supo.
  nueva := regexp_replace(src,
    '(creditos\s*=\s*coalesce\(excluded\.creditos,\s*cartera\.creditos\),)',
    '\1' || E'\n          no_sms      = coalesce(excluded.no_sms,      cartera.no_sms),', '');
  if nueva = src then raise exception 'no se encontro el update de creditos'; end if;
  paso := paso || 'update; ';

  execute nueva;
  raise notice 'equipo_publicar: %', paso;
end $$;

-- ====== 3. Y DEVOLVERLO, CON EL «AL DÍA DE» ======
do $$
declare
  src   text;
  nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'mi_cartera' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.mi_cartera'; end if;

  if position('al_dia_de' in src) > 0 then
    raise notice 'mi_cartera ya devuelve el al_dia_de';
    return;
  end if;

  nueva := regexp_replace(src,
    '(''fecha_pago'',\s*p\.fecha_pago,\s*''creditos'',\s*p\.creditos,)',
    '\1' || E'\n               ''no_sms'', p.no_sms, ''al_dia_de'', p.actualizado,', '');
  if nueva = src then
    raise exception 'no se encontro donde anadir no_sms y al_dia_de en mi_cartera';
  end if;
  execute nueva;
end $$;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, y limpiando lo suyo. La prueba NO puede terminar en `raise
-- exception`: el editor corre el archivo en UNA transacción y eso revertiría
-- también los cambios de arriba.
--
-- Las variables llevan `v_` a propósito: `celular`, `nombre` y `estado` son
-- columnas de estas mismas tablas, y PL/pgSQL contesta 42702 sin decir cuál.
-- Costó un intento esta misma tarde.
do $prueba$
declare
  v_clave  text;
  v_cel    text := '3009990011';
  v_ced    text := 'PRUEBA-PLATA-1';
  j        jsonb;
  fila     public.cartera;
  pasos    text := '';
begin
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then raise exception 'no hay clave_sync: esto no se comprueba a ciegas'; end if;

  if exists (select 1 from public.cartera where id = v_ced) then
    raise exception 'ya existe una fila % en cartera: hay que mirarla antes de seguir', v_ced;
  end if;

  ---- 1. Se publica con plata y con el SALIR.
  j := public.equipo_publicar(v_clave, '[]'::jsonb, '[]'::jsonb, jsonb_build_array(
    jsonb_build_object('id', v_ced, 'tipo', 'cliente', 'celular', v_cel,
      'nombre', 'Prueba plata', 'estado', 'cliente', 'etapa', 'D-1',
      'saldo', '340000', 'saldo_total', '520000', 'fecha_pago', '2026-09-28',
      'creditos', '2', 'no_sms', 'true')));
  if (j->>'ok') <> 'true' then raise exception 'FALLO 1: no publico: %', j; end if;

  select * into fila from public.cartera where id = v_ced;
  if fila.saldo <> 340000 or fila.saldo_total <> 520000
     or fila.fecha_pago <> date '2026-09-28' or fila.creditos <> 2 then
    raise exception 'FALLO 1b: la plata no llego entera: %', to_jsonb(fila);
  end if;
  if fila.no_sms is not true then
    raise exception 'FALLO 1c GRAVE: el SALIR no viaja, y sin el la pantalla no puede mandar nada';
  end if;
  pasos := pasos || '1 la-plata-y-el-SALIR-viajan; ';

  ---- 2. LO QUE MAS IMPORTA: un publicar que NO mande la plata no la borra.
  ---- Antes, con `= excluded.saldo` a secas, un CRM viejo dejaba el saldo y la
  ---- fecha de TODA la cartera en null de un golpe, sin un error.
  j := public.equipo_publicar(v_clave, '[]'::jsonb, '[]'::jsonb, jsonb_build_array(
    jsonb_build_object('id', v_ced, 'tipo', 'cliente', 'celular', v_cel,
      'nombre', 'Prueba plata', 'estado', 'cliente', 'etapa', 'D0')));
  select * into fila from public.cartera where id = v_ced;
  if fila.saldo is null or fila.fecha_pago is null or fila.no_sms is null then
    raise exception 'FALLO 2 GRAVE: un publicar sin la plata la BORRO: %', to_jsonb(fila);
  end if;
  if fila.etapa <> 'D0' then
    raise exception 'FALLO 2b: la etapa si tiene que actualizarse y no lo hizo: %', fila.etapa;
  end if;
  pasos := pasos || '2 no-mandarla-no-la-borra; ';

  ---- 3. Y el asesor la recibe, con el «al dia de» al lado.
  ---- Se monta el equipo minimo para poder llamar a mi_cartera como el.
  if exists (select 1 from public.equipo where celular = v_cel) then
    raise exception 'el celular de prueba % es de alguien de verdad', v_cel;
  end if;
  insert into public.equipo (celular, nombre, rol, estado, jefe)
  values (v_cel, 'Prueba asesor', 'asesor', 'activo', null);
  insert into public.asignaciones (id, persona_id, asesor, desde, actualizado)
  values ('PRUEBA-PLATA-ASG', v_ced, v_cel, current_date, now());

  perform set_config('request.jwt.claims',
    '{"email":"57' || v_cel || '@tugarantia.net","role":"authenticated"}', true);
  j := public.mi_cartera();
  if (j->>'ok') <> 'true' then raise exception 'FALLO 3: mi_cartera no contesta: %', j; end if;

  j := j->'gente'->0;
  if (j->>'saldo') is null or (j->>'fecha_pago') is null then
    raise exception 'FALLO 3b: la plata no llega al asesor: %', j;
  end if;
  if (j->>'no_sms') is null then
    raise exception 'FALLO 3c GRAVE: el asesor no recibe el SALIR y su pantalla se bloqueara sola';
  end if;
  if (j->>'al_dia_de') is null then
    raise exception 'FALLO 3d: sin el «al dia de», el asesor le dice al cliente una cifra rancia sin saberlo';
  end if;
  pasos := pasos || '3 el-asesor-la-recibe-con-su-fecha; ';

  delete from public.asignaciones where id = 'PRUEBA-PLATA-ASG';
  delete from public.cartera      where id = v_ced;
  delete from public.equipo       where celular = v_cel;
  raise notice 'la plata viaja: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
-- Mira lo que se EJECUTA y aplasta los espacios antes: el comentario que
-- explica cada arreglo cita la línea mala, y un centinela anclado a una línea
-- se caza a sí mismo en cuanto alguien reformatea. Las dos cosas ya pasaron hoy.
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'equipo_publicar' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');

  if cuerpo not like '%no_sms%' then
    raise exception 'equipo_publicar dejo de publicar el SALIR: el asesor no podra mandar nada';
  end if;
  if cuerpo not like '%coalesce(excluded.saldo, cartera.saldo)%' then
    raise exception 'volvio el upsert que pisa la plata con null';
  end if;
  if cuerpo not like '%case when it->>''tipo'' = ''cliente''%' then
    raise exception 'se fue el saneo de tipo: una palabra rara revienta el Publicar entero';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cartera' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');

  if cuerpo not like '%''al_dia_de'', p.actualizado%' then
    raise exception 'mi_cartera dejo de decir CUANDO se calculo el saldo: el asesor cotizaria cifras rancias';
  end if;
  if cuerpo not like '%''no_sms'', p.no_sms%' then
    raise exception 'mi_cartera dejo de devolver el SALIR';
  end if;
  -- Y que no se llevo por delante lo de antes.
  if cuerpo not like '%p.saldo_total%' then
    raise exception 'se piso la plata de 20260919 al reescribir mi_cartera';
  end if;
end $$;
