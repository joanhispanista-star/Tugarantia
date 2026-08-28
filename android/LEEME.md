# El APK de Tu Garantía

Cómo convertir la app web en un `.apk` que el cliente descarga e instala en su
Android, **sin pasar por Google Play**. Fuera de la tienda, las políticas de Play
no aplican: esto es distribución directa y es perfectamente normal.

> **18-ago-2026 — el APK envuelve `app/socio.html`, la app real del socio.**
> Entre el 11 y el 18 de agosto envolvió `/play/` (el producto a 6 meses,
> inventado para poder entrar a la tienda), pero Play quedó descartado como
> canal: 12 probadores × 14 días más los huecos de `legal/` lo volvían un
> trámite sin fecha. Repartiendo directo, el producto que se envuelve es el
> que los clientes usan. La configuración de `/play/` vive en el historial de
> git por si la tienda se retoma.

---

## Antes de nada: la PWA ya hace casi todo esto, y mejor

Conviene saberlo antes de gastar la tarde, porque para tus clientes de hoy la PWA
gana en casi todo:

| | PWA (ya está lista) | APK |
|---|---|---|
| Icono propio en la pantalla | sí | sí |
| Pantalla completa, sin barra del navegador | sí | sí |
| Funciona sin señal | sí | sí |
| Se actualiza sola | **sí** | el contenido sí, el envoltorio no |
| Pantalla de "app desconocida" al instalar | **no** | **sí** |
| Aviso de Play Protect | **no** | **a veces** |
| Se puede mandar por WhatsApp | sí, un enlace | **no**, WhatsApp bloquea los .apk |

**El aviso de Play Protect es el punto que más pesa.** Android puede mostrar
"esta app no es segura" o "app desconocida" al instalar un APK que no viene de la
tienda. En una app de plata, esa pantalla le cuesta la confianza a un cliente que
apenas te la está dando. Con la PWA no aparece nunca.

Lo que el APK sí te da: un archivo que existe, que se puede guardar y pasar, y la
sensación de "app de verdad". Si eso vale para tu venta, aquí está el camino.

Se pueden tener las dos. Son el mismo código.

---

## Lo que hace falta antes de construir

**1. La app tiene que estar en HTTPS.** No hay vuelta: un APK de este tipo (TWA)
es un envoltorio que abre tu sitio web. Sin sitio, no hay nada que envolver.

Enciende GitHub Pages: **Settings → Pages → rama `main`, carpeta `/ (root)`**.
Queda en `https://tugarantia.net/` (la direccion vieja de github.io redirige sola).

**2. Node.** Ya lo tienes (v22).

**3. Java y el SDK de Android.** No los tienes, y **no hace falta instalarlos a
mano**: Bubblewrap los descarga solo la primera vez. Son cerca de 1,5 GB y unos
15 minutos con buena conexión. Solo pasa una vez.

---

## Construirlo

