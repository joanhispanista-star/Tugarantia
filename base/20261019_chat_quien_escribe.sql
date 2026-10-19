-- ===========================================================================
-- QUIÉN TE ESCRIBE — 19 de octubre de 2026
--
-- PARA JOAN: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede correr dos veces: la segunda ve que ya está y no cambia nada. No
-- deja ninguna fila: lo que escribe para comprobarse lo borra al final. Va
-- DESPUÉS de base/20260922d_chat_por_canal.sql (que dejó chat_conversaciones
-- como está hoy). Es independiente de 20261019b_chat_sin_leer_sesion.sql: se
-- pueden pegar en cualquier orden.
-- OJO: al final llama UNA vez a chat_conversaciones con tu clave de
-- sincronización de verdad, para que la base compile la función nueva (ver
-- «QUÉ SE COMPRUEBA»). Es un acierto, no un fallo: no te acerca al freno.
--
-- ---------------------------------------------------------------------------
-- EL HUECO
--
-- chat_conversaciones (la bandeja «💬 Mensajes» del CRM y del celular) cruza
-- cada hilo SOLO con socios_historial. Un registrado que todavía no tiene
-- ficha —William el 19-oct, que pidió 300.000 y escribió por el chat— sale
-- «Socio nuevo · 3001234567», sin nombre, aunque su nombre está en la tabla
-- `registros` desde que se registró. Joan no reconoce a quien le escribe y no
-- le contesta: el chat funciona y no se ve.
--
-- LO QUE CAMBIA: chat_conversaciones devuelve además `nombre_registro`, el
-- nombre del registro más reciente con ese celular, SOLO cuando:
--   · el hilo no tiene ficha (si la tiene, manda el nombre de la ficha);
--   · y la llave del hilo es un celular (3 + nueve dígitos).
-- La pantalla lo pinta «Nombre (registrado, sin verificar) · celular»
-- (app/chat.js, quienEs).
--
-- POR QUÉ «SIN VERIFICAR» (Ley 1581). Ese nombre lo escribió la propia
-- persona al registrarse, nadie lo comprobó, y registrar_abierto ni siquiera
-- ata el registro a la cuenta del celular: cualquiera puede registrar un
-- número ajeno con otro nombre. Se rotula para que no se lea como un dato.
--
-- LO QUE NO CAMBIA, A PROPÓSITO: los hilos '0' + celular (cuenta sin juntar
-- con el número de una ficha, base/20261007_una_puerta.sql) siguen SIN NINGÚN
-- nombre —ni el de la ficha ni el del registro—. Con un nombre al lado, Joan
-- lee «es él» y le habla de la deuda a quien tenga el número. Esa llave
-- empieza por 0 y tiene 11 dígitos: la condición de arriba no la alcanza.
--
-- LA FUNCIÓN NO SE COPIA. chat_conversaciones ya está en producción y la
-- reescribieron tres migraciones. Se lee la viva, se compara su HUELLA (md5
-- del cuerpo sin los \r) con la del cuerpo que dejó 20260922d, y solo si es
-- esa se le agrega UNA línea con pg_get_functiondef + replace. Si alguien la
-- cambió desde entonces, el archivo PARA aquí sin tocar nada y dice qué
-- mandarle a Claude (lección de la casa: copiar un cuerpo a mano ya perdió
-- cosas en silencio el 22-sep).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES. Se para acá, sin tocar nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.chat_conversaciones(text)') is null then
    raise exception 'No existe public.chat_conversaciones(text): corre primero base/20260922d_chat_por_canal.sql.';
  end if;
  if to_regclass('public.registros') is null then
    raise exception 'No existe public.registros: corre primero base/supabase.sql.';
  end if;
  if to_regprocedure('public.solo_digitos(text)') is null
     or to_regprocedure('public.clave_ok(text)') is null
     or to_regclass('public.config_privada') is null then
    raise exception 'Falta base/supabase.sql: no existe solo_digitos, clave_ok o config_privada.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. LA REESCRITURA, CON LA HUELLA
-- ---------------------------------------------------------------------------
do $$
declare
  cuerpo text;   -- prosrc: lo que se compara
  def    text;   -- pg_get_functiondef: lo que se reescribe y se ejecuta
  huella text;
  nueva  text;
