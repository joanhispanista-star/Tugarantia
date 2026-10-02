-- ===========================================================================
-- LOS REGISTRADOS EN EL CELULAR — 2 de octubre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor, DESPUÉS de 20260811_panel_nube.sql
-- (de ahí sale panel_es_dueno). Es idempotente: crea o reemplaza una función y
-- vuelve a poner sus permisos. No toca ni una fila de datos.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema. Sin eso la función
-- contesta 404 aunque exista, y el celular dice «falta un paso en la nube»,
-- que es exactamente lo que dice mientras esto no esté corrido.
--
-- LA PREGUNTA QUE CONTESTA
-- Joan, el 1-oct: «que pueda ver este CRM desde mi celular… y ver los
-- registros nuevos». La bandeja de quién pidió entrar (public.registros) solo
-- se lee con listar_registros, y esa pide la CLAVE DE SINCRONIZACIÓN del CRM
-- (p_clave). El celular no la tiene y no debe tenerla: entra con el correo y
-- la contraseña de Joan (Supabase Auth), como las demás panel_*.
--
-- POR QUÉ NO SE REUSA listar_registros CON OTRA PUERTA
-- listar_registros devuelve la fila ENTERA (setof public.registros): la huella
-- con la IP, el aparato y el punto GPS, y los datos declarados completos. El
-- computador los necesita para revisar; el teléfono no, y un teléfono se
-- pierde en la calle. Esta función devuelve SOLO lo que la tarjeta del celular
-- pinta, campo por campo, armado a mano con jsonb_build_object.
--
-- LO QUE NUNCA SALE DE ACÁ
--   · Ninguna foto. Las fotos del registro (cédula por las dos caras y la
--     selfie, dato biométrico, Ley 1581) viven en otra tabla y esta función no
--     la nombra. El celular promete, con esas palabras, que las fotos se quedan
--     en el computador.
--   · Ni la IP, ni el aparato, ni el GPS, ni lo que leyó el código de barras.
--     Del cotejo sale solo el ESTADO y las tres banderas que la tarjeta pinta.
--   · Ni las referencias, ni los ingresos, ni la dirección: la ciudad y el
--     barrio alcanzan para saber de dónde es antes de llamarlo.
--
-- EL COTEJO SE LLAMA COTEJO
-- La app rellena el formulario con lo que lee del código de barras, así que
-- «coincide» no prueba nada (ver 20260922c_verificacion_cedula.sql). Por eso
-- de acá sale el estado tal cual —sin_codigo, intacto, retocado, no_cuadra— y
-- la pantalla solo pinta lo que informa: no_cuadra, menor de edad, documento
-- imposible y cédula repetida. Nunca un «verificado».
--
-- LA CÉDULA REPETIDA ES LA DEL DÍA DEL REGISTRO
-- La bandera sale del cotejo guardado (huella → cotejo_foto, o si no, cotejo),
-- que la calculó public.cedula_repetida en el momento. No se vuelve a calcular
-- acá a propósito: esa regla vive en UNA función, y repetirla dentro de esta
-- sería la segunda copia. Si alguien se registra después con la misma cédula,
-- la bandera sale en la ficha del segundo, que es la que hay que mirar.
--
-- COLUMNAS QUE PUEDEN NO ESTAR, Y POR QUÉ NO REVIENTA
-- origen (20260824), huella (20260908b) y app (20260921) se leen con
-- to_jsonb(r) ->> '...': si la columna no existe en la base de verdad, sale
-- null y la tarjeta no pinta esa parte. Leerlas por nombre haría que la
-- función, que PL/pgSQL compila en la PRIMERA LLAMADA y no al crearla, quedara
-- en verde al pegarla y muerta al usarla (ya costó trece días una vez).
-- Lo que pidió cada uno sale de public.solicitudes por registro_id
-- (20260908_primer_credito.sql) o, si la solicitud no lo trae, por el celular
-- (ver «DOS COSAS QUE LA PRIMERA VERSIÓN DECÍA MAL», más abajo); si la
-- columna registro_id no existe, el bloque no corre y la respuesta lo dice
-- (pedidos_leidos = false) en vez de contestar «no ha pedido nada».
--
-- CÓMO QUEDA PROTEGIDA, igual que panel_ultima_subida (20261001): security
-- definer con el search_path fijo, pregunta panel_es_dueno() en la primera
-- línea, y los permisos en dos tiempos. El revoke NOMBRA a anon y
-- authenticated porque Supabase les concede EXECUTE a cada función nueva de
-- public por su cuenta, y un revoke solo de public no lo quita
-- (20260828c_permisos.sql cuenta cómo se descubrió).
-- ===========================================================================


