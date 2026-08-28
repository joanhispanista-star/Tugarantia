# Dónde quedó Tu Garantía — 25 de agosto de 2026

Resumen para arrancar la próxima sesión sin leer nada más. Lo verificado se
marca como verificado; lo que solo está escrito, se dice.

---

## En una frase

Tu Garantía dejó de vivir en la dirección de un tercero: **el sistema completo
—registro público → aprobación de Joan → membresía → app instalada → sesión que
se queda— está vivo bajo `tugarantia.net`**, con dos clientes reales usándolo.
Lo que sigue no es construir: es vender, y quitar tres tapones que solo Joan
puede tocar.

---

## El dominio (25-ago)

`tugarantia.net`, comprado en **CLOUDFLARE** (no GoDaddy: el dashboard vive en
dash.cloudflare.com, cuenta `Joan.hispanista@gmail.com`, zona
`1f50b0b732ee1c9b6c873bd46b043c08`).

Verificado en vivo ese día: los 4 registros A de GitHub Pages resolviendo en el
DNS mundial, candado HTTPS emitido, y **200** en `/`, `/app/socio.html`,
`/descargas/`, `/descargas/TuGarantia.apk`, `/.well-known/assetlinks.json` y
`/play/index.html`. Las URLs viejas de `github.io` **redirigen solas** (301).

Direcciones de la casa:

| Qué | Dónde |
|---|---|
| App del socio (Android e iPhone) | `tugarantia.net/app/socio.html` |
| Descargar el APK | `tugarantia.net/descargas/` |
| Registro de clientes nuevos | `tugarantia.net/play/` |
| Panel del bolsillo (calle) | `tugarantia.net/panel/espejo.html` |
| CRM completo | el del computador de Joan (localhost:8899) |

**La lección que costó dos horas:** el certificado se queda ATASCADO si el
`CNAME` se le presenta a GitHub cuando el DNS todavía está vacío. El remedio
que funcionó en un minuto: retirar el CNAME, publicar, volver a ponerlo. Orden
correcto para la próxima: **primero el DNS, después el CNAME.**

Otra trampa medida: los `POST` a la API del dashboard de Cloudflare dan **403**
(CSRF) aunque la sesión esté viva; los `GET` sí sirven y son la forma honesta de
verificar qué quedó. Los registros se ponen por la interfaz, con la pestaña **al
frente** (si está oculta, el renderizador se congela y el CDP da timeout), y
**el formulario nace siempre con la nube NARANJA**: hay que apagarla en cada
registro, porque `proxied:true` impide que GitHub emita el candado.

---

## El APK

**v3 (versionCode 3, 1.2.0)**, publicado en `descargas/TuGarantia.apk` y
verificado por dentro antes de repartir: paquete `co.tugarantia.socio`, host y
alcance `tugarantia.net`, firma con la huella `E5:FB:DE:62…`, e idéntico byte a
byte al archivo que sirve el dominio.

El apretón de manos (Digital Asset Links) **por fin vive en casa**:
`tugarantia.net/.well-known/assetlinks.json` sale de ESTE repositorio, ya no del
repo del juego. Comprobado contra la API de Google: reconoce el paquete y la
huella, así que la app abre a pantalla completa, sin barra de navegador.

**Los dos pioneros deben reinstalar**: Leonardo y Laura tienen el v2 (host
`github.io`), que tras la redirección se ve con barra de navegador. Se borra y
se instala de nuevo desde `tugarantia.net/descargas/`; sus códigos no cambian.

Para reconstruir: `C:\Users\joanh\android-kit\construir-apk-socio.ps1` (fuera de
OneDrive a propósito). Ver `android/LEEME.md` y la memoria
`quincena-apk-directo` para las trampas del build.

---

## Lo que se construyó esta semana

**La nube dejó de estar vacía (21-ago).** Era el defecto de fondo: se repartían
códigos contra una base sin historiales porque la clave de sincronización nunca
se había puesto. Hoy los 19 clientes están arriba y la entrada está probada por
RPC con dos clientes reales.

**La puerta habla el idioma del negocio (20-ago):** se entra con **celular** (o
cédula) + código de 5 caracteres. El primer cliente real no pudo entrar porque
pedía cédula y su ficha no la tiene — como 11 de 16 ese día.