begin
  select p.prosrc, pg_get_functiondef(p.oid) into cuerpo, def
    from pg_proc p
   where p.oid = to_regprocedure('public.chat_conversaciones(text)');

  -- Ya aplicada: la segunda corrida no cambia nada.
  if cuerpo ~ 'nombre_registro' then
    raise notice 'chat_conversaciones ya trae el nombre del registro: no se cambió nada.';
    return;
  end if;

  -- La huella del cuerpo que dejó base/20260922d_chat_por_canal.sql, sin los
  -- \r (si se pegó desde Windows, el cuerpo los conserva). Calculada el
  -- 19-oct-2026 sobre el archivo, y comprobada contra un PostgreSQL 17 que
  -- corrió todas las migraciones de base/ en orden.
  huella := md5(replace(cuerpo, chr(13), ''));
  if huella <> 'e7e221f2b3b6a506e6af44fa3d2141b9' then
    raise exception 'La definición viva de chat_conversaciones no es la de base/20260922d (huella %, esperaba e7e221f2b3b6a506e6af44fa3d2141b9). Alguien la cambió después: NO se tocó nada. Corre «select pg_get_functiondef(''public.chat_conversaciones(text)''::regprocedure);» y mándale el resultado a Claude.', huella;
  end if;

  -- Una sola línea nueva, debajo de 'celular'. \s* entre palabras: lo que
  -- devuelve pg_get_functiondef no tiene por qué traer los espacios del
  -- archivo (trampa de la casa, 22-sep).
  nueva := regexp_replace(def,
    $p$('celular',\s*coalesce\(s\.celular,\s*''\)\s*,)$p$,
    $r$\1
                 -- 19-oct-2026 (base/20261019_chat_quien_escribe): el nombre
                 -- que escribió al registrarse, solo sin ficha y con llave de
                 -- celular. NUNCA en un hilo '0' + celular. La pantalla lo
                 -- rotula «registrado, sin verificar» (Ley 1581).
                 'nombre_registro', case
                    when s.nombre is null and m.cedula ~ '^3[0-9]{9}$' then coalesce((
                      select left(btrim(r.nombre), 80)
                        from public.registros r
                       where right(public.solo_digitos(r.telefono), 10) = m.cedula
                       order by r.creado_en desc, r.id desc
                       limit 1), '')
                    else '' end,$r$,
    '');
  if nueva = def then
    raise exception 'No encontré en chat_conversaciones la línea de ''celular'' que esperaba, aunque la huella cuadra. NO se tocó nada: mándale a Claude pg_get_functiondef(''public.chat_conversaciones(text)''::regprocedure).';
  end if;
  execute nueva;
end
$$;

-- Los permisos, explícitos aunque `create or replace` los conserve: el Panel
-- habla por anon más la clave, igual que el resto de la bandeja, y una sesión
-- de cliente (authenticated) no tiene nada que hacer aquí.
revoke all on function public.chat_conversaciones(text) from public, anon, authenticated;
grant  execute on function public.chat_conversaciones(text) to anon;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------- QUÉ SE COMPRUEBA
-- LLAMANDO, no mirando que exista: PL/pgSQL compila el cuerpo en la PRIMERA
-- llamada (así vivió trece días rota registro_archivos_guardar). Y la prueba
-- limpia lo suyo con un delete y termina normal: el editor corre el archivo
-- en UNA transacción, y una excepción de «todo bien» revertiría también la
-- reescritura de arriba (20260922d lo aprendió en su primera corrida).
--
-- El celular de prueba empieza por 399: no hay ningún móvil colombiano así,
-- y los delete del final no pueden alcanzar a nadie de verdad.
do $prueba$
declare
  cel     text := '3990001019';
  v_clave text;   -- NO «clave»: config_privada TIENE una columna clave, y el
                  -- where sería ambiguo (42702), el descuido que ya costó
                  -- trece días en otra función.
  cuerpo  text;
  j       jsonb;
  e       jsonb;
  pasos   text := '';
