# De dónde salió lo que hay en esta carpeta

Copias fijas de dos bibliotecas de terceros. Viven en el sitio, no en un CDN,
por dos razones que no son de gusto:

1. **Data Safety (Google Play).** La app declara que no llama a ningún servidor
   que no sea el suyo, y `pruebas/cumplimiento.test.js` lo vigila: un dominio
   nuevo en `play/index.html` hace caer la prueba.
2. **El CRM tiene toda la cartera en memoria.** Un script que venga de un
   servidor ajeno podría leerla. Una copia fija en el repositorio no cambia sin
   que quede en el historial.

| Carpeta / archivo | Qué es | Versión | Licencia | Quién lo usa |
|---|---|---|---|---|
| `zxing.min.js` | Lector de códigos de barras (PDF417 de la cédula amarilla) | `@zxing/library` 0.21.3 (`umd/index.min.js`) | MIT | `play/index.html`, paso «Tu cédula» |
| `rostro/face-api.js` | Detección y reconocimiento facial (TensorFlow.js incluido) | `@vladmandic/face-api` 1.7.13 (`dist/face-api.js`) | MIT | `panel/crm.html`, botón «Comparar con la cédula»; y desde el 8-oct-2026 `app/rostro-en-vivo.js` (la selfie de `play/`), solo con el detector |
| `rostro/tiny_face_detector_model.*` | Modelo: dónde está la cara | ídem | MIT | CRM, y la selfie de `play/` (8-oct-2026) |
| `rostro/face_landmark_68_tiny_model.*` | Modelo: ojos, nariz, boca | ídem | MIT | CRM |
| `rostro/face_recognition_model.*` | Modelo: el vector con el que se comparan dos caras | ídem | MIT | CRM |

**El teléfono carga `rostro/` desde el 8-oct-2026, pero SOLO el detector.**
Joan pidió que la selfie se tome sola cuando la cara esté centrada y enfocada.
`app/rostro-en-vivo.js` baja `face-api.js` y **únicamente**
`tiny_face_detector_model` (dónde hay una cara: una caja y un puntaje), en el
paso del rostro de `play/`, que solo existe con la autorización de datos
sensibles. Los otros dos modelos —los puntos de la cara y el vector con que se
comparan dos caras— siguen siendo solo del CRM. La caja no se guarda ni sale
del teléfono: lo único que sube es la foto. `pruebas/selfie-automatica.test.js`
se cae si el teléfono pide otro modelo o si la página vuelve a nombrar la
librería por fuera del módulo; `cumplimiento.test.js` y `cuenta.test.js` siguen
vigilando que `play/` no mencione nada de lo que sería biometría.

Antes (hasta el 8-oct-2026) el teléfono no cargaba `rostro/`: el escáner
dibujaba y disparaba por encuadre. Ese encuadre se quedó como respaldo para
cuando el detector no alcanza a bajar.

Para actualizar: bajar la misma ruta del paquete en la versión nueva, cambiar
esta tabla y subir `CACHE` en `sw.js`.
