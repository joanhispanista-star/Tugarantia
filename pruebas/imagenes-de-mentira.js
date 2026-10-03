/* ============================================================================
 * IMÁGENES DE MENTIRA PARA MEDIR FOTOS — 2 de octubre de 2026
 *
 * No es un archivo de pruebas (por eso no se llama .test.js): son las fábricas
 * de imágenes SINTÉTICAS y deterministas con que se prueba la medida de las
 * fotos de app/revision-registro.js. Ninguna foto de nadie entra al
 * repositorio.
 *
 * La tarjeta, la selfie, la caja y el grano son los mismos de
 * pruebas/revision-registro.test.js (de ahí salieron los primeros umbrales).
 * Se agregan dos cosas que aquel no tenía y que la revisión adversaria del
 * 2-oct mostró que la medida no veía:
 *   · movida(): el pulso de la mano corre la foto en UNA dirección. Los bordes
 *     paralelos al movimiento quedan nítidos y engañaban a la medida vieja.
 *   · con poca luz o poco contraste, una tarjeta NÍTIDA salía «borrosa»
 *     porque la medida vieja crecía con el contraste al cuadrado.
 * ==========================================================================*/
'use strict';

function azar(semilla) { let s = semilla >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* Una tarjeta del tamaño en que la guarda la app: fondo de guilloche, una foto
   lisa a la izquierda y seis renglones de letra. */
function tarjeta(w, h, contraste) {
  const r = azar(3), g = new Float64Array(w * h), fx = w / 640;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 185 + 8 * Math.sin(x / 4.4 + 2 * Math.sin(y / 24));
  for (let y = Math.round(80 * fx); y < Math.round(330 * fx); y++) {
    for (let x = Math.round(30 * fx); x < Math.round(210 * fx); x++) g[y * w + x] = 120 + 30 * Math.sin(x / (25 * fx)) * Math.cos(y / (30 * fx));
  }
  for (let k = 0; k < 6; k++) {
    const y0 = Math.round((60 + k * 45) * fx); let x = Math.round(240 * fx);
    while (x < w - 40 * fx) {
      const cw = Math.round((4 + Math.floor(r() * 6)) * fx), ch = Math.round((10 + Math.floor(r() * 4)) * fx), t = Math.max(2, Math.round(2 * fx));
      for (let y = y0; y < y0 + ch; y++) for (let xx = x; xx < x + cw; xx++) {
        if (y < y0 + t || y >= y0 + ch - t || xx < x + t || xx >= x + cw - t) g[y * w + xx] = 185 - contraste;
      }
      x += cw + Math.round((2 + (r() < 0.15 ? 8 : 0)) * fx);
    }
  }
  return g;
}

/* Una selfie: fondo con un marco de puerta, la cara, pelo en hebras, ojos,
   cejas y boca. */
function selfie(w, h) {
  const r = azar(11), g = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 140 + 30 * Math.sin(y / 90) + (x % 160 < 4 ? -50 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (w * 0.28), dy = (y - h / 2) / (h * 0.34);
    if (dx * dx + dy * dy < 1) g[y * w + x] = 175 - 25 * dy - 10 * dx * dx;
  }
  for (let k = 0; k < 400; k++) {
    let x = w / 2 + (r() - 0.5) * w * 0.6, y = h * 0.18 + r() * h * 0.08;
    for (let t = 0; t < 40; t++) { x += (r() - 0.5) * 2; y += 1; const i = Math.round(y) * w + Math.round(x); if (i >= 0 && i < g.length) g[i] = 40 + r() * 30; }
  }
  const elipse = (cx, cy, rx, ry, v) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const a = (x - cx) / rx, b = (y - cy) / ry; if (a * a + b * b <= 1) g[y * w + x] = v;
    }
  };
  [0.4, 0.6].forEach(f => {
    elipse(w * f, h * 0.44, 22, 9, 235); elipse(w * f, h * 0.44, 8, 8, 30); elipse(w * f + 3, h * 0.44 - 3, 2, 2, 250);
    for (let i = 0; i < 40; i++) {
      const x = Math.round(w * f - 25 + i * 1.2);
      g[Math.round(h * 0.40 - Math.sin(i / 12) * 4) * w + x] = 50; g[Math.round(h * 0.40 - Math.sin(i / 12) * 4 + 1) * w + x] = 60;
    }
  });
  elipse(w * 0.5, h * 0.64, 34, 7, 110); elipse(w * 0.5, h * 0.64, 30, 2, 70);
  return g;
}

/* Desenfoque de caja de (2·rad+1) px, en los dos ejes: fuera de foco. */
function caja(g, w, h, rad) {
  const t = new Float64Array(w * h), o = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0; for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += g[y * w + xx]; n++; } } t[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0; for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } } o[y * w + x] = s / n;
  }
  return o;
}

/* El pulso de la mano: la foto corrida `largo` px en UNA dirección (dx, dy),
   promediando a lo largo del trazo. Lo que es paralelo al trazo queda nítido. */
function movida(g, w, h, largo, dx, dy) {
  const o = new Float64Array(w * h), n = Math.max(1, largo), ux = dx || 0, uy = dy || 0;
  const norma = Math.hypot(ux, uy) || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k < n; k++) {
      const t = k - (n - 1) / 2;
      const xx = Math.min(w - 1, Math.max(0, Math.round(x + t * ux / norma)));
      const yy = Math.min(h - 1, Math.max(0, Math.round(y + t * uy / norma)));
      s += g[yy * w + xx];
    }
    o[y * w + x] = s / n;
  }
  return o;
}

/* El grano del sensor con poca luz. */
function ruido(g, sigma, semilla) {
  const r = azar(semilla);
  return g.map(v => Math.max(0, Math.min(255, v + (r() + r() + r() - 1.5) * sigma * 2)));
}

/* La misma foto con menos luz: todo multiplicado por `f` (la letra sigue igual
   de nítida, solo más oscura). */
function oscurecer(g, f) { return g.map(v => v * f); }

module.exports = { azar, tarjeta, selfie, caja, movida, ruido, oscurecer };