**La sesión se queda abierta y el código es del socio (20-ago):** entran una vez
y la app los recuerda (solo con origen `nube`, nunca cuando Joan mira como
cliente); pueden cambiar su código desde la app, y la subida de historiales no
les pisa la clave que se pusieron (`codigo_propio` / `codigo_forzar`).

**El Panel no registra plata sin mostrarla (20-ago):** todo crédito nuevo
confirma con cifras a la vista y avisa `⚠️ NO ES UNA CIFRA REDONDA`. Nació de
CR-0043, que entró con $29.961 porque el cuadro de pegar toma el número más
grande del texto. Y quedó **«🔍 Revisar la cartera»** en Créditos: señala montos
raros, dobles registros, contradicciones de fechas y concentración. **Señala, no
corrige.**

**El registro abierto llega al CRM (24-ago):** un desconocido se registra solo en
la fachada (7 pasos, 26 campos, Ley 1581), ve la calculadora del producto a 6
meses, y cae en el apartado **«📥 Registrados»** del CRM —separado de los
clientes— con chip de origen y sus 26 campos consultables. Al abrirle la ficha
todo se prellena. Migración `base/20260824_registro_abierto.sql` aplicada.

**La verificación es por WhatsApp, gratis (24-ago):** al terminar el registro se
genera un código `V-#####` que el cliente manda desde su propio WhatsApp. Como
el remitente lo pone WhatsApp y no él, número + código cuadrando en la bandeja =
celular verificado. Se descartó el SMS pago (Twilio cobra en dólares por
mensaje) y se anotó para cuando haya 100+ registros al mes.

**La plata del grupo salió de la vista del socio (20-ago)**, decisión de Joan: no
se muestra ni el total ni el porcentaje propio (con ambos se despeja el total con
una regla de tres).

**791 pruebas en verde.** Último commit: `24fd7ca`.

---

## Los tres tapones — todos de Joan, todos cortos

1. **Apagar «Confirm email» en Supabase** (Authentication → Sign In/Providers →
   Email). **BLOQUEA el registro abierto**: los correos de socios son sintéticos
   (`57…@socios.tugarantia.co`) y no reciben nada, así que cada registro queda
   esperando una confirmación imposible. El clasificador le impide a Claude
   tocar ajustes de seguridad: es un clic de Joan.
2. **El número de WhatsApp del negocio.** No está configurado en NINGUNA parte
   (`WA_NEGOCIO` en `play/index.html`, `NEGOCIO_OFICIAL` en `app/socio.html`,
   `DB.config.whatsapp` en el CRM). Consecuencia: los botones «escríbenos» y el
   de verificación abren WhatsApp **sin destinatario** — el cliente viejo se
   salva porque ya tiene el chat; el registrado nuevo no. Un mensaje de Joan
   llena los tres sitios.
3. **El techo de usura de septiembre, antes del 31-ago.** `TOPES` en
   `app/creditos.js` llega hasta el 31. Desde el 1 de septiembre la calculadora
   **se niega a cotizar** — deliberado: cotizar sin techo certificado es delito
   (art. 305 CP). Cuando la Superfinanciera publique la resolución, se agrega la
   fila y se regenera `PLAY-FICHA.md`.

**Pendientes menores (de Claude):** el `CNAME` de `www` (rebotó dos veces en el
formulario de Cloudflare) y «Enforce HTTPS» en Pages. Ninguno bloquea nada.

---

## Las tres puertas (25-ago, lo último que se hizo)

Cada entrada **pregunta antes de pedir**, que es lo que Joan pidió con estas
palabras: *«al inicio me indique si eres nuevo regístrate, si ya tienes código
ingresa»*. Antes de esto, el registro abierto llevaba un día vivo y ninguna
puerta se había enterado: el desconocido que instalaba el APK caía en un
formulario pidiéndole un código que no tenía, bajo un cartel que decía «se entra
solo por invitación». Se iba, y Joan nunca sabía que había llegado.

| Puerta | Qué pregunta |
|---|---|
| `app/socio.html` (lo que abre el APK) | «¿Ya tienes tu código?» → login · «¿Eres nuevo?» → `../play/` |
| `index.html` (la web pública) | «Soy nuevo · registrarme» → `play/` · «Ya tengo código · entrar» → `app/` |
| `play/index.html` (la fachada) | El registro va PRIMERO, el login después: es la puerta del desconocido |

