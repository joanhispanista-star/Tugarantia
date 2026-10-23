-- ===========================================================================
-- A DÓNDE SE CONSIGNA CADA CRÉDITO — 22 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo →
-- Run. Se puede correr dos veces. Va DESPUÉS de
-- base/20261008_condiciones_aceptadas.sql (usa aceptar_condiciones). Al final
-- sale una tabla: todos los renglones tienen que decir ok = true. Después:
-- Settings → API → «Reload schema». Mándale a Claude la tabla.
--
-- 23-oct-2026 — SE LLAMABA 20261022_destino_del_desembolso.sql. Cambió de
-- nombre al juntar las ramas del lote del 27-oct: cuatro archivos del 22-oct
-- chocaban de dos en dos (20261022_ y 20261022b_), y el orden alfabético de
-- base/ tiene que ser el orden en que se corren. Son: 20261022_la_foto…,
-- ESTE (b), 20261022c_las_cuentas_del_registro.sql y, el último,
-- 20261022d_el_equipo_con_la_clave_de_joan.sql. Nada de adentro cambió.
--
-- ORDEN DE PUBLICACIÓN: PRIMERO ESTE ARCHIVO, DESPUÉS LA WEB. Si la web nueva
-- sale antes, la app no encuentra aceptar_con_destino (404), acepta como
-- siempre con aceptar_condiciones y le dice al cliente que le preguntamos por
-- el chat a dónde consignarle. No se rompe nada, pero se pierde la elección.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «Al momento de que el cliente acepte la contrapropuesta, que se le pregunte
-- nuevamente a qué cuenta desea que le consignen; recomendemos que sea por
-- billeteras digitales ya que es más rápido.»
--
-- QUÉ TRAE:
--   1. La columna solicitudes.destino_desembolso (jsonb): la cuenta que el
--      cliente eligió AL ACEPTAR esa propuesta. El CRM la lee de la bandeja de
--      siempre (listar_solicitudes_abiertas devuelve la fila entera) y pinta
--      «💸 Consignar a: …» con un botón para copiar el número.
--   2. destino_desembolso_limpio(jsonb): las reglas de app/cuentas-pago.js,
--      repetidas aquí. El teléfono lo controla quien lo tiene en la mano.
--   3. aceptar_con_destino(p_id, p_vio, p_destino): la aceptación de siempre
--      (aceptar_condiciones, que NO se toca) y el destino, en UNA sola
--      transacción. Si el destino no sirve, no se acepta nada; si la
--      aceptación falla, no se escribe ningún destino. Así no queda nunca una
--      solicitud aceptada sin cuenta por una señal que se cayó a la mitad.
--
-- POR QUÉ UNA FUNCIÓN NUEVA y no un tercer parámetro de aceptar_condiciones:
-- la app publicada la llama con dos, y una sobrecarga con el mismo nombre deja
-- a PostgREST escogiendo entre dos firmas. La app vieja (en caché) sigue
-- aceptando sin cuenta, y el CRM lo dice: «No eligió cuenta: pregúntale».
--
-- LAS REJAS (las mismas de la aceptación, porque son ELLA):
--   · solo con sesión (anon no la puede llamar);
--   · solo la dueña de la solicitud y solo mientras está en 'contrapropuesta'
--     (aceptar_condiciones mira las dos cosas con la fila bloqueada): nadie
--     cambia la cuenta de una solicitud ajena, ni la de una ya aceptada,
--     atendida o desembolsada. Un cambio después de aceptar va por el chat,
--     con Joan: es el engaño de siempre («consígnale a esta otra cuenta»);
--   · `propuesta` guarda el sello de la propuesta aceptada (creada_en): si
--     Joan vuelve a proponer, el destino de la vieja ya no es el de la nueva,
--     y el CRM no lo muestra como vigente.
--   · la tabla sigue con RLS y sin políticas: todo entra y sale por funciones.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LA COLUMNA
-- ---------------------------------------------------------------------------
alter table public.solicitudes add column if not exists destino_desembolso jsonb;

comment on column public.solicitudes.destino_desembolso is
  '22-oct-2026: la cuenta a nombre del cliente que eligió al aceptar (aceptar_con_destino). '
  '{medio: nequi|daviplata|breb|banco, numero|llave, banco, banco_codigo, banco_tipo, es_mia, elegido_en, propuesta}. '
  'propuesta = contrapropuesta.creada_en de la que aceptó: si no coincide, es de una propuesta vieja.';


