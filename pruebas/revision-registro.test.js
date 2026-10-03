'use strict';
/* ==========================================================================
 * LA REVISIÓN DE UN REGISTRO — 2 de octubre de 2026
 *
 * Vigila app/revision-registro.js: las nueve reglas que dejan a cada
 * registrado en «Para mirar, y por qué» o en «Sin nada que mirar».
 *
 * LO QUE NO SE PUEDE ROMPER, y por eso hay una prueba para cada cosa:
 *   · «sin_codigo» es la mayoría y NO es una sospecha: nunca sale en «para
 *     mirar», ni solo ni acompañado.
 *   · Ningún texto dice «verificado», «aprobado», «confiable» ni lleva un
 *     palomito. Las reglas que no encuentran nada dicen eso: que no
 *     encontraron nada.
 *   · Lo que escribió quien se registró puede ser cualquier cosa: nada
 *     revienta y nada de marcado vuelve en los textos.
 *   · No toca lo que recibe, no mira el reloj ni la red.
 *   · Lo que sale de comparar rostros se puede quitar entero (sinBiometria).
 *   · Los nombres de campo que lee existen de verdad en la base y en la app.
 *
 * Las imágenes de las pruebas de nitidez son SINTÉTICAS y deterministas
 * (mismo generador que midió los umbrales): ninguna foto de nadie entra al
 * repositorio.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const R = require('../app/revision-registro.js');

const HOY = '2026-10-02';

/* ----------------------------------------------------------- fábricas --- */

/* Un registro de la bandeja como lo devuelve listar_registros, sin nada raro:
   mayor de edad, celular bien formado, dos referencias de otros números. */
function registro(extra) {
  const base = {
    id: 101,
    codigo: '',
    origen: 'abierto',
    estado: 'nuevo',
    nombre: 'Ana Ruiz',
    cedula: '1018447274',
    telefono: '3001112233',
    creado_en: '2026-09-30T15:00:00+00:00',
    datos: {
      nombres: 'Ana', apellidos: 'Ruiz', tipo_doc: 'Cédula de ciudadanía',
      documento: '1018447274', expedicion: '2010-06-01', celular: '3001112233',
      ref1_nombre: 'Luis', ref1_parentesco: 'Hermano', ref1_celular: '3104445566',
      ref2_nombre: 'Marta', ref2_parentesco: 'Compañera', ref2_celular: '3157778899'
    },
    huella: {
      ip: '181.50.1.2, 10.0.0.1',
      aparato: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
      momento: '2026-09-30T15:01:00+00:00',
      cedula_leida: { documento: '1018447274', nombres: 'ANA', apellidos: 'RUIZ', nacimiento: '1990-05-14', lectura: 'anchos_fijos' },
      cotejo: { estado: 'intacto', documento: 'igual', nombre: 'igual', edad: 'mayor', tipo_doc: 'coherente',
                lectura: 'anchos_fijos', visto: { anos: 36, nacimiento: '1990-05-14' }, nivel: 'app', repetida: false }
    }
  };
  return Object.assign(base, extra || {});
}
/* Otro registro, distinto en todo salvo lo que se le pase. Su formulario dice
   lo mismo que su fila, como lo manda la app. */
function otro(extra) {
  const e = extra || {};
  const ced = 'cedula' in e ? e.cedula : '52111222', tel = 'telefono' in e ? e.telefono : '3209990000';
  return Object.assign({
    id: 202, estado: 'nuevo', nombre: 'Pedro Pérez', cedula: ced, telefono: tel,
    creado_en: '2026-09-28T14:00:00+00:00', datos: { documento: ced, celular: tel }
  }, e);
}
function conDatos(r, datos) { return Object.assign({}, r, { datos: Object.assign({}, r.datos, datos) }); }
function conHuella(r, h) { return Object.assign({}, r, { huella: Object.assign({}, r.huella, h) }); }
function conCotejo(r, cot) { return conHuella(r, { cotejo: cot }); }

const claves = res => res.para_mirar.map(x => x.clave);
const neutros = res => res.neutros.map(x => x.clave);
const sinDatos = res => res.reglas_sin_datos.filter(x => !x.parcial).map(x => x.clave);
const de = (res, regla) => res.para_mirar.filter(x => x.regla === regla);

/* Todos los textos de una revisión, para las invariantes. */
function textos(v, out) {
  out = out || [];
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => textos(x, out));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => textos(v[k], out));
  return out;
}

/* ------------------------------------------------- imágenes sintéticas --- */

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
/* Desenfoque de caja de (2·rad+1) px, en los dos ejes: una foto movida o fuera de foco. */
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
/* El grano del sensor con poca luz. */
function ruido(g, sigma, semilla) {
  const r = azar(semilla);
  return g.map(v => Math.max(0, Math.min(255, v + (r() + r() + r() - 1.5) * sigma * 2)));
}

/* ======================================================================= */

describe('el módulo es puro y corre en todas partes', () => {
  const FUENTE = leer('app/revision-registro.js');
  /* Sin comentarios: lo que se vigila es el código que corre, no la cabecera
     que explica por qué no se usa el reloj. */
  const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

  test('ni DOM, ni red, ni almacenamiento, ni reloj, ni azar', () => {
    ['document.', 'window.', 'navigator', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage',
     'indexedDB', 'Date.now', 'new Date()', 'Math.random', 'require(', 'import ']
      .forEach(prohibido => assert.ok(!CODIGO.includes(prohibido), 'el módulo usa ' + prohibido));
  });

  test('carga como script de página (sin module) y deja RevisionRegistro', () => {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(FUENTE, ctx);
    assert.equal(typeof ctx.RevisionRegistro.revisarRegistro, 'function');
    assert.equal(ctx.RevisionRegistro.VERSION, '2026-10-02');
  });

  test('los umbrales no se pueden cambiar desde afuera', () => {
    assert.ok(Object.isFrozen(R.UMBRALES));
    assert.ok(Object.isFrozen(R.UMBRALES.NITIDEZ_MIN));
  });

  test('el mismo registro da siempre la misma revisión', () => {
    const a = R.revisarRegistro(registro(), { otros: [otro()], hoy: HOY });
    const b = R.revisarRegistro(registro(), { otros: [otro()], hoy: HOY });
    assert.deepEqual(a, b);
  });
});

