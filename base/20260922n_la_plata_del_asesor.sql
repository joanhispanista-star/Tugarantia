-- 22-sep-2026 — LO QUE EL ASESOR LLEVA GANADO
--
-- Fase 2 del plan de los roles.
--
-- ===========================================================================
-- LO QUE PIDIÓ JOAN
--
-- «que pueda ver con claridad sus propios indicadores»
--
-- Se le preguntó qué debía ver de su propia plata, con tres opciones. Eligió
-- **todo: ganado, bloqueado y descontado**, porque —sus palabras— el número
-- que motiva es el que se cobra.
--
-- ===========================================================================
-- POR QUÉ ESTO NO SE PUEDE CALCULAR EN EL CELULAR
--
-- La pestaña «Mi plata» explica las reglas de comisión perfectamente —cuánto
-- se gana por traer, por colocar, por cobrar y cuánto se descuenta por una mora
-- de más de veinte días— y **no dice un solo peso de lo que él lleva**. Para un
-- comercial, ese es EL indicador.
--
-- No es un olvido: no se puede calcular allí. El libro de comisiones se deriva
-- de `socios`, `prestamos`, `registros` y `asignaciones` (`derivarMovimientos`),
-- y en el celular del asesor **`DB` está vacío a propósito** — `modoEquipo()`
-- lo limpia para que nadie que entre en el computador de Joan se lleve la
-- cartera colgando de una variable. Esa decisión es correcta y no se toca.
--
-- Así que el saldo se calcula donde están los datos —el CRM de Joan— y viaja
-- ya hecho. Cinco números por persona, no el libro entero: el libro son
-- centenares de movimientos con `socio_id` dentro, y mandarlos sería mandar la
-- cartera de nuevo por otra puerta.
--
-- ===========================================================================
-- LAS CINCO CIFRAS, Y POR QUÉ CADA UNA
--
-- · `com_libre`     — lo que puede cobrar ya.
-- · `com_bloqueado` — ganado pero retenido hasta que el cliente pague. Es la
--                     mitad del diseño de Joan: el asesor cobra de verdad
--                     cuando el cliente paga, así que le duele lo mismo.
-- · `com_castigos`  — lo descontado por moras de más de veinte días.
-- · `com_deuda`     — lo que un castigo no alcanzó a descontar porque no había
--                     saldo. Va aparte y NO se esconde en un número negativo:
--                     quitarle plata que ya está en su bolsillo no lo decide
--                     una fórmula, lo decide Joan.
-- · `com_ganado`    — bloqueado + libre + pagado. El acumulado de siempre.
--
-- ===========================================================================
-- Y EL MISMO AVISO QUE CON LA CARTERA: esto es una FOTO. Se calcula al
-- publicar. `equipo.actualizado` ya dice cuándo, y `mi_cartera` lo devuelve
-- para que la pantalla lo diga — igual que con los saldos de los clientes
-- (20260922m). Un asesor que lee «llevas $320.000» de hace una semana y cuenta
-- con esa plata es un problema que se arregla diciendo la fecha.
--
-- NO SE COPIAN CUERPOS: se leen de la base y se les cambia lo justo, con
-- reemplazos tolerantes a los espacios.

-- ====== 1. LAS CINCO COLUMNAS ======
-- Nullable a propósito: `null` es «este CRM todavía no las manda», y la
-- pantalla lo distingue de cero. Decir «llevas $0» a quien lleva $320.000
-- sería peor que no decir nada.
alter table public.equipo add column if not exists com_libre     bigint;
alter table public.equipo add column if not exists com_bloqueado bigint;
alter table public.equipo add column if not exists com_castigos  bigint;
alter table public.equipo add column if not exists com_deuda     bigint;
alter table public.equipo add column if not exists com_ganado    bigint;

comment on column public.equipo.com_bloqueado is
  'Comision ganada pero retenida hasta que el cliente pague. La calcula el CRM de Joan (app/comisiones.js); aqui solo se guarda la foto.';

