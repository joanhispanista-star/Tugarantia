-- ===========================================================================
-- LA RULETA DEL CUPO
-- 15 de septiembre de 2026
--
-- SQL Editor de Supabase -> New query -> pegar TODO -> Run. Idempotente.
-- Va después de 20260916_contrapropuesta_a_cuotas.sql.
--
-- ---------------------------------------------------------------------------
-- LO QUE PIDIÓ JOAN
--
-- «hagas una ruleta en la cual tengamos premios como cupos de aumento o un cupo
--  automatico de 100.000 pesos quiero que indique que juegue el cliente pero
--  que al momento que el cliente quiera jugar primero le indique que se
--  registre, y cuando se registre con el nombre y telefono tenga la opcion de
--  jugar y que pueda tirar solo una vez»
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO GARANTIZA, Y POR QUÉ ESTÁ ACÁ Y NO EN LA PANTALLA
--
-- «Que pueda tirar SOLO UNA VEZ» no se puede cumplir en el teléfono. Lo que
-- guarde la página se borra vaciando el navegador, y el premio es cupo — o sea,
-- plata de Joan. Un cliente que sepa borrar datos de Chrome se regalaría cupo
-- toda la tarde.
--
-- Acá la única vez la impone la BASE, con una llave primaria: el celular. No es
-- una comprobación que se pueda saltar, es una fila que no puede existir dos
-- veces. Aunque alguien llame la función mil veces seguidas desde mil pestañas,
-- la segunda en llegar choca contra la llave y devuelve el premio que ya tenía.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE PAGA EL PREMIO (lo importante para que las cuentas cuadren)
--
-- El cupo de esta casa NO es un campo: sale de la garantía (motor.js —
-- base_cupo = garantía total menos comprometida, y calcularCupo). Entonces el
-- premio se entrega como un AJUSTE DE GARANTÍA de $100.000, que es el mismo
-- mecanismo con el que Joan ya ajusta a mano desde el CRM.
--
-- Si el premio se escribiera como «cupo» suelto habría dos fuentes de cupo en
-- el sistema, y el día que no cuadraran nadie sabría cuál manda.
--
-- POR ESO ESTE ARCHIVO REGISTRA EL GIRO PERO NO TOCA LA GARANTÍA DEL SOCIO.
-- La garantía vive en socios_historial.datos y la fuente de verdad de ese jsonb
-- es el CRM de Joan: sincronizar_socios lo SOBREESCRIBE completo cada vez que
-- Joan sincroniza. Si esta función escribiera ahí el ajuste, el primer sync de
-- Joan lo borraría y el cliente vería desaparecer su premio sin explicación.
-- Entonces: el giro queda anotado acá, Joan lo ve en su CRM con el botón de
-- aplicar, y el ajuste entra por donde entran todos los ajustes. Es un paso
-- más para Joan y es el único que no se contradice solo.
--
-- ---------------------------------------------------------------------------
-- EL PREMIO MAYOR NO SE SORTEA, Y ESO ESTÁ ESCRITO ACÁ A PROPÓSITO
--
-- Joan pidió que el premio de $500.000 no lo gane nadie. Así es: esta función
-- entrega SIEMPRE $100.000 y no consulta el azar ni una vez — no hay random()
-- en este archivo, y hay una prueba más abajo que lo comprueba.
--
-- Los escalones de arriba se anuncian en la pantalla como a dónde se llega
-- PAGANDO, no como suerte. Dos razones, las dos de plata:
--   1. Un premio pintado como alcanzable que es imposible es publicidad
--      engañosa (Ley 1480 de 2011, arts. 29 y 30), y a un prestamista eso no le
--      queda en una devolución sino en la SIC.
--   2. Un sorteo de verdad es un JUEGO PROMOCIONAL y necesita permiso de
--      Coljuegos (Ley 643 de 2001). Una rueda de resultado seguro no lo es.
-- ===========================================================================

-- Sin esto, la función escribiría en una tabla que no existe y el error saldría
-- en la cara del cliente en vez de acá.
do $$
begin
  if to_regclass('public.registros') is null then
    raise exception 'Falta la migracion del registro: no hay tabla public.registros';
  end if;
  if not exists (select 1 from pg_proc
                  where proname = 'celular_de_sesion'
                    and pronamespace = 'public'::regnamespace) then
    raise exception 'Falta 20260910c_quien_soy.sql: no existe celular_de_sesion()';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. DÓNDE QUEDA LO QUE SE GIRÓ