describe('los nombres de campo existen de verdad (no se inventan)', () => {
  const FUENTE = leer('app/revision-registro.js');
  const BASE = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => f.endsWith('.sql')).map(f => leer('base/' + f)).join('\n');

  test('las columnas de la bandeja', () => {
    const tabla = leer('base/supabase.sql');
    const def = tabla.slice(tabla.indexOf('create table if not exists public.registros'));
    ['cedula', 'telefono', 'datos', 'estado', 'creado_en'].forEach(c =>
      assert.match(def.slice(0, 600), new RegExp('\\b' + c + '\\b'), 'registros no tiene ' + c));
    assert.match(leer('base/20260908b_registro_archivos.sql'), /add column if not exists huella jsonb/);
  });

  test('lo que guarda la huella y el cotejo', () => {
    ["'ip'", "'aparato'", "'cedula_leida'", "'cotejo'", "'cotejo_foto'", "'repetida'", "'otros_registros'",
     "'ya_es_socio_con_otro_celular'", "'documento_codigo'", "'documento_escrito'", "'nombre_codigo'",
     "'nombre_escrito'", "'tipo_doc_escrito'", "'anos'", "'nacimiento'", "'nivel'"]
      .forEach(k => {
        assert.ok(BASE.includes(k), 'la base no escribe ' + k);
        assert.ok(FUENTE.includes(k), 'el módulo no lee ' + k);
      });
  });

  test('la fila recortada del celular', () => {
    const sql = leer('base/20261002_panel_registros.sql');
    ["'menor'", "'documento_imposible'", "'cedula_repetida'"].forEach(k => {
      assert.ok(sql.includes(k), 'panel_registros no manda ' + k);
      assert.ok(FUENTE.includes(k), 'el módulo no lee ' + k);
    });
  });

  test('los campos del formulario son los de app/cuenta.js', () => {
    const ids = require('../app/cuenta.js').CAMPOS.map(c => c.id);
    ['documento', 'tipo_doc', 'expedicion', 'celular', 'celular2', 'ref1_celular', 'ref2_celular'].forEach(k => {
      assert.ok(ids.includes(k), 'el formulario ya no tiene ' + k);
      assert.ok(FUENTE.includes("'" + k + "'") || FUENTE.includes("'ref' + i + '_celular'"), 'el módulo no lee ' + k);
    });
  });

  test('los celulares de la cartera son los que mira el puente', () => {
    const puente = leer('app/puente.js');
    assert.match(puente, /s\.telefono, s && s\.telefono2, s && s\.whatsappNumero/);
    ["'telefono2'", "'whatsappNumero'"].forEach(k => assert.ok(FUENTE.includes(k)));
  });
});

describe('regla 1: las fotos', () => {
  const buena = { ancho: 900, alto: 568, bytes: 73000, nitidez: 200, brillo: 160, saturados: 0.01 };
  const buenaSelfie = { ancho: 405, alto: 720, bytes: 60000, nitidez: 120, brillo: 140, saturados: 0 };
  const fotos = extra => Object.assign({ frente: buena, reverso: buena, selfie: buenaSelfie }, extra);

  test('fotos bien: nada para mirar y la regla corrió', () => {
    const res = R.revisarRegistro(registro(), { fotos: fotos(), hoy: HOY });
    assert.deepEqual(de(res, 'fotos'), []);
    assert.ok(res.reglas_corridas.includes('fotos'));
  });

  test('borrosa: dice cuál, cuánto midió y el mínimo', () => {
    const res = R.revisarRegistro(registro(), { fotos: fotos({ frente: Object.assign({}, buena, { nitidez: 12.4 }) }), hoy: HOY });
    const it = de(res, 'fotos')[0];
    assert.equal(it.clave, 'foto_borrosa_frente');
    assert.equal(it.texto, 'La foto del frente de la cédula está borrosa (nitidez 12, mínimo 15)');   // 15 desde el 2-oct-2026 (noche): otra medida
  });

  test('la selfie tiene su propio mínimo', () => {
    const r1 = R.revisarRegistro(registro(), { fotos: fotos({ selfie: Object.assign({}, buenaSelfie, { nitidez: 20 }) }) });
    assert.deepEqual(de(r1, 'fotos'), [], '20 es nítida para una selfie');
    const r2 = R.revisarRegistro(registro(), { fotos: fotos({ selfie: Object.assign({}, buenaSelfie, { nitidez: 9 }) }) });
    assert.deepEqual(claves(r2), ['foto_borrosa_selfie']);
  });

  test('oscura, quemada, con reflejo y chica', () => {
    const res = R.revisarRegistro(registro(), { fotos: {
      frente: Object.assign({}, buena, { brillo: 30 }),
      reverso: Object.assign({}, buena, { brillo: 245, saturados: 0.6 }),
      selfie: Object.assign({}, buenaSelfie, { ancho: 200, alto: 260 })
    } });
    assert.deepEqual(claves(res).sort(), ['foto_chica_selfie', 'foto_oscura_frente', 'foto_quemada_reverso']);
    /* La quemada no se cuenta dos veces como reflejo. */
    const r2 = R.revisarRegistro(registro(), { fotos: fotos({ frente: Object.assign({}, buena, { saturados: 0.4 }) }) });
    assert.deepEqual(claves(r2), ['foto_reflejo_frente']);
    assert.match(r2.para_mirar[0].texto, /40%/);
  });

  test('acepta también los nombres de archivo de la base (cedula_frente…)', () => {
    const res = R.revisarRegistro(registro(), { fotos: { cedula_frente: Object.assign({}, buena, { nitidez: 3 }) } });
    assert.deepEqual(claves(res), ['foto_borrosa_frente']);
  });

  test('sin medir: no adivina, lo dice', () => {
    const r1 = R.revisarRegistro(registro(), { hoy: HOY });
    assert.ok(sinDatos(r1).includes('fotos'));
    assert.match(r1.reglas_sin_datos.find(x => x.clave === 'fotos').texto, /computador/);
    const r2 = R.revisarRegistro(registro(), { fotos: { frente: null, reverso: null, selfie: null } });
    assert.match(r2.reglas_sin_datos.find(x => x.clave === 'fotos').texto, /No hay fotos/);
    const r3 = R.revisarRegistro(registro(), { fotos: { selfie: buenaSelfie } });
    assert.ok(neutros(r3).includes('fotos_incompletas'));
  });
});

