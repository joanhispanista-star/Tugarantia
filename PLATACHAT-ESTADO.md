# Parte del 26 de septiembre de 2026 — PlataChat, fases 1a y 1b

> Al día el 26 de septiembre (abierto el 14, fase 1b el 15). El plan es `PLAN-PLATACHAT.md`;
> los toques a archivos ajenos están en `RECETA-PLATACHAT.md` (se queda en tu
> computador: la ignora `.gitignore`). Este parte sí sube al repositorio, así
> que no trae nada que no pueda ser público. Lo primero que tienes que hacer
> está en «Lo que te toca a ti».

## 26-sep — lo que cambió antes de publicar

Joan preguntó «¿qué falta?», contestó la decisión que tenía frenado el 80/20
(«la prórroga es el mismo valor de los intereses, o lo podemos dejar fijo al
20% pero tener la opción de modificar en caso de un descuento») y dijo
«publicar». Antes de publicar salieron cuatro cosas, las cuatro ya hechas:

1. **PlataChat pasa al 80/20.** El 23-sep Joan cambió el reparto de Tu Garantía
   a 80 % garantía / 20 % empresa, pague cuando pague, y la mora fuera de la
   garantía. PlataChat usa el mismo motor pero tenía sus propias constantes
   (75 % y 37,5 % tarde), y la prueba que las compara con el motor se puso
   roja sola, que es para lo que estaba. Ahora son 0,80 y 0,80. El cliente
   sube más rápido: vuelve a pedir 100.000 en **6 créditos** en vez de 7, y
   con TumiPay en 10 en vez de 11. Todas las cifras de las pruebas (el anexo
   A del plan, la escalera, las frases) se recalcularon con una cuenta
   escrita aparte, sin llamar al módulo, y se cotejaron: cero diferencias.
2. **Las fotos van por el camino de la app del cliente.** El 22-sep la otra
   sesión estrenó fotos en el chat de `play/` (`chat_foto_sesion`, ya
   aplicada en la base): cuelgan del mensaje y se borran con él, llevan
   miniatura, tope por mes y cortacircuito, y el CRM ya las enseña. PlataChat
   tenía su propia tabla de comprobantes, que nunca llegó a la base. Dos
   caminos para una foto serían dos bandejas donde buscar un comprobante, así
   que se quitó la mía y PlataChat llama a la suya. **Ojo:** las dos marcas
   comparten ahora el techo de 150 MB de fotos de los 500 del plan gratis.
3. **Un candado contra copiar cuerpos de funciones vivas.** La migración de
   la fase 1b reescribe tres funciones que ya están en la base copiando su
   cuerpo. La otra sesión trajo hoy las tres definiciones VIVAS (solo
   lectura), y una ya no era la del repositorio: el 22-sep `20260922b` le puso
   a `mi_solicitud` un desempate por `id`, y la copia de PlataChat lo habría
   borrado al pegarse. Se puso el desempate, se puso también en las dos
   funciones nuevas que tenían el mismo defecto, y la migración ahora empieza
   comparando la huella de las tres vivas contra la de hoy: si alguien las
   cambia antes de que la pegues, se para sin crear nada y dice cuál. Lo mismo
   con la regla de autores del chat, que antes se borraba y se rehacía a
   ciegas: ahora solo se le añade `equipo` si lo vivo es exactamente lo
   esperado.
4. **El descuento de la prórroga ya existía.** Lo que Joan pidió —la prórroga
   al mismo precio del crédito, y poder cobrar menos si hay descuento— está
   en el CRM desde el 8-sep. En el cobro de un crédito, «Prórroga»: el precio
   lo pone el motor, tú escribes cuánto pagó, y si es menos te pide el motivo
   y lo registra como descuento; la garantía sale de la plata que entró. No se
   construyó nada.

Comprobado hoy contra la base de producción, solo lectura: `20260914b` está
aplicada (el chat de tres canales, desde el 22-sep) y **ninguna función de
PlataChat existe todavía**. `tugarantia.net/platachat/` sigue en 404 hasta el
push.

---

## 15-sep, tarde — la fase 1b: la negociación en el chat

Estaba planeada para el **5 al 9 de octubre**. Se adelantó tres semanas porque
Joan dijo «sigue con la fase 1b» sin esperar a las decisiones 5 y 6 (se
aplicaron las opciones (a), como en la 1a). Está **construida y probada; no está
aplicada en ninguna parte.**

### Qué se construyó

1. **La solicitud con reloj** — `base/20261005_platachat_solicitud.sql` (la
   tercera migración de PlataChat; aborta a propósito si faltan `20260914b` o
   `20260921`). El cliente pide desde el chat y la solicitud nace **`nueva`**
   con `responder_antes_de = ahora + la espera de la política` (60 minutos por
   defecto) y con un **responsable**, que sale de la cadena `cartera →
   asignaciones → equipo` (`responsable_de`): si el asignado es un asesor
   responde su jefe, y si no hay nadie en la cadena, Joan. Joan recibe **todos**
   los avisos, siempre. `solicitar_platachat`, `reproponer_platachat` («prefiero
   otra cifra») y `aceptar_propuesta_platachat` escriben además el mensaje en el
   hilo de Créditos, para que todo quede en un solo sitio y no solo en una
   tarjeta.
2. **La tarjeta de propuesta en el chat** — `platachat/index.html`. Cuatro
   caras: «tu solicitud llegó, te contestamos antes de las H:MM», la propuesta
   con Aceptar / Proponer otra cifra, «aceptaste $X: espera la entrega», y la
   que dice que **te contesta una persona** cuando el automático no va a
   proponer. La hora se promete **solo** cuando la base contestó al reloj; con
   una base sin la migración (404) la app vuelve a hablar como hoy, sin
   prometer hora. La pestaña Plata enseña el mismo estado en una línea.
3. **La contrapropuesta del gerente** — `contrapropuesta_gerente`: el gerente
   cotiza desde su propio celular, con sesión y con las mismas rejas que Joan
   (1 %–50 %, 1–60 días), y lo que manda cae en el hilo del cliente. Y
   `resolver_vencidas()`: al vencer la hora sin que nadie alcance, la base
   propone sola con la política de PlataChat y lo marca como automática. Corre
   **al leer** (la llama la app del cliente, la bandeja de Joan y la del
   gerente), así que no hace falta `pg_cron`. Y `politica_app_leer` /
   `politica_app_guardar` para poder cambiar esa política sin entrar a la base.
