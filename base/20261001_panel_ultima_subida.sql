-- ===========================================================================
-- CUÁNDO SUBIÓ EL COMPUTADOR — 1 de octubre de 2026
--
-- Se corre ENTERO en Supabase → SQL Editor, DESPUÉS de 20260811_panel_nube.sql.
-- Es idempotente (create ... if not exists, create or replace, y los permisos se
-- quitan y se vuelven a dar): correrlo dos veces da lo mismo que una, y no toca
-- ni una fila de datos.
--
-- LA PREGUNTA QUE CONTESTA
-- Joan, el 1-oct: «quiero ver este CRM desde mi celular». Desde hoy el CRM del
-- computador sube solo (panel/nube-crm.js). El celular (panel/espejo.html)
-- tiene que poder decir «El computador subió hace 12 min» o «El computador no
-- ha subido desde el 28-sep». Sin eso, en la calle, una cartera al día y una de
-- hace tres días se ven exactamente igual.
--
-- POR QUÉ HACE FALTA UNA FUNCIÓN NUEVA — se miró antes lo que ya había:
--   · Cada fila trae `actualizado_por` y `actualizado_en`, pero eso dice quién
--     tocó ESA FILA la última vez. Si el computador sube a las 10:00 y el celular
--     toca esas mismas fichas a las 11:00, ya ninguna dice 'computador', y el
--     celular contestaría «no ha subido desde el 28-sep» cuando subió hace una
--     hora. Eso es mentir con datos ciertos.
--   · panel_bitacora SÍ lo sabe: panel_empujar anota cada subida con el nombre
--     del aparato y cuántas filas entraron (20260811_panel_nube.sql:548). Pero
--     esa tabla está cerrada con RLS y sin políticas, y ninguna función la lee.
--   Esta función la lee para esa pregunta y para nada más, y solo para el dueño.
--
-- QUÉ CUENTA COMO «SUBIÓ»: una llamada a panel_empujar firmada 'computador' (así
-- firman panel/subir.html y panel/nube-crm.js) en la que entró AL MENOS UNA
-- fila. Un intento en el que todo chocó no es una subida: el celular no puede
-- decir «subió» si no entró nada. Por eso se devuelven las dos horas, la última
-- subida y el último intento.
--
-- QUÉ NO CUENTA, Y LA PANTALLA NO LO DISFRAZA: un computador al día que no tenía
-- nada nuevo no llama a la nube (el CRM no sube lo que no cambió), así que no
-- deja rastro. «No ha subido desde el 28-sep» quiere decir exactamente eso.
--
-- CÓMO QUEDA PROTEGIDA, igual que las cinco del 11-ago: security definer con el
-- search_path fijo, pregunta panel_es_dueno() antes de nada, y los permisos en
-- dos tiempos. El revoke NOMBRA a anon y authenticated porque Supabase les
-- concede EXECUTE a cada función nueva de public por su cuenta, y un
-- `revoke ... from public` no lo quita (20260828c_permisos.sql cuenta cómo se
-- descubrió). Las tablas no cambian: siguen con RLS y CERO políticas.
--
-- DESPUÉS DE CORRERLO: Settings → API → Reload schema. Sin eso la función
-- contesta 404 aunque exista, y el celular dice «Todavía no sé cuándo subió el
-- computador», que es justo lo que dice mientras esto no esté corrido.
-- ===========================================================================


-- La pregunta mira solo las subidas de un aparato. Con el índice parcial no
-- recorre las lecturas ('traer'), que son la mayoría de la bitácora: el celular
-- trae cada cinco minutos y la bitácora no se limpia nunca.
create index if not exists panel_bitacora_subidas
  on public.panel_bitacora (dispositivo, cuando desc)
  where que = 'empujar';


create or replace function public.panel_ultima_subida(p_dispositivo text default 'computador')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_disp text;
begin
  if not public.panel_es_dueno() then raise exception 'no autorizado'; end if;

  -- El mismo saneo que panel_empujar le hace al nombre al anotarlo: si no
  -- coinciden, la función preguntaría por un aparato que nunca firma así.
  v_disp := coalesce(nullif(btrim(coalesce(p_dispositivo, '')), ''), 'computador');

  return jsonb_build_object(
    -- La hora DEL SERVIDOR: el celular calcula «hace 12 min» restando dos horas
    -- del mismo reloj, sin depender del suyo, que puede estar corrido.
    'servidor_ahora', now(),
    'dispositivo',    v_disp,
    'ultima_subida',  (select max(b.cuando) from public.panel_bitacora b
                        where b.que = 'empujar' and b.dispositivo = v_disp and b.filas > 0),
    'ultimo_intento', (select max(b.cuando) from public.panel_bitacora b
                        where b.que = 'empujar' and b.dispositivo = v_disp)
  );
end
$$;


-- ---------------------------------------------------------------- grants ---
revoke all on function public.panel_ultima_subida(text) from public, anon, authenticated;
grant execute on function public.panel_ultima_subida(text) to authenticated;
-- Y NUNCA a anon: la llave anon va escrita dentro de las páginas públicas, y lo
-- que se le concede a anon se le concede a internet. Tener sesión tampoco
-- alcanza: adentro se vuelve a preguntar panel_es_dueno().


-- ------------------------------------------------------ qué falta probar ---
-- Con el SQL Editor y con la llave pública, en este orden:
--   1. Correrlo DOS VECES seguidas: la segunda no puede dar error.
--   2. Con la llave anon y SIN sesión: POST /rest/v1/rpc/panel_ultima_subida
--      → permiso denegado (401/403), nunca un 200 con horas.
--   3. Con sesión de un usuario que NO está en panel_duenos → 'no autorizado'.
--   4. Con la sesión de Joan, antes de que el CRM suba nada nuevo: devuelve la
--      hora de la última subida de subir.html, o null si nunca subió.
--   5. Cambiar algo en el CRM, esperar la subida (la cinta dice «Tu cartera
--      GUARDADA está en la nube») y abrir el celular: «El computador subió hace
--      un momento».
--   6. select has_function_privilege('anon', 'public.panel_ultima_subida(text)',
--      'execute') → false.