describe('la nitidez: el laplaciano sobre imágenes de mentira', () => {
  test('un tablero 0/255 da exactamente 1020²; un gris liso y un degradado, cero', () => {
    const w = 10, h = 10, tablero = new Uint8Array(w * h), liso = new Uint8Array(w * h).fill(128), rampa = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { tablero[y * w + x] = (x + y) % 2 ? 255 : 0; rampa[y * w + x] = x * 20; }
    assert.equal(R.varianzaLaplaciano(tablero, w, h), 1020 * 1020);
    assert.equal(R.varianzaLaplaciano(liso, w, h), 0);
    assert.equal(R.varianzaLaplaciano(rampa, w, h), 0, 'un degradado parejo no es nitidez');
    assert.equal(R.varianzaLaplaciano(liso, 2, 2), 0, 'sin interior no hay nada que medir');
  });

  test('el recorte mide solo su zona', () => {
    const w = 20, h = 20, g = new Uint8Array(w * h).fill(100);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) g[y * w + x] = (x + y) % 2 ? 255 : 0;
    assert.ok(R.varianzaLaplaciano(g, w, h, { x: 0, y: 0, ancho: 10, alto: 10 }) > 100000);
    assert.equal(R.varianzaLaplaciano(g, w, h, { x: 11, y: 11, ancho: 9, alto: 9 }), 0);
  });

  const W = 900, H = 568, MIN = R.UMBRALES.NITIDEZ_MIN;
  const nitida = tarjeta(W, H, 140);

  test('la cédula nítida pasa; movida no, ni con el grano de la poca luz encima', () => {
    const n = R.medirFoto(nitida, W, H, { tipo: 'documento' });
    assert.ok(n.nitidez >= MIN.documento * 4, 'nítida midió ' + n.nitidez);
    assert.deepEqual(n.medida, { ancho: 640, alto: 404 }, 'se mide siempre a 640 de lado mayor');
    const movida = R.medirFoto(caja(nitida, W, H, 3), W, H, { tipo: 'documento' });
    assert.ok(movida.nitidez < MIN.documento, 'movida midió ' + movida.nitidez);
    const conGrano = R.medirFoto(ruido(caja(nitida, W, H, 3), 4, 4), W, H, { tipo: 'documento' });
    assert.ok(conGrano.nitidez < MIN.documento, 'el ruido no rescata una foto movida: midió ' + conGrano.nitidez);
    /* Y el desenfoque leve, con el que la letra se sigue leyendo, pasa. */
    assert.ok(R.medirFoto(caja(nitida, W, H, 1), W, H, { tipo: 'documento' }).nitidez >= MIN.documento);
  });

  test('sin el suavizado, el grano solo se haría pasar por nitidez', () => {
    const liso = new Float64Array(640 * 404).fill(128);
    const grano = ruido(liso, 5, 1);
    assert.ok(R.varianzaLaplaciano(grano, 640, 404) > 100, 'el laplaciano crudo ve el grano');
    assert.ok(R.nitidezDeGris(grano, 640, 404) < MIN.selfie, 'con el suavizado, el grano casi no cuenta');
  });

  test('la selfie nítida pasa; movida no', () => {
    const SW = 480, SH = 640, s = selfie(SW, SH);
    assert.ok(R.medirFoto(s, SW, SH, { tipo: 'selfie' }).nitidez >= MIN.selfie * 4);
    assert.ok(R.medirFoto(caja(s, SW, SH, 2), SW, SH, { tipo: 'selfie' }).nitidez < MIN.selfie);
    assert.ok(R.medirFoto(ruido(caja(s, SW, SH, 3), 4, 4), SW, SH, { tipo: 'selfie' }).nitidez < MIN.selfie);
  });

  test('lo medido entra derecho a la regla', () => {
    const fr = R.medirFoto(caja(nitida, W, H, 3), W, H, { tipo: 'documento', bytes: 70000 });
    const res = R.revisarRegistro(registro(), { fotos: { frente: fr } });
    assert.deepEqual(claves(res), ['foto_borrosa_frente']);
    const bien = R.medirFoto(nitida, W, H, { tipo: 'documento' });
    assert.deepEqual(claves(R.revisarRegistro(registro(), { fotos: { frente: bien } })), []);
  });

  test('brillo y reflejo: una foto negra y una quemada', () => {
    const negra = R.medirFoto(new Uint8Array(900 * 568).fill(12), 900, 568, { tipo: 'documento' });
    assert.ok(negra.brillo < R.UMBRALES.BRILLO_MIN.documento);
    assert.equal(negra.nitidez, 0);
    const reflejo = Float64Array.from(nitida);
    for (let y = 0; y < H; y++) for (let x = 0; x < W * 0.4; x++) reflejo[y * W + x] = 255;
    const m = R.medirFoto(reflejo, W, H, { tipo: 'documento' });
    assert.ok(m.saturados > R.UMBRALES.SATURADOS_MAX, 'saturados ' + m.saturados);
  });

  test('grisDeRGBA usa los pesos del lector de la cédula', () => {
    const g = R.grisDeRGBA(new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 0, 255]), 3, 1);
    assert.deepEqual(Array.from(g), [255, 76, 0]);
  });

  test('medirFoto no acepta píxeles que no cuadran con el tamaño', () => {
    assert.equal(R.medirFoto(new Uint8Array(10), 900, 568), null);
    assert.equal(R.medirFoto(null, 1, 1), null);
    assert.equal(R.medirFoto(new Uint8Array(4), 'x', 2), null);
  });

  test('bytesDeFoto tiene la misma reja que fotoSegura', () => {
    assert.equal(R.bytesDeFoto('data:image/jpeg;base64,QUJD'), 3);
    assert.equal(R.bytesDeFoto('data:image/png;base64,QUI='), 2);
    assert.equal(R.bytesDeFoto('data:image/svg+xml;base64,PHN2Zz4='), null, 'svg puede llevar código');
    assert.equal(R.bytesDeFoto('data:image/jpeg;base64,QUJD" onerror="alert(1)'), null);
    assert.equal(R.bytesDeFoto({}), null);
  });
});

describe('regla 2: el cotejo', () => {
  const cotejo = c => R.revisarRegistro(conCotejo(registro(), c), { hoy: HOY });

  test('no_cuadra por el número: los dos números a la vista, peso fuerte', () => {
    const res = cotejo({ estado: 'no_cuadra', documento: 'cambiado', nombre: 'igual', edad: 'mayor', tipo_doc: 'coherente', nivel: 'app',
      visto: { documento_codigo: '1018447270', documento_escrito: '1018447274' } });
    const it = de(res, 'cotejo')[0];
    assert.equal(it.clave, 'cotejo_documento');
    assert.equal(it.peso, 3);
    assert.match(it.detalle, /decía 1018447270 y quedó escrito 1018447274/);
    assert.match(it.detalle, /teléfono/, 'dice que la lectura la mandó el teléfono');
  });

  test('no_cuadra por el nombre y por el tipo de documento', () => {
    const res = cotejo({ estado: 'no_cuadra', documento: 'igual', nombre: 'otro', tipo_doc: 'incoherente', nivel: 'foto',
      visto: { nombre_codigo: 'ANA RUIZ', nombre_escrito: 'PEDRO GOMEZ', tipo_doc_escrito: 'Pasaporte' } });
    assert.deepEqual(de(res, 'cotejo').map(x => x.clave), ['cotejo_nombre', 'cotejo_tipo_doc']);
    assert.match(de(res, 'cotejo')[1].texto, /«Pasaporte»/);
    assert.match(de(res, 'cotejo')[0].detalle, /foto guardada/);
  });

  test('la fila del celular: no_cuadra sin detalle dice que el detalle está en el computador', () => {
    const fila = { id: 9, nombre: 'X', cedula: '1018447274', telefono: '3001112233', creado_en: '2026-09-30T15:00:00Z',
      cotejo: { estado: 'no_cuadra', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false } };
    const res = R.revisarRegistro(fila, { hoy: HOY, donde: 'celular' });
    const it = de(res, 'cotejo')[0];
    assert.equal(it.clave, 'cotejo_no_cuadra');
    assert.match(it.detalle, /computador/);
  });

  test('retocado e intacto son notas neutras, nunca para mirar', () => {
    for (const estado of ['retocado', 'intacto']) {
      const res = cotejo({ estado, nivel: 'app' });
      assert.deepEqual(de(res, 'cotejo'), []);
      assert.ok(neutros(res).includes('cotejo_' + estado));
    }
  });

  test('el de la foto manda sobre el del registro, y uno recién hecho sobre los dos', () => {
    const r = conHuella(registro(), {
      cotejo: { estado: 'no_cuadra', documento: 'cambiado', visto: { documento_codigo: '1', documento_escrito: '2' } },
      cotejo_foto: { estado: 'intacto', nivel: 'foto' }
    });
    assert.deepEqual(de(R.revisarRegistro(r, {}), 'cotejo'), []);
    const fresco = { estado: 'no_cuadra', nombre: 'otro', nivel: 'foto', visto: {} };
    assert.deepEqual(de(R.revisarRegistro(r, { cotejo: fresco }), 'cotejo').map(x => x.clave), ['cotejo_nombre']);
  });

  test('sin cotejo guardado: no adivina', () => {
    const r = Object.assign({}, registro(), { huella: null });
    assert.ok(sinDatos(R.revisarRegistro(r, {})).includes('cotejo'));
    assert.ok(sinDatos(cotejo({ estado: 'algo_nuevo' })).includes('cotejo'));
  });
});