4. **El aviso por Telegram** — `avisar_platachat` + las tablas `avisos` y
   `avisos_destinos`, con `avisos_destino_guardar`, `aviso_probar` y
   `avisos_recientes`. El aviso lleva el nombre y los **últimos cuatro** dígitos
   del celular: **nunca la cédula ni el número completo** (Ley 1581), y hay
   pruebas que vigilan que nadie le concatene un dato de más. Un aviso que
   falla **no tumba la solicitud**, y se escribe una fila por destino diga lo
   que diga, para que un envío roto deje rastro en vez de desaparecer.

En total, **31 funciones** en `base/20261005_platachat_solicitud.sql`.

### Cómo se revisó

Después de construir, cuatro lentes adversarias volvieron a leerlo todo (la
página, la migración, las pruebas y lo que tocaba archivos ajenos) buscando lo
que la pantalla promete y el código no cumple. **36 hallazgos: 34 confirmados y
corregidos, 2 descartados con argumento escrito.** Los más feos eran de los que
no se notan: la tarjeta prometía «a esa hora te contesta el automático» a
clientes a los que la misma base, dos líneas más arriba, les había dicho que les
contestaba una persona; «la hora se cumplió» se decidía con el reloj del
teléfono y no con el de la base; y varias pruebas estaban escritas de forma que
una función que escribe podía marcarse como de solo lectura sin que nada se
cayera.

**Y las pruebas nuevas se verificaron por mutación:** se metieron **36 defectos
a propósito** en el código ya corregido y las pruebas vieron **los 36**. Vale la
pena decirlo porque esta fase nació con tres centinelas muertos —pruebas que
leían una frase en vez de comprobar el predicado, y que seguían en verde con la
comprobación vaciada—. Una prueba que nadie ha visto fallar no es una prueba.

### Lo que cambió al final, después de la primera ronda

1. **`politica_platachat()`** (con sesión, solo lectura): la calculadora del
   teléfono cotiza el primer crédito con **la misma política que el automático
   va a firmar**, no con las constantes del motor. Antes coincidían por
   casualidad; el día que movieras el precio en Ajustes, la pantalla habría
   mostrado una cifra y la base habría firmado otra.
2. **La solicitud estampa al nacer `pedido.automatica`** (`nuevo` · `estandar` ·
   `sin_cupo` · `sin_politica`) **y `pedido.espera_minutos`**. La tarjeta del
   chat ya no adivina: si el automático no va a proponer nada, lo dice, y no
   promete lo que no va a pasar. Y la página **dejó de clavar «una hora»**: dice
   la espera real, que la política deja mover entre 1 minuto y 24 horas.
3. **Columna `solicitudes.repropuestas`**: el freno de repreguntar cuenta lo que
   de verdad pasa y se ve en la misma tabla. Se descartó a propósito contar
   filas de `avisos`, porque eso ataría el freno al sistema de avisos y el día
   que el aviso se apague el freno desaparecería en silencio.
4. **Ni el gerente ni el cliente reciben lo que no es suyo** (Ley 1581):
   `contrapropuesta_gerente` ya no devuelve la cédula, el `registro_id` ni el
   paquete de datos del registro; `mi_solicitud()` ya no devuelve el celular
   del gerente.

### Qué NO está hecho — léelo antes de contar con ello

- **Nada está pegado en la base ni commiteado.** A las 18:05 del 15-sep,
  `git status --short` muestra `M PLAN-PLATACHAT.md` y todo lo demás de
  PlataChat como `??`. Sin commit, sin push, y la migración `20261005` no está
  en producción.
- **Sin el token de Telegram, el reloj corre pero nadie se entera de que la
  ventana está abierta.** La bandeja del CRM solo le pregunta a la nube cuando
  tú la abres; sin aviso que te empuje, casi toda solicitud se va a ir al
  automático sin que un humano la mire. Es exactamente lo que el plan advirtió
  (sección 3.4, punto 3) y por eso el aviso se construyó en esta fase y no
  «después». Son cuatro clics tuyos: **paso 17 de la receta**.
- **El CRM sigue siendo el de hoy.** `panel/crm.html` no se tocó (es archivo de
  la otra sesión) y arrastra dos defectos que la fase 1b destapó, los dos ya
  escritos con antes y después en la receta, **sin aplicar**:
  - **la bandeja recalcula la propuesta con un solo corte**, así que en una
    propuesta a dos o tres cortes ves un total distinto del que el cliente
    aceptó en su chat (receta, paso 12);
  - **una solicitud de PlataChat en `nueva` sale con el botón «Crear crédito»**
    y con el precio del Panel en vez del que el cliente vio: en PlataChat el
    orden es proponer → aceptar → desembolsar, y ese botón se salta la
    aceptación (receta, paso 13).

  Hasta aplicarlos: en la bandeja, sobre una fila de PlataChat, usa **«✏️
  Cambiar propuesta»** y mira `contrapropuesta.total` antes de desembolsar.
- **En un teléfono de verdad no la ha abierto nadie.** Sigue siendo así desde
  el 14: lo verificado es el arnés de Node y la lectura cruzada.

---

## 15-sep, madrugada — tres cambios sobre lo cerrado el 14

Pasada corta encima del parte de abajo, sin tocar un solo archivo ajeno
(al empezar, `app/chat.js` estaba `M` por la otra sesión; al cerrar ya no: no
se tocó desde acá).