-- Sin panel_es_dueno no hay dueño que preguntar, y PL/pgSQL no lo nota al
-- crear la función: lo notaría Joan la primera vez que abra el celular.
-- Se para acá, con el nombre del archivo que falta.
do $$
begin
  if to_regprocedure('public.panel_es_dueno()') is null then
    raise exception 'Falta base/20260811_panel_nube.sql: sin panel_es_dueno() esta función no sabe quién es Joan. Córrelo primero.';
  end if;
  if to_regclass('public.registros') is null then
    raise exception 'No existe public.registros: corre primero base/supabase.sql.';
  end if;
end
$$;


create or replace function public.panel_registros(p_estado text default 'nuevo', p_limite integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estado      text;
  v_limite      integer;
  v_nuevos      integer := 0;
  v_filas       jsonb := '[]'::jsonb;
  v_con_pedido  boolean := false;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  v_estado := coalesce(nullif(btrim(coalesce(p_estado, '')), ''), 'nuevo');
  if v_estado not in ('nuevo', 'atendido', 'descartado') then
    raise exception 'estado inválido';
  end if;
  -- Con p_limite = 0 contesta solo cuántos hay nuevos: es lo que pide el
  -- celular para el número de la pestaña, sin bajar los datos de nadie.
  v_limite := least(greatest(coalesce(p_limite, 100), 0), 200);

  select count(*) into v_nuevos from public.registros r where r.estado = 'nuevo';

  if v_limite > 0 then
    select coalesce(jsonb_agg(x.fila order by x.creado_en desc, x.id desc), '[]'::jsonb)
      into v_filas
      from (
        select r.id, r.creado_en,
               jsonb_build_object(
                 'id',        r.id,
                 'nombre',    r.nombre,
                 'cedula',    r.cedula,
                 'telefono',  r.telefono,
                 'creado_en', r.creado_en,
                 'origen',    to_jsonb(r) ->> 'origen',
                 'app',       to_jsonb(r) ->> 'app',
                 'ciudad',    left(r.datos ->> 'ciudad', 80),
                 'barrio',    left(r.datos ->> 'barrio', 80),
                 'cotejo',    (
                   select case when c.v is null or jsonb_typeof(c.v) <> 'object' then null
                     else jsonb_build_object(
                       'estado',              c.v ->> 'estado',
                       'nivel',               c.v ->> 'nivel',
                       'menor',               coalesce(c.v ->> 'edad', '') = 'MENOR',
                       'documento_imposible', coalesce(c.v ->> 'tipo_doc', '') = 'incoherente',
                       'cedula_repetida',     coalesce(c.v -> 'repetida', 'false'::jsonb) = 'true'::jsonb)
                     end
                     from (select coalesce(to_jsonb(r) -> 'huella' -> 'cotejo_foto',
                                           to_jsonb(r) -> 'huella' -> 'cotejo') as v) c)
               ) as fila
          from public.registros r
         where r.estado = v_estado
         order by r.creado_en desc, r.id desc
         limit v_limite
      ) x;
  end if;

  -- Lo que pidió: la solicitud más reciente atada a ese registro. Va en un
  -- segundo paso y solo si la columna existe, porque si se escribiera dentro
  -- de la consulta de arriba y faltara registro_id, se caería la bandeja
  -- entera por un dato que es secundario.
  v_con_pedido := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'registro_id');

  -- 2-oct-2026 (revisión) — DOS COSAS QUE LA PRIMERA VERSIÓN DECÍA MAL:
  --
  -- 1. «Todavía no ha pedido un crédito» a quien sí pidió. Solo
  --    solicitar_primer_credito y PlataChat llenan registro_id; play_solicitar
  --    (20260922_a_la_medida_y_ayuda.sql, el botón «Pedir $X» de play/) no lo
  --    llena, y guarda el CELULAR en la columna cedula. Por eso, si la
  --    solicitud no tiene registro_id, se enlaza por los últimos 10 dígitos
  --    del celular —como enlaza solicitar_primer_credito—, contra cedula o
  --    contra celular (la columna de PlataChat). Con menos de 10 dígitos no se
  --    enlaza nada: un teléfono vacío casaría con cualquier solicitud vacía.
  --
  -- 2. «Pidió $100.000» cuando no pidió esa cifra. capital es lo que se le
  --    PROPONE: en el primer crédito nace con la propuesta automática y en
  --    PlataChat se pisa con la contrapropuesta. Lo que la persona pidió está
  --    en pedido_monto (play/) o en pedido->>'capital' (PlataChat); si no
  --    está, 'monto' sale null y el celular dice que no se sabe. La propuesta
  --    sale aparte, con QUIÉN la mandó reducido a su tipo (automatica, joan o
  --    gerente): el 'por' de un gerente lleva su celular y eso no hace falta
  --    para saber que no fue Joan.
  if v_con_pedido and jsonb_array_length(v_filas) > 0 then
    select coalesce(jsonb_agg(e.fila || jsonb_build_object('pedido', (
             select jsonb_build_object(
                      'monto',     coalesce(
                                     case when (to_jsonb(s) ->> 'pedido_monto') ~ '^[0-9]+$'
                                          then (to_jsonb(s) ->> 'pedido_monto')::bigint end,
                                     case when (to_jsonb(s) -> 'pedido' ->> 'capital') ~ '^[0-9]+$'
                                          then (to_jsonb(s) -> 'pedido' ->> 'capital')::bigint end),
                      'propuesta', case when (to_jsonb(s) -> 'contrapropuesta' ->> 'capital') ~ '^[0-9]+$'
                                        then (to_jsonb(s) -> 'contrapropuesta' ->> 'capital')::bigint end,
                      'por',       case
                                     when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') like 'automatica%' then 'automatica'
                                     when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') = 'joan'            then 'joan'
                                     when (to_jsonb(s) -> 'contrapropuesta' ->> 'por') like 'gerente%'     then 'gerente'
                                   end,
                      'producto',  to_jsonb(s) ->> 'producto',
                      'nota',      left(to_jsonb(s) ->> 'pedido_nota', 140),
                      'estado',    s.estado,
                      'creada_en', s.creada_en)
               from public.solicitudes s
              where s.registro_id = (e.fila ->> 'id')::bigint
                 or (s.registro_id is null
                     and length(e.tel) = 10
                     and (right(regexp_replace(coalesce(s.cedula, ''), '[^0-9]', '', 'g'), 10) = e.tel
                          or right(regexp_replace(coalesce(to_jsonb(s) ->> 'celular', ''), '[^0-9]', '', 'g'), 10) = e.tel))
              order by s.creada_en desc, s.id desc
              limit 1))
           order by e.n), '[]'::jsonb)
      into v_filas
      from (select f.fila, f.n,
                   right(regexp_replace(coalesce(f.fila ->> 'telefono', ''), '[^0-9]', '', 'g'), 10) as tel
              from jsonb_array_elements(v_filas) with ordinality as f(fila, n)) e;
  end if;

  return jsonb_build_object(
    -- La hora DEL SERVIDOR: el celular la pinta como «lo contestó la nube a
    -- las…», y así no depende del reloj del teléfono, que puede estar corrido.
    'servidor_ahora', now(),
    'estado',         v_estado,
    'nuevos',         v_nuevos,
    'pedidos_leidos', v_con_pedido,
    'registros',      v_filas
  );