-- ====== 2. PUBLICARLAS ======
-- Tres reemplazos, los tres anclados a texto que EXISTE y tolerantes a los
-- espacios: el formato que devuelve pg_get_functiondef no es el del archivo, y
-- anclarse a una sangria concreta es como se rompio una migracion esta tarde.
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

  if position('com_libre' in src) > 0 then
    raise notice 'equipo_publicar ya publica las comisiones';
    return;
  end if;

  -- (a) la lista de columnas
  nueva := regexp_replace(src,
    'jefe,\s*actualizado\)',
    'jefe, com_libre, com_bloqueado, com_castigos, com_deuda, com_ganado, actualizado)', '');
  if nueva = src then raise exception 'no se encontro la lista de columnas de equipo'; end if;
  paso := paso || 'columnas; '; src := nueva;

  -- (b) los valores, justo antes del now(). Se ancla al cierre del `jefe`, que
  --     es la ultima linea antes y no se parece a nada mas del archivo.
  nueva := regexp_replace(src,
    '(solo_digitos\(coalesce\(it->>''jefe'', ''''\)\), 10\), ''''\),)(\s*)(now\(\)\))',
    '\1\2nullif(it->>''com_libre'', '''')::bigint,' ||
    '\2nullif(it->>''com_bloqueado'', '''')::bigint,' ||
    '\2nullif(it->>''com_castigos'', '''')::bigint,' ||
    '\2nullif(it->>''com_deuda'', '''')::bigint,' ||
    '\2nullif(it->>''com_ganado'', '''')::bigint,' ||
    '\2\3', '');
  if nueva = src then raise exception 'no se encontro el values de equipo'; end if;
  paso := paso || 'valores; '; src := nueva;

  -- (c) y el update, con el mismo coalesce que la plata de los clientes.
  nueva := regexp_replace(src,
    '(estado = excluded\.estado, jefe = excluded\.jefe,)(\s*)(actualizado = now\(\);)',
    '\1' ||
    E'\n          com_libre     = coalesce(excluded.com_libre,     equipo.com_libre),' ||
    E'\n          com_bloqueado = coalesce(excluded.com_bloqueado, equipo.com_bloqueado),' ||
    E'\n          com_castigos  = coalesce(excluded.com_castigos,  equipo.com_castigos),' ||
    E'\n          com_deuda     = coalesce(excluded.com_deuda,     equipo.com_deuda),' ||
    E'\n          com_ganado    = coalesce(excluded.com_ganado,    equipo.com_ganado),' ||
    '\2\3', '');
  if nueva = src then raise exception 'no se encontro el update de equipo'; end if;
  paso := paso || 'update; ';

  execute nueva;
  raise notice 'equipo_publicar: %', paso;
end $$;

-- ====== 3. Y DEVOLVÉRSELAS ======
-- En `yo` (la suya) y en `equipo` (las de los suyos, para el gerente: es el
-- «seguimiento de indicadores» que pidió Joan, y la plata la paga él).
do $$
declare
  src   text;
  nueva text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'mi_cartera' and p.pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no existe public.mi_cartera'; end if;

  if position('com_ganado' in src) > 0 then
    raise notice 'mi_cartera ya devuelve las comisiones';
    return;
  end if;

  nueva := regexp_replace(src,
    '(''yo'',\s*jsonb_build_object\(''nombre'',\s*yo\.nombre,\s*''rol'',\s*yo\.rol,\s*''celular'',\s*yo\.celular)',
    '\1' ||
    E',\n        ''com_libre'', yo.com_libre, ''com_bloqueado'', yo.com_bloqueado,' ||
    E'\n        ''com_castigos'', yo.com_castigos, ''com_deuda'', yo.com_deuda,' ||
    E'\n        ''com_ganado'', yo.com_ganado, ''com_al_dia_de'', yo.actualizado', '');
  if nueva = src then raise exception 'no se encontro el bloque yo de mi_cartera'; end if;
  src := nueva;

  nueva := regexp_replace(src,
    '(jsonb_build_object\(''celular'',\s*celular,\s*''nombre'',\s*nombre,\s*''rol'',\s*rol)',
    '\1, ''com_libre'', com_libre, ''com_bloqueado'', com_bloqueado,' ||
    E'\n               ''com_castigos'', com_castigos, ''com_ganado'', com_ganado', '');
  if nueva = src then raise exception 'no se encontro el bloque equipo de mi_cartera'; end if;

  execute nueva;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Y UN ARREGLO QUE NO ES DE ESTA FASE, PERO NO PUEDE ESPERAR
--
-- Esta tarde se le cambió la FIRMA a `registro_vivo_borrar` para que pidiera el
-- testigo… y **el cuerpo nunca lo miró**. Siguió borrando por celular, sin
-- comprobar nada, concedida a `anon`.
--
-- Peor: la prueba que se hizo contra la base real dio «bien» POR LA RAZÓN
-- EQUIVOCADA. Comprobaba que después del borrado ajeno se pudiera seguir
-- publicando con el testigo bueno — y eso pasa igual si la fila se borró, porque
-- entonces `publicar` crea una nueva y contesta `ok`. La prueba medía otra cosa.
--
-- Es exactamente la trampa de esta casa: **probar que algo corre no es probar
-- que haga lo que dice**. Aquí el arreglo de verdad.
--
-- Se contesta `ok` en los dos casos a propósito: decir «esa fila no es tuya»
-- convertiría esto en un detector de quién se está registrando ahora mismo.
-- ===========================================================================
create or replace function public.registro_vivo_borrar(p_celular text, p_testigo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cel text;
begin
  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  delete from public.registro_en_vivo
   where celular = cel
     and testigo = coalesce(p_testigo, '');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.registro_vivo_borrar(text, text)     from public, anon, authenticated;
grant  execute on function public.registro_vivo_borrar(text, text) to anon, authenticated;

-- ===================== COMPROBACIONES =====================
-- Las variables llevan `v_` porque `nombre`, `rol`, `estado` y `jefe` son
-- columnas de `equipo` y PL/pgSQL contesta 42702 sin decir cuál. Costó un
-- intento esta misma tarde.
do $prueba$
declare
  v_clave text;
  v_jefe  text := '3009990021';
  v_peon  text := '3009990022';
  j       jsonb;
  fila    public.equipo;
  pasos   text := '';
begin
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then raise exception 'no hay clave_sync: esto no se comprueba a ciegas'; end if;
  if exists (select 1 from public.equipo where celular in (v_jefe, v_peon)) then
    raise exception 'los celulares de prueba % y % son de alguien de verdad', v_jefe, v_peon;
  end if;

  ---- 1. Se publica el equipo CON su plata.
  j := public.equipo_publicar(v_clave, jsonb_build_array(
        jsonb_build_object('celular', v_jefe, 'nombre', 'Prueba jefe', 'rol', 'gerente',
          'estado', 'activo', 'jefe', ''),
        jsonb_build_object('celular', v_peon, 'nombre', 'Prueba peon', 'rol', 'asesor',
          'estado', 'activo', 'jefe', v_jefe,
          'com_libre', '120000', 'com_bloqueado', '200000',
          'com_castigos', '10000', 'com_deuda', '0', 'com_ganado', '320000')),
       '[]'::jsonb, '[]'::jsonb);
  if (j->>'ok') <> 'true' then raise exception 'FALLO 1: no publico: %', j; end if;

  select * into fila from public.equipo where celular = v_peon;
  if fila.com_libre <> 120000 or fila.com_bloqueado <> 200000
     or fila.com_castigos <> 10000 or fila.com_ganado <> 320000 then
    raise exception 'FALLO 1b: la plata del asesor no llego entera: %', to_jsonb(fila);
  end if;
  pasos := pasos || '1 la-plata-del-asesor-viaja; ';

  ---- 2. Un publicar que NO la mande no la borra. Es el mismo defecto que ya
  ---- costo una vez con la cartera: sin el coalesce, un CRM viejo dejaba a todo
  ---- el equipo en cero y nadie se enteraba hasta que alguien fuera a cobrar.
  j := public.equipo_publicar(v_clave, jsonb_build_array(
        jsonb_build_object('celular', v_peon, 'nombre', 'Prueba peon', 'rol', 'asesor',
          'estado', 'activo', 'jefe', v_jefe)),
       '[]'::jsonb, '[]'::jsonb);
  select * into fila from public.equipo where celular = v_peon;
  if fila.com_libre is null or fila.com_ganado is null then
    raise exception 'FALLO 2 GRAVE: un publicar sin la plata la BORRO: %', to_jsonb(fila);
  end if;
  pasos := pasos || '2 no-mandarla-no-la-borra; ';

  ---- 3. El asesor la recibe, con su fecha.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_peon || '@tugarantia.net","role":"authenticated"}', true);
  j := public.mi_cartera();
  if (j->>'ok') <> 'true' then raise exception 'FALLO 3: mi_cartera no contesta: %', j; end if;
  if (j->'yo'->>'com_ganado') is null then
    raise exception 'FALLO 3b: el asesor no recibe lo que lleva ganado: %', j->'yo';
  end if;
  if (j->'yo'->>'com_bloqueado') is null then
    raise exception 'FALLO 3c: no recibe lo bloqueado, que es la mitad del diseno de Joan';
  end if;
  if (j->'yo'->>'com_al_dia_de') is null then
    raise exception 'FALLO 3d: sin la fecha, el asesor cuenta con una cifra vieja sin saberlo';
  end if;
  pasos := pasos || '3 el-asesor-ve-la-suya; ';

  ---- 4. Y NADIE VE LA DEL OTRO. Un asesor no recibe el equipo, asi que no
  ---- puede recibir la plata de un companiero ni por descuido.
  if jsonb_array_length(coalesce(j->'equipo', '[]'::jsonb)) <> 0 then
    raise exception 'FALLO 4 GRAVE: un asesor ve a otros: %', j->'equipo';
  end if;
  pasos := pasos || '4 no-ve-la-del-companiero; ';

  ---- 5. El gerente SI ve la de los suyos: es el seguimiento que pidio Joan.
  perform set_config('request.jwt.claims',
    '{"email":"57' || v_jefe || '@tugarantia.net","role":"authenticated"}', true);
  j := public.mi_cartera();
  if (j->'equipo'->0->>'com_ganado') is null then
    raise exception 'FALLO 5: el gerente no ve lo que lleva su asesor: %', j->'equipo';
  end if;
  pasos := pasos || '5 el-gerente-ve-la-de-los-suyos; ';

  ---- 6. Y EL BORRADO DEL REGISTRO EN VIVO, que esta tarde se dio por bueno
  ---- sin serlo. Se comprueba MIRANDO LA FILA, no preguntandole a la funcion
  ---- que la acaba de tocar.
  declare
    v_cel  text := '3009990023';
    v_test text;
  begin
    delete from public.registro_en_vivo where celular = v_cel;
    perform public.registro_vivo_publicar(v_cel, 1, 9, 'Prueba', '{}'::jsonb, '{}'::jsonb, null);
    select testigo into v_test from public.registro_en_vivo where celular = v_cel;
    if v_test is null then raise exception 'FALLO 6: no se creo la fila de prueba'; end if;

    perform public.registro_vivo_borrar(v_cel, 'el-que-no-es');
    if not exists (select 1 from public.registro_en_vivo where celular = v_cel) then
      raise exception 'FALLO 6 GRAVE: un tercero borro el registro de otro sin el testigo';
    end if;

    perform public.registro_vivo_borrar(v_cel, v_test);
    if exists (select 1 from public.registro_en_vivo where celular = v_cel) then
      raise exception 'FALLO 6b: con el testigo bueno NO se pudo borrar';
    end if;
    pasos := pasos || '6 solo-el-dueno-borra; ';
  end;

  delete from public.equipo where celular in (v_jefe, v_peon);
  raise notice 'la plata del asesor: %', pasos;
end
$prueba$;

-- ====== EL CENTINELA ======
do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'equipo_publicar' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  if cuerpo not like '%coalesce(excluded.com_ganado, equipo.com_ganado)%' then
    raise exception 'la plata del asesor se pisa con null en cada publicar';
  end if;
  -- Y que no se llevo por delante lo de las fases anteriores.
  if cuerpo not like '%coalesce(excluded.saldo, cartera.saldo)%' then
    raise exception 'se piso el coalesce de la cartera (20260922m)';
  end if;
  if cuerpo not like '%no_sms%' then
    raise exception 'se piso el SALIR (20260922m)';
  end if;
  if cuerpo not like '%case when it->>''tipo'' = ''cliente''%' then
    raise exception 'se piso el saneo de tipo (fase 0)';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cartera' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  select prosrc into cuerpo from pg_proc
   where proname = 'registro_vivo_borrar' and pronamespace = 'public'::regnamespace;
  if cuerpo not like '%testigo = coalesce(p_testigo%' then
    raise exception 'registro_vivo_borrar vuelve a borrar sin mirar de quien es la fila';
  end if;

  select prosrc into cuerpo from pg_proc
   where proname = 'mi_cartera' and pronamespace = 'public'::regnamespace;
  cuerpo := regexp_replace(regexp_replace(cuerpo, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  if cuerpo not like '%''com_al_dia_de'', yo.actualizado%' then
    raise exception 'mi_cartera dejo de decir CUANDO se calculo la comision';
  end if;
  if cuerpo not like '%''al_dia_de'', p.actualizado%' then
    raise exception 'se piso el al_dia_de de la cartera (20260922m)';
  end if;
  if cuerpo not like '%p.saldo_total%' then
    raise exception 'se piso la plata de los clientes (20260919)';
  end if;
end $$;