1. **La calculadora, pedido literal de Joan (14-sep, tarde):** *«la
   calculadora sea desde los 50 mil hasta los 2 millones para que se vea más
   interesante y que puedas seleccionar los días y seleccionar las fechas de
   pago»*. La barra del quincenal va ahora SIEMPRE de 50.000 a 2.000.000
   (`TOPE_CALCULADORA_PLATACHAT` en `platachat/index.html`; el motor conserva
   su techo de cinco millones, `MONTO_MAXIMO_CALCULADORA`, sin tocar), con los
   atajos 50k · 100k · 300k · 500k · 1M · 2M más «tu cupo» cuando cabe, también
   para el que no tiene garantía. La honestidad no cambia: por encima del cupo
   se sigue diciendo en pesos cuánta garantía falta y que puede pedirlo igual
   por el chat; el nuevo por encima de 100.000 ve el tope y cuántos créditos
   pagados en fecha le faltan para esa cifra (`creditosHasta`: 19 para
   300.000, 33 para dos millones), nunca una cotización. Dentro del cupo el
   cliente elige **para cuándo paga**, anclado a los cortes del motor (el 15 y
   el último de cada mes): fichas «este corte · 30 sep», «el siguiente · 15
   oct», «en dos cortes · 31 oct» —como máximo 1 + `prorrogasPermitidas`, hoy
   tres— y un calendario (`<input type="date">`, de mañana al último corte
   permitido) que salta al corte que cubre el día marcado. Cada corte de más
   es una prórroga al mismo precio del crédito: costo × cortes, total = capital
   + costo × cortes, garantía × cortes; la pantalla dice los días y los pesos
   («Hasta el 15 oct 2026, en 30 días: $40.000 de costo, son dos quincenas de
   $20.000. Se paga por cortes: $20.000 el 30 sep 2026 y $120.000 el 15 oct
   2026»). El primer crédito del nuevo sigue a 8 días por la política y la
   pantalla lo dice («Tu primer crédito es a 8 días; desde el segundo eliges
   la fecha»). La cuenta de cortes es `PlataChatReglas.cortesHasta(desembolsoISO,
   pagoISO, motor, {maxCortes})` y `cortesDesde(desembolsoISO, cantidad, motor)`,
   puras, con el motor por parámetro (`calcularFechaCorte` para el primer
   corte, `fechaCorteProrroga` para los siguientes, `diasEntre` para los días),
   probadas con el motor real: desde el 15-sep pagando el 30-sep → 1 corte, el
   15-oct → 2, el 31-oct → 3, una fecha entre cortes salta al que la cubre. El
   mensaje de «Pedir por el chat» lleva la fecha y los días («Quiero pedir
   $100.000 para el 15 oct 2026 (en 30 días, dos quincenas). ¿Me alcanza?»).
   `VERSION_APP = '2026-09-15'`. Sigue sin verse en un teléfono de verdad.
2. **La ficha:** `index.html` carga `../app/ficha.js` (ocho scripts ahora,
   justo después del motor porque lo toma de `window.MotorReglas` al cargar) y
   `abrir()` arma `S` con `FichaSocio.leer(resp.datos)` en vez de copiar la
   aritmética (nivel derivado del total, prestada por resta, comprometida
   recortada, cupo, `maximoRespaldado`): la MISMA lectura que `socio.html` y
   `play/`, un solo dueño de esa cuenta. Si `ficha.js` no llegó, abre como
   cuenta sin vincular y lo dice arriba (`AVISO_FICHA`), como ya hacía con
   `platachat-reglas.js`. `sw.js` ya tiene `app/ficha.js` en `ARCHIVOS` desde
   el 14 (comprobado: es la última entrada); la receta lo anota en el paso 2.
3. **El plan al día:** aplicado sobre `PLAN-PLATACHAT.md` el paso 6 de la
   receta (las siete frases que el código construido no cumplía) y añadido en
   la sección 3.3 el párrafo de la calculadora nueva con la fecha 14-sep. El
   paso 6 de la receta queda marcado como aplicado; conserva el número para
   que los pasos 7 a 11 no se corran.

**Pruebas: 1.422 en verde desde la raíz** (`node --test`, 0 fallan), 177 de
PlataChat (68 + 28 + 51 + 30). Ojo: `pruebas/rayo.test.js` (ajeno) tiene una
prueba al azar («SE RAMIFICA, y las ramas tienen ramas») que se cayó una vez de
tres corridas seguidas; no es de PlataChat y no se tocó. `git status --short`
al cerrar: `M PLAN-PLATACHAT.md` y todo lo de PlataChat como `??`. Sin commit,
a propósito.

---

## En una frase

PlataChat existe como carpeta `platachat/` dentro de Tu Garantía, con tres
pestañas (Chats · Plata · Yo), piel plata y verde, entrada por celular y
contraseña, el chat de tres canales compartido con la app del socio y el CRM,
la garantía en monedas y lingotes, la calculadora del quincenal dentro del
cupo, **la negociación del crédito por el chat con hora límite, gerente
responsable, automática al vencer y aviso por Telegram**, tres migraciones
nuevas y su envoltorio de Android declarado. **Nada de eso está publicado ni
pegado en la base todavía**, y en un teléfono de verdad no la ha abierto nadie:
lo verificado es el arnés de Node (la página corre entera dentro de `vm`, con
una nube de mentira) y la lectura cruzada de dos rondas de auditoría adversaria.

**1.711 pruebas en verde** desde la raíz (`node --test`: 1.711 pasan, 0 fallan,
274 suites), medidas el 15-sep a las 18:05. **284 son de PlataChat**, en seis
archivos nuevos (68 + 28 + 51 + 30 + 65 + 42), y 107 de ellas son de la fase 1b.
Sin commit: todo lo de PlataChat está como `??` en `git status`, a propósito.

---

## Lo que te toca a ti, en orden

1. **Pegar las tres de PlataChat en el SQL Editor, en este orden** (al 26-sep
   lo de Tu Garantía que las precede ya está en la base —`20260914b` desde el
   22-sep— y la otra sesión las pone al final de `PEGAR-AHORA.html`):
   primero `base/20260921_platachat_app.sql`, después
   `base/20260923_platachat_chat.sql` y después
   **`base/20261005_platachat_solicitud.sql`** (la fase 1b: el reloj, la
   automática, el gerente y el aviso). Las de PlataChat abortan a propósito si
   falta la anterior. La cuarta termina con un aviso —no un error— que dice que
   falta el token del bot: eso es el punto 3 de esta lista. Cómo comprobar que
   quedó: `RECETA-PLATACHAT.md`, paso 1.
