# El APK de Tu Garantía

Cómo convertir la app web en un `.apk` que el cliente descarga e instala en su
Android, **sin pasar por Google Play**. Fuera de la tienda, las políticas de Play
no aplican: esto es distribución directa y es perfectamente normal.

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
Queda en `https://joanhispanista-star.github.io/Tugarantia/`.

**2. Node.** Ya lo tienes (v22).

**3. Java y el SDK de Android.** No los tienes, y **no hace falta instalarlos a
mano**: Bubblewrap los descarga solo la primera vez. Son cerca de 1,5 GB y unos
15 minutos con buena conexión. Solo pasa una vez.

---

## Construirlo

Desde la carpeta `android/`:

```powershell
powershell -ExecutionPolicy Bypass -File .\construir.ps1
```

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

**WhatsApp no deja enviar archivos `.apk`.** Bloquea la extensión. Así que:

1. Sube el APK a **GitHub → Releases** del repositorio (arrastrar y soltar).
2. Copia el enlace de descarga.
3. Eso es lo que mandas por WhatsApp, con estas instrucciones:

> Descarga el archivo y ábrelo. Android te va a preguntar si permites instalar
> apps de esta fuente: dile que sí. Si sale un aviso de que la app es
> desconocida, toca "Instalar de todos modos". Es normal: la app no está en la
> tienda de Google, viene directo de nosotros.

Que se lo digas **antes** de que le salga el aviso cambia todo: un cliente
prevenido instala, uno sorprendido se echa para atrás.

---

## Actualizar

Aquí está lo bueno del TWA: **el contenido se actualiza solo.** Cambias
`socio.html`, haces `git push`, y todos los que tienen el APK ven la versión
nueva la próxima vez que abran. No hay que reconstruir ni reenviar nada.

Solo hay que volver a construir y reenviar el APK si cambia el icono, el nombre
de la app o la dirección del sitio.

---

## Cuando algo sale mal

**Sale la barra de direcciones del navegador arriba.** Falló Digital Asset Links:
el archivo `assetlinks.json` no está en el sitio, o la huella no coincide con la
llave con la que firmaste. El script lo genera; hay que subirlo a
`/.well-known/assetlinks.json` en la raíz del sitio y esperar unos minutos. Ojo:
Bubblewrap ya **no** lo pone solo, hay que subirlo a mano.

**"App no instalada".** Casi siempre es que ya hay una versión instalada firmada
con otra llave. Desinstalar y volver a instalar.

**Play Protect lo bloquea.** Toca "Más detalles" → "Instalar de todos modos". Si
lo bloquea a mucha gente, esa es la señal de que la PWA es el camino y el APK no.

**Abre en blanco.** El sitio no responde o no es HTTPS. Ábrelo primero en Chrome
en el mismo teléfono: si ahí falla, el APK no lo va a arreglar.
