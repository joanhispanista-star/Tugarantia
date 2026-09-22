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
| `20260922f_fotos_en_el_chat` | la tabla `chat_fotos` y las cuatro funciones de la foto |
| `20260922g_la_foto_comprobada_entera` | la fuente se comprueba entera, miniatura incluida |
| `20260922h_una_ficha_por_telefono` | un teléfono no puede reclamar dos fichas |
| `20260922i_el_tope_no_es_para_siempre` | el tope de 60 fotos pasa a ser por mes |
| `20260922j_el_cortacircuito` | 150 MB de fotos y se para, para que no se llene la base |

Todas se comprobaron **llamándolas**, no mirando que existieran, y por HTTP
contra la base real: ninguna contesta 404 y las que piden sesión contestan 401
con la llave pública.

La `f` se aplicó comprobando antes que `mensajes` estaba en **cero filas**: su
prueba interna borra la conversación del número ficticio `3009998844` para
verificar el cascade, y en una base con clientes eso se mira antes y no después.

De la `g` a la `j` salieron de una **revisión adversaria** de lo construido esa
tarde: tres lentes en paralelo (quién ve qué, quién puede llenar la base, qué
promete la pantalla) y cada hallazgo pasado por otro agente que intentaba
refutarlo. 15 confirmados de 15. El grave se cuenta abajo.

Las cuatro reescriben **la misma función** (`chat_foto_sesion`) leyéndola de la
base con `pg_get_functiondef`. Por eso el centinela de cada una comprueba que
sigue vivo lo de las anteriores: la cuarta que se despiste borra el trabajo de
las tres. Se verificó al final, en otra transacción, que las seis piezas siguen
puestas.

**Aplicadas hoy: diez.** Todas comprobadas **llamándolas** desde otra
transacción y por HTTP contra la base real.

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
6. **Una comprobación que solo se aplica en un sitio ya es dos reglas**, y una
   se queda atrás. `app/chat.js` tenía escrito el ataque de la foto, con su
   comentario, y lo comprobaba **solo en la miniatura**; la foto grande iba
   cruda en los dos visores. Ahora la frase vive en `CHAT.esFoto` y la usan los
   tres sitios — pantalla, función y `CHECK` — y una prueba compara la de la
   base contra la de la pantalla carácter a carácter.
7. **`window.open()` sin dirección abre un `about:blank` que HEREDA el origen.**
   Un guión que corra ahí está dentro de la página que lo abrió, con acceso a
   su `localStorage`. No es una pestaña aparte.
8. **Un reemplazo sobre `pg_get_functiondef` tiene que ser tolerante a los
   espacios.** El formato que devuelve Postgres no es el del archivo: en
   `vincular_cuenta` el `order by` y el `limit` van en líneas distintas, el
   `replace` no cambió nada y la migración se habría dado por buena. Lo cazó su
   propio centinela, y como todo va en una transacción, no quedó nada a medias.
9. **Los heredocs de Bash en este equipo se comen las barras.** `
` llegó
   como un salto real dentro de una cadena de JavaScript y `` como el byte 1
   dentro de un SQL. Para parchear, el archivo se escribe con la herramienta de
   escritura, o la barra se construye con `chr(92)`.

## Lo que encontró la revisión, y por qué importa

El grave: **la foto grande se pintaba sin comprobar la fuente**, en los dos
visores. Camino entero:

1. Cualquiera abre cuenta (el registro no comprueba el celular, la llave
   pública está en la página por diseño).
2. Manda como «foto» `data:image/png;base64,AAAA" onerror="…`. El `CHECK` solo
   exigía que **empezara** por `data:image/`: entraba sin despeinarse.
3. La manda **sin miniatura**, para que en la bandeja salga como un adjunto que
   no cargó, con el pie que él escriba: «no se ve, ábrela por favor».
4. Joan toca. El visor abría `window.open()` sin dirección y escribía el `<img>`
   a mano: el guión corría **dentro del CRM**.
5. Ahí vive la clave de sincronización. Con ella, `chat_foto_panel(clave, 1)`,
   `(clave, 2)`, `(clave, 3)`… — el id es correlativo — se baja el comprobante
   de pago de todos los clientes.

La reja que la migración probaba con dos sesiones no servía: no se saltaba, se
rodeaba robando la llave de la otra puerta.

Los otros dos que valían plata: **un teléfono podía vincular dos fichas** y el
desempate era un sorteo (`sincronizar_socios` pone el mismo `now()` en todo el
lote), así que un comprobante podía quedar archivado en la conversación de otro
y Joan decidir un abono mirando el papel equivocado. Y **no había ningún freno
global**: los topes eran todos por cliente, y al pasar los 500 MB la base entera
queda de solo lectura — sin factura y sin aviso, simplemente deja de poderse
desembolsar y cobrar.

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

**El chat entero está en cero filas**: `mensajes` no tiene ni una. Estuvo
contestando 404 semanas y se arregló hoy, así que nadie ha escrito todavía. La
foto se comprobó de las dos maneras que se pueden sin una sesión de verdad —la
prueba dentro de la migración manda una, la lee en el hilo, la abre, comprueba
que otro cliente NO la abre, rechaza un video y borra la conversación para ver
que la foto se va con ella; y por HTTP las tres de sesión dan 401 con la llave
pública— pero **mandar una foto desde un teléfono de verdad no lo ha hecho
nadie**. Eso es lo que prueba la persona del Android.

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