2. **HOY o mañana — aplicar los pasos 2 y 3 de la receta** (`sw.js` y
   `.well-known/assetlinks.json`), `node --test`, `git add` **por archivo**
   (nunca `-A`: la otra sesión ya se llevó el plan a medio escribir), commit y
   push. Con eso PlataChat queda publicada en `https://tugarantia.net/platachat/`.
3. **HOY — encender el aviso por Telegram: cuatro clics** (`RECETA-PLATACHAT.md`,
   paso 17, unos 15 minutos). Crear el bot en **@BotFather**; sacar tu `chat_id`
   escribiéndole al bot y abriendo `getUpdates`; guardar el token en la base con
   el `insert` que la migración deja **comentado a propósito** al final (una
   llave escrita en un archivo del repositorio es una llave publicada); y
   guardar los destinos con `avisos_destino_guardar`, probándolo con
   `aviso_probar` + `avisos_recientes` hasta que diga `entregado`.
   **Sin esto el reloj corre pero nadie se entera de que la ventana está
   abierta**, y todas las solicitudes se las va a contestar el automático.
4. **Probarla en tu teléfono** con un número de PRUEBA (crea una cuenta real
   en Auth y cae en Registrados; después se descarta): registrarse, escribir
   en Créditos, mover la calculadora, «Pedir por el chat». Luego «Yo» →
   escribir tu código de socio → Plata tiene que mostrar tu garantía real.
   Con el punto 3 hecho, «Pedir por el chat» tiene que hacerte sonar el
   Telegram en segundos, y en el chat tiene que salir la hora límite.
   Nadie ha visto la piel en una pantalla de verdad: lo que se vea raro, se
   arregla en `platachat/estilo.css`, que es solo de PlataChat.
5. **Aplicar los pasos 12 y 13 de la receta** (`panel/crm.html`) antes de
   desembolsarle a nadie desde la bandeja: sin ellos, una propuesta a dos o
   tres cortes se ve con un total distinto del que el cliente aceptó, y una
   solicitud que todavía no tiene propuesta sale con el botón «Crear crédito».
   Mientras tanto, sobre una fila de PlataChat usa «✏️ Cambiar propuesta» y
   mira `contrapropuesta.total` antes de registrar nada.
6. **Buscar «PlataChat» y «Plata Chat» en SIPI** (sic.gov.co), clases 36, 38 y
   42, ANTES de repartir el primer APK: el `packageId` `co.tugarantia.platachat`
   es irreversible desde la primera instalación.
