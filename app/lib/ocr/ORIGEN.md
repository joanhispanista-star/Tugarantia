# De dónde salió lo que hay en esta carpeta (el lector de letras)

21 de octubre de 2026. Copias fijas de **Tesseract.js 7** y del modelo del
español, para que `play/` lea las letras impresas de la cédula (la fecha de
expedición, y el número y los nombres cuando el código de barras no se lee).
Lo usa `app/ocr-cedula.js`; ver ese archivo para el porqué y las reglas.

Viven en el sitio y no en un CDN por las mismas dos razones que `../ORIGEN.md`:
la app declara que no llama a ningún servidor ajeno (Data Safety y
`legal/privacidad.html`: «los programas que leen tu cédula … se descargan de
nuestra propia página … y corren en tu celular»), y una copia fija no cambia
sin dejar rastro en el historial.

**La trampa:** Tesseract.js, si no se le dicen las rutas, baja el worker, el
núcleo y el idioma de `cdn.jsdelivr.net`. Las tres URL por defecto están
escritas DENTRO de `tesseract.min.js` y `worker.min.js` (no se pueden quitar
sin recompilar). Por eso `app/ocr-cedula.js` pasa SIEMPRE `workerPath`,
`corePath` y `langPath`, y `pruebas/ocr-cedula.test.js` corre estos mismos
archivos en Node y se cae si se pide algo fuera de `app/lib/ocr/`.

| Archivo | Qué es | De dónde (registro de npm) | Licencia | sha256 |
|---|---|---|---|---|
| `tesseract.min.js` | La librería de la página (crea el worker) | `tesseract.js@7.0.0`, `dist/tesseract.min.js` | Apache-2.0 | `000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e` |
| `worker.min.js` | El worker (corre aparte del hilo de la página) | `tesseract.js@7.0.0`, `dist/worker.min.js` | Apache-2.0 | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| `tesseract-core-simd-lstm.wasm.js` | El motor (Tesseract 5 en WebAssembly, con SIMD, solo LSTM) | `tesseract.js-core@7.0.0` | Apache-2.0 | `c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38` |
| `tesseract-core-lstm.wasm.js` | El mismo motor sin SIMD (iPhone antes de iOS 16.4, Android muy viejo) | `tesseract.js-core@7.0.0` | Apache-2.0 | `eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680` |
| `spa.traineddata.gz` | El modelo del español, «best_int» (solo LSTM) | `@tesseract.js-data/spa@1.0.0`, `4.0.0_best_int/spa.traineddata.gz` | MIT el paquete; el modelo viene de `tesseract-ocr/tessdata_best` (Apache-2.0) | `40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb` |
| `tesseract.min.js.LICENSE.txt`, `worker.min.js.LICENSE.txt` | Avisos de licencia de lo que va empaquetado adentro (regenerator, buffer, zlib.js: MIT y BSD-3) | `tesseract.js@7.0.0`, `dist/` | — | — |
| `LICENSE-tesseract.js.md`, `LICENSE-tesseract.js-core.txt` | Las licencias Apache-2.0 de los dos paquetes | `LICENSE.md` y `LICENSE` de cada paquete | — | — |

Los paquetes se bajaron con `npm pack` el 21-oct-2026 (sin instalar nada ni
correr scripts). Las sumas de los tres `.tgz`, por si hay que comprobarlos:

- `tesseract.js-7.0.0.tgz` — sha1 `4106fb6245efab40c57b94bc1798368807526be8`
- `tesseract.js-core-7.0.0.tgz` — sha1 `596aa1ab5c130adab12f21059e6aa1a1cecc0bab`
- `tesseract.js-data-spa-1.0.0.tgz` — sha1 `8cd3c04f10519916a6b85101001c4628a1a0a257`

## Cuánto pesa, y quién lo paga

Unos **6 MB la primera vez** (el núcleo 3,9 MB y el español 2,1 MB, más 175 KB
de la librería y el worker), y solo para quien escanea su cédula: `play/` los
pide con `rel=prefetch` cuando se dispara el respaldo, mientras la persona
voltea la tarjeta. NO están en la precarga de `sw.js` (le costarían esos datos
a cada socio que abre la app). Se baja UNO de los dos núcleos: el de SIMD si el
navegador lo tiene (`OcrCedula.haySimd`), el otro si no. No se guarda nada en
IndexedDB (`cacheMethod: 'none'`): queda en la caché del navegador como
cualquier archivo del sitio.

## Por qué estos y no otros

- Sin el núcleo «relaxed SIMD» ni los de motor viejo (no-LSTM): el worker los
  escogería solo si se le diera una carpeta; aquí se le da el archivo exacto,
  y son 3,9-4,7 MB más cada uno en el repositorio sin uso.
- `best_int` y no `4.0.0` (8,4 MB, con el motor viejo) ni `fast`: es el que
  Tesseract.js usa por defecto para LSTM, el más chico con buena precisión.
- Ninguna lectura en la nube (Google Vision, AWS): la foto lleva la cara y el
  RH, y la política dice que nada de eso sale del teléfono (investigación del
  21-oct, result.ocr punto 3d).

## Para actualizar

Bajar con `npm pack` las versiones nuevas, copiar los mismos archivos,
cambiar esta tabla (versiones y sha256: `pruebas/ocr-cedula.test.js` compara
las sumas) y correr esa prueba, que lee una cédula fabricada de punta a punta
con los archivos nuevos. Y que quien publique suba `CACHE` en `sw.js`.