**No desde esta carpeta.** Gradle dentro de OneDrive pelea con la sincronización
por los bloqueos de archivo (medido el 14-ago-2026), así que el proyecto Android
vive fuera, en `C:\Users\joanh\android-kit\proyecto`, con el JDK y el SDK al lado
y los parches de esta máquina ya aplicados:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\joanh\android-kit\construir-apk-socio.ps1
```

El script copia `twa-manifest.json` y la llave de aquí, construye allá, y trae el
APK de vuelta a esta carpeta. El veredicto son archivos frescos, no el mensaje
de gradle. (`construir.ps1`, el viejo que corría aquí adentro, queda de
referencia de las respuestas del `init`; no lo uses para construir.)

La primera vez te va a preguntar cosas. Las respuestas que importan:

- **Domain / URL del manifest** — ya va puesta en `twa-manifest.json`.
- **Application ID** — `co.tugarantia.socio`. **No lo cambies nunca después.**
  Android identifica la app por ese texto: si cambia, el teléfono la trata como
  otra app distinta y la instalada se queda muerta al lado de la nueva.
- **Key store password / key password** — invéntate una y **anótala en papel**.
  Ver abajo por qué.

Al terminar quedan `app-release-signed.apk` (el que mandas) y `app-release-bundle.aab`
(el que pediría Play, si algún día).

---

## ⚠️ La llave de firma: esto es lo único irreversible

Al construir se crea `android.keystore`. Esa llave **es** la identidad de tu app.

- Si la pierdes, **no puedes volver a publicar una actualización**. Tus clientes
  tendrían que desinstalar y volver a instalar, y perderían la sesión.
- Está en `.gitignore` a propósito: es un secreto y este repositorio es público.
- **Guárdala en dos sitios que no sean este computador.** Un correo a ti mismo y
  una USB sirven. La contraseña, en papel, aparte.

---

## Cómo se lo mandas al cliente

**WhatsApp no deja enviar archivos `.apk`.** Bloquea la extensión. Por eso el
APK se reparte desde el propio sitio: vive en `descargas/TuGarantia.apk` (la
única excepción al `.gitignore` de binarios, con su porqué escrito ahí), y lo
que se manda por WhatsApp es el enlace a la página:

    https://tugarantia.net/descargas/

La página ya trae las instrucciones — incluido el aviso de «app desconocida»
explicado ANTES de que le salga al cliente, que es lo que decide si instala o se
echa para atrás. No hace falta dictarle nada por WhatsApp: se manda el enlace.

Cuando se reconstruye el APK (cambio de icono, de nombre o de dirección — el
contenido NO: ese se actualiza solo por la web), se vuelve a copiar encima:

```powershell
Copy-Item .\app-release-signed.apk ..\descargas\TuGarantia.apk -Force
```

y `git add descargas`, commit y push. GitHub Releases habría servido igual, pero
en esta máquina no hay `gh` y arrastrar archivos a mano es un paso que se olvida;
el commit no.

---

## Actualizar

Aquí está lo bueno del TWA: **el contenido se actualiza solo.** Cambias
`socio.html`, haces `git push`, y todos los que tienen el APK ven la versión
nueva la próxima vez que abran. No hay que reconstruir ni reenviar nada.

Solo hay que volver a construir y reenviar el APK si cambia el icono, el nombre
de la app o la dirección del sitio.

**Y si ese día llega, ojo:** la página de `descargas/` le promete al cliente que
nunca tiene que volver a descargar nada, y un APK repartido fuera de la tienda
no tiene canal para avisar que hay envoltorio nuevo. Cambiar el envoltorio
exige campaña de re-descarga por WhatsApp a los que ya lo tienen — es la única
forma de que se enteren.

---

## Cuando algo sale mal

**Sale la barra de direcciones del navegador arriba.** Falló Digital Asset Links:
el archivo `assetlinks.json` no está donde Android mira, o la huella no coincide
con la llave con la que firmaste. Y ojo con el **donde**, que ya nos pasó dos
veces: Android consulta la **raíz del dominio del APK**, no la carpeta del
sitio.

Desde el dominio propio (APK v3, host `tugarantia.net`) el apretón de manos vive
en casa: `https://tugarantia.net/.well-known/assetlinks.json`, servido por el
`.well-known/` de ESTE repositorio. Verificado en vivo el 28-ago-2026: responde
200 con la huella `E5:FB:DE:62…`.

Los APK **v2 y anteriores** se firmaron con host `joanhispanista-star.github.io`,
y para ésos Android sigue mirando
`https://joanhispanista-star.github.io/.well-known/assetlinks.json` — que lo
sirve el repositorio del sitio de usuario (el del juego), NO este. Ahí la
entrada de `co.tugarantia.socio` convive con la del paquete del juego. Se deja
viva mientras haya teléfonos con el APK viejo instalado; el día que se refirme
con otra llave, la huella se actualiza en LOS DOS sitios.

**"App no instalada".** Casi siempre es que ya hay una versión instalada firmada
con otra llave. Desinstalar y volver a instalar.

**Play Protect lo bloquea.** Toca "Más detalles" → "Instalar de todos modos". Si
lo bloquea a mucha gente, esa es la señal de que la PWA es el camino y el APK no.

**Abre en blanco.** El sitio no responde o no es HTTPS. Ábrelo primero en Chrome
en el mismo teléfono: si ahí falla, el APK no lo va a arreglar.