7. **Construir el APK** fuera de OneDrive con `construir-apk-platachat.ps1`
   (receta, paso 8: el script completo está ahí; hay que crearlo en
   `C:\Users\joanh\android-kit\`). Solo después de publicar: Bubblewrap descarga
   el manifiesto y los iconos por URL. Mientras no exista, la página de
   descargas explica «Añadir a pantalla de inicio», que ya funciona.
8. **Las diez decisiones de la sección 6 del plan.** Dijiste «arranca ya» sin
   contestarlas; todo lo construido aplica la opción **(a)** de cada una (APK
   directo, proveedor manual, `platachat/` en este repo, reparto gastos-reales
   → 80/20 del neto desde el 26-sep (tu decisión del 23-sep para Tu Garantía), quincenal dentro del cupo y el préstamo de 1-6 meses como
   meta, 35 % automático sobre lo pedido con tope 100.000, tú como responsable
   de la hora, sin fila del 25 %, mínimo 50.000, chat solo cliente-negocio, el
   chat sustituye al WhatsApp para cobranza). **Las decisiones 5 y 6 se
   construyeron el 15-sep con la (a)**, sin esperarte, porque dijiste «sigue
   con la fase 1b». Si alguna de las dos va por la (b), dilo ahora: cambiar la
   hora de espera y la política del automático se hace desde
   `politica_app_guardar`, sin tocar código; cambiar quién responde, no.
9. **Confirmar si Supabase es Free o PRO.** Desde el 26-sep las fotos de
   PlataChat van a la misma tabla que las de Tu Garantía (`chat_fotos`), que
   tiene 150 MB de los 500 del plan gratis y deja de recibir fotos al
   llenarse. Con dos marcas mandando comprobantes, se llena el doble de
   rápido. Pasados los 500 MB, la base entera queda de solo lectura: no se
   puede desembolsar ni cobrar. Urge antes de mandar el enlace a muchos.
10. **Antes del 1 de octubre:** la certificación de usura de octubre. Desde el
    17-sep se trae sola de la fuente oficial y abre una propuesta de cambio
    que tienes que revisar y aceptar. No es de PlataChat, pero PlataChat
    también la lee.

**Fechas del plan, tal como quedan:** la fase 1b **ya no está pendiente**: se
construyó el 15 de septiembre, tres semanas antes de lo planeado (estaba para el
5–9 de octubre), y lo que queda de ella son clics tuyos — pegarla, el bot de
Telegram y los pasos 12 y 13 de la receta. Fase 2 (la página del CRM) martes 13
– viernes 23 de octubre; enlace a tus clientes de hoy la semana del 13 de
octubre; **corte el viernes 30 de octubre**: si esa semana menos de diez
clientes escribieron por el chat, no arrancan ni TumiPay ni Play.

---

## Qué existe y está probado

Todo en archivos nuevos. Ninguno existente se tocó.

| Archivo | Qué es |
|---|---|
| `platachat/index.html` | La app: un solo archivo con HTML y script, como `socio.html`. Pantallas `#hola` (bienvenida 2 s), `#pEntrar` (Entrar · Soy nuevo), `#pCargando`, `#pCuenta` con nav de tres pestañas. `VERSION_APP = '2026-09-15'`. Carga, en este orden, `estilo.css`, `../app/chat.css`, y ocho scripts: motor, ficha, puente, cuenta, chat, platachat-reglas, pagos-proveedor, `sesion.js`. Guarda HTTPS al principio; registra `../sw.js`. La calculadora (15-sep): barra de 50.000 a 2.000.000 (`TOPE_CALCULADORA_PLATACHAT`), «para cuándo lo pagas» por cortes dentro del cupo, `abrir()` por `FichaSocio.leer`. **La negociación (15-sep, fase 1b):** la tarjeta de propuesta en el hilo de Créditos con sus cuatro caras, la hora límite en hora de Bogotá, «Acepto» / «Proponer otra cifra», el estado en una línea en Plata, y `RELOJ_OK` — con una base sin la migración (404) la app vuelve a hablar como antes y **no promete hora** |
| `platachat/sesion.js` | `window.SesionPlataChat`: `entrar`, `registrar` (primero `registrar_abierto_app` con el anon, después el signup), `rpc` (Bearer = access_token, apikey = anon; 401 → refresca UNA vez y repite), `refrescar`, `guardar`/`leer`/`borrar` en `localStorage['platachat_sesion']` sin contraseña, `correoDe`, `NUBE_CAIDA`. Probable en Node con un fetch de mentira |
| `platachat/estilo.css` | La piel: tokens `--marca` (verde), `--plata*`, `--laca`, `--papel`…; los alias `--rojo`/`--rojo-tinte` → verde para que `app/chat.css` pinte sin tocarlo; modo oscuro con los tres bloques; `#hola`, `.cab`, `.entrada-chat`, avatares, monedas y lingotes (un solo dueño: la página no redefine nada de esto) |
| `platachat/app.webmanifest` | `id "/platachat/"`, `start_url index.html`, `scope ./`, standalone, portrait, `#0C0A0B`, `es-CO`, `finance`, tres iconos |
| `platachat/haz-iconos.js` + `icono-192/512/maskable-512/180.png` | Los iconos, dibujados por código (moneda de plata + burbuja verde; sin el «$» del diseño porque Node no trae fuentes). `node platachat/haz-iconos.js` los regenera |
| `platachat/borrar-cuenta.html` | La página de borrar la cuenta (Ley 1581; Play la exige): explica el camino (chat de Servicio o WhatsApp) sin fingir un botón que borre |
| `app/platachat-reglas.js` | `window.PlataChatReglas`: `repartir` (gasto → neto → 75/25, o 37,5 % tarde), `gastoTumiPay`, `gastoManual`, `tasaPorCupo` (35 % nuevo con tope 100.000 · 20 % dentro · sobre cupo no se cotiza), `escalera`, `creditosHasta`, `monedas`, frases en pesos; desde el 15-sep `cortesDesde` y `cortesHasta` (los cortes hasta una fecha de pago, con el motor por parámetro). Puro: sin reloj, sin red, sin DOM |
| `app/pagos-proveedor.js` | `window.PagosProveedor`: `PROVEEDOR_ACTIVO = 'manual'`, tarifas por proveedor, `gastoMovimiento`, `gastoCredito`; `desembolsar`/`recaudar` en `tumipay` devuelven `{ok:false, motivo:'TumiPay no está configurado…'}` sin hacer fetch |
| `base/20260921_platachat_app.sql` | Columna `app` (`tugarantia`/`platachat`, check por nombre) en `registros`, `solicitudes`, `socios_historial`; check `solicitudes.estado` NOT VALID; tabla `politica_app` (semilla platachat: 100.000 · 35 · 8 días · 60 min); `registrar_abierto_app(...)` (copia fiel de `registrar_abierto` + `p_app`, función NUEVA, grant a anon); `accesos_app` + `marcar_acceso(p_app)` |
| `base/20260923_platachat_chat.sql` | `mensajes.de` admite `equipo`; tabla `comprobantes` + `comprobante_subir(p_imagen, p_nota, p_canal)` (10 cada 15 min, deja «Comprobante enviado (#id)» en el hilo); `comprobantes_de(p_clave, p_llave)` y `comprobante_imagen(p_clave, p_id)` para Joan; `chat_responder_equipo(p_persona_id, p_canal, p_texto)` con la reja de `gestion_anotar`, rastro en `contactos` canal `app`, y el HORARIO de la Ley 2300 en la base para `cobranza`; `festivos_colombia` sembrada 2026-2027 desde `MotorReglas.esFestivo` |
| `base/20261005_platachat_solicitud.sql` **(fase 1b, 15-sep)** | La negociación, **31 funciones**. Columnas `responder_antes_de`, `resuelta_en`, `responsable`, `pedido` y `repropuestas` en `solicitudes` (con su índice parcial de vencidas); `solicitar_platachat` / `reproponer_platachat` / `aceptar_propuesta_platachat` / `mi_solicitud_platachat` para el cliente, todas escribiendo también en el hilo de Créditos, y estampando en `pedido` qué va a hacer el automático y cuántos minutos de espera hay; `resolver_vencidas()` (el reloj, disparado AL LEER, con `for update skip locked`); `responsable_de` (cadena `cartera → asignaciones → equipo`, Joan de respaldo); `contrapropuesta_gerente` (el gerente cotiza desde su celular, mismas rejas que Joan, y no recibe cédula ni el registro del cliente); `propuesta_platachat_de` (costo × cortes); `politica_platachat()` (la política que ve el teléfono, con sesión y solo lectura) y `politica_app_leer`/`politica_app_guardar` (con clave); tablas `avisos` y `avisos_destinos` con `avisar_platachat` (Telegram por `pg_net`, nunca tumba la solicitud), `texto_aviso` (nombre + últimos cuatro dígitos, nunca cédula), `avisos_destino_guardar`, `aviso_probar`, `avisos_recientes`. Redefine `mi_solicitud`, `listar_solicitudes_abiertas` y `contrapropuesta_solicitud` para que corran el reloj |
| `android/twa-platachat.json` | El envoltorio: `co.tugarantia.platachat`, `enableNotifications: true` (para no reinstalar el día que lleguen), `startUrl /platachat/index.html`, versión 1.0.0 / 1, misma llave de firma |
| `descargas/platachat.html` | La página que se manda por WhatsApp. Honesta: explica «Añadir a pantalla de inicio» hoy, y el botón del APK está apagado y dice cuándo se enciende |
| `pruebas/platachat.test.js` (68) | El cableado: sin porcentajes, el chat es el compartido, los ocho scripts en orden, todo compila, la página PINTA con una cuenta de prueba (145.000 de cupo, 45.000 ganados, 4 monedas y media, 120.000 a pagar y +15.000 de garantía en 100.000; con dos cortes 140.000 y +30.000), la barra de 50.000 a 2.000.000 con los atajos, por encima del cupo y del tope del nuevo no cotiza, el calendario salta al corte, `abrir()` lee con `ficha.js` y avisa si no llegó, sin vincular, sin nube, 404, 401 → refresh una vez, «Pedir por el chat» con fecha y días, un solo latido, la traída vieja se bota, 5xx no es «sin conexión», el gerente es una persona, el manifiesto y el envoltorio, la piel, la receta |
| `pruebas/platachat-base.test.js` (28) | Las dos migraciones, estáticas: security definer + search_path, revoke/grant por firma, stable no escribe, sin `create policy`, RLS en cada tabla, sin repegar `supabase.sql`, sin sobrecargas, comprobación final, y los festivos iguales a los del motor |
| `pruebas/platachat-reglas.test.js` (51) | Con proveedor manual, peso a peso lo del motor; las 28 filas del anexo A del plan; la escalera de 7, 11 y 13 créditos; los cortes hasta una fecha con el motor real (30-sep → 1, 15-oct → 2, 31-oct → 3, el 15-nov domingo y 16 festivo corridos al 17); el módulo puro; sin porcentajes en las frases |
| `pruebas/pagos-proveedor.test.js` (30) | Las tarifas contra el anexo A; sin red, sin credenciales; TumiPay no finge estar encendido |
| `pruebas/platachat-solicitud.test.js` (65) **(fase 1b)** | La migración de la solicitud, estática: `security definer` + `search_path` en todas, `revoke` antes de `grant` y **ningún grant en bloque** (ni `on all functions`, ni `grant all`, ni `alter default privileges`); ninguna de las que escribe queda `stable` (tampoco escrito en la misma línea que `language`); el reloj dentro de las tres funciones redefinidas; el freno de repropuestas contra `solicitudes.repropuestas`; los dos índices y el del freno global; RLS en las tablas nuevas; el mismo predicado del automático en el mensaje del hilo y en `pedido.automatica`; y **Ley 1581**: ni la cédula ni el celular completo pueden viajar al aviso, ni dentro de `texto_aviso` ni concatenados fuera, y ni el gerente ni el cliente reciben campos que no son suyos |
| `pruebas/platachat-solicitud-pagina.test.js` (42) **(fase 1b)** | La página con el reloj, en el arnés de `vm`: las cuatro caras de la tarjeta, la hora prometida SOLO cuando la base contestó, la espera dicha con el número real de la política (no «una hora» clavada), «la hora se cumplió» con el reloj de la BASE y no el del teléfono, la solicitud vieja que llega tarde no pisa una aceptación recién hecha, una traída que falla (500 · 502 · 503 · 429 · sin red) no le borra la propuesta al cliente, el latido sigue siendo UNO (contando también `setInterval`), y cada motivo de la base se dice con sus palabras |
| `RECETA-PLATACHAT.md` | Los toques a archivos ajenos, con antes y después, en orden y con tiempos (ignorado por git) |
| `PLATACHAT-ESTADO.md` | Este parte |

**Funciones de la base que la app llama y que son de la otra sesión**
(`base/20260914b_tres_canales.sql`, sin pegar): `mi_cuenta()`,
`vincular_cuenta(p_ident, p_codigo)`, `chat_leer_sesion(p_canal, p_desde)`,
`chat_escribir_sesion(p_canal, p_texto)`, y la interna `llave_de_sesion`.

---

## Lo que la auditoría adversaria del 14-sep cambió

Después de construir, otra sesión intentó romperlo. Lo que se cayó y cómo quedó:

1. **El gerente salía como robot.** La migración escribía sus respuestas como
   `agente`, y para `chat.js` `agente` es el asistente automático (burbuja
   punteada). Ahora la base escribe `equipo`, un valor NUEVO; `chat.js` lo
   pinta del lado del negocio sin punteado sin tocarlo, y la página solo le
   pone «tu gerente» encima. Lo único pendiente es el rótulo en el CRM («Tú»
   en vez de «Tu gerente»): receta, paso 5.
2. **Latidos acumulados.** Cada cambio de canal arrancaba otra cadena de
   sondeos de 20 s y ninguna moría (medido: 1, 2, 3). Ahora hay UN temporizador
   (`LATIDO`) y un número de hilo (`GEN`): una traída que llega tarde de un
   hilo ya cerrado se bota; salir de Chats o de la cuenta apaga el latido de una.
3. **La nube caída se pintaba como «sin conexión».** Un 500 mandaba al cliente
   a revisar el wifi. Ahora `SIN_NUBE` solo se enciende cuando el fetch RECHAZA
   (`e.red`); un 5xx o 429 dice «la nube contestó con un error (N)» y sigue
   mostrando lo último bajado. `sesion.js` distingue lo mismo en `entrar` y
   `registrar` (`NUBE_CAIDA`), y un 400 sigue siendo «revísalos».
4. **Un hilo huérfano.** `chat_responder_equipo` recibía una llave que el
   equipo no tenía cómo saber. Ahora recibe `p_persona_id` (el id de `cartera`,
   como `gestion_anotar`) y la base deriva la llave con `llave_de_sesion(celular
   de la cartera)`: la MISMA función con la que `chat_leer_sesion` decide qué
   hilo lee ese celular, así que por construcción cae donde el cliente lo lee.
5. **Dos dueños de la piel.** La página traía copias «por si la piel no llegó»
   de la bienvenida, la cabecera, la barra del chat, los avatares y las
   monedas, y ganaba una u otra según la especificidad. Ahora un solo dueño:
   `estilo.css`. Si la piel no llega, no llega nada, y eso se ve.
6. **Fuera de horario no hay cola.** La función devuelve «no se envió», no
   «sale a las 7:00»: sin `pg_cron` no hay quien lo mande después.

---

## Qué NO existe todavía, y en qué fase va

> La **fase 1b ya no está en esta lista**: se construyó el 15-sep (ver el parte
> de arriba). Lo que le falta no es código, son clics tuyos: pegarla, el bot de
> Telegram, y los pasos 12 y 13 de la receta sobre `panel/crm.html`.

- **La bandeja del CRM al día con PlataChat.** `panel/crm.html` es archivo de la
  otra sesión y no se tocó. Hasta aplicar los pasos 12 y 13 de la receta, la
  bandeja recalcula la propuesta con **un solo corte** (una propuesta a dos o
  tres cortes se ve con un total distinto del que el cliente aceptó) y ofrece
  «Crear crédito» sobre una solicitud de PlataChat que todavía **no tiene
  propuesta**, con el precio del Panel en vez del que el cliente vio. Los dos
  están escritos con antes y después en `RECETA-PLATACHAT.md`.
- **El aviso a cuotas en el chat.** El botón «A cuotas · con garantía» del CRM
  (`contrapropuesta_a_cuotas`, `base/20260916`) pinta la tarjeta en la app del
  cliente pero **no escribe el mensaje en el hilo** ni marca la solicitud como
  resuelta. Va en la migración de la fase 2 (receta, paso 14). Mientras tanto,
  sobre PlataChat se usa «Cambiar propuesta», que sí escribe.
- **Fase 2 — el CRM** (`panel/platachat.html` en modos DUEÑO y EQUIPO,
  `app/cobranza-reglas.js`): la bandeja por app, las dos apps lado a lado, la
  cobranza por el chat (el horario ya está en la base; falta quien lo llame),
  el contador único de la Ley 2300 (WhatsApp tuyo + WhatsApp del asesor +
  chat), la columna `mensajes.app` con un `p_app` acordado con la otra sesión
  (`chat_escribir_sesion` es suya), la bandeja de comprobantes
  (`comprobantes_de` ya existe; nadie la llama).
- **Segunda entrega del chat**: Web Push al cliente (falta el emisor en
  `sw.js`: la página no pide el permiso hasta que exista), notas de voz (el
  micrófono está deshabilitado y lo dice), la medición semanal.
- **Fase 3 — TumiPay**, condicionada al corte del 30-oct: `pagos-proveedor.js`
  en modo `tumipay`, `movimientos_pago`, la Edge Function del webhook, OTP por
  SMS. Hoy `desembolsar()`/`recaudar()` de `tumipay` contestan «no está
  configurado» sin hacer red, y el cliente nunca ve la palabra TumiPay.
- **Fase 4 — PlataChat para Play**, condicionada: dominio limpio, ficha en
  Finanzas, sin puente con el APK. No arranca sin la decisión 1 = (b).
- **El APK**: declarado (`twa-platachat.json`), no construido. Receta, paso 8.
- **Lo que el plan prometía y se hizo distinto**: las siete frases de la
  receta, paso 6 (`mensajes` sin columna `app`; `mi_cuenta` no escribe
  `ultimo_acceso`, lo mide `marcar_acceso`; `comprobantes` con `llave`, no
  `celular`; la firma de `chat_responder_equipo`; sin cola). **Ya aplicadas en
  el plan el 15-sep de madrugada**: el plan dice hoy lo que el código hace.

---

## Trampas para la próxima sesión

- **Dos sesiones sobre el mismo árbol.** `tugarantia-46` es dueña de
  `app/chat.js`, `app/socio.html`, `play/index.html` y `sw.js`; PlataChat es
  dueña de todo lo `platachat*`, `app/platachat-reglas.js`,
  `app/pagos-proveedor.js`, las tres migraciones (`20260921`, `20260923` y
  `20261005`) y sus pruebas.
  Lo de ellos se toca por receta, nunca a mano. Y `git add` por archivo: un
  `git add -A` ajeno ya se llevó `PLAN-PLATACHAT.md` a un repo público.
- **Después de `20261005` NO se repegan `20260908_primer_credito.sql` ni
  `TODO-PENDIENTE-9-SEP.sql`.** Los dos traen las versiones VIEJAS de
  `mi_solicitud`, `listar_solicitudes_abiertas` y `contrapropuesta_solicitud`,
  sin el reloj; `create or replace` gana el último que pega, y repegarlos apaga
  el reloj **sin dar ningún error** (esas versiones ni llaman a
  `resolver_vencidas`, así que ni siquiera revientan): las solicitudes vencidas
  se quedarían sin contestar y el hilo ya le prometió al cliente que a esa hora
  le contestábamos. Cómo saberlo: `select proname, provolatile from pg_proc
  where proname in ('mi_solicitud','listar_solicitudes_abiertas',
  'contrapropuesta_solicitud')` — las tres tienen que decir `'v'`. Cómo
  arreglarlo: repegar `20261005`, que es idempotente. Receta, paso 16.
- **El token del bot NO va en ningún archivo.** El `insert` en `config_privada`
  está comentado a propósito al final de `20261005`: una llave escrita en un
  archivo del repositorio es una llave publicada. Se pega a mano, una vez, y
  `avisos_recientes` nunca lo muestra (solo si está y de qué largo es).
- **El aviso NO lleva la cédula ni el celular completo.** Se arma con
  `texto_aviso` (nombre + últimos cuatro dígitos) y hay pruebas que se caen si
  alguien le concatena un dato de más, dentro o fuera de esa función. Ley 1581.
- **`PEGAR-AHORA.html` trae seis migraciones, no cuatro.** El plan y el
  contrato dicen cuatro; la página se regeneró después con `20260915` y
  `20260916` (la otra sesión siguió construyendo). Las de PlataChat van
  DESPUÉS de todas.
- **La llave del hilo la da `llave_de_sesion(celular)`**: la cédula de la ficha
  si la cuenta está vinculada, el celular si no. Toda función que escriba en
  `mensajes` para un cliente de PlataChat pasa por ahí, o el mensaje cae en un
  hilo que nadie lee. Un socio de `socio.html` que nunca abrió PlataChat tiene
  su hilo bajo la cédula: a ese se le contesta con `chat_responder`, como hoy.
- **El signup está abierto y sin verificar el celular.** Quien registre el
  número de un socio viejo es, para Auth, ese número — pero no ve nada: el
  candado (`auth_vinculada_en is not null`) cierra `mi_cuenta`, y el código de
  cinco caracteres es la prueba. `comprobante_subir` y el chat por sesión
  quedan fuera del candado a propósito: el nuevo sin ficha tiene que poder
  escribir y mandar su comprobante.
- **`agente` es máquina; `equipo` es persona.** No «arreglar» `esAutomatico` ni
  quitar `ch-esauto` desde la página: la regla de qué es automático vive en
  `chat.js` y la página solo pone nombres (`QUIEN`), con `agente` fuera adrede.
- **Un solo latido.** No agregar `setTimeout` en `chatTraer`: `chatLatido`
  apaga antes de armar, `irA(≠chats)` y `salir()` apagan, y `GEN` descarta las
  traídas viejas. Hay pruebas que cuentan los temporizadores vivos.
- **`SIN_NUBE` solo con `e.red`.** Un 5xx no es falta de señal. `sesion.js`
  pone `red:true` solo cuando el fetch rechaza.
- **La piel es dueña** de `#hola`, `.cab`, `.entrada-chat`, `.avatar`, `.moneda`,
  `.lingote`, `.m1…m4`. Si la página vuelve a definir una, la prueba «un solo
  dueño» se cae.
- **Sin dígitos seguidos de `%` en el texto visible** de `platachat/index.html`,
  `platachat/borrar-cuenta.html` y `descargas/platachat.html`: hasta los
  degradados del SVG van en fracciones. Se habla en pesos y con palabras.
- **`CFG` se comparte con `socio.html`** por `localStorage['socio_cfg']`: quien
  apunte una app a otro proyecto de Supabase apunta las dos. La sesión vive en
  `localStorage['platachat_sesion']` sin contraseña; `http://` y `https://` son
  cajones distintos (la guarda HTTPS va primero por eso).
- **`VERSION_APP` y `CACHE`.** Hasta aplicar el paso 2 de la receta, subir
  `CACHE` en `sw.js` no precarga PlataChat: la página y los `.js` llegan
  frescos, pero `estilo.css` y los iconos se quedan con la copia guardada.
- **`socio.html` compara el préstamo con garantía contra `MONTO_MINIMO`** (50.000)
  y no contra `MONTO_MINIMO_RESPALDADO` (1.000.000). Es archivo de la otra
  sesión: receta aparte para Joan (paso 10). PlataChat ya compara bien.
- **Bubblewrap descarga los iconos por URL**: publicar antes de construir. Y el
  icono es provisional (geometría, sin el «$»): el día que haya uno dibujado,
  se exporta a los cuatro tamaños con los mismos nombres y `haz-iconos.js` se
  deja de correr, no las dos cosas a la vez.
- **`enableNotifications: true` en el envoltorio, y la página NO pide el
  permiso** hasta que `sw.js` escuche `push`. Hay una prueba que lo vigila.
- **Las pruebas de la página corren los `<script src>` DENTRO de `vm`**, no con
  `require`: `sesion.js` busca `fetch` al usarlo, y con `require` hablaría con
  el fetch real de Node. Si se agrega un noveno script a `index.html`,
  `SCRIPTS_EN_ORDEN` en `pruebas/platachat.test.js` tiene que cambiar.

---

## Cómo se prueba localmente

- **Pruebas:** `node --test` desde `C:\Users\joanh\OneDrive\Desktop\TuGarantia`
  (todo, 1.711); `node --test pruebas/platachat.test.js` para solo la página
  (68, unos 2 s); `node --test pruebas/platachat-solicitud.test.js` para la
  migración de la fase 1b (65) y `pruebas/platachat-solicitud-pagina.test.js`
  para la tarjeta y el reloj (42). El arnés no necesita red ni base.
- **En el navegador, sin publicar:** la entrada `sitio` de
  `TuGarantia\.claude\launch.json` (python `http.server` en `127.0.0.1:8765`,
  sirve la raíz del repo) → `http://127.0.0.1:8765/platachat/`; o la entrada
  `tugarantia` del `launch.json` de PLAZA (`servidor-tg.js`, sirve la misma
  carpeta en `8126`) → `http://localhost:8126/platachat/`. La guarda HTTPS deja
  pasar `localhost` y `127.0.0.1`.
- **OJO: la app local habla con la base REAL** (`CFG_POR_DEFECTO` apunta a
  `wnsioekvjspwtghbodbg.supabase.co`). Registrarse desde local crea una cuenta
  real en Auth y una fila real en `registros`. Con las migraciones sin pegar,
  `mi_cuenta` contesta 404 y la app lo dice arriba en ámbar («falta correr
  base/20260914b…»); el chat también.
- **Sin nube:** desconectar la red con una sesión guardada. Tiene que pintar lo
  último bajado y decir «Sin conexión».
- **Iconos:** `node platachat/haz-iconos.js` desde la raíz regenera los cuatro PNG.
- **El sondeo del chat:** en la consola, `LATIDO` es el id del único
  temporizador y `GEN` el número del hilo abierto; con la pestaña oculta
  (`document.hidden`) no se pide nada.

---

## Los números

| | |
|---|---|
| Pruebas desde la raíz | **2.442; 2.390 pasan** el 26-sep. Las 52 rojas son del motor de Tu Garantía (el 80/20 a medio cerrar por la otra sesión), ninguna de PlataChat |
| De PlataChat | **285, todas en verde**, en seis archivos (68 + 25 + 51 + 30 + 69 + 42) |
| De la fase 1b | 107 de esas 284, verificadas por **mutación**: 36 defectos metidos a propósito, 36 vistos |
| La migración de la fase 1b | `base/20261005_platachat_solicitud.sql`, 31 funciones, sin pegar |
| Hallazgos de la revisión adversaria | 36 · 34 confirmados y corregidos · 2 descartados con argumento |
| `sw.js` | `tugarantia-v111` al 26-sep; PlataChat entra al precache con el push |
| Base de producción | comprobado el 26-sep: `20260914b` aplicada; **las tres de PlataChat, sin pegar** |
| Aviso por Telegram | sin token y sin destinos: **construido y apagado** hasta los cuatro clics (receta, paso 17) |
| Commit | ninguno de PlataChat al escribir esto; va en un solo push junto con el 80/20 de la otra sesión |
| Regla de rendición | viernes 30 de octubre de 2026: diez clientes escribiendo por el chat en la semana, o no hay fase 3 ni 4 |