**La asimetría de los enlaces es deliberada y tiene centinela propio:**
`socio.html → play/` **sí**; `play/ → socio.html` **jamás**. Una app publicable
que lleva al producto que la política de Play prohíbe es el patrón que Google
suspende.

De paso se arreglaron dos mentiras que llevaban tiempo: la web afirmaba «no hay
registro abierto y no va a haberlo» (incluso en las descripciones que viajan en
la tarjeta de WhatsApp, donde más se leen), y su botón principal apuntaba a
`wa.me/57XXXXXXXXXX` — diez equis de relleno que no llevaban a ninguna parte.

## Cómo se opera esto hoy

1. **Cliente nuevo:** se le manda `tugarantia.net` (o `tugarantia.net/play/` directo) → se registra → aparece
   en **Registrados** → Joan lo revisa (y ve su código de verificación de
   WhatsApp) → le abre la ficha → primer crédito → pasa a **Clientes**.
2. **Darle acceso a la app:** ficha del cliente → **📲 Mandar código** (el
   mensaje ya lleva usuario, código y enlace).
3. **Antes de repartir enlaces:** Clientes → **📱 ¿Pueden entrar mis clientes?**
   Pregunta a la nube por cada uno, igual que hará su celular. Es la única
   comprobación que vale; el resto es fe.
4. **Después de tocar plata:** Créditos → **🔍 Revisar la cartera**.
5. **Después de cambiar datos:** Ajustes → **☁ Subir historiales**.

---

## El número que importa

No son clientes registrados: es **cuántos registrados aprueba Joan por semana**,
y cuántos socios **vuelven a abrir la app solos**. Eso todavía no se mide.

---

## El camino a Play (27-ago) — decidido y a medio armar

**Joan ya tiene cuenta de Play Console** y decidió que Tu Garantía queda **a
nombre de una SAS**, no de él como persona natural. Consecuencias buenas: separa
su patrimonio del negocio, y la cuenta de organización **se salta la prueba
cerrada de 12 probadores × 14 días** — pero exige número **D-U-N-S**, que tarda
hasta 30 días y conviene pedir cuanto antes.

**Hecho (27-ago):**
- `android/twa-play.json` — el segundo envoltorio, alcance `/play/` y paquete
  `co.tugarantia.creditos`, distinto del `co.tugarantia.socio` del reparto
  directo. Con centinela que vigila el alcance y que los ids no coincidan.
- `android-kit/construir-aab-play.ps1` — produce el `.aab` **firmado**. El
  script viejo lo dejaba SIN FIRMA (jarsigner fuera del PATH) y cantaba
  «CONSTRUIDO» igual; ahora el veredicto abre el archivo y comprueba la firma.
- `play/grafico-destacado.png` — el 1024×500 obligatorio, generado desde un SVG
  editable. Sin cifras: una tasa publicada en la tienda se vuelve mentira el día
  que la Superfinanciera mueve el techo.
- El `id` de `play/app.webmanifest`, que seguía en la ruta vieja de github.io.
- **Centinela de la tabla de usura**: avisa 15 días antes por la salida de
  `npm test` y se pone roja solo cuando la app ya está muda. Hoy avisa.

**Falta, y es de Joan:**
1. **Los datos de la SAS** — razón social, NIT, dirección y ciudad, correo,
   celular. Sin eso, `legal/privacidad.html` y `legal/terminos.html` siguen con
   10 marcadores `[NOMBRE]` **publicados en vivo**, con un recuadro rojo que dice
   «JOAN, ESTO HAY QUE COMPLETARLO ANTES DE PUBLICAR», y lo ve todo el que se
   registra. No es un requisito de Play: es la Ley 1581 y la credibilidad.
2. **El D-U-N-S de la SAS** — pedirlo hoy, tarda hasta 30 días.
3. **Un abogado colombiano** que revise términos y privacidad. Lo exigen los
   propios documentos por escrito, sobre todo el punto del costo (tope de usura,
   con consecuencias penales) y los de garantía y cupo.
4. **La certificación de usura de septiembre**, antes del 31-ago.

---

## 28-ago: Play queda EN PAUSA. El canal es el enlace web.

**Decisión de Joan:** por ahora no se usa Google Play. Se le manda el enlace al
cliente y él lo instala como app desde el navegador («agregar a pantalla de
inicio»), con Joan explicándole cómo. Todo lo construido para Play **se queda
tal cual** — la app publicable, el `.aab` firmado, la ficha, el gráfico — porque
el día que se retome no hay que rehacer nada.