describe('LA INVARIANTE: sin_codigo es neutro, nunca una sospecha', () => {
  const sinCodigo = { estado: 'sin_codigo', nota: 'no llego lectura del codigo de barras; NO significa que escribiera a mano', regla: '2026-09-22' };

  test('un registro limpio con sin_codigo queda en «Sin nada que mirar»', () => {
    const res = R.revisarRegistro(conCotejo(registro(), sinCodigo), { otros: [otro()], cartera: { socios: [] }, hoy: HOY });
    assert.deepEqual(res.para_mirar, []);
    assert.equal(res.resumen.estado, 'sin_nada');
    assert.equal(res.resumen.titulo, 'Sin nada que mirar');
    assert.match(res.resumen.frase, /^Las reglas no encontraron nada\./);
    const nota = res.neutros.find(x => x.clave === 'cotejo_sin_codigo');
    assert.match(nota.texto, /No quiere decir que escribiera a mano/);
  });

  test('ni acompañado de otras cosas para mirar, ni en el celular, ni con el cotejo «que falló»', () => {
    const fallido = { estado: 'sin_codigo', nivel: 'app', nota: 'el cotejo fallo: algo' };
    for (const c of [sinCodigo, fallido, { estado: 'sin_codigo', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false }]) {
      const conProblemas = conDatos(conCotejo(registro(), c), { ref1_celular: '3001112233', expedicion: 'mañana' });
      for (const donde of ['computador', 'celular']) {
        const res = R.revisarRegistro(conProblemas, { hoy: HOY, donde, otros: [] });
        assert.ok(res.para_mirar.length > 0);
        assert.deepEqual(de(res, 'cotejo'), [], 'sin_codigo salió para mirar');
        assert.ok(!res.para_mirar.some(x => /c[oó]digo de barras/i.test(x.texto) && x.regla === 'cotejo'));
      }
    }
    const fila = { id: 1, cedula: '1018447274', telefono: '3001112233', cotejo: { estado: 'sin_codigo' } };
    assert.deepEqual(de(R.revisarRegistro(fila, { donde: 'celular' }), 'cotejo'), []);
  });
});

describe('regla 3: la edad', () => {
  test('el cotejo dice MENOR: fuerte, con los años', () => {
    const res = R.revisarRegistro(conCotejo(registro(), { estado: 'no_cuadra', edad: 'MENOR', visto: { anos: 16, nacimiento: '2010-05-14' } }), { hoy: HOY });
    const it = res.para_mirar[0];
    assert.equal(it.clave, 'menor_de_edad');
    assert.equal(it.peso, 3);
    assert.match(it.texto, /\(16 años\)/);
    assert.match(it.detalle, /1504/);
    assert.deepEqual(de(res, 'cotejo'), [], 'la edad no se cuenta dos veces como «no cuadra»');
  });

  test('en la fila del celular (menor: true) también', () => {
    const fila = { id: 1, cedula: '1018447274', telefono: '3001112233', cotejo: { estado: 'no_cuadra', menor: true } };
    assert.ok(claves(R.revisarRegistro(fila, { donde: 'celular' })).includes('menor_de_edad'));
  });

  test('con el nacimiento del código y la fecha de hoy se calcula, también si el cotejo no lo dijo', () => {
    const r = conHuella(registro(), { cotejo: null, cedula_leida: { documento: '1018447274', nacimiento: '2009-01-10' } });
    assert.deepEqual(claves(R.revisarRegistro(r, { hoy: HOY })).filter(k => k.startsWith('menor')), ['menor_de_edad']);
    /* Cumplió 18 ayer: ya no. */
    const r2 = conHuella(registro(), { cotejo: null, cedula_leida: { nacimiento: '2008-10-01' } });
    assert.deepEqual(de(R.revisarRegistro(r2, { hoy: HOY }), 'edad'), []);
  });

  test('menor al registrarse, mayor hoy: se mira, más suave', () => {
    const r = conCotejo(registro(), { estado: 'no_cuadra', edad: 'MENOR', visto: { anos: 17, nacimiento: '2008-09-01' } });
    const it = de(R.revisarRegistro(r, { hoy: HOY }), 'edad')[0];
    assert.equal(it.clave, 'menor_al_registrarse');
    assert.equal(it.peso, 2);
  });

  test('mayor de edad: nada', () => {
    assert.deepEqual(de(R.revisarRegistro(registro(), { hoy: HOY }), 'edad'), []);
    assert.ok(R.revisarRegistro(registro(), { hoy: HOY }).reglas_corridas.includes('edad'));
  });

  test('sin nacimiento, o sin la fecha de hoy: lo dice', () => {
    const sinNada = conHuella(registro(), { cotejo: { estado: 'sin_codigo' }, cedula_leida: null });
    assert.match(R.revisarRegistro(sinNada, { hoy: HOY }).reglas_sin_datos.find(x => x.clave === 'edad').texto, /Sin fecha de nacimiento/);
    const sinHoy = conHuella(registro(), { cotejo: null });
    assert.match(R.revisarRegistro(sinHoy, {}).reglas_sin_datos.find(x => x.clave === 'edad').texto, /fecha de hoy/);
  });

  test('la fecha de nacimiento escrita (cuando play/ la pida) se coteja con la del código', () => {
    const r = conDatos(registro(), { nacimiento: '1991-05-14' });
    assert.ok(claves(R.revisarRegistro(r, { hoy: HOY })).includes('nacimiento_distinto'));
    const menor = conDatos(conHuella(registro(), { cotejo: null, cedula_leida: null }), { nacimiento: '2012-01-01' });
    assert.ok(claves(R.revisarRegistro(menor, { hoy: HOY })).includes('menor_declarado'));
  });
});

