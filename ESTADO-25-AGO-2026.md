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
