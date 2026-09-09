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
| `rostro/face-api.js` | Detección y reconocimiento facial (TensorFlow.js incluido) | `@vladmandic/face-api` 1.7.13 (`dist/face-api.js`) | MIT | `panel/crm.html`, botón «Comparar con la cédula» |
| `rostro/tiny_face_detector_model.*` | Modelo: dónde está la cara | ídem | MIT | CRM |
| `rostro/face_landmark_68_tiny_model.*` | Modelo: ojos, nariz, boca | ídem | MIT | CRM |
| `rostro/face_recognition_model.*` | Modelo: el vector con el que se comparan dos caras | ídem | MIT | CRM |

**El teléfono no carga `rostro/`.** El escáner del registro dibuja (óvalo,
anillos en los ojos, malla, cuenta regresiva) y dispara solo: no detecta ni mide
nada del rostro. Comparar la selfie con la foto de la cédula lo hace el CRM de
Joan, en su computador, y el resultado (un porcentaje) no sale de ahí ni se
guarda como plantilla biométrica. Si algún día el teléfono cargara `rostro/`,
cambia la declaración de Data Safety y la Ley 1581 pasa a tratar el dato como
sensible: `cumplimiento.test.js` se cae a propósito.

Para actualizar: bajar la misma ruta del paquete en la versión nueva, cambiar
esta tabla y subir `CACHE` en `sw.js`.