**Por qué se pausó, y es un dato duro:** la cuenta de Play Console existe
(«Joan Ruiz», personal, ID 5288359411531126445) pero **no está verificada**, y
el botón «Create app» sale con candado: *«Complete account verifications to
create new apps»*. Google ya rechazó un intento con este mensaje textual:

> *There was an issue with the verification info — Provide a document that
> clearly shows the current address*

Casi seguro se subió la cédula, **y la cédula colombiana no muestra dirección**.
Hace falta un recibo de servicios públicos, extracto bancario o certificado de
residencia, con la dirección **idéntica** a la registrada en Play y sin editar
(Google avisa que manipular el documento hace fallar la verificación). Faltan
además entrar a la app Play Console desde un Android y confirmar el teléfono.

**Verificado en vivo el 28-ago, punto por punto:**

| Qué | Estado |
|---|---|
| `tugarantia.net`, `/app/socio.html`, `/play/`, `/legal/` | 200 |
| Un cliente REAL con su código entra (probado con Leonardo) | ✅ devuelve sus datos |
| Las dos puertas («¿Ya tienes tu código?» / «¿Eres nuevo?») | ✅ en vivo |
| Instalable como app (manifiesto + 4 iconos + `standalone`) | ✅ |
| Registro de clientes NUEVOS | ❌ `mailer_autoconfirm: false` |

**Entonces: los códigos SÍ se pueden repartir hoy. El enlace de registro
abierto NO**, hasta que Joan apague «Confirm email» en Supabase.

**Un detalle que se decidió NO tocar:** el `id` del manifiesto de
`app/app.webmanifest` sigue siendo `/TuGarantia/app/socio.html`, la ruta vieja
de github.io. Es un identificador opaco —no tiene que apuntar a una URL real—
así que no rompe nada, y cambiarlo le duplicaría el icono a quien ya tenga la
app instalada. Se queda. (El de `play/app.webmanifest` sí se corrigió el
27-ago, porque esa app no la ha instalado nadie todavía.)

---

## 28-ago (tarde): el registro abierto por fin FUNCIONA — ya se puede repartir todo

Joan pidió que se hiciera el ajuste de Supabase, y **medir antes de tocar
destapó que el diagnóstico de los días anteriores estaba incompleto**. No era
solo el «Confirm email»: había una causa anterior y más tonta.

La cuenta del socio vive en Supabase Auth bajo un correo sintético hecho con su
celular, y ese correo usaba el dominio **`socios.tugarantia.co` — que no
existe** (y encima `.co`, cuando el de la casa es `.net`). Supabase valida el
dominio ANTES de crear la cuenta y devolvía `email_address_invalid`: **ningún
cliente se pudo registrar jamás.** Medido llamando al signup de verdad:

| Dominio probado | Resultado |
|---|---|
| `@socios.tugarantia.co` | `email_address_invalid` |
| `@socios.tugarantia.net` | `email_address_invalid` (el subdominio tampoco existe) |
| `@tugarantia.net` | pasa — ese sí resuelve |

Detrás estaba el segundo problema, que solo se ve una vez pasada la validación:
con «Confirm email» encendido, Supabase intentaba **enviar** un correo a un
buzón inexistente y chocaba con su límite (`over_email_send_rate_limit`).
**Los dos había que arreglarlos**; con uno solo seguía roto.

Hecho y verificado de punta a punta con un registro real (la cuenta se crea Y
el cliente puede volver a entrar con su contraseña; los usuarios de prueba se
borraron, en `auth.users` queda solo la cuenta de Joan):

- `app/cuenta.js` → `DOMINIO_INTERNO = 'tugarantia.net'`
- `base/20260828_correo_interno.sql` → `play_solicitar` alineada. **Aplicada.**
- `MAILER_AUTOCONFIRM: true` en el proyecto de Supabase.

**Consecuencia para el negocio: ya se pueden repartir LOS DOS enlaces.** El de
los clientes con código y el de registro para desconocidos.

**La lección de método, que vale más que el arreglo:** el «Confirm email» se
dio por diagnóstico durante cuatro días leyendo un ajuste, sin llamar nunca al
signup. Una llamada real lo habría destapado el primer día. Ante «no funciona
el registro», la primera acción es **registrarse**, no leer configuración.

---

## 28-ago (tarde) — el enlace que se le manda al cliente, y un token roto