--
-- El celular es la LLAVE PRIMARIA, no una columna más. Ahí vive la regla de
-- «una sola vez»: no es un if que se pueda olvidar, es una imposibilidad.
-- ---------------------------------------------------------------------------
create table if not exists public.ruleta_giros (
  celular      text primary key,
  premio_id    text        not null,
  cupo         bigint      not null check (cupo >= 0),
  nombre       text,
  girado_en    timestamptz not null default now(),
  -- Para que Joan pueda ver desde dónde giraron sin cruzar con otra tabla.
  origen       text
);

comment on table public.ruleta_giros is
  'Un giro por celular. La llave primaria ES la regla de una sola vez.';

-- RLS encendida y CERO políticas: nadie llega por PostgREST a la tabla, solo
-- por las funciones de abajo. Es el patrón de toda esta base.
alter table public.ruleta_giros enable row level security;

create index if not exists ruleta_giros_fecha on public.ruleta_giros (girado_en desc);

-- ---------------------------------------------------------------------------
-- 2. EL PREMIO, EN UN SOLO LUGAR
--
-- La cifra vive acá y en app/ruleta.js, y las dos tienen que decir lo mismo.
-- Hay una prueba en pruebas/ruleta.test.js que lee este archivo y compara.
-- ---------------------------------------------------------------------------
create or replace function public.ruleta_premio()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('id', 'bienvenida', 'cupo', 100000);
$$;

-- ---------------------------------------------------------------------------
-- 3. GIRAR
--
-- Devuelve el premio SIEMPRE, haya girado antes o no: la pantalla necesita
-- poder pintar «esto te ganaste» cuando vuelve a entrar. Lo que cambia es
-- `ya_giro`, para que no se anime la rueda otra vez.
--
-- VOLATILE, y no es decoración: esta función escribe. Marcarla stable haría que
-- PostgREST la sirviera por GET y la escritura se perdiera en silencio.
-- ---------------------------------------------------------------------------
create or replace function public.ruleta_girar()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  cel     text;
  premio  jsonb;
  nom     text;
  ya      boolean := false;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    -- Sin cuenta no se gira. Es el «primero regístrate» que pidió Joan, pero
    -- dicho por el servidor: la pantalla lo repite, no lo decide.
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta');
  end if;

  premio := public.ruleta_premio();

  -- El nombre, para que Joan vea quién giró sin cruzar tablas a mano.
  select r.nombre into nom
    from public.registros r
   where public.solo_digitos(r.telefono) = public.solo_digitos(cel)
   order by r.creado_en desc
   limit 1;

  -- El insert que puede chocar. `on conflict do nothing` y después se mira si
  -- entró: así la carrera entre dos pestañas la resuelve la base, no un if.
  insert into public.ruleta_giros (celular, premio_id, cupo, nombre, origen)
  values (public.solo_digitos(cel),
          premio->>'id',
          (premio->>'cupo')::bigint,
          nom,
          'play')
  on conflict (celular) do nothing;

  if not found then
    ya := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'ya_giro', ya,
    'premio', premio,
    'nombre', nom
  );
end $$;

