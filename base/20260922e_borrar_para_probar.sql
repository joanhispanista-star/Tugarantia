-- 22-sep-2026 — BORRAR UNA CUENTA PARA VOLVER A PROBAR CON EL MISMO NÚMERO
--
-- Joan: «como estoy haciendo pruebas con el mismo numero quiero poder eliminar
-- usuarios asi el mismo usuario se puede registrar varias veces sin que le
-- aparezca que este numero ya esta registrado».
--
-- POR QUÉ HACE FALTA. El celular es la identidad del negocio: el registro crea
-- un usuario en auth.users con el correo interno 57XXXXXXXXXX@tugarantia.net.
-- Al segundo intento, /auth/v1/signup contesta «User already registered» y el
-- registro se corta ahí. Sin esto, probar dos veces con la misma persona pide
-- un celular nuevo cada vez.
--
-- ESTA FUNCIÓN BORRA DE VERDAD Y NO SE PUEDE DESHACER. Se escribe con esa
-- suposición en todas partes:
--   · pide la clave de sincronización de Joan, como el resto de la bandeja;
--   · DEVUELVE la cuenta exacta de lo que borró, para que el CRM pueda decirlo
--     en vez de un «listo» que no se puede comprobar;
--   · y el CRM pregunta antes nombrando a la persona y las cifras, que es el
--     patrón que ya usa «Borrar la conversación».
--
-- LO QUE NO BORRA, Y ES LA DECISIÓN QUE IMPORTA: socios_historial. Ahí vive la
-- cartera de Joan, que la manda ESTE CRM y que sincronizar_socios sobreescribe
-- entera en cada subida. Borrar esa fila sería borrarle un cliente de verdad
-- por querer repetir una prueba. Lo que sí se hace es DESVINCULARLA —soltar
-- auth_vinculada_en y auth_celular— para que el mismo celular pueda volver a
-- registrarse y volver a pegar su código desde cero, que es justo lo que Joan
-- quiere poder repetir.
--
-- Y NO BORRA los créditos ni los pagos: esos tampoco viven aquí, viven en el
-- CRM de Joan.

create or replace function public.borrar_cuenta_de_pruebas(p_clave text, p_celular text)
returns jsonb
language plpgsql
security definer
-- auth en el search_path porque hay que llegar a auth.users. Va explícito y no
-- heredado: una función security definer sin search_path fijo es escalable.
set search_path = public, auth, extensions
as $$
declare
  cel      text;
  correo   text;
  ced      text;
  n_auth   integer := 0;
  n_reg    integer := 0;
  n_fotos  integer := 0;
  n_sol    integer := 0;
  n_msj    integer := 0;
  n_ayu    integer := 0;
  n_desv   integer := 0;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronizacion incorrecta';
  end if;

  cel := right(public.solo_digitos(coalesce(p_celular, '')), 10);
  if length(cel) <> 10 or left(cel, 1) <> '3' then
    return jsonb_build_object('ok', false, 'motivo', 'celular');
  end if;
  correo := '57' || cel || '@tugarantia.net';

  -- La cédula con la que quedaron sus solicitudes y sus mensajes. El chat y las
  -- solicitudes cuelgan de la CÉDULA cuando la ficha la tiene, y del celular
  -- cuando no (ver llave_de_sesion). Hay que mirar las dos o queda basura
  -- colgando de una llave que ya no existe.
  select r.cedula into ced
    from public.registros r
   where right(public.solo_digitos(r.telefono), 10) = cel
     and coalesce(r.cedula, '') <> ''
   order by r.creado_en desc, r.id desc
   limit 1;

  -- 1. Las fotos. Primero, porque son el dato que más pesa y el que Joan quiere
  --    ver desaparecer para saber que la prueba arranca limpia.
  delete from public.registro_archivos where celular = cel;
  get diagnostics n_fotos = row_count;

  -- 2. La ficha de la bandeja.
  delete from public.registros
   where right(public.solo_digitos(telefono), 10) = cel;
  get diagnostics n_reg = row_count;

  -- 3. Sus solicitudes de crédito.
  delete from public.solicitudes
   where cedula = cel or (ced is not null and cedula = ced);
  get diagnostics n_sol = row_count;

  -- 4. Su chat, por las dos llaves posibles.
  delete from public.mensajes
   where cedula = cel or (ced is not null and cedula = ced);
  get diagnostics n_msj = row_count;

  -- 5. Los recados de «Olvidé mi contraseña».
  delete from public.ayudas_clave where celular = cel;
  get diagnostics n_ayu = row_count;

  -- 6. LA CARTERA NO SE BORRA: se desvincula. Ver la cabecera.
  update public.socios_historial
     set auth_vinculada_en = null, auth_celular = null
   where auth_celular = cel;
  get diagnostics n_desv = row_count;

  -- 7. Y la cuenta de verdad, que es lo que impedía volver a registrarse.
  --    Va en su propio bloque: si Supabase cambia el esquema de auth y esto
  --    fallara, lo de arriba ya está hecho y se dice que la cuenta quedó.
  begin
    delete from auth.users where email = correo;
    get diagnostics n_auth = row_count;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'no pude borrar la cuenta de acceso: ' || left(coalesce(sqlerrm, ''), 120),
      'aviso', 'lo demas SI se borro; con la cuenta viva el registro seguira diciendo que el numero ya existe',
      'fotos', n_fotos, 'registros', n_reg, 'solicitudes', n_sol,
      'mensajes', n_msj, 'ayudas', n_ayu, 'desvinculados', n_desv);
  end;

  return jsonb_build_object(
    'ok', true,
    'celular', cel,
    'cedula', coalesce(ced, ''),
    'cuenta', n_auth,          -- 1 si habia cuenta de acceso y se fue
    'fotos', n_fotos,
    'registros', n_reg,
    'solicitudes', n_sol,
    'mensajes', n_msj,
    'ayudas', n_ayu,
    'desvinculados', n_desv);