Joan avisó que **desde el CRM mandó el código de acceso con el enlace viejo**.
Al buscar por qué, aparecieron cuatro cosas, y solo la primera era la que él
había notado.

### 1. La copia muerta sigue viva, y es la causa más probable

`https://joanhispanista-star.github.io/joan-te-presta/tg/` **responde 200 hoy**
(medido). Es el sitio de agosto que se publicó de urgencia el 14 mientras Pages
estaba apagado en el repositorio bueno. Su `crm.html` calcula el enlace **desde
donde está abierto**, así que el botón «📲 Mandar código» de esa copia manda
`…/joan-te-presta/tg/app/socio.html`.

Qué le pasa al cliente que abre ese enlace, medido en el archivo publicado:

| | la copia muerta | la buena |
|---|---|---|
| `VERSION_APP` | `2026-08-10` | la de hoy |
| conexión a Supabase de fábrica | **no la trae** (0 apariciones del proyecto) | sí |
| entrar con el celular | no existe (solo cédula) | sí, desde el 20-ago |

O sea: **no entra**, teclee lo que teclee. Desde su lado eso se ve igual que
«la app no sirve».

**Esto no se arregla desde el código**: hay que borrar la carpeta `tg/` del
repositorio `joan-te-presta` o apagarle Pages. `gh` no está instalado.

### 2. Tres caminos por los que salía una dirección muerta — cerrados

- **`DB.config.urlApp`** le ganaba a la del archivo con un `||`. Vive en el
  localStorage y **viaja en el lote de la nube** (`nube.js`, `CLAVES_AJUSTES`
  incluye `config`), o sea que se copia de aparato en aparato y sobrevive a
  cualquier versión nueva. Ahora solo gana si la dirección **hoy sirve**
  (`enlaceServible`), y `cargar()` la borra si no.
- **`panel/espejo.html`** calculaba el enlace desde `location.href`. El espejo
  se abre en la calle desde el acceso directo que Joan tenga en el celular: si
  ese acceso es de agosto, cada WhatsApp mandado desde allá llevaba el enlace
  muerto. `crm.html` se había curado de esto el 20-ago; el espejo se quedó ocho
  días atrás. Ahora va escrita entera, igual que el CRM.
- **Una dirección pegada a mano dentro de una plantilla** no la mueve ningún
  cambio de código. No se pisa (regla de la casa), pero ahora se avisa en la
  pantalla de Plantillas y se cambia por `{enlace}` de un botón.

### 3. El token que nadie contestaba — el hallazgo grande

**Desde el 21 de agosto, a cada cliente al que se le mandó su código le llegó,
literalmente:**

    👤 Tu usuario: {usuario}

La plantilla estaba bien y `mensajeCodigoAcceso` calculaba el número, pero
`aplicarVars` **no tenía la línea que contesta `{usuario}`**. El dato que el
cliente tiene que teclear para entrar, escrito como una llave rota.

Las 809 pruebas pasaban en verde: leen `crm.html` como texto, y el texto estaba
perfecto. Se cazó **ejecutando el mensaje**, no leyéndolo. De ahí sale
`pruebas/panel.test.js`: un banco que corre el JavaScript del Panel contra un
DOM de mentira y lee los mensajes que saldrían. **Es la red que faltaba.**

De la misma familia: los trece chips de variables salían en las catorce
plantillas y la vista previa los resolvía todos, pero solo cuatro mensajes
reciben enlace y `{codigo}` solo lo tiene la invitación. Un token que nadie
contesta **sale vacío** en el WhatsApp. Ahora cada plantilla ofrece los suyos y
lo que quede suelto se avisa mientras se escribe.

### 4. Lo que alcanza a los clientes ya avisados

Arreglar el Panel no toca los enlaces que ya están guardados en el WhatsApp de
cada cliente. Por eso el CRM ahora lista a quien recibió su código **antes** del
arreglo y ofrece mandarle el enlace bueno (plantilla `enlaceCorregido`, que no
repite el código: no cambió, y repetirlo haría dudar).

También se arregló `android/construir.ps1`, que seguía apuntando al
`app.webmanifest` de `github.io`: la próxima corrida habría escrito ese host
dentro del `twa-manifest.json` y el APK resultante habría quedado fuera del
`assetlinks` del dominio.

**818 pruebas, 135 suites, 0 fallos.** `sw.js` sube a `tugarantia-v17`.