describe('regla 4: la cédula repetida', () => {
  test('en otro registro con otro celular: fuerte, nombrado por la fecha y no por el nombre', () => {
    const res = R.revisarRegistro(registro(), { otros: [otro({ cedula: '1.018.447.274', datos: {} })], hoy: HOY });
    const it = de(res, 'cedula')[0];
    assert.equal(it.clave, 'cedula_en_otro_registro');
    assert.equal(it.peso, 3);
    assert.equal(it.texto, 'La misma cédula está en el registro del 28-sep, con otro celular');
    assert.ok(!textos(res).some(t => /Pedro|Pérez/.test(t)), 'repitió el nombre de otra persona');
  });

  test('la fecha es la de Colombia, y dice si ya se atendió o descartó', () => {
    /* 1-oct 02:00 UTC es todavía el 30-sep en Bogotá. */
    const res = R.revisarRegistro(registro(), { otros: [otro({ cedula: '1018447274', creado_en: '2026-10-01T02:00:00+00:00', estado: 'descartado' })], hoy: HOY });
    assert.match(de(res, 'cedula')[0].texto, /del 30-sep \(descartado\)/);
  });

  test('misma cédula y mismo celular: es la misma persona, nota neutra', () => {
    const res = R.revisarRegistro(registro(), { otros: [otro({ cedula: '1018447274', telefono: '573001112233', estado: 'atendido' })], hoy: HOY });
    assert.deepEqual(de(res, 'cedula'), []);
    assert.ok(neutros(res).includes('cedula_ya_registrada'));
  });

  test('ya es cliente: con otro celular se mira; con el mismo, se cruza', () => {
    const otroCel = R.revisarRegistro(registro(), { cartera: { socios: [{ numero: 12, cedula: '1018447274', telefono: '3115550000' }] } });
    const it = de(otroCel, 'cedula')[0];
    assert.equal(it.clave, 'cedula_de_cliente');
    assert.match(it.texto, /CL-0012/);
    const mismo = R.revisarRegistro(registro(), { cartera: [{ numero: 3, cedula: '1018447274', telefono2: '300 111 2233' }] });
    assert.deepEqual(de(mismo, 'cedula'), []);
    assert.match(mismo.neutros.find(x => x.clave === 'cedula_ya_cliente').texto, /CL-0003.*Crúzalo/);
    /* Una ficha vieja sin celular no tiene «otro celular»: la cédula manda. */
    const sinCel = R.revisarRegistro(registro(), { cartera: [{ numero: 5, cedula: '1018447274' }] });
    assert.deepEqual(de(sinCel, 'cedula'), []);
    assert.ok(neutros(sinCel).includes('cedula_ya_cliente_sin_celular'));
  });

  test('la bandera de la base, cuando la lista a mano no muestra el otro', () => {
    const r = conCotejo(registro(), { estado: 'intacto', repetida: true, otros_registros: 2, ya_es_socio_con_otro_celular: true });
    const it = de(R.revisarRegistro(r, {}), 'cedula')[0];
    assert.equal(it.clave, 'cedula_repetida_al_registrarse');
    assert.match(it.texto, /2 registros más con otro celular y una ficha de cliente/);   // texto del 2-oct-2026 (noche)
    /* En el celular se llama cedula_repetida. */
    const fila = { id: 1, cedula: '1018447274', telefono: '3001112233', cotejo: { estado: 'intacto', cedula_repetida: true } };
    assert.ok(claves(R.revisarRegistro(fila, { donde: 'celular', otros: [] })).includes('cedula_repetida_al_registrarse'));
    /* Y un cotejo recién hecho en el computador que no trae la bandera no la borra. */
    assert.ok(claves(R.revisarRegistro(r, { cotejo: { estado: 'intacto', nivel: 'foto' } })).includes('cedula_repetida_al_registrarse'));
  });

  test('la cédula de la bandeja distinta de la del formulario', () => {
    const r = conDatos(registro(), { documento: '1018447999' });
    assert.ok(claves(R.revisarRegistro(r, {})).includes('cedula_dos_numeros'));
  });

  test('sin cédula, o sin nada con qué comparar: lo dice', () => {
    const r = Object.assign(conDatos(registro(), { documento: '' }), { cedula: '' });
    assert.match(R.revisarRegistro(r, { otros: [] }).reglas_sin_datos.find(x => x.clave === 'cedula').texto, /no trae número de cédula/);
    const solo = conCotejo(registro(), { estado: 'intacto' });
    assert.ok(sinDatos(R.revisarRegistro(solo, {})).includes('cedula'));
    assert.ok(R.revisarRegistro(solo, { otros: [] }).reglas_corridas.includes('cedula'), 'una bandeja vacía SÍ es con qué comparar');
  });
});

describe('regla 5: el celular', () => {
  test('dice siempre, en palabras, que no sabe si tiene WhatsApp', () => {
    const res = R.revisarRegistro(registro(), { otros: [] });
    const nota = res.neutros.find(x => x.clave === 'whatsapp_desconocido');
    assert.equal(nota.texto, R.AVISO_WHATSAPP);
    assert.match(nota.texto, /no pueden saber si el número tiene WhatsApp/);
  });

  test('forma: un fijo o un número corto se miran; el +57 se perdona', () => {
    assert.ok(claves(R.revisarRegistro(Object.assign(registro(), { telefono: '6014445566' }), {})).includes('celular_forma'));
    assert.ok(claves(R.revisarRegistro(Object.assign(registro(), { telefono: '300111' }), {})).includes('celular_forma'));
    const r57 = Object.assign(conDatos(registro(), { celular: '+57 300 111 2233' }), { telefono: '573001112233' });
    assert.deepEqual(de(R.revisarRegistro(r57, {}), 'celular'), []);
    assert.equal(de(R.revisarRegistro(Object.assign(registro(), { telefono: '', datos: {} }), {}), 'celular')[0].texto, 'El registro no trae celular');
  });

  test('el celular del formulario distinto del de la cuenta, y un segundo celular mal escrito', () => {
    assert.ok(claves(R.revisarRegistro(conDatos(registro(), { celular: '3005550000' }), {})).includes('celular_dos_numeros'));
    assert.ok(claves(R.revisarRegistro(conDatos(registro(), { celular2: '12345' }), {})).includes('celular2_forma'));
  });

  test('el mismo celular en otro registro con otra cédula: se mira', () => {
    const res = R.revisarRegistro(registro(), { otros: [otro({ telefono: '3001112233' })], hoy: HOY });
    const it = de(res, 'celular')[0];
    assert.equal(it.clave, 'celular_en_otro_registro');
    assert.match(it.texto, /el registro del 28-sep, con otra cédula/);
  });

  test('el mismo celular en otro registro sin cédula: nota neutra; con la misma cédula: lo dice la otra regla', () => {
    const sinCed = R.revisarRegistro(registro(), { otros: [otro({ telefono: '3001112233', cedula: '', datos: {} })] });
    assert.deepEqual(de(sinCed, 'celular'), []);
    assert.ok(neutros(sinCed).includes('celular_ya_registrado'));
    const misma = R.revisarRegistro(registro(), { otros: [otro({ telefono: '3001112233', cedula: '1018447274' })] });
    assert.deepEqual(de(misma, 'celular'), []);
  });

  test('el celular de un cliente con otra cédula: se mira, y no se cruza', () => {
    const res = R.revisarRegistro(registro(), { cartera: { socios: [{ numero: 7, cedula: '80111222', whatsappNumero: '3001112233' }] } });
    const it = de(res, 'celular')[0];
    assert.equal(it.clave, 'celular_de_cliente');
    assert.match(it.texto, /CL-0007/);
    assert.match(it.detalle, /no los cruces/);
  });

  test('sin otros registros ni cartera: corrió solo la forma, y lo dice', () => {
    const res = R.revisarRegistro(registro(), {});
    assert.ok(res.reglas_corridas.includes('celular'));
    assert.ok(res.reglas_sin_datos.some(x => x.clave === 'celular' && x.parcial));
  });
});

