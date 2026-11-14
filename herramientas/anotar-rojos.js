'use strict';
/* =============================================================================
 * LOS ROJOS DE GITHUB, A LA VISTA SIN INICIAR SESIÓN — 13-nov-2026 (v146)
 *
 *   node herramientas/anotar-rojos.js pruebas.tap
 *
 * Por qué existe: el 13-nov la v145 pasó entera en el computador de Joan
 * (6.857 pruebas, también en UTC, en inglés y en una carpeta que distingue
 * mayúsculas) y salió roja en GitHub. El porqué no se pudo leer: los registros
 * de un trabajo de Actions solo los ve quien inicia sesión en GitHub, y una
 * sesión de Claude no entra con la cuenta de Joan (ni debe). Las ANOTACIONES
 * de un trabajo sí se leen sin sesión, por la API pública:
 *
 *   https://api.github.com/repos/<dueño>/<repo>/check-runs/<id>/annotations
 *
 * Esto lee el TAP de la corrida (vigilar.yml lo escribe además de la salida de
 * siempre) y escribe cada prueba roja como una línea `::error`, que GitHub
 * convierte en anotación con su archivo, su línea y el mensaje del assert.
 *
 * GitHub guarda hasta 10 anotaciones de error por paso: van las primeras 9 y
 * una décima con la cuenta total, para no callar el resto. Las «N subtests
 * failed» de los describe que solo envuelven a sus pruebas rojas no se
 * anotan: repetirían lo mismo sin decir nada.
 *
 * Nunca falla: el paso de las pruebas ya dejó el trabajo en rojo.
 * ===========================================================================*/
const fs = require('fs');

const TOPE = 10;

/* Lo que GitHub pide escapar en un comando de flujo de trabajo. */
function escDato(s) { return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A'); }
function escProp(s) { return escDato(s).replace(/:/g, '%3A').replace(/,/g, '%2C'); }

/* Un valor YAML de una línea del TAP de node: 'entre comillas' (con '' por
   comilla y \\ por barra en las rutas de Windows), o tal cual. */
function valor(v) {
  const t = String(v || '').trim();
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") return t.slice(1, -1).replace(/''/g, "'").replace(/\\\\/g, '\\');
  return t;
}

/* 'C:\Users\…\pruebas\x.test.js:12:3' o '/home/runner/…/pruebas/x.test.js:12:3'
   → { archivo: 'pruebas/x.test.js', linea: 12 }. Fuera de pruebas/, la ruta
   que venga, con barras normales. */
function lugar(loc) {
  const m = /^(.*?):(\d+)(?::\d+)?$/.exec(String(loc || '').trim());
  if (!m) return null;
  const ruta = m[1].replace(/\\/g, '/');
  const i = ruta.lastIndexOf('/pruebas/');
  return { archivo: i >= 0 ? ruta.slice(i + 1) : ruta, linea: Number(m[2]) };
}

/* Las pruebas rojas del TAP: [{ nombre, archivo, linea, error }]. */
function rojos(tap) {
  const lineas = String(tap || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\s*)not ok \d+ - (.*)$/.exec(lineas[i]);
    if (!m) continue;
    const sangria = m[1].length;
    const r = { nombre: m[2].trim(), tipo: '', loc: '', error: '' };
    let j = i + 1;
    if (!/^\s*---\s*$/.test(lineas[j] || '')) { out.push(r); continue; }
    for (j = j + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (/^\s*\.\.\.\s*$/.test(l) && l.indexOf('...') <= sangria + 2) break;
      const kv = /^(\s*)(failureType|location|error):\s?(.*)$/.exec(l);
      if (!kv || kv[1].length !== sangria + 2) continue;
      if (kv[2] === 'failureType') r.tipo = valor(kv[3]);
      else if (kv[2] === 'location') r.loc = valor(kv[3]);
      else if (/^\|[-+]?$/.test(kv[3].trim())) {
        /* error: |- con el mensaje en las líneas de abajo, más adentro. */
        const partes = [];
        for (let k = j + 1; k < lineas.length && partes.length < 8; k++) {
          const lk = lineas[k];
          if (lk.trim() && lk.length - lk.trimStart().length <= sangria + 2) break;
          partes.push(lk.trim());
        }
        r.error = partes.join('\n').trim();
      } else r.error = valor(kv[3]);
    }
    i = j;
    if (r.tipo === 'subtestsFailed' || /^\d+ subtests? failed$/.test(r.error)) continue;
    out.push(r);
  }
  return out.map(r => {
    const l = lugar(r.loc);
    return { nombre: r.nombre, archivo: l ? l.archivo : '', linea: l ? l.linea : 0, error: r.error };
  });
}

function anotaciones(tap) {
  const rs = rojos(tap);
  const lineas = rs.slice(0, rs.length > TOPE ? TOPE - 1 : TOPE).map(r => {
    const props = [];
    if (r.archivo) props.push('file=' + escProp(r.archivo));
    if (r.linea) props.push('line=' + r.linea);
    props.push('title=' + escProp(r.nombre.slice(0, 140)));
    return '::error ' + props.join(',') + '::' + escDato((r.error || 'sin mensaje').slice(0, 1500));
  });
  if (rs.length > TOPE) {
    lineas.push('::error title=' + escProp(rs.length + ' pruebas en rojo') + '::' +
      escDato('Arriba van las primeras ' + (TOPE - 1) + '. Las demás: ' +
        rs.slice(TOPE - 1, TOPE + 20).map(r => r.nombre + (r.archivo ? ' (' + r.archivo + ')' : '')).join(' · ')));
  }
  return { rojos: rs, lineas };
}

if (require.main === module) {
  let tap = '';
  try { tap = fs.readFileSync(process.argv[2] || 'pruebas.tap', 'utf8'); }
  catch (e) { console.log('::warning title=Sin TAP::No pude leer ' + escDato(process.argv[2] || 'pruebas.tap') + ': ' + escDato(e.message)); process.exit(0); }
  const a = anotaciones(tap);
  if (!a.lineas.length) console.log('::warning title=Rojo sin prueba roja::El TAP no trae ninguna prueba en rojo: el fallo fue de otra cosa (mira si el TAP quedó cortado).');
  a.lineas.forEach(l => console.log(l));
}

module.exports = { rojos, anotaciones, lugar, valor, escDato, escProp, TOPE };