-- ---------------------------------------------------------------------------
-- 4. MI ESTADO — lo que la pantalla pregunta ANTES de pintar la rueda
--
-- Stable: no escribe nada.
-- ---------------------------------------------------------------------------
create or replace function public.ruleta_mi_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare cel text; g public.ruleta_giros;
begin
  cel := public.celular_de_sesion();
  if cel is null then
    return jsonb_build_object('registrado', false, 'ya_giro', false,
                              'premio', public.ruleta_premio());
  end if;

  select * into g
    from public.ruleta_giros
   where celular = public.solo_digitos(cel);

  return jsonb_build_object(
    'registrado', true,
    'ya_giro', found,
    'premio', public.ruleta_premio(),
    'girado_en', case when found then g.girado_en else null end
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. LO QUE VE JOAN EN EL CRM
--
-- Por clave, como todo lo del panel. Y VOLATILE obligatorio: clave_ok() hace
-- nextval() para su freno de intentos, y una función que la llame declarada
-- stable la sirve PostgREST por GET y devuelve 405 / 25006 siempre. Este
-- proyecto ya perdió una tarde con eso.
-- ---------------------------------------------------------------------------
create or replace function public.ruleta_giros_panel(p_clave text, p_desde date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare filas jsonb; total bigint; suma bigint;
begin
  if not public.clave_ok(p_clave) then
    return jsonb_build_object('ok', false);
  end if;

  select coalesce(jsonb_agg(x order by x->>'girado_en' desc), '[]'::jsonb)
    into filas
    from (
      select jsonb_build_object(
               'celular',   g.celular,
               'nombre',    g.nombre,
               'premio_id', g.premio_id,
               'cupo',      g.cupo,
               'girado_en', g.girado_en,
               'origen',    g.origen) as x
        from public.ruleta_giros g
       where p_desde is null or g.girado_en >= p_desde
       order by g.girado_en desc
       limit 500
    ) s;

  select count(*), coalesce(sum(cupo), 0) into total, suma
    from public.ruleta_giros
   where p_desde is null or girado_en >= p_desde;

  return jsonb_build_object('ok', true, 'giros', filas,
                            'total', total, 'cupo_entregado', suma);
end $$;

-- ---------------------------------------------------------------------------
-- 6. LAS REJAS
-- ---------------------------------------------------------------------------
revoke all on function public.ruleta_premio()               from public, anon, authenticated;
grant  execute on function public.ruleta_premio()           to anon, authenticated;

revoke all on function public.ruleta_girar()                from public, anon, authenticated;
grant  execute on function public.ruleta_girar()            to authenticated;

revoke all on function public.ruleta_mi_estado()            from public, anon, authenticated;
grant  execute on function public.ruleta_mi_estado()        to anon, authenticated;

revoke all on function public.ruleta_giros_panel(text, date) from public, anon, authenticated;
grant  execute on function public.ruleta_giros_panel(text, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. LO QUE SE COMPRUEBA SOLO
--
-- No son comentarios: si algo de esto no se cumple, el pegado FALLA acá y no
-- se descubre con un cliente delante.
-- ---------------------------------------------------------------------------
do $$
declare cuerpo text;
begin
  -- 7.1 La rueda no consulta el azar. Es la promesa de Joan («que nadie gane el
  --     premio mayor») convertida en algo que se puede verificar.
  select pg_get_functiondef(oid) into cuerpo
    from pg_proc where proname = 'ruleta_girar' and pronamespace = 'public'::regnamespace;
  if cuerpo ~* '\mrandom\s*\(' then
    raise exception 'ruleta_girar consulta el azar: el premio dejaria de ser seguro';
  end if;

  -- 7.2 Girar tiene que ser volatile o PostgREST la sirve por GET y la
  --     escritura se pierde sin avisar.
  if (select provolatile from pg_proc
       where proname = 'ruleta_girar' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'ruleta_girar no es volatile';
  end if;

  -- 7.3 Y la del panel también, porque llama clave_ok().
  if (select provolatile from pg_proc
       where proname = 'ruleta_giros_panel' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'ruleta_giros_panel no es volatile, y llama clave_ok(): daria 405 siempre';
  end if;

  -- 7.4 La tabla con RLS encendida y sin políticas: nadie la lee por PostgREST.
  if not (select relrowsecurity from pg_class where oid = 'public.ruleta_giros'::regclass) then
    raise exception 'ruleta_giros sin RLS: la llave publica podria leer los giros';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'ruleta_giros') then
    raise exception 'ruleta_giros tiene politicas: se esperaba cero';
  end if;

  -- 7.5 El premio es el que dice app/ruleta.js.
  if (public.ruleta_premio()->>'cupo')::bigint <> 100000 then
    raise exception 'el premio de la base no es 100000';
  end if;

  raise notice 'ruleta: lista. Premio %, una sola vez por celular.',
    (public.ruleta_premio()->>'cupo');
end $$;

/* QUE POSTGREST SE ENTERE. Sin esto, las funciones nuevas existen en la base y
   PostgREST sigue contestando 404 sobre ellas hasta que algo lo reinicie: el CRM
   dice «tu nube todavia no sabe hacer esto» sobre algo que SI acaba de quedar
   hecho, y se pierde la tarde buscando el error en el sitio equivocado.
   Faltaba en esta migracion, en la de la ruleta y en la del asesor — las tres
   del trabajo reciente. Se corrio a mano el 16-sep-2026 y se agrega aqui para
   que quien la vuelva a correr no dependa de acordarse. */
notify pgrst, 'reload schema';