describe('regla 6: las referencias', () => {
  test('referencias de otros números: nada', () => {
    assert.deepEqual(de(R.revisarRegistro(registro(), { otros: [], cartera: [] }), 'referencias'), []);
  });

  test('una referencia con su propio celular (o su segundo celular)', () => {
    const r = conDatos(registro(), { ref1_celular: '300 111 2233' });
    assert.deepEqual(de(R.revisarRegistro(r, {}), 'referencias').map(x => x.clave), ['ref1_propio']);
    const r2 = conDatos(registro(), { celular2: '3112223344', ref2_celular: '3112223344' });
    assert.deepEqual(de(R.revisarRegistro(r2, {}), 'referencias').map(x => x.clave), ['ref2_propio']);
  });

  test('las dos referencias con el mismo número', () => {
    const r = conDatos(registro(), { ref2_celular: '3104445566' });
    assert.ok(claves(R.revisarRegistro(r, {})).includes('refs_iguales'));
  });

  test('el celular de otro registrado o de un cliente: información, no falta', () => {
    const res = R.revisarRegistro(registro(), {
      otros: [otro({ telefono: '3104445566' })],
      cartera: { socios: [{ numero: 40, cedula: '79000111', telefono: '3157778899' }] },
      hoy: HOY
    });
    /* Desde el 2-oct-2026 (noche) son notas neutras: decían «no es una falta»
       y aun así ponían la tarjeta en ámbar (pruebas/revision-hallazgos-reglas.test.js). */
    const r1 = res.neutros.find(x => x.clave === 'ref1_otro_registrado');
    assert.match(r1.texto, /es el celular de otro registrado \(el registro del 28-sep\)/);
    assert.match(r1.texto, /No es una falta/);
    const r2 = res.neutros.find(x => x.clave === 'ref2_cliente');
    assert.match(r2.texto, /es el de tu cliente CL-0040/);
    assert.deepEqual(res.para_mirar.filter(x => x.regla === 'referencias'), []);
  });

  test('un número que no es celular', () => {
    assert.ok(claves(R.revisarRegistro(conDatos(registro(), { ref1_celular: '12' }), {})).includes('ref1_forma'));
  });

  test('sin formulario (celular, invitación) o sin referencias: lo dice', () => {
    const fila = { id: 1, cedula: '1018447274', telefono: '3001112233' };
    assert.match(R.revisarRegistro(fila, { donde: 'celular' }).reglas_sin_datos.find(x => x.clave === 'referencias').texto, /computador/);
    assert.match(R.revisarRegistro(fila, {}).reglas_sin_datos.find(x => x.clave === 'referencias').texto, /invitación/);
    const sinRefs = conDatos(registro(), { ref1_celular: '', ref2_celular: '' });
    assert.ok(sinDatos(R.revisarRegistro(sinRefs, {})).includes('referencias'));
  });
});

describe('regla 7: la fecha de expedición', () => {
  const exp = (v, extra) => R.revisarRegistro(conDatos(registro(), Object.assign({ expedicion: v }, extra)), { hoy: HOY });

  test('una fecha normal, también escrita día primero: nada', () => {
    assert.deepEqual(de(exp('2010-06-01'), 'expedicion'), []);
    assert.deepEqual(de(exp('01/06/2010'), 'expedicion'), []);
  });

  test('lo que no es una fecha, incluido el 30 de febrero', () => {
    for (const v of ['mañana', '2023-02-30', '2010-13-01', '0001-01-01', '20100601']) {
      assert.deepEqual(de(exp(v), 'expedicion').map(x => x.clave), ['expedicion_no_es_fecha'], v);
    }
  });

  test('una fecha que todavía no llega', () => {
    const it = de(exp('2027-01-15'), 'expedicion')[0];
    assert.equal(it.clave, 'expedicion_futura');
    assert.match(it.texto, /15-ene-2027/);
  });

  test('antes de cumplir 18 (nació el 14-may-1990, cumplió el 14-may-2008)', () => {
    assert.ok(claves(exp('2008-05-13')).includes('expedicion_antes_de_18'));
    assert.ok(!claves(exp('2008-05-14')).includes('expedicion_antes_de_18'));
    /* Con pasaporte no aplica: se saca antes de los 18. */
    assert.ok(!claves(exp('2001-01-01', { tipo_doc: 'Pasaporte' })).includes('expedicion_antes_de_18'));
    /* Sin nacimiento no se puede saber. */
    const sinNac = conHuella(conDatos(registro(), { expedicion: '2001-01-01' }), { cotejo: null, cedula_leida: null });
    assert.ok(!claves(R.revisarRegistro(sinNac, { hoy: HOY })).includes('expedicion_antes_de_18'));
  });

  test('sin fecha escrita, sin formulario o sin la fecha de hoy: lo dice', () => {
    assert.ok(sinDatos(exp('')).includes('expedicion'));
    assert.match(R.revisarRegistro({ id: 1, telefono: '3001112233' }, { donde: 'celular' })
      .reglas_sin_datos.find(x => x.clave === 'expedicion').texto, /computador/);
    const sinHoy = R.revisarRegistro(registro(), {});
    assert.ok(sinHoy.reglas_sin_datos.some(x => x.clave === 'expedicion' && x.parcial));
  });
});

