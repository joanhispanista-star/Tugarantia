/* ============================================================================
 * CALIBRAR LAS FRANJAS DEL OCR CON UNA CÉDULA DE VERDAD — 21-oct-2026
 *
 *   node herramientas/calibrar-ocr.js <foto.pgm[.gz]> <frente|reverso> [x,y,w,h] [--giro=180]
 *
 * POR QUÉ EXISTE. Las franjas de app/ocr-cedula.js (ZONAS) salen del diseño
 * público de la cédula amarilla, no de una tarjeta medida; la prueba de punta
 * a punta usa una cédula FABRICADA con esas mismas medidas, así que prueba el
 * camino, no que las franjas caigan donde caen en una de verdad. Esto es lo
 * que falta: con la foto de UNA cédula real, ver qué lee cada franja.
 *
 * QUÉ HACE, sin red y sin navegador: corre el Tesseract.js COPIADO
 * (app/lib/ocr, con pruebas/banco-ocr.js), recorta las franjas como el
 * teléfono, y escribe en la consola lo que leyó cada una con cada variante y
 * los campos que salen. Y deja al lado de la foto un .zonas.pgm con las
 * franjas dibujadas, para mirarlas.
 *
 * LA FOTO: la tarjeta derecha (acostada, el texto horizontal), en gris PGM.
 * Con Python y Pillow, desde la foto del CRM (900 px):
 *   python -c "from PIL import Image; Image.open('respaldo.jpg').convert('L').save('respaldo.pgm')"
 * `x,y,w,h` es dónde está la TARJETA dentro de la foto (sus bordes). Sin eso,
 * la foto entera hace de tarjeta, que es lo que pasa si se recorta justo.
 *
 * ESTO LEE EL RH Y EL SEXO SI LAS FRANJAS ESTÁN MAL PUESTAS: es justo lo que
 * hay que ver. Lo que imprime no se guarda en ningún lado; usarlo con la
 * cédula propia (o de alguien que lo autorice) y borrar la foto al terminar.
 * ==========================================================================*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const O = require(path.join(RAIZ, 'app', 'ocr-cedula.js'));
const { abrirTesseract, leerPGM } = require(path.join(RAIZ, 'pruebas', 'banco-ocr.js'));

async function principal() {
  const [archivo, lado, guiaTxt] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const giro = process.argv.includes('--giro=180') ? 180 : 0;
  if (!archivo || !O.ZONAS[lado]) {
    console.log('Uso: node herramientas/calibrar-ocr.js <foto.pgm[.gz]> <frente|reverso> [x,y,w,h] [--giro=180]');
    process.exit(1);
  }
  const img = leerPGM(archivo);
  const g = guiaTxt ? guiaTxt.split(',').map(Number) : [0, 0, img.w, img.h];
  const guia = { x: g[0], y: g[1], w: g[2], h: g[3] };
  const rec = O.recortarDeGris(lado, img.gris, img.w, img.h, { giro, guia });
  if (!rec) throw new Error('no se pudo recortar: ¿la foto es un PGM de ese tamaño?');

  /* Las franjas dibujadas: un marco negro y blanco alrededor de cada una. */
  const marcado = img.gris.slice();
  O.ZONAS[lado].forEach(z => {
    const r = O.rectDeZona(z, guia, giro, img.w, img.h);
    for (let x = r.x; x < r.x + r.w; x++) for (const y of [r.y, r.y + 1, r.y + r.h - 2, r.y + r.h - 1]) {
      if (y >= 0 && y < img.h) marcado[y * img.w + x] = (x >> 2) % 2 ? 0 : 255;
    }
    for (let y = r.y; y < r.y + r.h; y++) for (const x of [r.x, r.x + 1, r.x + r.w - 2, r.x + r.w - 1]) {
      if (x >= 0 && x < img.w) marcado[y * img.w + x] = (y >> 2) % 2 ? 0 : 255;
    }
    console.log('franja', z.id, '→ x', r.x, 'y', r.y, 'w', r.w, 'h', r.h);
  });
  const salida = archivo.replace(/\.pgm(\.gz)?$/, '') + '.zonas.pgm';
  fs.writeFileSync(salida, Buffer.from(O.aPGM(marcado, img.w, img.h)));
  console.log('las franjas dibujadas:', salida);

  const b = abrirTesseract();
  try {
    const lector = await O.crearLector(b.Tesseract, O.rutas('../app/'));
    for (const z of rec.zonas) {
      for (const v of ['A', 'B', 'C']) {
        const p = O.preparar(z, rec.ancho, v);
        /* 26-oct-2026 — desde que el frente se toma de pie, crearLector da
           {texto, confianza} (la confianza desempata el frente derecho del
           girado, ver leerRecorte); antes daba el texto solo. Esta herramienta
           llama a leer directamente y se quedó con la forma vieja: reventaba en
           la primera franja con «t.trim is not a function». Se aceptan las dos,
           como en leerRecorte, y la confianza se imprime: es lo que hay que
           mirar cuando las dos posiciones empatan en campos. */
        const t = await lector.leer(O.aPGM(p.gris, p.w, p.h), { lista: z.lista, psm: z.psm });
        const texto = typeof t === 'string' ? t : String((t && t.texto) || '');
        const conf = t && typeof t === 'object' && isFinite(t.confianza) ? ' (confianza ' + Math.round(t.confianza) + ')' : '';
        console.log('\n[' + z.id + ' · ' + v + ']' + conf + '\n' + texto.trim());
      }
    }
    const t0 = Date.now();
    const r = await O.leerRecorte(lector, rec, {});
    console.log('\nCAMPOS (con consenso y validados):', JSON.stringify(r.campos), '·', Date.now() - t0, 'ms,', r.lecturas, 'lecturas');
    /* El frente se lee en las dos posiciones: en cuál salieron las letras
       (0, 180, o null si en ninguna). Con --giro=180 la «derecha» ya es la
       girada, así que 0 aquí quiere decir «como se pidió». */
    if (rec.lado === 'frente') console.log('GIRO (dónde salieron las letras):', r.giro);
    await lector.terminar();
  } finally { await b.cerrar(); }
}

principal().catch(e => { console.error(e && e.message ? e.message : e); process.exit(1); });