---

## 28-ago (noche) — el chat, fase 1: construido y **esperando el SQL**

Joan dio el visto bueno al plan y pidió arrancar por la fase 1. Queda escrito,
probado y desplegado el código; **falta que él corra una migración** (abajo).

### Lo que había: el chat estaba entero por dentro y muerto por fuera

`base/supabase.sql:1017-1266`, del 5 de agosto: la tabla `mensajes` con RLS,
tope de 1.000 caracteres y freno de 20 mensajes cada 15 minutos, más **siete
funciones** `security definer` ya migradas al código de acceso. **Cero
llamadas** desde `socio.html`, `crm.html`, `espejo.html` y `nube.js`. Tres
semanas escrito y sin una sola pantalla que lo llamara — nadie se enteró porque
nada fallaba.

Y `legal/privacidad.html` se lo prometía al cliente en dos sitios (líneas 151 y
213), incluido el derecho a que se borre. O sea que el documento legal describía
una función que no existía. **Eso queda cumplido hoy.**

### Lo entregado

| Archivo | Qué es |
|---|---|
| `base/20260828b_chat.sql` | **PENDIENTE DE APLICAR.** La migración |
| `app/chat.js` | El módulo compartido: protocolo + presentación |
| `app/chat.css` | La hoja, compartida por las tres páginas |
| `app/socio.html` | Pestaña **Mensajes** del cliente |
| `panel/crm.html` | Sección **Mensajes**: bandeja, hilo, responder, borrar |
| `panel/espejo.html` | La misma bandeja, en el bolsillo |
| `pruebas/chat.test.js` | 20 pruebas nuevas |

**846 pruebas, 139 suites, 0 fallos.** `sw.js` sube a v18 y `VERSION_APP` a
`2026-08-28`.

### Las dos trampas que la migración cierra, y que no se veían

1. **El chat pedía cédula.** Buscaba `where cedula = ced`, pero la puerta de la
   app cambió el 20-ago a celular O cédula porque **solo 5 de 16 fichas tienen
   cédula**. Encenderlo tal cual habría dejado a ~11 de 16 clientes recibiendo
   el mismo `null` mudo que un impostor.
2. **La llave del socio cambia y los mensajes no se enteraban.**
   `sincronizar_socios` borra la fila vieja cuando a una ficha que subía por
   celular le cargan la cédula. Ese `delete` no tocaba `mensajes`: la
   conversación habría quedado colgando de una llave borrada y **desaparecido de
   la bandeja sin aviso**, meses después. Ahora los mensajes viajan en la misma
   transacción, antes del delete.

Y los permisos de las siete funciones quedan consolidados en ese archivo: `20260810`
hace `drop function` de dos de ellas y las reconcede **solo a `anon`**, así que
repegarlo —cosa que la idempotencia invita a hacer— habría dejado el chat abierto
para los clientes y cerrado para el Panel. **`20260810` ya no se corre suelto.**

### Lo que NO se hizo, dicho de frente

- **`visto_por_joan` no existe.** El plan la mencionaba; al escribirla se vio que
  sobra: un mensaje tiene un solo destinatario y el `visto` que ya había alcanza.
  Una segunda columna sería otra verdad sobre lo mismo.
- **`chat_olvidar` sigue detrás de la clave de sincronización, no de Auth.**
  Debe ir a `panel_es_dueno()`, y queda como deuda escrita en la migración: hoy
  `crm.html` habla con la nube por `anon` + clave, así que moverlo ahora no lo
  aseguraría — lo dejaría incallable desde el Panel. Se mueve cuando se mueva el
  Panel entero.
- **No hay globito de «sin leer» en la app del cliente.** La única función que
  sabe cuántos le faltan es `chat_leer`, y esa los MARCA como leídos: un globito
  alimentado con ella se apagaría solo antes de que él abriera nada.

### LO QUE FALTA, Y ES DE JOAN (5 minutos)

**Correr `base/20260828b_chat.sql`** en el SQL Editor de Supabase (New query →
pegar todo → Run). Sin eso, la pestaña Mensajes existe pero la base todavía
identifica por cédula y no admite los autores nuevos; la app avisa con todas las
letras (*«El chat todavía no está encendido en la base»*) en vez de fallar mudo.
Al final del archivo hay cuatro consultas para comprobar en 30 segundos que
quedó aplicado de verdad.