end
$$;


-- ---------------------------------------------------------------- grants ---
revoke all on function public.panel_registros(text, integer) from public, anon, authenticated;
grant execute on function public.panel_registros(text, integer) to authenticated;
-- Y NUNCA a anon: la llave anon va escrita dentro de las páginas públicas, y lo
-- que se le concede a anon se le concede a internet. Tener sesión tampoco
-- alcanza: adentro se vuelve a preguntar panel_es_dueno().


-- Que los permisos quedaron como dice arriba, comprobado y no supuesto. Si no,
-- el editor revierte todo el archivo y Joan ve el motivo.
do $$
begin
  if has_function_privilege('anon', 'public.panel_registros(text, integer)', 'execute') then
    raise exception 'panel_registros quedó llamable con la llave pública: revisa los permisos antes de seguir.';
  end if;
  if not has_function_privilege('authenticated', 'public.panel_registros(text, integer)', 'execute') then
    raise exception 'panel_registros no quedó llamable con sesión: el celular no la va a poder leer.';
  end if;
  raise notice 'panel_registros lista. Falta: Settings → API → Reload schema.';
end
$$;


-- ------------------------------------------------------ qué falta probar ---
-- Con el SQL Editor y con la llave pública, en este orden:
--   1. Correrlo DOS VECES seguidas: la segunda no puede dar error.
--   2. Con la llave anon y SIN sesión: POST /rest/v1/rpc/panel_registros
--      → permiso denegado (401/403), nunca un 200 con nombres.
--   3. Con sesión de un usuario que NO está en panel_duenos → 'no autorizado'.
--   4. Con la sesión de Joan: los mismos nombres que el CRM en 📥 Registrados,
--      y ningún campo de foto en la respuesta.
--   5. select has_function_privilege('anon', 'public.panel_registros(text, integer)',
--      'execute') → false.