describe('regla 8: la red y el aparato', () => {
  const REDUCIDO = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const ESPECIFICO = 'Mozilla/5.0 (Linux; Android 13; SM-A155M Build/TP1A.220624.014; wv) AppleWebKit/537.36 Chrome/129.0.6668.100 Mobile Safari/537.36';
  const desde = (n, ip, aparato, dia) => Array.from({ length: n }, (_, i) => otro({
    id: 300 + i, cedula: String(60000000 + i), telefono: '31000000' + String(10 + i),
    creado_en: dia || '2026-09-29T12:00:00Z', huella: { ip, aparato }
  }));

  test('dos más desde la misma red (una familia, el operador): nada', () => {
    const res = R.revisarRegistro(registro(), { otros: desde(2, '181.50.1.2', REDUCIDO), hoy: HOY });
    assert.deepEqual(de(res, 'red'), []);
    assert.ok(res.reglas_corridas.includes('red'));
  });

  test('tres más en la semana: se mira, sin repetir la IP', () => {
    const res = R.revisarRegistro(registro(), { otros: desde(3, '181.50.1.2', REDUCIDO), hoy: HOY });
    const it = de(res, 'red')[0];
    assert.equal(it.clave, 'misma_red');
    assert.match(it.texto, /que 3 registros más en 7 días/);
    assert.ok(!textos(res).some(t => t.includes('181.50')), 'la IP no viaja en los textos');
  });

  test('fuera de la semana no cuenta', () => {
    const viejos = desde(5, '181.50.1.2', REDUCIDO, '2026-09-01T12:00:00Z');
    assert.deepEqual(de(R.revisarRegistro(registro(), { otros: viejos, hoy: HOY }), 'red'), []);
  });

  test('el aparato «Android 10; K» lo dicen miles de teléfonos: solo no cuenta nunca', () => {
    const otrasRedes = desde(6, '0', REDUCIDO).map((o, i) => Object.assign(o, { huella: { ip: '190.0.0.' + i, aparato: REDUCIDO } }));
    assert.deepEqual(de(R.revisarRegistro(registro(), { otros: otrasRedes, hoy: HOY }), 'red'), []);
  });

  test('la misma red y el mismo aparato con modelo: desde dos más', () => {
    const r = conHuella(registro(), { aparato: ESPECIFICO });
    assert.deepEqual(de(R.revisarRegistro(r, { otros: desde(1, '181.50.1.2', ESPECIFICO) }), 'red'), []);
    const it = de(R.revisarRegistro(r, { otros: desde(2, '181.50.1.2', ESPECIFICO), hoy: HOY }), 'red')[0];
    assert.equal(it.clave, 'red_y_aparato');
    assert.equal(it.peso, 1);   // 1 desde el 2-oct-2026 (noche): «Build/» lo dicen igual los teléfonos del mismo modelo
  });

  test('el mismo aparato con modelo desde redes distintas: desde tres más', () => {
    const r = conHuella(registro(), { aparato: ESPECIFICO });
    const otros = desde(3, '0', ESPECIFICO).map((o, i) => Object.assign(o, { huella: { ip: '190.0.0.' + i, aparato: ESPECIFICO } }));
    assert.deepEqual(de(R.revisarRegistro(r, { otros, hoy: HOY }), 'red').map(x => x.clave), ['mismo_aparato']);
  });

  test('sin huella (no subió fotos) o en el celular: lo dice', () => {
    const r = Object.assign({}, registro(), { huella: null });
    assert.match(R.revisarRegistro(r, { otros: [] }).reglas_sin_datos.find(x => x.clave === 'red').texto, /8-sep-2026/);
    assert.match(R.revisarRegistro({ id: 1 }, { otros: [], donde: 'celular' }).reglas_sin_datos.find(x => x.clave === 'red').texto, /computador/);
  });
});

describe('el rostro: ayuda, nunca veredicto, y nunca viaja', () => {
  test('poco parecido: se mira, y va marcado biométrico', () => {
    const res = R.revisarRegistro(registro(), { rostro: { distancia: 0.72 } });
    const it = de(res, 'rostro')[0];
    assert.equal(it.clave, 'rostro_poco_parecido');
    assert.equal(it.biometrico, true);
    assert.match(it.texto, /distancia 0,72/);
    assert.match(it.detalle, /no un veredicto/);
  });

  test('parecido: nota neutra que no dice «es la misma persona»', () => {
    const res = R.revisarRegistro(registro(), { rostro: { distancia: 0.41 } });
    assert.deepEqual(de(res, 'rostro'), []);
    const nota = res.neutros.find(x => x.clave === 'rostro_sin_diferencia');
    assert.match(nota.texto, /No dice que sea la misma persona/);
  });

  test('sin cara en la selfie se mira; sin cara en la cédula, no', () => {
    assert.deepEqual(claves(R.revisarRegistro(registro(), { rostro: { sin_rostro: 'selfie' } })), ['rostro_sin_cara']);
    assert.deepEqual(claves(R.revisarRegistro(registro(), { rostro: { sin_rostro: 'cedula' } })), []);
  });

  test('sinBiometria quita todo lo del rostro y no toca la original', () => {
    const res = R.revisarRegistro(conDatos(registro(), { ref1_celular: '3001112233' }), { rostro: { distancia: 0.9 }, otros: [] });
    const antes = JSON.stringify(res);
    const limpia = R.sinBiometria(res);
    assert.equal(JSON.stringify(res), antes);
    assert.ok(!JSON.stringify(limpia).includes('rostro'));
    assert.ok(!limpia.para_mirar.some(x => x.biometrico) && !limpia.neutros.some(x => x.biometrico));
    assert.deepEqual(claves(limpia), ['ref1_propio']);
    assert.equal(limpia.resumen.frase, 'Hay 1 cosa para mirar.');
  });
});

describe('la bandeja entera', () => {
  test('cada uno contra los demás, y nadie contra sí mismo', () => {
    const a = registro({ id: 1 });
    const b = otro({ id: 2, cedula: '1018447274', telefono: '3125550000' });
    const c = otro({ id: 3, cedula: '41222333', telefono: '3134440000' });
    const res = R.revisarLista([a, b, c], { hoy: HOY, porId: { 1: { rostro: { distancia: 0.8 } } } });
    assert.deepEqual(res.map(x => x.id), ['1', '2', '3']);
    assert.ok(claves(res[0].resultado).includes('cedula_en_otro_registro'));
    assert.ok(claves(res[1].resultado).includes('cedula_en_otro_registro'));
    assert.deepEqual(de(res[2].resultado, 'cedula'), []);
    assert.ok(claves(res[0].resultado).includes('rostro_poco_parecido'), 'porId llega a su registro');
    assert.ok(!claves(res[1].resultado).includes('rostro_poco_parecido'), 'y solo al suyo');
  });

  test('«ademas»: los atendidos y descartados se comparan pero no se revisan', () => {
    const viejo = otro({ id: 50, cedula: '1018447274', telefono: '3125550000', estado: 'descartado' });
    const res = R.revisarLista([registro({ id: 1 })], { hoy: HOY, ademas: [viejo] });
    assert.equal(res.length, 1, 'el descartado no sale en la lista revisada');
    assert.match(res[0].resultado.para_mirar.find(x => x.clave === 'cedula_en_otro_registro').texto, /\(descartado\)/);
  });

  test('revisarRegistro descarta la fila propia aunque venga en otros, por identidad o por id', () => {
    const a = registro();
    assert.deepEqual(de(R.revisarRegistro(a, { otros: [a, registro()] }), 'cedula'), []);
  });

  test('la bandeja del celular (panel_registros) revisa lo que puede y dice qué no', () => {
    const filas = [
      { id: 1, nombre: 'A', cedula: '1018447274', telefono: '3001112233', creado_en: '2026-09-30T15:00:00Z', origen: 'abierto', ciudad: 'Bogotá', barrio: 'Suba',
        cotejo: { estado: 'sin_codigo', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false } },
      { id: 2, nombre: 'B', cedula: '1018447274', telefono: '3125550000', creado_en: '2026-09-29T15:00:00Z', cotejo: null }
    ];
    const r = R.revisarLista(filas, { hoy: HOY, donde: 'celular' })[0].resultado;
    assert.deepEqual(r.reglas_corridas, ['cotejo', 'cedula', 'celular']);
    ['referencias', 'expedicion', 'fotos', 'rostro', 'red'].forEach(k =>
      assert.match(r.reglas_sin_datos.find(x => x.clave === k).texto, /computador/, k));
    assert.ok(claves(r).includes('cedula_en_otro_registro'));
  });
});

