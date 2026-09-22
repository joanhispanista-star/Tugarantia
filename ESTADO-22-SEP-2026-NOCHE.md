# Estado — 22 de septiembre de 2026, cierre del día

Para arrancar la siguiente sesión desde cero sin releer nada.

## Lo que está aplicado en la base, y comprobado llamándolo

| Migración | Qué trajo |
|---|---|
| `20260914b_tres_canales` | el chat de la app: `chat_escribir_sesion`, `chat_leer_sesion`, `mi_cuenta`, `vincular_cuenta` |
| `20260922_a_la_medida_y_ayuda` | `solicitudes.pedido_monto/plazo/nota`, `play_solicitar` de 50.000 a 50.000.000, tabla `ayudas_clave` |
| `20260922b_desempate` | `mi_solicitud` y `solicitar_primer_credito` ordenaban sin desempate |
| `20260922c_verificacion_cedula` | el cotejo de la cédula y `cedula_repetida` |
| `20260922d_chat_por_canal` | `chat_responder` contesta en el canal del cliente |
| `20260922e_borrar_para_probar` | borrar una cuenta para repetir la prueba |

Todas se comprobaron **llamándolas**, no mirando que existieran, y por HTTP
contra la base real: ninguna contesta 404 y las que piden sesión contestan 401
con la llave pública.

**Pendientes de aplicar:** `20260911_gerente_y_whatsapp`,
`20260916_contrapropuesta_a_cuotas`, `20260917_ruleta` (ya no hace falta, la
rueda se quitó) y `20260919_asesor` (**no aplicar**: tiene tres defectos
documentados).

## Las reglas que salieron de este día y no se pueden perder

1. **Una prueba dentro de una migración NO puede deshacerse a sí misma.** El
   editor de Supabase corre el archivo en UNA transacción, así que un
   `raise exception 'TODO BIEN'` revierte también los `create`. La migración
   dice que todo salió bien y no aplica nada. Hay centinela.
2. **Las migraciones no se transcriben.** El repo es público: el navegador las
   trae de `raw.githubusercontent.com` **con la URL fijada al commit** (la de
   `main` se cachea) y se compara una huella contra el archivo en disco antes
   de tocar el editor.
3. **Un centinela mira el código, no la prosa.** Tres se cazaron a sí mismos hoy
   porque el comentario que explica el arreglo cita la línea mala.
4. **El reloj del CRM va a 45 segundos y no a 20**: `clave_ok` usa una secuencia
   GLOBAL de intentos que cada acierto devuelve a cero.
5. **Cuando algo «se ve raro» y el código parece correcto, preguntarle al
   navegador** qué reglas aplica de verdad. En el archivo estaba.

## Lo que decide Joan, y nadie más

- **La casilla de GitHub para el robot de la usura.** Settings, Actions,
  General, Workflow permissions, «Allow GitHub Actions to create and approve
  pull requests». El robot se estrena el 24-sep y **nunca ha corrido**. La tabla
  se vence el 30 y el 1 de octubre el CRM deja de mandar propuestas a cuotas.
- **El repo es público** (GitHub Pages gratis lo exige). No se filtró ninguna
  clave. Las opciones están en el hilo: mudar a Vercel, GitHub Pro, o dejarlo.
- **Cuál es LA app.** El APK que se reparte abre `app/socio.html`; todo lo de
  estos días vive en `play/index.html`. Si sus clientes usan el APK, nada de
  esto les llegó.
- **El plazo libre de verdad**: hasta cuántos meses presta y a qué precio.
- **El cupo de bienvenida**: la ruleta se quitó porque prometía $100.000 y el
  perfil nuevo tiene cupo cero a propósito.

## Lo único que nunca se ha probado

`registro_archivos` sigue en **cero filas**. El arreglo está puesto y la cadena
entera verificada, pero **nadie se ha registrado desde entonces**. El próximo
registro real es la prueba:

```
select tipo, count(*) from public.registro_archivos group by tipo;
```

## Dónde seguir

La fase 2 del crédito por el chat: la **tarjeta de propuesta dentro del hilo**,
con la regla que el diseño impuso y que no se negocia — **el chat nunca guarda
cifras**: lleva el número de solicitud y los pesos se leen de la fila al
pintarla. Así no puede pasar que el mensaje diga una cosa y la fila otra, que es
la peor falla posible aquí porque el del pantallazo sería el cliente.