-- ---------------------------------------------------------------------------
-- 2. LAS REGLAS DEL DESTINO (las de app/cuentas-pago.js, revisarDestino)
--
-- Devuelve el destino limpio, o null si no sirve. Pura: no lee ninguna tabla.
-- Los formatos de la llave Bre-B son los del Banco de la República (Circular
-- DSP-465, numeral 3.4.2): celular de 10 que empieza por 3; documento de
-- hasta 18 letras o números; correo de hasta 30 antes de la @ y 61 después;
-- alfanumérica @ más 5 a 20 letras o números. La cuenta de banco: solo
-- números, de 6 a 20; no hay fuente con reglas por banco, y no se inventan.
-- ---------------------------------------------------------------------------
create or replace function public.destino_desembolso_limpio(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_medio  text;
  v_num    text;
  v_llave  text;
  v_banco  text;
  v_codigo text;
  v_tipo   text;
  v_local  text;
  v_dom    text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return null;
  end if;
  -- La palabra del cliente de que la cuenta es suya. Sin ella no se guarda.
  if coalesce(p ->> 'es_mia', '') <> 'true' then
    return null;
  end if;
  v_medio := coalesce(p ->> 'medio', '');

  if v_medio in ('nequi', 'daviplata') then
    v_num := regexp_replace(coalesce(p ->> 'numero', ''), '\D', '', 'g');
    if length(v_num) = 12 and left(v_num, 2) = '57' then
      v_num := substr(v_num, 3);
    end if;
    if v_num !~ '^3[0-9]{9}$' then
      return null;
    end if;
    return jsonb_build_object('medio', v_medio, 'numero', v_num, 'es_mia', true);

  elsif v_medio = 'breb' then
    v_llave := btrim(coalesce(p ->> 'llave', ''));
    if left(v_llave, 1) = '@' then
      if v_llave !~ '^@[A-Za-z0-9]{5,20}$' then
        return null;
      end if;
    elsif position('@' in v_llave) > 1 then
      if v_llave ~ '\s' or array_length(string_to_array(v_llave, '@'), 1) <> 2 then
        return null;
      end if;
      v_local := split_part(v_llave, '@', 1);
      v_dom   := split_part(v_llave, '@', 2);
      if length(v_local) > 30 or length(v_dom) < 3 or length(v_dom) > 61 or position('.' in v_dom) < 2 then
        return null;
      end if;
    else
      -- Celular o documento: sin espacios, puntos ni guiones; el +57 solo con «+».
      v_llave := regexp_replace(v_llave, '[\s.\-]', '', 'g');
      if v_llave ~ '^\+573[0-9]{9}$' then
        v_llave := substr(v_llave, 4);
      end if;
      if v_llave !~ '^[A-Za-z0-9]{1,18}$' then
        return null;
      end if;
    end if;
    return jsonb_build_object('medio', 'breb', 'llave', v_llave, 'es_mia', true);

  elsif v_medio = 'banco' then
    v_codigo := btrim(coalesce(p ->> 'banco_codigo', ''));
    v_banco  := left(regexp_replace(btrim(coalesce(p ->> 'banco', '')), '\s+', ' ', 'g'), 60);
    v_tipo   := coalesce(p ->> 'banco_tipo', '');
    v_num    := regexp_replace(coalesce(p ->> 'numero', ''), '[\s.\-]', '', 'g');
    if v_codigo !~ '^([0-9]{1,3}-[0-9]{1,4}|otro)$'
       or length(v_banco) < 2
       or v_tipo not in ('Ahorros', 'Corriente')
       or v_num !~ '^[0-9]{6,20}$' then
      return null;
    end if;
    return jsonb_build_object('medio', 'banco', 'banco', v_banco, 'banco_codigo', v_codigo,
                              'banco_tipo', v_tipo, 'numero', v_num, 'es_mia', true);
  end if;

  return null;
end
$$;


-- ---------------------------------------------------------------------------
-- 3. ACEPTAR CON EL DESTINO, EN UNA SOLA TRANSACCIÓN
-- ---------------------------------------------------------------------------
create or replace function public.aceptar_con_destino(p_id bigint, p_vio jsonb, p_destino jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  d   jsonb;
  res jsonb;
  s   public.solicitudes;
begin
  -- Primero el destino: si no sirve, no se acepta nada (el cliente corrige y
  -- vuelve a tocar «Acepto»).
  d := public.destino_desembolso_limpio(p_destino);
  if d is null then
    return jsonb_build_object('ok', false, 'motivo', 'destino');
  end if;

  -- La aceptación de siempre, con TODAS sus rejas: la sesión, la dueña, el
  -- estado 'contrapropuesta' con la fila bloqueada, las cifras que vio y la
  -- constancia. Si dice que no, se devuelve su respuesta tal cual.
  res := public.aceptar_condiciones(p_id, p_vio);
  if coalesce(res ->> 'ok', '') <> 'true' then
    return res;
  end if;

  -- Aceptó: la fila es suya, está bloqueada por esta misma transacción y
  -- acaba de pasar a 'aceptada'. El destino se escribe sobre ESA aceptación.
  update public.solicitudes
     set destino_desembolso = d || jsonb_build_object(
           'elegido_en', now(),
           'propuesta', coalesce(contrapropuesta ->> 'creada_en', ''))
   where id = p_id
  returning * into s;

  return jsonb_build_object('ok', true,
    'solicitud', to_jsonb(s) - 'datos' - 'registro_id' - 'responsable');
end
$$;


-- ---------------------------------------------------------------------------
-- 4. LOS PERMISOS
--
-- Supabase le da EXECUTE a anon y authenticated a cada función nueva: primero
-- se les quita a todos y después se da solo lo que toca. Las reglas no las
-- llama nadie de afuera (aceptar_con_destino corre como su dueño).
-- ---------------------------------------------------------------------------
revoke all on function public.destino_desembolso_limpio(jsonb) from public, anon, authenticated;
revoke all on function public.aceptar_con_destino(bigint, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.aceptar_con_destino(bigint, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 5. ¿QUEDÓ? — solo mira, no cambia nada. Todos los renglones en true.
-- ---------------------------------------------------------------------------
select 1 as n, 'La columna destino_desembolso existe en solicitudes' as que,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'solicitudes'
                  and column_name = 'destino_desembolso') as ok
union all
select 2, 'Aceptar con destino existe y corre como dueño (security definer)',
       coalesce((select p.prosecdef and p.provolatile = 'v' from pg_proc p
                  where p.oid = to_regprocedure('public.aceptar_con_destino(bigint, jsonb, jsonb)')), false)
union all
select 3, 'Solo con sesión: el cliente sí, sin sesión no',
       case when to_regprocedure('public.aceptar_con_destino(bigint, jsonb, jsonb)') is null then false
            else has_function_privilege('authenticated', 'public.aceptar_con_destino(bigint, jsonb, jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.aceptar_con_destino(bigint, jsonb, jsonb)', 'execute') end
union all
select 4, 'Las reglas del destino no las llama nadie de afuera',
       case when to_regprocedure('public.destino_desembolso_limpio(jsonb)') is null then false
            else not has_function_privilege('authenticated', 'public.destino_desembolso_limpio(jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.destino_desembolso_limpio(jsonb)', 'execute') end
union all
select 5, 'Un Nequi bueno queda en 10 números',
       coalesce(public.destino_desembolso_limpio('{"medio":"nequi","numero":"+57 300 111 2233","es_mia":true}'::jsonb) ->> 'numero', '') = '3001112233'
union all
select 6, 'Sin «es mía» no se guarda ninguna cuenta',
       public.destino_desembolso_limpio('{"medio":"nequi","numero":"3001112233","es_mia":false}'::jsonb) is null
union all
select 7, 'Rechaza un celular que no es celular y una llave @ inventada de 3 letras',
       public.destino_desembolso_limpio('{"medio":"daviplata","numero":"6011234567","es_mia":true}'::jsonb) is null
       and public.destino_desembolso_limpio('{"medio":"breb","llave":"@abc","es_mia":true}'::jsonb) is null
union all
select 8, 'Una cuenta de banco necesita banco, tipo y de 6 a 20 números',
       public.destino_desembolso_limpio('{"medio":"banco","banco":"Bancolombia","banco_codigo":"1-7","banco_tipo":"Ahorros","numero":"123","es_mia":true}'::jsonb) is null
       and (public.destino_desembolso_limpio('{"medio":"banco","banco":"Bancolombia","banco_codigo":"1-7","banco_tipo":"Ahorros","numero":"123-456-789","es_mia":true}'::jsonb) ->> 'numero') = '123456789'
union all
select 9, 'La aceptación de la app publicada sigue igual (aceptar_condiciones)',
       to_regprocedure('public.aceptar_condiciones(bigint, jsonb)') is not null
       and has_function_privilege('authenticated', 'public.aceptar_condiciones(bigint, jsonb)', 'execute')
union all
select 10, 'solicitudes sigue con RLS (todo entra y sale por funciones)',
       coalesce((select relrowsecurity from pg_class where oid = 'public.solicitudes'::regclass), false)
order by 1;