/* ---------------------------------------------------------------------------
 * LAS INVARIANTES, sobre una batería que pasa por todas las reglas.
 * ------------------------------------------------------------------------- */
function bateria() {
  const malo = '<img src=x onerror="alert(1)">';
  const base = registro();
  const casos = [
    [base, { otros: [otro()], cartera: { socios: [] }, hoy: HOY }],
    [conCotejo(base, { estado: 'no_cuadra', documento: 'cambiado', nombre: 'otro', edad: 'MENOR', tipo_doc: 'incoherente', repetida: true,
      visto: { documento_codigo: '1' + malo, documento_escrito: '2', nombre_codigo: malo, nombre_escrito: 'A"B', tipo_doc_escrito: malo, anos: 15, nacimiento: '2011-01-01' } }),
      { otros: [otro({ cedula: '1018447274' })], hoy: HOY, rostro: { distancia: 0.95 },
        fotos: { frente: { ancho: 100, alto: 60, nitidez: 1, brillo: 10, saturados: 0.9 }, selfie: { ancho: 300, alto: 200, nitidez: 1, brillo: 250 } } }],
    [conDatos(base, { expedicion: malo, ref1_celular: malo, ref2_celular: '3001112233', celular2: malo, tipo_doc: malo }), { otros: [], hoy: HOY }],
    [conDatos(base, { expedicion: '2999-01-01', nacimiento: '2015-02-02' }), { hoy: HOY, donde: 'celular' }],
    [{ id: 1, cedula: '1018447274', telefono: '3001112233', cotejo: { estado: 'no_cuadra', menor: true, documento_imposible: true, cedula_repetida: true } },
      { otros: [], hoy: HOY, donde: 'celular' }],
    [conCotejo(base, { estado: 'sin_codigo' }), { otros: desdeRed(), hoy: HOY, rostro: { distancia: 0.2 } }]
  ];
  return casos;
}
function desdeRed() {
  return [1, 2, 3, 4].map(i => otro({ id: 900 + i, cedula: String(70000000 + i), telefono: '3200000' + String(100 + i),
    creado_en: '2026-09-30T10:00:00Z', huella: { ip: '181.50.1.2', aparato: 'x' } }));
}

describe('LAS INVARIANTES', () => {
  test('ningún texto dice verificado, aprobado, confiable ni lleva palomito', () => {
    for (const [r, c] of bateria()) {
      const res = R.revisarRegistro(r, c);
      for (const t of textos(res)) {
        assert.doesNotMatch(t, /verific|aprobad|confiable|coincide|✓|✔|✅|☑/i, 'dice: ' + t);
      }
      assert.ok(res.para_mirar.length || res.resumen.frase.startsWith('Las reglas no encontraron nada.'));
      assert.ok(!res.reglas_sin_datos.some(x => x.fallo), 'una regla falló: ' + JSON.stringify(res.reglas_sin_datos));
    }
  });

  /* Sin estos caracteres no se arma ni una etiqueta ni se sale de un
     atributo: lo que quede («img src=x onerror=…») es texto y se lee como
     texto. Y quien pinte escapa igual. */
  test('nada de marcado vuelve en los textos (lo de la calle pasa por eco)', () => {
    for (const [r, c] of bateria()) {
      for (const t of textos(R.revisarRegistro(r, c))) {
        assert.doesNotMatch(t, /[<>"'`&\\]/, 'texto con marcado: ' + t);
      }
    }
  });

  test('no toca lo que recibe: corre sobre objetos congelados y los deja iguales', () => {
    const congelar = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(congelar); } return o; };
    for (const [r, c] of bateria()) {
      const antes = JSON.stringify([r, c]);
      congelar(r); congelar(c);
      assert.doesNotThrow(() => R.revisarRegistro(r, c));
      assert.doesNotThrow(() => R.revisarLista([r].concat(c.otros || []), c));
      assert.equal(JSON.stringify([r, c]), antes);
    }
  });

  test('cualquier cosa que llegue de la calle: nada revienta y ninguna regla falla', () => {
    const raros = [
      null, undefined, 42, 'texto', [], [1, 2], true,
      { datos: 'x', huella: [], cotejo: 'no' },
      { datos: [], huella: 'ip', telefono: { a: 1 }, cedula: ['1'], creado_en: 12, id: {} },
      JSON.parse('{"id":"__proto__","__proto__":{"x":1},"constructor":"y","datos":{"__proto__":{"ref1_celular":"3001112233"},"constructor":{"a":1},"ref1_celular":{"a":1},"expedicion":["2010-01-01"]}}'),
      { telefono: '3'.repeat(100000), cedula: '9'.repeat(5000), datos: { expedicion: 'x'.repeat(1000000) },
        huella: { ip: 'a,'.repeat(1000), aparato: 'Build/'.repeat(1000), cotejo: { estado: 'no_cuadra', visto: 'x', edad: 99999 } } },
      { huella: { cotejo: { estado: 'no_cuadra', edad: -5, visto: { anos: 'x', nacimiento: '2010-99-99' } }, cedula_leida: 'x' } }
    ];
    const contextos = [
      undefined, null, 'x', [], { otros: 'no', cartera: { socios: 'x' }, fotos: 'x', rostro: [], cotejo: 5, hoy: {} },
      { otros: [null, 1, 'x', [], {}], cartera: [null, 1, { numero: 'x' }, { numero: -3, telefono: {} }], hoy: '2026-13-45',
        fotos: { frente: 'x', reverso: { ancho: 'NaN', nitidez: Infinity }, selfie: [] }, rostro: { distancia: 'x', sin_rostro: {} } }
    ];
    for (const r of raros) {
      for (const c of contextos) {
        const res = R.revisarRegistro(r, c);
        assert.ok(!res.reglas_sin_datos.some(x => x.fallo), 'una regla falló: ' + JSON.stringify(res.reglas_sin_datos.filter(x => x.fallo)));
        for (const t of textos(res)) assert.ok(t.length < 2000, 'un texto sin tope: ' + t.slice(0, 80));
      }
    }
    assert.deepEqual(R.revisarLista('no', null), []);
    assert.equal(Object.prototype.x, undefined, 'nada contaminó Object.prototype');
  });

  test('las claves de «para mirar» son únicas dentro de una revisión', () => {
    for (const [r, c] of bateria()) {
      const ks = claves(R.revisarRegistro(r, c));
      assert.equal(new Set(ks).size, ks.length, ks.join(','));
    }
  });

  test('lo más grave arriba', () => {
    for (const [r, c] of bateria()) {
      const p = R.revisarRegistro(r, c).para_mirar.map(x => x.peso);
      assert.deepEqual(p, p.slice().sort((a, b) => b - a));
    }
  });
});