begin
  select p.prosrc into cuerpo from pg_proc p
   where p.oid = to_regprocedure('public.chat_conversaciones(text)');
  if cuerpo !~ 'nombre_registro' then
    raise exception 'FALLO: chat_conversaciones no quedó con el nombre del registro.';
  end if;
  -- Lo de antes sigue: la clave, la ficha, los no leídos por canal.
  if cuerpo !~ 'clave_ok\(p_clave\)' or cuerpo !~ 'clave incorrecta'
     or cuerpo !~ 'socios_historial' or cuerpo !~ 'sin_leer_canal'
     or cuerpo !~ 'ultimo_canal' then
    raise exception 'FALLO: a chat_conversaciones se le perdió una pieza de antes (la clave, la ficha o los no leídos por canal).';
  end if;
  pasos := pasos || '1 piezas-de-antes; ';

  if not has_function_privilege('anon', 'public.chat_conversaciones(text)', 'execute') then
    raise exception 'FALLO: el CRM (anon con la clave) ya no puede abrir la bandeja.';
  end if;
  if has_function_privilege('authenticated', 'public.chat_conversaciones(text)', 'execute') then
    raise exception 'FALLO: una sesión de cliente puede pedir la bandeja de Joan.';
  end if;
  pasos := pasos || '2 permisos; ';

  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then
    raise exception 'No hay clave_sync en config_privada: esta migración no se comprueba a ciegas.';
  end if;

  -- Un registrado sin ficha que escribió, y un hilo '0' + el mismo celular.
  -- 'panel' y no 'socio' a propósito: así ninguna regla que avise de «te
  -- escribió un cliente» se dispara por una prueba.
  insert into public.registros (codigo, cedula, nombre, telefono, datos, origen)
       values ('', '', '  Prueba   Diecinueve  ', cel, '{}'::jsonb, 'abierto');
  insert into public.mensajes (cedula, de, texto, canal)
       values (cel, 'panel', 'prueba 19-oct', 'servicio'),
              ('0' || cel, 'panel', 'prueba 19-oct', 'servicio');

  j := public.chat_conversaciones(v_clave);

  select x into e from jsonb_array_elements(j) x where x->>'cedula' = cel;
  if e is null then
    raise exception 'FALLO 3: la bandeja no trae el hilo del registrado.';
  end if;
  if coalesce(e->>'nombre_registro', '') <> 'Prueba   Diecinueve' then
    raise exception 'FALLO 3b: el registrado sin ficha sigue sin nombre (trajo «%»).', e->>'nombre_registro';
  end if;
  if coalesce(e->>'nombre', '') <> '' then
    raise exception 'FALLO 3c: el nombre del registro se coló como nombre de ficha: se leería como verificado.';
  end if;
  pasos := pasos || '3 el-registrado-tiene-nombre; ';

  select x into e from jsonb_array_elements(j) x where x->>'cedula' = '0' || cel;
  if e is null then
    raise exception 'FALLO 4: la bandeja no trae el hilo ''0'' + celular.';
  end if;
  if coalesce(e->>'nombre_registro', '') <> '' or coalesce(e->>'nombre', '') <> '' then
    raise exception 'FALLO 4b GRAVE: un hilo ''0'' + celular trae un nombre: Joan leería «es él» y le hablaría de la deuda a quien tenga el número.';
  end if;
  pasos := pasos || '4 el-hilo-sin-juntar-sigue-sin-nombre; ';

  delete from public.mensajes  where cedula in (cel, '0' || cel);
  delete from public.registros where telefono = cel and origen = 'abierto' and nombre = '  Prueba   Diecinueve  ';

  raise notice 'Listo: la bandeja dice quién escribe. % (datos de prueba borrados)', pasos;
end
$prueba$;

-- ------------------------------------------------------ qué falta probar ---
--   1. Correrlo DOS VECES seguidas: la segunda dice «no se cambió nada».
--   2. Abrir el CRM → 💬 Mensajes → ↻ Traer de la nube: un registrado sin
--      ficha que te haya escrito sale «Su nombre (registrado, sin verificar) ·
--      su celular». Necesita la versión de app/chat.js de este mismo cambio;
--      con la vieja, la bandeja sigue diciendo «Socio nuevo · celular» y nada
--      se rompe.
