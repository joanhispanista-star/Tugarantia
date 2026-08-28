-- ===========================================================================
-- LOS AYUDANTES INTERNOS DEJAN DE SER LLAMABLES DESDE INTERNET
-- 28 de agosto de 2026 (noche). Va DESPUÉS de 20260828b_chat.sql.
--
-- SQL Editor de Supabase → New query → pegar TODO → Run. Idempotente.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE ENCONTRÓ, porque el método importa más que el arreglo
--
-- Al aplicar 20260828b_chat.sql se corrieron sus propias comprobaciones. Seis
-- pasaron y UNA falló: `chat_puede_escribir` seguía siendo llamable por `anon`
-- **después** de que la migración hiciera `revoke all ... from public`.
--
-- El motivo, y es la lección: **Supabase concede EXECUTE a `anon` y a
-- `authenticated` en CADA función nueva del esquema `public`**, por privilegios
-- por defecto. Ese permiso es EXPLÍCITO, no heredado del rol PUBLIC. Así que
-- `revoke ... from public` no lo quita — no quita nada, de hecho. Es un revoke
-- que se lee como si cerrara una puerta y no la toca.
--
-- El `revoke` del 11-ago (20260811_panel_nube.sql:685-691) llevaba **diecisiete
-- días** dando por cerrado algo que seguía abierto. Y no se notó porque nada
-- falla: el permiso de más no rompe ninguna pantalla.
--
-- Al mirar la lista completa aparecieron **28 funciones llamables por `anon`**.
-- La mayoría está bien —el Panel habla con la nube con la llave pública y se
-- autentica con la clave por argumento—, pero entre ellas estaban TODOS los
-- ayudantes internos. Estos cuatro son los graves:
--
--   · `limpiar_fallos(cedula)` — BORRA el contador de intentos fallidos.
--     Cualquiera con la llave pública podía llamarla entre intento e intento y
--     el freno de 8 por cuarto de hora dejaba de existir. Sin freno, un código
--     de acceso de 5 caracteres se prueba entero por fuerza bruta.
--
--   · `clave_ok(texto)` — dice si ese texto ES la clave de sincronización.
--     Es un oráculo para adivinarla a martillazos. Y con `limpiar_fallos`
--     abierta al lado, sin ningún tope. Esa clave autoriza `sincronizar_socios`
--     (pisar el código de acceso de TODOS los clientes), `chat_conversaciones`,
--     `chat_olvidar` y las bandejas: es la llave del negocio entero.
--
--   · `anotar_fallo(cedula)` — anota un intento fallido. Llamándola ocho veces
--     se deja a un cliente concreto FUERA de su app durante quince minutos, y
--     repitiendo, indefinidamente. No roba nada; le apaga la app a quien
--     quieras, y él ve «revisa tus datos» con los datos correctos.
--
--   · `puede_intentar(cedula)` / `puede_intentar_tope(...)` — oráculo de si esa
--     identidad está frenada ahora mismo.
--
-- Ninguna de estas ocho la llama ninguna pantalla: se comprobó por barrido
-- sobre `app/`, `panel/` y `play/` antes de tocar nada — cero llamadas. Las
-- usan por dentro las funciones `security definer`, que corren como su dueño y
-- por eso siguen pudiendo llamarlas después de esto.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ UN BUCLE Y NO OCHO LÍNEAS
--
-- `revoke` exige la firma exacta, y estas funciones tienen firmas que han
-- cambiado con las migraciones. Un `revoke` con la firma equivocada no avisa
-- de nada útil: falla el script entero o —peor— revoca una función que no era.
-- Con `oid::regprocedure` se revoca la que EXISTE, sea cual sea su firma, y
-- correr esto dos veces da lo mismo que correrlo una.
-- ===========================================================================

do $$
declare f record; n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in (
             -- el freno de intentos
             'puede_intentar', 'puede_intentar_tope', 'anotar_fallo', 'limpiar_fallos',
             -- la clave y la huella del código: oráculos si se dejan sueltas
             'clave_ok', 'huella_codigo',
             -- el tope de mensajes del chat
             'chat_puede_escribir',
             -- ayudantes puros; no filtran nada, pero tampoco pintan nada acá
             'solo_digitos', 'codigo_invitacion_normalizado', 'codigo_invitacion_nuevo'
           )
  loop
    execute format('revoke all on function %s from anon, authenticated, public', f.firma);
    n := n + 1;
  end loop;
  raise notice 'Ayudantes internos cerrados: %', n;
end
$$;

-- Que PostgREST se entere de que esas funciones ya no son suyas.
notify pgrst, 'reload schema';


-- ===========================================================================
-- COMPROBAR (pegar aparte y correr; tiene que salir todo en `true` y las
-- funciones de las pantallas seguir abiertas)
--
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'execute') as la_puede_llamar_cualquiera
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('clave_ok','limpiar_fallos','anotar_fallo','puede_intentar',
--                        'chat_puede_escribir','historial_socio_por_codigo','chat_escribir')
--    order by 1;
--
--   -- las cinco primeras: false.  las dos últimas: true (las llaman las pantallas).
-- ===========================================================================