end
$$;

-- El Panel habla por anon + la clave, como el resto de la bandeja.
revoke all on function public.borrar_cuenta_de_pruebas(text, text) from public, anon, authenticated;
grant  execute on function public.borrar_cuenta_de_pruebas(text, text) to anon;

notify pgrst, 'reload schema';

-- ===================== COMPROBACIONES =====================
-- Llamando, no mirando que exista. Y SIN deshacerse a sí misma con una
-- excepción: el editor corre el archivo en una transacción y eso revertiría los
-- create de arriba — el error que costó un intento esta misma tarde.
do $prueba$
declare
  v_clave text;
  cel     text := '3009998866';
  ced     text := '99999999903';
  j       jsonb;
  pasos   text := '';
begin
  select cp.valor into v_clave from public.config_privada cp where cp.clave = 'clave_sync';
  if v_clave is null then
    raise exception 'no hay clave_sync en config_privada: esto no se comprueba a ciegas';
  end if;

  ---- Un registrado de mentira, con sus cosas colgando.
  insert into public.registros (codigo, cedula, nombre, telefono, datos, origen)
       values ('', ced, 'Prueba Borrable', cel, '{}'::jsonb, 'abierto');
  insert into public.registro_archivos (celular, tipo, imagen)
       values (cel, 'selfie', 'data:image/jpeg;base64,AAAA');
  insert into public.mensajes (cedula, de, texto, canal)
       values (ced, 'socio', 'hola', 'servicio');
  insert into public.ayudas_clave (celular, nota) values (cel, 'prueba');

  ---- Sin la clave, nada.
  begin
    perform public.borrar_cuenta_de_pruebas('clave-que-no-es', cel);
    raise exception 'FALLO 1 GRAVE: borro SIN la clave de Joan';
  exception when others then
    if sqlerrm like 'FALLO 1%' then raise; end if;
  end;
  pasos := pasos || '1 pide-clave; ';

  ---- Un celular que no es celular tampoco.
  j := public.borrar_cuenta_de_pruebas(v_clave, '12');
  if (j->>'motivo') <> 'celular' then
    raise exception 'FALLO 2: acepto un celular invalido: %', j;
  end if;
  pasos := pasos || '2 celular-malo-rebota; ';

  ---- Y ahora sí: se lleva las cuatro cosas.
  j := public.borrar_cuenta_de_pruebas(v_clave, cel);
  if (j->>'ok') <> 'true' then raise exception 'FALLO 3: %', j; end if;
  if (j->>'registros') <> '1' or (j->>'fotos') <> '1'
     or (j->>'mensajes') <> '1' or (j->>'ayudas') <> '1' then
    raise exception 'FALLO 3b: no borro todo o no lo conto bien: %', j;
  end if;
  pasos := pasos || '3 borra-y-lo-cuenta; ';

  ---- Comprobado en las tablas, no en lo que dice la funcion.
  if exists (select 1 from public.registros where telefono = cel)
     or exists (select 1 from public.registro_archivos where celular = cel)
     or exists (select 1 from public.mensajes where cedula = ced)
     or exists (select 1 from public.ayudas_clave where celular = cel) then
    raise exception 'FALLO 4 GRAVE: dijo que borro y quedo algo';
  end if;
  pasos := pasos || '4 no-quedo-nada; ';

  ---- Borrar a alguien que no existe no revienta ni miente.
  j := public.borrar_cuenta_de_pruebas(v_clave, '3009998855');
  if (j->>'ok') <> 'true' or (j->>'registros') <> '0' then
    raise exception 'FALLO 5: borrar a un desconocido no se comporta: %', j;
  end if;
  pasos := pasos || '5 desconocido-no-revienta; ';

  raise notice 'borrar para probar: %', pasos;
end
$prueba$;

do $$
declare cuerpo text;
begin
  select prosrc into cuerpo from pg_proc
   where proname = 'borrar_cuenta_de_pruebas' and pronamespace = 'public'::regnamespace;

  -- LA CARTERA NO SE BORRA. Si alguien «mejora» esto metiendo un delete sobre
  -- socios_historial, Joan perderia clientes de verdad por repetir una prueba.
  if cuerpo like '%delete from public.socios_historial%' then
    raise exception 'borrar_cuenta_de_pruebas borra socios_historial: eso es la cartera de Joan, no una cuenta de prueba';
  end if;
  if cuerpo not like '%auth_vinculada_en = null%' then
    raise exception 'no desvincula la ficha: el mismo celular no podria volver a pegar su codigo';
  end if;
  if cuerpo not like '%delete from auth.users%' then
    raise exception 'no borra la cuenta de acceso, que es lo unico que impide volver a registrarse';
  end if;

  if not has_function_privilege('anon', 'public.borrar_cuenta_de_pruebas(text, text)', 'execute') then
    raise exception 'el CRM no puede llamarla';
  end if;
  if has_function_privilege('authenticated', 'public.borrar_cuenta_de_pruebas(text, text)', 'execute') then
    raise exception 'quedo llamable con una sesion de cliente: un cliente podria borrar cuentas';
  end if;

  -- Volatil obligatorio: pasa por clave_ok, que ESCRIBE el freno. PostgREST
  -- corre las stable en solo lectura y revientan con 25006 antes de mirar la
  -- clave, que es lo que dejo las fotos invisibles del 8 al 10 de septiembre.
  if (select provolatile from pg_proc
       where proname = 'borrar_cuenta_de_pruebas' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'no quedo volatil: clave_ok escribe y PostgREST la correria en solo lectura';
  end if;
end $$;
